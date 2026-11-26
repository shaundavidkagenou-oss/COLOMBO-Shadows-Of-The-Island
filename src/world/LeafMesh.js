// 95th — real leaf geometry from the user's leaf atlas (public/assets/vegetation/T_Ironwood_Leaves_BaseColor.jpg, 4 × 2
// single leaves on black, "Tree leaves" in Texture Studio).
//
// The 88th crowns were alpha-tested CARDS with a sprig of leaves painted over each card by the fragment shader ("texture
// bombing"): cheap in vertices but ~6 cards deep on screen, every hidden layer running a 4-candidate leaf search, and up close
// the cards still read as flat planes. Here every leaf is its own small piece of geometry carrying exactly ONE atlas tile:
//   • leaf = a strip along its midrib from the stem (bottom of the tile) to the tip (top): near LOD 4 rows (8 vertices, 6
//     triangles) shaped as an octagon hugging the leaf silhouette (measured from the image: every tile's blade lies inside
//     v 0.03–0.97 and the half-widths below), so ~67 % of the fragments it covers are leaf (a rectangle: 54 %); the two
//     inner rows bend the blade (drooping tip), the vertex normals cup it across the midrib; the medium / far LODs use one
//     quad (4 vertices, 2 triangles) per leaf;
//   • the texture coordinates ARE atlas coordinates (tile + position in the tile), so any normal / roughness / AO map the
//     user adds to "Tree leaves" in Texture Studio samples the very same leaf, texel for texel (stock three.js map sampling);
//   • leaves sit on twigs in alternate / pinnate / rosette arrangements (golden-angle phyllotaxis), angled off the twig,
//     drooping with gravity, blades turned toward the light, sizes shrinking toward the twig tip; twigs radiate out of the
//     crown's clumps, so a crown has depth (gaps show inner leaves and shade, never a flat green wall);
//   • per leaf: its tile (mostly healthy greens, a species share of yellowed / dry / torn / skeleton ones), mirror, size,
//     tint and baked ambient occlusion (darker deep inside the crown and on the underside).
// Wind data rides in the integer part of the uv (no extra vertex attribute — the geometry workers, MeshBuilder pools and
// BatchedMeshes keep their 4 attributes): uv = atlasUV + 2 × (A, B), A = flexibility (6 bits) | seed high (4 bits),
// B = leaf length code (7 bits, 3 cm × 1.045^code) | seed low (3 bits). The vertex shader recovers the tile-local (u, v) —
// v × length is the distance from the stem — so a leaf flutters by turning about its stem (displacement ∝ distance from
// the stem: never stretched) while its branch carries it (Vegetation.js).
import * as THREE from 'three';

// which foliage build the game uses (Settings 'leafMesh', applied by Materials at load): true = leaf geometry (this file),
// false = the 88th texture-bombed leaf cards (LeafAtlas.js) — kept for comparison / old machines
let MESH = true;
export function setLeafMesh(on) { MESH = on !== false; }
export function leafMeshOn() { return MESH; }

// atlas tiles (column, row from the bottom): 0 healthy, 1 scuffed, 2 yellow-green, 3 yellow spotted, 4 torn, 5 holed,
// 6 brown dry, 7 skeleton
const TILE = [[0, 1], [1, 1], [2, 1], [3, 1], [0, 0], [1, 0], [2, 0], [3, 0]];
export function pickTile(rng, aged) {
  const r = rng.next();
  if (rng.next() < aged) return r < 0.55 ? 3 : r < 0.88 ? 6 : 7;
  return r < 0.44 ? 0 : r < 0.68 ? 1 : r < 0.82 ? 4 : r < 0.92 ? 5 : 2;
}
// leaf outline in tile space (measured, see header): rows at v, half-width at each row (of the tile's width)
const OCT_V = [0.03, 0.3, 0.7, 0.97], OCT_W = [0.21, 0.46, 0.46, 0.12];
const QUAD_V = [0.03, 0.97], QUAD_W = [0.46, 0.46];
const LN_STEP = Math.log(1.045);
export const lenCode = (L) => Math.max(0, Math.min(127, Math.round(Math.log(Math.max(0.03, L) / 0.03) / LN_STEP)));

const _D = new THREE.Vector3(), _N = new THREE.Vector3(), _W = new THREE.Vector3(), _P = new THREE.Vector3(), _R = new THREE.Vector3(), _n = new THREE.Vector3();
/**
 * Write one leaf into a MeshBuilder.
 * S stem point, D unit direction stem → tip, N unit blade normal (⊥ D), L tile length (m; the blade is 0.94 L long),
 * o: { wk width factor (1 = the photo's own proportions), tile 0..7, flip, bend (tip droop, × L), cup (normal spread across),
 *      col [r,g,b], cn crown normal [x,y,z] | null, kc crown-normal blend 0..1, flex 0..1, seed 0..127, quad (2-triangle LOD) }
 */
export function writeLeaf(mb, S, D, N, L, o) {
  _D.copy(D); _N.copy(N); _W.crossVectors(_D, _N); // u runs along W
  const rows = o.quad ? QUAD_V : OCT_V, hws = o.quad ? QUAD_W : OCT_W; const Wt = L * 0.5 * (o.wk ?? 1); // the tile is 1 : 2
  const [tc, tr] = TILE[o.tile | 0]; const flip = !!o.flip; const bend = o.bend ?? 0.12, cup = o.cup ?? 0.35, kc = o.kc ?? 0.4;
  const seed = (o.seed | 0) & 127; const A = (Math.max(0, Math.min(63, Math.round((o.flex ?? 0) * 63)))) | ((seed >> 3) << 6), B = lenCode(L) | ((seed & 7) << 7);
  const col = o.col, cn = o.cn; const base = mb.vcount;
  for (let r = 0; r < rows.length; r++) {
    const v = rows[r], t = (v - 0.03) / 0.94, hw = hws[r] * Wt * 2;
    // centre line: along D, drooping along −N by bend·L·t² (tangent / normal follow the curve)
    _P.copy(S).addScaledVector(_D, t * L * 0.94).addScaledVector(_N, -bend * L * t * t);
    _R.copy(_N).addScaledVector(_D, 2 * bend * t).normalize(); // row normal (⊥ the bent midrib)
    for (let side = 0; side < 2; side++) { const sg = side ? 1 : -1;
      const x = _P.x + _W.x * sg * hw, y = _P.y + _W.y * sg * hw, z = _P.z + _W.z * sg * hw;
      _n.copy(_R).addScaledVector(_W, sg * cup).normalize(); if (cn) { _n.multiplyScalar(1 - kc); _n.x += cn[0] * kc; _n.y += cn[1] * kc; _n.z += cn[2] * kc; _n.normalize(); }
      const tu = 0.5 + sg * hws[r] * (flip ? -1 : 1);
      const au = (tc + tu) * 0.25 + 2 * A, av = (tr + v) * 0.5 + 2 * B;
      mb.pos.push(x, y, z); mb.nor.push(_n.x, _n.y, _n.z); mb.uv.push(au, av); mb.col.push(col[0], col[1], col[2]); }
  }
  for (let r = 0; r + 1 < rows.length; r++) { const a = base + r * 2, b = a + 1, c = a + 3, d = a + 2; mb.idx.push(a, b, c, a, c, d); }
}

// ---------------------------------------------------------------------------------------------------------- arrangements
const UP = new THREE.Vector3(0, 1, 0);
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _q = new THREE.Vector3(), _o = new THREE.Vector3(), _dl = new THREE.Vector3(), _nl = new THREE.Vector3(), _up = new THREE.Vector3();
function perp(d, out1, out2) { const h = Math.abs(d.y) < 0.9 ? UP : _q.set(1, 0, 0); out1.crossVectors(d, h).normalize(); out2.crossVectors(d, out1).normalize(); }
function randUnit(rng, out) { const u = rng.next() * Math.PI * 2, v = Math.acos(1 - 2 * rng.next()); return out.set(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)); }
// a blade normal for leaf direction D that faces the light (up, a little outward) with a random roll
function bladeNormal(D, out, rng, outward, lift = 0.75, roll = 0.4) {
  _up.set(outward.x * 0.45, lift, outward.z * 0.45).addScaledVector(randUnit(rng, _q), 0.28).normalize();
  out.copy(_up).addScaledVector(D, -_up.dot(D)); if (out.lengthSq() < 1e-4) { perp(D, out, _q); } out.normalize();
  const a = rng.range(-roll, roll); if (a) { _q.crossVectors(D, out); out.multiplyScalar(Math.cos(a)).addScaledVector(_q, Math.sin(a)).normalize(); }
  return out;
}
/**
 * The leaves of one plant, generated ONCE (the near LOD's full set) as plain records; every LOD is written from them
 * (writeLeaves), so the far crowns keep the near crown's structure and silhouette.
 * rec: { s:[x,y,z] stem, d:[..] dir, n:[..] blade normal, L, wk, tile, flip, bend, cup, col, cn, flex, seed, out (0 inner … 1 outer), c:[..] centre }
 */
export class LeafSet {
  constructor() { this.L = []; this.twigs = []; }
  add(S, D, N, L, p) { const c = [S.x + D.x * L * 0.47, S.y + D.y * L * 0.47, S.z + D.z * L * 0.47]; this.L.push({ s: [S.x, S.y, S.z], d: [D.x, D.y, D.z], n: [N.x, N.y, N.z], L, c, ...p }); }
}
const _S = new THREE.Vector3(), _Dv = new THREE.Vector3(), _Nv = new THREE.Vector3(), _C = new THREE.Vector3(), _Cn = new THREE.Vector3();
// LOD table: [share of the leaves kept, size factor (keeps the covered area ≈ constant), quad, crown-normal blend]
// near leaves are flat quads (the alpha cut is the leaf's real outline; 2 triangles buy ~3× the leaves of the 6-triangle
// curved octagon) — only big blades (≥ OCT_MIN m: frangipani, almond, broad nuga leaves) keep the curved octagon up close
// far bands keep fewer, bigger blades and slightly MORE cover (keep·size² 1.09 / 1.18 / 1.26): ~30 % fewer triangles than the
// first cut and crowns that stay full at 100 m+ instead of thinning out (park-wide bench: 0.75 M → see tools/veg-bench.mjs)
export const LEAF_LODS = [[1, 1, false, 0.42], [0.15, 2.7, true, 0.58], [0.042, 5.3, true, 0.74], [0.014, 9.5, true, 0.86]];
const OCT_MIN = 0.5;
// crown density (95th review: a projected leaf cover of ~1 is only ~40 % opaque with randomly turned leaves — the crowns read as
// bare branches): every species gets 1.5× the twigs, 1.45× the leaves per twig and 1.35× the leaf size → ~4× the cover
const DENS_T = 1.5, DENS_L = 1.45, SIZE_K = 1.35;
/** write a LeafSet's leaves for LOD lv (0 near … 3 very far) into mb. centre: the clump / crown centre used to pull grown leaves inward */
export function writeLeaves(mb, set, lv, opts = {}) {
  const [keep, k, quad, kc] = opts.lod || LEAF_LODS[lv]; let n = 0;
  for (let i = 0; i < set.L.length; i++) { const r = set.L[i];
    if (keep < 1) { const h = ((i * 2654435761) >>> 0) / 4294967296; const w = keep * (lv >= 2 ? 0.55 + 0.9 * (r.out ?? 0.5) : 1); if (h >= w) continue; } // far LODs favour the outer leaves (the inner ones are hidden)
    const L = r.L * k; _Dv.fromArray(r.d); _Nv.fromArray(r.n);
    if (k > 1) { // grown about the leaf's centre, pulled in toward its clump so the silhouette keeps its size
      _C.fromArray(r.c); if (r.cc) _C.lerp(_S.fromArray(r.cc), Math.min(0.5, (k - 1) * 0.09)); _S.copy(_C).addScaledVector(_Dv, -L * 0.47);
      // big far leaves lie flatter to the crown surface (read as foliage masses, not edge-on slivers)
      if (r.cn && lv >= 2) { _Cn.fromArray(r.cn); _Nv.lerp(_Cn, 0.45); _Nv.addScaledVector(_Dv, -_Nv.dot(_Dv)); if (_Nv.lengthSq() < 1e-4) _Nv.fromArray(r.n); _Nv.normalize(); }
    } else _S.fromArray(r.s);
    const qd = quad || r.L < OCT_MIN; writeLeaf(mb, _S, _Dv, _Nv, L, { wk: r.wk, tile: r.tile, flip: r.flip, bend: qd ? 0 : r.bend, cup: r.cup * (qd ? 0.6 : 1), col: r.col, cn: r.cn, kc, flex: r.flex, seed: r.seed, quad: qd }); n++; }
  return n;
}

/**
 * Twigged clusters for a crown made of clumps (broadleaf trees, the kottamba's branch pads, the ashoka's curtains).
 * o: crown { cx, cy, cz, rx, ry, rz, ax?, az? (trunk axis), tint, cardTint? }
 * C: clumps [{ x, y, z, r, rv, tint }]
 * P: species leaf parameters { len (tile length, m), wk, twigs (per clump of radius 1 m², scaled by clump size), perTwig,
 *    aged, layout 'alt' | 'pinnate' | 'rosette', droop, lift (how strongly blades face up), spread (angle off the twig), flat }
 */
export function clusterLeaves(set, o, C, rng, P) {
  const R0 = o.rx || 4.5; const lay = P.layout || 'alt';
  for (const c of C) {
    _o.set(c.x - o.cx, (c.y - o.cy) * 0.6, c.z - o.cz); if (_o.lengthSq() < 1e-6) _o.set(0, 1, 0); _o.normalize(); const out = _o.clone();
    const nT = Math.max(2, Math.round((P.twigs ?? 6) * DENS_T * Math.min(2.2, Math.max(0.5, (c.r * c.rv) / (P.twigRef ?? 1.6))) * rng.range(0.85, 1.15)));
    for (let t = 0; t < nT; t++) {
      // twig: from inside the clump (inner side) out toward / past its surface, mostly outward and up
      const B = new THREE.Vector3(c.x, c.y, c.z).add(randUnit(rng, _t1).multiply(_t2.set(c.r, c.rv, c.r)).multiplyScalar(0.35 * Math.cbrt(rng.next()))).addScaledVector(out, -c.r * 0.22);
      const Dt = randUnit(rng, new THREE.Vector3()).multiplyScalar(0.62).addScaledVector(out, 0.62).addScaledVector(UP, P.twigUp ?? 0.3); if (Dt.dot(out) < -0.1) Dt.addScaledVector(out, 0.8); Dt.normalize();
      let len = Math.max(c.r, c.rv) * rng.range(0.6, 1.0) * (P.twigLen ?? 1);
      for (let it = 0; it < 4; it++) { _q.copy(B).addScaledVector(Dt, len).sub(_t2.set(c.x, c.y, c.z)); const e = Math.hypot(_q.x / c.r, _q.y / c.rv, _q.z / c.r); if (e <= 1.08) break; len *= 0.8; }
      const E = B.clone().addScaledVector(Dt, len); set.twigs.push([B.x, B.y, B.z, E.x, E.y, E.z]);
      perp(Dt, _t1, _t2); const ph0 = rng.next() * 6.283;
      const n = Math.max(lay === 'rosette' ? 5 : 3, Math.round((P.perTwig ?? 9) * DENS_L * rng.range(0.8, 1.2)));
      for (let k = 0; k < n; k++) {
        let tt, Dl, side = 0; const Sv = new THREE.Vector3();
        if (lay === 'rosette') { tt = 0.92 + 0.08 * rng.next(); const a = ph0 + k * 2.39996; _dl.copy(_t1).multiplyScalar(Math.cos(a)).addScaledVector(_t2, Math.sin(a)); Dl = _dl.multiplyScalar(0.9).addScaledVector(Dt, rng.range(0.25, 0.6)); }
        else if (lay === 'pinnate') { tt = 0.12 + 0.88 * ((k >> 1) + 0.5) / Math.ceil(n / 2); side = k & 1 ? 1 : -1; // opposite leaflets on a rachis: the horizontal-ish perpendicular
          _dl.crossVectors(Dt, UP); if (_dl.lengthSq() < 1e-3) _dl.copy(_t1); _dl.normalize().multiplyScalar(side); Dl = _dl.addScaledVector(Dt, rng.range(0.25, 0.5)); }
        else { tt = 0.28 + 0.72 * (k + rng.range(0, 0.7)) / n; const a = ph0 + k * 2.39996; const th = (P.spread ?? 0.95) * rng.range(0.75, 1.15) * (1.05 - 0.35 * tt); _dl.copy(_t1).multiplyScalar(Math.cos(a)).addScaledVector(_t2, Math.sin(a)); Dl = _dl.multiplyScalar(Math.sin(th)).addScaledVector(Dt, Math.cos(th)); }
        Sv.copy(B).addScaledVector(Dt, len * tt);
        Dl.y -= (P.droop ?? 0.25) * rng.range(0.3, 1.2); Dl.normalize();
        bladeNormal(Dl, _nl, rng, out, P.lift ?? 0.75, P.roll ?? 0.45);
        const size = (P.len ?? 0.4) * SIZE_K * rng.range(0.78, 1.18) * (lay === 'rosette' ? 1 : 1.08 - 0.32 * tt * tt);
        set.add(Sv, Dl, _nl, size, leafProps(o, c, Sv, out, rng, P, R0));
      }
      if (lay === 'alt' && rng.chance(0.75)) { // the twig's terminal leaf (new growth: smaller, forward, lighter)
        _dl.copy(Dt).addScaledVector(randUnit(rng, _q), 0.25); _dl.y -= (P.droop ?? 0.25) * 0.3; _dl.normalize(); bladeNormal(_dl, _nl, rng, out, P.lift ?? 0.75, P.roll ?? 0.45);
        const p = leafProps(o, c, E, out, rng, P, R0); p.col = p.col.map((q, i) => q * [1.12, 1.12, 0.92][i]); set.add(E, _dl, _nl, (P.len ?? 0.4) * SIZE_K * rng.range(0.6, 0.8), p); }
    }
  }
}
function leafProps(o, c, S, out, rng, P, R0) {
  // ambient occlusion (vertex colour): outer / upper leaves lit, the inside of the clump and the crown's underside darker
  const ox = S.x - c.x, oy = S.y - c.y, oz = S.z - c.z; const ol = Math.hypot(ox, oy, oz) || 1;
  const cl = Math.max(0, Math.min(1, 0.5 + 0.5 * (ox * out.x + oy * out.y + oz * out.z) / ol)); // outward side of the clump
  const up = Math.max(0, Math.min(1, (S.y - (o.cy - o.ry)) / (2 * o.ry)));
  const ex = (S.x - o.cx) / (o.rx || 1), ey = (S.y - o.cy) / (o.ry || 1), ez = (S.z - o.cz) / (o.rz || o.rx || 1); const depth = Math.max(0, Math.min(1, Math.hypot(ex, ey, ez))); // 0 crown centre … 1 surface
  const ao = 0.5 + 0.5 * (0.4 * cl + 0.3 * up + 0.3 * depth);
  let t = o.tint.map((q) => q * (c.tint ?? 1) * ao * rng.range(0.9, 1.08)); if (o.cardTint) { const k = o.cardTint(rng, c); t = t.map((q, i) => q * k[i]); }
  // crown normal for soft lighting: crown dome blended with the clump's
  const ax = S.x - o.cx, ay = (S.y - o.cy) * 1.3 + o.ry * 0.4, az = S.z - o.cz, al = Math.hypot(ax, ay, az) || 1; const bl = ol;
  let nx = 0.55 * ax / al + 0.45 * ox / bl, ny = 0.55 * ay / al + 0.45 * (oy + (c.rv ?? 1) * 0.3) / bl + 0.15, nz = 0.55 * az / al + 0.45 * oz / bl; const nl = Math.hypot(nx, ny, nz) || 1;
  const dh = Math.hypot(S.x - (o.ax ?? o.cx), S.z - (o.az ?? o.cz)); const flex = Math.min(1, 0.15 + 0.7 * Math.min(1, dh / R0) + 0.15 * up);
  return { wk: (P.wk ?? 1) * rng.range(0.88, 1.12), tile: pickTile(rng, P.aged ?? 0.04), flip: rng.chance(0.5), bend: rng.range(0.05, 0.2) * (P.bendK ?? 1), cup: rng.range(0.2, 0.45),
    col: t, cn: [nx / nl, ny / nl, nz / nl], flex, seed: (rng.next() * 128) | 0, out: depth * 0.6 + cl * 0.4, cc: [c.x, c.y, c.z] };
}
/** leaves of a shrub: stems from the root fan out to a dome (o: { r, h }), leaves along their outer part */
export function shrubLeaves(set, o, rng, P) {
  const nS = Math.max(4, Math.round(P.stems ?? 14)); const R0 = Math.max(o.r, 0.3); const crown = { cx: 0, cy: o.h * 0.5, cz: 0, rx: o.r, ry: o.h * 0.5, rz: o.r, tint: [1, 1, 1] };
  for (let s = 0; s < nS; s++) {
    const u = rng.next() * 6.283, v = Math.acos(1 - rng.next() * 1.3); const dx = Math.sin(v) * Math.cos(u), dy = Math.cos(v), dz = Math.sin(v) * Math.sin(u);
    const f = 0.7 + 0.35 * Math.sqrt(rng.next()); const E = new THREE.Vector3(dx * o.r * f, Math.max(0.12, o.h * 0.5 + dy * o.h * 0.5 * f), dz * o.r * f);
    const B = new THREE.Vector3(dx * o.r * 0.12, 0.03, dz * o.r * 0.12); const Dt = E.clone().sub(B); const len = Dt.length(); Dt.normalize(); set.twigs.push([B.x, B.y, B.z, E.x, E.y, E.z]);
    const out = new THREE.Vector3(dx, dy * 0.6 + 0.2, dz).normalize(); perp(Dt, _t1, _t2); const ph0 = rng.next() * 6.283;
    const n = Math.max(3, Math.round((P.perStem ?? 12) * 1.4 * rng.range(0.8, 1.2))); // 95th: denser (quads up close make it affordable)
    for (let k = 0; k < n; k++) { const tt = 0.38 + 0.62 * (k + rng.range(0, 0.8)) / n; const a = ph0 + k * 2.39996; const th = (P.spread ?? 1.0) * rng.range(0.8, 1.15);
      const Sv = B.clone().addScaledVector(Dt, len * tt); _dl.copy(_t1).multiplyScalar(Math.cos(a)).addScaledVector(_t2, Math.sin(a)).multiplyScalar(Math.sin(th)).addScaledVector(Dt, Math.cos(th));
      _dl.y -= (P.droop ?? 0.2) * rng.range(0.2, 1); _dl.normalize(); bladeNormal(_dl, _nl, rng, out, P.lift ?? 0.7, 0.5);
      const c = { x: Sv.x, y: Sv.y, z: Sv.z, r: o.r, rv: o.h * 0.5, tint: 1 }; const p = leafProps(crown, { x: 0, y: o.h * 0.45, z: 0, rv: o.h * 0.5, tint: 1 }, Sv, out, rng, P, R0); void c;
      p.col = P.col(rng).map((q, i) => q * (p.col[i])); p.flex = Math.min(1, 0.25 + 0.75 * Sv.y / o.h); p.cc = [0, o.h * 0.5, 0];
      set.add(Sv, _dl, _nl, (P.len ?? 0.18) * rng.range(0.8, 1.2) * (1.1 - 0.3 * tt), p); }
  }
}
/** a short sprig lying on a surface (clipped hedges, topiary balls): p centre, n outward normal (unit array), leaf size s (m) */
export function sprig(mb, p, n, s, rng, col, quad = true) {
  _o.set(n[0], n[1], n[2]); perp(_o, _t1, _t2); const a = rng.next() * 6.283; const Dt = _t1.clone().multiplyScalar(Math.cos(a)).addScaledVector(_t2, Math.sin(a)).addScaledVector(_o, 0.25).normalize();
  const B = new THREE.Vector3(p[0], p[1], p[2]).addScaledVector(_o, -0.03).addScaledVector(Dt, -s * 0.6); const n0 = 3 + (rng.next() < 0.4 ? 1 : 0); s *= 1.4; /* 95th memory review: hedge shells are merged per bush — 3–4 bigger leaves per sprig (≈ the cover of 7, half the vertices; the hedge body is solid behind them) */ const ph0 = rng.next() * 6.283; perp(Dt, _C, _Cn);
  for (let k = 0; k < n0; k++) { const tt = (k + 0.5) / n0; const aa = ph0 + k * 2.39996; const th = rng.range(0.7, 1.1);
    const S = B.clone().addScaledVector(Dt, s * 1.2 * tt); _dl.copy(_C).multiplyScalar(Math.cos(aa)).addScaledVector(_Cn, Math.sin(aa)).multiplyScalar(Math.sin(th)).addScaledVector(Dt, Math.cos(th));
    _dl.addScaledVector(_o, 0.35 - _dl.dot(_o)).normalize(); // lying along the surface, tips a little out
    bladeNormal(_dl, _nl, rng, _o, 0.2, 0.5); _nl.addScaledVector(_o, 0.8); _nl.addScaledVector(_dl, -_nl.dot(_dl)).normalize();
    const c = col.map((q) => q * rng.range(0.9, 1.08)); const tile = pickTile(rng, 0.03);
    writeLeaf(mb, S, _dl, _nl, s * rng.range(0.8, 1.15), { wk: rng.range(0.85, 1.1), tile, flip: rng.chance(0.5), bend: quad ? 0 : 0.1, cup: 0.3, col: c, cn: n, kc: 0.55, flex: 0.2, seed: (rng.next() * 128) | 0, quad }); }
}

// ---------------------------------------------------------------------------------------------------------- GLSL
// decode (vertex shader, after begin_vertex): lmAt atlas uv · lmT tile-local (u, v) · lmLen tile length (m) · lmFlex · lmSeed
export const LEAF_MESH_DECODE = `
  vec2 lmQ = floor(uv * 0.5); vec2 lmAt = uv - 2.0 * lmQ;
  float lmFlex = mod(lmQ.x, 64.0) / 63.0;
  float lmSeed = (floor(lmQ.x / 64.0) * 8.0 + floor(lmQ.y / 128.0) + 0.5) / 128.0;
  float lmLen = 0.03 * exp(mod(lmQ.y, 128.0) * ${LN_STEP.toFixed(6)});
  vec2 lmT = fract(lmAt * vec2(4.0, 2.0));
`;
// every texture lookup of the material reads the atlas uv (map, normalMap, roughnessMap, aoMap … all line up leaf for leaf)
export function leafMeshUv(vs) {
  return vs.replace('#include <uv_vertex>', 'vec2 lmAtlasUv = uv - 2.0 * floor(uv * 0.5);\n#define uv lmAtlasUv\n#include <uv_vertex>\n#undef uv');
}
// shadow-map material for leaf geometry: stock depth + the atlas uv (map / alphaTest / side are filled in from the caster's
// material by three each pass)
export class LeafMeshDepthMaterial extends THREE.MeshDepthMaterial {
  constructor(p) { super(p); this.name = 'leafMeshDepth'; }
  onBeforeCompile(sh) { sh.vertexShader = leafMeshUv(sh.vertexShader); }
  customProgramCacheKey() { return 'leafMeshDepth95'; }
}
let _depth = null;
export function leafMeshDepth() { return _depth || (_depth = new LeafMeshDepthMaterial()); }
