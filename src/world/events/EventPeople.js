// 81st request — DYNAMIC CITY EVENTS: the people of an event site. Visitors, families, tourists, spectators, vendors, security,
// cleaners, organisers, technicians, registration staff, first-aid staff and set-up crew are ordinary crowd pedestrians in the
// Crowd 'job' state (the pattern StationLife / FuelService use): the crowd still moves them (personal space, avoidance of
// people, props, vehicles, wall collision), reacts them to danger (gunfire → Crowd.react → job.interrupt / resume), and hands
// them back to the street (returnToGraph) when they leave. Performers stand on the stage deck and are plain characters run
// here (the clerks' pattern), never crowd people (the crowd's ground probe would put them back at lawn level).
// Visitors walk the city's pavement graph to the event (Crowd.route + the onArrive hook), queue at the gate / counter with
// spacing, find a free spot or chair through the in-site router, watch, clap, talk in their group, phone, take photos, browse
// the stalls, and leave in their own time. Every timer is personal (no synchronised actions); every move has a stall detector
// and a side-step / re-route (no deadlock, no oscillation).
import { Character } from '../../actors/Character.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const dampA = (a, b, k, dt) => a + wrapA(b - a) * Math.min(1, k * dt);
// the bench pose (StationLife SEAT_BENCH) fits a monobloc chair: cushion 0.44 m, feet forward
export const SEAT_CHAIR = { x: 0, y: 0, z: 0, floor: -0.45, fz: 0.46, fx: 0.13, lean: -0.1, hands: 'lap', kind: 'sit' };

// ------------------------------------------------------------------------------------------------ one person of the event
export class EvAgent {
  constructor(site, role) {
    this.site = site; this.role = role; this.p = null; this.phase = 'idle'; this.t = 0; this.route = null; this.stuckT = 0; this.lastX = 0; this.lastZ = 0; this.walking = false; this.dt = 0;
    this.seat = null; this.sitW = 0; this.sitGoal = 0; this.sitFrom = null; this.gone = false; this.scared = false; this.actT = 1 + Math.random() * 4; this.spot = null; this.reroutes = 0;
    this.job = { step: (p, dt, ctx, lod) => this.step(dt, lod), post: (p, lod, posed) => this.afterPose(lod, posed), interrupt: (p, state) => this.interrupt(state), resume: () => this.resume() };
  }
  get crowd() { return this.site.crowd; }
  spawnAt(sp, x, z, yaw, node) { const C = this.crowd; const p = C.makePed(sp, x, z, node ?? this.site.node);
    Object.assign(p, { x, z, yaw, state: 'job', job: this.job, keep: true, umbrella: false, umbrellaOpen: false, jog: false, pace: 1.2, target: null, edge: null, route: null, evRole: this.role, onArrive: null });
    C.place(p); this.p = p; this.lastX = x; this.lastZ = z; return p; }
  adoptPed(p) { Object.assign(p, { state: 'job', job: this.job, keep: true, umbrella: false, umbrellaOpen: false, jog: false, pace: 1.2, evRole: this.role, onArrive: null, target: null, edge: null, route: null, via: null }); p.ch.anim.set(null); this.p = p; this.lastX = p.x; this.lastZ = p.z; }
  alive() { const p = this.p; return !!(p && !p.dead && p.ch.crowdPed === p); }
  setPhase(ph, route = null) { this.phase = ph; this.t = 0; this.route = route; this.stuckT = 0; this.bestD = undefined; this.stallT = 0; }
  moveTo(x, z, final = true, speed = 1.25) { const p = this.p, d = Math.hypot(x - p.x, z - p.z); p.faceYaw = null; if (d < (final ? 0.18 : 0.5)) return null; return { desired: final ? Math.min(speed, 0.3 + d * 1.1) : speed, tx: x, tz: z, avoid: d > 1.0, accel: 3.0 }; }
  follow(route, speed) {
    while (route && route.length) { const q = route[0]; const last = route.length === 1; let r = this.moveTo(q.x, q.z, last, speed);
      if (r) { const d = Math.hypot(q.x - this.p.x, q.z - this.p.z); if (d < (this.bestD ?? 1e9) - 0.03) { this.bestD = d; this.stallT = 0; } else this.stallT = (this.stallT || 0) + this.dt; if (d < (last ? 0.75 : 1.6) && this.stallT > 0.9) r = null; } // close enough and not getting closer (someone stands there): done with this point
      if (r) { this.walking = true; return r; } route.shift(); this.bestD = undefined; this.stallT = 0; }
    return null;
  }
  faceTo(yaw) { this.p.faceYaw = yaw; return Math.abs(wrapA(yaw - this.p.yaw)) < 0.25; }
  faceAt(x, z) { return this.faceTo(Math.atan2(x - this.p.x, z - this.p.z)); }
  idle() { return { desired: 0, tx: null, tz: null, avoid: false }; }
  // blocked while walking: a step to the side (always the same side for this person: no left-right dithering); still stuck →
  // a fresh route from where they are; stuck for long and out of sight → moved on to the next waypoint
  unstick(r) {
    const p = this.p; if (!r || !this.walking) { this.stuckT = Math.max(0, this.stuckT - this.dt * 2); return r; }
    if (Math.hypot(p.x - this.lastX, p.z - this.lastZ) < 0.18 * this.dt) this.stuckT += this.dt; else this.stuckT = Math.max(0, this.stuckT - this.dt * 1.5);
    const side = this.side || (this.side = Math.random() < 0.5 ? 1 : -1);
    if (this.stuckT > 1.2 && this.stuckT < 2.6) { const dx = r.tx - p.x, dz = r.tz - p.z, d = Math.hypot(dx, dz) || 1; r.tx = p.x + (dz / d) * side * 1.0 + dx / d * 0.4; r.tz = p.z - (dx / d) * side * 1.0 + dz / d * 0.4; r.avoid = true; }
    else if (this.stuckT >= 2.6 && this.stuckT < 2.6 + this.dt * 1.5 && this.route && this.route.length && this.reroutes < 4) { const g = this.route[this.route.length - 1]; const nr = this.site.routeTo(p.x, p.z, g.x, g.z); if (nr) { this.route.length = 0; this.route.push(...nr); this.reroutes++; this.side = -side; } }
    else if (this.stuckT > 6 && this.route && this.route.length && !this.site.seen(p.x, p.z) && !this.site.seen(this.route[0].x, this.route[0].z) && this.site.freeAt(this.route[0].x, this.route[0].z, 0.4)) { const q = this.route[0]; p.x = q.x; p.z = q.z; this.crowd.place(p); this.stuckT = 0; this.site.stats.unstuck++; }
    return r;
  }
  sitDown(seat, mode = null) { this.seat = seat; this.sitGoal = 1; this.sitFrom = { x: this.p.x, z: this.p.z }; this.p.sit = true; this.seatMode = mode; seat.used = this; }
  standUp() { this.sitGoal = 0; }
  updateSit(dt) {
    const p = this.p, A = p.ch.anim; const s = this.seat; if (!s) return;
    if (s.ground) { // on a mat: the crowd's sit-on-the-ground action (no invisible chair)
      if (this.sitGoal) { p.x += (s.x - p.x) * Math.min(1, dt * 3); p.z += (s.z - p.z) * Math.min(1, dt * 3); p.vx = p.vz = 0; p.faceYaw = s.yaw; if (A.action !== 'sitGround') A.set('sitGround'); this.sitW = 1; }
      else { A.set(null); this.sitW = 0; if (s.used === this) s.used = null; this.seat = null; p.sit = false; } return; }
    this.sitW = clamp(this.sitW + (this.sitGoal ? dt : -dt) / 0.9, 0, 1); const k = sm(this.sitW); const f = this.sitFrom || s;
    p.x = f.x + (s.x - f.x) * sm(this.sitW * 1.6); p.z = f.z + (s.z - f.z) * sm(this.sitW * 1.6); p.vx = p.vz = 0; p.faceYaw = s.yaw; if (this.sitW > 0.3) p.yaw = dampA(p.yaw, s.yaw, 8, dt);
    if (k > 0.001) A.sitIn(SEAT_CHAIR, k, this.seatMode || null); else A.standUp();
    if (!this.sitGoal && this.sitW <= 0) { A.standUp(); if (s.used === this) s.used = null; this.seat = null; this.sitFrom = null; p.sit = false; }
  }
  afterPose() { const p = this.p; if (!p) return; if (this.seat && !this.seat.ground && this.sitW > 0) p.ch.root.position.y = p.y + (this.seat.y - p.y) * sm(this.sitW); }
  interrupt(state) { // shoved, frightened, shot at: off the seat at once, out of any queue
    const p = this.p; this.scared = true; if (this.seat) { if (this.seat.used === this) this.seat.used = null; this.seat = null; this.sitW = 0; } if (p) { p.sit = false; p.ch.anim.standUp(); p.ch.anim.set(null); p.ch.face.talking = false; }
    this.site.leaveQueue(this); this.freeSpot(); this.site.stats.interrupted++; this.onInterrupt?.(state);
  }
  resume() { this.onResume ? this.onResume() : this.leave(true); }
  freeSpot() { if (this.spot && this.spot.used === this) this.spot.used = null; this.spot = null; }
  leave(hurry = false) { const p = this.p; if (!p) return; if (this.phase === 'travel') { /* still on the street, on the way here: simply walks on */ p.onArrive = null; p.keep = false; p.evIncoming = null; p.route = null; this.p = null; this.gone = true; return; } if (this.seat) this.standUp(); this.freeSpot(); this.site.leaveQueue(this); p.ch.anim.set(null); p.ch.face.talking = false; this.hurry = hurry; this.setPhase('leave', this.site.routeOut(p.x, p.z)); }
  // handed on: to the street crowd (walks on as an ordinary person) or removed (out of sight only)
  release() { const p = this.p; this.gone = true; if (!p) return; this.onRelease?.(); this.freeSpot(); this.site.leaveQueue(this); p.job = null; p.keep = false; p.evRole = null; p.faceYaw = null; if (p.ch.crowdPed === p && !p.dead) { p.state = 'walk'; p.ch.anim.set(null); this.crowd.returnToGraph(p); } this.p = null; }
  remove() { const p = this.p; this.gone = true; if (!p) return; this.onRelease?.(); this.freeSpot(); this.site.leaveQueue(this); if (this.seat && this.seat.used === this) this.seat.used = null; p.job = null; p.keep = false; if (p.ch.crowdPed === p && !p.dead) this.crowd.remove(p); this.p = null; }
  step(dt) {
    const p = this.p; this.dt = dt; if (!p || p.dead) return this.idle(); this.t += dt; this.walking = false;
    let r = this.think(dt) || null; if (!this.p) return this.idle(); this.updateSit(dt); r = this.unstick(r); this.lastX = p.x; this.lastZ = p.z; return r || this.idle();
  }
  // shared: leaving through the exit lane, then back to the street
  thinkLeave() { const r = this.follow(this.route, this.hurry ? 2.1 : 1.15); if (r) return r; this.site.stats.left++; this.release(); return null; }
}

// ------------------------------------------------------------------------------------------------ visitors
const IDLE_W = { // what a standing visitor does next (weights; scaled by role / programme)
  watch: 4, look: 1.2, phone: 1, text: 0.6, photo: 0.5, talk: 1.6, crossarms: 0.6, hips: 0.4, clap: 0.0, dance: 0.0, glance: 0.8, stretch: 0.15,
};
export class Attendee extends EvAgent {
  constructor(site, role, group = null) { super(site, role); this.group = group; this.stayT = 0; this.stay = 0; this.served = false; this.mood = Math.random(); this.lookYaw = 0; this.applauseSeen = 0; }
  // the event's programme for this person: a stand / seat / stall / counter visit in turn, then home
  plan() {
    const S = this.site, p = this.p; const kind = S.kind;
    if (kind === 'expo' && this.role !== 'spectator' && Math.random() < 0.8) { const st = S.freeStall(p.x, p.z, this); if (st) { this.spot = st; st.used = this; this.setPhase('toStall', S.routeTo(p.x, p.z, st.cx, st.cz)); return; } }
    if (S.counterQueue && !this.served && Math.random() < 0.75) { if (S.joinQueue(this)) { this.setPhase('queue', null); return; } }
    const wantSeat = S.seats.length && (this.role === 'family' || this.role === 'spectator' || this.mood < 0.55 || (S.ev.T.seats && this.mood < 0.85));
    if (wantSeat) { const s = S.freeSeat(p.x, p.z, this); if (s) { this.spot = s; s.used = this; this.setPhase('toSeat', S.routeTo(p.x, p.z, s.ax, s.az)); return; } }
    const sp = S.freeStand(p.x, p.z, this); if (sp) { this.spot = sp; sp.used = this; this.setPhase('toStand', S.routeTo(p.x, p.z, sp.x, sp.z)); return; }
    this.leave(); // nowhere left: they look in and go
  }
  think(dt) {
    const S = this.site, p = this.p, A = p.ch.anim;
    if (S.evacuating && this.phase !== 'leave' && this.phase !== 'cower') { this.goEvac(); }
    switch (this.phase) {
      case 'toGate': { const r = this.follow(this.route, 1.25); if (r) return r; // at the gate: the security check queue (or straight in)
        if (S.gateQueue && S.joinQueue(this)) { this.setPhase('queue'); return null; } this.setPhase('enter', S.routeIn(p.x, p.z)); return null; }
      case 'queue': { const i = S.queueIndex(this); if (i < 0) { this.served = true; if (S.counterQueue && this.atCounter) { this.atCounter = false; this.stay = 40 + Math.random() * 60; const sp = S.freeStand(p.x, p.z, this); if (sp) { this.spot = sp; sp.used = this; this.setPhase('toStand', S.routeTo(p.x, p.z, sp.x, sp.z)); } else this.leave(); return null; } this.setPhase('enter', S.routeIn(p.x, p.z)); return null; }
        const q = S.queueSlot(i); const r = this.moveTo(q.x, q.z, true, 0.9); if (r) { if (A.action === 'phone') A.set(null); this.walking = true; return r; }
        this.faceTo(q.yaw); if (i === 0) { if (!this.serveT) { this.serveT = S.serveTime(); A.set(null); } if ((this.serveT -= dt) <= 0) { this.serveT = 0; this.atCounter = !!S.counterQueue; S.served(this); if (this.atCounter) A.play('interact', 1.0); } else if (S.counterQueue && this.serveT < 1.6 && A.action !== 'interact') A.play('interact', 1.0); }
        else if ((this.actT -= dt) <= 0) { this.actT = 5 + Math.random() * 9; A.set(Math.random() < 0.4 ? 'phone' : Math.random() < 0.3 ? 'look' : null); }
        return null; }
      case 'enter': { const r = this.follow(this.route, 1.2); if (r) return r; this.plan(); return null; }
      case 'toStand': { const r = this.follow(this.route, 1.15); if (r) return r; this.setPhase('stand'); this.stay = this.stay || this.site.stayFor(this); this.lookYaw = this.spot ? this.spot.yaw : p.yaw; return null; }
      case 'toSeat': { const r = this.follow(this.route, 1.1); if (r) return r; const s = this.spot; if (!s || !this.site.freeAt(s.x, s.z, 0.28, this.p)) { this.freeSpot(); this.plan(); return null; } this.sitDown(s, Math.random() < 0.25 ? 'phone' : null); this.setPhase('seated'); this.stay = this.site.stayFor(this); return null; }
      case 'toStall': { const r = this.follow(this.route, 1.1); if (r) return r; this.setPhase('browse'); this.browseT = 6 + Math.random() * 12; return null; }
      case 'browse': { const st = this.spot; if (st) this.faceTo(st.cyaw); if (this.t > 0.6 && !this.browsing) { this.browsing = true; A.set(Math.random() < 0.6 ? 'browse' : 'look'); if (st && st.vendor && st.vendor.alive()) st.vendor.customer = this; }
        if (this.t > this.browseT) { this.browsing = false; A.set(null); if (st && st.vendor && st.vendor.customer === this) st.vendor.customer = null; if (st && Math.random() < 0.35) { A.play('interact', 1.0); this.site.stats.bought++; } this.freeSpot(); this.visits = (this.visits || 0) + 1;
          if (this.visits < 2 + Math.floor(this.mood * 4) && !this.site.closing) { const nx = this.site.freeStall(p.x, p.z, this); if (nx) { this.spot = nx; nx.used = this; this.setPhase('toStall', this.site.routeTo(p.x, p.z, nx.cx, nx.cz)); return null; } }
          if (Math.random() < 0.45) { const s = this.site.freeSeat(p.x, p.z, this); if (s) { this.spot = s; s.used = this; this.setPhase('toSeat', this.site.routeTo(p.x, p.z, s.ax, s.az)); return null; } } this.leave(); }
        return null; }
      case 'stand': return this.thinkStand(dt);
      case 'seated': { this.stayT += dt; const S2 = this.site; if (S2.applause > this.applauseSeen) { this.applauseSeen = S2.applause; if (Math.random() < 0.6) { p.ch.face.set('smile', 2.5); } }
        if ((this.actT -= dt) <= 0) { this.actT = 8 + Math.random() * 14; const r = Math.random(); this.seatMode = r < 0.2 ? 'phone' : null; if (r > 0.75 && this.group) p.ch.face.talking = true; else p.ch.face.talking = false; }
        if (this.stayT > this.stay || S2.closing) { this.standUp(); this.setPhase('rising'); } return null; }
      case 'rising': if (!this.seat) { this.leave(); } return null;
      case 'react': { if (this.reactAt) { this.faceAt(this.reactAt.x, this.reactAt.z); } if (this.awayTo) { const r = this.moveTo(this.awayTo.x, this.awayTo.z, true, 1.6); if (r) { this.walking = true; return r; } this.awayTo = null; }
        if (this.t > this.reactT) { A.set(null); p.ch.face.mood = 'neutral'; this.reactAt = null; if (this.site.state === 'active' && !this.scared && this.spot) { this.setPhase(this.seatAfter ? 'toSeat' : 'toStand', this.site.routeTo(p.x, p.z, this.spot.ax ?? this.spot.x, this.spot.az ?? this.spot.z)); } else this.leave(); } return null; }
      case 'cower': { if (this.t < 0.3) { A.set('cower'); p.ch.face.set('fear', 4); } if (this.t > this.reactT) { A.set(null); this.leave(true); } return null; }
      case 'leave': return this.thinkLeave();
    }
    return null;
  }
  thinkStand(dt) {
    const S = this.site, p = this.p, A = p.ch.anim; this.stayT += dt;
    const w = S.watch; const toStage = Math.atan2(w.x - p.x, w.z - p.z);
    // applause / cheer at the end of a song: most people, each after their own short delay
    if (S.applause > this.applauseSeen) { this.applauseSeen = S.applause; if (Math.random() < (this.role === 'tourist' ? 0.55 : 0.75)) { this.clapIn = 0.15 + Math.random() * 1.1; } }
    if (this.clapIn !== undefined && (this.clapIn -= dt) <= 0) { this.clapIn = undefined; A.play(Math.random() < 0.8 ? 'clap' : 'wave', 0.9 + Math.random() * 0.25); p.ch.face.set('smile', 3); this.actT = Math.max(this.actT, 2.5); }
    if ((this.actT -= dt) <= 0) {
      this.actT = 4 + Math.random() * 10; const playing = S.playing; const W = { ...IDLE_W };
      if (this.role === 'tourist') { W.photo = 2.2; W.look = 2; } if (this.role === 'family') { W.talk = 2.4; W.photo = 0.8; } if (this.role === 'spectator') { W.watch = 6; W.phone = 0.4; }
      if (!this.group) W.talk *= 0.15; if (playing && S.beat) { W.clap = this.mood > 0.4 ? 1.4 : 0.4; W.dance = S.dancey ? (this.mood > 0.6 ? 1.6 : 0.3) : 0; W.watch += 2; W.phone *= 0.5; }
      if (!playing) { W.watch *= 0.5; W.talk *= 1.5; W.phone *= 1.5; }
      let tot = 0; for (const k in W) tot += W[k]; let r = Math.random() * tot, pick = 'watch'; for (const k in W) { r -= W[k]; if (r <= 0) { pick = k; break; } }
      this.lookYaw = toStage + (Math.random() - 0.5) * 0.5;
      if (pick === 'watch') A.set(null); else if (pick === 'look' || pick === 'glance') { A.set(pick === 'look' ? 'look' : null); this.lookYaw = toStage + (Math.random() < 0.5 ? 1 : -1) * (0.8 + Math.random() * 1.2); }
      else if (pick === 'talk') { const o = this.group && this.group.find((q) => q !== this && q.alive() && Math.hypot(q.p.x - p.x, q.p.z - p.z) < 2.5); if (o) { this.lookYaw = Math.atan2(o.p.x - p.x, o.p.z - p.z); A.set('talk'); p.ch.face.talking = true; this.talkT = 2 + Math.random() * 3; } else A.set(null); }
      else if (pick === 'photo') { A.set('photo'); this.actT = 3 + Math.random() * 3; } else if (pick === 'clap') { A.play('clap', 0.85 + Math.random() * 0.3); } else if (pick === 'dance') { A.set('dance'); this.actT = 5 + Math.random() * 8; }
      else A.set(pick);
    }
    if (this.talkT !== undefined && (this.talkT -= dt) <= 0) { this.talkT = undefined; p.ch.face.talking = false; }
    this.faceTo(this.lookYaw);
    // keep the spot: drifted off it (pushed by the crowd) → step back
    const s = this.spot; if (s && Math.hypot(s.x - p.x, s.z - p.z) > 0.6) { const r = this.moveTo(s.x, s.z, true, 0.8); if (r) { this.walking = true; return r; } }
    if (this.stayT > this.stay || S.closing) { A.set(null); this.leave(); }
    return null;
  }
  // a disturbance this person noticed (CityEvents.disturb): what they do depends on how close it is, whether they saw it,
  // their role and what they are doing (seated people stand first), and whether the way out is past the trouble
  notice(d, ev) {
    const p = this.p, A = p.ch.anim; if (!p || this.phase === 'leave' || this.phase === 'toGate' || this.phase === 'queue' && d.sev < 2) return;
    const dist = Math.hypot(p.x - ev.x, p.z - ev.z); const saw = this.site.lineOfSight(p.x, p.z, ev.x, ev.z) && dist < (ev.sev >= 2 ? 45 : 22);
    if (ev.sev >= 2 && this.site.evacuating) { this.goEvac(ev); return; }
    if (dist > (ev.sev >= 2 ? 60 : 26)) return;
    const seated = !!this.seat; this.seatAfter = seated; if (seated) this.standUp();
    if (!saw && ev.sev < 2) { A.set('look'); this.lookYaw = Math.atan2(ev.x - p.x, ev.z - p.z); this.actT = 2 + Math.random() * 2; return; }
    if (dist < 7) { // too close: step back away from it (a free spot further off), then watch it warily
      const ax = p.x - ev.x, az = p.z - ev.z, l = Math.hypot(ax, az) || 1; let tx = p.x + ax / l * 4, tz = p.z + az / l * 4; if (!this.site.inside(tx, tz) || !this.site.freeAt(tx, tz, 0.4)) { tx = p.x + ax / l * 2; tz = p.z + az / l * 2; }
      this.awayTo = this.site.inside(tx, tz) ? { x: tx, z: tz } : null; }
    this.reactAt = { x: ev.x, z: ev.z }; this.reactT = 4 + Math.random() * 5; this.setPhase('react'); p.ch.face.set(this.role === 'tourist' ? 'surprise' : 'concern', 3);
    A.set(this.role === 'tourist' && Math.random() < 0.4 ? 'photo' : this.role === 'family' ? null : Math.random() < 0.3 ? 'crossarms' : 'look');
    if (this.role === 'family' && dist < 14) { this.reactT = 1.5; this.scared = true; } // families with children go
  }
  goEvac(ev = null) { // the event is suspended / cleared: out through the exit, briskly — or, if the trouble is between them and the gate, keep low behind cover until it passes
    const p = this.p; if (!p) return; const S = this.site; if (this.seat) { this.standUp(); this.seat = null; this.sitW = 0; p.sit = false; p.ch.anim.standUp(); }
    const e = S.exitPt(); if (ev && Math.hypot(ev.x - p.x, ev.z - p.z) < 25) { const tx = e.x - p.x, tz = e.z - p.z, ax = ev.x - p.x, az = ev.z - p.z; const tl = Math.hypot(tx, tz) || 1, al = Math.hypot(ax, az) || 1; if ((tx * ax + tz * az) / (tl * al) > 0.75 && al < tl) { this.reactT = 5 + Math.random() * 6; this.setPhase('cower'); return; } }
    this.leave(true);
  }
}

// ------------------------------------------------------------------------------------------------ staff (security, medics, cleaners, organisers, technicians, registration, vendors, volunteers, crew)
export class Staff extends EvAgent {
  constructor(site, role, post) { super(site, role); this.post = post; this.customer = null; this.wp = 0; this.task = null; }
  think(dt) {
    const S = this.site, p = this.p, A = p.ch.anim, q = this.post;
    if (this.task) return this.doTask(dt);
    if (this.phase === 'leave') return this.thinkLeave();
    if (this.phase === 'toPost') { const r = this.follow(this.route, this.role === 'crew' ? 1.0 : 1.2); if (r) return r; this.setPhase('post'); return null; }
    if (q.roam || this.role === 'crew') return this.roam(dt);
    // at the post
    const d = Math.hypot(q.x - p.x, q.z - p.z); if (d > 0.5) { const r = this.moveTo(q.x, q.z, true, 1.0); if (r) { this.walking = true; return r; } }
    this.faceTo(q.yaw);
    if (this.role === 'vendor') { if (this.customer && this.customer.alive() && this.customer.phase === 'browse') { if (A.action !== 'talk' && (this.actT -= dt) <= 0) { this.actT = 3 + Math.random() * 3; A.play(Math.random() < 0.5 ? 'interact' : 'talk', 1); p.ch.face.talking = Math.random() < 0.6; } } else { p.ch.face.talking = false; if ((this.actT -= dt) <= 0) { this.actT = 6 + Math.random() * 10; A.set(Math.random() < 0.3 ? 'crossarms' : Math.random() < 0.3 ? 'phone' : null); } } return null; }
    if ((this.actT -= dt) <= 0) { this.actT = 7 + Math.random() * 12; const r = Math.random();
      const act = this.role === 'security' ? (r < 0.5 ? (q.act || 'guard') : r < 0.7 ? 'look' : r < 0.85 ? 'comms' : null) : this.role === 'tech' ? (S.playing ? (r < 0.6 ? 'type' : 'watch') : (r < 0.4 ? 'type' : 'phone')) : this.role === 'medic' ? (r < 0.5 ? 'crossarms' : r < 0.75 ? 'look' : null) : this.role === 'organiser' ? (r < 0.4 ? 'comms' : r < 0.6 ? 'point' : r < 0.8 ? 'phone' : null) : this.role === 'reg' ? (r < 0.7 ? 'type' : 'talk') : this.role === 'volunteer' ? (S.counterBusy ? 'interact' : r < 0.5 ? 'talk' : null) : null;
      if (act === 'interact' || act === 'point' || act === 'comms') A.play(act, 1); else A.set(act); if (act === 'comms' && Math.random() < 0.4) S.radioChatter(p.x, p.z); }
    return null;
  }
  roam(dt) { // cleaners and set-up crew: a beat of points, a pause at each (litter picked up / a piece of kit assembled)
    const S = this.site, p = this.p, A = p.ch.anim; const pts = this.role === 'crew' ? S.workPts : S.wanderPts; if (!pts.length) return null;
    if (this.phase !== 'roamGo' && this.phase !== 'roamWork') { this.wp = Math.floor(Math.random() * pts.length); const g = pts[this.wp]; this.setPhase('roamGo', S.routeTo(p.x, p.z, g.x, g.z)); if (this.role === 'crew' && Math.random() < 0.6) A.set('carry'); }
    if (this.phase === 'roamGo') { const r = this.follow(this.route, this.role === 'crew' ? 1.0 : 0.9); if (r) return r; A.set(null); this.setPhase('roamWork'); this.workT = this.role === 'crew' ? 5 + Math.random() * 8 : 2 + Math.random() * 3; if (this.role === 'crew') { A.set(Math.random() < 0.5 ? 'interact' : 'kneel'); S.workNoise(p.x, p.z); } else A.set('kneel'); return null; }
    if (this.phase === 'roamWork') { if (this.role === 'crew' && A.action === 'interact' && (this.actT -= dt) <= 0) { this.actT = 1.5 + Math.random(); A.play('interact', 1); } if (this.t > this.workT) { A.set(null); this.wp = (this.wp + 1 + Math.floor(Math.random() * 3)) % pts.length; const g = pts[this.wp]; this.setPhase('roamGo', S.routeTo(p.x, p.z, g.x, g.z)); if (this.role === 'crew' && Math.random() < 0.5) A.set('carry'); } }
    return null;
  }
  // a job given by the event (security to a disturbance, medic to someone down)
  give(task) { this.task = task; this.task.t = 0; this.route = this.site.routeTo(this.p.x, this.p.z, task.x, task.z); this.p.ch.anim.set(null); }
  doTask(dt) {
    const T = this.task, p = this.p, A = p.ch.anim; T.t += dt;
    if (T.kind === 'respond') { // security: hurry to it, stop at a few metres, signal / talk people back, radio it in
      const d = Math.hypot(T.x - p.x, T.z - p.z); if (d > T.stop) { const r = this.follow(this.route, 2.2) || this.moveTo(T.x, T.z, false, 2.2); if (r && T.t < 25) { this.walking = true; return r; } }
      this.faceAt(T.x, T.z); if (!T.signalled) { T.signalled = true; A.play(Math.random() < 0.5 ? 'signal' : 'point', 1); this.site.megaphone(p.x, p.z); }
      if (T.t > T.dur) { this.task = null; A.set(null); this.setPhase('toPost', this.site.routeTo(p.x, p.z, this.post.x, this.post.z)); } return null; }
    if (T.kind === 'aid') { // first aid: to the person down, kneel beside them until the ambulance crew is there / they are up
      const v = T.p; const gone = !v || v.recycle || !v.ch.root.parent || (v.state !== 'down' && !v.dead);
      const d = Math.hypot(T.x - p.x, T.z - p.z); if (!gone && d > 1.1) { const r = this.follow(this.route, 2.0) || this.moveTo(T.x, T.z, false, 2.0); if (r && T.t < 40) { this.walking = true; return r; } }
      if (!gone) { this.faceAt(v.x, v.z); if (A.action !== 'kneel') A.set('kneel'); }
      if (gone || T.t > 120) { this.task = null; A.set(null); this.setPhase('toPost', this.site.routeTo(p.x, p.z, this.post.x, this.post.z)); } return null; }
    this.task = null; return null;
  }
  onResume() { this.task = null; this.setPhase('toPost', this.site.routeTo(this.p.x, this.p.z, this.post.x, this.post.z)); }
}

// ------------------------------------------------------------------------------------------------ performers (plain characters on the deck)
export class Performer {
  constructor(site, spec, mark, style) { this.site = site; this.mark = mark; this.style = style; this.ch = new Character(spec); this.ch.root.position.set(mark.ox, mark.y, mark.oz); this.ch.root.rotation.set(0, mark.yaw, 0); site.scene.add(this.ch.root); this.x = mark.ox; this.z = mark.oz; this.yaw = mark.yaw; this.state = 'walkOn'; this.t = 0; this.k = Math.random() * 10; this.act = null; for (let i = 0; i < 3; i++) this.ch.anim.update(0.1, 0, 0); }
  update(dt, n) {
    const m = this.mark, ch = this.ch, A = ch.anim; this.t += dt; let speed = 0;
    if (this.state === 'walkOn' || this.state === 'walkOff') { const tx = this.state === 'walkOn' ? m.x : m.ox, tz = this.state === 'walkOn' ? m.z : m.oz; const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
      if (d < 0.08) { if (this.state === 'walkOff') { this.state = 'off'; return; } this.state = 'on'; this.t = 0; } else { const v = Math.min(1.1, d * 2); this.x += dx / d * v * dt; this.z += dz / d * v * dt; this.yaw = dampA(this.yaw, Math.atan2(dx, dz), 8, dt); speed = v; } }
    if (this.state === 'on') { this.yaw = dampA(this.yaw, m.yaw, 5, dt); const S = this.site; const want = S.playing ? (this.style === 'dance' ? 'dance' : this.style === 'choir' ? 'talk' : m.mic ? 'talk' : (Math.sin(this.t * 0.4 + this.k) > 0 ? 'clap' : 'dance')) : (S.applauseT < 4 ? 'wave' : null);
      if (want !== this.act) { this.act = want; if (want === 'wave') A.play('wave', 1); else A.set(want); } ch.face.talking = S.playing && (m.mic || this.style === 'choir'); }
    ch.root.position.set(this.x, m.y, this.z); ch.root.rotation.y = this.yaw; A.update(dt * n, speed, 0);
  }
  walkOff() { if (this.state !== 'off') { this.state = 'walkOff'; this.ch.anim.set(null); this.ch.face.talking = false; } }
  dispose() { this.ch.root.parent?.remove(this.ch.root); this.ch.dispose(); }
}
