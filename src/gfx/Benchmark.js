// 91st — in-game GPU benchmark (Settings → Graphics → Run benchmark, or the console: `bench`). Compares render configurations on the
// player's own machine in the living city:
//   A  native 150 % (the existing supersampling)   B  native 100 %   C  SGSR 90 %   D  SGSR 85 %   E  SGSR 80 %
// Every configuration sees the same thing: the same repeatable camera flythrough down Galle Road (trees, shop fronts and towers,
// moving traffic and pedestrians) at a fixed speed, the same hour (16:30), forced clear weather, a dry road, the same traffic and
// crowd limits; traffic and pedestrians are cleared, their random generators re-seeded and the street life settled before each
// run, so they start alike (they still move freely — that part of the work is real, not frozen). The streets along the path are
// fully built and pinned before the first run (no streaming during measurement). Dynamic resolution is held at 100 %.
// Per configuration: a warm-up (shader compiles, caches, clocks) and then the measured seconds. Results: frame-time statistics from
// the browser's frame intervals (requestAnimationFrame: capped by the display's refresh rate / vsync — note it when reading FPS),
// GPU time per frame from EXT_disjoint_timer_query_webgl2 (GpuTimer.js: asynchronous, never stalls; "unavailable" when the browser
// hides the extension, disjoint frames dropped), the SGSR pass's own GPU time, draw calls and triangles per frame, internal and
// output resolution. Nothing is estimated: GPU utilisation and VRAM cannot be read from a browser and are not reported.
// Saved settings are never changed (Game.renderOverride); everything is restored afterwards. Esc aborts.
import * as THREE from 'three';
import { GpuTimer } from './GpuTimer.js';
import { gpuInfo } from './GpuInfo.js';
import { RNG } from '../core/rng.js';
import { Settings } from '../core/Settings.js';
import { FightScene, RaceScene, StreamScene } from './BenchScenes.js';
import { setWorkerOverride, poolStats, CPU } from '../core/WorkerPool.js';
import { BUILDS } from '../core/FrameBudget.js';

export const BENCH_CONFIGS = [
  { id: 'A', label: 'Native 150%', mode: 'ss150' },
  { id: 'B', label: 'Native 100%', mode: 'native100' },
  { id: 'C', label: 'SGSR 90% (Quality)', mode: 'sgsr90' },
  { id: 'D', label: 'SGSR 85% (Balanced)', mode: 'sgsr85' },
  { id: 'E', label: 'SGSR 80% (Performance)', mode: 'sgsr80' },
];
// 93rd: the CPU-worker comparison (`bench cpu`, Settings → Graphics → Run CPU benchmark): A = the original main-thread code paths,
// B–E = 2–5 background compute workers. The render mode is the player's own setting throughout; scenario S (StreamScene).
export const CPU_CONFIGS = [
  { id: 'A', label: 'Original (main thread, 0 workers)', workers: 0 },
  { id: 'B', label: '2 CPU workers', workers: 2 },
  { id: 'C', label: '3 CPU workers', workers: 3 },
  { id: 'D', label: '4 CPU workers', workers: 4 },
  { id: 'E', label: '5 CPU workers', workers: 5 },
];
// the flythrough: Galle Road (x = −400) from Kollupitiya north to the Galle Face end, 6–9 m up, then out over the green toward the
// sea. [x, y, z] camera points; the camera looks along the path (ahead + slightly down) with a slow side-to-side sweep.
const PATH = [[-404, 7, 330], [-404, 6.5, 230], [-405, 7.5, 130], [-404, 6.5, 40], [-405, 8, -60], [-406, 7, -160], [-412, 9, -260], [-432, 12, -340]];
const SPEED = 10; // m/s, ping-pong along the path: every configuration covers the same positions at the same times
const HOUR = 16.5, WEATHER = 'clear', SEED_T = 777, SEED_C = 31337;

const lerp = (a, b, t) => a + (b - a) * t;
function pathLen() { let L = 0; for (let i = 1; i < PATH.length; i++) L += Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][2] - PATH[i - 1][2]); return L; }
const LEN = pathLen();
function pointAt(s, out) { // s = metres along the path (clamped)
  s = Math.max(0, Math.min(LEN, s));
  for (let i = 1; i < PATH.length; i++) { const a = PATH[i - 1], b = PATH[i], d = Math.hypot(b[0] - a[0], b[2] - a[2]); if (s <= d || i === PATH.length - 1) { const t = d > 0 ? Math.min(1, s / d) : 0; out[0] = lerp(a[0], b[0], t); out[1] = lerp(a[1], b[1], t); out[2] = lerp(a[2], b[2], t); return out; } s -= d; }
  return out;
}
const pingPong = (t) => { const s = (t * SPEED) % (2 * LEN); return s <= LEN ? s : 2 * LEN - s; };

function stats(arr, n) {
  if (!n) return null; const a = Array.from(arr.subarray(0, n)).sort((x, y) => x - y); let sum = 0; for (const v of a) sum += v;
  const q = (p) => a[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];
  return { n, mean: sum / n, median: q(0.5), p95: q(0.95), p99: q(0.99), min: a[0], max: a[n - 1], sum, sorted: a };
}
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

export class Benchmark {
  constructor(g, opts = {}) {
    this.g = g; this.sec = Math.max(5, Math.min(600, +opts.seconds || +Settings.get('benchSec') || 30)); this.warm = Math.max(1, Math.min(60, +opts.warmup || +Settings.get('benchWarm') || 5));
    const sc0 = String(opts.scene || 'city').toLowerCase(); this.cpu = !!opts.cpu || sc0 === 'cpu' || sc0 === 's'; const CF = this.cpu ? CPU_CONFIGS : BENCH_CONFIGS;
    this.configs = (opts.configs ? CF.filter((c) => opts.configs.includes(c.id)) : CF).slice(); this.results = []; this.aborted = false;
    // 92nd: scenario — 'city' (the Galle Road flythrough), 'fight' (F) or 'race' / 'race-expert' (R): BenchScenes.js
    const sc = String(opts.scene || 'city').toLowerCase(); this.sceneId = sc; this.scene = this.cpu ? new StreamScene(g) : sc === 'fight' || sc === 'f' ? new FightScene(g) : sc.startsWith('race') || sc === 'r' ? new RaceScene(g, sc.includes('expert') ? 'expert' : 'hard') : null;
    const cap = Math.ceil(this.sec * 500) + 64; this.ft = new Float32Array(cap); this.gt = new Float32Array(cap); this.gs = new Float32Array(cap); this.mt = new Float32Array(cap); // preallocated: no per-frame allocation
    this._p = [0, 0, 0]; this._q = [0, 0, 0]; this._v = new THREE.Vector3();
  }
  static canRun(g, scene) {
    if (!g || g.mode !== 'play') return 'Start or load a game first.'; if (scene) { const w = scene.canRun(); if (w) return w; }
    if (g.indoor || (g.seamK || 0) > 0.01) return 'Step outside first — the benchmark flies through the city streets.';
    if (g.director && g.director.active) return 'Wait until the cutscene ends.';
    if (g.bench) return 'A benchmark is already running.';
    return null;
  }
  // ---------------------------------------------------------------- run
  async run() {
    const g = this.g, A = g.atmos, R = g.renderer, W = g.world;
    const SC = this.scene, hour = SC ? SC.hour : HOUR; const why = Benchmark.canRun(g, SC); if (why) { g.hud && g.hud.notify('Benchmark', why, 'warn', 3); return null; }
    // save what is changed
    const save = { hour: A.hour, day: A.day, forced: A.forced, weather: A.weather, target: A.target, w: { ...A.w }, wet: A.wet, dynK: g.dynK, autoReset: R.info.autoReset, hud: g.hud && g.hud.root ? g.hud.root.style.visibility : '', focus: g.focus, tMax: g.traffic.max, override: g.renderOverride, workers: CPU.override };
    g.bench = this; g.dynK = 1; R.info.autoReset = false; if (g.hud && g.hud.root) g.hud.root.style.visibility = 'hidden';
    const overlay = this.overlay(); const kept = [];
    const timer = new GpuTimer(R.getContext()); g.post.setTimer(null);
    const onKey = (e) => { if (e.code === 'Escape') { this.aborted = true; e.preventDefault(); } }; addEventListener('keydown', onKey, true); // (Game.onKey ignores keys while g.bench is set)
    const frame = () => new Promise((res) => { this.wake = res; }); let cfg = null, t = 0, phase = 'prep', n = 0, gpuN = 0, sgN = 0, calls = 0, tris = 0, infoN = 0;
    g.benchHook = (dt) => {
      // the previous frame's totals (info is reset here, before this frame draws)
      if (phase === 'measure' && infoN >= 0) { calls += R.info.render.calls; tris += R.info.render.triangles; infoN++; }
      R.info.reset();
      if (phase === 'measure') { const raw = g.rawDt; if (raw > 0 && n < this.ft.length) { const M = g.cpuMon; this.mt[n] = M && M.n ? M.mt[(M.i + M.mt.length - 1) % M.mt.length] : 0; this.ft[n++] = raw * 1000; } /* 93rd: + the previous frame's main-thread ms (Game.loop → cpuMon) */ for (const r of timer.take()) { if (r.tag !== cfg.id) continue; if (gpuN < this.gt.length) this.gt[gpuN++] = r.total; if (r.sgsr !== undefined && sgN < this.gs.length) this.gs[sgN++] = r.sgsr; } }
      else timer.take();
      if (SC) BUILDS.begin(); /* 92nd: the one-heavy-build-per-frame token (updatePlay is not running) */ if (!SC) this.fly(t); t += dt; A.hour = hour; A.wet = 0;
      g.updateAmbient(dt); // the living city (traffic, pedestrians, trains, world streaming, atmosphere, audio) — like the menu backdrop
      if (SC) { if (phase !== 'prep' && phase !== 'setup') SC.step(dt); if (phase !== 'setup') SC.fly(t, g.camera, dt); } // 92nd: the activity runs for real (setup steps it itself); the camera follows it
      const w = this.wake; this.wake = null; if (w) w(dt);
    };
    try {
      // environment
      A.forceWeather(WEATHER); A.setWeather(WEATHER, true); A.hour = hour; A.wet = 0;
      if (SC) { phase = 'setup'; overlay.set('Preparing the scenario…'); await SC.setup(frame, overlay); phase = 'prep'; } // (setup steps the activity itself)
      overlay.set('Preparing the streets…'); await this.prepare(frame, kept, overlay); if (this.aborted) throw new Error('aborted');
      for (let ci = 0; ci < this.configs.length && !this.aborted; ci++) {
        cfg = this.configs[ci]; if (this.cpu) setWorkerOverride(cfg.workers); else { g.renderOverride = cfg.mode; g.applyPR(); } g.post.setTimer(timer); g.post.timerTag = cfg.id + ':warm';
        // the same start for every configuration: path start, street life cleared, re-seeded and settled
        phase = 'settle'; t = 0; if (SC) { await SC.reset(); SC.fly(0, g.camera, 0); } else this.fly(0); this.resetLife();
        phase = 'warm'; let w = 0; while (w < this.warm && !this.aborted) { w += await frame(); overlay.set(`${cfg.id} · ${cfg.label} — warming up ${Math.ceil(this.warm - w)} s`, ci, this.configs.length); }
        t = 0; if (!SC) this.fly(0); this.pool0 = this.poolSnap(); n = 0; gpuN = 0; sgN = 0; calls = 0; tris = 0; infoN = -1; timer.take(); const dis0 = timer.disjoint; g.post.timerTag = cfg.id; phase = 'measure';
        let m = 0; while (m < this.sec && !this.aborted) { m += await frame(); if (infoN < 0) infoN = 0; overlay.set(`${cfg.id} · ${cfg.label} — measuring ${Math.ceil(this.sec - m)} s`, ci + m / this.sec, this.configs.length); }
        phase = 'drain'; g.post.timerTag = 'drain'; for (let i = 0; i < 6; i++) { await frame(); timer.poll(); for (const r of timer.take()) { if (r.tag !== cfg.id) continue; if (gpuN < this.gt.length) this.gt[gpuN++] = r.total; if (r.sgsr !== undefined && sgN < this.gs.length) this.gs[sgN++] = r.sgsr; } } // queries of the last measured frames
        if (this.aborted) break;
        this.results.push(this.summarise(cfg, n, gpuN, sgN, calls, tris, infoN, timer, timer.disjoint - dis0));
      }
    } catch (e) { if (String(e && e.message) !== 'aborted') { console.error(e); g.hud && g.hud.notify('Benchmark failed', String((e && e.message) || e), 'warn', 4); } }
    finally {
      removeEventListener('keydown', onKey, true); g.benchHook = null; if (SC) { try { this.sceneInfo = SC.info(); SC.teardown(); } catch (e) { console.error(e); } } g.post.setTimer(null); g.post.timerTag = undefined; timer.dispose();
      for (const c of kept) c.keep = false;
      A.forceWeather(save.forced); A.weather = save.weather; A.target = save.target; Object.assign(A.w, save.w); A.wet = save.wet; A.hour = save.hour; A.day = save.day;
      g.traffic.max = save.tMax; g.renderOverride = save.override; if (this.cpu) setWorkerOverride(save.workers); g.dynK = save.dynK; R.info.autoReset = save.autoReset; R.info.reset(); g.focus = save.focus;
      if (g.hud && g.hud.root) g.hud.root.style.visibility = save.hud; g.bench = null; g.applyPR(); overlay.remove();
    }
    const report = this.report(timer.ok);
    try { window.__benchmark = report; } catch (e) {}
    if (this.results.length) this.showResults(report); else if (this.aborted) g.hud && g.hud.notify('Benchmark aborted', '', 'info', 2);
    return report;
  }
  fly(t) {
    const cam = this.g.camera, s = pingPong(t), back = Math.floor((t * SPEED) / LEN) % 2 === 1; const p = pointAt(s, this._p), q = pointAt(s + (back ? -14 : 14), this._q);
    const sweep = Math.sin(t * 0.35) * 0.35; const dx = q[0] - p[0], dz = q[2] - p[2], c = Math.cos(sweep), sn = Math.sin(sweep);
    cam.position.set(p[0], p[1], p[2]); cam.lookAt(p[0] + dx * c - dz * sn, p[1] - 2.2, p[2] + dx * sn + dz * c); cam.updateMatrixWorld();
    const f = this._f || (this._f = { x: 0, z: 0 }); f.x = p[0] + dx * 1.5; f.z = p[2] + dz * 1.5; this.g.focus = f; // streaming / traffic / crowd centre: just ahead
  }
  resetLife() {
    const g = this.g, T = g.traffic, C = g.crowd, A = g.atmos;
    for (const v of T.vehicles.slice()) T.remove(v); T.vehicles.length = 0; C.clear();
    if (T.rng) T.rng.r = new RNG(SEED_T).r; if (C.rng) C.rng.r = new RNG(SEED_C).r; T.parkedTimer = 0;
    const cam = g.camera, dir = cam.getWorldDirection(this._v), f = g.focus;
    for (let i = 0; i < 36; i++) { T.update(0.1, f, dir, g.clock, C.peds, g.ghost); C.update(0.1, f, dir, { simTime: g.clock, vehicles: T.all(), rain: 0, night: A.night, player: g.ghost, hourFactor: g.hourFactor(), hour: A.hour, police: null }); }
  }
  // build (and pin) every street chunk the flythrough can see before measuring — like the trailer's prewarm (Trailer.js)
  async prepare(frame, kept, overlay) {
    const W = this.g.world; if (!W || !W.chunks) return; const R = W.detailRadius || 330, WR = W.windowRadius || 150, pts = [];
    if (this.scene) pts.push(...this.scene.points()); else for (let s = 0; s <= LEN; s += 40) { const p = pointAt(s, [0, 0, 0]); pts.push([p[0], p[2]]); }
    const near = (c, r) => pts.some(([x, z]) => Math.hypot(c.cx - x, c.cz - z) - 140 < r);
    const need = W.chunks.filter((c) => near(c, R)); for (const c of need) if (!c.keep) { c.keep = true; kept.push(c); }
    const t0 = performance.now();
    while (!this.aborted && performance.now() - t0 < 90000) {
      let left = 0; for (const c of need) { if (!c.detail) { left++; if (!W.job) W.startDetailJob(c); } else if (!c.win && near(c, WR)) { left++; if (!W.wjob) W.wjob = W.newJob(c, 'win'); } }
      if (!left && !W.job && !W.wjob) break; overlay.set(`Preparing the streets… ${need.length - left}/${need.length}`);
      await frame();
    }
    let w = 0; while (w < 2 && !this.aborted) w += await frame(); // one last moment for reveals / compiles
  }
  summarise(cfg, n, gpuN, sgN, calls, tris, infoN, timer, disjoint) {
    const F = stats(this.ft, n), G = stats(this.gt, gpuN), S = stats(this.gs, sgN), res = this.g.post.resolution() || { internal: [0, 0], output: [0, 0] };
    let low1 = null, low1Note = null;
    if (F && n >= 1000) { const k = Math.max(1, Math.floor(n * 0.01)); let s = 0; for (let i = n - k; i < n; i++) s += F.sorted[i]; low1 = 1000 / (s / k); }
    else low1Note = `not reliable with ${n} frames (needs ≥ 1000: lengthen the duration)`;
    let o16 = 0, o33 = 0; for (let i = 0; i < n; i++) { const v = this.ft[i]; if (v > 16.67) o16++; if (v > 33.4) o33++; } const Mn = stats(this.mt, n), P1 = this.poolSnap(), P0 = this.pool0 || P1;
    const wj = P1.done - P0.done, cpu = { workers: cfg.workers ?? CPU.override ?? 'auto', poolSize: P1.size, mainMs: Mn ? r2(Mn.mean) : null, mainP99Ms: Mn ? r2(Mn.p99) : null, mainMaxMs: Mn ? r2(Mn.max) : null, workerJobs: wj, workerJobMs: wj > 0 ? r2((P1.ms - P0.ms) / wj) : null, workerJobMaxMs: P1.size || wj ? r2(P1.maxMs) : null };
    let spikes = 0, worst = 0; const lim = F ? Math.max(2 * F.median, F.median + 10) : 0; for (let i = 0; i < n; i++) { const v = this.ft[i]; if (v > lim) spikes++; if (v > worst) worst = v; }
    return {
      id: cfg.id, scenario: this.scene ? this.scene.id : 'city', config: cfg.label, mode: cfg.mode || this.g.renderOverride || Settings.get('upscale'), internal: res.internal, output: res.output, sgsr: !!res.sgsr,
      frames: n, seconds: F ? r2(F.sum / 1000) : 0,
      avgFps: F ? r2(n / (F.sum / 1000)) : null, avgFrameMs: F ? r2(F.mean) : null, medianFrameMs: F ? r2(F.median) : null, p99FrameMs: F ? r2(F.p99) : null, over16: o16, over33: o33, ...cpu,
      low1Fps: r2(low1), low1Note, spikes, spikeLimitMs: r2(lim), worstFrameMs: r2(worst),
      drawCalls: infoN > 0 ? Math.round(calls / infoN) : null, triangles: infoN > 0 ? Math.round(tris / infoN) : null,
      gpuFrameMs: G ? r2(G.mean) : null, gpuFrameMedianMs: G ? r2(G.median) : null, gpuSamples: gpuN, gpuDisjointDropped: disjoint,
      sgsrMs: S ? r2(S.mean) : null, sgsrMedianMs: S ? r2(S.median) : null,
      gpuNote: !timer.ok ? 'GPU timing unavailable: EXT_disjoint_timer_query_webgl2 is not exposed by this browser / driver' : gpuN === 0 ? 'no GPU samples (all disjoint or still pending)' : null,
    };
  }
  // totals over every running worker pool (jobs done, their summed / worst in-worker ms, threads)
  poolSnap() { let done = 0, ms = 0, maxMs = 0, size = 0; for (const p of poolStats()) { done += p.done; ms += p.avgMs * p.done; maxMs = Math.max(maxMs, p.maxMs); size += p.size; } return { done, ms, maxMs, size }; }
  report(timerOk) {
    const g = this.g, gi = gpuInfo(g.renderer);
    return {
      game: 'COLOMBO: Shadows of the Island', kind: this.cpu ? 'CPU worker benchmark' : 'render benchmark', hardwareConcurrency: CPU.hwc, date: new Date().toISOString(), aborted: this.aborted,
      gpu: gi.label, api: gi.api, userAgent: navigator.userAgent, devicePixelRatio: devicePixelRatio, canvasCss: [innerWidth, innerHeight],
      quality: Settings.get('quality'), sgsrSharpness: +Settings.get('sgsrSharpness') || 2, sgsrVariant: Settings.get('sgsrEdgeDir') === false ? 'base' : 'edge-direction',
      seconds: this.sec, warmup: this.warm, scene: { ...(this.sceneInfo || { scenario: 'city', path: 'Galle Road flythrough (ping-pong, 10 m/s)', hour: HOUR }), weather: WEATHER, wet: 0, trafficMax: g.traffic.max, crowdMax: g.crowd.max }, gpuTimer: timerOk,
      notes: ['FPS and frame times come from requestAnimationFrame intervals and are capped by the display refresh rate (vsync); GPU ms are uncapped.', 'GPU ms = EXT_disjoint_timer_query_webgl2 time of the frame\'s drawing (water mirror, shadow maps, scene, post-processing, SGSR); sgsrMs = the SGSR pass alone.', 'Traffic and pedestrians are re-seeded and settled before each configuration but move freely, so runs are close, not identical.', 'GPU utilisation and VRAM use cannot be measured from a browser and are not reported.'],
      results: this.results,
    };
  }
  // ---------------------------------------------------------------- UI
  overlay() {
    const d = document.createElement('div'); d.className = 'bench-ov';
    d.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:9999;background:rgba(10,14,20,.78);color:#e8edf3;font:600 14px/1.4 "Barlow Condensed",Arial,sans-serif;padding:8px 16px;border-radius:6px;letter-spacing:.04em;pointer-events:none;text-align:center;min-width:320px';
    const t = document.createElement('div'); const bar = document.createElement('div'); bar.style.cssText = 'height:3px;background:#e0a030;margin-top:6px;width:0;transition:width .3s'; const sub = document.createElement('div'); sub.style.cssText = 'font-weight:400;font-size:12px;opacity:.7'; sub.textContent = 'BENCHMARK · Esc to abort';
    d.append(sub, t, bar); document.body.appendChild(d);
    return { set: (s, i, nC) => { t.textContent = s; if (nC) bar.style.width = `${Math.min(100, (i / nC) * 100)}%`; }, remove: () => d.remove() };
  }
  showResults(rep) {
    const csv = toCSV(rep), json = JSON.stringify(rep, null, 2), stamp = rep.date.replace(/[:.]/g, '-');
    const m = document.createElement('div'); m.className = 'modal'; m.style.zIndex = 9999;
    const rows = rep.results.map((r) => `<tr><td><b>${r.id}</b> ${r.config}</td><td>${r.internal.join('×')} → ${r.output.join('×')}</td><td>${r.avgFps ?? '—'}</td><td>${r.avgFrameMs ?? '—'} / ${r.medianFrameMs ?? '—'}</td><td>${r.low1Fps ?? '—'}</td><td>${r.spikes}</td><td>${r.gpuFrameMs ?? '—'}</td><td>${r.sgsrMs ?? (r.sgsr ? '—' : 'n/a')}</td><td>${r.drawCalls ?? '—'}</td><td>${r.triangles != null ? (r.triangles / 1e6).toFixed(2) + ' M' : '—'}</td></tr>`).join('');
    m.innerHTML = `<div class="panel wide" style="max-width:1100px"><h2>Benchmark results</h2><p class="hint">${rep.scene.label || 'Galle Road flythrough'} · ${rep.gpu} · ${rep.api} · ${rep.quality} preset · ${rep.seconds} s per configuration (+${rep.warmup} s warm-up)${rep.gpuTimer ? '' : ' · GPU timing unavailable in this browser'}</p>
      <div style="overflow:auto"><table class="bench-tab" style="width:100%;border-collapse:collapse;font-size:13px"><tr style="text-align:left;opacity:.75"><th>Configuration</th><th>Internal → output</th><th>Avg FPS</th><th>Frame ms avg / median</th><th>1% low FPS</th><th>Spikes</th><th>GPU ms</th><th>SGSR ms</th><th>Draw calls</th><th>Triangles</th></tr>${rows}</table></div>
      <p class="hint">${rep.notes.join(' ')}</p><div class="panel-foot"><button class="menu-btn bj">Download JSON</button><button class="menu-btn bc">Download CSV</button><button class="menu-btn bx">Close</button></div></div>`;
    document.body.appendChild(m); m.querySelectorAll('td,th').forEach((c) => { c.style.padding = '4px 8px'; c.style.borderBottom = '1px solid rgba(255,255,255,.08)'; });
    m.querySelector('.bj').onclick = () => download(`colombo-benchmark-${stamp}.json`, json, 'application/json');
    m.querySelector('.bc').onclick = () => download(`colombo-benchmark-${stamp}.csv`, csv, 'text/csv');
    m.querySelector('.bx').onclick = () => m.remove();
  }
}
const COLS = ['id', 'scenario', 'config', 'mode', 'internal', 'output', 'workers', 'poolSize', 'frames', 'seconds', 'avgFps', 'avgFrameMs', 'medianFrameMs', 'p99FrameMs', 'low1Fps', 'over16', 'over33', 'mainMs', 'mainP99Ms', 'mainMaxMs', 'workerJobs', 'workerJobMs', 'workerJobMaxMs', 'spikes', 'spikeLimitMs', 'worstFrameMs', 'gpuFrameMs', 'gpuFrameMedianMs', 'gpuSamples', 'gpuDisjointDropped', 'sgsrMs', 'sgsrMedianMs', 'drawCalls', 'triangles', 'low1Note', 'gpuNote'];
export function toCSV(rep) {
  const esc = (v) => { if (v == null) return ''; const s = Array.isArray(v) ? v.join('x') : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [COLS.join(','), ...rep.results.map((r) => COLS.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}
function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
export async function runBenchmark(g, opts) { return new Benchmark(g, opts).run(); }
