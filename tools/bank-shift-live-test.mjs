// 73rd: the bank's end-of-day / start-of-day shift change in the real game (street, traffic, staff cars, tuk-tuks) — headless Chromium.
//   PORT=5199 node tools/bank-shift-live-test.mjs
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const errors = []; let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const T0 = Date.now(); const lap = (m) => console.log(`  [${((Date.now() - T0) / 1000).toFixed(0)} s] ${m}`);
try {
  const page = await browser.newPage(); page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /bank|shift/.test(t) && m.type() === 'warning') errors.push(t); });
  await page.evaluateOnNewDocument(() => localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })));
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 14.5; });
  lap('game ready');
  // the player on the pavement by the bank's door (watching the street side: cars, tuk-tuks)
  const run = async (dir) => page.evaluate(async (dir) => { const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player; if (!s.room) W.buildRoom(s); const r = s.room, S = r.shift;
    const [sx, sz] = W.world(s, 4, 5); g.world.warm(sx, sz); P.teleport(sx, sz, s.door.faceIn); await g.stepSim(4, 0.05);
    const st0 = { ...S.stats }; if (dir === 'leave') S.leaveNow(); else S.arriveNow(); let worst = 0, t = 0, done = false; const seenCar = new Set(), seenTuk = new Set();
    for (let i = 0; i < 2400; i++) { const w0 = performance.now(); await g.stepSim(1, 0.1); worst = Math.max(worst, performance.now() - w0); t += 0.1;
      for (const p of S.people) { if (p.inCar) (p.how === 'car' ? seenCar : seenTuk).add(p.role + S.people.indexOf(p)); }
      if (S.people.every((p) => p.duty === (dir === 'leave' ? 'off' : 'on'))) { done = true; break; } }
    return { done, t, worst, stats: S.stats, st0, duties: S.people.map((p) => p.duty), car: seenCar.size, tuk: seenTuk.size, log: S.log.slice(-12), visible: S.people.filter((p) => p.ch.root.visible).length }; }, dir);
  const L = await run('leave'); console.log('  leave', JSON.stringify(L));
  ok(L.done, `closing time: all 6 staff went home (${L.t.toFixed(0)} s game time; ${L.duties.join(',')})`);
  ok(L.stats.carTrips - L.st0.carTrips >= 1 || L.car >= 1, `the manager / supervisor drove off in their cars (${L.stats.carTrips - L.st0.carTrips} car trips)`);
  ok(L.stats.tukRides - L.st0.tukRides >= 1 || L.tuk >= 1, `the counter staff took tuk-tuks home (${L.stats.tukRides - L.st0.tukRides} tuk rides)`);
  ok(L.visible === 0, `nobody left standing in the empty bank (${L.visible} visible)`);
  lap('closed');
  const A = await run('arrive'); console.log('  arrive', JSON.stringify(A));
  ok(A.done, `opening: all 6 back at work (${A.t.toFixed(0)} s game time; ${A.duties.join(',')})`);
  ok(A.visible === 6, `all 6 at work and visible (${A.visible})`);
} catch (e) { ok(false, 'exception: ' + (e.stack || e)); }
const errs = errors.filter((e) => !/favicon|404|GPU stall|ReadPixels|WebGL|swiftshader|AudioContext/i.test(e)); ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(' | ')})`);
console.log(fails ? `FAILED ${fails} / ${passes + fails}` : `ALL PASS (${passes})`); await browser.close(); process.exit(fails ? 1 : 0);
