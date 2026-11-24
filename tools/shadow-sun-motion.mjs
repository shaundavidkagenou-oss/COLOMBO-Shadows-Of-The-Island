// Shadow motion as the sun moves (production build): node tools/shadow-sun-motion.mjs [quality=medium] [hour=17.2] [steps=3]
// World frozen, camera fixed (Fort, 30 m up, looking north). For the 35th scheme ('old': 0.0025 rad steps of sun angle) and
// the 39th one ('new': 2 mm-per-metre steps of the ground shadow offset for the near map, 5 mm for the far map, far map redrawn
// at most every 0.25 s): how many shadow steps one real minute of play makes at this hour (game clock at Settings.timeScale,
// 60 fps), and how many pixels one step changes (rendered, near + far maps refitted as Atmosphere.update does). Also the
// change of one frame of unquantised motion and a noise floor (same direction rendered twice: must be 0).
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [Q = 'medium', HOUR = '17.2', FRAMES = '3'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const res = await page.evaluate(async (hour, frames) => {
    const g = window.__game, A = g.atmos, T = window.__THREE; g.hud.root.style.display = 'none'; g.story.state.wanted = 0;
    const px = -430, pz = -1008; g.world.warm(px, pz); g.player.teleport(px, pz, 0); A.hour = hour; A.setWeather('clear', true); A.wet = 0;
    await g.stepSim(30, 0.05); A.update(0.016, new T.Vector3(px, 0, pz), g.camera, 0); g.noRender = true; g.player.camOverride = true;
    const cam = g.camera; cam.position.set(-430, 30, -1010); cam.lookAt(-430, 5, -930); cam.updateMatrixWorld();
    const focus = new T.Vector3(px, 0, pz); const cv = g.renderer.domElement, W = 640, H = 360, off = document.createElement('canvas'); off.width = W; off.height = H; const ox = off.getContext('2d', { willReadFrequently: true });
    const grab = () => { g.renderer.render(g.scene, cam); ox.drawImage(cv, 0, 0, W, H); return ox.getImageData(0, 0, W, H).data; };
    const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) n++; return n; };
    const sunDir = (h, out) => { const th = ((h - 6.15) / (18.3 - 6.15)) * Math.PI; return out.set(Math.cos(th), Math.sin(th) * 0.97, 0.22).normalize(); };
    const angQ = (L, q, out) => { const az = Math.atan2(L.z, L.x), el = Math.asin(Math.max(-1, Math.min(1, L.y))); const a = Math.round(az / q) * q, e = Math.round(el / q) * q; return out.set(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)); };
    const offQ = (L, s, out) => { const ly = Math.max(0.052, L.y); return out.set(Math.round(L.x / ly / s) * s, 1, Math.round(L.z / ly / s) * s).normalize(); };
    const perFrameH = 1 / 60 / (g.settings?.timeScale || 2.0) / 60; // game hours per 60 fps frame
    const L = new T.Vector3(), Ln = new T.Vector3(), Lf = new T.Vector3(), P = new T.Vector3(); const out = {};
    const Qn = { old: [(x, o) => angQ(x, 0.0025, o), (x, o) => angQ(x, 0.0025, o)], new: [(x, o) => offQ(x, 0.002, o), (x, o) => offQ(x, 0.005, o)] };
    // steps per real second over one real minute (pure maths), then the image change of single steps (rendered)
    for (const scheme of ['old', 'new']) {
      const [qn, qf] = Qn[scheme]; const times = []; P.set(0, 0, 0); let lastF = -1e9, fk = new T.Vector3(); let farR = 0;
      for (let k = 0; k < 3600; k++) { sunDir(hour + k * perFrameH, L); qn(L, Ln); if (!Ln.equals(P)) { times.push(k); P.copy(Ln); } qf(L, Lf); if (!Lf.equals(fk) && (scheme === 'old' || k - lastF >= 15)) { fk.copy(Lf); lastF = k; farR++; } }
      const r = { nearStepsPerMin: times.length - 1, farRedrawsPerMinFromSun: scheme === 'new' ? farR - 1 : 'n/a (no far map)', stepPx: [] };
      for (let j = 1; j <= Math.min(frames, times.length - 1); j++) {
        const pair = [times[j] - 1, times[j]]; const imgs = [];
        for (const k of pair) { sunDir(hour + k * perFrameH, L); qn(L, Ln); qf(L, Lf); A.fitSunShadow(focus, cam, Ln); A.far.dirty = true; A.updateFarShadow(1 / 60, focus, cam, Lf); imgs.push(grab()); }
        r.stepPx.push(diff(imgs[0], imgs[1]));
      }
      out[scheme] = r;
    }
    { const imgs = []; for (const k of [0, 1]) { sunDir(hour + k * perFrameH, L); A.fitSunShadow(focus, cam, L); A.far.dirty = true; A.updateFarShadow(1 / 60, focus, cam, L); imgs.push(grab()); } out.continuousOneFramePx = diff(imgs[0], imgs[1]); }
    { const imgs = []; for (let k = 0; k < 2; k++) { offQ(sunDir(hour, L), 0.002, Ln); offQ(L, 0.005, Lf); A.fitSunShadow(focus, cam, Ln); A.far.dirty = true; A.updateFarShadow(1 / 60, focus, cam, Lf); imgs.push(grab()); } out.noiseFloorPx = diff(imgs[0], imgs[1]); }
    return { hour, px: W * H, out };
  }, +HOUR, +FRAMES);
  console.log(JSON.stringify(res, null, 1));
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
console.log('errors:', errors.slice(0, 6).join(' | ') || 'none');
