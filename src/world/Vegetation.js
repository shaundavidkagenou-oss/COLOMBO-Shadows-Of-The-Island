// Tropical trees: coconut palms, rain trees (mara), mango, jak, bo and frangipani (araliya).
import * as THREE from 'three';
import { MeshBuilder, skipLampShadow } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { LAND_Y } from './Layout.js';
import { RNG } from '../core/rng.js';

const TREES = {};
export const windUniform = { value: 0 };
function addWind(mat, amp) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;
      #else
        float ph = 0.0;
      #endif
      float hgt = max(0.0, position.y - 2.5);
      transformed.x += sin(uWind * 1.7 + ph + position.z * 0.3) * ${amp.toFixed(3)} * hgt;
      transformed.z += cos(uWind * 1.3 + ph * 1.3 + position.x * 0.3) * ${amp.toFixed(3)} * hgt * 0.7;`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp;
}
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
export function buildTreeGeometries() {
  addWind(MAT.leaves, 0.012); addWind(MAT.leavesBright, 0.014); addWind(MAT.palm, 0.02);
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
    TREES.palm = { trunk: t.build(), crown: c.build(), crownMat: MAT.palm };
  }
  const broad = (name, h, r, cards, size, limbs, tint, flat, mat = MAT.leaves, trunkR = 0.35) => {
    const t = new MeshBuilder(), c = new MeshBuilder();
    const top = trunk(t, h * 0.45, trunkR, trunkR * 0.7, 0.4, rng);
    for (let k = 0; k < limbs; k++) { const a = k / limbs * Math.PI * 2 + rng.range(-0.3, 0.3); limb(t, top, [top[0] + Math.cos(a) * r * 0.55, h * rng.range(0.7, 0.85), top[2] + Math.sin(a) * r * 0.55], trunkR * 0.6, trunkR * 0.25); }
    canopy(c, top[0], h * 0.82, top[2], r, h * 0.28, r, cards, size, rng, tint, flat);
    if (flat) canopy(c, top[0], h * 0.92, top[2], r * 0.6, h * 0.15, r * 0.6, Math.floor(cards / 3), size, rng, tint.map((v) => v * 1.1), flat);
    TREES[name] = { trunk: t.build(), crown: c.build(), crownMat: mat };
  };
  broad('rain', 13, 9, 90, 2.2, 5, [0.95, 1, 0.9], 1, MAT.leaves, 0.55);
  broad('mara', 10, 5.5, 60, 1.9, 4, [1, 1, 0.95], 1, MAT.leaves, 0.4);
  broad('mango', 8, 3.8, 55, 1.6, 3, [0.8, 0.9, 0.8], 0, MAT.leaves, 0.32);
  broad('jak', 12, 3.6, 55, 1.6, 3, [0.85, 0.95, 0.8], 0, MAT.leaves, 0.36);
  broad('bo', 12, 6, 70, 1.8, 5, [1.05, 1.1, 1.0], 0, MAT.leavesBright, 0.5);
  broad('frangipani', 5, 2.6, 30, 1.2, 4, [1.25, 1.25, 1.2], 0, MAT.leavesBright, 0.18);
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
export function buildTreesForChunk(chunk) {
  const group = new THREE.Group(); const by = new Map();
  for (const t of chunk.trees) { const k = TREES[t.type] ? t.type : 'mara'; if (!by.has(k)) by.set(k, []); by.get(k).push(t); }
  for (const [type, list] of by) {
    const def = TREES[type]; const rng = new RNG(list.length * 31 + type.length);
    const tm = new THREE.InstancedMesh(def.trunk, MAT.bark, list.length), cm = new THREE.InstancedMesh(def.crown, def.crownMat, list.length);
    list.forEach((t, i) => { _p.set(t.x, LAND_Y - 0.05, t.z); _q.setFromEuler(_e.set(0, rng.next() * Math.PI * 2, 0)); _s.set(t.s, t.s * rng.range(0.9, 1.1), t.s); _m.compose(_p, _q, _s); tm.setMatrixAt(i, _m); cm.setMatrixAt(i, _m); });
    skipLampShadow(cm); tm.castShadow = cm.castShadow = true; tm.receiveShadow = cm.receiveShadow = true; tm.computeBoundingSphere(); cm.computeBoundingSphere();
    group.add(tm, cm);
  }
  return group;
}
