// Boats end-to-end test (production build, headless Chromium, no rendering): Fort Harbour Marina (pontoons walkable, moored
// fleet), buying the berth and boats (money, purchase text, delivery after sleeping / the next day, delivered text), switching
// boats at the berth, boarding and driving (throttle, steering, wake, collisions with the pontoons), getting off into the
// water, bullets (hull damage → wreck → sinks; sails holed and torn), the harbour police patrol (0★, mornings / nights, beacons
// at night), an owner taking his boat out, lamps at night, the marine shop sites on Global.
//   node tools/boat-test.mjs            PORT env (default 5199)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=480,270'], defaultViewport: { width: 480, height: 270 } });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
// each stage runs on its own: an exception in one is reported and the next stage still runs
const stage = async (p, name, fn, checks) => { let r; try { r = await p.evaluate(fn); console.log(name, JSON.stringify(r)); } catch (e) { ok(false, `${name}: ${String(e.message || e).split('\n').slice(0, 3).join(' | ')}`); return null; } try { checks(r); } catch (e) { ok(false, `${name} checks: ${e.message}`); } return r; };
try {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e.stack || e).split('\n').slice(0, 3).join(' | '))); p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await p.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  // ---- 1. marina, fleet, buying, delivery, switching
  await stage(p, 'marina', async () => {
    const g = window.__game, B = g.boats, P = g.player; g.noRender = true; g.atmos.hour = 10; g.debugCon.exec('god on'); const out = { has: !!B }; if (!B) return out;
    out.moored = B.all.filter((b) => b.mode === 'moored' && b.home).length; out.police = B.police.length; out.colliders = B.marina.colliders.length;
    const C = g.collision; out.gang = [231, 226, 222].map((x) => +C.groundAt(x, -1199.5, 1, 3).toFixed(2)); out.spine = +C.groundAt(185, -1240, 1, 3).toFixed(2); out.tee = +C.groundAt(190, -1286.5, 1, 3).toFixed(2);
    // walk down the gangway onto the pontoons (real foot controller, W held)
    P.teleport(232.5, -1199.5, -Math.PI / 2); g.world.warm(232.5, -1199.5); await g.stepSim(Math.round((1) * 20), 0.05);
    const I = window.__Input, isDown = I.isDown.bind(I); I.isDown = (a) => a === 'forward' || isDown(a); P.camYaw = Math.PI / 2; // camera behind: walking west
    await g.stepSim(Math.round((7) * 20), 0.05); I.isDown = isDown; out.walk = { x: +P.x.toFixed(1), y: +P.y.toFixed(2), z: +P.z.toFixed(1), swim: !!P.swim };
    // money, berth, order
    const S = g.story.state; S.money = 2e9; S.msgs = [];
    out.noBerth = B.order('dondra26').ok; out.berth = B.buyBerth().ok; const m1 = S.money; out.order = B.order('dondra26'); out.paid = m1 - S.money; out.pending = B.state().pending.length;
    out.msgThanks = (S.msgs || []).some((m) => /Thank you for your purchase/i.test(m.text) && /Lanka Marine Mart/.test(m.from));
    await g.stepSim(Math.round((1) * 20), 0.05); out.notYet = B.state().owned.length;
    g.atmos.day += 1; await g.stepSim(Math.round((1) * 20), 0.05); out.delivered = B.state().owned.length; out.msgDelivered = (S.msgs || []).some((m) => /^Delivered: your/.test(m.text));
    out.slip = B.slipBoat ? { id: B.slipBoat.id, x: +B.slipBoat.x.toFixed(1), z: +B.slipBoat.z.toFixed(1), mode: B.slipBoat.mode } : null;
    B.order('mirissa46'); B.order('wjgti'); B.onRest(); out.afterSleep = B.state().owned.map((o) => o.id);
    const seen = [B.slipBoat && B.slipBoat.id]; for (let i = 0; i < 3; i++) { B.switchNext(); await g.stepSim(Math.round((0.3) * 20), 0.05); seen.push(B.slipBoat && B.slipBoat.id); } out.switched = seen;
    return out;
  }, (r1) => {
  ok(r1.has && r1.moored >= 10 && r1.police === 2, `marina built: ${r1.moored} moored boats, ${r1.police} police boats, ${r1.colliders} colliders`);
  ok(r1.gang.every((y) => y > -0.6 && y < 0.3) && r1.spine > -0.6 && r1.tee > -0.6, `gangway / spine / T-head walkable (${r1.gang} / ${r1.spine} / ${r1.tee})`);
  ok(!r1.walk.swim && r1.walk.x < 226 && r1.walk.y > -0.7, `walked down the gangway onto the pontoon (${JSON.stringify(r1.walk)})`);
  ok(!r1.noBerth && r1.berth, 'no delivery without a berth; berth bought');
  ok(r1.order.ok && r1.paid === 18500000 && r1.pending === 1 && r1.msgThanks, `order: paid ${r1.paid}, purchase text`);
  ok(r1.notYet === 0 && r1.delivered === 1 && r1.msgDelivered, 'delivered the next day, with a text');
  ok(r1.slip && r1.slip.id === 'dondra26' && r1.slip.mode === 'moored', `at the berth: ${JSON.stringify(r1.slip)}`);
  ok(r1.afterSleep.length === 3, `sleeping delivers (${r1.afterSleep})`);
  ok(new Set(r1.switched).size === 3, `switching at the berth cycles the fleet (${r1.switched})`);
  });
  // ---- 2. ride: board, drive, wake, get off into the water
  await stage(p, 'ride', async () => {
    const g = window.__game, B = g.boats, P = g.player; const out = {};
    while (B.slipBoat.id !== 'dondra26') B.switchNext(); const bt = B.slipBoat; const bp = bt.worldPoint(bt.model.board, new (P.ch.root.position.constructor)());
    P.teleport(bp.x, bp.z - 1.2, 0); await g.stepSim(Math.round((0.5) * 20), 0.05); out.near = !!B.nearestBoard(P);
    B.board(P, bt); await g.stepSim(Math.round((2) * 20), 0.05); out.stage = B.ride && B.ride.stage; out.pBoat = P.boat === bt; out.seatDy = +(P.y - bt.y).toFixed(2);
    bt.place(60, -1400, -Math.PI / 2, true); /* out in the open harbour (the throttle / steering numbers, not the way out of the marina) */ await g.stepSim(Math.round((1) * 20), 0.05); out.followed = Math.hypot(P.x - 60, P.z + 1400) < 6;
    const I = window.__Input, isDown = I.isDown.bind(I); const x0 = bt.x, z0 = bt.z; I.isDown = (a) => a === 'forward' || isDown(a);
    let maxV = 0; for (let i = 0; i < 40; i++) { await g.stepSim(Math.round((0.25) * 20), 0.05); maxV = Math.max(maxV, Math.abs(bt.speed)); }
    out.maxV = +maxV.toFixed(1); out.moved = +Math.hypot(bt.x - x0, bt.z - z0).toFixed(1); out.wakes = B.wakes.trails.size; { const W = B.wakes, ix = W.geo.index.array, P = W.pos; let up = 0, dn = 0; for (let t = 0; t < W.geo.drawRange.count; t += 3) { const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3; const ny = (P[b + 2] - P[a + 2]) * (P[c] - P[a]) - (P[b] - P[a]) * (P[c + 2] - P[a + 2]); if (ny > 1e-6) up++; else if (ny < -1e-6) dn++; } out.wakeTris = [up, dn]; /* the ribbon must face up (FrontSide) */ } out.hp = bt.hp;
    I.isDown = (a) => a === 'forward' || a === 'left' || isDown(a); const y0 = bt.yaw; await g.stepSim(Math.round((3) * 20), 0.05); out.turned = +Math.abs(Math.atan2(Math.sin(bt.yaw - y0), Math.cos(bt.yaw - y0))).toFixed(2);
    I.isDown = (a) => a === 'back' || isDown(a); for (let i = 0; i < 60 && Math.abs(bt.speed) > 0.8; i++) await g.stepSim(Math.round((0.25) * 20), 0.05); I.isDown = isDown; await g.stepSim(Math.round((2) * 20), 0.05);
    out.water = window.__L.isSea(bt.x, bt.z); B.leave(P); await g.stepSim(Math.round((2.5) * 20), 0.05); out.offBoat = !P.boat && !B.ride; out.swim = !!P.swim; out.py = +P.y.toFixed(2);
    // bring her back at the berth pedestal
    P.teleport(191, -1286.6, 0); await g.stepSim(Math.round((0.5) * 20), 0.05); B.switchNext(); B.switchNext(); B.switchNext(); await g.stepSim(Math.round((0.5) * 20), 0.05); out.back = B.slipBoat && B.slipBoat.mode === 'moored' && Math.hypot(B.slipBoat.x - 190, B.slipBoat.z - B.slipBoat.berth.z) < 1;
    return out;
  }, (r2) => {
  ok(r2.near && r2.stage === 'ride' && r2.pBoat, 'boarded at the boarding point, seated at the helm'); ok(r2.followed, 'the player goes with the boat');
  ok(r2.maxV > 8 && r2.moved > 40, `throttle: ${r2.maxV} m/s, ${r2.moved} m`); ok(r2.wakes >= 1, 'wake laid behind her'); ok(r2.wakeTris[0] > 0 && r2.wakeTris[1] < r2.wakeTris[0] * 0.1, `wake ribbon faces up (${r2.wakeTris} up/down; a few fold over on the inside of turns)`); ok(r2.turned > 0.5, `steers (${r2.turned} rad in 3 s)`);
  ok(r2.offBoat && r2.water && r2.swim, `got off at sea into the water and swims (y ${r2.py})`); ok(r2.back, 'the pedestal brings her back to the berth');
  });
  // ---- 3. bullets: hull → wreck → sinks; sails holed and torn
  await stage(p, 'bullets', async () => {
    const g = window.__game, B = g.boats, P = g.player, W = g.weapons; const out = {}; const V = P.ch.root.position.constructor;
    const tgt = B.all.find((b) => b.home && b.mode === 'moored' && !b.away && b.def.cat === 'boat' && !b.sails.length); const hp0 = tgt.hp;
    const def = { dmg: 1.05, cls: 'rifle', range: 120 }; let n = 0; const o = new V(tgt.x + 12, tgt.y + 1.2, tgt.z);
    for (; n < 160 && !tgt.wrecked; n++) { const d = new V(tgt.x - o.x, tgt.y + 0.5 - o.y, tgt.z - o.z).normalize(); const h = W.trace(o, d, 120, 0.1); if (n === 0) out.kind = h.kind + ':' + h.part; if (h.kind !== 'boat') break; W.applyHit(h, d, o, def, 1, 0); }
    out.shots = n; out.wrecked = tgt.wrecked; out.hp0 = hp0; out.id = tgt.id; await g.stepSim(Math.round((40) * 20), 0.05); out.sunk = tgt.mode; out.sinkK = +tgt.sink.toFixed(2);
    const s = B.spawnNear('mirissa46', { x: 120, z: -1320, yaw: 0 }); s.setSailsVisible(true); s.mode = 'anchored'; s.berth = { x: s.x, z: s.z, yaw: s.yaw }; await g.stepSim(Math.round((0.5) * 20), 0.05);
    const sp = s.worldPoint([0, 7, 0.6], new V()); let holes = 0, kinds = [];
    for (let i = 0; i < 14; i++) { const o2 = new V(sp.x + 25 * Math.cos(s.yaw), sp.y - 1 + (i % 4) * 0.8, sp.z - 25 * Math.sin(s.yaw)); const d = new V(sp.x - o2.x, sp.y + (i % 3) - 1 - o2.y, sp.z - o2.z).normalize(); const h = W.trace(o2, d, 120, 0.1); kinds.push(h.part || h.kind); if (h.kind === 'boat') W.applyHit(h, d, o2, def, 1, 0); }
    for (const q of s.sails) holes += q.holes; out.sailKinds = [...new Set(kinds)]; out.holes = holes; out.tear = +Math.max(...s.sails.map((q) => q.tear)).toFixed(2); out.sailHp = +(s.hp / s.maxHp).toFixed(2);
    return out;
  }, (r3) => {
  ok(r3.kind && r3.kind.startsWith('boat'), `bullets hit boats (${r3.kind})`);
  ok(r3.wrecked && r3.shots > 6, `${r3.id}: wrecked after ${r3.shots} rifle hits (hp ${r3.hp0})`); ok(r3.sunk === 'sunk' || r3.sinkK > 0.5, `wreck burns and sinks (${r3.sunk}, ${r3.sinkK})`);
  ok(r3.holes >= 5 && r3.tear > 0, `sails holed (${r3.holes}) and torn (${r3.tear}) — ${r3.sailKinds}`); ok(r3.sailHp > 0.9, 'bullets through the cloth do not hurt the hull');
  });
  // ---- 4. police patrol, owners, lamps
  await stage(p, 'patrol', async () => {
    const g = window.__game, B = g.boats, P = g.player; const out = {}; if (g.police) { g.police.standDown('test'); out.stars0 = g.police.stars(); }
    P.teleport(232.5, -1199.5, -Math.PI / 2); g.atmos.hour = 14; await g.stepSim(Math.round((2) * 20), 0.05); out.noonActive = B.police.filter((b) => b.active && !b.leaving).length;
    g.atmos.hour = 8; await g.stepSim(Math.round((4) * 20), 0.05); const act = B.police.filter((b) => b.active && !b.leaving); out.morning = act.length; out.pol = B.police.map((b) => ({ a: b.active, l: b.leaving, vis: b.root.visible, x: Math.round(b.x), z: Math.round(b.z) })); out.stars8 = g.police ? g.police.stars() : -1; out.crew = act.every((b) => b.crewChars && b.crewChars[0].root.parent === b.root);
    const p0 = act[0] ? [act[0].x, act[0].z] : [0, 0]; await g.stepSim(Math.round((20) * 20), 0.05); out.patrolMoved = act[0] ? +Math.hypot(act[0].x - p0[0], act[0].z - p0[1]).toFixed(0) : 0; out.dayBeacon = act.some((b) => !!b.lights.beacon);
    g.atmos.hour = 21.5; await g.stepSim(Math.round((3) * 20), 0.05); out.nightBeacon = B.police.filter((b) => b.active).every((b) => !!b.lights.beacon && b.lights.nav === 'motor'); out.night = g.atmos.night;
    out.lamps = B.lamps.n; out.lampsRange = B.lamps.geo.drawRange.count;
    if (g.police) { g.police.addHeat(1, 'test'); await g.stepSim(Math.round((2) * 20), 0.05); out.leaving = B.police.filter((b) => b.active).every((b) => b.leaving); g.police.standDown('test'); }
    g.atmos.hour = 10; await g.stepSim(Math.round((1) * 20), 0.05);
    const c = B.berths.filter((q) => q.boat && !q.boat.away && !q.boat.owner && q.boat.mode === 'moored' && q.side !== 'Q'); const Bq = c[0]; const bt = Bq.boat; out.dep = B.startDeparture(Bq);
    const O = B.owners.find((o) => o.b === bt); const st = []; const t0 = performance.now(); for (let i = 0; i < 40 && O && !O.done; i++) { await g.stepSim(Math.round((2.5) * 20), 0.05); if (st[st.length - 1] !== O.stage) st.push(O.stage); if (O.stage === 'outbound' && Math.hypot(bt.x - bt.home.x(bt.len, bt.model.halfBeam), bt.z - bt.home.zc) > 20) break; } out.simT = +(performance.now() - t0) / 1000;
    out.ownerStages = st; out.left = +Math.hypot(bt.x - bt.home.x(bt.len, bt.model.halfBeam), bt.z - bt.home.zc).toFixed(0);
    return out;
  }, (r4) => {
  ok(r4.noonActive === 0, 'no police boats at 2 pm'); ok(r4.morning >= 1 && r4.morning <= 2 && r4.crew, `${r4.morning} police boat(s) on the morning patrol, crewed`);
  ok(r4.patrolMoved > 40, `patrolling (${r4.patrolMoved} m in 20 s)`); ok(!r4.dayBeacon && r4.nightBeacon, 'beacons off by day, on at night with nav lights');
  ok(r4.lamps > 10, `night lamps drawn (${r4.lamps} points)`);
  if (r4.leaving !== undefined) ok(r4.leaving, 'wanted: the patrol heads off');
  ok(r4.dep && r4.ownerStages.includes('board') && r4.ownerStages.includes('outbound') && r4.left > 15, `an owner walked down, boarded and took her out (${r4.ownerStages} · ${r4.left} m from the berth)`);
  });
  // ---- 5. the marine shop sites
  await stage(p, 'sites', async () => {
    const g = window.__game, ph = g.phone, Bw = ph.browser; const out = {}; ph.toggle(true); ph.launch('global');
    for (const [site, n] of [['yachts', 5], ['boats', 10], ['jetskis', 4]]) { Bw.go({ id: 'site', site }); const rows = Bw.rows().filter((r) => r.go && r.go.id === 'mboat'); out[site] = rows.length === n; Bw.back(); }
    g.story.state.money = 2e9; Bw.go({ id: 'site', site: 'jetskis' }); ph.row = 0; ph.activate(); /* wjspark (wjgti is owned since stage 1) */ out.detail = Bw.top.id; ph.row = 0; ph.activate(); out.checkout = Bw.top.id; ph.row = 0; ph.activate(); out.result = Bw.top.id + ':' + Bw.top.ok; ph.toggle(false);
    out.pending = g.boats.state().pending.map((q) => q.id); return out;
  }, (r5) => {
  ok(r5.yachts && r5.boats && r5.jetskis, 'yacht site lists 5, boat site 10, jet ski site 4');
  ok(r5.detail === 'mboat' && r5.checkout === 'mbuy' && r5.result === 'mresult:true' && r5.pending.length === 1, `ordered on the site (${r5.pending})`);
  });
  ok(!errs.length, `no page errors ${errs.slice(0, 4).join(' || ')}`);
} catch (e) { console.log('FAIL exception', e.stack || e); fails++; }
await b.close().catch(() => {});
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
