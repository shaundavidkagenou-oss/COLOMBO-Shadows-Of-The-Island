// 79th: light balance probe. For a list of times of day (clear sky) it measures, in linear HDR, what each light the game
// uses delivers to a white matte surface facing up (a road / roof) and to a wall facing away from the sun (shade):
// the sun (direct), the hemisphere light, the ambient light and the environment map (PMREM) — each rendered alone with
// the game's real light objects and environment into a float target, plus the tone-mapping exposure. Real clear-sky
// daylight is roughly 5 : 1 (direct : sky) on the ground at midday and the shaded wall gets ~1/6 of a sunlit one.
//   PORT=5199 node tools/light-balance.mjs [hours=8,10,12.5,15,17,17.8,18.3,19,21]
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const hours = (process.argv[2] || '6,7,8,10,12.5,15,17,17.8,18.3,19,21').split(',').map(Number);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1200000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errors = [];
try {
  const page = await browser.newPage(); page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const rows = await page.evaluate(async (hours) => {
    const g = window.__game, T = window.__THREE, A = g.atmos, R = g.renderer; const out = [];
    const rt = new T.WebGLRenderTarget(8, 8, { type: T.FloatType, depthBuffer: true }); const buf = new Float32Array(8 * 8 * 4);
    const mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }); const plane = new T.Mesh(new T.PlaneGeometry(4, 4), mat);
    const cam = new T.PerspectiveCamera(10, 1, 0.1, 100); const sc = new T.Scene(); sc.add(plane);
    const read = () => { if (SVm) SVm.SV_P[0] = 0; R.setRenderTarget(rt); R.clear(); R.render(sc, cam); R.readRenderTargetPixels(rt, 0, 0, 8, 8, buf); R.setRenderTarget(null); let a = 0; for (let i = 0; i < 64; i++) a += 0.2126 * buf[i * 4] + 0.7152 * buf[i * 4 + 1] + 0.0722 * buf[i * 4 + 2]; return a / 64; };
    let SVm = null; try { SVm = await import('/src/gfx/SkyVis.js'); } catch { /* older build */ } const svOn = SVm ? SVm.SV_P[0] : 0;
    const tm = R.toneMapping; R.toneMapping = T.NoToneMapping;
    for (const h of hours) {
      A.hour = h; A.forceWeather('clear'); A.setWeather('clear', true); A.envTimer = 0; await g.stepSim(4, 0.05);
      const sun = A.sun, sd = A.sunDir; const res = { hour: h, expo: +R.toneMappingExposure.toFixed(3), elevDeg: +(Math.asin(Math.max(-1, Math.min(1, sd.y))) * 57.3).toFixed(1), sunI: +sun.intensity.toFixed(2), hemiI: +A.hemi.intensity.toFixed(2), ambI: +A.ambient.intensity.toFixed(2), envI: +g.scene.environmentIntensity.toFixed(2) };
      for (const face of ['up', 'shadeWall', 'sunWall']) {
        plane.position.set(0, 0, 0); plane.rotation.set(0, 0, 0);
        const L = new T.Vector3().copy(sun.position).sub(sun.target.position).normalize(); // towards the light
        if (face === 'up') { plane.rotation.x = -Math.PI / 2; cam.position.set(0, 20, 0.001); }
        else { const d = new T.Vector3(L.x, 0, L.z).normalize(); if (face === 'shadeWall') d.negate(); plane.lookAt(d); cam.position.copy(d).multiplyScalar(20); }
        cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
        const comp = {};
        const lights = { sun: () => { const l = new T.DirectionalLight(sun.color, sun.intensity); l.position.copy(L).multiplyScalar(10); return l; }, hemi: () => { const l = new T.HemisphereLight(A.hemi.color, A.hemi.groundColor, A.hemi.intensity); return l; }, amb: () => new T.AmbientLight(A.ambient.color, A.ambient.intensity) };
        for (const [k, mk] of Object.entries(lights)) { if (k === 'sun' && face === 'shadeWall') { comp.sun = 0; continue; } const l = mk(); sc.add(l); sc.environment = null; comp[k] = +read().toFixed(4); sc.remove(l); }
        sc.environment = g.scene.environment; sc.environmentIntensity = g.scene.environmentIntensity; comp.env = +read().toFixed(4); sc.environment = null;
        const indirect = comp.hemi + comp.amb + comp.env; comp.total = +(comp.sun + indirect).toFixed(4); comp.direct_over_indirect = +(comp.sun / Math.max(1e-6, indirect)).toFixed(2); comp.display = +(comp.total * res.expo).toFixed(3);
        res[face] = comp;
      }
      out.push(res);
    }
    R.toneMapping = tm; rt.dispose(); if (SVm) SVm.SV_P[0] = svOn; return out;
  }, hours);
  for (const r of rows) console.log(JSON.stringify(r));
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
console.log('errors:', errors.slice(0, 4).join(' | ') || 'none');
