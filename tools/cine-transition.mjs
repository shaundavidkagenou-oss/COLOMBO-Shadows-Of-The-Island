// Time-of-day transition check in the real game (production build): a fixed street camera while the clock runs from FROM to TO
// hours in STEP-hour increments; every step goes through the game's own sim step, PostFX.update (eased grade weights) and the
// full post chain, then the frame's mean colour is read back (16×9). Reports the largest step-to-step change of the mean
// colour (8-bit) and of the grade weights, so a pop (a profile switching instead of blending) shows as a spike.
//   node tools/cine-transition.mjs [quality=medium] [from=15.5] [to=20] [step=0.05]      PORT env (default 5199)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [Q = 'medium', FROM = '15.5', TO = '20', STEP = '0.05'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=800,450'], defaultViewport: { width: 800, height: 450 } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const res = await page.evaluate(async (from, to, step) => {
    const g = window.__game, A = g.atmos, cam = [-401.5, 1.8, 718], look = [-399, 2.6, 640];
    g.noRender = true; g.world.warm(cam[0], cam[2]); g.player.teleport(cam[0] + 4, cam[2] - 6, 0); A.forceWeather && A.forceWeather('clear'); A.setWeather('clear', true); A.wet = 0;
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 9; const cx = cv.getContext('2d', { willReadFrequently: true }); const rows = [];
    for (let h = from; h <= to + 1e-6; h += step) {
      A.hour = h; await g.stepSim(1, 0.05); A.hour = h; g.player.camOverride = true; g.camera.position.set(...cam); g.camera.lookAt(...look); g.camera.updateMatrixWorld();
      g.post.update(A); g.post.render(1 / 60); cx.drawImage(g.renderer.domElement, 0, 0, 16, 9); const d = cx.getImageData(0, 0, 16, 9).data;
      let r = 0, gg = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } const n = d.length / 4;
      rows.push({ h: +h.toFixed(2), rgb: [r / n, gg / n, b / n].map((v) => +v.toFixed(1)), w: g.post.gradeW ? g.post.gradeW.map((v) => +v.toFixed(3)) : null, exp: +g.renderer.toneMappingExposure.toFixed(3) });
    }
    g.player.camOverride = false; return rows;
  }, +FROM, +TO, +STEP);
  let maxC = 0, atC = 0, maxW = 0, atW = 0;
  for (let i = 1; i < res.length; i++) { const a = res[i - 1], b = res[i]; const dc = Math.max(...b.rgb.map((v, k) => Math.abs(v - a.rgb[k]))); if (dc > maxC) { maxC = dc; atC = b.h; }
    if (a.w && b.w) { const dw = Math.max(...b.w.map((v, k) => Math.abs(v - a.w[k]))); if (dw > maxW) { maxW = dw; atW = b.h; } } }
  for (const r of res.filter((_, i) => i % 6 === 0)) console.log(r.h.toFixed(2).padStart(6), 'mean', r.rgb.join('/').padEnd(18), 'exp', r.exp, r.w ? 'w ' + r.w.join(' ') : '');
  console.log(`steps ${res.length}  largest step change: mean colour ${maxC.toFixed(2)} (8-bit) at ${atC} h` + (res[0].w ? `, grade weight ${maxW.toFixed(3)} at ${atW} h` : ''));
} catch (e) { console.log('ERR', (e.stack || e.message).split('\n').slice(0, 3).join(' / ')); } finally { await browser.close(); }
console.log('console errors:', errors.length ? errors.slice(0, 6).join(' | ') : 'none');
