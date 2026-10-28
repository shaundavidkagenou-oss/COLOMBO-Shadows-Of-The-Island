// Procedural skinned humans: one SkinnedMesh per person (body + head groups), 19-bone skeleton,
// Sri Lankan everyday clothing and a procedural animation layer (locomotion, idles, gestures, reactions).
import * as THREE from 'three';
import { applySeatPose, seatLocal } from './Seating.js';
import { TEX, faceAtlas, FACE_FRAMES } from '../gfx/Textures.js';
import { RNG } from '../core/rng.js';
import { makeAppearance, FACE_VARIANTS } from './Appearance.js';
import { lerp, clamp, damp } from '../core/math.js';

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
const PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', armL: 'shL', foreL: 'armL', handL: 'foreL', shR: 'chest', armR: 'shR', foreR: 'armR', handR: 'foreR', thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR' };

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const smooth01 = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
// atlas regions for fabric patterns: 0 plain weave, 1 saree, 2 batik, 3 plaid
const REGION = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]];

class SkinBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; this.headIdx = []; }
  get n() { return this.pos.length / 3; }
  v(p, nrm, c, uv, w) { this.pos.push(p[0], p[1], p[2]); this.nor.push(nrm[0], nrm[1], nrm[2]); this.col.push(c[0], c[1], c[2]); this.uv.push(uv[0], uv[1]); const s = [0, 0, 0, 0], ww = [0, 0, 0, 0]; w.slice(0, 4).forEach(([b, x], i) => { s[i] = b; ww[i] = x; }); const t = ww[0] + ww[1] + ww[2] + ww[3] || 1; this.si.push(...s); this.sw.push(ww[0] / t, ww[1] / t, ww[2] / t, ww[3] / t); return this.n - 1; }
  // Loft of elliptical rings. rings: [{c:[x,y,z], rx, rz, w:[[bone,weight]..], col, fz?(front bulge)}]
  loft(rings, seg = 12, { region = 0, uvRep = 1, capStart = false, capEnd = false, colFn = null, target = this.idx } = {}) {
    if (!colFn) { const out = []; rings.forEach((r, i) => { const nx = rings[i + 1]; out.push(r); if (nx && (r.col[0] !== nx.col[0] || r.col[1] !== nx.col[1] || r.col[2] !== nx.col[2])) { const m = (t, col) => ({ ...r, c: r.c.map((v, k) => lerp(v, nx.c[k], t)), rx: lerp(r.rx, nx.rx, t), rz: lerp(r.rz, nx.rz, t), col }); out.push(m(0.5, r.col), m(0.505, nx.col)); } }); rings = out; }
    const base = this.n; const [ru, rv] = REGION[region];
    rings.forEach((r, ri) => {
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const front = sa > 0 ? sa * (r.fz || 0) : sa * (r.bz || 0);
        const x = r.c[0] + ca * r.rx, z = r.c[2] + sa * r.rz + front, y = r.c[1];
        const nrm = new THREE.Vector3(ca / r.rx, 0, sa / (r.rz + Math.abs(front) * 0.5)).normalize();
        const col = colFn ? colFn(ri, a, r) : r.col;
        this.v([x, y, z], [nrm.x, nrm.y, nrm.z], col, [ru + ((k / seg) * uvRep % 1) * 0.5 * 0.999, rv + (ri / Math.max(1, rings.length - 1)) * 0.5 * 0.999], r.w);
      }
    });
    const W = seg + 1;
    const down = rings[rings.length - 1].c[1] < rings[0].c[1]; // rings built top→bottom (arms, legs, skirts) need the opposite winding
    for (let ri = 0; ri < rings.length - 1; ri++) for (let k = 0; k < seg; k++) { const a = base + ri * W + k, b = a + 1, c = a + W, d = c + 1; if (down) target.push(a, b, c, b, d, c); else target.push(a, c, b, b, c, d); }
    const cap = (ri, up) => { const r = rings[ri]; const ctr = this.v(r.c, [0, up ? 1 : -1, 0], colFn ? colFn(ri, 0, r) : r.col, [ru, rv], r.w); for (let k = 0; k < seg; k++) { const a = base + ri * W + k; if (up !== down) target.push(ctr, a + 1, a); else target.push(ctr, a, a + 1); } };
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
        this.v(p, [nrm.x, nrm.y, nrm.z], typeof col === 'function' ? col(sx, sy, sz) : col, uv, typeof w === 'function' ? w(sy) : w);
      }
    }
    const W = lon + 1;
    for (let i = 0; i < lat; i++) for (let k = 0; k < lon; k++) { const a = base + i * W + k, b = a + 1, cc = a + W, d = cc + 1; target.push(a, b, cc, b, d, cc); }
  }
  boxPart(c, sx, sy, sz, w, col, target = this.idx) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2; const F = [[[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]], [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]], [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]], [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]], [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]], [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]]];
    for (const [n, q] of F) { const i = q.map((p) => this.v([c[0] + p[0], c[1] + p[1], c[2] + p[2]], n, col, [0.01, 0.51], w)); target.push(i[0], i[1], i[2], i[0], i[2], i[3]); }
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
    g.setIndex([...this.idx, ...this.headIdx]); g.addGroup(0, this.idx.length, 0); g.addGroup(this.idx.length, this.headIdx.length, 1);
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
  return j;
}

// ------------------------------------------------------------------ outfit-driven geometry
export function buildBodyGeometry(sp) {
  const sb = new SkinBuilder(); const J = joints(sp); const s = sp.height / 1.72, w = sp.build, f = sp.sex === 'f';
  const skin = C(sp.skin), top = C(sp.top), bottom = C(sp.bottom), shoe = C(sp.shoes || '#2a2420'), hair = C(sp.hairColor || '#15100c');
  const o = sp.outfit; const longSleeve = sp.longSleeve; const skirtLen = sp.skirt; // null | 'knee' | 'ankle'
  const W1 = (b) => [[B[b], 1]]; const W2 = (a, b, t) => [[B[a], 1 - t], [B[b], t]];
  const midriff = o === 'saree';
  // --- torso (hips → neck)
  const tr = [
    { y: 0.84, rx: (f ? 0.17 : 0.158) * w, rz: (f ? 0.112 : 0.102) * w, wgt: W1('hips'), col: bottom },
    { y: 0.95, rx: (f ? 0.172 : 0.16) * w, rz: (f ? 0.115 : 0.105) * w, wgt: W1('hips'), col: bottom },
    { y: 1.02, rx: (f ? 0.14 : 0.15) * w, rz: (f ? 0.095 : 0.1) * w, wgt: W2('hips', 'spine', 0.6), col: midriff ? skin : top },
    { y: 1.12, rx: (f ? 0.13 : 0.155) * w, rz: (f ? 0.09 : 0.1) * w, wgt: W2('spine', 'chest', 0.3), col: midriff ? skin : top },
    { y: 1.24, rx: (f ? 0.145 : 0.17) * w, rz: (f ? 0.1 : 0.11) * w, fz: f ? 0.035 : 0.01, wgt: W2('spine', 'chest', 0.8), col: top },
    { y: 1.33, rx: (f ? 0.15 : 0.18) * w, rz: (f ? 0.1 : 0.11) * w, fz: f ? 0.03 : 0.012, wgt: W1('chest'), col: top },
    { y: 1.40, rx: (f ? 0.145 : 0.172) * w, rz: 0.09 * w, wgt: W1('chest'), col: top },
    { y: 1.435, rx: (f ? 0.115 : 0.14) * w, rz: 0.075 * w, wgt: W1('chest'), col: top },
    { y: 1.455, rx: 0.075, rz: 0.06, wgt: W1('chest'), col: top },
    { y: 1.47, rx: 0.062, rz: 0.06, wgt: W2('chest', 'neck', 0.5), col: sp.collar ? top : skin },
    { y: 1.55, rx: 0.05, rz: 0.05, wgt: W1('neck'), col: skin },
  ];
  const bel = sp.belly || 0; if (bel) [[2, 0.03, 0.02], [3, 0.045, 0.032], [4, 0.022, 0.012]].forEach(([i, dz, df]) => { tr[i].rz += bel * dz * w; tr[i].fz = (tr[i].fz || 0) + bel * df; tr[i].rx += bel * 0.012 * w; });
  // torso surface (front/back z at height y and offset x) so straps, lanyards and bags sit on the clothes, never inside
  const surfZ = (y, x, sgn) => { let k = 0; while (k < tr.length - 2 && tr[k + 1].y * s < y) k++; const a = tr[k], b2 = tr[k + 1]; const t = clamp((y / s - a.y) / (b2.y - a.y), 0, 1); const rx = lerp(a.rx, b2.rx, t), rz = lerp(a.rz, b2.rz, t), fz = lerp(a.fz || 0, b2.fz || 0, t); const q = clamp(Math.abs(x) / rx, 0, 0.98); return sgn * rz * Math.sqrt(1 - q * q) + (sgn > 0 ? fz : 0); };
  const jacket = o === 'jacket';
  sb.loft(tr.map((r) => ({ c: [0, r.y * s, 0], rx: r.rx, rz: r.rz, fz: r.fz, w: r.wgt, col: r.col })), 16, {
    capStart: true,
    colFn: jacket ? (ri, a, r) => { const fr = Math.sin(a); return ri >= 2 && ri <= 6 && fr > 0.93 ? C(sp.inner || '#6b6f72') : r.col; } : sp.tie ? (ri, a, r) => (ri >= 3 && ri <= 6 && Math.sin(a) > 0.97 ? C(sp.tie) : r.col) : null,
  });
  // --- legs
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
    sb.loft(lr.map((r) => ({ ...r, col: legCol(r.c[1]) })), 10);
    // shoe / sandal
    const sandal = sp.sandals; const fc = sandal ? skin : shoe;
    sb.ellipsoid([ft[0], 0.05 * s, 0.045], 0.044, 0.042, 0.118, W1('foot' + side), fc, { lat: 7, lon: 12, bumpFn: (x, y, z) => (y < -0.2 ? 0.98 : 1) * (z > 0.6 ? 0.97 : 1) });
    if (sandal) { sb.boxPart([ft[0], 0.008, 0.05], 0.1, 0.016, 0.27, W1('foot' + side), C(sp.sole || sp.shoes || '#2a2420')); sb.boxPart([ft[0], 0.05 * s, 0.09], 0.092, 0.012, 0.03, W1('foot' + side), shoe); }
    else sb.boxPart([ft[0], 0.011, 0.046], sp.sole ? 0.084 : 0.094, 0.022, sp.sole ? 0.24 : 0.262, W1('foot' + side), C(sp.sole || (sp.shoes === '#e8e8e4' ? '#d8d8d4' : '#1a1512')));
    void sx;
  }
  // --- skirt / sarong / saree / frock (cone from waist to hem, weighted mostly to hips)
  if (skirtLen) {
    const hemY = skirtLen === 'ankle' ? 0.1 : skirtLen === 'mid' ? 0.32 : 0.48; const topY = o === 'saree' ? 0.93 : o === 'salwar' || o === 'kurti' || o === 'abaya' ? 1.2 : o === 'kurta' ? 1.02 : 0.97;
    const region = sp.pattern ?? 0; const N = 7; const rings = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), y = lerp(topY, hemY, t) * s; const flare = o === 'sarong' ? 0.02 : o === 'frock' ? 0.09 : o === 'skirt_top' ? 0.07 : o === 'abaya' ? 0.04 : 0.05;
      const rx = lerp(0.17 * w, 0.17 * w + flare + (skirtLen === 'ankle' ? 0.02 : 0), Math.pow(t, 0.8)), rz = lerp(0.12 * w, 0.13 * w + flare * 0.8, t);
      const legW = clamp((t - 0.25) * 0.6, 0, 0.45); // hem follows legs a little
      rings.push({ c: [0, y, 0.005], rx: rx + (y > 0.9 * s ? 0.005 : 0), rz, w: legW > 0 ? [[B.hips, 1 - legW], [B.thighL, legW / 2], [B.thighR, legW / 2]] : W1('hips'), col: C(sp.skirtCol || sp.bottom) });
    }
    sb.loft(rings, 18, { region, uvRep: 2 });
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
    sb.loft(ar.map((r) => ({ ...r, col: colAt(r.c[1]) })), 10, { capEnd: false });
    sb.ellipsoid([a[0] * 0.84, 1.392 * s, -0.004], 0.05 * w, 0.044, 0.056 * w, sp.sleeveless ? W2('chest', 'arm' + side, 0.5) : W2('chest', 'arm' + side, 0.5), sp.sleeveless ? skin : top, { lat: 7, lon: 10 });
    if (!longSleeve && !sp.sleeveless) { // sleeve hem flare
      sb.loft([{ c: [lerp(a[0], fo[0], 0.4), 1.215 * s, -0.005], rx: 0.056 * w, rz: 0.058 * w, w: W1('arm' + side), col: top }, { c: [lerp(a[0], fo[0], 0.33), 1.27 * s, -0.004], rx: 0.058 * w, rz: 0.06 * w, w: W1('arm' + side), col: top }], 10);
    }
    { const sx = Math.sign(h[0]); const hw = W1('hand' + side); // palm, slightly curled finger block, thumb
      sb.ellipsoid([h[0], 0.84 * s, 0.006], 0.022, 0.042, 0.04, hw, skin, { lat: 6, lon: 10 });
      sb.ellipsoid([h[0] - sx * 0.004, 0.79 * s, 0.012], 0.017, 0.038, 0.036, hw, skin, { lat: 6, lon: 10, bumpFn: (x, y, z) => 1 + (y < -0.4 ? 0.04 * Math.sin(z * 18) : 0) });
      sb.ellipsoid([h[0] - sx * 0.014, 0.818 * s, 0.038], 0.011, 0.026, 0.012, hw, skin, { lat: 4, lon: 6 }); }
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
  sb.ellipsoid(hc, hr[0], hr[1], hr[2], W1('head'), skin, { lat: 16, lon: 24, faceUV: true, target: sb.headIdx, bumpFn: headBump });
  // nose + ears
  { const nz = HD.nose || [1, 1, 1]; sb.ellipsoid([0, hc[1] - 0.012 - (nz[1] - 1) * 0.012, hc[2] + hr[2] - 0.004], 0.016 * nz[0], 0.026 * nz[1], 0.022 * nz[2], W1('head'), skin, { lat: 5, lon: 8, p0: 0.3 }); }
  if (sp.hair !== 'hijab') { const es = HD.ear ?? 1; for (const sx of [-1, 1]) sb.ellipsoid([sx * hr[0], hc[1], hc[2] - 0.01], 0.012 * es, 0.03 * es, 0.02 * es, W1('head'), skin, { lat: 4, lon: 6 }); }
  // hair
  const hs = sp.hair; let hairLift = 1;
  const backZ = (y, half) => Math.min(hc[2] - hr[2] * 0.75, surfZ(y, 0, -1) - half - 0.008); // hair hanging down the back stays outside the clothes
  if (hs === 'hijab') { // head scarf: a shell over the head (open around the face), wrapped under the chin and draped over the shoulders
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
    const tex = (x, y, z) => hs === 'wavy' ? 1 + 0.04 * Math.sin(x * 14) * Math.cos(z * 11) : hs === 'curly' ? 1 + 0.05 * Math.abs(Math.sin(x * 21) * Math.sin(y * 17) * Math.sin(z * 19)) : hs === 'quiff' ? 1 + (y > 0.45 && z > -0.1 ? 0.07 * smooth01((y - 0.45) * 3) * smooth01((z + 0.1) * 2) : 0) : hs === 'sidepart' ? (Math.abs(x - 0.32) < 0.035 && y > 0.4 ? 0.975 : x < 0.32 ? 1.012 : 1) : 1;
    const bump = (x, y, z) => (y < hairline(x, z) ? 0.9 / lift : hs === 'balding' && y > 0.6 && z > -0.5 ? 0.9 / lift : 1) * tex(x, y, z);
    const p1 = Math.PI * (f ? (hs === 'bob' ? 0.7 : 0.6) : 0.52);
    sb.ellipsoid([hc[0], hc[1] + 0.012, hc[2] - 0.006], hr[0] * lift, hr[1] * 1.02, hr[2] * lift, W1('head'), hair, { lat: hs === 'curly' ? 12 : 9, lon: hs === 'curly' ? 24 : 18, p0: 0, p1, bumpFn: bump });
    if (f || hs === 'long') {
      const len = { long: 0.4, shoulder: 0.2, bob: 0.06 }[hs] ?? 0; // bun / ponytail / braid / short styles have no loose back panel
      if (len > 0) sb.loft([0, 1, 2, 3].map((i) => { const t = i / 3; const y = hc[1] - 0.02 - t * len; const rz = lerp(0.06, hs === 'bob' ? 0.05 : 0.025, t); return { c: [0, y, t < 0.3 ? hc[2] - hr[2] * 0.75 : backZ(y, rz)], rx: lerp(hr[0] * 1.02, hs === 'bob' ? hr[0] : 0.06, t), rz, w: t > 0.45 ? W2('neck', 'chest', 0.6) : W1('head'), col: hair }; }), 10, { capEnd: false, capStart: true });
      if (hs === 'bun') sb.ellipsoid([0, hc[1] - 0.03, hc[2] - hr[2] - 0.03], 0.05, 0.045, 0.045, W1('head'), hair, { lat: 6, lon: 8 });
      if (hs === 'ponytail') { // tie at the crown, tail falling down the back of the head and neck
        sb.ellipsoid([0, hc[1] + 0.02, hc[2] - hr[2] * lift - 0.012], 0.03, 0.03, 0.028, W1('head'), hair, { lat: 5, lon: 8 });
        sb.loft([0, 1, 2, 3, 4].map((i) => { const t = i / 4; const y = hc[1] + 0.01 - t * 0.24; const r0 = lerp(0.03, 0.014, t); return { c: [0, y, Math.min(hc[2] - hr[2] * lift - 0.03 + t * 0.02, backZ(y, r0))], rx: r0, rz: r0, w: t > 0.55 ? W2('neck', 'chest', 0.5) : W1('head'), col: hair }; }), 7, { capEnd: true });
      }
      if (hs === 'braid') sb.loft([0, 1, 2, 3, 4, 5].map((i) => { const t = i / 5; const y = hc[1] - 0.04 - t * 0.36; const r0 = lerp(0.03, 0.016, t); return { c: [0, y, Math.min(hc[2] - hr[2] * 0.88, backZ(y, r0))], rx: r0 * 1.15, rz: r0, w: t > 0.4 ? W2('neck', 'chest', 0.7) : W1('head'), col: hair }; }), 7, { capEnd: true });
    }
  }
  // facial hair: beard shells follow the jaw exactly (same centre, radii and jaw shaping as the head), so they cannot drift off the face
  if (sp.beard || sp.goatee) {
    const thick = sp.goatee ? 1.03 : sp.beardShort ? 1.016 : 1.03;
    const beardBump = (x, y, z) => { const hb = headBump(x, y, z); if (z < -0.3) return hb * 0.93; if (z > 0.72 && y > -0.52 && Math.abs(x) < 0.42) return hb * 0.96; // back of the shell and the lips stay inside the head
      if (sp.goatee) return z > 0.55 && Math.abs(x) < 0.34 && y < -0.56 ? hb * thick : hb * 0.94; // chin patch only
      const line = z < 0.05 ? -0.18 : -0.18 - 0.36 * Math.min(1, (z - 0.05) / 0.55); if (y > line + 0.04 * Math.sin(x * 9) && !(z > 0.8 && Math.abs(x) < 0.3 && y < -0.38)) return hb * 0.94; // beard line: sideburns → cheek → jaw
      return hb * (thick + (sp.beardShort ? 0.004 : 0.012) * Math.max(0, -y - 0.6)) + 0.004 * Math.sin(x * 40 + z * 23); };
    const beardC = hair.map((v, i) => v * 0.82 + skin[i] * 0.18); sb.ellipsoid(hc, hr[0], hr[1], hr[2], W1('head'), beardC, { lat: 12, lon: 26, p0: Math.PI * 0.54, p1: Math.PI * 0.985, bumpFn: beardBump });
    if (!sp.goatee) sb.ellipsoid([0, hc[1] - 0.04, hc[2] + hr[2] * 0.93], 0.032, 0.009, 0.012, W1('head'), hair, { lat: 4, lon: 8 });
  }
  if (sp.moustache) sb.ellipsoid([0, hc[1] - 0.042, hc[2] + hr[2] - 0.016], 0.03, 0.008, 0.012, W1('head'), hair, { lat: 4, lon: 8 });
  if (sp.glasses) { const gz = hc[2] + hr[2] - 0.006, gy = hc[1] + 0.006; for (const sx of [-1, 1]) { sb.boxPart([sx * 0.034, gy + 0.012, gz], 0.038, 0.004, 0.004, W1('head'), C('#1a1a1a')); sb.boxPart([sx * 0.034, gy - 0.01, gz - 0.001], 0.034, 0.003, 0.004, W1('head'), C('#1a1a1a')); sb.boxPart([sx * 0.053, gy + 0.001, gz - 0.002], 0.003, 0.022, 0.004, W1('head'), C('#1a1a1a')); } sb.boxPart([0, gy + 0.008, gz + 0.002], 0.016, 0.003, 0.004, W1('head'), C('#1a1a1a')); }
  // ---- accessories (each placed on the clothing surface or the head shell so nothing sinks into the body)
  const band = (pts, width, col, wgtFn) => { sb.strip(pts.map((p, i) => { const nx = pts[Math.min(i + 1, pts.length - 1)], pv = pts[Math.max(i - 1, 0)]; const d = new THREE.Vector3(nx[0] - pv[0], nx[1] - pv[1], nx[2] - pv[2]).normalize(); const out = new THREE.Vector3(p[0], 0, p[2]).normalize(); const side = new THREE.Vector3().crossVectors(d, out).normalize(); return { c: p, side: [side.x, side.y, side.z], out: [out.x, out.y, out.z], w: wgtFn(p[1]) }; }), width, (q) => q.out, null, col, 0); };
  const torsoW = (y) => (y > 1.3 * s ? W1('chest') : y > 1.1 * s ? W2('spine', 'chest', 0.5) : W1('hips'));
  if (sp.sunglasses) { const gz = hc[2] + hr[2] - 0.003, gy = hc[1] + 0.005, k = C('#0d0f12'); for (const sx of [-1, 1]) { sb.boxPart([sx * 0.034, gy, gz], 0.042, 0.026, 0.005, W1('head'), k); sb.boxPart([sx * (hr[0] + 0.001), gy + 0.008, hc[2] + hr[2] * 0.35], 0.004, 0.005, hr[2] * 1.15, W1('head'), k); } sb.boxPart([0, gy + 0.009, gz + 0.001], 0.03, 0.005, 0.005, W1('head'), k); }
  if (sp.cap) {
    const cr = Math.max(1.12, hairLift + 0.03);
    if (sp.capStyle === 'skull') sb.ellipsoid([hc[0], hc[1] + 0.036, hc[2] - 0.004], hr[0] * Math.max(1.07, hairLift + 0.02), hr[1] * 0.8, hr[2] * Math.max(1.07, hairLift + 0.02), W1('head'), C(sp.cap), { lat: 6, lon: 16, p0: 0, p1: Math.PI * 0.36 });
    else if (sp.capStyle === 'nurse') { sb.boxPart([0, hc[1] + hr[1] * 0.98, hc[2] + 0.01], 0.11, 0.03, 0.08, W1('head'), C('#ffffff')); sb.boxPart([0, hc[1] + hr[1] * 0.98 + 0.012, hc[2] + 0.052], 0.1, 0.012, 0.006, W1('head'), C('#2a4a8a')); }
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
    sb.boxPart([0, 1.2 * s, cz], 0.056, 0.082, 0.005, W1('chest'), C('#f4f4f0')); sb.boxPart([0, 1.233 * s, cz + 0.001], 0.056, 0.016, 0.005, W1('chest'), lc); }
  if (sp.watch) { const h = J.handL; const wc = C(sp.watch);
    sb.loft([{ c: [h[0], 0.893 * s, 0], rx: 0.031, rz: 0.033, w: W1('foreL'), col: C('#1a1a1a') }, { c: [h[0], 0.909 * s, 0], rx: 0.031, rz: 0.033, w: W1('foreL'), col: C('#1a1a1a') }], 10);
    sb.boxPart([h[0] + 0.03, 0.901 * s, 0.0], 0.008, 0.026, 0.026, W1('foreL'), wc); }
  if (sp.earrings) for (const sx of [-1, 1]) sb.ellipsoid([sx * (hr[0] * 1.02 + 0.002), hc[1] - 0.034, hc[2] - 0.006], 0.006, 0.009, 0.006, W1('head'), C('#d4a640'), { lat: 4, lon: 6 });
  if (sp.necklace) sb.loft([{ c: [0, 1.448 * s, 0.008], rx: 0.084, rz: 0.07, w: W1('chest'), col: C('#d4a640') }, { c: [0, 1.456 * s, 0.006], rx: 0.08, rz: 0.066, w: W1('chest'), col: C('#d4a640') }], 14);
  if (sp.epaulettes) for (const side of ['L', 'R']) { const a = J['arm' + side]; sb.boxPart([a[0] * 0.8, 1.392 * s + 0.047, -0.004], 0.075, 0.008, 0.042, W2('chest', 'arm' + side, 0.4), C(sp.bottom || '#1f2a44')); }
  return sb.build();
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
export function getBodyMaterial() { if (!bodyMat) bodyMat = new THREE.MeshStandardMaterial({ map: fabricAtlas(), vertexColors: true, roughness: 0.85 }); return bodyMat; }
export function getFaceMaterial(key, opts) {
  if (!faceMats.has(key)) faceMats.set(key, new THREE.MeshStandardMaterial({ map: faceAtlas(opts), vertexColors: true, roughness: 0.62 }));
  return faceMats.get(key);
}

// ------------------------------------------------------------------ skeleton
let bindInverse = new Map();
export function makeSkeleton(sp, key) {
  const J = joints(sp); const bones = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; return b; });
  BONES.forEach((n, i) => { const p = PARENT[n]; const jp = J[n]; if (p) { const pp = J[p]; bones[i].position.set(jp[0] - pp[0], jp[1] - pp[1], jp[2] - pp[2]); bones[B[p]].add(bones[i]); } else bones[i].position.set(jp[0], jp[1], jp[2]); });
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
  kavindu: { seed: 1, sex: 'm', age: 'adult', skin: '#8d5a3b', build: 1.04, height: 1.76, outfit: 'jacket', top: '#3c4536', inner: '#7d8286', bottom: '#2c3a52', shoes: '#3a2a20', longSleeve: true, hair: 'wavy', hairColor: '#110c09', beard: true, sandals: false, collar: true },
  ruwan: { seed: 2, sex: 'm', age: 'adult', skin: '#7a4a2e', build: 1.1, height: 1.71, outfit: 'shirt', top: '#6d3b2c', bottom: '#3a3f4a', shoes: '#151515', hair: 'short', hairColor: '#0d0a08', moustache: true, collar: true, sandals: false },
  fathima: { seed: 3, sex: 'f', age: 'adult', skin: '#a8734f', build: 1.05, height: 1.58, outfit: 'salwar', top: '#1b6b6b', skirt: 'knee', skirtCol: '#1b6b6b', bottom: '#f2efe6', pattern: 2, hair: 'bun', hairColor: '#1c140e', longSleeve: true, sandals: true },
  selvaraj: { seed: 4, sex: 'm', age: 'elder', skin: '#5e3a24', build: 1.08, height: 1.68, outfit: 'shirt', top: '#f2f2ee', bottom: '#4a4036', hair: 'grey', hairColor: '#b8b6b0', moustache: true, glasses: true, collar: true, sandals: true },
  bandara: { seed: 5, sex: 'm', age: 'elder', skin: '#82543a', build: 1.15, height: 1.66, outfit: 'national', top: '#f6f4ee', bottom: '#f6f4ee', skirt: 'ankle', skirtCol: '#f4f2ea', longSleeve: true, hair: 'bald', hairColor: '#c8c6c0', moustache: true, sandals: true },
  anjali: { seed: 6, sex: 'f', age: 'adult', skin: '#9b6644', build: 0.98, height: 1.63, outfit: 'tee_jeans', top: '#2f4f6b', bottom: '#1f2a3a', shoes: '#e8e8e4', hair: 'long', hairColor: '#0b0908', sandals: false, bag: '#5a3a2a' },
  dilan: { seed: 7, sex: 'm', age: 'adult', skin: '#a8734f', build: 1.06, height: 1.79, outfit: 'office', top: '#f0f0ee', bottom: '#1e2430', longSleeve: true, collar: true, hair: 'short', hairColor: '#0d0a08', glasses: true, tie: '#1f2a5a', sandals: false },
  nalin: { seed: 8, sex: 'm', age: 'adult', skin: '#6b4128', build: 1.22, height: 1.8, outfit: 'shirt', top: '#151515', bottom: '#2a2a2a', hair: 'short', hairColor: '#0b0908', beard: true, collar: true, sandals: false, bangles: true },
};

// ------------------------------------------------------------------ Character instance
const geoCache = new Map();
export class Character {
  constructor(spec) {
    this.spec = spec; const key = JSON.stringify(spec); const skelKey = `${spec.sex}|${spec.height.toFixed(3)}|${spec.build.toFixed(3)}`;
    let geo = geoCache.get(key); if (!geo) { geo = buildBodyGeometry(spec); geoCache.set(key, geo); }
    const { bones, skeleton } = makeSkeleton(spec, skelKey);
    const fv = spec.faceV != null ? FACE_VARIANTS[spec.faceV] : null; let faceMat;
    if (fv) faceMat = getFaceMaterial(`v${spec.faceV}`, { female: spec.sex === 'f', stubble: fv.stubble || 0, seed: spec.faceV, lips: fv.lips, size: 192, v: fv });
    else { const stub = spec.beard ? 0.9 : spec.sex === 'm' && spec.age === 'adult' ? 0.35 : 0; faceMat = getFaceMaterial(`${spec.sex}|${stub}|${spec.seed % 2}`, { female: spec.sex === 'f', stubble: stub, seed: spec.seed % 2, lips: spec.sex === 'f' ? '#8a3a3a' : '#7a4a40' }); }
    this.face = new FaceRig(this, faceMat);
    this.mesh = new THREE.SkinnedMesh(geo, [getBodyMaterial(), this.face.mat]);
    this.mesh.add(bones[0]); this.mesh.bind(skeleton); this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3); this.mesh.castShadow = true; this.mesh.receiveShadow = false; this.mesh.frustumCulled = true;
    this.root = new THREE.Group(); this.root.add(this.mesh);
    this.bones = Object.fromEntries(BONES.map((n, i) => [n, bones[i]])); this.hipY = bones[0].position.y;
    this.anim = new Animator(this);
  }
  dispose() { this.mesh.skeleton.dispose(); this.face.dispose(); }
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
    if (this.talking) { this.flapT -= dt; if (this.flapT < 0) { this.flap = this.flap ? 0 : 1; this.flapT = (this.flap ? 0.08 : 0.06) + Math.random() * 0.12; } f = this.flap ? 'talk' : this.expr === 'talk' ? 'neutral' : this.expr; }
    else if (f === 'neutral' && this.glance) f = this.glance;
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
    knee: r.range(0.85, 1.15), swagger: !f && !elder ? r.range(0, young ? 1 : 0.6) : 0,
    toeOut: r.range(0.03, 0.12) + (elder ? 0.06 : 0), lag: r.range(0.02, 0.07), idleRate: r.range(0.7, 1.4),
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
    const knee = lerp(0.82, 1.95, run) * g.knee * Math.sin(Math.PI * clamp(u * 1.25, 0, 1)) + (1 - run) * 0.38 * (1 - smooth01(u / 0.2));
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
    const crouch = (this.crouch = damp(this.crouch, A_ === 'crouch' ? 1 : 0, 8, dt));
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
      return { thW, kn, foot: l.foot * w, contact: l.contact || w < 0.5 };
    });
    // solve hip height from the planted leg(s): hips must sit where the stance foot touches the ground
    const need = (l) => this.ankle + this.a * Math.cos(l.thW) + this.b * Math.cos(l.thW + l.kn) + 0.02 * s;
    let hy = Infinity; for (const l of legs) if (l.contact) hy = Math.min(hy, need(l));
    if (hy === Infinity) hy = Math.max(need(legs[0]), need(legs[1])) + 0.035 * run * g.bounce; // flight phase
    hy = this.ch.hipY + (hy - this.ch.hipY) * lerp(1, g.bounce, 0.5);
    hy = lerp(hy, this.ch.hipY - 0.45, seatT);
    this.hipYs = dt > 0.2 ? hy : damp(this.hipYs, hy, 30, dt);
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
        case 'point': tr = [-1.5, 0, -0.15]; tfr = [-0.1, 0, 0]; head = -0.2; break;
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
    if (this.ch.face) this.ch.face.update(dt);
  }
}
