// Draw-call / triangle census of real rendered frames (headless Chromium), split by render pass and by what was drawn
// (building block shells, building detail, window joinery, props, trees, people, vehicles …), for A/B runs of the
// occlusion culling, building / prop LOD and shadow settings (65th request) on the SAME views in ONE browser session.
//   node tools/lod-census.mjs [quality=high] [scenario ...]     scenario = name:x:z:hour:heading   PORT env (default 5199)
//   CONFIGS env: comma list of config names to compare (default 'off,on'); see CONFIGS below.
// SwiftShader rasterises on the CPU: GPU time is not measured. Calls and triangles are hardware-independent.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [Q = 'high', ...SC] = process.argv.slice(2);
const scen = (SC.length ? SC : ['pettah:-128:-893:11:0', 'galle:-392:700:11:0', 'fort:-300:-700:11:1.57']).map((s) => { const [name, x, z, hour, hd] = s.split(':'); return { name, x: +x, z: +z, hour: +hour, hd: +(hd || 0) }; });
const CONFIGS = (process.env.CONFIGS || 'off,on').split(',');
const W = +(process.env.W || 1280), H = +(process.env.H || 720); const T0 = Date.now(); const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
const errors = []; const results = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errors.push(t); if (t.startsWith('[census]')) console.log(t); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  log('game in play mode');
  await page.evaluate((fine) => { window.__FINE = fine; }, !!process.env.FINE);
  await page.evaluate(() => {
    const g = window.__game, R = g.renderer, W = g.world;
    // category tags (read-only labels for this census)
    const tag = (o, c) => { if (o) o.userData.cat = c; };
    window.__tagAll = () => { tag(W.batched, 'bld.block'); for (const c of W.chunks) { tag(c.detail, 'bld.detail'); tag(c.win, 'bld.win'); tag(c.props, 'props'); }
      tag(W.propGroup, 'props'); tag(W.forest && W.forest.group, 'trees'); tag(W.grass && W.grass.mesh, 'grass'); tag(W.groundDetail && W.groundDetail.group, 'gdetail'); tag(W.landmarks && W.landmarks.group, 'landmarks');
      tag(W.cityStreets && W.cityStreets.group, 'street'); tag(W.water, 'water'); tag(W.parks, 'parks'); tag(W.vines && W.vines.warm, 'vines'); tag(W.outer, 'outer'); tag(W.boundary, 'boundary'); if (W.parkFeatures) tag(W.parkFeatures.group, 'parks'); if (W.fuel) tag(W.fuel.group, 'fuel'); };
    const catOf = (o) => { let p = o; while (p) { if (p.userData && p.userData.cat) return p.userData.cat; if (p.userData && (p.userData.vehicle || p.userData.vType)) return 'vehicle'; if (p.isSkinnedMesh || (p.children && p.children.some((m) => m.isSkinnedMesh))) return 'people'; if (p.parent === g.scene) return 'other:' + (p.name || p.type); p = p.parent; } return 'other'; };
    const lights = new Map(); const passOf = () => { const rt = R.getRenderTarget(); if (!rt) return 'screen'; if (!lights.size) g.scene.traverse((o) => { if (o.isLight && o.shadow) lights.set(o, o.name === 'sunFarShadow' ? 'shadowFar' : o === g.atmos.sun ? 'shadowSun' : 'shadowLamp'); });
      for (const [l, n] of lights) if (l.shadow.map === rt) return n; if (W.waterRefl && rt === W.waterRefl.rt) return 'refl'; return 'main'; };
    const orig = R.renderBufferDirect; const C = (window.__census = { on: false, T: {} }); const process = { env: { FINE: window.__FINE } };
    R.renderBufferDirect = function (cam, scene, geo, mat, obj, group) {
      if (C.on) { const p = passOf(); if (p !== 'screen') { const T = (C.T[p] ||= { calls: 0, tris: 0, by: {} }); const k0 = catOf(obj); const k = process.env.FINE && /^(bld\.block|props|street|landmarks|other)/.test(k0) ? k0 + ':' + (obj.name || mat.name || mat.type) : k0; const e = (T.by[k] ||= [0, 0]);
        let tris = 0; if (obj.isBatchedMesh) { const n = obj._multiDrawCount, cc = obj._multiDrawCounts; for (let i = 0; i < n; i++) tris += cc[i]; tris /= 3; }
        else { const idx = geo.index; let cnt = group ? group.count : (idx ? idx.count : geo.attributes.position ? geo.attributes.position.count : 0); cnt = Math.min(cnt, geo.drawRange.count); tris = cnt / 3 * (obj.isInstancedMesh ? obj.count : geo.isInstancedBufferGeometry ? geo.instanceCount : 1); if (!isFinite(tris)) tris = 0; }
        T.calls++; T.tris += tris; e[0]++; e[1] += tris; } }
      return orig.apply(this, arguments); };
  });
  for (const S of scen) {
    await page.evaluate(async (S) => { const g = window.__game; g.player.teleport(S.x, S.z, S.hd); g.world.warm(S.x, S.z); g.atmos.hour = S.hour; g.atmos.forceWeather && g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.atmos.wet = 0; await g.stepSim(90, 0.05); }, S);
    for (const cfg of CONFIGS) {
      const r = await page.evaluate(async (cfg) => { const g = window.__game; if (window.__perfConfig) window.__perfConfig(cfg); else if (cfg !== 'off' && cfg !== 'on') return { err: 'no __perfConfig' };
        await g.stepSim(20, 0.05); for (let i = 0; i < 8; i++) await new Promise((res) => requestAnimationFrame(res)); window.__tagAll();
        // the occlusion horizon is built over rendered frames (time-sliced): wait until it is in use (and refreshed once)
        if (window.__perfStats && (cfg === 'on' || cfg === 'occ')) { const u0 = window.__perfStats().occ.updates; for (let i = 0; i < 600; i++) { const s = window.__perfStats(); if (s.occOn && s.occ.updates >= u0 + 1) break; await new Promise((res) => requestAnimationFrame(res)); } for (let i = 0; i < 2; i++) await new Promise((res) => requestAnimationFrame(res)); }
        const C = window.__census; const acc = {}; const N = 4;
        for (let f = 0; f < N; f++) { C.T = {}; C.on = true; await new Promise((res) => requestAnimationFrame(res)); C.on = false;
          for (const [p, T] of Object.entries(C.T)) { const A = (acc[p] ||= { calls: 0, tris: 0, by: {} }); A.calls += T.calls / N; A.tris += T.tris / N; for (const [k, e] of Object.entries(T.by)) { const B = (A.by[k] ||= [0, 0]); B[0] += e[0] / N; B[1] += e[1] / N; } } }
        const out = {}; for (const [p, A] of Object.entries(acc)) out[p] = { calls: Math.round(A.calls), ktris: Math.round(A.tris / 1000), by: Object.fromEntries(Object.entries(A.by).sort((a, b) => b[1][1] - a[1][1]).slice(0, +(window.__TOPN || 14)).map(([k, e]) => [k, [Math.round(e[0]), Math.round(e[1] / 1000)]])) };
        const st = window.__perfStats ? window.__perfStats() : null; return { out, st }; }, cfg);
      results.push({ scen: S.name, cfg, ...r }); console.log(S.name, cfg, JSON.stringify(r));
    }
  }
  if (process.env.SUMMARY !== '0') { console.log('\nSUMMARY (calls / k triangles per frame)'); for (const r of results) { const o = r.out || {}; const f = (p) => o[p] ? `${o[p].calls}/${o[p].ktris}k` : '-'; console.log(`${r.scen.padEnd(10)} ${r.cfg.padEnd(8)} main ${f('main').padEnd(12)} sun ${f('shadowSun').padEnd(12)} far ${f('shadowFar').padEnd(12)} lamp ${f('shadowLamp')}`); } }
} catch (e) { console.log('ERR', (e.stack || e.message).split('\n').slice(0, 4).join(' / ')); } finally { console.log('errors:', errors.length ? errors.slice(0, 6).join(' | ') : 'none'); await browser.close(); }
