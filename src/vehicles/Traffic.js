// AI traffic on the left-hand road grid: lanes, junction turns, signals, car-following (IDM), yielding to pedestrians,
// horns, parked cars, and spawning/despawning around the player.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { plan } from '../world/CityPlan.js';
import { Vehicle } from './Vehicle.js';
import { VTYPES, modelCached, warmModel, warmShape } from './VehicleModels.js';
import { TRAFFIC_W, PARKED_W, NO_LANES } from './VehicleCatalog.js';
import { RNG } from '../core/rng.js';
import { clamp, lerp } from '../core/math.js';
import { Character, randomSpec } from '../actors/Character.js';
import { seatCharacter, doorPath } from '../actors/Seating.js';
import { parkOnStand } from './Kickstand.js';
import { stepChase } from '../police/Pursuit.js';

// passengers per vehicle type: [count, weight] (the driver is always present)
const PAX = { car: [[0, 5], [1, 3], [2, 1.5], [3, 0.8]], sedan: [[0, 5], [1, 3], [2, 1]], taxi: [[0, 2], [1, 4], [2, 2]], suv: [[0, 3], [1, 3], [2, 2], [3, 1]], van: [[0, 3], [1, 2], [2, 2], [4, 1]],
  tuktuk: [[0, 3], [1, 4], [2, 3]], bike: [[0, 6], [1, 4]], lorry: [[0, 3], [1, 2]], bus: [[6, 1], [10, 2], [16, 2], [22, 1]], pbus: [[8, 1], [14, 2], [20, 2], [26, 1]] };
export const TOW_DIST = 150, TOW_TIME = 300; // a vehicle the player left behind is towed after 5 min with the player beyond 150 m
const PAX_NEAR = 90, PAX_FAR = 120, PAX_CAP = 60; // passengers exist only near the player (LOD); total cap

const V0 = [13.5, 12, 9, 6.5];
const CAT_W = Object.fromEntries(Object.entries(TRAFFIC_W).map(([k, o]) => [k, Object.entries(o)]));
const PARKED_LIST = Object.entries(PARKED_W);
const MIX = {
  // 'cat' = one of the 40 catalogue models (fictional makes), picked by the district's own catalogue weights
  default: [['tuktuk', 34], ['car', 7], ['sedan', 3], ['van', 6], ['bike', 12], ['bus', 5], ['pbus', 4], ['lorry', 3], ['taxi', 4], ['cat', 22]],
  port: [['lorry', 26], ['van', 8], ['tuktuk', 20], ['car', 5], ['bike', 10], ['bus', 3], ['cat', 24]],
  cinnamon: [['car', 9], ['sedan', 5], ['van', 7], ['tuktuk', 22], ['bike', 8], ['suv', 2], ['taxi', 6], ['cat', 41]],
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
// junction connector. Turns and straight-throughs are cubic Béziers whose end tangents run exactly along both lanes (no yaw
// snap, lane shifts become a gentle S); a U-turn is a 'light-bulb' turn (swing out, wide arc, back in) sampled as a polyline.
function curvePiece(a, b, node, rMin = 3.6) {
  const p0 = a.p1, p1 = b.p0, d0 = a.d, d1 = b.d; let c;
  const den = d0[0] * d1[1] - d0[1] * d1[0];
  const turn = Math.abs(den) > 0.5 ? (den > 0 ? 'right' : 'left') : d0[0] * d1[0] + d0[1] * d1[1] < 0 ? 'uturn' : 'straight';
  if (turn === 'uturn') return uturnPiece(p0, p1, d0, node, rMin);
  let c1, c2;
  if (turn !== 'straight') { const t = ((p1[0] - p0[0]) * d1[1] - (p1[1] - p0[1]) * d1[0]) / den; c = [p0[0] + d0[0] * t, p0[1] + d0[1] * t];
    c1 = [p0[0] + (c[0] - p0[0]) * 2 / 3, p0[1] + (c[1] - p0[1]) * 2 / 3]; c2 = [p1[0] + (c[0] - p1[0]) * 2 / 3, p1[1] + (c[1] - p1[1]) * 2 / 3]; }
  else { const m = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 3; c1 = [p0[0] + d0[0] * m, p0[1] + d0[1] * m]; c2 = [p1[0] - d1[0] * m, p1[1] - d1[1] * m]; }
  const P = { type: 'curve', p0, p1, c1, c2, d0, len: 1, node, turn }; let len = 0, [px, pz] = p0; const tab = [0];
  for (let k = 1; k <= 32; k++) { const [x, z] = bez(P, k / 32); len += Math.hypot(x - px, z - pz); px = x; pz = z; tab.push(len); }
  P.tab = tab; P.len = Math.max(0.1, len); return P; // tab: arc length at t = k/32 → evaluated by distance, so ground speed = wheel speed
}
function bez(p, t) { const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t; return [a * p.p0[0] + b * p.c1[0] + c * p.c2[0] + d * p.p1[0], a * p.p0[1] + b * p.c1[1] + c * p.c2[1] + d * p.p1[1]]; }
// how far before the lane end a U-turn must begin so the bulb stays inside the road end
function uturnBack(gap, rMin) { const R = Math.max(gap / 2, rMin); const ca = Math.min(1, (gap + 2 * R) / (4 * R)); return R * (1 + 2 * Math.sqrt(1 - ca * ca)) + 0.3; }
function uturnPiece(p0, p1, f, node, rMin) {
  if (!(rMin > 0)) rMin = 3.6;
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1]; const al = dx * f[0] + dz * f[1]; let ux = dx - f[0] * al, uz = dz - f[1] * al; const g = Math.hypot(ux, uz) || 0.01; ux /= g; uz /= g;
  const R = Math.max(g / 2, rMin), ca = Math.min(1, (g + 2 * R) / (4 * R)), A = Math.acos(ca); const L = R * (Math.PI + 4 * A);
  // three arcs: away by A (κ −1/R), round by π + 2A (κ +1/R), away by A (κ −1/R); local x toward p1, y forward
  const segs = [[A, -1], [Math.PI + 2 * A, 1], [A, -1]]; const pts = []; const N = Math.max(24, Math.ceil(L / 0.35));
  for (let k = 0; k <= N; k++) { let s = (k / N) * L, x = 0, y = 0, th = 0;
    for (const [ang, sg] of segs) { const sl = Math.min(s, ang * R); const th1 = th + sg * sl / R;
      if (sg > 0) { x += R * (Math.cos(th) - Math.cos(th1)); y += R * (Math.sin(th1) - Math.sin(th)); } else { x += R * (Math.cos(th1) - Math.cos(th)); y += -R * (Math.sin(th1) - Math.sin(th)); }
      th = th1; s -= sl; if (s <= 1e-9) break; }
    const wx = p0[0] + f[0] * y + ux * x, wz = p0[1] + f[1] * y + uz * x; const hx = f[0] * Math.cos(th) + ux * Math.sin(th), hz = f[1] * Math.cos(th) + uz * Math.sin(th); pts.push([wx, wz, Math.atan2(hx, hz)]); }
  const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  return { type: 'curve', poly: pts, cum, p0, p1: [pts[pts.length - 1][0], pts[pts.length - 1][1]], d0: f, len: Math.max(0.1, cum[cum.length - 1]), node, turn: 'uturn' };
}
// ---- body sweep: oriented-box corners / penetration depth (allocation-free) for the 'never drive into another body' guard
const mkC = () => [[0, 0], [0, 0], [0, 0], [0, 0]]; const _A = mkC();
function boxCorners(o, x, z, yaw, hw, hl) { const c = Math.cos(yaw), s = Math.sin(yaw); const ax = c * hw, az = -s * hw, bx = s * hl, bz = c * hl;
  o[0][0] = x - ax - bx; o[0][1] = z - az - bz; o[1][0] = x + ax - bx; o[1][1] = z + az - bz; o[2][0] = x + ax + bx; o[2][1] = z + az + bz; o[3][0] = x - ax + bx; o[3][1] = z - az + bz; return o; }
function boxPen(A, B) { let best = Infinity; for (let pi = 0; pi < 2; pi++) { const P = pi ? B : A; for (let i = 0; i < 2; i++) { const a = P[i], b = P[i + 1]; let nx = b[1] - a[1], nz = a[0] - b[0]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (let k = 0; k < 4; k++) { const d = A[k][0] * nx + A[k][1] * nz; if (d < a0) a0 = d; if (d > a1) a1 = d; const e = B[k][0] * nx + B[k][1] * nz; if (e < b0) b0 = e; if (e > b1) b1 = e; }
  const o = Math.min(a1 - b0, b1 - a0); if (o <= 0) return 0; if (o < best) best = o; } } return best; }
function evalPiece(p, s) {
  let t = clamp(s / p.len, 0, 1);
  if (p.type === 'line') return [lerp(p.p0[0], p.p1[0], t), lerp(p.p0[1], p.p1[1], t), Math.atan2(p.d[0], p.d[1])];
  if (p.poly) { const c = p.cum, q = clamp(s, 0, p.len); let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= q) lo = m; else hi = m; }
    const a = p.poly[lo], b = p.poly[hi], k = (q - c[lo]) / Math.max(1e-6, c[hi] - c[lo]); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), a[2] + Math.atan2(Math.sin(b[2] - a[2]), Math.cos(b[2] - a[2])) * k]; }
  if (p.tab) { const c = p.tab, q = clamp(s, 0, c[c.length - 1]); let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= q) lo = m; else hi = m; } t = (lo + (q - c[lo]) / Math.max(1e-9, c[hi] - c[lo])) / (c.length - 1); }
  const [x, z] = bez(p, t); const u = 1 - t;
  let tx = 3 * u * u * (p.c1[0] - p.p0[0]) + 6 * u * t * (p.c2[0] - p.c1[0]) + 3 * t * t * (p.p1[0] - p.c2[0]), tz = 3 * u * u * (p.c1[1] - p.p0[1]) + 6 * u * t * (p.c2[1] - p.c1[1]) + 3 * t * t * (p.p1[1] - p.c2[1]);
  if (tx * tx + tz * tz < 1e-8) { tx = p.d0[0]; tz = p.d0[1]; } // degenerate (a zero-length straight-through): keep the lane heading
  return [x, z, Math.atan2(tx, tz)];
}

const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// arc-length on a piece nearest to (x, z), searched around s0 (curves) / closed form (lines)
export function pathV(p, s) { const c = p.cum, q = Math.max(0, Math.min(s, p.len)); let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= q) lo = m; else hi = m; } return Math.min(p.vlim[lo], p.vlim[hi]); }
function projectS(p, x, z, s0) {
  if (p.type === 'line') return (x - p.p0[0]) * p.d[0] + (z - p.p0[1]) * p.d[1];
  let best = s0, bd = Infinity; for (let s = Math.max(0, s0 - 3); s <= Math.min(p.len, s0 + 8); s += 0.25) { const [px, pz] = evalPiece(p, s); const d = (px - x) ** 2 + (pz - z) ** 2; if (d < bd) { bd = d; best = s; } }
  return best;
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
  pickType(x, z) { const d = L.districtIdAt(x, z); const night = this.night > 0.6; const mix = MIX[d] || MIX.default; const m = night ? mix.map(([t, w]) => [t, t === 'bus' || t === 'pbus' ? w * 0.4 : w]) : mix; const t = this.rng.weighted(m); return t === 'cat' ? this.rng.weighted(CAT_W[d] || CAT_W.default) : t; }
  spawn(focus, camDir, forceNear = false) {
    for (let tries = 0; tries < 12; tries++) {
      const hint = tries < 4 ? this.spawnHint : null; // a fuel station asking for a customer on its approach road
      const seg = hint ? hint.seg : this.drivableSegs[Math.floor(this.rng.next() * this.drivableSegs.length)];
      const mx = (seg.x0 + seg.x1) / 2, mz = (seg.z0 + seg.z1) / 2; const d = Math.hypot(mx - focus.x, mz - focus.z);
      if (!hint && (d > (forceNear ? 140 : 260) || d < (forceNear ? 25 : 70))) continue;
      // avoid spawning in plain view nearby
      if (!hint && !forceNear && d < 160 && camDir) { const dot = ((mx - focus.x) * camDir.x + (mz - focus.z) * camDir.z) / d; if (dot > 0.5) continue; }
      const [a, b] = segNodes(seg); const fwd = this.rng.chance(0.5); const from = hint ? hint.from : fwd ? a : b, to = hint ? hint.to : fwd ? b : a;
      const lanes = seg.level <= 1 ? 2 : 1; const lane = hint ? hint.lane : Math.floor(this.rng.next() * lanes);
      let type = this.pickType(mx, mz); if (hint) { for (let k = 0; k < 10 && !hint.types.has(type); k++) type = this.pickType(mx, mz); if (!hint.types.has(type)) continue; }
      if (seg.level >= 3 && (type === 'bus' || type === 'pbus' || type === 'lorry' || NO_LANES.has(type))) continue;
      const piece = linePiece(seg, from, to, lane); const s = this.rng.range(0, piece.len * (hint ? 0.6 : 0.8));
      const [x, z, yaw] = evalPiece(piece, s);
      if (hint) { const dd = Math.hypot(x - focus.x, z - focus.z); if (dd < 45 || (camDir && dd < 170 && ((x - focus.x) * camDir.x + (z - focus.z) * camDir.z) / dd > 0.35)) continue; } // never pops up in view
      if (this.vehicles.some((v) => (v.x - x) ** 2 + (v.z - z) ** 2 < 14 * 14)) continue;
      if (this.bodyAt(x, z, yaw, VTYPES[type])) continue; // not onto a parked vehicle either
      if (this.player && this.player.vehicle && (this.player.vehicle.x - x) ** 2 + (this.player.vehicle.z - z) ** 2 < 15 * 15) continue;
      let seed = Math.floor(this.rng.next() * 1e6);
      if (!modelCached(type, seed)) { // a first-time look costs a 10-30 ms model build: at most one every 2 s, otherwise reuse a built look (the loading screen builds one of every type)
        const now = performance.now(); if (now - (this.lastBuild || -1e9) < 2000) { const known = this.looks && this.looks.get(type); let alt = known && known.length ? known[Math.floor(this.rng.next() * known.length)] : -1; for (let k = 0; k < 8 && alt < 0; k++) { const s2 = Math.floor(this.rng.next() * 1e6); if (modelCached(type, s2)) alt = s2; } if (alt < 0) continue; seed = alt; } else this.lastBuild = now; }
      const v = new Vehicle(type, seed, this.scene); this.noteLook(type, seed); v.place(x, z, yaw);
      const T = VTYPES[type]; v.ai = { pieces: [piece], s, v0: Math.min(V0[seg.level], T.maxSpeed * 0.42) * this.rng.range(0.88, 1.12), stuck: 0, honkCd: 0, bumped: 0, aggressive: type === 'tuktuk' || type === 'pbus' ? 1.3 : 1 };
      if (hint) v.ai.route = hint.route.slice(); // straight on to the station's road
      v.speed = v.ai.v0 * 0.7; this.extend(v); this.addDriver(v); this.vehicles.push(v); if (hint) { v.fuelFor = hint.tag; this.spawnHint = undefined; } return v;
    }
    return null;
  }
  addDriver(v) {
    const spec = this.driverSpecs[v.id % this.driverSpecs.length]; const ch = new Character(spec); const seat = v.driverSeat();
    seatCharacter(ch, v, seat); ch.mesh.castShadow = false; v.driverChar = ch; v.animAcc = 0;
    // passenger plan: which seats are taken and by whom (created lazily when the vehicle is near the player)
    const r = new RNG(v.id * 7919 + 13); const free = v.mesh.userData.seats.map((q, i) => i).filter((i) => !v.mesh.userData.seats[i].driver);
    const n = Math.min(free.length, r.weighted(PAX[v.type] || [[0, 1]])); const plan = [];
    for (let k = 0; k < n; k++) { const j = Math.floor(r.next() * free.length); const si = free.splice(j, 1)[0]; plan.push({ si, spec: this.paxSpec(90000 + v.id * 41 + k * 7), mode: r.weighted([['lap', 5], ['phone', 2], ['window', 2]]) }); }
    v.paxPlan = plan; v.pax = [];
  }
  // passenger looks come from the crowd's prepared looks (built on the loading screen): a never-seen random look costs a
  // 10-30 ms character build, and buses / tuks filling up near the player were a steady source of driving hitches
  paxSpec(seed) { const P = this.specPool || (this.crowd && this.crowd.specs); if (P && P.length >= 8) { const r = new RNG(seed); for (let k = 0; k < 6; k++) { const sp = P[Math.floor(r.next() * P.length)]; if (sp && sp.ageYears >= 18) return sp; } } return randomSpec(seed, { age: 'adult' }); }
  // a parked vehicle never appears on top of another one (a car waiting / pulling past the kerb spot, the player's car)
  spotTaken(p, type) { const T = VTYPES[type]; if (!T) return false; boxCorners(_A, p.x, p.z, p.yaw, T.wid / 2 + 0.1, T.len / 2 + 0.15); const r = Math.hypot(T.wid, T.len) / 2 + 0.3; const pv = this.player && this.player.vehicle;
    for (const o of pv && !this.vehicles.includes(pv) ? this.vehicles.concat([pv]) : this.vehicles) { const rr = r + Math.hypot(o.T.wid, o.T.len) / 2; if ((o.x - p.x) ** 2 + (o.z - p.z) ** 2 > rr * rr) continue; if (boxPen(_A, o._bc2 = boxCorners(o._bc2 || mkC(), o.x, o.z, o.yaw, o.T.wid / 2, o.T.len / 2)) > 0) return true; }
    return false; }
  bodyAt(x, z, yaw, T) { if (!T) return false; boxCorners(_A, x, z, yaw, T.wid / 2 + 0.2, T.len / 2 + 0.5); const r = Math.hypot(T.wid, T.len) / 2 + 0.6;
    for (const o of this.parked) { const rr = r + Math.hypot(o.T.wid, o.T.len) / 2; if ((o.x - x) ** 2 + (o.z - z) ** 2 > rr * rr) continue; if (boxPen(_A, o._bc2 = boxCorners(o._bc2 || mkC(), o.x, o.z, o.yaw, o.T.wid / 2, o.T.len / 2)) > 0) return true; } return false; }
  binBodies(playerV) { const B = this.bins || (this.bins = new Map()); for (const a of B.values()) a.length = 0;
    const add = (o) => { if (!o || !o.T || (o.mesh && !o.mesh.parent)) return; const ex = Math.min(3, Math.abs(o.speed || 0) * 0.1) * Math.sign(o.speed || 0), ohw = o.T.wid / 2 - 0.03, ohl = o.T.len / 2 - 0.03 + Math.abs(ex); o._bc = boxCorners(o._bc || mkC(), o.x + Math.sin(o.yaw) * ex, o.z + Math.cos(o.yaw) * ex, o.yaw, ohw, ohl); o._br = Math.hypot(ohw, ohl); /* a moving body: where it is now and over the next 0.2 s */ const k = (Math.floor(o.x / 24) * 4096 + Math.floor(o.z / 24)) | 0; let a = B.get(k); if (!a) B.set(k, (a = [])); a.push(o); };
    for (const o of this.vehicles) add(o); for (const o of this.parked) add(o); if (playerV && !this.vehicles.includes(playerV)) add(playerV); if (this.obstacles) for (const o of this.obstacles) add(o); }
  // Distance along the vehicle's own path (its lane pieces, with the lateral drift of a lane change / pull-out) before its body
  // would overlap another vehicle's body: the last line of defence under the leader / junction logic, which only looks down
  // the lane (a car turning across a junction used to run into one stopped on a crossing curve; a lane change sideswiped a
  // kerb-parked car). Bodies already touching (a knock, a spawn) only count if the overlap would get deeper, so nobody is
  // frozen by contact they cannot undo.
  // is anything within d metres behind the body (reversing)?
  bodyBehind(v, ai, d) { const B = this.bins; if (!B) return false; const e = evalPiece(ai.pieces[0], Math.max(0, ai.s - d)); const hw = v.T.wid / 2, hl = v.T.len / 2; const x = e[0] + Math.cos(e[2]) * (ai.lat || 0), z = e[1] - Math.sin(e[2]) * (ai.lat || 0);
    boxCorners(_A, x, z, v.yaw, hw, hl); const i0 = Math.floor((x - 12) / 24), i1 = Math.floor((x + 12) / 24), j0 = Math.floor((z - 12) / 24), j1 = Math.floor((z + 12) / 24);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = B.get((i * 4096 + j) | 0); if (a) for (const o of a) if (o !== v && o._bc && boxPen(_A, o._bc) > 0) return true; }
    const P = this.crowd && this.crowd.peds; if (P) for (const p of P) { if (Math.abs(p.x - x) > hl + 1 || Math.abs(p.z - z) > hl + 1) continue; const dx = p.x - x, dz = p.z - z, c = Math.cos(v.yaw), s = Math.sin(v.yaw); if (Math.abs(dx * c - dz * s) < hw + 0.4 && Math.abs(dx * s + dz * c) < hl + 0.4) return true; }
    return false; }
  bodyGap(v, ai, dt = 0) {
    // far from the player: recomputed every third frame; in between the last contact distance shrinks by the distance driven (conservative)
    const F = this.focusPt; if (F && dt > 0 && ai.bodyG !== undefined && ((this.fN | 0) + v.id) % 3 && (v.x - F.x) ** 2 + (v.z - F.z) ** 2 > 3600) { ai.bodyG -= v.speed * dt; return ai.bodyG; }
    ai.bodyG = this.bodyGap0(v, ai); return ai.bodyG;
  }
  bodyGap0(v, ai) {
    const B = this.bins; if (!B || !ai.pieces || !ai.pieces.length) return Infinity; const hw = v.T.wid / 2 - 0.03, hl = v.T.len / 2 - 0.03, rv = Math.hypot(hw, hl);
    const look = Math.min(16, 2.5 + v.speed * 1.4), R = look + hl + 7; const near = this._near || (this._near = []); near.length = 0;
    const i0 = Math.floor((v.x - R) / 24), i1 = Math.floor((v.x + R) / 24), j0 = Math.floor((v.z - R) / 24), j1 = Math.floor((v.z + R) / 24);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = B.get((i * 4096 + j) | 0); if (!a) continue; for (const o of a) { if (o === v || o === v.towing || o.towing === v || o === v.hitchedTo) continue; if (Math.abs(o.x - v.x) > R || Math.abs(o.z - v.z) > R) continue; near.push(o); } }
    if (!near.length) return Infinity;
    boxCorners(_A, v.x, v.z, v.yaw, hw, hl); const p0 = this._p0 || (this._p0 = []); p0.length = 0;
    for (const o of near) { const rr = rv + o._br; p0.push((o.x - v.x) ** 2 + (o.z - v.z) ** 2 > rr * rr ? 0 : boxPen(_A, o._bc)); } // corners: binBodies (this frame; vehicles stepped earlier this frame have moved < 0.5 m)
    const P = ai.pieces, lw = ai.latWant ?? 0; let ph = ai.hdg || 0, pl = ai.lat || 0; const spP = Math.max(v.speed, 2), kTurn = Math.tan(0.6) / Math.max(1.2, v.T.len * 0.62) * 0.5; // the steering controller below, per 0.5 m
    for (let d = 0.5, st = 0.5; d <= look; st = d < 4 ? 0.5 : 1, d += st) {
      { const vdes = clamp((lw - pl) * 1.1, -2.2, 2.2); const want = Math.abs(lw - pl) < 0.01 && Math.abs(ph) < 0.002 ? 0 : Math.asin(clamp(vdes / spP, -0.5, 0.5)); const h0 = ph; ph += clamp(want - ph, -kTurn * st * 2, kTurn * st * 2); pl += Math.sin((h0 + ph) / 2) * st; }
      let s = ai.s + d, k = 0; while (k < P.length - 1 && s > P[k].len) { s -= P[k].len; k++; } if (s > P[k].len) s = P[k].len;
      const e = evalPiece(P[k], s); const x = e[0] + Math.cos(e[2]) * pl, z = e[1] - Math.sin(e[2]) * pl;
      let built = false;
      for (let n = 0; n < near.length; n++) { const o = near[n]; const rr = rv + o._br; if ((o.x - x) ** 2 + (o.z - z) ** 2 > rr * rr) continue;
        if (!built) { boxCorners(_A, x, z, e[2] + ph, hw, hl); built = true; }
        if (boxPen(_A, o._bc) > p0[n] + 0.005) { ai.bodyBlock = o; return d - st; } }
    }
    ai.bodyBlock = null; return Infinity;
  }
  // create / drop passengers by distance (LOD) and keep their pose animating at a distance-dependent rate
  updateOccupants(v, dt, focus) {
    const d = Math.hypot(v.x - focus.x, v.z - focus.z); const seats = v.mesh.userData.seats;
    // passengers are built one per frame (a full bus at once was 20 character builds in one frame: a visible hitch);
    // this starts at 90 m, so the seats filling over a few frames is not noticeable
    if (v.paxPlan && v.pax.length < v.paxPlan.length && d < PAX_NEAR && this.paxCount + v.paxPlan.length - v.pax.length <= PAX_CAP && !v.disembarking) {
      if (this.paxBudget > 0) { this.paxBudget--; const p = v.paxPlan[v.pax.length]; const ch = new Character(p.spec); seatCharacter(ch, v, seats[p.si], p.mode); ch.mesh.castShadow = d < 40; v.pax.push(ch); this.paxCount++; }
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
    const ai = v.ai; let last = ai.pieces[ai.pieces.length - 1]; if (!last) return;
    while (ai.pieces.length < 3) {
      if (last.type === 'line') {
        const node = last.to; let opts = node.segs.filter((s) => s !== last.seg && !(s.level >= 3 && (v.type === 'bus' || v.type === 'pbus' || v.type === 'lorry' || NO_LANES.has(v.type))));
        opts = opts.filter((s) => { const o = otherEnd(s, node); return o.x > L.BOUNDS.minX + 10 && o.x < L.BOUNDS.maxX - 10 && o.z > L.BOUNDS.minZ + 10 && o.z < L.BOUNDS.maxZ - 10; });
        let next = null;
        if (ai.route && ai.route.length) { const want = ai.route[0]; next = node.segs.find((s) => otherEnd(s, node) === want && this.drivable.has(s)) || null; if (next) ai.route.shift(); else ai.route = null; } // planned route (police units)
        if (next) {} else if (!opts.length) next = last.seg; else next = this.rng.weighted(opts.map((s) => [s, (s.dir === last.seg.dir ? 2.2 : 1) * (s.level <= last.seg.level ? 1.3 : 0.7)]));
        const to = otherEnd(next, node); const lanes = next.level <= 1 ? 2 : 1; const lane = Math.min(lanes - 1, last.lane);
        const nl = linePiece(next, node, to, lane); const rMin = Math.max(3.4, ((v.T && v.T.len) || 4.5) * 0.85); // turning circle of this vehicle
        if (nl.d[0] * last.d[0] + nl.d[1] * last.d[1] < -0.5) { // U-turn (dead end): begin it early enough that the bulb stays inside the road end
          let back = uturnBack(Math.hypot(nl.p0[0] - last.p1[0], nl.p0[1] - last.p1[1]), rMin); back = Math.max(0, Math.min(back, last.len - (last === ai.pieces[0] ? ai.s + 0.5 : 1), nl.len - 1));
          if (back > 0) { last.p1 = [last.p1[0] - last.d[0] * back, last.p1[1] - last.d[1] * back]; last.len -= back; nl.p0 = [nl.p0[0] + nl.d[0] * back, nl.p0[1] + nl.d[1] * back]; nl.len -= back; } }
        ai.pieces.push(curvePiece(last, nl, node, rMin)); ai.pieces.push(nl); last = nl;
        if (ai.goal && !ai.goal.piece && nl.seg === ai.goal.seg && nl.from === ai.goal.from) ai.goal.piece = nl;
      } else break;
    }
  }
  update(dt, focus, camDir, simTime, pedsNear, player) {
    this.fN = (this.fN | 0) + 1;
    this.simTime = simTime; this.player = player; this.focusPt = focus;
    // spawn / despawn
    for (let i = this.vehicles.length - 1; i >= 0; i--) { const v = this.vehicles[i]; const d = Math.hypot(v.x - focus.x, v.z - focus.z); if (d > 330 && !v.keep) { this.remove(v); this.vehicles.splice(i, 1); } }
    if (this.spawnHint && (this.spawnHintT = (this.spawnHintT || 0) + dt) > 20) { this.spawnHint = undefined; this.spawnHintT = 0; } else if (!this.spawnHint) this.spawnHintT = 0;
    let budget = this.vehicles.length < this.max * 0.4 ? 2 : 1; while (this.vehicles.length < this.max && budget-- > 0) this.spawn(focus, camDir, this.vehicles.length < this.max * 0.4);
    this.updateParked(dt, focus);
    // spatial bins for following
    const all = this.vehicles; const playerV = player && player.vehicle; this.emergency = all.filter((v) => v.ai && v.ai.emergency && v.beaconsOn);
    this.binBodies(playerV); // every solid vehicle body (moving, parked, the player's, train cars) for the body sweep
    for (const v of all) this.step(v, dt, all, pedsNear, playerV, player);
    for (const v of all) if (v.towing) this.hitch(v);
    for (const v of this.parked) if (v.free) this.stepFree(v, dt);
    this.paxBudget = 1; for (const v of all) if (v.driverChar || (v.pax && v.pax.length) || (v.paxPlan && v.paxPlan.length)) this.updateOccupants(v, dt, focus);
    if (playerV && playerV.pax && playerV.pax.length) this.updateOccupants(playerV, dt, focus);
    this.updateDisembark(dt);
  }
  step(v, dt, all, peds, playerV, player) {
    if (v.free) { this.stepFree(v, dt); return; }
    const ai = v.ai; if (!ai) return; if (ai.stopped) { v.speed = 0; v.brake = true; return; } if (ai.chase) { stepChase(this, v, dt, all); return; } /* police intercept mode (Pursuit.js) */ if (ai.fuel && this.fuel && this.fuel.hold(v, ai, dt)) return; /* parked at a pump (FuelStations.js) */ const p = ai.pieces[0]; // stopped = crew out of a police unit (handbrake on, nobody at the wheel)
    const by = ai.rejoin ? v.yaw : v.yaw - (ai.hdg || 0); const [fx, fz] = [Math.sin(by), Math.cos(by)]; // lane direction (the body's lane-change yaw must not swing what counts as ahead / beside)
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
      for (const e of this.emergency) { if (e === v) continue; const rx = v.x - e.x, rz = v.z - e.z; const ey = e.yaw - ((e.ai && !e.ai.rejoin && e.ai.hdg) || 0), efx = Math.sin(ey), efz = Math.cos(ey); /* its lane direction, not the overtaking angle */ const al = rx * efx + rz * efz; if (al > 0 && al < 38 && Math.abs(rx * efz - rz * efx) < 2.6 && efx * fx + efz * fz > 0.5) { ai.yieldT = 2.5; break; } }
    }
    if (ai.yieldT > 0) { ai.yieldT -= dt; latWant = p.type === 'path' ? 0 : 0.9; }
    // kerb-parked cars stick into narrow lanes: pull out toward the centre line to pass them when the oncoming side is clear, otherwise wait behind
    if (!em && !(ai.yieldT > 0) && p.type !== 'path') { let need = 0, pk = null; const w2 = v.T.wid / 2;
      // every parked / abandoned vehicle by its real (rotated) footprint: kerb-side ones are passed by pulling out, anything else
      // standing in the lane (a car the player left in the road, one knocked askew) is waited behind — never driven through
      for (const o of this.parked) { if (o.dead || o.disposed || o.towedBy) continue; const rx = o.x - v.x, rz = o.z - v.z; if (Math.abs(rx) > 30 || Math.abs(rz) > 30) continue;
        const ofx = Math.sin(o.yaw), ofz = Math.cos(o.yaw), ohl = o.T.len / 2, ohw = o.T.wid / 2; let lmin = 1e9, lmax = -1e9, amin = 1e9, amax = -1e9;
        for (let c = 0; c < 4; c++) { const cl = c & 1 ? ohl : -ohl, cw = c & 2 ? ohw : -ohw; const qx = rx + ofx * cl + ofz * cw, qz = rz + ofz * cl - ofx * cw; const al = qx * fx + qz * fz, lt = qx * fz - qz * fx + ai.lat; if (al < amin) amin = al; if (al > amax) amax = al; if (lt < lmin) lmin = lt; if (lt > lmax) lmax = lt; }
        if (amax < -v.half - 2.5 || amin > 26) continue; /* stay out until 2.5 m past it before steering back in (the body yaws, so the tail would swing into it) */ if (lmax < -(w2 + 0.3) || lmin > w2 + 0.35) continue; // clear of our path
        if (lmin + lmax > 0.2 || (o.spot && lmin + lmax > -2)) { const n = w2 + 0.35 - lmin; if (n > need) { need = n; pk = o; } } /* on a kerb parking spot it is kerb-side by definition (on the main roads the kerb lane runs right over the parking line) */
        else if (amin > v.half * 0.3) { const g = amin - v.half; if (g < gap) { gap = g; leadV = 0; } } }
      if (pk) { let blocked = need > 2.6; if (!blocked) for (const o of all) { if (o === v) continue; const rx = o.x - v.x, rz = o.z - v.z; const al = rx * fx + rz * fz; if (al < -5 || al > 32) continue; const lo = rx * fz - rz * fx + ai.lat; if (lo < 0 && lo > -need - w2 - o.T.wid / 2 - 0.3) { const hd = Math.sin(o.yaw) * fx + Math.cos(o.yaw) * fz; if (hd < 0.3 || (al > -7 && al < 10 && !o.parked && Math.abs(lo) > 0.8)) { blocked = true; break; } } } /* oncoming, or (two-lane roads) someone already alongside in the lane we would pull into */
        if (blocked && Math.abs(ai.lat) < need * 0.6) consider(pk.x, pk.z, 0, pk.half + Math.min(2.5, need * 1.4), 4.5); /* wait with room to steer out round it */ else { latWant = Math.min(latWant, -need); if (need + ai.lat > 0.15) ai.creep = 1; } }
    }
    ai.latWant = latWant; /* applied kinematically below (heading angle → sideways drift), never as a slide */
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
    if (ai.fuel && this.fuel) { const d = this.fuel.stopDist(v, ai); if (d < stopAt) stopAt = d; }
    // --- IDM
    const nextCurve = p.type === 'line' ? ai.pieces[1] : p; const curveV = nextCurve && nextCurve.type === 'curve' && nextCurve.turn !== 'straight' ? (nextCurve.turn === 'uturn' ? 3 : 6.5) : ai.v0;
    let v0 = ai.v0; if (p.type === 'curve') v0 = curveV; else if (p.len - ai.s < 25) v0 = Math.min(v0, lerp(curveV, ai.v0, (p.len - ai.s) / 25));
    if (this.weatherRain) v0 *= 1 - this.weatherRain * 0.2;
    if (ai.yieldT > 0) v0 = Math.min(v0, 2.5);
    if (ai.creep) { v0 = Math.min(v0, 4); ai.creep = 0; } /* still steering out round a parked car */
    if (ai.rejoin) v0 = Math.min(v0, Math.abs(ai.rjErr || 0) > 0.5 ? 3.5 : 7.5);
    if (p.vlim) v0 = Math.min(v0, pathV(p, ai.s)); if (ai.fuel && ai.fuel.vcap) v0 = Math.min(v0, ai.fuel.vcap); /* forecourt paths: curvature speed; slowing to turn in */
    const s0 = 2.2, T = 1.2 / ai.aggressive, a = v.T.accel * 0.8, b = 3.5; const sp = v.speed;
    const bodyG = this.bodyGap(v, ai, dt); ai.bodyBind = bodyG < Math.min(gap, stopAt) - 0.5; if (bodyG < gap) { gap = bodyG; leadV = 0; } // never into another vehicle's body
    const g2 = Math.min(gap, stopAt); const lv = stopAt < gap ? 0 : leadV;
    const sStar = s0 + Math.max(0, sp * T + (sp * (sp - lv)) / (2 * Math.sqrt(a * b)));
    let acc = a * (1 - Math.pow(sp / Math.max(v0, 0.1), 4) - Math.pow(sStar / Math.max(g2, 0.1), 2));
    if (ai.bumped > 0) { ai.bumped -= dt; acc = -8; }
    acc = clamp(acc, -9, a);
    // pulling out round a vehicle parked in the lane: only rolling turns the wheels' path, so creep at walking pace up to the
    // actual contact point while steering out (the body guard's hard stop still keeps the bodies apart)
    if (ai.bodyBind && ai.bodyBlock && ai.bodyBlock.parked && Math.abs((ai.latWant ?? 0) - (ai.lat || 0)) > 0.1 && bodyG < 4) { const want = bodyG > 0.3 ? Math.min(1.2, bodyG) : 0; acc = clamp((want - sp) * 3, -8, 2); }
    // nosed up too close behind a vehicle parked in the lane to steer round it (followed someone who pulled out): back up a
    // couple of metres, as a driver would, when the road behind is clear
    const bb = ai.bodyBlock, mutual = bb && bb.ai && bb.ai.bodyBlock === v && bb.speed < 0.2 && v.id > bb.id; /* two turning across each other, nose to nose: the later one gives way */
    if (ai.bodyBind && bb && (bb.parked || mutual) && bodyG < 0.6 && sp < 0.2) ai.wedgedT = (ai.wedgedT || 0) + dt; else if (!(ai.reverse > 0)) ai.wedgedT = 0;
    if (ai.wedgedT > (mutual ? 2 : 3) && !(ai.reverse > 0)) { ai.reverse = 2.5; ai.wedgedT = 0; }
    if (ai.reverse > 0) { const ds = Math.min(ai.reverse, 0.9 * dt); if (ai.s - ds > 0.2 && !this.bodyBehind(v, ai, ds + 0.4)) { ai.s -= ds; ai.reverse -= ds; v.reversing = true; v.wheelRot -= ds / v.T.wheelR; } else ai.reverse = 0; if (!(ai.reverse > 0)) v.reversing = false; acc = Math.min(acc, 0); }
    v.speed = Math.max(0, sp + acc * dt); v.brake = acc < -1.0 || v.speed < 0.2;
    // horn when blocked by something other than a red light
    ai.honkCd -= dt;
    if (v.speed < 0.5 && gap < 8 && stopAt === Infinity) { ai.stuck += dt; if (ai.stuck > 2.5 / ai.aggressive && ai.honkCd <= 0) { ai.honkCd = 3 + this.rng.next() * 4; this.events.emit('horn', v); } } else ai.stuck = Math.max(0, ai.stuck - dt);
    if (ai.stuck > 25 && !v.police && !ai.fuel) { v.keep = false; this.remove(v); this.vehicles.splice(this.vehicles.indexOf(v), 1); return; } // hopelessly stuck → recycle out of view
    // --- advance along pieces
    if (ai.rejoin) { this.driveRejoin(v, dt); return; }
    // lateral offset (pulling out round a parked car, over for an emergency unit) as real kinematics: the state is the body's
    // heading angle to the lane (ai.hdg); it turns only while rolling (bicycle-model steering rate) and the sideways drift is
    // speed·sin(angle) — so position and heading always agree: no crabbing, no turning on the spot
    { const sp = v.speed, lw = ai.latWant ?? 0; ai.hdg = ai.hdg || 0; const vdes = clamp((lw - ai.lat) * 1.1, -2.2, 2.2);
      const want = Math.abs(lw - ai.lat) < 0.01 && Math.abs(ai.hdg) < 0.002 ? 0 : Math.asin(clamp(vdes / Math.max(sp, 0.5), -0.5, 0.5));
      const yr = Math.min((sp * Math.tan(0.6)) / Math.max(1.2, v.T.len * 0.62), 3.5 / Math.max(sp, 0.5)) * dt; const h0 = ai.hdg; ai.hdg += clamp(want - ai.hdg, -yr, yr); // steering lock and ~0.35 g of grip
      const hm = (h0 + ai.hdg) / 2; const s0 = ai.s, l0 = ai.lat; ai.lat += sp * Math.sin(hm) * dt; ai.s += sp * Math.cos(hm) * dt;
      if (ai.s - s0 > bodyG) { const f = Math.max(0, bodyG) / (ai.s - s0); ai.s = s0 + (ai.s - s0) * f; ai.lat = l0 + (ai.lat - l0) * f; v.speed = 0; } } // hard stop at the body contact
    if (ai.sMaxP && ai.sMaxP === ai.pieces[0] && ai.s > ai.sMax) { ai.s = ai.sMax; v.speed = 0; } // hard stop (FuelStations: pump bay / give-way line)
    while (ai.s > ai.pieces[0].len && ai.pieces.length > 1) { ai.s -= ai.pieces[0].len; ai.pieces.shift(); this.extend(v); }
    const [x, z, yaw] = evalPiece(ai.pieces[0], ai.s);
    // body heading = direction of travel: lane heading + the lateral angle, corrected for an offset on a curve (the offset path
    // is longer/shorter by (1 − κ·lat)); exact, so a car never moves sideways relative to its own nose
    let kap = 0; if (ai.lat && ai.pieces[0].type === 'curve') { const pc = ai.pieces[0], a = evalPiece(pc, Math.max(0, ai.s - 0.25)), b = evalPiece(pc, Math.min(pc.len, ai.s + 0.25)); kap = wrapA(b[2] - a[2]) / Math.max(0.05, Math.min(pc.len, ai.s + 0.25) - Math.max(0, ai.s - 0.25)); }
    const hy = wrapA(yaw + Math.atan2(Math.sin(ai.hdg), Math.cos(ai.hdg) * Math.max(0.2, 1 - kap * ai.lat)));
    const dyaw = wrapA(hy - v.yaw); v.steer = clamp(dyaw * 4, -0.6, 0.6);
    const lx = Math.cos(yaw) * ai.lat, lz = -Math.sin(yaw) * ai.lat; v.x = x + lx; v.z = z + lz; v.yaw = hy;
    v.y = L.groundY(v.x, v.z); v.lights = this.night > 0.4; v.sync(dt);
  }
  // back into the lane after a knock / a chase: the car steers toward a point ahead on its lane (bicycle-model turn rate,
  // walls are solid) instead of being slid over; once nearly aligned the small remainder is handed to the lateral offset
  driveRejoin(v, dt) {
    const ai = v.ai; let pc = ai.pieces[0]; ai.s = Math.max(0, projectS(pc, v.x, v.z, ai.s));
    while (ai.s > pc.len) { ai.s -= pc.len; ai.pieces.shift(); this.extend(v); pc = ai.pieces[0]; ai.s = Math.max(0, projectS(pc, v.x, v.z, ai.s)); }
    let s = ai.s + Math.max(4.5, v.speed * 0.9 + 3), k = 0; while (k < ai.pieces.length - 1 && s > ai.pieces[k].len) { s -= ai.pieces[k].len; k++; }
    const [tx, tz] = evalPiece(ai.pieces[k], s); const dyaw = wrapA(Math.atan2(tx - v.x, tz - v.z) - v.yaw); ai.rjErr = dyaw;
    const maxYr = Math.min((v.speed * Math.tan(0.55)) / Math.max(1.2, v.T.len * 0.62), 4 / Math.max(v.speed, 0.5)); const y0 = v.yaw; v.yaw = wrapA(v.yaw + clamp(dyaw * 2.5, -maxYr, maxYr) * dt); v.steer = clamp(dyaw * 3, -0.6, 0.6);
    const ym = y0 + wrapA(v.yaw - y0) / 2; v.x += Math.sin(ym) * v.speed * dt; v.z += Math.cos(ym) * v.speed * dt;
    for (const [cx, cz] of v.circles()) { const r = this.collision.resolveCircle(cx, cz, v.radius, v.y, 0.25, 2, { vehicle: true }); if (r.hit) { v.x += r.x - cx; v.z += r.z - cz; } }
    ai.s = Math.max(0, projectS(pc, v.x, v.z, ai.s)); while (ai.s > pc.len && ai.pieces.length > 1) { ai.s -= pc.len; ai.pieces.shift(); this.extend(v); pc = ai.pieces[0]; ai.s = Math.max(0, projectS(pc, v.x, v.z, ai.s)); } // where it is now, after this frame's move
    const [lx, lz, lyaw] = evalPiece(pc, Math.min(ai.s, pc.len)); const ye = wrapA(v.yaw - lyaw); const lat = (v.x - lx) * Math.cos(lyaw) - (v.z - lz) * Math.sin(lyaw);
    if (Math.abs(lat) < 0.6 && Math.abs(ye) < 0.15 && Math.abs((v.x - lx) * Math.sin(lyaw) + (v.z - lz) * Math.cos(lyaw)) < 0.3) { ai.rejoin = false; ai.lat = lat; ai.hdg = ye; } // aligned: lane-following takes over seamlessly
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
    if (v.ai && v.ai.chase && f.rest > 0.45 + Math.min(1.5, f.sev * 0.1)) { v.free = null; v.speed = 0; return; } // a pursuing unit knocked aside: straight back into the chase
    if (f.rest < 1.2 + Math.min(5, f.sev * 0.35)) return;
    const ai = v.ai; if (!ai) { v.free = null; return; } /* parked car: stays where it was pushed */
    // re-anchor on the lane: nearest arc-length on the current piece; the offset decays smoothly in step()
    const pc = ai.pieces[0]; let bestS = ai.s, bd = Infinity; for (let s2 = Math.max(0, ai.s - 12); s2 <= Math.min(pc.len, ai.s + 12); s2 += 0.5) { const [x, z] = evalPiece(pc, s2); const d = (x - v.x) ** 2 + (z - v.z) ** 2; if (d < bd) { bd = d; bestS = s2; } }
    if (bd > 36) { const P = this.player; if (P && Math.hypot(P.x - v.x, P.z - v.z) > 90) { this.remove(v); const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1); } return; } /* thrown far off the road: stays as a stalled car until you are well away */
    ai.s = bestS; ai.lat = 0; ai.hdg = 0; ai.rejoin = true; v.free = null; ai.bumped = 1; /* drives back into the lane (driveRejoin) */
  }
  remove(v) { if (v.towing) { v.towing.dispose(); v.towing = null; } if (v.squad && v.driverChar) { v.mesh.remove(v.driverChar.root); v.driverChar = null; const m = v.squad; v.squad = null; if (v.onRemove) v.onRemove(m); } /* a squad-mate at the wheel is never disposed */ if (v.driverChar) { v.driverChar.dispose(); } if (v.pax && v.pax.length) this.dropPax(v); v.dispose(); }
  // Hand a vehicle over to the player (car-jack: driver steps out and walks off grumbling)
  takeOver(v, keepDriver = false) { const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1); const pi = this.parked.indexOf(v); if (pi >= 0) this.parked.splice(pi, 1); const hadDriver = !!v.driverChar; this.disembark(v, 'flee', this.player ? { x: this.player.x, z: this.player.z } : null); if (v.driverChar && !keepDriver) { v.mesh.remove(v.driverChar.root); v.driverChar.dispose(); v.driverChar = null; } v.ai = null; v.hold = false; v.parked = false; v.keep = true; v.left = null; if (v.spot) { (this.vacated || (this.vacated = new Map())).set(v.spot, 0); v.spot = null; } return hadDriver; } // the bay stays empty (no new car pops into it behind the player) until it is far away and some time has passed
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
  // the vehicle that belongs on a parking spot (deterministic per spot)
  parkedLook(p) { const r = new RNG(Math.floor(p.x * 31 + p.z * 17)); let type = r.weighted([['car', 1.5], ['tuktuk', 3], ['van', 0.8], ['sedan', 0.6], ['bike', 2], ['taxi', 0.6], ['cat', 7]]); if (type === 'cat') type = r.weighted(PARKED_LIST); return { type, seed: Math.floor(r.next() * 1e6) }; }
  streetTypes() { const used = new Set(PARKED_LIST.map((w) => w[0])); for (const m of [...Object.values(MIX), ...Object.values(CAT_W)]) for (const [t] of m) used.add(t); return Object.keys(VTYPES).filter((t) => used.has(t)); }
  noteLook(type, seed) { const L = this.looks || (this.looks = new Map()); let a = L.get(type); if (!a) L.set(type, (a = [])); if (a.length < 16 && !a.includes(seed)) a.push(seed); }
  // loading screen: one look of every vehicle type (so traffic always has a built look to fall back on) and the parked
  // vehicles around the spawn point(s) - otherwise the first seconds of play build them, 10-40 ms per first-time model
  async warmModels(points, pr = () => {}) {
    const jobs = this.streetTypes().map((t, i) => [t, 1009 + i * 7919]); for (let k = 1; k <= 12; k++) for (const t of ['police', 'policejeep', 'ambulance']) if (VTYPES[t]) jobs.push([t, 3000 + k * 7]); // police / ambulance units use seed 3000 + 7 * unit id (PoliceResponse.makeUnit)
    for (const [x, z] of points || []) { const near = plan.parking.map((p) => [(p.x - x) ** 2 + (p.z - z) ** 2, p]).filter((n) => n[0] < 150 * 150).sort((a, b) => a[0] - b[0]).slice(0, 26); for (const [, p] of near) { const l = this.parkedLook(p); jobs.push([l.type, l.seed]); } }
    // every type x body variant shape (each paint colour is then a ~1 ms recolour, never a model build mid-drive), and the
    // traffic drivers' 16 looks (a first-time character build is 10-30 ms)
    const shapes = []; for (const t of Object.keys(VTYPES)) for (let v = 0; v < 4; v++) shapes.push([t, v]);
    let t0 = performance.now(); const all = shapes.length + this.driverSpecs.length + jobs.length;
    for (let i = 0; i < shapes.length; i++) { try { warmShape(shapes[i][0], shapes[i][1]); } catch (e) { console.warn('warm vehicle shape', shapes[i], e); } pr(i / all); if (performance.now() - t0 > 30) { await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); } }
    for (let i = 0; i < this.driverSpecs.length; i++) { try { new Character(this.driverSpecs[i]).dispose(); } catch (e) { console.warn('warm driver', e); } pr((shapes.length + i) / all); if (performance.now() - t0 > 30) { await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); } }
    for (let i = 0; i < jobs.length; i++) { const [t, sd] = jobs[i]; try { warmModel(t, sd); this.noteLook(t, sd); } catch (e) { console.warn('warm vehicle', t, e); } pr((shapes.length + this.driverSpecs.length + i + 1) / all); if (performance.now() - t0 > 30) { await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); } }
  }
  updateParked(dt, focus) {
    this.parkedAcc = (this.parkedAcc || 0) + dt; this.parkedTimer -= dt; if (this.parkedTimer > 0) return; const tick = this.parkedAcc; this.parkedAcc = 0; this.parkedTimer = 1.0; // tick = real time since the last pass
    for (const v of this.parked.slice()) if (v.left) { if (Math.hypot(v.x - focus.x, v.z - focus.z) > TOW_DIST) v.left.away += tick; else v.left.away = 0; if (v.left.away >= TOW_TIME) this.tow(v); }
    for (let i = this.parked.length - 1; i >= 0; i--) { const v = this.parked[i]; if (Math.hypot(v.x - focus.x, v.z - focus.z) > 200 && !v.keep) { v.dispose(); this.parked.splice(i, 1); } }
    if (!this.parkedSet) this.parkedSet = new Set(); const near = [];
    for (const p of plan.parking) { const d = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2; if (d < 150 * 150) near.push([d, p]); }
    near.sort((a, b) => a[0] - b[0]);
    const want = new Set(near.slice(0, 26).map((n) => n[1]).filter((p) => !(this.reserved && this.reserved(p)))); // reserved = kept clear (e.g. a cinematic's driving lane)
    for (const v of this.parked) if (v.spot && !want.has(v.spot) && !v.keep) { v.dispose(); v.dead = true; this.parkedSet.delete(v.spot); }
    this.parked = this.parked.filter((v) => !v.dead);
    if (this.vacated) for (const [sp, t] of this.vacated) { const nt = t + tick; if (!want.has(sp) && nt > 90 && Math.hypot(sp.x - focus.x, sp.z - focus.z) > 160) { this.vacated.delete(sp); this.parkedSet.delete(sp); } else this.vacated.set(sp, nt); }
    let made = 0; // nearest spots first; per frame at most 4 already-built looks or ONE first-time model build (entering a street used to build up to 26 at once)
    for (const p of want) {
      if (this.parkedSet.has(p)) continue; if (made >= 2) { this.parkedTimer = 0; break; } const { type, seed } = this.parkedLook(p); if (this.spotTaken(p, type)) continue; const fresh = !modelCached(type, seed); if (fresh && (made > 0 || performance.now() - (this.lastBuild || -1e9) < 300)) { this.parkedTimer = 0.05; continue; } if (fresh) this.lastBuild = performance.now(); made += fresh ? 2 : 1; /* a first-time model build is the only one this frame; otherwise two per frame (~3 ms each) until the street is filled */
      const v = new Vehicle(type, seed, this.scene); this.noteLook(type, seed); parkOnStand(v); v.place(p.x, p.z, p.yaw); v.parked = true; v.spot = p; this.parked.push(v); this.parkedSet.add(p);
    }
  }
  nearest(x, z, maxD = 4) { let best = null, bd = maxD * maxD; for (const v of this.all()) { if (v.player || v.isTrain || v.squad || v.towedBy) continue; const d = (v.x - x) ** 2 + (v.z - z) ** 2; if (d < bd) { bd = d; best = v; } } return best; }
}
export { evalPiece, linePiece, curvePiece, otherEnd, segNodes, laneOffset };
