// Modelled floors: every tile / bay / slab / board is a real chamfered solid laid over a recessed grout bed, instead of a
// flat plane with joints painted into a texture. Up close the joints are actual gaps that catch light and shadow, each
// piece has its own tone and a fraction of a millimetre of lippage, and polished pieces reflect with broken highlights
// at every edge — the way a real red-oxide, terrazzo, glazed-tile or timber floor reads.
//
//   modelFloor(spec, x0, z0, x1, z1, y) → THREE.Group   (local coordinates of the caller's room group)
//     spec.kind: 'ceramic' | 'checker' | 'redoxide' | 'terrazzo' | 'wood' | 'granite' | 'concrete'
//     spec.size: piece size (m) — tile edge / bay / slab; wood: board width       spec.len: [min, max] board length
//     spec.colors: base colours (picked per piece, plus tone jitter)              spec.grout: joint colour
//     spec.rough / spec.metal: surface finish                                      spec.along: 'x' | 'z' (boards)
//     spec.seed: layout seed                                                       spec.strip: divider colour (terrazzo)
//
// The tops sit 1.5 mm above `y` (the walk height used by collision), so feet never sink into them; the grout bed is
// 4 mm below. Pieces are GPU-instanced (one draw call per floor + one for the grout + one for divider strips).
import * as THREE from 'three';
import { canvasTex, rnd, speckle, blotches } from './RoomKit.js';

const TOP = 0.0015, BED = -0.004; // piece top / grout bed relative to the walk height

// chamfered slab: w (x) × d (z), top at y = 0, sides down to the bed; top-face uv 0..1 (u along `u` axis)
const GEO = new Map();
function slabGeo(w, d, c, uAlongZ = false) {
  const key = [w, d, c, uAlongZ].join(':'); if (GEO.has(key)) return GEO.get(key);
  const pos = [], nor = [], uv = [], idx = []; const hw = w / 2, hd = d / 2, yb = BED - TOP - 0.001, yc = -Math.min(c, 0.004) * 0.8;
  const quad = (a, b, cc, dd, n, uvs) => { const i = pos.length / 3; for (const p of [a, b, cc, dd]) pos.push(...p); for (let k = 0; k < 4; k++) nor.push(...n); uv.push(...uvs); idx.push(i, i + 1, i + 2, i, i + 2, i + 3); };
  const U = (x, z) => uAlongZ ? [(z + hd) / d, (x + hw) / w] : [(x + hw) / w, (z + hd) / d];
  // top (counter-clockwise seen from above → normal +y)
  const t = [[-hw + c, 0, hd - c], [hw - c, 0, hd - c], [hw - c, 0, -hd + c], [-hw + c, 0, -hd + c]];
  quad(t[0], t[1], t[2], t[3], [0, 1, 0], t.flatMap((p) => U(p[0], p[2])));
  // chamfers (45°-ish) and vertical sides, one per edge: +z, +x, −z, −x
  const s = Math.SQRT1_2;
  const edges = [
    { n: [0, s, s], ns: [0, 0, 1], a: [-hw + c, hd - c], b: [hw - c, hd - c], A: [-hw, hd], B: [hw, hd] },
    { n: [s, s, 0], ns: [1, 0, 0], a: [hw - c, hd - c], b: [hw - c, -hd + c], A: [hw, hd], B: [hw, -hd] },
    { n: [0, s, -s], ns: [0, 0, -1], a: [hw - c, -hd + c], b: [-hw + c, -hd + c], A: [hw, -hd], B: [-hw, -hd] },
    { n: [-s, s, 0], ns: [-1, 0, 0], a: [-hw + c, -hd + c], b: [-hw + c, hd - c], A: [-hw, -hd], B: [-hw, hd] }];
  for (const e of edges) {
    const p0 = [e.a[0], 0, e.a[1]], p1 = [e.b[0], 0, e.b[1]], p2 = [e.B[0], yc, e.B[1]], p3 = [e.A[0], yc, e.A[1]];
    quad(p0, p3, p2, p1, e.n, [...U(p0[0], p0[2]), ...U(p3[0], p3[2]), ...U(p2[0], p2[2]), ...U(p1[0], p1[2])]);
    const q0 = [e.A[0], yc, e.A[1]], q1 = [e.B[0], yc, e.B[1]], q2 = [e.B[0], yb, e.B[1]], q3 = [e.A[0], yb, e.A[1]];
    quad(q0, q3, q2, q1, e.ns, [0, 0, 0, 0, 0, 0, 0, 0]);
  }
  // wind every triangle so its face normal agrees with the vertex normal (robust to the edge ordering above)
  for (let i = 0; i < idx.length; i += 3) { const [a, b, cc] = [idx[i], idx[i + 1], idx[i + 2]]; const P = (k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
    const A = P(a), B = P(b), C = P(cc); const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const vn = [nor[a * 3], nor[a * 3 + 1], nor[a * 3 + 2]];
    if (fn[0] * vn[0] + fn[1] * vn[1] + fn[2] * vn[2] < 0) { idx[i + 1] = cc; idx[i + 2] = b; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeBoundingSphere(); GEO.set(key, g); return g;
}

// ---- surface textures: no joints painted in (the joints are geometry); tone variation within a piece only
function surfTex(kind) {
  if (kind === 'redoxide') return canvasTex('fk:redoxide', 512, 512, (a, w, h) => { // trowelled + polished red cement: cloudy, hairline crazing
    a.fillStyle = '#8a3428'; a.fillRect(0, 0, w, h); blotches(a, w, h, 46, 'rgba(60,16,8,0.08)', 25, 110, 21); blotches(a, w, h, 40, 'rgba(205,115,92,0.08)', 15, 80, 22);
    const r = rnd(23); a.strokeStyle = 'rgba(30,6,2,0.28)'; a.lineWidth = 0.7; for (let i = 0; i < 9; i++) { let x = r() * w, y = r() * h; a.beginPath(); a.moveTo(x, y); for (let k = 0; k < 9; k++) { x += (r() - 0.5) * 34; y += (r() - 0.5) * 34; a.lineTo(x, y); } a.stroke(); }
    speckle(a, w, h, 12, 24); }, { repeat: true });
  if (kind === 'terrazzo') return canvasTex('fk:terrazzo', 512, 512, (a, w, h) => { // marble chips in a cement matrix, ground flat
    a.fillStyle = '#c9c1b3'; a.fillRect(0, 0, w, h); const r = rnd(41); const cols = ['#7a7266', '#efe9dc', '#8c5a3c', '#3f3a35', '#a49a88', '#5d6b62', '#d9cdb6'];
    for (let i = 0; i < 3000; i++) { a.fillStyle = cols[Math.floor(r() * cols.length)]; const x = r() * w, y = r() * h, s = 1 + r() * 5; a.beginPath(); for (let k = 0; k < 6; k++) { const an = k / 6 * Math.PI * 2 + r(); a.lineTo(x + Math.cos(an) * s * (0.6 + r() * 0.6), y + Math.sin(an) * s * (0.6 + r() * 0.6)); } a.fill(); }
    speckle(a, w, h, 8, 42); }, { repeat: true });
  if (kind === 'wood') return canvasTex('fk:wood', 1024, 256, (a, w, h) => { // grain along u (board length): growth lines, rays, a knot
    const r = rnd(5); a.fillStyle = '#8a5a34'; a.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { const y0 = r() * h, amp = 1 + r() * 5, fr = 0.002 + r() * 0.006, ph = r() * 6; a.strokeStyle = r() < 0.6 ? '#4a2a14' : '#b07a4a'; a.globalAlpha = 0.05 + r() * 0.2; a.lineWidth = 0.5 + r() * 2; a.beginPath(); for (let x = 0; x <= w; x += 8) a.lineTo(x, y0 + Math.sin(x * fr + ph) * amp); a.stroke(); }
    a.globalAlpha = 1; for (let k = 0; k < 2; k++) { const x = r() * w, y = r() * h; for (let j = 7; j > 0; j--) { a.strokeStyle = '#3a1e0c'; a.globalAlpha = 0.14; a.lineWidth = 1.1; a.beginPath(); a.ellipse(x, y, j * 6, j * 2, 0, 0, Math.PI * 2); a.stroke(); } a.globalAlpha = 0.5; a.fillStyle = '#2a1408'; a.beginPath(); a.ellipse(x, y, 4, 2, 0, 0, Math.PI * 2); a.fill(); }
    a.globalAlpha = 1; speckle(a, w, h, 10, 6); }, { repeat: true });
  if (kind === 'granite') return canvasTex('fk:granite', 512, 512, (a, w, h) => { // polished granite: feldspar / quartz / mica grains
    a.fillStyle = '#6e6a66'; a.fillRect(0, 0, w, h); const r = rnd(61); const cols = ['#2a2826', '#9a948c', '#c8c0b4', '#4a4440', '#8a7a6a', '#1a1816'];
    for (let i = 0; i < 9000; i++) { a.fillStyle = cols[Math.floor(r() * cols.length)]; a.globalAlpha = 0.5 + r() * 0.5; const x = r() * w, y = r() * h, s = 0.6 + r() * 2.6; a.fillRect(x, y, s, s * (0.5 + r())); }
    a.globalAlpha = 1; speckle(a, w, h, 10, 62); }, { repeat: true });
  if (kind === 'concrete') return canvasTex('fk:concrete', 512, 512, (a, w, h) => { // power-floated concrete: trowel swirls, aggregate pops, oil
    a.fillStyle = '#9d9a94'; a.fillRect(0, 0, w, h); blotches(a, w, h, 50, 'rgba(60,58,54,0.08)', 20, 120, 71); blotches(a, w, h, 30, 'rgba(255,255,250,0.06)', 15, 70, 72);
    const r = rnd(73); a.strokeStyle = 'rgba(255,255,255,0.05)'; a.lineWidth = 6; for (let i = 0; i < 30; i++) { a.beginPath(); a.arc(r() * w, r() * h, 20 + r() * 60, r() * 6, r() * 6 + 1.5); a.stroke(); }
    for (let i = 0; i < 500; i++) { a.fillStyle = r() < 0.5 ? '#6a6660' : '#b8b4ac'; a.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    speckle(a, w, h, 14, 74); }, { repeat: true });
  return canvasTex('fk:glaze', 256, 256, (a, w, h) => { // glazed ceramic: near-white with faint clouding (tinted per tile by instance colour)
    a.fillStyle = '#f2f0ec'; a.fillRect(0, 0, w, h); blotches(a, w, h, 22, 'rgba(120,110,95,0.06)', 15, 70, 31); blotches(a, w, h, 14, 'rgba(255,255,255,0.08)', 10, 50, 32);
    speckle(a, w, h, 5, 33); }, { repeat: true });
}

// per-piece texture offset (every tile / board shows a different part of the stone / grain) + uv span per piece
const MATS = new Map();
function pieceMaterial(kind, rough, metal, span) {
  const key = [kind, rough, metal, span].join(':'); if (MATS.has(key)) return MATS.get(key);
  const m = new THREE.MeshStandardMaterial({ map: surfTex(kind), roughness: rough, metalness: metal, color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
#if defined( USE_MAP ) && defined( USE_INSTANCING )
  { vec4 ip = instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ); vec2 h = fract( sin( vec2( dot( ip.xz, vec2( 12.9898, 78.233 ) ), dot( ip.xz, vec2( 39.3468, 11.135 ) ) ) ) * 43758.5453 );
    vMapUv = vMapUv * vec2( ${span[0].toFixed(3)}, ${span[1].toFixed(3)} ) + h; }
#endif`);
  };
  m.customProgramCacheKey = () => 'floorkit-' + span.join('x');
  MATS.set(key, m); return m;
}
const GROUT = new Map();
function groutMat(col, rough = 0.95) { const k = col + ':' + rough; if (!GROUT.has(k)) GROUT.set(k, new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: 0 })); return GROUT.get(k); }
let STRIP = null;
function stripMat() { return STRIP || (STRIP = new THREE.MeshStandardMaterial({ color: 0xc9a050, roughness: 0.3, metalness: 1 })); }

const DEF = {
  ceramic: { size: 0.6, joint: 0.003, chamfer: 0.0025, colors: ['#ece8e0'], grout: '#9d9483', rough: 0.18, metal: 0, tone: 0.035, lip: 0.0004, span: [0.5, 0.5] },
  checker: { size: 0.4, joint: 0.003, chamfer: 0.002, colors: ['#ece8e0', '#1c1c1e'], grout: '#5a5650', rough: 0.15, metal: 0, tone: 0.03, lip: 0.0003, span: [0.4, 0.4] },
  redoxide: { size: 1.0, joint: 0.004, chamfer: 0.003, colors: ['#ffffff'], grout: '#3a140c', rough: 0.45, metal: 0, tone: 0.06, lip: 0.0006, span: [1, 1] },
  terrazzo: { size: 1.2, joint: 0.003, chamfer: 0.0012, colors: ['#ffffff'], grout: '#8a8274', rough: 0.26, metal: 0, tone: 0.04, lip: 0.0002, span: [1, 1], strip: true },
  wood: { size: 0.13, joint: 0.0025, chamfer: 0.0018, colors: ['#c89868', '#b07c50', '#d8a878', '#a06a40'], grout: '#24160c', rough: 0.42, metal: 0, tone: 0.07, lip: 0.0005, len: [0.9, 2.1], span: [1, 0.2] },
  granite: { size: 0.8, joint: 0.002, chamfer: 0.0015, colors: ['#ffffff'], grout: '#3a3836', rough: 0.12, metal: 0, tone: 0.05, lip: 0.0003, span: [0.8, 0.8] },
  concrete: { size: 1.5, joint: 0.006, chamfer: 0.004, colors: ['#ffffff'], grout: '#4a4844', rough: 0.8, metal: 0, tone: 0.05, lip: 0.0008, span: [1, 1] },
};

export function modelFloor(spec, x0, z0, x1, z1, y = 0) {
  const S = { ...DEF[spec.kind] || DEF.ceramic, ...spec }; const r = rnd(S.seed || 7);
  const g = new THREE.Group(); g.name = 'modelledFloor'; g.userData.kind = S.kind;
  const W = x1 - x0, D = z1 - z0; if (!(W > 0 && D > 0)) return g;
  // grout bed: the joints show this (recessed 5.5 mm below the piece tops)
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(W, D), groutMat(S.grout)); bed.rotation.x = -Math.PI / 2; bed.position.set((x0 + x1) / 2, y + BED, (z0 + z1) / 2); bed.receiveShadow = true; g.add(bed);
  const along = S.along || (D >= W ? 'z' : 'x'); const pieces = []; // [cx, cz, w (x), d (z), colourIdx]
  if (S.kind === 'wood') { // boards along `along`, staggered butt joints, the last board in each row cut to fit
    const across = along === 'z' ? W : D, length = along === 'z' ? D : W; const nRow = Math.max(1, Math.round(across / S.size)); const bw = across / nRow;
    for (let i = 0; i < nRow; i++) { let t = -r() * S.len[1] * 0.8; while (t < length) { const L = S.len[0] + r() * (S.len[1] - S.len[0]); const a = Math.max(0, t), b = Math.min(length, t + L); if (b - a > 0.08) { const cA = i * bw + bw / 2, cL = (a + b) / 2;
      pieces.push(along === 'z' ? [x0 + cA, z0 + cL, bw, b - a] : [x0 + cL, z0 + cA, b - a, bw]); } t += L; } }
  } else { // square pieces from the room's centre line so the cut pieces at both walls are equal (as a tiler sets out)
    const s = S.size; const nx = Math.ceil(W / s / 2) * 2 + 1, nz = Math.ceil(D / s / 2) * 2 + 1; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const a0 = cx + (i - nx / 2) * s, b0 = cz + (j - nz / 2) * s; const ax = Math.max(x0, a0), bx = Math.min(x1, a0 + s), az = Math.max(z0, b0), bz = Math.min(z1, b0 + s);
      if (bx - ax > 0.02 && bz - az > 0.02) pieces.push([(ax + bx) / 2, (az + bz) / 2, bx - ax, bz - az, (i + j) & 1]); }
  }
  // one geometry per distinct (rounded) piece size → instancing; boards share one geometry scaled along their length
  const byGeo = new Map(); const J = S.joint;
  for (const p of pieces) { const w = Math.max(0.01, p[2] - J), d = Math.max(0.01, p[3] - J); const isBoard = S.kind === 'wood';
    const gw = isBoard ? (along === 'z' ? +w.toFixed(3) : 1) : +w.toFixed(3), gd = isBoard ? (along === 'z' ? 1 : +d.toFixed(3)) : +d.toFixed(3);
    const k = gw + 'x' + gd; let e = byGeo.get(k); if (!e) byGeo.set(k, (e = { gw, gd, list: [] })); e.list.push({ p, sx: isBoard && along === 'x' ? w : 1, sz: isBoard && along === 'z' ? d : 1 }); }
  const mat = pieceMaterial(S.kind, S.rough, S.metal, S.span); const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(); let count = 0;
  for (const e of byGeo.values()) {
    const geo = slabGeo(e.gw, e.gd, S.chamfer, S.kind === 'wood' && along === 'z'); const im = new THREE.InstancedMesh(geo, mat, e.list.length); im.receiveShadow = true; im.castShadow = false;
    e.list.forEach((it, i) => { const [cx, cz] = it.p; const lip = (r() - 0.5) * 2 * S.lip; _p.set(cx, y + TOP + lip, cz); _q.setFromAxisAngle(_s.set(0, 1, 0), (r() - 0.5) * 0.002); _s.set(it.sx, 1, it.sz); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m);
      const base = S.colors[S.kind === 'checker' ? (it.p[4] || 0) % S.colors.length : Math.floor(r() * S.colors.length)]; const t = 1 + (r() - 0.5) * 2 * S.tone; _c.set(base); _c.r *= t; _c.g *= t; _c.b *= t * (1 + (r() - 0.5) * 0.02); im.setColorAt(i, _c); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); g.add(im); count += e.list.length;
  }
  // terrazzo: brass divider strips proud of the joints, the full length of every bay line
  if (S.strip && S.kind !== 'wood') { const s = S.size, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const lines = [];
    for (let k = -Math.ceil(W / s); k <= Math.ceil(W / s); k++) { const x = cx + (k + 0.5) * s; /* bay joints: an odd bay count is centred on the room's centre line */ if (x > x0 + 0.01 && x < x1 - 0.01) lines.push([x, cz, 0.003, D]); }
    for (let k = -Math.ceil(D / s); k <= Math.ceil(D / s); k++) { const z = cz + (k + 0.5) * s; if (z > z0 + 0.01 && z < z1 - 0.01) lines.push([cx, z, W, 0.003]); }
    const sg = new THREE.BoxGeometry(1, 1, 1); const im = new THREE.InstancedMesh(sg, stripMat(), lines.length);
    lines.forEach(([lx, lz, lw, ld], i) => { _m.compose(_p.set(lx, y + (TOP + BED) / 2 + 0.0005, lz), _q.identity(), _s.set(lw, TOP - BED + 0.001, ld)); im.setMatrixAt(i, _m); }); im.instanceMatrix.needsUpdate = true; im.receiveShadow = true; g.add(im); }
  g.userData.pieces = count; return g;
}
export const FLOOR_TOP = TOP;
