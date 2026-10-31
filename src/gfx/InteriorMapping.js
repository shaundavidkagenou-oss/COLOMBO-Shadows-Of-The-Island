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
  uOcc: { value: 0.5 },      // share of rooms with the lights on (follows the clock, see occupancy())
  uITime: { value: 0 },      // seconds, for TV flicker
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
uniform float uOcc;
uniform float uITime;
// sine-free hash (stable for large inputs on every GPU: sin(x * 43758) amplifies tiny float differences into per-pixel noise)
float iHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float iBox(vec2 p, vec2 lo, vec2 hi) { vec2 s = step(lo, p) * step(p, hi); return s.x * s.y; }
`;
// Runs after <emissivemap_fragment>: roughnessFactor / metalnessFactor / diffuseColor are known and
// lighting has not been evaluated yet.
const FRAG_BODY = /* glsl */`
#ifdef USE_MAP
{
  vec3 Nw = normalize(vIWN);
  vec2 nq = floor(Nw.xz * 2.0 + 0.5);                 // facade orientation, exact (-1/0/1) for the axis-aligned walls
  vec2 wq = floor((vIWPos.xz - nq * 0.8) / 97.0);      // block id from a point 0.8 m inside the wall: never flips across the face
  { // painted window lights (non-glazed openings, distant LOD) obey the same per-room occupancy as the mapped rooms
    vec2 pc = floor(vec2(vMapUv.x * 2.0, vMapUv.y * 2.0)); vec2 ps = pc + wq * 13.1 + nq * 7.3; float plh = iHash(ps + 31.0);
    totalEmissiveRadiance *= step(1.0 - uOcc, plh) * mix(0.62, 1.0, fract(plh * 7.13)); }
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
    float fw = max(fwidth(p.x), fwidth(p.y));           // metres per pixel: fine detail fades out before it can alias
    vec2 seed = cell + wq * 13.1 + nq * 7.3;
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
        col = mix(col * 0.85, vec3(1.0), mix(panel, 0.25, smoothstep(0.15, 0.5, fw)) * 0.3);
      }
    } else {                                           // side walls (partition to neighbouring room)
      col = wallC * 0.72;
      float door = iBox(vec2(hp.z, rl.y), vec2(depth * 0.55, 0.0), vec2(depth * 0.55 + 0.95, 2.1)) * step(0.5, h3);
      col = mix(col, vec3(0.32, 0.24, 0.17), door);
    }
    // simple room AO: corners and depth darken
    float edge = min(min(rl.x, RW - rl.x), min(rl.y, FH - rl.y));
    col *= mix(0.72, 1.0, smoothstep(0.0, 0.6, edge)) * mix(1.0, 0.62, dk);
    // ---- light. Day: daylight through the window. Night: whether a room is lit follows the clock (uOcc: busy evenings,
    // late-night stragglers, early risers) and every room has its own fitting with real falloff: a wall-mounted tube light
    // (cool white — the usual fitting in Colombo homes and offices) or a warm ceiling bulb; some rooms only have a TV on.
    float lh = iHash(seed + 31.0); float lit = step(1.0 - uOcc, lh) * mix(0.62, 1.0, fract(lh * 7.13));
    float kind = fract(lh * 13.7);
    vec3 lamp = kind < 0.55 ? vec3(0.84, 0.95, 1.0) : vec3(1.0, 0.76, 0.48);
    vec3 hl = vec3(rl, hp.z);
    vec3 lp = kind < 0.55 ? vec3(RW * 0.5, FH - 0.6, depth - 0.1) : vec3(RW * 0.5, FH - 0.35, depth * 0.5);
    float dd = distance(hl, lp); float fall = 0.22 + 2.4 / (1.0 + dd * dd * 0.5);
    float tvOn = step(0.9, kind) + step(0.8, fract(lh * 29.1)) * (1.0 - step(0.9, kind)) * 0.5;
    float flick = 0.7 + 0.3 * sin(uITime * 6.3 + lh * 40.0) * sin(uITime * 2.1 + lh * 11.0);
    float dtv = distance(hl, vec3(RW * mix(0.25, 0.75, h1), 0.8, depth - 0.3));
    vec3 tvC = vec3(0.42, 0.58, 1.0) * tvOn * flick * 1.5 / (1.0 + dtv * dtv * 0.9);
    vec3 nightL = (kind < 0.9 ? lamp * fall : vec3(0.0)) + tvC;
    vec3 light = vec3(0.92, 0.94, 0.96) * uIntDay + nightL * (uIntNight * lit) + vec3(0.012);
    vec3 tint = vec3(0.62, 0.74, 0.78);                // tinted glazing transmits ~50-70%
    vec3 interior = col * light * tint;
    // the fitting itself is visible: a bright tube on the back wall, or the hot spot of a bulb on the ceiling
    if (t == tz && kind < 0.55) interior += vec3(1.7, 1.85, 1.9) * iBox(rl, vec2(RW * 0.5 - 0.6, FH - 0.64), vec2(RW * 0.5 + 0.6, FH - 0.56)) * uIntNight * lit;
    if (t == ty && dl.y > 0.0 && kind >= 0.55 && kind < 0.9) interior += lamp * 2.2 * smoothstep(0.4, 0.0, distance(vec2(rl.x, hp.z), lp.xz)) * uIntNight * lit;
    // blinds, or fabric curtains that glow in their own colour when the room behind is lit
    vec2 gp = p - lo;
    float blind = step(0.55, h3) * step(FH * (1.0 - mix(0.25, 0.85, h1)), gp.y);
    float slats = mix(0.85 + 0.15 * step(0.5, fract(gp.y * 9.0)), 0.925, smoothstep(0.03, 0.09, fw));
    vec3 blindC = (h2 < 0.5 ? vec3(0.86, 0.83, 0.74) : vec3(0.62, 0.58, 0.5)) * slats;
    vec3 back = kind < 0.9 ? lamp * 0.95 : vec3(0.35, 0.45, 0.8) * flick;
    interior = mix(interior, blindC * (vec3(0.8) * uIntDay + back * uIntNight * lit), blind);
    float cur = step(0.3, h3) * (1.0 - step(0.55, h3)) * step(mix(0.0, 1.1, h1 * h1), abs(gp.x - RW * 0.5));
    vec3 curC = h4 < 0.2 ? vec3(0.55, 0.13, 0.12) : h4 < 0.4 ? vec3(0.82, 0.62, 0.22) : h4 < 0.6 ? vec3(0.16, 0.46, 0.46) : h4 < 0.8 ? vec3(0.86, 0.8, 0.66) : vec3(0.8, 0.46, 0.5);
    float folds = mix(0.72 + 0.28 * sin(gp.x * 15.0 + h2 * 6.0), 0.86, smoothstep(0.08, 0.3, fw));
    interior = mix(interior, curC * folds * (vec3(0.55) * uIntDay + back * 0.75 * uIntNight * lit + vec3(0.01)), cur);
    // distance LOD: once a room shrinks to a few pixels its random finish / lit-or-dark state is just noise (shimmering speckle on far
    // towers) — blend to the average room: average finish under daylight plus the clock's share of lit rooms at night
    float lod = smoothstep(0.6, 2.0, fw);
    if (lod > 0.0) { vec3 avgC = vec3(0.6, 0.58, 0.54) * 0.62; vec3 avgL = vec3(0.92, 0.94, 0.96) * uIntDay + vec3(1.0, 0.9, 0.78) * 0.9 * uIntNight * uOcc + vec3(0.012);
      interior = mix(interior, avgC * avgL * tint, lod); }
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
    sh.uniforms.uOcc = INTERIOR.uOcc; sh.uniforms.uITime = INTERIOR.uITime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_BODY);
  };
  mat.customProgramCacheKey = () => 'interior-v7';
  return mat;
}

// Share of rooms with their lights on by hour: busy evenings, fewer after 11 pm, a handful at 3 am, early risers before dawn.
const OCC = [[17, 0.15], [18.5, 0.45], [20, 0.62], [21.5, 0.6], [22.5, 0.46], [23.5, 0.3], [25, 0.13], [27, 0.06], [28.5, 0.1], [29.5, 0.3], [30.5, 0.15]];
export function occupancy(h) { const hh = h < 12 ? h + 24 : h; if (hh <= OCC[0][0]) return OCC[0][1]; for (let i = 1; i < OCC.length; i++) { const [b, vb] = OCC[i], [a, va] = OCC[i - 1]; if (hh <= b) return va + (vb - va) * (hh - a) / (b - a); } return OCC[OCC.length - 1][1]; }
