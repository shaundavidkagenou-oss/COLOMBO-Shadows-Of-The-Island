// 74th request — hospital performance capture (before / after). Headless Chromium (SwiftShader): GPU time is NOT measured
// (the GPU queue is drained before each frame and timed apart), so the numbers are what the hardware-independent part costs:
// draw calls and triangles submitted by the main colour pass and the shadow passes, the main thread's frame time (sim +
// three.js traversal / culling / uniforms), the hospital's own update time, scene object / geometry / texture / program counts
// and the JS heap — at fixed camera positions round the hospital, so the same views can be compared on two builds.
//   PORT=5200 node tools/hospital-perf.mjs <out.json> [quality] [frames] [shotDir]
// A last phase walks in and out of the hospital ENTER_EXIT times (new build only) and reports the heap / geometry / texture
// counts after each round (memory must stay flat: nothing built or leaked per visit).
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'fs';
const [OUT = '/tmp/hperf.json', Q = 'medium', NF = '24', SHOTS = ''] = process.argv.slice(2);
const W = 1280, H = 720; const T0 = Date.now(); const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
// world-space views (the hospital zone is x 600..720, z -300..-170; the street runs along z ≈ -160)
export const VIEWS = [
  { name: 'street', at: [660, -158], cam: [660, 1.7, -150], look: [660, 8, -250] },
  { name: 'far', at: [660, -40], cam: [660, 30, -20], look: [660, 5, -230] },
  { name: 'side', at: [742, -230], cam: [742, 1.7, -230], look: [650, 5, -230] },
  { name: 'entrance', at: [655, -176], cam: [655, 1.7, -176], look: [655, 1.6, -200] },
  { name: 'lobby', at: [655, -195], cam: [652, 1.65, -192], look: [660, 1.4, -205], inside: true },
  { name: 'ward', at: [640, -205], cam: [636, 5.4, -203], look: [645, 5.0, -212], inside: true, floor: 1 },
  { name: 'ward2', at: [652, -194], cam: [647, 5.5, -191], look: [660, 4.9, -197], inside: true, floor: 1 }, // (the 'ward' view above actually stands in the stairwell; kept for the before/after comparison)
  { name: 'ed', at: [668, -196], cam: [667, 1.75, -197.5], look: [677, 0.9, -191.5], inside: true },
  { name: 'private', at: [668, -203], cam: [668, 5.6, -203], look: [672, 4.6, -210], inside: true, floor: 1 },
  { name: 'bay', at: [700, -180], cam: [700, 2.0, -180], look: [684, 1.5, -196] },
];
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
const errors = []; const result = { quality: Q, frames: +NF, views: {}, memory: [] };
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errors.push(t); if (t.startsWith('[hperf]')) console.log(t); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  result.build = await page.evaluate(() => ({ hospital: !!(window.__game.hospital), heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) }));
  log('in play · ' + JSON.stringify(result.build));
  await page.evaluate(() => {
    const g = window.__game, R = g.renderer, gl = R.getContext(); R.info.autoReset = false; const P = (window.__hp = { on: false, cur: null, frames: [] });
    const timeIt = (obj, name, key, count = false) => { const f = obj[name]; if (typeof f !== 'function') return; obj[name] = function (...a) { if (!P.on || !P.cur) return f.apply(this, a); const c0 = R.info.render.calls, t0 = R.info.render.triangles, s = performance.now();
      try { return f.apply(this, a); } finally { const F = P.cur; F[key] = (F[key] || 0) + performance.now() - s; if (count) { F[key + 'Calls'] = (F[key + 'Calls'] || 0) + R.info.render.calls - c0; F[key + 'Tris'] = (F[key + 'Tris'] || 0) + R.info.render.triangles - t0; } } }; };
    timeIt(g, 'updatePlay', 'sim'); timeIt(R.shadowMap, 'render', 'shadow', true); const rp = g.post && g.post.composer && g.post.composer.passes[0]; if (rp) timeIt(rp, 'render', 'main', true);
    if (g.hospital) timeIt(g.hospital, 'update', 'hosp'); timeIt(g.interiors, 'updateSeamless', 'interiors'); if (g.police && g.police.ems) timeIt(g.police.ems, 'update', 'ems');
    const loop0 = g.loop; g.loop = function () { if (!P.on) return loop0.call(this); const w = performance.now(); gl.finish(); const wait = performance.now() - w; P.cur = { wait }; R.info.reset(); const s = performance.now(); loop0.call(this); P.cur.total = performance.now() - s; P.frames.push(P.cur); P.cur = null; };
  });
  const views = process.env.VIEWS ? VIEWS.filter((v) => process.env.VIEWS.split(',').includes(v.name)) : VIEWS;
  for (const V of views) {
    const info = await page.evaluate(async (V) => { const g = window.__game, P = g.player; g.atmos.hour = 11; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.atmos.wet = 0;
      P.camOverride = false; g.world.warm(V.at[0], V.at[1]); const H = g.hospital;
      if (V.inside && H && H.placeInside) H.placeInside(P, V.at[0], V.at[1], V.floor || 0); else P.teleport(V.at[0], V.at[1], Math.PI);
      await g.stepSim(4, 0.05); P.camOverride = true; g.camera.position.set(...V.cam); g.camera.lookAt(...V.look); g.camera.updateMatrixWorld();
      return { indoor: !!P.indoor, room: H && H.curRoom ? H.curRoom.id : null, y: +P.y.toFixed(2) }; }, V);
    await new Promise((r) => setTimeout(r, 3500)); // the real loop runs (first-use shader compiles of this view)
    await page.evaluate(() => { const P = window.__hp; P.frames = []; P.on = true; });
    await page.waitForFunction((n) => window.__hp.frames.length >= n, { timeout: 1500000, polling: 300 }, +NF);
    const st = await page.evaluate(() => { const g = window.__game, P = window.__hp; P.on = false; const F = P.frames.splice(0); const R = g.renderer;
      const agg = (k) => { const v = F.map((f) => f[k] || 0).sort((a, b) => a - b); return { avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2), p95: +v[Math.floor(v.length * 0.95)].toFixed(2), max: +v[v.length - 1].toFixed(2) }; };
      const o = {}; for (const k of ['total', 'sim', 'main', 'mainCalls', 'mainTris', 'shadow', 'shadowCalls', 'shadowTris', 'hosp', 'interiors', 'ems']) o[k] = agg(k);
      let meshes = 0, visMeshes = 0; g.scene.traverseVisible((q) => { if (q.isMesh) visMeshes++; }); g.scene.traverse((q) => { if (q.isMesh) meshes++; });
      const H = g.hospital; o.scene = { meshes, visMeshes, geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs.length, heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
        lights: (() => { let n = 0; g.scene.traverseVisible((q) => { if (q.isLight && q.intensity > 0) n++; }); return n; })(), hospRooms: H && H.visibleRooms ? H.visibleRooms() : null, hospNpcTiers: H && H.npcTiers ? H.npcTiers() : null };
      return o; });
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/${V.name}.png` }); }
    result.views[V.name] = Object.assign({ info }, st);
    log(`${V.name}: ${JSON.stringify(info)} main ${st.mainCalls.avg} calls / ${(st.mainTris.avg / 1000).toFixed(0)}k tris · shadow ${st.shadowCalls.avg} calls · frame ${st.total.avg} ms (sim ${st.sim.avg}, hosp ${st.hosp.avg}) · ${JSON.stringify(st.scene)}`);
  }
  // memory: in and out of the hospital several times (new build)
  const N = +(process.env.ENTER_EXIT || 0);
  for (let i = 0; i < N; i++) {
    const m = await page.evaluate(async () => { const g = window.__game, P = g.player, H = g.hospital; P.camOverride = false; if (!H || !H.placeInside) return null;
      H.placeInside(P, 655, -195, 0); await g.stepSim(3, 0.05); H.placeInside(P, 640, -205, 1); await g.stepSim(3, 0.05); P.teleport(660, -150, Math.PI); g.world.warm(660, -150); await g.stepSim(3, 0.05);
      if (window.gc) window.gc(); const R = g.renderer; return { heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geometries: R.info.memory.geometries, textures: R.info.memory.textures, programs: R.info.programs.length, chars: H.charCount, meshes: (() => { let n = 0; g.scene.traverse((q) => { if (q.isMesh) n++; }); return n; })() }; });
    result.memory.push(m); log('round ' + (i + 1) + ' ' + JSON.stringify(m));
  }
} catch (e) { console.log('ERR', e.message); errors.push('ERR ' + e.message); } finally { await browser.close(); }
result.errors = errors.slice(0, 10); fs.writeFileSync(OUT, JSON.stringify(result, null, 1)); console.log('errors:', errors.slice(0, 6).join(' | ') || 'none'); console.log('wrote', OUT);
