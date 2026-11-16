// Colombo Fort station life (54th request): the people of the station (layout: FortStationData.js, building: FortStation.js).
//  · passengers come in off Olcott Mawatha, queue at the open ticket windows (one queue per railed lane), buy, walk through to
//    platform 1 and wait there — standing, or on the platform benches — until the train is in; then they walk to its doors and
//    step up into it, find a seat (or stand in the vestibule when the seats near the door are taken)
//  · passengers ride in the train (seated in the real seats of the DMU cars, parented to the car so they move with it); at the
//    Fort stop some stand up, walk down the aisle to a platform-side door, step down onto the platform and walk out through the
//    booking hall to the street, where the ordinary crowd takes them over
//  · ticket clerks sit on their high stools behind the windows; the windows with a queue are served
//  · shoulder vendors walk a beat through platform 1 and the hall with their wares on the right shoulder (isso wade in a glass
//    box, kadala in a basket, a crate of cold drinks), call out, stop for and sell to waiting passengers — and to the player
//  · the announcer (a woman, seated at the desk in the announcer's room) makes the announcements: SoundBank slots
//    station.announce1..5 (the `sounds` window). Inside her room you hear her directly; anywhere else in or around the station
//    the announcement comes out of the PA horn speakers (each speaker its own distance, delay and horn-speaker band)
// Station people are crowd people (Crowd.js 'job' state, like the filling-station attendants): they react to gunfire, can be
// shoved or hurt, and a frightened passenger leaves the station. The clerks (inside the walled-off clerks' strip) and the riders
// in the train are plain characters run here. Everything exists only while the player is near the station.
import * as THREE from 'three';
import * as L from './Layout.js';
import * as R from './Railway.js';
import { FORT, inAnnouncerRoom } from './FortStationData.js';
import { Character } from '../actors/Character.js';
import { makeAppearance } from '../actors/Appearance.js';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { CAR_W, FLOOR_Y } from '../vehicles/TrainModels.js';
import { SoundBank as SB } from '../audio/SoundBank.js';
import { Audio } from '../audio/Audio.js';
import { Voices } from '../audio/Voices.js';
import { RNG } from '../core/rng.js';
// someone put down on the station's floor (the halls and platform 1 stand 1 m above the street — Crowd.place() looks for the
// ground from street level and would leave them standing inside the platform)
const onFloor = (x, z) => x > -118 && x < 31 && z > -649.4 && z < -613.6;
function setFloor(col, p) { if (!col) return; p.y = col.groundAt(p.x, p.z, onFloor(p.x, p.z) ? FORT.FL + 0.05 : 0.2); p.ch.root.position.y = p.y; }

const F = FORT, FL = F.FL;
const CX = -35, CZ = -628; // middle of the station
export const ACTIVE_R = 165, DROP_R = 215, TRAIN_R = 240;
const STOP_NAME = 'Colombo Fort';
const HW = CAR_W / 2, AISLE_X = 0.22;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const dampA = (a, b, k, dt) => a + wrapA(b - a) * Math.min(1, k * dt);

// seat poses (Seating.js applySeatPose; the character's root sits on the cushion)
const SEAT_TRAIN = { x: 0, y: 0, z: 0, floor: -0.44, fz: 0.42, fx: 0.13, lean: -0.08, hands: 'lap', kind: 'sit' };
const SEAT_BENCH = { x: 0, y: 0, z: 0, floor: -0.45, fz: 0.46, fx: 0.13, lean: -0.1, hands: 'lap', kind: 'sit' };
const SEAT_STOOL = { x: 0, y: 0, z: 0, floor: -0.43, fz: 0.3, fx: 0.12, lean: 0.05, hands: 'lap', kind: 'sit' }; // clerk: high stool, feet on its ring
const SEAT_ANN = { x: 0, y: 0, z: 0, floor: -0.47, fz: 0.4, fx: 0.12, lean: 0.08, hands: 'lap', kind: 'sit' }; // leaning a little to the gooseneck mic

// what the vendors sell (the player pays with story.pay; food heals a little, a cold drink restores stamina)
export const WARES = [
  { id: 'wade', name: 'Isso wade', price: 100, heal: 10, prop: 'box', calls: ['Isso wade! Hot isso wade!', 'Wade, wade, isso wade!', 'Fresh isso wade, hot hot!'] },
  { id: 'kadala', name: 'Hot kadala (chickpeas)', price: 80, heal: 8, prop: 'basket', calls: ['Kadala! Hot kadala!', 'Kadala, kadala — spicy kadala!', 'Hot kadala, ten minutes fresh!'] },
  { id: 'drink', name: 'Cold drink', price: 150, stamina: true, prop: 'crate', calls: ['Cold drinks! Water, soda!', 'Wathura! Cold water, cold drinks!', 'Ice cold — water, Necto, soda!'] },
];
// the announcements (SoundBank slots station.announce1..5); the text is shown when the slot has no recording yet
export const ANNOUNCE = [
  { slot: 1, when: 'approaching', text: (d) => `Your attention please. The train to ${d} is now approaching platform number one. Please stand behind the yellow line.` },
  { slot: 2, when: 'arrived', text: (d) => `The train to ${d} has arrived at platform number one.` },
  { slot: 3, when: 'departing', text: (d) => `The train to ${d} is about to depart from platform number one. Please stand clear of the doors.` },
  { slot: 4, when: 'general', text: () => 'Passengers are kindly requested not to leave their luggage unattended. Please report any unattended item to the station staff.' },
  { slot: 5, when: 'general', text: () => 'Season tickets and platform tickets are issued at counter number eight. Intercity reservations: please use the reservations office.' },
];

// staff looks (built during loading by Game.js so nobody is generated mid-game)
const STAFF = { clerks: [[54101, 'm_office_mid'], [54102, 'f_bank_saree'], [54103, 'm_office_young'], [54104, 'f_office_young'], [54105, 'm_office_mid']], announcer: [54110, 'f_bank_saree'], vendors: [[54120, 'm_vendor_sarong'], [54121, 'm_vendor_young'], [54122, 'm_vendor_sarong']] };
const specCache = new Map();
const staffSpec = ([seed, preset]) => { const k = seed + preset; if (!specCache.has(k)) specCache.set(k, makeAppearance(seed, { preset })); return specCache.get(k); };
export function stationSpecs() { return [...STAFF.clerks, STAFF.announcer, ...STAFF.vendors].map(staffSpec); }
// presets that don't take the train here as passengers (uniformed / on-shift street trades, the station's own vendors)
const NOT_PAX = new Set(['m_security', 'f_security', 'm_cmc_cleaner', 'f_cmc_cleaner', 'm_road_crew', 'f_road_flagger', 'm_parking', 'm_kottu_cook', 'm_vendor_sarong', 'm_vendor_young', 'f_vendor', 'f_food_stall', 'm_cart_puller', 'm_fitness', 'f_fitness', 'm_gym', 'f_gym']);

// ---------------------------------------------------------------- shoulder props (vertex-coloured, the shared MAT.paint)
// chest-bone space: +y up, −x = the right side, +z forward; the right shoulder joint is at about (−0.185, 0.143, 0)
let PROPS = null;
function propGeometries() {
  if (PROPS) return PROPS;
  const out = {};
  { const b = new MeshBuilder(); // isso wade: a wooden-framed glass box, the wade stacked inside, a folded paper pad on top
    const x = -0.215, y = 0.235, w = 0.2, h = 0.2, d = 0.42; const wood = [0.42, 0.27, 0.15], gl = [0.78, 0.86, 0.88];
    b.box(x, y + 0.012, 0, w, 0.024, d, { col: wood, bottom: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(x + sx * (w / 2 - 0.01), y + h / 2, sz * (d / 2 - 0.01), 0.02, h, 0.02, { col: wood });
    b.box(x, y + h - 0.01, 0, w, 0.02, d, { col: wood });
    for (const sx of [-1, 1]) b.box(x + sx * (w / 2 - 0.004), y + 0.11, 0, 0.006, 0.16, d - 0.03, { col: gl });
    for (const sz of [-1, 1]) b.box(x, y + 0.11, sz * (d / 2 - 0.004), w - 0.03, 0.16, 0.006, { col: gl });
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) { const cz = -0.15 + k * 0.1, cx = x + (r ? 0.045 : -0.045); b.cylinder(cx, y + 0.026 + r * 0.004, cz, 0.04, 0.04, 0.022, 8, { col: [0.72, 0.45, 0.17] }); b.box(cx, y + 0.05 + r * 0.004, cz, 0.035, 0.012, 0.018, { col: [0.86, 0.36, 0.22] }); } // golden wade, a prawn on each
    for (let k = 0; k < 3; k++) b.cylinder(x + 0.03 - k * 0.03, y + 0.09, 0.05 * (k - 1), 0.038, 0.038, 0.02, 8, { col: [0.68, 0.42, 0.16] });
    b.box(x, y + h + 0.012, -0.08, 0.15, 0.012, 0.18, { col: [0.93, 0.92, 0.86] });
    out.box = b.build(); }
  { const b = new MeshBuilder(); // kadala: a round cane basket, the heap of chickpeas, paper cones stood in the rim
    const x = -0.225, y = 0.235; const cane = [0.66, 0.52, 0.32];
    b.cylinder(x, y, 0, 0.16, 0.19, 0.13, 12, { col: cane }); b.cylinder(x, y + 0.125, 0, 0.195, 0.195, 0.018, 12, { col: [0.55, 0.42, 0.25], caps: false });
    b.cylinder(x, y + 0.13, 0, 0.17, 0.05, 0.07, 10, { col: [0.78, 0.6, 0.3] }); // the heap
    for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.4; b.cylinder(x + Math.cos(a) * 0.16, y + 0.12, Math.sin(a) * 0.16, 0.022, 0.004, 0.11, 6, { col: [0.95, 0.93, 0.85] }); }
    out.basket = b.build(); }
  { const b = new MeshBuilder(); // cold drinks: a red plastic crate of 2 × 4 bottles
    const x = -0.215, y = 0.235, w = 0.2, d = 0.4, h = 0.16; const red = [0.7, 0.1, 0.08];
    b.box(x, y + 0.008, 0, w, 0.016, d, { col: red, bottom: true }); for (const sx of [-1, 1]) b.box(x + sx * (w / 2 - 0.008), y + h / 2, 0, 0.016, h, d, { col: red }); for (const sz of [-1, 1]) b.box(x, y + h / 2, sz * (d / 2 - 0.008), w, h, 0.016, { col: red });
    for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) { const cx = x + (r ? 0.048 : -0.048), cz = -0.15 + k * 0.1; const col = [[0.2, 0.45, 0.25], [0.85, 0.85, 0.82], [0.55, 0.25, 0.1], [0.75, 0.82, 0.86]][(r + k) % 4];
      b.cylinder(cx, y + 0.016, cz, 0.032, 0.032, 0.2, 8, { col }); b.cylinder(cx, y + 0.216, cz, 0.032, 0.013, 0.05, 8, { col }); b.cylinder(cx, y + 0.266, cz, 0.014, 0.014, 0.016, 6, { col: [0.85, 0.75, 0.2] }); }
    out.crate = b.build(); }
  return (PROPS = out);
}
const HAND_ON_LOAD = { box: new THREE.Vector3(-0.355, 0.33, 0.06), basket: new THREE.Vector3(-0.39, 0.32, 0.05), crate: new THREE.Vector3(-0.355, 0.33, 0.06) }; // chest space: the right hand on the outer side of the load
const ELBOW_OUT = new THREE.Vector3(-1, -0.7, 0.25).normalize();

// ---------------------------------------------------------------- one person of the station (a crowd 'job' person)
class Agent {
  constructor(sys, role) {
    this.sys = sys; this.role = role; this.p = null; this.phase = 'idle'; this.t = 0; this.route = null; this.stuckT = 0; this.lastX = 0; this.lastZ = 0; this.walking = false;
    this.seat = null; this.seatPose = null; this.sitW = 0; this.sitGoal = 0; this.sitFrom = null; this.gone = false; this.scared = false;
    this.job = { step: (p, dt, ctx, lod) => this.step(dt, lod), post: (p, lod, posed) => this.post(lod, posed), interrupt: (p, state) => this.interrupt(state), resume: () => this.resume() };
  }
  spawn(sp, x, z, yaw) {
    const C = this.sys.crowd; const p = C.makePed(sp, x, z, this.sys.node);
    Object.assign(p, { x, z, yaw, state: 'job', job: this.job, keep: true, umbrella: false, umbrellaOpen: false, jog: false, pace: 1.2, target: null, edge: null, route: null, stationRole: this.role });
    C.place(p); setFloor(this.sys.collision, p); this.p = p; this.lastX = x; this.lastZ = z; return p;
  }
  adopt(p) { Object.assign(p, { state: 'job', job: this.job, keep: true, umbrella: false, jog: false, pace: 1.2, stationRole: this.role }); setFloor(this.sys.collision, p); this.p = p; this.lastX = p.x; this.lastZ = p.z; }
  alive() { const p = this.p; return !!(p && !p.dead && p.ch.crowdPed === p); }
  setPhase(ph, route = null) { this.phase = ph; this.t = 0; this.route = route; this.stuckT = 0; this.bestD = undefined; this.stallT = 0; }
  moveTo(x, z, final = true, speed = 1.25) {
    const p = this.p, d = Math.hypot(x - p.x, z - p.z); p.faceYaw = null;
    if (d < (final ? 0.16 : 0.45)) return null;
    return { desired: final ? Math.min(speed, 0.3 + d * 1.1) : speed, tx: x, tz: z, avoid: d > 1.2, accel: 3.0 };
  }
  follow(route, speed) {
    while (route && route.length) { const [x, z] = route[0]; const last = route.length === 1; let r = this.moveTo(x, z, last, speed);
      if (r && last) { const d = Math.hypot(x - this.p.x, z - this.p.z); if (d < (this.bestD ?? 1e9) - 0.03) { this.bestD = d; this.stallT = 0; } else this.stallT = (this.stallT || 0) + this.dt; if (d < 0.7 && this.stallT > 0.8) r = null; }
      if (r) { this.walking = true; return r; } route.shift(); this.bestD = undefined; this.stallT = 0; }
    return null;
  }
  faceTo(yaw) { this.p.faceYaw = yaw; return Math.abs(wrapA(yaw - this.p.yaw)) < 0.25; }
  idle() { return { desired: 0, tx: null, tz: null, avoid: false }; }
  // blocked while walking: a step aside; still stuck and out of sight → on to the next waypoint
  unstick(r) {
    const p = this.p; if (!r || !this.walking) { this.stuckT = Math.max(0, this.stuckT - this.dt * 2); return r; }
    if (Math.hypot(p.x - this.lastX, p.z - this.lastZ) < 0.15 * this.dt) this.stuckT += this.dt; else this.stuckT = Math.max(0, this.stuckT - this.dt * 2);
    if (this.stuckT > 1.4 && this.stuckT < 3) { r.tx = p.x + Math.cos(p.yaw) * 1.1 + (r.tx - p.x) * 0.3; r.tz = p.z - Math.sin(p.yaw) * 1.1 + (r.tz - p.z) * 0.3; }
    else if (this.stuckT > 6 && this.route && this.route.length && !this.sys.crowd.visible(p)) { const [x, z] = this.route[0]; p.x = x; p.z = z; this.sys.crowd.place(p); this.stuckT = 0; }
    return r;
  }
  // sitting down on / getting up from a seat {x, z, y, yaw} (approached from its front)
  sitDown(seat, pose) { this.seat = seat; this.seatPose = pose; this.sitGoal = 1; this.sitFrom = { x: this.p.x, z: this.p.z }; this.p.sit = true; }
  standUp() { this.sitGoal = 0; }
  updateSit(dt) {
    const p = this.p, A = p.ch.anim; if (!this.seat) return;
    this.sitW = clamp(this.sitW + (this.sitGoal ? dt : -dt) / 0.9, 0, 1); const k = sm(this.sitW);
    const s = this.seat, f = this.sitFrom || s; p.x = f.x + (s.x - f.x) * sm(this.sitW * 1.6); p.z = f.z + (s.z - f.z) * sm(this.sitW * 1.6); p.vx = p.vz = 0; p.faceYaw = s.yaw; if (this.sitW > 0.3) p.yaw = dampA(p.yaw, s.yaw, 8, dt);
    if (k > 0.001) A.sitIn(this.seatPose, k, this.seatMode || null); else { A.standUp(); }
    if (!this.sitGoal && this.sitW <= 0) { A.standUp(); if (s.used === this) s.used = null; this.seat = null; this.sitFrom = null; p.sit = false; }
  }
  post() { const p = this.p; if (this.seat && this.sitW > 0) p.ch.root.position.y = p.y + (this.seat.y - p.y) * sm(this.sitW); }
  interrupt(state) { // shoved, frightened, shot at: off the seat at once, out of any queue / door
    const p = this.p; this.scared = true; if (this.seat) { if (this.seat.used === this) this.seat.used = null; this.seat = null; this.sitW = 0; } if (p) { p.sit = false; p.ch.anim.standUp(); p.ch.face.talking = false; }
    this.sys.leaveQueue(this); this.door = null; this.onInterrupt?.(state);
  }
  resume() { this.onResume ? this.onResume() : this.setPhase('leave', this.sys.routeOut(this.p.x, this.p.z)); }
  // handed on: to the street crowd (walks on as an ordinary person) or removed
  release() { const p = this.p; this.gone = true; if (!p) return; this.onRelease?.(); p.job = null; p.keep = false; p.stationRole = null; if (p.ch.crowdPed === p && !p.dead) { p.state = 'walk'; this.sys.crowd.returnToGraph(p); } this.p = null; }
  remove() { const p = this.p; this.gone = true; if (!p) return; this.onRelease?.(); p.job = null; p.keep = false; if (p.ch.crowdPed === p && !p.dead) this.sys.crowd.remove(p); this.p = null; }
  step(dt) {
    const p = this.p; this.dt = dt; if (!p || p.dead) return this.idle(); this.t += dt; this.walking = false;
    let r = this.think(dt) || null; if (!this.p) return this.idle(); /* handed on / stepped into the train */ this.updateSit(dt); r = this.unstick(r); this.lastX = p.x; this.lastZ = p.z; return r || this.idle();
  }
}

// ---------------------------------------------------------------- passengers on foot
class Passenger extends Agent {
  constructor(sys) { super(sys, 'pax'); this.win = null; this.spot = null; this.waitT = 0; this.bought = false; this.door = null; this.actT = 0; }
  think(dt) {
    const S = this.sys, p = this.p, A = p.ch.anim;
    switch (this.phase) {
      case 'toQueue': case 'queue': { // move up the lane as the people in front are served
        const q = S.queues[this.win]; const i = q ? q.indexOf(this) : -1; if (i < 0) { this.setPhase('toPlatform', S.routeToPlatform(p.x, p.z)); return null; }
        if (this.route && this.route.length) { const r = this.follow(this.route, 1.25); if (r) return r; }
        this.phase = 'queue'; const [x, z] = S.queueSlot(this.win, i); const r = this.moveTo(x, z, true, 0.9); if (r) { if (A.action === 'phone') A.set(null); return r; }
        this.faceTo(-Math.PI / 2);
        if (i === 0) { A.set(null); this.setPhase('buy'); this.buyT = 4 + Math.random() * 4; return null; }
        if ((this.actT -= dt) <= 0) { this.actT = 6 + Math.random() * 8; A.set(Math.random() < 0.35 ? 'phone' : null); }
        return null; }
      case 'buy': { // at the window: asks, pays, takes the ticket and the change
        this.faceTo(-Math.PI / 2); p.ch.face.talking = this.t < 1.6 || (this.t > 3 && this.t < 3.6); if (this.t > 1.8 && this.t < 2.6 && A.action !== 'interact') A.play('interact', 1.0);
        S.serving(this.win, this.t);
        if (this.t > this.buyT) { p.ch.face.talking = false; S.leaveQueue(this); this.bought = true; S.stats.bought++; this.setPhase('toPlatform', S.routeToPlatform(p.x, p.z, this.win)); }
        return null; }
      case 'toPlatform': { const r = this.follow(this.route, 1.25); if (r) return r; this.pickSpot(); return null; }
      case 'toSpot': { const r = this.follow(this.route, 1.15); if (r) return r;
        if (this.spot && this.spot.seat) { this.sitDown(this.spot.seat, SEAT_BENCH); this.seatMode = Math.random() < 0.3 ? 'phone' : null; }
        this.setPhase('wait'); this.waitYaw = (this.spot && this.spot.seat ? this.spot.seat.yaw : (Math.random() - 0.5) * 1.2); return null; }
      case 'wait': {
        this.waitT += dt; if (!this.seat) { this.faceTo(this.waitYaw); if ((this.actT -= dt) <= 0) { this.actT = 7 + Math.random() * 12; const r = Math.random(); A.set(r < 0.3 ? 'phone' : r < 0.45 ? 'text' : r < 0.6 ? 'look' : null); if (Math.random() < 0.3) this.waitYaw = (Math.random() - 0.5) * 1.4; } }
        if (this.buying) return null; // a vendor is serving them
        const d = S.boardingDoor(this); if (d) { A.set(null); this.door = d; if (this.seat) this.standUp(); this.setPhase('toDoor'); return null; }
        if (this.waitT > 480 && !S.trainSoon()) { if (this.seat) this.standUp(); this.freeSpot(); this.setPhase('leave', S.routeOut(p.x, p.z)); } // gave up
        return null; }
      case 'toDoor': {
        if (this.seat) return null; // getting up first
        const d = this.door; if (!S.doorOpen(d)) { this.door = null; this.setPhase('back'); return null; }
        if (!this.route) { this.freeSpot(); this.route = [...S.platformPath(p.x, p.z, d.x + (Math.random() - 0.5) * 0.5, F.edgeZ - 1.35)]; }
        const r = this.follow(this.route, 1.3); if (r) return r;
        if (d.busy > S.t) { this.faceTo(0); return null; } // someone stepping off here: let them out first
        const r2 = this.moveTo(d.x, d.pz, true, 0.9); if (r2) return r2;
        if (this.faceTo(0)) S.board(this, d); return null; }
      case 'back': { if (!this.route) { this.pickSpot(); return null; } return this.follow(this.route, 1.1); }
      case 'leave': { const r = this.follow(this.route, 1.25); if (r) return r; S.stats.handedOver++; this.release(); return null; }
      default: return null;
    }
  }
  pickSpot() { const s = this.sys.freeSpot(this.p.x, Math.random() < 0.45); if (!s) { this.setPhase('leave', this.sys.routeOut(this.p.x, this.p.z)); return; } this.spot = s; s.used = this; if (s.seat) s.seat.used = this; this.setPhase('toSpot', [...this.sys.platformPath(this.p.x, this.p.z, s.ax, s.az)]); }
  freeSpot() { const s = this.spot; if (s) { if (s.used === this) s.used = null; if (s.seat && s.seat.used === this && !this.seat) s.seat.used = null; } this.spot = null; }
  onInterrupt() { this.freeSpot(); this.buying = false; }
  onResume() { this.setPhase('leave', this.sys.routeOut(this.p.x, this.p.z)); }
  onRelease() { this.freeSpot(); this.sys.leaveQueue(this); }
}

// ---------------------------------------------------------------- shoulder vendors
class Vendor extends Agent {
  constructor(sys, idx) { super(sys, 'vendor'); this.idx = idx; this.ware = WARES[idx % WARES.length]; this.wp = (idx * 4) % F.vendorLoop.length; this.pause = 0; this.callT = 4 + idx * 3; this.prop = null; this.customer = null; }
  spawnVendor() {
    const [x, z] = F.vendorLoop[this.wp]; const p = this.spawn(staffSpec(STAFF.vendors[this.idx]), x, z, 0); p.pace = 1.0;
    const m = new THREE.Mesh(propGeometries()[this.ware.prop], MAT.paint); m.castShadow = true; m.name = 'vendorLoad'; p.ch.bones.chest.add(m); this.prop = m; this.hold(true); this.setPhase('walk');
  }
  hold(on) { const A = this.p && this.p.ch.anim; if (!A) return; A.ik = on ? { R: HAND_ON_LOAD[this.ware.prop], qR: null, wR: 1, poleR: ELBOW_OUT, L: null } : null; }
  think(dt) {
    const S = this.sys, p = this.p, A = p.ch.anim;
    if (this.customer === 'player') { const P = S.player; this.faceTo(Math.atan2(P.x - p.x, P.z - p.z)); if ((this.custT -= dt) <= 0) this.customer = null; return null; }
    switch (this.phase) {
      case 'walk': {
        const [x, z] = F.vendorLoop[this.wp]; const r = this.moveTo(x, z, false, 1.0); if (r) { this.route = [[x, z]]; this.walking = true; this.call(dt); this.lookForBuyer(); return r; }
        this.wp = (this.wp + 1) % F.vendorLoop.length; if (Math.random() < 0.35) this.setPhase('pause'); return null; }
      case 'pause': { this.call(dt * 2); if (this.t > 2 + (this.idx % 3)) this.setPhase('walk'); return null; }
      case 'sell': { // to a waiting passenger: stop, hand over, take the money
        const c = this.customer; if (!c || !c.alive() || c.phase !== 'wait') { this.endSale(); return null; }
        const cp = c.p; this.faceTo(Math.atan2(cp.x - p.x, cp.z - p.z)); if (!c.seat) c.faceTo(Math.atan2(p.x - cp.x, p.z - cp.z));
        p.ch.face.talking = this.t < 1.2; cp.ch.face.talking = this.t > 1.2 && this.t < 2.2; if (this.t > 2.2 && this.t < 2.4 && !c.seat && cp.ch.anim.action !== 'interact') cp.ch.anim.play('interact', 1.2);
        if (this.t > 4.5) { S.stats.npcSales++; this.endSale(); } return null; }
      default: this.setPhase('walk'); return null;
    }
  }
  endSale() { const c = this.customer; if (c && c !== 'player') { c.buying = false; c.bought = true; if (c.p) c.p.ch.face.talking = false; } this.customer = null; if (this.p) this.p.ch.face.talking = false; this.setPhase('walk'); }
  lookForBuyer() {
    if ((this.buyCd = (this.buyCd || 0) - this.dt) > 0) return; this.buyCd = 2.5; const p = this.p;
    for (const a of this.sys.pax) { if (!a.alive() || a.phase !== 'wait' || a.buying || a.vendorSeen?.has(this.idx)) continue; const d = Math.hypot(a.p.x - p.x, a.p.z - p.z); if (d > 2.2) continue;
      (a.vendorSeen ||= new Set()).add(this.idx); if (Math.random() < 0.35) { a.buying = true; this.customer = a; this.setPhase('sell'); return; } }
  }
  call(dt) {
    if ((this.callT -= dt) > 0) return; this.callT = 9 + Math.random() * 9; const S = this.sys, p = this.p, P = S.player; if (!P) return; const d = Math.hypot(P.x - p.x, P.z - p.z); if (d > 32) return;
    const said = Voices.say(p.sp, 'sell', p.x, p.z, p, 'vendor'); if (said) { p.ch.face.talking = true; p.talkFor = said; }
    if (d < 9 && S.t > S.subT) { S.subT = S.t + 12; S.g.hud?.subtitle('Vendor', this.ware.calls[Math.floor(Math.random() * this.ware.calls.length)], '', 2.4); }
  }
  onInterrupt(state) { if (this.customer && this.customer !== 'player') this.customer.buying = false; this.customer = null; if (state === 'down') { this.hold(false); if (this.prop) this.prop.visible = false; } } // keeps hold of the load when running off; knocked down, it is lost
  onResume() { if (this.prop) this.prop.visible = true; this.hold(true); this.setPhase('walk'); }
  onRelease() { this.hold(false); if (this.prop) { this.prop.parent?.remove(this.prop); this.prop = null; } }
}

// ---------------------------------------------------------------- the announcer
class Announcer extends Agent {
  constructor(sys) { super(sys, 'announcer'); this.talkT = 0; }
  spawnAnn() { const c = F.ann.chair; const p = this.spawn(staffSpec(STAFF.announcer), c.x, c.z - 0.6, c.yaw); this.chair = { x: c.x, z: c.z, y: FL + 0.47, yaw: c.yaw }; this.setPhase('toChair'); return p; }
  think(dt) {
    const c = this.chair, p = this.p;
    if (this.phase === 'toChair') { if (!this.route) this.route = [[c.x, c.z - 0.6]]; /* behind the chair: the desk is in front of it */ const r = this.follow(this.route, 0.9); if (r) return r; this.sitDown(c, SEAT_ANN); this.setPhase('seated'); return null; }
    if (this.phase === 'seated') { this.talkT -= dt; p.ch.face.talking = this.talkT > 0; return null; }
    if (this.phase === 'leave') { const r = this.follow(this.route, 1.2); if (r) return r; this.setPhase('toChair'); return null; }
    return null;
  }
  speak(dur) { this.talkT = dur; }
  onResume() { this.setPhase('toChair'); }
}

// ---------------------------------------------------------------- the station
export class StationLife {
  constructor(g, opts = {}) {
    this.g = g; this.crowd = opts.crowd || g.crowd; this.trains = opts.trains || g.trains; this.collision = opts.collision || g.collision; this.scene = opts.scene || g.scene;
    this.rng = new RNG(5454); this.t = 0; this.active = false; this.subT = 0; this.frame = 0;
    this.stats = { arrivals: 0, bought: 0, boarded: 0, alighted: 0, handedOver: 0, npcSales: 0, playerSales: 0, announcements: 0, standing: 0 };
    this.node = 0; { let bd = Infinity; const N = L.pedNodes || []; for (let i = 0; i < N.length; i++) { const d = (N[i].x - CX) ** 2 + (N[i].z - (F.street[0].z - 3)) ** 2; if (d < bd) { bd = d; this.node = i; } } }
    this.stop = R.STOPS.find((s) => s.name === STOP_NAME) || null;
    this.pax = []; this.vendors = [0, 1, 2].map((i) => new Vendor(this, i)); this.announcer = new Announcer(this); this.clerks = []; this.riders = []; this.seatsUsed = new Map();
    this.queues = F.windows.map(() => []);
    this.spawnCd = 2; this.buildCd = 0; this.annQ = []; this.annT = 40; this.lastAnn = -1e9; this.annFlags = {}; this.dwellKey = null; this.doors = [];
    this.buildSpots();
  }
  // ---- places on platform 1: free standing spots + the bench seats (each with its approach point), all checked against the
  //      station's colliders (and a clear straight walk to it from the hall's arches)
  buildSpots() {
    const col = this.collision, y = FL; this.spots = [];
    // clear = nothing in the way from knee to head height (as Collision.resolveCircle moves people; Collision.blocked() is 2-D
    // and would count the footbridge parapets 6 m up as walls): the underside of the bridge stairs counts — nobody ducks
    const head = (x, z, r, y = FL) => { for (const c of col.query(x - r, z - r, x + r, z + r)) { if (!(x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1)) continue; const y0 = c.y0 || 0; if (y0 + c.h > y + 0.4 && y0 < y + 2.1) return false; } return true; };
    const clear = (x, z, r = 0.38) => !col || head(x, z, r);
    const lineClear = (ax, az, bx, bz) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4); for (let k = 1; k <= n; k++) if (!clear(ax + (bx - ax) * k / n, az + (bz - az) * k / n, 0.3)) return false; return true; };
    this.lineClear = lineClear; this.headClear = head;
    for (let x = -70; x <= 10; x += 1.7) for (let z = -624.4; z <= -617.2; z += 1.45) { const jx = x + (Math.abs(x * 7 + z * 3) % 1) * 0.5, jz = z; if (!clear(jx, jz, 0.45)) continue; const a = this.archFor(jx); if (!this.platformPath(a, -625.6, jx, jz, true)) continue; this.spots.push({ x: jx, z: jz, ax: jx, az: jz, used: null, seat: null }); }
    for (const b of F.benches) if (b.where === 'p1' && b.x > -72 && b.x < 14) { const ax = b.x, az = b.z + 0.62; if (!clear(ax, az, 0.3) || !this.platformPath(this.archFor(ax), -625.6, ax, az, true)) continue; const seat = { x: b.x, z: b.z, y: b.y, yaw: b.yaw, used: null }; this.spots.push({ x: b.x, z: b.z, ax, az, used: null, seat }); }
  }
  archFor(x) { return x < -42.5 ? -51 : x < -27.5 ? -35 : -19.6; }
  entranceFor(x) { return x < -43.5 ? 1 : x < -26.5 ? 0 : 2; } // F.entrances / street / inside index
  colX(e) { return e === 1 ? -51 : e === 2 ? -19.6 : -35; }
  // ---- routes (waypoint lists, [x, z])
  routeIn(e) { return [[F.inside[e].x, F.inside[e].z], [this.colX(e), -645.6]]; } // street → top of the entrance steps → the hall
  routeToQueue(e, w) { const z = F.windows[w].z; return [...this.routeIn(e), [-51, -645.6], [-51, z], [-54.7, z]]; }
  routeToPlatform(x, z, w = null) {
    if (w !== null || x < -54) { const zz = w !== null ? F.windows[w].z : z; return [[-54.7, zz], [-51, zz], [-51, -633], [-51, -625.6]]; }
    const a = this.archFor(x); return [[a, Math.max(z, -645.6)], [a, -633], [a, -625.6]];
  }
  // on platform 1: straight when the way is clear, otherwise along one of the clear lanes (the footbridge stairs, columns,
  // benches and signs stand in the way of some straight lines)
  platformPath(x, z, tx, tz, strict = false) {
    const Lc = this.lineClear; if (!Lc) return [[tx, tz]];
    const cands = [[[tx, tz]]]; for (const lz of [-625.6, -615.3, -618.6, -624.4]) cands.push([[x, lz], [tx, lz], [tx, tz]]); cands.push([[x, -615.3], [-71.5, -615.3], [-71.5, -625.6], [tx, -625.6], [tx, tz]]);
    for (const c of cands) { let px = x, pz = z, ok = true; for (const [qx, qz] of c) { if (!Lc(px, pz, qx, qz)) { ok = false; break; } px = qx; pz = qz; } if (ok) return c; }
    return strict ? null : cands[1];
  }
  routeOut(x, z) {
    const out = []; let e;
    if (z > -630.5) { const a = this.archFor(x); out.push(...this.platformPath(x, z, a, -625.6), [a, -633]); e = a === -51 ? 1 : a === -35 ? 0 : 2; out.push([this.colX(e), -645.6]); }
    else if (x < -54) { out.push([-54.7, z], [-51, z], [-51, -645.6]); e = 1; }
    else { e = this.entranceFor(x); out.push([this.colX(e), Math.max(-645.6, Math.min(z, -633))], [this.colX(e), -645.6]); }
    out.push([F.inside[e].x, F.inside[e].z], [F.street[e].x, F.street[e].z]); return out;
  }
  // ---- ticket windows: which are open, the lane slots, joining and leaving
  openWindows() { const h = this.hour ?? 12; return h >= 5 && h < 22 ? [0, 1, 3, 4, 7] : [0, 3]; }
  queueSlot(w, i) { const s = F.windows[w].stand; return [s.x + i * 0.8, s.z]; }
  joinQueue(a) { let best = null, bn = 99; for (const w of this.openWindows()) { const n = this.queues[w].length; if (n < bn) { bn = n; best = w; } } if (best === null || bn >= 6) return false; a.win = best; this.queues[best].push(a); return true; }
  leaveQueue(a) { for (const q of this.queues) { const i = q.indexOf(a); if (i >= 0) q.splice(i, 1); } }
  serving(w) { const c = this.clerks.find((k) => k.win === w); if (c) { c.talkT = 1.2; c.lookT = 1; } }
  // ---- platform spots
  freeSpot(x, wantSeat) { let best = null, bd = Infinity; for (const s of this.spots) { if (s.used || (s.seat && s.seat.used)) continue; if (wantSeat !== !!s.seat && this.rng.next() < 0.7) continue; const d = Math.abs(s.x - x) + this.rng.next() * 30; if (d < bd) { bd = d; best = s; } } return best; }
  // ---- the train at platform 1
  fortTrain() { const T = this.trains; return T && T.trains ? T.trains[0] : null; }
  atFort(t) { return !!(t && this.stop && t.state === 'dwell' && t.stoppedAt === STOP_NAME && Math.abs(t.centre - this.stop.s) < 4); }
  trainSoon() { const t = this.fortTrain(); return !!(t && this.stop && (this.atFort(t) || (t.state === 'run' && t.nextStop === this.stop))); }
  doorOpen(d) { const t = this.fortTrain(); return !!(d && this.atFort(t) && this.dwellKey === d.key && t.dwell > 4); }
  boardingDoor(a) { // the nearest platform-side door once the people getting off are out of the way
    const t = this.fortTrain(); if (!this.atFort(t) || !this.doors.length || this.t - this.dwellStart < 3.5 || t.dwell < 7) return null;
    let best = null, bd = Infinity; for (const d of this.doors) { const k = Math.abs(d.x - a.p.x) + (d.n || 0) * 2.5; if (k < bd) { bd = k; best = d; } } if (best) best.n = (best.n || 0) + 1; return best;
  }
  computeDoors(t) {
    const T = this.trains, v = new THREE.Vector3(), out = []; t.group.updateMatrixWorld(true);
    t.cars.forEach((g, ci) => { const inner = g.userData.inner, zs = g.userData.cab ? T.doorsCab : T.doorsTrailer;
      for (const dz of zs) { let pick = null; for (const sx of [-1, 1]) { inner.localToWorld(v.set(sx * HW, FLOOR_Y, dz)); if (!pick || v.z < pick.z) pick = { x: v.x, z: v.z, sx, dz }; }
        out.push({ car: ci, inner, sx: pick.sx, dz, x: pick.x, z: pick.z, pz: F.edgeZ - 0.62, busy: 0, n: 0, key: this.dwellKey }); } });
    return out;
  }
  // ---- riders: seated in the train's own seats (car-local, under car.userData.inner — car 0's inner is turned round)
  seatList(g) { return g.userData.cab ? this.trains.seatsCab : this.trains.seatsTrailer; }
  freeSeat(ci, nearZ = null) {
    const t = this.fortTrain(); const g = t.cars[ci]; const seats = this.seatList(g); const used = this.seatsUsed.get(g) || new Set(); let best = -1, bd = Infinity;
    for (let i = 0; i < seats.length; i++) { if (used.has(i)) continue; const s = seats[i]; let clash = false; for (const j of used) { const o = seats[j]; if (o.yaw !== s.yaw && Math.abs(o.x - s.x) < 0.3 && Math.abs(o.z - s.z) < 1.2) { clash = true; break; } } if (clash) continue; // knees: never two people face to face at the same place across a bay
      const d = nearZ === null ? this.rng.next() : Math.abs(s.z - nearZ) + this.rng.next() * 0.5; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  takeSeat(g, i, on) { let u = this.seatsUsed.get(g); if (!u) this.seatsUsed.set(g, (u = new Set())); if (on) u.add(i); else u.delete(i); }
  paxSpec() { const C = this.crowd; const pool = (C.specs || []).filter((sp) => !NOT_PAX.has(sp.preset) && sp.profile !== 'fitness'); if (!pool.length) return makeAppearance(this.rng.int(1, 99999), { age: 'adult' }); const used = new Set([...this.pax.map((a) => a.p && a.p.sp), ...this.riders.map((r) => r.ch.spec)]); for (let k = 0; k < 8; k++) { const sp = pool[Math.floor(this.rng.next() * pool.length)]; if (!used.has(sp)) return sp; } return pool[Math.floor(this.rng.next() * pool.length)]; }
  addRider(ci) {
    const t = this.fortTrain(); const g = t.cars[ci]; const i = this.freeSeat(ci); if (i < 0) return null; const s = this.seatList(g)[i];
    const ch = new Character(this.paxSpec()); g.userData.inner.add(ch.root); ch.root.position.set(s.x, s.y, s.z); ch.root.rotation.set(0, s.yaw, 0); ch.mesh.castShadow = false;
    const r = { ch, g, ci, seatI: i, seat: s, state: 'seated', sitW: 1, mode: this.rng.next() < 0.3 ? 'phone' : null, path: null, t: 0, phase: this.rng.next() * 3 }; this.takeSeat(g, i, true); ch.anim.sitIn(SEAT_TRAIN, 1, r.mode); for (let k = 0; k < 4; k++) ch.anim.update(0.1, 0);
    this.riders.push(r); return r;
  }
  dropRider(r) { if (r.seatI >= 0) this.takeSeat(r.g, r.seatI, false); r.ch.root.parent?.remove(r.ch.root); r.ch.dispose(); const i = this.riders.indexOf(r); if (i >= 0) this.riders.splice(i, 1); }
  // a rider gets off at Fort: up, down the aisle to the door, a step down onto the platform → a crowd person walking out
  alight(r, d) { r.state = 'rise'; r.t = 0; r.door = d; const s = r.seat; r.path = [[AISLE_X, s.z], [AISLE_X, d.dz], [d.sx * (HW - 0.38), d.dz]]; }
  // a passenger on the platform steps up into the train: crowd person → rider
  board(a, d) {
    const p = a.p, C = this.crowd; if (!p || p.dead) return; C.release(p); a.p = null; a.gone = true; const ch = p.ch; ch.anim.set(null); ch.anim.ik = null;
    const r = { ch, g: d.inner.parent, ci: d.car, seatI: -1, seat: null, state: 'stepIn', sitW: 0, mode: null, path: null, t: 0, door: d, from: { x: p.x, y: p.y, z: p.z }, phase: this.rng.next() * 3 };
    this.riders.push(r); this.stats.boarded++; d.busy = this.t + 1.2; const i = this.pax.indexOf(a); if (i >= 0) this.pax.splice(i, 1);
  }
  updateRiders(dt, focus) {
    const v = new THREE.Vector3(); const t = this.fortTrain();
    for (let k = this.riders.length - 1; k >= 0; k--) {
      const r = this.riders[k], ch = r.ch, A = ch.anim; r.t += dt; let speed = 0;
      switch (r.state) {
        case 'seated': break;
        case 'rise': { r.sitW = Math.max(0, 1 - r.t / 0.8); const s = r.seat; ch.root.position.y = FLOOR_Y + (s.y - FLOOR_Y) * sm(r.sitW); if (r.sitW > 0) A.sitIn(SEAT_TRAIN, sm(r.sitW), r.mode); else { A.standUp(); this.takeSeat(r.g, r.seatI, false); r.seatI = -1; r.state = 'aisleOut'; r.t = 0; } break; }
        case 'aisleOut': case 'aisleIn': { speed = this.walkLocal(r, dt, 1.0); if (!r.path.length) { if (r.state === 'aisleOut') { r.state = 'stepOut'; r.t = 0; this.scene.attach(ch.root); r.from = ch.root.position.clone(); r.door.busy = this.t + 1.6; } else if (r.seatI >= 0) { r.state = 'sit'; r.t = 0; } else { r.state = 'standing'; r.t = 0; ch.root.rotation.y = r.door.sx > 0 ? -Math.PI / 2 : Math.PI / 2; } } break; }
        case 'stepOut': { const d = r.door, u = Math.min(1, r.t / 0.75); const tx = d.x, tz = d.pz, ty = FL; ch.root.position.set(r.from.x + (tx - r.from.x) * sm(u), r.from.y + (ty - r.from.y) * sm(u * 1.15) + Math.sin(Math.PI * u) * 0.08, r.from.z + (tz - r.from.z) * sm(u)); ch.root.rotation.y = dampA(ch.root.rotation.y, Math.PI, 10, dt); speed = 0.9;
          if (u >= 1) { this.riders.splice(k, 1); this.stats.alighted++; const p = this.crowd.adopt(ch, tx, tz, Math.PI, 'calm'); ch.mesh.castShadow = true; const a = new Passenger(this); a.adopt(p); a.setPhase('leave', [[tx, F.edgeZ - 1.6], ...this.routeOut(tx, F.edgeZ - 1.6)]); this.pax.push(a); continue; } break; }
        case 'stepIn': { const d = r.door; d.inner.updateWorldMatrix(true, false); d.inner.localToWorld(v.set(d.sx * (HW - 0.38), FLOOR_Y, d.dz)); const u = Math.min(1, r.t / 0.8); const f = r.from;
          ch.root.position.set(f.x + (v.x - f.x) * sm(u), f.y + (v.y - f.y) * sm(u * 1.4) + Math.sin(Math.PI * Math.min(1, u * 1.4)) * 0.06, f.z + (v.z - f.z) * sm(u)); ch.root.rotation.y = dampA(ch.root.rotation.y, 0, 10, dt); speed = 0.8;
          if (u >= 1) { d.inner.attach(ch.root); ch.root.position.y = FLOOR_Y; const si = this.freeSeat(r.ci, d.dz); if (si >= 0 && this.riders.filter((q) => q.g === r.g && q.seatI >= 0).length < 14) { r.seatI = si; r.seat = this.seatList(r.g)[si]; this.takeSeat(r.g, si, true); r.path = [[AISLE_X, d.dz], [AISLE_X, r.seat.z], [r.seat.x, r.seat.z]]; } else { r.path = [[d.sx * (HW - 0.75), d.dz + (this.rng.next() - 0.5) * 1.2]]; this.stats.standing++; } r.state = 'aisleIn'; r.t = 0; ch.mesh.castShadow = false; } break; }
        case 'sit': { const s = r.seat; r.sitW = Math.min(1, r.t / 0.9); ch.root.rotation.y = dampA(ch.root.rotation.y, s.yaw, 9, dt); ch.root.position.y = FLOOR_Y + (s.y - FLOOR_Y) * sm(r.sitW); A.sitIn(SEAT_TRAIN, sm(r.sitW), r.mode); if (r.sitW >= 1) r.state = 'seated'; break; }
        case 'standing': break; // in the vestibule (no seat near the door), holding on
      }
      // pose: every frame near the camera, less often farther (and the rest of the time the last pose is kept)
      const wp = ch.root.getWorldPosition(v); const dd = Math.hypot(wp.x - focus.x, wp.z - focus.z); const n = dd < 30 || speed > 0 ? 1 : dd < 80 ? 3 : 6;
      if ((this.frame + k) % n === 0) A.update(dt * n, speed, 0);
    }
    // the train gone far away: its riders with it
    if (t && this.riders.length) { const c = R.sampleAt(t.centre); if (Math.hypot(c.x - focus.x, c.z - focus.z) > TRAIN_R + 40) for (const r of [...this.riders]) if (r.state === 'seated' || r.state === 'standing') this.dropRider(r); }
  }
  walkLocal(r, dt, speed) { const ch = r.ch; const pos = ch.root.position; while (r.path.length) { const [x, z] = r.path[0]; const dx = x - pos.x, dz = z - pos.z, d = Math.hypot(dx, dz); if (d < 0.05) { r.path.shift(); continue; } const st = Math.min(d, speed * dt); pos.x += dx / d * st; pos.z += dz / d * st; ch.root.rotation.y = dampA(ch.root.rotation.y, Math.atan2(dx, dz), 10, dt); return speed; } return 0; }
  // ---- clerks (plain characters behind the counter: the clerks' strip is walled off from the hall)
  spawnClerks() {
    const wins = [0, 1, 3, 4, 7]; if (this.clerks.length < wins.length) { const w = wins[this.clerks.length]; const look = STAFF.clerks[this.clerks.length % STAFF.clerks.length];
      const ch = new Character(staffSpec(look)); const c = F.windows[w].clerk; ch.root.position.set(c.x, FL + 0.69, c.z); ch.root.rotation.set(0, Math.PI / 2, 0); this.scene.add(ch.root); ch.anim.sitIn(SEAT_STOOL, 1); for (let k = 0; k < 4; k++) ch.anim.update(0.1, 0);
      this.clerks.push({ ch, win: w, talkT: 0, lookT: 0 }); return; } // one per call (one character build a frame)
  }
  updateClerks(dt, focus) {
    const open = new Set(this.openWindows());
    this.clerks.forEach((c, k) => { c.ch.root.visible = open.has(c.win); if (!c.ch.root.visible) return; c.talkT -= dt; c.ch.face.talking = c.talkT > 0; const d = Math.hypot(c.ch.root.position.x - focus.x, c.ch.root.position.z - focus.z); const n = d < 25 ? 1 : d < 70 ? 4 : 8; if ((this.frame + k) % n === 0) c.ch.anim.update(dt * n, 0, 0); });
  }
  // ---- announcements
  announce(slot, train = null) {
    const P = this.player; if (!P) return false; const def = ANNOUNCE[slot - 1]; const dest = (train && train.destination && train.destination.name) || 'Maradana';
    const id = `station.announce${slot}`; const inRoom = inAnnouncerRoom(P.x, P.z); const nearStation = Math.hypot(P.x - CX, P.z - CZ) < 140;
    if (!nearStation) return false;
    let played = false, dur = 6;
    if (inRoom) { played = SB.play(id, 1.0, 0, 0, { key: 'pa.direct' }); dur = SB.lastDur || dur; } // in her room: her own voice, clean
    else { // through the PA: the nearest horn speakers, each from its own place (distance gain + delay + the horn's band)
      const sp = F.speakers.map((s) => ({ s, d: Math.hypot(s.x - P.x, s.z - P.z) })).sort((a, b) => a.d - b.d).slice(0, 3);
      sp.forEach(({ s, d }, i) => { if (d > 95) return; const a = Audio.at(s.x, s.z, 16); const g = a.g * (i ? 0.7 : 1); if (g < 0.01) return; if (SB.play(id, g, a.pan, a.delay, { key: 'pa.' + i, lp: Math.min(a.lp || 20000, 5200), hp: 260 })) { played = true; dur = SB.lastDur || dur; } });
    }
    if (!played) { // no recording in the slot yet: the PA chime and the words on screen
      const near = inRoom || F.speakers.some((s) => Math.hypot(s.x - P.x, s.z - P.z) < 70);
      if (near) { const s0 = F.speakers.reduce((a, b) => (Math.hypot(b.x - P.x, b.z - P.z) < Math.hypot(a.x - P.x, a.z - P.z) ? b : a)); const a = inRoom ? { g: 0.5, pan: 0 } : Audio.at(s0.x, s0.z, 16);
        try { Audio.tone(659, 0.55, { vol: 0.12 * a.g, pan: a.pan }); Audio.tone(523, 0.8, { vol: 0.12 * a.g, pan: a.pan, when: 0.5 }); } catch { /* audio not running */ }
        this.g.hud?.subtitle(inRoom ? 'Announcer' : 'Station announcement', def.text(dest), '', 6.5); }
    }
    this.announcer.speak(dur); this.lastAnn = this.t; this.stats.announcements++; return true;
  }
  updateAnnouncements(dt, t) {
    const S = this.stop; if (!t || !S) return;
    const rem = (S.s - t.centre) * t.dir; // ahead of the train
    if (t.state === 'run' && t.nextStop === S && rem > 60 && rem < 420) { if (!this.annFlags.approach) { this.annFlags.approach = true; this.announce(1, t); } } else if (t.state === 'run' && t.nextStop !== S) this.annFlags.approach = false;
    if (this.atFort(t)) { if (!this.annFlags.arrived) { this.annFlags.arrived = true; this.annFlags.departing = false; this.announce(2, t); } if (t.dwell < 9 && !this.annFlags.departing) { this.annFlags.departing = true; this.announce(3, t); } }
    else this.annFlags.arrived = false;
    if ((this.annT -= dt) <= 0) { this.annT = 100 + this.rng.next() * 70; if (this.t - this.lastAnn > 25) this.announce(this.genNext = this.genNext === 4 ? 5 : 4); }
  }
  // ---- the player buying from a vendor (Game.updateInteractions)
  interact(P, key, pressed) {
    if (!this.active || !P || P.vehicle) return null; const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    for (const v of this.vendors) { if (!v.alive() || v.p.state !== 'job' || v.phase === 'sell') continue; const p = v.p; const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz); if (d > 2.4 || (dx * fx + dz * fz) / (d || 1) < 0.3) continue;
      v.customer = 'player'; v.custT = 2.0; const w = v.ware;
      if (pressed()) this.sell(v);
      return `${key('interact')} Buy ${w.name} (Rs. ${w.price})`; }
    return null;
  }
  sell(v) {
    const g = this.g, st = g.story, w = v.ware, P = g.player; if (!st) return false;
    if ((st.state.money || 0) < w.price) { g.hud?.notify('Not enough money', `${w.name} is Rs. ${w.price}.`, 'info', 2.5); return false; }
    st.pay(-w.price, `${w.name} (Fort station)`); if (w.heal) g.health?.heal(w.heal); if (w.stamina && P) P.stamina = 1;
    P?.ch?.anim.play('interact', 1.2); v.custT = 2.5; this.stats.playerSales++;
    const said = Voices.say(v.p.sp, 'greet', v.p.x, v.p.z, v.p, 'vendor'); if (said) v.p.ch.face.talking = true;
    g.hud?.subtitle('Vendor', ['Isthuthi! Enjoy, sir.', 'Here you go — still hot.', 'Thank you! Safe journey.'][Math.floor(Math.random() * 3)], '', 2.5); return true;
  }
  // ---- per frame
  update(dt, { focus, night = 0, hour = 12, player = null } = {}) {
    this.t += dt; this.frame++; this.player = player; this.hour = hour; this.night = night;
    const d = Math.hypot(focus.x - CX, focus.z - CZ);
    if (!this.active && d < ACTIVE_R) this.active = true;
    if (this.active && d > DROP_R) { this.shutdown(); return; }
    const t = this.fortTrain();
    // riders: the train within reach of the player → fill some of its seats (one person a frame)
    if (t) {
      const c = R.sampleAt(t.centre); const near = Math.hypot(c.x - focus.x, c.z - focus.z) < TRAIN_R;
      const want = night > 0.6 && (hour < 5 || hour >= 22) ? 5 : 14;
      if (near && this.riders.length < want && (this.buildCd -= dt) <= 0 && !this.atFort(t)) { this.buildCd = 0.12; const ci = Math.floor(this.rng.next() * t.cars.length); const cp = t.cars[ci].position; if (!this.crowd || !this.crowd.visible({ x: cp.x, z: cp.z })) this.addRider(ci); } // never popping into view
      if (this.crowd) this.crowd.extra = this.riders.length + this.clerks.length; // the crowd keeps that many fewer street people (same number of characters overall)
      // arriving at Fort: work out the doors, pick who gets off
      if (this.atFort(t)) {
        if (this.dwellKey === null) { this.dwellKey = this.t; this.dwellStart = this.t; this.doors = this.computeDoors(t); this.annFlags.departing = false;
          const seated = this.riders.filter((r) => r.state === 'seated'); const n = Math.min(8, Math.round(seated.length * (0.3 + this.rng.next() * 0.25)));
          for (let i = 0; i < n; i++) { const r = seated.splice(Math.floor(this.rng.next() * seated.length), 1)[0]; const dr = this.doors.filter((q) => q.car === r.ci).sort((a, b) => Math.abs(a.dz - r.seat.z) - Math.abs(b.dz - r.seat.z))[0]; if (!dr) continue; r.delay = this.rng.next() * 6; r.state = 'toRise'; r.door = dr; } }
      } else if (this.dwellKey !== null) { this.dwellKey = null; this.doors = []; }
      for (const r of this.riders) if (r.state === 'toRise' && (r.delay -= dt) <= 0) { if (this.atFort(t) && t.dwell > 10) this.alight(r, r.door); else r.state = 'seated'; }
      this.updateRiders(dt, focus);
    }
    if (!this.active) return;
    // staff (one character build a frame)
    const build = () => { if (this.buildCd2 > 0) return false; this.buildCd2 = 0.15; return true; }; this.buildCd2 = (this.buildCd2 || 0) - dt;
    if (this.clerks.length < 5 && build()) this.spawnClerks();
    else if (!this.announcer.alive() && !this.announcer.p && this.announcer.gone !== 'dead' && build()) { this.announcer = new Announcer(this); this.announcer.spawnAnn(); }
    else { const nv = hour >= 5 && hour < 22 ? 3 : 1; const v = this.vendors.slice(0, nv).find((q) => !q.p && !q.dead); if (v && build()) { const [x, z] = F.vendorLoop[v.wp]; if (!this.crowd.visible({ x, z }) || this.t < 1) v.spawnVendor(); } }
    this.updateClerks(dt, focus);
    // passengers: arrivals off the street (never popping up in view), the platform filled up a little when the station wakes up
    for (let i = this.pax.length - 1; i >= 0; i--) { const a = this.pax[i]; if (a.gone || !a.p) { this.pax.splice(i, 1); continue; } if (a.p.dead) { a.p.job = null; a.p.keep = false; a.p = null; a.gone = true; this.pax.splice(i, 1); } }
    for (const v of this.vendors) if (v.p && (v.p.dead || v.p.ch.crowdPed !== v.p)) { if (v.p.dead) { v.p.job = null; v.p.keep = false; } v.p = null; v.dead = true; }
    if (this.announcer.p && this.announcer.p.dead) { this.announcer.p.job = null; this.announcer.p.keep = false; this.announcer.p = null; this.announcer.gone = 'dead'; }
    const cap = hour >= 5 && hour < 22 ? (hour >= 7 && hour < 10) || (hour >= 16 && hour < 19) ? 18 : 13 : 4;
    if ((this.spawnCd -= dt) <= 0 && this.pax.length < cap && build()) {
      this.spawnCd = cap > 10 ? 3 + this.rng.next() * 6 : 8 + this.rng.next() * 10;
      const settle = this.t < 25 && this.pax.length < cap * 0.6; // the station just came into range: some people are already here
      const a = new Passenger(this);
      if (settle) { const s = this.freeSpot(this.rng.range(-70, 10), this.rng.next() < 0.45); if (s && !this.crowd.visible({ x: s.ax, z: s.az })) { a.spawn(this.paxSpec(), s.ax, s.az, 0); a.spot = s; s.used = a; if (s.seat) { s.seat.used = a; a.sitDown(s.seat, SEAT_BENCH); a.sitW = 0.99; } a.setPhase('wait'); a.waitYaw = s.seat ? s.seat.yaw : 0; a.waitT = this.rng.next() * 100; this.pax.push(a); this.stats.arrivals++; } }
      else { const order = [0, 1, 2].sort(() => this.rng.next() - 0.5); const e = order.find((k) => !this.crowd.visible(F.street[k])); if (e !== undefined) { const st = F.street[e]; a.spawn(this.paxSpec(), st.x, st.z, 0); this.stats.arrivals++; this.pax.push(a);
        if (this.rng.next() < 0.62 && a.p && this.joinQueue(a)) { a.setPhase('toQueue', this.routeToQueue(e, a.win)); this.stats.queued = (this.stats.queued || 0) + 1; } else a.setPhase('toPlatform', [...this.routeIn(e), ...this.routeToPlatform(this.colX(e), -645.6)]); } } // season-ticket holders go straight through
    }
    this.updateAnnouncements(dt, t);
  }
  shutdown() { // the player has gone: everyone here is put away (nobody is seen going)
    this.active = false;
    for (const a of this.pax) { if (a.alive()) a.remove(); } this.pax = []; for (const q of this.queues) q.length = 0; for (const s of this.spots) { s.used = null; if (s.seat) s.seat.used = null; }
    for (const v of this.vendors) { if (v.alive()) v.remove(); v.p = null; v.dead = false; v.gone = false; }
    if (this.announcer.alive()) this.announcer.remove(); this.announcer = new Announcer(this);
    for (const c of this.clerks) { c.ch.root.parent?.remove(c.ch.root); c.ch.dispose(); } this.clerks = [];
    if (this.crowd) this.crowd.extra = this.riders.length;
  }
}
