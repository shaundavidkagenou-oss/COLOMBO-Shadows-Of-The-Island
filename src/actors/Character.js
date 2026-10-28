// Procedural skinned humans: one SkinnedMesh per person (body + head groups), 19-bone skeleton,
// Sri Lankan everyday clothing and a procedural animation layer (locomotion, idles, gestures, reactions).
import * as THREE from 'three';
import { TEX, faceTexture } from '../gfx/Textures.js';
import { RNG } from '../core/rng.js';
import { lerp, clamp, damp } from '../core/math.js';

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
const PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', armL: 'shL', foreL: 'armL', handL: 'foreL', shR: 'chest', armR: 'shR', foreR: 'armR', handR: 'foreR', thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR' };

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
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
    { y: 0.86, rx: (f ? 0.165 : 0.15) * w, rz: (f ? 0.11 : 0.1) * w, wgt: W1('hips'), col: bottom },
    { y: 0.95, rx: (f ? 0.17 : 0.155) * w, rz: (f ? 0.115 : 0.105) * w, wgt: W1('hips'), col: bottom },
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
      { c: [th[0] * 0.95, 0.9 * s, 0], rx: 0.085 * w, rz: 0.09 * w, w: W2('hips', 'thigh' + side, 0.6) },
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
    sb.ellipsoid([ft[0], 0.045 * s, 0.045], 0.045, 0.045, 0.12, W1('foot' + side), fc, { lat: 6, lon: 10 });
    if (sandal) sb.boxPart([ft[0], 0.008, 0.05], 0.1, 0.016, 0.27, W1('foot' + side), shoe);
    void sx;
  }
  // --- skirt / sarong / saree / frock (cone from waist to hem, weighted mostly to hips)
  if (skirtLen) {
    const hemY = skirtLen === 'ankle' ? 0.1 : skirtLen === 'mid' ? 0.32 : 0.48; const topY = o === 'saree' ? 0.93 : o === 'salwar' ? 1.2 : 0.97;
    const region = sp.pattern ?? 0; const N = 7; const rings = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), y = lerp(topY, hemY, t) * s; const flare = o === 'sarong' ? 0.02 : o === 'frock' || o === 'school_girl' ? 0.09 : 0.05;
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
    sb.ellipsoid([a[0] * 0.86, 1.4 * s, -0.004], 0.056 * w, 0.05, 0.06 * w, sp.sleeveless ? W2('chest', 'arm' + side, 0.5) : W2('chest', 'arm' + side, 0.5), sp.sleeveless ? skin : top, { lat: 7, lon: 10 });
    if (!longSleeve && !sp.sleeveless) { // sleeve hem flare
      sb.loft([{ c: [lerp(a[0], fo[0], 0.4), 1.215 * s, -0.005], rx: 0.056 * w, rz: 0.058 * w, w: W1('arm' + side), col: top }, { c: [lerp(a[0], fo[0], 0.33), 1.27 * s, -0.004], rx: 0.058 * w, rz: 0.06 * w, w: W1('arm' + side), col: top }], 10);
    }
    sb.ellipsoid([h[0], 0.82 * s, 0.01], 0.032, 0.07, 0.045, W1('hand' + side), skin, { lat: 6, lon: 8 });
    if (sp.bangles && side === 'L') sb.loft([{ c: [h[0], 0.885 * s, 0], rx: 0.033, rz: 0.035, w: W1('fore' + side), col: C('#d4a640') }, { c: [h[0], 0.9 * s, 0], rx: 0.033, rz: 0.035, w: W1('fore' + side), col: C('#d4a640') }], 8);
  }
  // --- head (separate group so it can take a face texture)
  const hc = [0, 1.635 * s, 0.015 * s];
  const hr = f ? [0.083, 0.11, 0.098] : [0.088, 0.115, 0.102];
  sb.ellipsoid(hc, hr[0], hr[1], hr[2], W1('head'), skin, { lat: 16, lon: 24, faceUV: true, target: sb.headIdx, bumpFn: (x, y, z) => 1 + (z > 0.5 && y < -0.2 ? -0.06 * (z - 0.5) : 0) + (y < -0.55 ? -0.08 * (-y - 0.55) * 2 : 0) });
  // nose + ears
  sb.ellipsoid([0, hc[1] - 0.012, hc[2] + hr[2] - 0.004], 0.016, 0.026, 0.022, W1('head'), skin, { lat: 5, lon: 8, p0: 0.3 });
  for (const sx of [-1, 1]) sb.ellipsoid([sx * hr[0], hc[1], hc[2] - 0.01], 0.012, 0.03, 0.02, W1('head'), skin, { lat: 4, lon: 6 });
  // hair
  const hs = sp.hair;
  if (hs !== 'bald') {
    const capCol = (x, y, z) => hair; const lift = hs === 'wavy' ? 1.1 : hs === 'grey' ? 1.04 : 1.06;
    const bump = (x, y, z) => (hs === 'wavy' ? 1 + 0.04 * Math.sin(x * 14) * Math.cos(z * 11) : 1) * (z > 0.35 && y < 0.45 ? 0.98 : 1);
    // cap covers top/back; front hairline higher
    sb.ellipsoid([hc[0], hc[1] + 0.012, hc[2] - 0.006], hr[0] * lift, hr[1] * 1.02, hr[2] * lift, W1('head'), capCol, { lat: 9, lon: 18, p0: 0, p1: Math.PI * (f ? 0.6 : 0.52), bumpFn: bump });
    if (f || hs === 'long') {
      // back hair panel down the back
      const len = hs === 'bun' ? 0 : hs === 'plaits' ? 0 : hs === 'long' ? 0.4 : 0.18;
      if (len > 0) sb.loft([0, 1, 2, 3].map((i) => { const t = i / 3; return { c: [0, (hc[1] - 0.02 - t * len) , hc[2] - hr[2] * 0.75 - t * 0.02], rx: lerp(hr[0] * 1.02, 0.06, t), rz: lerp(0.06, 0.025, t), w: t > 0.45 ? W2('neck', 'chest', 0.6) : W1('head'), col: hair }; }), 10, { capEnd: false, capStart: true });
      if (hs === 'bun') sb.ellipsoid([0, hc[1] - 0.03, hc[2] - hr[2] - 0.03], 0.05, 0.045, 0.045, W1('head'), hair, { lat: 6, lon: 8 });
      if (hs === 'plaits') for (const sx of [-1, 1]) { // two plaits with ribbons (school style)
        sb.loft([0, 1, 2, 3, 4].map((i) => { const t = i / 4; return { c: [sx * (0.06 + t * 0.02), hc[1] - 0.04 - t * 0.28, hc[2] - 0.07 + t * 0.03], rx: 0.022 - t * 0.006, rz: 0.022 - t * 0.006, w: t > 0.4 ? W2('neck', 'chest', 0.7) : W1('head'), col: hair }; }), 6);
        sb.ellipsoid([sx * 0.08, hc[1] - 0.33, hc[2] - 0.045], 0.028, 0.02, 0.012, W1('chest'), C(sp.ribbon || '#1d3f8a'), { lat: 4, lon: 6 });
      }
    }
    if (sp.beard) sb.ellipsoid([hc[0], hc[1] - 0.06, hc[2] + 0.02], hr[0] * 0.98, hr[1] * 0.62, hr[2] * 0.98, W1('head'), hair, { lat: 6, lon: 14, p0: Math.PI * 0.55, p1: Math.PI * 0.95, bumpFn: (x, y, z) => (z < -0.1 ? 0.9 : 1.04) });
    if (sp.moustache) sb.ellipsoid([0, hc[1] - 0.042, hc[2] + hr[2] - 0.016], 0.03, 0.008, 0.012, W1('head'), hair, { lat: 4, lon: 8 });
  }
  if (sp.glasses) { const gz = hc[2] + hr[2] - 0.006, gy = hc[1] + 0.006; for (const sx of [-1, 1]) { sb.boxPart([sx * 0.034, gy + 0.012, gz], 0.038, 0.004, 0.004, W1('head'), C('#1a1a1a')); sb.boxPart([sx * 0.034, gy - 0.01, gz - 0.001], 0.034, 0.003, 0.004, W1('head'), C('#1a1a1a')); sb.boxPart([sx * 0.053, gy + 0.001, gz - 0.002], 0.003, 0.022, 0.004, W1('head'), C('#1a1a1a')); } sb.boxPart([0, gy + 0.008, gz + 0.002], 0.016, 0.003, 0.004, W1('head'), C('#1a1a1a')); }
  if (sp.cap) sb.ellipsoid([hc[0], hc[1] + 0.03, hc[2]], hr[0] * 1.12, hr[1] * 0.85, hr[2] * 1.12, W1('head'), C(sp.cap), { lat: 6, lon: 14, p0: 0, p1: Math.PI * 0.42 });
  if (sp.bag) sb.boxPart([0, 1.22 * s, -0.16 * w], 0.28, 0.36, 0.12, W1('chest'), C(sp.bag));
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
  if (!faceMats.has(key)) faceMats.set(key, new THREE.MeshStandardMaterial({ map: faceTexture(opts), vertexColors: true, roughness: 0.65 }));
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
const HAIR_F = ['long', 'bun', 'long', 'bun', 'plaits'];
export function randomSpec(seed, opts = {}) {
  const r = new RNG(seed); const sex = opts.sex || (r.chance(0.5) ? 'f' : 'm');
  const age = opts.age || r.weighted([['adult', 6], ['elder', 1.4], ['teen', 1.2], ['child', 0.7]]);
  const f = sex === 'f';
  const sp = { seed, sex, age, skin: r.pick(SKINS), build: r.range(0.92, 1.12), height: f ? r.range(1.52, 1.66) : r.range(1.62, 1.8), shoes: r.pick(['#2a2420', '#3b2a1e', '#151515', '#6b5440']) };
  if (age === 'child') { sp.height = r.range(1.15, 1.35); sp.build = 0.9; }
  if (age === 'teen') sp.height *= 0.95;
  sp.hairColor = age === 'elder' ? r.pick(['#8a8a86', '#c8c6c0', '#5a5650']) : r.pick(['#120d0a', '#1c140e', '#0b0908', '#2a1c12']);
  const school = (age === 'child' || age === 'teen') && r.chance(0.65);
  if (f) {
    sp.hair = school ? 'plaits' : age === 'elder' ? 'bun' : r.pick(HAIR_F); sp.bangles = r.chance(0.4); sp.sandals = r.chance(0.6);
    if (school) Object.assign(sp, { outfit: 'school_girl', top: '#f6f6f2', bottom: '#f6f6f2', skirt: 'mid', skirtCol: '#f4f4f0', shoes: '#151515', ribbon: r.pick(['#1d3f8a', '#8a1d2a', '#14532d']), collar: true, sandals: false, bag: '#2a3550' });
    else {
      const o = age === 'elder' ? r.weighted([['saree', 5], ['salwar', 1]]) : r.weighted([['saree', 3], ['salwar', 2.5], ['frock', 1.6], ['tee_jeans', 1.8], ['office_f', 1.2]]);
      const sc = r.pick(SAREE);
      if (o === 'saree') Object.assign(sp, { outfit: 'saree', top: r.chance(0.5) ? sc : r.pick(SAREE), skirt: 'ankle', skirtCol: sc, pattern: r.chance(0.7) ? 1 : 2, bottom: sc });
      else if (o === 'salwar') Object.assign(sp, { outfit: 'salwar', top: sc, skirt: 'knee', skirtCol: sc, bottom: r.pick(['#f2efe6', '#1d1d24', sc]), pattern: r.chance(0.5) ? 2 : 0, longSleeve: r.chance(0.5) });
      else if (o === 'frock') Object.assign(sp, { outfit: 'frock', top: sc, skirt: r.chance(0.5) ? 'mid' : 'knee', skirtCol: sc, bottom: sp.skin, pattern: r.chance(0.5) ? 2 : 0 });
      else if (o === 'office_f') Object.assign(sp, { outfit: 'office_f', top: r.pick(['#f2f2ee', '#e8d8e8', '#d8e4f0']), bottom: '#2b2e36', skirt: 'mid', skirtCol: r.pick(['#2b2e36', '#3a2f2a']), longSleeve: r.chance(0.5), bag: '#5a3a2a', glasses: r.chance(0.2) });
      else Object.assign(sp, { outfit: 'tee_jeans', top: r.pick(SHIRTS), bottom: r.pick(['#2c3e5c', '#35486b', '#1f2a3a']), sandals: false, shoes: '#e8e8e4' });
    }
  } else {
    sp.hair = age === 'elder' ? r.pick(['grey', 'bald', 'short']) : r.pick(['short', 'short', 'wavy']);
    sp.moustache = (age === 'adult' || age === 'elder') && r.chance(0.45); sp.beard = age !== 'child' && age !== 'teen' && !sp.moustache && r.chance(0.25);
    sp.glasses = age !== 'child' && r.chance(0.15); sp.sandals = r.chance(0.5);
    if (school) Object.assign(sp, { outfit: 'school_boy', top: '#f6f6f2', bottom: '#f2f2ee', shorts: age === 'child', collar: true, bag: '#2a3550', shoes: '#151515', sandals: false });
    else {
      const o = age === 'elder' ? r.weighted([['national', 2], ['sarong', 2], ['shirt', 2]]) : r.weighted([['shirt', 4], ['tee', 2.5], ['office', 2], ['sarong', 1.6], ['worker', 1.2]]);
      if (o === 'national') Object.assign(sp, { outfit: 'national', top: '#f6f4ee', bottom: '#f6f4ee', skirt: 'ankle', skirtCol: '#f4f2ea', longSleeve: true, collar: true, sandals: true });
      else if (o === 'sarong') Object.assign(sp, { outfit: 'sarong', top: r.pick(SHIRTS), skirt: 'ankle', skirtCol: r.pick(['#3b5f8c', '#7c2f2f', '#2f6b4f', '#4a3f6b', '#6b5a3a']), pattern: r.chance(0.6) ? 3 : 2, bottom: '#333', sandals: true });
      else if (o === 'office') Object.assign(sp, { outfit: 'office', top: r.pick(['#f2f2ee', '#dfe8f2', '#e8eef4', '#f0e6d8']), bottom: r.pick(TROUSERS), longSleeve: true, collar: true, tie: r.chance(0.35) ? r.pick(['#7c2f2f', '#1f2a5a', '#2f4f3f']) : null, sandals: false, bag: r.chance(0.3) ? '#2a2420' : null });
      else if (o === 'worker') Object.assign(sp, { outfit: 'worker', top: r.pick(['#d96c3b', '#c9a227', '#5a6b3a', '#7a7a72']), bottom: r.pick(TROUSERS), sleeveless: r.chance(0.4), cap: r.chance(0.3) ? r.pick(['#c9a227', '#1f2a3a', '#7c2f2f']) : null, sandals: true });
      else Object.assign(sp, { outfit: o, top: r.pick(SHIRTS), bottom: r.pick(o === 'tee' ? ['#2c3e5c', '#35486b', '#6b6355'] : TROUSERS), collar: o === 'shirt', longSleeve: o === 'shirt' && r.chance(0.3), cap: o === 'tee' && r.chance(0.2) ? r.pick(['#1f2a3a', '#7c2f2f', '#eee']) : null });
    }
  }
  return Object.assign(sp, opts);
}
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
    const fkey = `${spec.sex}|${spec.beard ? 1 : 0}|${spec.seed % 4}`;
    const faceMat = getFaceMaterial(fkey, { female: spec.sex === 'f', stubble: spec.beard ? 0.9 : spec.sex === 'm' && spec.age === 'adult' ? 0.35 : 0, seed: spec.seed % 4, lips: spec.sex === 'f' ? '#8a3a3a' : '#7a4a40' });
    this.mesh = new THREE.SkinnedMesh(geo, [getBodyMaterial(), faceMat]);
    this.mesh.add(bones[0]); this.mesh.bind(skeleton); this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3); this.mesh.castShadow = true; this.mesh.receiveShadow = false; this.mesh.frustumCulled = true;
    this.root = new THREE.Group(); this.root.add(this.mesh);
    this.bones = Object.fromEntries(BONES.map((n, i) => [n, bones[i]])); this.hipY = bones[0].position.y;
    this.anim = new Animator(this);
  }
  dispose() { this.mesh.skeleton.dispose(); }
}

// ------------------------------------------------------------------ procedural animator
// state: speed (m/s), action (null|'sit'|'talk'|'phone'|'wave'|'dance'|'stretch'|'look'|'cower'|'argue'|'stumble'|'jump'|'drive'|'crouch'|'shove'|'point'|'clap'|'browse'|'umbrella'), turn rate
export class Animator {
  constructor(ch) { this.ch = ch; this.phase = Math.random() * 10; this.t = Math.random() * 100; this.speed = 0; this.action = null; this.actionW = 0; this.prevAction = null; this.lean = 0; this.air = 0; this.look = 0; this.crouch = 0; this.drive = 0; this.steer = 0; this.seed = Math.random(); }
  set(action) { if (action !== this.action) { this.prevAction = this.action; this.action = action; this.actionW = 0; this.actionT = 0; } }
  update(dt, speed, turnRate = 0) {
    const b = this.ch.bones; this.t += dt; this.actionT = (this.actionT || 0) + dt; this.speed = damp(this.speed, speed, 10, dt);
    const sp = this.speed; const run = clamp((sp - 2.2) / 2.5, 0, 1); const walk = clamp(sp / 1.2, 0, 1);
    const freq = sp < 0.05 ? 0 : lerp(1.75, 2.75, run) * (sp < 1.4 ? Math.max(0.7, sp / 1.4) : 1) / (this.ch.spec.height / 1.72);
    this.phase += dt * freq * Math.PI * 2 * 0.5;
    const ph = this.phase; const s = Math.sin(ph), c = Math.cos(ph);
    this.actionW = clamp(this.actionW + dt * 3, 0, 1); this.lean = damp(this.lean, clamp(turnRate * sp * 0.04, -0.25, 0.25), 6, dt);
    const A = this.action; const aw = A ? this.actionW : 0; const crouch = (this.crouch = damp(this.crouch, A === 'crouch' ? 1 : 0, 8, dt));
    const sit = A === 'sit' ? aw : 0; const drive = (this.drive = damp(this.drive, A === 'drive' ? 1 : 0, 8, dt));
    const breathe = Math.sin(this.t * 1.6 + this.seed * 6) * 0.015;
    const legAmp = lerp(0.45, 0.85, run) * walk, armAmp = lerp(0.35, 0.9, run) * walk, knee = lerp(0.55, 1.4, run) * walk;
    const R = (bone, x, y, z) => b[bone].rotation.set(x, y, z);
    // legs
    const legL = -s * legAmp, legR = s * legAmp;
    const kneeL = Math.max(0, -c) * knee + 0.05 * walk, kneeR = Math.max(0, c) * knee + 0.05 * walk;
    const seatT = Math.max(sit, drive);
    R('thighL', lerp(legL - crouch * 1.1, -1.45, seatT), 0, lerp(0, -0.06, seatT)); R('thighR', lerp(legR - crouch * 1.1, -1.45, seatT), 0, lerp(0, 0.06, seatT));
    R('shinL', lerp(kneeL + crouch * 1.9, 1.45, seatT), 0, 0); R('shinR', lerp(kneeR + crouch * 1.9, 1.45, seatT), 0, 0);
    R('footL', lerp(-kneeL * 0.25 + (legL > 0 ? legL * 0.3 : 0) - crouch * 0.6, 0, seatT), 0, 0); R('footR', lerp(-kneeR * 0.25 + (legR > 0 ? legR * 0.3 : 0) - crouch * 0.6, 0, seatT), 0, 0);
    // hips bob + sway
    const bob = (Math.abs(Math.cos(ph)) - 0.5) * lerp(0.03, 0.07, run) * walk;
    b.hips.position.y = this.ch.hipY + bob - crouch * 0.38 - seatT * 0.45 + (this.air > 0 ? 0 : 0);
    b.hips.rotation.set(run * 0.12 + crouch * 0.25, s * 0.12 * walk, this.lean);
    R('spine', breathe + run * 0.08 + crouch * 0.2, -s * 0.15 * walk, -this.lean * 0.5);
    R('chest', breathe * 0.5, -s * 0.12 * walk, 0);
    R('neck', -run * 0.1 - crouch * 0.2, 0, 0); R('head', 0, this.look * 0.6, 0);
    // arms
    let aL = [s * armAmp + 0.04, 0, 0.08 + run * 0.08], aR = [-s * armAmp + 0.04, 0, -0.08 - run * 0.08];
    let fL = [-(0.15 + run * 1.2 + walk * 0.1), 0, 0], fR = [-(0.15 + run * 1.2 + walk * 0.1), 0, 0];
    const blend = (cur, tgt, w) => cur.map((v, i) => lerp(v, tgt[i], w));
    const t = this.t, at = this.actionT;
    if (A && aw > 0) {
      let tl = null, tr = null, tfl = null, tfr = null, head = null;
      switch (A) {
        case 'talk': tr = [-0.4 - Math.sin(t * 3.1) * 0.25, 0.2, -0.2 - Math.sin(t * 2.3) * 0.15]; tfr = [-1.1 - Math.sin(t * 4) * 0.3, 0, 0]; tl = [-0.15, 0, 0.12]; tfl = [-0.5 - Math.max(0, Math.sin(t * 1.7)) * 0.6, 0, 0]; head = Math.sin(t * 0.9) * 0.25; break;
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
        case 'stumble': { const k = Math.max(0, 1 - at * 1.5); b.spine.rotation.x -= 0.5 * k; tr = [-1.2 * k, 0, -1.2 * k]; tl = [-1.2 * k, 0, 1.2 * k]; break; }
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
      }
      if (tl) aL = blend(aL, tl, aw); if (tr) aR = blend(aR, tr, aw); if (tfl) fL = blend(fL, tfl, aw); if (tfr) fR = blend(fR, tfr, aw); if (head !== null && head !== undefined) b.head.rotation.y = lerp(b.head.rotation.y, head, aw);
    }
    if (this.air > 0) { aL = blend(aL, [-0.6, 0, 0.5], 0.7); aR = blend(aR, [-0.6, 0, -0.5], 0.7); b.thighL.rotation.x = -0.6; b.shinL.rotation.x = 0.9; b.thighR.rotation.x = -0.1; b.shinR.rotation.x = 0.4; }
    R('armL', ...aL); R('armR', ...aR); R('foreL', ...fL); R('foreR', ...fR);
    R('handL', 0, 0, 0); R('handR', 0, 0, 0);
    if (A === 'ride' && aw > 0) { b.thighL.rotation.set(-1.2, 0, -0.25); b.thighR.rotation.set(-1.2, 0, 0.25); b.shinL.rotation.x = 1.3; b.shinR.rotation.x = 1.3; b.hips.position.y = this.ch.hipY - 0.15; }
  }
}
