// Procedural skinned humans: one SkinnedMesh per person (body + head groups), 23-bone skeleton (70 for the three
// protagonists: fingers, twist, toe and secondary-motion bones — see HeroRig.js),
// Sri Lankan everyday clothing and a procedural animation layer (locomotion, idles, gestures, reactions).
import * as THREE from 'three';
import { LIVE } from './Bodies.js';
import { applySeatPose, seatLocal } from './Seating.js';
import { TEX, faceAtlas, FACE_FRAMES } from '../gfx/Textures.js';
import { RNG } from '../core/rng.js';
import { makeAppearance, FACE_VARIANTS } from './Appearance.js';
import { lerp, clamp, damp } from '../core/math.js';
import { HERO_EXTRA, HERO_PARENT, heroJoints, fingerLayout, HeroRig, heroUniforms, patchHeroMaterial, faceNormals } from './HeroRig.js';
import { hasHeroHead, heroHeadFit, buildHeroHead, headMaterials, iblScale, buildEyeball, EXPR_MORPHS, morphIndex, HEAD_MORPHS } from './HeroHead.js';

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'skirtF', 'skirtB', 'skirtF2', 'skirtB2'];
const B = Object.fromEntries([...BONES, ...HERO_EXTRA].map((n, i) => [n, i])); // protagonist-only bones are appended after the shared 23, so crowd indices are unchanged
const PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', armL: 'shL', foreL: 'armL', handL: 'foreL', shR: 'chest', armR: 'shR', foreR: 'armR', handR: 'foreR', thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR', skirtF: 'hips', skirtB: 'hips', skirtF2: 'skirtF', skirtB2: 'skirtB' };

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const smooth01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
// atlas regions for fabric patterns: 0 plain weave, 1 saree, 2 batik, 3 plaid
const REGION = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]];

// Adult female bust profile across the front of a torso ring (ca = cos of the ring angle, i.e. normalised x; front = sa > 0):
// two soft volumes at about ±45 % of the half-width, bridged by the garment in the middle (clothed, no cleavage detail)
const bustShape = (ca, sa) => (sa <= 0 ? 0 : Math.sqrt(sa) * (0.75 * (Math.exp(-(((ca - 0.45) / 0.28) ** 2)) + Math.exp(-(((ca + 0.45) / 0.28) ** 2))) + 0.55 * Math.exp(-((ca / 0.5) ** 2))));
const frontOf = (r, ca, sa) => (sa > 0 ? sa * (r.fz || 0) + (r.bust ? r.bust * bustShape(ca, sa) : 0) : sa * (r.bz || 0));
const ringPt = (r, a) => { const ca = Math.cos(a), sa = Math.sin(a); return [r.c[0] + ca * r.rx, r.c[1], r.c[2] + sa * r.rz + frontOf(r, ca, sa)]; };
// surface normal from the actual shaped surface (ring tangent × vertical tangent through the neighbouring rings)
function shapedNormal(rings, ri, a) {
  const r = rings[ri], e = 0.02; const p0 = ringPt(r, a - e), p1 = ringPt(r, a + e);
  const rp = rings[Math.max(0, ri - 1)], rn = rings[Math.min(rings.length - 1, ri + 1)]; const q0 = ringPt(rp, a), q1 = ringPt(rn, a);
  const ta = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), ty = new THREE.Vector3(q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]);
  if (ty.lengthSq() < 1e-10) ty.set(0, 1, 0);
  const n = new THREE.Vector3().crossVectors(ta, ty).normalize(); if (n.x * Math.cos(a) + n.z * Math.sin(a) < 0) n.negate(); return n;
}
class SkinBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; this.headIdx = []; this.hairIdx = []; }
  get n() { return this.pos.length / 3; }
  v(p, nrm, c, uv, w) { this.pos.push(p[0], p[1], p[2]); this.nor.push(nrm[0], nrm[1], nrm[2]); this.col.push(c[0], c[1], c[2]); this.uv.push(uv[0], uv[1]); const s = [0, 0, 0, 0], ww = [0, 0, 0, 0]; w.slice(0, 4).forEach(([b, x], i) => { s[i] = b; ww[i] = x; }); const t = ww[0] + ww[1] + ww[2] + ww[3] || 1; this.si.push(...s); this.sw.push(ww[0] / t, ww[1] / t, ww[2] / t, ww[3] / t); return this.n - 1; }
  // Loft of elliptical rings. rings: [{c:[x,y,z], rx, rz, w:[[bone,weight]..], col, fz?(front bulge)}]
  loft(rings, seg = 12, { region = 0, uvRep = 1, capStart = false, capEnd = false, colFn = null, target = this.idx } = {}) {
    if (!colFn) { const out = []; rings.forEach((r, i) => { const nx = rings[i + 1]; out.push(r); if (nx && (r.col[0] !== nx.col[0] || r.col[1] !== nx.col[1] || r.col[2] !== nx.col[2])) { const m = (t, col) => ({ ...r, c: r.c.map((v, k) => lerp(v, nx.c[k], t)), rx: lerp(r.rx, nx.rx, t), rz: lerp(r.rz, nx.rz, t), col }); out.push(m(0.5, r.col), m(0.505, nx.col)); } }); rings = out; }
    const base = this.n; const [ru, rv] = REGION[region];
    rings.forEach((r, ri) => {
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const front = frontOf(r, ca, sa);
        const x = r.c[0] + ca * r.rx, z = r.c[2] + sa * r.rz + front, y = r.c[1];
        let nrm = new THREE.Vector3(ca / r.rx, 0, sa / (r.rz + Math.abs(front) * 0.5)).normalize();
        if (r.bust || (rings[ri - 1] && rings[ri - 1].bust) || (rings[ri + 1] && rings[ri + 1].bust)) nrm = shapedNormal(rings, ri, a);
        const col = colFn ? colFn(ri, a, r) : r.col;
        this.v([x, y, z], [nrm.x, nrm.y, nrm.z], col, [ru + ((k / seg) * uvRep % 1) * 0.5 * 0.999, rv + (ri / Math.max(1, rings.length - 1)) * 0.5 * 0.999], typeof r.w === 'function' ? r.w(ca, sa) : r.w); /* r.w may be per-vertex: (cos, sin) of the ring angle */
      }
    });
    const W = seg + 1;
    const down = rings[rings.length - 1].c[1] < rings[0].c[1]; // rings built top→bottom (arms, legs, skirts) need the opposite winding
    for (let ri = 0; ri < rings.length - 1; ri++) for (let k = 0; k < seg; k++) { const a = base + ri * W + k, b = a + 1, c = a + W, d = c + 1; if (down) target.push(a, b, c, b, d, c); else target.push(a, c, b, b, c, d); }
    const cap = (ri, up) => { const r = rings[ri]; const ctr = this.v(r.c, [0, up ? 1 : -1, 0], colFn ? colFn(ri, 0, r) : r.col, [ru, rv], typeof r.w === 'function' ? r.w(0, 0) : r.w); for (let k = 0; k < seg; k++) { const a = base + ri * W + k; if (up !== down) target.push(ctr, a + 1, a); else target.push(ctr, a, a + 1); } };
    if (capStart) cap(0, false); if (capEnd) cap(rings.length - 1, true);
  }
  ellipsoid(c, rx, ry, rz, w, col, { lat = 10, lon = 14, p0 = 0, p1 = Math.PI, faceUV = false, target = this.idx, region = 0, bumpFn = null } = {}) {
    const base = this.n; const [ru, rv] = REGION[region];
    for (let i = 0; i <= lat; i++) {
      const ph = p0 + (p1 - p0) * (i / lat);
      for (let k = 0; k <= lon; k++) {
        const th = (k / lon) * Math.PI * 2; // th = 0 at +x, PI/2 at +z (front)
        const sx = Math.sin(ph) * Math.cos(th), sy = Math.cos(ph), sz = Math.sin(ph) * Math.sin(th);
        let b = bumpFn ? bumpFn(sx, sy, sz) : 1;
        const p = [c[0] + sx * rx * b, c[1] + sy * ry * b, c[2] + sz * rz * b];
        const nrm = new THREE.Vector3(sx / rx, sy / ry, sz / rz).normalize();
        // face texture: front (+z) at u = 0.75 → u = 1 - th/(2π) + 0.0 so th=π/2 maps to 0.75
        const uv = faceUV ? [0.75 + (0.25 - k / lon) * 0.7, 1 - ph / Math.PI] : [ru + (k / lon) * 0.499, rv + (i / lat) * 0.499];
        this.v(p, [nrm.x, nrm.y, nrm.z], typeof col === 'function' ? col(sx, sy, sz) : col, uv, typeof w === 'function' ? w(sy, sx, sz) : w);
      }
    }
    const W = lon + 1;
    for (let i = 0; i < lat; i++) for (let k = 0; k < lon; k++) { const a = base + i * W + k, b = a + 1, cc = a + W, d = cc + 1; target.push(a, b, cc, b, d, cc); }
  }
  // closed parametric surface fn(u, v) → [x, y, z] (u ∈ [0,1] along, v ∈ [0,1] around); normals from the surface itself,
  // oriented away from ctr(u); winding chosen per quad so it always faces along the normal
  param(Nu, Nv, fn, wFn, colFn, ctr) {
    const base = this.n, e = 1e-3; const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; const crs3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    for (let i = 0; i <= Nu; i++) { const u = i / Nu; for (let j = 0; j <= Nv; j++) { const v = j / Nv; const p = fn(u, v); const uu = clamp(u, 0.012, 0.988);
      let n = crs3(sub3(fn(uu + e, v), fn(uu - e, v)), sub3(fn(uu, v + e), fn(uu, v - e))); const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((x) => x / l);
      const c = ctr(clamp(u, 0.15, 0.85)); /* end rings collapse onto the axis: orient them against an interior point */ if ((p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1] + (p[2] - c[2]) * n[2] < 0) n = n.map((x) => -x);
      this.v(p, n, colFn(u, v, p), [0.01, 0.51], wFn(p)); } }
    const W = Nv + 1, P = this.pos, N = this.nor;
    for (let i = 0; i < Nu; i++) for (let j = 0; j < Nv; j++) { const a = base + i * W + j, b = a + 1, c = a + W, d = c + 1;
      const f = crs3(sub3([P[c * 3], P[c * 3 + 1], P[c * 3 + 2]], [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]]), sub3([P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]]));
      const q = (N[a * 3] + N[d * 3]) * f[0] + (N[a * 3 + 1] + N[d * 3 + 1]) * f[1] + (N[a * 3 + 2] + N[d * 3 + 2]) * f[2];
      if (q >= 0) this.idx.push(a, c, b, b, c, d); else this.idx.push(a, b, c, b, d, c); }
  }
  boxPart(c, sx, sy, sz, w, col, target = this.idx) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2; const F = [[[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]], [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]], [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]], [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]], [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]], [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]]];
    for (const [n, q] of F) { const i = q.map((p) => this.v([c[0] + p[0], c[1] + p[1], c[2] + p[2]], n, col, [0.01, 0.51], w)); target.push(i[0], i[1], i[2], i[0], i[2], i[3]); }
  }
  // double-sided cloth panel: P[r][c] points, N[r][c] outward normals, Wr[r] skin weights per row (rows hang downwards)
  grid(P, N, Wr, col, colBack) {
    const R = P.length, Cn = P[0].length; const a0 = P[0][0], a1 = P[1][0], b0 = P[0][1]; const n0 = N[0][0];
    const cx = (a1[1] - a0[1]) * (b0[2] - a0[2]) - (a1[2] - a0[2]) * (b0[1] - a0[1]), cy = (a1[2] - a0[2]) * (b0[0] - a0[0]) - (a1[0] - a0[0]) * (b0[2] - a0[2]), cz = (a1[0] - a0[0]) * (b0[1] - a0[1]) - (a1[1] - a0[1]) * (b0[0] - a0[0]);
    const flip = cx * n0[0] + cy * n0[1] + cz * n0[2] < 0;
    for (const side of [1, -1]) { const base = this.n;
      for (let r = 0; r < R; r++) for (let c = 0; c < Cn; c++) { const n = N[r][c]; const l = Math.hypot(n[0], n[1], n[2]) || 1; const q = P[r][c]; const o = side > 0 ? 0 : -0.0015; this.v([q[0] + n[0] / l * o, q[1] + n[1] / l * o, q[2] + n[2] / l * o], [side * n[0] / l, side * n[1] / l, side * n[2] / l], side > 0 ? col : colBack, [0.01, 0.51], Array.isArray(Wr[r][0][0]) ? Wr[r][c] : Wr[r]); }
      for (let r = 0; r < R - 1; r++) for (let c = 0; c < Cn - 1; c++) { const a = base + r * Cn + c, b = a + 1, cc = a + Cn, d = cc + 1; if ((side > 0) !== flip) this.idx.push(a, cc, b, b, cc, d); else this.idx.push(a, b, cc, b, d, cc); } }
  }
  // flat strip following a path of points (for saree pallu, shawls, ties)
  strip(path, width, normalFn, w, col, region = 1) {
    const base = this.n; const [ru, rv] = REGION[region];
    path.forEach((p, i) => {
      const nx = p.side; for (const s of [-1, 1]) this.v([p.c[0] + nx[0] * s * width / 2, p.c[1] + nx[1] * s * width / 2, p.c[2] + nx[2] * s * width / 2], normalFn(p), col, [ru + (s > 0 ? 0.49 : 0.01), rv + (i / (path.length - 1)) * 0.49], p.w || w);
    });
    for (let i = 0; i < path.length - 1; i++) { const a = base + i * 2; this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex([...this.idx, ...this.headIdx, ...this.hairIdx]); g.addGroup(0, this.idx.length, 0); g.addGroup(this.idx.length, this.headIdx.length, 1); g.addGroup(this.idx.length + this.headIdx.length, this.hairIdx.length, 2);
    g.computeBoundingSphere(); g.boundingSphere.radius = 1.4; g.boundingSphere.center.set(0, 0.9, 0);
    return g;
  }
}

// ------------------------------------------------------------------ joints (rest pose, metres) for height 1.0 scale applied later
function joints(sp) {
  const H = sp.height, f = sp.sex === 'f', s = H / 1.72; const wide = sp.build;
  const j = {
    hips: [0, 0.95 * s, 0], spine: [0, 1.08 * s, 0], chest: [0, 1.25 * s, 0], neck: [0, 1.46 * s, 0], head: [0, 1.55 * s, 0.01 * s],
    shL: [0.07 * s, 1.41 * s, 0], armL: [(f ? 0.17 : 0.19) * s * wide, 1.40 * s, 0], foreL: [(f ? 0.2 : 0.225) * s * wide, 1.12 * s, -0.01 * s], handL: [(f ? 0.215 : 0.24) * s * wide, 0.87 * s, 0.0],
    thighL: [0.095 * s * wide, 0.93 * s, 0], shinL: [0.1 * s * wide, 0.5 * s, 0.005 * s], footL: [0.1 * s * wide, 0.085 * s, -0.01 * s],
  };
  for (const k of ['shL', 'armL', 'foreL', 'handL', 'thighL', 'shinL', 'footL']) { const r = k.replace('L', 'R'); j[r] = [-j[k][0], j[k][1], j[k][2]]; }
  // garment hinges at hip-joint height ON the front / back cloth surface (a panel hangs from the waistband, so rotating it
  // swings the cloth forward / back instead of levering it up around the body axis) — see Animator.driveSkirt
  j.skirtF = [0, 0.93 * s, 0.12 * wide]; j.skirtB = [0, 0.93 * s, -0.12 * wide];
  j.skirtF2 = [0, 0.5 * s, 0.15 * wide]; j.skirtB2 = [0, 0.5 * s, -0.15 * wide]; // knee-line hinges: the lower panels bend to follow the shins
  return j;
}

// ------------------------------------------------------------------ outfit-driven geometry
// ---- protagonist footwear: a real shoe last (heel counter, waist, ball, toe box, toe spring) on a bevelled sole.
// kinds: 'sneaker' (Dineth: canvas/leather trainer, cupsole), 'oxford' (David: leather lace-up, stacked heel, toe-cap seam),
// 'boot' (Shashika: tactical boot with lug sole; the shaft is the existing boot loft above it).
const _ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const _tab = (T, u) => { if (u <= T[0][0]) return T[0][1]; for (let i = 1; i < T.length; i++) if (u <= T[i][0]) { const a = T[i - 1], b = T[i]; return lerp(a[1], b[1], (u - a[0]) / (b[0] - a[0])); } return T[T.length - 1][1]; };
const _sp = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);
export function heroShoe(sb, ft, side, sp, W1, W2, shoe) {
  const kind = sp.boots ? 'boot' : sp.sole ? 'sneaker' : 'oxford';
  const L = kind === 'boot' ? 0.276 : kind === 'sneaker' ? 0.272 : 0.268, z0 = 0.046 - L / 2 - 0.004;
  const med = -Math.sign(ft[0]) || 1; // towards the body centre (big-toe side)
  const cap = (u) => Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), u > 0.5 ? 3.2 : 6))); // rounder toe than heel
  const wk = kind === 'boot' ? 1.07 : kind === 'sneaker' ? 1.04 : 0.98;
  const halfW = (u) => _tab([[0, 0.031], [0.18, 0.036], [0.35, 0.037], [0.5, 0.04], [0.7, 0.046], [0.85, 0.045], [1, 0.035]], u) * wk;
  const Ht = { oxford: [[0, 0.064], [0.12, 0.072], [0.3, 0.078], [0.45, 0.07], [0.62, 0.049], [0.78, 0.034], [0.92, 0.029], [1, 0.024]],
    sneaker: [[0, 0.07], [0.1, 0.079], [0.3, 0.084], [0.45, 0.077], [0.62, 0.056], [0.78, 0.043], [0.92, 0.037], [1, 0.03]],
    boot: [[0, 0.1], [0.3, 0.102], [0.45, 0.088], [0.62, 0.062], [0.78, 0.047], [0.92, 0.04], [1, 0.032]] }[kind];
  const H = (u) => _tab(Ht, u) * (u > 0.5 ? Math.pow(cap(u), 0.35) : 1);
  const spring = (u) => (kind === 'oxford' ? 0.012 : 0.016) * _ss(0.78, 1, u) ** 2;
  const tS = (u) => (kind === 'oxford' ? lerp(0.027, 0.011, _ss(0.24, 0.3, u)) : kind === 'sneaker' ? lerp(0.031, 0.024, _ss(0.3, 0.75, u)) : lerp(0.035, 0.03, _ss(0.3, 0.75, u)));
  const yB = (u) => spring(u) + (kind === 'oxford' ? 0.007 * _ss(0.28, 0.33, u) * _ss(0.6, 0.52, u) : 0); // oxford: waist of the sole lifts off the ground between heel block and tread
  const yS = (u) => spring(u) + tS(u);
  const xc = (u) => ft[0] + med * 0.006 * _ss(0.55, 1, u) - med * 0.002 * _ss(0.4, 0, u);
  const zOf = (u) => z0 + u * L;
  const wf = (p) => { const t = smooth01((p[2] - 0.098) / 0.04); return t > 0.001 ? W2('foot' + side, 'toe' + side, t) : W1('foot' + side); };
  const C3 = (h) => C(h);
  const up = shoe, dk = shoe.map((v) => v * 0.62);
  const soleC = C3(sp.sole || (kind === 'boot' ? '#16130f' : kind === 'oxford' ? '#1b1410' : '#cfcac0'));
  // upper
  sb.param(40, 28, (u, v) => { const a = v * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); const w = halfW(u) * cap(u);
    const top = Math.max(0, sn); const x = xc(u) + w * _sp(c, 0.8) * (1 - 0.16 * Math.pow(top, 1.5));
    const y = sn >= 0 ? yS(u) + H(u) * _sp(sn, 0.85) : yS(u) - 0.004 * -sn; return [x, y, zOf(u)]; },
  wf, (u, v, p) => { const a = v * Math.PI * 2, sn = Math.sin(a), c = Math.cos(a); const hgt = (p[1] - yS(u)) / Math.max(1e-4, H(u)); let col = up;
    if (hgt < 0.08) col = dk; // welt / stitch line where the upper meets the sole
    if (kind === 'oxford') { if (Math.abs(u - 0.79) < 0.012 && sn > 0.15) col = up.map((x) => x * 0.55); // toe-cap seam
      if (u < 0.3 && sn > 0.2 && Math.abs(c) > 0.3) col = up.map((x) => x * 0.88); // quarter panel
      if (u > 0.4 && u < 0.64 && sn > 0.82) col = up.map((x) => x * 0.7); } // facing / eyestay
    if (kind === 'sneaker') { if (u < 0.14 && sn > 0.45) col = C3('#8c9198'); // heel tab
      else if (u > 0.82 && hgt < 0.45) col = up.map((x) => x * 0.93); // toe bumper
      else if (u > 0.36 && u < 0.66 && sn > 0.78) col = up.map((x) => x * 0.9); // eyestay
      else if (u > 0.18 && u < 0.6 && hgt < 0.55 && Math.abs(c) > 0.4) col = up.map((x) => x * 0.96); }
    if (kind === 'boot') { if (u > 0.83 && hgt < 0.4) col = C3('#2b2723'); // rubber toe rand
      if (u > 0.3 && u < 0.66 && sn > 0.8) col = up.map((x) => x * 0.75); }
    return col; }, (u) => [xc(u), yS(u) + H(u) * 0.35, zOf(u)]);
  // sole (rounded-box section that follows the plan outline; slightly wider than the upper)
  sb.param(40, 24, (u, v) => { const a = v * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); const w = (halfW(u) + 0.004) * cap(u);
    const y0 = yB(u), y1 = yS(u) + 0.002; return [xc(u) + w * _sp(c, 0.3), (y0 + y1) / 2 + (y1 - y0) / 2 * _sp(sn, 0.3), zOf(u) + (u < 0.02 ? -0.002 : 0)]; },
  wf, (u, v) => { const sn = Math.sin(v * Math.PI * 2); let col = soleC; if (sn < -0.6) col = soleC.map((x) => x * (kind === 'sneaker' ? 0.62 : 0.7)); // tread
    else if (kind === 'oxford' && u < 0.27 && sn < 0.5) col = C3('#3a2618'); // stacked leather heel
    else if (kind === 'boot' && sn < 0.2 && Math.floor(u * 22) % 2 === 0) col = soleC.map((x) => x * 0.6); // lugs
    return col; }, (u) => [xc(u), (yB(u) + yS(u)) / 2, zOf(u)]);
  // laces over the throat (+ a tongue under them)
  const lace = C3(kind === 'sneaker' ? '#f1efe9' : kind === 'boot' ? '#2a251f' : '#0c0b0a');
  const [u0, u1, nL] = kind === 'boot' ? [0.3, 0.64, 7] : kind === 'sneaker' ? [0.38, 0.64, 5] : [0.44, 0.62, 4];
  const tongueC = kind === 'sneaker' ? up.map((x) => x * 0.97) : up.map((x) => x * 0.82);
  { const ut = Math.min(u0 + 0.02, 0.4); sb.boxPart([xc(ut), yS(ut) + H(ut) + 0.004, zOf(ut) + 0.01], 0.03, 0.008, 0.03, wf([0, 0, zOf(ut)]), tongueC); }
  for (let k = 0; k < nL; k++) { const u = lerp(u0, u1, k / (nL - 1)); const y = yS(u) + H(u) + 0.0025; sb.boxPart([xc(u), y, zOf(u)], 0.03 - k * 0.0012, 0.0035, 0.0045, wf([0, y, zOf(u)]), lace); }
}
export function buildBodyGeometry(sp) {
  const sb = new SkinBuilder(); const J = joints(sp); const s = sp.height / 1.72, w = sp.build, f = sp.sex === 'f';
  const skin = C(sp.skin), top = C(sp.top), bottom = C(sp.bottom), shoe = C(sp.shoes || '#2a2420'), hair = C(sp.hairColor || '#15100c');
  const o = sp.outfit; const longSleeve = sp.longSleeve; const skirtLen = sp.skirt; // null | 'knee' | 'ankle'
  const W1 = (b) => [[B[b], 1]]; const W2 = (a, b, t) => [[B[a], 1 - t], [B[b], t]];
  const midriff = o === 'saree';
  const HQ = !!sp.hero; // protagonist: high-detail build (more tessellation, articulated fingers, sculpted nose/ears, garment construction details)
  const MH = HQ && hasHeroHead(sp); const NK = MH ? heroHeadFit(sp) : null; // protagonist with an anatomical head (HeroHead.js): no procedural head / hair / facial hair here
  const neckRing = (y, m) => { const C0 = y > 0.5 ? NK.collarAt(y + 0.012) : NK.collar; return { c: [0, y, C0.cz], rx: C0.rx + m, rz: C0.rz + m }; }; // a ring wrapping the hero's real neck (fitted collar ellipse, HeroHead.js) with margin m
  // grow a ring {rx, rz, cz} so it contains the neck collar ellipse with margin m (front, back and sides), keeping its own shape where it is already bigger
  const encloseNeck = (r, m, y) => { const C0 = NK.collarAt(y + 0.012), cz = r.cz || 0; const fr = Math.max(cz + r.rz, C0.cz + C0.rz + m), bk = Math.min(cz - r.rz, C0.cz - C0.rz - m); r.cz = (fr + bk) / 2; r.rz = (fr - bk) / 2; r.rx = Math.max(r.rx, C0.rx + m); return r; };
  // --- torso (hips → neck)
  // natural variation in adult female figure (seeded, spec override `bust`), slightly lower/softer with age
  const bf = f ? (sp.bust ?? (0.82 + 0.36 * ((((Math.sin((sp.seed || 1) * 47.13) * 43758.5453) % 1) + 1) % 1))) * (sp.age === 'elder' ? 0.9 : 1) : 0;
  const tr = [
    { y: 0.84, rx: (f ? 0.17 : 0.158) * w, rz: (f ? 0.112 : 0.102) * w, wgt: W1('hips'), col: bottom },
    { y: 0.95, rx: (f ? 0.172 : 0.16) * w, rz: (f ? 0.115 : 0.105) * w, wgt: W1('hips'), col: bottom },
    { y: 1.02, rx: (f ? 0.14 : 0.15) * w, rz: (f ? 0.095 : 0.1) * w, wgt: W2('hips', 'spine', 0.6), col: midriff ? skin : top },
    { y: 1.12, rx: (f ? 0.13 : 0.155) * w, rz: (f ? 0.09 : 0.1) * w, bust: f ? 0.004 * bf : 0, wgt: W2('spine', 'chest', 0.3), col: midriff ? skin : top },
    { y: 1.24, rx: (f ? 0.145 : 0.17) * w, rz: (f ? 0.1 : 0.11) * w, fz: f ? 0.012 : 0.01, bust: f ? 0.033 * bf : 0, wgt: W2('spine', 'chest', 0.8), col: top },
    { y: 1.33, rx: (f ? 0.15 : 0.18) * w, rz: (f ? 0.1 : 0.11) * w, fz: f ? 0.012 : 0.012, bust: f ? 0.026 * bf : 0, wgt: W1('chest'), col: top },
    { y: 1.40, rx: (f ? 0.145 : 0.172) * w, rz: 0.09 * w, bust: f ? 0.005 * bf : 0, wgt: W1('chest'), col: top },
    { y: 1.435, rx: (f ? 0.115 : 0.14) * w, rz: 0.075 * w, wgt: W1('chest'), col: top },
    { y: 1.455, rx: 0.075, rz: 0.06, wgt: W1('chest'), col: top },
    { y: 1.47, rx: 0.062, rz: 0.06, wgt: W2('chest', 'neck', 0.5), col: sp.collar ? top : skin },
    { y: 1.55, rx: 0.05, rz: 0.05, wgt: W1('neck'), col: skin },
  ];
  if (MH) { const a = tr[tr.length - 2], b = tr[tr.length - 1]; const open = sp.kit === 'openShirt'; const yTop = open ? NK.cutY + 0.034 : Math.max(NK.cutY + 0.03, 1.5 * s); const r0 = neckRing(yTop, 0.006); // collar wraps the real neck; its top sits above the level cut so no skin gap shows
    Object.assign(a, { rx: r0.rx + 0.004, rz: r0.rz + 0.004, cz: r0.c[2] }); Object.assign(b, { y: yTop / s, rx: r0.rx, rz: r0.rz, cz: r0.c[2], wgt: W2('chest', 'neck', 0.7), col: open ? C(sp.inner || '#e8e4da') : sp.collar ? top : skin }); // open shirt: the tee's crew neck hugs the neck inside the open collar (no tall shirt-coloured ring)
    if (open) a.col = C(sp.inner || '#e8e4da');
    // every ring that reaches the neck band contains the real neck (the throat sits forward of the ragged opening and used to poke through)
    for (let i = 0; i < tr.length - 2; i++) if (tr[i].y * s > NK.cutY - 0.03) encloseNeck(tr[i], 0.012, Math.max(tr[i].y * s, NK.cutY + 0.01)); }
  if (HQ) { tr[0].rz = (f ? 0.1 : 0.093) * w; tr.unshift({ y: 0.79, rx: 0.114 * w, rz: 0.072 * w, wgt: W1('hips'), col: bottom }); } /* rounded seat between the thighs; the front of the pelvis no longer stands proud of the thighs like an apron */ /* rounded seat between the thighs instead of a flat cap */
  const RO = HQ ? 1 : 0;
  const bel = sp.belly || 0; if (bel) [[2, 0.03, 0.02], [3, 0.045, 0.032], [4, 0.022, 0.012]].forEach(([i0, dz, df]) => { const i = i0 + RO; tr[i].rz += bel * dz * w; tr[i].fz = (tr[i].fz || 0) + bel * df; tr[i].rx += bel * 0.012 * w; });
  // torso surface (front/back z at height y and offset x) so straps, lanyards and bags sit on the clothes, never inside
  const surfZ = (y, x, sgn) => { let k = 0; while (k < tr.length - 2 && tr[k + 1].y * s < y) k++; const a = tr[k], b2 = tr[k + 1]; const t = clamp((y / s - a.y) / (b2.y - a.y), 0, 1); const rx = lerp(a.rx, b2.rx, t), rz = lerp(a.rz, b2.rz, t), fz = lerp(a.fz || 0, b2.fz || 0, t), bu = lerp(a.bust || 0, b2.bust || 0, t); const q = clamp(Math.abs(x) / rx, 0, 0.98); const sa = Math.sqrt(1 - q * q); return sgn * rz * sa + (sgn > 0 ? fz * sa + bu * bustShape(clamp(x / rx, -1, 1), sa) : 0); };
  const jacket = o === 'jacket';
  sb.loft(tr.map((r) => ({ c: [0, r.y * s, r.cz || 0], rx: r.rx, rz: r.rz, fz: r.fz, bust: r.bust, w: r.wgt, col: r.col })), HQ ? 40 : f ? 28 : 16, {
    capStart: true,
    colFn: jacket ? (ri, a, r) => { const fr = Math.sin(a); return ri >= 2 + RO && ri <= 6 + RO && fr > 0.93 ? C(sp.inner || '#6b6f72') : r.col; } : sp.tie ? (ri, a, r) => (ri >= 3 + RO && ri <= 6 + RO && Math.sin(a) > 0.97 ? C(sp.tie) : r.col) : null,
  });
  // --- legs
  const parts = { legs: [], skirt: null, skirtSeg: 18 }; // vertex ranges (used by tools/clothing-test.mjs)
  for (const side of ['L', 'R']) {
    const th = J['thigh' + side], sh = J['shin' + side], ft = J['foot' + side]; const sx = Math.sign(th[0]);
    const shorts = sp.shorts; const legCol = (y) => (shorts && y < 0.62 * s ? skin : skirtLen === 'ankle' && y < 0.2 ? skin : bottom);
    const lr = [
      { c: [th[0] * 0.82, 0.9 * s, 0], rx: 0.078 * w, rz: 0.088 * w, w: W2('hips', 'thigh' + side, 0.6) },
      { c: [th[0] * 0.92, 0.84 * s, 0], rx: 0.08 * w, rz: 0.086 * w, w: W2('hips', 'thigh' + side, 0.85) },
      { c: [th[0], 0.78 * s, 0], rx: 0.075 * w, rz: 0.08 * w, w: W1('thigh' + side) },
      { c: [lerp(th[0], sh[0], 0.85), 0.55 * s, 0.005], rx: 0.055 * w, rz: 0.06 * w, w: W2('thigh' + side, 'shin' + side, 0.3) },
      { c: [sh[0], 0.47 * s, 0.005], rx: 0.05 * w, rz: 0.055 * w, w: W2('thigh' + side, 'shin' + side, 0.75) },
      { c: [sh[0], 0.36 * s, -0.005], rx: 0.05 * w, rz: 0.056 * w, w: W1('shin' + side) },
      { c: [ft[0], 0.14 * s, -0.01], rx: 0.037, rz: 0.04, w: W1('shin' + side) },
      { c: [ft[0], 0.09 * s, -0.01], rx: 0.035, rz: 0.038, w: W2('shin' + side, 'foot' + side, 0.6) },
    ];
    const l0 = sb.n; sb.loft(lr.map((r) => ({ ...r, col: legCol(r.c[1]) })), HQ ? 20 : 10); parts.legs.push([l0, sb.n]);
    // shoe / sandal
    const sandal = sp.sandals; const fc = sandal ? skin : shoe; const heroFeet = HQ && sp.hero && !sandal;
    if (heroFeet) heroShoe(sb, ft, side, sp, W1, W2, shoe); else sb.ellipsoid([ft[0], 0.05 * s, 0.045], 0.044, 0.042, 0.118, HQ ? (sy, sx2, sz) => { const t = smooth01((sz - 0.42) / 0.35); return t > 0.001 ? W2('foot' + side, 'toe' + side, t) : W1('foot' + side); } : W1('foot' + side), fc, { lat: HQ ? 12 : 7, lon: HQ ? 22 : 12, bumpFn: (x, y, z) => (y < -0.2 ? 0.98 : 1) * (z > 0.6 ? 0.97 : 1) });
    if (sandal) { sb.boxPart([ft[0], 0.008, 0.05], 0.1, 0.016, 0.27, W1('foot' + side), C(sp.sole || sp.shoes || '#2a2420')); sb.boxPart([ft[0], 0.05 * s, 0.09], 0.092, 0.012, 0.03, W1('foot' + side), shoe); }
    else if (heroFeet) { /* sole is part of heroShoe */ } else if (HQ) { const sw = sp.sole ? 0.084 : 0.094, sl = sp.sole ? 0.24 : 0.262, z0 = 0.046 - sl / 2, z1 = 0.046 + sl / 2, zt = 0.118, sc = C(sp.sole || (sp.shoes === '#e8e8e4' ? '#d8d8d4' : '#1a1512')); sb.boxPart([ft[0], 0.011, (z0 + zt) / 2], sw, 0.022, zt - z0, W1('foot' + side), sc); sb.boxPart([ft[0], 0.011, (zt + z1) / 2], sw, 0.022, z1 - zt, W1('toe' + side), sc); } // sole hinges at the ball of the foot
    else sb.boxPart([ft[0], 0.011, 0.046], sp.sole ? 0.084 : 0.094, 0.022, sp.sole ? 0.24 : 0.262, W1('foot' + side), C(sp.sole || (sp.shoes === '#e8e8e4' ? '#d8d8d4' : '#1a1512')));
    if (HQ && !sandal) { const fw = W1('foot' + side); const lace = shoe.map((v) => v * 0.45); // laces across the instep, tongue, trouser hem break over the shoe
      if (!heroFeet) for (let k = 0; k < 4; k++) { const z = 0.05 + k * 0.019; const yTop = 0.05 * s + 0.042 * Math.sqrt(Math.max(0, 1 - ((z - 0.045) / 0.118) ** 2)) * 0.98; sb.boxPart([ft[0], yTop + 0.002, z], 0.034 - k * 0.002, 0.004, 0.005, fw, lace); }
      if (!heroFeet) sb.boxPart([ft[0], 0.05 * s + 0.044, 0.035], 0.03, 0.006, 0.03, fw, shoe.map((v) => v * 0.85));
      if (sp.boots) sb.loft([{ c: [ft[0], 0.205 * s, -0.008], rx: 0.045, rz: 0.049, w: W1('shin' + side), col: shoe }, { c: [ft[0], 0.15 * s, -0.008], rx: 0.046, rz: 0.051, w: W2('shin' + side, 'foot' + side, 0.4), col: shoe }, { c: [ft[0], 0.085 * s, 0.0], rx: 0.048, rz: 0.062, w: W1('foot' + side), col: shoe }], 20); // boot shaft (trousers tucked in)
      else sb.loft([{ c: [ft[0], 0.125 * s, -0.008], rx: 0.044, rz: 0.047, w: W1('shin' + side), col: bottom.map((v) => v * 0.85) }, { c: [ft[0], 0.105 * s, -0.004], rx: 0.047, rz: 0.054, w: W2('shin' + side, 'foot' + side, 0.5), col: bottom.map((v) => v * 0.85) }], 20); }
    void sx;
  }
  // --- skirt / sarong / saree / frock (cone from waist to hem, weighted mostly to hips)
  if (skirtLen) {
    const hemY = skirtLen === 'ankle' ? 0.1 : skirtLen === 'mid' ? 0.32 : 0.48; const topY = o === 'saree' ? 0.93 : o === 'salwar' || o === 'kurti' || o === 'abaya' ? 1.2 : o === 'kurta' ? 1.02 : 0.97;
    const region = sp.pattern ?? 0; const N = Math.max(7, Math.ceil((topY - hemY) / 0.07) + 1); const rings = []; // ~7 cm ring spacing so the hip-hinge zone is resolved on long tunics too
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), y = lerp(topY, hemY, t) * s; const flare = o === 'sarong' ? 0.045 : o === 'frock' ? 0.09 : o === 'skirt_top' ? 0.07 : o === 'abaya' ? 0.065 : 0.05; // a sarong is a ~2 m cloth tube folded at the waist: loose at the hem
      const ease = Math.sin(clamp((0.97 * s - y) / (0.3 * s), 0, 1) * Math.PI / 2); // cloth stands off the hips/thighs (real garments are not skin-tight there)
      const rx = lerp(0.17 * w, 0.17 * w + flare + (skirtLen === 'ankle' ? 0.02 : 0), Math.pow(t, 0.8)) + 0.012 * w * ease, rz = lerp(0.12 * w, 0.13 * w + flare * 0.8, t) + 0.03 * w * ease;
      // per-vertex skinning: each side of the garment follows the leg under it (stronger toward the hem), so a striding knee
      // pushes the cloth forward instead of poking through it; below the knee, long garments also follow the shins.
      // front panel → skirtF (hinged to the most forward part of either leg), back panel → skirtB (most rearward part),
      // sides → the thigh underneath. The animator drives skirtF/B every frame from the leg pose, so a striding knee or a
      // trailing shin always stays inside the cloth instead of poking out through the front or back of the garment.
      const follow = t <= 0 ? 0 : smooth01((0.95 * s - y) / (0.1 * s)); // 0 above the garment hinge (hip-joint height), full leg-follow just below it // follows the legs from just below the waistband (thigh swing starts right under the hips)
      // upper panel (hip → knee line) follows the thighs; below the knee line the lower panel follows the shins
      const kk = smooth01((0.56 * s - y) / (0.12 * s));
      const wFn = follow <= 0 ? W1('hips') : (ca, sa) => { const sL = smooth01((ca + 0.55) / 1.1); const k = follow; // ca > 0 → character's left (+x), sa > 0 → front
        const fF = smooth01((sa - 0.15) / 0.75), fB = smooth01((-sa - 0.15) / 0.75), side = 1 - fF - fB;
        const out = [[B.hips, 1 - k]]; const add = (bn, x) => { if (x > 1e-4) out.push([bn, x]); };
        add(B.skirtF, k * fF * (1 - kk)); add(B.skirtF2, k * fF * kk); add(B.skirtB, k * fB * (1 - kk)); add(B.skirtB2, k * fB * kk);
        add(B.thighL, k * side * sL); add(B.thighR, k * side * (1 - sL));
        return out.sort((p, q) => q[1] - p[1]).slice(0, 4); };
      rings.push({ c: [0, y, 0.005], rx: rx + (y > 0.9 * s ? 0.005 : 0), rz, w: wFn, col: C(sp.skirtCol || sp.bottom) });
    }
    const k0 = sb.n; sb.loft(rings, 18, { region, uvRep: 2 }); parts.skirt = [k0, sb.n];
  }
  // --- saree pallu: across the front from right hip over the left shoulder, hanging down the back
  if (o === 'saree' || o === 'salwar') {
    const pc = C(sp.skirtCol || sp.top); const path = [];
    const pts = o === 'saree'
      ? [[-0.15, 0.96, 0.12], [-0.08, 1.1, 0.12], [0.02, 1.24, 0.135], [0.1, 1.36, 0.1], [0.14, 1.44, 0.02], [0.14, 1.42, -0.08], [0.13, 1.25, -0.115], [0.12, 1.0, -0.12], [0.12, 0.78, -0.13]]
      : [[0.15, 1.38, 0.03], [0.165, 1.33, 0.085], [0.1, 1.27, 0.125], [-0.1, 1.27, 0.125], [-0.165, 1.33, 0.085], [-0.15, 1.38, 0.03], [-0.14, 1.36, -0.07], [0, 1.33, -0.1], [0.14, 1.36, -0.07]];
    pts.forEach((p, i) => {
      const nx = pts[Math.min(i + 1, pts.length - 1)], pv = pts[Math.max(i - 1, 0)]; const d = new THREE.Vector3(nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]).normalize();
      const out = new THREE.Vector3(p[0], 0, p[2]).normalize(); const side = new THREE.Vector3().crossVectors(d, out).normalize();
      const y = p[1]; const wgt = y > 1.3 ? W1('chest') : y > 1.05 ? W2('spine', 'chest', 0.5) : W1('hips');
      path.push({ c: [p[0] * w, y * s, p[2] * w], side: [side.x, side.y, side.z], out: [out.x, out.y, out.z], w: wgt });
    });
    sb.strip(path, o === 'saree' ? 0.26 : 0.12, (p) => p.out, null, pc, sp.pattern ?? 1);
  }
  // --- arms
  for (const side of ['L', 'R']) {
    const a = J['arm' + side], fo = J['fore' + side], h = J['hand' + side];
    const sleeveEnd = longSleeve ? 0.84 : sp.sleeveless ? 1.38 : 1.2; // y where skin starts
    const colAt = (y) => (y * (1 / s) > sleeveEnd ? (jacket ? top : top) : skin);
    const ar = [
      { c: [a[0] * 0.8, 1.425 * s, 0], rx: 0.045 * w, rz: 0.05 * w, w: W2('chest', 'arm' + side, 0.5) },
      { c: [a[0] * 0.95, 1.4 * s, 0], rx: 0.056 * w, rz: 0.06 * w, w: W2('chest', 'arm' + side, 0.75) },
      { c: [a[0], 1.35 * s, 0], rx: 0.053 * w, rz: 0.056 * w, w: W1('arm' + side) },
      { c: [lerp(a[0], fo[0], 0.5), 1.25 * s, -0.005], rx: 0.047 * w, rz: 0.05 * w, w: W1('arm' + side) },
      { c: [fo[0], 1.13 * s, -0.01], rx: 0.04, rz: 0.042, w: W2('arm' + side, 'fore' + side, 0.5) },
      { c: [lerp(fo[0], h[0], 0.4), 1.03 * s, -0.005], rx: 0.038, rz: 0.04, w: W1('fore' + side) },
      { c: [h[0], 0.89 * s, 0], rx: 0.028, rz: 0.03, w: W1('fore' + side) },
    ];
    const upW = HQ ? W2('arm' + side, 'armTwist' + side, 0.3) : W1('arm' + side); // mid upper arm: shared by the arm ring and the sleeve hem so they never shear apart
    if (HQ) { ar[3].w = upW; ar[5].w = W2('fore' + side, 'foreTwist' + side, 0.5); ar[6].w = W1('foreTwist' + side); } // twist bones spread limb roll along the skin
    sb.loft(ar.map((r) => ({ ...r, col: colAt(r.c[1]) })), HQ ? 20 : 10, { capEnd: false });
    sb.ellipsoid([a[0] * (HQ ? 0.8 : 0.84), (HQ ? 1.366 : 1.392) * s, -0.004], (HQ ? 0.047 : 0.05) * w, HQ ? 0.03 : 0.044, (HQ ? 0.05 : 0.056) * w, sp.sleeveless ? W2('chest', 'arm' + side, 0.5) : W2('chest', 'arm' + side, 0.5), sp.sleeveless ? skin : top, { lat: HQ ? 12 : 7, lon: HQ ? 18 : 10 });
    if (!longSleeve && !sp.sleeveless) { // sleeve hem flare
      sb.loft([{ c: [lerp(a[0], fo[0], 0.4), 1.215 * s, -0.005], rx: 0.056 * w, rz: 0.058 * w, w: upW, col: top }, { c: [lerp(a[0], fo[0], 0.33), 1.27 * s, -0.004], rx: 0.058 * w, rz: 0.06 * w, w: upW, col: top }], HQ ? 20 : 10); // same segment count as the arm, so the hem doesn't saw-tooth through it
    }
    { const sx = Math.sign(h[0]); const hw = W1('hand' + side); // palm, slightly curled finger block, thumb
      const hcol = sp.gloves ? C(sp.gloves) : sp.tacGloves ? C(sp.tacGloves) : skin; // traffic officers: white gauntlet gloves; tactical gloves (Shashika)
      if (HQ && !sp.gloves) { // articulated hand: palm with knuckle ridge, four three-segment fingers in a relaxed curl, two-segment thumb, nails
        const py = 0.842 * s; const fw = W1('foreTwist' + side);
        sb.loft([{ c: [h[0], 0.915 * s, 0.001], rx: 0.026, rz: 0.029, w: fw, col: hcol }, { c: [h[0], 0.882 * s, 0.003], rx: 0.0215, rz: 0.03, w: W2('foreTwist' + side, 'hand' + side, 0.5), col: hcol }, { c: [h[0], 0.862 * s, 0.005], rx: 0.019, rz: 0.035, w: hw, col: hcol }, { c: [h[0], 0.84 * s, 0.006], rx: 0.0185, rz: 0.04, w: hw, col: hcol }, { c: [h[0] - sx * 0.001, 0.818 * s, 0.006], rx: 0.0175, rz: 0.041, w: hw, col: hcol }, { c: [h[0] - sx * 0.002, py - 0.034, 0.005], rx: 0.015, rz: 0.038, w: hw, col: hcol }], 18, { capEnd: true }); // wrist → palm → knuckles
        const gl = !!sp.tacGloves; const nail = gl ? hcol.map((v) => v * 1.18) : hcol.map((v, i) => Math.min(1, v * 1.25 + [0.06, 0.03, 0.02][i]));
        const FL = fingerLayout(sp, side, J); // three bones per finger: rings at each segment middle are fully on that bone, knuckle rings blend the two
        for (const fg of FL.fingers) { const nm = fg.name, r0 = fg.r0, jt = fg.joints; const rings = [{ c: [jt[0][0], jt[0][1] + 0.006, fg.fz], rx: r0 * 1.12, rz: r0 * 1.05, w: W2('hand' + side, nm + 1 + side, 0.35), col: hcol }];
          for (let si = 0; si < 3; si++) for (const t of [0.5, 1]) { const k = si + t * 0.999; const r = r0 * (1 - 0.09 * k) * (t === 1 && si < 2 ? 1.06 : 1); const wg = t === 0.5 ? W1(nm + (si + 1) + side) : si < 2 ? W2(nm + (si + 1) + side, nm + (si + 2) + side, 0.5) : W1(nm + 3 + side);
            rings.push({ c: [lerp(jt[si][0], jt[si + 1][0], t), lerp(jt[si][1], jt[si + 1][1], t), fg.fz], rx: r, rz: r * 0.96, w: wg, col: hcol }); }
          sb.loft(rings, 10, { capEnd: true });
          const tip = jt[3], ang = fg.endAng; sb.ellipsoid([tip[0] + sx * 0.0035 + sx * Math.sin(ang) * 0.009, tip[1] + Math.cos(ang) * 0.009, fg.fz], gl ? 0.0015 : 0.0022, 0.0075, r0 * 0.72, W1(nm + 3 + side), nail, { lat: 4, lon: 8 }); }
        const T = FL.thumb; sb.loft([{ c: T[0], rx: 0.0115, rz: 0.012, w: W2('hand' + side, 'thb1' + side, 0.5), col: hcol }, { c: T[1], rx: 0.0102, rz: 0.0102, w: W2('thb1' + side, 'thb2' + side, 0.5), col: hcol }, { c: T[2], rx: 0.0094, rz: 0.0094, w: W2('thb2' + side, 'thb3' + side, 0.5), col: hcol }, { c: T[3], rx: 0.0082, rz: 0.0082, w: W1('thb3' + side), col: hcol }], 10, { capEnd: true });
        sb.ellipsoid([T[0][0] - sx * 0.0045, T[0][1] - 0.05, T[0][2] + 0.024], 0.006, 0.007, gl ? 0.0015 : 0.0022, W1('thb3' + side), nail, { lat: 4, lon: 8 });
        if (gl) sb.loft([{ c: [h[0], 0.905 * s, 0.002], rx: 0.0285, rz: 0.032, w: W1('foreTwist' + side), col: hcol.map((v) => v * 0.8) }, { c: [h[0], 0.872 * s, 0.004], rx: 0.0245, rz: 0.033, w: W2('foreTwist' + side, 'hand' + side, 0.5), col: hcol.map((v) => v * 0.8) }], 18); // glove cuff
      } else {
      sb.ellipsoid([h[0], 0.84 * s, 0.006], 0.022, 0.042, 0.04, hw, hcol, { lat: 6, lon: 10 });
      sb.ellipsoid([h[0] - sx * 0.004, 0.79 * s, 0.012], 0.017, 0.038, 0.036, hw, hcol, { lat: 6, lon: 10, bumpFn: (x, y, z) => 1 + (y < -0.4 ? 0.04 * Math.sin(z * 18) : 0) });
      sb.ellipsoid([h[0] - sx * 0.014, 0.818 * s, 0.038], 0.011, 0.026, 0.012, hw, hcol, { lat: 4, lon: 6 }); }
      if (HQ && longSleeve && !sp.tacGloves) { const fw = W1('foreTwist' + side), cc = top.map((v) => v * 0.8); sb.loft([{ c: [h[0], 0.925 * s, -0.001], rx: 0.0335, rz: 0.0355, w: fw, col: cc }, { c: [h[0], 0.893 * s, 0], rx: 0.0315, rz: 0.0335, w: fw, col: cc }], 20); } // ribbed cuff
      if (sp.gloves) { const fw = W1('fore' + side), gc = C(sp.gloves), rc = C(sp.cuff || '#c0262d'); // flared gauntlet cuff with a red band
        sb.loft([{ c: [h[0], 0.875 * s, 0], rx: 0.032, rz: 0.034, w: fw, col: gc }, { c: [lerp(fo[0], h[0], 0.62), 0.94 * s, -0.002], rx: 0.04, rz: 0.042, w: fw, col: gc }, { c: [lerp(fo[0], h[0], 0.56), 0.955 * s, -0.003], rx: 0.0415, rz: 0.0435, w: fw, col: rc }, { c: [lerp(fo[0], h[0], 0.5), 0.975 * s, -0.003], rx: 0.0425, rz: 0.0445, w: fw, col: rc }, { c: [lerp(fo[0], h[0], 0.46), 0.985 * s, -0.003], rx: 0.0425, rz: 0.0445, w: fw, col: gc }], 10); } }
    if (sp.patch && side === 'L') { const px = a[0] + 0.054 * w + 0.003; sb.ellipsoid([px, 1.33 * s, 0], 0.004, 0.032, 0.03, W1('armL'), C(sp.patch), { lat: 4, lon: 10 }); sb.ellipsoid([px + 0.002, 1.33 * s, 0], 0.003, 0.016, 0.015, W1('armL'), C('#d9b13b'), { lat: 4, lon: 8 }); } // round shoulder flash
    if (sp.bangles && side === 'L') sb.loft([{ c: [h[0], 0.885 * s, 0], rx: 0.033, rz: 0.035, w: W1('fore' + side), col: C('#d4a640') }, { c: [h[0], 0.9 * s, 0], rx: 0.033, rz: 0.035, w: W1('fore' + side), col: C('#d4a640') }], 8);
  }
  // --- head (separate group so it can take a face texture)
  const hc = [0, 1.635 * s, 0.015 * s];
  const HD = sp.head || {}; const jaw = HD.jaw ?? 1, chin = HD.chin ?? 0, cheek = HD.cheek ?? 0;
  const hr = (f ? [0.083, 0.11, 0.098] : [0.088, 0.115, 0.102]).map((v, i) => v * [HD.w ?? 1, HD.h ?? 1, HD.d ?? 1][i]);
  // jaw width (lower half, sides), chin projection (front-bottom) and cheekbones (front-mid sides) all vary per person
  const headBump = (x, y, z) => 1 + (z > 0.5 && y < -0.2 ? -0.06 * (z - 0.5) : 0) + (y < -0.55 ? -0.08 * (-y - 0.55) * 2 : 0)
    + (y < -0.15 ? (jaw - 1) * Math.min(1, (-y - 0.15) * 2.2) * Math.abs(x) * 1.3 : 0) + (z > 0.55 && y < -0.6 ? chin * 0.05 * Math.min(1, (z - 0.55) * 3) * Math.min(1, (-y - 0.6) * 4) : 0)
    + (z > 0.2 && y > -0.4 && y < 0.1 ? cheek * 0.022 * Math.abs(x) * (1 - Math.abs(y + 0.15) * 4) : 0);
  if (!MH) sb.ellipsoid(hc, hr[0], hr[1], hr[2], W1('head'), skin, { lat: HQ ? 26 : 16, lon: HQ ? 40 : 24, faceUV: true, target: sb.headIdx, bumpFn: headBump });
  // nose + ears
  if (MH) { /* anatomical nose: HeroHead.js */ } else if (HQ) { const nz = HD.nose || [1, 1, 1]; const fz = hc[2] + hr[2]; const dk = skin.map((v) => v * 0.9); // nose: bridge, rounded tip, nostril wings
    sb.ellipsoid([0, hc[1] - 0.006 - (nz[1] - 1) * 0.008, fz - 0.007], 0.0125 * nz[0], 0.031 * nz[1], 0.0155 * nz[2], W1('head'), skin, { lat: 12, lon: 16, bumpFn: (x, y, z) => (0.62 + 0.38 * (1 - y) * 0.5) * (Math.abs(x) > 0.3 ? 1 : 1) }); // wedge: narrow bridge, wider base
    sb.ellipsoid([0, hc[1] - 0.024 - (nz[1] - 1) * 0.012, fz + 0.0035], 0.0098 * nz[0], 0.0094, 0.0098 * nz[2], W1('head'), skin, { lat: 8, lon: 12 });
    for (const sx of [-1, 1]) sb.ellipsoid([sx * 0.0102 * nz[0], hc[1] - 0.0275 - (nz[1] - 1) * 0.012, fz - 0.0035], 0.0064, 0.0058, 0.0072, W1('head'), dk, { lat: 6, lon: 10 }); }
  else { const nz = HD.nose || [1, 1, 1]; sb.ellipsoid([0, hc[1] - 0.012 - (nz[1] - 1) * 0.012, hc[2] + hr[2] - 0.004], 0.016 * nz[0], 0.026 * nz[1], 0.022 * nz[2], W1('head'), skin, { lat: 5, lon: 8, p0: 0.3 }); }
  if (MH) { /* anatomical ears: HeroHead.js */ } else if (sp.hair !== 'hijab' && HQ) { const es = HD.ear ?? 1; const inner = skin.map((v) => v * 0.86); for (const sx of [-1, 1]) { // ear: helix rim, concha hollow, lobe
      sb.ellipsoid([sx * (hr[0] + 0.001), hc[1] + 0.002, hc[2] - 0.013], 0.0095 * es, 0.031 * es, 0.021 * es, W1('head'), skin, { lat: 10, lon: 14 });
      sb.ellipsoid([sx * (hr[0] + 0.0065), hc[1] - 0.001, hc[2] - 0.009], 0.0022 * es, 0.016 * es, 0.0105 * es, W1('head'), inner, { lat: 6, lon: 10 });
      sb.ellipsoid([sx * (hr[0] + 0.0005), hc[1] - 0.029 * es, hc[2] - 0.008], 0.0075 * es, 0.0105 * es, 0.0085 * es, W1('head'), skin, { lat: 6, lon: 10 }); } }
  else if (sp.hair !== 'hijab') { const es = HD.ear ?? 1; for (const sx of [-1, 1]) sb.ellipsoid([sx * hr[0], hc[1], hc[2] - 0.01], 0.012 * es, 0.03 * es, 0.02 * es, W1('head'), skin, { lat: 4, lon: 6 }); }
  // hair
  const hs = sp.hair; let hairLift = 1;
  const backZ = (y, half) => Math.min(hc[2] - hr[2] * 0.75, surfZ(y, 0, -1) - half - 0.008); // hair hanging down the back stays outside the clothes
  if (MH) { /* scalp-fitted hair: HeroHead.js */ } else if (hs === 'hijab') { // head scarf: a shell over the head (open around the face), wrapped under the chin and draped over the shoulders
    const sc = C(sp.scarf || '#2a2a3a'); hairLift = 1.14;
    // oval face opening (forehead to just under the lower lip, cheek to cheek); inside it the shell sinks below the skin
    const open = (x, y, z) => z > 0.25 && (x / 0.66) ** 2 + ((y + 0.1) / 0.58) ** 2 < 1;
    sb.ellipsoid([hc[0], hc[1] + 0.008, hc[2] - 0.004], hr[0] * 1.14, hr[1] * 1.08, hr[2] * 1.1, W1('head'), sc, { lat: 22, lon: 34, p0: 0, p1: Math.PI * 0.86, bumpFn: (x, y, z) => (open(x, y, z) ? 0.84 : 1) * headBump(x, y, z) });
    // wrap: starts inside the head shell, closes under the chin and around the neck, then drapes over the shoulders
    sb.loft([
      { c: [0, hc[1] - hr[1] * 0.45, hc[2] - 0.03], rx: hr[0] * 0.95, rz: hr[2] * 0.8, w: W1('head'), col: sc }, // hidden inside the head/shell
      { c: [0, hc[1] - hr[1] * 1.06, hc[2] - 0.012], rx: hr[0] * 0.82, rz: hr[2] * 0.82, w: W2('head', 'neck', 0.35), col: sc }, // under the chin
      { c: [0, 1.5 * s, 0.004], rx: 0.1 * w + 0.014, rz: 0.1, w: W2('neck', 'chest', 0.5), col: sc },
      { c: [0, 1.44 * s, 0.0], rx: (f ? 0.15 : 0.175) * w + 0.014, rz: 0.1 * w + 0.024, w: W1('chest'), col: sc },
      { c: [0, 1.37 * s, 0.006], rx: (f ? 0.168 : 0.19) * w + 0.018, rz: 0.11 * w + 0.032, w: W1('chest'), col: sc },
    ], 20, { capEnd: false });
  } else if (hs !== 'bald') {
    const lift = { wavy: 1.1, grey: 1.04, crew: 1.025, curly: 1.13, quiff: 1.05, sidepart: 1.07, receding: 1.04, balding: 1.035, bob: 1.1, short_f: 1.07, shoulder: 1.07 }[hs] || 1.06; hairLift = lift;
    const hl = sp.hairline || 0; const rec = hs === 'receding' ? 0.12 : hs === 'balding' ? 0.16 : 0;
    // hairline: high on the forehead, down past the temples to the ears, lower at the nape; below it the cap tucks inside the head.
    // receding / balding raise it at the temples (M-shape); a bob comes down the sides to the jaw.
    const hairline = (x, z) => { const fr = smooth01((z + 0.1) / 0.75); return lerp(-0.25, f ? 0.4 : 0.5, fr) + (hl + rec) * fr + rec * 1.4 * Math.abs(x) * fr + (f && z > 0.6 ? 0.04 * Math.cos(x * 9) : 0) - (hs === 'bob' && z < 0.5 ? 0.42 * smooth01((Math.abs(x) - 0.5) * 4) : 0); };
    // strand-scale relief on top of the style shape: fine combed grooves running crown → hairline (all styles), so the
    // silhouette and the shading break up like real hair instead of a smooth helmet
    const grooves = (x, y, z) => { const ph = Math.atan2(x, z); return 1 + 0.006 * Math.sin(ph * 46 + y * 5) + 0.004 * Math.sin(ph * 97 - y * 9); };
    const tex = (x, y, z) => grooves(x, y, z) * (hs === 'wavy' ? 1 + 0.04 * Math.sin(x * 14) * Math.cos(z * 11) : hs === 'curly' ? 1 + 0.05 * Math.abs(Math.sin(x * 21) * Math.sin(y * 17) * Math.sin(z * 19)) + 0.02 * Math.sin(x * 47) * Math.sin(z * 43) : hs === 'quiff' ? 1 + (y > 0.45 && z > -0.1 ? 0.07 * smooth01((y - 0.45) * 3) * smooth01((z + 0.1) * 2) : 0) : hs === 'sidepart' ? (Math.abs(x - 0.32) < 0.035 && y > 0.4 ? 0.975 : x < 0.32 ? 1.012 : 1) : 1);
    const bump = (x, y, z) => (y < hairline(x, z) ? 0.9 / lift : hs === 'balding' && y > 0.6 && z > -0.5 ? 0.9 / lift : 1) * tex(x, y, z);
    const p1 = Math.PI * (f ? (hs === 'bob' ? 0.7 : 0.6) : 0.52); const H = sb.hairIdx;
    sb.ellipsoid([hc[0], hc[1] + 0.012, hc[2] - 0.006], hr[0] * lift, hr[1] * 1.02, hr[2] * lift, W1('head'), hair, { lat: hs === 'curly' ? 22 : 18, lon: hs === 'curly' ? 44 : 36, p0: 0, p1, bumpFn: bump, target: H });
    if (!f && hs !== 'balding') for (const sx of [-1, 1]) { if (HQ) sb.ellipsoid([sx * hr[0] * 0.955, hc[1] - 0.004, hc[2] + 0.024], 0.0055, 0.022, 0.0085, W1('head'), hair.map((v, i) => v * 0.85 + skin[i] * 0.15), { lat: 8, lon: 12, target: H }); else sb.ellipsoid([sx * hr[0] * 0.97, hc[1] - 0.012, hc[2] + 0.014], 0.007, 0.026, 0.014, W1('head'), hair, { lat: 4, lon: 6, target: H }); } // sideburns (hero: slim, in front of the ear)
    const hv = (j) => { const k = 0.9 + 0.2 * (((Math.sin(j * 12.9898 + (sp.seed || 1) * 78.233) * 43758.5453) % 1 + 1) % 1); return hair.map((v) => Math.min(1, v * k + 0.004)); };
    const hashN = (j) => (((Math.sin(j * 91.7 + (sp.seed || 1) * 13.1) * 43758.5453) % 1) + 1) % 1;
    if (f || hs === 'long') {
      const len = { long: 0.4, shoulder: 0.2, bob: 0.06 }[hs] ?? 0; // bun / ponytail / braid / short styles have no loose back panel
      // under-layer panel (closes any gap between locks) …
      if (len > 0) sb.loft([0, 1, 2, 3].map((i) => { const t = i / 3; const y = hc[1] - 0.02 - t * len * 0.92; const rz = lerp(0.06, hs === 'bob' ? 0.05 : 0.025, t); return { c: [0, y, t < 0.3 ? hc[2] - hr[2] * 0.75 : backZ(y, rz)], rx: lerp(hr[0] * 1.0, hs === 'bob' ? hr[0] * 0.97 : 0.055, t), rz, w: t > 0.45 ? W2('neck', 'chest', 0.6) : W1('head'), col: hair.map((v) => v * 0.8) }; }), 12, { capEnd: false, capStart: true, target: H });
      // … under separate tapered locks of uneven length, slightly wavy, that form a layered, strand-like hem
      if (len > 0) {
        const n = hs === 'bob' ? 11 : 9;
        for (let j = 0; j < n; j++) {
          const u = j / (n - 1) * 2 - 1, lj = len * (0.84 + 0.22 * hashN(j)) + (hs === 'bob' ? 0.02 : 0), ph = hashN(j + 17) * 6.28;
          sb.loft([0, 1, 2, 3, 4, 5].map((i) => { const t = i / 5; const y = hc[1] - 0.03 - t * lj; const env = lerp(hr[0] * 0.98, hs === 'bob' ? hr[0] * 0.95 : 0.062, Math.min(1, t * (len > 0.1 ? 1.15 : 1))); const rz = lerp(0.018, 0.007, t);
            const zb = t < 0.25 ? hc[2] - hr[2] * 0.82 : (hs === 'bob' ? Math.min(hc[2] - hr[2] * 0.75 - 0.006, backZ(y, rz)) - 0.004 * (1 - Math.abs(u)) : backZ(y, rz) - 0.006 - 0.004 * hashN(j + 3));
            return { c: [u * env * 0.85 + Math.sin(t * 3.2 + ph) * 0.006, y, zb], rx: lerp(0.034, 0.005, t * t), rz, w: t > 0.45 ? W2('neck', 'chest', 0.6) : W1('head'), col: hv(j) }; }), 7, { capEnd: true, target: H });
        }
        if (hs === 'long' || hs === 'shoulder') for (const sx of [-1, 1]) { // face-framing side locks, hanging just outside the cheek over the ear
          const sl = hs === 'long' ? 0.17 : 0.13;
          sb.loft([0, 1, 2, 3, 4].map((i) => { const t = i / 4; const y = hc[1] + 0.01 - t * sl; return { c: [sx * (hr[0] * 1.03 + 0.008 + t * 0.006), y, hc[2] + hr[2] * lerp(0.1, -0.15, t)], rx: lerp(0.012, 0.004, t), rz: lerp(0.03, 0.008, t * t), w: W1('head'), col: hv(sx + 40) }; }), 6, { capEnd: true, target: H });
        }
      }
      if (hs === 'bun') { // twisted bun: core + wrapped coil + hair tie
        sb.ellipsoid([0, hc[1] - 0.025, hc[2] - hr[2] - 0.035], 0.052, 0.046, 0.042, W1('head'), hair, { lat: 10, lon: 16, target: H, bumpFn: (x, y, z) => 1 + 0.05 * Math.sin(Math.atan2(x, y) * 3 + z * 6) });
        sb.ellipsoid([0, hc[1] - 0.025, hc[2] - hr[2] - 0.012], 0.058, 0.05, 0.02, W1('head'), C('#151312'), { lat: 4, lon: 12 });
      }
      if (hs === 'ponytail') { // tie at the crown, full tail of three twisted strands falling down the back of the head and neck
        sb.ellipsoid([0, hc[1] + 0.02, hc[2] - hr[2] * lift - 0.012], 0.032, 0.03, 0.03, W1('head'), hair, { lat: 6, lon: 10, target: H });
        sb.ellipsoid([0, hc[1] + 0.012, hc[2] - hr[2] * lift - 0.03], 0.022, 0.022, 0.012, W1('head'), C('#1a1a1c'), { lat: 4, lon: 8 }); // hair tie
        for (let j = 0; j < 3; j++) sb.loft([0, 1, 2, 3, 4, 5].map((i) => { const t = i / 5; const y = hc[1] + 0.01 - t * 0.25 * (0.92 + 0.08 * j); const r0 = lerp(0.02, 0.006, t); const a = j * 2.1 + t * 2.4;
          return { c: [Math.cos(a) * 0.01 * (1 - t * 0.5), y, Math.min(hc[2] - hr[2] * lift - 0.03 + t * 0.02, backZ(y, r0)) + Math.sin(a) * 0.006], rx: r0, rz: r0 * 0.9, w: t > 0.55 ? W2('neck', 'chest', 0.5) : W1('head'), col: hv(j + 60) }; }), 7, { capEnd: true, target: H });
      }
      if (hs === 'braid') { // three-strand braid: alternating overlapping sections + a tie and loose tuft at the end
        const nb = 17, yb0 = hc[1] - 0.05;
        sb.loft([0, 1, 2, 3, 4].map((i) => { const t = i / 4; const y = yb0 - t * 0.34; const r0 = lerp(0.022, 0.012, t); return { c: [0, y, Math.min(hc[2] - hr[2] * 0.88, backZ(y, r0))], rx: r0, rz: r0 * 0.8, w: t > 0.4 ? W2('neck', 'chest', 0.7) : W1('head'), col: hair.map((v) => v * 0.7) }; }), 8, { target: H }); // core
        for (let i = 0; i < nb; i++) { const t = i / (nb - 1); const y = yb0 - t * 0.33; const r0 = lerp(0.026, 0.015, t); const side = i % 2 ? 1 : -1;
          sb.ellipsoid([side * r0 * 0.42, y, Math.min(hc[2] - hr[2] * 0.88, backZ(y, r0)) - 0.002], r0 * 0.95, 0.03 * (1 - t * 0.3), r0 * 0.85, t > 0.4 ? W2('neck', 'chest', 0.7) : W1('head'), hv(i + 80), { lat: 6, lon: 10, target: H }); }
        const ye = hc[1] - 0.05 - 0.35; sb.loft([0, 1, 2].map((i) => { const t = i / 2; const y = ye - t * 0.05; return { c: [0, y, backZ(y, 0.01)], rx: lerp(0.01, 0.016, t), rz: 0.01, w: W2('neck', 'chest', 0.7), col: hair }; }), 6, { capEnd: true, target: H });
      }
    }
  }
  // facial hair: beard shells follow the jaw exactly (same centre, radii and jaw shaping as the head), so they cannot drift off the face
  if (!MH && (sp.beard || sp.goatee)) {
    const thick = sp.goatee ? 1.03 : sp.beardShort ? 1.016 : 1.03;
    const ssf = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const beardSoft = (x, y, z) => { const hb = headBump(x, y, z); // hero: same beard regions as below, but blended with smooth masks so the beard edge follows a clean contour instead of the mesh grid
      const line = z < 0.05 ? -0.18 : -0.18 - 0.36 * Math.min(1, (z - 0.05) / 0.55); const ln = line + 0.03 * Math.sin(x * 9);
      const below = ssf(ln + 0.035, ln - 0.06, y), back = ssf(-0.32, -0.12, z), mouth = ssf(0.62, 0.76, z) * ssf(0.46, 0.34, Math.abs(x)) * ssf(-0.58, -0.47, y);
      const m = below * back * (1 - mouth); const T = thick + (sp.beardShort ? 0.004 : 0.012) * Math.max(0, -y - 0.6) + 0.003 * Math.sin(x * 40 + z * 23) + 0.0022 * Math.sin(x * 131 + y * 97) * Math.sin(z * 113 - y * 71);
      return hb * (0.94 + (T - 0.94) * m); };
    const beardBump = HQ && !sp.goatee ? beardSoft : (x, y, z) => { const hb = headBump(x, y, z); if (z < -0.3) return hb * 0.93; if (z > 0.72 && y > -0.52 && Math.abs(x) < 0.42) return hb * 0.96; // back of the shell and the lips stay inside the head
      if (sp.goatee) return z > 0.55 && Math.abs(x) < 0.34 && y < -0.56 ? hb * thick : hb * 0.94; // chin patch only
      const line = z < 0.05 ? -0.18 : -0.18 - 0.36 * Math.min(1, (z - 0.05) / 0.55); if (y > line + 0.04 * Math.sin(x * 9) && !(z > 0.8 && Math.abs(x) < 0.3 && y < -0.38)) return hb * 0.94; // beard line: sideburns → cheek → jaw
      return hb * (thick + (sp.beardShort ? 0.004 : 0.012) * Math.max(0, -y - 0.6)) + 0.004 * Math.sin(x * 40 + z * 23); };
    const beardC = hair.map((v, i) => v * 0.82 + skin[i] * 0.18); sb.ellipsoid(hc, hr[0], hr[1], hr[2], W1('head'), beardC, { lat: HQ ? 34 : 12, lon: HQ ? 64 : 26, p0: Math.PI * 0.54, p1: Math.PI * 0.985, bumpFn: beardBump });
    if (!sp.goatee && HQ) { const mc = hair.map((v, i) => v * 0.9 + skin[i] * 0.1); const strands = (x, y, z) => 1 + 0.05 * Math.sin(x * 37) * (y < 0 ? 1 : 0.4); // moustache: centre + corners dropping into the beard
      sb.ellipsoid([0, hc[1] - 0.04, hc[2] + hr[2] * 0.93], 0.022, 0.0075, 0.0105, W1('head'), mc, { lat: 8, lon: 16, bumpFn: strands });
      for (const sx of [-1, 1]) sb.ellipsoid([sx * 0.021, hc[1] - 0.045, hc[2] + hr[2] * 0.895], 0.0125, 0.0085, 0.0095, W1('head'), mc, { lat: 8, lon: 12, bumpFn: strands }); }
    else if (!sp.goatee) sb.ellipsoid([0, hc[1] - 0.04, hc[2] + hr[2] * 0.93], 0.032, 0.009, 0.012, W1('head'), hair, { lat: 4, lon: 8 });
  }
  if (sp.moustache && HQ && !MH) { const mc = hair.map((v, i) => v * 0.9 + skin[i] * 0.1); const strands = (x, y, z) => 1 + 0.05 * Math.sin(x * 37) * (y < 0 ? 1 : 0.4); sb.ellipsoid([0, hc[1] - 0.041, hc[2] + hr[2] - 0.015], 0.024, 0.0072, 0.0105, W1('head'), mc, { lat: 8, lon: 16, bumpFn: strands }); for (const sx of [-1, 1]) sb.ellipsoid([sx * 0.021, hc[1] - 0.045, hc[2] + hr[2] - 0.02], 0.011, 0.0068, 0.009, W1('head'), mc, { lat: 8, lon: 12, bumpFn: strands }); }
  else if (sp.moustache && !MH) sb.ellipsoid([0, hc[1] - 0.042, hc[2] + hr[2] - 0.016], 0.03, 0.008, 0.012, W1('head'), hair, { lat: 4, lon: 8 });
  if (sp.glasses && !MH) { const gz = hc[2] + hr[2] - 0.006, gy = hc[1] + 0.006; for (const sx of [-1, 1]) { sb.boxPart([sx * 0.034, gy + 0.012, gz], 0.038, 0.004, 0.004, W1('head'), C('#1a1a1a')); sb.boxPart([sx * 0.034, gy - 0.01, gz - 0.001], 0.034, 0.003, 0.004, W1('head'), C('#1a1a1a')); sb.boxPart([sx * 0.053, gy + 0.001, gz - 0.002], 0.003, 0.022, 0.004, W1('head'), C('#1a1a1a')); } sb.boxPart([0, gy + 0.008, gz + 0.002], 0.016, 0.003, 0.004, W1('head'), C('#1a1a1a')); }
  // ---- garment construction (hero only): seams, tapes, pockets, belt — flat strips laid on the cloth surface, skinned like the torso
  if (HQ) {
    const tw = (y) => (y / s < 0.99 ? W1('hips') : y / s < 1.2 ? W2('spine', 'chest', 0.3) : W1('chest'));
    const rxAt = (y) => { let k = 0; while (k < tr.length - 2 && tr[k + 1].y * s < y) k++; const a = tr[k], b2 = tr[k + 1]; return lerp(a.rx, b2.rx, clamp((y / s - a.y) / (b2.y - a.y), 0, 1)); };
    const rzAt = (y) => { let k = 0; while (k < tr.length - 2 && tr[k + 1].y * s < y) k++; const a = tr[k], b2 = tr[k + 1]; return lerp(a.rz, b2.rz, clamp((y / s - a.y) / (b2.y - a.y), 0, 1)); };
    const vstrip = (x0, y0, y1, width, col, sgn = 1, fx = null) => { const path = []; const n = 8; for (let i = 0; i <= n; i++) { const y = lerp(y0, y1, i / n); const x = fx ? fx(y) : x0; path.push({ c: [x, y, surfZ(y, x, sgn) + 0.0022 * sgn], side: [1, 0, 0], w: tw(y) }); } sb.strip(path, width, () => [0, 0, sgn], tw(y0), col); };
    const hstrip = (y, x0, x1, width, col, sgn = 1) => { const path = []; const n = 6; for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n); path.push({ c: [x, y, surfZ(y, x, sgn) + 0.0024 * sgn], side: [0, 1, 0], w: tw(y) }); } sb.strip(path, width, () => [0, 0, sgn], tw(y), col); };
    const dark = (c, k) => c.map((v) => v * k);
    const band = (y0, y1, grow, col, wt, colFn = null) => sb.loft([y0, y1].map((y) => ({ c: [0, y, 0], rx: rxAt(y) + grow, rz: rzAt(y) + grow, w: wt, col })), 40, colFn ? { colFn } : {});
    if (jacket && sp.zip) {
      const tape = C('#202226'); for (const sx of [-1, 1]) vstrip(0, 1.03 * s, 1.425 * s, 0.011, tape, 1, (y) => sx * rxAt(y) * 0.375); // zip tapes along the open front
      for (const sx of [-1, 1]) { hstrip(1.315 * s, sx * 0.055 * w, sx * 0.125 * w, 0.02, dark(top, 0.78)); hstrip(1.1 * s, sx * 0.07 * w, sx * 0.135 * w, 0.009, dark(top, 0.55)); } // chest pocket flaps, hand-warmer welts
      hstrip(1.36 * s, -0.15 * w, 0.15 * w, 0.005, dark(top, 0.7), -1); // back yoke seam
      band(1.018 * s, 1.05 * s, 0.004, dark(top, 0.8), W1('hips'), (ri, a, r) => (Math.sin(a) > 0.93 ? C(sp.inner || '#6b6f72') : r.col)); // hem band (open at the front)
      sb.loft([MH ? (() => { const r = encloseNeck({ rx: 0.094 * w, rz: 0.082 * w, cz: -0.004 }, 0.016, Math.max(1.437 * s, NK.cutY + 0.01)); return { c: [0, 1.437 * s, r.cz], rx: r.rx, rz: r.rz, w: W1('chest'), col: dark(top, 0.88) }; })() : { c: [0, 1.437 * s, -0.004], rx: 0.094 * w, rz: 0.082 * w, w: W1('chest'), col: dark(top, 0.88) }, MH ? { ...neckRing(Math.max(NK.cutY + 0.045, 1.5 * s), 0.009), w: W2('chest', 'neck', 0.6), col: dark(top, 0.88) } : { c: [0, 1.5 * s, -0.008], rx: 0.07, rz: 0.066, w: W2('chest', 'neck', 0.5), col: dark(top, 0.88) }], 32); // stand collar
    }
    if (sp.kit === 'openShirt') { // Dineth: unbuttoned short-sleeve shirt over a tee — the loose front panels and back hem swing (flap / hem bones)
      const pl = top.map((v) => Math.min(1, v * 1.12)); for (const sx of [-1, 1]) vstrip(0, 1.05 * s, 1.425 * s, 0.014, pl, 1, (y) => sx * rxAt(y) * 0.39); // plackets
      for (let k = 0; k < 5; k++) { const y = (1.1 + k * 0.068) * s; const x = rxAt(y) * 0.39; sb.boxPart([x, y, surfZ(y, x, 1) + 0.004], 0.008, 0.008, 0.004, tw(y), C('#e6dfd0')); } // buttons
      hstrip(1.3 * s, 0.05 * w, 0.118 * w, 0.05, dark(top, 0.9)); // chest pocket
      sb.loft([MH ? (() => { const r = encloseNeck({ rx: 0.112 * w, rz: 0.094 * w, cz: -0.004 }, 0.018, Math.max(1.428 * s, NK.cutY + 0.01)); return { c: [0, 1.428 * s, r.cz], rx: r.rx, rz: r.rz, w: W1('chest'), col: dark(top, 0.92) }; })() : { c: [0, 1.428 * s, -0.004], rx: 0.112 * w, rz: 0.094 * w, w: W1('chest'), col: dark(top, 0.92) }, MH ? { ...neckRing(NK.cutY + 0.044, 0.013), w: W2('chest', 'neck', 0.4), col: dark(top, 0.92) } : { c: [0, 1.462 * s, -0.008], rx: 0.074, rz: 0.07, w: W2('chest', 'neck', 0.3), col: dark(top, 0.92) }], 32, { colFn: (ri, a, r) => (Math.sin(a) > 0.86 ? C(sp.inner || '#e8e4da') : r.col) }); // camp collar, open at the throat
      // untucked shirt tail: one continuous double-sided tube wrapped round the sides and back (front left open between
      // the plackets), hugging the hips with a slight flare. Front edges ride the flap bones, the back the hem bone, the
      // sides stay on the hips, so it swings a little without ever leaving the body as a separate board.
      { const ys = [1.02, 0.99, 0.96, 0.935, 0.915]; const open = 0.4, NC = 30; const P = [], N = [], Wr = [];
        ys.forEach((yy, ri) => { const y = yy * s; const yr = Math.max(y, 0.95 * s); const rx = rxAt(yr) + 0.009 + ri * 0.0035, rz = rzAt(yr) + 0.011 + ri * 0.0035; const row = [], nr = [], wr = [];
          for (let ci = 0; ci <= NC; ci++) { const a = Math.PI / 2 + open + (ci / NC) * (2 * Math.PI - 2 * open); const ca = Math.cos(a), sa = Math.sin(a); row.push([ca * rx, y, sa * rz]); nr.push([ca / rx, 0, sa / rz]);
            const tgt = sa >= 0 ? (ca > 0 ? 'flapL' : 'flapR') + (ri >= 3 ? 2 : 1) : 'hemB1'; const k = smooth01((Math.abs(sa) - 0.3) / 0.45) * [0, 0.35, 0.7, 0.9, 1][ri];
            wr.push(ri === 0 ? tw(y) : k > 0.001 ? W2('hips', tgt, k) : W1('hips')); }
          P.push(row); N.push(nr); Wr.push(wr); });
        sb.grid(P, N, Wr, top, dark(top, 0.62)); }
    }
    if (sp.kit === 'tactical') { // Shashika: vest (accessories pass) + two loose strap ends with buckles, thigh cargo pockets
      const vz = (y, x) => surfZ(y, x, 1) + 0.026; const sc = C('#1d201b');
      for (const [x0, S] of [[0.085 * w, 'A'], [-0.06 * w, 'B']]) { const ys = [1.02, 0.97, 0.915, 0.86]; const P = [], N = [], Wr = [];
        ys.forEach((yy, ri) => { const y = yy * s; const z0 = vz(Math.max(y, 1.02 * s), x0) + ri * 0.003; P.push([[x0 - 0.0125, y, z0], [x0 + 0.0125, y, z0]]); N.push([[0, 0, 1], [0, 0, 1]]); Wr.push(ri === 0 ? tw(y) : ri === 1 ? W1('strap' + S + '1') : ri === 2 ? W2('strap' + S + '1', 'strap' + S + '2', 0.5) : W1('strap' + S + '2')); });
        sb.grid(P, N, Wr, sc, dark(sc, 0.8)); sb.boxPart([x0, 1.005 * s, vz(1.02 * s, x0) + 0.004], 0.03, 0.022, 0.008, tw(1.0 * s), C('#3a3c3a')); }
      for (const side of ['L', 'R']) { const th = J['thigh' + side], sx = Math.sign(th[0]); const x = th[0] + sx * 0.068 * w; sb.boxPart([x, 0.64 * s, 0.012], 0.024, 0.115, 0.1, W1('thigh' + side), dark(bottom, 0.86)); sb.boxPart([x + sx * 0.002, 0.7 * s, 0.012], 0.026, 0.02, 0.104, W1('thigh' + side), dark(bottom, 0.74)); }
    }
    if (sp.kit === 'waistcoat') { // David: waistcoat (V-front, buttons, welt pockets), watch chain to the pocket and a swinging fob (fob bones)
      const wc = C(sp.waist || '#3a3d44'); const ys = Array.from({ length: 15 }, (_, k) => 0.985 + k * 0.03);
      const halfW = (y) => (y < 1.16 ? 0.006 : 0.006 + ((y - 1.16) / 0.26) * 0.085); // straight V: closed at the top button (1.16), open to ±9 cm at the collarbone
      const fzAt = (y) => { let k = 0; while (k < tr.length - 2 && tr[k + 1].y * s < y) k++; const a = tr[k], b2 = tr[k + 1]; return lerp(a.fz || 0, b2.fz || 0, clamp((y / s - a.y) / (b2.y - a.y), 0, 1)); }; // same front bulge as the torso, so the shirt chest never pokes through
      sb.loft(ys.map((yy) => ({ c: [0, yy * s, 0], rx: rxAt(yy * s) + 0.008, rz: rzAt(yy * s) + 0.009, fz: fzAt(yy * s), w: tw(yy * s), col: wc })), 72, { colFn: (ri, a, r) => (Math.sin(a) > 0 && Math.abs(Math.cos(a) * r.rx) < halfW(ys[ri]) * w ? top : r.col) });
      for (let k = 0; k < 5; k++) { const y = (1.0 + k * 0.042) * s; sb.boxPart([0.004, y, surfZ(y, 0, 1) + 0.011], 0.008, 0.008, 0.004, tw(y), C('#1b1c1f')); }
      for (const sx of [-1, 1]) { hstrip(1.06 * s, sx * 0.05 * w, sx * 0.115 * w, 0.007, dark(wc, 0.55)); hstrip(1.25 * s, sx * 0.06 * w, sx * 0.115 * w, 0.007, dark(wc, 0.55)); }
      const gold = C('#c9a54a'); const A = [0.006, 1.085 * s], Bp = [0.1 * w, 1.06 * s]; // chain from the buttonhole into the left pocket
      for (let k = 0; k <= 12; k++) { const t = k / 12; const x = lerp(A[0], Bp[0], t), y = lerp(A[1], Bp[1], t) - 0.022 * Math.sin(Math.PI * t); sb.boxPart([x, y, surfZ(y, x, 1) + 0.013], 0.0045, 0.003, 0.003, tw(y), gold); }
      for (let k = 0; k < 8; k++) { const t = k / 7; const y = lerp(1.1 * s, 1.03 * s, t), x = 0.012 + 0.003 * t; sb.boxPart([x, y, surfZ(1.1 * s, 0, 1) + 0.014], 0.003, 0.0045, 0.003, t < 0.5 ? W1('fob1') : W1('fob2'), gold); }
      sb.ellipsoid([0.015, 1.024 * s, surfZ(1.1 * s, 0, 1) + 0.016], 0.008, 0.008, 0.002, W1('fob2'), gold, { lat: 6, lon: 10 }); // fob medallion
    }
    band(0.962 * s, 0.992 * s, 0.004, C('#24180f'), W1('hips')); // belt
    sb.boxPart([0, 0.977 * s, surfZ(0.977 * s, 0, 1) + 0.008], 0.044, 0.034, 0.007, W1('hips'), C('#a8a6a0')); // buckle
    vstrip(0, 0.865 * s, 0.955 * s, 0.004, dark(bottom, 0.7)); // fly
    for (const sx of [-1, 1]) hstrip(0.9 * s, sx * 0.035 * w, sx * 0.118 * w, 0.072, dark(bottom, 0.86), -1); // back pockets
  }
  // ---- accessories (each placed on the clothing surface or the head shell so nothing sinks into the body)
  const band = (pts, width, col, wgtFn) => { sb.strip(pts.map((p, i) => { const nx = pts[Math.min(i + 1, pts.length - 1)], pv = pts[Math.max(i - 1, 0)]; const d = new THREE.Vector3(nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]).normalize(); const out = new THREE.Vector3(p[0], 0, p[2]).normalize(); const side = new THREE.Vector3().crossVectors(d, out).normalize(); return { c: p, side: [side.x, side.y, side.z], out: [out.x, out.y, out.z], w: wgtFn(p[1]) }; }), width, (q) => q.out, null, col, 0); };
  const torsoW = (y) => (y > 1.3 * s ? W1('chest') : y > 1.1 * s ? W2('spine', 'chest', 0.5) : W1('hips'));
  if (sp.sunglasses) { const gz = hc[2] + hr[2] - 0.003, gy = hc[1] + 0.005, k = C('#0d0f12'); for (const sx of [-1, 1]) { sb.boxPart([sx * 0.034, gy, gz], 0.042, 0.026, 0.005, W1('head'), k); sb.boxPart([sx * (hr[0] + 0.001), gy + 0.008, hc[2] + hr[2] * 0.35], 0.004, 0.005, hr[2] * 1.15, W1('head'), k); } sb.boxPart([0, gy + 0.009, gz + 0.001], 0.03, 0.005, 0.005, W1('head'), k); }
  if (sp.cap) {
    const cr = Math.max(1.12, hairLift + 0.03);
    if (sp.capStyle === 'skull') sb.ellipsoid([hc[0], hc[1] + 0.036, hc[2] - 0.004], hr[0] * Math.max(1.07, hairLift + 0.02), hr[1] * 0.8, hr[2] * Math.max(1.07, hairLift + 0.02), W1('head'), C(sp.cap), { lat: 6, lon: 16, p0: 0, p1: Math.PI * 0.36 });
    else if (sp.capStyle === 'nurse') { sb.boxPart([0, hc[1] + hr[1] * 0.98, hc[2] + 0.01], 0.11, 0.03, 0.08, W1('head'), C('#ffffff')); sb.boxPart([0, hc[1] + hr[1] * 0.98 + 0.012, hc[2] + 0.052], 0.1, 0.012, 0.006, W1('head'), C('#2a4a8a')); }
    else if (sp.capStyle === 'peaked') { // police service cap: band, flared crown, black visor, gold badge
      const br = Math.max(1.075, hairLift + 0.015), top = hc[1] + hr[1] * Math.max(1.0, hairLift) + 0.022, b0 = hc[1] + 0.036, bandC = C(sp.capBand || '#141821'), crownC = C(sp.cap), hw = W1('head');
      const ring = (y, k, col) => ({ c: [0, y, hc[2] - 0.004 * (k - 1)], rx: hr[0] * k, rz: hr[2] * k, w: hw, col });
      sb.loft([ring(b0, br, bandC), ring(b0 + 0.042, br + 0.005, bandC), ring(b0 + 0.046, br + 0.01, crownC), ring(top - 0.016, br + 0.22, crownC), ring(top - 0.004, br + 0.2, crownC), ring(top, br + 0.12, crownC)], 16, { capEnd: true });
      sb.boxPart([0, b0 + 0.006, hc[2] + hr[2] * br + 0.028], 0.16, 0.008, 0.068, hw, C('#08090b')); // visor
      sb.boxPart([0, b0 + 0.004, hc[2] + hr[2] * br + 0.06], 0.13, 0.006, 0.012, hw, C('#08090b'));
      sb.boxPart([0, b0 + 0.06, hc[2] + hr[2] * (br + 0.09) + 0.004], 0.036, 0.034, 0.008, hw, C('#d9b13b')); // badge
      if (sp.capCord) sb.boxPart([0, b0 + 0.022, hc[2] + hr[2] * br + 0.004], 0.15, 0.007, 0.006, hw, C(sp.capCord)); }
    else if (sp.capStyle === 'helmet') { const hw = W1('head'); // open-face motorcycle helmet with a peak
      sb.ellipsoid([hc[0], hc[1] + 0.04, hc[2] - 0.01], hr[0] * 1.28, hr[1] * 1.0, hr[2] * 1.24, hw, C(sp.cap), { lat: 8, lon: 16, p0: 0, p1: Math.PI * 0.56 });
      sb.boxPart([0, hc[1] + 0.052, hc[2] + hr[2] * 1.2 + 0.012], 0.13, 0.008, 0.05, hw, C('#1a1d24')); }
    else { sb.ellipsoid([hc[0], hc[1] + 0.03, hc[2]], hr[0] * cr, hr[1] * 0.85, hr[2] * cr, W1('head'), C(sp.cap), { lat: 6, lon: 14, p0: 0, p1: Math.PI * 0.42 });
      sb.boxPart([0, hc[1] + 0.03 + hr[1] * 0.85 * Math.cos(Math.PI * 0.42) - 0.002, hc[2] + hr[2] * cr * 0.97 + 0.03], 0.15, 0.008, 0.075, W1('head'), C(sp.cap)); } // peak
  }
  if (sp.bag) { // backpack with shoulder straps
    const bz = surfZ(1.22 * s, 0, -1) - 0.062; sb.boxPart([0, 1.2 * s, bz], 0.28 * w, 0.36, 0.12, W1('chest'), C(sp.bag)); sb.boxPart([0, 1.08 * s, bz - 0.065], 0.22 * w, 0.12, 0.02, W1('chest'), C(sp.bag).map((v) => v * 0.8));
    for (const sx of [-1, 1]) band([1.46, 1.4, 1.32, 1.24, 1.16].map((y, i) => { const x = sx * (0.085 + i * 0.012) * w; return i === 0 ? [x, y * s, 0.0] : [x, y * s, surfZ(y * s, x, 1) + 0.006]; }), 0.036, C(sp.bag).map((v) => v * 0.7), torsoW);
  }
  if (sp.crossbody) { // strap from the left shoulder across the chest to a small bag at the right hip (front) and across the back
    const sc = C(sp.crossbody).map((v) => v * 0.8); const ys = [1.45, 1.38, 1.3, 1.22, 1.14, 1.06];
    band(ys.map((y, i) => { const t = i / (ys.length - 1); const x = lerp(0.1, -0.13, t) * w; return i === 0 ? [x, y * s, 0.0] : [x, y * s, surfZ(y * s, x, 1) + 0.007]; }), 0.026, sc, torsoW);
    band(ys.map((y, i) => { const t = i / (ys.length - 1); const x = lerp(0.1, -0.13, t) * w; return i === 0 ? [x, y * s, 0.0] : [x, y * s, surfZ(y * s, x, -1) - 0.007]; }), 0.026, sc, torsoW);
    const bx = -0.13 * w; sb.boxPart([bx, 1.0 * s, surfZ(1.0 * s, bx, 1) + 0.03], 0.15, 0.12, 0.05, W1('hips'), C(sp.crossbody));
  }
  if (sp.lanyard) { const lc = C(sp.lanyard); const cz = surfZ(1.2 * s, 0, 1) + 0.007;
    for (const sx of [-1, 1]) band([[sx * 0.058, 1.47 * s, 0.0], [sx * 0.05, 1.41 * s, surfZ(1.41 * s, 0.05, 1) + 0.005], [sx * 0.026, 1.31 * s, surfZ(1.31 * s, 0.026, 1) + 0.005], [sx * 0.006, 1.25 * s, surfZ(1.25 * s, 0, 1) + 0.006]], 0.014, lc, torsoW);
    if (sp.lanyardCard !== false) { sb.boxPart([0, 1.2 * s, cz], 0.056, 0.082, 0.005, W1('chest'), C('#f4f4f0')); sb.boxPart([0, 1.233 * s, cz + 0.001], 0.056, 0.016, 0.005, W1('chest'), lc); } }
  if (sp.cord) band([[0.125 * w, 1.44 * s, 0.0], [0.11 * w, 1.4 * s, surfZ(1.4 * s, 0.11 * w, 1) + 0.005], [0.085 * w, 1.33 * s, surfZ(1.33 * s, 0.085 * w, 1) + 0.006], [0.07 * w, 1.29 * s, surfZ(1.29 * s, 0.07 * w, 1) + 0.006]], 0.01, C(sp.cord), torsoW); // whistle cord: left shoulder to breast pocket
  if (sp.uniformShirt) { // service shirt details (photo refs): two breast pockets with buttoned flaps, front button placket, name plate over the right pocket
    const pc = C(sp.top).map((v) => v * 0.93), fc = C(sp.top).map((v) => v * 0.84), btn = C('#b89a52'), wc = W1('chest');
    for (const sx of [-1, 1]) { const x = sx * 0.074 * w, y = 1.295 * s, z = surfZ(y, x, 1); sb.boxPart([x, y, z + 0.003], 0.066, 0.078, 0.005, wc, pc);
      const yf = y + 0.04, zf = surfZ(yf, x, 1); sb.boxPart([x, yf, zf + 0.006], 0.07, 0.022, 0.006, wc, fc); sb.boxPart([x, yf - 0.004, zf + 0.01], 0.011, 0.011, 0.004, wc, btn); }
    for (let k = 0; k < 5; k++) { const y = (1.42 - k * 0.095) * s; sb.boxPart([0, y, surfZ(y, 0, 1) + 0.004], 0.011, 0.011, 0.004, k < 2 ? wc : W2('spine', 'chest', 0.4), btn); }
    { const x = -0.074 * w, y = 1.372 * s, z = surfZ(y, x, 1); sb.boxPart([x, y, z + 0.005], 0.062, 0.015, 0.004, wc, C('#141414')); sb.boxPart([x, y, z + 0.008], 0.046, 0.005, 0.002, wc, C('#e8e8e4')); }
  }
  if (sp.watch) { const h = J.handL; const wc = C(sp.watch);
    sb.loft([{ c: [h[0], 0.893 * s, 0], rx: 0.031, rz: 0.033, w: W1('foreL'), col: C('#1a1a1a') }, { c: [h[0], 0.909 * s, 0], rx: 0.031, rz: 0.033, w: W1('foreL'), col: C('#1a1a1a') }], 10);
    sb.boxPart([h[0] + 0.03, 0.901 * s, 0.0], 0.008, 0.026, 0.026, W1('foreL'), wc); }
  if (sp.earrings) for (const sx of [-1, 1]) sb.ellipsoid([sx * (hr[0] * 1.02 + 0.002), hc[1] - 0.034, hc[2] - 0.006], 0.006, 0.009, 0.006, W1('head'), C('#d4a640'), { lat: 4, lon: 6 });
  if (sp.necklace) sb.loft([{ c: [0, 1.448 * s, 0.008], rx: 0.084, rz: 0.07, w: W1('chest'), col: C('#d4a640') }, { c: [0, 1.456 * s, 0.006], rx: 0.08, rz: 0.066, w: W1('chest'), col: C('#d4a640') }], 14);
  if (sp.epaulettes) for (const side of ['L', 'R']) { const a = J['arm' + side]; const ec = C(sp.epaulettes === true ? (sp.bottom || '#1f2a44') : sp.epaulettes); sb.boxPart([a[0] * 0.8, 1.392 * s + 0.047, -0.004], 0.075, 0.008, 0.042, W2('chest', 'arm' + side, 0.4), ec);
    for (let k = 0; k < (sp.pips || 0); k++) sb.boxPart([a[0] * (0.68 + k * 0.1), 1.392 * s + 0.053, -0.004], 0.012, 0.005, 0.012, W2('chest', 'arm' + side, 0.4), C('#e2bd48')); } // rank pips
  if (sp.vest) { const vc = C(sp.vest); const idx = [2, 3, 4, 5, 6].map((i) => i + RO); // tactical vest: a shell just outside the shirt from waist to chest, with pouches
    sb.loft(idx.map((i) => ({ c: [0, tr[i].y * s, 0], rx: tr[i].rx + 0.02, rz: tr[i].rz + 0.022, fz: tr[i].fz, bust: tr[i].bust, w: tr[i].wgt, col: vc })), f ? 28 : 16, { capStart: false, capEnd: false });
    for (const bx of [-0.07, 0, 0.07]) sb.boxPart([bx * w, 1.1 * s, surfZ(1.1 * s, bx * w, 1) + 0.03], 0.055, 0.07, 0.03, W2('spine', 'chest', 0.3), vc.map((v) => v * 0.8));
    if (!sp.hero) sb.boxPart([0, 1.3 * s, surfZ(1.3 * s, 0, -1) - 0.024], 0.2 * w, 0.045, 0.004, W1('chest'), C('#e9e9e2')); } // light panel across the back (police)
  if (sp.belt) { const bc = C(sp.belt); const i0 = tr[1 + RO], i1 = tr[2 + RO]; const yb = 0.965 * s, t = (0.965 - i0.y) / (i1.y - i0.y); const rx = lerp(i0.rx, i1.rx, t) + 0.009, rz = lerp(i0.rz, i1.rz, t) + 0.009;
    sb.loft([{ c: [0, yb - 0.022, 0], rx, rz, w: W1('hips'), col: bc }, { c: [0, yb + 0.022, 0], rx, rz, w: W1('hips'), col: bc }], 16, { capStart: false, capEnd: false });
    sb.boxPart([0, yb, rz + 0.004], 0.05, 0.036, 0.008, W1('hips'), C(sp.buckle || '#c9cdd2'));
    if (sp.holster) { sb.boxPart([-(rx + 0.012), yb - 0.075, 0.03], 0.04, 0.13, 0.085, W1('hips'), C('#121212')); sb.boxPart([-(rx + 0.006), yb - 0.01, 0.03], 0.02, 0.04, 0.05, W1('hips'), C('#121212')); }
    if (sp.pouch) sb.boxPart([rx + 0.01, yb - 0.035, 0.05], 0.03, 0.06, 0.05, W1('hips'), C('#121212')); }
  if (sp.strap) { // Sam Browne cross strap: ONE continuous band, left hip → up the chest → over the right shoulder → down the back → left hip.
    // It lies on the torso clear of the shirt details (pocket flaps / buttons stand up to 12 mm), and over the shoulder its
    // surface normal points up (the old version met at a point inside the trapezius and twisted there).
    const sc = C(sp.strap); const offF = sp.vest ? 0.03 : 0.017, offB = sp.vest ? 0.03 : 0.012;
    const ring = (y) => { let k = 0; while (k < tr.length - 2 && tr[k + 1].y * s < y) k++; const a = tr[k], b2 = tr[k + 1]; const t = clamp((y / s - a.y) / (b2.y - a.y), 0, 1); return { rx: lerp(a.rx, b2.rx, t), rz: lerp(a.rz, b2.rz, t), cz: lerp(a.cz || 0, b2.cz || 0, t) }; };
    const xAt = (y) => lerp(-0.095, 0.13, clamp((1.45 - y / s) / 0.46, 0, 1)) * w; const x0 = xAt(1.45 * s);
    let topY = 1.40 * s; for (let y = 1.56 * s; y > 1.36 * s; y -= 0.002) if (ring(y).rx >= Math.abs(x0) + 0.004) { topY = y; break; } // shoulder-top height under the strap
    const P = [], ysF = [0.99, 1.06, 1.14, 1.22, 1.3, 1.37];
    const bodyPt = (y, sg) => { const x = xAt(y * s), r = ring(y * s), q = clamp(Math.abs(x) / r.rx, 0, 0.98), sa = Math.sqrt(1 - q * q); const z = surfZ(y * s, x, sg) + sg * (sg > 0 ? offF : offB); return { c: [x, y * s, z], out: new THREE.Vector3(x / r.rx * 0.6, 0, sg * sa).normalize() }; };
    for (const y of ysF) P.push(bodyPt(y, 1));
    const rT = ring(topY - 0.02); const zF = rT.cz + rT.rz * 0.72, zB = rT.cz - rT.rz * 0.72;
    for (const [z, up, fw] of [[zF + offF * 0.7, 0.55, 0.85], [zF * 0.45, 0.9, 0.45], [rT.cz, 1, 0], [zB * 0.45, 0.9, -0.45], [zB - offB * 0.7, 0.55, -0.85]]) P.push({ c: [x0, topY + 0.012 - 0.02 * (1 - up), z], out: new THREE.Vector3(0, up, fw).normalize() });
    for (const y of [...ysF].reverse()) P.push(bodyPt(y, -1));
    sb.strip(P.map((p, i) => { const a = P[Math.max(0, i - 1)].c, b = P[Math.min(P.length - 1, i + 1)].c; const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize(); const side = new THREE.Vector3().crossVectors(d, p.out).normalize();
      return { c: p.c, side: [side.x, side.y, side.z], out: [p.out.x, p.out.y, p.out.z], w: p.c[1] > 1.3 * s ? W1('chest') : torsoW(p.c[1]) }; }), 0.034, (q) => q.out, null, sc, 0); }
  const geo = sb.build(); geo.userData.parts = parts; return geo;
}

// ------------------------------------------------------------------ shared materials
let atlasTex = null; const faceMats = new Map(); let bodyMat = null;
function fabricAtlas() {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  const src = [TEX.weave, TEX.saree, TEX.batik, TEX.plaid];
  const at = [[0, 0], [256, 0], [0, 256], [256, 256]]; // canvas y down: region [u0,v0] (0,0.5) is top-left
  src.forEach((t, i) => { if (t && t.image) g.drawImage(t.image, at[i][0], at[i][1], 256, 256); else { g.fillStyle = '#eee'; g.fillRect(at[i][0], at[i][1], 256, 256); } });
  // hand/skin/box parts use (0.01,0.51) → plain region top-left; keep it neutral
  atlasTex = new THREE.CanvasTexture(c); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4; return atlasTex;
}
// Hair: strand-direction (Kajiya–Kay) dual-lobe highlights — a bright, tight primary sheen and a broader, hair-tinted
// secondary one — plus fine procedural strand variation, all computed along the crown→tips flow, so black/brown/grey hair
// reads as hair (glossy bands that move with the light) rather than painted plastic.
let hairMat = null;
export function getHairMaterial() {
  if (hairMat) return hairMat;
  hairMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
  hairMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float hph = atan(vHP.x, vHP.z);
        float strand = 0.5 + 0.25 * sin(hph * 160.0 + sin(hph * 23.0) * 2.0 + vHP.y * 30.0) + 0.25 * sin(hph * 411.0 - vHP.y * 55.0);
        diffuseColor.rgb *= 0.8 + 0.32 * strand;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          vec3 Lh = directionalLights[0].direction; vec3 Vh = normalize(vViewPosition);
          vec3 dn = normalize((viewMatrix * vec4(0.0, -1.0, 0.0, 0.0)).xyz);
          vec3 Th = dn - normal * dot(dn, normal); Th = length(Th) > 1e-3 ? normalize(Th) : vec3(0.0, 1.0, 0.0);
          float sh1 = (strand - 0.5) * 0.18;
          vec3 T1 = normalize(Th + normal * (0.10 + sh1)), T2 = normalize(Th - normal * (0.16 - sh1));
          vec3 Hh = normalize(Lh + Vh);
          float d1 = dot(T1, Hh), d2 = dot(T2, Hh);
          float s1 = pow(sqrt(max(0.0, 1.0 - d1 * d1)), 260.0), s2 = pow(sqrt(max(0.0, 1.0 - d2 * d2)), 40.0);
          float lit = smoothstep(-0.1, 0.35, dot(normal, Lh));
          reflectedLight.directSpecular += directionalLights[0].color * lit * (s1 * 0.045 + s2 * 0.12 * (diffuseColor.rgb * 2.0 + 0.012)) * (0.7 + 0.6 * strand);
        }
        #endif`);
  };
  return hairMat;
}
export function getBodyMaterial() { if (!bodyMat) bodyMat = new THREE.MeshStandardMaterial({ map: fabricAtlas(), vertexColors: true, roughness: 0.85 }); return bodyMat; }
export function getFaceMaterial(key, opts) {
  if (!faceMats.has(key)) faceMats.set(key, new THREE.MeshStandardMaterial({ map: faceAtlas(opts), vertexColors: true, roughness: 0.62 }));
  return faceMats.get(key);
}

// ------------------------------------------------------------------ skeleton
let bindInverse = new Map();
export function makeSkeleton(sp, key) {
  const hero = !!sp.hero; const names = hero ? BONES.concat(HERO_EXTRA) : BONES; const J = joints(sp); if (hero) Object.assign(J, heroJoints(sp, J)); if (hero) key += '|hero';
  const bones = names.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
  names.forEach((n, i) => { const p = n in PARENT ? PARENT[n] : HERO_PARENT[n]; const jp = J[n]; if (p) { const pp = J[p]; bones[i].position.set(jp[0] - pp[0], jp[1] - pp[1], jp[2] - pp[2]); bones[B[p]].add(bones[i]); } else bones[i].position.set(jp[0], jp[1], jp[2]); });
  bones[0].updateMatrixWorld(true);
  let inv = bindInverse.get(key); if (!inv) { inv = bones.map((b) => new THREE.Matrix4().copy(b.matrixWorld).invert()); bindInverse.set(key, inv); }
  return { bones, skeleton: new THREE.Skeleton(bones, inv) };
}

// ------------------------------------------------------------------ appearance generator
const SKINS = ['#8d5a3b', '#9b6644', '#7a4a2e', '#a8734f', '#6b4128', '#b07c56', '#82543a', '#5e3a24'];
const SHIRTS = ['#f2f2ee', '#dfe8f2', '#3b5f8c', '#7c2f2f', '#2f6b4f', '#c9a227', '#555b66', '#e4d3b5', '#8a5aa8', '#d96c3b', '#1f2a3a', '#b8c4a8'];
const TROUSERS = ['#2b2e36', '#3a3f4a', '#4a4036', '#1e2430', '#6b6355', '#384a63', '#2a2a2a'];
const SAREE = ['#b0233a', '#e07b1a', '#1b6b6b', '#6a2a7a', '#c72f6c', '#2c4f9e', '#d4a12a', '#0f7a4a', '#8c1c2c', '#e65a8a'];
// Adults only (18+): every civilian comes from the preset generator in Appearance.js (46 presets, seeded variation).
export function randomSpec(seed, opts = {}) { return makeAppearance(seed, opts); }
export const HEROES = {
  // the three playable protagonists (high-detail build + 70-bone rig)
  dineth: { seed: 11, hero: true, mh: 'dineth', kit: 'openShirt', sex: 'm', age: 'adult', skin: '#8a5636', build: 0.98, height: 1.74, outfit: 'jacket', top: '#7b2d26', inner: '#ece7dc', bottom: '#28303d', shoes: '#e4e1da', sole: '#cfcac0', longSleeve: false, hair: 'quiff', hairColor: '#0f0b08', collar: true, sandals: false },
  shashika: { seed: 12, hero: true, mh: 'shashika', kit: 'tactical', sex: 'm', age: 'adult', skin: '#6b4228', build: 1.18, height: 1.8, outfit: 'shirt', top: '#4b5240', bottom: '#5b5745', shoes: '#1f1b17', boots: true, longSleeve: true, vest: '#2b2e27', strap: '#1b1c19', tacGloves: '#1c1c1a', hair: 'crew', hairColor: '#0c0a08', beard: true, beardShort: true, collar: true, sandals: false },
  david: { seed: 13, hero: true, mh: 'david', kit: 'waistcoat', sex: 'm', age: 'adult', skin: '#94613f', build: 0.95, height: 1.78, outfit: 'shirt', top: '#cfdae6', bottom: '#2d2f33', shoes: '#121212', longSleeve: true, waist: '#3a3d44', hair: 'sidepart', hairColor: '#120d0a', glasses: true, moustache: true, collar: true, sandals: false },
  ruwan: { seed: 2, sex: 'm', age: 'adult', skin: '#7a4a2e', build: 1.1, height: 1.71, outfit: 'shirt', top: '#6d3b2c', bottom: '#3a3f4a', shoes: '#151515', hair: 'short', hairColor: '#0d0a08', moustache: true, collar: true, sandals: false },
  fathima: { seed: 3, sex: 'f', age: 'adult', skin: '#a8734f', build: 1.05, height: 1.58, outfit: 'salwar', top: '#1b6b6b', skirt: 'knee', skirtCol: '#1b6b6b', bottom: '#f2efe6', pattern: 2, hair: 'bun', hairColor: '#1c140e', longSleeve: true, sandals: true },
  selvaraj: { seed: 4, sex: 'm', age: 'elder', skin: '#5e3a24', build: 1.08, height: 1.68, outfit: 'shirt', top: '#f2f2ee', bottom: '#4a4036', hair: 'grey', hairColor: '#b8b6b0', moustache: true, glasses: true, collar: true, sandals: true },
  bandara: { seed: 5, sex: 'm', age: 'elder', skin: '#82543a', build: 1.15, height: 1.66, outfit: 'national', top: '#f6f4ee', bottom: '#f6f4ee', skirt: 'ankle', skirtCol: '#f4f2ea', longSleeve: true, hair: 'bald', hairColor: '#c8c6c0', moustache: true, sandals: true },
  anjali: { seed: 6, sex: 'f', age: 'adult', skin: '#9b6644', build: 0.98, height: 1.63, outfit: 'tee_jeans', top: '#2f4f6b', bottom: '#1f2a3a', shoes: '#e8e8e4', hair: 'long', hairColor: '#0b0908', sandals: false, bag: '#5a3a2a' },
  dilan: { seed: 7, sex: 'm', age: 'adult', skin: '#a8734f', build: 1.06, height: 1.79, outfit: 'office', top: '#f0f0ee', bottom: '#1e2430', longSleeve: true, collar: true, hair: 'short', hairColor: '#0d0a08', glasses: true, tie: '#1f2a5a', sandals: false },
  nalin: { seed: 8, sex: 'm', age: 'adult', skin: '#6b4128', build: 1.22, height: 1.8, outfit: 'shirt', top: '#151515', bottom: '#2a2a2a', hair: 'short', hairColor: '#0b0908', beard: true, collar: true, sandals: false, bangles: true },
};

// ------------------------------------------------------------------ Character instance
const geoCache = new Map(); const headCache = new Map();
// 1 for skin vertices (exact skin colour, plus every head-group vertex), 0 for clothing — drives the subsurface / sweat terms
function skinMask(geo, spec) {
  const col = geo.attributes.color, n = col.count, out = new Float32Array(n); const sk = C(spec.skin);
  for (let i = 0; i < n; i++) out[i] = Math.abs(col.getX(i) - sk[0]) + Math.abs(col.getY(i) - sk[1]) + Math.abs(col.getZ(i) - sk[2]) < 0.012 ? 1 : 0;
  const g = geo.groups[1]; if (g) { const ix = geo.index; for (let k = g.start; k < g.start + g.count; k++) out[ix.getX(k)] = 1; }
  return out;
}
export class Character {
  constructor(spec) {
    this.spec = spec; const key = JSON.stringify(spec); const skelKey = `${spec.sex}|${spec.height.toFixed(3)}|${spec.build.toFixed(3)}`;
    let geo = geoCache.get(key); if (!geo) { geo = buildBodyGeometry(spec); geoCache.set(key, geo); }
    const { bones, skeleton } = makeSkeleton(spec, skelKey);
    const fv = spec.faceV != null ? FACE_VARIANTS[spec.faceV] : null; let faceMat;
    if (fv) faceMat = getFaceMaterial(`v${spec.faceV}`, { female: spec.sex === 'f', stubble: fv.stubble || 0, seed: spec.faceV, lips: fv.lips, size: 192, v: fv });
    else { const stub = spec.beard ? 0.9 : spec.sex === 'm' && spec.age === 'adult' ? 0.35 : 0; faceMat = getFaceMaterial(`${spec.sex}|${stub}|${spec.seed % 2}`, { female: spec.sex === 'f', stubble: stub, seed: spec.seed % 2, lips: spec.sex === 'f' ? '#8a3a3a' : '#7a4a40' }); }
    this.face = new FaceRig(this, faceMat);
    let mats = [getBodyMaterial(), this.face.mat, getHairMaterial()];
    if (spec.hero) { // protagonists: own material instances with DQ skinning, subsurface skin, wetness / sweat, expression normals
      if (!geo.attributes.aSkin) geo.setAttribute('aSkin', new THREE.Float32BufferAttribute(skinMask(geo, spec), 1));
      this.heroU = heroUniforms(); const hb = getHairMaterial(); const fn = faceNormals();
      const body = getBodyMaterial().clone(); patchHeroMaterial(body, 'body', this.heroU); iblScale(body, 0.55, 1.0, 0.5);
      const fm = this.face.mat; if (fn.base) { fm.normalMap = fn.base; fm.normalScale = new THREE.Vector2(0.35, -0.35); } patchHeroMaterial(fm, 'face', this.heroU);
      const hm = hb.clone(); patchHeroMaterial(hm, 'hair', this.heroU, hb.onBeforeCompile); mats = [body, fm, hm]; this.heroMats = [body, hm];
    }
    this.mesh = new THREE.SkinnedMesh(geo, mats);
    this.mesh.add(bones[0]); this.mesh.bind(skeleton); this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3); this.mesh.castShadow = true; this.mesh.receiveShadow = false; this.mesh.frustumCulled = true;
    this.root = new THREE.Group(); this.root.add(this.mesh);
    this.bones = Object.fromEntries(bones.map((b) => [b.name, b])); this.hipY = bones[0].position.y;
    if (spec.hero && hasHeroHead(spec)) this.attachHeroHead(skeleton);
    this.anim = new Animator(this); if (spec.hero) this.rig = new HeroRig(this);
    LIVE.add(this);
  }
  // protagonist head (HeroHead.js): a second SkinnedMesh on the same skeleton (child of the body mesh, so visibility,
  // falls and the first-person head hide all apply), eyeballs + glasses as rigid children of the head bone
  attachHeroHead(skeleton) {
    const sp = this.spec; const key = [sp.mh, sp.height, sp.skin, sp.hair, sp.hairColor, !!sp.beard, !!sp.moustache, !!sp.glasses, sp.hairline || 0].join('|');
    let H = headCache.get(key); if (!H) { H = buildHeroHead(sp, { head: B.head, neck: B.neck, chest: B.chest }); headCache.set(key, H); }
    const mats = headMaterials(sp, H, this.heroU);
    const m = new THREE.SkinnedMesh(H.geometry, mats); m.name = 'heroHead'; m.userData.keys = H.keys;
    this.mesh.add(m); m.bind(skeleton, this.mesh.bindMatrix); m.castShadow = true; m.receiveShadow = false; m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3);
    this.head = m; this.headMats = mats; const hb = this.bones.head; const jh = joints(sp).head;
    this.eyes = H.eyes.map((e) => { const piv = new THREE.Object3D(); piv.position.set(e.pos[0] - jh[0], e.pos[1] - jh[1], e.pos[2] - jh[2]); piv.add(buildEyeball(e.r)); hb.add(piv); return piv; });
    if (H.glasses) { const gl = H.glasses.clone(); gl.position.set(H.fit.o[0] - jh[0], H.fit.o[1] - jh[1], H.fit.o[2] - jh[2]); hb.add(gl); this.glasses = gl; }
    this.face.attachMorphs(m, this.eyes);
  }
  dispose() { LIVE.delete(this); this.mesh.skeleton.dispose(); this.face.dispose(); if (this.heroMats) for (const m of this.heroMats) m.dispose(); if (this.headMats) for (const m of this.headMats) m.dispose(); }
  // convenience for gameplay code: expression for a while, or talking on/off
  express(name, dur = 2.5) { this.face.set(name, dur); }
}

// ------------------------------------------------------------------ facial animation
// Each character owns a material clone whose map is a clone of the shared expression atlas (the GPU image is shared;
// only the UV offset differs). Blinks are random per person (never in sync), talking flaps the mouth, expressions are
// timed, idle eyes glance around. Beyond ~28 m faces stop updating (LOD) since the detail is not visible.
export const CAM = new THREE.Vector3(); // set every frame by the game
const FIDX = Object.fromEntries(FACE_FRAMES.map((n, i) => [n, i]));
export class FaceRig {
  constructor(ch, base) {
    this.ch = ch; this.mat = base.clone(); this.mat.map = base.map.clone(); this.frame = -1;
    this.expr = 'neutral'; this.exprT = 0; this.mood = 'neutral'; this.blinkT = 0.5 + Math.random() * 4; this.blink = 0; this.talking = false; this.flapT = 0; this.flap = 0; this.glanceT = 2 + Math.random() * 5; this.glance = null;
    this.show(0);
  }
  // protagonists: drive the head's expression morphs and eyeballs instead of atlas frames
  attachMorphs(mesh, eyes) { this.morph = mesh; this.eyes = eyes; this.mw = new Float32Array(HEAD_MORPHS.length); this.mt = new Float32Array(HEAD_MORPHS.length); this.gaze = [0, 0]; this.sacc = [0, 0]; this.saccT = 0.5; this.flapAmp = 0.5; }
  drive(dt, f) {
    const t = this.mt; t.fill(0); const base = this.expr === 'talk' || this.expr === 'blink' || this.expr === 'lookL' || this.expr === 'lookR' ? 'neutral' : this.expr;
    const ex = EXPR_MORPHS[base] || {}; for (const k in ex) t[morphIndex(k)] = ex[k];
    const jaw = morphIndex('jaw'); if (this.talking) { t[jaw] = Math.max(t[jaw], this.flap ? 0.16 + 0.24 * this.flapAmp : 0.025); t[morphIndex('stretch')] += this.flap ? 0.08 * this.flapAmp : 0; t[morphIndex('pucker')] += this.flap ? 0 : 0.12 * this.flapAmp; }
    let b = this.blink > 0 ? Math.sin(Math.PI * clamp(1 - this.blink / 0.13, 0, 1)) : 0; if (base === 'surprise') b = 0; if (this.expr === 'blink') b = 1;
    const bl = morphIndex('blinkL'), br = morphIndex('blinkR'); t[bl] = Math.max(t[bl], b); t[br] = Math.max(t[br], b);
    const W = this.mw, inf = this.morph.morphTargetInfluences; for (let i = 0; i < W.length; i++) { const rate = i === bl || i === br ? 70 : i === jaw ? 30 : 10; W[i] += (t[i] - W[i]) * (1 - Math.exp(-rate * dt)); inf[i] = W[i]; }
    this.saccT -= dt; if (this.saccT < 0) { this.sacc = [(Math.random() - 0.5) * 0.09, (Math.random() - 0.5) * 0.05]; this.saccT = 0.35 + Math.random() * 1.8; } // micro-saccades
    const gy = (f === 'lookL' ? 0.34 : f === 'lookR' ? -0.34 : 0) + this.sacc[0], gp = this.sacc[1] + b * 0.18 + (base === 'concern' || base === 'pain' ? 0.06 : 0);
    const k = 1 - Math.exp(-28 * dt); this.gaze[0] += (gy - this.gaze[0]) * k; this.gaze[1] += (gp - this.gaze[1]) * k;
    for (const e of this.eyes) e.rotation.set(this.gaze[1], this.gaze[0], 0);
  }
  set(name, dur = 2.5) { if (!(name in FIDX)) return; this.expr = name; this.exprT = dur; if (name === 'surprise' || name === 'fear') this.blinkT = Math.max(this.blinkT, 1.2); }
  show(i) { if (i === this.frame) return; this.frame = i; this.mat.map.offset.y = 1 - (i + 1) / FACE_FRAMES.length; }
  update(dt) {
    const e = this.ch.root.matrixWorld.elements; const d2 = (e[12] - CAM.x) ** 2 + (e[13] - CAM.y) ** 2 + (e[14] - CAM.z) ** 2;
    if (d2 > 28 * 28 && CAM.lengthSq() > 0) { if (this.frame !== 0 && this.frame !== FIDX[this.mood]) this.show(FIDX[this.mood] || 0); return; }
    if (this.exprT > 0) { this.exprT -= dt; if (this.exprT <= 0) this.expr = this.mood; }
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.13; this.blinkT = 2 + Math.random() * 4.5 + (Math.random() < 0.15 ? -1.6 : 0); } // occasional double blink
    if (this.blink > 0) this.blink -= dt;
    this.glanceT -= dt; if (this.glanceT < 0) { this.glance = this.glance ? null : Math.random() < 0.5 ? 'lookL' : 'lookR'; this.glanceT = this.glance ? 0.5 + Math.random() * 1.2 : 2.5 + Math.random() * 6; }
    let f = this.expr;
    if (this.talking) { this.flapT -= dt; if (this.flapT < 0) { this.flap = this.flap ? 0 : 1; this.flapAmp = Math.random(); this.flapT = (this.flap ? 0.08 : 0.06) + Math.random() * 0.12; } f = this.flap ? 'talk' : this.expr === 'talk' ? 'neutral' : this.expr; }
    else if (f === 'neutral' && this.glance) f = this.glance;
    if (this.morph) this.drive(dt, f);
    if (this.blink > 0 && f !== 'surprise') f = 'blink';
    this.show(FIDX[f] ?? 0);
  }
  dispose() { this.mat.map.dispose(); this.mat.dispose(); }
}

// ------------------------------------------------------------------ procedural animator
// Locomotion is distance-driven: the gait cycle advances by distance travelled / stride length, the planted foot moves
// back at exactly the body speed (no foot sliding), and the hip height is solved from the planted leg(s) so feet neither
// sink nor float. Each character has a gait profile (stride, cadence, arm swing, bounce, posture...) derived from age,
// sex, build and a per-person seed, so people walk differently rather than just at different speeds.
// state: speed (m/s), action (null|'sit'|'talk'|'phone'|'wave'|'dance'|'stretch'|'look'|'cower'|'argue'|'stumble'|'jump'|'drive'|'crouch'|'shove'|'point'|'clap'|'browse'|'umbrella'|...), turn rate (rad/s)
export function gaitProfile(sp) {
  const r = new RNG((sp.seed || 1) * 977 + 13); const f = sp.sex === 'f'; const age = sp.age || 'adult';
  const elder = age === 'elder', young = sp.band === 'young'; const G = sp.gait || {};
  const g = {
    stride: (elder ? 0.84 : 1) * r.range(0.93, 1.07) * (sp.skirt === 'ankle' ? 0.88 : 1),
    arm: (elder ? 0.55 : f ? 0.8 : 1) * r.range(0.7, 1.3) * (sp.bag ? 0.8 : 1),
    elbow: r.range(0.12, 0.34) + (elder ? 0.15 : 0),
    armOut: 0.07 + (sp.build - 1) * 0.3 + r.range(0, 0.04),
    bounce: (elder ? 0.65 : young ? 1.08 : 1) * r.range(0.8, 1.2),
    sway: (f ? 1.45 : 1) * r.range(0.7, 1.3),
    pelvis: (f ? 1.25 : 1) * r.range(0.8, 1.2),
    stoop: elder ? r.range(0.1, 0.22) : r.range(-0.03, 0.05),
    headDown: r.range(-0.04, 0.07) + (elder ? 0.08 : 0),
    knee: r.range(0.85, 1.15) * (sp.skirt === 'ankle' ? 0.72 : 1), /* ankle-length saree / sarong / abaya: short, low-heel-lift steps */ swagger: !f && !elder ? r.range(0, young ? 1 : 0.6) : 0,
    runKnee: sp.skirt === 'ankle' ? 0.6 : 1, /* a wrapped ankle-length garment restricts the running heel kick */ toeOut: r.range(0.03, 0.12) + (elder ? 0.06 : 0), lag: r.range(0.02, 0.07), idleRate: r.range(0.7, 1.4),
  };
  for (const k of ['stride', 'arm', 'bounce', 'sway']) if (G[k]) g[k] *= G[k];
  if (G.stoop) g.stoop += G.stoop, g.headDown += G.stoop * 0.5; if (G.swagger) g.swagger = Math.max(g.swagger, G.swagger);
  if (sp.belly) g.armOut += sp.belly * 0.05;
  return g;
}
// ------------------------------------------------------------------ two-bone arm IK (used for weapons)
// target: point in CHEST space; q: optional hand orientation in chest space; w: blend with the animated pose.
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m1 = new THREE.Matrix4();
export function solveArmIK(b, S, target, q, w = 1) {
  const arm = b['arm' + S], fore = b['fore' + S], hand = b['hand' + S], chest = b.chest, par = arm.parent;
  chest.updateWorldMatrix(true, false); par.updateWorldMatrix(false, false);
  const tw = _v1.copy(target).applyMatrix4(chest.matrixWorld); const tp = par.worldToLocal(tw).sub(arm.position); // target relative to the shoulder, parent space
  const u1 = fore.position, u2 = hand.position; const L1 = u1.length(), L2 = u2.length();
  const d = clamp(tp.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const cosE = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1); const flex = Math.PI - Math.acos(cosE);
  const foreQ = _q1.setFromAxisAngle(_v2.set(1, 0, 0), -flex);
  const h = _v3.copy(u2).applyQuaternion(foreQ).add(u1); // hand in arm space at zero shoulder rotation
  const armQ = _q2.setFromUnitVectors(_v4.copy(h).normalize(), _v2.copy(tp).normalize());
  // swivel about the shoulder→hand axis so the elbow points down and out (natural), not up
  const axis = _v2.copy(tp).normalize(); const e = _v4.copy(u1).applyQuaternion(armQ); const pole = _v3.set(S === 'R' ? -0.45 : 0.45, -1, -0.15);
  e.addScaledVector(axis, -e.dot(axis)); pole.addScaledVector(axis, -pole.dot(axis));
  if (e.lengthSq() > 1e-8 && pole.lengthSq() > 1e-8) { e.normalize(); pole.normalize(); const ang = Math.atan2(_m1.identity() && new THREE.Vector3().crossVectors(e, pole).dot(axis), e.dot(pole)); armQ.premultiply(_q3.setFromAxisAngle(axis, ang)); }
  if (w >= 1) { arm.quaternion.copy(armQ); fore.quaternion.copy(foreQ); } else { arm.quaternion.slerp(armQ, w); fore.quaternion.slerp(foreQ, w); }
  if (q) { arm.updateMatrixWorld(false); fore.updateMatrixWorld(false); const want = _q3.copy(chest.getWorldQuaternion(new THREE.Quaternion())).multiply(q); const foreW = fore.getWorldQuaternion(new THREE.Quaternion()); const loc = foreW.invert().multiply(want); if (w >= 1) hand.quaternion.copy(loc); else hand.quaternion.slerp(loc, w); }
}

const _ikv = new THREE.Vector3();
export class Animator {
  constructor(ch) {
    this.ch = ch; this.g = gaitProfile(ch.spec); const s = ch.spec.height / 1.72; this.s = s;
    this.a = 0.43 * s; this.b = 0.415 * s; this.ankle = 0.085 * s; // thigh / shin lengths, ankle height
    this.cyc = Math.random(); this.t = Math.random() * 100; this.speed = 0; this.action = null; this.actionW = 0; this.prevAction = null;
    this.lean = 0; this.air = 0; this.look = 0; this.crouch = 0; this.drive = 0; this.steer = 0; this.seed = Math.random(); this.locoW = 0; this.hipYs = ch.hipY;
    this.shift = 0; this.shiftTarget = Math.random() < 0.5 ? -1 : 1; this.shiftT = 2 + Math.random() * 6; this.idleLook = 0; this.idleLookT = Math.random() * 4; this.idleLookTarget = 0;
    this.stepped = false; this.stepFoot = 0; this.runW = 0; this.fadeAct = null; this.fadeW = 0; this.fadeT = 0; this.actionDur = 0;
    this.seated = null; this.seatL = null; this.seatW = 0; this.seatMode = null; this.seatLook = 0; this.seatLookT = 0; this.vehSpeed = 0; this.brakeLean = 0; this.cornerLean = 0;
  }
  // Vehicle seat (see Seating.js). w: blend 0 (standing pose) … 1 (fully seated); entry/exit animations ramp it.
  sitIn(seat, w = 1, mode = null) { if (seat !== this.seated) { this.seated = seat; this.seatL = seatLocal(seat); this.seatLookT = 0; } this.seatW = w; this.seatMode = mode; }
  standUp() { this.seated = null; this.seatL = null; this.seatW = 0; this.seatMode = null; }
  // switching actions cross-fades: the outgoing pose keeps blending out (fadeAct / fadeW) while the new one blends in,
  // so gestures always ease back to the neutral stance instead of snapping.
  set(action) { if (action !== this.action) { if (this.action && this.action !== 'crouch' && this.actionW > 0.05) { this.fadeAct = this.action; this.fadeW = this.actionW; this.fadeT = this.actionT || 0; } this.prevAction = this.action; this.action = action; this.actionW = 0; this.actionT = 0; this.actionDur = 0; } }
  // timed action on simulation time (ends with a smooth fade back to neutral)
  play(action, dur) { this.set(action); this.actionDur = dur; }
  // one leg's pose at gait phase p (0 = heel strike). Returns world thigh angle (−fwd), knee flex, foot pitch relative to flat, contact.
  leg(p, beta, A, run) {
    const g = this.g;
    if (p < beta) {
      const u = p / beta; const fwd = 1 - 2 * u; // linear sweep → planted foot moves back at body speed
      const knee = (0.14 * (1 - run) + 0.55 * run) * Math.sin(u * Math.PI) + (1 - run) * 0.38 * smooth01((u - 0.72) / 0.28);
      const foot = u < 0.14 ? -0.28 * (1 - u / 0.14) * (1 - run * 0.6) : u > 0.66 ? 0.5 * smooth01((u - 0.66) / 0.34) : 0;
      return { th: -fwd * A, knee, foot, contact: true, u };
    }
    const u = (p - beta) / (1 - beta); const fwd = -Math.cos(u * Math.PI) + run * 0.25 * Math.sin(u * Math.PI);
    const knee = lerp(0.82, 1.95 * (g.runKnee || 1), run) * g.knee * Math.sin(Math.PI * clamp(u * 1.25, 0, 1)) + (1 - run) * 0.38 * (1 - smooth01(u / 0.2));
    return { th: -fwd * A, knee, foot: lerp(0.35, -0.12, smooth01(u * 1.3)), contact: false, u };
  }
  update(dt, speed, turnRate = 0) {
    const b = this.ch.bones; const g = this.g; const s = this.s; this.t += dt; this.actionT = (this.actionT || 0) + dt;
    if (this.actionDur && this.actionT > this.actionDur) this.set(null);
    if (this.fadeW > 0) { this.fadeW = Math.max(0, this.fadeW - dt * 3.2); this.fadeT += dt; if (this.fadeW === 0) this.fadeAct = null; }
    this.speed = damp(this.speed, speed, 12, dt); const sp = Math.max(0, this.speed);
    const run = (this.runW = damp(this.runW, clamp((sp - 2.5) / 2.0, 0, 1), 6, dt)); const w = (this.locoW = damp(this.locoW, smooth01(sp / 0.55), 8, dt));
    // stride and phase
    const stepLen = Math.min((0.36 + 0.3 * sp) * s * g.stride, (1.15 + 0.45 * run) * s); const cycleLen = 2 * stepLen; const beta = lerp(0.6, 0.36, run);
    const prev = this.cyc; this.cyc = (this.cyc + (sp * dt) / cycleLen) % 1;
    const L = this.a + this.b; const roll = lerp(0.17, 0.08, run) * s; // foot roll-over contributes stance travel
    const A = Math.asin(clamp((beta * cycleLen - roll) / (2 * L), 0.02, 0.62));
    const pL = this.cyc, pR = (this.cyc + 0.5) % 1;
    if (w > 0.4 && sp > 0.3) { if (pL < prev) { this.stepped = true; this.stepFoot = 0; } else if ((pR < 0.5) !== ((prev + 0.5) % 1 < 0.5) && pR < 0.5) { this.stepped = true; this.stepFoot = 1; } }
    const lL = this.leg(pL, beta, A, run), lR = this.leg(pR, beta, A, run);
    // idle weight shift (switch every few seconds), idle look-around
    this.shiftT -= dt * g.idleRate; if (this.shiftT < 0) { this.shiftTarget = -this.shiftTarget * (Math.random() < 0.8 ? 1 : 0.3); this.shiftT = 3 + Math.random() * 6; }
    this.shift = damp(this.shift, this.shiftTarget, 1.6, dt);
    this.idleLookT -= dt; if (this.idleLookT < 0) { this.idleLookTarget = Math.random() < 0.4 ? 0 : (Math.random() - 0.5) * 1.1; this.idleLookT = 1.5 + Math.random() * 4; }
    this.idleLook = damp(this.idleLook, this.idleLookTarget * (1 - w * 0.7), 5, dt);
    const A_ = this.action; this.actionW = clamp(this.actionW + dt * 3, 0, 1); const aw = A_ ? this.actionW : 0;
    const crouch = (this.crouch = damp(this.crouch, A_ === 'crouch' || A_ === 'cover' ? 1 : 0, A_ === 'rise' ? 3.2 : 8, dt));
    const sit = A_ === 'sit' ? aw : this.fadeAct === 'sit' ? this.fadeW : 0; const drive = (this.drive = damp(this.drive, A_ === 'drive' ? 1 : 0, 8, dt)); const seatT = Math.max(sit, drive);
    this.lean = damp(this.lean, clamp(-turnRate * sp * 0.03, -0.2, 0.2), 6, dt);
    // pelvis
    const hipPitch = run * 0.1 + crouch * 0.25; const sh = this.shift * (1 - w);
    const pelvisYaw = -(Math.cos(2 * Math.PI * pL) * 0.085 * g.pelvis * (1 - run * 0.4)) * w;
    const swayPh = Math.cos(2 * Math.PI * (pL - beta / 2));
    const hipRoll = this.lean + (swayPh * 0.045 * g.sway * (1 - run) * w) + sh * 0.035;
    // legs: idle pose has the loaded leg straight and the other relaxed
    const idleTh = (side) => { const loaded = side === 0 ? sh > 0 : sh < 0; return loaded ? 0.02 : -0.06 * Math.abs(sh); };
    const idleKn = (side) => { const loaded = side === 0 ? sh > 0 : sh < 0; return 0.04 + (loaded ? 0 : 0.16 * Math.abs(sh)); };
    const legs = [lL, lR].map((l, i) => {
      let thW = lerp(idleTh(i), l.th, w) - crouch * 1.1; let kn = lerp(idleKn(i), l.knee + 0.04, w) + crouch * 1.9;
      return { thW, kn, foot: l.foot * w, contact: l.contact || w < 0.5, u: l.contact ? l.u : -1 };
    });
    // solve hip height from the planted leg(s): hips must sit where the stance foot touches the ground
    const need = (l) => this.ankle + this.a * Math.cos(l.thW) + this.b * Math.cos(l.thW + l.kn) + 0.02 * s;
    this.legState = legs; // read by tools/anim-test (stance phase per leg)
    // the push-off foot pivots on its toes: its ankle rises with the heel instead of dragging the hips down
    const heel = (l) => (l.u > 0.66 ? 0.13 * s * Math.sin(Math.max(0, l.foot)) : 0);
    // support weight: ramps in after heel strike, out before toe-off → hip height is continuous through every contact change
    const supW = (l) => (!l.contact ? 0 : l.u < 0 ? 1 : smooth01(l.u / 0.18) * (1 - smooth01((l.u - 0.78) / 0.22)) + 1e-4);
    let W = 0, acc = 0; for (const l of legs) { const ws = supW(l); W += ws; acc += ws * (need(l) + heel(l)); }
    const flight = Math.max(need(legs[0]), need(legs[1])) + 0.035 * run * g.bounce;
    let hy = W > 1e-3 ? lerp(flight, acc / W, smooth01(W / 0.35)) : flight;
    // a rigid pendulum bobs ~9 cm per step; people flatten it with stance-knee flexion → keep a fraction around a slow average
    if (this.hyAvg === undefined || dt > 0.2) this.hyAvg = hy; this.hyAvg = damp(this.hyAvg, hy, 1.6, dt);
    const hyWalk = this.hyAvg + (hy - this.hyAvg) * 0.32 * g.bounce;
    // running: lowest at each mid-stance (the knee absorbs the landing), highest in flight — a smooth periodic bob, two per cycle
    const hyRun = this.hyAvg - 0.012 * s - 0.03 * s * g.bounce * Math.cos(2 * Math.PI * (2 * pL - beta));
    hy = lerp(hyWalk, hyRun, run);
    hy = lerp(hy, this.ch.hipY - 0.45, seatT);
    this.hipYs = dt > 0.2 ? hy : damp(this.hipYs, hy, 30, dt);
    // planted legs: two-bone IK so each stance ankle lands exactly on the ground under the actual hips (no sinking / floating feet)
    if (seatT < 0.999) for (const l of legs) { if (!l.contact) continue;
      const xf = -(this.a * Math.sin(l.thW) + this.b * Math.sin(l.thW + l.kn)); const yv = this.hipYs - this.ankle - 0.02 * s - heel(l);
      const d = clamp(Math.hypot(xf, yv), Math.abs(this.a - this.b) + 1e-3, this.a + this.b - 1e-3);
      const kn = Math.PI - Math.acos(clamp((this.a * this.a + this.b * this.b - d * d) / (2 * this.a * this.b), -1, 1));
      const th = Math.atan2(-xf, yv) - Math.acos(clamp((this.a * this.a + d * d - this.b * this.b) / (2 * this.a * d), -1, 1));
      const k = 1 - seatT; l.thW = lerp(l.thW, th, k); l.kn = lerp(l.kn, kn, k); }
    b.hips.position.y = this.hipYs; b.hips.position.x = (swayPh * 0.02 * g.sway * (1 - run) * w + sh * 0.028) * s;
    b.hips.rotation.set(hipPitch, pelvisYaw, hipRoll);
    const R = (bone, x, y, z) => b[bone].rotation.set(x, y, z);
    legs.forEach((l, i) => {
      const sd = i === 0 ? 'L' : 'R', sx = i === 0 ? 1 : -1;
      const th = lerp(l.thW - hipPitch, -1.45, seatT), kn = lerp(l.kn, 1.45, seatT);
      const foot = lerp(-(l.thW + l.kn) + l.foot - crouch * 0.0, 0, seatT);
      R('thigh' + sd, th, sx * g.toeOut * 0.5, lerp(-hipRoll * 0.9, -sx * 0.06, seatT)); R('shin' + sd, kn, 0, 0); R('foot' + sd, foot, 0, 0);
    });
    // spine, chest: counter-rotation against the pelvis, posture, breathing
    const breathe = Math.sin(this.t * (1.5 + run * 2) + this.seed * 6) * (0.012 + run * 0.01);
    const spineYaw = -pelvisYaw * 0.7, chestYaw = -pelvisYaw * 1.05;
    R('spine', breathe + g.stoop + run * 0.12 + crouch * 0.2 - hipPitch * 0.4, spineYaw, -hipRoll * 0.55);
    R('chest', breathe * 0.6 + g.stoop * 0.5, chestYaw, -hipRoll * 0.35 + Math.sin(2 * Math.PI * pL) * 0.03 * g.swagger * w);
    // head: stabilised against the trunk, plus look/idle look
    const trunkYaw = pelvisYaw + spineYaw + chestYaw;
    R('neck', -g.stoop * 0.8 + g.headDown - run * 0.12 - crouch * 0.2, -trunkYaw * 0.5, hipRoll * 0.3);
    R('head', -(this.hipYs - this.ch.hipY) * 0.6, this.look * 0.6 + this.idleLook * 0.5 - trunkYaw * 0.4, hipRoll * 0.3);
    // arms: pendulum swing opposite to the legs, slightly lagging, bigger forward than back
    const armAmp = (0.1 + 0.2 * clamp(sp / 1.6, 0, 1) + run * 0.6) * g.arm * w;
    const sw = (p) => { const v = Math.cos(2 * Math.PI * (p - g.lag)); return v > 0 ? v : v * 0.75; };
    let aL = [-sw(pR) * armAmp + 0.03, 0, g.armOut + run * 0.08 + sh * 0.02], aR = [-sw(pL) * armAmp + 0.03, 0, -g.armOut - run * 0.08 + sh * 0.02];
    let fL = [-(g.elbow + Math.max(0, sw(pR)) * 0.3 * w + run * 1.25), 0, 0], fR = [-(g.elbow + Math.max(0, sw(pL)) * 0.3 * w + run * 1.25), 0, 0];
    const blend = (cur, tgt, k) => cur.map((v, i) => lerp(v, tgt[i], k));
    const t = this.t, at = this.actionT;
    const actIK = [];
    const applyAct = (act, aw, at) => {
      const ikT = (S, x, y, z) => actIK.push([S, x * s, y * s, z * s, aw]);
      let tl = null, tr = null, tfl = null, tfr = null, head = null;
      switch (act) {
        case 'talk': tr = [-0.4 - Math.sin(t * 3.1) * 0.25, 0.2, -0.2 - Math.sin(t * 2.3) * 0.15]; tfr = [-1.1 - Math.sin(t * 4) * 0.3, 0, 0]; tl = [-0.15, 0, 0.12]; tfl = [-0.5 - Math.max(0, Math.sin(t * 1.7)) * 0.6, 0, 0]; head = Math.sin(t * 0.9) * 0.25; break;
        case 'listen': tl = [0.02, 0, 0.1]; tr = [0.02, 0, -0.1]; tfl = tfr = [-0.35, 0, 0]; head = Math.sin(t * 0.6) * 0.08; b.neck.rotation.x += Math.max(0, Math.sin(t * 2.2)) * 0.08 * aw; break;
        case 'argue': tr = [-0.9 - Math.sin(t * 6) * 0.35, 0, -0.3]; tfr = [-0.9, 0, 0]; tl = [-0.7 - Math.sin(t * 5 + 1) * 0.3, 0, 0.3]; tfl = [-1, 0, 0]; head = Math.sin(t * 3) * 0.15; break;
        case 'phone': tr = [-0.35, 0, -0.55]; tfr = [-2.35, 0.4, 0]; tl = [0.05, 0, 0.1]; tfl = [-0.2, 0, 0]; head = 0.15; break;
        case 'text': tr = [-0.45, 0, -0.15]; tfr = [-1.35, 0, 0]; tl = [-0.45, 0, 0.15]; tfl = [-1.35, 0, 0]; b.neck.rotation.x += 0.45 * aw; break;
        case 'wave': tr = [-2.6 + Math.sin(t * 8) * 0.08, 0, -0.35 - Math.sin(t * 8) * 0.25]; tfr = [-0.5, 0, 0]; break;
        // cricket: batting stance (both hands on the handle, bat down by the back foot) and a swing driven by this.swing
        // (0 → 1: back-lift, downswing through the line of the ball, follow-through over the left shoulder; <0 = stance)
        case 'bat': { const ph = this.swing ?? -1; let lift = 0.15, thr = 0, tw = 0.25;
          if (ph >= 0) { if (ph < 0.35) { const k = ph / 0.35; lift = 0.15 + k * 1.2; tw = 0.25 + k * 0.45; } else { const k = Math.min(1, (ph - 0.35) / 0.45); lift = 1.35 - k * 1.6; thr = k; tw = 0.7 - k * 1.6; if (ph > 0.8) lift = -0.25 + (ph - 0.8) * 9; } }
          tr = [-0.75 - lift * 0.6, 0.3, 0.42 + lift * 0.1]; tl = [-0.85 - lift * 0.55, -0.3, -0.42 - thr * 0.1]; tfr = [-0.7 + lift * 0.2, 0, 0]; tfl = [-0.55 + lift * 0.2, 0, 0];
          b.spine.rotation.y += tw * aw; b.spine.rotation.x += 0.18 * aw; head = -tw * 0.6; break; }
        case 'bowl': { const k = Math.min(1, at / 0.55); const a = k * 4.4; tr = [-a, 0, -0.12]; tfr = [-0.15, 0, 0]; tl = [-2.6 + k * 2.4, 0, 0.25]; tfl = [-0.3, 0, 0]; b.spine.rotation.x += (k > 0.6 ? (k - 0.6) * 0.9 : -0.15) * aw; break; }
        case 'point': tr = [-1.5, 0, -0.15]; tfr = [-0.1, 0, 0]; head = -0.2; break;
        case 'signal': { // traffic point duty: one palm held out towards the stopped approach, the other arm beckons the moving one (sigSide: +1 right waves, −1 left, 0 all stop)
          const sd = this.sigSide || 0, k = Math.max(0, Math.sin(t * 3.4)); const stopL = [-0.22, 0, 1.42], stopR = [-0.22, 0, -1.42]; // stop: arm out to the side, palm out
          if (sd > 0) { tr = [-1.3, 0, -0.3]; tfr = [-0.2 - k * 1.5, 0, 0]; tl = stopL; tfl = [-0.12, 0, 0]; head = -0.45; } // beckon: forward, forearm sweeping in
          else if (sd < 0) { tl = [-1.3, 0, 0.3]; tfl = [-0.2 - k * 1.5, 0, 0]; tr = stopR; tfr = [-0.12, 0, 0]; head = 0.45; }
          else { tl = [-2.75, 0, 0.25]; tfl = [-0.25, 0, 0]; tr = stopR; tfr = [-0.12, 0, 0]; head = Math.sin(at * 0.6) * 0.5; } break; } // all-red: left hand raised, right out
        case 'clap': tr = [-0.8, 0, 0.35]; tl = [-0.8, 0, -0.35]; tfr = tfl = [-1.2 - Math.abs(Math.sin(t * 9)) * 0.25, 0, 0]; break;
        case 'stretch': { const k = Math.sin(at * 1.2) * 0.5 + 0.5; tr = [-2.9 * k, 0, -0.2]; tl = [-2.9 * k, 0, 0.2]; tfr = tfl = [-0.2, 0, 0]; b.spine.rotation.x -= 0.15 * k * aw; break; }
        case 'dance': { const k = Math.sin(t * 7); tr = [-1.2 + k * 0.6, 0, -0.6 - k * 0.3]; tl = [-1.2 - k * 0.6, 0, 0.6 - k * 0.3]; tfr = tfl = [-1.4, 0, 0]; b.hips.rotation.y += Math.sin(t * 3.5) * 0.35 * aw; b.hips.position.y -= Math.abs(k) * 0.05 * aw; b.hips.rotation.z += Math.sin(t * 3.5) * 0.08 * aw; head = Math.sin(t * 3.5) * 0.2; break; }
        case 'look': head = Math.sin(at * 0.7) * 0.9; tl = [0.05, 0, 0.12]; tr = [0.05, 0, -0.12]; break;
        case 'cower': tr = [-2.2, 0, 0.6]; tl = [-2.2, 0, -0.6]; tfr = tfl = [-2.3, 0, 0]; b.spine.rotation.x += 0.45 * aw; b.neck.rotation.x += 0.4 * aw; break;
        case 'handsup': tr = [-2.9, 0, -0.35]; tl = [-2.9, 0, 0.35]; tfr = tfl = [-0.4, 0, 0]; break;
        case 'stumble': { // knocked off balance: torso whips back, arms fling out, a recovery step, then regain posture
          const k = Math.max(0, 1 - at * 1.4), k2 = Math.sin(clamp(at / 0.7, 0, 1) * Math.PI);
          b.spine.rotation.x -= 0.45 * k; b.chest.rotation.x -= 0.15 * k; b.neck.rotation.x += 0.25 * k; b.hips.rotation.z += Math.sin(at * 9) * 0.06 * k;
          b.thighR.rotation.x -= 0.45 * k2; b.shinR.rotation.x += 0.5 * k2; b.hips.position.y -= 0.04 * k2;
          tr = [-1.3 * k, 0, -1.1 * k]; tl = [-1.1 * k, 0, 1.3 * k]; tfr = tfl = [-0.4, 0, 0]; head = Math.sin(at * 7) * 0.2 * k; break; }
        case 'flinch': { const k = Math.max(0, 1 - at * 2.2); b.spine.rotation.x += 0.25 * k; b.neck.rotation.x += 0.3 * k; tr = [-1.6 * k, 0, 0.4 * k]; tl = [-1.6 * k, 0, -0.4 * k]; tfr = tfl = [-1.8 * k, 0, 0]; break; }
        case 'hit': { const k = Math.max(0, 1 - at * 1.6); b.spine.rotation.x -= 0.35 * k; b.chest.rotation.y += 0.3 * k; tr = [-0.6 * k, 0, -0.8 * k]; tl = [-0.4 * k, 0, 0.9 * k]; break; }
        case 'down': { b.hips.position.y = lerp(b.hips.position.y, 0.16 * s, aw); b.hips.rotation.x = lerp(b.hips.rotation.x, -1.45, aw); for (const sd of ['L', 'R']) { b['thigh' + sd].rotation.x = lerp(b['thigh' + sd].rotation.x, 0.05, aw); b['shin' + sd].rotation.x = lerp(b['shin' + sd].rotation.x, 0.2, aw); b['foot' + sd].rotation.x = lerp(b['foot' + sd].rotation.x, -0.2, aw); } tr = [-0.4, 0, -0.7]; tl = [-0.3, 0, 0.8]; tfr = tfl = [-0.3, 0, 0]; break; }
        case 'shove': { const k = Math.sin(clamp(at / 0.4, 0, 1) * Math.PI); tr = [-1.5 * k, 0, 0.1]; tl = [-1.5 * k, 0, -0.1]; tfr = tfl = [-0.6 + 0.5 * k, 0, 0]; b.spine.rotation.x += 0.2 * k; break; }
        case 'browse': tr = [-0.75, 0, 0.1]; tfr = [-0.9 + Math.sin(t * 1.3) * 0.2, 0, 0]; head = Math.sin(t * 0.5) * 0.4; b.neck.rotation.x += 0.25 * aw; break;
        case 'umbrella': tr = [-0.6, 0, -0.1]; tfr = [-1.8, 0, 0]; break;
        case 'sit': tl = [-0.3, 0, 0.1]; tr = [-0.3, 0, -0.1]; tfl = tfr = [-0.9, 0, 0]; break;
        case 'drive': tl = [-1.05 + this.steer * 0.25, 0, 0.25]; tr = [-1.05 - this.steer * 0.25, 0, -0.25]; tfl = tfr = [-0.6, 0, 0]; break;
        case 'ride': tl = [-1.15, 0, 0.3]; tr = [-1.15, 0, -0.3]; tfl = tfr = [-0.35, 0, 0]; break;
        case 'carry': tl = [-0.6, 0, 0.15]; tr = [-0.6, 0, -0.15]; tfl = tfr = [-1.3, 0, 0]; break;
        case 'interact': tr = [-1.2, 0, -0.1]; tfr = [-0.4, 0, 0]; break;
        case 'pray': tr = [-0.75, 0, 0.55]; tl = [-0.75, 0, -0.55]; tfr = tfl = [-1.9, 0, 0]; b.neck.rotation.x += 0.2 * aw; break;
        case 'photo': tr = [-1.25, 0, 0.25]; tl = [-1.25, 0, -0.25]; tfr = tfl = [-1.7, 0, 0]; break;
        case 'shrug': { const k = Math.sin(clamp(at / 1.2, 0, 1) * Math.PI); tr = [-0.3 * k, 0, -0.5 * k]; tl = [-0.3 * k, 0, 0.5 * k]; tfr = tfl = [-1.4 * k, 0, 0]; head = 0.1 * k; break; }
        case 'beckon': tr = [-1.3, 0, -0.15]; tfr = [-1.2 - Math.max(0, Math.sin(t * 6)) * 0.6, 0, 0]; break;
        case 'alert': { // something happened: weight down, hands up in front, head scanning
          ikT('L', 0.13, -0.2, 0.26); ikT('R', -0.13, -0.2, 0.26); head = Math.sin(at * 1.6) * 0.55; b.hips.position.y -= 0.035 * s * aw;
          for (const sd of ['L', 'R']) { b['thigh' + sd].rotation.x -= 0.14 * aw; b['shin' + sd].rotation.x += 0.28 * aw; b['foot' + sd].rotation.x -= 0.14 * aw; } b.spine.rotation.x += 0.08 * aw; break; }
        case 'crossarms': ikT('L', -0.13, -0.09, 0.15); ikT('R', 0.12, -0.05, 0.19); head = Math.sin(t * 0.4) * 0.2; break; // each hand onto the other upper arm
        case 'hips': ikT('L', 0.2, -0.28, 0.0); ikT('R', -0.2, -0.28, 0.0); head = Math.sin(t * 0.5) * 0.25; break; // hands on the hip bones, elbows out
        case 'watch': ikT('L', 0.02, -0.07, 0.27); b.neck.rotation.x += 0.35 * aw; head = 0.15; break; // left wrist raised in front of the chest
        // ---- squad switch: departure moves
        case 'comms': { const tap = Math.max(0, Math.sin(at * 11)) * (at > 0.35 && at < 0.95 ? 1 : 0); ikT('L', 0.03, -0.06, 0.28); ikT('R', -0.015, -0.035 + tap * 0.012, 0.29 - tap * 0.008); b.neck.rotation.x += 0.38 * aw; head = 0.12; break; } // wrist pad: raise, two taps, glance down
        case 'glance': { const k = Math.sin(clamp(at / 1.0, 0, 1) * Math.PI); head = 1.15 * k; b.chest.rotation.y += 0.32 * k * aw; b.neck.rotation.y += 0.25 * k * aw; tl = [-1.75 * k, 0, 0.15]; tfl = [-0.15, 0, 0]; break; } // look back over the shoulder, left arm signals "moving up"
        case 'cover': { b.spine.rotation.x += 0.22 * aw; ikT('L', 0.12, -0.18, 0.24); ikT('R', -0.12, -0.2, 0.22); head = Math.sin(at * 1.3) * 0.6; break; } // low behind cover, hands ready, scanning
        // ---- squad switch: takeover moves
        case 'gloves': { const sw = at < 0.5; const k = Math.sin(clamp((at % 0.5) / 0.5, 0, 1) * Math.PI); // tug the left cuff, then the right
          if (sw) { ikT('L', 0.05, -0.2, 0.25); ikT('R', 0.03 - k * 0.05, -0.19, 0.26); } else { ikT('R', -0.05, -0.2, 0.25); ikT('L', -0.03 + k * 0.05, -0.19, 0.26); } b.neck.rotation.x += 0.3 * aw; break; }
        case 'straps': { const k = Math.sin(clamp(at / 0.8, 0, 1) * Math.PI); ikT('L', 0.1, 0.03 - k * 0.07, 0.15); ikT('R', -0.1, 0.03 - k * 0.07, 0.15); b.neck.rotation.z += Math.sin(clamp(at / 0.9, 0, 1) * Math.PI * 2) * 0.12 * aw; b.spine.rotation.x -= 0.05 * k * aw; break; } // tug the vest straps down, roll the neck
        case 'glasses': { const k = Math.sin(clamp(at / 0.9, 0, 1) * Math.PI); ikT('R', -0.02, 0.17 + k * 0.1, 0.17); b.neck.rotation.x -= 0.06 * k * aw; head = -0.05; break; } // push the glasses up the bridge
        case 'rise': { const k = Math.max(0, 1 - at / 0.55); ikT('R', -0.12, -0.32 - 0.06 * k, 0.26); b.spine.rotation.x += 0.25 * k * aw; break; } // push off the knee and stand
      }
      if (tl) aL = blend(aL, tl, aw); if (tr) aR = blend(aR, tr, aw); if (tfl) fL = blend(fL, tfl, aw); if (tfr) fR = blend(fR, tfr, aw); if (head !== null && head !== undefined) b.head.rotation.y = lerp(b.head.rotation.y, head, aw);
    };
    if (this.fadeAct && this.fadeW > 0) applyAct(this.fadeAct, smooth01(this.fadeW), this.fadeT); // eased return to neutral
    if (A_ && aw > 0) applyAct(A_, aw, at);
    if (this.air > 0) { aL = blend(aL, [-0.6, 0, 0.5], 0.7); aR = blend(aR, [-0.6, 0, -0.5], 0.7); b.thighL.rotation.x = -0.6; b.shinL.rotation.x = 0.9; b.thighR.rotation.x = -0.1; b.shinR.rotation.x = 0.4; b.footL.rotation.x = 0.2; b.footR.rotation.x = 0.1; }
    if (this.armOverride) { const o = this.armOverride; const k = o.w ?? 1; if (o.aL) aL = blend(aL, o.aL, k); if (o.aR) aR = blend(aR, o.aR, k); if (o.fL) fL = blend(fL, o.fL, k); if (o.fR) fR = blend(fR, o.fR, k); }
    R('armL', ...aL); R('armR', ...aR); R('foreL', ...fL); R('foreR', ...fR);
    R('handL', 0.12 + run * 0.1, 0, 0.05); R('handR', 0.12 + run * 0.1, 0, -0.05);
    if (this.handOverride) { const o = this.handOverride; if (o.L) b.handL.rotation.set(...o.L); if (o.R) b.handR.rotation.set(...o.R); }
    if (this.aim) { // weapon stance: torso pitch follows the aim, chest bladed so the support shoulder leads; walk twist removed
      const m = this.aim; const k = m.w ?? 1; b.spine.rotation.y = lerp(b.spine.rotation.y, 0, k); b.spine.rotation.x = lerp(b.spine.rotation.x, -m.pitch * 0.45, k); b.spine.rotation.z = lerp(b.spine.rotation.z, 0, k);
      b.chest.rotation.set(lerp(b.chest.rotation.x, -m.pitch * 0.55, k), lerp(b.chest.rotation.y, -(m.twist || 0), k), lerp(b.chest.rotation.z, 0, k));
      b.neck.rotation.x = lerp(b.neck.rotation.x, m.pitch * 0.35, k); b.neck.rotation.y = lerp(b.neck.rotation.y, (m.twist || 0) * 0.6, k); b.head.rotation.y = lerp(b.head.rotation.y, (m.twist || 0) * 0.4, k); b.head.rotation.x = lerp(b.head.rotation.x, (m.headDown || 0), k);
    }
    const seated = this.seated && this.seatW > 0;
    if (!seated && !this.ik) for (const [S, x, y, z, w] of actIK) solveArmIK(b, S, _ikv.set(x, y, z), null, w);
    if (this.ik && !seated) { if (this.ik.R) solveArmIK(b, 'R', this.ik.R, this.ik.qR, this.ik.wR ?? 1); if (this.ik.L) solveArmIK(b, 'L', this.ik.L, this.ik.qL, this.ik.wL ?? 1); }
    if (seated) applySeatPose(this, dt);
    else if (A_ === 'ride' && aw > 0) { b.thighL.rotation.set(-1.2, 0, -0.25); b.thighR.rotation.set(-1.2, 0, 0.25); b.shinL.rotation.x = 1.3; b.shinR.rotation.x = 1.3; b.footL.rotation.x = 0; b.footR.rotation.x = 0; b.hips.position.y = this.ch.hipY - 0.15; b.hips.position.x = 0; b.hips.rotation.set(0, 0, 0); }
    this.driveSkirt();
    if (this.ch.face) this.ch.face.update(dt);
    if (this.ch.rig) this.ch.rig.update(dt); // protagonists: fingers, twist / toe bones, expression wrinkles, cloth springs
  }
  // Garment hinges: angle (about the hip x axis, −forward) of each leg's knee and ankle in hip space; skirtF takes the most
  // forward of them, skirtB the most rearward, so the front and back panels of skirts / sarongs / sarees tent over the legs.
  driveSkirt() {
    const b = this.ch.bones; if (!b.skirtF) return; const A = this.a, Bn = this.b; let fwd = Infinity, back = -Infinity, uF = Infinity, uB = -Infinity; const ank = []; const sk = this.ch.spec.skirt; const dS = clamp((0.93 - (sk === 'ankle' ? 0.1 : sk === 'mid' ? 0.32 : 0.5)) * this.s - A, 0, Bn); // length of shin inside the garment (shorter hems only need to clear the thighs)
    for (const sd of ['L', 'R']) { const th = b['thigh' + sd].rotation.x, kn = b['shin' + sd].rotation.x;
      const kz = -Math.sin(th) * A, ky = -Math.cos(th) * A; const az = kz - Math.sin(th + kn) * dS, ay = ky - Math.cos(th + kn) * dS;
      const ph = Math.atan2(-az, -ay); fwd = Math.min(fwd, th, ph); back = Math.max(back, th, ph); uF = Math.min(uF, th); uB = Math.max(uB, th);
      const tp = b['thigh' + sd].position; ank.push([tp.y + ay, tp.z + az]); }
    // upper panels track the most forward / rearward thigh; the knee-line hinge adds the rest so the lower panels reach the
    // shins (a swinging heel lifts only the lower back panel instead of levering the whole panel up off the other thigh)
    b.skirtF.rotation.set(uF * 1.04, 0, 0); b.skirtB.rotation.set(uB * 1.04, 0, 0);
    if (b.skirtF2) {
      if (dS > 0.05) { // long garments: aim each lower panel from its (already swung) knee-line hinge at the ankles, plus cloth clearance
        const h2 = (P1, P2, u) => { const c = Math.cos(u), sn = Math.sin(u); return [P1.y + P2.y * c - P2.z * sn, P1.z + P2.y * sn + P2.z * c]; };
        const uf = uF * 1.04, ub = uB * 1.04, hf = h2(b.skirtF.position, b.skirtF2.position, uf), hb = h2(b.skirtB.position, b.skirtB2.position, ub); let lf = uf, lb = ub;
        for (const [y, z] of ank) { let af = Math.atan2(-(z - hf[1]), -(y - hf[0])), ab = Math.atan2(-(z - hb[1]), -(y - hb[0])); if (af > 1.6) af -= 2 * Math.PI; if (ab < -1.6) ab += 2 * Math.PI; // heel above the hinge: keep the angle continuous past ±π
          lf = Math.min(lf, af - 0.15); lb = Math.max(lb, ab + 0.15); }
        b.skirtF2.rotation.set(clamp(lf - uf, -1.3, 0), 0, 0); b.skirtB2.rotation.set(clamp(lb - ub, 0, 1.3), 0, 0);
      } else { b.skirtF2.rotation.set((fwd - uF) * 1.04, 0, 0); b.skirtB2.rotation.set((back - uB) * 1.04, 0, 0); }
    }
  }
}
