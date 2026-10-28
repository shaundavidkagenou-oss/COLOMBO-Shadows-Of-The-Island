// Procedural skinned humans: one SkinnedMesh per person (body + head groups), 19-bone skeleton,
// Sri Lankan everyday clothing and a procedural animation layer (locomotion, idles, gestures, reactions).
import * as THREE from 'three';
import { TEX, faceAtlas, FACE_FRAMES } from '../gfx/Textures.js';
import { RNG } from '../core/rng.js';
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
    if (sandal) { sb.boxPart([ft[0], 0.008, 0.05], 0.1, 0.016, 0.27, W1('foot' + side), shoe); sb.boxPart([ft[0], 0.05 * s, 0.09], 0.092, 0.012, 0.03, W1('foot' + side), shoe); }
    else sb.boxPart([ft[0], 0.011, 0.047], 0.094, 0.022, 0.262, W1('foot' + side), C(sp.shoes === '#e8e8e4' ? '#d8d8d4' : '#1a1512'));
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
  const hr = f ? [0.083, 0.11, 0.098] : [0.088, 0.115, 0.102];
  const headBump = (x, y, z) => 1 + (z > 0.5 && y < -0.2 ? -0.06 * (z - 0.5) : 0) + (y < -0.55 ? -0.08 * (-y - 0.55) * 2 : 0);
  sb.ellipsoid(hc, hr[0], hr[1], hr[2], W1('head'), skin, { lat: 16, lon: 24, faceUV: true, target: sb.headIdx, bumpFn: headBump });
  // nose + ears
  sb.ellipsoid([0, hc[1] - 0.012, hc[2] + hr[2] - 0.004], 0.016, 0.026, 0.022, W1('head'), skin, { lat: 5, lon: 8, p0: 0.3 });
  for (const sx of [-1, 1]) sb.ellipsoid([sx * hr[0], hc[1], hc[2] - 0.01], 0.012, 0.03, 0.02, W1('head'), skin, { lat: 4, lon: 6 });
  // hair
  const hs = sp.hair;
  if (hs !== 'bald') {
    const capCol = (x, y, z) => hair; const lift = hs === 'wavy' ? 1.1 : hs === 'grey' ? 1.04 : 1.06;
    // hairline: high on the forehead, down past the temples to the ears, lower at the nape; below it the cap tucks inside the head
    const hairline = (x, z) => { const fr = smooth01((z + 0.1) / 0.75); return lerp(-0.25, f ? 0.4 : 0.5, fr) - (f ? 0.06 * Math.max(0, 1 - Math.abs(x) * 4) * 0 : 0) + (f && z > 0.6 ? 0.04 * Math.cos(x * 9) : 0); };
    const bump = (x, y, z) => (y < hairline(x, z) ? 0.9 / lift : 1) * (hs === 'wavy' ? 1 + 0.04 * Math.sin(x * 14) * Math.cos(z * 11) : 1);
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
    if (sp.beard) { // shell that follows the jaw exactly (same centre, radii and jaw shaping as the head), so it can never drift off the face
      const beardBump = (x, y, z) => { const hb = headBump(x, y, z); if (z < -0.3) return hb * 0.93; if (z > 0.72 && y > -0.52 && Math.abs(x) < 0.42) return hb * 0.96; // back of the shell and the lips stay inside the head
        return hb * (1.03 + 0.012 * Math.max(0, -y - 0.6)) + 0.004 * Math.sin(x * 40 + z * 23); };
      sb.ellipsoid(hc, hr[0], hr[1], hr[2], W1('head'), hair, { lat: 9, lon: 22, p0: Math.PI * 0.57, p1: Math.PI * 0.985, bumpFn: beardBump });
      sb.ellipsoid([0, hc[1] - 0.04, hc[2] + hr[2] * 0.93], 0.032, 0.009, 0.012, W1('head'), hair, { lat: 4, lon: 8 });
    }
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
    const stub = spec.beard ? 0.9 : spec.sex === 'm' && spec.age === 'adult' ? 0.35 : 0; const fkey = `${spec.sex}|${stub}|${spec.seed % 2}`;
    const faceMat = getFaceMaterial(fkey, { female: spec.sex === 'f', stubble: stub, seed: spec.seed % 2, lips: spec.sex === 'f' ? '#8a3a3a' : '#7a4a40' });
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
  const elder = age === 'elder', child = age === 'child', teen = age === 'teen';
  return {
    stride: (elder ? 0.84 : child ? 0.92 : 1) * r.range(0.93, 1.07) * (sp.skirt === 'ankle' ? 0.88 : 1),
    arm: (elder ? 0.55 : f ? 0.8 : 1) * r.range(0.7, 1.3) * (sp.bag ? 0.8 : 1),
    elbow: r.range(0.12, 0.34) + (elder ? 0.15 : 0),
    armOut: 0.07 + (sp.build - 1) * 0.3 + r.range(0, 0.04),
    bounce: (child ? 1.3 : elder ? 0.65 : 1) * r.range(0.8, 1.2),
    sway: (f ? 1.45 : 1) * r.range(0.7, 1.3),
    pelvis: (f ? 1.25 : 1) * r.range(0.8, 1.2),
    stoop: elder ? r.range(0.1, 0.22) : r.range(-0.03, 0.05),
    headDown: r.range(-0.04, 0.07) + (elder ? 0.08 : 0),
    knee: r.range(0.85, 1.15), swagger: !f && (teen || age === 'adult') ? r.range(0, 1) : 0,
    toeOut: r.range(0.03, 0.12) + (elder ? 0.06 : 0), lag: r.range(0.02, 0.07), idleRate: r.range(0.7, 1.4),
  };
}
export class Animator {
  constructor(ch) {
    this.ch = ch; this.g = gaitProfile(ch.spec); const s = ch.spec.height / 1.72; this.s = s;
    this.a = 0.43 * s; this.b = 0.415 * s; this.ankle = 0.085 * s; // thigh / shin lengths, ankle height
    this.cyc = Math.random(); this.t = Math.random() * 100; this.speed = 0; this.action = null; this.actionW = 0; this.prevAction = null;
    this.lean = 0; this.air = 0; this.look = 0; this.crouch = 0; this.drive = 0; this.steer = 0; this.seed = Math.random(); this.locoW = 0; this.hipYs = ch.hipY;
    this.shift = 0; this.shiftTarget = Math.random() < 0.5 ? -1 : 1; this.shiftT = 2 + Math.random() * 6; this.idleLook = 0; this.idleLookT = Math.random() * 4; this.idleLookTarget = 0;
    this.stepped = false; this.stepFoot = 0; this.runW = 0;
  }
  set(action) { if (action !== this.action) { this.prevAction = this.action; this.action = action; this.actionW = 0; this.actionT = 0; } }
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
    const sit = A_ === 'sit' ? aw : 0; const drive = (this.drive = damp(this.drive, A_ === 'drive' ? 1 : 0, 8, dt)); const seatT = Math.max(sit, drive);
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
    if (A_ && aw > 0) {
      let tl = null, tr = null, tfl = null, tfr = null, head = null;
      switch (A_) {
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
      }
      if (tl) aL = blend(aL, tl, aw); if (tr) aR = blend(aR, tr, aw); if (tfl) fL = blend(fL, tfl, aw); if (tfr) fR = blend(fR, tfr, aw); if (head !== null && head !== undefined) b.head.rotation.y = lerp(b.head.rotation.y, head, aw);
    }
    if (this.air > 0) { aL = blend(aL, [-0.6, 0, 0.5], 0.7); aR = blend(aR, [-0.6, 0, -0.5], 0.7); b.thighL.rotation.x = -0.6; b.shinL.rotation.x = 0.9; b.thighR.rotation.x = -0.1; b.shinR.rotation.x = 0.4; b.footL.rotation.x = 0.2; b.footR.rotation.x = 0.1; }
    if (this.armOverride) { const o = this.armOverride; const k = o.w ?? 1; if (o.aL) aL = blend(aL, o.aL, k); if (o.aR) aR = blend(aR, o.aR, k); if (o.fL) fL = blend(fL, o.fL, k); if (o.fR) fR = blend(fR, o.fR, k); }
    R('armL', ...aL); R('armR', ...aR); R('foreL', ...fL); R('foreR', ...fR);
    R('handL', 0.12 + run * 0.1, 0, 0.05); R('handR', 0.12 + run * 0.1, 0, -0.05);
    if (this.handOverride) { const o = this.handOverride; if (o.L) b.handL.rotation.set(...o.L); if (o.R) b.handR.rotation.set(...o.R); }
    if (A_ === 'ride' && aw > 0) { b.thighL.rotation.set(-1.2, 0, -0.25); b.thighR.rotation.set(-1.2, 0, 0.25); b.shinL.rotation.x = 1.3; b.shinR.rotation.x = 1.3; b.footL.rotation.x = 0; b.footR.rotation.x = 0; b.hips.position.y = this.ch.hipY - 0.15; b.hips.position.x = 0; b.hips.rotation.set(0, 0, 0); }
    if (this.ch.face) this.ch.face.update(dt);
  }
}
