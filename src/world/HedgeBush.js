// Clipped hedges and round bushes built from real foliage (52nd request: the park / forecourt hedges were grass-textured
// blocks). The technique is the one used for hedges in current open-world games, at a cost the GTX 1660S target can carry:
//   • a dark, slightly inset "core" volume (the old hedge-textured box, now shaded deep green-brown) stands for the dense
//     tangle of twigs and inner leaves — gaps between the outer leaves show shadowed interior, never sky;
//   • over it a shell of small alpha-cut leaf-spray cards (MAT.leavesSmall: the shrub-leaf atlas the garden bushes use),
//     laid roughly tangent to the clipped surface with random tilt and roll, pushed in and out by low-frequency lumps so the
//     silhouette is soft and uneven like a real Murraya / ixora hedge after a few weeks of growth, not a ruler-straight box;
//   • per-card colour: darker toward the ground and inside the lumps (ambient occlusion baked in the vertex colour), a
//     sprinkling of light yellow-green new growth on the top and the sun side, the odd brown dead spray;
//   • the card normals are bent outward from the hedge volume (as for the tree crowns) so the shell lights as one soft mass.
// Everything is written into the caller's MultiBuilder: no new materials beyond leavesSmall, no textures, no per-frame cost.
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
let _ico = null; const _m4 = new THREE.Matrix4();

// one leaf card: centre p, outward normal n (unit), size s, tint col; the card lies near the tangent plane of n
function card(L, p, n, s, rng, col) {
  // tangent frame round n
  let tx = -n[2], ty = 0, tz = n[0]; let tl = Math.hypot(tx, ty, tz); if (tl < 1e-3) { tx = 1; ty = 0; tz = 0; tl = 1; } tx /= tl; ty /= tl; tz /= tl;
  const bx = n[1] * tz - n[2] * ty, by = n[2] * tx - n[0] * tz, bz = n[0] * ty - n[1] * tx;
  const roll = rng.next() * Math.PI * 2, c = Math.cos(roll), sn = Math.sin(roll); const tilt = rng.range(-0.75, 0.75); // roll in the plane, tilt out of it
  let ax = tx * c + bx * sn, ay = ty * c + by * sn, az = tz * c + bz * sn; let ux = -tx * sn + bx * c, uy = -ty * sn + by * c, uz = -tz * sn + bz * c;
  const ct = Math.cos(tilt), st = Math.sin(tilt); ux = ux * ct + n[0] * st; uy = uy * ct + n[1] * st; uz = uz * ct + n[2] * st;
  ax *= s; ay *= s; az *= s; ux *= s; uy *= s; uz *= s;
  const i0 = L.vcount;
  L.quad([p[0] - ax - ux, p[1] - ay - uy, p[2] - az - uz], [p[0] + ax - ux, p[1] + ay - uy, p[2] + az - uz], [p[0] + ax + ux, p[1] + ay + uy, p[2] + az + uz], [p[0] - ax + ux, p[1] - ay + uy, p[2] - az + uz], [0, 0, 1, 1], col);
  const nx = n[0], ny = n[1] + 0.25, nz = n[2], nl = Math.hypot(nx, ny, nz); for (let i = i0; i < L.vcount; i++) { L.nor[i * 3] = nx / nl; L.nor[i * 3 + 1] = ny / nl; L.nor[i * 3 + 2] = nz / nl; }
}
const lump = (u, v, seed) => 0.55 * Math.sin(u * 1.9 + seed) * Math.sin(v * 2.3 + seed * 0.7) + 0.3 * Math.sin(u * 4.7 + seed * 2.1 + v * 1.3) + 0.15 * Math.sin(u * 9.1 - v * 3.7 + seed);

// A clipped hedge: centre (cx, y0 = ground, cz), length along its local x, height h, width w, rotated rotY (THREE convention:
// local x → (cos, 0, −sin)). opts: { col: base leaf tint, seed, density (cards per m² · default 13), size (card half-size),
//   core: false to skip the inner volume (e.g. in a planter whose soil already hides the base), coreCol }
export function hedgeBox(mb, cx, y0, cz, len, h, w, rotY = 0, opts = {}) {
  const L = mb.get('leavesSmall'), K = mb.get('hedge'); const rng = new RNG(opts.seed ?? (Math.round(cx * 13 + cz * 7) & 0xffff) + 11);
  const base = opts.col || [0.82, 0.92, 0.78]; const size = opts.size ?? 0.2; const dens = opts.density ?? 13; const seed = rng.range(0, 6.28);
  const cs = Math.cos(rotY), sn = Math.sin(rotY); const W = (x, y, z) => [cx + x * cs + z * sn, y0 + y, cz - x * sn + z * cs]; const N = (x, y, z) => [x * cs + z * sn, y, -x * sn + z * cs];
  const hw = w / 2, rc = Math.min(hw * 0.55, h * 0.35, 0.28); // rounded clipped shoulders
  if (opts.core !== false) { const cc = opts.coreCol || [0.42, 0.47, 0.36]; const ins = 0.09;
    K.box(cx, y0 + (h - ins) / 2, cz, Math.max(0.1, len - ins * 2), h - ins, Math.max(0.1, w - ins * 2), { rotY, uvScale: 1.2, col: cc });
    K.box(cx, y0 + h - ins - 0.02, cz, Math.max(0.1, len - ins * 2 - 0.1), 0.12, Math.max(0.1, w - ins * 2 - rc), { rotY, uvScale: 1.2, col: cc.map((q) => q * 1.08) }); }
  // the clipped cross-section as a profile (arc length s): side −z up, shoulder, top, shoulder, side +z down
  const sideH = Math.max(0.05, h - rc - 0.04), topW = Math.max(0.02, w - 2 * rc), arc = Math.PI / 2 * rc; const P = [sideH, arc, topW, arc, sideH]; const S = P.reduce((a, b) => a + b, 0);
  const at = (s) => { // → [z, y, nz, ny] in the cross-section
    if (s < P[0]) return [-hw, 0.04 + s, -1, 0]; s -= P[0];
    if (s < P[1]) { const a = Math.PI - (s / rc); return [-hw + rc + Math.cos(a) * rc, h - rc + Math.sin(a) * rc, Math.cos(a), Math.sin(a)]; } s -= P[1];
    if (s < P[2]) return [-hw + rc + s, h, 0, 1]; s -= P[2];
    if (s < P[3]) { const a = Math.PI / 2 - (s / rc); return [hw - rc + Math.cos(a) * rc, h - rc + Math.sin(a) * rc, Math.cos(a), Math.sin(a)]; } s -= P[3];
    return [hw, h - rc - Math.min(s, sideH), 1, 0]; };
  const step = 1 / Math.sqrt(dens); const nu = Math.max(1, Math.round(len / step)), ns = Math.max(2, Math.round(S / step));
  const tint = (y, out, top) => { const ao = 0.5 + 0.5 * Math.min(1, Math.max(0, y / h)) ** 0.8; const o = 0.82 + 0.18 * out; let c = base.map((q) => q * ao * o * rng.range(0.88, 1.1));
    const r = rng.next(); if (top && r < 0.22) c = [c[0] * 1.25, c[1] * 1.22, c[2] * 0.9]; else if (r > 0.985) c = [c[0] * 1.5, c[1] * 1.05, c[2] * 0.55]; return c; };
  for (let i = 0; i < nu; i++) for (let j = 0; j < ns; j++) {
    const u = -len / 2 + (i + rng.next()) * (len / nu), s = (j + rng.next()) * (S / ns); const [z, y, nz, ny] = at(s);
    const lu = lump(u, s, seed); const push = 0.035 + 0.055 * lu + rng.range(-0.025, 0.03); const out = 0.5 + 0.5 * lu;
    const endF = Math.max(0, 1 - (len / 2 - Math.abs(u)) / 0.25); // round off the ends of the run
    const px = u, py = y + ny * push - endF * 0.06 * ny, pz = z + nz * push - endF * 0.05 * nz;
    card(L, W(px, py, pz), N(endF * Math.sign(u) * 0.5, ny, nz), size * rng.range(0.8, 1.25), rng, tint(py, out, ny > 0.6));
  }
  // end caps
  for (const e of [-1, 1]) { const ne = Math.max(2, Math.round((w * h * dens) * 0.8));
    for (let k = 0; k < ne; k++) { const z = rng.range(-hw * 0.9, hw * 0.9), y = rng.range(0.06, h - 0.05); const d = Math.max(0, 1 - Math.max(0, y - (h - rc)) / rc * 0.5);
      card(L, W(e * (len / 2 + 0.02 * d + rng.range(-0.02, 0.03)), y, z), N(e, 0.15, z / hw * 0.4), size * rng.range(0.8, 1.2), rng, tint(y, 0.6, false)); } }
}
// A round shrub (box-clipped ball / mound): centre (x, ground y0, z), radius r, height h. opts as above, plus flowers:
// { flowers: n, flowerCol } — small 3D flower heads on the shell (vertex-coloured, 'bloom' material).
export function bushBall(mb, x, y0, z, r, h, opts = {}) {
  const L = mb.get('leavesSmall'), K = mb.get('hedge'); const rng = new RNG(opts.seed ?? (Math.round(x * 17 + z * 5) & 0xffff) + 23); const base = opts.col || [0.82, 0.92, 0.78]; const size = opts.size ?? 0.17;
  if (opts.round) { // 75th (hospital garden): a lumpy rounded core (low-poly ellipsoid, 80 tris) instead of the box — no cube silhouette
    if (!_ico) _ico = new THREE.IcosahedronGeometry(1, 1); const M = _m4.makeScale(r * 0.86, h * 0.47, r * 0.86).setPosition(x, y0 + h * 0.47, z); const R = new THREE.Matrix4().makeRotationY(rng.range(0, 6.28)); M.multiply(R);
    K.geometry(_ico, M, opts.coreCol || [0.4, 0.45, 0.34]); }
  else if (opts.core !== false) K.box(x, y0 + h * 0.42, z, r * 1.25, h * 0.8, r * 1.25, { uvScale: 1, col: opts.coreCol || [0.4, 0.45, 0.34] });
  const area = 2 * Math.PI * r * h; const n = Math.max(10, Math.round(area * (opts.density ?? 15))); const seed = rng.range(0, 6.28);
  for (let k = 0; k < n; k++) { const u = rng.next() * Math.PI * 2, v = Math.acos(1 - rng.next() * 1.25); const dx = Math.sin(v) * Math.cos(u), dy = Math.cos(v), dz = Math.sin(v) * Math.sin(u);
    const lu = lump(u * 2, v * 3, seed); const f = 0.92 + 0.1 * lu + rng.range(-0.04, 0.04); const py = Math.max(0.05, h * 0.5 + dy * h * 0.5 * f);
    const ao = 0.52 + 0.48 * Math.min(1, py / h); let c = base.map((q) => q * ao * (0.86 + 0.14 * lu) * rng.range(0.88, 1.1)); if (dy > 0.5 && rng.chance(0.2)) c = [c[0] * 1.22, c[1] * 1.2, c[2] * 0.9];
    card(L, [x + dx * r * f, y0 + py, z + dz * r * f], [dx, dy, dz], size * rng.range(0.8, 1.25), rng, c); }
  if (opts.flowers) { const B = mb.get('bloom'); const fc = opts.flowerCol || [0.92, 0.2, 0.12];
    for (let k = 0; k < opts.flowers; k++) { const u = rng.next() * Math.PI * 2, v = Math.acos(1 - rng.next() * 1.0); const dx = Math.sin(v) * Math.cos(u), dy = Math.cos(v), dz = Math.sin(v) * Math.sin(u);
      const px = x + dx * r * 1.02, py = y0 + h * 0.5 + dy * h * 0.52, pz = z + dz * r * 1.02; const fr = 0.045 * rng.range(0.8, 1.2); const col = fc.map((q) => q * rng.range(0.85, 1.08));
      for (let p = 0; p < 4; p++) { const a = p / 4 * Math.PI * 2 + u; B.quad([px, py + 0.01, pz], [px + Math.cos(a + 0.6) * fr * 0.6, py + 0.02, pz + Math.sin(a + 0.6) * fr * 0.6], [px + Math.cos(a) * fr, py + 0.03, pz + Math.sin(a) * fr], [px + Math.cos(a - 0.6) * fr * 0.6, py + 0.02, pz + Math.sin(a - 0.6) * fr * 0.6], [0, 0, 1, 1], col); } } }
}
// axis-aligned hedge over a footprint (x0..x1, z0..z1): the long side becomes the run
export function hedgeRect(mb, x0, x1, z0, z1, y0, h, opts = {}) {
  const lx = x1 - x0, lz = z1 - z0; if (lx >= lz) hedgeBox(mb, (x0 + x1) / 2, y0, (z0 + z1) / 2, lx, h, lz, 0, opts); else hedgeBox(mb, (x0 + x1) / 2, y0, (z0 + z1) / 2, lz, h, lx, Math.PI / 2, opts);
}
