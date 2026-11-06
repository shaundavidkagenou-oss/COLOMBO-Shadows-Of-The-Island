// Tropical trees: coconut palms, rain trees (mara), mango, jak, bo and frangipani (araliya).
import { MAT } from '../gfx/Materials.js';
import { treeShapes } from './TreeShapes.js';

export const TREES = {}; // exported for the crown-clearance table check (tools/tree-test.mjs)
import { windUniform } from './Wind.js';
export { windUniform };
export function addWind(mat, amp) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;
      #elif defined( USE_BATCHING )
        float ph = batchingMatrix[3].x * 0.13 + batchingMatrix[3].z * 0.11;
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
  addWind(MAT.leaves, 0.012); addWind(MAT.leavesBright, 0.014); addWind(MAT.palm, 0.02); if (MAT.banana) addWind(MAT.banana, 0.02); if (MAT.leavesSmall) addWind(MAT.leavesSmall, 0.01); if (MAT.bloom) addWind(MAT.bloom, 0.012);
  const S = treeShapes(); for (const [name, d] of Object.entries(S)) TREES[name] = { trunk: d.trunk, crown: d.crown, crownMat: MAT[d.mat] };
}

