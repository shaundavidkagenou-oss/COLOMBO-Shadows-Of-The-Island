// Stunt jumps (45th request): six car jumps and eleven bicycle ramps (StreetRamps.js builds them). Leaving a ramp's lip
// fast enough starts a slow-motion cinematic: the world drops to ~30 % speed, letterbox bars come in and a camera picks
// one of three angles (side tracking dolly, low ahead looking back at the landing, chase from under the lip) with a
// slight handheld drift and a long lens. On touchdown the world eases back to full speed, the camera hands back to
// the player and the jump is judged: cleared (landed past the ramp's clearance distance, upright, still in the
// vehicle) raises Driving (cars, motorbikes) or Cycling (bicycles) — five points the first time, two after.
// The quarter-pipe is a "180 air": ride up the transition and the bike pops off the coping, turns in the air and
// drops back in, facing down the ramp.
import * as THREE from 'three';
import { STUNTS, RAMPS } from '../world/StreetRamps.js';
import * as L from '../world/Layout.js';
import { Audio } from '../audio/Audio.js';
import { clamp, lerp } from '../core/math.js';

const BY_RAMP = new Map(); for (const s of STUNTS) BY_RAMP.set(s.ramp, s);
const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const _t = new THREE.Vector3(), _c = new THREE.Vector3();

export class StuntJumps {
  constructor(game) { this.g = game; this.active = null; this.qp = null; this.blips = false; }
  get state() { const st = this.g.story.state; if (!st.stunts) st.stunts = {}; return st.stunts; }
  addBlips() { if (this.blips) return; this.blips = true; const H = this.g.hud; for (const s of STUNTS) { const r = s.ramp; H.addBlip('stunt_' + s.id, r.x + r.dx * r.len / 2, r.z + r.dz * r.len / 2, s.kind === 'car' ? 'stunt' : 'bmx', (s.kind === 'car' ? 'Stunt jump · ' : 'Bicycle ramp · ') + s.name); } }
  fits(s, v) { return s.kind === 'car' ? v.T.entry !== 'bike' && v.T.entry !== 'tuk' : v.T.entry === 'bike'; } // car jumps: cars / vans / SUVs; bicycle ramps: bicycles and motorbikes
  update(dt) {
    const g = this.g, P = g.player; if (!this.blips && g.hud && g.mode === 'play') this.addBlips();
    const v = P && P.vehicle;
    if (this.qp) { if (this.qp.v === v) this.qpTick(dt, v); else this.qp = null; } // the 180 turns in the air while the cinematic plays
    if (this.active) return this.tick(dt);
    if (!v || g.director?.active || g.police?.busy) return;
    if (!this.qp && v.T.entry === 'bike' && !v.air && v.onRamp && v.onRamp.shape === 'qp') this.qpCheck(v);
    if (v.air && v.launch && !v.launch.seen) { v.launch.seen = true; const s = BY_RAMP.get(v.launch.ramp); if (!s || !this.fits(s, v)) return;
      const sp = Math.abs(v.launch.speed || v.speed); const minSp = s.kind === 'car' ? 13 : s.qp ? 3.5 : 5; this.state.tried = (this.state.tried || 0) + 1; g.skills && (g.skills.stats.stuntsTried++);
      if (sp >= minSp) this.start(s, v); }
  }
  // ---------------------------------------------------------------- quarter-pipe: pop off the coping, 180° in the air
  qpCheck(v) {
    const r = v.onRamp; const u = (v.x - r.x) * r.dx + (v.z - r.z) * r.dz; const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const facing = fx * r.dx + fz * r.dz;
    if (u > r.arc * 0.8 && v.speed > 2.2 && facing > 0.6) { const vy = clamp(v.speed * 0.78, 2.6, 5.6); /* ~0.4 – 1.6 m of air above the pop point */ const sp = v.speed;
      v.air = true; v.vy = vy; v.airT = 0; v.speed = 0.15; v.launch = { ramp: r, x: v.x, z: v.z, y: v.y, speed: sp, qp: true, yaw0: v.yaw };
      this.qp = { v, ramp: r, sp, left: Math.PI, rate: Math.PI / Math.max(0.35, (2 * vy / 9.81) * 0.8), dir: Math.sign((v.steer || 0) + 1e-3) || 1 }; }
  }
  qpTick(dt, v) { const q = this.qp; if (v.air) { const d = Math.min(q.left, q.rate * dt); v.yaw += d * q.dir; q.left -= d; v.speed = 0.15; }
    else { v.yaw += q.left * q.dir; v.speed = q.sp * 0.82; q.landedRot = Math.PI - q.left; q.done = true; this.qpLanded = q; this.qp = null; } }
  // ---------------------------------------------------------------- cinematic
  start(s, v) {
    const g = this.g, P = g.player, cam = g.camera; const r = s.ramp; const lip = { x: v.launch.x, y: v.launch.y, z: v.launch.z };
    const pick = s.qp ? 0 : Math.floor(Math.random() * 3); const side = Math.random() < 0.5 ? 1 : -1;
    this.active = { s, v, lip, t: 0, end: null, pick, side, r, fov0: cam.fov, slow: g.timeSlow || 1, hud: !g.hud.root.classList.contains('hidden'), camP: cam.position.clone() };
    P.camOverride = true; g.hud.bars(true); g.hud.show(false); Audio.noise?.(0.9, { f: 380, q: 0.6, vol: 0.14, type: 'lowpass' }); // air rush
  }
  tick(dt) {
    const g = this.g, A = this.active, v = A.v, cam = g.camera, P = g.player; const slow = g.timeSlow || 1; const rdt = Math.min(0.1, dt / Math.max(0.05, slow)); A.t += rdt;
    // world speed: snap down to 0.3 in the first 0.25 s of flight, back to 1 over 0.6 s after touchdown
    const target = A.end ? lerp(0.3, 1, sm((A.t - A.end) / 0.6)) : lerp(1, A.s.kind === 'car' ? 0.28 : 0.35, sm(A.t / 0.25)); g.timeSlow = target;
    const r = A.r, fx = r.dx, fz = r.dz, lx = r.lx, lz = r.lz; const big = A.s.kind === 'car';
    const vx = v.x, vy = (v.mesh ? v.mesh.position.y : v.y) + (big ? 0.7 : 0.6), vz = v.z; _t.set(vx, vy, vz);
    const flight = big ? 30 : A.s.qp ? 1 : 8; const jt = A.t; const drift = Math.sin(jt * 1.3) * 0.12, drift2 = Math.cos(jt * 0.9) * 0.08; // handheld
    if (A.pick === 0) { // side tracking dolly, keeps level with the vehicle, long lens
      const d = big ? 13 : 5.5; _c.set(vx + lx * d * A.side - fx * (big ? 3 : 1.2), A.lip.y + (big ? 1.4 : 1.0) + drift2, vz + lz * d * A.side - fz * (big ? 3 : 1.2)); if (A.s.qp) _c.set(A.lip.x + lx * 5 * A.side - fx * 4, A.lip.y + 1.2, A.lip.z + lz * 5 * A.side - fz * 4); cam.fov = lerp(cam.fov, big ? 38 : 45, Math.min(1, rdt * 6)); }
    else if (A.pick === 1) { // low ahead of the landing, looking back up at the vehicle coming over
      const ax = A.lip.x + fx * flight * 0.85 + lx * (big ? 6 : 2.2) * A.side, az = A.lip.z + fz * flight * 0.85 + lz * (big ? 6 : 2.2) * A.side; _c.set(ax, L.groundY(ax, az) + 0.45 + drift2 * 0.5, az); cam.fov = lerp(cam.fov, big ? 42 : 50, Math.min(1, rdt * 6)); }
    else { // under the lip, wide, the vehicle passing overhead then tracked from behind
      const k = sm(A.t / 1.6); const bx = A.lip.x - fx * 2 + lx * 2.2 * A.side, bz = A.lip.z - fz * 2 + lz * 2.2 * A.side; _c.set(lerp(bx, vx - fx * (big ? 9 : 4), k), lerp(A.lip.y + 0.3, vy + (big ? 2.2 : 1.2), k), lerp(bz, vz - fz * (big ? 9 : 4), k)); cam.fov = lerp(cam.fov, 58, Math.min(1, rdt * 6)); }
    cam.position.lerp(_c, A.t < 0.05 ? 1 : Math.min(1, rdt * 7)); _t.y += drift * 0.3; cam.lookAt(_t);
    { const dd = cam.position.distanceTo(_t), half = big ? 4.2 : 1.7; const want = Math.min(A.pick === 2 ? 58 : 50, Math.max(16, 2 * Math.atan(half / Math.max(0.5, dd)) * 180 / Math.PI)); cam.fov = lerp(cam.fov, want, Math.min(1, rdt * 4)); } /* long lens: keep the vehicle a steady size in frame as it nears or recedes */
    cam.updateProjectionMatrix();
    if (!A.end && !v.air) { A.end = A.t; A.land = { x: v.x, z: v.z, t: A.t }; this.judge(A); }
    const lost = P.vehicle !== v || v.wrecked || g.health?.busy; if ((A.end && A.t - A.end > 0.9) || A.t > 7 || lost) this.finish();
  }
  judge(A) {
    const v = A.v, s = A.s, r = A.r; const dist = (A.land.x - A.lip.x) * r.dx + (A.land.z - A.lip.z) * r.dz; const lat = Math.abs((A.land.x - A.lip.x) * r.lx + (A.land.z - A.lip.z) * r.lz);
    let ok = !v.wrecked && Math.abs(v.roll || 0) < 0.9; if (s.qp) { const q = this.qpLanded; ok = ok && q && q.landedRot > 2.6; } else ok = ok && dist >= s.clear && lat < (s.kind === 'car' ? 9 : 4);
    A.ok = ok; A.dist = dist;
  }
  finish() {
    const g = this.g, A = this.active, P = g.player, cam = g.camera; this.active = null; g.timeSlow = 1; cam.fov = A.fov0; cam.updateProjectionMatrix(); P.camOverride = false; g.hud.bars(false); if (A.hud) g.hud.show(true);
    if (P.updateCamera) P.updateCamera(1, true);
    const s = A.s; if (!A.end) return;
    if (A.ok) { const st = this.state; const first = !st[s.id]; st[s.id] = (st[s.id] || 0) + 1; const res = g.skills ? g.skills.onStunt(s, first) : null;
      const done = STUNTS.filter((q) => q.kind === s.kind && this.state[q.id]).length, tot = STUNTS.filter((q) => q.kind === s.kind).length;
      g.hud.bigMessage?.(s.qp ? '180 AIR' : s.kind === 'car' ? 'STUNT JUMP COMPLETED' : 'RAMP CLEARED', `${s.name}${A.dist > 0 && !s.qp ? ` · ${A.dist.toFixed(1)} m` : ''} · ${done} of ${tot} ${s.kind === 'car' ? 'stunt jumps' : 'bicycle ramps'}${res && res.gain > 0 ? '' : ''}`, 'good');
      Audio.ui?.('success'); }
    else { g.hud.bigMessage?.(s.kind === 'car' ? 'STUNT JUMP FAILED' : 'RAMP FAILED', s.qp ? 'Ride up faster to clear the coping' : `Needed ${s.clear} m — ${Math.max(0, A.dist || 0).toFixed(1)} m`, 'bad'); }
  }
}
export { RAMPS };
