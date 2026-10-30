// Traffic police on point duty — a familiar Colombo sight: an officer in the white-topped cap, white gauntlets and
// white belt/cross strap standing at the corner of a busy signalised junction, palm out to the stopped approach and
// beckoning the moving one. The hand signals follow the junction's real signal phase (Layout.signalState), so they
// always agree with what the traffic is doing. Streamed in near the player and cached.
// Each officer's police motorcycle is parked on its side stand on the pavement a few metres along the kerb. When the
// shift ends (staggered, 19:00–19:40) he walks to it, gets on, pulls it upright and kicks the stand up, rides off the
// kerb into the traffic and follows a planned route to Police Headquarters, where (if you are there to see it) he rides in
// through the gate, parks in a free motorcycle bay and walks into the building. Nobody pops out of existence in view:
// officers only appear for the morning shift while the post is out of the camera's sight.
import * as THREE from 'three';
import { Character } from '../actors/Character.js';
import { makePoliceAppearance } from '../actors/Appearance.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { parkOnStand, kickUp, KICK_UP } from '../vehicles/Kickstand.js';
import { shortest, pathTo } from './PoliceResponse.js';
import * as L from '../world/Layout.js';

const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const NEAR = 110, FAR = 140, MAX_ACTIVE = 4;
export const HQ_NODE = { x: -10, z: -240 }; // Union Place, in front of the Police HQ gate
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const _f = new THREE.Frustum(), _m = new THREE.Matrix4(), _p = new THREE.Vector3();

export class TrafficDuty {
  constructor(game) {
    this.g = game; this.posts = []; this.acc = 0; this.spotT = 0; this.log = []; this.stats = { shiftEnds: 0, rideOffs: 0, toHQ: 0 };
    for (const n of L.nodes) {
      if (!n || !n.signal || n.segs.length < 4 || hash(n.i, n.j) > 0.4) continue; // about two in five four-way signalised junctions
      const sx = hash(n.j, n.i) < 0.5 ? -1 : 1, sz = hash(n.i + 7, n.j) < 0.5 ? -1 : 1;
      const x = n.x + sx * (n.hwV + 1.7), z = n.z + sz * (n.hwH + 1.7);
      if (L.isWater(x, z) || L.roadAt(x, z) || L.zoneAt(x, z)) continue;
      this.posts.push({ n, sx, sz, x, z, yaw: Math.atan2(n.x - x, n.z - z), ch: null, on: false, seed: 900 + this.posts.length * 13, endH: 19 + hash(n.i * 3, n.j) * 0.66, state: 'off', bike: null, bikeSpot: null });
    }
  }
  get active() { return this.posts.filter((p) => p.on); }
  note(s) { this.log.push(`${(this.g.clock || 0).toFixed(1)} ${s}`); if (this.log.length > 40) this.log.shift(); }
  inView(x, y, z) { const cam = this.g.camera; if (!cam) return false; _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _f.setFromProjectionMatrix(_m); return _f.containsPoint(_p.set(x, y + 1, z)) && Math.hypot(x - cam.position.x, z - cam.position.z) < 160; }
  // a sensible place for the motorcycle: on the pavement along the kerb, a few metres back from the officer's corner,
  // parallel to the road, clear of posts/poles, not on the road, a crossing or a driveway
  bikeSpotFor(p) {
    if (p.bikeSpot !== null) return p.bikeSpot; const col = this.g.collision, n = p.n; let spot = false;
    const cands = []; for (const d of [4.5, 6, 7.5, 3.5, 9]) { cands.push({ x: n.x + p.sx * (n.hwV + 1.15), z: n.z + p.sz * (n.hwH + d), yaw: p.sz > 0 ? Math.PI : 0 }); cands.push({ x: n.x + p.sx * (n.hwV + d), z: n.z + p.sz * (n.hwH + 1.15), yaw: p.sx > 0 ? -Math.PI / 2 : Math.PI / 2 }); }
    for (const c of cands) { const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); let ok = true;
      for (const t of [-1.1, 0, 1.1]) { const x = c.x + fx * t, z = c.z + fz * t; if (L.roadAt(x, z) || L.isWater(x, z) || L.zoneAt(x, z) || (col && col.blocked(x, z, 0.45))) { ok = false; break; } }
      if (ok && Math.hypot(c.x - p.x, c.z - p.z) > 2.2) { spot = c; break; } }
    return (p.bikeSpot = spot);
  }
  addBike(p) {
    const s = this.bikeSpotFor(p); if (!s) return null; const T = this.g.traffic; const v = new Vehicle('policebike', 60 + (p.seed % 40) * 2, this.g.scene); parkOnStand(v); v.place(s.x, s.z, s.yaw);
    v.parked = true; v.keep = true; v.duty = p; T.parked.push(v); p.bike = v; return v;
  }
  dropBike(p) { const v = p.bike; if (!v) return; p.bike = null; const T = this.g.traffic; if (v.player || T.vehicles.includes(v)) return; const i = T.parked.indexOf(v); if (i >= 0) T.parked.splice(i, 1); v.dispose(); }
  bikeOk(p) { const v = p.bike; return v && !v.player && !v.disposed && this.g.traffic.parked.includes(v); }
  remove(p) { if (p.ch && p.ch.root.parent && !(p.bike && p.ch.root.parent === p.bike.mesh)) p.ch.root.parent.remove(p.ch.root); p.on = false; this.dropBike(p); if (p.state !== 'ride') p.state = 'off'; }
  update(dt) {
    const g = this.g, P = g.player, A = g.atmos; const h = A.hour;
    this.acc -= dt;
    if (this.acc <= 0) { this.acc = 0.5; // streaming
      let n = 0; const order = this.posts.map((p) => [p, Math.hypot(p.x - P.x, p.z - P.z)]).sort((a, b) => a[1] - b[1]);
      for (const [p, d] of order) {
        const duty = h >= 7 && h < p.endH; if (h >= 6 && h < 7 && p.state === 'gone') p.state = 'off'; // a new day
        if (p.state === 'ride') this.checkRide(p); if (p.state === 'ride' || p.state === 'gone') continue; // on the way to HQ (Traffic owns him now) / off duty
        if (p.on && p.state !== 'duty') { if (d > FAR + 60 && !this.inView(p.x, 0, p.z)) this.remove(p); continue; } // the end-of-shift sequence finishes on its own
        const want = duty && n < MAX_ACTIVE && (p.on ? d < FAR : d < NEAR); if (want) n++;
        if (want && !p.on && (!this.inView(p.x, 0, p.z) || d > 80)) { // the morning shift appears out of sight
          if (!p.ch) { p.ch = new Character(makePoliceAppearance(p.seed, 'traffic')); } p.ch.anim.set('signal'); p.ch.anim.standUp && p.ch.anim.standUp();
          p.ch.root.position.set(p.x, L.groundY(p.x, p.z), p.z); p.ch.root.rotation.y = p.yaw; g.scene.add(p.ch.root); p.on = true; p.state = 'duty'; p.px = p.x; p.pz = p.z; p.pyaw = p.yaw; this.addBike(p);
        } else if (!want && p.on && p.state === 'duty') {
          if (!duty && h >= 7) this.endShift(p); // shift over: go back to the motorcycle (never vanish in view)
          else if (!this.inView(p.x, 0, p.z) || d > FAR + 40) this.remove(p);
        }
      }
    }
    const PO = g.police; this.spotT -= dt;
    for (const p of this.posts) { if (!p.on) continue; const a = p.ch.anim, d = Math.hypot(p.px - P.x, p.pz - P.z);
      if (p.state === 'duty') {
        // a wanted suspect walking or driving past an officer on duty gets reported
        if (PO && PO.level > 0 && d < 18 && this.spotT <= 0) { this.spotT = 1; PO.spotted && PO.spotted(); }
        if (PO && PO.level > 0 && d < 30) { if (a.action !== 'point') a.set('point'); p.ch.root.rotation.y = Math.atan2(P.x - p.x, P.z - p.z); }
        else { if (a.action !== 'signal') { a.set('signal'); p.ch.root.rotation.y = p.yaw; }
          const t = g.clock || 0, v = L.signalState(p.n, 'v', t), hh = L.signalState(p.n, 'h', t); const vRight = p.sx * p.sz < 0; // which road lies to the officer's right
          a.sigSide = v === 'green' ? (vRight ? 1 : -1) : hh === 'green' ? (vRight ? -1 : 1) : 0; }
        if (d < 70) a.update(dt, 0);
      } else this.updateLeave(p, dt, d);
    }
  }
  hideAll() { for (const p of this.posts) if (p.on && p.state === 'duty') this.remove(p); }
  // ------------------------------------------------------------------ end of shift
  endShift(p) {
    this.stats.shiftEnds++; p.ch.anim.set(null); p.t = 0;
    if (this.bikeOk(p)) { const v = p.bike; v.mesh.updateMatrixWorld(); const s0 = v.mesh.userData.seats[0]; const e = s0.exit || [0.75, s0.z]; const w = new THREE.Vector3(e[0], 0, e[1]).applyMatrix4(v.mesh.matrixWorld); p.walk = [[w.x, w.z]]; p.state = 'toBike'; this.note('shift over: walking to the motorcycle'); }
    else { const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw); p.walk = [[p.x + fx * 30, p.z + fz * 30]]; p.state = 'walkAway'; this.note('shift over: motorcycle gone, walking off'); }
  }
  walkStep(p, dt, sp = 1.35) { const tg = p.walk[0]; if (!tg) return true; const dx = tg[0] - p.px, dz = tg[1] - p.pz, dd = Math.hypot(dx, dz); if (dd < 0.1) { p.walk.shift(); return !p.walk.length; }
    const st = Math.min(dd, sp * dt); p.px += dx / dd * st; p.pz += dz / dd * st; p.pyaw += angDiff(Math.atan2(dx, dz), p.pyaw) * Math.min(1, dt * 7); p.ch.root.position.set(p.px, L.groundY(p.px, p.pz), p.pz); p.ch.root.rotation.y = p.pyaw; p.ch.anim.update(dt, sp); return false; }
  updateLeave(p, dt, d) {
    const g = this.g, v = p.bike || p.rideBike; p.t = (p.t || 0) + dt;
    if (p.state === 'walkAway') { if (this.walkStep(p, dt) || (!this.inView(p.px, 0, p.pz) && d > 25)) { this.remove(p); p.state = 'gone'; } return; }
    if ((p.state === 'toBike' || p.state === 'mount' || p.state === 'kick') && !this.bikeOk(p)) { p.state = 'walkAway'; p.walk = [[p.px + 30 * Math.sin(p.pyaw), p.pz + 30 * Math.cos(p.pyaw)]]; if (p.ch.root.parent !== g.scene) { p.ch.root.parent?.remove(p.ch.root); g.scene.add(p.ch.root); p.ch.anim.standUp(); } return; } // you took his motorcycle
    if (p.state === 'toBike') { if (this.walkStep(p, dt) || p.t > 25) { p.state = 'mount'; p.t = 0; const s0 = v.mesh.userData.seats[0]; p.ch.root.parent?.remove(p.ch.root); v.mesh.add(p.ch.root); p.ex = s0.exit || [0.75, s0.z]; p.ch.anim.set(null); } return; }
    const s0 = v.mesh.userData.seats[0];
    if (p.state === 'mount') { const k = Math.min(1, p.t / 1.0), sm = k * k * (3 - 2 * k); p.ch.root.position.set(p.ex[0] + (s0.x - p.ex[0]) * sm, s0.y * Math.min(1, sm * 1.3), p.ex[1] + (s0.z - p.ex[1]) * sm); p.ch.root.rotation.y = Math.atan2(s0.x - p.ex[0], s0.z - p.ex[1]) * (1 - Math.min(1, sm * 1.4)); p.ch.anim.sitIn(s0, sm); p.ch.anim.update(dt, 0); v.sync(dt); if (k >= 1) { p.state = 'kick'; p.t = 0; } return; }
    if (p.state === 'kick') { const k = Math.min(1, p.t / KICK_UP); kickUp(v, p.ch, s0, k); p.ch.anim.sitIn(s0, 1); p.ch.anim.update(dt, 0); v.sync(dt); if (k >= 1) this.rideOff(p); return; }
    if (p.state === 'pull') { // off the pavement and into the kerb lane
      const T = g.traffic, tg = p.pull; const dx = tg.x - v.x, dz = tg.z - v.z, dd = Math.hypot(dx, dz); const want = Math.atan2(dx, dz); const err = angDiff(want, v.yaw);
      v.speed += (Math.min(3.2, 1 + dd * 0.4) - v.speed) * Math.min(1, dt * 2); v.yaw += Math.max(-1, Math.min(1, err)) * Math.min(1.6, 0.5 + v.speed * 0.5) * dt; v.steer = Math.max(-0.6, Math.min(0.6, err * 1.4));
      v.x += Math.sin(v.yaw) * v.speed * dt; v.z += Math.cos(v.yaw) * v.speed * dt; v.y = L.groundY(v.x, v.z); v.lights = g.atmos?.night > 0.4; v.sync(dt); const A = p.ch.anim; A.steer = v.steer / 0.7; A.vehSpeed = v.speed; A.update(dt, 0);
      if (dd < 1.0 || p.t > 12) { T.adoptAI(v, p.lane, { place: false, route: p.route }); v.speed = Math.max(v.speed, 3); v.driverChar = p.ch; v.keep = false; v.duty = null; v.toHQ = true; p.state = 'ride'; p.on = false; this.stats.rideOffs++; this.note('riding to Police HQ'); }
    }
  }
  // riding to HQ: Traffic drives him; at the HQ junction the compound takes over (ride in, park, walk inside) if it is being
  // simulated (you are nearby); out of range the motorcycle simply leaves the simulation with him on it
  checkRide(p) {
    const g = this.g, T = g.traffic, v = p.rideBike; const end = () => { p.state = 'gone'; p.rideBike = null; p.ch = null; p.on = false; };
    if (!v || v.disposed || (!T.vehicles.includes(v) && !v.hqArrive)) { end(); return; }
    if (v.hqArrive) { end(); return; }
    const hq = g.hqLife; if (hq && hq.active && Math.hypot(v.x - HQ_NODE.x, v.z - HQ_NODE.z) < 16 && hq.arrive && hq.arrive(v)) { this.note('arrived at Police HQ'); end(); }
  }
  rideOff(p) {
    const g = this.g, T = g.traffic, v = p.bike; const ln = T.laneNear(v.x, v.z, v.yaw, 30);
    const i = T.parked.indexOf(v); if (i >= 0) T.parked.splice(i, 1); v.parked = false;
    if (!ln) { p.state = 'ride'; p.on = false; v.driverChar = p.ch; v.keep = false; return; }
    ln.s = Math.min(ln.piece.len - 0.5, ln.s + 6); const [x, z] = [ln.piece.p0[0] + ln.piece.d[0] * ln.s, ln.piece.p0[1] + ln.piece.d[1] * ln.s];
    // planned route along the road graph from the lane's next junction to the junction in front of the HQ gate
    const goal = L.nodes.find((n) => n && Math.abs(n.x - HQ_NODE.x) < 1 && Math.abs(n.z - HQ_NODE.z) < 1); let route = null;
    if (goal) { const { prev } = shortest(ln.piece.to, T.drivable); route = pathTo(prev, ln.piece.to, goal); }
    p.lane = ln; p.pull = { x, z }; p.route = route || null; p.state = 'pull'; p.t = 0; p.bike = null; p.rideBike = v; v.duty = p;
    if (route) this.stats.toHQ++;
  }
}
