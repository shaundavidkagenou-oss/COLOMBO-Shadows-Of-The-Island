// Build-time patch for three.js (WebGLPrograms.getParameters): built-in UNLIT shaders
// (depth, distance, basic, points, sprite, ...) contain no lighting code, yet three puts the
// scene's light counts into their program parameters and cache key. When the night light set
// changes (LightSets tiers) every shadow-depth / basic variant first drawn afterwards compiled
// again with byte-identical code -> a shader-compile hitch at dusk for zero visual change.
// For these shader IDs the counts are now 0: same GLSL (verified: their chunks only read
// NUM_SPOT_LIGHT_COORDS inside worldpos_vertex, which USE_SHADOWMAP / DISTANCE already cover),
// one stable program per variant, fewer programs overall. Lit materials are untouched.
// Every edit asserts it matched exactly once, so a three.js upgrade fails the build loudly
// instead of silently skipping the patch.
const UNLIT = ['basic', 'depth', 'distance', 'matcap', 'normal', 'dashed', 'points', 'sprite', 'background', 'backgroundCube', 'cube', 'equirect'];
const COUNTS = ['numSunLights: lights.sun.length', 'numDirLights: lights.directional.length', 'numPointLights: lights.point.length',
  'numSpotLights: lights.spot.length', 'numSpotLightMaps: lights.spotLightMap.length', 'numRectAreaLights: lights.rectArea.length',
  'numHemiLights: lights.hemi.length', 'numSunLightShadows: lights.sunShadowMap.length', 'numDirLightShadows: lights.directionalShadowMap.length',
  'numPointLightShadows: lights.pointShadowMap.length', 'numSpotLightShadows: lights.spotShadowMap.length',
  'numSpotLightShadowsWithMaps: lights.numSpotLightShadowsWithMaps', 'numLightProbes: lights.numLightProbes'];

export function patchThreeSource(code) {
  const once = (src, find, repl) => {
    const n = src.split(find).length - 1;
    if (n !== 1) throw new Error(`[three-unlit-keys] expected 1 match for "${find}", found ${n} (three.js changed? update tools/vite/threeUnlitProgramKeys.mjs)`);
    return src.replace(find, repl);
  };
  let out = once(code, '\t\tconst shaderID = shaderIDs[ material.type ];\n\n\t\t// heuristics',
    `\t\tconst shaderID = shaderIDs[ material.type ];\n\t\tconst _unlitKey = ${JSON.stringify(UNLIT)}.includes( shaderID );\n\n\t\t// heuristics`);
  for (const c of COUNTS) { const [k, v] = c.split(': '); out = once(out, `\t\t\t${c},`, `\t\t\t${k}: _unlitKey ? 0 : ${v},`); }
  return out;
}

export default function threeUnlitProgramKeys() {
  return {
    name: 'three-unlit-program-keys',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]three[\\/]build[\\/]three\.module(\.min)?\.js$/.test(id.split('?')[0])) return null;
      return { code: patchThreeSource(code), map: null };
    },
  };
}
