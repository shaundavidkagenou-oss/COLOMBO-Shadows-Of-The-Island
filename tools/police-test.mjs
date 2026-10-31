// Police response acceptance test (Node, headless): road-graph routing (Dijkstra) validity and optimality, units driving
// planned routes through the real Traffic lane follower to random goals and stopping there, emergency overtaking +
// civilian yielding, and the wanted-level state machine (report → dispatch → search → decay → stand-down) with fines /
// arrest penalties never taking money below zero.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const L = await import('../src/world/Layout.js');
const { Traffic, linePiece, segNodes, otherEnd } = await import('../src/vehicles/Traffic.js');
const PR = await import('../src/police/PoliceResponse.js');

let pass = 0, fail = 0; const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } if (process.env.VERB) console.log('  ', c ? 'ok ' : 'NO ', msg); };
const VERB = process.env.VERB;
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const events = { emit() {}, on() {} };
const T = new Traffic(new THREE.Scene(), { blocked: () => false }, events);
const nodes = L.nodes.filter((n) => n && n.segs.some((s) => T.drivable.has(s)));

function geoShortest(a, b) { // plain geometric Dijkstra (reference for optimality)
  const dist = new Map([[a, 0]]), q = [a], done = new Set();
  while (q.length) { let bi = 0; for (let i = 1; i < q.length; i++) if (dist.get(q[i]) < dist.get(q[bi])) bi = i; const n = q.splice(bi, 1)[0]; if (n === b) return dist.get(b); if (done.has(n)) continue; done.add(n);
    for (const s of n.segs) { if (!T.drivable.has(s)) continue; const o = otherEnd(s, n); const nd = dist.get(n) + Math.hypot(o.x - n.x, o.z - n.z); if (nd < (dist.get(o) ?? Infinity)) { dist.set(o, nd); q.push(o); } } }
  return Infinity;
}
// ---- 1. routing: every hop is a drivable segment between adjacent nodes; cost close to straight-line distance
let routes = 0, bad = 0, worst = 0, unreachable = 0, worstAt = '';
for (let k = 0; k < 120; k++) {
  const a = nodes[Math.floor(rnd() * nodes.length)], b = nodes[Math.floor(rnd() * nodes.length)]; if (a === b) continue;
  const { prev, dist } = PR.shortest(a, T.drivable); const path = PR.pathTo(prev, a, b); if (!path) { unreachable++; continue; } routes++;
  let cur = a; for (const n of path) { const s = cur.segs.find((q) => otherEnd(q, cur) === n && T.drivable.has(q)); if (!s) { bad++; break; } cur = n; }
  let geo = 0, c2 = a; for (const n of path) { geo += Math.hypot(n.x - c2.x, n.z - c2.z); c2 = n; } // driven length (weights only steer the choice)
  const opt = geoShortest(a, b); const r = geo / opt; if (r > worst) { worst = r; worstAt = [a.x, a.z, b.x, b.z].map(Math.round).join(','); }
}
ok(bad === 0, `all ${routes} routes use drivable adjacent segments (bad ${bad})`);
ok(unreachable <= 3, `road network connected for police routing (unreachable pairs ${unreachable}/120)`);
ok(worst < 1.25, `driven route within 25% of the geometric shortest path (worst ${worst.toFixed(2)}× at ${worstAt})`);

// ---- 2. drive planned routes through Traffic.step and stop at the goal
function fakeVehicle(piece, s) {
  const [x, z] = [piece.p0[0] + piece.d[0] * s, piece.p0[1] + piece.d[1] * s];
  return { id: 900 + Math.floor(rnd() * 1e5), x, z, y: 0, yaw: Math.atan2(piece.d[0], piece.d[1]), speed: 0, half: 2.25, T: { accel: 6.4, maxSpeed: 46, wid: 1.74 }, beaconsOn: true, police: true, keep: true,
    ai: { pieces: [piece], s, v0: 16, stuck: 0, honkCd: 99, bumped: 0, aggressive: 1.2, emergency: true }, sync() {}, beacons(on) { this.beaconsOn = on; } };
}
const fakeGame = { traffic: T, hud: { notify() {}, subtitle() {} }, director: { active: false }, player: { x: 0, z: 0 }, story: { state: { money: 0 }, pay() {} }, clock: 0, dt: 0.05 };
const police = new PR.PoliceResponse(fakeGame);
let arrived = 0, trips = 0, maxErr = 0, offRoad = 0, timeouts = 0;
for (let k = 0; k < 30; k++) {
  const seg = T.drivableSegs[Math.floor(rnd() * T.drivableSegs.length)]; if (seg.level >= 3) { k--; continue; } const [a, b] = segNodes(seg);
  const piece = linePiece(seg, a, b, seg.level <= 1 ? 1 : 0); const v = fakeVehicle(piece, piece.len * 0.3); T.extend(v);
  const gs = T.drivableSegs[Math.floor(rnd() * T.drivableSegs.length)]; const gx = (gs.x0 + gs.x1) / 2 + (rnd() - 0.5) * 20, gz = (gs.z0 + gs.z1) / 2 + (rnd() - 0.5) * 20;
  const u = { id: k, v, officers: [] }; if (!police.plan(u, gx, gz)) continue; trips++;
  T.vehicles = [v]; let done = false; const road = u.goalRoad;
  for (let i = 0; i < 20 * 400; i++) { T.simTime = i * 0.05; T.emergency = [v]; T.step(v, 0.05, T.vehicles, null, null, null); if (i % 20 === 0 && !L.roadAt(v.x, v.z) && !nodes.some((n) => Math.abs(n.x - v.x) < 5 && Math.abs(n.z - v.z) < 5)) { /* turning round at a road end is allowed */ offRoad++; if (process.env.DBG) console.log('off', v.x.toFixed(1), v.z.toFixed(1), v.ai.pieces[0].type, v.ai.pieces[0].turn || '', v.ai.pieces[0].seg?.level, v.ai.lat); } const gd = v.ai.goal && v.ai.goal.piece ? v.ai.goal.dist : Infinity; if (gd < 5 && v.speed < 0.3) { done = true; break; } }
  if (done) { arrived++; maxErr = Math.max(maxErr, Math.hypot(v.x - road.px, v.z - road.pz)); } else timeouts++;
}
ok(trips >= 25, `planned ${trips} unit trips`);
ok(arrived === trips, `every unit reached its goal and stopped (${arrived}/${trips}, timeouts ${timeouts})`);
ok(maxErr < 9, `stopping point within 9 m of the goal on the road (max ${maxErr.toFixed(1)} m)`);
ok(offRoad <= 2, `units stay on the road surface while driving (off-road samples ${offRoad})`);

// ---- 3. emergency overtaking + civilian yielding on a long straight
{
  const seg = T.drivableSegs.filter((s) => s.level <= 1).sort((p, q) => Math.hypot(q.x1 - q.x0, q.z1 - q.z0) - Math.hypot(p.x1 - p.x0, p.z1 - p.z0))[0]; const [a, b] = segNodes(seg);
  const piece = linePiece(seg, a, b, 1); const em = fakeVehicle(piece, 5); const civ = fakeVehicle(piece, 30); civ.police = false; civ.ai.emergency = false; civ.ai.v0 = 4; civ.speed = 4; civ.beaconsOn = false; em.speed = 12;
  T.vehicles = [em, civ]; let yielded = false, passed = false, minLat = 0, contact = false;
  for (let i = 0; i < 20 * 25; i++) { T.emergency = [em]; T.step(em, 0.05, T.vehicles, null, null, null); T.step(civ, 0.05, T.vehicles, null, null, null); if (civ.ai.yieldT > 0) yielded = true; minLat = Math.min(minLat, em.ai.lat); if (Math.hypot(em.x - civ.x, em.z - civ.z) < 1.6) contact = true; const al = (em.x - civ.x) * Math.sin(civ.yaw) + (em.z - civ.z) * Math.cos(civ.yaw); if (al > 8) { passed = true; break; } }
  ok(yielded, 'civilian car ahead pulls over for a unit with lights on'); ok(passed, `unit overtakes slow traffic (centre offset ${minLat.toFixed(1)} m)`); ok(!contact, 'no contact while overtaking');
}

// ---- 4. state machine bookkeeping (no world): decay ladder, fines and arrest never below zero
ok(PR.UNITS_FOR.join() === '0,1,3,5,6,8', `units per level 1/3/5/6/8 (${PR.UNITS_FOR.slice(1).join('/')})`); ok(PR.CHASE_V0.every((v, i) => i === 0 || v >= PR.CHASE_V0[i - 1]), 'faster units at higher levels'); ok(PR.LOSE_AFTER(5) > PR.LOSE_AFTER(1), 'harder to lose at higher levels');
ok(PR.ARREST_FINE.every((f, i) => i === 0 || f >= PR.FINE_ON_SPOT), 'arrest fines ≥ on-the-spot fine');
{
  const g = { ...fakeGame, story: { state: { money: 1200 }, pay(n) { this.state.money += n; } } }; const p = new PR.PoliceResponse(g);
  ok(p.chargeable(2500) === 1200, 'fine capped at cash in hand (Rs 1,200 of 2,500)'); g.story.state.money = 0; ok(p.chargeable(5000) === 0, 'no charge when broke (never negative)');
  g.story.state.money = 9000; ok(p.chargeable(2500) === 2500, 'full fine when affordable');
}
{ // search expiry ladder: 3★ → 2 → 1 → 0 (stand down), times grow with level
  const notes = []; const g = { ...fakeGame, hud: { notify: (t) => notes.push(t), subtitle() {} }, player: { x: 0, z: 0, yaw: 0 }, indoor: true, collision: { raycast: () => 0 }, atmos: { night: 0, w: { rain: 0 } }, camera: { position: new THREE.Vector3(), getWorldDirection: (v) => v.set(0, 0, 1) }, story: { state: { money: 0 }, safeSpot: (x, z) => [x, z] } };
  const p = new PR.PoliceResponse(g); p.spawnUnit = () => null; p.level = 3; p.beginSearch(0, 0); const t0 = p.search.t0; let t = 0; const seen = [3];
  while (p.level > 0 && t < 600) { p.updateGlobal(0.5); t += 0.5; if (p.stars() !== seen[seen.length - 1]) seen.push(p.stars()); }
  ok(seen.join('') === '3210', `search decays one star at a time (${seen.join('→')})`); ok(p.state === 'return' || p.state === 'patrol', `stand-down after the last star (state ${p.state})`);
  ok(t0 === PR.SEARCH_TIME(3) && t0 > 64 && t > 140, `search timer scales with level (3★ ${t0}s, total ${t}s)`); ok(notes.includes('Police standing down'), 'stand-down notification');
}
// ---- 5. intercept driving (Pursuit.js): tail / PIT / block against a suspect fleeing down a long straight
const PU = await import('../src/police/Pursuit.js');
{
  T.collision.resolveCircle = (x, z) => ({ x, z, hit: false });
  const circ = function () { const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); return [-1.4, 0, 1.4].map((t) => [this.x + fx * t, this.z + fz * t]); };
  const mk = (x, z, yaw, speed, police) => ({ x, z, y: 0, yaw, speed, half: 2.25, radius: 0.96, T: { len: 4.5, wid: 1.74, accel: 6.4, maxSpeed: 46, mass: 1300 }, police, circles: circ, impact() {}, sync() {}, forward() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }, ai: { chase: null } });
  const run = (role, stars, secs) => {
    const P = mk(0, 0, 0, 18, false); const v = mk(-2, -45, 0, 14, true); v.ai.chase = { role, ax: 0, az: 0, speed: 0, blockT: 0, boost: 1.1, pitCd: 0 }; let pit = false, tPit = -1, minGap = 1e9, contactEarly = false, best = null, hits = 0, wasTouch = false, maxClose = 0;
    for (let i = 0; i < secs * 20; i++) { const dt = 0.05; P.z += P.speed * dt; const a = PU.chaseAim(role, P, v, stars, i * dt); Object.assign(v.ai.chase, { ax: a.x, az: a.z, speed: a.speed, contact: a.contact }); PU.stepChase(T, v, dt, [P, v]);
      const touch = PR.PoliceResponse.prototype.touching(v, P); if (touch && !wasTouch) { hits++; maxClose = Math.max(maxClose, v.speed - P.speed); } wasTouch = touch; if (touch && role === 'tail') { v.z = Math.min(v.z, P.z - 4.55); v.speed = Math.min(v.speed, P.speed); } /* the player's car body stops it (Vehicle.drive) */ if (touch && !a.contact) contactEarly = true; if (role === 'pit' && a.contact && a.along < 0 && touch && !pit) { pit = true; tPit = i * dt; PU.applyPit(P, v, a.lat >= 0 ? 1 : -1); }
      const al = (v.z - P.z); minGap = Math.min(minGap, Math.hypot(v.x - P.x, v.z - P.z)); best = { al, lat: v.x - P.x, gap: Math.hypot(v.x - P.x, v.z - P.z) }; }
    return { P, v, pit, tPit, minGap, contactEarly, end: best, hits, maxClose };
  };
  const tail = run('tail', 3, 14); ok(tail.end.al < 0 && tail.end.gap < 12 && !tail.contactEarly, `tail: closes from 45 m to the bumper and sits behind without contact (gap ${tail.end.gap.toFixed(1)} m)`);
  const ram = run('tail', 4, 14); ok(ram.hits >= 2 && ram.maxClose > 3, `4★ tail rams the rear repeatedly (${ram.hits} hits, up to ${ram.maxClose.toFixed(1)} m/s closing)`);
  const pit = run('pit', 3, 20); ok(pit.pit && pit.tPit < 16, `PIT: draws level with the rear quarter and makes contact (${pit.tPit.toFixed(1)} s)`); ok(Math.abs(pit.P.spin) > 1.4 && pit.P.pitT > 0, `PIT spins the suspect car (spin ${pit.P.spin?.toFixed(2)} rad/s)`);
  const blk = run('block', 3, 25); ok(blk.end.al > 4 && Math.abs(blk.end.lat) < 3.5, `block: overtakes and ends up ahead on the suspect's line (ahead ${blk.end.al.toFixed(1)} m, offset ${blk.end.lat.toFixed(1)} m)`);
  // roadblock sites: on the road, ahead of the suspect, 150–240 m along the network
  let sites = 0, tries = 0, badSite = 0;
  for (let k = 0; k < 80; k++) { const seg = T.drivableSegs[Math.floor(rnd() * T.drivableSegs.length)]; if (seg.level >= 3) continue; tries++; const t = 0.2 + rnd() * 0.6; const x = seg.x0 + (seg.x1 - seg.x0) * t, z = seg.z0 + (seg.z1 - seg.z0) * t; const yaw = Math.atan2(seg.x1 - seg.x0, seg.z1 - seg.z0) + (rnd() < 0.5 ? Math.PI : 0);
    const S = PU.roadblockSite({ x, z, yaw }, () => PR.nearestRoad(T.drivableSegs, x, z), T.drivable, 150, 240); if (!S) continue; sites++; const d = Math.hypot(S.x - x, S.z - z); const ahead = (S.x - x) * Math.sin(yaw) + (S.z - z) * Math.cos(yaw);
    if (!L.roadAt(S.x, S.z) || d > 250 || d < 40 || ahead < 0) { badSite++; if (process.env.DBG) console.log('site', x, z, S, d, ahead); } }
  ok(sites > tries * 0.4, `roadblock site found ahead on most roads (${sites}/${tries})`); ok(badSite === 0, `every roadblock site is on the road ahead of the suspect (${badSite} bad)`);
  const st = { x: 10, z: 10, yaw: 0, len: 4, depth: 0.42 }; const car = mk(10, 10 + 1.6, 0, 10, false); ok(PU.overStrip(st, car), 'spike strip: front wheels on the strip → puncture'); car.z = 16; ok(!PU.overStrip(st, car), 'spike strip: clear 6 m away');
  const l1 = PU.radioLine('heading', { road: 'Galle Road', dir: PU.compass(Math.PI), vtype: 'tuktuk' }); ok(/three-wheeler heading north on Galle Road/.test(l1.en), `radio: "${l1.en}"`);
  { const s5 = PU.catchUpSpeed(5, 33, 400, 28), s5n = PU.catchUpSpeed(5, 33, 30, 28), s3 = PU.catchUpSpeed(3, 20, 300, 23);
    ok(s5 > 33 * 1.1 && s5 <= 42 && s5n === 28 && s3 > 20, `3★+ catch-up: 5★ unit 400 m behind a 33 m/s car drives ${s5.toFixed(1)} m/s; at the bumper ${s5n} m/s; 3★ ${s3.toFixed(1)} m/s`);
    const tg = { x: 0, z: 0, v: { yaw: 0 } };
    ok(PU.straggler({ x: 0, z: -500 }, tg, 500, false) && !PU.straggler({ x: 0, z: -500 }, tg, 500, true) && !PU.straggler({ x: 0, z: 500 }, tg, 500, false) && !PU.straggler({ x: 0, z: -300 }, tg, 300, false),
      'stragglers recycled only when far behind and out of view (never units ahead or on screen)'); }
  { const lf = PU.radioLine('heading', { road: 'Galle Road', dir: 0, vtype: 'foot' }); ok(/suspect on foot, heading/.test(lf.en) && !/vehicle/.test(lf.en), `radio (on foot): "${lf.en}"`); }
  const l2 = PU.radioLine('heading', { road: 'Galle Road', dir: PU.compass(Math.PI / 2), alt: true }); ok(l2.si.includes('නැගෙනහිර') && /east/.test(l2.tr), 'radio: Sinhala line with translation');
}
console.log(`metrics: ${routes} routes (worst ${worst.toFixed(2)}× optimal), ${arrived}/${trips} unit trips arrived (max stop error ${maxErr.toFixed(1)} m)`);
console.log(`police: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
