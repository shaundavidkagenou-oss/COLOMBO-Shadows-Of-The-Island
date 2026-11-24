// Environment editor (console `paint`) — a world-building tool on the live Colombo map: the game's own renderer, world and
// coordinates; fly anywhere, import glTF / GLB (with external .bin + textures) / OBJ / FBX models, edit every material's PBR
// maps and settings, place and transform props (gizmo, snapping, multi-select, copy / paste, undo / redo), paint vegetation
// and rocks with a brush (density, spacing, random rotation / scale, slope / height limits, multi-asset mixes, presets),
// organise everything in layers, save to the project folder, export / import portable .zip packs and COMPILE the scene into
// the game build (build-exe.bat → the .exe). Development builds only (it saves through the dev server: tools/vite/paintPack.mjs).
//
// Data: the project document (PaintFormat.js) + the instances, which live in the world's PaintField (world.paint — the same
// renderer the game uses for compiled scenes, so what is edited is exactly what the game draws). Closing the editor keeps it
// all in the world and in memory (KEEP), saves to disk, and reopening continues where it left off.
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as L from '../world/Layout.js';
import * as PF from './PaintFormat.js';
import { objMatrix } from './PaintField.js';
import { attach } from './PaintRuntime.js';
import { beginSession, toast, h } from './ui.js';
import { css, fmtN } from './PaintUI.js';
import { buildUI } from './PaintPanels.js';
import * as IO from './PaintIO.js';

let ED = null; let KEEP = null; // the project state outlives the editor window (switching to gameplay never loses work)
export async function open(game) { if (ED) return ED; const e = new PaintEditor(game); ED = e; try { await e.init(); } catch (err) { ED = null; e.dispose(true); throw err; } return e; }
export function current() { return ED; }
export function kept() { return KEEP; }

const DEG = Math.PI / 180;
export const snapRec = (o) => ({ u: o.u, a: o.a, l: o.l, p: [o.p[0], o.p[1], o.p[2]], r: [o.r[0], o.r[1], o.r[2]], s: [o.s[0], o.s[1], o.s[2]], c: o.c || 0, t: o.t || null, k: o.k ? 1 : 0 });
const sameRec = (a, b) => a && b && a.a === b.a && a.l === b.l && a.t === b.t && a.c === b.c && a.p.every((v, i) => v === b.p[i]) && a.r.every((v, i) => v === b.r[i]) && a.s.every((v, i) => v === b.s[i]);
export const DEFAULT_BRUSH = PF.BRUSH_DEFAULTS;
const SNAP = { grid: false, gridSize: 1, angle: true, angleStep: 15, surface: true, scaleSnap: false, space: 'world' };

class PaintEditor {
  constructor(game) {
    this.g = game; this.W = game.world; this.cam = game.camera; this.keys = new Set(); this.speed = 30; this.mouse = null; this.sel = new Set(); this.undoS = []; this.redoS = []; this.tx = null;
    this.tool = 'select'; this.unsaved = false; this.savedAt = null; this.lastSaveTry = 0; this.clip = null; this.placeAsset = null; this.fps = 60; this.statusT = 0; this.cursor = null;
    const e = new THREE.Euler().setFromQuaternion(this.cam.quaternion, 'YXZ'); this.yaw = e.y; this.pitch = e.x; this.pos = this.cam.position.clone();
  }
  async init() {
    css(); IO.checkServer(); const g = this.g;
    // ---- project + field
    if (KEEP && this.W.paint === KEEP.field) { this.P = KEEP.P; this.F = KEEP.field; this.nextU = KEEP.nextU; this.undoS = KEEP.undoS; this.redoS = KEEP.redoS; this.unsaved = KEEP.unsaved; this.savedAt = KEEP.savedAt; this.report = KEEP.report; }
    else await this.loadProject();
    const E = this.P.editor || {}; this.snap = { ...SNAP, ...(E.snap || {}) }; this.brush = { ...DEFAULT_BRUSH, ...(E.brush || {}) }; this.brush.mix = (this.brush.mix || []).filter((m) => this.P.assets[m.a]);
    if (E.cam && Number.isFinite(E.cam.x) && !KEEP) { this.pos.set(E.cam.x, E.cam.y, E.cam.z); this.yaw = E.cam.yaw || 0; this.pitch = E.cam.pitch || -0.4; }
    // ---- scene helpers: selection outlines, brush ring, placement ghost, gizmo
    this.selLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf0b440, depthTest: false, transparent: true, opacity: 0.95 })); this.selLines.renderOrder = 998; this.selLines.frustumCulled = false; g.scene.add(this.selLines);
    const rp = new Float32Array(97 * 3); const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); this.ring = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: 0x8fef7a, depthTest: false, transparent: true, opacity: 0.9 })); this.ring.renderOrder = 999; this.ring.frustumCulled = false; this.ring.visible = false; g.scene.add(this.ring);
    this.ghost = new THREE.Group(); this.ghost.visible = false; g.scene.add(this.ghost);
    this.pivot = new THREE.Object3D(); g.scene.add(this.pivot);
    this.tc = new TransformControls(this.cam, g.renderer.domElement); this.tcHelper = this.tc.getHelper(); g.scene.add(this.tcHelper); this.tc.setSize(0.9); this.tc.enabled = false;
    this.tc.addEventListener('dragging-changed', (ev) => { if (ev.value) this.gizmoStart(); else this.gizmoEnd(); });
    this.tc.addEventListener('objectChange', () => this.gizmoMove());
    this.applySnap();
    // ---- session + UI + input
    this.session = beginSession(g, 'paint', { hook: (dt) => this.tick(dt), onEnd: () => this.dispose() });
    this.ui = buildUI(this); this.bindInput(); this.setTool(E.tool && E.tool !== 'paint' ? E.tool : 'select');
    this.autosave = setInterval(() => { if (this.unsaved && !this.tx && !this.saving && performance.now() - this.lastEdit > 4000) this.save(true); }, 60000);
    toast('Environment editor — hold the right mouse button + WASD / QE to fly · F1 help', 3500);
    if (this.loadNotes && this.loadNotes.length) this.ui.notify(this.loadNotes.join(' · '), 'warn');
  }
  // ---------------------------------------------------------------- project
  async loadProject() {
    const r = await IO.loadProject(); const { project, notes, list } = PF.normalizeProject(r.project || PF.emptyProject()); this.P = project; this.loadNotes = r.project ? notes : []; this.report = r.report || null;
    if (!this.P.created) this.P.created = new Date().toISOString();
    if (this.W.paint) { this.W.paint.dispose(); this.W.paint = null; } // the runtime copy (compiled scene) → the editable project
    this.F = attach(this.W); for (const l of this.P.layers) this.F.setLayerHidden(l.id, !l.visible);
    const ok = (o) => this.P.assets[o.a] && this.P.layers.some((q) => q.id === o.l); const objs = (list || []).filter(ok);
    await Promise.all(Object.values(this.P.assets).map((a) => this.F.setAsset(a))); this.F.addMany(objs);
    this.nextU = 1; for (const o of objs) if (o.u >= this.nextU) this.nextU = o.u + 1; this.savedAt = r.project ? r.project.modified : null; this.unsaved = false;
    const missing = r.files ? [...PF.projectFiles(this.P)].filter((f) => !r.files.includes(f)) : []; if (missing.length) (this.loadNotes ||= []).push(missing.length + ' project file(s) missing from paint-pack/assets — those assets show as pink boxes');
  }
  keep() { KEEP = { P: this.P, field: this.F, nextU: this.nextU, undoS: this.undoS, redoS: this.redoS, unsaved: this.unsaved, savedAt: this.savedAt, report: this.report }; }
  projectDoc() {
    const P = this.P; const now = new Date().toISOString(); if (!P.created) P.created = now; P.modified = now;
    P.editor = { cam: { x: +this.pos.x.toFixed(2), y: +this.pos.y.toFixed(2), z: +this.pos.z.toFixed(2), yaw: +this.yaw.toFixed(4), pitch: +this.pitch.toFixed(4) }, snap: this.snap, brush: this.brush, tool: this.tool };
    return { format: PF.PROJECT_FORMAT, version: PF.VERSION, created: P.created, modified: P.modified, assets: P.assets, layers: P.layers, instances: PF.packInstances([...this.F.objs.values()]), brushes: P.brushes, editor: P.editor };
  }
  async save(auto = false) {
    if (this.saving) return this.saving; this.lastSaveTry = performance.now();
    this.saving = (async () => { try { const r = await IO.saveProject(this.projectDoc()); this.unsaved = false; this.savedAt = this.P.modified; this.keep(); this.ui.refreshStatus(true);
      if (r.missing && r.missing.length) this.ui.notify(r.missing.length + ' referenced file(s) are not in paint-pack/assets: ' + r.missing.slice(0, 3).join(', '), 'warn');
      if (!auto) toast('Saved to paint-pack/project.json (' + fmtN(this.F.objs.size) + ' instances)'); return true; }
    catch (e) { this.ui.notify('Save failed: ' + ((e && e.message) || e), 'err'); return false; } finally { this.saving = null; } })();
    return this.saving;
  }
  markDirty() { this.unsaved = true; this.lastEdit = performance.now(); this.keep(); if (this.ui) this.ui.dirty(); }
  // ---------------------------------------------------------------- instances + undo
  mk(a, l, p, r = [0, 0, 0], s = [1, 1, 1], c = 0, t = null, k = 0) { return { u: this.nextU++ >>> 0, a, l, p, r, s, c, t, k }; }
  begin(label) { if (this.tx) this.commit(); this.tx = { label, before: new Map() }; }
  touch(o) { if (this.tx && !this.tx.before.has(o.u)) this.tx.before.set(o.u, this.F.objs.get(o.u) === o ? snapRec(o) : null); }
  addObj(o) { this.touch(o); this.F.add(o); }
  addObjs(list) { for (const o of list) this.touch(o); this.F.addMany(list); }
  delObj(o) { this.touch(o); this.F.remove(o); this.sel.delete(o); }
  commit() {
    const tx = this.tx; this.tx = null; if (!tx || !tx.before.size) return; const after = new Map(); let changed = 0;
    for (const [u, b] of tx.before) { const o = this.F.objs.get(u); const a = o ? snapRec(o) : null; after.set(u, a); if (!(a === null && b === null) && !sameRec(a, b)) changed++; }
    if (!changed) return; this.undoS.push({ label: tx.label, before: tx.before, after }); if (this.undoS.length > 200) this.undoS.shift(); this.redoS.length = 0; this.markDirty(); this.ui.refreshSel(); this.ui.refreshCounts();
  }
  applyState(map) {
    const add = [];
    for (const [u, rec] of map) { const o = this.F.objs.get(u);
      if (!rec) { if (o) { this.F.remove(o); this.sel.delete(o); } continue; }
      if (o) { o.a = rec.a; o.l = rec.l; o.p = rec.p.slice(); o.r = rec.r.slice(); o.s = rec.s.slice(); o.c = rec.c; o.t = rec.t; o.k = rec.k; this.F.updateObj(o); }
      else add.push({ ...rec, p: rec.p.slice(), r: rec.r.slice(), s: rec.s.slice() }); }
    if (add.length) this.F.addMany(add);
  }
  undo() { if (this.tx) this.commit(); const e = this.undoS.pop(); if (!e) { toast('Nothing to undo'); return; } this.applyState(e.before); this.redoS.push(e); this.afterHistory('Undo: ' + e.label); }
  redo() { const e = this.redoS.pop(); if (!e) { toast('Nothing to redo'); return; } this.applyState(e.after); this.undoS.push(e); this.afterHistory('Redo: ' + e.label); }
  afterHistory(m) { for (const o of [...this.sel]) if (this.F.objs.get(o.u) !== o) this.sel.delete(o); this.markDirty(); this.selChanged(); this.ui.refreshCounts(); toast(m, 1200); }
  // ---------------------------------------------------------------- layers / assets helpers
  layer(id) { return this.P.layers.find((l) => l.id === id); }
  editable(o) { const l = this.layer(o.l); return !!l && l.visible && !l.locked; }
  layerFor(assetId) { const b = this.brush.layer; if (b && b !== 'auto' && this.layer(b)) return b; const a = this.P.assets[assetId]; return a && this.layer(a.layer) ? a.layer : 'custom'; }
  // ---------------------------------------------------------------- selection
  select(list, mode = 'set') { // mode: set | add | toggle | remove
    if (mode === 'set') this.sel.clear(); for (const o of list) { if (!this.editable(o)) continue; if (mode === 'toggle' && this.sel.has(o)) this.sel.delete(o); else if (mode === 'remove') this.sel.delete(o); else this.sel.add(o); }
    this.selChanged();
  }
  selChanged() { this.updatePivot(); this.updateSelLines(); this.ui.refreshSel(); }
  updatePivot() {
    const n = this.sel.size; const show = n > 0 && ['move', 'rotate', 'scale'].includes(this.tool);
    if (!n) { this.tc.detach(); this.tc.enabled = false; return; }
    let x = 0, y = 0, z = 0; for (const o of this.sel) { x += o.p[0]; y += o.p[1]; z += o.p[2]; } this.pivot.position.set(x / n, y / n, z / n);
    if (n === 1 && this.snap.space === 'local') { const o = [...this.sel][0]; this.pivot.rotation.set(o.r[0], o.r[1], o.r[2], 'YXZ'); } else this.pivot.rotation.set(0, 0, 0);
    this.pivot.scale.set(1, 1, 1); this.pivot.updateMatrixWorld(true);
    if (show) { if (this.tc.object !== this.pivot) this.tc.attach(this.pivot); this.tc.enabled = true; } else { this.tc.detach(); this.tc.enabled = false; }
  }
  updateSelLines() {
    const max = 400; const list = [...this.sel].slice(0, max); const pos = new Float32Array(list.length * 24 * 3); const b = new THREE.Box3(); let w = 0;
    const E = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const o of list) { this.F.boxOf(o, b); const c = []; for (let i = 0; i < 8; i++) c.push([i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z]); for (const [i, j] of E) { pos.set(c[i], w); pos.set(c[j], w + 3); w += 6; } }
    const g = this.selLines.geometry; g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setDrawRange(0, w / 3); g.computeBoundingSphere(); this.selLines.visible = list.length > 0;
  }
  selectedList() { return [...this.sel].filter((o) => this.F.objs.get(o.u) === o); }
  // ---------------------------------------------------------------- tools
  setTool(t) {
    if (this.stroke) this.endStroke(); this.tool = t; this.ring.visible = t === 'paint'; this.ghost.visible = false;
    if (t === 'place' && !this.placeAsset) { const id = this.ui.libSel || Object.keys(this.P.assets)[0]; if (id) this.setPlaceAsset(id); else { toast('Import an asset first (Import tab)'); } }
    const mode = t === 'rotate' ? 'rotate' : t === 'scale' ? 'scale' : 'translate'; this.tc.setMode(mode); this.updatePivot(); this.ui.toolChanged();
    if (t === 'paint') this.ui.showRight('brush');
  }
  applySnap() { const S = this.snap; this.tc.setTranslationSnap(S.grid ? S.gridSize : null); this.tc.setRotationSnap(S.angle ? S.angleStep * DEG : null); this.tc.setScaleSnap(S.scaleSnap ? 0.1 : null); this.tc.setSpace(S.space === 'local' ? 'local' : 'world'); this.updatePivot(); }
  setPlaceAsset(id) {
    this.placeAsset = id; const a = this.P.assets[id]; for (const c of [...this.ghost.children]) { this.ghost.remove(c); c.geometry.dispose(); } if (!a) return;
    const A = this.F.assets.get(id); const build = () => { if (this.placeAsset !== id || !A.model) return; for (const [i, b] of A.batches.entries()) { const p = A.model.parts[i]; const g = new THREE.BufferGeometry(); for (const [k, v] of Object.entries(p.geo.attributes)) g.setAttribute(k, v); g.setIndex(new THREE.BufferAttribute(p.geo.index.array.subarray(p.hi[0], p.hi[0] + p.hi[1]), 1)); const m = new THREE.Mesh(g, b.mat); m.castShadow = false; this.ghost.add(m); } };
    if (A && A.ready) A.ready.then(build); else if (A && A.model) build();
  }
  // ---------------------------------------------------------------- ray / terrain helpers
  ray(e) { const r = this.cv.getBoundingClientRect(); const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.cam); return rc; }
  groundRay(rc) { const o = rc.ray.origin, d = rc.ray.direction; if (d.y > -1e-4) return null; let y = L.surfaceY(o.x, o.z); let p = null; for (let i = 0; i < 6; i++) { const t = (y - o.y) / d.y; if (t < 0) return null; p = o.clone().addScaledVector(d, t); const ny = L.surfaceY(p.x, p.z); if (Math.abs(ny - y) < 0.002) break; y = ny; } if (!p) return null; p.y = L.surfaceY(p.x, p.z); return p; }
  normalAt(x, z, out = new THREE.Vector3()) { const e = 0.6; const gx = (L.surfaceY(x + e, z) - L.surfaceY(x - e, z)) / (2 * e), gz = (L.surfaceY(x, z + e) - L.surfaceY(x, z - e)) / (2 * e); return out.set(-gx, 1, -gz).normalize(); }
  // tilt angles (Euler YXZ, given yaw) that stand an object on normal n, blended by k (0 = upright, 1 = on the surface)
  alignTo(n, yaw, k) { if (k <= 0) return [0, 0]; const c = Math.cos(-yaw), s = Math.sin(-yaw); const nx = n.x * c + n.z * s, nz = -n.x * s + n.z * c; return [Math.atan2(nz, n.y) * k, -Math.atan2(nx, Math.hypot(n.y, nz)) * k]; }
  // ---------------------------------------------------------------- input
  bindInput() {
    const cv = this.g.renderer.domElement; this.cv = cv; const inField = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    this.onKeyDown = (e) => { if (document.querySelector('.pe-modal-bg') || inField(e) || e.target.closest?.('.ed-win,.dbg-con,.dbg-menu')) return; if (e.target.closest?.('.pe-root')) e.target.blur?.(); this.keys.add(e.code); this.key(e); };
    this.onKeyUp = (e) => { this.keys.delete(e.code); };
    this.onDown = (e) => {
      if (e.button === 2 || e.button === 1) { this.look = [e.clientX, e.clientY]; this.lookMoved = 0; return; }
      if (e.button !== 0) return; if (this.tc.dragging || (this.tc.enabled && this.tc.axis)) return;
      const t = this.tool; this.mouse = e;
      if (t === 'place') { this.placeAt(e); return; }
      if (t === 'paint') { this.startStroke(e); return; }
      this.down = { x: e.clientX, y: e.clientY, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
    };
    this.onMove = (e) => { this.mouse = e; if (this.look) { const dx = e.clientX - this.look[0], dy = e.clientY - this.look[1]; this.lookMoved += Math.abs(dx) + Math.abs(dy); this.yaw -= dx * 0.0035; this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * 0.0035)); this.look = [e.clientX, e.clientY]; }
      if (this.down && !this.marquee && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) { this.marquee = h('div', { cls: 'pe-marquee' }); document.body.append(this.marquee); }
      if (this.marquee) { const x0 = Math.min(this.down.x, e.clientX), y0 = Math.min(this.down.y, e.clientY); Object.assign(this.marquee.style, { left: x0 + 'px', top: y0 + 'px', width: Math.abs(e.clientX - this.down.x) + 'px', height: Math.abs(e.clientY - this.down.y) + 'px' }); } };
    this.onUp = (e) => {
      if (e.button === 2 || e.button === 1) { this.look = null; return; }
      if (e.button !== 0) return; if (this.stroke) { this.endStroke(); return; }
      const d = this.down; this.down = null; if (!d) return; const mode = d.shift ? 'add' : d.ctrl ? 'toggle' : 'set';
      if (this.marquee) { const r = this.marquee.getBoundingClientRect(); this.marquee.remove(); this.marquee = null; this.boxSelect(r, mode); return; }
      const hit = this.F.pick(this.ray(e), (o) => this.editable(o)); if (hit) this.select([hit.o], mode); else if (mode === 'set') this.select([]);
    };
    this.onWheel = (e) => { e.preventDefault(); const up = e.deltaY < 0;
      if (this.look) { this.speed = Math.max(1, Math.min(400, this.speed * (up ? 1.2 : 0.83))); this.ui.notify('Fly speed ' + this.speed.toFixed(0) + ' m/s', 'info', 900); return; }
      if (this.tool === 'paint' && !e.shiftKey) { this.brush.radius = Math.max(0.25, Math.min(200, this.brush.radius * (up ? 1.12 : 0.89))); this.ui.refreshBrush(); return; }
      const f = new THREE.Vector3(); this.cam.getWorldDirection(f); this.pos.addScaledVector(f, (up ? 1 : -1) * Math.max(1.5, this.speed * 0.25)); };
    this.onCtx = (e) => e.preventDefault();
    addEventListener('keydown', this.onKeyDown, true); addEventListener('keyup', this.onKeyUp, true); cv.addEventListener('pointerdown', this.onDown); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp); cv.addEventListener('wheel', this.onWheel, { passive: false }); cv.addEventListener('contextmenu', this.onCtx);
  }
  key(e) {
    const c = e.code, ctrl = e.ctrlKey || e.metaKey; const flying = !!this.look;
    if (ctrl) { const k = { KeyS: () => this.save(), KeyZ: () => (e.shiftKey ? this.redo() : this.undo()), KeyY: () => this.redo(), KeyD: () => this.duplicate(), KeyC: () => this.copy(), KeyV: () => this.paste(), KeyX: () => { this.copy(); this.deleteSel(); }, KeyA: () => this.selectAllVisible() }[c]; if (k) { e.preventDefault(); k(); } return; }
    if (c === 'F1') { e.preventDefault(); this.ui.toggleHelp(); return; }
    if (c === 'Escape') { if (this.stroke) this.endStroke(); else if (this.tool === 'place' || this.tool === 'paint') this.setTool('select'); else this.select([]); return; }
    if (flying) return; // WASD / QE fly while the right button is held
    const tools = { KeyQ: 'select', KeyW: 'move', KeyE: 'rotate', KeyR: 'scale', KeyT: 'place', KeyB: 'paint' }; if (tools[c]) { this.setTool(tools[c]); return; }
    if (c === 'Delete' || c === 'Backspace') { e.preventDefault(); this.deleteSel(); } else if (c === 'KeyF') this.focusSel(); else if (c === 'KeyG') { this.snap.grid = !this.snap.grid; this.applySnap(); this.ui.toolChanged(); toast('Grid snap ' + (this.snap.grid ? 'on (' + this.snap.gridSize + ' m)' : 'off'), 900); }
    else if (c === 'BracketLeft' || c === 'BracketRight') { this.brush.radius = Math.max(0.25, Math.min(200, this.brush.radius * (c === 'BracketRight' ? 1.15 : 0.87))); this.ui.refreshBrush(); }
    else if (c === 'KeyX' && this.tool === 'paint') { this.brush.mode = this.brush.mode === 'erase' ? 'paint' : 'erase'; this.ui.refreshBrush(); }
    else if (c === 'End') this.dropSelToGround();
  }
  boxSelect(r, mode) {
    const v = new THREE.Vector3(); const cr = this.cv.getBoundingClientRect(); const out = []; const cp = this.cam.position; this.cam.updateMatrixWorld();
    for (const o of this.F.objs.values()) { if (!this.editable(o)) continue; v.set(o.p[0], o.p[1], o.p[2]); if (v.distanceToSquared(cp) > 600 * 600) continue; v.project(this.cam); if (v.z > 1 || v.z < -1) continue;
      const sx = cr.left + (v.x + 1) / 2 * cr.width, sy = cr.top + (1 - v.y) / 2 * cr.height; if (sx >= r.left && sx <= r.right && sy >= r.top && sy <= r.bottom) out.push(o); }
    this.select(out, mode === 'set' ? 'set' : mode === 'toggle' ? 'toggle' : 'add'); this.ui.notify(fmtN(out.length) + ' selected', 'info', 1200);
  }
  selectAllVisible() { const out = []; for (const o of this.F.objs.values()) if (this.editable(o)) out.push(o); this.select(out); }
  // ---------------------------------------------------------------- gizmo transforms (whole selection about the pivot)
  gizmoStart() { const list = this.selectedList(); if (!list.length) return; this.begin(this.tool === 'rotate' ? 'Rotate' : this.tool === 'scale' ? 'Scale' : 'Move'); for (const o of list) this.touch(o);
    this.drag = { inv: this.pivot.matrixWorld.clone().invert(), items: list.map((o) => ({ o, m: objMatrix(o, new THREE.Matrix4()), g0: L.surfaceY(o.p[0], o.p[2]), y0: o.p[1] })), axis: this.tc.axis }; }
  gizmoMove() {
    const D = this.drag; if (!D) return; this.pivot.updateMatrixWorld(true); const delta = new THREE.Matrix4().multiplyMatrices(this.pivot.matrixWorld, D.inv); const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
    const follow = this.snap.surface && this.tool === 'move' && D.axis && !/Y/.test(D.axis); // dragged over the ground: keep the height above it
    for (const it of D.items) { m.multiplyMatrices(delta, it.m).decompose(p, q, s); e.setFromQuaternion(q, 'YXZ'); const o = it.o; o.p = [p.x, p.y, p.z]; o.r = [e.x, e.y, e.z]; o.s = [s.x, s.y, s.z];
      if (follow) o.p[1] = L.surfaceY(p.x, p.z) + (it.y0 - it.g0); this.F.updateObj(o); }
    this.updateSelLines(); this.ui.refreshSel(true);
  }
  gizmoEnd() { this.drag = null; this.commit(); this.updatePivot(); }
  // transform fields (properties panel): set component i of key ('p' | 'r' | 's') on every selected object
  setField(key, i, v) { const list = this.selectedList(); if (!list.length) return; this.begin('Edit ' + ({ p: 'position', r: 'rotation', s: 'scale' })[key]);
    for (const o of list) { this.touch(o); o[key] = o[key].slice(); o[key][i] = key === 'r' ? v * DEG : v; this.F.updateObj(o); } this.commit(); this.selChanged(); }
  setProp(fn, label) { const list = this.selectedList(); if (!list.length) return; this.begin(label); for (const o of list) { this.touch(o); fn(o); this.F.updateObj(o); } this.commit(); this.selChanged(); }
  // ---------------------------------------------------------------- edit commands
  deleteSel() { const list = this.selectedList(); if (!list.length) return; this.begin('Delete'); for (const o of list) this.delObj(o); this.commit(); this.selChanged(); toast(fmtN(list.length) + ' deleted — Ctrl+Z restores', 1500); }
  duplicate() { const list = this.selectedList(); if (!list.length) return; const off = this.snap.grid ? this.snap.gridSize : 1; this.begin('Duplicate'); const out = list.map((o) => this.mk(o.a, o.l, [o.p[0] + off, o.p[1], o.p[2] + off], o.r.slice(), o.s.slice(), o.c, o.t, o.k));
    for (const o of out) if (this.snap.surface) o.p[1] += L.surfaceY(o.p[0], o.p[2]) - L.surfaceY(o.p[0] - off, o.p[2] - off); this.addObjs(out); this.commit(); this.select(out); toast(fmtN(out.length) + ' duplicated', 1200); }
  copy() { const list = this.selectedList(); if (!list.length) return; let x = 0, z = 0; for (const o of list) { x += o.p[0]; z += o.p[2]; } x /= list.length; z /= list.length; this.clip = { cx: x, cz: z, items: list.map(snapRec) }; toast(fmtN(list.length) + ' copied', 1000); }
  paste() { const C = this.clip; if (!C) { toast('Nothing copied'); return; } const p = this.mouse ? this.groundRay(this.ray(this.mouse)) : null; const tx = p ? p.x : C.cx + 2, tz = p ? p.z : C.cz + 2;
    this.begin('Paste'); const out = C.items.filter((r) => this.P.assets[r.a] && this.layer(r.l)).map((r) => { const x = r.p[0] - C.cx + tx, z = r.p[2] - C.cz + tz; const y = this.snap.surface ? L.surfaceY(x, z) + (r.p[1] - L.surfaceY(r.p[0], r.p[2])) : r.p[1]; return this.mk(r.a, r.l, [x, y, z], r.r.slice(), r.s.slice(), r.c, r.t, r.k); });
    this.addObjs(out); this.commit(); this.select(out); toast(fmtN(out.length) + ' pasted', 1000); }
  dropSelToGround() { this.setProp((o) => { o.p = [o.p[0], L.surfaceY(o.p[0], o.p[2]), o.p[2]]; }, 'Drop to ground'); }
  focusSel() { const list = this.selectedList(); const b = new THREE.Box3(); if (list.length) { for (const o of list.slice(0, 2000)) b.union(this.F.boxOf(o, new THREE.Box3())); } else return;
    const c = b.getCenter(new THREE.Vector3()), r = Math.max(2, b.getSize(new THREE.Vector3()).length() * 0.6); const f = new THREE.Vector3(); this.cam.getWorldDirection(f); this.pos.copy(c).addScaledVector(f, -r * 1.8); this.pos.y = Math.max(this.pos.y, c.y + r * 0.4); }
  // ---------------------------------------------------------------- placement
  placePoint(e) { const rc = this.ray(e); let p = this.groundRay(rc); let onObj = false;
    if (this.snap.surface) { const hit = this.F.pick(rc, (o) => this.editable(o), p ? rc.ray.origin.distanceTo(p) : 2000); if (hit && (!p || hit.distance < rc.ray.origin.distanceTo(p) - 0.01)) { p = hit.point; onObj = true; } }
    if (p && this.snap.grid) { const g = this.snap.gridSize; p.x = Math.round(p.x / g) * g; p.z = Math.round(p.z / g) * g; if (!onObj) p.y = L.surfaceY(p.x, p.z); } return p; }
  placeAt(e) {
    const id = this.placeAsset; if (!id || !this.P.assets[id]) { toast('Pick an asset in the Library first'); return; } const l = this.layerFor(id); const Ly = this.layer(l); if (!Ly.visible || Ly.locked) { toast('Layer "' + Ly.name + '" is ' + (Ly.locked ? 'locked' : 'hidden')); return; }
    const p = this.placePoint(e); if (!p) return; const pl = this.ui.place; let yaw = pl.rotRandom ? Math.random() * Math.PI * 2 : (pl.yaw || 0) * DEG; if (this.snap.angle && !pl.rotRandom) yaw = Math.round(yaw / (this.snap.angleStep * DEG)) * this.snap.angleStep * DEG;
    const [rx, rz] = pl.align ? this.alignTo(this.normalAt(p.x, p.z), yaw, 1) : [0, 0]; const s = pl.scaleRandom ? pl.scale * (0.85 + Math.random() * 0.3) : pl.scale;
    this.begin('Place'); const o = this.mk(id, l, [p.x, p.y, p.z], [rx, yaw, rz], [s, s, s], 0, null, 0); this.addObj(o); this.commit(); if (!e.shiftKey) this.select([o]); this.ui.refreshCounts();
  }
  // ---------------------------------------------------------------- brush
  startStroke(e) { const B = this.brush; if (B.mode !== 'erase' && !(e.ctrlKey || e.metaKey) && !B.mix.length) { toast('Add assets to the brush mix first (Brush tab, or "+ Brush" on a library card)'); return; }
    this.stroke = { last: null, t: 0, erase: e.ctrlKey || e.metaKey, n: 0 }; this.begin(B.mode === 'paint' && !this.stroke.erase ? 'Paint' : B.mode === 'erase' || this.stroke.erase ? 'Erase' : 'Brush ' + B.mode); this.strokeStep(true); }
  endStroke() { const S = this.stroke; this.stroke = null; this.commit(); if (S && S.n) this.ui.notify((S.erase || this.brush.mode === 'erase' ? 'Removed ' : this.brush.mode === 'paint' ? 'Painted ' : 'Changed ') + fmtN(S.n) + ' instance(s)', 'info', 1500); }
  strokeStep(first = false) {
    const S = this.stroke; if (!S || !this.mouse) return; const p = this.groundRay(this.ray(this.mouse)); if (!p) return; const B = this.brush; const now = performance.now();
    const step = Math.max(0.3, B.radius * 0.3); if (!first && S.last && Math.hypot(p.x - S.last.x, p.z - S.last.z) < step && now - S.t < 160) return;
    S.last = p; S.t = now; const mode = S.erase ? 'erase' : B.mode; S.n += mode === 'paint' ? this.dabPaint(p) : mode === 'erase' ? this.dabErase(p) : this.dabEdit(p, mode);
  }
  inScope(o, B) { if (!this.editable(o)) return false; if (B.eraseScope === 'all') return true; if (B.eraseScope === 'layer') return o.l === (B.layer !== 'auto' ? B.layer : (this.P.assets[o.a] || {}).layer); return B.mix.some((m) => m.a === o.a); }
  dabPaint(c) {
    const B = this.brush; const r = B.radius; const mix = B.mix.filter((m) => this.P.assets[m.a] && m.w > 0); if (!mix.length) return 0; const wsum = mix.reduce((n, m) => n + m.w, 0);
    const ids = new Set(mix.map((m) => m.a)); const pts = []; let have = 0; this.F.queryCircle(c.x, c.z, r + B.spacing, (o) => { if (ids.has(o.a)) { pts.push(o.p[0], o.p[2]); if ((o.p[0] - c.x) ** 2 + (o.p[2] - c.z) ** 2 <= r * r) have++; } });
    const target = Math.round(B.density * Math.PI * r * r); let need = Math.min(B.maxPerDab, target - have); if (need <= 0) return 0;
    const sp = Math.max(0, B.spacing), sp2 = sp * sp, G = new Map(), gk = (x, z) => Math.floor(x / Math.max(sp, 0.05)) * 73856093 ^ Math.floor(z / Math.max(sp, 0.05)) * 19349663;
    const addG = (x, z) => { const k = gk(x, z); let a = G.get(k); if (!a) G.set(k, (a = [])); a.push(x, z); }; for (let i = 0; i < pts.length; i += 2) addG(pts[i], pts[i + 1]);
    const near = (x, z) => { if (sp <= 0) return false; const cs = Math.max(sp, 0.05), i0 = Math.floor(x / cs), j0 = Math.floor(z / cs); for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) { const a = G.get(i * 73856093 ^ j * 19349663); if (a) for (let k = 0; k < a.length; k += 2) if ((a[k] - x) ** 2 + (a[k + 1] - z) ** 2 < sp2) return true; } return false; };
    const nrm = new THREE.Vector3(); const out = []; const locked = new Set(this.P.layers.filter((l) => l.locked || !l.visible).map((l) => l.id)); let tries = need * 8;
    const smin = Math.cos(B.slopeMax * DEG), smax = Math.cos(Math.max(0, B.slopeMin) * DEG);
    while (need > 0 && tries-- > 0) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r; let x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; if (B.jitter > 0) { x += (Math.random() - 0.5) * 2 * B.jitter; z += (Math.random() - 0.5) * 2 * B.jitter; }
      if (near(x, z)) continue; if (B.avoidWater && L.isWater(x, z)) continue; if (B.avoidRoads && L.roadAt(x, z)) continue;
      if (B.avoidBuildings && this.W.collision) { let blocked = false; for (const q of this.W.collision.query(x - 0.2, z - 0.2, x + 0.2, z + 0.2)) if ((q.kind === 'building' || q.kind === 'wall' || q.b) && x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) { blocked = true; break; } if (blocked) continue; }
      const y = L.surfaceY(x, z); if (y < B.hMin || y > B.hMax) continue; this.normalAt(x, z, nrm); if (nrm.y < smin - 1e-6 || nrm.y > smax + 1e-6) continue;
      let pick = Math.random() * wsum, m = mix[0]; for (const q of mix) { pick -= q.w; if (pick <= 0) { m = q; break; } } const l = this.layerFor(m.a); if (locked.has(l)) continue;
      const yaw = (Math.random() - 0.5) * B.rot * DEG; const [ax, az] = this.alignTo(nrm, yaw, B.align); const tl = B.tilt * DEG; const rx = ax + (Math.random() - 0.5) * 2 * tl, rz = az + (Math.random() - 0.5) * 2 * tl;
      const s = (B.scaleMin + Math.random() * Math.max(0, B.scaleMax - B.scaleMin)) * (m.s || 1); const sy = s * (1 + (Math.random() - 0.5) * 2 * B.heightVar); const sink = B.sinkMin + Math.random() * Math.max(0, B.sinkMax - B.sinkMin);
      out.push(this.mk(m.a, l, [x, y - sink, z], [rx, yaw, rz], [s, sy, s], (Math.random() * 2 - 1) * B.colorVar, null, 1)); addG(x, z); need--;
    }
    if (out.length) { this.addObjs(out); this.ui.refreshCounts(); } return out.length;
  }
  dabErase(c) { const B = this.brush; const list = []; this.F.queryCircle(c.x, c.z, B.radius, (o) => { if (this.inScope(o, B) && Math.random() <= B.strength) list.push(o); }); for (const o of list) this.delObj(o); if (list.length) this.ui.refreshCounts(); return list.length; }
  dabEdit(c, mode) { // replace (assets from the mix, re-randomised) · scale (grow; Shift shrinks) · ground (re-seat on the terrain)
    const B = this.brush; const list = []; this.F.queryCircle(c.x, c.z, B.radius, (o) => { if (this.inScope(o, mode === 'replace' ? { ...B, eraseScope: B.eraseScope === 'mix' ? 'all' : B.eraseScope } : B) && Math.random() <= B.strength) list.push(o); });
    const mix = B.mix.filter((m) => this.P.assets[m.a] && m.w > 0); const wsum = mix.reduce((n, m) => n + m.w, 0); const nrm = new THREE.Vector3(); const shrink = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    for (const o of list) { this.touch(o);
      if (mode === 'replace') { if (!mix.length) break; let pick = Math.random() * wsum, m = mix[0]; for (const q of mix) { pick -= q.w; if (pick <= 0) { m = q; break; } } o.a = m.a; o.l = this.layerFor(m.a); const yaw = (Math.random() - 0.5) * B.rot * DEG; this.normalAt(o.p[0], o.p[2], nrm); const [ax, az] = this.alignTo(nrm, yaw, B.align); o.r = [ax, yaw, az]; const s = (B.scaleMin + Math.random() * Math.max(0, B.scaleMax - B.scaleMin)) * (m.s || 1); o.s = [s, s * (1 + (Math.random() - 0.5) * 2 * B.heightVar), s]; o.c = (Math.random() * 2 - 1) * B.colorVar; }
      else if (mode === 'scale') { const k = shrink ? 0.95 : 1.05; o.s = o.s.map((v) => v * k); }
      else if (mode === 'ground') { this.normalAt(o.p[0], o.p[2], nrm); const [ax, az] = this.alignTo(nrm, o.r[1], B.align); o.p = [o.p[0], L.surfaceY(o.p[0], o.p[2]) - B.sinkMin, o.p[2]]; o.r = [ax, o.r[1], az]; }
      this.F.updateObj(o); }
    return list.length;
  }
  updateRing() {
    const show = this.tool === 'paint' && this.mouse && !this.look; const p = show ? this.groundRay(this.ray(this.mouse)) : null; this.ring.visible = !!p; this.cursor = p; if (!p) return;
    const pos = this.ring.geometry.attributes.position, r = this.brush.radius; for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; pos.setXYZ(i, x, L.surfaceY(x, z) + 0.12, z); } pos.needsUpdate = true;
    const m = this.stroke && this.stroke.erase ? 'erase' : this.brush.mode; this.ring.material.color.set(m === 'erase' ? 0xff5a5a : m === 'paint' ? 0x8fef7a : 0x6fb4ff);
  }
  updateGhost() {
    if (this.tool !== 'place' || !this.mouse || this.look || !this.ghost.children.length) { this.ghost.visible = false; return; } const p = this.placePoint(this.mouse); if (!p) { this.ghost.visible = false; return; }
    this.cursor = p; const s = this.ui.place.scale; this.ghost.position.copy(p); this.ghost.rotation.set(0, this.ui.place.rotRandom ? 0 : (this.ui.place.yaw || 0) * DEG, 0); this.ghost.scale.setScalar(s); this.ghost.visible = true;
  }
  // ---------------------------------------------------------------- frame
  tick(dt) {
    const k = this.keys, fly = !!this.look; const sp = this.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 3.5 : 1) * (k.has('AltLeft') ? 0.25 : 1) * dt;
    const f = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)), r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (fly) { if (k.has('KeyW')) this.pos.addScaledVector(f, sp); if (k.has('KeyS')) this.pos.addScaledVector(f, -sp); if (k.has('KeyD')) this.pos.addScaledVector(r, sp); if (k.has('KeyA')) this.pos.addScaledVector(r, -sp); if (k.has('KeyE')) this.pos.y += sp; if (k.has('KeyQ')) this.pos.y -= sp; }
    if (k.has('ArrowUp')) this.pos.addScaledVector(f, sp); if (k.has('ArrowDown')) this.pos.addScaledVector(f, -sp); if (k.has('ArrowRight')) this.pos.addScaledVector(r, sp); if (k.has('ArrowLeft')) this.pos.addScaledVector(r, -sp); if (k.has('PageUp')) this.pos.y += sp; if (k.has('PageDown')) this.pos.y -= sp;
    this.pos.y = Math.max(L.surfaceY(this.pos.x, this.pos.z) + 0.5, Math.min(1500, this.pos.y));
    const cam = this.cam; cam.position.copy(this.pos); cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); cam.updateMatrixWorld(true);
    if (this.stroke) this.strokeStep(); this.updateRing(); this.updateGhost();
    if (this.tool === 'select' && this.mouse && !fly) { const p = this.groundRay(this.ray(this.mouse)); this.cursor = p; }
    const A = this.g.atmos, Fc = { x: this.pos.x, z: this.pos.z }; this.W.update(dt, Fc, cam, A); if (A) A.update(dt, new THREE.Vector3(Fc.x, 0, Fc.z), cam, dt);
    this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.05; this.statusT -= dt; if (this.statusT <= 0) { this.statusT = 0.25; this.ui.refreshStatus(); }
  }
  // ---------------------------------------------------------------- close
  close() { this.session.end(); }
  dispose(failedInit = false) {
    if (this.disposed) return; this.disposed = true; if (this.stroke) this.endStroke(); if (this.tx) this.commit(); clearInterval(this.autosave);
    if (this.cv) { removeEventListener('keydown', this.onKeyDown, true); removeEventListener('keyup', this.onKeyUp, true); this.cv.removeEventListener('pointerdown', this.onDown); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); this.cv.removeEventListener('wheel', this.onWheel); this.cv.removeEventListener('contextmenu', this.onCtx); }
    if (this.marquee) this.marquee.remove(); if (this.tc) { this.tc.detach(); this.tc.disconnect(); this.g.scene.remove(this.tcHelper); this.tc.dispose(); }
    for (const o of [this.selLines, this.ring, this.ghost, this.pivot]) if (o) { this.g.scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
    if (this.ui) this.ui.dispose();
    if (!failedInit && this.P) { this.keep(); if (this.unsaved) this.save(true).then((ok) => toast(ok ? 'Environment editor closed — saved to paint-pack/' : 'Environment editor closed — NOT saved (dev server?) — reopen with `paint` and Save', 4000)); }
    if (ED === this) ED = null;
  }
}
export { PaintEditor };
