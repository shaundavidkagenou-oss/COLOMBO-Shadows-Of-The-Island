// Vehicle body surfacing (replaces the old ExtrudeGeometry slab used by VehicleModels.sideBody).
//
// Why: an extruded side silhouette has perfectly flat side caps triangulated only between outline vertices (a door side was
// a handful of huge triangles) and a top strip that is straight across the width (a flat plank bonnet / boot). Any shaping
// (taper, tumblehome, crown) could only move outline vertices, so panels creased between them: the "blocks bolted together"
// look. Here the same body is generated as a dense, well-distributed surface:
//   • bodySkin(): the side silhouette swept across the width with a quarter-round shoulder; the rim is sampled every few
//     centimetres along the outline (coarse on the underside) and across the width; both side faces are triangulated with
//     interior Steiner points so they can bend smoothly. Same coordinate conventions as before (side faces at x = ±W, shoulder
//     zone |x| ≥ W − bevel), so door apertures, open load beds and taper keep working unchanged.
//   • makeBodyWarp(): a smooth shape field applied once to the whole baked body (skin + shut doors + glass + pillars + lamps +
//     trims): plan-view rounding of the nose and tail corners, crowned bonnet / boot / roof, tumblehome along the sides.
//     Normals are carried through the field's Jacobian (flat parts stay flat, smooth parts stay smooth), so every part that
//     sits on the skin follows it and nothing floats or sinks. Wheels, seats, hinges and physics dimensions are untouched.
import * as THREE from 'three';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// closed outline [[z, y], ...] (any orientation) → evenly resampled points with smooth outward normals
function resample(pts, fine, coarse) {
  let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const ccw = area > 0; const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]; const dz = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dz, dy); if (L < 1e-6) continue;
    const nz = ccw ? dy / L : -dy / L, ny = ccw ? -dz / L : dz / L; // outward
    const step = ny < -0.85 ? coarse : fine; const n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) out.push({ z: a[0] + dz * k / n, y: a[1] + dy * k / n, sn: [nz, ny], corner: k === 0 });
  }
  // vertex normals: segment normal inside a segment, bisector (mitred, clamped) at the original corners
  for (let i = 0; i < out.length; i++) { const p = out[i]; if (!p.corner) { p.n = p.sn; p.m = 1; continue; }
    const q = out[(i - 1 + out.length) % out.length].sn; let nz = p.sn[0] + q[0], ny = p.sn[1] + q[1]; const l = Math.hypot(nz, ny) || 1; nz /= l; ny /= l;
    p.n = [nz, ny]; p.m = Math.min(2, 1 / Math.max(0.35, nz * p.sn[0] + ny * p.sn[1])); }
  return out;
}

// side silhouette swept across x ∈ [−W, W]; returns an indexed position-only BufferGeometry
const skinMemo = new Map(); // body variants of a type mostly share a silhouette: build each distinct skin once (callers get a clone)
export function bodySkin(outline, W, bevel, opts = {}) {
  const key = W.toFixed(4) + '|' + bevel.toFixed(4) + '|' + JSON.stringify(opts) + '|' + outline.map((p) => p[0].toFixed(4) + ',' + p[1].toFixed(4)).join(';');
  let g = skinMemo.get(key); if (!g) { g = buildSkin(outline, W, bevel, opts); if (skinMemo.size > 400) skinMemo.clear(); skinMemo.set(key, g); } return g.clone();
}
function buildSkin(outline, W, bevel, { fine = 0.12, coarse = 0.3, cols = 6, bevSeg = 3, steiner = 0.14 } = {}) {
  const ins = 0.6 * bevel; const P0 = resample(outline, fine, coarse); relaxInset(P0, ins); const P = gabrielSplit(P0, ins); const flat = W - bevel;
  const X = [], OFF = []; // across-width columns: −x shoulder (cap edge first), flat top, +x shoulder
  for (let s = bevSeg; s >= 1; s--) { const th = (s / bevSeg) * Math.PI / 2; X.push(-(flat + bevel * Math.sin(th))); OFF.push(-ins * (1 - Math.cos(th))); }
  for (let c = 0; c <= cols; c++) { X.push(-flat + 2 * flat * c / cols); OFF.push(0); }
  for (let s = 1; s <= bevSeg; s++) { const th = (s / bevSeg) * Math.PI / 2; X.push(flat + bevel * Math.sin(th)); OFF.push(-ins * (1 - Math.cos(th))); }
  const nc = X.length, np = P.length; const pos = [], idx = [];
  for (let i = 0; i < np; i++) { const p = P[i]; for (let j = 0; j < nc; j++) { const o = OFF[j] * p.m; pos.push(X[j], p.y + p.n[1] * o, p.z + p.n[0] * o); } }
  // rim quads, wound to face outward along the outline normal
  const v = (i, j) => (i % np) * nc + j; const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3();
  const at = (k, t) => t.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  let flip = false; { const i = Math.floor(np / 2), j = Math.floor(nc / 2); at(v(i, j), A); at(v(i + 1, j), B); at(v(i, j + 1), Cc); const n = B.sub(A).cross(Cc.sub(A)); flip = n.y * P[i].n[1] + n.z * P[i].n[0] < 0; }
  for (let i = 0; i < np; i++) for (let j = 0; j < nc - 1; j++) { const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1); if (flip) idx.push(a, d, c, a, c, b); else idx.push(a, b, c, a, c, d); }
  // side faces: the inset outline (= the rim's outermost columns) + interior Steiner points, at x = ±W
  const ring = P.map((p) => new THREE.Vector2(p.z + p.n[0] * -ins * p.m, p.y + p.n[1] * -ins * p.m));
  const RN = ring.length, RZ = new Float64Array(RN), RY = new Float64Array(RN); for (let i = 0; i < RN; i++) { RZ[i] = ring[i].x; RY[i] = ring[i].y; }
  let z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (let i = 0; i < RN; i++) { z0 = Math.min(z0, RZ[i]); z1 = Math.max(z1, RZ[i]); y0 = Math.min(y0, RY[i]); y1 = Math.max(y1, RY[i]); }
  // a candidate interior point is kept if inside the ring, ≥ 0.55·steiner from it, and outside every segment's diametral circle
  const keepPt = (z, y) => { let c = false; const dmin2 = (steiner * 0.55) ** 2;
    for (let i = 0, j = RN - 1; i < RN; j = i++) { const az = RZ[j], ay = RY[j], bz = RZ[i], by = RY[i];
      if ((by > y) !== (ay > y) && z < (az - bz) * (y - by) / (ay - by) + bz) c = !c;
      const ez = bz - az, ey = by - ay, L2 = ez * ez + ey * ey || 1; const t = Math.max(0, Math.min(1, ((z - az) * ez + (y - ay) * ey) / L2)); const qz = z - az - ez * t, qy = y - ay - ey * t; if (qz * qz + qy * qy < dmin2) return false;
      const mz = z - (az + bz) / 2, my = y - (ay + by) / 2; if (mz * mz + my * my < L2 / 4 * 1.05) return false; }
    return c; };
  const interior = []; let hk = 0;
  for (let z = z0 + steiner * 0.5; z < z1; z += steiner) for (let y = y0 + steiner * 0.5; y < y1; y += steiner) {
    const h1 = Math.sin(++hk * 12.9898) * 43758.5453, h2 = Math.sin(hk * 78.233) * 12543.1459; // deterministic jitter: no cocircular grid quads
    const jz = z + ((Math.floor(y / steiner) % 2) ? steiner * 0.5 : 0) + (h1 - Math.floor(h1) - 0.5) * steiner * 0.2, jy = y + (h2 - Math.floor(h2) - 0.5) * steiner * 0.2;
    if (keepPt(jz, jy)) interior.push(new THREE.Vector2(jz, jy)); }
  const { pts: flatPts, tris } = capTriangulate(ring, interior); // constrained by construction: every ring edge is Gabriel
  for (const side of [-1, 1]) {
    const base = pos.length / 3; const edgeCol = side < 0 ? 0 : nc - 1;
    for (let k = 0; k < flatPts.length; k++) { if (k < np) { const q = v(k, edgeCol) * 3; pos.push(pos[q], pos[q + 1], pos[q + 2]); } else pos.push(side * W, flatPts[k].y, flatPts[k].x); }
    for (const [a, b, c] of tris) { // face ±x
      const pa = flatPts[a], pb = flatPts[b], pc = flatPts[c]; const cr = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x); // z→y orientation
      if ((cr > 0) === (side > 0)) idx.push(base + a, base + c, base + b); else idx.push(base + a, base + b, base + c); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}

// Split every outline segment whose diametral circle holds another outline point (Gabriel condition), so each
// segment is guaranteed to be an edge of the Delaunay triangulation of the outline + interior points. Runs on the
// resampled points before the rim is built, so rim and side faces keep sharing every vertex.
// Inset offsets (rim shoulder / side-face ring) fold back where outline segments are shorter than the inset near sharp
// corners (sill ↔ wheel-arch tips). Shrink the inset locally (p.sc, folded into p.m) until no inset segment reverses
// or collapses below 25 % of its outline length.
function relaxInset(P, ins) {
  for (const p of P) { p.m0 = p.m; p.sc = 1; }
  const at = (p) => [p.z - p.n[0] * ins * p.m0 * p.sc, p.y - p.n[1] * ins * p.m0 * p.sc];
  for (let it = 0; it < 30; it++) {
    let bad = false; const N = P.length;
    for (let i = 0; i < N; i++) { const a = P[i], b = P[(i + 1) % N]; const [az, ay] = at(a), [bz, by] = at(b); const oz = b.z - a.z, oy = b.y - a.y; const d = (bz - az) * oz + (by - ay) * oy;
      if (d < 0.25 * (oz * oz + oy * oy)) { bad = true; for (let k = -2; k <= 3; k++) { const q = P[(i + k + N) % N]; q.sc *= k === 0 || k === 1 ? 0.7 : 0.85; } } }
    if (!bad) break;
  }
  for (const p of P) p.m = p.m0 * p.sc;
}

function gabrielSplit(P, ins = 0) {
  for (let pass = 0; pass < 8; pass++) {
    const N = P.length, IZ = new Float64Array(N), IY = new Float64Array(N); // the inset ring the side faces use
    for (let k = 0; k < N; k++) { const q = P[k]; IZ[k] = q.z - q.n[0] * ins * q.m; IY[k] = q.y - q.n[1] * ins * q.m; }
    let split = false; const out = [];
    for (let i = 0; i < N; i++) {
      const i1 = (i + 1) % N, a = P[i], b = P[i1]; out.push(a); const mz = (IZ[i] + IZ[i1]) / 2, my = (IY[i] + IY[i1]) / 2, r2 = ((IZ[i1] - IZ[i]) ** 2 + (IY[i1] - IY[i]) ** 2) / 4 * (1 - 1e-6);
      if (r2 < 1e-6) continue; let enc = false;
      for (let k = 0; k < N; k++) { if (k === i || k === i1) continue; const dz = IZ[k] - mz; if (dz * dz >= r2) continue; const dy = IY[k] - my; if (dz * dz + dy * dy < r2) { enc = true; break; } }
      if (enc) { const sc = (a.sc + b.sc) / 2 || 1; out.push({ z: (a.z + b.z) / 2, y: (a.y + b.y) / 2, sn: a.sn, n: a.sn, m: sc, m0: 1, sc, corner: false }); split = true; }
    }
    P = out; if (!split) break;
  }
  return P;
}

// Bowyer–Watson Delaunay triangulation of Vector2 points; returns CCW index triples (super-triangle removed)
function delaunay(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const d = Math.max(x1 - x0, y1 - y0) * 20 + 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; const n = pts.length;
  const V = [...pts.map((p) => [p.x, p.y]), [cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]];
  const mk = (a, b, c) => { const [ax, ay] = V[a], [bx, by] = V[b], [qx, qy] = V[c]; const D = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by)); const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = qx * qx + qy * qy;
    const ux = (a2 * (by - qy) + b2 * (qy - ay) + c2 * (ay - by)) / D, uy = (a2 * (qx - bx) + b2 * (ax - qx) + c2 * (bx - ax)) / D; const r2 = (ax - ux) ** 2 + (ay - uy) ** 2; return { a, b, c, ux, uy, r2, xr: ux + Math.sqrt(r2) * (1 + 1e-9) }; };
  let T = [mk(n, n + 1, n + 2)]; const done = []; const ord = [...Array(n).keys()].sort((p, q) => V[p][0] - V[q][0]); // sweep in x: a triangle whose circumcircle is behind the sweep is final
  for (let i = 0; i < n; i++) {
    const [px, py] = V[ord[i]]; const keep = [], E = new Map();
    for (const t of T) { if (px > t.xr) { done.push(t); continue; } const dx = px - t.ux, dy = py - t.uy; if (dx * dx + dy * dy < t.r2 * (1 + 1e-12)) { for (const [p, q] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) { const k = p < q ? p * 1e6 + q : q * 1e6 + p; const e = E.get(k); if (e) e.n++; else E.set(k, { p, q, n: 1 }); } } else keep.push(t); }
    for (const [, e] of E) if (e.n === 1) keep.push(mk(e.p, e.q, ord[i])); T = keep;
  }
  T = T.concat(done);
  const out = []; for (const t of T) { if (t.a >= n || t.b >= n || t.c >= n) continue; const [ax, ay] = V[t.a], [bx, by] = V[t.b], [qx, qy] = V[t.c]; out.push((bx - ax) * (qy - ay) - (by - ay) * (qx - ax) > 0 ? [t.a, t.b, t.c] : [t.a, t.c, t.b]); }
  return out;
}

// Triangulate a planar polygon ring (Vector2[], open, Gabriel-split) + interior points (already clear of the ring):
// Delaunay of everything, keep the triangles inside the ring. Returns { pts, tris (CCW) }.
export function capTriangulate(ring, interior = []) {
  const pts = [...ring, ...interior]; const inside = (z, y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a.y > y) !== (b.y > y) && z < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
  const n = ring.length; const tris = delaunay(pts).filter(([a, b, c]) => a >= n || b >= n || c >= n || inside((pts[a].x + pts[b].x + pts[c].x) / 3, (pts[a].y + pts[b].y + pts[c].y) / 3));
  return { pts, tris };
}

// upper envelope y(z) of a polyline (max over all segments covering z), sampled every `cell` metres; ends nothing covers take the nearest covered value
function envelope(pts, closed, z0, z1, cell) {
  const n = Math.ceil((z1 - z0) / cell) + 1, E = new Float32Array(n).fill(NaN); const m = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
    for (let c = Math.ceil((lo - z0) / cell); c <= Math.floor((hi - z0) / cell); c++) { if (c < 0 || c >= n) continue; const z = z0 + c * cell; const t = hi - lo < 1e-6 ? 0 : (z - a[0]) / (b[0] - a[0]); const y = hi - lo < 1e-6 ? Math.max(a[1], b[1]) : a[1] + (b[1] - a[1]) * t; if (!(E[c] >= y)) E[c] = y; } }
  let last = NaN; for (let c = 0; c < n; c++) { if (E[c] === E[c]) last = E[c]; else E[c] = last; } for (let c = n - 1; c >= 0; c--) { if (E[c] === E[c]) last = E[c]; else E[c] = last; } if (last !== last) E.fill(0); // uncovered ends take the nearest covered value
  return (z) => { const f = (z - z0) / cell; const c = Math.max(0, Math.min(n - 2, Math.floor(f))); const t = Math.max(0, Math.min(1, f - c)); return E[c] + (E[c + 1] - E[c]) * t; };
}

// chord tolerance per material when refining for the field: panels and glass (reflections show any facet) tightest; thin
// seals / chrome / lamps follow within a couple of mm; the cabin interior is moved but never refined (deep behind the skin,
// a few mm of chord error is invisible and refining it only costs triangles)
const REFINE_TOL = { paint: 0.002, glass: 0.002, rubber: 0.004, chrome: 0.004, trim: 0.004, vlight: 0.002, vtail: 0.002, vind: 0.002, plate: 0.004, interior: 0 };

// The body shape field. Every term is an explicit smooth function of position with a small slope (no nearest-segment
// switching, so it cannot tear or fold) and is applied to the whole baked body — skin, shut doors, glass, lamps, trims —
// so everything stays fitted:
//   plan rounding   the nose and tail corners pull back by nose·u² / tail·u² over a 0.6 m band at each end (u = |x|/W)
//   crown           bonnet, boot and shoulders drop by crown·u², blended over 0.45 m under the silhouette's upper envelope
//                   (wide blends: soft shoulders, and little curvature for refineForField to chase)
//   roof crown      roof, windscreen and back light drop by roofCrown·(|x|/roofW)², blended over 0.5 m under the roof line
//   tumblehome      the side section bulges at the shoulder line: tucked in by tuckSill at the sill and tuckBelt at the belt (·u⁴)
// spec: { W, outline [[z,y]] (side silhouette), roof [[z,y]] (windscreen base → roof → back-light base), roofW, nose, tail,
//         crown, roofCrown, sill, belt, tuckSill, tuckBelt }
export function makeBodyWarp(spec) {
  const { W, outline, roof = null, roofW = W * 0.78, nose = 0.12, tail = 0.09, crown = 0.03, roofCrown = 0.04, sill, belt, tuckSill = 0.025, tuckBelt = 0.015 } = spec;
  let zr = Infinity, zf = -Infinity; for (const [z] of outline) { zr = Math.min(zr, z); zf = Math.max(zf, z); }
  const cell = 0.02, top = envelope(outline, true, zr - 0.1, zf + 0.1, cell);
  let roofT = null, rz0 = 0, rz1 = 0;
  if (roof && roof.length > 1) { rz0 = Math.min(...roof.map((p) => p[0])); rz1 = Math.max(...roof.map((p) => p[0])); roofT = envelope(roof, false, rz0 - 0.05, rz1 + 0.05, cell); }
  const bandN = Math.max(0.45, nose * 3.5), bandT = Math.max(0.45, tail * 3.5), ySh = belt - Math.min(0.22, (belt - sill) * 0.35);
  const field = (x, y, z, out) => {
    const ax = Math.abs(x), sx = x < 0 ? -1 : 1; const u = Math.min(1, ax / W), u2 = u * u; let dx = 0, dy = 0, dz = 0;
    const TM = globalThis.__bwMask || 15; /* debug: per-term mask (viewer ?bw=1 plan, 2 crown, 4 roof, 8 tumblehome) */ if (TM & 1) { dz -= nose * u2 * sstep(zf - bandN, zf, z); dz += tail * u2 * sstep(zr + bandT, zr, z); }
    const yt = top(z); if (TM & 2) dy -= crown * u2 * sstep(yt - 0.45, yt, y) * (1 - sstep(yt + 0.02, yt + 0.27, y)); /* the greenhouse above has its own roof crown: fade out so window frames / headroom stay put */
    if ((TM & 4) && roofT && z > rz0 - 0.2 && z < rz1 + 0.2) { const ur = Math.min(1, ax / roofW), yr = roofT(z); dy -= roofCrown * ur * ur * sstep(yr - 0.5, yr, y) * sstep(rz0 - 0.2, rz0 + 0.1, z) * sstep(rz1 + 0.2, rz1 - 0.1, z); }
    const u4 = u2 * u2; if (TM & 8) dx -= sx * u4 * (tuckSill * sstep(ySh, sill, y) + tuckBelt * sstep(ySh, belt, y));
    out[0] = x + dx; out[1] = y + dy; out[2] = z + dz; return out;
  };
  return { field, warp: (g) => warpGeometry(g, field), refine: (g, M = null, name = '') => REFINE_TOL[name] === 0 ? g : refineForField(g, field, M, REFINE_TOL[name] ?? 0.0012) };
}

// Refine a geometry so that a smooth field can bend it: a big flat quad (a bumper face, a roof panel, a box) only has
// vertices at its corners, so after warping it would stay straight while the finely surfaced body curves through it.
// An edge is split iff the field deviates from linear at its midpoint by more than `tol` — decided from the edge's own
// endpoints only, so neighbouring triangles always agree (no T-junctions); 1/2/3-split red-green templates, recursive.
// M (optional) maps the geometry's space into body space (door leaves are kept in hinge space). Returns an indexed geometry.
export function refineForField(g, field, M = null, tol = 0.0012, maxDepth = 6) {
  const src = g.index ? g : (() => { const q = g.clone(); const n = q.attributes.position.count; const ix = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) ix[i] = i; q.setIndex(new THREE.BufferAttribute(ix, 1)); return q; })();
  const names = Object.keys(src.attributes); const A = names.map((k) => src.attributes[k]); const data = A.map((a) => { const o = []; for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) o.push(a.array[i * a.itemSize + c]); return o; });
  const P = data[names.indexOf('position')]; const nIdx = names.indexOf('normal'); const e = M ? M.elements : null;
  const disp = []; const tmp = [0, 0, 0];
  const D = (i) => { if (disp[i * 3] !== undefined) return; let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (e) { const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14]; x = X; y = Y; z = Z; }
    field(x, y, z, tmp); disp[i * 3] = tmp[0] - x; disp[i * 3 + 1] = tmp[1] - y; disp[i * 3 + 2] = tmp[2] - z; };
  const mids = new Map(); let added = 0;
  const midOf = (a, b) => { const k = a < b ? a * 4194304 + b : b * 4194304 + a; let m = mids.get(k); if (m !== undefined) return m;
    m = data[0].length / A[0].itemSize; for (let t = 0; t < A.length; t++) { const sz = A[t].itemSize, d = data[t]; for (let c = 0; c < sz; c++) d.push((d[a * sz + c] + d[b * sz + c]) / 2); }
    if (nIdx >= 0) { const d = data[nIdx]; const l = Math.hypot(d[m * 3], d[m * 3 + 1], d[m * 3 + 2]) || 1; d[m * 3] /= l; d[m * 3 + 1] /= l; d[m * 3 + 2] /= l; }
    mids.set(k, m); added++; return m; };
  const needs = (a, b) => { const L = Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]); if (L < 0.012) return false; D(a); D(b);
    let x = (P[a * 3] + P[b * 3]) / 2, y = (P[a * 3 + 1] + P[b * 3 + 1]) / 2, z = (P[a * 3 + 2] + P[b * 3 + 2]) / 2; if (e) { const X = e[0] * x + e[4] * y + e[8] * z + e[12], Y = e[1] * x + e[5] * y + e[9] * z + e[13], Z = e[2] * x + e[6] * y + e[10] * z + e[14]; x = X; y = Y; z = Z; }
    field(x, y, z, tmp); const ex = tmp[0] - x - (disp[a * 3] + disp[b * 3]) / 2, ey = tmp[1] - y - (disp[a * 3 + 1] + disp[b * 3 + 1]) / 2, ez = tmp[2] - z - (disp[a * 3 + 2] + disp[b * 3 + 2]) / 2; return ex * ex + ey * ey + ez * ez > tol * tol; };
  const I = src.index.array; const out = []; const stack = [];
  for (let t = 0; t < I.length; t += 3) stack.push(I[t], I[t + 1], I[t + 2], 0);
  while (stack.length) { const dep = stack.pop(), c = stack.pop(), b = stack.pop(), a = stack.pop();
    if (dep >= maxDepth) { out.push(a, b, c); continue; } const sab = needs(a, b), sbc = needs(b, c), sca = needs(c, a); const n = sab + sbc + sca; if (!n) { out.push(a, b, c); continue; }
    const d1 = dep + 1;
    if (n === 3) { const x = midOf(a, b), y = midOf(b, c), z = midOf(c, a); stack.push(a, x, z, d1, x, b, y, d1, z, y, c, d1, x, y, z, d1); continue; }
    // rotate so the split edges come first: (p, q, r) with pq split (and qr when two)
    let p = a, q = b, r = c; if (n === 1) { if (sbc) { p = b; q = c; r = a; } else if (sca) { p = c; q = a; r = b; } } else if (!sab) { p = b; q = c; r = a; } else if (!sbc) { p = c; q = a; r = b; } const s2 = n === 2;
    const m1 = midOf(p, q); if (!s2) { stack.push(p, m1, r, d1, m1, q, r, d1); continue; } const m2 = midOf(q, r); stack.push(m1, q, m2, d1, p, m1, m2, d1, p, m2, r, d1); }
  if (!added) return g;
  const o = new THREE.BufferGeometry(); for (let t = 0; t < A.length; t++) { const a = A[t]; o.setAttribute(names[t], new THREE.BufferAttribute(new a.array.constructor(data[t]), a.itemSize, a.normalized)); }
  const nv = data[0].length / A[0].itemSize; o.setIndex(new THREE.BufferAttribute(nv > 65535 ? new Uint32Array(out) : new Uint16Array(out), 1)); o.userData = g.userData; return o;
}

// move every vertex through the field; normals by the cofactor of the field's Jacobian (finite differences)
export function warpGeometry(g, field) {
  const P = g.attributes.position, N = g.attributes.normal; const e = 1e-3; const a = [0, 0, 0], bx = [0, 0, 0], by = [0, 0, 0], bz = [0, 0, 0];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i); field(x, y, z, a);
    if (N) { field(x + e, y, z, bx); field(x, y + e, z, by); field(x, y, z + e, bz);
      const j00 = (bx[0] - a[0]) / e, j10 = (bx[1] - a[1]) / e, j20 = (bx[2] - a[2]) / e, j01 = (by[0] - a[0]) / e, j11 = (by[1] - a[1]) / e, j21 = (by[2] - a[2]) / e, j02 = (bz[0] - a[0]) / e, j12 = (bz[1] - a[1]) / e, j22 = (bz[2] - a[2]) / e;
      const c00 = j11 * j22 - j12 * j21, c01 = j12 * j20 - j10 * j22, c02 = j10 * j21 - j11 * j20, c10 = j02 * j21 - j01 * j22, c11 = j00 * j22 - j02 * j20, c12 = j01 * j20 - j00 * j21, c20 = j01 * j12 - j02 * j11, c21 = j02 * j10 - j00 * j12, c22 = j00 * j11 - j01 * j10;
      const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i); const ox = c00 * nx + c01 * ny + c02 * nz, oy = c10 * nx + c11 * ny + c12 * nz, oz = c20 * nx + c21 * ny + c22 * nz; /* n' ∝ cof(J)·n = det(J)·J⁻ᵀ·n */ const l = Math.hypot(ox, oy, oz) || 1; N.setXYZ(i, ox / l, oy / l, oz / l); }
    P.setXYZ(i, a[0], a[1], a[2]);
  }
  P.needsUpdate = true; if (N) N.needsUpdate = true; g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
