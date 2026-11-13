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
}`;
// Sun direction (world, towards the sun) and colour×intensity for leaf translucency; written by Atmosphere every frame.
export const leafLight = { dir: { value: [0, 1, 0] }, col: { value: [0, 0, 0] } };
