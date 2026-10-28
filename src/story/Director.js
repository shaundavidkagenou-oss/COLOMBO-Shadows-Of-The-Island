// In-engine cinematic director: camera shots, scripted actors/vehicles, timed dialogue, skipping.
import * as THREE from 'three';
import { Character, HEROES } from '../actors/Character.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { easeInOut, lerp, dampAngle, clamp } from '../core/math.js';
import { Audio } from '../audio/Audio.js';

export class Director {
  constructor(game) { this.g = game; this.active = false; this.waits = []; this.actors = new Map(); this.skip = false; this.shotT = null; this.time = 0; this.movers = []; }
  begin() { this.active = true; this.skip = false; this.g.player.cinematic = true; this.g.player.control = false; this.g.hud.bars(true); this.g.hud.show(false); }
  end() { this.active = false; this.shotT = null; this.g.player.cinematic = false; this.g.player.control = true; this.g.hud.bars(false); this.g.hud.show(true); this.g.hud.clearSubtitle(); this.g.player.camYaw = this.g.player.yaw + Math.PI; this.g.player.camPitch = 0.15; this.g.player.snapCamera(); }
  wait(sec) { if (this.skip) return Promise.resolve(); return new Promise((r) => this.waits.push({ t: this.time + sec, r })); }
  // camera shot: from {pos, look} to {pos, look} over dur seconds
  shot(from, to, dur, ease = easeInOut) { this.shotT = { from, to, dur, t0: this.time, ease }; this.applyShot(); return this.wait(dur); }
  hold(pos, look) { this.shotT = { from: { pos, look }, to: { pos, look }, dur: 1, t0: this.time, ease: (t) => t }; this.applyShot(); }
  follow(target, offset, lookOff = [0, 1.5, 0]) { this.shotT = { follow: target, offset, lookOff }; }
  applyShot() {
    const s = this.shotT; if (!s) return; const cam = this.g.camera;
    if (s.follow) { const p = s.follow.root ? s.follow.root.position : s.follow; const want = new THREE.Vector3(p.x + s.offset[0], p.y + s.offset[1], p.z + s.offset[2]); cam.position.lerp(want, 0.08); cam.lookAt(p.x + s.lookOff[0], p.y + s.lookOff[1], p.z + s.lookOff[2]); return; }
    const k = s.ease(clamp((this.time - s.t0) / s.dur, 0, 1)); const P = (a, b) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    const p = P(s.from.pos, s.to.pos), l = P(s.from.look, s.to.look); cam.position.set(p[0], p[1], p[2]); cam.lookAt(l[0], l[1], l[2]);
  }
  say(who, text, dur = null, tr = '', lang = 'en') { const d = dur ?? Math.max(2.2, text.length * 0.065); if (!this.skip) { this.g.hud.subtitle(who, text, tr, d, lang); Audio.talkBlip(lang); } const a = this.actors.get(who); if (a) { a.anim.set('talk'); setTimeout(() => a.anim.action === 'talk' && a.anim.set(null), d * 900); } return this.wait(d + 0.25); }
  // actors
  spawnActor(id, spec, x, z, yaw = 0) { const ch = new Character(spec); ch.root.position.set(x, this.g.collision.groundAt(x, z, 1), z); ch.root.rotation.y = yaw; this.g.scene.add(ch.root); ch.id = id; ch.yaw = yaw; this.actors.set(id, ch); return ch; }
  removeActor(id) { const a = this.actors.get(id); if (!a) return; this.g.scene.remove(a.root); a.dispose(); this.actors.delete(id); this.movers = this.movers.filter((m) => m.ch !== a); }
  walkTo(ch, x, z, speed = 1.35) { return new Promise((r) => { if (this.skip) { ch.root.position.set(x, this.g.collision.groundAt(x, z, 1), z); r(); return; } this.movers.push({ ch, x, z, speed, r }); }); }
  face(ch, x, z) { ch.yaw = Math.atan2(x - ch.root.position.x, z - ch.root.position.z); ch.root.rotation.y = ch.yaw; }
  // scripted vehicle driving along waypoints at constant speed
  driveBy(type, points, speed, seed = 9) {
    const v = new Vehicle(type, seed, this.g.scene); v.place(points[0][0], points[0][1], Math.atan2(points[1][0] - points[0][0], points[1][1] - points[0][1])); v.keep = true; v.scripted = { points, i: 1, speed }; v.lights = true; this.g.traffic.addDriver(v); this.scriptedVehicles = (this.scriptedVehicles || []).concat(v); return v;
  }
  update(dt) {
    this.time += dt;
    if (this.skip) { for (const w of this.waits) w.r(); this.waits = []; for (const m of this.movers) { m.ch.root.position.set(m.x, this.g.collision.groundAt(m.x, m.z, 1), m.z); m.r(); } this.movers = []; }
    else { const due = this.waits.filter((w) => w.t <= this.time); this.waits = this.waits.filter((w) => w.t > this.time); for (const w of due) w.r(); }
    if (this.active) this.applyShot();
    for (const m of [...this.movers]) {
      const p = m.ch.root.position; const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      if (d < 0.15) { m.ch.anim.update(dt, 0); this.movers.splice(this.movers.indexOf(m), 1); m.r(); continue; }
      m.ch.yaw = dampAngle(m.ch.yaw ?? 0, Math.atan2(dx, dz), 8, dt); m.ch.root.rotation.y = m.ch.yaw; const st = Math.min(d, m.speed * dt); p.x += (dx / d) * st; p.z += (dz / d) * st; p.y = this.g.collision.groundAt(p.x, p.z, p.y + 0.3);
      m.ch.anim.update(dt, m.speed, 0);
    }
    for (const [id, a] of this.actors) if (!this.movers.some((m) => m.ch === a)) a.anim.update(dt, 0);
    for (const v of this.scriptedVehicles || []) {
      const s = v.scripted; if (!s) continue; const tg = s.points[s.i]; if (!tg) { v.speed = 0; continue; }
      const dx = tg[0] - v.x, dz = tg[1] - v.z, d = Math.hypot(dx, dz); if (d < 1.5) { s.i++; continue; }
      v.yaw = dampAngle(v.yaw, Math.atan2(dx, dz), 3, dt); v.speed = s.speed; v.x += Math.sin(v.yaw) * s.speed * dt; v.z += Math.cos(v.yaw) * s.speed * dt; v.y = this.g.collision.groundAt(v.x, v.z, 0.5); v.sync(dt);
    }
  }
  clearVehicles() { for (const v of this.scriptedVehicles || []) this.g.traffic.remove(v); this.scriptedVehicles = []; }
}
