// Weapon surfaces: what makes gun metal read as metal and a stock as real wood, computed in the weapon's own space (the patterns are
// glued to the gun, they never swim) on top of each MeshStandard / MeshPhysical material — no textures to load:
//   metal  — nitrided / parkerized steel: milling streaks along the receiver, lathe rings on turned (round) parts, fine scratches that
//            catch the light, roughness mottling from handling; a few microns of real relief (bump) so highlights break up
//   steel  — bare machined steel (pins, levers, muzzle devices): finer, brighter machining, lower roughness
//   blued  — hot-blued steel: blue-black with tint variation and handling wear
//   brass  — tarnish variation
//   wood   — growth rings (~4 mm apart) warped by the figure, dark latewood lines, open pores along the grain, colour figure; under an
//            oiled varnish (clearcoat on MeshPhysicalMaterial)
//   poly   — stippled polymer (grip texture relief), rubber — fine pebble
// Also used by the motorcycles (VehicleModels.js):
//   carbon — 2×2 twill carbon fibre at 45°: each tow's fibres run one way, so its sheen depends on the view direction (tows facing
//            you across the fibres light up, the crossing ones stay dark) — the shifting chequer real carbon has; tow crowns in relief
//   cast   — sand-cast / powder-coated engine cases: fine granular relief + mottling
// Every pattern fades out where it would be finer than a pixel (no shimmer in first person or at a distance).
const NOISE = `
varying vec3 vWsP; varying vec3 vWsN;
float wsH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float wsN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(wsH(i), wsH(i + vec3(1, 0, 0)), f.x), mix(wsH(i + vec3(0, 1, 0)), wsH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(wsH(i + vec3(0, 0, 1)), wsH(i + vec3(1, 0, 1)), f.x), mix(wsH(i + vec3(0, 1, 1)), wsH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float wsF(vec3 p) { return wsN(p) * 0.5 + wsN(p * 2.03 + 7.1) * 0.3 + wsN(p * 4.07 + 3.3) * 0.2; }
float wsAA(float freq) { return clamp(1.6 - length(fwidth(vWsP)) * freq, 0.0, 1.0); }           // 1 while resolved, 0 once sub-pixel
vec3 wsBump(vec3 n, float h, float s) { vec3 p = -vViewPosition; vec3 dpx = dFdx(p), dpy = dFdy(p); float hx = dFdx(h) * s, hy = dFdy(h) * s;
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1); if (abs(det) < 1e-12) return n; vec3 g = sign(det) * (hx * r1 + hy * r2); return normalize(abs(det) * n - g); }
`;
const BODY = {
  metal: `{ float aM = wsAA(900.0), aL = wsAA(2200.0), aS = wsAA(1400.0);
    float mill = wsN(vec3(vWsP.x * 900.0, vWsP.y * 900.0, vWsP.z * 18.0));
    float lathe = wsN(vec3(vWsP.z * 2200.0, 0.5, 0.5)); float rnd = (1.0 - abs(vWsN.z)) * (1.0 - step(0.985, max(abs(vWsN.x), abs(vWsN.y)))); // turned (round) parts get rings round the bore axis; flat milled faces don't
    float m = mix(mill, lathe, clamp(rnd, 0.0, 1.0) * 0.8);
    float sc = smoothstep(0.92, 1.0, wsN(vec3(vWsP.z * 55.0 + vWsP.x * 25.0, vWsP.y * 1400.0 + vWsP.z * 300.0, 2.0))) * step(0.5, wsN(vWsP * 28.0)) * aS;
    float mot = wsF(vWsP * 70.0);
    diffuseColor.rgb *= 0.86 + 0.26 * mot; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.43, 0.45), sc * 0.55);
    roughnessFactor = clamp(roughnessFactor + (m - 0.5) * 0.16 * mix(aM, aL, rnd) + (mot - 0.5) * 0.14 - sc * 0.22, 0.08, 1.0);
    normal = wsBump(normal, (m - 0.5) * mix(aM, aL, rnd) + sc * 0.4, 0.00004); }`,
  steel: `{ float aM = wsAA(1300.0), aL = wsAA(2600.0);
    float mill = wsN(vec3(vWsP.x * 1300.0, vWsP.y * 1300.0, vWsP.z * 25.0)); float lathe = wsN(vec3(vWsP.z * 2600.0, 0.5, 0.5)); float rnd = (1.0 - abs(vWsN.z)) * (1.0 - step(0.985, max(abs(vWsN.x), abs(vWsN.y))));
    float m = mix(mill, lathe, rnd * 0.7); float mot = wsF(vWsP * 90.0);
    diffuseColor.rgb *= 0.9 + 0.2 * mot; roughnessFactor = clamp(roughnessFactor + (m - 0.5) * 0.14 * mix(aM, aL, rnd) + (mot - 0.5) * 0.08, 0.06, 1.0);
    normal = wsBump(normal, (m - 0.5) * mix(aM, aL, rnd), 0.00003); }`,
  blued: `{ float a = wsAA(1000.0); float m = wsN(vec3(vWsP.x * 1000.0, vWsP.y * 1000.0, vWsP.z * 20.0)); float t = wsF(vWsP * 45.0);
    float sc = smoothstep(0.93, 1.0, wsN(vec3(vWsP.z * 50.0 + vWsP.x * 20.0, vWsP.y * 1300.0 + vWsP.z * 260.0, 5.0))) * step(0.55, wsN(vWsP * 24.0)) * wsAA(1300.0);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.86, 0.93, 1.16), 0.5 + 0.5 * t) * (0.88 + 0.22 * wsF(vWsP * 120.0)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.38, 0.39, 0.41), sc * 0.5);
    roughnessFactor = clamp(roughnessFactor + (m - 0.5) * 0.12 * a + (t - 0.5) * 0.1 - sc * 0.2, 0.08, 1.0); normal = wsBump(normal, (m - 0.5) * a + sc * 0.4, 0.00004); }`,
  brass: `{ float t = wsF(vWsP * 160.0); diffuseColor.rgb *= mix(vec3(1.0), vec3(0.78, 0.7, 0.55), smoothstep(0.55, 0.85, t) * 0.6); roughnessFactor = clamp(roughnessFactor + (t - 0.5) * 0.2, 0.1, 1.0); }`,
  wood: `{ vec3 q = vWsP; float aR = wsAA(260.0), aP = wsAA(700.0);
    float warp = wsF(vec3(q.x * 26.0, q.y * 26.0, q.z * 2.6));
    float r = length(q.xy - vec2(0.03, -0.16)) * 260.0 + warp * 3.2 + q.z * 5.0;            // growth rings round an axis below the stock, slightly oblique
    float ring = fract(r); float late = smoothstep(0.5, 0.93, ring) * (1.0 - smoothstep(0.93, 1.0, ring));
    float pores = smoothstep(0.6, 0.82, wsN(vec3(q.x * 700.0, q.y * 700.0, q.z * 36.0)));     // open pores, long along the grain
    float fig = wsF(q * vec3(18.0, 18.0, 3.5)); float ray = smoothstep(0.86, 0.97, wsN(vec3(q.x * 300.0, q.y * 40.0, q.z * 90.0))) * 0.5;
    vec3 c = diffuseColor.rgb * (0.78 + 0.36 * fig);
    c = mix(c, c * vec3(0.52, 0.4, 0.33), late * 0.75 * aR); c *= 1.0 - pores * 0.32 * aP; c = mix(c, c * vec3(1.18, 1.1, 1.0), ray * aP);
    diffuseColor.rgb = c; roughnessFactor = clamp(roughnessFactor + pores * 0.22 * aP - late * 0.05, 0.1, 1.0);
    normal = wsBump(normal, late * 0.5 * aR - pores * aP, 0.00006); }`,
  poly: `{ float a = wsAA(1700.0); float h = wsN(vWsP * 1700.0); float t = wsF(vWsP * 60.0);
    diffuseColor.rgb *= 0.93 + 0.12 * t; roughnessFactor = clamp(roughnessFactor + (h - 0.5) * 0.12 * a + (t - 0.5) * 0.08, 0.2, 1.0); normal = wsBump(normal, h * a, 0.00012); }`,
  carbon: `{ vec3 an = abs(vWsN); vec2 uv; vec3 ua, va;
    if (an.x > an.y && an.x > an.z) { uv = vWsP.zy; ua = vWsAz; va = vWsAy; } else if (an.y > an.z) { uv = vWsP.xz; ua = vWsAx; va = vWsAz; } else { uv = vWsP.xy; ua = vWsAx; va = vWsAy; }
    const float F = 300.0; /* ≈3.3 mm tow crossings (3K twill) */ vec2 q = vec2(uv.x + uv.y, uv.x - uv.y) * 0.70710678 * F; float a = wsAA(F * 1.6);
    vec2 cell = floor(q), f = fract(q); float warp = step(2.0, mod(cell.x + cell.y, 4.0));                  // 2/2 twill: over two, under two
    vec3 fd = normalize(mix(ua + va, ua - va, warp));                                                      // fibre direction of the tow on top (view space)
    float across = mix(f.y, f.x, warp); float crown = sin(across * 3.14159);                              // tow cross-section
    float sheen = pow(1.0 - abs(dot(normalize(vViewPosition), fd)), 2.0);
    float shade = mix(0.85, 0.72 + 0.6 * sheen, a) * mix(1.0, 0.86 + 0.14 * crown, a) * (0.96 + 0.08 * wsN(vec3(q * 0.5, 0.0)));
    diffuseColor.rgb *= shade; roughnessFactor = clamp(mix(roughnessFactor, mix(0.5, 0.22, sheen), a), 0.1, 1.0); normal = wsBump(normal, crown * a, 0.0003); }`,
  cast: `{ float a = wsAA(900.0); float h = wsN(vWsP * 900.0); float t = wsF(vWsP * 30.0);
    diffuseColor.rgb *= 0.92 + 0.14 * t; roughnessFactor = clamp(roughnessFactor + (h - 0.5) * 0.18 * a + (t - 0.5) * 0.1, 0.15, 1.0); normal = wsBump(normal, h * a, 0.0001); }`,
  rubber: `{ float a = wsAA(1200.0); float h = wsN(vWsP * 1200.0); roughnessFactor = clamp(roughnessFactor + (h - 0.5) * 0.08, 0.5, 1.0); normal = wsBump(normal, h * a, 0.00016); }`,
};
export function weaponSurface(mat, kind) {
  const body = BODY[kind]; if (!body) return mat;
  mat.onBeforeCompile = (sh) => {
    const ax = kind === 'carbon'; // carbon needs the object axes in view space (fibre direction vs the eye)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWsP; varying vec3 vWsN;' + (ax ? ' varying vec3 vWsAx; varying vec3 vWsAy; varying vec3 vWsAz;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWsP = position; vWsN = normal;' + (ax ? ' vWsAx = normalize((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz); vWsAy = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); vWsAz = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);' : ''));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}${ax ? 'varying vec3 vWsAx; varying vec3 vWsAy; varying vec3 vWsAz;\n' : ''}`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${body}`);
  };
  mat.customProgramCacheKey = () => 'weaponSurface:' + kind; mat.userData.surface = kind; return mat;
}
export const SURFACE_KINDS = Object.keys(BODY);
