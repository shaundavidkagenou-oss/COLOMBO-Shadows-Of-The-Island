// Global browser + Black Orchid end-to-end test (production build, headless Chromium).
//   node tools/assassin-test.mjs [shotsDir]     PORT env (default 5199)
// Logic runs with rendering off; when shotsDir is given, a few frames are rendered at Low 640×360 (phone pages, guard at the
// club door, each phase of the contract cinematic) and written there as PNG.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'fs';
const SHOTS = process.argv[2] || null; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const W = +(process.env.W || 640), H = +(process.env.H || 360);
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, defaultViewport: { width: W, height: H }, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const shot = async (p, name) => { if (!SHOTS) return; await p.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('shot', name); };
try {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e.stack || e).split('\n').slice(0, 3).join(' | ')));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await p.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  // ---- 1. browser: every page builds, every link leads somewhere
  const r1 = await p.evaluate(async () => {
    const g = window.__game; g.noRender = true; g.atmos.hour = 10; g.story.state.money = 200000; const out = { errs: [] };
    const ph = g.phone; ph.toggle(true); ph.launch('global'); const B = ph.browser; out.homeRows = B.rows().length; out.sites = 0; out.articles = 0; out.dead = [];
    const home = B.rows();
    for (let i = 1; i < home.length; i++) { B.reset(); ph.row = i; ph.activate(); try { const pg = B.page(); out.sites++; if (!pg.html || pg.html.length < 80) out.dead.push(pg.url); const h = ph.screen.innerHTML; if (!h.includes(pg.url)) out.dead.push('chrome ' + pg.url);
      pg.rows.forEach((r, j) => { if (!r.go && !r.act && !r.page) out.dead.push(`${pg.url} row ${j}`); });
      const n = pg.rows.length; for (let j = 0; j < n; j++) { const r = B.rows()[j]; if (r.go && r.go.id === 'article') { ph.row = j; ph.activate(); const a = B.page(); if (a.html.length > 100) out.articles++; ph.back(); } }
    } catch (e) { out.errs.push(String(e)); } }
    out.urls = home.map((r) => r.s.split(' · ')[0]);
    // radio row on foot gives a message instead of acting
    B.reset(); ph.row = home.findIndex((r) => /Island Radio/.test(r.t)); ph.activate(); const before = g.radio; ph.row = 0; ph.activate(); out.radioOnFoot = g.radio === before;
    // GPS link sets a waypoint and closes the phone
    ph.toggle(true); ph.launch('global'); ph.row = home.findIndex((r) => /Velvet/.test(r.t)); ph.activate(); ph.row = 0; ph.activate(); out.gps = !!g.hud.waypoint; out.closedAfterGps = !ph.open; g.hud.clearWaypoint();
    // Black Orchid: age gate then the menu
    ph.toggle(true); ph.launch('global'); ph.row = 0; ph.activate(); out.gate = /18\+/.test(ph.screen.innerHTML); ph.row = 0; ph.activate(); out.menu = B.rows().map((r) => r.t);
    return out;
  });
  console.log(JSON.stringify(r1, null, 1));
  ok(r1.homeRows === 21, `start page: Black Orchid + 20 bookmarks (${r1.homeRows})`);
  ok(r1.sites === 20 && !r1.errs.length, `all 20 sites render (${r1.sites}) ${r1.errs.join(';')}`);
  ok(!r1.dead.length, `no dead pages / buttons ${r1.dead.join(', ')}`);
  ok(new Set(r1.urls).size === 21, 'distinct site addresses');
  ok(r1.articles >= 20, `articles open (${r1.articles})`);
  ok(r1.radioOnFoot, 'radio link on foot does not tune');
  ok(r1.gps && r1.closedAfterGps, 'GPS link sets a waypoint and closes the phone');
  ok(r1.gate && r1.menu.length >= 4, 'Black Orchid: 18+ gate then the service menu');
  if (SHOTS) { await p.evaluate(async () => { const g = window.__game; g.noRender = false; g.player.teleport(-128, -891.8, 0); g.world.warm(-128, -892); await g.stepSim(20, 1 / 30); const ph = g.phone; ph.toggle(true); ph.launch('global'); }); await p.evaluate(() => new Promise((r) => setTimeout(r, 600))); await shot(p, 'p42-browser-home');
    await p.evaluate(() => { const ph = window.__game.phone; ph.row = 0; ph.activate(); }); await p.evaluate(() => new Promise((r) => setTimeout(r, 400))); await shot(p, 'p42-orchid-menu');
    await p.evaluate(() => { const g = window.__game; g.phone.toggle(false); g.noRender = true; }); }
  // ---- 2. bodyguard
  const r2 = await p.evaluate(async () => {
    const g = window.__game, O = g.orchid, P = g.player; const out = {}; g.story.state.money = 200000;
    P.teleport(-389, 222, Math.PI); g.world.warm(-389, 222); await g.stepSim(20, 0.05);
    const m0 = g.story.state.money; const r = O.hireGuard(); out.hire = r; out.paid = m0 - g.story.state.money; if (!r.ok) { out.why = { running: g.story.running, dir: g.director.active, pol: g.police.level }; return out; }
    await g.stepSim(10, 0.05); out.near0 = O.visible ? +Math.hypot(O.m.x - P.x, O.m.z - P.z).toFixed(1) : null;
    // walk the player 30 m along the pavement; she keeps up
    let maxD = 0; for (let i = 0; i < 200; i++) { P.teleport(P.x, P.z - 0.08, Math.PI); P.speed = 1.6; await g.stepSim(1, 0.05); if (i > 40) maxD = Math.max(maxD, Math.hypot(O.m.x - P.x, O.m.z - P.z)); }
    out.followMax = +maxD.toFixed(1); P.speed = 0; await g.stepSim(40, 0.05); out.restD = +Math.hypot(O.m.x - P.x, O.m.z - P.z).toFixed(1);
    // into the club: she stands outside its door
    const door = g.interiors.doors.find((d) => d.id === 'club'); out.clubDoor = !!door;
    if (door) { P.teleport(door.x, door.z, 0); await g.stepSim(4, 0.05); await g.interiors.enter(door); await g.stepSim(20, 0.05); out.inside = !!g.interiors.current; out.atDoor = +Math.hypot(O.m.x - door.x, O.m.z - door.z).toFixed(2); out.anim = O.ch.anim.action; out.visible = O.visible;
      out.blockedSpot = g.collision.blocked(O.m.x, O.m.z, 0.25); await g.interiors.exit(); await g.stepSim(20, 0.05); out.afterExit = +Math.hypot(O.m.x - P.x, O.m.z - P.z).toFixed(1); }
    // home door
    const hd = O.homeDoor(); out.home = O.homeName(); if (hd) { P.teleport(hd.x, hd.z, 0); await g.stepSim(10, 0.05); await g.interiors.enter(hd); await g.stepSim(10, 0.05); out.homeAt = +Math.hypot(O.m.x - hd.x, O.m.z - hd.z).toFixed(2); await g.interiors.exit(); await g.stepSim(10, 0.05); }
    // shift ends after 24 h
    g.atmos.advance(25 * 60); await g.stepSim(4, 0.05); out.ended = !O.guard;
    return out;
  });
  console.log(JSON.stringify(r2, null, 1));
  if (!r2.hire.ok) throw new Error('hire failed');
  ok(r2.hire.ok && r2.paid === 18000, `bodyguard hired, Rs. 18,000 deducted (${r2.paid})`);
  ok(r2.near0 != null && r2.near0 < 14, `she arrives near the player (${r2.near0} m)`);
  ok(r2.followMax < 9 && r2.restD < 3.5, `follows on foot (max ${r2.followMax} m, at rest ${r2.restD} m)`);
  ok(r2.inside && r2.atDoor < 2.2 && r2.visible && !r2.blockedSpot, `stands guard outside the club door (${r2.atDoor} m, ${r2.anim})`);
  ok(r2.homeAt != null && r2.homeAt < 2.2, `stands guard outside ${r2.home} (${r2.homeAt} m)`);
  ok(r2.afterExit < 4, `waiting by the door when he comes out (${r2.afterExit} m)`);
  ok(r2.ended, 'shift ends after 24 in-game hours');
  // ---- 3. private evening (fade to black)
  const r3 = await p.evaluate(async () => {
    const g = window.__game, O = g.orchid, P = g.player; const out = {}; g.atmos.hour = 20; const m0 = g.story.state.money; const r = O.bookEvening(); out.book = r; out.paid = m0 - g.story.state.money; out.wp = !!g.hud.waypoint;
    const d = O.evening && O.evening.door; const h0 = g.atmos.hour; P.teleport(d.x + 3, d.z + 3, 0);
    let started = false, ended = false, card = false; for (let i = 0; i < 900; i++) { await g.stepSim(1, 0.05); if (g.director.active) started = true; if (O.card && O.card.classList.contains('on')) card = true; if (started && !g.director.active) { ended = true; break; } await new Promise((rr) => setTimeout(rr, 10)); }
    out.started = started; out.ended = ended; out.card = card; out.dh = +(((g.atmos.hour - h0) + 24) % 24).toFixed(2); out.ctl = P.control; return out;
  });
  console.log(JSON.stringify(r3, null, 1));
  ok(r3.book.ok && r3.paid === 12000 && r3.wp, 'evening booked, Rs. 12,000 deducted, GPS to the home door');
  ok(r3.started && r3.ended && r3.card && r3.dh > 2.5 && r3.ctl, `door scene → fade-to-black card → +3 h, control returned (Δ${r3.dh} h)`);
  // ---- 4. contract
  const r4 = await p.evaluate(async () => {
    const g = window.__game, O = g.orchid, P = g.player; const out = { tries: [] }; g.atmos.hour = 10; g.story.state.money = 200000;
    const spots = [[-128, -891.8], [-300, 120], [-389, 215], [-60, -620], [90, -40], [-492, -330]]; let picked = null, v = null;
    for (const [x, z] of spots) { P.teleport(x, z, 0); g.world.warm(x, z); await g.stepSim(60, 0.05); const T = O.targets(); let nv = 0;
      for (const q of T) { const vv = O.findVantage(q.p); if (vv) { nv++; if (!picked) { picked = q.p; v = vv; } } }
      out.tries.push({ x, z, targets: T.length, withVantage: nv }); if (picked) break; }
    if (!picked) return out;
    out.v = { dist: +v.dist.toFixed(1), elev: +(v.y - picked.y).toFixed(1), style: v.b.style || null };
    // screen the picker
    g.phone.toggle(true); g.phone.launch('global'); const B = g.phone.browser; B.go({ id: 'orchid-map' }); g.phone.render(); out.mapRows = B.rows().length; out.canvas = !!g.phone.screen.querySelector('canvas.bo-map'); g.phone.toggle(false);
    const m0 = g.story.state.money; const pol0 = g.police.level; window.__mark = picked; const r = O.contract(picked); out.contract = r; out.paid = m0 - g.story.state.money; out.cineStart = !!O.cine;
    const phases = []; let last = ''; let minSlow = 1;
    for (let i = 0; i < 1400 && O.cine; i++) { await g.stepSim(1, 1 / 30); const c = O.cine; if (!c) break; if (c.phase !== last) { last = c.phase; phases.push(c.phase); } minSlow = Math.min(minSlow, g.timeSlow || 1); }
    out.phases = phases; out.minSlow = minSlow; out.dead = !!picked.dead; out.done = !O.cine; out.director = g.director.active; out.police = g.police.level - pol0; out.timeSlow = g.timeSlow || 1; out.ctl = P.control;
    out.headHit = picked.contractHit || null; return out;
  });
  console.log(JSON.stringify(r4, null, 1));
  ok(!!r4.v, `a rooftop position with a clean line was found (${JSON.stringify(r4.tries)})`);
  if (r4.v) {
    ok(r4.canvas && r4.mapRows > 0, `satellite target picker lists nearby people (${r4.mapRows})`);
    ok(r4.contract.ok && r4.paid === 40000 && r4.cineStart, 'contract accepted, Rs. 40,000 deducted, cinematic starts');
    ok(['wide', 'mark', 'shoulder', 'scope', 'bullet', 'after', 'roof'].every((s) => r4.phases.includes(s)), `cinematic phases: ${r4.phases.join(' → ')}`);
    ok(r4.minSlow < 0.2, `bullet-time slow-motion (${r4.minSlow})`);
    ok(r4.dead, 'the mark is killed by the shot');
    ok(r4.done && !r4.director && r4.ctl && r4.timeSlow === 1, 'cinematic ends cleanly, control and normal time restored');
    ok(r4.police === 0, `police do not blame the player (Δwanted ${r4.police})`);
  }
  // ---- 5. save / load round trip
  const r5 = await p.evaluate(() => { const g = window.__game, O = g.orchid; O.hireGuard(); const s = JSON.parse(JSON.stringify(O.save())); O.load(null); const gone = !O.guard; O.load(s); return { s, gone, back: !!O.guard }; });
  ok(r5.gone && r5.back, 'guard booking survives save/load');
  ok(!errs.length, `no page errors ${errs.slice(0, 5).join(' || ')}`);
} catch (e) { console.log('FAIL exception', e); fails++; }
await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
