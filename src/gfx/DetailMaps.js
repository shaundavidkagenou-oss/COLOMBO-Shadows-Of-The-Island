// 84th request: wires the 83rd's four unused 2048² maps (Tex2K.js generators, KTX2 through TexLib) into the materials they
// were made for. One shared uniform per map key: every material that uses it reads the same texture object, which TexLib
// swaps from the 1×1 stand-in to the real map when it arrives (same sampler type: no shader recompile, no per-material copy).
//   vehDet  → vehicle cabin (vinterior: seat cloth / trim weave) and rubber (vrubber: moulded rubber grain)
//   feaNrm  → birds (overlapping feather rows: normal, roughness, tone)
//   grime   → painted bodies (VehicleWeather.grimePatch: dust, drip streaks, fine scratches, dried water spots)
//   rainNrm → vehicle glass (VehicleWeather.patchGlassRain: the droplet beads)
// The texture is requested on the first shader compile (the renderer exists by then, so the KTX2 path is taken).
import { TexLib, standIn } from './TexLib.js';
import { DETAIL_GLSL, DETAIL_V_COMMON, DETAIL_V_BEGIN } from './DetailGLSL.js';

const U = {};
export function mapUniform(key) { let u = U[key]; if (!u) { u = U[key] = { value: standIn(key) }; TexLib.use(key, (t) => { u.value = t; }); } return u; }

// o: { key, off: [tx, ty] tile, tiles (per side), scale (repeats per metre), k (normal strength), rough (0..1 mix toward the
// map's roughness), cav (0..1 cavity / tone darkening), id (program cache key) }
export function detailPatch(m, o) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey && m.customProgramCacheKey !== m.constructor.prototype.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.uniforms.uDtMap = mapUniform(o.key);
    const off = `vec2(${(o.off || [0, 0]).map((v) => v.toFixed(1)).join(', ')})`, tiles = (o.tiles || 1).toFixed(1), sc = o.scale.toFixed(3);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DETAIL_V_COMMON).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + DETAIL_V_BEGIN);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uDtMap; ' + DETAIL_V_COMMON + DETAIL_GLSL + '\nvec4 gDt; vec2 gDtQ;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n  gDtQ = dtPlanar(vDtP, normalize(vDtN)) * ${sc}; gDt = dtTile(uDtMap, gDtQ, ${off}, ${tiles}); diffuseColor.rgb *= mix(1.0, 0.72 + 0.28 * gDt.a, ${o.cav.toFixed(2)});`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n  roughnessFactor = clamp(mix(roughnessFactor, gDt.b, ${o.rough.toFixed(2)}), 0.04, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n  normal = dtPerturb(normal, vViewPosition, gDtQ, gDt.xy * 2.0 - 1.0, ${o.k.toFixed(2)});`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey() + '|' : '') + 'dt:' + o.id;
  return m;
}
