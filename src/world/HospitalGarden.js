// National Hospital garden (75th request): life in the garden behind the building, kept cheap for the GTX 1660S target.
//   • a small stone fountain on the central path (where the 'garden.fountain' sound already sits, PlaceAmbience.js): round
//     basin with a coping, water surface, pedestal and upper bowl with a falling water curtain and slowly spreading ripples;
//   • park benches (teak slats on dark-green cast-iron frames, armrests) — the ones people sit on are built at each
//     sitter's own seat height, so hips rest on the slats and feet stay on the ground (no model lowered into a seat);
//   • three people: a ward patient (sarong and shirt) on a bench with a visitor beside him, and an elderly patient
//     walking slowly round the fountain and down the path and back.
// Cost: the benches + fountain are 4 merged meshes (wood, metal, stone, water) built once; the people are only shown and
// animated while the player is within GARDEN_NEAR of the fountain and outside the building, animated at full rate close
// up and at 4 Hz further away; otherwise nothing runs (no AI, no skinning, no draws).
import * as THREE from 'three';
import { Character } from '../actors/Character.js';
import { makeAppearance } from '../actors/Appearance.js';
import { seatTopFor } from './ClubCast.js';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { toWorld, Y0 } from './HospitalPlan.js';
import { hospitalMatTable } from './HospitalKit.js';
import { parkBench, parkBenchColliders } from './ParkBench.js';
import { GARDEN_FOUNTAIN } from './PlaceAmbience.js'; // the fountain sound's position
const GARDEN_NEAR = 55, GARDEN_FULL = 26;
const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// plan (u, v) → world; the plan's +v runs to world −z, so a bench facing +v in the plan faces world −z
const W = (u, v) => toWorld(u, v);
const yawPlan = (du, dv) => Math.atan2(du, -dv); // world yaw of a plan direction (THREE: +z forward at yaw 0)

// a hospital wheelchair (folding steel frame, navy sling seat, spoked rear wheels with push rims, casters) into the merged
// builder: seat centre (x, z), facing yaw, seat top sy above the ground y0; footplates at height foot under the sitter's feet
const _o = new THREE.Object3D(), _M = new THREE.Matrix4(), _Y = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
const GEO = {}; const geo = (k, f) => GEO[k] || (GEO[k] = f());
export function wheelchair(E, x, y0, z, yaw, sy, foot, feet) {
  const steel = E('h_metal'), rub = E('h_plastic'), fab = E('h_fabric'); const STEEL = C('#c9ccd0'), BLACK = C('#1c1c1e'), NAVY = C('#27365a');
  _Y.makeRotationY(yaw).setPosition(x, y0, z); const c = Math.cos(yaw), s = Math.sin(yaw);
  const put = (B, g, lx, ly, lz, rx, ry, rz, col, sc = 1) => { _o.position.set(lx, ly, lz); _o.rotation.set(rx, ry, rz); _o.scale.setScalar(sc); _o.updateMatrix(); _M.multiplyMatrices(_Y, _o.matrix); B.geometry(g, _M, col); };
  const bx = (B, lx, ly, lz, sx, syy, sz, col, rx = 0) => { _o.position.set(lx, ly, lz); _o.rotation.set(rx, 0, 0); _o.scale.set(sx, syy, sz); _o.updateMatrix(); _M.multiplyMatrices(_Y, _o.matrix); B.geometry(geo('box', () => new THREE.BoxGeometry(1, 1, 1)), _M, col); };
  const rod = (B, a, b, r, col) => { _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d.length(); _o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); _o.quaternion.setFromUnitVectors(_up, _d.normalize()); _o.scale.set(r, L, r); _o.updateMatrix(); _M.multiplyMatrices(_Y, _o.matrix); B.geometry(geo('rod', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1, true)), _M, col); };
  const RW = 0.3, wz = -0.13; // rear wheels: tyre, alloy rim, push rim, hub, spokes
  for (const sx of [-1, 1]) { const wx = sx * 0.3;
    put(rub, geo('tyre', () => new THREE.TorusGeometry(RW - 0.02, 0.02, 6, 22)), wx, RW, wz, 0, Math.PI / 2, 0, BLACK);
    put(steel, geo('rim', () => new THREE.TorusGeometry(RW - 0.045, 0.01, 4, 22)), wx, RW, wz, 0, Math.PI / 2, 0, STEEL);
    put(steel, geo('push', () => new THREE.TorusGeometry(RW - 0.05, 0.008, 4, 22)), wx + sx * 0.04, RW, wz, 0, Math.PI / 2, 0, STEEL);
    rod(steel, [wx - 0.035, RW, wz], [wx + 0.035, RW, wz], 0.035, STEEL);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI; bx(steel, wx, RW, wz, 0.005, (RW - 0.05) * 2, 0.005, STEEL, a); }
    for (const t of [0.4, 1.2, 2.0, 2.8]) rod(steel, [wx, RW + Math.cos(t) * 0.2, wz + Math.sin(t) * 0.2], [wx + sx * 0.04, RW + Math.cos(t) * 0.25, wz + Math.sin(t) * 0.25], 0.004, STEEL); }
  for (const sx of [-1, 1]) { const fx = sx * 0.22, fz = 0.31; // casters + forks
    put(rub, geo('caster', () => new THREE.TorusGeometry(0.06, 0.018, 4, 12)), fx, 0.078, fz + 0.03, 0, Math.PI / 2, 0, BLACK);
    for (const o of [-0.022, 0.022]) rod(steel, [fx + o, 0.078, fz + 0.03], [fx + o, 0.17, fz], 0.006, STEEL); rod(steel, [fx, 0.17, fz], [fx, 0.27, fz], 0.012, STEEL); }
  const rail = sy - 0.05;
  for (const sx of [-1, 1]) { const fx = sx * 0.24; // side frame
    rod(steel, [fx, rail, -0.2], [fx, rail, 0.3], 0.012, STEEL); rod(steel, [fx * 0.92, 0.27, 0.31], [fx, rail, 0.3], 0.012, STEEL);
    rod(steel, [fx, 0.25, -0.2], [fx, sy + 0.5, -0.22], 0.012, STEEL); rod(steel, [fx, sy + 0.5, -0.22], [fx, sy + 0.52, -0.33], 0.012, STEEL); rod(rub, [fx, sy + 0.515, -0.28], [fx, sy + 0.525, -0.36], 0.016, BLACK);
    rod(steel, [fx, 0.25, -0.2], [fx * 0.92, 0.27, 0.31], 0.011, STEEL); // lower rail
    bx(rub, fx + sx * 0.015, sy + 0.22, 0.0, 0.05, 0.03, 0.27, BLACK); rod(steel, [fx, rail, 0.1], [fx + sx * 0.015, sy + 0.205, 0.1], 0.01, STEEL); rod(steel, [fx, rail, -0.12], [fx + sx * 0.015, sy + 0.205, -0.12], 0.01, STEEL); }
  rod(steel, [-0.24, 0.27, 0.02], [0.24, rail, 0.02], 0.01, STEEL); rod(steel, [0.24, 0.27, 0.02], [-0.24, rail, 0.02], 0.01, STEEL); // folding X-brace
  rod(steel, [-0.3, RW, wz], [-0.24, RW, wz], 0.01, STEEL); rod(steel, [0.3, RW, wz], [0.24, RW, wz], 0.01, STEEL); // axles
  bx(fab, 0, sy - 0.014, 0.04, 0.45, 0.025, 0.46, NAVY); bx(fab, 0, sy + 0.26, -0.215, 0.45, 0.38, 0.02, NAVY, -0.06); // sling seat + back
  // footplates under the feet (the sitter's ankle positions, measured in his seated pose), hangers from the front of the frame
  for (let i = 0; i < 2; i++) { const sx = i === 0 ? 1 : -1; const f = feet && feet[i]; let lx = sx * 0.12, lz = 0.45;
    if (f) { const dx = f.x - x, dz = f.z - z; lx = dx * c - dz * s; lz = dx * s + dz * c; lz += 0.05; } lx = Math.max(-0.2, Math.min(0.2, lx)); lz = Math.max(0.3, Math.min(0.62, lz));
    bx(rub, lx, foot - 0.008, lz, 0.13, 0.014, 0.13, BLACK); rod(steel, [sx * 0.21, rail - 0.02, 0.3], [lx + sx * 0.07, foot, lz - 0.04], 0.01, STEEL); }
}
const seatLiftOf = (ch) => { const b = ch.bones; const sh = b && (b.shinL || b.shinR); const thigh = sh ? sh.position.length() : 0.44; return clamp(0.46 - thigh * (1 - Math.cos(1.45)), 0, 0.12); };

let waterMat = null, curtainTex = null;
function fountainWater() { // one shared material (built with the hospital at load): clear, slightly green-blue, glossy
  if (!waterMat) waterMat = new THREE.MeshStandardMaterial({ color: 0x2c6a72, roughness: 0.22, metalness: 0, envMapIntensity: 0.45, transparent: true, opacity: 0.9, depthWrite: false, name: 'Hospital · Fountain water' });
  return waterMat; }
function curtainMaterial() { // the falling water curtain: streaks that scroll down (offset animated by the garden update)
  if (curtainTex) return curtainTex.mat; const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`; g.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random(), 6 + Math.random() * 18); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0xdfeef0, map: t, alphaMap: t, transparent: true, opacity: 0.7, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide, name: 'Hospital · Fountain curtain' });
  curtainTex = { t, mat }; return mat; }

export class HospitalGarden {
  constructor(h) {
    this.h = h; this.g = h.g; const mats = hospitalMatTable(); this.group = new THREE.Group(); this.group.name = 'hospGarden'; const cols = [];
    const mb = new MultiBuilder(); const [fx, fz] = W(GARDEN_FOUNTAIN.u, GARDEN_FOUNTAIN.v); this.fx = fx; this.fz = fz;
    // ---- fountain: basin r 1.5, coping, pedestal, bowl (stone = h_render), water = 2 small meshes
    const st = mb.get('h_render'), STONE = C('#d8d2c4'), DARK = C('#a9a293');
    st.cylinder(fx, Y0 + 0.18, fz, 1.5, 1.5, 0.36, 28, { col: STONE }); // basin body (its top is the pool floor under the water)
    for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2, ry = -(a + Math.PI / 2); // the basin's rim wall + coping, so the water inside shows
      st.box(fx + Math.cos(a) * 1.41, Y0 + 0.41, fz + Math.sin(a) * 1.41, 2 * Math.PI * 1.41 / 28 * 1.06, 0.14, 0.18, { rotY: ry, col: STONE });
      st.box(fx + Math.cos(a) * 1.47, Y0 + 0.505, fz + Math.sin(a) * 1.47, 2 * Math.PI * 1.47 / 28 * 1.06, 0.05, 0.3, { rotY: ry, col: DARK }); }
    st.cylinder(fx, Y0 + 0.62, fz, 0.16, 0.2, 0.5, 14, { col: STONE }); st.cylinder(fx, Y0 + 0.9, fz, 0.08, 0.55, 0.12, 20, { col: STONE }); st.cylinder(fx, Y0 + 1.0, fz, 0.55, 0.56, 0.06, 20, { col: DARK });
    st.cylinder(fx, Y0 + 1.12, fz, 0.05, 0.07, 0.18, 10, { col: STONE }); st.cylinder(fx, Y0 + 1.24, fz, 0.08, 0.02, 0.08, 10, { col: DARK }); // finial
    cols.push({ x0: fx - 1.55, x1: fx + 1.55, z0: fz - 1.55, z1: fz + 1.55, h: Y0 + 1.3, kind: 'landmark', id: 'hospFountain' });
    const wm = fountainWater(); const pool = new THREE.Mesh(new THREE.CircleGeometry(1.34, 32), wm); pool.rotation.x = -Math.PI / 2; pool.position.set(fx, Y0 + 0.44, fz); pool.renderOrder = 2; this.group.add(pool);
    const bowl = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), wm); bowl.rotation.x = -Math.PI / 2; bowl.position.set(fx, Y0 + 1.035, fz); bowl.renderOrder = 2; this.group.add(bowl);
    const cur = new THREE.Mesh(new THREE.CylinderGeometry(0.565, 0.66, 0.59, 24, 1, true), curtainMaterial()); cur.position.set(fx, Y0 + 0.735, fz); cur.renderOrder = 3; this.group.add(cur); this.curtain = cur;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.74, 32), new THREE.MeshBasicMaterial({ color: 0xe8f4f5, transparent: true, opacity: 0.35, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(fx, Y0 + 0.445, fz); ring.renderOrder = 3; this.group.add(ring); this.ring = ring;
    // ---- people + their bench (built to their seat height; the other garden benches are static, HospitalBuild.buildGrounds)
    this.people = []; const add = (seed, preset, sex) => { const ch = new Character(makeAppearance(seed, { preset, sex })); ch.root.visible = false; this.g.scene.add(ch.root); const p = { ch, x: 0, z: 0, yaw: 0, seated: false, acc: 0 }; this.people.push(p); return p; };
    const benchU = -2.25, benchV = 39.0, bYaw = yawPlan(1, 0); // west edge of the path, facing east (across the path to the fountain)
    const patient = add(7481, 'm_uncle_sarong', 'm'), visitor = add(7487, 'f_aunty', 'f');
    // the visitor on the bench (built at her seat height); the patient in a hospital wheelchair drawn up at the bench's end,
    // angled towards her (the chair's seat at his height, raised by the footplate height so his feet rest on the plates)
    const sy = seatTopFor(visitor.ch) + seatLiftOf(visitor.ch);
    const [bx, bz] = W(benchU, benchV); parkBench((n) => mb.get(n), bx, Y0, bz, bYaw, sy); parkBenchColliders(cols, bx, bz, bYaw, Y0 + sy + 0.4, 'hospGardenBench');
    const fwd = [Math.sin(bYaw), Math.cos(bYaw)], side = [Math.cos(bYaw), -Math.sin(bYaw)];
    visitor.seated = true; visitor.lift = sy - seatTopFor(visitor.ch); visitor.x = bx + side[0] * 0.42 - fwd[0] * 0.04; visitor.z = bz + side[1] * 0.42 - fwd[1] * 0.04; visitor.yaw = bYaw;
    const FOOT = 0.085, wy = bYaw - 0.6, wsy = seatTopFor(patient.ch) + seatLiftOf(patient.ch) + FOOT; const wx = bx + side[0] * 1.45 + fwd[0] * 0.42, wz = bz + side[1] * 1.45 + fwd[1] * 0.42;
    patient.seated = true; patient.lift = wsy - seatTopFor(patient.ch); patient.x = wx - Math.sin(wy) * 0.02; patient.z = wz - Math.cos(wy) * 0.02; patient.yaw = wy;
    for (const p of [patient, visitor]) { p.ch.anim.set(null); p.ch.anim.seated = true; this.place(p); for (let i = 0; i < 4; i++) p.ch.anim.update(0.05, 0); p.ch.root.updateMatrixWorld(true); }
    const feet = ['footL', 'footR'].map((k) => { const bn = patient.ch.bones && patient.ch.bones[k]; return bn ? bn.getWorldPosition(new THREE.Vector3()) : null; });
    wheelchair((n) => mb.get(n), wx, Y0, wz, wy, wsy, FOOT, feet); cols.push({ x0: wx - 0.4, x1: wx + 0.4, z0: wz - 0.4, z1: wz + 0.4, h: Y0 + wsy + 0.3, kind: 'landmark', id: 'hospWheelchair' });
    // ---- the walking patient: round the fountain twice, down the path towards the building and back
    const walker = add(7493, 'm_retiree', 'm'); this.walker = walker; const path = [];
    for (let lap = 0; lap < 2; lap++) for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; path.push(W(GARDEN_FOUNTAIN.u + Math.sin(a) * 2.45, GARDEN_FOUNTAIN.v - Math.cos(a) * 2.45)); }
    path.push(W(0.4, 36), W(0.4, 30), W(-0.4, 30), W(-0.4, 36), W(0, GARDEN_FOUNTAIN.v - 2.45)); walker.path = path; walker.pi = 0; [walker.x, walker.z] = path[0]; walker.wait = 0;
    for (const m of mb.toMeshes(mats, { cast: true, receive: true })) this.group.add(m);
    this.g.scene.add(this.group); if (this.g.collision) this.g.collision.addAll(cols); this.colliders = cols;
    this.shown = false; this.t = 0; this.talkT = 2; this.talker = 0; this.stats = { shown: 0, updates: 0 };
    for (const p of this.people) this.place(p);
  }
  place(p) { p.ch.root.position.set(p.x, Y0 + (p.seated ? p.lift : 0), p.z); p.ch.root.rotation.y = p.yaw; }
  update(dt, P, inside) {
    this.t += dt; const d = Math.hypot(P.x - this.fx, P.z - this.fz); const show = !inside && d < GARDEN_NEAR;
    // the water moves whenever the fountain can be seen (cheap: a texture offset and a ring scale)
    if (d < 90) { if (curtainTex) curtainTex.t.offset.y = (this.t * 0.9) % 1; const k = (this.t * 0.45) % 1; this.ring.scale.setScalar(1 + k * 0.7); this.ring.material.opacity = 0.35 * (1 - k); }
    if (show !== this.shown) { this.shown = show; for (const p of this.people) p.ch.root.visible = show; if (show) this.stats.shown++; }
    if (!show) return; this.stats.updates++;
    const full = d < GARDEN_FULL;
    // walker: slow, steady (0.65 m/s), turns smoothly, pauses at the end of the path
    { const w = this.walker; let sp = 0; if (w.wait > 0) w.wait -= dt; else { const [tx, tz] = w.path[w.pi]; const dx = tx - w.x, dz = tz - w.z, dd = Math.hypot(dx, dz);
        if (dd < 0.25) { w.pi = (w.pi + 1) % w.path.length; if (w.pi === w.path.length - 3) w.wait = 4; } else { sp = 0.65; const st = Math.min(dd, sp * dt); w.x += dx / dd * st; w.z += dz / dd * st; w.yaw += wrap(Math.atan2(dx, dz) - w.yaw) * Math.min(1, dt * 4); } }
      this.place(w); w.sp = sp; }
    // the pair on the bench chat: turns of 3–7 s, now and then a quiet pause
    if ((this.talkT -= dt) <= 0) { this.talkT = 3 + Math.random() * 4; const last = this.talker < 0 ? (this.lastTalker || 0) : this.talker; if (this.talker >= 0) this.lastTalker = this.talker; this.talker = Math.random() < 0.15 ? -1 : 1 - last; for (let i = 0; i < 2; i++) { const f = this.people[i].ch.face; if (f) f.talking = i === this.talker; } }
    for (const p of this.people) { const spd = p === this.walker ? p.sp : 0; if (full) p.ch.anim.update(dt, spd); else if ((p.acc += dt) > 0.25) { p.ch.anim.update(p.acc, spd); p.acc = 0; } }
  }
  get charCount() { return this.people.length; }
}
