// Texture Studio runtime (59th): the part that applies texture / material replacements to the live scene. Loaded on demand —
// at start-up only when a texture pack (texture-pack/manifest.json, built into dist and the .exe) or a Studio-saved manifest
// has rules, and by the Studio itself (src/debug/TextureStudio.js, development builds only).
//
// Model
//   • A RULE edits one material TARGET: slots (map, normalMap, roughnessMap, metalnessMap, aoMap, emissiveMap) and settings
//     (colour, roughness, metalness, emissive …). Rules live in a versioned MANIFEST together with the texture LIBRARY
//     (content-hashed images: <sha256>.<ext>).
//   • Targets are stable across restarts: `mat:<MAT key>` (the shared city materials, src/gfx/Materials.js),
//     `veh:<vehicle type>:<material>` (every vehicle of that type, including ones spawned later), `name:<type>:<name>` (named
//     materials), `sig:<type>:<hash>` (unnamed generated materials, identified by their creation parameters) and
//     `obj:<scene path>|<slot>` (a private copy of a material made for one static object — "Make unique").
//   • Materials are edited IN PLACE (never replaced): their shader patches (onBeforeCompile), their sharing between
//     objects and the game's references to them stay intact. The first touch backs the material up (slot textures +
//     settings); restoring puts exactly those objects back. Original textures are never modified — replacements are new
//     Texture objects (a clone of the original keeps its image when only the tiling changes).
//   • One decoded image per library texture and one GPU upload per (texture, size, colour adjustment): every slot that uses
//     it is a clone sharing the same THREE.Source (three.js uploads a source once). Releasing the last user disposes it.
//   • Storage: the dev server's project folder `texture-pack/` (tools/vite/texturePack.mjs: real files, kept out of git,
//     built into the game), else this browser's IndexedDB; textures missing locally come from the manifest's asset base URL.
import * as THREE from 'three';
import { MAT, wetTarget } from '../gfx/Materials.js';
import { vehicleMaterials } from '../vehicles/VehicleModels.js';
import { storeGet, storeSet, setSavedFlag, TEXTURE_STUDIO } from './boot.js';

export const MANIFEST_FORMAT = 'colombo.texture-manifest';
export const MANIFEST_VERSION = 1;
export const SLOTS = [
  { k: 'map', label: 'Base Color', short: 'BC', srgb: true },
  { k: 'normalMap', label: 'Normal', short: 'N', srgb: false },
  { k: 'roughnessMap', label: 'Roughness', short: 'R', srgb: false },
  { k: 'metalnessMap', label: 'Metallic', short: 'M', srgb: false },
  { k: 'aoMap', label: 'Ambient Occlusion', short: 'AO', srgb: false },
  { k: 'emissiveMap', label: 'Emissive', short: 'E', srgb: true },
];
export const PROPS = [
  { k: 'color', label: 'Base colour', kind: 'color' },
  { k: 'roughness', label: 'Roughness', kind: 'num', min: 0, max: 1, step: 0.01 },
  { k: 'metalness', label: 'Metalness', kind: 'num', min: 0, max: 1, step: 0.01 },
  { k: 'emissive', label: 'Emissive colour', kind: 'color' },
  { k: 'emissiveIntensity', label: 'Emissive intensity', kind: 'num', min: 0, max: 8, step: 0.05 },
  { k: 'normalScale', label: 'Normal strength', kind: 'vec', min: -3, max: 3, step: 0.01 },
  { k: 'aoMapIntensity', label: 'AO intensity', kind: 'num', min: 0, max: 2, step: 0.01 },
  { k: 'envMapIntensity', label: 'Reflection intensity', kind: 'num', min: 0, max: 4, step: 0.01 },
];
export const CATEGORIES = ['Building', 'Road', 'Pavement', 'Roof', 'Vehicle', 'Character', 'Vegetation', 'Prop', 'Interior', 'Environment', 'Signage', 'Water', 'Other'];
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', ktx2: 'image/ktx2', dds: 'image/vnd-ms.dds' };
export const ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.avif,.bmp,.ktx2,.dds,image/png,image/jpeg,image/webp';
export const COMPRESSED = new Set(['ktx2', 'dds']);
const SETTINGS_KEY = 'colombo.texstudio.settings';

// ------------------------------------------------------------------------------------------------- state
export const S = {
  game: null, manifest: emptyManifest(), backend: null, ready: false, enabled: true,
  settings: loadSettings(), listeners: new Set(), errors: new Map(), driven: new Map(), saveState: 'saved', lastSaveError: '',
};
export function emptyManifest() { return { format: MANIFEST_FORMAT, version: MANIFEST_VERSION, created: new Date().toISOString(), modified: null, assetBase: '', textures: {}, rules: {} }; }
function loadSettings() { let s = {}; try { s = JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) || '{}') || {}; } catch { /* none */ } return { maxSize: s.maxSize || 512, budgetMB: s.budgetMB || 96 }; }
export function saveSettings() { try { globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(S.settings)); } catch { /* private mode */ } }
export function on(fn) { S.listeners.add(fn); return () => S.listeners.delete(fn); }
function emit(type, data) { for (const f of S.listeners) try { f(type, data); } catch (e) { console.error(e); } }

// ------------------------------------------------------------------------------------------------- small helpers
export function fnv(str) { let h1 = 0x811c9dc5, h2 = 0x01000193 ^ str.length; for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519) ^ (h2 >>> 13); } return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'); }
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
export function sniffFormat(bytes) {
  const b = bytes; const s = (i, n) => String.fromCharCode(...b.subarray(i, i + n));
  if (b[0] === 0x89 && s(1, 3) === 'PNG') return 'png'; if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (s(0, 4) === 'RIFF' && s(8, 4) === 'WEBP') return 'webp'; if (s(0, 3) === 'GIF') return 'gif'; if (s(0, 2) === 'BM') return 'bmp';
  if (s(4, 8) === 'ftypavif' || s(4, 8) === 'ftypavis') return 'avif'; if (b[0] === 0xab && s(1, 6) === 'KTX 20') return 'ktx2'; if (s(0, 4) === 'DDS ') return 'dds';
  return null;
}
export async function hashBytes(buf) {
  try { if (globalThis.crypto?.subtle) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf)); return [...d.subarray(0, 16)].map((x) => x.toString(16).padStart(2, '0')).join(''); } } catch { /* insecure context: fall back */ }
  const u = new Uint8Array(buf); let a = 0x811c9dc5, b = 0x9e3779b9, c = u.length >>> 0, d = 0x85ebca6b; // 128-bit non-crypto fallback (still content-addressed)
  for (let i = 0; i < u.length; i++) { const x = u[i]; a = Math.imul(a ^ x, 16777619); b = Math.imul(b ^ x, 2246822519) ^ (b >>> 15); c = Math.imul(c + x, 3266489917) ^ (c >>> 13); d = Math.imul(d ^ (x + i), 668265263) ^ (d >>> 16); }
  return [a, b, c, d].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// ------------------------------------------------------------------------------------------------- storage backends
// Project folder (dev server, tools/vite/texturePack.mjs): files are real and permanent, built into the game.
const FolderBackend = {
  kind: 'folder', label: 'Project folder', writable: true, folder: '',
  async init() { const r = await fetch('/__colombo/textures', { cache: 'no-cache' }); if (!r.ok) throw new Error('no dev endpoint'); const j = await r.json(); if (!j || !j.ok) throw new Error('bad dev endpoint'); this.folder = j.folder; this.files = new Set(j.files || []); return j.manifest || null; },
  async loadManifest() { const r = await fetch('/__colombo/textures', { cache: 'no-cache' }); const j = await r.json(); this.files = new Set(j.files || []); return j.manifest || null; },
  async saveManifest(m) { const r = await fetch('/__colombo/textures/manifest', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(m) }); if (!r.ok) throw new Error('save failed: ' + r.status + ' ' + (await r.text())); },
  async putFile(name, blob) { if (this.files?.has(name)) return; const r = await fetch('/__colombo/textures/file/' + encodeURIComponent(name), { method: 'POST', body: blob }); if (!r.ok) throw new Error('upload failed: ' + r.status + ' ' + (await r.text())); this.files?.add(name); },
  async getFile(name) { const r = await fetch('texture-pack/' + encodeURIComponent(name)); return r.ok ? r.blob() : null; },
  async deleteFile(name) { await fetch('/__colombo/textures/file/' + encodeURIComponent(name), { method: 'DELETE' }); this.files?.delete(name); },
};
// This browser's IndexedDB (studio builds without the dev server): survives restarts of this browser profile only.
const IdbBackend = {
  kind: 'idb', label: 'Browser storage (IndexedDB)', writable: true,
  async init() { try { this.persisted = await navigator.storage?.persist?.(); } catch { /* not supported */ } return (await storeGet('tex:manifest')) || null; },
  async loadManifest() { return (await storeGet('tex:manifest')) || null; },
  async saveManifest(m) { await storeSet('tex:manifest', m); },
  async putFile(name, blob) { if (await storeGet('tex:file:' + name)) return; await storeSet('tex:file:' + name, blob); },
  async getFile(name) { return (await storeGet('tex:file:' + name)) || null; },
  async deleteFile(name) { await storeSet('tex:file:' + name, undefined); },
};
// Shipped pack (production builds): read-only.
const PackBackend = {
  kind: 'pack', label: 'Built-in texture pack (read-only)', writable: false,
  async init() { return null; }, async loadManifest() { return null; }, async saveManifest() { throw new Error('read-only'); }, async putFile() { throw new Error('read-only'); },
  async getFile(name) { try { const r = await fetch('texture-pack/' + encodeURIComponent(name)); return r.ok ? r.blob() : null; } catch { return null; } },
  async deleteFile() { /* read-only */ },
};
export const BACKENDS = { folder: FolderBackend, idb: IdbBackend, pack: PackBackend };

// ------------------------------------------------------------------------------------------------- manifest validation
export function sanitizeManifest(m) {
  if (!m || typeof m !== 'object') throw new Error('not a texture manifest');
  if (m.format !== MANIFEST_FORMAT) throw new Error('not a COLOMBO texture manifest (format = ' + m.format + ')');
  if (!(m.version >= 1)) throw new Error('missing manifest version');
  if (m.version > MANIFEST_VERSION) throw new Error(`manifest version ${m.version} is newer than this game supports (${MANIFEST_VERSION})`);
  const out = emptyManifest(); out.created = m.created || out.created; out.modified = m.modified || null; out.assetBase = typeof m.assetBase === 'string' ? m.assetBase : '';
  for (const [h, t] of Object.entries(m.textures || {})) { if (!/^[0-9a-f]{16,64}$/.test(h) || !t || !MIME[t.ext]) continue; out.textures[h] = { name: String(t.name || h).slice(0, 120), category: CATEGORIES.includes(t.category) ? t.category : 'Other', tags: Array.isArray(t.tags) ? t.tags.map(String).slice(0, 12) : [], w: +t.w || 0, h: +t.h || 0, ext: t.ext, bytes: +t.bytes || 0, added: t.added || null, thumb: typeof t.thumb === 'string' && t.thumb.startsWith('data:image/') ? t.thumb : '' }; }
  for (const [k, r] of Object.entries(m.rules || {})) { if (!r || typeof r !== 'object' || !/^(mat|veh|name|sig|obj):/.test(k)) continue; out.rules[k] = { label: String(r.label || k).slice(0, 160), target: r.target || null, enabled: r.enabled !== false, slots: {}, props: {}, created: r.created || null, modified: r.modified || null };
    for (const s of SLOTS) if (r.slots && r.slots[s.k]) out.rules[k].slots[s.k] = sanitizeSlot(r.slots[s.k]);
    for (const p of PROPS) if (r.props && r.props[p.k] != null) out.rules[k].props[p.k] = p.kind === 'color' ? String(r.props[p.k]).slice(0, 9) : +r.props[p.k]; }
  return out;
}
function sanitizeSlot(s) {
  const n = (v, d) => (Number.isFinite(+v) ? +v : d); const o = { tex: typeof s.tex === 'string' && /^[0-9a-f]{16,64}$/.test(s.tex) ? s.tex : null, clear: !!s.clear };
  if (Array.isArray(s.repeat)) o.repeat = [n(s.repeat[0], 1), n(s.repeat[1], 1)]; if (Array.isArray(s.offset)) o.offset = [n(s.offset[0], 0), n(s.offset[1], 0)];
  if (s.rotation != null) o.rotation = n(s.rotation, 0); if (s.flipV) o.flipV = true; if (s.wrap) o.wrap = ['repeat', 'clamp', 'mirror'].includes(s.wrap) ? s.wrap : 'repeat';
  if (s.maxSize) o.maxSize = Math.max(16, Math.min(4096, n(s.maxSize, 512))); if (s.flipGreen) o.flipGreen = true;
  if (s.adjust && typeof s.adjust === 'object') { const a = s.adjust; o.adjust = { bright: n(a.bright, 0), contrast: n(a.contrast, 0), sat: n(a.sat, 0), hue: n(a.hue, 0), tint: typeof a.tint === 'string' ? a.tint.slice(0, 7) : '#ffffff', invert: !!a.invert }; }
  return o;
}

// ------------------------------------------------------------------------------------------------- material identity
let MATKEY = null;
function matKey(m) { if (!MATKEY) { MATKEY = new Map(); for (const [k, v] of Object.entries(MAT)) if (v && v.isMaterial && !MATKEY.has(v)) MATKEY.set(v, k); } return MATKEY.get(m) || null; }
export function vehOf(o) { for (let p = o; p; p = p.parent) if (p.userData && p.userData.seats && p.userData.type && typeof p.userData.type === 'string') return p; return null; }
export function snapProps(m) { const o = {}; for (const p of PROPS) if (p.k in m && m[p.k] != null) { const v = m[p.k]; o[p.k] = v.isColor ? v.getHex() : v.isVector2 ? [v.x, v.y] : v; } return o; }
const ORIG = new WeakMap(); // material → { slots, props, wet } exactly as the game made it (first Studio touch)
function sigOf(m) {
  const b = ORIG.get(m); const col = b ? b.props.color : m.color && m.color.getHex();
  const slots = SLOTS.map((s) => { const t = b ? b.slots[s.k] : m[s.k]; const im = t && t.image; return t ? (im ? (im.width | 0) + 'x' + (im.height | 0) : 't') : '-'; }).join(',');
  return fnv([m.type, col, slots, m.transparent ? 1 : 0, m.side, m.vertexColors ? 1 : 0, m.alphaTest, m.flatShading ? 1 : 0].join('|')).slice(0, 10);
}
export function keyOf(m, o, i = 0) {
  if (m.userData && m.userData.__tsKey) return m.userData.__tsKey;
  const v = o && vehOf(o); if (v) return 'veh:' + v.userData.type + ':' + vehPart(o, i); // vehicles: per type + part (their materials are shared by every car)
  const mk = matKey(m); if (mk) return 'mat:' + mk;
  if (m.name) return 'name:' + m.type + ':' + m.name;
  return 'sig:' + m.type + ':' + sigOf(m);
}
export function describeKey(k) {
  const [kind, ...r] = k.split(':'); const rest = r.join(':');
  if (kind === 'mat') return { kind, scope: 'Shared city material MAT.' + rest, persist: true };
  if (kind === 'veh') { const [type, ...p] = rest.split(':'); return { kind, scope: `Every "${type}" vehicle · part "${p.join(':')}" (its own copy of the shared vehicle material)`, persist: true }; }
  if (kind === 'name') return { kind, scope: 'Every material named "' + rest.split(':').slice(1).join(':') + '"', persist: true };
  if (kind === 'sig') return { kind, scope: 'Unnamed generated material (identified by its creation parameters: ' + rest + ')', persist: true };
  if (kind === 'obj') return { kind, scope: 'Private copy for one object (' + rest + ')', persist: true };
  return { kind, scope: k, persist: false };
}
export function pathOf(o) { const seg = []; for (let p = o; p && p.parent; p = p.parent) { const i = p.parent.children.indexOf(p); seg.unshift(p.name ? p.name.replace(/[/|]/g, '_') + '@' + sameNameIndex(p) : '#' + i); } return seg.join('/'); }
function sameNameIndex(p) { let n = 0; for (const c of p.parent.children) { if (c === p) return n; if (c.name === p.name) n++; } return 0; }
function resolvePath(path) { let o = S.game.scene; for (const s of path.split('/')) { if (!o) return null; if (s.startsWith('#')) o = o.children[+s.slice(1)]; else { const at = s.lastIndexOf('@'); const name = s.slice(0, at), k = +s.slice(at + 1); let n = 0, f = null; for (const c of o.children) if (c.name.replace(/[/|]/g, '_') === name) { if (n === k) { f = c; break; } n++; } o = f; } } return o; }
const fingerprint = (o, slot) => { const g = o.geometry; const m = Array.isArray(o.material) ? o.material[slot] : o.material; return [o.type, g && g.attributes.position ? g.attributes.position.count : 0, m ? m.type : ''].join(':'); };

// ------------------------------------------------------------------------------------------------- scene index
let INDEX = new Map(); // key → Set(material), rebuilt by scan()
const SEEN = new WeakMap(); // material → key (keys never change for a material)
const USERS = new WeakMap(); // material → { meshes, instances }
const APPLIED = new WeakMap(); // material → { key, values } (what the rule last set — drift detection)
export function scan() {
  if (!S.game || !S.game.scene) return; const idx = new Map(); const users = new Map();
  S.game.scene.traverse((o) => {
    if (!o.material || !(o.isMesh || o.isSprite || o.isPoints || o.isLine)) return; if (o.userData && o.userData.__tsHelper) return;
    const arr = Array.isArray(o.material) ? o.material : [o.material];
    const inVeh = !!vehOf(o);
    for (let i = 0; i < arr.length; i++) { const m = arr[i]; if (!m || !m.isMaterial) continue; let k = m.userData && m.userData.__tsKey; if (!k && inVeh) k = keyOf(m, o, i); else if (!k) { k = SEEN.get(m); if (!k) { k = keyOf(m, o, i); SEEN.set(m, k); } }
      let set = idx.get(k); if (!set) idx.set(k, (set = new Set())); set.add(m);
      let u = users.get(m); if (!u) users.set(m, (u = { meshes: 0, instances: 0, objects: [] })); u.meshes++; u.instances += o.isInstancedMesh ? o.count : o.isBatchedMesh ? batchCount(o) : 1; if (u.objects.length < 40) u.objects.push(o); }
  });
  for (const k of Object.keys(MAT)) { const m = MAT[k]; if (m && m.isMaterial && !idx.has('mat:' + k)) idx.set('mat:' + k, new Set([m])); } // shared city materials, also before their chunks stream in
  INDEX = idx; for (const [m, u] of users) USERS.set(m, u);
  // late objects: rules apply to materials that appeared since the last scan (vehicles, people, streamed chunks)
  for (const [k, r] of Object.entries(S.manifest.rules)) {
    if (k.startsWith('obj:')) { ensureObj(k, r); const o = OBJ.get(k); if (o) syncDriven(o.orig, o.clone, r); continue; }
    if (k.startsWith('veh:')) { if (r.enabled && S.enabled) vehPass(k, r); continue; }
    if (!r.enabled || !S.enabled) continue; const set = idx.get(k); if (!set) continue;
    for (const m of set) { const a = APPLIED.get(m); if (!a || a.key !== k || a.rev !== r.__rev) applyRuleTo(m, k, r); else checkDrift(m, k, a); }
  }
}
function batchCount(o) { const I = o._instanceInfo; if (Array.isArray(I)) { let n = 0; for (const i of I) if (i && i.active !== false) n++; return n; } return o.instanceCount || 1; }
export function materialsFor(k) { if (k.startsWith('obj:')) { const c = OBJ.get(k); return c ? [c.clone] : []; } if (k.startsWith('veh:') && VCLONE.has(k)) return [...new Set([...VCLONE.get(k).values(), ...(INDEX.get(k) || [])].filter((m) => m.userData.__tsKey === k || !sharedVehMat(m)))]; return [...(INDEX.get(k) || [])]; }
export function usersOf(m) { return USERS.get(m) || { meshes: 0, instances: 0, objects: [] }; }
export function originalOf(m) { return ORIG.get(m) || null; }

// ------------------------------------------------------------------------------------------------- texture pipeline
const DECODED = new Map(); // hash → Promise<{ kind:'bitmap'|'compressed', bmp?, tex?, w, h, bytes }>
const BASE = new Map(); // variant key → { tex, refs, bytes }
const SLOTTEX = new WeakMap(); // material → { [slot]: { sig, tex, baseKey } }
let ktx2 = null;
export function gpuBytes() { let n = 0; for (const b of BASE.values()) n += b.bytes; return n; }
export function budgetBytes() { return S.settings.budgetMB * 1048576; }
async function fileBlob(hash) {
  const t = S.manifest.textures[hash]; if (!t) throw new Error('texture ' + hash.slice(0, 8) + ' is not in the library'); const name = hash + '.' + t.ext;
  let b = S.backend ? await S.backend.getFile(name) : null; if (!b && S.backend !== PackBackend) b = await PackBackend.getFile(name); // a studio build started from the shipped pack
  if (!b && S.manifest.assetBase) { const u = S.manifest.assetBase.replace(/\/+$/, '') + '/' + name; try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) b = await r.blob(); } catch { /* offline / CORS */ } }
  if (!b) throw new Error(`texture file ${name} not found (${S.backend ? S.backend.label : 'no storage'}${S.manifest.assetBase ? ' or ' + S.manifest.assetBase : ''})`);
  return b;
}
function decode(hash) {
  let p = DECODED.get(hash); if (p) return p;
  p = (async () => { const t = S.manifest.textures[hash]; const blob = await fileBlob(hash); return decodeBlob(blob, t.ext); })();
  DECODED.set(hash, p); p.catch(() => DECODED.delete(hash)); return p;
}
export async function decodeBlob(blob, ext) {
  if (ext === 'ktx2') {
    const R = S.game && S.game.renderer; if (!R) throw new Error('KTX2 needs the renderer'); if (!ktx2) { const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js'); ktx2 = new KTX2Loader(); ktx2.detectSupport(R); }
    const buf = await blob.arrayBuffer(); const tex = await new Promise((res, rej) => ktx2.parse(buf, res, rej)); const im = tex.image || {}; return { kind: 'compressed', tex, w: im.width | 0, h: im.height | 0, bytes: compressedBytes(tex) || buf.byteLength };
  }
  if (ext === 'dds') {
    const { DDSLoader } = await import('three/examples/jsm/loaders/DDSLoader.js'); const buf = await blob.arrayBuffer(); const d = new DDSLoader().parse(buf, true);
    const R = S.game && S.game.renderer; if (d.format !== THREE.RGBAFormat && R && !R.extensions.has('WEBGL_compressed_texture_s3tc')) throw new Error('this GPU/browser does not support S3TC (DXT) textures');
    const tex = d.isCubemap ? null : new THREE.CompressedTexture(d.mipmaps, d.width, d.height, d.format); if (!tex) throw new Error('cube-map DDS files are not supported');
    if (d.mipmapCount === 1) tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true; return { kind: 'compressed', tex, w: d.width, h: d.height, bytes: compressedBytes(tex) || buf.byteLength };
  }
  const bmp = await createImageBitmap(blob); return { kind: 'bitmap', bmp, w: bmp.width, h: bmp.height, bytes: blob.size };
}
function compressedBytes(t) { let n = 0; for (const m of t.mipmaps || []) n += (m.data && m.data.byteLength) || 0; return n; }
const adjustKey = (a) => (a ? [a.bright, a.contrast, a.sat, a.hue, a.tint, a.invert ? 1 : 0].join(',') : '');
const identityAdjust = (a) => !a || (!a.bright && !a.contrast && !a.sat && !a.hue && (!a.tint || a.tint.toLowerCase() === '#ffffff') && !a.invert);
export function fitSize(w, h, max) { const s = Math.min(1, max / Math.max(w, h, 1)); return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))]; }
// canvas variant of an image: resized (≤ maxSize, aspect kept), optional flip / green flip (normal maps) / colour adjustment
export async function processImage(src, w, h, sr) {
  const [tw, th] = fitSize(w, h, sr.maxSize || S.settings.maxSize);
  let img = src; if (typeof createImageBitmap === 'function' && (tw !== w || th !== h)) { try { img = await createImageBitmap(src, { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' }); } catch { img = src; } }
  const cv = document.createElement('canvas'); cv.width = tw; cv.height = th; const g = cv.getContext('2d', { willReadFrequently: true });
  if (sr.flipV) { g.translate(0, th); g.scale(1, -1); } g.drawImage(img, 0, 0, tw, th); g.setTransform(1, 0, 0, 1, 0, 0); if (img !== src && img.close) img.close();
  const a = sr.adjust; if (!identityAdjust(a) || sr.flipGreen) {
    const d = g.getImageData(0, 0, tw, th); const p = d.data; const b = (a && a.bright) || 0, c = (a && a.contrast) || 0, sat = (a && a.sat) || 0, hue = (((a && a.hue) || 0) * Math.PI) / 180;
    const cf = Math.tan(((Math.max(-0.99, Math.min(0.99, c)) + 1) * Math.PI) / 4); const tint = new THREE.Color(a && a.tint ? a.tint : '#ffffff'); const cosH = Math.cos(hue), sinH = Math.sin(hue);
    // hue rotation matrix (luma-preserving, YIQ-style)
    const hm = [0.213 + cosH * 0.787 - sinH * 0.213, 0.715 - cosH * 0.715 - sinH * 0.715, 0.072 - cosH * 0.072 + sinH * 0.928, 0.213 - cosH * 0.213 + sinH * 0.143, 0.715 + cosH * 0.285 + sinH * 0.14, 0.072 - cosH * 0.072 - sinH * 0.283, 0.213 - cosH * 0.213 - sinH * 0.787, 0.715 - cosH * 0.715 + sinH * 0.715, 0.072 + cosH * 0.928 + sinH * 0.072];
    for (let i = 0; i < p.length; i += 4) {
      let r = p[i] / 255, gg = p[i + 1] / 255, bb = p[i + 2] / 255;
      if (a) { if (hue) { const r2 = hm[0] * r + hm[1] * gg + hm[2] * bb, g2 = hm[3] * r + hm[4] * gg + hm[5] * bb, b2 = hm[6] * r + hm[7] * gg + hm[8] * bb; r = r2; gg = g2; bb = b2; }
        if (sat) { const l = 0.2126 * r + 0.7152 * gg + 0.0722 * bb; r = l + (r - l) * (1 + sat); gg = l + (gg - l) * (1 + sat); bb = l + (bb - l) * (1 + sat); }
        if (c) { r = (r - 0.5) * cf + 0.5; gg = (gg - 0.5) * cf + 0.5; bb = (bb - 0.5) * cf + 0.5; } if (b) { r += b; gg += b; bb += b; }
        r *= tint.r; gg *= tint.g; bb *= tint.b; if (a.invert) { r = 1 - r; gg = 1 - gg; bb = 1 - bb; } }
      if (sr.flipGreen) gg = 1 - gg;
      p[i] = Math.max(0, Math.min(255, r * 255)); p[i + 1] = Math.max(0, Math.min(255, gg * 255)); p[i + 2] = Math.max(0, Math.min(255, bb * 255));
    }
    g.putImageData(d, 0, 0);
  }
  return cv;
}
// one GPU texture per (image, size, adjustment); slots use clones sharing its Source
async function acquireBase(srcKey, getSrc, sr) {
  const vk = srcKey + '|' + (sr.maxSize || S.settings.maxSize) + '|' + adjustKey(sr.adjust) + '|' + (sr.flipV ? 1 : 0) + '|' + (sr.flipGreen ? 1 : 0);
  let b = BASE.get(vk); if (b) { if (b.pending) await b.pending; b.refs++; return { vk, tex: b.tex }; }
  b = { tex: null, refs: 1, bytes: 0 }; BASE.set(vk, b);
  b.pending = (async () => {
    const d = await getSrc();
    if (d.kind === 'compressed') { b.tex = d.tex; b.bytes = d.bytes; b.compressed = true; }
    else { const [tw, th] = fitSize(d.w, d.h, sr.maxSize || S.settings.maxSize); const est = Math.round(tw * th * 4 * 1.34); if (gpuBytes() + est > budgetBytes()) throw new Error(`texture memory budget exceeded (${(gpuBytes() / 1048576).toFixed(1)} + ${(est / 1048576).toFixed(1)} MB > ${S.settings.budgetMB} MB) — lower Max size or raise the budget`);
      const cv = await processImage(d.bmp || d.canvas, d.w, d.h, sr); b.tex = new THREE.CanvasTexture(cv); b.bytes = est; b.canvas = cv; }
  })();
  try { await b.pending; } catch (e) { BASE.delete(vk); throw e; } b.pending = null; return { vk, tex: b.tex };
}
function releaseBase(vk) { const b = BASE.get(vk); if (!b || b.pending) return; if (--b.refs > 0) return; BASE.delete(vk); b.tex.dispose(); }
export function baseCanvas(vk) { const b = BASE.get(vk); return b ? b.canvas || null : null; }
function releaseSlot(m, k) { const st = SLOTTEX.get(m); const e = st && st[k]; if (!e) return; delete st[k]; if (e.tex) e.tex.dispose(); if (e.vk) releaseBase(e.vk); }
const WRAP = { repeat: THREE.RepeatWrapping, clamp: THREE.ClampToEdgeWrapping, mirror: THREE.MirroredRepeatWrapping };
export const WRAP_NAME = (w) => (w === THREE.ClampToEdgeWrapping ? 'clamp' : w === THREE.MirroredRepeatWrapping ? 'mirror' : 'repeat');
function drawable(t) { const im = t && t.image; return !!(im && (im instanceof HTMLCanvasElement || im instanceof HTMLImageElement || (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap) || (typeof OffscreenCanvas !== 'undefined' && im instanceof OffscreenCanvas)) && im.width > 0); }
// the slot texture a rule wants for material m (async: library images decode on first use)
async function buildSlot(m, k, sr, orig) {
  const def = SLOTS.find((s) => s.k === k); const ref = orig || (k !== 'map' && ORIG.get(m)?.slots.map) || null; // UV transform: the original slot's, else the material's base map's
  let base = null, vk = null;
  if (sr.tex) { const t = S.manifest.textures[sr.tex]; const r = await acquireBase(sr.tex, () => decode(sr.tex), { ...sr, adjust: t && COMPRESSED.has(t.ext) ? null : sr.adjust }); base = r.tex; vk = r.vk; }
  else if (orig && (!identityAdjust(sr.adjust) || sr.flipGreen || sr.flipV) && drawable(orig)) { const im = orig.image; const r = await acquireBase('orig:' + orig.uuid, async () => ({ kind: 'bitmap', canvas: im, w: im.width, h: im.height }), { ...sr, maxSize: Math.max(im.width, im.height) }); base = r.tex; vk = r.vk; }
  else if (orig) base = orig; else return null; // nothing to show (no image, no original)
  const tex = base.clone(); // shares the Source → one upload
  if (ref) { tex.wrapS = ref.wrapS; tex.wrapT = ref.wrapT; tex.repeat.copy(ref.repeat); tex.offset.copy(ref.offset); tex.center.copy(ref.center); tex.rotation = ref.rotation; tex.channel = ref.channel; tex.anisotropy = Math.max(ref.anisotropy || 1, base.isCompressedTexture ? 1 : 4); if (!base.isCompressedTexture) tex.flipY = ref.flipY !== false; }
  else { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4; }
  tex.colorSpace = orig ? orig.colorSpace : def.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; if (base.isCompressedTexture) tex.colorSpace = def.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  transform(tex, sr, null);
  tex.name = 'texstudio:' + (sr.tex ? sr.tex.slice(0, 8) : 'orig') + ':' + k; tex.userData = { texStudio: true, vk }; tex.needsUpdate = true;
  return { tex, vk };
}

const heavySig = (sr) => (sr ? [sr.tex, sr.clear ? 1 : 0, sr.maxSize, sr.flipV ? 1 : 0, sr.flipGreen ? 1 : 0, adjustKey(sr.adjust)].join('|') : '');
function transform(tex, sr, ref) {
  if (ref) { tex.repeat.copy(ref.repeat); tex.offset.copy(ref.offset); tex.rotation = ref.rotation; }
  const w0 = tex.wrapS; if (sr.wrap) tex.wrapS = tex.wrapT = WRAP[sr.wrap]; if (sr.repeat) tex.repeat.set(sr.repeat[0], sr.repeat[1]); if (sr.offset) tex.offset.set(sr.offset[0], sr.offset[1]); if (sr.rotation != null) tex.rotation = (sr.rotation * Math.PI) / 180;
  if (sr.flipV && tex.isCompressedTexture) { tex.repeat.y = -tex.repeat.y; tex.offset.y = 1 - 2 * tex.center.y - tex.offset.y; } // compressed images cannot be redrawn: flip in the UV transform
  if (tex.wrapS !== w0) tex.needsUpdate = true; // wrapping is a sampler/upload setting
}
// ------------------------------------------------------------------------------------------------- applying rules
function backup(m) { let b = ORIG.get(m); if (b) return b; b = { slots: {}, props: snapProps(m), wet: null }; for (const s of SLOTS) if (s.k in m) b.slots[s.k] = m[s.k]; const w = wetTarget(m); if (w) b.wet = [w[1], w[2], w[3] ? w[3].clone() : null]; ORIG.set(m, b); return b; }
function setProp(m, k, v) { if (!(k in m) || m[k] == null && k !== 'envMapIntensity') return; const cur = m[k]; if (cur && cur.isColor) cur.set(v); else if (cur && cur.isVector2) Array.isArray(v) ? cur.set(v[0], v[1]) : cur.set(v, v); else m[k] = v; }
function restoreProps(m, props) { for (const [k, v] of Object.entries(props)) setProp(m, k, v); }
export function restoreMaterial(m) {
  const b = ORIG.get(m); if (!b) return; let prog = false;
  for (const [k, t] of Object.entries(b.slots)) { if (m[k] !== t) { if (!!m[k] !== !!t) prog = true; m[k] = t; } releaseSlot(m, k); }
  restoreProps(m, b.props); const w = b.wet && wetTarget(m); if (w) { w[1] = b.wet[0]; w[2] = b.wet[1]; w[3] = b.wet[2]; }
  if (prog) m.needsUpdate = true; APPLIED.delete(m);
}
async function applyRuleTo(m, key, r) {
  const b = backup(m); const rev = r.__rev = r.__rev || 1; const values = { slots: {}, props: {} }; APPLIED.set(m, { key, rev, values }); let prog = false;
  // settings (sync)
  restoreProps(m, b.props); const w = b.wet && wetTarget(m); if (w) { w[1] = b.wet[0]; w[2] = b.wet[1]; w[3] = b.wet[2]; }
  for (const p of PROPS) { const v = r.props[p.k]; if (v == null || !(p.k in m)) continue; setProp(m, p.k, v); values.props[p.k] = v;
    if (w && p.k === 'roughness') w[1] = +v; // weather (src/gfx/Materials.js updateMaterials) drives these: edit its dry value / tint instead of fighting it
    if (w && p.k === 'color') { const o = new THREE.Color(b.props.color), n = new THREE.Color(v); w[3] = new THREE.Color(o.r > 1e-3 ? n.r / o.r : 1, o.g > 1e-3 ? n.g / o.g : 1, o.b > 1e-3 ? n.b / o.b : 1); } }
  // slots (async)
  const st = SLOTTEX.get(m) || {}; SLOTTEX.set(m, st); const errs = [];
  for (const s of SLOTS) {
    if (!(s.k in m)) continue; const sr = r.slots[s.k]; const orig = b.slots[s.k];
    if (!sr) { if (st[s.k] || m[s.k] !== orig) { if (!!m[s.k] !== !!orig) prog = true; m[s.k] = orig; releaseSlot(m, s.k); } continue; }
    if (sr.clear) { if (m[s.k]) prog = true; m[s.k] = null; releaseSlot(m, s.k); values.slots[s.k] = null; continue; }
    const sig = JSON.stringify(sr); const e = st[s.k]; if (e && e.sig === sig && m[s.k] === e.tex) { values.slots[s.k] = e.tex; continue; }
    if (e && e.tex && m[s.k] === e.tex && heavySig(e.sr) === heavySig(sr)) { transform(e.tex, sr, orig || (s.k !== 'map' && b.slots.map) || null); e.sig = sig; e.sr = clone(sr); values.slots[s.k] = e.tex; continue; } // tiling / offset / rotation / wrap: same texture, new UV transform
    try {
      const built = await buildSlot(m, s.k, sr, orig); const a = APPLIED.get(m); if (!a || a.rev !== rev || a.key !== key) { if (built) { built.tex.dispose(); if (built.vk) releaseBase(built.vk); } return; } // superseded while loading
      releaseSlot(m, s.k); if (built) { st[s.k] = { sig, sr: clone(sr), tex: built.tex, vk: built.vk }; if (!m[s.k]) prog = true; m[s.k] = built.tex; values.slots[s.k] = built.tex; } else values.slots[s.k] = m[s.k];
    } catch (e) { errs.push(s.label + ': ' + (e.message || e)); console.warn('[texture studio]', key, s.k, e); }
  }
  if (prog) m.needsUpdate = true; if (errs.length) S.errors.set(key, errs.join('; ')); else S.errors.delete(key); emit('applied', key);
}
function checkDrift(m, k, a) {
  const d = []; for (const [p, v] of Object.entries(a.values.props)) { const cur = m[p]; const ok = cur && cur.isColor ? true : cur && cur.isVector2 ? Math.abs(cur.x - (Array.isArray(v) ? v[0] : v)) < 1e-4 : Math.abs(cur - v) < 1e-4; const w = wetTarget(m); if (!ok && !(w && p === 'roughness')) d.push(p); }
  for (const [s, t] of Object.entries(a.values.slots)) if (m[s] !== t) d.push(s);
  if (d.length) S.driven.set(k, d); else S.driven.delete(k);
}
export async function applyKey(k) {
  const r = S.manifest.rules[k];
  if (k.startsWith('veh:')) { if (r && r.enabled && S.enabled) r.__rev = (r.__rev || 0) + 1; await vehPass(k, r); emit('applied', k); return; }
  if (k.startsWith('obj:')) { if (!r) { dropObj(k); return; } ensureObj(k, r); const c = OBJ.get(k); if (c) { if (r.enabled && S.enabled) { r.__rev = (r.__rev || 0) + 1; await applyRuleTo(c.clone, k, r); } else restoreMaterial(c.clone); } return; }
  const mats = materialsFor(k);
  if (!r || !r.enabled || !S.enabled) { for (const m of mats) { const a = APPLIED.get(m); if (a && a.key === k) restoreMaterial(m); } S.errors.delete(k); S.driven.delete(k); emit('applied', k); return; }
  r.__rev = (r.__rev || 0) + 1; await Promise.all(mats.map((m) => applyRuleTo(m, k, r)));
}
// ---- vehicles: every car shares the same materials (src/vehicles/VehicleModels.js vehicleMaterials — colour is per vertex), so a
// rule for one vehicle TYPE gives that type's meshes (body, LODs, door pivots via bake.mats) a private copy of the shared
// material — the way the game itself swaps materials when a car burns (VehicleDamage.charShell). Materials a vehicle already
// owns (its own lamp / beacon copies, referenced from its userData) are edited in place so the game keeps driving them.
const CLONE_ORIG = new WeakMap(); // copy → the shared material it replaces
const VCLONE = new Map(); // key → Map(shared → copy)
let VM = null;
function sharedVehMat(m) { if (!VM) { VM = new Set(Object.values(vehicleMaterials().mats).filter((x) => x && x.isMaterial)); } return VM.has(m) || !!matKey(m); }
function vehOwned(ud, m) { for (const v of Object.values(ud)) { if (v === m) return true; if (v && typeof v === 'object' && !v.isObject3D && (v.blue === m || v.red === m)) return true; } return false; }
export function vehPart(o, i) { return (o.name || '#' + i) + (Array.isArray(o.material) && o.material.length > 1 ? '#' + i : ''); }
function cloneMat(orig, k) {
  const ud = orig.userData; orig.userData = {}; let c; try { c = orig.clone(); } finally { orig.userData = ud; }
  c.onBeforeCompile = orig.onBeforeCompile; c.customProgramCacheKey = orig.customProgramCacheKey; c.userData = Object.assign({}, ud, { __tsKey: k }); c.name = orig.name;
  const b = ORIG.get(orig); if (b) { for (const [sk, t] of Object.entries(b.slots)) c[sk] = t; restoreProps(c, b.props); } // start from the game's original, not from another rule's edits
  CLONE_ORIG.set(c, orig); SEEN.set(c, k); return c;
}
function vehicleRoots(type) { const out = []; const walk = (o) => { for (const c of o.children) { if (c.userData && c.userData.seats && c.userData.type) { if (c.userData.type === type) out.push(c); } else if (c.children.length && !c.isMesh) walk(c); } }; if (S.game && S.game.scene) walk(S.game.scene); return out; }
// values the game animates on the SHARED material (night glow of dashboards / windows, fades) follow on the copy unless the rule sets them
const DRIVEN = ['emissiveIntensity', 'envMapIntensity', 'opacity'];
function syncDriven(orig, c, r) { for (const p of DRIVEN) if (p in orig && (!r || r.props[p] == null) && c[p] !== orig[p]) c[p] = orig[p]; if (orig.emissive && c.emissive && (!r || r.props.emissive == null)) c.emissive.copy(orig.emissive); if (orig.visible !== c.visible) c.visible = orig.visible; }
function setMeshMat(o, i, mat) { if (Array.isArray(o.material)) { o.material = o.material.slice(); o.material[i] = mat; } else o.material = mat; }
async function vehPass(k, r) {
  const parts = k.split(':'); const type = parts[1], part = parts.slice(2).join(':'); const on = !!(r && r.enabled && S.enabled); const targets = new Set();
  let copies = VCLONE.get(k); if (on && !copies) VCLONE.set(k, (copies = new Map())); const copyOf = (m) => { let c = copies.get(m); if (!c) copies.set(m, (c = cloneMat(m, k))); return c; };
  for (const root of vehicleRoots(type)) {
    const ud = root.userData;
    const visit = (o) => { if (!o.isMesh || !o.material) return; const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < ms.length; i++) { const m = ms[i]; if (!m || vehPart(o, i) !== part) continue;
        if (!on) { if (m.userData && m.userData.__tsKey === k && CLONE_ORIG.has(m)) setMeshMat(o, i, CLONE_ORIG.get(m)); else { const a = APPLIED.get(m); if (a && a.key === k) restoreMaterial(m); } continue; }
        if (m.userData && m.userData.__tsKey === k) { targets.add(m); continue; }
        if (vehOwned(ud, m)) { targets.add(m); continue; } // its own lamp / beacon material
        if (CLONE_ORIG.has(m) || !sharedVehMat(m)) continue; // another rule's copy, or a burnt-out shell
        const c = copyOf(m); setMeshMat(o, i, c); targets.add(c); } };
    root.traverse(visit); for (const grp of [ud.detail, ud.real && ud.real.mid, ud.real && ud.real.low]) if (grp && grp.traverse) grp.traverse(visit);
    if (ud.bake && ud.bake.meshes) for (const mm of Object.values(ud.bake.meshes)) if (mm && mm.isMesh) visit(mm);
    const bm = ud.bake && ud.bake.mats; const pn = part.replace(/#\d+$/, ''); if (bm && bm[pn]) { const m = bm[pn]; if (on && !CLONE_ORIG.has(m) && sharedVehMat(m)) bm[pn] = copyOf(m); else if (!on && m.userData && m.userData.__tsKey === k && CLONE_ORIG.has(m)) bm[pn] = CLONE_ORIG.get(m); } // door pivots built later
  }
  if (!on) { if (copies) { for (const c of copies.values()) { restoreMaterial(c); c.dispose(); } VCLONE.delete(k); } S.errors.delete(k); S.driven.delete(k); return; }
  for (const [m, c] of copies) syncDriven(m, c, r);
  await Promise.all([...targets].map((m) => { const a = APPLIED.get(m); return !a || a.key !== k || a.rev !== r.__rev ? applyRuleTo(m, k, r) : (checkDrift(m, k, a), null); }));
}
// "Make unique": a private copy of the material for one static object (others keep the shared one)
const OBJ = new Map(); // key → { mesh, slot, orig, clone }
export function objKey(mesh, slot) { return 'obj:' + pathOf(mesh) + '|' + slot; }
export function canMakeUnique(mesh) { return !!mesh && (mesh.isMesh || mesh.isInstancedMesh) && !mesh.isBatchedMesh && !mesh.isSkinnedMesh && !vehOf(mesh); }
export function makeUnique(mesh, slot) {
  const k = objKey(mesh, slot); if (OBJ.has(k)) return k; const arr = Array.isArray(mesh.material); const orig = arr ? mesh.material[slot] : mesh.material;
  const c = cloneMat(orig, k); c.needsUpdate = true;
  if (arr) { mesh.material = mesh.material.slice(); mesh.material[slot] = c; } else mesh.material = c;
  OBJ.set(k, { mesh, slot, orig, clone: c }); return k;
}
function ensureObj(k, r) {
  if (OBJ.has(k)) return; const t = r.target || {}; const m = k.match(/^obj:(.*)\|(\d+)$/); if (!m) return; const mesh = resolvePath(m[1]); const slot = +m[2];
  if (!mesh || !mesh.material) return; if (t.fp && fingerprint(mesh, slot) !== t.fp) { S.errors.set(k, 'object not found (the scene changed: fingerprint ' + t.fp + ')'); return; }
  makeUnique(mesh, slot); if (r.enabled && S.enabled) applyRuleTo(OBJ.get(k).clone, k, r);
}
function dropObj(k) { const o = OBJ.get(k); if (!o) return; OBJ.delete(k); restoreMaterial(o.clone); const { mesh, slot, orig } = o; if (Array.isArray(mesh.material)) { mesh.material = mesh.material.slice(); mesh.material[slot] = orig; } else mesh.material = orig; o.clone.dispose(); }
export function objFingerprint(mesh, slot) { return fingerprint(mesh, slot); }

// ------------------------------------------------------------------------------------------------- rules + undo / redo
const H = { undo: [], redo: [], max: 200 };
export const history = H;
export function getRule(k) { return S.manifest.rules[k] || null; }
export function newRule(k, label, target) { return { label, target: target || null, enabled: true, slots: {}, props: {}, created: new Date().toISOString(), modified: null }; }
function strip(r) { if (!r) return null; const c = clone(r); delete c.__rev; return c; }
export async function setRule(k, r, { label = 'edit', merge = null, record = true } = {}) {
  const before = strip(S.manifest.rules[k]); const after = strip(r);
  if (record) { const last = H.undo[H.undo.length - 1]; if (merge && last && last.k === k && last.merge === merge && performance.now() - last.t < 900) { last.after = after; last.t = performance.now(); } else { H.undo.push({ k, before, after, label, merge, t: performance.now() }); if (H.undo.length > H.max) H.undo.shift(); } H.redo.length = 0; }
  await writeRule(k, after);
}
async function writeRule(k, r) {
  if (r) { r.modified = new Date().toISOString(); const old = S.manifest.rules[k]; r.__rev = old ? old.__rev || 0 : 0; S.manifest.rules[k] = r; } else delete S.manifest.rules[k];
  S.manifest.modified = new Date().toISOString(); scheduleSave(); await applyKey(k); emit('rules', k);
}
export async function undo() { const e = H.undo.pop(); if (!e) return null; H.redo.push(e); if (e.batch) { for (const b of e.batch) await writeRule(b.k, clone(b.before)); } else await writeRule(e.k, clone(e.before)); return e; }
export async function redo() { const e = H.redo.pop(); if (!e) return null; H.undo.push(e); if (e.batch) { for (const b of e.batch) await writeRule(b.k, clone(b.after)); } else await writeRule(e.k, clone(e.after)); return e; }
export async function restoreAll() { const keys = Object.keys(S.manifest.rules); const batch = keys.map((k) => ({ k, before: strip(S.manifest.rules[k]), after: null, label: 'restore all' })); for (const k of keys) await writeRule(k, null); if (batch.length) { H.undo.push({ batch, label: 'restore all', t: performance.now(), k: '*' }); H.redo.length = 0; } return keys.length; }
export async function setEnabled(v) { S.enabled = !!v; for (const k of Object.keys(S.manifest.rules)) await applyKey(k); emit('rules'); }

// ------------------------------------------------------------------------------------------------- persistence
let saveT = 0, savingP = null;
function scheduleSave() { if (!S.backend || !S.backend.writable) return; S.saveState = 'unsaved'; emit('save'); clearTimeout(saveT); saveT = setTimeout(() => saveNow(), 700); }
export async function saveNow() {
  clearTimeout(saveT); if (!S.backend || !S.backend.writable) throw new Error('storage is read-only'); if (savingP) await savingP;
  S.saveState = 'saving'; emit('save'); const m = exportManifest(true);
  savingP = (async () => { try { await S.backend.saveManifest(m); setSavedFlag('textures', Object.keys(m.rules).length > 0 || Object.keys(m.textures).length > 0); S.saveState = 'saved'; S.lastSaveError = ''; } catch (e) { S.saveState = 'error'; S.lastSaveError = e.message || String(e); throw e; } finally { savingP = null; emit('save'); } })();
  return savingP;
}
export function exportManifest(withThumbs = true) { const m = clone(S.manifest); for (const r of Object.values(m.rules)) delete r.__rev; if (!withThumbs) for (const t of Object.values(m.textures)) delete t.thumb; m.format = MANIFEST_FORMAT; m.version = MANIFEST_VERSION; return m; }
export function assignments(hash) { const out = []; for (const [k, r] of Object.entries(S.manifest.rules)) for (const [s, sr] of Object.entries(r.slots)) if (sr.tex === hash) out.push({ k, slot: s, label: r.label }); return out; }

// library: import a file (content hash → dedupe), keep the ORIGINAL bytes (resizing happens per use, never destructively)
export async function importFile(file, { category = 'Other', name } = {}) {
  if (!S.backend || !S.backend.writable) throw new Error('storage is read-only in this build');
  const buf = await file.arrayBuffer(); if (buf.byteLength > 64 * 1048576) throw new Error('file larger than 64 MB'); const fmt = sniffFormat(new Uint8Array(buf, 0, Math.min(64, buf.byteLength)));
  if (!fmt) throw new Error('unsupported file (PNG, JPEG, WEBP, GIF, AVIF, BMP, KTX2 or DDS)');
  const hash = await hashBytes(buf); if (S.manifest.textures[hash]) return { hash, dup: true, meta: S.manifest.textures[hash] };
  const blob = new Blob([buf], { type: MIME[fmt] }); const d = await decodeBlob(blob, fmt);
  const meta = { name: (name || file.name || hash).slice(0, 120), category: CATEGORIES.includes(category) ? category : 'Other', tags: [], w: d.w, h: d.h, ext: fmt, bytes: buf.byteLength, added: new Date().toISOString(), thumb: makeThumb(d, fmt) };
  await S.backend.putFile(hash + '.' + fmt, blob); // the file is stored before it is referenced
  S.manifest.textures[hash] = meta; DECODED.set(hash, Promise.resolve(d)); S.manifest.modified = new Date().toISOString(); scheduleSave(); emit('library', hash); return { hash, dup: false, meta };
}
export function makeThumb(d, fmt) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 72; const g = cv.getContext('2d'); g.fillStyle = '#1b1f27'; g.fillRect(0, 0, 72, 72);
  if (d.kind === 'bitmap') { const s = Math.min(72 / d.w, 72 / d.h); const w = d.w * s, h = d.h * s; g.drawImage(d.bmp, (72 - w) / 2, (72 - h) / 2, w, h); }
  else { g.fillStyle = '#e0a030'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText(fmt.toUpperCase(), 36, 34); g.fillStyle = '#9aa3b0'; g.font = '11px sans-serif'; g.fillText(d.w + '×' + d.h, 36, 52); }
  return cv.toDataURL('image/jpeg', 0.72);
}
export async function removeTexture(hash) { if (assignments(hash).length) throw new Error('still assigned — clear those slots first'); const t = S.manifest.textures[hash]; if (!t) return; delete S.manifest.textures[hash]; DECODED.delete(hash); scheduleSave(); try { await S.backend.deleteFile(hash + '.' + t.ext); } catch { /* kept */ } emit('library', hash); }
export function updateTexture(hash, patch) { const t = S.manifest.textures[hash]; if (!t) return; Object.assign(t, patch); scheduleSave(); emit('library', hash); }
export async function getDecoded(hash) { return decode(hash); }

// import a manifest (+ its files from a pack); mode 'merge' keeps existing rules that the import does not touch
export async function importManifest(raw, files = new Map(), mode = 'merge') {
  const m = sanitizeManifest(raw); let added = 0, missing = [];
  for (const [h, t] of Object.entries(m.textures)) { const name = h + '.' + t.ext; const f = files.get(name) || files.get('textures/' + name);
    if (f) { const got = await hashBytes(await f.arrayBuffer()); if (got !== h && got.length === h.length) throw new Error('pack file ' + name + ' does not match its hash'); await S.backend.putFile(name, f); added++; }
    else if (!S.manifest.textures[h] && !m.assetBase) missing.push(name);
    if (!S.manifest.textures[h]) S.manifest.textures[h] = t; }
  const before = Object.keys(S.manifest.rules);
  if (mode === 'replace') for (const k of before) if (!m.rules[k]) await setRule(k, null, { label: 'import (replace)' });
  for (const [k, r] of Object.entries(m.rules)) await setRule(k, r, { label: 'import' });
  if (m.assetBase && !S.manifest.assetBase) S.manifest.assetBase = m.assetBase;
  scheduleSave(); emit('library'); return { rules: Object.keys(m.rules).length, files: added, missing };
}
export function setAssetBase(url) { S.manifest.assetBase = String(url || '').trim(); DECODED.clear(); scheduleSave(); emit('library'); }

// ------------------------------------------------------------------------------------------------- boot
let timer = 0;
export async function boot(game, { pack = null } = {}) {
  S.game = game; if (S.ready) return S;
  let m = null;
  if (TEXTURE_STUDIO) { try { m = await FolderBackend.init(); S.backend = FolderBackend; } catch { m = await IdbBackend.init(); S.backend = IdbBackend; } if (!m && pack && pack.rules) m = pack; }
  else { S.backend = PackBackend; m = pack; }
  if (m) try { S.manifest = sanitizeManifest(m); } catch (e) { console.warn('[texture studio] manifest ignored:', e.message); S.manifest = emptyManifest(); }
  S.ready = true; scan(); const keys = Object.keys(S.manifest.rules);
  if (keys.length) await Promise.race([Promise.all(keys.map((k) => applyKey(k))), new Promise((r) => setTimeout(r, 4000))]); // loading keeps going after 4 s
  if (!timer) timer = setInterval(() => { if (Object.keys(S.manifest.rules).length || studioOpen) scan(); }, 1500);
  if (keys.length) console.info(`[texture studio] ${keys.length} texture/material replacement(s) applied from ${S.backend.label}`);
  return S;
}
let studioOpen = false; export function setStudioOpen(v) { studioOpen = !!v; }
