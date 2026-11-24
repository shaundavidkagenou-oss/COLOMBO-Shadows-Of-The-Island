// 36th Stage 4: world-space weathering for the building materials that are not facades — boundary / compound walls,
// plinths and concrete trims (MAT.concrete), clay-tile, flat-concrete and corrugated roofs. Like the facade de-repetition in
// InteriorMapping.js it is pure ALU on a world-position varying (value noise): no texture, uniform, draw call or geometry is
// added, and the material keeps its own map / normal map / vertex colour. Subtle on purpose: maintained, not abandoned.
//   wall: broad faded patches (+-4 %), rising damp along the foot (-8 %), a few rain runs below the coping
//   roof: lichen / soot blotches and sun-bleached sheets (+-6 %, slight warm / cool drift), denser towards the eaves
import { LAND_Y } from '../world/Layout.js';

const NOISE = /* glsl */`
varying vec3 vWthPos;
varying vec3 vWthN;
float wHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const WALL = /* glsl */`
#include <color_fragment>
{ vec3 Nw = normalize(vWthN);
  if (abs(Nw.y) < 0.3) {
    float s = vWthPos.x + vWthPos.z, h = vWthPos.y - ${LAND_Y.toFixed(3)}, fwS = fwidth(s) + fwidth(h);
    float n1 = wNoise(vec2(s * 0.13, h * 0.2) + 5.0), n2 = wNoise(vec2(s * 0.45, h * 0.6) + 11.0);
    float blot = (n1 - 0.5) * 0.08 + (n2 - 0.5) * 0.03 * (1.0 - smoothstep(0.08, 0.4, fwS));
    float damp = (1.0 - smoothstep(0.18, 0.45 + n2 * 0.35, h)) * step(-0.05, h);
    float run = smoothstep(0.6, 0.85, wNoise(vec2(s * 2.1, 0.0) + 23.0)) * smoothstep(0.3, 0.7, wNoise(vec2(s * 2.1, h * 0.5) + 2.0)) * (1.0 - smoothstep(0.15, 0.6, fwS));
    diffuseColor.rgb *= (1.0 + blot) * (1.0 - 0.08 * damp - 0.05 * run);
  } }
`;
const ROOF = /* glsl */`
#include <color_fragment>
{ vec2 q = vWthPos.xz; float fwQ = fwidth(q.x) + fwidth(q.y);
  float n1 = wNoise(q * 0.09 + 31.0), n2 = wNoise(q * 0.37 + 7.0);
  float blot = (n1 - 0.5) * 0.1 + (n2 - 0.5) * 0.05 * (1.0 - smoothstep(0.1, 0.5, fwQ));
  diffuseColor.rgb *= vec3(1.0 + blot) * vec3(1.0 + (n2 - 0.5) * 0.03, 1.0, 1.0 - (n2 - 0.5) * 0.03);
}
`;
export function applyWeathering(mat, kind = 'wall') {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWthPos;\nvarying vec3 vWthN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 wp = vec4(transformed, 1.0); vec3 wn = objectNormal;\n#ifdef USE_INSTANCING\nwp = instanceMatrix * wp; wn = mat3(instanceMatrix) * wn;\n#endif\nvWthPos = (modelMatrix * wp).xyz; vWthN = normalize(mat3(modelMatrix) * wn); }');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <color_fragment>', kind === 'roof' ? ROOF : WALL);
  };
  mat.customProgramCacheKey = () => 'weather-v1-' + kind;
  return mat;
}
