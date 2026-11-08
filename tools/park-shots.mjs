// In-game check of NPC kerb parking: node tools/park-shots.mjs outDir [x z] [quality] [w] [h]  (PORT env = server port, default 5199)
// Teleports to a local street, steps the simulation until a traffic car starts pulling in to a kerb spot (Traffic.updateArrivals),
// then frames that spot from across the road and saves a frame every ~1.5 s of game time until the car has parked and its
// driver has got out. Prints the arrival's state per frame (speed, distance to the spot, heading error) next to each shot.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [outDir = '/tmp/sh/park', X = '-60', Z = '-140', Q = 'medium', W = '1280', H = '720'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1200000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: +W, height: +H } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(async (x, z) => { const g = window.__game; g.world.warm(x, z); g.player.teleport(x, z, 0); g.atmos.hour = 10; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.atmos.wet = 0; g.editorHook = () => {}; /* freeze the real-time loop (still drawn): only stepSim moves the world */ await g.stepSim(120, 0.05); }, +X, +Z);
  // wait for somebody to start pulling in
  let found = null;
  for (let i = 0; i < 150 && !found; i++) found = await page.evaluate(async () => { const g = window.__game; await g.stepSim(40, 0.05); /* 2 s */ const A = g.traffic.arrivals || []; const o = A.find((q) => q.t < 4); if (!o) return null; window.__arr = o; return { type: o.v.type, spot: [o.spot.x, o.spot.z, o.spot.yaw] }; });
  console.log('arrival', JSON.stringify(found));
  if (found) {
    for (let k = 0; k < 16; k++) {
      const st = await page.evaluate(async (k) => { const g = window.__game, o = window.__arr, v = o.v, sp = o.spot; if (k > 0) await g.stepSim(30, 0.05); /* 1.5 s of game time */
        const d = [Math.sin(sp.yaw), Math.cos(sp.yaw)]; const rx = v.x - sp.x, rz = v.z - sp.z; const al = rx * d[0] + rz * d[1]; let nx = rx - d[0] * al, nz = rz - d[1] * al; const nl = Math.hypot(nx, nz);
        if (!window.__nrm) window.__nrm = nl > 0.5 ? [nx / nl, nz / nl] : [d[1], -d[0]]; const n = window.__nrm; // road side of the spot (fixed once)
        g.player.camOverride = true; g.camera.position.set(sp.x + n[0] * 5 - d[0] * 11, 8, sp.z + n[1] * 5 - d[1] * 11); g.camera.lookAt(sp.x - d[0] * 3, 0.4, sp.z - d[1] * 3); /* raised over the road behind the spot: sees the approach, never inside a building */ g.camera.updateMatrixWorld();
        const yawErr = Math.atan2(Math.sin(v.yaw - sp.yaw), Math.cos(v.yaw - sp.yaw));
        return { k, parked: !!v.parked, onSpot: v.spot === sp, spd: +(v.speed || 0).toFixed(2), along: +al.toFixed(2), lateral: +((v.x - sp.x) * n[0] + (v.z - sp.z) * n[1]).toFixed(2), yawErr: +yawErr.toFixed(3), driver: !!v.driverChar, out: (g.traffic.parkStats || {}).parked || 0 }; }, k);
      await new Promise((r) => setTimeout(r, 2500));
      await page.screenshot({ path: `${outDir}/park_${String(k).padStart(2, '0')}.png` }); console.log('frame', JSON.stringify(st));
      if (st.parked && k >= 3) { /* a few frames after parking: the driver getting out */ const extra = await page.evaluate(() => (window.__after = (window.__after || 0) + 1)); if (extra > 4) break; }
    }
  }
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
console.log('errors:', errors.slice(0, 6).join(' | ') || 'none');
