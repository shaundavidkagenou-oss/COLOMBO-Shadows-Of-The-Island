// Four Sri Lankan filling stations (FuelStationGeo.js builds them): static build + the runtime service that sends traffic
// in to refuel and runs the attendants ('pumpers') who fuel every vehicle. The player has no fuel system.
//
// Visit: a car / van / tuk / motorbike in the kerb lane is picked ~50–70 m before the station, slows, and is handed a
// smooth forecourt path (Hermite curves sampled to a poly piece) in through the entry driveway to its pump bay. It stops,
// switches the engine off; an attendant walks to the driver's window, takes the order, presets the dispenser, lifts the
// nozzle (live mesh + live hose), fuels at the filler, holsters, takes the cash and returns to post. The car then leaves
// along the exit path, gives way at the exit driveway, and merges back into the kerb lane — the rest of the trip is normal
// traffic. Knocked, hijacked or removed mid-visit: the bay and the attendant are released and a nozzle that was in the
// car drops on the apron (and is picked up and holstered). Attendants are ordinary crowd people in a 'job' state: they
// react, flee, fight back, get knocked down and can be killed like anyone else.
import * as THREE from 'three';
import * as L from './Layout.js';
import { buildFuelStation, nozzleGeometry, nozzleMaterial, HoseTube, SPOUT_TIP, HOSE_PT, GRADES, FS, YI } from './FuelStationGeo.js';
import { linePiece, segNodes } from '../vehicles/Traffic.js';
import { VTYPES } from '../vehicles/VehicleModels.js';
import { makeAttendantAppearance } from '../actors/Appearance.js';

export function buildFuelStations() {
  const group = new THREE.Group(); group.name = 'fuel-stations'; const stations = [], colliders = [], crownBoxes = [];
  for (const site of L.FUEL_SITES) { const geo = buildFuelStation(site); group.add(geo.group); stations.push(geo); colliders.push(...geo.colliders); crownBoxes.push(...geo.crownBoxes); }
  return { group, stations, colliders, crownBoxes };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const DRIVE = L.FUEL_DRIVE, SLAB = L.FUEL_SLAB;
const ELIGIBLE = new Set(['car', 'van', 'tuk', 'bike']);
const NO_FUEL = new Set(['police', 'policejeep', 'policebike', 'ambulance']);
const FUEL_TYPES = new Set(Object.keys(VTYPES).filter((k) => { const T = VTYPES[k]; return T && ELIGIBLE.has(T.entry) && !NO_FUEL.has(k) && T.len <= 5.4; }));
// bays: lane, the side of the vehicle that faces the island (+1 = its left), island index, dispenser face side (−1 = the
// island's −w face); lane C (between island 2 and the shop walkway) is too tight a turn for cars: three-wheelers/bikes only
export const BAYS = [
  { id: 'A', lane: 'A', side: 1, island: 0, fs: -1 },
  { id: 'BL', lane: 'B', side: 1, island: 1, fs: -1 },
  { id: 'BR', lane: 'B', side: -1, island: 0, fs: 1 },
  { id: 'C', lane: 'C', side: -1, island: 1, fs: 1, small: true },
];
const ALIGN_U = { A: -11, B: -10, C: -9 };
const HAND_IN_NOZZLE = new THREE.Vector3(-0.012, 0.085, -0.01); // wrist (hand-bone origin) in the nozzle frame: the grip sits in the palm
const NOZZLE_IN_HAND = HAND_IN_NOZZLE.clone().negate();
const CARRY_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.78); // hand at the hip, spout forward-down
const KEYPAD = new THREE.Vector3(-0.42, 1.615, 0.075); // face frame: wrist target in front of the keypad (left of the display)
const DISPLAY = new THREE.Vector3(0, 1.76, -0.04);
const UP = new THREE.Vector3(0, 1, 0);
const _vFill = new THREE.Vector3();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s1 = new THREE.Vector3();

// vehicle-local (x = its left, z = forward) ↔ world
function vWorld(v, lx, ly, lz, out = new THREE.Vector3()) { const c = Math.cos(v.yaw), s = Math.sin(v.yaw); return out.set(v.x + c * lx + s * lz, (v.y || 0) + ly, v.z - s * lx + c * lz); }
function vLocal(v, x, z) { const dx = x - v.x, dz = z - v.z, c = Math.cos(v.yaw), s = Math.sin(v.yaw); return [c * dx - s * dz, s * dx + c * dz]; }
function seatZ(v) { try { const s = v.driverSeat && v.driverSeat(); if (s && Number.isFinite(s.z)) return s.z; } catch (e) { /* no seat table */ } return 0.15; }
// where the fuel goes in, where the attendant stands for it and at the driver's window (vehicle-local)
export function fuelPoints(v, side) {
  const P = fuelPoints0(v, side), off = v.T.wid / 2 + 0.42; // never inside the 0.3 m body push-out (the attendant could not get there)
  for (const k of ['stand', 'win']) { const q = P[k]; if (Math.abs(q[0]) < off) q[0] = Math.sign(q[0] || side) * off; }
  return P;
}
function fuelPoints0(v, side) {
  const T = v.T, e = T.entry, hw = T.wid / 2;
  if (e === 'bike') return { fill: [0, Math.min(0.92, T.hgt * 0.8), 0.24], down: true, stand: [side * 0.66, 0.22], win: [side * 0.66, 0.0], talk: [0, 1.25, -0.05] };
  if (e === 'tuk') return { fill: [side * 0.44, 0.7, 0.12], stand: [side * 1.02, 0.12], win: [side * 1.0, 0.5], talk: [0, 1.25, 0.45] };
  const sz = seatZ(v); return { fill: [side * (hw - 0.02), clamp(T.hgt * 0.52, 0.72, 1.02), -T.len * 0.31], stand: [side * (hw + 0.56), -T.len * 0.31 - 0.12], win: [-(hw + 0.5), sz + 0.05], winSide: -1, talk: [-hw + 0.1, 1.12, sz + 0.05] };
}

// ------------------------------------------------------------------------------------------------ forecourt paths
// waypoints in the station frame {u, w, phi (heading from +u toward +w), k (tangent scale)} → poly piece in world space
// peak curvature of one Hermite segment for tangent scales ka, kb (× chord)
function segKap(a, b, ka, kb) {
  const Lc = Math.hypot(b.u - a.u, b.w - a.w); const P0 = [a.u, a.w], P1 = [a.u + Math.cos(a.phi) * ka * Lc, a.w + Math.sin(a.phi) * ka * Lc], P2 = [b.u - Math.cos(b.phi) * kb * Lc, b.w - Math.sin(b.phi) * kb * Lc], P3 = [b.u, b.w]; let mk = 0;
  for (let j = 0; j <= 32; j++) { const t = j / 32, m = 1 - t; const d1 = [0, 1].map((q) => 3 * m * m * (P1[q] - P0[q]) + 6 * m * t * (P2[q] - P1[q]) + 3 * t * t * (P3[q] - P2[q])), d2 = [0, 1].map((q) => 6 * m * (P2[q] - 2 * P1[q] + P0[q]) + 6 * t * (P3[q] - 2 * P2[q] + P1[q]));
    const sp = Math.hypot(d1[0], d1[1]); if (sp < 1e-6) return Infinity; mk = Math.max(mk, Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) / (sp * sp * sp)); }
  return mk;
}
const KS = [0.3, 0.38, 0.46, 0.55, 0.65];
export function buildPath(site, wps, opts = {}) {
  const poly = [], loc = [];
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1]; const Lc = Math.hypot(b.u - a.u, b.w - a.w);
    // tangent lengths: the pair with the gentlest peak curvature (smooth, drivable turns), unless fixed by the waypoint
    let bka = a.k ?? 0.42, bkb = b.kb ?? b.k ?? 0.42; if (!a.fix) { let best = Infinity; for (const x of KS) for (const y of KS) { const k = segKap(a, b, x, y); if (k < best - 1e-6) { best = k; bka = x; bkb = y; } } }
    const ka = bka * Lc, kb = bkb * Lc;
    const P0 = [a.u, a.w], P1 = [a.u + Math.cos(a.phi) * ka, a.w + Math.sin(a.phi) * ka], P2 = [b.u - Math.cos(b.phi) * kb, b.w - Math.sin(b.phi) * kb], P3 = [b.u, b.w];
    const n = Math.max(4, Math.ceil(Lc / 0.25));
    for (let j = i ? 1 : 0; j <= n; j++) { const t = j / n, m = 1 - t;
      const u = m * m * m * P0[0] + 3 * m * m * t * P1[0] + 3 * m * t * t * P2[0] + t * t * t * P3[0], w = m * m * m * P0[1] + 3 * m * m * t * P1[1] + 3 * m * t * t * P2[1] + t * t * t * P3[1];
      let du = 3 * m * m * (P1[0] - P0[0]) + 6 * m * t * (P2[0] - P1[0]) + 3 * t * t * (P3[0] - P2[0]), dw = 3 * m * m * (P1[1] - P0[1]) + 6 * m * t * (P2[1] - P1[1]) + 3 * t * t * (P3[1] - P2[1]);
      if (du * du + dw * dw < 1e-9) { du = Math.cos(t < 0.5 ? a.phi : b.phi); dw = Math.sin(t < 0.5 ? a.phi : b.phi); }
      const [x, z] = site.toWorld(u, w); const dx = site.U[0] * du + site.Wv[0] * dw, dz = site.U[1] * du + site.Wv[1] * dw; poly.push([x, z, Math.atan2(dx, dz)]); loc.push([u, w]); }
  }
  // unwrap the yaw so interpolation between samples never takes the long way round
  for (let i = 1; i < poly.length; i++) poly[i][2] = poly[i - 1][2] + wrapA(poly[i][2] - poly[i - 1][2]);
  const cum = [0]; for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const len = cum[cum.length - 1];
  // speed limit: lateral grip (~0.17 g) on the local curvature, walking pace on the apron, braking-distance profile behind it
  const vmax = opts.vmax ?? 7, vlim = new Array(poly.length), kap = new Array(poly.length);
  for (let i = 0; i < poly.length; i++) { const a = Math.max(0, i - 2), b = Math.min(poly.length - 1, i + 2); const ds = cum[b] - cum[a]; kap[i] = ds > 1e-3 ? Math.abs(poly[b][2] - poly[a][2]) / ds : 0;
    let vv = Math.sqrt(1.7 / Math.max(kap[i], 1e-4)); if (loc[i][1] > -0.6) vv = Math.min(vv, 3.4); else if (loc[i][1] > -site.walk - 0.6) vv = Math.min(vv, 4.2); vlim[i] = clamp(vv, 2.0, vmax); }
  for (let i = poly.length - 2; i >= 0; i--) vlim[i] = Math.min(vlim[i], Math.sqrt(vlim[i + 1] ** 2 + 2 * 1.4 * (cum[i + 1] - cum[i])));
  let kmax = 0; for (let i = 3; i < kap.length - 3; i++) kmax = Math.max(kmax, kap[i]);
  return { type: 'path', poly, cum, len: Math.max(0.1, len), vlim, loc, kap, kmax, seg: site.seg };
}

// ------------------------------------------------------------------------------------------------ live nozzle + hose
class LiveNozzle {
  constructor(st, slot) {
    this.st = st; this.slot = slot; const col = GRADES[slot.grade].col;
    this.mesh = new THREE.Mesh(nozzleGeometry(col === '#202020' ? '#2a2a2a' : col), nozzleMaterial()); this.mesh.castShadow = true; this.mesh.matrixAutoUpdate = false; this.mesh.name = 'live-nozzle';
    this.hose = new HoseTube(28, 0.019, 7); this.hoseMesh = new THREE.Mesh(this.hose.geo, st.geo.hoseMat); this.hoseMesh.castShadow = true; this.hoseMesh.frustumCulled = false; this.hoseMesh.matrixAutoUpdate = false; this.hoseMesh.name = 'live-hose';
    st.svc.scene.add(this.mesh); st.svc.scene.add(this.hoseMesh); st.geo.hideSlot(slot.i, true);
    const fm = _m1.multiplyMatrices(st.mw, slot.face.frame); this.n = new THREE.Vector3(0, 0, 1).transformDirection(fm); this.outlet = slot.outlet.clone().applyMatrix4(st.mw);
    this.hm = new THREE.Matrix4().multiplyMatrices(st.mw, slot.holster); this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.hm.decompose(this.pos, this.quat, _s1);
    this.bx = [-0.3, 0, 0.3][slot.k] ?? 0; this.mode = 'holster'; this.fromP = this.pos.clone(); this.fromQ = this.quat.clone(); this.t = 1; this.dur = 0; this.ease = smooth; this.tgt = null; this.groundP = null; this.groundQ = null; this.apply();
  }
  holsterPose(p, q) { this.hm.decompose(p, q, _s1); }
  // switch the pose source; the change is blended from wherever the nozzle is now
  go(mode, dur, tgt = null, ease = smooth) { this.fromP.copy(this.pos); this.fromQ.copy(this.quat); this.mode = mode; this.t = 0; this.dur = Math.max(1e-3, dur); this.tgt = tgt; this.ease = ease; }
  drop() { // falls onto the apron, lying on its side
    const f = _v1.set(0, 0, 1).applyQuaternion(this.quat); f.y = 0; if (f.lengthSq() < 1e-4) f.set(1, 0, 0); f.normalize(); const x = _v2.set(0, 1, 0), y = _v3.crossVectors(f, x);
    this.groundQ = new THREE.Quaternion().setFromRotationMatrix(_m2.makeBasis(x, y, f)); const gp = this.pos.clone(); gp.y = this.st.groundTop(gp.x, gp.z) + 0.03; this.groundP = gp; this.go('ground', 0.42, null, (t) => t * t);
  }
  update(dt, handPose) {
    let tp = _v1, tq = _q1;
    if (this.mode === 'holster') this.holsterPose(tp, tq);
    else if (this.mode === 'ground') { tp.copy(this.groundP); tq.copy(this.groundQ); }
    else if (this.tgt) this.tgt(tp, tq);
    else { tp.copy(this.pos); tq.copy(this.quat); }
    if (this.mode === 'hand' && handPose) { tp.copy(handPose.p); tq.copy(handPose.q); } // carried: in the (IK-posed) hand, blended in when just picked up
    this.t += dt; const k = this.ease(Math.min(1, this.t / this.dur)); this.pos.lerpVectors(this.fromP, tp, k); this.quat.slerpQuaternions(this.fromQ, tq, k);
    this.apply();
  }
  settled() { return this.t >= this.dur; }
  apply() {
    this.mesh.matrix.compose(this.pos, this.quat, _s1.set(1, 1, 1)); this.mesh.matrixWorldNeedsUpdate = true;
    // hose: outlet → down and out of the cabinet → sagging catenary-like curve → into the back of the nozzle; never under the apron
    const P0 = this.outlet, H = _v2.copy(HOSE_PT).applyQuaternion(this.quat).add(this.pos), back = _v3.set(0, 0, -1).applyQuaternion(this.quat);
    const d = P0.distanceTo(H), slack = Math.max(0, 3.7 - d), pts = this.hose.pts, n = pts.length;
    const c1x = P0.x + this.n.x * 0.16, c1y = P0.y - 0.4, c1z = P0.z + this.n.z * 0.16, c2x = H.x + back.x * 0.32, c2y = H.y + back.y * 0.32, c2z = H.z + back.z * 0.32;
    for (let i = 0; i < n; i++) { const t = i / (n - 1), m = 1 - t; const b0 = m * m * m, b1 = 3 * m * m * t, b2 = 3 * m * t * t, b3 = t * t * t;
      const x = b0 * P0.x + b1 * c1x + b2 * c2x + b3 * H.x, z = b0 * P0.z + b1 * c1z + b2 * c2z + b3 * H.z; let y = b0 * P0.y + b1 * c1y + b2 * c2y + b3 * H.y;
      y -= slack * 0.36 * Math.sin(Math.PI * t) * (0.6 + 0.4 * m); y = Math.max(y, this.st.groundTop(x, z) + 0.02); pts[i].set(x, y, z); }
    this.hose.update(); this.hoseMesh.matrixWorldNeedsUpdate = true;
  }
  dispose() { this.st.svc.scene.remove(this.mesh); this.st.svc.scene.remove(this.hoseMesh); this.hose.geo.dispose(); this.st.geo.hideSlot(this.slot.i, false); }
}

// ------------------------------------------------------------------------------------------------ attendant
// the job state machine of one attendant; the crowd calls step() (movement) and post() (hands / nozzle after the pose)
class Attendant {
  constructor(st, idx) {
    this.st = st; this.idx = idx; this.p = null; this.dead = false; this.phase = 'post'; this.t = 0; this.task = null; this.noz = null; this.route = null; this.wait = 0;
    const wi = FS.islands[idx]; this.post = { u: -FS.isHalfLen - 0.75, w: wi + (idx ? 0.25 : -0.25) }; this.stuckT = 0; this.lastX = 0; this.lastZ = 0; this.cash = null;
    this.kR = 0; this.kL = 0; this.kRt = 0; this.kLt = 0; this.handR = { p: new THREE.Vector3(), q: new THREE.Quaternion() }; this.wantR = null; this.wantL = null; this.look = null; this.nod = 0; this.interrupted = false;
    this.job = { step: (p, dt, ctx, lod) => this.step(dt, lod), post: (p, lod, posed) => this.postPose(lod, posed), interrupt: (p, state) => this.interrupt(state), resume: () => this.resume() };
  }
  get free() { return this.p && !this.dead && !this.interrupted && !this.task && (this.phase === 'post' || this.phase === 'idle' || this.phase === 'toPost'); }
  spawn() {
    const st = this.st, [x, z] = st.site.toWorld(this.post.u, this.post.w); const seed = (st.idx * 7919 + this.idx * 104729 + (st.spawnN++) * 31) | 0;
    const sp = makeAttendantAppearance(seed, L.FUEL_BRANDS[st.site.brand]); const crowd = st.svc.crowd; const node = nearestPedNode(x, z);
    const p = crowd.makePed(sp, x, z, node); p.x = x; p.z = z; p.yaw = st.yawToU(-1); p.state = 'job'; p.job = this.job; p.keep = true; p.umbrella = false; p.jog = false; p.pace = 1.25; p.target = null; p.edge = null; p.attendant = true;
    crowd.place(p); this.p = p; this.dead = false; this.phase = 'post'; this.task = null; this.interrupted = false; this.lastX = x; this.lastZ = z; return p;
  }
  despawn() { const p = this.p; if (!p) return; this.releaseHands(true); if (this.noz) { this.noz.dispose(); this.noz = null; } if (this.task) this.st.dropAttendant(this.task); this.task = null; p.job = null; p.keep = false; if (!p.dead) this.st.svc.crowd.remove(p); this.p = null; }
  // ---- crowd hooks
  interrupt(state) { // shoved, frightened, knocked down, shot: let go of everything at once
    this.interrupted = true; this.releaseHands(true);
    if (this.noz && this.noz.mode !== 'car' && this.noz.mode !== 'holster') this.noz.drop();
    if (this.noz && this.noz.mode === 'holster') { const n = this.noz; n.dispose(); this.noz = null; if (this.task && this.task.noz === n) this.task.noz = null; }
    const a = this.p && this.p.ch.anim; if (a) { a.medLean = undefined; a.holdR = null; }
    if (state === 'down' || this.p?.dead) this.dead = !!this.p?.dead;
  }
  resume() {
    this.interrupted = false; const f = this.task;
    if (this.noz && this.noz.mode === 'ground') this.setPhase('toNozzle');
    else if (f && f.phase === 'service' && this.noz && this.noz.mode === 'car') this.setPhase('toFiller');
    else if (f && f.phase === 'service') this.setPhase(f.fuelled ? 'toWindow2' : f.ordered ? 'toPump' : 'toWindow');
    else this.setPhase('toPost');
  }
  setPhase(ph) { this.phase = ph; this.t = 0; this.route = null; this.wait = 0; this.stuckT = 0; this.bestD = undefined; this.stallT = 0; }
  releaseHands(hard) { const p = this.p; if (!p) return; const a = p.ch.anim; this.kRt = 0; this.kLt = 0; if (hard) { this.kR = this.kL = 0; a.holdKR = a.holdKL = 0; a.holdWR = a.holdWL = null; a.holdQR = a.holdQL = null; if (a.act === 'pump') a.set(null); a.pumpLook = null; a.pumpNod = 0; a.pumpCarry = 0; } this.hideCash(); }
  // ---- geometry helpers
  standAtFace(fc, bx = 0) { return this.st.faceGround(fc, bx, 0.36); } // on the island top, in front of the boots
  // ---- movement: returns the crowd's {desired, tx, tz, avoid, accel}
  moveTo(x, z, final = true, speed = 1.25) {
    const p = this.p, d = Math.hypot(x - p.x, z - p.z); p.faceYaw = null;
    if (d < (final ? 0.14 : 0.35)) return null; // arrived
    return { desired: final ? Math.min(speed, 0.35 + d * 1.1) : speed, tx: x, tz: z, avoid: false, accel: 3.2 }; // routes are planned round islands and cars: no side-steering into gaps
  }
  follow(route, speed) {
    while (route.length) { const [x, z] = route[0]; const last = route.length === 1; let r = this.moveTo(x, z, last, speed);
      if (r && last) { // close to the goal but making no headway (a car's body, another person): count it as arrived instead of jittering
        const d = Math.hypot(x - this.p.x, z - this.p.z); if (d < (this.bestD ?? 1e9) - 0.03) { this.bestD = d; this.stallT = 0; } else this.stallT = (this.stallT || 0) + (this.dt || 0);
        if (d < 0.75 && this.stallT > 0.7) r = null; }
      if (r) return r; route.shift(); this.bestD = undefined; this.stallT = 0; }
    return null;
  }
  faceTo(x, z) { const p = this.p; p.faceYaw = Math.atan2(x - p.x, z - p.z); return Math.abs(wrapA(p.faceYaw - p.yaw)) < 0.22; }
  idle() { return { desired: 0, tx: null, tz: null, avoid: false }; }
  step(dt, lod) {
    const p = this.p; if (!p || p.dead) return this.idle(); this.t += dt; this.dt = dt; const st = this.st, f = this.task;
    // unsticking: blocked for a while while walking → step to the side; long blocked and unseen → teleport to the goal
    if (Math.hypot(p.x - this.lastX, p.z - this.lastZ) < 0.18 * dt && this.walking) { this.stuckT += dt; } else this.stuckT = Math.max(0, this.stuckT - dt * 2); this.lastX = p.x; this.lastZ = p.z;
    let r = null; this.walking = false;
    const walk = (route, speed) => { const q = this.follow(route, speed); if (q) { this.walking = true; if (this.stuckT > 1.4 && this.stuckT < 3) { const sx = Math.cos(p.yaw), sz = -Math.sin(p.yaw); q.tx = p.x + sx * 1.2 + (q.tx - p.x) * 0.3; q.tz = p.z + sz * 1.2 + (q.tz - p.z) * 0.3; } else if (this.stuckT > 6 && route.length && !st.svc.crowd.visible?.(p)) { const [gx, gz] = route[route.length - 1]; p.x = gx; p.z = gz; st.svc.crowd.place(p); this.stuckT = 0; } } return q; };
    switch (this.phase) {
      case 'toPost': { if (!this.route) this.route = st.routeTo(p, st.site.toWorld(this.post.u, this.post.w)); r = walk(this.route, 1.2); if (!r) this.setPhase('post'); break; }
      case 'post': case 'idle': { // standing at the island nose, watching the driveway; glances at arriving cars
        const [x, z] = st.site.toWorld(this.post.u, this.post.w); if (Math.hypot(p.x - x, p.z - z) > 0.6) { this.setPhase('toPost'); break; }
        const look = st.arriving(); const [ex, ez] = st.site.toWorld(-DRIVE, -1); this.faceTo(look ? look.x : ex + (this.idx ? 2 : -2), look ? look.z : ez);
        if (!look && this.t > 6 && Math.random() < dt * 0.15) { p.lookAtPt = { x: st.site.toWorld(0, 24)[0], z: st.site.toWorld(0, 24)[1] }; p.lookT = 1.5; this.t = 0; }
        r = this.idle(); break; }
      case 'toWindow': case 'toWindow2': {
        const v = f && f.v; if (!v) { this.setPhase('toPost'); break; }
        if (!this.route) this.route = st.routeAround(p, v, f.pts.win); r = walk(this.route, 1.25);
        if (!r) { const tw = vWorld(v, f.pts.talk[0], 0, f.pts.talk[2], _v1); if (this.faceTo(tw.x, tw.z)) this.setPhase(this.phase === 'toWindow' ? 'talk' : 'pay'); else r = this.idle(); }
        break; }
      case 'talk': { // the order: "full tank?" — "two thousand rupees, ninety-two"
        const v = f.v; const tw = vWorld(v, ...f.pts.talk, _v1); this.faceTo(tw.x, tw.z); p.ch.face.talking = this.t < 1.6; this.nod = 0.15; this.look = tw.clone();
        if (this.t > 2.1) { p.ch.face.talking = false; f.ordered = true; this.setPhase('toPump'); } r = this.idle(); break; }
      case 'toPump': {
        const s = this.standAtFace(f.face, f.slot.bx); if (!this.route) this.route = st.routeAround(p, f.v, null, s); r = walk(this.route, 1.25);
        if (!r) { const kp = st.facePoint(f.face, 0, 1.6, 0); if (this.faceTo(kp.x, kp.z)) this.setPhase('preset'); else r = this.idle(); } break; }
      case 'preset': { // left hand on the keypad, eyes on the display; the display resets for the sale
        this.useAct(); const kp = st.facePoint(f.face, KEYPAD.x, KEYPAD.y, KEYPAD.z); this.wantL = kp; this.kLt = this.t > 0.15 && this.t < 1.35 ? 1 : 0; this.look = st.facePoint(f.face, DISPLAY.x, DISPLAY.y, DISPLAY.z); this.nod = -0.12;
        if (this.t > 0.5 && !f.preset) { f.preset = true; st.geo.drawDisplay(f.face.f, 0, 0, GRADES[f.slot.grade].price, true); }
        if (this.t > 1.65) this.setPhase('lift'); r = this.idle(); break; }
      case 'lift': { // reach the nozzle in its boot, lift it out (live nozzle replaces the instance), bring it to the hip
        this.useAct(); if (!this.noz) { this.noz = new LiveNozzle(st, f.slot.slot); this.noz.visit = f; f.noz = this.noz; } const n = this.noz;
        this.kRt = 1; this.nod = 0.1; this.look = n.pos.clone();
        if (this.t > 0.42 && n.mode === 'holster') n.go('carry', 0.6, (tp, tq) => this.carryPose(tp, tq));
        if (n.mode === 'carry' && n.settled()) { n.go('hand', 0.001); this.setPhase('toFiller'); }
        r = this.idle(); break; }
      case 'toFiller': {
        const v = f.v; this.useAct(); const s = vWorld(v, f.pts.stand[0], 0, f.pts.stand[1], _v2); if (!this.route) this.route = st.routeAround(p, v, null, [s.x, s.z]); r = walk(this.route, 1.1);
        if (this.noz && this.noz.mode === 'hand') this.kRt = 1;
        if (!r) { const fw = vWorld(v, ...f.pts.fill, _v1); if (this.faceTo(fw.x, fw.z)) this.setPhase(this.noz && this.noz.mode === 'car' ? 'fuel' : 'insert'); else r = this.idle(); } break; }
      case 'insert': { // spout into the filler neck (flap open), hand stays on the grip
        this.useAct(); const n = this.noz; if (!n) { this.setPhase('toPump'); break; } this.kRt = 1; this.look = vWorld(f.v, ...f.pts.fill, new THREE.Vector3()); this.nod = 0.3;
        if (n.mode !== 'car') n.go('car', 0.7, (tp, tq) => st.fillPose(f, tp, tq));
        if (n.settled()) { f.fuelT = f.fuelT || 0; this.setPhase('fuel'); } r = this.idle(); break; }
      case 'fuel': { // the pump runs: amount and litres count up on both read-outs of that face
        this.useAct(); this.kRt = 1; f.fuelT += dt; const k = clamp(f.fuelT / f.dur, 0, 1); const litres = f.litres * k;
        f.dispT = (f.dispT || 0) - dt; if (f.dispT <= 0) { f.dispT = 0.12; st.geo.drawDisplay(f.face.f, litres * GRADES[f.slot.grade].price, litres, GRADES[f.slot.grade].price, true); }
        this.look = this.t % 6 < 3.5 ? vWorld(f.v, ...f.pts.fill, new THREE.Vector3()) : st.facePoint(f.face, DISPLAY.x, DISPLAY.y, DISPLAY.z); this.nod = this.t % 6 < 3.5 ? 0.3 : -0.1;
        if (k >= 1) { f.fuelled = true; f.amount = f.litres * GRADES[f.slot.grade].price; st.geo.drawDisplay(f.face.f, f.amount, f.litres, GRADES[f.slot.grade].price, false); this.setPhase('remove'); }
        r = this.idle(); break; }
      case 'remove': { this.useAct(); const n = this.noz; this.kRt = 1; if (n.mode === 'car') n.go('carry', 0.55, (tp, tq) => this.carryPose(tp, tq)); if (n.mode === 'carry' && n.settled()) { n.go('hand', 0.001); this.setPhase('toHolster'); } r = this.idle(); break; }
      case 'toHolster': {
        this.useAct(); this.kRt = 1; const s = this.standAtFace(f.face, f.slot.bx); if (!this.route) this.route = st.routeAround(p, f.v, null, s); r = walk(this.route, 1.1);
        if (!r) { const kp = st.facePoint(f.face, f.slot.bx, 1.2, 0); if (this.faceTo(kp.x, kp.z)) this.setPhase('holster'); else r = this.idle(); } break; }
      case 'holster': { this.useAct(); const n = this.noz; this.kRt = this.t < 0.75 ? 1 : 0; this.look = n ? n.pos.clone() : null; this.nod = 0.1;
        if (n && n.mode !== 'holster') n.go('holster', 0.6);
        if (n && n.mode === 'holster' && n.settled() && this.t > 1.15) { n.dispose(); this.noz = null; f.noz = null; this.setPhase(f.fuelled ? 'toWindow2' : 'toPost'); }
        r = this.idle(); break; }
      case 'pay': { // cash through the window: left hand in, note out, into the pocket
        this.useAct(); const v = f.v; const wp = vWorld(v, f.pts.win[0] * 0.82, 1.02, f.pts.win[1] + 0.05, new THREE.Vector3()); this.wantL = wp; this.kLt = this.t > 0.6 && this.t < 1.5 ? 1 : 0; p.ch.face.talking = this.t < 0.6 || (this.t > 1.6 && this.t < 2.2);
        this.look = vWorld(v, ...f.pts.talk, new THREE.Vector3()); if (this.t > 1.1 && !this.cash) this.showCash(f); if (this.t > 2.3 && this.cash) this.hideCash();
        if (this.t > 2.7) { p.ch.face.talking = false; this.releaseHands(false); this.st.serviceDone(f); this.task = null; this.setPhase('toPost'); } r = this.idle(); break; }
      case 'toNozzle': { // a nozzle lying on the apron (dropped / pulled out by a car that left): pick it up and hang it back
        const n = this.noz; if (!n) { this.setPhase('toPost'); break; } const g = n.pos; if (!this.route) this.route = st.routeTo(p, [g.x - Math.sin(p.yaw) * 0.0, g.z]); r = walk(this.route, 1.2);
        if (!r || Math.hypot(p.x - g.x, p.z - g.z) < 0.55) { r = this.idle(); if (this.faceTo(g.x, g.z)) this.setPhase('pickup'); } break; }
      case 'pickup': { // down on the knees beside it (medKneel), right hand onto it, the nozzle into the hand, back up into the carry
        const n = this.noz; const a = p.ch.anim; if (!n) { this.setPhase('toPost'); break; }
        if (this.t < 1.25) { if (a.act !== 'medKneel') { a.set('medKneel'); a.medLean = 0.3; } a.holdR = null; a.holdL = null; a.holdWL = null; a.holdWR = (a.holdWR || new THREE.Vector3()).copy(n.pos).add(_v1.set(0, 0.075, 0)); if (this.t > 0.85 && n.mode === 'ground') n.go('hand', 0.3); }
        else { if (a.act !== 'pump') { a.medLean = undefined; this.useAct(); this.kR = 1; } this.kRt = 1; if (this.t > 2.0) this.setPhase(f && f.phase === 'service' && !f.fuelled ? 'toFiller' : 'toHolsterLoose'); }
        r = this.idle(); break; }
      case 'toHolsterLoose': { this.useAct(); this.kRt = 1; const n = this.noz; const fc = n.slot.face; const s = this.standAtFace(fc, n.bx); if (!this.route) this.route = st.routeTo(p, s); r = walk(this.route, 1.1);
        if (!r) { const kp = st.facePoint(fc, n.bx, 1.2, 0); if (this.faceTo(kp.x, kp.z)) this.setPhase('holsterLoose'); else r = this.idle(); } break; }
      case 'holsterLoose': { this.useAct(); const n = this.noz; this.kRt = this.t < 0.75 ? 1 : 0; if (n.mode !== 'holster') n.go('holster', 0.6); if (n.mode === 'holster' && n.settled() && this.t > 1.15) { n.dispose(); this.noz = null; if (f && f.noz === n) f.noz = null; this.setPhase(f && f.phase === 'service' ? (f.fuelled ? 'toWindow2' : 'toPump') : 'toPost'); } r = this.idle(); break; }
      default: this.setPhase('toPost'); r = this.idle();
    }
    if (!this.task && this.noz && this.noz.mode === 'ground' && this.phase !== 'toNozzle' && this.phase !== 'pickup') this.setPhase('toNozzle');
    this.updateHands(dt, lod); return r || this.idle();
  }
  useAct() { const a = this.p.ch.anim; if (a.act !== 'pump') a.set('pump'); }
  carryPose(tp, tq) { // the nozzle at the right hip, relative to the body (blend target while lifting / pulling out)
    const p = this.p, k = (p.sp.height || 1.72) / 1.72; const c = Math.cos(p.yaw), s = Math.sin(p.yaw); const lx = -0.2 * k, ly = 0.9 * k, lz = 0.14 * k;
    const hp = _v3.set(p.x + c * lx + s * lz, (p.y || 0) + ly, p.z - s * lx + c * lz); const hq = _q2.setFromAxisAngle(UP, p.yaw).multiply(CARRY_Q);
    tq.copy(hq); tp.copy(NOZZLE_IN_HAND).applyQuaternion(hq).add(hp);
  }
  updateHands(dt, lod) {
    const p = this.p, a = p.ch.anim; const rate = 1 / 0.38; this.kR += clamp(this.kRt - this.kR, -rate * dt, rate * dt); this.kL += clamp(this.kLt - this.kL, -rate * 1.3 * dt, rate * 1.3 * dt);
    const n = this.noz; const pumpOn = a.act === 'pump';
    if (pumpOn) {
      if (n && this.kR > 0.001 && n.mode !== 'ground') {
        if (n.mode === 'hand') this.carryPose(_v1, _q1); else { _v1.copy(n.pos); _q1.copy(n.quat); } // nozzle pose
        _v2.copy(HAND_IN_NOZZLE).applyQuaternion(_q1).add(_v1); // → wrist
        a.holdWR = (a.holdWR || new THREE.Vector3()).copy(_v2); a.holdQR = (a.holdQR || new THREE.Quaternion()).copy(_q1); a.holdKR = smooth(this.kR); a.holdPoleR = null;
      } else { a.holdKR = smooth(this.kR); if (this.kR < 0.001) { a.holdWR = null; a.holdQR = null; } }
      if (this.wantL && this.kL > 0.001) { a.holdWL = (a.holdWL || new THREE.Vector3()).copy(this.wantL); a.holdQL = null; a.holdKL = smooth(this.kL); a.holdPoleL = null; } else { a.holdKL = 0; if (this.kL < 0.001) a.holdWL = null; }
      a.pumpCarry = n && (n.mode === 'hand' || n.mode === 'carry') ? 1 : 0;
      if (this.look) { const yaw = wrapA(Math.atan2(this.look.x - p.x, this.look.z - p.z) - p.yaw); a.pumpLook = clamp(yaw, -1.0, 1.0) * 0.8; } else a.pumpLook = null;
      a.pumpNod = (a.pumpNod || 0) + ((this.nod || 0) - (a.pumpNod || 0)) * Math.min(1, dt * 5);
      // done with both hands and no nozzle: drop the act (blends back to the plain idle / walk)
      if (!n && this.kR < 0.001 && this.kL < 0.001 && this.kRt === 0 && this.kLt === 0 && !this.cash && !['preset', 'lift', 'holster', 'pay', 'holsterLoose', 'pickup'].includes(this.phase)) { a.set(null); a.pumpLook = null; a.holdWR = a.holdWL = null; }
    }
    if (!this.task || !['talk', 'preset', 'lift', 'insert', 'fuel', 'remove', 'holster', 'pay', 'pickup', 'holsterLoose'].includes(this.phase)) { this.look = null; this.nod = 0; }
  }
  postPose(lod, posed) { // after this frame's pose: the carried nozzle sits exactly in the hand; the cash in the left hand
    const p = this.p; if (!p || p.dead) return; const n = this.noz;
    if (n) { let hp = null; if (n.mode === 'hand') { const hb = p.ch.bones && p.ch.bones.handR; if (hb) { hb.updateWorldMatrix(true, false); hb.matrixWorld.decompose(this.handR.p, this.handR.q, _s1); this.handR.p.add(_v1.copy(NOZZLE_IN_HAND).applyQuaternion(this.handR.q)); hp = this.handR; } } n.update(this.dt || 1 / 60, hp); }
    if (this.cash) { const hb = p.ch.bones && p.ch.bones.handL; if (hb) { hb.updateWorldMatrix(true, false); this.cash.matrix.copy(hb.matrixWorld).multiply(_m1.makeTranslation(-0.01, -0.09, 0.02)); this.cash.matrixWorldNeedsUpdate = true; } }
  }
  showCash(f) { const st = this.st; const g = st.svc.cashGeo || (st.svc.cashGeo = new THREE.PlaneGeometry(0.13, 0.065)); const m = f.amount > 3000 ? st.svc.cashMat5k : st.svc.cashMat1k; this.cash = new THREE.Mesh(g, m); this.cash.matrixAutoUpdate = false; this.cash.name = 'cash'; st.svc.scene.add(this.cash); }
  hideCash() { if (this.cash) { this.st.svc.scene.remove(this.cash); this.cash = null; } }
}
function nearestPedNode(x, z) { let best = 0, bd = Infinity; const N = L.pedNodes || []; for (let i = 0; i < N.length; i++) { const n = N[i]; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; }

// ------------------------------------------------------------------------------------------------ one station
class Station {
  constructor(svc, geo, idx) {
    this.svc = svc; this.geo = geo; this.site = geo.site; this.idx = idx; geo.group.updateWorldMatrix(true, true); this.mw = geo.group.matrixWorld.clone(); this.spawnN = 0;
    this.lanes = { A: [null, null], B: [null, null], C: [null, null] }; this.visits = []; this.nextT = 3 + Math.random() * 5; this.scanT = 0; this.night = 0;
    this.att = [new Attendant(this, 0), new Attendant(this, 1)]; this.loose = []; this.exitCache = new Map();
    // the kerb lane the station is entered from (and merged back into)
    const site = this.site, seg = site.seg; const [a, b] = segNodes(seg); const fwd = (b.x - a.x) * site.U[0] + (b.z - a.z) * site.U[1] > 0;
    this.kerbLane = seg.level <= 1 ? 1 : 0; this.from = fwd ? a : b; this.to = fwd ? b : a; const ln = linePiece(seg, this.from, this.to, this.kerbLane);
    this.lineU0 = site.toLocal(ln.p0[0], ln.p0[1])[0]; this.lineU1 = site.toLocal(ln.p1[0], ln.p1[1])[0]; this.wRoad = site.toLocal(ln.p0[0], ln.p0[1])[1];
    this.uMerge = Math.min(this.lineU1 - 0.8, DRIVE + 10.5);
    // the straight road segment leading into ours (for customer spawns, out of sight up the road)
    const same = (n, m) => n && m && Math.abs(n.x - m.x) < 0.5 && Math.abs(n.z - m.z) < 0.5; this.upstream = null;
    const prev = (node, not) => { for (const sg of L.segments) { if (sg === not || sg.dir !== seg.dir) continue; const [p, q] = segNodes(sg); if (same(q, node)) return { seg: sg, far: p }; if (same(p, node)) return { seg: sg, far: q }; } return null; };
    const s1 = prev(this.from, seg); // a rail level crossing just before the station: spawn one segment further back (never on the tracks)
    if (s1 && !s1.seg.crossing) this.upstream = { seg: s1.seg, from: s1.far, to: this.from, route: [this.to] };
    else if (s1) { const s2 = prev(s1.far, s1.seg); if (s2 && !s2.seg.crossing) this.upstream = { seg: s2.seg, from: s2.far, to: s1.far, route: [this.from, this.to] }; }
    this.slots = geo.slots.map((s) => ({ s: s.i, slot: s, grade: s.grade, bx: [-0.3, 0, 0.3][s.k], face: s.face, busy: null }));
  }
  uLatest(v) { const e = v.T.entry; return e === 'bike' || e === 'tuk' ? -DRIVE - 5 : -DRIVE - 6 - Math.max(0, v.T.len - 4.2) * 2.2; } // later than this the turn-in would be too sharp
  isOurLine(pc) { return pc && pc.type === 'line' && pc.seg === this.site.seg && pc.lane === this.kerbLane && pc.d[0] * this.site.U[0] + pc.d[1] * this.site.U[1] > 0.9; }
  yawToU(sgn) { return Math.atan2(this.site.U[0] * sgn, this.site.U[1] * sgn); }
  groundTop(x, z) { const [u, w] = this.site.toLocal(x, z); for (const wi of FS.islands) if (Math.abs(u) < FS.isHalfLen + 0.4 && Math.abs(w - wi) < FS.isHalfWid) return YI; return Math.max(SLAB, L.groundY(x, z)); }
  facePoint(fc, x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(fc.frame).applyMatrix4(this.mw); }
  faceGround(fc, x, z) { const v = this.facePoint(fc, x, 0, z); return [v.x, v.z]; }
  // straight walk unless an island is in the way: then go round its nearer end (attendants never walk through dispensers)
  routeTo(p, goal) {
    const [gx, gz] = Array.isArray(goal) ? goal : [goal.x, goal.z]; const site = this.site; const [pu, pw] = site.toLocal(p.x, p.z), [gu, gw] = site.toLocal(gx, gz); const route = [];
    // any island (with its dispensers and crash posts) the straight line would cross: walk round its nearer end
    let cu = pu, cw = pw; const hwE = FS.isHalfWid + 0.42, hlE = FS.isHalfLen + 0.55, endU = FS.isHalfLen + 0.8;
    for (const wi of [...FS.islands].sort((a, b) => Math.abs(a - pw) - Math.abs(b - pw))) {
      if (!segHitsRect(cu, cw, gu, gw, -(FS.isHalfLen + 0.3), FS.isHalfLen + 0.3, wi - FS.isHalfWid + 0.1, wi + FS.isHalfWid - 0.1)) continue; // only a line over the island body itself (its edge, where they stand to work, is fine)
      const sg = Math.sign(gw - wi) || 1, ss = Math.abs(cw - wi) > 0.05 ? Math.sign(cw - wi) : -sg; const e = (cu + gu) < 0 ? -endU : endU;
      if (Math.abs(cu) < hlE + 0.05) route.push(site.toWorld(e, wi + ss * (hwE + 0.1))); // alongside: first out to the end
      if (Math.abs(gu) < hlE + 0.05) { route.push(site.toWorld(e, wi + sg * (hwE + 0.1))); cu = e; cw = wi + sg * (hwE + 0.1); } }
    route.push([gx, gz]); return route.filter((q, i) => i === 0 || Math.hypot(q[0] - route[i - 1][0], q[1] - route[i - 1][1]) > 0.2);
  }
  // round the FRONT of the car when the target is on its other side (never through the bodywork); then routeTo the rest
  routeAround(p, v, winLocal, goalW) {
    const goal = goalW ? (Array.isArray(goalW) ? goalW : [goalW.x, goalW.z]) : (() => { const w = vWorld(v, winLocal[0], 0, winLocal[1], _v1); return [w.x, w.z]; })();
    const [px] = vLocal(v, p.x, p.z), [gx, gz2] = vLocal(v, goal[0], goal[1]); const hw = v.T.wid / 2 + 0.7, hl = v.T.len / 2 + 0.75; const route = [];
    const [, pz] = vLocal(v, p.x, p.z);
    if (Math.sign(px) !== Math.sign(gx) && Math.abs(px) > 0.2 && Math.abs(gx) > 0.2 && (Math.abs(pz) < hl + 0.3 || Math.abs(gz2) < hl + 0.3)) { const a = vWorld(v, Math.sign(px) * hw, 0, hl, _v2), b = vWorld(v, Math.sign(gx) * hw, 0, hl, _v3); route.push([a.x, a.z], [b.x, b.z]); }
    route.push(goal); // islands between the last corner and the goal
    const out = []; let from = { x: p.x, z: p.z }; for (const pt of route) { const seg = this.routeTo(from, pt); out.push(...seg); from = { x: pt[0], z: pt[1] }; } return out;
  }
  arriving() { for (const f of this.visits) if ((f.phase === 'in' || f.phase === 'wait') && f.v) return f.v; return null; }
  fillPose(f, tp, tq) { // the spout in the filler neck, nozzle body angled out and down
    const v = f.v, P = vWorld(v, ...f.pts.fill, _vFill); const c = Math.cos(v.yaw), s = Math.sin(v.yaw); // own scratch vector: tp is often _v1
    let fwd, up; if (f.pts.down) { const fw = _v2.set(s, 0, c); fwd = new THREE.Vector3(0, -1, 0).addScaledVector(fw, 0.28).normalize(); up = fw.clone().addScaledVector(fwd, -fw.dot(fwd)).normalize(); }
    else { const out = _v2.set(c * f.side, 0, -s * f.side); fwd = out.clone().multiplyScalar(-Math.cos(0.6)).add(_v3.set(0, -Math.sin(0.6), 0)).normalize(); up = UP.clone().addScaledVector(fwd, -UP.dot(fwd)).normalize(); P.addScaledVector(out, 0.012); }
    const x = new THREE.Vector3().crossVectors(up, fwd); tq.setFromRotationMatrix(_m2.makeBasis(x, up, fwd)); tp.copy(SPOUT_TIP).applyQuaternion(tq).negate().add(P);
  }
  // ---- dispatch
  pickBay(v) {
    const e = v.T.entry, small = e === 'tuk' || e === 'bike'; const pref = ((v.id * 2654435761) >>> 0) & 1 ? 1 : -1; const cands = [];
    for (const b of BAYS) { if (b.small && !small) continue; if (!small && b.side !== pref) continue; const ln = this.lanes[b.lane]; let slot = -1;
      if (!ln[0] && !ln[1]) slot = 0; else if (ln[0] && !ln[1] && ln[0].phase !== 'out') slot = 1; if (slot < 0) continue; cands.push([b, slot]); }
    if (!cands.length) return null; cands.sort((a, b) => a[1] - b[1] + (Math.random() - 0.5) * 0.6); return cands[0];
  }
  scan() {
    const T = this.svc.traffic; if (!T) return; const nCars = this.visits.length; if (nCars >= 3) return; if (!this.att.some((a) => a.p && !a.dead)) return;
    const site = this.site; const cands = [];
    for (const v of T.vehicles) { const ai = v.ai; if (!ai || ai.fuel || v.free || ai.rejoin || ai.chase || ai.emergency || (ai.route && ai.route.length && v.fuelFor !== this) || ai.goal || ai.stopped || v.keep || v.police || v.towing || v.towedBy || v.isTrain || v.hold || v.dead) continue;
      if (!v.T || !ELIGIBLE.has(v.T.entry) || NO_FUEL.has(v.type) || v.T.len > 5.4) continue; if (Math.abs(ai.lat || 0) > 0.15 || Math.abs(ai.hdg || 0) > 0.04) continue;
      let k = -1; for (let i = 0; i < Math.min(3, ai.pieces.length); i++) if (this.isOurLine(ai.pieces[i])) { k = i; break; } if (k < 0) continue;
      const [u] = site.toLocal(v.x, v.z); if (k === 0 && u > this.uLatest(v) - 2.5) continue; const d = Math.hypot(v.x - site.O[0], v.z - site.O[1]); if (d > 95) continue;
      cands.push(v); }
    if (!cands.length) return; const pref = cands.find((q) => q.fuelFor === this); const v = pref || cands[(Math.random() * cands.length) | 0]; const pick = this.pickBay(v); if (!pick) return;
    const [bay, slot] = pick; const f = { st: this, v, bay, slotN: slot, phase: 'approach', t: 0, line: null, side: bay.side, vcap: 0 }; f.line = v.ai.pieces.find((pc) => this.isOurLine(pc));
    if (v.fuelFor === this) v.ai.route = null;
    this.lanes[bay.lane][slot] = f; v.ai.fuel = f; this.visits.push(f); this.svc.stats.dispatched++;
  }
  buildVisit(f) {
    const v = f.v, ai = v.ai, site = this.site; const [u0, w0] = site.toLocal(v.x, v.z); if (u0 > this.uLatest(v) + 0.01) return false;
    const hx = Math.sin(v.yaw), hz = Math.cos(v.yaw); const phi0 = Math.atan2(hx * site.Wv[0] + hz * site.Wv[1], hx * site.U[0] + hz * site.U[1]);
    const lane = f.bay.lane, wl = FS.lanes[lane], half = v.T.len / 2;
    // the dispenser and the free boot of the right grade on the face this side of the car looks at
    const disp = f.slotN === 0 ? 1 : 0; const face = this.geo.faces.find((q) => q.island === f.bay.island && q.disp === disp && q.side === f.bay.fs);
    const want = v.T.entry === 'bike' || v.T.entry === 'tuk' ? 'p92' : Math.random() < 0.18 ? (face.grades.includes('ad') && (v.T.entry === 'van' && Math.random() < 0.6) ? 'ad' : face.grades.includes('p95') ? 'p95' : 'p92') : (v.T.entry === 'van' && Math.random() < 0.45 ? 'ad' : 'p92');
    const slots = this.slots.filter((s) => s.face === face && !s.busy); const slot = slots.find((s) => s.grade === want) || slots.find((s) => s.grade === 'p92') || slots[0]; if (!slot) return false;
    const pts = fuelPoints(v, f.side); const fuelU = face.du + (f.slotN === 0 ? 0.6 : -0.5); // filler a little ahead of / behind the dispenser it is fuelled from
    let uStop = fuelU - pts.fill[2]; // vehicle centre so its filler is opposite the dispenser
    if (f.slotN === 1) { const fr = this.lanes[lane][0]; if (fr && fr.v) { const [fu] = site.toLocal(fr.v.x, fr.v.z); const frU = fr.uStop ?? fu; uStop = Math.min(uStop, frU - fr.v.T.len / 2 - half - 1.1); } }
    uStop = clamp(uStop, -FS.isHalfLen + half - 2.2, FS.isHalfLen + 3.2); f.uStop = uStop;
    const uAl = Math.min(ALIGN_U[lane], uStop - half - 2.5); const wM = -site.walk * 0.5;
    // candidates over the driveway heading: the gentlest one whose swept body clears every kerb, planter, pylon and island
    const pickPath = (cands) => { let best = null, bestAny = null; for (const e of cands) { if (!bestAny || e.kmax < bestAny.kmax) bestAny = e; if ((!best || e.kmax < best.kmax) && this.pathClear(e, v)) best = e; } return best || null; };
    const entry = pickPath([0.6, 0.75, 0.9, 1.05, 1.2].flatMap((ph) => [-DRIVE + 0.5, -DRIVE + 1.5].map((mu) => buildPath(site, [{ u: u0, w: w0, phi: phi0 }, { u: mu, w: wM, phi: ph }, { u: uAl, w: wl, phi: 0 }, { u: uStop, w: wl, phi: 0, k: 0.35, fix: true }], { vmax: 6.5 }))));
    const uClr = Math.max(uStop + 0.6, FS.isHalfLen + half + 0.4);
    const xKey = `${lane}|${uStop.toFixed(2)}|${v.type}`; let exit = this.exitCache.get(xKey);
    if (!exit) { const cands = []; for (const ph of [0.55, 0.7, 0.85, 1.0, 1.15]) for (const mu of [DRIVE - 1.5, DRIVE - 0.5, DRIVE + 0.5, DRIVE + 1.5]) for (const wm of [wM, -site.walk * 0.2, -site.walk * 0.8]) cands.push(buildPath(site, [{ u: uStop, w: wl, phi: 0, k: 0.35, fix: true }, { u: uClr, w: wl, phi: 0 }, { u: mu, w: wm, phi: -ph }, { u: this.uMerge, w: this.wRoad, phi: 0 }], { vmax: 7 }));
      exit = pickPath(cands); if (exit) { if (this.exitCache.size > 200) this.exitCache.clear(); this.exitCache.set(xKey, exit); } }
    if (!entry || !exit) return false;
    const rest = linePiece(site.seg, this.from, this.to, this.kerbLane);
    { const P0 = exit.poly[exit.poly.length - 1]; rest.p0 = [P0[0], P0[1]]; rest.len = Math.max(0.1, (rest.p1[0] - P0[0]) * rest.d[0] + (rest.p1[1] - P0[1]) * rest.d[1]); }
    let yi = exit.loc.findIndex((q) => q[1] < 0.9); if (yi < 0) yi = exit.loc.length - 1; f.yieldS = exit.cum[yi];
    Object.assign(f, { entry, exit, rest, face, slot, pts, wl, phase: 'in', t: 0, litres: litresFor(v), go: false, holdT: 0 }); slot.busy = f; f.slot.bx = slot.bx;
    f.dur = clamp(4.5 + f.litres * 0.2, 5, 13.5);
    ai.pieces = [entry, exit, rest]; ai.s = 0; ai.lat = 0; ai.hdg = 0; ai.latWant = 0; ai.sMaxP = entry; ai.sMax = entry.len - 0.02; f.vcap = 0; this.svc.stats.entered++;
    return true;
  }
  pathClear(P, v) {
    const hw = v.T.wid / 2 + 0.12, hl = v.T.len / 2 + 0.12, cs = this.solid || (this.solid = this.geo.colliders.filter((c) => (c.y0 || 0) < 2.6 && (c.y0 !== undefined ? c.y0 + c.h : c.h) > SLAB + 0.12));
    const Rr = Math.hypot(hw, hl);
    for (let s = 0; s <= P.len; s += 0.4) { const c0 = evalPoly(P, s); const x = c0[0], z = c0[1], yaw = c0[2], c = Math.cos(yaw), sn = Math.sin(yaw);
      for (const b of cs) { if (b.x1 < x - Rr || b.x0 > x + Rr || b.z1 < z - Rr || b.z0 > z + Rr) continue; if (obbBox(x, z, c, sn, hw, hl, b)) return false; } }
    return true;
  }
  releaseBay(f) { const ln = this.lanes[f.bay.lane]; for (let i = 0; i < 2; i++) if (ln[i] === f) ln[i] = null; if (ln[0] === null && ln[1] && ln[1].phase !== 'out') { /* rear car stays rear (it is already stopped there) */ } if (f.slot && f.slot.busy === f) f.slot.busy = null; }
  leave(f, why) { // the car pulls away (served, knocked, or tired of waiting); the attendant lets go of it
    if (f.phase === 'out') return; const ai = f.v.ai; f.phase = 'out'; f.t = 0; f.why = why; this.releaseBay(f); this.dropAttendant(f); if (ai) { ai.sMaxP = f.exit; ai.sMax = f.yieldS; } f.holdT = 0;
    if (why !== 'served') this.svc.stats.aborted++;
  }
  dropAttendant(f) { const a = f.att; if (a) { if (a.task === f) { a.task = null; if (a.noz) { if (a.noz.mode === 'car' || a.noz.mode === 'hand' || a.noz.mode === 'carry') { a.noz.drop(); } } a.releaseHands(false); if (!a.interrupted && a.p && !a.dead) a.setPhase(a.noz ? 'toNozzle' : 'toPost'); } } f.att = null;
    if (f.noz && f.noz.mode === 'car' && this.loose.includes(f.noz)) f.noz.drop(); }
  serviceDone(f) { this.svc.stats.served++; this.leave(f, 'served'); }
  endVisit(f) { const i = this.visits.indexOf(f); if (i >= 0) this.visits.splice(i, 1); this.releaseBay(f); this.dropAttendant(f); const ai = f.v && f.v.ai; if (ai && ai.fuel === f) { ai.fuel = null; ai.sMaxP = null; } }
  gapClear(f) { // give way at the exit driveway: nothing in the kerb lane about to arrive, no queue standing across the merge
    const site = this.site, U = site.U; const uM = this.uMerge; const list = this.svc.traffic.vehicles; const pv = this.svc.playerVehicle();
    const nd = this.to, T = this.svc.traffic; if (nd.signal && nd.hwH > 0 && nd.hwV > 0 && L.signalState(nd, this.site.seg.dir, T.simTime || 0) !== 'green') return false; // the merge is just before a signal: wait in the driveway for green
    const test = (o) => { if (!o || o === f.v) return true; const [ou, ow] = site.toLocal(o.x, o.z); if (Math.abs(ou - uM) > 60) return true; const onLane = Math.abs(ow - this.wRoad) < 2.6, onDrive = ow > -site.walk - 0.6 && ow < 1.2 && Math.abs(ou - DRIVE) < 5;
      if (!onLane && !onDrive) return true; if (onDrive) return false; const hU = Math.sin(o.yaw) * U[0] + Math.cos(o.yaw) * U[1]; const sp = (o.speed || 0) * hU; const d = uM - ou; if (d < -6.5) return true; if (d < 9) return false; return !(sp > 0.6 && d / sp < 4.6); };
    for (const o of list) if (!test(o)) return false; return test(pv);
  }
  update(dt, ctx) {
    const site = this.site, focus = ctx.focus; const dist = Math.hypot(site.O[0] - focus.x, site.O[1] - focus.z);
    this.geo.group.visible = dist < 600; if (dist < 600) this.geo.update(ctx.night || 0);
    // staff: spawned within 175 m, dismissed beyond 230 m; the dead (or anyone taken away) stay gone until the player has left
    for (const a of this.att) {
      const lost = a.p && (a.p.dead || !this.svc.crowd.peds.includes(a.p));
      if (lost && !a.gone) { a.gone = true; a.dead = !!a.p.dead; if (a.dead) this.svc.stats.attendantsKilled++; a.p.keep = false; a.p.job = null; a.releaseHands(true);
        if (a.noz) { this.loose.push(a.noz); a.noz = null; } if (a.task) { const f = a.task; a.task = null; f.att = null; } a.p = null; }
    }
    if (dist < 175) { for (const a of this.att) if (!a.p && !a.gone) a.spawn(); }
    else if (dist > 230) { for (const a of this.att) { if (a.p) a.despawn(); a.gone = false; a.dead = false; } for (const n of this.loose) n.dispose(); this.loose.length = 0; }
    // loose nozzles (their attendant is gone): drawn here; one left in a car that drove off falls out; a free attendant collects them
    for (let i = this.loose.length - 1; i >= 0; i--) { const n = this.loose[i]; if (n.mode === 'car' && (!n.visit || n.visit.phase === 'out' || !this.visits.includes(n.visit))) n.drop(); n.update(dt, null);
      if (n.mode === 'ground' && n.settled()) { const b = this.att.find((q) => q.free && !q.noz); if (b) { b.noz = n; this.loose.splice(i, 1); b.setPhase('toNozzle'); } } }
    // dispatch
    // a quiet station near the player asks traffic for one customer on the approach road (spawned out of sight, ordinary traffic otherwise)
    const T = this.svc.traffic; this.idleT = this.visits.length ? 0 : (this.idleT || 0) + dt;
    if (dist < 200 && this.idleT > 24 && T && T.spawnHint === undefined && this.upstream && this.att.some((a) => a.p && !a.dead)) { const up = this.upstream; T.spawnHint = { seg: up.seg, from: up.from, to: up.to, route: up.route, lane: this.kerbLane, types: FUEL_TYPES, tag: this }; this.idleT = 8; }
    if (dist < 260) { this.scanT -= dt; this.nextT -= dt; if (this.nextT <= 0 && this.scanT <= 0) { this.scanT = 0.5; const n0 = this.visits.length; this.scan(); if (this.visits.length > n0) this.nextT = 7 + Math.random() * 16; } }
    for (const f of this.visits.slice()) this.updateVisit(f, dt);
  }
  updateVisit(f, dt) {
    const v = f.v, ai = v && v.ai, T = this.svc.traffic; f.t += dt;
    if (v) v.fuelFor = null;
    if (!v || !ai || ai.fuel !== f || v.disposed || v.dead || !T.vehicles.includes(v)) { this.endVisit(f); return; }
    if (v.free && f.phase !== 'approach' && f.phase !== 'out') { this.leave(f, 'knocked'); return; }
    switch (f.phase) {
      case 'approach': {
        const k = ai.pieces.indexOf(f.line); if (k < 0 || f.t > 45 || v.free) { this.endVisit(f); return; }
        const [u] = this.site.toLocal(v.x, v.z); const d = Math.max(0, -DRIVE - 5 - u); f.vcap = Math.sqrt(3.4 * 3.4 + 2 * 1.2 * d); // ease off to turn in
        const pc = ai.pieces[0], uLate = this.uLatest(v); const onJunction = k === 1 && pc.type === 'curve' && pc.turn === 'straight' && pc.len - ai.s < 9;
        if ((k === 0 || onJunction) && !ai.rejoin && Math.abs(ai.lat || 0) < 0.2 && Math.abs(ai.hdg || 0) < 0.05) { if (u > uLate) { this.endVisit(f); return; } if (u > uLate - 3 || onJunction && u > this.lineU0 - 6) { if (!this.buildVisit(f)) this.endVisit(f); } }
        break; }
      case 'in': {
        if (ai.pieces[0] === f.entry) { const rem = f.entry.len - ai.s; if ((rem < 0.45 && v.speed < 0.3) || (rem < 0.06)) { f.phase = 'wait'; f.t = 0; f.holdT = 0; v.speed = 0; } }
        else if (ai.pieces[0] !== f.entry) { this.leave(f, 'overran'); }
        if (f.t > 60) this.leave(f, 'timeout'); break; }
      case 'wait': {
        if (!f.att) { const a = this.pickAttendant(f); if (a) { f.att = a; a.task = f; f.phase = 'service'; a.setPhase('toWindow'); a.route = null; } }
        if (f.t > 75) this.leave(f, 'no attendant'); break; }
      case 'service': {
        const a = f.att; if (!a || a.dead || !a.p) { f.att = null; f.lostT = (f.lostT || 0) + dt; if (f.noz && f.noz.mode === 'car') { /* stays in the car until someone comes */ } const b = this.pickAttendant(f); if (b) { f.att = b; b.task = f; f.lostT = 0; if (f.noz && f.noz.mode === 'car') { const i = this.loose.indexOf(f.noz); if (i >= 0) this.loose.splice(i, 1); b.noz = f.noz; b.setPhase('toFiller'); } else b.setPhase(f.fuelled ? 'toWindow2' : f.ordered ? 'toPump' : 'toWindow'); } else if (f.lostT > 14) this.leave(f, 'attendant gone'); }
        else if (a.interrupted) { f.lostT = (f.lostT || 0) + dt; if (f.lostT > 18) this.leave(f, 'attendant gone'); } else f.lostT = 0;
        break; }
      case 'out': {
        const p = ai.pieces[0]; f.vcap = 0;
        if (!f.go && (p === f.exit || p === f.entry)) { const s = p === f.exit ? ai.s : ai.s - f.entry.len; if (s > f.yieldS - 7 && this.gapClear(f)) { if (s > f.yieldS - 2.5 || v.speed > 0.5) { f.go = true; ai.sMaxP = null; } } }
        if (f.go || f.why === 'knocked') ai.sMaxP = null;
        if (p !== f.exit && p !== f.entry) { this.endVisit(f); return; }
        if (f.t > 90) { this.endVisit(f); return; }
        break; }
    }
  }
  pickAttendant(f) { let best = null, bd = Infinity; for (const a of this.att) { if (!a.free) continue; const d = Math.hypot(a.p.x - f.v.x, a.p.z - f.v.z) + (a.idx === f.bay.island ? 0 : 3); if (d < bd) { bd = d; best = a; } } return best; }
}
function segHitsRect(x0, y0, x1, y1, ax, bx, ay, by) { // Liang–Barsky: does the segment touch the box?
  let t0 = 0, t1 = 1; const dx = x1 - x0, dy = y1 - y0; for (const [p, q] of [[-dx, x0 - ax], [dx, bx - x0], [-dy, y0 - ay], [dy, by - y0]]) { if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; } const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } } return t0 <= t1;
}
function evalPoly(P, s) { const c = P.cum, q = clamp(s, 0, P.len); let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= q) lo = m; else hi = m; } const a = P.poly[lo], b = P.poly[hi], k = (q - c[lo]) / Math.max(1e-6, c[hi] - c[lo]); return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
function obbBox(x, z, c, s, hw, hl, b) { // oriented vehicle box vs axis-aligned collider (separating axes)
  const ax = [[c, -s], [s, c]]; const ext = [hw, hl]; const bx = (b.x0 + b.x1) / 2, bz = (b.z0 + b.z1) / 2, bhx = (b.x1 - b.x0) / 2, bhz = (b.z1 - b.z0) / 2; const dx = bx - x, dz = bz - z;
  const rx = Math.abs(c) * hw + Math.abs(s) * hl, rz = Math.abs(s) * hw + Math.abs(c) * hl; if (Math.abs(dx) > rx + bhx || Math.abs(dz) > rz + bhz) return false;
  for (let i = 0; i < 2; i++) { const [nx, nz] = ax[i]; const d = Math.abs(dx * nx + dz * nz), rb = bhx * Math.abs(nx) + bhz * Math.abs(nz); if (d > ext[i] + rb) return false; }
  return true;
}
function litresFor(v) { const e = v.T.entry; const r = Math.random(); if (e === 'bike') return 2 + r * 3; if (e === 'tuk') return 3.5 + r * 4.5; if (e === 'van') return 18 + r * 30; return 12 + r * 25; }

// ------------------------------------------------------------------------------------------------ the service
export class FuelService {
  constructor(built, { crowd, traffic, scene, player }) {
    this.built = built; this.crowd = crowd; this.traffic = traffic; this.scene = scene; this.player = player; this.stats = { dispatched: 0, entered: 0, served: 0, aborted: 0, attendantsKilled: 0 };
    this.stations = built.stations.map((g, i) => new Station(this, g, i)); if (traffic) traffic.fuel = this;
    this.cashMat1k = new THREE.MeshStandardMaterial({ color: 0x5f9d64, roughness: 0.8, side: THREE.DoubleSide }); this.cashMat5k = new THREE.MeshStandardMaterial({ color: 0xd88c3a, roughness: 0.8, side: THREE.DoubleSide });
  }
  playerVehicle() { return (this.player && this.player.vehicle) || null; }
  // Traffic hooks -----------------------------------------------------------
  hold(v, ai, dt) { const f = ai.fuel; if (!f || (f.phase !== 'wait' && f.phase !== 'service')) return false; if (v.free) return false;
    f.holdT = (f.holdT || 0) + dt; v.speed = 0; v.brake = f.holdT < 1.2; v.steer *= Math.exp(-5 * dt); v.lights = f.holdT < 1.2 && this.traffic.night > 0.4; v.y = L.groundY(v.x, v.z); v.sync(dt); return true; }
  stopDist(v, ai) { const f = ai.fuel; if (!f) return Infinity; const p = ai.pieces[0];
    if (f.phase === 'in' && p === f.entry) return f.entry.len - ai.s + 2.2;
    if (f.phase === 'out' && !f.go && f.why !== 'knocked') { if (p === f.exit) return f.yieldS - ai.s + 2.2; if (p === f.entry) return f.entry.len - ai.s + f.yieldS + 2.2; }
    return Infinity; }
  update(dt, ctx) { for (const st of this.stations) st.update(dt, ctx); }
  nearest(x, z) { let best = null, bd = Infinity; for (const st of this.stations) { const d = Math.hypot(st.site.O[0] - x, st.site.O[1] - z); if (d < bd) { bd = d; best = st; } } return best; }
}
