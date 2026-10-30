// Squad: the three playable protagonists — Dineth (agile / streetwise), Shashika (tactical / heavy) and David
// (precision / technical). One is driven by the Player controller; the other two are squad-mates with their own
// navigation: a formation slot beside the leader, the leader's breadcrumb trail when the direct line is blocked,
// momentum carry-over after a switch, stuck / distance recovery out of view, boarding the leader's vehicle as
// passengers, holding a position on command.
//
// Switching is a "Tactical Seamless Transition" (deliberately not a sky-zoom or a radial wheel):
//   1. departure — the character you leave does a context-aware move (wrist-comms tap, tactical glance + hand
//      signal while on the move, or dropping into cover) and keeps moving under AI without losing momentum;
//   2. camera — a fast Bezier dolly transit with a FOV punch (60→95→60), radial motion blur and chromatic
//      aberration; or, when the target is far or out of line of sight, a sharp 0.2 s jump-cut with signal glitch;
//   3. arrival — a takeover move (Dineth tugs his gloves / rises from cover, Shashika racks his rifle or checks his
//      vest straps, David press-checks / chambers or settles his glasses); control returns at ~70 %.
// Pure helpers are exported for the unit test (tools/squad-test.mjs).
import * as THREE from 'three';
import { Character, HEROES } from './Character.js';
import { separate } from './Bodies.js';
import { seatCharacter } from './Seating.js';
import { Input } from '../core/Input.js';
import { Settings } from '../core/Settings.js';
import { clamp, lerp, damp, dampAngle, wrapAngle } from '../core/math.js';
import { Audio } from '../audio/Audio.js';
import { WEAPONS } from '../combat/Weapons.js';

export const SQUAD_DEFS = [
  { id: 'dineth', name: 'Dineth', full: 'Dineth Jayasekara', role: 'Agile · Streetwise', accent: '#e3a24a', key: 'F1',
    loadout: ['service', 'carbine'], primary: 'carbine', speed: 1.06, stamina: 1.3, armor: 1, steady: 1, arrive: 'gloves', armedArrive: 'rack', idle: ['look', 'hips', 'watch'] },
  { id: 'shashika', name: 'Shashika', full: 'Shashika Wijesinghe', role: 'Tactical · Heavy', accent: '#9fb06e', key: 'F2',
    loadout: ['heavy', 'assault', 'battle'], primary: 'assault', speed: 0.95, stamina: 0.9, armor: 0.7, steady: 0.85, arrive: 'straps', armedArrive: 'rack', idle: ['crossarms', 'look', 'hips'] },
  { id: 'david', name: 'David', full: 'David Rodrigo', role: 'Precision · Technical', accent: '#6fa8dc', key: 'F3',
    loadout: ['compact', 'bolt', 'semi', 'precision'], primary: 'bolt', speed: 1.0, stamina: 1.0, armor: 1, steady: 0.55, arrive: 'glasses', armedArrive: 'chamber', idle: ['watch', 'text', 'look'] },
];
export const SQUAD_IDS = SQUAD_DEFS.map((d) => d.id);

// ------------------------------------------------------------------------------------------------ pure helpers
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export function bezier3(p0, p1, p2, p3, t, out = new THREE.Vector3()) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return out.set(p0.x * a + p1.x * b + p2.x * c + p3.x * d, p0.y * a + p1.y * b + p2.y * c + p3.y * d, p0.z * a + p1.z * b + p2.z * c + p3.z * d);
}
// transit control points: an arc that lifts with distance (never more than 30 m) and leans out to the side so the
// camera never threads straight through the two characters
export function transitControls(A, B) {
  const d = A.distanceTo(B); const lift = clamp(d * 0.22, 0.5, 30); const dir = B.clone().sub(A); const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(Math.min(4, d * 0.08));
  const p1 = A.clone().addScaledVector(dir, 0.22).add(new THREE.Vector3(0, lift, 0)).add(side);
  const p2 = B.clone().addScaledVector(dir, -0.18).add(new THREE.Vector3(0, lift * 0.55, 0)).add(side.multiplyScalar(0.5));
  return [p1, p2, lift];
}
export function transitDuration(d) { return clamp(0.55 + d * 0.0035, 0.55, 1.15); }
// 'transit' or 'cut': beyond 250 m, or with the line of sight blocked, a hard glitch cut reads better than flying
// through buildings. The setting can force either.
const LIN2SRGB = new Uint8Array(256).map((_, i) => { const v = Math.min(1, (i / 255) * 1.25); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); }); // + mild exposure
export function pickStyle(dist, los, setting = 'auto') { if (setting === 'transit') return 'transit'; if (setting === 'cut') return 'cut'; return dist > 250 || !los ? 'cut' : 'transit'; }
// formation slot k (0 = right shoulder, 1 = left shoulder, a little further back) in world space
export function formationSlot(px, pz, yaw, k) {
  const side = k === 0 ? -1.25 : 1.35, back = k === 0 ? 1.7 : 2.5; const fx = Math.sin(yaw), fz = Math.cos(yaw); const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return [px - fx * back + rx * -side, pz - fz * back + rz * -side];
}
// why a switch is refused (null = allowed)
export function switchBlock(c) {
  if (c.locked) return 'Squad not assembled yet';
  if (c.transitioning) return 'Switching…';
  if (c.cutscene) return 'Not during a cutscene';
  if (c.dialogue) return 'Finish the conversation first';
  if (c.indoor) return 'Not indoors';
  if (c.vehicle) return 'Get out of the vehicle first';
  if (c.entering) return 'Not while getting in or out';
  if (c.climbing || c.airborne) return 'Land first';
  if (c.hospital) return 'Not right now';
  if (c.missionLead) return `${c.missionLead} leads this mission`;
  if (c.targetAway) return `${c.targetAway} is too far behind — regroup first`;
  return null;
}
// momentum carry-over: the departing character keeps its heading/speed and blends into the AI's wish over `dur`
export function momentumBlend(mom, wantYaw, wantSpeed) {
  if (!mom || mom.t <= 0) return { yaw: wantYaw, speed: wantSpeed };
  const w = clamp(mom.t / mom.dur, 0, 1); const e = w * w * (3 - 2 * w);
  return { yaw: wantYaw + wrapAngle(mom.yaw - wantYaw) * e, speed: lerp(wantSpeed, mom.speed, e) };
}
export function freshInventory(def) { return WEAPONS.map((w) => ({ mag: w.mag, reserve: w.reserve, owned: def.loadout.includes(w.id) })); }

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _fr = new THREE.Frustum(), _pm = new THREE.Matrix4();

export class Squad {
  constructor(game) {
    this.g = game; this.unlocked = false; this.active = 0; this.crumbs = []; this.tr = null; this.sel = { open: false, i: 0, t: 0 }; this.zDown = 0; this.padDown = 0; this.msgT = 0;
    this.members = SQUAD_DEFS.map((def) => ({ def, ch: null, x: 0, z: 0, y: 0, yaw: 0, speed: 0, hp: 100, inv: freshInventory(def), sel: WEAPONS.findIndex((w) => w.id === def.loadout[0]), mode: 'follow', hold: null, mom: null, vehicle: null, seat: null, stuckT: 0, lastX: 0, lastZ: 0, progT: 0, repathT: 0, tx: 0, tz: 0, wasDrawn: false, crouched: false, idleT: 0, exitDelay: 0, hidden: false, wantSprint: false }));
    this.members[0].ch = game.player.ch; this.proxies = [];
    this.portraits = {}; this.hudInit();
  }
  get activeMember() { return this.members[this.active]; }
  get activeId() { return this.members[this.active].def.id; }
  get followers() { return this.members.filter((m, i) => i !== this.active); }
  memberById(id) { return this.members.find((m) => m.def.id === id); }
  // ------------------------------------------------------------------ lifecycle
  ensureChars() { for (const m of this.members) if (!m.ch) { m.ch = new Character(HEROES[m.def.id]); m.ch.squadId = m.def.id; } this.members[this.active].ch = this.g.player.ch; }
  unlock(placeAround = true) {
    if (this.unlocked) return; this.unlocked = true; this.ensureChars();
    for (const m of this.followers) { if (!m.ch.root.parent) this.g.scene.add(m.ch.root); if (placeAround) this.placeNear(m, false); }
    this.renderPortraits(); this.hudRefresh(); this.el.mini.classList.remove('hide');
  }
  reset() { // new game: Dineth alone until the squad assembles in "The Meeting"
    this.cancelTransition(); this.unlocked = false; this.crumbs = [];
    if (this.active !== 0) this.switchInstant(0);
    for (const m of this.members) { m.hp = 100; m.inv = freshInventory(m.def); m.sel = WEAPONS.findIndex((w) => w.id === m.def.loadout[0]); m.mode = 'follow'; m.hold = null; m.vehicle = null; if (m !== this.members[0] && m.ch && m.ch.root.parent) m.ch.root.parent.remove(m.ch.root); }
    this.g.weapons.inv = this.members[0].inv; this.g.weapons.sel = this.members[0].sel; this.el.mini.classList.add('hide'); this.el.strip.classList.remove('on');
  }
  // the outfit / load path rebuilds one member's Character (Game.rebuildPlayer for the active one)
  replaceChar(id, ch) { const m = this.memberById(id); if (m) { m.ch = ch; ch.squadId = id; } if (this.unlocked) this.renderPortraits(); }
  save() {
    this.storeActive(this.activeMember, true);
    const members = {}; for (const m of this.members) members[m.def.id] = { x: +m.x.toFixed(2), z: +m.z.toFixed(2), yaw: +m.yaw.toFixed(3), hp: Math.round(m.hp), inv: m.inv.map((v) => [v.mag, v.reserve, v.owned ? 1 : 0]), sel: m.sel, mode: m.mode === 'hold' ? 'hold' : 'follow', hold: m.hold };
    return { v: 1, unlocked: this.unlocked, active: this.activeId, members };
  }
  load(s) {
    this.cancelTransition(); if (!s) { this.reset(); return; }
    for (const m of this.members) { const d = s.members && s.members[m.def.id]; if (!d) continue; m.x = d.x ?? m.x; m.z = d.z ?? m.z; m.yaw = d.yaw ?? 0; m.hp = clamp(d.hp ?? 100, 1, 100); if (Array.isArray(d.inv)) d.inv.forEach((v, i) => { if (m.inv[i]) { m.inv[i].mag = v[0]; m.inv[i].reserve = v[1]; m.inv[i].owned = !!v[2]; } }); if (typeof d.sel === 'number') m.sel = d.sel; m.mode = d.mode === 'hold' ? 'hold' : 'follow'; m.hold = d.hold || null; }
    const ai = Math.max(0, SQUAD_IDS.indexOf(s.active)); if (s.unlocked) { this.unlocked = false; this.unlock(false); } else this.unlocked = false;
    if (ai !== this.active) this.switchInstant(ai, true);
    else { this.g.weapons.inv = this.activeMember.inv; this.g.weapons.sel = this.activeMember.sel; }
    this.g.story.state.health = this.activeMember.hp;
    if (!s.unlocked) { this.el.mini.classList.add('hide'); }
  }
  // after the player has been placed (load / respawn): bring squad-mates that are far away to the leader
  regroup(force = false) { const P = this.g.player; this.crumbs = [{ x: P.x, z: P.z, y: P.y }]; if (!this.unlocked) return; for (const m of this.followers) { if (m.vehicle) this.disembark(m, true); if (force || m.mode !== 'hold' || Math.hypot(m.x - P.x, m.z - P.z) > 400) { if (force) { m.mode = 'follow'; m.hold = null; } this.placeNear(m, false); } else this.syncFollower(m); } }
  // ------------------------------------------------------------------ active <-> follower data
  storeActive(m, keepWeapons = false) {
    const P = this.g.player, W = this.g.weapons; m.x = P.x; m.z = P.z; m.y = P.y; m.yaw = P.yaw; m.speed = P.speed; m.crouched = !!P.crouching;
    m.hp = this.g.story.state.health ?? 100; m.inv = W.inv; m.sel = W.sel; if (!keepWeapons) m.wasDrawn = W.drawn;
  }
  loadActive(m) {
    const g = this.g, P = g.player, W = g.weapons; const old = P.ch;
    if (P.fpHead) { P.fpHead.scale.setScalar(1); P.fpHead = null; } // first person collapses the active head: give it back
    P.ch = m.ch; P.x = m.x; P.z = m.z; P.y = m.y; P.yaw = m.yaw; P.vy = 0; P.speed = m.speed; P.grounded = true; P.climb = null; P.crouching = false; P.idleT = 0; P.emote = null; P.hitCd = 0;
    P.perk = m.def; if (m.ch.root.parent !== g.scene) { m.ch.root.parent?.remove(m.ch.root); g.scene.add(m.ch.root); } m.ch.root.visible = true; m.ch.mesh.visible = true;
    W.forceHolster(); W.inv = m.inv; W.sel = m.sel; W.attach(m.ch); W.showHolstered();
    if (old && old !== m.ch) { old.anim.ik = null; old.anim.aim = null; }
    g.story.state.health = m.hp; P.sync();
  }
  // used by load / reset: swap without any transition
  switchInstant(i, silent = false) {
    const from = this.activeMember, to = this.members[i]; if (from === to) return; this.ensureChars();
    this.storeActive(from); this.active = i; this.loadActive(to); from.mode = from.mode === 'hold' ? 'hold' : 'follow'; from.mom = null;
    if (this.unlocked && !from.ch.root.parent) this.g.scene.add(from.ch.root);
    if (!silent) this.hudRefresh();
  }
  // ------------------------------------------------------------------ switching rules
  missionLead() { const st = this.g.story; if (!st.running || st.allowSwitch) return null; const lead = st.leadFor ? st.leadFor(st.running) : 'dineth'; return lead; }
  blockFor(i) {
    const g = this.g, P = g.player, st = g.story; const target = this.members[i]; const lead = this.missionLead();
    return switchBlock({ locked: !this.unlocked, transitioning: !!this.tr, cutscene: g.director.active, dialogue: (g.hud.choiceEl && !g.hud.choiceEl.classList.contains('hidden')) || g.director.active, indoor: !!g.indoor || !!g.interiors.current,
      vehicle: !!P.vehicle, entering: !!(P.entry || P.exiting), climbing: !!P.climb, airborne: !P.grounded && P.y - g.collision.groundAt(P.x, P.z, P.y, 0.5) > 0.4, hospital: g.health.busy,
      missionLead: lead && lead !== target.def.id ? SQUAD_DEFS.find((d) => d.id === lead).name : null, targetAway: target.mode === 'away' && !target.vehicle ? target.def.name : null });
  }
  request(i) {
    if (i === this.active || i < 0 || i >= this.members.length) return false;
    const why = this.blockFor(i); if (why) { this.flash(why); Audio.ui && Audio.ui('click'); return false; }
    this.startSwitch(i); return true;
  }
  flash(text) { this.el.msg.textContent = text; this.el.msg.classList.add('on'); clearTimeout(this._mt); this._mt = setTimeout(() => this.el.msg.classList.remove('on'), 1600); }
  // ------------------------------------------------------------------ the transition
  departureFor(m, P) {
    if (P.speed > 2.4) return 'glance'; // on the move: look back over the shoulder, signal "moving up", keep going
    const g = this.g; const threat = (g.police && g.police.level > 0) || g.story.guards.length || g.story.pursuers.length || g.weapons.drawn;
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw); let wall = false; for (const [ax, az] of [[-fx, -fz], [fz, -fx], [-fz, fx]]) { if (g.collision.raycast(P.x, P.y + 0.9, P.z, P.x + ax * 1.4, P.y + 0.9, P.z + az * 1.4, 0.2) < 1) { wall = true; break; } }
    if (threat) return 'cover'; // under threat: drop into cover and hold that spot
    if (wall && Math.random() < 0.4) return 'coverBrief'; // by a wall: a quick crouch at the corner, then follow
    return 'comms';
  }
  startSwitch(i) {
    const g = this.g, P = g.player, cam = g.camera; const from = this.activeMember, to = this.members[i];
    const dep = this.departureFor(from, P); const rise = to.ch.anim.crouch > 0.5 || to.ch.anim.action === 'cover' || to.ch.anim.action === 'crouch';
    // camera start
    const A = cam.position.clone(); const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    // swap: the departing character becomes a squad-mate immediately (keeps moving), the new one takes the controller
    this.storeActive(from); const mom = { t: 4, dur: 4, yaw: P.yaw, speed: P.speed };
    this.active = i; this.loadActive(to);
    from.mode = from.mode === 'hold' ? 'hold' : 'follow'; from.mom = mom; from.vehicle = null; from.repathT = 0; from.progT = 0; from.lastX = from.x; from.lastZ = from.z;
    if (dep === 'cover') { from.mode = 'hold'; from.hold = [from.x, from.z]; from.coverT = 1e9; } // stays in cover, holding that spot
    if (dep === 'coverBrief') from.coverT = 1.6;
    from.ch.anim.play(dep === 'comms' || dep === 'glance' ? dep : 'cover', dep === 'cover' ? 1e9 : dep === 'coverBrief' ? 1.6 : dep === 'glance' ? 1.1 : 1.3);
    to.mode = 'follow'; to.hold = null; to.mom = null;
    P.control = false; P.camOverride = true; P.speed = 0;
    // camera end pose: where the follow camera wants to be behind the new character, keeping the current yaw
    P.camOverride = false; P.updateCamera(1, true); const B = cam.position.clone(); cam.position.copy(A); cam.lookAt(A.clone().add(fwd)); P.camOverride = true;
    const head = (m) => new THREE.Vector3(m.x ?? 0, (m.y ?? 0) + 1.5, m.z ?? 0);
    const look0 = A.clone().addScaledVector(fwd, Math.max(3, A.distanceTo(head(from))));
    const d = A.distanceTo(B); const los = g.collision.raycast(A.x, A.y, A.z, B.x, B.y, B.z, 0.2) >= 0.98 || d < 12;
    const style = pickStyle(d, los, Settings.get('switchStyle') || 'auto');
    const [p1, p2] = transitControls(A, B);
    this.tr = { t: 0, phase: 'depart', dep, style, A, B, p1, p2, look0, from, to, fov0: cam.fov, dur: style === 'cut' ? 0.22 : transitDuration(d), arrive: null, armed: false, rise };
    Audio.noise && Audio.noise(0.05, { f: 2400, q: 4, vol: 0.06 }); // wrist-comms click
    this.hudRefresh(); this.showStrip(2.2);
  }
  cancelTransition() { if (!this.tr) return; const P = this.g.player; P.camOverride = false; P.control = true; this.tr = null; this.setFX(0, 0, 0); const cam = this.g.camera; cam.fov = Settings.get('fov'); cam.updateProjectionMatrix(); }
  setFX(blur, chroma, glitch) { const fx = this.g.post && this.g.post.setTransit; if (fx) this.g.post.setTransit(blur, chroma, glitch); }
  updateTransition(dt) {
    const T = this.tr; if (!T) return; const g = this.g, P = g.player, cam = g.camera; T.t += dt;
    const fromHead = new THREE.Vector3(T.from.x, T.from.y + 1.45, T.from.z), toHead = new THREE.Vector3(P.x, P.y + 1.5, P.z);
    if (T.phase === 'depart') { // a short beat on the departing character
      const k = clamp(T.t / 0.36, 0, 1), e = easeInOutCubic(k); const look = T.look0.clone().lerp(fromHead, e);
      cam.position.copy(T.A).lerp(fromHead, 0.06 * e); cam.lookAt(look);
      if (k >= 1) { T.phase = T.style; T.t = 0; T.lookStart = look; if (T.style === 'transit') this.whoosh(T.dur); else this.glitchSound(); }
      return;
    }
    if (T.phase === 'transit') {
      const k = clamp(T.t / T.dur, 0, 1), e = easeInOutCubic(k); const s = Math.sin(Math.PI * k);
      bezier3(T.A, T.p1, T.p2, T.B, e, cam.position);
      const le = easeInOutCubic(clamp(k * 1.15, 0, 1)); cam.lookAt(_v.copy(T.lookStart).lerp(toHead, le));
      cam.fov = T.fov0 + (95 - T.fov0) * Math.sin(Math.PI * Math.min(1, e)) ; cam.updateProjectionMatrix(); // dolly-zoom punch 60→95→60
      this.setFX(s, s, 0);
      if (k >= 1) this.beginArrival();
      return;
    }
    if (T.phase === 'cut') {
      const k = clamp(T.t / T.dur, 0, 1); const g1 = k < 0.45 ? k / 0.45 : 1 - (k - 0.45) / 0.55;
      if (k < 0.45) { cam.position.copy(T.A); cam.lookAt(T.lookStart); } else { cam.position.copy(T.B); cam.lookAt(toHead); }
      this.setFX(0, g1 * 0.6, g1);
      if (k >= 1) this.beginArrival();
      return;
    }
    if (T.phase === 'arrive') {
      const k = clamp(T.t / T.adur, 0, 1); this.setFX(0, 0, 0);
      if (k >= 0.7 && !P.control) P.control = true; // control returns while the takeover move finishes
      if (k >= 1) { this.tr = null; }
    }
  }
  beginArrival() {
    const T = this.tr, g = this.g, P = g.player, cam = g.camera, to = T.to;
    cam.fov = T.fov0; cam.updateProjectionMatrix(); P.camOverride = false; P.camPos.copy(T.B); P.updateCamera(1 / 60);
    const threat = (g.police && g.police.level > 0) || g.story.guards.length || g.story.pursuers.length;
    T.armed = (to.wasDrawn || threat) && g.weapons.arrivalCheck ? g.weapons.arrivalCheck(to.def) : false;
    T.arrive = T.armed ? to.def.armedArrive : T.rise ? 'rise' : to.def.arrive;
    if (!T.armed) P.ch.anim.play(T.arrive, T.arrive === 'rise' ? 0.8 : 1.05);
    T.phase = 'arrive'; T.t = 0; T.adur = T.armed ? 0.95 : T.arrive === 'rise' ? 0.8 : 1.0; this.setFX(0, 0, 0);
    to.crouched = false; this.hudRefresh();
  }
  whoosh(dur) { if (!Audio.noise) return; Audio.noise(dur * 0.9, { f: 500, q: 0.7, vol: 0.09 }); Audio.noise(dur * 0.5, { f: 1800, q: 1.2, vol: 0.05, when: dur * 0.3 }); }
  glitchSound() { if (!Audio.noise) return; Audio.noise(0.08, { f: 3600, q: 6, vol: 0.08 }); Audio.tone && Audio.tone(220, 0.05, { type: 'square', vol: 0.04 }); Audio.noise(0.06, { f: 900, q: 3, vol: 0.06, when: 0.09 }); }
  // ------------------------------------------------------------------ per-frame
  update(dt, busy) {
    if (!this.unlocked) return;
    const g = this.g, P = g.player;
    this.trail(P);
    this.handleInput(dt, busy);
    this.updateTransition(dt);
    const bodies = g.bodies || [];
    this.followers.forEach((m, k) => { try { this.updateFollower(m, dt, k, bodies); } catch (e) { if (!this._fe) { console.error(e); this._fe = 1; } } });
    this.proxies = this.followers.filter((m) => !m.vehicle && !m.hidden && m.ch.root.parent).map((m) => ({ x: m.x, z: m.z, crossing: m.speed > 0.5 }));
    this.hudUpdate(dt);
  }
  trail(P) { if (P.vehicle || this.g.indoor) return; const c = this.crumbs; const l = c[c.length - 1]; if (!l || Math.hypot(P.x - l.x, P.z - l.z) > 0.8) { c.push({ x: P.x, z: P.z, y: P.y }); if (c.length > 160) c.shift(); } }
  handleInput(dt, busy) {
    const g = this.g; if (busy && !this.sel.open) return;
    // direct: F1–F3
    for (let i = 0; i < 3; i++) if (Input.keyPressed('F' + (i + 1))) { this.closeSelector(false); this.request(i); }
    // Z: tap = next squad-mate, hold = selector (time slows; A/D, mouse or wheel to choose, E = hold/follow, release to switch)
    const zHeld = Input.down.has('KeyZ') || !!Input.pad.buttons[4]; // Z / gamepad LB
    if (zHeld) { this.zDown += dt / Math.max(0.05, g.timeSlow || 1); if (this.zDown > 0.24 && !this.sel.open) this.openSelector(); }
    else if (this.zDown > 0) { const tap = this.zDown <= 0.24 && !this.sel.open; this.zDown = 0; if (tap) { this.request(this.nextAvailable()); } else if (this.sel.open) this.closeSelector(true); }
    if (this.sel.open) {
      const S = this.sel; S.acc = (S.acc || 0) + Input.mouseDX * 0.02 + Input.pad.lx * dt * 6; const step = Input.keyPressed('KeyD') || Input.keyPressed('ArrowRight') || Input.wheel > 0 || S.acc > 1 ? 1 : Input.keyPressed('KeyA') || Input.keyPressed('ArrowLeft') || Input.wheel < 0 || S.acc < -1 ? -1 : 0;
      if (step) { S.i = (S.i + step + 3) % 3; S.acc = 0; Audio.ui && Audio.ui('click'); this.hudRefresh(); }
      if (Input.keyPressed('KeyE') && S.i !== this.active) { const m = this.members[S.i]; if (m.mode === 'hold') { m.mode = 'follow'; m.hold = null; this.flash(`${m.def.name}: on you`); } else { m.mode = 'hold'; m.hold = [m.x, m.z]; this.flash(`${m.def.name}: holding position`); } this.hudRefresh(); }
      if (Input.keyPressed('Escape')) this.closeSelector(false);
    }
  }
  nextAvailable() { for (let k = 1; k < 3; k++) { const i = (this.active + k) % 3; if (!this.blockFor(i)) return i; } return (this.active + 1) % 3; }
  openSelector() { const g = this.g; this.sel.open = true; this.sel.i = this.nextAvailable(); this.sel.acc = 0; g.timeSlow = 0.3; g.player.lookLock = true; this.el.strip.classList.add('on', 'select'); this.hudRefresh(); }
  closeSelector(apply) { if (!this.sel.open) return; const g = this.g; this.sel.open = false; g.timeSlow = 1; g.player.lookLock = false; this.el.strip.classList.remove('select'); this.showStrip(1.2); if (apply && this.sel.i !== this.active) this.request(this.sel.i); }
  // ------------------------------------------------------------------ squad-mate navigation
  inView(x, y, z) { const cam = this.g.camera; _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm); return _fr.containsPoint(_v2.set(x, y + 1, z)) && Math.hypot(x - cam.position.x, z - cam.position.z) < 160; }
  clearLine(x0, z0, y, x1, z1) { return this.g.collision.raycast(x0, y + 0.9, z0, x1, y + 0.9, z1, 0.28) >= 0.999; }
  // a free spot near the leader that the camera can't see (falls back to anything free behind the leader)
  placeNear(m, preferHidden = true) {
    const g = this.g, P = g.player, col = g.collision; const k = this.followers.indexOf(m); let best = null;
    const tryAt = (x, z) => { if (col.blocked(x, z, 0.35) || !col.walkableWater(x, z, P.y)) return false; best = [x, z]; return true; };
    const c = this.crumbs; for (let i = c.length - 4 - k * 3; i >= Math.max(0, c.length - 40); i -= 2) { const q = c[i]; if (!q) continue; if (preferHidden && this.inView(q.x, q.y, q.z)) continue; if (tryAt(q.x, q.z)) break; }
    if (!best) { const [sx, sz] = formationSlot(P.x, P.z, P.yaw, Math.max(0, k)); if (!tryAt(sx, sz)) for (let r = 1.5; r < 8 && !best; r += 1) for (let a = 0; a < 8 && !best; a++) tryAt(P.x + Math.cos(a * 0.785) * r, P.z + Math.sin(a * 0.785) * r); }
    if (!best) best = [P.x - Math.sin(P.yaw) * 2, P.z - Math.cos(P.yaw) * 2];
    m.x = best[0]; m.z = best[1]; m.y = col.groundAt(m.x, m.z, P.y + 1, 2); m.yaw = P.yaw; m.speed = 0; m.mom = null; m.stuckT = 0; m.lastX = m.x; m.lastZ = m.z; m.progT = 0; m.hidden = false; if (m.mode === 'away') m.mode = 'follow';
    if (m.ch.root.parent !== g.scene) { m.ch.root.parent?.remove(m.ch.root); g.scene.add(m.ch.root); } m.ch.root.visible = true; m.ch.anim.standUp && m.ch.anim.standUp(); m.ch.anim.set(null); this.syncFollower(m);
  }
  placeAt(id, x, z, yaw) { const m = this.memberById(id); if (!m || m === this.activeMember || !m.ch) return null; if (m.vehicle) this.disembark(m, true); if (m.ch.root.parent !== this.g.scene) { m.ch.root.parent?.remove(m.ch.root); this.g.scene.add(m.ch.root); } m.x = x; m.z = z; m.y = this.g.collision.groundAt(x, z, this.g.player.y + 1, 2); m.yaw = yaw; m.speed = 0; m.mom = null; m.hidden = false; m.ch.root.visible = true; if (m.mode === 'away') m.mode = 'follow'; this.syncFollower(m); return m.ch; }
  syncFollower(m) { m.ch.root.position.set(m.x, m.y, m.z); m.ch.root.rotation.set(0, m.yaw, 0); }
  freeSeat(v) { const seats = v.mesh.userData.seats || []; const used = new Set(this.followers.filter((f) => f.vehicle === v).map((f) => f.seat)); const pax = new Set((v.paxPlan || []).map((p) => p.seat)); for (const s of seats) if (!s.driver && !used.has(s) && !pax.has(s)) return s; return null; }
  boardPoint(v, seat) { const side = Math.sign(seat.x) || 1; v.mesh.updateMatrixWorld(); return new THREE.Vector3(side * (v.T.wid / 2 + 0.6), 0, seat.z).applyMatrix4(v.mesh.matrixWorld); }
  disembark(m, instant = false) {
    const g = this.g, v = m.vehicle; m.vehicle = null; const seat = m.seat; m.seat = null; if (!v) return;
    const side = Math.sign(seat ? seat.x : 1) || 1; v.mesh.updateMatrixWorld(); let p = null;
    for (const [sx, dz] of [[side, 0], [-side, 0], [side, -1.2], [-side, -1.2], [0, -(v.T.len / 2 + 0.8)]]) { const q = new THREE.Vector3(sx * (v.T.wid / 2 + 0.7), 0, (seat ? seat.z : 0) + dz).applyMatrix4(v.mesh.matrixWorld); if (!g.collision.blocked(q.x, q.z, 0.32)) { p = q; break; } }
    if (!p) { this.placeNear(m, false); return; }
    v.mesh.remove(m.ch.root); g.scene.add(m.ch.root); m.x = p.x; m.z = p.z; m.y = g.collision.groundAt(p.x, p.z, v.y + 0.5, 1); m.yaw = v.yaw + side * Math.PI / 2; m.speed = 0; m.mode = m.mode === 'hold' ? 'hold' : 'follow'; m.ch.anim.standUp(); m.ch.anim.set(null); m.ch.mesh.castShadow = true; this.syncFollower(m); m.stuckT = 0; m.progT = 0; m.lastX = m.x; m.lastZ = m.z;
  }
  updateFollower(m, dt, k, bodies) {
    const g = this.g, P = g.player, ch = m.ch, A = ch.anim, col = g.collision;
    if (!ch.root.parent && !m.vehicle) g.scene.add(ch.root);
    // inside an interior the street is hidden: squad-mates wait outside and catch up when you come out
    if (g.indoor) { if (!m.hidden) { m.hidden = true; ch.root.visible = false; } return; }
    if (m.hidden && m.mode !== 'away') { m.hidden = false; ch.root.visible = true; if (m.mode !== 'hold') this.placeNear(m, true); }
    // riding with the leader
    if (m.vehicle) { if (P.vehicle !== m.vehicle) { m.exitDelay -= dt; if (m.exitDelay <= 0) this.disembark(m); } else m.exitDelay = 0.35 + k * 0.4; A.update(dt, 0); return; }
    if (m.mode === 'away') { // left behind when the leader drove off: catch up out of sight once the leader is on foot
      if (!P.vehicle && !this.tr) { const d = Math.hypot(m.x - P.x, m.z - P.z); if (d > 25 || !this.inView(m.x, m.y, m.z)) this.placeNear(m, true); else { m.mode = 'follow'; m.hidden = false; ch.root.visible = true; } }
      return;
    }
    if (g.director.active) { m.speed = 0; m.mom = null; m.x = ch.root.position.x; m.z = ch.root.position.z; m.y = ch.root.position.y; m.yaw = ch.root.rotation.y; A.update(dt, 0, 0); return; } // scenes stage squad-mates directly
    const dL = Math.hypot(P.x - m.x, P.z - m.z);
    // boarding the leader's vehicle
    if (P.vehicle && m.mode !== 'hold' && !this.tr) {
      const v = P.vehicle; if (!m.boardSeat || m.boardV !== v) { m.boardV = v; m.boardSeat = this.freeSeat(v); m.boardT = 0; }
      m.boardT += dt; const seat = m.boardSeat;
      if (!seat || m.boardT > 9 || (Math.abs(v.speed) > 5 && dL > 3)) { if (dL > 40 || (!this.inView(m.x, m.y, m.z) && dL > 20)) { m.mode = 'away'; m.hidden = true; ch.root.visible = false; m.boardSeat = null; return; } m.speed = damp(m.speed, 0, 6, dt); A.update(dt, m.speed, 0); this.syncFollower(m); return; }
      const bp = this.boardPoint(v, seat); const d = Math.hypot(bp.x - m.x, bp.z - m.z);
      if (d < 0.9 || (d < 3 && Math.abs(v.speed) > 1.5)) { m.vehicle = v; m.seat = seat; m.boardSeat = null; ch.mesh.castShadow = false; seatCharacter(ch, v, seat); return; }
      this.steer(m, dt, bp.x, bp.z, d > 4 ? 5.2 : 2.6, bodies); return;
    }
    m.boardSeat = null;
    // targets: formation slot (or the hold point); the leader's trail when the direct line is blocked
    const P_yaw = P.speed > 0.3 ? P.yaw : (m.restYaw ??= P.yaw); if (P.speed > 0.3) m.restYaw = P.yaw;
    let gx, gz; if (m.mode === 'hold' && m.hold) { gx = m.hold[0]; gz = m.hold[1]; } else [gx, gz] = formationSlot(P.x, P.z, P_yaw, k);
    m.repathT -= dt;
    if (m.repathT <= 0) { m.repathT = 0.3; m.tx = gx; m.tz = gz;
      if (!this.clearLine(m.x, m.z, m.y, gx, gz) || col.blocked(gx, gz, 0.3)) { const c = this.crumbs; let found = false;
        for (let i = c.length - 1, n = 0; i >= 0 && n < 50; i--, n++) { const q = c[i]; if (Math.hypot(q.x - m.x, q.z - m.z) > 30) continue; if (this.clearLine(m.x, m.z, m.y, q.x, q.z)) { m.tx = q.x; m.tz = q.z; found = true; break; } }
        if (!found && col.blocked(gx, gz, 0.3)) { m.tx = P.x; m.tz = P.z; } } }
    if (m.sideT > 0) { m.sideT -= dt; m.tx = m.x + Math.cos(m.yaw) * 2 * m.sideDir; m.tz = m.z - Math.sin(m.yaw) * 2 * m.sideDir; }
    const d = Math.hypot(m.tx - m.x, m.tz - m.z); const hold = m.mode === 'hold';
    // pace: match the leader, close the gap when behind, ease in on arrival
    let want = 0; if (d > 0.45) { const pace = hold ? 0 : P.speed; want = clamp(pace + (dL - 2.2) * 0.9, d > 1.2 ? 1.3 : 0.8, P.sprinting || dL > 12 ? 6.4 * m.def.speed : 3.6); if (d < 1.2) want = Math.min(want, 1.0 + d); }
    m.wantSprint = want > 4;
    this.steer(m, dt, m.tx, m.tz, want, bodies);
    // stance: crouch with a crouching leader, cover on a cover departure
    if (!hold && m.coverT > 10) m.coverT = 0; const crouchWant = (!hold && P.crouching && dL < 8) || (m.coverT > 0); if (m.coverT > 0) m.coverT -= dt; if (m.coverT <= 0 && A.action === 'cover') A.set(null);
    if (crouchWant && A.action !== 'crouch' && A.action !== 'cover') A.set('crouch'); else if (!crouchWant && A.action === 'crouch') A.set(null);
    // idle: face the leader's way (or outwards when holding), occasional personal fidget
    if (m.speed < 0.15) { m.idleT += dt; const face = hold ? m.yaw : P_yaw + (k === 0 ? 0.5 : -0.5); m.yaw = dampAngle(m.yaw, face, 3, dt); if (m.idleT > (m.nextFidget ||= 7 + Math.random() * 8) && !A.action) { const f = m.def.idle[Math.floor(Math.random() * m.def.idle.length)]; A.play(f, 3.2); m.idleT = 0; m.nextFidget = 9 + Math.random() * 10; } }
    else { m.idleT = 0; if (A.action && m.def.idle.includes(A.action)) A.set(null); }
    // recovery: stuck (little progress while far from the slot) or far away → reposition out of view
    m.progT += dt; if (m.progT > 2) { const moved = Math.hypot(m.x - m.lastX, m.z - m.lastZ); if (!hold && d > 3 && moved < 0.6) { m.stuckT++; if (m.stuckT >= 2 || !this.inView(m.x, m.y, m.z)) { if (!this.inView(m.x, m.y, m.z)) this.placeNear(m, true); m.stuckT = 0; } else { m.sideT = 1; m.sideDir = Math.random() < 0.5 ? -1 : 1; } } else m.stuckT = 0; m.lastX = m.x; m.lastZ = m.z; m.progT = 0; }
    if (!hold && dL > 110 && !this.inView(m.x, m.y, m.z)) this.placeNear(m, true);
  }
  steer(m, dt, tx, tz, want, bodies) {
    const g = this.g, A = m.ch.anim, col = g.collision; const wantYaw = Math.atan2(tx - m.x, tz - m.z);
    const mb = momentumBlend(m.mom, wantYaw, want); if (m.mom) { m.mom.t -= dt; if (m.mom.t <= 0) m.mom = null; }
    m.speed = damp(m.speed, mb.speed, mb.speed > m.speed ? 5 : 8, dt); const prev = m.yaw; if (m.speed > 0.1) m.yaw = dampAngle(m.yaw, mb.yaw, m.speed > 4 ? 7 : 9, dt);
    let nx = m.x + Math.sin(m.yaw) * m.speed * dt, nz = m.z + Math.cos(m.yaw) * m.speed * dt;
    if (bodies.length) { const q = separate(bodies, nx, nz, m.y, 0.32, m.ch, 0.5); if (q.hit) { nx = q.x; nz = q.z; } }
    if (!col.walkableWater(nx, nz, m.y)) { nx = m.x; nz = m.z; m.speed *= 0.5; }
    const r = col.resolveCircle(nx, nz, 0.32, m.y, 0.45, 1.75); nx = r.x; nz = r.z;
    const tr = g.traffic; if (tr) for (const v of tr.all()) { const lim = 3 + (v.T ? v.T.len / 2 : 5); if (Math.abs(v.x - nx) > lim || Math.abs(v.z - nz) > lim) continue; const q = v.pushOut(nx, nz, 0.32); if (q) { nx = q.x; nz = q.z; } }
    m.x = nx; m.z = nz; const gy = col.groundAt(m.x, m.z, m.y + 0.5, 0.6); m.y = Math.abs(gy - m.y) > 1.2 ? gy : damp(m.y, gy, 18, dt);
    A.update(dt, m.speed, wrapAngle(m.yaw - prev) / Math.max(dt, 1e-4)); this.syncFollower(m);
  }
  // ------------------------------------------------------------------ HUD: mini indicator + three-card strip
  hudInit() {
    const root = this.g.hud.root; const el = (cls, parent, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; parent.appendChild(d); return d; };
    this.el = {}; this.el.mini = el('sq-mini hide', root); this.el.strip = el('sq-strip', root); this.el.msg = el('sq-msg', root);
    this.el.cards = SQUAD_DEFS.map((d, i) => { const c = el('sq-card', this.el.strip, `<div class="sq-por" style="--acc:${d.accent}"><img alt=""><b>${d.name[0]}</b></div><div class="sq-txt"><div class="sq-name">${d.name}</div><div class="sq-role">${d.role}</div><div class="sq-hp"><i></i></div><div class="sq-st"></div></div><kbd>${d.key}</kbd>`); c.style.setProperty('--acc', d.accent); return c; });
    this.el.hint = el('sq-hint', this.el.strip, '');
    this.el.minis = SQUAD_DEFS.map((d) => { const c = el('sq-m', this.el.mini, `<span>${d.name[0]}</span><i></i>`); c.style.setProperty('--acc', d.accent); return c; });
  }
  showStrip(sec) { this.el.strip.classList.add('on'); this.stripT = sec; }
  status(m, i) {
    const P = this.g.player; if (i === this.active) return 'You';
    if (m.vehicle) return 'Passenger'; if (m.mode === 'away') return 'Catching up'; const d = Math.round(Math.hypot(m.x - P.x, m.z - P.z));
    return `${m.mode === 'hold' ? 'Holding' : m.speed > 0.4 ? 'Moving up' : 'With you'} · ${d} m`;
  }
  hudRefresh() {
    if (!this.el) return; const sel = this.sel.open ? this.sel.i : -1;
    this.members.forEach((m, i) => { const c = this.el.cards[i]; const why = i === this.active ? null : this.blockFor(i); c.classList.toggle('active', i === this.active); c.classList.toggle('pick', i === sel); c.classList.toggle('no', !!why && i !== this.active);
      c.querySelector('.sq-st').textContent = why && i !== this.active && this.sel.open ? why : this.status(m, i); const hp = i === this.active ? this.g.story.state.health ?? 100 : m.hp; c.querySelector('.sq-hp i').style.width = `${clamp(hp, 0, 100)}%`;
      const img = c.querySelector('img'); if (this.portraits[m.def.id] && img.src !== this.portraits[m.def.id]) { img.src = this.portraits[m.def.id]; c.classList.add('has-img'); }
      const mm = this.el.minis[i]; mm.classList.toggle('active', i === this.active); mm.querySelector('i').style.width = `${clamp(hp, 0, 100)}%`; });
    const k = (a) => this.g.hud.key ? this.g.hud.key(a) : a;
    this.el.hint.innerHTML = this.sel.open ? `<kbd>A</kbd><kbd>D</kbd> choose · <kbd>E</kbd> hold / follow · release <kbd>Z</kbd> to switch` : `<kbd>Z</kbd> next · hold <kbd>Z</kbd> squad · <kbd>F1</kbd>–<kbd>F3</kbd>`;
    void k;
  }
  hudUpdate(dt) { this.hudT = (this.hudT || 0) - dt; if (this.hudT <= 0) { this.hudT = 0.25; this.hudRefresh(); } if (this.stripT > 0 && !this.sel.open) { this.stripT -= dt; if (this.stripT <= 0) this.el.strip.classList.remove('on'); } }
  // portraits: each protagonist's real head, rendered once with the game renderer
  renderPortraits() {
    const g = this.g, r = g.renderer; if (!r || typeof document === 'undefined') return;
    try {
      const S = 160; const rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 }); const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 10);
      scene.add(new THREE.HemisphereLight(0xfff1e0, 0x2a2622, 1.4)); const key = new THREE.DirectionalLight(0xffe2c0, 2.6); key.position.set(1.2, 1.6, 2); scene.add(key); const rim = new THREE.DirectionalLight(0x9fc4ff, 1.6); rim.position.set(-1.5, 1, -1.2); scene.add(rim);
      scene.environment = g.scene.environment; const buf = new Uint8Array(S * S * 4); const cv = document.createElement('canvas'); cv.width = cv.height = S; const cx = cv.getContext('2d'); const img = cx.createImageData(S, S);
      const prevTarget = r.getRenderTarget(), prevTone = r.toneMappingExposure, prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
      for (const m of this.members) { const ch = m.ch; if (!ch) continue; const parent = ch.root.parent; const pos = ch.root.position.clone(), rot = ch.root.rotation.clone(); const vis = ch.mesh.visible; const head = ch.bones.head.scale.clone();
        scene.add(ch.root); ch.root.position.set(0, 0, 0); ch.root.rotation.set(0, 0, 0); ch.mesh.visible = true; ch.bones.head.scale.set(1, 1, 1); ch.root.updateMatrixWorld(true);
        const hp = new THREE.Vector3().setFromMatrixPosition(ch.bones.head.matrixWorld); const s = ch.spec.height / 1.72; cam.position.set(hp.x + 0.12 * s, hp.y + 0.1 * s, hp.z + 0.78 * s); cam.lookAt(hp.x, hp.y + 0.07 * s, hp.z);
        r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam); r.readRenderTargetPixels(rt, 0, 0, S, S, buf);
        for (let y = 0; y < S; y++) for (let x = 0; x < S * 4; x++) img.data[(S - 1 - y) * S * 4 + x] = (x & 3) === 3 ? buf[y * S * 4 + x] : LIN2SRGB[buf[y * S * 4 + x]]; // targets hold linear light
        cx.putImageData(img, 0, 0); this.portraits[m.def.id] = cv.toDataURL('image/png');
        scene.remove(ch.root); if (parent) parent.add(ch.root); ch.root.position.copy(pos); ch.root.rotation.copy(rot); ch.mesh.visible = vis; ch.bones.head.scale.copy(head); }
      r.setRenderTarget(prevTarget); r.toneMappingExposure = prevTone; r.setClearColor(prevClear, prevAlpha); rt.dispose();
    } catch (e) { console.warn('portraits', e); }
  }
}
