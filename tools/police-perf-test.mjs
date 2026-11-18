// 66th — police AI performance acceptance test (Node, headless) on the real city plan, collision, Traffic lane follower,
// Vehicles, Characters and PoliceResponse:
//  1. think throttle: per-agent timers at THINK (0.25 s) with spread phases; decisions get the real elapsed time
//  2. sight queue: pickStalest takes the stalest lookers, never more than SIGHT.perFrame, never fresher than minAge
//  3. pool: built once (10 cars + 2 officers each + spares) off the scene; a unit comes out of it with its seated, armed
//     crew; removing it puts car + crew back (reset: no per-chase state left, out of the scene / traffic / LIVE lists);
//     a dead officer is replaced from the spares; an empty pool makes a request wait instead of building a car
//  4. a 60 s simulated 5★ car chase (police.update + Traffic.update every frame): no Vehicle / Character is created or
//     disposed while it runs, ≤ 2 sight checks per frame, every unit decides ≈ 4×/s and route re-plans stay at that rate
//  5. recycling: a unit 230 m behind the suspect and out of view is moved (same car, same crew) onto the suspect's road
//     180–300 m ahead, out of view, on the lane toward them; a unit in view / close is left alone
//  6. colliders: police cars collide as a chain of circles over their box and block sight / bullets-from-police as an
//     oriented box (no mesh colliders)
//   NO_REAL_CARS=1 node tools/police-perf-test.mjs        (V=1: every check)
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Collision } = await import('../src/world/Collision.js');
const { Traffic, linePiece, segNodes } = await import('../src/vehicles/Traffic.js'); const { Vehicle, LIVE_VEHICLES } = await import('../src/vehicles/Vehicle.js');
const PRM = await import('../src/police/PoliceResponse.js'); const { PoliceResponse, nearestRoad, RECYCLE } = PRM;
const { POOL } = await import('../src/police/UnitPool.js'); const { THINK, SIGHT, thinkTick, phase, pickStalest } = await import('../src/police/AIThrottle.js');
const { aheadSpot, behindBy } = await import('../src/police/Pursuit.js'); const { segBoxT, vehicleBlocks } = await import('../src/police/Firefight.js');
const { Character } = await import('../src/actors/Character.js'); const { makePoliceAppearance } = await import('../src/actors/Appearance.js');
const { LIVE } = await import('../src/actors/Bodies.js'); const { Health } = await import('../src/actors/Health.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };

// ---------------------------------------------------------------- 1. think timers
{ const agents = Array.from({ length: 8 }, (_, i) => ({ id: i + 1 })); const dt = 1 / 60; let maxSame = 0, total = 0; const n = 600; const acc = agents.map(() => 0);
  for (let f = 0; f < n; f++) { let same = 0; agents.forEach((a, i) => { const t = thinkTick(a, dt, THINK.unit); if (t) { same++; total++; acc[i] += t; } }); maxSame = Math.max(maxSame, same); }
  const perSec = total / agents.length / (n * dt);
  ok(Math.abs(perSec - 1 / THINK.unit) < 0.3, `each agent decides ${perSec.toFixed(2)}×/s (THINK ${THINK.unit} s → ${(1 / THINK.unit).toFixed(0)}×/s), not 60×/s`);
  ok(maxSame <= 2, `phases spread: at most ${maxSame} of 8 agents decide on the same frame (60 fps)`);
  ok(acc.every((t) => Math.abs(t - n * dt) < THINK.unit + 1e-6), `the dt handed to each decision adds up to real time (${acc[0].toFixed(2)} of ${(n * dt).toFixed(2)} s)`);
  const ph = agents.map((a) => phase(a.id, 1)); ok(new Set(ph.map((p) => Math.floor(p * 8))).size >= 6, 'golden-ratio phases cover the period'); }
// ---------------------------------------------------------------- 2. sight queue picking
{ const L0 = Array.from({ length: 10 }, (_, i) => ({ lookAt: i * 0.01 })); const out = [];
  pickStalest(L0, 1, 2, 0.1, out); ok(out.length === 2 && out[0] === L0[0] && out[1] === L0[1], 'the two stalest lookers are checked first');
  for (const x of L0) x.lookAt = 0.95; pickStalest(L0, 1, 2, 0.1, out); ok(out.length === 0, 'nobody is re-checked sooner than SIGHT.minAge');
  L0[7].lookAt = undefined; pickStalest(L0, 1, 2, 0.1, out); ok(out[0] === L0[7] && out.length === 1, 'a new looker (never checked) goes first');
  ok(SIGHT.perFrame === 2 && SIGHT.minAge <= 0.15, `budget ${SIGHT.perFrame} lookers per frame, refresh ≥ ${SIGHT.minAge} s`); }

// ---------------------------------------------------------------- world + game stub (as police-combat-test)
const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene(); const T = new Traffic(scene, col, { emit() {}, on() {} }); T.max = 0;
const playerCh = new Character(makePoliceAppearance(91, 'patrol')); scene.add(playerCh.root);
const player = { x: 0, z: 0, y: 0, yaw: 0, vehicle: null, speed: 0, crouching: false, control: true, ch: playerCh, stamina: 1, events: { on() {} }, camOverride: false,
  teleport(x, z, yaw = 0) { this.x = x; this.z = z; this.yaw = yaw; this.y = col.groundAt(x, z, 0.5); this.ch.root.position.set(x, this.y, z); }, snapCamera() {} };
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
const g = { scene, traffic: T, collision: col, camera, player, mode: 'play', clock: 0, timeSlow: 1, indoor: false, crowd: { peds: [], alarm() {} }, director: { active: false },
  hud: { notify() {}, subtitle() {}, show() {}, hurt() {}, fade: async () => {}, root: { classList: { contains: () => false } } },
  story: { state: { money: 60000, health: 100 }, pay() {}, safeSpot: (x, z) => [x, z], running: false, conds: [], fail() { return new Error('x'); } },
  atmos: { night: 0, hour: 14, day: 1, w: { rain: 0 }, advance() {} }, squad: { activeMember: { def: { full: 'Dineth Perera' } } }, weapons: null, events: { emit() {}, on() {} } };
g.health = new Health(g);
const police = new PoliceResponse(g); g.police = police; police.patrolCd = 1e9; const pool = police.pool;
// the suspect's car: driven by the lane follower on a long road (a script, not the player's controls)
const longSeg = T.drivableSegs.filter((s) => s.level <= 1).sort((p, q) => Math.hypot(q.x1 - q.x0, q.z1 - q.z0) - Math.hypot(p.x1 - p.x0, p.z1 - p.z0))[0];
const pv = new Vehicle('sedan', 5, scene);
function startSuspect(seg, s0 = 10, v0 = 20) { const [a, b] = segNodes(seg); const piece = linePiece(seg, a, b, 1); pv.place(piece.p0[0] + piece.d[0] * s0, piece.p0[1] + piece.d[1] * s0, Math.atan2(piece.d[0], piece.d[1]));
  pv.ai = { pieces: [piece], s: s0, v0, stuck: 0, honkCd: 99, bumped: 0, aggressive: 1.4 }; pv.speed = v0; T.extend(pv); if (!T.vehicles.includes(pv)) T.vehicles.push(pv); player.vehicle = pv; followCam(); }
function followCam() { player.x = pv.x; player.z = pv.z; player.y = pv.y; player.yaw = pv.yaw; const fx = Math.sin(pv.yaw), fz = Math.cos(pv.yaw);
  camera.position.set(pv.x - fx * 7, (pv.y || 0) + 2.6, pv.z - fz * 7); camera.lookAt(pv.x + fx * 10, (pv.y || 0) + 1.2, pv.z + fz * 10); camera.updateMatrixWorld(); }

// ---------------------------------------------------------------- 3. the pool
const vBuilt0 = LIVE_VEHICLES.size;
await pool.prepare();
const nCars = POOL.police + POOL.policejeep;
ok(pool.stats.built === nCars && pool.freeCount() === nCars, `pool built at load: ${pool.stats.built} cars (${POOL.police} sedans + ${POOL.policejeep} jeeps, 5–10 asked)`);
ok(pool.spare.length === POOL.spare && pool.stats.crewBuilt === nCars * 2 + POOL.spare, `${nCars * 2} seated officers + ${POOL.spare} spares built (${pool.stats.crewBuilt} characters)`);
{ const all = [...pool.free.police, ...pool.free.policejeep]; ok(all.every((e) => !e.v.mesh.parent && !LIVE_VEHICLES.has(e.v)) && LIVE_VEHICLES.size === vBuilt0, 'pooled cars are off the scene graph and out of the live-vehicle list (not drawn, not simulated)');
  ok(all.every((e) => e.crew.every((r) => r && r.ch.root.parent === e.v.mesh && r.rifle)), 'every pooled car has its two officers already seated, each with his slung T-56');
  ok(all.every((e) => !T.vehicles.includes(e.v) && !T.parked.includes(e.v)), 'pooled cars are in no traffic list'); }
startSuspect(longSeg);
const knownV = new Set([...LIVE_VEHICLES, ...pool.free.police.map((e) => e.v), ...pool.free.policejeep.map((e) => e.v)]);
{ // acquire → unit; release → back, reset
  const u = police.spawnUnit({ at: { x: pv.x + 40, z: pv.z + 40, yaw: 0 } }); ok(!!u && u.pooled && knownV.has(u.v), 'a placed unit (roadblock / test) comes out of the pool');
  ok(u && u.officers.length === 2 && u.officers.every((o) => o.mode === 'seated' && o.rifle && o.ch.root.parent === u.v.mesh), 'with its crew seated and armed');
  ok(u && u.v.mesh.parent === scene && LIVE_VEHICLES.has(u.v) && T.vehicles.includes(u.v), 'and is placed in the world (scene, live list, traffic)');
  const v = u.v, crew = u.officers.map((o) => o.ch); v.damage = 0.6; v.health = 41; v.flat = true; v.ai.chase = { role: 'pit' }; v.beacons(true, 0.1); v.mesh.userData.doors?.[0] && (v.mesh.userData.doors[0].ang = 0.8);
  police.removeUnit(u);
  ok(pool.freeCount() === nCars && !v.mesh.parent && !LIVE_VEHICLES.has(v) && !T.vehicles.includes(v), 'removed: the car goes back to the pool (off the scene, out of every list)');
  ok(v.damage === 0 && v.health === 100 && !v.flat && !v.ai && !v.beaconsOn && !v.police && (!v.mesh.userData.doors?.[0] || v.mesh.userData.doors[0].ang === 0), 'reset: damage / flat / AI / chase / beacons / police link / open door all cleared');
  ok(crew.every((ch) => !ch.disposed && ch.root.parent === v.mesh), 'its officers were not disposed: they stay seated in the pooled car'); }
{ // a dead officer is replaced from the spares
  const u = police.spawnUnit({ at: { x: pv.x + 40, z: pv.z + 40, yaw: 0 } }); const o = u.officers[1]; o.mode = 'foot'; police.syncSeated(u); o.ch.root.parent.remove(o.ch.root); scene.add(o.ch.root);
  police.killOfficer(o); const sp0 = pool.spare.length; police.removeUnit(u); const e = u.v ? null : [...pool.free.police, ...pool.free.policejeep].find((q) => q.crew.some((r) => r === null));
  ok(!!e, 'a car whose officer died goes back with one seat empty'); const u2 = police.spawnUnit({ at: { x: pv.x + 40, z: pv.z + 40, yaw: 0 } });
  ok(u2 && u2.officers.length === 2 && pool.spare.length === sp0 - 1 && pool.stats.crewFromSpare >= 1, `the next unit out takes a spare officer for the empty seat (spares ${sp0} → ${pool.spare.length})`);
  // an officer on foot when the unit is removed goes to the spares, not the bin
  const f = u2.officers[0]; f.mode = 'foot'; police.syncSeated(u2); f.ch.root.parent.remove(f.ch.root); scene.add(f.ch.root); const spB = pool.spare.length; const v2 = u2.v; police.removeUnit(u2);
  ok(!f.ch.disposed && pool.spare.length === spB && f.ch.root.parent === v2.mesh && !v2.mesh.parent, 'an officer still on foot when his unit is removed goes back into his seat in the pooled car (not disposed)');
  police.bodies.forEach((b) => b.ch && b.ch.root.parent?.remove(b.ch.root)); }
{ // empty pool → wait, no build
  const [ra, rb] = segNodes(longSeg); const rp = linePiece(longSeg, ra, rb, 1); const out = [];
  for (let i = 0; i < nCars + 2; i++) { const s = 15 + i * 14; const u = police.spawnUnit({ at: { x: rp.p0[0] + rp.d[0] * s, z: rp.p0[1] + rp.d[1] * s, yaw: pv.yaw } }); if (u) out.push(u); }
  ok(out.length === nCars && police.stats.poolWaits >= 1, `pool dry after ${out.length} units: the next request waits (${police.stats.poolWaits} waits) instead of building a car`);
  ok([...LIVE_VEHICLES].every((v) => knownV.has(v)), 'no vehicle was built for it'); for (const u of out) police.removeUnit(u); ok(pool.freeCount() === nCars, 'all back'); }

// ---------------------------------------------------------------- 4. a 60 s 5★ car chase
const DT = 1 / 30;
{ let counting = false, vDisp = 0, cDisp = 0; const vd = Vehicle.prototype.dispose, cd = Character.prototype.dispose;
  // (police only: the parked civilian cars Traffic lays out round the moving suspect come and go as always)
  const policeCh = new Set(); const isPoliceV = (v) => !!(v.T && v.T.police); for (const e of [...pool.free.police, ...pool.free.policejeep]) for (const r of e.crew) if (r) policeCh.add(r.ch); for (const r of pool.spare) policeCh.add(r.ch);
  Vehicle.prototype.dispose = function (...a) { if (counting && isPoliceV(this)) vDisp++; return vd.apply(this, a); }; Character.prototype.dispose = function (...a) { if (counting && !this.disposed && (policeCh.has(this) || this.spec?.police || this.policeLook)) cDisp++; return cd.apply(this, a); };
  const knownC = new Set(LIVE); for (const e of [...pool.free.police, ...pool.free.policejeep]) for (const r of e.crew) if (r) knownC.add(r.ch); for (const r of pool.spare) knownC.add(r.ch);
  startSuspect(longSeg, 10, 18); police.level = 5; police.state = 'pursuing'; police.incident = { x: pv.x, z: pv.z, t: 0 }; police.spotted();
  let arrests = 0; police.arrest = async () => { arrests++; }; // (an arrest would end the chase: counted, the chase goes on — as in police-combat-test)
  counting = true; let newV = 0, newC = 0, maxSight = 0, sightN = 0, frames = 0, maxThinkF = 0, unitSec = 0, plans0 = police.planN || 0; const t0 = police.stats.thinks;
  for (let f = 0; f < 60 / DT; f++) {
    if (pv.ai && (pv.ai.pieces.length < 2 || pv.speed < 1) && f % 30 === 0) { /* keep the suspect moving along the network */ pv.ai.stopped = false; pv.ai.v0 = 18; }
    T.update(DT, { x: pv.x, z: pv.z }, new THREE.Vector3(Math.sin(pv.yaw), 0, Math.cos(pv.yaw)), f * DT, [], player); followCam();
    const th0 = police.stats.thinks; const live = !police.busy && !police.cine && !g.director.active; const nU = police.units.length; police.update(DT); g.clock += DT; frames++;
    maxThinkF = Math.max(maxThinkF, police.stats.thinks - th0); if (live && !police.busy && !police.cine) unitSec += nU * DT; // (units are not updated at all during an arrest / BUSTED sequence)
    const s = police.stats.sight.last || 0; maxSight = Math.max(maxSight, s); sightN += s; police.seenT = Math.min(police.seenT, 0.2); // (eyes on the suspect: the chase goes on)
    for (const v of LIVE_VEHICLES) if (!knownV.has(v)) { if (isPoliceV(v)) newV++; knownV.add(v); if (process.env.DBG) console.log('NEW', v.type, v.id, v.police ? 'police' : '', v.pooled, police.log.slice(-3).join(' | ')); } for (const ch of LIVE) if (!knownC.has(ch)) { newC++; knownC.add(ch); } // (no civilian is created here either: T.max = 0, no crowd)
  }
  counting = false; delete police.arrest; Vehicle.prototype.dispose = vd; Character.prototype.dispose = cd;
  const thinkRate = (police.stats.thinks - t0) / Math.max(1e-6, unitSec), planRate = ((police.planN || 0) - plans0) / Math.max(1e-6, unitSec);
  ok(police.stats.maxUnits >= 6, `the chase drew a full 5★ response (${police.stats.maxUnits} units at once, ${pool.stats.acquired} taken from the pool)`);
  ok(newV === 0 && newC === 0, `no police Vehicle / Character created during the chase (police vehicles ${newV}, characters ${newC})`);
  ok(vDisp === 0 && cDisp === 0, `no police car / officer disposed during the chase (vehicles ${vDisp}, officers ${cDisp})`);
  ok(maxSight <= SIGHT.perFrame && police.stats.sight.maxPerFrame <= SIGHT.perFrame, `≤ ${SIGHT.perFrame} line-of-sight checks per frame (max ${maxSight}, mean ${(sightN / frames).toFixed(2)})`);
  ok(police.stats.sight.forced === 0, 'no unscheduled (forced) sight check in play');
  ok(thinkRate > 3 && thinkRate < 4.6, `units decide ${thinkRate.toFixed(2)}× per unit-second (≈ 4: every ${THINK.unit} s, was every frame = 30–60×)`);
  ok(planRate <= 1 / THINK.unit + 0.01, `route re-plans ${planRate.toFixed(2)}× per unit-second (≤ ${(1 / THINK.unit).toFixed(0)})`);
  ok(maxThinkF <= 3, `at most ${maxThinkF} units decide on the same frame (30 fps, ${police.units.length} units)`);
  if (process.env.V) console.log('    chase:', JSON.stringify({ arrests, units: police.units.length, recycledAhead: police.stats.recycledAhead, intercepts: police.stats.intercepts, pool: pool.stats }));
  police.units.slice().forEach((u) => police.removeUnit(u)); police.level = 0; police.state = 'patrol';
  // after it: kill two officers' worth of seats, then calm → the pool refills (spares for every empty seat) and builds nothing while wanted
  ok(pool.stats.builtWanted === 0, `nothing was built while wanted (${pool.stats.builtWanted})`);
  const free = [...pool.free.police, ...pool.free.policejeep]; free[0].crew[0]?.ch.dispose(); free[0].crew[0] = null; free[1].crew[1]?.ch.dispose(); free[1].crew[1] = null; const sp0 = pool.spare.length; pool.spare.length = 0;
  police.level = 2; for (let i = 0; i < 300; i++) pool.update(0.1); ok(pool.spare.length === 0, 'no refill while wanted');
  police.level = 0; for (let i = 0; i < 400; i++) pool.update(0.1);
  ok(pool.spare.length >= POOL.spare + 2 && pool.freeCount() === nCars, `calm: spares rebuilt for the 2 empty seats + ${POOL.spare} (${sp0} → 0 → ${pool.spare.length}), all ${nCars} cars in the pool`); }

// ---------------------------------------------------------------- 5. recycle ahead
{ startSuspect(longSeg, 260, 20); police.level = 4; police.state = 'pursuing'; police.seenT = 0; police.recycleT = -9;
  const [a, b] = segNodes(longSeg); const piece = linePiece(longSeg, a, b, 1); const back = 230; const s = Math.max(2, pv.ai.s - back);
  const x = piece.p0[0] + piece.d[0] * s, z = piece.p0[1] + piece.d[1] * s; const u = police.spawnUnit({ at: { x, z, yaw: pv.yaw } }); u.task = 'drive'; u.age = 10; u.v.ai.v0 = 20;
  const tg = police.target(); const h = pv.yaw; const d0 = Math.hypot(u.v.x - tg.x, u.v.z - tg.z), b0 = behindBy(u.v, tg, h); const v0 = u.v, crew0 = u.officers.map((o) => o.ch);
  ok(b0 > RECYCLE.behind && d0 > RECYCLE.dist && !police.inView(u.v), `setup: unit ${b0.toFixed(0)} m behind, ${d0.toFixed(0)} m away, behind the camera`);
  const r = police.recycleAhead(u, tg, d0); const ahead = -behindBy(u.v, tg, h); const dd = Math.hypot(u.v.x - tg.x, u.v.z - tg.z);
  ok(r && u.v === v0 && u.officers.every((o, i) => o.ch === crew0[i] && o.mode === 'seated'), 'recycled: the same car and crew (nothing built or disposed)');
  ok(ahead > 0 && dd >= RECYCLE.lo * 0.8 && dd <= RECYCLE.hi + 30, `respawned in front of the suspect on their road (${dd.toFixed(0)} m away, ${ahead.toFixed(0)} m ahead along their heading — the road may turn)`);
  { const nr = nearestRoad(T.drivableSegs, u.v.x, u.v.z); ok(nr.d < 8 * 8 || !!L.roadAt(u.v.x, u.v.z), `on the road network (${Math.sqrt(nr.d).toFixed(1)} m from a road centre line)`); }
  const fx = Math.sin(u.v.yaw), fz = Math.cos(u.v.yaw); const toS = [(tg.x - u.v.x) / dd, (tg.z - u.v.z) / dd];
  ok(fx * toS[0] + fz * toS[1] > 0.3, 'on the lane coming back toward the suspect');
  ok(police.hiddenAt(u.v.x, u.v.z), `out of the player’s sight (${police.inView(u.v) ? 'behind buildings' : 'outside the camera view'})`);
  ok(u.v.ai.pieces[0] && u.v.ai.chase === null && u.planT === 0, 'its route is re-planned from there (old chase state dropped)');
  // a unit in view, or close, stays
  police.recycleT = -9; const s2 = Math.min(piece.len - 2, pv.ai.s + 60); const u2 = police.spawnUnit({ at: { x: piece.p0[0] + piece.d[0] * s2, z: piece.p0[1] + piece.d[1] * s2, yaw: pv.yaw } }); u2.task = 'drive'; u2.age = 10;
  ok(!police.recycleAhead(u2, tg, Math.hypot(u2.v.x - tg.x, u2.v.z - tg.z)), 'a unit ahead / close is not recycled');
  police.recycleT = -9; u.age = 10; camera.position.set(tg.x + Math.sin(h) * 3, 3, tg.z + Math.cos(h) * 3); camera.lookAt(tg.x - Math.sin(h) * 50, 1.5, tg.z - Math.cos(h) * 50); camera.updateMatrixWorld();
  const ub = police.spawnUnit({ at: { x, z, yaw: pv.yaw } }); ub.task = 'drive'; ub.age = 10; const seenBack = police.inView(ub.v);
  ok(!seenBack || !police.recycleAhead(ub, tg, Math.hypot(ub.v.x - tg.x, ub.v.z - tg.z)), 'a unit far behind but in the camera’s view is not recycled (no pop)');
  // pure: aheadSpot follows the road the suspect is on
  const sp = aheadSpot({ segNodes, linePiece, drivable: T.drivable }, nearestRoad(T.drivableSegs, tg.x, tg.z), h, 180, 300, null);
  ok(sp && sp.dist >= 180 && sp.dist <= 300, `aheadSpot: a spot ${sp && sp.dist} m along the suspect’s road`);
  for (const q of police.units.slice()) police.removeUnit(q); police.level = 0; police.state = 'patrol'; }

// ---------------------------------------------------------------- 6. simple colliders
{ const e = pool.free.police[0]; const v = e.v; v.place(0, 0, 0); const c = v.circles();
  ok(c.length >= 2 && c.length <= 6 && v.radius > 0, `police car physics: a chain of ${c.length} circles (r ${v.radius.toFixed(2)} m) over its ${v.T.len.toFixed(1)} × ${v.T.wid.toFixed(1)} m box — no mesh collider`);
  ok(segBoxT(-5, 0, 5, 0, v) >= 0 && segBoxT(-5, 5, 5, 5, v) < 0, 'sight / police fire: the car blocks as an oriented box (segBoxT)');
  ok(!!vehicleBlocks([v], -6, 0.8, 0, 6, 0.8, 0) && !vehicleBlocks([v], -6, (v.T.hgt || 1.5) + 0.4, 0, 6, (v.T.hgt || 1.5) + 0.4, 0), 'box height: blocks at chest height, not over the roof'); }

console.log(`police-perf: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
