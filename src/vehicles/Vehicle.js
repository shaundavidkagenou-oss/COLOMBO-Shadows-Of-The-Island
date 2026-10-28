// Vehicle entity: mesh + arcade physics (player) or kinematic path following (AI, see Traffic.js).
import * as THREE from 'three';
import { createVehicleMesh, VTYPES } from './VehicleModels.js';
import { clamp, lerp, damp, wrapAngle } from '../core/math.js';
import * as L from '../world/Layout.js';

let NEXT_ID = 1;
export class Vehicle {
  constructor(type, seed, scene) {
    this.id = NEXT_ID++; this.type = type; this.T = VTYPES[type]; this.mesh = createVehicleMesh(type, seed); scene.add(this.mesh); this.scene = scene;
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0; this.speed = 0; this.steer = 0; this.lat = 0; this.wheelRot = 0; this.pitch = 0; this.roll = 0;
    this.brake = false; this.lights = false; this.driver = null; this.player = false; this.ai = null; this.parked = false; this.horn = 0; this.damage = 0; this.health = 100;
    this.radius = this.T.wid * 0.55; this.half = this.T.len / 2;
  }
  get pos() { return { x: this.x, z: this.z }; }
  forward() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  place(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; this.y = L.groundY(x, z); this.sync(0); }
  // circles along the length used for collision
  circles() { const [fx, fz] = this.forward(); const n = this.T.len > 6 ? 3 : 2; const out = []; for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * (this.T.len - this.T.wid); out.push([this.x + fx * t, this.z + fz * t]); } return out; }
  // Player physics. input: {throttle (-1..1), steer (-1..1), handbrake}
  drive(dt, input, collision, others) {
    const T = this.T; const fwd = input.throttle; const sp = this.speed;
    let acc = 0;
    if (fwd > 0) acc = sp < -0.5 ? 12 : T.accel * fwd * (1 - Math.max(0, sp) / T.maxSpeed);
    else if (fwd < 0) acc = sp > 0.5 ? -12 : T.accel * 0.5 * fwd * (1 - Math.max(0, -sp) / (T.maxSpeed * 0.3));
    else acc = -Math.sign(sp) * Math.min(Math.abs(sp) / dt, 1.5);
    if (input.handbrake) acc -= Math.sign(sp) * Math.min(Math.abs(sp) / dt, 9);
    acc -= sp * Math.abs(sp) * 0.0012 * (T.mass > 3000 ? 2 : 1);
    this.speed += acc * dt; this.brake = (fwd < 0 && sp > 0.5) || input.handbrake;
    const steerMax = T.steer * lerp(1, 0.35, clamp(Math.abs(sp) / T.maxSpeed, 0, 1));
    this.steer = damp(this.steer, input.steer * steerMax, 6, dt);
    const wb = T.len * 0.62; const yawRate = (this.speed * Math.tan(this.steer)) / wb;
    // drift: with handbrake the rear slides (lateral velocity persists)
    const grip = input.handbrake ? 1.2 : 7;
    this.lat = damp(this.lat + yawRate * Math.abs(this.speed) * dt * (input.handbrake ? 0.3 : 0.02), 0, grip, dt);
    this.yaw = wrapAngle(this.yaw + yawRate * dt * (input.handbrake ? 1.25 : 1));
    const [fx, fz] = this.forward(); const rx = fz, rz = -fx; // left normal (dz,-dx)
    let nx = this.x + (fx * this.speed + rx * this.lat) * dt, nz = this.z + (fz * this.speed + rz * this.lat) * dt;
    // water: block like a wall
    if (L.isWater(nx, nz) && !L.bridgeWalkAt(nx, nz) && !L.roadAt(nx, nz)) { nx = this.x; nz = this.z; this.impact(Math.abs(this.speed)); this.speed *= -0.2; }
    this.x = nx; this.z = nz;
    // static collisions via circles
    let hit = 0;
    const cs = this.circles();
    for (let k = 0; k < cs.length; k++) {
      const [cx, cz] = cs[k]; const r = collision.resolveCircle(cx, cz, this.radius, this.y, 0.25, 2, { vehicle: true });
      if (r.hit) { const dx = r.x - cx, dz = r.z - cz; this.x += dx; this.z += dz; hit = Math.max(hit, Math.hypot(dx, dz)); }
    }
    // other vehicles
    if (others) for (const o of others) {
      if (o === this) continue; const d2 = (o.x - this.x) ** 2 + (o.z - this.z) ** 2; if (d2 > 200) continue;
      for (const a of this.circles()) for (const b of o.circles()) {
        const dx = a[0] - b[0], dz = a[1] - b[1]; const d = Math.hypot(dx, dz), m = this.radius + o.radius;
        if (d < m && d > 1e-4) { const p = (m - d); const ratio = o.ai || o.parked ? 0.85 : 0.5; this.x += (dx / d) * p * ratio; this.z += (dz / d) * p * ratio; o.bump && o.bump(-(dx / d) * p * (1 - ratio), -(dz / d) * p * (1 - ratio), this); hit = Math.max(hit, p); }
      }
    }
    if (hit > 0.02) { this.impact(Math.abs(this.speed)); this.speed *= Math.abs(this.speed) > 8 ? -0.25 : 0.6; }
    this.y = damp(this.y, L.groundY(this.x, this.z), 12, dt);
    this.pitch = damp(this.pitch, -acc * 0.004, 5, dt); this.roll = damp(this.roll, -yawRate * this.speed * 0.006 * (this.type === 'bike' ? -6 : 1), 5, dt);
    this.sync(dt);
  }
  impact(v) { if (v > 4) { this.damage = Math.min(1, this.damage + v * 0.004); this.lastImpact = { v, t: performance.now() }; } }
  bump(dx, dz) { if (this.parked) { this.x += dx * 0.3; this.z += dz * 0.3; this.sync(0); } else if (this.ai) { this.ai.bumped = 2.5; } }
  sync(dt) {
    const m = this.mesh; m.position.set(this.x, this.y, this.z); m.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.wheelRot += (this.speed * dt) / this.T.wheelR;
    for (const w of m.userData.wheels) { w.userData.spin.rotation.x = this.wheelRot; if (w.userData.front) w.rotation.y = this.steer; }
    const tm = m.userData.tailMat; const want = this.brake ? 3.2 : this.lights ? 1.4 : 0.15; if (tm.emissiveIntensity !== want) tm.emissiveIntensity = want;
  }
  driverSeat() { const s = this.mesh.userData.seats.find((q) => q.driver) || this.mesh.userData.seats[0]; return s; }
  seatWorld(seat) { const v = new THREE.Vector3(seat.x, seat.y, seat.z); this.mesh.updateMatrixWorld(); return v.applyMatrix4(this.mesh.matrixWorld); }
  // exit point on the driver's side (right-hand drive → right side = −x local)
  exitPoint(s = -1) { const [fx, fz] = this.forward(); const off = this.T.wid / 2 + 0.7; return { x: this.x + fz * s * off, z: this.z - fx * s * off }; } // local +x in world = (fz, -fx)
  dispose() { this.scene.remove(this.mesh); this.mesh.userData.tailMat.dispose(); }
}
