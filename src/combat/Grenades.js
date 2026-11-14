// Hand grenades: a separate throwable on its own key (B), not a weapon slot. Each protagonist carries his own (Squad member
// .grenades, bought at Ceylon Arms Co.; nobody starts with any).
//
// The throw is a real sequence driven through the Animator's post-pose hook (the arms are solved with the same two-bone IK
// the weapons use, so it works on every body):
//   stow     a drawn gun is holstered first (its own holster animation)
//   draw     the right hand goes to the belt pouch and brings the grenade up in front of the chest
//   pin      the left hand takes the ring and pulls the pin out (click), the pin drops to the ground
//   hold     while B is held: throwing arm cocked back behind the head, left arm pointing at the target, torso wound up,
//            the body turns with the camera, you can walk, and the predicted arc + landing ring is drawn
//   throw    release B (or a tap): the hips and chest whip round, the arm comes over the top, the grenade leaves the hand
//            at ~15 m/s along the view (+ your own velocity), the safety lever flies off and the 4 s fuze starts
//   recover  follow-through, then the arms blend back to the walk
// Interrupted after the pin is out → the live grenade is dropped at your feet (it still goes off). Before → it goes back.
// The grenade bounces (restitution / rolling friction) off the ground, walls, roofs, tables and vehicles, sinks in water,
// people nearby see it land and run, and on-screen warning markers show live grenades near you.
import * as THREE from 'three';
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { SoundBank } from '../audio/SoundBank.js';
import { buildGrenadeModel } from './GrenadeModel.js';
import { GRENADE, GRENADE_CAP } from './Shop.js';
import { solveArmIK } from '../actors/Character.js';
import * as L from '../world/Layout.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v)); const lerp = (a, b, t) => a + (b - a) * t;
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }; const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DRAW = 0.42, PIN = 0.45, THROW = 0.5, RELEASE = 0.17, RECOVER = 0.45, SPEED = 15, R = 0.034;
// chest-space keyframes (×height scale); right side is −x, forward +z
const K = {
  pouch: V(-0.2, -0.46, 0.06), chestR: V(-0.07, -0.06, 0.25), pinR: V(-0.04, -0.03, 0.26),
  cock: V(-0.26, 0.3, -0.17), over: V(-0.2, 0.4, 0.12), release: V(-0.12, 0.26, 0.44), follow: V(0.08, -0.24, 0.36),
  pullL: V(0.24, -0.04, 0.3), pointL: V(0.16, 0.14, 0.46), tuckL: V(0.24, -0.3, -0.02), restL: V(0.2, -0.36, 0.04),
};
const Q_HOLD = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)), Q_OVER = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.9, 0.3, 0));
const Q_PIN_L = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0, 0.7)), Q_POINT_L = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.45, 0, 0.15));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class Grenades {
  constructor(game) {
    this.g = game; this.state = 'none'; this.t = 0; this._count = 0; this.live = []; this.dropped = []; this.stats = { thrown: 0, exploded: 0, bounces: 0, dropped: 0 };
    this.inHand = buildGrenadeModel(); this.inHand.visible = false; this.held = false;
    // arc preview: dots + landing ring (hidden unless aiming)
    const dot = new THREE.SphereGeometry(0.035, 8, 6); this.dots = new THREE.InstancedMesh(dot, new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true, opacity: 0.85, depthWrite: false }), 40); this.dots.frustumCulled = false; this.dots.count = 0; /* stays visible (count 0) so it is compiled at load */ this.dots.renderOrder = 30;
    const ringM = new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40), ringM); this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; this.ring.renderOrder = 30;
    this.ring2 = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.42, 64), ringM.clone()); this.ring2.material.opacity = 0.35; this.ring2.rotation.x = -Math.PI / 2; this.ring2.visible = false; // lethal radius
    game.scene.add(this.dots, this.ring, this.ring2);
    this.hudInit();
  }
  // ---------------------------------------------------------------- count (per character)
  get member() { return this.g.squad?.activeMember || null; }
  get count() { const m = this.member; return m ? (m.grenades | 0) : this._count; }
  set count(n) { n = clamp(n | 0, 0, GRENADE_CAP); const m = this.member; if (m) m.grenades = n; else this._count = n; this.hudRefresh(); }
  take() { const m = this.owner; if (m && m !== this.member) { m.grenades = Math.max(0, (m.grenades | 0) - 1); this.hudRefresh(); } else this.count = this.count - 1; } // from whoever pulled the pin
  get busy() { return this.state !== 'none'; }
  get lockWeapons() { return this.state !== 'none' && this.state !== 'stow'; } // gun fully away: Weapons stays off until we finish
  get P() { return this.g.player; }

  // ---------------------------------------------------------------- per frame (after Weapons.update, before Player.update)
  update(dt, can) {
    const P = this.P; this.physics(dt);
    const blocked = !can || !P || P.vehicle || P.entry || P.exiting || P.climb || P.indoor || P.ch?.rag || this.g.health?.busy;
    if (this.state !== 'none' && blocked) this.interrupt();
    else if (this.state === 'none' && !blocked && Input.wasPressed('grenade')) this.begin();
    if (this.state !== 'none') this.step(dt);
    this.hudUpdate(dt);
  }
  begin() {
    const P = this.P; if (this.count <= 0) { this.g.weapons?.hudFlash?.('No grenades — Ceylon Arms Co. sells them'); Audio.tone(1800, 0.03, { type: 'square', vol: 0.05 }); return; }
    this.owner = this.member; const W = this.g.weapons; this.state = W && W.drawn ? 'stow' : 'draw'; this.t = 0; this.releaseHeld = true; this.pinOut = false; this.thrown = false; this.wantThrow = false;
    if (W) W.holster();
    if (P.sprinting) P.sprinting = false;
    this.attachTo(P.ch); P.ch.anim.postPose = (b, dt, seated) => this.pose(b, dt, seated);
  }
  attachTo(ch) { const h = ch.bones.handR; if (this.inHand.parent !== h) h.add(this.inHand); this.inHand.position.set(0.03, -0.088, 0.014); this.inHand.rotation.set(0.3, 0, 0.15); const ud = this.inHand.userData; ud.pin.visible = true; ud.spoon.visible = true; if (ud.pin.parent !== this.inHand) this.inHand.add(ud.pin); ud.pin.position.set(0.006, 0.052, 0); ud.pin.rotation.set(0, 0, 0); this.ch = ch; }
  end() {
    this.state = 'none'; this.inHand.visible = false; if (this.ch && this.ch.anim.postPose) this.ch.anim.postPose = null; const P = this.P; if (P) { P.aiming = false; } this.preview(false);
    if (this.ch?.rig) { this.ch.rig.hand('R', 'relax'); this.ch.rig.hand('L', 'relax'); }
  }
  interrupt() { // vehicle / cutscene / knocked over: a pulled pin means a live grenade on the floor
    if (this.pinOut && !this.thrown) { const p = this.handWorld(); this.spawnLive(p, V(0, 0.5, 0), 'player', 'dropped'); this.stats.dropped++; this.take(); }
    this.end();
  }
  step(dt) {
    const P = this.P, W = this.g.weapons; this.t += dt; const held = Input.isDown('grenade'); if (!held) this.releaseHeld = false;
    switch (this.state) {
      case 'stow': if (!W || (!W.drawn && W.state === 'none')) { this.state = 'draw'; this.t = 0; } else if (this.t > 2) { W.forceHolster(); } break;
      case 'draw': if (this.t > 0.2) this.inHand.visible = true; if (this.t >= DRAW) { this.state = 'pin'; this.t = 0; } break;
      case 'pin': if (!this.pinOut && this.t >= PIN * 0.62) this.pullPin(); if (this.t >= PIN) { this.state = 'hold'; this.t = 0; } break;
      case 'hold': if (!this.releaseHeld || this.t > 30) { this.state = 'throw'; this.t = 0; } break;
      case 'throw': if (!this.thrown && this.t >= RELEASE) this.release(); if (this.t >= THROW) { this.state = 'recover'; this.t = 0; } break;
      case 'recover': if (this.t >= RECOVER) this.end(); break;
    }
    const aimish = this.state === 'pin' || this.state === 'hold' || (this.state === 'throw' && this.t < THROW * 0.8);
    if (P && aimish) { P.aiming = true; P.aimW = 0.5; } // body turns with the camera, walk speed, the over-shoulder framing
    this.preview(this.state === 'hold' && this.t > 0.08);
  }
  pullPin() {
    this.pinOut = true; const ud = this.inHand.userData; const ch = this.ch; if (!SoundBank.play('grenade.pin')) { Audio.tone(2600, 0.02, { type: 'square', vol: 0.05 }); Audio.noise(0.05, { f: 4200, q: 4, vol: 0.06, when: 0.02 }); } // the pin scraping out
    ch.bones.handL.attach(ud.pin); this.pinDropT = 0.5;
    if (this.g.crowd) this.g.crowd.alarm(this.P.x, this.P.z, 14, 2, null, 'weapon', true); // people close by see a grenade come out
  }
  release() {
    this.thrown = true; this.stats.thrown++; const p = this.handWorld(); const vel = this.launchVel(); this.inHand.visible = false;
    const gnd = this.spawnLive(p, vel, 'player', 'thrown'); gnd.spin.set(9 + Math.random() * 4, Math.random() * 3, Math.random() * 3);
    this.take(); SoundBank.play('grenade.throw') || Audio.noise(0.12, { f: 900, q: 0.8, vol: 0.05 }); // the swish of the throw
    // the pin falls from the left hand
    const ud = this.inHand.userData; if (ud.pin.parent && ud.pin.parent !== this.inHand) this.dropPart(ud.pin, V(0.3, 0.5, 0), 25);
    if (this.g.police && this.g.police.crime) this.g.police.crime(this.P.x, this.P.z, 'gunfire'); // an officer who sees a grenade thrown reacts like gunfire
  }
  handWorld() { const h = this.inHand; h.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(h.matrixWorld); }
  launchVel(from) {
    const P = this.P, cam = this.g.camera; const d = cam.getWorldDirection(_v); const yaw = Math.atan2(d.x, d.z); const el = clamp(Math.asin(clamp(d.y, -1, 1)) + 0.32, -0.35, 1.15);
    const sp = SPEED * (P.crouching ? 0.75 : 1); const v = V(Math.sin(yaw) * Math.cos(el) * sp, Math.sin(el) * sp, Math.cos(yaw) * Math.cos(el) * sp);
    const pv = P.vel || (P.speed ? { x: Math.sin(P.yaw) * P.speed, z: Math.cos(P.yaw) * P.speed } : { x: 0, z: 0 }); v.x += (pv.x || 0) * 0.8; v.z += (pv.z || 0) * 0.8; void from; return v;
  }
  // ---------------------------------------------------------------- live grenades
  spawnLive(p, vel, source, how) {
    const m = buildGrenadeModel(); m.userData.pin.visible = false; m.position.copy(p); this.g.scene.add(m);
    const ud = m.userData; if (how === 'thrown') { this.dropPart(ud.spoon, V((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2).add(vel.clone().multiplyScalar(0.3)), 30); Audio.tone(3400, 0.015, { type: 'triangle', vol: 0.05, when: 0.02 }); /* the spoon pings off */ }
    else ud.spoon.visible = false;
    const gnd = { m, p: p.clone(), v: vel.clone(), spin: V(0, 0, 0), q: new THREE.Quaternion(), fuse: GRENADE.fuse + (how === 'dropped' ? 0 : 0), source, rest: false, warned: false, water: false, bounces: 0 };
    this.live.push(gnd); return gnd;
  }
  dropPart(obj, vel, life) { obj.updateWorldMatrix(true, false); const c = obj; this.g.scene.attach(c); c.visible = true; this.dropped.push({ m: c, v: vel.clone(), spin: V(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6), life, rest: false }); while (this.dropped.length > 12) { const o = this.dropped.shift(); o.m.parent?.remove(o.m); } }
  // swept point vs the collision boxes / ground / vehicles; returns true when it hit something
  move(o, h, r = R) {
    const col = this.g.collision; const p = o.p, v = o.v; const nx = p.x + v.x * h, ny = p.y + v.y * h, nz = p.z + v.z * h; let hit = false;
    if (col) for (const c of col.query(Math.min(p.x, nx) - r, Math.min(p.z, nz) - r, Math.max(p.x, nx) + r, Math.max(p.z, nz) + r)) {
      const base = c.y0 || 0, top = base + c.h; if (c.walkUnder && ny > base + 1.9) continue;
      const inN = nx > c.x0 - r && nx < c.x1 + r && nz > c.z0 - r && nz < c.z1 + r && ny > base - r && ny < top + r; if (!inN) continue;
      const inX = p.x > c.x0 - r && p.x < c.x1 + r, inZ = p.z > c.z0 - r && p.z < c.z1 + r, inY = p.y > base - r && p.y < top + r;
      if (!inY && inX && inZ) { if (v.y < 0) { p.y = top + r; v.y = -v.y * 0.32; } else { p.y = base - r; v.y = -v.y * 0.3; } v.x *= 0.72; v.z *= 0.72; hit = true; continue; } // landed on top / hit the underside
      if (!inX) { v.x = -v.x * 0.42; v.z *= 0.8; hit = true; } else if (!inZ) { v.z = -v.z * 0.42; v.x *= 0.8; hit = true; } else { v.x = -v.x * 0.4; v.z = -v.z * 0.4; hit = true; }
    }
    const T = this.g.traffic; if (T) for (const veh of T.all()) { if (!veh.T || Math.abs(veh.x - nx) > 8 || Math.abs(veh.z - nz) > 8) continue;
      const cy = Math.cos(veh.yaw), sy = Math.sin(veh.yaw); const lx = (nx - veh.x) * cy - (nz - veh.z) * sy, lz = (nx - veh.x) * sy + (nz - veh.z) * cy; const hw = veh.T.wid / 2 + r, hl = veh.T.len / 2 + r, top = (veh.y || 0) + (veh.T.hgt || 1.5);
      if (Math.abs(lx) > hw || Math.abs(lz) > hl || ny > top + r || ny < (veh.y || 0) + 0.15) continue;
      if (p.y >= top - 0.05) { p.y = top + r; v.y = Math.abs(v.y) * 0.35; v.x *= 0.7; v.z *= 0.7; } // bonk off the roof
      else { const ex = hw - Math.abs(lx), ez = hl - Math.abs(lz); const nlx = ex < ez ? Math.sign(lx) : 0, nlz = ex < ez ? 0 : Math.sign(lz); const wx = nlx * cy + nlz * sy, wz = -nlx * sy + nlz * cy; const vn = v.x * wx + v.z * wz; if (vn < 0) { v.x -= 1.42 * vn * wx; v.z -= 1.42 * vn * wz; v.x *= 0.85; v.z *= 0.85; } Audio.tone(900 + Math.random() * 300, 0.04, { type: 'triangle', vol: 0.05 }); }
      hit = true; }
    p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
    const gy = this.floor(p.x, p.z, p.y);
    if (p.y < gy + r) { p.y = gy + r; if (v.y < -0.6) hit = true; v.y = Math.abs(v.y) > 1.2 ? -v.y * 0.33 : 0; const f = Math.max(0, 1 - h * (Math.abs(v.y) < 0.01 ? 2.2 : 0.6)); v.x *= f; v.z *= f; o.onGround = true; } else o.onGround = false;
    return hit;
  }
  floor(x, z, y) { const col = this.g.collision; let g = L.surfaceY(x, z); if (col) for (const c of col.query(x, z, x, z)) { if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue; const top = (c.y0 || 0) + c.h; if (top <= y + 0.05 && top > g) g = top; } return g; }
  physics(dt) {
    if (!this.live.length && !this.dropped.length) return; const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (const o of this.live) {
      o.fuse -= dt;
      if (!o.rest) for (let i = 0; i < n; i++) {
        o.v.y -= 9.81 * h; o.v.multiplyScalar(1 - 0.03 * h); const wasV = o.v.length(); const hit = this.move(o, h);
        if (hit && wasV > 1.6) { o.bounces++; this.stats.bounces++; if (!SoundBank.play('grenade.bounce', clamp(wasV / 12, 0.2, 1))) { Audio.tone(520 + Math.random() * 380, 0.05, { type: 'triangle', vol: clamp(wasV / 40, 0.02, 0.09) }); Audio.noise(0.04, { f: 1800, q: 1.5, vol: clamp(wasV / 60, 0.01, 0.05) }); } o.spin.multiplyScalar(0.6); }
        if (o.onGround && o.v.lengthSq() < 0.02) { o.rest = true; o.v.set(0, 0, 0); }
      }
      if (!o.water && L.isWater(o.p.x, o.p.z) && o.p.y < L.groundY(o.p.x, o.p.z) + 0.4 && !(L.bridgeWalkAt && L.bridgeWalkAt(o.p.x, o.p.z))) { o.water = true; o.v.multiplyScalar(0.15); Audio.noise(0.25, { f: 700, q: 0.7, vol: 0.06 }); } // plop
      if (!o.warned && (o.onGround || o.rest)) { o.warned = true; const C = this.g.crowd; if (C) C.alarm(o.p.x, o.p.z, 12, 3, null, 'weapon', true); } // "grenade!" — everyone near scatters
      // spin: rolls along the ground, tumbles in the air
      if (!o.rest) { const s = o.onGround ? _w.set(o.v.z, 0, -o.v.x).multiplyScalar(1 / R) : o.spin; const a = s.length() * dt; if (a > 1e-5) { _q.setFromAxisAngle(_v.copy(s).normalize(), a); o.q.premultiply(_q); } }
      o.m.position.copy(o.p); o.m.quaternion.copy(o.q);
      if (o.fuse <= 0) this.detonate(o);
    }
    this.live = this.live.filter((o) => !o.gone);
    for (const d of this.dropped) { d.life -= dt; if (!d.rest) { d.v.y -= 9.81 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += d.spin.x * dt; d.m.rotation.y += d.spin.y * dt; d.m.rotation.z += d.spin.z * dt; const gy = this.floor(d.m.position.x, d.m.position.z, d.m.position.y + 0.1); if (d.m.position.y < gy + 0.004) { d.m.position.y = gy + 0.004; if (Math.abs(d.v.y) > 1) { d.v.y *= -0.3; d.v.x *= 0.5; d.v.z *= 0.5; Audio.tone(3000 + Math.random() * 1500, 0.02, { type: 'triangle', vol: 0.02 }); } else { d.rest = true; d.m.rotation.x = Math.PI / 2 * Math.round(d.m.rotation.x / (Math.PI / 2)); d.m.rotation.z = 0; } } } if (d.life <= 0) d.m.parent?.remove(d.m); }
    this.dropped = this.dropped.filter((d) => d.life > 0);
  }
  detonate(o) {
    o.gone = true; o.m.parent?.remove(o.m); this.stats.exploded++;
    const E = this.g.explosions; if (E) E.blast(o.p.clone(), { power: o.water ? 0.7 : 1, source: o.source, cause: 'grenade' });
  }
  // ---------------------------------------------------------------- the throw animation (Animator.postPose)
  pose(b, dt, seated) {
    const ch = this.ch; if (!ch || seated) return; const A = ch.anim, s = A.s || 1; const st = this.state, t = this.t; const rig = ch.rig;
    // weights: wind-up of the torso, how far the arms are under our control
    let armW = 1, R_ = null, L_ = null, qR = Q_HOLD, qL = null, wind = 0, whip = 0, lean = 0;
    const lerpV = (a, c, k) => _v.copy(a).lerp(c, k);
    const curve3 = (a, c, d, k) => { const u = 1 - k; return new THREE.Vector3().addScaledVector(a, u * u).addScaledVector(c, 2 * u * k).addScaledVector(d, k * k); };
    switch (st) {
      case 'stow': armW = 0; break;
      case 'draw': { const k = sm(t / DRAW); armW = sm(t / 0.18); R_ = curve3(K.pouch, V(-0.22, -0.2, 0.2), K.chestR, k); L_ = K.restL.clone(); qL = null; break; }
      case 'pin': { const k = t / PIN; R_ = lerpV(K.chestR, K.pinR, sm(k / 0.3)).clone(); // left hand to the ring, grip, pull out sideways
        const ring = this.ringChest(); const toRing = sm(seg(k, 0, 0.55)), pull = sm(seg(k, 0.62, 1)); L_ = K.restL.clone().lerp(ring, toRing).lerp(K.pullL, pull); qL = Q_PIN_L; wind = 0.15 * sm(seg(k, 0.6, 1)); break; }
      case 'hold': { const k = sm(t / 0.32); R_ = curve3(K.pinR, V(-0.24, 0.12, 0.08), K.cock, k); L_ = lerpV(K.pullL, K.pointL, k).clone(); qR = _q.copy(Q_HOLD).slerp(Q_OVER, k).clone(); qL = Q_POINT_L; wind = lerp(0.15, 1, k); lean = -0.06 * k;
        const br = Math.sin(this.t * 2.2) * 0.012; R_.y += br; L_.y += br * 0.6; break; } // breathing: the arm is never frozen
      case 'throw': { const k = t / THROW; const a = sm(seg(k, 0, RELEASE / THROW)); const c = sm(seg(k, RELEASE / THROW, 1));
        R_ = k < RELEASE / THROW ? curve3(K.cock, K.over, K.release, a) : K.release.clone().lerp(K.follow, c); qR = Q_OVER.clone().slerp(Q_HOLD, c);
        L_ = K.pointL.clone().lerp(K.tuckL, sm(seg(k, 0.05, 0.6))); qL = Q_POINT_L; wind = 1 - a * 1.8 - c * 0.2; whip = a; lean = 0.08 + 0.22 * a - 0.12 * c; break; }
      case 'recover': { const k = sm(t / RECOVER); armW = 1 - k; R_ = K.follow.clone(); L_ = K.tuckL.clone().lerp(K.restL, k); qR = Q_HOLD; wind = -0.8 * (1 - k); lean = 0.18 * (1 - k); break; }
    }
    if (armW <= 0.001) return;
    // torso: wind up (right shoulder back, left forward) then whip through; lean into the throw
    const tw = wind * 0.55; b.spine.rotation.y += -tw * 0.45 * armW; b.chest.rotation.y += -tw * 0.55 * armW; b.chest.rotation.x += lean * armW; b.spine.rotation.x += lean * 0.6 * armW;
    b.neck.rotation.y += tw * 0.5 * armW; b.head.rotation.y += tw * 0.3 * armW; void whip;
    if (st === 'hold' || st === 'throw') { const P = this.P; const pitch = clamp(-(P.camPitch - 0.12) * 0.6, -0.5, 0.6); b.neck.rotation.x += -pitch * 0.4; b.chest.rotation.x += -pitch * 0.2; } // look along the arc
    if (R_) solveArmIK(b, 'R', R_.multiplyScalar(s), qR, armW, V(-0.6, -0.55, -0.4));
    if (L_) solveArmIK(b, 'L', L_.multiplyScalar(s), qL, armW, st === 'hold' ? V(0.5, -0.8, 0.1) : null);
    if (rig) { rig.hand('R', this.inHand.visible ? 'grip' : 'open', 1); rig.hand('L', st === 'pin' && t / PIN > 0.4 && t / PIN < 0.98 ? 'pinch' : st === 'hold' || (st === 'throw' && t < 0.15) ? 'open' : 'relax', 1); }
  }
  ringChest() { // where the pull ring is, in chest space (the left hand reaches for the real ring on the model)
    const ud = this.inHand.userData; const ch = this.ch; ch.bones.chest.updateWorldMatrix(true, false); this.inHand.updateWorldMatrix(true, true); const w = new THREE.Vector3().setFromMatrixPosition(ud.pin.matrixWorld); ch.bones.chest.worldToLocal(w); const s = ch.anim.s || 1; return w.divideScalar(s).add(V(0.02, -0.02, 0));
  }
  // ---------------------------------------------------------------- arc preview
  preview(on) {
    this.ring.visible = this.ring2.visible = false; if (!on) { if (this.dots.count) { this.dots.count = 0; } return; } const P = this.P;
    const p = new THREE.Vector3(P.x, P.y + 1.78 * (P.ch?.anim?.s || 1), P.z).addScaledVector(_w.set(-Math.cos(P.yaw), 0, Math.sin(P.yaw)), 0.22); // over the right shoulder
    const o = { p, v: this.launchVel(), onGround: false }; const h = 1 / 60; let n = 0, land = null; const M = _m;
    for (let i = 0; i < 260 && n < 40; i++) { o.v.y -= 9.81 * h; const hit = this.move(o, h); if (i % 4 === 0) { M.makeTranslation(o.p.x, o.p.y, o.p.z); this.dots.setMatrixAt(n++, M); } if (hit || o.onGround) { land = o.p.clone(); break; } }
    this.dots.count = n; this.dots.instanceMatrix.needsUpdate = true;
    if (land) { const gy = this.floor(land.x, land.z, land.y + 0.2); this.ring.position.set(land.x, gy + 0.04, land.z); this.ring2.position.copy(this.ring.position); this.ring.visible = this.ring2.visible = true; const pu = 1 + Math.sin(performance.now() / 160) * 0.06; this.ring.scale.set(pu, pu, 1); }
  }
  // ---------------------------------------------------------------- HUD: count chip + warning markers for live grenades nearby
  hudInit() {
    const root = this.g.hud?.root || document.body; const el = document.createElement('div'); el.id = 'gren-hud'; el.innerHTML = '<div class="gr-chip hide"><span class="gr-ico"></span><b>0</b></div><div class="gr-warn"></div>'; root.appendChild(el); if (typeof el.querySelector !== 'function') { this.el = null; return; } /* Node unit test: no DOM */
    this.el = { chip: el.querySelector('.gr-chip'), n: el.querySelector('.gr-chip b'), warn: el.querySelector('.gr-warn'), ico: el.querySelector('.gr-ico') };
    this.el.ico.innerHTML = this.g.weapons ? this.g.weapons.icon(GRENADE) : '';
    if (!document.getElementById('gren-css')) { const st = document.createElement('style'); st.id = 'gren-css'; st.textContent = `
      #gren-hud .gr-chip{position:absolute;right:28px;bottom:176px;display:flex;align-items:center;gap:6px;padding:4px 10px 4px 6px;border-radius:14px;background:rgba(10,14,18,.55);color:#e9e2cf;font:600 15px/1 system-ui,sans-serif;transition:opacity .3s}
      #gren-hud .gr-chip.hide{opacity:0} #gren-hud .gr-chip svg{width:22px;height:22px;display:block}
      #gren-hud .gr-mk{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:2px solid #ff5d3a;background:rgba(40,8,0,.35);color:#ffb59c;display:flex;align-items:center;justify-content:center;animation:grpulse .5s infinite alternate}
      #gren-hud .gr-mk svg{width:20px;height:20px} @keyframes grpulse{from{transform:scale(.9)}to{transform:scale(1.08)}}`; document.head.appendChild(st); }
    this.mk = []; this._shownN = -1;
  }
  hudRefresh() { if (!this.el) return; const n = this.count; this.el.n.textContent = n; this._shownN = n; this._chipT = 4; }
  hudUpdate(dt) {
    if (!this.el) return; if (this._shownN !== this.count) this.hudRefresh(); this._chipT = Math.max(0, (this._chipT || 0) - dt);
    const show = this.count > 0 && (this.state !== 'none' || this._chipT > 0 || (this.g.weapons && this.g.weapons.drawn)); this.el.chip.classList.toggle('hide', !show);
    // warning markers: live grenades within 14 m (clamped to the screen edge when off screen / behind)
    const P = this.P, cam = this.g.camera; let used = 0;
    if (P && !this.g.hud?.bigMapOpen) for (const o of this.live) { const d = Math.hypot(o.p.x - P.x, o.p.z - P.z); if (d > 14 || (o.fuse > GRENADE.fuse - 0.5 && o.source === 'player')) continue;
      const s = _v.copy(o.p).project(cam); let x = s.x, y = s.y; const behind = s.z > 1; if (behind) { x = -x; y = -y; } const m = Math.max(Math.abs(x), Math.abs(y)); if (behind || m > 0.92) { x *= 0.92 / Math.max(m, 1e-3); y *= 0.92 / Math.max(m, 1e-3); }
      let e = this.mk[used]; if (!e) { e = document.createElement('div'); e.className = 'gr-mk'; e.innerHTML = this.g.weapons ? this.g.weapons.icon(GRENADE) : '!'; this.el.warn.appendChild(e); this.mk.push(e); }
      e.style.display = ''; e.style.left = `${(x * 0.5 + 0.5) * innerWidth}px`; e.style.top = `${(-y * 0.5 + 0.5) * innerHeight}px`; e.style.opacity = String(clamp(1.3 - d / 14, 0.35, 1)); used++; }
    for (let i = used; i < this.mk.length; i++) this.mk[i].style.display = 'none';
  }
  // ---------------------------------------------------------------- squad switch / reset
  onSwitch() { if (this.state !== 'none') this.interrupt(); this.hudRefresh(); }
  clear() { for (const o of this.live) o.m.parent?.remove(o.m); this.live = []; for (const d of this.dropped) d.m.parent?.remove(d.m); this.dropped = []; this.end(); }
}
export const _testing = { K, DRAW, PIN, THROW, RELEASE, SPEED };
