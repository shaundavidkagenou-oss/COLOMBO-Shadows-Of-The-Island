// 80th request — roadside assistance & vehicle recovery (Street Customs breakdown service). Owned by PoliceResponse (this.rs)
// like the 1990 ambulance (EMS.js), and built on the same machinery — no second vehicle / dispatch / NPC manager:
//   vehicles   the unit pool (UnitPool: 2 service vans + 1 flatbed with their mechanic crews, built on the loading screen),
//              PoliceResponse.spawnUnit (a road out of view, never near the player) / plan (lane-AI routing) / dismount /
//              updateOfficer (crew in / out of the cab through the door rigs), Traffic lane AI, parkPath (the kerb pull-in),
//              rejoinLane (back into traffic), T.parked (a stopped car on the kerb is passed by traffic like any kerb-parked car)
//   crew       EMS.medic drives every mechanic on foot from a want {x, z, yaw, act, holds} (walk with FootNav / step-in, then the
//              pose: mechBend / mechSquat / medCarry with hand IK — Character.js)
//   damage     VehicleDamage (burst → a real flat tyre; health → engine faults; repair / the tyre swap undo exactly that)
//   garage     Garage records (owned vehicles keep their record and come back at Street Customs; never towed by the council)
//
// Breakdowns are events, not a timer: a car that is damaged (health), has a flat (spikes, a shot tyre) or — rarely — just
// fails (battery, overheating, fuel / ignition) near the player indicates, slows, pulls onto the kerb with a smooth S, stops
// with its hazards flashing, and the driver phones it in. The incident queue sends the nearest free unit of the right kind
// (service van for a roadside fix, flatbed for a recovery); with none free the incident waits in the queue, and after a long
// wait the driver gives up and leaves the car (the municipal tow then takes it, as for any abandoned car).
//   van      parks behind the car on the kerb, beacons on; B opens the rear doors, puts the warning triangle 12 m back and two
//            cones, A talks to the driver, then the job: jump-start (battery pack), tyre change (jack, wheel off, spare on),
//            engine / cooling work (toolbox, bent over the engine bay); success → the car restarts and drives off; failure →
//            a flatbed is requested. Everything is carried back and stowed, doors shut, crew in, van away → back in the pool.
//   flatbed  passes the car, pulls in ahead of it, reverses up to it (reverse lamps, beeper), the driver of a broken AI car gets
//            out; operator at the control station tilts and slides the deck down, hooks the winch to the car, winches it up the
//            ramp (wheels follow the ramp: real pitch), straps the wheels, deck back; drives to Street Customs and unloads it at
//            the kerb there. Out of sight and far away, delivery completes without the trip (no visible jumps).
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { parkPath, segNodes, evalPiece } from '../vehicles/Traffic.js';
import { vehicleMaterials, IND } from '../vehicles/VehicleModels.js';
import { setFlatDeck, deckPose, FLAT, MiniBuilder } from '../vehicles/RoadsideKit.js';
import { PlaceSound } from '../audio/PlaceAudio.js';
import { SoundBank } from '../audio/SoundBank.js';
import { rejoinLane } from './Pursuit.js';
import { bayWarmGroup } from './EngineBay.js';
import { planVanJob, bonnetFrame, vanKit, stowKit, stowStep, stowNow, bonnetStep, bonnetGone, toolPose, putTool, kitReport } from './RoadsideJob.js';

export const RS = {
  enabled: true, scanEvery: 1.5, rate: 1 / 300, // spontaneous faults: ≈ one per 5 min of traffic near you (a damaged car: far more often)
  maxIncidents: 3, near: [45, 140], callDelay: [6, 14], giveUp: 240, farResolve: 260, workK: 1,
};
// kind → label, unit, success chance (van), work time (s)
export const FAULTS = {
  battery: { label: 'flat battery', unit: 'rsvan', ok: 0.92, work: 8 },
  flat: { label: 'flat tyre', unit: 'rsvan', ok: 0.97, work: 0 },
  overheat: { label: 'overheating engine', unit: 'rsvan', ok: 0.8, work: 10 },
  nostart: { label: 'will not start', unit: 'rsvan', ok: 0.7, work: 9 },
  engine: { label: 'engine failure', unit: 'rsvan', ok: 0.45, work: 12 },
  mechanical: { label: 'mechanical fault', unit: 'rsvan', ok: 0.55, work: 11 },
  immobilised: { label: 'immobilised (needs recovery)', unit: 'flatbed', ok: 0, work: 0 },
};
const BREAKABLE = new Set(['car', 'sedan', 'taxi', 'van', 'suv', 'tuktuk']);
const sm = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const _v = new THREE.Vector3();

// mechanic crew looks (PoliceResponse.crewSpec → here): the Street Customs coverall + hi-vis vest, work gloves, safety boots
export function roadsideCrew(makeMech, q, k) {
  const vest = ['#e8f53a', '#ff7a1a', '#d4ef3a', '#ff9a2a'][(q + k) % 4];
  return makeMech(8300 + q * 19 + k * 7, { hiVis: vest, gloves: k ? '#2a2a2a' : '#3b3f45', cuff: k ? '#2a2a2a' : '#3b3f45', shoes: '#1c1712', sole: '#0c0c0c', label: 'Street Customs roadside mechanic', longSleeve: (q + k) % 3 !== 0 });
}

// ---------------------------------------------------------------- props (shared geometry, the vehicles' own material)
let PG = null;
function propGeos() {
  if (PG) return PG; const M = vehicleMaterials().mats; const mk = (fn) => { const b = new MiniBuilder(); fn(b); return b.build(); };
  const red = [0.62, 0.06, 0.05], blk = [0.06, 0.06, 0.06], gry = [0.55, 0.57, 0.6], yel = [0.85, 0.66, 0.05], org = [1, 0.36, 0.0], wht = [0.92, 0.92, 0.9];
  PG = {
    mat: M.vworn,
    lamp: (() => { const m = M.vlight.clone(); m.emissiveIntensity = 2.2; return m; })(),
    toolbox: mk((b) => { b.box(0, 0.11, 0, 0.52, 0.22, 0.24, red); b.box(0, 0.225, 0, 0.53, 0.012, 0.25, blk); b.box(0, 0.27, 0, 0.26, 0.025, 0.03, gry); for (const s of [-1, 1]) b.box(s * 0.13, 0.25, 0, 0.02, 0.05, 0.02, gry); }),
    jack: mk((b) => { b.box(0, 0.07, 0, 0.26, 0.1, 0.62, red); b.box(0, 0.14, 0.24, 0.12, 0.06, 0.12, gry); for (const [x, z] of [[-0.12, -0.25], [0.12, -0.25], [-0.12, 0.25], [0.12, 0.25]]) b.cyl(x, 0.035, z, 0.035, 0.03, blk, true); b.box(0, 0.32, -0.55, 0.03, 0.03, 0.6, gry); }),
    tyre: mk((b) => { b.cyl(0, 0, 0, 0.31, 0.2, blk, true, 18); b.cyl(0.004, 0, 0, 0.2, 0.205, gry, true, 14); b.cyl(0.006, 0, 0, 0.05, 0.21, blk, true, 8); }), // axle along x (stood up / laid down by rotation)
    battery: mk((b) => { b.box(0, 0.15, 0, 0.26, 0.28, 0.13, yel); b.box(0, 0.3, 0, 0.16, 0.03, 0.04, blk); b.box(-0.08, 0.2, 0.075, 0.05, 0.06, 0.02, red); b.box(0.08, 0.2, 0.075, 0.05, 0.06, 0.02, blk); }),
    triangle: mk((b) => { const s = 0.46, h = s * 0.866; for (const [a, c] of [[[-s / 2, 0.04], [0, 0.04 + h]], [[s / 2, 0.04], [0, 0.04 + h]], [[-s / 2, 0.04], [s / 2, 0.04]]]) { const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy); const g = new THREE.BoxGeometry(0.05, l, 0.012); g.rotateZ(-Math.atan2(dx, dy)); g.translate((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0); b.geo(g, red); g.dispose(); } b.box(0, 0.01, 0.08, 0.3, 0.02, 0.18, gry); }),
    cone: mk((b) => { b.box(0, 0.015, 0, 0.34, 0.03, 0.34, blk); const g = new THREE.CylinderGeometry(0.025, 0.14, 0.48, 12); g.translate(0, 0.27, 0); b.geo(g, org); g.dispose(); const w = new THREE.CylinderGeometry(0.075, 0.1, 0.09, 12); w.translate(0, 0.3, 0); b.geo(w, wht); w.dispose(); }),
    worklight: mk((b) => { b.box(0, 0.015, 0, 0.3, 0.03, 0.22, yel); b.box(0, 0.3, 0, 0.025, 0.56, 0.025, blk); b.box(0, 0.62, 0, 0.26, 0.18, 0.08, yel); }),
    lens: (() => { const g = new THREE.PlaneGeometry(0.22, 0.13); g.translate(0, 0.62, 0.041); return g; })(),
    spanner: mk((b) => { b.box(0, 0, 0.0, 0.018, 0.008, 0.2, gry); b.box(0, 0, 0.11, 0.04, 0.009, 0.03, gry); b.box(0, 0, -0.11, 0.032, 0.009, 0.032, gry); }), // 84th: hand tools (in the toolbox; in the mechanic's hand while he works)
    brace: mk((b) => { b.box(0, 0, 0, 0.022, 0.022, 0.4, gry); b.box(0, 0, 0, 0.4, 0.022, 0.022, gry); for (const [x, z] of [[0, 0.2], [0, -0.2], [0.2, 0], [-0.2, 0]]) b.box(x, 0, z, 0.032, 0.032, 0.032, blk); }),
    strap: mk((b) => { b.box(0, 0, 0, 0.05, 0.012, 0.75, yel); b.box(0, -0.01, -0.36, 0.07, 0.03, 0.06, gry); }),
  };
  return PG;
}
class Props {
  constructor(scene) { this.scene = scene; this.free = new Map(); this.live = new Set(); this.stats = { made: 0, reused: 0 }; }
  get(kind) {
    const list = this.free.get(kind); let m = list && list.pop(); if (m) this.stats.reused++;
    else { const G = propGeos(); m = new THREE.Mesh(G[kind], G.mat); m.castShadow = true; m.receiveShadow = false; m.name = 'rs_' + kind; m.userData.kind = kind;
      if (kind === 'worklight') { const l = new THREE.Mesh(G.lens, G.lamp); l.name = 'rs_lens'; l.castShadow = false; m.add(l); }
      this.stats.made++; }
    m.visible = true; m.position.set(0, -50, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); this.scene.add(m); this.live.add(m); return m;
  }
  put(m) { if (!m) return; m.parent?.remove(m); this.live.delete(m); const k = m.userData.kind; if (!this.free.has(k)) this.free.set(k, []); this.free.get(k).push(m); }
}

// ---------------------------------------------------------------- the service
export class Roadside {
  constructor(pr) {
    this.pr = pr; this.units = []; this.incidents = []; this.delivered = []; this.t = 0; this.scanT = 2; this.seq = 1; this.props = null;
    this.stats = { breakdowns: 0, byKind: {}, calls: 0, dispatched: 0, queuedWaits: 0, noUnit: 0, repaired: 0, failed: 0, towed: 0, delivered: 0, deliveredUnseen: 0, gaveUp: 0, resolvedFar: 0, aborted: 0, pullFail: 0, replans: 0 };
    this.log = [];
  }
  get g() { return this.pr.g; }
  get T() { return this.pr.T; }
  note(s) { this.log.push(`${this.t.toFixed(1)} ${s}`); if (this.log.length > 60) this.log.shift(); this.pr.note('[roadside] ' + s); }
  P() { return this.g.player; }
  dP(x, z) { const P = this.P(); return Math.hypot(x - P.x, z - P.z); }
  seen(x, z) { return this.pr.inView({ x, z }) || this.dP(x, z) < 35; }
  propsOf() { return this.props || (this.props = new Props(this.g.scene)); }
  // 89th: everything a roadside job shows that is not part of a pooled van — one of each prop (the worklight with its lit lens), a
  // complete engine bay with the bonnet up (EngineBay.js) — for the loading screen's compile + drawn frame (UnitPool.warmGroup).
  // Before, these were compiled on their first frame mid-job: the frame drops / freeze when the mechanics opened the van, set the
  // kit out and lifted the bonnet. restore() puts the props back in the pool (reused — same meshes) and drops the warm bay.
  warmGroup() {
    const P = this.propsOf(); const g = new THREE.Group(); g.name = 'roadsideWarm'; const got = []; let i = 0;
    for (const kind of ['toolbox', 'jack', 'tyre', 'battery', 'triangle', 'cone', 'worklight', 'spanner', 'brace', 'strap']) { const m = P.get(kind); g.add(m); m.position.set(((i % 5) - 2) * 0.7, 0, Math.floor(i / 5) * 0.8); i++; got.push(m); }
    const bw = bayWarmGroup(); bw.position.set(0, -0.9, 2.6); g.add(bw);
    g.userData.restore = () => { for (const m of got) P.put(m); bw.parent?.remove(bw); bw.userData.release(); g.parent?.remove(g); }; return g;
  }
  sound(id, x, z, ref = 10, k = 1) { if (SoundBank.has(id)) PlaceSound.shot(id, x, z, ref, k); }
  loop(key, id, x, z, ref = 8, lvl = 1) { if (SoundBank.has(id) && this.dP(x, z) < 80) PlaceSound.want(key, { id, x, z, ref, lvl, fadeIn: 0.3, fadeOut: 0.4, out: 'sfx' }); }
  ground(x, z, y = null) { const c = this.g.collision; const g0 = L.groundY(x, z); return c && c.groundAt ? c.groundAt(x, z, (y ?? g0) + 0.5) : g0; }

  // ------------------------------------------------------------- lane frame of a stopped vehicle: node origin, lane dir, kerb normal
  frameFor(v, P = null) {
    let piece = P; if (!piece) { const ln = this.T.laneNear(v.x, v.z, v.yaw, 30); if (!ln) return null; piece = ln.piece; }
    const seg = piece.seg, d = piece.d, n = [d[1], -d[0]], O = [piece.from.x, piece.from.z]; const segLen = Math.hypot(piece.to.x - piece.from.x, piece.to.z - piece.from.z);
    const a = (v.x - O[0]) * d[0] + (v.z - O[1]) * d[1], c = (v.x - O[0]) * n[0] + (v.z - O[1]) * n[1];
    const a0 = (piece.p0[0] - O[0]) * d[0] + (piece.p0[1] - O[1]) * d[1]; return { piece, seg, d, n, O, a, c, segLen, aMin: a0 + 4, aMax: a0 + piece.len - 4, hw: seg.hw };
  }
  at(F, a, c) { return [F.O[0] + F.d[0] * a + F.n[0] * c, F.O[1] + F.d[1] * a + F.n[1] * c]; }
  kerbC(F, halfW) { return F.hw - halfW - 0.15; }

  // ------------------------------------------------------------- per frame
  update(dt) {
    if (!RS.enabled && !this.incidents.length && !this.units.length) return;
    this.t += dt; if ((this.scanT -= dt) <= 0) { this.scanT = RS.scanEvery; if (RS.enabled && !this.g.indoor) this.scan(); this.queue(); this.tidy(); }
    for (const inc of this.incidents.slice()) this.updateIncident(inc, dt);
    for (const u of this.units.slice()) this.updateUnit(u, dt);
  }
  // spontaneous / damage-driven faults on lane-AI cars near the player
  scan() {
    const T = this.T; if (!T || this.incidents.length >= RS.maxIncidents || (this.pr.level | 0) >= 2) return; // (not during a chase)
    let cands = 0;
    for (const v of T.vehicles) {
      if (!this.eligible(v)) continue; const d = this.dP(v.x, v.z); if (d < RS.near[0] || d > RS.near[1]) continue; cands++;
      const vd = v.vd; const flats = vd ? vd.flats : 0; const h = v.health ?? 100;
      let kind = null; if (flats > 0) kind = 'flat'; else if (h < 22) kind = 'immobilised';
      else if (Math.random() < RS.rate * RS.scanEvery * (1 + Math.max(0, 100 - h) / 10)) kind = h < 55 ? (Math.random() < 0.5 ? 'engine' : 'overheat') : ['battery', 'flat', 'overheat', 'nostart', 'mechanical', 'engine', 'immobilised'][Math.floor(Math.random() * 7)];
      if (!kind) continue; if (this.breakDown(v, kind)) return;
    }
    this.cands = cands;
  }
  eligible(v) { return !this.whyNot(v); }
  // why a car cannot break down here (null = it can): a lane-AI civilian car on a kerb lane, well clear of both junctions
  whyNot(v) {
    const ai = v.ai; if (!ai) return 'no ai'; if (v.player || v.police || v.keep || v.parked || v.free || v.towing || v.towedBy || v.rsInc || v.disembarking || v.squad || v.isTrain || v.abandoned || v.ownerId) return 'state';
    if (!BREAKABLE.has(v.type)) return 'type'; if (!v.driverChar) return 'no driver'; if (ai.park || ai.fuel || ai.chase || ai.emergency || ai.rejoin) return 'busy';
    if (Math.abs(ai.lat || 0) > 0.1 || Math.abs(ai.hdg || 0) > 0.03) return 'changing lane';
    const p = ai.pieces[0]; if (!p || p.type !== 'line' || !p.seg || p.seg.crossing || p.seg.level > 2) return 'not on a road line';
    if (p.lane !== (p.seg.level <= 1 ? 1 : 0)) return 'not the kerb lane';
    return ai.s > 4 && ai.s < p.len - 30 ? null : 'near a junction'; // (it stops 12–22 m on, ≥ 16 m short of the junction)
  }
  // a lane-AI car breaks down: slow, indicate, pull in to the kerb with a smooth S, stop (hazards). false when no room
  breakDown(v, kind, opts = {}) {
    const T = this.T, ai = v.ai, P = ai && ai.pieces[0]; if (!P || P.type !== 'line') return false;
    const al = Math.min(ai.s + (opts.ahead ?? 22), P.len - 16); if (al < ai.s + 12) return false;
    const F = this.frameFor(v, P); const half = v.T.len / 2, hwid = v.T.wid / 2;
    const c = this.kerbC(F, hwid); const aSpot = (P.p0[0] - F.O[0]) * F.d[0] + (P.p0[1] - F.O[1]) * F.d[1] + al; const [sx, sz] = this.at(F, aSpot, c);
    if (this.near(sx, sz, 40)) return false; for (const o of T.parked) if (Math.hypot(o.x - sx, o.z - sz) < half + o.T.len / 2 + 9) return false; // room behind (van) and ahead (flatbed)
    const spot = { x: sx, z: sz, yaw: Math.atan2(F.d[0], F.d[1]) }; const sA = Math.max(ai.s + 3, al - 14); const path = parkPath(P, sA, spot); const cut = { ...P, p1: [P.p0[0] + P.d[0] * sA, P.p0[1] + P.d[1] * sA], len: sA };
    ai.pieces = [cut, path]; ai.route = null; ai.goal = null; ai.park = { path, rs: true }; ai.sMaxP = path; ai.sMax = path.len - 0.02; ai.v0 = Math.min(ai.v0 || 8, kind === 'flat' ? 5 : 7);
    const inc = { id: this.seq++, v, kind, F: null, ph: 'pull', t: 0, due: 0, unit: null, need: FAULTS[kind].unit, tries: 0, own: false, hz: { on: false, t: 0 }, path };
    if (v.type !== 'tuktuk' && v.T.base !== 'tuktuk') bonnetFrame(v); // 89th: the bonnet's run is measured (and cached per model) now, at the breakdown, not as it is lifted
    v.rsInc = inc; v.ind = 1; this.incidents.push(inc); this.stats.breakdowns++; this.stats.byKind[kind] = (this.stats.byKind[kind] || 0) + 1;
    if (kind === 'flat' && !(v.vd && v.vd.flats) && this.g.vdamage) { const ws = (v.mesh.userData.wheels || []).filter((w) => w.position.x > 0); const w = ws[Math.floor(Math.random() * ws.length)]; if (w) this.g.vdamage.burst(v, w); } // a real puncture (kerb side)
    if (kind === 'engine' || kind === 'immobilised') this.sound('rs.shutdown', v.x, v.z, 12); else if (kind === 'overheat') this.sound('rs.overheat', v.x, v.z, 10);
    this.note(`#${inc.id} ${v.type} breaks down (${FAULTS[kind].label}) ${this.dP(v.x, v.z).toFixed(0)} m away`); return inc;
  }
  near(x, z, r) { for (const q of this.incidents) if (q.v && Math.hypot(q.v.x - x, q.v.z - z) < r) return true; return false; }
  // the car has stopped on the kerb: a parked vehicle with an incident (traffic passes it like a kerb-parked car)
  stopped(inc) {
    const T = this.T, v = inc.v; const i = T.vehicles.indexOf(v); if (i >= 0) T.vehicles.splice(i, 1);
    if (v.ai) { v.ai.park = null; v.ai.sMaxP = null; } v.ai = null; v.speed = 0; v.brake = false; v.steer = 0; v.ind = 0; v.parked = true; v.keep = true; v.left = null; if (!T.parked.includes(v)) T.parked.push(v);
    inc.ph = 'wait'; inc.t = 0; inc.due = this.t + RS.callDelay[0] + Math.random() * (RS.callDelay[1] - RS.callDelay[0]); inc.F = this.frameFor(v); inc.hz.on = true;
    if (inc.kind === 'nostart') this.sound('rs.start.struggle', v.x, v.z, 10); else if (inc.kind === 'battery') this.sound('rs.starter.fail', v.x, v.z, 8);
  }
  // the player's own call (Phone → Contacts → Street Customs): the vehicle you were last in, if it needs help
  call() {
    const P = this.P(); this.stats.calls++; const title = 'Street Customs Roadside';
    if (!RS.enabled) return { ok: false, title, msg: 'The breakdown line is closed (roadside off).' };
    if (P.vehicle) return { ok: false, title, msg: 'Pull over and get out first — the mechanic needs to get to the car.' };
    const T = this.T; let v = null, bd = 14; for (const o of T.parked) { if (o.disposed || o.wrecked || o.towedBy) continue; const d = Math.hypot(o.x - P.x, o.z - P.z); if (d < bd && (o.ownerId || o === P.lastVehicle || o.left)) { bd = d; v = o; } }
    if (!v) return { ok: false, title, msg: 'We need to know which vehicle — stand next to it (within 14 m) and call again.' };
    if (v.rsInc) return { ok: false, title, msg: 'Help is already on its way to that vehicle.' };
    const vd = v.vd, h = v.health ?? 100; let kind = vd && vd.flats ? 'flat' : h < 22 ? 'immobilised' : h < 60 ? 'engine' : h < 100 ? 'mechanical' : null;
    if (v.T.entry === 'bike' || v.T.rail || v.T.mass > 4000) kind = h < 100 || (vd && vd.flats) ? 'immobilised' : null;
    if (!kind) return { ok: false, title, msg: 'Your vehicle sounds fine from here — no call-out needed.' };
    if (this.incidents.length >= RS.maxIncidents + 1) return { ok: false, title, msg: 'Every crew is out on a job — try again in a few minutes.' };
    const inc = { id: this.seq++, v, kind, F: this.frameFor(v), ph: 'wait', t: 0, due: this.t + 2, unit: null, need: FAULTS[kind].unit, tries: 0, own: true, hz: { on: true, t: 0 } };
    if (!inc.F) return { ok: false, title, msg: 'We cannot get a truck to you there — move the vehicle closer to a road.' };
    v.rsInc = inc; v.left = null; this.incidents.push(inc); this.stats.breakdowns++; this.stats.byKind[kind] = (this.stats.byKind[kind] || 0) + 1; this.note(`#${inc.id} player call (${FAULTS[kind].label})`);
    return { ok: true, title, msg: inc.need === 'flatbed' ? `A recovery flatbed is on its way (${FAULTS[kind].label}). It will take your vehicle to Street Customs.` : `A mechanic is on the way (${FAULTS[kind].label}). Stay with the vehicle.` };
  }
  // ------------------------------------------------------------- the dispatch queue
  queue() {
    const wait = this.incidents.filter((q) => q.ph === 'wait' && !q.unit && this.t >= q.due).sort((a, b) => a.due - b.due);
    for (const inc of wait) {
      const u = this.dispatch(inc); if (u) continue;
      inc.tries++; this.stats.queuedWaits++; inc.due = this.t + 10;
      if (inc.tries === 1) this.stats.noUnit++;
      if (inc.own && inc.tries === 1 && this.g.hud) this.g.hud.notify('Street Customs Roadside', 'All crews are busy — your job is in the queue.', 'info', 4);
    }
  }
  dispatch(inc) {
    const pr = this.pr; const v = inc.v; if (!v || v.disposed) return null;
    const busy = this.units.filter((u) => u.v && u.v.type === inc.need).length; const cap = inc.need === 'flatbed' ? 1 : 2; if (busy >= cap) return null; // (the pool's size — a spare is never built mid-game)
    const u = pr.spawnUnit({ rs: inc.need, near: true }) || pr.spawnUnit({ rs: inc.need }); if (!u) return null;
    pr.units = pr.units.filter((q) => q !== u); this.units.push(u); u.rs = { inc, ph: 'drive', t: 0, ct: 0, replans: 0, props: [], rear: 0, rearOpen: false, deckK: 0 }; u.task = 'rs'; if (u.v.T.roadside === 'van') vanKit(this, u.v); // 84th: the van's own equipment (stowed in its compartment)
    u.v.ai.v0 = inc.need === 'flatbed' ? 11 : 13; inc.unit = u; inc.ph = 'assigned'; this.stats.dispatched++;
    if (!this.planTo(u)) { this.note(`#${inc.id}: unit ${u.id} has no route`); this.dropUnit(u); inc.unit = null; inc.ph = 'wait'; return null; }
    this.note(`#${inc.id}: ${u.v.type} unit ${u.id} sent (${(Math.hypot(u.v.x - v.x, u.v.z - v.z)).toFixed(0)} m)`); return u;
  }
  // where the unit stops at the scene, in the incident's lane frame: van behind the car, flatbed ahead (then it reverses up)
  scenePlan(u) {
    const inc = u.rs.inc, v = inc.v, F = inc.F || (inc.F = this.frameFor(v)); if (!F) return null; const T = u.v.T; const half = T.len / 2, hw = T.wid / 2; const ch = v.T.len / 2;
    const cU = Math.min(Math.max(F.c, 0), this.kerbC(F, hw));
    if (T.roadside === 'flatbed') { const front = F.a + ch; const rev = front + (-deckPose(1).oz + 0.45); const park = Math.max(F.aMin + half, Math.min(F.aMax - half, rev + 10)); // ahead (lane-wise) of the car's leading end
      const ok = park >= rev + 1; const [px, pz] = this.at(F, park, cU), [rx, rz] = this.at(F, ok ? rev : park, cU); return { park: { x: px, z: pz, yaw: Math.atan2(F.d[0], F.d[1]) }, rev: { x: rx, z: rz }, F, c: cU }; }
    let a = F.a - (ch + 2.4 + half); if (a < F.aMin + half) a = F.a + ch + 2.4 + half; // no room behind (junction): ahead of it
    const [x, z] = this.at(F, Math.min(a, F.aMax - half), cU); return { park: { x, z, yaw: Math.atan2(F.d[0], F.d[1]) }, F, c: cU };
  }
  planTo(u) { const S = this.scenePlan(u); if (!S) return false; u.rs.S = S; const F = S.F; const [ax, az] = this.at(F, Math.max(F.aMin, ((S.park.x - F.O[0]) * F.d[0] + (S.park.z - F.O[1]) * F.d[1]) - 32), S.c); return this.pr.plan(u, ax, az); }

  // ------------------------------------------------------------- incidents
  updateIncident(inc, dt) {
    const v = inc.v; inc.t += dt;
    if (!v || v.disposed || v.player || v.wrecked || v.burning || (v.towedBy && !inc.loaded)) { this.endIncident(inc, v && v.player ? 'driven away by the player' : 'vehicle gone'); return; }
    if (inc.ph === 'pull') { const ai = v.ai; if (!ai || !ai.park || ai.park.path !== inc.path) { if (!this.T.vehicles.includes(v)) { this.endIncident(inc, 'recycled'); return; } }
      const path = inc.path; if (ai && ai.pieces[0] === path && ((ai.s >= path.len - 0.06 && v.speed < 0.15) || ai.s >= path.len - 0.021)) this.stopped(inc);
      else if (inc.t > 45 && Math.abs(v.speed) < 0.4) { this.stats.pullFail++; this.stopped(inc); } // could not complete the S (blocked): stops where it is, hazards on
      v.ind = 1; }
    // hazards: both indicator sides flash ~1.25 Hz (VehicleAudio's indicator lamp material; no extra light)
    const m = v.mesh && v.mesh.userData.indMat; if (m && inc.hz.on) { if (m.userData.base == null) m.userData.base = m.emissiveIntensity; inc.hz.t += dt; const on = inc.hz.t % 0.8 < 0.4; if (m.userData.side) m.userData.side.value = 0; m.emissiveIntensity = on ? IND.peak : m.userData.base;
      if (this.dP(v.x, v.z) < 25) this.loop('rs.hz.' + inc.id, 'rs.hazard', v.x, v.z, 3, 1); }
    if (inc.ph === 'wait' || inc.ph === 'assigned') {
      // leave and return: far away and out of sight — the job happens without being watched (no visible jumps)
      if (!inc.own && this.dP(v.x, v.z) > RS.farResolve && !this.seen(v.x, v.z) && (!inc.unit || !this.seen(inc.unit.v.x, inc.unit.v.z))) { this.stats.resolvedFar++; if (inc.unit) this.finishUnseen(inc.unit); else this.removeCar(inc, 'resolved out of sight'); return; }
      if (inc.ph === 'wait' && !inc.unit && inc.t > RS.giveUp && !inc.own) { this.stats.gaveUp++; this.giveUp(inc); }
    }
  }
  hazards(inc, on) { inc.hz.on = on; const m = inc.v && inc.v.mesh && inc.v.mesh.userData.indMat; if (m && !on && m.userData.base != null) { m.emissiveIntensity = m.userData.base; if (m.userData.side) m.userData.side.value = 0; } }
  endIncident(inc, why) { this.hazards(inc, false); if (inc.v && inc.v.rsInc === inc) inc.v.rsInc = null; this.incidents = this.incidents.filter((q) => q !== inc); if (inc.unit && inc.unit.rs && inc.unit.rs.inc === inc && !inc.done) this.unitLeave(inc.unit, why); this.note(`#${inc.id} closed: ${why}`); }
  // nobody came: the driver gets out and walks off; the car is an abandoned car (the council tow takes it — Traffic.tow)
  giveUp(inc) { const v = inc.v; inc.done = true; this.endIncident(inc, 'no unit came — abandoned (council tow)'); this.T.abandon(v, null, false); }
  removeCar(inc, why) { const v = inc.v, T = this.T; inc.done = true; this.endIncident(inc, why); if (v.ownerId) return; const pi = T.parked.indexOf(v); if (pi >= 0) T.parked.splice(pi, 1); const i = T.vehicles.indexOf(v); if (i >= 0) T.vehicles.splice(i, 1); v.keep = false; T.remove(v); }
  // the car is fixed: hazards off, back into traffic (lane AI from where it stands, the rejoin S — never slid over)
  carGo(inc) {
    const v = inc.v, T = this.T; this.hazards(inc, false); inc.done = true; v.rsInc = null; this.incidents = this.incidents.filter((q) => q !== inc);
    if (inc.own || !v.driverChar) { this.note(`#${inc.id} repaired (stays parked)`); return; }
    const ln = T.laneNear(v.x, v.z, v.yaw, 30); if (!ln || !T.adoptAI(v, ln, { place: false })) { this.note(`#${inc.id} repaired but no lane — stays`); return; }
    v.keep = false; rejoinLane(T, v, 30); v.ai.v0 = Math.min(v.ai.v0, 9); v.engineOn = true; v.ind = -1; this.note(`#${inc.id} repaired — back in traffic`);
  }
  tidy() { // cars unloaded at Street Customs (AI ones) are cleared once nobody is looking
    for (let i = this.delivered.length - 1; i >= 0; i--) { const v = this.delivered[i]; if (v.disposed || v.player || v.ownerId) { this.delivered.splice(i, 1); continue; } if (this.dP(v.x, v.z) > 160 && !this.seen(v.x, v.z)) { const T = this.T; const pi = T.parked.indexOf(v); if (pi >= 0) T.parked.splice(pi, 1); v.keep = false; T.remove(v); this.delivered.splice(i, 1); } } }

  // ------------------------------------------------------------- units
  dropUnit(u) { const R = u.rs; if (R && R.inc && R.inc.v && !R.inc.v.disposed) { const car = R.inc.v; if (R.jack || car.wreckLift) { car.wreckLift = 0; if (!R.carried) { car.roll = 0; car.pitch = 0; } car.sync(0); } R.jack = null; for (const w of car.mesh.userData.wheels || []) w.visible = true; }
    if (R) { for (const p of R.props) stowKit(this, u, p.m); R.props = []; for (const o of u.officers) { stowKit(this, u, this.unCarry(o)); putTool(this, o); } stowNow(this, u); bonnetGone(R); if (R.cable) this.cable(u, null); if (R.carried && R.carried.v) this.dropCarried(u); }
    this.units = this.units.filter((q) => q !== u); const v = u.v; if (v) { v.carried = false; if (v.mesh.userData.deck) setFlatDeck(v.mesh.userData.deck, 0); if (v.mesh.userData.rear) v.rearDoors(0); const rm = v.mesh.userData.revMat; if (rm) rm.emissiveIntensity = 0; }
    this.pr.units.push(u); this.pr.removeUnit(u); }
  unitLeave(u, why) { const R = u.rs; if (!R || R.ph === 'leave' || R.ph === 'todrop') return; this.note(`unit ${u.id} stands down (${why})`); this.packUp(u, true); }
  // out of sight and far away: whatever the unit was doing completes now (the car repaired / delivered, the unit back in the pool)
  finishUnseen(u) {
    const R = u.rs, inc = R.inc; if (inc && !inc.done) {
      if (u.v.T.roadside === 'flatbed' || inc.need === 'flatbed') { this.deliverUnseen(u); }
      else { const v = inc.v; if (inc.kind === 'flat') this.fixTyres(v); else this.fixEngine(v); this.stats.repaired++; this.carGo(inc); if (!inc.own && v.ai) { /* drives off on its own */ } } }
    this.dropUnit(u);
  }
  updateUnit(u, dt) {
    const R = u.rs, v = u.v, pr = this.pr; R.t += dt; R.ct += dt;
    if (!v || v.player || v.disposed) { this.note(`unit ${u.id}: vehicle lost`); if (v && v.player) { v.police = null; u.v = null; } R.inc && (R.inc.unit = null); if (R.inc && !R.inc.done) R.inc.ph = 'wait'; this.units = this.units.filter((q) => q !== u); for (const o of u.officers) { if (o.mode !== 'seated') { o.ch.root.parent?.remove(o.ch.root); o.ch.dispose(); } } return; }
    const near = this.dP(v.x, v.z); v.lights = this.g.atmos ? this.g.atmos.night > 0.4 : false;
    const scene = R.ph !== 'drive' && R.ph !== 'leave' && R.ph !== 'todrop' && R.ph !== 'gone'; v.beacons(scene || R.ph === 'pullin' || (R.ph === 'drive' && near < 120 && R.inc && Math.hypot(v.x - R.inc.v.x, v.z - R.inc.v.z) < 90), pr.t);
    for (const o of u.officers) pr.updateOfficer(o, u, dt);
    if (v.mesh.userData.rear) { const want = R.rearOpen ? 1 : 0; R.rear += Math.sign(want - R.rear) * Math.min(Math.abs(want - R.rear), dt / 1.1); v.rearDoors(sm(R.rear)); }
    if (R.stowing && R.stowing.length) stowStep(this, u, dt); if (R.bonnet) bonnetStep(R, dt); // 84th: kit gliding back into its slot; the raised bonnet
    if (R.carried) this.poseCarried(u);
    if (R.attacked) { // 84th: the crew was attacked (WorkerReact.js): nothing scripted runs while anyone is still reacting; then the job is called off and everything is collected
      if (u.officers.some((o) => o.react)) { if (R.jack) this.jackPose(u, dt); if (R.deckGoal !== undefined) this.deck(u, dt); return; }
      R.attacked = false; if (R.ph === 'work' || R.ph === 'packing') { R.packing = false; R.packCheck = null; this.packUp(u, true); } }
    if (scene && R.ph !== 'reverse' && near > RS.farResolve && !pr.inView(v)) { this.stats.resolvedFar++; this.finishUnseen(u); return; } // left the scene behind: it completes unwatched
    // sounds: van engine / truck passing loops while it drives near you, truck idle while it works at the scene
    const flat = v.T.roadside === 'flatbed';
    if (near < 70) { if (!scene) this.loop('rs.eng.' + u.id, flat ? 'rs.truck.pass' : 'rs.van.engine', v.x, v.z, 10, Math.min(1, 0.3 + Math.abs(v.speed) / 10)); else if (flat) this.loop('rs.idle.' + u.id, 'rs.truck.idle', v.x, v.z, 8, 0.8); }
    switch (R.ph) {
      case 'drive': this.drive(u, dt); return;
      case 'pullin': { const ai = v.ai, path = ai.park && ai.park.path; if (path && ai.pieces[0] === path && ((ai.s >= path.len - 0.06 && v.speed < 0.15) || ai.s >= path.len - 0.021)) this.parkUnit(u); else if (R.t > 40 && Math.abs(v.speed) < 0.3) { this.stats.pullFail++; this.parkUnit(u); } return; }
      case 'reverse': this.reverse(u, dt); return;
      case 'work': this.work(u, dt); return;
      case 'packing': if (R.jack) this.jackPose(u, dt); if (R.deckGoal !== undefined) this.deck(u, dt); if (R.packCheck) R.packCheck(); return;
      case 'mount': if (pr.allSeated(u) && !(R.stowing && R.stowing.length)) { R.rearOpen = false; if (R.rear <= 0.02) this.afterPack(u); } else for (const o of u.officers) if (o.mode === 'foot' && !o.q?.length) { this.toCab(o); } return;
      case 'todrop': this.toDrop(u, dt); return;
      case 'leave': { if (!pr.allSeated(u)) { for (const o of u.officers) if (o.mode === 'foot' && !o.q?.length) { this.toCab(o); } return; } if (!R.going) { R.going = true; this.unpark(u); v.ai.route = null; v.ai.goal = null; v.ai.v0 = 11; if (flat) this.sound('rs.truck.accel', v.x, v.z, 14); }
        R.leaveT = (R.leaveT || 0) + dt; this.unjam(u, dt); if ((near > 140 && !pr.inView(v)) || near > 300 || R.leaveT > 150) this.dropUnit(u); return; }
      default:
    }
  }
  // two vehicles nosed into each other at a junction (lane AI: each waits for the other): the civilian driver backs up a few
  // metres (Traffic's own reverse manoeuvre) to let the truck through; a car that still blocks it long after, out of sight, is
  // recycled like any stuck traffic car (never one the player can see)
  unjam(u, dt) {
    const v = u.v, ai = v.ai; if (ai && ai.rejoin) { u.rjT = (u.rjT || 0) + dt; u.rjStill = Math.abs(v.speed) < 0.3 ? (u.rjStill || 0) + dt : 0; if (u.rjStill > 6 || u.rjT > 30) { u.rjT = 0; u.rjStill = 0; this.relane(u); } } else u.rjT = u.rjStill = 0; this.unjamBody(u, dt);
  }
  // 84th: the body-jam half on its own, shared with EMS (a returning ambulance and a car queued in its turn-around waited on each other)
  unjamBody(u, dt) {
    const v = u.v, ai = v.ai; const bb = ai && ai.bodyBlock; if (!bb || Math.abs(v.speed) > 0.3) { u.jamT = 0; return; } u.jamT = (u.jamT || 0) + dt; // relane: resting against something, or still not back in lane after 30 s
    const civ = bb.ai && !bb.player && !bb.police && !bb.squad && !bb.parked; if (!civ) return;
    if (u.jamT > 4 && !(bb.ai.reverse > 0) && (bb.speed || 0) < 0.3) { bb.ai.reverse = 3.5; bb.ai.wedgedT = 0; if (!u.jamNoted) { u.jamNoted = true; this.stats.unjams = (this.stats.unjams || 0) + 1; this.note(`unit ${u.id}: blocked by a ${bb.type} — it backs up`); } }
    if (u.jamT > 18 && !bb.keep && !this.seen(bb.x, bb.z)) { const T = this.T; const i = T.vehicles.indexOf(bb); if (i >= 0) T.vehicles.splice(i, 1); T.remove(bb); u.jamT = 0; this.stats.unjamRecycled = (this.stats.unjamRecycled || 0) + 1; }
  }
  // 80th: a unit easing back into its lane that has come to rest against something (a kerb, a wall): hand it to lane-following
  // with the offset (it decays over the next few metres); far off its lane and unseen, it is put back on it
  relane(u) { const v = u.v, ai = v.ai, pc = ai.pieces[0]; if (!pc) return; const [lx, lz, lyaw] = evalPiece(pc, Math.min(ai.s, pc.len)); const lat = (v.x - lx) * Math.cos(lyaw) - (v.z - lz) * Math.sin(lyaw);
    const ye = Math.atan2(Math.sin(v.yaw - lyaw), Math.cos(v.yaw - lyaw)); this.stats.relaned = (this.stats.relaned || 0) + 1;
    if ((Math.abs(lat) > 3.5 || Math.abs(ye) > 0.9) && !this.seen(v.x, v.z)) { ai.rejoin = false; ai.rjT = 0; ai.lat = 0; ai.hdg = 0; v.x = lx; v.z = lz; v.yaw = lyaw; return; }
    ai.rejoin = false; ai.rjT = 0; ai.lat = Math.max(-3.5, Math.min(3.5, lat)); ai.hdg = Math.max(-0.6, Math.min(0.6, ye)); }
  drive(u, dt) { this.unjam(u, dt);
    const R = u.rs, v = u.v, ai = v.ai, inc = R.inc, S = R.S; if (!inc || inc.done) { this.packUp(u, true); return; }
    const p0 = ai.pieces[0]; const tgt = R.ph === 'drive' ? S.park : null; if (v.speed < 0.3 && !(u.jamT > 0 && u.jamT < 30)) u.stuckT += dt; else if (v.speed >= 0.3) u.stuckT = 0; // held by a civilian car: unjam() deals with it first (replanning there only burns the unit's replans)
    if (p0 && p0.type === 'line' && !ai.rejoin && p0.seg === S.F.seg && p0.d[0] === S.F.d[0] && p0.d[1] === S.F.d[1]) {
      const al = (tgt.x - p0.p0[0]) * p0.d[0] + (tgt.z - p0.p0[1]) * p0.d[1]; const lat = (tgt.x - p0.p0[0]) * p0.d[1] - (tgt.z - p0.p0[1]) * p0.d[0];
      if (al > ai.s + 9 && al < p0.len + 3 && Math.abs(lat) < 6) { const sA = Math.max(ai.s + 2, al - 12); const path = parkPath(p0, sA, tgt); const cut = { ...p0, p1: [p0.p0[0] + p0.d[0] * sA, p0.p0[1] + p0.d[1] * sA], len: sA };
        ai.pieces = [cut, path]; ai.route = null; ai.goal = null; ai.park = { path, rs: true }; ai.sMaxP = path; ai.sMax = path.len - 0.02; ai.v0 = 7; R.ph = 'pullin'; R.t = 0; return; }
    }
    const gd = ai.goal && ai.goal.dist !== undefined ? ai.goal.dist : Infinity; if (!ai.goal && !ai.route && v.speed < 0.5) u.stuckT += dt;
    if ((gd < 6 && v.speed < 0.6) || u.stuckT > 8) { u.stuckT = 0; R.replans++; this.stats.replans++;
      if (R.replans > 4) { const d = Math.hypot(v.x - inc.v.x, v.z - inc.v.z); if (d < 35) { this.note(`unit ${u.id}: stops where it can (${d.toFixed(0)} m)`); this.parkUnit(u); } else { this.stats.aborted++; inc.unit = null; inc.ph = 'wait'; inc.due = this.t + 15; this.unitLeave(u, 'could not reach'); } return; }
      ai.goal = null; ai.route = null; this.planTo(u); }
    if (R.ct > 260) { this.stats.aborted++; inc.unit = null; inc.ph = 'wait'; inc.due = this.t + 15; this.unitLeave(u, 'took too long'); }
  }
  // stopped at the scene: out of the moving traffic into T.parked (passed like a kerb-parked vehicle), handbrake on
  parkUnit(u) {
    const R = u.rs, v = u.v, T = this.T; const ai = v.ai; ai.park = null; ai.sMaxP = null; ai.route = null; ai.goal = null; ai.stopped = true; v.speed = 0;
    const i = T.vehicles.indexOf(v); if (i >= 0) T.vehicles.splice(i, 1); v.parked = true; v.left = null; if (!T.parked.includes(v)) T.parked.push(v);
    if (v.T.roadside === 'flatbed') { this.sound('rs.truck.airbrake', v.x, v.z, 14); if (R.S.rev && Math.hypot(R.S.rev.x - v.x, R.S.rev.z - v.z) > 0.5) { R.ph = 'reverse'; R.t = 0; return; } }
    this.arrive(u);
  }
  reverse(u, dt) { // the flatbed backs up to the car's nose: reverse lamps on, beeper, ≤1.2 m/s, eased
    const R = u.rs, v = u.v, tg = R.S.rev; const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const rem = (v.x - tg.x) * fx + (v.z - tg.z) * fz; const rm = v.mesh.userData.revMat;
    if (rem <= 0.03 || R.t > 25) { if (rm) rm.emissiveIntensity = 0; v.speed = 0; this.arrive(u); return; }
    const sp = Math.min(1.2, 0.25 + rem * 0.6, R.t * 0.8); const st = Math.min(rem, sp * dt); v.x -= fx * st; v.z -= fz * st; v.y = L.groundY(v.x, v.z); v.speed = -sp; v.sync(dt); if (rm) rm.emissiveIntensity = 2.4;
    this.loop('rs.rev.' + u.id, 'rs.truck.beeper', v.x - fx * 3.5, v.z - fz * 3.5, 8, 1);
  }
  arrive(u) { const R = u.rs, v = u.v; v.speed = 0; R.ph = 'work'; R.t = 0; R.step = 0; this.pr.dismount(u, 'roadside'); u.task = 'rs'; R.inc.ph = 'service'; this.note(`unit ${u.id} on scene (#${R.inc.id})`);
    this.sound('rs.van.door', v.x, v.z, 8); if (v.T.roadside === 'flatbed') this.driverOut(R.inc); }
  // the broken car's driver gets out and walks off before it is loaded (lane-AI cars only)
  driverOut(inc) { const v = inc.v, T = this.T; if (!v.driverChar || inc.own) return; const seats = v.mesh.userData.seats; const ds = Math.max(0, seats.indexOf(v.driverSeat())); const n = (v.pax || []).length;
    v.pax = [v.driverChar, ...(v.pax || [])]; v.paxPlan = [{ si: ds, spec: v.driverChar.spec, mode: 'lap' }, ...(v.paxPlan || []).slice(0, n)]; v.driverChar = null; T.paxCount++; T.disembark(v, 'calm'); }
  unpark(u) { const v = u.v, T = this.T; const pi = T.parked.indexOf(v); if (pi >= 0) T.parked.splice(pi, 1); v.parked = false; if (!T.vehicles.includes(v)) T.vehicles.push(v); v.ai.stopped = false; rejoinLane(T, v, 40); }

  // ------------------------------------------------------------- crew: task queues (each mechanic works through his own list)
  // a task: { at(o) → {x, z, yaw}, act, dur, lean, look, holds(o) → [L, R], start(o), end(o), wait() → bool, every: [s, fn] }
  mech(o, u, dt) {
    const ems = this.pr.ems, R = u.rs; const q = o.q || (o.q = []); let tk = q[0];
    while (tk && tk.skip && tk.skip()) { q.shift(); tk = q[0]; }
    if (!tk) { const inc = R && R.inc; const v = inc && inc.v; if (v && !o.want) { const yaw = Math.atan2(v.x - o.x, v.z - o.z); o.want = { x: o.x, z: o.z, yaw, act: null, look: 0.2 }; } else if (o.want) o.want.act = null; ems.medic(o, u, dt); this.carryPose(o, dt); return; }
    if (!tk.p) tk.p = tk.at(o); let p = tk.p; let ready = !tk.wait || tk.wait();
    // 84th: a job at the van's rear doors waits beside them, outside the leaves' swing, until they are fully open (he swings them open
    // from there); only then he steps into the doorway — before, he stood 0.55 m behind the bumper while the leaves opened through him
    let doorAct = null; if (tk.at.rear && u.v.mesh.userData.rear && R.rear < 0.85) { p = tk.side || (tk.side = this.rearSide(u, tk.p)); ready = false;
      if (o.placedT > 0.3) { doorAct = 'mechBend'; if (!R.rearOpen) { R.rearOpen = true; const v = u.v; this.sound('rs.van.door', v.x - Math.sin(v.yaw) * 2.5, v.z - Math.cos(v.yaw) * 2.5, 8); } } }
    const w = { x: p.x, z: p.z, yaw: p.yaw, act: doorAct || (ready || o.placedT > 0 ? tk.act || null : null), lean: doorAct ? 0.15 : tk.lean ?? 0.4, look: tk.look ?? 0.4 };
    if (o.carry && o.carry.two) w.act = o.placedT > 0 && ready ? tk.act || 'medCarry' : 'medCarry';
    if (tk.holds && o.placedT > 0.3) { const H = tk.holds(o); w.holdL = H[0]; w.holdR = H[1]; }
    o.toolAt = null; if (tk.work && o.placedT > 0.3 && ready) tk.work(o, w); // 89th: the tool on its fitting (spanner on a bolt / brace on a nut): sets both hands (+ the right hand's orientation)
    o.want = w; ems.medic(o, u, dt); this.carryPose(o, dt); if (o.tool) toolPose(o);
    if (o.placedT > 0.3 && ready) { if (!tk.began) { tk.began = true; tk.t = 0; if (tk.start) tk.start(o); } tk.t += dt * RS.workK;
      if (tk.every) { tk.et = (tk.et ?? tk.every[0] * 0.5) - dt; if (tk.et <= 0) { tk.et = tk.every[0] * (0.8 + Math.random() * 0.4); tk.every[1](o); } }
      if (tk.t >= (tk.dur ?? 0.5)) { if (tk.end) tk.end(o); q.shift(); o.placedT = 0; o.wantKey = null; o.ch.anim.holdWL = o.ch.anim.holdWR = null; } }
  }
  // beside the rear doors, outside both leaves' arcs (hinges ±0.66 m, 0.655 m leaves opening 109°): 1.2 m out, 0.35 m behind, facing in
  rearSide(u, p) { const v = u.v, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const lx = (p.x - v.x) * fz - (p.z - v.z) * fx; const sx = lx > 0.05 ? 1 : lx < -0.05 ? -1 : 1;
    const q = this.w(v, sx * 1.2, -(v.T.len / 2 + 0.35)); return this.faceTo(q, v.x - fx * (v.T.len / 2) + fz * sx * 0.3, v.z - fz * (v.T.len / 2) - fx * sx * 0.3); }
  // a prop in a mechanic's hand: hangs below the right hand (toolbox, battery pack, jack, cones, triangle) or, two-handed,
  // in front of the chest (spare / flat tyre) with both hands IK-gripped to its sides
  carry(o, m, two = false) { o.carry = { m, two, k: 1, from: null }; m.visible = true; }
  blendCarry(o, m, dt = 1 / 60) { const c = o.carry; if (!c || !c.from || c.k >= 1) return; c.k = Math.min(1, c.k + dt / 0.45); const e = c.k * c.k * (3 - 2 * c.k); _v.copy(m.position); m.position.lerpVectors(c.from, _v, e); if (c.k >= 1) c.from = null; } // 84th: out of the van into the hand (no pop)
  unCarry(o) { const c = o.carry; o.carry = null; if (c && c.two && o.ch && o.ch.anim) { o.ch.anim.holdWL = o.ch.anim.holdWR = null; if (o.ch.anim.action === 'medCarry') o.ch.anim.set(null); } return c ? c.m : null; }
  carryPose(o, dt = 1 / 60) {
    const c = o.carry; if (!c) return; const m = c.m; if (this.dP(o.x, o.z) > 90) { m.visible = false; return; } m.visible = true;
    if (c.two) { const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw); const y = (o.y || 0) + 0.98; m.position.set(o.x + fx * 0.42, y, o.z + fz * 0.42); m.rotation.set(0, o.yaw + Math.PI / 2, 0, 'YXZ'); this.blendCarry(o, m, dt); // tyre upright in front of him, its face toward him (axle along his forward)
      const rx = Math.cos(o.yaw), rz = -Math.sin(o.yaw); const W = o.want; if (W) { W.holdL = { x: m.position.x + rx * 0.28, y: y - 0.02, z: m.position.z + rz * 0.28 }; W.holdR = { x: m.position.x - rx * 0.28, y: y - 0.02, z: m.position.z - rz * 0.28 }; } return; }
    const h = o.ch.bones && o.ch.bones.handR; if (!h) return; h.updateWorldMatrix(true, false); h.getWorldPosition(_v); const k = m.userData.kind; const drop = k === 'toolbox' ? 0.3 : k === 'battery' ? 0.33 : k === 'cone' ? 0.1 : k === 'triangle' ? 0.42 : k === 'worklight' ? 0.66 : 0.14;
    m.position.set(_v.x, Math.max((o.y || 0) + 0.02, _v.y - drop), _v.z); m.rotation.set(0, o.yaw + (k === 'jack' ? Math.PI : 0), 0); this.blendCarry(o, m, dt);
  }
  // the prop put down at a world point (rests on the ground / the deck)
  place(u, m, x, z, yaw, opts = {}) { const R = u.rs; m.position.set(x, (opts.y ?? this.ground(x, z)) + (opts.dy || 0), z); m.rotation.set(opts.rx || 0, yaw, opts.rz || 0, 'YXZ'); m.visible = true; if (!R.props.some((p) => p.m === m)) R.props.push({ m, x, z }); }
  pick(u, m) { const R = u.rs; R.props = R.props.filter((p) => p.m !== m); }
  // local (vehicle) → world helpers
  w(v, lx, lz, yawOff = 0) { const c = Math.cos(v.yaw), s = Math.sin(v.yaw); return { x: v.x + lx * c + lz * s, z: v.z - lx * s + lz * c, yaw: v.yaw + yawOff }; }
  faceTo(p, tx, tz) { p.yaw = Math.atan2(tx - p.x, tz - p.z); return p; }
  wheelOf(v, flatOnly = true) { const W = v.mesh.userData.wheels || []; return W.find((w) => w.userData && w.userData.flat) || (flatOnly ? null : W.find((w) => w.position.x > 0) || W[0]); }

  // ------------------------------------------------------------- the jobs
  work(u, dt) {
    const R = u.rs, v = u.v, inc = R.inc, pr = this.pr; if (!R.started) { if (!u.officers.every((o) => o.mode === 'foot' || o.mode === 'down')) return; R.started = true; for (const o of u.officers) { o.q = []; o.want = null; } if (v.T.roadside === 'flatbed') this.planFlatbed(u); else this.planVan(u); }
    if (R.deckGoal !== undefined) this.deck(u, dt);
    if (R.winch) this.winch(u, dt);
    if (R.jack) this.jackPose(u, dt);
    if (inc && inc.ph === 'service' && R.working && this.dP(inc.v.x, inc.v.z) < 40) this.loop('rs.amb.' + u.id, 'rs.ambience', inc.v.x, inc.v.z, 6, 0.9);
    if (R.t > 420) { this.note(`unit ${u.id}: job overran — packing up`); this.packUp(u, true); } // safety net (never stuck at a scene)
    if (R.done && u.officers.every((o) => !o.q || !o.q.length) && !R.packing) this.packUp(u, false);
    void dt; void pr;
  }
  // a van job (84th: the staged workflow with the van's own kit — RoadsideJob.js)
  planVan(u) { planVanJob(this, u); }
  faultOf(kind) { return FAULTS[kind]; }
  verdict(u, job) { const R = u.rs, inc = R.inc, car = inc.v, ch = car.T.len / 2; const ok = Math.random() < job.ok * (inc.own ? 1.05 : 1); R.ok = ok;
    if (ok) { if (inc.kind === 'flat') this.fixTyres(car); else this.fixEngine(car); this.stats.repaired++; this.sound('rs.restart', car.x, car.z, 12); }
    else { this.stats.failed++; this.sound('rs.start.struggle', car.x, car.z, 10); } R.working = false; R.done = true; void ch; }
  kit(u) { return kitReport(u ? u.v || u : null); }
  toCab(o) { o.mode = 'return'; o.goal = null; o.want = null; o.q = []; o.stuck = false; const A = o.ch && o.ch.anim; if (A) { A.set(null); A.holdWL = A.holdWR = null; } }
  lastAt(o) { const q = o.q && o.q[0]; return q && q.p ? q.p : { x: o.x, z: o.z, yaw: o.yaw }; }
  // the job is over (or abandoned): carry everything back, doors shut, crew in; then the car goes / the flatbed is called
  packUp(u, abort) {
    const R = u.rs, v = u.v; if (R.packing) return; R.packing = true; R.done = true; R.working = false; R.abort = abort; const van = v.T.roadside === 'van';
    if (!u.officers.some((o) => o.mode === 'foot')) { for (const p of R.props) stowKit(this, u, p.m); R.props = []; stowNow(this, u); bonnetGone(R); R.ph = 'mount'; return; }
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const atRear = (lx) => Object.assign(() => { if (!van) return this.faceTo(this.w(v, v.T.wid / 2 + 0.6, 0.4), v.x, v.z); const p = this.w(v, lx, -(v.T.len / 2 + 0.55)); return this.faceTo(p, p.x + fx, p.z + fz); }, { rear: van });
    const atSide = () => this.rearSide(u, this.w(v, 0.3, -(v.T.len / 2 + 0.55))); // closing: from beside the doors (never inside the swing)
    const stowTask = (o, lx) => ({ at: atRear(lx), act: 'mechBend', lean: 0.45, dur: 1.1, start: () => { R.rearOpen = true; }, wait: () => !van || R.rear > 0.85, end: () => { stowKit(this, u, this.unCarry(o)); this.sound('rs.tools', v.x - fx * 2.5, v.z - fz * 2.5, 8); } });
    const crew = u.officers.filter((o) => o.mode === 'foot'); let i = 0; const car = R.inc && R.inc.v;
    for (const [n, o] of crew.entries()) { o.q = o.q && !abort ? o.q.filter((t) => t.began) : []; const lx = n ? 0.35 : -0.35; if (o.tool) putTool(this, o); if (o.carry) o.q.push(stowTask(o, lx)); }
    if (R.bonnet && car) { const L = crew[0], ch = car.T.len / 2; L.q.unshift({ at: () => this.faceTo(this.w(car, 0, ch + 0.45), car.x, car.z), act: 'mechBend', lean: 0.45, dur: 2.0, start: () => { if (R.bonnet) R.bonnet.goal = 0; }, end: () => this.sound('rs.bonnet.close', car.x + Math.sin(car.yaw) * ch, car.z + Math.cos(car.yaw) * ch, 9) }); } // (abandoned mid-job: shut it first)
    const left = R.props.slice(); if (R.jack) { R.jack.goal = 0; }
    // the cones and the triangle last (traffic protection stays out until everything else is in): sort by distance from the car
    if (car) left.sort((a, b) => (a.m.userData.kind === 'cone' || a.m.userData.kind === 'triangle' ? 1 : 0) - (b.m.userData.kind === 'cone' || b.m.userData.kind === 'triangle' ? 1 : 0));
    for (const pp of left) { const o = crew[i++ % crew.length]; const m = pp.m; const lx = crew.indexOf(o) ? 0.35 : -0.35;
      o.q.push({ at: () => { const dx = o.x - m.position.x, dz = o.z - m.position.z, l = Math.hypot(dx, dz) || 1; return this.faceTo({ x: m.position.x + dx / l * 0.55, z: m.position.z + dz / l * 0.55 }, m.position.x, m.position.z); }, act: 'mechSquat', dur: 1.2, wait: () => !R.jack || R.jack.k < 0.02 || m.userData.kind !== 'jack',
        end: () => { if (m.userData.kind === 'jack') R.jack = null; this.pick(u, m); this.carry(o, m, m.userData.kind === 'tyre'); this.sound(m.userData.kind === 'cone' ? 'rs.cone' : m.userData.kind === 'triangle' ? 'rs.triangle' : 'rs.tools', m.position.x, m.position.z, 9); } },
      stowTask(o, lx)); }
    R.ph = 'packing'; R.abort = abort; R.secured = false;
    // all in: one of them shuts the rear doors (a real close at the doors, not on their own once he is in the cab), then the cab
    const chk = () => { if (!crew.every((o) => !o.q.length || o.mode !== 'foot') || (R.stowing && R.stowing.length)) return false;
      const S = crew.find((o) => o.mode === 'foot'); if (van && !R.secured && S) { R.secured = 'busy';
        for (const o of crew) if (o !== S && o.mode === 'foot') o.q.push({ at: () => this.rearSide(u, { x: o.x, z: o.z }), act: null, dur: 0.4 }); // 84th: the other one steps out of the swing
        S.q.push({ at: atSide, act: 'mechBend', lean: 0.2, dur: 1.6, wait: () => this.pr.ems.doorsClear(u), start: () => { R.rearOpen = false; }, end: () => { R.secured = true; this.sound('rs.van.door', v.x - fx * 2.5, v.z - fz * 2.5, 9); } }); return false; }
      if (van && R.secured !== true && S) return false;
      for (const o of crew) if (o.mode === 'foot') { this.toCab(o); } R.ph = 'mount'; this.sound('rs.van.door', v.x, v.z, 8); return true; };
    R.packCheck = chk;
  }
  afterPack(u) {
    const R = u.rs, inc = R.inc; if (R.after) return; R.after = true;
    if (inc && !inc.done && !R.abort) {
      if (u.v.T.roadside === 'flatbed' && R.loaded) { this.hazards(inc, false); R.ph = 'todrop'; R.t = 0; R.dropT = 0; this.unpark(u); this.sound('rs.truck.accel', u.v.x, u.v.z, 14); this.planDrop(u); inc.done = true; this.incidents = this.incidents.filter((q) => q !== inc); return; }
      if (R.ok) this.carGo(inc);
      else if (inc.need !== 'flatbed') { inc.need = 'flatbed'; inc.unit = null; inc.ph = 'wait'; inc.due = this.t + 4; inc.tries = 0; this.note(`#${inc.id}: not fixable at the roadside — flatbed requested`); if (inc.own && this.g.hud) this.g.hud.notify('Street Customs Roadside', 'It can\'t be fixed here — a recovery flatbed is coming to take it to Street Customs.', 'info', 5); }
    } else if (inc && !inc.done && inc.unit === u) { inc.unit = null; if (inc.ph !== 'wait') { inc.ph = 'wait'; inc.due = this.t + 10; } }
    if (inc && inc.own && R.ok && this.g.story && this.g.story.pay) { this.g.story.pay(-1500, 'Street Customs roadside repair'); if (this.g.hud) this.g.hud.notify('Street Customs Roadside', 'Fixed — Rs. 1,500 charged. Drive safely.', 'info', 4); }
    R.ph = 'leave'; R.t = 0; R.leaveT = 0;
  }
  // ------------------------------------------------------------- repairs (VehicleDamage state, exactly what broke)
  fixTyres(v) { const vd = v.vd; for (const w of v.mesh.userData.wheels || []) { const u = w.userData; if (u && u.flat) { u.flat = false; u.drop = 0; if (vd) vd.flats = Math.max(0, vd.flats - 1); } w.visible = true; } v.flat = false; if (this.g.vdamage) { this.g.vdamage.fitDrops(v); this.g.vdamage.setPower(v); } }
  fixEngine(v) { v.health = Math.max(v.health ?? 100, 70); if (this.g.vdamage && v.vd) this.g.vdamage.setPower(v); else v.power = 1; }
  // jack: the wheel's corner of the body comes up ~6 cm (pitch / roll toward that corner)
  jackPose(u, dt) { const J = u.rs.jack, car = u.rs.inc.v; J.k += Math.sign(J.goal - J.k) * Math.min(Math.abs(J.goal - J.k), dt / 2.2); const k = sm(J.k); const wp = J.w.position; const ch = car.T.len / 2;
    car.wreckLift = 0.03 * k; car.roll = -Math.sign(wp.x) * 0.035 * k; car.pitch = -Math.sign(wp.z) * 0.02 * k * (Math.abs(wp.z) / Math.max(1, ch)); car.sync(0); if (J.k < 0.001 && J.goal === 0) { car.wreckLift = 0; car.roll = 0; car.pitch = 0; car.sync(0); } }

  // ------------------------------------------------------------- the flatbed
  planFlatbed(u) {
    const R = u.rs, v = u.v, inc = R.inc, car = inc.v, A = u.officers[0], B = u.officers[1] || null; const P = this.propsOf(); const W = v.T.wid / 2, ch = car.T.len / 2;
    const station = () => this.faceTo(this.w(v, -(W + 0.55), 1.25), v.x, v.z); const locker = () => this.faceTo(this.w(v, W + 0.6, 0.2), v.x, v.z);
    R.deckGoal = 0; R.deckK = 0; R.lzF = 1.48 - 0.75 - ch - FLAT.rearZ0; // car centre on the stowed deck, measured from the deck's rear edge
    if (B) { for (const z of [-(car.T.len + 7.4 + 2), -(car.T.len + 7.4 + 6)]) B.q.push({ at: locker, act: 'mechBend', lean: 0.3, dur: 0.6, end: () => this.carry(B, P.get('cone')) }, { at: () => this.w(v, -(W + 0.3), z, Math.PI), act: 'mechSquat', dur: 0.7, end: () => { const m = this.unCarry(B); const p = this.lastAt(B); if (m) this.place(u, m, p.x + Math.sin(p.yaw) * 0.45, p.z + Math.cos(p.yaw) * 0.45, p.yaw); this.sound('rs.cone', p.x, p.z, 9); } }); }
    A.q.push({ at: station, act: null, dur: 0.4, look: 0.1, end: () => { R.deckGoal = 1; this.sound('rs.equipment', v.x, v.z, 9); } });
    A.q.push({ at: station, act: null, dur: 0.2, look: 0.1, wait: () => R.deckK > 0.995 });
    R.flip = Math.abs(angDiff(car.yaw, v.yaw)) > Math.PI / 2; // the car faces away from the truck: it goes up the ramp backwards (hooked at the rear)
    const nose = () => this.faceTo(this.w(car, 0.35, R.flip ? -(ch + 0.5) : ch + 0.5), car.x, car.z);
    A.q.push({ at: nose, act: 'mechSquat', lean: 0.5, dur: 2.2, end: () => { R.hooked = true; this.sound('rs.connect', car.x + Math.sin(car.yaw) * ch, car.z + Math.cos(car.yaw) * ch, 10); this.beginCarry(u); } });
    A.q.push({ at: station, act: null, dur: 0.3, look: 0.1, end: () => { R.winch = { dir: 1 }; } });
    A.q.push({ at: station, act: null, dur: 0.2, look: 0.1, wait: () => !R.winch });
    // straps over the four wheels (attached to the car: they ride with it)
    const wheels = (car.mesh.userData.wheels || []).slice(0, 4);
    for (const [o, side] of [[A, -1], [B || A, 1]]) for (const w of wheels.filter((q) => (Math.sign(q.position.x) || 1) === side * (R.flip ? -1 : 1) || !B)) {
      o.q.push({ at: () => { const wp = this.carWheelWorld(car, w); const s = this.w(v, side * (FLAT.deckW / 2 + 0.45), 0); const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw); const off = (wp.x - v.x) * lx + (wp.z - v.z) * lz; const p = { x: wp.x + lx * (side * (FLAT.deckW / 2 + 0.45) - off), z: wp.z + lz * (side * (FLAT.deckW / 2 + 0.45) - off) }; void s; return this.faceTo(p, wp.x, wp.z); },
        act: 'mechBend', lean: 0.55, look: 0.5, dur: 2.4, wait: () => R.onDeck && !R.winch, holds: () => { const wp = this.carWheelWorld(car, w); return [{ x: wp.x, y: wp.y + 0.15, z: wp.z }, { x: wp.x, y: wp.y + 0.05, z: wp.z }]; },
        end: () => { const m = P.get('strap'); car.mesh.add(m); m.position.set(w.position.x, w.position.y + car.T.wheelR + 0.012, w.position.z); m.rotation.set(0, 0, 0); (R.straps || (R.straps = [])).push(m); this.sound('rs.equipment', v.x, v.z, 9); } }); }
    A.q.push({ at: station, act: null, dur: 0.3, look: 0.1, wait: () => (R.straps || []).length >= wheels.length, end: () => { R.deckGoal = 0; } });
    A.q.push({ at: station, act: null, dur: 0.3, look: 0.1, wait: () => R.deckK < 0.005, end: () => { R.ok = true; R.done = true; R.loaded = true; this.stats.towed++; } });
    if (B) B.q.push({ at: locker, act: null, dur: 0.3, wait: () => R.done });
  }
  deck(u, dt) { // hydraulics: 9 s for the full tilt + slide, beeper + hydraulic loops while it moves
    const R = u.rs, v = u.v, D = v.mesh.userData.deck; if (!D) return; const g = R.deckGoal; if (Math.abs(g - R.deckK) < 1e-4) return;
    R.deckK += Math.sign(g - R.deckK) * Math.min(Math.abs(g - R.deckK), dt / 9); setFlatDeck(D, R.deckK); const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    this.loop('rs.hyd.' + u.id, 'rs.truck.hydraulic', v.x - fx * 1.5, v.z - fz * 1.5, 7, 1); this.loop('rs.bp.' + u.id, 'rs.beeper', v.x - fx * 3.6, v.z - fz * 3.6, 7, 0.9);
  }
  // the car's pose while it is winched / carried: lz = its centre along the deck line from the deck's rear edge (negative =
  // still on the road behind it). Each axle follows the surface under it (road or tilted deck) → real pitch over the ramp.
  beginCarry(u) {
    const R = u.rs, v = u.v, car = R.inc.v, T = this.T; const D = v.mesh.userData.deck; const p = deckPose(R.deckK);
    const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw), fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const rx = car.x - v.x, rz = car.z - v.z;
    const zT = rx * fx + rz * fz, xT = rx * lx + rz * lz; const W = car.mesh.userData.wheels || []; let fa = car.T.len * 0.3, ra = -car.T.len * 0.3; if (W.length) { fa = Math.max(...W.map((w) => w.position.z)); ra = Math.min(...W.map((w) => w.position.z)); }
    if (R.flip) { const f2 = -ra; ra = -fa; fa = f2; } // axle positions along the truck's axis
    R.carried = { v: car, lz: zT - p.oz, x0: xT, yaw0: angDiff(car.yaw, v.yaw + (R.flip ? Math.PI : 0)), base: R.flip ? Math.PI : 0, fa, ra, lzStart: zT - p.oz };
    const pi = T.parked.indexOf(car); if (pi >= 0) T.parked.splice(pi, 1); car.keep = true; car.towedBy = v; R.inc.loaded = true; void D;
  }
  winch(u, dt) {
    const R = u.rs, C = R.carried; if (!C) { R.winch = null; return; } const goal = R.winch.dir > 0 ? R.lzF : C.lzOff; const sp = 0.42;
    C.lz += Math.sign(goal - C.lz) * Math.min(Math.abs(goal - C.lz), sp * dt); const v = u.v; this.loop('rs.winch.' + u.id, 'rs.truck.winch', v.x - Math.sin(v.yaw) * 2, v.z - Math.cos(v.yaw) * 2, 7, 1);
    if (Math.abs(goal - C.lz) < 1e-3) { R.winch = null; if (R.unloading) this.unloaded(u); else R.onDeck = true; }
  }
  surf(k, lz) { const p = deckPose(k); if (lz >= 0) return [p.oz + Math.cos(p.angle) * lz, p.oy + Math.sin(p.angle) * lz + FLAT.deckT * Math.cos(p.angle)]; return [p.oz + lz, 0]; } // [truck-space z, height]
  poseCarried(u) {
    const R = u.rs, C = R.carried, v = u.v, car = C.v; if (!car || car.disposed) { R.carried = null; return; }
    const k = R.deckK; const [zf, yf] = this.surf(k, C.lz + C.fa), [zr, yr] = this.surf(k, C.lz + C.ra); const pitch = Math.atan2(yf - yr, zf - zr); const t = -C.ra / Math.max(0.5, C.fa - C.ra);
    const zc = zr + (zf - zr) * t, yc = yr + (yf - yr) * t; const al = sm((C.lz - C.lzStart) / Math.max(0.5, -C.lzStart - C.fa + 0.01)); const x = C.x0 * (1 - al), yo = C.yaw0 * (1 - al);
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw); car.x = v.x + x * c + zc * s; car.z = v.z - x * s + zc * c; car.y = (v.y || 0) + yc; car.yaw = v.yaw + C.base + yo; car.pitch = C.base ? pitch : -pitch; car.roll = 0; car.tPitch = 0; car.tRoll = 0; car.speed = v.speed;
    car.carried = C.lz + C.ra > -0.05; car.sync(0); this.cable(u, R.hooked && (R.winch || C.lz < R.lzF - 0.01) ? car : null);
  }
  carWheelWorld(car, w) { car.mesh.updateMatrixWorld(true); w.updateWorldMatrix(true, false); const p = w.getWorldPosition(new THREE.Vector3()); return { x: p.x, y: p.y, z: p.z }; }
  // the winch cable: drum (deck head) → the car's towing eye (front, low)
  cable(u, car) {
    const v = u.v, D = v.mesh.userData.deck; if (!D) return; const cb = D.cable; if (!car) { cb.visible = false; D.hook.visible = false; return; }
    cb.visible = true; D.hook.visible = true; const p = deckPose(u.rs.deckK); const lz = FLAT.deckL - 0.3; const a = new THREE.Vector3(0, p.oy + Math.sin(p.angle) * lz + Math.cos(p.angle) * (FLAT.deckT + 0.22), p.oz + Math.cos(p.angle) * lz - Math.sin(p.angle) * (FLAT.deckT + 0.22));
    const ch = (car.T.len / 2 + 0.02) * (u.rs.flip ? -1 : 1); const c = Math.cos(car.yaw), s = Math.sin(car.yaw); const hw = new THREE.Vector3(car.x + ch * s, (car.y || 0) + 0.32, car.z + ch * c); v.mesh.updateMatrixWorld(true); const b = v.mesh.worldToLocal(hw);
    const d = b.clone().sub(a); const len = d.length() || 0.01; cb.position.copy(a).addScaledVector(d, 0.5); cb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); cb.scale.set(0.011, len, 0.011); D.hook.position.copy(b); if (cb.parent !== v.mesh) v.mesh.add(cb); if (D.hook.parent !== v.mesh) v.mesh.add(D.hook);
  }
  dropCarried(u) { const R = u.rs, C = R.carried; if (!C) return; const car = C.v; car.carried = false; car.towedBy = null; for (const m of R.straps || []) this.propsOf().put(m); R.straps = []; R.carried = null; this.cable(u, null); return car; }
  // ---- delivery to Street Customs (the kerb in front of the roller door, on the site's side of the road)
  // the site faces a north–south road (x = S.x); its kerb lane runs along +z·side (left-hand traffic: the kerb on the left). The
  // truck stops 17 m past the drive's centre so the car it unloads behind it lands just past the drive mouth (never across it)
  dropSite() { const S = L.CUSTOMS_SITE; const side = S.side; const x = S.x + side * (S.hw - 1.3); return { spot: { x, z: S.zc + side * 17, yaw: Math.atan2(0, side) }, appr: { x: S.x + side * S.hw * 0.5, z: S.zc - side * 25 }, seg: S.seg, d: [0, side] }; }
  planDrop(u) { const D = this.dropSite(); u.rs.drop = D; const [a, b] = segNodes(D.seg); const enter = (b.x - a.x) * D.d[0] + (b.z - a.z) * D.d[1] > 0 ? a : b; // driven along d: the site's kerb on its left
    return this.pr.plan(u, D.appr.x, D.appr.z, false, enter); }
  toDrop(u, dt) {
    const R = u.rs, v = u.v, ai = v.ai, D = R.drop; R.dropT += dt; const near = this.dP(v.x, v.z); if (!R.unload) this.unjam(u, dt);
    if ((near > 220 && !this.pr.inView(v)) || R.dropT > 420) { this.deliverUnseen(u); this.dropUnit(u); return; }
    if (R.unload) { this.unloadStep(u, dt); return; }
    const p0 = ai.pieces[0]; if (v.speed < 0.3 && !(u.jamT > 0 && u.jamT < 30)) u.stuckT += dt; else if (v.speed >= 0.3) u.stuckT = 0;
    if (!ai.park && p0 && p0.type === 'line' && p0.seg === D.seg && p0.d[0] === D.d[0] && p0.d[1] === D.d[1]) { const t = D.spot; const al = (t.x - p0.p0[0]) * p0.d[0] + (t.z - p0.p0[1]) * p0.d[1];
      if (al > ai.s + 9 && al < p0.len + 2) { const sA = Math.max(ai.s + 2, al - 12); const path = parkPath(p0, sA, t); const cut = { ...p0, p1: [p0.p0[0] + p0.d[0] * sA, p0.p0[1] + p0.d[1] * sA], len: sA }; ai.pieces = [cut, path]; ai.route = null; ai.goal = null; ai.park = { path, rs: true }; ai.sMaxP = path; ai.sMax = path.len - 0.02; ai.v0 = 7; return; } }
    if (ai.park) { const path = ai.park.path; if (ai.pieces[0] === path && ((ai.s >= path.len - 0.06 && v.speed < 0.15) || ai.s >= path.len - 0.021)) { this.parkUnit2(u); this.beginUnload(u); } return; }
    const gd = ai.goal && ai.goal.dist !== undefined ? ai.goal.dist : Infinity; if ((gd < 6 && v.speed < 0.6) || u.stuckT > 8) { u.stuckT = 0; ai.goal = null; ai.route = null; this.planDrop(u); }
  }
  parkUnit2(u) { const v = u.v, T = this.T, ai = v.ai; ai.park = null; ai.sMaxP = null; ai.stopped = true; v.speed = 0; const i = T.vehicles.indexOf(v); if (i >= 0) T.vehicles.splice(i, 1); v.parked = true; if (!T.parked.includes(v)) T.parked.push(v); this.sound('rs.truck.airbrake', v.x, v.z, 14); }
  beginUnload(u) { const R = u.rs, v = u.v; R.unload = { ph: 'out' }; this.pr.dismount(u, 'roadside'); const A = u.officers[0]; if (!A) { R.unload.ph = 'deck'; return; }
    const station = () => this.faceTo(this.w(v, -(v.T.wid / 2 + 0.55), 1.25), v.x, v.z); A.q = [{ at: station, act: null, dur: 0.5, look: 0.1, end: () => { if (R.unload) R.unload.ph = 'deck'; } }, { at: station, act: null, dur: 0.3, look: 0.1, wait: () => !R.unload }];
    for (const o of u.officers) if (o !== A) o.q = [{ at: () => this.faceTo(this.w(v, v.T.wid / 2 + 0.6, -2.5), v.x - Math.sin(v.yaw) * 6, v.z - Math.cos(v.yaw) * 6), act: null, dur: 0.3, wait: () => !R.unload }]; }
  unloadStep(u, dt) { // at the garage (watched): deck down, winch out, unhook, deck up, off — the car stays on the kerb there
    const R = u.rs, U = R.unload; U.t = (U.t || 0) + dt; const C = R.carried;
    if (R.deckGoal !== undefined) this.deck(u, dt); if (R.winch) this.winch(u, dt);
    if (U.ph === 'out') { if (U.t > 30) U.ph = 'deck'; return; } // the operator walks to the control station first
    if (U.ph === 'deck') { R.deckGoal = 1; if (R.deckK > 0.995) { U.ph = 'winch'; if (C) { for (const m of R.straps || []) this.propsOf().put(m); R.straps = []; C.lzOff = -(C.fa + 1.2); C.x0 = 0; C.yaw0 = 0; R.winch = { dir: -1 }; R.unloading = true; this.sound('rs.equipment', u.v.x, u.v.z, 9); } } }
    else if (U.ph === 'up' && R.deckK < 0.005) { R.unload = null; R.ph = 'leave'; R.going = false; R.leaveT = 0; this.unparkLater(u); }
    if (U.t > 90) { this.deliverUnseen(u); R.unload = null; R.deckGoal = 0; setFlatDeck(u.v.mesh.userData.deck, 0); R.deckK = 0; R.ph = 'leave'; R.going = false; }
  }
  unparkLater(u) { u.rs.going = false; }
  unloaded(u) { const R = u.rs; R.unloading = false; R.hooked = false; const car = this.dropCarried(u); if (car) this.settleCar(car, u); R.unload.ph = 'up'; R.deckGoal = 0; this.sound('rs.connect', u.v.x, u.v.z, 9); }
  settleCar(car, u) { const T = this.T; car.pitch = 0; car.roll = 0; car.y = L.groundY(car.x, car.z); car.speed = 0; car.wreckLift = 0; car.sync(0); car.towedBy = null; T.release(car, false); this.stats.delivered++; if (car.ownerId) this.ownedAt(car); else this.delivered.push(car);
    if (u && this.g.hud && car.ownerId) this.g.hud.notify('Street Customs Roadside', 'Your vehicle is at Street Customs (Cinnamon Gardens), parked at the kerb outside.', 'info', 5); if (car.ownerId && this.g.story && this.g.story.pay) this.g.story.pay(-4500, 'Street Customs vehicle recovery'); }
  ownedAt(car) { const G = this.g.garage; const r = G && G.recordOf && G.recordOf(car); if (r) { r.x = +car.x.toFixed(2); r.z = +car.z.toFixed(2); r.yaw = +car.yaw.toFixed(3); } }
  // nobody watching: the car is at the garage now (owned: on the kerb outside Street Customs; a stranger's car: gone)
  deliverUnseen(u) {
    const R = u.rs; const inc = R.inc; let car = R.carried ? this.dropCarried(u) : inc && inc.v; if (!car || car.disposed) return; this.stats.deliveredUnseen++;
    if (inc && !inc.done) { inc.done = true; this.hazards(inc, false); this.incidents = this.incidents.filter((q) => q !== inc); } car.rsInc = null;
    const T = this.T; const pi = T.parked.indexOf(car); if (pi >= 0) T.parked.splice(pi, 1); const i = T.vehicles.indexOf(car); if (i >= 0) T.vehicles.splice(i, 1);
    if (car.ownerId) { const D = this.dropSite(); const free = !T.parked.some((o) => o !== car && Math.hypot(o.x - D.spot.x, o.z - D.spot.z) < 5); const z = D.spot.z - (free ? 0 : 7 * L.CUSTOMS_SITE.side); this.fixTyres(car); car.place(D.spot.x, z, D.spot.yaw); car.carried = false; car.towedBy = null; car.pitch = 0; car.roll = 0; car.sync(0); T.release(car, false); this.ownedAt(car); this.stats.delivered++; if (this.g.story && this.g.story.pay) this.g.story.pay(-4500, 'Street Customs vehicle recovery'); if (this.g.hud) this.g.hud.notify('Street Customs Roadside', 'Your vehicle has been delivered to Street Customs (Cinnamon Gardens).', 'info', 5); }
    else { car.keep = false; car.towedBy = null; car.carried = false; T.remove(car); this.stats.delivered++; }
    R.loaded = false;
  }

  // ------------------------------------------------------------- debug / tests (console `roadside`)
  status() { return { incidents: this.incidents.map((q) => ({ id: q.id, kind: q.kind, ph: q.ph, need: q.need, unit: q.unit ? q.unit.id : null, own: q.own, d: +this.dP(q.v.x, q.v.z).toFixed(0), tries: q.tries })), units: this.units.map((u) => ({ id: u.id, type: u.v && u.v.type, ph: u.rs.ph, inc: u.rs.inc ? u.rs.inc.id : null, crew: u.officers.map((o) => o.mode + (o.q && o.q.length ? ':' + o.q.length : '')).join(','), deck: +(u.rs.deckK || 0).toFixed(2) })), stats: this.stats, props: this.props ? { live: this.props.live.size, ...this.props.stats } : null }; }
  // force a breakdown on the nearest eligible lane-AI car (kind optional)
  force(kind = null, maxD = 200) {
    const T = this.T; let best = null, bd = maxD; for (const v of T.vehicles) { if (!this.eligible(v)) continue; const d = this.dP(v.x, v.z); if (d < 20) continue; if (d < bd) { bd = d; best = v; } }
    if (!best) return null; const k = kind || ['battery', 'flat', 'overheat', 'nostart', 'mechanical', 'engine', 'immobilised'][Math.floor(Math.random() * 7)]; return this.breakDown(best, k);
  }
  clear() { for (const u of this.units.slice()) this.dropUnit(u); for (const inc of this.incidents.slice()) { this.hazards(inc, false); if (inc.v) { inc.v.rsInc = null; if (!inc.own && inc.v.parked) { const T = this.T; const pi = T.parked.indexOf(inc.v); if (pi >= 0) T.parked.splice(pi, 1); inc.v.keep = false; T.remove(inc.v); } } } this.incidents = []; }
}
