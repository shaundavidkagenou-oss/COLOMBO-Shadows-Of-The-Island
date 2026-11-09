// Armed police response (4★ and above) + officer senses. Original system.
//
// Sight: an officer only knows where the suspect is when THAT officer (or a colleague, over the radio) actually sees them:
// range + field of view + a line-of-sight ray that is stopped by buildings / walls (static colliders) AND by vehicles
// (a suspect crouched behind a car is hidden). At night the range drops unless the suspect is inside an officer's torch beam.
//
// Firearms: Sri Lanka Police response officers carry the T-56 service rifle (slung on the back; drawn at 4★+). Officers
// under fire, or engaging at 4★+, run to cover behind a stationary vehicle — a parked car, a stopped civilian car or their
// own police car — on the side away from the suspect, crouch, rise to fire short bursts over the bonnet / boot, drop back,
// reload behind cover, move to new cover when the suspect flanks them, and advance carefully to the last known position
// when the suspect breaks contact. Below 4★ officers still take cover when shot at, but never fire.
// Shots are traced from the muzzle (walls, vehicles, people); an officer holds fire when a civilian or a colleague is in
// the line. Accuracy falls with distance, suspect movement, cover and darkness; the first burst after acquiring the suspect
// is the least accurate. Non-graphic: a hit is a red edge flash + damage; there is no blood or wound detail.
//
// Torches: at night, officers searching on foot carry a hand torch (armed officers: a torch clamped to the rifle). A fixed
// pool of SpotLights (created once: light counts never change, so no shader recompiles) is handed each frame to the
// torches nearest the camera; every other lit torch still shows its bright lens. Beams are clipped at walls.
import { bloomHot } from '../gfx/BloomHot.js';
import * as THREE from 'three';
import { buildT56 } from '../combat/WeaponModels.js';
import { POLICE_T56 } from '../combat/WeaponDefs.js';
import { Audio } from '../audio/Audio.js';
import { clamp, lerp } from '../core/math.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const sm = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const qE = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
const Q_GRIP = qE(-0.8, 0, 0), Q_SUP = qE(0.1, 0, -Math.PI / 2);
const POCKET = new THREE.Vector3(-0.11, 0.1, 0.07); // right-shoulder pocket, body space (same as the player's rifles)
export const ARMED_FROM = 4; // stars at which officers draw and use their rifles
export const OCCLUDER_K = 0.86; // vehicle body height used for sight / cover (roof line is lower than the mirrors/racks)
const HEAD_STAND = 1.6, HEAD_CROUCH = 0.98;

// ---------------------------------------------------------------- geometry helpers (pure; unit-tested in tools/firefight-test.mjs)
// first entry fraction of segment a→b into vehicle v's footprint (oriented box), or -1. pad widens the box.
export function segBoxT(ax, az, bx, bz, v, pad = 0) {
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const hl = (v.half || (v.T && v.T.len / 2) || 2.2) + pad, hw = ((v.T && v.T.wid) || 1.7) / 2 + pad;
  const ax0 = (ax - v.x) * fx + (az - v.z) * fz, al0 = (ax - v.x) * fz - (az - v.z) * fx; const ax1 = (bx - v.x) * fx + (bz - v.z) * fz, al1 = (bx - v.x) * fz - (bz - v.z) * fx;
  let t0 = 0, t1 = 1; const clip = (p, q) => { if (Math.abs(p) < 1e-9) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
  const dx = ax1 - ax0, dl = al1 - al0;
  if (clip(-dx, ax0 + hl) && clip(dx, hl - ax0) && clip(-dl, al0 + hw) && clip(dl, hw - al0)) return t0 <= t1 ? t0 : -1;
  return -1;
}
export function vehHeight(v) { return ((v.T && v.T.hgt) || 1.5) * OCCLUDER_K + (v.y || 0); }
// does any vehicle body block the 3D segment a→b? (skip: vehicles to ignore — the shooter's / target's own)
export function vehicleBlocks(vehicles, ax, ay, az, bx, by, bz, skipA = null, skipB = null) {
  const minX = Math.min(ax, bx) - 4, maxX = Math.max(ax, bx) + 4, minZ = Math.min(az, bz) - 4, maxZ = Math.max(az, bz) + 4;
  for (const v of vehicles) { if (v === skipA || v === skipB || v.x < minX || v.x > maxX || v.z < minZ || v.z > maxZ || !v.mesh || v.mesh.visible === false) continue; if (v.T && v.T.entry === 'bike') continue;
    const t = segBoxT(ax, az, bx, bz, v); if (t < 0) continue; const t2 = Math.min(1, t + 0.05); const y = Math.min(ay + (by - ay) * t, ay + (by - ay) * t2); if (y < vehHeight(v) && y > (v.y || 0) + 0.15) return v; }
  return null;
}

export class Firefight {
  constructor(police) { this.p = police; this.shots = 0; this.hits = 0; this.stats = { covers: 0, shots: 0, hits: 0, holds: 0, reloads: 0, flanks: 0, torchesLit: 0, coverBlocked: 0 }; this.underFireT = 99; this._v = new THREE.Vector3(); }
  get g() { return this.p.g; }
  armed() { return this.p.stars() >= ARMED_FROM; }
  night() { const A = this.g.atmos; return A ? A.night || 0 : 0; }
  vehicles() { return this.p.T ? this.p.T.all() : []; }

  // ---------------------------------------------------------------- senses
  targetPoint() { const P = this.g.player; const v = P.vehicle; if (v) return { x: v.x, y: (v.y || 0) + 1.15, z: v.z, v }; return { x: P.x, y: (P.y || 0) + (P.crouching ? 0.8 : 1.3), z: P.z, v: null }; }
  eyeY(o) { return (o.y || 0) + lerp(HEAD_STAND, HEAD_CROUCH, o.ch && o.ch.anim ? o.ch.anim.crouch || 0 : 0); }
  // raw line of sight between two points: static colliders (≥ 1 m tall walls count, 3D test) and vehicle bodies
  clear(ax, ay, az, bx, by, bz, skipA = null, skipB = null) {
    const col = this.g.collision; if (col.raycast(ax, ay, az, bx, by, bz, 0.05, false, 1.0) < 0.985) return false;
    return !vehicleBlocks(this.vehicles(), ax, ay, az, bx, by, bz, skipA, skipB);
  }
  // can officer o see the suspect right now? (throttled; cached on o.sees)
  sees(o, dt = 0) {
    o.seeT = (o.seeT || 0) - dt; if (o.seeT > 0 && dt > 0) return !!o.sees; o.seeT = 0.12 + Math.random() * 0.06;
    const g = this.g; if (g.indoor || o.mode !== 'foot') return (o.sees = false);
    const tp = this.targetPoint(); const P = g.player; const lv = this.p.stars(); const A = g.atmos;
    const dx = tp.x - o.x, dz = tp.z - o.z, d = Math.hypot(dx, dz);
    let beam = false; if (o.torchOn && o.torchDir) { const ey = this.eyeY(o); const c = (o.torchDir.x * dx + o.torchDir.y * (tp.y - ey) + o.torchDir.z * dz) / Math.max(1e-3, Math.hypot(d, tp.y - ey)); beam = c > 0.93 && d < 30; }
    const nightK = beam ? 1 : 1 - 0.38 * (A ? A.night || 0 : 0);
    const env = nightK * (1 - 0.15 * (A && A.w ? A.w.rain : 0)) * (P.crouching && !P.vehicle ? 0.7 : 1) * (tp.v ? 1.25 : 1);
    const R = (34 + lv * 4) * env * ((o.cb && o.cb.alertT > 0) ? 1.25 : 1); if (d > R) return (o.sees = false);
    // field of view: ~170° ahead; all round only within 4 m (you hear someone right next to you), or while engaging
    const fovCos = o.cb && o.cb.alertT > 0 ? -0.2 : 0.08; if (d > 4) { const c = (Math.sin(o.yaw) * dx + Math.cos(o.yaw) * dz) / d; if (c < fovCos) return (o.sees = false); }
    const ey = this.eyeY(o); const ok = this.clear(o.x, ey, o.z, tp.x, tp.y, tp.z, o.unit && o.unit.v && o.mode === 'seated' ? o.unit.v : null, tp.v);
    if (!ok && tp.v === null && P.crouching) return (o.sees = false);
    if (!ok) { const head = (P.y || 0) + (P.vehicle ? 1.3 : P.crouching ? 1.0 : 1.62); if (!P.vehicle && this.clear(o.x, ey, o.z, tp.x, head, tp.z)) return (o.sees = true); return (o.sees = false); } // the head above a low wall / car still counts
    return (o.sees = true);
  }

  // ---------------------------------------------------------------- hearing / being shot at
  onPlayerShot(x, z, hit) { // the player fired from (x,z); hit = point where the bullet stopped
    this.underFireT = 0; const P = this.g.player;
    for (const o of this.p.foot) { if (o.mode !== 'foot') continue; const d = Math.hypot(o.x - x, o.z - z); if (d > 70) continue;
      const cb = this.cb(o); cb.alertT = 6; const j = Math.min(8, d * 0.12); cb.heard = { x: x + (Math.random() * 2 - 1) * j, z: z + (Math.random() * 2 - 1) * j, t: this.p.t };
      // near miss: the bullet's path passed close to the officer (or landed close) → suppressed, go to cover
      let near = hit ? Math.hypot(hit.x - o.x, hit.z - o.z) < 3 : false;
      if (hit && !near) { const ax = hit.x - x, az = hit.z - z, L2 = ax * ax + az * az || 1; const t = clamp(((o.x - x) * ax + (o.z - z) * az) / L2, 0, 1); near = Math.hypot(x + ax * t - o.x, z + az * t - o.z) < 2.6; }
      if (near || d < 18) { cb.suppressed = Math.max(cb.suppressed, near ? 4 : 2.5); cb.shotAt = true; }
      if (!o.sees) o.yaw += angDiff(Math.atan2(cb.heard.x - o.x, cb.heard.z - o.z), o.yaw) * 0.6; // turns towards the shot
    }
    void P;
  }
  onOfficerHit(o) { const cb = this.cb(o); cb.suppressed = 5; cb.alertT = 8; cb.shotAt = true; cb.cover = null; }
  cb(o) { return o.cb || (o.cb = { st: 'idle', t: 0, mag: POLICE_T56.mag, phase: 'hide', phaseT: 0, burst: 0, shotCd: 0, aimT: 0, suppressed: 0, alertT: 0, heard: null, cover: null, reT: 0, blind: 0, firstBurst: true, reloadT: -1, holdT: 0, flankT: 6 + Math.random() * 6 }); }

  // ---------------------------------------------------------------- cover
  // stationary vehicles near the officer; candidate spots around each body, kept only if THIS vehicle shields a crouched
  // officer there from the threat; scored by run distance, preferred range and spacing from colleagues.
  findCover(o, th, avoid = null) {
    const col = this.g.collision, P = this.g.player; let best = null, bs = 1e9; const mates = this.p.foot.filter((q) => q !== o && q.cb && q.cb.cover);
    for (const v of this.vehicles()) {
      if (v === P.vehicle || v.player || !v.mesh || v.mesh.visible === false || (v.T && (v.T.entry === 'bike' || v.T.rail))) continue; if (Math.abs(v.speed || 0) > 0.6) continue;
      const dv = Math.hypot(v.x - o.x, v.z - o.z); if (dv > 28) continue; const H = vehHeight(v) - (v.y || 0); if (H < 1.05) continue;
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), rx = fz, rz = -fx; const hl = v.half || 2.2, hw = ((v.T && v.T.wid) || 1.7) / 2;
      const spots = [[hw + 0.55, -hl * 0.55], [hw + 0.55, 0], [hw + 0.55, hl * 0.55], [-hw - 0.55, -hl * 0.55], [-hw - 0.55, 0], [-hw - 0.55, hl * 0.55], [0, hl + 0.6], [0, -hl - 0.6], [hw * 0.5, hl + 0.6], [-hw * 0.5, -hl - 0.6]];
      for (const [lat, al] of spots) {
        const cx = v.x + fx * al + rx * lat, cz = v.z + fz * al + rz * lat; if (avoid && Math.hypot(cx - avoid.x, cz - avoid.z) < 1.5) continue;
        if (col.blocked(cx, cz, 0.3) || this.p.carAt(cx, cz)) continue;
        const t = segBoxT(th.x, th.z, cx, cz, v); if (t < 0 || t > 0.97) continue; // the body must lie between the threat and the spot
        const dT = Math.hypot(cx - th.x, cz - th.z); if (dT < 6) continue; if (lerp(th.y || 1.3, HEAD_CROUCH + (o.y || 0), t) > (v.y || 0) + H) continue;
        let s = Math.hypot(cx - o.x, cz - o.z) + (dT > 32 ? (dT - 32) * 0.6 : 0) + (dT < 9 ? 6 : 0) + (v.police && v.police === o.unit ? -2.5 : 0);
        for (const m of mates) if (Math.hypot(m.cb.cover.x - cx, m.cb.cover.z - cz) < 2.2) s += 9;
        const tox = cx - o.x, toz = cz - o.z, thx = th.x - o.x, thz = th.z - o.z; const toward = (tox * thx + toz * thz) / (Math.hypot(thx, thz) || 1); if (toward > 0) s += toward * 0.8; // running at the shooter is worse
        if (s < bs) { bs = s; best = { x: cx, z: cz, v, face: Math.atan2(th.x - cx, th.z - cz) }; }
      }
    }
    return best;
  }
  coverHolds(c, th) { if (!c || !c.v || Math.abs(c.v.speed || 0) > 0.8 || !c.v.mesh || !c.v.mesh.parent) return false; const t = segBoxT(th.x, th.z, c.x, c.z, c.v); return t >= 0 && t < 0.97 && Math.hypot(c.x - th.x, c.z - th.z) > 5; }

  // ---------------------------------------------------------------- per-officer behaviour. Returns the walking speed when
  // this module drives the officer this frame, or null to leave the default (arrest / chase / search) logic in charge.
  officer(o, u, dt) {
    const p = this.p, g = this.g, A = o.ch.anim; const cb = this.cb(o); const armed = this.armed() && p.state !== 'return' && u.task !== 'leave';
    cb.suppressed = Math.max(0, cb.suppressed - dt); cb.alertT = Math.max(0, cb.alertT - dt); cb.reT -= dt;
    const sees = this.sees(o, dt); const tp = this.targetPoint();
    if (sees) { cb.seen = { x: tp.x, z: tp.z, y: tp.y, t: p.t }; cb.blindT = 0; } else cb.blindT = (cb.blindT || 0) + dt;
    const know = sees ? cb.seen : (p.lastSeen && p.t - p.lastSeen.t < 20 ? { x: p.lastSeen.x, z: p.lastSeen.z, y: 1.3 } : cb.heard);
    const engaged = armed ? (p.state === 'pursuing' || cb.alertT > 0 || sees) : cb.alertT > 0 && !!cb.cover; // unarmed: stay in cover while shots are still being fired
    if (!engaged && !(cb.suppressed > 0)) { cb.cover = null; cb.st = 'idle'; if (A.action === 'cover') A.set(null); return null; }
    if (!know) { cb.cover = null; return null; }
    const dK = Math.hypot(know.x - o.x, know.z - o.z);
    // close quarters, armed: no cover dance at arm's length — aim and fire (or let the arrest logic take over if the suspect gave up)
    // an unarmed suspect (no weapon out, on foot) within lunging distance is taken down by hand, not shot: hand over to the
    // grab / tackle logic (the rifle stays at the ready)
    if (armed && sees && dK < 3.2 && !(g.weapons && g.weapons.drawn) && !g.player.vehicle) { cb.cover = null; if (A.action === 'cover') A.set(null); cb.st = 'idle'; return null; }
    if (armed && sees && dK < 6.5) { cb.cover = null; if (A.action === 'cover') A.set(null); this.faceTo(o, tp.x, tp.z, dt, 8); cb.st = 'close'; this.aimFire(o, cb, tp, dt, true); return 0; }
    // pick / keep cover
    const needCover = cb.suppressed > 0 || (armed && dK > 6.5);
    if (needCover && (!cb.cover || (cb.reT <= 0 && !this.coverHolds(cb.cover, know)))) {
      cb.reT = 0.7; const prev = cb.cover; cb.cover = this.findCover(o, know, prev);
      if (cb.cover && cb.cover !== prev) { this.stats.covers++; cb.phase = 'hide'; cb.phaseT = 0.6 + Math.random() * 0.6; p.note && p.note(`officer to cover (${cb.cover.v.police === u ? 'own car' : cb.cover.v.parked ? 'parked car' : 'stopped car'})`); }
      else if (!cb.cover) this.stats.coverBlocked++;
    }
    // occasional flank: the second officer of a unit moves to another car while the first keeps the suspect busy
    if (armed && cb.cover && u.officers.indexOf(o) === 1 && (cb.flankT -= dt) <= 0) { cb.flankT = 9 + Math.random() * 6; const alt = this.findCover(o, know, cb.cover); if (alt && Math.hypot(alt.x - cb.cover.x, alt.z - cb.cover.z) > 4) { cb.cover = alt; this.stats.flanks++; cb.phase = 'hide'; } }
    if (cb.cover) {
      const c = cb.cover; const dc = Math.hypot(c.x - o.x, c.z - o.z);
      if (dc > 0.45) { cb.st = 'toCover'; if (A.action === 'cover') A.set(null); const w = this.route(o, c); const sp = p.moveTo(o, w.x, w.z, dc > 2 ? 5.6 : 2.4, dt); if (o.blockedT > 1.5) { cb.cover = null; cb.reT = 0; } return sp; }
      cb.st = 'cover'; this.faceTo(o, know.x, know.z, dt, 5);
      if (!armed) { if (A.action !== 'cover') A.set('cover'); return 0; } // unarmed (below 4★): stay down until the shooting stops
      // hide ↔ peek cycle; reload only while hidden
      cb.phaseT -= dt;
      if (cb.reloadT >= 0) { if (A.action !== 'cover') A.set('cover'); return 0; }
      if (cb.phase === 'hide') { if (A.action !== 'cover') A.set('cover'); if (cb.mag <= 0) { this.startReload(o, cb); return 0; } if (cb.phaseT <= 0 && cb.suppressed < 3.5) { cb.phase = 'peek'; cb.phaseT = 1.2 + Math.random() * 0.8; cb.aimT = 0; cb.burst = 0; } return 0; }
      // peek: rise over the bonnet, aim, fire a burst if the suspect is visible from up there
      if (A.action === 'cover') A.set(null);
      if (sees) { this.faceTo(o, tp.x, tp.z, dt, 8); this.aimFire(o, cb, tp, dt, false); cb.blind = 0; }
      else if (cb.phaseT <= 0.6) cb.blind++;
      if (cb.phaseT <= 0 || cb.mag <= 0 || (cb.burst >= cb.burstN && cb.shotCd > 0.2)) { cb.phase = 'hide'; cb.phaseT = 1.0 + Math.random() * 1.3; cb.burstN = 0; }
      // suspect gone quiet for a while: leave cover and advance on the last known position
      if (cb.blindT > 7 && p.seenT > 6 && cb.suppressed <= 0) { cb.cover = null; cb.st = 'advance'; }
      return 0;
    }
    if (!armed) return null; // no cover found and unarmed: default behaviour (keep distance / chase)
    // armed, no usable cover: fire from the knee if the suspect is visible, otherwise advance carefully to where they were
    if (sees) { if (dK > 16) { if (A.action !== 'cover') A.set(null); } this.faceTo(o, tp.x, tp.z, dt, 6); cb.st = 'open'; this.aimFire(o, cb, tp, dt, false); return 0; }
    if (cb.mag < 10 && cb.reloadT < 0) this.startReload(o, cb);
    cb.st = 'advance'; if (A.action === 'cover') A.set(null);
    if (dK > 1.5) return p.moveTo(o, know.x, know.z, 2.1, dt); // rifle up, walking pace
    return 0;
  }
  // the way to a cover spot: straight if the car body is not in the way, else via the nearest free corner of the car
  route(o, c) {
    const v = c.v; if (!v || segBoxT(o.x, o.z, c.x, c.z, v, 0.35) < 0) return c; const col = this.g.collision;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), rx = fz, rz = -fx; const hl = (v.half || 2.2) + 0.75, hw = ((v.T && v.T.wid) || 1.7) / 2 + 0.75; let best = null, bs = 1e9;
    for (const [a, l] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]]) { const px = v.x + fx * a + rx * l, pz = v.z + fz * a + rz * l;
      if (segBoxT(o.x, o.z, px, pz, v, 0.35) >= 0 || col.blocked(px, pz, 0.3)) continue;
      const s = Math.hypot(px - o.x, pz - o.z) + Math.hypot(c.x - px, c.z - pz) + (segBoxT(px, pz, c.x, c.z, v, 0.35) >= 0 ? 40 : 0); if (s < bs) { bs = s; best = { x: px, z: pz }; } }
    return best || c;
  }
  faceTo(o, x, z, dt, rate) { o.yaw += angDiff(Math.atan2(x - o.x, z - o.z), o.yaw) * Math.min(1, dt * rate); }
  startReload(o, cb) { if (cb.reloadT >= 0) return; cb.reloadT = 0; this.stats.reloads++; const [gn, pan] = Audio.spatial ? Audio.spatial(o.x, o.z, 25) : [0, 0]; if (gn > 0.05 && Audio.ctx) { Audio.noise(0.05, { f: 1500, q: 3, vol: 0.08 * gn, pan, when: 0.35 }); Audio.noise(0.06, { f: 900, q: 2, vol: 0.07 * gn, pan, when: 1.3 }); Audio.noise(0.05, { f: 2000, q: 3, vol: 0.09 * gn, pan, when: 2.2 }); } }

  // aim, then fire bursts at the suspect
  aimFire(o, cb, tp, dt, close) {
    cb.aimT += dt; cb.shotCd -= dt; if (cb.reloadT >= 0) return; if (cb.mag <= 0) { this.startReload(o, cb); return; }
    const react = close ? 0.25 : cb.firstBurst ? 0.55 : 0.32; if (cb.aimT < react) return;
    if (!cb.burstN) { const [a, b] = POLICE_T56.burst; cb.burstN = a + Math.floor(Math.random() * (b - a + 1)); cb.burst = 0; }
    if (cb.burst >= cb.burstN) { if (cb.shotCd < -0.7 - Math.random() * 0.6) { cb.burstN = 0; cb.firstBurst = false; } return; }
    if (cb.shotCd > 0) return; cb.shotCd = 1 / POLICE_T56.rof; this.fire(o, cb, tp);
  }

  // ---------------------------------------------------------------- shooting
  muzzle(o, out) { const m = o.rifle; if (m && m.parent) { m.updateWorldMatrix(true, false); return out.copy(m.userData.muzzle).applyMatrix4(m.matrixWorld); } return out.set(o.x + Math.sin(o.yaw) * 0.6, (o.y || 0) + 1.4, o.z + Math.cos(o.yaw) * 0.6); }
  fire(o, cb, tp) {
    const g = this.g, P = g.player; const mz = this.muzzle(o, new THREE.Vector3()); const d = Math.hypot(tp.x - mz.x, tp.z - mz.z);
    const mv = P.vehicle ? Math.abs(P.vehicle.speed) : P.speed || 0; const night = this.night() * (o.torchOn ? 0.3 : 1);
    let sigma = 0.1 + d * 0.016 + mv * 0.055 + cb.burst * 0.045 + night * 0.25; if (cb.firstBurst) sigma *= 1.7; if (P.crouching && !P.vehicle) sigma *= 1.15;
    const aim = new THREE.Vector3(tp.x, tp.y, tp.z); const fwd = aim.clone().sub(mz).normalize(); const right = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize(); const up = new THREE.Vector3().crossVectors(right, fwd);
    const gx = (Math.random() + Math.random() + Math.random() - 1.5) * 1.15, gy = (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; aim.addScaledVector(right, gx * sigma).addScaledVector(up, gy * sigma * 0.8);
    const dir = aim.sub(mz).normalize(); const hit = this.trace(o, mz, dir, POLICE_T56.range);
    // check fire: someone else is in the line → do not shoot (sidestep a little instead)
    if (hit.kind === 'ped' || hit.kind === 'officer') { cb.holdT = 0.6; this.stats.holds++; if (cb.cover) cb.phase = 'hide'; else { const col = this.g.collision, nx = o.x + Math.cos(o.yaw) * 0.3, nz = o.z - Math.sin(o.yaw) * 0.3; if (!col || !col.blocked(nx, nz, 0.28)) { o.x = nx; o.z = nz; } } return; } // the sidestep never goes into a wall
    cb.mag--; cb.burst++; this.stats.shots++; this.p.stats.policeShots = (this.p.stats.policeShots || 0) + 1; if (o.rp) o.rp.kick = 1; if (o.ch && o.ch.anim.shotKick) o.ch.anim.shotKick('rifle', 1);
    this.effects(o, mz, dir, hit);
    if (hit.kind === 'player') { this.stats.hits++; const dmg = POLICE_T56.dmg * (this.p.stars() >= 5 ? 1.15 : 1) * (0.85 + Math.random() * 0.3); g.health ? g.health.damage(dmg, 'shot by police') : (this.lastDamage = (this.lastDamage || 0) + dmg); }
    else if (hit.kind === 'vehicle' && hit.v === P.vehicle && Math.random() < 0.3) { this.stats.hits++; g.health && g.health.damage(POLICE_T56.dmg * 0.6, 'shot by police'); } // through the bodywork / glass
    else { const ax = hit.point.x - mz.x, az = hit.point.z - mz.z, L2 = ax * ax + az * az || 1; const t = clamp(((P.x - mz.x) * ax + (P.z - mz.z) * az) / L2, 0, 1); const nd = Math.hypot(mz.x + ax * t - P.x, mz.z + az * t - P.z); if (nd < 1.6 && Audio.ctx) Audio.noise(0.07, { f: 3200, q: 1.2, vol: 0.12 * (1 - nd / 1.6), attack: 0.002 }); } // supersonic crack of a near miss
  }
  // nearest hit along the ray: world, ground, vehicles, peds, other officers, the player
  trace(o, a, d, range) {
    const g = this.g, P = g.player; let best = { t: range, kind: 'none' }; const e = a.clone().addScaledVector(d, range);
    const tw = g.collision.raycast(a.x, a.y, a.z, e.x, e.y, e.z, 0.02, true); if (tw < 1) best = { t: tw * range, kind: 'world' };
    if (d.y < -1e-4) { const gy = g.collision.groundAt ? g.collision.groundAt(a.x + d.x * best.t, a.z + d.z * best.t, a.y) : 0; const tg = (gy - a.y) / d.y; if (tg > 0 && tg < best.t) best = { t: tg, kind: 'ground' }; }
    const vb = []; for (const v of this.vehicles()) { if (!v.mesh || v.mesh.visible === false || (v.T && v.T.rail)) continue; const tv = segBoxT(a.x, a.z, e.x, e.z, v, -0.05); if (tv < 0) continue; const t = tv * range; const y = a.y + d.y * t; if (y > vehHeight(v) + (v === P.vehicle ? 0.2 : 0) || y < (v.y || 0) + 0.12) continue; if (t < best.t && t > 0.3) { best = { t, kind: 'vehicle', v }; } vb.push(v); }
    const cyl = (x, z, y0, y1, r) => { const rx = x - a.x, rz = z - a.z; const dh2 = d.x * d.x + d.z * d.z || 1e-6; const t = (rx * d.x + rz * d.z) / dh2; if (t < 0.2 || t > best.t) return -1; const cx = a.x + d.x * t - x, cz = a.z + d.z * t - z; if (cx * cx + cz * cz > r * r) return -1; const y = a.y + d.y * t; return y >= y0 && y <= y1 ? t : -1; };
    if (!P.vehicle) { const top = (P.y || 0) + (P.crouching ? 1.2 : 1.78); const t = cyl(P.x, P.z, (P.y || 0) + 0.05, top, 0.3); if (t >= 0) best = { t, kind: 'player' }; }
    if (g.crowd) for (const q of g.crowd.peds) { if (Math.abs(q.x - a.x) > range || Math.abs(q.z - a.z) > range) continue; const t = cyl(q.x, q.z, (q.y || 0) + 0.05, (q.y || 0) + (q.ch && q.ch.spec ? q.ch.spec.height || 1.7 : 1.7), 0.3); if (t >= 0) best = { t, kind: 'ped', q }; }
    for (const q of this.p.foot) { if (q === o) continue; const t = cyl(q.x, q.z, (q.y || 0) + 0.05, (q.y || 0) + 1.75 - 0.6 * (q.ch.anim.crouch || 0), 0.3); if (t >= 0) best = { t, kind: 'officer', q }; }
    best.point = a.clone().addScaledVector(d, best.t); return best;
  }
  effects(o, mz, dir, hit) {
    const g = this.g, W = g.weapons; const def = POLICE_T56;
    if (o.rifle) { const f = o.rifle.userData.flash; if (f) { bloomHot(); f.visible = true; f.rotation.z = Math.random() * 3; f.scale.setScalar(0.85 + Math.random() * 0.35); o.rp.flashT = 0.05; } }
    if (W && W.fx) { W.tracer(mz, hit.point, def); if (hit.kind === 'vehicle') W.sparks(hit.point, dir); else if (hit.kind === 'world' || hit.kind === 'ground') { W.puff(hit.point, hit.kind === 'ground' ? 0x6d6a64 : 0xb5ab9a, 4); W.decal(hit.point, dir, hit.kind); } else if (hit.kind === 'player' && !(g.blood && g.blood.spray(hit.point, dir, 0.6))) W.puff(hit.point, 0x8a8478, 2); }
    if (Audio.ctx && Audio.spatial) { const [gn, pan] = Audio.spatial(mz.x, mz.z, 70); const s = def.snd; const v = s.vol * Math.max(0.12, gn);
      Audio.noise(s.dur, { f: s.crack, q: 0.6, vol: v, type: 'lowpass', attack: 0.001, pan }); Audio.tone(s.body * 2.2, s.dur * 1.3, { type: 'sine', vol: v * 0.5, attack: 0.002, glide: s.body * 0.6, pan });
      Audio.noise(s.tail, { f: 480, q: 0.5, type: 'lowpass', vol: v * 0.3, attack: 0.02, when: 0.03 + Math.min(0.25, Math.hypot(mz.x - g.player.x, mz.z - g.player.z) / 340), buf: Audio.brownBuf, pan }); }
    if (g.crowd && g.crowd.alarm) { if ((this._alarmN = (this._alarmN || 0) + 1) % 3 === 1) g.crowd.alarm(mz.x, mz.z, def.loud, 2, null, 'gunshot'); }
    if (g.birds && g.birds.scare && this._alarmN % 3 === 1) g.birds.scare(mz.x, mz.z, 50);
  }

  // ---------------------------------------------------------------- rifle on the officer (slung ↔ hands, aim, reload, recoil)
  arm(o) {
    if (o.rifle) return o.rifle; const m = buildT56(); m.matrixAutoUpdate = false; m.traverse((q) => { if (q.isMesh) q.castShadow = false; });
    const fl = new THREE.Group(); const fm = flashMaterial(); for (let i = 0; i < 3; i++) { const q = new THREE.Mesh(FLASH_GEO, fm); if (i < 2) { q.scale.set(0.09, 0.3, 1); q.position.z = 0.11; q.rotation.x = Math.PI / 2; q.rotation.y = i * Math.PI / 2; } else q.scale.set(0.16, 0.16, 1); fl.add(q); }
    fl.position.copy(m.userData.muzzle); fl.visible = false; m.add(fl); m.userData.flash = fl;
    o.ch.bones.chest.add(m); o.rifle = m; o.rp = { draw: 0, aim: 0, kick: 0, flashT: 0, slingM: slungMatrix(m.userData) }; m.matrix.copy(o.rp.slingM); return m;
  }
  disarm(o) { if (o.rifle) { o.rifle.parent?.remove(o.rifle); o.rifle = null; } if (o.ch && o.ch.anim) { o.ch.anim.ik = null; o.ch.anim.aim = null; } }
  // called every frame before the officer's animator update
  pose(o, dt) {
    const m = o.rifle; if (!m) return; const A = o.ch.anim, ud = m.userData, rp = o.rp, cb = o.cb;
    const onFoot = o.mode === 'foot' || o.mode === 'return'; const cam = this.g.camera; const far = cam ? (cam.position.x - o.x) ** 2 + (cam.position.z - o.z) ** 2 > 8100 : false; m.visible = o.mode !== 'seated' && o.mode !== 'enter' && o.mode !== 'exit' && !far; // slung rifle stays on a downed officer; hidden beyond 90 m
    const want = onFoot && this.armed() && !o.cuffing && !o.tackle && o.mode === 'foot' ? 1 : 0; rp.draw = clamp(rp.draw + (want ? dt / 0.7 : -dt / 0.8), 0, 1);
    const aiming = (cb && (cb.st === 'close' || cb.st === 'open' || (cb.st === 'cover' && cb.phase === 'peek')) && cb.aimT > 0.08) || (o.torchOn && rp.draw > 0.5) || (o.cineAim && rp.draw > 0.5); // (cineAim: covering the suspect during the arrest sequence) night search: rifle shouldered, sweeping with the clamp-on torch
    rp.aim = clamp(rp.aim + (aiming ? dt * 5 : -dt * 3.5), 0, 1); rp.kick = Math.max(0, rp.kick - dt * 14);
    if (rp.flashT > 0) { rp.flashT -= dt; if (rp.flashT <= 0 && ud.flash) ud.flash.visible = false; }
    if (!m.visible || rp.draw <= 0.001) { if (A.ik && A.ik.rifle) { A.ik = null; A.aim = null; } m.matrix.copy(rp.slingM); m.matrixWorldNeedsUpdate = true; ud.mag.visible = true; ud.mag.position.set(0, 0, 0); return; }
    // weapon pose in body space: low ready ↔ shouldered aim (pitched to the target), recoil, reload choreography
    const aw = sm(rp.aim); const tp = this.targetPoint(); const ey = (o.y || 0) + 1.45; const pitch = aiming && o.sees ? clamp(Math.atan2(tp.y - ey, Math.max(0.5, Math.hypot(tp.x - o.x, tp.z - o.z))), -0.9, 0.9) : -0.1;
    A.aim = { pitch: pitch * aw - 0.05 * (1 - aw), twist: 0.5, w: Math.max(aw, 0.65) * sm(rp.draw), headDown: 0.12 * aw };
    const lowQ = qE(0.6, 0.06, 0.18); const butt = new THREE.Vector3(POCKET.x - 0.02, POCKET.y - 0.03, POCKET.z); const low = butt.sub(new THREE.Vector3(0, 0, ud.buttZ).applyQuaternion(lowQ));
    const aimP = new THREE.Vector3(POCKET.x, POCKET.y - ud.support.y, POCKET.z - ud.buttZ);
    const pos = low.clone().lerp(aimP, aw); let rx = lerp(0.6, 0, aw), ry = lerp(0.06, 0, aw), rz = lerp(0.18, 0, aw);
    pos.z -= 0.03 * rp.kick; rx -= 0.07 * rp.kick;
    let supK = 0, supTo = null; ud.mag.visible = true; ud.mag.position.set(0, 0, 0);
    if (cb && cb.reloadT >= 0) { cb.reloadT += dt; const r = cb.reloadT / POLICE_T56.reload; const tl = sm(seg(r, 0, 0.14)) * (1 - sm(seg(r, 0.86, 1))); rx += -0.35 * tl; rz += 0.45 * tl; pos.x += 0.05 * tl; pos.y += 0.03 * tl;
      if (r > 0.1 && r < 0.42) { ud.mag.position.y = -0.05 * sm(seg(r, 0.1, 0.16)); ud.mag.visible = r < 0.16; supTo = 'pouch'; supK = sm(seg(r, 0.12, 0.34)); }
      else if (r >= 0.42 && r < 0.76) { supTo = 'well'; supK = sm(seg(r, 0.42, 0.64)); }
      else if (r >= 0.76 && r < 0.95) { supTo = 'rack'; supK = sm(seg(r, 0.76, 0.84)) * (1 - sm(seg(r, 0.9, 0.95))); if (ud.slide) ud.slide.position.z = -0.06 * Math.sin(seg(r, 0.84, 0.92) * Math.PI); }
      if (r >= 1) { cb.reloadT = -1; cb.mag = POLICE_T56.mag; if (ud.slide) ud.slide.position.z = 0; } }
    const body = new THREE.Matrix4().compose(pos, qE(rx, ry, rz).setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
    let chestM = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeRotationY(0.5), body);
    const k = sm(rp.draw); if (k < 0.999) { const a = new THREE.Vector3(), aq = new THREE.Quaternion(), b = new THREE.Vector3(), bq = new THREE.Quaternion(), sc = new THREE.Vector3(); rp.slingM.decompose(a, aq, sc); chestM.decompose(b, bq, sc); chestM = new THREE.Matrix4().compose(a.lerp(b, k), aq.slerp(bq, k), new THREE.Vector3(1, 1, 1)); }
    m.matrix.copy(chestM); m.matrixWorldNeedsUpdate = true;
    const wQ = new THREE.Quaternion().setFromRotationMatrix(chestM); const grip = new THREE.Vector3().applyMatrix4(chestM); let sup = ud.support.clone().applyMatrix4(chestM);
    const pouch = new THREE.Vector3(0.12, -0.36, 0.08).applyMatrix4(new THREE.Matrix4().makeRotationY(0.5));
    if (supTo === 'pouch') sup.lerp(pouch, supK); else if (supTo === 'well') { const w = ud.magWell.clone().applyMatrix4(chestM); sup = pouch.clone().lerp(w, supK); if (supK < 0.98) { const loc = sup.clone().applyMatrix4(chestM.clone().invert()); ud.mag.visible = supK > 0.25; ud.mag.position.set((loc.x - ud.magWell.x) * (1 - supK), (loc.y - ud.magWell.y) * (1 - supK), (loc.z - ud.magWell.z) * (1 - supK)); } }
    else if (supTo === 'rack') sup.lerp(ud.rack.clone().applyMatrix4(chestM), supK);
    // support hand reach: slide back along the handguard to what the left arm can really reach
    const b = o.ch.bones; b.shL.updateMatrix(); const sh = b.armL.position.clone().applyMatrix4(b.shL.matrix); const armMax = (b.foreL.position.length() + b.handL.position.length()) * 0.98 + 0.05; const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(wQ);
    if (!supTo) for (let it = 0; it < 6; it++) { const dd = sup.distanceTo(sh); if (dd <= armMax) break; sup.addScaledVector(fwd, -Math.min(0.06, (dd - armMax) * 1.05)); }
    // drawing: the right hand reaches over the shoulder for the sling, then both hands take the rifle
    const wR = k < 0.35 ? sm(k / 0.35) : 1, wL = sm(seg(k, 0.55, 1));
    A.ik = { R: grip, qR: wQ.clone().multiply(Q_GRIP), wR, L: wL > 0.01 ? sup : null, qL: wQ.clone().multiply(Q_SUP), wL, rifle: true };
  }

  // ---------------------------------------------------------------- per-frame global work (torches, timers)
  // torch decision + handheld pose parameters (before the animator update)
  torch(o, dt) {
    const A = o.ch.anim, st = this.p.state, cb = o.cb; const n = this.night(); const rifleUp = !!(o.rifle && o.rp && o.rp.draw > 0.5);
    const searching = st === 'searching' || st === 'investigating' || st === 'responding' || (st === 'pursuing' && !o.sees) || (cb && cb.st === 'advance');
    const want = !o.noTorch && n > 0.45 && o.mode === 'foot' && searching && !o.tackle && !o.cuffing && !this.g.indoor && !(cb && (cb.st === 'cover' || cb.st === 'toCover' || cb.st === 'close'));
    if (want && !o.torchOn) this.stats.torchesLit++; o.torchOn = want;
    if (o.rifle) o.rifle.userData.torch.visible = want && rifleUp;
    o.sweepT = (o.sweepT || Math.random() * 9) + dt; o.sweep = Math.sin(o.sweepT * 0.75) * 0.5 + Math.sin(o.sweepT * 1.9) * 0.08;
    if (want && !rifleUp) { if (!A.action || A.action === 'look') A.set('torch'); A.torchSweep = o.sweep; }
    else if (A.action === 'torch') A.set(null);
  }
  // place the lit torch (after the animator update) and register it with the light pool
  placeTorch(o) {
    if (!o.torchOn) { if (o.torchM) o.torchM.visible = false; o.torchDir = null; return; }
    const rifleT = o.rifle && o.rifle.userData.torch.visible; let pos, dir;
    if (rifleT) { const m = o.rifle; m.updateWorldMatrix(true, false); pos = m.userData.torchPos.clone().applyMatrix4(m.matrixWorld); dir = new THREE.Vector3(0, 0, 1).transformDirection(m.matrixWorld); if (o.torchM) o.torchM.visible = false; }
    else {
      if (!o.torchM) { o.torchM = buildHandTorch(); o.torchM.matrixAutoUpdate = false; o.ch.root.add(o.torchM); o.torchM.userData.lens.material.emissiveIntensity = 2.5; }
      const T = o.torchM; T.visible = true; const hand = o.ch.bones.handR.getWorldPosition(new THREE.Vector3()); const yaw = o.yaw + (o.sweep || 0), pt = -0.16;
      dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pt), Math.sin(pt), Math.cos(yaw) * Math.cos(pt)); const c = hand.clone().addScaledVector(dir, 0.05); c.y -= 0.012;
      const W = new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir), new THREE.Vector3(1, 1, 1)); o.ch.root.updateMatrixWorld(); T.matrix.copy(o.ch.root.matrixWorld.clone().invert().multiply(W)); T.matrixWorldNeedsUpdate = true;
      pos = c.clone().addScaledVector(dir, 0.125);
    }
    o.torchPos = pos; o.torchDir = dir; (this.sources || (this.sources = [])).push({ pos, dir, o });
  }
  update(dt) {
    this.underFireT += dt; const g = this.g; const rig = g.flashRig;
    if (rig && g.camera) rig.update(g.camera, g.indoor ? [] : this.sources || [], this.night(), g.collision);
    this.lastSources = (this.sources || []).length; this.sources = [];
  }
}

// rifle slung across the back, muzzle up over the right shoulder (chest space)
function slungMatrix(ud) {
  const d = new THREE.Vector3(-0.42, 0.9, -0.05).normalize(); const x = new THREE.Vector3(0, 0, -1); const y = new THREE.Vector3().crossVectors(d, x).normalize(); const xx = new THREE.Vector3().crossVectors(y, d).normalize();
  const M = new THREE.Matrix4().makeBasis(xx, y, d); const mid = new THREE.Vector3(0.02, 0.02, -0.19); const off = new THREE.Vector3(0, 0.03, 0.1).applyMatrix4(new THREE.Matrix4().extractRotation(M)); M.setPosition(mid.sub(off)); void ud; return M;
}
const FLASH_GEO = new THREE.PlaneGeometry(1, 1); let FLASH_MAT = null;
function flashMaterial() {
  if (FLASH_MAT) return FLASH_MAT; let map = null;
  if (typeof document !== 'undefined' && document.createElement) { try { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext && c.getContext('2d'); if (x && x.createRadialGradient) { const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,0.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); map = new THREE.CanvasTexture(c); } } catch (e) { map = null; } }
  return (FLASH_MAT = new THREE.MeshBasicMaterial({ map, color: 0xffd08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
}

// ---------------------------------------------------------------- torches
// hand torch model (police issue style: black aluminium body, wide head, warm-white LED lens)
export function buildHandTorch() {
  const g = new THREE.Group(); const body = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.5, metalness: 0.6 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 12), body); tube.rotation.x = Math.PI / 2; tube.position.z = 0.0; g.add(tube);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.015, 0.045, 14), body); head.rotation.x = Math.PI / 2; head.position.z = 0.1; g.add(head);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#fff1c8', emissiveIntensity: 0, roughness: 0.1 })); lens.position.z = 0.1235; g.add(lens);
  g.userData = { lens, tipZ: 0.124 }; return g;
}
let GLOW_TEX = null;
function glowTexture() {
  if (GLOW_TEX !== null) return GLOW_TEX; GLOW_TEX = undefined;
  try { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,246,220,0.85)'); gr.addColorStop(0.5, 'rgba(255,230,180,0.18)'); gr.addColorStop(1, 'rgba(255,220,160,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); GLOW_TEX = new THREE.CanvasTexture(c); } catch (e) { GLOW_TEX = undefined; }
  return GLOW_TEX;
}
let BEAM_TEX = null;
function beamTexture() { // bright at the lens (v = 1), fading to nothing at the far end (v = 0); soft across
  if (BEAM_TEX !== null) return BEAM_TEX; BEAM_TEX = undefined;
  try { const c = document.createElement('canvas'); c.width = 8; c.height = 128; const x = c.getContext('2d'); const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 8, 128); BEAM_TEX = new THREE.CanvasTexture(c); } catch (e) { BEAM_TEX = undefined; }
  return BEAM_TEX;
}
export class FlashlightRig {
  constructor(scene, { count = 3 } = {}) {
    this.scene = scene; this.spots = []; this.beams = []; const geo = new THREE.ConeGeometry(1, 1, 22, 1, true); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 0.5); // apex at the lens, opening along +z
    // soft light shaft: bright at the lens, fading along the beam and towards the cone's silhouette (no hard wedge edges)
    this.beamMat = new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(0xfff0d2) }, opacity: { value: 0 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 color; uniform float opacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { float l = vUv.y * vUv.y * (0.3 + 0.7 * vUv.y); float e = abs(dot(normalize(vN), normalize(vV))); float a = l * pow(e, 1.8) * opacity; gl_FragColor = vec4(color, a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
    for (let i = 0; i < count; i++) {
      const s = new THREE.SpotLight(0xfff2d8, 0, 26, 0.3, 0.5, 1.6); s.name = 'torch' + i; s.castShadow = false; s.position.set(0, -500, 0); s.target.position.set(0, -501, 0); scene.add(s); scene.add(s.target); this.spots.push(s);
      const b = new THREE.Mesh(geo, this.beamMat); b.visible = false; b.frustumCulled = false; b.renderOrder = 3; scene.add(b); this.beams.push(b);
    }
    this.glowMat = new THREE.SpriteMaterial({ map: glowTexture() || null, color: 0xfff4dc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); this.glows = [];
    this.lit = 0;
  }
  // sources: [{ pos: Vector3, dir: Vector3 (unit) }]
  update(cam, sources, night, collision) {
    const k = clamp((night - 0.35) / 0.4, 0, 1); this.lit = 0;
    const cp = cam.position; const cand = k > 0 ? sources.map((s) => [s.pos.distanceTo(cp), s]).sort((a, b) => a[0] - b[0]) : [];
    while (this.glows.length < cand.length) { const sp = new THREE.Sprite(this.glowMat); sp.visible = false; sp.renderOrder = 4; this.scene.add(sp); this.glows.push(sp); }
    this.glows.forEach((sp, i) => { const c = cand[i]; if (!c || c[0] > 160) { sp.visible = false; return; } const s = c[1]; const toCam = cp.clone().sub(s.pos).normalize(); const facing = Math.max(0, toCam.dot(s.dir)); sp.visible = true; sp.position.copy(s.pos).addScaledVector(s.dir, 0.01); const sc = (0.08 + 0.5 * facing * facing) * (0.6 + 0.4 * Math.min(1, c[0] / 25)); sp.scale.setScalar(sc); sp.material.opacity = k; });
    this.beamMat.uniforms.opacity.value = 0.09 * k;
    this.spots.forEach((s, i) => { const c = cand[i], b = this.beams[i];
      if (!c || c[0] > 90) { if (s.intensity !== 0) s.intensity = 0; b.visible = false; return; }
      const src = c[1]; let len = 24; if (collision) { const e = src.pos.clone().addScaledVector(src.dir, len); const t = collision.raycast(src.pos.x, src.pos.y, src.pos.z, e.x, e.y, e.z, 0.05, false, 1.0); len = Math.max(0.6, t * len); if (src.dir.y < -0.02) { const gy = collision.groundAt ? collision.groundAt(src.pos.x, src.pos.z, src.pos.y) : 0; const tg = (gy - src.pos.y) / src.dir.y; if (tg > 0) len = Math.min(len, tg + 0.4); } }
      s.position.copy(src.pos); s.target.position.copy(src.pos).addScaledVector(src.dir, 10); s.target.updateMatrixWorld(); s.distance = len + 2; s.intensity = 38 * k; s.angle = 0.3;
      b.visible = true; b.position.copy(src.pos); b.lookAt(src.pos.clone().add(src.dir)); const r = Math.tan(0.24) * len; b.scale.set(r, r, len); this.lit++;
    });
  }
}
