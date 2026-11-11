// Cinematic output (Visual Phase 2): time-of-day colour grading with 32³ LUTs, lens flare + anamorphic streak from the visible
// sun, and screen-space light shafts (god rays) — all inside ONE pass that also does the tone mapping and sRGB encoding.
//
// Pipeline position (PostFX): RenderPass → depth tap → Sanitize → [GTAO] → [Bloom] → CinePass → Transit → Senses → SMAA.
//   · sun light shafts and lens flare are light: they are added to the linear HDR image BEFORE tone mapping (exposure and the
//     ACES shoulder treat them like the rest of the scene, so they can never clip or wash the frame out);
//   · tone mapping (ACES Filmic, the renderer's exposure — same maths as three's OutputPass) and the sRGB transfer follow;
//   · the grade is applied ONCE, to the display-referred sRGB image — the domain colour-grading LUTs are authored in — by
//     blending up to five 32³ LUTs (morning / midday / golden hour / night / monsoon) with weights from the sun and the weather;
//   · vignette, lightning flash and a ±½-LSB dither come last (the dither removes 8-bit banding from sky gradients).
// The old chain (OutputPass, then GradeShader as a second full-screen pass on already tone-mapped values) is replaced.
//
// Quality levels (QUALITY_PRESETS.cine): 0 Low — grade only · 1 Medium — + sun visibility, flare, streak · 2 High — + light
// shafts at ¼ resolution (16 + 8 radial taps) · 3 Ultra — light shafts at ½ resolution (24 + 10 taps).
// Every sun effect is skipped (no passes run) at night, indoors, in heavy weather and whenever the sun is well off-screen.
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export const LUT_N = 32;
// ------------------------------------------------------------------------------------------------------------ grade profiles
// All operations act on the display-referred sRGB colour coming out of ACES:
//   wb          white balance, multiplied in linear light and renormalised to keep luminance
//   shTint/shK  shadow tint (luminance-normalised) and its strength;  hiTint/hiK  highlight tint (protected near pure white)
//   sat         global saturation; shSat / hiSat extra factors in the shadows / highlights; greenSat for foliage hues
//   contrast    S-curve slope at the pivot (display space; the toe keeps a non-zero slope so blacks never crush)
//   lift        black-floor lift;  gamma  midtone power (<1 brighter);  expo  pre-tone-map exposure multiplier
export const PROFILES = {
  morning: { wb: [1.045, 1.0, 0.93], shTint: [0.94, 1.0, 1.08], shK: 0.55, hiTint: [1.1, 1.0, 0.85], hiK: 0.6, sat: 1.05, shSat: 0.97, hiSat: 1.04, greenSat: 0.95, contrast: 1.07, pivot: 0.42, lift: 0.008, gamma: 0.98, expo: 1.03 },
  midday:  { wb: [1.0, 1.0, 0.985], shTint: [0.97, 1.0, 1.04], shK: 0.35, hiTint: [1.025, 1.0, 0.965], hiK: 0.3, sat: 1.03, shSat: 1.0, hiSat: 0.97, greenSat: 0.92, contrast: 1.08, pivot: 0.44, lift: 0.005, gamma: 1.03, expo: 0.97 },
  golden:  { wb: [1.07, 1.0, 0.87], shTint: [0.9, 1.0, 1.12], shK: 0.6, hiTint: [1.14, 0.99, 0.78], hiK: 0.75, sat: 1.07, shSat: 0.95, hiSat: 1.08, greenSat: 0.88, contrast: 1.12, pivot: 0.42, lift: 0.012, gamma: 0.97, expo: 1.06 },
  night:   { wb: [0.985, 1.0, 1.03], shTint: [0.9, 1.0, 1.14], shK: 0.5, hiTint: [1.12, 1.0, 0.82], hiK: 0.55, sat: 1.0, shSat: 0.8, hiSat: 1.12, greenSat: 0.9, contrast: 1.1, pivot: 0.36, lift: 0.012, gamma: 0.96, expo: 1.0 },
  monsoon: { wb: [0.96, 1.0, 1.05], shTint: [0.96, 1.0, 1.05], shK: 0.4, hiTint: [0.98, 1.0, 1.03], hiK: 0.3, sat: 0.8, shSat: 0.95, hiSat: 0.95, greenSat: 0.88, contrast: 1.04, pivot: 0.44, lift: 0.01, gamma: 1.0, expo: 1.02 },
};
export const PROFILE_ORDER = ['morning', 'midday', 'golden', 'night', 'monsoon'];
export const IDENTITY_PROFILE = { wb: [1, 1, 1], shTint: [1, 1, 1], shK: 0, hiTint: [1, 1, 1], hiK: 0, sat: 1, shSat: 1, hiSat: 1, greenSat: 1, contrast: 1, pivot: 0.44, lift: 0, gamma: 1, expo: 1 };

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const unitLum = (t) => { const y = lum(t[0], t[1], t[2]); return [t[0] / y, t[1] / y, t[2] / y]; };
// contrast S-curve through (0,0), (pivot,pivot), (1,1) with slope `c` at the pivot; the toe is blended back towards linear so
// the slope at black stays ≥ ~0.75 (detail in dark areas survives)
function sCurve(x, p, c) {
  if (c === 1) return x;
  const s = x < p ? p * Math.pow(x / p, c) : 1 - (1 - p) * Math.pow((1 - x) / (1 - p), c);
  const toe = ss(0, p * 0.6, x); return x < p ? x + (s - x) * (0.35 + 0.65 * toe) : s;
}
// hue (0..1) of a linear RGB colour and its chroma
function hueOf(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d < 1e-6) return [0, 0]; let h; if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; if (h < 0) h += 1; return [h, d / Math.max(mx, 1e-6)]; }

// grade one display-referred sRGB colour (0..1) with profile P → [r, g, b] (0..1)
export function gradeColor(P, r, g, b) {
  let R = s2l(r), G = s2l(g), B = s2l(b);
  const wb = unitLum(P.wb); R *= wb[0]; G *= wb[1]; B *= wb[2];
  let Y = lum(R, G, B);
  if (P.shK > 0 || P.hiK > 0) {
    const sh = (1 - ss(0.0, 0.22, Y)) * P.shK, hi = ss(0.16, 0.75, Y) * (1 - 0.55 * ss(0.85, 1.0, Y)) * P.hiK; // pure white stays near white
    const st = unitLum(P.shTint), ht = unitLum(P.hiTint);
    R *= (1 + (st[0] - 1) * sh) * (1 + (ht[0] - 1) * hi); G *= (1 + (st[1] - 1) * sh) * (1 + (ht[1] - 1) * hi); B *= (1 + (st[2] - 1) * sh) * (1 + (ht[2] - 1) * hi);
  }
  Y = lum(R, G, B);
  let sat = P.sat * (P.shSat + (1 - P.shSat) * ss(0.0, 0.2, Y)) * (1 + (P.hiSat - 1) * ss(0.3, 0.9, Y));
  if (P.greenSat !== 1) { const [h, c] = hueOf(R, G, B); const gw = Math.max(0, 1 - Math.abs(h - 0.3) / 0.12) * ss(0.05, 0.3, c); sat *= 1 + (P.greenSat - 1) * gw; } // foliage greens (hue ≈ 75–150°)
  R = Math.max(0, Y + (R - Y) * sat); G = Math.max(0, Y + (G - Y) * sat); B = Math.max(0, Y + (B - Y) * sat);
  const mx = Math.max(R, G, B); if (mx > 1) { const k = 1 / mx, t = ss(1, 1.6, mx); R = R * (1 - t) + R * k * t; G = G * (1 - t) + G * k * t; B = B * (1 - t) + B * k * t; } // hue-preserving soft clip
  const out = [l2s(Math.min(1, R)), l2s(Math.min(1, G)), l2s(Math.min(1, B))];
  for (let i = 0; i < 3; i++) { let v = sCurve(out[i], P.pivot, P.contrast); v = P.lift + (1 - P.lift) * v; v = Math.pow(Math.min(1, Math.max(0, v)), P.gamma); out[i] = v; }
  return out;
}
// the five LUTs stacked along z in one 32 × 32 × 160 half-float 3D texture (1.3 MB). Slice s, blue b → z texel s·32 + b, so a
// lookup never filters across two LUTs (z is addressed at texel centres within the slice).
export function buildLUTData(profiles = PROFILE_ORDER.map((k) => PROFILES[k])) {
  const N = LUT_N, S = profiles.length, data = new Float32Array(N * N * N * S * 4);
  for (let s = 0; s < S; s++) for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) {
    const o = gradeColor(profiles[s], r / (N - 1), g / (N - 1), b / (N - 1)); const i = ((s * N + b) * N * N + g * N + r) * 4;
    data[i] = o[0]; data[i + 1] = o[1]; data[i + 2] = o[2]; data[i + 3] = 1;
  }
  return data;
}
let LUT_TEX = null; // built once (≈ 0.16 M graded colours), shared by every CinePass the composer is rebuilt with
function buildLUTTexture() {
  if (LUT_TEX) return LUT_TEX;
  const f = buildLUTData(), h = new Uint16Array(f.length); for (let i = 0; i < f.length; i++) h[i] = THREE.DataUtils.toHalfFloat(f[i]);
  const t = new THREE.Data3DTexture(h, LUT_N, LUT_N, LUT_N * PROFILE_ORDER.length);
  t.format = THREE.RGBAFormat; t.type = THREE.HalfFloatType; t.minFilter = t.magFilter = THREE.LinearFilter; t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping; t.generateMipmaps = false; t.unpackAlignment = 1; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
  return (LUT_TEX = t);
}
// profile weights from the sun and weather (morning, midday, golden, night, monsoon); sums to 1
export function profileWeights(sunY, hour, night, dark, out = new Array(5)) {
  const low = 1 - ss(0.36, 0.62, Math.max(0, sunY)); // 1 with the sun below ~21°: 17:00 is full golden hour, 15:30 is midday
  const day = 1 - night, am = hour < 12;
  const mon = ss(0.25, 0.8, dark) * (1 - 0.5 * night); // overcast → rain → storm; at night the monsoon look only mutes the night grade
  out[0] = am ? day * low : 0; out[1] = day * (1 - low); out[2] = am ? 0 : day * low; out[3] = night;
  for (let i = 0; i < 4; i++) out[i] *= 1 - mon; out[4] = mon;
  return out;
}

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const SKY_FN = `float isSky(vec2 uv) { float d = texture2D(tDepth, uv).x; return uRev > 0.5 ? step(d, 1e-9) : step(0.9999999, d); }`;
// sun visibility: depth occlusion over the disc (palms, buildings, the player) × a cloud gate (the disc's brightness against
// the sky just outside it), into a 1×1 target blended with the previous frames (smooth, no flicker); GPU-only, no readback
const VisFS = `uniform sampler2D tDepth; uniform sampler2D tColor; uniform vec2 uSun; uniform float uAspect, uRev, uR, uAlpha; varying vec2 vUv;
  ${SKY_FN}
  float L(vec2 uv) { return dot(texture2D(tColor, uv).rgb, vec3(0.2126, 0.7152, 0.0722)); }
  void main() {
    float vis = 0.0, n = 0.0;
    for (int i = 0; i < 24; i++) { float a = float(i) * 2.39996; float r = uR * 1.25 * sqrt((float(i) + 0.5) / 24.0); vec2 uv = uSun + vec2(cos(a) / uAspect, sin(a)) * r;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue; n += 1.0; vis += isSky(uv); }
    vis = n > 0.0 ? vis / n : 0.0;
    float c = 0.0, ring = 0.0; for (int i = 0; i < 5; i++) { float a = float(i) * 1.2566; c += L(uSun + vec2(cos(a) / uAspect, sin(a)) * uR * 0.35 * float(i > 0)); }
    for (int i = 0; i < 8; i++) { float a = float(i) * 0.7854; ring += L(uSun + vec2(cos(a) / uAspect, sin(a)) * uR * 2.6); }
    float clear = smoothstep(1.35, 3.0, (c / 5.0) / max(ring / 8.0, 0.05));
    gl_FragColor = vec4(vis * clear, vis, clear, uAlpha);
  }`;
// light shafts, step 1 (reduced resolution): open sky close to the sun (a tight radial falloff), 0 wherever geometry occludes it
// (4 depth taps → soft occluder edges for palm fronds). Occlusion, not brightness: the scattered light only shows where palms,
// buildings and wires cut it into shafts, and the open sky never turns into a uniform veil.
const MaskFS = `uniform sampler2D tDepth; uniform vec2 uSun, uTexel; uniform float uAspect, uRev, uFall, uNear, uFar, uRayDist; varying vec2 vUv;
  ${SKY_FN}
  void main() {
    float s = 0.25 * (isSky(vUv + uTexel * vec2(-0.3, -0.3)) + isSky(vUv + uTexel * vec2(0.3, -0.3)) + isSky(vUv + uTexel * vec2(-0.3, 0.3)) + isSky(vUv + uTexel * vec2(0.3, 0.3)));
    vec2 d = vUv - uSun; d.x *= uAspect; float f = exp(-dot(d, d) * uFall);
    // in-scatter weight: the air between the camera and the surface (the nearest of the tap's footprint, so object edges stay clean)
    vec2 o = uTexel * 0.5; float d = uRev > 0.5 ? max(max(texture2D(tDepth, vUv + vec2(-o.x, -o.y)).x, texture2D(tDepth, vUv + vec2(o.x, -o.y)).x), max(texture2D(tDepth, vUv + vec2(-o.x, o.y)).x, texture2D(tDepth, vUv + o).x))
                                     : min(min(texture2D(tDepth, vUv + vec2(-o.x, -o.y)).x, texture2D(tDepth, vUv + vec2(o.x, -o.y)).x), min(texture2D(tDepth, vUv + vec2(-o.x, o.y)).x, texture2D(tDepth, vUv + o).x));
    float dist = uRev > 0.5 ? (d <= 0.0 ? 1e6 : uNear / d) : (d >= 1.0 ? 1e6 : (uNear * uFar) / (uFar - (uFar - uNear) * d));
    gl_FragColor = vec4(s * f, 1.0 - exp(-dist / uRayDist), 0.0, 1.0);
  }`;
// step 2/3: radial scattering towards the sun's screen position; interleaved-gradient jitter replaces stepping rings with fine
// noise that the second (short) pass smooths out
const BlurFS = (N) => `uniform sampler2D tIn; uniform vec2 uSun; uniform float uLen, uDecay; varying vec2 vUv;
  void main() {
    vec2 delta = (uSun - vUv) * uLen / ${N}.0; float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec2 p = vUv + delta * j; float w = 1.0, acc = 0.0, tot = 0.0;
    for (int i = 0; i < ${N}; i++) { acc += texture2D(tIn, p).r * w; tot += w; w *= uDecay; p += delta; }
    gl_FragColor = vec4(acc / tot, texture2D(tIn, vUv).g, 0.0, 1.0); // .g (in-scatter weight) passes through unblurred
  }`;
const FinalFS = `precision highp sampler3D;
  uniform sampler2D tDiffuse; uniform sampler2D tVis; uniform sampler2D tRays; uniform sampler3D tLUT;
  uniform float toneMappingExposure, uExpo, uTM, uVig, uFlash, uWet, uTime, uAspect, uRayK, uUseVis, uUseRays;
  uniform vec4 uW0; uniform float uW4; uniform vec4 uSun; uniform vec3 uSunCol;
  varying vec2 vUv;
  vec3 RRTAndODTFit(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 acesFilmic(vec3 color) { // identical to three's ACESFilmicToneMapping (OutputPass)
    const mat3 ACESInputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 ACESOutputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color *= toneMappingExposure / 0.6; color = ACESInputMat * color; color = RRTAndODTFit(color); color = ACESOutputMat * color; return clamp(color, 0.0, 1.0); }
  vec3 srgbOETF(vec3 c) { return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
  vec3 lut(float s, vec3 c) { vec2 xy = (c.rg * 31.0 + 0.5) / 32.0; float z = (s * 32.0 + c.b * 31.0 + 0.5) / 160.0; return texture(tLUT, vec3(xy, z)).rgb; }
  float ghost(vec2 uv, vec2 p, float r) { vec2 d = (uv - p) * vec2(uAspect, 1.0); return smoothstep(r, r * 0.55, length(d)); }
  vec3 lensFlare(vec2 uv) {
    vec2 s = uSun.xy, d = (uv - s) * vec2(uAspect, 1.0); float r = length(d);
    vec3 c = uSunCol * (exp(-r * 45.0) * 1.1 + exp(-r * 9.0) * 0.12) * uSun.z;                          // glare round the disc (bloom is off by day)
    float st = exp(-abs(d.y) * 220.0) * (exp(-abs(d.x) * 3.2) * 0.75 + exp(-abs(d.x) * 0.8) * 0.25);        // anamorphic streak
    c += mix(uSunCol, vec3(0.72, 0.86, 1.0), 0.5) * st * uSun.w;
    vec2 ax = vec2(0.5) - s;                                                                               // ghosts on the axis through the centre
    vec3 gh = vec3(1.0, 0.72, 0.38) * ghost(uv, s + ax * 0.55, 0.028) * 0.030 + vec3(0.42, 0.85, 0.75) * ghost(uv, s + ax * 0.92, 0.065) * 0.012
            + vec3(0.62, 0.48, 1.0) * ghost(uv, s + ax * 1.32, 0.018) * 0.026 + vec3(0.9, 0.8, 0.55) * (ghost(uv, s + ax * 1.72, 0.11) - ghost(uv, s + ax * 1.72, 0.095)) * 0.016
            + vec3(1.0, 0.85, 0.6) * ghost(uv, s - ax * 0.22, 0.012) * 0.02;
    return c + gh * uSunCol * uSun.z;
  }
  void main() {
    vec3 col = texture2D(tDiffuse, vUv).rgb;
    if (uUseRays > 0.5) { vec2 rg = texture2D(tRays, vUv).rg; col += rg.x * rg.y * uRayK * uSunCol; } // shafts × in-scatter weight: full against the
    // sky / far geometry, a fraction on near objects (a palm crown or a car is not washed out by the shaft drawn across it)
    if (uSun.z > 0.0) { float vis = uUseVis > 0.5 ? texture2D(tVis, vec2(0.5)).r : 0.0; if (vis > 0.002) col += lensFlare(vUv) * vis; }
    col *= uExpo;
    col = uTM > 0.5 ? acesFilmic(col) : clamp(col * toneMappingExposure, 0.0, 1.0);
    col = srgbOETF(col);
    vec3 g = vec3(0.0);
    if (uW0.x > 0.001) g += lut(0.0, col) * uW0.x; if (uW0.y > 0.001) g += lut(1.0, col) * uW0.y; if (uW0.z > 0.001) g += lut(2.0, col) * uW0.z;
    if (uW0.w > 0.001) g += lut(3.0, col) * uW0.w; if (uW4 > 0.001) g += lut(4.0, col) * uW4;
    float wsum = uW0.x + uW0.y + uW0.z + uW0.w + uW4; col = wsum > 0.001 ? g / wsum : col;
    if (uWet > 0.0) { float l = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = mix(col, vec3(l), uWet * 0.05); }
    float v = smoothstep(0.85, 0.25, length(vUv - 0.5)); col *= mix(1.0 - uVig, 1.0, v);
    col += uFlash * vec3(0.6, 0.65, 0.8);
    float n = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453) + fract(sin(dot(gl_FragCoord.xy - uTime, vec2(39.3468, 11.1353))) * 24634.6345) - 1.0;
    col += n / 255.0;
    gl_FragColor = vec4(col, 1.0);
  }`;

const _v4 = new THREE.Vector4(), _col = new THREE.Color();
const sm = (a, b, x) => ss(a, b, x);
export const CINE = { sunRad: 0.0075, rayFall: 9.0, rayK: 0.2, rayDist: 70, flare: 1.0, streak: 0.45, gradeRate: 1.5 };

export class CinePass extends Pass {
  constructor(level = 1, w = 1, h = 1) {
    super(); this.level = level; this.depthTex = null; this.rev = 1; this.flareOn = true; this.raysOn = true; this.warmed = false;
    this.lut = buildLUTTexture();
    const U = { tDiffuse: { value: null }, tVis: { value: null }, tRays: { value: null }, tLUT: { value: this.lut }, toneMappingExposure: { value: 1 }, uExpo: { value: 1 }, uTM: { value: 1 }, uVig: { value: 0.18 }, uFlash: { value: 0 }, uWet: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1.78 },
      uRayK: { value: 0 }, uUseVis: { value: 0 }, uUseRays: { value: 0 }, uW0: { value: new THREE.Vector4(0, 1, 0, 0) }, uW4: { value: 0 }, uSun: { value: new THREE.Vector4(0.5, 0.5, 0, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) } };
    this.uniforms = U; this.mat = new THREE.ShaderMaterial({ name: 'CineOutput', uniforms: U, vertexShader: VS, fragmentShader: FinalFS, depthTest: false, depthWrite: false }); this.quad = new FullScreenQuad(this.mat);
    if (level >= 1) {
      this.visRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      this.visMat = new THREE.ShaderMaterial({ name: 'CineSunVis', uniforms: { tDepth: { value: null }, tColor: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1.78 }, uRev: { value: 1 }, uR: { value: 0.01 }, uAlpha: { value: 1 } }, vertexShader: VS, fragmentShader: VisFS, depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.ZeroFactor });
      this.visQuad = new FullScreenQuad(this.visMat); U.tVis.value = this.visRT.texture;
    }
    if (level >= 2) {
      this.rayScale = level >= 3 ? 0.5 : 0.25; const N1 = level >= 3 ? 24 : 16, N2 = level >= 3 ? 10 : 8; this.N1 = N1;
      const o = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      this.rtA = new THREE.WebGLRenderTarget(1, 1, o); this.rtB = new THREE.WebGLRenderTarget(1, 1, o);
      this.maskMat = new THREE.ShaderMaterial({ name: 'CineRayMask', uniforms: { tDepth: { value: null }, uSun: { value: new THREE.Vector2() }, uTexel: { value: new THREE.Vector2() }, uAspect: { value: 1.78 }, uRev: { value: 1 }, uFall: { value: CINE.rayFall }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uRayDist: { value: CINE.rayDist } }, vertexShader: VS, fragmentShader: MaskFS, depthTest: false, depthWrite: false });
      const blur = (N) => new THREE.ShaderMaterial({ name: 'CineRayBlur' + N, uniforms: { tIn: { value: null }, uSun: { value: new THREE.Vector2() }, uLen: { value: 1 }, uDecay: { value: 1 } }, vertexShader: VS, fragmentShader: BlurFS(N), depthTest: false, depthWrite: false });
      this.blur1 = blur(N1); this.blur2 = blur(N2); this.maskQuad = new FullScreenQuad(this.maskMat); this.b1Quad = new FullScreenQuad(this.blur1); this.b2Quad = new FullScreenQuad(this.blur2);
      U.tRays.value = this.rtA.texture;
    }
    this.sunVis = false; this.sunRays = false; this.lastSun = null; this.setSize(w, h);
  }
  setSize(w, h) { this.w = w; this.h = h; if (this.rtA) { const rw = Math.max(1, Math.round(w * this.rayScale)), rh = Math.max(1, Math.round(h * this.rayScale)); this.rtA.setSize(rw, rh); this.rtB.setSize(rw, rh); } }
  // per frame (PostFX.update): profile weights, exposure and the sun's screen position / strength
  setFrame(camera, atmos, opts) {
    const U = this.uniforms, aspect = this.w / Math.max(1, this.h); U.uAspect.value = aspect; U.uTime.value = (U.uTime.value + 0.618) % 97;
    const w = opts.weights; U.uW0.value.set(w[0], w[1], w[2], w[3]); U.uW4.value = w[4]; U.uExpo.value = opts.expo;
    // sun on screen: the direction projected as a point at infinity
    const s = atmos.sunDir, elev = s.y; let on = false, sx = 0.5, sy = 0.5, edge = 0;
    if (!opts.indoor && elev > -0.02 && atmos.night < 0.95) {
      _v4.set(s.x, s.y, s.z, 0).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      if (_v4.w > 1e-4) { sx = (_v4.x / _v4.w) * 0.5 + 0.5; sy = (_v4.y / _v4.w) * 0.5 + 0.5; edge = Math.min(sx, 1 - sx, sy, 1 - sy); on = edge > -0.45; }
    }
    const sunPow = sm(-0.01, 0.07, elev) * (1 - atmos.night) * (1 - (atmos.w ? atmos.w.dark : 0) * 0.95) * (1 - (atmos.w ? atmos.w.cloud : 0) * 0.35);
    _col.copy(atmos.sun.color); if (elev < 0.02) _col.setRGB(1, 0.55, 0.3);
    U.uSunCol.value.copy(_col); U.uSun.value.x = sx; U.uSun.value.y = sy;
    const inFrame = sm(-0.02, 0.06, edge); // flare / streak only while the disc itself is (nearly) in frame
    const flare = this.level >= 1 && this.flareOn && on && sunPow > 0.01 ? inFrame * sunPow : 0;
    U.uSun.value.z = flare * CINE.flare; U.uSun.value.w = flare * CINE.streak * (0.6 + 0.4 * atmos.golden);
    this.sunVis = flare > 0.001; U.uUseVis.value = this.sunVis ? 1 : 0;
    // light shafts: stronger with a low sun (golden hour / morning), still present at midday when the sun is in view
    const low = 1 - sm(0.12, 0.75, elev); const rays = this.level >= 2 && this.raysOn && on && sunPow > 0.02 ? sm(-0.45, 0.05, edge) * sunPow * (0.45 + 0.75 * low) : 0;
    this.sunRays = rays > 0.002; U.uUseRays.value = this.sunRays ? 1 : 0; U.uRayK.value = rays * CINE.rayK;
    this.sunInfoV = { on, sx: +sx.toFixed(3), sy: +sy.toFixed(3), flare: +flare.toFixed(3), rays: +rays.toFixed(3) };
    // disc radius in uv (vertical): angle / (2 tan(fov/2))
    this.near = camera.near; this.far = camera.far;
    this.discR = CINE.sunRad / (2 * Math.tan((camera.fov * Math.PI / 180) / 2)); this.dt = opts.dt || 0.016;
  }
  sunInfo() { return this.sunInfoV || null; }
  render(renderer, writeBuffer, readBuffer) {
    const U = this.uniforms, depth = this.depthTex, aspect = U.uAspect.value; U.tDiffuse.value = readBuffer.texture; U.toneMappingExposure.value = renderer.toneMappingExposure; U.uTM.value = renderer.toneMapping === THREE.NoToneMapping ? 0 : 1;
    const warm = !this.warmed && depth; // the first frame (loading screen) runs every pass once so no program compiles mid-play
    if (depth && this.visRT && (this.sunVis || warm)) {
      const m = this.visMat.uniforms; m.tDepth.value = depth; m.tColor.value = readBuffer.texture; m.uSun.value.set(U.uSun.value.x, U.uSun.value.y); m.uAspect.value = aspect; m.uRev.value = this.rev; m.uR.value = this.discR || 0.01; m.uAlpha.value = warm ? 1 : 1 - Math.exp(-(this.dt || 0.016) * 14);
      const ac = renderer.autoClear; renderer.autoClear = false; renderer.setRenderTarget(this.visRT); this.visQuad.render(renderer); renderer.autoClear = ac; // blended with the previous frames
    }
    if (depth && this.rtA && (this.sunRays || warm)) {
      const sun = U.uSun.value, mk = this.maskMat.uniforms; mk.tDepth.value = depth; mk.uFall.value = CINE.rayFall; mk.uSun.value.set(sun.x, sun.y); mk.uTexel.value.set(1 / this.rtB.width, 1 / this.rtB.height); mk.uAspect.value = aspect; mk.uRev.value = this.rev; mk.uNear.value = this.near || 0.1; mk.uFar.value = this.far || 1000; mk.uRayDist.value = CINE.rayDist;
      renderer.setRenderTarget(this.rtB); this.maskQuad.render(renderer);
      const b1 = this.blur1.uniforms; b1.tIn.value = this.rtB.texture; b1.uSun.value.set(sun.x, sun.y); b1.uLen.value = 0.92; b1.uDecay.value = 0.965; renderer.setRenderTarget(this.rtA); this.b1Quad.render(renderer);
      const b2 = this.blur2.uniforms; b2.tIn.value = this.rtA.texture; b2.uSun.value.set(sun.x, sun.y); b2.uLen.value = 0.92 / this.N1; b2.uDecay.value = 1; renderer.setRenderTarget(this.rtB); this.b2Quad.render(renderer);
      U.tRays.value = this.rtB.texture;
    }
    if (warm) this.warmed = true;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
  }
  dispose() { this.mat.dispose(); this.quad.dispose(); for (const k of ['visRT', 'rtA', 'rtB', 'visMat', 'maskMat', 'blur1', 'blur2', 'visQuad', 'maskQuad', 'b1Quad', 'b2Quad']) if (this[k]) this[k].dispose(); }
}
// records the main pass's depth texture (the composer ping-pongs its targets, so which one holds this frame's depth varies)
export class DepthTapPass extends Pass {
  constructor(cine) { super(); this.cine = cine; this.needsSwap = false; }
  render(renderer, writeBuffer, readBuffer) { if (this.cine) this.cine.depthTex = readBuffer.depthTexture || null; }
}
