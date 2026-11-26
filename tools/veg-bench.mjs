// 95th: vegetation benchmark + visual review (real renders in headless Chromium / SwiftShader).
//   PORT=5199 node tools/veg-bench.mjs [outDir=dev/tmp/veg] [quality=medium] [label=run] [W=1280] [H=720]
// Fixed views (same location, camera, time of day, weather, graphics settings, vegetation density on every run):
//   closeup   — 2.5–4 m from a park tree crown (individual leaves)        tree-mid — 14 m from a big park tree
//   park-wide — eye level across Viharamahadevi Park (near / mid / far)    bushes   — the densest shrub bed near the park
//   street    — a tree-lined street                                         distant  — 45 m up over the park (far LODs)
//   dusk / night variants of park-wide (lighting)
// For each view: wall time per frameStep (world frozen, camera fixed, gl.readPixels sync → whole-frame time, render included),
// draws / triangles of the frame, the forest's own multi-draws and triangles per LOD, and a screenshot.
// ENV: FOLIAGE=legacy|atlas (Settings 'leafMesh' off / on; default = whatever the build defaults to), N=frames per view (12),
//      VIEWS=comma list. SwiftShader is a CPU rasteriser: its ms are a RELATIVE measure between runs of this tool on this
//      machine (more fragments / triangles → more ms), never a GTX 1660S frame rate.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'node:fs';
const [OUT = 'dev/tmp/veg', Q = 'medium', LABEL = 'run', W = '1280', H = '720'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const N = +(process.env.N || 12), FOL = process.env.FOLIAGE || '', PORT = process.env.PORT || 5199;
const VIEWS = (process.env.VIEWS || 'closeup,tree-mid,park-wide,bushes,street,distant,dusk,night').split(',');
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: +W, height: +H } });
const errors = []; const rows = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument((q, fol) => { const s = { quality: q, showFps: false }; if (fol) s.leafMesh = fol !== 'legacy'; localStorage.setItem('colombo.settings.v1', JSON.stringify(s)); }, Q, FOL);
  await page.goto(`http://localhost:${PORT}/?test&quick=play`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  // pick the views from the plan (deterministic: the plan is seeded)
  const views = await page.evaluate(() => {
    const g = window.__game, P = g.world.plan, T = P.trees, PL = P.plants || []; const LY = 0;
    const near = (x, z, r, list) => list.filter((t) => Math.hypot(t.x - x, t.z - z) < r);
    const big = new Set(['rain', 'mara', 'nuga', 'bo', 'mango', 'kottamba', 'flamboyant']);
    const park = near(90, -60, 70, T).filter((t) => big.has(t.type)).sort((a, b) => Math.hypot(a.x - 90, a.z + 60) - Math.hypot(b.x - 90, b.z + 60));
    const t0 = park[0] || T[0], t1 = park.find((t) => t.type !== t0.type) || park[1] || t0;
    // densest shrub spot within 150 m of the park
    let best = null, bn = 0; for (const p of near(90, -60, 160, PL)) { const n = near(p.x, p.z, 5, PL).length; if (n > bn) { bn = n; best = p; } }
    // street: the point with the most trees within 40 m among trees outside the park
    let st = null, sn = 0; for (let i = 0; i < T.length; i += 7) { const t = T[i]; if (Math.hypot(t.x - 90, t.z + 60) < 220) continue; const n = near(t.x, t.z, 40, T).length; if (n > sn) { sn = n; st = t; } }
    const H = (t) => 6.5 * (t.s || 1);
    return {
      closeup: { focus: [t0.x, t0.z], cam: [t0.x + 3.2, LY + H(t0) * 1.05, t0.z + 2.2], look: [t0.x, LY + H(t0) * 1.15, t0.z], info: t0.type },
      'tree-mid': { focus: [t1.x, t1.z], cam: [t1.x + 11, LY + 1.7, t1.z + 9], look: [t1.x, LY + 6, t1.z], info: t1.type },
      'park-wide': { focus: [70, -40], cam: [60, LY + 1.8, -20], look: [110, LY + 4, -80] },
      bushes: { focus: [best.x, best.z], cam: [best.x + 3.4, LY + 1.5, best.z + 2.6], look: [best.x, LY + 0.5, best.z], info: best.type + ' ×' + bn },
      street: { focus: [st.x, st.z], cam: [st.x + 4, LY + 1.8, st.z + 4], look: [st.x - 30, LY + 4, st.z - 30], info: sn + ' trees/40m' },
      distant: { focus: [90, -60], cam: [20, LY + 45, 40], look: [110, LY, -90] },
      dusk: { focus: [70, -40], cam: [60, LY + 1.8, -20], look: [110, LY + 4, -80], hour: 18.4 },
      night: { focus: [70, -40], cam: [60, LY + 1.8, -20], look: [110, LY + 4, -80], hour: 22 },
    };
  });
  console.log('views', JSON.stringify(Object.fromEntries(Object.entries(views).map(([k, v]) => [k, v.info || '']))));
  const lm = await page.evaluate(() => { const g = window.__game; return { leafMesh: g.settings ? null : null, s: JSON.parse(localStorage.getItem('colombo.settings.v1') || '{}').leafMesh }; });
  console.log('label', LABEL, 'quality', Q, 'foliage setting', FOL || '(default)', JSON.stringify(lm));
  for (const name of VIEWS) {
    const v = views[name]; if (!v) continue;
    await page.evaluate(async (v) => { const g = window.__game; g.editorHook = null; g.world.warm(v.focus[0], v.focus[1]); g.player.teleport(v.focus[0] + 1.5, v.focus[1] + 1.5, 0);
      g.atmos.hour = v.hour ?? 10; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.atmos.wet = 0; await g.stepSim(80, 0.05);
      g.player.camOverride = true; const cam = g.camera;
      g.editorHook = (dt) => { g.atmos.hour = v.hour ?? 10; cam.position.set(...v.cam); cam.lookAt(...v.look); cam.updateMatrixWorld(); if (g.world.forest) g.world.forest.update({ x: v.focus[0], z: v.focus[1] }, cam); };
    }, v);
    await new Promise((r) => setTimeout(r, 2500));
    const m = await page.evaluate((n) => { const g = window.__game, R = g.renderer, gl = R.getContext(); const px = new Uint8Array(4);
      for (let i = 0; i < 3; i++) { g.frameStep(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } // warm (shader compiles, uploads)
      const ts = []; let calls = 0, tris = 0; const ar = R.info.autoReset; R.info.autoReset = false;
      for (let i = 0; i < n; i++) { R.info.reset(); const t = performance.now(); g.frameStep(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t); calls += R.info.render.calls; tris += R.info.render.triangles; }
      R.info.autoReset = ar; ts.sort((a, b) => a - b);
      const F = g.world.forest; let fd = 0, ft = 0; const per = {}; if (F) for (const bm of F.meshes) { let t = 0; for (let i = 0; i < bm._multiDrawCount; i++) t += bm._multiDrawCounts[i] / 3; fd += bm._multiDrawCount; ft += t; per[bm.name.replace('forest:', '')] = [bm._multiDrawCount, Math.round(t)]; }
      return { ms: +(ts.reduce((a, b) => a + b, 0) / n).toFixed(1), p50: +ts[n >> 1].toFixed(1), calls: Math.round(calls / n), tris: Math.round(tris / n), forestDraws: fd, forestTris: Math.round(ft), lod: F && F.stats.lod ? F.stats.lod : null, per }; }, N);
    await page.screenshot({ path: `${OUT}/${LABEL}-${name}.png` });
    rows.push({ view: name, ...m }); console.log(name.padEnd(10), `ms ${m.ms} (p50 ${m.p50})  calls ${m.calls}  tris ${(m.tris / 1e6).toFixed(2)}M  forest draws ${m.forestDraws} tris ${(m.forestTris / 1e6).toFixed(2)}M`, m.lod ? 'lod ' + JSON.stringify(m.lod) : '', JSON.stringify(m.per));
  }
} catch (e) { console.log('ERR', e.stack || e.message); } finally { await browser.close(); }
fs.writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify({ label: LABEL, quality: Q, foliage: FOL, rows }, null, 1));
console.log('mean ms', rows.length ? (rows.reduce((a, r) => a + r.ms, 0) / rows.length).toFixed(1) : '-');
console.log('errors:', errors.slice(0, 6).join(' | ') || 'none');
