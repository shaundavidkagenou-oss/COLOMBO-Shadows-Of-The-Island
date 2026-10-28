// Nine-weapon system for Kavindu: inventory, wheel, draw/holster, aim (over-the-shoulder / scope), fire, recoil, reload,
// effects, hit detection and the non-graphic reactions it triggers in the crowd. Hands are placed on each weapon by
// two-bone IK (Animator.ik) using the grip/support points exposed by the model, so every animation keeps both hands on it.
import * as THREE from 'three';
import { Input } from '../core/Input.js';
import { Settings } from '../core/Settings.js';
import { clamp, lerp } from '../core/math.js';
import { Audio } from '../audio/Audio.js';
import { buildWeaponModel, weaponMaterials } from './WeaponModels.js';
import * as L from '../world/Layout.js';

// cls: pistol | rifle | sniper. rof = rounds/second; spread in radians; recoil = camera kick (rad); dmg: 1.5+ incapacitates in one hit
export const WEAPONS = [
  { id: 'compact', name: 'Compact Pistol', cls: 'pistol', size: 0.86, mag: 10, reserve: 60, rof: 5.5, auto: false, dmg: 0.6, spread: 0.012, bloom: 0.012, recoil: 0.018, reload: 1.25, range: 60, equip: 0.42, loud: 45, snd: { crack: 3200, body: 170, dur: 0.1, vol: 0.4, tail: 0.25 } },
  { id: 'service', name: 'Service Pistol', cls: 'pistol', size: 1.0, mag: 15, reserve: 90, rof: 4.5, auto: false, dmg: 0.75, spread: 0.009, bloom: 0.011, recoil: 0.024, reload: 1.4, range: 70, equip: 0.45, loud: 55, snd: { crack: 2700, body: 140, dur: 0.12, vol: 0.48, tail: 0.3 } },
  { id: 'heavy', name: 'Heavy Pistol', cls: 'pistol', size: 1.12, mag: 8, reserve: 48, rof: 2.6, auto: false, dmg: 1.2, spread: 0.008, bloom: 0.02, recoil: 0.055, reload: 1.7, range: 80, equip: 0.5, loud: 70, snd: { crack: 1900, body: 95, dur: 0.18, vol: 0.62, tail: 0.45 } },
  { id: 'carbine', name: 'Carbine Rifle', cls: 'rifle', mag: 30, reserve: 180, rof: 11, auto: true, dmg: 0.6, spread: 0.006, bloom: 0.004, recoil: 0.012, reload: 2.1, range: 160, equip: 0.7, loud: 90, snd: { crack: 2300, body: 110, dur: 0.14, vol: 0.55, tail: 0.5 } },
  { id: 'assault', name: 'Assault Rifle', cls: 'rifle', mag: 30, reserve: 180, rof: 9.5, auto: true, dmg: 0.75, spread: 0.008, bloom: 0.006, recoil: 0.017, reload: 2.4, range: 150, equip: 0.75, loud: 95, snd: { crack: 1800, body: 90, dur: 0.16, vol: 0.6, tail: 0.55 } },
  { id: 'battle', name: 'Battle Rifle', cls: 'rifle', mag: 20, reserve: 120, rof: 6, auto: true, dmg: 1.05, spread: 0.005, bloom: 0.009, recoil: 0.03, reload: 2.6, range: 200, equip: 0.8, loud: 110, snd: { crack: 1500, body: 75, dur: 0.2, vol: 0.7, tail: 0.7 } },
  { id: 'bolt', name: 'Bolt-Action Sniper', cls: 'sniper', mag: 5, reserve: 30, rof: 0.75, auto: false, dmg: 3, spread: 0.0008, bloom: 0, recoil: 0.07, reload: 2.9, range: 600, equip: 0.9, loud: 140, zoom: 5, sway: 1, cycle: 0.95, snd: { crack: 1200, body: 55, dur: 0.32, vol: 0.85, tail: 1.3 } },
  { id: 'semi', name: 'Semi-Auto Sniper', cls: 'sniper', mag: 10, reserve: 50, rof: 2.4, auto: false, dmg: 1.6, spread: 0.0015, bloom: 0.003, recoil: 0.05, reload: 2.6, range: 500, equip: 0.85, loud: 130, zoom: 4, sway: 1.2, snd: { crack: 1400, body: 65, dur: 0.26, vol: 0.78, tail: 1.0 } },
  { id: 'precision', name: 'Precision Sniper', cls: 'sniper', mag: 7, reserve: 35, rof: 1.1, auto: false, dmg: 2.5, spread: 0.0005, bloom: 0, recoil: 0.06, reload: 3.0, range: 800, equip: 0.95, loud: 140, zoom: 7, sway: 0.55, cycle: 0.7, snd: { crack: 1100, body: 50, dur: 0.36, vol: 0.9, tail: 1.5 } },
];

const sm = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
const seg = (k, a, b) => clamp((k - a) / (b - a), 0, 1);
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const qE = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
const Q_GRIP = qE(-0.8, 0, 0), /* firing hand: palm on the grip side, fingers wrap down-forward, thumb up along the frame (rest frame: fingers −y, palm inward, thumb +z) */ Q_SUP_R = qE(0.1, 0, -Math.PI / 2), Q_SUP_P = qE(-0.5, 0.3, -Math.PI / 2);

// hold poses in "body space at the chest" (chest frame with the stance twist removed). Rifles/snipers: the support point is
// placed at a reachable spot and the rest of the weapon follows, so long and short guns both sit right in the hands.
// right-shoulder pocket in body space (character faces +z, its right side is −x); tuned with tools in dev (see weapon pose test)
const POCKET = new THREE.Vector3(-0.11, 0.1, 0.07);
// low ready for long guns: pivot muzzle-down about the shoulder pocket (no cross-body yaw → the stock can't swing through the chest)
function lowReady(ud) { const rot = [0.6, 0.06, 0.18]; const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')); const butt = new THREE.Vector3(POCKET.x - 0.02, POCKET.y - 0.03, POCKET.z); const back = new THREE.Vector3(0, 0, ud.buttZ).applyQuaternion(q); return { pos: butt.sub(back), rot }; }
function aimPose(def, ud) {
  if (def.cls === 'pistol') return { pos: new THREE.Vector3(-0.03, 0.2, 0.44), twist: 0.12 }; // arms extended, sights at eye line
  // long guns: the butt (rearmost point of the model) sits IN FRONT of the right shoulder, never inside the torso
  const sup = ud.support; return { pos: new THREE.Vector3(POCKET.x, POCKET.y - sup.y, POCKET.z - ud.buttZ), twist: 0.5 }; // bladed stance: left shoulder forward
}

export class Weapons {
  constructor(game) {
    this.g = game; this.P = game.player; this.inv = WEAPONS.map((d) => ({ mag: d.mag, reserve: d.reserve, owned: true }));
    this.models = WEAPONS.map((d) => buildWeaponModel(d)); for (const m of this.models) { m.updateMatrixWorld(true); m.userData.buttZ = new THREE.Box3().setFromObject(m).min.z; } // rear end of the stock (grip-origin space) this.cur = -1; this.sel = 0; this.state = 'none'; this.t = 0; this.next = -1;
    this.aimW = 0; this.bloom = 0; this.cool = 0; this.recoil = 0; this.recoilYaw = 0; this.quickAim = 0; this.scoped = false; this.breath = 1; this.heat = 0; this.heatT = 0; this.shotAlarm = 0; this.threatT = 0;
    this.wheelOpen = false; this.wheelSel = -1; this.wheelX = 0; this.wheelY = 0; this.cycleT = -1; this.reloadMagOut = false;
    this.holsterP = new THREE.Group(); this.holsterR = new THREE.Group(); // hip holster (hips bone) and back sling (chest bone)
    this.holsterP.position.set(-0.2, -0.06, 0.03); this.holsterP.rotation.set(Math.PI / 2 - 0.15, 0, 0.1);
    this.holsterR.position.set(0.02, 0.06, -0.17); this.holsterR.rotation.set(-Math.PI / 2 + 0.25, Math.PI, 0.75);
    this.inHand = new THREE.Group(); this.inHand.matrixAutoUpdate = false; this.attach(this.P.ch);
    for (const m of this.models) m.visible = false;
    this.fxInit(); this.hudInit(); this.showHolstered();
  }
  attach(ch) { const b = ch.bones; b.hips.add(this.holsterP); b.chest.add(this.holsterR); b.chest.add(this.inHand); if (this.P.ch !== ch) { ch.anim.ik = null; ch.anim.aim = null; } }
  get def() { return this.cur >= 0 ? WEAPONS[this.cur] : null; }
  get drawn() { return this.cur >= 0 && this.state !== 'none'; }
  get aiming() { return this.aimW > 0.5 && this.drawn; }

  // ------------------------------------------------------------------ helpers
  showHolstered() { // the selected weapon rides in its holster/sling when not in the hands
    for (let i = 0; i < 9; i++) { const m = this.models[i]; if (i === this.sel && this.state === 'none') { const slot = WEAPONS[i].cls === 'pistol' ? this.holsterP : this.holsterR; if (m.parent !== slot) slot.add(m); m.position.set(0, 0, 0); m.quaternion.identity(); m.visible = true; m.matrixAutoUpdate = true; } else if (i !== this.cur || this.state === 'none') { if (i !== this.sel) m.visible = false; } }
  }
  slotMatrixInChest(i, out) { const b = this.P.ch.bones; const slot = WEAPONS[i].cls === 'pistol' ? this.holsterP : this.holsterR; b.chest.updateWorldMatrix(true, false); slot.updateWorldMatrix(true, false); return out.copy(b.chest.matrixWorld).invert().multiply(slot.matrixWorld); }
  select(i) {
    if (i < 0 || i > 8 || !this.inv[i].owned) return; if (this.state === 'reload') this.abortReload();
    if (this.state === 'holster') { this.next = i; this.hudWeapon(i); return; } // already putting one away: retarget, never restart the animation
    if (this.cur === i) return;
    if (this.drawn) { this.next = i; this.setState('holster'); } else { this.sel = i; this.cur = i; this.setState('equip'); }
    this.hudWeapon(i);
  }
  holster() { if (this.drawn && this.state !== 'holster') { this.next = -1; if (this.state === 'reload') this.abortReload(); this.setState('holster'); } }
  setState(s) { this.state = s; this.t = 0; if (s === 'holster' || s === 'none') this.wantReload = false; }
  forceHolster() { // interruption (vehicle, cutscene, interior swap): put it away immediately, never leave hands locked
    if (this.cur >= 0) { this.models[this.cur].visible = false; if (this.state === 'reload') this.abortReload(true); }
    this.cur = -1; this.state = 'none'; this.aimW = 0; this.scoped = false; this.cycleT = -1; const A = this.P.ch.anim; A.ik = null; A.aim = null; this.P.aiming = false; this.setScope(false); this.showHolstered();
  }
  abortReload(silent) { const ud = this.models[this.cur].userData; ud.mag.position.set(0, 0, 0); ud.mag.visible = true; if (this.reloadMagOut && !silent) { /* mag was already out: the reload completes on next draw */ } this.reloadMagOut = false; if (this.state === 'reload') this.setState('ready'); }

  // ------------------------------------------------------------------ main update (before Player.update)
  update(dt, can) {
    const P = this.P, A = P.ch.anim;
    this.heatUpdate(dt);
    if (!can || P.vehicle || P.entry || P.exiting || P.climb || P.indoor) { if (this.drawn || this.state !== 'none') this.forceHolster(); else { A.ik = null; A.aim = null; } this.wheelClose(false); this.hudUpdate(dt); this.fxUpdate(dt); return; }
    // ---- selection: wheel (hold Tab), number keys, mouse wheel, gamepad d-pad
    if (Input.isDown('weaponWheel')) this.wheelUpdate(); else if (this.wheelOpen) this.wheelClose(true);
    if (!this.wheelOpen) {
      for (let i = 0; i < 9; i++) if (Input.keyPressed('Digit' + (i + 1)) || Input.keyPressed('Numpad' + (i + 1))) this.select(i);
      // mouse wheel / d-pad: step a pending target through OWNED weapons; commit once the wheel settles (fast scrolling = one clean switch)
      const step = Input.wheel && !this.scoped ? (Input.wheel > 0 ? 1 : -1) : Input.pad.buttons[15] && !Input.pad.prev[15] ? 1 : Input.pad.buttons[14] && !Input.pad.prev[14] ? -1 : 0;
      if (step) { const from = this.scrollTarget ?? (this.state === 'holster' && this.next >= 0 ? this.next : this.cur >= 0 ? this.cur : this.sel); let j = from; for (let k = 0; k < 9; k++) { j = (j + step + 9) % 9; if (this.inv[j].owned) break; } this.scrollTarget = j; this.scrollT = 0.2; this.hudWeapon(j); }
      if (this.scrollTarget != null) { this.scrollT -= dt; if (this.scrollT <= 0) { const j = this.scrollTarget; this.scrollTarget = null; this.select(j); } }
      if (Input.wasPressed('holster') || (Input.pad.buttons[12] && !Input.pad.prev[12] && this.drawn)) { if (this.drawn) this.holster(); else this.select(this.sel); }
    }
    let def = this.def;
    const aimHeld = !this.wheelOpen && (Input.mouseButtons.has(2) || Input.pad.lt > 0.4); const fireHeld = !this.wheelOpen && (Input.mouseButtons.has(0) || Input.pad.rt > 0.4); const firePressed = !this.wheelOpen && (Input.mousePressed.has(0) || (Input.pad.rt > 0.4 && !this._rtPrev)); this._rtPrev = Input.pad.rt > 0.4;
    if (!this.drawn && firePressed && !P.sprinting && this.inv[this.sel].owned && Settings.get('fireDraws') !== false) { /* first click draws the weapon */ this.select(this.sel); }
    this.t += dt; this.cool = Math.max(0, this.cool - dt); this.bloom = Math.max(0, this.bloom - dt * (def && def.cls === 'sniper' ? 0.02 : 0.06)); this.recoil = Math.max(0, this.recoil - dt * 9 * (this.recoil + 0.02)); this.quickAim = Math.max(0, this.quickAim - dt);
    if (this.state === 'equip' && this.t >= def.equip) this.setState('ready');
    if (this.state === 'holster' && this.t >= def.equip * 0.85) { this.models[this.cur].visible = false; const n = this.next; this.cur = -1; this.state = 'none'; A.ik = null; A.aim = null; if (n >= 0) { this.sel = n; this.cur = n; this.setState('equip'); } this.showHolstered(); }
    if (this.state === 'reload' && this.t >= def.reload) { const iv = this.inv[this.cur]; const take = Math.min(def.mag - iv.mag, iv.reserve); iv.mag += take; iv.reserve -= take; this.reloadMagOut = false; this.setState('ready'); }
    def = this.def;
    if (!def) { P.aiming = false; this.setScope(false); this.hudUpdate(dt); this.fxUpdate(dt); return; }
    // ---- aim
    const wantAim = (aimHeld || this.quickAim > 0) && (this.state === 'ready' || this.state === 'reload' || this.state === 'equip') && !P.sprinting;
    this.aimW = clamp(this.aimW + (wantAim ? dt * (def.cls === 'pistol' ? 7 : 5) : -dt * 6), 0, 1);
    P.aiming = this.aimW > 0.05; P.aimW = this.aimW;
    this.setScope(def.cls === 'sniper' && aimHeld && this.aimW > 0.9 && this.state === 'ready' && this.cycleT < 0);
    // ---- reload
    const iv = this.inv[this.cur];
    if (Input.wasPressed('reload') || (Input.pad.buttons[13] && !Input.pad.prev[13])) this.wantReload = true; // queued: honoured once the bolt / draw finishes
    if (this.wantReload && this.state === 'ready' && this.cycleT < 0) { this.wantReload = false; if (iv.mag < def.mag && iv.reserve > 0) { this.setState('reload'); this.reloadSnd(def); } }
    // ---- fire
    if (this.state === 'ready' && this.cycleT < 0) {
      const trig = def.auto ? fireHeld : firePressed;
      if (trig && this.aimW < 0.8) { this.quickAim = 0.5; }
      else if (trig && this.cool <= 0) {
        if (iv.mag > 0) { this.fire(def); iv.mag--; this.cool = 1 / def.rof; if (def.cycle && iv.mag > 0) this.cycleT = 0; if (iv.mag === 0 && iv.reserve > 0 && Settings.get('autoReload') !== false) { this.autoReloadT = 0.35; } }
        else if (firePressed) { Audio.tone(1800, 0.03, { type: 'square', vol: 0.06 }); this.cool = 0.25; if (iv.reserve > 0) { this.setState('reload'); this.reloadSnd(def); } else this.hudFlash('No ammunition'); }
      }
      if (fireHeld || aimHeld) this.quickAim = Math.max(this.quickAim, aimHeld ? 0 : 0.6);
    }
    if (this.autoReloadT !== undefined && this.autoReloadT > 0) { this.autoReloadT -= dt; if (this.autoReloadT <= 0 && this.state === 'ready') { this.setState('reload'); this.reloadSnd(def); } }
    if (this.cycleT >= 0) { const was = this.cycleT; this.cycleT += dt; if (was < def.cycle * 0.5 && this.cycleT >= def.cycle * 0.5) { this.ejectShell(); Audio.noise(0.05, { f: 2200, q: 3, vol: 0.08, when: 0 }); Audio.noise(0.06, { f: 1500, q: 3, vol: 0.07, when: 0.12 }); } if (this.cycleT >= def.cycle) this.cycleT = -1; }
    // ---- point a weapon at someone: they react (hands up / back away / run) — non-graphic
    this.threatT -= dt; if (this.aimW > 0.8 && this.threatT <= 0) { this.threatT = 0.35; const hit = this.pickPed(70); if (hit && this.g.crowd.threaten) this.g.crowd.threaten(hit.p, P); }
    this.pose(dt, def);
    this.hudUpdate(dt); this.fxUpdate(dt);
  }

  // ------------------------------------------------------------------ pose + IK
  pose(dt, def) {
    const P = this.P, A = P.ch.anim, m = this.models[this.cur], ud = m.userData; const k = this.t; const twoHand = def.cls !== 'pistol';
    for (let i = 0; i < 9; i++) if (i !== this.cur) this.models[i].visible = false; // only the weapon in use is on the body
    const pitch = clamp(-(P.camPitch - 0.12) * 1.15, -1.0, 1.1); // camera pitch → aim pitch (positive = up)
    const ap = aimPose(def, ud); const aw = sm(this.aimW);
    A.aim = { pitch: pitch * aw + (twoHand ? -0.05 : 0) * (1 - aw), twist: (twoHand ? ap.twist : ap.twist * aw), w: Math.max(aw, twoHand ? 0.65 : 0.3), headDown: twoHand ? 0.12 * aw : 0 };
    // body space → chest space: undo the stance twist so the weapon points straight ahead of the body
    const twist = A.aim.twist; const toChest = _m2.makeRotationY(twist);
    // ready (low) pose and aim pose
    const low = def.cls === 'pistol' ? { pos: new THREE.Vector3(-0.1, -0.12, 0.3), rot: [0.75, 0.1, 0] } : lowReady(ud);
    let pos = new THREE.Vector3().lerpVectors(low.pos, ap.pos, aw); let rx = lerp(low.rot[0], 0, aw), ry = lerp(low.rot[1], 0, aw), rz = lerp(low.rot[2], 0, aw);
    if (P.sprinting && this.aimW < 0.1) { rx += 0.25; ry += twoHand ? 0.35 : 0; pos.y -= 0.03; }
    // recoil kick
    pos.z -= this.recoil * (def.cls === 'pistol' ? 0.6 : 0.9); pos.y += this.recoil * 0.15; rx -= this.recoil * (def.cls === 'pistol' ? 6 : 3.5); ry += this.recoilYaw * this.recoil * 2;
    // reload / bolt choreography (weapon offsets + support-hand path)
    let supTarget = null, supW = twoHand ? 1 : aw, gripTarget = null; const magL = ud.mag; magL.visible = true; magL.position.set(0, 0, 0); if (ud.slide) ud.slide.position.set(0, 0, 0); if (ud.bolt) ud.bolt.rotation.set(0, 0, 0);
    if (this.state === 'reload') {
      const r = k / def.reload; supW = 1;
      rx += -0.35 * sm(seg(r, 0, 0.15)) * (1 - sm(seg(r, 0.85, 1))); rz += 0.45 * sm(seg(r, 0, 0.15)) * (1 - sm(seg(r, 0.85, 1))); pos.x += 0.06 * sm(seg(r, 0, 0.15)) * (1 - sm(seg(r, 0.85, 1))); pos.y += 0.04 * sm(seg(r, 0, 0.15)) * (1 - sm(seg(r, 0.85, 1)));
      const pouch = new THREE.Vector3(0.12, -0.36, 0.08); // belt pouch, body space
      if (r < 0.32) { magL.position.y = -0.3 * sm(seg(r, 0.12, 0.3)); magL.visible = r < 0.28; if (r > 0.13) this.reloadMagOut = true; }
      const wellBody = (local) => local.clone().applyMatrix4(this._weaponBody || new THREE.Matrix4());
      if (r >= 0.15 && r < 0.42) { supTarget = 'pouch'; this._sup = pouch.clone().lerp(pouch, 1); this._supK = sm(seg(r, 0.15, 0.35)); }
      else if (r >= 0.42 && r < 0.78) { supTarget = 'well'; this._supK = sm(seg(r, 0.42, 0.66)); magL.visible = true; }
      else if (r >= 0.78 && r < 0.95) { supTarget = 'rack'; this._supK = sm(seg(r, 0.78, 0.85)); if (ud.slide) ud.slide.position.z = -0.035 * Math.sin(seg(r, 0.84, 0.94) * Math.PI); }
      if (r >= 0.45 && r < 0.62) { if (!this._snd2) { this._snd2 = 1; Audio.noise(0.05, { f: 1200, q: 2, vol: 0.09 }); } } else if (r < 0.45) this._snd2 = 0;
      this._reloadR = r;
    }
    if (this.cycleT >= 0 && def.cycle) { const c = this.cycleT / def.cycle; gripTarget = 'bolt'; this._cycK = c; if (ud.bolt) { ud.bolt.rotation.z = -0.9 * sm(seg(c, 0.25, 0.35)) * (1 - sm(seg(c, 0.68, 0.78))); ud.bolt.position.z = -0.075 * sm(seg(c, 0.36, 0.5)) * (1 - sm(seg(c, 0.55, 0.68))); } rx -= 0.08 * Math.sin(c * Math.PI); }
    // weapon matrix (body space), then chest space
    const wq = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
    const body = new THREE.Matrix4().compose(pos, wq, new THREE.Vector3(1, 1, 1)); this._weaponBody = body;
    let chestM = new THREE.Matrix4().multiplyMatrices(toChest, body);
    // draw / holster: blend between the holster slot and the hands
    let handOnly = 0; // 0 = weapon in hand pose, 1 = weapon still in holster (hand reaching)
    if (this.state === 'equip' || this.state === 'holster') {
      const E = def.equip; const u = this.state === 'equip' ? k / E : 1 - k / (E * 0.85); const slot = this.slotMatrixInChest(this.cur, new THREE.Matrix4());
      const reach = sm(seg(u, 0, 0.38)); const travel = sm(seg(u, 0.38, 1));
      if (u < 0.38) { handOnly = 1; this._reach = reach; } else { const a = new THREE.Vector3(), aq = new THREE.Quaternion(), b = new THREE.Vector3(), bq = new THREE.Quaternion(), sc = new THREE.Vector3(); slot.decompose(a, aq, sc); chestM.decompose(b, bq, sc); chestM = new THREE.Matrix4().compose(a.lerp(b, travel), aq.slerp(bq, travel), new THREE.Vector3(1, 1, 1)); }
      supW = twoHand ? sm(seg(u, 0.7, 1)) : supW * sm(seg(u, 0.8, 1));
      if (this.state === 'equip' && k < dt * 1.5) Audio.noise(0.12, { f: 700, q: 0.8, vol: 0.06 });
      if (handOnly) { const slotM = slot; if (m.parent !== (def.cls === 'pistol' ? this.holsterP : this.holsterR)) { (def.cls === 'pistol' ? this.holsterP : this.holsterR).add(m); m.matrixAutoUpdate = true; m.position.set(0, 0, 0); m.quaternion.identity(); } m.visible = true;
        const g = new THREE.Vector3(0, 0, 0).applyMatrix4(slotM); A.ik = { R: g, qR: new THREE.Quaternion().setFromRotationMatrix(slotM).multiply(Q_GRIP), wR: this._reach, L: null };
        return; }
    }
    if (m.parent !== this.inHand) { this.inHand.add(m); }
    m.matrixAutoUpdate = false; m.matrix.copy(chestM); m.matrixWorldNeedsUpdate = true; m.visible = true; this.inHand.matrix.identity();
    const wQ = new THREE.Quaternion().setFromRotationMatrix(chestM);
    const grip = new THREE.Vector3(0, 0, 0).applyMatrix4(chestM); let qR = wQ.clone().multiply(Q_GRIP);
    let sup = ud.support.clone().applyMatrix4(chestM); let qL = wQ.clone().multiply(twoHand ? Q_SUP_R : Q_SUP_P);
    if (twoHand) { // support hand: slide back along the forend to the furthest point the left arm can really reach (no floating hand)
      const b = P.ch.bones; b.shL.updateMatrix(); const sh = b.armL.position.clone().applyMatrix4(b.shL.matrix); const armMax = (b.foreL.position.length() + b.handL.position.length()) * 0.98 + 0.05;
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(wQ); let slide = 0; for (let it = 0; it < 6 && slide < 0.24; it++) { const d = sup.distanceTo(sh); if (d <= armMax) break; slide = Math.min(0.24, slide + (d - armMax) * 1.05); sup = ud.support.clone().applyMatrix4(chestM).addScaledVector(dir, -slide); }
      this._supSlide = slide; }
    const pouchChest = new THREE.Vector3(0.12, -0.36, 0.08).applyMatrix4(toChest);
    if (supTarget === 'pouch') { sup = sup.clone().lerp(pouchChest, this._supK); }
    else if (supTarget === 'well') { const well = ud.magWell.clone().applyMatrix4(chestM); const from = pouchChest; sup = from.clone().lerp(well, this._supK); // fresh magazine travels in the hand
      const inv = chestM.clone().invert(); const local = sup.clone().applyMatrix4(inv); const ins = sm(seg(this._reloadR, 0.66, 0.78)); magL.position.set(local.x - ud.magWell.x, (local.y - ud.magWell.y) * (1 - ins) + 0.03 * (1 - ins), (local.z - ud.magWell.z) * (1 - ins)); magL.visible = true; }
    else if (supTarget === 'rack') { const rk = ud.rack.clone().applyMatrix4(chestM); sup = sup.clone().lerp(rk, this._supK * (1 - sm(seg(this._reloadR, 0.92, 1)))); if (ud.slide && def.cls !== 'pistol') ud.slide.position.z = -0.05 * Math.sin(seg(this._reloadR, 0.84, 0.94) * Math.PI); }
    if (gripTarget === 'bolt') { const c = this._cycK; const bh = ud.rack.clone(); bh.z += ud.bolt ? ud.bolt.position.z : 0; bh.y += 0.012 * sm(seg(c, 0.25, 0.35)) * (1 - sm(seg(c, 0.68, 0.78))); const bw = bh.applyMatrix4(chestM); grip.lerp(bw, sm(seg(c, 0, 0.22)) * (1 - sm(seg(c, 0.8, 1)))); }
    A.ik = { R: grip, qR, wR: 1, L: supW > 0.01 ? sup : null, qL, wL: supW };
    if (!twoHand && supW < 0.99) A.ik.wL = supW; // pistol held one-handed at low ready
  }

  // ------------------------------------------------------------------ firing
  muzzleWorld(out) { const m = this.models[this.cur]; m.updateWorldMatrix(true, false); return out.copy(m.userData.muzzle).applyMatrix4(m.matrixWorld); }
  aimRay(spread) {
    const cam = this.g.camera; cam.updateMatrixWorld(); const o = cam.position.clone(); const d = new THREE.Vector3(); cam.getWorldDirection(d);
    if (spread > 0) { const r = Math.sqrt(Math.random()) * spread, a = Math.random() * Math.PI * 2; const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), rt = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion); d.addScaledVector(up, Math.sin(a) * r).addScaledVector(rt, Math.cos(a) * r).normalize(); }
    if (this.scoped) { const s = this.swayVec || { x: 0, y: 0 }; const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), rt = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion); d.addScaledVector(rt, s.x).addScaledVector(up, s.y).normalize(); }
    return { o, d };
  }
  // nearest hit along a ray: world geometry, pedestrians (capsules), vehicles (bounding circles)
  trace(o, d, range, skipNear = 0) {
    let best = { t: range, kind: 'none' };
    const s0 = o.clone().addScaledVector(d, skipNear), e = o.clone().addScaledVector(d, range); const tw = this.g.collision.raycast(s0.x, s0.y, s0.z, e.x, e.y, e.z, 0.02, true); if (tw < 1) best = { t: skipNear + tw * (range - skipNear), kind: 'world' };
    if (o.y + d.y * best.t < this.groundY(o.x + d.x * best.t, o.z + d.z * best.t)) { // hits the street before anything else
      const tg = d.y < -1e-4 ? (this.groundY(o.x, o.z) - o.y) / d.y : best.t; if (tg > 0 && tg < best.t) best = { t: tg, kind: 'ground' }; }
    for (const p of this.g.crowd.peds) {
      const rx = p.x - o.x, rz = p.z - o.z; const dh = Math.hypot(d.x, d.z) || 1e-6; const t = (rx * d.x + rz * d.z) / (dh * dh); if (t < skipNear || t > best.t) continue;
      const cx = o.x + d.x * t - p.x, cz = o.z + d.z * t - p.z; const down = p.state === 'down'; const rad = down ? 0.5 : 0.3; if (cx * cx + cz * cz > rad * rad) continue;
      const y = o.y + d.y * t - (p.y || 0); if (y < 0.05 || y > (down ? 0.45 : (p.ch.spec.height || 1.7) + 0.05)) continue; best = { t, kind: 'ped', p, y };
    }
    if (this.g.police) for (const p of this.g.police.foot) { const rx = p.x - o.x, rz = p.z - o.z; const dh = Math.hypot(d.x, d.z) || 1e-6; const t = (rx * d.x + rz * d.z) / (dh * dh); if (t < skipNear || t > best.t) continue; const cx = o.x + d.x * t - p.x, cz = o.z + d.z * t - p.z; if (cx * cx + cz * cz > 0.09) continue; const y = o.y + d.y * t - (p.y || 0); if (y < 0.05 || y > (p.mode === 'down' ? 0.45 : 1.8)) continue; best = { t, kind: 'officer', p, y }; }
    const vs = this.g.traffic.all();
    for (const v of vs) { if (Math.abs(v.x - o.x) > range || Math.abs(v.z - o.z) > range) continue; for (const [cx, cz] of v.circles()) { const rx = cx - o.x, ry = v.y + 0.9 - o.y, rz = cz - o.z; const t = rx * d.x + ry * d.y + rz * d.z; if (t < skipNear || t > best.t) continue; const qx = o.x + d.x * t - cx, qy = o.y + d.y * t - (v.y + 0.9), qz = o.z + d.z * t - cz; const rr = v.radius * 0.95; const dd = qx * qx + qy * qy * 1.8 + qz * qz; if (dd < rr * rr) { const back = Math.sqrt(rr * rr - dd); best = { t: Math.max(skipNear, t - back), kind: 'vehicle', v }; } } }
    best.point = o.clone().addScaledVector(d, best.t); return best;
  }
  groundY(x, z) { return L.groundY(x, z); }
  pickPed(range) { const { o, d } = this.aimRay(0); const camToPlayer = o.distanceTo(new THREE.Vector3(this.P.x, this.P.y + 1.5, this.P.z)); const h = this.trace(o, d, range, camToPlayer + 0.4); return h.kind === 'ped' ? h : null; }
  fire(def) {
    const P = this.P; const moving = P.speed > 0.6 ? 1.7 : 1; const spread = (def.spread + this.bloom) * moving * (this.scoped ? 0.35 : 1);
    const { o, d } = this.aimRay(spread); const camToPlayer = o.distanceTo(new THREE.Vector3(P.x, P.y + 1.5, P.z));
    const aimHit = this.trace(o, d, def.range, camToPlayer + 0.4);
    const mz = this.muzzleWorld(new THREE.Vector3());
    // the bullet leaves the muzzle toward the aim point; anything between the muzzle and that point takes the hit instead
    const dir = aimHit.point.clone().sub(mz); const len = dir.length(); dir.normalize(); let hit = this.trace(mz, dir, Math.max(0.1, len + 0.05), 0.05); if (hit.kind === 'none') hit = aimHit;
    this.bloom = Math.min(0.08, this.bloom + def.bloom); this.recoil = Math.min(0.12, this.recoil + 0.05); this.recoilYaw = Math.random() * 2 - 1;
    P.camPitch = clamp(P.camPitch - def.recoil * (0.85 + Math.random() * 0.3), -0.5, 1.2); P.camYaw += def.recoil * 0.35 * (Math.random() * 2 - 1); P.shake = Math.max(P.shake || 0, def.cls === 'sniper' ? 0.25 : 0.08);
    this.gunSound(def, P.x, P.z); this.flash(mz, dir, def); if (!def.cycle) this.ejectShell(); this.tracer(mz, hit.point, def);
    if (hit.kind === 'ped') { const p = hit.p; this.g.crowd.hitPed(p, dir.x, dir.z, def.dmg); this.puff(hit.point, 0x8a8478, 3); this.hitMarker(); }
    else if (hit.kind === 'officer') { this.g.police.officerHit(hit.p, dir.x, dir.z); this.puff(hit.point, 0x8a8478, 3); this.hitMarker(); } // non-graphic: stagger / down-and-recover
    else if (hit.kind === 'vehicle') { this.sparks(hit.point, dir); Audio.tone(2400 + Math.random() * 1500, 0.07, { type: 'triangle', vol: 0.05 }); const v = hit.v; if (v.ai) v.ai.bumped = 2.5; this.g.crowd.alarm(v.x, v.z, 25, 2, null); }
    else if (hit.kind === 'world' || hit.kind === 'ground') { this.puff(hit.point, hit.kind === 'ground' ? 0x6d6a64 : 0xb5ab9a, 5); this.decal(hit.point, dir, hit.kind); }
    this.shotAlarm -= 1; if (this.shotAlarm <= 0) { this.shotAlarm = 3; this.g.crowd.alarm(P.x, P.z, def.loud, 2, null); }
    this.g.crowd.alarm(hit.point.x, hit.point.z, 10, 2, null);
    if (this.g.police) this.g.police.gunfire(P.x, P.z); else { this.heat = Math.min(5, this.heat + 0.05); this.heatT = 0; } this.lastShot = { x: P.x, z: P.z, t: performance.now() };
    if (this.onShot) this.onShot(def, hit);
  }
  report(e) { // a witness phoned the police (several calls about the same incident only count once every few seconds)
    if (this.g.police) return this.g.police.report(e); // the police response system owns the wanted level
    const now = performance.now(); if (this._repT && now - this._repT < 6000) { this.heatT = 0; return; } this._repT = now;
    const before = Math.floor(this.heat); this.heat = Math.min(5, this.heat + 1); this.heatT = 0;
    if (Math.floor(this.heat) > before) this.g.hud.notify('Police alerted', 'A witness reported you. Lie low — heat fades if you stay out of trouble.', 'warn', 3.2);
  }
  heatUpdate(dt) { if (this.g.police) return; this.heatT += dt; if (this.heatT > 25 && this.heat > 0) this.heat = Math.max(0, this.heat - dt * 0.05); }

  // ------------------------------------------------------------------ sound
  gunSound(def, x, z) {
    const s = def.snd; Audio.noise(s.dur, { f: s.crack, q: 0.6, vol: s.vol, type: 'lowpass', attack: 0.001 }); Audio.noise(s.dur * 0.6, { f: s.crack * 2.2, q: 0.8, vol: s.vol * 0.35, attack: 0.001 });
    Audio.tone(s.body * 2.2, s.dur * 1.4, { type: 'sine', vol: s.vol * 0.55, attack: 0.002, glide: s.body * 0.6 });
    Audio.noise(s.tail, { f: 500, q: 0.5, type: 'lowpass', vol: s.vol * 0.25, attack: 0.02, when: 0.03, buf: Audio.brownBuf, out: 'sfx' });
    if (def.cls !== 'pistol') Audio.noise(0.04, { f: 4500, q: 2, vol: 0.05, when: 0.01 }); // action cycling
  }
  reloadSnd(def) { const R = def.reload; Audio.noise(0.04, { f: 1600, q: 3, vol: 0.08, when: R * 0.15 }); Audio.noise(0.06, { f: 900, q: 2, vol: 0.06, when: R * 0.4 }); Audio.noise(0.05, { f: 1300, q: 3, vol: 0.1, when: R * 0.7 }); Audio.noise(0.06, { f: 2000, q: 3, vol: 0.1, when: R * 0.87 }); Audio.noise(0.05, { f: 1500, q: 3, vol: 0.09, when: R * 0.93 }); }

  // ------------------------------------------------------------------ effects (pooled, short-lived, non-graphic)
  fxInit() {
    const scene = this.g.scene; this.fx = [];
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,0.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const ft = new THREE.CanvasTexture(c); this.flashMat = new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const fg = new THREE.PlaneGeometry(1, 1); this.flashMesh = new THREE.Group(); for (let i = 0; i < 3; i++) { const q = new THREE.Mesh(fg, this.flashMat); q.rotation.set(i === 2 ? Math.PI / 2 : 0, i === 1 ? Math.PI / 2 : 0, 0); if (i < 2) { q.scale.set(0.12, 0.4, 1); q.position.z = 0.15; q.rotation.x = Math.PI / 2; q.rotation.y = i * Math.PI / 2; } else q.scale.set(0.22, 0.22, 1); this.flashMesh.add(q); } this.flashMesh.visible = false; scene.add(this.flashMesh);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 9, 2); scene.add(this.flashLight);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }); this.tracerGeo = new THREE.BoxGeometry(0.012, 0.012, 1); this.tracerGeo.translate(0, 0, 0.5);
    const pc = document.createElement('canvas'); pc.width = pc.height = 32; const px = pc.getContext('2d'); const pg = px.createRadialGradient(16, 16, 0, 16, 16, 16); pg.addColorStop(0, 'rgba(255,255,255,0.85)'); pg.addColorStop(1, 'rgba(255,255,255,0)'); px.fillStyle = pg; px.fillRect(0, 0, 32, 32);
    this.puffTex = new THREE.CanvasTexture(pc); this.sparkMat = new THREE.SpriteMaterial({ map: this.puffTex, color: 0xffc070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.shellGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.02, 6); this.decals = []; this.decalMat = new THREE.MeshBasicMaterial({ color: 0x1a1816, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); this.decalGeo = new THREE.CircleGeometry(0.035, 8);
  }
  flash(p, d, def) { const f = this.flashMesh; f.position.copy(p); f.lookAt(p.clone().add(d)); const s = def.cls === 'pistol' ? 0.7 : def.cls === 'rifle' ? 1 : 1.4; f.scale.setScalar(s * (0.8 + Math.random() * 0.4)); f.rotation.z += Math.random() * 3; f.visible = true; this.flashT = 0.05; this.flashLight.position.copy(p); this.flashLight.intensity = 6 * s; }
  tracer(a, b, def) { if (def.cls === 'pistol' && Math.random() < 0.5) return; const m = new THREE.Mesh(this.tracerGeo, this.tracerMat); m.position.copy(a); m.lookAt(b); m.scale.z = a.distanceTo(b); this.g.scene.add(m); this.fx.push({ m, life: 0.05, kind: 'tracer' }); }
  puff(p, color, n) { for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, color, transparent: true, depthWrite: false, opacity: 0.7 })); s.position.copy(p); s.scale.setScalar(0.12); this.g.scene.add(s); this.fx.push({ m: s, life: 0.6 + Math.random() * 0.3, max: 0.9, kind: 'puff', v: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8) }); } }
  sparks(p, d) { for (let i = 0; i < 7; i++) { const s = new THREE.Sprite(this.sparkMat); s.position.copy(p); s.scale.setScalar(0.05); this.g.scene.add(s); this.fx.push({ m: s, life: 0.25 + Math.random() * 0.2, kind: 'spark', v: new THREE.Vector3(-d.x * 2 + (Math.random() - 0.5) * 4, Math.random() * 3, -d.z * 2 + (Math.random() - 0.5) * 4) }); } }
  ejectShell() { if (this.cur < 0) return; const m = this.models[this.cur]; m.updateWorldMatrix(true, false); const p = m.userData.eject.clone().applyMatrix4(m.matrixWorld); const right = new THREE.Vector3(-1, 0.6, -0.2).transformDirection(m.matrixWorld); const s = new THREE.Mesh(this.shellGeo, weaponMaterials().brass); s.position.copy(p); this.g.scene.add(s); this.fx.push({ m: s, life: 1.4, kind: 'shell', v: right.multiplyScalar(2 + Math.random()), spin: new THREE.Vector3(Math.random() * 20, Math.random() * 20, 0) }); }
  decal(p, d, kind) { const m = new THREE.Mesh(this.decalGeo, this.decalMat); m.position.copy(p).addScaledVector(d, -0.01); m.lookAt(p.clone().sub(d)); if (kind === 'ground') { m.rotation.set(-Math.PI / 2, 0, 0); m.position.y += 0.012; } this.g.scene.add(m); this.decals.push(m); if (this.decals.length > 40) { const o = this.decals.shift(); this.g.scene.remove(o); } }
  fxUpdate(dt) {
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flashMesh.visible = false; this.flashLight.intensity = 0; } }
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.life -= dt; const m = f.m;
      if (f.kind === 'puff') { m.position.addScaledVector(f.v, dt); f.v.multiplyScalar(0.92); m.scale.setScalar(0.12 + (1 - f.life / f.max) * 0.45); m.material.opacity = Math.max(0, f.life / f.max) * 0.6; }
      else if (f.kind === 'spark') { f.v.y -= 9.8 * dt; m.position.addScaledVector(f.v, dt); }
      else if (f.kind === 'shell') { f.v.y -= 9.8 * dt; m.position.addScaledVector(f.v, dt); m.rotation.x += f.spin.x * dt; m.rotation.y += f.spin.y * dt; const gy = this.groundY(m.position.x, m.position.z) + 0.005; if (m.position.y < gy) { m.position.y = gy; f.v.multiplyScalar(0.3); f.v.y = Math.abs(f.v.y) * 0.4; if (!f.tink) { f.tink = 1; Audio.tone(3800 + Math.random() * 1500, 0.05, { type: 'triangle', vol: 0.03 }); } } }
      if (f.life <= 0) { this.g.scene.remove(m); if (f.kind === 'puff') m.material.dispose(); this.fx.splice(i, 1); } }
  }

  // ------------------------------------------------------------------ scope
  setScope(on) {
    if (on === this.scoped) return; this.scoped = on; const cam = this.g.camera; this.P.scoped = on ? this.def : null;
    this.el.scope.classList.toggle('on', on); this.el.cross.classList.toggle('hide', on);
    if (!on) { cam.zoom = 1; cam.updateProjectionMatrix(); } else { Audio.noise(0.05, { f: 900, q: 1, vol: 0.05 }); }
  }
  scopeCamera(dt) { // called by Player.updateCamera when scoped
    const def = this.def; const cam = this.g.camera; const P = this.P; const t = performance.now() / 1000;
    const steady = Input.isDown('sprint') && this.breath > 0; this.breath = clamp(this.breath + (steady ? -dt / 4 : dt / 6), 0, 1); const sw = (steady ? 0.15 : 1) * def.sway * 0.0035 * (P.speed > 0.5 ? 3 : 1);
    this.swayVec = { x: Math.sin(t * 0.9) * sw + Math.sin(t * 2.3) * sw * 0.3, y: Math.sin(t * 1.3 + 1) * sw * 0.8 };
    const h = P.ch.bones.head; h.updateWorldMatrix(true, false); const hp = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld);
    const yaw = P.camYaw + Math.PI, pitch = -(P.camPitch - 0.12) * 1.15; const f = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    cam.position.copy(hp).addScaledVector(f, 0.25); cam.position.y += 0.02; const rt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); const look = cam.position.clone().add(f).addScaledVector(rt, -this.swayVec.x).add(new THREE.Vector3(0, this.swayVec.y, 0));
    cam.lookAt(look); cam.zoom = def.zoom; cam.updateProjectionMatrix(); P.ch.mesh.visible = false; this.models[this.cur].visible = false;
    this.el.breath.style.width = (this.breath * 100).toFixed(0) + '%';
  }

  // ------------------------------------------------------------------ HUD: crosshair, weapon card, wheel, scope, heat
  hudInit() {
    const root = this.g.hud.root; const el = (cls, parent = root, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
    this.el = {}; this.el.cross = el('crosshair hide', root, '<i class="ch-t"></i><i class="ch-b"></i><i class="ch-l"></i><i class="ch-r"></i><b></b>');
    this.el.hit = el('hitmark', root, '<i></i><i></i><i></i><i></i>');
    this.el.card = el('weap-card hide', root, '<div class="wc-name"></div><div class="wc-ammo"><b></b><span></span></div><div class="wc-state"></div>');
    this.el.scope = el('scope', root, '<div class="sc-ring"></div><div class="sc-h"></div><div class="sc-v"></div><div class="sc-dot"></div><div class="sc-mils"></div><div class="sc-hint">Hold <kbd>Shift</kbd> to steady · breath <span class="sc-breath"><i></i></span></div>');
    this.el.breath = this.el.scope.querySelector('.sc-breath i');
    this.el.heat = el('heat hide', root, '<span>POLICE</span><b></b><i></i>'); this.el.heatLabel = this.el.heat.querySelector('i');
    this.el.wheel = el('weap-wheel', root, '<div class="ww-center"><div class="ww-name"></div><div class="ww-ammo"></div><div class="ww-hint">Move the mouse · release <kbd>Tab</kbd></div></div>');
    this.el.slots = WEAPONS.map((d, i) => { const a = (i / 9) * Math.PI * 2 - Math.PI / 2; const s = el('ww-slot ' + d.cls, this.el.wheel, `<div class="ww-icon">${this.icon(d)}</div><div class="ww-label">${i + 1} · ${d.name}</div>`); s.style.left = `calc(50% + ${Math.cos(a) * 190}px)`; s.style.top = `calc(50% + ${Math.sin(a) * 190}px)`; return s; });
    this.el.msg = el('weap-msg', root);
  }
  icon(d) { // small original silhouettes for the wheel / card
    const P = { pistol: 'M6 14h34v6H22l-2 12h-8l2-12H6z', rifle: 'M2 14h14v-3h40v3h8v4H52l-2 4h-6l-2 8h-6l1-8H24l-2 6H10l2-6H2z', sniper: 'M2 15h12v-2h26V9h12v4h18v3H44l-2 3h-5l-2 9h-6l2-9H22l-2 5H8l2-5H2z' }[d.cls];
    return `<svg viewBox="0 0 72 36" width="${d.cls === 'pistol' ? 48 : 86}" height="36"><path d="${P}" fill="currentColor"/></svg>`;
  }
  hudWeapon(i) { const d = WEAPONS[i]; this.el.card.querySelector('.wc-name').innerHTML = `${this.icon(d)}<span>${d.name}</span>`; this.el.card.classList.remove('hide'); this._cardT = 4; }
  hudFlash(t) { this.el.msg.textContent = t; this.el.msg.classList.add('on'); clearTimeout(this._msgT); this._msgT = setTimeout(() => this.el.msg.classList.remove('on'), 1400); }
  hitMarker() { this.el.hit.classList.remove('on'); void this.el.hit.offsetWidth; this.el.hit.classList.add('on'); Audio.tone(1400, 0.04, { type: 'triangle', vol: 0.04 }); }
  hudUpdate(dt) {
    const d = this.def; const on = !!d && this.drawn;
    this.el.cross.classList.toggle('hide', !on || this.scoped); this.el.cross.classList.toggle('aim', this.aimW > 0.5);
    if (on) { const gap = 6 + (d.spread + this.bloom) * (this.P.speed > 0.6 ? 1.7 : 1) * 900 * (this.aimW > 0.5 ? 1 : 1.8); this.el.cross.style.setProperty('--gap', gap.toFixed(1) + 'px'); }
    if (on || this._cardT > 0) { this._cardT = (this._cardT || 0) - dt; const i = this.cur >= 0 ? this.cur : this.sel; const iv = this.inv[i]; const dd = WEAPONS[i]; this.el.card.querySelector('.wc-ammo b').textContent = iv.mag; this.el.card.querySelector('.wc-ammo span').textContent = '/ ' + iv.reserve; this.el.card.querySelector('.wc-state').textContent = this.state === 'reload' ? 'Reloading…' : this.cycleT >= 0 ? 'Working the bolt…' : this.state === 'none' ? `Holstered · ${dd.cls === 'pistol' ? 'hip holster' : 'back sling'}` : iv.mag === 0 ? (iv.reserve ? 'Empty — R to reload' : 'Out of ammunition') : ''; this.el.card.classList.toggle('low', iv.mag <= Math.ceil(dd.mag * 0.25)); this.el.card.classList.remove('hide'); }
    else this.el.card.classList.add('hide');
    const pi = this.g.police ? this.g.police.hudInfo() : null; const h = pi ? pi.level : Math.ceil(this.heat - 0.01); const lab = pi ? pi.label : '';
    this.el.heat.classList.toggle('hide', h <= 0 && !lab); this.el.heat.querySelector('b').textContent = h > 0 ? '★'.repeat(h) + '☆'.repeat(5 - h) : ''; this.el.heatLabel.textContent = lab; this.el.heat.classList.toggle('calm', h <= 0);
  }
  wheelUpdate() {
    if (!this.wheelOpen) { this.wheelOpen = true; this.wheelX = 0; this.wheelY = 0; this.wheelSel = this.cur >= 0 ? this.cur : this.sel; this.el.wheel.classList.add('on'); this.P.lookLock = true; this.g.timeSlow = 0.3; }
    this.wheelX += Input.mouseDX + Input.pad.rx * 12; this.wheelY += Input.mouseDY + Input.pad.ry * 12; const r = Math.hypot(this.wheelX, this.wheelY); if (r > 120) { this.wheelX *= 120 / r; this.wheelY *= 120 / r; }
    if (r > 30) { let a = Math.atan2(this.wheelY, this.wheelX) + Math.PI / 2; if (a < 0) a += Math.PI * 2; this.wheelSel = Math.round(a / (Math.PI * 2 / 9)) % 9; }
    for (let i = 0; i < 9; i++) this.el.slots[i].classList.toggle('sel', i === this.wheelSel);
    const d = WEAPONS[this.wheelSel], iv = this.inv[this.wheelSel]; this.el.wheel.querySelector('.ww-name').textContent = d.name; this.el.wheel.querySelector('.ww-ammo').textContent = `${iv.mag} / ${iv.reserve} · ${d.auto ? 'automatic' : d.cycle ? 'bolt / manual' : 'semi-automatic'}`;
  }
  wheelClose(apply) { if (!this.wheelOpen) return; this.wheelOpen = false; this.el.wheel.classList.remove('on'); this.P.lookLock = false; this.g.timeSlow = 1; if (apply && this.wheelSel >= 0) this.select(this.wheelSel); }

  // ------------------------------------------------------------------ save / load
  save() { return { inv: this.inv.map((v) => [v.mag, v.reserve]), sel: this.sel, heat: this.g.police ? this.g.police.level : this.heat }; }
  load(s) { if (!s) return; this.forceHolster(); (s.inv || []).forEach((v, i) => { if (this.inv[i]) { this.inv[i].mag = v[0]; this.inv[i].reserve = v[1]; } }); this.sel = s.sel || 0; this.heat = s.heat || 0; this.showHolstered(); }
  refill() { this.inv.forEach((v, i) => { v.mag = WEAPONS[i].mag; v.reserve = WEAPONS[i].reserve; }); }
}
