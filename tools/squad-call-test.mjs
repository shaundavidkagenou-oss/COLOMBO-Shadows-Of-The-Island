// Squad call / pickup test (node tools/squad-call-test.mjs). Squad-mates never follow on their own any more: you phone
// one, he names a kerbside pickup spot, and you collect him by car. Runs the REAL Squad / SquadLife / SquadCall / Phone
// code on the real city (CityPlan colliders + Traffic road graph) with a real vehicle:
//  1. pickup spots (Shashika at the garage, David at his Pettah stall, Dineth at the landmark nearest his tuk, from many
//     positions): on the pavement (off the carriageway, not inside anything), beside a drivable lane, facing the road;
//  2. nobody tags along: with the squad unlocked and you walking off, both mates stay in their own lives;
//  3. the phone: Contacts lists both mates; while wanted he refuses; asked along he names the spot, the map gets a
//     pickup blip and the GPS a waypoint; he is waiting there (HUD 'Waiting for a lift');
//  4. on foot he will not come ('Where's the car?') and stays at the kerb; with a bike he refuses (no room);
//  5. you stop beside him in a car: he walks to the passenger side and steps in (the real step-in: no bone faster than
//     6 m/s, no frame NaN) and ends seated; blip and waypoint cleared; he rides along while you drive;
//  6. on foot again he steps out and follows you; call again → he heads off: back to his own life, no longer following;
//  7. switching: to a mate who is with you, the one you leave stays with the group; to anyone else, nobody follows.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
if (!globalThis.navigator) globalThis.navigator = { getGamepads: () => [] }; else if (!navigator.getGamepads) navigator.getGamepads = () => [];
if (!globalThis.window) globalThis.window = globalThis; if (globalThis.document && !document.addEventListener) document.addEventListener = () => {}; globalThis.addEventListener ??= () => {};
{ const fakeEl = () => { const e = { className: '', innerHTML: '', textContent: '', style: { setProperty() {}, removeProperty() {} }, dataset: {}, children: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; }, append() {}, remove() {}, prepend() {}, insertBefore(c) { return c; }, setAttribute() {}, getAttribute: () => null, addEventListener() {}, removeEventListener() {}, querySelector: () => fakeEl(), querySelectorAll: () => [], getContext: () => null, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), focus() {}, blur() {} }; return e; };
  const _ce = document.createElement.bind(document); document.createElement = (tag) => (tag === 'canvas' ? _ce(tag) : fakeEl()); document.body = document.body && document.body.appendChild ? document.body : fakeEl(); document.getElementById = () => fakeEl(); document.querySelector = () => fakeEl(); }
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const L = await import('../src/world/Layout.js');
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Collision } = await import('../src/world/Collision.js');
const { Traffic } = await import('../src/vehicles/Traffic.js');
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
const { Character, HEROES } = await import('../src/actors/Character.js');
const { Squad } = await import('../src/actors/Squad.js');
const SC = await import('../src/actors/SquadCall.js');
let pass = 0, fail = 0; const seen = new Set(); const ok = (c, m) => { if (c) pass++; else { fail++; const k = m.replace(/[0-9.-]+/g, '#'); if (!seen.has(k)) { seen.add(k); console.log('FAIL', m); } } };
const DT = 1 / 60;

const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene(); const T = new Traffic(scene, col, { emit() {}, on() {} }); T.max = 0;

// ---------------------------------------------------------------- 1. pickup spots
const fake = (id, x, z) => ({ def: { id, name: id }, x, z });
const probes = [fake('shashika', 0, 0), fake('david', 0, 0)]; for (const k of ['seema', 'museum', 'townhall', 'fortStation', 'clockTower', 'gfHotel', 'kanatte', 'wellawatte', 'lotus', 'hospital', 'meeting', 'tailor']) { const p = L.PLACES[k]; probes.push(fake('dineth', p.x + 30, p.z - 20)); }
for (const m of probes) {
  const a = SC.anchorFor(m); const s = SC.pickupSpot(T, col, a); const tag = `${m.def.id} ${a.label}`;
  ok([s.x, s.z, s.y, s.yaw, s.stop.x, s.stop.z].every(Number.isFinite), `${tag}: finite spot`);
  ok(!L.roadAt(s.x, s.z) && !L.isWater(s.x, s.z), `${tag}: he waits off the carriageway (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
  ok(!col.blocked(s.x, s.z, 0.3), `${tag}: the spot is not inside a building / prop`);
  ok(L.roadAt(s.stop.x, s.stop.z), `${tag}: the car stop point is on the road`);
  { let clear = true; for (let k = 0; k <= 40; k++) { const x = s.x + (s.stop.x - s.x) * k / 40, z = s.z + (s.stop.z - s.z) * k / 40; if (!L.roadAt(x, z) && col.blocked(x, z, 0.3)) clear = false; } ok(clear, `${tag}: a clear walk from the spot to the car (no fence / wall between)`); }
  const dS = Math.hypot(s.x - s.stop.x, s.z - s.stop.z); ok(dS > 1 && dS < 14, `${tag}: kerbside — ${dS.toFixed(1)} m from the lane`);
  ok(Math.hypot(s.x - a.x, s.z - a.z) < 170, `${tag}: near the named place (${Math.hypot(s.x - a.x, s.z - a.z).toFixed(0)} m)`);
  const fy = Math.atan2(s.stop.x - s.x, s.stop.z - s.z); ok(Math.abs(Math.atan2(Math.sin(fy - s.yaw), Math.cos(fy - s.yaw))) < 0.2, `${tag}: faces the road`);
}

// ---------------------------------------------------------------- live game stub around the real Squad
const hud = { root: document.createElement('div'), blips: [], waypoint: null, subs: [], notes: [], gps: {},
  addBlip(id, x, z, kind, label) { this.removeBlip(id); this.blips.push({ id, x, z, kind, label }); }, removeBlip(id) { this.blips = this.blips.filter((b) => b.id !== id); },
  setWaypoint(x, z) { this.waypoint = { x, z }; }, clearWaypoint() { this.waypoint = null; }, subtitle(who, text) { this.subs.push(`${who}: ${text}`); }, notify(t, b) { this.notes.push(`${t}: ${b}`); }, choiceEl: null, key: () => 'X' };
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 400);
const P = { x: 0, z: 0, y: 0, yaw: 0, speed: 0, vehicle: null, grounded: true, control: true, ch: new Character(HEROES.dineth), sync() { this.ch.root.position.set(this.x, this.y, this.z); this.ch.root.rotation.set(0, this.yaw, 0); }, entry: null, exiting: null };
scene.add(P.ch.root);
const g = { scene, collision: col, traffic: T, player: P, hud, camera, police: { level: 0 }, director: { active: false }, indoor: false, interiors: { current: null, doors: [] }, health: { busy: false }, bodies: [],
  story: { state: { health: 100 }, running: null, guards: [], pursuers: [], allowSwitch: true }, weapons: { inv: [], sel: -1, drawn: false, forceHolster() {}, attach() {}, showHolstered() {}, state: 'idle' }, grenades: null, timeSlow: 1 };
const sq = new Squad(g); g.squad = sq; sq.unlock(false);
const sh = sq.memberById('shashika'), da = sq.memberById('david');
// the camera looks at the player from behind (so in-view checks behave like the game)
const aimCam = () => { const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw); camera.position.set(P.x - fx * 5, P.y + 2.2, P.z - fz * 5); camera.lookAt(P.x + fx * 4, P.y + 1.2, P.z + fz * 4); camera.updateMatrixWorld(); };
const step = (n, fn) => { for (let i = 0; i < n; i++) { if (fn) fn(i); if (!P.vehicle) P.sync(); aimCam(); sq.update(DT, false); } };
const walkTo = (x, z, sp = 4) => { const d = Math.hypot(x - P.x, z - P.z); P.yaw = Math.atan2(x - P.x, z - P.z); const n = Math.ceil(d / sp / DT); step(n, () => { const dd = Math.hypot(x - P.x, z - P.z); if (dd < 0.05) { P.speed = 0; return; } const s = Math.min(dd, sp * DT); P.x += Math.sin(P.yaw) * s; P.z += Math.cos(P.yaw) * s; P.y = L.groundY(P.x, P.z); P.speed = sp; }); P.speed = 0; };

// ---------------------------------------------------------------- 2. nobody tags along
{ const S = L.PLACES.slaveFlat; P.x = S.x + 6; P.z = S.z + 6; P.y = L.groundY(P.x, P.z); sq.regroup(true);
  ok(sh.mode === 'life' && da.mode === 'life' && !sh.crew && !da.crew, 'after unlock + regroup both mates are in their own lives');
  walkTo(P.x + 60, P.z + 10); walkTo(P.x - 20, P.z + 50);
  for (const m of [sh, da]) ok(m.mode === 'life' && Math.hypot(m.x - P.x, m.z - P.z) > 40, `${m.def.id} does not follow you (${Math.hypot(m.x - P.x, m.z - P.z).toFixed(0)} m away, mode ${m.mode})`);
  ok(!sq.squadOn(), 'nobody is with you'); }

// ---------------------------------------------------------------- 3. the phone
const { Phone } = await import('../src/ui/Phone.js'); let ph = null; try { ph = new Phone(g); } catch (e) { ok(false, 'Phone builds in node: ' + e.message); }
const C = ph.contacts(); ok(C.filter((c) => c.friend).map((c) => c.friend).sort().join() === 'david,shashika' && C.some((c) => c.n === '119'), 'Contacts: both mates you are not playing + 119');
const shOpts = () => SC.callOptions(sh).map((o) => o.id).join();
ok(shOpts() === 'come,hang', 'a mate in his own life: "come along" / hang up');
g.police.level = 2; let r = ph.friendAnswer(sh, 'come'); ok(!r.ok && !sh.crew && /police/i.test(r.msg), 'while wanted he refuses');
g.police.level = 0; r = ph.friendAnswer(sh, 'come'); ok(r.ok && sh.crew === 'pickup' && sh.call && /Lanka Auto Care/.test(r.msg), `asked along he names the spot: "${r.msg}"`);
const spot = { ...sh.call }; ok(hud.blips.some((b) => b.id === 'pickup:shashika' && b.kind === 'pickup'), 'map: pickup blip'); ok(hud.waypoint && Math.hypot(hud.waypoint.x - spot.x, hud.waypoint.z - spot.z) < 0.01, 'GPS waypoint at the spot');
ok(shOpts() === 'where,cancel,hang', 'waiting: where are you / never mind / hang up');
step(30); ok(sh.mode === 'pickup', 'he is on his way to the pickup'); ok(/Waiting for a lift/.test(sq.status(sh, 1)), `HUD: "${sq.status(sh, 1)}"`);

// ---------------------------------------------------------------- 4. on foot / bike: no
{ const sx = spot.stop.x + (spot.x - spot.stop.x) * 0.4, sz = spot.stop.z + (spot.z - spot.stop.z) * 0.4; P.x = sx + 80; P.z = sz; P.y = L.groundY(P.x, P.z); step(10); walkTo(sx, sz);
  step(90); ok(!sh.hidden && sh.ch.root.visible && Math.hypot(sh.x - spot.x, sh.z - spot.z) < 0.7, `he is standing at the kerb (${Math.hypot(sh.x - spot.x, sh.z - spot.z).toFixed(2)} m)`);
  ok(hud.subs.some((s) => /car/i.test(s) && s.startsWith('Shashika')), 'on foot: "Where\'s the car?"'); ok(sh.crew === 'pickup', 'on foot he does not come along');
  walkTo(P.x + 25, P.z + 5); ok(Math.hypot(sh.x - spot.x, sh.z - spot.z) < 0.7 && sh.crew === 'pickup', 'and he stays at the spot when you walk off'); }

// a real car (left-hand traffic: kerb lane, stopped beside him)
const car = new Vehicle('sedan', 5, scene); const lane = T.laneNear(spot.stop.x, spot.stop.z, 0, 30); const pc = lane.piece; const cy = Math.atan2(pc.d[0], pc.d[1]);
const drive = (x, z, yaw, speed) => { car.place(x, z, yaw); car.speed = speed; car.mesh.updateMatrixWorld(true); P.x = car.x; P.z = car.z; P.y = car.y; P.yaw = yaw; };
const enterCar = () => { P.vehicle = car; car.player = true; P.ch.root.parent?.remove(P.ch.root); car.mesh.add(P.ch.root); };
const leaveCar = () => { P.vehicle = null; car.player = false; car.mesh.remove(P.ch.root); scene.add(P.ch.root); const s = new THREE.Vector3(-1.6, 0, 0.2).applyMatrix4(car.mesh.matrixWorld); P.x = s.x; P.z = s.z; P.y = L.groundY(s.x, s.z); };
{ const bike = new Vehicle('bike', 6, scene); bike.place(spot.stop.x, spot.stop.z, cy); bike.speed = 0; P.vehicle = bike; P.x = bike.x; P.z = bike.z; hud.subs.length = 0; sh.call.nag = 0; step(30);
  ok(sh.crew === 'pickup' && hud.subs.some((s) => /room/i.test(s)), 'on a bike: "no room" — he waits for a car'); P.vehicle = null; scene.remove(bike.mesh); }

// ---------------------------------------------------------------- 5. stop beside him in a car: the real step-in
{ const back = 8; drive(spot.stop.x - pc.d[0] * back, spot.stop.z - pc.d[1] * back, cy, 8); enterCar(); hud.subs.length = 0;
  const DTT = DT; let maxV = 0, at = '', nan = false, prev = null, stagePrev = ''; const BONES = ['hips', 'chest', 'head', 'footL', 'footR', 'handL', 'handR', 'shinL', 'shinR'];
  const W = (n) => sh.ch.bones[n].getWorldPosition(new THREE.Vector3());
  // pull up: decelerate along the lane to a stop beside him
  let s = -back; let v = 8; for (let i = 0; i < 600 && v > 0; i++) { v = Math.max(0, v - 4 * DTT); s += v * DTT; if (s > 0) { s = 0; v = 0; } drive(spot.stop.x + pc.d[0] * s, spot.stop.z + pc.d[1] * s, cy, v); step(1); }
  ok(sh.crew === 'with' && hud.subs.some((x) => x.startsWith('Shashika')), `stopped beside him: he comes along (${hud.subs.join(' | ')})`);
  ok(!hud.blips.some((b) => b.id === 'pickup:shashika') && !hud.waypoint, 'blip and waypoint cleared');
  let t = 0, sawIn = false; while (!sh.vehicle && t < 20) { step(1); t += DTT; scene.updateMatrixWorld(true); const stg = sh.board ? sh.board.stage : sh.mode; if (stg === 'in') sawIn = true; const cur = BONES.map(W); if (cur.some((q) => !Number.isFinite(q.x + q.y + q.z))) nan = true;
    if (prev && stg === 'in' && stagePrev === 'in') cur.forEach((q, k) => { const sp = q.distanceTo(prev[k]) / DTT; if (sp > maxV) { maxV = sp; at = BONES[k]; } }); prev = cur; stagePrev = stg; }
  ok(sh.vehicle === car && sh.seat && !sh.seat.driver, `he got in (${t.toFixed(1)} s)`); ok(sawIn, 'with the real step-in (front passenger seat)'); ok(!nan, 'no NaN bone');
  ok(maxV < 6, `step-in: fastest bone ${maxV.toFixed(2)} m/s (${at})`); ok(sh.ch.root.parent === car.mesh && sh.ch.root.position.distanceTo(new THREE.Vector3(sh.seat.x, sh.seat.y, sh.seat.z)) < 1e-6 && !sh.ch.anim.board, 'seated exactly at the seat, board pose cleared');
  console.log(`  step-in ${t.toFixed(1)} s, fastest bone ${maxV.toFixed(2)} m/s`);
  // drive off 200 m: he rides along
  for (let i = 0; i < 600; i++) { s += 12 * DTT; drive(spot.stop.x + pc.d[0] * Math.min(s, 120), spot.stop.z + pc.d[1] * Math.min(s, 120), cy, 12); step(1); }
  ok(sh.vehicle === car && sh.crew === 'with', 'rides along while you drive'); }

// ---------------------------------------------------------------- 6. out together, then send him off
{ car.speed = 0; leaveCar(); let t = 0, sawOut = false; while (sh.vehicle && t < 10) { step(1); t += DT; if (sh.unboard) sawOut = true; }
  ok(!sh.vehicle && sawOut, `you get out: he steps out too (${t.toFixed(1)} s, real step-out)`);
  const inv = new THREE.Matrix4().copy(car.mesh.matrixWorld).invert(); const l = new THREE.Vector3(sh.x, 0, sh.z).applyMatrix4(inv); ok(Math.abs(l.x) > car.T.wid / 2 - 0.05, 'he stands outside the body');
  walkTo(P.x + Math.sin(cy) * -12, P.z + Math.cos(cy) * -12, 3); step(120); ok(sh.mode === 'follow' && Math.hypot(sh.x - P.x, sh.z - P.z) < 6, `he follows you on foot (${Math.hypot(sh.x - P.x, sh.z - P.z).toFixed(1)} m)`);
  ok(SC.callOptions(sh).map((o) => o.id).join() === 'bye,hang', 'with you: "head off" / hang up');
  const rb = ph.friendAnswer(sh, 'bye'); step(10); ok(rb.ok && sh.crew === null && sh.mode === 'life', 'sent off: back to his own life');
  const x0 = P.x, z0 = P.z; walkTo(x0 + 40, z0 + 30); walkTo(x0 + 80, z0 - 10); ok(Math.hypot(sh.x - P.x, sh.z - P.z) > 30, `and no longer follows (${Math.hypot(sh.x - P.x, sh.z - P.z).toFixed(0)} m)`); }

// ---------------------------------------------------------------- 6b. sent off while riding: out at the next stop
{ const ln2 = T.laneNear(P.x, P.z, cy, 80); const [lx2, lz2] = [ln2.piece.p0[0] + ln2.piece.d[0] * ln2.s, ln2.piece.p0[1] + ln2.piece.d[1] * ln2.s]; const cy2 = Math.atan2(ln2.piece.d[0], ln2.piece.d[1]);
  P.x = lx2 + ln2.piece.d[1] * 3; P.z = lz2 - ln2.piece.d[0] * 3; P.y = L.groundY(P.x, P.z); sh.crew = 'with'; sq.setLife(sh, false); step(30); drive(lx2, lz2, cy2, 0); enterCar(); let t = 0; while (!sh.vehicle && t < 20) { step(1); t += DT; } ok(sh.vehicle === car, 'picked up again');
  for (let i = 0; i < 120; i++) { drive(car.x + Math.sin(cy2) * 10 * DT, car.z + Math.cos(cy2) * 10 * DT, cy2, 10); step(1); } sq.dismiss(sh); for (let i = 0; i < 60; i++) { drive(car.x + Math.sin(cy2) * 10 * DT, car.z + Math.cos(cy2) * 10 * DT, cy2, 10); step(1); }
  ok(sh.vehicle === car, 'sent off while driving: stays in until you stop'); car.speed = 0; t = 0; while ((sh.vehicle || sh.unboard) && t < 10) { step(1); t += DT; }
  step(2); ok(!sh.vehicle && sh.mode === 'life', `you stop: he gets out and goes his own way (${t.toFixed(1)} s)`); leaveCar(); }

// ---------------------------------------------------------------- 7. switching
{ ph.friendAnswer(da, 'come'); ok(da.crew === 'pickup', 'David asked along'); sq.cancelPickup(da); ok(da.crew === null && !hud.blips.some((b) => b.id === 'pickup:david'), 'never mind: pickup cancelled, blip removed');
  sh.crew = 'with'; sq.setLife(sh, false); step(5); sq.switchInstant(1); ok(sq.activeId === 'shashika' && sq.memberById('dineth').crew === null && sq.memberById('dineth').mode === 'life', 'switchInstant: the one you leave is not crew → his own life');
  ok(SC.canPickUp(null, null) === 'noCar' && SC.canPickUp({ T: { entry: 'bike' } }, {}) === 'noRoom' && SC.canPickUp({ T: { entry: 'car' } }, null) === 'noRoom' && SC.canPickUp({ T: { entry: 'car' } }, {}) === null, 'canPickUp rules'); }
// save / load: everybody back to his own day
{ const s = sq.save(); sq.memberById('dineth').crew = 'with'; sq.load(s); sq.regroup(); ok(sq.followers.every((m) => m.crew === null && m.mode === 'life'), 'after a load nobody is with you'); }
{ const src = (await import('node:fs')).readFileSync(new URL('../src/actors/Squad.js', import.meta.url), 'utf8'); ok(!/squadFor\(st\.running\)/.test(src), 'mission state no longer makes the squad follow'); }

console.log(`squad-call-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
