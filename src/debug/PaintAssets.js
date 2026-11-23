// Environment editor assets (console `paint`; also the game runtime when a compiled scene exists): an imported model file →
// render parts, and a material slot's settings → a three.js PBR material.
//   • the model is read with the model tools' loader (ModelPack.loadAsset: glTF / GLB with external .bin + textures matched by
//     file name, OBJ + MTL, FBX), every mesh baked into the asset's space and merged per material slot (multi-material assets
//     keep one part per slot); the import settings (scale, Z-up, pivot) are applied once here;
//   • each part gets a simplified level of detail (meshoptimizer) stored in the SAME vertex buffer: index = [lo …, hi …], so
//     the far mesh costs no extra vertices and both are one BatchedMesh geometry (PaintField draws a range of it);
//   • materials: MeshStandardMaterial with every map in its proper colour space — base colour and emissive sRGB, normal / AO /
//     roughness / metallic / height / opacity linear data. A map can be the model's own texture or an imported image; the
//     image is decoded once and shared (clones share the GPU texture; only tiling differs per material).
//   • nothing here throws at the caller for a bad file: a model that cannot be read becomes a visible placeholder (error kept).
import * as THREE from 'three';
import { loadAsset, forgetAsset } from './ModelPack.js';
import { COLOR_SLOTS, MAP_SLOTS, cleanMaterial, extOf } from './PaintFormat.js';
import { windUniform } from '../world/Wind.js';

export const PACK_BASE = 'paint-pack/assets/';
export const fileURL = (name) => PACK_BASE + name;
const modelRef = (a) => ({ main: a.file.main, files: a.file.files || {}, base: PACK_BASE });

// ---------------------------------------------------------------- level of detail (meshoptimizer, loaded once on demand)
let SIMP = null;
async function simplifier() { if (SIMP) return SIMP; SIMP = import('meshoptimizer').then(async (m) => { await m.MeshoptSimplifier.ready; return m.MeshoptSimplifier; }).catch((e) => { console.warn('[paint] LOD simplifier unavailable', e); return null; }); return SIMP; }

// ---------------------------------------------------------------- model → parts
const MODELS = new Map(); // key → Promise<model>
const modelKey = (a) => a.file.main + '|' + JSON.stringify(a.import || {}) + '|' + (a.render ? a.render.lodRatio : '');
function readAttr(attr, i, out, n) { for (let k = 0; k < n; k++) out[k] = k === 0 ? attr.getX(i) : k === 1 ? attr.getY(i) : k === 2 ? attr.getZ(i) : attr.getW(i); return out; }
// asset def → { parts: [{ slot, name, geo, lo: [start, count], hi: [start, count], tris }], slots: [{ name, src }], box, radius, height, tris, error? }
export function loadModel(a) {
  const k = modelKey(a); if (MODELS.has(k)) return MODELS.get(k);
  const p = buildModel(a).catch((e) => { console.warn('[paint] model not loaded:', a.name, e); return placeholderModel(a, (e && e.message) || String(e)); });
  MODELS.set(k, p); return p;
}
export function forgetModel(a) { for (const k of [...MODELS.keys()]) if (k.startsWith(a.file.main + '|')) MODELS.delete(k); try { forgetAsset(modelRef(a)); } catch { /* not loaded */ } }
async function buildModel(a) {
  if (!a.file || !a.file.main) throw new Error('no model file');
  const { raw } = await loadAsset(modelRef(a)); const root = raw.scene; if (!root) throw new Error('the file has no scene');
  root.updateMatrixWorld(true); const slots = []; const slotOf = new Map(); const pieces = []; const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3(); const tmp = [0, 0, 0, 0];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || o.isInstancedMesh && !o.count) return;
    const g = o.geometry, mats = Array.isArray(o.material) ? o.material : [o.material]; const groups = Array.isArray(o.material) && g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : g.attributes.position.count, materialIndex: 0 }];
    for (const gr of groups) { const m = mats[gr.materialIndex] || mats[0]; const key = m ? m.uuid : 'none'; if (!slotOf.has(key)) { slotOf.set(key, slots.length); slots.push({ name: (m && m.name) || 'material ' + (slots.length + 1), src: m || null }); }
      pieces.push({ o, g, slot: slotOf.get(key), start: gr.start, count: gr.count }); }
  });
  if (!pieces.length) throw new Error('the model has no meshes');
  // merge per slot (positions / normals into asset space; uv; colours only if every piece has them)
  const bySlot = slots.map(() => []); for (const p of pieces) bySlot[p.slot].push(p);
  const parts = []; const box = new THREE.Box3(); let tris = 0;
  for (let s = 0; s < slots.length; s++) {
    const L = bySlot[s]; if (!L.length) continue; const withColor = L.every((p) => p.g.attributes.color);
    let nv = 0, ni = 0; for (const p of L) { nv += p.g.attributes.position.count; ni += p.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = withColor ? new Float32Array(nv * 4) : null; const I = new Uint32Array(ni); let vo = 0, io = 0;
    for (const p of L) {
      const g = p.g, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ca = g.attributes.color, n = pa.count; const mw = p.o.matrixWorld; _nm.getNormalMatrix(mw);
      for (let i = 0; i < n; i++) { readAttr(pa, i, tmp, 3); _v.set(tmp[0], tmp[1], tmp[2]).applyMatrix4(mw); P[(vo + i) * 3] = _v.x; P[(vo + i) * 3 + 1] = _v.y; P[(vo + i) * 3 + 2] = _v.z;
        if (na) { readAttr(na, i, tmp, 3); _n.set(tmp[0], tmp[1], tmp[2]).applyMatrix3(_nm).normalize(); N[(vo + i) * 3] = _n.x; N[(vo + i) * 3 + 1] = _n.y; N[(vo + i) * 3 + 2] = _n.z; }
        if (ua) { readAttr(ua, i, tmp, 2); U[(vo + i) * 2] = tmp[0]; U[(vo + i) * 2 + 1] = tmp[1]; }
        if (C) { const cs = ca.itemSize; readAttr(ca, i, tmp, cs); C[(vo + i) * 4] = tmp[0]; C[(vo + i) * 4 + 1] = tmp[1]; C[(vo + i) * 4 + 2] = tmp[2]; C[(vo + i) * 4 + 3] = cs > 3 ? tmp[3] : 1; } }
      const det = mw.determinant() < 0; // mirrored node: keep the triangles front-facing
      if (g.index) { const ix = g.index; for (let t = 0; t < p.count; t += 3) { const a0 = ix.getX(p.start + t) + vo, b0 = ix.getX(p.start + t + 1) + vo, c0 = ix.getX(p.start + t + 2) + vo; I[io++] = a0; I[io++] = det ? c0 : b0; I[io++] = det ? b0 : c0; } }
      else for (let t = 0; t < p.count; t += 3) { const a0 = p.start + t + vo; I[io++] = a0; I[io++] = det ? a0 + 2 : a0 + 1; I[io++] = det ? a0 + 1 : a0 + 2; }
      vo += n;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2)); if (C) geo.setAttribute('color', new THREE.BufferAttribute(C, 4));
    geo.setIndex(new THREE.BufferAttribute(I.subarray(0, io), 1)); if (!pieces.some((q) => q.slot === s && q.g.attributes.normal)) geo.computeVertexNormals();
    parts.push({ slot: s, name: slots[s].name, geo, withColor: !!C }); tris += io / 3;
  }
  // import settings: Z-up → Y-up, unit scale, pivot (ground = centred, standing on y 0)
  const imp = a.import || {}; const M = new THREE.Matrix4(); if (imp.upZ) M.makeRotationX(-Math.PI / 2); M.premultiply(new THREE.Matrix4().makeScale(imp.scale || 1, imp.scale || 1, imp.scale || 1));
  for (const p of parts) { p.geo.applyMatrix4(M); p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
  const c = box.getCenter(new THREE.Vector3()); const sh = imp.pivot === 'origin' ? null : imp.pivot === 'center' ? c.clone().negate() : new THREE.Vector3(-c.x, -box.min.y, -c.z);
  if (sh) { for (const p of parts) p.geo.translate(sh.x, sh.y, sh.z); box.translate(sh); }
  await addLods(parts, (a.render && a.render.lodRatio) || 0.4);
  for (const p of parts) { p.geo.computeBoundingSphere(); p.tris = p.hi[1] / 3; }
  const size = box.getSize(new THREE.Vector3()); const radius = Math.max(0.05, Math.hypot(Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), Math.max(Math.abs(box.min.y), Math.abs(box.max.y)), Math.max(Math.abs(box.min.z), Math.abs(box.max.z))));
  return { parts, slots: slots.map((s) => ({ name: s.name, src: s.src })), box, size: [size.x, size.y, size.z], radius, height: box.max.y, tris, flipY: ['glb', 'gltf'].includes(extOf(a.file.main)) ? false : true, error: null };
}
// index = [lo …, hi …]: p.lo / p.hi = [start, count] inside it
async function addLods(parts, ratio) {
  const S = await simplifier();
  for (const p of parts) {
    const ix = p.geo.index.array, n = ix.length; let lo = null;
    if (S && n >= 3 * 120 && ratio < 0.98) { try { const target = Math.max(36, Math.floor((n * ratio) / 3) * 3); const [r, err] = S.simplify(Uint32Array.from(ix), p.geo.attributes.position.array, 3, target, 0.02, ['LockBorder']); void err; if (r.length >= 3 && r.length < n * 0.9) lo = r; } catch (e) { console.warn('[paint] LOD failed for', p.name, e); } }
    if (!lo) { p.lo = [0, n]; p.hi = [0, n]; continue; }
    const all = new Uint32Array(lo.length + n); all.set(lo, 0); all.set(ix, lo.length); p.geo.setIndex(new THREE.BufferAttribute(all, 1)); p.lo = [0, lo.length]; p.hi = [lo.length, n];
  }
}
function placeholderModel(a, error) {
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0); const n = geo.index.count; const box = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5)); geo.computeBoundingSphere();
  return { parts: [{ slot: 0, name: 'missing', geo, lo: [0, n], hi: [0, n], tris: n / 3, withColor: false }], slots: [{ name: 'missing', src: null }], box, size: [1, 1, 1], radius: 0.87, height: 1, tris: n / 3, flipY: false, error: error || 'missing', placeholder: true };
}
export const PLACEHOLDER_MAT = new THREE.MeshStandardMaterial({ color: 0xff2d7a, emissive: 0x401028, roughness: 0.6, wireframe: false, name: 'paint:missing' });

// the model's own material values → initial slot settings (what the import shows before any editing)
export function materialFromModel(src, name) {
  const m = cleanMaterial({ name }); if (!src) return m;
  const hx = (c) => (c && c.isColor ? '#' + c.getHexString() : null);
  m.color = hx(src.color) || m.color; if (src.roughness != null) m.roughness = src.roughness; if (src.metalness != null) m.metalness = src.metalness;
  m.emissive = hx(src.emissive) || m.emissive; if (src.emissiveIntensity != null) m.emissiveIntensity = src.emissiveIntensity; m.opacity = src.opacity ?? 1;
  m.alphaMode = src.transparent ? 'blend' : src.alphaTest > 0 ? 'mask' : 'opaque'; if (src.alphaTest > 0) m.alphaTest = src.alphaTest; m.side = src.side === THREE.DoubleSide ? 'double' : 'front';
  if (src.normalScale) m.normalScale = src.normalScale.x; if (src.aoMapIntensity != null) m.aoIntensity = src.aoMapIntensity;
  const has = { base: src.map, normal: src.normalMap, ao: src.aoMap, rough: src.roughnessMap, metal: src.metalnessMap, height: src.displacementMap, alpha: src.alphaMap, emissive: src.emissiveMap };
  for (const s of MAP_SLOTS) m.maps[s] = has[s] ? { src: 'model' } : null;
  return cleanMaterial(m, name);
}
const SRC_KEY = { base: 'map', normal: 'normalMap', ao: 'aoMap', rough: 'roughnessMap', metal: 'metalnessMap', height: 'displacementMap', alpha: 'alphaMap', emissive: 'emissiveMap' };

// ---------------------------------------------------------------- textures (decoded once per file + colour space + size)
const IMG = new Map();
export function loadImageTexture(file, color, maxSize = 2048) {
  const key = file + '|' + (color ? 's' : 'l') + '|' + maxSize; if (IMG.has(key)) return IMG.get(key);
  const p = (async () => {
    let tex; const ext = extOf(file);
    if (ext === 'tga') { const { TGALoader } = await import('three/addons/loaders/TGALoader.js'); tex = await new TGALoader().loadAsync(fileURL(file)); }
    else { const im = await new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('image not loaded: ' + file)); i.src = fileURL(file); });
      const w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, maxSize / Math.max(w, h)); let src = im;
      if (k < 1) { const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k)); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); src = cv; }
      tex = new THREE.Texture(src); }
    tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.name = file; tex.userData.paintFile = file; tex.needsUpdate = true; return tex;
  })(); IMG.set(key, p); p.catch(() => IMG.delete(key)); return p;
}

// ---------------------------------------------------------------- materials
const ADJ_GLSL = `uniform vec4 uPaintAdj;
vec3 paintAdjust(vec3 c) {
  float Y = dot(c, vec3(0.299, 0.587, 0.114)); float I = dot(c, vec3(0.596, -0.274, -0.322)); float Q = dot(c, vec3(0.211, -0.523, 0.312));
  float hc = cos(uPaintAdj.x), hs = sin(uPaintAdj.x); float I2 = (I * hc - Q * hs) * uPaintAdj.y, Q2 = (I * hs + Q * hc) * uPaintAdj.y;
  c = vec3(Y + 0.956 * I2 + 0.621 * Q2, Y - 0.272 * I2 - 0.647 * Q2, Y - 1.106 * I2 + 1.703 * Q2);
  c = (c - 0.18) * uPaintAdj.w + 0.18; return max(c * uPaintAdj.z, vec3(0.0)); }
`;
const WIND_GLSL = `uniform float uPaintT; uniform float uPaintWind;
`;
// cfg (slot settings) + the model's own material + the model's texture convention → MeshStandardMaterial (maps fill in async)
export function buildMaterial(cfg, src, model, opts = {}) {
  cfg = cleanMaterial(cfg, cfg && cfg.name); const mat = new THREE.MeshStandardMaterial({ name: 'paint:' + cfg.name });
  mat.userData.paint = { uni: { uPaintAdj: { value: new THREE.Vector4() }, uPaintT: windUniform, uPaintWind: { value: 0 } }, wind: 0, adj: false, gen: 0 };
  mat.onBeforeCompile = (sh) => { const P = mat.userData.paint; Object.assign(sh.uniforms, P.uni);
    if (P.adj) { sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + ADJ_GLSL).replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = paintAdjust(diffuseColor.rgb);'); }
    if (P.wind > 0) { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WIND_GLSL).replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec4 pwW = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    pwW = batchingMatrix * pwW;
  #endif
    pwW = modelMatrix * pwW; float pwH = max(transformed.y, 0.0); float pwP = dot(pwW.xz, vec2(0.37, 0.29));
    float pwS = sin(uPaintT * 1.9 + pwP) * 0.65 + sin(uPaintT * 3.3 + pwP * 1.7) * 0.25 + sin(uPaintT * 0.7 + pwP * 0.31) * 0.4;
    transformed.xz += vec2(pwS, pwS * 0.55 + sin(uPaintT * 2.3 + pwP * 1.3) * 0.2) * uPaintWind * 0.07 * pwH * pwH; }`); }
  };
  mat.customProgramCacheKey = () => { const P = mat.userData.paint; return 'paint1-' + (P.adj ? 'a' : '') + (P.wind > 0 ? 'w' : ''); };
  applyMaterial(mat, cfg, src, model, opts); return mat;
}
// (re)apply settings to an existing material (live editing): scalar changes are immediate, maps reload when they changed
export function applyMaterial(mat, cfg, src, model, opts = {}) {
  cfg = cleanMaterial(cfg, cfg && cfg.name); const P = mat.userData.paint; const gen = ++P.gen; const wind = opts.wind || 0;
  mat.color.set(cfg.color); mat.roughness = cfg.roughness; mat.metalness = cfg.metalness; mat.emissive.set(cfg.emissive); mat.emissiveIntensity = cfg.emissiveIntensity;
  mat.aoMapIntensity = cfg.aoIntensity; mat.normalScale.set(cfg.normalScale, cfg.normalFlipY ? -cfg.normalScale : cfg.normalScale); mat.displacementScale = cfg.displacementScale; mat.displacementBias = cfg.displacementBias;
  mat.side = cfg.side === 'double' ? THREE.DoubleSide : THREE.FrontSide; mat.shadowSide = cfg.side === 'double' ? THREE.DoubleSide : null;
  const mode = cfg.alphaMode; mat.transparent = mode === 'blend'; mat.depthWrite = mode !== 'blend'; mat.alphaTest = mode === 'mask' ? cfg.alphaTest : 0; mat.alphaToCoverage = mode === 'mask' && cfg.alphaToCoverage; mat.opacity = cfg.opacity;
  const adj = cfg.hue !== 0 || cfg.saturation !== 1 || cfg.brightness !== 1 || cfg.contrast !== 1; P.uni.uPaintAdj.value.set((cfg.hue * Math.PI) / 180, cfg.saturation, cfg.brightness, cfg.contrast); P.uni.uPaintWind.value = wind;
  if (adj !== P.adj || (wind > 0) !== (P.wind > 0)) mat.needsUpdate = true; P.adj = adj; P.wind = wind;
  // maps
  const flipY = cfg.flipY != null ? cfg.flipY : model ? model.flipY : false; const want = {}; const jobs = [];
  for (const s of MAP_SLOTS) { const r = cfg.maps[s]; const key = SRC_KEY[s];
    if (!r) { want[key] = null; continue; }
    if (r.src === 'model') { const t = src && src[key]; want[key] = t ? { tex: t, own: true } : null; continue; }
    jobs.push(loadImageTexture(r.file, COLOR_SLOTS.has(s), cfg.maxSize).then((t) => { want[key] = { tex: t, own: false }; }).catch((e) => { console.warn('[paint] texture not loaded (slot ' + s + ')', e); want[key] = null; if (opts.onError) opts.onError(s, e); })); }
  const finish = () => {
    if (gen !== P.gen) return; // a newer edit superseded this one
    let changed = false; const minF = cfg.filter === 'nearest' ? THREE.NearestMipmapNearestFilter : cfg.filter === 'bilinear' ? THREE.LinearMipmapNearestFilter : THREE.LinearMipmapLinearFilter, magF = cfg.filter === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
    for (const key of Object.values(SRC_KEY)) { const w = want[key]; const cur = mat[key]; let t = null;
      if (w) { // the same image as before: only the tiling / sampling changes (uniforms — no new upload unless the sampling changed)
        t = cur && cur.userData.paintBase === w.tex ? cur : w.tex.clone(); if (t !== cur) { t.userData = { ...w.tex.userData, paintBase: w.tex }; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (!w.own) t.flipY = flipY; t.center.set(0.5, 0.5); t.generateMipmaps = true; t.needsUpdate = true; }
        t.repeat.set(w.tex.repeat.x * cfg.repeat[0], w.tex.repeat.y * cfg.repeat[1]); t.offset.set(w.tex.offset.x + cfg.offset[0], w.tex.offset.y + cfg.offset[1]); t.rotation = w.tex.rotation + (cfg.rotation * Math.PI) / 180;
        if (!w.own && t.flipY !== flipY) { t.flipY = flipY; t.needsUpdate = true; }
        if (t.magFilter !== magF || t.minFilter !== minF || t.anisotropy !== cfg.anisotropy) { t.magFilter = magF; t.minFilter = minF; t.anisotropy = cfg.anisotropy; t.needsUpdate = true; } }
      if (cur && cur !== t && cur.userData.paintBase) cur.dispose();
      if ((cur == null) !== (t == null)) changed = true; mat[key] = t; }
    if (changed) mat.needsUpdate = true; if (opts.onReady) opts.onReady(mat);
  };
  if (jobs.length) Promise.all(jobs).then(finish); else finish();
  return mat;
}
export function disposeMaterial(mat) { if (!mat || !mat.userData.paint) return; mat.userData.paint.gen++; for (const key of Object.values(SRC_KEY)) { const t = mat[key]; if (t && t.userData.paintBase) t.dispose(); mat[key] = null; } mat.dispose(); }
