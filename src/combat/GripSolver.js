// Grip solver: places a hero's hands on a weapon the way a shooter holds it, using the character's real finger bones.
//
// Each weapon model describes its hand surfaces in userData.hold (WeaponModels.js): the pistol grip as a raked rounded
// box, the trigger, the frame / guard / receiver / magazine around it and, on long guns, the forend. For a given
// character this module, once per weapon (cached):
//   1. orients the firing hand by the grip: knuckle line along the grip axis, palm on the right panel, the hand turned so
//      the backstrap sits in the web of the thumb, fingers wrapping the front strap;
//   2. slides the hand until its palm touches the grip and the index knuckle is at trigger height, so the middle finger
//      rides under the trigger guard;
//   3. closes every finger joint by joint until each link touches the surface (no air gap, no finger through metal) —
//      the classic grasp-closing method: a link that touches freezes the joints behind it, the rest keep curling;
//   4. puts the index pad on the trigger face (firing) or straight along the frame above it (trigger discipline);
//   5. searches the thumb's three angles for the shooter's thumb position (pistol: high on the left of the frame;
//      rifle: wrapped over the grip) without entering the weapon;
//   6. does the same for the support hand: rifles — the forend lies in the palm, fingers up the right side, thumb along
//      the left; pistols — the support palm fills the left panel and its fingers wrap over the firing hand's fingers.
// The result is the wrist position + hand orientation in weapon space (fed to the arm IK) and per-joint finger poses
// (HeroRig.hand). Everything is in the hand bone's own frame: fingers −y, wrist +y, knuckle line along z (index +z),
// right palm +x / left palm −x — exactly how HeroRig bends the joints, so what is solved is what is rendered.
import * as THREE from 'three';

const FING = ['idx', 'mid', 'rng', 'pnk'];
const PALM_X = 0.019; // palm skin from the hand bone axis (measured on the hero hands)
const R_FINGER = 0.0082; // finger half-thickness
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _d = new THREE.Vector3();

// signed distance from p to a rounded box {c, X, Y, Z, h:[hx,hy,hz], rr}
function sdBox(p, s) {
  _d.subVectors(p, s.c); const r = s.rr;
  const qx = Math.abs(_d.dot(s.X)) - (s.h[0] - r), qy = Math.abs(_d.dot(s.Y)) - (s.h[1] - r), qz = Math.abs(_d.dot(s.Z)) - (s.h[2] - r);
  const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)); return out + Math.min(Math.max(qx, qy, qz), 0) - r;
}
// signed distance from p to an upright (y axis) capped cylinder {cyl: true, c, r, hy}
function sdCyl(p, s) { _d.subVectors(p, s.c); const dr = Math.hypot(_d.x, _d.z) - s.r, dy = Math.abs(_d.y) - s.hy; return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0)); }
const sdf = (p, shapes) => { let d = 1e9; for (const s of shapes) d = Math.min(d, s.cyl ? sdCyl(p, s) : sdBox(p, s)); return d; };
export function boxShape(c, rx, h, rr = 0.003) { // box rotated about the weapon's x axis (raked grips)
  const cs = Math.cos(rx), sn = Math.sin(rx);
  return { c: c.clone(), X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, cs, sn), Z: new THREE.Vector3(0, -sn, cs), h, rr: Math.min(rr, ...h) };
}
function grown(s, dx0, dx1, dz0, dz1) { // the box grown on its −x / +x and −z / +z faces (support hand over the firing fingers)
  const c = s.c.clone().addScaledVector(s.X, (dx1 - dx0) / 2).addScaledVector(s.Z, (dz1 - dz0) / 2);
  return { ...s, c, h: [s.h[0] + (dx0 + dx1) / 2, s.h[1], s.h[2] + (dz0 + dz1) / 2] };
}

// ---------------------------------------------------------------- forward kinematics in the hand bone's frame
class Hand {
  constructor(bones, S) {
    this.S = S; this.sx = S === 'L' ? 1 : -1;
    this.f = FING.map((n) => { const p = [1, 2, 3].map((j) => bones[n + j + S].position.clone()); return { p, tip: p[2].clone().multiplyScalar(0.85) }; });
    const t = [1, 2, 3].map((j) => bones['thb' + j + S].position.clone()); this.th = { p: t, tip: t[2].clone().multiplyScalar(0.9) };
    this.mcp = this.f[0].p[0].clone(); this.mcpMid = this.f.reduce((a, f) => a.add(f.p[0]), new THREE.Vector3()).multiplyScalar(0.25);
    // palm skin samples (the side facing the weapon)
    const px = -this.sx * PALM_X; this.palm = [];
    for (const y of [-0.058, -0.045, -0.032, -0.02]) for (const z of [-0.022, -0.006, 0.01, 0.026]) this.palm.push(new THREE.Vector3(px, y, z));
  }
  // finger fi with joint angles a = [a1, a2, a3] → points along its links (hand frame); same rotations as HeroRig.update
  finger(fi, a, out = []) {
    const F = this.f[fi]; out.length = 0; const sp = (fi - 1.5) * 0.04 * (1 - Math.min(1, a[1]));
    const q = new THREE.Quaternion(); let pos = F.p[0].clone(); const links = [];
    for (let j = 0; j < 3; j++) { q.multiply(_q.setFromEuler(_e.set(0, sp, -this.sx * a[j]))); const seg = (j < 2 ? F.p[j + 1] : F.tip).clone().applyQuaternion(q); const nxt = pos.clone().add(seg); links.push([pos, nxt]); pos = nxt; }
    for (let j = 0; j < 3; j++) { const [p0, p1] = links[j]; for (const t of [0.34, 0.67, 1]) out.push({ link: j, p: p0.clone().lerp(p1, t) }); }
    return out;
  }
  thumb(t, ox, oy) {
    const T = this.th, s = this.sx; const q = new THREE.Quaternion(); let pos = T.p[0].clone(); const pts = [];
    const rots = [[t * 0.55 + ox, oy, -s * t * 0.45], [0, 0, -s * t * 0.55], [0, 0, -s * t * 0.5]];
    for (let j = 0; j < 3; j++) { q.multiply(_q.setFromEuler(_e.set(...rots[j]))); const seg = (j < 2 ? T.p[j + 1] : T.tip).clone().applyQuaternion(q); const nxt = pos.clone().add(seg); for (const k of [0.5, 1]) pts.push(pos.clone().lerp(nxt, k)); pos = nxt; }
    return { pts, tip: pos };
  }
}

// hand frame: weapon-space basis (X, Y, Z = the hand bone's axes) + origin
const toW = (F, p, out = new THREE.Vector3()) => out.copy(F.T).addScaledVector(F.X, p.x).addScaledVector(F.Y, p.y).addScaledVector(F.Z, p.z);
function frame(X, Z) { X = X.clone().normalize(); Z = Z.clone().addScaledVector(X, -Z.dot(X)).normalize(); return { X, Y: new THREE.Vector3().crossVectors(Z, X), Z, T: new THREE.Vector3() }; }
// place hand point `local` at weapon point `at`, then slide along the palm normal until the palm skin just touches `shapes`
function seat(F, H, local, at, shapes) {
  F.T.copy(at).addScaledVector(F.X, -local.x).addScaledVector(F.Y, -local.y).addScaledVector(F.Z, -local.z);
  const n = F.X.clone().multiplyScalar(-H.sx); // palm normal (towards the weapon) in weapon space
  for (let it = 0; it < 6; it++) { let m = 1e9; for (const p of H.palm) m = Math.min(m, sdf(toW(F, p, _v), shapes)); if (Math.abs(m) < 2e-4) break; F.T.addScaledVector(n, m); }
}

// grasp closing: all joints curl together; a link that touches freezes itself and the joints behind it
function close(F, H, fi, shapes, lim = [1.55, 1.75, 1.3]) {
  const a = [0, 0, 0], live = [true, true, true], step = 0.03; const pts = []; const w = new THREE.Vector3();
  const touching = () => { const hit = [false, false, false]; H.finger(fi, a, pts); for (const s of pts) if (sdf(toW(F, s.p, w), shapes) < R_FINGER) hit[s.link] = true; return hit; };
  if (touching().some(Boolean)) { // starts inside (finger lies on the surface): open it until clear
    for (let k = 0; k < 12 && touching().some(Boolean); k++) { a[0] -= 0.04; a[1] -= 0.03; } return a.map((v) => +v.toFixed(3)); }
  for (let it = 0; it < 120 && live.some(Boolean); it++) {
    const prev = a.slice(); for (let j = 0; j < 3; j++) if (live[j]) a[j] = Math.min(lim[j], a[j] + step * [0.9, 1, 0.75][j]);
    const hit = touching(); const k = hit.lastIndexOf(true) >= 0 ? hit.indexOf(true) : -1;
    if (k >= 0) { for (let j = 0; j <= k; j++) { a[j] = prev[j]; live[j] = false; } if (hit[2]) { a[2] = prev[2]; live[2] = false; } }
    for (let j = 0; j < 3; j++) if (a[j] >= lim[j]) live[j] = false;
  }
  return a.map((v) => +v.toFixed(3));
}
// index finger: pad of the distal link on the trigger face (search), or straight along the frame (min joint flex, clear)
function trigger(F, H, shapes, target) {
  let best = null, bc = 1e9; const pts = [];
  for (let a1 = -0.2; a1 <= 1.2; a1 += 0.05) for (let a2 = 0; a2 <= 1.6; a2 += 0.05) {
    const a = [a1, a2, a2 * 0.6]; H.finger(0, a, pts); const pad = toW(F, pts[7].p, new THREE.Vector3()); let pen = 0; for (const s of pts) pen += Math.max(0, R_FINGER * 0.8 - sdf(toW(F, s.p, _v), shapes));
    const c = pad.distanceTo(target) + pen * 6; if (c < bc) { bc = c; best = a; } }
  return { a: best.map((v) => +v.toFixed(3)), err: bc };
}
function ready(F, H, shapes) {
  let best = [0, 0, 0], bc = 1e9; const pts = [];
  for (let a1 = -0.45; a1 <= 0.3; a1 += 0.03) for (let a2 = -0.1; a2 <= 0.35; a2 += 0.05) {
    const a = [a1, a2, a2 * 0.5]; H.finger(0, a, pts); let pen = 0; for (const s of pts) pen += Math.max(0, R_FINGER * 0.9 - sdf(toW(F, s.p, _v), shapes));
    const c = pen * 40 + Math.abs(a1) * 0.02 + Math.abs(a2) * 0.01; if (c < bc) { bc = c; best = a; } }
  return best.map((v) => +v.toFixed(3));
}
function thumb(F, H, shapes, target) {
  let best = [0.5, 0, 0], bc = 1e9;
  const TR = [2.2, 1.6, 1.6]; // curl, opposition, swing search ranges (rad)
  for (let t = -0.6; t <= TR[0]; t += 0.1) for (let ox = -TR[1]; ox <= TR[1]; ox += 0.1) for (let oy = -TR[2]; oy <= TR[2]; oy += 0.15) {
    const r = H.thumb(t, ox, oy); let pen = 0; for (const p of r.pts) pen += Math.max(0, R_FINGER * 0.9 - sdf(toW(F, p, _v), shapes));
    const c = toW(F, r.tip, _v).distanceTo(target) + pen * 5 + (Math.abs(ox) + Math.abs(oy)) * 0.004; if (c < bc) { bc = c; best = [t, ox, oy]; } }
  return best.map((v) => +v.toFixed(3));
}
const pose = (f, th) => ({ f, th });

// ---------------------------------------------------------------- per weapon
function solve(bones, ud) {
  const hold = ud.hold; const G = hold.grip; const u = G.Y, fwd = G.Z, xw = G.X; const shapes = hold.shapes;
  // ---- firing (right) hand
  const HR = new Hand(bones, 'R'); const beta = hold.wrap ?? 0.36; // turn about the grip axis: backstrap into the web of the thumb
  const FR = frame(xw.clone().multiplyScalar(Math.cos(beta)).addScaledVector(fwd, Math.sin(beta)), u);
  const along = (y) => (y - G.c.y) / u.y; // grip-axis coordinate at a given height
  const idxAt = G.c.clone().addScaledVector(u, along(hold.trig.y - 0.003)).addScaledVector(fwd, G.h[2] - 0.017).addScaledVector(xw, -G.h[0] - 0.017);
  seat(FR, HR, HR.mcp, idxAt, [G]);
  const wrapShapes = [G, ...shapes.slice(1, 3)]; // fingers close on the grip (and stay under the trigger guard); the magazine sits ahead of them
  const gripPose = [1, 2, 3].map((fi) => close(FR, HR, fi, wrapShapes));
  const trig = trigger(FR, HR, shapes.filter((s) => s !== hold.trigBlade), hold.trig.clone().addScaledVector(fwd, 0.004));
  const rdy = ready(FR, HR, shapes);
  const thR = thumb(FR, HR, shapes, hold.thumbR);
  const thTip = toW(FR, HR.thumb(...thR).tip, new THREE.Vector3()); const tipsX = [1, 2, 3].map((fi) => { const pts = HR.finger(fi, gripPose[fi - 1]); return +toW(FR, pts[8].p, new THREE.Vector3()).x.toFixed(3); });
  const R = { q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(FR.X, FR.Y, FR.Z)), wrist: FR.T.clone(),
    ready: pose([rdy, ...gripPose], thR), trigger: pose([trig.a, ...gripPose], thR), pull: pose([[trig.a[0] + 0.12, trig.a[1] + 0.22, trig.a[2] + 0.14], ...gripPose], thR), trigErr: trig.err, thumbErr: thTip.distanceTo(hold.thumbR), tipsX };
  // ---- support (left) hand
  const HL = new Hand(bones, 'L'); let L;
  if (hold.fore) { // forend in the palm: palm under-left of the handguard facing up-right, fingers wrap up the right side
    const fo = hold.fore; const a = hold.foreAngle ?? 0.7; const n = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0); // palm → forend axis
    let FL = frame(n.clone().negate(), new THREE.Vector3(0, 0, 1)); const fs = [fo];
    const g = hold.foreTilt ?? 0.45; FL = frame(FL.X, FL.Z.clone().multiplyScalar(Math.cos(g)).addScaledVector(FL.Y, Math.sin(g))); // wrist angled back towards the forearm; fingers wrap the forend on a diagonal
    const at = fo.c.clone().addScaledVector(n, -(Math.min(fo.h[0], fo.h[1]) + 0.017)); seat(FL, HL, HL.mcpMid.clone().add(new THREE.Vector3(0, 0.012, 0)), at, fs);
    const f = [0, 1, 2, 3].map((fi) => close(FL, HL, fi, fs, [1.5, 1.7, 1.25]));
    const thT = fo.c.clone().addScaledVector(new THREE.Vector3(1, 0.35, 0).normalize(), fo.h[0] + 0.012).add(new THREE.Vector3(0, 0, 0.045)); const th = thumb(FL, HL, fs, thT);
    const thErrL = toW(FL, HL.thumb(...th).tip, new THREE.Vector3()).distanceTo(thT);
    L = { q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(FL.X, FL.Y, FL.Z)), wrist: FL.T.clone(), pose: pose(f, th), thumbErr: thErrL };
  } else { // pistol: support palm on the left panel, its fingers over the firing hand's fingers, thumb forward along the frame
    const bL = 0.15; const FL = frame(xw.clone().multiplyScalar(Math.cos(bL)).addScaledVector(fwd, Math.sin(bL)), u); const over = grown(G, 0.022, 0.012, 0, 0.02); const fs = [over, ...shapes.filter((s) => s !== G)];
    const at = G.c.clone().addScaledVector(u, along(hold.trig.y - 0.022)).addScaledVector(fwd, G.h[2] + 0.02).addScaledVector(xw, G.h[0] + 0.03);
    seat(FL, HL, HL.mcp, at, [over]);
    const f = [0, 1, 2, 3].map((fi) => close(FL, HL, fi, fs, [1.5, 1.7, 1.25]));
    const th = thumb(FL, HL, fs, hold.thumbL);
    L = { q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(FL.X, FL.Y, FL.Z)), wrist: FL.T.clone(), pose: pose(f, th) };
  }
  return { R, L };
}

// ---------------------------------------------------------------- hand-held objects (glass, bottle)
// Power grasp on an upright cylinder of radius r (grip frame: origin on the axis at the grip height, y up the axis). dirIn
// is the horizontal direction the palm faces (towards the axis). The knuckle line runs up the axis (index on top), the palm
// is slid in until its skin touches, every finger closes joint by joint onto the surface and the thumb wraps round the other
// way. Returns the hand bone's wrist position + orientation in the grip frame and the per-joint finger pose (HeroRig.hand).
export function solveWrap(bones, S, r, dirIn, opts = {}) {
  const sx = S === 'L' ? 1 : -1; const n = dirIn.clone().setY(0).normalize(); const up = new THREE.Vector3(0, 1, 0);
  const shapes = [{ cyl: true, c: new THREE.Vector3(0, opts.cy ?? 0, 0), r, hy: opts.hy ?? 0.1 }];
  const Y = up.clone().cross(n.clone().multiplyScalar(-sx)); // frame(): Y = Z × X
  const thT = Y.multiplyScalar(0.75).addScaledVector(n, 0.66).normalize().multiplyScalar(r + R_FINGER).add(new THREE.Vector3(0, 0.012, 0));
  return solveGrip(bones, S, { X: n.clone().multiplyScalar(-sx), Z: up, shapes, at: n.clone().multiplyScalar(-(r + 0.03)), palm: [0, -0.04, 0.004 + (opts.dz ?? 0)], thumbAt: thT });
}
// General grasp: hand frame X / Z (the hand bone's axes in the object frame: X = palm normal for the right hand, −palm normal
// for the left; Z = knuckle line, index side), palm point `palm` (hand frame, x filled in) put at `at` and slid in until
// the palm skin touches the shapes (rounded boxes / cylinders), fingers closed onto them, thumb searched towards thumbAt.
export function solveGrip(bones, S, o) {
  const H = new Hand(bones, S); const F = frame(o.X, o.Z); const shapes = o.shapes;
  seat(F, H, new THREE.Vector3(-H.sx * PALM_X, o.palm[1], o.palm[2]), o.at, shapes);
  const f = [0, 1, 2, 3].map((fi) => close(F, H, fi, o.closeShapes || shapes, o.lim || [1.5, 1.75, 1.3]));
  const th = thumb(F, H, shapes, o.thumbAt);
  return { wrist: F.T.clone(), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(F.X, F.Y, F.Z)), pose: pose(f, th) };
}
// cached per character: key = any object or string (one solve per hero per prop / door type)
const gripCache = new WeakMap();
export function gripFor(ch, key, S, solveFn) {
  if (!ch || !ch.bones || !ch.bones['idx1' + S] || !ch.bones['thb1' + S]) return null; let m = gripCache.get(ch); if (!m) gripCache.set(ch, (m = new Map()));
  const k = typeof key === 'string' ? key + S : key; let byS = m.get(k); if (!byS) m.set(k, (byS = {})); return byS[S] || (byS[S] = solveFn(ch.bones, S));
}
export function wrapFor(ch, key, S, r, dirIn, opts) { return gripFor(ch, 'wrap:' + key, S, (bones) => solveWrap(bones, S, r, dirIn, opts)); }

const cache = new WeakMap();
// hold for this character + weapon model (null if the model has no hold data or the rig no finger bones)
export function holdFor(ch, model) {
  const ud = model.userData; if (!ud.hold || !ch || !ch.bones || !ch.bones.idx1R || !ch.bones.thb1L) return null;
  let m = cache.get(ch); if (!m) cache.set(ch, (m = new Map())); let h = m.get(model); if (!h) m.set(model, (h = solve(ch.bones, ud))); return h;
}
export const _test = { Hand, sdBox, solve };
