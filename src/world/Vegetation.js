// Tropical trees: coconut palms, rain trees (mara), mango, jak, bo and frangipani (araliya).
import { MAT } from '../gfx/Materials.js';
import { treeShapes } from './TreeShapes.js';

export const TREES = {}; // exported for the crown-clearance table check (tools/tree-test.mjs)
import { windUniform, leafLight } from './Wind.js';
export { windUniform };
export function addWind(mat, amp, leaf = false) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform;
    if (leaf) { sh.uniforms.uLeafDir = leafLight.dir; sh.uniforms.uLeafCol = leafLight.col;
      // leaves: per-tree colour variation (no two crowns the identical green) and translucency — sunlight glowing yellow-green
      // through leaves seen against the sun, and through the shaded side of every card
      sh.fragmentShader = 'uniform vec3 uLeafDir;\nuniform vec3 uLeafCol;\nvarying float vLeafH;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= mix(vec3(0.84, 0.93, 0.78), vec3(1.12, 1.06, 0.86), vLeafH) * mix(0.9, 1.06, fract(vLeafH * 7.31));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { vec3 Lv = normalize((viewMatrix * vec4(uLeafDir, 0.0)).xyz); vec3 Vv = normalize(vViewPosition);
            float through = pow(max(dot(-Vv, Lv), 0.0), 4.0), back = max(0.0, -dot(normal, Lv));
            totalEmissiveRadiance += diffuseColor.rgb * uLeafCol * vec3(0.95, 1.08, 0.55) * (0.55 * through + 0.22 * back); }`);
    }
    sh.vertexShader = 'uniform float uWind;\n' + (leaf ? 'varying float vLeafH;\n' : '') + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;
      #elif defined( USE_BATCHING )
        float ph = batchingMatrix[3].x * 0.13 + batchingMatrix[3].z * 0.11;
      #else
        float ph = 0.0;
      #endif
      float hgt = max(0.0, position.y - 2.5);${leaf ? 'vLeafH = fract(sin(ph * 91.7 + 3.1) * 43758.5453);' : ''}
      transformed.x += sin(uWind * 1.7 + ph + position.z * 0.3) * ${amp.toFixed(3)} * hgt;
      transformed.z += cos(uWind * 1.3 + ph * 1.3 + position.x * 0.3) * ${amp.toFixed(3)} * hgt * 0.7;`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp + (leaf ? '-leaf2' : '');
}
export function buildTreeGeometries() {
  addWind(MAT.leaves, 0.012, true); addWind(MAT.leavesBright, 0.014, true); addWind(MAT.palm, 0.02); if (MAT.banana) addWind(MAT.banana, 0.02); if (MAT.leavesSmall) addWind(MAT.leavesSmall, 0.01, true); if (MAT.bloom) addWind(MAT.bloom, 0.012);
  const S = treeShapes(); for (const [name, d] of Object.entries(S)) TREES[name] = { trunk: d.trunk, crown: d.crown, crownMat: MAT[d.mat] };
}

