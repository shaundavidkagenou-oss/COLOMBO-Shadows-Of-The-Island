// Grass A/B benchmark (90th): the same page load, scene, camera, resolution and settings, with only the grass renderer /
// level switched — interleaved rounds so slow drift (GC, swap, traffic moving) hits every mode equally; medians reported.
//   node tools/grass-bench.mjs [quality] [scenario...]          scenario = name:x:z:hour[:yaw]   (PORT, W, H, MODES, ROUNDS, FR env)
//   MODES default: legacy,none,low,medium,high,ultra   (legacy = the Grass.js clump field, none = no grass at all)
// Per frame: the whole game frame (g.frameStep: sim + shadow + main + post, GPU drained with a 1-pixel readback so SwiftShader's
// raster work is inside the timing — it stands in for GPU workload here), the main pass alone, the grass CPU update, draw calls,
// triangles, visible blades / clumps and grass GPU memory. Shader programs for every mode are compiled before measuring.
// The sim time step is tiny (1 ms) and the clock frozen, so the scene barely changes between modes.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [Q = 'high', ...SC] = process.argv.slice(2);
const scen = (SC.length ? SC : ['park:52:-112:11']).map((s) => { const [name, x, z, hour, yaw] = s.split(':'); return { name, x: +x, z: +z, hour: +hour, yaw: yaw === undefined ? null : +yaw }; });
const MODES = (process.env.MODES || 'legacy,none,low,medium,high,ultra').split(','), ROUNDS = +(process.env.ROUNDS || 4), FR = +(process.env.FR || 5);
const W = +(process.env.W || 1280), H = +(process.env.H || 720); const T0 = Date.now(); const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 3600000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errors.push(t); if (t.startsWith('[gb]')) console.log(t); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); localStorage.removeItem('colombo.grass.v1'); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 1500000, polling: 1000 });
  log('game in play mode, JS heap ' + await page.evaluate(() => (performance.memory.usedJSHeapSize / 1048576).toFixed(0)) + ' MB');
  const hasGPU = await page.evaluate(() => { const g = window.__game; g.noRender = true; return !!g.world.grassGPU; });
  const modes = hasGPU ? MODES : ['legacy']; // a build without GPU grass (the baseline commit): its grass as it ships
  await page.evaluate(() => { // instrument once
    const g = window.__game, R = g.renderer, gl = R.getContext(); R.info.autoReset = false; const B = (window.__gb = { cur: null });
    const wrap = (o, n, key) => { if (!o || typeof o[n] !== 'function') return; const f = o[n]; o[n] = function (...a) { if (!B.cur) return f.apply(this, a); const s = performance.now(); try { return f.apply(this, a); } finally { B.cur[key] = (B.cur[key] || 0) + performance.now() - s; } }; };
    wrap(g.post.composer.passes[0], 'render', 'main'); wrap(R.shadowMap, 'render', 'shadow'); wrap(g.world.grass, 'update', 'grassCpu'); wrap(g.world.grassGPU, 'update', 'grassCpu');
    const px = new Uint8Array(4);
    B.frame = (dt) => { gl.finish(); R.info.reset(); B.cur = {}; const s = performance.now(); g.frameStep(dt); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const F = B.cur; B.cur = null;
      F.total = performance.now() - s; F.calls = R.info.render.calls; F.tris = R.info.render.triangles; return F; };
    B.mode = (m) => { const Wd = g.world, G = Wd.grassGPU; if (!G) return; G.prefs.governor = false; G.gov.drop = 0;
      if (m === 'legacy' || m === 'off' || m === 'none') { Wd.setGrassMode(m === 'none' ? 'off' : m); return; }
      Wd.setGrassMode('gpu'); G.prefs.level = m; G.setLevel(m, true); };
    B.grass = () => { const Wd = g.world, G = Wd.grassGPU, on = G && G.enabled && G.level, lg = Wd.grass && Wd.grass.mesh;
      return { blades: on ? G.stats.blades : 0, gpuDraws: on ? G.stats.draws : 0, verts: on ? G.stats.verts : 0, gpuKB: on ? Math.round(G.stats.gpuBytes / 1024) : 0, clumps: lg && lg.visible ? lg.count : 0 }; };
  });
  for (const S of scen) {
    await page.evaluate(async (S) => { const g = window.__game; g.world.warm(S.x, S.z); g.player.teleport(S.x, S.z, S.yaw === null ? 0 : S.yaw); g.atmos.hour = S.hour; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.atmos.wet = 0;
      if (g.debug) g.debug.freezeTime = true; await g.stepSim(60, 0.05); }, S);
    log(`${S.name}: placed — compiling every mode`);
    for (const m of modes) await page.evaluate(async (m) => { const g = window.__game, B = window.__gb; B.mode(m); for (let i = 0; i < 3; i++) B.frame(0.02); try { g.renderer.compile(g.scene, g.camera); } catch (e) { console.log('[gb] compile ' + e.message); }
      for (let i = 0, n0 = -1; i < 40; i++) { const n = g.renderer.info.programs.length; B.frame(0.001); if (n === n0 && i > 4) break; n0 = n; await new Promise((r) => setTimeout(r, 50)); } }, m);
    const res = {}; for (const m of modes) res[m] = { F: [] };
    for (let r = 0; r < ROUNDS; r++) for (const m of (r % 2 ? [...modes].reverse() : modes)) {
      const out = await page.evaluate((m, FR) => { const B = window.__gb, R = window.__game.renderer; B.mode(m); const p0 = R.info.programs.length; for (let i = 0; i < 3; i++) B.frame(0.001); // settle (grass refill, LOD state)
        const F = []; for (let i = 0; i < FR; i++) F.push(B.frame(0.001)); return { F, grass: B.grass(), newProgs: R.info.programs.length - p0, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) }; }, m, FR);
      res[m].F.push(...out.F); res[m].grass = out.grass; res[m].heapMB = out.heapMB; res[m].newProgs = (res[m].newProgs || 0) + out.newProgs;
    }
    const med = (a) => { const v = [...a].sort((x, y) => x - y); return v.length ? v[v.length >> 1] : 0; }, pct = (a, p) => { const v = [...a].sort((x, y) => x - y); return v[Math.min(v.length - 1, Math.floor(v.length * p))]; };
    const rows = modes.map((m) => { const F = res[m].F, tot = F.map((f) => f.total);
      return { mode: m, frames: F.length, medMs: +med(tot).toFixed(1), avgMs: +(tot.reduce((a, b) => a + b, 0) / tot.length).toFixed(1), p99Ms: +pct(tot, 0.99).toFixed(1), fpsMed: +(1000 / med(tot)).toFixed(2), low1Fps: +(1000 / pct(tot, 0.99)).toFixed(2),
        mainMs: +med(F.map((f) => f.main || 0)).toFixed(1), shadowMs: +med(F.map((f) => f.shadow || 0)).toFixed(1), grassCpuMs: +med(F.map((f) => f.grassCpu || 0)).toFixed(2), calls: Math.round(med(F.map((f) => f.calls))), ktris: Math.round(med(F.map((f) => f.tris)) / 1000),
        ...res[m].grass, heapMB: res[m].heapMB, newProgs: res[m].newProgs }; });
    console.log(`SCENARIO ${S.name} (${Q}, ${W}x${H}, ${ROUNDS} rounds x ${FR} frames per mode)`); console.table(rows); console.log('JSON ' + JSON.stringify({ scen: S.name, rows }));
  }
} catch (e) { console.log('ERR', (e.stack || e.message).split('\n').slice(0, 4).join(' / ')); } finally { console.log('errors:', errors.length ? errors.slice(0, 6).join(' | ') : 'none'); await browser.close(); }
