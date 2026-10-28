// Kavindu: on-foot controller (walk/jog/sprint/crouch/jump/climb), vehicle enter/exit, and the third-person camera.
import * as THREE from 'three';
import { Character, HEROES } from './Character.js';
import { Input } from '../core/Input.js';
import { Settings } from '../core/Settings.js';
import { clamp, lerp, damp, dampAngle, wrapAngle } from '../core/math.js';
import * as L from '../world/Layout.js';

export class Player {
  constructor(scene, camera, collision, events) {
    this.scene = scene; this.camera = camera; this.collision = collision; this.events = events;
    this.ch = new Character(HEROES.kavindu); scene.add(this.ch.root);
    this.x = 0; this.z = 0; this.y = 0.15; this.vy = 0; this.yaw = 0; this.speed = 0; this.grounded = true; this.vehicle = null; this.sprinting = false; this.crouching = false; this.stamina = 1;
    this.camYaw = 0; this.camPitch = 0.18; this.camDist = 4.2; this.camPos = new THREE.Vector3(); this.camMode = 0; this.control = true; this.climb = null; this.transition = null;
    this.camTarget = new THREE.Vector3(); this.lookAhead = 0; this.shake = 0; this.fpYaw = 0;
  }
  get pos() { return { x: this.x, z: this.z }; }
  teleport(x, z, yaw = 0) { this.x = x; this.z = z; this.y = this.collision.groundAt(x, z, 5, 10); this.yaw = yaw; this.camYaw = yaw + Math.PI; this.vy = 0; this.sync(); this.snapCamera(); }
  sync() { this.ch.root.position.set(this.x, this.y, this.z); this.ch.root.rotation.y = this.yaw; }
  update(dt, traffic) {
    const sens = 0.0024 * Settings.get('mouseSens'); const inv = Settings.get('invertY') ? -1 : 1;
    if (this.control) { this.camYaw -= (Input.mouseDX * sens + Input.pad.rx * dt * 2.6); this.camPitch = clamp(this.camPitch + (Input.mouseDY * sens + Input.pad.ry * dt * 2) * inv, -0.5, 1.2); }
    if (Input.wasPressed('camera') && this.control) this.camMode = (this.camMode + 1) % 3;
    if (this.vehicle) this.updateVehicle(dt, traffic); else this.updateFoot(dt, traffic);
    this.updateCamera(dt);
  }
  updateFoot(dt, traffic) {
    const A = this.ch.anim; let mx = this.control ? Input.moveX : 0, my = this.control ? Input.moveY : 0; const mag = Math.min(1, Math.hypot(mx, my));
    if (this.climb) { // ledge climb: lerp up and over
      const c = this.climb; c.t += dt / 0.9; const k = Math.min(1, c.t);
      this.y = lerp(c.y0, c.y1, Math.min(1, k * 1.6)); this.x = lerp(c.x0, c.x1, Math.max(0, (k - 0.4) / 0.6)); this.z = lerp(c.z0, c.z1, Math.max(0, (k - 0.4) / 0.6));
      A.set('handsup'); A.update(dt, 0); if (k >= 1) { this.climb = null; A.set(null); } this.sync(); return;
    }
    this.crouching = this.control && Input.isDown('crouch');
    this.sprinting = this.control && Input.isDown('sprint') && mag > 0.3 && this.stamina > 0.05 && !this.crouching;
    this.stamina = clamp(this.stamina + (this.sprinting ? -dt * 0.09 : dt * 0.15), 0, 1);
    const maxSp = this.crouching ? 1.4 : this.sprinting ? 6.6 : mag > 0.85 ? 3.4 : 1.5;
    let dirYaw = this.yaw;
    if (mag > 0.05) { const camF = this.camYaw + Math.PI; dirYaw = camF + Math.atan2(-mx, my); }
    const target = mag > 0.05 ? maxSp * Math.max(mag, 0.5) : 0;
    this.speed = damp(this.speed, target, target > this.speed ? 6 : 10, dt);
    const prevYaw = this.yaw; if (mag > 0.05) this.yaw = dampAngle(this.yaw, dirYaw, this.sprinting ? 7 : 10, dt);
    const turnRate = wrapAngle(this.yaw - prevYaw) / Math.max(dt, 1e-4);
    let nx = this.x + Math.sin(this.yaw) * this.speed * dt, nz = this.z + Math.cos(this.yaw) * this.speed * dt;
    let r;
    if (this.indoor) r = this.resolveIndoor(nx, nz);
    else {
      if (!this.collision.walkableWater(nx, nz, this.y)) { nx = this.x; nz = this.z; this.speed *= 0.5; }
      r = this.collision.resolveCircle(nx, nz, 0.32, this.y, 0.45, 1.75);
    }
    // auto-avoid other vehicles physically
    if (traffic && !this.indoor) for (const v of traffic.all()) { if (Math.abs(v.x - r.x) > 8 || Math.abs(v.z - r.z) > 8) continue; for (const [cx, cz] of v.circles()) { const dx = r.x - cx, dz = r.z - cz; const d = Math.hypot(dx, dz), m = v.radius + 0.32; if (d < m && d > 1e-4) { r.x = cx + dx / d * m; r.z = cz + dz / d * m; } } }
    this.x = r.x; this.z = r.z;
    // jump / climb
    if (this.control && Input.wasPressed('jump') && this.grounded) {
      const ledge = this.indoor ? null : this.findLedge();
      if (ledge) this.climb = { t: 0, x0: this.x, z0: this.z, y0: this.y, x1: ledge.x, z1: ledge.z, y1: ledge.y };
      else { this.vy = 4.6; this.grounded = false; A.air = 1; this.events.emit('jump'); }
    }
    const g = this.indoor ? this.indoor.y : this.collision.groundAt(this.x, this.z, this.y, 0.5);
    if (!this.grounded || this.y > g + 0.05) { this.vy -= 13 * dt; this.y += this.vy * dt; if (this.y <= g) { if (!this.grounded && this.vy < -3) this.events.emit('land'); this.y = g; this.vy = 0; this.grounded = true; A.air = 0; } else { this.grounded = false; A.air = 1; } }
    else { this.y = damp(this.y, g, 20, dt); this.grounded = true; A.air = 0; }
    if (this.crouching) A.set('crouch'); else if (A.action === 'crouch') A.set(null);
    if (this.emote && this.speed > 0.5) { this.emote = null; A.set(null); }
    A.update(dt, this.speed, turnRate);
    this.sync();
    if (A.stepped) { A.stepped = false; if (this.grounded && this.speed > 0.5) this.events.emit('footstep', { x: this.x, z: this.z, sprint: this.sprinting }); } // real foot contacts from the gait
  }
  resolveIndoor(x, z) {
    const b = this.indoor.bounds, R = 0.3; x = clamp(x, b.x0 + R, b.x1 - R); z = clamp(z, b.z0 + R, b.z1 - R);
    for (const o of this.indoor.obstacles) { if (x > o.x0 - R && x < o.x1 + R && z > o.z0 - R && z < o.z1 + R) { const dl = x - (o.x0 - R), dr = o.x1 + R - x, dt = z - (o.z0 - R), db = o.z1 + R - z; const m = Math.min(dl, dr, dt, db); if (m === dl) x = o.x0 - R; else if (m === dr) x = o.x1 + R; else if (m === dt) z = o.z0 - R; else z = o.z1 + R; } }
    return { x, z };
  }
  findLedge() { // something 0.6–1.9 m high directly ahead with space on top
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const d of [0.6, 0.9]) {
      const px = this.x + fx * d, pz = this.z + fz * d;
      for (const c of this.collision.query(px - 0.1, pz - 0.1, px + 0.1, pz + 0.1)) {
        if (px < c.x0 || px > c.x1 || pz < c.z0 || pz > c.z1) continue; const top = (c.y0 || 0) + c.h;
        if (top - this.y > 0.55 && top - this.y < 1.95 && c.kind !== 'building' && c.kind !== 'pole') { const tx = this.x + fx * (d + 0.5), tz = this.z + fz * (d + 0.5); return { x: tx, z: tz, y: Math.max(top, this.collision.groundAt(tx, tz, top + 0.1)) }; }
      }
    }
    return null;
  }
  enterVehicle(v, traffic) {
    const hadDriver = traffic.takeOver(v); v.player = true; this.vehicle = v; const seat = v.driverSeat();
    this.scene.remove(this.ch.root); v.mesh.add(this.ch.root); this.ch.root.position.set(seat.x, seat.y - 0.5, seat.z); this.ch.root.rotation.set(0, 0, 0);
    this.ch.anim.set(seat.ride ? 'ride' : 'drive'); this.ch.anim.actionW = 1; this.ch.mesh.castShadow = true; v.lights = this.nightLights;
    this.camYaw = v.yaw + Math.PI; this.events.emit('enterVehicle', { v, hadDriver });
  }
  exitVehicle(traffic) {
    const v = this.vehicle; if (!v || Math.abs(v.speed) > 3) return false;
    let p = v.exitPoint(-1); if (this.collision.blocked(p.x, p.z, 0.35)) p = v.exitPoint(1);
    v.mesh.remove(this.ch.root); this.scene.add(this.ch.root); v.player = false; v.speed = 0; v.brake = false; traffic.release(v);
    this.vehicle = null; this.ch.anim.set(null); this.teleportKeepCam(p.x, p.z, v.yaw); this.events.emit('exitVehicle', v); return true;
  }
  teleportKeepCam(x, z, yaw) { this.x = x; this.z = z; this.y = this.collision.groundAt(x, z, 1); this.yaw = yaw; this.sync(); }
  updateVehicle(dt, traffic) {
    const v = this.vehicle; const c = this.control;
    const throttle = c ? clamp((Input.isDown('forward') ? 1 : 0) - (Input.isDown('back') ? 1 : 0) + Input.pad.rt - Input.pad.lt, -1, 1) : 0;
    const steer = c ? clamp((Input.isDown('left') ? 1 : 0) - (Input.isDown('right') ? 1 : 0) - Input.pad.lx, -1, 1) : 0;
    v.drive(dt, { throttle, steer, handbrake: c && Input.isDown('jump') }, this.collision, traffic.all());
    this.ch.anim.steer = v.steer / v.T.steer; this.ch.anim.update(dt, 0);
    this.x = v.x; this.z = v.z; this.y = v.y; this.yaw = v.yaw;
    if (c && Input.wasPressed('horn')) this.events.emit('horn', v);
    if (c && Input.wasPressed('lights')) { v.lights = !v.lights; this.nightLights = v.lights; }
    if (v.lastImpact && performance.now() - v.lastImpact.t < 50) { this.shake = Math.min(1, v.lastImpact.v / 20); this.events.emit('crash', v.lastImpact.v); v.lastImpact = null; }
  }
  snapCamera() { this.updateCamera(1, true); }
  updateCamera(dt, snap = false) {
    if (this.cinematic) return; const cam = this.camera; const v = this.vehicle;
    const distMul = Settings.get('cameraDistance');
    let dist, height, tgt;
    if (v) {
      const big = v.T.len > 6; dist = (big ? 11 : v.type === 'bike' || v.type === 'tuktuk' ? 4.8 : 6.2) * distMul * (this.camMode === 1 ? 1.5 : 1); height = big ? 3.4 : 1.6;
      // chase cam: drift behind vehicle heading unless the player is looking around
      if (Math.abs(Input.mouseDX) < 0.5 && Math.abs(Input.pad.rx) < 0.1) { this.idleCam = (this.idleCam || 0) + dt; if (this.idleCam > 1.2 || Math.abs(v.speed) > 6) this.camYaw = dampAngle(this.camYaw, v.yaw + Math.PI + (v.speed < -1 ? Math.PI : 0), 2.5, dt); } else this.idleCam = 0;
      tgt = new THREE.Vector3(v.x, v.y + height, v.z);
    } else {
      dist = (this.camMode === 1 ? 6.5 : 3.6) * distMul; height = this.crouching ? 1.1 : 1.55; tgt = new THREE.Vector3(this.x, this.y + height, this.z);
      if (this.indoor) dist = Math.min(dist, 2.6);
    }
    if (this.camMode === 2 && !v) { // first person
      const h = this.ch.bones.head; h.updateWorldMatrix(true, false); const hp = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld);
      cam.position.copy(hp).add(new THREE.Vector3(Math.sin(this.camYaw + Math.PI) * 0.12, 0.05, Math.cos(this.camYaw + Math.PI) * 0.12));
      cam.lookAt(cam.position.x + Math.sin(this.camYaw + Math.PI) * Math.cos(this.camPitch), cam.position.y - Math.sin(this.camPitch), cam.position.z + Math.cos(this.camYaw + Math.PI) * Math.cos(this.camPitch));
      this.ch.mesh.visible = false; return;
    }
    this.ch.mesh.visible = true;
    const cp = Math.cos(this.camPitch), spch = Math.sin(this.camPitch);
    const want = new THREE.Vector3(tgt.x + Math.sin(this.camYaw) * cp * dist, tgt.y + spch * dist, tgt.z + Math.cos(this.camYaw) * cp * dist);
    // camera collision
    let t = 1;
    if (this.indoor) { const b = this.indoor.bounds, top = this.indoor.y + (this.indoor.id === 'garage' ? 4.6 : 2.9); want.x = clamp(want.x, b.x0 + 0.05, b.x1 - 0.05); want.z = clamp(want.z, b.z0 + 0.05, b.z1 - 0.05); want.y = clamp(want.y, this.indoor.y + 0.4, top); }
    else {
      t = this.collision.raycast(tgt.x, tgt.y, tgt.z, want.x, want.y, want.z, 0.25);
      if (t < 1) want.lerpVectors(tgt, want, Math.max(0.12, t - 0.05));
      const gy = L.groundY(want.x, want.z) + 0.3; if (want.y < gy) want.y = gy;
    }
    if (snap) this.camPos.copy(want); else this.camPos.lerp(want, 1 - Math.exp(-dt * (t < 1 ? 25 : 12)));
    cam.position.copy(this.camPos);
    if (this.shake > 0 && Settings.get('cameraShake')) { cam.position.x += (Math.random() - 0.5) * this.shake * 0.3; cam.position.y += (Math.random() - 0.5) * this.shake * 0.3; this.shake = Math.max(0, this.shake - dt * 2.5); }
    cam.lookAt(tgt);
    if (v) { const spd = Math.abs(v.speed); const f = Settings.get('fov') + Math.min(12, spd * 0.35); if (Math.abs(cam.fov - f) > 0.05) { cam.fov = damp(cam.fov, f, 3, dt); cam.updateProjectionMatrix(); } }
    else if (Math.abs(cam.fov - Settings.get('fov')) > 0.05) { cam.fov = damp(cam.fov, Settings.get('fov'), 3, dt); cam.updateProjectionMatrix(); }
  }
  serialize() { return { x: this.x, z: this.z, yaw: this.yaw }; }
}
