// Black Orchid — a contractor the player can hire through a private site in the Global browser (ui/GlobalBrowser.js).
// Nila: a fictional adult (27) professional. Every service is paid from the player's balance (Story.pay → Wallet):
//   contract  long range: the player picks a person on the phone's satellite view (people near him only). She takes a
//             firing position on a flat roof with a parapet that really has a clear line of fire (collision ray from the
//             muzzle to the head), and an in-engine cinematic plays: establishing shot, the unaware mark through a long
//             lens, over the shoulder, the scope view with breathing sway settling, the shot, a slow-motion chase camera
//             behind the round, the round passing through the head (the game's own blood decals / spray — the blood
//             setting is respected — and ragdoll, no dismemberment), witnesses scattering, the bolt cycled. The player is
//             not blamed (the police only answer crimes the player commits).
//   guard     bodyguard for one in-game day: walks behind the player's shoulder, follows by car (off screen) while he
//             drives, and stands guard outside the door while he is inside the club, his home or any other interior
//   evening   a private evening (18+, consensual, implied only): she meets him at his home door, the screen fades to
//             black and time passes; nothing explicit is shown
// Her body is the full-body female base (DancerBody.js) in the tactical wardrobe (DancerRig.js buildTactical).
import * as THREE from 'three';
import { Character, solveArmIK } from './Character.js';
import { makeAppearance } from './Appearance.js';
import { flushDancerPaint, dancerPaintPending } from './DancerBody.js';
import { buildWeaponModel } from '../combat/WeaponModels.js';
import { WEAPONS } from '../combat/WeaponDefs.js';
import { Audio } from '../audio/Audio.js';
import { isHeroRoom, HERO_ROOMS } from '../world/HeroRooms.js';
import { LAND_Y } from '../world/Layout.js';
import { clamp, lerp, dampAngle } from '../core/math.js';

export const ORCHID = { name: 'Nila', age: 27, fees: { contract: 40000, guard: 18000, evening: 12000 }, guardHours: 24, radius: 80 };
const RIFLE = WEAPONS.find((w) => w.id === 'precision');
const PISTOL = WEAPONS.find((w) => w.id === 'compact');

export function assassinSpec() {
  return makeAppearance(9901, {
    dancerBody: 'ruby', wear: 'tactical', preset: 'f_student', outfit: 'tactical', label: 'Nila (contractor)', ageYears: ORCHID.age, height: 1.69, build: 0.96, belly: 0,
    hair: 'ponytail', hairColor: '#150e0a', top: '#23262b', bottom: '#191a1d', shoes: '#111112', sole: '#0b0b0c', gloves: '#0f0f10', belt: '#1d1813',
    // her own skin tone and restrained make-up (not the club's stage colours)
    look: { skin: '#94603f', lips: '#7d3f3a', shadow: '#3b2c27', liner: 0.8, blush: '#9c4e40', nails: '#2a1d1b', gloss: 0.35 },
    heels: true, sandals: false, sleeveless: false, longSleeve: true, collar: true, earrings: false, necklace: false,
    bag: undefined, crossbody: undefined, lanyard: undefined, glasses: false, sunglasses: false, watch: undefined, cap: undefined, skirt: undefined,
  });
}

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _fr = new THREE.Frustum();
const ease = (t) => t * t * (3 - 2 * t);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Assassin {
  constructor(game) { this.g = game; this.ch = null; this.m = null; this.guard = null; this.evening = null; this.cine = null; this.visible = false; this.scope = null; this.card = null; this.leaveT = 0; }
  // ------------------------------------------------------------------ helpers
  hours() { const A = this.g.atmos; return (A.day || 1) * 24 + A.hour; }
  money() { return this.g.story.state.money; }
  busyReason(guard = false) {
    const g = this.g; if (g.director.active || this.cine) return 'Not now — she is busy.';
    if (!guard && g.police && g.police.level > 0) return 'Not while the police are looking for you.'; return null;
  }
  activeHeroId() { const sq = this.g.squad; return (sq && sq.activeMember && sq.activeMember.def && sq.activeMember.def.id) || 'dineth'; }
  activeName() { const sq = this.g.squad; return (sq && sq.activeMember && sq.activeMember.def && sq.activeMember.def.name) || 'Dineth'; }
  homeDoor() { const I = this.g.interiors; if (!I || !I.doors) return null; const id = this.activeHeroId(); return I.doors.find((d) => d.owner === id) || I.doors.find((d) => d.id === 'room') || I.doors.find((d) => isHeroRoom(d.id)) || null; } // before Dineth has his room: a friend's place
  homeName() { const d = this.homeDoor(); const R = d && HERO_ROOMS[d.id]; return R ? `${R.name}, ${R.area}` : 'your home'; }
  msg(text) { const S = this.g.story.state; const A = this.g.atmos; (S.msgs || (S.msgs = [])).unshift({ from: 'Black Orchid · Nila', text, when: A ? `Day ${A.day} ${A.timeString}` : '' }); }
  guardLeft() { return this.guard ? Math.max(0, this.guard.until - this.hours()) : 0; }
  // ------------------------------------------------------------------ character
  ensureChar() {
    if (this.ch) return this.ch; const g = this.g; const ch = new Character(assassinSpec()); ch.isAssassin = true; ch.id = 'orchid'; this.ch = ch;
    // thigh holster with the compact pistol, outside of the right thigh
    const hol = new THREE.Group(); const leather = new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.55 });
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.042), leather); shell.position.set(0, -0.03, 0); hol.add(shell);
    for (const y of [-0.0, -0.09]) { const strap = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.022, 0.135), leather); strap.position.set(0.055, y, 0); hol.add(strap); }
    const pistol = buildWeaponModel(PISTOL); pistol.rotation.x = Math.PI / 2; pistol.position.set(0, 0.05, -0.005); hol.add(pistol);
    hol.position.set(-0.085, -0.17, 0.0); ch.bones.thighR.add(hol); this.holster = hol;
    // the precision rifle (with its own bipod), carried only in the contract cinematic
    const rifle = buildWeaponModel(RIFLE); rifle.visible = false; this.rifle = rifle; g.scene.add(rifle);
    g.scene.add(ch.root); ch.root.visible = false;
    this.m = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, mom: null, ch, def: { speed: 1 } };
    return ch;
  }
  place(x, z, yaw, y = null) { const g = this.g, m = this.m; m.x = x; m.z = z; m.y = y ?? g.collision.groundAt(x, z, (g.player.y || 0) + 0.5); m.yaw = yaw; m.speed = 0; this.sync(); }
  sync() { const m = this.m; this.ch.root.position.set(m.x, m.y, m.z); this.ch.root.rotation.set(0, m.yaw, 0); this.ch.yaw = m.yaw; }
  show(v) { if (!this.ch) return; this.ch.root.visible = v; this.visible = v; }
  inView(x, y, z) { const cam = this.g.camera; _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_m); return _fr.containsPoint(_v.set(x, y + 1, z)); }
  // a free spot ~d m behind the player, out of view when possible (she arrives without popping up in front of the camera)
  spotNear(d = 9) {
    const g = this.g, P = g.player, col = g.collision; let best = null;
    for (let k = 0; k < 16; k++) { const a = P.yaw + Math.PI + (k % 2 ? 1 : -1) * Math.floor((k + 1) / 2) * 0.35, r = d + (k % 3); const x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
      if (col.blocked(x, z, 0.4) || Math.abs(col.groundAt(x, z, P.y + 0.5) - P.y) > 0.8) continue; if (!this.inView(x, P.y, z)) return { x, z }; if (!best) best = { x, z }; }
    return best || { x: P.x - Math.sin(P.yaw) * 1.6, z: P.z - Math.cos(P.yaw) * 1.6 };
  }
  // ------------------------------------------------------------------ services
  hireGuard() {
    const why = this.busyReason(true); if (why) return { ok: false, msg: why };
    if (this.guard) return { ok: false, msg: 'She is already on duty with you.' };
    const fee = ORCHID.fees.guard; if (this.money() < fee) return { ok: false, msg: `Insufficient balance — Rs. ${fee.toLocaleString('en-LK')} needed.` };
    this.g.story.pay(-fee, 'Black Orchid — bodyguard for a day'); this.ensureChar();
    this.guard = { until: this.hours() + ORCHID.guardHours, at: null, idleT: 0, away: true, noted: {} };
    this.msg('On my way. I stay with you until this time tomorrow. Club, home, anywhere with a door — I wait outside it.');
    return { ok: true, msg: `Nila is on duty for ${ORCHID.guardHours} in-game hours. She keeps to your shoulder and waits outside whenever you go in somewhere.` };
  }
  dismissGuard(silent = false) { if (!this.guard) return; this.guard = null; this.leaveT = 4; if (!silent) this.g.hud.notify('Black Orchid', 'Nila: “That’s my shift. Stay out of trouble.”', 'info', 4.5); }
  bookEvening() {
    const why = this.busyReason(); if (why) return { ok: false, msg: why };
    if (this.evening) return { ok: false, msg: 'You already have an evening booked.' };
    const door = this.homeDoor(); if (!door) return { ok: false, msg: 'No home address on file.' };
    const fee = ORCHID.fees.evening; if (this.money() < fee) return { ok: false, msg: `Insufficient balance — Rs. ${fee.toLocaleString('en-LK')} needed.` };
    this.g.story.pay(-fee, 'Black Orchid — private evening'); this.ensureChar(); this.evening = { door };
    this.g.hud.setWaypoint(door.x, door.z); this.msg(`I'll meet you at your door — ${this.homeName()}. Don't keep me waiting.`);
    return { ok: true, msg: `Booked. She meets you at ${this.homeName()} (GPS set). The evening begins when you reach your door.` };
  }
  // people a contract can be placed on: alive, on the street around the player
  targets() {
    const g = this.g, P = g.player; const out = []; if (g.indoor) return out;
    for (const p of g.crowd.peds) { if (p.dead || p.state === 'down' || p.ch.rag || p.koRag || !p.ch.root.parent) continue; const d = Math.hypot(p.x - P.x, p.z - P.z); if (d > ORCHID.radius || d < 3) continue; out.push({ p, d }); }
    out.sort((a, b) => a.d - b.d); return out;
  }
  describe(p) { const s = p.ch.spec || {}; const who = s.sex === 'f' || /^f_/.test(s.preset || '') ? 'Woman' : 'Man'; const age = s.ageYears ? `, about ${Math.round(s.ageYears / 5) * 5}` : ''; const lab = String(s.label || '').replace(/\s*\(.*\)/, '').trim(); return `${who}${age}${lab ? ' · ' + lab : ''}`; }
  // ------------------------------------------------------------------ firing position: a flat roof with a parapet and a clear line of fire
  headPoint(p, out = new THREE.Vector3()) { const hb = p.ch.bones && p.ch.bones.head; if (!hb) return out.set(p.x, (p.y || 0) + (p.ch.spec.height || 1.7) - 0.1, p.z); hb.updateWorldMatrix(true, false); return out.set(0, 0.09, 0.02).applyMatrix4(hb.matrixWorld); }
  findVantage(p) {
    const g = this.g, col = g.collision, P = g.player; const H = this.headPoint(p); const R = 240; const cands = [];
    for (const c of col.query(H.x - R, H.z - R, H.x + R, H.z + R)) {
      const b = c.b; if (c.kind !== 'building' || !b || b.tower || (b.roof && b.roof !== 'flat') || c.walkUnder) continue; if (c.x1 - c.x0 < 8 || c.z1 - c.z0 < 8) continue;
      const top = LAND_Y + b.h; const elev = top - H.y; if (elev < 6 || elev > 45) continue;
      const qx = clamp(H.x, c.x0 + 3.5, c.x1 - 3.5), qz = clamp(H.z, c.z0 + 3.5, c.z1 - 3.5); const d = Math.hypot(H.x - qx, H.z - qz); if (d < 50 || d > R) continue;
      if (elev / d > 0.25) continue; // over the parapet from a kneeling rest: no steeper than ~14° down
      if (Math.hypot(qx - P.x, qz - P.z) > 250) continue; // the roof detail (parapets) is streamed round the player
      cands.push({ c, b, top, qx, qz, d, score: Math.abs(d - 120) / 50 + Math.abs(elev - 16) / 10 + Math.random() * 0.4 });
    }
    cands.sort((a, b) => a.score - b.score);
    for (const k of cands.slice(0, 80)) {
      const c = k.c; const dx = H.x - k.qx, dz = H.z - k.qz, dl = Math.hypot(dx, dz); const ux = dx / dl, uz = dz / dl;
      const tx = ux > 1e-6 ? (c.x1 - k.qx) / ux : ux < -1e-6 ? (c.x0 - k.qx) / ux : 1e9, tz = uz > 1e-6 ? (c.z1 - k.qz) / uz : uz < -1e-6 ? (c.z0 - k.qz) / uz : 1e9; const te = Math.min(tx, tz);
      const ex = k.qx + ux * te, ez = k.qz + uz * te; // the roof edge on the line of fire
      // no other building part standing on her spot (taller wing, neighbour overlapping the roof)
      let blocked = false; for (const o of col.query(ex - 1.5, ez - 1.5, ex + 1.5, ez + 1.5)) { if (o === c || o.h <= 0) continue; if ((o.y0 || 0) + o.h > k.b.h - 0.5 && ex > o.x0 - 1 && ex < o.x1 + 1 && ez > o.z0 - 1 && ez < o.z1 + 1) { blocked = true; break; } } if (blocked) continue;
      const mx = ex + ux * 0.45, mz = ez + uz * 0.45, my = k.top + 1.12; // muzzle out past the parapet, rifle at kneeling shoulder height
      if (col.raycast(mx, my, mz, H.x, H.y, H.z, 0.04, true) < 0.995) continue;
      // the rifle passes over the parapet (0.9 m; villas 0.5 m)
      const slope = (H.y - my) / Math.hypot(H.x - mx, H.z - mz); if (1.12 + slope * 0.7 < (k.b.style === 'villa' ? 0.6 : 1.0)) continue;
      return { x: ex - ux * 0.62, z: ez - uz * 0.62, y: k.top, yaw: Math.atan2(ux, uz), edge: V(ex, k.top, ez), u: V(ux, 0, uz), muzzle: V(mx, my, mz), dist: Math.hypot(H.x - mx, H.y - my, H.z - mz), c, b: k.b };
    }
    return null;
  }
  contract(p) {
    const why = this.busyReason(); if (why) return { ok: false, msg: why };
    if (!p || p.dead || !this.g.crowd.peds.includes(p)) return { ok: false, msg: 'That person is no longer in range.' };
    const fee = ORCHID.fees.contract; if (this.money() < fee) return { ok: false, msg: `Insufficient balance — Rs. ${fee.toLocaleString('en-LK')} needed.` };
    const v = this.findVantage(p); if (!v) return { ok: false, msg: 'No rooftop nearby has a clean line on that person. Pick someone else — you have not been charged.' };
    this.g.story.pay(-fee, 'Black Orchid — long-range contract'); this.ensureChar(); this.startCine(p, v);
    return { ok: true, msg: `Contract accepted. Rooftop position, ${Math.round(v.dist)} m.` };
  }
  // ------------------------------------------------------------------ per frame (Game.updatePlay, after the squad and the director)
  update(dt) {
    const g = this.g; if (!this.ch) return;
    if (dancerPaintPending() && g.renderer) flushDancerPaint(g.renderer); // her skin texture is painted once on the GPU (the club does the same for its dancers)
    if (this.cine) { try { this.updateCine(dt); } catch (e) { console.error(e); this.endCine(true); } return; }
    if (g.director.active) return;
    if (this.evening) this.updateEvening();
    if (this.guard) this.updateGuard(dt);
    else if (this.visible) { // walking off after the shift
      const P = g.player, m = this.m; this.leaveT -= dt; const ax = m.x - P.x, az = m.z - P.z, l = Math.hypot(ax, az) || 1;
      if (g.squad && g.squad.steer) g.squad.steer(m, dt, m.x + (ax / l) * 6, m.z + (az / l) * 6, 1.4, g.bodies || []);
      if (this.leaveT <= 0 && (!this.inView(m.x, m.y, m.z) || l > 35)) this.show(false);
    }
  }
  updateGuard(dt) {
    const g = this.g, P = g.player, G = this.guard, m = this.m, A = this.ch.anim;
    if (this.hours() > G.until) { this.dismissGuard(); return; }
    const room = g.interiors && g.interiors.current;
    if (g.indoor || room) { // he is inside: she stands beside the door outside, back to the wall, watching the street
      const d = room && room.door;
      if (d && G.at !== d) { G.at = d; const out = (d.faceIn ?? 0) + Math.PI; const fx = Math.sin(out), fz = Math.cos(out), sx = Math.cos(out), sz = -Math.sin(out);
        let x = d.x + fx * 1.1 + sx * 1.0, z = d.z + fz * 1.1 + sz * 1.0; if (g.collision.blocked(x, z, 0.3)) { x = d.x + fx * 1.4 - sx * 1.0; z = d.z + fz * 1.4 - sz * 1.0; }
        this.place(x, z, out + 0.35, g.collision.groundAt(x, z, 1)); this.show(true); A.play('crossarms', 1e6);
        const key = room.id || 'room'; if (!G.noted[key]) { G.noted[key] = 1; const nm = room.id === 'club' ? 'the club' : isHeroRoom(room.id) ? 'your door' : 'the door'; g.hud.notify('Black Orchid', `Nila is standing guard outside ${nm}.`, 'info', 4); } }
      if (this.visible) A.update(dt, 0, 0); return;
    }
    if (G.at) { G.at = null; G.idleT = 0; A.set(null); } // he came back out: she is right there by the door
    if (P.vehicle) { // driving: she follows in her own car, off screen, and is back at his shoulder when he gets out
      if (this.visible && (Math.hypot(P.x - m.x, P.z - m.z) > 20 || !this.inView(m.x, m.y, m.z))) { this.show(false); G.away = true; if (!G.noted.car) { G.noted.car = 1; g.hud.notify('Black Orchid', 'Nila follows in her own car.', 'info', 3); } }
      if (this.visible) A.update(dt, 0, 0); return;
    }
    if (G.away || !this.visible) { const s = this.spotNear(9); this.place(s.x, s.z, P.yaw); this.show(true); G.away = false; }
    const dL = Math.hypot(P.x - m.x, P.z - m.z); if (dL > 45) { const s = this.spotNear(9); this.place(s.x, s.z, P.yaw); }
    // ~2 m behind and to the left of the player, covering his back
    if (P.speed > 0.3) G.restYaw = P.yaw; const yaw = G.restYaw ?? P.yaw; const sx = Math.cos(yaw), sz = -Math.sin(yaw);
    let tx = P.x - Math.sin(yaw) * 1.9 + sx * 0.9, tz = P.z - Math.cos(yaw) * 1.9 + sz * 0.9; if (g.collision.blocked(tx, tz, 0.3)) { tx = P.x - Math.sin(yaw) * 1.5; tz = P.z - Math.cos(yaw) * 1.5; }
    const d = Math.hypot(tx - m.x, tz - m.z); let want = 0;
    if (d > 0.45) { want = clamp((P.speed || 0) + (dL - 2.1) * 0.9, d > 1.2 ? 1.3 : 0.7, P.sprinting || dL > 10 ? 6.0 : 3.4); if (d < 1.2) want = Math.min(want, 0.6 + d); }
    if (g.squad && g.squad.steer) g.squad.steer(m, dt, tx, tz, want, g.bodies || []); else A.update(dt, 0, 0);
    if (m.speed < 0.15) { G.idleT += dt; m.yaw = dampAngle(m.yaw, yaw + 0.5, 3, dt); this.sync(); if (G.idleT > 6 && !A.action && Math.random() < dt * 0.15) { A.play(Math.random() < 0.5 ? 'crossarms' : 'watch', 4); G.idleT = 0; } }
    else { G.idleT = 0; if (A.action === 'crossarms' || A.action === 'watch') A.set(null); }
  }
  updateEvening() {
    const g = this.g, P = g.player, E = this.evening; if (g.indoor || P.vehicle || (g.police && g.police.level > 0) || this.cine) return;
    if (Math.hypot(P.x - E.door.x, P.z - E.door.z) < 6) this.playEvening();
  }
  async playEvening() {
    const g = this.g, P = g.player, D = g.director, E = this.evening; this.evening = null; const door = E.door; const ch = this.ensureChar();
    const out = (door.faceIn ?? 0) + Math.PI; const fx = Math.sin(out), fz = Math.cos(out), sx = Math.cos(out), sz = -Math.sin(out); const gy = P.y || 0;
    D.begin(); g.weapons?.forceHolster?.(); g.hud.clearWaypoint?.();
    if (!this.visible || Math.hypot(this.m.x - door.x, this.m.z - door.z) > 10) { this.place(door.x + fx * 1.4 + sx * 1.3, door.z + fz * 1.4 + sz * 1.3, out + Math.PI); this.show(true); }
    ch.anim.set(null); D.face(ch, P.x, P.z); this.m.yaw = ch.yaw;
    const camP = [door.x + fx * 5.5 + sx * 2.4, gy + 1.9, door.z + fz * 5.5 + sz * 2.4], look = [door.x + fx * 1.4, gy + 1.35, door.z + fz * 1.4];
    D.hold(camP, look);
    await D.say('Nila', 'You look like you have had a long day.', 2.8, '', 'en', ch);
    await D.say(this.activeName(), 'It just got better.', 2.0);
    const w1 = D.walkTo(P.ch, door.x + fx * 0.55 - sx * 0.3, door.z + fz * 0.55 - sz * 0.3, 1.2), w2 = D.walkTo(ch, door.x + fx * 0.65 + sx * 0.35, door.z + fz * 0.65 + sz * 0.35, 1.2);
    D.shot({ pos: camP, look }, { pos: [camP[0] - fx * 1.8, camP[1] - 0.25, camP[2] - fz * 1.8], look: [door.x, gy + 1.4, door.z] }, 3.0);
    await Promise.race([Promise.all([w1, w2]), D.wait(3.2)]);
    await g.hud.fade(1, 1.1);
    this.showCard('Later that night…', 'A private evening. What happens behind closed doors stays there.');
    await new Promise((r) => setTimeout(r, 2800));
    g.atmos.advance(180); if (g.health) g.health.hp = Math.max(g.health.hp, 100); P.stamina = 1;
    P.teleport(door.x + fx * 1.3, door.z + fz * 1.3, out); this.hideCard();
    if (this.guard) this.place(door.x + fx * 1.5 + sx * 1.2, door.z + fz * 1.5 + sz * 1.2, out); else this.show(false);
    D.end(); await g.hud.fade(0, 1.0);
    g.hud.notify('Black Orchid', 'Nila: “Same time next week? You know where to find me.”', 'info', 5);
    this.msg('Thank you for a lovely evening. Discretion is part of the service — always.');
  }
  showCard(title, sub) { if (!this.card) { this.card = document.createElement('div'); this.card.className = 'orchid-card'; document.body.appendChild(this.card); } this.card.innerHTML = `<b>${title}</b><span>${sub}</span>`; this.card.classList.add('on'); }
  hideCard() { if (this.card) this.card.classList.remove('on'); }
  // ------------------------------------------------------------------ the contract cinematic
  startCine(p, v) {
    const g = this.g, D = g.director, ch = this.ch, cam = g.camera;
    D.begin(); D.shotT = null; g.weapons?.forceHolster?.(); if (g.phone && g.phone.open) g.phone.toggle(false);
    this.wasVisible = this.visible; this.place(v.x, v.z, v.yaw, v.y); this.show(true);
    ch.anim.set('kneel'); ch.anim.update(1.0, 0, 0); ch.handGrip = { L: true, R: true }; this.rifle.visible = true; ch.anim.postPose = (b) => this.poseRest(b);
    // the mark is unaware: stops for a phone call (seated people stay seated)
    const held = p.state === 'walk' || p.state === 'toPoi' || p.state === 'waitCross'; if (held) { g.crowd.react(p, 'idle', 40); p.ch.anim.play('phone', 40); }
    this.cine = { p, v, t: 0, phase: 'wide', fov0: cam.fov, near0: cam.near, zoom0: cam.zoom, fired: false, hit: false, held, aim: this.headPoint(p, V()) };
    cam.near = 0.05; cam.updateProjectionMatrix(); this.markCam = this.findMarkCam(p);
    g.hud.subtitle('Nila', 'In position. Light wind, left to right.', '', 2.8, 'en');
  }
  // street-level long-lens view of the mark that is not inside a wall
  findMarkCam(p) {
    const g = this.g, H = this.headPoint(p, V()); const col = g.collision; const base = Math.atan2(this.cine.v.x - H.x, this.cine.v.z - H.z);
    for (const da of [0.9, -0.9, 1.6, -1.6, 0.4, -0.4, 2.4, -2.4]) { const a = base + da, r = 7.5; const x = H.x + Math.sin(a) * r, z = H.z + Math.cos(a) * r, y = H.y + 0.15;
      if (col.blocked(x, z, 0.4)) continue; if (col.raycast(x, y, z, H.x, H.y, H.z, 0.05, true) < 0.98) continue; return V(x, y, z); }
    return V(H.x + 5, H.y + 1.5, H.z + 5);
  }
  // kneeling behind the parapet, the rifle rested on it: butt in the right shoulder, cheek on the stock, aimed at the head
  poseRest(b) {
    const C = this.cine, ch = this.ch; if (!C) return; const T = C.aim;
    b.spine.rotation.x += 0.16; b.chest.rotation.x += 0.08; b.chest.rotation.y -= 0.12; b.neck.rotation.x += 0.12; b.head.rotation.set(0.22, -0.08, -0.2);
    ch.root.updateMatrixWorld(true);
    const sh = b.armR.getWorldPosition(V()); const chestW = b.chest.getWorldPosition(V()); const butt = sh.lerp(chestW, 0.3); butt.y -= 0.02;
    const dir = T.clone().sub(butt).normalize(); const yaw = Math.atan2(dir.x, dir.z), pitch = Math.asin(clamp(dir.y, -1, 1));
    const R = this.rifle, ud = R.userData; R.rotation.set(-pitch, yaw, 0, 'YXZ'); R.position.copy(butt).addScaledVector(dir, -(ud.stockZ ?? -0.31)); R.updateMatrixWorld(true);
    const grip = V(-0.012, -0.045, -0.085).applyMatrix4(R.matrixWorld), fore = V(0.012, (ud.support ? ud.support.y : 0) - 0.04, (ud.support ? ud.support.z : 0.3) - 0.06).applyMatrix4(R.matrixWorld);
    b.chest.updateWorldMatrix(true, false); const inv = _m.copy(b.chest.matrixWorld).invert();
    solveArmIK(b, 'R', grip.applyMatrix4(inv), null, 1, V(-0.7, -0.6, 0.2));
    solveArmIK(b, 'L', fore.applyMatrix4(inv), null, 1, V(0.3, -1, 0.2));
    C.muzzleW = (ud.muzzle ? ud.muzzle.clone() : V(0, 0.07, 1)).applyMatrix4(R.matrixWorld); C.dirW = dir;
  }
  setLens(cam, fov) { // long lenses by zoom (THREE.LOD divides distances by zoom, so the mark keeps its near-detail face)
    const base = 40; const z = Math.max(1, base / fov); const f = Math.min(base, fov * z); if (Math.abs(cam.fov - f) > 1e-3 || Math.abs(cam.zoom - z) > 1e-3) { cam.fov = f; cam.zoom = z; cam.updateProjectionMatrix(); }
  }
  updateCine(dt) {
    const g = this.g, C = this.cine, cam = g.camera, ch = this.ch, p = C.p; const slow = g.timeSlow || 1; const rdt = Math.min(0.1, dt / slow); C.t += rdt;
    if (!C.fired && (p.dead || !g.crowd.peds.includes(p))) { g.hud.notify('Black Orchid', 'The mark left the street before she could take the shot. Fee refunded.', 'warn', 5); g.story.pay(ORCHID.fees.contract, 'Black Orchid — refund (contract aborted)'); this.endCine(true); return; }
    ch.anim.update(dt, 0, 0);
    if (!C.fired && C.held && p.state !== 'idle' && !p.dead && p.state !== 'down') { g.crowd.react(p, 'idle', 40); p.ch.anim.play('phone', 40); } // stays on the call until the shot
    const H = this.headPoint(p, V()); if (!C.fired) C.aim.copy(H);
    const v = C.v, fwd = V(Math.sin(v.yaw), 0, Math.cos(v.yaw)), side = V(Math.cos(v.yaw), 0, -Math.sin(v.yaw)); const head = ch.bones.head.getWorldPosition(V());
    const T_WIDE = 3.2, T_MARK = 2.6, T_SH = 2.6, T_SCOPE = 4.2;
    if (C.phase === 'wide') { const k = ease(clamp(C.t / T_WIDE, 0, 1)); const base = V(v.x, v.y, v.z);
      const from = base.clone().addScaledVector(fwd, -8.5).addScaledVector(side, -4.5).setY(v.y + 5.2), to = base.clone().addScaledVector(fwd, -4.4).addScaledVector(side, -2.2).setY(v.y + 2.5);
      cam.position.lerpVectors(from, to, k); const lk = head.clone().lerp(C.aim, 0.06); cam.lookAt(lk); this.setLens(cam, 44);
      if (C.t > T_WIDE) { C.phase = 'mark'; C.t = 0; } }
    else if (C.phase === 'mark') { const k = C.t / T_MARK; const mc = this.markCam; cam.position.copy(mc).addScaledVector(side, 0.25 * k); cam.lookAt(H.x, H.y - 0.15, H.z); this.setLens(cam, lerp(26, 20, k));
      if (C.t > T_MARK) { C.phase = 'shoulder'; C.t = 0; g.hud.subtitle('Nila', 'Target confirmed.', '', 1.8, 'en'); } }
    else if (C.phase === 'shoulder') { const k = ease(clamp(C.t / T_SH, 0, 1)); const dir = C.dirW || fwd;
      cam.position.copy(head).addScaledVector(dir, -1.9 + 0.4 * k).addScaledVector(side, -0.55 + 0.12 * k).setY(head.y + 0.62 - 0.16 * k); cam.lookAt(C.aim); this.setLens(cam, lerp(34, 16, k)); // over her right shoulder, the rifle and the street beyond
      if (C.t > T_SH) { C.phase = 'scope'; C.t = 0; this.showScope(true); this.breath(); } }
    else if (C.phase === 'scope') { const k = clamp(C.t / T_SCOPE, 0, 1); const M = C.muzzleW || v.muzzle; const dist = M.distanceTo(C.aim);
      // breathing sway settling as she holds her breath, a faint pulse tremor at the end
      const amp = 0.2 * (1 - ease(clamp(k / 0.78, 0, 1))) + 0.01; const t = C.t;
      const sx = Math.sin(t * 1.3) * amp + Math.sin(t * 7.1) * 0.005, sy = Math.sin(t * 0.9 + 1) * amp * 0.7 + Math.sin(t * 8.3) * 0.004;
      cam.position.copy(M).addScaledVector(C.dirW || fwd, 0.25); cam.lookAt(C.aim.x + side.x * sx, C.aim.y + sy, C.aim.z + side.z * sx); this.setLens(cam, clamp(2 * Math.atan(1.1 / dist) * 180 / Math.PI, 0.5, 10));
      if (C.t > T_SCOPE) this.fire(); }
    else if (C.phase === 'bullet') this.updateBullet(rdt, H);
    else if (C.phase === 'after') { const k = clamp(C.t / 2.8, 0, 1); // slow motion eases back to real time as the body goes down
      g.timeSlow = lerp(0.05, 1, ease(clamp((C.t - 0.7) / 1.7, 0, 1))); const B = C.side; const bb = p.ch.bones; const tgt = (bb.chest || bb.spine || bb.head).getWorldPosition(V()).lerp(H, 0.35); B.look.lerp(tgt, 1 - Math.exp(-rdt * 4)); // keeps the falling body framed
      cam.position.copy(B.pos).addScaledVector(B.away, 1.2 * ease(k)).setY(B.pos.y + 0.4 * ease(k)); cam.lookAt(B.look); this.setLens(cam, lerp(30, 40, k));
      if (C.t > 2.8) { g.timeSlow = 1; C.phase = 'roof'; C.t = 0; g.hud.subtitle('Nila', 'Contract complete. I was never here.', '', 2.6, 'en'); } }
    else if (C.phase === 'roof') { const k = ease(clamp(C.t / 3.4, 0, 1)); const base = V(v.x, v.y, v.z);
      cam.position.copy(base).addScaledVector(fwd, 0.45).addScaledVector(side, -2.2 - 0.5 * k).setY(v.y + 1.25 + 0.25 * k); cam.lookAt(head.x, head.y - 0.12, head.z); this.setLens(cam, 36);
      this.boltAnim(C.t); if (C.t > 3.4) { C.phase = 'out'; C.t = 0; g.hud.fade(1, 0.6); } }
    else if (C.phase === 'out') { if (C.t > 0.7) this.endCine(false); }
  }
  breath() { if (!Audio.ready) return; Audio.noise(1.4, { f: 380, q: 0.5, type: 'lowpass', vol: 0.05, attack: 0.5 }); Audio.noise(1.0, { f: 300, q: 0.5, type: 'lowpass', vol: 0.035, attack: 0.3, when: 2.0 }); }
  showScope(on) {
    if (!this.scope) { const s = document.createElement('div'); s.className = 'orchid-scope';
      const dots = [-40, -30, -20, -10, 10, 20, 30, 40].map((k) => `<circle cx="${k}" cy="0" r="0.9"/><circle cx="0" cy="${k}" r="0.9"/>`).join('');
      s.innerHTML = `<svg viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid meet"><g stroke="#050505" fill="none"><path d="M-100 0H-5M5 0H100M0 -100V-5M0 5V100" stroke-width="0.7"/><path d="M-100 0H-60M60 0H100M0 60V100" stroke-width="2.6"/></g><g fill="#050505">${dots}</g><circle r="0.6" fill="#b01818"/></svg><i></i>`;
      document.body.appendChild(s); this.scope = s; }
    this.scope.classList.toggle('on', on);
  }
  fire() {
    const g = this.g, C = this.cine, p = C.p; C.fired = true; C.phase = 'bullet'; C.t = 0; this.showScope(false);
    const M = (C.muzzleW || C.v.muzzle).clone(); const H = this.headPoint(p, V()); const dir = H.clone().sub(M).normalize(); C.M = M;
    if (g.weapons) { try { g.weapons.flash(M, dir, RIFLE); } catch (e) { /* effects not ready */ } g.weapons.gunSound(RIFLE, M.x, M.z); }
    if (Audio.ready) Audio.noise(2.4, { f: 420, q: 0.4, type: 'lowpass', vol: 0.14, attack: 0.04, when: 0.12, buf: Audio.brownBuf }); // the report rolling off the buildings
    // the round: a copper-jacketed bullet trailing a faint shock-wave streak
    const bullet = new THREE.Group(); const cu = new THREE.MeshStandardMaterial({ color: 0xd08a55, metalness: 0.55, roughness: 0.3, emissive: 0x2a1306 }); // copper jacket (no env map on the street: full metalness would read black)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0039, 0.0039, 0.022, 14), cu); body.rotation.x = Math.PI / 2; bullet.add(body);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0039, 0.017, 14), cu); tip.rotation.x = Math.PI / 2; tip.position.z = 0.0195; bullet.add(tip);
    const trailM = new THREE.MeshBasicMaterial({ color: 0xdfe6ea, transparent: true, opacity: 0.12, depthWrite: false }); const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0015, 1, 10, 1, true), trailM);
    trail.geometry.translate(0, 0.5, 0); trail.rotation.x = -Math.PI / 2; bullet.add(trail); this.trail = { mesh: trail, m: trailM };
    bullet.position.copy(M); bullet.lookAt(H); g.scene.add(bullet); C.bullet = bullet; C.k = 0; C.flight = 2.6; C.slowAt = 0.09; this.camRoll = 0;
    g.crowd.alarm(C.v.x, C.v.z, 60, 1, null, 'gunshot', false);
  }
  updateBullet(rdt, H) {
    const g = this.g, C = this.cine, cam = g.camera, b = C.bullet;
    if (C.slowAt > 0) { C.slowAt -= rdt; if (C.slowAt <= 0) g.timeSlow = 0.05; } // let the muzzle flash read, then slow the world right down
    if (!C.hit) C.k = Math.min(1, C.k + rdt / C.flight); const k = C.k; const M = C.M; const dir = H.clone().sub(M).normalize();
    const pos = C.hit ? b.position : M.clone().lerp(H, k); if (!C.hit) { b.position.copy(pos); b.lookAt(pos.clone().add(dir)); }
    this.trail.mesh.scale.y = Math.max(0.01, Math.min(4, M.distanceTo(pos))); // the wake streams back from the base (−z)
    const up = V(0, 1, 0), side = V().crossVectors(dir, up).normalize();
    if (k < 0.82) { this.camRoll += rdt * 0.7; const off = side.clone().multiplyScalar(Math.cos(this.camRoll) * 0.045).addScaledVector(up, 0.03 + Math.sin(this.camRoll) * 0.025);
      cam.position.copy(pos).addScaledVector(dir, -0.22).add(off); cam.lookAt(pos.clone().addScaledVector(dir, 3)); this.setLens(cam, lerp(40, 30, k)); }
    else { if (!C.side) { const sp = H.clone().addScaledVector(side, -1.45).addScaledVector(dir, 0.35); sp.y = H.y + 0.06; C.side = { pos: sp, look: H.clone(), away: sp.clone().sub(H).setY(0).normalize() }; }
      C.side.look.lerp(H, 1 - Math.exp(-rdt * 7)); cam.position.copy(C.side.pos); cam.lookAt(C.side.look); this.setLens(cam, 30); } // follows the head as the round drives it sideways
    if (k >= 1 && !C.hit) this.impact(H, dir);
    if (C.hit) { C.after = (C.after || 0) + rdt; b.position.addScaledVector(dir, (rdt / C.flight) * M.distanceTo(H) * 0.6); if (C.after > 0.55) { g.scene.remove(b); C.phase = 'after'; C.t = 0; } }
  }
  impact(H, dir) {
    const g = this.g, C = this.cine, p = C.p; C.hit = true;
    const entry = H.clone().addScaledVector(dir, -0.08), exit = H.clone().addScaledVector(dir, 0.085);
    p.contractKill = true; // Game: a 'pedHit' near the player is reported as his crime — not this one
    if (g.blood && g.blood.on) { try { g.blood.wound(p.ch, entry, dir, 1.2); g.blood.wound(p.ch, exit, dir, 1.8); g.blood.spray(exit, dir, 2.4); } catch (e) { console.warn(e); } }
    else if (g.weapons) g.weapons.puff(exit, 0x8a8478, 3);
    p.vx = 0; p.vz = 0; g.crowd.hitPed(p, dir.x, dir.z, 1.6, entry); if (!p.dead) g.crowd.kill(p);
    if (Audio.ready) Audio.noise(0.08, { f: 900, q: 0.8, vol: 0.12, type: 'lowpass', attack: 0.001 });
    // the round carries on and strikes whatever is behind
    if (g.weapons) { const h = g.weapons.trace(exit, dir, 120, 0.3); if (h && (h.kind === 'world' || h.kind === 'ground') && h.point) { g.weapons.puff(h.point, h.kind === 'ground' ? 0x6d6a64 : 0xb5ab9a, 5); g.weapons.decal(h.point, dir, h.kind); } }
    g.crowd.alarm(p.x, p.z, 40, 3, p, 'gunshot', false);
  }
  boltAnim(t) { const bolt = this.rifle && this.rifle.userData.bolt; if (!bolt) return; if (this.boltRest === undefined) this.boltRest = bolt.position.z; const c = clamp((t - 0.3) / 1.0, 0, 1); const seg = (a, b) => clamp((c - a) / (b - a), 0, 1);
    bolt.position.z = this.boltRest - 0.075 * ease(seg(0.25, 0.45)) * (1 - ease(seg(0.5, 0.7))); }
  endCine(aborted) {
    const g = this.g, C = this.cine, cam = g.camera, D = g.director; if (!C) return; this.cine = null; g.timeSlow = 1; this.showScope(false);
    if (C.bullet && C.bullet.parent) g.scene.remove(C.bullet); cam.fov = C.fov0; cam.near = C.near0; cam.zoom = C.zoom0 || 1; cam.updateProjectionMatrix();
    if (this.rifle.userData.bolt && this.boltRest !== undefined) this.rifle.userData.bolt.position.z = this.boltRest;
    this.rifle.visible = false; this.ch.anim.postPose = null; this.ch.anim.set(null); this.ch.handGrip = null; this.show(false); if (this.guard) this.guard.away = true;
    D.end(); g.hud.fade(0, 0.6);
    if (!aborted) { g.hud.notify('Black Orchid', 'Contract complete. Nothing links it to you.', 'success', 5); this.msg('Done. Clean, quiet, paid. Delete this thread.'); }
  }
  // ------------------------------------------------------------------ save / load (a guard booking and an evening booking)
  save() { return { guard: this.guard ? { until: this.guard.until } : null, evening: this.evening ? { id: this.evening.door.id } : null }; }
  load(s) {
    this.guard = null; this.evening = null; if (this.ch) this.show(false); if (!s) return;
    if (s.guard && s.guard.until > this.hours()) { this.ensureChar(); this.guard = { until: s.guard.until, at: null, idleT: 0, away: true, noted: {} }; }
    if (s.evening) { const d = (this.g.interiors.doors || []).find((q) => q.id === s.evening.id); if (d) { this.ensureChar(); this.evening = { door: d }; } }
  }
}
