// 84th request: shared GLSL for the 2048² detail maps (Tex2K.js / TexLib.js) on meshes that have no authored UVs (vehicle
// cabin, rubber, bird parts, painted bodies): object-space planar projection picked by the dominant normal axis, padded-tile
// sampling with textureGrad (the derivatives of the unwrapped coordinate, so the tile wrap never drops to the smallest mip and
// draws a seam), and a derivative-based tangent frame for the detail normal (no tangent attribute needed).
export const DETAIL_GLSL = `
vec2 dtPlanar(vec3 p, vec3 n) { vec3 a = abs(n); return (a.x > a.y && a.x > a.z) ? p.zy : (a.y > a.z ? p.xz : p.xy); }
vec4 dtTile(sampler2D t, vec2 q, vec2 off, float tiles) { return textureGrad(t, (fract(q) + off) / tiles, dFdx(q) / tiles, dFdy(q) / tiles); }
vec3 dtPerturb(vec3 nrm, vec3 vpos, vec2 q, vec2 nxy, float k) {
  vec3 dp1 = dFdx(-vpos), dp2 = dFdy(-vpos); vec2 du1 = dFdx(q), du2 = dFdy(q);
  vec3 dp2p = cross(dp2, nrm), dp1p = cross(nrm, dp1); vec3 T = dp2p * du1.x + dp1p * du2.x, B = dp2p * du1.y + dp1p * du2.y;
  float im = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12)); return normalize(nrm + (T * im * nxy.x + B * im * nxy.y) * k);
}`;
// object-space position + normal varyings for the planar projection
export const DETAIL_V_COMMON = 'varying vec3 vDtP; varying vec3 vDtN;';
export const DETAIL_V_BEGIN = 'vDtP = position; vDtN = objectNormal;';
