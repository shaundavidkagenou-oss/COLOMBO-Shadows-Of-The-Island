// Map edits made in the map editor: a small document of changes to the generated city plan
//   mods:  { '<eid>': { del: true } | { ...fields } }  — buildings 'b:<id>', trees 't:<i>', props 'p:<i>', walls 'w:<i>', plants 'pl:<i>'
//   added: [{ uid, k: 'b' | 't' | 'p' | 'w' | 'pl' | 'prim', ...fields }]
//   textures: { name: dataURL }  — painted textures for placed objects
// applied to the plan before the world is built (so a saved map loads exactly as edited), plus live helpers the editor uses
// to rebuild just the chunks / forest / colliders an edit touched.
import * as THREE from 'three';
import { plan, chunkIndex, FLOOR_H, GROUND_H } from '../world/CityPlan.js';
import { MAT } from '../gfx/Materials.js';
import { storeGet, storeSet, setSavedFlag, assignIds } from './boot.js';

export const MAP = { edits: { v: 1, mods: {}, added: [], textures: {} } };
export const KINDS = { b: ['buildings', 'buildings'], t: ['trees', 'trees'], p: ['props', 'props'], w: ['walls', 'walls'], pl: ['plants', null] };
export const FIELDS = { b: ['x0', 'x1', 'z0', 'z1', 'floors', 'style', 'color', 'roof', 'front', 'porch', 'balconies', 'tanks'], t: ['type', 'x', 'z', 's', 'yaw', 'sy', 'sq'], p: ['type', 'x', 'z', 'rot'], w: ['x0', 'x1', 'z0', 'z1', 'h', 'col'], pl: ['type', 'x', 'z', 's', 'yaw'] };
const ctr = (o) => (o.x0 !== undefined ? [(o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2] : [o.x, o.z]);

export { assignIds };
export const kindOf = (o) => o._k || (o._eid ? o._eid.split(':')[0] : null);
function index(P) { const m = new Map(); for (const k of Object.keys(KINDS)) for (const o of P[KINDS[k][0]] || []) if (o._eid) m.set(o._eid, o); return m; }

// colliders that belong to an object (plan.colliders entries)
export function collidersOf(P, o, k = kindOf(o)) {
  if (k === 'b') return P.colliders.filter((c) => c.b === o);
  if (k === 't') return o.col ? [o.col] : [];
  if (k === 'w') return P.colliders.filter((c) => c.kind === 'wall' && c.x0 === o.x0 && c.x1 === o.x1 && c.z0 === o.z0 && c.z1 === o.z1 || c.w === o);
  if (k === 'p') return P.colliders.filter((c) => c.p === o || (!c.b && c.kind !== 'tree' && c.kind !== 'wall' && c.kind !== 'building' && Math.abs((c.x0 + c.x1) / 2 - o.x) < 0.6 && Math.abs((c.z0 + c.z1) / 2 - o.z) < 0.6 && c.x1 - c.x0 < 5 && c.z1 - c.z0 < 5));
  return [];
}
function chunkMove(P, o, k, oldC) { const [, bk] = KINDS[k]; if (!bk) return; const [x, z] = ctr(o); const nc = chunkIndex(x, z); if (nc === oldC) return; if (oldC >= 0) { const a = P.byChunk[oldC][bk]; const i = a.indexOf(o); if (i >= 0) a.splice(i, 1); } if (nc >= 0) P.byChunk[nc][bk].push(o); }
// returns { removed: [colliders], added: [colliders], chunks: Set<chunk idx> }
export function removeObj(P, o) {
  const k = kindOf(o), [arr, bk] = KINDS[k]; const out = { removed: collidersOf(P, o, k), added: [], chunks: new Set() }; const [x, z] = ctr(o); const ci = chunkIndex(x, z); out.chunks.add(ci);
  const a = P[arr]; const i = a.indexOf(o); if (i >= 0) a.splice(i, 1); if (bk && ci >= 0) { const b = P.byChunk[ci][bk]; const j = b.indexOf(o); if (j >= 0) b.splice(j, 1); }
  const rs = new Set(out.removed); P.colliders = P.colliders.filter((c) => !rs.has(c)); plan.colliders = P.colliders; return out;
}
export function setFields(P, o, f) {
  const k = kindOf(o); const [ox, oz] = ctr(o); const oldC = chunkIndex(ox, oz); const cols = collidersOf(P, o, k); const out = { removed: cols.slice(), added: [], chunks: new Set([oldC]) };
  for (const [key, v] of Object.entries(f)) if (key !== 'del') o[key] = v;
  if (k === 'b' || k === 'w') { if (o.x0 > o.x1) [o.x0, o.x1] = [o.x1, o.x0]; if (o.z0 > o.z1) [o.z0, o.z1] = [o.z1, o.z0]; }
  if (k === 'b') { o.floors = Math.max(1, Math.round(o.floors)); o.h = o.floors * FLOOR_H + (o.groundRow != null ? GROUND_H - FLOOR_H : 0); o.totalH = o.tower ? o.h + o.tower.floors * FLOOR_H : o.h; delete o._r; delete o._vol; for (const c of cols) Object.assign(c, { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, h: o.totalH }); }
  else if (k === 'w') for (const c of cols) Object.assign(c, { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, h: o.h, w: o });
  else if (k === 't') { const s = o.s || 1; for (const c of cols) Object.assign(c, { x0: o.x - 0.35 * s, x1: o.x + 0.35 * s, z0: o.z - 0.35 * s, z1: o.z + 0.35 * s }); }
  else if (k === 'p') { const dx = o.x - ox, dz = o.z - oz; for (const c of cols) { c.x0 += dx; c.x1 += dx; c.z0 += dz; c.z1 += dz; c.p = o; } }
  out.added = cols; chunkMove(P, o, k, oldC); const [nx, nz] = ctr(o); out.chunks.add(chunkIndex(nx, nz)); return out;
}
let bidN = 900000;
export function createObj(P, d) {
  const k = d.k; if (k === 'prim' || k === 'model') return { obj: null, out: { removed: [], added: [], chunks: new Set() } };
  const o = JSON.parse(JSON.stringify(d)); o._k = k; o._eid = 'a:' + d.uid; delete o.k; const [arr, bk] = KINDS[k]; const out = { removed: [], added: [], chunks: new Set() };
  if (k === 'b') { o.id = bidN++; o.h = o.floors * FLOOR_H + (o.groundRow != null ? GROUND_H - FLOOR_H : 0); o.totalH = o.tower ? o.h + o.tower.floors * FLOOR_H : o.h; const c = { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, h: o.totalH, kind: 'building', b: o }; P.colliders.push(c); out.added.push(c); }
  else if (k === 't') { const s = o.s || 1; o.col = { x0: o.x - 0.35 * s, x1: o.x + 0.35 * s, z0: o.z - 0.35 * s, z1: o.z + 0.35 * s, h: 6, kind: 'tree' }; P.colliders.push(o.col); out.added.push(o.col); }
  else if (k === 'w') { const c = { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, h: o.h, kind: 'wall', w: o }; P.colliders.push(c); out.added.push(c); }
  (P[arr] ||= []).push(o); const [x, z] = ctr(o); const ci = chunkIndex(x, z); if (bk && ci >= 0) P.byChunk[ci][bk].push(o); out.chunks.add(ci);
  return { obj: o, out };
}
// whole document onto a freshly generated plan
export function applyEdits(P, E) {
  assignIds(P); const ix = index(P); let n = 0;
  for (const [eid, f] of Object.entries(E.mods || {})) { const o = ix.get(eid); if (!o) continue; if (f.del) removeObj(P, o); else setFields(P, o, f); n++; }
  for (const d of E.added || []) { if (d.k !== 'prim' && d.k !== 'model') { createObj(P, d); n++; } }
  return n;
}
// 68th: two copies — this browser's (IndexedDB, the editor's working copy) and the one built into the game (model-pack/
// manifest.json → map, written by every Save on the dev server). The newer one loads; a built game / the .exe only has the pack's.
export const pickMap = (local, pack) => (!local ? pack || null : !pack ? local : (Date.parse(pack.saved || 0) || 0) > (Date.parse(local.saved || 0) || 0) ? pack : local);
export async function applySavedMap(P = plan, packMap = null) { let E = null; try { E = await storeGet('map'); } catch { /* no IndexedDB */ } E = pickMap(E, packMap); if (!E) return 0; MAP.edits = Object.assign({ v: 1, mods: {}, added: [], textures: {} }, JSON.parse(JSON.stringify(E))); return applyEdits(P, MAP.edits); }
export async function saveMap() {
  MAP.edits.saved = new Date().toISOString(); const doc = JSON.parse(JSON.stringify(MAP.edits)); await storeSet('map', doc); const E = MAP.edits; setSavedFlag('map', Object.keys(E.mods).length + E.added.length > 0);
  let baked = false; // into the project folder → built into the game / .exe (dev server only)
  if (import.meta.env && import.meta.env.DEV) { const MP = await import('./ModelPack.js'); const m = await MP.loadPack(); m.map = doc; await MP.savePack(); baked = true; }
  return { baked };
}

// ---- placed primitives (boxes, cylinders, ramps … with colour / painted texture), built after the world
const TEX = new Map();
export function textureFor(name, W = 256, H = 256) { const url = MAP.edits.textures[name]; if (!url) return null; let t = TEX.get(name); if (!t) { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.cv = cv; TEX.set(name, t); } const img = new Image(); img.onload = () => { const cv = t.userData.cv; cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); t.needsUpdate = true; }; img.src = url; return t; } // fixed canvas size: a GPU texture never changes size after upload
export function liveTexture(name, canvas) { let t = TEX.get(name); if (!t || t.userData.cv !== canvas) { t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.cv = canvas; TEX.set(name, t); } t.needsUpdate = true; return t; }
const GEO = { box: () => new THREE.BoxGeometry(1, 1, 1), cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24), sphere: () => new THREE.SphereGeometry(0.5, 24, 16), cone: () => new THREE.ConeGeometry(0.5, 1, 24), plane: () => new THREE.BoxGeometry(1, 0.02, 1),
  ramp: () => { const g = new THREE.BufferGeometry(); const p = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, 0.5, 0.5, 1, 0.5]; const i = [0, 2, 1, 0, 3, 2, 3, 4, 5, 3, 5, 2, 0, 4, 3, 0, 1, 5, 0, 5, 4, 1, 2, 5]; g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setIndex(i); const ng = g.toNonIndexed(); ng.computeVertexNormals(); const uv = []; for (let k = 0; k < ng.attributes.position.count; k++) uv.push(ng.attributes.position.getX(k) + 0.5, ng.attributes.position.getY(k) + ng.attributes.position.getZ(k)); ng.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return ng; },
  arch: () => { const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(-0.5, 1); s.lineTo(0.5, 1); s.lineTo(0.5, 0); s.lineTo(0.3, 0); s.absarc(0, 0.55, 0.3, 0, Math.PI, false); s.lineTo(-0.3, 0); s.lineTo(-0.5, 0); const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g; } };
export const PRIM_SHAPES = Object.keys(GEO);
export function primMesh(d) {
  const g = (GEO[d.shape] || GEO.box)(); if (d.shape !== 'ramp' && d.shape !== 'plane' && d.shape !== 'arch') g.translate(0, 0.5, 0); // pivot at the base
  const map = d.tex ? textureFor(d.tex) : null; if (map) map.repeat.set(d.rep || 1, d.rep || 1);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: d.color || '#cccccc', map, roughness: d.rough ?? 0.8, metalness: d.metal ?? 0, emissive: d.glow ? new THREE.Color(d.color || '#ffffff') : new THREE.Color(0), emissiveIntensity: d.glow || 0, transparent: (d.opacity ?? 1) < 1, opacity: d.opacity ?? 1 }));
  m.name = 'editorPrim'; m.userData.prim = d; m.castShadow = d.shadow !== false; m.receiveShadow = true; placePrim(m, d); return m;
}
export function placePrim(m, d) { m.position.set(d.x, d.y, d.z); m.rotation.set(d.rx || 0, d.ry || 0, d.rz || 0); m.scale.set(d.sx || 1, d.sy || 1, d.sz || 1); m.updateMatrixWorld(true); }
export function primCollider(d) { if (!d.solid) return null; const hx = (d.sx || 1) / 2, hz = (d.sz || 1) / 2, c = Math.abs(Math.cos(d.ry || 0)), s = Math.abs(Math.sin(d.ry || 0)); const ex = hx * c + hz * s, ez = hx * s + hz * c; return { x0: d.x - ex, x1: d.x + ex, z0: d.z - ez, z1: d.z + ez, h: d.y + (d.sy || 1), y0: d.y, kind: 'prop', prim: d.uid }; }
// painted replacements for the city's own material textures (roads, walls, roofs, pavements …): textures['mat:<MAT key>']
export const MAT_ORIG = new Map();
export function setMatTexture(key, tex) { const m = MAT[key]; if (!m || !m.map) return false; if (!MAT_ORIG.has(key)) MAT_ORIG.set(key, m.map); const o = MAT_ORIG.get(key); if (tex) { tex.wrapS = o.wrapS; tex.wrapT = o.wrapT; tex.repeat.copy(o.repeat); tex.offset.copy(o.offset); tex.colorSpace = o.colorSpace; tex.anisotropy = o.anisotropy; tex.flipY = o.flipY; } m.map = tex || o; return true; }
export function applyMatTextures() { for (const name of Object.keys(MAP.edits.textures || {})) if (name.startsWith('mat:')) { const m = MAT[name.slice(4)]; const im = m && m.map && m.map.image; if (im) setMatTexture(name.slice(4), textureFor(name, im.width || 512, im.height || 512)); } }
// ---- 68th: placed models (uploaded in the map editor; files in model-pack/): { uid, k:'model', name, asset:{ main, files },
// x, y, z, rx, ry, rz, s (uniform) | sx sy sz, solid, shadow, clip (animation name of the model, '' = none), clipSpeed, tint }
export async function modelMesh(d) {
  const MP = await import('./ModelPack.js'); const { scene, clips } = await MP.loadAsset(d.asset); const g = new THREE.Group(); g.name = 'editorModel';
  const inner = new THREE.Group(); inner.add(scene); g.add(inner);
  // the file's own pivot / size are kept; base = put the lowest point on y = 0 (default on)
  if (d.base !== false) { scene.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(scene); if (Number.isFinite(bb.min.y)) inner.position.y = -bb.min.y; }
  scene.traverse((o) => { if (o.isMesh) { o.castShadow = d.shadow !== false; o.receiveShadow = true; o.userData.editorModel = d.uid; if (d.tint) { o.material = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => { const c = m.clone(); if (c.color) c.color.multiply(new THREE.Color(d.tint)); return c; }); if (o.material.length === 1) o.material = o.material[0]; } } });
  g.userData.prim = d; g.userData.model = { clips, mixer: null, action: null }; placeModel(g, d); setModelClip(g, d); return g;
}
export function placeModel(g, d) { g.position.set(d.x, d.y, d.z); g.rotation.set(d.rx || 0, d.ry || 0, d.rz || 0); const s = d.s || 1; g.scale.set((d.sx || 1) * s, (d.sy || 1) * s, (d.sz || 1) * s); g.updateMatrixWorld(true); }
export function setModelClip(g, d) {
  const M = g.userData.model; if (!M) return; if (M.action) { M.action.stop(); M.action = null; }
  const clip = d.clip ? M.clips.find((c) => c.name === d.clip) || (d.clip === '*' ? M.clips[0] : null) : null; if (!clip) { MODEL_ANIM.delete(g); return; }
  M.mixer ||= new THREE.AnimationMixer(g.children[0]); M.action = M.mixer.clipAction(clip); M.action.setEffectiveTimeScale(d.clipSpeed ?? 1); M.action.play(); MODEL_ANIM.add(g);
}
export const MODEL_ANIM = new Set(); // placed models playing an animation (advanced by the runtime's pre-render hook, in view only)
export function tickModels(dt, cam) { for (const g of MODEL_ANIM) { if (!g.parent) { MODEL_ANIM.delete(g); continue; } if (cam && g.position.distanceToSquared(cam.position) > 120 * 120) continue; g.userData.model.mixer.update(dt); } }
// box collider from the model's bounds (rotated with it)
export function modelCollider(g, d) { if (!d.solid) return null; g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(g); if (!Number.isFinite(bb.min.x)) return null; return { x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, h: bb.max.y, y0: bb.min.y, kind: 'prop', prim: d.uid }; }
async function buildModels(world, list) {
  const g = world.editorPrims || (world.editorPrims = new THREE.Group()); g.name = 'editorPrims'; if (!g.parent) world.root.add(g);
  await Promise.all(list.map(async (d) => { try { const m = await modelMesh(d); g.add(m); const c = modelCollider(m, d); if (c) world.collision.add(c); } catch (e) { console.warn('[map] placed model not loaded:', d.name || d.uid, e); } }));
  if (MODEL_ANIM.size) { const { HOOKS } = await import('../core/Hooks.js'); if (!HOOKS._mapModels) { HOOKS._mapModels = (dt) => tickModels(dt, globalThis.__game && globalThis.__game.camera); HOOKS.preRender.add(HOOKS._mapModels); } }
}
export async function buildSavedObjects(world) {
  applyMatTextures();
  const models = MAP.edits.added.filter((d) => d.k === 'model' && d.asset); if (models.length) await buildModels(world, models);
  if (!MAP.edits.added.some((d) => d.k === 'prim')) return; const g = world.editorPrims || (world.editorPrims = new THREE.Group()); g.name = 'editorPrims'; if (!g.parent) world.root.add(g);
  for (const d of MAP.edits.added) if (d.k === 'prim') { g.add(primMesh(d)); const c = primCollider(d); if (c) world.collision.add(c); }
}
