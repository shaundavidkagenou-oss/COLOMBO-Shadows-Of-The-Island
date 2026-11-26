// 98th: where does a frame go? (headless Chromium, the real game). At a fixed busy place (same spot, camera, hour, weather,
// graphics preset and population as tools/crowd-bench.mjs):
//  1. SIMULATION — SIMN frames of the real updatePlay under the V8 sampling profiler: main-thread ms per frame and the
//     functions / files with the most self time.
//  2. RENDERING — RN frames of the real frameStep with the world frozen: every renderer.render call (shadow maps, the water
//     mirror, the scene, post passes) intercepted → draw calls, triangles and main-thread submission ms per pass, plus a
//     sampling profile of the render frames. (SwiftShader rasterises in the GPU process: the main-thread numbers are the
//     JavaScript + WebGL command cost the game pays on any GPU; GPU time is not measured here.)
//   PORT=5199 node tools/perf-probe.mjs [place] [quality] [outJson]      env SIMN=120 RN=4 TOP=30
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'node:fs';
const PORT = process.env.PORT || 5199, PLACE = process.argv[2] || 'pettah', Q = process.argv[3] || 'medium', OUT = process.argv[4] || null;
const SIMN = +(process.env.SIMN || 120), RN = +(process.env.RN || 4), TOP = +(process.env.TOP || 30), SIM = +(process.env.SIM || 300);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 3600000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'], defaultViewport: { width: 1280, height: 720 } });
const errors = []; const result = { place: PLACE, quality: Q };
// aggregate a V8 CPU profile: self time per function and per file (ms)
function summarise(profile) {
  const byId = new Map(); for (const n of profile.nodes) byId.set(n.id, n);
  const self = new Map(); const dts = profile.timeDeltas; for (let i = 0; i < profile.samples.length; i++) { const id = profile.samples[i]; self.set(id, (self.get(id) || 0) + (dts[i] || 0)); }
  const fn = new Map(), file = new Map(); let total = 0;
  for (const [id, us] of self) { const n = byId.get(id); const cf = n.callFrame; const url = (cf.url || '').replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '') || `(${cf.functionName || 'native'})`;
    const k = `${cf.functionName || '(anon)'}  ${url}:${cf.lineNumber + 1}`; fn.set(k, (fn.get(k) || 0) + us); file.set(url, (file.get(url) || 0) + us); total += us; }
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k, us]) => [k, +(us / 1000).toFixed(1), +(100 * us / total).toFixed(1)]);
  return { totalMs: +(total / 1000).toFixed(0), fn: top(fn), file: top(file) };
}
try {
  const page = await browser.newPage(); page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.evaluateOnNewDocument((q) => localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false, dynamicRes: false })), Q);
  await page.goto(`http://localhost:${PORT}/?test&quick=play`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const cdp = await page.target().createCDPSession(); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  // the place (as tools/crowd-bench.mjs)
  await page.evaluate(async (name, sim) => {
    const L = window.__L, g = window.__game; g.noRender = true; const want = { pettah: [20, -800], fort: [-360, -800], kollupitiya: [-430, 120], borella: [780, 150], green: [-480, -420] }; const [tx, tz] = want[name]; let best = null, bd = 1e9;
    for (const s of L.segments) { if (s.crossing) continue; if (name === 'borella' && s.level < 2) continue; if (name !== 'borella' && s.level > 1) continue; const d = Math.hypot((s.x0 + s.x1) / 2 - tx, (s.z0 + s.z1) / 2 - tz); if (d < bd) { bd = d; best = s; } }
    const s = best, dx = s.x1 - s.x0, dz = s.z1 - s.z0, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, nx = uz, nz = -ux, off = (s.hw || 6) + 1.6; const cx = s.x0 + ux * len * 0.25 + nx * off, cz = s.z0 + uz * len * 0.25 + nz * off;
    window.__perfPlace = { focus: [cx, cz], cam: [cx, 1.75, cz], look: [cx + ux * 40 - nx * off * 0.6, 1.4, cz + uz * 40 - nz * off * 0.6] };
    g.editorHook = null; g.player.camOverride = false; g.world.warm(cx, cz); g.player.teleport(cx, cz, 0); g.atmos.hour = 10.5; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.atmos.wet = 0;
    for (let i = 0; i < sim; i += 50) await g.stepSim(Math.min(50, sim - i), 0.05);
  }, PLACE, SIM);
  // ---- 1. simulation
  await page.evaluate(async () => { const g = window.__game; for (let i = 0; i < 20; i++) g.updatePlay(1 / 60); });
  await cdp.send('Profiler.start');
  result.sim = await page.evaluate(async (n) => { const g = window.__game; const ts = []; for (let i = 0; i < n; i++) { const t = performance.now(); g.updatePlay(1 / 60); ts.push(performance.now() - t); if (i % 10 === 9) await null; }
    ts.sort((a, b) => a - b); return { frames: n, meanMs: +(ts.reduce((a, b) => a + b, 0) / n).toFixed(2), p50: +ts[n >> 1].toFixed(2), p95: +ts[Math.floor(n * 0.95)].toFixed(2), peds: g.crowd.peds.length, veh: g.traffic.vehicles.length }; }, SIMN);
  result.simProfile = summarise((await cdp.send('Profiler.stop')).profile);
  // ---- 2. rendering (world frozen, fixed camera)
  await page.evaluate(() => { const g = window.__game, v = window.__perfPlace, cam = g.camera; g.noRender = false; g.player.camOverride = true; g.editorHook = () => { g.atmos.hour = 10.5; cam.position.set(...v.cam); cam.lookAt(...v.look); cam.updateMatrixWorld(); }; });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => { const g = window.__game; g.noRender = true; const R = g.renderer, gl = R.getContext(), px = new Uint8Array(4); for (let i = 0; i < 3; i++) { g.frameStep(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } });
  await page.evaluate(() => { // per-pass interception
    const g = window.__game, R = g.renderer, SM = R.shadowMap; const P = (window.__passes = { list: [], depth: 0 }); const info = R.info.render;
    const label = (scene, cam) => { const rt = R.getRenderTarget(); const t = cam && cam.isOrthographicCamera ? 'ortho' : 'persp'; const sz = rt ? `${rt.width}x${rt.height}` : 'screen'; return `${scene && scene.isScene && scene === g.scene ? 'scene' : (scene && (scene.name || scene.type)) || '?'}|${t}|${sz}`; };
    const r0 = R.render.bind(R); R.render = (scene, cam) => { const k = label(scene, cam); const c0 = info.calls, t0 = info.triangles, s0 = P.shadowMs, sc0 = P.shadowCalls; const t = performance.now(); P.depth++; try { r0(scene, cam); } finally { P.depth--; } const ms = performance.now() - t;
      P.list.push({ k, calls: info.calls - c0 - (P.shadowCalls - sc0), tris: info.triangles - t0, ms: ms - (P.shadowMs - s0) }); };
    P.shadowMs = 0; P.shadowCalls = 0; const s0 = SM.render.bind(SM); SM.render = (...a) => { const c0 = info.calls; const t = performance.now(); s0(...a); P.shadowMs += performance.now() - t; P.shadowCalls += info.calls - c0; P.list.push({ k: 'shadow-maps', calls: info.calls - c0, tris: 0, ms: performance.now() - t }); };
  });
  await cdp.send('Profiler.start');
  result.render = await page.evaluate((n) => { const g = window.__game, R = g.renderer, gl = R.getContext(), px = new Uint8Array(4); const P = window.__passes; const ar = R.info.autoReset; R.info.autoReset = false; const frames = [];
    for (let i = 0; i < n; i++) { P.list = []; P.shadowMs = 0; P.shadowCalls = 0; R.info.reset(); const t = performance.now(); g.frameStep(1 / 60); const ms = performance.now() - t; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); frames.push({ ms, calls: R.info.render.calls, tris: R.info.render.triangles, passes: P.list.slice() }); }
    R.info.autoReset = ar; const agg = {}; for (const f of frames) for (const p of f.passes) { const a = agg[p.k] || (agg[p.k] = { n: 0, calls: 0, tris: 0, ms: 0 }); a.n++; a.calls += p.calls; a.tris += p.tris; a.ms += p.ms; }
    const passes = Object.entries(agg).map(([k, a]) => ({ pass: k, perFrame: +(a.n / n).toFixed(1), calls: Math.round(a.calls / n), trisK: Math.round(a.tris / n / 1000), ms: +(a.ms / n).toFixed(2) })).sort((a, b) => b.ms - a.ms);
    const ms = frames.map((f) => f.ms); return { frames: n, mainThreadMs: +(ms.reduce((a, b) => a + b, 0) / n).toFixed(1), calls: Math.round(frames.reduce((a, f) => a + f.calls, 0) / n), trisM: +(frames.reduce((a, f) => a + f.tris, 0) / n / 1e6).toFixed(2), passes,
      programs: R.info.programs ? R.info.programs.length : null, geos: R.info.memory.geometries, tex: R.info.memory.textures, pr: R.getPixelRatio(), size: [R.domElement.width, R.domElement.height] }; }, RN);
  result.renderProfile = summarise((await cdp.send('Profiler.stop')).profile);
  // ---- 3. GPU breakdown (GPU=1): one frame, every draw of the main scene pass followed by a finish → triangles, calls and the
  // software-rasteriser time per object group (a proxy for GPU cost: relative only)
  if (process.env.GPU) result.gpu = await page.evaluate(() => { const g = window.__game, R = g.renderer, gl = R.getContext(), info = R.info.render; const groups = {}; let inScene = false;
    const keyOf = (o, m) => { let a = o, path = []; while (a && a !== g.scene) { if (a.name) path.push(a.name); a = a.parent; } const top = path.length ? path[path.length - 1] : '(root)'; const near = path[0] || '';
      return `${o.isBatchedMesh ? 'Batched' : o.isInstancedMesh ? 'Inst' : o.isSkinnedMesh ? 'Skinned' : o.isPoints ? 'Points' : o.isLine ? 'Line' : o.isSprite ? 'Sprite' : 'Mesh'}|${top}|${near === top ? '' : near}|${m.type}${m.transparent ? '+T' : ''}`; };
    const rbd = R.renderBufferDirect.bind(R); R.renderBufferDirect = (cam, scene, geo, mat, obj, grp) => { if (!inScene) return rbd(cam, scene, geo, mat, obj, grp); const c0 = info.calls, t0 = info.triangles; gl.finish(); const t = performance.now(); rbd(cam, scene, geo, mat, obj, grp); gl.finish();
      const k = keyOf(obj, mat); const e = groups[k] || (groups[k] = { calls: 0, tris: 0, ms: 0 }); e.calls += info.calls - c0; e.tris += info.triangles - t0; e.ms += performance.now() - t; };
    const r0 = R.render; R.render = function (scene, cam) { inScene = scene === g.scene && cam === g.camera; try { return r0.call(this, scene, cam); } finally { inScene = false; } };
    R.info.reset(); const t = performance.now(); g.frameStep(1 / 60); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const total = performance.now() - t; R.render = r0; R.renderBufferDirect = rbd;
    const rows = Object.entries(groups).map(([k, e]) => ({ k, calls: e.calls, trisK: Math.round(e.tris / 1000), ms: +e.ms.toFixed(0) })).sort((a, b) => b.ms - a.ms); return { totalMs: +total.toFixed(0), rows }; });
} catch (e) { console.log('ERR', e); }
result.errors = errors.slice(0, 5);
const pr = (t, rows) => { console.log(`\n== ${t}`); for (const r of rows) console.log('  ' + r.join('  ')); };
console.log(`PLACE ${PLACE} ${Q}`); if (result.sim) console.log('SIM', JSON.stringify(result.sim));
if (result.render) { const { passes, ...rest } = result.render; console.log('RENDER', JSON.stringify(rest)); for (const p of passes) console.log('  pass', JSON.stringify(p)); }
if (result.simProfile) { pr(`sim self-time by file (total ${result.simProfile.totalMs} ms)`, result.simProfile.file); pr('sim self-time by function', result.simProfile.fn); }
if (result.renderProfile) { pr(`render self-time by file (total ${result.renderProfile.totalMs} ms)`, result.renderProfile.file); pr('render self-time by function', result.renderProfile.fn); }
if (result.gpu) { console.log(`\n== GPU breakdown (frame ${result.gpu.totalMs} ms)`); const T = result.gpu.rows.reduce((a, r) => a + r.ms, 0); for (const r of result.gpu.rows.slice(0, 60)) console.log(`  ${String(r.ms).padStart(6)} ms ${(100 * r.ms / T).toFixed(1).padStart(5)}%  ${String(r.calls).padStart(4)} calls ${String(r.trisK).padStart(6)}K tris  ${r.k}`); }
console.log('errors', JSON.stringify(result.errors));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
await browser.close(); process.exit(0);
