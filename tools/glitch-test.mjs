// Glitch regression test (Node, headless) on the real city plan, collision, traffic, crowd and PoliceResponse:
//  - police on foot: a suspect inside a closed compound (walls all round, gate shut) is reached by climbing the wall —
//    no frame-to-frame zigzag along it; a suspect inside a building (unreachable) → officers hold the closest point, still
//  - an officer stepping out on the cramped side of his car (wall 0.6 m away) walks clear smoothly (no stutter)
//  - shot officers stay down (no recovering after 25 s); a unit with nobody left leaves its car parked; bodies are
//    cleared away only unseen
//  - crowd: a person shot stays down for good; nobody leaves the down state while the body is still tipped over (the
//    'runs away lying flat' glitch); a fallen body never lies through a wall
//  - parked cars: taking a parked car does not make a new one appear in its bay while the player is near
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Collision } = await import('../src/world/Collision.js');
const { Traffic } = await import('../src/vehicles/Traffic.js'); const { Vehicle } = await import('../src/vehicles/Vehicle.js');
const { PoliceResponse } = await import('../src/police/PoliceResponse.js');
const { Character } = await import('../src/actors/Character.js'); const { makePoliceAppearance } = await import('../src/actors/Appearance.js');
const { Health } = await import('../src/actors/Health.js'); const { Crowd } = await import('../src/actors/Crowd.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };

const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene(); const T = new Traffic(scene, col, { emit() {}, on() {} }); T.max = 0;
const playerCh = new Character(makePoliceAppearance(91, 'patrol')); scene.add(playerCh.root);
const player = { x: 0, z: 0, y: 0, yaw: 0, vehicle: null, speed: 0, crouching: false, control: true, ch: playerCh, stamina: 1, events: { on() {} }, camOverride: false, teleport() {}, snapCamera() {} };
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
const g = { scene, traffic: T, collision: col, camera, player, mode: 'play', clock: 0, timeSlow: 1, indoor: false, crowd: { peds: [], alarm() {} }, director: { active: false },
  hud: { notify() {}, subtitle() {}, show() {}, hurt() {}, fade: async () => {}, root: { classList: { contains: () => false } } },
  story: { state: { money: 60000, health: 100 }, pay() {}, safeSpot: (x, z) => [x, z], running: false, conds: [], fail() { return new Error('x'); } },
  atmos: { night: 0, hour: 14, day: 1, w: { rain: 0 }, advance() {} }, squad: { activeMember: { def: { full: 'Test' } } }, weapons: null, events: { emit() {}, on() {} } };
g.health = new Health(g);
const police = new PoliceResponse(g); g.police = police; police.patrolCd = 1e9; const ff = police.ff;
const mkOfficer = (x, z, yaw, seed = 1, u = null) => { const ch = new Character(makePoliceAppearance(7000 + seed * 13, 'patrol')); scene.add(ch.root); const o = { ch, unit: u, mode: 'foot', x, z, y: col.groundAt(x, z, 0.5), yaw, t: 0, hits: 0, acc: 0 }; ff.arm(o); police.placeOfficer(o); return o; };
const put = (x, z) => { player.x = x; player.z = z; player.y = col.groundAt(x, z, 0.5); player.ch.root.position.set(x, player.y, z); };
// an open patch of ground (no colliders, no water, off the road) for the synthetic set-ups
const open = (() => { for (let x = -900; x < 900; x += 7) for (let z = -1200; z < 900; z += 7) { let okk = !L.isWater(x, z) && !L.roadAt(x, z); for (let a = 0; okk && a < 24; a++) { const r = 4 + (a % 4) * 4.5, t = a * 2.4; if (col.blocked(x + Math.cos(t) * r, z + Math.sin(t) * r, 1) || L.isWater(x + Math.cos(t) * r, z + Math.sin(t) * r)) okk = false; } if (okk && !col.blocked(x, z, 17)) return { x, z }; } return null; })();
ok(!!open, `found an open test patch (${open && open.x}, ${open && open.z})`);
const S = open; const added = [];
const addBox = (x0, x1, z0, z1, h, kind) => { const c = { x0, x1, z0, z1, h, kind }; col.add(c); added.push(c); return c; };
const clearAdded = () => { col.remove((c) => added.includes(c)); added.length = 0; };
const yawJerk = (arr) => { let n = 0; for (let i = 2; i < arr.length; i++) { const a = Math.atan2(Math.sin(arr[i] - arr[i - 1]), Math.cos(arr[i] - arr[i - 1])), b = Math.atan2(Math.sin(arr[i - 1] - arr[i - 2]), Math.cos(arr[i - 1] - arr[i - 2])); if (Math.abs(a) > 0.05 && Math.abs(b) > 0.05 && Math.sign(a) !== Math.sign(b)) n++; } return n; };

// ---------------------------------------------------------------- 1. suspect inside a closed compound
{ const cx = S.x, cz = S.z; const hw = 7, hd = 5, wh = 1.6; // 14 × 10 m compound, 1.6 m walls, front wall with a shut 2.2 m iron gate
  addBox(cx - hw, cx - 2.3, cz - hd - 0.12, cz - hd + 0.12, wh, 'wall'); addBox(cx + 2.3, cx + hw, cz - hd - 0.12, cz - hd + 0.12, wh, 'wall'); addBox(cx - 2.28, cx + 2.28, cz - hd - 0.18, cz - hd + 0.18, 2.2, 'wall');
  addBox(cx - hw, cx + hw, cz + hd - 0.12, cz + hd + 0.12, wh, 'wall'); addBox(cx - hw - 0.12, cx - hw + 0.12, cz - hd, cz + hd, wh, 'wall'); addBox(cx + hw - 0.12, cx + hw + 0.12, cz - hd, cz + hd, wh, 'wall');
  put(cx + 1, cz + 1.5); const u = { id: 41, v: null, officers: [], task: 'foot' }; const o = mkOfficer(cx - 1, cz - hd - 9, 0, 41, u); u.officers.push(o); police.units = [u]; police.foot = [o];
  police.level = 2; police.state = 'pursuing'; police.busy = false; let got = null; police.arrest = async (off, kind) => { got = { kind, t: police.t }; police.busy = true; };
  const yaws = []; const v0 = police.stats.vaults || 0; let t = 0; let path = 0; let px = o.x, pz = o.z;
  for (let i = 0; i < 600 && !got; i++) { const dt = 0.05; t += dt; police.t += dt; g.clock += dt; police.spotted(); police.updateOfficer(o, u, dt); yaws.push(o.yaw); path += Math.hypot(o.x - px, o.z - pz); px = o.x; pz = o.z; }
  const inside = Math.abs(o.x - cx) < hw && Math.abs(o.z - cz) < hd; const vaults = (police.stats.vaults || 0) - v0;
  ok(vaults >= 1, `the officer climbs the compound wall (${vaults} climb(s); the 2.2 m gate is not climbed)`);
  ok(got && inside, `… gets in and reaches the suspect → arrest '${got && got.kind}' after ${got ? got.t.toFixed(1) : '—'} s (officer ${inside ? 'inside' : 'outside'})`);
  ok(yawJerk(yaws) <= 6, `no zig-zag on the way (${yawJerk(yaws)} left-right heading reversals, path ${path.toFixed(1)} m)`);
  delete police.arrest; police.busy = false; police.units = []; police.foot = []; scene.remove(o.ch.root); clearAdded(); }

// ---------------------------------------------------------------- 2. suspect inside a building (unreachable on foot)
{ const cx = S.x, cz = S.z; addBox(cx - 4, cx + 4, cz - 4, cz + 4, 9, 'building'); put(cx, cz);
  const u = { id: 42, v: null, officers: [], task: 'foot' }; const o = mkOfficer(cx - 2, cz - 14, 0, 42, u); u.officers.push(o); police.units = [u]; police.foot = [o];
  police.level = 2; police.state = 'pursuing'; police.busy = false; let got = null; police.arrest = async () => { got = true; police.busy = true; };
  const tail = []; for (let i = 0; i < 400; i++) { const dt = 0.05; police.t += dt; police.spotted(); police.updateOfficer(o, u, dt); if (i >= 300) tail.push([o.x, o.z, o.yaw]); }
  let span = 0, turn = 0; for (const [x, z] of tail) span = Math.max(span, Math.hypot(x - tail[0][0], z - tail[0][1])); for (let i = 1; i < tail.length; i++) turn += Math.abs(Math.atan2(Math.sin(tail[i][2] - tail[i - 1][2]), Math.cos(tail[i][2] - tail[i - 1][2])));
  const dWall = Math.max(Math.abs(o.x - cx), Math.abs(o.z - cz)) - 4;
  ok(!got && o.navHold && dWall < 1.2, `unreachable suspect: the officer goes to the closest point (${dWall.toFixed(2)} m from the wall) and holds there`);
  ok(span < 0.15 && turn < 0.6, `… standing still, not thrashing (moved ${span.toFixed(2)} m, turned ${turn.toFixed(2)} rad in the last 5 s)`);
  delete police.arrest; police.busy = false; police.units = []; police.foot = []; scene.remove(o.ch.root); clearAdded(); }

// ---------------------------------------------------------------- 3. stepping out on the cramped side of the car
{ const cx = S.x, cz = S.z; addBox(cx - 8, cx + 8, cz + 1.55, cz + 1.8, 1.8, 'wall'); // wall along the car, 0.6 m from its side
  const pc = new Vehicle('police', 51, scene); pc.place(cx, cz, Math.PI / 2); pc.speed = 0; T.vehicles.push(pc);
  const u = { id: 43, v: pc, officers: [], task: 'foot' }; const o = mkOfficer(cx + 0.4, cz + 1.25, 0, 43, u); u.officers.push(o);
  const gx = cx + 12, gz = cz - 7; let zeros = 0, n = 0, reached = -1; const sp0 = [];
  for (let i = 0; i < 300; i++) { const dt = 0.05; police.t += dt; const d = Math.hypot(gx - o.x, gz - o.z); if (d < 0.6) { reached = i * dt; break; } const s = police.moveTo(o, gx, gz, 1.6, dt); police.animOfficer(o, dt, s); if (i > 6) { n++; if (s === 0) zeros++; sp0.push(o.animSp); } }
  let flick = 0; for (let i = 1; i < sp0.length; i++) if (Math.abs(sp0[i] - sp0[i - 1]) > 0.6) flick++;
  ok(reached > 0 && reached < 11.5, `out of the gap between car and wall and on the way (${reached > 0 ? reached.toFixed(1) + ' s to a point 14 m away' : 'never got there'})`);
  ok(zeros <= n * 0.08 && flick === 0, `no stutter: ${zeros}/${n} stalled frames, ${flick} jumps in gait speed`);
  T.vehicles.splice(T.vehicles.indexOf(pc), 1); scene.remove(pc.mesh); scene.remove(o.ch.root); clearAdded(); }

// ---------------------------------------------------------------- 4. shot officers stay down; their car stays; bodies cleared unseen
{ const cx = S.x, cz = S.z; const pc = new Vehicle('police', 52, scene); pc.place(cx + 6, cz, 0); pc.speed = 0; T.vehicles.push(pc);
  const u = { id: 44, v: pc, officers: [], task: 'foot' }; pc.police = u; const o = mkOfficer(cx, cz, 0, 44, u); u.officers.push(o); police.units = [u]; police.level = 3; police.state = 'pursuing';
  put(cx, cz - 20); police.officerHit(o, 0, 1); ok(!o.dead && o.mode === 'foot', 'one round: the officer staggers'); police.officerHit(o, 0, 1);
  ok(o.dead && !police.units.includes(u) && T.parked.includes(pc), 'second round: officer down for good; the unit has nobody left and its car stays parked where it stopped');
  camera.position.set(cx, 2, cz - 6); camera.lookAt(cx, 0.5, cz); camera.updateMatrixWorld();
  for (let i = 0; i < 1200; i++) { police.t += 0.05; police.updateBodies(0.05); } // 60 s, in view
  ok(police.bodies.length === 1 && o.ch.root.parent === scene && o.mode === 'dead', 'still down after 60 s (the old code had them get up after 25 s)');
  for (let i = 0; i < 2000; i++) { police.t += 0.05; police.updateBodies(0.05); } // 160 s total, still in view
  ok(police.bodies.length === 1, 'never removed while the player is looking at it');
  put(cx + 80, cz); camera.position.set(cx + 80, 2, cz); camera.lookAt(cx + 160, 0.5, cz); camera.updateMatrixWorld(); police.updateBodies(0.05);
  ok(police.bodies.length === 0 && !o.ch.root.parent, 'cleared away once out of sight and far');
  T.parked.splice(T.parked.indexOf(pc), 1); scene.remove(pc.mesh); police.level = 0; police.state = 'patrol'; }

// ---------------------------------------------------------------- 5. crowd: shot stays down; no one runs while tipped over; bodies vs walls
{ const C = new Crowd(new THREE.Scene(), col, { emit() {}, on() {} }); C.prepareSpecs(30); C.max = 40;
  const spot = { x: -128, z: -880 }; const ctx = { simTime: 0, vehicles: [], player: { x: spot.x + 400, z: spot.z, vehicle: null, ch: null, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1, hour: 10 };
  for (let i = 0; i < 80; i++) { ctx.simTime += 0.1; C.update(0.1, spot, { x: 0, z: 1 }, ctx); }
  const near = C.peds.filter((p) => Math.hypot(p.x - spot.x, p.z - spot.z) < 40); ok(near.length >= 6, `crowd spawned (${near.length} people nearby)`);
  const shot = near[0], punched = near.slice(1, 4); C.hitPed(shot, 1, 0, 1.6); let downed = 0; for (const p of punched) { p.fighter = false; for (const m of ['jab', 'cross', 'hook', 'upper']) C.punched(p, { x: p.x - 1, z: p.z }, m); if (p.state === 'down') downed++; }
  ok(downed === punched.length, `a full jab-cross-hook-uppercut combination puts a non-fighter down (${downed}/${punched.length})`);
  let tippedRunning = 0, maxDown = 0;
  for (let i = 0; i < 1200; i++) { ctx.simTime += 0.05; if (i % 20 === 0) C.alarm(spot.x, spot.z, 60, 2, null); C.update(0.05, spot, { x: 0, z: 1 }, ctx);
    for (const p of C.peds) { if (p.state !== 'down' && p.ch.mesh.rotation.x < -0.2) tippedRunning++; if (p.state === 'down') maxDown = Math.max(maxDown, p.downT || 0); } }
  ok(shot.state === 'down' && shot.dead && shot.ch.mesh.rotation.x < -1.3 && C.peds.includes(shot), `a person shot stays down for good (still down after 60 s of gunfire alarms, tipped ${shot.ch.mesh.rotation.x.toFixed(2)})`);
  ok(punched.every((p) => p.state !== 'down' && !p.dead), 'people punched to the ground get up again (not killed)');
  ok(tippedRunning === 0, `nobody is ever in another state while the body is still tipped over (${tippedRunning} samples)`);
  // fall towards a wall: the body must not lie through it
  const w = { x0: spot.x + 0.6, x1: spot.x + 0.9, z0: spot.z - 3, z1: spot.z + 3, h: 3, kind: 'wall' }; col.add(w);
  const q = near[4]; q.x = spot.x; q.z = spot.z; q.vx = 0; q.vz = 0; C.hitPed(q, 1, 0, 1.6); // shot from the west: falls backwards, east, towards the wall
  for (let i = 0; i < 60; i++) { ctx.simTime += 0.05; C.update(0.05, spot, { x: 0, z: 1 }, ctx); }
  const bx = -Math.sin(q.yaw), bz = -Math.cos(q.yaw); let inWall = 0; for (const s2 of [0.4, 0.8, 1.2, 1.6, 1.75]) { const x = q.x + bx * s2, z = q.z + bz * s2; if (x > w.x0 - 0.1 && x < w.x1 + 0.1 && z > w.z0 && z < w.z1) inWall++; }
  ok(q.state === 'down' && inWall === 0, `a body falling towards a wall is turned / slid clear of it (${inWall} of 5 body points inside the wall)`);
  // kill() from any caller (debug console, scripts) on someone walking: the body goes down and stays down — never a 'dead' walker
  const k = near[5]; k.state = 'walk'; C.kill(k); const kx = k.x, kz = k.z; for (let i = 0; i < 200; i++) { ctx.simTime += 0.05; C.update(0.05, spot, { x: 0, z: 1 }, ctx); }
  ok(k.dead && k.state === 'down' && Math.hypot(k.x - kx, k.z - kz) < 1.5, `kill() on a walking person puts the body down for good (state ${k.state}, moved ${Math.hypot(k.x - kx, k.z - kz).toFixed(2)} m)`);
  // a body lying still next to a wall, nudged by a slow car towards it: never pushed into the wall
  const q2 = near[4]; const wx = q2.x + 0.5; const w2 = { x0: wx, x1: wx + 3, z0: q2.z - 3, z1: q2.z + 3, h: 4, kind: 'building' }; col.add(w2); q2.vx = 0; q2.vz = 0;
  const car = { x: q2.x - 1.5, z: q2.z, speed: 0.4, yaw: 0, T: { len: 4 }, radius: 1, half: 2, circles: () => [[car.x, car.z]], pushOut: (px, pz) => ({ x: wx + 0.4, z: pz }) };
  const vs0 = C.vehicles; C.vehicles = [car]; for (let i = 0; i < 3; i++) { ctx.simTime += 0.05; C.vehicles = [car]; C.update(0.05, spot, { x: 0, z: 1 }, { ...ctx, vehicles: [car] }); } car.pushOut = () => null;
  for (let i = 0; i < 20; i++) { ctx.simTime += 0.05; C.update(0.05, spot, { x: 0, z: 1 }, ctx); } C.vehicles = vs0;
  ok(q2.state === 'down' && !col.blocked(q2.x, q2.z, 0.1), `a body nudged by a car towards a wall is not pushed into it (feet at x ${(q2.x - wx).toFixed(2)} m from the wall face)`);
  col.remove((c) => c === w2);
  // the kerb rule (calm walkers are kept off the road) never snaps someone back inside a wall
  const r = near[6]; let road = null; // a kerb running north-south: pavement to the west, road to the east, nothing else around
  for (let a = 0; a < 3000 && !road; a++) { const t = a * 0.61, d = 3 + a * 0.05; const x0 = r.x + Math.cos(t) * d, z = r.z + Math.sin(t) * d; if (L.roadAt(x0, z) || col.blocked(x0 - 3, z, 2.2)) continue; let xk = null; for (let x = x0; x < x0 + 2; x += 0.02) if (L.roadAt(x, z)) { xk = x; break; }
    if (xk !== null && L.roadAt(xk + 0.6, z) && L.roadAt(xk, z + 1.5) && L.roadAt(xk, z - 1.5) && !L.roadAt(xk - 0.1, z + 1.5) && !L.roadAt(xk - 0.1, z - 1.5) && !col.blocked(xk + 0.5, z, 0.4)) road = { x: xk, z }; }
  if (road) { const wb = { x0: road.x - 4, x1: road.x - 0.05, z0: road.z - 2, z1: road.z + 2, h: 6, kind: 'building' }; col.add(wb); r.state = 'walk'; r.dead = false; r.via = null; r.x = wb.x1 - 0.1; r.z = road.z; r.target = { x: wb.x1 - 0.1, z: road.z + 6 }; r.vx = 0; r.vz = 0;
    for (let i = 0; i < 30; i++) { ctx.simTime += 0.05; C.update(0.05, spot, { x: 0, z: 1 }, ctx); }
    ok(!col.blocked(r.x, r.z, 0.12), `someone pushed out of a kerbside shopfront onto the road is not snapped back into the wall (${(r.x - wb.x1).toFixed(2)} m from the face, state ${r.state})`); col.remove((c) => c === wb); }
  else ok(false, 'found a kerb spot for the kerb/wall test');
  // someone fleeing gunfire towards Beira Lake / the sea stops at the edge and turns along the shore (never into the water)
  let shore = null; for (let x = -560; x < 900 && !shore; x += 3) for (let z = -1300; z < 1400 && !shore; z += 3) if (L.isWater(x + 2.5, z) && !L.isWater(x, z) && !L.isWater(x - 3, z) && !L.isWater(x, z + 4) && !L.isWater(x, z - 4) && !col.blocked(x - 1, z, 1.2) && !col.blocked(x, z + 3, 0.5) && !col.blocked(x, z - 3, 0.5) && !L.roadAt(x, z)) shore = { x, z };
  if (shore) { const f = near[7]; Object.assign(f, { x: shore.x - 0.5, z: shore.z, vx: 0, vz: 0, dead: false }); C.react(f, 'flee', 4, { fleeDir: [1, 0], fleeSp: 4 }, true); let wet = 0, path = 0, px = f.x, pz = f.z;
    for (let i = 0; i < 60; i++) { ctx.simTime += 0.05; C.update(0.05, f, { x: 0, z: 1 }, ctx); if (L.isWater(f.x, f.z) && !col.walkableWater(f.x, f.z, 0.15)) wet++; path += Math.hypot(f.x - px, f.z - pz); px = f.x; pz = f.z; }
    ok(wet === 0 && path > 3, `fleeing towards the water, a person stops at the edge and runs along the shore (${wet} frames in the water, ran ${path.toFixed(1)} m, at ${shore.x}, ${shore.z})`); }
  else ok(false, 'found a shore spot for the water test');
  col.remove((c) => c === w); C.clear(); }
// ---------------------------------------------------------------- 5b. terrace rows: pushed out through the street face, never across a seam
{ const x = S.x, z = S.z; addBox(x - 6, x, z - 5, z + 5, 9, 'building'); addBox(x, x + 6, z - 5, z + 5, 9, 'building'); addBox(x + 6, x + 12, z - 5, z + 5, 9, 'building'); // three shops wall to wall, 10 m deep
  let px = x - 0.25, pz = z + 4.0; for (let i = 0; i < 10; i++) { const r = col.resolveCircle(px, pz, 0.28, 0.15, 0.3); px = r.x; pz = r.z; }
  ok(!col.blocked(px, pz, 0.12) && pz > z + 5, `someone inside a terrace row next to the shared wall is pushed out through the street face (${(pz - z - 5).toFixed(2)} m outside), not back and forth across the seam`);
  clearAdded(); }

// ---------------------------------------------------------------- 6. parked bay stays empty after the player takes its car
{ const T2 = new Traffic(new THREE.Scene(), col, { emit() {}, on() {} }); T2.max = 0; const sp = CP.plan.parking[Math.floor(CP.plan.parking.length / 3)]; const focus = { x: sp.x, z: sp.z };
  for (let i = 0; i < 3; i++) T2.updateParked(1.1, focus);
  const v = T2.parked.find((c) => c.spot === sp); ok(!!v, 'a parked car in the bay next to the player');
  T2.takeOver(v); v.x += Math.sin(v.yaw) * 6; v.z += Math.cos(v.yaw) * 6; // drove it 6 m out of the bay
  for (let i = 0; i < 30; i++) T2.updateParked(1.1, focus);
  ok(!T2.parked.some((c) => c.spot === sp), 'no new car appears in the bay behind the player (30 s later)');
  const far = { x: sp.x + 400, z: sp.z }; for (let i = 0; i < 100; i++) T2.updateParked(1.1, far);
  ok(!(T2.vacated && T2.vacated.has(sp)), 'the bay is freed for a new car only after the player has been far away for a while'); }

console.log('nav', JSON.stringify(police.nav.stats)); 
// ---------------------------------------------------------------- 7. fist fights: who squares up, footwork, punches landing, quitting
{ const C = new Crowd(new THREE.Scene(), col, { emit() {}, on() {} }); C.prepareSpecs(40); C.max = 50;
  const spot = { x: -128, z: -880 }; const P = { x: spot.x + 400, z: spot.z, y: 0, vehicle: null, ch: null, yaw: 0, speed: 0, indoor: false, dead: false };
  const ctx = { simTime: 0, vehicles: [], player: P, bodies: [], hourFactor: 1, hour: 10, armed: false };
  for (let i = 0; i < 80; i++) { ctx.simTime += 0.1; C.update(0.1, spot, { x: 0, z: 1 }, ctx); }
  const men = C.peds.filter((p) => p.sp.sex === 'm' && p.sp.band !== 'senior' && p.sp.age !== 'elder'), women = C.peds.filter((p) => p.sp.sex === 'f'), seniors = C.peds.filter((p) => p.sp.band === 'senior');
  ok(men.length >= 3, `men in the crowd (${men.length}), women ${women.length}, seniors ${seniors.length}`);
  ok(women.concat(seniors).every((p) => !C.willFight(p)), 'women and seniors never square up');
  let chance = 0; const m0 = men[0]; for (let k = 0; k < 400; k++) if (C.willFight(m0)) chance++; ok(chance > 40 && chance < 340, `a man squares up sometimes, not always (${(chance / 4).toFixed(0)} %)`);
  // a fighter: punched → fight state; he faces the player, keeps punching range, throws combinations that land
  const f = men[0]; f.fighter = true; f.fightLost = false; const place = () => { P.x = f.x - 1.0; P.z = f.z; P.yaw = Math.PI / 2; };
  place(); let strikes = 0; const moves = new Set(); C.onStrike = (p, m) => { if (p === f) { strikes++; moves.add(m); } };
  C.punched(f, P, 'jab'); ok(f.state === 'fight', `punched fighter squares up (state ${f.state})`);
  let face = 1, dmin = 9, dmax = 0, wmax = 0, nanBones = 0;
  for (let i = 0; i < 200; i++) { ctx.simTime += 0.05; C.update(0.05, spot, { x: 0, z: 1 }, ctx); const d = Math.hypot(f.x - P.x, f.z - P.z); if (i > 40) { dmin = Math.min(dmin, d); dmax = Math.max(dmax, d); face = Math.min(face, Math.cos(Math.atan2(P.x - f.x, P.z - f.z) - f.yaw)); }
    f.ch.anim.update(0.05, 0); wmax = Math.max(wmax, f.ch.anim.fight.w); for (const b of Object.values(f.ch.bones)) if (b && !Number.isFinite(b.rotation.x + b.rotation.y + b.rotation.z)) nanBones++; }
  ok(f.state === 'fight' && wmax > 0.95, `still fighting after 10 s, in stance (w ${wmax.toFixed(2)})`);
  ok(strikes >= 3 && moves.size >= 2, `his punches land on the player (${strikes} hits, techniques: ${[...moves].join(', ')})`);
  ok(dmin > 0.6 && dmax < 1.7, `keeps punching range (${dmin.toFixed(2)}–${dmax.toFixed(2)} m)`);
  ok(face > 0.8, `keeps facing the player while circling (min cos ${face.toFixed(2)})`); ok(nanBones === 0, 'no invalid bone rotations');
  // beaten: enough hard shots → he gives up and runs (or goes down), never keeps fighting
  for (const m of ['cross', 'hook', 'cross', 'upper']) { C.punched(f, P, m); f.fblock = 0; }
  for (let i = 0; i < 10; i++) { ctx.simTime += 0.05; C.update(0.05, spot, { x: 0, z: 1 }, ctx); }
  ok(f.state === 'flee' || f.state === 'down', `a beaten fighter gives up (state ${f.state}, ko ${f.ko.toFixed(0)})`);
  // a drawn gun ends it; walking away ends it
  const g2 = men[1]; g2.fighter = true; P.x = g2.x - 1; P.z = g2.z; C.punched(g2, P, 'jab'); ctx.armed = true; for (let i = 0; i < 6; i++) { ctx.simTime += 0.05; C.update(0.05, spot, { x: 0, z: 1 }, ctx); }
  ok(g2.state === 'flee', `a fighter runs when the player pulls a gun (state ${g2.state})`); ctx.armed = false;
  const g3 = men[2]; g3.fighter = true; P.x = g3.x - 1; P.z = g3.z; C.punched(g3, P, 'jab'); P.x += 40; for (let i = 0; i < 80; i++) { ctx.simTime += 0.05; C.update(0.05, spot, { x: 0, z: 1 }, ctx); }
  ok(g3.state !== 'fight', `the fight ends when the player walks off (state ${g3.state})`);
  // a non-fighter: reaction + stumble, no fight
  if (women[0]) { const wq = women[0]; P.x = wq.x - 1; P.z = wq.z; C.punched(wq, P, 'cross'); ok(wq.state === 'stumble' && wq.ch.anim.fight.react === 'snap', `a woman punched staggers back (state ${wq.state}, reaction ${wq.ch.anim.fight.react})`); }
  C.clear();
  // the animation itself: the punch extends ~arm's length forward at impact, the guard holds the hands at chin height
  const { Character, HEROES } = await import('../src/actors/Character.js'); const { MOVES } = await import('../src/actors/Boxing.js');
  const ch = new Character(HEROES.dineth); ch.anim.fightOn(true); for (let i = 0; i < 40; i++) ch.anim.update(1 / 30, 0); ch.root.updateMatrixWorld(true);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3()); const gL = wp(ch.bones.handL), gR = wp(ch.bones.handR);
  ok(gL.y > 1.25 && gL.y < 1.55 && gR.y > 1.25 && gR.y < 1.55 && gL.z > 0.15 && gR.z > 0.1, `guard: both hands up in front at chin height (L ${gL.toArray().map((v) => v.toFixed(2))}, R ${gR.toArray().map((v) => v.toFixed(2))})`);
  const reach = {}; for (const m of ['jab', 'cross', 'hook', 'upper']) { ch.anim.strike(m); let t = 0; while (t < MOVES[m].hit - 1e-6) { ch.anim.update(1 / 120, 0); t += 1 / 120; } ch.root.updateMatrixWorld(true); const h = wp(ch.bones['hand' + MOVES[m].side]); reach[m] = h; for (let i = 0; i < 80; i++) ch.anim.update(1 / 60, 0); }
  ok(reach.jab.z > 0.5 && reach.cross.z > 0.55, `straight punches extend forward (jab ${reach.jab.z.toFixed(2)} m, cross ${reach.cross.z.toFixed(2)} m)`);
  ok(reach.hook.x < 0.12 && reach.hook.z > 0.3 && reach.hook.y > 1.35, `the lead hook comes across at head height (x ${reach.hook.x.toFixed(2)}, y ${reach.hook.y.toFixed(2)}, z ${reach.hook.z.toFixed(2)})`);
  ok(reach.upper.y > 1.3 && reach.upper.z > 0.4, `the uppercut finishes up at chin height (y ${reach.upper.y.toFixed(2)}, z ${reach.upper.z.toFixed(2)})`);
  ch.dispose && ch.dispose(); }

console.log(`glitch: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
