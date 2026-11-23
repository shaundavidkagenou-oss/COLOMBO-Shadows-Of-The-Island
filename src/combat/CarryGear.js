// Carry gear (82nd): what the player's stowed weapons ride in — a real belt holster for the pistol and a two-point sling for
// the long gun, fitted to each character's own body. This is the existing holster system (Weapons.holsterP / holsterR), not a
// second one: those two groups are still where the stowed models sit (and where the pistol draw starts); this module decides
// WHERE they sit on this particular body, builds the gear around them and keeps it all believable while the body moves.
//
//  • Categories — pistol | compact (carbines) | standard (assault / battle rifles) | large (sniper / precision rifles). The
//    gear is sized from the weapon's own measured shape (weaponProfile: the model's surface sampled along the barrel axis),
//    so a PM gets a small holster and an M1911 a long one, an AKS-74U rides muzzle-down high on the back, an M4 diagonally
//    muzzle-up and an M107 steep and higher, standing further off the back.
//  • Holster — moulded open-top OWB holster: double-walled shell around the pistol's slide / frame / trigger guard (grip left
//    clear for the hand), rolled mouth edge, open muzzle end, stitched welt and mouth band (leather) or riveted flange and
//    tension screw (kydex), a back panel with the sweat guard, thumb-break retention strap with a snap (closed while the
//    pistol is seated, open while it is drawn) and two belt-loop straps that go up under the shirt / waistcoat hem and fold
//    over the belt with snaps. Placed per body: bind-pose vertices around the hip give the surface the back panel rests on
//    (no penetration, 4 mm clearance), the waistband height and the hem of whatever is worn over it (the grip stays below
//    the hem; the holster hangs from its belt loops, "drop offset"). While the leg moves, the thigh's own vertices (tracked
//    in the thigh bone's frame) push the holster's lower end out about its belt loops — no physics, a few dot products.
//  • Sling — the rifle lies on the back on its flat side, tilted to rest on both the shoulder blade and the lower back
//    (searched against the body's back surface), hung from QD swivels with D-rings that turn with the strap; the strap goes
//    from the upper swivel over the right shoulder, across the chest to the left hip and round to the lower swivel. The strap
//    is a skinned mesh on the character's own skeleton (dual-quaternion skinning like the body), its path found on the bind
//    pose (a sash plane cut through the torso, pulled taut over hollows) and its weights taken from the nearest body
//    vertices; the rifle itself follows the chest at the top and the hips at the bottom (two anchors), so bending forward,
//    crouching or twisting never pushes the lower back through it; the strap ends ride in tri-glide buckles on short tails.
//  • State — one pistol in the holster and one long gun on the sling (the selected / last used one of each class that is
//    owned). Drawn → it leaves the gear (the holster stays, empty; the sling goes with the rifle); put away → it comes back.
//    Nothing shows for a weapon no longer owned; the long gun is put away while seated in a car (it would go through the
//    seat back) and comes back on getting out.
//  • Cost — gear meshes are built once per weapon / body and cached (shared materials, procedural surfaces from
//    WeaponSurface.js: leather / kydex / webbing / thread, no textures); the per-frame work is a handful of matrix products
//    with preallocated temporaries, no allocation.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { weaponSurface } from './WeaponSurface.js';
import { SlingPath, RING_NB, pathMaterial, pathDepthMaterial } from './SlingStrap.js';
import { PISTOL_ENVELOPE, PISTOL_SEATS } from './holsterEnvelope.js';
import { WEAPONS } from './WeaponDefs.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const UP = V(0, 1, 0);
const CLOTH_OVER = new Set([1, 3, 5, 6, 7]); // shirt, sleeve, vest, tie, coat: worn OVER the belt (HeroBody CLOTH ids)

// ---------------------------------------------------------------------------------------------------- categories
export function carryCategory(def) {
  if (!def) return null; if (def.cls === 'pistol') return 'pistol'; if (def.type === 'carbine') return 'compact';
  if (def.cls === 'sniper' || def.type === 'bolt' || def.type === 'semi' || def.type === 'precision') return 'large'; return 'standard';
}
// long-gun carry per category (chest-bone space; tilt = angle of the barrel from vertical, cy = rifle centre height)
export const LONG_FIT = {
  compact: { up: false, tilt: 0.66, cy: -0.05, margin: 0.012, pad: false }, // muzzle down, stock high behind the right shoulder
  standard: { up: true, tilt: 0.5, cy: -0.06, margin: 0.013, pad: false }, // diagonal, muzzle up behind the right shoulder
  large: { up: true, tilt: 0.34, cy: 0.06, margin: 0.017, pad: true }, // steep and higher, scope / bolt clear of the back
};
// per character: holster build (leather / kydex) and colours; anyone else gets the first
const STYLES = {
  dineth: { holster: 'leather', leather: '#5b3a22', thread: '#cdb48c', hw: 'brass', sling: 'webbing', strap: '#4f4c33', strapThread: '#5c5a40' },
  shashika: { holster: 'kydex', leather: '#16171a', thread: '#2a2b2a', hw: 'oxide', hanger: 'webbing', hangerCol: '#1d1e1b', sling: 'webbing', strap: '#1c1d1a', strapThread: '#262724' },
  david: { holster: 'leather', leather: '#221b17', thread: '#40362c', hw: 'steel', sling: 'leather', strap: '#3d2617', strapThread: '#bfa47a' },
};
const styleOf = (ch) => STYLES[ch && ch.squadId] || STYLES.dineth;

// ---------------------------------------------------------------------------------------------------- weapon profile
// The model's surface sampled along +z (triangles subdivided to ≤ 4 mm, so long flat faces count, not only their corners):
// per 5 mm bin the y / x extent, in weapon space (origin = grip, +z = muzzle). Cached on the model.
export function weaponProfile(m) {
  const ud = m.userData; if (ud.carryProf) return ud.carryProf;
  const bin = 0.005; m.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(m.matrixWorld).invert(); const M = new THREE.Matrix4();
  const a = V(), b = V(), c = V(), p = V(); const map = new Map();
  const add = (q) => { const k = Math.floor(q.z / bin); let e = map.get(k); if (!e) map.set(k, (e = [Infinity, -Infinity, Infinity, -Infinity])); if (q.y < e[0]) e[0] = q.y; if (q.y > e[1]) e[1] = q.y; if (q.x < e[2]) e[2] = q.x; if (q.x > e[3]) e[3] = q.x; };
  m.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return; for (let q = o; q && q !== m; q = q.parent) if (!q.visible) return;
    const mt = o.material; if (!mt || Array.isArray(mt) || mt.transparent || mt.isMeshBasicMaterial) return;
    M.multiplyMatrices(inv, o.matrixWorld); const P = o.geometry.attributes.position, I = o.geometry.index; const nt = Math.floor((I ? I.count : P.count) / 3);
    for (let t = 0; t < nt; t++) {
      a.fromBufferAttribute(P, I ? I.getX(3 * t) : 3 * t).applyMatrix4(M); b.fromBufferAttribute(P, I ? I.getX(3 * t + 1) : 3 * t + 1).applyMatrix4(M); c.fromBufferAttribute(P, I ? I.getX(3 * t + 2) : 3 * t + 2).applyMatrix4(M);
      const L = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)); const n = Math.min(48, Math.ceil(L / 0.004));
      if (n <= 1) { add(a); add(b); add(c); continue; }
      for (let u = 0; u <= n; u++) for (let w = 0; w <= n - u; w++) { const k1 = u / n, k2 = w / n; add(p.copy(a).multiplyScalar(1 - k1 - k2).addScaledVector(b, k1).addScaledVector(c, k2)); }
    }
  });
  const keys = [...map.keys()].sort((x, y) => x - y); if (!keys.length) return null; const k0 = keys[0], n = keys[keys.length - 1] - k0 + 1;
  const y0 = new Float32Array(n), y1 = new Float32Array(n), x0 = new Float32Array(n), x1 = new Float32Array(n); let last = map.get(k0);
  for (let i = 0; i < n; i++) { const e = map.get(k0 + i) || last; last = e; y0[i] = e[0]; y1[i] = e[1]; x0[i] = e[2]; x1[i] = e[3]; }
  return (ud.carryProf = { z0: k0 * bin, bin, n, y0, y1, x0, x1, zMin: k0 * bin, zMax: (k0 + n) * bin });
}
const pIdx = (pr, z) => clamp(Math.floor((z - pr.z0) / pr.bin), 0, pr.n - 1);
function pWin(pr, arr, z, half, mode) { const i0 = pIdx(pr, z - half), i1 = pIdx(pr, z + half); let r = mode > 0 ? -Infinity : Infinity; for (let i = i0; i <= i1; i++) r = mode > 0 ? Math.max(r, arr[i]) : Math.min(r, arr[i]); return r; }
// a smooth station table along z: f(z) sampled every `step`, box-smoothed over ±sm
function smoothTable(z0, z1, step, f, sm) {
  const n = Math.max(2, Math.ceil((z1 - z0) / step) + 1), raw = new Float32Array(n), out = new Float32Array(n); for (let i = 0; i < n; i++) raw[i] = f(z0 + ((z1 - z0) * i) / (n - 1));
  const h = Math.max(0, Math.round(sm / ((z1 - z0) / (n - 1)))); for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = i - h; j <= i + h; j++) { s += raw[clamp(j, 0, n - 1)]; c++; } out[i] = s / c; }
  return (z) => { const f2 = clamp(((z - z0) / (z1 - z0)) * (n - 1), 0, n - 1); const i = Math.min(n - 2, Math.floor(f2)); const t = f2 - i; return out[i] + (out[i + 1] - out[i]) * t; };
}

// ---------------------------------------------------------------------------------------------------- geometry kit
// Part: indexed triangles with position / uv / colour (vertex colour multiplies the material colour: stitches are lighter
// thread on the same leather draw call, burnished edges darker); normals computed per part (hard edges between parts).
class Part {
  constructor() { this.p = []; this.uv = []; this.c = []; this.i = []; }
  v(x, y, z, u, w, s) { this.p.push(x, y, z); this.uv.push(u, w); if (typeof s === 'number') this.c.push(s, s, s); else this.c.push(s[0], s[1], s[2]); return this.p.length / 3 - 1; }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i); g.computeVertexNormals(); return g; }
}
function flipIndex(g) { const I = g.index.array; for (let j = 0; j < I.length; j += 3) { const t = I[j + 1]; I[j + 1] = I[j + 2]; I[j + 2] = t; } g.index.needsUpdate = true; g.computeVertexNormals(); }
// loft: rings (arrays of Vector3, equal length); closed = each ring wraps. ref(i, k, p) → the direction the surface should face
// there (used once to pick the winding). uvA(i, k, along) → [u, v] (default: u = metres along, v = metres around).
function loft(rings, o = {}) {
  const closed = o.closed !== false, N = rings.length, K = rings[0].length, KK = closed ? K + 1 : K; const P = new Part(); const shade = o.shade || (() => 1);
  const cen = rings.map((r) => r.reduce((s, q) => s.add(q), V()).multiplyScalar(1 / r.length)); let along = 0;
  for (let i = 0; i < N; i++) {
    if (i) along += cen[i].distanceTo(cen[i - 1]); let around = 0;
    for (let k = 0; k < KK; k++) { const q = rings[i][k % K]; if (k) around += q.distanceTo(rings[i][(k - 1) % K]); const uv = o.uvA ? o.uvA(i, k % K, along) : [along, around]; P.v(q.x, q.y, q.z, uv[0], uv[1], shade(i, k % K)); }
  }
  for (let i = 0; i < N - 1; i++) for (let k = 0; k < KK - 1; k++) { const a = i * KK + k, b = a + 1, c = a + KK, d = c + 1; P.i.push(a, b, c, b, d, c); }
  const g = P.geo(); const ref = o.ref || ((i, k, p) => _t0.copy(p).sub(cen[i]));
  let s = 0; const nA = g.attributes.normal, pA = g.attributes.position; const p = V(), nn = V();
  for (let i = 0; i < N; i++) for (let k = 0; k < KK; k += Math.max(1, (KK / 6) | 0)) { const j = i * KK + k; p.fromBufferAttribute(pA, j); nn.fromBufferAttribute(nA, j); s += nn.dot(ref(i, k % K, p)); }
  if (s < 0) flipIndex(g);
  if (closed) for (let i = 0; i < N; i++) { const a = i * KK, b = a + K; nn.fromBufferAttribute(nA, a).add(p.fromBufferAttribute(nA, b)).normalize(); nA.setXYZ(a, nn.x, nn.y, nn.z); nA.setXYZ(b, nn.x, nn.y, nn.z); }
  const parts = [g];
  for (const [ri, want] of o.caps || []) { // flat caps with their own vertices: [ringIndex, outward direction]
    const r = rings[ri], c = cen[ri], C = new Part(); C.v(c.x, c.y, c.z, 0, 0, o.capShade ?? shade(ri, 0)); for (const q of r) C.v(q.x, q.y, q.z, q.x - c.x, q.y - c.y, o.capShade ?? shade(ri, 0));
    for (let k = 0; k < K; k++) C.i.push(0, 1 + k, 1 + ((k + 1) % K)); const cg = C.geo(); nn.fromBufferAttribute(cg.attributes.normal, 1); if (nn.dot(want) < 0) flipIndex(cg); parts.push(cg);
  }
  return parts;
}
const _t0 = V();
// ribbon (strap): centre points, outward normals and width directions per point; rounded-rectangle section w × th.
// uv: u = metres along, v = −1…1 across (the webbing pattern and its bound edges).
function ribbon(pts, nrm, wid, w, th, o = {}) {
  const c = Math.min(th * 0.45, 0.0012), hw = w / 2, ht = th / 2; const sec = [[-hw, -ht + c], [-hw, ht - c], [-hw + c, ht], [hw - c, ht], [hw, ht - c], [hw, -ht + c], [hw - c, -ht], [-hw + c, -ht]];
  const rings = pts.map((p, i) => { const W = wid[i], N = nrm[i]; const sc = o.scaleW ? o.scaleW(i) : 1; return sec.map(([a, b]) => p.clone().addScaledVector(W, a * sc).addScaledVector(N, b)); });
  const ends = []; if (o.caps !== false) { const d0 = pts[0].clone().sub(pts[1]).normalize(), d1 = pts[pts.length - 1].clone().sub(pts[pts.length - 2]).normalize(); ends.push([0, d0], [pts.length - 1, d1]); }
  return loft(rings, { ref: (i, k, p) => _t0.copy(p).sub(pts[i]), uvA: (i, k, along) => [along + (o.u0 || 0), clamp(sec[k][0] / hw, -1, 1)], caps: ends, shade: o.shade });
}
// stitches along a polyline lying on a surface (pts + outward normals): short raised beads at `pitch`, slanted like saddle
// stitching. col = vertex colour (thread over the material colour).
function stitchRow(pts, nrms, col, o = {}) {
  const pitch = o.pitch || 0.0042, len = o.len || 0.0029, w = o.w || 0.00095, h = o.h || 0.00055, slant = o.slant ?? 0.32; const P = new Part();
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1])); const L = cum[cum.length - 1]; if (L < pitch) return [];
  const at = (s, out, nOut) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const t = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]); out.lerpVectors(pts[i - 1], pts[i], t); nOut.lerpVectors(nrms[i - 1], nrms[i], t).normalize(); return i; };
  const c = V(), n = V(), t = V(), b = V(), d = V(), e = V(), q = V(); const KS = [-0.5, -0.3, 0, 0.3, 0.5], SC = [0.12, 0.85, 1, 0.85, 0.12], SEC = [[-0.5, -0.25], [-0.3, 0.75], [0.3, 0.75], [0.5, -0.25]];
  const nS = Math.floor((L - (o.inset || 0.002) * 2) / pitch);
  for (let k = 0; k <= nS; k++) {
    const s = (o.inset || 0.002) + k * pitch; const i = at(s, c, n); t.subVectors(pts[i], pts[i - 1]).normalize(); b.crossVectors(n, t).normalize(); d.copy(t).multiplyScalar(Math.cos(slant)).addScaledVector(b, Math.sin(slant)); e.crossVectors(n, d).normalize();
    const base = P.p.length / 3;
    for (let r = 0; r < KS.length; r++) for (const [sx, sy] of SEC) { q.copy(c).addScaledVector(d, KS[r] * len).addScaledVector(e, sx * w * SC[r]).addScaledVector(n, sy * h * SC[r]); P.v(q.x, q.y, q.z, KS[r] * len, sx, col); }
    for (let r = 0; r < KS.length - 1; r++) for (let j = 0; j < 3; j++) { const a = base + r * 4 + j, bb = a + 1, cc = a + 4, dd = cc + 1; P.i.push(a, cc, bb, bb, cc, dd); }
  }
  if (!P.i.length) return []; const g = P.geo(); // one bead checked: its crown normal must agree with the surface normal
  const nn = V().fromBufferAttribute(g.attributes.normal, 9); at(o.inset || 0.002, c, n); if (nn.dot(n) < 0) flipIndex(g); return [g];
}
// turned hardware: profile [[r, h], …] revolved round `axis` at `origin`
function lathe(profile, origin, axis, seg = 14, col = 1) {
  const g = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(Math.max(1e-5, r), h)), seg); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, axis.clone().normalize())); g.translate(origin.x, origin.y, origin.z);
  const n = g.attributes.position.count, cc = new Float32Array(n * 3).fill(col); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); return g;
}
// a round-section loop (D-ring, buckle frame): closed path points, wire radius r
function wireLoop(path, r, seg = 8) {
  const N = path.length; const rings = []; const pn = V();
  for (let i = 0; i <= N; i++) { const p = path[i % N], t = path[(i + 1) % N].clone().sub(path[(i - 1 + N) % N]).normalize(); const a = Math.abs(t.y) < 0.9 ? UP : V(1, 0, 0); const u = V().crossVectors(t, a).normalize(), w = V().crossVectors(t, u);
    rings.push(Array.from({ length: seg }, (_, k) => { const th = (k / seg) * Math.PI * 2; return p.clone().addScaledVector(u, Math.cos(th) * r).addScaledVector(w, Math.sin(th) * r); })); void pn; }
  return loft(rings, { ref: (i, k, p) => _t0.copy(p).sub(path[i % N]) });
}
function prep(g) { // common attribute set, non-indexed (Extrude / Lathe / Part merge)
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  if (!g.attributes.normal) g.computeVertexNormals(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}
function merge(list) { const gs = list.flat().filter(Boolean).map(prep); if (!gs.length) return null; const g = mergeGeometries(gs, false); for (const x of gs) x.dispose(); g.computeBoundingSphere(); return g; }

// ---------------------------------------------------------------------------------------------------- materials (shared)
const MAT = new Map();
function gearMat(kind, color, rough, metal = 0) {
  const key = kind + color + rough + metal; let m = MAT.get(key); if (m) return m;
  m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, vertexColors: true }); weaponSurface(m, kind);
  m.name = 'carryGear:' + kind; MAT.set(key, m); return m;
}
const HW = { brass: ['brass', '#8f7442', 0.38, 0.9], steel: ['steel', '#9a9ea4', 0.3, 0.92], oxide: ['blued', '#1b1c1f', 0.42, 0.75] };
const hwMat = (k) => { const h = HW[k] || HW.steel; return gearMat(h[0], h[1], h[2], h[3]); };
const ratio = (a, b) => { const A = new THREE.Color(a), B = new THREE.Color(b); return [A.r / Math.max(0.02, B.r), A.g / Math.max(0.02, B.g), A.b / Math.max(0.02, B.b)]; };

// ---------------------------------------------------------------------------------------------------- body data (bind pose)
// Bind-pose vertices of the character's skinned body (+ which bones they follow), cached on the character.
export function bodyData(ch) {
  if (!ch || !ch.mesh) return null; if (ch._carryBody !== undefined) return ch._carryBody;
  const mesh = ch.mesh, G = mesh.geometry, sk = mesh.skeleton; if (!G || !sk || !G.attributes.skinIndex || !G.attributes.position) return (ch._carryBody = null);
  const names = sk.bones.map((b) => b.name); const bi = (n) => names.indexOf(n); const _m = new THREE.Matrix4();
  const bind = (n) => { const i = bi(n); return i < 0 ? null : V().setFromMatrixPosition(_m.copy(sk.boneInverses[i]).invert()); };
  const need = ['hips', 'spine', 'chest', 'thighR', 'shR']; if (need.some((n) => bi(n) < 0)) return (ch._carryBody = null);
  const P = G.attributes.position, C = G.attributes.aCloth, SI = G.attributes.skinIndex, SW = G.attributes.skinWeight; const n = P.count;
  const arm = new Uint8Array(names.length); names.forEach((nm, i) => { if (/^(arm|fore|hand|idx|mid|rng|pnk|thb)/.test(nm)) arm[i] = 1; });
  const pos = new Float32Array(n * 3), cloth = new Uint8Array(n), armW = new Float32Array(n), thighW = new Float32Array(n); const iTh = bi('thighR');
  for (let i = 0; i < n; i++) { pos[3 * i] = P.getX(i); pos[3 * i + 1] = P.getY(i); pos[3 * i + 2] = P.getZ(i); cloth[i] = C ? Math.round(C.getX(i)) : 0; let aw = 0, tw = 0;
    for (let k = 0; k < 4; k++) { const b = SI.getComponent(i, k), w = SW.getComponent(i, k); if (arm[b]) aw += w; if (b === iTh) tw += w; } armW[i] = aw; thighW[i] = tw; }
  return (ch._carryBody = { names, bi, n, pos, cloth, armW, thighW, SI, SW, hips: bind('hips'), spine: bind('spine'), chest: bind('chest'), thighR: bind('thighR'), shR: bind('shR'), neck: bind('neck') });
}
// max-height map over a 2D grid (u, v) → h; get() takes the max over the 3 × 3 neighbourhood (no gaps between vertices)
class HMap {
  constructor(u0, u1, v0, v1, cell) { this.u0 = u0; this.v0 = v0; this.cell = cell; this.nu = Math.ceil((u1 - u0) / cell); this.nv = Math.ceil((v1 - v0) / cell); this.a = new Float32Array(this.nu * this.nv).fill(-Infinity); }
  add(u, v, h) { const i = Math.floor((u - this.u0) / this.cell), j = Math.floor((v - this.v0) / this.cell); if (i < 0 || j < 0 || i >= this.nu || j >= this.nv) return; const k = j * this.nu + i; if (h > this.a[k]) this.a[k] = h; }
  get(u, v) { const i = Math.floor((u - this.u0) / this.cell), j = Math.floor((v - this.v0) / this.cell); let r = -Infinity; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= this.nu || jj >= this.nv) continue; const x = this.a[jj * this.nu + ii]; if (x > r) r = x; } return r; }
}

// ---------------------------------------------------------------------------------------------------- holster
const SLIDE_N = 16; // sling transition: clearance samples over the half turn
const HOLSTER_ANGLE = 2.05; // round the hips from the front towards the right side: just behind the hip bone ("4 o'clock")
const CANT = 0.14; // muzzle raked slightly to the rear (FBI cant): the grip leans forward into the hand
// build the holster around one pistol (pistol space: the pistol sits at identity inside it)
function buildHolster(pr, ud, st) {
  const kydex = st.holster === 'kydex', t = kydex ? 0.0024 : 0.0034, clr = kydex ? 0.0012 : 0.002, ex = kydex ? 4.6 : 3.1;
  const zTip = Math.min(pr.zMax, ud.muzzle ? ud.muzzle.z + 0.002 : pr.zMax) + 0.004, zA = -0.006, ext = 0.024; // mouth: just ahead of the grip; the slide side rises 24 mm higher
  const zRef = 0.004; // frame / slide just ahead of the grip — what the shell copies where it rises past the grip
  const zz = (z) => Math.max(z, zRef);
  const gripHW = pWin(pr, pr.x1, -0.03, 0.03, 1); // grip panels (widest part of the frame behind the mouth)
  const Y0 = smoothTable(zA - ext, zTip, 0.003, (z) => pWin(pr, pr.y0, zz(z), 0.007, -1), 0.007);
  const Y1 = smoothTable(zA - ext, zTip, 0.003, (z) => pWin(pr, pr.y1, zz(z), 0.007, 1), 0.006);
  const HX = smoothTable(zA - ext, zTip, 0.003, (z) => Math.max(pWin(pr, pr.x1, zz(z), 0.012, 1), -pWin(pr, pr.x0, zz(z), 0.012, -1)), 0.01);
  const plateX = Math.max(gripHW + 0.0016, HX(0.02) + clr + t); // back panel: clear of the grip panels
  const A = (z) => Math.max(HX(z) + clr, plateX - t - 0.0004) * (1 - 0.08 * sstep(zTip - 0.016, zTip, z)), B = (z) => (Y1(z) - Y0(z)) / 2 + clr, CY = (z) => (Y0(z) + Y1(z)) / 2;
  const K = kydex ? 36 : 32, NS = Math.max(12, Math.ceil((zTip - zA) / 0.005)); const TH = Array.from({ length: K }, (_, k) => (k / K) * Math.PI * 2 - Math.PI / 2); // starts at the bottom (trigger-guard side)
  const zm = (th) => zA - ext * sstep(0.05, 0.95, Math.sin(th)); // mouth line per angle
  const S = (th, z, off) => { const c = Math.cos(th), s = Math.sin(th), e = 2 / ex; return V((A(z) + off) * Math.sign(c) * Math.pow(Math.abs(c), e), CY(z) + (B(z) + off) * Math.sign(s) * Math.pow(Math.abs(s), e), z); };
  const ring = (u, off, dz = 0) => TH.map((th) => { const z = zm(th) + (zTip - zm(th)) * u; return S(th, z + dz, off); });
  const leather = [], hw = []; const thr = ratio(st.thread, st.leather); const edge = 0.68, inside = 0.5;
  const outer = [], inner = []; for (let i = 0; i <= NS; i++) { const u = i / NS; outer.push(ring(u, t)); inner.push(ring(u, 0)); }
  leather.push(loft(outer, { shade: (i) => (i === 0 || i === NS ? edge : 1) * (0.94 + 0.06 * Math.sin(i * 0.7)) }));
  leather.push(loft(inner, { ref: (i, k, p) => _t0.copy(p).sub(V(0, CY(p.z), p.z)).negate(), shade: () => inside }));
  // rolled mouth / muzzle edges
  leather.push(loft([ring(0, t), ring(0, t * 0.5, -t * 0.55), ring(0, 0)], { ref: () => V(0, 0, -1), shade: () => edge }));
  leather.push(loft([ring(1, 0), ring(1, t * 0.5, t * 0.55), ring(1, t)], { ref: () => V(0, 0, 1), shade: () => edge }));
  const stitchAround = (u0, off, skipBottom) => { // a stitch row round the shell at fraction u0
    const pts = [], ns = []; for (let k = 0; k <= 64; k++) { const th = -Math.PI / 2 + (k / 64) * Math.PI * 2; if (skipBottom && Math.abs(Math.sin(th) + 1) < 0.06) continue; const z = zm(th) + (zTip - zm(th)) * u0; const p = S(th, z, off); const q = S(th + 0.01, z, off); const tng = q.sub(p); pts.push(p); ns.push(V(p.x, p.y - CY(z), 0).normalize()); void tng; }
    return [pts, ns]; };
  if (!kydex) {
    // mouth band: a second layer of leather round the mouth (stiffens it), stitched through
    const bandU = 0.016 / (zTip - zA); const t2 = t + 0.0022;
    leather.push(loft([ring(-0.004 / (zTip - zA), t), ring(0.0008 / (zTip - zA), t2), ring(bandU - 0.001 / (zTip - zA), t2), ring(bandU, t)], { shade: (i) => (i === 1 ? edge : 0.97) }));
    const [bp, bn] = stitchAround(bandU * 0.5, t2 + 0.0002, true); for (let s0 = 0, i = 1; i <= bp.length; i++) if (i === bp.length || bp[i].distanceTo(bp[i - 1]) > 0.01) { leather.push(stitchRow(bp.slice(s0, i), bn.slice(s0, i), thr)); s0 = i; }
  }
  // welt / flange along the trigger-guard side (the two edges of the sheet joined): stitched (leather) or riveted (kydex)
  const wf = kydex ? 0.0105 : 0.0115, tf = t; const fz0 = zA + 0.002, fz1 = zTip - 0.002, nF = Math.ceil((fz1 - fz0) / 0.004);
  const fl = []; const yb = (z) => CY(z) - B(z) - t; const wfz = (z) => wf * (0.3 + 0.7 * sstep(fz0, fz0 + 0.012, z) * (1 - 0.55 * sstep(fz1 - 0.01, fz1, z)));
  for (let i = 0; i <= nF; i++) { const z = fz0 + ((fz1 - fz0) * i) / nF, y1 = yb(z) + t * 1.2, y0 = yb(z) - wfz(z), r = tf * 0.8; fl.push([V(-tf, y1, z), V(-tf, y0 + r, z), V(-tf * 0.5, y0, z), V(tf * 0.5, y0, z), V(tf, y0 + r, z), V(tf, y1, z)]); }
  leather.push(loft(fl, { ref: (i, k, p) => _t0.set(p.x, p.y - yb(p.z) + 0.004, 0), caps: [[0, V(0, 0, -1)], [fl.length - 1, V(0, 0, 1)]], shade: (i, k) => (k === 2 || k === 3 ? edge : 0.96), capShade: edge }));
  if (!kydex) for (const sx of [-1, 1]) { const pts = [], ns = []; for (let i = 2; i <= nF - 1; i++) { const z = fz0 + ((fz1 - fz0) * i) / nF; pts.push(V(sx * (tf + 0.00015), yb(z) - wfz(z) * 0.5, z)); ns.push(V(sx, 0, 0)); } leather.push(stitchRow(pts, ns, thr, { slant: 0.35 * sx })); }
  else { // tubular rivets through the flange, both faces, and the tension screw at the trigger guard
    for (let z = fz0 + 0.008; z < fz1 - 0.004; z += 0.021) for (const sx of [-1, 1]) hw.push(lathe([[0, 0.0014], [0.0017, 0.0012], [0.0027, 0.0005], [0.0029, 0], [0.0025, -0.0005]], V(sx * tf, yb(z) - wf * 0.5, z), V(sx, 0, 0)));
    const zs = clamp(0.03, fz0 + 0.01, fz1 - 0.01); for (const sx of [-1, 1]) { hw.push(lathe([[0, 0.0026], [0.0024, 0.0024], [0.0038, 0.0012], [0.004, 0], [0.0036, -0.0004]], V(sx * (tf + 0.0012), yb(zs) - wf * 0.45, zs), V(sx, 0, 0), 16)); leather.push(lathe([[0.0024, 0.0012], [0.0046, 0.0012], [0.0048, 0], [0.0024, 0]], V(sx * tf, yb(zs) - wf * 0.45, zs), V(sx, 0, 0), 16, 0.45)); } // screw over a rubber washer
  }
  // back panel (against the body): main panel behind the shell + sweat guard rising behind the slide; rounded, edges burnished
  const yLo = Math.min(yb(zA + 0.02), yb(zA + 0.06)) - wf * 0.55, yHi = CY(zA) + B(zA) + t + 0.02, zP1 = zA + 0.072, zP0 = zA - ext - 0.004, ySg = CY(zA) + 0.004;
  const sh = new THREE.Shape(); const R = 0.008; const P2 = [[yLo, zA - 0.002], [yLo, zP1], [yHi, zP1], [yHi, zP0], [ySg, zP0], [ySg - 0.004, zA - 0.006]];
  { // rounded polygon in (y, z)
    const pts = P2.map(([a, b]) => new THREE.Vector2(a, b)); const n = pts.length;
    for (let i = 0; i < n; i++) { const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n]; const d0 = p0.clone().sub(p1), d2 = p2.clone().sub(p1); const r = Math.min(R, d0.length() * 0.45, d2.length() * 0.45); const a = p1.clone().addScaledVector(d0.normalize(), r), b = p1.clone().addScaledVector(d2.normalize(), r);
      if (i === 0) sh.moveTo(a.x, a.y); else sh.lineTo(a.x, a.y); sh.quadraticCurveTo(p1.x, p1.y, b.x, b.y); }
    sh.closePath(); }
  const tp = kydex ? 0.0028 : t * 1.05; const pg = new THREE.ExtrudeGeometry(sh, { depth: tp, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0007, bevelSegments: 1, curveSegments: 5 });
  pg.applyMatrix4(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(0, 0, 1), V(1, 0, 0))); pg.translate(plateX, 0, 0);
  { const n = pg.attributes.position.count, cc = new Float32Array(n * 3).fill(0.96); const gr = pg.groups; if (gr && gr.length > 1) for (let j = gr[1].start; j < gr[1].start + gr[1].count; j++) { cc[3 * j] = cc[3 * j + 1] = cc[3 * j + 2] = edge; } pg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); pg.clearGroups(); }
  leather.push(pg);
  if (!kydex) { // stitching round the panel (outer face)
    const sp = sh.getSpacedPoints(90).map((q) => q.clone()); const cx = (yLo + yHi) / 2, cz = (zP0 + zP1) / 2; const pts = [], ns = []; for (const q of sp) { const d = V(0, cx - q.x, cz - q.y).normalize().multiplyScalar(0.0042); pts.push(V(plateX - 0.00025, q.x + d.y, q.y + d.z)); ns.push(V(-1, 0, 0)); }
    leather.push(stitchRow(pts, ns, thr)); } else { for (const [yy, z] of [[yLo + 0.007, zP1 - 0.008], [yHi - 0.007, zP1 - 0.008], [yHi - 0.007, zP0 + 0.008]]) hw.push(lathe([[0, 0.0022], [0.0025, 0.002], [0.0042, 0.001], [0.0044, 0], [0.004, -0.0004]], V(plateX - 0.0002, yy, z), V(-1, 0, 0), 16)); }
  // thumb-break strap (leather): over the back of the slide, snapped on the outer side; open = hanging forward off the panel
  let strapC = null, strapO = null; const grp = new THREE.Group(); grp.name = 'holster';
  if (!kydex) {
    const zs = zA - ext * 0.62, ycs = (Y0(zs) + Y1(zs)) / 2 + 0.006, a = HX(zs) + clr + t + 0.0024, b = Y1(zs) - ycs + clr + t + 0.003, sw = 0.016, stT = t * 0.95;
    const pc = [V(plateX - stT / 2 - 0.0004, ycs - 0.006, zs)]; for (let k = 0; k <= 16; k++) { const al = -0.1 + (k / 16) * (Math.PI + 0.35); const c = Math.cos(al), s = Math.sin(al); pc.push(V(a * Math.sign(c) * Math.pow(Math.abs(c), 0.7), ycs + b * Math.sign(s) * Math.pow(Math.abs(s), 0.7), zs)); }
    const last = pc[pc.length - 1]; pc.push(last.clone().add(V(-0.0005, -0.007, 0.001)), last.clone().add(V(-0.002, -0.017, 0.002))); // the thumb tab past the snap
    const nrm = pc.map((p, i) => { const q = pc[Math.min(pc.length - 1, i + 1)], r = pc[Math.max(0, i - 1)]; const tg = q.clone().sub(r).normalize(); return V().crossVectors(tg, V(0, 0, 1)).normalize().multiplyScalar(-1); });
    for (let i = 0; i < nrm.length; i++) { const out = V(pc[i].x, pc[i].y - ycs, 0); if (nrm[i].dot(out) < 0) nrm[i].negate(); }
    const wid = pc.map(() => V(0, 0, 1)); const snapAt = pc[pc.length - 3];
    const sC = [ribbon(pc, nrm, wid, sw, stT, { scaleW: (i) => (i >= pc.length - 2 ? 1.12 : 1), shade: (i) => (i > pc.length - 3 ? edge : 1) })];
    const sn = nrm[pc.length - 3]; const snapG = [lathe([[0, 0.0032], [0.0028, 0.003], [0.0046, 0.0021], [0.0056, 0.0009], [0.0058, 0], [0.0052, -0.0004]], snapAt.clone().addScaledVector(sn, stT / 2), sn, 18)];
    const sp2 = []; const sn2 = []; for (let i = 1; i < pc.length - 3; i++) { sp2.push(pc[i].clone().addScaledVector(nrm[i], stT / 2 + 0.0002).add(V(0, 0, -sw * 0.32))); sn2.push(nrm[i]); } const sp3 = sp2.map((p) => p.clone().add(V(0, 0, sw * 0.64)));
    sC.push(stitchRow(sp2, sn2, thr), stitchRow(sp3, sn2, thr));
    // open: from the same root, up off the panel and hanging forward (+y = towards the front of the body), snap at the end
    const r0 = pc[0], po = [r0.clone(), r0.clone().add(V(-0.0015, 0.012, -0.009)), r0.clone().add(V(-0.004, 0.026, -0.008)), r0.clone().add(V(-0.0065, 0.036, 0.004)), r0.clone().add(V(-0.008, 0.04, 0.022)), r0.clone().add(V(-0.0085, 0.041, 0.036))];
    const no = po.map((p, i) => { const q = po[Math.min(po.length - 1, i + 1)], r = po[Math.max(0, i - 1)]; const tg = q.clone().sub(r).normalize(); const n = V().crossVectors(V(1, 0, 0), tg).normalize(); return n.dot(V(0, 1, -0.3)) < 0 ? n.negate() : n; });
    const wo = po.map((p, i) => V().crossVectors(no[i], po[Math.min(po.length - 1, i + 1)].clone().sub(po[Math.max(0, i - 1)]).normalize()).normalize());
    const sO = [ribbon(po, no, wo, sw, stT, { shade: (i) => (i >= po.length - 2 ? edge : 1) }), lathe([[0, 0.0012], [0.0045, 0.0011], [0.0056, 0.0004], [0.0058, 0]], po[po.length - 2].clone().addScaledVector(no[po.length - 2], -stT / 2), no[po.length - 2].clone().negate(), 18)];
    const lm = gearMat('leather', st.leather, 0.6), hm = hwMat(st.hw);
    strapC = new THREE.Group(); strapC.add(new THREE.Mesh(merge(sC), lm), new THREE.Mesh(merge(snapG), hm)); strapO = new THREE.Group(); strapO.add(new THREE.Mesh(merge([sO[0]]), lm), new THREE.Mesh(merge([sO[1]]), hm)); strapO.visible = false;
    for (const s of [strapC, strapO]) s.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); grp.add(strapC, strapO);
  }
  const lm = kydex ? gearMat('kydex', st.leather, 0.5) : gearMat('leather', st.leather, 0.6);
  const shell = new THREE.Mesh(merge(leather), lm); shell.castShadow = true; shell.receiveShadow = true; grp.add(shell);
  if (hw.length) { const h = new THREE.Mesh(merge(hw), hwMat(st.hw)); h.castShadow = true; grp.add(h); }
  // what the fit needs (pistol space)
  const contact = []; for (let i = 0; i <= 8; i++) { const z = zP0 + ((zP1 - zP0) * i) / 8; for (const yy of [yLo, (yLo + yHi) / 2, yHi]) { if (z < zA - 0.004 && yy < ySg) continue; contact.push(V(plateX + tp, yy, z)); } }
  const shellPts = []; for (let i = 0; i <= 10; i++) for (let k = 0; k < K; k += 3) { const th = TH[k]; const z = zm(th) + (zTip - zm(th)) * (i / 10); shellPts.push(S(th, z, t)); }
  const probes = [V(plateX + tp, (yLo + yHi) / 2, zP1), V(A(zTip - 0.01) + t, CY(zTip - 0.01), zTip - 0.01), V(A(zTip - 0.03) + t, CY(zTip - 0.03) - B(zTip - 0.03) * 0.7, zTip - 0.03)];
  const loops = [V(plateX + tp, CY(zA) - 0.026, zA + 0.024), V(plateX + tp, CY(zA) + 0.026, zA + 0.024)]; // belt-loop straps start here (inner face), going up
  return { group: grp, strapC, strapO, zA, ext, zTip, plateX, tp, contact, shellPts, probes, loops, loopTop: zA - 0.004, depth: zTip - zA + 0.025, kydex };
}

// place a holster on this body (hips-bone space); returns null when the body has no usable bind data
function fitHolster(B, H, pr, ud) {
  const a = HOLSTER_ANGLE, n = V(-Math.sin(a), 0, Math.cos(a)), f = V(Math.cos(a), 0, Math.sin(a)); const hp = B.hips;
  // surfaces round the hip: everything (holster body) and only what is under the shirt / waistcoat (belt loops)
  const all = new HMap(-0.22, 0.22, -0.42, 0.16, 0.008), low = new HMap(-0.22, 0.22, -0.42, 0.16, 0.008);
  let waist = -Infinity, hem = Infinity; const p = V();
  for (let i = 0; i < B.n; i++) {
    if (B.armW[i] > 0.5) continue; p.set(B.pos[3 * i] - hp.x, B.pos[3 * i + 1] - hp.y, B.pos[3 * i + 2] - hp.z); const h = p.x * n.x + p.z * n.z; if (h < 0.02) continue; const u = p.x * f.x + p.z * f.z;
    all.add(u, p.y, h); const c = B.cloth[i]; if (!CLOTH_OVER.has(c)) low.add(u, p.y, h);
    if (Math.abs(u) < 0.07) { if (c === 2 && p.y > waist && p.y < 0.2) waist = p.y; if (CLOTH_OVER.has(c) && p.y < hem && p.y > -0.3) hem = p.y; }
  }
  if (!isFinite(waist)) waist = 0.045;
  // orientation: muzzle down, raked back by the cant; pistol's left side (+x) against the body; slide top forward
  const zdir = UP.clone().multiplyScalar(-Math.cos(CANT)).addScaledVector(f, -Math.sin(CANT)).normalize(), xdir = n.clone().negate(), ydir = V().crossVectors(zdir, xdir).normalize();
  const R0 = new THREE.Matrix4().makeBasis(xdir, ydir, zdir); const axis = f.clone().negate(); // rotation about −f swings the lower end OUT
  // grip top under the hem (or ~3.5 cm over the waistband when nothing hangs over it)
  let top = -Infinity; const q = V(); const pts = []; for (let i = 0; i < pr.n; i++) { const z = pr.z0 + (i + 0.5) * pr.bin; for (const yy of [pr.y0[i], pr.y1[i]]) for (const xx of [pr.x0[i], pr.x1[i]]) pts.push(V(xx, yy, z)); }
  const gripTop = clamp(Math.min(waist + 0.035, hem - 0.014), waist - 0.09, waist + 0.04);
  const solve = (tilt) => {
    const R = new THREE.Matrix4().makeRotationAxis(axis, tilt).multiply(R0); top = -Infinity; for (const s of pts) { q.copy(s).applyMatrix4(R); if (q.y > top) top = q.y; }
    const cen = V(); for (const s of H.contact) cen.add(s); cen.multiplyScalar(1 / H.contact.length).applyMatrix4(R);
    const O = V().addScaledVector(f, -cen.dot(f)).addScaledVector(UP, gripTop - top);
    let need = -Infinity; const check = (list, margin) => { for (const s of list) { q.copy(s).applyMatrix4(R).add(O); const h = all.get(q.dot(f), q.y); if (h === -Infinity) continue; const d = h + margin - q.dot(n); if (d > need) need = d; } };
    check(H.contact, 0.004 + 0.0034); check(H.shellPts, 0.006); check(pts, 0.008); if (need === -Infinity) need = 0.12;
    O.addScaledVector(n, need); let gap = 0, gn = 0; for (const s of H.contact) { q.copy(s).applyMatrix4(R).add(O); const h = all.get(q.dot(f), q.y); if (h === -Infinity) continue; gap += q.dot(n) - h; gn++; }
    return { R, O, score: gn ? gap / gn + Math.abs(tilt) * 0.004 : 1 };
  };
  let best = null; for (let tl = -0.06; tl <= 0.3001; tl += 0.03) { const s = solve(tl); if (!best || s.score < best.score) { best = s; best.tilt = tl; } }
  const M = best.R.clone().setPosition(best.O); // pistol space → hips space
  const pivot = V(); for (const l of H.loops) pivot.add(l.clone().setZ(H.loopTop)); pivot.multiplyScalar(1 / H.loops.length).applyMatrix4(M);
  // thigh vertices near the holster's lower end (thigh-bone space) for the per-frame push
  const th = B.thighR, probesH = H.probes.map((s) => s.clone().applyMatrix4(M)); const thighPts = [];
  for (let i = 0; i < B.n; i++) { if (B.thighW[i] < 0.6) continue; p.set(B.pos[3 * i] - hp.x, B.pos[3 * i + 1] - hp.y, B.pos[3 * i + 2] - hp.z); let near = false; for (const s of probesH) if (p.distanceToSquared(s) < 0.15 * 0.15) near = true; if (near) thighPts.push(B.pos[3 * i] - th.x, B.pos[3 * i + 1] - th.y, B.pos[3 * i + 2] - th.z); }
  const stride = Math.max(1, Math.ceil(thighPts.length / 3 / 72)); const tp = []; for (let i = 0; i < thighPts.length / 3; i += stride) tp.push(thighPts[3 * i], thighPts[3 * i + 1], thighPts[3 * i + 2]);
  const lever = probesH.map((s) => { const r = s.clone().sub(pivot); return Math.max(0.03, r.sub(axis.clone().multiplyScalar(r.dot(axis))).length()); });
  return { M, pivot, axis, n, f, tilt: best.tilt, gripTop, waist, hem: isFinite(hem) ? hem : null, low, probesH, lever, thighPts: new Float32Array(tp), thighOff: th.clone().sub(hp) };
}
// belt-loop straps: from the back panel's inner face up the body (under the hem) to the waistband, folded over the belt, snapped
function buildHangers(F, H, st) {
  const parts = [], hw = [], w = 0.021, th = st.hanger === 'webbing' ? 0.0026 : 0.0034; const thr = ratio(st.thread, st.hanger === 'webbing' ? st.hangerCol : st.leather);
  const n = F.n, f = F.f, top = F.waist + 0.005;
  for (const l of H.loops) {
    const s0 = l.clone().add(V(th / 2, 0, 0)).applyMatrix4(F.M), s1 = l.clone().setZ(H.loopTop).add(V(th / 2, 0, 0)).applyMatrix4(F.M); const u = s1.dot(f);
    const pts = [s0, s1]; const r1 = s1.dot(n); let y = s1.y;
    const ys = []; while (y < top - 0.004) { y = Math.min(top, y + 0.006); ys.push(y); }
    const rs = ys.map((yy) => { const h = F.low.get(u, yy); return Math.max(h === -Infinity ? r1 : h + 0.0028 + th / 2, r1 - (yy - s1.y) * 0.6); });
    for (let it = 0; it < 24; it++) for (let i = 0; i < rs.length - 1; i++) { const prev = i ? rs[i - 1] : r1; rs[i] = Math.max(rs[i], (prev + rs[i + 1]) / 2 - 0.0004); } // taut
    ys.forEach((yy, i) => pts.push(f.clone().multiplyScalar(u).addScaledVector(n, rs[i]).setY(yy)));
    // fold over the belt and down behind it
    const pT = pts[pts.length - 1], rb = 0.0042, cF = pT.clone().addScaledVector(n, -rb); for (let k = 1; k <= 6; k++) { const an = (k / 6) * Math.PI; pts.push(cF.clone().addScaledVector(n, Math.cos(an) * rb).addScaledVector(UP, Math.sin(an) * rb)); }
    const back = cF.clone().addScaledVector(n, -rb); pts.push(back.clone().addScaledVector(UP, -0.01), back.clone().addScaledVector(UP, -0.018));
    const nrm = pts.map((p, i) => { const tg = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize(); const nn = V().crossVectors(f, tg).normalize(); const ref = i > pts.length - 9 ? p.clone().sub(cF).setY(0).add(UP.clone().multiplyScalar(p.y - cF.y)) : n; return nn.dot(ref) < 0 ? nn.negate() : nn; });
    const wid = pts.map(() => f.clone()); parts.push(ribbon(pts, nrm, wid, w, th, { shade: (i) => (i === 0 ? 0.7 : 1) }));
    // snap on the front where the loop closes, stitch rows along both edges of the visible run
    let iS = 2; while (iS < pts.length - 9 && pts[iS].y < top - 0.017) iS++; hw.push(lathe([[0, 0.003], [0.0026, 0.0028], [0.0042, 0.002], [0.005, 0.0008], [0.0052, 0], [0.0046, -0.0004]], pts[iS].clone().addScaledVector(nrm[iS], th / 2), nrm[iS], 16));
    const vis = pts.slice(1, Math.max(2, iS - 1)), vn = nrm.slice(1, Math.max(2, iS - 1)); if (vis.length >= 2) for (const sx of [-1, 1]) leatherStitch(parts, vis.map((p, i) => p.clone().addScaledVector(vn[i], th / 2 + 0.0002).addScaledVector(f, sx * w * 0.36)), vn, thr);
  }
  const mat = st.hanger === 'webbing' ? gearMat('webbing', st.hangerCol, 0.75) : gearMat('leather', st.leather, 0.6); const g = new THREE.Group(); g.name = 'holsterLoops';
  const a = new THREE.Mesh(merge(parts), mat); a.castShadow = true; a.receiveShadow = true; g.add(a); if (hw.length) { const h = new THREE.Mesh(merge(hw), hwMat(st.hw)); h.castShadow = true; g.add(h); } return g;
}
function leatherStitch(parts, pts, ns, col) { parts.push(stitchRow(pts, ns, col)); }

// ---------------------------------------------------------------------------------------------------- long-gun sling
function fitLong(B, pr, ud, cat) {
  const L = LONG_FIT[cat]; const C = B.chest; const p = V();
  const back = new HMap(-0.42, 0.42, -0.85, 0.65, 0.012); // back surface, chest-bone space: h = −z (distance behind the chest bone)
  for (let i = 0; i < B.n; i++) { if (B.armW[i] > 0.5) continue; const z = B.pos[3 * i + 2] - C.z; if (z > 0.03) continue; back.add(B.pos[3 * i] - C.x, B.pos[3 * i + 1] - C.y, -z); }
  const zB = ud.buttZ ?? pr.zMin, zM = Math.min(pr.zMax, (ud.muzzle ? ud.muzzle.z : pr.zMax) + 0.01); const len = zM - zB; const zc = (zB + zM) / 2;
  let yc = 0; { let s = 0; for (let i = 0; i < pr.n; i++) s += (pr.y0[i] + pr.y1[i]) / 2; yc = s / pr.n; }
  const b = L.up ? V(-Math.sin(L.tilt), Math.cos(L.tilt), 0) : V(Math.sin(L.tilt), -Math.cos(L.tilt), 0); // barrel direction in the body
  const xw = V(0, 0, 1), yw = V().crossVectors(b, xw).normalize(); const R0 = new THREE.Matrix4().makeBasis(xw, yw, b); const at = V().crossVectors(b, V(0, 0, 1)).normalize();
  const pts = []; for (let i = 0; i < pr.n; i += 1) { const z = pr.z0 + (i + 0.5) * pr.bin; if (z < zB - 0.01 || z > zM + 0.01) continue; for (const yy of [pr.y0[i], pr.y1[i]]) for (const xx of [pr.x0[i], pr.x1[i]]) pts.push(V(xx, yy, z)); }
  const target = V(0, L.cy, 0), q = V(), Cr = V(0, yc, zc);
  const solve = (tilt) => {
    const R = new THREE.Matrix4().makeRotationAxis(at, tilt).multiply(R0); const M = new THREE.Matrix4().makeTranslation(target.x, target.y, 0).multiply(R).multiply(new THREE.Matrix4().makeTranslation(-Cr.x, -Cr.y, -Cr.z));
    let need = -Infinity; for (const s of pts) { q.copy(s).applyMatrix4(M); const h = back.get(q.x, q.y); if (h === -Infinity) continue; const d = h + L.margin + q.z; if (d > need) need = d; } if (need === -Infinity) need = 0.15;
    let gap = 0, gn = 0; for (const s of pts) { if (s.x < 0) continue; q.copy(s).applyMatrix4(M); q.z -= need; const h = back.get(q.x, q.y); if (h === -Infinity) continue; gap += -q.z - h; gn++; }
    return { M: new THREE.Matrix4().makeTranslation(0, 0, -need).multiply(M), R, score: gn ? gap / gn + Math.abs(tilt) * 0.01 : 1 };
  };
  let best = null; for (let tl = -0.3; tl <= 0.3001; tl += 0.03) { const s = solve(tl); if (!best || s.score < best.score) best = s; }
  const M = best.M; // rifle space → chest space
  const upEnd = L.up ? zM : zB, loEnd = L.up ? zB : zM; const U = V(0, yc, upEnd + (loEnd - upEnd) * 0.28), D = V(0, yc, loEnd + (upEnd - loEnd) * 0.25);
  const Uc = U.clone().applyMatrix4(M), Dw = D.clone().applyMatrix4(M).add(C); const lowBone = Dw.y < B.spine.y - 0.02 ? 'hips' : 'spine'; const Db = Dw.clone().sub(B[lowBone]);
  const d0 = D.clone().applyMatrix4(M).sub(Uc).normalize();
  return { M, Uc, Db, lowBone, d0, back, len, cat, up: L.up, zB, zM, yc, rot: best.R };
}
// the sling (87th): the ring round the torso (sash plane through the right shoulder top and the left hip, cut through the
// bind-pose body, pulled taut over hollows), skinned node by node; the D-rings / studs on the rifle (rifle space, they go wherever
// the rifle goes); ONE strap from swivel to swivel built straight in material coordinates and bent along the live path
// (SlingStrap.js); and the clearance table for the sling transition (the rifle sliding round the ring over the right shoulder)
function buildSling(B, F, pr, ud, st, ch) {
  const C = B.chest, M = F.M, Mi = M.clone().invert(), cat = F.cat; const leatherSling = st.sling === 'leather';
  const w = cat === 'compact' ? 0.03 : 0.032, th = leatherSling ? 0.0036 : 0.0025;
  // shoulder top (trapezius between the neck and the shoulder joint)
  let shTop = -Infinity; const sx = (B.shR.x + 0) * 1.25 - 0.01; for (let i = 0; i < B.n; i++) { if (B.armW[i] > 0.5) continue; const x = B.pos[3 * i], y = B.pos[3 * i + 1], z = B.pos[3 * i + 2]; if (Math.abs(x - sx) < 0.02 && Math.abs(z) < 0.05 && y > shTop) shTop = y; }
  if (!isFinite(shTop)) shTop = B.shR.y + 0.05;
  const S = V(sx, shTop, 0), Lh = V(0.135, B.hips.y + 0.09, 0); const Cs = S.clone().add(Lh).multiplyScalar(0.5); Cs.z = 0.0;
  const e1 = S.clone().sub(Cs).normalize(), e2 = V(0, 0, 1), nrm = V().crossVectors(e1, e2).normalize();
  const NB = RING_NB, R = new Float32Array(NB), lists = Array.from({ length: NB }, () => []); const rel = V();
  for (let i = 0; i < B.n; i++) { if (B.armW[i] > 0.5) continue; rel.set(B.pos[3 * i] - Cs.x, B.pos[3 * i + 1] - Cs.y, B.pos[3 * i + 2] - Cs.z); const h = rel.dot(nrm); if (Math.abs(h) > w / 2 + 0.006) continue;
    const c1 = rel.dot(e1), c2 = rel.dot(e2); const phi = (Math.atan2(c2, c1) + Math.PI * 2) % (Math.PI * 2); const bI = Math.min(NB - 1, Math.floor((phi / (Math.PI * 2)) * NB)); const r = Math.hypot(c1, c2); if (r > R[bI]) R[bI] = r; lists[bI].push(i); }
  for (let i = 0; i < NB; i++) if (!R[i]) { let a = 1, b = 1; while (!R[(i - a + NB) % NB] && a < NB) a++; while (!R[(i + b) % NB] && b < NB) b++; R[i] = (R[(i - a + NB) % NB] * b + R[(i + b) % NB] * a) / (a + b); }
  const T = Float32Array.from(R); for (let it = 0; it < 60; it++) for (let i = 0; i < NB; i++) T[i] = Math.max(R[i], (T[(i - 1 + NB) % NB] + T[(i + 1) % NB]) / 2); // taut over hollows
  const off = 0.0032 + th / 2; const loopP = (i) => { const phi = ((i + 0.5) / NB) * Math.PI * 2; return Cs.clone().addScaledVector(e1, Math.cos(phi) * (T[i] + off)).addScaledVector(e2, Math.sin(phi) * (T[i] + off)); };
  const loopN = (i) => { const phi = ((i + 0.5) / NB) * Math.PI * 2; return e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi)); };
  // swivels: front (handguard) and rear (stock), each on the side of the rifle that faces where its strap goes on the back
  const zf = clamp((ud.support ? ud.support.z : 0.2) + 0.14, F.zB + 0.3, F.zM - 0.09), zr = F.zB + 0.065;
  const zU = F.up ? zf : zr, zL = F.up ? zr : zf; const upB = V(0, 1, 0).transformDirection(M); // rifle's top, chest space
  const swivel = (z, goal) => { const i = pIdx(pr, z); const toward = goal.clone().sub(C).sub(V(0, F.yc, z).applyMatrix4(M)); const side = upB.dot(toward) >= 0 ? 1 : -1; return { z, side, p: V(0, side > 0 ? pr.y1[i] : pr.y0[i], z) }; };
  const sU = swivel(zU, S), sL = swivel(zL, Lh);
  const swW = (s) => s.p.clone().add(V(0, s.side * 0.0145, 0)).applyMatrix4(M).add(C); // D-ring bar, bind space
  const barU = swW(sU), barL = swW(sL);
  // attach nodes with the rifle on the back: nearest each bar on the back half; the strap runs FORWARD round the ring from U to L
  // (over the right shoulder, across the chest, round the left hip)
  const nearest = (P) => { let bi = 0, bd = Infinity; for (let i = 0; i < NB; i++) { const q = loopP(i); if (q.z > 0.02) continue; const d = q.distanceTo(P); if (d < bd) { bd = d; bi = i; } } return bi; };
  const iU = nearest(barU), iL = nearest(barL);
  // ring nodes for the runtime: bind position / normal + skin weights from the nearest body vertices (inverse distance)
  const ringP = new Float32Array(NB * 3), ringN = new Float32Array(NB * 3), SIa = new Uint16Array(NB * 4), SWa = new Float32Array(NB * 4); const acc = new Map(), vv = V();
  for (let i = 0; i < NB; i++) {
    const p = loopP(i), n = loopN(i); ringP.set([p.x, p.y, p.z], 3 * i); ringN.set([n.x, n.y, n.z], 3 * i); const cand = [];
    for (let d = -2; d <= 2; d++) for (const j of lists[(i + d + NB) % NB]) { vv.set(B.pos[3 * j], B.pos[3 * j + 1], B.pos[3 * j + 2]); cand.push([vv.distanceToSquared(p), j]); }
    cand.sort((a, b) => a[0] - b[0]); acc.clear(); for (let k = 0; k < Math.min(6, cand.length); k++) { const [d2, j] = cand[k]; const wt = 1 / (Math.sqrt(d2) + 0.01); for (let c = 0; c < 4; c++) { const bb = B.SI.getComponent(j, c), ww = B.SW.getComponent(j, c) * wt; if (ww > 0) acc.set(bb, (acc.get(bb) || 0) + ww); } }
    if (!acc.size) acc.set(B.bi('chest'), 1); const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4); const s = top.reduce((x, e) => x + e[1], 0) || 1;
    for (let c = 0; c < 4; c++) { SIa[4 * i + c] = top[c] ? top[c][0] : 0; SWa[4 * i + c] = top[c] ? top[c][1] / s : 0; }
  }
  const ring = { P: ringP, N: ringN, SI: SIa, SW: SWa };
  // rifle-side hardware (rifle space): QD swivel studs, posts and D-rings, the bar square to the strap's pull on the back
  const hw = []; const toR = (pW) => pW.clone().sub(C).applyMatrix4(Mi); const bars = {};
  for (const [key, s, bar, iN] of [['U', sU, barU, iU], ['L', sL, barL, iL]]) {
    const sN = V(0, s.side, 0), base = s.p.clone(); hw.push(lathe([[0.0062, -0.002], [0.0062, 0.001], [0.0058, 0.0022], [0.0042, 0.003], [0, 0.0031]], base, sN, 16)); // flush cup
    const barR = toR(bar), dir = toR(loopP(iN)).sub(barR).normalize(); const ax = V().crossVectors(sN, dir); if (ax.lengthSq() < 1e-4) ax.set(1, 0, 0); ax.normalize(); // bar axis ⟂ strap pull
    const hwid = w / 2 + 0.0035; const ringPts = []; for (let k = 0; k < 18; k++) { const an = (k / 18) * Math.PI * 2; const c = Math.cos(an), sn2 = Math.sin(an); const along = sn2 >= 0 ? 0.012 : 0.012 + sn2 * 0.0095; ringPts.push(base.clone().addScaledVector(ax, c * hwid).addScaledVector(sN, along + 0.0025)); }
    hw.push(wireLoop(ringPts, 0.0016)); hw.push(lathe([[0.0018, 0], [0.0026, 0.0012], [0.0026, 0.0045], [0.0016, 0.0058], [0, 0.006]], base.clone().addScaledVector(sN, 0.0015), sN, 10)); // swivel post
    bars[key] = { p: base.clone().addScaledVector(sN, 0.0145), x: ax };
  }
  const rig = new THREE.Group(); rig.name = 'slingHardware'; const hm = new THREE.Mesh(merge(hw), hwMat(st.hw === 'brass' ? 'oxide' : st.hw)); hm.castShadow = true; rig.add(hm);
  // strap length = the slung path in the bind pose (so the strap fits exactly there and the ends never stretch)
  const Mb = new THREE.Matrix4().makeTranslation(C.x, C.y, C.z).multiply(M); const slung = { aU: iU, aL: iL };
  const bl = SlingPath.bindLength(ring, bars, Mb, slung); const Lm = bl.L, mTop = bl.mTop, E = 0.1;
  // the adjustable run (quick-adjust): plain strap clear of the pad and of the ends — where the strap pays out when the gun is brought
  // round to the front and is taken back in when it goes on the back (SlingPath / pathS); nothing stitched along it
  let ZA = mTop > Lm / 2 ? E + 0.03 : mTop + 0.16, ZB = mTop > Lm / 2 ? mTop - 0.16 : Lm - E - 0.03; if (ZB - ZA < 0.12) { ZA = E; ZB = Lm - E; }
  // ---- the strap, straight: x = metres along (0 = U end), y = off the outer face, z = across
  const nSt = Math.max(24, Math.ceil(Lm / 0.008)); const xs = Array.from({ length: nSt + 1 }, (_, i) => (Lm * i) / nSt);
  const line = (x0, x1, y, step = 0.008) => { const n = Math.max(2, Math.ceil((x1 - x0) / step)); return Array.from({ length: n + 1 }, (_, i) => V(x0 + ((x1 - x0) * i) / n, y, 0)); };
  const NY = (a) => a.map(() => V(0, 1, 0)), WZ = (a) => a.map(() => V(0, 0, 1));
  const pad = LONG_FIT[cat].pad; const padW = (x) => (pad ? 1 + 0.55 * (1 - sstep(0.1, 0.14, Math.abs(x - mTop))) : 1);
  const P0 = xs.map((x) => V(x, 0, 0)); const strapParts = ribbon(P0, NY(P0), WZ(P0), w, th, { scaleW: (i) => padW(xs[i]), shade: () => 1 });
  const sc = ratio(st.strapThread, st.strap); const up = V(0, 1, 0);
  if (pad) { // shoulder pad: thicker neoprene-backed section, its own seam
    const pp = line(Math.max(0.12, mTop - 0.13), Math.min(Lm - 0.12, mTop + 0.13), th / 2 + 0.002); const sw2 = (k) => 0.75 + 0.25 * Math.sin((k / (pp.length - 1)) * Math.PI);
    strapParts.push(ribbon(pp, NY(pp), WZ(pp), w * 1.5, 0.0045, { scaleW: sw2, shade: () => 0.82 }));
    for (const s2 of [-1, 1]) strapParts.push(stitchRow(pp.map((p, k) => p.clone().setY(th / 2 + 0.00445).setZ(s2 * w * 0.62 * sw2(k))), pp.map(() => up), sc, { pitch: 0.0048 })); }
  if (leatherSling) for (const s2 of [-1, 1]) for (const [x0, x1] of [[0.075, ZA - 0.01], [ZB + 0.01, Lm - 0.075]]) if (x1 - x0 > 0.03) strapParts.push(stitchRow(line(x0, x1, th / 2 + 0.0002).map((p) => p.setZ(s2 * w * 0.38)), line(x0, x1, 0).map(() => up), sc, { pitch: 0.0055 })); // edge stitching stops where the strap adjusts
  // the ends: round the D-ring bar, doubled back over the outer face and box-X bar-tacked, the tip under a tri-glide
  const sHw = []; const tl = 0.068, yT = th * 1.05, rf = yT / 2;
  for (const end of [0, 1]) {
    const xa = end ? Lm - tl : 0.0015, xb = end ? Lm - 0.0015 : tl; const tp = line(xa, xb, yT, 0.006); strapParts.push(ribbon(tp, NY(tp), WZ(tp), w * 0.985, th, { shade: () => 0.97 }));
    const xe = end ? Lm : 0, fp = [], fn = []; for (let k = 0; k <= 8; k++) { const an = -Math.PI / 2 + (end ? 1 : -1) * (k / 8) * Math.PI; const c = V(xe + Math.cos(an) * rf * 1.02, rf + Math.sin(an) * rf, 0); fp.push(c); fn.push(V(Math.cos(an), Math.sin(an), 0)); }
    strapParts.push(ribbon(fp, fn, WZ(fp), w * 0.99, th, { caps: false, shade: () => 0.92 }));
    const xc = end ? Lm - 0.03 : 0.03, yS = yT + th / 2 + 0.00025; const corner = (a, b) => V(xc + a * 0.011, yS, b * w * 0.36);
    const seg = (a, b) => { const pts = []; for (let k = 0; k <= 6; k++) pts.push(a.clone().lerp(b, k / 6)); strapParts.push(stitchRow(pts, pts.map(() => up), sc, { pitch: 0.0032, len: 0.0024, slant: 0 })); };
    const A0 = corner(-1, -1), A1 = corner(-1, 1), A2 = corner(1, 1), A3 = corner(1, -1); seg(A0, A1); seg(A1, A2); seg(A2, A3); seg(A3, A0); seg(A0, A2); seg(A1, A3);
    const xg = end ? Lm - 0.074 : 0.074, hx = w / 2 + 0.003, hz = 0.011, fr = []; for (let k = 0; k < 20; k++) { const an = (k / 20) * Math.PI * 2; const c = Math.cos(an), s3 = Math.sin(an); fr.push(V(xg + Math.sign(s3) * Math.pow(Math.abs(s3), 0.25) * hz, yT * 0.5, Math.sign(c) * Math.pow(Math.abs(c), 0.25) * hx)); }
    sHw.push(wireLoop(fr, 0.0014)); const cb = []; for (let k = 0; k <= 4; k++) cb.push(V(xg, yT + th * 0.9, -hx + (2 * hx * k) / 4)); sHw.push(wireLoop([...cb, ...cb.slice(1, -1).reverse()], 0.0013));
  }
  const path = new SlingPath(ch.mesh, ring, bars, Lm, E, slung);
  path.setZone(ZA, ZB);
  const sMat = pathMaterial(leatherSling ? gearMat('leather', st.strap, 0.62) : gearMat('webbing', st.strap, 0.78), path.U), dMat = pathDepthMaterial(path.U);
  const strap = new THREE.Group(); strap.name = 'slingStrap';
  const sm = new THREE.Mesh(merge(strapParts), sMat); const bm = new THREE.Mesh(merge(sHw), pathMaterial(hwMat(st.hw === 'brass' ? 'oxide' : st.hw), path.U));
  for (const m of [sm, bm]) { m.geometry.boundingSphere = new THREE.Sphere(V(0, 0.95, 0), 1.7); m.castShadow = true; m.receiveShadow = m === sm; m.customDepthMaterial = dMat; strap.add(m); }
  // the path is laid at render time, once per frame, from the world matrices the renderer has just brought up to date (the shadow
  // pass draws first, so it and the main pass see the same path) — no extra hierarchy update in the game loop for it
  const hook = () => path.renderHook(); sm.onBeforeRender = hook; bm.onBeforeRender = hook;
  // ---- sling transition: the rifle slides round the ring (about the sash axis through Cs) over the right shoulder to the front;
  // per angle, how far it must stand off the body (radial map of the torso in the sash frame) so it never passes through it
  const rmap = new HMap(-0.64, 0.64, -0.4, 0.4, 0.012);
  for (let i = 0; i < B.n; i++) { if (B.armW[i] > 0.5) continue; rel.set(B.pos[3 * i] - Cs.x, B.pos[3 * i + 1] - Cs.y, B.pos[3 * i + 2] - Cs.z); const c1 = rel.dot(e1), c2 = rel.dot(e2); rmap.add(Math.atan2(c2, c1) * 0.2, rel.dot(nrm), Math.hypot(c1, c2)); }
  if (B.neck) { const hc = B.neck.clone().add(V(0, 0.1, 0.015)); for (let a = 0; a < 24; a++) for (let b = 1; b < 12; b++) { const th2 = (a / 24) * Math.PI * 2, ph = (b / 12) * Math.PI; // the head is its own mesh: a 12 cm sphere stands in for it (hair, caps)
    rel.set(Math.sin(ph) * Math.cos(th2), Math.cos(ph), Math.sin(ph) * Math.sin(th2)).multiplyScalar(0.12).add(hc).sub(Cs); const c1 = rel.dot(e1), c2 = rel.dot(e2); rmap.add(Math.atan2(c2, c1) * 0.2, rel.dot(nrm), Math.hypot(c1, c2)); } }
  const rp = []; for (let i = 0; i < pr.n; i += 2) { const z = pr.z0 + (i + 0.5) * pr.bin; if (z < F.zB - 0.005 || z > F.zM + 0.005) continue; for (const yy of [pr.y0[i], pr.y1[i]]) for (const xx of [pr.x0[i], pr.x1[i]]) rp.push(V(xx, yy, z)); }
  const cen = V(0, F.yc, (F.zB + F.zM) / 2), lifts = new Float32Array(SLIDE_N + 1), q = V(), dv = V(); const Rj = new THREE.Matrix4();
  for (let j = 0; j <= SLIDE_N; j++) {
    const psi = (j / SLIDE_N) * Math.PI; Rj.makeTranslation(Cs.x, Cs.y, Cs.z).multiply(new THREE.Matrix4().makeRotationAxis(nrm, psi)).multiply(new THREE.Matrix4().makeTranslation(-Cs.x, -Cs.y, -Cs.z)).multiply(Mb);
    dv.copy(cen).applyMatrix4(Rj).sub(Cs); dv.addScaledVector(nrm, -dv.dot(nrm)).normalize();
    const clear = (L) => { for (const p of rp) { q.copy(p).applyMatrix4(Rj).addScaledVector(dv, L).sub(Cs); const c1 = q.dot(e1), c2 = q.dot(e2); const hb = rmap.get(Math.atan2(c2, c1) * 0.2, q.dot(nrm)); if (hb !== -Infinity && Math.hypot(c1, c2) < hb + 0.02) return false; } return true; };
    if (clear(0)) continue; let lo = 0, hi = 0.6; for (let it = 0; it < 11; it++) { const mid = (lo + hi) / 2; if (clear(mid)) hi = mid; else lo = mid; } lifts[j] = hi;
  }
  { // the stand-off as a smooth function of the swing (no radial kick where the head / shoulder starts or stops needing room): dilate by a
    // neighbour so the blur never takes clearance away, then two [1 2 1] passes
    const tmp = Float32Array.from(lifts), at = (A, j) => A[Math.max(0, Math.min(SLIDE_N, j))];
    for (let j = 0; j <= SLIDE_N; j++) lifts[j] = Math.max(at(tmp, j - 1), tmp[j], at(tmp, j + 1));
    for (let pass = 0; pass < 2; pass++) { tmp.set(lifts); for (let j = 0; j <= SLIDE_N; j++) lifts[j] = Math.max(tmp[j] * 0.85, (at(tmp, j - 1) + 2 * tmp[j] + at(tmp, j + 1)) / 4); } }
  const grab = Math.round((1.15 / (Math.PI * 2)) * NB); // where the support hand takes the strap on the chest (left of the sternum)
  return { strap, rig, path, slide: { Cs: Cs.clone().sub(C), axis: nrm.clone(), lifts, cen }, grab, Lm };
}

// ---------------------------------------------------------------------------------------------------- runtime
const _a = V(), _b = V(), _c = V(), _d = V(), _q = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _n3 = new THREE.Matrix3();
const LEGACY_P = { p: V(-0.2, -0.06, 0.03), r: new THREE.Euler(Math.PI / 2 - 0.15, 0, 0.1) };
const LEGACY_R = (() => { const b = V(-0.5, 0.866, 0), xw = V(0, 0, 1), yw = V().crossVectors(b, xw); return { q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xw, yw, b)), p: V(0.125, -0.32, -0.21) }; })();

// 87th: ONE holster for every pistol — sized to the envelope of all of them (tools/holster-envelope.mjs), so its shape, size and
// place on the body never change when the selected pistol changes; each pistol only takes its seat in it (a few mm of centring)
const ENV = (() => { const e = PISTOL_ENVELOPE; return { ...e, y0: Float32Array.from(e.y0), y1: Float32Array.from(e.y1), x0: Float32Array.from(e.x0), x1: Float32Array.from(e.x1) }; })();
const ENV_UD = { muzzle: V(0, 0, PISTOL_ENVELOPE.muzzleZ) };
export const HIP_GRIP = 0.3; // pistol draw: the hand closes on the grip and opens the thumb break at this point of the draw (Weapons.pose)

export class CarryGear {
  constructor(W) {
    this.W = W; this.ch = null; this.carryP = -1; this.carryL = -1; this.memo = new WeakMap(); this.hideLong = false;
    this.holsters = new Map(); // holster style → the built (universal) holster, shared by every body that wears that style
    this.fits = new Map(); // `${character}:P` → the holster fitted to that body (+ its belt loops); `${character}:${index}` → a long gun's sling on that body
    // the existing slots: holsterP (the pistol sits at identity in it, offset by its seat) inside a fitted group on the hips bone;
    // holsterR (the long gun) on the chest bone, its matrix solved every frame
    this.gP = new THREE.Group(); this.gP.name = 'holsterFit'; this.gP.matrixAutoUpdate = false; this.gP.add(W.holsterP); this.gHang = new THREE.Group(); this.gHang.name = 'holsterLoopsSlot';
    W.holsterP.position.set(0, 0, 0); W.holsterP.rotation.set(0, 0, 0); W.holsterR.matrixAutoUpdate = false; this.swing = 0; this.strapOpen = false; this.cur = { P: null, L: null };
    this.slung = false; this.strapShown = false; this.seat = null; this.stats = { builds: 0, fitMs: 0 };
  }
  // the character the gear is worn by (squad switch / outfit rebuild)
  attach(ch) {
    if (this.ch === ch) { this.parentSlots(); return; } this.detachLong(); if (this.ch) this.trimIdle(this.ch); this.ch = ch; this.cur.P = null; this.cur.L = null; this.swing = 0; this.parentSlots(); this.prune();
  }
  parentSlots() { const b = this.ch.bones; if (this.gP.parent !== b.hips) b.hips.add(this.gP); if (this.gHang.parent !== b.hips) b.hips.add(this.gHang); if (this.W.holsterR.parent !== b.chest) b.chest.add(this.W.holsterR); }
  // drop gear built for characters that no longer exist (outfit rebuilds make a new Character)
  prune() {
    const alive = new Set([chId(this.ch)]); const sq = this.W.g && this.W.g.squad; if (sq && sq.members) for (const m of sq.members) if (m.ch) alive.add(chId(m.ch));
    for (const [k, f] of this.fits) if (!alive.has(k.split(':')[0])) { this.disposeFit(f); this.fits.delete(k); }
  }
  disposeFit(f) {
    if (f === this.cur.L) this.detachLong();
    for (const o of [f.hang, f.strap, f.rig]) if (o) { o.parent?.remove(o); o.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material && /:path$/.test(x.material.name)) x.material.dispose(); if (x.customDepthMaterial) x.customDepthMaterial.dispose(); }); }
    if (f.path) f.path.tex.dispose();
  }
  dispose() { for (const f of this.fits.values()) this.disposeFit(f); this.fits.clear(); for (const h of this.holsters.values()) { h.group.parent?.remove(h.group); h.group.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); } this.holsters.clear(); }
  // which weapon of each class is carried: the selected one, else the one in the hands, else the last used, else any owned
  carriable(i, pistol) { const W = this.W; return i >= 0 && i < WEAPONS.length && !!W.inv[i] && W.inv[i].owned && (WEAPONS[i].cls === 'pistol') === pistol; }
  pick(pistol) { // per frame (late): no closures / temporaries
    const W = this.W; if (this.carriable(W.sel, pistol)) return W.sel; if (this.carriable(W.cur, pistol)) return W.cur; const m = this.memo.get(this.ch); const last = m ? (pistol ? m.p : m.l) : -1; if (this.carriable(last, pistol)) return last;
    const tp = W.typePick; if (tp) for (const t in tp) if (this.carriable(tp[t], pistol)) return tp[t]; for (let i = 0; i < WEAPONS.length; i++) if (this.carriable(i, pistol)) return i; return -1;
  }
  inHands(i) { const W = this.W; return i >= 0 && i === W.cur && W.state !== 'none'; }
  // the stowed models into their slots (called by Weapons.showHolstered and whenever the carried set changes)
  refresh() {
    const W = this.W; if (!this.ch) return; this.carryP = this.pick(true); this.carryL = this.pick(false);
    const m = this.memo.get(this.ch) || {}; if (this.carryP >= 0) m.p = this.carryP; if (this.carryL >= 0) m.l = this.carryL; this.memo.set(this.ch, m);
    this.hideLong = this.longStowedAway();
    const showP = this.carryP >= 0 && !this.inHands(this.carryP), showL = this.carryL >= 0 && !this.inHands(this.carryL) && !this.hideLong;
    this.usePistol(this.carryP); this.useLong(this.carryL); // the sling stays fitted while seated in a car (only hidden): no rebuild on getting out
    const seat = (md, slot) => { if (md.parent !== slot) slot.add(md); md.position.set(0, 0, 0); md.quaternion.identity(); md.scale.set(1, 1, 1); md.matrixAutoUpdate = true; md.visible = true; };
    for (const i of W.built) { const md = W.models[i]; if (this.inHands(i)) continue; // pose() owns a weapon in the hands
      if (i === this.carryP && showP) seat(md, W.holsterP); else if (i === this.carryL && showL) seat(md, W.holsterR); else md.visible = false; }
    if (showP && !W.built.includes(this.carryP)) seat(W.models[this.carryP], W.holsterP);
    if (showL && !W.built.includes(this.carryL)) seat(W.models[this.carryL], W.holsterR);
    this.syncVisible(); this.late(0, true);
  }
  longStowedAway() { // seated in a car (and while getting in / out of one): the slung rifle is laid aside, it would go through the seat
    const P = this.W.P; if (!P) return false; const bikeLike = (v) => v && v.T && (v.T.entry === 'bike' || v.T.pedal); const E = P.entry, X = P.exiting;
    if (P.vehicle && !bikeLike(P.vehicle)) return true; if (E && E.v && !bikeLike(E.v) && E.stage !== 'approach' && E.stage !== 'align') return true; if (X && X.v && !bikeLike(X.v)) return true; return false;
  }
  key(i) { return chId(this.ch) + ':' + i; }
  holsterKit() { // one build per holster style (leather / kydex + colour), sized to every pistol at once
    const st = styleOf(this.ch), hk = st.holster + st.leather; let h = this.holsters.get(hk); if (h) return h; const t0 = performance.now();
    h = buildHolster(ENV, ENV_UD, st); this.holsters.set(hk, h); this.stats.builds++; this.stats.fitMs += performance.now() - t0; return h;
  }
  // a pistol's seat in the universal holster: y offset (centres a smaller slide in the shell) and its muzzle reach (draw lift)
  seatFor(i) {
    const d = WEAPONS[i]; const s = d && PISTOL_SEATS[d.id]; if (s) return s; const md = this.W.models[i]; const ud = md && md.userData;
    return { dy: 0, muzzleZ: ud && ud.muzzle ? ud.muzzle.z : 0.16 }; // a pistol added since the envelope was baked: re-run tools/holster-envelope.mjs
  }
  usePistol(i) {
    const W = this.W; if (i < 0) { this.cur.P = null; this.seat = null; this.gP.visible = false; this.gHang.visible = false; return; }
    const seat = this.seatFor(i); if (this.seat !== seat) { this.seat = seat; W.holsterP.position.set(0, seat.dy, 0); W.holsterP.updateMatrix(); } // the only per-pistol change
    const k = chId(this.ch) + ':P'; let f = this.fits.get(k);
    if (!f) { const B = bodyData(this.ch); const h = this.holsterKit(); const t0 = performance.now(); const F = B && h ? fitHolster(B, h, ENV, ENV_UD) : null;
      f = { F, h, hang: F ? buildHangers(F, h, styleOf(this.ch)) : null }; this.fits.set(k, f); this.stats.fitMs += performance.now() - t0; }
    if (this.cur.P === f) { this.gP.visible = true; this.gHang.visible = true; return; } this.cur.P = f; this.swing = 0;
    for (const c of [...this.gP.children]) if (c !== W.holsterP) this.gP.remove(c); for (const c of [...this.gHang.children]) this.gHang.remove(c);
    if (f.F) { this.gP.add(f.h.group); if (f.hang) this.gHang.add(f.hang); this.gP.matrix.copy(f.F.M); }
    else { this.gP.matrix.compose(LEGACY_P.p, _q.setFromEuler(LEGACY_P.r), _a.set(1, 1, 1)); } // no bind data (not a hero body): the old fixed offset, no gear
    this.gP.matrixWorldNeedsUpdate = true; this.gP.visible = true; this.gHang.visible = true;
  }
  useLong(i) {
    const W = this.W, R = W.holsterR; if (i < 0) { this.detachLong(); this.cur.L = null; return; }
    const f = this.longFit(i);
    const md = W.models[i]; if (f.rig && f.rig.parent !== md) md.add(f.rig); // studs / D-rings belong to the gun: they go wherever it goes
    if (this.cur.L === f) return; this.detachLong(); this.cur.L = f;
    if (f.strap && f.strap.parent !== this.ch.mesh) this.ch.mesh.add(f.strap); if (f.strap) f.strap.visible = false; this.strapShown = false; if (f.path) f.path.reset();
    if (!f.F) R.matrix.compose(LEGACY_R.p, LEGACY_R.q, _a.set(1, 1, 1)); R.matrixWorldNeedsUpdate = true;
  }
  // a long gun's sling fitted to this body (cached per body + gun; built at most once — ahead of time by prefit when possible)
  longFit(i) {
    const W = this.W, k = this.key(i); let f = this.fits.get(k); if (f) return f;
    const t0 = performance.now(); const B = bodyData(this.ch); const md = W.models[i]; const pr = weaponProfile(md); const cat = carryCategory(WEAPONS[i]);
    const F = B && pr ? fitLong(B, pr, md.userData, cat) : null; let s = null; try { s = F ? buildSling(B, F, pr, md.userData, styleOf(this.ch), this.ch) : null; } catch (e) { console.warn('sling build', e); }
    f = { F, strap: s && s.strap, rig: s && s.rig, path: s && s.path, slide: s && s.slide, grab: s ? s.grab : 0, long: true, idx: i }; this.fits.set(k, f); this.stats.builds++; this.stats.fitMs += performance.now() - t0; this.trimLong(); return f;
  }
  // build a long gun's sling now (behind a loading screen / in a shop menu — Weapons.prewarmOwned), so switching to it never
  // builds one mid-play (≈20–45 ms). Returns the strap group (detached, hidden) for the caller's shader warm-up.
  prefit(i) { if (!this.ch || !(i >= 0) || WEAPONS[i].cls === 'pistol') return null; const f = this.longFit(i); return f && f.strap; }
  detachLong() { const f = this.cur.L; if (!f) return; if (f.strap) { f.strap.visible = false; f.strap.parent?.remove(f.strap); } if (f.rig) f.rig.parent?.remove(f.rig); this.strapShown = false; } // a sling not in use leaves the body / the gun entirely (no hidden leftovers)
  trimLong() { this.trim(true, 6); } // at most six slings kept built for the body in play (≈0.9 MB each; Weapons.prewarmOwned prefits the likely ones)
  // a body leaving play (squad switch) keeps only the sling of the long gun it carries — the rest are rebuilt if it comes back to them
  trimIdle(ch) { const id = chId(ch) + ':', keep = (this.memo.get(ch) || {}).l; for (const [k, f] of [...this.fits]) if (f.long && k.startsWith(id) && f.idx !== keep) { this.disposeFit(f); this.fits.delete(k); } }
  // bounded caches: the oldest fits of one kind for this character (never the one in use)
  trim(long, max) {
    const mine = [...this.fits.entries()].filter(([k, f]) => !!f.long === long && k.startsWith(chId(this.ch) + ':')); while (mine.length > max) { const [k, f] = mine.shift(); if (f === this.cur.L || f === this.cur.P) continue; this.disposeFit(f); this.fits.delete(k); }
  }
  // the ONE place gear visibility is decided, from where the weapons actually are and what Weapons is doing:
  //  · thumb break: closed over a seated pistol, opened by the hand as the draw takes the grip, snapped shut once it is back;
  //  · sling strap: shown whenever its long gun is shown — on the back or in the hands — never without it (and never in a car seat)
  syncVisible() {
    const W = this.W; const pm = this.carryP >= 0 && W.built.includes(this.carryP) ? W.models[this.carryP] : null; const seated = !!(pm && pm.parent === W.holsterP && pm.visible);
    const hip = W.drawMode === 'hip' && (W.state === 'equip' || W.state === 'holster') && W.cur === this.carryP && W.dur > 0; const hu = hip ? (W.state === 'equip' ? W.t / W.dur : 1 - W.t / W.dur) : -1;
    const open = !seated || hu >= HIP_GRIP; if (this.cur.P && this.cur.P.h && this.cur.P.h.strapC) { this.cur.P.h.strapC.visible = !open; this.cur.P.h.strapO.visible = open; } this.strapOpen = open;
    const lm = this.carryL >= 0 && W.built.includes(this.carryL) ? W.models[this.carryL] : null; const onBack = !!(lm && lm.parent === W.holsterR && lm.visible) && !this.hideLong;
    const inHand = !!(lm && lm.parent === W.inHand && lm.visible && W.cur === this.carryL) && !this.hideLong; const f = this.cur.L; const show = (onBack || inHand) && !!(f && f.strap && f.path);
    if (f && f.strap) { if (show && !this.strapShown) f.path.reset(); f.strap.visible = show; } this.strapShown = show;
    this.slung = onBack; this.seated = seated; this.longInHand = inHand;
  }
  // how far the pistol travels up out of the holster along its bore before it can turn: its muzzle clear of the mouth's high side
  drawLift(i) { const f = this.cur.P; if (!f || !f.F || i !== this.carryP) return 0; return this.seatFor(i).muzzleZ - f.h.zA + f.h.ext + 0.012; }
  // sling transition (Weapons.pose, drawMode 'sling'): the long gun carried round the ring by the strap, angle psi (0 = on the
  // back as hung now, π = across the front), stood off the body by the precomputed clearance. base / out: rifle → chest space
  canSlide() { const f = this.cur.L; return !!(f && f.slide && f.F && f.idx === this.W.cur); }
  slideMatrix(psi, base, out) {
    const f = this.cur.L, s = f && f.slide; if (!s) return out.copy(base); const C = s.Cs, ax = s.axis;
    _m1.makeTranslation(C.x, C.y, C.z).multiply(_m2.makeRotationAxis(ax, psi)).multiply(_m3.makeTranslation(-C.x, -C.y, -C.z)); out.multiplyMatrices(_m1, base);
    _a.copy(s.cen).applyMatrix4(out).sub(C); _a.addScaledVector(ax, -_a.dot(ax)); const l = _a.length(); if (l > 1e-6) _a.multiplyScalar(1 / l);
    const x = clamp(psi / Math.PI, 0, 1) * (s.lifts.length - 1), j = Math.min(s.lifts.length - 2, Math.floor(x)), L = Math.max(0, s.lifts[j] + (s.lifts[j + 1] - s.lifts[j]) * (x - j) - s.lifts[0] * (1 - x / (s.lifts.length - 1))); // the hang already clears the body at ψ = 0: starts exactly where it hangs
    return out.premultiply(_m1.makeTranslation(_a.x * L, _a.y * L, _a.z * L));
  }
  // the long gun's hang on the back (chest space) for the body's current pose: from the chest (top swivel) and the lower anchor bone —
  // held by holsterR while slung, and the base of the sling transition so a draw starts / a put-away ends exactly where it hangs
  hangMatrix(out) {
    const fL = this.cur.L, ch = this.ch; if (!fL || !fL.F || !ch) return out.copy(this.W.holsterR.matrix); const F = fL.F, b = ch.bones, low = b[F.lowBone];
    b.chest.updateWorldMatrix(true, false); low.updateWorldMatrix(false, false);
    _a.copy(F.Db).applyMatrix4(low.matrixWorld).applyMatrix4(_m1.copy(b.chest.matrixWorld).invert()).sub(F.Uc).normalize();
    _q.setFromUnitVectors(F.d0, _a); const ang = 2 * Math.acos(Math.min(1, Math.abs(_q.w))); if (ang > 0.6) _q.slerp(_Q0, 1 - 0.6 / ang);
    return out.makeTranslation(F.Uc.x, F.Uc.y, F.Uc.z).multiply(_m2.makeRotationFromQuaternion(_q)).multiply(_m3.makeTranslation(-F.Uc.x, -F.Uc.y, -F.Uc.z)).multiply(F.M);
  }
  // where the support hand holds the strap on the chest while it pulls the gun round (chest space; the strap material under the
  // hand moves on round the ring with the gun: index advances with psi)
  strapGrab(psi, out) {
    const f = this.cur.L; if (!f || !f.path) return null; const p = f.path, i = f.grab + Math.round((psi / (Math.PI * 2)) * RING_NB); p.nodeP(i, out); p.nodeN(i, _b); out.addScaledVector(_b, 0.03);
    const ch = this.ch; out.applyMatrix4(ch.mesh.matrixWorld); ch.bones.chest.updateWorldMatrix(true, false); return out.applyMatrix4(_m1.copy(ch.bones.chest.matrixWorld).invert());
  }
  // after the character's pose (Game loop, after Player.update): keep the carried set honest, swing the holster clear of the
  // thigh, hang the rifle from the chest (top) and the hips (bottom), lay the strap along its live path
  late(dt, force = false) {
    const W = this.W, ch = W.P && W.P.ch; if (!ch) return; if (ch !== this.ch) { this.attach(ch); this.refresh(); return; }
    if (!force) { const p = this.pick(true), l = this.pick(false); if (p !== this.carryP || l !== this.carryL || this.longStowedAway() !== this.hideLong) { this.refresh(); return; } this.syncVisible(); }
    const b = ch.bones;
    const fP = this.cur.P; if (fP && fP.F && this.gP.visible && fP.F.thighPts.length) { // thigh push
      const F = fP.F; b.hips.updateWorldMatrix(true, false); b.thighR.updateWorldMatrix(false, false);
      _m1.copy(b.thighR.matrixWorld).invert().multiply(b.hips.matrixWorld); _n3.setFromMatrix4(_m1); _b.copy(F.n).applyMatrix3(_n3).normalize();
      let need = 0; const T = F.thighPts;
      for (let pi = 0; pi < F.probesH.length; pi++) { _a.copy(F.probesH[pi]).applyMatrix4(_m1); let pen = 0;
        for (let j = 0; j < T.length; j += 3) { _c.set(T[j] - _a.x, T[j + 1] - _a.y, T[j + 2] - _a.z); const d = _c.dot(_b); if (d + 0.006 <= pen) continue; _d.copy(_c).addScaledVector(_b, -d); if (_d.lengthSq() > 0.035 * 0.035) continue; pen = d + 0.006; }
        if (pen > 0) need = Math.max(need, pen / F.lever[pi]); }
      const tgt = Math.min(0.55, need); const k = force ? 1 : 1 - Math.exp(-(dt || 0.016) * (tgt > this.swing ? 30 : 7)); const prev = this.swing; this.swing += (tgt - this.swing) * k;
      if (force || Math.abs(this.swing - prev) > 1e-5) { _m2.makeTranslation(F.pivot.x, F.pivot.y, F.pivot.z).multiply(_m3.makeRotationAxis(F.axis, this.swing)).multiply(_m1.makeTranslation(-F.pivot.x, -F.pivot.y, -F.pivot.z)); this.gP.matrix.multiplyMatrices(_m2, F.M); this.gP.matrixWorldNeedsUpdate = true; }
    }
    const fL = this.cur.L; if (fL && fL.F && (this.slung || force)) { this.hangMatrix(W.holsterR.matrix); W.holsterR.matrixWorldNeedsUpdate = true; } // two-anchor rifle hang
    if (fL && fL.path && this.strapShown) { const p = fL.path; p.target = W.models[this.carryL]; p.slungNow = this.slung; if (!p.hooked || p.dirty) { ch.root.updateMatrixWorld(); p.update(p.target, p.slungNow); } p.dirty = true; } // the hook didn't run last frame (not rendered: off screen, first person, a sim step) → laid here so its tracking never skips frames // the strap: from swivel to swivel over the body, this frame's pose (laid by its render hook; here only where nothing renders it)
  }
}
const _Q0 = new THREE.Quaternion();
let _chN = 0; const chId = (ch) => String(ch._carryId || (ch._carryId = ++_chN));
