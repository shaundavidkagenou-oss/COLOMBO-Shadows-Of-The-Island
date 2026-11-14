// Dineth's Bike — the rider side: pedalling (cranks driven by the rear wheel, feet on the pedals by IK), the four stunts only
// Dineth can do, parking it at his room in Slave Island (and bringing it back there if it is ever lost). Geometry: Bicycle.js.
import * as THREE from 'three';
import { solveLeg } from '../actors/Seating.js';
import { solveArmIK } from '../actors/Character.js';
import { Input } from '../core/Input.js';
import * as L from '../world/Layout.js';
import { DBIKE_ID, DBIKE_T, R, ZR, BB, CRANK, PEDAL_X, SEAT, GRIPS, GEAR, crankGroup } from './Bicycle.js';

// ---------------------------------------------------------------------------------------------- stunts
const STUNTS = { flamingo: { key: 'Digit1', label: 'Flamingo', hold: 3.2, ramp: 0.55, vmin: 3.0 }, floor: { key: 'Digit2', label: 'Floor touch', hold: 0.7, ramp: 0.6, vmin: 3.0 },
  wheelie: { key: 'Digit3', label: 'Wheel neutral', hold: 6, ramp: 0.5, vmin: 2.0, toggle: true }, rumba: { key: 'Digit4', label: 'Rumba', hold: 4.5, ramp: 0.45, vmin: 1.2, toggle: true } };
export const STUNT_KEYS = Object.fromEntries(Object.entries(STUNTS).map(([k, s]) => [k, s.key]));
const sm = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _e = new THREE.Euler(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _t = new THREE.Vector3();

export class Bicycles {
  constructor(game) { this.g = game; this.v = null; this.home = null; this.crank = 0; this.st = null; this.prompt = ''; this.hintT = 0; this.rider = null; this.t = 0; this.warnT = 0; this.respawnT = 0; this.poseFn = (b) => this.pose(b); }
  // a pavement spot by a road near Dineth's room in Slave Island, bike parallel to the kerb
  findHome() {
    const col = this.g.collision; const RA = (x, z) => !!L.roadAt(x, z); const free = (x, z) => !col.blocked(x, z, 0.9) && !RA(x, z) && !L.isWater(x, z);
    for (let r = 0; r < 60; r += 1.5) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const x = -136 + Math.cos(a) * r, z = -146 + Math.sin(a) * r; if (!free(x, z)) continue;
      for (let d = 0; d < 4; d++) { const nx = Math.cos(d * Math.PI / 2), nz = Math.sin(d * Math.PI / 2); if (RA(x + nx * 2.2, z + nz * 2.2) && !RA(x + nx * 0.6, z + nz * 0.6) && free(x - nx * 0.4, z - nz * 0.4)) return { x, z, yaw: Math.atan2(-nz, nx) }; } }
    return { x: -136, z: -146, yaw: 0 };
  }
  spawn(Vehicle) {
    if (!this.home) this.home = this.findHome(); const h = this.home;
    const v = new Vehicle(DBIKE_ID, 7, this.g.scene); v.place(h.x, h.z, h.yaw); v.ownerId = 'dineth-bike'; this.g.traffic.release(v, false); this.attach(v); this.v = v; return v;
  }
  attach(v) { if (v.mesh.userData.crank) return; const c = crankGroup(); v.mesh.add(c); v.mesh.userData.crank = c; v.pedalCtl = this; this.syncCrank(v); }
  syncCrank(v) { const c = v.mesh.userData.crank; if (!c) return; c.rotation.x = -this.crank; for (const p of c.userData.pedals) p.rotation.x = this.crank; }
  heroId() { const s = this.g.squad; return s ? s.activeId : 'dineth'; }
  // per frame (Game loop): respawn if lost, prompts, tidy up after he gets off
  update(dt, Vehicle) {
    const g = this.g, P = g.player; this.warnT = Math.max(0, this.warnT - dt); this.hintT = Math.max(0, this.hintT - dt);
    if (!this.v && !this.home && g.traffic && g.collision) this.spawn(Vehicle); // first frame of play: parked at his room
    else if ((!this.v || this.v.disposed) && this.home) { this.respawnT += dt; if (this.respawnT > 2 && Math.hypot(P.x - this.home.x, P.z - this.home.z) > 140) { this.respawnT = 0; this.spawn(Vehicle); } }
    const riding = this.v && P.vehicle === this.v;
    if (riding && !this.rider) { this.rider = P.ch; this.hintT = 9; const dn = this.heroId() === 'dineth';
      if (g.hud) g.hud.notify(DBIKE_T.name, dn ? `${['1 flamingo', '2 floor touch', '3 wheel neutral', '4 rumba'].join(' · ')}` : 'Only Dineth can do the stunts on this bike', 'info', 4); }
    if (!riding && this.rider) this.dismount();
    this.prompt = riding && this.hintT > 0 && this.heroId() === 'dineth' && !this.st ? '<kbd>1</kbd> Flamingo · <kbd>2</kbd> Floor touch · <kbd>3</kbd> Wheel neutral · <kbd>4</kbd> Rumba' : '';
    if (this.v && !riding && this.v.mesh.userData.crank) this.syncCrank(this.v);
  }
  dismount() { const A = this.rider && this.rider.anim; if (A && A.postPose === this.poseFn) A.postPose = null; this.rider = null; this.st = null; if (this.v) this.v.stunt = null; }
  // Player.updateVehicle, before Vehicle.drive: crank, stunt input / timing, the bike's stunt attitude
  ride(dt, P, throttle) {
    const v = this.v; if (!v || P.vehicle !== v) return throttle; const A = P.ch.anim; this.t += dt; this.rider = P.ch;
    if (A.postPose == null || A.postPose === this.poseFn) A.postPose = this.poseFn;
    // stunt keys (number keys are free while riding: weapons are holstered on a bike)
    const can = this.heroId() === 'dineth' && P.control;
    for (const [k, S] of Object.entries(STUNTS)) if (Input.keyPressed(S.key)) {
      if (!can) { if (!this.warnT && this.g.hud) { this.g.hud.notify(DBIKE_T.name, 'Only Dineth can do the stunts on this bike', 'warn', 2.5); this.warnT = 3; } break; }
      if (this.st && this.st.kind === k) { if (S.toggle && this.st.phase !== 'out') { this.st.phase = 'out'; this.st.t = 0; } break; }
      if (Math.abs(v.speed) < S.vmin) { if (this.g.hud) this.g.hud.notify(S.label, 'Pedal faster first', 'info', 1.6); break; }
      this.st = { kind: k, phase: 'in', t: 0, w: this.st ? this.st.w * 0.3 : 0 }; if (this.g.hud) this.g.hud.notify(S.label, '', 'info', 1.4); break; }
    const st = this.st; if (st) { const S = STUNTS[st.kind]; st.t += dt;
      if (st.phase === 'in') { st.w = Math.min(1, st.w + dt / S.ramp); if (st.w >= 1) { st.phase = 'hold'; st.t = 0; } }
      else if (st.phase === 'hold') { if (st.t > S.hold) { st.phase = 'out'; st.t = 0; } }
      else { st.w = Math.max(0, st.w - dt / S.ramp); if (st.w <= 0) this.st = null; }
      if (this.st && st.phase !== 'out' && (Math.abs(v.speed) < S.vmin * 0.55 || (v.lastImpact && performance.now() - v.lastImpact.t < 80))) { st.phase = 'out'; st.t = 0; } }
    // the bike's attitude for the stunt (Vehicle.sync applies it: wheelie about the rear axle, roll about the tyre line)
    const k = this.st ? sm(this.st.w) : 0, kind = this.st && this.st.kind; let pitch = 0, roll = 0;
    if (kind === 'wheelie') pitch = -(0.52 + 0.035 * Math.sin(this.t * 2.3) + 0.02 * Math.sin(this.t * 5.1)) * k;
    else if (kind === 'rumba') roll = 0.3 * Math.sin(this.t * Math.PI * 2 * 1.45) * Math.min(1, k * 1.4);
    else if (kind === 'floor') { roll = 0.78 * k; const sp = Math.max(Math.abs(v.speed), 2); v.yaw -= (9.81 * Math.tan(roll) / sp) * dt * 0.85; } // a real carve: the lean needs the turn
    v.stunt = k > 0 ? { pitch, roll, zR: ZR } : null;
    // cranks: driven by the rear wheel while he pedals (freewheel when he stops), parked level for the coasting stunts
    const coast = kind === 'wheelie' || kind === 'floor' || kind === 'flamingo'; const dW = (v.speed * dt) / R;
    if (!coast && throttle > 0.05 && v.speed > -0.2) this.crank -= Math.max(dW, 0.4 * dt) / GEAR * (kind === 'rumba' ? 1.15 : 1);
    else { const target = kind === 'floor' ? -Math.PI / 2 : Math.round(this.crank / Math.PI) * Math.PI; this.crank += wrap(target - this.crank) * Math.min(1, dt * (coast ? 5 : 0)); }
    this.syncCrank(v); return coast ? Math.min(0, throttle) : throttle;
  }
  // ------------------------------------------------------------------ rider pose (Animator.postPose, after the seated pose)
  pose(b) {
    const ch = this.rider, v = this.v; if (!ch || !v) return; const A = ch.anim; if (!A.seated || A.board || A.seatW < 0.5 || ch.root.parent !== v.mesh) return;
    const st = this.st, k = st ? sm(st.w) : 0, kind = st ? st.kind : null; const s = A.s; const thighR = 0.075 * s * ch.spec.build;
    const hip0 = b.hips.position.clone(); const lean0 = A.seatLean ?? 0.42; const roll = v.stunt ? v.stunt.roll : 0;
    // ---- hips / trunk target per stunt (root space: saddle top, +z forward, +x left)
    let hp = hip0.clone(), he = [lean0, 0, 0], sp = [0, 0, 0], cs = [0, 0, 0], nk = [0, 0, 0];
    if (kind === 'rumba') { const up = 0.3 * s; hp.set(Math.sin(roll) * 1.05, hip0.y + up, hip0.z + 0.12); he = [0.62, 0, -roll * 0.95]; nk = [-0.2, 0, roll * 0.3]; }
    else if (kind === 'wheelie') { he = [lean0 - 0.08, 0, 0]; nk = [0.42, 0, 0]; }
    else if (kind === 'flamingo') { hp.set(0, 0.54 * s, 0.22); he = [1.42, 0, 0]; nk = [-0.95, 0, 0]; }
    else if (kind === 'floor') { hp.set(-0.12, hip0.y - 0.02, hip0.z + 0.04); he = [0.62, -0.12, 0.42]; sp = [0.06, 0, 0.3]; cs = [0.04, -0.1, 0.28]; nk = [-0.25, 0, -0.55]; }
    b.hips.position.lerp(hp, k); _e.set(he[0], he[1], he[2], 'XYZ'); _qa.setFromEuler(_e); b.hips.quaternion.slerp(_qa, k);
    const add = (bone, r) => { if (!(r[0] || r[1] || r[2])) return; _e.set(r[0] * k, r[1] * k, r[2] * k, 'XYZ'); _qb.setFromEuler(_e); b[bone].quaternion.multiply(_qb); };
    add('spine', sp); add('chest', cs); add('neck', [nk[0] * 0.55, nk[1], nk[2] * 0.5]); add('head', [nk[0] * 0.45, nk[1], nk[2] * 0.5]);
    // ---- feet: on the pedals (crank angle), blended to the stunt targets
    const cy = BB[1] - SEAT[1], cz = BB[2] - SEAT[2]; const qh = b.hips.quaternion; const a = b.shinL.position.length(), bl = b.footL.position.length(); const ankle = A.ankle;
    for (const sd of ['L', 'R']) { const sx = sd === 'L' ? 1 : -1; const th = this.crank + (sd === 'L' ? 0 : Math.PI);
      const F = _t.set(sx * PEDAL_X, cy + Math.sin(th) * CRANK + ankle, cz + Math.cos(th) * CRANK - 0.06); let toe = 0.12 + 0.18 * Math.max(0, -Math.cos(th + 0.6)) - 0.05;
      if (kind === 'flamingo') { const G = sd === 'R' ? _w.set(-0.04, ankle + 0.004, -0.05) : _w.set(0.1, 0.66 * s, -0.66); F.lerp(G, k); toe = toe * (1 - k) + (sd === 'R' ? 0 : 0.9) * k; }
      const tb = b['thigh' + sd]; const H = _v.copy(tb.position).applyQuaternion(qh).add(b.hips.position);
      const L = solveLeg(H, F, a, bl); _e.set(-L.theta, 0, L.gamma, 'ZXY'); _qa.setFromEuler(_e);
      _qc.copy(qh).invert().multiply(_qa); tb.quaternion.copy(_qc); _e.set(L.knee, 0, 0, 'XYZ'); _qb.setFromEuler(_e); b['shin' + sd].quaternion.copy(_qb);
      _qc.copy(_qa).multiply(_qb).invert(); _e.set(toe, sx * 0.06, 0, 'XYZ'); _qa.setFromEuler(_e).premultiply(_qc); b['foot' + sd].quaternion.copy(_qa); }
    void thighR;
    // ---- hands: grips (steer follows the bar), or the road for the floor touch
    const root = ch.root; root.updateWorldMatrix(true, false); b.chest.updateWorldMatrix(true, false);
    const toChest = (p) => { _v.copy(p); root.localToWorld(_v); return b.chest.worldToLocal(_v.clone()); };
    const stv = Math.max(-1, Math.min(1, A.steer || 0)) * 0.06; const gl = GRIPS[0], gr = GRIPS[1];
    // reach: the bars sit well ahead of a tall saddle — bend forward at the waist until both shoulders can reach (no stretched-past arms)
    if (kind !== 'floor') { const reach = (b.foreL.position.length() + b.handL.position.length()) * 0.96;
      for (let it = 0; it < 3; it++) { let ex = 0; for (const [S, gp] of [['L', gl], ['R', gr]]) { _v.set(gp[0] - SEAT[0], gp[1] + 0.03 - SEAT[1], gp[2] - 0.05 - SEAT[2]); root.localToWorld(_v); b['arm' + S].updateWorldMatrix(true, false); _w.setFromMatrixPosition(b['arm' + S].matrixWorld); ex = Math.max(ex, _v.distanceTo(_w) - reach); }
        if (ex <= 0.005) break; _e.set(Math.min(0.45, ex * 1.6), 0, 0, 'XYZ'); _qb.setFromEuler(_e); b.spine.quaternion.multiply(_qb); b.spine.updateWorldMatrix(false, true); }
      b.chest.updateWorldMatrix(true, false); }
    let tL = toChest(_t.set(gl[0] - 0.02 - SEAT[0], gl[1] + 0.03 - SEAT[1], gl[2] - 0.05 - stv - SEAT[2]));
    let tR = toChest(_t.set(gr[0] + 0.02 - SEAT[0], gr[1] + 0.03 - SEAT[1], gr[2] - 0.05 + stv - SEAT[2]));
    if (kind === 'floor' && k > 0.01) { v.mesh.updateWorldMatrix(true, false); const yaw = v.yaw; const gy = v.y; const rx = -Math.cos(yaw), rz = Math.sin(yaw); // the bike's right (−x local) on the ground
      const touch = Math.min(1, k * 1.15); _w.set(v.x + rx * 0.98 + Math.sin(yaw) * 0.32, gy + 0.05, v.z + rz * 0.98 + Math.cos(yaw) * 0.32); const tw = b.chest.worldToLocal(_w.clone()); tR.lerp(tw, touch); this.handGround = _w.clone(); }
    solveArmIK(b, 'L', tL, null, 1); solveArmIK(b, 'R', tR, null, 1);
    _e.set(0.25, 0, -0.3, 'XYZ'); b.handL.quaternion.setFromEuler(_e); _e.set(kind === 'floor' ? 0.25 + 0.9 * k : 0.25, 0, 0.3, 'XYZ'); b.handR.quaternion.setFromEuler(_e);
  }
}
