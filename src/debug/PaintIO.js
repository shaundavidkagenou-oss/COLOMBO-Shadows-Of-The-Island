// Environment editor (console `paint`) — files: the dev server's project folder (tools/vite/paintPack.mjs), content-addressed
// uploads, COMPILE, and portable .zip export / import (TexPack.js zip writer / reader: stored entries, deflated read too).
//   export zip:  colombo-paint-export.json   manifest (format colombo.paint-export, version, scope, counts, file list + sizes)
//                project.json                the exported assets (materials, settings), layers, instances, brush presets
//                assets/<sha256>.<ext>       every model / buffer / texture those assets use
// Import checks the format and version, every file against its SHA-256 name, reports missing / damaged files, and resolves
// asset id conflicts the way the user chose (keep both / replace mine / keep mine); instances always get fresh ids.
import { writeZip, readZip } from './TexPack.js';
import * as PF from './PaintFormat.js';
import { PACK_BASE } from './PaintAssets.js';

const API = '/__colombo/paint';
export const isDev = () => !!(import.meta.env && import.meta.env.DEV);
export const MANIFEST = 'colombo-paint-export.json';
let OFFLINE = false;
export function checkServer() { OFFLINE = !isDev(); return !OFFLINE; }
export const offline = () => OFFLINE;
async function ok(r) { if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 300)); return r.json(); }
export async function loadProject() {
  if (isDev()) try { const r = await fetch(API, { cache: 'no-cache' }); if (r.ok) return await r.json(); } catch { /* no dev server */ }
  OFFLINE = true; return { project: null, files: null, report: null, offline: true };
}
export async function saveProject(doc) { if (OFFLINE) throw new Error('saving needs the dev server (npm run dev)'); return ok(await fetch(API + '/project', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) })); }
export async function sha256(buf) { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
const UP = new Set();
// one file into paint-pack/assets → its pack name "<sha256>.<ext>"
export async function upload(name, buf) {
  const ext = PF.extOf(name); if (!PF.ALL_EXTS.includes(ext)) throw new Error('unsupported file type .' + ext + ' (' + name + ')');
  if (buf.byteLength > 512 * 1024 * 1024) throw new Error(name + ' is larger than 512 MB'); const n = (await sha256(buf)) + '.' + ext;
  if (!UP.has(n)) { if (OFFLINE) throw new Error('importing needs the dev server (npm run dev)'); await ok(await fetch(API + '/file/' + n, { method: 'POST', body: buf })); UP.add(n); }
  return n;
}
export async function fetchFile(n) { const r = await fetch(PACK_BASE + n, { cache: 'no-cache' }); if (!r.ok) throw new Error('file missing: ' + n); return r.arrayBuffer(); }
export async function compile(build = false) { return ok(await fetch(API + '/compile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ build }) })); }
export async function buildStatus() { return ok(await fetch(API + '/build', { cache: 'no-cache' })); }

// ---------------------------------------------------------------- export
// scope: 'all' | 'layers' | 'selection'; layers: Set of layer ids (scope 'layers'); library: include unused library assets
export async function exportZip(E, { scope = 'all', layers = null, library = true } = {}) {
  const all = [...E.F.objs.values()]; const objs = scope === 'selection' ? E.selectedList() : scope === 'layers' ? all.filter((o) => layers && layers.has(o.l)) : all;
  const ids = new Set(objs.map((o) => o.a)); if (scope === 'all' && library) for (const id of Object.keys(E.P.assets)) ids.add(id);
  const layerIds = new Set(scope === 'all' ? E.P.layers.map((l) => l.id) : [...objs.map((o) => o.l), ...(layers || [])]);
  const assets = {}; for (const id of ids) if (E.P.assets[id]) assets[id] = E.P.assets[id];
  const project = { format: PF.PROJECT_FORMAT, version: PF.VERSION, created: E.P.created, modified: new Date().toISOString(), assets, layers: E.P.layers.filter((l) => layerIds.has(l.id)), instances: PF.packInstances(objs), brushes: scope === 'all' ? E.P.brushes : [], editor: {} };
  const need = [...PF.projectFiles(project)]; const files = []; const missing = []; const enc = new TextEncoder();
  for (const n of need) { try { files.push({ name: 'assets/' + n, data: new Uint8Array(await fetchFile(n)) }); } catch { missing.push(n); } }
  const manifest = { format: PF.EXPORT_FORMAT, version: PF.VERSION, app: 'COLOMBO environment editor', exported: new Date().toISOString(), scope, layers: [...layerIds],
    counts: { assets: Object.keys(assets).length, layers: project.layers.length, instances: objs.length, files: files.length }, files: files.map((f) => ({ path: f.name, bytes: f.data.length })), missing };
  const blob = writeZip([{ name: MANIFEST, data: enc.encode(JSON.stringify(manifest, null, 1)) }, { name: 'project.json', data: enc.encode(JSON.stringify(project)) }, ...files]);
  return { blob, manifest };
}

// ---------------------------------------------------------------- import
export async function readImport(file) {
  let Z; try { Z = await readZip(file); } catch (e) { throw new Error('not a valid .zip file (' + ((e && e.message) || e) + ')'); }
  const names = [...Z.keys()]; const mName = names.find((n) => n === MANIFEST || n.endsWith('/' + MANIFEST)); const pName = names.find((n) => n === 'project.json' || n.endsWith('/project.json'));
  if (!pName) throw new Error('this zip is not an environment editor export (no project.json inside)');
  const prefix = pName.slice(0, pName.length - 'project.json'.length); let manifest = null;
  if (mName) { try { manifest = JSON.parse(await Z.get(mName).text()); } catch { throw new Error('the export manifest is damaged'); } if (manifest.format !== PF.EXPORT_FORMAT) throw new Error('unknown export format "' + manifest.format + '"'); }
  let raw; try { raw = JSON.parse(await Z.get(pName).text()); } catch { throw new Error('project.json inside the zip is damaged'); }
  const ver = Math.max(+(manifest && manifest.version) || 0, +raw.version || 0); if (ver > PF.VERSION) throw new Error('this export was made by a newer version of the editor (format v' + ver + '; this game reads v' + PF.VERSION + ') — update the game first');
  const { project, notes, list } = PF.normalizeProject(raw); const files = new Map(); const missing = []; const damaged = [];
  for (const n of PF.projectFiles(project)) { const b = Z.get(prefix + 'assets/' + n) || Z.get(prefix + n); if (!b) { missing.push(n); continue; } const buf = await b.arrayBuffer(); if ((await sha256(buf)) !== n.split('.')[0]) { damaged.push(n); continue; } files.set(n, buf); }
  return { manifest, project, list, notes, files, missing, damaged, version: ver };
}
// asset ids present in both: identical (same model + settings) or a real conflict
export function conflicts(E, data) {
  const out = []; const strip = (a) => { const c = PF.cleanAsset(a, E.P.layers) || a; return JSON.stringify({ f: c.file.main, i: c.import, m: (a.materials || []).map((m) => { const q = PF.cleanMaterial(m); delete q.mapNames; return q; }), r: c.render }); };
  for (const [id, a] of Object.entries(data.project.assets)) { const mine = E.P.assets[id]; if (mine) out.push({ id, name: a.name, mine: mine.name, identical: strip(mine) === strip(a) }); }
  return out;
}
// mode: 'merge' | 'replace' (the current instances are removed first); conflict: 'both' | 'replace' | 'skip'
export async function applyImport(E, data, { mode = 'merge', conflict = 'both' } = {}) {
  for (const [n, buf] of data.files) await upload(n, buf);
  const map = new Map(); const touched = [];
  for (const [id, a] of Object.entries(data.project.assets)) { const mine = E.P.assets[id]; const c = conflicts(E, { project: { assets: { [id]: a } } })[0];
    if (!mine) { E.P.assets[id] = a; map.set(id, id); touched.push(a); continue; }
    if (c && c.identical) { map.set(id, id); continue; }
    if (conflict === 'skip') { map.set(id, id); continue; }
    if (conflict === 'replace') { const keepThumb = mine.thumb; Object.assign(mine, a); if (!mine.thumb) mine.thumb = keepThumb; map.set(id, id); touched.push(mine); continue; }
    let nid = id + '_' + Math.random().toString(36).slice(2, 6); while (E.P.assets[nid]) nid = id + '_' + Math.random().toString(36).slice(2, 6); E.P.assets[nid] = { ...a, id: nid, name: a.name + ' (imported)' }; map.set(id, nid); touched.push(E.P.assets[nid]); }
  for (const l of data.project.layers) if (!E.P.layers.some((q) => q.id === l.id)) E.P.layers.push({ ...l });
  for (const b of data.project.brushes || []) if (!E.P.brushes.some((q) => q.name === b.name)) E.P.brushes.push(b);
  await Promise.all(touched.map((a) => E.F.setAsset(a)));
  E.begin('Import'); if (mode === 'replace') for (const o of [...E.F.objs.values()]) E.delObj(o);
  const objs = data.list.filter((r) => map.has(r.a) && E.layer(r.l)).map((r) => E.mk(map.get(r.a), r.l, r.p, r.r, r.s, r.c, r.t, r.k)); E.addObjs(objs); E.commit();
  for (const l of E.P.layers) E.F.setLayerHidden(l.id, !l.visible); E.markDirty();
  return { assets: touched.length, instances: objs.length };
}
export { writeZip, readZip };
