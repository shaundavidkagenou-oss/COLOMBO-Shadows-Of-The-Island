// Tropical trees: coconut palms, rain trees (mara), mango, jak, bo and frangipani (araliya).
import * as THREE from 'three';
import { MeshBuilder, skipLampShadow } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { LAND_Y } from './Layout.js';
import { RNG } from '../core/rng.js';
import { treeShapes } from './TreeShapes.js';

export const TREES = {}; // exported for the crown-clearance table check (tools/tree-test.mjs)
import { windUniform } from './Wind.js';
export { windUniform };
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
export function buildTreeGeometries() {
  addWind(MAT.leaves, 0.012); addWind(MAT.leavesBright, 0.014); addWind(MAT.palm, 0.02);
  const S = treeShapes(); for (const [name, d] of Object.entries(S)) TREES[name] = { trunk: d.trunk, crown: d.crown, crownMat: MAT[d.mat] };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
export function buildTreesForChunk(chunk) {
  const group = new THREE.Group(); const by = new Map();
  for (const t of chunk.trees) { const k = TREES[t.type] ? t.type : 'mara'; if (!by.has(k)) by.set(k, []); by.get(k).push(t); }
  for (const [type, list] of by) {
    const def = TREES[type]; const rng = new RNG(list.length * 31 + type.length);
    const tm = new THREE.InstancedMesh(def.trunk, MAT.bark, list.length), cm = new THREE.InstancedMesh(def.crown, def.crownMat, list.length);
    list.forEach((t, i) => { const ry = rng.next() * Math.PI * 2, rs = rng.range(0.9, 1.1); const sq = t.sq || 1; /* yaw / height / crown pruning come from CityPlan's crown-clearance pass */ _p.set(t.x, LAND_Y - 0.05, t.z); _q.setFromEuler(_e.set(0, t.yaw ?? ry, 0)); _s.set(t.s * sq, t.s * (t.sy ?? rs), t.s * sq); _m.compose(_p, _q, _s); tm.setMatrixAt(i, _m); cm.setMatrixAt(i, _m); });
    skipLampShadow(cm); tm.castShadow = cm.castShadow = true; tm.receiveShadow = cm.receiveShadow = true; tm.computeBoundingSphere(); cm.computeBoundingSphere();
    group.add(tm, cm);
  }
  return group;
}
