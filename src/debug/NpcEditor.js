// NPC editor (console: `npc`). Remodel any NPC: every appearance parameter the character generator uses (body, height,
// build, belly, head / jaw / nose / ears, face variant, hair, facial hair, every garment colour and style, footwear,
// accessories …) in a live property grid, per-bone proportions, 3D vertex painting straight onto the model (skin tone
// patches, garment colours, stripes, any detail) and a full texture painter for the fabric texture. Apply to the NPC you
// picked in the world, to everyone nearby, or save it as a custom NPC that spawns in the crowd. All NPCs stay adults.
import * as THREE from 'three';
import { Character, HEROES, getBodyMaterial, BONES } from '../actors/Character.js';
import { PRESETS, makeAppearance, FACE_VARIANTS } from '../actors/Appearance.js';
import { NPCS, install, applyCustom, saveNpcs, loadSavedNpcs, b64FromColors, colorsFromB64, forgetMaterial } from './NpcRuntime.js';
import { Painter } from './Painter.js';
import { Win, Viewport, h, btn, num, color, select, text, section, propGrid, beginSession, toast, download, pickFile } from './ui.js';

let ed = null;
export async function open(game) { if (ed && !ed.win.closed) return ed; await loadSavedNpcs(game); install(); ed = new NpcEditor(game); return ed; }
const clone = (o) => JSON.parse(JSON.stringify(o));
const SCALE_BONES = BONES.filter((b) => !b.startsWith('skirt'));

class NpcEditor {
  constructor(game) {
    this.g = game; this.mode = 'orbit'; this.brush = { col: '#c0392b', size: 0.06, str: 0.6 }; this.entry = null; this.target = null;
    this.session = beginSession(game, 'npc', { hideGame: true, onEnd: () => this.dispose() });
    const W = Math.min(innerWidth - 40, 1320), H = Math.min(innerHeight - 40, 780);
    this.win = new Win('NPC editor — remodel any NPC', { x: 20, y: 20, w: W, h: H, onClose: () => this.session.end() });
    this.left = h('div', { cls: 'ed-col', style: { width: '240px', flex: 'none', overflow: 'auto' } });
    const mid = h('div', { cls: 'ed-col', style: { flex: 1 } }); this.vp = new Viewport(mid, { target: [0, 0.95, 0], dist: 3 }); this.vp.el.style.flex = '1';
    this.modeBtns = [['orbit', 'Orbit'], ['paint', 'Paint on model'], ['pick', 'Pick colour']].map(([m, t]) => { const b = btn(t, () => this.setMode(m)); b.dataset.m = m; return b; });
    mid.append(h('div', { cls: 'ed-tabs', style: { marginTop: '4px' } }, this.modeBtns, btn('Fabric texture…', () => this.openFabric()), btn('Undo paint', () => this.undoPaint()), btn('Reset paint', () => this.resetPaint())),
      h('div', { cls: 'ed-row' }, color('Brush colour', this.brush.col, (v) => { this.brush.col = v; }), num('Brush size (m)', this.brush.size, { min: 0.01, max: 0.4, step: 0.005 }, (v) => { this.brush.size = v; }), num('Strength', this.brush.str, { min: 0.02, max: 1, step: 0.01 }, (v) => { this.brush.str = v; })),
      h('div', { cls: 'ed-hint' }, 'Orbit: drag / right-drag / wheel · Paint: drag on the body (colours skin, clothes, any spot) · Fabric texture: paint the cloth pattern itself'));
    this.right = h('div', { cls: 'ed-col', style: { width: '360px', flex: 'none', overflow: 'auto' } });
    this.win.body.append(h('div', { cls: 'ed-cols' }, this.left, mid, this.right));
    this.vp.onPointer = (k, e) => this.pointer(k, e); this.vp.onFrame = (dt) => { if (this.ch) { this.ch.anim.update(dt, 0, 0); this.ch.root.updateMatrixWorld(true); } };
    this.setMode('orbit'); this.fillLeft();
    const near = this.nearby()[0]; if (near) this.loadPed(near); else this.loadSpec(clone(this.g.crowd?.specs?.[0] || makeAppearance(1)), null);
  }
  nearby() { const P = this.g.player, C = this.g.crowd; if (!C) return []; return C.peds.filter((p) => p.ch && p.state !== 'down' && !p.vehicle).map((p) => [p, Math.hypot(p.x - P.x, p.z - P.z)]).filter(([, d]) => d < 80).sort((a, b) => a[1] - b[1]).slice(0, 25).map(([p]) => p); }
  fillLeft() {
    const L = this.left; L.replaceChildren();
    const P = this.g.player; const near = this.nearby();
    L.append(section('NPCs near you (' + near.length + ')', true, h('div', { cls: 'ed-list', style: { maxHeight: '190px' } }, near.map((p) => h('div', { cls: p === this.target ? 'sel' : '', onclick: () => this.loadPed(p) }, (p.sp?.label || p.ch.spec.label || p.ch.spec.preset || 'NPC') + ' ', h('small', {}, Math.round(Math.hypot(p.x - P.x, p.z - P.z)) + ' m'))))));
    L.append(section('Saved custom NPCs (' + NPCS.list.length + ')', true, h('div', { cls: 'ed-list', style: { maxHeight: '150px' } }, NPCS.list.map((e) => h('div', { cls: this.entry && this.entry.id === e.id ? 'sel' : '', onclick: () => this.loadEntry(e) }, e.name, h('small', {}, '×' + e.weight))))));
    L.append(section('Start from a preset', false, h('div', { cls: 'ed-list', style: { maxHeight: '220px' } }, PRESETS.map((p) => h('div', { onclick: () => this.loadSpec(makeAppearance((Math.random() * 1e6) | 0, { preset: p.id }), null) }, p.label || p.id)))));
    L.append(btn('Random NPC', () => this.loadSpec(makeAppearance((Math.random() * 1e6) | 0), null)), btn('Refresh list', () => this.fillLeft()));
  }
  loadPed(p) { this.target = p; const sp = clone(p.ch.spec); const e = sp._custom ? NPCS.list.find((x) => x.id === sp._custom) : null; if (e) this.loadEntry(e, p); else this.loadSpec(sp, null); this.fillLeft(); }
  loadEntry(e, ped = null) { this.target = ped; this.loadSpec(clone(e.spec), { ...clone({ ...e, fabricMat: undefined }) }); }
  // state: spec + extras (bones, vpaint, fabric canvas)
  loadSpec(spec, entry) {
    this.spec = spec; delete this.spec.hero; this.entry = entry; this.bones = entry?.bones ? clone(entry.bones) : {}; this.fabricURL = entry?.fabric || null; this.fabricCv = null; this._fm = null; this.painted = false; this.paintUndo = []; if (this.fabWin && !this.fabWin.closed) this.fabWin.close();
    this.pendingPaint = entry?.vpaint || null; this.rebuild(); this.buildRight(); this.fillLeft();
  }
  rebuild() {
    const keepPaint = this.ch ? this.ch.mesh.geometry.getAttribute('color').array.slice() : null;
    if (this.ch) { this.vp.scene.remove(this.ch.root); this.ch.dispose(); }
    const sp = this.spec; sp.ageYears = Math.max(18, sp.ageYears || 18); if (sp.age !== 'elder') sp.age = 'adult'; // adults only
    this.ch = new Character(sp); this.ch.mesh.geometry = this.ch.mesh.geometry.clone(); this.ch.mesh.geometry.userData.edOwn = true; this.ch.root.traverse((o) => { o.frustumCulled = false; });
    const col = this.ch.mesh.geometry.getAttribute('color');
    if (this.pendingPaint) { const a = colorsFromB64(this.pendingPaint); if (a.length === col.array.length) { col.array.set(a); this.painted = true; } this.pendingPaint = null; }
    else if (keepPaint && keepPaint.length === col.array.length && this.painted) col.array.set(keepPaint);
    col.needsUpdate = true; this.baseColors = this.baseColors && this.baseColors.length === col.array.length ? this.baseColors : null;
    this.applyExtras(); this.vp.scene.add(this.ch.root);
  }
  applyExtras() { const mats = this.ch.mesh.material.slice(); if (this.fabricMat) { if (mats[1] === mats[0]) mats[1] = this.fabricMat; mats[0] = this.fabricMat; } this.ch.mesh.material = mats; for (const b of SCALE_BONES) { const s = this.bones[b]; this.ch.bones[b]?.scale.set(...(s || [1, 1, 1])); } }
  get fabricMat() { if (!this.fabricURL && !this.fabricCv) return null; if (!this._fm) { const m = getBodyMaterial().clone(); const cv = this.fabricCanvas(); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; m.map = t; this._fm = m; } return this._fm; }
  fabricCanvas() { if (this.fabricCv) return this.fabricCv; const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
    const base = getBodyMaterial().map?.image; if (base) g.drawImage(base, 0, 0, 512, 512); else { g.fillStyle = '#eee'; g.fillRect(0, 0, 512, 512); }
    if (this.fabricURL) { const img = new Image(); img.onload = () => { g.drawImage(img, 0, 0, 512, 512); if (this._fm) this._fm.map.needsUpdate = true; this.painter?.refresh(); }; img.src = this.fabricURL; }
    this.fabricCv = cv; return cv; }
  openFabric() {
    if (this.fabWin && !this.fabWin.closed) return; this.fabricCanvas(); const fm = this.fabricMat; this.applyExtras();
    this.fabWin = new Win('Fabric texture — ' + (this.spec.label || 'NPC'), { x: innerWidth - 560, y: 60, w: 520, h: 640 });
    this.fabWin.body.append(h('div', { cls: 'ed-hint' }, 'The four 256 px squares are the cloth patterns (top-left: plain weave — shirts, trousers, skin parts use its corner; top-right: saree; bottom-left: batik; bottom-right: plaid). The garment colour multiplies what you paint, so paint light colours / patterns for full control.'));
    this.painter = new Painter(this.fabWin.body, this.fabricCv, () => { fm.map.needsUpdate = true; this.fabricDirty = true; });
  }
  setMode(m) { this.mode = m; for (const b of this.modeBtns) b.classList.toggle('on', b.dataset.m === m); this.vp.canvas.style.cursor = m === 'orbit' ? 'grab' : 'crosshair'; }
  // ---- 3D vertex painting (skinned positions, so you paint what you see in the current pose)
  pointer(kind, e) {
    if (this.mode === 'orbit' || e.button === 2) return false;
    if (kind === 'down') { const hit = this.hit(e); if (!hit) return false; if (this.mode === 'pick') { const c = this.ch.mesh.geometry.getAttribute('color'); const i = hit.face.a; this.brush.col = '#' + new THREE.Color().setRGB(c.array[i * 3], c.array[i * 3 + 1], c.array[i * 3 + 2]).getHexString(); this.buildRight(); toast('Picked ' + this.brush.col); return true; }
      this.painting = true; this.paintUndo.push(this.ch.mesh.geometry.getAttribute('color').array.slice()); if (this.paintUndo.length > 20) this.paintUndo.shift(); this.skinned = this.skinnedPositions(); this.dabAt(hit.point); return true; }
    if (kind === 'move' && this.painting) { const hit = this.hit(e); if (hit) this.dabAt(hit.point); return true; }
    if (kind === 'up' && this.painting) { this.painting = false; this.painted = true; return true; }
    return false;
  }
  hit(e) { const rc = this.vp.ray(e); const hs = rc.intersectObject(this.ch.mesh, false); return hs[0] || null; }
  skinnedPositions() { const m = this.ch.mesh, n = m.geometry.getAttribute('position').count, out = new Float32Array(n * 3), v = new THREE.Vector3(); m.updateMatrixWorld(true); m.skeleton.update();
    for (let i = 0; i < n; i++) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; } return out; }
  dabAt(p) { const P = this.skinned, col = this.ch.mesh.geometry.getAttribute('color'), a = col.array, R = this.brush.size, c = new THREE.Color(this.brush.col); // colour attribute is linear
    for (let i = 0; i < P.length / 3; i++) { const d = Math.hypot(P[i * 3] - p.x, P[i * 3 + 1] - p.y, P[i * 3 + 2] - p.z); if (d > R) continue; const k = this.brush.str * (1 - (d / R) ** 2);
      a[i * 3] += (c.r - a[i * 3]) * k; a[i * 3 + 1] += (c.g - a[i * 3 + 1]) * k; a[i * 3 + 2] += (c.b - a[i * 3 + 2]) * k; }
    col.needsUpdate = true; }
  undoPaint() { const u = this.paintUndo.pop(); if (!u) return; const c = this.ch.mesh.geometry.getAttribute('color'); c.array.set(u); c.needsUpdate = true; }
  resetPaint() { this.painted = false; this.pendingPaint = null; this.paintUndo = []; if (this.entry) this.entry = { ...this.entry, vpaint: null }; this.rebuild(); }
  // ---- property panel
  hints() {
    const C = this.g.crowd?.specs || []; const opts = {};
    for (const s of C) for (const [k, v] of Object.entries(s)) if (typeof v === 'string' && !/^#/.test(v)) (opts[k] ||= new Set()).add(v);
    const H = { ageYears: { min: 18, max: 95, step: 1 }, age: { options: ['adult', 'elder'] }, sex: { options: ['m', 'f'] }, band: { options: ['young', 'adult', 'mature', 'senior'] }, height: { min: 1.45, max: 2.05, step: 0.005 }, build: { min: 0.75, max: 1.45, step: 0.005 },
      belly: { min: 0, max: 0.8, step: 0.005 }, faceV: { min: 0, max: FACE_VARIANTS.length - 1, step: 1 }, seed: { hidden: true }, hairline: { min: -0.1, max: 0.2, step: 0.002 }, hero: { hidden: true } };
    for (const [k, set] of Object.entries(opts)) if (set.size > 1 && set.size < 60 && !H[k]) H[k] = { options: [...set].sort() };
    return H;
  }
  buildRight() {
    const R = this.right; R.replaceChildren(); const sched = () => { clearTimeout(this._rb); this._rb = setTimeout(() => { this.rebuild(); }, 120); };
    R.append(h('div', { style: { fontWeight: 600, color: '#e0a030', margin: '2px 0 6px' } }, (this.entry ? 'Custom: ' + this.entry.name : this.target ? 'NPC in the world' : 'New NPC') + ' — ' + (this.spec.label || this.spec.preset || '')));
    // quick-add fields the generator understands but this NPC does not have yet
    const extra = ['glasses', 'sunglasses', 'watch', 'earrings', 'necklace', 'bangles', 'lanyard', 'bag', 'crossbody', 'cap', 'hiVis', 'apron', 'towel', 'shawl', 'headband', 'tie', 'scarf'].filter((k) => !(k in this.spec));
    R.append(section('Appearance (every parameter)', true, propGrid(this.spec, () => sched(), this.hints()),
      h('div', { cls: 'ed-row' }, select('Add detail', [['', '— add —'], ...extra.map((k) => [k, k])], '', (k) => { if (!k) return; this.spec[k] = ['glasses', 'sunglasses', 'earrings', 'necklace', 'bangles'].includes(k) ? true : '#2a4a8a'; this.buildRight(); sched(); }))));
    R.append(section('Proportions (per bone)', false, ...SCALE_BONES.map((b) => section(b, false, ...[0, 1, 2].map((i) => num('Scale ' + 'XYZ'[i], (this.bones[b] || [1, 1, 1])[i], { min: 0.5, max: 1.8, step: 0.005 }, (v) => { const s = (this.bones[b] ||= [1, 1, 1]); s[i] = v; this.ch.bones[b]?.scale.set(...s); }))))));
    const ta = h('textarea', { rows: 8 }, JSON.stringify(this.spec, null, 1));
    R.append(section('Raw JSON', false, ta, btn('Apply JSON', () => { try { this.spec = JSON.parse(ta.value); this.rebuild(); this.buildRight(); } catch (e) { toast('JSON error: ' + e.message); } })));
    const nameIn = text('Name', this.entry?.name || this.spec.label || 'Custom NPC', (v) => { this.name = v; }); this.name = this.entry?.name || this.spec.label || 'Custom NPC';
    let weight = this.entry?.weight || 3;
    R.append(section('Use it', true,
      h('div', { cls: 'ed-tabs' }, btn('Apply to picked NPC', () => this.applyToWorld(this.target ? [this.target] : [])), btn('Apply to everyone within 30 m', () => this.applyToWorld(this.nearby().filter((p) => Math.hypot(p.x - this.g.player.x, p.z - this.g.player.z) < 30)))),
      nameIn, num('Spawn weight', weight, { min: 1, max: 20, step: 1 }, (v) => { weight = v; }),
      h('div', { cls: 'ed-tabs' }, btn(this.entry ? 'Save custom NPC' : 'Save as custom NPC (spawns in crowd)', async () => { await this.save(weight); }), this.entry ? btn('Save as copy', async () => { this.entry = null; await this.save(weight); }) : null,
        this.entry ? btn('Delete', async () => { NPCS.list = NPCS.list.filter((e) => e.id !== this.entry.id); forgetMaterial(this.entry.id); this.entry = null; await saveNpcs(this.g); this.fillLeft(); this.buildRight(); toast('Deleted'); }, { cls: 'warn' }) : null),
      h('div', { cls: 'ed-tabs' }, btn('Export', () => download('npc-' + (this.name || 'custom') + '.json', JSON.stringify(this.currentEntry(weight)))), btn('Import', async () => { const f = await pickFile(); if (!f) return; try { const e = JSON.parse(await f.text()); this.loadSpec(e.spec || e, e.spec ? e : null); } catch (er) { toast('Bad file: ' + er.message); } }))));
  }
  currentEntry(weight) { const id = this.entry?.id || 'c' + Date.now().toString(36); const col = this.ch.mesh.geometry.getAttribute('color');
    return { id, name: this.name || 'Custom NPC', weight, spec: { ...clone(this.spec), _custom: id }, bones: clone(this.bones), vpaint: this.painted || this.entry?.vpaint ? b64FromColors(col) : null, fabric: this.fabricCv ? this.fabricCv.toDataURL('image/png') : this.fabricURL || null }; }
  async save(weight) { const e = this.currentEntry(weight); forgetMaterial(e.id); const i = NPCS.list.findIndex((x) => x.id === e.id); if (i >= 0) NPCS.list[i] = e; else NPCS.list.push(e); this.entry = e; await saveNpcs(this.g); this.fillLeft(); this.buildRight(); toast(`Saved “${e.name}” — it now spawns in the crowd`); }
  applyToWorld(peds) {
    if (!peds.length) { toast('Pick an NPC from the “near you” list first'); return; } const e = this.currentEntry(this.entry?.weight || 3); e.fabricMat = this.fabricMat ? this.fabricMat.clone() : null; if (e.fabricMat) e.fabricMat.map = this.fabricMat.map;
    let n = 0; for (const p of peds) { const sp = clone(e.spec); const ch = new Character(sp); applyCustom(ch, e); ch.root.position.copy(p.ch.root.position); ch.root.rotation.copy(p.ch.root.rotation);
      const parent = p.ch.root.parent || this.g.scene; parent.add(ch.root); parent.remove(p.ch.root); p.ch.crowdPed = null; p.ch.dispose(); ch.crowdPed = p; p.ch = ch; p.sp = sp; n++; if (p === this.target) this.target = p; }
    toast(`${n} NPC${n === 1 ? '' : 's'} remodelled in the world`); }
  dispose() { if (this.ch) this.ch.dispose(); this.vp.dispose(); if (this.fabWin && !this.fabWin.closed) this.fabWin.close(); if (!this.win.closed) this.win.close(); ed = null; }
}
void HEROES;
export function current() { return ed; } // tests / console inspection
