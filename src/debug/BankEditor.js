// Bank editor (73rd) — console `bank-edit`, development builds only (like the Texture Studio and the model tools).
// Every part of the Ceylon Meridian Bank's banking hall (BankLayout.js: counter, security glass, ATMs, chairs, desks, posters,
// plants, ceiling panels, air conditioners, vault door …) can be selected — click it in the view or pick it from the list —
// and moved, turned, scaled or hidden; "Own materials" gives it materials of its own, so the Texture Studio (console
// `textures`) retextures just that part. 💾 Save writes the layout into model-pack/manifest.json ("bank"): the game applies it
// whenever the hall is built, and build-exe.bat builds it into the .exe. The originals are never changed: Reset puts a part
// back, and every part (as it is now, or as designed) can be downloaded as a .glb.
// People keep their own places (the tellers' seats, the waiting chairs, the ATM spots) — a part they use can be moved, but
// they still go to where it was designed to be.
import * as THREE from 'three';
import { Win, h, btn, num, check, section, text, beginSession, toast, download } from './ui.js';
import { PACK, loadPack, savePack, markDirty } from './ModelPack.js';
import { applyLayout, partBox, partAtFace, partObject, partEdited, PART_PREFIX } from '../world/BankLayout.js';
import { openTextureStudio } from './boot.js';

let ed = null;
export async function open(game) { if (ed) return ed; ed = new BankEditor(game); await ed.init(); return ed; }
const clone = (o) => JSON.parse(JSON.stringify(o));
const fresh = () => ({ v: 1, parts: {} });

class BankEditor {
  constructor(game) { this.g = game; this.keys = new Set(); this.sel = null; this.filter = ''; this.unsaved = false; }
  bankRoom() { const W = this.g.interiors && this.g.interiors.walkIn; const s = W && W.sites.find((q) => q.room && q.room.bank); return { W, room: s && s.room }; }
  async init() {
    const { W, room } = this.bankRoom(); if (!room || !room.parts) { ed = null; throw new Error('the bank hall is not built yet'); }
    if (W.active !== room) { ed = null; throw new Error('walk into the Ceylon Meridian Bank first (the editor works inside the hall, with its own lights)'); }
    this.room = room; this.P = room.parts; await loadPack(); this.layout = clone((PACK.m && PACK.m.bank) || this.P.layout || fresh()); if (!this.layout.parts) this.layout.parts = {};
    const cam = this.g.camera; this.cam = cam; const e = new THREE.Euler().setFromQuaternion(cam.quaternion, 'YXZ'); this.yaw = e.y; this.pitch = e.x; this.pos = cam.position.clone(); this.speed = 3;
    this.box = new THREE.Box3Helper(new THREE.Box3(), 0xffb020); this.box.visible = false; this.box.userData.__helper = true; room.g.add(this.box);
    this.session = beginSession(this.g, 'bank', { hook: (dt) => this.tick(dt), onEnd: () => this.dispose() });
    this.bindInput(); this.buildUI(); toast('Bank editor — click a part (or pick it from the list) · right-drag look · WASD / Q E fly');
  }
  // ---------------------------------------------------------------- UI
  buildUI() {
    this.main = new Win('Bank editor — Ceylon Meridian Bank', { x: 16, y: 60, w: 380, h: Math.min(innerHeight - 80, 760), onClose: () => this.session.end() });
    this.status = h('div', { cls: 'ed-hint' });
    const bar = h('div', { cls: 'ed-tabs' }, btn('💾 Save', () => this.save(), { cls: 'ts-save', title: 'Write the layout into model-pack/manifest.json (built into the game / .exe)' }), btn('Revert to saved', () => this.revert()), btn('Reset all', () => this.resetAll()), btn('Texture Studio', () => this.openStudio(), { title: 'Retexture parts that have their own materials' }));
    this.list = h('div', { style: { maxHeight: '230px', overflowY: 'auto', border: '1px solid #2c3340', borderRadius: '4px', margin: '4px 0' } });
    this.insp = h('div');
    this.main.body.append(h('div', { cls: 'ed-hint' }, 'Click a part in the view (or in the list). Arrows move it (Shift ×5, Alt fine), PgUp / PgDn raise / lower, [ ] turn 15°, H hide, Esc deselect, Ctrl+S save.'), bar, this.status,
      text('Find', '', (v) => { this.filter = v.toLowerCase(); this.renderList(); }), this.list, this.insp,
      section('Downloads', false, btn('Whole hall as designed (.glb)', () => this.exportGlb(null, true)), btn('Whole hall as edited (.glb)', () => this.exportGlb(null, false))));
    this.renderList(); this.renderInsp(); this.renderStatus();
  }
  renderStatus() { const n = Object.values(this.layout.parts).filter(partEdited).length; const own = Object.values(this.layout.parts).filter((e) => e && e.own && !e.hide).length;
    this.status.textContent = `${this.P.names.length} parts · ${n} edited · ${own} with their own materials (+${own} draw call${own === 1 ? '' : 's'} per material)` + (this.unsaved ? ' · unsaved changes' : ' · saved'); }
  renderList() {
    this.list.textContent = ''; const names = [...this.P.names].sort((a, b) => a.localeCompare(b)).filter((n) => !this.filter || n.toLowerCase().includes(this.filter));
    for (const n of names) { const e = this.layout.parts[n]; const row = h('div', { style: { padding: '2px 6px', cursor: 'pointer', background: n === this.sel ? '#2a2316' : 'transparent', color: e && e.hide ? '#7a8290' : '#d6dce6' }, onclick: () => this.select(n) },
      (partEdited(e) ? '• ' : '') + n + (e && e.hide ? ' (hidden)' : '') + (e && e.own ? ' (own materials)' : '')); this.list.append(row); }
  }
  entry(n = this.sel) { let e = this.layout.parts[n]; if (!e) e = this.layout.parts[n] = { p: [0, 0, 0], r: 0, s: [1, 1, 1] }; e.p ||= [0, 0, 0]; e.s ||= [1, 1, 1]; e.r ||= 0; return e; }
  renderInsp() {
    this.insp.textContent = ''; const n = this.sel; if (!n) { this.insp.append(h('div', { cls: 'ed-hint' }, 'No part selected.')); return; }
    const e = this.entry(); const ch = (fn) => (v) => { fn(v); this.changed(); };
    const sec = section(n, true,
      num('Move X (m)', e.p[0], { min: -6, max: 6, step: 0.01 }, ch((v) => { e.p[0] = v; })), num('Move Y (m)', e.p[1], { min: -2, max: 3, step: 0.01 }, ch((v) => { e.p[1] = v; })), num('Move Z (m)', e.p[2], { min: -6, max: 6, step: 0.01 }, ch((v) => { e.p[2] = v; })),
      num('Turn (°)', e.r, { min: -180, max: 180, step: 1 }, ch((v) => { e.r = v; })),
      num('Scale X', e.s[0], { min: 0.1, max: 3, step: 0.01 }, ch((v) => { e.s[0] = v; })), num('Scale Y', e.s[1], { min: 0.1, max: 3, step: 0.01 }, ch((v) => { e.s[1] = v; })), num('Scale Z', e.s[2], { min: 0.1, max: 3, step: 0.01 }, ch((v) => { e.s[2] = v; })),
      check('Hidden', !!e.hide, ch((v) => { e.hide = v; })),
      check('Own materials (retexture in the Texture Studio)', !!e.own, ch((v) => { e.own = v; })),
      h('div', { cls: 'ed-hint' }, e.own ? `In the Texture Studio this part's materials are named "${PART_PREFIX}${n} · …" — click the part there and edit them; nothing else in the city changes.` : 'With "Own materials" off the part shares its materials with the rest of the hall (and the city): retexturing it there would change those too.'),
      h('div', { cls: 'ed-tabs' }, btn('Reset part', () => { delete this.layout.parts[n]; this.changed(true); }), btn('Download as designed (.glb)', () => this.exportGlb(n, true)), btn('Download as edited (.glb)', () => this.exportGlb(n, false))));
    this.insp.append(sec);
  }
  select(n) { this.sel = n; this.renderList(); this.renderInsp(); this.updateBox(); }
  changed(rerender = false) { try { applyLayout(this.P, this.layout); } catch (e) { console.error(e); toast('Could not apply: ' + (e.message || e), 4000); } this.unsaved = true; markDirty(); this.updateBox(); this.renderStatus(); if (rerender) { this.renderList(); this.renderInsp(); } else this.renderListSoon(); }
  renderListSoon() { if (this.listT) return; this.listT = setTimeout(() => { this.listT = 0; this.renderList(); }, 250); }
  updateBox() { const b = this.sel && partBox(this.P, this.sel); this.box.visible = !!b && !(this.layout.parts[this.sel] && this.layout.parts[this.sel].hide); if (b) { this.box.box.copy(b).expandByScalar(0.02); this.box.updateMatrixWorld(true); } }
  // ---------------------------------------------------------------- input
  bindInput() {
    const cv = this.g.canvas || this.g.renderer.domElement; this.cv = cv; const inField = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    this.onKeyDown = (e) => { if (inField(e) || e.target.closest?.('.ed-win')) return; this.keys.add(e.code); this.key(e); };
    this.onKeyUp = (e) => { this.keys.delete(e.code); };
    this.onDown = (e) => { if (e.button === 2) this.look = [e.clientX, e.clientY]; else if (e.button === 0) this.click(e); };
    this.onMove = (e) => { if (this.look) { this.yaw -= (e.clientX - this.look[0]) * 0.004; this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - (e.clientY - this.look[1]) * 0.004)); this.look = [e.clientX, e.clientY]; } };
    this.onUp = (e) => { if (e.button === 2) this.look = null; };
    this.onWheel = (e) => { this.speed = Math.max(0.5, Math.min(20, this.speed * (e.deltaY > 0 ? 0.85 : 1.18))); e.preventDefault(); };
    this.onCtx = (e) => e.preventDefault();
    addEventListener('keydown', this.onKeyDown, true); addEventListener('keyup', this.onKeyUp, true); cv.addEventListener('pointerdown', this.onDown); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp); cv.addEventListener('wheel', this.onWheel, { passive: false }); cv.addEventListener('contextmenu', this.onCtx);
  }
  key(e) {
    const c = e.code, ctrl = e.ctrlKey || e.metaKey; if (ctrl && c === 'KeyS') { e.preventDefault(); this.save(); return; }
    if (c === 'Escape') { this.select(null); return; } const n = this.sel; if (!n || ctrl) return; const st = e.altKey ? 0.01 : e.shiftKey ? 0.25 : 0.05; const E = this.entry();
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[c];
    if (mv) { e.preventDefault(); // screen-relative, snapped to the room axis nearest the view (room-local: the hall may be turned in the world)
      const q = new THREE.Quaternion(); this.room.g.getWorldQuaternion(q); const inv = q.invert(); const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).applyQuaternion(inv), r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).applyQuaternion(inv);
      const d = r.multiplyScalar(mv[0]).add(f.multiplyScalar(-mv[1])); if (Math.abs(d.x) > Math.abs(d.z)) E.p[0] = +(E.p[0] + Math.sign(d.x) * st).toFixed(3); else E.p[2] = +(E.p[2] + Math.sign(d.z) * st).toFixed(3); this.changed(true); return; }
    if (c === 'PageUp' || c === 'PageDown') { e.preventDefault(); E.p[1] = +(E.p[1] + (c === 'PageUp' ? st : -st)).toFixed(3); this.changed(true); }
    else if (c === 'BracketLeft' || c === 'BracketRight') { E.r = ((E.r + (c === 'BracketLeft' ? -15 : 15) + 540) % 360) - 180; this.changed(true); }
    else if (c === 'KeyH') { E.hide = !E.hide; this.changed(true); }
  }
  click(e) {
    const r = this.cv.getBoundingClientRect(); const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(m, this.cam); const targets = []; for (const rec of this.P.recs) { if (rec.m.visible) targets.push(rec.m); for (const s of rec.subs) targets.push(s); }
    const hits = rc.intersectObjects(targets, false); for (const hh of hits) { const n = partAtFace(this.P, hh.object, hh.faceIndex); if (n) { this.select(n); return; } } toast('No bank part there');
  }
  tick(dt) {
    const k = this.keys; if (!this.sel || !(k.has('ArrowUp') || k.has('ArrowDown'))) { const sp = this.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 3 : 1) * dt;
      const f = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)), rr = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      if (k.has('KeyW')) this.pos.addScaledVector(f, sp); if (k.has('KeyS')) this.pos.addScaledVector(f, -sp); if (k.has('KeyD')) this.pos.addScaledVector(rr, sp); if (k.has('KeyA')) this.pos.addScaledVector(rr, -sp); if (k.has('KeyE')) this.pos.y += sp; if (k.has('KeyQ')) this.pos.y -= sp; }
    const cam = this.cam; cam.position.copy(this.pos); cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ'); cam.updateMatrixWorld(true);
  }
  // ---------------------------------------------------------------- save / files
  cleaned() { const out = { v: 1, parts: {} }; for (const [n, e] of Object.entries(this.layout.parts)) if (partEdited(e)) { const o = {}; if (e.p && (e.p[0] || e.p[1] || e.p[2])) o.p = e.p.map((v) => +(+v).toFixed(4)); if (e.r) o.r = +(+e.r).toFixed(2); if (e.s && (e.s[0] !== 1 || e.s[1] !== 1 || e.s[2] !== 1)) o.s = e.s.map((v) => +(+v).toFixed(4)); if (e.hide) o.hide = true; if (e.own) o.own = true; out.parts[n] = o; } return out; }
  async save() {
    try { await loadPack(); const L = this.cleaned(); if (Object.keys(L.parts).length) PACK.m.bank = L; else delete PACK.m.bank; await savePack(); this.unsaved = false; this.renderStatus(); toast('Bank layout saved into model-pack/manifest.json (' + Object.keys(L.parts).length + ' edited parts)', 3000); }
    catch (e) { toast('Not saved: ' + ((e && e.message) || e), 5000); }
  }
  async revert() { await loadPack(true); this.layout = clone((PACK.m && PACK.m.bank) || fresh()); if (!this.layout.parts) this.layout.parts = {}; this.changed(true); this.unsaved = false; this.renderStatus(); toast('Back to the saved layout'); }
  resetAll() { if (!confirm('Put every part of the bank back where it was designed? (Save afterwards to keep that)')) return; this.layout = fresh(); this.changed(true); }
  openStudio() { this.session.end(); openTextureStudio(this.g).catch((e) => toast('Texture Studio: ' + ((e && e.message) || e), 4000)); }
  async exportGlb(name, pristine) {
    try { const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js'); const keep = this.layout; if (pristine) applyLayout(this.P, fresh());
      let root; try { if (name) root = partObject(this.P, name); else { root = new THREE.Group(); root.name = 'Ceylon Meridian Bank hall'; for (const n of this.P.names) if (pristine || !(keep.parts[n] && keep.parts[n].hide)) root.add(partObject(this.P, n)); } } finally { if (pristine) applyLayout(this.P, keep); }
      const glb = await new GLTFExporter().parseAsync(root, { binary: true, maxTextureSize: 1024 }); root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      download((name ? 'bank-' + name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : 'bank-hall') + (pristine ? '-original' : '-edited') + '.glb', glb, 'model/gltf-binary'); }
    catch (e) { console.error(e); toast('Export failed: ' + ((e && e.message) || e), 4000); }
  }
  dispose() {
    if (this.unsaved) toast('Bank editor closed — the changes stay for this session only (type bank-edit and Save to keep them)', 4000);
    removeEventListener('keydown', this.onKeyDown, true); removeEventListener('keyup', this.onKeyUp, true); this.cv.removeEventListener('pointerdown', this.onDown); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); this.cv.removeEventListener('wheel', this.onWheel); this.cv.removeEventListener('contextmenu', this.onCtx);
    if (this.box.parent) this.box.parent.remove(this.box); this.box.geometry.dispose(); this.box.material.dispose(); if (!this.main.closed) this.main.close(); ed = null;
  }
}
