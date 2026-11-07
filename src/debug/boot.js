// Tiny always-loaded part of the debug editors. The editors themselves (AnimEditor / MapEditor / NpcEditor and their
// runtimes) are separate code-split modules that are only downloaded and run when the user types `animations`, `map` or
// `npc` in the console — or, at start-up, only when something was saved with them (one localStorage flag read).
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
export async function bootMap(plan) { assignIds(plan); if (!savedFlags().map) return; try { const m = await import('./MapRuntime.js'); await m.applySavedMap(plan); } catch (e) { console.warn('[editor] saved map edits not applied', e); } }
export async function bootMapWorld(world) { if (!savedFlags().map) return; try { const m = await import('./MapRuntime.js'); await m.buildSavedObjects(world); } catch (e) { console.warn('[editor] saved map objects not built', e); } }
export async function bootRuntime(game) {
  const f = savedFlags();
  if (f.anim) try { await (await import('./AnimRuntime.js')).loadSavedAnims(); } catch (e) { console.warn('[editor] saved animations not applied', e); }
  if (f.npc) try { await (await import('./NpcRuntime.js')).loadSavedNpcs(game); } catch (e) { console.warn('[editor] saved NPCs not applied', e); }
}
// console entry points (dynamic import = loaded on demand)
export async function openEditor(kind, game) {
  const mod = kind === 'animations' ? await import('./AnimEditor.js') : kind === 'map' ? await import('./MapEditor.js') : await import('./NpcEditor.js');
  const ed = await mod.open(game); (globalThis.__editors ||= {})[kind] = ed; return ed; // (inspectable from the browser console)
}
