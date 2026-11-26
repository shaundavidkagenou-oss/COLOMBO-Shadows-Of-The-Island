// 96th: crowd + traffic variety / performance benchmark (real game in headless Chromium / SwiftShader).
//   PORT=5199 node tools/crowd-bench.mjs [outDir=dev/tmp/crowd] [quality=medium] [label=run]
// Fixed places (same spot, camera, hour, weather, graphics settings and density on every run): a Pettah bazaar street,
// the Fort business district, Galle Road in Kollupitiya (commercial), a Borella residential street and the Galle Face
// Green. At each: teleport, let the city populate (SIM frames of the real update), then freeze and measure:
//   frame:   ms per frameStep (gl.readPixels sync → whole frame, render included), draw calls, triangles, geometries
//   crowd:   people, distinct presets / looks (preset person × colours × face), identical-look pairs within 25 m and in view,
//            same-preset pairs within 25 m, profile mix
//   traffic: moving + parked vehicles, distinct models, same-model pairs within 90 m (moving) / 20 m (parked)
//   cost:    ms spent in Crowd.spawn / Traffic.spawn per spawned person / vehicle (wrapped), JS heap
// Then LOOPS round trips through all places (repeated driving through the same streets) report geometry count and JS heap
// after each loop (memory growth). SwiftShader ms are RELATIVE between runs on this machine, never a GPU frame rate.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'node:fs';
const [OUT = 'dev/tmp/crowd', Q = 'medium', LABEL = 'run'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const N = +(process.env.N || 10), SIM = +(process.env.SIM || 300), LOOPS = +(process.env.LOOPS || 2), LSIM = +(process.env.LSIM || 150), PORT = process.env.PORT || 5199;
const PLACES = (process.env.PLACES || 'pettah,fort,kollupitiya,borella,green').split(',');
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 3600000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720', '--enable-precise-memory-info', '--js-flags=--expose-gc'], defaultViewport: { width: 1280, height: 720 } });
const errors = []; const rows = []; const loops = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto(`http://localhost:${PORT}/?test&quick=play`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const places = await page.evaluate((names) => {
    const L = window.__L; const want = { pettah: [20, -800], fort: [-360, -800], kollupitiya: [-430, 120], borella: [780, 150], green: [-480, -420] };
    const out = {};
    for (const n of names) { const [tx, tz] = want[n]; let best = null, bd = 1e9; // the nearest street segment (not an arterial for the residential spot)
      for (const s of L.segments) { if (s.crossing) continue; if (n === 'borella' && s.level < 2) continue; if (n !== 'borella' && s.level > 1) continue; const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2; const d = Math.hypot(mx - tx, mz - tz); if (d < bd) { bd = d; best = s; } }
      const s = best, dx = s.x1 - s.x0, dz = s.z1 - s.z0, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, nx = uz, nz = -ux, off = (s.hw || 6) + 1.6;
      const cx = s.x0 + ux * len * 0.25 + nx * off, cz = s.z0 + uz * len * 0.25 + nz * off;
      out[n] = { focus: [cx, cz], cam: [cx, 1.75, cz], look: [cx + ux * 40 - nx * off * 0.6, 1.4, cz + uz * 40 - nz * off * 0.6], info: `${L.districtIdAt(cx, cz)} lvl${s.level}` }; }
    // spawn-cost instrumentation (identical before / after)
    const g = window.__game; const W = (window.__spawnCost = { crowd: [0, 0], traffic: [0, 0] });
    const wrap = (o, name, key, ok) => { const f = o[name].bind(o); o[name] = (...a) => { const t = performance.now(); const r = f(...a); W[key][0] += performance.now() - t; if (ok(r)) W[key][1]++; return r; }; };
    wrap(g.crowd, 'spawn', 'crowd', (r) => !!r); const n0 = () => g.traffic.vehicles.length; let last = 0; wrap(g.traffic, 'spawn', 'traffic', () => { const n = n0(); const d = n > last; last = n; return d; });
    return out;
  }, PLACES);
  console.log('places', JSON.stringify(Object.fromEntries(Object.entries(places).map(([k, v]) => [k, v.info]))));
  const measure = async (name, v, shoot) => {
    await page.evaluate(async (v, sim) => { const g = window.__game; g.editorHook = null; g.player.camOverride = false; g.world.warm(v.focus[0], v.focus[1]); g.player.teleport(v.focus[0], v.focus[1], 0);
      g.atmos.hour = 10.5; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.atmos.wet = 0; window.__spawnCost.crowd = [0, 0]; window.__spawnCost.traffic = [0, 0];
      for (let i = 0; i < sim; i += 50) await g.stepSim(Math.min(50, sim - i), 0.05);
      g.player.camOverride = true; const cam = g.camera; g.editorHook = () => { g.atmos.hour = 10.5; cam.position.set(...v.cam); cam.lookAt(...v.look); cam.updateMatrixWorld(); };
    }, v, SIM);
    await new Promise((r) => setTimeout(r, 1500));
    const m = await page.evaluate((n) => { const g = window.__game, R = g.renderer, gl = R.getContext(); const px = new Uint8Array(4); const THREE = window.__THREE;
      for (let i = 0; i < 3; i++) { g.frameStep(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
      const ts = []; let calls = 0, tris = 0; const ar = R.info.autoReset; R.info.autoReset = false;
      for (let i = 0; i < n; i++) { R.info.reset(); const t = performance.now(); g.frameStep(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t); calls += R.info.render.calls; tris += R.info.render.triangles; }
      R.info.autoReset = ar; ts.sort((a, b) => a - b);
      const cam = g.camera; const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); const V3 = new THREE.Vector3();
      const inView = (x, z, y = 1) => fr.containsPoint(V3.set(x, y, z)) && Math.hypot(x - cam.position.x, z - cam.position.z) < 70;
      const P = g.crowd.peds.filter((p) => p.sp && p.ch); const look = (sp) => [sp.preset, sp.top, sp.skirtCol || sp.bottom, sp.hair, sp.skin, sp.hairColor, sp.faceV, sp.shoes].join('|');
      const presets = new Set(P.map((p) => p.sp.preset)), looks = new Set(P.map((p) => look(p.sp))); let samePre25 = 0, sameLook25 = 0, sameLookView = 0;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const a = P[i], b = P[j]; const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (a.sp.preset === b.sp.preset && d < 25) samePre25++; const sl = look(a.sp) === look(b.sp); if (sl && d < 25) sameLook25++; if (sl && inView(a.x, a.z) && inView(b.x, b.z)) sameLookView++; }
      const view = P.filter((p) => inView(p.x, p.z)); const viewLooks = new Set(view.map((p) => look(p.sp)));
      const prof = {}; for (const p of P) prof[p.sp.profile] = (prof[p.sp.profile] || 0) + 1;
      const T = g.traffic, Vm = T.vehicles.filter((v) => !v.parked), Vp = T.parked; const models = new Set(Vm.map((v) => v.type)); let sameMod90 = 0, sameLookV90 = 0, samePark20 = 0;
      for (let i = 0; i < Vm.length; i++) for (let j = i + 1; j < Vm.length; j++) { const a = Vm[i], b = Vm[j]; const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < 90 && a.type === b.type && a.type !== 'tuktuk') sameMod90++; if (d < 90 && a.look && a.look === b.look) sameLookV90++; }
      for (let i = 0; i < Vp.length; i++) for (let j = i + 1; j < Vp.length; j++) { const a = Vp[i], b = Vp[j]; if (a.type === b.type && a.type !== 'tuktuk' && Math.hypot(a.x - b.x, a.z - b.z) < 20) samePark20++; }
      const vView = Vm.concat(Vp).filter((v) => inView(v.x, v.z, 0.8)); const vViewModels = new Set(vView.map((v) => v.type));
      const tuk = Vm.filter((v) => v.type === 'tuktuk').length; const W = window.__spawnCost; const mem = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0;
      const VS = window.__variantStats ? { built: window.__variantStats.built, live: window.__variantStats.live(), idle: window.__variantStats.idle() } : null;
      return { ms: +(ts.reduce((a, b) => a + b, 0) / n).toFixed(1), p50: +ts[n >> 1].toFixed(1), calls: Math.round(calls / n), tris: Math.round(tris / n), geos: R.info.memory.geometries, tex: R.info.memory.textures, heapMB: +mem.toFixed(0),
        peds: P.length, presets: presets.size, looks: looks.size, samePre25, sameLook25, inView: view.length, viewLooks: viewLooks.size, sameLookView, prof,
        moving: Vm.length, parked: Vp.length, models: models.size, tuk, sameMod90, sameLookV90, samePark20, vInView: vView.length, vViewModels: vViewModels.size,
        crowdSpawnMs: W.crowd[1] ? +(W.crowd[0] / W.crowd[1]).toFixed(2) : null, crowdSpawned: W.crowd[1], trafficSpawnMs: W.traffic[1] ? +(W.traffic[0] / W.traffic[1]).toFixed(2) : null, trafficSpawned: W.traffic[1], VS }; }, N);
    if (shoot) await page.screenshot({ path: `${OUT}/${LABEL}-${name}.png` });
    return m;
  };
  for (const name of PLACES) { const m = await measure(name, places[name], true); rows.push({ place: name, ...m });
    console.log(name.padEnd(12), `ms ${m.ms} calls ${m.calls} tris ${(m.tris / 1e6).toFixed(2)}M geos ${m.geos} heap ${m.heapMB}MB | peds ${m.peds} presets ${m.presets} looks ${m.looks} sameLook25 ${m.sameLook25} samePreset25 ${m.samePre25} view ${m.inView}/${m.viewLooks} looks dupView ${m.sameLookView} | veh ${m.moving}+${m.parked}p models ${m.models} tuk ${m.tuk} sameModel90 ${m.sameMod90} sameLook90 ${m.sameLookV90} samePark20 ${m.samePark20} view ${m.vInView}/${m.vViewModels} | spawn ms crowd ${m.crowdSpawnMs} (${m.crowdSpawned}) traffic ${m.trafficSpawnMs} (${m.trafficSpawned})`, JSON.stringify(m.prof), m.VS ? JSON.stringify(m.VS) : ''); }
  for (let l = 0; l < LOOPS; l++) { for (const name of PLACES) await page.evaluate(async (v, lsim) => { const g = window.__game; g.editorHook = null; g.player.camOverride = false; g.player.teleport(v.focus[0], v.focus[1], 0); for (let i = 0; i < lsim; i += 50) await g.stepSim(50, 0.05); }, places[name], LSIM);
    const r = await page.evaluate(() => { if (window.gc) window.gc(); const g = window.__game; return { geos: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(0) : 0, peds: g.crowd.peds.length, veh: g.traffic.vehicles.length, VS: window.__variantStats ? { built: window.__variantStats.built, freed: window.__variantStats.freed, live: window.__variantStats.live(), idle: window.__variantStats.idle() } : null }; });
    loops.push(r); console.log('loop', l + 1, JSON.stringify(r)); }
} catch (e) { console.log('ERR', e.stack || e.message); } finally { await browser.close(); }
fs.writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify({ label: LABEL, quality: Q, rows, loops }, null, 1));
console.log('mean ms', rows.length ? (rows.reduce((a, r) => a + r.ms, 0) / rows.length).toFixed(1) : '-');
console.log('errors:', errors.slice(0, 8).join(' | ') || 'none');
