// Police combat test (Node, headless) on the real city plan, collision, traffic and PoliceResponse:
//  - sight: walls of any height ≥ 1 m and vehicle bodies block an officer's view (no detection through walls), the field of
//    view and the night range apply, a torch beam extends it; a crew in a car is blocked by the same walls
//  - chase: a pursuing officer who cannot see the suspect goes to the last point anyone saw them, not to the live position
//  - firefight: shot at below 4★ an officer runs to cover behind a stationary car and never fires; at 4★+ officers carry
//    the T-56, take cover with the car between them and the shooter, fire bursts, hide, reload — and hit the player
//  - tackle: a suspect running away within reach at 2★ is tackled → arrest ('tackle')
//  - killed by police: Health at 0 HP from police fire → arrest ('shot') → released at the National Hospital with full HP
//  - the BUSTED sequence runs to completion for all three kinds: camera moves, slow motion ends, nothing NaN, penalties applied
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Collision } = await import('../src/world/Collision.js');
const { Traffic } = await import('../src/vehicles/Traffic.js'); const { Vehicle } = await import('../src/vehicles/Vehicle.js');
const { PoliceResponse } = await import('../src/police/PoliceResponse.js');
const FF = await import('../src/police/Firefight.js'); const { segBoxT, vehicleBlocks, ARMED_FROM } = FF;
const { Character } = await import('../src/actors/Character.js'); const { makePoliceAppearance } = await import('../src/actors/Appearance.js');
const { Health, HOSPITAL } = await import('../src/actors/Health.js'); const { POLICE_T56 } = await import('../src/combat/WeaponDefs.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };

// ---------------------------------------------------------------- 1. pure helpers
{ const v = { x: 0, z: 0, yaw: 0, half: 2.2, T: { wid: 1.8, hgt: 1.5 }, y: 0, mesh: { visible: true } };
  const t = segBoxT(-5, 0, 5, 0, v); ok(t > 0.35 && t < 0.45, `segBoxT: a line across a car enters its side (t = ${t.toFixed(3)})`);
  ok(segBoxT(-5, 3, 5, 3, v) < 0, 'segBoxT: a line passing beside the car misses');
  const r = { ...v, yaw: Math.PI / 2 }; ok(segBoxT(-5, 0, 5, 0, r) > 0.25 && segBoxT(-5, 0, 5, 0, r) < 0.3, 'segBoxT: a car turned 90° presents its length');
  ok(!!vehicleBlocks([v], -6, 0.8, 0, 6, 0.8, 0) && !vehicleBlocks([v], -6, 1.7, 0, 6, 1.7, 0), 'vehicleBlocks: blocks at chest height of a crouched person, not over the roof');
  ok(!vehicleBlocks([v], -6, 0.8, 0, 6, 0.8, 0, v), 'vehicleBlocks: the officer’s own car can be skipped');
  ok(ARMED_FROM === 4 && POLICE_T56 && POLICE_T56.name.includes('T-56'), `police rifles from ${ARMED_FROM}★ (above 3 stars), weapon: ${POLICE_T56 && POLICE_T56.name}`); }

// ---------------------------------------------------------------- world + game stub
const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene(); const T = new Traffic(scene, col, { emit() {}, on() {} }); T.max = 0;
const playerCh = new Character(makePoliceAppearance(91, 'patrol')); scene.add(playerCh.root);
const player = { x: 0, z: 0, y: 0, yaw: 0, vehicle: null, speed: 0, crouching: false, control: true, ch: playerCh, stamina: 1, events: { on() {} }, camOverride: false,
  teleport(x, z, yaw = 0) { this.x = x; this.z = z; this.yaw = yaw; this.y = col.groundAt(x, z, 0.5); this.ch.root.position.set(x, this.y, z); this.ch.root.rotation.y = yaw; }, snapCamera() {} };
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
const notes = []; const pays = [];
const g = { scene, traffic: T, collision: col, camera, player, mode: 'play', clock: 0, timeSlow: 1, indoor: false, crowd: { peds: [], alarm() {} }, director: { active: false },
  hud: { notify: (t, b) => notes.push(t + ' — ' + b), subtitle() {}, show() {}, hurt() {}, fade: async () => {}, root: { classList: { contains: () => false } } },
  story: { state: { money: 60000, health: 100 }, pay(n, why) { this.state.money += n; pays.push([n, why]); }, safeSpot: (x, z) => [x, z], running: false, conds: [], fail() { return new Error('x'); } },
  atmos: { night: 0, hour: 14, day: 1, w: { rain: 0 }, advance() {} }, squad: { activeMember: { def: { full: 'Dineth Perera' } } }, weapons: null, events: { emit() {}, on() {} } };
g.health = new Health(g);
const police = new PoliceResponse(g); g.police = police; police.patrolCd = 1e9; const ff = police.ff;
const mkOfficer = (x, z, yaw, seed = 1, u = null) => { const ch = new Character(makePoliceAppearance(7000 + seed * 13, 'patrol')); scene.add(ch.root); const o = { ch, unit: u, mode: 'foot', x, z, y: col.groundAt(x, z, 0.5), yaw, t: 0, hits: 0, acc: 0 }; ff.arm(o); police.placeOfficer(o); return o; };
const put = (x, z) => { player.x = x; player.z = z; player.y = col.groundAt(x, z, 0.5); player.ch.root.position.set(x, player.y, z); };
const clearSpot = (x, z, r = 0.6) => !col.blocked(x, z, r) && !L.isWater(x, z);

// ---------------------------------------------------------------- 2. sight: walls, cars, field of view, night, torch
// a tall building block with open ground on two opposite sides
let wall = null; for (const c of CP.plan.colliders) { if (c.h < 6 || c.kind === 'landmark' || (c.x1 - c.x0) < 6 || (c.x1 - c.x0) > 26 || (c.z1 - c.z0) < 6) continue; const zc = (c.z0 + c.z1) / 2;
  const ax = c.x0 - 5, bx = c.x1 + 5; if (clearSpot(ax, zc) && clearSpot(bx, zc) && col.raycast(ax, 1.6, zc, bx, 1.4, zc, 0.05, false, 1.0) < 0.98) { wall = { c, ax, bx, zc }; break; } }
ok(!!wall, 'found a building with open ground on both sides for the sight test');
police.level = 3; police.state = 'pursuing';
if (wall) {
  const o = mkOfficer(wall.ax, wall.zc, Math.PI / 2, 2); put(wall.bx, wall.zc);
  ok(!ff.sees(o, 0), `an officer facing the suspect through a ${wall.c.h.toFixed(0)} m building does not see them (${(wall.bx - wall.ax).toFixed(0)} m apart)`);
  // walk the suspect out to open ground on the officer's side of the building
  let open = null; for (let k = 0; k < 40 && !open; k++) { const x = wall.ax - 6 - (k % 8) * 2, z = wall.zc + (k < 20 ? 1 : -1) * Math.floor(k / 8) * 3; if (clearSpot(x, z) && col.raycast(o.x, 1.6, o.z, x, 1.3, z, 0.05, false, 1.0) >= 0.99) open = [x, z]; }
  if (open) { put(open[0], open[1]); o.yaw = Math.atan2(open[0] - o.x, open[1] - o.z); ok(ff.sees(o, 0), 'the same officer sees the suspect in the open in front of him');
    o.yaw += Math.PI; const dB = Math.hypot(open[0] - o.x, open[1] - o.z); ok(dB <= 4 ? ff.sees(o, 0) : !ff.sees(o, 0), `facing away: ${dB > 4 ? 'no sight of a suspect behind him beyond 4 m (field of view)' : 'still notices a suspect within 4 m'}`); }
  else ok(false, 'open spot near the officer for the field-of-view test');
  // the camera-height leak of the old check: a 1.2 m wall (below the old 2.2 m cut-off) now blocks
  const lowWall = { x0: o.x - 3.3, x1: o.x - 3, z0: o.z - 4, z1: o.z + 4, h: (o.y || 0) + 1.25, kind: 'wall' }; col.add(lowWall); o.x = wall.ax; o.z = wall.zc;
  ok(clearSpot(o.x - 6, o.z, 0.3), 'open ground behind the low wall'); put(o.x - 6, o.z); player.crouching = true; o.yaw = -Math.PI / 2; ok(!ff.sees(o, 0), 'a crouched suspect behind a 1.25 m compound wall is not seen (the old check ignored walls under 2.2 m)');
  player.crouching = false; ok(ff.sees(o, 0), 'standing up behind the same low wall, the head shows over it → seen');
  col.remove((c) => c === lowWall);
  police.disarm?.(o); scene.remove(o.ch.root);
}
// open-ground spot for the remaining tests: Galle Face Green-like open area near the start test location
let S = null; for (const [x, z] of [[-128, -880], [-60, -300], [40, 120], [-200, 400], [0, 0]]) { let good = true; for (let dx = -14; dx <= 14 && good; dx += 2) for (let dz = -24; dz <= 24 && good; dz += 3) if (!clearSpot(x + dx, z + dz, 0.4)) good = false; if (good) { S = { x, z }; break; } }
if (!S) for (let k = 0; k < 4000 && !S; k++) { const x = -600 + (k % 60) * 20, z = -1200 + Math.floor(k / 60) * 40; let good = true; for (let dx = -14; dx <= 14 && good; dx += 2) for (let dz = -24; dz <= 24 && good; dz += 3) if (!clearSpot(x + dx, z + dz, 0.4)) good = false; if (good) S = { x, z }; }
ok(!!S, `found a 28 × 48 m open area for the firefight tests (${S && S.x}, ${S && S.z})`);
// night: range drops; inside a torch beam it is restored
{ const o = mkOfficer(S.x, S.z - 18, 0, 3); put(S.x, S.z + 18); police.level = 3;
  ok(ff.sees(o, 0), 'day: a suspect 36 m ahead in the open is seen');
  g.atmos.night = 1; o.torchOn = false; ok(!ff.sees(o, 0), 'night, no torch: the same suspect 36 m away is not seen');
  put(S.x, S.z + 6); o.torchOn = true; o.torchDir = new THREE.Vector3(0, -0.05, 1).normalize(); ok(ff.sees(o, 0), 'night: a suspect 24 m away inside the torch beam is seen');
  o.torchDir.set(1, 0, 0); o.torchOn = true; put(S.x, S.z + 13); ok(!ff.sees(o, 0), 'night: the same suspect at 31 m outside the beam is not seen');
  g.atmos.night = 0; o.torchOn = false; scene.remove(o.ch.root); }
// a parked car hides a crouched suspect, not a standing one
{ const car = new Vehicle('sedan', 7, scene); car.place(S.x, S.z, Math.PI / 2); car.parked = true; car.speed = 0; T.parked.push(car);
  const o = mkOfficer(S.x, S.z - 9, 0, 4); put(S.x, S.z + 2.2); player.crouching = true; ok(!ff.sees(o, 0), 'a suspect crouched behind a parked car is hidden by the car body');
  player.crouching = false; ok(ff.sees(o, 0), 'standing behind the car, the suspect is seen over the roof');
  // a crew in a car: blocked by the parked car too
  const pc = new Vehicle('police', 11, scene); pc.place(S.x, S.z - 9, 0); const u = { id: 99, v: pc, officers: [{ mode: 'seated' }], task: 'drive' };
  player.crouching = true; ok(!police.unitSees(u), 'a crew in a patrol car does not see a suspect crouched behind a parked car'); player.crouching = false; ok(police.unitSees(u), '…and does see him standing');
  T.parked.splice(T.parked.indexOf(car), 1); scene.remove(car.mesh); scene.remove(pc.mesh); scene.remove(o.ch.root); }

// ---------------------------------------------------------------- 3. chase without sight goes to the last-seen point
if (wall) {
  const pc = new Vehicle('police', 12, scene); pc.place(wall.ax - 8, wall.zc + 8, 0); const u = { id: 5, v: pc, officers: [], task: 'foot', footT: 0 };
  const o = mkOfficer(wall.ax - 1, wall.zc, -Math.PI / 2, 5, u); u.officers.push(o); police.units = [u]; police.foot = [o]; police.level = 2.5; police.state = 'pursuing';
  const ls = { x: wall.ax - 12, z: wall.zc - 4 }; police.lastSeen = { ...ls, t: police.t, h: 0 }; police.seenT = 5; put(wall.bx, wall.zc);
  const d0P = Math.hypot(player.x - o.x, player.z - o.z), d0L = Math.hypot(ls.x - o.x, ls.z - o.z);
  for (let i = 0; i < 60; i++) { police.t += 0.05; police.seenT += 0.05; police.updateOfficer(o, u, 0.05); }
  const dP = Math.hypot(player.x - o.x, player.z - o.z), dL = Math.hypot(ls.x - o.x, ls.z - o.z);
  ok(dL < d0L - 3 && dP > d0P, `unseen suspect behind a building: the officer heads for the last-seen point (${d0L.toFixed(1)}→${dL.toFixed(1)} m) and not to the live position (${d0P.toFixed(1)}→${dP.toFixed(1)} m)`);
  police.units = []; police.foot = []; scene.remove(o.ch.root); scene.remove(pc.mesh);
}

// ---------------------------------------------------------------- 4. firefight: cover below / at 4★
const firefight = (lv, n = 30, dt = 0.05) => {
  police.level = lv; police.state = 'pursuing'; ff.stats.shots = 0; ff.stats.hits = 0; ff.stats.covers = 0; ff.stats.reloads = 0;
  const car = new Vehicle('sedan', 21, scene); car.place(S.x + 3, S.z - 6, Math.PI / 2); car.parked = true; car.speed = 0; T.parked.push(car); // stationary civilian car
  const pc = new Vehicle('police', 22, scene); pc.place(S.x - 6, S.z - 14, 0); pc.speed = 0; T.vehicles.push(pc);
  const u = { id: 7, v: pc, officers: [], task: 'foot', footT: 0 }; pc.police = u;
  const a = mkOfficer(S.x + 1, S.z - 11, 0, 7, u), b = mkOfficer(S.x - 4, S.z - 11, 0, 8, u); u.officers.push(a, b); police.units = [u]; police.foot = [a, b];
  put(S.x, S.z + 14); player.yaw = Math.PI; g.story.state.health = 100; g.health.busy = false; let dmg = 0; const hp0 = () => g.story.state.health; let lastHp = hp0();
  police.arrest = async () => {}; // keep the fight going in this test
  ff.onPlayerShot(player.x, player.z, { x: a.x + 0.8, z: a.z + 0.5 }); police.spotted();
  const st = { cover: 0, hide: 0, peek: 0, fired: 0, rifleUp: 0, coverOK: 0, coverN: 0 }; let shotsAtHide = 0;
  for (let i = 0; i < n / dt; i++) { police.t += dt; g.clock += dt; if (i > 0 && i % 30 === 0 && i * dt < n * 0.6) ff.onPlayerShot(player.x, player.z, { x: a.x + 1.5, z: a.z + 1 }); // keeps shooting at them for a while police.seenT = ff.sees(a, dt) || ff.sees(b, dt) ? 0 : police.seenT + dt; if (police.seenT === 0) police.spotted();
    for (const o of [a, b]) { const s = ff.officer(o, u, dt); police.animOfficer(o, dt, s === null ? 0 : s); const cb = o.cb;
      if (cb && cb.st === 'cover') { st.cover++; if (cb.phase === 'hide') st.hide++; else st.peek++; st.coverN++; if (cb.cover && segBoxT(player.x, player.z, cb.cover.x, cb.cover.z, cb.cover.v) >= 0) st.coverOK++; }
      if (o.rp && o.rp.draw > 0.9) st.rifleUp++; }
    if (hp0() < lastHp) { dmg += lastHp - hp0(); } if (hp0() < 30) g.story.state.health = 100; lastHp = hp0(); shotsAtHide = ff.stats.shots; }
  const res = { ...st, shots: ff.stats.shots, hits: ff.stats.hits, covers: ff.stats.covers, reloads: ff.stats.reloads, dmg, a, b, steps: n / dt };
  police.units = []; police.foot = []; for (const o of [a, b]) { ff.disarm(o); scene.remove(o.ch.root); } T.parked.splice(T.parked.indexOf(car), 1); T.vehicles.splice(T.vehicles.indexOf(pc), 1); scene.remove(car.mesh); scene.remove(pc.mesh); delete police.arrest; void shotsAtHide;
  return res;
};
{ const r = firefight(3, 12); ok(r.covers >= 1 && r.cover > 20, `3★, shot at: officers run to cover behind a stationary car (${r.covers} cover moves, ${(r.cover * 0.05).toFixed(1)} officer-s in cover)`);
  ok(r.shots === 0 && r.rifleUp === 0, `3★: officers never draw or fire their rifles (${r.shots} shots)`);
  ok(r.coverN > 0 && r.coverOK / r.coverN > 0.9, `3★: the car is between the shooter and the officer in cover (${(100 * r.coverOK / Math.max(1, r.coverN)).toFixed(0)}% of the time)`); }
{ const r = firefight(4, 40); ok(r.rifleUp > 100, '4★: officers bring their T-56 rifles up');
  ok(r.shots >= 10 && r.covers >= 1, `4★: officers take cover and return fire (${r.shots} rounds, ${r.covers} cover moves)`);
  ok(r.hide > 40 && r.peek > 40, `4★: they alternate between hiding and rising to fire (${(r.hide * 0.05).toFixed(1)} s hidden / ${(r.peek * 0.05).toFixed(1)} s up)`);
  ok(r.hits >= 1 && r.dmg > 0 && r.hits < r.shots, `4★: some rounds hit the player (${r.hits}/${r.shots}, ${r.dmg.toFixed(0)} HP), not every one`);
  ok(r.coverN > 0 && r.coverOK / r.coverN > 0.9, `4★: cover keeps the car body between officer and shooter (${(100 * r.coverOK / Math.max(1, r.coverN)).toFixed(0)}%)`);
  ok(r.reloads >= 1, `4★: magazines run dry and are changed in cover (${r.reloads} reloads, ${POLICE_T56.mag}-round magazines)`); }

// ---------------------------------------------------------------- 5. tackle (2★)
{ const pc = new Vehicle('police', 31, scene); pc.place(S.x - 8, S.z - 20, 0); const u = { id: 8, v: pc, officers: [], task: 'foot', footT: 0 };
  const o = mkOfficer(S.x, S.z - 2, 0, 9, u); u.officers.push(o); police.units = [u]; police.foot = [o]; police.level = 2; police.state = 'pursuing'; police.busy = false;
  put(S.x, S.z); player.yaw = 0; player.speed = 5; let got = null; police.arrest = async (off, kind) => { got = { off, kind }; police.busy = true; };
  for (let i = 0; i < 80 && !got; i++) { police.t += 0.05; player.z += 4.0 * 0.05; put(player.x, player.z); police.seenT = 0; police.spotted(); police.updateOfficer(o, u, 0.05); }
  ok(police.stats.tackles >= 1, `2★: an officer dives at a suspect running away within reach (${police.stats.tackles} attempt(s))`);
  ok(got && got.kind === 'tackle' && got.off === o, `the tackle connects → arrest '${got && got.kind}'`);
  // a miss: the suspect sidesteps → officer goes down and recovers
  police.busy = false; got = null; o.tackle = null; o.mode = 'foot'; o.tackleCd = 0; o.x = S.x; o.z = S.z - 2; put(S.x, S.z); police.startTackle(o, { x: player.x, z: player.z }); put(S.x + 2.5, S.z + 0.5);
  for (let i = 0; i < 30; i++) police.updateOfficer(o, u, 0.05);
  ok(!got && o.mode === 'down' && o.tackleCd > 0, `a missed tackle leaves the officer on the ground (mode ${o.mode}), no arrest`);
  for (let i = 0; i < 40; i++) police.updateOfficer(o, u, 0.05); ok(o.mode === 'foot', 'he gets back up');
  delete police.arrest; police.busy = false; police.units = []; police.foot = []; scene.remove(o.ch.root); scene.remove(pc.mesh); }

// 5b. 4★ but the suspect has no weapon out and is within lunging distance: taken down by hand, not shot
{ const pc = new Vehicle('police', 33, scene); pc.place(S.x - 8, S.z - 20, 0); const u = { id: 9, v: pc, officers: [], task: 'foot', footT: 0 };
  const o = mkOfficer(S.x, S.z - 2.2, 0, 10, u); ff.arm(o); u.officers.push(o); police.units = [u]; police.foot = [o]; police.level = 4; police.state = 'pursuing'; police.busy = false;
  put(S.x, S.z); player.yaw = 0; player.speed = 0; let got = null; police.arrest = async (off, kind) => { got = { off, kind }; police.busy = true; }; const s0 = ff.stats.shots;
  for (let i = 0; i < 120 && !got; i++) { police.t += 0.05; g.clock += 0.05; if (i > 20) { player.z += 3.5 * 0.05; put(player.x, player.z); player.speed = 3.5; } police.seenT = 0; police.spotted(); police.updateOfficer(o, u, 0.05); }
  ok(ff.stats.shots === s0, `4★, unarmed suspect at arm's length: the officer does not open fire (${ff.stats.shots - s0} rounds)`);
  ok(got && (got.kind === 'grab' || got.kind === 'tackle'), `… he is grabbed or tackled instead → arrest '${got && got.kind}'`);
  delete police.arrest; police.busy = false; police.units = []; police.foot = []; ff.disarm(o); scene.remove(o.ch.root); scene.remove(pc.mesh); }

// ---------------------------------------------------------------- 6. BUSTED sequences (grab / tackle / shot) and penalties
const runArrest = async (kind) => {
  const pc = new Vehicle('police', 40, scene); pc.place(S.x - 6, S.z - 8, 0); T.vehicles.push(pc); const u = { id: 9, v: pc, officers: [], task: 'foot', footT: 0 }; pc.police = u;
  const o = mkOfficer(S.x + 0.3, S.z - 1.1, 0, 10, u), b = mkOfficer(S.x - 3, S.z - 5, 0.4, 11, u); u.officers.push(o, b); police.units = [u]; police.foot = [o, b];
  police.level = kind === 'shot' ? 4 : 2; police.state = 'pursuing'; police.busy = false; put(S.x, S.z); player.yaw = 0; player.control = true; g.story.state.health = kind === 'shot' ? 20 : 100; g.timeSlow = 1;
  const cam0 = camera.position.clone(); camera.position.set(S.x, 3, S.z - 6); camera.lookAt(S.x, 1, S.z); const money0 = g.story.state.money; notes.length = 0;
  if (kind === 'shot') g.health.damage(40, 'shot by police'); else police.arrest(o, kind);
  let t = 0, moved = 0, slowMin = 1, nan = false, camPrev = camera.position.clone(), during = 0; const hp0 = g.story.state.health;
  while ((police.busy || police.cine) && t < 30) { await new Promise((r) => setImmediate(r)); police.update(0.05 * g.timeSlow); t += 0.05; g.clock += 0.05; slowMin = Math.min(slowMin, g.timeSlow); moved += camera.position.distanceTo(camPrev); camPrev.copy(camera.position);
    if (police.cine) during++; player.ch.root.traverse((q) => { if (q.isBone && (!isFinite(q.rotation.x) || !isFinite(q.position.y))) nan = true; }); if (!isFinite(camera.position.x)) nan = true; }
  if (process.env.V) console.log(kind, 't', t.toFixed(1), 'busy', police.busy, 'cine', police.cine && police.cine.rT.toFixed(2), police.cine && police.cine.done);
  const lp = police.lastPenalty; const res = { t, moved, slowMin, nan, lp, during, money0, hp0, hosp: Math.hypot(player.x - L.PLACES.hospital.x, player.z - L.PLACES.hospital.z), hp: g.story.state.health, slowEnd: g.timeSlow, control: player.control, camOv: player.camOverride, units: police.units.length };
  for (const q of [o, b]) scene.remove(q.ch.root); scene.remove(pc.mesh); T.vehicles.splice(T.vehicles.indexOf(pc), 1); void cam0;
  return res;
};
for (const kind of ['grab', 'tackle', 'shot']) {
  const r = await runArrest(kind);
  if (process.env.V) console.log(kind, JSON.stringify({ control: r.control, camOv: r.camOv, units: r.units, level: police.level, hbusy: g.health.busy, pbusy: police.busy, t: r.t }));
  ok(r.lp && r.lp.how === kind && r.during > 100, `BUSTED (${kind}): the sequence plays (${(r.during * 0.05).toFixed(1)} s of frames) and ends in an arrest '${r.lp && r.lp.how}'`);
  ok(r.moved > 8 && !r.nan, `BUSTED (${kind}): the camera travels ${r.moved.toFixed(0)} m through its shots; no NaN in the skeleton or camera`);
  ok(r.slowMin < 0.45 && r.slowEnd === 1, `BUSTED (${kind}): slow motion (×${r.slowMin.toFixed(2)}) through the impact, back to normal time afterwards`);
  ok(r.control && !r.camOv && r.units === 0 && police.level === 0, `BUSTED (${kind}): control and the gameplay camera return, wanted level cleared`);
  if (kind === 'shot') { ok(r.hosp < 30 && r.hp === 100, `killed by police: released in front of the ${HOSPITAL.name} (${r.hosp.toFixed(0)} m from it) with full health`); ok(r.lp.hours === 4 + HOSPITAL.hours || r.lp.hours >= HOSPITAL.hours + 1, `shot: held ${r.lp.hours} h including hospital treatment`); }
  else ok(r.lp.fine > 0 && r.money0 - g.story.state.money >= r.lp.paid && r.lp.station, `${kind}: fined Rs. ${r.lp.fine}, released at ${r.lp.station}`);
}
ok(police.stats.busted.grab === 1 && police.stats.busted.tackle === 1 && police.stats.busted.shot === 1, 'arrest counters by kind');
console.log(`police-combat: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
