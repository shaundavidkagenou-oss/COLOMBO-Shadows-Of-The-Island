// 98th: main-thread frame cost of the real game at fixed places — for before / after comparisons of renderer optimisations.
//   PORT=5199 node tools/frame-bench.mjs [label] [quality=medium] [places=pettah,fort]      env FRAMES=60 W=320 H=180
// Per place (same spot, hour, weather, preset and warm-up as tools/crowd-bench.mjs, plus the loading screen's vehicle warm-up):
//   · static: FRAMES renders from the fixed street camera; · walk: FRAMES renders along a scripted 0.09 m / frame walk with a
//     slow look-around (the culling, shadow box and occlusion horizon all keep changing); · sim: FRAMES updatePlay steps.
//   Reported per frame: main-thread ms of Game.frameStep (median / mean), draw calls, triangles, texture uploads
//   (texSubImage2D), three.js program lookups (getProgram → customProgramCacheKey) and objects drawn.
// The canvas is small (16:9 like the game, so the cameras cull exactly as at 1080p): SwiftShader rasterises on the same CPU, and
// at full size its raster threads would compete with the main thread being measured. GPU time is not measured here.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const PORT = process.env.PORT || 5199, LABEL = process.argv[2] || 'run', Q = process.argv[3] || 'medium', PLACES = (process.argv[4] || 'pettah,fort').split(',');
const FRAMES = +(process.env.FRAMES || 60), W = +(process.env.W || 320), H = +(process.env.H || 180);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 3600000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], defaultViewport: { width: W, height: H } });
const errors = []; const out = { label: LABEL, quality: Q, size: [W, H], places: {} };
try {
  const page = await browser.newPage(); page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.evaluateOnNewDocument((q) => localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false, dynamicRes: false })), Q);
  await page.goto(`http://localhost:${PORT}/?test&quick=play`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  for (const name of PLACES) {
    await page.evaluate(async (name) => {
      const L = window.__L, g = window.__game; g.noRender = true; const want = { pettah: [20, -800], fort: [-360, -800], kollupitiya: [-430, 120], borella: [780, 150], green: [-480, -420] }; const [tx, tz] = want[name]; let best = null, bd = 1e9;
      for (const s of L.segments) { if (s.crossing) continue; if (name === 'borella' && s.level < 2) continue; if (name !== 'borella' && s.level > 1) continue; const d = Math.hypot((s.x0 + s.x1) / 2 - tx, (s.z0 + s.z1) / 2 - tz); if (d < bd) { bd = d; best = s; } }
      const s = best, dx = s.x1 - s.x0, dz = s.z1 - s.z0, len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len, nx = uz, nz = -ux, off = (s.hw || 6) + 1.6; const cx = s.x0 + ux * len * 0.25 + nx * off, cz = s.z0 + uz * len * 0.25 + nz * off;
      window.__bp = { cam: [cx, 1.75, cz], look: [cx + ux * 40 - nx * off * 0.6, 1.4, cz + uz * 40 - nz * off * 0.6] };
      g.editorHook = null; g.player.camOverride = false; g.world.warm(cx, cz); g.player.teleport(cx, cz, 0); g.atmos.hour = 10.5; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.atmos.wet = 0;
      if (!window.__benchWarm) { window.__benchWarm = true; await g.traffic.warmModels([[cx, cz]]); } // the loading screen's vehicle / driver warm-up (quick=play skips it)
      for (let i = 0; i < 300; i += 50) await g.stepSim(Math.min(50, 300 - i), 0.05);
      const v = window.__bp, cam = g.camera; g.player.camOverride = true; g.editorHook = () => { g.atmos.hour = 10.5; cam.position.set(...v.cam); cam.lookAt(...v.look); cam.updateMatrixWorld(); }; g.noRender = false;
    }, name);
    await new Promise((r) => setTimeout(r, 1500));
    const r = await page.evaluate(async (N) => {
      const g = window.__game, R = g.renderer, gl = R.getContext(), THREE = window.__THREE, px = new Uint8Array(4); g.noRender = true; const v = window.__bp, cam = g.camera;
      for (let i = 0; i < 40; i++) g.cullStep(1 / 60); // the occlusion horizon (built over a few frames in the game)
      const C = { tex: 0, prog: 0 }; const tsi = gl.texSubImage2D; gl.texSubImage2D = function (...a) { C.tex++; return tsi.apply(gl, a); };
      const pk = THREE.Material.prototype.customProgramCacheKey; THREE.Material.prototype.customProgramCacheKey = function () { C.prog++; return pk.call(this); };
      const own = []; g.scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; if (o.customDepthMaterial) ms.push(o.customDepthMaterial); for (const m of ms) if (Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey') && !m.__benchW) { const f = m.customProgramCacheKey; m.customProgramCacheKey = function () { C.prog++; return f.call(this); }; m.__benchW = f; own.push(m); } });
      const P0 = new THREE.Vector3(...v.cam), L0 = new THREE.Vector3(...v.look), dir = L0.clone().sub(P0).setY(0).normalize(), UP = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
      const series = (walk) => { const ts = []; let calls = 0, tris = 0, tex = 0, prog = 0, drawn = 0; R.info.autoReset = false;
        for (let i = -3; i < N; i++) { const k = Math.max(0, i);
          if (walk) g.editorHook = () => { g.atmos.hour = 10.5; cam.position.copy(P0).addScaledVector(dir, k * 0.09); d.copy(dir).applyAxisAngle(UP, Math.sin(k * 0.07) * 0.25); cam.lookAt(cam.position.x + d.x * 40, 1.4 + Math.sin(k * 0.05) * 0.3, cam.position.z + d.z * 40); cam.updateMatrixWorld(); };
          C.tex = 0; C.prog = 0; R.info.reset(); const t = performance.now(); g.frameStep(1 / 60); const ms = performance.now() - t; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          if (i >= 0) { ts.push(ms); calls += R.info.render.calls; tris += R.info.render.triangles; tex += C.tex; prog += C.prog; drawn += (g.cullLast && g.cullLast.drawn) || 0; } }
        R.info.autoReset = true; const s = [...ts].sort((a, b) => a - b);
        return { median: +s[s.length >> 1].toFixed(2), mean: +(ts.reduce((a, b) => a + b, 0) / N).toFixed(2), p90: +s[Math.floor(N * 0.9)].toFixed(2), calls: Math.round(calls / N), trisK: Math.round(tris / N / 1000), texUploads: +(tex / N).toFixed(1), programLookups: +(prog / N).toFixed(1), batchInstancesDrawn: Math.round(drawn / N) }; };
      const stat = series(false), walk = series(true);
      gl.texSubImage2D = tsi; THREE.Material.prototype.customProgramCacheKey = pk; for (const m of own) { m.customProgramCacheKey = m.__benchW; delete m.__benchW; }
      g.editorHook = null; g.player.camOverride = false; const st = []; for (let i = 0; i < N; i++) { const t = performance.now(); g.updatePlay(1 / 60); st.push(performance.now() - t); if (i % 10 === 9) await null; }
      const ss = [...st].sort((a, b) => a - b); const sim = { median: +ss[N >> 1].toFixed(2), mean: +(st.reduce((a, b) => a + b, 0) / N).toFixed(2), max: +ss[N - 1].toFixed(1) };
      return { static: stat, walk, sim, peds: g.crowd.peds.length, vehicles: g.traffic.vehicles.length, programs: R.info.programs ? R.info.programs.length : null };
    }, FRAMES);
    out.places[name] = r; console.log(name, JSON.stringify(r));
  }
} catch (e) { console.log('ERR', e); }
out.errors = errors.slice(0, 5); console.log('RESULT', JSON.stringify(out));
await browser.close(); process.exit(0);
