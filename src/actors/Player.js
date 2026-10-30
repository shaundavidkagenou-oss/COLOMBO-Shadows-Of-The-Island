// Dineth: on-foot controller (walk/jog/sprint/crouch/jump/climb), vehicle enter/exit, and the third-person camera.
import { separate } from './Bodies.js';
import * as THREE from 'three';
import { Character, HEROES } from './Character.js';
import { Input } from '../core/Input.js';
import { Settings } from '../core/Settings.js';
import { clamp, lerp, damp, dampAngle, wrapAngle } from '../core/math.js';
import * as L from '../world/Layout.js';
const _feet = new THREE.Vector3();

export class Player {
  constructor(scene, camera, collision, events) {
    this.scene = scene; this.camera = camera; this.collision = collision; this.events = events;
    this.ch = new Character(HEROES.dineth); scene.add(this.ch.root);
    this.x = 0; this.z = 0; this.y = 0.15; this.vy = 0; this.yaw = 0; this.speed = 0; this.grounded = true; this.vehicle = null; this.sprinting = false; this.crouching = false; this.stamina = 1;
    this.camYaw = 0; this.camPitch = 0.18; this.camDist = 4.2; this.camPos = new THREE.Vector3(); this.camMode = 0; this.control = true; this.climb = null; this.transition = null;
    this.camTarget = new THREE.Vector3(); this.lookAhead = 0; this.shake = 0; this.fpYaw = 0;
  }
  get pos() { return { x: this.x, z: this.z }; }
  // a teleport out of the current room (arrest, hospital, mission skip, fast travel) releases it first, otherwise the room's
  // bounds clamp would pull the player straight back inside
  leaveRoomFor(x, z) { const I = this.indoor, b = I && I.bounds; if (b && (x < b.x0 - 1 || x > b.x1 + 1 || z < b.z0 - 1 || z > b.z1 + 1)) this.indoor = null; }
  teleport(x, z, yaw = 0) { this.leaveRoomFor(x, z); this.x = x; this.z = z; this.y = this.collision.groundAt(x, z, 5, 10); this.yaw = yaw; this.camYaw = yaw + Math.PI; this.vy = 0; this.sync(); this.snapCamera(); }
  sync() { this.ch.root.position.set(this.x, this.y, this.z); this.ch.root.rotation.y = this.yaw; }
  update(dt, traffic) {
    const sens = 0.0024 * Settings.get('mouseSens'); const inv = Settings.get('invertY') ? -1 : 1;
    if (this.control && !this.lookLock) { const zs = this.scoped ? 1 / this.scoped.zoom : this.aiming ? 0.75 : 1; this.camYaw -= (Input.mouseDX * sens + Input.pad.rx * dt * 2.6) * zs; this.camPitch = clamp(this.camPitch + (Input.mouseDY * sens + Input.pad.ry * dt * 2) * inv * zs, -0.5, 1.2); }
    if (Input.wasPressed('camera') && this.control) this.camMode = (this.camMode + 1) % 3;
    if (this.settling) { const S = this.settling; S.t += dt; if (S.t > 1.5 || S.v === this.vehicle || S.v.player || S.v.ai) this.settling = null; else S.v.sync(dt); } // a car just left keeps rocking on its springs for a moment
    if (this.exiting) this.updateExit(dt); else if (this.entry) this.updateEntry(dt); else if (this.vehicle) this.updateVehicle(dt, traffic); else this.updateFoot(dt, traffic);
    this.updateCamera(dt);
  }
  updateFoot(dt, traffic) {
    if (this.hitCd > 0) this.hitCd -= dt;
    const A = this.ch.anim; let mx = this.control ? Input.moveX : 0, my = this.control ? Input.moveY : 0; const mag = Math.min(1, Math.hypot(mx, my));
    if (this.climb) { // ledge climb: lerp up and over
      const c = this.climb; c.t += dt / 0.9; const k = Math.min(1, c.t);
      this.y = lerp(c.y0, c.y1, Math.min(1, k * 1.6)); this.x = lerp(c.x0, c.x1, Math.max(0, (k - 0.4) / 0.6)); this.z = lerp(c.z0, c.z1, Math.max(0, (k - 0.4) / 0.6));
      A.set('handsup'); A.update(dt, 0); if (k >= 1) { this.climb = null; A.set(null); } this.sync(); return;
    }
    this.crouching = this.control && Input.isDown('crouch');
    this.sprinting = this.control && Input.isDown('sprint') && mag > 0.3 && this.stamina > 0.05 && !this.crouching && !this.aiming;
    const pk = this.perk || { speed: 1, stamina: 1 }; // squad member: Dineth runs faster and longer, Shashika is heavier
    this.stamina = clamp(this.stamina + (this.sprinting ? -dt * 0.09 / pk.stamina : dt * 0.15), 0, 1);
    const maxSp = (this.aiming ? (this.scoped ? 0.9 : 1.8) : this.crouching ? 1.4 : this.sprinting ? 6.6 : mag > 0.85 ? 3.4 : 1.5) * (this.aiming ? 1 : pk.speed);
    let dirYaw = this.yaw;
    if (mag > 0.05) { const camF = this.camYaw + Math.PI; dirYaw = camF + Math.atan2(-mx, my); }
    const target = mag > 0.05 ? maxSp * Math.max(mag, 0.5) : 0;
    this.speed = damp(this.speed, target, target > this.speed ? 6 : 10, dt);
    const prevYaw = this.yaw; const fpArmed = this.camMode === 2 && this.weapons && this.weapons.drawn; if (this.aiming || fpArmed) this.yaw = dampAngle(this.yaw, this.camYaw + Math.PI, this.camMode === 2 ? 40 : 18, dt); /* first person with a weapon up: the body (and the weapon) face the view */ else if (mag > 0.05) this.yaw = dampAngle(this.yaw, dirYaw, this.sprinting ? 7 : 10, dt);
    const moveYaw = this.aiming && mag > 0.05 ? dirYaw : this.yaw; // strafing while aiming: body faces the aim, feet follow the input
    const turnRate = wrapAngle(this.yaw - prevYaw) / Math.max(dt, 1e-4);
    let nx = this.x + Math.sin(moveYaw) * this.speed * dt, nz = this.z + Math.cos(moveYaw) * this.speed * dt;
    let r;
    if (this.bodies && this.bodies.length) { const q = separate(this.bodies, nx, nz, this.y, 0.32, this.ch, 0.55); if (q.hit) { nx = q.x; nz = q.z; this.speed *= 0.92; } } // people are solid; crowd peds get nudged aside
    if (this.indoor) r = this.resolveIndoor(nx, nz);
    else {
      if (!this.collision.walkableWater(nx, nz, this.y) && this.collision.walkableWater(this.x, this.z, this.y)) { nx = this.x; nz = this.z; this.speed *= 0.5; }
      r = this.collision.resolveCircle(nx, nz, 0.32, this.y, 0.45, 1.75);
    }
    // auto-avoid other vehicles physically
    if (traffic && !this.indoor) for (const v of traffic.all()) { const lim = 3 + (v.T ? v.T.len / 2 : 5); if (Math.abs(v.x - r.x) > lim || Math.abs(v.z - r.z) > lim) continue; const q = v.pushOut(r.x, r.z, 0.32); if (q) { r.x = q.x; r.z = q.z; if (Math.abs(v.speed) > 3.2 && !(this.hitCd > 0)) { this.hitCd = 1.5; this.ch.anim.play('stumble', 1.1); this.events.emit('hitByVehicle', Math.abs(v.speed), v); } } } // solid body box (parked cars, buses, bikes)
    this.x = r.x; this.z = r.z;
    // jump / climb
    if (this.control && Input.wasPressed('jump') && this.grounded) {
      const ledge = this.indoor ? null : this.findLedge();
      if (ledge) this.climb = { t: 0, x0: this.x, z0: this.z, y0: this.y, x1: ledge.x, z1: ledge.z, y1: ledge.y };
      else { this.vy = 4.6; this.grounded = false; A.air = 1; this.events.emit('jump'); }
    }
    const g = this.indoor ? (this.indoor.floorAt ? this.indoor.floorAt(this.x, this.z, this.y) : this.indoor.y) : this.collision.groundAt(this.x, this.z, this.y, 0.5);
    if (!this.grounded || this.y > g + 0.05) { this.vy -= 13 * dt; this.y += this.vy * dt; if (this.y <= g) { if (!this.grounded && this.vy < -3) { this.lastLandVy = this.vy; this.events.emit('land'); } this.y = g; this.vy = 0; this.grounded = true; A.air = 0; } else { this.grounded = false; A.air = 1; } }
    else { this.y = damp(this.y, g, 20, dt); this.grounded = true; A.air = 0; }
    if (this.crouching) A.set('crouch'); else if (A.action === 'crouch') A.set(null);
    if (this.emote && (this.speed > 0.5 || !A.action)) { if (A.action === this.emote) A.set(null); this.emote = null; }
    // unarmed idle: after standing still a while, an occasional natural fidget (check watch, cross arms, look around…)
    const calm = this.control && !this.crouching && !A.action && !(this.weapons && this.weapons.drawn) && this.grounded && this.speed < 0.1 && !this.indoorBusy;
    this.idleT = calm ? (this.idleT || 0) + dt : 0;
    if (this.policeStop) this.idleT = 0; // no casual fidgets while an officer is speaking to you
    if (this.idleT > (this.nextFidget ||= 9 + Math.random() * 6)) { const f = ['watch', 'crossarms', 'look', 'hips', 'stretch'][Math.floor(Math.random() * 5)]; A.play(f, f === 'look' ? 3.5 : 3); this.idleT = 0; this.nextFidget = 10 + Math.random() * 10; }
    if (A.action && ['watch', 'crossarms', 'hips', 'stretch', 'look'].includes(A.action) && (this.speed > 0.3 || !this.control || this.policeStop)) A.set(null);
    A.update(dt, this.speed, turnRate);
    this.sync();
    if (A.stepped) { A.stepped = false; if (this.grounded && this.speed > 0.5) this.events.emit('footstep', { x: this.x, z: this.z, sprint: this.sprinting }); } // real foot contacts from the gait
  }
  resolveIndoor(x, z) {
    const b = this.indoor.bounds, R = 0.3, gp = this.indoor.gap; const out = gp && x > gp[0] + R && x < gp[1] - R && z < b.z0 + 1.2; /* walk-in room: the doorway is open to the street */ x = clamp(x, out ? gp[0] + R : b.x0 + R, out ? gp[1] - R : b.x1 - R); z = clamp(z, out ? b.z0 - 2 : b.z0 + R, b.z1 - R);
    for (const o of (this.indoor.obsFor ? this.indoor.obsFor(this.y) : this.indoor.obstacles)) { if (x > o.x0 - R && x < o.x1 + R && z > o.z0 - R && z < o.z1 + R) { const dl = x - (o.x0 - R), dr = o.x1 + R - x, dt = z - (o.z0 - R), db = o.z1 + R - z; const m = Math.min(dl, dr, dt, db); if (m === dl) x = o.x0 - R; else if (m === dr) x = o.x1 + R; else if (m === dt) z = o.z0 - R; else z = o.z1 + R; } }
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
  // ---- staged vehicle entry / exit -------------------------------------------------------------------------------
  // approach the door → face it → open → (occupied: the driver is pulled out / resists, then flees or argues) → sit,
  // hands to the wheel → close. Exit is the reverse, using whichever side is free. Movement input during the approach
  // cancels; nothing here can leave the player without control (timeouts fall back to finishing the step).
  enterVehicle(v, traffic) {
    if (this.entry) return; if (this.settling && this.settling.v === v) this.settling = null; const ud = v.mesh.userData; const e = ud.entry || { x: -(v.T.wid / 2 + 0.55), z: 0, side: -1 };
    v.hold = true; this.entry = { v, traffic, stage: 'approach', t: 0, total: 0, e, door: ud.door, kind: v.T.entry || 'car', driver: v.driverChar || null };
    this.control = false; this.speed = 0;
  }
  // driver door as a damped spring (normalised angle 0..1): opens off the latch, bounces lightly on the check strap,
  // and a close accelerates into the latch → slam (sound + the body rocks on its springs). Returns 'latched' on a close.
  driveDoor(v, door, side, target, dt, w = 9, z = 0.7) {
    if (!door) return null; const h = Math.min(dt, 1 / 30); door.ang = door.ang || 0; door.vel = door.vel || 0; let ev = null;
    door.vel += (w * w * (target - door.ang) - 2 * z * w * door.vel) * h; door.ang += door.vel * h;
    if (door.ang > 1.05) { door.ang = 1.05; if (door.vel > 0) door.vel *= -0.25; } // check-strap stop
    if (door.ang < 0) { const s = -door.vel; door.ang = 0; door.vel = 0; ev = 'latched'; if (s > 0.6) { v.slam(s); this.events.emit('doorSlam', { v, s }); } }
    door.pivot.rotation.y = door.max * door.ang * (side < 0 ? 1 : -1); return ev;
  }
  // During the seat ↔ standing blends the legs fold while the root travels, which used to drop the feet through the cabin
  // floor (and the road). Raise the root just enough that neither sole is below the surface under it: the floor pan /
  // footboard (seat.floor) inside the vehicle's footprint, the road (vehicle-local 0) outside it.
  keepFeetAbove(v, seat) {
    if (seat.ride) return; const ch = this.ch, r = ch.root, bones = ch.bones || {}; const fl = bones.footL, fr = bones.footR; if (!fl || !fr || !ch.mesh.skeleton) return;
    if (ch._soleH === undefined) { const sk = ch.mesh.skeleton, i = sk.bones.indexOf(fl); ch._soleH = i >= 0 ? new THREE.Matrix4().copy(sk.boneInverses[i]).invert().elements[13] : 0.08; } // ankle height above the sole (bind pose)
    r.updateMatrixWorld(true); v.mesh.updateMatrixWorld(); const hw = v.T.wid / 2 - 0.1, hl = v.T.len / 2 - 0.15; const floor = seat.floor !== undefined ? seat.floor : seat.y - 0.3;
    let need = 0; for (const b of [fl, fr]) { b.getWorldPosition(_feet); v.mesh.worldToLocal(_feet); const under = Math.abs(_feet.x) < hw && Math.abs(_feet.z) < hl ? floor : 0; need = Math.max(need, under - (_feet.y - ch._soleH * 0.85)); }
    if (need > 0.002) { r.position.y += need; r.updateMatrixWorld(true); }
  }
  local(v, x, y, z) { v.mesh.updateMatrixWorld(); return new THREE.Vector3(x, y, z).applyMatrix4(v.mesh.matrixWorld); }
  updateEntry(dt) {
    const E = this.entry; const v = E.v; const A = this.ch.anim; E.t += dt; E.total += dt; const e = E.e; const seat = v.driverSeat();
    const faceYawL = -e.side * Math.PI / 2; const doorAng = (k) => { if (E.door) { E.door.ang = k; E.door.vel = 0; E.door.pivot.rotation.y = E.door.max * k * (e.side < 0 ? 1 : -1); } };
    const door = (target, w, z) => this.driveDoor(v, E.door, e.side, target, dt, w, z); if (E.stage !== 'approach') v.sync(dt); // held vehicle is not stepped: keep its springs alive
    const next = (st) => { E.stage = st; E.t = 0; };
    const walkTo = (wx, wz, sp) => { const dx = wx - this.x, dz = wz - this.z, d = Math.hypot(dx, dz); if (d > 0.05) { const st = Math.min(d, sp * dt); this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt); const r = this.collision.resolveCircle(this.x + dx / d * st, this.z + dz / d * st, 0.3, this.y, 0.45, 1.75); this.x = r.x; this.z = r.z; } this.y = this.collision.groundAt(this.x, this.z, this.y, 0.5); A.update(dt, d > 0.15 ? sp : 0, 0); this.sync(); return d; };
    switch (E.stage) {
      case 'approach': {
        if ((Input.moveX || Input.moveY) && E.total > 0.2) { v.hold = false; this.entry = null; this.control = true; return; } // player cancelled
        const p = this.local(v, e.x, 0, e.z); const d = walkTo(p.x, p.z, Math.min(3.2, 1.5 + E.total));
        if (d < 0.18 || E.t > 6) { next('align'); this.x = p.x; this.z = p.z; } break; }
      case 'align': { // square up to the door
        const want = v.yaw + faceYawL; this.yaw = dampAngle(this.yaw, want, 12, dt); A.update(dt, 0, 0); this.sync();
        if (Math.abs(wrapAngle(this.yaw - want)) < 0.05 || E.t > 0.5) { next(E.door ? 'open' : E.kind === 'bus' ? 'board' : 'step'); A.set('interact'); E.hadDriver = E.traffic.takeOver(v, true); v.speed = 0; } break; }
      case 'open': { // pull the handle: the door pops off the latch, then swings out onto its check strap
        if (E.t === dt) { doorAng(0); this.events.emit('doorOpen', { v }); } if (E.t < 0.14) door(0.07, 14, 1); else door(1, 8.5, 0.62); A.update(dt, 0, 0); this.sync();
        if ((E.t > 0.45 && E.door.ang > 0.9) || E.t > 1.1) next(E.driver ? (Math.random() < 0.25 ? 'resist' : 'pull') : 'sit'); break; }
      case 'resist': { // driver grabs the door / pushes back briefly before giving in
        A.set('shove'); if (E.driver) { E.driver.anim.set('argue'); E.driver.face.set('angry', 2); E.driver.anim.update(dt, 0); } door(0.7 + Math.sin(E.t * 5.2) * 0.13 + Math.sin(E.t * 11.3) * 0.04, 13, 0.55); A.update(dt, 0, 0); this.sync(); /* tug of war on the door: smooth pulls, not a jitter */
        if (E.t === dt) this.events.emit('npcLineRaw', { who: 'Driver', text: 'Ado! Let go! This is my vehicle!' }); if (E.t > 1.3) next('pull'); break; }
      case 'pull': { // driver is pulled out of the seat and steps away (no teleport swap)
        const d = E.driver; const k = Math.min(1, E.t / 0.9); A.set('shove'); if (d && E.t === dt) { E.handledLine = true; this.events.emit('npcLineRaw', { who: 'Driver', text: "Ado! What are you doing? That's my vehicle!" }); if (d.face) d.face.set('fear', 2); }
        if (d) { const sx = lerp(seat.x, e.x + e.side * 0.6, k), sz = lerp(seat.z, e.z - 0.5, k); d.root.position.set(sx, lerp(seat.y, 0, Math.min(1, k * 1.5)), sz); d.root.rotation.y = lerp(0, faceYawL + Math.PI, k); d.anim.sitIn(seat, Math.max(0, 1 - k * 1.6)); d.anim.set(k > 0.25 && k < 0.7 ? 'stumble' : null); d.anim.update(dt, k > 0.5 ? 1.2 : 0, 0); if (k >= 1) d.anim.standUp(); }
        A.update(dt, 0, 0); this.sync();
        if (k >= 1) { if (d) { v.mesh.remove(d.root); const wp = this.local(v, e.x + e.side * 0.6, 0, e.z - 0.5); v.driverChar = null; if (this.crowd) this.crowd.adopt(d, wp.x, wp.z, v.yaw + faceYawL + Math.PI, Math.random() < 0.4 ? 'confront' : 'flee', { x: this.x, z: this.z }); else d.dispose(); E.driver = null; } next('sit'); }
        break; }
      case 'board': { const k = Math.min(1, E.t / 0.6); const p = this.local(v, e.x - e.side * 0.9, 0.35 * k, e.z); this.x = lerp(this.x, p.x, k); this.z = lerp(this.z, p.z, k); A.update(dt, 1, 0); this.sync(); if (k >= 1) { if (E.driver) next('pull'); else next('sit'); } break; }
      case 'step': if (E.driver) { E.hadDriver = true; next('pull'); break; } next('sit'); break;
      case 'sit': { // move from the doorway into the seat, turn to face forward, settle into the driving pose
        if (E.door) door(1, 8.5, 0.62); v.load = Math.min(1, E.t / 0.5); // weight comes onto the seat: the driver's side settles
        if (E.t === dt || !E.parented) { this.scene.remove(this.ch.root); v.mesh.add(this.ch.root); E.parented = true; E.from = this.ch.root.position.clone(); const inv = new THREE.Matrix4().copy(v.mesh.matrixWorld).invert(); E.from = new THREE.Vector3(this.x, this.y, this.z).applyMatrix4(inv); A.set(null); A.sitIn(seat, 0); }
        const dur = E.kind === 'bike' ? 0.7 : E.kind === 'bus' ? 0.9 : 0.85; const k = Math.min(1, E.t / dur), s = k * k * (3 - 2 * k);
        const tx = seat.x, ty = seat.y, tz = seat.z; this.ch.root.position.set(lerp(E.from.x, tx, s), lerp(E.from.y, ty, Math.min(1, s * 1.4)), lerp(E.from.z, tz, s));
        this.ch.root.rotation.set(0, lerp(faceYawL, 0, Math.min(1, s * 1.2)), 0); A.sitIn(seat, s); A.update(dt, 0, 0); this.keepFeetAbove(v, seat);
        if (k >= 1) next(E.door ? 'close' : 'done'); break; }
      case 'close': { const ev = door(-0.35, 6.5, 0.9); A.update(dt, 0, 0); if (ev === 'latched' || E.t > 1.2) next('done'); break; } // pulled shut from inside: it swings in and slams on the latch
      case 'done': {
        doorAng(0); this.entry = null; v.hold = false; v.player = true; this.vehicle = v; this.control = true; this.ch.root.position.set(seat.x, seat.y, seat.z); this.ch.root.rotation.set(0, 0, 0);
        this.ch.anim.set(null); this.ch.anim.sitIn(seat, 1); this.ch.mesh.castShadow = true; v.lights = this.nightLights;
        this.camYaw = v.yaw + Math.PI; this.events.emit('enterVehicle', { v, hadDriver: E.hadDriver && !E.handledLine }); break; }
    }
  }
  // free exit spot: driver door side, then the other side, then anywhere around the vehicle
  exitSpot(v) {
    const ud = v.mesh.userData; const e = ud.entry || { x: -(v.T.wid / 2 + 0.55), z: 0, side: -1 }; const hw = v.T.wid / 2;
    const free = (lx, lz) => { const p = this.local(v, lx, 0, lz); if (this.collision.blocked(p.x, p.z, 0.32)) return null; return { lx, lz, x: p.x, z: p.z }; };
    let s = free(e.x, e.z) || free(-e.x, e.z) || free(-e.x, e.z - 0.8);
    for (let i = 0; !s && i < 12; i++) { const a = (i / 12) * Math.PI * 2; s = free(Math.sin(a) * (hw + 0.8), Math.cos(a) * (v.T.len / 2 + 0.6)); }
    return s || { lx: e.x, lz: e.z, ...this.local(v, e.x, 0, e.z), forced: true };
  }
  exitVehicle(traffic) {
    const v = this.vehicle; if (!v || Math.abs(v.speed) > 3 || this.exiting) return false;
    const spot = this.exitSpot(v); const ud = v.mesh.userData; const sameSide = Math.sign(spot.lx) === Math.sign((ud.entry || { x: -1 }).x);
    this.exiting = { v, traffic, spot, t: 0, stage: ud.door && sameSide ? 'open' : 'out', door: sameSide ? ud.door : null, side: Math.sign(spot.lx) || -1 };
    this.control = false; v.speed = 0; v.brake = true; return true;
  }
  updateExit(dt) {
    const X = this.exiting; const v = X.v; X.t += dt; const A = this.ch.anim; const seat = v.driverSeat(); const side = X.side;
    const doorAng = (k) => { if (X.door) { X.door.ang = k; X.door.vel = 0; X.door.pivot.rotation.y = X.door.max * k * (side < 0 ? 1 : -1); } };
    const door = (target, w, z) => this.driveDoor(v, X.door, side, target, dt, w, z); if (X.stage !== 'end') v.sync(dt); // the vehicle is not stepped while getting out
    if (X.stage === 'open') { if (X.t === dt) { doorAng(0); this.events.emit('doorOpen', { v }); } if (X.t < 0.12) door(0.07, 14, 1); else door(1, 9, 0.62); A.update(dt, 0, 0); if ((X.t > 0.4 && X.door.ang > 0.88) || X.t > 1) { X.stage = 'out'; X.t = 0; } return; }
    if (X.stage === 'out') { // swing out of the seat to the spot beside the vehicle
      const k = Math.min(1, X.t / 0.8), s = k * k * (3 - 2 * k); const tx = X.spot.lx, tz = X.spot.lz; A.sitIn(seat, 1 - s); if (A.action) A.set(null); if (X.door) door(1, 9, 0.62); v.load = Math.max(0, 1 - k * 1.6); // weight off the seat: the body rises back
      this.ch.root.position.set(lerp(seat.x, tx, s), lerp(seat.y, 0, Math.min(1, s * 1.3)), lerp(seat.z, tz, s)); this.ch.root.rotation.set(0, lerp(0, -side * Math.PI / 2 + Math.PI, s), 0); A.update(dt, k > 0.4 ? 0.8 : 0, 0); this.keepFeetAbove(v, seat);
      if (k >= 1) { // re-parent to the world at the exact same place
        v.mesh.remove(this.ch.root); this.scene.add(this.ch.root); v.player = false; v.speed = 0; v.brake = false; X.traffic.release(v); this.vehicle = null;
        this.x = X.spot.x; this.z = X.spot.z; this.y = this.collision.groundAt(this.x, this.z, v.y + 0.5, 1); this.yaw = v.yaw - side * Math.PI / 2 + Math.PI; this.sync(); A.set(null); A.standUp();
        X.stage = X.door ? 'close' : 'end'; X.t = 0; }
      return; }
    if (X.stage === 'close') { const ev = door(-0.4, 7.5, 0.85); A.update(dt, 0, 0); this.sync(); if (ev === 'latched' || X.t > 1.2) { X.stage = 'end'; } return; } // pushed shut from outside: slams
    doorAng(0); this.settling = { v, t: 0 }; this.exiting = null; this.control = true; this.events.emit('exitVehicle', v);
  }
  teleportKeepCam(x, z, yaw) { this.leaveRoomFor(x, z); this.x = x; this.z = z; this.y = this.collision.groundAt(x, z, 1); this.yaw = yaw; this.sync(); }
  updateVehicle(dt, traffic) {
    const v = this.vehicle; const c = this.control;
    const throttle = c ? clamp((Input.isDown('forward') ? 1 : 0) - (Input.isDown('back') ? 1 : 0) + Input.pad.rt - Input.pad.lt, -1, 1) : 0;
    const steer = c ? clamp((Input.isDown('left') ? 1 : 0) - (Input.isDown('right') ? 1 : 0) - Input.pad.lx, -1, 1) : 0;
    v.drive(dt, { throttle, steer, handbrake: c && Input.isDown('jump') }, this.collision, traffic.all());
    { const A = this.ch.anim; A.steer = v.steer / v.T.steer; const acc = (v.speed - (this.lastVS ?? v.speed)) / Math.max(dt, 1e-3); this.lastVS = v.speed; A.vehSpeed = v.speed; A.brakeLean = damp(A.brakeLean, clamp(-acc * 0.012, -0.06, 0.08), 6, dt); A.cornerLean = clamp(-A.steer * v.speed * 0.004, -0.06, 0.06); A.update(dt, 0); }
    this.x = v.x; this.z = v.z; this.y = v.y; this.yaw = v.yaw;
    if (c && Input.wasPressed('horn')) this.events.emit('horn', v);
    if (c && Input.wasPressed('lights')) { v.lights = !v.lights; this.nightLights = v.lights; }
    if (v.lastImpact && performance.now() - v.lastImpact.t < 50) { this.shake = Math.min(1, v.lastImpact.v / 20); this.events.emit('crash', v.lastImpact.v); v.lastImpact = null; }
  }
  // first-person eye (between the eyes, from the head bone) and view direction, world space
  fpEyeLook(eye, look) { const h = this.ch.bones.head; h.updateWorldMatrix(true, false); const s = this.ch.spec.height / 1.72; const yaw = this.camYaw + Math.PI;
    eye.setFromMatrixPosition(h.matrixWorld).add(new THREE.Vector3(Math.sin(yaw) * 0.1 * s, 0.075 * s, Math.cos(yaw) * 0.1 * s)); look.set(Math.sin(yaw) * Math.cos(this.camPitch), -Math.sin(this.camPitch), Math.cos(yaw) * Math.cos(this.camPitch)); return eye; }
  snapCamera() { this.updateCamera(1, true); }
  updateCamera(dt, snap = false) {
    if (this.cinematic || this.camOverride) return; const cam = this.camera; const v = this.vehicle;
    if (this.scoped && this.weapons && !v) { this.weapons.scopeCamera(dt); return; }
    this.aimCam = damp(this.aimCam || 0, this.aiming && !v ? 1 : 0, 10, dt);
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
      if (this.aimCam > 0.001) { const a = this.aimCam; dist = lerp(dist, 1.7 * distMul, a); tgt.y = lerp(tgt.y, this.y + 1.62, a); tgt.x += Math.cos(this.camYaw) * 0.55 * a; tgt.z += -Math.sin(this.camYaw) * 0.55 * a; }
    }
    if (this.camMode === 2 && v && !this.entry && !this.exiting) { // interior / cockpit view from the driver's eyes; mouse looks around
      const h = this.ch.bones.head; h.updateWorldMatrix(true, false); const s = this.ch.spec.height / 1.72;
      const eye = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld); const yaw = this.camYaw + Math.PI;
      eye.y += 0.085 * s; eye.x += Math.sin(v.yaw) * 0.13 * s; eye.z += Math.cos(v.yaw) * 0.13 * s; cam.position.copy(eye);
      const pitch = clamp(this.camPitch - 0.18, -0.6, 0.5); cam.lookAt(eye.x + Math.sin(yaw) * Math.cos(pitch), eye.y - Math.sin(pitch), eye.z + Math.cos(yaw) * Math.cos(pitch));
      if (Math.abs(cam.fov - 68) > 0.05) { cam.fov = damp(cam.fov, 68, 6, dt); cam.updateProjectionMatrix(); } this.ch.mesh.visible = true; return;
    }
    if (this.camMode === 2 && !v) { // first person: true body awareness — the real body, arms and weapon stay visible, only the head collapses
      const b = this.ch.bones, h = b.head; b.neck.updateWorldMatrix(true, false); h.scale.setScalar(0.001); this.fpHead = h; h.updateWorldMatrix(false, false);
      const eye = new THREE.Vector3(), look = new THREE.Vector3(); this.fpEyeLook(eye, look); // the weapon is placed on this view line (Weapons.pose), so ADS lines up the real sights
      const ads = this.weapons && this.weapons.drawn ? { w: this.weapons.fpAds || 0, zoom: this.weapons.def && this.weapons.def.cls === 'pistol' ? 6 : 10 } : null;
      cam.position.copy(eye); cam.lookAt(eye.x + look.x, eye.y + look.y, eye.z + look.z);
      if (this.shake > 0 && Settings.get('cameraShake')) { cam.rotateX((Math.random() - 0.5) * this.shake * 0.02); cam.rotateY((Math.random() - 0.5) * this.shake * 0.02); this.shake = Math.max(0, this.shake - dt * 2.5); }
      const fovW = Settings.get('fov') - (ads ? ads.w * (ads.zoom || 8) : 0); if (Math.abs(cam.fov - fovW) > 0.05 || cam.near !== 0.07) { cam.fov = damp(cam.fov, fovW, 10, dt); cam.near = 0.07; cam.updateProjectionMatrix(); }
      this.ch.mesh.visible = true; return;
    }
    if (this.fpHead) { this.fpHead.scale.setScalar(1); this.fpHead = null; } if (cam.near !== 0.25) { cam.near = 0.25; cam.updateProjectionMatrix(); }
    this.ch.mesh.visible = true;
    const cp = Math.cos(this.camPitch), spch = Math.sin(this.camPitch);
    const want = new THREE.Vector3(tgt.x + Math.sin(this.camYaw) * cp * dist, tgt.y + spch * dist, tgt.z + Math.cos(this.camYaw) * cp * dist);
    // camera collision
    let t = 1;
    if (this.indoor) { const I = this.indoor, b = I.bounds, top = I.ceilAt ? I.ceilAt(this.y) : I.y + (I.id === 'garage' ? 4.6 : 2.9), fl = I.floorAt ? I.floorAt(this.x, this.z, this.y) : I.y; want.x = clamp(want.x, b.x0 + 0.05, b.x1 - 0.05); want.z = clamp(want.z, I.gap && this.z < b.z0 + 4 ? b.z0 - 4 : b.z0 + 0.05, b.z1 - 0.05); want.y = clamp(want.y, fl + 0.4, Math.max(top, fl + 0.6)); if (I.clampCam) I.clampCam(tgt, want); }
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
