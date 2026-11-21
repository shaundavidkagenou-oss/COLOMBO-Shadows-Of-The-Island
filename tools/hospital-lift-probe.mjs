// 79th: National Hospital lift + lights, driven like a player (walk into the car, press E, ride, walk out) — where the car's
// light is during the ride, which room / light set is drawn, the player's height, and the backup generator in a power cut.
//   PORT=5199 node tools/hospital-lift-probe.mjs [outDir]   (writes a few screenshots when outDir is given)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'node:fs';
const OUT = process.argv[2] || null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; }; const errors = [];
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e).slice(0, 600)));
  page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error') && !/favicon|404|GPU stall|ReadPixels|WebGL-|swiftshader|willReadFrequently|KHR_parallel|localStorage|AudioContext/i.test(t)) errors.push('console: ' + t.slice(0, 400)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 21.5; });
  const shot = async (name) => { if (!OUT) return; await page.evaluate(async () => { const g = window.__game; g.noRender = false; await g.stepSim(2, 0.016); }); await page.screenshot({ path: `${OUT}/${name}.png` }); await page.evaluate(() => { window.__game.noRender = true; }); };
  // 1 · walk from the landing into the car, ride up, walk out
  const r = await page.evaluate(async () => { const g = window.__game, P = g.player, H = g.hospital, I = window.__Input; const LF = H.plan.LIFT; const out = { ride: [] };
    const pool = g.interiors.walkIn.pool; const lightNear = () => { let best = null; for (const l of pool) { if (!l.visible || l.intensity <= 0) continue; const d = Math.hypot(l.position.x - P.x, l.position.z - P.z); if (!best || d < best.d) best = { d: +d.toFixed(2), dy: +(l.position.y - P.y).toFixed(2), i: +l.intensity.toFixed(2) }; } return best; };
    const um = (LF.doorU0 + LF.doorU1) / 2; const [x0, z0] = H.toWorld(um, 10.4); H.placeInside(P, x0, z0, 0); P.yaw = Math.PI; P.camYaw = Math.PI; await g.stepSim(4, 0.05); // in front of the landing doors (they open on arrival)
    out.doorK = +(H.open.lift0 || 0).toFixed(2); out.state0 = H.lift.state;
    // walk in (+v local = −z world): the car is beyond the doors
    const fw = I.code('forward'); I.down.add(fw); P.control = true; let n = 0; while (n++ < 60) { P.camYaw = 0; await g.stepSim(1, 0.05); const [, v] = H.toLocal(P.x, P.z); if (v > (LF.v0 + LF.v1) / 2) break; } I.down.delete(fw); await g.stepSim(2, 0.05);
    out.inCar = H.inCar; out.prompt = H.interact(P, () => 'E'); out.lightIdle = lightNear();
    I.pressed.add(I.code('interact')); H.interact(P, () => 'E'); I.pressed.clear();
    for (let i = 0; i < 200 && !(H.lift.state === 'open' && H.lift.floor === 1); i++) { await g.stepSim(1, 0.05); if (H.lift.state === 'travel' && i % 6 === 0) { const R = H.rooms.get('lift'); out.ride.push({ y: +P.y.toFixed(2), ly: +H.lift.y.toFixed(2), gy: +R.group.position.y.toFixed(2), vis: R.group.visible, room: H.curRoom && H.curRoom.id, L: lightNear() }); } }
    await g.stepSim(3, 0.05); out.after = { floor: H.lift.floor, y: +P.y.toFixed(2), f1: H.FLOOR_Y[1], room: H.curRoom && H.curRoom.id, vis: H.visibleRooms(), L: lightNear() };
    // walk out onto the first-floor landing
    const bk = I.code('back') || I.code('backward'); I.down.add(bk); for (let i = 0; i < 50; i++) { P.camYaw = 0; await g.stepSim(1, 0.05); const [, v] = H.toLocal(P.x, P.z); if (v < 10.4) break; } I.down.delete(bk); await g.stepSim(3, 0.05);
    const [, vo] = H.toLocal(P.x, P.z); out.out = { v: +vo.toFixed(2), y: +P.y.toFixed(2), room: H.curRoom && H.curRoom.id, vis: H.visibleRooms(), L: lightNear() };
    return out; });
  console.log(JSON.stringify(r, null, 0));
  ok(r.inCar && /Lift/.test(r.prompt || ''), `walked into the car (prompt "${r.prompt}")`);
  ok(r.ride.length > 3 && r.ride.every((s) => s.L && s.L.d < 1.6 && s.L.dy > 2.6 && s.L.dy < 3.4), 'the car light rides with the car (above the rider, close) the whole way');
  ok(r.ride.every((s) => Math.abs(s.y - s.ly) < 0.03), `the rider stands on the car floor (max gap ${Math.max(...r.ride.map((s) => Math.abs(s.y - s.ly))).toFixed(2)} m)`);
  ok(r.after.floor === 1 && Math.abs(r.after.y - r.after.f1) < 0.05 && r.after.L && r.after.L.dy > 2.6 && r.after.L.dy < 3.4, `arrived: floor ${r.after.floor}, y ${r.after.y}, lit (${JSON.stringify(r.after.L)})`);
  ok(Math.abs(r.out.y - r.after.f1) < 0.05 && r.out.v < 10.6 && r.out.L && r.out.L.dy > 0.5, `walked out on the first floor: y ${r.out.y}, room ${r.out.room}, light ${JSON.stringify(r.out.L)}`);
  await shot('1-landing-f1');
  // 2 · ride back down from the corridor (call → in → down) and the ward lights after
  const r2 = await page.evaluate(async () => { const g = window.__game, P = g.player, H = g.hospital, I = window.__Input; const LF = H.plan.LIFT; const out = {};
    const [lx, lz] = H.toWorld((LF.u0 + LF.u1) / 2, (LF.v0 + LF.v1) / 2); H.placeInside(P, lx, lz, 1); await g.stepSim(2, 0.05);
    I.pressed.add(I.code('interact')); H.interact(P, () => 'E'); I.pressed.clear(); for (let i = 0; i < 200 && !(H.lift.state === 'open' && H.lift.floor === 0); i++) await g.stepSim(1, 0.05); await g.stepSim(2, 0.05);
    out.y = +P.y.toFixed(2); out.floor = H.lift.floor; out.gy = +H.rooms.get('lift').group.position.y.toFixed(2);
    // ward lights: stand in the ward on floor 1 → every pool light on floor 1, lit
    const [wx, wz] = H.toWorld(0, 4); H.placeInside(P, wx, wz, 1); await g.stepSim(3, 0.05); const pool = g.interiors.walkIn.pool;
    out.ward = pool.filter((l) => l.visible && l.intensity > 0).map((l) => +(l.position.y - P.y).toFixed(2));
    // power cut in the hospital's district: dark, then the generator
    const G = g.power; const zone = G.siteZone('hospital'); G.cut(zone, 120, 'test'); await g.stepSim(10, 0.05); out.cutI = Math.max(...pool.map((l) => l.intensity));
    await g.stepSim(Math.ceil((10 + 2) / 0.05), 0.05); out.genI = Math.max(...pool.map((l) => l.intensity)); out.lvl = +G.levelAt(P.x, P.z).toFixed(2);
    G.restoreAll(); await g.stepSim(120, 0.05); out.backI = Math.max(...pool.map((l) => l.intensity)); out.events = G.events.map((e) => e.type + ':' + (e.zone || e.site || '')).join(' ');
    return out; });
  console.log(JSON.stringify(r2));
  ok(r2.floor === 0 && Math.abs(r2.y - 0) < 3 && r2.gy === 0, `rode down: floor ${r2.floor}, y ${r2.y}, car group back at ${r2.gy}`);
  ok(r2.ward.length >= 3 && r2.ward.every((dy) => dy > 1.5 && dy < 3.5), `ward lights on the player's floor: ${r2.ward.join(', ')}`);
  ok(r2.cutI < 0.05 && Math.abs(r2.genI / r2.backI - 0.85) < 0.05, `power cut: lights ${r2.cutI.toFixed(2)} → generator ${r2.genI.toFixed(2)} (${r2.lvl}) → mains ${r2.backI.toFixed(2)}; ${r2.events}`);
} catch (e) { console.log('ERROR', e.stack || e); fails++; }
console.log('errors:', errors.length ? errors.slice(0, 5).join('\n') : 'none'); console.log(`hospital-lift-probe: ${passes} pass, ${fails} fail`);
await browser.close(); process.exit(fails ? 1 : 0);
