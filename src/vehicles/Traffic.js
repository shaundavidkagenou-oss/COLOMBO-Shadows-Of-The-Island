// AI traffic on the left-hand road grid: lanes, junction turns, signals, car-following (IDM), yielding to pedestrians,
// horns, parked cars, and spawning/despawning around the player.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { plan } from '../world/CityPlan.js';
import { Vehicle } from './Vehicle.js';
import { VTYPES } from './VehicleModels.js';
import { RNG } from '../core/rng.js';
import { clamp, lerp } from '../core/math.js';
import { Character, randomSpec } from '../actors/Character.js';
import { seatCharacter, doorPath } from '../actors/Seating.js';
import { parkOnStand } from './Kickstand.js';

// passengers per vehicle type: [count, weight] (the driver is always present)
const PAX = { car: [[0, 5], [1, 3], [2, 1.5], [3, 0.8]], sedan: [[0, 5], [1, 3], [2, 1]], taxi: [[0, 2], [1, 4], [2, 2]], suv: [[0, 3], [1, 3], [2, 2], [3, 1]], van: [[0, 3], [1, 2], [2, 2], [4, 1]],
  tuktuk: [[0, 3], [1, 4], [2, 3]], bike: [[0, 6], [1, 4]], lorry: [[0, 3], [1, 2]], bus: [[6, 1], [10, 2], [16, 2], [22, 1]], pbus: [[8, 1], [14, 2], [20, 2], [26, 1]] };
export const TOW_DIST = 150, TOW_TIME = 300; // a vehicle the player left behind is towed after 5 min with the player beyond 150 m
const PAX_NEAR = 90, PAX_FAR = 120, PAX_CAP = 60; // passengers exist only near the player (LOD); total cap

const V0 = [13.5, 12, 9, 6.5];
const MIX = {
  default: [['tuktuk', 34], ['car', 22], ['sedan', 6], ['van', 10], ['bike', 12], ['bus', 5], ['pbus', 4], ['lorry', 3], ['taxi', 4]],
  port: [['lorry', 30], ['van', 15], ['tuktuk', 20], ['car', 15], ['bike', 10], ['bus', 3]],
  cinnamon: [['car', 30], ['sedan', 18], ['van', 12], ['tuktuk', 22], ['bike', 8], ['suv', 4], ['taxi', 6]],
};

function laneOffset(seg, lane) { return seg.level <= 1 ? 1.8 + lane * 3.2 : seg.level === 2 ? seg.hw * 0.5 : seg.hw * 0.48; }
function nodeClear(node, dir) { const h = dir === 'v' ? node.hwH : node.hwV; return h > 0 ? h + 1.2 : 0; }
function otherEnd(seg, node) { const a = L.nodeAt(seg.i, seg.j); if (seg.dir === 'v') { const b = L.nodeAt(seg.i, seg.j + 1); return a.id === node.id ? b : a; } const b = L.nodeAt(seg.i + 1, seg.j); return a.id === node.id ? b : a; }
function segNodes(seg) { return seg.dir === 'v' ? [L.nodeAt(seg.i, seg.j), L.nodeAt(seg.i, seg.j + 1)] : [L.nodeAt(seg.i, seg.j), L.nodeAt(seg.i + 1, seg.j)]; }

function linePiece(seg, from, to, lane) {
  const dx = Math.sign(to.x - from.x), dz = Math.sign(to.z - from.z); const nx = dz, nz = -dx; const off = laneOffset(seg, lane);
  const c0 = nodeClear(from, seg.dir), c1 = nodeClear(to, seg.dir);
  const p0 = [from.x + dx * c0 + nx * off, from.z + dz * c0 + nz * off], p1 = [to.x - dx * c1 + nx * off, to.z - dz * c1 + nz * off];
  return { type: 'line', seg, from, to, lane, p0, p1, d: [dx, dz], len: Math.max(0.1, Math.hypot(p1[0] - p0[0], p1[1] - p0[1])) };
}
function curvePiece(a, b, node) {
  const p0 = a.p1, p1 = b.p0, d0 = a.d, d1 = b.d; let c;
  const den = d0[0] * d1[1] - d0[1] * d1[0];
  if (Math.abs(den) < 1e-3) c = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  else { const t = ((p1[0] - p0[0]) * d1[1] - (p1[1] - p0[1]) * d1[0]) / den; c = [p0[0] + d0[0] * t, p0[1] + d0[1] * t]; }
  let len = 0, px = p0[0], pz = p0[1]; for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; const x = u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], z = u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]; len += Math.hypot(x - px, z - pz); px = x; pz = z; }
  const turn = Math.abs(den) > 0.5 ? (den > 0 ? 'right' : 'left') : d0[0] * d1[0] + d0[1] * d1[1] < 0 ? 'uturn' : 'straight';
  return { type: 'curve', p0, p1, c, len: Math.max(0.1, len), node, turn };
}
function evalPiece(p, s) {
  const t = clamp(s / p.len, 0, 1);
  if (p.type === 'line') return [lerp(p.p0[0], p.p1[0], t), lerp(p.p0[1], p.p1[1], t), Math.atan2(p.d[0], p.d[1])];
  const u = 1 - t; const x = u * u * p.p0[0] + 2 * u * t * p.c[0] + t * t * p.p1[0], z = u * u * p.p0[1] + 2 * u * t * p.c[1] + t * t * p.p1[1];
  const tx = 2 * u * (p.c[0] - p.p0[0]) + 2 * t * (p.p1[0] - p.c[0]), tz = 2 * u * (p.c[1] - p.p0[1]) + 2 * t * (p.p1[1] - p.c[1]);
  return [x, z, Math.atan2(tx, tz)];
}

// 2D oriented-box overlap (separating axes); hw/hl = half width / half length, yaw 0 faces +z
function obbHit(ax, az, ay, ahw, ahl, bx, bz, by, bhw, bhl) {
  const a1 = [Math.sin(ay), Math.cos(ay)], b1 = [Math.sin(by), Math.cos(by)], dx = bx - ax, dz = bz - az;
  for (const n of [a1, [a1[1], -a1[0]], b1, [b1[1], -b1[0]]]) {
    const ra = Math.abs(a1[0] * n[0] + a1[1] * n[1]) * ahl + Math.abs(a1[1] * n[0] - a1[0] * n[1]) * ahw;
    const rb = Math.abs(b1[0] * n[0] + b1[1] * n[1]) * bhl + Math.abs(b1[1] * n[0] - b1[0] * n[1]) * bhw;
    if (Math.abs(dx * n[0] + dz * n[1]) > ra + rb) return false;
  }
  return true;
}
export class Traffic {
  constructor(scene, collision, events) {
    this.scene = scene; this.collision = collision; this.events = events; this.vehicles = []; this.parked = []; this.rng = new RNG(777);
    this.max = 40; this.simTime = 0; this.res = new Map(); this.driverSpecs = []; for (let i = 0; i < 16; i++) this.driverSpecs.push(randomSpec(5000 + i * 13, { sex: i % 5 === 0 ? 'f' : 'm', age: 'adult' }));
    this.paxCount = 0; this.leaving = []; this.crowd = null; this.parkedTimer = 0; this.drivableSegs = L.segments.filter((s) => !s.crossing || s.level <= 2); this.drivable = new Set(this.drivableSegs); this.emergency = [];
  }
  setDensity(d) { this.max = Math.round(10 + d * 45); }
  all() { const o = this.obstacles; if (!this.parked.length && !(o && o.length)) return this.vehicles; return o && o.length ? this.vehicles.concat(this.parked, o) : this.vehicles.concat(this.parked); } // obstacles = train cars (solid, not enterable)
  pickType(x, z) { const d = L.districtIdAt(x, z); const night = this.night > 0.6; const mix = MIX[d] || MIX.default; const m = night ? mix.map(([t, w]) => [t, t === 'bus' || t === 'pbus' ? w * 0.4 : w]) : mix; return this.rng.weighted(m); }
  spawn(focus, camDir, forceNear = false) {
    for (let tries = 0; tries < 12; tries++) {
      const seg = this.drivableSegs[Math.floor(this.rng.next() * this.drivableSegs.length)];
      const mx = (seg.x0 + seg.x1) / 2, mz = (seg.z0 + seg.z1) / 2; const d = Math.hypot(mx - focus.x, mz - focus.z);
      if (d > (forceNear ? 140 : 260) || d < (forceNear ? 25 : 70)) continue;
      // avoid spawning in plain view nearby
      if (!forceNear && d < 160 && camDir) { const dot = ((mx - focus.x) * camDir.x + (mz - focus.z) * camDir.z) / d; if (dot > 0.5) continue; }
      const [a, b] = segNodes(seg); const fwd = this.rng.chance(0.5); const from = fwd ? a : b, to = fwd ? b : a;
      const lanes = seg.level <= 1 ? 2 : 1; const lane = Math.floor(this.rng.next() * lanes);
      const type = this.pickType(mx, mz); if (seg.level >= 3 && (type === 'bus' || type === 'pbus' || type === 'lorry')) continue;
      const piece = linePiece(seg, from, to, lane); const s = this.rng.range(0, piece.len * 0.8);
      const [x, z, yaw] = evalPiece(piece, s);
      if (this.vehicles.some((v) => (v.x - x) ** 2 + (v.z - z) ** 2 < 14 * 14)) continue;
      if (this.player && this.player.vehicle && (this.player.vehicle.x - x) ** 2 + (this.player.vehicle.z - z) ** 2 < 15 * 15) continue;
      const v = new Vehicle(type, Math.floor(this.rng.next() * 1e6), this.scene); v.place(x, z, yaw);
      const T = VTYPES[type]; v.ai = { pieces: [piece], s, v0: Math.min(V0[seg.level], T.maxSpeed * 0.42) * this.rng.range(0.88, 1.12), stuck: 0, honkCd: 0, bumped: 0, aggressive: type === 'tuktuk' || type === 'pbus' ? 1.3 : 1 };
      v.speed = v.ai.v0 * 0.7; this.extend(v); this.addDriver(v); this.vehicles.push(v); return v;
    }
    return null;
  }
  addDriver(v) {
    const spec = this.driverSpecs[v.id % this.driverSpecs.length]; const ch = new Character(spec); const seat = v.driverSeat();
    seatCharacter(ch, v, seat); ch.mesh.castShadow = false; v.driverChar = ch; v.animAcc = 0;
    // passenger plan: which seats are taken and by whom (created lazily when the vehicle is near the player)
    const r = new RNG(v.id * 7919 + 13); const free = v.mesh.userData.seats.map((q, i) => i).filter((i) => !v.mesh.userData.seats[i].driver);
    const n = Math.min(free.length, r.weighted(PAX[v.type] || [[0, 1]])); const plan = [];
    for (let k = 0; k < n; k++) { const j = Math.floor(r.next() * free.length); const si = free.splice(j, 1)[0]; plan.push({ si, spec: randomSpec(90000 + v.id * 41 + k * 7, { age: 'adult' }), mode: r.weighted([['lap', 5], ['phone', 2], ['window', 2]]) }); }
    v.paxPlan = plan; v.pax = [];
  }
  // create / drop passengers by distance (LOD) and keep their pose animating at a distance-dependent rate
  updateOccupants(v, dt, focus) {
    const d = Math.hypot(v.x - focus.x, v.z - focus.z); const seats = v.mesh.userData.seats;
    if (v.paxPlan && v.paxPlan.length && !v.pax.length && d < PAX_NEAR && this.paxCount + v.paxPlan.length <= PAX_CAP && !v.disembarking) {
      for (const p of v.paxPlan) { const ch = new Character(p.spec); seatCharacter(ch, v, seats[p.si], p.mode); ch.mesh.castShadow = d < 40; v.pax.push(ch); }
      this.paxCount += v.pax.length;
    } else if (v.pax && v.pax.length && d > PAX_FAR && !v.disembarking && !v.police) this.dropPax(v);
    // pose update rate: every frame near, 5 Hz mid-range, frozen far away (the seated pose stays valid)
    const rate = d < 35 ? 0 : d < 90 ? 0.2 : Infinity; v.animAcc = (v.animAcc || 0) + dt; if (v.animAcc < rate) return; const step = v.animAcc; v.animAcc = 0;
    const steer = v.steer / (v.T.steer || 0.5); const acc = (v.speed - (v.lastSpeed ?? v.speed)) / Math.max(step, 1e-3); v.lastSpeed = v.speed;
    const upd = (ch) => { const A = ch.anim; A.steer = steer; A.vehSpeed = v.speed; A.brakeLean = clamp(-acc * 0.012, -0.06, 0.08); A.cornerLean = clamp(-steer * v.speed * 0.004, -0.06, 0.06); A.update(Math.min(step, 0.25), 0); };
    if (v.driverChar) upd(v.driverChar); if (v.pax) for (const ch of v.pax) upd(ch);
  }
  dropPax(v) { for (const ch of v.pax) { ch.root.parent?.remove(ch.root); ch.dispose(); } this.paxCount -= v.pax.length; v.pax = []; }
  // passengers climb out (staged, no teleport): slide from the seat to their door spot while standing up, then walk off
  disembark(v, reason = 'flee', from = null) {
    if (!v.pax || !v.pax.length) { v.paxPlan = []; return; } const seats = v.mesh.userData.seats;
    v.disembarking = v.pax.map((ch, i) => ({ ch, seat: seats[v.paxPlan[i].si], t: -i * 0.35 })); this.paxCount -= v.pax.length; v.pax = []; v.paxPlan = []; v.paxReason = reason; v.paxFrom = from;
    if (!this.leaving.includes(v)) this.leaving.push(v);
  }
  updateDisembark(dt) {
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const v = this.leaving[i]; const list = v.disembarking || [];
      for (const o of list) {
        if (o.done) continue; o.t += dt; const A = o.ch.anim; if (o.t < 0) { A.update(dt, 0); continue; }
        const k = Math.min(1, o.t / 0.9), sm = k * k * (3 - 2 * k); const ex = o.seat.exit || [Math.sign(o.seat.x || 1) * (v.T.wid / 2 + 0.6), o.seat.z];
        const dp = doorPath(o.seat, ex, k, v.T.wid / 2); o.ch.root.position.set(dp.x, dp.y, dp.z); void sm;
        o.ch.root.rotation.y = lerp(0, Math.atan2(ex[0] - o.seat.x, ex[1] - o.seat.z), Math.min(1, dp.a + dp.b)); A.sitIn(o.seat, Math.max(0.001, dp.sitW), null); A.duck = (o.seat.roof ?? 9) < 2.4 ? Math.min(1, (1 - dp.b) * 1.6) * Math.min(1, dp.a * 2.5) : 0; if (k >= 1) A.duck = 0; A.update(dt, k > 0.5 ? 1.0 : 0);
        if (k >= 1) { o.done = true; A.standUp(); v.mesh.updateMatrixWorld(); const wp = new THREE.Vector3(ex[0], 0, ex[1]).applyMatrix4(v.mesh.matrixWorld); v.mesh.remove(o.ch.root);
          if (this.crowd) this.crowd.adopt(o.ch, wp.x, wp.z, v.yaw + o.ch.root.rotation.y, v.paxReason, v.paxFrom); else o.ch.dispose(); }
      }
      if (list.every((o) => o.done)) { v.disembarking = null; this.leaving.splice(i, 1); }
    }
  }
  extend(v) { // make sure at least line + curve + next line exist
    const ai = v.ai; let last = ai.pieces[ai.pieces.length - 1];
    while (ai.pieces.length < 3) {
      if (last.type === 'line') {
        const node = last.to; let opts = node.segs.filter((s) => s !== last.seg && !(s.level >= 3 && (v.type === 'bus' || v.type === 'pbus' || v.type === 'lorry')));
        opts = opts.filter((s) => { const o = otherEnd(s, node); return o.x > L.BOUNDS.minX + 10 && o.x < L.BOUNDS.maxX - 10 && o.z > L.BOUNDS.minZ + 10 && o.z < L.BOUNDS.maxZ - 10; });
        let next = null;
        if (ai.route && ai.route.length) { const want = ai.route[0]; next = node.segs.find((s) => otherEnd(s, node) === want && this.drivable.has(s)) || null; if (next) ai.route.shift(); else ai.route = null; } // planned route (police units)
        if (next) {} else if (!opts.length) next = last.seg; else next = this.rng.weighted(opts.map((s) => [s, (s.dir === last.seg.dir ? 2.2 : 1) * (s.level <= last.seg.level ? 1.3 : 0.7)]));
        const to = otherEnd(next, node); const lanes = next.level <= 1 ? 2 : 1; const lane = Math.min(lanes - 1, last.lane);
        const nl = linePiece(next, node, to, lane);
        ai.pieces.push(curvePiece(last, nl, node)); ai.pieces.push(nl); last = nl;
        if (ai.goal && !ai.goal.piece && nl.seg === ai.goal.seg && nl.from === ai.goal.from) ai.goal.piece = nl;
      } else break;
    }
  }
  update(dt, focus, camDir, simTime, pedsNear, player) {
    this.fN = (this.fN | 0) + 1;
    this.simTime = simTime; this.player = player;
    // spawn / despawn
    for (let i = this.vehicles.length - 1; i >= 0; i--) { const v = this.vehicles[i]; const d = Math.hypot(v.x - focus.x, v.z - focus.z); if (d > 330 && !v.keep) { this.remove(v); this.vehicles.splice(i, 1); } }
    let budget = 2; while (this.vehicles.length < this.max && budget-- > 0) this.spawn(focus, camDir, this.vehicles.length < this.max * 0.4);
    this.updateParked(dt, focus);
    // spatial bins for following
    const all = this.vehicles; const playerV = player && player.vehicle; this.emergency = all.filter((v) => v.ai && v.ai.emergency && v.beaconsOn);
    for (const v of all) this.step(v, dt, all, pedsNear, playerV, player);
    for (const v of all) if (v.towing) this.hitch(v);
    for (const v of this.parked) if (v.free) this.stepFree(v, dt);
    for (const v of all) if (v.driverChar || (v.pax && v.pax.length)) this.updateOccupants(v, dt, focus);
    if (playerV && playerV.pax && playerV.pax.length) this.updateOccupants(playerV, dt, focus);
    this.updateDisembark(dt);
  }
  step(v, dt, all, peds, playerV, player) {
    if (v.free) { this.stepFree(v, dt); return; }
    const ai = v.ai; if (!ai) return; if (ai.stopped) { v.speed = 0; v.brake = true; return; } const p = ai.pieces[0]; // stopped = crew out of a police unit (handbrake on, nobody at the wheel)
    const [fx, fz] = [Math.sin(v.yaw), Math.cos(v.yaw)];
    // --- leader gap
    let gap = 60, leadV = 0; if (v.hold) gap = -1; // player is getting in: brake to a stop
    const consider = (ox, oz, ov, len, latTol) => {
      const rx = ox - v.x, rz = oz - v.z; const along = rx * fx + rz * fz; if (along <= 0 || along > 45) return;
      const lat = Math.abs(rx * fz - rz * fx); if (lat > latTol) return; const g = along - v.half - len; if (g < gap) { gap = g; leadV = ov; }
    };
    let leadCiv = false; for (const o of all) { if (o === v) continue; if (Math.abs(o.x - v.x) > 45 || Math.abs(o.z - v.z) > 45) continue; const ofx = Math.sin(o.yaw), ofz = Math.cos(o.yaw); const sameDir = ofx * fx + ofz * fz; const g0 = gap; consider(o.x, o.z, Math.max(0, o.speed * sameDir), o.half, sameDir > 0.3 ? 1.7 : 1.2); if (gap < g0) leadCiv = !o.isTrain && !(o.ai && o.ai.emergency) && sameDir > 0.3; }
    // emergency unit (lights on): overtake slow traffic through the centre of the road; civilians ahead pull over and slow down
    const em = ai.emergency && v.beaconsOn; ai.lat = ai.lat || 0; let latWant = 0;
    if (em) {
      if (leadCiv && gap < 22) ai.overT = 2.5; else ai.overT = Math.max(0, (ai.overT || 0) - dt);
      if (ai.overT > 0 || Math.abs(ai.lat) > 0.5) { const bx = v.x - fz * ai.lat, bz = v.z + fx * ai.lat; let blocked = false; for (const o of all) { if (o === v || (o.ai && o.ai.emergency)) continue; const rx = o.x - bx, rz = o.z - bz; const al = rx * fx + rz * fz; if (al < -7 || al > 14) continue; if (Math.abs(rx * fz - rz * fx) < 1.7) { blocked = true; break; } } if (blocked) ai.overT = Math.max(ai.overT, 0.6); }
      latWant = ai.overT > 0 ? -(p.type === 'line' && p.seg.level >= 2 ? 2.6 : 3.3) : 0;
    } else if (this.emergency.length) {
      for (const e of this.emergency) { if (e === v) continue; const rx = v.x - e.x, rz = v.z - e.z; const efx = Math.sin(e.yaw), efz = Math.cos(e.yaw); const al = rx * efx + rz * efz; if (al > 0 && al < 38 && Math.abs(rx * efz - rz * efx) < 2.6 && efx * fx + efz * fz > 0.5) { ai.yieldT = 2.5; break; } }
    }
    if (ai.yieldT > 0) { ai.yieldT -= dt; latWant = 0.9; }
    // kerb-parked cars stick into narrow lanes: pull out toward the centre line to pass them when the oncoming side is clear, otherwise wait behind
    if (!em && !(ai.yieldT > 0)) { let need = 0, pk = null; const w2 = v.T.wid / 2;
      // every parked / abandoned vehicle by its real (rotated) footprint: kerb-side ones are passed by pulling out, anything else
      // standing in the lane (a car the player left in the road, one knocked askew) is waited behind — never driven through
      for (const o of this.parked) { if (o.dead || o.disposed || o.towedBy) continue; const rx = o.x - v.x, rz = o.z - v.z; if (Math.abs(rx) > 30 || Math.abs(rz) > 30) continue;
        const ofx = Math.sin(o.yaw), ofz = Math.cos(o.yaw), ohl = o.T.len / 2, ohw = o.T.wid / 2; let lmin = 1e9, lmax = -1e9, amin = 1e9, amax = -1e9;
        for (let c = 0; c < 4; c++) { const cl = c & 1 ? ohl : -ohl, cw = c & 2 ? ohw : -ohw; const qx = rx + ofx * cl + ofz * cw, qz = rz + ofz * cl - ofx * cw; const al = qx * fx + qz * fz, lt = qx * fz - qz * fx + ai.lat; if (al < amin) amin = al; if (al > amax) amax = al; if (lt < lmin) lmin = lt; if (lt > lmax) lmax = lt; }
        if (amax < -v.half || amin > 26) continue; if (lmax < -(w2 + 0.3) || lmin > w2 + 0.35) continue; // clear of our path
        if (lmin + lmax > 0.2) { const n = w2 + 0.35 - lmin; if (n > need) { need = n; pk = o; } }
        else if (amin > v.half * 0.3) { const g = amin - v.half; if (g < gap) { gap = g; leadV = 0; } } }
      if (pk) { let blocked = need > 2.6; if (!blocked) for (const o of all) { if (o === v) continue; const rx = o.x - v.x, rz = o.z - v.z; const al = rx * fx + rz * fz; if (al < -5 || al > 32) continue; const lo = rx * fz - rz * fx + ai.lat; if (lo < 0 && lo > -need - w2 - o.T.wid / 2 - 0.3 && (Math.sin(o.yaw) * fx + Math.cos(o.yaw) * fz) < 0.3) { blocked = true; break; } }
        if (blocked && Math.abs(ai.lat) < need * 0.6) consider(pk.x, pk.z, 0, pk.half, 4.5); else latWant = Math.min(latWant, -need); }
    }
    ai.lat += clamp(latWant - ai.lat, -2.2 * dt, 2.2 * dt);
    // --- footprint conflicts (junctions, turning across another lane): predict both bodies 0.4–1.2 s ahead; if they would touch,
    // give way to whoever is already in the way, comes from the right (left-hand traffic), or is the emergency unit. A short timeout
    // prevents four-way deadlocks (the yielder creeps on and the others' own checks then hold them).
    if (!em && !this.noConflict) { let conf = Infinity; const myS = Math.max(v.speed, 2.5); const fresh = ((this.fN | 0) + v.id) % 2 === 0; if (!fresh) conf = ai.conf ?? Infinity; /* recomputed on alternate frames */
      if (fresh) for (const o of all) { if (o === v || o.isTrain || o.parked || o.dead) continue; const rx = o.x - v.x, rz = o.z - v.z; if (Math.abs(rx) > 16 || Math.abs(rz) > 16) continue;
        const along = rx * fx + rz * fz; if (along < 0) continue; const ofx = Math.sin(o.yaw), ofz = Math.cos(o.yaw); if (ofx * fx + ofz * fz > 0.85 && Math.abs(rx * fz - rz * fx) < 1.7) continue; // same lane: the leader gap handles it
        for (const t of [0.4, 0.8, 1.2]) { const os = o.speed * t, ms = myS * t;
          if (obbHit(v.x + fx * ms, v.z + fz * ms, v.yaw, v.T.wid / 2 + 0.25, v.half + 0.3, o.x + ofx * os, o.z + ofz * os, o.yaw, o.T.wid / 2 + 0.25, o.half + 0.3)) {
            const right = (rx * fz - rz * fx) < 0; /* oncoming traffic: only the vehicle turning across it gives way */ const oEm = o.ai && o.ai.emergency && o.beaconsOn; const inWay = obbHit(v.x + fx * 1.5, v.z + fz * 1.5, v.yaw, v.T.wid / 2, v.half, o.x, o.z, o.yaw, o.T.wid / 2, o.half);
            if (inWay || oEm || o === playerV || (right && (ofx * fx + ofz * fz > -0.5 || p.type === 'curve')) || (!o.ai && o.speed < 0.5)) conf = Math.min(conf, Math.max(0.3, along - v.half - o.half));
            break; } } }
      if (fresh) ai.conf = conf;
      if (conf < Infinity) { ai.confT = (ai.confT || 0) + dt; if (ai.confT < 4) { if (conf < gap) { gap = conf; leadV = 0; } } else if (ai.confT > 5.5) ai.confT = 0; } else ai.confT = 0;
    }
    if (playerV) consider(playerV.x, playerV.z, Math.max(0, playerV.speed * (Math.sin(playerV.yaw) * fx + Math.cos(playerV.yaw) * fz)), playerV.half, 1.9);
    else if (player) consider(player.x, player.z, 0, 0.4, 1.9);
    if (peds) for (const q of peds) consider(q.x, q.z, 0, 0.4, q.crossing ? 2.6 : 1.4);
    // --- junction control
    let stopAt = Infinity;
    if (p.type === 'line') {
      const rem = p.len - ai.s; const node = p.to; const next = ai.pieces[1];
      if (em) {} // responding units with lights on proceed through signals and junctions (slowed by the curve speed)
      else if (node.signal && node.hwH > 0 && node.hwV > 0) {
        const st = L.signalState(node, p.seg.dir, this.simTime);
        if (st === 'red' || (st === 'yellow' && rem > v.speed * 1.2 + 4)) stopAt = rem - 0.5;
      } else if (next && next.type === 'curve' && node.segs.length >= 3) {
        const myLevel = p.seg.level; const crossMin = Math.min(...node.segs.filter((s) => s.dir !== p.seg.dir).map((s) => s.level), 9);
        const r = this.res.get(node.id); const busy = r && r.id !== v.id && this.simTime - r.t < 3.5;
        if (busy || (myLevel > crossMin && rem < 14 && v.speed > 4)) { if (busy) stopAt = rem - 0.5; }
        if (rem < 6 && !busy) this.res.set(node.id, { id: v.id, t: this.simTime });
      }
    } else if (p.type === 'curve') this.res.set(p.node.id, { id: v.id, t: this.simTime });
    if (this.rail) { const d = this.rail.stopDistance(v); if (d < stopAt) stopAt = d; }
    if (ai.goal && ai.goal.piece) { const k = ai.pieces.indexOf(ai.goal.piece); if (k >= 0) { let dist = -ai.s; for (let q = 0; q < k; q++) dist += ai.pieces[q].len; dist += ai.goal.s; ai.goal.dist = dist; if (dist < stopAt && !ai.goal.soft) stopAt = Math.max(-1, dist); } } // soft goal = moving target (pursuit): steer there without braking for it // level crossing: lamps flashing / booms down
    // --- IDM
    const nextCurve = p.type === 'line' ? ai.pieces[1] : p; const curveV = nextCurve && nextCurve.type === 'curve' && nextCurve.turn !== 'straight' ? (nextCurve.turn === 'uturn' ? 3 : 6.5) : ai.v0;
    let v0 = ai.v0; if (p.type === 'curve') v0 = curveV; else if (p.len - ai.s < 25) v0 = Math.min(v0, lerp(curveV, ai.v0, (p.len - ai.s) / 25));
    if (this.weatherRain) v0 *= 1 - this.weatherRain * 0.2;
    if (ai.yieldT > 0) v0 = Math.min(v0, 2.5);
    const s0 = 2.2, T = 1.2 / ai.aggressive, a = v.T.accel * 0.8, b = 3.5; const sp = v.speed;
    const g2 = Math.min(gap, stopAt); const lv = stopAt < gap ? 0 : leadV;
    const sStar = s0 + Math.max(0, sp * T + (sp * (sp - lv)) / (2 * Math.sqrt(a * b)));
    let acc = a * (1 - Math.pow(sp / Math.max(v0, 0.1), 4) - Math.pow(sStar / Math.max(g2, 0.1), 2));
    if (ai.bumped > 0) { ai.bumped -= dt; acc = -8; }
    acc = clamp(acc, -9, a);
    v.speed = Math.max(0, sp + acc * dt); v.brake = acc < -1.0 || v.speed < 0.2;
    // horn when blocked by something other than a red light
    ai.honkCd -= dt;
    if (v.speed < 0.5 && gap < 8 && stopAt === Infinity) { ai.stuck += dt; if (ai.stuck > 2.5 / ai.aggressive && ai.honkCd <= 0) { ai.honkCd = 3 + this.rng.next() * 4; this.events.emit('horn', v); } } else ai.stuck = Math.max(0, ai.stuck - dt);
    if (ai.stuck > 25 && !v.police) { v.keep = false; this.remove(v); this.vehicles.splice(this.vehicles.indexOf(v), 1); return; } // hopelessly stuck → recycle out of view
    // --- advance along pieces
    ai.s += v.speed * dt;
    while (ai.s > ai.pieces[0].len) { ai.s -= ai.pieces[0].len; ai.pieces.shift(); this.extend(v); }
    const [x, z, yaw] = evalPiece(ai.pieces[0], ai.s);
    const dyaw = Math.atan2(Math.sin(yaw - v.yaw), Math.cos(yaw - v.yaw)); v.steer = clamp(dyaw * 4, -0.6, 0.6);
    const lx = Math.cos(yaw) * ai.lat, lz = -Math.sin(yaw) * ai.lat; v.x = x + lx; v.z = z + lz; v.yaw = yaw;
    if (ai.kx !== undefined) { const e = Math.exp(-1.1 * dt); ai.kx *= e; ai.kz *= e; ai.kyaw *= e; v.x += ai.kx; v.z += ai.kz; v.yaw += ai.kyaw; if (Math.abs(ai.kx) + Math.abs(ai.kz) + Math.abs(ai.kyaw) < 0.02) ai.kx = ai.kz = ai.kyaw = undefined; } /* after a knock: ease back into the lane instead of snapping */
    v.y = L.groundY(v.x, v.z); v.lights = this.night > 0.4; v.sync(dt);
  }
  // a car knocked out of its lane by a collision: slides with tyre friction, spins down, bounces off walls; then the driver collects themselves and eases back into the lane
  stepFree(v, dt) {
    const f = v.free; const sp = Math.hypot(f.vx, f.vz); const dec = 7.5 * dt; /* locked/scrubbing tyres ≈ 0.75 g */
    if (sp > dec) { f.vx -= f.vx / sp * dec; f.vz -= f.vz / sp * dec; } else { f.vx = 0; f.vz = 0; }
    f.spin *= Math.exp(-2.6 * dt); if (Math.abs(f.spin) < 0.03) f.spin = 0;
    v.x += f.vx * dt; v.z += f.vz * dt; v.yaw += f.spin * dt; v.speed = 0; v.brake = true;
    for (const [cx, cz] of v.circles()) { const r = this.collision.resolveCircle(cx, cz, v.radius, v.y, 0.25, 2, { vehicle: true }); if (r.hit) { const dx = r.x - cx, dz = r.z - cz, dl = Math.hypot(dx, dz) || 1; v.x += dx; v.z += dz; const vn = (f.vx * dx + f.vz * dz) / dl; if (vn < 0) { f.vx -= dx / dl * vn * 1.2; f.vz -= dz / dl * vn * 1.2; v.impact(-vn); } } }
    v.y = L.groundY(v.x, v.z); v.sync(dt);
    if (Math.hypot(f.vx, f.vz) < 0.15 && f.spin === 0) f.rest += dt; else f.rest = 0;
    if (f.rest < 1.2 + Math.min(5, f.sev * 0.35)) return;
    const ai = v.ai; if (!ai) { v.free = null; return; } /* parked car: stays where it was pushed */
    // re-anchor on the lane: nearest arc-length on the current piece; the offset decays smoothly in step()
    const pc = ai.pieces[0]; let bestS = ai.s, bd = Infinity; for (let s2 = Math.max(0, ai.s - 12); s2 <= Math.min(pc.len, ai.s + 12); s2 += 0.5) { const [x, z] = evalPiece(pc, s2); const d = (x - v.x) ** 2 + (z - v.z) ** 2; if (d < bd) { bd = d; bestS = s2; } }
    if (bd > 36) { const P = this.player; if (P && Math.hypot(P.x - v.x, P.z - v.z) > 90) { this.remove(v); const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1); } return; } /* thrown far off the road: stays as a stalled car until you are well away */
    ai.s = bestS; const [x, z, yaw] = evalPiece(pc, bestS); const lx = Math.cos(yaw) * ai.lat, lz = -Math.sin(yaw) * ai.lat; ai.kx = v.x - (x + lx); ai.kz = v.z - (z + lz); ai.kyaw = Math.atan2(Math.sin(v.yaw - yaw), Math.cos(v.yaw - yaw)); v.free = null; ai.bumped = 1;
  }
  remove(v) { if (v.towing) { v.towing.dispose(); v.towing = null; } if (v.squad && v.driverChar) { v.mesh.remove(v.driverChar.root); v.driverChar = null; const m = v.squad; v.squad = null; if (v.onRemove) v.onRemove(m); } /* a squad-mate at the wheel is never disposed */ if (v.driverChar) { v.driverChar.dispose(); } if (v.pax && v.pax.length) this.dropPax(v); v.dispose(); }
  // Hand a vehicle over to the player (car-jack: driver steps out and walks off grumbling)
  takeOver(v, keepDriver = false) { const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1); const pi = this.parked.indexOf(v); if (pi >= 0) this.parked.splice(pi, 1); const hadDriver = !!v.driverChar; this.disembark(v, 'flee', this.player ? { x: this.player.x, z: this.player.z } : null); if (v.driverChar && !keepDriver) { v.mesh.remove(v.driverChar.root); v.driverChar.dispose(); v.driverChar = null; } v.ai = null; v.hold = false; v.parked = false; v.keep = true; v.left = null; if (v.spot) { this.parkedSet && this.parkedSet.delete(v.spot); v.spot = null; } return hadDriver; }
  // the player got out / was taken out of a vehicle: it stays exactly where it was left (never culled by distance); with
  // `tow` it is towed once the player has been more than TOW_DIST away for TOW_TIME seconds (coming back resets the clock)
  release(v, tow = true) { parkOnStand(v); v.parked = true; v.keep = true; v.speed = 0; v.brake = false; v.left = tow ? { away: 0 } : null; if (v.spot) { this.parkedSet && this.parkedSet.delete(v.spot); v.spot = null; } if (!this.parked.includes(v)) this.parked.push(v); }
  // a municipal tow truck pulls up on the nearest lane in front of the vehicle, wheel-lifts it and drives off with it
  // put any vehicle under lane-following AI on the nearest drivable lane heading the way it faces (null if no road within maxD)
  laneNear(x, z, yaw, maxD = 40) {
    let best = null, bd = Infinity; for (const seg of this.drivableSegs) { if (seg.crossing) continue; const [a, b] = segNodes(seg); const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1); const d = (a.x + dx * t - x) ** 2 + (a.z + dz * t - z) ** 2; if (d < bd) { bd = d; best = seg; } }
    if (!best || bd > maxD * maxD) return null; const [a, b] = segNodes(best); const fwd = (b.x - a.x) * Math.sin(yaw) + (b.z - a.z) * Math.cos(yaw) >= 0; const piece = linePiece(best, fwd ? a : b, fwd ? b : a, 0);
    const s = clamp((x - piece.p0[0]) * piece.d[0] + (z - piece.p0[1]) * piece.d[1], 0.5, piece.len - 0.5); return { piece, s, seg: best };
  }
  adoptAI(v, ln, { place = true, v0 = null, route = null } = {}) {
    if (!ln) return false; const T = VTYPES[v.type]; if (place) { const [x, z, yaw] = evalPiece(ln.piece, ln.s); v.place(x, z, yaw); }
    v.ai = { pieces: [ln.piece], s: ln.s, v0: v0 ?? Math.min(V0[ln.seg.level], T.maxSpeed * 0.42) * this.rng.range(0.92, 1.08), stuck: 0, honkCd: 0, bumped: 0, aggressive: v.type === 'tuktuk' ? 1.3 : 1, lat: 0, route: route ? route.slice() : null };
    v.parked = false; v.player = false; v.hold = false; v.free = null; v.stand = 0; v.leanK = 0; this.extend(v); const pi = this.parked.indexOf(v); if (pi >= 0) this.parked.splice(pi, 1); if (!this.vehicles.includes(v)) this.vehicles.push(v); return true;
  }
  // a municipal tow truck pulls up on the nearest lane in front of the vehicle, wheel-lifts it and drives off with it
  tow(v) {
    const i = this.parked.indexOf(v); if (i >= 0) this.parked.splice(i, 1); v.left = null; v.parked = false; v.free = null;
    const T = new Vehicle('tow', 4100 + (v.id % 97), this.scene); const ln = this.laneNear(v.x, v.z, v.yaw);
    if (ln) { ln.s = clamp(ln.s + T.T.len / 2 + 3, 0.5, ln.piece.len - 0.5); this.adoptAI(T, ln, { v0: Math.min(V0[ln.seg.level], 9) }); T.speed = 0; this.addDriver(T); }
    else T.place(v.x + Math.sin(v.yaw) * 7, v.z + Math.cos(v.yaw) * 7, v.yaw); /* no lane nearby: the truck takes it straight from where it stands */
    T.towing = v; v.towedBy = T; v.keep = true; if (!this.vehicles.includes(T)) this.vehicles.push(T); this.hitch(T); this.events.emit('towed', v);
    if (!ln) { this.remove(T); const k = this.vehicles.indexOf(T); if (k >= 0) this.vehicles.splice(k, 1); }
  }
  // wheel-lift: the towed vehicle's front axle sits in the cradle behind the truck, nose up, rear wheels rolling on the road
  hitch(T) {
    const c = T.towing; if (!c) return; const ws = c.mesh.userData.wheels || []; let fa = c.T.len * 0.3, ra = -c.T.len * 0.3; if (ws.length) { fa = Math.max(...ws.map((w) => w.position.z)); ra = Math.min(...ws.map((w) => w.position.z)); }
    const wb = Math.max(0.8, fa - ra), a = Math.asin(Math.min(0.5, 0.36 / wb)); const zc = -(T.T.len / 2 + 0.85) - fa * Math.cos(a);
    const fx = Math.sin(T.yaw), fz = Math.cos(T.yaw); c.x = T.x + fx * zc; c.z = T.z + fz * zc; c.yaw = T.yaw; c.pitch = -a; c.roll = 0; c.speed = T.speed; c.y = L.groundY(c.x, c.z) - ra * Math.sin(a); c.sync(0);
  }
  updateParked(dt, focus) {
    this.parkedTimer -= dt; if (this.parkedTimer > 0) return; const tick = 1.0 - this.parkedTimer; this.parkedTimer = 1.0;
    for (const v of this.parked.slice()) if (v.left) { if (Math.hypot(v.x - focus.x, v.z - focus.z) > TOW_DIST) v.left.away += tick; else v.left.away = 0; if (v.left.away >= TOW_TIME) this.tow(v); }
    for (let i = this.parked.length - 1; i >= 0; i--) { const v = this.parked[i]; if (Math.hypot(v.x - focus.x, v.z - focus.z) > 200 && !v.keep) { v.dispose(); this.parked.splice(i, 1); } }
    if (!this.parkedSet) this.parkedSet = new Set(); const near = [];
    for (const p of plan.parking) { const d = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2; if (d < 150 * 150) near.push([d, p]); }
    near.sort((a, b) => a[0] - b[0]);
    const want = new Set(near.slice(0, 26).map((n) => n[1]).filter((p) => !(this.reserved && this.reserved(p)))); // reserved = kept clear (e.g. a cinematic's driving lane)
    for (const v of this.parked) if (v.spot && !want.has(v.spot) && !v.keep) { v.dispose(); v.dead = true; this.parkedSet.delete(v.spot); }
    this.parked = this.parked.filter((v) => !v.dead);
    for (const p of want) {
      if (this.parkedSet.has(p)) continue; const r = new RNG(Math.floor(p.x * 31 + p.z * 17));
      const type = r.weighted([['car', 4], ['tuktuk', 3], ['van', 2], ['sedan', 1.5], ['bike', 2], ['taxi', 0.6]]);
      const v = new Vehicle(type, Math.floor(r.next() * 1e6), this.scene); parkOnStand(v); v.place(p.x, p.z, p.yaw); v.parked = true; v.spot = p; this.parked.push(v); this.parkedSet.add(p);
    }
  }
  nearest(x, z, maxD = 4) { let best = null, bd = maxD * maxD; for (const v of this.all()) { if (v.player || v.isTrain || v.squad || v.towedBy) continue; const d = (v.x - x) ** 2 + (v.z - z) ** 2; if (d < bd) { bd = d; best = v; } } return best; }
}
export { evalPiece, linePiece, curvePiece, otherEnd, segNodes, laneOffset };
