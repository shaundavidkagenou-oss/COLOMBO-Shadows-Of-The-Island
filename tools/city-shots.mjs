// Benchmark capture: node tools/city-shots.mjs shots.json outDir [quality] [w] [h]  (PORT env = dev-server port, default 5199)
// shot = {name, at:[x,z], cam:[x,y,z], look:[x,y,z], hour, wet}  or  {name, target:"board"|"sign", k, hour, wet}
// shots.json: [{ name, at:[x,z], cam:[x,y,z], look:[x,y,z], hour, weather, wet }]
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'fs';
const [file, outDir = '/tmp/sh', Q = 'medium', W = '1280', H = '720'] = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(file, 'utf8'));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1200000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: +W, height: +H } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  for (const s of shots) {
    const t0 = Date.now();
    const info = await page.evaluate(async (s) => { const g = window.__game; const F = g.world.fortStreets;
      if (s.target === 'board' && F && F.boards[s.k || 0]) { const b = F.boards[s.k || 0]; const Lm = await import('/src/world/Layout.js'); let d = 12; for (let k = 8; k < 60; k++) if (Lm.roadAt(b.x + b.n[0] * k, b.z + b.n[1] * k)) d = k; s.at = [b.x + b.n[0] * (d - 2), b.z + b.n[1] * (d - 2)]; s.cam = [b.x + b.n[0] * d, 1.8, b.z + b.n[1] * d]; s.look = [b.x, b.y - 1, b.z]; s.look = [b.x, b.y, b.z]; }
      if (s.target === 'sign' && F && F.signs[s.k || 0]) { const q = F.signs[s.k || 0]; const c = Math.cos(q.rot), sn = Math.sin(q.rot); s.at = [q.x + sn * 4, q.z + c * 4]; s.cam = [q.x + 0.7 * c + sn * 3.2, q.y - 0.5, q.z - 0.7 * sn + c * 3.2]; s.look = [q.x + 0.7 * c, q.y - 0.3, q.z - 0.7 * sn]; }
      const [x, z] = s.at; g.world.warm(x, z); g.player.teleport(x, z, 0);
      g.atmos.hour = s.hour ?? 12; g.atmos.forceWeather(s.weather || 'clear'); g.atmos.setWeather(s.weather || 'clear', true); if (s.wet !== undefined) g.atmos.wet = s.wet;
      let veh = null; if (s.spawn) { g.debugCon.exec('spawn car ' + s.spawn); veh = g.traffic.parked[g.traffic.parked.length - 1]; }
      g.atmos.envTimer = 0; await g.stepSim(6, 0.05); g.player.camOverride = true;
      if (veh && s.camRel) { const m = veh.mesh; m.updateMatrixWorld(); const T = window.__THREE_V3 || m.position.constructor; const c = new T(...s.camRel).applyMatrix4(m.matrixWorld), l = new T(...(s.lookRel || [0, 1.5, 0])).applyMatrix4(m.matrixWorld); s.cam = [c.x, c.y, c.z]; s.look = [l.x, l.y, l.z]; }
      g.camera.position.set(...s.cam); g.camera.lookAt(...s.look); g.camera.updateMatrixWorld();
      return { hour: g.atmos.hour, night: +g.atmos.night.toFixed(2), boards: F && F.boards.length, signs: F && F.signs.length, names: F && [...new Set(F.signs.map((q) => q.name))].join('|') }; }, s);
    await new Promise((r) => setTimeout(r, s.wait || 6000));
    await page.screenshot({ path: `${outDir}/${s.name}.png` }); console.log('shot', s.name, JSON.stringify(info), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
console.log('errors:', errors.slice(0, 6).join(' | ') || 'none');
