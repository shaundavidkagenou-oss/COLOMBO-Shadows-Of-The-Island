// Signed-distance sculpting → triangle mesh (surface nets). Smooth unions of ellipsoids and round cones give organic,
// seamless forms (statues); carve operations cut grooves. Primitives are culled per coarse block so only the few near a
// point are evaluated; normals come from the field gradient (smooth shading, no faceting).
import * as THREE from 'three';

const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
// ellipsoid (optionally rotated: rot = [rx, ry, rz] Euler XYZ)
export function ellipsoid(c, r, k = 0.1, rot = null, order = 'XYZ') {
  let m = null; if (rot) { m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], order)).invert().elements; }
  const [cx, cy, cz] = c, [a, b, d] = r;
  return { k, c, R: Math.max(a, b, d), d(x, y, z) { let px = x - cx, py = y - cy, pz = z - cz;
    if (m) { const qx = m[0] * px + m[4] * py + m[8] * pz, qy = m[1] * px + m[5] * py + m[9] * pz, qz = m[2] * px + m[6] * py + m[10] * pz; px = qx; py = qy; pz = qz; }
    const k0 = Math.hypot(px / a, py / b, pz / d), k1 = Math.hypot(px / (a * a), py / (b * b), pz / (d * d)); return k1 < 1e-9 ? -Math.min(a, b, d) : k0 * (k0 - 1) / k1; } };
}
// capsule with different end radii (iq's round cone)
export function roundCone(A, B, r1, r2, k = 0.1) {
  const bax = B[0] - A[0], bay = B[1] - A[1], baz = B[2] - A[2]; const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const c = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
  return { k, c, R: Math.sqrt(l2) / 2 + Math.max(r1, r2), d(x, y, z) {
    const pax = x - A[0], pay = y - A[1], paz = z - A[2]; const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
    const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy; const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
    const kk = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > kk) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < kk) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1; } };
}
// a smooth limb / ridge through points (round cones between successive points)
// (one primitive: the segments are hard-unioned with each other — no bulge at the joints — and the whole limb is then
// smooth-blended into the form). Returned as a one-element array for spreading.
export function chain(pts, radii, k = 0.1) { const segs = []; for (let i = 0; i + 1 < pts.length; i++) segs.push(roundCone(pts[i], pts[i + 1], radii[i], radii[i + 1], 0));
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; pts.forEach((p, i) => { for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a] - radii[i]); hi[a] = Math.max(hi[a], p[a] + radii[i]); } });
  const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], R = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
  const ki = Math.min(k * 0.5, 0.08); // a small blend between segments rounds the joints off without a visible bulge
  return [{ k, c, R, segs, d(x, y, z) { let d = 1e9; for (const sg of segs) { if (Math.hypot(x - sg.c[0], y - sg.c[1], z - sg.c[2]) - sg.R > d + ki) continue; d = smin(d, sg.d(x, y, z), ki); } return d; } }]; }

// Build the mesh. adds: primitives smooth-unioned in order; cuts: primitives smooth-subtracted afterwards; floorY: flat base.
export function sdfMesh({ min, max, h, adds, cuts = [], floorY = null, ceilY = null, grow = 0 }) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1, ny = Math.ceil((max[1] - min[1]) / h) + 1, nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const B = 4, bx = Math.ceil(nx / B), by = Math.ceil(ny / B), bz = Math.ceil(nz / B), half = B * h * 0.87, band = 0.35;
  const lists = new Array(bx * by * bz);
  for (let i = 0; i < bx; i++) for (let j = 0; j < by; j++) for (let k = 0; k < bz; k++) {
    const qx = min[0] + (i + 0.5) * B * h, qy = min[1] + (j + 0.5) * B * h, qz = min[2] + (k + 0.5) * B * h;
    const near = (p) => Math.hypot(qx - p.c[0], qy - p.c[1], qz - p.c[2]) - p.R < half + band + p.k;
    const a = adds.filter(near), c = cuts.filter(near); lists[(i * by + j) * bz + k] = a.length ? [a, c] : null;
  }
  const field = (x, y, z, L) => { if (!L) return 1; let d = 1e9; for (const p of L[0]) d = smin(d, p.d(x, y, z), p.k); for (const p of L[1]) d = smax(d, -p.d(x, y, z), p.k); if (floorY !== null) d = Math.max(d, floorY - y); if (ceilY !== null) d = Math.max(d, y - ceilY); return d - grow; };
  const listAt = (x, y, z) => { const i = Math.min(bx - 1, Math.max(0, Math.floor((x - min[0]) / h / B))), j = Math.min(by - 1, Math.max(0, Math.floor((y - min[1]) / h / B))), k = Math.min(bz - 1, Math.max(0, Math.floor((z - min[2]) / h / B))); return lists[(i * by + j) * bz + k]; };
  const F = new Float32Array(nx * ny * nz); const id = (i, j, k) => (i * ny + j) * nz + k;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) { const L = lists[(Math.min(bx - 1, i / B | 0) * by + Math.min(by - 1, j / B | 0)) * bz + Math.min(bz - 1, k / B | 0)]; F[id(i, j, k)] = L ? field(min[0] + i * h, min[1] + j * h, min[2] + k * h, L) : 1; }
  // one vertex per cell that the surface crosses: mean of the edge crossings, then pulled onto the surface
  const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1); const cid = (i, j, k) => (i * (ny - 1) + j) * (nz - 1) + k;
  const pos = [], nor = []; const E = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
  const e = h * 0.5;
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) for (let k = 0; k < nz - 1; k++) {
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a0, a1, a2, b0, b1, b2] of E) { const fa = F[id(i + a0, j + a1, k + a2)], fb = F[id(i + b0, j + b1, k + b2)]; if ((fa < 0) === (fb < 0)) continue; const t = fa / (fa - fb);
      sx += a0 + (b0 - a0) * t; sy += a1 + (b1 - a1) * t; sz += a2 + (b2 - a2) * t; n++; }
    if (!n) continue;
    let x = min[0] + (i + sx / n) * h, y = min[1] + (j + sy / n) * h, z = min[2] + (k + sz / n) * h; const L = listAt(x, y, z);
    let gx = 0, gy = 1, gz = 0;
    for (let it = 0; it < 2; it++) { const d = field(x, y, z, L); gx = field(x + e, y, z, L) - field(x - e, y, z, L); gy = field(x, y + e, z, L) - field(x, y - e, z, L); gz = field(x, y, z + e, L) - field(x, y, z - e, L);
      const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl; const s = Math.max(-h * 0.5, Math.min(h * 0.5, d)); x -= gx * s; y -= gy * s; z -= gz * s; }
    vid[cid(i, j, k)] = pos.length / 3; pos.push(x, y, z); nor.push(gx, gy, gz);
  }
  // a quad across every grid edge where the sign changes, joining the four cells around it
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) { const f0 = F[id(i, j, k)] < 0;
    if (i < nx - 1 && j > 0 && k > 0 && f0 !== (F[id(i + 1, j, k)] < 0)) quad(vid[cid(i, j - 1, k - 1)], vid[cid(i, j, k - 1)], vid[cid(i, j, k)], vid[cid(i, j - 1, k)], !f0);
    if (j < ny - 1 && i > 0 && k > 0 && f0 !== (F[id(i, j + 1, k)] < 0)) quad(vid[cid(i - 1, j, k - 1)], vid[cid(i - 1, j, k)], vid[cid(i, j, k)], vid[cid(i, j, k - 1)], !f0);
    if (k < nz - 1 && i > 0 && j > 0 && f0 !== (F[id(i, j, k + 1)] < 0)) quad(vid[cid(i - 1, j - 1, k)], vid[cid(i, j - 1, k)], vid[cid(i, j, k)], vid[cid(i - 1, j, k)], !f0);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  g.userData.field = (x, y, z) => field(x, y, z, listAt(x, y, z)); return g;
}
