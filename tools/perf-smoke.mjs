// Live-loop smoke test of the frame-rate work (headless Chromium): the real game loop on a busy street with the camera swept
// round 360° (view skipping on), then the in-game `bench` console command. Prints held people/vehicles per frame, the bench
// report and any page errors. SwiftShader rasterises on the CPU: absolute fps here mean nothing; it checks the code paths.
//   node tools/perf-smoke.mjs [quality] [x z]      PORT env = server port (default 5199)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [Q = 'medium', X = '-392', Z = '700'] = process.argv.slice(2);
const W = +(process.env.W || 960), H = +(process.env.H || 540);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(async (x, z) => { const g = window.__game; g.world.warm(x, z); g.player.teleport(x, z, 0); g.atmos.hour = 11; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); await g.stepSim(40, 0.05); }, +X, +Z);
  const sweep = process.env.NOSWEEP ? [] : await page.evaluate(async () => { const g = window.__game; const out = []; const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let k = 0; k < 8; k++) { g.player.camYaw += Math.PI / 4; await wait(2500);
      let held = 0, peds = 0; let top = 0; for (const p of g.crowd.peds) top = Math.max(top, p.ch.root._heldF || 0); for (const p of g.crowd.peds) { peds++; if (p.ch.root._heldF && p.ch.root._heldF >= top - 1) held++; }
      let vh = 0, vn = 0; for (const v of g.traffic.vehicles.concat(g.traffic.parked || [])) { vn++; if (v.mesh && v.mesh._heldF) vh++; }
      out.push(`step ${k}: people ${peds} (recently held ${held}), vehicles ${vn} (ever held ${vh})`); }
    return out; });
  console.log(sweep.join('\n'));
  await page.evaluate((BS) => window.__game.debugCon.exec('bench ' + (+BS || 6)), process.env.BENCH || '6');
  await page.waitForFunction(() => /BENCHMARK/.test(document.querySelector('.dbg-log') ? document.querySelector('.dbg-log').textContent : ''), { timeout: 600000, polling: 1000 });
  console.log(await page.evaluate(() => { const t = document.querySelector('.dbg-log').innerText; return t.slice(t.indexOf('BENCHMARK')); }));
} catch (e) { console.log('ERR', e.message); } finally { console.log('errors:', errors.length ? errors.slice(0, 6).join(' | ') : 'none'); await browser.close(); }
