// 83rd request — vehicle weather surfaces, all on the GPU (no per-vehicle CPU work beyond a few uniforms):
//   * rain on glass: beads that grow with the rain, running streaks on steep glass (gravity, plus airflow from the vehicle's own
//     speed pushing drops back along side windows and up the windscreen), a thin wet film that lingers while the world is wet
//     (atmos.wet), and the windscreen sectors that this vehicle's wipers have swept kept mostly clear (a clean band right behind
//     each blade). One shader program for every vehicle ('vglass-rain'); each vehicle owns only a tiny uniform block (WipeU).
//   * grime: road dust on the lower body and wheel-arch spray, light dust on the flat tops, heavier on working vehicles (vworn);
//     when wet the dust darkens to mud and runs in streaks; the amount varies per paint look (seeded from the vertex colour, so two
//     cars of the same model in different paint never carry the same dirt). Shared paint materials — no new materials.
//   * wiper layouts: model builders record their wiper arms here (wiperSet) instead of baking static wiper geometry; VehicleFx
//     draws every visible wiper with one instanced mesh and sweeps it from the vehicle's own wiper state.
import * as THREE from 'three';
import { mapUniform } from '../gfx/DetailMaps.js';

// ---- global weather uniforms (VehicleFx.update writes them once per frame)
export const RAIN_U = { uGrRain: { value: 0 }, uGrWet: { value: 0 }, uGrT: { value: 0 } };

// ---- per-vehicle wiper uniform block (2 arms max): pivot xyz + arm length, rest dir xyz + current angle, in-plane up xyz + sweep,
// x = wipe activity (0 parked … 1 running), y = vehicle speed (m/s)
export function newWipeU() {
  return { uWp: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uWd: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uWu: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uWs: { value: new THREE.Vector4() } };
}
export const ZERO_WIPE = newWipeU();
// load a vehicle's wiper layout into its uniform block (once, when the mesh is made)
export function initWipeU(WU, arms) {
  if (!arms) return; for (let i = 0; i < 2; i++) { const a = arms[i]; if (!a) { WU.uWp.value[i].set(0, -99, 0, 0); continue; }
    WU.uWp.value[i].set(a.p[0], a.p[1], a.p[2], a.L); WU.uWd.value[i].set(a.r[0], a.r[1], a.r[2], 0); WU.uWu.value[i].set(a.w[0], a.w[1], a.w[2], a.sweep); }
}

const GLASS_V_COMMON = 'varying vec3 vGrP; varying vec3 vGrN; varying vec3 vGrT; varying vec3 vGrB;';
const GLASS_V_BEGIN = `vGrP = position; vGrN = objectNormal;
{ vec3 grA = abs(objectNormal); vec3 grU = grA.x > 0.6 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 grT = normalize(grU - objectNormal * dot(grU, objectNormal)); vec3 grB = cross(objectNormal, grT);
  vGrT = normalize(normalMatrix * grT); vGrB = normalize(normalMatrix * grB); }`;
const GLASS_F_COMMON = `uniform sampler2D uRainN; uniform float uGrRain; uniform float uGrWet; uniform float uGrT; uniform vec4 uWp[2]; uniform vec4 uWd[2]; uniform vec4 uWu[2]; uniform vec4 uWs;
varying vec3 vGrP; varying vec3 vGrN; varying vec3 vGrT; varying vec3 vGrB;
float grH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// one layer of beads: xy = dome slope (normal tilt), z = coverage
vec3 grBeads(vec2 uv, float dens, float sz) {
  vec2 c = floor(uv); if (grH(c) > dens) return vec3(0.0);
  vec2 d = fract(uv) - 0.5 - (vec2(grH(c + 3.1), grH(c + 7.7)) - 0.5) * 0.45; float r = mix(0.1, 0.3, grH(c + 1.9)) * sz;
  float q = dot(d, d) / (r * r); if (q > 1.0) return vec3(0.0); return vec3(d / r * 0.9, smoothstep(1.0, 0.7, q));
}
// running drops: a column per cell, a head moving down the flow with a fading trail of beads above it
vec3 grRun(vec2 uv, float t, float k) {
  float cx = floor(uv.x); float h = grH(vec2(cx, 9.1)); if (h > k) return vec3(0.0);
  float sp = mix(0.6, 1.6, grH(vec2(cx, 2.3))); float y = uv.y * 0.12 + t * sp * 0.35 + h * 7.0; float fy = fract(y);
  float dx = fract(uv.x) - 0.5 + sin(uv.y * 0.9 + h * 6.0) * 0.12; float head = smoothstep(0.24, 0.08, length(vec2(dx * 1.1, (fy - 0.92) * 2.6)));
  float trail = smoothstep(0.09, 0.02, abs(dx)) * smoothstep(0.92, 0.5, fy) * step(fy, 0.92) * 0.55 * step(0.5, grH(vec2(cx, floor(uv.y * 0.6))));
  return vec3(dx * 3.0, 0.0, max(head, trail));
}`;
const GLASS_F_COLOR = `float grM = 0.0; vec2 grS = vec2(0.0);
{ float rk = clamp(uGrRain, 0.0, 1.0), wk = clamp(uGrWet, 0.0, 1.0);
  if (rk + wk > 0.02) {
    vec3 n = normalize(vGrN); vec3 grA = abs(n); vec3 grU = grA.x > 0.6 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 T = normalize(grU - n * dot(grU, n)); vec3 B = cross(n, T); vec2 tc = vec2(dot(vGrP, T), dot(vGrP, B));
    float aa = length(fwidth(tc)) * 60.0; float lod = clamp(1.6 - aa, 0.0, 1.0); /* far away / grazing: fade to the film only (no shimmer) */
    // flow on the glass: gravity plus the airflow from driving (−z in the vehicle frame), projected into the pane
    vec3 fl3 = vec3(0.0, -1.0, 0.0) + vec3(0.0, 0.0, -1.0) * clamp(uWs.y * 0.09, 0.0, 3.0); fl3 -= n * dot(fl3, n); float fL = length(fl3);
    vec2 fl = fL > 0.05 ? normalize(vec2(dot(fl3, T), dot(fl3, B))) : vec2(0.0, -1.0); vec2 sd = vec2(-fl.y, fl.x);
    float dens = 0.06 + 0.42 * rk + 0.16 * wk;
    // 84th: the droplets are the authored 2048² rainNrm map (Tex2K.js: 0.6–3.7 mm drops + mist over a 0.5 m tile; RG slope, B coverage,
    // A each drop's appear threshold) at two scales / orientations, instead of two procedural hash layers per pixel
    vec4 rA = texture2D(uRainN, tc * 2.0), rB = texture2D(uRainN, mat2(0.8, -0.6, 0.6, 0.8) * tc * 3.1 + 0.37);
    // drops whose threshold (A) is under the rain density show; the density is cut by the texel footprint, so when a drop would be
    // under a pixel the drops thin out to the wet film instead of averaging (mips) into a grey haze over the pane
    float tpp = max(length(fwidth(tc)) * 4096.0, 1e-3); float lodB = clamp(2.0 - 0.6 * log2(tpp), 0.0, 1.0);
    float dA = clamp(dens, 0.0, 1.0) * lodB, dB = clamp(dens * 0.6, 0.0, 1.0) * lodB;
    vec3 b1 = vec3((rA.rg * 2.0 - 1.0) * 0.9, rA.b * smoothstep(dA, dA - 0.06, rA.a)), b2 = vec3((rB.rg * 2.0 - 1.0) * 0.9, rB.b * smoothstep(dB, dB - 0.06, rB.a)); float lod2 = clamp(1.6 - aa * 2.0, 0.0, 1.0);
    float steep = clamp((fL - 0.35) * 2.0, 0.0, 1.0); vec3 rn = grRun(vec2(dot(tc, sd), -dot(tc, fl)) * vec2(38.0, 38.0), uGrT, (0.15 + 0.5 * rk) * steep * step(0.05, rk));
    // windscreen: this vehicle's swept sectors stay mostly clear, a clean band behind each blade
    float wipe = 1.0;
    if (abs(n.z) > 0.3) { for (int i = 0; i < 2; i++) { vec4 P = uWp[i]; if (P.w <= 0.0) continue; vec3 d = vGrP - P.xyz; float al = dot(d, uWd[i].xyz), up = dot(d, uWu[i].xyz); float r = length(vec2(al, up));
        if (r < P.w * 1.04) { float a = atan(up, al); if (a > -0.06 && a < uWu[i].w + 0.06) { wipe = min(wipe, mix(1.0, 0.22, uWs.x)); if (abs(a - uWd[i].w) < 0.16 && uWs.x > 0.5) wipe = 0.0; } } } }
    float bm = max(b1.z * lod, b2.z * 0.8 * lod2); grM = clamp(max(bm, rn.z * lod) * wipe, 0.0, 1.0);
    grS = (b1.xy * b1.z * lod + b2.xy * b2.z * 0.7 * lod2 + vec2(rn.x, 0.0) * rn.z * lod) * wipe;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.26, 0.29), grM * 0.25);
    diffuseColor.a = clamp(diffuseColor.a + 0.05 * max(wk, rk) + grM * 0.28, 0.0, 1.0);
  } }`;
const GLASS_F_ROUGH = 'roughnessFactor = mix(roughnessFactor, 0.02, grM);';
const GLASS_F_NORMAL = 'normal = normalize(normal + (vGrT * grS.x + vGrB * grS.y) * 0.7);';

// patch a glass shader (base vehicle glass and VehicleDamage's damaged glass both call this) with the rain-on-glass layer
export function patchGlassRain(s, WU) {
  const W = WU || ZERO_WIPE; Object.assign(s.uniforms, RAIN_U, { uRainN: mapUniform('rainNrm'), uWp: W.uWp, uWd: W.uWd, uWu: W.uWu, uWs: W.uWs });
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + GLASS_V_COMMON).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GLASS_V_BEGIN);
  s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + GLASS_F_COMMON).replace('#include <color_fragment>', '#include <color_fragment>\n' + GLASS_F_COLOR)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + GLASS_F_ROUGH).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + GLASS_F_NORMAL);
}
// a vehicle's own glass: a copy of the shared glass (same program for every vehicle), carrying its wiper uniforms
export function rainGlass(proto, WU) {
  const m = new THREE.MeshPhysicalMaterial(); m.copy(proto); m.onBeforeCompile = (s) => patchGlassRain(s, WU); m.customProgramCacheKey = () => 'vglass-rain'; m.userData.wipeU = WU; return m;
}

// ---- grime on paint (shared vpaint / vworn): call from the material's onBeforeCompile
export const GRIME_U = { uGmWet: { value: 0 } };
export function grimePatch(s, heavy) {
  Object.assign(s.uniforms, GRIME_U, { uGmTex: mapUniform('grime') });
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGmP; varying vec3 vGmN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGmP = position; vGmN = objectNormal;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
uniform float uGmWet; uniform sampler2D uGmTex; varying vec3 vGmP; varying vec3 vGmN;
float gmH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float gmN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gmH(i), gmH(i + vec3(1, 0, 0)), f.x), mix(gmH(i + vec3(0, 1, 0)), gmH(i + vec3(1, 1, 0)), f.x), f.y), mix(mix(gmH(i + vec3(0, 0, 1)), gmH(i + vec3(1, 0, 1)), f.x), mix(gmH(i + vec3(0, 1, 1)), gmH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
float gmK = 0.0; vec4 gm = vec4(0.0);
{ float seed = 0.5;
#ifdef USE_COLOR
  seed = fract(dot(vColor.rgb, vec3(17.31, 41.7, 7.13)));
#endif
  float amt = ${heavy ? '0.55 + 0.45 * seed' : '0.12 + 0.55 * seed * seed'};
  vec3 n = normalize(vGmN); float y = vGmP.y;
  // 84th: the authored grime map (Tex2K grime: R dust, G drip streaks, B fine wash scratches, A dried water spots), planar-projected
  // in the body's frame at 2 m per tile, replaces the per-pixel value noise
  vec3 ga = abs(n); vec2 gq = (ga.x > ga.y && ga.x > ga.z) ? vGmP.zy : (ga.y > ga.z ? vGmP.xz : vGmP.xy); gm = texture2D(uGmTex, gq * 0.5);
  float nz = gm.r * 0.75 + gmN(vGmP * 3.0) * 0.25;
  float low = (1.0 - smoothstep(0.22, ${heavy ? '0.95' : '0.7'}, y + (nz - 0.5) * 0.25)) * (0.55 + 0.45 * nz);
  float top = smoothstep(0.75, 0.95, n.y) * smoothstep(0.35, 0.8, nz) * 0.35;
  float wet = clamp(uGmWet, 0.0, 1.0); float streak = gm.g;
  gmK = clamp((low + top * (1.0 - wet * 0.8)) * amt + wet * streak * low * amt * 0.6 + (1.0 - wet) * gm.a * 0.18 * amt, 0.0, 1.0); // + dried water spots once it is dry
  vec3 dust = vec3(0.56, 0.5, 0.42), mud = vec3(0.2, 0.17, 0.13);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(dust, mud, wet) * mix(vec3(1.0), diffuseColor.rgb * 1.6 + 0.3, 0.25), gmK * ${heavy ? '0.62' : '0.5'}); }`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(mix(roughnessFactor, mix(0.92, 0.45, clamp(uGmWet, 0.0, 1.0)), gmK * 0.85) + gm.b * 0.05, 0.04, 1.0);')
    .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - gmK * 0.8;\n#endif');
}

// ---- wiper layouts recorded by the model builders (VehicleModels / VehicleDetail) while one model is built
export const WIP = { cur: null, on: true };
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
// arms: [{ p: pivot, L: arm length, sweep: rad, up: screen-up direction }]; rest direction +x (RHD: parked toward the kerb side).
// Returns true when the layout was taken (the caller then skips its static wiper geometry).
export function wiperSet(arms) {
  if (!WIP.cur || !WIP.on) return false; if (WIP.cur.length) return true;
  for (const a of arms) { const up = nrm(a.up), r = nrm(a.r || [1, 0, 0]); const d = r[0] * up[0] + r[1] * up[1] + r[2] * up[2]; const w = nrm([up[0] - r[0] * d, up[1] - r[1] * d, up[2] - r[2] * d]);
    const n = nrm([r[1] * w[2] - r[2] * w[1], r[2] * w[0] - r[0] * w[2], r[0] * w[1] - r[1] * w[0]]); /* screen normal (outward) */
    const lift = a.lift ?? 0.016; WIP.cur.push({ p: [a.p[0] + n[0] * lift, a.p[1] + n[1] * lift, a.p[2] + n[2] * lift], L: a.L, sweep: a.sweep, r, w, n, big: !!a.big }); }
  return true;
}
// a static wiper beam the caller should skip (another site already took the layout for this model)
export const wiperSkip = () => !!(WIP.cur && WIP.on);
// standard car tandem layout from the glass profile: gh = [[z, yBottom, yTop], …] (VehicleModels D.gh), gw0 = half width at the base
export function carWipers(gh, gw0) {
  const z0 = gh[0][0], y0 = gh[0][1]; const up = [0, gh[1][2] - gh[0][2], gh[1][0] - gh[0][0]]; const y = y0 + 0.035, z = z0 - 0.03;
  const L2 = Math.min(0.58, gw0 - 0.14), x1 = -(gw0 * 0.62); return wiperSet([{ p: [x1, y, z], L: Math.min(0.6, -x1 + 0.03), sweep: 1.36, up }, { p: [0.05, y, z], L: L2, sweep: 1.5, up }]);
}
