// Interior mapping ("rooms behind the glass").
// Every glazed pixel of a facade texture (roughness < ~0.25 in the rm map: all window glass in
// Textures.js, walls are ~0.92) ray-casts into a virtual box room behind the wall plane:
// back wall, two side walls, floor and ceiling, with per-room finishes, furniture silhouettes,
// blinds and (at night) per-room lighting. The room shifts with parallax as the camera moves, so
// windows read as real volumes with depth rather than flat painted images, at zero extra geometry
// (scales to every building in the city; distant rooms simply minify with the texture).
// Rooms are aligned to the facade UV grid (4 bays x 2 floors per texture tile), so slabs and
// partitions line up with the painted mullions/spandrels.
import { FLOOR_H } from '../world/CityPlan.js';

const BAY = 3.2;
export const INTERIOR = {
  uIntDay: { value: 1.0 },   // daylight reaching interiors (driven by Materials.updateMaterials)
  uIntNight: { value: 0.0 }, // artificial room lighting
};

const VERT_DECL = /* glsl */`
varying vec3 vIWPos;
varying vec3 vIWN;
`;
const VERT_BODY = /* glsl */`
vIWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vIWN = normalize(mat3(modelMatrix) * objectNormal);
`;
const FRAG_DECL = /* glsl */`
varying vec3 vIWPos;
varying vec3 vIWN;
uniform float uIntDay;
uniform float uIntNight;
float iHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float iBox(vec2 p, vec2 lo, vec2 hi) { vec2 s = step(lo, p) * step(p, hi); return s.x * s.y; }
`;
// Runs after <emissivemap_fragment>: roughnessFactor / metalnessFactor / diffuseColor are known and
// lighting has not been evaluated yet.
const FRAG_BODY = /* glsl */`
#ifdef USE_MAP
{
  vec3 Nw = normalize(vIWN);
  float gm = (1.0 - smoothstep(0.2, 0.3, roughnessFactor)) * step(abs(Nw.y), 0.3);
  if (gm > 0.001) {
    const float RW = ${(2 * BAY).toFixed(3)};   // room width: two window bays
    const float FH = ${FLOOR_H.toFixed(3)};      // storey height
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), Nw));
    float sgn = dot(dFdx(vIWPos), T) * dFdx(vMapUv.x) + dot(dFdy(vIWPos), T) * dFdy(vMapUv.x);
    T *= (sgn < 0.0 ? -1.0 : 1.0);
    vec3 dw = normalize(vIWPos - cameraPosition);
    vec3 dl = vec3(dot(dw, T), dw.y, max(dot(dw, -Nw), 0.02));    // local ray: along wall, up, into building
    vec2 p = vec2(vMapUv.x * ${(4 * BAY).toFixed(3)}, vMapUv.y * ${(2 * FLOOR_H).toFixed(3)});
    vec2 cell = floor(p / vec2(RW, FH));
    vec2 seed = cell + floor(vIWPos.xz / 97.0) * 13.1 + Nw.xz * 7.3;
    float h1 = iHash(seed), h2 = iHash(seed + 3.7), h3 = iHash(seed + 9.1), h4 = iHash(seed + 17.3);
    vec2 lo = cell * vec2(RW, FH), hi = lo + vec2(RW, FH);
    float depth = mix(4.0, 8.5, h1);
    float tx = dl.x > 0.0 ? (hi.x - p.x) / max(dl.x, 1e-4) : (lo.x - p.x) / min(dl.x, -1e-4);
    float ty = dl.y > 0.0 ? (hi.y - p.y) / max(dl.y, 1e-4) : (lo.y - p.y) / min(dl.y, -1e-4);
    float tz = depth / dl.z;
    float t = min(tz, min(tx, ty));
    vec3 hp = vec3(p + dl.xy * t, dl.z * t);           // hit point (along, up, depth)
    vec2 rl = vec2(hp.x - lo.x, hp.y - lo.y);          // room-local: 0..RW, 0..FH
    // finishes
    vec3 wallC = h2 < 0.3 ? vec3(0.78, 0.75, 0.68) : h2 < 0.55 ? vec3(0.70, 0.72, 0.72) : h2 < 0.8 ? vec3(0.80, 0.73, 0.60) : vec3(0.62, 0.68, 0.72);
    vec3 floorC = h3 < 0.4 ? vec3(0.42, 0.42, 0.44) : h3 < 0.75 ? vec3(0.45, 0.31, 0.20) : vec3(0.66, 0.63, 0.58);
    vec3 col;
    float dk = hp.z / depth;                           // 0 at glass, 1 at back wall
    if (t == tz) {                                     // back wall + furniture silhouettes
      col = wallC;
      float desk = iBox(rl, vec2(RW * mix(0.1, 0.35, h4), 0.0), vec2(RW * mix(0.55, 0.9, h1), 0.78));
      float top = iBox(rl, vec2(RW * mix(0.1, 0.35, h4) - 0.05, 0.72), vec2(RW * mix(0.55, 0.9, h1) + 0.05, 0.8));
      float cab = iBox(rl, vec2(RW * 0.04, 0.0), vec2(RW * 0.04 + 0.6, mix(1.2, 2.0, h3))) * step(0.45, h2);
      float art = iBox(rl, vec2(RW * 0.5 - 0.5, 1.45), vec2(RW * 0.5 + 0.5, 2.15)) * step(h4, 0.5);
      col = mix(col, vec3(0.22, 0.18, 0.15), desk * 0.85);
      col = mix(col, vec3(0.35, 0.28, 0.22), top);
      col = mix(col, vec3(0.30, 0.31, 0.33), cab * 0.9);
      col = mix(col, h3 < 0.5 ? vec3(0.92, 0.93, 0.95) : vec3(0.35, 0.45, 0.5), art);
      col *= 0.82;
    } else if (t == ty) {
      if (dl.y < 0.0) {                                // floor
        col = floorC * mix(1.0, 0.75, dk);
        float rug = iBox(vec2(rl.x, hp.z), vec2(RW * 0.25, depth * 0.3), vec2(RW * 0.75, depth * 0.75)) * step(0.6, h4);
        col = mix(col, vec3(0.5, 0.2, 0.16), rug * 0.7);
      } else {                                         // ceiling with light panels
        col = vec3(0.86, 0.86, 0.84);
        vec2 q = vec2(fract(rl.x / (RW * 0.5)), fract(hp.z / 2.4));
        float panel = iBox(q, vec2(0.25, 0.3), vec2(0.75, 0.7));
        col = mix(col * 0.85, vec3(1.0), panel * 0.3);
      }
    } else {                                           // side walls (partition to neighbouring room)
      col = wallC * 0.72;
      float door = iBox(vec2(hp.z, rl.y), vec2(depth * 0.55, 0.0), vec2(depth * 0.55 + 0.95, 2.1)) * step(0.5, h3);
      col = mix(col, vec3(0.32, 0.24, 0.17), door);
    }
    // simple room AO: corners and depth darken
    float edge = min(min(rl.x, RW - rl.x), min(rl.y, FH - rl.y));
    col *= mix(0.72, 1.0, smoothstep(0.0, 0.6, edge)) * mix(1.0, 0.62, dk);
    // light: daylight through the window by day; per-room artificial light at night
    float lh = iHash(seed + 31.0); float lit = step(0.7, lh) * mix(0.45, 1.0, fract(lh * 7.13));
    vec3 lamp = h4 < 0.6 ? vec3(1.0, 0.82, 0.58) : vec3(0.82, 0.9, 1.0);
    vec3 light = vec3(0.92, 0.94, 0.96) * uIntDay + lamp * (uIntNight * lit) + vec3(0.012);
    vec3 tint = vec3(0.62, 0.74, 0.78);                // tinted glazing transmits ~50-70%
    vec3 interior = col * light * tint;
    // blinds / curtains on the glass plane in some rooms
    float blind = step(0.55, h3) * step(FH * (1.0 - mix(0.25, 0.85, h1)), p.y - lo.y);
    float slats = 0.85 + 0.15 * step(0.5, fract((p.y - lo.y) * 9.0));
    vec3 blindC = (h2 < 0.5 ? vec3(0.86, 0.83, 0.74) : vec3(0.62, 0.58, 0.5)) * slats;
    interior = mix(interior, blindC * (vec3(0.8) * uIntDay + lamp * uIntNight * lit), blind);
    // fresnel: grazing views show reflection, face-on views show the room
    float fres = 0.04 + 0.96 * pow(1.0 - dl.z, 5.0);
    totalEmissiveRadiance = mix(totalEmissiveRadiance, interior * (1.0 - fres * 0.85), gm);
    diffuseColor.rgb *= mix(1.0, 0.75, gm);
  }
}
#endif
`;

export function applyInteriorMapping(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uIntDay = INTERIOR.uIntDay;
    sh.uniforms.uIntNight = INTERIOR.uIntNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_BODY);
  };
  mat.customProgramCacheKey = () => 'interior-v3';
  return mat;
}
