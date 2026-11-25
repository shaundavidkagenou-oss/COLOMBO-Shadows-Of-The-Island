// 93rd — in-game CPU diagnostics (Settings → Graphics → CPU diagnostics panel, or the console: `cpu`).
// Everything shown is measured, nothing is estimated: frame intervals (requestAnimationFrame), the main thread's own time per frame
// (Game.frameStep: simulation + draw submission; the GPU's time is not in it), and per worker pool the jobs, their durations as
// timed inside the worker, queue waits and each worker thread's busy share of the last 2 s. A browser cannot read operating-system
// per-core load, so none is shown.
import { CPU, poolStats, autoWorkers, workerBudget } from '../core/WorkerPool.js';

const N = 1024; // frames kept (≈ 8–17 s)
export class FrameMon {
  constructor() { this.ft = new Float32Array(N); this.mt = new Float32Array(N); this.at = new Float64Array(N); this.i = 0; this.n = 0; this._s = new Float32Array(N); }
  add(frameMs, mainMs) { const i = this.i; this.ft[i] = frameMs; this.mt[i] = mainMs; this.at[i] = performance.now(); this.i = (i + 1) % N; if (this.n < N) this.n++; }
  // statistics over the last `sec` seconds
  summary(sec = 5) { const now = performance.now(), cut = now - sec * 1000; const F = [], M = [];
    for (let k = 0; k < this.n; k++) { const j = (this.i - 1 - k + N) % N; if (this.at[j] < cut) break; F.push(this.ft[j]); M.push(this.mt[j]); }
    if (!F.length) return null; const fs = F.slice().sort((a, b) => a - b), ms = M.slice().sort((a, b) => a - b), q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
    const sum = (a) => a.reduce((s, v) => s + v, 0); const k1 = Math.max(1, Math.floor(fs.length * 0.01)); let s1 = 0; for (let i = fs.length - k1; i < fs.length; i++) s1 += fs[i];
    return { frames: F.length, fps: F.length / (sum(F) / 1000), frameMs: sum(F) / F.length, p99: q(fs, 0.99), low1: 1000 / (s1 / k1), over16: F.filter((v) => v > 16.67).length, over33: F.filter((v) => v > 33.4).length, maxFrame: fs[fs.length - 1],
      mainMs: sum(M) / M.length, mainP99: q(ms, 0.99), mainMax: ms[ms.length - 1], mainOver8: M.filter((v) => v > 8).length }; }
}
const f1 = (v) => (v == null || !isFinite(v) ? '—' : v.toFixed(1)), f0 = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v));
const bar = (k) => { const n = Math.round(Math.max(0, Math.min(1, k)) * 10); return '█'.repeat(n) + '░'.repeat(10 - n); };
export class CpuPanel {
  constructor(g) { this.g = g; this.el = null; this.t = null; }
  show(on) { if (on && !this.el) { const d = document.createElement('pre'); d.className = 'cpu-panel';
      d.style.cssText = 'position:fixed;right:10px;top:64px;z-index:9000;margin:0;padding:8px 10px;background:rgba(8,12,18,.82);color:#d9e4ee;font:11px/1.35 ui-monospace,Consolas,monospace;border-radius:6px;pointer-events:none;white-space:pre;max-width:46vw;overflow:hidden';
      (document.body).appendChild(d); this.el = d; this.t = setInterval(() => this.draw(), 250); this.draw(); }
    if (!on && this.el) { clearInterval(this.t); this.el.remove(); this.el = null; } }
  text() { const g = this.g, s = g.cpuMon ? g.cpuMon.summary(5) : null; const L = [];
    L.push(`CPU · hardwareConcurrency ${CPU.hwc} (reported) · workers ${CPU.override != null ? CPU.override + ' (setting)' : 'auto → ' + autoWorkers()} · free ${workerBudget()}`);
    if (s) { L.push(`Frame  ${f1(s.fps)} fps · ${f1(s.frameMs)} ms avg · p99 ${f1(s.p99)} · 1% low ${f1(s.low1)} fps · max ${f1(s.maxFrame)}`);
      L.push(`       >16.7 ms: ${s.over16}/${s.frames} · >33.3 ms: ${s.over33}   (last 5 s)`);
      L.push(`Main   ${f1(s.mainMs)} ms avg · p99 ${f1(s.mainP99)} · max ${f1(s.mainMax)} · >8 ms: ${s.mainOver8}  (sim + draw submission)`); }
    else L.push('Frame  — (no frames yet)');
    const P = poolStats(); if (!P.length) L.push('Pools  none running (main-thread paths)');
    for (const p of P) { L.push(`Pool ${p.name}: ${p.size} worker${p.size === 1 ? '' : 's'} · running ${p.running} · queued ${p.pending} · done ${p.done} · failed ${p.failed} · cancelled ${p.cancelled}`);
      L.push(`       job ${f0(p.avgMs)} ms avg · max ${f0(p.maxMs)} · wait ${f0(p.avgWait)} ms avg · ${f1(p.perSec)} jobs/s · msgs ${p.msgsOut}/${p.msgsIn}`);
      p.per.forEach((w, i) => L.push(`  W${i + 1} ${bar(w.busy)} ${String(f0(w.busy * 100)).padStart(3)}% busy · ${w.jobs} jobs · ${f0(w.avgMs)} ms avg · max ${f0(w.maxMs)}${w.running ? ' · working' : ''}`)); }
    const W = g.world; if (W && W.geoInfo) { const i = W.geoInfo(); L.push(`Stream sent ${i.sent || 0} · in workers ${i.pending} · ready ${i.ready} · merging ${i.merging} · merged ${i.merged || 0} · dropped ${i.dropped || 0} · fallback ${i.fallback || 0}`); }
    L.push('busy % = time inside jobs as timed by each worker thread (not OS core load)');
    return L.join('\n'); }
  draw() { if (this.el) this.el.textContent = this.text(); }
}
