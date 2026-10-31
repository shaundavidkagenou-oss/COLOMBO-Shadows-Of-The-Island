// Flower beds: real 3D plants instead of crossed picture cards. Each species is modelled from curved, folded leaf blades and
// individual petals with vertex-colour gradients, in two levels of detail; every bed is planted like a Colombo municipal bed —
// tall canna in the centre, a ring of pom-pom marigolds or scarlet salvia, and an edge of Madagascar periwinkle.
// Plants are drawn with a few InstancedMeshes (one draw call per species/colour/LOD); instance lists are rebuilt only when a
// bed crosses a distance band, and the plants sway on the same wind clock as the trees.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { windUniform } from './Wind.js';

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // sRGB hex → linear vertex colour
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---- tiny mesh builder: parametric patches (each patch gets its own vertices, normals smoothed within the patch)
class PB {
  constructor() { this.pos = []; this.col = []; this.idx = []; this.n = 0; }
  // f(u, v) → [x, y, z]; c(u, v) → [r, g, b]; u ∈ [0,1] in nu steps, v ∈ [0,1] in nv steps
  patch(nu, nv, f, c, wrapV = false) {
    const base = this.n, cols = wrapV ? nv : nv + 1;
    for (let i = 0; i <= nu; i++) for (let j = 0; j < cols; j++) { const u = i / nu, v = j / nv; this.pos.push(...f(u, v)); this.col.push(...c(u, v)); this.n++; }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const j1 = wrapV ? (j + 1) % nv : j + 1; const a = base + i * cols + j, b = base + (i + 1) * cols + j, cc = base + (i + 1) * cols + j1, d = base + i * cols + j1;
      this.idx.push(a, b, cc, a, cc, d);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }
}
const V = {
  add: (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
};

// A leaf blade or petal: base point, heading yaw, elevation, length, half-width profile, droop (gravity curl), V-fold along
// the midrib, edge ripple, twist. Colours: base → tip gradient, midrib lighter, edges slightly darker.
function blade(b, o, nu, nv) {
  const dirH = [Math.sin(o.yaw), 0, Math.cos(o.yaw)], side = [Math.cos(o.yaw), 0, -Math.sin(o.yaw)];
  const ce = Math.cos(o.el), se = Math.sin(o.el);
  const spine = (u) => { const s = u * o.len; return [o.p[0] + dirH[0] * s * ce, o.p[1] + s * se - o.droop * o.len * u * u, o.p[2] + dirH[2] * s * ce]; };
  b.patch(nu, nv, (u, v) => {
    const w = o.w(u), t = v * 2 - 1, sp = spine(u), tw = (o.twist || 0) * u;
    const fold = Math.abs(t) * w * (o.fold || 0), rip = (o.ripple || 0) * w * Math.sin(u * 17 + t * 2) * Math.abs(t);
    const sx = side[0] * Math.cos(tw), sz = side[2] * Math.cos(tw), sy = Math.sin(tw);
    return [sp[0] + sx * t * w, sp[1] + sy * t * w + fold + rip, sp[2] + sz * t * w];
  }, (u, v) => { const t = Math.abs(v * 2 - 1); let c = mix(o.c0, o.c1, Math.pow(u, o.cg || 1)); if (o.mid) c = mix(c, o.mid, Math.max(0, 1 - t * 4) * 0.55); return mix(c, o.edge || c, t * t * 0.5); });
}
// a tapered tube (stem, spike, floret): from a to b with radii r0 → r1
function tube(b, a, e, r0, r1, sides, segs, c0, c1, bend = [0, 0, 0]) {
  const ax = V.norm([e[0] - a[0], e[1] - a[1], e[2] - a[2]]); const ref = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const s1 = V.norm(V.cross(ax, ref)), s2 = V.cross(ax, s1);
  b.patch(segs, sides, (u, v) => {
    const a2 = v * Math.PI * 2, r = r0 + (r1 - r0) * u, bu = u * (1 - u) * 4;
    const c = [a[0] + (e[0] - a[0]) * u + bend[0] * bu, a[1] + (e[1] - a[1]) * u + bend[1] * bu, a[2] + (e[2] - a[2]) * u + bend[2] * bu];
    return [c[0] + (s1[0] * Math.cos(a2) + s2[0] * Math.sin(a2)) * r, c[1] + (s1[1] * Math.cos(a2) + s2[1] * Math.sin(a2)) * r, c[2] + (s1[2] * Math.cos(a2) + s2[2] * Math.sin(a2)) * r];
  }, (u) => mix(c0, c1, u), true);
}
// a ruffled dome (marigold pom-pom): latitude/longitude with per-vertex radius ruffles, deeper colour in the crevices
function pompom(b, p, r, nLat, nLon, cIn, cOut, seed) {
  b.patch(nLat, nLon, (u, v) => {
    const th = u * Math.PI * 0.62, ph = v * Math.PI * 2, ruf = 1 + 0.13 * Math.sin(ph * 9 + seed) * Math.sin(th * 7 + seed * 0.7) + 0.06 * Math.sin(ph * 17 + th * 11);
    const rr = r * ruf; return [p[0] + Math.sin(th) * Math.cos(ph) * rr, p[1] + Math.cos(th) * rr * 0.78, p[2] + Math.sin(th) * Math.sin(ph) * rr];
  }, (u, v) => { const ruf = Math.sin(v * Math.PI * 2 * 9 + seed) * Math.sin(u * Math.PI * 0.62 * 7 + seed * 0.7); return mix(cIn, cOut, Math.min(1, 0.55 + ruf * 0.45 + u * 0.2)); }, true);
}

const LEAF = { canna: lin('#3f6f22'), cannaB: lin('#5a3a2a'), mari: lin('#2c5418'), salv: lin('#3a6a22'), peri: lin('#17421a') };
const lanceolate = (W) => (u) => W * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.96 + 0.02)), 0.75) * (1 - 0.25 * u);
const ovate = (W) => (u) => W * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.94 + 0.03)), 0.6) * (1.15 - 0.45 * u);

// ---- species. hi: q = 1, lo: q = 0 (fewer segments, fewer organs)
function canna(q, flower, bronze) {
  const b = new PB(), r = new RNG(11 + (bronze ? 3 : 0)), H = 1.05, lc = bronze ? LEAF.cannaB : LEAF.canna, nu = q ? 6 : 3, nv = q ? 4 : 1;
  tube(b, [0, 0, 0], [0.02, H, 0], 0.016, 0.01, q ? 6 : 3, q ? 3 : 1, mix(lc, [0.2, 0.3, 0.1], 0.3), lc);
  const nL = q ? 10 : 5;
  for (let i = 0; i < nL; i++) {
    const y = 0.05 + i / nL * H * 0.55, yaw = i * 2.4 + r.range(-0.3, 0.3), len = r.range(0.42, 0.58) * (1 - i / nL * 0.35);
    blade(b, { p: [0, y, 0], yaw, el: r.range(0.85, 1.15), len, droop: r.range(0.45, 0.7), w: lanceolate(len * 0.22), fold: 0.35, ripple: q ? 0.06 : 0, twist: r.range(-0.3, 0.3),
      c0: mix(lc, [0.25, 0.32, 0.12], 0.25), c1: lc, mid: mix(lc, [0.75, 0.8, 0.5], 0.4), edge: bronze ? mix(lc, [0.5, 0.1, 0.1], 0.4) : mix(lc, [0.1, 0.2, 0.05], 0.4) }, nu, nv);
  }
  // flower: 5–6 broad, wavy staminodes flaring from the top of the spike, plus a bud
  const nP = q ? 7 : 4, top = [0.02, H, 0];
  for (let i = 0; i < nP; i++) {
    const yaw = i / nP * Math.PI * 2 + r.range(-0.25, 0.25), len = r.range(0.15, 0.2);
    blade(b, { p: top, yaw, el: r.range(0.5, 1.0), len, droop: r.range(0.15, 0.35), w: ovate(len * 0.4), fold: -0.25, ripple: q ? 0.25 : 0, twist: r.range(-0.5, 0.5),
      c0: mix(flower[0], [0.9, 0.85, 0.2], flower[2] ? 0.35 : 0.1), c1: flower[0], mid: flower[1], edge: flower[1] }, q ? 4 : 2, q ? 3 : 1);
  }
  tube(b, [0.02, H, 0], [0.05, H + 0.1, 0.01], 0.012, 0.004, q ? 5 : 3, 1, lc, flower[1]);
  return b.geometry();
}
function marigold(q, flower) {
  const b = new PB(), r = new RNG(23), nL = q ? 12 : 6;
  for (let i = 0; i < nL; i++) { // finely divided leaves → narrow, deeply rippled blades in a mound
    const len = r.range(0.12, 0.18);
    blade(b, { p: [r.range(-0.03, 0.03), r.range(0.02, 0.14), r.range(-0.03, 0.03)], yaw: i * 2.39, el: r.range(0.3, 0.9), len, droop: 0.3, w: lanceolate(len * 0.2), fold: 0.15, ripple: q ? 0.45 : 0, twist: r.range(-0.4, 0.4),
      c0: mix(LEAF.mari, [0.2, 0.3, 0.1], 0.3), c1: LEAF.mari, mid: mix(LEAF.mari, [0.5, 0.6, 0.3], 0.3) }, q ? 4 : 2, q ? 2 : 1);
  }
  const heads = q ? 3 : 2;
  for (let i = 0; i < heads; i++) {
    const a = i * 2.2 + 0.4, d = i ? 0.06 : 0.0, h = 0.27 + (i ? -0.04 : 0.03), p = [Math.cos(a) * d, h, Math.sin(a) * d], hr = i ? 0.034 : 0.04;
    tube(b, [p[0] * 0.3, 0.08, p[2] * 0.3], [p[0], h - hr * 0.5, p[2]], 0.004, 0.006, 3, 1, LEAF.mari, LEAF.mari);
    pompom(b, p, hr, q ? 5 : 2, q ? 10 : 6, mix(flower, [0.5, 0.12, 0.0], 0.45), flower, i * 1.7 + 0.5);
    if (q) for (let k = 0; k < 8; k++) blade(b, { p: [p[0], p[1] - hr * 0.25, p[2]], yaw: k / 8 * Math.PI * 2, el: -0.15, len: hr * 0.8, droop: 0.3, w: ovate(hr * 0.42), fold: -0.2, ripple: 0.3, c0: flower, c1: mix(flower, [1, 1, 0.6], 0.1) }, 2, 2);
  }
  return b.geometry();
}
function salvia(q) {
  const b = new PB(), r = new RNG(31), red = lin('#d21a10'), dark = lin('#8a0c08'), nPair = q ? 4 : 2;
  for (let i = 0; i < nPair; i++) for (const s of [0, Math.PI]) {
    const len = 0.1 - i * 0.012, yaw = i * 1.57 + s + r.range(-0.2, 0.2);
    blade(b, { p: [0, 0.03 + i * 0.045, 0], yaw, el: 0.45, len, droop: 0.35, w: ovate(len * 0.42), fold: 0.25, ripple: q ? 0.08 : 0, c0: LEAF.salv, c1: mix(LEAF.salv, [0.15, 0.3, 0.08], 0.3), mid: mix(LEAF.salv, [0.6, 0.7, 0.4], 0.35) }, q ? 4 : 2, q ? 2 : 1);
  }
  const spikes = q ? 3 : 1;
  for (let k = 0; k < spikes; k++) { // spike of scarlet tubular florets in whorls, red calyces
    const a = k * 2.1, d = k ? 0.04 : 0, x = Math.cos(a) * d, z = Math.sin(a) * d, y0 = 0.17, y1 = 0.36 - (k ? 0.04 : 0);
    tube(b, [0, 0.1, 0], [x, y1, z], 0.006, 0.004, 3, 1, LEAF.salv, red);
    const wh = q ? 5 : 3;
    for (let w = 0; w < wh; w++) {
      const t = w / (wh - 1), y = y0 + (y1 - y0) * t, n = q ? 3 : 2;
      for (let f = 0; f < n; f++) { const fa = f / n * Math.PI * 2 + w * 0.9, L = 0.042 * (1 - t * 0.35), p = [x + Math.cos(fa) * 0.008, y, z + Math.sin(fa) * 0.008];
        tube(b, p, [p[0] + Math.cos(fa) * L * 0.7, y + L * 0.7, p[2] + Math.sin(fa) * L * 0.7], 0.007, 0.0045, q ? 4 : 3, 1, dark, red, [0, 0.006, 0]); }
    }
  }
  return b.geometry();
}
function periwinkle(q, petal, eye) {
  const b = new PB(), r = new RNG(41), nL = q ? 10 : 5;
  for (let i = 0; i < nL; i++) { // glossy, oval, opposite leaves with a pale midrib
    const len = r.range(0.075, 0.1);
    blade(b, { p: [r.range(-0.035, 0.035), r.range(0.03, 0.16), r.range(-0.035, 0.035)], yaw: i * 2.4, el: r.range(0.1, 0.45), len, droop: 0.2, w: ovate(len * 0.42), fold: 0.2,
      c0: LEAF.peri, c1: mix(LEAF.peri, [0.05, 0.18, 0.05], 0.3), mid: mix(LEAF.peri, lin('#b9d39a'), 0.45), edge: mix(LEAF.peri, [0, 0.06, 0], 0.5) }, q ? 3 : 2, q ? 2 : 1);
  }
  const nF = q ? 3 : 2;
  for (let f = 0; f < nF; f++) { // five flat, overlapping petals in a pinwheel around a dark eye, facing up/out
    const a = f * 2.3, c = [Math.cos(a) * 0.055, 0.18 + f * 0.012, Math.sin(a) * 0.055], tilt = 0.25;
    for (let k = 0; k < 5; k++) blade(b, { p: c, yaw: k / 5 * Math.PI * 2 + a, el: tilt, len: 0.034, droop: 0.15, w: ovate(0.017), fold: -0.1, twist: 0.35, c0: eye, c1: petal, cg: 0.35, edge: petal }, q ? 3 : 1, q ? 2 : 1);
    if (q) tube(b, [c[0], c[1] - 0.004, c[2]], [c[0], c[1] + 0.006, c[2]], 0.004, 0.0025, 4, 1, eye, mix(eye, [0.95, 0.9, 0.5], 0.4));
  }
  return b.geometry();
}

// ---- catalogue: key → { hi, lo }
const FLOWER = {
  cannaRed: [lin('#d8160e'), lin('#ff5a2a')], cannaOrange: [lin('#f06a0c'), lin('#ffb03a')], cannaYellow: [lin('#f4c21c'), lin('#d23a14'), 1],
  mariOrange: lin('#f57a0a'), mariYellow: lin('#ffc21a'),
};
function buildCatalogue() {
  const C = {};
  const add = (k, f) => { C[k] = { hi: f(1), lo: f(0) }; };
  add('cannaRed', (q) => canna(q, FLOWER.cannaRed, true)); add('cannaOrange', (q) => canna(q, FLOWER.cannaOrange, false)); add('cannaYellow', (q) => canna(q, FLOWER.cannaYellow, false));
  add('mariOrange', (q) => marigold(q, FLOWER.mariOrange)); add('mariYellow', (q) => marigold(q, FLOWER.mariYellow)); add('salvia', (q) => salvia(q));
  add('periPink', (q) => periwinkle(q, lin('#f07ab4'), lin('#a8124e'))); add('periWhite', (q) => periwinkle(q, lin('#f6f2ee'), lin('#c8203c')));
  return C;
}
export function flowerTriangles() { const C = buildCatalogue(); const o = {}; for (const [k, v] of Object.entries(C)) o[k] = { hi: v.hi.index.count / 3, lo: v.lo.index.count / 3 }; return o; }

// plant one bed: rings by height, jittered hexagonal spacing so nothing interpenetrates, deterministic per bed
export function plantBed(x, z, r, y, seed) {
  const rng = new RNG(seed), out = [];
  const mid = rng.chance(0.5) ? (rng.chance(0.5) ? 'mariOrange' : 'mariYellow') : 'salvia', edge = rng.chance(0.55) ? 'periPink' : 'periWhite', centre = rng.pick(['cannaRed', 'cannaOrange', 'cannaYellow']);
  const rings = [[0, r * 0.42, centre, 0.42, [0.9, 1.15]], [r * 0.42 + 0.12, r * 0.74, mid, 0.27, [0.85, 1.15]], [r * 0.74 + 0.08, r - 0.18, edge, 0.2, [1.1, 1.4]]];
  for (const [r0, r1, key, sp, sc] of rings) {
    if (r1 <= r0) continue;
    for (let rr = r0 === 0 ? 0 : r0 + sp * 0.5; rr <= r1 + 1e-6; rr += sp * 0.87) {
      const n = rr < 1e-3 ? 1 : Math.max(1, Math.floor((Math.PI * 2 * rr) / sp)), a0 = rng.next() * 6.28;
      for (let i = 0; i < n; i++) {
        const a = a0 + i / n * Math.PI * 2 + rng.range(-0.12, 0.12) / Math.max(1, n / 6), rj = Math.min(r - 0.16, rr + rng.range(-0.03, 0.03));
        const px = x + Math.cos(a) * rj, pz = z + Math.sin(a) * rj;
        if (out.some((o) => o.key === key && (o.x - px) ** 2 + (o.z - pz) ** 2 < (sp * 0.72) ** 2)) continue; /* keep foliage from growing through a neighbour */
        out.push({ key, x: px, z: pz, y, yaw: rng.next() * Math.PI * 2, s: rng.range(sc[0], sc[1]), tilt: rng.range(-0.06, 0.06) });
      }
    }
  }
  return out;
}

function windMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.72, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float fph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
      #else
        float fph = 0.0;
      #endif
      float fh = position.y * position.y;
      transformed.x += sin(uWind * 2.3 + fph) * 0.05 * fh;
      transformed.z += cos(uWind * 1.9 + fph * 1.4) * 0.035 * fh;`);
  };
  m.customProgramCacheKey = () => 'flowerWind';
  return m;
}

export class FlowerBeds {
  // beds: [[x, z, r], ...]; y: soil height
  constructor(beds, y, opts = {}) {
    this.near = opts.near ?? 30; this.far = opts.far ?? 220;
    this.cat = buildCatalogue(); this.mat = windMaterial(); this.group = new THREE.Group(); this.group.name = 'flowers';
    this.beds = beds.map(([x, z, r], i) => ({ x, z, r, level: -1, plants: plantBed(x, z, r, y, 7001 + i * 131) }));
    const cap = {}; for (const b of this.beds) for (const p of b.plants) cap[p.key] = (cap[p.key] || 0) + 1;
    this.meshes = {};
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), t = new THREE.Vector3();
    for (const b of this.beds) { b.mats = {}; for (const p of b.plants) { e.set(p.tilt, p.yaw, -p.tilt * 0.7); q.setFromEuler(e); s.setScalar(p.s); t.set(p.x, p.y, p.z); m4.compose(t, q, s); (b.mats[p.key] ||= []).push(...m4.elements); } }
    for (const [k, n] of Object.entries(cap)) for (const lod of ['hi', 'lo']) {
      const im = new THREE.InstancedMesh(this.cat[k][lod], this.mat, n); im.count = 0; im.name = `flowers-${k}-${lod}`; im.castShadow = lod === 'hi'; im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.meshes[k + ':' + lod] = im; this.group.add(im);
    }
    this.counts = { hi: 0, lo: 0 };
  }
  setQuality(q) { const s = q === 'low' ? 0.55 : q === 'medium' ? 0.8 : q === 'ultra' ? 1.4 : 1; this.near = 30 * s; this.beds.forEach((b) => { b.level = -1; }); }
  update(cam) {
    let changed = false;
    const N = this.near, F = this.far, h = 4; // hysteresis so a bed on a band edge doesn't flip every frame
    const want = (d, cur) => cur === 0 ? (d < N + h ? 0 : d < F ? 1 : 2) : cur === 1 ? (d < N - h ? 0 : d < F + h ? 1 : 2) : cur === 2 ? (d < N ? 0 : d < F - h ? 1 : 2) : (d < N ? 0 : d < F ? 1 : 2);
    for (const b of this.beds) { const lv = want(Math.hypot(b.x - cam.x, b.z - cam.z) - b.r, b.level); if (lv !== b.level) { b.level = lv; changed = true; } }
    if (!changed) return false;
    for (const im of Object.values(this.meshes)) im.count = 0;
    this.counts = { hi: 0, lo: 0 };
    for (const b of this.beds) { if (b.level === 2) continue; const lod = b.level === 0 ? 'hi' : 'lo';
      for (const [k, arr] of Object.entries(b.mats)) { const im = this.meshes[k + ':' + lod]; im.instanceMatrix.array.set(arr, im.count * 16); im.count += arr.length / 16; this.counts[lod] += arr.length / 16; } }
    for (const im of Object.values(this.meshes)) { im.instanceMatrix.needsUpdate = true; im.visible = im.count > 0; if (im.count) im.computeBoundingSphere(); }
    return true;
  }
}
