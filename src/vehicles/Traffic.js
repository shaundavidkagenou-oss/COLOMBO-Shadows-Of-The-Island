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

export class Traffic {
  constructor(scene, collision, events) {
    this.scene = scene; this.collision = collision; this.events = events; this.vehicles = []; this.parked = []; this.rng = new RNG(777);
    this.max = 40; this.simTime = 0; this.res = new Map(); this.driverSpecs = []; for (let i = 0; i < 16; i++) this.driverSpecs.push(randomSpec(5000 + i * 13, { sex: i % 5 === 0 ? 'f' : 'm', age: 'adult' }));
    this.parkedTimer = 0; this.drivableSegs = L.segments.filter((s) => !s.crossing || s.level <= 2);
  }
  setDensity(d) { this.max = Math.round(10 + d * 45); }
  all() { return this.parked.length ? this.vehicles.concat(this.parked) : this.vehicles; }
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
    ch.root.position.set(seat.x, seat.y - 0.5, seat.z); ch.anim.set(seat.ride ? 'ride' : 'drive'); ch.anim.actionW = 1; ch.anim.update(0.016, 0); ch.mesh.castShadow = false;
    v.mesh.add(ch.root); v.driverChar = ch;
  }
  extend(v) { // make sure at least line + curve + next line exist
    const ai = v.ai; let last = ai.pieces[ai.pieces.length - 1];
    while (ai.pieces.length < 3) {
      if (last.type === 'line') {
        const node = last.to; let opts = node.segs.filter((s) => s !== last.seg && !(s.level >= 3 && (v.type === 'bus' || v.type === 'pbus' || v.type === 'lorry')));
        opts = opts.filter((s) => { const o = otherEnd(s, node); return o.x > L.BOUNDS.minX + 10 && o.x < L.BOUNDS.maxX - 10 && o.z > L.BOUNDS.minZ + 10 && o.z < L.BOUNDS.maxZ - 10; });
        let next;
        if (!opts.length) next = last.seg; else next = this.rng.weighted(opts.map((s) => [s, (s.dir === last.seg.dir ? 2.2 : 1) * (s.level <= last.seg.level ? 1.3 : 0.7)]));
        const to = otherEnd(next, node); const lanes = next.level <= 1 ? 2 : 1; const lane = Math.min(lanes - 1, last.lane);
        const nl = linePiece(next, node, to, lane);
        ai.pieces.push(curvePiece(last, nl, node)); ai.pieces.push(nl); last = nl;
      } else break;
    }
  }
  update(dt, focus, camDir, simTime, pedsNear, player) {
    this.simTime = simTime; this.player = player;
    // spawn / despawn
    for (let i = this.vehicles.length - 1; i >= 0; i--) { const v = this.vehicles[i]; const d = Math.hypot(v.x - focus.x, v.z - focus.z); if (d > 330 && !v.keep) { this.remove(v); this.vehicles.splice(i, 1); } }
    let budget = 2; while (this.vehicles.length < this.max && budget-- > 0) this.spawn(focus, camDir, this.vehicles.length < this.max * 0.4);
    this.updateParked(dt, focus);
    // spatial bins for following
    const all = this.vehicles; const playerV = player && player.vehicle;
    for (const v of all) this.step(v, dt, all, pedsNear, playerV, player);
  }
  step(v, dt, all, peds, playerV, player) {
    const ai = v.ai; if (!ai) return; const p = ai.pieces[0];
    const [fx, fz] = [Math.sin(v.yaw), Math.cos(v.yaw)];
    // --- leader gap
    let gap = 60, leadV = 0;
    const consider = (ox, oz, ov, len, latTol) => {
      const rx = ox - v.x, rz = oz - v.z; const along = rx * fx + rz * fz; if (along <= 0 || along > 45) return;
      const lat = Math.abs(rx * fz - rz * fx); if (lat > latTol) return; const g = along - v.half - len; if (g < gap) { gap = g; leadV = ov; }
    };
    for (const o of all) { if (o === v) continue; if (Math.abs(o.x - v.x) > 45 || Math.abs(o.z - v.z) > 45) continue; const ofx = Math.sin(o.yaw), ofz = Math.cos(o.yaw); const sameDir = ofx * fx + ofz * fz; consider(o.x, o.z, Math.max(0, o.speed * sameDir), o.half, sameDir > 0.3 ? 1.7 : 1.2); }
    if (playerV) consider(playerV.x, playerV.z, Math.max(0, playerV.speed * (Math.sin(playerV.yaw) * fx + Math.cos(playerV.yaw) * fz)), playerV.half, 1.9);
    else if (player) consider(player.x, player.z, 0, 0.4, 1.9);
    if (peds) for (const q of peds) consider(q.x, q.z, 0, 0.4, q.crossing ? 2.6 : 1.4);
    // --- junction control
    let stopAt = Infinity;
    if (p.type === 'line') {
      const rem = p.len - ai.s; const node = p.to; const next = ai.pieces[1];
      if (node.signal && node.hwH > 0 && node.hwV > 0) {
        const st = L.signalState(node, p.seg.dir, this.simTime);
        if (st === 'red' || (st === 'yellow' && rem > v.speed * 1.2 + 4)) stopAt = rem - 0.5;
      } else if (next && next.type === 'curve' && node.segs.length >= 3) {
        const myLevel = p.seg.level; const crossMin = Math.min(...node.segs.filter((s) => s.dir !== p.seg.dir).map((s) => s.level), 9);
        const r = this.res.get(node.id); const busy = r && r.id !== v.id && this.simTime - r.t < 3.5;
        if (busy || (myLevel > crossMin && rem < 14 && v.speed > 4)) { if (busy) stopAt = rem - 0.5; }
        if (rem < 6 && !busy) this.res.set(node.id, { id: v.id, t: this.simTime });
      }
    } else if (p.type === 'curve') this.res.set(p.node.id, { id: v.id, t: this.simTime });
    // --- IDM
    const nextCurve = p.type === 'line' ? ai.pieces[1] : p; const curveV = nextCurve && nextCurve.type === 'curve' && nextCurve.turn !== 'straight' ? (nextCurve.turn === 'uturn' ? 3 : 6.5) : ai.v0;
    let v0 = ai.v0; if (p.type === 'curve') v0 = curveV; else if (p.len - ai.s < 25) v0 = Math.min(v0, lerp(curveV, ai.v0, (p.len - ai.s) / 25));
    if (this.weatherRain) v0 *= 1 - this.weatherRain * 0.2;
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
    if (ai.stuck > 25) { v.keep = false; this.remove(v); this.vehicles.splice(this.vehicles.indexOf(v), 1); return; } // hopelessly stuck → recycle out of view
    // --- advance along pieces
    ai.s += v.speed * dt;
    while (ai.s > ai.pieces[0].len) { ai.s -= ai.pieces[0].len; ai.pieces.shift(); this.extend(v); }
    const [x, z, yaw] = evalPiece(ai.pieces[0], ai.s);
    const dyaw = Math.atan2(Math.sin(yaw - v.yaw), Math.cos(yaw - v.yaw)); v.steer = clamp(dyaw * 4, -0.6, 0.6);
    v.x = x; v.z = z; v.yaw = yaw; v.y = L.groundY(x, z); v.lights = this.night > 0.4; v.sync(dt);
  }
  remove(v) { if (v.driverChar) { v.driverChar.dispose(); } v.dispose(); }
  // Hand a vehicle over to the player (car-jack: driver steps out and walks off grumbling)
  takeOver(v) { const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1); const pi = this.parked.indexOf(v); if (pi >= 0) this.parked.splice(pi, 1); const hadDriver = !!v.driverChar; if (v.driverChar) { v.mesh.remove(v.driverChar.root); v.driverChar.dispose(); v.driverChar = null; } v.ai = null; v.parked = false; v.keep = true; return hadDriver; }
  release(v) { v.parked = true; v.keep = false; v.speed = 0; v.brake = false; this.parked.push(v); }
  updateParked(dt, focus) {
    this.parkedTimer -= dt; if (this.parkedTimer > 0) return; this.parkedTimer = 1.0;
    for (let i = this.parked.length - 1; i >= 0; i--) { const v = this.parked[i]; if (Math.hypot(v.x - focus.x, v.z - focus.z) > 200 && !v.keep) { v.dispose(); this.parked.splice(i, 1); } }
    if (!this.parkedSet) this.parkedSet = new Set(); const near = [];
    for (const p of plan.parking) { const d = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2; if (d < 150 * 150) near.push([d, p]); }
    near.sort((a, b) => a[0] - b[0]);
    const want = new Set(near.slice(0, 26).map((n) => n[1]));
    for (const v of this.parked) if (v.spot && !want.has(v.spot) && !v.keep) { v.dispose(); v.dead = true; this.parkedSet.delete(v.spot); }
    this.parked = this.parked.filter((v) => !v.dead);
    for (const p of want) {
      if (this.parkedSet.has(p)) continue; const r = new RNG(Math.floor(p.x * 31 + p.z * 17));
      const type = r.weighted([['car', 4], ['tuktuk', 3], ['van', 2], ['sedan', 1.5], ['bike', 2], ['taxi', 0.6]]);
      const v = new Vehicle(type, Math.floor(r.next() * 1e6), this.scene); v.place(p.x, p.z, p.yaw); v.parked = true; v.spot = p; this.parked.push(v); this.parkedSet.add(p);
    }
  }
  nearest(x, z, maxD = 4) { let best = null, bd = maxD * maxD; for (const v of this.all()) { if (v.player) continue; const d = (v.x - x) ** 2 + (v.z - z) ** 2; if (d < bd) { bd = d; best = v; } } return best; }
}
export { evalPiece, linePiece };
