// Pure tree geometry (no materials): coconut palm, rain tree, mara, mango, jak, bo, frangipani.
// Shared by Vegetation.js (rendering) and CityPlan.js (crown clearance: no leaves or branches inside a building).
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { RNG } from '../core/rng.js';

function canopy(mb, cx, cy, cz, rx, ry, rz, cards, size, rng, tint = [1, 1, 1], flat = 0) {
  const start = mb.vcount;
  for (let k = 0; k < cards; k++) {
    const u = rng.next() * Math.PI * 2, v = Math.acos(1 - rng.next() * (flat ? 1.2 : 1.8));
    const px = cx + Math.sin(v) * Math.cos(u) * rx, py = cy + Math.cos(v) * ry * (flat ? 0.6 : 1), pz = cz + Math.sin(v) * Math.sin(u) * rz;
    const s = size * rng.range(0.75, 1.25); const a = rng.next() * Math.PI; const tilt = rng.range(-0.6, 0.6);
    const ax = Math.cos(a) * s, az = Math.sin(a) * s, bx = -Math.sin(a) * s * Math.cos(tilt), by = s * Math.sin(tilt) + s * 0.3, bz = Math.cos(a) * s * Math.cos(tilt);
    const t = tint.map((c) => c * rng.range(0.8, 1.1));
    mb.quad([px - ax - bx, py - by, pz - az - bz], [px + ax - bx, py - by, pz + az - bz], [px + ax + bx, py + by, pz + az + bz], [px - ax + bx, py + by, pz - az + bz], [0, 0, 1, 1], t);
  }
  // rounded normals
  for (let i = start; i < mb.vcount; i++) {
    const x = mb.pos[i * 3] - cx, y = (mb.pos[i * 3 + 1] - cy) * 1.4 + ry * 0.5, z = mb.pos[i * 3 + 2] - cz; const l = Math.hypot(x, y, z) || 1;
    mb.nor[i * 3] = x / l; mb.nor[i * 3 + 1] = y / l; mb.nor[i * 3 + 2] = z / l;
  }
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
function trunk(mb, h, r0, r1, bend, rng, col = [0.42, 0.35, 0.28]) {
  const seg = 12; const dir = rng.next() * Math.PI * 2; const pts = [], radii = [];
  pts.push(new THREE.Vector3(0, -0.25, 0)); radii.push(r0 * 1.32); // buried root flare: the trunk meets the ground solidly
  for (let k = 0; k <= seg; k++) { const u = k / seg; pts.push(new THREE.Vector3(Math.cos(dir) * bend * u * u, u * h, Math.sin(dir) * bend * u * u)); radii.push((r0 + (r1 - r0) * u) * (1 + 0.28 * Math.max(0, 1 - u * 7) ** 2)); }
  const g = tubeGeo(pts, radii, 9, { capEnd: true, vLen: h / 6 }); mb.geometry(g, new THREE.Matrix4(), col); g.dispose();
  return [Math.cos(dir) * bend, h, Math.sin(dir) * bend];
}
// a limb grows out of the trunk: it starts inside the trunk axis (no seam at the fork), curves gently upward and ends in a capped tip
function limb(mb, from, to, r0, r1, col = [0.4, 0.33, 0.27]) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to); const d = b.clone().sub(a); const start = a.clone().add(new THREE.Vector3(0, -0.35, 0)); // on the trunk axis, inside the trunk
  const pts = [], radii = []; const n = 6; for (let k = 0; k <= n; k++) { const u = k / n; const p = start.clone().lerp(b, u); p.y += Math.sin(u * Math.PI) * d.length() * 0.06; pts.push(p); radii.push(r0 + (r1 - r0) * u); }
  const g = tubeGeo(pts, radii, 7, { capEnd: true, capStart: true, vLen: Math.max(0.5, d.length() / 2) }); mb.geometry(g, new THREE.Matrix4(), col); g.dispose();
}
let S = null;
// {type: {trunk, crown, mat}} — built once, deterministic (RNG 707)
export function treeShapes() {
  if (S) return S; S = {};
  const rng = new RNG(707);
  { // coconut palm
    const t = new MeshBuilder(), c = new MeshBuilder();
    const top = trunk(t, 11, 0.24, 0.15, 1.6, rng, [0.5, 0.44, 0.36]);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const g = new THREE.IcosahedronGeometry(0.2, 0); const m = new THREE.Matrix4().makeTranslation(top[0] + Math.cos(a) * 0.25, top[1] - 0.4, top[2] + Math.sin(a) * 0.25); t.geometry(g, m, k % 2 ? [0.45, 0.5, 0.15] : [0.55, 0.42, 0.2]); }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + rng.range(-0.1, 0.1); const len = rng.range(4.2, 5.4), droop = rng.range(0.6, 1.3) + (k % 2) * 0.4; const W = 0.9;
      const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx; const seg = 6;
      for (let s = 0; s < seg; s++) {
        const t0 = s / seg, t1 = (s + 1) / seg; const f = (tt) => [top[0] + dx * len * tt, top[1] + 0.6 * Math.sin(tt * 1.6) * 1.2 - droop * tt * tt * 2.2, top[2] + dz * len * tt];
        const A = f(t0), B = f(t1); const wa = W * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t0 + 0.1))), wb = W * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t1 + 0.1)));
        const col = [0.95, 1, 0.9].map((v) => v * rng.range(0.85, 1.05));
        c.quad([A[0] - px * wa, A[1] - 0.15, A[2] - pz * wa], [B[0] - px * wb, B[1] - 0.15, B[2] - pz * wb], [B[0] + px * wb, B[1] - 0.15, B[2] + pz * wb], [A[0] + px * wa, A[1] - 0.15, A[2] + pz * wa], [t0, 0, t1, 1], col);
      }
    }
    S.palm = { trunk: t.build(), crown: c.build(), mat: 'palm' };
  }
  const broad = (name, h, r, cards, size, limbs, tint, flat, mat = 'leaves', trunkR = 0.35) => {
    const t = new MeshBuilder(), c = new MeshBuilder();
    const top = trunk(t, h * 0.45, trunkR, trunkR * 0.7, 0.4, rng);
    for (let k = 0; k < limbs; k++) { const a = k / limbs * Math.PI * 2 + rng.range(-0.3, 0.3); limb(t, top, [top[0] + Math.cos(a) * r * 0.55, h * rng.range(0.7, 0.85), top[2] + Math.sin(a) * r * 0.55], trunkR * 0.6, trunkR * 0.25); }
    canopy(c, top[0], h * 0.82, top[2], r, h * 0.28, r, cards, size, rng, tint, flat);
    if (flat) canopy(c, top[0], h * 0.92, top[2], r * 0.6, h * 0.15, r * 0.6, Math.floor(cards / 3), size, rng, tint.map((v) => v * 1.1), flat);
    S[name] = { trunk: t.build(), crown: c.build(), mat };
  };
  broad('rain', 13, 9, 90, 2.2, 5, [0.95, 1, 0.9], 1, 'leaves', 0.55);
  broad('mara', 10, 5.5, 60, 1.9, 4, [1, 1, 0.95], 1, 'leaves', 0.4);
  broad('mango', 8, 3.8, 55, 1.6, 3, [0.8, 0.9, 0.8], 0, 'leaves', 0.32);
  broad('jak', 12, 3.6, 55, 1.6, 3, [0.85, 0.95, 0.8], 0, 'leaves', 0.36);
  broad('bo', 12, 6, 70, 1.8, 5, [1.05, 1.1, 1.0], 0, 'leavesBright', 0.5);
  broad('frangipani', 5, 2.6, 30, 1.2, 4, [1.25, 1.25, 1.2], 0, 'leavesBright', 0.18);
  return S;
}
// Leaf-card and branch vertices of a type in instance-local space (y up from the ground, trunk at the origin) —
// what CityPlan tests against building volumes. Trunk vertices below 1.5 m are left out (the trunk-to-wall gap covers them).
const PTS = {};
export function crownPoints(type) {
  if (PTS[type]) return PTS[type]; const d = treeShapes()[type]; const out = [];
  { const p = d.crown.attributes.position; // leaf cards are quads (4 consecutive vertices): corners + edge midpoints + centre, so a big card can't straddle a wall corner unseen
    for (let i = 0; i + 3 < p.count; i += 4) { const q = [0, 1, 2, 3].map((k) => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]);
      for (let k = 0; k < 4; k++) { const a = q[k], b = q[(k + 1) % 4]; out.push(...a, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); }
      out.push((q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2, (q[0][2] + q[2][2]) / 2); } }
  { const p = d.trunk.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 1.5) continue; out.push(p.getX(i), y, p.getZ(i)); } }
  return (PTS[type] = new Float32Array(out));
}
