// Custom NPCs made in the NPC editor: their appearance spec joins the crowd's spawn pool, and every Character built from it
// gets the editor's extras — painted vertex colours (skin / clothes / any detail), a painted fabric texture and per-bone
// proportions. Loaded only when the editor is opened or custom NPCs were saved.
import * as THREE from 'three';
import { Character, getBodyMaterial } from '../actors/Character.js';
import { storeGet, storeSet, setSavedFlag } from './boot.js';

export const NPCS = { list: [] }; // [{ id, name, weight, spec, bones: {bone: [sx, sy, sz]}, vpaint: base64 | null, fabric: dataURL | null }]
const matCache = new Map();

export function b64FromColors(attr) { const a = attr.array, u = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) u[i] = Math.max(0, Math.min(255, Math.round(a[i] * 255))); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
export function colorsFromB64(b64) { const s = atob(b64), u = new Float32Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) / 255; return u; }

// a body material using this NPC's painted fabric (one per custom NPC, built once)
export function fabricMaterial(id, dataURL) {
  if (matCache.has(id)) return matCache.get(id); const base = getBodyMaterial(); const m = base.clone(); const cv = document.createElement('canvas'); cv.width = cv.height = 512; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; m.map = tex;
  const img = new Image(); img.onload = () => { cv.getContext('2d').drawImage(img, 0, 0, 512, 512); tex.needsUpdate = true; }; img.src = dataURL; matCache.set(id, m); return m;
}
// apply an entry's extras to a freshly built Character
export function applyCustom(ch, e) {
  if (!e) return;
  if (e.vpaint) { const col = ch.mesh.geometry.getAttribute('color'); const arr = colorsFromB64(e.vpaint); if (col && arr.length === col.array.length) { if (!ch.mesh.geometry.userData.edOwn) { ch.mesh.geometry = ch.mesh.geometry.clone(); ch.mesh.geometry.userData.edOwn = true; } ch.mesh.geometry.getAttribute('color').array.set(arr); ch.mesh.geometry.getAttribute('color').needsUpdate = true; } }
  if (e.fabric && Array.isArray(ch.mesh.material)) { const mats = ch.mesh.material.slice(); mats[0] = e.fabricMat || fabricMaterial(e.id, e.fabric); if (mats[1] === ch.mesh.material[0]) mats[1] = mats[0]; ch.mesh.material = mats; }
  if (e.bones) for (const [b, s] of Object.entries(e.bones)) { const bone = ch.bones[b]; if (bone && s) bone.scale.set(s[0], s[1], s[2]); }
}
let installed = false;
export function install() {
  if (installed) return; installed = true; const orig = Character.prototype.attachNpcHead;
  Character.prototype.attachNpcHead = function (fv) { orig.call(this, fv); const id = this.spec && this.spec._custom; if (id) applyCustom(this, NPCS.list.find((e) => e.id === id)); };
}
// put the custom NPCs into the crowd's spawn pool (weight = copies in the pool)
export function addToCrowd(game) {
  const C = game.crowd; if (!C || !C.specs) return; C.specs = C.specs.filter((s) => !s._custom);
  for (const e of NPCS.list) { if (e.off) continue; for (let i = 0; i < Math.max(1, Math.min(20, e.weight | 0 || 1)); i++) C.specs.push(e.spec); }
}
export async function saveNpcs(game) { await storeSet('npcs', NPCS.list.map(({ fabricMat, ...e }) => { void fabricMat; return e; })); setSavedFlag('npc', NPCS.list.length > 0); addToCrowd(game); }
export async function loadSavedNpcs(game) { const l = await storeGet('npcs'); if (Array.isArray(l)) NPCS.list = l; install(); addToCrowd(game); return NPCS.list; }
export function forgetMaterial(id) { const m = matCache.get(id); if (m) { m.map?.dispose(); m.dispose(); matCache.delete(id); } }
