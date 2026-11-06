// Map editor (console: `map`). Fly freely over Colombo, click anything — buildings, compound walls, street furniture,
// trees, shrubs, objects you placed — and edit it: move / rotate / scale / delete / duplicate, every parameter in the
// inspector (footprint, floors, style, paint colour, roof, front, balconies, tree species and size …). Add new buildings,
// trees, plants, street props, walls and free-form objects (box, cylinder, ramp, arch … with colour, opacity, glow,
// collision and painted textures). Repaint the city's own textures (roads, walls, roofs, pavements …) in the texture
// painter. Saved edits load with the game; nothing of this is downloaded unless you type `map`.
import * as THREE from 'three';
import { plan, chunkIndex } from '../world/CityPlan.js';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { buildBase, buildWall } from '../world/BuildingGen.js';
import { buildPropsForChunk } from '../world/Props.js';
import { buildVines } from '../world/Vines.js';
import { Forest } from '../world/Forest.js';
import * as L from '../world/Layout.js';
import { CHUNK } from '../world/CityPlan.js';
import { MAP, KINDS, FIELDS, kindOf, assignIds, setFields, removeObj, createObj, saveMap, primMesh, placePrim, primCollider, PRIM_SHAPES, liveTexture, textureFor, setMatTexture, MAT_ORIG } from './MapRuntime.js';
import { storeDel, storeSet, setSavedFlag } from './boot.js';
import { Painter } from './Painter.js';
import { Win, h, btn, num, color, check, select, text, section, propGrid, beginSession, toast, download, pickFile } from './ui.js';

let ed = null;
export async function open(game) { if (ed) return ed; assignIds(plan); ed = new MapEditor(game); return ed; }
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = typeof o[k] === 'object' ? JSON.parse(JSON.stringify(o[k])) : o[k]; return r; };
const LABEL = { b: 'Building', w: 'Wall', p: 'Prop', t: 'Tree', pl: 'Plant', prim: 'Object' };
const ctr = (o) => (o.x0 !== undefined ? [(o.x0 + o.x1) / 2, (o.z0 + o.z1) / 2] : [o.x, o.z]);
let uidN = Date.now() % 1e7;

class MapEditor {
  constructor(game) {
    this.g = game; this.W = game.world; this.cam = game.camera; this.keys = new Set(); this.speed = 25; this.sel = null; this.undo = []; this.dirtyChunks = new Set(); this.forestDirty = false; this.flushAt = 0; this.texCv = new Map();
    this.filter = { b: true, w: true, p: true, t: true, pl: true, prim: true }; this.place = null; this.grab = null;
    const e = new THREE.Euler().setFromQuaternion(this.cam.quaternion, 'YXZ'); this.yaw = e.y; this.pitch = e.x; this.pos = this.cam.position.clone();
    if (this.W.editorPrims == null) { this.W.editorPrims = new THREE.Group(); this.W.editorPrims.name = 'editorPrims'; this.W.root.add(this.W.editorPrims); }
    this.box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), new THREE.LineBasicMaterial({ color: 0xffb020, depthTest: false })); this.box.renderOrder = 999; this.box.visible = false; this.box.frustumCulled = false; game.scene.add(this.box);
    this.session = beginSession(game, 'map', { hook: (dt) => this.tick(dt), onEnd: () => this.dispose() });
    this.bindInput(); this.buildUI(); toast('Map editor — right-drag to look, WASD / Q E to fly, click to select');
  }
  // ---------------------------------------------------------------- UI
  buildUI() {
    this.main = new Win('Map editor', { x: 12, y: 12, w: 330, h: Math.min(innerHeight - 24, 640), onClose: () => this.session.end() });
    const hint = h('div', { cls: 'ed-hint' }, 'Right-drag look · WASD fly · Q/E down/up · Shift fast · wheel = speed · click select · G grab (click to drop) · arrows nudge (Alt fine, Shift ×10) · PgUp/PgDn height/floors · [ ] rotate · − = scale · Del delete · Ctrl+D duplicate · Ctrl+Z undo · Ctrl+S save · F focus · Esc deselect');
    const filt = section('Selectable', false, ...Object.keys(this.filter).map((k) => check(LABEL[k] + 's', this.filter[k], (v) => { this.filter[k] = v; })));
    // add palette
    const kinds = { b: [...new Set(plan.buildings.map((b) => b.style))].sort(), t: [...new Set(plan.trees.map((t) => t.type))].sort(), pl: [...new Set((plan.plants || []).map((p) => p.type))].sort(), p: [...new Set(plan.props.map((p) => p.type))].sort(), w: ['compound wall'], prim: PRIM_SHAPES };
    let addK = 'prim', addT = 'box'; const typeSel = h('div');
    const fillTypes = () => { typeSel.replaceChildren(select('Type', kinds[addK], addT, (v) => { addT = v; })); }; addT = kinds[addK][0]; fillTypes();
    const add = section('Add', true, select('Kind', Object.keys(kinds).map((k) => [k, LABEL[k]]), addK, (v) => { addK = v; addT = kinds[v][0]; fillTypes(); }), typeSel,
      btn('➕ Place (click on the ground)', () => { this.place = { k: addK, type: addT }; toast('Click where it goes (right-click cancels)'); }));
    this.status = h('div', { cls: 'ed-hint' });
    const file = section('Save', true, h('div', { cls: 'ed-tabs' }, btn('💾 Save map', () => this.save()), btn('Export', () => this.exportMap()), btn('Import', () => this.importMap())),
      h('div', { cls: 'ed-tabs' }, btn('Undo', () => this.doUndo()), btn('Revert to generated city…', () => this.revertAll(), { cls: 'warn' })), this.status);
    const tex = section('Textures', false, btn('Repaint a city texture (roads, walls, roofs …)', () => this.matWindow()));
    const view = section('View', false, num('Fly speed', this.speed, { min: 2, max: 200, step: 1 }, (v) => { this.speed = v; }), btn('Fly to player', () => { const P = this.g.player; this.pos.set(P.x, (P.y || 0) + 12, P.z + 14); this.pitch = -0.6; this.yaw = Math.PI; }),
      btn('Exit editor', () => this.main.close()));
    this.main.body.append(hint, add, filt, tex, file, view); this.updateStatus();
    this.insp = new Win('Inspector', { x: innerWidth - 372, y: 12, w: 360, h: Math.min(innerHeight - 24, 640) }); this.insp.body.append(h('div', { cls: 'ed-hint' }, 'Click something in the city to edit it.'));
    this.insp.onClose = () => { this.insp = null; };
  }
  updateStatus() { const E = MAP.edits; this.status.textContent = `${Object.keys(E.mods).length} changed / deleted · ${E.added.length} added${this.unsaved ? ' · unsaved changes' : ''}`; }
  inspect() {
    if (!this.insp || this.insp.closed) { this.insp = new Win('Inspector', { x: innerWidth - 372, y: 12, w: 360, h: Math.min(innerHeight - 24, 640) }); this.insp.onClose = () => { this.insp = null; }; }
    const B = this.insp.body; B.replaceChildren(); const s = this.sel; if (!s) { B.append(h('div', { cls: 'ed-hint' }, 'Nothing selected.')); return; }
    const { k, o } = s; const name = k === 'prim' ? o.shape : o.style || o.type || 'wall';
    B.append(h('div', { style: { fontWeight: 600, color: '#e0a030', marginBottom: '6px' } }, `${LABEL[k]} — ${name}  `, h('small', { style: { color: '#999' } }, k === 'prim' ? 'placed object' : o._eid)));
    if (this.locked(s)) B.append(h('div', { cls: 'ed-hint', style: { color: '#f0a060' } }, 'Linked to a mission / shop / interior: it can be edited but not deleted. Its shopfront / interior follows after a reload.'));
    if (k === 'prim') { B.append(this.primPanel(o)); }
    else {
      const f = pick(o, FIELDS[k]); const opts = (key) => [...new Set(plan[KINDS[k][0]].map((x) => x[key]).filter((v) => typeof v === 'string'))].sort();
      const H = { style: { options: opts('style') }, roof: { options: opts('roof') }, front: { options: ['N', 'S', 'E', 'W'] }, type: { options: opts('type') }, floors: { min: 1, max: 40, step: 1 }, s: { min: 0.3, max: 3, step: 0.01 }, sy: { min: 0.5, max: 2, step: 0.01 }, sq: { min: 0.5, max: 2, step: 0.01 },
        yaw: { min: -Math.PI, max: Math.PI, step: 0.01 }, rot: { min: -Math.PI, max: Math.PI, step: 0.01 }, h: { min: 0.3, max: 8, step: 0.05 } };
      for (const key of ['x', 'x0', 'x1']) H[key] = { min: o[key] - 60, max: o[key] + 60, step: 0.05 }; for (const key of ['z', 'z0', 'z1']) H[key] = { min: o[key] - 60, max: o[key] + 60, step: 0.05 };
      for (const key of ['porch', 'balconies', 'tanks']) if (f[key] === undefined && k === 'b') f[key] = false;
      B.append(propGrid(f, (p, v) => this.setSel({ [p.split('.')[0]]: f[p.split('.')[0]] ?? v }), H));
    }
    B.append(h('div', { cls: 'ed-tabs', style: { marginTop: '8px' } }, btn('Grab (G)', () => this.startGrab()), btn('Duplicate', () => this.duplicate()), btn('Focus (F)', () => this.focus()), btn('Delete', () => this.del(), { cls: 'warn' })));
  }
  primPanel(d) {
    const out = h('div'); const ch = (f) => this.setPrim(d, f);
    out.append(select('Shape', PRIM_SHAPES, d.shape, (v) => ch({ shape: v })));
    for (const [k, lab, rg] of [['x', 'X', 0.05], ['y', 'Height above ground', 0.05], ['z', 'Z', 0.05]]) out.append(num(lab, d[k], { min: d[k] - 50, max: d[k] + 50, step: rg }, (v) => ch({ [k]: v })));
    for (const [k, lab] of [['sx', 'Width'], ['sy', 'Height'], ['sz', 'Depth']]) out.append(num(lab, d[k] || 1, { min: 0.05, max: 60, step: 0.05 }, (v) => ch({ [k]: v })));
    for (const [k, lab] of [['rx', 'Tilt X'], ['ry', 'Turn'], ['rz', 'Tilt Z']]) out.append(num(lab, d[k] || 0, { min: -Math.PI, max: Math.PI, step: 0.01 }, (v) => ch({ [k]: v })));
    out.append(color('Colour', d.color || '#cccccc', (v) => ch({ color: v })), num('Roughness', d.rough ?? 0.8, { min: 0, max: 1, step: 0.01 }, (v) => ch({ rough: v })), num('Metalness', d.metal ?? 0, { min: 0, max: 1, step: 0.01 }, (v) => ch({ metal: v })),
      num('Glow', d.glow || 0, { min: 0, max: 4, step: 0.05 }, (v) => ch({ glow: v })), num('Opacity', d.opacity ?? 1, { min: 0.05, max: 1, step: 0.01 }, (v) => ch({ opacity: v })), check('Solid (collides)', !!d.solid, (v) => ch({ solid: v })), check('Casts shadow', d.shadow !== false, (v) => ch({ shadow: v })));
    const names = Object.keys(MAP.edits.textures).filter((n) => !n.startsWith('mat:'));
    out.append(section('Texture', true, select('Texture', [['', '— none —'], ...names.map((n) => [n, n])], d.tex || '', (v) => ch({ tex: v || null })), num('Repeat', d.rep || 1, { min: 0.1, max: 40, step: 0.1 }, (v) => ch({ rep: v })),
      h('div', { cls: 'ed-tabs' }, btn('New texture & paint', () => { const n = 'tex' + (names.length + 1) + '-' + (uidN++ % 1000); const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); this.texCv.set(n, cv); MAP.edits.textures[n] = cv.toDataURL(); ch({ tex: n }); this.paintTexture(n, d); }),
        d.tex ? btn('Paint this texture', () => this.paintTexture(d.tex, d)) : null)));
    return out;
  }
  // ---------------------------------------------------------------- textures
  texCanvas(name, W = 256, H = 256, src = null) {
    if (this.texCv.has(name)) return this.texCv.get(name); const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    if (src) g.drawImage(src, 0, 0, W, H); else { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
    const url = MAP.edits.textures[name]; if (url) { const img = new Image(); img.onload = () => { g.drawImage(img, 0, 0, W, H); this.painterWin?.painter?.refresh(); this.texChanged(name); }; img.src = url; }
    this.texCv.set(name, cv); return cv;
  }
  texChanged(name) { const cv = this.texCv.get(name); if (!cv) return; const t = liveTexture(name, cv); if (name.startsWith('mat:')) setMatTexture(name.slice(4), t); else for (const m of this.W.editorPrims.children) if (m.userData.prim.tex === name) { if (m.material.map !== t) { m.material.map = t; m.material.needsUpdate = true; } t.repeat.set(m.userData.prim.rep || 1, m.userData.prim.rep || 1); } this.texDirty = true; this.unsaved = true; this.updateStatus(); }
  paintTexture(name, d = null, W = 256, H = 256, src = null) {
    if (this.painterWin && !this.painterWin.closed) this.painterWin.close(); const cv = this.texCanvas(name, W, H, src); if (d) this.texChanged(name);
    const w = new Win('Texture painter — ' + name, { x: Math.max(12, innerWidth / 2 - 280), y: 40, w: 560, h: Math.min(innerHeight - 60, 700) }); this.painterWin = w;
    w.painter = new Painter(w.body, cv, () => this.texChanged(name));
    if (name.startsWith('mat:')) w.extra.append(btn('Restore original', () => { const k = name.slice(4); setMatTexture(k, null); delete MAP.edits.textures[name]; this.texCv.delete(name); this.unsaved = true; w.close(); toast('Original ' + k + ' texture restored'); }));
  }
  matWindow() {
    if (this.matWin && !this.matWin.closed) return; const w = new Win('City textures', { x: 350, y: 12, w: 300, h: 520 }); this.matWin = w;
    const list = Object.entries(MAT).filter(([, m]) => m && m.map && m.map.image && (m.map.image.width || 0) > 1).map(([k, m]) => [k, m]).sort((a, b) => a[0].localeCompare(b[0]));
    w.body.append(h('div', { cls: 'ed-hint' }, 'Pick a city material and paint its texture — every road, wall, roof … using it changes live.'), h('div', { cls: 'ed-list', style: { maxHeight: '420px' } }, list.map(([k, m]) => h('div', { onclick: () => { const im = (MAT_ORIG.get(k) || m.map).image; this.paintTexture('mat:' + k, null, Math.min(1024, im.width), Math.min(1024, im.height), im); this.texChanged('mat:' + k); } }, k, h('small', {}, (m.map.image.width || '?') + '²' + (MAP.edits.textures['mat:' + k] ? ' · edited' : ''))))));
  }
  // ---------------------------------------------------------------- input
  bindInput() {
    const cv = this.g.canvas || this.g.renderer.domElement; this.cv = cv; const inField = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    this.onKeyDown = (e) => { if (inField(e) || e.target.closest?.('.ed-win')) return; this.keys.add(e.code); this.key(e); };
    this.onKeyUp = (e) => { this.keys.delete(e.code); };
    this.onDown = (e) => { if (e.button === 2) { this.look = [e.clientX, e.clientY]; if (this.place) { this.place = null; toast('Placing cancelled'); } if (this.grab) this.cancelGrab(); } else if (e.button === 0) this.click(e); };
    this.onMove = (e) => { this.mouse = e; if (this.look) { this.yaw -= (e.clientX - this.look[0]) * 0.004; this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - (e.clientY - this.look[1]) * 0.004)); this.look = [e.clientX, e.clientY]; } if (this.grab) this.dragGrab(e); };
    this.onUp = (e) => { if (e.button === 2) this.look = null; };
    this.onWheel = (e) => { this.speed = Math.max(2, Math.min(300, this.speed * (e.deltaY > 0 ? 0.85 : 1.18))); e.preventDefault(); };
    this.onCtx = (e) => e.preventDefault();
    addEventListener('keydown', this.onKeyDown, true); addEventListener('keyup', this.onKeyUp, true); cv.addEventListener('pointerdown', this.onDown); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp); cv.addEventListener('wheel', this.onWheel, { passive: false }); cv.addEventListener('contextmenu', this.onCtx);
  }
  key(e) {
    const c = e.code, s = this.sel, ctrl = e.ctrlKey || e.metaKey; const st = e.altKey ? 0.05 : e.shiftKey ? 5 : 0.5;
    if (ctrl && c === 'KeyS') { e.preventDefault(); this.save(); return; } if (ctrl && c === 'KeyZ') { e.preventDefault(); this.doUndo(); return; } if (ctrl && c === 'KeyD') { e.preventDefault(); this.duplicate(); return; }
    if (c === 'Escape') { if (this.grab) this.cancelGrab(); else if (this.place) this.place = null; else this.select(null); return; }
    if (!s || ctrl) return;
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[c];
    if (mv) { e.preventDefault(); // screen-relative nudge, snapped to the dominant world axis
      const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)), r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); const d = r.multiplyScalar(mv[0]).add(f.multiplyScalar(-mv[1]));
      const ax = Math.abs(d.x) > Math.abs(d.z) ? [Math.sign(d.x) * st, 0] : [0, Math.sign(d.z) * st]; this.moveBy(ax[0], ax[1]); return; }
    if (c === 'KeyG') this.startGrab(); else if (c === 'KeyF') this.focus(); else if (c === 'Delete' || c === 'Backspace') this.del();
    else if (c === 'BracketLeft' || c === 'BracketRight') this.rotateBy(c === 'BracketLeft' ? -1 : 1, e.shiftKey);
    else if (c === 'Minus' || c === 'Equal') this.scaleBy(c === 'Minus' ? -1 : 1);
    else if (c === 'PageUp' || c === 'PageDown') this.raiseBy(c === 'PageUp' ? 1 : -1, st);
  }
  ray(e) { const r = this.cv.getBoundingClientRect(); const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.cam); return rc; }
  groundAt(e) { const rc = this.ray(e); const o = rc.ray.origin, d = rc.ray.direction; if (d.y > -1e-4) return null; let y = 0; let p = null; for (let i = 0; i < 4; i++) { const t = (y - o.y) / d.y; if (t < 0) return null; p = o.clone().addScaledVector(d, t); y = L.groundY(p.x, p.z); } return p.setY(y); }
  // ---------------------------------------------------------------- picking (on the plan data: the city is batched)
  boxOf(k, o) {
    const [cx, cz] = ctr(o); const gy = L.groundY(cx, cz);
    if (k === 'b') return [o.x0, gy, o.z0, o.x1, gy + o.totalH, o.z1]; if (k === 'w') return [o.x0, gy, o.z0, o.x1, gy + (o.h || 2), o.z1];
    if (k === 't') { const s = o.s || 1, r = 2.2 * s * (o.sq || 1); return [o.x - r, gy, o.z - r, o.x + r, gy + 9 * s * (o.sy || 1), o.z + r]; }
    if (k === 'pl') { const r = 0.6 * (o.s || 1); return [o.x - r, gy, o.z - r, o.x + r, gy + 1.4 * (o.s || 1), o.z + r]; }
    if (k === 'p') return [o.x - 0.45, gy, o.z - 0.45, o.x + 0.45, gy + 3, o.z + 0.45]; return null;
  }
  pickAt(e) {
    const rc = this.ray(e), R = rc.ray, O = R.origin, D = R.direction; let best = null, bt = Infinity;
    const test = (k, o) => { const b = this.boxOf(k, o); if (!b) return; let t0 = 0, t1 = 2000; for (let a = 0; a < 3; a++) { const oa = [O.x, O.y, O.z][a], da = [D.x, D.y, D.z][a], lo = b[a], hi = b[a + 3]; if (Math.abs(da) < 1e-9) { if (oa < lo || oa > hi) return; continue; } let ta = (lo - oa) / da, tb = (hi - oa) / da; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) return; }
      const bias = k === 'b' ? 1.5 : k === 't' ? 0.6 : 0; if (t0 + bias < bt) { bt = t0 + bias; best = { k, o }; } };
    const ci = chunkIndex(O.x, O.z); const near = new Set(); const nx = Math.ceil(600 / CHUNK);
    for (let dz = -nx; dz <= nx; dz++) for (let dx = -nx; dx <= nx; dx++) { const c = chunkIndex(O.x + dx * CHUNK, O.z + dz * CHUNK); if (c >= 0) near.add(c); } void ci;
    for (const c of near) { const ch = plan.byChunk[c]; if (this.filter.b) for (const o of ch.buildings) test('b', o); if (this.filter.w) for (const o of ch.walls || []) test('w', o); if (this.filter.p) for (const o of ch.props) test('p', o); if (this.filter.t) for (const o of ch.trees) test('t', o); }
    if (this.filter.pl) for (const o of plan.plants || []) if (Math.abs(o.x - O.x) < 250 && Math.abs(o.z - O.z) < 250) test('pl', o);
    if (this.filter.prim) { const hs = rc.intersectObjects(this.W.editorPrims.children, false); if (hs[0] && hs[0].distance < bt + 0.5) best = { k: 'prim', o: hs[0].object.userData.prim, mesh: hs[0].object }; }
    return best;
  }
  click(e) {
    if (this.grab) { this.endGrab(); return; }
    if (this.place) { const p = this.groundAt(e); if (!p) return; this.placeAt(this.place, p); if (!e.shiftKey) this.place = null; return; }
    this.select(this.pickAt(e));
  }
  select(s) { this.sel = s; this.inspect(); this.updateBox(); }
  updateBox() { const s = this.sel; if (!s) { this.box.visible = false; return; } let b; if (s.k === 'prim') { const m = this.meshOf(s.o); if (!m) { this.box.visible = false; return; } const bb = new THREE.Box3().setFromObject(m); b = [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z]; } else b = this.boxOf(s.k, s.o);
    this.box.position.set((b[0] + b[3]) / 2, b[1], (b[2] + b[5]) / 2); this.box.scale.set(Math.max(0.1, b[3] - b[0]), Math.max(0.1, b[4] - b[1]), Math.max(0.1, b[5] - b[2])); this.box.visible = true; }
  locked(s) { if (!s || s.k !== 'b') return false; const id = s.o.id; return Object.values(plan.missionShops || {}).some((v) => v && v.b === id) || !!(s.o.interior || s.o.hero || s.o.mission || s.o.room); }
  meshOf(d) { return this.W.editorPrims.children.find((m) => m.userData.prim === d); }
  // ---------------------------------------------------------------- edit operations (each recorded in MAP.edits + undo)
  entryOf(o) { return o._eid && o._eid.startsWith('a:') ? MAP.edits.added.find((d) => 'a:' + d.uid === o._eid) : null; }
  record(o) { const k = kindOf(o), en = this.entryOf(o); if (en) Object.assign(en, pick(o, FIELDS[k])); else MAP.edits.mods[o._eid] = pick(o, FIELDS[k]); this.unsaved = true; this.updateStatus(); }
  sync(out, k) { const W = this.W; const rs = new Set(out.removed); if (rs.size) W.collision.remove((c) => rs.has(c)); for (const c of out.added) W.collision.add(c); if (k === 't' || k === 'pl') this.forestDirty = true; else for (const c of out.chunks) if (c >= 0) this.dirtyChunks.add(c); this.flushAt = performance.now() + 250; }
  setSel(f) { const s = this.sel; if (!s) return; if (s.k === 'prim') return this.setPrim(s.o, f); const o = s.o, k = s.k; const before = pick(o, Object.keys(f).concat(FIELDS[k])); const prev = this.snapEntry(o);
    this.sync(setFields(plan, o, f), k); this.record(o); this.undo.push({ t: 'set', o, k, before, prev }); this.updateBox(); }
  snapEntry(o) { const en = this.entryOf(o); return en ? { en: JSON.parse(JSON.stringify(en)) } : { mod: MAP.edits.mods[o._eid] ? JSON.parse(JSON.stringify(MAP.edits.mods[o._eid])) : undefined }; }
  restoreEntry(o, prev) { const en = this.entryOf(o); if (en && prev.en) { for (const k of Object.keys(en)) delete en[k]; Object.assign(en, prev.en); } else if (!en) { if (prev.mod === undefined) delete MAP.edits.mods[o._eid]; else MAP.edits.mods[o._eid] = prev.mod; } }
  moveBy(dx, dz) { const s = this.sel; if (!s) return; const o = s.o; if (s.k === 'prim') return this.setPrim(o, { x: o.x + dx, z: o.z + dz }); if (o.x0 !== undefined) this.setSel({ x0: o.x0 + dx, x1: o.x1 + dx, z0: o.z0 + dz, z1: o.z1 + dz }); else this.setSel({ x: o.x + dx, z: o.z + dz }); }
  rotateBy(dir, fine) { const s = this.sel; if (!s) return; const o = s.o, a = (fine ? 1 : 15) * Math.PI / 180 * dir;
    if (s.k === 'prim') this.setPrim(o, { ry: (o.ry || 0) + a }); else if (s.k === 't' || s.k === 'pl') this.setSel({ yaw: (o.yaw || 0) + a }); else if (s.k === 'p') this.setSel({ rot: (o.rot || 0) + a });
    else if (s.k === 'b') { const F = ['N', 'E', 'S', 'W']; const i = F.indexOf(o.front); this.setSel({ front: F[(i + (dir > 0 ? 1 : 3)) % 4] }); }
    else if (s.k === 'w') { const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2, hx = (o.x1 - o.x0) / 2, hz = (o.z1 - o.z0) / 2; this.setSel({ x0: cx - hz, x1: cx + hz, z0: cz - hx, z1: cz + hx }); } }
  scaleBy(dir) { const s = this.sel; if (!s) return; const o = s.o, f = dir > 0 ? 1.1 : 1 / 1.1;
    if (s.k === 'prim') this.setPrim(o, { sx: (o.sx || 1) * f, sy: (o.sy || 1) * f, sz: (o.sz || 1) * f }); else if (s.k === 't' || s.k === 'pl') this.setSel({ s: Math.max(0.2, Math.min(4, (o.s || 1) * f)) });
    else if (o.x0 !== undefined) { const g = dir * 0.5; this.setSel({ x0: o.x0 - g, x1: o.x1 + g, z0: o.z0 - g, z1: o.z1 + g }); } }
  raiseBy(dir, st) { const s = this.sel; if (!s) return; const o = s.o; if (s.k === 'prim') this.setPrim(o, { y: o.y + dir * st }); else if (s.k === 'b') this.setSel({ floors: Math.max(1, o.floors + dir) }); else if (s.k === 'w') this.setSel({ h: Math.max(0.3, (o.h || 2) + dir * 0.25) }); else if (s.k === 't') this.setSel({ sy: Math.max(0.5, Math.min(2, (o.sy || 1) + dir * 0.05)) }); }
  del() { const s = this.sel; if (!s) return; if (this.locked(s)) { toast('This building is linked to a mission / shop / interior — it can’t be deleted'); return; }
    if (s.k === 'prim') { const d = s.o, i = MAP.edits.added.indexOf(d); MAP.edits.added.splice(i, 1); const m = this.meshOf(d); if (m) { this.W.editorPrims.remove(m); m.geometry.dispose(); m.material.dispose(); } this.W.collision.remove((c) => c.prim === d.uid); this.undo.push({ t: 'addPrim', d, undoDel: true }); }
    else { const o = s.o, k = s.k; const prev = this.snapEntry(o); const en = this.entryOf(o); const out = removeObj(plan, o); this.sync(out, k); if (en) MAP.edits.added.splice(MAP.edits.added.indexOf(en), 1); else MAP.edits.mods[o._eid] = { del: true }; this.undo.push({ t: 'del', o, k, out, prev, en }); }
    this.unsaved = true; this.updateStatus(); this.select(null); }
  placeAt(pl, p) {
    const uid = 'u' + (uidN++).toString(36); let d;
    if (pl.k === 'prim') { d = { uid, k: 'prim', shape: pl.type, x: p.x, y: p.y, z: p.z, sx: 2, sy: 2, sz: 2, ry: this.yaw, color: '#d8d2c4', solid: true }; return this.addPrim(d); }
    const tpl = (arr, f) => { const all = plan[arr].filter(f); let b = null, bd = Infinity; for (const o of all) { const [x, z] = ctr(o); const dd = (x - p.x) ** 2 + (z - p.z) ** 2; if (dd < bd) { bd = dd; b = o; } } return b; };
    const strip = (o) => { const c = JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') || k === 'col' || k === 'id' || k === 'h' || k === 'totalH' ? undefined : v))); return c; };
    if (pl.k === 'b') { const t = tpl('buildings', (b) => b.style === pl.type && !this.locked({ k: 'b', o: b })); if (!t) return toast('No template'); d = strip(t); const hx = Math.min(12, (t.x1 - t.x0) / 2), hz = Math.min(12, (t.z1 - t.z0) / 2); Object.assign(d, { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz }); delete d.tower; }
    else if (pl.k === 'w') d = { x0: p.x - 5, x1: p.x + 5, z0: p.z - 0.1, z1: p.z + 0.1, h: 2, col: '#e8e0d0' };
    else { const arr = KINDS[pl.k][0]; const t = tpl(arr, (o) => o.type === pl.type); d = t ? strip(t) : { type: pl.type }; Object.assign(d, { x: p.x, z: p.z }); if (pl.k === 't' || pl.k === 'pl') d.yaw = Math.random() * 6.283; }
    d.uid = uid; d.k = pl.k; MAP.edits.added.push(d); const { obj, out } = createObj(plan, d); this.sync(out, pl.k); this.undo.push({ t: 'add', o: obj, k: pl.k, d, out }); this.unsaved = true; this.updateStatus(); this.select({ k: pl.k, o: obj });
  }
  addPrim(d) { if (!MAP.edits.added.includes(d)) MAP.edits.added.push(d); const m = primMesh(d); this.W.editorPrims.add(m); const c = primCollider(d); if (c) this.W.collision.add(c); this.undo.push({ t: 'addPrim', d }); this.unsaved = true; this.updateStatus(); this.select({ k: 'prim', o: d, mesh: m }); }
  setPrim(d, f, noUndo = false) {
    if (!noUndo) this.undo.push({ t: 'setPrim', d, before: pick(d, Object.keys(f).concat(['x', 'y', 'z', 'sx', 'sy', 'sz', 'rx', 'ry', 'rz'])) });
    const needMesh = ['shape', 'color', 'rough', 'metal', 'glow', 'opacity', 'tex', 'rep', 'shadow'].some((k) => k in f); Object.assign(d, f); let m = this.meshOf(d);
    if (needMesh && m) { this.W.editorPrims.remove(m); m.geometry.dispose(); m.material.dispose(); if (d.tex && this.texCv.has(d.tex)) { MAP.edits.textures[d.tex] = this.texCv.get(d.tex).toDataURL(); } m = primMesh(d); if (d.tex && this.texCv.has(d.tex)) { m.material.map = liveTexture(d.tex, this.texCv.get(d.tex)); m.material.map.repeat.set(d.rep || 1, d.rep || 1); } this.W.editorPrims.add(m); }
    else if (m) placePrim(m, d);
    this.W.collision.remove((c) => c.prim === d.uid); const c = primCollider(d); if (c) this.W.collision.add(c); this.unsaved = true; this.updateStatus(); this.updateBox(); if (needMesh && 'shape' in f) this.inspect();
  }
  duplicate() { const s = this.sel; if (!s) return; if (s.k === 'prim') { const d = { ...JSON.parse(JSON.stringify(s.o)), uid: 'u' + (uidN++).toString(36) }; d.x += 2; d.z += 2; return this.addPrim(d); }
    const [x, z] = ctr(s.o); const k = s.k; const o = s.o; const d = JSON.parse(JSON.stringify(o, (kk, v) => (kk.startsWith('_') || kk === 'col' || kk === 'id' || kk === 'h' || kk === 'totalH' ? undefined : v))); const off = k === 'b' ? (o.x1 - o.x0) + 2 : k === 'w' ? 0 : 2;
    if (d.x0 !== undefined) { d.x0 += off; d.x1 += off; if (k === 'w') { d.z0 += 1; d.z1 += 1; } } else { d.x = x + off; d.z = z; }
    d.uid = 'u' + (uidN++).toString(36); d.k = k; delete d.tower; MAP.edits.added.push(d); const { obj, out } = createObj(plan, d); this.sync(out, k); this.undo.push({ t: 'add', o: obj, k, d, out }); this.unsaved = true; this.updateStatus(); this.select({ k, o: obj }); }
  doUndo() {
    const u = this.undo.pop(); if (!u) { toast('Nothing to undo'); return; }
    if (u.t === 'set') { this.sync(setFields(plan, u.o, u.before), u.k); this.restoreEntry(u.o, u.prev); }
    else if (u.t === 'del') { const o = u.o, [arr, bk] = KINDS[u.k]; plan[arr].push(o); const [x, z] = ctr(o); const ci = chunkIndex(x, z); if (bk && ci >= 0) plan.byChunk[ci][bk].push(o); plan.colliders.push(...u.out.removed); this.sync({ removed: [], added: u.out.removed, chunks: u.out.chunks }, u.k); if (u.en) MAP.edits.added.push(u.en); else this.restoreEntry(o, u.prev); }
    else if (u.t === 'add') { const out = removeObj(plan, u.o); this.sync(out, u.k); MAP.edits.added.splice(MAP.edits.added.indexOf(u.d), 1); }
    else if (u.t === 'addPrim') { if (u.undoDel) { MAP.edits.added.push(u.d); const m = primMesh(u.d); this.W.editorPrims.add(m); const c = primCollider(u.d); if (c) this.W.collision.add(c); } else { const i = MAP.edits.added.indexOf(u.d); if (i >= 0) MAP.edits.added.splice(i, 1); const m = this.meshOf(u.d); if (m) { this.W.editorPrims.remove(m); m.geometry.dispose(); m.material.dispose(); } this.W.collision.remove((c) => c.prim === u.d.uid); } }
    else if (u.t === 'setPrim') this.setPrim(u.d, u.before, true);
    this.unsaved = true; this.updateStatus(); if (this.sel) { this.inspect(); this.updateBox(); }
  }
  // grab: the object follows the cursor on the ground; click drops it, right-click / Esc puts it back
  startGrab() { const s = this.sel; if (!s || !this.mouse) return; const p = this.groundAt(this.mouse); if (!p) return; const [x, z] = s.k === 'prim' ? [s.o.x, s.o.z] : ctr(s.o); this.grab = { off: [x - p.x, z - p.z], start: [x, z], cur: [x, z] }; toast('Move the mouse — click to drop'); }
  dragGrab(e) { const G = this.grab, s = this.sel; const p = this.groundAt(e); if (!p) return; const nx = p.x + G.off[0], nz = p.z + G.off[1]; G.cur = [nx, nz];
    if (s.k === 'prim') { s.o.x = nx; s.o.z = nz; s.o.y = L.groundY(nx, nz); const m = this.meshOf(s.o); if (m) placePrim(m, s.o); }
    const [cx, cz] = s.k === 'prim' ? G.start : ctr(s.o); this.box.position.x += 0; this.updateBox(); if (s.k !== 'prim') { this.box.position.x += nx - cx; this.box.position.z += nz - cz; } }
  endGrab() { const G = this.grab; this.grab = null; const s = this.sel; if (!s) return; if (s.k === 'prim') { const cur = { x: s.o.x, y: s.o.y, z: s.o.z }; Object.assign(s.o, { x: G.start[0], z: G.start[1] }); this.setPrim(s.o, cur); } else { const [cx, cz] = ctr(s.o); this.moveBy(G.cur[0] - cx, G.cur[1] - cz); } this.inspect(); }
  cancelGrab() { const G = this.grab; this.grab = null; const s = this.sel; if (s && s.k === 'prim') { s.o.x = G.start[0]; s.o.z = G.start[1]; s.o.y = L.groundY(s.o.x, s.o.z); const m = this.meshOf(s.o); if (m) placePrim(m, s.o); } this.updateBox(); }
  focus() { const s = this.sel; if (!s) return; const [x, z] = s.k === 'prim' ? [s.o.x, s.o.z] : ctr(s.o); const b = s.k === 'prim' ? null : this.boxOf(s.k, s.o); const hgt = b ? b[4] - b[1] : 3; const dist = Math.max(8, hgt * 1.6);
    this.pos.set(x - Math.sin(this.yaw) * -dist, L.groundY(x, z) + hgt * 0.6 + dist * 0.5, z - Math.cos(this.yaw) * -dist); this.pitch = -0.45; }
  // ---------------------------------------------------------------- live rebuild of what an edit touched
  rebuildChunk(ci) {
    const W = this.W, c = W.chunks[ci], ch = plan.byChunk[ci]; if (!c || !ch) return;
    for (const e of c.base || []) if (e.layer === 'bld') e.batch.setVisibleAt(e.iid, false); // batched originals off
    for (const m of [...c.group.children]) if (m.userData.layer === 'bld') { c.group.remove(m); if (m.userData.edBld) m.geometry.dispose(); }
    const mb = new MultiBuilder(); for (const b of ch.buildings) buildBase(b, mb); for (const w of ch.walls || []) buildWall(w, mb);
    for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) { m.userData.layer = 'bld'; m.userData.edBld = true; if (m.name === 'ao') { m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1; } m.updateMatrix(); m.updateMatrixWorld(true); m.matrixAutoUpdate = false; c.group.add(m); }
    if (W.job && W.job.c === c) W.job = null; if (c.detail) W.disposeDetail(c); if (W.wjob && W.wjob.c === c) W.wjob = null; if (c.win) W.disposeWindows(c); // facade detail + windows rebuild as you look at them
    for (const part of c.pooled || []) { const i = part.P.parts.indexOf(part); if (i >= 0) part.P.parts.splice(i, 1); } c.pooled = [];
    if (c.props) { c.group.remove(c.props); c.props.traverse((m) => { if (m.isInstancedMesh) m.dispose(); }); }
    c.props = buildPropsForChunk(ch); c.props.traverse((m) => { m.updateMatrixWorld(true); }); c.group.add(c.props); c.lamps = c.props.userData.lamps || []; W.propDirty = true;
    if (c.vines) { c.group.remove(c.vines); c.vines.traverse((m) => m.geometry && m.geometry.dispose()); c.vines = null; } const st = buildVines(plan, [c]); st.warm?.geometry.dispose(); if (c.vines) c.vines.updateMatrixWorld(true);
  }
  rebuildForest() {
    const W = this.W, old = W.forest; if (old) { W.root.remove(old.group); old.group.traverse((m) => { if (m.isBatchedMesh || m.isInstancedMesh) m.dispose(); }); }
    W.forest = new Forest(plan.trees, plan.plants || [], W.quality || 'high'); W.root.add(W.forest.group); for (const c of W.chunks) c.trees = W.forest.chunkHandle(c.cx - CHUNK / 2, c.cz - CHUNK / 2, CHUNK);
  }
  flush() { const t0 = performance.now(); for (const ci of this.dirtyChunks) this.rebuildChunk(ci); this.dirtyChunks.clear(); if (this.forestDirty) { this.forestDirty = false; this.rebuildForest(); } this.lastFlushMs = performance.now() - t0; }
  // ---------------------------------------------------------------- frame
  tick(dt) {
    const k = this.keys, sp = this.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1) * dt; const f = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (!this.sel || !k.has('ArrowUp')) { if (k.has('KeyW')) this.pos.addScaledVector(f, sp); if (k.has('KeyS')) this.pos.addScaledVector(f, -sp); if (k.has('KeyD')) this.pos.addScaledVector(r, sp); if (k.has('KeyA')) this.pos.addScaledVector(r, -sp); if (k.has('KeyE')) this.pos.y += sp; if (k.has('KeyQ')) this.pos.y -= sp; }
    this.pos.y = Math.max(L.groundY(this.pos.x, this.pos.z) + 0.6, Math.min(900, this.pos.y));
    const cam = this.cam; cam.position.copy(this.pos); cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); cam.updateMatrixWorld(true);
    if ((this.dirtyChunks.size || this.forestDirty) && !this.grab && performance.now() > this.flushAt) this.flush();
    const A = this.g.atmos, F = { x: this.pos.x, z: this.pos.z }; this.W.update(dt, F, cam, A); if (A) A.update(dt, new THREE.Vector3(F.x, 0, F.z), cam, dt);
  }
  // ---------------------------------------------------------------- save / load
  async save() { for (const [n, cv] of this.texCv) MAP.edits.textures[n] = cv.toDataURL('image/png'); await saveMap(); this.unsaved = false; this.updateStatus(); toast('Map saved — it loads with the game from now on'); }
  exportMap() { for (const [n, cv] of this.texCv) MAP.edits.textures[n] = cv.toDataURL('image/png'); download('colombo-map-edits.json', JSON.stringify(MAP.edits)); }
  async importMap() { const f = await pickFile(); if (!f) return; try { const E = JSON.parse(await f.text()); if (!E || typeof E.mods !== 'object' || !Array.isArray(E.added)) throw new Error('not a map edit file'); await storeSet('map', E); setSavedFlag('map', true); this.reloadPrompt('Imported. Reload the game to load the imported map.'); } catch (e) { toast('Import failed: ' + e.message); } }
  async revertAll() { if (!confirm('Delete all saved map edits and go back to the generated city?')) return; await storeDel('map'); setSavedFlag('map', false); this.reloadPrompt('Saved map edits deleted. Reload to get the generated city back.'); }
  reloadPrompt(msg) { const w = new Win('Reload needed', { x: innerWidth / 2 - 170, y: innerHeight / 2 - 60, w: 340, h: 130 }); w.body.append(h('div', { cls: 'ed-hint' }, msg), h('div', { cls: 'ed-tabs' }, btn('Reload now', () => location.reload()), btn('Later', () => w.close()))); }
  dispose() {
    if (this.unsaved) toast('Map editor closed — unsaved edits stay for this session only (type `map` and Save to keep them)', 4000);
    removeEventListener('keydown', this.onKeyDown, true); removeEventListener('keyup', this.onKeyUp, true); this.cv.removeEventListener('pointerdown', this.onDown); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); this.cv.removeEventListener('wheel', this.onWheel); this.cv.removeEventListener('contextmenu', this.onCtx);
    if (this.dirtyChunks.size || this.forestDirty) this.flush(); this.g.scene.remove(this.box); this.box.geometry.dispose(); this.box.material.dispose();
    for (const w of [this.insp, this.painterWin, this.matWin]) if (w && !w.closed) w.close(); if (!this.main.closed) this.main.close(); ed = null;
  }
}
void text; void textureFor;
