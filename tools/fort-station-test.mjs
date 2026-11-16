// Colombo Fort station life test (Node, headless) — world/StationLife.js on the real station colliders (FortStation.js),
// the real city plan, the real Crowd and the real Trains.
// 1. Static: platform spots / bench seats clear; every walking route (street → hall → queue lanes → platform → doors → out,
//    the vendors' beat) runs clear of every collider at the right floor height (the entrance stairs included).
// 2. Live: staff on duty (5 clerks, the announcer seated in her chair, 3 vendors with their wares on the shoulder), passengers
//    arrive off the street, queue, buy at the windows and wait on platform 1; the train comes in: riders get up, walk to the
//    platform-side doors, step down and walk out to the street; waiting passengers walk to the doors and board (seated in
//    the car's seats, inside the car body); announcements 1–3 follow the train, the general ones come round.
// 3. The player buys from a vendor (pays, prompt); a frightened passenger leaves; PA routing (in the announcer's room: one
//    clean direct voice; elsewhere: the nearest speakers with distance delay, a horn-speaker band); the player leaving puts
//    everyone away.
import './node-dom-stub.mjs';
import * as THREE from 'three';
{ let ms = +(process.env.SEED || 7); Math.random = () => ((ms = (ms * 48271) % 2147483647) / 2147483647); }
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Collision } = await import('../src/world/Collision.js');
const { MultiBuilder } = await import('../src/gfx/MeshBuilder.js');
const { buildFortStation } = await import('../src/world/FortStation.js');
const { FORT, inAnnouncerRoom } = await import('../src/world/FortStationData.js');
const { StationLife, WARES } = await import('../src/world/StationLife.js');
const { Trains, TRAIN_LEN } = await import('../src/vehicles/Trains.js');
const { CAR_LEN } = await import('../src/vehicles/TrainModels.js');
const { Crowd } = await import('../src/actors/Crowd.js');
const { SoundBank } = await import('../src/audio/SoundBank.js');
const { Audio } = await import('../src/audio/Audio.js');
const R = await import('../src/world/Railway.js');

let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
const F = FORT, FL = F.FL;
const col = new Collision(); col.addAll(CP.plan.colliders);
const fcol = []; buildFortStation({ mb: new MultiBuilder(), colliders: fcol, group: new THREE.Group(), C: (c) => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; }, hip() {}, lightPool() {} }); col.addAll(fcol);
const sc = new THREE.Scene(); const events = { emit() {}, on() {} };
const T = new Trains(sc); const C = new Crowd(sc, col, events); C.max = 8; C.prepareSpecs(24);
const subs = []; const player = { x: -35, z: -575, yaw: 0, speed: 0, vehicle: null, ch: null, stamina: 0.2 };
const g = { crowd: C, trains: T, collision: col, scene: sc, player, hud: { subtitle: (w, t) => subs.push([w, t]), notify() {} }, story: { state: { money: 1000 }, pay(n) { this.state.money += n; } }, health: { heal() {} } };
const S = new StationLife(g);

// ---------------------------------------------------------------- 1. static
ok(S.stop && S.stop.name === 'Colombo Fort', 'Fort stop found on the line');
const free = S.spots.filter((s) => !s.seat), seats = S.spots.filter((s) => s.seat);
ok(free.length >= 25, `standing spots on platform 1 (${free.length})`); ok(seats.length >= 12, `bench seats usable (${seats.length})`);
ok(S.spots.every((s) => S.headClear(s.ax, s.az, 0.3, FL)), 'every spot / bench approach is clear');
// a walk is clear: every 0.25 m, at the floor height found by walking (steps up/down ≤ 0.35 m, the entrance stairs)
const walkClear = (pts, from, label) => { let [x, z] = from; let y = col.groundAt(x, z, FL + 0.2); let bad = null;
  for (const [tx, tz] of pts) { const n = Math.max(1, Math.ceil(Math.hypot(tx - x, tz - z) / 0.25)); for (let k = 1; k <= n; k++) { const sx = x + (tx - x) * k / n, sz = z + (tz - z) * k / n; const ny = col.groundAt(sx, sz, y + 0.1, 0.4); if (Math.abs(ny - y) > 0.36 && !bad) bad = `step ${(ny - y).toFixed(2)} m at ${sx.toFixed(1)},${sz.toFixed(1)}`; y = ny; if (!bad && !S.headClear(sx, sz, 0.26, y)) bad = `blocked at ${sx.toFixed(1)},${sz.toFixed(1)} (y ${y.toFixed(2)})`; } x = tx; z = tz; }
  ok(!bad, `${label}${bad ? ': ' + bad : ''}`); return !bad; };
for (let e = 0; e < 3; e++) {
  for (const w of [0, 1, 3, 4, 7]) walkClear(S.routeToQueue(e, w), [F.street[e].x, F.street[e].z], `street ${e} → queue lane ${w + 1}`);
  walkClear([...S.routeIn(e), ...S.routeToPlatform(S.colX(e), -645.6)], [F.street[e].x, F.street[e].z], `street ${e} → platform 1 (season ticket)`);
}
for (const w of [0, 1, 3, 4, 7]) { for (let i = 0; i < 6; i++) { const [x, z] = S.queueSlot(w, i); ok(S.headClear(x, z, 0.26, FL), `queue ${w + 1} slot ${i} clear`); } walkClear(S.routeToPlatform(0, 0, w), S.queueSlot(w, 0), `window ${w + 1} → platform`); }
{ let bad = 0; for (const s of S.spots) { const a = S.archFor(s.ax); const pth = S.platformPath(a, -625.6, s.ax, s.az, true); if (!pth) { bad++; continue; } if (!walkClear(S.routeOut(s.ax, s.az), [s.ax, s.az], `spot ${s.ax.toFixed(1)},${s.az.toFixed(1)} → street`)) bad++; } ok(!bad, 'every spot has a clear way in and out'); }
walkClear(F.vendorLoop.slice(1).concat([F.vendorLoop[0]]), F.vendorLoop[0], 'vendors\' beat (platform 1 ↔ hall)');
ok(inAnnouncerRoom(F.ann.chair.x, F.ann.chair.z) && !inAnnouncerRoom(F.ann.chair.x, F.ann.z1 + 1), 'announcer\'s room test');

// ---------------------------------------------------------------- 2. live
const t0 = T.trains[0]; const st = S.stop;
const sendTrain = (lead) => { const dir = st.s + lead + TRAIN_LEN < R.PATH.total ? -1 : 1; t0.dir = dir; t0.sLow = st.s - TRAIN_LEN / 2 - dir * lead; t0.state = 'run'; t0.speed = 8; t0.nextStop = st; t0.updateLamps(); t0.place(); };
const focus = { x: player.x, z: player.z }; const camDir = { x: 0, z: 1 };
const ctx = () => ({ simTime: tm, vehicles: [], player, bodies: [], hourFactor: 1, hour: 9 });
let tm = 0; const dt = 1 / 30; const slots = new Set(); const subA = [];
const origAnn = S.announce.bind(S); S.announce = (slot, tr) => { slots.add(slot); return origAnn(slot, tr); };
let worstIn = null, maxRiderOut = 0, stuckMax = 0; const lastPos = new Map(); let seatedAnn = 0, seatErr = 1, vendorProps = 0, wpMoves = 0, clerkCount = 0;
const step = () => {
  if (process.env.YT) for (const a of S.pax) { const p = a.p; if (p && p.z > -630 && p.z < -613.5 && p.y < 1 && !a._yl) { a._yl = 1; console.log('LOWY', tm.toFixed(2), a.phase, p.state, p.x.toFixed(2), p.z.toFixed(2), p.y, (a._hist || []).join(' ')); } if (p) { (a._hist ??= []).push(`${a.phase}/${p.state}@${p.x.toFixed(2)},${p.z.toFixed(2)},${(p.y||0).toFixed(2)}`); if (a._hist.length > 6) a._hist.shift(); } }
  T.update(dt, { focus, night: 0, player, vehicles: [] }); C.update(dt, focus, camDir, ctx()); S.update(dt, { focus, night: 0, hour: 9, player }); tm += dt;
  for (const a of [...S.pax, ...S.vendors, S.announcer]) { const p = a.p; if (!p || p.dead || p.sit || a.seat) continue; if (!S.headClear(p.x, p.z, 0.12, col.groundAt(p.x, p.z, (p.y || 0) + 0.25, 0.45))) { /* the floor under them (Crowd refreshes p.y every few frames: on the entrance steps it trails by a step) */ if (!worstIn && process.env.V) console.log('BLOCKED', p.y, col.groundAt(p.x, p.z, (p.y || 0) + 0.25, 0.45), col.query(p.x - 0.12, p.z - 0.12, p.x + 0.12, p.z + 0.12).filter((c) => p.x + 0.12 > c.x0 && p.x - 0.12 < c.x1 && p.z + 0.12 > c.z0 && p.z - 0.12 < c.z1).map((c) => c.kind + ':' + (c.y0 || 0) + '+' + c.h + ' z' + c.z0.toFixed(2) + '..' + c.z1.toFixed(2)).join(' '), a.role, a.phase, JSON.stringify(a.route), a.spot && [a.spot.ax, a.spot.az, !!a.spot.seat], a.door && [a.door.x, a.door.z], p.state); worstIn = worstIn || `${a.role} ${a.phase} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`; }
    const walking = ['toQueue', 'toPlatform', 'toSpot', 'leave', 'walk', 'toDoor', 'back'].includes(a.phase) && a.route && a.route.length; const lp = lastPos.get(a) || { x: p.x, z: p.z, t: 0 }; if (walking && Math.hypot(p.x - lp.x, p.z - lp.z) < 0.02) lp.t += dt; else { lp.t = 0; lp.x = p.x; lp.z = p.z; } lastPos.set(a, lp); stuckMax = Math.max(stuckMax, lp.t); }
  for (const r of S.riders) if (r.ch.root.parent !== sc && r.state !== 'stepIn') { const q = r.ch.root.position; maxRiderOut = Math.max(maxRiderOut, Math.abs(q.x) - (1.5 - 0.15), Math.abs(q.z) - (CAR_LEN / 2 - 0.3)); }
  const an = S.announcer; if (an.p && an.phase === 'seated' && an.sitW >= 1) { seatedAnn++; seatErr = Math.hypot(an.p.x - F.ann.chair.x, an.p.z - F.ann.chair.z); }
  for (const v of S.vendors) (v.wpSeen ??= new Set()).add(v.wp); vendorProps = S.vendors.filter((v) => v.p && v.prop && v.prop.parent === v.p.ch.bones.chest && v.p.ch.anim.ik).length; clerkCount = Math.max(clerkCount, S.clerks.length);
};
sendTrain(200); const hold = t0.sLow; // the train held 200 m off (riders aboard, in reach) while the station fills up
const wp0 = S.vendors.map((v) => v.wp); let earlyFort = false;
for (let i = 0; i < 150 / dt; i++) { step(); t0.sLow = hold; t0.speed = 0; t0.state = 'run'; t0.place(); if (S.atFort(t0)) earlyFort = true; }
ok(!earlyFort, 'the train held off during the fill-up');
if (process.env.V) for (const v of S.vendors) console.log('vendor', v.phase, v.wp, v.p && v.p.x.toFixed(1), v.p && v.p.z.toFixed(1), v.p && v.p.state);
wpMoves = S.vendors.filter((v) => v.wpSeen && v.wpSeen.size >= 3).length;
ok(clerkCount === 5, `5 clerks on duty at the open windows (${clerkCount})`);
ok(S.clerks.every((c) => c.ch.anim.seated && Math.abs(c.ch.root.position.y - (FL + 0.69)) < 0.01), 'clerks sit on their high stools');
ok(seatedAnn > 30 && seatErr < 0.05, `announcer seated in her chair (${seatErr.toFixed(3)} m)`);
ok(S.announcer.p && S.announcer.p.sp.sex === 'f' && S.announcer.p.sp.ageYears >= 18, 'the announcer is an adult woman');
ok(vendorProps === 3, `3 vendors carrying their wares on the shoulder, right hand on the load (${vendorProps})`);
ok(wpMoves === 3, `vendors walk their beat (${wpMoves}/3 moved on)`);
ok(S.stats.arrivals >= 10, `passengers arrive (${S.stats.arrivals})`); ok((S.stats.queued || 0) >= 4, `passengers queue at the windows (${S.stats.queued})`); ok(S.stats.bought >= 3, `tickets bought (${S.stats.bought})`);
const waiting = () => S.pax.filter((a) => a.phase === 'wait').length; ok(waiting() >= 5, `passengers waiting on platform 1 (${waiting()})`);
ok(S.pax.every((a) => !a.p || a.p.sp.ageYears >= 18), 'all passengers are adults');
ok(S.riders.length >= 6, `riders seated in the train while it is within reach (${S.riders.length})`);
ok(S.riders.every((r) => r.state !== 'seated' || (r.ch.anim.seated && Math.abs(r.ch.root.position.y - r.seat.y) < 0.01)), 'riders sit on the seat cushions');
// the train comes in
sendTrain(320); let arrivedAt = null, departedAt = null, alighted0 = S.stats.alighted, boarded0 = S.stats.boarded;
for (let i = 0; i < 200 / dt; i++) { step(); if (S.atFort(t0) && arrivedAt === null) arrivedAt = tm; if (arrivedAt !== null && departedAt === null && t0.state === 'run') { departedAt = tm; } if (departedAt !== null && tm - departedAt > 60) break; }
ok(arrivedAt !== null && departedAt !== null, 'the train stops at Fort and leaves again');
ok(S.stats.alighted - alighted0 >= 2, `riders get off at Fort (${S.stats.alighted - alighted0})`); ok(S.stats.boarded - boarded0 >= 2, `waiting passengers board (${S.stats.boarded - boarded0})`);
ok(S.stats.handedOver >= 2, `people walk out to the street and join the crowd (${S.stats.handedOver})`);
ok(maxRiderOut <= 0.02, `riders stay inside the car body (worst ${maxRiderOut.toFixed(3)} m)`);
ok(!worstIn, `nobody walks into a wall, bench or kiosk${worstIn ? ': ' + worstIn : ''}`); ok(stuckMax < 12, `nobody stuck on a walk (longest stand-still ${stuckMax.toFixed(1)} s)`);
ok(slots.has(1) && slots.has(2) && slots.has(3), `announcements follow the train (${[...slots].sort()})`);
for (let i = 0; i < 200 / dt; i++) step(); ok(slots.has(4) || slots.has(5), `general announcements come round (${[...slots].sort()})`);
ok(subs.some(([w]) => w === 'Station announcement'), 'without a recording the announcement is shown as text');

// ---------------------------------------------------------------- 3. player, fright, PA routing, leaving
{ const v = S.vendors.find((q) => q.alive()); const p = v.p; player.x = p.x - Math.sin(p.yaw) * -1.2; player.z = p.z; player.x = p.x - 1.4; player.yaw = Math.PI / 2; const m0 = g.story.state.money;
  const pr = S.interact(player, (k) => `[${k}]`, () => false); ok(pr && pr.includes('Buy') && pr.includes(v.ware.name), `buy prompt by a vendor ("${pr}")`);
  S.interact(player, (k) => `[${k}]`, () => true); ok(g.story.state.money === m0 - v.ware.price, `paid Rs. ${v.ware.price} for ${v.ware.name}`);
  ok(WARES.every((w) => w.price > 0 && w.calls.length >= 2), 'every vendor sells something and calls it out'); player.x = -35; player.z = -575; player.yaw = 0; }
{ const a = S.pax.find((q) => q.alive() && q.phase === 'wait'); if (a) { C.react(a.p, 'flee', 2, { fleeDir: [0, -1], fleeSp: 3 }); for (let i = 0; i < 10 / dt && a.p && a.p.state !== 'job'; i++) step(); ok(!a.p || a.phase === 'leave', `a frightened passenger leaves the station (${a.phase})`); } else ok(false, 'a waiting passenger to frighten'); }
{ const calls = []; const orig = SoundBank.play.bind(SoundBank); SoundBank.play = (id, k, pan, when, o = {}) => { calls.push({ id, k, when, ...o }); return true; };
  Audio.listener = { x: 12, z: -634, yaw: 0 }; player.x = 12; player.z = -634; origAnn(4); const inRoom = calls.splice(0);
  ok(inRoom.length === 1 && inRoom[0].key === 'pa.direct' && !inRoom[0].lp && !inRoom[0].hp, 'in the announcer\'s room: her voice directly, clean');
  Audio.listener = { x: -40, z: -620, yaw: 0 }; player.x = -40; player.z = -620; origAnn(4); const out = calls.splice(0);
  ok(out.length >= 2 && out.every((c) => c.hp > 0 && c.lp > 0 && c.lp <= 5200 && c.id === 'station.announce4'), `on the platform: through ${out.length} PA speakers (horn-speaker band)`);
  ok(out.every((c, i) => i === 0 || c.when >= out[0].when - 1e-6), 'the farther speakers arrive later (distance delay)');
  SoundBank.play = orig; player.x = -35; player.z = -575; Audio.listener = null; }
focus.x += 500; for (let i = 0; i < 3 / dt; i++) step();
ok(!S.active && S.pax.length === 0 && S.clerks.length === 0 && !C.peds.some((p) => p.stationRole), 'the player gone: the station\'s people are put away');
console.log(`stats ${JSON.stringify(S.stats)}`);
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
