// 89th — mobile / microwave telecom towers over Colombo, as the operators build them here: four-legged galvanised lattice
// towers (40–50 m, square, tapering, X-braced; painted in the aviation red / white bands Sri Lanka's CAA requires on towers
// near the airport approach and over the city), with work platforms, three sectors of panel antennas, microwave dishes,
// the ladder + feeder cable tray, the lightning rod and the red obstruction lamp; and street monopoles (25–30 m tapered
// steel tubes with a triangular antenna head). Each stands on its own fenced compound (concrete slab, block wall + chain-link
// posts, gate, the equipment cabinets and a generator). Sites were picked on open ground clear of roads, water and every
// collider (dev check, see the 89th notes); the colliders here keep cars / people out of the compounds.
// One merged, vertex-coloured mesh for all of them in one material (the 'telecomTower' metal role) + one concrete mesh.
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { MAT, ensureMat } from '../gfx/Materials.js';
import { LAND_Y } from './Layout.js';

// [kind, x, z, height, yaw]
export const TOWER_SITES = [
  ['lattice', 602, -623, 45, 0.2], ['lattice', 401, -1097, 50, 0.6], ['lattice', 878, 200, 40, 0.0], ['lattice', -250, 1126, 40, 0.35],
  ['mono', -437, 80, 30, 0.0], ['mono', -493, 720, 30, 0.9], ['mono', 400, 1100, 28, 0.4], ['mono', -86, -66, 30, 1.2], ['mono', 320, 265, 25, 0.7],
];
const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const RED = C('#b8261d'), WHITE = C('#e8e6df'), GALV = C('#8f969a'), DARK = C('#232526'), PANEL = C('#d9dbd8'), CAB = C('#b7bdb9'), GEN = C('#5e6b5e');
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
let UNIT = null; // a unit box along +y from 0 to 1
// a member (square bar) between two points
function bar(mb, a, b, t, col) { if (!UNIT) { UNIT = new THREE.BoxGeometry(1, 1, 1); UNIT.translate(0, 0.5, 0); } _b.subVectors(b, a); const L = _b.length(); if (L < 1e-4) return; _q.setFromUnitVectors(_up, _b.multiplyScalar(1 / L)); _m.compose(a, _q, _s.set(t, L, t)); mb.geometry(UNIT, _m, col); }
function place(x, z, yaw) { return new THREE.Matrix4().compose(new THREE.Vector3(x, LAND_Y, z), new THREE.Quaternion().setFromAxisAngle(_up, yaw), new THREE.Vector3(1, 1, 1)); }
function band(y, H) { const n = 7, k = Math.min(n - 1, Math.floor((y / H) * n)); return k % 2 === 0 ? RED : WHITE; } // red at the foot and the top
function panelAntenna(mb, M, x, y, z, yaw) { const g = new THREE.BoxGeometry(0.32, 1.4, 0.12); g.rotateY(yaw); g.translate(x, y, z); g.applyMatrix4(M); mb.geometry(g, new THREE.Matrix4(), PANEL); g.dispose(); }
function dish(mb, M, x, y, z, yaw, r) { const g = new THREE.CylinderGeometry(r, r * 0.92, 0.3, 18); g.rotateX(Math.PI / 2); g.rotateY(yaw); g.translate(x, y, z); g.applyMatrix4(M); mb.geometry(g, new THREE.Matrix4(), WHITE); g.dispose(); }
// the compound: slab, block wall with chain-link posts + rails, a gate gap, cabinets, a generator (concrete parts → cb)
function compound(mb, cb, M, h, cols) {
  const H2 = h; const sl = new THREE.BoxGeometry(H2 * 2, 0.15, H2 * 2); sl.translate(0, 0.075, 0); sl.applyMatrix4(M); cb.geometry(sl, new THREE.Matrix4(), C('#a19e96')); sl.dispose();
  const P = (x, z, y = 0) => _a.set(x, y, z).applyMatrix4(M).clone();
  const sides = [[[-H2, -H2], [H2, -H2]], [[H2, -H2], [H2, H2]], [[H2, H2], [-H2, H2]], [[-H2, H2], [-H2, -H2]]];
  sides.forEach(([p, q], si) => { const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2.5);
    for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n;
      const ax = p[0] + (q[0] - p[0]) * t0, az = p[1] + (q[1] - p[1]) * t0, bx = p[0] + (q[0] - p[0]) * t1, bz = p[1] + (q[1] - p[1]) * t1;
      if (si === 2 && k === Math.floor(n / 2)) { for (const y of [0.25, 1.3, 2.3]) bar(mb, P(ax, az, y), P(bx, bz, y), 0.05, GALV); for (let i = 0; i <= 6; i++) { const t = i / 6; bar(mb, P(ax + (bx - ax) * t, az + (bz - az) * t, 0.25), P(ax + (bx - ax) * t, az + (bz - az) * t, 2.3), i % 6 === 0 ? 0.07 : 0.025, GALV); } continue; } // the locked steel gate
      const w = new THREE.BoxGeometry(Math.hypot(bx - ax, bz - az) + 0.2, 0.5, 0.2); w.rotateY(-Math.atan2(bz - az, bx - ax)); w.translate((ax + bx) / 2, 0.4, (az + bz) / 2); w.applyMatrix4(M); cb.geometry(w, new THREE.Matrix4(), C('#b9b4a8')); w.dispose();
      bar(mb, P(ax, az, 0.6), P(ax, az, 2.5), 0.06, GALV); for (const y of [1.2, 2.45]) bar(mb, P(ax, az, y), P(bx, bz, y), 0.035, GALV);
      bar(mb, P(ax, az, 0.65), P(bx, bz, 2.4), 0.012, DARK); bar(mb, P(bx, bz, 0.65), P(ax, az, 2.4), 0.012, DARK); } }); // chain-link reads as a dark cross-weave at distance
  for (const [x, z] of cols) { const c = new THREE.BoxGeometry(0.8, 1.7, 0.7); c.translate(x, 1.0, z); c.applyMatrix4(M); mb.geometry(c, new THREE.Matrix4(), CAB); c.dispose(); }
  const gn = new THREE.BoxGeometry(1.6, 1.2, 0.9); gn.translate(-H2 + 1.3, 0.75, H2 - 1.1); gn.applyMatrix4(M); mb.geometry(gn, new THREE.Matrix4(), GEN); gn.dispose();
}
function lattice(mb, cb, x, z, H, yaw) {
  const M = place(x, z, yaw); const b0 = H * 0.068, b1 = 0.75, ht = H * 0.82; const bw = (y) => (y < ht ? b0 + (b1 - b0) * (y / ht) : b1);
  const P = (sx, sz, y) => _a.set(sx * bw(y), y, sz * bw(y)).applyMatrix4(M).clone(); const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const lv = [0]; { let y = 0, ph = H * 0.11; while (y + ph < H - 0.5) { y += ph; lv.push(y); ph = Math.max(2.2, ph * 0.88); } lv.push(H); }
  for (let i = 0; i < lv.length - 1; i++) { const y0 = lv[i], y1 = lv[i + 1], col = band((y0 + y1) / 2, H), t = 0.16 - 0.1 * (y0 / H);
    for (let c = 0; c < 4; c++) { const [sx, sz] = corners[c], [tx, tz] = corners[(c + 1) % 4]; bar(mb, P(sx, sz, y0), P(sx, sz, y1), t, col); // legs
      bar(mb, P(sx, sz, y0), P(tx, tz, y1), 0.06, col); bar(mb, P(tx, tz, y0), P(sx, sz, y1), 0.06, col); bar(mb, P(sx, sz, y1), P(tx, tz, y1), 0.07, col); } // X-bracing + struts
    if (i % 2 === 0) { bar(mb, P(1, 1, y1), P(-1, -1, y1), 0.05, col); } } // plan bracing
  for (const yp of [H - 1.6, H * 0.7]) { const r = bw(yp) + 0.7; const Q = (sx, sz, y) => _a.set(sx * r, y, sz * r).applyMatrix4(M).clone(); // platforms: frame, grating edge, handrail
    for (let c = 0; c < 4; c++) { const [sx, sz] = corners[c], [tx, tz] = corners[(c + 1) % 4]; bar(mb, Q(sx, sz, yp), Q(tx, tz, yp), 0.1, GALV); bar(mb, Q(sx, sz, yp + 1.05), Q(tx, tz, yp + 1.05), 0.05, GALV); bar(mb, Q(sx, sz, yp), Q(sx, sz, yp + 1.05), 0.05, GALV); bar(mb, P(sx, sz, yp), Q(sx, sz, yp), 0.08, GALV); } }
  const ya = H - 1.0; for (let s = 0; s < 3; s++) { const a = s * (2 * Math.PI / 3) + 0.3, r = bw(ya) + 0.75; for (const d of [-0.35, 0.35]) panelAntenna(mb, M, Math.sin(a) * r + Math.cos(a) * d, ya, Math.cos(a) * r - Math.sin(a) * d, a); } // three sectors × 2
  for (const [a, y, r] of [[0.8, H * 0.74, 0.45], [2.6, H * 0.66, 0.35], [4.4, H * 0.58, 0.3]]) { const rr = bw(y) + 0.35; dish(mb, M, Math.sin(a) * rr, y, Math.cos(a) * rr, a, r); }
  bar(mb, _a.set(0, H, 0).applyMatrix4(M).clone(), _a.set(0, H + 2.4, 0).applyMatrix4(M).clone(), 0.05, GALV); const lt = new THREE.BoxGeometry(0.16, 0.2, 0.16); lt.translate(0, H + 2.5, 0); lt.applyMatrix4(M); mb.geometry(lt, new THREE.Matrix4(), RED); lt.dispose(); // lightning rod + obstruction lamp
  for (const dx of [-0.2, 0.2]) bar(mb, _a.set(dx, 0.2, bw(0.2) + 0.05).applyMatrix4(M).clone(), _a.set(dx, H - 1.5, bw(H - 1.5) + 0.05).applyMatrix4(M).clone(), 0.04, GALV); // ladder rails up the +z face
  bar(mb, _a.set(0.45, 0.4, bw(0.4) + 0.08).applyMatrix4(M).clone(), _a.set(0.45, H - 1.2, bw(H - 1.2) + 0.08).applyMatrix4(M).clone(), 0.12, DARK); // feeder cable tray
  for (const [sx, sz] of corners) { const pd = new THREE.BoxGeometry(0.9, 0.6, 0.9); pd.translate(sx * b0, 0.3, sz * b0); pd.applyMatrix4(M); cb.geometry(pd, new THREE.Matrix4(), C('#a8a49b')); pd.dispose(); } // leg pedestals
  const h = b0 + 3.2; compound(mb, cb, place(x, z, 0), h, [[h - 1.2, -h + 1.0], [h - 2.2, -h + 1.0]]); return h;
}
function mono(mb, cb, x, z, H, yaw) {
  const M = place(x, z, yaw); const g = new THREE.CylinderGeometry(0.22, 0.45, H, 16, 6); g.translate(0, H / 2 + 0.35, 0); g.applyMatrix4(M); mb.geometry(g, new THREE.Matrix4(), GALV); g.dispose();
  const fl = new THREE.CylinderGeometry(0.62, 0.62, 0.05, 16); fl.translate(0, 0.37, 0); fl.applyMatrix4(M); mb.geometry(fl, new THREE.Matrix4(), GALV); fl.dispose();
  const pd = new THREE.CylinderGeometry(0.8, 0.85, 0.35, 16); pd.translate(0, 0.175, 0); pd.applyMatrix4(M); cb.geometry(pd, new THREE.Matrix4(), C('#a8a49b')); pd.dispose();
  const yh = H - 0.8; const P = (lx, y, lz) => _a.set(lx, y, lz).applyMatrix4(M).clone(); // the triangular head frame
  const tri = [0, 1, 2].map((s) => s * (2 * Math.PI / 3)); const R = 1.5;
  for (let s = 0; s < 3; s++) { const a = tri[s], b = tri[(s + 1) % 3]; for (const y of [yh - 0.6, yh + 0.6]) { bar(mb, P(Math.sin(a) * R, y, Math.cos(a) * R), P(Math.sin(b) * R, y, Math.cos(b) * R), 0.08, GALV); bar(mb, P(0, y, 0), P(Math.sin(a) * R, y, Math.cos(a) * R), 0.07, GALV); }
    const am = (a + b) / 2; for (const d of [-0.45, 0.45]) panelAntenna(mb, M, Math.sin(am) * R * 0.55 + Math.cos(am) * d, yh, Math.cos(am) * R * 0.55 - Math.sin(am) * d, am); }
  dish(mb, M, 0.45, yh - 3.0, 0.2, 0.6, 0.3);
  bar(mb, P(0, H + 0.35, 0), P(0, H + 2.4, 0), 0.04, GALV); const lt = new THREE.BoxGeometry(0.14, 0.18, 0.14); lt.translate(0, H + 2.5, 0); lt.applyMatrix4(M); mb.geometry(lt, new THREE.Matrix4(), RED); lt.dispose();
  const h = 3.2; compound(mb, cb, place(x, z, 0), h, [[h - 1.0, -h + 0.9]]); return h;
}
// { group, colliders }: called once by World
export function buildTelecomTowers() {
  const mb = new MeshBuilder(), cb = new MeshBuilder(); const colliders = [];
  for (const [kind, x, z, H, yaw] of TOWER_SITES) { const h = kind === 'lattice' ? lattice(mb, cb, x, z, H, yaw) : mono(mb, cb, x, z, H, yaw);
    // the compound (axis-aligned; only the tower turns) — its block wall + fence as four thin colliders
    const t = 0.18; colliders.push({ x0: x - h - t, x1: x + h + t, z0: z - h - t, z1: z - h + t, h: 2.5, kind: 'fence' }, { x0: x - h - t, x1: x + h + t, z0: z + h - t, z1: z + h + t, h: 2.5, kind: 'fence' },
      { x0: x - h - t, x1: x - h + t, z0: z - h - t, z1: z + h + t, h: 2.5, kind: 'fence' }, { x0: x + h - t, x1: x + h + t, z0: z - h - t, z1: z + h + t, h: 2.5, kind: 'fence' });
    if (kind === 'mono') colliders.push({ x0: x - 0.85, x1: x + 0.85, z0: z - 0.85, z1: z + 0.85, h: H, kind: 'pole' });
    else { const b0 = H * 0.068, c = Math.cos(yaw), s = Math.sin(yaw); for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) { const wx = x + (sx * c + sz * s) * b0, wz = z + (-sx * s + sz * c) * b0; colliders.push({ x0: wx - 0.45, x1: wx + 0.45, z0: wz - 0.45, z1: wz + 0.45, h: 6, kind: 'pole' }); } } }
  const group = new THREE.Group(); group.name = 'telecomTowers';
  const mat = ensureMat('telecomTower') || MAT.metal; if (mat !== MAT.metal && !mat.userData.towerTuned) { mat.metalness = 0.45; mat.roughness = 0.55; mat.userData.towerTuned = true; } // painted bands + weathered galvanising, not polished steel
  const m = new THREE.Mesh(mb.build(), mat); m.castShadow = true; m.receiveShadow = true; m.name = 'telecomSteel'; group.add(m);
  const k = new THREE.Mesh(cb.build(), MAT.concrete); k.castShadow = true; k.receiveShadow = true; k.name = 'telecomConcrete'; group.add(k);
  return { group, colliders };
}
