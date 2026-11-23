// 88th: tree / shrub leaves from ONE photographic leaf atlas (public/assets/vegetation/T_Ironwood_Leaves_BaseColor.jpg —
// the user's base-colour sheet: 4 × 2 single leaves on black; top row healthy green, scuffed green, yellow-green, yellow
// spotted; bottom row torn green, spotted green with holes, brown dry, decayed skeleton).
//
// A leaf CARD (the alpha-tested quads the crowns, shrubs, hedges and creepers are built from) is no longer one painted
// cluster image repeated on every card. The fragment shader lays a sprig of real leaves over the card on the fly
// ("texture bombing"): the card is cut into N × N cells, each cell may hold one leaf — its own atlas tile (mostly healthy
// greens, a species-dependent share of yellowed / dry / skeleton leaves), rotation about a per-card sprig direction,
// size, jitter, mirror and brightness — and a fragment only looks at the 2 × 2 cells around it in a fixed per-card
// order, stopping at the first opaque leaf (~1.3 texture reads on average, all with explicit gradients so mip-mapping
// stays correct across leaf borders). Every card differs (seed = hash of its vertex colour + the tree), so no two
// sprigs repeat. Each leaf also tilts the shading normal and gets its own waxy gloss, so a card no longer lights as one
// flat plane, and near the camera each leaf flutters on its own (a tiny rotation in the shader — nothing moves on the CPU).
// Once a cell is smaller than ~1.4 px (distant crowns), the card reads as a soft clump with the leaves' mean colour from
// a high mip: one texture read, no sub-pixel leaf shimmer, cheaper than the old card.
//
// Card data rides in the existing uv attribute (no new vertex attribute, no extra memory): uv = corner (0/1) + 2 × int,
// int(u) = style (+16 for the far-LOD card, whose cells are 1.75 × as many so leaves keep their size), int(v) = branch
// flexibility 0..63 for the wind (Vegetation.js). Plain cards (hedges, creepers, uv 0..1) are style 0, flexibility 0.
//
// Texture Studio: MAT.leaves is "Tree leaves"; its base-colour slot is this image (as uploaded, resampled to 768² with
// the black background keyed to alpha). Roughness / normal / AO maps added there are read through the same per-leaf uv
// (the shader redirects their uv to the leaf being drawn), so a PBR set of the same sheet lines up leaf for leaf.
import * as THREE from 'three';
import { windUniform } from './Wind.js';

export const LEAF_FILE = 'T_Ironwood_Leaves_BaseColor.jpg';
export const LEAF_PX = 768; // GPU copy: 768² RGBA + mips ≈ 3.1 MB — what the three painted leaf textures it replaces took
// style table: [cells across a card, leaf width (× tile), share of cells holding a leaf, share of aged leaves,
//               orientation spread about the sprig direction (rad), gloss]
export const LEAF_STYLE = { generic: 0, broad: 1, narrow: 2, bo: 3, frangipani: 4, fine: 5, almond: 6, shrub: 7, small: 8, croton: 9 };
export const LEAF_FAR = 16;
const STYLES = [
  [4.5, 0.85, 0.97, 0.03, 1.6, 0.5],  // 0 generic: hedges, creepers, anything with plain 0..1 cards
  [8.0, 0.9, 0.94, 0.05, 1.3, 0.45],  // 1 broad crowns: rain tree, mara, nuga
  [7.0, 0.6, 0.97, 0.03, 0.9, 0.9],   // 2 long narrow glossy: mango, jak, ashoka
  [7.0, 1.08, 0.93, 0.04, 1.4, 0.6],  // 3 bo: broad, bright, fluttering
  [4.5, 0.75, 0.86, 0.06, 1.8, 0.55], // 4 frangipani: few big leaves at the branch tips
  [12.0, 0.55, 0.9, 0.05, 1.2, 0.35], // 5 fine feathery: flamboyant
  [5.5, 1.0, 0.95, 0.1, 1.5, 0.75],   // 6 tropical almond (kottamba): big leathery, some turning
  [5.0, 0.85, 0.95, 0.04, 1.7, 0.6],  // 7 garden shrub: hibiscus, generic shrub
  [6.5, 0.65, 0.95, 0.04, 1.6, 0.5],  // 8 small leaves: ixora, bougainvillea, weeds
  [4.0, 0.55, 0.95, 0.22, 1.5, 0.85], // 9 croton (variegated: more of the yellow tiles; colour from the vertex tint)
];
export const LEAF_STYLE_COUNT = STYLES.length;
// write the card data into a quad's 4 uv pairs (MeshBuilder arrays), uv already 0/1 corners
export function encodeLeafCard(uv, v0, style, flex) {
  const su = 2 * style, sv = 2 * Math.max(0, Math.min(63, Math.round(flex * 63)));
  for (let i = v0; i < v0 + 4; i++) { uv[i * 2] += su; uv[i * 2 + 1] += sv; }
}
const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const SA = STYLES.map((s) => `vec4(${f(s[0])}, ${f(s[1])}, ${f(s[2])}, ${f(s[3])})`).join(', ');
const SB = STYLES.map((s) => `vec2(${f(s[4])}, ${f(s[5])})`).join(', ');

// ---------------------------------------------------------------------------------------------- GLSL
// 88th (perf pass): one cheap integer hash per cell (bits sliced for presence / jitter / angle, a second mix for tile / flip /
// tone), the card's sprig direction as a flat cos / sin from the vertex shader and the per-leaf angle offset by polynomial —
// no trig and no 4-lane PCG per candidate leaf; flutter is a parabolic wave. Same layout rules as before.
export const LEAF_VERT_PARS = `
flat varying vec4 vLeafSt; flat varying vec4 vLeafSd; flat varying vec2 vLeafR; varying vec2 vLeafUv;
const vec4 LEAF_SA[${STYLES.length}] = vec4[${STYLES.length}](${SA});
const vec2 LEAF_SB[${STYLES.length}] = vec2[${STYLES.length}](${SB});
`;
// needs: uv; instSeed (float). Defines leafBW (branch flexibility) and lfSeed.
export const LEAF_VERT = `
  vec2 lfq = floor(uv * 0.5); vLeafUv = uv - 2.0 * lfq;
  int lfs = min(int(mod(lfq.x, 16.0)), ${STYLES.length - 1}); float lflo = step(15.5, lfq.x);
  vec4 lfA = LEAF_SA[lfs]; vec2 lfB = LEAF_SB[lfs];
  vLeafSt = vec4(lfA.x * (1.0 + 0.75 * lflo), lfA.yzw);
  float leafBW = clamp(lfq.y / 63.0, 0.0, 1.0);
  #ifdef USE_COLOR
    float lfSeed = fract(dot(color, vec3(31.17, 57.31, 19.73)) * 7.13 + instSeed);
  #else
    float lfSeed = fract(0.37 + instSeed);
  #endif
  vLeafSd = vec4(lfSeed, lfB.x, 0.0, lfB.y);
  float lfA0 = fract(lfSeed * 17.23 + 0.31) * 6.2832; vLeafR = vec2(cos(lfA0), sin(lfA0));
`;
export const LEAF_FRAG_PARS = `
flat varying vec4 vLeafSt; flat varying vec4 vLeafSd; flat varying vec2 vLeafR; varying vec2 vLeafUv;
uniform float uLeafT;
uint leafHash(uvec2 c, uint s) { uint h = (c.x * 0x8da6b343u) ^ (c.y * 0xd8163841u) ^ (s * 0xcb1ab31fu); h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u; return h; }
float leafB(uint h, uint sh) { return float((h >> sh) & 255u) * (1.0 / 255.0); }
// → leaf colour (a = 0 / 1); luv = atlas uv of the leaf hit (for the other maps), inf = per-leaf random (normal tilt xyz, gloss w)
vec4 leafAtlas(sampler2D tex, out vec2 luv, out vec4 inf) {
  float N = vLeafSt.x, wd = vLeafSt.y; vec2 p = vLeafUv * N + 0.5;
  uint sd = uint(vLeafSd.x * 65535.0);
  vec2 gx = dFdx(p), gy = dFdy(p); float fp = max(dot(gx, gx), dot(gy, gy)); // (cells per pixel)²
  luv = vec2(0.125, 0.75); inf = vec4(0.5);
  float dz = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (fp > 0.12 + dz * 0.14) { // far (a leaf under ~5 px): a soft clump in the leaves' mean colour (one read; no sub-pixel leaf noise)
    uint hc = leafHash(uvec2(vLeafUv * 4.0), sd ^ 0x9e37u);
    float a = 1.0 - smoothstep(0.3, 0.46, length(vLeafUv - 0.5) + (leafB(hc, 0u) - 0.5) * 0.22);
    vec2 cuv = leafB(hc, 8u) < vLeafSt.w ? vec2(0.625, 0.25) : vec2(0.125 + 0.25 * float((hc >> 31u) & 1u), 0.75);
    vec4 c = textureLod(tex, cuv, 5.0); c.rgb /= max(c.a, 0.2);
    return vec4(c.rgb, step(0.5, a));
  }
  // one mip level for the whole fragment (a leaf blade is ~240 texels per cell along its length; narrow blades a touch more):
  // textureLod instead of a per-candidate textureGrad — a quarter of the sampling cost, no visible change at these sizes
  float lfLod = max(0.0, 0.5 * log2(fp) + 7.9 + max(0.0, -0.5 * log2(wd)));
  vec2 c0 = floor(p - 0.5); vec2 par = mod(c0, 2.0);
  vec2 perm = vec2(float(sd & 1u), float((sd >> 1u) & 1u));
  float L = 1.6 + max(0.0, 1.0 - wd) * 0.35; vec2 isz = 1.0 / vec2(L * 0.5 * wd, L);
  mat2 RB = mat2(vLeafR.x, vLeafR.y, -vLeafR.y, vLeafR.x); bool fl8 = vLeafSd.z > 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 kb = mod(vec2(float(k & 1), float(k >> 1)) + perm, 2.0);
    vec2 c = c0 + mod(kb - par + 2.0, 2.0);
    uint h = leafHash(uvec2(c), sd);
    if (leafB(h, 0u) > vLeafSt.z) continue;
    vec2 ctr = c + 0.5 + (vec2(leafB(h, 8u), leafB(h, 16u)) - 0.5) * 0.26;
    float hw = leafB(h, 24u), a = (hw - 0.5) * vLeafSd.y;
    if (fl8) { float f = fract(uLeafT * (0.95 + 0.8 * hw) + leafB(h, 8u)); a += (8.0 * f * (1.0 - f) - 1.0) * vLeafSd.z; } // each leaf flutters on its own
    float a2 = a * a; mat2 R = RB * mat2(1.0 - a2 * (0.5 - a2 * 0.0417), a * (1.0 - a2 * 0.1667), -a * (1.0 - a2 * 0.1667), 1.0 - a2 * (0.5 - a2 * 0.0417));
    vec2 t = (R * (p - ctr)) * isz + 0.5;
    if (t.x < 0.0 || t.y < 0.0 || t.x > 1.0 || t.y > 1.0) continue;
    uint h2 = h * 0x9e3779b9u; h2 ^= h2 >> 15u; h2 *= 0x2c1b3c6du; h2 ^= h2 >> 12u;
    float r0 = leafB(h2, 0u), r1 = leafB(h2, 8u), r2 = leafB(h2, 16u), r3 = leafB(h2, 24u);
    float fl = r0 < 0.5 ? 1.0 : -1.0; t.x = 0.5 + (t.x - 0.5) * fl;
    vec2 tile; // atlas tile (column, row from the bottom)
    if (r3 < vLeafSt.w) tile = r1 < 0.5 ? vec2(3.0, 1.0) : r1 < 0.85 ? vec2(2.0, 0.0) : vec2(3.0, 0.0);
    else tile = r1 < 0.42 ? vec2(0.0, 1.0) : r1 < 0.66 ? vec2(1.0, 1.0) : r1 < 0.8 ? vec2(0.0, 0.0) : r1 < 0.91 ? vec2(1.0, 0.0) : vec2(2.0, 1.0);
    vec2 auv = (tile + t) * vec2(0.25, 0.5);
    vec4 s = textureLod(tex, auv, lfLod);
    if (s.a < 0.5 || max(s.r, max(s.g, s.b)) < 0.06) continue;
    s.rgb /= max(s.a, 0.5); // no dark fringe from the keyed background in the mips
    s.rgb *= (0.86 + 0.28 * r2) * (1.0 + 0.08 * sign((t.x - 0.5) * (r2 - 0.5))); // per-leaf tone; one half of the blade a touch lit (midrib fold)
    luv = auv; inf = vec4(r1, r2, r3, hw);
    return vec4(s.rgb, 1.0);
  }
  return vec4(0.0);
}
`;
export const LEAF_FRAG_MAP = `
  vec2 leafUv = vLeafUv; vec4 leafInf = vec4(0.5);
  #ifdef USE_MAP
    vec4 sampledDiffuseColor = leafAtlas(map, leafUv, leafInf);
    diffuseColor *= sampledDiffuseColor;
  #endif
  #define vNormalMapUv leafUv
  #define vRoughnessMapUv leafUv
  #define vMetalnessMapUv leafUv
  #define vAoMapUv leafUv
  #define vAlphaMapUv leafUv
  #define vBumpMapUv leafUv
  #define vEmissiveMapUv leafUv
  #define vSpecularMapUv leafUv
`;
// patch a material's shader (main or depth) for the atlas leaves. instSeed: GLSL float expression available after begin_vertex.
export function patchLeafShader(sh, instSeed = '0.0') {
  sh.uniforms.uLeafT = windUniform; // the leaves flutter on the wind clock
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + LEAF_VERT_PARS)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n  float instSeed = ${instSeed};\n` + LEAF_VERT);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + LEAF_FRAG_PARS).replace('#include <map_fragment>', LEAF_FRAG_MAP);
}

// ---------------------------------------------------------------------------------------------- texture
function assetBase() { try { return import.meta.env.BASE_URL || './'; } catch { return './'; } }
function finish(cv, name) {
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.name = name; t.needsUpdate = true; return t;
}
// black background → alpha (the image's own anti-aliased edges become soft alpha); colour untouched
function keyAlpha(cv) {
  const x = cv.getContext('2d'), img = x.getImageData(0, 0, cv.width, cv.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const m = Math.max(d[i], d[i + 1], d[i + 2]); d[i + 3] = m <= 9 ? 0 : m >= 26 ? 255 : Math.round((m - 9) / 17 * 255); }
  x.putImageData(img, 0, 0);
}
// a plain 4 × 2 sheet of drawn leaves, only if the image cannot load (keeps the layout the shader expects)
function fallbackAtlas() {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const cols = ['#3f7a2c', '#4a7a34', '#93a83a', '#c49a3a', '#447a30', '#5d8a34', '#8a5a2e', '#4a3a26'];
  for (let k = 0; k < 8; k++) { const cx = (k % 4) * 64 + 32, cy = Math.floor(k / 4) * 128 + 64; g.fillStyle = cols[k]; g.beginPath(); g.moveTo(cx, cy - 58);
    g.bezierCurveTo(cx + 34, cy - 20, cx + 30, cy + 40, cx, cy + 56); g.bezierCurveTo(cx - 30, cy + 40, cx - 34, cy - 20, cx, cy - 58); g.fill(); g.strokeStyle = 'rgba(220,230,160,0.5)'; g.beginPath(); g.moveTo(cx, cy - 56); g.lineTo(cx, cy + 58); g.stroke(); }
  return finish(cv, 'Tree leaves (fallback sheet)');
}
export async function loadLeafAtlas() {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const img = await new Promise((res) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = assetBase() + 'assets/vegetation/' + LEAF_FILE; });
  if (!img) { console.warn('leaf atlas missing — drawn fallback leaves'); return fallbackAtlas(); }
  const cv = document.createElement('canvas'); cv.width = cv.height = LEAF_PX; const x = cv.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, LEAF_PX, LEAF_PX); keyAlpha(cv);
  const t = finish(cv, 'Tree leaves · ' + LEAF_FILE); t.userData.sourceFile = 'assets/vegetation/' + LEAF_FILE; t.userData.sourceSize = [img.naturalWidth, img.naturalHeight]; return t;
}
