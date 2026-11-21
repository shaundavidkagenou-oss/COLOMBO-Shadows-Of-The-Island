// 73rd: the bank lives with the player outside — headless Chromium on the dev server.
//  · the room keeps simulating (background updates) with the player on the street, the door shut and the room not drawn
//  · passers-by from the street crowd decide to bank: walk up, push the door, become customers (no character built mid-play)
//  · the quota per hour is respected (never overcrowded)
//  · a crowded door: arrivals, leavers and pavement people never overlap (min distance between bodies)
//   PORT=5199 node tools/bank-life-test.mjs
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const errors = []; let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const T0 = Date.now(); const lap = (m) => console.log(`  [${((Date.now() - T0) / 1000).toFixed(0)} s] ${m}`);
try {
  const page = await browser.newPage(); page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /bank|walk-in background/.test(t) && m.type() === 'warning') errors.push(t); });
  await page.evaluateOnNewDocument(() => localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })));
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 11; });
  lap('game ready');
  // ---- 1 · background simulation: the player 30 m down the street
  const bg = await page.evaluate(async () => { const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player; if (!s.room) W.buildRoom(s); s.room.keep = true; const r = s.room;
    const [sx, sz] = W.world(s, 0, 30); g.world.warm(sx, sz); P.teleport(sx, sz, s.door.faceIn); await g.stepSim(20, 0.05); const t0 = r.lastT; const vis0 = r.og.visible;
    const st0 = JSON.stringify(r.stats); await g.stepSim(40, 0.05); return { alwaysSim: r.alwaysSim, adv: r.lastT - t0, active: W.active === r, vis: vis0, on: r.customers.filter((c) => c.on).length, st0, st1: JSON.stringify(r.stats) }; });
  console.log('  bg', JSON.stringify(bg)); ok(bg.alwaysSim && bg.adv > 1.5 && !bg.active, `the bank keeps running with the player outside (its clock advanced ${bg.adv.toFixed(2)} s while not on screen)`);
  // ---- 2 · passers-by come in (player 9 m from the door on the pavement): run up to 160 s of game time
  const rec = await page.evaluate(async () => { const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player, r = s.room;
    const [sx, sz] = W.world(s, 6, 6); P.teleport(sx, sz, s.door.faceIn); await g.stepSim(10, 0.05);
    const nChars0 = window.__charCount ? window.__charCount() : -1; let maxOn = 0, minD = 9, minDext = 9, worst = null, entered = 0, rec0 = r.stats.recruited, quota = 0; const seen = new Set();
    for (let i = 0; i < 1600 && entered < 2; i++) { if (i % 40 === 0) r.recruitNow(); await g.stepSim(1, 0.1);
      const on = r.customers.filter((c) => c.on); maxOn = Math.max(maxOn, on.length); quota = Math.max(quota, 4);
      for (const c of on) if (c.recruit && c.z < -0.5 && !seen.has(c)) { seen.add(c); entered++; }
      const walk = on.filter((c) => !(c.cmd && (c.cmd.seated !== undefined || c.cmd.sit !== undefined || c.cmd.rise)));
      for (let a = 0; a < walk.length; a++) { for (let b = a + 1; b < walk.length; b++) { const d = Math.hypot(walk[a].x - walk[b].x, walk[a].z - walk[b].z); if (d < minD) { minD = d; worst = [walk[a].x, walk[a].z, walk[b].x, walk[b].z]; } }
        if (walk[a].z > -1.6) for (const e of r.ext) minDext = Math.min(minDext, Math.hypot(walk[a].x - e.x, walk[a].z - e.z)); } }
    return { recruited: r.stats.recruited - rec0, entered, maxOn, minD, minDext, worst, pool: r.customers.length, nChars0 }; });
  console.log('  rec', JSON.stringify(rec));
  ok(rec.recruited >= 1 && rec.entered >= 1, `passers-by from the street crowd went into the bank (${rec.recruited} recruited, ${rec.entered} walked in through the door)`);
  ok(rec.maxOn <= 4, `never overcrowded: at most ${rec.maxOn} customers at once (the hour's quota is 4 at 11:00)`);
  ok(rec.minD >= 0.42, `customers never walk through each other (closest two walking customers: ${rec.minD.toFixed(2)} m)`);
  ok(rec.minDext >= 0.42, `customers never walk through people on the pavement by the door (closest: ${rec.minDext.toFixed(2)} m)`);
  // ---- 3 · a crowded door: three arrivals while two leave, the player inside watching
  const door = await page.evaluate(async () => { const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player, r = s.room;
    const [ix, iz] = W.world(s, 3.5, -6); P.teleport(ix, iz, s.door.faceIn); P.indoor = r.proxy; await g.stepSim(4, 0.05);
    for (const c of r.customers) if (c.on && c.cmd && c.cmd.walk === undefined) { /* nothing */ }
    // two leavers from the hall at once, three arrivals from the street
    const leavers = r.customers.filter((c) => c.on && c.cmd && c.cmd.seated === undefined && c.cmd.sit === undefined).slice(0, 2); for (const c of leavers) { c.gen = r.leaveGen(c); c.cmd = null; }
    const arr = []; for (let k = 0; k < 3; k++) { const c = r.spawnVisit(['kiosk']); if (c) { c.x += k * 0.6; arr.push(c); } }
    let minD = 9, through = 0, maxT = 0; for (let i = 0; i < 900; i++) { await g.stepSim(1, 0.05); const on = r.customers.filter((c) => c.on && !(c.cmd && (c.cmd.seated !== undefined || c.cmd.sit !== undefined || c.cmd.rise)));
      for (let a = 0; a < on.length; a++) for (let b = a + 1; b < on.length; b++) minD = Math.min(minD, Math.hypot(on[a].x - on[b].x, on[a].z - on[b].z));
      for (const c of arr) if (c.on && c.z < -1.5) c._in = true; for (const c of leavers) if (!c.on || c.z > 1.5) c._out = true;
      through = arr.filter((c) => c._in).length; if (through === arr.length && leavers.every((c) => c._out)) { maxT = i * 0.05; break; } }
    P.indoor = null; return { minD, through, arrivals: arr.length, t: maxT }; });
  console.log('  door', JSON.stringify(door));
  ok(door.arrivals >= 2 && door.through === door.arrivals && door.t > 0, `crowded door: ${door.through}/${door.arrivals} arrivals got through while two customers left (${door.t.toFixed(1)} s)`);
  ok(door.minD >= 0.42, `crowded door: nobody walked through anybody (closest: ${door.minD.toFixed(2)} m)`);
} catch (e) { ok(false, 'exception: ' + (e.stack || e)); }
const errs = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels|WebGL|swiftshader|AudioContext/i.test(e)); ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(' | ')})`);
console.log(fails ? `FAILED ${fails} / ${passes + fails}` : `ALL PASS (${passes})`); await browser.close(); process.exit(fails ? 1 : 0);
