// Vehicle entity: mesh + arcade physics (player) or kinematic path following (AI, see Traffic.js).
import * as THREE from 'three';
import { createVehicleMesh, VTYPES } from './VehicleModels.js';
import { clamp, lerp, damp, wrapAngle } from '../core/math.js';
import * as L from '../world/Layout.js';
import { LEAN, syncStand } from './Kickstand.js';

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
// ---- real headlight beams. A fixed pool of SpotLights is created once at load (light counts never change, so no shader
// recompiles); every frame they are handed to the vehicles whose lights matter most: the player's own vehicle first (that
// beam casts shadows: kerbs, poles, people and cars throw real shadows ahead of you), then the nearest lit vehicles that
// can be seen. Low-beam aim (a couple of degrees down), warm-white halogen/LED colour, soft cut-off at the beam edge.
// Vehicles without a pooled light (far away) keep the cheap road decal.
export class HeadlightRig {
  constructor(scene, { count = 4, shadows = true, shadowRes = 1024 } = {}) {
    this.spots = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.SpotLight(0xfff0d8, 0, 60, 0.5, 0.6, 1.5); s.name = 'headBeam' + i; s.castShadow = !!shadows; // every pooled beam is stopped by walls (no light through the school / compound walls)
      if (s.castShadow) { const r = i === 0 ? shadowRes : Math.max(512, shadowRes / 2); s.shadow.mapSize.set(r, r); s.shadow.autoUpdate = false; s.shadow.needsUpdate = true; /* one initial render allocates the depth map: a shadow-casting light whose map never existed leaves an unbound shadow sampler and every lit draw call is rejected */ s.shadow.camera.near = 0.3; s.shadow.camera.far = 60; s.shadow.bias = -0.0005; s.shadow.normalBias = 0.04; }
      s.position.set(0, -500, 0); s.target.position.set(0, -501, 0); scene.add(s); scene.add(s.target); this.spots.push(s);
    }
    this.assigned = []; this._p = new THREE.Vector3(); this._d = new THREE.Vector3();
  }
  static lampY(T) { return T.entry === 'bike' ? 1.0 : Math.min(1.0, 0.3 + T.hgt * 0.22); }
  update(cam, playerVeh, night, indoor = 0) {
    const kin = typeof indoor === 'number' ? clamp(indoor, 0, 1) : indoor ? 1 : 0; // how far inside a building the camera is
    const k = clamp((night - 0.2) / 0.55, 0, 1) * (1 - kin); const cd = cam.getWorldDirection(this._d); const cx = cam.position.x, cz = cam.position.z;
    const cand = [];
    if (k > 0) for (const v of LIVE_VEHICLES) {
      if (!v.mesh.parent || v.mesh.visible === false || v.T.rail || !v.lights || (v.parked && !v.player)) continue;
      const dx = v.x - cx, dz = v.z - cz, d = Math.hypot(dx, dz); if (d > 140) continue;
      const ahead = (dx * cd.x + dz * cd.z) / Math.max(d, 1e-3); if (v !== playerVeh && d > 25 && ahead < 0.2) continue; // behind / beside the view: its beam can't be seen
      cand.push([v === playerVeh ? -1 : d, v]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const v of this.assigned) if (v.mesh.userData) v.mesh.userData.realBeam = false;
    this.assigned = [];
    this.spots.forEach((s, i) => { const c = cand[i];
      if (!c) { if (s.intensity !== 0) s.intensity = 0; s.shadow.autoUpdate = false; return; }
      if (s.castShadow) s.shadow.autoUpdate = true; // shadow maps only re-render for beams that are actually lit
      const v = c[1], T = v.T, m = v.mesh; m.updateMatrixWorld(); const y = HeadlightRig.lampY(T), bike = T.entry === 'bike';
      s.position.copy(this._p.set(0, y, T.len / 2 + 0.12).applyMatrix4(m.matrixWorld)); s.target.position.copy(this._p.set(0, y - 0.95, T.len / 2 + 22).applyMatrix4(m.matrixWorld)); s.target.updateMatrixWorld();
      s.angle = bike ? 0.42 : 0.52; s.intensity = (bike ? 55 : 95) * k * (v.damage > 0.85 ? 0.3 : 1);
      m.userData.realBeam = true; if (m.userData.headPool) m.userData.headPool.visible = false; this.assigned.push(v); });
  }
}
export class Vehicle {
  constructor(type, seed, scene) {
    this.id = NEXT_ID++; this.type = type; this.T = VTYPES[type]; this.mesh = createVehicleMesh(type, seed); scene.add(this.mesh); this.scene = scene; LIVE_VEHICLES.add(this);
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0; this.speed = 0; this.steer = 0; this.lat = 0; this.wheelRot = 0; this.pitch = 0; this.roll = 0; this.stand = 0; this.leanK = 0; /* two-wheelers: side stand down / resting on it (Kickstand.js) */
    this.brake = false; this.lights = false; this.driver = null; this.player = false; this.ai = null; this.parked = false; this.horn = 0; this.damage = 0; this.health = 100;
    this.radius = this.T.wid * 0.55; this.half = this.T.len / 2;
    this.sus = { r: 0, rv: 0, h: 0, hv: 0 }; this.load = 0; // body on its springs: r = roll (+ = driver side down), h = sink (m)
  }
  // suspension: under-damped springs (~1.6 Hz, like a family car) toward the static sag of the current load
  settle(dt) { if (!(dt > 0) || this.T.entry === 'bike' || this.T.rail) return; const S = this.sus, h = Math.min(dt, 1 / 30), k = 100, c = 6;
    const heavy = this.T.mass > 4000 ? 0.25 : 1; const r0 = this.load * 0.009 * heavy, h0 = this.load * 0.012 * heavy;
    S.rv += (-k * (S.r - r0) - c * S.rv) * h; S.r += S.rv * h; S.hv += (-k * (S.h - h0) - c * S.hv) * h; S.h += S.hv * h; }
  // a door shutting: s = closing speed (normalised door travel per second)
  slam(s) { const S = this.sus; const k = Math.min(1, s / 4) * (this.T.mass > 4000 ? 0.2 : 1); S.rv += 0.07 * k; S.hv += 0.05 * k; }
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
    // ---- collisions: impulse response (restitution + tangential friction + yaw spin from off-centre contacts), mass-weighted against other vehicles
    const m1 = T.mass || 1100, I1 = (T.len * T.len + T.wid * T.wid) / 12; const nC = Math.max(2, Math.ceil((T.len - T.wid) / (T.wid * 0.7)) + 1); const tOf = (k) => (k / (nC - 1) - 0.5) * (T.len - T.wid);
    let V = [fx * this.speed + rx * this.lat, fz * this.speed + rz * this.lat]; let maxJ = 0; this.spin = this.spin || 0;
    const applyImpulse = (nx_, nz_, jv, t, mu) => { /* jv = velocity change along the normal (m/s) applied at body offset t */ const vtx = V[0] - nx_ * (V[0] * nx_ + V[1] * nz_), vtz = V[1] - nz_ * (V[0] * nx_ + V[1] * nz_); const vt = Math.hypot(vtx, vtz);
      V[0] += nx_ * jv; V[1] += nz_ * jv; if (vt > 1e-3) { const f = Math.min(1, mu * jv / vt); V[0] -= vtx * f; V[1] -= vtz * f; } /* scraping friction slows the slide along the obstacle */
      this.spin = clamp(this.spin + 0.45 * jv * t * (nx_ * rx + nz_ * rz) / I1 * 0.25, -2.4, 2.4); maxJ = Math.max(maxJ, jv); };
    // static world: gather the deepest push per circle → one combined normal, contact at the deepest circle
    let sx = 0, sz = 0, best = 0, bestT = 0; const cs = this.circles();
    for (let k = 0; k < cs.length; k++) { const [cx, cz] = cs[k]; const r = collision.resolveCircle(cx, cz, this.radius, this.y, 0.25, 2, { vehicle: true }); if (r.hit) { const dx = r.x - cx, dz = r.z - cz, dl = Math.hypot(dx, dz); this.x += dx; this.z += dz; sx += dx; sz += dz; if (dl > best) { best = dl; bestT = tOf(k); } } }
    if (best > 0.005) { const sl = Math.hypot(sx, sz) || 1, nx_ = sx / sl, nz_ = sz / sl; const vn = V[0] * nx_ + V[1] * nz_; if (vn < 0) applyImpulse(nx_, nz_, -(1 + 0.18) * vn, bestT, 0.35); }
    // other vehicles: relative velocity along the contact normal, impulse split by mass; the other car is shoved (leaves its lane, slides, spins)
    if (others) for (const o of others) {
      if (o === this) continue; const d2 = (o.x - this.x) ** 2 + (o.z - this.z) ** 2; if (d2 > (8 + (o.T ? o.T.len / 2 : 4)) ** 2) continue;
      let px = 0, pz = 0, deep = 0, ta = 0, tb = 0; const oc = o.circles(); const ca = this.circles(); const no = oc.length;
      for (let i = 0; i < ca.length; i++) for (let j = 0; j < no; j++) { const dx = ca[i][0] - oc[j][0], dz = ca[i][1] - oc[j][1]; const d = Math.hypot(dx, dz), m = this.radius + o.radius; if (d < m && d > 1e-4) { const pen = m - d; px += dx / d * pen; pz += dz / d * pen; if (pen > deep) { deep = pen; ta = tOf(i); tb = o.T ? ((j / Math.max(1, no - 1)) - 0.5) * (o.T.len - o.T.wid) : 0; } } }
      if (deep <= 0.005) continue; const pl = Math.hypot(px, pz) || 1, nx_ = px / pl, nz_ = pz / pl;
      const m2 = o.immovable ? Infinity : (o.T && o.T.mass) || 1100; const ratio = o.immovable ? 1 : m2 / (m1 + m2); this.x += nx_ * deep * ratio; this.z += nz_ * deep * ratio;
      if (!o.immovable && o.parked && !o.free) { o.x -= nx_ * deep * (1 - ratio); o.z -= nz_ * deep * (1 - ratio); o.sync(0); }
      const ofw = o.forward ? o.forward() : [0, 0]; const Vo = o.free ? [o.free.vx, o.free.vz] : [ofw[0] * (o.speed || 0), ofw[1] * (o.speed || 0)];
      const vn = (V[0] - Vo[0]) * nx_ + (V[1] - Vo[1]) * nz_;
      if (vn < 0) { const J = -(1 + 0.22) * vn / (1 / m1 + (o.immovable ? 0 : 1 / m2)); applyImpulse(nx_, nz_, J / m1, ta, 0.25);
        if (!o.immovable && o.shove) { const dv2 = J / m2; const orx = ofw[1], orz = -ofw[0]; const I2 = o.T ? (o.T.len ** 2 + o.T.wid ** 2) / 12 : 2; o.shove(-nx_ * dv2, -nz_ * dv2, clamp(0.45 * dv2 * tb * (-nx_ * orx - nz_ * orz) / I2 * 0.25, -2.4, 2.4), this); } }
      else if (o.bump) o.bump(0, 0, this);
    }
    if (maxJ > 0.05) { this.speed = V[0] * fx + V[1] * fz; this.lat = V[0] * rx + V[1] * rz; this.impact(maxJ * 1.25); } /* damage + camera shake scale with the normal (closing) speed: a graze is light, a head-on is heavy */
    this.yaw = wrapAngle(this.yaw + this.spin * dt); this.spin *= Math.exp(-3.2 * dt); /* tyres scrub the spin off */
    this.groundY = damp(this.groundY ?? L.groundY(this.x, this.z), L.groundY(this.x, this.z), 12, dt);
    // body attitude: cars pitch/roll a little on their suspension; two-wheelers lean into the turn about the tyre contact patch
    const latA = yawRate * this.speed; const twoWheel = this.T.entry === 'bike'; if (twoWheel && Math.abs(this.speed) > 0.3) { this.stand = 0; this.leanK = 0; } // never ridden on the stand
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
  // impulse from a collision (AI / parked): leave the lane and slide freely until the energy is gone (Traffic.stepFree)
  shove(dvx, dvz, dspin = 0) { if (this.player || this.immovable) return; const dv = Math.hypot(dvx, dvz); if (dv < 0.6 && !this.free) { this.bump(0, 0); return; } const [fx, fz] = this.forward(); const f = this.free || (this.free = { vx: fx * (this.speed || 0), vz: fz * (this.speed || 0), spin: 0, rest: 0, sev: 0 }); f.vx += dvx; f.vz += dvz; f.spin = clamp(f.spin + dspin, -2.4, 2.4); f.sev = Math.max(f.sev, dv); f.rest = 0; this.speed = 0; this.brake = true; if (this.ai) this.ai.bumped = 2.5; this.impact(dv * 1.25); }
  bump(dx, dz) { if (this.parked) { this.x += dx * 0.3; this.z += dz * 0.3; this.sync(0); } else if (this.ai) { this.ai.bumped = 2.5; } }
  sync(dt) {
    this.settle(dt); const S = this.sus; const sr = Math.sin(S.r);
    const m = this.mesh; m.position.set(this.x, this.y - S.h, this.z); const sp = m.userData.stand; m.rotation.set(this.pitch, this.yaw, this.roll + S.r - (sp ? LEAN * this.leanK : 0), 'YXZ'); if (sp) syncStand(sp, this.stand);
    this.wheelRot += (this.speed * dt) / this.T.wheelR;
    for (const w of m.userData.wheels) { w.userData.spin.rotation.x = this.wheelRot; if (w.userData.front) w.rotation.y = this.steer; if (w.userData.baseY !== undefined) w.position.y = w.userData.baseY + S.h - w.position.x * sr; } // body moves on the springs, tyres stay on the road
    // lamps (per vehicle): headlights only when this vehicle has its lights on; tails red at night, brighter when braking;
    // reverse lamps only while reversing; parked/unattended vehicles are dark
    const ud = m.userData, tm = ud.tailMat, hm = ud.headMat, rm = ud.revMat; const occupied = !this.parked || this.player;
    const wantT = !occupied ? 0.03 : this.brake ? (this.lights ? 2.2 : 1.6) : this.lights ? 0.9 : 0.05; if (tm && tm.emissiveIntensity !== wantT) tm.emissiveIntensity = wantT;
    const wantH = this.lights && occupied ? 2.6 : 0.04; if (hm && hm.emissiveIntensity !== wantH) hm.emissiveIntensity = wantH;
    const beam = this.lights && occupied && !this.T.rail;
    if (beam && !ud.headPool) { const hp = headPool(); const bike = this.T.entry === 'bike'; const p = new THREE.Mesh(hp.geo, hp.mat); p.name = 'headPool';
      p.position.set(0, 0.07, this.T.len / 2 - 0.1); p.scale.set(bike ? 2.4 : Math.max(2.6, this.T.wid * 1.5), 1, bike ? 8 : 11); p.renderOrder = -1; /* before glass: seen through a windscreen it is tinted like everything else behind the glass */ p.castShadow = p.receiveShadow = false; m.add(p); ud.headPool = p; }
    const decal = beam && !ud.realBeam; if (ud.headPool && ud.headPool.visible !== decal) ud.headPool.visible = decal; // a pooled real beam replaces the decal
    const wantR = occupied && this.speed < -0.3 ? 1.3 : 0; if (rm && rm.emissiveIntensity !== wantR) rm.emissiveIntensity = wantR;
  }
  driverSeat() { const s = this.mesh.userData.seats.find((q) => q.driver) || this.mesh.userData.seats[0]; return s; }
  seatWorld(seat) { const v = new THREE.Vector3(seat.x, seat.y, seat.z); this.mesh.updateMatrixWorld(); return v.applyMatrix4(this.mesh.matrixWorld); }
  // exit point on the driver's side (right-hand drive → right side = −x local)
  exitPoint(s = -1) { const [fx, fz] = this.forward(); const off = this.T.wid / 2 + 0.7; return { x: this.x + fz * s * off, z: this.z - fx * s * off }; } // local +x in world = (fz, -fx)
  dispose() { this.disposed = true; LIVE_VEHICLES.delete(this); this.scene.remove(this.mesh); const ud = this.mesh.userData; ud.tailMat.dispose(); ud.indMat?.dispose(); ud.headMat?.dispose(); ud.revMat?.dispose(); }
}
