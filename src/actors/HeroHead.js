// Protagonist heads (Dineth, Shashika, David): an anatomically built head + neck derived from the CC0 MakeHuman base
// mesh (shaped per hero offline — tools/mh/bake-hero-heads.mjs → heroHeadData.js), replacing the procedural ellipsoid
// head, blob nose and ear shells for the three playable characters only (the crowd keeps its light-weight heads).
//
//  • skin: per-region colouring driven by anatomical masks (lips, eyelids, nose, ears), periorbital / beard-shadow tones,
//    T-zone shine, procedural pore normals, plus the shared subsurface / wetness / wrinkle shading (patchHeroMaterial)
//  • eyes: real eyeballs (sclera, fibrous iris, limbal ring, pupil, glossy cornea bulge) that rotate for gaze, under
//    eyelids that close with morph targets; eyelash strips with a strand alpha texture
//  • eyebrows: hundreds of individual hair strands grown on the skin along the natural growth pattern
//  • facial hair / scalp hair: shell-fur (aligned strand cross-sections in stacked layers) over a hair volume fitted to
//    the real scalp, with Kajiya–Kay strand highlights along a per-vertex comb direction
//  • expressions: 14 morph targets (blinks, jaw, smile, brows, squint, frown, press, pucker, sneer…) driven by FaceRig
import * as THREE from 'three';
import DATA from './heroHeadData.js';
import { patchHeroMaterial, faceNormals } from './HeroRig.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mul3 = (a, m) => [a[0] * m[0], a[1] * m[1], a[2] * m[2]];
const hash = (x, y = 0, z = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const dec = (b64, T) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new T(u.buffer); };

export const HEAD_MORPHS = DATA.morphs; // names, in morphTargetInfluences order
let SH = null;
function shared() {
  if (SH) return SH;
  const masks = {}; for (const [k, v] of Object.entries(DATA.masks)) masks[k] = Float32Array.from(dec(v, Uint8Array), (x) => x / 255);
  SH = { idx: DATA.idx.map((b) => dec(b, Uint16Array)), uv: dec(DATA.uv, Float32Array), w: dec(DATA.weights, Uint8Array), masks, N: DATA.verts };
  // part membership per vertex (0 skin, 1 upper teeth, 2 lower teeth, 3 tongue, 4 lashes)
  SH.part = new Uint8Array(SH.N); SH.idx.forEach((ix, p) => { for (const i of ix) SH.part[i] = p; });
  return SH;
}
const HD = new Map();
function heroData(id) {
  if (HD.has(id)) return HD.get(id); const h = DATA.heroes[id]; if (!h) throw new Error('no baked head for ' + id);
  const q = dec(h.pos, Int16Array); const pos = Float32Array.from(q, (v) => v * h.q);
  const morphs = DATA.morphs.map((name) => { const m = h.morphs[name]; const i = dec(m.i, Uint16Array), d = dec(m.d, Int16Array); return { i, d: Float32Array.from(d, (v) => v * 2e-6) }; });
  const r = { pos, morphs, L: h.L }; HD.set(id, r); return r;
}
export const hasHeroHead = (sp) => !!(sp && sp.mh && DATA.heroes[sp.mh]);

// ------------------------------------------------------------------ fit to the game skeleton
// head-local (metres, origin between the eyes, +x = character's left, +z forward) → model space: uniform scale k and
// offset o, so the crown sits where the old head's crown was and the neck column is centred on the neck bone.
const FITS = new Map();
export function heroHeadFit(sp) {
  const key = sp.mh + '|' + sp.height; if (FITS.has(key)) return FITS.get(key);
  const D = heroData(sp.mh), S = shared(); const s = sp.height / 1.72; const k = Math.sqrt(sp.height / 1.76) * 1.04; const L = D.L;
  const nz = (L.neck.z0 + L.neck.z1) / 2; const o = [0, 1.75 * s - k * L.crown, -k * nz + 0.004];
  const T = (p) => [o[0] + k * p[0], o[1] + k * p[1], o[2] + k * p[2]];
  // neck cross-section (model space) at height y: centre z and half extents of the skin there
  const neckAt = (y) => { let x1 = 0, z0 = 1e9, z1 = -1e9, n = 0; const P = D.pos;
    for (let i = 0; i < S.N; i++) { if (S.part[i] !== 0) continue; const py = o[1] + k * P[i * 3 + 1]; if (Math.abs(py - y) > 0.008 || P[i * 3 + 1] > L.chin[1] - 0.005) continue; const px = k * P[i * 3], pz = o[2] + k * P[i * 3 + 2]; x1 = Math.max(x1, Math.abs(px)); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); n++; }
    if (!n) return null; return { cz: (z0 + z1) / 2, rx: x1, rz: (z1 - z0) / 2 }; };
  let b0 = 1e9, b1 = -1e9, bx = 0, bz0 = 1e9, bz1 = -1e9; for (const i of DATA.boundary) { const y = o[1] + k * D.pos[i * 3 + 1]; b0 = Math.min(b0, y); b1 = Math.max(b1, y); bx = Math.max(bx, Math.abs(k * D.pos[i * 3])); const z = o[2] + k * D.pos[i * 3 + 2]; bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }
  // the ragged neck opening is closed by a vertical skirt down to a level cut inside the shirt (cutY); 'section' is the
  // cross-section of that skirt, which the torso / collar rings wrap
  const cutY = Math.min(b0, 1.462 * s) - 0.004; const section = { cz: (bz0 + bz1) / 2, rx: bx, rz: (bz1 - bz0) / 2 };
  // the real neck is not an ellipse (throat, sternocleidomastoids bulge on the diagonals): scale the section so it encloses
  // every neck vertex in the band a collar covers (cutY … cutY + 6 cm) — collars built on it never let skin poke through
  let encl = 1; { const P = D.pos; for (let i = 0; i < S.N; i++) { if (S.part[i] !== 0 || P[i * 3 + 1] > L.chin[1] - 0.005) continue; const py = o[1] + k * P[i * 3 + 1]; if (py < cutY || py > cutY + 0.06) continue;
    const ex = (k * P[i * 3]) / section.rx, ez = (o[2] + k * P[i * 3 + 2] - section.cz) / section.rz; encl = Math.max(encl, Math.hypot(ex, ez)); } }
  section.encl = Math.min(encl, 1.35);
  // collar ellipse: fitted to the real neck over the whole height a collar can reach (cutY … cutY + 8 cm): its own centre
  // (the throat sits forward of the ragged opening), its own extents, then grown until every vertex in the band is inside
  const collarAt = (y1) => { const P = D.pos; let xm = section.rx, z0 = section.cz - section.rz, z1 = section.cz + section.rz; const pts = []; // the skirt (section) is always inside
    for (let i = 0; i < S.N; i++) { if (S.part[i] !== 0 || P[i * 3 + 1] > L.chin[1] - 0.005) continue; const py = o[1] + k * P[i * 3 + 1]; if (py < cutY || py > y1) continue; const px = k * P[i * 3], pz = o[2] + k * P[i * 3 + 2]; xm = Math.max(xm, Math.abs(px)); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); pts.push(px, pz); }
    const c = { cz: (z0 + z1) / 2, rx: Math.max(xm, section.rx), rz: Math.max((z1 - z0) / 2, section.rz) }; let e = 1; for (let j = 0; j < pts.length; j += 2) e = Math.max(e, Math.hypot(pts[j] / c.rx, (pts[j + 1] - c.cz) / c.rz));
    c.rx *= e; c.rz *= e; return c; };
  const collar = collarAt(cutY + 0.08);
  const f = { k, o, T, L, neckAt, eyeL: T(L.eyeL), eyeR: T(L.eyeR), eyeRad: L.eyeR_ * k * 0.93, bottom: o[1] + k * L.neck.y, bottomMin: b0, bottomMax: b1, cutY, section, collar, collarAt };
  FITS.set(key, f); return f;
}

// ------------------------------------------------------------------ textures (procedural, original)
let TX = null;
function canvas(w, h) { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext && c.getContext('2d'); if (!g || !g.createImageData || !g.arc) return null; const t = g.createImageData(1, 1); return t && t.data ? { c, g } : null; } // null without a real canvas (Node tests)
function textures() {
  if (TX) return TX; TX = {};
  // pore / fine-skin normal detail (tiling)
  const P = canvas(256, 256);
  if (P) { const W = 256, img = P.g.createImageData(W, W), hgt = new Float32Array(W * W);
    const vn = (x, y, f) => { const xi = Math.floor(x * f), yi = Math.floor(y * f), xf = x * f - xi, yf = y * f - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const h = (a, b) => hash(((a % f) + f) % f, ((b % f) + f) % f, f); return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v); };
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const u = x / W, v = y / W; let h = 0.55 * vn(u, v, 48) + 0.3 * vn(u, v, 24) + 0.15 * vn(u, v, 8); const pore = vn(u, v, 64); h -= 0.6 * Math.max(0, pore - 0.72) * 3; hgt[y * W + x] = h; }
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x; const hx = hgt[y * W + ((x + 1) % W)] - hgt[y * W + ((x - 1 + W) % W)], hy = hgt[((y + 1) % W) * W + x] - hgt[((y - 1 + W) % W) * W + x]; let nx = -hx * 2.2, ny = -hy * 2.2, nz = 1; const l = Math.hypot(nx, ny, nz); img.data[i * 4] = (nx / l * 0.5 + 0.5) * 255; img.data[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i * 4 + 3] = 255; }
    P.g.putImageData(img, 0, 0); TX.pores = new THREE.CanvasTexture(P.c); TX.pores.wrapS = TX.pores.wrapT = THREE.RepeatWrapping; TX.pores.colorSpace = THREE.NoColorSpace; TX.pores.anisotropy = 4; }
  // eye: sclera with faint vessels toward the edge, fibrous dark-brown iris, limbal ring, pupil
  const E = canvas(512, 512);
  if (E) { const g = E.g, R = 256; const sc = g.createRadialGradient(R, R, 60, R, R, 256); sc.addColorStop(0, '#efe9e1'); sc.addColorStop(0.7, '#e6ddd2'); sc.addColorStop(1, '#d7c4b6'); g.fillStyle = sc; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(170,70,60,0.18)'; g.lineWidth = 1; for (let i = 0; i < 46; i++) { let a = hash(i, 3) * Math.PI * 2, r = 250; g.beginPath(); g.moveTo(R + Math.cos(a) * r, R + Math.sin(a) * r); for (let k = 0; k < 6; k++) { r -= 14 + hash(i, k) * 16; a += (hash(k, i) - 0.5) * 0.25; g.lineTo(R + Math.cos(a) * r, R + Math.sin(a) * r); } g.stroke(); }
    const ir = 0.245 * 512 * 0.5 * 2; // iris radius in px (uv radius 0.245 of the planar front projection)
    const ig = g.createRadialGradient(R, R, ir * 0.3, R, R, ir); ig.addColorStop(0, '#3a2412'); ig.addColorStop(0.55, '#2a170b'); ig.addColorStop(0.9, '#1d1008'); ig.addColorStop(1, '#0d0805'); g.fillStyle = ig; g.beginPath(); g.arc(R, R, ir, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 260; i++) { const a = (i / 260) * Math.PI * 2 + hash(i) * 0.02; const r0 = ir * (0.33 + hash(i, 1) * 0.08), r1 = ir * (0.78 + hash(i, 2) * 0.2); g.strokeStyle = hash(i, 4) < 0.5 ? `rgba(110,70,35,${0.25 + hash(i, 5) * 0.3})` : `rgba(15,8,4,${0.25 + hash(i, 6) * 0.3})`; g.lineWidth = 1 + hash(i, 7) * 1.4; g.beginPath(); g.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0); g.quadraticCurveTo(R + Math.cos(a + 0.05) * (r0 + r1) / 2, R + Math.sin(a + 0.05) * (r0 + r1) / 2, R + Math.cos(a) * r1, R + Math.sin(a) * r1); g.stroke(); }
    g.strokeStyle = 'rgba(140,95,50,0.35)'; g.lineWidth = 3; g.beginPath(); g.arc(R, R, ir * 0.5, 0, Math.PI * 2); g.stroke(); // collarette
    const lg = g.createRadialGradient(R, R, ir * 0.86, R, R, ir * 1.04); lg.addColorStop(0, 'rgba(8,5,3,0)'); lg.addColorStop(0.7, 'rgba(8,5,3,0.85)'); lg.addColorStop(1, 'rgba(8,5,3,0)'); g.fillStyle = lg; g.beginPath(); g.arc(R, R, ir * 1.05, 0, Math.PI * 2); g.fill(); // limbal ring
    g.fillStyle = '#050403'; g.beginPath(); g.arc(R, R, ir * 0.38, 0, Math.PI * 2); g.fill(); // pupil
    TX.eye = new THREE.CanvasTexture(E.c); TX.eye.colorSpace = THREE.SRGBColorSpace; TX.eye.anisotropy = 4; }
  // eyelash strand alpha: tapered, slightly curved lashes rooted along v = 0
  const A = canvas(512, 64);
  if (A) { const g = A.g; g.fillStyle = '#000'; g.fillRect(0, 0, 512, 64); for (let i = 0; i < 300; i++) { const x = hash(i, 9) * 512, len = 34 + hash(i, 8) * 28, bend = (hash(i, 7) - 0.5) * 16; g.strokeStyle = '#fff'; g.lineCap = 'round';
      for (let s = 0; s < 6; s++) { const t0 = s / 6, t1 = (s + 1) / 6; g.lineWidth = 2.4 * (1 - t0 * 0.85); g.beginPath(); g.moveTo(x + bend * t0 * t0, 64 - len * t0); g.lineTo(x + bend * t1 * t1, 64 - len * t1); g.stroke(); } }
    TX.lash = new THREE.CanvasTexture(A.c); TX.lash.colorSpace = THREE.NoColorSpace; TX.lash.wrapS = THREE.RepeatWrapping; }
  return TX;
}

// ------------------------------------------------------------------ materials
const NOISE_GLSL = `
float hh13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hh13(i), hh13(i + vec3(1,0,0)), f.x), mix(hh13(i + vec3(0,1,0)), hh13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hh13(i + vec3(0,0,1)), hh13(i + vec3(1,0,1)), f.x), mix(hh13(i + vec3(0,1,1)), hh13(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
// strand-direction (Kajiya–Kay) highlights for hair / fur: primary tight white lobe, secondary hair-tinted lobe
const KK_GLSL = `
  #if NUM_DIR_LIGHTS > 0
  { vec3 Lh = directionalLights[0].direction; vec3 Vh = normalize(vViewPosition); vec3 Th = normalize(vFlowV - normal * dot(vFlowV, normal) + 1e-5);
    vec3 Hh = normalize(Lh + Vh); vec3 T1 = normalize(Th + normal * (0.12 + kkShift)), T2 = normalize(Th - normal * (0.18 - kkShift));
    float d1 = dot(T1, Hh), d2 = dot(T2, Hh); float s1 = pow(sqrt(max(0.0, 1.0 - d1 * d1)), 220.0), s2 = pow(sqrt(max(0.0, 1.0 - d2 * d2)), 36.0);
    float lit = smoothstep(-0.1, 0.4, dot(normal, Lh));
    reflectedLight.directSpecular += directionalLights[0].color * lit * (s1 * 0.05 + s2 * 0.14 * (diffuseColor.rgb * 2.0 + 0.01)) * kkGain; }
  #endif`;
// Per-material image-based-light scale. three r186 replaces material.envMapIntensity with scene.environmentIntensity
// whenever the material has no envMap of its own, so the scale has to live in the shader. The bright HDR sky
// otherwise turns near-black hair blue; the reflection is also partly desaturated (hair/skin scatter it).
export function iblScale(m, spec, diff, desat = 0.5) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) { if (prev) prev.call(this, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
    #if defined( RE_IndirectSpecular )
    radiance = mix(radiance, vec3(dot(radiance, vec3(0.2126, 0.7152, 0.0722))), ${desat.toFixed(2)}) * ${spec.toFixed(3)};
    #endif
    iblIrradiance = mix(iblIrradiance, vec3(dot(iblIrradiance, vec3(0.2126, 0.7152, 0.0722))), ${(desat * 0.5).toFixed(2)}) * ${diff.toFixed(3)};`); };
  m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + `|ibl${spec}_${diff}_${desat}`; };
  return m;
}
function hairMaterial(kind, opts = {}) {
  // kind 'volume' (solid hair mass with fine strand relief) or 'fur' (alpha-tested shell layer)
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: kind === 'fur' ? 0.7 : 0.6, metalness: 0, side: kind === 'fur' ? THREE.DoubleSide : THREE.FrontSide });
  if (kind === 'volume') { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; }
  const freq = opts.freq || 2400; // strand cross-sections per metre
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aFlow; attribute vec3 aRoot; attribute float aLayer;\nvarying vec3 vFlowV; varying vec3 vRoot; varying float vLayer; varying vec3 vFlowO;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlowV = normalize(normalMatrix * aFlow); vRoot = aRoot; vLayer = aLayer; vFlowO = aFlow;');
    let fs = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFlowV; varying vec3 vRoot; varying float vLayer; varying vec3 vFlowO;' + NOISE_GLSL);
    if (kind === 'fur') fs = fs.replace('#include <alphatest_fragment>', `
      { vec3 q = vRoot * ${freq.toFixed(1)}; float fw = length(fwidth(q));
        float n = vn3(q) * 0.75 + vn3(q * 2.3 + 7.1) * 0.25; float keep = n - (0.36 + vLayer * 0.4);
        if (fw > 2.6) { if (vLayer > 0.3) discard; } else if (keep < 0.0) discard; }`);
    fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 pq = vRoot * ${(freq * 0.5).toFixed(1)}; vec3 side = normalize(cross(vFlowO, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
      float sc = dot(vRoot, side) * ${(freq * 1.4).toFixed(1)} + vn3(pq * 0.3) * 6.0; float fws = fwidth(sc);
      float strand = mix(0.5 + 0.5 * sin(sc), 0.5, clamp(fws * 0.5, 0.0, 1.0));
      diffuseColor.rgb *= 0.78 + 0.34 * strand + ${kind === 'fur' ? 'vLayer * 0.18' : '0.0'};
      float kkShift = (strand - 0.5) * 0.2; float kkGain = ${kind === 'fur' ? '0.6' : '1.0'} * (0.7 + 0.6 * strand);`);
    fs = fs.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + KK_GLSL);
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'herohair-' + kind + freq;
  return m;
}

// ------------------------------------------------------------------ geometry assembly helpers
class Acc {
  constructor(nm) { this.p = []; this.n = []; this.uv = []; this.uv2 = []; this.c = []; this.anchor = []; this.flow = []; this.root = []; this.layer = []; this.rough = []; this.groups = []; this.nm = nm; }
  get count() { return this.p.length / 3; }
  add(p, n, uv, col, anchor, o = {}) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.uv.push(uv[0], uv[1]); const u2 = o.uv2 || uv; this.uv2.push(u2[0], u2[1]); this.c.push(col[0], col[1], col[2]); this.anchor.push(anchor);
    const f = o.flow || [0, -1, 0]; this.flow.push(f[0], f[1], f[2]); const r = o.root || p; this.root.push(r[0], r[1], r[2]); this.layer.push(o.layer || 0); this.rough.push(o.rough ?? 1); return this.count - 1; }
  group(mat, idx) { if (idx.length) this.groups.push({ mat, idx }); }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const tangentize = (v, n) => nrm(sub(v, scl(n, dot(v, n))));
function vertexNormals(P, idx, N) { const out = new Float32Array(N * 3); for (let i = 0; i < idx.length; i += 3) { const a = idx[i], b = idx[i + 1], c = idx[i + 2]; const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]]; const f = crs(e1, e2); for (const v of [a, b, c]) { out[v * 3] += f[0]; out[v * 3 + 1] += f[1]; out[v * 3 + 2] += f[2]; } }
  for (let i = 0; i < N; i++) { const l = Math.hypot(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]) || 1; out[i * 3] /= l; out[i * 3 + 1] /= l; out[i * 3 + 2] /= l; } return out; }

// ------------------------------------------------------------------ hair styles (head-local metres)
// hairline height above eye level as a function of the angle round the skull (0 = front, π = nape)
const HAIRLINE = [[0, 0.073], [0.3, 0.071], [0.52, 0.066], [0.78, 0.06], [1.02, 0.046], [1.22, 0.028], [1.34, -0.006], [1.5, -0.008], [1.6, 0.014], [1.9, 0.022], [2.25, 0.006], [2.6, -0.042], [3.2, -0.072]];
const tab = (T, x) => { x = Math.abs(x); for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const a = T[i - 1], b = T[i]; return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])); } return T[T.length - 1][1]; };
const STYLES = {
  // thickness (m) of the hair mass above the scalp, extra offset, comb direction
  crew: { th: (h) => 0.0032 + 0.0026 * sstep(0.03, 0.08, h.y), fur: [0.0013, 0.0026, 0.0039, 0.0052], freq: 1300, whorl: [0.0, 0.1, -0.13] },
  sidepart: { part: 0.031, th: (h) => { const top = sstep(0.035, 0.07, h.y); let t = lerp(0.0055, 0.019, top) + 0.006 * top * sstep(0.4, 0, Math.abs(h.th)) * sstep(-0.06, 0.0, h.z); const pd = h.x - 0.031; if (h.y > 0.045 && h.z > -0.12) t -= 0.006 * Math.exp(-(pd * pd) / (0.0035 * 0.0035)) * top; if (pd > 0) t -= 0.006 * top * sstep(0, 0.03, pd); return t; },
    fur: [0.0016, 0.0032, 0.0048], freq: 1050 },
  quiff: { th: (h) => { const top = sstep(0.04, 0.075, h.y); const front = sstep(-0.1, 0.0, h.z) * sstep(0.75, 0.15, Math.abs(h.th)); return lerp(0.005, 0.017, top) + 0.024 * top * front; },
    lift: (h) => { const top = sstep(0.045, 0.075, h.y); const front = sstep(-0.06, 0.01, h.z) * sstep(0.7, 0.1, Math.abs(h.th)); return [0, 0.006 * top * front, 0.008 * top * front]; },
    fur: [0.0016, 0.0032, 0.0048], freq: 1050 },
};

// ------------------------------------------------------------------ build
// bi: bone indices { head, neck, chest }. Returns { geometry, keys (material per group), eyes: [{pos, r}], glasses: Group|null, fit }.
// Geometry is shareable between instances; materials are per character (headMaterials) since the skin carries that
// character's wetness / sweat / wrinkle uniforms.
export function buildHeroHead(sp, bi) {
  const D = heroData(sp.mh), S = shared(), F = heroHeadFit(sp), L = D.L, N0 = S.N, P = D.pos;
  const skinC = hex(sp.skin), hairC = hex(sp.hairColor || '#100c09').map((v) => v * 1.5 + 0.012); const M = S.masks;
  const skinIdx = S.idx[0]; const NRM = vertexNormals(P, [...S.idx[0], ...S.idx[1], ...S.idx[2], ...S.idx[3], ...S.idx[4]], N0);
  const pv = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], nv = (i) => [NRM[i * 3], NRM[i * 3 + 1], NRM[i * 3 + 2]];
  const zc = (L.front + L.back) / 2, my = L.mouth[1];
  let lipZ = -1; for (let i = 0; i < N0; i++) if (S.part[i] === 0 && Math.abs(P[i * 3]) < 0.004 && Math.abs(P[i * 3 + 1] - my) < 0.012) lipZ = Math.max(lipZ, P[i * 3 + 2]);
  const style = STYLES[sp.hair] || STYLES.crew; const theta = (p) => Math.atan2(p[0], p[2] - zc);
  // ---- region masks on the skin
  const hairline = (p) => tab(HAIRLINE, theta(p)) + (sp.hairline || 0);
  const hairMask = (i) => { if (M.ears[i] > 0.04 || S.part[i] !== 0) return 0; const p = pv(i); if (p[1] < -0.09) return 0; return sstep(-0.003, 0.004, p[1] - hairline(p)); };
  const beardMask = (i) => { if (S.part[i] !== 0 || M.ears[i] > 0.1) return 0; const p = pv(i); const th = Math.abs(theta(p));
    const cheek = lerp(-0.014, -0.05, sstep(1.45, 0.5, th)); // sideburn → cheek line → mouth corner
    let m = sstep(0.004, -0.004, p[1] - cheek); // below the cheek line
    const neckLine = lerp(L.chin[1] - 0.028, -0.06, sstep(0.4, 1.6, th)); m *= sstep(neckLine - 0.008, neckLine + 0.004, p[1]); // above the neck line
    m *= sstep(1.62, 1.48, th) * (1 - clamp(M.lips[i] * 2.2, 0, 1)); // stop at the sideburn, keep the lips clear
    if (p[2] < lipZ - 0.012 && Math.abs(p[0]) < 0.03 && Math.abs(p[1] - my) < 0.022) m = 0; // inside the mouth
    return clamp(m, 0, 1); };
  const moustacheMask = (i) => { if (S.part[i] !== 0) return 0; const p = pv(i); if (p[2] < lipZ - 0.01) return 0; const top = L.noseTip[1] - 0.012;
    return sstep(0.031, 0.024, Math.abs(p[0])) * sstep(my + 0.003, my + 0.007, p[1]) * sstep(top + 0.002, top - 0.002, p[1]) * (1 - clamp(M.lips[i] * 2.5, 0, 1)) * (1 - clamp(M.nose[i] * 1.5, 0, 1)); };
  // eyebrow band: medial head → arch → tail, per side (head-local)
  const ex = Math.abs(L.eyeL[0]); const browY = sp.mh === 'shashika' ? -0.0015 : 0;
  const browPath = (t) => { const x = ex - 0.0185 + t * 0.047; const y = tab([[0, 0.0128], [0.35, 0.0172], [0.62, 0.0192], [1, 0.0152]], t) + browY; const th = tab([[0, 0.0095], [0.3, 0.0085], [0.62, 0.0068], [1, 0.0032]], t) * (sp.mh === 'shashika' ? 1.12 : 1); return { x, y, th }; };
  const browMask = (p) => { const ax = Math.abs(p[0]); const t = (ax - (ex - 0.0185)) / 0.047; if (t < -0.08 || t > 1.08 || p[2] < -0.04) return 0; const b = browPath(clamp(t, 0, 1)); const d = Math.abs(p[1] - b.y - b.th * 0.05) / (b.th * 0.55); return sstep(1.15, 0.6, d) * sstep(-0.08, 0.04, t) * sstep(1.08, 0.95, t); };
  const stubble = sp.beard ? 0 : sp.mh === 'david' ? 0.42 : 0.3; // shaved shadow (Dineth, David); Shashika's beard is real hair
  // ---- skin vertices (all baked parts)
  const A = new Acc();
  const vOfY = (() => { const pts = [[-0.3, 0], [L.chin[1], 0.2], [my, 0.335], [L.noseTip[1] + 0.004, 0.435], [0, 0.51], [0.019, 0.58], [0.06, 0.685], [L.crown, 1]]; return (y) => { if (y <= pts[0][0]) return 0; for (let i = 1; i < pts.length; i++) if (y <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; return lerp(a[1], b[1], (y - a[0]) / (b[0] - a[0])); } return 1; }; })();
  const lashPts = { L: [], R: [] };
  for (let i = 0; i < N0; i++) {
    const p = pv(i), n = nv(i), part = S.part[i]; let col = skinC, rough = 1, uvA = [0.75 - 0.111 * theta(p), vOfY(p[1])];
    if (part === 0) {
      const lo = (hash(Math.floor(p[0] * 90), Math.floor(p[1] * 90), Math.floor(p[2] * 90)) - 0.5) * 0.05; col = col.map((v) => v * (1 + lo)); // faint blotchy variation
      // periorbital: darker, slightly cool skin round the eyes (common in South-Asian skin), darker lid margins
      for (const e of [L.eyeL, L.eyeR]) { const d = Math.hypot(p[0] - e[0], (p[1] - e[1]) * 1.25) / L.eyeR_; if (p[2] > e[2] - 0.006 && d < 2.1) { const w = sstep(2.1, 1.1, d); col = mul3(col, [1 - 0.12 * w, 1 - 0.14 * w, 1 - 0.11 * w]); } }
      if (M.lids[i] > 0.05) col = mul3(col, [1 - 0.08 * M.lids[i], 1 - 0.1 * M.lids[i], 1 - 0.08 * M.lids[i]]);
      // nose tip / cheeks / ears: a touch of blood colour
      const nt = Math.hypot(p[0] - L.noseTip[0], p[1] - L.noseTip[1], p[2] - L.noseTip[2]); if (nt < 0.016) col = mul3(col, [1 + 0.05 * (1 - nt / 0.016), 1 - 0.02 * (1 - nt / 0.016), 1 - 0.03 * (1 - nt / 0.016)]);
      const ch = Math.exp(-(((Math.abs(p[0]) - 0.042) / 0.014) ** 2) - (((p[1] + 0.03) / 0.016) ** 2)) * (p[2] > -0.03 ? 1 : 0); col = mul3(col, [1 + 0.04 * ch, 1 - 0.015 * ch, 1 - 0.02 * ch]);
      if (M.ears[i] > 0) col = mul3(col, [1 - 0.02 * M.ears[i], 1 - 0.07 * M.ears[i], 1 - 0.07 * M.ears[i]]);
      // lips: deeper mauve-brown, upper lip darker than the lower, sharp-ish vermilion border
      const lm = sstep(0.42, 0.74, M.lips[i]); if (lm > 0) { const upper = p[1] > my; col = mix3(col, mul3(skinC, upper ? [0.74, 0.57, 0.53] : [0.84, 0.64, 0.6]), lm); rough = lerp(rough, 0.62, lm); }
      // inside the mouth
      if ((M.lips[i] > 0.25 || n[2] < -0.1) && p[2] < lipZ - 0.007 && p[2] > lipZ - 0.045 && Math.abs(p[0]) < 0.028 && Math.abs(p[1] - my) < 0.02) { /* inner lip / back-facing only: the cheeks at the corners also curve behind the lip plane */ const dd = sstep(lipZ - 0.007, lipZ - 0.02, p[2]); col = mix3(col, [0.16, 0.045, 0.045], dd); rough = 0.4; }
      // shaved beard shadow, eyebrow skin, scalp under the hair
      const bm = beardMask(i); if (stubble > 0 && bm > 0) col = mix3(col, mul3(hairC, [1.6, 1.5, 1.5]).map((v, k) => v * 0.5 + col[k] * 0.5), bm * stubble);
      const mm = sp.moustache ? moustacheMask(i) : 0; if (mm > 0) col = mix3(col, hairC, mm * 0.6);
      if (sp.beard && bm > 0) col = mix3(col, hairC, bm * 0.35);
      const bw = browMask(p); if (bw > 0) col = mix3(col, hairC, bw * 0.38);
      const hm = sp.hair && sp.hair !== 'bald' ? hairMask(i) : 0; if (hm > 0) col = mix3(col, hairC, hm * 0.72);
      // T-zone shine: forehead and nose slightly glossier (sebum); cheeks / chin matte
      if (M.nose[i] > 0.1 || (p[1] > 0.02 && p[1] < 0.065 && Math.abs(p[0]) < 0.035 && p[2] > -0.03)) rough *= 0.9;
    } else if (part === 1 || part === 2) { const back = sstep(0.0, -0.025, p[2] - (lipZ - 0.006)); col = mix3([0.86, 0.82, 0.74], [0.5, 0.45, 0.4], back); rough = 0.35; }
    else if (part === 3) { col = [0.55, 0.24, 0.24]; rough = 0.5; }
    else if (part === 4) { col = mul3(hairC, [1.1, 1.1, 1.1]); const side = p[0] > 0 ? 'L' : 'R'; lashPts[side].push(i); }
    A.add(p, n, uvA, col, i, { uv2: [S.uv[i * 2], S.uv[i * 2 + 1]], rough });
  }
  // eyelash UVs: u along the lid (angle round the eye), v root → tip (distance from the eye centre)
  for (const side of ['L', 'R']) { const e = side === 'L' ? L.eyeL : L.eyeR; const ids = lashPts[side]; let d0 = 1e9, d1 = -1e9; const d = ids.map((i) => { const p = pv(i); const r = Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]); d0 = Math.min(d0, r); d1 = Math.max(d1, r); return r; });
    ids.forEach((i, k) => { const p = pv(i); const a = Math.atan2(p[1] - e[1], (p[0] - e[0]) * (side === 'L' ? 1 : -1)); A.uv[i * 2] = a * 2.2; A.uv[i * 2 + 1] = clamp((d[k] - d0) / (d1 - d0 + 1e-6), 0, 1) * 0.92 + 0.04; }); }
  // neck skirt: boundary edges of the skin extruded straight down to the level cut (hidden inside the collar)
  { const bset = new Set(DATA.boundary); const ec = new Map(); const ek = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
    for (let t = 0; t < skinIdx.length; t += 3) for (let j = 0; j < 3; j++) { const a = skinIdx[t + j], b = skinIdx[t + (j + 1) % 3]; const e = ek(a, b); const r = ec.get(e); if (r) r.n++; else ec.set(e, { n: 1, a, b }); }
    const yC = (F.cutY - F.o[1]) / F.k; const drop = new Map(); const sk = [];
    const dv = (i) => { if (!drop.has(i)) { const p = pv(i), n = nv(i); const hn = nrm([n[0], 0, n[2]]); drop.set(i, A.add([p[0], yC, p[2]], hn, A.uv.slice(i * 2, i * 2 + 2), A.c.slice(i * 3, i * 3 + 3), i, { uv2: [S.uv[i * 2], S.uv[i * 2 + 1]] })); } return drop.get(i); };
    for (const { n, a, b } of ec.values()) { if (n !== 1 || !bset.has(a) || !bset.has(b)) continue; const a2 = dv(a), b2 = dv(b); sk.push(b, a, a2, b, a2, b2); }
    S.skirt = sk; }
  const skinTris = Array.from(skinIdx), mouthTris = [...S.idx[1], ...S.idx[2], ...S.idx[3]], lashTris = Array.from(S.idx[4]);

  // ---- surface ray-cast (front-facing skin), for growing brow strands on the skin
  const tri = []; for (let t = 0; t < skinTris.length; t += 3) { const a = skinTris[t], b = skinTris[t + 1], c = skinTris[t + 2]; if (P[a * 3 + 2] < -0.05) continue; tri.push([a, b, c]); }
  const GC = 0.004, grid = new Map(); const gk = (i, j) => i * 4096 + j;
  for (const t of tri) { const ps = t.map(pv); const x0 = Math.floor(Math.min(ps[0][0], ps[1][0], ps[2][0]) / GC), x1 = Math.floor(Math.max(ps[0][0], ps[1][0], ps[2][0]) / GC), y0 = Math.floor(Math.min(ps[0][1], ps[1][1], ps[2][1]) / GC), y1 = Math.floor(Math.max(ps[0][1], ps[1][1], ps[2][1]) / GC);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) { const key = gk(i, j); let l = grid.get(key); if (!l) grid.set(key, (l = [])); l.push(t); } }
  const surf = (x, y) => { let best = null; for (const [a, b, c] of grid.get(gk(Math.floor(x / GC), Math.floor(y / GC))) || []) { const A0 = pv(a), B0 = pv(b), C0 = pv(c); if (Math.max(A0[1], B0[1], C0[1]) < y || Math.min(A0[1], B0[1], C0[1]) > y || Math.max(A0[0], B0[0], C0[0]) < x || Math.min(A0[0], B0[0], C0[0]) > x) continue;
      const v0 = [C0[0] - A0[0], C0[1] - A0[1]], v1 = [B0[0] - A0[0], B0[1] - A0[1]], v2 = [x - A0[0], y - A0[1]]; const d00 = v0[0] * v0[0] + v0[1] * v0[1], d01 = v0[0] * v1[0] + v0[1] * v1[1], d11 = v1[0] * v1[0] + v1[1] * v1[1], d20 = v2[0] * v0[0] + v2[1] * v0[1], d21 = v2[0] * v1[0] + v2[1] * v1[1]; const den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-14) continue;
      const u = (d11 * d20 - d01 * d21) / den, v = (d00 * d21 - d01 * d20) / den; if (u < -1e-4 || v < -1e-4 || u + v > 1.0001) continue; const z = A0[2] + u * (C0[2] - A0[2]) + v * (B0[2] - A0[2]);
      if (!best || z > best.p[2]) { const w = [1 - u - v, v, u]; const n = nrm(addv(addv(scl(nv(a), w[0]), scl(nv(b), w[1])), scl(nv(c), w[2]))); best = { p: [x, y, z], n, a: w[0] >= w[1] && w[0] >= w[2] ? a : w[1] >= w[2] ? b : c }; } }
    return best; };

  // ---- eyebrows: individual strands (thin ribbons lying on the skin)
  const browTris = [];
  const browC = mul3(hairC, [1.05, 1.0, 0.98]);
  for (const sx of [1, -1]) {
    const NS = 330; for (let j = 0; j < NS; j++) {
      const t = Math.pow(hash(j, 1, sx), 0.92), b = (hash(j, 2, sx) - 0.5); const bp = browPath(t); const x = sx * bp.x, y = bp.y + b * bp.th * (1 - 0.15 * t);
      const s0 = surf(x, y); if (!s0) continue;
      // growth: medial hairs point up (slightly lateral), the rest run laterally along the arch; upper / lower rows converge
      const tan = nrm([sx * 1, (browPath(Math.min(1, t + 0.05)).y - browPath(Math.max(0, t - 0.05)).y) / 0.0047, 0]);
      const dir2 = nrm(addv(scl([sx * 0.25, 1, 0], 1 - sstep(0.05, 0.3, t)), scl(addv(tan, [0, -b * 0.7, 0]), sstep(0.05, 0.3, t))));
      const len = (t < 0.15 ? 0.0052 : 0.0075) * (0.8 + 0.4 * hash(j, 3, sx));
      const pts = [s0]; for (let k = 1; k <= 2; k++) { const q = surf(x + dir2[0] * len * k / 2, y + dir2[1] * len * k / 2); pts.push(q && Math.hypot(...sub(q.p, pts[k - 1].p)) < len * 0.9 ? q : pts[k - 1]); } /* grazing ray at the tail can land far away: keep the strand short */
      if (Math.hypot(...sub(pts[2].p, s0.p)) < len * 0.25) continue;
      const lift = [0.00025, 0.0006, 0.0004]; const wid = [0.00034, 0.00022, 0.00008]; const shade = 0.75 + 0.5 * hash(j, 4, sx);
      const base = A.count; for (let k = 0; k < 3; k++) { const q = pts[k]; const fwd = nrm(k < 2 ? sub(pts[k + 1].p, q.p) : sub(q.p, pts[k - 1].p)); const side = nrm(crs(q.n, fwd)); const c = addv(q.p, scl(q.n, lift[k]));
        const col = browC.map((v) => v * shade * (k === 0 ? 0.85 : 1)); for (const sgn of [-1, 1]) A.add(addv(c, scl(side, sgn * wid[k])), q.n, [0, 0], col, s0.a, { flow: fwd, rough: 1 }); }
      for (let k = 0; k < 2; k++) { const a0 = base + k * 2; browTris.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2); }
    }
  }

  // ---- shell fur (beard / moustache / scalp hair) over a set of skin faces
  const shell = (maskOf, layers, color, flowOf, o = {}) => {
    const mk = new Float32Array(N0); for (let i = 0; i < N0; i++) mk[i] = maskOf(i);
    const faces = []; for (let t = 0; t < skinTris.length; t += 3) { const a = skinTris[t], b = skinTris[t + 1], c = skinTris[t + 2]; if (Math.max(mk[a], mk[b], mk[c]) > (o.minMask ?? 0.02)) faces.push(a, b, c); }
    const used = [...new Set(faces)]; const out = []; const thick = o.thick || (() => 0);
    const base = (i) => { const p = pv(i), n = nv(i); const t = thick(i, mk[i]); const lf = o.lift ? o.lift(i, mk[i]) : [0, 0, 0]; return { p: addv(addv(p, scl(n, t)), lf), n }; };
    for (const [li, off] of layers.entries()) { const map = new Map(); const L0 = li / Math.max(1, layers.length - 1);
      for (const i of used) { const b = base(i); const fl = flowOf(i, b.n); const lean = o.lean || 0; const p = addv(addv(b.p, scl(b.n, off * mk[i])), scl(fl, lean * off * mk[i]));
        const col = (typeof color === 'function' ? color(i, mk[i], li) : color); map.set(i, A.add(p, b.n, [0, 0], col, i, { flow: fl, root: b.p, layer: o.layerOf ? o.layerOf(li) : L0 })); }
      const ix = []; for (let t = 0; t < faces.length; t += 3) ix.push(map.get(faces[t]), map.get(faces[t + 1]), map.get(faces[t + 2]));
      // normals of the displaced shell itself (the skin normals would shade the hair mass as if it were the scalp)
      const acc = new Map(); for (let t = 0; t < ix.length; t += 3) { const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]]; const pa = A.p.slice(a * 3, a * 3 + 3), pb = A.p.slice(b * 3, b * 3 + 3), pc = A.p.slice(c * 3, c * 3 + 3); const fn = crs(sub(pb, pa), sub(pc, pa)); for (const v of [a, b, c]) { const q = acc.get(v) || [0, 0, 0]; acc.set(v, addv(q, fn)); } }
      for (const [v, q] of acc) { const a0 = A.anchor[v]; const w = sstep(0.05, 0.6, mk[a0]); const sn = nv(a0); const n = nrm(addv(scl(nrm(q), w), scl(sn, 1 - w))); A.n[v * 3] = n[0]; A.n[v * 3 + 1] = n[1]; A.n[v * 3 + 2] = n[2]; } // edge of the shell keeps the skin normal so it shades like the skin it fades into
      out.push(ix); }
    return out; };
  const groups = []; // [material key, indices]
  groups.push(['skin', [...skinTris, ...S.skirt]], ['mouth', mouthTris], ['lash', lashTris], ['brow', browTris]);
  // facial hair
  if (sp.beard) {
    const flowB = (i, n) => tangentize(addv([0, -1, 0], [0, 0, pv(i)[1] < L.chin[1] + 0.02 ? 0.6 : 0.2]), n);
    const colB = (i, m, li) => (li === 0 ? mix3(A.c.slice(i * 3, i * 3 + 3), hairC, (0.3 + 0.4 * m) * sstep(0.05, 0.7, m)) : mul3(hairC, [1 + li * 0.1 + hash(i, li) * 0.3, 1 + li * 0.08 + hash(i, li) * 0.25, 1 + li * 0.08 + hash(i, li) * 0.22]));
    const mk = (i) => Math.max(beardMask(i), moustacheMask(i) * 0.95);
    const L5 = shell(mk, [0.0004, 0.0012, 0.0021, 0.003, 0.0039], colB, flowB, { lean: 0.5, layerOf: (li) => (li === 0 ? 0.0 : 0.25 + li * 0.17) });
    groups.push(['beardBase', L5[0]], ['fur', [].concat(...L5.slice(1))]);
  } else if (sp.moustache) {
    const flowM = (i, n) => tangentize([pv(i)[0] > 0 ? 0.35 : -0.35, -1, 0.15], n);
    const L4 = shell(moustacheMask, [0.0004, 0.0013, 0.0023, 0.0033], (i, m, li) => mix3(skinC, hairC, clamp(0.5 + m * 0.5, 0, 1)), flowM, { lean: 0.7, minMask: 0.05, layerOf: (li) => (li === 0 ? 0 : 0.25 + li * 0.2) });
    groups.push(['beardBase', L4[0]], ['fur', [].concat(...L4.slice(1))]);
  }
  // scalp hair: a volume fitted to the real scalp + fur layers on top for a broken-up, strand-level surface
  if (sp.hair && sp.hair !== 'bald') {
    const hInfo = (i) => { const p = pv(i); return { x: p[0], y: p[1], z: p[2], th: theta(p) }; };
    const whorl = style.whorl || [0, L.crown - 0.012, zc - 0.05];
    const flowH = (i, n) => { const p = pv(i); let f;
      if (sp.hair === 'sidepart') { const pd = p[0] - style.part; f = p[1] > 0.045 && p[2] > -0.13 ? (pd < 0 ? [-1, -0.25, 0.25] : [1, -0.6, 0]) : [0, -1, -0.35]; }
      else if (sp.hair === 'quiff') { const top = sstep(0.045, 0.075, p[1]); f = addv(scl([0, 0.15, -1], top), scl([0, -1, -0.3], 1 - top)); }
      else f = sub(p, whorl);
      return tangentize(f, n); };
    const hm = (i) => hairMask(i);
    const thick = (i, m) => Math.max(0.0005, style.th(hInfo(i)) * sstep(0.0, 0.85, m) * sstep(-0.002, 0.012, pv(i)[1] - hairline(pv(i))));
    const lift = style.lift ? (i, m) => scl(style.lift(hInfo(i)), m) : null;
    const colH = (i, m, li) => { const v = 0.85 + 0.3 * hash(i, 5); return hairC.map((c) => Math.min(1, c * v * (1 + li * 0.08) + 0.004)); };
    const colV = (i, m, li) => mix3(A.c.slice(i * 3, i * 3 + 3), colH(i, m, li), sstep(0.05, 0.6, m)); // soft hairline: the shell edge fades into the scalp colour
    const vol = shell(hm, [0], colV, flowH, { thick, lift, minMask: 0.05 });
    const fur = shell(hm, style.fur, colH, flowH, { thick, lift, lean: 0.8, minMask: 0.3, layerOf: (li) => 0.15 + (li / Math.max(1, style.fur.length - 1)) * 0.75 });
    groups.push(['hair', vol[0]], ['hairFur', [].concat(...fur)]);
  }

  // ---- geometry (model space), skin weights + morphs inherited from each vertex's anchor skin vertex
  const NV = A.count; const k = F.k, o = F.o; const g = new THREE.BufferGeometry();
  const pos = new Float32Array(NV * 3); for (let i = 0; i < NV; i++) for (let c = 0; c < 3; c++) pos[i * 3 + c] = o[c] + k * A.p[i * 3 + c];
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2)); g.setAttribute('aUv2', new THREE.Float32BufferAttribute(A.uv2, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(A.c, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(A.flow, 3)); g.setAttribute('aRoot', new THREE.Float32BufferAttribute(A.root, 3)); g.setAttribute('aLayer', new THREE.Float32BufferAttribute(A.layer, 1)); g.setAttribute('aRough', new THREE.Float32BufferAttribute(A.rough, 1));
  const si = new Uint16Array(NV * 4), sw = new Float32Array(NV * 4);
  for (let i = 0; i < NV; i++) { const a = A.anchor[i]; const w = [S.w[a * 3] / 255, S.w[a * 3 + 1] / 255, S.w[a * 3 + 2] / 255]; si.set([bi.head, bi.neck, bi.chest, bi.head], i * 4); sw.set([w[0], w[1], w[2], 0], i * 4); }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const morphs = D.morphs.map((m) => { const d = new Float32Array(N0 * 3); for (let j = 0; j < m.i.length; j++) { const v = m.i[j]; d[v * 3] = m.d[j * 3] * k; d[v * 3 + 1] = m.d[j * 3 + 1] * k; d[v * 3 + 2] = m.d[j * 3 + 2] * k; }
    const full = new Float32Array(NV * 3); for (let i = 0; i < NV; i++) { const a = A.anchor[i]; full[i * 3] = d[a * 3]; full[i * 3 + 1] = d[a * 3 + 1]; full[i * 3 + 2] = d[a * 3 + 2]; } return new THREE.BufferAttribute(full, 3); });
  g.morphAttributes.position = morphs; g.morphTargetsRelative = true;
  // groups / materials
  const keys = []; const idx = [];
  for (const [key, ix] of groups) { if (!ix.length) continue; g.addGroup(idx.length, ix.length, keys.length); keys.push(key); for (const v of ix) idx.push(v); }
  g.setIndex(idx); g.computeBoundingSphere();
  // pore tiling: ~2.5 cm per tile from the MakeHuman UV scale
  let wa = 0, ua = 0; for (let t = 0; t < skinTris.length; t += 3) { const [a, b, c] = [skinTris[t], skinTris[t + 1], skinTris[t + 2]]; wa += Math.hypot(...crs(sub(pv(b), pv(a)), sub(pv(c), pv(a)))) / 2; const u0 = [S.uv[a * 2], S.uv[a * 2 + 1]], u1 = [S.uv[b * 2], S.uv[b * 2 + 1]], u2 = [S.uv[c * 2], S.uv[c * 2 + 1]]; ua += Math.abs((u1[0] - u0[0]) * (u2[1] - u0[1]) - (u2[0] - u0[0]) * (u1[1] - u0[1])) / 2; }
  const poreRepeat = Math.sqrt(wa / Math.max(ua, 1e-9)) * k / 0.025;
  const eyes = [F.eyeL, F.eyeR].map((p) => ({ pos: p, r: F.eyeRad }));
  return { geometry: g, keys, eyes, fit: F, glasses: sp.glasses ? buildGlasses(sp, D, F, pv, nv, S) : null, poreRepeat };
}

// ------------------------------------------------------------------ materials per hero
export function headMaterials(sp, H, U) { const m = materials(sp, U, STYLES[sp.hair] || STYLES.crew); m.skin.userData.poreU.value = H.poreRepeat; return H.keys.map((k) => m[k]); }
function materials(sp, U, style) {
  const T = textures(); const fn = faceNormals();
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.64, metalness: 0 }); 
  if (fn.base) { skin.normalMap = fn.base; skin.normalScale = new THREE.Vector2(0.3, -0.3); }
  const poreU = { value: 30 }; skin.userData.poreU = poreU;
  const pores = (sh) => { // pore normals (MakeHuman UVs, tiling) + per-vertex roughness (T-zone shine, lips)
    sh.uniforms.poreMap = { value: T.pores || null }; sh.uniforms.poreRep = poreU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aUv2; attribute float aRough; varying vec2 vUv2; varying float vRough;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvUv2 = aUv2; vRough = aRough;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D poreMap; uniform float poreRep; varying vec2 vUv2; varying float vRough;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  #ifdef USE_NORMALMAP_TANGENTSPACE
  { vec3 pN = texture2D(poreMap, vUv2 * poreRep).xyz * 2.0 - 1.0; float fade = 1.0 - smoothstep(0.6, 2.5, length(fwidth(vUv2 * poreRep)) * 40.0); normal = normalize(normal + tbn * vec3(pN.xy * 0.22 * fade, 0.0)); }
  #endif`); };
  if (T.pores) patchHeroMaterial(skin, 'face', U, pores); else patchHeroMaterial(skin, 'face', U);
  skin.customProgramCacheKey = () => 'hero-headskin';
  const mouth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0 });
  const lash = new THREE.MeshStandardMaterial({ color: new THREE.Color(sp.hairColor || '#100c09').multiplyScalar(0.8), roughness: 0.6, side: THREE.DoubleSide, alphaMap: T.lash || null, alphaTest: T.lash ? 0.45 : 0, transparent: false });
  const brow = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const beardBase = hairMaterial('volume', { freq: 1500 });
  const fur = hairMaterial('fur', { freq: 1500 });
  const hair = hairMaterial('volume', { freq: style.freq || 1100 });
  const hairFur = hairMaterial('fur', { freq: style.freq || 1100 });
  for (const m of [lash, brow, beardBase, fur, hair, hairFur]) iblScale(m, 0.28, 0.9, 0.6); // dark hair: the sky reflection must not out-shine its colour
  iblScale(skin, 0.6, 1.0, 0.35); iblScale(mouth, 0.5, 1.0, 0.3);
  return { skin, mouth, lash, brow, beardBase, fur, hair, hairFur };
}

// ------------------------------------------------------------------ eyes
export function buildEyeball(r) {
  const T = textures(); const g = new THREE.SphereGeometry(r, 32, 24); g.rotateX(Math.PI / 2); // poles on ±z: the front pole looks forward
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const c = z / r; // cornea bulge in front of the iris
    const bulge = c > 0.86 ? 0.085 * r * Math.pow((c - 0.86) / 0.14, 0.7) : 0; const s = (r + bulge) / r; p.setXYZ(i, x * s, y * s, z * s);
    uv.setXY(i, 0.5 + (x / r) * 0.5, 0.5 + (y / r) * 0.5); }
  // back hemisphere: plain sclera colour (the planar projection would mirror the iris onto the back)
  for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) uv.setXY(i, 0.02, 0.5);
  g.computeVertexNormals();
  const m = new THREE.MeshPhysicalMaterial({ map: T.eye || null, color: T.eye ? 0xffffff : 0xe8e0d6, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.03, metalness: 0 });
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = false; mesh.receiveShadow = true; return mesh;
}

// ------------------------------------------------------------------ glasses (David): fitted to his eyes, nose bridge and ears
function buildGlasses(sp, D, F, pv, nv, S) {
  const L = D.L; const k = F.k; const grp = new THREE.Group();
  const frameM = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.35, metalness: 0.2 });
  const lensM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.12, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false });
  const ez = L.eyeL[2] + L.eyeR_ * 0.93 + 0.0105; // lens plane ~10 mm in front of the cornea
  const hw = 0.0245, hh = 0.0175; const rr = 0.006; // lens half extents, corner radius
  const rim = (cx) => { const pts = []; const NS = 40; for (let i = 0; i < NS; i++) { const a = (i / NS) * Math.PI * 2; const ca = Math.cos(a), sa = Math.sin(a); // rounded rectangle via superellipse
      const x = cx + hw * Math.sign(ca) * Math.pow(Math.abs(ca), 0.42), y = 0.0015 + hh * Math.sign(sa) * Math.pow(Math.abs(sa), 0.5) * (sa < 0 ? 0.95 : 1); const z = ez - 0.003 * (Math.abs(x) / 0.055) ** 2; /* slight wrap round the face */ pts.push(new THREE.Vector3(x, y, z)); }
    return new THREE.CatmullRomCurve3(pts, true); };
  for (const sx of [1, -1]) { const cx = sx * (Math.abs(L.eyeL[0]) + 0.0005); const c = rim(cx);
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(c, 80, 0.0011, 6, true), frameM));
    const lp = c.getPoints(40); const sh = new THREE.Shape(lp.map((v) => new THREE.Vector2(v.x, v.y))); const lg = new THREE.ShapeGeometry(sh, 2); const pa = lg.attributes.position; for (let i = 0; i < pa.count; i++) pa.setZ(i, ez - 0.0003 - 0.003 * (Math.abs(pa.getX(i)) / 0.055) ** 2); lg.computeVertexNormals(); grp.add(new THREE.Mesh(lg, lensM));
    // temple arm: hinge at the outer rim → along the side of the head (kept just outside the skin) → over the ear
    const hinge = new THREE.Vector3(sx * (Math.abs(cx) + hw + 0.0008), 0.0085, ez - 0.004);
    const earTop = [sx * (Math.abs(L.ear[0]) - 0.004), L.ear[1] + 0.03, L.ear[2] + 0.012];
    const path = [hinge]; for (let t = 0.2; t <= 1.001; t += 0.2) { const x0 = lerp(hinge.x, earTop[0], t), y0 = lerp(hinge.y, earTop[1], t), z0 = lerp(hinge.z, earTop[2], t);
      let mx = 0; for (let i = 0; i < S.N; i++) { if (S.part[i] !== 0) continue; const p = pv(i); if (Math.sign(p[0]) !== sx || Math.abs(p[1] - y0) > 0.006 || Math.abs(p[2] - z0) > 0.006) continue; mx = Math.max(mx, Math.abs(p[0])); }
      path.push(new THREE.Vector3(sx * Math.max(Math.abs(x0), mx + 0.0022), y0, z0)); }
    path.push(new THREE.Vector3(earTop[0] * 0.97, earTop[1] - 0.012, earTop[2] - 0.016), new THREE.Vector3(earTop[0] * 0.93, earTop[1] - 0.03, earTop[2] - 0.012)); // curl behind the ear
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 30, 0.0012, 6, false), frameM));
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.006, 0.006).translate(hinge.x - sx * 0.001, hinge.y, hinge.z + 0.001), frameM)); }
  // bridge over the nose (rests on the nasal bridge)
  let nz = -1; for (let i = 0; i < S.N; i++) if (S.part[i] === 0 && Math.abs(pv(i)[0]) < 0.003 && Math.abs(pv(i)[1] - 0.002) < 0.004) nz = Math.max(nz, pv(i)[2]);
  const bz = Math.max(ez - 0.004, nz + 0.002);
  grp.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.0095, 0.008, ez - 0.0005), new THREE.Vector3(0, 0.0105, bz), new THREE.Vector3(0.0095, 0.008, ez - 0.0005)]), 12, 0.001, 6, false), frameM));
  for (const sx of [1, -1]) grp.add(new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6).scale(0.5, 1, 0.8).translate(sx * 0.0075, -0.004, nz - 0.004), lensM)); // nose pads
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = o.material === frameM; } });
  grp.scale.setScalar(k); return grp; // positioned by the caller (head-local origin → model space)
}

// ------------------------------------------------------------------ expressions → morph influences
const MI = Object.fromEntries(DATA.morphs.map((n, i) => [n, i]));
export const EXPR_MORPHS = {
  neutral: {}, blink: {},
  smile: { smile: 0.85, squint: 0.25, browUp: 0.08, jaw: 0.05 },
  talk: {},
  surprise: { browUp: 1, wide: 0.75, jaw: 0.32 },
  fear: { browInner: 0.9, browUp: 0.45, wide: 0.6, stretch: 0.45, jaw: 0.12 },
  concern: { browInner: 0.75, frown: 0.3, press: 0.2 },
  angry: { browDown: 0.95, squint: 0.4, sneer: 0.35, press: 0.45, frown: 0.2 },
  pain: { browDown: 0.5, browInner: 0.6, squint: 0.7, stretch: 0.5, sneer: 0.3 },
  lookL: {}, lookR: {},
};
export function morphIndex(name) { return MI[name]; }
