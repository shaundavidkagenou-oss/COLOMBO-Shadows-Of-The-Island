// Tiny always-loaded part of the debug editors. The editors themselves (AnimEditor / MapEditor / NpcEditor and their
// runtimes) are separate code-split modules that are only downloaded and run when the user types `animations`, `map` or
// `npc` in the console — or, at start-up, only when something was saved with them (one localStorage flag read).
import { DevLock } from './DevLock.js';
const FLAG = 'colombo.editor.saved';
export function savedFlags() { try { return JSON.parse(globalThis.localStorage?.getItem(FLAG) || '{}') || {}; } catch { return {}; } }
export function setSavedFlag(k, v) { const f = savedFlags(); if (v) f[k] = true; else delete f[k]; try { globalThis.localStorage?.setItem(FLAG, JSON.stringify(f)); } catch { /* private mode */ } }

// key/value store for editor data (IndexedDB: painted textures and vertex paint are too big for localStorage)
const MEM = new Map(); let dbP = null;
function db() {
  if (!globalThis.indexedDB) return null;
  return (dbP ||= new Promise((res) => { const rq = indexedDB.open('colombo-editor', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('kv'); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); }));
}
export async function storeGet(k) { const d = await db(); if (!d) return MEM.get(k); return new Promise((res) => { const rq = d.transaction('kv').objectStore('kv').get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(undefined); }); }
export async function storeSet(k, v) { const d = await db(); if (!d) { MEM.set(k, v); return; } return new Promise((res, rej) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
export async function storeDel(k) { const d = await db(); if (!d) { MEM.delete(k); return; } return new Promise((res) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }

// stable ids for the generated plan objects, taken right after generation (before any later filtering) so map edits made
// in a session without saved edits still match on the next start
export function assignIds(P) {
  if (P._eidDone) return; P._eidDone = true; P.buildings.forEach((b) => { b._eid = 'b:' + b.id; }); P.trees.forEach((t, i) => { t._eid = 't:' + i; }); P.props.forEach((p, i) => { p._eid = 'p:' + i; }); P.walls.forEach((w, i) => { w._eid = 'w:' + i; }); (P.plants || []).forEach((p, i) => { p._eid = 'pl:' + i; });
}
// ---- 68th: model pack (model-pack/manifest.json — the model tools' work, built into dist / the .exe like texture-pack/)
let MPACK; // undefined = not fetched yet
export async function fetchModelPack() {
  if (MPACK !== undefined) return MPACK; MPACK = null;
  if (typeof fetch === 'function' && typeof location !== 'undefined') try { const r = await fetch('model-pack/manifest.json', { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); if (j && j.format === 'colombo.model-manifest') MPACK = j; } } catch { /* no pack (file:// or offline) */ }
  return MPACK;
}
export function modelPackNow() { return MPACK || null; } // (73rd: the bank layout, read when the hall is built — fetched at boot)
export function setModelPack(m) { MPACK = m; } // the tools keep the cached copy current after a save
const packHasMap = (p) => !!(p && p.map && ((p.map.added && p.map.added.length) || (p.map.mods && Object.keys(p.map.mods).length) || (p.map.textures && Object.keys(p.map.textures).length)));
const packHasModels = (p) => !!(p && (Object.keys(p.weapons || {}).length || Object.keys(p.heroes || {}).length || Object.keys(p.vehicles || {}).length || (p.npcs && p.npcs.rules && p.npcs.rules.length) || Object.keys(p.anims || {}).length || Object.keys(p.objects || {}).length));
export async function bootMap(plan) { assignIds(plan); const pack = await fetchModelPack(); if (!savedFlags().map && !packHasMap(pack)) return; try { const m = await import('./MapRuntime.js'); await m.applySavedMap(plan, pack && pack.map); } catch (e) { console.warn('[editor] saved map edits not applied', e); } }
export async function bootMapWorld(world) { if (!savedFlags().map && !packHasMap(MPACK)) return; try { const m = await import('./MapRuntime.js'); await m.buildSavedObjects(world); } catch (e) { console.warn('[editor] saved map objects not built', e); } }
export async function bootRuntime(game) {
  const f = savedFlags();
  if (f.anim) try { await (await import('./AnimRuntime.js')).loadSavedAnims(); } catch (e) { console.warn('[editor] saved animations not applied', e); }
  if (f.npc) try { await (await import('./NpcRuntime.js')).loadSavedNpcs(game); } catch (e) { console.warn('[editor] saved NPCs not applied', e); }
  const pack = await fetchModelPack(); if (packHasModels(pack)) try { await (await import('./ModelRuntime.js')).boot(game, pack); } catch (e) { console.warn('[model tools] saved model edits not applied', e); } // 68th
}
// ---- Texture Studio (59th, src/debug/TextureStudio.js): a development tool. Enabled by the Vite dev server (npm run dev) or a
// build made with VITE_TEXTURE_STUDIO=1 (npm run build:studio); an ordinary production build (npm run build, build-exe.bat)
// constant-folds this to false, so the Studio's code is not even in it. Texture packs made with it still apply there.
export const TEXTURE_STUDIO = !!(import.meta.env && (import.meta.env.DEV || import.meta.env.VITE_TEXTURE_STUDIO === '1'));
let PACK; // undefined = not fetched yet
async function fetchPack() {
  if (PACK !== undefined) return PACK; PACK = null; // texture-pack/manifest.json: the dev server's project folder, or the copy built into dist / the .exe
  if (typeof fetch === 'function' && typeof location !== 'undefined') try { const r = await fetch('texture-pack/manifest.json', { cache: 'no-cache' }); if (r.ok) PACK = await r.json(); } catch { /* no pack (file:// or offline) */ }
  return PACK;
}
const hasRules = (pack) => !!(pack && pack.rules && Object.keys(pack.rules).length > 0) || (TEXTURE_STUDIO && !!savedFlags().textures);
// 60th: before the city is generated — parts with their own material in the saved rules are built that way from the start
export async function preloadTextures() {
  try { const pack = await fetchPack(); if (!hasRules(pack)) return null; const rt = await import('./TexRuntime.js'); globalThis.__texRuntime = rt; return await rt.preload({ pack }); }
  catch (e) { console.warn('[texture studio] texture manifest not read early', e); return null; }
}
export async function bootTextures(game) {
  try {
    const pack = await fetchPack(); if (!hasRules(pack)) return null;
    const rt = await import('./TexRuntime.js'); globalThis.__texRuntime = rt; return await rt.boot(game, { pack }); // (inspectable from the browser console)
  } catch (e) { console.warn('[texture studio] saved texture replacements not applied', e); return null; }
}
// 68th: model tools (console models-weapons / model-player / model-vehicles / model-npc) — development builds only, like the Studio
export async function openModelStudio(game, mode) {
  if (DevLock.locked) throw new Error('developer tools are locked');
  if (TEXTURE_STUDIO) { const mod = await import('./ModelStudio.js'); const ed = await mod.open(game, mode); (globalThis.__editors ||= {}).models = ed; return ed; }
  throw new Error('the model tools are development tools — not part of this build (npm run dev, or npm run build:studio)');
}
// 73rd: bank editor (console bank-edit) — move / turn / scale / hide / retexture any part of the bank hall; development builds only
export async function openBankEditor(game) {
  if (DevLock.locked) throw new Error('developer tools are locked');
  if (TEXTURE_STUDIO) { const mod = await import('./BankEditor.js'); const ed = await mod.open(game); (globalThis.__editors ||= {}).bank = ed; return ed; }
  throw new Error('the bank editor is a development tool — not part of this build (npm run dev, or npm run build:studio)');
}
export async function openTextureStudio(game) {
  if (DevLock.locked) throw new Error('developer tools are locked');
  if (TEXTURE_STUDIO) { const mod = await import('./TextureStudio.js'); const ed = await mod.open(game); (globalThis.__editors ||= {}).textures = ed; return ed; }
  throw new Error('the Texture Studio is a development tool — not part of this build (npm run dev, or npm run build:studio)');
}
// console entry points (dynamic import = loaded on demand)
export async function openEditor(kind, game) {
  if (DevLock.locked) throw new Error('developer tools are locked');
  const mod = kind === 'animations' ? await import('./AnimEditor.js') : kind === 'map' ? await import('./MapEditor.js') : await import('./NpcEditor.js');
  const ed = await mod.open(game); (globalThis.__editors ||= {})[kind] = ed; return ed; // (inspectable from the browser console)
}
