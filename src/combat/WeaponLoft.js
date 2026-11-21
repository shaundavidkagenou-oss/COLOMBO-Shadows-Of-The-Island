// Smooth procedural weapon shapes: swept rounded sections and turned parts, so stocks, grips, handguards, receivers and
// magazines have real curved surfaces instead of stacked boxes. All in weapon space (origin = grip, +z = muzzle, +y = up).
import * as THREE from 'three';

const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
const KEYS = ['z', 'y', 'hw', 'hd', 'n', 'topK', 'botK', 'pinch', 'pinchY', 'x'];
const DEF = { n: 2.6, topK: 1, botK: 1, pinch: 0, pinchY: 0, x: 0 };

// sweep(stations, opts) — a closed tube through `stations` ({ z, y, hw, hd, n, topK, botK, pinch, pinchY, x }):
//  (z, y)  centre line point (x = 0 unless given); hw = half-width across x; hd = half-depth across the line (up for a
//  line running along +z); n = superellipse exponent (2 = ellipse, 4 = rounded box, 8 = nearly square); topK / botK scale
//  the width over the upper / lower half (a stock comb narrower than its belly); pinch / pinchY: an inward groove along
//  the sides at height pinchY (−1…1 of hd), e.g. finger grooves. Parameters are Catmull-Rom interpolated between stations
//  (`sub` rings per span) so the silhouette is smooth. opts.vertical: sections stay vertical (normal to z) instead of
//  normal to the line, for stocks and handguards that only tilt a little. opts.caps (default true): flat end caps.
export function sweep(stations, opts = {}) {
  const seg = opts.seg || 24, sub = opts.sub || 4, S = stations.map((s) => ({ ...DEF, ...s }));
  const rings = []; const N = S.length;
  for (let i = 0; i < N - 1; i++) for (let k = 0; k < (i === N - 2 ? sub + 1 : sub); k++) { const t = k / sub; const a = S[Math.max(0, i - 1)], b = S[i], c = S[i + 1], d = S[Math.min(N - 1, i + 2)];
    const r = {}; for (const key of KEYS) r[key] = cr(a[key], b[key], c[key], d[key], t); r.n = Math.max(1.2, r.n); rings.push(r); }
  const M = rings.length, pos = [], idx = [];
  for (let i = 0; i < M; i++) { const r = rings[i], p = rings[Math.max(0, i - 1)], q = rings[Math.min(M - 1, i + 1)];
    let ty = q.y - p.y, tz = q.z - p.z; const tl = Math.hypot(ty, tz) || 1; ty /= tl; tz /= tl; if (opts.vertical) { ty = 0; tz = 1; }
    const ny = tz, nz = -ty; r.ty = ty; r.tz = tz; // in-plane normal: "up" for a line along +z
    for (let k = 0; k < seg; k++) { const th = (k / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th); const e = 2 / r.n;
      const ex = Math.sign(c) * Math.pow(Math.abs(c), e), ey = Math.sign(s) * Math.pow(Math.abs(s), e);
      let w = r.hw * (ey > 0 ? 1 + (r.topK - 1) * ey : 1 + (r.botK - 1) * -ey); if (r.pinch) w *= 1 - r.pinch * Math.exp(-(((ey - r.pinchY) / 0.16) ** 2));
      pos.push(r.x + w * ex, r.y + ny * r.hd * ey, r.z + nz * r.hd * ey); } }
  for (let i = 0; i < M - 1; i++) for (let k = 0; k < seg; k++) { const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = a + seg, d = b + seg; idx.push(a, b, c, b, d, c); /* outward-facing (checked) */ }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  if (opts.caps === false) return g;
  // flat caps with their own vertices (a crisp edge, not a smeared normal)
  const parts = [g];
  for (const [ri, sgn] of [[0, -1], [M - 1, 1]]) { const r = rings[ri], cp = [], ci = []; const nx = 0, nyy = r.ty * sgn, nzz = r.tz * sgn;
    cp.push(r.x, r.y, r.z); for (let k = 0; k < seg; k++) { const o = (ri * seg + k) * 3; cp.push(pos[o], pos[o + 1], pos[o + 2]); }
    for (let k = 0; k < seg; k++) { const a = 1 + k, b = 1 + ((k + 1) % seg); if (sgn > 0) ci.push(0, a, b); else ci.push(0, b, a); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setIndex(ci);
    const nrm = new Float32Array(cp.length); for (let j = 0; j < cp.length; j += 3) { nrm[j] = nx; nrm[j + 1] = nyy; nrm[j + 2] = nzz; } cg.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); parts.push(cg); }
  return mergeSimple(parts);
}

// a turned part along z: profile [[z, r], ...] (r > 0), centred on (x, y); ends closed when they reach r ≈ 0
export function latheZ(profile, y = 0, x = 0, seg = 20) {
  const pts = profile.map(([z, r]) => new THREE.Vector2(Math.max(1e-5, r), z));
  const g = new THREE.LatheGeometry(pts, seg); g.rotateX(Math.PI / 2); // lathe axis y → +z
  g.translate(x, y, 0); return g;
}

// a ring around the z axis (sight hood, barrel band): radius R, tube radius t, arc (full by default) starting at angle a0
export function ringZ(R, t, z, y = 0, x = 0, arc = Math.PI * 2, a0 = 0, seg = 28) {
  const g = new THREE.TorusGeometry(R, t, 8, seg, arc); g.rotateZ(a0); g.translate(x, y, z); return g;
}

// merge non-indexed / indexed geometries that only carry position + normal (keeps the helpers dependency-free)
function mergeSimple(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(nv * 3), Nn = new Float32Array(nv * 3), I = new Uint32Array(ni); let vo = 0, io = 0;
  for (const g of list) { P.set(g.attributes.position.array, vo * 3); Nn.set(g.attributes.normal.array, vo * 3);
    if (g.index) { const a = g.index.array; for (let j = 0; j < a.length; j++) I[io + j] = a[j] + vo; io += a.length; } else { for (let j = 0; j < g.attributes.position.count; j++) I[io + j] = vo + j; io += g.attributes.position.count; }
    vo += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); g.setIndex(new THREE.BufferAttribute(I, 1)); return g;
}

// a heavy barrel with `flutes` long grooves milled along it (z0…z1), radius r, fading in / out over `fade` at each end
export function flutedZ(r, z0, z1, y = 0, flutes = 6, depth = 0.0017, fade = 0.03, seg = 48) {
  const n = Math.max(6, Math.ceil((z1 - z0) / 0.02)); const prof = []; for (let i = 0; i <= n; i++) prof.push([z0 + (z1 - z0) * i / n, r]);
  const g = latheZ(prof, 0, 0, seg); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), yy = p.getY(i), z = p.getZ(i); const a = Math.atan2(x, yy); const env = Math.min(1, Math.max(0, (z - z0) / fade), Math.max(0, (z1 - z) / fade));
    const f = Math.pow(Math.max(0, Math.cos(flutes * a)), 3) * env; const k = (r - depth * f) / r; p.setX(i, x * k); p.setY(i, yy * k); }
  g.computeVertexNormals(); g.translate(0, y, 0); return g;
}
