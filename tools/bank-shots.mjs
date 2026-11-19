// Ceylon Meridian Bank visual review (67th): real renders of the production build (headless SwiftShader, so slower and
// with less anti-aliasing than a GPU, same shaders / materials). Writes dev/ref/67-*.png.
//   PORT=5199 node tools/bank-shots.mjs [quality=medium] [outDir=dev/ref]
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [Q = 'medium', OUT = 'dev/ref'] = process.argv.slice(2); const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'], defaultViewport: { width: 1280, height: 720 } });
const errors = [];
// views: street (world coords around the facade, which faces −x) or room (local frame of the banking hall: x across, z into the hall is −)
const SHOTS = [
  { name: '67-bank-street-day', hour: 10.5, cam: [-398.5, 1.75, -124.5], look: [-386.5, 3.4, -136.5] },
  { name: '67-bank-frontage', hour: 15.5, cam: [-393.2, 1.7, -131.2], look: [-386.5, 2.9, -136.0] },
  { name: '67-bank-street-dusk', hour: 19.1, cam: [-398.0, 1.75, -142.5], look: [-386.5, 3.2, -134.0] },
  { name: '67-bank-hall', hour: 11, room: true, cam: [1.6, 1.68, -1.2], look: [-1.2, 1.35, -9.5] },
  { name: '67-bank-counters', hour: 11, room: true, cam: [0.4, 1.62, -4.6], look: [-2.2, 1.25, -9.6] },
  { name: '67-bank-atms', hour: 11, room: true, cam: [-2.8, 1.62, -4.4], look: [-6.4, 1.3, -2.2] },
  { name: '67-bank-waiting', hour: 11, room: true, cam: [-5.6, 1.7, -5.0], look: [3.0, 1.0, -7.2] },
  { name: '67-bank-atm-ui', hour: 11, room: true, atm: true },
  { name: '67-bank-map', hour: 11, map: true },
  // 71st: wall split AC in the hall, the back-office phone + AC, the card going into the ATM, an officer on the phone
  { name: '71-bank-ac-hall', hour: 11, room: true, cam: [3.2, 1.75, -1.0], look: [7.0, 2.6, -3.2] },
  { name: '71-bank-backoffice', hour: 11, room: true, cam: [-1.9, 1.62, -7.7], look: [-3.3, 1.35, -13.6] },
  { name: '71-bank-atm-card', hour: 11, room: true, atm: true, card: 0.62 },
  { name: '73-bank-atm-close', hour: 11, room: true, cam: [-5.55, 1.5, -1.55], look: [-6.4, 1.22, -1.86] },
  { name: '73-bank-ac-close', hour: 11, room: true, cam: [5.3, 2.25, -1.9], look: [6.95, 2.8, -2.92] },
  { name: '71-bank-phone-call', hour: 11, room: true, call: true, cam: [-1.2, 1.62, -7.8], look: [-3.3, 1.3, -13.0] },
];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.story.cancelAll(); g.story.running = null; if (g.world.occ && g.world.occ.cfg) g.world.occ.cfg.budgetMs = 200; g.atmos.forceWeather && g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.atmos.wet = 0; });
  for (const s of SHOTS) {
    if (ONLY.length && !ONLY.includes(s.name)) continue; const t0 = Date.now();
    const info = await page.evaluate(async (s) => { const g = window.__game, W = g.interiors.walkIn, site = W.siteById('bank'), P = g.player; g.noRender = true; g.atmos.hour = s.hour; g.atmos.envTimer = 0;
      if (g.atm.open) g.atm.close(true); if (g.hud.bigMapOpen) g.toggleMap(); P.camOverride = false;
      const inside = () => !!(P.indoor && P.indoor.site === site);
      if (s.room || s.atm) { if (!inside()) { const [sx, sz] = W.world(site, 0, 3.2); g.world.warm(sx, sz); P.teleport(sx, sz, site.door.faceIn); P.yaw = site.door.faceIn; P.camYaw = P.yaw + Math.PI; await g.stepSim(2, 0.05); for (let i = 0; i < 90 && !inside(); i++) await g.stepSim(1, 0.05, ['KeyW']); }
        for (let i = 0; i < 12; i++) await g.stepSim(1, 0.05, ['KeyW']); const [px, pz] = W.world(site, 5.6, -2.0); P.x = px; P.z = pz; await g.stepSim(40, 0.05); }
      else if (s.cam) { const [x, z] = [s.cam[0] + 2, s.cam[2]]; g.world.warm(x, z); P.teleport(-390.2, -121.5, Math.PI); await g.stepSim(30, 0.05); }
      if (s.atm) { const r = site.room, m = r.atms[1]; for (const c of r.customers) if (c.on && c.atm === m.i) { c.on = false; c.ch.root.visible = false; c.atm = -1; } m.user = null; const [ax, az] = W.world(site, m.stand[0] + 0.05, m.stand[1]); P.x = ax; P.z = az; P.yaw = site.yaw - Math.PI / 2; await g.stepSim(3, 0.05);
        if (s.card) { g.atm.openAt(r, m); while (g.atm.cardAnim && g.atm.cardAnim.t < s.card) await g.stepSim(1, 0.02); /* camera beside the player's right shoulder, framed on the card in his hand and the reader */ const C = g.atm.card.getWorldPosition(new (g.camera.position.constructor)()); const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), rx = -fz, rz = fx; P.camOverride = true; g.atm.camera = () => {}; g.camera.position.set(C.x + rx * 0.55 - fx * 0.35, C.y + 0.18, C.z + rz * 0.55 - fz * 0.35); g.camera.lookAt(C.x + fx * 0.06, C.y - 0.02, C.z + fz * 0.06); g.camera.fov = 40; g.camera.updateProjectionMatrix(); g.camera.updateMatrixWorld(); g.atm.update = () => {}; }
        else { g.story.state.money = 18500; g.bank.account.balance = Math.max(g.bank.account.balance, 64250); g.atm.openAt(r, m); await g.stepSim(25, 0.05); const i = g.atm.opts.findIndex((o) => o.act === 'withdraw'); g.atm.sel = i; g.atm.choose(); await g.stepSim(2, 0.05); g.atm.sel = 2; g.atm.render(); } }
      if (s.call) { const r = site.room; r.ringNow(); for (let i = 0; i < 900 && r.call.st !== 'call'; i++) await g.stepSim(1, 0.05); for (let i = 0; i < 80; i++) await g.stepSim(1, 0.05); }
      if (s.map) { g.toggleMap(); await g.stepSim(2, 0.05); const V = g.hud.mapView; if (V) { V.open(site.door.x, site.door.z); V.tZoom = 1.3; } }
      if (s.cam && !s.atm) { P.camOverride = true; let c = s.cam, l = s.look; if (s.room) { const [cx, cz] = W.world(site, c[0], c[2]); const [lx, lz] = W.world(site, l[0], l[2]); c = [cx, site.y0 + c[1], cz]; l = [lx, site.y0 + l[1], lz]; } g.camera.position.set(...c); g.camera.lookAt(...l); g.camera.fov = 58; g.camera.updateProjectionMatrix(); g.camera.updateMatrixWorld(); }
      g.hud.show(!s.cam || s.atm || s.map); g.noRender = false;
      return { inside: inside(), night: +g.atmos.night.toFixed(2), cust: site.room ? site.room.customers.filter((c) => c.on).length : 0, page: g.atm.page }; }, s);
    await new Promise((r) => setTimeout(r, s.map ? 12000 : 9000));
    if (s.cam && !s.atm) await page.evaluate((s) => { const g = window.__game, W = g.interiors.walkIn, site = W.siteById('bank'); let c = s.cam, l = s.look; if (s.room) { const [cx, cz] = W.world(site, c[0], c[2]); const [lx, lz] = W.world(site, l[0], l[2]); c = [cx, site.y0 + c[1], cz]; l = [lx, site.y0 + l[1], lz]; } g.camera.position.set(...c); g.camera.lookAt(...l); g.camera.updateMatrixWorld(); }, s);
    await new Promise((r) => setTimeout(r, 2500));
    await page.screenshot({ path: `${OUT}/${s.name}.png` }); console.log('shot', s.name, JSON.stringify(info), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
} catch (e) { console.log('ERR', (e.stack || e.message).split('\n').slice(0, 4).join(' / ')); } finally { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]); try { browser.process() && browser.process().kill('SIGKILL'); } catch (e) { /* gone */ } }
console.log('errors:', errors.slice(0, 6).join(' | ') || 'none');
