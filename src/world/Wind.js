// Shared wind clock for swaying vegetation (trees, flower beds). Its own module so foliage code can use it without
// importing Vegetation.js (which pulls in the material/interior-mapping chain and would create an import cycle via Parks).
export const windUniform = { value: 0 };
// Helicopter rotor downwash (police helicopter, src/police/Helicopter.js): xyz = rotor hub (world), w = wash strength 0..1
// (rotor thrust × closeness to the ground). Foliage, grass and flower shaders bend away from the column of air under it;
// w = 0 (the usual case) skips the whole term (uniform branch — no cost while no helicopter is near the ground).
export const heliWash = { value: [0, -1000, 0, 0] };
// GLSL: world-space push for a vertex at world position wp (shared by every foliage shader)
export const HELI_WASH_GLSL = `
vec3 heliWashPush(vec3 wp, float tclk) {
  vec2 rd = wp.xz - uHeli.xz; float r = length(rd) + 0.001; float agl = max(0.0, uHeli.y - wp.y);
  float reach = 8.0 + agl * 0.55;                                                // the wash column spreads as it falls
  float k = uHeli.w * exp(-r * r / (reach * reach)) * clamp(1.0 - agl / 40.0, 0.0, 1.0) * (0.35 + 0.65 * smoothstep(0.0, 5.0, r + 2.0));
  float gust = 0.62 + 0.38 * sin(tclk * 17.0 + wp.x * 1.3 + wp.z * 1.1) * sin(tclk * 6.3 + r * 0.7); // blade-pass buffeting
  return vec3(rd / r, -0.3) * k * gust;
}
`; // the trailing newline matters: callers prepend this to shaders that start with #define
// Sun direction (world, towards the sun) and colour×intensity for leaf translucency; written by Atmosphere every frame.
export const leafLight = { dir: { value: [0, 1, 0] }, col: { value: [0, 0, 0] } };
// 83rd: wind DIRECTION + strength for cloth (balcony laundry, curtains: BalconyLife.js) and anything else that should lean
// with the wind. Same single wind as the foliage clock above — World.update drives all three from atmos.w.wind (no second
// weather state). Direction = where the air goes (world XZ, unit): Colombo's prevailing south-west monsoon blows from the sea
// towards the north-east; it wanders ±35° over minutes and veers a little in gusts. Strength = atmos.w.wind smoothed
// (clear 0.3 … storm 1.6), so weather changes ease in.
export const windDir = { value: [0.62, 0.78] };
export const windStr = { value: 0.3 };
// 88th: the vegetation wind (Vegetation.js vertex shaders): xy = direction (= windDir), z = smoothed strength (= windStr),
// w = gust envelope. Gusts are discrete events — a gust builds over 1–2.5 s, holds briefly and settles over 3–6 s, then a
// lull of 4–14 s (shorter and harder in a storm) — so trees bow, recover and rest instead of pumping on one sine. Where a
// gust reaches is a travelling pressure front in the shader (downwind trees catch it later). One vec4, written once a frame.
export const vegWind = { value: [0.62, 0.78, 0.3, 0] };
const WS = { t: 0, s: 0.3, g: 0, gA: 0, gT: 0, gPh: 3, gUp: 1.5, gHold: 0.6, gDown: 4, seed: 9137 };
const wrnd = () => ((WS.seed = (WS.seed * 16807) % 2147483647) / 2147483647);
export function stepWind(dt, wind) { WS.t += dt; WS.s += (wind - WS.s) * Math.min(1, dt * 0.25); windStr.value = WS.s;
  const a = 0.9 + Math.sin(WS.t * 0.013) * 0.42 + Math.sin(WS.t * 0.051 + 1.7) * 0.18 + Math.sin(WS.t * 0.37) * 0.05 * WS.s + WS.g * 0.12; windDir.value[0] = Math.sin(a); windDir.value[1] = Math.cos(a);
  // gust state machine: phase 0 rise, 1 hold, 2 settle, 3 lull
  WS.gT += dt; const s = WS.s;
  if (WS.gPh === 3 && WS.gT > WS.lull) { WS.gPh = 0; WS.gT = 0; WS.gA = (0.25 + 0.75 * wrnd()) * (0.12 + 0.5 * s); WS.gUp = 1 + 1.5 * wrnd(); WS.gHold = 0.3 + 1.2 * wrnd(); WS.gDown = 3 + 3 * wrnd(); }
  else if (WS.gPh === 0 && WS.gT > WS.gUp) { WS.gPh = 1; WS.gT = 0; } else if (WS.gPh === 1 && WS.gT > WS.gHold) { WS.gPh = 2; WS.gT = 0; }
  else if (WS.gPh === 2 && WS.gT > WS.gDown) { WS.gPh = 3; WS.gT = 0; WS.lull = (4 + 10 * wrnd()) / (0.6 + s * 0.6); }
  const u = WS.gPh === 0 ? WS.gT / WS.gUp : WS.gPh === 1 ? 1 : WS.gPh === 2 ? 1 - WS.gT / WS.gDown : 0; const e = u * u * (3 - 2 * u);
  WS.g = WS.gA * e; const v = vegWind.value; v[0] = windDir.value[0]; v[1] = windDir.value[1]; v[2] = s; v[3] = WS.g; }
WS.lull = 5;
// GLSL helpers shared by the cloth shaders (uWindT = windUniform clock, uWindDir, uWindStr)
export const CLOTH_WIND_GLSL = `
uniform float uWindT; uniform vec2 uWindDir; uniform float uWindStr;
// gust envelope 0..1+ at world xz: slow travelling pressure waves along the wind, so neighbouring balconies gust in sequence
float clothGust(vec2 p) { float a = dot(p, uWindDir) * 0.07 - uWindT * 0.55; float b = dot(p, vec2(-uWindDir.y, uWindDir.x)) * 0.05;
  return 0.55 + 0.3 * sin(a) + 0.2 * sin(a * 2.3 + b + 1.3) + 0.12 * sin(uWindT * 1.7 + p.x * 0.3); }
`;
