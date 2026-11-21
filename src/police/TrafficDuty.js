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
import { npcBoardSetup, boardCurve, poseBoard, boardGroundFn } from '../actors/Boarding.js';
import * as L from '../world/Layout.js';
import { MAT } from '../gfx/Materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 73rd: the white gauntlet a traffic officer flings down before he goes after you (one small shared geometry, the generic
// vertex-coloured prop material that is already compiled for the city — no new material, no shader work)
let GLOVE_GEO = null;
function gloveGeo() {
  if (GLOVE_GEO) return GLOVE_GEO; const parts = [];
  const add = (geo, col, m) => { geo = geo.index ? geo.toNonIndexed() : geo; geo.applyMatrix4(m); const n = geo.attributes.position.count, c = new Float32Array(n * 3); const cc = new THREE.Color(col); for (let i = 0; i < n; i++) { c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); geo.deleteAttribute('uv'); parts.push(geo); };
  const M = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  add(new THREE.BoxGeometry(0.086, 0.026, 0.095), '#eeeeea', M(0, 0.013, 0)); // palm
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.019, 0.019, 0.07 - Math.abs(i - 1.4) * 0.008), '#ecece7', M(-0.031 + i * 0.0205, 0.011, 0.077, -0.12, 0, 0)); // the empty fingers, lying limp
  add(new THREE.BoxGeometry(0.022, 0.02, 0.05), '#ecece7', M(0.052, 0.011, 0.02, 0, -0.7, 0)); // thumb
  add(new THREE.CylinderGeometry(0.05, 0.064, 0.115, 10, 1), '#f2f2ee', M(0, 0.042, -0.1, Math.PI / 2 - 0.12, 0, 0).multiply(new THREE.Matrix4().makeScale(1, 1, 0.62))); // the stiff gauntlet cuff, squashed flat-ish
  add(new THREE.CylinderGeometry(0.066, 0.066, 0.022, 10, 1), '#b8232a', M(0, 0.05, -0.15, Math.PI / 2 - 0.12, 0, 0).multiply(new THREE.Matrix4().makeScale(1, 1, 0.62))); // red cuff band
  GLOVE_GEO = mergeGeometries(parts); GLOVE_GEO.computeVertexNormals(); parts.forEach((q) => q.dispose()); return GLOVE_GEO;
}
const SWAT = { glove: 1.8, run: 3.3 }; // glove-throw length (s), run speed to the motorcycle (m/s)

const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const NEAR = 110, FAR = 140, MAX_ACTIVE = 4;
export const HQ_NODE = { x: -10, z: -240 }; // Union Place, in front of the Police HQ gate
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const turnTo = (a, b, k) => { const d = angDiff(b, a); return a + Math.max(-k, Math.min(k, d)); };
const _f = new THREE.Frustum(), _m = new THREE.Matrix4(), _p = new THREE.Vector3();

export class TrafficDuty {
  constructor(game) {
    this.g = game; this.posts = []; this.acc = 0; this.spotT = 0; this.log = []; this.stats = { shiftEnds: 0, rideOffs: 0, toHQ: 0, alerts: 0, gloves: 0, chases: 0, pickups: 0 }; this.gloves = [];
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
  remove(p) { if (p.bare && p.ch) { p.ch.restoreHand(); p.bare = false; } if (p.glove) { this.dropGlove(p.glove); p.glove = null; } p.chase = false; if (p.ch && p.ch.root.parent && !(p.bike && p.ch.root.parent === p.bike.mesh)) p.ch.root.parent.remove(p.ch.root); p.on = false; this.dropBike(p); if (p.state !== 'ride') p.state = 'off'; }
  update(dt) {
    const g = this.g, P = g.player, A = g.atmos; const h = A.hour;
    this.acc -= dt;
    if (this.acc <= 0) { this.acc = 0.5; // streaming
      let n = 0; const order = this.posts.map((p) => [p, Math.hypot(p.x - P.x, p.z - P.z)]).sort((a, b) => a[1] - b[1]);
      for (const [p, d] of order) {
        const duty = h >= 7 && h < p.endH; if (h >= 6 && h < 7 && p.state === 'gone') p.state = 'off'; // a new day
        if (p.state === 'chase') { this.checkChase(p); continue; } // 73rd: out after you on his motorcycle (PoliceResponse owns him)
        if (p.state === 'ride') this.checkRide(p); if (p.state === 'ride' || p.state === 'gone') continue; // on the way to HQ (Traffic owns him now) / off duty
        if (p.on && p.state !== 'duty') { if (d > FAR + 60 && !this.inView(p.x, 0, p.z)) this.remove(p); continue; } // the end-of-shift sequence finishes on its own
        const want = duty && n < MAX_ACTIVE && (p.on ? d < FAR : d < NEAR); if (want) n++;
        if (want && !p.on && (!this.inView(p.x, 0, p.z) || d > 80)) { // the morning shift appears out of sight
          if (p.glove) { this.dropGlove(p.glove); p.glove = null; } for (const G of this.gloves.slice()) if (G.post === p) this.dropGlove(G); // (a glove he flung down before a chase that ended elsewhere: tidied out of sight as the new officer comes on)
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
        if (PO && PO.level > 0 && d < 18 && this.spotT <= 0 && this.sees(p, dt)) { this.spotT = 1; PO.spotted && PO.spotted(); }
        if (PO && PO.level > 0 && d < 30 && this.sees(p, dt)) { this.alert(p); continue; } // 73rd: he turns to you, shouts, then comes after you
        let yr = 0; if (Math.abs(angDiff(p.yaw, p.pyaw)) > 0.01) { const y0 = p.pyaw; p.pyaw = turnTo(p.pyaw, p.yaw, dt * 3); p.ch.root.rotation.y = p.pyaw; yr = angDiff(p.pyaw, y0) / Math.max(dt, 1e-3); } // back to his post facing (stepping round, not snapping)
        { if (a.action !== 'signal') a.set('signal');
          const t = g.clock || 0, v = L.signalState(p.n, 'v', t), hh = L.signalState(p.n, 'h', t); const vRight = p.sx * p.sz < 0; // which road lies to the officer's right
          a.sigSide = v === 'green' ? (vRight ? 1 : -1) : hh === 'green' ? (vRight ? -1 : 1) : 0; }
        if (d < 70) a.update(dt, 0, yr);
      } else if (p.state === 'alert' || p.state === 'glove' || p.state === 'pickup') this.updateAlert(p, dt, d);
      else this.updateLeave(p, dt, d);
    }
    if (this.gloves.length) this.stepGloves(dt);
  }
  // ------------------------------------------------------------------ 73rd: a wanted suspect at his junction
  // sight: one ray per officer every 0.4 s (no seeing through walls)
  sees(p, dt) { p.losT = (p.losT || 0) - dt; if (p.losT > 0) return p.los; p.losT = 0.4; const P = this.g.player, col = this.g.collision; const y0 = L.groundY(p.px, p.pz) + 1.6, y1 = (P.y || 0) + 1.3;
    p.los = !(col && col.raycast && col.raycast(p.px, y0, p.pz, P.x, y1, P.z, 0.1) < 0.97); return p.los; }
  alert(p) { const PO = this.g.police; p.state = 'alert'; p.t = 0; p.ch.anim.set(null); this.stats.alerts++; this.note('wanted suspect at the junction'); if (PO) { PO.spotted && PO.spotted(); if (Math.hypot(p.px - this.g.player.x, p.pz - this.g.player.z) < 26) PO.say && PO.say({ x: p.px, z: p.pz, ch: p.ch }, 'stop', 'Traffic police officer'); } }
  faceTo(p, x, z, dt, rate = 4.5) { const want = Math.atan2(x - p.px, z - p.pz), y0 = p.pyaw; p.pyaw = turnTo(p.pyaw, want, dt * rate); p.ch.root.rotation.y = p.pyaw; return [Math.abs(angDiff(want, p.pyaw)), angDiff(p.pyaw, y0) / Math.max(dt, 1e-3)]; }
  chasers() { return this.posts.filter((q) => q.chase && (q.state === 'glove' || q.state === 'toBike' || q.state === 'mount' || q.state === 'kick' || q.state === 'pull' || q.state === 'chase')).length; }
  updateAlert(p, dt, d) {
    const g = this.g, P = g.player, PO = g.police, A = p.ch.anim; p.t += dt; const wanted = PO && PO.level > 0;
    if (p.state === 'alert') { // turn to face you (stepping round on the spot, not spinning on a pin), arm out: "Stop! Police!"
      const [err, yr] = this.faceTo(p, P.x, P.z, dt); if (err < 0.45 && A.action !== 'point') A.set('point'); A.update(dt, 0, yr);
      if (!wanted || d > 38) { p.state = 'duty'; A.set('signal'); return; }
      if (p.t > 1.4 && err < 0.3) { if (this.bikeOk(p) && this.chasers() < 2 && !p.bare) { p.state = 'glove'; p.t = 0; p.chase = true; A.set('glovethrow'); A.gloveK = 0; this.stats.gloves++; this.note('glove off'); }
        else if (!this.bikeOk(p) && p.t > 3 && PO.say && !p.saidT) { p.saidT = 1; } }
      return; }
    if (p.state === 'glove') { // the right gauntlet comes off in the left hand, then is flung down on the road
      const k = Math.min(1, p.t / SWAT.glove); A.gloveK = k; this.faceTo(p, P.x, P.z, dt, 2); A.update(dt, 0);
      if (k >= 0.34 && !p.bare) { p.bare = true; p.ch.bareHand('R'); const m = new THREE.Mesh(gloveGeo(), MAT.paint); m.name = 'traffic-glove'; m.castShadow = false; m.position.set(0.0, -0.06, 0.03); m.rotation.set(-1.2, 0, 0.3); p.ch.bones.handL.add(m); p.glove = { m, held: true, post: p }; }
      if (k >= 0.72 && p.glove && p.glove.held) { const G = p.glove, m = G.m; m.updateWorldMatrix(true, false); const wp = new THREE.Vector3(), wq = new THREE.Quaternion(); m.matrixWorld.decompose(wp, wq, new THREE.Vector3()); m.parent.remove(m); g.scene.add(m); m.position.copy(wp); m.quaternion.copy(wq);
        const fx = Math.sin(p.pyaw), fz = Math.cos(p.pyaw); Object.assign(G, { held: false, vx: fx * 1.6 + fz * 0.3, vy: -2.4, vz: fz * 1.6 - fx * 0.3, spin: 7, rest: false, age: 0 }); this.gloves.push(G); }
      if (k >= 1) { A.set(null); A.gloveK = null; if (wanted && this.bikeOk(p)) { this.goBike(p, true); this.note('running to his motorcycle'); } else this.startPickup(p); }
      return; }
    if (p.state === 'pickup') { // it is over: back for the glove, pull it on, back to the post
      const G = p.glove; if (p.ph === 'walk') { if (this.walkStep(p, dt, 1.4) || p.t > 20) { p.ph = 'bend'; p.t = 0; A.set('crouch'); } return; }
      if (p.ph === 'bend') { if (G) this.faceTo(p, G.m.position.x, G.m.position.z, dt, 3); A.update(dt, 0); if (p.t > 0.55 && G) { this.dropGlove(G); p.glove = null; } if (p.t > 1.1) { p.ph = 'on'; p.t = 0; A.set('gloves'); } return; } // (crouch down to it, up with it)
      if (p.ph === 'on') { A.update(dt, 0); if (p.t > 0.45 && p.bare) { p.bare = false; p.ch.restoreHand(); } if (p.t > 1.05) { A.set(null); p.ph = 'back'; p.t = 0; p.walk = [[p.x, p.z]]; } return; }
      if (p.ph === 'back') { if (this.walkStep(p, dt, 1.35) || p.t > 25) { p.px = p.x; p.pz = p.z; p.state = 'duty'; p.chase = false; A.set('signal'); this.stats.pickups++; } }
    }
  }
  startPickup(p) { const G = p.glove; p.state = 'pickup'; p.t = 0; p.chase = false; p.ch.anim.set(null);
    if (G && !G.held) { const dx = G.m.position.x - p.px, dz = G.m.position.z - p.pz, dd = Math.hypot(dx, dz) || 1; p.walk = [[G.m.position.x - dx / dd * 0.45, G.m.position.z - dz / dd * 0.45]]; p.ph = 'walk'; }
    else { if (G) this.dropGlove(G); p.glove = null; p.ph = 'on'; } }
  dropGlove(G) { G.m.parent?.remove(G.m); const i = this.gloves.indexOf(G); if (i >= 0) this.gloves.splice(i, 1); }
  stepGloves(dt) { const cam = this.g.camera;
    for (const G of this.gloves.slice()) { const m = G.m; G.age += dt;
      if (!G.rest) { G.vy -= 9.8 * dt; m.position.x += G.vx * dt; m.position.y += G.vy * dt; m.position.z += G.vz * dt; m.rotateX(G.spin * dt); const gy = L.groundY(m.position.x, m.position.z) + 0.012;
        if (m.position.y <= gy) { m.position.y = gy; if (Math.abs(G.vy) > 1.1) { G.vy = -G.vy * 0.22; G.vx *= 0.45; G.vz *= 0.45; G.spin *= 0.35; } else { G.rest = true; const yw = Math.atan2(G.vx, G.vz) + (Math.random() - 0.5); m.rotation.set(0, yw, Math.random() < 0.5 ? 0 : Math.PI * 0.04); } } }
      const post = G.post; const far = cam ? Math.hypot(m.position.x - cam.position.x, m.position.z - cam.position.z) > 140 : true;
      if ((G.age > 180 && far) || (post && post.state === 'off' && far)) this.dropGlove(G); } }
  goBike(p, chase) { const v = p.bike; v.mesh.updateMatrixWorld(); const s0 = v.mesh.userData.seats[0]; p.bf = npcBoardSetup(v, s0, p.ch.anim); p.boarding = false; const e = p.bf ? p.bf.H0 : s0.exit || [0.75, s0.z]; const w = new THREE.Vector3(e[0], 0, e[1]).applyMatrix4(v.mesh.matrixWorld); p.walk = [[w.x, w.z]]; p.state = 'toBike'; p.t = 0; p.chase = chase; }
  // the motorcycle is in the lane: PoliceResponse takes him on as a one-man unit (or, if it is over, he rides back to HQ)
  checkChase(p) { const PO = this.g.police; if (PO && p.unit && PO.units.includes(p.unit)) return; p.state = 'off'; p.on = false; p.unit = null; p.rideBike = null; p.bike = null; p.ch = null; p.chase = false; p.bare = false; this.note('back from the chase'); }
  hideAll() { for (const p of this.posts) if (p.on && p.state === 'duty') this.remove(p); }
  // ------------------------------------------------------------------ end of shift
  endShift(p) {
    this.stats.shiftEnds++; p.ch.anim.set(null); p.t = 0;
    if (this.bikeOk(p)) { this.goBike(p, false); /* to the stand point beside the saddle, then the step-over (Boarding.js) */ this.note('shift over: walking to the motorcycle'); }
    else { const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw); p.walk = [[p.x + fx * 30, p.z + fz * 30]]; p.state = 'walkAway'; this.note('shift over: motorcycle gone, walking off'); }
  }
  walkStep(p, dt, sp = 1.35) { const tg = p.walk[0]; if (!tg) return true; const dx = tg[0] - p.px, dz = tg[1] - p.pz, dd = Math.hypot(dx, dz); if (dd < 0.1) { p.walk.shift(); return !p.walk.length; }
    const st = Math.min(dd, sp * dt); p.px += dx / dd * st; p.pz += dz / dd * st; p.pyaw += angDiff(Math.atan2(dx, dz), p.pyaw) * Math.min(1, dt * 7); p.ch.root.position.set(p.px, L.groundY(p.px, p.pz), p.pz); p.ch.root.rotation.y = p.pyaw; p.ch.anim.update(dt, sp); return false; }
  updateLeave(p, dt, d) {
    const g = this.g, v = p.bike || p.rideBike; p.t = (p.t || 0) + dt;
    if (p.state === 'walkAway') { if (this.walkStep(p, dt) || (!this.inView(p.px, 0, p.pz) && d > 25)) { this.remove(p); p.state = 'gone'; } return; }
    if ((p.state === 'toBike' || p.state === 'mount' || p.state === 'kick') && !this.bikeOk(p)) { p.state = 'walkAway'; p.walk = [[p.px + 30 * Math.sin(p.pyaw), p.pz + 30 * Math.cos(p.pyaw)]]; if (p.ch.root.parent !== g.scene) { const wp = p.ch.root.getWorldPosition(new THREE.Vector3()); p.ch.root.parent?.remove(p.ch.root); g.scene.add(p.ch.root); p.ch.anim.board = null; p.boarding = false; p.ch.anim.standUp(); p.px = wp.x; p.pz = wp.z; p.ch.root.position.set(wp.x, L.groundY(wp.x, wp.z), wp.z); p.ch.root.rotation.set(0, p.pyaw, 0); } return; } // you took his motorcycle (back into the world where he stood, not at bike-local coordinates)
    if (p.state === 'toBike' && p.chase && !(g.police && g.police.level > 0)) { this.startPickup(p); return; } // it is over before he reached it
    if (p.state === 'toBike') { if ((this.walkStep(p, dt, p.chase ? SWAT.run : 1.35) || p.t > 25) && p.bf) { p.state = 'mount'; p.t = 0; return; } if (p.state === 'toBike' && (!p.walk.length || p.t > 25)) { p.state = 'mount'; p.t = 0; const s0 = v.mesh.userData.seats[0]; p.ch.root.parent?.remove(p.ch.root); v.mesh.add(p.ch.root); p.ex = s0.exit || [0.75, s0.z]; p.ch.anim.set(null); } return; }
    const s0 = v.mesh.userData.seats[0];
    if (p.state === 'mount' && p.bf) { const bf = p.bf, A = p.ch.anim; // the rider's step-over, as the player does it
      if (!p.boarding) { v.mesh.updateMatrixWorld(); const hw = new THREE.Vector3(bf.H0[0], 0, bf.H0[1]).applyMatrix4(v.mesh.matrixWorld); const dx = hw.x - p.px, dz = hw.z - p.pz, dd = Math.hypot(dx, dz);
        if (dd > 1e-4) { const st = Math.min(dd, 1.2 * dt); p.px += dx / dd * st; p.pz += dz / dd * st; } const dy = angDiff(v.yaw, p.pyaw); p.pyaw += dy * Math.min(1, 9 * dt);
        p.ch.root.position.set(p.px, L.groundY(p.px, p.pz), p.pz); p.ch.root.rotation.y = p.pyaw; A.update(dt, dd > 0.03 ? 1.0 : 0);
        if ((dd < 0.03 && Math.abs(dy) < 0.08) || p.t > 3) { p.px = hw.x; p.pz = hw.z; p.pyaw = v.yaw; p.ch.root.position.set(p.px, L.groundY(p.px, p.pz), p.pz); p.ch.root.rotation.set(0, p.pyaw, 0); p.ch.root.parent?.remove(p.ch.root); v.mesh.add(p.ch.root); p.boarding = true; p.t = 0; A.set(null); A.standUp(); A.duck = 0; }
        else return; }
      const k = Math.min(1, Math.max(0, p.t - 0.12) / bf.T); poseBoard(A, bf.G, boardCurve(bf.G, k), v.mesh, boardGroundFn(v, g.collision && g.collision.groundAt ? g.collision : { groundAt: (x, z) => L.groundY(x, z) }), 0, Math.min(1, p.t / 0.25)); A.update(dt, 0, 0); v.sync(dt);
      if (k >= 1) { A.board = null; p.boarding = false; p.ch.root.position.set(s0.x, s0.y, s0.z); p.ch.root.rotation.set(0, 0, 0); A.sitIn(s0, 1); A.update(0.0001, 0, 0); p.state = 'kick'; p.t = 0; }
      return; }
    if (p.state === 'mount') { const k = Math.min(1, p.t / 1.0), sm = k * k * (3 - 2 * k); p.ch.root.position.set(p.ex[0] + (s0.x - p.ex[0]) * sm, s0.y * Math.min(1, sm * 1.3), p.ex[1] + (s0.z - p.ex[1]) * sm); p.ch.root.rotation.y = Math.atan2(s0.x - p.ex[0], s0.z - p.ex[1]) * (1 - Math.min(1, sm * 1.4)); p.ch.anim.sitIn(s0, sm); p.ch.anim.update(dt, 0); v.sync(dt); if (k >= 1) { p.state = 'kick'; p.t = 0; } return; }
    if (p.state === 'kick') { const k = Math.min(1, p.t / KICK_UP); kickUp(v, p.ch, s0, k); p.ch.anim.sitIn(s0, 1); p.ch.anim.update(dt, 0); v.sync(dt); if (k >= 1) { if (p.chase && g.police && g.police.level > 0) this.chaseOff(p); else { p.chase = false; this.rideOff(p); } } return; }
    if (p.state === 'pull') { // off the pavement and into the kerb lane
      const T = g.traffic, tg = p.pull; const dx = tg.x - v.x, dz = tg.z - v.z, dd = Math.hypot(dx, dz); const want = Math.atan2(dx, dz); const err = angDiff(want, v.yaw);
      v.speed += (Math.min(3.2, 1 + dd * 0.4) - v.speed) * Math.min(1, dt * 2); v.yaw += Math.max(-1, Math.min(1, err)) * Math.min(1.6, 0.5 + v.speed * 0.5) * dt; v.steer = Math.max(-0.6, Math.min(0.6, err * 1.4));
      v.x += Math.sin(v.yaw) * v.speed * dt; v.z += Math.cos(v.yaw) * v.speed * dt; v.y = L.groundY(v.x, v.z); v.lights = g.atmos?.night > 0.4; v.sync(dt); const A = p.ch.anim; A.steer = v.steer / 0.7; A.vehSpeed = v.speed; A.update(dt, 0);
      if ((dd < 1.0 || p.t > 12) && p.chase && g.police && g.police.level > 0) { const u = g.police.adoptBike && g.police.adoptBike(v, p.ch, p.lane); if (u) { p.state = 'chase'; p.on = false; p.unit = u; v.duty = null; v.keep = true; this.stats.chases++; this.note('in pursuit on his motorcycle'); return; } }
      if (dd < 1.0 || p.t > 12) { p.chase = false; if (!p.route) { const goal = L.nodes.find((n) => n && Math.abs(n.x - HQ_NODE.x) < 1 && Math.abs(n.z - HQ_NODE.z) < 1); if (goal) { const { prev } = shortest(p.lane.piece.to, T.drivable); p.route = pathTo(prev, p.lane.piece.to, goal); } } T.adoptAI(v, p.lane, { place: false, route: p.route }); v.speed = Math.max(v.speed, 3); v.driverChar = p.ch; v.keep = false; v.duty = null; v.toHQ = true; p.state = 'ride'; p.on = false; this.stats.rideOffs++; this.note('riding to Police HQ'); }
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
  chaseOff(p) { // off the stand and into the lane — no route: PoliceResponse plans it once he is on the road
    const g = this.g, T = g.traffic, v = p.bike; const ln = T.laneNear(v.x, v.z, v.yaw, 30); if (!ln) { p.chase = false; this.rideOff(p); return; }
    const i = T.parked.indexOf(v); if (i >= 0) T.parked.splice(i, 1); v.parked = false; ln.s = Math.min(ln.piece.len - 0.5, ln.s + 4); const x = ln.piece.p0[0] + ln.piece.d[0] * ln.s, z = ln.piece.p0[1] + ln.piece.d[1] * ln.s;
    p.lane = ln; p.pull = { x, z }; p.route = null; p.state = 'pull'; p.t = 0; p.bike = null; p.rideBike = v; v.duty = p; v.beacons && v.beacons(true, g.clock || 0);
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
