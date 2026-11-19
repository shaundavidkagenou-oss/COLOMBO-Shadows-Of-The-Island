// 73rd: the end — and the start — of banking hours at Ceylon Meridian Bank, played out when the player is there to see it.
//
// Closing time (B.open[1]) with the player inside or near the branch: the counter officers, the receptionist, the supervisor and
// the branch manager finish up one after another (staggered over about half a minute). Each gets up from the chair (the same
// rise as the phone call: the chair rolls back), turns to a co-worker and says goodbye (the other answers), walks out — the staff
// through the staff door in the counter partition (its leaf swings), round the hall, a goodnight to the security officer (who
// stays on: the branch keeps a night guard), through the front door with the one-at-a-time doorway token the customers use —
// and then goes home:
//   • the manager and the supervisor have cars: each car has stood on a kerb spot near the branch all day (a normal parked car
//     built out of sight by Traffic). They walk to it, get in through the driver's door (the shared boarding motion), and drive
//     off into the traffic;
//   • the others pair up and wait at the kerb (phone out); a three-wheeler comes along the kerb lane — built out of sight, from
//     a model the street has already used — pulls up, they get in the back, and it drives on with them.
// Opening time is the same in reverse: the cars arrive and park on their spots, a three-wheeler drops two officers at the kerb
// and another pair walks in, everybody greets the guard and their colleagues and sits down at their desks.
// With the player away the shift change simply happens off screen (people shown / hidden, cars on their spots or not).
//
// Cost: nothing new is built mid-play except a three-wheeler and the two cars (models warmed on the loading screen; the tuk's
// driver comes out of Traffic's driver bin). The six people are the staff that exist anyway; while walking they reuse the
// customers' walker (stepCustomer: string-pulling, the doorway token, giving way, solid bodies) and the room's obstacle list
// (a one-off grid path for each walk through the hall). No per-frame work at all while nobody is changing shift.
import * as THREE from 'three';
import { npcBoardSetup, boardCurve, poseBoard, boardGroundFn, lapGrips, swingDoor } from '../actors/Boarding.js';
import { seatCharacter } from '../actors/Seating.js';
import { cancelShut, shutDoorLater } from '../vehicles/DoorRig.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { warmModel } from '../vehicles/VehicleModels.js';
import { evalPiece, linePiece } from '../vehicles/Traffic.js';
import { plan } from './CityPlan.js';

const BYE = ["Right, that's me for today. See you tomorrow!", "I'm off now. Don't stay too late, ah?", 'Okay, bye all! See you in the morning.', "Good night. I'll finish the remittance file tomorrow."];
const BYE_BACK = ['Bye! Go safely.', 'Good night, see you tomorrow.', 'Okay, take care!', 'Bye. Mind the traffic on Galle Road.'];
const HELLO = ['Good morning! The traffic on Galle Road was terrible.', 'Morning, all!', 'Good morning. Is the system up yet?', 'Morning! Rain again today, no?'];
const HELLO_BACK = ['Good morning!', 'Morning! It came up ten minutes ago.', 'Morning. Tea is in the pantry.'];
// the staff cars: kerb-parked all day; warmed on the loading screen so arriving never builds a model mid-play
export const STAFF_CARS = { mgr: { type: 'sedan', seed: 4411 }, sup: { type: 'car', seed: 5127 } };
export function warmStaffCars() { for (const k in STAFF_CARS) { try { warmModel(STAFF_CARS[k].type, STAFF_CARS[k].seed); } catch (e) { /* headless */ } } }

const ss = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const turnTo = (a, b, k) => a + wrap(b - a) * Math.min(1, k);
const pickOf = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];

// a one-off path through the hall on a 0.15 m grid (A*, 8-neighbour), then pulled tight; `clear(x, z)` is the room's obstacle test.
// Cells within `len` of either end are always open (a desk chair stands inside its desk's obstacle box).
export function gridPath(from, to, clear, x0, x1, zA, zB, step = 0.15, len = 0.7) {
  const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((zB - zA) / step) + 1, N = nx * nz;
  const cx = (k) => x0 + (k % nx) * step, cz = (k) => zA + Math.floor(k / nx) * step;
  const cell = (x, z) => { const i = Math.round((x - x0) / step), j = Math.round((z - zA) / step); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
  const ok = new Uint8Array(N); for (let k = 0; k < N; k++) { const x = cx(k), z = cz(k); ok[k] = clear(x, z) || Math.hypot(x - from[0], z - from[1]) < len || Math.hypot(x - to[0], z - to[1]) < len ? 1 : 0; }
  const s0 = cell(from[0], from[1]), s1 = cell(to[0], to[1]); if (s0 < 0 || s1 < 0) return [to];
  const gS = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), shut = new Uint8Array(N); const heap = []; // [f, k]
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = (k) => Math.hypot(cx(k) - cx(s1), cz(k) - cz(s1)); gS[s0] = 0; push(h(s0), s0); let found = false;
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length) { const [, k] = pop(); if (shut[k]) continue; shut[k] = 1; if (k === s1) { found = true; break; } const i = k % nx, j = Math.floor(k / nx);
    for (const [di, dj, c] of NB) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const q = b * nx + a; if (!ok[q] || shut[q]) continue; if (di && dj && (!ok[j * nx + a] || !ok[b * nx + i])) continue; // no corner cutting
      const g2 = gS[k] + c * step; if (g2 < gS[q]) { gS[q] = g2; came[q] = k; push(g2 + h(q), q); } } }
  if (!found) return [to];
  const cells = []; for (let k = s1; k >= 0; k = came[k]) cells.push(k); cells.reverse();
  const free = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az); for (let t = 0; t <= L; t += step * 0.5) { const q = cell(ax + (bx - ax) * t / L, az + (bz - az) * t / L); if (q < 0 || !ok[q]) return false; } return true; };
  const out = []; let a = [from[0], from[1]], i = 0; // string pulling: from each kept point, the farthest cell still in clear view
  while (i < cells.length - 1) { let j = cells.length - 1; while (j > i + 1 && !free(a[0], a[1], cx(cells[j]), cz(cells[j]))) j--; const p = j === cells.length - 1 ? [to[0], to[1]] : [cx(cells[j]), cz(cells[j])]; out.push(p); a = p; i = j; }
  if (!out.length || Math.hypot(out[out.length - 1][0] - to[0], out[out.length - 1][1] - to[1]) > 0.05) out.push([to[0], to[1]]);
  return out;
}

// ctx: everything the room's closure owns that the shift change needs (see BankInterior: makeBankShift(...))
export function makeBankShift(ctx) {
  const { game, site, g, room, stand, B, Z, xL, xR, staffSideX, staffDoor, P: PTS, seatOf, standOf, CHAIR_BACK, REC, stepCustomer, hide, place, walkInOf, hallClear, rng } = ctx;
  const { DOOR_IN, DOOR_OUT, LEAVE_WAIT, STREET_OUT, ARR_WAIT, WALK_ON } = PTS;
  const crew = []; const S = { crew, stats: { leaves: 0, arrivals: 0, tukRides: 0, carTrips: 0, walked: 0, byes: 0 }, log: [] };
  const note = (s) => { S.log.push(`${(game.clock || 0).toFixed(1)} ${s}`); if (S.log.length > 40) S.log.shift(); };
  void LEAVE_WAIT; const DX = staffDoor.x, DOOR_HALL = [DX, Z(8.3)], DOOR_STAFF = [DX, Z(9.7)];
  const T = () => game.traffic; const W = () => walkInOf();
  const hour = () => (game.atmos ? game.atmos.hour : 12); const today = () => (game.atmos ? game.atmos.day || 0 : 0);
  const dutyWant = () => { if (S.force !== undefined && S.force !== null) return S.force; const h = hour(); return h >= B.open[0] - 0.3 && h < B.open[1]; }; // (S.force: tests)
  // ---- the people: home spot, how they get to the hall, how they go home
  const people = [];
  stand.tellers.forEach((t, i) => { t.role = 'Bank officer'; t.seatP = seatOf(t); t.standP = standOf(t); t.yawH = 0; t.staffSide = true;
    t.pre = [[t.x + 0.66, Z(10.2)], [t.x + 0.66, Z(11.1)], [DX, Z(11.1)], DOOR_STAFF, [DX, Z(9.0)], DOOR_HALL]; t.how = 'tuk'; t.grp = i < 2 ? 0 : 1; people.push(t); });
  // (the receptionist leaves her desk round its right-hand end; the manager round his desk and out of the office doorway)
  { const p = stand.recep; p.role = 'Receptionist'; p.seatP = [REC.x, Z(4.15) - 0.04]; p.standP = [REC.x, Z(4.5)]; p.yawH = 0; p.pre = [[REC.x + 0.5, Z(4.85)], [3.8, Z(4.85)], [3.8, Z(2.7)]]; p.how = 'tuk'; p.grp = 1; people.push(p); }
  { const p = stand.sup; p.role = 'Operations supervisor'; p.spotP = [4.7, Z(11.9)]; p.yawH = -0.3; p.staffSide = true; p.pre = [[4.7, Z(11.1)], [DX, Z(11.1)], DOOR_STAFF, [DX, Z(9.0)], DOOR_HALL]; p.how = 'car'; p.car = STAFF_CARS.sup; people.push(p); }
  { const p = stand.mgr; p.role = 'Branch manager'; p.seatP = [6.1, Z(5.22) + 0.04]; p.standP = [6.1, Z(4.98)]; p.yawH = Math.PI; p.pre = [[5.45, Z(5.2)], [5.3, Z(5.75)], [5.15, Z(6.45)], [5.0, Z(6.8)], [4.2, Z(6.8)]]; p.how = 'car'; p.car = STAFF_CARS.mgr; people.push(p); }
  const DELAY = [0, 7, 13, 4, 16, 24]; people.forEach((p, i) => { p.delay = DELAY[i]; p.duty = 'on'; p.sexW = p.ch.spec && p.ch.spec.sex === 'f' ? 'madam' : 'sir'; });
  S.people = people;
  const visibleOn = (p, on) => { p.ch.root.visible = on; };
  const homeOf = (p) => p.seatP || p.spotP;
  // snap (nobody watching): at the desk, seated — or gone home
  const snapOn = (p) => { const ch = p.ch, A = ch.anim; if (ch.root.parent !== g) g.add(ch.root); const [x, z] = homeOf(p); ch.root.position.set(x, 0, z); ch.root.rotation.set(0, p.yawH, 0); ch.root.visible = true;
    A.board = null; A.sitW = null; A.postPose = null; A.reach = null; A.set(null); if (p.seatP) { A.seated = true; A.set('sit'); } else A.seated = null; if (p.chair) { p.chair.position.z = p.chairZ; p.chair.rotation.y = 0; }
    p.duty = 'on'; p.away = false; p.act = null; p._rtn = null; p.walker = null; };
  const snapOff = (p) => { const ch = p.ch; if (ch.root.parent !== g) { ch.root.parent?.remove(ch.root); g.add(ch.root); } ch.root.visible = false; ch.anim.board = null; ch.anim.seated = null; ch.anim.sitW = null; ch.anim.set(null); p.duty = 'off'; p.away = true; p.walker = null; if (p.chair) p.chair.position.z = p.chairZ; };
  // ---- the hall: a grid path between two points, ends always reachable
  const hallPath = (a, b) => gridPath(a, b, hallClear, xL + 0.3, xR - 0.3, Z(8.36), Z(0.45), 0.15, 0.35);
  // ---- talking (subtitles, only for a player inside and near; the face animates)
  const near = (x, z, r = 10) => { const pl = room.pl; return pl && pl.inside && Math.hypot(pl.x - x, pl.z - z) < r; };
  const say = (who, ch, x, z, text, dur = 2.6) => { if (ch.face) { ch.face.talking = true; setTimeout(() => { if (ch.face) ch.face.talking = false; }, dur * 1000); } if (game.hud && near(x, z)) game.hud.subtitle(who, text, '', dur); };
  const posOf = (p) => { if (p.walker) return [p.walker.x, p.walker.z]; const r = p.ch.root.position; return [r.x, r.z]; };
  const side = (z) => z < Z(9.0); // staff side of the counter glass
  const mateFor = (p) => { const [x, z] = posOf(p); let best = null, bd = 1e9; for (const q of people) { if (q === p || !q.ch.root.visible || (q.duty !== 'on' && q.duty !== 'leaving') || q.inCar) continue; const [qx, qz] = posOf(q); if (side(qz) !== side(z)) continue; const d = Math.hypot(qx - x, qz - z); if (d < bd && d < 9) { bd = d; best = q; } } return best; };
  // ---- one-off walker commands (stepCustomer runs { fn } steps: true = done)
  const riseFn = (p) => (c, dt, m) => { const A = c.ch.anim; if (!m.init) { m.init = true; A.set('sit'); A.sitW = 1; A.seated = true; c.yaw = p.yawH; }
    const k0 = m.t - 0.25; if (k0 >= 0 && A.seated) { A.seated = null; A.set('rise'); A.prevAction = null; }
    A.sitW = 1 - ss((k0 - 0.15) / 0.9); const u = ss((k0 - 0.1) / 1.0); c.x = p.seatP[0] + (p.standP[0] - p.seatP[0]) * u; c.z = p.seatP[1] + (p.standP[1] - p.seatP[1]) * u;
    if (p.chair) { p.chair.position.z = p.chairZ - CHAIR_BACK * ss((k0 - 0.35) / 0.8); p.chair.rotation.y = 0.14 * ss((k0 - 0.35) / 0.8); }
    if (k0 >= 1.25 && A.action === 'rise') A.set(null); A.update(dt, 0); place(c); if (k0 >= 1.35) { A.sitW = null; return true; } return false; };
  const sitFn = (p) => (c, dt, m) => { const A = c.ch.anim;
    if (!m.ph) { const y0 = c.yaw; c.yaw = turnTo(c.yaw, p.yawH, dt * 5); A.update(dt, 0, wrap(c.yaw - y0) / Math.max(dt, 1e-3)); place(c); if (Math.abs(wrap(c.yaw - p.yawH)) < 0.05 || m.t > 1.2) { m.ph = 1; m.t = 0; m.from = [c.x, c.z]; A.set('sit'); A.sitW = 0; } return false; }
    if (!p.seatP) { A.update(dt, 0); place(c); return true; }
    const u = Math.min(1, m.t / 0.95), e = ss(u); A.sitW = e; c.yaw = p.yawH; c.x = m.from[0] + (p.seatP[0] - m.from[0]) * e; c.z = m.from[1] + (p.seatP[1] - m.from[1]) * e;
    if (p.chair) { const cu = ss(m.t / 0.95); p.chair.position.z = p.chairZ - CHAIR_BACK * (1 - cu); p.chair.rotation.y = 0.14 * (1 - cu); } A.update(dt, 0); place(c);
    if (u >= 1) { A.seated = true; A.sitW = null; return true; } return false; };
  const talkFn = (p, lines, back) => (c, dt, m) => { const A = c.ch.anim;
    if (!m.init) { m.init = true; m.mate = mateFor(p); if (!m.mate) return true; say(p.role, c.ch, c.x, c.z, pickOf(lines, rng)); A.set('wave'); S.stats.byes++; }
    const [mx, mz] = posOf(m.mate); const y0 = c.yaw; c.yaw = turnTo(c.yaw, Math.atan2(mx - c.x, mz - c.z), dt * 6); A.update(dt, 0, wrap(c.yaw - y0) / Math.max(dt, 1e-3)); place(c);
    if (!m.rep && m.t > 1.5) { m.rep = true; const q = m.mate; say(q.role, q.ch, mx, mz, pickOf(back, rng), 2.2); if (!q.seatP && !q.walker && q.ch.anim.action !== 'wave') { q.waveT = 1.6; q.ch.anim.set('wave'); } }
    if (m.t > 2.3) { A.set(null); return true; } return false; };
  const idleFn = (until, yaw) => (c, dt, m) => { const A = c.ch.anim; if (!m.init) { m.init = true; A.set(rng() < 0.6 ? 'phone' : 'look'); } if (yaw !== undefined) c.yaw = turnTo(c.yaw, yaw, dt * 4); A.update(dt, 0); place(c); if (until(m)) { A.set(null); return true; } return false; };
  // ---- vehicles: the kerb lane in front of the branch, boarding, riding
  const kerbLane = (x, z, yaw, maxD = 16) => { const Tr = T(); const ln = Tr && Tr.laneNear(x, z, yaw, maxD); if (!ln) return null; const lane = ln.seg.level <= 1 ? 1 : 0; const piece = linePiece(ln.seg, ln.piece.from, ln.piece.to, lane);
    const s = Math.max(0.5, Math.min(piece.len - 0.5, (x - piece.p0[0]) * piece.d[0] + (z - piece.p0[1]) * piece.d[1])); return { piece, s, seg: ln.seg }; };
  let front = null; // { piece, sDoor, side } — the kerb lane on the branch's side of the street, toward the door
  const frontLane = () => { if (front !== null) return front; front = false; const W2 = W(); if (!W2 || !T()) return front; const [ax, az] = W2.world(site, 0, 3), [bx, bz] = W2.world(site, 1, 3); const dx = bx - ax, dz = bz - az;
    let best = null; for (const sg of [1, -1]) { const ln = kerbLane(ax, az, Math.atan2(dx * sg, dz * sg), 22); if (!ln) continue; const [lx, lz] = evalPiece(ln.piece, ln.s); const d = Math.hypot(lx - ax, lz - az); if (!best || d < best.d) best = { ...ln, d }; }
    if (best) front = { piece: best.piece, seg: best.seg, sDoor: best.s, d: best.d }; return front; };
  const local = (x, z) => (W() && site ? W().local(site, x, z) : [x, z]); // (no street: tests in Node)
  const worldOf = (c) => (W() && site ? W().world(site, c.x, c.z) : [c.x, c.z]); const syaw = () => (site ? site.yaw : 0);
  const boardPt = (v, seat, A = null) => { const bf = npcBoardSetup(v, seat, A); /* (a hinged door needs the walker's anim: its door-grip reach) */ v.mesh.updateMatrixWorld(); const H0 = bf ? bf.H0 : seat.exit || [Math.sign(seat.x || 1) * (v.T.wid / 2 + 0.6), seat.z]; const w = new THREE.Vector3(H0[0], 0, H0[1]).applyMatrix4(v.mesh.matrixWorld); return [w.x, w.z]; };
  const boardFn = (p, v, seat, asDriver) => (c, dt, m) => { const ch = c.ch, A = ch.anim; if (!v.mesh.parent || v.player || v.disposed) { c.boarded = false; return true; }
    if (!m.init) { m.init = true; m.bf = npcBoardSetup(v, seat, A); const [wx, wz] = worldOf(c); if (ch.root.parent !== game.scene) { ch.root.parent?.remove(ch.root); game.scene.add(ch.root); } m.o = { x: wx, z: wz, yaw: syaw() + c.yaw }; m.boarding = false; m.t = 0; }
    const bf = m.bf, o = m.o; const done = () => { A.board = null; seatCharacter(ch, v, seat); ch.mesh.castShadow = false; if (asDriver) { v.driverChar = ch; v.animAcc = 0; } p.inCar = v; c.boarded = true; c.x = c.z = 999; return true; };
    if (!bf) { if (m.t > 0.4) return done(); return false; }
    if (bf.door) { cancelShut(bf.door); swingDoor(v, bf.door, bf.side, 1, dt, 8.5, 0.62); }
    if (!m.boarding) { v.mesh.updateMatrixWorld(); const hw = new THREE.Vector3(bf.H0[0], 0, bf.H0[1]).applyMatrix4(v.mesh.matrixWorld); const dx = hw.x - o.x, dz = hw.z - o.z, dd = Math.hypot(dx, dz);
      if (dd > 1e-4) { const st = Math.min(dd, 1.3 * dt); o.x += dx / dd * st; o.z += dz / dd * st; } const dy = wrap(v.yaw - o.yaw); o.yaw += dy * Math.min(1, 9 * dt);
      const y = game.collision && game.collision.groundAt ? game.collision.groundAt(o.x, o.z, v.y + 0.6) : (site ? site.y0 : 0); ch.root.position.set(o.x, y, o.z); ch.root.rotation.set(0, o.yaw, 0); A.update(dt, dd > 0.03 ? 1.1 : 0);
      if ((dd < 0.03 && Math.abs(dy) < 0.08 && (!bf.door || bf.door.ang > 0.85)) || m.t > 3) { ch.root.parent?.remove(ch.root); v.mesh.add(ch.root); lapGrips(ch, v, seat, bf.G); m.boarding = true; m.t = 0; A.set(null); A.standUp(); A.duck = 0; }
      return false; }
    const k = Math.min(1, Math.max(0, m.t - 0.12) / bf.T); poseBoard(A, bf.G, boardCurve(bf.G, k), v.mesh, boardGroundFn(v, game.collision), 0, Math.min(1, m.t / 0.25)); A.update(dt, 0, 0);
    if (k >= 1) { if (bf.door) shutDoorLater(v, bf.door, 0.05); return done(); } return false; };
  // take a staff member back out of a vehicle that is leaving the simulation / out of sight (hidden: gone home)
  const takeBack = (p, v) => { const ch = p.ch; if (v && v.driverChar === ch) v.driverChar = null; if (ch.root.parent && ch.root.parent !== g) ch.root.parent.remove(ch.root); p.inCar = null; if (p.walker) { const c = p.walker; const i = crew.indexOf(c); if (i >= 0) crew.splice(i, 1); c.on = false; } snapOff(p); };
  // ---- staff cars on their kerb spots
  const spots = {}; let spotsDone = false;
  const pickSpots = () => { if (spotsDone) return; const W2 = W(); if (!W2 || !T()) return; spotsDone = true; const fr = frontLane(); const cand = [];
    for (const sp of plan.parking) { const dd = Math.hypot(sp.x - site.F.x, sp.z - site.F.z); if (dd > 45) continue; const [lx, lz] = local(sp.x, sp.z); if (lz < 1 || lz > 9 || Math.abs(lx) < 3.2) continue; if (fr && sp.seg !== fr.seg.id) continue; cand.push([Math.abs(lx), sp]); }
    cand.sort((a, b) => a[0] - b[0]);
    // no kerb parking on the branch's own street (Galle Road: none on the arterials) — then round the corner: a kerb spot on a side
    // street (one running away from the shop front, the car heading along local z) within ~45 m; the walk goes along the pavement to
    // the corner of that street and down its kerb to the car (p.via), never through the block
    const side = []; if (cand.length < people.filter((p) => p.car).length) for (const sp of plan.parking) { const dd = Math.hypot(sp.x - site.F.x, sp.z - site.F.z); if (dd > 60) continue;
      const [lx, lz] = local(sp.x, sp.z); if (lz > 1 || lz < -24 || Math.abs(lx) < 8 || Math.abs(lx) > 48 || Math.abs(Math.sin(sp.yaw - syaw())) > 0.3) continue; side.push([Math.abs(lx) - lz * 0.5, sp, [[lx, 1.9]]]); }
    side.sort((a, b) => a[0] - b[0]); for (const q of side) cand.push(q);
    for (const p of people) if (p.car) { const c = cand.shift(); if (c) { spots[p.role] = c[1]; p.spot = c[1]; p.via = c[2] || null; } } note(`staff car spots: ${people.filter((p) => p.spot).length} (${people.filter((p) => p.via).length} round the corner)`); };
  const spotSt = (sp) => { const Tr = T(); if (!Tr.spots) Tr.spots = new Map(); let st = Tr.spots.get(sp); if (!st) { st = { day: -1, occ: false, until: -1 }; Tr.spots.set(sp, st); } return st; };
  const carOf = (p) => { const Tr = T(); if (!p.spot || !Tr) return null; return Tr.parked.find((v) => v.spot === p.spot && v.type === p.car.type && v.seed === p.car.seed && !v.player && !v.disposed) || null; };
  // keep the car's spot booked for the day (Traffic builds it out of sight like any parked car) — or free it for the night
  const keepCar = (p, want) => { const Tr = T(); if (!p.spot || !Tr || p.duty === 'arriving' || p.inCar) return; const st = spotSt(p.spot); const gH = Tr.gameH ?? 0, day = Math.floor(gH / 24);
    if (want) { if (p.carDay === day) return; if (Tr.parkedSet && Tr.parkedSet.has(p.spot) && !carOf(p)) return; /* somebody else parked there today */ p.carDay = day; st.occ = true; st.day = day; st.until = -1; st.claim = null; st.look = { type: p.car.type, seed: p.car.seed }; }
    else { const v = carOf(p); if (v && !Tr.seen(v.x, v.z)) { const i = Tr.parked.indexOf(v); if (i >= 0) Tr.parked.splice(i, 1); v.dispose(); Tr.parkedSet && Tr.parkedSet.delete(p.spot); }
      if (!carOf(p)) { st.occ = false; st.look = null; st.claim = null; st.until = -1; st.day = day; } } };
  const freeSpot = (p) => { const Tr = T(); if (!p.spot) return; const st = spotSt(p.spot); st.occ = false; st.look = null; st.claim = null; st.until = -1; Tr.parkedSet && Tr.parkedSet.delete(p.spot); };
  const driveOffFn = (p, v) => (c, dt, m) => { const Tr = T(), P = game.player;
    if (!m.init) { m.init = true; const ln = kerbLane(v.x, v.z, v.yaw); freeSpot(p); v.spot = null; if (!ln || !Tr.adoptAI(v, ln, { place: false })) { note(`${p.role}: no lane to drive off on (${ln ? 'adopt failed' : 'no lane'})`); takeBack(p, v); return true; } v.ai.rejoin = true; v.speed = 0.4; v.keep = true; v.lights = (game.atmos?.night ?? 0) > 0.4; v.beforeRemove = () => takeBack(p, v); S.stats.carTrips++; note(`${p.role} drives off`); }
    const d = Math.hypot(v.x - P.x, v.z - P.z); if ((d > 70 && !Tr.seen(v.x, v.z)) || d > 140 || m.t > 150 || !v.mesh.parent) { v.beforeRemove = null; takeBack(p, v); const i = Tr.vehicles.indexOf(v); if (i >= 0) { Tr.vehicles.splice(i, 1); Tr.remove(v); } return true; } return false; };
  // ---- three-wheelers: a pair at the kerb is picked up / dropped off
  const groups = [{ id: 0 }, { id: 1 }]; for (const G of groups) { G.members = people.filter((p) => p.grp === G.id); G.state = 'idle'; }
  S.groups = groups;
  const tukSeed = () => { const Tr = T(); const v = Tr.vehicles.find((q) => q.type === 'tuktuk') || Tr.parked.find((q) => q.type === 'tuktuk'); return v ? v.seed : 11; };
  const groupWait = (G, k) => { const x = (G.id ? 4.6 : 3.3) + k * 0.75; return [x, 2.55]; }; // on the pavement edge, right of the door
  const spawnTuk = (G, s0) => { const Tr = T(), fr = frontLane(); const v = new Vehicle('tuktuk', tukSeed(), game.scene); Tr.addDriver(v); v.paxPlan = []; v.pax = [];
    if (!Tr.adoptAI(v, { piece: fr.piece, s: s0, seg: fr.seg })) { v.dispose(); return null; } v.keep = true; v.speed = Math.min(6, v.ai.v0); G.v0 = v.ai.v0; G.v = v; v.ai.sMaxP = fr.piece; v.ai.sMax = G.sStop;
    v.beforeRemove = () => { for (const p of G.members) if (p.inCar === v) takeBack(p, v); else if (G.mode === 'arrive' && p.duty === 'arriving' && !p.walker) snapOn(p); G.state = 'gone'; G.v = null; }; return v; };
  const tukSeats = (v) => v.mesh.userData.seats.map((q, i) => [q, i]).filter(([q]) => !q.driver);
  const approach = (G, dt) => { const v = G.v; if (!v || !v.ai || !v.mesh.parent) { G.state = 'fail'; return false; } const ai = v.ai; const fr = frontLane();
    if (ai.pieces[0] !== fr.piece) return false; const rem = G.sStop - ai.s; ai.v0 = Math.max(0.8, Math.min(G.v0, rem * 0.55)); if (rem < 1.2) v.hold = true; return rem < 1.2 && Math.abs(v.speed) < 0.15; };
  const callTuk = (G, dt) => { const fr = frontLane(); if (!fr) { G.state = 'fail'; return; } G.t += dt; G.sStop = Math.min(fr.piece.len - 1, fr.sDoor + 3.4); const s0 = Math.max(0.6, G.sStop - 62); const [x0, z0] = evalPiece(fr.piece, s0); const P = game.player;
    const clearAhead = !T().vehicles.some((q) => Math.hypot(q.x - x0, q.z - z0) < 7);
    if (clearAhead && (!T().seen(x0, z0) || (G.t > 20 && Math.hypot(x0 - P.x, z0 - P.z) > 40))) { const v = spawnTuk(G, s0); if (v) { G.state = 'coming'; G.t = 0; note(`three-wheeler called (group ${G.id}, ${G.mode})`); return v; } }
    if (G.t > 45) G.state = 'fail'; return null; };
  const releaseTuk = (G) => { const v = G.v; if (!v) return; v.hold = false; if (v.ai) { v.ai.sMaxP = null; v.ai.v0 = G.v0 || 8; } };
  const stepGroup = (G, dt) => {
    if (G.state === 'idle' || G.state === 'done' || G.state === 'fail' || G.state === 'gone') return; const P = game.player;
    if (G.mode === 'leave') {
      if (G.state === 'wait') { const waiting = G.members.filter((p) => p.duty === 'leaving' && p.walker && p.walker.atKerb); const still = G.members.filter((p) => (p.duty === 'leaving' && !(p.walker && p.walker.atKerb) && !p.inCar) || p.pending === 'leave'); if (waiting.length && !still.length) { G.state = 'call'; G.t = 0; G.riders = waiting; } return; }
      if (G.state === 'call') { callTuk(G, dt); return; }
      if (G.state === 'coming') { G.t += dt; if (approach(G, dt)) { G.state = 'held'; G.t = 0; const seats = tukSeats(G.v); G.riders.forEach((p, k) => { p.tukSeat = seats[k] ? seats[k][0] : null; }); } else if (G.t > 70) { releaseTuk(G); G.state = 'fail'; } return; }
      if (G.state === 'held') { G.t += dt; const v = G.v; v.hold = true; if (G.riders.every((p) => p.inCar === v || p.duty !== 'leaving')) { releaseTuk(G); G.state = 'away'; G.t = 0; S.stats.tukRides++; note(`three-wheeler leaves with group ${G.id}`); } else if (G.t > 25) { releaseTuk(G); G.state = 'away'; } return; }
      if (G.state === 'away') { G.t += dt; const v = G.v; if (!v) { G.state = 'gone'; return; } const d = Math.hypot(v.x - P.x, v.z - P.z); if ((d > 70 && !T().seen(v.x, v.z)) || d > 140 || G.t > 120) { v.beforeRemove = null; for (const p of G.members) if (p.inCar === v) takeBack(p, v); v.keep = false; G.v = null; G.state = 'gone'; } return; }
    } else { // arrive
      if (G.state === 'gather') { G.t += dt; if (!G.members.some((p) => p.pending === 'arrive' && p.duty === 'off') || G.t > 30) { G.state = 'call'; G.t = 0; } return; }
      if (G.state === 'call') { const v = callTuk(G, dt); if (v) { const seats = tukSeats(v); G.riders.forEach((p, k) => { const sq = seats[k]; if (!sq) { G.walkers.push(p); return; } p.tukSeat = sq[0]; p.tukSi = sq[1]; seatCharacter(p.ch, v, sq[0]); p.ch.mesh.castShadow = false; p.ch.root.visible = true; p.inCar = v; }); } else if (G.state === 'fail') G.riders.forEach((p) => G.walkers.push(p)); return; }
      if (G.state === 'coming') { G.t += dt; if (approach(G, dt)) { G.state = 'drop'; G.t = 0; const v = G.v, Tr = T(); const rid = G.riders.filter((p) => p.inCar === v);
          v.pax = rid.map((p) => p.ch); v.paxPlan = rid.map((p) => ({ si: p.tukSi, spec: p.ch.spec, mode: 'lap' })); Tr.paxCount = (Tr.paxCount || 0) + rid.length;
          for (const p of rid) p.ch.onAlight = (wp, yw) => { p.inCar = null; arriveWalk(p, wp.x, wp.z, yw); }; Tr.disembark(v, 'calm'); G.n = rid.length; }
        else if (G.t > 70) { releaseTuk(G); for (const p of G.riders) if (p.inCar) takeBack(p, G.v), snapOn(p); G.state = 'fail'; } return; }
      if (G.state === 'drop') { G.t += dt; const v = G.v; v.hold = true; if (G.riders.every((p) => !p.inCar) || G.t > 15) { releaseTuk(G); G.state = 'away'; G.t = 0; S.stats.tukRides++; } return; }
      if (G.state === 'away') { G.t += dt; const v = G.v; if (!v || G.t > 6) { if (v) { v.keep = false; v.beforeRemove = null; } G.v = null; G.state = 'done'; } return; }
    }
  };
  S.door = { get waits() { return room.stats.lineWaits || 0; } };
  // ---- walkers (customer-compatible objects; stepped by the room's stepCustomer)
  const mkWalker = (p, x, z, yaw) => { const c = { ch: p.ch, on: true, x, z, yaw, speed: 0, gen: null, cmd: null, rnd: rng, loc: 'door', blockT: 0, seat: -1, atm: -1, win: -1, staff: p }; crew.push(c); p.walker = c; return c; };
  function* walkOffGen(p, c) { S.stats.walked++; note(`${p.role} walks home`); const dir = rng() < 0.5 ? -1 : 1; yield { walk: [[dir * 7, 1.9], [dir * 26, 1.9]] }; yield { fn: (c2, dt, m) => { if (!T() || m.t > 20) return true; const [wx, wz] = worldOf(c2); return !T().seen(wx, wz); } }; }
  function* leaveGen(p, c) {
    if (p.seatP) yield { fn: riseFn(p) };
    yield { fn: talkFn(p, BYE, BYE_BACK) };
    if (p.pre) yield { walk: p.pre }; c.phase = 'hall';
    // through the hall into the staff's line along the front window (BankInterior lines: join at the back, it moves up, the front
    // one asks for the doorway token) — five people leaving at once otherwise jam the one-person doorway with the customers
    { const from = p.pre ? p.pre[p.pre.length - 1] : [c.x, c.z]; yield* room.lineGen(c, 'staff', (spot) => hallPath(from, spot)); c.loc = 'door'; yield { walk: [DOOR_OUT, STREET_OUT] }; } c.phase = 'street';
    if (p.how === 'car') { const v = carOf(p); if (!v) note(`${p.role}: no car on the spot`); if (v) { const seat = v.driverSeat(); const [bx, bz] = boardPt(v, seat, p.ch.anim); const [lx, lz] = local(bx, bz); yield { walk: [...(p.via || []), [lx, lz]] }; yield { fn: boardFn(p, v, seat, true) }; if (c.boarded) { yield { fn: driveOffFn(p, v) }; return; } } }
    else { const G = groups[p.grp]; if (frontLane()) { if (G.state === 'idle' || G.state === 'done' || G.state === 'gone' || G.state === 'fail') { G.mode = 'leave'; G.state = 'wait'; G.t = 0; }
      const k = G.members.indexOf(p); yield { walk: [groupWait(G, k)] }; c.atKerb = true; const fr = frontLane(); const [ax, az] = evalPiece(fr.piece, fr.sDoor), [bx, bz] = evalPiece(fr.piece, fr.sDoor + 1); const [la, lb] = local(ax, az), [lc, ld] = local(bx, bz); const roadYaw = Math.atan2(lc - la, ld - lb) + Math.PI; // looking up the street for it
      yield { fn: idleFn(() => G.state === 'held' || G.state === 'fail' || G.state === 'gone', roadYaw) };
      if (G.state === 'held' && p.tukSeat) { const v = G.v; const [bx2, bz2] = boardPt(v, p.tukSeat, p.ch.anim); const [lx, lz] = local(bx2, bz2); yield { walk: [[lx, lz]] }; yield { fn: boardFn(p, v, p.tukSeat, false) }; if (c.boarded) { yield { fn: () => G.state === 'gone' || !p.inCar }; return; } } } }
    yield* walkOffGen(p, c);
  }
  function* arriveGen(p, c, via = null) {
    if (via) yield { walk: via.slice() }; // (from a car round the corner: up its kerb to the main road's pavement first)
    yield* room.lineGen(c, 'in', (spot) => [spot]); // (the arrivals' line along the shop front)
    yield { walk: [DOOR_IN] }; c.phase = 'hall'; c.loc = 'door';
    const end = p.pre ? p.pre[p.pre.length - 1] : p.standP; yield { walk: hallPath([c.x, c.z], end) };
    if (p.pre) { const back = p.pre.slice(0, -1).reverse(); back.push(p.standP || p.spotP); yield { walk: back }; }
    yield { fn: talkFn(p, HELLO, HELLO_BACK) };
    yield { fn: sitFn(p) };
    yield { fn: (c2) => { const i = crew.indexOf(c2); if (i >= 0) crew.splice(i, 1); c2.on = false; p.walker = null; snapOn(p); S.stats.arrivals++; return false; } };
  }
  const arriveWalk = (p, wx, wz, wyaw, via = null) => { const ch = p.ch; ch.root.parent?.remove(ch.root); const [lx, lz] = local(wx, wz); const c = mkWalker(p, lx, lz, wyaw - syaw()); ch.root.visible = true; ch.anim.seated = null; ch.anim.set(null); c.phase = 'street'; c.gen = arriveGen(p, c, via); place(c); };
  // ---- the shift itself
  const startLeave = (p) => { const c = mkWalker(p, ...(p.seatP || p.spotP), p.yawH); p.duty = 'leaving'; p.away = true; p.act = null; c.phase = 'desk'; c.gen = leaveGen(p, c); S.stats.leaves++; note(`${p.role} finishing for the day`); };
  const startArrive = (p) => { p.duty = 'arriving'; p.away = true; const Tr = T(); const P = game.player;
    if (p.how === 'car' && p.spot && Tr && !carOf(p) && !(Tr.parkedSet && Tr.parkedSet.has(p.spot))) { // the car comes along the kerb lane and parks on its spot
      const sp = p.spot; const ln = kerbLane(sp.x - Math.sin(sp.yaw) * 20, sp.z - Math.cos(sp.yaw) * 20, sp.yaw, 10);
      if (ln && ln.seg.id === sp.seg) { const al = (sp.x - ln.piece.p0[0]) * ln.piece.d[0] + (sp.z - ln.piece.p0[1]) * ln.piece.d[1]; const s0 = Math.max(0.6, al - 60); const [x0, z0] = evalPiece(ln.piece, s0);
        if (al - s0 > 18 && (!Tr.seen(x0, z0) || Math.hypot(x0 - P.x, z0 - P.z) > 45)) { const v = new Vehicle(p.car.type, p.car.seed, game.scene); v.paxPlan = []; v.pax = []; seatCharacter(p.ch, v, v.driverSeat()); p.ch.mesh.castShadow = false; p.ch.root.visible = true; v.driverChar = p.ch; p.inCar = v;
          if (Tr.adoptAI(v, { piece: ln.piece, s: s0, seg: ln.seg }) && Tr.parkInto(v, sp)) { v.speed = Math.min(7, v.ai.v0); v.beforeRemove = () => { takeBack(p, v); snapOn(p); }; p.ch.onAlight = (wp, yw) => { p.inCar = null; v.beforeRemove = null; p.carDay = Math.floor((Tr.gameH ?? 0) / 24); arriveWalk(p, wp.x, wp.z, yw, p.via); }; S.stats.carTrips++; note(`${p.role} drives in`); return; }
          v.driverChar = null; p.ch.root.parent?.remove(p.ch.root); p.inCar = null; const i = Tr.vehicles.indexOf(v); if (i >= 0) Tr.vehicles.splice(i, 1); v.dispose(); } } }
    // the three-wheeler brings the whole group: it is called once everybody due in it is ready (the ones starting later used to
    // reset the group and call a second one, leaving the first rider stranded in it); someone later still comes on foot
    if (p.how === 'tuk' && frontLane()) { const G = groups[p.grp]; const fresh = G.mode !== 'arrive' || G.state === 'idle' || G.state === 'done' || G.state === 'gone' || G.state === 'fail';
      if (fresh) { G.mode = 'arrive'; G.state = 'gather'; G.t = 0; G.riders = []; G.walkers = []; }
      if (G.state === 'gather' || G.state === 'call') { G.riders.push(p); return; } }
    walkIn(p); };
  const walkIn = (p) => { const dir = rng() < 0.5 ? -1 : 1; const [wx, wz] = worldOf({ x: dir * 24, z: 1.9 }); arriveWalk(p, wx, wz, syaw() - dir * Math.PI / 2); note(`${p.role} walks in`); };
  // the guard's goodnight / good morning as each one passes him
  const guardSay = (c) => { const gd = stand.guard; if (!gd || c.guardDone || c.phase !== 'hall') return; if (Math.hypot(c.x - gd.x, c.z - gd.z) > 3.2) return; c.guardDone = true; const p = c.staff; const leaving = p.duty === 'leaving';
    say(p.role, p.ch, c.x, c.z, leaving ? (rng() < 0.5 ? 'Good night, aiya!' : 'Bye aiya, see you tomorrow.') : 'Good morning, aiya!', 1.8); S.guardQ = { t: 1.1, text: `${leaving ? 'Good night' : 'Good morning'}, ${p.sexW}.`, at: c, wave: 2.2 }; };
  // called from the guard's per-frame step: true while he is turned to someone, waving
  S.guardStep = (gd, dt) => { const q = S.guardQ; if (!q) return false; q.t -= dt; if (q.t <= 0 && !q.said) { q.said = true; say('Security officer', gd.ch, gd.x, gd.z, q.text, 1.8); gd.ch.anim.set('wave'); }
    if (q.said) { q.wave -= dt; if (q.wave <= 0) { gd.ch.anim.set(null); S.guardQ = null; return false; } } const want = Math.atan2(q.at.x - gd.x, q.at.z - gd.z); gd.ch.root.rotation.y = turnTo(gd.ch.root.rotation.y, want, dt * 3); return true; };
  // the staff door: swings open (into the staff side) for anyone walking within reach of it, then closes
  const stepDoor = (dt) => { const D = staffDoor; let want = 0; for (const c of crew) if (c.on && Math.abs(c.x - D.x) < 0.9 && Math.abs(c.z - D.z) < 1.1) { want = 1; break; } const tgt = want ? -1.45 : 0; if (Math.abs(D.ang - tgt) < 1e-3) return; D.ang += Math.max(-dt * 2.4, Math.min(dt * 2.4, tgt - D.ang)); D.leaf.rotation.y = D.ang; };
  S.idle = () => !crew.length && groups.every((G) => G.state === 'idle' || G.state === 'done' || G.state === 'gone' || G.state === 'fail');
  let acc = 0, wasWant = null, t0 = 0;
  S.step = (dt, pl, plD, stepWalker) => {
    const watching = pl.inside || plD < 60; acc -= dt; const want = dutyWant();
    if (wasWant === null) { wasWant = want; for (const p of people) (want ? snapOn : snapOff)(p); }
    if (acc <= 0) { acc = 0.5; pickSpots(); for (const p of people) if (p.car) keepCar(p, p.duty === 'on' || p.duty === 'leaving');
      if (want !== wasWant) { wasWant = want; t0 = game.clock || 0; for (const p of people) p.pending = watching ? (want ? 'arrive' : 'leave') : null;
        if (!watching) for (const p of people) { if (want && p.duty === 'off') snapOn(p); if (!want && p.duty === 'on') snapOff(p); } }
      const el = (game.clock || 0) - t0;
      for (const p of people) { if (!p.pending || el < p.delay) continue; const k = p.pending; p.pending = null; if (k === 'leave' && p.duty === 'on') startLeave(p); else if (k === 'arrive' && p.duty === 'off') startArrive(p); }
      // the player walked off mid-change: finish it off screen
      if (!pl.inside && plD > 160 && !S.idle()) { for (const G of groups) { if (G.v) { const v = G.v; v.beforeRemove = null; for (const p of G.members) if (p.inCar === v) takeBack(p, v); releaseTuk(G); v.keep = false; G.v = null; } G.state = 'idle'; }
        for (const c of crew.slice()) { const p = c.staff; c.on = false; if (p.inCar) takeBack(p, p.inCar); (want ? snapOn : snapOff)(p); } crew.length = 0; for (const p of people) { p.pending = null; if (p.duty === 'arriving') (p.inCar ? (takeBack(p, p.inCar), snapOn(p)) : snapOn(p)); } }
      for (const G of groups) if (G.mode === 'arrive' && G.state === 'fail' && G.walkers && G.walkers.length) { const w = G.walkers.splice(0); for (const p of w) if (p.duty === 'arriving' && !p.walker && !p.inCar) walkIn(p); }
      for (const G of groups) if (G.mode === 'arrive' && G.walkers && G.walkers.length && G.state !== 'call') { const w = G.walkers.splice(0); for (const p of w) if (p.duty === 'arriving' && !p.walker && !p.inCar) walkIn(p); }
    }
    if (S.idle()) { if (staffDoor.ang !== 0) stepDoor(dt); return; }
    for (const G of groups) stepGroup(G, dt);
    for (const c of crew.slice()) { if (!c.on) { const i = crew.indexOf(c); if (i >= 0) crew.splice(i, 1); const p = c.staff; if (p.walker === c) { p.walker = null; if (p.duty === 'leaving') { if (p.inCar) continue; snapOff(p); } } continue; } guardSay(c); const wk = c.cmd && c.cmd.walk; if (wk && c.speed < 0.05) c.stuckT = (c.stuckT || 0) + dt; else c.stuckT = 0; if (c.stuckT > 12) { c.stuckT = 0; c.ghostT = 1.6; S.door.ghosts = (S.door.ghosts || 0) + 1; } if (c.ghostT > 0) c.ghostT -= dt; stepWalker(c, dt, pl); }
    for (const p of people) if (p.waveT > 0 && (p.waveT -= dt) <= 0) p.ch.anim.set(null);
    stepDoor(dt);
  };
  S.leaveNow = () => { S.force = false; acc = 0; }; S.arriveNow = () => { S.force = true; acc = 0; }; S.release = () => { S.force = null; }; // tests: as if the hour had just turned
  void stepCustomer; void hide; void visibleOn; void staffSideX; void B;
  return S;
}
