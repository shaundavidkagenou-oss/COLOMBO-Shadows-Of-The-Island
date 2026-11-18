// Model tools (68th) — console commands models-weapons · model-player · model-vehicles · model-npc (development builds only).
// One window with four tabs. Every weapon / hero / vehicle (cars, bikes, buses, three-wheelers, trains, boats, the police
// helicopter) / NPC group of the game is listed; the chosen one is built by the game's own code in a preview and can be
// changed in every way the runtime (ModelRuntime.js) can apply in the built game:
//   parts        click a part (or pick it from the list): hide, colour, any texture (upload, library, create new, paint over
//                the original), normal / roughness / glow / alpha maps, roughness, metalness, glow, opacity, tiling …
//   replacement  upload a model (GLB / GLTF / FBX / OBJ+MTL / DAE / STL / PLY / 3MF / USDZ, with or without textures) to show
//                instead of the original: transform, part edits, its own animation clips; characters follow the game's
//                skeleton (every game animation, IK, weapon pose) or play their own clips per animation state
//   animations   import BVH / FBX / GLB animations onto any game animation state of a hero / NPC group (retargeted)
//   numbers      weapon stats, vehicle handling (top speed, acceleration, mass, steering …), paint colours
//   downloads    the original model (.glb), its original textures (.zip), the edited model, uploaded files
// 💾 Save writes model-pack/manifest.json (dev server); build-exe.bat builds it into the game.
import * as THREE from 'three';
import { h, Win, Viewport, num, color, check, select, text, btn, section, toast, beginSession, download } from './ui.js';
import { PACK, loadPack, savePack, markDirty, addFile, addAsset, pickFiles, fileURL, loadAsset, ACCEPT_MODEL, ACCEPT_ANIM, ACCEPT_IMAGE, onPack } from './ModelPack.js';
import { listParts, editFor, pathOf, GARMENTS, GARMENT_MODES, matsOf, tickMixers, playClip } from './ModelEdit.js';
import { MAP_BONES, BONE_LABEL, autoMap, bonesOf, importClip, mirrorClip } from './Retarget.js';
import { openTextureMaker } from './TextureMaker.js';
import { writeZip } from './TexPack.js';
import { HOOKS } from '../core/Hooks.js';
import { WEAPONS, POLICE_T56, WEAPON_TYPES } from '../combat/WeaponDefs.js';
import { buildWeaponModel, buildT56 } from '../combat/WeaponModels.js';
import { VTYPES, createVehicleMesh } from '../vehicles/VehicleModels.js';
import { setVehicleLOD } from '../vehicles/Vehicle.js';
import { displayName } from '../vehicles/VehicleCatalog.js';
import { FUEL_BRANDS } from '../world/Layout.js';
import { buildDmuCar, makeTrainMaterials, protoMeshes } from '../vehicles/TrainModels.js';
import { buildHeliModel } from '../vehicles/HeliModel.js';
import { BOATS } from '../boats/BoatCatalog.js';
import { Character, HEROES, randomSpec } from '../actors/Character.js';
import { PRESETS, POLICE_ROLES, makePoliceAppearance, makeAttendantAppearance, makeBankStaffAppearance, makeMechanicAppearance, makeMedicAppearance } from '../actors/Appearance.js';
import { CATALOGUE, CATEGORY_NAMES, SLOT, applyLook } from '../actors/Wardrobe.js';
import { ANIM, KNOWN, install as animInstall } from './AnimRuntime.js';
import { Input } from '../core/Input.js';

const MODES = [['weapons', 'Weapons'], ['player', 'Player (3 heroes)'], ['vehicles', 'Vehicles'], ['npc', 'NPCs']];
const HERO_IDS = ['dineth', 'shashika', 'david'].filter((k) => HEROES[k]);
const clean = (o) => { for (const k of Object.keys(o)) if (o[k] == null || o[k] === '' || (typeof o[k] === 'object' && !Array.isArray(o[k]) && !Object.keys(o[k]).length)) delete o[k]; return o; };
const vName = (k, T) => { try { if (T.make) return displayName(k, T); } catch { /* bike brands */ } return T.make && T.model ? T.make[0].toUpperCase() + T.make.slice(1) + ' ' + T.model : T.label || T.name || k; };
const isMesh = (o) => o.isMesh || o.isSkinnedMesh;

let S = null;
export async function open(game, mode = 'weapons') { if (S && !S.win.closed) { S.setMode(mode); return S; } S = new ModelStudio(game); await S.init(mode); return S; }

class ModelStudio {
  constructor(g) { this.g = g; this.mode = null; this.item = null; this.obj = null; this.ch = null; this.part = null; this.scope = 'p'; this.seed = 1; this.speed = 0; this.state = 'idle'; this.look = {}; this.lookItem = null; this.timers = {}; }
  async init(mode) {
    await loadPack(true); this.P = PACK.m; this.MR = await import('./ModelRuntime.js'); this.MR.RT.game = this.g; await this.MR.setPack(this.P); animInstall();
    this.session = beginSession(this.g, 'models', { hideGame: true, hook: (dt) => this.gameTick(dt), onEnd: () => this.dispose() });
    const W = Math.min(innerWidth - 16, 1680), H = Math.min(innerHeight - 16, 980);
    this.win = new Win('Model tools', { x: Math.max(8, (innerWidth - W) / 2), y: 8, w: W, h: H, onClose: () => this.session.end() });
    this.saveBtn = btn('💾 Save', () => this.save(), { title: 'Write model-pack/manifest.json (built into the game and the .exe by build-exe.bat)' }); this.dirtyEl = h('span', { style: { color: '#e0a030', fontWeight: 400 } });
    this.win.extra.append(this.dirtyEl, this.saveBtn); this.unsub = onPack(() => this.updateDirty());
    this.tabs = h('div', { cls: 'ed-tabs' }); for (const [k, lab] of MODES) { const b = btn(lab, () => this.setMode(k)); b.dataset.m = k; this.tabs.append(b); }
    this.left = h('div', { cls: 'ed-col', style: { flex: '0 0 270px' } }); this.mid = h('div', { cls: 'ed-col', style: { flex: 1 } }); this.right = h('div', { cls: 'ed-col', style: { flex: '0 0 400px', overflow: 'auto' } });
    this.vp = new Viewport(this.mid, { target: [0, 0.9, 0], dist: 3.2 }); this.vp.el.style.flex = '1'; this.vpBar = h('div', { cls: 'ed-tabs', style: { marginTop: '4px' } }); this.mid.append(this.vpBar);
    this.vpHint = h('div', { cls: 'ed-hint' }, 'Left-drag orbit · right-drag pan · wheel zoom · click a part to select it'); this.mid.append(this.vpHint);
    this.vp.onFrame = (dt) => this.frame(dt); let dn = null;
    this.vp.onPointer = (k, e) => { if (k === 'down' && e.button === 0) dn = [e.clientX, e.clientY]; else if (k === 'up' && dn && e.button === 0) { if (Math.hypot(e.clientX - dn[0], e.clientY - dn[1]) < 4) this.pickAt(e); dn = null; } return false; };
    this.win.body.style.display = 'flex'; this.win.body.style.flexDirection = 'column';
    this.win.body.append(this.tabs, h('div', { cls: 'ed-cols', style: { flex: 1, minHeight: 0 } }, this.left, this.mid, this.right));
    this.box = new THREE.BoxHelper(new THREE.Object3D(), 0xe0a030); this.box.visible = false; this.box.userData.__helper = true; this.vp.scene.add(this.box);
    addEventListener('keydown', this.onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !this.win.closed) { e.preventDefault(); this.save(); } }, true);
    this.setMode(mode); this.updateDirty();
  }
  updateDirty() { if (this.dirtyEl) this.dirtyEl.textContent = PACK.dirty ? '● unsaved' : ''; }
  async save() {
    try { this.prune(); await savePack(); toast('Saved into model-pack/ — npm run dev shows it now; build-exe.bat builds it into the .exe', 3500); this.updateDirty(); } catch (e) { toast('Not saved: ' + (e.message || e), 5000); }
  }
  prune() { const P = this.P; for (const k of ['weapons', 'heroes', 'vehicles']) for (const [id, e] of Object.entries(P[k] || {})) { if (e.parts) clean(e.parts); if (e.stats) clean(e.stats); if (e.handling) clean(e.handling); if (e.look) clean(e.look); clean(e); if (!Object.keys(e).length) delete P[k][id]; } }
  // ------------------------------------------------------------------ modes / lists
  setMode(mode) {
    if (!MODES.some(([k]) => k === mode)) mode = 'weapons'; this.endHold(); this.mode = mode; this.item = null; this.part = null; ANIM.force = null;
    for (const b of this.tabs.children) b.classList.toggle('on', b.dataset.m === mode); this.win.titleEl.textContent = 'Model tools — ' + MODES.find(([k]) => k === mode)[1];
    this.items = this.listItems(); this.renderList(); this.select(this.items[0] ? this.items[0].id : null);
  }
  listItems() {
    if (this.mode === 'weapons') { const out = WEAPONS.map((d) => ({ id: d.id, label: d.name || d.id, sub: (WEAPON_TYPES.find((t) => t.id === (d.type || d.id)) || {}).label || d.cls, def: d })); out.push({ id: 't56', label: POLICE_T56.name, sub: 'police only', def: POLICE_T56 }); return out; }
    if (this.mode === 'player') return HERO_IDS.map((k) => ({ id: k, label: k[0].toUpperCase() + k.slice(1), sub: 'protagonist' }));
    if (this.mode === 'vehicles') { const out = Object.entries(VTYPES).map(([k, T]) => ({ id: k, label: vName(k, T), sub: T.cls || T.fam || (T.police ? 'police' : T.pedal ? 'bicycle' : T.sound || '') }));
      out.push({ id: 'train:dmuCab', label: 'Train — DMU power car (cab)', sub: 'active train' }, { id: 'train:dmuTrailer', label: 'Train — DMU trailer car', sub: 'active train' });
      for (const [k, b] of Object.entries(BOATS)) out.push({ id: 'boat:' + k, label: 'Boat — ' + (b.make ? b.make + ' ' : '') + (b.model || k), sub: b.cat || 'boat' });
      out.push({ id: 'heli:police', label: 'Police helicopter', sub: 'air unit' }); return out; }
    // NPC groups
    const out = [{ id: 'npc', label: 'All pedestrians', sub: 'every NPC' }, { id: 'npc:f', label: 'All women', sub: 'pedestrians' }, { id: 'npc:m', label: 'All men', sub: 'pedestrians' }, { id: 'police', label: 'All police', sub: 'every police officer' }];
    for (const [k, R] of Object.entries(POLICE_ROLES)) out.push({ id: 'role:' + k, label: R.label, sub: 'police role' });
    for (const [k, lab] of [['attendant', 'Fuel station attendant'], ['bank', 'Bank staff'], ['mechanic', 'Mechanic'], ['medic', 'Ambulance medic']]) out.push({ id: 'staff:' + k, label: lab, sub: 'staff' });
    for (const p of PRESETS) out.push({ id: 'preset:' + p.id, label: p.label, sub: (p.sex === 'f' ? 'woman' : 'man') + ' · ' + (p.band || '') });
    for (const e of this.customNpcs || []) out.push({ id: 'custom:' + e.id, label: e.name || e.id, sub: 'NPC editor' });
    return out;
  }
  renderList() {
    const q = h('input', { type: 'text', placeholder: 'search…', style: { width: '100%', marginBottom: '4px' } }); const L = h('div', { cls: 'ed-list', style: { flex: 1 } });
    const fill = () => { L.replaceChildren(); const s = q.value.toLowerCase(); for (const it of this.items) { if (s && !(it.label + ' ' + it.id + ' ' + it.sub).toLowerCase().includes(s)) continue; const ed = this.hasEdits(it.id);
      const d = h('div', { cls: it.id === this.item ? 'sel' : '', title: it.id, onclick: () => this.select(it.id) }, (ed ? '● ' : '') + it.label, h('small', {}, it.sub || '')); L.append(d); } };
    q.addEventListener('input', fill); this.left.replaceChildren(h('div', { style: { fontWeight: 600, margin: '2px 0 4px' } }, `${this.items.length} ${this.mode === 'npc' ? 'groups' : 'models'}`), q, L, h('div', { cls: 'ed-hint' }, '● = has edits')); this.fillList = fill; fill();
    if (this.mode === 'npc' && !this.customNpcs) import('./NpcRuntime.js').then(async (m) => { this.customNpcs = m.NPCS.list.length ? m.NPCS.list : (await m.loadSavedNpcs(this.g).catch(() => [])) || []; if (this.mode === 'npc' && this.customNpcs.length) { this.items = this.listItems(); this.renderList(); } }).catch(() => { this.customNpcs = []; });
  }
  hasEdits(id) { const P = this.P; if (this.mode === 'weapons') return !!(P.weapons[id] && Object.keys(P.weapons[id]).length); if (this.mode === 'player') return !!(P.heroes[id] && Object.keys(P.heroes[id]).length) || !!(ANIM.targets['hero:' + id] && Object.keys(ANIM.targets['hero:' + id]).length); if (this.mode === 'vehicles') return !!(P.vehicles[id] && Object.keys(P.vehicles[id]).length);
    return !!this.rule(id, false) || !!(ANIM.targets[this.animTarget(id)] && Object.keys(ANIM.targets[this.animTarget(id)]).length); }
  // the document entry of the current item (created on first edit)
  entry(create = true, id = this.item) {
    const P = this.P; if (this.mode === 'weapons') return P.weapons[id] || (create ? (P.weapons[id] = {}) : null); if (this.mode === 'player') return P.heroes[id] || (create ? (P.heroes[id] = {}) : null);
    if (this.mode === 'vehicles') return P.vehicles[id] || (create ? (P.vehicles[id] = {}) : null); return this.rule(id, create);
  }
  rule(id, create) { const R = this.P.npcs.rules; let r = R.find((x) => x.id === 'grp:' + id); if (!r && create) { r = { id: 'grp:' + id, name: (this.items.find((i) => i.id === id) || {}).label || id, on: true, chance: 1, match: this.matchOf(id) }; R.push(r); } return r || null; }
  matchOf(id) { const [k, v] = id.split(':'); if (id === 'npc') return { who: 'civil' }; if (id === 'npc:f') return { who: 'f' }; if (id === 'npc:m') return { who: 'm' }; if (id === 'police') return { who: 'police' }; if (k === 'role') return { who: 'role', value: v }; if (k === 'preset') return { who: 'preset', value: v }; if (k === 'custom') return { who: 'custom', value: v }; if (k === 'staff') return { who: 'role', value: v === 'bank' ? 'bank' : v }; return { who: 'all' }; }
  animTarget(id = this.item) { if (this.mode === 'player') return 'hero:' + id; if (id === 'npc:f' || id === 'npc:m' || id === 'npc' || id === 'police') return id; const [k, v] = id.split(':'); if (k === 'staff') return 'role:' + v; return id; }
  changed(what = this.mode) { markDirty(); this.fillList && this.fillList(); clearTimeout(this.timers.p); this.timers.p = setTimeout(() => this.rebuild(true), 120); clearTimeout(this.timers.l); this.timers.l = setTimeout(() => this.MR.setPack(this.P, { what: what === 'player' ? 'heroes' : what === 'npc' ? 'npcs' : what }).catch((e) => console.warn(e)), 500); }
  // ------------------------------------------------------------------ preview
  select(id) { this.endHold(); this.item = id; this.part = null; ANIM.force = null; this.fillList && this.fillList(); this.rebuild(false); }
  async rebuild(keepCam) {
    const id = this.item; this.clearPreview(); if (!id) { this.right.replaceChildren(h('div', { cls: 'ed-hint' }, 'Nothing to show.')); return; }
    await this.MR.preload(this.P); let o = null; try { o = this.build(id); } catch (e) { console.error(e); this.right.replaceChildren(h('div', { cls: 'ed-hint', style: { color: '#f08080' } }, 'Could not build this model: ' + (e.message || e))); return; }
    this.obj = o; this.vp.scene.add(o); o.traverse((x) => { x.frustumCulled = false; }); o.updateMatrixWorld(true);
    if (!keepCam) this.frameCam(); this.renderInspector(); this.renderBar();
  }
  clearPreview() { if (this.ch) { try { this.ch.dispose(); } catch { /* */ } this.ch = null; } if (this.obj) { this.vp.scene.remove(this.obj); this.obj = null; } this.box.visible = false; for (const x of this.extras || []) this.vp.scene.remove(x); this.extras = []; }
  build(id, pristine = false) {
    const off = pristine ? { w: HOOKS.weapon, v: HOOKS.vehicle, c: HOOKS.character, s: HOOKS.spec } : null; if (off) { HOOKS.weapon = HOOKS.vehicle = HOOKS.character = HOOKS.spec = null; }
    try {
      if (this.mode === 'weapons') { const def = id === 't56' ? null : WEAPONS.find((d) => d.id === id); const g = def ? buildWeaponModel(def) : buildT56(); const wrap = new THREE.Group(); wrap.add(g); g.rotation.y = Math.PI / 2; wrap.userData.weapon = g; wrap.position.y = 1; return wrap; }
      if (this.mode === 'vehicles') {
        if (id.startsWith('train:')) { const cab = id === 'train:dmuCab'; const mats = makeTrainMaterials(); const g = new THREE.Group(); const inner = new THREE.Group(); g.add(inner); for (const m of protoMeshes(buildDmuCar(cab, {}).mb, mats)) { const mm = new THREE.Mesh(m.geometry, m.material); mm.name = m.name; inner.add(mm); } if (HOOKS.vehicle) HOOKS.vehicle(inner, id); return g; }
        if (id.startsWith('boat:')) { return this.buildBoat(id.slice(5)); }
        if (id === 'heli:police') { const M = buildHeliModel({ crew: false }); return M.group; }
        const g = createVehicleMesh(id, this.seed); try { setVehicleLOD(g.userData, true); } catch { /* bikes */ } return g; }
      // characters
      const sp = this.specFor(id); if (this.mode === 'player') this.MR.RT.previewLook = { mh: id, look: this.look };
      const ch = new Character(sp); this.MR.RT.previewLook = null; if (pristine) return ch.root; this.ch = ch; const D = this.MR.RT.drivers.get(ch); if (D) D.always = true; return ch.root;
    } finally { if (off) { HOOKS.weapon = off.w; HOOKS.vehicle = off.v; HOOKS.character = off.c; HOOKS.spec = off.s; } }
  }
  buildBoat(id) { const B = this.BoatClass; if (!B) throw new Error('loading the boat module…'); const b = new B(id); return b.root; }
  specFor(id) {
    if (this.mode === 'player') return applyLook(HEROES[id], this.look); const s = 9000 + this.seed * 17; const [k, v] = id.split(':');
    if (id === 'npc' || id === 'npc:m') return randomSpec(s, { sex: 'm' }); if (id === 'npc:f') return randomSpec(s, { sex: 'f' }); if (id === 'police') return makePoliceAppearance(s, 'patrol'); if (k === 'role') return makePoliceAppearance(s, v);
    if (k === 'staff') return v === 'attendant' ? makeAttendantAppearance(s, Object.values(FUEL_BRANDS)[0]) : v === 'bank' ? makeBankStaffAppearance(s) : v === 'mechanic' ? makeMechanicAppearance(s) : makeMedicAppearance(s);
    if (k === 'preset') return randomSpec(s, { preset: v }); if (k === 'custom') { const e = (this.customNpcs || []).find((x) => x.id === v); return e ? Object.assign({}, e.spec, { _custom: e.id }) : randomSpec(s); } return randomSpec(s);
  }
  frameCam() { const o = this.obj; if (!o) return; const bb = new THREE.Box3().setFromObject(o); if (!Number.isFinite(bb.min.x)) return; const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()); this.vp.target.copy(c); this.vp.dist = Math.max(0.4, Math.max(sz.x, sz.y, sz.z) * 1.6); }
  frame(dt) {
    if (this.ch) { const a = this.ch.anim; if (a) { if (this.state !== 'auto') ANIM.force = this.state && this.state !== 'idle' && this.state !== 'walk' && this.state !== 'run' ? { ch: this.ch, key: this.state } : null; a.update(dt, this.state === 'walk' ? 1.4 : this.state === 'run' ? 5 : this.speed, 0); }
      this.ch.root.updateMatrixWorld(true); this.MR.driveOne(this.ch); }
    if (this.spin && this.obj && this.obj.userData.wheels) for (const w of this.obj.userData.wheels) if (w.userData.spin) w.userData.spin.rotation.x += dt * 8;
    tickMixers(dt); if (this.box.visible && this.boxMesh) this.box.setFromObject(this.boxMesh);
  }
  renderBar() {
    const B = this.vpBar; B.replaceChildren(btn('Frame', () => this.frameCam()), btn('Front', () => { this.vp.yaw = 0; this.vp.pitch = 0.1; }), btn('Side', () => { this.vp.yaw = Math.PI / 2; this.vp.pitch = 0.1; }), btn('Top', () => { this.vp.pitch = 1.35; }));
    if (this.ch) { const states = ['auto', 'idle', 'walk', 'run', ...KNOWN.filter((k) => !['idle', 'walk', 'run'].includes(k))]; B.append(select('Animation', states, this.state, (v) => { this.state = v; }));
      if (this.mode === 'npc') B.append(btn('Next variation', () => { this.seed++; this.rebuild(true); })); }
    if (this.mode === 'vehicles' && this.obj && this.obj.userData.wheels) B.append(check('Spin wheels', !!this.spin, (v) => { this.spin = v; }), btn('Next colour', () => { this.seed++; this.rebuild(true); }));
    if (this.mode === 'weapons') B.append(btn('In hand — third person', () => this.startHold('third')), btn('In hand — aiming / POV', () => this.startHold('pov')));
  }
  // ------------------------------------------------------------------ picking / parts
  pickAt(e) {
    if (!this.obj) return; const rc = this.vp.ray(e); const hits = []; this.obj.traverse((o) => { if (!isMesh(o) || o.userData.__helper || !o.visible || o.layers.mask === 0) return; try { o.raycast(rc, hits); } catch { /* unindexed */ } }); hits.sort((a, b) => a.distance - b.distance);
    const hit = hits[0]; if (!hit) return; const o = hit.object; const inRepl = this.replOf(o); const root = inRepl || this.partsRoot(); const ms = matsOf(o.userData.__origMat ? { material: o.userData.__origMat } : o); const slot = ms.length > 1 && hit.face ? hit.face.materialIndex || 0 : 0;
    this.selectPart({ key: pathOf(o, root) + (ms.length > 1 ? '@' + slot : ''), mesh: o, slot, mat: ms[slot], repl: !!inRepl });
  }
  replOf(o) { for (let p = o; p; p = p.parent) if (p.userData && p.userData.__replacement) return p; return null; }
  partsRoot() { return this.mode === 'weapons' ? this.obj.userData.weapon : this.mode === 'vehicles' && this.item.startsWith('train:') ? this.obj.children[0] : this.obj; }
  selectPart(p) { this.part = p; this.boxMesh = p ? p.mesh : null; this.box.visible = !!p; if (p) this.box.setFromObject(p.mesh); this.renderInspector(); }
  // ------------------------------------------------------------------ inspector
  renderInspector() {
    const R = this.right; const top = R.scrollTop; R.replaceChildren(); const it = this.items.find((i) => i.id === this.item); if (!it) return;
    R.append(h('div', { style: { fontWeight: 700, fontSize: '14px', color: '#e0a030', margin: '2px 0 6px' } }, it.label, h('small', { style: { color: '#8a93a0', marginLeft: '6px', fontWeight: 400 } }, it.id)));
    if (this.mode === 'weapons') R.append(this.weaponPanel(it)); if (this.mode === 'player') R.append(this.heroPanel(it)); if (this.mode === 'vehicles') R.append(this.vehiclePanel(it)); if (this.mode === 'npc') R.append(this.npcPanel(it));
    R.append(this.partsPanel(), this.replacementPanel());
    if (this.ch) R.append(this.animPanel());
    R.append(this.downloadPanel());
    const e = this.entry(false); if (e && Object.keys(e).length) R.append(btn('Reset everything for this ' + (this.mode === 'npc' ? 'group' : 'model') + '…', () => { if (!confirm('Remove every edit of ' + it.label + '?')) return; if (this.mode === 'npc') this.P.npcs.rules = this.P.npcs.rules.filter((r) => r !== e); else delete this.P[this.mode === 'player' ? 'heroes' : this.mode][this.item]; this.changed(); }, { cls: 'warn' }));
    R.scrollTop = top;
  }
  partsPanel() {
    const sec = section('Parts & textures', true); if (!this.obj) return sec; const root = this.partsRoot(); const e = this.entry(false); const parts = (e && e.parts) || {};
    const list = listParts(root).filter((p) => p.mesh.layers.mask !== 0 || (p.mesh.userData.__hiddenMask != null)); const L = h('div', { cls: 'ed-list', style: { maxHeight: '190px' } });
    const groups = new Map(); for (const p of list) { const k = p.mesh.name || p.matName || 'part'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    for (const p of list) { const ed = editFor(parts, p.key, p.mesh, p.mat); const d = h('div', { cls: this.part && !this.part.repl && this.part.key === p.key ? 'sel' : '', title: p.key, onclick: () => this.selectPart(p) }, (ed ? (ed.hide ? '◌ ' : '● ') : '') + p.label); L.append(d); }
    sec.b.append(h('div', { cls: 'ed-hint' }, `${list.length} parts · click one here or in the preview`), L);
    if (this.part && !this.part.repl) sec.b.append(this.partEditor(this.part, () => (this.entry(true).parts ||= {}), parts));
    return sec;
  }
  // scope: this mesh slot (p:) · every mesh with this material (m:) · every mesh with this name (n:)
  partEditor(p, getParts, parts) {
    const box = h('div', { style: { border: '1px solid #4a5568', borderRadius: '5px', padding: '6px', marginTop: '6px', background: '#151922' } });
    const keys = [['p:' + p.key, 'Only this part']]; if (p.mat && p.mat.name) keys.push(['m:' + p.mat.name, 'Every part with material “' + p.mat.name + '”']); if (p.mesh.name) keys.push(['n:' + p.mesh.name, 'Every part named “' + p.mesh.name + '”']);
    if (!keys.find(([k]) => k === this.scopeKey)) { const ex = keys.find(([k]) => parts[k]); this.scopeKey = ex ? ex[0] : keys[0][0]; }
    const k = this.scopeKey; const cur = parts[k] || {}; const set = (prop, v) => { const P = getParts(); const e = P[k] || (P[k] = {}); if (v == null || v === '' || v === false && prop !== 'hide') delete e[prop]; else e[prop] = v; if (prop === 'hide' && !v) delete e.hide; if (!Object.keys(e).length) delete P[k]; this.changed(); };
    const m = p.mat || {}; const hexOf = (c) => (c && c.isColor ? '#' + c.getHexString() : '#ffffff');
    box.append(h('div', { style: { fontWeight: 600, marginBottom: '4px' } }, p.label), select('Apply to', keys, k, (v) => { this.scopeKey = v; this.renderInspector(); }),
      check('Hidden', !!cur.hide, (v) => set('hide', v)), color('Colour', cur.color || hexOf(m.color), (v) => set('color', v)));
    for (const [slot, lab] of [['map', 'Texture'], ['normalMap', 'Normal map'], ['roughnessMap', 'Roughness map'], ['emissiveMap', 'Glow map'], ['alphaMap', 'Transparency map']]) box.append(this.texRow(lab, cur[slot], m[slot], (v) => set(slot, v), slot === 'map'));
    box.append(num('Roughness', cur.roughness ?? m.roughness ?? 0.8, { min: 0, max: 1, step: 0.01 }, (v) => set('roughness', v)), num('Metalness', cur.metalness ?? m.metalness ?? 0, { min: 0, max: 1, step: 0.01 }, (v) => set('metalness', v)),
      color('Glow colour', cur.emissive || hexOf(m.emissive || new THREE.Color(0)), (v) => set('emissive', v)), num('Glow strength', cur.emissiveIntensity ?? m.emissiveIntensity ?? 1, { min: 0, max: 10, step: 0.05 }, (v) => set('emissiveIntensity', v)),
      num('Opacity', cur.opacity ?? m.opacity ?? 1, { min: 0, max: 1, step: 0.01 }, (v) => set('opacity', v)),
      num('Tiling U', (cur.repeat || [1, 1])[0], { min: 0.05, max: 64, step: 0.05 }, (v) => set('repeat', [v, (cur.repeat || [1, 1])[1]])), num('Tiling V', (cur.repeat || [1, 1])[1], { min: 0.05, max: 64, step: 0.05 }, (v) => set('repeat', [(cur.repeat || [1, 1])[0], v])),
      num('Offset U', (cur.offset || [0, 0])[0], { min: -1, max: 1, step: 0.005 }, (v) => set('offset', [v, (cur.offset || [0, 0])[1]])), num('Offset V', (cur.offset || [0, 0])[1], { min: -1, max: 1, step: 0.005 }, (v) => set('offset', [(cur.offset || [0, 0])[0], v])),
      num('Texture rotation °', cur.rotation ?? 0, { min: -180, max: 180, step: 1 }, (v) => set('rotation', v)), check('Double-sided', cur.side === 2, (v) => set('side', v ? 2 : null)), check('Wireframe', !!cur.wireframe, (v) => set('wireframe', v || null)),
      h('div', { cls: 'ed-tabs', style: { marginTop: '4px' } }, btn('Reset this part', () => { const P = getParts(); delete P[k]; this.changed(); }), m.map && m.map.image ? btn('Download its texture', () => this.downloadTexture(m.map, (p.mesh.name || 'texture') + '.png')) : null));
    return box;
  }
  texRow(label, cur, orig, set, colour) {
    const name = cur ? ((this.P.files[cur] || {}).name || cur.slice(0, 10)) : orig ? '(original)' : '— none —';
    const thumb = cur ? h('img', { src: fileURL(cur), style: { width: '22px', height: '22px', objectFit: 'cover', border: '1px solid #3a4250' } }) : null;
    return h('div', { cls: 'ed-row' }, h('label', { title: label }, label), thumb, h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: cur ? '#e8edf3' : '#8a93a0' } }, name),
      btn('…', async () => { const v = await this.pickImage({ colour, orig: cur ? null : orig }); if (v !== undefined) set(v); }, { title: 'Choose / upload / create / paint' }), cur ? btn('✕', () => set(null), { title: 'Back to the original' }) : null);
  }
  // texture library dialog → pack file name | null (cleared) | undefined (cancelled)
  pickImage({ colour = true, orig = null } = {}) {
    return new Promise((resolve) => {
      let done = false; const fin = (v) => { if (done) return; done = true; w.close(); resolve(v); };
      const w = new Win('Choose a texture', { x: innerWidth / 2 - 300, y: 80, w: 600, h: 520, onClose: () => { if (!done) { done = true; resolve(undefined); } } });
      const grid = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '6px' } });
      const imgs = Object.entries(this.P.files).filter(([, f]) => f.kind === 'image');
      for (const [n, f] of imgs) grid.append(h('div', { style: { cursor: 'pointer', textAlign: 'center' }, title: f.name, onclick: () => fin(n) }, h('img', { src: fileURL(n), style: { width: '96px', height: '96px', objectFit: 'cover', border: '1px solid #3a4250', background: '#000' } }), h('div', { style: { fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, f.name)));
      const saveCanvas = async (file) => { const n = await addFile(file, 'image', { created: true }); fin(n); };
      w.body.append(h('div', { cls: 'ed-tabs' },
        btn('⬆ Upload image…', async () => { const fs = await pickFiles(ACCEPT_IMAGE, false); if (!fs[0]) return; try { fin(await addFile(fs[0], 'image')); } catch (e) { toast(e.message, 4000); } }),
        btn('✚ Create new…', () => openTextureMaker({ name: 'new texture', onSave: saveCanvas })),
        orig && orig.image ? btn('🖌 Paint over the original…', () => openTextureMaker({ name: 'edited texture', base: orig.image, size: Math.min(512, orig.image.width || 512), onSave: saveCanvas })) : null,
        btn('Cancel', () => fin(undefined))),
        h('div', { cls: 'ed-hint' }, `${imgs.length} images in model-pack/ · textures are scaled to at most 512 px in the game${colour ? '' : ' · this slot reads the image as data (not colour)'}`), grid);
    });
  }
  // ------------------------------------------------------------------ replacement model
  replacementPanel() {
    const sec = section(this.mode === 'player' || this.mode === 'npc' ? 'Replace the model (character)' : 'Replace the model', false); const e = this.entry(false); const key = 'model'; const r = e && e[key];
    const upload = async () => { const fs = await pickFiles(ACCEPT_MODEL, true); if (!fs.length) return; try { toast('Uploading ' + fs.length + ' file(s)…'); const a = await addAsset(fs, 'model'); const id = 'm' + a.main.slice(0, 12); this.P.objects[id] = { name: a.name, asset: { main: a.main, files: a.files }, added: new Date().toISOString() }; const E = this.entry(true); E[key] = Object.assign(E[key] || {}, { asset: { main: a.main, files: a.files }, name: a.name, xf: (E[key] && E[key].xf) || {} }); this.changed(); } catch (err) { toast(err.message || String(err), 5000); } };
    const lib = Object.entries(this.P.objects || {}); const fromLib = lib.length ? select('From library', [['', '— choose an uploaded model —'], ...lib.map(([id, o]) => [id, o.name])], '', (v) => { if (!v) return; const o = this.P.objects[v]; const E = this.entry(true); E[key] = Object.assign(E[key] || {}, { asset: JSON.parse(JSON.stringify(o.asset)), name: o.name, xf: (E[key] && E[key].xf) || {} }); this.changed(); }) : null;
    if (!r || !r.asset) { sec.b.append(h('div', { cls: 'ed-hint' }, 'Upload a model to show instead of this one — pick the model file together with its textures / .bin / .mtl (any number of files). Formats: GLB, GLTF, FBX, OBJ + MTL, DAE, STL, PLY, 3MF, USDZ.'), btn('⬆ Upload model…', upload), fromLib); return sec; }
    const set = (f, v) => { const E = this.entry(true); const R2 = E[key]; if (v == null) delete R2[f]; else R2[f] = v; this.changed(); };
    const xf = r.xf || {}; const setXf = (f, v) => { const E = this.entry(true); E[key].xf = Object.assign({}, E[key].xf, { [f]: v }); this.changed(); };
    sec.b.append(h('div', { style: { fontWeight: 600 } }, '📦 ' + (r.name || r.asset.main)), h('div', { cls: 'ed-tabs' }, btn('Replace file…', upload), btn('Remove (back to the original)', () => { const E = this.entry(true); delete E[key]; this.changed(); }, { cls: 'warn' })), fromLib,
      check('Hide the original model', r.hideOriginal !== false, (v) => set('hideOriginal', v ? null : false)), check('Casts shadow', r.shadow !== false, (v) => set('shadow', v ? null : false)));
    const big = this.mode === 'vehicles' ? 10 : this.mode === 'weapons' ? 0.5 : 2; const st = this.mode === 'weapons' ? 0.001 : 0.005;
    const T = section('Position · rotation · size', true); for (const [f, lab] of [['px', 'Move X'], ['py', 'Move Y (up)'], ['pz', 'Move Z (forward)']]) T.b.append(num(lab, xf[f] || 0, { min: -big, max: big, step: st }, (v) => setXf(f, v)));
    for (const [f, lab] of [['rx', 'Rotate X°'], ['ry', 'Rotate Y° (turn)'], ['rz', 'Rotate Z°']]) T.b.append(num(lab, xf[f] || 0, { min: -180, max: 180, step: 1 }, (v) => setXf(f, v)));
    T.b.append(num('Size', xf.s ?? 1, { min: 0.001, max: 100, step: 0.001 }, (v) => setXf('s', v)), num('Stretch X', xf.sx ?? 1, { min: 0.05, max: 5, step: 0.01 }, (v) => setXf('sx', v)), num('Stretch Y', xf.sy ?? 1, { min: 0.05, max: 5, step: 0.01 }, (v) => setXf('sy', v)), num('Stretch Z', xf.sz ?? 1, { min: 0.05, max: 5, step: 0.01 }, (v) => setXf('sz', v)),
      h('div', { cls: 'ed-tabs' }, btn('Turn 90°', () => setXf('ry', (((xf.ry || 0) + 90 + 180) % 360) - 180)), btn('Size ×10', () => setXf('s', (xf.s ?? 1) * 10)), btn('Size ÷10', () => setXf('s', (xf.s ?? 1) / 10)), btn('cm → m (÷100)', () => setXf('s', (xf.s ?? 1) / 100))));
    sec.b.append(T);
    if (this.mode === 'vehicles') sec.b.append(check('Keep the game’s wheels (they steer, spin and bounce)', r.keepWheels !== false, (v) => set('keepWheels', v ? null : false)), this.wheelPanel());
    if (this.ch) sec.b.append(this.charModelPanel(r, set));
    // clips of the uploaded model
    const c = this.findRepl(); const clips = (c && c.userData.clips) || [];
    const C = section('Animations of this model (' + clips.length + ')', !!clips.length); if (!clips.length) C.b.append(h('div', { cls: 'ed-hint' }, 'The file has no animation clips. Characters still move with the game’s skeleton (see “Drive”), vehicles with their wheels and doors.'));
    else { C.b.append(select('Always play', [['', '— none —'], ...clips.map((x) => [x.name, x.name])], r.clip || '', (v) => set('clip', v || null)), num('Clip speed', r.clipSpeed ?? 1, { min: 0, max: 4, step: 0.05 }, (v) => set('clipSpeed', v)));
      const L = h('div', { cls: 'ed-list', style: { maxHeight: '120px' } }); for (const x of clips) L.append(h('div', { onclick: () => playClip(c, x.name, r.clipSpeed ?? 1) }, '▶ ' + x.name, h('small', {}, x.duration.toFixed(2) + ' s'))); C.b.append(h('div', { cls: 'ed-hint' }, 'Click to preview:'), L);
      if (this.mode === 'weapons') for (const [ev, lab] of [['fire', 'On each shot'], ['reload', 'On reload']]) C.b.append(select(lab, [['', '— none —'], ...clips.map((x) => [x.name, x.name])], (r.clips || {})[ev] || '', (v) => { const E = this.entry(true); E[key].clips = Object.assign({}, E[key].clips, { [ev]: v || undefined }); clean(E[key].clips); this.changed(); })); }
    sec.b.append(C);
    // parts of the replacement
    if (c && c.children[0]) { const P2 = section('Parts of the uploaded model', false); const parts = r.parts || {}; const list = listParts(c, { skip: Object.assign(() => false, { inReplacement: true }) }).map((p) => Object.assign(p, { key: pathOf(p.mesh, c) + (p.key.includes('@') ? '@' + p.slot : ''), repl: true }));
      const L = h('div', { cls: 'ed-list', style: { maxHeight: '150px' } }); for (const p of list) L.append(h('div', { cls: this.part && this.part.repl && this.part.key === p.key ? 'sel' : '', onclick: () => this.selectPart(p) }, (editFor(parts, p.key, p.mesh, p.mat) ? '● ' : '') + p.label)); P2.b.append(L);
      if (this.part && this.part.repl) P2.b.append(this.partEditor(this.part, () => (this.entry(true)[key].parts ||= {}), parts)); sec.b.append(P2); }
    sec.b.append(h('div', { cls: 'ed-tabs' }, ...Object.entries(r.asset.files || { [r.name || 'model']: r.asset.main }).map(([orig, n]) => btn('⬇ ' + orig, () => this.downloadPackFile(n, orig)))));
    return sec;
  }
  findRepl() { let c = null; this.obj && this.obj.traverse((o) => { if (!c && o.userData.__replacement) c = o; }); return c; }
  wheelPanel() {
    const sec = section('Replace the wheels', false); const e = this.entry(false); const w = e && e.wheel; const up = async () => { const fs = await pickFiles(ACCEPT_MODEL, true); if (!fs.length) return; try { const a = await addAsset(fs, 'model'); const E = this.entry(true); E.wheel = Object.assign(E.wheel || {}, { asset: { main: a.main, files: a.files }, name: a.name, xf: (E.wheel && E.wheel.xf) || {} }); this.changed(); } catch (err) { toast(err.message, 5000); } };
    if (!w) { sec.b.append(h('div', { cls: 'ed-hint' }, 'One wheel model (left side is mirrored). It turns, steers and bounces with the game’s wheels.'), btn('⬆ Upload wheel model…', up)); return sec; }
    const setXf = (f, v) => { const E = this.entry(true); E.wheel.xf = Object.assign({}, E.wheel.xf, { [f]: v }); this.changed(); }; const xf = w.xf || {};
    sec.b.append(h('div', {}, '🛞 ' + (w.name || '')), btn('Remove', () => { delete this.entry(true).wheel; this.changed(); }, { cls: 'warn' }), check('Mirror on the left side', w.mirror !== false, (v) => { this.entry(true).wheel.mirror = v ? undefined : false; this.changed(); }));
    for (const [f, lab, a, s] of [['px', 'Move X', 0.5, 0.002], ['py', 'Move Y', 0.5, 0.002], ['pz', 'Move Z', 0.5, 0.002], ['rx', 'Rotate X°', 180, 1], ['ry', 'Rotate Y°', 180, 1], ['rz', 'Rotate Z°', 180, 1]]) sec.b.append(num(lab, xf[f] || 0, { min: -a, max: a, step: s }, (v) => setXf(f, v)));
    sec.b.append(num('Size', xf.s ?? 1, { min: 0.001, max: 100, step: 0.001 }, (v) => setXf('s', v))); return sec;
  }
  charModelPanel(r, set) {
    const sec = section('Drive (how the model moves)', true); const c = this.findRepl(); const model = c && c.children[0];
    sec.b.append(select('Drive', [['rig', 'Follow the game skeleton (every game animation)'], ['clips', 'Play the model’s own clips per animation']], r.drive || 'rig', (v) => set('drive', v === 'rig' ? null : v)),
      check('Fit to the character’s height', r.autoHeight !== false, (v) => set('autoHeight', v ? null : false)), num('Height ×', r.heightK ?? 1, { min: 0.5, max: 2, step: 0.01 }, (v) => set('heightK', v === 1 ? null : v)),
      check('Keep the original head', !!r.keepHead, (v) => set('keepHead', v || null)));
    if ((r.drive || 'rig') === 'rig') { const names = model ? bonesOf(model).map((b) => b.name) : []; const auto = autoMap(names); const map = Object.assign({}, auto, r.map || {}); const B = section('Bone map (game bone → model bone)', false);
      B.b.append(h('div', { cls: 'ed-hint' }, names.length ? `${names.length} bones in the model · ${Object.keys(auto).length}/19 found automatically` : 'This model has no skeleton: it is carried as a rigid model (use “Play the model’s own clips” to animate it).'));
      for (const g of MAP_BONES) B.b.append(select(BONE_LABEL[g], [['', '— none —'], ...names.map((n) => [n, n])], map[g] || '', (v) => { const E = this.entry(true); E.model.map = Object.assign({}, map, { [g]: v || undefined }); clean(E.model.map); this.changed(); }));
      B.b.append(btn('Auto-detect again', () => { delete this.entry(true).model.map; this.changed(); })); sec.b.append(B);
      const F = section('Pose fixes (degrees, per bone)', false); for (const g of MAP_BONES) { const f = (r.fix || {})[g] || [0, 0, 0]; F.b.append(h('div', { cls: 'ed-row' }, h('label', {}, BONE_LABEL[g]), ...[0, 1, 2].map((i) => { const inp = h('input', { type: 'number', value: f[i], step: 1, style: { width: '52px' } }); inp.addEventListener('change', () => { const E = this.entry(true); const fx = Object.assign({}, E.model.fix); const v = (fx[g] || [0, 0, 0]).slice(); v[i] = +inp.value || 0; fx[g] = v.some((x) => x) ? v : undefined; E.model.fix = clean(fx); this.changed(); }); return inp; }))); } sec.b.append(F); }
    else { const clips = (c && c.userData.clips) || []; const M = section('Clip per animation state', true); for (const k of ['idle', 'walk', 'run', 'fight', 'seated', ...KNOWN.filter((x) => !['idle', 'walk', 'run', 'fight', 'seated'].includes(x))]) M.b.append(select(k, [['', '—'], ...clips.map((x) => [x.name, x.name])], (r.clips || {})[k] || '', (v) => { const E = this.entry(true); E.model.clips = Object.assign({}, E.model.clips, { [k]: v || undefined }); clean(E.model.clips); this.changed(); })); sec.b.append(M); }
    return sec;
  }
  // ------------------------------------------------------------------ animations (heroes / NPC groups)
  animPanel() {
    const target = this.animTarget(); const set = (ANIM.targets[target] ||= {}); const sec = section('Animations — ' + target, false);
    sec.b.append(h('div', { cls: 'ed-hint' }, 'Import an animation file (BVH, FBX, GLB / GLTF — Mixamo, CMU, Rokoko, Blender …) onto any game animation state of ' + (this.mode === 'player' ? 'this hero' : 'this group') + '. It is retargeted onto the game skeleton. Keyframe tweaks for everyone: console “animations”.'));
    const L = h('div', { cls: 'ed-list', style: { maxHeight: '220px' } });
    for (const k of KNOWN) { const c = set[k]; L.append(h('div', { cls: this.state === k ? 'sel' : '', onclick: () => { this.state = k; this.renderBar(); this.renderInspector(); } }, (c ? '● ' : '') + k, h('small', {}, c ? (c.src || 'imported') + ' · ' + (c.length || 0).toFixed(2) + ' s' : 'game animation'))); }
    sec.b.append(L); const k = this.state && KNOWN.includes(this.state) ? this.state : 'idle'; const c = set[k];
    sec.b.append(h('div', { style: { fontWeight: 600, marginTop: '6px' } }, 'State: ' + k), h('div', { cls: 'ed-tabs' }, btn('⬆ Import for “' + k + '”…', () => this.importAnim(target, k)), c ? btn('Remove', () => { delete set[k]; this.animChanged(); }, { cls: 'warn' }) : null, c ? btn('⬇ Clip (.json)', () => download(target.replace(':', '-') + '-' + k + '.json', JSON.stringify(c))) : null));
    if (c) sec.b.append(num('Weight', c.weight ?? 1, { min: 0, max: 1, step: 0.01 }, (v) => { c.weight = v; this.animChanged(false); }), num('Speed', c.speed ?? 1, { min: 0.1, max: 3, step: 0.01 }, (v) => { c.speed = v; this.animChanged(false); }), check('Loop', c.loop !== false, (v) => { c.loop = v; this.animChanged(false); }), check('Off (use the game animation)', !!c.off, (v) => { c.off = v || undefined; this.animChanged(false); }), btn('Mirror left ↔ right', () => { mirrorClip(c); this.animChanged(false); }));
    return sec;
  }
  animChanged(render = true) { this.P.anims = Object.assign(this.P.anims || {}, { targets: JSON.parse(JSON.stringify(ANIM.targets)) }); clean(this.P.anims.targets); markDirty(); this.fillList && this.fillList(); if (render) this.renderInspector(); }
  async importAnim(target, key) {
    const fs = await pickFiles(ACCEPT_ANIM, true); if (!fs.length) return; let a; try { toast('Reading the animation…'); a = await addAsset(fs, 'anim'); } catch (e) { toast(e.message, 5000); return; }
    let inst; try { inst = await loadAsset({ main: a.main, files: a.files }); } catch (e) { toast('Could not read the file: ' + (e.message || e), 6000); return; }
    if (!inst.clips.length) { toast('The file has no animation clips', 4000); return; }
    const w = new Win('Import animation → ' + target + ' · ' + key, { x: innerWidth / 2 - 220, y: 100, w: 440, h: 470 }); const o = { clip: 0, inPlace: true, mirror: false, fps: 30, start: 0, end: 0, facing: 0, loop: true, restFrame0: false };
    const names = bonesOf(inst.scene).map((b) => b.name); const map = autoMap(names);
    w.body.append(select('Clip', inst.clips.map((c, i) => [i, `${c.name || 'clip ' + i} (${c.duration.toFixed(2)} s)`]), 0, (v) => { o.clip = +v; }), check('In place (no travel)', true, (v) => { o.inPlace = v; }), check('Mirror left ↔ right', false, (v) => { o.mirror = v; }), check('Loop', true, (v) => { o.loop = v; }),
      num('Start (s)', 0, { min: 0, max: 600, step: 0.01 }, (v) => { o.start = v; }), num('End (s, 0 = whole clip)', 0, { min: 0, max: 600, step: 0.01 }, (v) => { o.end = v; }), num('Samples per second', 30, { min: 10, max: 60, step: 1 }, (v) => { o.fps = v; }), num('Source faces (turn °)', 0, { min: -180, max: 180, step: 90 }, (v) => { o.facing = v * Math.PI / 180; }),
      check('Rest pose = first frame (BVH without a T-pose)', false, (v) => { o.restFrame0 = v; }),
      h('div', { cls: 'ed-hint' }, `${names.length} bones · matched ${Object.keys(map).length}/19: ${MAP_BONES.filter((g) => !map[g]).join(', ') || 'all'}${Object.keys(map).length < 19 ? ' missing' : ''}`),
      h('div', { cls: 'ed-tabs' }, btn('Import', () => { try { const clip = importClip({ root: inst.scene, clip: inst.clips[o.clip] }, this.ch, { map, key, fps: o.fps, start: o.start, end: o.end, inPlace: o.inPlace, mirror: o.mirror, loop: o.loop, facing: o.facing, restFrame0: o.restFrame0 }); clip.src = a.name + ' · ' + (inst.clips[o.clip].name || o.clip); clip.file = a.main;
        (ANIM.targets[target] ||= {})[key] = clip; this.state = key; this.animChanged(); w.close(); toast('Imported onto “' + key + '” — preview runs in the viewport'); } catch (e) { console.error(e); toast('Import failed: ' + (e.message || e), 6000); } }), btn('Cancel', () => w.close())));
  }
  // ------------------------------------------------------------------ mode panels
  weaponPanel(it) {
    const out = h('div'); const def = it.def; const e = this.entry(false) || {}; const S2 = section('Numbers (damage, fire rate, magazine …)', false);
    for (const [k, v] of Object.entries(def)) { if (typeof v !== 'number') continue; const cur = (e.stats || {})[k] ?? v; S2.b.append(num(k + (cur !== v ? ' ●' : ''), cur, { min: Math.min(0, v * 4), max: Math.max(1, Math.abs(v) * 4), step: Math.abs(v) < 2 ? 0.01 : 1 }, (x) => { const E = this.entry(true); E.stats ||= {}; if (x === v) delete E.stats[k]; else E.stats[k] = x; this.changed('weapons'); })); }
    S2.b.append(h('div', { cls: 'ed-hint' }, 'Shared by the player, the squad and the police that carry this gun.'));
    const sh = e.shell || {}; const SH = section('Spent case (shell)', false); const setSh = (f, v) => { const E = this.entry(true); E.shell = Object.assign({}, E.shell, { [f]: v }); clean(E.shell); if (!Object.keys(E.shell).length) delete E.shell; this.changed('weapons'); };
    SH.b.append(color('Colour', sh.color || '#c8a050', (v) => setSh('color', v)), num('Size', sh.scale ?? 1, { min: 0.2, max: 4, step: 0.01 }, (v) => setSh('scale', v === 1 ? null : v)), num('Diameter ×', sh.radius ?? 1, { min: 0.3, max: 3, step: 0.01 }, (v) => setSh('radius', v === 1 ? null : v)), num('Length ×', sh.length ?? 1, { min: 0.3, max: 4, step: 0.01 }, (v) => setSh('length', v === 1 ? null : v)),
      h('div', { cls: 'ed-tabs' }, btn(sh.asset ? 'Replace shell model…' : '⬆ Shell model…', async () => { const fs = await pickFiles(ACCEPT_MODEL, true); if (!fs.length) return; try { const a = await addAsset(fs, 'model'); setSh('asset', { main: a.main, files: a.files }); } catch (err) { toast(err.message, 5000); } }), sh.asset ? btn('Remove shell model', () => setSh('asset', null)) : null, btn('Reset shell', () => { delete this.entry(true).shell; this.changed('weapons'); })),
      h('div', { cls: 'ed-hint' }, 'Shown next to the gun in the preview; ejected on every shot in the game.'));
    const g = this.obj && this.obj.userData.weapon; const PT = section('Points (ejection port, muzzle)', false);
    if (g) for (const [k, v] of Object.entries(g.userData)) { if (!v || !v.isVector3 || !['eject', 'muzzle', 'support', 'flash'].includes(k)) continue; const cur = (e.points || {})[k] || [v.x, v.y, v.z]; ['x', 'y', 'z'].forEach((ax, i) => PT.b.append(num(k + ' ' + ax, cur[i], { min: cur[i] - 0.5, max: cur[i] + 0.5, step: 0.001 }, (x) => { const E = this.entry(true); E.points ||= {}; const p = (E.points[k] || cur).slice(); p[i] = x; E.points[k] = p; this.changed('weapons'); }))); }
    out.append(S2, SH, PT); this.showShell(sh); return out;
  }
  showShell(sh) { const g = this.obj && this.obj.userData.weapon; if (!g) return; const proto = g.userData.shellProto || new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.02, 8), new THREE.MeshStandardMaterial({ color: sh.color || '#c8a050', metalness: 0.9, roughness: 0.35 })); const s = proto.clone(); s.position.set(0, 1.12, 0.1); s.scale.multiplyScalar(4); s.userData.__helper = true; this.vp.scene.add(s); this.extras.push(s); }
  heroPanel(it) {
    const out = h('div'); const e = this.entry(false) || {}; const mh = it.id;
    // garments
    const G = section('Clothing textures (garments)', true); const scope = this.lookItem ? this.lookItem : null;
    G.b.append(h('div', { cls: 'ed-hint' }, scope ? `Editing the garments used only while ${mh} wears “${scope.name}” (wardrobe item).` : 'Applies to whatever this hero wears (pick a wardrobe item below to make textures for one item only).'));
    if (scope) G.b.append(btn('Back to general garments', () => { this.lookItem = null; this.renderInspector(); }));
    const gar = scope ? ((e.items || {})[scope.id] || {}).garments || {} : e.garments || {};
    const setG = (id, f, v) => { const E = this.entry(true); let tgt; if (scope) { E.items ||= {}; E.items[scope.id] ||= {}; tgt = (E.items[scope.id].garments ||= {}); } else tgt = (E.garments ||= {}); const g = (tgt[id] ||= { mode: 0 }); if (v == null) delete g[f]; else g[f] = v; if (!g.mode && !g.map) delete tgt[id]; if (scope && !Object.keys(tgt).length) { delete E.items[scope.id]; if (!Object.keys(E.items).length) delete E.items; } if (!scope && !Object.keys(tgt).length) delete E.garments; this.changed('heroes'); };
    for (const [id, lab] of GARMENTS) { const g = gar[id] || {}; const s = section(lab + (g.mode ? ' ●' : ''), !!g.mode); s.b.append(select('Mode', GARMENT_MODES, g.mode || 0, (v) => setG(id, 'mode', +v || 0)));
      if (g.mode) { if (g.mode < 3) s.b.append(this.texRow('Texture', g.map, null, (v) => setG(id, 'map', v), true)); s.b.append(color('Tint / colour', g.tint || '#ffffff', (v) => setG(id, 'tint', v)), num('Tiles per metre', g.repeat ?? 4, { min: 0.2, max: 60, step: 0.1 }, (v) => setG(id, 'repeat', v)), num('Rotation °', g.rot || 0, { min: -180, max: 180, step: 1 }, (v) => setG(id, 'rot', v)), num('Strength', g.strength ?? 1, { min: 0, max: 1, step: 0.01 }, (v) => setG(id, 'strength', v))); }
      G.b.append(s); }
    // colours (spec look)
    const C = section('Body & clothing colours', false); const base = HEROES[mh]; const look = e.look || {}; const setL = (k, v) => { const E = this.entry(true); E.look ||= {}; if (v == null) delete E.look[k]; else E.look[k] = v; this.changed('heroes'); };
    for (const k of ['skin', 'top', 'inner', 'bottom', 'shoes', 'sole', 'vest', 'hairColor', 'heroTie', 'vestBack', 'stripe']) if (typeof base[k] === 'string' && base[k].startsWith('#')) C.b.append(h('div', { cls: 'ed-row' }, h('label', {}, k + (look[k] ? ' ●' : '')), (() => { const i = h('input', { type: 'color', value: look[k] || base[k] }); i.addEventListener('change', () => setL(k, i.value)); return i; })(), look[k] ? btn('↺', () => setL(k, null)) : null));
    C.b.append(h('div', { cls: 'ed-hint' }, 'Base colours of the generated body / clothes (garment textures above sit on top).'));
    // wardrobe
    const W = section('Clothes — wardrobe catalogue (' + Object.values(CATALOGUE).reduce((n, l) => n + l.length, 0) + ' items)', false); const L = h('div', { cls: 'ed-list', style: { maxHeight: '260px' } });
    for (const [cat, list] of Object.entries(CATALOGUE)) { L.append(h('div', { style: { color: '#e0a030', cursor: 'default' } }, CATEGORY_NAMES[cat] || cat)); for (const it2 of list) { const worn = this.look[SLOT[cat]] === it2.id; const has = e.items && e.items[it2.id]; L.append(h('div', { cls: worn ? 'sel' : '', title: it2.id, onclick: () => { this.look = Object.assign({}, this.look, { [SLOT[cat]]: worn ? undefined : it2.id }); clean(this.look); this.lookItem = worn ? null : Object.assign({ cat }, it2); this.rebuild(true); } }, (has ? '● ' : '') + '   ' + it2.name, h('small', {}, it2.col || ''))); } }
    W.b.append(h('div', { cls: 'ed-hint' }, 'Click an item to try it on in the preview (click again to take it off). Garment textures made while an item is selected apply only with that item.'), L, btn('Take everything off (own clothes)', () => { this.look = {}; this.lookItem = null; this.rebuild(true); }));
    out.append(G, C, W); return out;
  }
  vehiclePanel(it) {
    const out = h('div'); const id = it.id; const T = id.startsWith('boat:') ? BOATS[id.slice(5)] : VTYPES[id]; if (!T) { out.append(h('div', { cls: 'ed-hint' }, id.startsWith('train:') ? 'Train cars: parts, textures and a replacement body (the train keeps its route, doors and timetable).' : 'Parts, textures and a replacement model.')); return out; }
    const e = this.entry(false) || {}; const H = section('Handling & numbers (how it moves)', false);
    for (const [k, v] of Object.entries(T)) { if (typeof v !== 'number') continue; const cur = (e.handling || {})[k] ?? v; H.b.append(num(k + (cur !== v ? ' ●' : ''), cur, { min: Math.min(0, v * 3), max: Math.max(1, Math.abs(v) * 3), step: Math.abs(v) < 3 ? 0.01 : Math.abs(v) < 50 ? 0.1 : 1 }, (x) => { const E = this.entry(true); E.handling ||= {}; if (x === v) delete E.handling[k]; else E.handling[k] = x; this.changed('vehicles'); })); }
    if (Array.isArray(T.colors)) H.b.append(text('Paint colours (#hex, comma separated)', ((e.handling || {}).colors || T.colors).join(', '), (v) => { const cols = v.split(/[\s,]+/).filter((c) => /^#[0-9a-f]{6}$/i.test(c)); const E = this.entry(true); E.handling ||= {}; if (cols.length) E.handling.colors = cols; else delete E.handling.colors; this.changed('vehicles'); }));
    H.b.append(h('div', { cls: 'ed-hint' }, 'len / wid / hgt / wheelR change the physics box, not the model — use the replacement transform for the look. Numbers apply to cars spawned after the change.')); out.append(H); return out;
  }
  npcPanel(it) {
    const out = h('div'); const r = this.rule(it.id, false); const R = section('Rule', true);
    R.b.append(h('div', { cls: 'ed-hint' }, 'Edits here apply to every NPC of this group in the game. Several rules can match one NPC (more specific ones — preset / role — are listed later and win).'));
    if (r) R.b.append(check('Enabled', r.on !== false, (v) => { r.on = v; this.changed('npcs'); }), num('Share of the group (chance)', r.chance ?? 1, { min: 0, max: 1, step: 0.01 }, (v) => { r.chance = v; this.changed('npcs'); }));
    const look = (r && r.look) || {}; const L = section('Look (generated body & clothes)', false); const setL = (k, v) => { const r2 = this.rule(it.id, true); r2.look ||= {}; if (v == null) delete r2.look[k]; else r2.look[k] = v; this.changed('npcs'); };
    for (const k of ['skin', 'top', 'bottom', 'skirtCol', 'shoes', 'hairColor']) L.b.append(h('div', { cls: 'ed-row' }, h('label', {}, k + (look[k] ? ' ●' : '')), (() => { const i = h('input', { type: 'color', value: look[k] || '#808080' }); i.addEventListener('change', () => setL(k, i.value)); return i; })(), look[k] ? btn('↺', () => setL(k, null)) : null));
    L.b.append(num('Height ×', look.heightK ?? 1, { min: 0.85, max: 1.15, step: 0.005 }, (v) => setL('heightK', v === 1 ? null : v)), num('Build ×', look.buildK ?? 1, { min: 0.8, max: 1.3, step: 0.01 }, (v) => setL('buildK', v === 1 ? null : v)), h('div', { cls: 'ed-hint' }, 'Adults only: the game keeps every NPC 18+.'));
    out.append(R, L); return out;
  }
  // ------------------------------------------------------------------ in-hand weapon preview (the live game, frozen world)
  startHold(kind) {
    const W = this.g.weapons, P = this.g.player; if (!W || !P || !P.ch) { toast('No player in this session'); return; } const i = WEAPONS.findIndex((d) => d.id === this.item); if (i < 0) { toast('The police T-56 is not a player weapon'); return; }
    this.hold = { kind, i, owned: W.inv[i].owned, sel: W.sel, yaw: Math.PI, pitch: 0.12, dist: kind === 'pov' ? 0 : 2.6 }; W.inv[i].owned = true; try { W.select(i); } catch (e) { console.warn(e); }
    this.g.noRender = false; this.win.el.style.display = 'none'; this.g.last = performance.now();
    const pan = this.holdWin = new Win('In hand — ' + (WEAPONS[i].name || this.item), { x: 12, y: 12, w: 300, h: 210, onClose: () => this.endHold() });
    pan.body.append(select('View', [['third', 'Third person'], ['pov', 'Aiming / POV (eye)']], kind, (v) => { this.hold.kind = v; this.hold.dist = v === 'pov' ? 0 : 2.6; }), check('Aim', true, (v) => { this.hold.noAim = !v; }), num('Turn', 180, { min: 0, max: 360, step: 1 }, (v) => { this.hold.yaw = v * Math.PI / 180; }), num('Distance', 2.6, { min: 0.6, max: 8, step: 0.05 }, (v) => { if (this.hold.kind !== 'pov') this.hold.dist = v; }),
      btn('Back to the model tools', () => pan.close()), h('div', { cls: 'ed-hint' }, 'The game itself draws the hero holding the gun (its grip, aim and recoil code). The world is paused around him.'));
  }
  gameTick(dt) {
    const Hd = this.hold; if (!Hd) return; const g = this.g, W = g.weapons, P = g.player;
    // the frozen world: no shots (mouse / trigger never reach the gun), only the hold / aim pose
    Input.mousePressed.clear(); Input.mouseButtons.clear(); W._eatFire = true; W.quickAim = Hd.noAim ? 0 : 1;
    try { P.ch.anim.update(dt, 0, 0); } catch (e) { console.warn(e); } try { W.update(dt, true); } catch (e) { console.warn(e); } P.ch.root.updateMatrixWorld(true);
    const head = P.ch.bones.head; const hp = head ? head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(P.x, (P.y || 0) + 1.6, P.z); const cam = g.camera; const fy = P.ch.root.rotation.y;
    if (Hd.kind === 'pov') { const f = new THREE.Vector3(Math.sin(fy), 0, Math.cos(fy)); cam.position.copy(hp).addScaledVector(f, 0.12).add(new THREE.Vector3(0, 0.04, 0)); cam.lookAt(hp.clone().addScaledVector(f, 10)); }
    else { const a = fy + Hd.yaw; cam.position.set(hp.x + Math.sin(a) * Hd.dist, hp.y + 0.2 + Math.sin(Hd.pitch) * Hd.dist, hp.z + Math.cos(a) * Hd.dist); cam.lookAt(hp.x, hp.y - 0.25, hp.z); }
    cam.updateMatrixWorld();
  }
  endHold() {
    const Hd = this.hold; if (!Hd) return; this.hold = null; const W = this.g.weapons; try { W.inv[Hd.i].owned = Hd.owned; if (!Hd.owned || Hd.sel !== Hd.i) { if (Hd.sel >= 0 && W.inv[Hd.sel] && W.inv[Hd.sel].owned) W.select(Hd.sel); else W.selectFists(); } } catch (e) { console.warn(e); }
    this.g.noRender = true; if (this.holdWin && !this.holdWin.closed) { this.holdWin.onClose = null; this.holdWin.close(); } this.holdWin = null; if (this.win) this.win.el.style.display = '';
  }
  // ------------------------------------------------------------------ downloads
  downloadPanel() {
    const sec = section('Download', false); const it = this.items.find((i) => i.id === this.item); const base = (this.mode + '-' + this.item).replace(/[^\w-]+/g, '_');
    sec.b.append(h('div', { cls: 'ed-tabs' }, btn('⬇ Original model (.glb)', () => this.exportGlb(true, base + '-original.glb')), btn('⬇ Original textures (.zip)', () => this.exportTextures(base + '-textures.zip')), btn('⬇ As edited (.glb)', () => this.exportGlb(false, base + '-edited.glb'))),
      h('div', { cls: 'ed-hint' }, 'The game builds its models in code: the .glb is that model exactly as the game builds it (' + (it ? it.label : '') + '), with its materials and textures; the .zip has every texture it uses as PNG.'));
    return sec;
  }
  async exportGlb(pristine, name) {
    try { const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js'); let o; let tmp = null; if (pristine) { tmp = this.build(this.item, true); o = tmp; } else o = this.obj; const target = o.userData.weapon || o;
      const vis = []; target.traverse((x) => { if (x.layers.mask === 0 && x.visible) { vis.push(x); x.visible = false; } if (x.userData.__helper) { vis.push(x); x.visible = false; } });
      const glb = await new GLTFExporter().parseAsync(target, { binary: true, onlyVisible: true, maxTextureSize: 2048 }); for (const x of vis) x.visible = true; download(name, glb, 'model/gltf-binary'); toast('Downloaded ' + name); } catch (e) { console.error(e); toast('Export failed: ' + (e.message || e), 5000); }
  }
  async exportTextures(name) {
    const o = this.build(this.item, true); const seen = new Map(); const files = []; const enc = (cv) => new Promise((r) => cv.toBlob(async (b) => r(new Uint8Array(await b.arrayBuffer())), 'image/png'));
    const toCanvas = (t) => { const im = t.image; if (!im) return null; const cv = document.createElement('canvas'); if (im.data && im.width) { cv.width = im.width; cv.height = im.height; const cx = cv.getContext('2d'); const id = cx.createImageData(im.width, im.height); const d = im.data; if (d.length === im.width * im.height * 4) { id.data.set(d instanceof Uint8Array || d instanceof Uint8ClampedArray ? d : Uint8Array.from(d, (x) => Math.max(0, Math.min(255, x * 255)))); cx.putImageData(id, 0, 0); return cv; } return null; } if (!im.width) return null; cv.width = im.width; cv.height = im.height; cv.getContext('2d').drawImage(im, 0, 0); return cv; };
    o.traverse((x) => { for (const m of matsOf(x)) for (const [k, v] of Object.entries(m || {})) { if (!v || !v.isTexture || seen.has(v)) continue; seen.set(v, (m.name || x.name || 'material') + '-' + k); } });
    for (const [t, n] of seen) { const cv = toCanvas(t); if (!cv) continue; try { files.push({ name: n.replace(/[^\w-]+/g, '_') + '-' + t.id + '.png', data: await enc(cv) }); } catch { /* tainted */ } }
    if (!files.length) { toast('This model has no image textures (its colours are per vertex / material colours)', 4500); return; }
    const z = writeZip(files); download(name, z instanceof Blob ? z : new Blob([z]), 'application/zip'); toast(`Downloaded ${files.length} textures`);
  }
  downloadTexture(t, name) { const im = t.image; if (!im || !im.width) { toast('No image'); return; } const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; cv.getContext('2d').drawImage(im, 0, 0); cv.toBlob((b) => download(name, b, 'image/png'), 'image/png'); }
  async downloadPackFile(n, orig) { try { const r = await fetch(fileURL(n)); download(orig || n, await r.blob(), 'application/octet-stream'); } catch (e) { toast('Not downloaded: ' + e.message); } }
  dispose() { this.endHold(); ANIM.force = null; this.clearPreview(); this.vp.dispose(); removeEventListener('keydown', this.onKey, true); this.unsub && this.unsub(); if (!this.win.closed) this.win.close(); if (PACK.dirty) toast('Model tools closed with unsaved changes (they stay until the game restarts — 💾 Save to keep them)', 5000); S = null; }
  close() { if (this.win && !this.win.closed) this.win.close(); }
}
export async function preloadBoat() { const m = await import('../boats/Boat.js'); ModelStudio.prototype.BoatClass = m.Boat; }
preloadBoat().catch(() => {});
