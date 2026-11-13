// Police helicopter surfaces (40th request: "make all materials used in the Sri Lanka Police helicopter as realistic as possible").
// The airframe used the cars' factory paint (metallic flakes under a 0.8 clear coat) and the cars' dark tinted glass, and its rotor
// blades were the generic "worn plastic" — together they read as a die-cast toy. An aircraft is finished differently:
//   hpaint  — two-pack polyurethane topcoat straight on riveted aluminium / composite panels: satin-gloss, no flakes, no separate
//             clear coat. Procedural in the airframe's own space (glued to it, never swims): panel seams on the frame stations and
//             the longitudinal joints (panels of varying length — a hash drops seam segments), rows of rivet heads beside the frames,
//             fine orange-peel; and the wear an in-service police aircraft has — turbine exhaust soot fanning aft over the cowling and
//             the boom top, hydraulic / oil streaks blown aft down the cabin sides under the engine deck, road-dust grime on the belly,
//             slight tone differences between touched-up panels. Highlights obey the same direct-specular caps as the cars' paint
//             (no night glare; VehicleModels.vehSpecPatch).
//   hglass  — stretched acrylic canopy: much clearer than tinted car glass (the crew and the instrument panel are visible), a faint
//             blue-green cast, strong sky reflection at grazing angles.
//   hblade  — composite rotor blades: matte grey-black polyurethane with chordwise tone variation and a bare nickel erosion strip
//             along the leading edge (metal, brighter, glossier) — the strip is computed from the blade's own chord coordinate.
//   hmetal  — forged / machined steel and titanium of the rotor head, mast and searchlight gimbal (dark, satin; shared program with
//             the vehicles' machined-alloy material, so no new shader).
// Every pattern fades out before it becomes finer than a pixel (no shimmer at a distance). No textures (the busiest shaders are at
// the 16-unit limit), no extra draw calls (the helicopter already draws one mesh per material), two small new programs.
import * as THREE from 'three';
import { vehicleMaterials, vehSpecPatch } from './VehicleModels.js';
import { weaponSurface } from '../combat/WeaponSurface.js';

const HEAD = `
varying vec3 vHp; varying vec3 vHn;
float hH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float hN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hH(i), hH(i + vec3(1, 0, 0)), f.x), mix(hH(i + vec3(0, 1, 0)), hH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hH(i + vec3(0, 0, 1)), hH(i + vec3(1, 0, 1)), f.x), mix(hH(i + vec3(0, 1, 1)), hH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float hAA(float freq) { return clamp(1.6 - length(fwidth(vHp)) * freq, 0.0, 1.0); }
float hLine(float v, float sp, float o) { return abs(fract(v / sp + o) - 0.5) * sp; }
vec3 hBump(vec3 n, float h, float s) { vec3 p = -vViewPosition; vec3 dpx = dFdx(p), dpy = dFdy(p); float hx = dFdx(h) * s, hy = dFdy(h) * s;
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1); if (abs(det) < 1e-12) return n; vec3 g = sign(det) * (hx * r1 + hy * r2); return normalize(abs(det) * n - g); }
`;

const PAINT = `{
  vec3 p = vHp; vec3 an = abs(vHn); float px = length(fwidth(p));
  { vec3 vc = vColor.rgb; float m1 = step(0.9, vc.r) * step(vc.g, 0.1) * step(0.9, vc.b), m2 = step(vc.r, 0.1) * step(0.9, vc.g) * step(0.9, vc.b);
    if (m1 + m2 > 0.5) { float b = m1 > 0.5 ? 1.12 + 0.05 * max(0.0, p.z - 2.0) - 0.03 * max(0.0, -1.0 - p.z) : 1.86 - 0.02 * (2.6 + p.z) + 0.03;
      float lo = m1 > 0.5 ? 0.05 : 0.02, hi = m1 > 0.5 ? 0.04 : 0.022; float fw = max(fwidth(p.y), 1e-4);
      float s1 = smoothstep(b - lo - fw, b - lo + fw, p.y), s2 = smoothstep(b + hi - fw, b + hi + fw, p.y);
      diffuseColor.rgb = mix(mix(vec3(0.0091, 0.0296, 0.1559), vec3(0.5841, 0.3663, 0.0423), s1), vec3(0.855, 0.8714, 0.855), s2) * diffuse; } }
  // panel seams: frame stations every 0.62 m along the airframe, longitudinal joints every 0.5 m up the sides (0.55 m across
  // the top / belly); a per-segment hash drops some seam segments so the panels vary in size like a real skin
  float side = step(an.y, 0.72);
  float dz = hLine(p.z, 0.62, 0.31); float iz = floor(p.z / 0.62 + 0.31);
  float lv = side > 0.5 ? p.y : p.x; float lsp = side > 0.5 ? 0.5 : 0.55; float lo = side > 0.5 ? 0.18 : 0.5;
  float dl = hLine(lv, lsp, lo); float il = floor(lv / lsp + lo);
  float kz = step(0.3, hH(vec3(iz, il, 3.0))), kl = step(0.42, hH(vec3(il, iz, 9.0 + side)));
  float w = max(0.0016, px * 0.7); float nose = step(p.z, 5.0);                       // the composite nose cone is one piece
  float seam = max((1.0 - smoothstep(w * 0.5, w * 1.6, dz)) * kz, (1.0 - smoothstep(w * 0.5, w * 1.6, dl)) * kl) * hAA(160.0) * nose;
  // rivet heads: rows 16 mm beside each frame seam, 32 mm pitch (only drawn up close)
  float along = side > 0.5 ? p.y : p.x;
  float rv = (1.0 - smoothstep(0.07, 0.13, length(vec2(fract(along / 0.032) - 0.5, (dz - 0.016) / 0.032)))) * kz * hAA(700.0) * nose;
  // weathering
  float big = hN(p * 1.7), mid = hN(p * 6.0 + 11.0);
  float aft = (1.0 - smoothstep(-2.9, -2.2, p.z)) * (1.0 - (1.0 - smoothstep(-8.0, -3.6, p.z)));       // turbine soot from the two stacks, fanning aft
  float wd = 0.22 + max(0.0, -2.6 - p.z) * 0.06;
  float soot = aft * exp(-pow(max(0.0, abs(p.x) - 0.1), 2.0) / (wd * wd)) * smoothstep(1.95, 2.4, p.y) * (0.55 + 0.45 * hN(vec3(p.x * 9.0, p.y * 9.0, p.z * 1.3))) * (1.0 - 0.45 * (1.0 - smoothstep(-6.5, -3.0, p.z))); // densest just aft of the stacks
  float oilR = step(0.6, an.x) * (1.0 - smoothstep(2.3, 2.6, p.y)) * smoothstep(1.3, 2.1, p.y) * (1.0 - smoothstep(-0.3, 0.8, p.z)) * (1.0 - (1.0 - smoothstep(-3.3, -2.2, p.z)));
  float oil = oilR * smoothstep(0.68, 0.9, hN(vec3((p.z + p.y * 0.35) * 15.0, p.y * 1.4, sign(p.x) * 5.0))) * (0.6 + 0.4 * mid);
  float grime = (1.0 - smoothstep(0.74, 1.02, p.y)) * (0.45 + 0.55 * mid) * step(-2.9, p.z);
  vec3 c = diffuseColor.rgb;
  c *= (1.0 - seam * 0.3) * (0.975 + 0.05 * big);
  c = mix(c, c * vec3(0.4, 0.38, 0.35) + vec3(0.01), clamp(soot, 0.0, 1.0) * 0.8);
  c = mix(c, c * vec3(0.56, 0.48, 0.37), oil * 0.55);
  c = mix(c, c * vec3(0.74, 0.7, 0.64), grime * 0.4);
  diffuseColor.rgb = c;
  roughnessFactor = clamp(roughnessFactor + (big - 0.5) * 0.1 + seam * 0.25 + soot * 0.3 - oil * 0.12 + grime * 0.16, 0.08, 1.0);
  float peel = hN(p * 380.0) * hAA(380.0);
  normal = hBump(normal, peel * 0.05 - seam + rv * 0.6, 0.0009);
}`;

const BLADE = `{
  float le = smoothstep(0.104, 0.116, vHp.z) * step(0.62, vHp.x);                 // nickel erosion strip: front 4 % of the chord
  float t = hN(vHp * vec3(2.5, 30.0, 30.0)), u = hN(vHp * vec3(0.6, 4.0, 4.0) + 3.0);
  diffuseColor.rgb = mix(diffuseColor.rgb * (0.9 + 0.14 * t) * (0.94 + 0.12 * u), vec3(0.52, 0.53, 0.54) * (0.9 + 0.2 * t), le);
  roughnessFactor = mix(clamp(roughnessFactor + (t - 0.5) * 0.12, 0.3, 1.0), 0.26 + 0.1 * t, le);
  metalnessFactor = mix(metalnessFactor, 0.92, le);
}`;

function surface(mat, key, body, spec) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHp; varying vec3 vHn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHp = position; vHn = normal;');
    let fs = spec ? vehSpecPatch(sh.fragmentShader) : sh.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\n' + HEAD).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + body);
    sh.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => key; return mat;
}

// livery markers: vertices of the cabin / boom skin carry these colours and the shader paints white over navy with a gold
// pin-stripe per pixel (the split rises toward the nose: 1.12 m + 5 cm per metre ahead of z = 2, dipping 3 cm/m aft of z = −1)
export const LIVERY_CABIN = [1, 0, 1], LIVERY_BOOM = [0, 1, 1];
let H = null;
export function heliMaterials() {
  if (H) return H;
  const { mats } = vehicleMaterials();
  const glass = mats.vglass.clone(); // same physical-glass program as the cars, clearer acrylic
  glass.color.set(0x2c3d3c); glass.opacity = 0.4; glass.roughness = 0.04; glass.specularIntensity = 0.55; glass.envMapIntensity = 0.95;
  H = {
    hpaint: surface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.0, envMapIntensity: 0.62 }), 'heli-paint1', PAINT, true),
    hblade: surface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0.0, envMapIntensity: 0.5 }), 'heli-blade1', BLADE, false),
    hglass: glass,
    hmetal: weaponSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.85, envMapIntensity: 0.9 }), 'steel'),
  };
  return H;
}
