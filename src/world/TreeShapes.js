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
function trunk(mb, h, r0, r1, bend, rng, col = [0.42, 0.35, 0.28]) {
  const seg = 6; let x = 0, z = 0; const dir = rng.next() * Math.PI * 2;
  for (let k = 0; k < seg; k++) {
    const y0 = (k / seg) * h, y1 = ((k + 1) / seg) * h; const ra = r0 + (r1 - r0) * (k / seg), rb = r0 + (r1 - r0) * ((k + 1) / seg);
    const nx = x + Math.cos(dir) * bend * ((k + 1) / seg) ** 2 - Math.cos(dir) * bend * (k / seg) ** 2, nz = z + Math.sin(dir) * bend * ((k + 1) / seg) ** 2 - Math.sin(dir) * bend * (k / seg) ** 2;
    const g = new THREE.CylinderGeometry(rb, ra, y1 - y0, 7, 1, true); const m = new THREE.Matrix4();
    const mid = new THREE.Vector3((x + nx) / 2, (y0 + y1) / 2, (z + nz) / 2); const up = new THREE.Vector3(nx - x, y1 - y0, nz - z).normalize();
    m.compose(mid, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up), new THREE.Vector3(1, 1, 1));
    mb.geometry(g, m, col); g.dispose(); x = nx; z = nz;
  }
  return [x, h, z];
}
function limb(mb, from, to, r0, r1, col = [0.4, 0.33, 0.27]) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to); const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1, true); const m = new THREE.Matrix4();
  m.compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()), new THREE.Vector3(1, 1, 1));
  mb.geometry(g, m, col); g.dispose();
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
