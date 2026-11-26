// Pure tree geometry (no materials): coconut palm, rain tree, mara, mango, jak, bo, frangipani.
// Shared by Vegetation.js (rendering) and CityPlan.js (crown clearance: no leaves or branches inside a building).
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { RNG } from '../core/rng.js';
import { encodeLeafCard, LEAF_STYLE as LS, LEAF_FAR } from './LeafAtlas.js';
import { LeafSet, clusterLeaves, shrubLeaves, writeLeaves, LEAF_LODS, leafMeshOn } from './LeafMesh.js';

// 95th: two foliage builds. 'mesh' (default): every leaf is real geometry with its own atlas tile (LeafMesh.js), crowns in
// 4 LODs; 'cards': the 88th texture-bombed leaf cards (Settings → leafMesh off; and ALWAYS the source of crownPoints, so the
// city plan — crown clearance against buildings, bird perches — is identical in both builds; the leaf meshes stay inside
// the cards' envelope: same clumps, leaves within the clump radius).
let CUR = 'mesh'; const modeNow = () => (leafMeshOn() ? 'mesh' : 'cards');
// mesh build: while a crown is being built clumpCrown() collects twigged leaf clusters here instead of writing cards
let COLLECT = null; const SKIP = {};
// per-species leaf arrangement (mesh build), keyed by the 88th card style
const LEAF_P = {
  [LS.generic]: { len: 0.3, wk: 0.9, twigs: 6, perTwig: 8 },
  [LS.broad]: { len: 0.36, wk: 0.95, twigs: 7, perTwig: 10, droop: 0.22, spread: 1.0, aged: 0.05 },
  [LS.narrow]: { len: 0.44, wk: 0.5, twigs: 6, perTwig: 10, droop: 0.45, spread: 0.8, aged: 0.03, bendK: 1.4 },
  [LS.bo]: { len: 0.36, wk: 1.12, twigs: 7, perTwig: 7, droop: 0.5, spread: 1.05, aged: 0.04, roll: 0.7 },
  [LS.frangipani]: { len: 0.46, wk: 0.55, twigs: 3, perTwig: 9, layout: 'rosette', twigLen: 0.65, droop: 0.15, lift: 0.9, aged: 0.06 },
  [LS.fine]: { len: 0.25, wk: 0.55, twigs: 8, perTwig: 24, layout: 'pinnate', droop: 0.12, aged: 0.05, lift: 0.85 },
  [LS.almond]: { len: 0.46, wk: 1.0, twigs: 2, perTwig: 10, layout: 'rosette', twigLen: 0.5, droop: 0.05, lift: 0.95, aged: 0.1 },
  [LS.shrub]: { len: 0.2, wk: 0.9 },
  [LS.small]: { len: 0.17, wk: 0.75 },
  [LS.croton]: { len: 0.22, wk: 0.55, aged: 0.2 },
};
const LEAF_MATS = new Set(['leaves', 'leavesBright', 'leavesSmall']);
// near-LOD twigs (bark): a 3-sided prism per twig, open ends (they sit inside the leaves)
function twigGeo(twigs, r0 = 0.022, r1 = 0.008, col = [0.55, 0.5, 0.44]) {
  if (!twigs.length) return null; const mb = new MeshBuilder(); const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), N = new THREE.Vector3(), M = new THREE.Vector3(), d = new THREE.Vector3();
  for (const t of twigs) { A.set(t[0], t[1], t[2]); B.set(t[3], t[4], t[5]); D.subVectors(B, A); const len = D.length(); if (len < 0.05) continue; D.divideScalar(len);
    N.set(0, 1, 0); if (Math.abs(D.y) > 0.9) N.set(1, 0, 0); N.addScaledVector(D, -N.dot(D)).normalize(); M.crossVectors(D, N); const i0 = mb.vcount;
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; d.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(M, Math.sin(a));
      mb.vert(A.x + d.x * r0, A.y + d.y * r0, A.z + d.z * r0, d.x, d.y, d.z, k / 3, 0, col); mb.vert(B.x + d.x * r1, B.y + d.y * r1, B.z + d.z * r1, d.x, d.y, d.z, k / 3, len, col); }
    for (let k = 0; k < 3; k++) { const a = i0 + k * 2, b = i0 + ((k + 1) % 3) * 2; mb.idx.push(a, b, b + 1, a, b + 1, a + 1); } }
  return mb.build();
}
// mesh build: the leaf part of a shape becomes 4 LOD crowns written from one LeafSet, plus the near-LOD twigs
function finishMesh(shape, set, twigR = 0.022) {
  const crowns = LEAF_LODS.map((_, lv) => { const mb = new MeshBuilder(); writeLeaves(mb, set, lv); return mb.build(); });
  const p = shape.parts.find((q) => LEAF_MATS.has(q.mat)); p.hi = p.lo = null; p.lods = crowns;
  const tw = twigGeo(set.twigs, twigR, twigR * 0.4); if (tw) shape.parts.push({ mat: 'treeBark', lods: [tw, null, null, null] });
  shape.crown = crowns[0]; shape.leafCount = set.L.length; return shape;
}
// build a tree in the current mode: build(lod) is the species' own builder (lod 0 near, 1 far); in the mesh build the
// near pass collects the leaves, the far pass skips them
function twoPass(build, shapeOf, twigR) {
  if (CUR !== 'mesh') { const H = build(0), Lo = build(1); return shapeOf(H, Lo); }
  const set = new LeafSet(); COLLECT = set; let H, Lo; try { H = build(0); COLLECT = SKIP; Lo = build(1); } finally { COLLECT = null; }
  return finishMesh(shapeOf(H, Lo), set, twigR);
}

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
function limb(mb, from, to, r0, r1, col = [0.57, 0.52, 0.46], n = 6, sides = 7, capStart = true) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to); const d = b.clone().sub(a); const start = a.clone().add(new THREE.Vector3(0, -0.35, 0)); // on the trunk axis, inside the trunk
  const pts = [], radii = []; for (let k = 0; k <= n; k++) { const u = k / n; const p = start.clone().lerp(b, u); p.y += Math.sin(u * Math.PI) * d.length() * 0.06; pts.push(p); radii.push(r0 + (r1 - r0) * u); }
  const g = tubeGeo(pts, radii, sides, { capEnd: true, capStart, vLen: Math.max(0.5, d.length() / 2) }); mb.geometry(g, new THREE.Matrix4(), col); g.dispose();
}
// ------------------------------------------------------------------------------------------------ leaf crowns
// A crown is a set of leaf CLUMPS (sub-domes of foliage over the crown envelope, upper side favoured) instead of one even
// shell of cards: light comes through the gaps between clumps, each clump has a lit outer face and a darker inside, the
// interior of the crown is shadowed (baked into the vertex colour) and the normals are a blend of the crown's and the clump's
// dome so the lighting reads lumpy, like a real tree. Structure (clump centres) comes from a stream shared by both LODs; the
// far LOD uses the same clumps with a few large cards each.
// enc = [style (+LEAF_FAR on the far LOD), branch flexibility 0..1] → packed into the card's uv (LeafAtlas.encodeLeafCard)
function leafCard(mb, px, py, pz, s, rng, col, n, enc = null) {
  const a = rng.next() * Math.PI, tilt = rng.range(-0.7, 0.7);
  const ax = Math.cos(a) * s, az = Math.sin(a) * s, bx = -Math.sin(a) * s * Math.cos(tilt), by = s * Math.sin(tilt) + s * 0.3, bz = Math.cos(a) * s * Math.cos(tilt);
  const i0 = mb.vcount; mb.quad([px - ax - bx, py - by, pz - az - bz], [px + ax - bx, py - by, pz + az - bz], [px + ax + bx, py + by, pz + az + bz], [px - ax + bx, py + by, pz - az + bz], [0, 0, 1, 1], col);
  for (let i = i0; i < mb.vcount; i++) { mb.nor[i * 3] = n[0]; mb.nor[i * 3 + 1] = n[1]; mb.nor[i * 3 + 2] = n[2]; }
  if (enc) encodeLeafCard(mb.uv, i0, enc[0], enc[1]);
}
function clumpsOf(rngS, o) {
  const out = [];
  for (let k = 0; k < o.clumps; k++) { const u = rngS.next() * Math.PI * 2, v = Math.acos(1 - rngS.next() * (o.flat ? 1.15 : 1.65)); const f = rngS.range(0.5, 0.9);
    const dx = Math.sin(v) * Math.cos(u), dy = Math.cos(v), dz = Math.sin(v) * Math.sin(u); const R = Math.max(o.rx, o.rz);
    out.push({ x: o.cx + dx * o.rx * f, y: o.cy + dy * o.ry * f * (o.flat ? 0.75 : 1), z: o.cz + dz * o.rz * f, r: rngS.range(0.3, 0.42) * R * (o.flat ? 0.85 : 1), rv: rngS.range(0.3, 0.42) * (o.flat ? o.ry * 1.1 : R), tint: rngS.range(0.86, 1.12) }); }
  return out;
}
function clumpCrown(mb, o, C, rngC, perClump, size) {
  if (COLLECT === SKIP) return; if (COLLECT) { clusterLeaves(COLLECT, o, C, rngC, { ...(LEAF_P[(o.style ?? 0) % LEAF_FAR] || LEAF_P[0]), ...(o.leaf || {}) }); return; }
  for (const c of C) {
    const ox = c.x - o.cx, oy = c.y - o.cy, oz = c.z - o.cz, ol = Math.hypot(ox, oy, oz) || 1;
    for (let k = 0; k < perClump; k++) {
      let dx, dy, dz; for (let tr = 0; tr < 3; tr++) { const u = rngC.next() * Math.PI * 2, v = Math.acos(1 - 2 * rngC.next()); dx = Math.sin(v) * Math.cos(u); dy = Math.cos(v); dz = Math.sin(v) * Math.sin(u); if ((dx * ox + dy * oy + dz * oz) / ol > -0.25) break; }
      const f = 0.45 + 0.55 * rngC.next(); const px = c.x + dx * c.r * f, py = c.y + dy * c.rv * f, pz = c.z + dz * c.r * f;
      const out = Math.max(0, Math.min(1, 0.5 + 0.5 * (dx * ox + dy * oy + dz * oz) / ol)), up = Math.max(0, Math.min(1, (py - (o.cy - o.ry)) / (2 * o.ry)));
      const ao = 0.58 + 0.42 * (0.55 * out + 0.45 * up); let t = o.tint.map((q) => q * c.tint * ao * rngC.range(0.88, 1.08)); if (o.cardTint) { const k = o.cardTint(rngC, c); t = t.map((q, i) => q * k[i]); }
      const ax = px - o.cx, ay = (py - o.cy) * 1.3 + o.ry * 0.4, az = pz - o.cz, al = Math.hypot(ax, ay, az) || 1, bxx = px - c.x, byy = py - c.y + c.rv * 0.3, bzz = pz - c.z, bl = Math.hypot(bxx, byy, bzz) || 1;
      let nx = 0.55 * ax / al + 0.45 * bxx / bl, ny = 0.55 * ay / al + 0.45 * byy / bl + 0.15, nz = 0.55 * az / al + 0.45 * bzz / bl; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      // wind flexibility: cards far out from the trunk axis (branch tips) and high in the crown move most, the inner crown little
      const R0 = o.rx || 4.5, dh = Math.hypot(px - (o.ax ?? o.cx), pz - (o.az ?? o.cz)); const flex = Math.min(1, 0.15 + 0.7 * Math.min(1, dh / R0) + 0.15 * up);
      leafCard(mb, px, py, pz, size * rngC.range(0.75, 1.2), rngC, t, [nx, ny, nz], o.style != null ? [o.style, flex] : null);
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
let S = null; const SC = {};
function broadleaf(seed, o) {
  const build = (lod) => { const hi = lod === 0; const rngS = new RNG(seed), rngC = new RNG(seed + 1), rngB = new RNG(seed + 2); const t = new MeshBuilder(), c = new MeshBuilder(), fl = new MeshBuilder();
    const top = trunk(t, o.h * 0.45, o.trunkR, o.trunkR * 0.7, 0.4, rngS, [0.6, 0.55, 0.49], hi ? 12 : 5, hi ? 9 : 6);
    const ends = []; for (let k = 0; k < o.limbs; k++) { const a = k / o.limbs * Math.PI * 2 + rngS.range(-0.3, 0.3); const e = [top[0] + Math.cos(a) * o.r * 0.55, o.h * rngS.range(0.7, 0.85), top[2] + Math.sin(a) * o.r * 0.55]; ends.push(e); limb(t, top, e, o.trunkR * 0.6, o.trunkR * 0.25, undefined, hi ? 5 : 3, hi ? 6 : 5); }
    const cr = { cx: top[0], cy: o.h * 0.82, cz: top[2], rx: o.r, ry: o.h * 0.28, rz: o.r, clumps: o.clumps, flat: o.flat, tint: o.tint, cardTint: o.cardTint || null, style: (o.style ?? LS.broad) + (hi ? 0 : LEAF_FAR), leaf: o.leaf };
    const C = clumpsOf(rngS, cr);
    if (hi) for (const q of C) { let best = null, bd = 1e9; for (const e of ends) { const d = Math.hypot(e[0] - q.x, e[1] - q.y, e[2] - q.z); if (d < bd) { bd = d; best = e; } } // twigs out to the clumps
      if (best && bd > 0.6) limb(t, [best[0], best[1] + 0.3, best[2]], [q.x + (best[0] - q.x) * 0.25, q.y - q.rv * 0.3, q.z + (best[2] - q.z) * 0.25], o.trunkR * 0.22, o.trunkR * 0.07, undefined, 3, 4); } // 88th: twigs are hidden in the crown: 4-sided, not 5
    // 88th (perf): a crown's cards overlapped ~6 deep on screen (measured: 6.3 leaf fragments per covered pixel at the park), and
    // every hidden layer is paid for in the fragment shader. Near crowns keep 1.12 × the cards (was 1.35), far crowns 60 % of
    // cardsLo — still 3–4 layers deep, so silhouettes and density read the same while the leaf fill rate drops ~20–40 %.
    clumpCrown(c, cr, C, rngC, hi ? Math.round(o.cards * 1.12) : Math.ceil(o.cardsLo * 0.6), hi ? o.size * 0.9 : o.size * o.loK);
    if (o.flowers && hi) for (const q of C) for (let k = 0; k < o.flowers; k++) { const u = rngB.next() * 6.28, v = rngB.next() * 1.2; flower(fl, q.x + Math.sin(v) * Math.cos(u) * q.r, q.y + Math.cos(v) * q.rv, q.z + Math.sin(v) * Math.sin(u) * q.r, o.flowerR || 0.05, o.flowerCol(rngB), o.petals || 5, 0.5, rngB); }
    if (o.flowers && !hi && o.flowersLo) for (const q of C) for (let k = 0; k < o.flowersLo; k++) { const u = rngB.next() * 6.28, v = rngB.next() * 1.1; flower(fl, q.x + Math.sin(v) * Math.cos(u) * q.r, q.y + Math.cos(v) * q.rv, q.z + Math.sin(v) * Math.sin(u) * q.r, (o.flowerR || 0.05) * 2.2, o.flowerCol(rngB), o.petals || 5, 0.4, rngB); } // far LOD keeps the colour (fewer, bigger heads)
    if (o.extra) o.extra({ t, c, fl, hi, top, ends, C, rng: rngB });
    if (o.fruit && hi) for (let k = 0; k < o.fruit; k++) { const a = rngB.next() * 6.28, y = rngB.range(1.6, o.h * 0.42); const r = o.trunkR * (1 - 0.3 * y / (o.h * 0.45)); blob(fl, Math.cos(a) * (r + 0.13), y, Math.sin(a) * (r + 0.13), 0.14, 0.24, 0.14, rngB.chance(0.5) ? [0.42, 0.5, 0.16] : [0.5, 0.55, 0.2], 0); } // jak fruit on the trunk
    return { t: t.build(), c: c.build(), f: fl.build() }; };
  return twoPass(build, (H, Lo) => { const parts = [{ mat: 'treeBark', hi: H.t, lo: Lo.t }, { mat: o.mat, hi: H.c, lo: Lo.c }]; if (H.f) parts.push({ mat: 'bloom', hi: H.f, lo: Lo.f && o.flowersLo ? Lo.f : null });
    return { parts, trunk: H.t, crown: H.c, mat: o.mat }; }, o.trunkR * 0.06);
}
function palmShape(P = {}) {
  const o = { seed: 707, h: 11, bend: 1.6, len: [4.0, 5.4], droop: 1, nuts: 9, nutCol: null, frondCol: [0.95, 1, 0.9], ...P };
  const build = (lod) => { const hi = lod === 0; const rngS = new RNG(o.seed), rngB = new RNG(o.seed + 2); const t = new MeshBuilder(), c = new MeshBuilder(), b = new MeshBuilder();
    const top = trunk(t, o.h, 0.24, 0.15, o.bend, rngS, [0.95, 0.92, 0.88], hi ? 12 : 6, hi ? 9 : 6);
    const F = []; for (let k = 0; k < 22; k++) F.push({ a: (k / 22) * Math.PI * 2 + rngS.range(-0.12, 0.12), len: rngS.range(o.len[0], o.len[1]), droop: (rngS.range(0.5, 1.3) + (k % 3) * 0.3) * o.droop, rise: rngS.range(0.6, 1.4) });
    const n = hi ? 22 : 13; for (let k = 0; k < n; k++) { const q = F[hi ? k : Math.floor(k * 22 / 13)]; const dx = Math.cos(q.a), dz = Math.sin(q.a);
      const f = (tt) => [top[0] + dx * q.len * tt, top[1] - 0.1 + q.rise * Math.sin(tt * 1.6) * 0.9 - q.droop * tt * tt * 2.2, top[2] + dz * q.len * tt];
      strip(c, f, [-dz, dx], (tt) => (hi ? 0.85 : 1.0) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, tt + 0.1))), hi ? 7 : 4, hi ? 0.32 : 0.12, 'palm', o.frondCol.map((v) => v * rngB.range(0.85, 1.05))); }
    if (hi) for (let k = 0; k < 3; k++) { const a = rngB.next() * 6.28, dx = Math.cos(a), dz = Math.sin(a); const f = (tt) => [top[0] + dx * 1.4 * tt, top[1] - 0.3 - 3.6 * tt, top[2] + dz * 1.4 * tt]; // old fronds hanging dead against the trunk
      strip(c, f, [-dz, dx], (tt) => 0.45 * (1 - tt * 0.5), 4, 0.1, 'palm', [0.95, 0.72, 0.38]); }
    if (hi || o.nutCol) for (let k = 0; k < (hi ? o.nuts : Math.ceil(o.nuts / 3)); k++) { const a = (k / o.nuts) * Math.PI * 2 + rngB.range(-0.2, 0.2); const ring = o.nutCol ? 0.26 + (k % 3) * 0.07 : 0.26; blob(b, top[0] + Math.cos(a) * ring, top[1] - 0.45 - rngB.range(0, 0.2) - (o.nutCol ? (k % 3) * 0.12 : 0), top[2] + Math.sin(a) * ring, 0.15, 0.17, 0.15, o.nutCol ? o.nutCol.map((q) => q * rngB.range(0.88, 1.08)) : rngB.chance(0.6) ? [0.46, 0.52, 0.16] : [0.62, 0.46, 0.18], 0); } // coconuts (king coconut: big orange bunches, kept on the far LOD)
    return { t: t.build(), c: c.build(), b: b.build() }; };
  const H = build(0), Lo = build(1);
  return { parts: [{ mat: 'palmBark', hi: H.t, lo: Lo.t }, { mat: 'palm', hi: H.c, lo: Lo.c }, { mat: 'bloom', hi: H.b, lo: o.nutCol ? Lo.b : null }], trunk: H.t, crown: H.c, mat: 'palm' };
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
// ---- 52nd request: five more species, after the trees that actually line Colombo's streets, parks and gardens
// kottamba (tropical almond, Terminalia catappa): one straight grey trunk with whorls of near-horizontal branches stacked in
// tiers like a pagoda, each tier tipped with flat pads of big leathery leaves; some leaves turning red-orange before they drop.
function kottambaShape() {
  const build = (lod) => { const hi = lod === 0; const rngS = new RNG(861), rngC = new RNG(862); const t = new MeshBuilder(), c = new MeshBuilder(); const H = 11;
    const top = trunk(t, H, 0.33, 0.1, 0.25, rngS, [0.56, 0.53, 0.5], hi ? 12 : 5, hi ? 9 : 6); const axis = (y) => [top[0] * (y / H) ** 2, top[2] * (y / H) ** 2];
    const tiers = [3.4, 5.2, 6.9, 8.5, 9.9, 11.0];
    for (let i = 0; i < tiers.length; i++) { const y = tiers[i]; const len = Math.max(0.9, (4.9 - i * 0.78) * rngS.range(0.88, 1.08)); const nb = i < 4 ? 5 : 3; const a0 = rngS.next() * 6.28; const [ax, az] = axis(y);
      for (let k = 0; k < nb; k++) { const a = a0 + k / nb * 6.28 + rngS.range(-0.28, 0.28); const ex = ax + Math.cos(a) * len, ez = az + Math.sin(a) * len, ey = y + rngS.range(0.15, 0.55);
        limb(t, [ax, y, az], [ex, ey, ez], Math.max(0.035, 0.12 - i * 0.016), 0.025, [0.55, 0.52, 0.48], hi ? 4 : 2, hi ? 5 : 3);
        const red = rngS.chance(0.22); const pads = []; const np = len > 2 ? 3 : 2;
        for (let q = 0; q < np; q++) { const f = 0.42 + q * (0.55 / np) + rngS.range(-0.05, 0.05); pads.push({ x: ax + (ex - ax) * f, y: y + (ey - y) * f + 0.28, z: az + (ez - az) * f, r: 0.55 + len * 0.16, rv: 0.32, tint: rngS.range(0.9, 1.08) }); }
        pads.push({ x: ex, y: ey + 0.22, z: ez, r: 0.6, rv: 0.3, tint: 1 });
        clumpCrown(c, { cx: ax, cy: y, cz: az, ax: 0, az: 0, rx: 5, ry: 0.9, style: LS.almond + (hi ? 0 : LEAF_FAR), tint: [0.86, 0.98, 0.78], cardTint: red ? (r) => (r.chance(0.6) ? [2.0, 0.78, 0.45] : [1.6, 1.15, 0.55]) : null }, pads, rngC, hi ? 10 : 3, hi ? 0.62 : 1.05); } }
    return { t: t.build(), c: c.build() }; };
  return twoPass(build, (H, Lo) => ({ parts: [{ mat: 'treeBark', hi: H.t, lo: Lo.t }, { mat: 'leaves', hi: H.c, lo: Lo.c }], trunk: H.t, crown: H.c, mat: 'leaves' }), 0.02);
}
// ashoka / mast tree (Polyalthia longifolia 'pendula'): the tall, narrow, weeping column planted in rows along boulevards and
// temple walks — short drooping branches all the way up a straight trunk, dark glossy wavy leaves hanging in curtains.
function ashokaShape() {
  const build = (lod) => { const hi = lod === 0; const rngS = new RNG(871), rngC = new RNG(872); const t = new MeshBuilder(), c = new MeshBuilder(); const H = 12.5;
    const top = trunk(t, H, 0.2, 0.06, 0.12, rngS, [0.5, 0.46, 0.42], hi ? 12 : 5, hi ? 8 : 5);
    const C = []; const dy = hi ? 0.55 : 0.9;
    for (let y = 1.6; y < H + 0.3; y += dy) { const u = (y - 1.6) / (H - 1.6); const R = 0.35 + 1.25 * Math.pow(1 - u, 0.6) * (0.75 + 0.25 * Math.sin(u * 9)); const n = Math.max(2, Math.round(R * (hi ? 4 : 2.5))); const a0 = rngS.next() * 6.28;
      for (let k = 0; k < n; k++) { const a = a0 + k / n * 6.28 + rngS.range(-0.3, 0.3); const ax = top[0] * (y / H) ** 2, az = top[2] * (y / H) ** 2; const ex = ax + Math.cos(a) * R, ez = az + Math.sin(a) * R;
        if (hi && R > 0.6) limb(t, [ax, y, az], [ex, y - 0.35, ez], 0.035, 0.012, [0.5, 0.46, 0.42], 2, 4); // drooping twig
        C.push({ x: ex * 0.92, y: y - 0.45, z: ez * 0.92, r: 0.45 + R * 0.12, rv: 0.55, tint: rngS.range(0.86, 1.06) }); } }
    clumpCrown(c, { cx: top[0] * 0.5, cy: H * 0.55, cz: top[2] * 0.5, rx: 1.6, ry: H * 0.5, style: LS.narrow + (hi ? 0 : LEAF_FAR), tint: [0.62, 0.8, 0.58], leaf: { droop: 0.95, spread: 0.65, len: 0.4, wk: 0.42, twigs: 3, perTwig: 9, twigUp: -0.2 } }, C, rngC, hi ? 6 : 3, hi ? 0.5 : 0.85);
    return { t: t.build(), c: c.build() }; };
  return twoPass(build, (H, Lo) => ({ parts: [{ mat: 'treeBark', hi: H.t, lo: Lo.t }, { mat: 'leaves', hi: H.c, lo: Lo.c }], trunk: H.t, crown: H.c, mat: 'leaves' }), 0.02);
}
// nuga (banyan, Ficus benghalensis): a massive trunk of fused stems, a huge low spreading crown, and aerial roots hanging from
// the limbs — the thick ones near the trunk have reached the ground and become pillars of their own.
function nugaExtra({ t, hi, top, ends, rng }) {
  for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28 + rng.range(-0.3, 0.3), d = rng.range(0.55, 0.85); const bx = Math.cos(a) * d, bz = Math.sin(a) * d; // fused stems round the main trunk
    const pts = [new THREE.Vector3(bx * 1.3, -0.25, bz * 1.3), new THREE.Vector3(bx, 1.5, bz), new THREE.Vector3(bx * 0.6 + top[0] * 0.3, 4.2, bz * 0.6 + top[2] * 0.3), new THREE.Vector3(top[0] * 0.8, 5.6, top[2] * 0.8)];
    const g = tubeGeo(pts, [0.42, 0.3, 0.24, 0.16], hi ? 9 : 6, { capEnd: true, vLen: 1.6 }); t.geometry(g, new THREE.Matrix4(), [0.6, 0.56, 0.5]); g.dispose(); }
  const n = hi ? 46 : 14;
  for (let k = 0; k < n; k++) { const e = ends[k % ends.length]; const f = rng.range(0.25, 0.95); const x = top[0] + (e[0] - top[0]) * f, z = top[2] + (e[2] - top[2]) * f, y = top[1] + (e[1] - top[1]) * f + Math.sin(f * Math.PI) * 0.25;
    const dist = Math.hypot(x, z); const pillar = dist < 3.2 && k % 4 === 0; if (!hi && !pillar && k % 2) continue;
    const yEnd = pillar ? -0.2 : Math.max(1.9, y - rng.range(2.0, 5.5)); const r0 = pillar ? rng.range(0.08, 0.13) : rng.range(0.014, 0.03); const sw = rng.range(-0.15, 0.15);
    const pts = [new THREE.Vector3(x, y + 0.1, z), new THREE.Vector3(x + sw * 0.4, (y + yEnd) / 2, z + sw * 0.3), new THREE.Vector3(x + sw, yEnd, z + sw * 0.7)];
    const g = tubeGeo(pts, [r0 * 0.9, r0, pillar ? r0 * 1.45 : r0 * 0.6], pillar ? (hi ? 7 : 5) : 4, { capEnd: true, vLen: 1.2 }); t.geometry(g, new THREE.Matrix4(), pillar ? [0.62, 0.57, 0.5] : [0.52, 0.42, 0.34]); g.dispose(); }
}
// {type: shape} — built once, deterministic
export function treeShapes(mode = modeNow()) {
  if (SC[mode]) return SC[mode]; const prevS = S, prevC = CUR; S = SC[mode] = {}; CUR = mode; try {
  S.palm = palmShape();
  const B = (name, seed, o) => { S[name] = broadleaf(seed, { loK: 1.8, ...o }); };
  B('rain', 801, { leaf: { layout: 'pinnate', len: 0.3, wk: 0.62, perTwig: 18, twigs: 8, droop: 0.15 }, style: LS.broad, h: 13, r: 9, trunkR: 0.55, limbs: 5, clumps: 23, cards: 17, cardsLo: 5, size: 1.32, tint: [0.95, 1, 0.9], flat: 1, mat: 'leaves' });
  B('mara', 811, { style: LS.broad, h: 10, r: 5.5, trunkR: 0.4, limbs: 4, clumps: 18, cards: 16, cardsLo: 5, size: 1.2, tint: [1, 1, 0.95], flat: 1, mat: 'leaves' });
  B('mango', 821, { style: LS.narrow, h: 8, r: 3.8, trunkR: 0.32, limbs: 3, clumps: 15, cards: 15, cardsLo: 5, size: 0.98, tint: [0.78, 0.9, 0.78], flat: 0, mat: 'leaves' });
  B('jak', 831, { leaf: { len: 0.36, wk: 0.68, droop: 0.3 }, style: LS.narrow, h: 12, r: 3.6, trunkR: 0.36, limbs: 3, clumps: 15, cards: 14, cardsLo: 5, size: 1.0, tint: [0.82, 0.95, 0.8], flat: 0, mat: 'leaves', fruit: 7 });
  B('bo', 841, { style: LS.bo, h: 12, r: 6, trunkR: 0.5, limbs: 5, clumps: 19, cards: 16, cardsLo: 5, size: 1.08, tint: [1.05, 1.1, 1.0], flat: 0, mat: 'leavesBright' });
  B('frangipani', 851, { style: LS.frangipani, h: 5, r: 2.6, trunkR: 0.18, limbs: 4, clumps: 11, cards: 10, cardsLo: 4, size: 0.74, tint: [1.2, 1.22, 1.15], flat: 0, mat: 'leavesBright', flowers: 4, flowerCol: (r) => (r.chance(0.7) ? [1.0, 0.97, 0.88] : [1.0, 0.78, 0.82]) });
  S.areca = arecaShape(); S.banana = bananaShape();
  // 52nd: five more species
  B('nuga', 881, { leaf: { len: 0.4, wk: 1.0, droop: 0.3 }, style: LS.broad, h: 14, r: 10.5, trunkR: 0.85, limbs: 7, clumps: 28, cards: 17, cardsLo: 5, size: 1.25, tint: [0.84, 0.95, 0.8], flat: 1, mat: 'leaves', extra: nugaExtra });
  S.kottamba = kottambaShape(); S.ashoka = ashokaShape();
  B('flamboyant', 891, { style: LS.fine, petals: 4, h: 9, r: 7, trunkR: 0.38, limbs: 6, clumps: 22, cards: 15, cardsLo: 5, size: 0.95, tint: [1.0, 1.08, 0.9], flat: 1, mat: 'leavesSmall', flowers: 11, flowersLo: 4, flowerR: 0.095,
    flowerCol: (r) => (r.chance(0.8) ? [0.93, 0.16, 0.06] : [0.98, 0.45, 0.08]), cardTint: (r) => (r.chance(0.32) ? [2.1, 0.52, 0.32] : [1, 1, 1]) }); // mal mara (Delonix regia): umbrella crown of fine feathery leaves, smothered in scarlet in April–May
  S.kingcoconut = palmShape({ seed: 717, h: 7.2, bend: 0.55, len: [3.4, 4.4], droop: 0.7, nuts: 16, nutCol: [0.95, 0.56, 0.12], frondCol: [1.02, 1.02, 0.82] }); // thambili: shorter, upright, golden-orange nut bunches
  } finally { CUR = prevC; } const out = S; S = prevS; return out;
}
// Leaf-card and branch vertices of a type in instance-local space (y up from the ground, trunk at the origin) —
// what CityPlan tests against building volumes. Trunk vertices below 1.5 m are left out (the trunk-to-wall gap covers them).
// Cards: corners + centre (a card is ≤ 2.5 m, so a wall corner can't slip between the points unseen at the clearance margin).
const PTS = {};
export function crownPoints(type) {
  if (PTS[type]) return PTS[type]; const d = treeShapes('cards')[type]; if (!d) return null; const out = [];
  { const p = d.crown.attributes.position; for (let i = 0; i + 3 < p.count; i += 4) { let sx = 0, sy = 0, sz = 0; for (let k = 0; k < 4; k++) { const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k); out.push(x, y, z); sx += x; sy += y; sz += z; } out.push(sx / 4, sy / 4, sz / 4); } }
  { const p = d.trunk.attributes.position; for (let i = 0; i < p.count; i += 2) { const y = p.getY(i); if (y < 1.5) continue; out.push(p.getX(i), y, p.getZ(i)); } }
  return (PTS[type] = new Float32Array(out));
}
// ------------------------------------------------------------------------------------------------ shrubs and ground plants
// (not trees: no trunk collider, no crown clearance — Greenery places them clear of buildings, walls and paved ground)
function mound(mb, rng, o, n, size, colFn, style = null) { // leaf cards over a dome (flattened at the ground), darker inside
  for (let k = 0; k < n; k++) { const u = rng.next() * 6.28, v = Math.acos(1 - rng.next() * 1.35); const f = 0.55 + 0.45 * Math.sqrt(rng.next());
    const dx = Math.sin(v) * Math.cos(u), dy = Math.cos(v), dz = Math.sin(v) * Math.sin(u); const px = dx * o.r * f, py = Math.max(size * 0.6, o.h * 0.5 + dy * o.h * 0.5 * f), pz = dz * o.r * f;
    const ao = 0.6 + 0.4 * (0.5 * f + 0.5 * Math.max(0, Math.min(1, py / o.h))); const nl = Math.hypot(dx, dy + 0.3, dz) || 1;
    leafCard(mb, px, py, pz, size * rng.range(0.75, 1.2), rng, colFn(rng).map((q) => q * ao), [dx / nl, (dy + 0.3) / nl, dz / nl], style != null ? [style, Math.min(1, 0.25 + 0.75 * py / o.h)] : null); }
}
let P = null; const PC = {};
// mesh build of a leafy shrub: stems fanning out of the root to the dome, leaves along their outer part (LeafMesh.shrubLeaves),
// 4 LODs from one leaf set; flowers as before (hi / lo)
function shrubMesh(name, seed, o) {
  const rng = new RNG(seed), rb = new RNG(seed + 5); const st = o.style ?? (o.mat === 'leavesSmall' ? LS.small : LS.shrub); const LP = LEAF_P[st] || LEAF_P[LS.shrub];
  const set = new LeafSet(); const len = (o.leafLen ?? LP.len) * Math.min(1.25, Math.max(0.6, o.size / 0.3));
  shrubLeaves(set, { r: o.r, h: o.h }, rng, { stems: Math.max(5, o.cards * 0.6), perStem: o.perStem ?? 15, len, wk: LP.wk, aged: LP.aged ?? 0.04, col: o.col, droop: 0.2, lift: 0.7 });
  const lods = LEAF_LODS.map((_, lv) => { if (lv === 3) return null; const mb = new MeshBuilder(); writeLeaves(mb, set, lv); return mb.build(); }); lods[3] = lods[2];
  const fH = new MeshBuilder(), fL = new MeshBuilder(); if (o.bloom) { o.bloom(fH, rb, true); o.bloom(fL, new RNG(seed + 5), false); } const fh = fH.build(), fl = fL.build();
  const parts = [{ mat: o.mat, lods }]; if (fh) parts.push({ mat: 'bloom', hi: fh, lo: fl }); const tw = twigGeo(set.twigs, 0.012, 0.005, [0.2, 0.17, 0.13]); if (tw) parts.push({ mat: 'bloom', lods: [tw, null, null, null] });
  P[name] = { parts, h: o.h, r: o.r, leafCount: set.L.length };
}
export function plantShapes(mode = modeNow()) {
  if (PC[mode]) return PC[mode]; const prevP = P, prevC = CUR; P = PC[mode] = {}; CUR = mode; try {
  const shrub = (name, seed, o) => { if (CUR === 'mesh') return shrubMesh(name, seed, o); const mk = (hi) => { const rng = new RNG(seed), rb = new RNG(seed + 5); const c = new MeshBuilder(), fl = new MeshBuilder();
      mound(c, rng, o, hi ? o.cards : Math.ceil(o.cards / 3), hi ? o.size : o.size * 1.6, o.col, (o.style ?? (o.mat === 'leavesSmall' ? LS.small : LS.shrub)) + (hi ? 0 : LEAF_FAR));
      if (o.bloom) o.bloom(fl, rb, hi); return { c: c.build(), f: fl.build() }; };
    const H = mk(true), Lo = mk(false); const parts = [{ mat: o.mat, hi: H.c, lo: Lo.c }]; if (H.f) parts.push({ mat: 'bloom', hi: H.f, lo: Lo.f });
    P[name] = { parts, h: o.h, r: o.r }; };
  const G = (r) => [1, 1, 1].map((v) => v * r.range(0.85, 1.08));
  // croton: variegated leaves — green, yellow, red, maroon on one bush (the vertex colour multiplies the pale-green sprig)
  shrub('croton', 901, { style: LS.croton, h: 1.2, r: 0.62, cards: 46, size: 0.3, mat: 'leavesBright', col: (r) => r.pick([[1, 1, 1], [1.9, 1.3, 0.5], [2.1, 0.62, 0.4], [1.5, 0.48, 0.42], [1.7, 1.45, 0.6]]).map((v) => v * r.range(0.85, 1.05)) });
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
  // ---- 52nd request: five more garden plants (real geometry, vertex-coloured; the 'bloom' material is plain lit colour)
  const tube = (mb, pts, radii, sides, col) => { const g = tubeGeo(pts.map((q) => new THREE.Vector3(...q)), radii, sides, { capEnd: true }); mb.geometry(g, new THREE.Matrix4(), col); g.dispose(); };
  const V = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // a flat blade along a curve: f(t) centre line, side unit vector [sx, sz] (horizontal), width(t), colour(t, edge 0..1)
  const blade = (mb, f, side, width, seg, colAt, fold = 0) => { for (let k = 0; k < seg; k++) { const t0 = k / seg, t1 = (k + 1) / seg; const A = f(t0), B = f(t1), w0 = width(t0), w1 = width(t1);
    const L0 = [A[0] - side[0] * w0, A[1] - w0 * fold, A[2] - side[1] * w0], R0 = [A[0] + side[0] * w0, A[1] - w0 * fold, A[2] + side[1] * w0], L1 = [B[0] - side[0] * w1, B[1] - w1 * fold, B[2] - side[1] * w1], R1 = [B[0] + side[0] * w1, B[1] - w1 * fold, B[2] + side[1] * w1];
    mb.quad(L0, A, B, L1, [0, t0, 0.5, t1], colAt(t0, 1)); mb.quad(A, R0, R1, B, [0.5, t0, 1, t1], colAt(t0, 0)); } };
  { // heliconia (lobster claw): a clump of stems with paddle leaves like a small banana, and upright zig-zag spikes of red bracts tipped yellow and green
    const mk = (hi) => { const r = new RNG(971), c = new MeshBuilder(), b = new MeshBuilder(); const nS = hi ? 7 : 4;
      for (let s = 0; s < nS; s++) { const a = s / nS * 6.28 + r.range(-0.3, 0.3), off = r.range(0.05, 0.3), h = r.range(0.9, 1.5); const bx = Math.cos(a) * off, bz = Math.sin(a) * off; const tx = bx + Math.cos(a) * 0.12, tz = bz + Math.sin(a) * 0.12;
        tube(b, [[bx, -0.05, bz], [tx * 0.5 + bx * 0.5, h * 0.5, tz * 0.5 + bz * 0.5], [tx, h, tz]], [0.018, 0.015, 0.01], hi ? 5 : 4, [0.28, 0.42, 0.16]);
        const fa = a + r.range(-0.6, 0.6), len = r.range(0.55, 0.8), dx = Math.cos(fa), dz = Math.sin(fa); const f = (t) => [tx + dx * len * t, h + Math.sin(t * 2.2) * 0.22 - 0.2 * t * t, tz + dz * len * t];
        strip(c, f, [-dz, dx], (t) => 0.11 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02 + 0.02)), 0.6), hi ? 5 : 3, hi ? 0.15 : 0.05, 'banana', [1.05, 1.08, 0.95].map((q) => q * r.range(0.85, 1.05)));
        if (s % 2 === 0) { const n = hi ? 7 : 4, top = h + 0.45; for (let k = 0; k < n; k++) { const y = h + 0.05 + (k / n) * 0.4, sd = k % 2 ? 1 : -1; const px = -Math.sin(a) * sd, pz = Math.cos(a) * sd; const base = [tx, y, tz];
          const tip = [tx + px * 0.11, y + 0.08, tz + pz * 0.11]; const col = [0.86, 0.12, 0.08]; b.quad(base, [base[0] + Math.cos(a) * 0.02, y + 0.03, base[2] + Math.sin(a) * 0.02], tip, [tip[0], tip[1] - 0.05, tip[2]], [0, 0, 1, 1], col);
          b.quad(tip, [tip[0], tip[1] - 0.05, tip[2]], [tip[0] + px * 0.02, tip[1] - 0.01, tip[2] + pz * 0.02], [tip[0] + px * 0.02, tip[1] + 0.005, tip[2] + pz * 0.02], [0, 0, 1, 1], [0.95, 0.78, 0.12]); }
          tube(b, [[tx, h, tz], [tx, top, tz]], [0.008, 0.005], 4, [0.3, 0.4, 0.15]); } }
      return { c: c.build(), b: b.build() }; };
    const H = mk(true), Lo = mk(false); P.heliconia = { parts: [{ mat: 'banana', hi: H.c, lo: Lo.c }, { mat: 'bloom', hi: H.b, lo: Lo.b }], h: 1.6, r: 0.75 }; }
  { // sansevieria (snake plant / niyanda): stiff upright sword leaves in a fan, dark green with grey-green cross bands and yellow margins
    const mk = (hi) => { const r = new RNG(981), b = new MeshBuilder(); const n = hi ? 18 : 9;
      for (let k = 0; k < n; k++) { const a = r.next() * 6.28, off = r.range(0, 0.16), h = r.range(0.45, 0.85), lean = r.range(0.04, 0.2); const bx = Math.cos(a) * off, bz = Math.sin(a) * off; const tw = r.range(0, 3.14);
        const f = (t) => [bx + Math.cos(a) * lean * t * t, h * t, bz + Math.sin(a) * lean * t * t]; const side = [Math.cos(tw), Math.sin(tw)];
        blade(b, f, side, (t) => 0.035 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.88)), 0.5) * (1 - 0.7 * t * t), hi ? 6 : 3, (t, e) => { const band = Math.sin(t * 38 + k) > 0.3; const g = band ? [0.36, 0.48, 0.3] : [0.13, 0.26, 0.11]; return e > 0.5 && hi ? [g[0] * 0.6 + 0.36, g[1] * 0.6 + 0.32, 0.09] : g; }, 0.08); }
      return b.build(); };
    P.sansevieria = { parts: [{ mat: 'bloom', hi: mk(true), lo: mk(false) }], h: 0.8, r: 0.35 }; }
  { // alocasia / elephant ear (gahala): huge glossy arrow-heart leaves held out on long petioles, pale veins on dark green
    const mk = (hi) => { const r = new RNG(991), b = new MeshBuilder(); const n = hi ? 6 : 4;
      for (let k = 0; k < n; k++) { const a = k / n * 6.28 + r.range(-0.3, 0.3), len = r.range(0.6, 1.0), dx = Math.cos(a), dz = Math.sin(a); const tip = [dx * len * 0.55, len * 0.95, dz * len * 0.55];
        tube(b, [[0, -0.05, 0], [dx * len * 0.2, len * 0.6, dz * len * 0.2], tip], [0.025, 0.02, 0.012], hi ? 5 : 4, [0.4, 0.5, 0.25]);
        const L = r.range(0.42, 0.6), W = L * 0.42, down = r.range(0.55, 0.85); const fx = dx * Math.cos(down), fy = -Math.sin(down) * 0.6 + 0.15, fz = dz * Math.cos(down); const sx = -dz, sz = dx; const seg = hi ? 6 : 3;
        // the blade: lobed heart — width profile peaks just past the petiole join; two lobes run back past it; cupped (edges lower)
        const pt = (t, e) => { const w = t < 0 ? W * (0.6 + t * 1.6) : W * Math.sin(Math.PI * (0.3 + t * 0.7)) ** 0.8 * (1 - t * 0.25); return [tip[0] + fx * L * t + sx * w * e, tip[1] + fy * L * t - Math.abs(e) * w * 0.25 - t * t * 0.12, tip[2] + fz * L * t + sz * w * e]; };
        for (let q = -2; q < seg; q++) { const t0 = q / seg * (q < 0 ? 0.15 : 1), t1 = (q + 1) / seg * (q + 1 < 0 ? 0.15 : 1); const ta = q < 0 ? -0.25 + (q + 2) * 0.125 : t0, tb = q < 0 ? -0.25 + (q + 3) * 0.125 : t1;
          for (const e of [-1, 1]) { const c0 = [0.42, 0.6, 0.32], c1 = [0.1, 0.26, 0.09]; const vein = (q + 2) % 2 ? 1 : 0.85;
            if (e < 0) b.quad(pt(ta, -1), pt(ta, 0), pt(tb, 0), pt(tb, -1), [0, 0, 1, 1], c1.map((v) => v * vein)); else b.quad(pt(ta, 0), pt(ta, 1), pt(tb, 1), pt(tb, 0), [0, 0, 1, 1], c1.map((v) => v * vein));
            b.quad(pt(ta, -0.04), pt(ta, 0.04), pt(tb, 0.04), pt(tb, -0.04), [0, 0, 1, 1], c0); } } } // midrib
      return b.build(); };
    P.alocasia = { parts: [{ mat: 'bloom', hi: mk(true), lo: mk(false) }], h: 1.2, r: 0.85 }; }
  { // cordyline (ti plant / red dracaena): one to three thin canes with a tuft of long burgundy-pink leaves at the top
    const mk = (hi) => { const r = new RNG(1001), b = new MeshBuilder(); const nC = 3;
      for (let s = 0; s < nC; s++) { const a = s / nC * 6.28 + r.range(-0.4, 0.4), h = r.range(0.7, 1.5), lean = r.range(0.05, 0.25); const top = [Math.cos(a) * lean, h, Math.sin(a) * lean];
        tube(b, [[0, -0.05, 0], V([0, 0, 0], top, 0.5), top], [0.022, 0.018, 0.014], hi ? 5 : 4, [0.42, 0.32, 0.26]);
        const n = hi ? 16 : 7; for (let k = 0; k < n; k++) { const fa = k * 2.4 + r.range(-0.2, 0.2), el = r.range(-0.2, 1.1), len = r.range(0.35, 0.5); const dx = Math.cos(fa), dz = Math.sin(fa);
          const f = (t) => [top[0] + dx * len * t * Math.cos(el * 0.6), top[1] + Math.sin(el) * len * t * 0.8 - 0.25 * t * t * (1.2 - el * 0.5), top[2] + dz * len * t * Math.cos(el * 0.6)];
          const pink = r.chance(0.35); blade(b, f, [-dz, dx], (t) => 0.045 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.92)), hi ? 4 : 2, (t, e) => (pink ? [0.72, 0.2, 0.36] : [0.38, 0.06, 0.13]).map((q) => q * (0.85 + 0.25 * e) * (0.9 + 0.2 * t)), 0.12); } }
      return b.build(); };
    P.cordyline = { parts: [{ mat: 'bloom', hi: mk(true), lo: mk(false) }], h: 1.7, r: 0.6 }; }
  { // pandanus (screw pine / weta keyiya): a short trunk on angled stilt roots, crowned with a spiral of long arching strap leaves
    const mk = (hi) => { const r = new RNG(1011), b = new MeshBuilder(); const H = 0.95;
      tube(b, [[0, 0.25, 0], [0.04, H * 0.6, 0.02], [0.06, H, 0.03]], [0.07, 0.06, 0.05], hi ? 7 : 5, [0.5, 0.44, 0.36]);
      for (let k = 0; k < (hi ? 5 : 3); k++) { const a = k / 5 * 6.28 + r.range(-0.3, 0.3); tube(b, [[0.02, 0.45, 0.01], [Math.cos(a) * 0.18, 0.2, Math.sin(a) * 0.18], [Math.cos(a) * 0.3, -0.05, Math.sin(a) * 0.3]], [0.025, 0.022, 0.03], 4, [0.55, 0.47, 0.36]); } // stilt roots
      const top = [0.06, H, 0.03]; const n = hi ? 26 : 12;
      for (let k = 0; k < n; k++) { const fa = k * 2.4, el = 0.4 + (k % 4) * 0.25 + r.range(-0.1, 0.1), len = r.range(0.9, 1.35); const dx = Math.cos(fa), dz = Math.sin(fa);
        const f = (t) => [top[0] + dx * len * t * 0.8, top[1] + Math.sin(el) * len * t * 0.9 - len * 0.75 * t * t, top[2] + dz * len * t * 0.8];
        blade(b, f, [-dz, dx], (t) => 0.04 * (1 - t * 0.85), hi ? 5 : 3, (t, e) => (t > 0.8 ? [0.6, 0.55, 0.3] : [0.24, 0.4, 0.17]).map((q) => q * (0.85 + 0.2 * e)), 0.35); }
      return b.build(); };
    P.pandanus = { parts: [{ mat: 'bloom', hi: mk(true), lo: mk(false) }], h: 1.8, r: 1.1 }; }
  } finally { CUR = prevC; } const out = P; P = prevP; return out;
}
