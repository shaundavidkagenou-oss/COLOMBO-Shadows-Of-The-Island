// Life at the Police Headquarters compound: parked police cars and motorcycles, gate sentries, staff walking between the
// gate, the car park and the portico, and a periodic motorcycle departure — two officers walk out of the building, mount a
// police motorcycle (rider + seated pillion), ride through the gate while the boom lifts and join Union Place traffic.
// Everything is simulated in place (no teleporting vehicles onto the road). Spawned only while the player is nearby (LOD).
import { routine } from '../actors/Routine.js';
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { HQ } from '../world/PoliceHQ.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { linePiece } from '../vehicles/Traffic.js';
import { parkOnStand, kickUp, kickDown, KICK_UP, KICK_DOWN } from '../vehicles/Kickstand.js';
import { Character } from '../actors/Character.js';
import { makePoliceAppearance } from '../actors/Appearance.js';
import { clamp, lerp } from '../core/math.js';

const C0 = { x: -11, z: -205 }; const NEAR = 230, FAR = 290;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class PoliceHQLife {
  constructor(game) { this.g = game; this.active = false; this.vehicles = []; this.people = []; this.depart = null; this.nextDepart = 35; this.boom = 0; this.boomWant = 0; this.seed = 1; this.log = []; this.stats = { departures: 0, handovers: 0, arrivals: 0 }; this.arrivals = []; }
  focus() { const P = this.g.player; return P.vehicle ? { x: P.vehicle.x, z: P.vehicle.z } : { x: P.x, z: P.z }; }
  update(dt) {
    const g = this.g; if (g.indoor) return; const f = this.focus(); const d = Math.hypot(f.x - C0.x, f.z - C0.z);
    if (!this.active && d < NEAR) this.spawn(); else if (this.active && d > FAR && !this.depart) this.despawn();
    // boom barrier animation (also closes again when the HQ is not simulated)
    this.updateGates(dt, f, d);
    if (!this.active) return;
    for (const p of this.people) this.updatePerson(p, dt, f);
    this.pushPlayer();
    if (this.arrivals.length) this.updateArrivals(dt);
    if (this.depart) this.updateDepart(dt); else { this.nextDepart -= dt; if (this.nextDepart <= 0 && d < 170) this.startDepart(); }
  }
  // Boom barrier + pedestrian wicket: open automatically for anyone (player, NPC, vehicle) approaching, close behind them.
  // While closed both are solid colliders; once open far enough the collider drops so people/vehicles pass.
  updateGates(dt, f, d) {
    const g = this.g; const an = g.world?.landmarks?.anim || {};
    if (!this.gateColl) { this.gateColl = {}; for (const c of g.collision?.list || []) if (c.id === 'hqBoom' || c.id === 'hqWicket') this.gateColl[c.id] = c; }
    let wantB = this.departBoom ? 1 : 0, wantW = 0;
    if (d < 120) {
      // vehicles: a lead point ahead of the bonnet anywhere in the approach lanes; people: only when actually stepping up to the
      // boom line (pedestrians walking along the pavement in front of the gate must not keep it open — they use the wicket)
      const nearV = (x, z) => { if (Math.abs(x + 10) < 4.6 && z > -236 && z < -216) { wantB = 1; this.lastTrig = ['veh', x, z]; } };
      const near = (x, z) => { if (Math.abs(x + 10) < 4.4 && z > -228.0 && z < -221.8) { wantB = 1; this.lastTrig = ['body', x, z]; } if (Math.abs(x - HQ.wicket.x) < 1.4 && Math.abs(z - HQ.rect[2]) < 1.8) wantW = 1; };
      for (const b of g.bodies || []) if (!b.ch.noGate && !(b.ped && !b.ped.police)) near(b.x, b.z); // civilians in the street crowd never open the compound gates
      const vs = g.traffic?.all() || []; const pv = g.player?.vehicle; const list = pv && !vs.includes(pv) ? vs.concat([pv]) : vs; // the player's own vehicle is not in the traffic lists
      for (const v of list) { if (Math.abs(v.x + 10) < 6 && v.z > -240 && v.z < -214) { const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); if (Math.abs(v.speed) > 0.3 || v.player || v === pv) nearV(v.x + fx * Math.sign(v.speed || 1) * 3, v.z + fz * Math.sign(v.speed || 1) * 3); } }
    }
    this.holdB = wantB ? 2.0 : Math.max(0, (this.holdB || 0) - dt); this.holdW = wantW ? 1.2 : Math.max(0, (this.holdW || 0) - dt);
    this.boomWant = this.holdB > 0 ? 1 : 0;
    this.boom = clamp(this.boom + Math.sign(this.boomWant - this.boom) * dt / 1.6, 0, 1); const arm = an.hqBoom || this.boomPivot();
    if (arm) arm.rotation.z = (1 - Math.cos(this.boom * Math.PI)) / 2 * 1.45;
    this.wicket = clamp((this.wicket || 0) + (this.holdW > 0 ? 1 : -1) * dt / 0.9, 0, 1); if (an.hqWicket) an.hqWicket.rotation.y = -(1 - Math.cos(this.wicket * Math.PI)) / 2 * 1.5;
    const cb = this.gateColl.hqBoom, cw = this.gateColl.hqWicket; if (cb) cb.h = this.boom > 0.55 ? 0 : 1.05; if (cw) cw.h = this.wicket > 0.6 ? 0 : 2.0;
  }
  boomPivot() { if (this._boom !== undefined) return this._boom; let found = null; this.g.scene.traverse((o) => { if (!found && o.isGroup && o.children.length === 2 && Math.abs(o.position.x - HQ.boom.x) < 0.01 && Math.abs(o.position.z - HQ.boom.z) < 0.01) found = o; }); return (this._boom = found); }
  // ------------------------------------------------------------------ spawn / despawn (LOD)
  addVehicle(type, b, seed) { const v = new Vehicle(type, seed, this.g.scene); parkOnStand(v); v.place(b.x, b.z, b.yaw); v.parked = true; v.keep = true; v.hq = true; v.bay = b; this.g.traffic.parked.push(v); this.vehicles.push(v); return v; }
  spawn() {
    this.active = true; let s = 900;
    for (const b of HQ.carBays) this.addVehicle(b.type, b, s++);
    HQ.bikeBays.forEach((b, i) => { if (i < 7) this.addVehicle('policebike', b, 40 + i * 2); }); // seed parity keeps the motorcycle body (not the scooter)
    HQ.staffBays.forEach((b, i) => this.addVehicle(['car', 'sedan', 'suv', 'car'][i], b, 7300 + i * 11));
    HQ.guards.forEach((q, i) => this.addPerson(makePoliceAppearance(300 + i * 7, 'guard'), q.x, q.z, q.yaw, { idle: i === 2 ? 'look' : null, guard: true }));
    HQ.walks.forEach((w, i) => this.addPerson(makePoliceAppearance(400 + i * 13, ['staff', 'admin', 'patrol'][i]), w[0][0], w[0][1], 0, { path: w, sp: 1.25 + i * 0.07, k: 0, dir: 1, t: i * 3 }));
    this.addPerson(makePoliceAppearance(512, 'traffic'), -21.4, -210.4, Math.PI / 2, { idle: 'talk' }); this.addPerson(makePoliceAppearance(519, 'patrol', { sex: 'f' }), -20.2, -210.4, -Math.PI / 2, { idle: 'talk' });
    this.addPerson(makePoliceAppearance(527, 'csru'), 24.2, -207.5, -Math.PI / 2, { idle: 'phone' });
  }
  despawn() {
    const T = this.g.traffic;
    for (const a of this.arrivals) { if (this.vehicles.includes(a.v)) continue; const i = T.parked.indexOf(a.v); if (i >= 0) T.parked.splice(i, 1); if (a.ch && !this.people.some((p) => p.ch === a.ch)) a.ch.dispose(); a.v.driverChar = null; if (!a.v.player) a.v.dispose(); } this.arrivals = [];
    for (const v of this.vehicles) { if (v.player || T.vehicles.includes(v)) { v.keep = false; continue; } const i = T.parked.indexOf(v); if (i >= 0) T.parked.splice(i, 1); if (v.driverChar) v.driverChar.dispose(); v.dispose(); }
    for (const p of this.people) { p.ch.root.parent?.remove(p.ch.root); p.ch.dispose(); }
    this.vehicles = []; this.people = []; this.active = false; this.departBoom = 0;
  }
  addPerson(spec, x, z, yaw, o = {}) { const ch = new Character(spec); ch.root.position.set(x, L.groundY(x, z), z); ch.root.rotation.y = yaw; this.g.scene.add(ch.root); if (o.idle) ch.anim.set(o.idle); const p = Object.assign({ ch, x, z, yaw, acc: 0 }, o); if (!o.path) ch.noGate = true; /* posted guards / chatting staff stand beside the gate: they must not hold it open */ this.people.push(p); return p; }
  updatePerson(p, dt, f) {
    let speed = 0;
    if (p.path) { // walk the polyline back and forth with a short pause at either end
      if (p.wait > 0) p.wait -= dt; else { const tgt = p.path[p.k]; const dx = tgt[0] - p.x, dz = tgt[1] - p.z, dd = Math.hypot(dx, dz);
        if (dd < 0.15) { p.k += p.dir; if (p.k >= p.path.length || p.k < 0) { p.dir *= -1; p.k += p.dir * 2; p.wait = 3 + Math.random() * 4; } }
        else { const st = Math.min(dd, p.sp * dt); p.x += (dx / dd) * st; p.z += (dz / dd) * st; speed = p.sp; const want = Math.atan2(dx, dz); p.yaw += angDiff(want, p.yaw) * Math.min(1, dt * 6); } }
      p.ch.root.position.set(p.x, L.groundY(p.x, p.z), p.z); p.ch.root.rotation.y = p.yaw;
    } else if (p.guard) { const P = this.g.player; const dd = Math.hypot(P.x - p.x, P.z - p.z); if (dd < 6 && !P.vehicle) { const want = Math.atan2(P.x - p.x, P.z - p.z); p.ch.root.rotation.y += angDiff(want, p.ch.root.rotation.y) * Math.min(1, dt * 2.5); } else p.ch.root.rotation.y += angDiff(p.yaw, p.ch.root.rotation.y) * Math.min(1, dt * 1.5); }
    if (!p.path && !p.walkTo && !p.mounted && !p.goesIn && (p.guard || p.idle)) routine(p, p.ch, dt, p.guard ? 'guard' : p.idle === 'talk' ? 'chat' : p.idle === 'phone' ? 'phone' : 'stand');
    if (p.walkTo) speed = this.stepWalker(p, dt);
    // animation LOD: every frame close by, 6 Hz further out
    const d = Math.hypot(f.x - p.x, f.z - p.z); p.acc += dt; const rate = d < 45 ? 0 : d < 120 ? 0.16 : 0.5; if (p.acc >= rate) { p.ch.anim.update(Math.min(p.acc, 0.25), speed); p.acc = 0; }
  }
  pushPlayer() { const P = this.g.player; if (P.vehicle) return; for (const p of this.people) { if (p.mounted) continue; const dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz); if (d < 0.55 && d > 1e-3) { P.x = p.x + (dx / d) * 0.55; P.z = p.z + (dz / d) * 0.55; } } }
  // ------------------------------------------------------------------ departure event
  startDepart() {
    const T = this.g.traffic; const bikes = this.vehicles.filter((v) => v.type === 'policebike' && !v.player && T.parked.includes(v) && !v.driverChar);
    if (!bikes.length) { this.nextDepart = 60; return; } const bike = bikes[Math.floor(Math.random() * bikes.length)]; const seats = bike.mesh.userData.seats;
    const exitW = (seat) => { bike.mesh.updateMatrixWorld(); const e = seat.exit || [0.75, seat.z]; const w = new THREE.Vector3(e[0], 0, e[1]).applyMatrix4(bike.mesh.matrixWorld); return [w.x, w.z]; };
    const route = [[-11, -207.4], [-20, -208.6], [-36, -208.6], [-43.4, -207.2]];
    const mk = (role, seed, extra, delay) => { const p = this.addPerson(makePoliceAppearance(seed, role), route[0][0], route[0][1], Math.PI, {}); p.walkTo = route.concat([extra]); p.wk = 0; p.sp = 1.45; p.wait = delay; return p; };
    const s0 = 600 + this.stats.departures * 17; const rider = mk('motorcycle', s0, exitW(seats[0]), 0), pillion = mk('motorcycle', s0 + 5, exitW(seats[1]), 0.9);
    this.depart = { bike, rider, pillion, stage: 'walk', t: 0, wp: 0 }; this.stats.departures++; this.note('depart: officers walking to motorcycle');
  }
  stepWalker(p, dt) {
    if (p.wait > 0) { p.wait -= dt; return 0; } const tgt = p.walkTo[p.wk]; if (!tgt) return 0; const dx = tgt[0] - p.x, dz = tgt[1] - p.z, dd = Math.hypot(dx, dz);
    if (dd < 0.12) { p.wk++; if (p.wk >= p.walkTo.length) { p.arrived = true; return 0; } return p.sp; }
    const st = Math.min(dd, p.sp * dt); p.x += (dx / dd) * st; p.z += (dz / dd) * st; const want = Math.atan2(dx, dz); p.yaw += angDiff(want, p.yaw) * Math.min(1, dt * 7);
    p.ch.root.position.set(p.x, L.groundY(p.x, p.z), p.z); p.ch.root.rotation.y = p.yaw; return p.sp;
  }
  // rider and pillion move from their exit spot onto the seat while the seated pose blends in (reverse of Traffic.disembark)
  mount(p, seat, bike, k) {
    if (!p.mounted) { p.mounted = true; p.walkTo = null; p.ch.root.parent?.remove(p.ch.root); bike.mesh.add(p.ch.root); p.ex = seat.exit || [0.75, seat.z]; p.ch.anim.set(null); }
    const sm = k * k * (3 - 2 * k); const ex = p.ex; p.ch.root.position.set(lerp(ex[0], seat.x, sm), lerp(0, seat.y, Math.min(1, sm * 1.3)), lerp(ex[1], seat.z, sm));
    p.ch.root.rotation.y = lerp(Math.atan2(seat.x - ex[0], seat.z - ex[1]), 0, Math.min(1, sm * 1.4)); p.ch.anim.sitIn(seat, sm, seat.driver ? null : 'lap');
  }
  updateDepart(dt) {
    const D = this.depart, T = this.g.traffic, bike = D.bike, seats = bike.mesh.userData.seats; D.t += dt;
    if (bike.player || bike.disposed) { this.abortDepart('vehicle taken'); return; }
    if (D.stage === 'walk') { if (D.rider.arrived && D.pillion.arrived) { D.stage = 'mount'; D.t = 0; this.note('depart: mounting'); } else if (D.t > 90) this.abortDepart('walk timeout'); return; }
    if (D.stage === 'mount') { const k1 = clamp(D.t / 1.0, 0, 1), k2 = clamp((D.t - 0.6) / 1.0, 0, 1); this.mount(D.rider, seats[0], bike, k1); this.mount(D.pillion, seats[1], bike, k2); D.rider.ch.anim.update(dt, 0); D.pillion.ch.anim.update(dt, 0);
      if (k2 >= 1) { bike.driverChar = D.rider.ch; bike.pax = [D.pillion.ch]; bike.paxPlan = [{ si: 1, spec: D.pillion.ch.spec, mode: 'lap' }]; T.paxCount += 1; this.people = this.people.filter((p) => p !== D.rider && p !== D.pillion);
        const b = bike.bay; D.route = [[b.x + 3.2, b.z], [-43.2, -207.8], [-34, -212.6], [-22, -213.8], [-13, -215.2], [-10.2, -218], [-10, -222.6], [-10, -229.2], [-11.2, -232.4]]; /* around the building corner, north of the portico columns */ D.hand = this.handoverPiece(); if (D.hand) D.route.push([D.hand.p0[0], D.hand.p0[1]]);
        D.stage = 'kick'; D.t = 0; D.wp = 0; this.note('depart: kickstand up'); }
      return; }
    if (D.stage === 'kick') { const k = clamp(D.t / KICK_UP, 0, 1); kickUp(bike, D.rider.ch, seats[0], k); bike.sync(dt); D.rider.ch.anim.update(dt, 0); D.pillion.ch.anim.update(dt, 0); if (k >= 1) { D.stage = 'ride'; D.t = 0; bike.parked = false; this.note('depart: riding to gate'); } return; }
    if (D.stage === 'ride') {
      const tgt = D.route[D.wp]; const dx = tgt[0] - bike.x, dz = tgt[1] - bike.z, dd = Math.hypot(dx, dz);
      const atBoom = bike.z > -226.8 && bike.z < -219 && Math.abs(bike.x + 10) < 3; if (bike.z < -219.5 && bike.z > -229) this.departBoom = 1; if (bike.z < -230.5) this.departBoom = 0;
      let vWant = D.wp < 2 ? 2.5 : 4.2; if (atBoom && this.boom < 0.9 && bike.z > -224) vWant = Math.min(vWant, Math.max(0, (bike.z + 224.2) * 1.2)); if (D.wp >= D.route.length - 2) vWant = 5;
      // simple pure-pursuit: steer towards the next waypoint, slow for sharp turns
      const want = Math.atan2(dx, dz); const err = angDiff(want, bike.yaw); vWant *= 1 - Math.min(0.6, Math.abs(err) * 0.5);
      bike.speed = lerp(bike.speed, vWant, 1 - Math.exp(-dt * 2.2)); const turn = clamp(err, -1, 1) * Math.min(1.8, 0.4 + bike.speed * 0.5) * dt; bike.yaw += turn; bike.steer = clamp(err * 1.4, -0.6, 0.6);
      bike.x += Math.sin(bike.yaw) * bike.speed * dt; bike.z += Math.cos(bike.yaw) * bike.speed * dt; bike.y = L.groundY(bike.x, bike.z); bike.lights = this.g.atmos?.night > 0.4; bike.sync(dt);
      for (const ch of [bike.driverChar, ...(bike.pax || [])]) if (ch) { const A = ch.anim; A.steer = bike.steer / 0.7; A.vehSpeed = bike.speed; A.update(dt, 0); }
      if (dd < (D.wp >= D.route.length - 1 ? 0.6 : 1.4)) { D.wp++; if (D.wp >= D.route.length) this.handover(); }
      if (D.t > 120) this.abortDepart('ride timeout');
    }
  }
  // ------------------------------------------------------------------ arrivals (traffic officers back from point duty)
  // takes a motorcycle off the road at the Union Place junction: ride in through the gate (waits for the boom), park front-in
  // in a free motorcycle bay, side stand down, climb off, walk to the portico and into the building
  arrive(v) {
    if (!this.active || this.arrivals.length >= 2 || !v.driverChar) return false; const T = this.g.traffic;
    const used = new Set(this.vehicles.map((x) => x.bay)); for (const a of this.arrivals) used.add(a.bay); const bay = HQ.bikeBays.find((b) => !used.has(b)) || null;
    const i = T.vehicles.indexOf(v); if (i >= 0) T.vehicles.splice(i, 1); if (!T.parked.includes(v)) T.parked.push(v); // stays solid + opens the boom
    v.ai = null; v.keep = true; v.hq = true; v.hqArrive = true; v.parked = false; v.duty = null;
    const route = [[-10.6, -233.6], [-10, -229.2], [-10, -222.6], [-10.2, -218], [-13, -215.2], [-22, -213.8], [-34, -212.6], [-43.2, -207.8]].concat(bay ? [[bay.x + 3.2, bay.z], [bay.x + 0.3, bay.z]] : [[-28, -214.4]]);
    this.arrivals.push({ v, ch: v.driverChar, bay, route, wp: 0, stage: 'ride', t: 0 }); this.stats.arrivals++; this.note('arrival: officer riding in'); return true;
  }
  updateArrivals(dt) {
    const T = this.g.traffic;
    for (const a of this.arrivals.slice()) { const v = a.v, seat = v.mesh.userData.seats[0]; a.t += dt;
      if (v.player || v.disposed) { this.arrivals = this.arrivals.filter((x) => x !== a); continue; }
      if (a.stage === 'ride') {
        const tgt = a.route[a.wp]; const dx = tgt[0] - v.x, dz = tgt[1] - v.z, dd = Math.hypot(dx, dz); const last = a.wp >= a.route.length - 1;
        let vWant = last ? Math.min(1.6, dd * 1.5) : a.wp >= a.route.length - 3 ? 2.2 : 4.0; if (v.z < -226 && v.z > -232 && this.boom < 0.9) vWant = Math.min(vWant, Math.max(0, (-227.4 - v.z) * 1.2));
        const err = angDiff(Math.atan2(dx, dz), v.yaw); vWant *= 1 - Math.min(0.6, Math.abs(err) * 0.5);
        v.speed = lerp(v.speed, vWant, 1 - Math.exp(-dt * 2.4)); v.yaw += clamp(err, -1, 1) * Math.min(1.8, 0.4 + v.speed * 0.5) * dt; v.steer = clamp(err * 1.4, -0.6, 0.6);
        v.x += Math.sin(v.yaw) * v.speed * dt; v.z += Math.cos(v.yaw) * v.speed * dt; v.y = L.groundY(v.x, v.z); v.lights = this.g.atmos?.night > 0.4; v.sync(dt);
        const A = a.ch.anim; A.steer = v.steer / 0.7; A.vehSpeed = v.speed; A.update(dt, 0);
        if (dd < (last ? 0.25 : 1.3)) { a.wp++; if (a.wp >= a.route.length || a.t > 90) { v.speed = 0; v.steer = 0; a.stage = 'kick'; a.t = 0; } }
        continue;
      }
      if (a.stage === 'kick') { const k = clamp(a.t / KICK_DOWN, 0, 1); kickDown(v, a.ch, seat, k); a.ch.anim.update(dt, 0); v.sync(dt); if (k >= 1) { a.stage = 'off'; a.t = 0; a.ex = seat.exit || [0.75, seat.z]; } continue; }
      if (a.stage === 'off') { // reverse of mount(): seat → exit spot beside the stand side
        const k = clamp(a.t / 0.9, 0, 1), sm = k * k * (3 - 2 * k); const ch = a.ch; ch.root.position.set(lerp(seat.x, a.ex[0], sm), lerp(seat.y, 0, Math.min(1, sm * 1.3)), lerp(seat.z, a.ex[1], sm));
        ch.root.rotation.y = lerp(0, Math.atan2(a.ex[0] - seat.x, a.ex[1] - seat.z), Math.min(1, sm * 1.5)); ch.anim.sitIn(seat, 1 - sm); ch.anim.update(dt, k > 0.5 ? 1 : 0);
        if (k >= 1) { ch.anim.standUp(); v.mesh.updateMatrixWorld(); const w = new THREE.Vector3(a.ex[0], 0, a.ex[1]).applyMatrix4(v.mesh.matrixWorld); v.mesh.remove(ch.root); this.g.scene.add(ch.root); v.driverChar = null;
          v.parked = true; v.speed = 0; v.bay = a.bay; v.hqArrive = false; this.vehicles.push(v);
          const p = { ch, x: w.x, z: w.z, yaw: v.yaw + Math.PI / 2, acc: 0, walkTo: [[-43.4, -207.2], [-36, -208.6], [-20, -208.6], [-11, -207.4], [-11, -205.6]], wk: 0, sp: 1.4, goesIn: true }; this.people.push(p); a.p = p; a.stage = 'walk'; a.t = 0; }
        continue;
      }
      if (a.stage === 'walk') { if (a.p.arrived || a.t > 80) { this.people = this.people.filter((q) => q !== a.p); a.p.ch.root.parent?.remove(a.p.ch.root); a.p.ch.dispose(); this.arrivals = this.arrivals.filter((x) => x !== a); this.note('arrival: officer went inside'); } }
    }
    void T;
  }
  // the westbound kerb lane of Union Place, starting at the old 2nd Cross junction
  handoverPiece() {
    const near = (x, z) => L.nodes.find((n) => n && Math.abs(n.x - x) < 1 && Math.abs(n.z - z) < 1);
    const from = near(-10, -240), to = near(-60, -240); if (!from || !to) return null;
    const seg = L.segments.find((s) => s.dir === 'h' && Math.abs(s.z0 + 240) < 1 && Math.min(s.x0, s.x1) <= -59 && Math.max(s.x0, s.x1) >= -11); if (!seg) return null;
    return linePiece(seg, from, to, seg.level <= 1 ? 1 : 0);
  }
  handover() {
    const D = this.depart, T = this.g.traffic, bike = D.bike; const pi = T.parked.indexOf(bike); if (pi >= 0) T.parked.splice(pi, 1);
    if (D.hand) { bike.ai = { pieces: [D.hand], s: 0, v0: 9.5, stuck: 0, honkCd: 0, bumped: 0, aggressive: 1 }; bike.yaw = Math.atan2(D.hand.d[0], D.hand.d[1]); T.extend(bike); T.vehicles.push(bike); this.stats.handovers++; this.note('depart: joined Union Place traffic'); }
    bike.keep = false; bike.hq = false; this.vehicles = this.vehicles.filter((v) => v !== bike); this.depart = null; this.nextDepart = 140 + Math.random() * 120;
  }
  abortDepart(why) {
    const D = this.depart; this.note('depart aborted: ' + why);
    for (const p of [D.rider, D.pillion]) if (!p.mounted) { p.walkTo = null; p.idle = 'look'; p.ch.anim.set('look'); }
    this.depart = null; this.nextDepart = 120; this.departBoom = 0;
  }
  note(s) { this.log.push(`${(this.g.clock || 0).toFixed(1)} ${s}`); if (this.log.length > 40) this.log.shift(); }
}
