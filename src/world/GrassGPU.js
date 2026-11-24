// GPU grass (90th request): individually shaped, curved 3D blades generated entirely on the GPU, in 2 m patches drawn
// with three instanced draw calls (near / mid / far geometry LOD), on top of the existing grass mask (Grass.js GrassField.mask:
// where the 'grass' / 'lawn' ground triangles are, minus paths, paving, buildings, props, water, park features).
//
//   • Grass map: a 128 m toroidal window around the camera (256² cells of 0.5 m) uploaded as two small textures — ground
//     colour + density (sRGB RGBA8, filtered: soft edges along paths) and ground height + blade-height scale (RG32F, read
//     with a validity-aware bilinear so blade roots sit exactly on the ground mesh). Only the cells entering the window are
//     refilled when the camera moves 8 m; nothing per blade ever runs on the CPU.
//   • Patches: per frame the CPU walks the 2 m patch grid inside the grass radius, skips empty patches (per-patch coverage
//     from the map) and patches outside the camera frustum, and writes the visible patch coordinates into three small
//     instance buffers (one per LOD). A few thousand sphere tests, no allocation.
//   • Blades: the vertex shader builds every blade from (patch, blade index): position from a per-patch rotated R2
//     low-discrepancy sequence (any prefix is evenly spread, so thinning by blade index never leaves holes or a grid),
//     height / width / lean / twist / tone from integer hashes, a quadratic Bézier spine bent by layered wind and by nearby
//     movers (player, vehicles, their trails) and the helicopter downwash, length-preserving so blades bend instead of
//     stretching. LOD geometry: 11 / 7 / 3 vertices per blade.
//   • LOD without popping: density falls continuously with distance by blade rank (each blade shrinks away over a band
//     instead of vanishing), blades widen to keep coverage and never get thinner than ~1 pixel (no shimmer), the patch LOD
//     switch only happens where the dropped blades are already gone, and at the far edge colour and normals converge to
//     the lawn texture under them, so the grass dissolves into the terrain.
//   • Cost: opaque geometry (no alpha cards, no discard → early-Z and no transparent overdraw), no shadow casting (receives
//     the sun shadow), excluded from the water reflection pass, one shared material / program, ~1 MB of GPU memory.
import * as THREE from 'three';
import { CHUNK, NCX, NCZ } from './CityPlan.js';
import * as L from './Layout.js';
import { leafLight, heliWash, vegWind, HELI_WASH_GLSL } from './Wind.js';

const CELL = 0.5, S = 256, PS = 2, PC = PS / CELL /* 4 cells per patch side */, PN = S / PC /* 64 patches per window side */;
const MCHUNK = CHUNK / CELL; // cells per Grass.js mask side
export const KMAX = 4 * 320; // blades per 2 m patch at full density (320 / m²)
const F1 = 0.32, F2 = 0.1; // share of the near density kept at the near→mid and mid→far LOD switches
// grass levels: near density (blades / m²) and LOD radii (m). r2 = end of the grass (beyond: the lawn texture alone)
export const GRASS_LEVELS = {
  low: { dens: 70, r0: 7, r1: 18, r2: 30 },
  medium: { dens: 110, r0: 9, r1: 22, r2: 38 },
  high: { dens: 170, r0: 11, r1: 27, r2: 46 },
  ultra: { dens: 260, r0: 14, r1: 34, r2: 52 },
};
export const LEVEL_ORDER = ['low', 'medium', 'high', 'ultra'];
const QUALITY_LEVEL = { low: null, medium: 'medium', high: 'high', ultra: 'ultra' }; // 'low' quality keeps grass off (as before)
const PREF_KEY = 'colombo.grass.v1';
const LOD_ROWS = [[0, 0.24, 0.47, 0.67, 0.85], [0, 0.4, 0.72], [0]]; // spine rows per LOD (+ one tip vertex)

export const grassGPUUniforms = { uGTime: { value: 0 } };

// Blade index buffer for one patch: K blades, each `rows` pairs of vertices + a tip. position = (t along blade, side −1/0/+1, k)
function patchGeometry(K, rows) {
  const nv = rows.length * 2 + 1, pos = new Float32Array(K * nv * 3), idx = [];
  for (let k = 0; k < K; k++) {
    const b = k * nv; let o = b * 3;
    for (const t of rows) { pos[o++] = t; pos[o++] = -1; pos[o++] = k; pos[o++] = t; pos[o++] = 1; pos[o++] = k; }
    pos[o++] = 1; pos[o++] = 0; pos[o++] = k;
    for (let r = 0; r < rows.length - 1; r++) { const i = b + r * 2; idx.push(i, i + 1, i + 3, i, i + 3, i + 2); }
    const i = b + (rows.length - 1) * 2; idx.push(i, i + 1, b + nv - 1);
  }
  const g = new THREE.InstancedBufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3); g.setAttribute('position', pa);
  // three.js forces flat shading (normals from screen derivatives) on standard materials whose geometry has no normal
  // attribute — that silently replaced the shader's blade normals with the face normal (upright blades lit edge-on, near
  // black). The shader writes the real normal itself; the same buffer stands in as 'normal' (no extra memory).
  g.setAttribute('normal', pa);
  g.setIndex(new THREE.BufferAttribute(nv * K > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); g.boundingBox = new THREE.Box3(new THREE.Vector3(-1e6, -1e6, -1e6), new THREE.Vector3(1e6, 1e6, 1e6));
  return g;
}

const GLSL_COMMON = /* glsl */ `
uniform sampler2D uGMap; uniform sampler2D uGHt; uniform float uGTime;
uniform vec4 uGR;   // r0, r1, r2, patch size
uniform vec4 uGK;   // KMAX, density fraction, F1, F2
uniform vec4 uGPx;  // radians per pixel, normal→up blend near, far, unused
uniform vec3 uGCam;
uniform vec4 uWindV; uniform vec4 uHeli;
uniform vec4 uGPush[12]; uniform int uGNPush;
varying vec3 vGCol; varying float vGT;
uvec4 gPcg(uvec4 v) { v = v * 1664525u + 1013904223u; v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> 16u; v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z; return v; }
vec4 gH(ivec2 c, uint k, uint s) { return vec4(gPcg(uvec4(uvec2(c), k, s))) * (1.0 / 4294967295.0); }
float gHash(vec2 p) { uvec2 q = uvec2(ivec2(p)) * uvec2(1597334673u, 3812015801u); uint n = (q.x ^ q.y) * 1597334673u; return float(n) * (1.0 / 4294967295.0); }
float gNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y); }
// ground height at world xz from the 0.5 m cell centres; cells off the ground mesh (g = 0) are left out of the blend
float gGround(vec2 w, out float hsc) {
  vec2 p = w * 2.0 - 0.5; vec2 f = fract(p); ivec2 i0 = ivec2(floor(p)); ivec2 m = ivec2(${S - 1});
  vec2 a = texelFetch(uGHt, i0 & m, 0).rg, b = texelFetch(uGHt, (i0 + ivec2(1, 0)) & m, 0).rg, c = texelFetch(uGHt, (i0 + ivec2(0, 1)) & m, 0).rg, d = texelFetch(uGHt, (i0 + ivec2(1, 1)) & m, 0).rg;
  vec4 wt = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y) * step(vec4(0.001), vec4(a.g, b.g, c.g, d.g));
  float s = max(1e-4, wt.x + wt.y + wt.z + wt.w); hsc = (a.g * wt.x + b.g * wt.y + c.g * wt.z + d.g * wt.w) / s;
  return (a.r * wt.x + b.r * wt.y + c.r * wt.z + d.r * wt.w) / s;
}
// kept share of the near density at distance d (continuous; reaches F1 / F2 a patch-diagonal before each LOD switch, 0 at r2)
float gKeep(float d) {
  float r0 = uGR.x, r1 = uGR.y, r2 = uGR.z;
  if (d < r0 - 1.5) return mix(1.0, uGK.z, smoothstep(r0 * 0.35, r0 - 1.5, d));
  if (d < r1 - 1.5) return mix(uGK.z, uGK.w, smoothstep(r0 + 1.5, r1 - 1.5, d));
  return mix(uGK.w, 0.0, smoothstep(r1 + 1.5, r2 - 1.0, d));
}
`;

const GLSL_BLADE = /* glsl */ `
  vec3 gPos; vec3 objectNormal;
  {
    float tt = position.x, sd = position.y, kf = position.z; uint ku = uint(kf);
    ivec2 pc = ivec2(aP); float PSZ = uGR.w;
    vec4 h1 = gH(pc, ku, 7u), h2 = gH(pc, ku, 13u), h3 = gH(pc, ku, 29u), hp = gH(pc, 911u, 3u);
    float kgeo = uGK.x * uGK.y;
    vec2 loc = fract(vec2(0.5) + vec2(0.7548776662, 0.5698402910) * kf + hp.xy) + (h1.zw - 0.5) * (0.55 / sqrt(max(kgeo, 1.0)));
    vec2 W = (aP + loc) * PSZ;
    vec4 gm = texture2D(uGMap, W * ${(1 / (S * CELL)).toFixed(8)});
    float dens = gm.a; float hsc; float gy = gGround(W, hsc);
    vec3 root = vec3(W.x, gy - 0.02, W.y);
    float d = distance(root, uGCam);
    float Fd = gKeep(d), thr = Fd * dens, u = (kf + h1.x) / max(kgeo, 1.0);
    float fade = clamp((thr - u) / (0.22 * thr + 0.015), 0.0, 1.0); fade = fade * fade * (3.0 - 2.0 * fade);
    vGT = tt; vGCol = vec3(0.0);
    if (fade < 0.002 || hsc < 0.01) { gPos = root - vec3(0.0, 0.3, 0.0); objectNormal = vec3(0.0, 1.0, 0.0); }
    else {
      float tuft = gNoise(W * 2.7 + 17.0), macro = gNoise(W * 0.09 + 3.0);
      float h = 0.24 * hsc * (0.5 + 0.8 * h1.y) * (0.72 + 0.56 * tuft) * (0.62 + 0.38 * sqrt(dens));
      if (h2.w > 0.97) h *= 1.6; // the odd tall stem
      h *= mix(0.35, 1.0, fade);
      float wid = (0.0055 + 0.0055 * h2.x) * (0.8 + 0.35 * hsc);
      wid *= mix(1.0, inversesqrt(max(Fd, 0.05)), 0.7);           // fewer blades further out → wider, same coverage
      wid = max(wid, d * uGPx.x * 0.55) * mix(0.25, 1.0, fade);    // never thinner than ~1 px (no shimmer)
      float yaw = h2.y * 6.2831853; vec2 Fa = vec2(cos(yaw), sin(yaw)); vec2 Sa = vec2(-Fa.y, Fa.x);
      float lean = 0.18 + 0.72 * h2.z * h2.z;
      // ---- wind: steady lean + rolling gusts travelling downwind + fine ripples + the shared gust front, per-blade response
      vec2 D = uWindV.xy; float ws = uWindV.z, T = uGTime;
      float along = dot(W, D), across = dot(W, vec2(-D.y, D.x));
      float roll = gNoise(vec2(along * 0.07 - T * (0.5 + 0.35 * ws), across * 0.045));
      float ripple = gNoise(vec2(along * 0.5 - T * (1.7 + ws), across * 0.42) + 31.0);
      float front = uWindV.w * (0.55 + 0.45 * sin(along * 0.09 - T * 1.7));
      float dj = (gNoise(W * 0.045 + T * 0.025) - 0.5) * 0.9; float cj = cos(dj), sj = sin(dj);
      vec2 Dw = vec2(D.x * cj - D.y * sj, D.x * sj + D.y * cj);
      float flex = (0.7 + 0.6 * h2.x) * clamp(h / 0.22, 0.5, 1.6);
      float resp = 0.72 + 0.28 * abs(dot(Sa, Dw));                  // broadside blades catch more wind
      float osc = sin(T * (1.6 + 1.2 * h3.w) + h3.w * 37.0 + roll * 3.0);
      float bend = (ws * 0.2 + roll * (0.08 + 0.3 * ws) + ripple * (0.03 + 0.07 * ws) + front * 0.85) * flex * resp + osc * (0.03 + 0.06 * ws) * flex;
      vec2 O = Fa * sin(lean) + Dw * clamp(bend, -0.25, 1.1);
      // ---- movers (player, vehicles, trails): blades pushed away and flattened inside each radius
      for (int i = 0; i < 12; i++) { if (i >= uGNPush) break; vec4 P = uGPush[i]; vec2 dv = W - P.xy; float dl = length(dv) + 1e-3;
        O += dv / dl * (P.w * (1.0 - smoothstep(P.z * 0.3, P.z, dl))) * 1.4; }
      if (uHeli.w > 0.0) O += heliWashPush(root, T).xz * 1.6;
      float ol = length(O); if (ol > 0.93) { O *= 0.93 / ol; ol = 0.93; }
      float ty = sqrt(1.0 - ol * ol);
      vec3 P2 = vec3(O.x, ty, O.y) * h, P1 = vec3(O.x * 0.22, max(ty, 0.45) * 0.72, O.y * 0.22) * h;
      vec3 B = 2.0 * tt * (1.0 - tt) * P1 + tt * tt * P2, Tg = 2.0 * (1.0 - tt) * P1 + 2.0 * tt * (P2 - P1);
      float tw = (h3.x - 0.5) * 1.3 * tt; float ct = cos(tw), st = sin(tw);
      vec3 Sv = vec3(Sa.x * ct - Sa.y * st, 0.0, Sa.x * st + Sa.y * ct);
      float flut = sin(T * 7.3 + h1.y * 50.0 + along * 0.8) * (0.004 + 0.012 * ws) * tt * tt * flex;
      float wt = wid * (1.0 - tt * tt * 0.8);
      gPos = root + B + Sv * (wt * sd + flut);
      vec3 N = normalize(cross(Sv, Tg)); N = normalize(N + Sv * sd * 0.5);
      objectNormal = normalize(mix(N, vec3(0.0, 1.0, 0.0), mix(uGPx.y, uGPx.z, smoothstep(3.0, uGR.y, d))));
      // ---- colour: the lawn colour under the blade, per-blade tone, lush / dry patches, a few straw blades, dark roots, light tips
      vec3 C = gm.rgb;
      vec3 tone = mix(vec3(0.86, 1.0, 0.82), vec3(1.14, 1.06, 0.74), h3.y) * (0.9 + 0.3 * h1.z);
      tone *= mix(vec3(1.07, 1.0, 0.86), vec3(0.9, 1.0, 0.94), macro);
      vec3 col = C * tone;
      float dry = step(0.91, h3.z) * (0.45 + 0.55 * h1.w);
      col = mix(col, C * vec3(1.6, 1.3, 0.62), dry * (0.35 + 0.65 * tt));
      col *= mix(1.04, 1.3, smoothstep(0.45, 1.0, tt));
      col *= mix(0.5 + 0.18 * (1.0 - dens) + 0.1 * (1.0 - tuft), 1.0, smoothstep(0.0, 0.55, tt)); // self-shadowed root
      col = mix(col, C * 1.02, smoothstep(uGR.y, uGR.z, d) * 0.75);  // far: becomes the lawn texture it fades into
      vGCol = col;
    }
  }
`;

function grassMaterial(U) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  mat.name = 'grassGPU';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U); sh.uniforms.uGTime = grassGPUUniforms.uGTime; sh.uniforms.uWindV = vegWind; sh.uniforms.uHeli = heliWash;
    sh.uniforms.uLeafDir = leafLight.dir; sh.uniforms.uLeafCol = leafLight.col;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aP;' + GLSL_COMMON + HELI_WASH_GLSL)
      .replace('#include <beginnormal_vertex>', GLSL_BLADE)
      .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGCol; varying float vGT; uniform vec3 uLeafDir; uniform vec3 uLeafCol;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vGCol;')
      // thin blades glow with sunlight seen through them (low sun behind the grass), toward the open tip
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 Lv = normalize((viewMatrix * vec4(uLeafDir, 0.0)).xyz); vec3 Vv = normalize(vViewPosition); float through = pow(max(dot(-Vv, Lv), 0.0), 3.0);
          totalEmissiveRadiance += diffuseColor.rgb * uLeafCol * vec3(0.85, 1.0, 0.45) * through * 0.5 * smoothstep(0.15, 0.9, vGT); }`)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directSpecular *= 0.4;')
      // both faces keep the shader's blade normal (the default back-face flip turns half the blades black), and a normal
      // seen almost edge-on is eased toward the viewer so thin grazing blades don't flash into full Fresnel specular
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.split('*= faceDirection').join('*= 1.0')
        + '\n{ vec3 gV = normalize(vViewPosition); float gnv = dot(normal, gV); if (gnv < 0.15) normal = normalize(normal + gV * (0.15 - gnv)); }');
  };
  const src = GLSL_COMMON + GLSL_BLADE + mat.onBeforeCompile.toString(); let hsh = 0; for (let i = 0; i < src.length; i++) hsh = (hsh * 31 + src.charCodeAt(i)) | 0;
  mat.customProgramCacheKey = () => 'grassGPU' + hsh; // the shader source itself (a stale program must never be reused)
  return mat;
}

function loadPrefs() { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } }

const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(), _v = new THREE.Vector3();

export class GrassGPU {
  // legacy: the Grass.js GrassField — its per-chunk masks are the single source of where grass grows
  constructor(world, legacy, quality = 'high') {
    this.world = world; this.legacy = legacy;
    this.col = new Uint8Array(S * S * 4); this.ht = new Float32Array(S * S * 2);
    this.pMax = new Uint8Array(PN * PN); this.pY = new Float32Array(PN * PN); this.pMean = new Uint8Array(PN * PN);
    this.mapTex = new THREE.DataTexture(this.col, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    Object.assign(this.mapTex, { colorSpace: THREE.SRGBColorSpace, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, generateMipmaps: false, flipY: false });
    this.htTex = new THREE.DataTexture(this.ht, S, S, THREE.RGFormat, THREE.FloatType);
    Object.assign(this.htTex, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter, generateMipmaps: false, flipY: false });
    this.U = {
      uGMap: { value: this.mapTex }, uGHt: { value: this.htTex },
      uGR: { value: new THREE.Vector4(11, 30, 46, PS) }, uGK: { value: new THREE.Vector4(KMAX, 0.6, F1, F2) },
      uGPx: { value: new THREE.Vector4(0.001, 0.45, 0.85, 0) }, uGCam: { value: new THREE.Vector3() },
      uGPush: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }, uGNPush: { value: 0 },
    };
    this.material = grassMaterial(this.U);
    this.group = new THREE.Group(); this.group.name = 'grassGPU';
    this.lods = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(new THREE.InstancedBufferGeometry(), this.material); m.name = 'grassGPU' + i;
      m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false;
      const a = new THREE.InstancedBufferAttribute(new Float32Array(PN * PN * 2), 2); a.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m); return { mesh: m, attr: a, n: 0, K: 0 };
    });
    this.ox = 1e9; this.oz = 1e9; // window origin (cells, multiple of 16)
    this.prefs = loadPrefs(); this.quality = quality; this.level = null; this.cur = { dens: 0, r0: 0, r1: 0, r2: 0 }; this.tgt = null; this.kgeo = 0;
    this.movers = []; this.trail = []; this.trailHead = 0; this.moverFn = null; this.lastDrop = new Map();
    this.gov = { t: 0, n: 0, slow: 0, fast: 0, drop: 0 };
    this._mc = { x: 0, z: 0 }; this._add = (id, x, z, r) => { const l = this.movers; if (l.length < 32 && r > 0 && (x - this._mc.x) ** 2 + (z - this._mc.z) ** 2 < 45 * 45) l.push(id, x, z, r); };
    this.stats = { level: null, patches: [0, 0, 0], blades: 0, bladesSubmitted: 0, verts: 0, draws: 0, fill: 0, refills: 0, gpuBytes: 0 };
    this.enabled = true; this.frozen = false;
    this.setQuality(quality);
  }
  // ---------------------------------------------------------------- settings
  // level: 'off' | 'low' | 'medium' | 'high' | 'ultra' | 'auto' (= by graphics quality); stored on this PC
  setPreference(level, persist = true) { this.prefs.level = level; if (persist) savePrefs(this.prefs); this.applyLevel(); }
  setQuality(q) { this.quality = q; this.applyLevel(); }
  applyLevel() {
    const p = this.prefs.level, auto = !p || p === 'auto'; let lv = auto ? (this.quality in QUALITY_LEVEL ? QUALITY_LEVEL[this.quality] : 'high') : p === 'off' ? null : p;
    if (lv && !GRASS_LEVELS[lv]) lv = 'high';
    if (lv && auto && this.gov.drop) lv = LEVEL_ORDER[Math.max(0, LEVEL_ORDER.indexOf(lv) - this.gov.drop)]; // frame-rate governor
    if (lv !== this.level) this.setLevel(lv);
  }
  setLevel(name, instant = false) {
    const L0 = name && GRASS_LEVELS[name]; this.level = L0 ? name : null; this.stats.level = this.level;
    this.tgt = L0 ? { ...L0 } : { dens: 0, r0: this.cur.r0, r1: this.cur.r1, r2: this.cur.r2 };
    if (L0) { const k = Math.ceil(L0.dens * PS * PS); if (k > this.kgeo) this.buildGeometry(k); } // grow the blade buffers first, then fade in
    if (instant || !this.cur.dens) { this.cur = { ...this.tgt }; if (!this.cur.dens) this.cur.r2 = 0; if (L0) this.buildGeometry(Math.ceil(L0.dens * PS * PS)); }
  }
  buildGeometry(K) {
    K = Math.max(8, Math.min(KMAX, K)); if (K === this.kgeo) return; this.kgeo = K;
    const ks = [K, Math.ceil(K * F1) + 2, Math.ceil(K * F2) + 2]; let bytes = 0;
    this.lods.forEach((l, i) => { const old = l.mesh.geometry; const g = patchGeometry(ks[i], LOD_ROWS[i]); g.setAttribute('aP', l.attr); g.instanceCount = 0; l.mesh.geometry = g; old.dispose(); l.K = ks[i]; l.nv = (LOD_ROWS[i].length * 2 + 1);
      bytes += g.attributes.position.array.byteLength + g.index.array.byteLength + l.attr.array.byteLength; });
    this.stats.gpuBytes = bytes + this.col.byteLength + this.ht.byteLength;
  }
  // ---------------------------------------------------------------- grass map window
  cell(gi, gj, cache) { // fill one 0.5 m cell from the Grass.js mask
    const x = (gi + 0.5) * CELL, z = (gj + 0.5) * CELL; const o = ((gj & (S - 1)) * S + (gi & (S - 1)));
    const ci = Math.floor((x - L.BOUNDS.minX) / CHUNK), cj = Math.floor((z - L.BOUNDS.minZ) / CHUNK);
    if (ci < 0 || cj < 0 || ci >= NCX || cj >= NCZ) { this.col[o * 4 + 3] = 0; this.ht[o * 2 + 1] = 0; return; }
    const idx = cj * NCX + ci; let m = cache.idx === idx ? cache.m : null;
    if (!m) { m = this.legacy.mask(idx); cache.idx = idx; cache.m = m; }
    const k = Math.floor((z - m.oz) / CELL) * MCHUNK + Math.floor((x - m.ox) / CELL);
    const a = m.a[k], c = o * 4; this.col[c] = m.r[k]; this.col[c + 1] = m.g[k]; this.col[c + 2] = m.b[k]; this.col[c + 3] = a;
    this.ht[o * 2] = m.y[k]; this.ht[o * 2 + 1] = m.hy[k] ? (m.lawn[k] ? 0.62 : 1.05) : 0;
  }
  fillRect(i0, j0, i1, j1) { // cells [i0, i1) × [j0, j1) (global cell coords) + their patches
    const cache = { idx: -1, m: null };
    for (let gj = j0; gj < j1; gj++) for (let gi = i0; gi < i1; gi++) this.cell(gi, gj, cache);
    for (let pj = Math.floor(j0 / PC); pj < Math.ceil(j1 / PC); pj++) for (let pi = Math.floor(i0 / PC); pi < Math.ceil(i1 / PC); pi++) this.patchInfo(pi, pj);
    this.stats.fill += (i1 - i0) * (j1 - j0);
  }
  patchInfo(pi, pj) {
    let mx = 0, sum = 0, ys = 0, yn = 0;
    for (let b = 0; b < PC; b++) for (let a = 0; a < PC; a++) { const gi = pi * PC + a, gj = pj * PC + b; const o = ((gj & (S - 1)) * S + (gi & (S - 1)));
      const d = this.col[o * 4 + 3]; if (d > mx) mx = d; sum += d; if (this.ht[o * 2 + 1] > 0) { ys += this.ht[o * 2]; yn++; } }
    const p = (pj & (PN - 1)) * PN + (pi & (PN - 1)); this.pMax[p] = mx; this.pMean[p] = Math.round(sum / (PC * PC)); this.pY[p] = yn ? ys / yn : 0;
  }
  recentre(fx, fz) {
    const ci = Math.floor(fx / CELL), cj = Math.floor(fz / CELL);
    const nx = Math.floor(ci / 16) * 16 - S / 2, nz = Math.floor(cj / 16) * 16 - S / 2;
    if (nx === this.ox && nz === this.oz) return false;
    const t0 = performance.now(); const ox = this.ox, oz = this.oz;
    if (Math.abs(nx - ox) >= S || Math.abs(nz - oz) >= S) this.fillRect(nx, nz, nx + S, nz + S);
    else {
      // columns entering on x (full height of the new window), then rows entering on z (the remaining width)
      if (nx > ox) this.fillRect(ox + S, nz, nx + S, nz + S); else if (nx < ox) this.fillRect(nx, nz, ox, nz + S);
      const xa = Math.max(nx, ox), xb = Math.min(nx, ox) + S;
      if (nz > oz) this.fillRect(xa, oz + S, xb, nz + S); else if (nz < oz) this.fillRect(xa, nz, xb, oz);
    }
    this.ox = nx; this.oz = nz; this.mapTex.needsUpdate = true; this.htTex.needsUpdate = true; this.stats.refills++; this.stats.lastFillMs = +(performance.now() - t0).toFixed(1);
    return true;
  }
  // forget the cached map (ground / masks changed, e.g. after a teleport into a chunk built later)
  invalidate() { this.ox = 1e9; this.oz = 1e9; }
  // ---------------------------------------------------------------- movers (player / vehicles bend the grass)
  // fn(add) is called once a frame; add(id, x, z, radius) for every mover near the camera
  setMoverSource(fn) { this.moverFn = fn; }
  updateMovers(dt, cx, cz) {
    const P = this.U.uGPush.value; let n = 0; const list = this.movers; list.length = 0;
    this._mc.x = cx; this._mc.z = cz; if (this.moverFn) { try { this.moverFn(this._add); } catch { /* a mover source must never break the frame */ } }
    for (let i = 0; i < list.length && i < 32; i += 4) {
      const id = list[i], x = list[i + 1], z = list[i + 2], r = list[i + 3]; if (n < 12) P[n++].set(x, z, r, 0.85);
      const last = this.lastDrop.get(id); // trail: blades pressed down behind a mover recover over ~2.5 s
      if (!last || (last.x - x) ** 2 + (last.z - z) ** 2 > (r * 0.6) ** 2) { if (last) { last.x = x; last.z = z; } else this.lastDrop.set(id, { x, z });
        const tp = this.trail[this.trailHead] || (this.trail[this.trailHead] = { x: 0, z: 0, r: 0, age: 99 }); tp.x = x; tp.z = z; tp.r = r; tp.age = 0; this.trailHead = (this.trailHead + 1) % 24; }
    }
    if (this.lastDrop.size > 64) this.lastDrop.clear();
    for (const tp of this.trail) { tp.age += dt; if (tp.age < 2.5 && n < 12) P[n++].set(tp.x, tp.z, tp.r * 0.9, 0.7 * Math.exp(-tp.age * 1.4)); }
    this.U.uGNPush.value = n;
  }
  // ---------------------------------------------------------------- per frame
  update(dt, focus, camera) {
    grassGPUUniforms.uGTime.value += dt;
    // ease level changes (density / radii) so switching or the frame-rate governor never pops
    const c = this.cur, t = this.tgt, e = Math.min(1, dt * 1.5);
    if (t) { for (const k of ['dens', 'r0', 'r1', 'r2']) c[k] += (t[k] - c[k]) * e; if (Math.abs(c.dens - t.dens) < 0.5) { c.dens = t.dens; if (t.dens && Math.ceil(t.dens * PS * PS) < this.kgeo) this.buildGeometry(Math.ceil(t.dens * PS * PS)); } }
    const on = this.enabled && c.dens > 0.5 && camera; this.group.visible = !!on;
    if (!on) { for (const l of this.lods) l.mesh.geometry.instanceCount = 0; this.stats.patches = [0, 0, 0]; this.stats.blades = 0; this.stats.draws = 0; return; }
    camera.updateMatrixWorld(); const cp = camera.getWorldPosition(_v); const cx = cp.x, cz = cp.z;
    if (!this.frozen) this.recentre(cx, cz);
    const U = this.U; U.uGCam.value.copy(cp);
    U.uGR.value.set(c.r0, c.r1, c.r2, PS); U.uGK.value.set(KMAX, Math.min(1, c.dens * PS * PS / KMAX), F1, F2);
    const fovY = (camera.fov || 60) * Math.PI / 180, ph = this.viewH || (typeof window !== 'undefined' ? window.innerHeight : 720);
    U.uGPx.value.x = 2 * Math.tan(fovY / 2) / Math.max(240, ph);
    this.updateMovers(dt, cx, cz);
    // patch culling: radius, coverage, frustum; LOD by distance to the patch centre
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm, camera.coordinateSystem, camera.reversedDepth);
    const R = c.r2 + 1.5, r0 = c.r0, r1 = c.r1, cy = cp.y; const A = [this.lods[0].attr.array, this.lods[1].attr.array, this.lods[2].attr.array]; const n = [0, 0, 0];
    const pi0 = Math.floor((cx - R) / PS), pi1 = Math.floor((cx + R) / PS), pj0 = Math.floor((cz - R) / PS), pj1 = Math.floor((cz + R) / PS);
    const wi0 = this.ox / PC, wj0 = this.oz / PC; let blades = 0; const keep = (d) => (d < r0 ? 1 - (1 - F1) * Math.max(0, (d - r0 * 0.35) / (r0 * 0.65)) : d < r1 ? F1 - (F1 - F2) * (d - r0) / (r1 - r0) : F2 * Math.max(0, 1 - (d - r1) / (c.r2 - r1)));
    for (let pj = pj0; pj <= pj1; pj++) { if (pj < wj0 || pj >= wj0 + PN) continue; const z = (pj + 0.5) * PS, dz = z - cz;
      for (let pi = pi0; pi <= pi1; pi++) { if (pi < wi0 || pi >= wi0 + PN) continue;
        const p = (pj & (PN - 1)) * PN + (pi & (PN - 1)); if (!this.pMax[p]) continue;
        const x = (pi + 0.5) * PS, dx = x - cx, y = this.pY[p], dy = y - cy; const d2 = dx * dx + dz * dz; if (d2 > R * R) continue;
        _sph.center.set(x, y + 0.2, z); _sph.radius = 1.9; if (!_fr.intersectsSphere(_sph)) continue;
        const d = Math.sqrt(d2 + dy * dy); const li = d < r0 ? 0 : d < r1 ? 1 : 2; const o = n[li]++ * 2; A[li][o] = pi; A[li][o + 1] = pj;
        blades += this.kgeo * keep(d) * this.pMean[p] / 255; } }
    let draws = 0, verts = 0, sub = 0;
    this.lods.forEach((l, i) => { l.mesh.geometry.instanceCount = n[i]; if (n[i]) { draws++; l.attr.clearUpdateRanges(); l.attr.addUpdateRange(0, n[i] * 2); l.attr.needsUpdate = true; verts += n[i] * l.K * l.nv; sub += n[i] * l.K; } });
    const S0 = this.stats; S0.patches[0] = n[0]; S0.patches[1] = n[1]; S0.patches[2] = n[2]; S0.blades = Math.round(blades); S0.bladesSubmitted = sub; S0.verts = verts; S0.draws = draws;
    this.governor(dt);
  }
  // frame-rate governor: while grass is on screen and the game runs well below 40 fps for several seconds, step one level
  // down (eased, so density thins smoothly); step back up once frames recover. Never above the chosen level.
  governor(dt) {
    const G = this.gov; if (this.prefs.governor === false || (this.prefs.level && this.prefs.level !== 'auto') || !(dt > 0) || dt > 0.5) return;
    if (this.stats.blades < 3000) { G.t = 0; G.n = 0; return; }
    G.t += dt; G.n++; if (G.t < 3) return; const fps = G.n / G.t; G.t = 0; G.n = 0;
    if (fps < 36) { G.slow++; G.fast = 0; } else if (fps > 55) { G.fast++; G.slow = 0; } else { G.slow = 0; G.fast = 0; }
    if (G.slow >= 2 && G.drop < 2) { G.drop++; G.slow = 0; this.applyLevel(); }
    else if (G.fast >= 6 && G.drop > 0) { G.drop--; G.fast = 0; this.applyLevel(); }
  }
  warmMeshes() { const m = new THREE.Mesh(patchGeometry(4, LOD_ROWS[2]), this.material); m.geometry.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(2), 2)); m.geometry.instanceCount = 1; m.frustumCulled = false; return [m]; }
}
