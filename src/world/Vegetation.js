// Tropical trees: coconut palms, rain trees (mara), mango, jak, bo and frangipani (araliya).
import { MAT } from '../gfx/Materials.js';
import { treeShapes } from './TreeShapes.js';

export const TREES = {}; // exported for the crown-clearance table check (tools/tree-test.mjs)
import { windUniform, leafLight, heliWash, HELI_WASH_GLSL } from './Wind.js';
export { windUniform };
export function addWind(mat, amp, leaf = false) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform; sh.uniforms.uHeli = heliWash;
    if (leaf) { sh.uniforms.uLeafDir = leafLight.dir; sh.uniforms.uLeafCol = leafLight.col;
      // leaves: per-tree colour variation (no two crowns the identical green) and translucency — sunlight glowing yellow-green
      // through leaves seen against the sun, and through the shaded side of every card
      sh.fragmentShader = 'uniform vec3 uLeafDir;\nuniform vec3 uLeafCol;\nvarying float vLeafH;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= mix(vec3(0.84, 0.93, 0.78), vec3(1.12, 1.06, 0.86), vLeafH) * mix(0.9, 1.06, fract(vLeafH * 7.31));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { vec3 Lv = normalize((viewMatrix * vec4(uLeafDir, 0.0)).xyz); vec3 Vv = normalize(vViewPosition);
            float through = pow(max(dot(-Vv, Lv), 0.0), 4.0), back = max(0.0, -dot(normal, Lv));
            float tk = 0.45 + 0.55 * smoothstep(0.1, 0.45, diffuseColor.g); // thin bright leaf tissue transmits, dark gaps / inner crown don't
            totalEmissiveRadiance += diffuseColor.rgb * uLeafCol * vec3(0.9, 1.06, 0.5) * (0.36 * through + 0.16 * back) * tk; }`)
        // 35th request ("leaves look like metal pieces in morning light"): a leaf card stands for dozens of small leaves at random
        // angles, so its one flat normal must not produce a coherent mirror glint — at a low sun the full F0 / Fresnel specular of the
        // plane lit whole cards up like sheet metal. Leaf specular is kept to the faint waxy sheen a real crown has (direct and sky).
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          reflectedLight.directSpecular *= 0.12; reflectedLight.indirectSpecular *= 0.2;`);
    }
    sh.vertexShader = 'uniform float uWind;\nuniform vec4 uHeli;\n' + HELI_WASH_GLSL + (leaf ? 'varying float vLeafH;\n' : '') + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.11;
      #elif defined( USE_BATCHING )
        float ph = batchingMatrix[3].x * 0.13 + batchingMatrix[3].z * 0.11;
      #else
        float ph = 0.0;
      #endif
      float hgt = max(0.0, position.y - 2.5);${leaf ? 'vLeafH = fract(sin(ph * 91.7 + 3.1) * 43758.5453);' : ''}
      transformed.x += sin(uWind * 1.7 + ph + position.z * 0.3) * ${amp.toFixed(3)} * hgt;
      transformed.z += cos(uWind * 1.3 + ph * 1.3 + position.x * 0.3) * ${amp.toFixed(3)} * hgt * 0.7;
      if (uHeli.w > 0.0) { // helicopter downwash: crowns lean and thrash away from the rotor column (the trunk's base stays put)
        #ifdef USE_INSTANCING
          mat4 hwM = modelMatrix * instanceMatrix;
        #elif defined( USE_BATCHING )
          mat4 hwM = modelMatrix * batchingMatrix;
        #else
          mat4 hwM = modelMatrix;
        #endif
        vec3 hp = heliWashPush((hwM * vec4(transformed, 1.0)).xyz, uWind);
        transformed += inverse(mat3(hwM)) * hp * (${(amp * 6).toFixed(3)} * hgt + ${leaf ? '0.12' : '0.05'});
      }`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp + (leaf ? '-leaf3' : '') + '-heli';
}
export function buildTreeGeometries() {
  addWind(MAT.leaves, 0.012, true); addWind(MAT.leavesBright, 0.014, true); addWind(MAT.palm, 0.02); if (MAT.banana) addWind(MAT.banana, 0.02); if (MAT.leavesSmall) addWind(MAT.leavesSmall, 0.01, true); if (MAT.bloom) addWind(MAT.bloom, 0.012);
  const S = treeShapes(); for (const [name, d] of Object.entries(S)) TREES[name] = { trunk: d.trunk, crown: d.crown, crownMat: MAT[d.mat] };
}

