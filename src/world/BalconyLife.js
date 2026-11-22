// 83rd request — lived-in balconies and open windows: laundry on lines (shirts on hangers, trousers and sarongs pegged,
// towels, folded bedsheets), sarees / sheets dried over the railing, folding clothes airers, cloth sun-screens hung under the
// slab above, plants in pots, plastic chairs, buckets, water drums — and curtains moving in open windows.
//
// Built INTO the existing streaming (no separate system): BuildingGen.buildDetail calls dressBalconies() for the balconies it
// has just placed, and dressFacade() calls windowCurtain() for an open window, writing into the same per-chunk MultiBuilder
// as every other detail part (time-sliced by World.stepJob, merged per material, disposed with the chunk by disposeDetail /
// disposeWindows). So only buildings inside the near detail / window radii carry any of it; the distance tiers, the hysteresis
// and leave-and-return are World's. Every balcony seeds its own RNG from (building, floor, bay): rebuilding a chunk gives the
// identical balcony, so nothing pops or changes when the player comes back.
//
// Two materials for everything (two draws per near chunk):
//   'balCloth' — every fabric piece. GPU-only motion: the vertex shader moves each vertex from the ONE shared wind (Wind.js:
//     clock, direction, strength — World drives them from atmos.w.wind, no second weather state). Per-vertex data is packed
//     in the vertex colour: r = pin weight (0 where the cloth is held: line, pegs, rod, rail; 1 at the free edge), g = the
//     piece's random, b = kind·0.25 + mass·0.2. Amplitude follows size / weight (heavy towels and wet cloth move less, light
//     shirts flutter), with travelling gusts, a slow sway, a faster flutter whose phase runs across the width (reads as twist),
//     a lift of the free edge in gusts, and per-kind limits along the cloth normal so a piece can never swing through the wall,
//     the railing, the window glass or frame (curtains only billow OUT of the window). Rain: atmos.wet darkens the fabric and
//     makes it heavier; heavy rain (rain > 0.7) has people take the laundry in — pieces disappear one by one (exposed balconies
//     first) and come back out a few minutes after the rain. Shadows use the same displacement (custom depth material).
//   'balProp'  — every hard object (atlas texture, PBR in one map: normal RG, roughness B, metalness A); 'balLeaf' = the same
//     material double-sided with alpha cut-out for leaves.
// Textures: Tex2K.js 2048² atlases (KTX2 / Basis, TexLib.js): 16 fabric designs + 4 weave normal tiles, 16 household tiles.
import * as THREE from 'three';
import { MAT } from '../gfx/Materials.js';
import { FOLIAGE } from '../gfx/MeshBuilder.js';
import { TexLib, standIn } from '../gfx/TexLib.js';
import { FAB, HH } from '../gfx/Tex2K.js';
import { windUniform, windDir, windStr, CLOTH_WIND_GLSL } from './Wind.js';

// ------------------------------------------------------------------------------------------------ shared state
export const CLOTH_U = { uWindT: windUniform, uWindDir: windDir, uWindStr: windStr, uWet: { value: 0 }, uRainIn: { value: 0 }, uNight: { value: 0 }, uFabN: { value: null } };
const ST = { rainIn: 0, mats: null, stats: { balconies: 0, dressed: 0, garments: 0, curtains: 0, props: 0 } };
export const BALCONY_STATS = ST.stats;
// sound / bird anchors per building (made with the building's window tier, dropped when World disposes that tier)
const ANCH = new Map();
export function beginWindows(b) { ANCH.delete(b.id); }

// ------------------------------------------------------------------------------------------------ materials
const DISP_GLSL = `
#if !defined( USE_COLOR ) && !defined( USE_COLOR_ALPHA )
attribute vec3 color;
#endif
uniform float uRainIn; uniform float uWet;
${CLOTH_WIND_GLSL}
vec3 clothDisp(vec3 P, vec3 N, vec3 cw, out float shade, out float hide) {
  float w = cw.r, ph = cw.g, code = cw.b * 4.0 + 0.001; float kind = floor(code), mass = clamp(fract(code) * 1.25, 0.0, 1.0);
  hide = (kind < 0.5 || kind > 2.5) && ph < uRainIn ? 1.0 : 0.0;                    // laundry taken in from the rain (curtains, screens stay)
  float g = clothGust(P.xz) * uWindStr, light = 1.0 - mass * 0.75, t = uWindT, face = dot(N.xz, uWindDir);
  float sway = (0.55 * g + 0.22 * sin(t * 1.1 + ph * 6.2831 + P.y * 0.7)) * (0.35 + 0.65 * abs(face)) * (face < 0.0 ? -1.0 : 1.0);
  float fa = t * (4.5 + light * 5.0) + ph * 19.0 + dot(P.xz, vec2(3.1, 2.7)) + P.y * 3.7;
  float flut = (sin(fa) * 0.4 + sin(t * 9.7 + ph * 7.0 + P.y * 9.0 + P.x * 5.0) * 0.12) * light * g;
  float amp = w * w * (0.05 + 0.2 * light) * (1.0 - 0.45 * uWet);
  vec2 lim = kind < 0.5 ? vec2(-0.2, 0.2) : kind < 1.5 ? vec2(0.0, 0.35) : kind < 2.5 ? vec2(-0.3, 0.3) : vec2(0.0, 0.18);
  float dn = clamp((sway + flut) * amp, lim.x, lim.y);
  vec3 tw = vec3(uWindDir.x, 0.0, uWindDir.y); tw -= N * dot(tw, N);
  float lat = kind < 0.5 ? min(w * 0.09 * g * light, 0.06) : (kind > 1.5 && kind < 2.5) ? min(w * 0.03 * g, 0.03) : 0.0;
  shade = 1.0 + 0.09 * sin(fa) * w * min(1.0, g);
  return N * dn + tw * lat + vec3(0.0, w * w * 0.035 * g * light * abs(face), 0.0);
}
`;
function clothMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, alphaHash: true, map: standIn('fabCol') });
  m.name = 'balCloth';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, CLOTH_U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DISP_GLSL + 'varying vec4 vCl;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nfloat cShade, cHide; vec3 cDisp = clothDisp(position, normalize(normal), color, cShade, cHide); objectNormal = normalize(objectNormal + vec3(0.0, -1.6 * dot(cDisp, normal), 0.0));\nvCl = vec4(cShade, floor(color.b * 4.0 + 0.001), color.g, color.r);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += cDisp; if (cHide > 0.5) transformed = vec3(0.0, -10000.0, 0.0);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uFabN; uniform float uWet; uniform float uNight; varying vec4 vCl; vec4 gWv; vec2 gWq;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  { vec2 lu = fract(vMapUv * 4.0); vec2 tid = floor(vMapUv * 4.0); int di = int(tid.x + tid.y * 4.0 + 0.5);
    float wt = (di == 3 || di == 4 || di == 11) ? 1.0 : di == 9 ? 2.0 : (di == 6 || di == 13) ? 3.0 : 0.0; vec2 wOff = vec2(mod(wt, 2.0), floor(wt / 2.0));
    gWq = lu * 14.0; gWv = textureGrad(uFabN, (fract(gWq) + wOff) * 0.5, dFdx(gWq) * 0.5, dFdy(gWq) * 0.5);
    diffuseColor.rgb *= (0.86 + 0.14 * gWv.a) * vCl.x * (1.0 - 0.38 * uWet); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(mix(roughnessFactor, gWv.b, 0.6) * (1.0 - 0.3 * uWet), 0.25, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 wn = vec3(gWv.xy * 2.0 - 1.0, 0.0); wn.z = sqrt(max(0.0, 1.0 - dot(wn.xy, wn.xy)));
    vec3 dp1 = dFdx(-vViewPosition), dp2 = dFdy(-vViewPosition); vec2 du1 = dFdx(gWq), du2 = dFdy(gWq);
    vec3 dp2p = cross(dp2, normal), dp1p = cross(normal, dp1); vec3 T = dp2p * du1.x + dp1p * du2.x, B = dp2p * du1.y + dp1p * du2.y;
    float im = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12)); normal = normalize(mat3(T * im, B * im, normal) * vec3(wn.xy * 0.7, wn.z)); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vCl.y > 0.5 && vCl.y < 1.5 && vCl.z > 0.62) totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.78, 0.52) * uNight * 0.55; // a lit room behind a thin curtain');
  };
  m.customProgramCacheKey = () => 'balCloth1';
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: m.map, alphaHash: true, side: THREE.DoubleSide });
  d.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, CLOTH_U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + DISP_GLSL).replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat cShade, cHide; transformed += clothDisp(position, normalize(normal), color, cShade, cHide); if (cHide > 0.5) transformed = vec3(0.0, -10000.0, 0.0);'); };
  d.customProgramCacheKey = () => 'balClothDepth1'; m.userData.depth = d; return m;
}
function propMaterial(leaf) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, map: standIn('hhCol'), side: leaf ? THREE.DoubleSide : THREE.FrontSide, alphaTest: leaf ? 0.5 : 0 });
  m.name = leaf ? 'balLeaf' : 'balProp'; const U = { uHhN: { value: standIn('hhNrm') }, uWet: CLOTH_U.uWet };
  m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uHhN; uniform float uWet; vec4 gHh;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ngHh = texture2D(uHhN, vMapUv); diffuseColor.rgb *= 1.0 - 0.22 * uWet * (1.0 - gHh.a);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(gHh.b * (1.0 - 0.45 * uWet), 0.06, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = gHh.a;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { vec3 wn = vec3(gHh.xy * 2.0 - 1.0, 0.0); wn.z = sqrt(max(0.0, 1.0 - dot(wn.xy, wn.xy))); vec2 q = vMapUv * 2048.0;
    vec3 dp1 = dFdx(-vViewPosition), dp2 = dFdy(-vViewPosition); vec2 du1 = dFdx(q), du2 = dFdy(q);
    vec3 dp2p = cross(dp2, normal), dp1p = cross(normal, dp1); vec3 T = dp2p * du1.x + dp1p * du2.x, B = dp2p * du1.y + dp1p * du2.y;
    float im = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12)); normal = normalize(mat3(T * im, B * im, normal) * wn); }`); };
  m.customProgramCacheKey = () => (leaf ? 'balLeaf1' : 'balProp1'); m.userData.u = U; return m;
}
// lazily, the first time a balcony is dressed (MAT entries: World.stepJob merges by these names; matFor finds them)
export function balconyMats() {
  if (ST.mats) return ST.mats;
  const cloth = clothMaterial(), prop = propMaterial(false), leaf = propMaterial(true);
  MAT.balCloth = cloth; MAT.balProp = prop; MAT.balLeaf = leaf; FOLIAGE.add('balLeaf'); // leaves: no coarse lamp shadows, own mesh
  CLOTH_U.uFabN.value = standIn('fabNrm');
  TexLib.use('fabCol', (t) => { cloth.map = t; cloth.userData.depth.map = t; cloth.needsUpdate = true; cloth.userData.depth.needsUpdate = true; });
  TexLib.use('fabNrm', (t) => { CLOTH_U.uFabN.value = t; });
  TexLib.use('hhCol', (t) => { prop.map = t; leaf.map = t; prop.needsUpdate = leaf.needsUpdate = true; });
  TexLib.use('hhNrm', (t) => { prop.userData.u.uHhN.value = t; leaf.userData.u.uHhN.value = t; });
  ST.mats = { cloth, prop, leaf }; return ST.mats;
}
// World.finishDetail / finishWindows: what a merged cloth mesh needs (shadow pass with the same wind; no lamp shadows)
export function setupClothMesh(m) { if (!ST.mats) return; m.customDepthMaterial = ST.mats.cloth.userData.depth; m.frustumCulled = true;
  m.onBeforeShadow = (r, ob, cam, sc, geo) => { if (!sc.userData.noFoliage) return; ob._skipN = geo.drawRange.count; geo.drawRange.count = 0; };
  m.onAfterShadow = (r, ob, cam, sc, geo) => { if (ob._skipN === undefined) return; geo.drawRange.count = ob._skipN; ob._skipN = undefined; }; }

// ------------------------------------------------------------------------------------------------ weather (World.update)
// rain > 0.7 for a while: laundry comes in piece by piece over ~1.5 min; back out over ~6 min once it has been dry
export function balconyTick(dt, atmos) {
  if (!atmos) return; const rain = atmos.w ? atmos.w.rain : 0;
  if (rain > 0.7) ST.rainIn = Math.min(1.02, ST.rainIn + dt / 90); else if (rain < 0.3) ST.rainIn = Math.max(0, ST.rainIn - dt / 360);
  CLOTH_U.uRainIn.value = ST.rainIn; CLOTH_U.uWet.value = atmos.indoor ? 0 : atmos.wet || 0; CLOTH_U.uNight.value = atmos.night || 0;
}
export function setRainIn(v) { ST.rainIn = v; CLOTH_U.uRainIn.value = v; } // (tests / dev console)
export function rainIn() { return ST.rainIn; }

// ------------------------------------------------------------------------------------------------ small RNG + atlas helpers
function rngOf(seed) { let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const E = 0.006; // inset inside a 512² tile (mip bleed)
function fabUV(d) { const c = d % 4, r = Math.floor(d / 4); return [c / 4 + E, r / 4 + E, (c + 1) / 4 - E, (r + 1) / 4 - E]; } // [u0, vTop, u1, vBottom]
function hhUV(t, sub = null) { const c = t % 4, r = Math.floor(t / 4); const u0 = c / 4 + E, v0 = r / 4 + E, du = 0.25 - 2 * E; if (!sub) return [u0, v0, u0 + du, v0 + du]; return [u0 + du * sub[0], v0 + du * sub[1], u0 + du * sub[2], v0 + du * sub[3]]; }
const WHITE = [1, 1, 1];
// cloth vertex code: kind 0 laundry on a line, 1 window curtain, 2 balcony screen, 3 draped (rail / airer)
const code = (kind, mass) => kind * 0.25 + Math.min(0.999, Math.max(0, mass)) * 0.2;

// a grid of cloth: pos(u, v) → [x, y, z] (v = 0 at the held edge), normal N (world, unit), atlas rect, pin(u, v) → weight
function clothGrid(mb, nu, nv, pos, N, uv, ph, cd, pin = (u, v) => v, nrm = null) {
  const base = mb.pos.length / 3;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv; const p = pos(u, v); const n = nrm ? nrm(u, v) : N;
    mb.vert(p[0], p[1], p[2], n[0], n[1], n[2], uv[0] + (uv[2] - uv[0]) * u, uv[1] + (uv[3] - uv[1]) * v, [Math.min(1, Math.max(0, pin(u, v))), ph, cd]); }
  // winding: front face towards N
  const p0 = pos(0, 0), pu = pos(1, 0), pv = pos(0, 1); const ax = pu[0] - p0[0], ay = pu[1] - p0[1], az = pu[2] - p0[2], bx = pv[0] - p0[0], by = pv[1] - p0[1], bz = pv[2] - p0[2];
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx; const flip = cx * N[0] + cy * N[1] + cz * N[2] > 0; // (u right, v down) → cross points away from N for a front face
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; if (flip) mb.idx.push(a, b, c, b, d, c); else mb.idx.push(a, c, b, b, c, d); }
}
// thin square beam between two points (lines, hanger wire, rods, airer tubes) with an atlas tile
function beam(mb, a, b, r, tile, col = WHITE) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1e-6; const d = [dx / L, dy / L, dz / L];
  const ref = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]; let u = [d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]]; const ul = Math.hypot(...u); u = u.map((q) => q / ul * r);
  const v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]].map((q) => q / r * r);
  const uvr = hhUV(tile); const corner = (p, s, t) => [p[0] + u[0] * s + v[0] * t, p[1] + u[1] * s + v[1] * t, p[2] + u[2] * s + v[2] * t];
  const S = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) { const [s0, t0] = S[k], [s1, t1] = S[(k + 1) % 4]; mb.quad(corner(a, s0, t0), corner(a, s1, t1), corner(b, s1, t1), corner(b, s0, t0), [uvr[0], uvr[3], uvr[2], uvr[1]], col); }
}
// atlas-mapped cylinder (pots, buckets, drums): side + optional top disc (another tile)
function cyl(mb, cx, cy, cz, r0, r1, h, seg, tile, col = WHITE, topTile = -1, topCol = WHITE, topInset = 0) {
  const uvr = hhUV(tile); const base = mb.pos.length / 3; const sl = (r0 - r1) / h;
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), l = Math.hypot(1, sl); const u = uvr[0] + (uvr[2] - uvr[0]) * (i / seg);
    mb.vert(cx + ca * r0, cy, cz + sa * r0, ca / l, sl / l, sa / l, u, uvr[3], col); mb.vert(cx + ca * r1, cy + h, cz + sa * r1, ca / l, sl / l, sa / l, u, uvr[1], col); }
  for (let i = 0; i < seg; i++) { const a = base + i * 2; mb.idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  if (topTile >= 0) { const tr = hhUV(topTile), ct = mb.vert(cx, cy + h - topInset, cz, 0, 1, 0, (tr[0] + tr[2]) / 2, (tr[1] + tr[3]) / 2, topCol); const s0 = mb.pos.length / 3; const rr = r1 * 0.94;
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; mb.vert(cx + Math.cos(a) * rr, cy + h - topInset, cz + Math.sin(a) * rr, 0, 1, 0, (tr[0] + tr[2]) / 2 + Math.cos(a) * (tr[2] - tr[0]) / 2, (tr[1] + tr[3]) / 2 + Math.sin(a) * (tr[3] - tr[1]) / 2, topCol); }
    for (let i = 0; i < seg; i++) mb.idx.push(ct, s0 + i + 1, s0 + i); }
}
// box with an atlas tile on every face (uvRect flipped so the tile reads upright on the sides)
function abox(mb, x, y, z, sx, sy, sz, rot, tile, col = WHITE, o = {}) { const r = hhUV(tile, o.sub); mb.box(x, y, z, sx, sy, sz, { col, rotY: rot, uvRect: [r[0], r[3], r[2], r[1]], bottom: !!o.bottom, top: o.top !== false }); }

// ------------------------------------------------------------------------------------------------ balconies
// slot: { p:[x,z] facade point, n:[nx,nz] outward, ys (slab top y), w, d, solid, covered, exposed, planter, f, k }
// builder: (name) → MeshBuilder (BuildingGen's R()). style: the building's facade style (occupancy / laundry likelihood).
export function dressBalconies(b, slots, builder) {
  if (!slots.length) return; balconyMats(); let anchors = ANCH.get(b.id); if (!anchors) ANCH.set(b.id, (anchors = []));
  const laundryP = /apartment|shop|villa|brick|warehouse/.test(b.style || '') ? 0.55 : /colonial|hotel/.test(b.style || '') ? 0.2 : /office|glass/.test(b.style || '') ? 0.08 : 0.35;
  for (const s of slots) { ST.stats.balconies++; dressOne(b, s, builder, laundryP, anchors); }
}
function dressOne(b, s, R, laundryP, anchors) {
  const rnd = rngOf(b.id * 977 + s.f * 131 + s.k * 17 + 7); const pick = (a) => a[Math.floor(rnd() * a.length)];
  const [nx, nz] = s.n, tx = -nz, tz = nx; const yaw = Math.atan2(nx, nz);
  const W = (a, h, o) => [s.p[0] + tx * a + nx * o, s.ys + h, s.p[1] + tz * a + nz * o]; // a: along the facade, h: above the slab top, o: out from the wall
  const hw = s.w / 2 - 0.06, D = s.d - 0.06; // free floor inside the balustrade (returns 0.06 thick; front wall / rail at d − 0.03)
  const railTop = s.solid ? 0.9 : 0.945, railO = s.d - 0.03, outer = s.solid ? s.d + 0.03 : s.d + 0.005;
  const occupied = rnd() < 0.82; if (!occupied) { if (rnd() < 0.3) chair(R, W, s, -hw + 0.35, 0.35, yaw, rnd, true); anchors.push({ kind: 'rail', p: W(0, railTop, railO), a0: -hw + 0.15, a1: hw - 0.15, s }); return; }
  ST.stats.dressed++; const P = R('balProp'), C = R('balCloth');
  const laundry = rnd() < laundryP; let drape = false, lowStuff = false;
  const exposure = s.exposed ? 0 : 0.35; // exposed (no slab above): this balcony's laundry comes in first
  const ph = () => Math.min(0.999, exposure + rnd() * (1 - exposure) * 0.999); // piece random (rain-in order + motion phase)
  if (laundry) {
    const lineH = Math.min(1.85, (s.covered ? 3.0 : 2.0) - 0.15); const lines = s.w >= 2.2 && rnd() < 0.55 ? [0.4, 0.62] : [rnd() < 0.5 ? 0.4 : 0.5];
    const useRack = rnd() < 0.18 && !s.planter;
    if (useRack) rack(R, W, s, hw, rnd, ph, pick);
    else for (const lo of lines) line(R, W, s, hw, lineH, lo, rnd, ph, pick, lo !== lines[0]);
    lowStuff = useRack;
    if (rnd() < 0.3) { drape = true; overRail(C, W, s, hw, railTop, railO, outer, rnd, ph, pick); }
    anchors.push({ kind: 'laundry', p: W(0, 1.5, 0.5), s });
  }
  if (s.covered && rnd() < 0.16) { screen(R, W, s, hw, rnd, pick); anchors.push({ kind: 'curtain', p: W(0, 2.0, s.d - 0.1), s }); }
  // plants: a few pots along the balustrade (never where BuildingGen put its planter box), or one big pot in a corner
  if (rnd() < 0.55) { const n = 1 + Math.floor(rnd() * (s.w > 2.4 ? 4 : 3)); for (let i = 0; i < n; i++) { const a = -hw + 0.22 + (i + 0.5) / n * (2 * hw - 0.44) + (rnd() - 0.5) * 0.15; if (s.planter && Math.abs(a) < 0.42) continue; plant(R, W, a, D - 0.2, rnd, pick); } }
  if (!laundry && rnd() < 0.45) chair(R, W, s, (rnd() < 0.5 ? -1 : 1) * (hw - 0.32), 0.38, yaw, rnd, false);
  else if (!lowStuff && rnd() < 0.2) stool(P, W, (rnd() < 0.5 ? -1 : 1) * (hw - 0.25), 0.3, yaw);
  if (rnd() < 0.4) { const sx = rnd() < 0.5 ? -1 : 1; cyl(P, ...W(sx * (hw - 0.17), 0, 0.17), 0.13, 0.15, 0.28, 12, rnd() < 0.5 ? HH.plasticRed : HH.plasticBlue); ST.stats.props++; } // bucket in a corner
  if (rnd() < 0.12) { const sx = rnd() < 0.5 ? -1 : 1; cyl(P, ...W(sx * (hw - 0.24), 0, 0.26), 0.23, 0.23, 0.62, 14, HH.plasticBlue, WHITE, HH.plasticBlue, WHITE, 0); ST.stats.props++; } // water drum
  if (!drape) anchors.push({ kind: 'rail', p: W(0, railTop, railO), a0: -hw + 0.15, a1: hw - 0.15, s });
}
function pegs(P, a, b, rnd) { for (const q of [a, b]) { const row = Math.floor(rnd() * 7); abox(P, q[0], q[1] + 0.02, q[2], 0.014, 0.07, 0.022, 0, HH.pegs, WHITE, { sub: [0.1, row / 8 + 0.02, 0.9, (row + 1) / 8 - 0.02] }); } }
// a washing line across the balcony (sagging nylon cord on two hooks) with garments hung along it
function line(R, W, s, hw, lineH, lo, rnd, ph, pick, second) {
  const P = R('balProp'), C = R('balCloth'); const a0 = -s.w / 2 + 0.045, a1 = -a0, sag = 0.025 + rnd() * 0.03;
  const at = (a) => { const t = (a - a0) / (a1 - a0); return W(a, lineH - Math.sin(Math.PI * t) * sag, lo); };
  for (let i = 0; i < 6; i++) beam(P, at(a0 + (a1 - a0) * i / 6), at(a0 + (a1 - a0) * (i + 1) / 6), 0.005, HH.plasticWhite, [0.78, 0.8, 0.84]);
  for (const a of [a0, a1]) { abox(P, ...W(a, lineH + 0.01, lo), 0.03, 0.05, 0.03, 0, HH.galv); const pa = Math.sign(a) * (s.w / 2 - 0.03); beam(P, W(pa, s.solid ? 0.9 : 0.945, lo), W(pa, lineH + 0.03, lo), 0.011, HH.galv); } // GI pipe post on the return wall / rail
  const N = [s.n[0], 0, s.n[1]]; let a = a0 + 0.1 + rnd() * 0.15; const maxDrop = second ? 0.75 : 1.0, end = a1 - 0.1;
  while (a < end - 0.25) {
    const r = rnd(); let wdt, drop, d, mass, kind = 'rect';
    if (r < 0.26) { kind = 'shirt'; wdt = 0.5; drop = 0.72; d = pick([FAB.shirtWhite, FAB.shirtCheck, FAB.uniform, FAB.tshirtKid]); mass = 0.15; if (d === FAB.tshirtKid) { wdt = 0.36; drop = 0.48; } }
    else if (r < 0.42) { kind = 'trousers'; wdt = 0.42; drop = 0.95; d = pick([FAB.denim, FAB.trousersDark]); mass = 0.55; }
    else if (r < 0.58) { wdt = 0.55 + rnd() * 0.15; drop = 0.62; d = FAB.towel; mass = 0.75; }
    else if (r < 0.74) { wdt = 1.0; drop = 0.85; d = pick([FAB.sarongBatik, FAB.sarongPlaid]); mass = 0.35; }
    else if (r < 0.88) { wdt = 1.25 + rnd() * 0.4; drop = 0.95; d = pick([FAB.sheetFloral, FAB.sheetStripe]); mass = 0.5; }
    else { wdt = 0.3; drop = 0.3; d = pick([FAB.towel, FAB.tshirtKid, FAB.uniform]); mass = 0.4; } // small things: hand towel, child's vest
    if (a + wdt > end) { if (wdt > 0.6) { a += 0.05; continue; } }
    if (a + wdt > end + 0.02) break; drop = Math.min(drop, maxDrop, lineH - 0.88);
    const p0 = at(a), p1 = at(a + wdt); const q = ph(); ST.stats.garments++;
    if (kind === 'shirt') shirt(R, P, C, at, a, wdt, drop, N, d, q, mass, rnd);
    else if (kind === 'trousers') trousers(C, P, at, a, wdt, drop, N, d, q, mass, rnd);
    else { // pegged rectangle; sheets and sarongs folded over the line: two layers 2 cm apart, the back one a little shorter
      const uv = fabUV(d), cd = code(0, mass), nu = Math.max(3, Math.round(wdt / 0.18)), nv = 5;
      const pos = (off, dr) => (u, v) => { const t = at(a + wdt * u); const belly = Math.sin(Math.PI * u) * 0.02 * v; return [t[0] + N[0] * off, t[1] - 0.004 - dr * v + belly, t[2] + N[2] * off]; };
      if (wdt > 0.9) { clothGrid(C, nu, nv, pos(0.011, drop), N, uv, q, cd); clothGrid(C, nu, nv, pos(-0.011, drop * 0.82), N, [uv[2], uv[1], uv[0], uv[3]], q, cd); }
      else clothGrid(C, nu, nv, pos(0, drop), N, uv, q, cd);
      pegs(P, p0, p1, rnd);
    }
    a += wdt + 0.04 + rnd() * 0.08;
  }
}
// shirt on a wire hanger: body + sleeves hanging from sloped shoulders; hanger hook over the line
function shirt(R, P, C, at, a, wdt, drop, N, d, q, mass, rnd) {
  const mid = at(a + wdt / 2); const T = [mid[0] - at(a)[0], 0, mid[2] - at(a)[2]]; const tl = Math.hypot(T[0], T[2]) || 1; T[0] /= tl; T[2] /= tl;
  const sh = 0.045 + drop * 0.08, top = [mid[0], mid[1] - 0.075, mid[2]]; const half = wdt / 2 * 0.82; // hanger shoulders, body half width
  const P2 = (x, y) => [top[0] + T[0] * x, top[1] + y, top[2] + T[2] * x];
  beam(P, [mid[0], mid[1] + 0.012, mid[2]], P2(0, -0.012), 0.002, HH.galv, [0.75, 0.75, 0.78]); beam(P, P2(0, -0.012), P2(-half, -sh), 0.0025, HH.galv, [0.75, 0.75, 0.78]); beam(P, P2(0, -0.012), P2(half, -sh), 0.0025, HH.galv, [0.75, 0.75, 0.78]);
  const uv = fabUV(d), cd = code(0, mass); const U = (u0, u1) => [uv[0] + (uv[2] - uv[0]) * u0, uv[1], uv[0] + (uv[2] - uv[0]) * u1, uv[3]];
  const slope = (x) => -sh * Math.abs(x) / half - 0.012; // shoulders follow the hanger
  clothGrid(C, 4, 5, (u, v) => { const x = (u - 0.5) * 2 * half; const y = slope(x) * (1 - v) + (-sh - drop) * v; return P2(x * (1 - 0.04 * v), y, 0); }, N, U(0.2, 0.8), q, cd, (u, v) => 0.12 + v * 0.88);
  for (const sx of [-1, 1]) { const sl = drop * (wdt < 0.4 ? 0.32 : 0.62), sw = half * 0.42; // sleeves: from the shoulder seam outwards and down
    clothGrid(C, 2, 3, (u, v) => { const x = sx * (half - 0.01 + u * sw * (0.6 + 0.4 * (1 - v))); return P2(x, -sh - 0.01 - v * sl - u * 0.05, 0.004); }, N, sx < 0 ? U(0, 0.2) : U(0.8, 1), q, cd, (u, v) => 0.25 + 0.75 * Math.max(u, v)); }
}
// trousers pegged by the waistband: band + two legs
function trousers(C, P, at, a, wdt, drop, N, d, q, mass, rnd) {
  const uv = fabUV(d), cd = code(0, mass); const U = (u0, u1, v0 = 0, v1 = 1) => [uv[0] + (uv[2] - uv[0]) * u0, uv[1] + (uv[3] - uv[1]) * v0, uv[0] + (uv[2] - uv[0]) * u1, uv[1] + (uv[3] - uv[1]) * v1];
  const band = 0.22, legW = wdt * 0.47; const pt = (x, y) => { const t = at(a + x); return [t[0], t[1] - 0.004 - y, t[2]]; };
  clothGrid(C, 3, 2, (u, v) => pt(wdt * u, band * v), N, U(0, 1, 0, 0.22), q, cd, (u, v) => v * 0.25);
  for (const [x0, u0] of [[0, 0], [wdt - legW, 0.53]]) clothGrid(C, 2, 5, (u, v) => pt(x0 + legW * u + (x0 > 0 ? 0.01 : -0.01) * v * u, band + (drop - band) * v), N, U(u0, u0 + 0.47, 0.22, 1), q, cd, (u, v) => 0.25 + v * 0.75);
  pegs(P, at(a), at(a + wdt), rnd);
}
// a saree / bedsheet / sarong over the front railing: over the top rail and down the outside (towards the street)
function overRail(C, W, s, hw, railTop, railO, outer, rnd, ph, pick) {
  const wdt = Math.min(2 * hw - 0.3, 1.0 + rnd() * 1.0), a0 = -wdt / 2 + (rnd() - 0.5) * (2 * hw - wdt - 0.2), drop = 0.55 + rnd() * 0.75; const d = pick([FAB.saree, FAB.saree, FAB.sheetFloral, FAB.sheetStripe, FAB.sarongBatik, FAB.towel]);
  const N = [s.n[0], 0, s.n[1]], uv = fabUV(d), q = ph(), cd = code(3, d === FAB.towel ? 0.8 : 0.45); ST.stats.garments++;
  const nv = 6, hTop = railTop + 0.014; // v 0..0.15: over the rail top (pinned), then down the outside
  clothGrid(C, Math.max(3, Math.round(wdt / 0.2)), nv, (u, v) => { const a = a0 + wdt * u; if (v <= 1 / nv) { const k = v * nv; return W(a, hTop + 0.004 * Math.sin(Math.PI * k), railO - 0.035 + (outer + 0.02 - railO + 0.035) * k); } const k = (v - 1 / nv) / (1 - 1 / nv); return W(a, hTop - 0.01 - drop * k, outer + 0.02 + 0.015 * Math.sin(Math.PI * k)); }, N, uv, q, cd, (u, v) => Math.max(0, (v - 1 / nv) / (1 - 1 / nv)));
}
// folding airer: galvanised frame with rails, a few things draped over the rails (front and back layer)
function rack(R, W, s, hw, rnd, ph, pick) {
  const P = R('balProp'), C = R('balCloth'); const len = Math.min(1.4, 2 * hw - 0.3), a0 = (rnd() - 0.5) * (2 * hw - len - 0.2) - len / 2, c = 0.42; const N = [s.n[0], 0, s.n[1]];
  for (const e of [a0, a0 + len]) { beam(P, W(e, 0, c - 0.28), W(e, 1.02, c), 0.009, HH.galv); beam(P, W(e, 0, c + 0.28), W(e, 1.02, c), 0.009, HH.galv); }
  const rails = [[0.98, c], [0.8, c - 0.12], [0.8, c + 0.12]]; for (const [h, o] of rails) beam(P, W(a0, h, o), W(a0 + len, h, o), 0.006, HH.galv);
  ST.stats.props++; let a = a0 + 0.06;
  while (a < a0 + len - 0.3) { const wdt = 0.28 + rnd() * 0.3; if (a + wdt > a0 + len - 0.04) break; const [h, o] = rails[Math.floor(rnd() * 3)]; const d = pick([FAB.towel, FAB.shirtWhite, FAB.uniform, FAB.sarongPlaid, FAB.tshirtKid]); const uv = fabUV(d), q = ph(), cd = code(3, d === FAB.towel ? 0.8 : 0.3); const dr = Math.min(0.42, h - 0.1) * (0.7 + rnd() * 0.3);
    for (const sgn of [1, -1]) clothGrid(C, 2, 3, (u, v) => W(a + wdt * u, h + 0.008 - dr * v * (sgn > 0 ? 1 : 0.85), o + sgn * (0.012 + 0.02 * v)), N, sgn > 0 ? uv : [uv[2], uv[1], uv[0], uv[3]], q, cd);
    ST.stats.garments++; a += wdt + 0.05; }
}
// cloth sun / privacy screen on a rod under the slab above, drawn to one side or across (pleated)
function screen(R, W, s, hw, rnd, pick) {
  const P = R('balProp'), C = R('balCloth'); const o = s.d - 0.09, top = 2.98, bot = 1.08; const d = pick([FAB.curtainFloral, FAB.sheetStripe, FAB.curtainDamask, FAB.sarongBatik]);
  beam(P, W(-hw + 0.02, top + 0.04, o), W(hw - 0.02, top + 0.04, o), 0.012, HH.alu);
  const cover = rnd() < 0.35 ? 1 : 0.3 + rnd() * 0.45, wdt = (2 * hw - 0.3) * cover, side = rnd() < 0.5 ? -1 : 1; const a0 = side < 0 ? -hw + 0.15 : hw - 0.15 - wdt;
  pleated(C, W, a0, wdt, top, top - bot, o, [s.n[0], 0, s.n[1]], [-s.n[1], 0, s.n[0]], fabUV(d), Math.min(0.999, 0.4 + rnd() * 0.6), code(2, 0.45), 0.024 / Math.max(0.35, cover), 0.11);
  ST.stats.curtains++;
}
// pleated curtain panel hanging from (a0 .. a0 + wdt) at height `top` (local W coords), depth o, folds of amplitude amp
function pleated(C, W, a0, wdt, top, drop, o, N, T, uv, q, cd, amp, period) {
  const nf = Math.max(2, Math.round(wdt / period)), nu = nf * 2, nv = 6;
  const z = (u) => amp * Math.sin(u * nf * Math.PI); const dz = (u) => amp * nf * Math.PI * Math.cos(u * nf * Math.PI) / wdt;
  clothGrid(C, nu, nv, (u, v) => W(a0 + wdt * u, top - drop * v, o + z(u) * (1 - 0.3 * v)), N, uv, q, cd, (u, v) => v,
    (u) => { const s2 = -dz(u) * 0.15; /* small tilt: displacement along N stays (nearly) square to the wall, clear of the jambs */ const nx = N[0] + T[0] * s2, nz = N[2] + T[2] * s2, l = Math.hypot(nx, nz); return [nx / l, 0, nz / l]; });
}
function plant(R, W, a, o, rnd, pick) {
  const P = R('balProp'), Lf = R('balLeaf'); const r = 0.1 + rnd() * 0.08, h = r * (1.1 + rnd() * 0.4); const glazed = rnd() < 0.3; const base = W(a, 0, o);
  cyl(P, base[0], base[1], base[2], r * 0.78, r, h, 12, glazed ? HH.glazed : HH.terracotta, WHITE, HH.soil, WHITE, 0.03); ST.stats.props++;
  const t = pick([HH.croton, HH.areca, HH.bougain, HH.basil, HH.croton]); const lh = (t === HH.bougain ? 0.35 : t === HH.areca ? 0.75 : 0.45) * (0.7 + rnd() * 0.6); const lw = lh * (t === HH.areca ? 0.5 : 0.8);
  const uvr = hhUV(t); const n = t === HH.areca ? 5 : 3, y0 = base[1] + h - 0.04, rot = rnd() * Math.PI;
  for (let i = 0; i < n; i++) { const ang = rot + (i / n) * Math.PI + (rnd() - 0.5) * 0.3, lean = (rnd() - 0.5) * 0.25; const ex = Math.cos(ang) * lw / 2, ez = Math.sin(ang) * lw / 2; const tx = Math.sin(ang) * lean * lh, tz = -Math.cos(ang) * lean * lh;
    Lf.quad([base[0] - ex, y0, base[2] - ez], [base[0] + ex, y0, base[2] + ez], [base[0] + ex + tx, y0 + lh, base[2] + ez + tz], [base[0] - ex + tx, y0 + lh, base[2] - ez + tz], [uvr[0], uvr[1], uvr[2], uvr[3]], [0.95, 1, 0.95]); }
}
// moulded white plastic chair facing the street (a dusty, empty one on vacant balconies)
function chair(R, W, s, a, o, yaw, rnd, dusty) {
  const P = R('balProp'); const c = dusty ? [0.78, 0.76, 0.72] : WHITE; const T = HH.plasticWhite, rot = yaw + Math.PI + (rnd() - 0.5) * 0.5;
  const at = (dx, h, dz) => { const ca = Math.cos(rot), sa = Math.sin(rot); const p = W(a, h, o); return [p[0] + dx * ca + dz * sa, p[1], p[2] - dx * sa + dz * ca]; };
  abox(P, ...at(0, 0.43, 0), 0.44, 0.03, 0.42, rot, T, c, { bottom: true }); abox(P, ...at(0, 0.66, -0.22), 0.42, 0.42, 0.03, rot, T, c);
  for (const [dx, dz] of [[-0.19, 0.18], [0.19, 0.18], [-0.19, -0.19], [0.19, -0.19]]) abox(P, ...at(dx, 0.215, dz), 0.035, 0.43, 0.035, rot, T, c);
  for (const sx of [-1, 1]) abox(P, ...at(sx * 0.215, 0.58, -0.02), 0.03, 0.03, 0.4, rot, T, c); ST.stats.props++;
}
function stool(P, W, a, o, yaw) { abox(P, ...W(a, 0.4, o), 0.3, 0.035, 0.3, yaw, HH.timber); for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) { const p = W(a + dx, 0.19, o + dz); abox(P, p[0], p[1], p[2], 0.03, 0.38, 0.03, yaw, HH.timber); } ST.stats.props++; }

// ------------------------------------------------------------------------------------------------ open windows
// An open window (dressFacade: ~9 % of dressed openings above the ground floor; never shutters, grills or doors): the sashes
// stand open (no pane, mullion or transom), the side / head / sill frame stays. A pleated curtain hangs in the opening just
// behind the frame face (o 0.023–0.047 m; the frame runs 0.005–0.055 and the rod hides behind the head bar), 2.5 cm in from
// the jambs; it only billows OUTWARDS (kind 1 limit: never back into the wall) and never sideways or upwards past the head,
// so it cannot cut the jambs, head or sill. A lit room behind it glows through it at night now and then (the shader).
// P(along, out) → [x, z] (frame of that window), opening ya..gTop (inside the frame), clear width Wd.
export function windowCurtain(solid, b, P, nrm, tan, ya, gTop, Wd, seed) {
  balconyMats(); const rnd = rngOf(seed); const C = solid.get('balCloth');
  const top = gTop + 0.01, bot = ya + 0.05, o = 0.035, half = Wd / 2 - 0.025; if (half < 0.22 || top - bot < 0.6) return false;
  const Wl = (a, h, out) => { const p = P(a, out); return [p[0], h, p[1]]; }; // (h is an absolute y here)
  const d = [FAB.curtainLace, FAB.curtainDamask, FAB.curtainFloral, FAB.curtainNet, FAB.sheetFloral, FAB.sheetStripe][Math.floor(rnd() * 6)]; const N = [nrm[0], 0, nrm[1]], T = [tan[0], 0, tan[1]];
  const style = rnd(), q = Math.min(0.999, 0.15 + rnd() * 0.85), cd = code(1, d === FAB.curtainDamask ? 0.6 : d === FAB.curtainNet || d === FAB.curtainLace ? 0.1 : 0.3), drop = top - bot;
  const panel = (a0, w) => pleated(C, Wl, a0, w, top, drop * (0.85 + rnd() * 0.15), o, N, T, fabUV(d), q, cd, 0.012, 0.07);
  if (style < 0.35) { const w = 2 * half * (0.55 + rnd() * 0.25); panel(rnd() < 0.5 ? -half : half - w, w); }
  else if (style < 0.75) { const w1 = half * (0.55 + rnd() * 0.35), w2 = half * (0.55 + rnd() * 0.35); panel(-half, w1); panel(half - w2, w2); }
  else panel(-half, 2 * half);
  ST.stats.curtains++; if (b) { let a = ANCH.get(b.id); if (!a) ANCH.set(b.id, (a = [])); a.push({ kind: 'curtain', p: Wl(0, (top + bot) / 2, 0.3), n: [nrm[0], nrm[1]] }); }
  return true;
}
// is this dressed opening an open window? (deterministic per opening; ~9 %)
export function windowOpen(ax, az, iu, iv, wi) { const h = Math.sin(ax * 12.9898 + az * 78.233 + iu * 37.719 + iv * 11.13 + wi * 3.7) * 43758.5453; return h - Math.floor(h) < 0.09; }

// ------------------------------------------------------------------------------------------------ anchors (sound, birds)
export function dropAnchors(buildings) { for (const b of buildings) ANCH.delete(b.id); }
// anchors of a kind within r of (x, z) (out: reused array)
export function anchorsNear(kind, x, z, r, out = []) { out.length = 0; for (const list of ANCH.values()) for (const A of list) { if (A.kind !== kind) continue; const p = A.p; if (Math.abs(p[0] - x) < r && Math.abs(p[2] - z) < r) out.push(A); } return out; }
export function anchorCount() { let n = 0; for (const l of ANCH.values()) n += l.length; return n; }
// a perch on a balcony railing (birds): [x, y, z, yaw] on the top rail / wall top, between the returns
export function railPerch(A, rnd = Math.random) { const s = A.s; const a = A.a0 + (A.a1 - A.a0) * rnd(); const [nx, nz] = s.n; const tx = -nz, tz = nx; const o = s.d - 0.03;
  return { x: s.p[0] + tx * a + nx * o, y: A.p[1] + 0.012, z: s.p[1] + tz * a + nz * o, yaw: rnd() < 0.6 ? Math.atan2(nx, nz) : Math.atan2(tx, tz) * (rnd() < 0.5 ? 1 : -1) }; }
