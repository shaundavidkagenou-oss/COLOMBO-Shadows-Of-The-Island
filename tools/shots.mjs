// Generic in-game screenshots (production build, headless Chromium): one session, a JSON list of shots.
//   node tools/shots.mjs <spec.json> [outDir=/tmp/shots] [quality=medium]        PORT, W, H env
// spec: [{ name, hour=12, weather='clear', cam:[x,y,z], look:[x,y,z], at:[x,z] (player, default under the camera),
//          setup: 'js body run in the page with g (the game), L (Layout), T (THREE); may return a { cam, look } override',
//          frames: n (real frames rendered before the capture, default 30), keep: true (do not reset the camera override) }]
// A shot's setup may also be async and may drive the game (stepSim) — e.g. the Street Customs drive-in sequence.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'fs';
const [specFile, outDir = '/tmp/shots', Q = 'medium'] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const W = +(process.env.W || 960), H = +(process.env.H || 540);
fs.mkdirSync(outDir, { recursive: true });
const errors = [];
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning' || m.type() === 'warn') && !/favicon|404|GPU stall|ReadPixels|WebGL-|swiftshader|willReadFrequently|KHR_parallel/i.test(t)) errors.push(`${m.type()}: ${t.slice(0, 240)}`); if (t.startsWith('[shot]')) console.log(t); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.story.state.wanted = 0; });
  for (const s of spec) {
    const t0 = Date.now();
    const info = await page.evaluate(async (s) => {
      const g = window.__game, L = window.__L, T = window.__THREE; g.hud.root.style.display = s.hud ? '' : 'none';
      const A = g.atmos; A.hour = s.hour ?? 12; const wx = s.weather || 'clear'; A.forceWeather && A.forceWeather(wx); A.setWeather(wx, true); A.wet = wx === 'rain' ? 1 : 0; A.envTimer = 0;
      let cam = s.cam, look = s.look;
      if (cam && !s.noTeleport) { const at = s.at || [cam[0] + 2, cam[2] + 2]; g.world.warm(cam[0], cam[2]); if (!g.player.vehicle) g.player.teleport(at[0], at[1], 0); }
      if (s.setup) { const fn = new Function('g', 'L', 'T', 'return (async () => {' + s.setup + '})()'); const r = await fn(g, L, T); if (r && r.cam) { cam = r.cam; look = r.look; } }
      if (!s.noStep) await g.stepSim(4, 0.05);
      if (cam) { g.player.camOverride = true; g.camera.position.set(...cam); g.camera.lookAt(...look); g.camera.updateMatrixWorld(); }
      if (g.post) g.post.gradeSnap = true; g.noRender = false; return { cam, look };
    }, s);
    // let the real loop render (programs compile, shadow maps settle)
    await page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => { if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), s.frames || 30);
    if (s.cam) await page.evaluate((c) => { const g = window.__game; g.camera.position.set(...c.cam); g.camera.lookAt(...c.look); g.camera.updateMatrixWorld(); }, info);
    await page.screenshot({ path: `${outDir}/${s.name}.png` });
    const st = await page.evaluate((keep) => { const g = window.__game; const r = { fps: g.hud && g.hud.fps, customs: g.customs ? g.customs.state : null }; if (!keep) { g.player.camOverride = false; } g.noRender = true; return r; }, !!s.keep);
    console.log('shot', s.name, JSON.stringify(info), JSON.stringify(st), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
} catch (e) { console.log('ERR', (e.stack || e.message).split('\n').slice(0, 4).join(' / ')); }
finally { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]); try { browser.process() && browser.process().kill('SIGKILL'); } catch (e) { /* gone */ } }
console.log('console errors / warnings:', errors.length ? errors.slice(0, 12).join(' | ') : 'none');
