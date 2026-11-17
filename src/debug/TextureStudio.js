// Texture Studio (59th) — development tool: walk / fly around Colombo, click any object (city batches, landmarks, interiors,
// vehicles, people, trees, props, sky / water), inspect its meshes, materials and texture slots, and replace textures or
// material settings live in the real scene. Opened from the pause menu ("Texture Studio") or the console (`textures`) in
// development builds only (src/debug/boot.js TEXTURE_STUDIO); the engine work is in TexRuntime.js.
//   Left window  — hierarchy (breadcrumb, subtree, search, hits under the cursor), materials of the selection, material
//                  inspector (scope / sharing, slots, settings, make unique, restore).
//   Right window — slot editor (original | replacement preview, tiling, offset, rotation, wrap, flip, colour adjustment,
//                  max size), texture library (search, categories, thumbnails, resolution, format, assignments), storage
//                  (save, export / import pack, asset base URL, memory budget, on/off comparison, restore all).
import * as THREE from 'three';
import * as RT from './TexRuntime.js';
import { writeZip, readZip } from './TexPack.js';
import { Win, h, btn, num, color, check, select, text, section, beginSession, toast, download, pickFile } from './ui.js';
import { plan } from '../world/CityPlan.js';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { buildBase, buildDetail, buildWall, buildWindows } from '../world/BuildingGen.js';
import { ensureMat, materialLabel, splitKey, parentKey, splittable, ROLE_DEFS, SPLIT } from '../gfx/Materials.js';
import * as L from '../world/Layout.js';

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const CSS = `
.ts-row{display:flex;align-items:center;gap:6px;margin:3px 0}
.ts-thumb{width:34px;height:34px;flex:none;border:1px solid #3a4250;border-radius:3px;background:#161a21;image-rendering:auto}
.ts-badge{display:inline-block;font-size:10px;line-height:15px;padding:0 6px;border-radius:8px;background:#2d3442;color:#cfd6e0;margin-left:4px;vertical-align:middle;white-space:nowrap}
.ts-badge.ed{background:#6a4a12;color:#ffd890}.ts-badge.warn{background:#5a2428;color:#ffc4c4}.ts-badge.ok{background:#1f4a2c;color:#bff0cc}
.ts-crumb{display:flex;flex-wrap:wrap;gap:2px 4px;font-size:11px;margin:2px 0 6px}.ts-crumb a{color:#9fc1ff;cursor:pointer;text-decoration:none}.ts-crumb a:hover{text-decoration:underline}.ts-crumb i{color:#556}
.ts-slot{display:flex;align-items:center;gap:6px;padding:3px;border:1px solid transparent;border-radius:4px;cursor:pointer}.ts-slot:hover{background:#1d222c}.ts-slot.act{border-color:#e0a030;background:#2a2316}
.ts-slot .t{flex:1;min-width:0}.ts-slot .t b{display:block;font-weight:600}.ts-slot .t small{display:block;color:#8a93a0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ts-pv{display:flex;gap:8px}.ts-pv figure{margin:0;flex:1;min-width:0}.ts-pv canvas{width:100%;aspect-ratio:1/1;border:1px solid #3a4250;border-radius:4px;display:block}.ts-pv figcaption{font-size:10.5px;color:#8a93a0;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ts-pv figcaption b{color:#e0a030;font-size:11px;display:block}
.ts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(86px,1fr));gap:6px;margin-top:6px}
.ts-tile{border:1px solid #2c3340;border-radius:5px;padding:3px;cursor:pointer;background:#12151b;min-width:0}.ts-tile:hover{border-color:#5a6478}.ts-tile.sel{border-color:#e0a030;background:#2a2316}
.ts-tile img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;border-radius:3px;background:#1b1f27}.ts-tile div{font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ts-tile small{display:block;color:#8a93a0;font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ts-bar{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}
.ts-meter{height:6px;background:#0f1116;border:1px solid #2c3340;border-radius:3px;overflow:hidden;margin:3px 0}.ts-meter i{display:block;height:100%;background:#e0a030}
.ts-kv{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;font-size:11px}.ts-kv span:nth-child(odd){color:#8a93a0}.ts-kv span:nth-child(even){overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ts-list{max-height:170px}.ts-err{color:#ff9c9c;font-size:11px;margin:3px 0}.ts-warn{color:#ffd27a;font-size:11px;margin:3px 0}
`;
let cssDone = false;
function css() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

function drawable(im) { return !!(im && im.width > 0 && (im instanceof HTMLCanvasElement || im instanceof HTMLImageElement || (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap))); }
function drawInto(cv, tex, label) {
  const g = cv.getContext('2d'); const W = cv.width, H = cv.height;
  for (let y = 0; y < H; y += 10) for (let x = 0; x < W; x += 10) { g.fillStyle = (x + y) / 10 % 2 ? '#262b35' : '#1c2028'; g.fillRect(x, y, 10, 10); }
  const im = tex && (tex.isTexture ? tex.image : tex);
  if (drawable(im)) { const s = Math.min(W / im.width, H / im.height); const w = im.width * s, hh = im.height * s; try { g.drawImage(im, (W - w) / 2, (H - hh) / 2, w, hh); } catch { /* tainted */ } }
  else { g.fillStyle = '#8a93a0'; g.font = Math.max(9, W / 14) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(label || (!tex ? 'none' : tex.isCompressedTexture ? 'GPU-compressed' : tex.isDataTexture ? 'data texture' : 'no preview'), W / 2, H / 2 + 4); }
}
function texInfo(t) {
  if (!t) return 'empty'; const im = t.image || {}; const cs = t.colorSpace === THREE.SRGBColorSpace ? 'sRGB' : 'linear';
  const kind = t.isCompressedTexture ? 'compressed' : t.isCanvasTexture ? 'canvas' : t.isDataTexture ? 'data' : t.isVideoTexture ? 'video' : 'image';
  return `${im.width | 0}×${im.height | 0} ${kind} · ${cs} · tile ${+t.repeat.x.toFixed(2)}×${+t.repeat.y.toFixed(2)}`;
}
const fmtB = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB');
const objLabel = (o) => (o.name ? o.name : '(' + o.type + ')');
function matsOf(o) { return !o || !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material]; }

let ed = null;
export async function open(game) {
  if (ed) return ed; css(); globalThis.__texRuntime = RT; await RT.boot(game, {}); ed = new Studio(game); return ed;
}

class Studio {
  constructor(game) {
    this.g = game; this.cv = game.renderer.domElement; this.cam = game.camera; this.keys = new Set(); this.speed = 18;
    const e = new THREE.Euler().setFromQuaternion(this.cam.quaternion, 'YXZ'); this.yaw = e.y; this.pitch = e.x; this.pos = this.cam.position.clone();
    this.sel = null; this.node = null; this.m = null; this.key = null; this.slot = 'map'; this.libSel = null; this.libQ = ''; this.libCat = 'All'; this.hits = []; this.hitIdx = 0; this.peek = null;
    this.box = new THREE.Box3Helper(new THREE.Box3(), 0xffb020); this.box.material.depthTest = false; this.box.renderOrder = 999; this.box.visible = false; this.box.userData.__tsHelper = true; game.scene.add(this.box);
    this.bbox = new THREE.Box3Helper(new THREE.Box3(), 0x4aa8ff); this.bbox.material.depthTest = false; this.bbox.renderOrder = 998; this.bbox.visible = false; this.bbox.userData.__tsHelper = true; game.scene.add(this.bbox);
    this.session = beginSession(game, 'textures', { hook: (dt) => this.tick(dt), onEnd: () => this.dispose() });
    RT.setStudioOpen(true); RT.scan(); this.unsub = RT.on((t, k) => this.onRT(t, k));
    this.bindInput(); this.buildUI();
    toast('Texture Studio — click any object · right-drag look · WASD/QE fly · Alt+click = object behind', 3500);
  }
  // ------------------------------------------------------------------ input + camera
  bindInput() {
    const typing = (e) => { const t = e.target; return t && (t.closest?.('.ed-win') || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
    this.onKeyDown = (e) => {
      if (typing(e)) return; const c = e.code;
      if ((e.ctrlKey || e.metaKey) && c === 'KeyZ') { e.preventDefault(); e.stopPropagation(); (e.shiftKey ? this.redo() : this.undo()); return; }
      if ((e.ctrlKey || e.metaKey) && c === 'KeyY') { e.preventDefault(); e.stopPropagation(); this.redo(); return; }
      if ((e.ctrlKey || e.metaKey) && c === 'KeyS') { e.preventDefault(); e.stopPropagation(); this.save(); return; }
      if (c === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
      if (c === 'KeyF') { this.focus(); e.stopPropagation(); return; }
      if (/^(KeyW|KeyA|KeyS|KeyD|KeyQ|KeyE|ShiftLeft|ShiftRight)$/.test(c)) { this.keys.add(c); e.preventDefault(); e.stopPropagation(); }
    };
    this.onKeyUp = (e) => { this.keys.delete(e.code); };
    this.onDown = (e) => { if (e.button === 2) { this.look = [e.clientX, e.clientY]; e.preventDefault(); } else if (e.button === 0) this.click = [e.clientX, e.clientY, e.altKey]; };
    this.onMove = (e) => { if (!this.look) return; this.yaw -= (e.clientX - this.look[0]) * 0.0035; this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - (e.clientY - this.look[1]) * 0.0035)); this.look = [e.clientX, e.clientY]; };
    this.onUp = (e) => { if (e.button === 2) this.look = null; if (e.button === 0 && this.click && e.target === this.cv) { const [x, y, alt] = this.click; if (Math.hypot(e.clientX - x, e.clientY - y) < 6) this.pick(e.clientX, e.clientY, alt); } this.click = null; };
    this.onWheel = (e) => { e.preventDefault(); this.speed = Math.max(2, Math.min(300, this.speed * (e.deltaY > 0 ? 0.85 : 1.18))); toast('Fly speed ' + this.speed.toFixed(0), 700); };
    this.onCtx = (e) => e.preventDefault();
    addEventListener('keydown', this.onKeyDown, true); addEventListener('keyup', this.onKeyUp, true); this.cv.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp); this.cv.addEventListener('wheel', this.onWheel, { passive: false }); this.cv.addEventListener('contextmenu', this.onCtx);
  }
  tick(dt) {
    const k = this.keys, sp = this.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1) * Math.min(dt, 0.1);
    const f = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (k.has('KeyW')) this.pos.addScaledVector(f, sp); if (k.has('KeyS')) this.pos.addScaledVector(f, -sp); if (k.has('KeyD')) this.pos.addScaledVector(r, sp); if (k.has('KeyA')) this.pos.addScaledVector(r, -sp); if (k.has('KeyE')) this.pos.y += sp; if (k.has('KeyQ')) this.pos.y -= sp;
    this.pos.y = Math.max(-60, Math.min(900, this.pos.y));
    const cam = this.cam; cam.position.copy(this.pos); cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); cam.updateMatrixWorld(true);
    const W = this.g.world, A = this.g.atmos; if (W) W.update(dt, { x: this.pos.x, z: this.pos.z }, cam, A); if (A) A.update(dt, new THREE.Vector3(this.pos.x, 0, this.pos.z), cam, dt);
  }
  focus() {
    if (!this.box.visible) return; const b = this.box.box; const c = b.getCenter(new THREE.Vector3()); const s = b.getSize(new THREE.Vector3()); const d = Math.max(3, Math.min(120, s.length() * 0.9));
    const dir = new THREE.Vector3(Math.sin(this.yaw), 0.35, Math.cos(this.yaw)).normalize(); this.pos.copy(c).addScaledVector(dir, d); const v = c.clone().sub(this.pos).normalize(); this.yaw = Math.atan2(-v.x, -v.z); this.pitch = Math.asin(Math.max(-1, Math.min(1, v.y)));
  }
  // ------------------------------------------------------------------ picking
  pick(x, y, deeper) {
    const r = this.cv.getBoundingClientRect(); const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.cam); rc.camera = this.cam;
    const list = []; this.g.scene.traverseVisible((o) => { if (o.isMesh && o.material && !o.userData.__tsHelper) list.push(o); });
    const hits = []; // per object: one mesh whose raycast throws (odd geometry) must not hide everything else
    for (const o of list) { if (!o.layers.test(rc.layers)) continue; try { o.raycast(rc, hits); } catch (e) { if (!this.rayErr) { this.rayErr = true; console.warn('[texture studio] raycast skipped', o.name || o.type, e && e.message); } } }
    hits.sort((a, c) => a.distance - c.distance);
    const seen = new Set(); const out = [];
    for (const it of hits) { const ms = matsOf(it.object); const mi = Array.isArray(it.object.material) ? (it.face && it.face.materialIndex) || 0 : 0; const m = ms[mi]; if (!m || m.visible === false || (m.transparent && m.opacity < 0.03)) continue;
      const id = it.object.uuid + ':' + (it.instanceId ?? it.batchId ?? '') + ':' + mi; if (seen.has(id)) continue; seen.add(id); out.push({ obj: it.object, inst: it.instanceId ?? null, batch: it.batchId ?? null, idx: mi, point: it.point.clone(), dist: it.distance, ray: rc.ray.clone() }); if (out.length >= 14) break; }
    const same = this.lastPick && Math.hypot(this.lastPick[0] - x, this.lastPick[1] - y) < 4; this.lastPick = [x, y];
    this.hits = out; this.hitIdx = deeper && same ? (this.hitIdx + 1) % Math.max(1, out.length) : deeper ? Math.min(1, out.length - 1) : 0;
    if (!out.length) { this.select(null); toast('Nothing there (sky / empty)', 900); return; }
    this.select(out[this.hitIdx]);
  }
  select(hit) {
    this.endPeek(); this.sel = hit; this.node = hit ? hit.obj : null; this.part = null; this.partKey = null;
    if (hit) { const ms = matsOf(hit.obj); this.setMaterial(Math.min(hit.idx || 0, ms.length - 1), false); } else { this.m = null; this.key = null; }
    if (hit) { try { this.part = this.partOf(hit); } catch (e) { console.warn('[texture studio] part lookup', e); this.part = null; } const o = this.part && this.partOptions(this.part)[0]; if (o) this.choosePart(o.k, false); }
    this.updateBox(); this.renderLeft(); this.renderRight();
  }
  setMaterial(i, render = true) {
    this.endPeek(); this.partKey = null; const o = this.sel && this.sel.obj; const ms = matsOf(o); const m = ms[i]; if (!m) return; this.sel.idx = i; this.m = m; this.key = RT.keyOf(m, o, i);
    const avail = RT.SLOTS.filter((s) => s.k in m); if (!avail.find((s) => s.k === this.slot)) this.slot = avail[0] ? avail[0].k : 'map';
    if (render) { this.renderLeft(); this.renderRight(); }
  }
  updateBox() {
    const s = this.sel; this.bbox.visible = false; if (!s) { this.box.visible = false; return; } const o = s.obj; const b = this.box.box;
    try {
      if (o.isBatchedMesh && s.batch != null) { const gid = o.getGeometryIdAt(s.batch); o.getBoundingBoxAt(gid, b); const m = new THREE.Matrix4(); o.getMatrixAt(s.batch, m); b.applyMatrix4(m).applyMatrix4(o.matrixWorld); }
      else if (o.isInstancedMesh && s.inst != null) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox); const m = new THREE.Matrix4(); o.getMatrixAt(s.inst, m); b.applyMatrix4(m).applyMatrix4(o.matrixWorld); }
      else b.setFromObject(o);
    } catch { b.setFromCenterAndSize(s.point, new THREE.Vector3(1, 1, 1)); }
    this.box.visible = !b.isEmpty(); this.box.updateMatrixWorld(true);
    const bd = this.building(); if (bd) { const gy = L.groundY((bd.x0 + bd.x1) / 2, (bd.z0 + bd.z1) / 2); this.bbox.box.set(new THREE.Vector3(bd.x0, gy, bd.z0), new THREE.Vector3(bd.x1, gy + (bd.totalH || 10), bd.z1)); this.bbox.visible = true; this.bbox.updateMatrixWorld(true); }
  }
  // ---- 60th: which PART of a generated building was clicked. The city draws a building's parts merged per material (one draw
  // for many buildings), so the merged mesh can't tell a window frame from a downpipe. The clicked building is generated again
  // (same generator + seeds → identical geometry) with one throw-away mesh per part key, and the same ray picks the part.
  inCity(o) { for (let p = o; p; p = p.parent) if (p.name === 'cityBatched' || /^chunk\d+$/.test(p.name || '')) return true; return false; }
  partOf(hit) {
    if (!hit || !hit.ray || !this.inCity(hit.obj) || !plan.buildings) return null; const p = hit.point, M = 1.4;
    let best = null, ba = 1e18; for (const b of plan.buildings) { if (p.x < b.x0 - M || p.x > b.x1 + M || p.z < b.z0 - M || p.z > b.z1 + M) continue; const a = (b.x1 - b.x0) * (b.z1 - b.z0); if (a < ba) { ba = a; best = b; } }
    const walls = []; for (const ch of plan.byChunk) for (const w of ch.walls || []) if (p.x > w.x0 - 0.3 && p.x < w.x1 + 0.3 && p.z > w.z0 - 0.3 && p.z < w.z1 + 0.3) walls.push(w);
    if (!best && !walls.length) return null;
    const mb = new MultiBuilder(null, { raw: true });
    if (best) { const keep = { s: best._signSpans && best._signSpans.slice(), i: best.signIdx }; try { buildBase(best, mb); buildDetail(best, mb); buildWindows(best, mb, mb); } finally { best._signSpans = keep.s; best.signIdx = keep.i; } }
    for (const w of walls) buildWall(w, mb);
    const rc = new THREE.Raycaster(); rc.ray.copy(hit.ray); rc.far = hit.dist + 3; const tm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); let tag = null, bd = 1e9;
    for (const [k, B] of mb.b) { const g = B.build(); if (!g) continue; const m = new THREE.Mesh(g, tm); m.updateMatrixWorld(true); const hs = []; m.raycast(rc, hs); for (const x of hs) { const d = Math.abs(x.distance - hit.dist); if (d < bd) { bd = d; tag = k; } } g.dispose(); }
    tm.dispose(); if (!tag || bd > 0.3) return best ? { building: best, tag: null } : null;
    const sp = splitKey(tag); return { building: sp && sp.building != null ? plan.buildings.find((b) => b.id === sp.building) || best : null, tag };
  }
  // the keys a clicked part can be edited under: its kind for every building, this building only, the base material
  partOptions(part) {
    if (!part || !part.tag) return []; const out = []; const sp = splitKey(part.tag); const role = sp && sp.building != null ? sp.base : part.tag; const base = parentKey(role);
    const kind = (k) => materialLabel(k); const ok = (k) => !parentKey(k) || splittable(k);
    if (ok(role)) out.push({ k: role, label: kind(role) + ' — every building', hint: ROLE_DEFS[role] ? 'own material of this kind of part' : 'every building with this facade / roof' });
    if (sp && sp.building != null && ok(part.tag)) out.push({ k: part.tag, label: 'Only building #' + sp.building + ' — ' + kind(role), hint: 'its own copy (its chunk is rebuilt with it)' });
    if (base) out.push({ k: base, label: 'Base material: ' + kind(base), hint: 'everything that has no material of its own' });
    return out;
  }
  choosePart(k, render = true) {
    const m = ensureMat(k); if (!m) return; this.endPeek(); this.partKey = k; this.m = m; this.key = 'mat:' + k;
    const avail = RT.SLOTS.filter((s) => s.k in m); if (!avail.find((s) => s.k === this.slot)) this.slot = avail[0] ? avail[0].k : 'map';
    if (render) { this.renderLeft(); this.renderRight(); }
  }
  // the generated building under a click on a merged city batch (the batch itself is one mesh for a whole cell)
  building() {
    const s = this.sel; if (this.part && this.part.building) return this.part.building; if (!s || !s.obj.isBatchedMesh || !plan.buildings) return null; const p = s.point; let best = null, bd = 1e9;
    for (const b of plan.buildings) { if (p.x < b.x0 - 0.6 || p.x > b.x1 + 0.6 || p.z < b.z0 - 0.6 || p.z > b.z1 + 0.6) continue; const d = Math.abs((b.x0 + b.x1) / 2 - p.x) + Math.abs((b.z0 + b.z1) / 2 - p.z); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  // ------------------------------------------------------------------ rules
  labelFor() {
    const k = this.key, m = this.m, o = this.sel && this.sel.obj; const [kind, ...r] = k.split(':');
    if (kind === 'mat') return materialLabel(r.join(':')); if (kind === 'veh') return 'Vehicle ' + r[0] + ' · ' + r.slice(1).join(':');
    if (kind === 'obj') return (o ? objLabel(o) : 'object') + ' · ' + (m.name || m.type) + ' (unique copy)'; if (kind === 'name') return m.name + ' (' + m.type + ')';
    return (o ? objLabel(o) : 'object') + ' · unnamed ' + m.type;
  }
  targetFor() {
    const k = this.key, o = this.sel && this.sel.obj; const t = { kind: k.split(':')[0], material: this.m.name || '', type: this.m.type, object: o ? objLabel(o) : '' };
    if (t.kind === 'obj') { const mm = k.match(/^obj:(.*)\|(\d+)$/); t.path = mm[1]; t.slot = +mm[2]; t.fp = RT.objFingerprint(o, t.slot); }
    return t;
  }
  rule() { return this.key ? RT.getRule(this.key) : null; }
  // a vehicle type's first edit swaps its meshes to their own copy of the shared material: follow it (and back after restore)
  syncSel() { const s = this.sel; if (!s || this.partKey) return; const cur = matsOf(s.obj)[s.idx]; if (cur && cur !== this.m) { this.endPeek(); this.m = cur; this.key = RT.keyOf(cur, s.obj, s.idx); this.renderLeft(); this.renderRight(); } }
  async edit(label, fn, merge = null) {
    if (!this.m || !this.key) return; this.endPeek(); const k = this.key; const cur = RT.getRule(k);
    const r = cur ? clone(cur) : RT.newRule(k, this.labelFor(), this.targetFor()); delete r.__rev; fn(r);
    for (const s of Object.keys(r.slots)) if (!r.slots[s]) delete r.slots[s]; for (const p of Object.keys(r.props)) if (r.props[p] == null) delete r.props[p];
    const empty = !Object.keys(r.slots).length && !Object.keys(r.props).length && !k.startsWith('obj:');
    try { await RT.setRule(k, empty ? null : r, { label, merge }); } catch (e) { toast('Failed: ' + (e.message || e), 3500); }
    this.syncSel(); this.live();
  }
  defaultSlot(k) {
    const b = RT.originalOf(this.m); const o = (b ? b.slots[k] : this.m[k]) || (b ? b.slots.map : this.m.map); const sr = { tex: null, maxSize: RT.S.settings.maxSize };
    if (o && o.repeat) { sr.repeat = [o.repeat.x, o.repeat.y]; sr.offset = [o.offset.x, o.offset.y]; sr.rotation = +((o.rotation * 180) / Math.PI).toFixed(3); sr.wrap = RT.WRAP_NAME(o.wrapS); }
    return sr;
  }
  slotEdit(label, fn, merge) { const k = this.slot; return this.edit(label, (r) => { const sr = r.slots[k] ? r.slots[k] : (r.slots[k] = this.defaultSlot(k)); fn(sr, r); }, merge); }
  async assign(hash, slot = this.slot) {
    if (!this.m) { toast('Select an object first'); return; } if (!(slot in this.m)) { toast('This material has no ' + slot + ' slot'); return; }
    const t = RT.S.manifest.textures[hash]; this.slot = slot;
    let adapted = '';
    await this.slotEdit('assign texture', (sr, r) => { sr.tex = hash; sr.clear = false; if (t && RT.COMPRESSED.has(t.ext) && sr.flipV == null) sr.flipV = true; if (slot === 'map') adapted = this.adaptForTexture(r); });
    if (adapted) toast(adapted, 5200);
    const err = RT.S.errors.get(this.key); if (err) toast(err, 4000); else toast('Applied ' + (t ? t.name : hash.slice(0, 8)) + ' → ' + RT.SLOTS.find((s) => s.k === slot).label);
    this.renderLeft(); this.renderRight();
  }
  // 60th: a photo texture on a plain vertex-coloured material: the game's per-object tint multiplied it (dark lamp posts went
  // pitch black) and a high metalness turned it into a dark mirror. Both are set in the rule (visible + switchable in Material
  // settings) — only when the material had no base colour texture of its own and the rule doesn't set them already.
  adaptForTexture(r) {
    const m = this.m, b = RT.originalOf(m); const origMap = b ? b.slots.map : m.map; if (origMap) return ''; const did = [];
    const vc = b && b.props.vertexColors != null ? b.props.vertexColors : m.vertexColors; if (vc && r.props.vertexColors == null) { r.props.vertexColors = false; did.push('per-object tint off'); }
    const mt = b && b.props.metalness != null ? b.props.metalness : m.metalness; if (mt >= 0.5 && r.props.metalness == null) { r.props.metalness = 0.3; did.push('metalness ' + mt.toFixed(2) + ' → 0.30'); }
    const ro = b && b.props.roughness != null ? b.props.roughness : m.roughness; if (did.length && ro < 0.5 && r.props.roughness == null) { r.props.roughness = 0.55; did.push('roughness → 0.55'); }
    return did.length ? 'Texture shown as-is: ' + did.join(', ') + ' (Material settings — change back any time)' : '';
  }
  async replaceFromFile(slot = this.slot) {
    if (!this.m) return; const files = await this.pickFiles(false); if (!files.length) return;
    try { const r = await RT.importFile(files[0], { category: this.guessCategory() }); if (r.dup) toast('Already in the library — reusing it'); this.libSel = r.hash; await this.assign(r.hash, slot); }
    catch (e) { toast('Import failed: ' + (e.message || e), 4000); }
  }
  guessCategory() {
    const k = this.key || '', o = this.sel && this.sel.obj; const n = (k + ' ' + (o ? o.name : '') + ' ' + (this.m ? this.m.name : '')).toLowerCase();
    if (k.startsWith('veh:')) return 'Vehicle'; if (o && o.isSkinnedMesh || /npc|head|skin|hair|cloth/.test(n)) return 'Character'; if (/road|asphalt|lane|zebra/.test(n)) return 'Road';
    if (/walk|kerb|pave|tile/.test(n)) return 'Pavement'; if (/roof/.test(n)) return 'Roof'; if (/mat:f_|facade|wall|concrete|plaster|brick|station|building/.test(n)) return 'Building';
    if (/tree|leaf|palm|bush|lawn|grass|vine|plant|flower/.test(n)) return 'Vegetation'; if (/sign|board|fascia/.test(n)) return 'Signage'; if (/water|sea|lake/.test(n)) return 'Water';
    if (/sky|cloud/.test(n)) return 'Environment'; if (/interior|floor|ceiling|customs|room/.test(n)) return 'Interior'; return 'Prop';
  }
  pickFiles(multiple) { return new Promise((res) => { const i = h('input', { type: 'file', accept: RT.ACCEPT, style: { display: 'none' } }); if (multiple) i.multiple = true; i.addEventListener('change', () => { const f = [...i.files]; i.remove(); res(f); }); i.addEventListener('cancel', () => { i.remove(); res([]); }); document.body.appendChild(i); i.click(); }); }
  async undo() { const e = await RT.undo(); toast(e ? 'Undo: ' + e.label : 'Nothing to undo', 900); this.syncSel(); this.renderLeft(); this.renderRight(); }
  async redo() { const e = await RT.redo(); toast(e ? 'Redo: ' + e.label : 'Nothing to redo', 900); this.syncSel(); this.renderLeft(); this.renderRight(); }
  async save() { try { await RT.saveNow(); toast('Saved to ' + RT.S.backend.label); } catch (e) { toast('Save failed: ' + (e.message || e), 4000); } }
  // hold-to-compare: the game's original slots / settings on this material, without touching the rule
  startPeek() {
    const m = this.m; const b = m && RT.originalOf(m); if (!b || this.peek) return; const save = { m, slots: {}, props: RT.snapProps(m) }; let prog = false;
    for (const [k, t] of Object.entries(b.slots)) { save.slots[k] = m[k]; if (!!m[k] !== !!t) prog = true; m[k] = t; }
    for (const [k, v] of Object.entries(b.props)) { const c = m[k]; if (c && c.isColor) c.set(v); else if (c && c.isVector2) c.set(v[0], v[1]); else m[k] = v; } if (prog) m.needsUpdate = true; this.peek = save;
  }
  endPeek() {
    const p = this.peek; if (!p) return; this.peek = null; const m = p.m; let prog = false;
    for (const [k, t] of Object.entries(p.slots)) { if (!!m[k] !== !!t) prog = true; m[k] = t; } for (const [k, v] of Object.entries(p.props)) { const c = m[k]; if (c && c.isColor) c.set(v); else if (c && c.isVector2) c.set(v[0], v[1]); else m[k] = v; } if (prog) m.needsUpdate = true;
  }
  onRT(type) { if (type === 'save') this.renderStatus(); else if (type === 'applied') this.live(); else if (type === 'library') { if (!this.renderLibT) this.renderLibT = requestAnimationFrame(() => { this.renderLibT = 0; this.renderLibrary(); }); } }
  // ------------------------------------------------------------------ UI
  buildUI() {
    const H = Math.max(360, innerHeight - 24);
    this.left = new Win('Texture Studio', { x: 10, y: 12, w: 380, h: H, onClose: () => this.close() });
    this.right = new Win('Texture Browser', { x: Math.max(400, innerWidth - 418), y: 12, w: 406, h: H, onClose: () => this.close() });
    const tb = (label, fn, title) => { const b = h('button', { title, onclick: fn }, label); b.style.fontSize = '12px'; return b; };
    this.left.extra.append(tb('↶', () => this.undo(), 'Undo (Ctrl+Z)'), tb('↷', () => this.redo(), 'Redo (Ctrl+Y)'), tb('💾', () => this.save(), 'Save now (Ctrl+S) — also saved automatically'));
    this.leftBody = h('div'); this.left.body.append(h('div', { cls: 'ed-hint' }, 'Click an object in the world · Alt+click again = the object behind · right-drag look · WASD / Q E fly · Shift fast · wheel speed · F focus · Ctrl+Z / Ctrl+Y · Esc closes'), this.leftBody);
    this.rightBody = h('div'); this.statusEl = h('div', { cls: 'ed-hint' }); this.right.body.append(this.rightBody);
    this.renderLeft(); this.renderRight();
  }
  renderLeft() {
    if (!this.leftBody) return; const sc = this.left.body.scrollTop; const B = this.leftBody; B.replaceChildren(); const s = this.sel;
    // search
    const res = h('div', { cls: 'ed-list ts-list', style: { display: 'none' } });
    const q = h('input', { type: 'text', placeholder: 'Find objects / materials by name…', style: { flex: 1 } }); q.addEventListener('change', () => this.search(q.value, res));
    B.append(section('Find', !s, h('div', { cls: 'ts-row' }, q, btn('Search', () => this.search(q.value, res))), res));
    if (!s) { B.append(h('div', { cls: 'ed-hint' }, 'Nothing selected. Click a building, road, vehicle, person, tree, prop, interior wall or the sky.')); this.left.body.scrollTop = sc; return; }
    // hierarchy
    const o = s.obj; const crumb = h('div', { cls: 'ts-crumb' }); const chain = []; for (let p = o; p; p = p.parent) chain.unshift(p);
    chain.forEach((p, i) => { if (i) crumb.append(h('i', {}, '›')); crumb.append(h('a', { title: p.type, onclick: () => { this.node = p; this.renderLeft(); } }, p === this.g.scene ? 'scene' : objLabel(p))); });
    const info = h('div', { cls: 'ts-kv' }); const kv = (a, b) => info.append(h('span', {}, a), h('span', { title: String(b) }, String(b)));
    kv('Object', objLabel(o) + ' · ' + o.type); const g = o.geometry; if (g && g.attributes && g.attributes.position) kv('Geometry', g.attributes.position.count.toLocaleString() + ' vertices' + (g.groups && g.groups.length > 1 ? ' · ' + g.groups.length + ' material groups' : ''));
    if (s.inst != null) kv('Instance', '#' + s.inst + ' of ' + o.count); if (s.batch != null) kv('Batch item', '#' + s.batch + ' (merged city cell)');
    kv('Hit point', s.point.toArray().map((v) => v.toFixed(1)).join(', ') + ' · ' + s.dist.toFixed(1) + ' m');
    const bd = this.building(); if (bd) kv('Building', 'b:' + bd.id + ' · ' + (bd.style || '?') + (bd.floors ? ' · ' + bd.floors + ' floors' : '') + ' (blue box)');
    const v = RT.vehOf(o); if (v) kv('Vehicle', v.userData.type + (v.userData.variant ? ' · ' + v.userData.variant : ''));
    const hier = section('Hierarchy', true, crumb, info);
    if (this.hits.length > 1) { const hl = h('div', { cls: 'ed-list', style: { maxHeight: '110px' } }); this.hits.forEach((it, i) => { const m = matsOf(it.obj)[it.idx]; hl.append(h('div', { cls: i === this.hitIdx ? 'sel' : '', onclick: () => { this.hitIdx = i; this.select(it); } }, objLabel(it.obj), h('small', {}, (m ? m.name || m.type : '') + ' · ' + it.dist.toFixed(1) + ' m'))); }); hier.b.append(h('div', { cls: 'ed-hint' }, 'Under the cursor (front to back):'), hl); }
    if (this.node && this.node !== o) { const meshes = []; this.node.traverse((c) => { if (c.isMesh && meshes.length < 300) meshes.push(c); }); const ml = h('div', { cls: 'ed-list', style: { maxHeight: '150px' } });
      for (const c of meshes) { const m0 = matsOf(c)[0]; ml.append(h('div', { onclick: () => this.select({ obj: c, inst: null, batch: null, idx: 0, point: c.getWorldPosition(new THREE.Vector3()), dist: c.getWorldPosition(new THREE.Vector3()).distanceTo(this.pos) }) }, objLabel(c), h('small', {}, c.type + ' · ' + (m0 ? m0.name || m0.type : '')))); }
      hier.b.append(h('div', { cls: 'ed-hint' }, 'Meshes inside ' + objLabel(this.node) + ' (' + meshes.length + (meshes.length >= 300 ? '+' : '') + '):'), ml); }
    B.append(hier);
    // 60th: the clicked part of a building (see partOf) — edit it for every building, for this building only, or the base
    const po = this.partOptions(this.part);
    if (po.length) { const pl = h('div', { cls: 'ed-list', style: { maxHeight: 'none' } });
      for (const o of po) { const r = RT.getRule('mat:' + o.k); pl.append(h('div', { cls: this.partKey === o.k ? 'sel' : '', onclick: () => this.choosePart(o.k) }, o.label, r ? h('span', { cls: 'ts-badge ed' }, 'edited') : null, h('small', {}, o.hint + (SPLIT.has(o.k) || !parentKey(o.k) ? '' : ' · gets its own draw when edited')))); }
      B.append(section('Part: ' + materialLabel(splitKey(this.part.tag) && splitKey(this.part.tag).building != null ? splitKey(this.part.tag).base : this.part.tag), true, h('div', { cls: 'ed-hint' }, 'Edit this part for:'), pl)); }
    else if (this.part && this.part.building) B.append(h('div', { cls: 'ed-hint' }, 'Building #' + this.part.building.id + ': the clicked surface could not be matched to a part — the materials below apply.'));
    // materials of the mesh
    const ms = matsOf(o); const ml = h('div');
    ms.forEach((m, i) => { const k = RT.keyOf(m, o, i); const r = RT.getRule(k); const cv = h('canvas', { cls: 'ts-thumb', width: 34, height: 34 }); drawInto(cv, m.map || m.emissiveMap || null, m.color ? '#' + m.color.getHexString() : '');
      const row = h('div', { cls: 'ts-slot' + (m === this.m ? ' act' : ''), onclick: () => this.setMaterial(i) }, cv, h('div', { cls: 't' }, h('b', {}, (m.name || '(unnamed)'), r ? h('span', { cls: 'ts-badge ed' }, 'edited') : null), h('small', {}, m.type + ' · ' + k)));
      ml.append(row); });
    B.append(section('Materials (' + ms.length + ')', true, ml));
    if (this.m) B.append(this.inspector());
    this.left.body.scrollTop = sc;
  }
  inspector() {
    const m = this.m, k = this.key, r = this.rule(), d = RT.describeKey(k); const u = RT.usersOf(m); const sec = section('Material: ' + (m.name || '(unnamed ' + m.type + ')'), true);
    const info = h('div', { cls: 'ts-kv' }); const kv = (a, b) => info.append(h('span', {}, a), h('span', { title: String(b) }, String(b)));
    kv('Type', m.type); kv('Saved as', k); kv('Applies to', d.scope); kv('Shared by', u.meshes + ' mesh' + (u.meshes === 1 ? '' : 'es') + ' · ' + u.instances.toLocaleString() + ' drawn instance' + (u.instances === 1 ? '' : 's'));
    const set = RT.materialsFor(k); if (set.length > 1) kv('Key matches', set.length + ' material objects');
    if (m.onBeforeCompile && m.onBeforeCompile.toString() !== 'onBeforeCompile( /* shaderobject, renderer */ ) {}') kv('Shader', 'game shader patch kept (edited in place)');
    sec.b.append(info);
    if ((u.meshes > 1 || set.length > 1) && !k.startsWith('veh:')) sec.b.append(h('div', { cls: 'ts-warn' }, 'Shared material — edits change every object listed above.' + (RT.canMakeUnique(this.sel.obj) && !k.startsWith('obj:') ? ' Use "Make unique" to edit only this object.' : '')));
    if (k.startsWith('veh:')) sec.b.append(h('div', { cls: 'ed-hint' }, 'Vehicle materials are shared by every car in the game (paint colour is per vertex). An edit here gives this vehicle type its own copy — other models keep theirs; cars of this type spawned later get it too.'));
    if (this.partKey) sec.b.append(h('div', { cls: 'ed-hint' }, 'Part material (60th): ' + (SPLIT.has(this.partKey) || !parentKey(this.partKey) ? 'drawn with its own material.' : 'drawn merged with its base material until edited — the first edit gives it its own draw (the affected buildings are regenerated, identical geometry).')));
    else if (this.sel.obj.isBatchedMesh) sec.b.append(h('div', { cls: 'ed-hint' }, 'Merged city batch (one draw call per material). Click a building part to edit only that kind of part, or one building\'s own copy (Part section).'));
    const err = RT.S.errors.get(k); if (err) sec.b.append(h('div', { cls: 'ts-err' }, '⚠ ' + err));
    const dr = RT.S.driven.get(k); if (dr && dr.length) sec.b.append(h('div', { cls: 'ts-warn' }, 'Changed by the game at runtime (lighting / weather / effects): ' + dr.join(', ') + ' — the game overrides these values.'));
    const bar = h('div', { cls: 'ts-bar' });
    if (RT.canMakeUnique(this.sel.obj) && !k.startsWith('obj:') && !this.sel.obj.isInstancedMesh) bar.append(btn('Make unique for this object', () => this.makeUnique(), { title: 'Give only this mesh a private copy of the material (the shared one stays unchanged for everything else)' }));
    const pk = btn('Hold: original', () => {}, { title: 'Hold to see the game\'s original material in the world' }); pk.addEventListener('pointerdown', () => { this.startPeek(); pk.classList.add('on'); }); for (const ev of ['pointerup', 'pointerleave']) pk.addEventListener(ev, () => { this.endPeek(); pk.classList.remove('on'); });
    bar.append(pk);
    if (r) { bar.append(check('Enabled', r.enabled, (v) => this.edit(v ? 'enable' : 'disable', (x) => { x.enabled = v; })), btn(k.startsWith('obj:') ? 'Remove unique copy' : 'Restore original', () => (k.startsWith('obj:') ? this.dropUnique() : this.edit('restore material', (x) => { x.slots = {}; x.props = {}; }).then(() => { this.renderLeft(); this.renderRight(); })), { cls: 'warn', title: k.startsWith('obj:') ? 'Give the object back its shared material (undoable)' : 'Remove every change on this material (undoable)' })); }
    sec.b.append(bar);
    // slots
    const sl = h('div'); this.slotThumbs = [];
    for (const s of RT.SLOTS) { if (!(s.k in m)) continue; const cur = m[s.k]; const sr = r && r.slots[s.k]; const cv = h('canvas', { cls: 'ts-thumb', width: 34, height: 34 }); drawInto(cv, cur); this.slotThumbs.push([cv, s.k]);
      const lib = sr && sr.tex ? RT.S.manifest.textures[sr.tex] : null; const state = sr ? (sr.clear ? 'cleared' : lib ? 'replaced: ' + lib.name : 'original image, edited') : cur ? 'original' : 'empty';
      const row = h('div', { cls: 'ts-slot' + (this.slot === s.k ? ' act' : ''), onclick: () => { this.slot = s.k; this.renderLeft(); this.renderRight(); } }, cv,
        h('div', { cls: 't' }, h('b', {}, s.label, sr ? h('span', { cls: 'ts-badge ed' }, sr.clear ? 'cleared' : 'edited') : null), h('small', {}, state + (cur ? ' · ' + texInfo(cur) : ''))),
        btn('Replace…', (e) => { e.stopPropagation(); this.slot = s.k; this.replaceFromFile(s.k); }, { title: 'Pick an image file (PNG / JPG / WEBP / KTX2 / DDS) and apply it to this slot' }),
        sr ? btn('↺', (e) => { e.stopPropagation(); this.edit('restore ' + s.label, (x) => { delete x.slots[s.k]; }).then(() => { this.renderLeft(); this.renderRight(); }); }, { title: 'Restore this slot' }) : null);
      sl.append(row); }
    if (!sl.children.length) sl.append(h('div', { cls: 'ed-hint' }, m.isShaderMaterial ? 'Custom shader material — its textures are shader uniforms generated by the game (not editable here).' : 'This material type has no texture slots.'));
    sec.b.append(h('div', { cls: 'ed-hint' }, 'Texture slots'), sl);
    // settings
    const props = h('div'); const b = RT.originalOf(m);
    for (const p of RT.PROPS) { if (!(p.k in m) || m[p.k] == null) continue; const cur = r && r.props[p.k] != null ? r.props[p.k] : (p.kind === 'color' ? '#' + m[p.k].getHexString() : p.kind === 'vec' ? m[p.k].x : m[p.k]);
      const onv = (val) => this.edit('set ' + p.label, (x) => { x.props[p.k] = val; }, 'prop:' + p.k);
      const w = p.kind === 'color' ? color(p.label, cur, onv) : p.kind === 'bool' ? check(p.label, !!cur, onv) : num(p.label, typeof cur === 'number' ? cur : 0, { min: p.min, max: p.max, step: p.step }, onv);
      if (r && r.props[p.k] != null) { const reset = h('button', { cls: 'ed-btn', title: 'Back to the original value' + (b ? ' (' + JSON.stringify(b.props[p.k]) + ')' : ''), onclick: () => this.edit('reset ' + p.label, (x) => { delete x.props[p.k]; }).then(() => this.renderLeft()) }, '↺'); w.append(reset); }
      props.append(w); }
    if (props.children.length) sec.b.append(section('Material settings', true, props));
    return sec;
  }
  async makeUnique() {
    const o = this.sel.obj, i = this.sel.idx; const shared = this.rule(); const k = RT.makeUnique(o, i); const ms = matsOf(o); this.m = ms[i]; this.key = k;
    const r = RT.newRule(k, this.labelFor(), this.targetFor()); if (shared) { r.slots = clone(shared.slots); r.props = clone(shared.props); } r.unique = true;
    await RT.setRule(k, r, { label: 'make unique' }); toast('This object now has its own material copy'); this.renderLeft(); this.renderRight();
  }
  async dropUnique() { await RT.setRule(this.key, null, { label: 'remove unique copy' }); const o = this.sel.obj; this.setMaterial(this.sel.idx, false); void o; this.renderLeft(); this.renderRight(); }
  search(q, res) {
    q = (q || '').trim().toLowerCase(); res.replaceChildren(); res.style.display = q ? '' : 'none'; if (!q) return; let n = 0;
    this.g.scene.traverse((o) => { if (n >= 100 || o.userData.__tsHelper) return; const ms = matsOf(o); const mi = ms.findIndex((m) => m && m.name && m.name.toLowerCase().includes(q)); if (!(o.name && o.name.toLowerCase().includes(q)) && mi < 0) return; if (!o.isMesh && mi < 0) { /* groups by name: show them too */ }
      n++; res.append(h('div', { onclick: () => { const mesh = o.isMesh ? o : null; if (mesh) this.select({ obj: mesh, inst: null, batch: null, idx: Math.max(0, mi), point: mesh.getWorldPosition(new THREE.Vector3()), dist: mesh.getWorldPosition(new THREE.Vector3()).distanceTo(this.pos) }); else { const first = []; o.traverse((c) => { if (c.isMesh && !first.length) first.push(c); }); if (first[0]) { this.select({ obj: first[0], inst: null, batch: null, idx: 0, point: first[0].getWorldPosition(new THREE.Vector3()), dist: 0 }); this.node = o; this.renderLeft(); } } this.focus(); } },
        objLabel(o), h('small', {}, o.type + (ms.length ? ' · ' + ms.map((m) => m.name || m.type).join(', ').slice(0, 60) : '')))); });
    if (!n) res.append(h('div', { cls: 'ed-hint' }, 'No match'));
  }
  // ------------------------------------------------------------------ right window
  renderRight() {
    if (!this.rightBody) return; const sc = this.right.body.scrollTop; const B = this.rightBody; B.replaceChildren();
    B.append(this.slotEditor()); this.libSec = section('Texture library', true); B.append(this.libSec); this.renderLibrary(); B.append(this.storage()); this.drawPreviews(); this.right.body.scrollTop = sc;
  }
  slotEditor() {
    const m = this.m; const sec = section('Slot editor' + (m ? ' — ' + RT.SLOTS.find((s) => s.k === this.slot).label : ''), true);
    if (!m) { sec.b.append(h('div', { cls: 'ed-hint' }, 'Select an object, then a material slot.')); return sec; }
    if (!(this.slot in m)) { sec.b.append(h('div', { cls: 'ed-hint' }, 'This material has no texture slots.')); return sec; }
    const b = RT.originalOf(m); const orig = b ? b.slots[this.slot] : m[this.slot]; const r = this.rule(); const sr = r && r.slots[this.slot];
    this.pvO = h('canvas', { width: 176, height: 176 }); this.pvN = h('canvas', { width: 176, height: 176 }); this.pvOcap = h('figcaption'); this.pvNcap = h('figcaption');
    sec.b.append(h('div', { cls: 'ts-pv' }, h('figure', {}, this.pvO, this.pvOcap), h('figure', {}, this.pvN, this.pvNcap)));
    this.drawPreviews();
    const bar = h('div', { cls: 'ts-bar' }, btn('Replace from file…', () => this.replaceFromFile(), { title: 'PNG, JPG, WEBP, GIF, AVIF, BMP, KTX2 or DDS — copied into the library, then applied' }),
      this.libSel ? btn('Use selected library texture', () => this.assign(this.libSel), { title: 'Assign the texture selected in the library below' }) : null,
      orig || (sr && sr.tex) ? btn('Clear slot', () => this.slotEdit('clear slot', (s) => { s.clear = true; s.tex = null; }).then(() => { this.renderLeft(); this.renderRight(); }), { title: 'Remove the texture from this slot (the material uses its plain settings)' }) : null,
      sr ? btn('Restore slot', () => this.edit('restore slot', (x) => { delete x.slots[this.slot]; }).then(() => { this.renderLeft(); this.renderRight(); }), { cls: 'warn' }) : null);
    sec.b.append(bar);
    const has = (sr && (sr.tex || (!sr.clear && orig))) || (!sr && orig); if (!has) { sec.b.append(h('div', { cls: 'ed-hint' }, 'The slot is empty — replace it from a file or the library to edit tiling and colour.')); return sec; }
    const cur = sr || this.defaultSlot(this.slot); const lib = sr && sr.tex ? RT.S.manifest.textures[sr.tex] : null; const comp = lib && RT.COMPRESSED.has(lib.ext);
    const tr = section('UV transform (keeps the mesh UVs)', true,
      num('Tiling X', cur.repeat ? cur.repeat[0] : 1, { min: 0.05, max: 16, step: 0.01 }, (v) => this.slotEdit('tiling', (s) => { s.repeat = [v, (s.repeat || [1, 1])[1]]; }, 'tile')),
      num('Tiling Y', cur.repeat ? cur.repeat[1] : 1, { min: 0.05, max: 16, step: 0.01 }, (v) => this.slotEdit('tiling', (s) => { s.repeat = [(s.repeat || [1, 1])[0], v]; }, 'tile')),
      num('Offset X', cur.offset ? cur.offset[0] : 0, { min: -1, max: 1, step: 0.005 }, (v) => this.slotEdit('offset', (s) => { s.offset = [v, (s.offset || [0, 0])[1]]; }, 'off')),
      num('Offset Y', cur.offset ? cur.offset[1] : 0, { min: -1, max: 1, step: 0.005 }, (v) => this.slotEdit('offset', (s) => { s.offset = [(s.offset || [0, 0])[0], v]; }, 'off')),
      num('Rotation °', cur.rotation || 0, { min: -180, max: 180, step: 1 }, (v) => this.slotEdit('rotation', (s) => { s.rotation = v; }, 'rot')),
      select('Wrap', [['repeat', 'Repeat'], ['mirror', 'Mirrored repeat'], ['clamp', 'Clamp to edge']], cur.wrap || 'repeat', (v) => this.slotEdit('wrap', (s) => { s.wrap = v; })),
      check('Flip vertically', !!cur.flipV, (v) => this.slotEdit('flip', (s) => { s.flipV = v; })),
      this.slot === 'normalMap' ? check('Flip green (DirectX normal map)', !!cur.flipGreen, (v) => this.slotEdit('flip green', (s) => { s.flipGreen = v; })) : null,
      btn('Reset transform to original', () => this.slotEdit('reset transform', (s) => { const d = this.defaultSlot(this.slot); s.repeat = d.repeat; s.offset = d.offset; s.rotation = d.rotation; s.wrap = d.wrap; }).then(() => this.renderRight())));
    sec.b.append(tr);
    if (comp) sec.b.append(h('div', { cls: 'ed-hint' }, lib.ext.toUpperCase() + ' is GPU-compressed: used at its own resolution, no colour adjustment (re-encode the source instead).'));
    else {
      const a = cur.adjust || {}; const adj = (key, label, min, max, step) => num(label, a[key] || 0, { min, max, step }, (v) => this.slotEdit('colour', (s) => { s.adjust = Object.assign({ bright: 0, contrast: 0, sat: 0, hue: 0, tint: '#ffffff', invert: false }, s.adjust || {}, { [key]: v }); }, 'adj:' + key));
      sec.b.append(section('Colour adjustment', false, adj('bright', 'Brightness', -1, 1, 0.01), adj('contrast', 'Contrast', -0.95, 0.95, 0.01), adj('sat', 'Saturation', -1, 1, 0.01), adj('hue', 'Hue shift °', -180, 180, 1),
        color('Tint', a.tint || '#ffffff', (v) => this.slotEdit('tint', (s) => { s.adjust = Object.assign({ bright: 0, contrast: 0, sat: 0, hue: 0, invert: false }, s.adjust || {}, { tint: v }); }, 'adj:tint')),
        check('Invert', !!a.invert, (v) => this.slotEdit('invert', (s) => { s.adjust = Object.assign({ bright: 0, contrast: 0, sat: 0, hue: 0, tint: '#ffffff' }, s.adjust || {}, { invert: v }); })),
        btn('Reset colour', () => this.slotEdit('reset colour', (s) => { delete s.adjust; }).then(() => this.renderRight()))));
      const ms = cur.maxSize || RT.S.settings.maxSize; const big = ms > 512;
      sec.b.append(select('Max size (GPU)', [128, 256, 512, 1024, 2048].map((n) => [n, n + ' px' + (n > 512 ? ' (above the game\'s 512 budget)' : '')]), ms, (v) => this.slotEdit('max size', (s) => { s.maxSize = +v; }).then(() => this.renderRight())),
        h('div', { cls: big ? 'ts-warn' : 'ed-hint' }, big ? 'Above 512 px costs VRAM and bandwidth on the target GPU (GTX 1660 S) — keep it for close-up hero surfaces.' : 'The library keeps your file at full resolution; this only sets the uploaded size.'));
    }
    return sec;
  }
  drawPreviews() {
    if (!this.pvO || !this.m || !this.pvO.isConnected) return; const m = this.m; const b = RT.originalOf(m); const orig = b ? b.slots[this.slot] : m[this.slot]; const cur = this.peek ? null : m[this.slot];
    drawInto(this.pvO, orig); drawInto(this.pvN, cur, cur === null && this.rule()?.slots[this.slot]?.clear ? 'cleared' : null);
    this.pvOcap.replaceChildren(h('b', {}, 'Original'), texInfo(orig)); const sr = this.rule() && this.rule().slots[this.slot]; const lib = sr && sr.tex ? RT.S.manifest.textures[sr.tex] : null;
    this.pvNcap.replaceChildren(h('b', {}, sr ? 'Replacement' : 'Current (unchanged)'), (lib ? lib.name + ' · ' : '') + texInfo(cur));
  }
  live() { if (this.liveT) return; this.liveT = requestAnimationFrame(() => { this.liveT = 0; this.drawPreviews(); for (const [cv, k] of this.slotThumbs || []) if (cv.isConnected && this.m) drawInto(cv, this.m[k]); this.renderStatus(); }); }
  renderLibrary() {
    const sec = this.libSec; if (!sec || !sec.isConnected) return; sec.b.replaceChildren(); const T = RT.S.manifest.textures;
    const q = h('input', { type: 'text', value: this.libQ, placeholder: 'Search name / tag / format…', style: { flex: 1 } }); q.addEventListener('input', () => { this.libQ = q.value; this.fillGrid(grid); });
    const cat = h('select', {}, ['All', ...RT.CATEGORIES].map((c) => { const o = h('option', { value: c }, c); if (c === this.libCat) o.selected = true; return o; })); cat.addEventListener('change', () => { this.libCat = cat.value; this.fillGrid(grid); });
    sec.b.append(h('div', { cls: 'ts-row' }, q, cat), h('div', { cls: 'ts-bar' }, btn('Import images…', () => this.importMany(), { title: 'Add files to the library (stored in ' + (RT.S.backend ? RT.S.backend.label : '?') + ')' }), h('span', { cls: 'ed-hint' }, Object.keys(T).length + ' texture(s)')));
    const grid = h('div', { cls: 'ts-grid' }); sec.b.append(grid); this.fillGrid(grid);
    this.libDetail = h('div'); sec.b.append(this.libDetail); this.renderLibDetail();
  }
  fillGrid(grid) {
    grid.replaceChildren(); const T = RT.S.manifest.textures; const q = this.libQ.trim().toLowerCase();
    const list = Object.entries(T).filter(([hh, t]) => (this.libCat === 'All' || t.category === this.libCat) && (!q || (t.name + ' ' + t.tags.join(' ') + ' ' + t.ext + ' ' + hh).toLowerCase().includes(q))).sort((a, b) => String(b[1].added).localeCompare(String(a[1].added)));
    for (const [hh, t] of list) { const n = RT.assignments(hh).length; const tile = h('div', { cls: 'ts-tile' + (hh === this.libSel ? ' sel' : ''), title: t.name + '\n' + t.w + '×' + t.h + ' ' + t.ext.toUpperCase() + ' · ' + fmtB(t.bytes) + '\nDouble-click: apply to the active slot', onclick: () => { this.libSel = hh; this.fillGrid(grid); this.renderLibDetail(); this.renderRight(); }, ondblclick: () => this.assign(hh) },
      h('img', { src: t.thumb || '', alt: '' }), h('div', {}, t.name), h('small', {}, t.w + '×' + t.h + ' ' + t.ext.toUpperCase() + (n ? ' · used ' + n + '×' : ''))); grid.append(tile); }
    if (!list.length) grid.append(h('div', { cls: 'ed-hint', style: { gridColumn: '1 / -1' } }, Object.keys(T).length ? 'No match.' : 'Empty — import images, or use "Replace…" on a slot.'));
  }
  renderLibDetail() {
    const D = this.libDetail; if (!D) return; D.replaceChildren(); const hh = this.libSel; const t = hh && RT.S.manifest.textures[hh]; if (!t) return;
    const as = RT.assignments(hh); const info = h('div', { cls: 'ts-kv' }); const kv = (a, b) => info.append(h('span', {}, a), h('span', { title: String(b) }, String(b)));
    kv('Resolution', t.w + ' × ' + t.h); kv('Format', t.ext.toUpperCase() + (RT.COMPRESSED.has(t.ext) ? ' (GPU-compressed)' : '')); kv('File size', fmtB(t.bytes)); kv('Hash', hh); kv('Added', t.added ? t.added.slice(0, 19).replace('T', ' ') : '?');
    const al = h('div', { cls: 'ed-list', style: { maxHeight: '90px' } }); for (const a of as) al.append(h('div', { title: a.k }, a.label, h('small', {}, RT.SLOTS.find((s) => s.k === a.slot)?.label || a.slot)));
    D.append(section('Selected: ' + t.name, true, text('Name', t.name, (v) => RT.updateTexture(hh, { name: v.slice(0, 120) || t.name })), select('Category', RT.CATEGORIES, t.category, (v) => RT.updateTexture(hh, { category: v })),
      text('Tags', t.tags.join(', '), (v) => RT.updateTexture(hh, { tags: v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12) })), info,
      h('div', { cls: 'ed-hint' }, as.length ? 'Assigned to ' + as.length + ' slot(s):' : 'Not assigned yet.'), as.length ? al : null,
      h('div', { cls: 'ts-bar' }, this.m ? btn('Apply to ' + (RT.SLOTS.find((s) => s.k === this.slot)?.label || this.slot), () => this.assign(hh)) : null,
        btn('Remove from library', async () => { try { await RT.removeTexture(hh); this.libSel = null; toast('Removed (file moved to texture-pack/trash in the project folder)'); this.renderRight(); } catch (e) { toast(e.message || String(e), 3000); } }, { cls: 'warn', title: as.length ? 'Clear its assignments first' : 'Remove it from the library' }))));
  }
  async importMany() {
    const files = await this.pickFiles(true); let ok = 0, dup = 0; const cat = this.guessCategory();
    for (const f of files) { try { const r = await RT.importFile(f, { category: cat }); if (r.dup) dup++; else ok++; this.libSel = r.hash; } catch (e) { toast(f.name + ': ' + (e.message || e), 3500); } }
    if (files.length) toast(`${ok} imported${dup ? ', ' + dup + ' already in the library' : ''}`); this.renderRight();
  }
  storage() {
    const S = RT.S; const be = S.backend; const sec = section('Project · storage', true);
    const kv = h('div', { cls: 'ts-kv' }); const add = (a, b) => kv.append(h('span', {}, a), h('span', { title: String(b) }, String(b)));
    add('Stored in', be ? be.label : 'none'); if (be && be.folder) add('Folder', be.folder); if (be && be.kind === 'idb') add('Persistence', be.persisted ? 'granted by the browser' : 'best effort (the browser may evict it under storage pressure) — export a pack to keep a copy');
    add('Rules', Object.keys(S.manifest.rules).length + ' material(s) edited'); add('Manifest', 'v' + S.manifest.version + (S.manifest.modified ? ' · ' + S.manifest.modified.slice(0, 19).replace('T', ' ') : ''));
    sec.b.append(kv, this.statusEl, h('div', { cls: 'ed-hint' }, 'Picked files are copied into storage (content-hashed) when imported — the game never refers to the file on your computer, so moving or deleting it later changes nothing.'));
    sec.b.append(h('div', { cls: 'ts-bar' }, btn('Save now', () => this.save()), btn('Export pack (.zip)', () => this.exportPack(), { title: 'manifest.json + every library texture — unzip into texture-pack/ or upload to your asset host' }), btn('Export manifest (.json)', () => download('colombo-textures.json', JSON.stringify(RT.exportManifest(false), null, 1)), { title: 'Rules + library index only (textures come from the asset base URL)' })),
      h('div', { cls: 'ts-bar' }, btn('Import (merge)…', () => this.importPack('merge'), { title: 'Add a pack / manifest: its rules replace the same materials, others stay' }), btn('Import (replace)…', () => this.importPack('replace'), { cls: 'warn', title: 'Use only the imported rules (undoable)' })));
    sec.b.append(text('Asset base URL', S.manifest.assetBase, (v) => { RT.setAssetBase(v); toast(v ? 'Missing textures load from ' + v : 'Asset base URL cleared'); }), h('div', { cls: 'ed-hint' }, 'Optional external hosting: textures not in local storage are fetched from <URL>/<hash>.<ext> (the host must allow CORS).'));
    this.meter = h('i'); this.meterTxt = h('div', { cls: 'ed-hint' });
    sec.b.append(section('Performance · settings', false, h('div', { cls: 'ts-meter' }, this.meter), this.meterTxt,
      select('Default max size', [128, 256, 512, 1024, 2048].map((n) => [n, n + ' px']), S.settings.maxSize, (v) => { S.settings.maxSize = +v; RT.saveSettings(); }),
      num('Texture memory budget (MB)', S.settings.budgetMB, { min: 16, max: 1024, step: 8 }, (v) => { S.settings.budgetMB = Math.round(v); RT.saveSettings(); this.renderStatus(); })));
    sec.b.append(h('div', { cls: 'ts-bar' }, check('Replacements on (untick to compare with the original game)', S.enabled, (v) => RT.setEnabled(v)),
      btn('Restore all…', async () => { if (!confirm('Restore every edited material to the original game textures? (Undo brings them back.)')) return; const n = await RT.restoreAll(); toast(n + ' material(s) restored'); this.renderLeft(); this.renderRight(); }, { cls: 'warn' }), btn('Close studio', () => this.close())));
    this.renderStatus(); return sec;
  }
  renderStatus() {
    const S = RT.S; if (this.statusEl) { const st = S.saveState; this.statusEl.replaceChildren(h('span', { cls: 'ts-badge ' + (st === 'saved' ? 'ok' : st === 'error' ? 'warn' : 'ed') }, st === 'saved' ? 'all changes saved' : st === 'saving' ? 'saving…' : st === 'error' ? 'save failed' : 'unsaved changes (auto-save)'), st === 'error' ? ' ' + S.lastSaveError : '', '  ', h('span', {}, 'Undo ' + RT.history.undo.length + ' · Redo ' + RT.history.redo.length)); }
    if (this.meter) { const u = RT.gpuBytes(), b = RT.budgetBytes(); this.meter.style.width = Math.min(100, (u / b) * 100).toFixed(1) + '%'; this.meterTxt.textContent = 'Studio textures on the GPU: ' + fmtB(u) + ' of ' + S.settings.budgetMB + ' MB budget (shared images count once)'; }
  }
  async exportPack() {
    const m = RT.exportManifest(true); const files = [{ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(m, null, 1)) }]; const miss = [];
    for (const [hh, t] of Object.entries(m.textures)) { const name = hh + '.' + t.ext; let b = null; try { b = await RT.S.backend.getFile(name); } catch { /* missing */ } if (!b) { miss.push(name); continue; } files.push({ name: 'textures/' + name, data: new Uint8Array(await b.arrayBuffer()) }); }
    download('colombo-texture-pack.zip', writeZip(files), 'application/zip'); toast(`Pack exported: ${files.length - 1} texture(s)${miss.length ? ', ' + miss.length + ' missing locally' : ''}`, 3000);
  }
  async importPack(mode) {
    const f = await pickFile('.zip,.json,application/zip,application/json'); if (!f) return;
    try {
      let raw, files = new Map(); if (/\.zip$/i.test(f.name)) { files = await readZip(f); const mf = files.get('manifest.json') || [...files.entries()].find(([n]) => n.endsWith('/manifest.json'))?.[1]; if (!mf) throw new Error('manifest.json not found in the zip'); raw = JSON.parse(await mf.text()); const fixed = new Map(); for (const [n, b] of files) fixed.set(n.split('/').pop(), b); files = fixed; }
      else raw = JSON.parse(await f.text());
      const r = await RT.importManifest(raw, files, mode); toast(`Imported ${r.rules} rule(s), ${r.files} file(s)${r.missing.length ? ' — ' + r.missing.length + ' texture file(s) missing (set an asset base URL)' : ''}`, 4500); this.renderLeft(); this.renderRight();
    } catch (e) { toast('Import failed: ' + (e.message || e), 4500); }
  }
  // ------------------------------------------------------------------ close
  close() { this.session.end(); }
  dispose() {
    this.endPeek(); removeEventListener('keydown', this.onKeyDown, true); removeEventListener('keyup', this.onKeyUp, true); this.cv.removeEventListener('pointerdown', this.onDown); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); this.cv.removeEventListener('wheel', this.onWheel); this.cv.removeEventListener('contextmenu', this.onCtx);
    for (const b of [this.box, this.bbox]) { this.g.scene.remove(b); b.geometry.dispose(); b.material.dispose(); } if (this.unsub) this.unsub(); RT.setStudioOpen(false);
    if (RT.S.saveState === 'unsaved') RT.saveNow().catch((e) => toast('Texture Studio save failed: ' + (e.message || e), 4000));
    for (const w of [this.left, this.right]) if (w && !w.closed) { w.onClose = null; w.close(); } ed = null; if (globalThis.__editors) delete globalThis.__editors.textures;
  }
}
