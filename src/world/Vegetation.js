// Tropical trees: coconut palms, rain trees (mara), mango, jak, bo and frangipani (araliya).
import * as THREE from 'three';
import { MAT } from '../gfx/Materials.js';
import { treeShapes } from './TreeShapes.js';
import { patchLeafShader, LEAF_VERT_PARS, LEAF_VERT, LEAF_FRAG_PARS, LEAF_FRAG_MAP } from './LeafAtlas.js';

export const TREES = {}; // exported for the crown-clearance table check (tools/tree-test.mjs)
import { windUniform, leafLight, heliWash, vegWind, HELI_WASH_GLSL } from './Wind.js';
export { windUniform };

// 88th — vegetation wind, entirely in the vertex shader (no per-plant or per-leaf work on the CPU, no geometry rewritten):
//   • whole-plant sway: the trunk / stem bends with the square of the height over the plant's OWN height H (per instance, in
//     the alpha of the batch colour — Forest.js), so big trees bow slowly by a small fraction of their height (natural
//     frequency ∝ 1/√H: a 14 m banyan ~0.25 Hz, a 1 m shrub ~0.8 Hz) and small plants answer quicker and relatively more;
//     a steady lean downwind plus two incommensurate oscillations and a little cross-wind sway — never one sine;
//   • gusts: the CPU gust envelope (Wind.js, rise / hold / settle / lull) carried by a travelling pressure front across the
//     city, so neighbouring trees take the same gust one after another, downwind ones later;
//   • branches: leaves / fronds add a branch bob weighted by their flexibility (leaf cards: baked per card from how far out
//     in the crown they sit — tips move most, the inner crown little; fronds / blades: along their length), phase coherent
//     along a branch, different across the crown;
//   • leaves: near the camera each card trembles along its normal and every leaf on it flutters on its own (LeafAtlas.js).
// Detail falls off with distance: flutter only within ~45 m, branch motion within 260 m, nothing at all past 420 m (a
// uniform per-instance branch: distant trees run the bare transform). Bark uses the same trunk term, so limbs and leaves
// move together. Helicopter downwash as before.
const KIND = {
  leaf: { bw: 'leafBW', bamp: '1.0', flutter: true, heli: [0.072, 0.12] },
  palm: { bw: 'pow(clamp(uv.x, 0.0, 1.0), 1.5)', bamp: '2.6', heli: [0.12, 0.05] },
  banana: { bw: 'clamp(uv.y, 0.0, 1.0)', bamp: '2.0', heli: [0.12, 0.05] },
  bloom: { bw: '0.3 * hn', bamp: '1.0', heli: [0.072, 0.05] },
  bark: { bw: null, heli: [0.03, 0.0] },
};
const WIND_PARS = 'uniform float uWind;\nuniform vec4 uWindV;\nuniform vec4 uHeli;\n' + HELI_WASH_GLSL;
function windMain(kind, leaf) {
  const K = KIND[kind];
  return `
  #if defined( USE_BATCHING ) || defined( USE_INSTANCING )
    #ifdef USE_BATCHING
      mat4 vgM = batchingMatrix;
      #ifdef USE_BATCHING_COLOR
        float vgH = getBatchingColor( getIndirectIndex( gl_DrawID ) ).a;
      #else
        float vgH = 1.0;
      #endif
    #else
      mat4 vgM = instanceMatrix; float vgH = 1.0;
    #endif
    vec3 vgO = (modelMatrix * vec4(vgM[3].xyz, 1.0)).xyz; float vgS2 = max(dot(vgM[0].xyz, vgM[0].xyz), 1e-4);
    #define VEG_INST
  #else
    mat4 vgM = mat4(1.0); float vgH = 1.0; vec3 vgO = (modelMatrix * vec4(transformed, 1.0)).xyz; float vgS2 = 1.0;
  #endif
  float vgPh = vgO.x * 0.13 + vgO.z * 0.11;
  ${leaf ? 'vLeafH = fract(sin(vgPh * 91.7 + 3.1) * 43758.5453);' : ''}
  ${leaf ? 'float instSeed = fract(vgPh * 0.0713);\n' + LEAF_VERT : ''}
  float vgD = distance(vgO, cameraPosition);
  #ifdef VEG_INST
  if (vgD < 420.0) {
    float H = max(vgH, 0.6); vec2 wd = uWindV.xy; vec2 wc = vec2(-wd.y, wd.x);
    float gf = 0.5 + 0.5 * sin(dot(vgO.xz, wd) * 0.045 - uWind * 1.15 + sin(dot(vgO.xz, wc) * 0.021 + uWind * 0.13) * 1.6); gf *= gf;
    float G = uWindV.z * (0.55 + 0.45 * gf) + uWindV.w * (0.35 + 0.65 * gf) + 0.05;
    float fr = 2.2 / sqrt(H) + 0.2;
    float os = sin(uWind * fr * 2.1 + vgPh) * 0.62 + sin(uWind * fr * 3.73 + vgPh * 1.7) * 0.26;
    float hn = clamp(position.y / H, 0.0, 1.25);
    vec2 dxz = (wd * (0.62 + 0.38 * os) + wc * sin(uWind * fr * 2.9 + vgPh * 2.3) * 0.22) * G * hn * hn * (0.035 + 0.011 * H);
    ${K.bw ? `
    float bw = ${K.bw};
    if (bw > 0.0 && vgD < 260.0) {
      float bph = vgPh * 3.1 + dot(position.xz, vec2(0.83, 0.61)) + position.y * 0.37;
      float bo = sin(uWind * (fr * 4.4 + 0.9) + bph) * 0.6 + sin(uWind * (fr * 7.1 + 1.6) + bph * 1.37) * 0.3;
      float ba = bw * G * (0.04 + 0.012 * H) * ${K.bamp};
      dxz += wd * (0.55 + 0.45 * bo) * ba; transformed.y += bo * ba * 0.5;
      ${K.flutter ? `if (vgD < 45.0) { float fade = 1.0 - smoothstep(25.0, 45.0, vgD);
        transformed += objectNormal * sin(uWind * (9.0 + 4.0 * lfSeed) + lfSeed * 40.0 + position.y * 2.0) * 0.018 * (0.3 + bw) * (0.25 + G) * fade;
        vLeafSd.z = (0.05 + 0.1 * G) * fade * (0.4 + bw); }` : ''}
    }` : ''}
    vec3 dl = transpose(mat3(vgM)) * vec3(dxz.x, 0.0, dxz.y) / vgS2;
    transformed += dl; transformed.y -= dot(dl.xz, dl.xz) * 0.5 / max(position.y, 0.6); // the bend shortens, never stretches
  }
  #else
  ${K.flutter ? `if (vgD < 45.0) { float fade = 1.0 - smoothstep(25.0, 45.0, vgD); vLeafSd.z = (0.05 + 0.1 * uWindV.z) * fade * 0.5; } // hedges / creepers: leaves flutter, the clipped mass stays` : ''}
  #endif
  if (uHeli.w > 0.0) { // helicopter downwash: crowns lean and thrash away from the rotor column (the trunk's base stays put)
    vec3 hp = heliWashPush((modelMatrix * vgM * vec4(transformed, 1.0)).xyz, uWind);
    transformed += transpose(mat3(vgM)) * hp / vgS2 * (${K.heli[0].toFixed(3)} * max(0.0, position.y - 2.5) + ${K.heli[1].toFixed(3)});
  }`;
}
const LEAF_FRAG_LIGHT = (fs) => fs
  // per-tree colour variation (no two crowns the identical green) and translucency — sunlight glowing yellow-green through
  // leaves seen against the sun, and through the shaded side of every leaf
  .replace('#include <color_fragment>', `diffuseColor.rgb *= vColor.rgb;
    diffuseColor.rgb *= mix(vec3(0.84, 0.93, 0.78), vec3(1.12, 1.06, 0.86), vLeafH) * mix(0.9, 1.06, fract(vLeafH * 7.31));`)
  // each leaf tilts the shading normal its own way: a card no longer lights as one flat plane (the 35th "sheet metal" glint)
  .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    normal = normalize(normal + mat3(viewMatrix) * ((leafInf.xyz - 0.5) * 0.9));`)
  .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    { vec3 Lv = normalize((viewMatrix * vec4(uLeafDir, 0.0)).xyz); vec3 Vv = normalize(vViewPosition);
      float through = pow(max(dot(-Vv, Lv), 0.0), 4.0), back = max(0.0, -dot(normal, Lv));
      float tk = 0.45 + 0.55 * smoothstep(0.1, 0.45, diffuseColor.g); // thin bright leaf tissue transmits, dark / dry leaves less
      totalEmissiveRadiance += diffuseColor.rgb * uLeafCol * vec3(0.9, 1.06, 0.5) * (0.36 * through + 0.16 * back) * tk; }`)
  // waxy gloss per leaf (glossy mango / almond, matte rain tree): a faint, broken sheen — never a whole-card mirror
  .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    reflectedLight.directSpecular *= mix(0.06, 0.5, leafInf.w * vLeafSd.w); reflectedLight.indirectSpecular *= 0.3;`);

// 88th (perf): leaf lighting without the two costliest terms of MeshStandardMaterial that a leaf card cannot show anyway —
//  • the image-based SPECULAR (a full cube-UV environment lookup per fragment, then scaled to 22 % above): replaced by the
//    diffuse sky irradiance it would integrate to on a rough leaf (the diffuse IBL lookup is kept, so leaves sit in the same
//    sky light as everything else);
//  • point-light specular: lamp / interior point lights light leaves diffusely only (the sun keeps its waxy GGX highlight,
//    which the user's roughness map drives) — and only within their range (vegLightsBegin);
//  • and the diffuse sky irradiance (another cube-UV lookup) is looked up per VERTEX, for both faces of the card (vertices are
//    ~1/50 of the leaf fragments; a card's sky light is smooth across it) — same light, a fraction of the cost.
const LEAF_LFM = `
#if defined( RE_IndirectDiffuse ) && defined( LEAF_VIRR )
  iblIrradiance += gl_FrontFacing ? vLeafIrrF : vLeafIrrB;
#elif defined( RE_IndirectDiffuse ) && defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  iblIrradiance += getIBLIrradiance( geometryNormal );
#endif
#if defined( RE_IndirectSpecular )
  radiance += iblIrradiance * 0.31831;
#endif`;
// point lights (pooled lamp / interior lights — a dozen are live in the shader at all times so turning one on never recompiles):
// stock three evaluates every one for every fragment (attenuation pow, direction, BRDF) even hundreds of metres beyond its
// range, where it contributes exactly 0. Vegetation skips a light whose range the fragment is outside (exact: same result).
const _lfb = {};
function vegLightsBegin(diffuseOnly) {
  const key = diffuseOnly ? 'd' : 'f'; if (_lfb[key] !== undefined) return _lfb[key]; const src = THREE.ShaderChunk.lights_fragment_begin || '';
  const a = src.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )'), e = a < 0 ? -1 : src.indexOf('#pragma unroll_loop_end', a);
  const info = 'getPointLightInfo( pointLight, geometryPosition, directLight );', call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  const i0 = src.indexOf(info, a), i1 = src.indexOf(call, a);
  if (a < 0 || e < 0 || i0 < 0 || i1 < 0 || i0 > i1 || i1 > e) return (_lfb[key] = ''); // three changed: keep the stock chunk
  const body = src.slice(i0, i1) + (diffuseOnly ? 'reflectedLight.directDiffuse += saturate( dot( geometryNormal, directLight.direction ) ) * directLight.color * BRDF_Lambert( material.diffuseColor );' : call);
  return (_lfb[key] = src.slice(0, i0) + '{ vec3 vgL = pointLight.position - geometryPosition; if ( pointLight.distance <= 0.0 || dot( vgL, vgL ) < pointLight.distance * pointLight.distance ) {\n' + body + '\n} }' + src.slice(i1 + call.length));
}
export function addWind(mat, kind) {
  const leaf = kind === 'leaf';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform; sh.uniforms.uWindV = vegWind; sh.uniforms.uHeli = heliWash;
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    if (leaf) {
      sh.uniforms.uLeafDir = leafLight.dir; sh.uniforms.uLeafCol = leafLight.col; sh.uniforms.uLeafT = windUniform;
      vs = 'varying float vLeafH;\n' + vs.replace('#include <common>', '#include <common>\n' + LEAF_VERT_PARS);
      fs = 'uniform vec3 uLeafDir;\nuniform vec3 uLeafCol;\nvarying float vLeafH;\n' + LEAF_FRAG_LIGHT(fs.replace('#include <common>', '#include <common>\n' + LEAF_FRAG_PARS).replace('#include <map_fragment>', LEAF_FRAG_MAP));
      fs = fs.replace('#include <lights_fragment_maps>', LEAF_LFM); 
      const cu = sh.envMapCubeUVHeight; // per-vertex sky irradiance (see LEAF_LFM); the program key already includes this size
      if (cu && THREE.ShaderChunk.cube_uv_reflection_fragment) { const mm = Math.log2(cu) - 2, num = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
        const defs = '#define LEAF_VIRR\n#define ENVMAP_TYPE_CUBE_UV\n#define CUBEUV_TEXEL_WIDTH ' + num(1 / (3 * Math.max(Math.pow(2, mm), 112))) + '\n#define CUBEUV_TEXEL_HEIGHT ' + num(1 / cu) + '\n#define CUBEUV_MAX_MIP ' + num(mm) + '\n';
        vs = defs + 'uniform sampler2D envMap;\nuniform mat3 envMapRotation;\nuniform float envMapIntensity;\nvarying vec3 vLeafIrrF;\nvarying vec3 vLeafIrrB;\n' + vs.replace('#include <common>', '#include <common>\n' + THREE.ShaderChunk.cube_uv_reflection_fragment)
          .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
  { vec3 lfWN = envMapRotation * normalize(inverseTransformDirection(transformedNormal, viewMatrix));
    vLeafIrrF = PI * textureCubeUV(envMap, lfWN, 1.0).rgb * envMapIntensity; vLeafIrrB = PI * textureCubeUV(envMap, -lfWN, 1.0).rgb * envMapIntensity; }`);
        fs = '#define LEAF_VIRR\nvarying vec3 vLeafIrrF;\nvarying vec3 vLeafIrrB;\n' + fs; }
    } else fs = fs.replace('#include <color_fragment>', 'diffuseColor.rgb *= vColor.rgb;'); // the batch colour's alpha carries the plant height (not opacity)
    { const lfb = vegLightsBegin(leaf); if (lfb) fs = fs.replace('#include <lights_fragment_begin>', lfb); }
    sh.vertexShader = WIND_PARS + vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + windMain(kind, leaf)); sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => 'veg88c-' + kind;
}

// shadow-map material for the forest's leaf batches: the same per-card leaf layout (cheaper: no flutter, no lighting) so
// crowns cast dappled leaf shadows; three fills in map / alphaTest / side from MAT.leaves each pass
let _leafDepth = null;
export function leafDepthMaterial() {
  if (_leafDepth) return _leafDepth;
  const m = new THREE.MeshDepthMaterial(); m.name = 'leafDepth';
  m.onBeforeCompile = (sh) => { patchLeafShader(sh, 'fract((batchingMatrix[3].x * 0.13 + batchingMatrix[3].z * 0.11) * 0.0713)'); };
  m.customProgramCacheKey = () => 'leafDepth88';
  return (_leafDepth = m);
}
export function buildTreeGeometries() {
  addWind(MAT.leaves, 'leaf'); if (MAT.leavesBright !== MAT.leaves) addWind(MAT.leavesBright, 'leaf'); if (MAT.leavesSmall && MAT.leavesSmall !== MAT.leaves) addWind(MAT.leavesSmall, 'leaf');
  addWind(MAT.palm, 'palm'); if (MAT.banana) addWind(MAT.banana, 'banana'); if (MAT.bloom) addWind(MAT.bloom, 'bloom');
  if (MAT.treeBark) addWind(MAT.treeBark, 'bark'); if (MAT.palmBark) addWind(MAT.palmBark, 'bark');
  const S = treeShapes(); for (const [name, d] of Object.entries(S)) TREES[name] = { trunk: d.trunk, crown: d.crown, crownMat: MAT[d.mat] };
}
