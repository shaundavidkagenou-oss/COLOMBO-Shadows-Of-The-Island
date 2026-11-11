// Pure tree geometry (no materials): coconut palm, rain tree, mara, mango, jak, bo, frangipani.
// Shared by Vegetation.js (rendering) and CityPlan.js (crown clearance: no leaves or branches inside a building).
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { RNG } from '../core/rng.js';

// One continuous, closed tube along a centre line (parallel-transport frames): every ring is shared by the neighbouring
// sections, so a bent trunk has no wedge gaps at its joints; the base flares into the ground and the top / limb tip is capped
// with a short dome — no open ends to see through into the hollow inside (single-sided bark shows those as holes).
function tubeGeo(pts, radii, sides, { capEnd = true, capStart = false, vLen = 1 } = {}) {
  const n = pts.length, pos = [], nor = [], uv = [], idx = []; const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; T.push(b.clone().sub(a).normalize()); }
  { const t = T[0]; const h = Math.abs(t.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0); N.push(h.sub(t.clone().multiplyScalar(h.dot(t))).normalize()); }
  for (let i = 1; i < n; i++) { const v = N[i - 1].clone(); v.sub(T[i].clone().multiplyScalar(v.dot(T[i]))); if (v.lengthSq() < 1e-10) v.copy(N[i - 1]); N.push(v.normalize()); }
  for (let i = 0; i < n; i++) B.push(T[i].clone().cross(N[i]));
  let acc = 0; const _d = new THREE.Vector3();
  for (let i = 0; i < n; i++) { if (i) acc += pts[i].distanceTo(pts[i - 1]); const dr = (radii[Math.min(n - 1, i + 1)] - radii[Math.max(0, i - 1)]) / Math.max(1e-4, pts[Math.min(n - 1, i + 1)].distanceTo(pts[Math.max(0, i - 1)]));
    for (let k = 0; k <= sides; k++) { const an = (k / sides) * Math.PI * 2; _d.copy(N[i]).multiplyScalar(Math.cos(an)).addScaledVector(B[i], Math.sin(an));
      const p = pts[i].clone().addScaledVector(_d, radii[i]); pos.push(p.x, p.y, p.z); const q = _d.clone().addScaledVector(T[i], -dr).normalize(); nor.push(q.x, q.y, q.z); uv.push(k / sides, acc / vLen); } }
  const R = sides + 1; for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) { const a = i * R + k, b = a + 1, c = a + R, d = c + 1; idx.push(a, b, c, b, d, c); } // outward (CCW seen from outside)
  const cap = (i, sgn, dome) => { const t = T[i].clone().multiplyScalar(sgn); const tip = pts[i].clone().addScaledVector(t, radii[i] * dome); const c0 = pos.length / 3;
    pos.push(tip.x, tip.y, tip.z); nor.push(t.x, t.y, t.z); uv.push(0.5, acc / vLen); const base = pos.length / 3;
    for (let k = 0; k <= sides; k++) { const v = i * R + k; pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); const q = new THREE.Vector3(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]).add(t).normalize(); nor.push(q.x, q.y, q.z); uv.push(k / sides, acc / vLen); }
    for (let k = 0; k < sides; k++) { if (sgn > 0) idx.push(c0, base + k, base + k + 1); else idx.push(c0, base + k + 1, base + k); } };
  if (capEnd) cap(n - 1, 1, 0.55); if (capStart) cap(0, -1, 0.3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
function trunk(mb, h, r0, r1, bend, rng, col = [0.6, 0.55, 0.49], seg = 12, sides = 9) {
  const dir = rng.next() * Math.PI * 2; const pts = [], radii = [];
  pts.push(new THREE.Vector3(0, -0.25, 0)); radii.push(r0 * 1.32); // buried root flare: the trunk meets the ground solidly
  for (let k = 0; k <= seg; k++) { const u = k / seg; pts.push(new THREE.Vector3(Math.cos(dir) * bend * u * u, u * h, Math.sin(dir) * bend * u * u)); radii.push((r0 + (r1 - r0) * u) * (1 + 0.28 * Math.max(0, 1 - u * 7) ** 2)); }
  const g = tubeGeo(pts, radii, sides, { capEnd: true, vLen: h / 6 }); mb.geometry(g, new THREE.Matrix4(), col); g.dispose();
  return [Math.cos(dir) * bend, h, Math.sin(dir) * bend];
}
// a limb grows out of the trunk: it starts inside the trunk axis (no seam at the fork), curves gently upward and ends in a capped tip
function limb(mb, from, to, r0, r1, col = [0.57, 0.52, 0.46], n = 6, sides = 7) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to); const d = b.clone().sub(a); const start = a.clone().add(new THREE.Vector3(0, -0.35, 0)); // on the trunk axis, inside the trunk
  const pts = [], radii = []; for (let k = 0; k <= n; k++) { const u = k / n; const p = start.clone().lerp(b, u); p.y += Math.sin(u * Math.PI) * d.length() * 0.06; pts.push(p); radii.push(r0 + (r1 - r0) * u); }
  const g = tubeGeo(pts, radii, sides, { capEnd: true, capStart: true, vLen: Math.max(0.5, d.length() / 2) }); mb.geometry(g, new THREE.Matrix4(), col); g.dispose();
}
// ------------------------------------------------------------------------------------------------ leaf crowns
// A crown is a set of leaf CLUMPS (sub-domes of foliage over the crown envelope, upper side favoured) instead of one even
// shell of cards: light comes through the gaps between clumps, each clump has a lit outer face and a darker inside, the
// interior of the crown is shadowed (baked into the vertex colour) and the normals are a blend of the crown's and the clump's
// dome so the lighting reads lumpy, like a real tree. Structure (clump centres) comes from a stream shared by both LODs; the
// far LOD uses the same clumps with a few large cards each.
function leafCard(mb, px, py, pz, s, rng, col, n) {
  const a = rng.next() * Math.PI, tilt = rng.range(-0.7, 0.7);
  const ax = Math.cos(a) * s, az = Math.sin(a) * s, bx = -Math.sin(a) * s * Math.cos(tilt), by = s * Math.sin(tilt) + s * 0.3, bz = Math.cos(a) * s * Math.cos(tilt);
  const i0 = mb.vcount; mb.quad([px - ax - bx, py - by, pz - az - bz], [px + ax - bx, py - by, pz + az - bz], [px + ax + bx, py + by, pz + az + bz], [px - ax + bx, py + by, pz - az + bz], [0, 0, 1, 1], col);
  for (let i = i0; i < mb.vcount; i++) { mb.nor[i * 3] = n[0]; mb.nor[i * 3 + 1] = n[1]; mb.nor[i * 3 + 2] = n[2]; }
}
function clumpsOf(rngS, o) {
  const out = [];
  for (let k = 0; k < o.clumps; k++) { const u = rngS.next() * Math.PI * 2, v = Math.acos(1 - rngS.next() * (o.flat ? 1.15 : 1.65)); const f = rngS.range(0.5, 0.9);
    const dx = Math.sin(v) * Math.cos(u), dy = Math.cos(v), dz = Math.sin(v) * Math.sin(u); const R = Math.max(o.rx, o.rz);
    out.push({ x: o.cx + dx * o.rx * f, y: o.cy + dy * o.ry * f * (o.flat ? 0.75 : 1), z: o.cz + dz * o.rz * f, r: rngS.range(0.3, 0.42) * R * (o.flat ? 0.85 : 1), rv: rngS.range(0.3, 0.42) * (o.flat ? o.ry * 1.1 : R), tint: rngS.range(0.86, 1.12) }); }
  return out;
}
function clumpCrown(mb, o, C, rngC, perClump, size) {
  for (const c of C) {
    const ox = c.x - o.cx, oy = c.y - o.cy, oz = c.z - o.cz, ol = Math.hypot(ox, oy, oz) || 1;
    for (let k = 0; k < perClump; k++) {
      let dx, dy, dz; for (let tr = 0; tr < 3; tr++) { const u = rngC.next() * Math.PI * 2, v = Math.acos(1 - 2 * rngC.next()); dx = Math.sin(v) * Math.cos(u); dy = Math.cos(v); dz = Math.sin(v) * Math.sin(u); if ((dx * ox + dy * oy + dz * oz) / ol > -0.25) break; }
      const f = 0.45 + 0.55 * rngC.next(); const px = c.x + dx * c.r * f, py = c.y + dy * c.rv * f, pz = c.z + dz * c.r * f;
      const out = Math.max(0, Math.min(1, 0.5 + 0.5 * (dx * ox + dy * oy + dz * oz) / ol)), up = Math.max(0, Math.min(1, (py - (o.cy - o.ry)) / (2 * o.ry)));
      const ao = 0.58 + 0.42 * (0.55 * out + 0.45 * up); const t = o.tint.map((q) => q * c.tint * ao * rngC.range(0.88, 1.08));
      const ax = px - o.cx, ay = (py - o.cy) * 1.3 + o.ry * 0.4, az = pz - o.cz, al = Math.hypot(ax, ay, az) || 1, bxx = px - c.x, byy = py - c.y + c.rv * 0.3, bzz = pz - c.z, bl = Math.hypot(bxx, byy, bzz) || 1;
      let nx = 0.55 * ax / al + 0.45 * bxx / bl, ny = 0.55 * ay / al + 0.45 * byy / bl + 0.15, nz = 0.55 * az / al + 0.45 * bzz / bl; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      leafCard(mb, px, py, pz, size * rngC.range(0.75, 1.2), rngC, t, [nx, ny, nz]);
    }
  }
}
// small 3D flowers / fruit (plain vertex-coloured geometry — no flower cards)
function flower(mb, x, y, z, r, col, petals = 5, cup = 0.45, rng = null) {
  const a0 = rng ? rng.next() * 6.28 : 0; const up = [0, 1, 0];
  for (let k = 0; k < petals; k++) { const a = a0 + (k / petals) * Math.PI * 2, b = a + Math.PI / petals * 0.85, c = a - Math.PI / petals * 0.85;
    const tip = [x + Math.cos(a) * r, y + r * cup, z + Math.sin(a) * r], s1 = [x + Math.cos(b) * r * 0.55, y + r * cup * 0.4, z + Math.sin(b) * r * 0.55], s2 = [x + Math.cos(c) * r * 0.55, y + r * cup * 0.4, z + Math.sin(c) * r * 0.55];
    mb.quad([x, y, z], s2, tip, s1, [0, 0, 1, 1], col); void up; }
}
function blob(mb, x, y, z, rx, ry, rz, col, detail = 0) { const g = new THREE.IcosahedronGeometry(1, detail); mb.geometry(g, new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeScale(rx, ry, rz)), col); g.dispose(); }
// a palm-type frond / banana blade: a strip along a curved rachis; V-folded (two faces meeting at the rachis) on the near LOD.
// f(t) → [x,y,z] rachis point; width(t); v-fold depth (fraction of width); uv: 'palm' (u along, v across) | 'banana' (u across, v along)
function strip(mb, f, side, width, seg, fold, uvMode, col) {
  for (let s = 0; s < seg; s++) { const t0 = s / seg, t1 = (s + 1) / seg; const A = f(t0), B = f(t1); const w0 = width(t0), w1 = width(t1);
    const L0 = [A[0] - side[0] * w0, A[1] - w0 * fold, A[2] - side[1] * w0], R0 = [A[0] + side[0] * w0, A[1] - w0 * fold, A[2] + side[1] * w0];
    const L1 = [B[0] - side[0] * w1, B[1] - w1 * fold, B[2] - side[1] * w1], R1 = [B[0] + side[0] * w1, B[1] - w1 * fold, B[2] + side[1] * w1];
    if (uvMode === 'palm') { mb.quad(L0, L1, B, A, [t0, 0, t1, 0.5], col); mb.quad(A, B, R1, R0, [t0, 0.5, t1, 1], col); }
    else { mb.quad(L0, A, B, L1, [0, t0, 0.5, t1], col); mb.quad(A, R0, R1, B, [0.5, t0, 1, t1], col); } }
}
// ------------------------------------------------------------------------------------------------ the species
// Each shape: { parts: [{ mat, hi, lo }], trunk, crown, mat } — trunk / crown are the near-LOD bark and foliage geometry
// (crown clearance + tests use exactly those); parts are what Forest.js renders (lo = far LOD, null = not drawn far away).
let S = null;
function broadleaf(seed, o) {
  const build = (lod) => { const hi = lod === 0; const rngS = new RNG(seed), rngC = new RNG(seed + 1), rngB = new RNG(seed + 2); const t = new MeshBuilder(), c = new MeshBuilder(), fl = new MeshBuilder();
    const top = trunk(t, o.h * 0.45, o.trunkR, o.trunkR * 0.7, 0.4, rngS, [0.6, 0.55, 0.49], hi ? 12 : 5, hi ? 9 : 6);
    const ends = []; for (let k = 0; k < o.limbs; k++) { const a = k / o.limbs * Math.PI * 2 + rngS.range(-0.3, 0.3); const e = [top[0] + Math.cos(a) * o.r * 0.55, o.h * rngS.range(0.7, 0.85), top[2] + Math.sin(a) * o.r * 0.55]; ends.push(e); limb(t, top, e, o.trunkR * 0.6, o.trunkR * 0.25, undefined, hi ? 6 : 3, hi ? 7 : 5); }
    const cr = { cx: top[0], cy: o.h * 0.82, cz: top[2], rx: o.r, ry: o.h * 0.28, rz: o.r, clumps: o.clumps, flat: o.flat, tint: o.tint };
    const C = clumpsOf(rngS, cr);
    if (hi) for (const q of C) { let best = null, bd = 1e9; for (const e of ends) { const d = Math.hypot(e[0] - q.x, e[1] - q.y, e[2] - q.z); if (d < bd) { bd = d; best = e; } } // twigs out to the clumps
      if (best && bd > 0.6) limb(t, [best[0], best[1] + 0.3, best[2]], [q.x + (best[0] - q.x) * 0.25, q.y - q.rv * 0.3, q.z + (best[2] - q.z) * 0.25], o.trunkR * 0.22, o.trunkR * 0.07, undefined, 3, 5); }
    clumpCrown(c, cr, C, rngC, hi ? Math.round(o.cards * 1.35) : o.cardsLo, hi ? o.size * 0.9 : o.size * o.loK); // denser, finer near crowns: no see-through blobs
    if (o.flowers && hi) for (const q of C) for (let k = 0; k < o.flowers; k++) { const u = rngB.next() * 6.28, v = rngB.next() * 1.2; flower(fl, q.x + Math.sin(v) * Math.cos(u) * q.r, q.y + Math.cos(v) * q.rv, q.z + Math.sin(v) * Math.sin(u) * q.r, 0.05, o.flowerCol(rngB), 5, 0.5, rngB); }
    if (o.fruit && hi) for (let k = 0; k < o.fruit; k++) { const a = rngB.next() * 6.28, y = rngB.range(1.6, o.h * 0.42); const r = o.trunkR * (1 - 0.3 * y / (o.h * 0.45)); blob(fl, Math.cos(a) * (r + 0.13), y, Math.sin(a) * (r + 0.13), 0.14, 0.24, 0.14, rngB.chance(0.5) ? [0.42, 0.5, 0.16] : [0.5, 0.55, 0.2], 0); } // jak fruit on the trunk
    return { t: t.build(), c: c.build(), f: fl.build() }; };
  const H = build(0), Lo = build(1);
  const parts = [{ mat: 'treeBark', hi: H.t, lo: Lo.t }, { mat: o.mat, hi: H.c, lo: Lo.c }]; if (H.f) parts.push({ mat: 'bloom', hi: H.f, lo: null });
  return { parts, trunk: H.t, crown: H.c, mat: o.mat };
}
function palmShape() {
  const build = (lod) => { const hi = lod === 0; const rngS = new RNG(707), rngB = new RNG(709); const t = new MeshBuilder(), c = new MeshBuilder(), b = new MeshBuilder();
    const top = trunk(t, 11, 0.24, 0.15, 1.6, rngS, [0.95, 0.92, 0.88], hi ? 12 : 6, hi ? 9 : 6);
    const F = []; for (let k = 0; k < 22; k++) F.push({ a: (k / 22) * Math.PI * 2 + rngS.range(-0.12, 0.12), len: rngS.range(4.0, 5.4), droop: rngS.range(0.5, 1.3) + (k % 3) * 0.3, rise: rngS.range(0.6, 1.4) });
    const n = hi ? 22 : 13; for (let k = 0; k < n; k++) { const q = F[hi ? k : Math.floor(k * 22 / 13)]; const dx = Math.cos(q.a), dz = Math.sin(q.a);
      const f = (tt) => [top[0] + dx * q.len * tt, top[1] - 0.1 + q.rise * Math.sin(tt * 1.6) * 0.9 - q.droop * tt * tt * 2.2, top[2] + dz * q.len * tt];
      strip(c, f, [-dz, dx], (tt) => (hi ? 0.85 : 1.0) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, tt + 0.1))), hi ? 7 : 4, hi ? 0.32 : 0.12, 'palm', [0.95, 1, 0.9].map((v) => v * rngB.range(0.85, 1.05))); }
    if (hi) for (let k = 0; k < 3; k++) { const a = rngB.next() * 6.28, dx = Math.cos(a), dz = Math.sin(a); const f = (tt) => [top[0] + dx * 1.4 * tt, top[1] - 0.3 - 3.6 * tt, top[2] + dz * 1.4 * tt]; // old fronds hanging dead against the trunk
      strip(c, f, [-dz, dx], (tt) => 0.45 * (1 - tt * 0.5), 4, 0.1, 'palm', [0.95, 0.72, 0.38]); }
    if (hi) for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2 + rngB.range(-0.2, 0.2); blob(b, top[0] + Math.cos(a) * 0.26, top[1] - 0.45 - rngB.range(0, 0.2), top[2] + Math.sin(a) * 0.26, 0.15, 0.17, 0.15, rngB.chance(0.6) ? [0.46, 0.52, 0.16] : [0.62, 0.46, 0.18], 0); } // coconuts
    return { t: t.build(), c: c.build(), b: b.build() }; };
  const H = build(0), Lo = build(1);
  return { parts: [{ mat: 'palmBark', hi: H.t, lo: Lo.t }, { mat: 'palm', hi: H.c, lo: Lo.c }, { mat: 'bloom', hi: H.b, lo: null }], trunk: H.t, crown: H.c, mat: 'palm' };
}
// areca (puwak) palm clump: 3–5 slender ringed stems with glossy green crownshafts and arching feather fronds — every garden has one
function arecaShape() {
  const build = (lod) => { const hi = lod === 0; const rngS = new RNG(733); const t = new MeshBuilder(), c = new MeshBuilder(), b = new MeshBuilder(); const nS = 4;
    for (let s = 0; s < nS; s++) { const a = s / nS * 6.28 + rngS.range(-0.4, 0.4), off = rngS.range(0.15, 0.35), h = rngS.range(5.5, 8.5), lean = rngS.range(0.3, 0.9); const bx = Math.cos(a) * off, bz = Math.sin(a) * off;
      const pts = [], radii = []; const seg = hi ? 8 : 4; pts.push(new THREE.Vector3(bx, -0.25, bz)); radii.push(0.1);
      for (let k = 0; k <= seg; k++) { const u = k / seg; pts.push(new THREE.Vector3(bx + Math.cos(a) * lean * u * u, u * (h - 1.2), bz + Math.sin(a) * lean * u * u)); radii.push(0.085 - 0.02 * u); }
      const g = tubeGeo(pts, radii, hi ? 7 : 5, { capEnd: true, vLen: 1.6 }); t.geometry(g, new THREE.Matrix4(), [1.12, 1.1, 1.02]); g.dispose();
      const tp = pts[pts.length - 1]; const sp = [tp.clone(), tp.clone().add(new THREE.Vector3(Math.cos(a) * 0.12, 1.2, Math.sin(a) * 0.12))]; // crownshaft
      const g2 = tubeGeo([sp[0], sp[0].clone().lerp(sp[1], 0.5), sp[1]], [0.075, 0.08, 0.05], hi ? 7 : 5, { capEnd: true }); b.geometry(g2, new THREE.Matrix4(), [0.33, 0.52, 0.22]); g2.dispose();
      const top = [sp[1].x, sp[1].y, sp[1].z]; const nF = hi ? 7 : 5;
      for (let k = 0; k < nF; k++) { const fa = k / nF * 6.28 + rngS.range(-0.3, 0.3), len = rngS.range(1.9, 2.6), dx = Math.cos(fa), dz = Math.sin(fa);
        const f = (tt) => [top[0] + dx * len * tt * 0.85, top[1] + 0.9 * Math.sin(tt * 2.0) * 0.8 - 1.1 * tt * tt, top[2] + dz * len * tt * 0.85];
        strip(c, f, [-dz, dx], (tt) => 0.42 * Math.sin(Math.PI * Math.min(1, tt * 0.95 + 0.06)), hi ? 5 : 3, hi ? 0.3 : 0.1, 'palm', [1.05, 1.12, 0.95]); } }
    return { t: t.build(), c: c.build(), b: b.build() }; };
  const H = build(0), Lo = build(1);
  return { parts: [{ mat: 'palmBark', hi: H.t, lo: Lo.t }, { mat: 'palm', hi: H.c, lo: Lo.c }, { mat: 'bloom', hi: H.b, lo: Lo.b }], trunk: H.t, crown: H.c, mat: 'palm' };
}
// banana (kehel) clump: 2–3 green pseudostems with huge torn paddle leaves arching out, the oldest hanging dry and brown
function bananaShape() {
  const build = (lod) => { const hi = lod === 0; const rngS = new RNG(751); const t = new MeshBuilder(), c = new MeshBuilder(); const nS = 3;
    for (let s = 0; s < nS; s++) { const a = s / nS * 6.28 + rngS.range(-0.5, 0.5), off = s ? rngS.range(0.35, 0.6) : 0, h = s ? rngS.range(1.6, 2.4) : rngS.range(2.6, 3.2); const bx = Math.cos(a) * off, bz = Math.sin(a) * off;
      const pts = [new THREE.Vector3(bx, -0.25, bz), new THREE.Vector3(bx, h * 0.5, bz), new THREE.Vector3(bx + 0.03, h, bz)], radii = [0.16, 0.13, 0.09];
      const g = tubeGeo(pts, radii, hi ? 8 : 6, { capEnd: true, vLen: 1 }); t.geometry(g, new THREE.Matrix4(), [0.5, 0.58, 0.3]); g.dispose();
      const nL = hi ? 8 : 5; for (let k = 0; k < nL; k++) { const fa = k * 2.4 + rngS.range(-0.2, 0.2) + s, dry = k >= nL - 2 && s === 0, len = rngS.range(1.6, 2.3) * (s ? 0.8 : 1), dx = Math.cos(fa), dz = Math.sin(fa);
        const el = dry ? -0.3 : rngS.range(0.5, 1.1);
        const f = (tt) => dry ? [bx + dx * (0.3 + 0.5 * tt), h - 0.2 - len * 0.9 * tt, bz + dz * (0.3 + 0.5 * tt)] : [bx + dx * len * tt, h + Math.sin(tt * 2.2) * len * 0.35 * el - len * 0.45 * tt * tt, bz + dz * len * tt];
        strip(c, f, [-dz, dx], (tt) => (s ? 0.22 : 0.28) * Math.pow(Math.sin(Math.PI * Math.min(1, tt * 1.04 + 0.02)), 0.55) * 1.0, hi ? 6 : 3, hi ? 0.18 : 0.05, 'banana', dry ? [1.1, 0.78, 0.35] : [1, 1, 1].map((v) => v * rngS.range(0.9, 1.08))); } }
    return { t: t.build(), c: c.build() }; };
  const H = build(0), Lo = build(1);
  return { parts: [{ mat: 'bloom', hi: H.t, lo: Lo.t }, { mat: 'banana', hi: H.c, lo: Lo.c }], trunk: H.t, crown: H.c, mat: 'banana' };
}
// {type: shape} — built once, deterministic
export function treeShapes() {
  if (S) return S; S = {};
  S.palm = palmShape();
  const B = (name, seed, o) => { S[name] = broadleaf(seed, { loK: 1.8, ...o }); };
  B('rain', 801, { h: 13, r: 9, trunkR: 0.55, limbs: 5, clumps: 23, cards: 17, cardsLo: 5, size: 1.32, tint: [0.95, 1, 0.9], flat: 1, mat: 'leaves' });
  B('mara', 811, { h: 10, r: 5.5, trunkR: 0.4, limbs: 4, clumps: 18, cards: 16, cardsLo: 5, size: 1.2, tint: [1, 1, 0.95], flat: 1, mat: 'leaves' });
  B('mango', 821, { h: 8, r: 3.8, trunkR: 0.32, limbs: 3, clumps: 15, cards: 15, cardsLo: 5, size: 0.98, tint: [0.78, 0.9, 0.78], flat: 0, mat: 'leaves' });
  B('jak', 831, { h: 12, r: 3.6, trunkR: 0.36, limbs: 3, clumps: 15, cards: 14, cardsLo: 5, size: 1.0, tint: [0.82, 0.95, 0.8], flat: 0, mat: 'leaves', fruit: 7 });
  B('bo', 841, { h: 12, r: 6, trunkR: 0.5, limbs: 5, clumps: 19, cards: 16, cardsLo: 5, size: 1.08, tint: [1.05, 1.1, 1.0], flat: 0, mat: 'leavesBright' });
  B('frangipani', 851, { h: 5, r: 2.6, trunkR: 0.18, limbs: 4, clumps: 11, cards: 10, cardsLo: 4, size: 0.74, tint: [1.2, 1.22, 1.15], flat: 0, mat: 'leavesBright', flowers: 4, flowerCol: (r) => (r.chance(0.7) ? [1.0, 0.97, 0.88] : [1.0, 0.78, 0.82]) });
  S.areca = arecaShape(); S.banana = bananaShape();
  return S;
}
// Leaf-card and branch vertices of a type in instance-local space (y up from the ground, trunk at the origin) —
// what CityPlan tests against building volumes. Trunk vertices below 1.5 m are left out (the trunk-to-wall gap covers them).
// Cards: corners + centre (a card is ≤ 2.5 m, so a wall corner can't slip between the points unseen at the clearance margin).
const PTS = {};
export function crownPoints(type) {
  if (PTS[type]) return PTS[type]; const d = treeShapes()[type]; if (!d) return null; const out = [];
  { const p = d.crown.attributes.position; for (let i = 0; i + 3 < p.count; i += 4) { let sx = 0, sy = 0, sz = 0; for (let k = 0; k < 4; k++) { const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k); out.push(x, y, z); sx += x; sy += y; sz += z; } out.push(sx / 4, sy / 4, sz / 4); } }
  { const p = d.trunk.attributes.position; for (let i = 0; i < p.count; i += 2) { const y = p.getY(i); if (y < 1.5) continue; out.push(p.getX(i), y, p.getZ(i)); } }
  return (PTS[type] = new Float32Array(out));
}
// ------------------------------------------------------------------------------------------------ shrubs and ground plants
// (not trees: no trunk collider, no crown clearance — Greenery places them clear of buildings, walls and paved ground)
function mound(mb, rng, o, n, size, colFn) { // leaf cards over a dome (flattened at the ground), darker inside
  for (let k = 0; k < n; k++) { const u = rng.next() * 6.28, v = Math.acos(1 - rng.next() * 1.35); const f = 0.55 + 0.45 * Math.sqrt(rng.next());
    const dx = Math.sin(v) * Math.cos(u), dy = Math.cos(v), dz = Math.sin(v) * Math.sin(u); const px = dx * o.r * f, py = Math.max(size * 0.6, o.h * 0.5 + dy * o.h * 0.5 * f), pz = dz * o.r * f;
    const ao = 0.6 + 0.4 * (0.5 * f + 0.5 * Math.max(0, Math.min(1, py / o.h))); const nl = Math.hypot(dx, dy + 0.3, dz) || 1;
    leafCard(mb, px, py, pz, size * rng.range(0.75, 1.2), rng, colFn(rng).map((q) => q * ao), [dx / nl, (dy + 0.3) / nl, dz / nl]); }
}
let P = null;
export function plantShapes() {
  if (P) return P; P = {};
  const shrub = (name, seed, o) => { const mk = (hi) => { const rng = new RNG(seed), rb = new RNG(seed + 5); const c = new MeshBuilder(), fl = new MeshBuilder();
      mound(c, rng, o, hi ? o.cards : Math.ceil(o.cards / 3), hi ? o.size : o.size * 1.6, o.col);
      if (o.bloom) o.bloom(fl, rb, hi); return { c: c.build(), f: fl.build() }; };
    const H = mk(true), Lo = mk(false); const parts = [{ mat: o.mat, hi: H.c, lo: Lo.c }]; if (H.f) parts.push({ mat: 'bloom', hi: H.f, lo: Lo.f });
    P[name] = { parts, h: o.h, r: o.r }; };
  const G = (r) => [1, 1, 1].map((v) => v * r.range(0.85, 1.08));
  // croton: variegated leaves — green, yellow, red, maroon on one bush (the vertex colour multiplies the pale-green sprig)
  shrub('croton', 901, { h: 1.2, r: 0.62, cards: 46, size: 0.3, mat: 'leavesBright', col: (r) => r.pick([[1, 1, 1], [1.9, 1.3, 0.5], [2.1, 0.62, 0.4], [1.5, 0.48, 0.42], [1.7, 1.45, 0.6]]).map((v) => v * r.range(0.85, 1.05)) });
  // hibiscus (pokuru wada): dark glossy leaves and big red / pink five-petal flowers
  shrub('hibiscus', 911, { h: 1.7, r: 0.85, cards: 60, size: 0.36, mat: 'leaves', col: G,
    bloom: (fl, r, hi) => { for (let k = 0; k < (hi ? 12 : 6); k++) { const u = r.next() * 6.28, v = Math.acos(1 - r.next() * 1.2); const col = r.chance(0.7) ? [0.82, 0.06, 0.08] : [0.95, 0.42, 0.58];
      flower(fl, Math.sin(v) * Math.cos(u) * 0.86, 0.85 + Math.cos(v) * 0.86, Math.sin(v) * Math.sin(u) * 0.86, 0.11, col, 5, 0.55, r); } } });
  // bougainvillea: small leaves smothered in papery magenta / orange bracts (bract clusters are real little kite geometry)
  shrub('bougain', 921, { h: 1.9, r: 1.15, cards: 70, size: 0.34, mat: 'leavesSmall', col: G,
    bloom: (fl, r, hi) => { const col = r.chance(0.75) ? [0.85, 0.1, 0.52] : [0.95, 0.45, 0.15]; for (let k = 0; k < (hi ? 46 : 20); k++) { const u = r.next() * 6.28, v = Math.acos(1 - r.next() * 1.3); const f = 0.85 + 0.2 * r.next();
      flower(fl, Math.sin(v) * Math.cos(u) * 1.15 * f, 0.95 + Math.cos(v) * 0.95 * f, Math.sin(v) * Math.sin(u) * 1.15 * f, 0.09, col.map((q) => q * r.range(0.85, 1.1)), 3, 0.8, r); } } });
  // ixora (rathmal): dense small dark leaves with round red-orange flower heads
  shrub('ixora', 931, { h: 1.0, r: 0.6, cards: 44, size: 0.24, mat: 'leavesSmall', col: (r) => [0.85, 0.9, 0.85].map((v) => v * r.range(0.85, 1.05)),
    bloom: (fl, r, hi) => { for (let k = 0; k < (hi ? 10 : 5); k++) { const u = r.next() * 6.28, v = Math.acos(1 - r.next() * 1.1); blob(fl, Math.sin(v) * Math.cos(u) * 0.6, 0.5 + Math.cos(v) * 0.52, Math.sin(v) * Math.sin(u) * 0.6, 0.075, 0.05, 0.075, [0.95, 0.22, 0.08], 0); } } });
  shrub('shrub', 941, { h: 1.3, r: 0.8, cards: 50, size: 0.34, mat: 'leaves', col: (r) => [0.9, 1, 0.85].map((v) => v * r.range(0.8, 1.1)) });
  shrub('weed', 951, { h: 0.4, r: 0.4, cards: 12, size: 0.16, mat: 'leavesSmall', col: (r) => [1.0, 1.1, 0.8].map((v) => v * r.range(0.85, 1.1)) });
  { // ground fern: arching fronds from a crown at the ground (palm-frond leaflets)
    const mk = (hi) => { const r = new RNG(961), c = new MeshBuilder(); const n = hi ? 11 : 7;
      for (let k = 0; k < n; k++) { const a = k / n * 6.28 + r.range(-0.2, 0.2), len = r.range(0.7, 1.05), dx = Math.cos(a), dz = Math.sin(a); const f = (tt) => [dx * len * tt, 0.08 + Math.sin(tt * 2.3) * 0.42 - 0.3 * tt * tt, dz * len * tt];
        strip(c, f, [-dz, dx], (tt) => 0.13 * Math.sin(Math.PI * Math.min(1, tt * 0.95 + 0.08)), hi ? 4 : 2, hi ? 0.25 : 0.08, 'palm', [0.85, 1.05, 0.8].map((v) => v * r.range(0.85, 1.05))); }
      return c.build(); };
    P.fern = { parts: [{ mat: 'palm', hi: mk(true), lo: mk(false) }], h: 0.6, r: 0.8 }; }
  return P;
}
