// Vehicle entity: mesh + arcade physics (player) or kinematic path following (AI, see Traffic.js).
import * as THREE from 'three';
import { createVehicleMesh, VTYPES } from './VehicleModels.js';
import { clamp, lerp, damp, wrapAngle } from '../core/math.js';
import * as L from '../world/Layout.js';

let NEXT_ID = 1;
// Headlight throw on the road: an additive ground decal in front of any vehicle whose headlights are on (never on parked
// or unattended vehicles). Texture = two beam lobes, brightest a few metres ahead of each lamp, soft cut-off at the far end.
let HEAD_POOL = null;
function headPool() {
  if (HEAD_POOL) return HEAD_POOL;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  for (const lx of [20, 44]) { x.save(); x.translate(lx, 30); x.scale(1, 3.2); const g = x.createRadialGradient(0, 0, 0, 0, 0, 22);
    g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.45, 'rgba(255,255,255,0.32)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(-32, -40, 64, 80); x.restore(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2); geo.translate(0, 0, 0.5); /* canvas top (lamp end) = v 1 = z 0, at the bumper */
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xfff0d6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  return (HEAD_POOL = { geo, mat });
}
// strength follows darkness: invisible in daylight (lights on in rain), a modest throw at dusk, full at night
export function setHeadPoolNight(n) { const hp = headPool(); const k = Math.min(1, Math.max(0, (n - 0.25) / 0.6)); hp.mat.opacity = 0.42 * k * k * (3 - 2 * k); }
// Near-LOD switch for the high-detail kit (VehicleDetail.js): detail group + hi-res wheels within ud.lodR of the camera.
export const LIVE_VEHICLES = globalThis.__liveVehicles || (globalThis.__liveVehicles = new Set()); // global so dev hot-reloads share one registry
export function setVehicleLOD(ud, near) { if (ud.lodNear === near) return; ud.lodNear = near; ud.detail.visible = near; for (const w of ud.wheels) { const u = w.userData; u.lo.visible = !near; u.hi.visible = near; if (u.cal) u.cal.visible = near; } }
export function updateVehicleLOD(cam) { const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z; for (const v of LIVE_VEHICLES) { const m = v.mesh, ud = m.userData; if (!ud.detail) continue; const r = ud.lodR, d2 = (m.position.x - cx) ** 2 + (m.position.y - cy) ** 2 + (m.position.z - cz) ** 2; setVehicleLOD(ud, d2 < (ud.lodNear ? (r + 5) * (r + 5) : r * r) && m.visible !== false); } }
export class Vehicle {
  constructor(type, seed, scene) {
    this.id = NEXT_ID++; this.type = type; this.T = VTYPES[type]; this.mesh = createVehicleMesh(type, seed); scene.add(this.mesh); this.scene = scene; LIVE_VEHICLES.add(this);
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0; this.speed = 0; this.steer = 0; this.lat = 0; this.wheelRot = 0; this.pitch = 0; this.roll = 0;
    this.brake = false; this.lights = false; this.driver = null; this.player = false; this.ai = null; this.parked = false; this.horn = 0; this.damage = 0; this.health = 100;
    this.radius = this.T.wid * 0.55; this.half = this.T.len / 2;
  }
  get pos() { return { x: this.x, z: this.z }; }
  // police light bar: alternating blue/red while responding, dark otherwise (no flashing on parked or patrolling units)
  beacons(on, t = 0) { const b = this.mesh.userData.beacons; if (!b) return; this.beaconsOn = on; const ph = (t * 2.4) % 1, k = (t * 9.6) % 1 < 0.5; b.blue.emissiveIntensity = on ? (ph < 0.5 && k ? 7 : 0.15) : 0; b.red.emissiveIntensity = on ? (ph >= 0.5 && k ? 7 : 0.15) : 0; }
  forward() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  place(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; this.y = L.groundY(x, z); this.sync(0); }
  // circles along the length used for collision
  circles() { const [fx, fz] = this.forward(); const n = Math.max(2, Math.ceil((this.T.len - this.T.wid) / (this.T.wid * 0.7)) + 1); /* overlapping circles: no gaps along the body */ const out = []; for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * (this.T.len - this.T.wid); out.push([this.x + fx * t, this.z + fz * t]); } return out; }
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
    const wb = T.len * 0.62; let yawRate = (this.speed * Math.tan(this.steer)) / wb;
    // tyre grip limit: lateral acceleration v·ω can't exceed ~1.2 g (cars) / ~0.95 g (two-wheelers) — stops twitchy high-speed spins
    const aMax = (T.entry === 'bike' ? 9.3 : T.mass > 3000 ? 6.5 : 11.5) * (input.handbrake ? 1.4 : 1); const yrMax = aMax / Math.max(Math.abs(this.speed), 1);
    if (Math.abs(yawRate) > yrMax) yawRate = Math.sign(yawRate) * yrMax;
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
      if (o === this) continue; const d2 = (o.x - this.x) ** 2 + (o.z - this.z) ** 2; if (d2 > (8 + (o.T ? o.T.len / 2 : 4)) ** 2) continue;
      for (const a of this.circles()) for (const b of o.circles()) {
        const dx = a[0] - b[0], dz = a[1] - b[1]; const d = Math.hypot(dx, dz), m = this.radius + o.radius;
        if (d < m && d > 1e-4) { const p = (m - d); const ratio = o.immovable ? 1 : o.ai || o.parked ? 0.85 : 0.5; this.x += (dx / d) * p * ratio; this.z += (dz / d) * p * ratio; o.bump && o.bump(-(dx / d) * p * (1 - ratio), -(dz / d) * p * (1 - ratio), this); hit = Math.max(hit, p); }
      }
    }
    if (hit > 0.02) { this.impact(Math.abs(this.speed)); this.speed *= Math.abs(this.speed) > 8 ? -0.25 : 0.6; }
    this.groundY = damp(this.groundY ?? L.groundY(this.x, this.z), L.groundY(this.x, this.z), 12, dt);
    // body attitude: cars pitch/roll a little on their suspension; two-wheelers lean into the turn about the tyre contact patch
    const latA = yawRate * this.speed; const twoWheel = this.T.entry === 'bike';
    this.pitch = damp(this.pitch, clamp(-acc * 0.004, -0.05, 0.05), 5, dt);
    this.roll = damp(this.roll, twoWheel ? clamp(Math.atan2(latA, 9.81) * 0.85, -0.55, 0.55) : clamp(-latA * 0.006, -0.06, 0.06), twoWheel ? 4 : 5, dt);
    // the attitude rotates about the origin at road level → lift the body so the low side never sinks into the road
    const lift = twoWheel ? 0 : (this.T.wid / 2) * Math.abs(Math.sin(this.roll)) + (this.T.len / 2) * Math.abs(Math.sin(this.pitch));
    this.y = this.groundY + lift;
    this.sync(dt);
  }
  // push a walker's circle (radius r) out of this vehicle's body box (oriented rectangle); returns null if clear
  pushOut(px, pz, r) {
    const [fx, fz] = this.forward(); const dx = px - this.x, dz = pz - this.z;
    const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx; // local: lz along the body, lx across
    const hl = this.T.len / 2, hw = this.T.wid / 2;
    const cx = Math.max(-hw, Math.min(hw, lx)), cz = Math.max(-hl, Math.min(hl, lz));
    let ox = lx - cx, oz = lz - cz; let d = Math.hypot(ox, oz);
    if (d >= r) return null;
    let nlx, nlz;
    if (d > 1e-4) { nlx = cx + ox / d * r; nlz = cz + oz / d * r; }
    else { const ex = hw - Math.abs(lx), ez = hl - Math.abs(lz); if (ex < ez) { nlx = Math.sign(lx || 1) * (hw + r); nlz = lz; } else { nlx = lx; nlz = Math.sign(lz || 1) * (hl + r); } } // centre inside: leave by the nearest side
    return { x: this.x + nlx * fz + nlz * fx, z: this.z - nlx * fx + nlz * fz };
  }
  impact(v) { if (v > 4) { this.damage = Math.min(1, this.damage + v * 0.004); this.lastImpact = { v, t: performance.now() }; } }
  bump(dx, dz) { if (this.parked) { this.x += dx * 0.3; this.z += dz * 0.3; this.sync(0); } else if (this.ai) { this.ai.bumped = 2.5; } }
  sync(dt) {
    const m = this.mesh; m.position.set(this.x, this.y, this.z); m.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    this.wheelRot += (this.speed * dt) / this.T.wheelR;
    for (const w of m.userData.wheels) { w.userData.spin.rotation.x = this.wheelRot; if (w.userData.front) w.rotation.y = this.steer; }
    // lamps (per vehicle): headlights only when this vehicle has its lights on; tails red at night, brighter when braking;
    // reverse lamps only while reversing; parked/unattended vehicles are dark
    const ud = m.userData, tm = ud.tailMat, hm = ud.headMat, rm = ud.revMat; const occupied = !this.parked || this.player;
    const wantT = !occupied ? 0.03 : this.brake ? (this.lights ? 2.2 : 1.6) : this.lights ? 0.9 : 0.05; if (tm && tm.emissiveIntensity !== wantT) tm.emissiveIntensity = wantT;
    const wantH = this.lights && occupied ? 2.6 : 0.04; if (hm && hm.emissiveIntensity !== wantH) hm.emissiveIntensity = wantH;
    const beam = this.lights && occupied && !this.T.rail;
    if (beam && !ud.headPool) { const hp = headPool(); const bike = this.T.entry === 'bike'; const p = new THREE.Mesh(hp.geo, hp.mat); p.name = 'headPool';
      p.position.set(0, 0.07, this.T.len / 2 - 0.1); p.scale.set(bike ? 2.4 : Math.max(2.6, this.T.wid * 1.5), 1, bike ? 8 : 11); p.renderOrder = -1; /* before glass: seen through a windscreen it is tinted like everything else behind the glass */ p.castShadow = p.receiveShadow = false; m.add(p); ud.headPool = p; }
    if (ud.headPool && ud.headPool.visible !== beam) ud.headPool.visible = beam;
    const wantR = occupied && this.speed < -0.3 ? 1.3 : 0; if (rm && rm.emissiveIntensity !== wantR) rm.emissiveIntensity = wantR;
  }
  driverSeat() { const s = this.mesh.userData.seats.find((q) => q.driver) || this.mesh.userData.seats[0]; return s; }
  seatWorld(seat) { const v = new THREE.Vector3(seat.x, seat.y, seat.z); this.mesh.updateMatrixWorld(); return v.applyMatrix4(this.mesh.matrixWorld); }
  // exit point on the driver's side (right-hand drive → right side = −x local)
  exitPoint(s = -1) { const [fx, fz] = this.forward(); const off = this.T.wid / 2 + 0.7; return { x: this.x + fz * s * off, z: this.z - fx * s * off }; } // local +x in world = (fz, -fx)
  dispose() { LIVE_VEHICLES.delete(this); this.scene.remove(this.mesh); const ud = this.mesh.userData; ud.tailMat.dispose(); ud.indMat?.dispose(); ud.headMat?.dispose(); ud.revMat?.dispose(); }
}
