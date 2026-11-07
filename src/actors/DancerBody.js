// Club dancers (world/ClubCast.js): whole-body characters baked from the CC0 MakeHuman base mesh by
// tools/mh/bake-dancers.mjs — ONE continuous skin surface (head, face, neck, torso, arms with real hands and fingers,
// legs and feet) instead of the crowd's lofted torso + separate head. Each dancer has her own anatomy (figure, bust size and
// shape, waist, hips, face) and her own skeleton fitted to it: the crowd's 23 bones (so every shared animation system and
// the pole-dance IK drive her unchanged) + 30 finger bones + toe bones + two breast bones for secondary motion.
//
// Skin: a per-dancer 2048² albedo/roughness texture painted ONCE on the GPU at load (the body rendered in its own UV space;
// every texel is shaded from its true 3-D rest position, so lip lines, liner and blush are crisp rather than smeared over
// ~3 mm vertex spacing): tone variation, the darker knuckles / elbows / knees and lighter palms of brown skin, a touch of
// blood colour at the cheeks, nose and ears, make-up and nail polish. At render time the skin uses the protagonists'
// dual-quaternion skinning and subsurface term plus a procedural pore relief that fades out before it can alias.
// Eyebrows are individual hair strands lying on the brow skin (they follow the brow morphs); eyelashes are MakeHuman's.
import * as THREE from 'three';
import DATA from './dancerBodyData.js';
import { patchHeroMaterial } from './HeroRig.js';
import { buildEyeball, iblScale, HEAD_MORPHS } from './HeroHead.js';

export const DANCER_BONES = DATA.bones;
export const DANCER_MORPHS = DATA.morphNames;
const BI = Object.fromEntries(DANCER_BONES.map((n, i) => [n, i]));
const PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', armL: 'shL', foreL: 'armL', handL: 'foreL', shR: 'chest', armR: 'shR', foreR: 'armR', handR: 'foreR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR', skirtF: 'hips', skirtB: 'hips', skirtF2: 'skirtF', skirtB2: 'skirtB',
  toeL: 'footL', toeR: 'footR', breastL: 'chest', breastR: 'chest' };
for (const S of ['L', 'R']) for (const f of ['idx', 'mid', 'rng', 'pnk', 'thb']) { PARENT[f + 1 + S] = 'hand' + S; PARENT[f + 2 + S] = f + 1 + S; PARENT[f + 3 + S] = f + 2 + S; }
export const DANCER_PARENT = PARENT;
export const hasDancerBody = (id) => !!(id && DATA.dancers[id]);
export const dancerJoints = (id) => DATA.dancers[id].joints;
export const dancerLandmarks = (id) => DATA.dancers[id].L;

// ---------------------------------------------------------------- decoding
const dec = (s, T) => { const bin = atob(s); const n = bin.length; const u8 = new Uint8Array(n); for (let i = 0; i < n; i++) u8[i] = bin.charCodeAt(i); return new T(u8.buffer); };
let SH = null;
function shared() {
  if (SH) return SH;
  SH = { idx: DATA.idx.map((b) => dec(b, Uint16Array)), orig: dec(DATA.orig, Uint16Array), uv: dec(DATA.uv, Float32Array), ski: dec(DATA.skinIndex, Uint8Array), skw: dec(DATA.skinWeight, Uint8Array),
    masks: Object.fromEntries(Object.entries(DATA.masks).map(([k, v]) => [k, dec(v, Uint8Array)])),
    morphs: DATA.morphNames.map((n) => ({ i: dec(DATA.morphs[n].i, Uint16Array), d: dec(DATA.morphs[n].d, Int16Array) })) };
  const NR = DATA.verts; SH.part = new Uint8Array(NR); SH.idx.forEach((t, p) => { for (const i of t) SH.part[i] = p; });
  return SH;
}
export const dancerShared = () => shared();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

// per-dancer rest body (original-vertex domain): positions, smooth normals, region masks
const bodyCache = new Map();
export function dancerBody(id) {
  if (bodyCache.has(id)) return bodyCache.get(id);
  const S = shared(), D = DATA.dancers[id], NU = DATA.nu; const p16 = dec(D.pos, Int16Array); const P = new Float32Array(NU * 3); for (let i = 0; i < NU * 3; i++) P[i] = p16[i] * D.q;
  const N = new Float32Array(NU * 3);
  for (const t of S.idx) for (let k = 0; k < t.length; k += 3) { const a = S.orig[t[k]], b = S.orig[t[k + 1]], c = S.orig[t[k + 2]];
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2], vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const v of [a, b, c]) { N[v * 3] += nx; N[v * 3 + 1] += ny; N[v * 3 + 2] += nz; } }
  for (let i = 0; i < NU; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
  const J = D.joints; const W = (u, name) => { let w = 0; for (let k = 0; k < 4; k++) if (S.ski[u * 4 + k] === BI[name]) w += S.skw[u * 4 + k] / 255; return w; };
  // nails (fingers + toes) and palms / soles, from the fitted skeleton: a nail is the dorsal skin of the distal segment, out
  // towards the tip; the palm is the inner face of the hand and fingers (lighter in brown skin)
  const nail = new Float32Array(NU), palm = new Float32Array(NU);
  for (const Sd of ['L', 'R']) { const sx = Sd === 'L' ? 1 : -1;
    for (const f of ['idx', 'mid', 'rng', 'pnk', 'thb']) { const j2 = J[f + 2 + Sd], j3 = J[f + 3 + Sd]; const ax = [j3[0] - j2[0], j3[1] - j2[1], j3[2] - j2[2]]; const al = Math.hypot(...ax); ax[0] /= al; ax[1] /= al; ax[2] /= al;
      // dorsal direction: the back of the hand (outward) for the fingers; the thumb's nail faces forward-out
      let dor = f === 'thb' ? [sx * 0.55, 0, 0.83] : [sx, 0, 0]; const dd = dor[0] * ax[0] + dor[1] * ax[1] + dor[2] * ax[2]; dor = [dor[0] - ax[0] * dd, dor[1] - ax[1] * dd, dor[2] - ax[2] * dd]; const dl = Math.hypot(...dor); dor = dor.map((v) => v / dl);
      const ids = []; let tmax = 0; for (let u = 0; u < NU; u++) { if (W(u, f + 3 + Sd) < 0.5) continue; const t = (P[u * 3] - j3[0]) * ax[0] + (P[u * 3 + 1] - j3[1]) * ax[1] + (P[u * 3 + 2] - j3[2]) * ax[2]; ids.push([u, t]); tmax = Math.max(tmax, t); }
      for (const [u, t] of ids) { const nd = N[u * 3] * dor[0] + N[u * 3 + 1] * dor[1] + N[u * 3 + 2] * dor[2]; nail[u] = sstep(0.3, 0.55, t / tmax) * sstep(0.35, 0.62, nd) * sstep(1.0, 0.9, t / tmax); } }
    for (let u = 0; u < NU; u++) { let hw = W(u, 'hand' + Sd); for (const f of ['idx', 'mid', 'rng', 'pnk']) for (let j = 1; j <= 3; j++) hw += W(u, f + j + Sd); if (hw < 0.4) continue; palm[u] = Math.max(palm[u], sstep(0.1, 0.55, -N[u * 3] * sx) * Math.min(1, hw)); }
    // toenails: top of each toe near its tip (toes are flexed up by the heel pitch in the rest pose)
    const tz = []; for (let u = 0; u < NU; u++) if (W(u, 'toe' + Sd) > 0.6) tz.push(u); let zt = -1e9; for (const u of tz) zt = Math.max(zt, P[u * 3 + 2] - P[u * 3 + 1] * 0.62);
    for (const u of tz) { const fwd = P[u * 3 + 2] - P[u * 3 + 1] * 0.62; const up = N[u * 3 + 1] * 0.84 - N[u * 3 + 2] * 0.52; nail[u] = Math.max(nail[u], sstep(zt - 0.03, zt - 0.012, fwd) * sstep(0.4, 0.7, up)); }
    for (let u = 0; u < NU; u++) { if (W(u, 'foot' + Sd) + W(u, 'toe' + Sd) < 0.6) continue; palm[u] = Math.max(palm[u], sstep(-0.3, -0.75, N[u * 3 + 1])); } }
  const B = { id, P, N, J, L: D.L, nail, palm, W, morphK: D.morphK };
  bodyCache.set(id, B); return B;
}

// ---------------------------------------------------------------- geometry
const geoCache = new Map();
// eyebrow path per dancer (x from the inner head outward, relative to the eye centre; y above it; th = thickness)
const BROWS = {
  ruby: { arch: 0.0042, y0: 0.0118, th: [0.0058, 0.0052, 0.0038, 0.0016], len: 0.044 },
  jade: { arch: 0.0026, y0: 0.0112, th: [0.0062, 0.0056, 0.0042, 0.0018], len: 0.045 },
  opal: { arch: 0.0056, y0: 0.0122, th: [0.0048, 0.0042, 0.003, 0.0013], len: 0.043 },
  saffron: { arch: 0.0038, y0: 0.0112, th: [0.0068, 0.006, 0.0045, 0.002], len: 0.045 },
};
const tab = (T, u) => { if (u <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (u <= T[i][0]) { const a = T[i - 1], b = T[i]; return a[1] + (b[1] - a[1]) * (u - a[0]) / (b[0] - a[0]); } return T[T.length - 1][1]; };
export function browPath(id, t) { const b = BROWS[id] || BROWS.ruby; const L = DATA.dancers[id].L; const ex = Math.abs(L.eyeL[0]);
  return { x: ex - 0.0175 + t * b.len, y: L.eyeL[1] + b.y0 + b.arch * tab([[0, 0], [0.35, 0.72], [0.64, 1], [1, 0.45]], t), th: tab([[0, b.th[0]], [0.3, b.th[1]], [0.65, b.th[2]], [1, b.th[3]]], t), z: L.eyeL[2] }; }

export function dancerGeometry(id, hairColor = '#120c08') {
  const key = id + '|' + hairColor; if (geoCache.has(key)) return geoCache.get(key);
  const S = shared(), Bd = dancerBody(id), NR = DATA.verts; const { P, N } = Bd; const o = S.orig;
  const pos = [], nor = [], uv = [], si = [], sw = [], mA = [], mB = [], skin = [], col = []; const anchor = [];
  for (let r = 0; r < NR; r++) { const u = o[r];
    pos.push(P[u * 3], P[u * 3 + 1], P[u * 3 + 2]); nor.push(N[u * 3], N[u * 3 + 1], N[u * 3 + 2]); uv.push(S.uv[r * 2], S.uv[r * 2 + 1]);
    for (let k = 0; k < 4; k++) { si.push(S.ski[u * 4 + k]); sw.push(S.skw[u * 4 + k] / 255); }
    const M = S.masks; mA.push(M.lips[u] / 255, M.lids[u] / 255, M.brows[u] / 255, M.cheeks[u] / 255); mB.push(M.nose[u] / 255, M.ears[u] / 255, Bd.nail[u], Bd.palm[u]);
    skin.push(S.part[r] === 0 ? 1 : 0); col.push(1, 1, 1); anchor.push(u); }
  // eyelashes: MakeHuman's lash cards; only the upper ones are kept (the lower ones read as a heavy dark rim at game distance)
  const lashT = []; { const t = S.idx[1], ey = Bd.L.eyeL[1]; for (let k = 0; k < t.length; k += 3) { const y = (P[o[t[k]] * 3 + 1] + P[o[t[k + 1]] * 3 + 1] + P[o[t[k + 2]] * 3 + 1]) / 3; if (y >= ey) lashT.push(t[k], t[k + 1], t[k + 2]); } }
  const groups = [[...S.idx[0]], lashT, [...S.idx[2], ...S.idx[3]], [...S.idx[4]], []];
  // ---- eyebrows: individual strands lying on the brow skin (ray-cast onto the face from the front)
  const face = []; for (const i of S.idx[0]) face.push(i); // render-vertex triangles of the skin
  const L = Bd.L; const GC = 0.004, grid = new Map(); const gk = (i, j) => i * 4096 + j;
  for (let t = 0; t < face.length; t += 3) { const a = o[face[t]], b = o[face[t + 1]], c = o[face[t + 2]]; if (P[a * 3 + 1] < L.eyeL[1] - 0.03 || P[a * 3 + 1] > L.eyeL[1] + 0.06 || P[a * 3 + 2] < L.eyeL[2] - 0.04) continue;
    const xs = [P[a * 3], P[b * 3], P[c * 3]], ys = [P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]];
    for (let i = Math.floor(Math.min(...xs) / GC); i <= Math.floor(Math.max(...xs) / GC); i++) for (let j = Math.floor(Math.min(...ys) / GC); j <= Math.floor(Math.max(...ys) / GC); j++) { const k2 = gk(i, j); let l = grid.get(k2); if (!l) grid.set(k2, (l = [])); l.push([a, b, c]); } }
  const surf = (x, y) => { let best = null; for (const [a, b, c] of grid.get(gk(Math.floor(x / GC), Math.floor(y / GC))) || []) {
      const A0 = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], B0 = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], C0 = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
      const v0 = [C0[0] - A0[0], C0[1] - A0[1]], v1 = [B0[0] - A0[0], B0[1] - A0[1]], v2 = [x - A0[0], y - A0[1]]; const d00 = v0[0] * v0[0] + v0[1] * v0[1], d01 = v0[0] * v1[0] + v0[1] * v1[1], d11 = v1[0] * v1[0] + v1[1] * v1[1], d20 = v2[0] * v0[0] + v2[1] * v0[1], d21 = v2[0] * v1[0] + v2[1] * v1[1];
      const den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-14) continue; const uu = (d11 * d20 - d01 * d21) / den, vv = (d00 * d21 - d01 * d20) / den; if (uu < -1e-4 || vv < -1e-4 || uu + vv > 1.0001) continue;
      const z = A0[2] + uu * (C0[2] - A0[2]) + vv * (B0[2] - A0[2]); if (best && z <= best.p[2]) continue; const w = [1 - uu - vv, vv, uu];
      const n = [0, 1, 2].map((k) => N[a * 3 + k] * w[0] + N[b * 3 + k] * w[1] + N[c * 3 + k] * w[2]); const nl = Math.hypot(...n);
      best = { p: [x, y, z], n: n.map((v) => v / nl), a: w[0] >= w[1] && w[0] >= w[2] ? a : w[1] >= w[2] ? b : c }; }
    return best; };
  const hc = new THREE.Color(hairColor); const browC = [hc.r * 1.25 + 0.01, hc.g * 1.2 + 0.008, hc.b * 1.15 + 0.006];
  const browTris = groups[4]; const firstBrow = pos.length / 3;
  for (const sx of [1, -1]) { const NS = 300; for (let j = 0; j < NS; j++) {
    const t = Math.pow(hash(j, 1, sx + 3), 0.9), b = hash(j, 2, sx + 3) - 0.5; const bp = browPath(id, t); const x = sx * bp.x, y = bp.y + b * bp.th;
    const s0 = surf(x, y); if (!s0) continue;
    const bp2 = browPath(id, Math.min(1, t + 0.05)), bp1 = browPath(id, Math.max(0, t - 0.05)); const tl = Math.hypot(bp2.x - bp1.x, bp2.y - bp1.y);
    const tan = [sx * (bp2.x - bp1.x) / tl, (bp2.y - bp1.y) / tl]; const k = sstep(0.04, 0.28, t);
    let dx = sx * 0.22 * (1 - k) + (tan[0]) * k, dy = 1 * (1 - k) + (tan[1] - b * 0.8) * k; const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl; // medial hairs grow up, the rest run out along the arch
    const len = (t < 0.15 ? 0.0048 : 0.0068) * (0.8 + 0.4 * hash(j, 3, sx + 3));
    const pts = [s0]; for (let q = 1; q <= 2; q++) { const s1 = surf(x + dx * len * q / 2, y + dy * len * q / 2); pts.push(s1 && Math.hypot(s1.p[0] - pts[q - 1].p[0], s1.p[1] - pts[q - 1].p[1], s1.p[2] - pts[q - 1].p[2]) < len * 0.9 ? s1 : pts[q - 1]); }
    if (Math.hypot(pts[2].p[0] - s0.p[0], pts[2].p[1] - s0.p[1]) < len * 0.25) continue;
    const lift = [0.0002, 0.00055, 0.00035], wid = [0.00026, 0.00017, 0.00006]; const shade = 0.72 + 0.5 * hash(j, 4, sx + 3); const base = pos.length / 3;
    for (let q = 0; q < 3; q++) { const Q = pts[q]; const nx = q < 2 ? pts[q + 1] : Q, pv = q < 2 ? Q : pts[q - 1]; let f = [nx.p[0] - pv.p[0], nx.p[1] - pv.p[1], nx.p[2] - pv.p[2]]; const fl = Math.hypot(...f) || 1; f = f.map((v) => v / fl);
      let sd = [Q.n[1] * f[2] - Q.n[2] * f[1], Q.n[2] * f[0] - Q.n[0] * f[2], Q.n[0] * f[1] - Q.n[1] * f[0]]; const sl = Math.hypot(...sd) || 1; sd = sd.map((v) => v / sl);
      for (const sg of [-1, 1]) { pos.push(Q.p[0] + Q.n[0] * lift[q] + sd[0] * sg * wid[q], Q.p[1] + Q.n[1] * lift[q] + sd[1] * sg * wid[q], Q.p[2] + Q.n[2] * lift[q] + sd[2] * sg * wid[q]); nor.push(...Q.n); uv.push(0.001, 0.001);
        for (let kk = 0; kk < 4; kk++) { si.push(S.ski[s0.a * 4 + kk]); sw.push(S.skw[s0.a * 4 + kk] / 255); } mA.push(0, 0, 0, 0); mB.push(0, 0, 0, 0); skin.push(0); col.push(...browC.map((v) => v * shade * (q === 0 ? 0.8 : 1))); anchor.push(s0.a); } }
    for (let q = 0; q < 2; q++) { const a0 = base + q * 2; browTris.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2); } } }
  const NT = pos.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('aMaskA', new THREE.Float32BufferAttribute(mA, 4)); g.setAttribute('aMaskB', new THREE.Float32BufferAttribute(mB, 4)); g.setAttribute('aSkin', new THREE.Float32BufferAttribute(skin, 1)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const index = []; let start = 0; groups.forEach((t, m) => { for (const i of t) index.push(i); g.addGroup(start, t.length, m); start += t.length; });
  g.setIndex(index.length > 65535 || NT > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
  // facial-expression morphs (same names / order as the protagonists' heads, so the shared FaceRig drives them)
  const mk = Bd.morphK; g.morphAttributes.position = S.morphs.map(({ i, d }) => { const du = new Float32Array(DATA.nu * 3); for (let k = 0; k < i.length; k++) { du[i[k] * 3] = d[k * 3] * 2e-6 * mk; du[i[k] * 3 + 1] = d[k * 3 + 1] * 2e-6 * mk; du[i[k] * 3 + 2] = d[k * 3 + 2] * 2e-6 * mk; }
    const a = new Float32Array(NT * 3); for (let r = 0; r < NT; r++) { const u = anchor[r]; a[r * 3] = du[u * 3]; a[r * 3 + 1] = du[u * 3 + 1]; a[r * 3 + 2] = du[u * 3 + 2]; } return new THREE.Float32BufferAttribute(a, 3); });
  g.morphTargetsRelative = true;
  g.userData = { dancer: id, skinTris: S.idx[0].length, firstBrow, parts: DATA.parts };
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3);
  geoCache.set(key, g); return g;
}

// ---------------------------------------------------------------- skeleton
const bindInv = new Map();
export function makeDancerSkeleton(id) {
  const J = dancerJoints(id); const bones = DANCER_BONES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
  DANCER_BONES.forEach((n, i) => { const p = PARENT[n], jp = J[n]; if (p) { const pp = J[p]; bones[i].position.set(jp[0] - pp[0], jp[1] - pp[1], jp[2] - pp[2]); bones[BI[p]].add(bones[i]); } else bones[i].position.set(jp[0], jp[1], jp[2]); });
  bones[0].updateMatrixWorld(true);
  let inv = bindInv.get(id); if (!inv) { inv = bones.map((b) => new THREE.Matrix4().copy(b.matrixWorld).invert()); bindInv.set(id, inv); }
  return { bones, skeleton: new THREE.Skeleton(bones, inv) };
}

// heel fit in the convention of Character.heelFit (PoleDance stands her on it): the pole-dance code places the pelvis at
// hipY + (ankleH − 0.085·s), written for the crowd's ankle at 0.085·s — so the ankle lift is reported relative to that
export function dancerHeelFit(id, height) { const H = DATA.dancers[id].L.heel, J = dancerJoints(id); const s = height / 1.72;
  return { pitch: H.pitch, plat: H.plat, ball: H.ball.slice(), ankleH: H.ankleH - J.footL[1] + 0.085 * s, heelTop: H.heelTop, heelLen: H.heelLen, dir: H.dir, trueAnkleH: H.ankleH }; }

// ---------------------------------------------------------------- materials
// skin detail on top of the protagonist skin shading: roughness from the painted map's alpha, procedural pore relief
// (object-space, so it never swims; faded out with distance before it can alias)
const PORE_GLSL = `
float dpHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dpNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dpHash(i), dpHash(i + vec3(1, 0, 0)), f.x), mix(dpHash(i + vec3(0, 1, 0)), dpHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(dpHash(i + vec3(0, 0, 1)), dpHash(i + vec3(1, 0, 1)), f.x), mix(dpHash(i + vec3(0, 1, 1)), dpHash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`;
function skinDetail(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;' + PORE_GLSL)
    .replace('#include <metalnessmap_fragment>', `#ifdef USE_MAP
      roughnessFactor = mix(0.16, 0.82, sampledDiffuseColor.a); diffuseColor.a = opacity;
      #endif
      #include <metalnessmap_fragment>`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec3 q = vRest * 1150.0; float fw = length(fwidth(q)); float fade = 1.0 - smoothstep(0.35, 0.9, fw);
        if (fade > 0.0) {
          float h = (1.0 - dpNoise(q)) ; h = h * h * 0.65 + dpNoise(q * 2.7 + 3.1) * 0.35;
          float hh = (h + dpNoise(vRest * 240.0) * 0.5) * 0.00007 * fade;
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(hh), dhy = dFdy(hh);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2); normal = normalize(abs(det) * normal - grad); } }`);
}
export const DANCER_LOOK = {
  // skin (sRGB), lip colour, eyeshadow, blush, nail polish — strong, stage-make-up colours that suit each costume
  ruby: { skin: '#9a6142', lips: '#8a1424', shadow: '#5a2a28', liner: 0.85, blush: '#b2463c', nails: '#9a1020', gloss: 0.7 },
  jade: { skin: '#8a5434', lips: '#7a3a34', shadow: '#2e4a3c', liner: 0.7, blush: '#a5503c', nails: '#123a2c', gloss: 0.45 },
  opal: { skin: '#a36a4a', lips: '#9a3a5a', shadow: '#4a3260', liner: 0.9, blush: '#b8545a', nails: '#c8bed8', gloss: 0.8 },
  saffron: { skin: '#7e4b2e', lips: '#8a3a26', shadow: '#6a4220', liner: 0.75, blush: '#a04a30', nails: '#c8701a', gloss: 0.6 },
};
export function dancerMaterials(id, U) {
  const look = DANCER_LOOK[id] || DANCER_LOOK.ruby;
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.skin), roughness: 0.55, metalness: 0 });
  patchHeroMaterial(skin, 'body', U, skinDetail); iblScale(skin, 0.55, 1.0, 0.5);
  const kp = skin.customProgramCacheKey; skin.customProgramCacheKey = () => kp() + '|dancerSkin';
  // lash cards cut into individual lashes (u runs along the lid; MakeHuman's own lash texture is not used)
  const lash = new THREE.MeshStandardMaterial({ color: 0x0c0806, roughness: 0.5, metalness: 0, side: THREE.DoubleSide });
  lash.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vLashUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLashUv = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLashUv;').replace('#include <alphatest_fragment>', `{ float s = vLashUv.x * 1500.0; float j = fract(sin(floor(s) * 91.7) * 4375.5);
      if (abs(fract(s) - 0.5) > 0.16 + 0.1 * j) discard; }`); };
  lash.customProgramCacheKey = () => 'dancerLash';
  const teeth = new THREE.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.32, metalness: 0 });
  const tongue = new THREE.MeshStandardMaterial({ color: 0x8a3a3a, roughness: 0.45, metalness: 0 });
  const brow = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  iblScale(lash, 0.28, 0.9, 0.6); iblScale(brow, 0.28, 0.9, 0.6);
  return [skin, lash, teeth, tongue, brow];
}
export function attachDancerEyes(bones, id) {
  const L = dancerLandmarks(id), jh = dancerJoints(id).head; const hb = bones.head;
  return [L.eyeL, L.eyeR].map((e) => { const piv = new THREE.Object3D(); piv.position.set(e[0] - jh[0], e[1] - jh[1], e[2] - jh[2]); piv.add(buildEyeball(L.eyeRad * 0.985)); hb.add(piv); return piv; });
}
export const morphsMatchHeroes = () => DANCER_MORPHS.length === HEAD_MORPHS.length && DANCER_MORPHS.every((n, i) => n === HEAD_MORPHS[i]);

// ---------------------------------------------------------------- one-time GPU skin paint
const PAINT_VS = `
attribute vec4 aMaskA; attribute vec4 aMaskB; uniform vec2 uOff;
varying vec3 vP; varying vec3 vN; varying vec4 vA; varying vec4 vB;
void main() { vP = position; vN = normal; vA = aMaskA; vB = aMaskB; gl_Position = vec4(uv * 2.0 - 1.0 + uOff, 0.0, 1.0); }`;
const PAINT_FS = `
precision highp float;
varying vec3 vP; varying vec3 vN; varying vec4 vA; varying vec4 vB;
uniform vec3 uSkin, uLips, uShadow, uBlush, uNails, uHair; uniform float uLiner, uGloss;
uniform vec3 uEyeL, uEyeR; uniform float uEyeRad; uniform vec3 uKneeL, uKneeR, uElbL, uElbR, uMouth;
uniform vec4 uBrow[16];
${PORE_GLSL}
float fbm(vec3 p) { return dpNoise(p) * 0.5 + dpNoise(p * 2.03 + 1.7) * 0.25 + dpNoise(p * 4.1 + 3.3) * 0.125 + dpNoise(p * 8.3 + 5.1) * 0.0625; }
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec3 c = uSkin; float rough = 0.56;
  float lips = vA.x, lids = vA.y, brows = vA.z, cheeks = vA.w, nose = vB.x, ears = vB.y, nail = vB.z, palm = vB.w;
  // tone variation: broad warmth / depth changes, finer mottling, a few small moles
  float n1 = fbm(vP * 6.0), n2 = fbm(vP * 38.0), n3 = dpNoise(vP * 160.0);
  c *= 1.0 + (n1 - 0.5) * 0.10 + (n2 - 0.5) * 0.06 + (n3 - 0.5) * 0.025;
  c = mix(c, c * vec3(1.03, 0.98, 0.95), smoothstep(0.45, 0.75, n1));
  float mole = smoothstep(0.985, 0.995, dpHash(floor(vP * 260.0) + 0.5)) * smoothstep(0.6, 0.2, length(fract(vP * 260.0) - 0.5) * 2.0);
  c = mix(c, c * vec3(0.55, 0.45, 0.4), mole * 0.7 * (1.0 - lips));
  // brown skin: darker knuckles / elbows / knees, lighter palms and soles, darker periorbital skin
  float kn = exp(-pow(distance(vP, uKneeL) / 0.045, 2.0)) + exp(-pow(distance(vP, uKneeR) / 0.045, 2.0));
  float el = exp(-pow(distance(vP, uElbL) / 0.035, 2.0)) + exp(-pow(distance(vP, uElbR) / 0.035, 2.0));
  c *= 1.0 - 0.13 * clamp(kn, 0.0, 1.0) - 0.1 * clamp(el, 0.0, 1.0);
  c = mix(c, c * vec3(1.32, 1.22, 1.15) + vec3(0.03, 0.01, 0.0), palm * 0.85);
  for (int k = 0; k < 2; k++) { vec3 e = k == 0 ? uEyeL : uEyeR; float d = length((vP.xy - e.xy) * vec2(1.0, 1.3)) / uEyeRad; if (vP.z > e.z - 0.01) c *= 1.0 - 0.1 * smoothstep(2.2, 1.0, d); }
  // blood colour: cheeks, nose tip, ears, finger tips
  c *= mix(vec3(1.0), vec3(1.06, 0.97, 0.95), clamp(nose * 0.7 + ears * 0.6, 0.0, 1.0));
  // make-up: blush on the cheek bones, eyeshadow on the upper lids fading up, liner along the upper lash line with a small wing
  c = mix(c, c * 0.55 + uBlush * 0.45, cheeks * 0.32);
  for (int k = 0; k < 2; k++) { vec3 e = k == 0 ? uEyeL : uEyeR; float sx = k == 0 ? 1.0 : -1.0; vec2 q = vec2((vP.x - e.x) * sx, vP.y - e.y) / uEyeRad;
    if (vP.z > e.z - 0.004) {
      float upper = smoothstep(-0.15, 0.25, q.y); float sh = lids * upper * smoothstep(1.9, 1.0, q.y);
      c = mix(c, uShadow, sh * 0.5); rough = mix(rough, 0.5, sh);
      float lid = length(q * vec2(0.85, 1.85)); float ln = smoothstep(1.2, 1.08, lid) * smoothstep(0.98, 1.05, lid) * smoothstep(0.12, 0.4, q.y);
      float wing = smoothstep(0.035, 0.0, abs(q.y - 0.18 - (q.x - 0.9) * 0.55)) * smoothstep(0.75, 0.95, q.x) * smoothstep(1.5, 1.25, q.x);
      c = mix(c, vec3(0.02, 0.012, 0.01), clamp(ln + wing, 0.0, 1.0) * uLiner * 0.8); } }
  // brow skin under the strands: a faint fill so the brow reads as a shape, not a sparse scatter of hairs
  for (int k = 0; k < 2; k++) { float sx = k == 0 ? 1.0 : -1.0; if (vP.z < uEyeL.z - 0.03) continue; float x = vP.x * sx; float best = 9.0;
    for (int i = 0; i < 15; i++) { vec4 a = uBrow[i], b = uBrow[i + 1]; vec2 ab = b.xy - a.xy; float t = clamp(dot(vec2(x, vP.y) - a.xy, ab) / dot(ab, ab), 0.0, 1.0); vec2 pp = a.xy + ab * t; float th = mix(a.z, b.z, t); best = min(best, length(vec2(x, vP.y) - pp) / max(th * 0.5, 1e-4)); }
    c = mix(c, uHair, smoothstep(1.05, 0.55, best) * 0.42); }
  // lips: colour with a crisp vermilion border, darker upper lip and inner line, glossy
  float lm = smoothstep(0.4, 0.56, lips); vec3 lc = mix(uLips, uLips * 0.8, step(uMouth.y, vP.y) * 0.6);
  lc *= 0.9 + 0.2 * dpNoise(vP * vec3(900.0, 120.0, 900.0));
  float inner = smoothstep(0.004, 0.0015, abs(vP.y - uMouth.y)) * lm; c = mix(c, lc, lm); c *= 1.0 - inner * 0.45;
  rough = mix(rough, mix(0.42, 0.18, uGloss), lm);
  // nails: polish
  float nm = smoothstep(0.25, 0.6, nail); c = mix(c, uNails, nm); rough = mix(rough, 0.12, nm);
  // T-zone a little glossier, the rest matte
  rough *= 1.0 - 0.1 * nose;
  gl_FragColor = vec4(max(c, vec3(0.0)), clamp((rough - 0.16) / 0.66, 0.0, 1.0));
}`;
const PAINT = []; // queued characters
export function queueDancerPaint(ch) { PAINT.push(ch); }
export const dancerPaintPending = () => PAINT.length > 0;
const lin = (hex) => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); }; // THREE.Color(hex) is already linear
export function paintDancerSkin(renderer, ch, size = 2048) {
  const id = ch.spec.dancerBody; const geo = ch.mesh.geometry; const look = DANCER_LOOK[id] || DANCER_LOOK.ruby; const J = dancerJoints(id), L = dancerLandmarks(id);
  const pg = new THREE.BufferGeometry(); for (const a of ['position', 'normal', 'uv', 'aMaskA', 'aMaskB']) pg.setAttribute(a, geo.attributes[a]);
  pg.setIndex(new THREE.BufferAttribute(geo.index.array.slice(0, geo.userData.skinTris), 1));
  const brow = []; for (let i = 0; i < 16; i++) { const b = browPath(id, i / 15); brow.push(new THREE.Vector4(b.x, b.y, b.th, 0)); }
  const kneeOf = (S) => { const s = J['shin' + S]; return new THREE.Vector3(s[0], s[1], s[2] + 0.045); }; const elbOf = (S) => { const f = J['fore' + S]; return new THREE.Vector3(f[0], f[1], f[2] - 0.035); };
  let my = 0, mn = 0; { const P = geo.attributes.position, A = geo.attributes.aMaskA; for (let i = 0; i < P.count; i++) if (A.getX(i) > 0.5) { my += P.getY(i); mn++; } my /= Math.max(1, mn); }
  const U = { uSkin: { value: lin(look.skin) }, uLips: { value: lin(look.lips) }, uShadow: { value: lin(look.shadow) }, uBlush: { value: lin(look.blush) }, uNails: { value: lin(look.nails) }, uHair: { value: lin(ch.spec.hairColor || '#120c08') },
    uLiner: { value: look.liner }, uGloss: { value: look.gloss }, uEyeL: { value: new THREE.Vector3(...L.eyeL) }, uEyeR: { value: new THREE.Vector3(...L.eyeR) }, uEyeRad: { value: L.eyeRad },
    uKneeL: { value: kneeOf('L') }, uKneeR: { value: kneeOf('R') }, uElbL: { value: elbOf('L') }, uElbR: { value: elbOf('R') }, uMouth: { value: new THREE.Vector3(0, my, 0) }, uBrow: { value: brow }, uOff: { value: new THREE.Vector2() } };
  const mat = new THREE.ShaderMaterial({ vertexShader: PAINT_VS, fragmentShader: PAINT_FS, uniforms: U, side: THREE.DoubleSide, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  const mesh = new THREE.Mesh(pg, mat); mesh.frustumCulled = false; const scene = new THREE.Scene(); scene.add(mesh); const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const rt = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.anisotropy = 8;
  const prevRT = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevAuto = renderer.autoClear;
  renderer.setRenderTarget(rt); renderer.setClearColor(new THREE.Color(look.skin), 0.6); renderer.clear(true, false, false); renderer.autoClear = false;
  const px = 2 / size; for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2], [2, -2], [-2, 2], [0, 0]]) { U.uOff.value.set(dx * px, dy * px); renderer.render(scene, cam); } // a 3-texel gutter round every UV island, then the islands
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevClear, prevA); renderer.autoClear = prevAuto;
  pg.dispose(); mat.dispose();
  const skin = ch.mesh.material[0]; skin.map = rt.texture; skin.color.set(0xffffff); skin.needsUpdate = true; ch.dancerRT = rt;
  return rt;
}
// one character per frame (the club calls this from its update)
export function flushDancerPaint(renderer) { const ch = PAINT.shift(); if (!ch || !renderer || !ch.mesh || ch.disposed) return; paintDancerSkin(renderer, ch); }
