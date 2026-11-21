// Model pack client (68th): the model tools' document + files (tools/vite/modelPack.mjs keeps them in model-pack/ and builds
// them into the game). Loads any model format three.js reads, with or without textures: an upload is the model file plus any
// files next to it (textures, .bin, .mtl) — references inside the model are matched by file name.
import * as THREE from 'three';
import { clone as skelClone } from 'three/addons/utils/SkeletonUtils.js';
import { setModelPack } from './boot.js';

export const FORMAT = 'colombo.model-manifest';
export const MODEL_EXTS = ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', 'dae', '3mf', 'usdz'];
export const ANIM_EXTS = ['bvh', 'fbx', 'glb', 'gltf'];
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'tga', 'ktx2'];
export const SIDE_EXTS = ['bin', 'mtl', ...IMAGE_EXTS];
export const ACCEPT_MODEL = [...MODEL_EXTS, ...SIDE_EXTS].map((e) => '.' + e).join(',');
export const ACCEPT_ANIM = [...ANIM_EXTS, 'bin', ...IMAGE_EXTS].map((e) => '.' + e).join(',');
export const ACCEPT_IMAGE = IMAGE_EXTS.map((e) => '.' + e).join(',');
export const empty = () => ({ format: FORMAT, version: 1, created: null, modified: null, files: {}, map: null, weapons: {}, heroes: {}, vehicles: {}, npcs: { rules: [] }, anims: {}, textures: {}, objects: {} });
const extOf = (n) => { const e = String(n).toLowerCase().split('.').pop(); return e === 'jpeg' ? 'jpg' : e; };
const base = (n) => String(n).split(/[\\/]/).pop();
export const isDevServer = () => !!(import.meta.env && import.meta.env.DEV);

export const PACK = { m: null, dirty: false, listeners: new Set() };
export function onPack(fn) { PACK.listeners.add(fn); return () => PACK.listeners.delete(fn); }
const emit = (t) => { for (const f of PACK.listeners) try { f(t); } catch (e) { console.warn(e); } };
export function normalize(m) { const e = empty(); if (!m || m.format !== FORMAT) return e; for (const k of Object.keys(e)) if (m[k] == null) m[k] = e[k]; if (!m.npcs.rules) m.npcs.rules = []; return m; }
// the document: the dev server's folder (newest), else the copy built into the game
export async function loadPack(force = false) {
  if (PACK.m && !force) return PACK.m;
  let m = null;
  if (isDevServer()) try { const r = await fetch('/__colombo/models', { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); m = j.manifest; } } catch { /* no dev server */ }
  if (!m) try { const r = await fetch('model-pack/manifest.json', { cache: 'no-cache' }); if (r.ok) m = await r.json(); } catch { /* none */ }
  PACK.m = normalize(m); setModelPack(PACK.m); return PACK.m;
}
export async function savePack() {
  const m = PACK.m || (PACK.m = empty()); const now = new Date().toISOString(); if (!m.created) m.created = now; m.modified = now;
  if (!isDevServer()) throw new Error('saving into model-pack/ needs the dev server (npm run dev) — this build only reads the pack');
  const r = await fetch('/__colombo/models/manifest', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) });
  if (!r.ok) throw new Error('save failed: ' + r.status + ' ' + (await r.text()));
  PACK.dirty = false; setModelPack(m); emit('save'); return m;
}
export function markDirty() { PACK.dirty = true; emit('dirty'); }
async function sha256(buf) { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
// one file into the pack: content-addressed "<sha256>.<ext>"; returns that name
export async function addFile(file, kind = null, extra = {}) {
  const m = PACK.m || (PACK.m = empty()); const buf = await file.arrayBuffer(); const ext = extOf(file.name); const name = (await sha256(buf)) + '.' + ext;
  if (isDevServer()) { const r = await fetch('/__colombo/models/file/' + name, { method: 'POST', body: buf }); if (!r.ok) throw new Error('upload failed (' + r.status + '): ' + file.name); }
  else throw new Error('uploading needs the dev server (npm run dev)');
  BLOBS.set(name, URL.createObjectURL(new Blob([buf])));
  m.files[name] = Object.assign(m.files[name] || {}, { name: file.name, bytes: buf.byteLength, kind: kind || kindOf(ext), added: m.files[name]?.added || new Date().toISOString() }, extra); markDirty(); return name;
}
export function kindOf(ext) { ext = extOf('x.' + ext); return MODEL_EXTS.includes(ext) ? 'model' : ext === 'bvh' ? 'anim' : IMAGE_EXTS.includes(ext) ? 'image' : 'side'; }
// an upload: the main model / animation file + everything picked with it → { main, files: { originalName: packName } }
export async function addAsset(fileList, want = 'model') {
  const files = [...fileList]; if (!files.length) return null; const exts = want === 'anim' ? ANIM_EXTS : MODEL_EXTS;
  const mainF = files.find((f) => exts.includes(extOf(f.name)) && extOf(f.name) !== 'bin') || null; if (!mainF) throw new Error(`no ${want === 'anim' ? 'animation (.bvh .fbx .glb .gltf)' : 'model (' + MODEL_EXTS.join(' ') + ')'} file among the picked files`);
  const out = { main: null, files: {}, name: mainF.name };
  for (const f of files) { const n = await addFile(f, f === mainF ? want : null); out.files[base(f.name)] = n; if (f === mainF) out.main = n; }
  return out;
}
const BLOBS = new Map();
export const fileURL = (name) => BLOBS.get(name) || 'model-pack/' + name;
export function pickFiles(accept, multiple = true) { return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple; i.style.display = 'none'; i.addEventListener('change', () => { const f = [...i.files]; i.remove(); res(f); }); i.addEventListener('cancel', () => { i.remove(); res([]); }); document.body.appendChild(i); i.click(); }); }

// ------------------------------------------------------------------ loading
const L = {}; // loader modules, imported on first use
async function loaderFor(ext) {
  switch (ext) {
    case 'glb': case 'gltf': return (L.gltf ||= await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader;
    case 'fbx': return (L.fbx ||= await import('three/addons/loaders/FBXLoader.js')).FBXLoader;
    case 'obj': return (L.obj ||= await import('three/addons/loaders/OBJLoader.js')).OBJLoader;
    case 'stl': return (L.stl ||= await import('three/addons/loaders/STLLoader.js')).STLLoader;
    case 'ply': return (L.ply ||= await import('three/addons/loaders/PLYLoader.js')).PLYLoader;
    case 'dae': return (L.dae ||= await import('three/addons/loaders/ColladaLoader.js')).ColladaLoader;
    case '3mf': return (L.tmf ||= await import('three/addons/loaders/3MFLoader.js')).ThreeMFLoader;
    case 'usdz': return (L.usdz ||= await import('three/addons/loaders/USDZLoader.js')).USDZLoader;
    case 'bvh': return (L.bvh ||= await import('three/addons/loaders/BVHLoader.js')).BVHLoader;
    default: throw new Error('unsupported file type .' + ext);
  }
}
function manager(asset) {
  const M = new THREE.LoadingManager(); const map = new Map(); for (const [orig, n] of Object.entries(asset.files || {})) { map.set(orig.toLowerCase(), n); map.set(base(orig).toLowerCase(), n); }
  M.setURLModifier((url) => { if (/^(data|blob):/.test(url)) return url; const b = decodeURIComponent(base(url.split('?')[0])).toLowerCase(); const n = map.get(b); return n ? fileURL(n) : url; });
  if (!L.tgaReg) { L.tgaReg = import('three/addons/loaders/TGALoader.js').then((m) => { THREE.DefaultLoadingManager.addHandler(/\.tga$/i, new m.TGALoader()); L.tga = m; }).catch(() => {}); }
  return M;
}
const solidMat = () => new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.7, metalness: 0.05 });
const CACHE = new Map(); // main file → Promise<{ scene, clips, skeleton? }>
// { scene: Object3D (a fresh copy every call), clips: AnimationClip[] }
const READY = new Map(); // key → loaded raw (for synchronous instancing in build hooks)
export const assetKey = (asset) => asset.main + '|' + Object.values(asset.files || {}).sort().join(',');
export async function loadAsset(asset) {
  if (!asset || !asset.main) throw new Error('no model');
  const key = assetKey(asset);
  if (!CACHE.has(key)) CACHE.set(key, loadRaw(asset).then((raw) => { READY.set(key, raw); return raw; }).catch((e) => { CACHE.delete(key); throw e; }));
  const raw = await CACHE.get(key); return inst(raw);
}
const inst = (raw) => ({ scene: raw.scene ? skelClone(raw.scene) : null, clips: raw.clips || [], skeleton: raw.skeleton || null, raw });
export function readyAsset(asset) { if (!asset || !asset.main) return null; const raw = READY.get(assetKey(asset)); return raw ? inst(raw) : null; }
export function forgetAsset(asset) { const k = assetKey(asset); CACHE.delete(k); READY.delete(k); }
async function loadRaw(asset) {
  const ext = extOf(asset.main); const Ld = await loaderFor(ext); if (L.tgaReg) await L.tgaReg; const M = manager(asset); const url = fileURL(asset.main);
  const ld = new Ld(M);
  if (ext === 'glb' || ext === 'gltf') { try { const mo = await import('three/addons/libs/meshopt_decoder.module.js'); ld.setMeshoptDecoder(mo.MeshoptDecoder); } catch { /* optional */ } }
  if (ext === 'obj') { const mtl = Object.entries(asset.files || {}).find(([o]) => extOf(o) === 'mtl'); if (mtl) { const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js'); const ml = new MTLLoader(M); const mats = await ml.loadAsync(fileURL(mtl[1])); mats.preload(); ld.setMaterials(mats); } }
  const r = await ld.loadAsync(url);
  let scene = null, clips = [], skeleton = null;
  if (ext === 'glb' || ext === 'gltf') { scene = r.scene; clips = r.animations || []; }
  else if (ext === 'fbx') { scene = r; clips = r.animations || []; }
  else if (ext === 'dae') { scene = r.scene; clips = r.animations || (r.scene && r.scene.animations) || []; }
  else if (ext === 'stl' || ext === 'ply') { const g = r; if (!g.attributes.normal) g.computeVertexNormals(); const mat = solidMat(); if (g.attributes.color) mat.vertexColors = true; scene = new THREE.Group(); scene.add(new THREE.Mesh(g, mat)); }
  else if (ext === 'bvh') { skeleton = r.skeleton; clips = [r.clip]; scene = new THREE.Group(); const root = r.skeleton.bones[0]; scene.add(root); } // (no SkeletonHelper: it cannot be cloned per instance)
  else scene = r;
  if (scene) scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (!o.material) o.material = solidMat(); } });
  return { scene, clips, skeleton };
}
const TEX = new Map();
// an image file of the pack as a texture (sRGB for colour slots); max = longest side (downscaled on a canvas, the 512 px budget)
export async function loadTexture(name, { color = true, max = 512, flipY = null } = {}) {
  const key = name + '|' + color + '|' + max + '|' + flipY; if (TEX.has(key)) return TEX.get(key);
  const p = (async () => {
    const ext = extOf(name); let tex;
    if (ext === 'tga') { const { TGALoader } = await import('three/addons/loaders/TGALoader.js'); tex = await new TGALoader().loadAsync(fileURL(name)); }
    else if (ext === 'ktx2') throw new Error('KTX2 textures: convert to PNG / JPG for the model tools');
    else { const im = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => rej(new Error('image not loaded: ' + name)); i.src = fileURL(name); });
      const w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, max / Math.max(w, h)); let src = im;
      if (k < 1) { const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k)); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height); src = cv; }
      tex = new THREE.Texture(src); tex.needsUpdate = true; }
    tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4; if (flipY != null) tex.flipY = flipY; tex.name = name; tex.userData.packFile = name; return tex;
  })(); TEX.set(key, p); p.catch(() => TEX.delete(key)); return p;
}
export const _test = { extOf, base, normalize };
