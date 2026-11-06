// Animation editor (console: `animations`). Lists every animation state the game has (and which ones characters are in
// right now), previews it on a real character driven by the game's own Animator, and lets you key bone rotations / hip
// offsets / bone scales over a timeline, as an additive layer or a full replacement of the procedural pose. Saved clips
// apply to every character in the game (AnimRuntime.js).
import * as THREE from 'three';
import { Character, HEROES } from '../actors/Character.js';
import { ANIM, KNOWN, LOCO, BONE_LIST, install, newClip, liveStates, sample, saveAnims, loadSavedAnims } from './AnimRuntime.js';
import { Win, Viewport, h, btn, num, select, check, section, beginSession, toast, download, pickFile } from './ui.js';

const SPEED = { idle: 0, walk: 1.35, run: 5 };
const PI = Math.PI;
let ed = null;
export async function open(game) { if (ed && !ed.win.closed) return ed; await loadSavedAnims(); install(); ed = new AnimEditor(game); return ed; }

class AnimEditor {
  constructor(game) {
    this.g = game; this.key = 'walk'; this.bone = 'armR'; this.t = 0; this.playing = true; this.clip = null; this.copied = null;
    this.session = beginSession(game, 'animations', { hideGame: true, onEnd: () => this.dispose() });
    const W = Math.min(innerWidth - 40, 1280), H = Math.min(innerHeight - 40, 760);
    this.win = new Win('Animation editor — every animation in the game', { x: 20, y: 20, w: W, h: H, onClose: () => this.session.end() });
    // ---- left: detected animations
    this.search = h('input', { type: 'text', placeholder: 'search…', style: { width: '100%', marginBottom: '4px' } }); this.search.addEventListener('input', () => this.fillList());
    this.list = h('div', { cls: 'ed-list', style: { flex: 1 } });
    const specs = this.specOptions(); this.specSel = select('Preview on', specs.map((s, i) => [i, s.label]), 0, (v) => this.setModel(+v));
    const left = h('div', { cls: 'ed-col', style: { width: '230px', flex: 'none' } }, h('div', { cls: 'ed-hint' }, 'Animations (* = edited · number = characters doing it now)'), this.search, this.list, this.specSel,
      check('Apply edits in game', ANIM.enabled, (v) => { ANIM.enabled = v; }));
    // ---- centre: viewport + timeline
    const mid = h('div', { cls: 'ed-col', style: { flex: 1 } });
    this.vp = new Viewport(mid, { target: [0, 0.95, 0], dist: 3.4 }); this.vp.el.style.flex = '1';
    this.tl = h('canvas', { style: { width: '100%', height: '96px', background: '#0f1116', border: '1px solid #2c3340', borderRadius: '4px', marginTop: '4px', cursor: 'pointer' } });
    this.timeLbl = h('span', { style: { minWidth: '120px' } });
    this.playBtn = btn('Pause', () => this.togglePlay());
    mid.append(this.tl, h('div', { cls: 'ed-row' }, this.playBtn, btn('Prev key', () => this.stepKey(-1), { title: 'previous key' }), btn('Next key', () => this.stepKey(1), { title: 'next key' }), btn('−frame', () => this.nudge(-1 / 30)), btn('+frame', () => this.nudge(1 / 30)), this.timeLbl,
      h('span', { cls: 'ed-hint' }, 'drag = orbit · right-drag = pan · wheel = zoom · click a joint to select it · drag a key marker to retime')));
    // ---- right: clip + bone
    this.right = h('div', { cls: 'ed-col', style: { width: '320px', flex: 'none', overflow: 'auto' } });
    this.win.body.append(h('div', { cls: 'ed-cols' }, left, mid, this.right));
    this.marker = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb020, depthTest: false })); this.marker.renderOrder = 99;
    this.setModel(0); this.select('walk');
    this.vp.onFrame = (dt) => this.frame(dt); this.vp.onPointer = (k, e) => this.pointer(k, e);
    this.bindTimeline(); this.listT = setInterval(() => this.fillList(), 1000);
  }
  specOptions() {
    const out = []; const P = this.g.player?.ch?.spec; if (P) out.push({ label: 'Player (' + (P.name || P.key || 'hero') + ')', spec: P });
    for (const [k, s] of Object.entries(HEROES)) out.push({ label: 'Hero: ' + k, spec: s });
    const C = this.g.crowd?.specs || []; for (let i = 0; i < Math.min(C.length, 24); i++) out.push({ label: `NPC ${i + 1}: ${C[i].label || C[i].preset} (${C[i].sex})`, spec: C[i] });
    this.specs = out; return out;
  }
  setModel(i) {
    if (this.ch) { this.vp.scene.remove(this.ch.root); this.ch.dispose(); }
    this.ch = new Character(this.specs[i].spec); this.vp.scene.add(this.ch.root); this.ch.root.traverse((o) => { o.frustumCulled = false; });
    ANIM.force = { ch: this.ch, key: this.key, t: null }; this.restart(); this.attachMarker();
  }
  // ---- list of animations: known states ∪ seen this session ∪ live now ∪ edited
  fillList() {
    const live = liveStates(); const keys = [...new Set([...KNOWN, ...ANIM.seen.keys(), ...live.keys(), ...Object.keys(ANIM.clips)])].filter((k) => k.includes(this.search.value.trim()));
    const sel = this.key; this.list.replaceChildren(...keys.map((k) => { const d = h('div', { cls: k === sel ? 'sel' : '', onclick: () => this.select(k) }, (ANIM.clips[k] ? '* ' : '') + k, live.get(k) ? h('small', {}, String(live.get(k))) : null); return d; }));
  }
  select(key) { this.key = key; this.clip = ANIM.clips[key] || null; if (ANIM.force) ANIM.force.key = key; this.restart(); this.fillList(); this.buildRight(); }
  ensureClip() { if (!this.clip) { this.clip = ANIM.clips[this.key] = newClip(this.key); this.fillList(); } return this.clip; }
  get len() { return this.clip ? this.clip.length : LOCO.includes(this.key) && this.key !== 'idle' ? 1 : 2; }
  // ---- right panel
  buildRight() {
    const R = this.right; R.replaceChildren(); const c = this.clip;
    R.append(h('div', { style: { fontWeight: 600, color: '#e0a030', margin: '2px 0 6px' } }, 'Animation: ' + this.key),
      h('div', { cls: 'ed-hint' }, LOCO.includes(this.key) && this.key !== 'idle' ? 'Locomotion: time is one stride (0 → length = one full gait cycle).' : 'Time in seconds from the start of the animation.'));
    if (!c) { R.append(btn('Create override for this animation', () => { this.ensureClip(); this.buildRight(); }), h('div', { cls: 'ed-hint' }, 'Or just move a slider below — a clip is created automatically.')); }
    else R.append(section('Clip', true,
      select('Mode', [['add', 'Add to the game pose'], ['replace', 'Replace the game pose']], c.mode, (v) => { c.mode = v; this.buildRight(); }),
      num('Weight', c.weight, { min: 0, max: 1.5, step: 0.01 }, (v) => { c.weight = v; }), num('Time scale', c.speed ?? 1, { min: 0.1, max: 3, step: 0.01 }, (v) => { c.speed = v; }),
      num('Length', c.length, { min: 0.1, max: 20, step: 0.05 }, (v) => { c.length = v; }), check('Loop', c.loop, (v) => { c.loop = v; }), check('Disabled', !!c.off, (v) => { c.off = v; }),
      h('div', { cls: 'ed-tabs' }, btn('Bake game pose → keys', () => this.bake(), { title: 'sample the procedural pose into keys (replace mode starting point)' }), btn('Mirror L/R', () => this.mirror()), btn('Delete clip', () => { delete ANIM.clips[this.key]; this.clip = null; this.buildRight(); this.fillList(); }, { cls: 'warn' }))));
    // bones
    const bl = h('div', { cls: 'ed-list', style: { maxHeight: '150px' } }, BONE_LIST.map((b) => h('div', { cls: b === this.bone ? 'sel' : '', onclick: () => { this.bone = b; this.attachMarker(); this.buildRight(); } }, b, c && c.tracks[b] && c.tracks[b].length ? h('small', {}, c.tracks[b].length + ' keys') : null)));
    const hip = this.bone === 'hipPos', v = this.valueAt(this.bone, this.t); const rng = hip ? { min: -0.6, max: 0.6, step: 0.001 } : { min: -PI, max: PI, step: 0.001 };
    this.sl = ['x', 'y', 'z'].map((ax) => num((hip ? 'Offset ' : 'Rotate ') + ax.toUpperCase() + (hip ? ' (m)' : ' (rad)'), v[ax], rng, (val) => this.setKey(ax, val)));
    const sc = (c && c.scale && c.scale[this.bone]) || [1, 1, 1];
    R.append(section('Bones', true, bl,
      h('div', { cls: 'ed-hint' }, c && c.mode === 'replace' ? 'Replace mode: values are the absolute joint angles.' : 'Add mode: values are added to what the game does.'), ...this.sl,
      h('div', { cls: 'ed-tabs' }, btn('Key all bones here', () => this.keyAll()), btn('Delete key', () => this.delKey()), btn('Clear bone', () => { if (this.clip) { delete this.clip.tracks[this.bone]; this.buildRight(); } }), btn('Copy pose', () => this.copyPose()), btn('Paste pose', () => this.pastePose())),
      hip ? null : section('Bone scale (this animation)', false, ...[0, 1, 2].map((i) => num('Scale ' + 'XYZ'[i], sc[i], { min: 0.3, max: 2.5, step: 0.01 }, (val) => { const cl = this.ensureClip(); cl.scale ||= {}; const s = (cl.scale[this.bone] ||= [1, 1, 1]); s[i] = val; })))));
    R.append(section('File', true, h('div', { cls: 'ed-tabs' },
      btn('Save (applies in game)', async () => { await saveAnims(); toast('Animations saved — they now apply to every character'); }),
      btn('Export JSON', () => download('colombo-animations.json', JSON.stringify(ANIM.clips, null, 1))),
      btn('Import JSON', async () => { const f = await pickFile(); if (!f) return; try { Object.assign(ANIM.clips, JSON.parse(await f.text())); this.select(this.key); toast('Imported'); } catch (e) { toast('Bad file: ' + e.message); } }),
      btn('Revert to saved', async () => { await loadSavedAnims(); this.select(this.key); }))));
  }
  valueAt(bone, t) { const tr = this.clip && this.clip.tracks[bone]; const o = { x: 0, y: 0, z: 0 };
    if (tr && tr.length) return sample(tr, t, this.clip.length, this.clip.loop, o);
    if (this.clip && this.clip.mode === 'replace') { if (bone === 'hipPos') { const p = this.ch.bones.hips.position; return { x: p.x, y: p.y - this.ch.hipY, z: p.z }; } const r = this.ch.bones[bone].rotation; return { x: r.x, y: r.y, z: r.z }; }
    return o; }
  keyIndex(tr, t) { const eps = Math.max(0.01, this.len * 0.01); return tr.findIndex((k) => Math.abs(k.t - t) < eps); }
  setKey(ax, val) { const c = this.ensureClip(); const tr = (c.tracks[this.bone] ||= []); const t = this.t; let i = this.keyIndex(tr, t);
    if (i < 0) { const v = this.valueAt(this.bone, t); tr.push({ t, x: v.x, y: v.y, z: v.z }); tr.sort((a, b) => a.t - b.t); i = this.keyIndex(tr, t); }
    tr[i][ax] = val; this.pause(); this.drawTimeline(); }
  keyAll() { const c = this.ensureClip(); for (const b of BONE_LIST) { const v = this.valueAt(b, this.t); const tr = (c.tracks[b] ||= []); const i = this.keyIndex(tr, this.t); if (i >= 0) Object.assign(tr[i], v); else tr.push({ t: this.t, ...v }); tr.sort((a, b2) => a.t - b2.t); } this.buildRight(); }
  delKey() { const tr = this.clip && this.clip.tracks[this.bone]; if (!tr) return; const i = this.keyIndex(tr, this.t); if (i >= 0) tr.splice(i, 1); this.buildRight(); }
  copyPose() { this.copied = Object.fromEntries(BONE_LIST.map((b) => [b, this.valueAt(b, this.t)])); toast('Pose copied'); }
  pastePose() { if (!this.copied) return; const c = this.ensureClip(); for (const [b, v] of Object.entries(this.copied)) { const tr = (c.tracks[b] ||= []); const i = this.keyIndex(tr, this.t); if (i >= 0) Object.assign(tr[i], v); else tr.push({ t: this.t, ...v }); tr.sort((a, b2) => a.t - b2.t); } this.buildRight(); }
  mirror() { const c = this.clip; if (!c) return; const T = {}; for (const [b, tr] of Object.entries(c.tracks)) { const m = b.endsWith('L') ? b.slice(0, -1) + 'R' : b.endsWith('R') ? b.slice(0, -1) + 'L' : b; T[m] = tr.map((k) => ({ t: k.t, x: b === 'hipPos' ? -k.x : k.x, y: b === 'hipPos' ? k.y : -k.y, z: b === 'hipPos' ? k.z : -k.z })); } c.tracks = T; this.buildRight(); }
  // sample the game's own pose into keys (12 per loop) — a starting point for a full replacement
  bake() { const c = this.ensureClip(); const was = ANIM.enabled; ANIM.enabled = false; c.mode = 'replace'; c.tracks = {}; const a = this.ch.anim; const N = 12;
    for (let i = 0; i < 20; i++) this.drive(0.016); // settle speed / weights
    for (let k = 0; k < N; k++) { const t = k / N * c.length; this.seek(t); for (const b of BONE_LIST) { const v = b === 'hipPos' ? { x: this.ch.bones.hips.position.x, y: this.ch.bones.hips.position.y - this.ch.hipY, z: this.ch.bones.hips.position.z } : { x: this.ch.bones[b].rotation.x, y: this.ch.bones[b].rotation.y, z: this.ch.bones[b].rotation.z }; (c.tracks[b] ||= []).push({ t, ...v }); } }
    ANIM.enabled = was; void a; this.buildRight(); toast('Game pose baked into ' + N + ' keys per bone (replace mode)'); }
  // ---- driving the preview with the real Animator
  restart() { const a = this.ch?.anim; if (!a) return; a.set(null); a.fightOn?.(false, true); a.standUp?.(); this.t = 0; const k = this.key;
    if (k.startsWith('seated')) { try { a.sitIn({ x: 0, y: 0.46, z: 0, floor: 0, roof: 1.6, yaw: 0 }, 1, k.split(':')[1] || null); } catch { a.standUp(); } }
    else if (k === 'fight' || k.startsWith('fight:') || k.startsWith('hit:')) a.fightOn(true);
    else if (!LOCO.includes(k)) a.set(k); }
  drive(dt) { const a = this.ch.anim, k = this.key;
    if (k.startsWith('fight:') && a.fight && !a.fight.move) a.strike(k.slice(6));
    if (k.startsWith('hit:') && a.fight && !a.fight.react) a.takeHit(k.slice(4), 1, 1);
    if (!LOCO.includes(k) && !k.startsWith('seated') && !k.startsWith('fight') && !k.startsWith('hit') && a.action !== k) a.set(k);
    a.update(dt, SPEED[k] ?? 0, 0); }
  seek(t) { const a = this.ch.anim, k = this.key; this.t = t; ANIM.force.t = t;
    if (LOCO.includes(k)) { if (k !== 'idle') a.cyc = (t / this.len) % 1; } else if (!k.startsWith('fight') && !k.startsWith('hit')) a.actionT = t;
    a.update(0, SPEED[k] ?? 0, 0); }
  frame(dt) {
    if (!this.ch) return; const L = this.len, k = this.key; const a = this.ch.anim;
    if (this.playing) { ANIM.force.t = null; this.drive(dt); const sp = this.clip?.speed ?? 1;
      if (LOCO.includes(k)) this.t = k === 'idle' ? (a.t % L) : a.cyc * L; else if (k.startsWith('fight:')) this.t = a.fight?.mt || 0; else if (k.startsWith('hit:')) this.t = a.fight?.rt || 0; else { this.t = a.actionT; if (this.clip?.loop !== false && a.actionT > L) { a.actionT = 0; this.t = 0; } }
      void sp; }
    else this.seek(this.t);
    this.ch.root.updateMatrixWorld(true); this.timeLbl.textContent = `t = ${this.t.toFixed(2)} / ${L.toFixed(2)}`; this.drawTimeline();
    if (this.sl && !this.playing && this._slT !== this.t) { this._slT = this.t; const v = this.valueAt(this.bone, this.t); this.sl.forEach((s, i) => s.set(v['xyz'[i]])); }
  }
  togglePlay() { this.playing = !this.playing; this.playBtn.textContent = this.playing ? 'Pause' : 'Play'; if (this.playing) this.restartAt(); }
  pause() { if (this.playing) this.togglePlay(); }
  restartAt() { const a = this.ch.anim; if (!LOCO.includes(this.key) && !this.key.startsWith('fight') && !this.key.startsWith('hit')) a.actionT = this.t; }
  nudge(d) { this.pause(); this.t = Math.max(0, Math.min(this.len, this.t + d)); }
  stepKey(dir) { this.pause(); const ts = [...new Set(Object.values(this.clip?.tracks || {}).flat().map((k) => k.t))].sort((a, b) => a - b); const n = dir > 0 ? ts.find((t) => t > this.t + 1e-4) : [...ts].reverse().find((t) => t < this.t - 1e-4); if (n != null) this.t = n; }
  attachMarker() { this.marker.parent?.remove(this.marker); const b = this.ch?.bones[this.bone === 'hipPos' ? 'hips' : this.bone]; if (b) b.add(this.marker); }
  pointer(kind, e) {
    if (kind === 'down') { this._pd = [e.clientX, e.clientY]; return false; }
    if (kind === 'up' && this._pd && Math.hypot(e.clientX - this._pd[0], e.clientY - this._pd[1]) < 4) { // click: nearest joint on screen
      const r = this.vp.canvas.getBoundingClientRect(); let best = null, bd = 28; const v = new THREE.Vector3();
      for (const b of BONE_LIST) { const bone = this.ch.bones[b === 'hipPos' ? 'hips' : b]; if (!bone || b === 'hipPos') continue; bone.getWorldPosition(v).project(this.vp.camera); const sx = (v.x + 1) / 2 * r.width + r.left, sy = (1 - v.y) / 2 * r.height + r.top; const d = Math.hypot(sx - e.clientX, sy - e.clientY); if (d < bd) { bd = d; best = b; } }
      if (best) { this.bone = best; this.attachMarker(); this.buildRight(); } }
    return false;
  }
  // ---- timeline
  bindTimeline() { const cv = this.tl; let drag = null;
    const tAt = (e) => { const r = cv.getBoundingClientRect(); return Math.max(0, Math.min(this.len, (e.clientX - r.left - 8) / (r.width - 16) * this.len)); };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); this.pause(); const t = tAt(e); const tr = this.clip?.tracks[this.bone]; const r = cv.getBoundingClientRect();
      const hit = tr && (e.clientY - r.top) < 46 ? tr.find((k) => Math.abs(k.t - t) < this.len * 0.02) : null; drag = hit ? { key: hit } : { scrub: true }; if (!hit) this.t = t; });
    cv.addEventListener('pointermove', (e) => { if (!drag) return; const t = tAt(e); if (drag.key) { drag.key.t = t; this.clip.tracks[this.bone].sort((a, b) => a.t - b.t); } else this.t = t; });
    cv.addEventListener('pointerup', () => { drag = null; }); }
  drawTimeline() {
    const cv = this.tl, r = cv.getBoundingClientRect(); if (r.width < 10) return; if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) { cv.width = Math.round(r.width); cv.height = Math.round(r.height); }
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, L = this.len, X = (t) => 8 + t / L * (W - 16); g.clearRect(0, 0, W, H);
    g.fillStyle = '#8a93a0'; g.font = '10px system-ui'; for (let i = 0; i <= 10; i++) { const x = X(i / 10 * L); g.fillRect(x, H - 14, 1, 5); g.fillText((i / 10 * L).toFixed(L < 3 ? 2 : 1), x + 2, H - 3); }
    g.fillStyle = '#1d222c'; g.fillRect(0, 8, W, 30); g.fillStyle = '#e0a030'; g.fillText(this.bone, 10, 20);
    const c = this.clip; if (c) { for (const [b, tr] of Object.entries(c.tracks)) for (const k of tr) { g.fillStyle = b === this.bone ? '#ffb020' : '#5a6578'; const x = X(k.t), y = b === this.bone ? 23 : 48; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.fill(); } }
    g.fillStyle = '#ff5050'; g.fillRect(X(this.t) - 1, 0, 2, H - 16);
  }
  dispose() { clearInterval(this.listT); ANIM.force = null; if (this.ch) { this.ch.dispose(); } this.vp.dispose(); if (!this.win.closed) this.win.close(); ed = null; }
}
export function current() { return ed; } // tests / console inspection
