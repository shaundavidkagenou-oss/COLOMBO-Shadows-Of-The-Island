// Environment editor (console `paint`) — the project / scene data format, shared by the browser (editor + game runtime)
// and Node (tools/vite/paintPack.mjs: dev-server saves, COMPILE, the production build; tools/paint-pack-prep.mjs in
// build-exe.bat). Pure JavaScript: no three.js, no DOM, so every side validates and packs the data the same way.
//
// paint-pack/ (project folder, next to model-pack/ and texture-pack/; out of git like them):
//   project.json            colombo.paint-project — the editor's document: assets (+ per-material PBR settings), layers,
//                           every placed / painted instance, brush presets, editor settings. Relative paths only.
//   assets/<sha256>.<ext>   imported files byte-for-byte (models, .bin buffers, textures), content-addressed
//   backups/                the previous project.json on every save (last 40)
//   compiled/scene.json     colombo.paint-scene — what COMPILE produced (runtime data: visible layers only, no thumbnails)
//   compiled/report.json    the last COMPILE report
// The production build (npm run build / build-exe.bat) compiles the saved project again and ships scene.json plus every file it
// references in dist/paint-pack/ → the .exe loads it at start (src/debug/PaintRuntime.js), exactly as placed.

export const PROJECT_FORMAT = 'colombo.paint-project';
export const SCENE_FORMAT = 'colombo.paint-scene';
export const EXPORT_FORMAT = 'colombo.paint-export';
export const VERSION = 1;
export const MODEL_EXTS = ['glb', 'gltf', 'obj', 'fbx'];
export const IMAGE_EXTS = ['png', 'jpg', 'webp', 'avif', 'gif', 'bmp', 'tga'];
export const SIDE_EXTS = ['bin', 'mtl'];
export const ALL_EXTS = [...MODEL_EXTS, ...SIDE_EXTS, ...IMAGE_EXTS];
export const FILE_RE = new RegExp('^[0-9a-f]{64}\\.(' + ALL_EXTS.join('|') + ')$');
export const extOf = (n) => { const e = String(n).toLowerCase().split('.').pop(); return e === 'jpeg' ? 'jpg' : e; };
export const baseName = (n) => String(n).split(/[\\/]/).pop();

// ---------------------------------------------------------------- layers
// kind = the default render profile of assets in it (draw distance, LOD, shadows, wind, collision)
export const DEFAULT_LAYERS = [
  { id: 'grass', name: 'Grass', kind: 'grass', color: '#7fbf4a' },
  { id: 'smallplants', name: 'Small plants', kind: 'plant', color: '#5fa86a' },
  { id: 'bushes', name: 'Bushes', kind: 'bush', color: '#3f8f4f' },
  { id: 'trees', name: 'Trees', kind: 'tree', color: '#2f7a3a' },
  { id: 'rocks', name: 'Rocks', kind: 'rock', color: '#9a948a' },
  { id: 'moss', name: 'Moss', kind: 'plant', color: '#6f9a3a' },
  { id: 'flowers', name: 'Flowers', kind: 'plant', color: '#e07ab0' },
  { id: 'props', name: 'Environmental props', kind: 'prop', color: '#c8a060' },
  { id: 'custom', name: 'Custom', kind: 'prop', color: '#7aa0e0' },
];
// render profile per kind: draw = draw distance (m), lod = switch to the simplified mesh (m), lodRatio = triangles kept,
// shadow = casts sun shadows, shadowDist = shadow casting distance (m), thin = far instances thinned out (ground cover),
// wind = sway (0 … 1), solid = blocks the player / vehicles (box collider), colScale = collider footprint ÷ model footprint
// (a tree blocks at its trunk, not its crown)
export const KIND_RENDER = {
  grass: { draw: 110, lod: 35, lodRatio: 0.4, shadow: false, shadowDist: 0, thin: true, wind: 0.6, solid: false, colScale: 1 },
  plant: { draw: 150, lod: 45, lodRatio: 0.4, shadow: true, shadowDist: 40, thin: true, wind: 0.4, solid: false, colScale: 1 },
  bush: { draw: 260, lod: 70, lodRatio: 0.35, shadow: true, shadowDist: 80, thin: false, wind: 0.25, solid: false, colScale: 1 },
  tree: { draw: 650, lod: 120, lodRatio: 0.3, shadow: true, shadowDist: 220, thin: false, wind: 0.15, solid: true, colScale: 0.15 },
  rock: { draw: 320, lod: 80, lodRatio: 0.35, shadow: true, shadowDist: 90, thin: false, wind: 0, solid: true, colScale: 0.85 },
  prop: { draw: 360, lod: 100, lodRatio: 0.4, shadow: true, shadowDist: 120, thin: false, wind: 0, solid: true, colScale: 0.9 },
};
export const layerKind = (layers, id) => { const l = (layers || []).find((q) => q.id === id); return (l && KIND_RENDER[l.kind] && l.kind) || 'prop'; };
export const defaultRender = (kind) => ({ ...(KIND_RENDER[kind] || KIND_RENDER.prop) });

// ---------------------------------------------------------------- materials
// one per material slot of an asset. Map slots: null = none, { src: 'model' } = the texture inside the model file,
// { file: '<sha>.<ext>' } = an imported image. Colour maps (base, emissive) are sRGB; every other map is linear data.
export const MAP_SLOTS = ['base', 'normal', 'ao', 'rough', 'metal', 'height', 'alpha', 'emissive'];
export const COLOR_SLOTS = new Set(['base', 'emissive']);
export const MAP_LABEL = { base: 'Base colour', normal: 'Normal', ao: 'Ambient occlusion', rough: 'Roughness', metal: 'Metallic', height: 'Height / displacement', alpha: 'Opacity / alpha', emissive: 'Emissive' };
export const defaultMaterial = (name = 'material') => ({
  name, color: '#ffffff', maps: { base: null, normal: null, ao: null, rough: null, metal: null, height: null, alpha: null, emissive: null },
  repeat: [1, 1], offset: [0, 0], rotation: 0, // UV tiling (all maps), degrees
  roughness: 1, metalness: 0, normalScale: 1, normalFlipY: false, aoIntensity: 1, displacementScale: 0, displacementBias: 0,
  emissive: '#000000', emissiveIntensity: 1, opacity: 1, alphaMode: 'opaque', alphaTest: 0.5, alphaToCoverage: false, side: 'front',
  hue: 0, saturation: 1, brightness: 1, contrast: 1, // colour adjustments on the base colour (degrees, ×, ×, ×)
  filter: 'trilinear', anisotropy: 8, maxSize: 2048, flipY: null, // null = the model format's convention (glTF: false)
});
const num = (v, d, lo = -Infinity, hi = Infinity) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
const oneOf = (v, opts, d) => (opts.includes(v) ? v : d);
const mapRef = (v) => (v && typeof v === 'object' ? (v.src === 'model' ? { src: 'model' } : typeof v.file === 'string' && FILE_RE.test(v.file) ? { file: v.file } : null) : null);
export function cleanMaterial(m, name) {
  const d = defaultMaterial(name || (m && m.name) || 'material'); if (!m || typeof m !== 'object') return d;
  const o = { ...d, name: typeof m.name === 'string' ? m.name.slice(0, 120) : d.name };
  o.color = hex(m.color, d.color); o.maps = {}; for (const s of MAP_SLOTS) o.maps[s] = mapRef(m.maps && m.maps[s]);
  o.repeat = [num(m.repeat && m.repeat[0], 1, -1000, 1000), num(m.repeat && m.repeat[1], 1, -1000, 1000)]; o.offset = [num(m.offset && m.offset[0], 0), num(m.offset && m.offset[1], 0)]; o.rotation = num(m.rotation, 0, -360, 360);
  o.roughness = num(m.roughness, 1, 0, 1); o.metalness = num(m.metalness, 0, 0, 1); o.normalScale = num(m.normalScale, 1, -8, 8); o.normalFlipY = !!m.normalFlipY; o.aoIntensity = num(m.aoIntensity, 1, 0, 4);
  o.displacementScale = num(m.displacementScale, 0, -10, 10); o.displacementBias = num(m.displacementBias, 0, -10, 10);
  o.emissive = hex(m.emissive, d.emissive); o.emissiveIntensity = num(m.emissiveIntensity, 1, 0, 50); o.opacity = num(m.opacity, 1, 0, 1);
  o.alphaMode = oneOf(m.alphaMode, ['opaque', 'mask', 'blend'], 'opaque'); o.alphaTest = num(m.alphaTest, 0.5, 0, 1); o.alphaToCoverage = !!m.alphaToCoverage; o.side = oneOf(m.side, ['front', 'double'], 'front');
  o.hue = num(m.hue, 0, -180, 180); o.saturation = num(m.saturation, 1, 0, 3); o.brightness = num(m.brightness, 1, 0, 4); o.contrast = num(m.contrast, 1, 0, 3);
  o.filter = oneOf(m.filter, ['trilinear', 'bilinear', 'nearest'], 'trilinear'); o.anisotropy = num(m.anisotropy, 8, 1, 16) | 0; o.maxSize = oneOf(+m.maxSize, [256, 512, 1024, 2048, 4096], 2048); o.flipY = m.flipY === true || m.flipY === false ? m.flipY : null;
  o.mapNames = {}; for (const s of MAP_SLOTS) { const n = m.mapNames && m.mapNames[s]; if (o.maps[s] && o.maps[s].file && typeof n === 'string') o.mapNames[s] = baseName(n).slice(0, 120); } // original file names (display only)
  return o;
}
export function materialFiles(m) { const out = []; for (const s of MAP_SLOTS) { const r = m && m.maps && m.maps[s]; if (r && r.file) out.push(r.file); } return out; }

// ---------------------------------------------------------------- assets
export function cleanAsset(a, layers) {
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(a.id)) return null;
  const files = {}; for (const [k, v] of Object.entries((a.file && a.file.files) || {})) if (typeof v === 'string' && FILE_RE.test(v)) files[baseName(k).slice(0, 200)] = v;
  const main = a.file && typeof a.file.main === 'string' && FILE_RE.test(a.file.main) ? a.file.main : null;
  const layer = (layers || []).some((l) => l.id === a.layer) ? a.layer : 'custom'; const kind = layerKind(layers, layer); const R = defaultRender(kind), r = a.render || {};
  return {
    id: a.id, name: typeof a.name === 'string' ? a.name.slice(0, 120) : a.id, layer, file: { main, files, name: (a.file && typeof a.file.name === 'string' && a.file.name.slice(0, 200)) || '' },
    import: { scale: num(a.import && a.import.scale, 1, 1e-4, 1e4), pivot: oneOf(a.import && a.import.pivot, ['ground', 'center', 'origin'], 'ground'), upZ: !!(a.import && a.import.upZ) },
    render: { draw: num(r.draw, R.draw, 5, 5000), lod: num(r.lod, R.lod, 0, 5000), lodRatio: num(r.lodRatio, R.lodRatio, 0.02, 1), shadow: r.shadow == null ? R.shadow : !!r.shadow, shadowDist: num(r.shadowDist, R.shadowDist, 0, 2000), thin: r.thin == null ? R.thin : !!r.thin, wind: num(r.wind, R.wind, 0, 1), solid: r.solid == null ? R.solid : !!r.solid, colScale: num(r.colScale, R.colScale, 0.02, 2) },
    materials: Array.isArray(a.materials) ? a.materials.slice(0, 64).map((m, i) => cleanMaterial(m, 'material ' + (i + 1))) : [],
    stats: a.stats && typeof a.stats === 'object' ? { tris: num(a.stats.tris, 0) | 0, mats: num(a.stats.mats, 0) | 0, size: Array.isArray(a.stats.size) ? a.stats.size.slice(0, 3).map((v) => num(v, 0)) : [1, 1, 1] } : { tris: 0, mats: 0, size: [1, 1, 1] },
    thumb: typeof a.thumb === 'string' && a.thumb.startsWith('data:image/') && a.thumb.length < 200000 ? a.thumb : null,
    added: typeof a.added === 'string' ? a.added : null,
  };
}
export function assetFiles(a) { const s = new Set(); if (a.file.main) s.add(a.file.main); for (const v of Object.values(a.file.files || {})) s.add(v); for (const m of a.materials || []) for (const f of materialFiles(m)) s.add(f); return [...s]; }

// ---------------------------------------------------------------- instances
// in memory: { u: uid, a: asset id, l: layer id, p: [x, y, z], r: [rx, ry, rz] (radians, order YXZ), s: [sx, sy, sz],
//              c: colour variation (−1 … 1), t: tint '#rrggbb' | null, k: 1 = painted by the brush, 0 = placed }
// on disk: grouped by (asset, layer): { a, l, n, f: base64 Float32 × STRIDE·n, u: base64 Uint32 × n, k: base64 Uint8 × n }
export const STRIDE = 11; // x y z rx ry rz sx sy sz c tint(24-bit int, −1 = none)
const B64 = typeof Buffer !== 'undefined' ? { enc: (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64'), dec: (s) => new Uint8Array(Buffer.from(s, 'base64')) }
  : { enc: (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }, dec: (s) => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; } };
const tintToInt = (t) => (typeof t === 'string' && /^#[0-9a-f]{6}$/i.test(t) ? parseInt(t.slice(1), 16) : -1);
const intToTint = (v) => (v >= 0 ? '#' + (v | 0).toString(16).padStart(6, '0') : null);
export function packInstances(list) {
  const groups = new Map(); for (const o of list) { const k = o.a + '\u0000' + o.l; let g = groups.get(k); if (!g) groups.set(k, (g = [])); g.push(o); }
  const out = [];
  for (const g of groups.values()) { const n = g.length; const f = new Float32Array(n * STRIDE), u = new Uint32Array(n), k = new Uint8Array(n);
    g.forEach((o, i) => { const q = i * STRIDE; f[q] = o.p[0]; f[q + 1] = o.p[1]; f[q + 2] = o.p[2]; f[q + 3] = o.r[0]; f[q + 4] = o.r[1]; f[q + 5] = o.r[2]; f[q + 6] = o.s[0]; f[q + 7] = o.s[1]; f[q + 8] = o.s[2]; f[q + 9] = o.c || 0; f[q + 10] = tintToInt(o.t); u[i] = o.u >>> 0; k[i] = o.k ? 1 : 0; });
    out.push({ a: g[0].a, l: g[0].l, n, f: B64.enc(new Uint8Array(f.buffer)), u: B64.enc(new Uint8Array(u.buffer)), k: B64.enc(k) }); }
  return out;
}
// → { list, bad } (bad = instances dropped: non-finite numbers, unknown asset / layer when the sets are given)
export function unpackInstances(groups, assetIds = null, layerIds = null) {
  const list = []; let bad = 0;
  for (const g of Array.isArray(groups) ? groups : []) {
    if (!g || typeof g.a !== 'string' || typeof g.l !== 'string' || !(g.n >= 0)) { bad++; continue; }
    if ((assetIds && !assetIds.has(g.a)) || (layerIds && !layerIds.has(g.l))) { bad += g.n | 0; continue; }
    let f, u, k; try { const fb = B64.dec(g.f), ub = B64.dec(g.u), kb = B64.dec(g.k || ''); f = new Float32Array(fb.buffer, fb.byteOffset, fb.byteLength >> 2); u = new Uint32Array(ub.buffer.slice(ub.byteOffset, ub.byteOffset + ub.byteLength)); k = kb; } catch { bad += g.n | 0; continue; }
    if (f.length < g.n * STRIDE || u.length < g.n) { bad += g.n | 0; continue; }
    for (let i = 0; i < g.n; i++) { const q = i * STRIDE; let ok = true; for (let j = 0; j < STRIDE; j++) if (!Number.isFinite(f[q + j])) { ok = false; break; } if (!ok) { bad++; continue; }
      list.push({ u: u[i], a: g.a, l: g.l, p: [f[q], f[q + 1], f[q + 2]], r: [f[q + 3], f[q + 4], f[q + 5]], s: [f[q + 6], f[q + 7], f[q + 8]], c: f[q + 9], t: intToTint(f[q + 10]), k: k[i] ? 1 : 0 }); }
  }
  return { list, bad };
}
export const countInstances = (groups) => (Array.isArray(groups) ? groups.reduce((n, g) => n + ((g && g.n) | 0), 0) : 0);

// ---------------------------------------------------------------- brush (editor settings; saved in project.editor.brush and presets)
export const BRUSH_DEFAULTS = { mode: 'paint', layer: 'auto', mix: [], radius: 10, density: 2, spacing: 0.35, maxPerDab: 400, rot: 360, tilt: 6, align: 0.6, scaleMin: 0.8, scaleMax: 1.25, heightVar: 0.15, sinkMin: 0, sinkMax: 0.03, jitter: 0, colorVar: 0.5,
  slopeMin: 0, slopeMax: 40, hMin: -5, hMax: 200, avoidWater: true, avoidRoads: true, avoidBuildings: true, eraseScope: 'mix', strength: 1 };

// ---------------------------------------------------------------- project
export function emptyProject() {
  return { format: PROJECT_FORMAT, version: VERSION, created: null, modified: null, assets: {}, layers: DEFAULT_LAYERS.map((l) => ({ ...l, visible: true, locked: false, custom: false })), instances: [], brushes: [], editor: {} };
}
export function cleanLayers(L) {
  const out = []; const seen = new Set();
  for (const d of DEFAULT_LAYERS) { const l = (Array.isArray(L) ? L : []).find((q) => q && q.id === d.id) || {}; out.push({ ...d, name: typeof l.name === 'string' && l.name.trim() ? l.name.slice(0, 60) : d.name, visible: l.visible !== false, locked: !!l.locked, custom: false }); seen.add(d.id); }
  for (const l of Array.isArray(L) ? L : []) { if (!l || typeof l.id !== 'string' || seen.has(l.id) || !/^[a-z0-9_-]{1,40}$/i.test(l.id)) continue; seen.add(l.id);
    out.push({ id: l.id, name: typeof l.name === 'string' ? l.name.slice(0, 60) : l.id, kind: KIND_RENDER[l.kind] ? l.kind : 'prop', color: hex(l.color, '#7aa0e0'), visible: l.visible !== false, locked: !!l.locked, custom: true }); }
  return out;
}
// any project-like object → a valid project (+ notes on what was repaired / dropped). Never throws.
export function normalizeProject(p) {
  const notes = []; const out = emptyProject(); if (!p || typeof p !== 'object') { notes.push('not a project — started empty'); return { project: out, notes }; }
  if (p.format !== PROJECT_FORMAT) notes.push('unknown format "' + p.format + '"');
  if (p.version > VERSION) notes.push('made by a newer editor (v' + p.version + ') — loaded what this version understands');
  out.created = typeof p.created === 'string' ? p.created : null; out.modified = typeof p.modified === 'string' ? p.modified : null;
  out.layers = cleanLayers(p.layers); const layerIds = new Set(out.layers.map((l) => l.id));
  for (const [id, a] of Object.entries(p.assets || {})) { const c = cleanAsset({ ...a, id }, out.layers); if (c) out.assets[id] = c; else notes.push('asset "' + id + '" dropped (invalid)'); }
  const assetIds = new Set(Object.keys(out.assets)); const { list, bad } = unpackInstances(p.instances, assetIds, layerIds);
  if (bad) notes.push(bad + ' instance(s) dropped (unknown asset / layer or invalid numbers)');
  out.instances = packInstances(list); out.brushes = Array.isArray(p.brushes) ? p.brushes.filter((b) => b && typeof b.name === 'string' && b.settings && typeof b.settings === 'object').slice(0, 200) : [];
  out.editor = p.editor && typeof p.editor === 'object' ? p.editor : {};
  return { project: out, notes, list };
}
// every file the project needs
export function projectFiles(p) { const s = new Set(); for (const a of Object.values(p.assets || {})) for (const f of assetFiles(a)) s.add(f); return s; }

// ---------------------------------------------------------------- compile (Node + browser): project → runtime scene + report
// fileInfo(name) → { exists, sha?: true|false (content matches its name), text?: () => string (for .gltf), json?: () => object (glb JSON chunk) } | null
export function compileProject(raw, fileInfo) {
  const errors = [], warnings = []; const { project: p, notes } = normalizeProject(raw); for (const n of notes) warnings.push(n);
  const visible = new Set(p.layers.filter((l) => l.visible).map((l) => l.id)); const hiddenN = p.instances.filter((g) => !visible.has(g.l)).reduce((n, g) => n + g.n, 0);
  if (hiddenN) warnings.push(hiddenN + ' instance(s) on hidden layers are not compiled (show the layer to include them)');
  const used = new Set(p.instances.filter((g) => visible.has(g.l)).map((g) => g.a)); const files = new Set(); const assets = {};
  for (const id of used) {
    const a = p.assets[id]; const label = 'asset "' + a.name + '"';
    if (!a.file.main) { errors.push(label + ': no model file'); continue; }
    const need = assetFiles(a); let ok = true;
    for (const f of need) { const i = fileInfo(f); if (!i || !i.exists) { errors.push(label + ': file missing from paint-pack/assets: ' + f + (origName(a, f) ? ' (' + origName(a, f) + ')' : '')); ok = false; } else if (i.sha === false) { errors.push(label + ': file damaged (content does not match its name): ' + f); ok = false; } }
    // external references inside glTF (buffers, images) must all be part of the asset
    const ext = extOf(a.file.main); const mi = fileInfo(a.file.main);
    if (mi && mi.exists && (ext === 'gltf' || ext === 'glb')) { try { const j = ext === 'gltf' ? JSON.parse(mi.text()) : mi.json(); const have = new Set(Object.keys(a.file.files).map((k) => k.toLowerCase()));
      for (const r of [...(j.buffers || []), ...(j.images || [])]) { if (!r || !r.uri || /^data:/.test(r.uri)) continue; const b = decodeURIComponent(baseName(r.uri)).toLowerCase(); if (!have.has(b)) { errors.push(label + ': the model references "' + r.uri + '" but that file was not imported with it'); ok = false; } }
      if ((j.extensionsRequired || []).some((e) => !['KHR_materials_emissive_strength', 'KHR_texture_transform', 'KHR_mesh_quantization', 'EXT_meshopt_compression', 'KHR_materials_unlit', 'KHR_materials_ior', 'KHR_materials_specular', 'KHR_draco_mesh_compression'].includes(e))) warnings.push(label + ': requires glTF extensions ' + j.extensionsRequired.join(', ') + ' — check it in the editor');
      if ((j.extensionsRequired || []).includes('KHR_draco_mesh_compression')) { errors.push(label + ': Draco-compressed glTF is not supported — re-export it without Draco (meshopt compression or none)'); ok = false; }
    } catch (e) { errors.push(label + ': model file unreadable (' + ((e && e.message) || e) + ')'); ok = false; } }
    if (!a.materials.length) warnings.push(label + ': no material settings recorded (the model\'s own materials are used)');
    if (!ok) continue;
    for (const f of need) files.add(f);
    assets[id] = { id, name: a.name, layer: a.layer, file: { main: a.file.main, files: a.file.files }, import: a.import, render: a.render, materials: a.materials, stats: a.stats };
  }
  const instances = p.instances.filter((g) => visible.has(g.l) && assets[g.a]);
  const dropped = p.instances.filter((g) => visible.has(g.l) && !assets[g.a]).reduce((n, g) => n + g.n, 0); if (dropped) errors.push(dropped + ' instance(s) use assets with errors (listed above)');
  const layers = p.layers.filter((l) => visible.has(l.id)).map(({ id, name, kind }) => ({ id, name, kind }));
  const scene = { format: SCENE_FORMAT, version: VERSION, compiled: new Date().toISOString(), source: p.modified, assets, layers, instances, files: [...files].sort() };
  const report = { ok: errors.length === 0, errors, warnings, counts: { assets: Object.keys(assets).length, layers: layers.length, instances: countInstances(instances), files: files.size, materials: Object.values(assets).reduce((n, a) => n + a.materials.length, 0) } };
  return { scene, report, project: p };
}
const origName = (a, f) => (Object.entries(a.file.files || {}).find(([, v]) => v === f) || [])[0] || '';

// the JSON chunk of a .glb (Node Buffer / Uint8Array) — external references are listed there
export function glbJSON(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb file');
  const len = dv.getUint32(12, true), type = dv.getUint32(16, true); if (type !== 0x4e4f534a) throw new Error('glb without a JSON chunk');
  return JSON.parse(new TextDecoder().decode(u8.subarray(20, 20 + len)));
}
