// Sri Lanka Police response: wanted level, witness-based awareness, dispatch, road navigation, pursuit, search, stop/fine,
// arrest/release and stand-down. Original system (no assets or rules copied from other games).
//
// Awareness: the police only know what witnesses report (incident position, with error) or what an officer actually sees
// (range + line of sight, shorter at night / in rain / when crouching). Units never spawn near the player: they appear on a
// road 150–280 m away, outside the camera view, and DRIVE in along the road graph (Dijkstra over Layout nodes) using the
// normal traffic lane follower, with lights (and siren from 2 stars) — civilians pull over, units overtake through the
// centre of the road and may proceed through red signals.
//
// Global state: patrol → detected → investigating (1★) / responding (2★+) → pursuing → searching → return → patrol.
// Level decays only while searching: every time a search runs out without a sighting the level drops by one star.
// 1★ + officer catches up and the player stands still → on-the-spot fine. 2★+ and caught → arrest, taken to the
// nearest police station, fine (never more than the cash in hand), ammunition confiscated at 3★+, held for questioning.
// No wall-hacks: officers act only on what they (or a colleague, over the radio) have SEEN — the shared last-seen point
// and heading — never on the live position; per-officer sight is range + field of view + a ray stopped by walls and cars.
// 2★+: a running suspect within reach can be tackled (→ arrest). 4★+: officers draw their T-56 rifles, take cover behind
// stationary vehicles and return fire (Firefight.js); shot down by police → arrested, treated under guard at the National
// Hospital and released there. Every arrest plays the BUSTED sequence (Busted.js). Non-graphic throughout: hits are a red
// edge flash, hit officers stagger and at worst go down and recover.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { linePiece, segNodes, otherEnd, evalPiece } from '../vehicles/Traffic.js';
import { Character } from '../actors/Character.js';
import { makeMedicAppearance, makePoliceAppearance } from '../actors/Appearance.js';
import { seatCharacter } from '../actors/Seating.js';
import { boardCurve, poseBoard, npcBoardSetup, boardGroundFn, swingDoor, lapGrips, EXIT_K } from '../actors/Boarding.js';
import { Audio } from '../audio/Audio.js';
import { clamp, lerp } from '../core/math.js';
import { FootNav } from './FootNav.js';
import { Firefight } from './Firefight.js';
import { EMS } from './EMS.js';
import { BustedCinematic } from './Busted.js';
import { HOSPITAL } from '../actors/Health.js';
import { chaseAim, rejoinLane, applyPit, roadblockSite, makeSpikeStrip, overStrip, radioLine, compass, catchUpSpeed, straggler } from './Pursuit.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const UNITS_FOR = [0, 1, 3, 5, 6, 8];
// Wanted-level units are DISPATCHED, not conjured: each car leaves a police base (it pulls out of the compound gate onto
// the road and drives the whole route in) or — when the incident is far from both bases — comes in from a neighbouring
// division along a road at the edge of the map. The first crew needs a few seconds to scramble, later cars from the same
// base leave one after another, and every unit then has real travel time, so a 3★ response builds up over a minute
// instead of four cars appearing at once. A patrol car already in the area is diverted first.
export const POLICE_BASES = [
  { id: 'hq', name: 'Police Headquarters', x: L.PLACES.policeHQ2.x, z: L.PLACES.policeHQ2.z - 6, cars: 4 },
  { id: 'kollupitiya', name: 'Kollupitiya Police Station', x: L.PLACES.police.x, z: L.PLACES.police.z, cars: 3 },
];
export const DISPATCH = { scramble: [3.5, 6.5], gap: [9, 14], edgeK: 1.35, edgeAdd: 160, edgeDelay: 4 };
export const CHASE_V0 = [9, 12, 19, 23, 26, 28]; // lane cruising speed by level (m/s)
export const LOSE_AFTER = (stars) => 5 + stars * 1.5; // seconds out of every unit's sight before a pursuit becomes a search
export const SEARCH_TIME = (lv) => 32 + lv * 16;
export const FINE_ON_SPOT = 2500;
export const ARREST_FINE = [0, 2500, 5000, 10000, 20000, 30000];
export const HOLD_HOURS = [0, 1, 2, 4, 6, 8];
const STATE_LABEL = { detected: 'CALL RECEIVED', investigating: 'INVESTIGATING', responding: 'RESPONDING', pursuing: 'PURSUIT', searching: 'SEARCHING', return: 'STANDING DOWN' };
const LINES = {
  stop: [{ si: 'නවතින්න! පොලිසිය!', tr: 'Stop! Police!' }, { ta: 'நில்லுங்கள்! பொலிஸ்!', tr: 'Stop! Police!' }, { en: 'Police! Stop right there.' }],
  comply: [{ en: 'Stay where you are. Hands where I can see them.' }, { si: 'හොඳයි, එතන ඉන්න.', tr: 'Good, stay there.' }],
  chase: [{ si: 'අල්ලගන්න!', tr: 'Catch him!' }, { en: 'Suspect running — on foot!' }],
  search: [{ en: 'Control, suspect lost. Searching the area.' }, { en: 'Check the lanes behind the shops.' }],
  breakup: [{ si: 'නවත්වන්න! පොලිසිය!', tr: 'Stop that! Police!' }, { en: 'Police! Break it up, both of you!' }],
  cuff: [{ si: 'දෙන්නම පොලිසියට එන්න.', tr: 'Both of you, come to the station.' }, { en: "Hands behind your back. You're both coming with us." }],
  arrest: [{ si: 'නවතින්න! පොලිසිය! අත් උස්සන්න!', tr: 'Stop! Police! Hands up!' }, { en: 'Police! Stop right there — hands where I can see them!' }],
  cuff1: [{ si: 'ඔයාව අත්අඩංගුවට ගන්නවා.', tr: 'You are under arrest.' }, { en: "You're under arrest for assault. Hands behind your back." }],
  waitUp: [{ si: 'නැගිටින්න. හෙමින්.', tr: 'Get up. Slowly.' }, { en: 'Stay down… now get up, slowly.' }],
};

// ------------------------------------------------------------------ road graph helpers (pure; unit-tested in tools/police-test.mjs)
export function nearestRoad(segs, x, z) {
  let best = null;
  for (const s of segs) {
    const dx = s.x1 - s.x0, dz = s.z1 - s.z0, l2 = dx * dx + dz * dz || 1; const t = clamp(((x - s.x0) * dx + (z - s.z0) * dz) / l2, 0, 1);
    const px = s.x0 + dx * t, pz = s.z0 + dz * t; const d = (px - x) ** 2 + (pz - z) ** 2; if (!best || d < best.d) best = { seg: s, t, px, pz, d };
  }
  if (best) best.d = Math.sqrt(best.d); return best;
}
// Dijkstra from `start` over drivable segments; `back` = node we came from (turning back there costs a U-turn penalty)
export function shortest(start, drivable, back = null) {
  const dist = new Map(), prev = new Map(), done = new Set(); dist.set(start, 0); const heap = [[0, start]];
  const push = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } } return top; };
  while (heap.length) {
    const [d, n] = pop(); if (done.has(n)) continue; done.add(n);
    for (const s of n.segs) {
      if (!drivable.has(s)) continue; const o = otherEnd(s, n); const len = Math.hypot(o.x - n.x, o.z - n.z) * [1, 1.08, 1.25, 1.6][s.level || 0] + (n === start && o === back ? 60 : 0) + 4;
      const nd = d + len; if (nd < (dist.get(o) ?? Infinity)) { dist.set(o, nd); prev.set(o, n); push(nd, o); }
    }
  }
  return { dist, prev };
}
export function pathTo(prev, start, goal) { const out = []; let n = goal; while (n && n !== start) { out.push(n); n = prev.get(n); } if (n !== start) return null; return out.reverse(); }

export class PoliceResponse {
  constructor(game) {
    this.g = game; this.level = 0; this.state = 'patrol'; this.units = []; this.incident = null; this.lastSeen = null; this.search = null;
    this.stateT = 0; this.seenT = 99; this.repT = -99; this.crimeT = -99; this.spawnCd = 0; this.patrolCd = 20; this.seed = 1; this.busy = false; this.prompt = '';
    this.foot = []; this.civil = []; this.log = []; this.stats = { reports: 0, dispatched: 0, sightings: 0, fines: 0, arrests: 0, searches: 0, decays: 0, standDowns: 0, maxUnits: 0, spawnMinDist: Infinity };
    this.queue = []; this.baseState = {}; this.edges = null; this.reason = 'disturbance'; this.stop = null; this.t = 0; this.siren = null; this.waits = []; this.radioCd = 4; this.radioN = 0; this.blockCd = 12;
    Object.assign(this.stats, { intercepts: 0, pits: 0, roadblocks: 0, spikes: 0, flats: 0, recycled: 0, tackles: 0, tackleHits: 0, busted: { grab: 0, tackle: 0, shot: 0 } });
    this.ff = new Firefight(this); this.ems = new EMS(this); this.cine = null; this.bodies = []; this.nav = new FootNav(this.g.collision, () => this.T.all());
  }
  get T() { return this.g.traffic; }
  stars() { return Math.ceil(this.level - 0.01); }
  note(s) { this.log.push(`${this.t.toFixed(1)} [${this.state} ${this.stars()}★] ${s}`); if (this.log.length > 80) this.log.shift(); }
  setState(s) { if (s !== this.state) { this.note('→ ' + s); this.state = s; this.stateT = 0; } }
  target() { const P = this.g.player; return P.vehicle ? { x: P.vehicle.x, z: P.vehicle.z, y: P.vehicle.y, v: P.vehicle } : { x: P.x, z: P.z, y: P.y, v: null }; }

  // ------------------------------------------------------------------ inputs
  report(e) { // a witness phoned 119 — they report where the incident happened (with error), not a live position
    if (this.busy) return; const P = this.g.player; this.stats.reports++;
    const jx = (Math.random() * 2 - 1) * 10, jz = (Math.random() * 2 - 1) * 10; const inc = { x: P.x + jx, z: P.z + jz, t: this.t };
    if (this.t - this.repT < 8) { if (this.state === 'searching' || this.state === 'detected') this.incident = inc; return; } this.repT = this.t;
    this.incident = inc; this.addHeat(1, this.reason || 'witness report', 'A witness called 119 and described you.');
  }
  gunfire(x, z, hit = null) { this.reason = 'discharging a firearm in public'; this.addHeat(0.05, this.reason, null, true); this.crime(x, z, 'gunfire'); this.ff.onPlayerShot(x, z, hit); }
  crime(x, z, kind) { // something an officer might witness directly
    if (kind === 'assault') this.reason = 'assault'; else if (kind === 'vehicle') this.reason = 'dangerous driving (pedestrian struck)';
    if (this.t - this.crimeT < 4) return; for (const u of this.units) { if (this.unitSees(u, kind === 'gunfire' ? 1.6 : 1)) { this.crimeT = this.t; this.incident = { x, z, t: this.t }; this.addHeat(1, this.reason, 'A police officer saw it happen.'); this.spotted(); return; } }
  }
  addHeat(n, reason, why = null, quiet = false) {
    if (this.g.debug?.noWanted) return; // debug cheat
    const before = this.stars(); this.level = Math.min(5, this.level + n); const after = this.stars(); if (after <= before) return;
    this.note(`wanted ${before}→${after} (${reason})`);
    if (!quiet || after !== before) this.g.hud.notify(after === 1 ? 'Police alerted' : 'Wanted level raised', `${why ? why + ' ' : ''}${'★'.repeat(after)} — ${reason}. Lie low out of sight and the search will be scaled down.`, 'warn', 4);
    if (this.state === 'patrol' || this.state === 'return') { if (!this.incident) { const P = this.g.player; this.incident = { x: P.x + (Math.random() * 2 - 1) * 12, z: P.z + (Math.random() * 2 - 1) * 12, t: this.t }; } this.setState('detected'); this.detectT = 3 + Math.random() * 3; }
    else if (this.state === 'searching' && this.incident) { this.beginSearch(this.incident.x, this.incident.z); }
  }
  spotted() { const tg = this.target(); const P = this.g.player; this.lastSeen = { x: tg.x, z: tg.z, t: this.t, h: tg.v ? (tg.v.speed >= 0 ? tg.v.yaw : tg.v.yaw + Math.PI) : P.yaw, sp: tg.v ? Math.abs(tg.v.speed) : P.speed || 0 }; this.seenT = 0; if (this.state !== 'pursuing') { this.stats.sightings++; this.setState('pursuing'); for (const u of this.units) if (u.v && u.task !== 'leave' && !u.v.player) { u.v.ai.v0 = CHASE_V0[this.stars()]; u.planT = 0; } this.g.hud.notify('Spotted by police', this.stars() >= 2 ? 'Units are closing in. Break line of sight to lose them.' : 'An officer wants to speak to you. Stand still to comply, or run.', 'warn', 3.2); } }

  // ------------------------------------------------------------------ main update
  update(dt) {
    const g = this.g; this.t += dt; this.stateT += dt; this.prompt = ''; this.tickWaits();
    if (this.bodies.length) this.updateBodies(dt);
    if (this.cine) { this.cine.update(dt); this.updateSiren(dt, false); this.ff.update(dt); return; } // BUSTED sequence owns the officers and the camera
    if (g.director.active || this.busy) { this.updateSiren(dt, true); this.ff.update(dt); return; }
    this.foot = []; for (const u of this.units.concat(this.civil)) for (const o of u.officers) if (o.mode === 'foot' || o.mode === 'down' || o.mode === 'return') this.foot.push(o);
    this.updateGlobal(dt); this.recordTrail();
    for (const u of this.units.slice()) this.updateUnit(u, dt);
    for (const u of this.civil.slice()) this.updateCivil(u, dt);
    this.ems.update(dt);
    this.updateRoadblocks(dt); this.updateRadio(dt);
    this.updateStop(dt); this.g.player.policeStop = !!this.stop; this.pushPlayer(); this.updateSiren(dt, false);
    this.stats.maxUnits = Math.max(this.stats.maxUnits, this.units.filter((u) => !u.patrol).length);
    this.ff.update(dt);
  }
  updateGlobal(dt) {
    this.updateQueue(); const want = UNITS_FOR[this.stars()] || 0; const active = this.units.filter((u) => u.task !== 'leave' && !u.patrol);
    // visibility
    let seen = false; for (const u of this.units) if (u.task !== 'leave' && this.unitSees(u)) { seen = true; break; }
    if (seen && this.level > 0) this.spotted(); else this.seenT += dt;
    switch (this.state) {
      case 'patrol': {
        if (this.level > 0) { this.setState('detected'); this.detectT = 3; break; }
        this.patrolCd -= dt; const pu = this.units.find((u) => u.patrol); if (!pu && this.patrolCd <= 0 && !this.g.indoor) { this.patrolCd = 45; this.spawnUnit({ patrol: true }); }
        break; }
      case 'detected': this.detectT -= dt; if (this.detectT <= 0) this.dispatch(); break;
      case 'investigating': case 'responding': {
        if (active.length < want) this.topUp(want, this.incident);
        const onScene = active.some((u) => u.task === 'foot' && u.footT > 18) || active.every((u) => u.arrived && u.task !== 'drive') && this.stateT > 25;
        if ((onScene && this.stateT > 12) || this.stateT > 75) { this.note('nothing found at the scene'); this.beginSearch(this.incident.x, this.incident.z); }
        break; }
      case 'pursuing': {
        if (active.length < want) this.topUp(want, this.lastSeen);
        if (this.seenT > LOSE_AFTER(this.stars())) { const P = this.g.player; const ls = this.lastSeen || { x: P.x, z: P.z }; this.g.hud.notify('Out of sight', 'The police lost visual contact and are searching the area. Stay out of the search zone.', 'info', 3); this.say(this.foot[0], 'search', 'Officer'); this.beginSearch(ls.x, ls.z, true); }
        break; }
      case 'searching': {
        if (active.length < want) this.topUp(want, this.search);
        const P = this.g.player; const out = Math.hypot(P.x - this.search.x, P.z - this.search.z) > this.search.r + 15;
        this.search.t -= dt * (out ? 1.35 : 1) * (this.g.indoor ? 1.3 : 1); this.search.r = Math.min(this.search.r0 * 1.6, this.search.r + dt * 0.6);
        if (this.search.t <= 0) {
          const before = this.stars(); this.level = Math.max(0, before - 1); this.stats.decays++; this.note(`search expired: ${before}→${this.stars()}`);
          if (this.level <= 0) this.standDown('The police have stopped looking for you.');
          else { this.g.hud.notify('Search scaled down', `${'★'.repeat(this.stars())} — fewer units are still checking the area.`, 'info', 3); this.beginSearch(this.search.x, this.search.z); for (const u of active.slice(UNITS_FOR[this.stars()])) this.leave(u); const keep = Math.max(0, UNITS_FOR[this.stars()] - Math.min(active.length, UNITS_FOR[this.stars()])); for (const q of this.queue.splice(keep)) this.release(q.src); }
        }
        break; }
      case 'return': if (!this.units.some((u) => !u.patrol)) this.setState('patrol'); if (this.level > 0) { this.setState('detected'); this.detectT = 2; } break;
    }
  }
  dispatch() {
    this.stats.dispatched++; const lv = this.stars(); this.setState(lv >= 2 ? 'responding' : 'investigating');
    const inc = this.incident || this.target();
    const pu = this.units.find((u) => u.patrol); if (pu) { pu.patrol = false; this.note('patrol unit diverted'); this.assign(pu, 'drive', inc); }
    this.topUp(UNITS_FOR[lv], inc);
    const src = this.queue.length ? this.queue[0].src : null; const from = pu ? 'a patrol car in the area' : src ? (src.edge ? 'a neighbouring division' : src.name) : 'the nearest station';
    this.g.hud.notify(lv >= 2 ? 'Police responding' : 'Police investigating', lv >= 2 ? `Units dispatched from ${from} — sirens on the way to where you were reported.` : `A car from ${from} is coming to check the reported location.`, 'warn', 3.2);
  }
  // queue the next car (see POLICE_BASES): which base / division sends it, and when it leaves
  topUp(want, pt) {
    if (!pt) return; const active = this.units.filter((u) => u.task !== 'leave' && !u.patrol); const n = active.length + this.queue.length; if (n >= want) return;
    const lv = this.stars(); const ahead = lv >= 3 && this.state === 'pursuing' && n % 2 === 1; const src = this.pickSource(pt, ahead); if (!src) return;
    const st = this.baseState[src.id] || (this.baseState[src.id] = { out: 0, nextT: -1e9 }); const rr = (r) => r[0] + Math.random() * (r[1] - r[0]);
    const first = this.t + rr(DISPATCH.scramble) + (src.edge ? DISPATCH.edgeDelay : 0); const t = Math.max(first, st.nextT); st.nextT = t + rr(DISPATCH.gap); st.out++;
    this.queue.push({ t, src, jeep: lv >= 3 && n % 3 === 1, tries: 0 }); this.note(`car ${n + 1} to leave ${src.name} in ${(t - this.t).toFixed(0)} s`);
  }
  edgeSources() { // road ends at the edge of the map (where neighbouring divisions' cars come in), a handful spread around it
    if (this.edges) return this.edges; const pts = []; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const sg of this.T.drivableSegs) { if (sg.level >= 3 || sg.crossing) continue; for (const [x, z] of [[sg.x0, sg.z0], [sg.x1, sg.z1]]) { pts.push([x, z]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const best = new Map(); // per 45° sector, the road point farthest out
    for (const [x, z] of pts) { const k = Math.round(Math.atan2(x - cx, z - cz) / (Math.PI / 4)) & 7; const d = Math.hypot(x - cx, z - cz); if (!best.has(k) || best.get(k).d < d) best.set(k, { x, z, d }); }
    this.edges = [...best.entries()].map(([k, p]) => ({ id: 'edge' + k, name: 'a neighbouring division', edge: true, x: p.x, z: p.z, cars: 2 })); return this.edges;
  }
  pickSource(pt, ahead = false) {
    const tg = this.target(); const P = this.g.player; const h = tg.v ? tg.v.yaw : P.yaw; let best = null, bc = Infinity;
    for (const src of POLICE_BASES.concat(this.edgeSources())) {
      const st = this.baseState[src.id]; const out = st ? st.out : 0; if (out >= src.cars) continue;
      if (src.edge && Math.hypot(src.x - tg.x, src.z - tg.z) < 200) continue; // a division car "arriving" over the map edge must not start next to the suspect
      let c = Math.hypot(src.x - pt.x, src.z - pt.z) * (src.edge ? DISPATCH.edgeK : 1) + (src.edge ? DISPATCH.edgeAdd : 0) + out * 40;
      c += Math.max(0, (st ? st.nextT : 0) - this.t) * 18; // a car that would wait at the gate is worth that much road (≈18 m/s)
      if (this.state === 'pursuing' && tg.v) { const fwd = ((src.x - tg.x) * Math.sin(h) + (src.z - tg.z) * Math.cos(h)) > 0; c *= ahead ? (fwd ? 0.6 : 1.8) : (fwd ? 0.85 : 1.3); } // interceptors (and, less strongly, every car) from ahead of a fleeing suspect
      if (c < bc) { bc = c; best = src; }
    }
    return best;
  }
  dispatchTarget() { return this.state === 'pursuing' ? this.lastSeen : this.state === 'searching' ? this.search : this.incident || this.lastSeen; }
  updateQueue() {
    if (!this.queue.length) return; this.queue.sort((a, b) => a.t - b.t);
    for (const q of this.queue.slice()) { if (q.t > this.t) break; const u = this.launch(q);
      if (u) { this.queue.splice(this.queue.indexOf(q), 1); const pt = this.dispatchTarget(); if (pt) this.assign(u, 'drive', pt); }
      else if (++q.tries > 10) { this.queue.splice(this.queue.indexOf(q), 1); this.release(q.src); const f = this.spawnUnit({ jeep: q.jeep }); if (f) { const pt = this.dispatchTarget(); if (pt) this.assign(f, 'drive', pt); } } // gate blocked for long: the old out-of-view fallback, never no response
      else q.t = this.t + 1.2; }
  }
  release(src) { const st = src && this.baseState[src.id]; if (st) st.out = Math.max(0, st.out - 1); }
  launch(q) { // the car pulls out of the base gate (or in from the edge road) onto the lane toward the suspect
    const s = q.src, T = this.T, P = this.g.player; const pt = this.dispatchTarget() || this.target(); const ln = T.laneNear(s.x, s.z, Math.atan2(pt.x - s.x, pt.z - s.z), s.edge ? 60 : 80); if (!ln) return null;
    const [x, z] = evalPiece(ln.piece, ln.s); if (T.all().some((v) => (v.x - x) ** 2 + (v.z - z) ** 2 < 81)) return null; // gate / lane busy: wait
    const dp = Math.hypot(x - P.x, z - P.z); if (dp < 45 && q.tries < 6 && this.inView({ x, z })) return null; // never pops in right in front of the camera
    const u = this.makeUnit(x, z, Math.atan2(ln.piece.d[0], ln.piece.d[1]), ln.piece, ln.s, false, q.jeep); if (!u) return null; u.base = s.id; u.from = s.name;
    this.note(`unit ${u.id} left ${s.name}`); return u;
  }
  beginSearch(x, z, fromSight = false) {
    const lv = Math.max(1, this.stars()); const r0 = 50 + lv * 18; const P = this.g.player;
    // the search centre is the last known position pushed along the suspect's heading — not the live position
    let cx = x, cz = z; if (fromSight && this.lastSeen && this.lastSeen.h !== undefined) { const h = this.lastSeen.h; cx += Math.sin(h) * 15; cz += Math.cos(h) * 15; } void P; // heading AT the last sighting, not the live one
    this.search = { x: cx, z: cz, r: r0, r0, t: SEARCH_TIME(lv), t0: SEARCH_TIME(lv) }; this.stats.searches++; this.setState('searching');
    for (const u of this.units) if (u.task !== 'leave' && !u.patrol) { u.searchFoot = !u.searchedOnce; this.searchNext(u); }
  }
  standDown(msg) {
    for (const q of this.queue) this.release(q.src); this.queue = [];
    this.level = 0; this.stats.standDowns++; this.search = null; this.incident = null; this.stop = null; this.setState('return'); for (const u of this.units) if (!u.patrol) this.leave(u);
    if (msg) this.g.hud.notify('Police standing down', msg, 'success', 3.5);
  }
  restore(level) { this.level = clamp(level || 0, 0, 5); if (this.level > 0) { const P = this.g.player; this.incident = { x: P.x, z: P.z, t: 0 }; this.beginSearch(P.x + (Math.random() * 2 - 1) * 25, P.z + (Math.random() * 2 - 1) * 25); } else if (this.state !== 'patrol' && this.state !== 'return') this.standDown(); }
  save() { return { level: this.level }; }

  // ------------------------------------------------------------------ sight
  // does anyone in unit u see the suspect? Officers on foot use their own eyes (Firefight.sees: range, field of view, walls of
  // any height ≥ 1 m and vehicle bodies block, torch beams extend the night range). A crew in the car sees through the
  // windows: shorter range behind, and the same walls / vehicles block the line. mult > 1 = drawn by a gunshot.
  unitSees(u, mult = 1) {
    const g = this.g; if (g.indoor) return false; const tg = this.target(); const P = g.player; const A = g.atmos;
    for (const o of u.officers) if (o.mode === 'foot' && this.ff.sees(o, 1e-6)) return true;
    if (u.v && u.officers.some((o) => o.mode === 'seated')) {
      const v = u.v; const env = (1 - 0.35 * (A ? A.night : 0)) * (1 - 0.15 * (A && A.w ? A.w.rain : 0)) * (P.crouching && !P.vehicle ? 0.7 : 1) * (tg.v ? 1.25 : 1) * mult;
      const dx = tg.x - v.x, dz = tg.z - v.z, d = Math.hypot(dx, dz); const c = d > 0.1 ? (Math.sin(v.yaw) * dx + Math.cos(v.yaw) * dz) / d : 1;
      const R = (46 + this.stars() * 7) * env * (c < -0.3 ? 0.5 : 1); // mirrors only, behind
      if (d < R) { const ey = (v.y || 0) + 1.25; const ty = (tg.y || 0) + (tg.v ? 1.1 : P.crouching ? 0.8 : 1.3);
        if (this.ff.clear(v.x, ey, v.z, tg.x, ty, tg.z, v, tg.v || null)) return true;
        if (!tg.v && !P.crouching && this.ff.clear(v.x, ey, v.z, tg.x, (tg.y || 0) + 1.62, tg.z, v, null)) return true; }
    }
    return false;
  }

  // ------------------------------------------------------------------ units
  spawnUnit({ patrol = false, jeep = false, ahead = false, at = null, ems = false, near = false } = {}) {
    const g = this.g, T = this.T, P = g.player; const f = this.target(); const cam = g.camera; const cd = new THREE.Vector3(); cam.getWorldDirection(cd);
    if (at) { const ln = T.laneNear(at.x, at.z, at.yaw, 40); return ln ? this.makeUnit(at.x, at.z, at.yaw, ln.piece, ln.s, false, jeep, ems) : null; } // placed (roadblock / test)
    const lo = ahead ? 170 : near ? 90 : 150, hi = ahead ? 310 : near ? 170 : 280; // near: answering the player's own 119 call
    const cand = T.drivableSegs.filter((sg) => { if (sg.level >= 3) return false; const ex = sg.x1 - sg.x0, ez = sg.z1 - sg.z0, l2 = ex * ex + ez * ez || 1; const t = Math.max(0, Math.min(1, ((f.x - sg.x0) * ex + (f.z - sg.z0) * ez) / l2)); // roads that pass through the distance band
      return Math.hypot(sg.x0 + ex * t - f.x, sg.z0 + ez * t - f.z) <= hi && Math.max(Math.hypot(sg.x0 - f.x, sg.z0 - f.z), Math.hypot(sg.x1 - f.x, sg.z1 - f.z)) >= lo; });
    for (let tries = 0; tries < 80 && cand.length; tries++) {
      const seg = cand[Math.floor(Math.random() * cand.length)];
      const mx = (seg.x0 + seg.x1) / 2, mz = (seg.z0 + seg.z1) / 2; const d = Math.hypot(mx - f.x, mz - f.z);
      const hy = f.v ? f.v.yaw : P.yaw; if (ahead && ((mx - f.x) * Math.sin(hy) + (mz - f.z) * Math.cos(hy)) < d * 0.55) continue; // intercepting units come from ahead
      const [a, b] = segNodes(seg); const toward = Math.hypot(a.x - f.x, a.z - f.z) < Math.hypot(b.x - f.x, b.z - f.z); const from = toward ? b : a, to = toward ? a : b;
      const lane = seg.level <= 1 ? 1 : 0; const piece = linePiece(seg, from, to, lane); let s = 0, x = 0, z = 0, ok = false; // the spawn point itself (not the segment's midpoint) must be in range: long roads run far past it
      for (let k = 0; k < 6 && !ok; k++) { s = piece.len * (0.1 + Math.random() * 0.8); x = lerp(piece.p0[0], piece.p1[0], s / piece.len); z = lerp(piece.p0[1], piece.p1[1], s / piece.len); const dd = Math.hypot(x - f.x, z - f.z); ok = dd >= lo && dd <= hi; }
      if (!ok || Math.hypot(x - P.x, z - P.z) < (near ? 85 : 140)) continue;
      if (Math.hypot(x - f.x, z - f.z) < 240 && ((x - cam.position.x) * cd.x + (z - cam.position.z) * cd.z) / Math.hypot(x - cam.position.x, z - cam.position.z) > 0.25 && !(g.collision.raycast && g.collision.raycast(cam.position.x, cam.position.y, cam.position.z, x, 1.6, z, 0.1) < 0.97)) continue; // the car itself appears out of view (or behind buildings)
      if (T.vehicles.some((v) => (v.x - x) ** 2 + (v.z - z) ** 2 < 15 * 15)) continue;
      return this.makeUnit(x, z, Math.atan2(piece.d[0], piece.d[1]), piece, s, patrol, jeep, ems);
    }
    return null;
  }
  makeUnit(x, z, yaw, piece, s, patrol, jeep, ems = false) {
    const g = this.g, T = this.T, P = g.player; {
      const type = ems ? 'ambulance' : jeep ? 'policejeep' : 'police'; const v = new Vehicle(type, 3000 + this.seed * 7, g.scene); v.place(x, z, yaw);
      v.keep = true; v.ai = { pieces: [piece], s, v0: patrol ? 9 : 11, stuck: 0, honkCd: 99, bumped: 0, aggressive: 1.2, emergency: true }; T.extend(v);
      const u = { id: this.seed++, v, officers: [], task: patrol ? 'patrol' : 'idle', patrol, arrived: false, footT: 0, stuckT: 0, planT: 0, goalPt: null, enterT: 0 };
      v.police = u; const seats = v.mesh.userData.seats; const di = seats.findIndex((q) => q.driver); const pi = seats.map((q, i) => i).filter((i) => i !== di).sort((i, j) => Math.abs(seats[i].z - seats[di].z) - Math.abs(seats[j].z - seats[di].z))[0];
      for (const [k, si] of [[0, di], [1, pi]]) { if (si === undefined || si < 0) continue; const ch = new Character(ems ? makeMedicAppearance(9100 + u.id * 17 + k * 7) : makePoliceAppearance(7000 + u.id * 13 + k * 5, 'patrol', k === 1 && u.id % 3 === 0 ? { sex: 'f' } : {})); seatCharacter(ch, v, seats[si]); ch.mesh.castShadow = false; const off = { ch, unit: u, seat: seats[si], si, mode: 'seated', x, z, y: v.y, yaw: v.yaw, t: 0, hits: 0, acc: 0 }; if (ems) { off.medic = true; off.noTorch = true; } else this.ff.arm(off); u.officers.push(off); } // every officer carries a T-56 (slung; hidden while seated)
      this.syncSeated(u); v.paxPlan = []; T.vehicles.push(v); this.units.push(u);
      const dp = Math.hypot(x - P.x, z - P.z); this.stats.spawnMinDist = Math.min(this.stats.spawnMinDist, dp); this.note(`unit ${u.id} (${type}${patrol ? ', patrol' : ''}) spawned ${dp.toFixed(0)} m away`);
      return u;
    }
    return null;
  }
  distTo(o, tg) { if (!tg.v) return Math.hypot(tg.x - o.x, tg.z - o.z); const v = tg.v; const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const rx = o.x - v.x, rz = o.z - v.z; const al = Math.abs(rx * fx + rz * fz) - v.half, la = Math.abs(rx * fz - rz * fx) - (v.T.wid || 1.7) / 2; return Math.hypot(Math.max(0, al), Math.max(0, la)); }
  syncSeated(u) { const v = u.v; if (!v) return; const seated = u.officers.filter((o) => o.mode === 'seated'); v.driverChar = seated.find((o) => o.seat.driver)?.ch || null; v.pax = seated.filter((o) => !o.seat.driver).map((o) => o.ch).concat((u.prisoners || []).filter((q) => q.mode === 'seated').map((q) => q.ch)); }
  assign(u, task, pt) {
    u.arrived = false; u.stuckT = 0; u.goalPt = pt ? { x: pt.x, z: pt.z } : null; u.planT = 0;
    if (u.v && !this.allSeated(u)) { u.task = 'mount'; for (const o of u.officers) if (o.mode === 'foot') { o.mode = 'return'; o.goal = null; } return; } // drive on once everyone is back in
    u.task = task;
    if (u.v && !u.v.player) { u.v.ai.stopped = false; u.v.ai.v0 = CHASE_V0[this.stars()]; if (pt && this.allSeated(u)) this.plan(u, pt.x, pt.z); }
  }
  allSeated(u) { return u.officers.every((o) => o.mode === 'seated' || o.mode === 'down'); }
  plan(u, gx, gz, soft = false) {
    const v = u.v, ai = v.ai, T = this.T; const tgt = nearestRoad(T.drivableSegs, gx, gz); if (!tgt) return false;
    ai.pieces = ai.pieces[0].type === 'line' ? [ai.pieces[0]] : ai.pieces.slice(0, 2); const last = ai.pieces[ai.pieces.length - 1]; ai.route = null; ai.goal = null;
    const proj = (pc) => clamp((tgt.px - pc.p0[0]) * pc.d[0] + (tgt.pz - pc.p0[1]) * pc.d[1], 1.5, pc.len - 1.5);
    if (last.seg === tgt.seg) { const s = proj(last); const cur = last === ai.pieces[0] ? ai.s : -1; if (s > cur + 4) { ai.route = []; ai.goal = { seg: tgt.seg, from: last.from, piece: last, s, soft }; T.extend(v); u.goalRoad = tgt; return true; } }
    const start = last.to; const { dist, prev } = shortest(start, T.drivable, last.from); const [a, b] = segNodes(tgt.seg);
    const ca = (dist.get(a) ?? Infinity) + Math.hypot(tgt.px - a.x, tgt.pz - a.z), cb = (dist.get(b) ?? Infinity) + Math.hypot(tgt.px - b.x, tgt.pz - b.z);
    if (!isFinite(ca) && !isFinite(cb)) { this.note(`unit ${u.id}: no route`); return false; }
    const [from, to] = ca <= cb ? [a, b] : [b, a]; const path = from === start ? [] : pathTo(prev, start, from); if (!path) return false;
    ai.route = path.concat([to]); const gp = linePiece(tgt.seg, from, to, 0); ai.goal = { seg: tgt.seg, from, piece: null, s: proj(gp), soft }; T.extend(v); u.goalRoad = tgt; u.routeLen = ai.route.length;
    return true;
  }
  leave(u) {
    if (u.task === 'leave') return; const wasBlock = u.task === 'block'; u.task = 'leave'; u.leaveT = 0; u.patrol = false; this.dropStrip(u);
    if (u.v && !u.v.player && (u.v.ai.chase || wasBlock)) rejoinLane(this.T, u.v, 80);
    if (u.v && !u.v.player) { u.v.ai.route = null; u.v.ai.goal = null; u.v.ai.v0 = 10; u.v.ai.stopped = !this.allSeated(u); u.v.beacons(false); }
    for (const o of u.officers) if (o.mode === 'foot') o.goal = null; this.note(`unit ${u.id} leaving`);
  }
  removeUnit(u) {
    const T = this.T; this.dropStrip(u); for (const o of u.officers) { if (o.mode !== 'seated') { o.ch.root.parent?.remove(o.ch.root); o.ch.dispose(); } }
    if (u.v && !u.v.player) { const i = T.vehicles.indexOf(u.v); if (i >= 0) T.vehicles.splice(i, 1); const pi = T.parked.indexOf(u.v); if (pi >= 0) T.parked.splice(pi, 1); this.syncSeated(u); T.remove(u.v); }
    else if (u.v) { u.v.police = null; }
    this.units = this.units.filter((q) => q !== u); this.note(`unit ${u.id} removed`); if (u.base) { this.release({ id: u.base }); u.base = null; }
  }
  searchNext(u) {
    const S = this.search; if (!S) return; for (let k = 0; k < 8; k++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * S.r; const x = S.x + Math.cos(a) * r, z = S.z + Math.sin(a) * r; if (L.isWater(x, z)) continue; this.assign(u, 'drive', { x, z }); return; }
    this.assign(u, 'drive', S);
  }
  updateUnit(u, dt) {
    const g = this.g, T = this.T, tg = this.target(); const v = u.v;
    if (v && v.player) { this.note(`unit ${u.id}: vehicle taken by the player`); v.police = null; v.beacons(false); u.v = null; this.reason = 'stealing a police vehicle'; this.addHeat(1, this.reason, 'Officers saw you take their car.'); }
    const lights = !u.patrol && u.task !== 'leave' && this.level > 0; if (u.v) { u.v.beacons(lights, this.t); u.v.lights = g.atmos.night > 0.4; }
    for (const o of u.officers) this.updateOfficer(o, u, dt);
    if (u.task === 'leave') { // drive off / walk off and despawn out of view
      u.leaveT += dt; const allIn = !u.v || this.allSeated(u); if (u.v && allIn) u.v.ai.stopped = false; if (u.v && !allIn) { for (const o of u.officers) if (o.mode === 'foot') { o.mode = 'return'; o.goal = null; } if (u.leaveT < 60) return; }
      const ref = u.v || u.officers[0]; const d = ref ? Math.hypot(ref.x - tg.x, ref.z - tg.z) : 999; if ((d > 140 && !this.inView(ref)) || d > 300 || u.leaveT > 90) this.removeUnit(u); return;
    }
    if (!u.v) { if (u.officers.every((o) => o.mode !== 'foot' && o.mode !== 'down')) this.removeUnit(u); else if (this.state !== 'pursuing' && this.stateT > 20) this.leave(u); return; }
    const ai = v.ai; const dToT = Math.hypot(v.x - tg.x, v.z - tg.z);
    if (u.patrol) { if (dToT > 360) this.removeUnit(u); return; }
    if (u.task === 'block') { u.blockT = (u.blockT || 0) + dt; if ((dToT > 170 && !this.inView(v)) || u.blockT > 90 || (this.state !== 'pursuing' && u.blockT > 25) || this.level <= 0) this.leave(u); return; }
    if (u.task === 'drive' && this.updateIntercept(u, dt, tg, dToT)) return;
    if (u.task === 'drive') {
      const st = this.state; u.planT -= dt;
      if (st === 'pursuing' && this.stars() >= 3) { // 3★+: no cruising — a unit that is behind drives faster than the suspect to close the gap
        ai.v0 = catchUpSpeed(this.stars(), tg.v ? Math.abs(tg.v.speed) : 0, dToT, CHASE_V0[this.stars()]);
        u.minD = Math.min(u.minD ?? 1e9, dToT); u.age = (u.age || 0) + dt;
        if ((u.minD < 250 || u.age > 50) && straggler(v, tg, dToT, this.inView(v))) { /* (a car still on its way in from a base is not a straggler) */ this.stats.recycled++; this.note(`unit ${u.id} fell behind, recycled`); this.leave(u); return; } /* topUp sends a fresh car from ahead */
      }
      if (st === 'pursuing' && u.planT <= 0) { // chase: aim ~2.5 s ahead of a moving suspect (soft goal, no braking); hard stop only once they have stopped
        u.planT = 1.6; const live = this.seenT < 0.25; /* someone has eyes on the suspect right now */ const ls = live ? tg : this.lastSeen; const sp = live && tg.v ? Math.abs(tg.v.speed) : live ? (this.g.player.speed || 0) : 0;
        if (ls) { const h = live ? (tg.v ? tg.v.yaw : this.g.player.yaw) : (this.lastSeen.h || 0); const lead = live ? Math.min(45, sp * 2.5) : 0; const ax = ls.x + Math.sin(h) * lead, az = ls.z + Math.cos(h) * lead; const soft = sp > 2;
          if (!u.goalPt || Math.hypot(u.goalPt.x - ax, u.goalPt.z - az) > 10 || soft !== !!u.softGoal) { u.goalPt = { x: ax, z: az }; u.softGoal = soft; this.plan(u, ax, az, soft); } } }
      const P = g.player; const close = dToT < (tg.v ? 16 : 28) && this.seenT < 0.3; void P;
      const footChase = st === 'pursuing' && close && (!tg.v || Math.abs(tg.v.speed) < 1.5);
      const gd = ai.goal && ai.goal.piece && ai.goal.dist !== undefined ? ai.goal.dist : Infinity; const reached = gd < 5 && v.speed < 0.6;
      if (v.speed < 0.3 && !reached) u.stuckT += dt; else { u.stuckT = 0; if (v.speed > 3) u.replans = 0; }
      if (footChase) { this.brakeHere(u); if (v.speed < 1) { this.dismount(u, 'chase'); this.say(u.officers[0], this.stars() >= 2 ? 'chase' : 'stop', 'Officer'); } }
      else if (reached || (u.stuckT > 6 && u.goalPt && Math.hypot(v.x - u.goalPt.x, v.z - u.goalPt.z) < 40)) { u.arrived = true; this.onArrive(u); }
      else if (u.stuckT > 6) { u.stuckT = 0; u.replans = (u.replans || 0) + 1; // blocked (a stalled car / another unit ahead): a new route does not clear the lane
        if (u.replans > 2) { u.replans = 0; if (dToT < 150 && st !== 'patrol') { this.note(`unit ${u.id} blocked in traffic, crew continues on foot`); this.dismount(u, 'chase'); } else { this.stats.recycled++; this.note(`unit ${u.id} blocked in traffic, recycled`); this.leave(u); return; } }
        else if (u.goalPt) this.plan(u, u.goalPt.x, u.goalPt.z); }
      if (!ai.route && !ai.goal && u.goalPt && u.planT <= -1) { u.planT = 0; this.plan(u, u.goalPt.x, u.goalPt.z); }
    } else if (u.task === 'foot') {
      u.footT += dt; const st = this.state;
      const done = st === 'searching' ? u.footT > 12 : st === 'pursuing' ? false : st === 'investigating' || st === 'responding' ? u.footT > 20 : true;
      const ref = this.seenT < 0.3 ? tg : this.lastSeen || tg; const far = u.officers.every((o) => o.mode !== 'foot' || Math.hypot(o.x - ref.x, o.z - ref.z) > 50);
      if (done || (st === 'pursuing' && (far && this.seenT > 2 || (tg.v && Math.abs(tg.v.speed) > 4)))) { u.goalPt = null; this.recall(u); }
    } else if (u.task === 'mount') { if (this.allSeated(u)) { u.task = 'idle'; this.afterMount(u); } }
    else if (u.task === 'idle') this.afterMount(u);
  }
  brakeHere(u) { const ai = u.v.ai; if (ai.goal && ai.goal.piece === ai.pieces[0] && ai.goal.s <= ai.s + 8) return; ai.route = []; ai.goal = { seg: ai.pieces[0].seg, from: ai.pieces[0].from, piece: ai.pieces[0], s: ai.s + Math.max(2, u.v.speed * u.v.speed / 9) }; }
  onArrive(u) {
    const st = this.state;
    if (st === 'investigating' || st === 'responding') this.dismount(u, 'investigate');
    else if (st === 'searching') { if (u.searchFoot) { u.searchFoot = false; u.searchedOnce = true; this.dismount(u, 'search'); } else this.searchNext(u); }
    else if (st === 'pursuing') { u.planT = 0; u.goalPt = null; }
  }
  afterMount(u) {
    const st = this.state; if (this.level <= 0) { this.leave(u); return; }
    if (st === 'searching') { if (u.goalPt) this.assign(u, 'drive', u.goalPt); else this.searchNext(u); }
    else if (st === 'pursuing') { u.task = 'drive'; u.planT = 0; u.goalPt = null; if (u.v) { u.v.ai.stopped = false; u.v.ai.v0 = CHASE_V0[this.stars()]; } }
    else this.assign(u, 'drive', u.goalPt || this.incident || this.target());
  }
  dismount(u, why) {
    if (u.task === 'foot') return; u.task = 'foot'; u.footT = 0; u.why = why; const v = u.v; v.speed = 0; v.ai.stopped = true;
    u.officers.forEach((o, i) => { if (o.mode === 'seated') { o.mode = 'exit'; o.t = -i * 0.3; } }); this.syncSeated(u); this.note(`unit ${u.id} officers out (${why})`);
  }
  recall(u) { if (u.task === 'mount' || !u.v) return; u.task = 'mount'; for (const o of u.officers) if (o.mode === 'foot') { o.mode = 'return'; o.goal = null; } }
  inView(p) { if (!p) return false; const cam = this.g.camera; const cd = new THREE.Vector3(); cam.getWorldDirection(cd); const dx = p.x - cam.position.x, dz = p.z - cam.position.z; const d = Math.hypot(dx, dz) || 1; return (dx * cd.x + dz * cd.z) / d > 0.35 && d < 260; }

  // ------------------------------------------------------------------ intercept driving (Pursuit.js): off the lane, straight at the suspect
  // Engages at 2★+ when a unit is within 75 m, every officer is aboard and the suspect's moving vehicle is in sight. Roles
  // rotate between units (tail / pit / block, tail only at 2★). Returns true while the unit is intercepting.
  updateIntercept(u, dt, tg, d) {
    const v = u.v, ai = v.ai, lv = this.stars(); const P = tg.v;
    const can = this.state === 'pursuing' && lv >= 2 && !!P && this.allSeated(u) && !v.free && !ai.stopped;
    if (!ai.chase) {
      if (!can || this.seenT > 1 || d > (lv >= 3 ? 110 : 75) || Math.abs(P.speed) < 2.5) return false;
      const busy = this.units.filter((q) => q.v && q.v.ai && q.v.ai.chase).map((q) => q.v.ai.chase.role);
      const want = lv >= 4 ? ['pit', 'block', 'pit', 'tail'] : ['pit', 'block', 'tail']; const left = want.slice(); for (const r of busy) { const i = left.indexOf(r); if (i >= 0) left.splice(i, 1); } // 4★+: two PIT cars (one each side)
      const role = lv < 3 ? 'tail' : left[0] || (u.id % 2 ? 'pit' : 'tail');
      ai.chase = { role, ax: v.x, az: v.z, speed: v.speed, blockT: 0, boost: [1, 1, 1.02, 1.06, 1.1, 1.14][lv], t: 0, pitCd: 1.5, stop: false, contact: false };
      ai.route = null; ai.goal = null; this.stats.intercepts++; this.note(`unit ${u.id} intercepting (${role})`);
      if (lv >= 3) this.radio(role === 'pit' ? 'pit' : role === 'block' ? 'block' : 'ram', u);
    }
    const ch = ai.chase; ch.t += dt; ch.pitCd -= dt; ch.minTop = lv >= 3 ? Math.abs(P.speed) * 1.08 + 2 : 0;
    if (!can || this.seenT > (lv >= 3 ? 4.5 : 2.5) || d > (lv >= 3 ? 170 : 120) || ch.blockT > 2.5) { // lost them / wedged: back to the road network and the routed chase
      if (rejoinLane(this.T, v)) { u.planT = 0; u.goalPt = null; u.stuckT = 0; this.note(`unit ${u.id} back on the road`); return false; }
      const nr = nearestRoad(this.T.drivableSegs, v.x, v.z); if (nr) { ch.ax = nr.px; ch.az = nr.pz; ch.speed = 6; ch.stop = false; ch.blockT = 0; } return true;
    }
    if (this.seenT > 0.25 && this.lastSeen) { const tp = this.trailAim(v, ch); ch.ax = tp ? tp.x : this.lastSeen.x; ch.az = tp ? tp.z : this.lastSeen.z; ch.speed = Math.max(10, Math.abs(P.speed) + 2); ch.stop = false; ch.contact = false; return true; } // momentarily out of sight: follow the line they took (saw them turn), not a frozen point
    const aim = chaseAim(ch.role, P, v, lv, ch.t); ch.ax = aim.x; ch.az = aim.z; ch.speed = aim.speed; ch.contact = aim.contact;
    ch.losT = (ch.losT || 0) - dt; if (ch.losT <= 0) { ch.losT = 0.2; ch.blocked = this.lineBlocked(v, aim.x, aim.z); }
    if (ch.blocked) { const tp = this.trailAim(v, ch); if (tp) { ch.ax = tp.x; ch.az = tp.z; ch.speed = Math.max(aim.speed, Math.abs(P.speed) + 3); ch.contact = false; } } else ch.ti = null; // a building between them (round a corner): follow the suspect's path round it instead of ploughing into the corner
    ch.stop = Math.abs(P.speed) < 1.5 && d < 18; // suspect stopped: pull up beside them, crew out
    if (ch.stop && v.speed < 1) { this.dismount(u, 'chase'); this.say(u.officers[0], 'chase', 'Officer'); return true; }
    if (ch.role === 'pit' && aim.contact && aim.along < 0 && ch.pitCd <= 0 && Math.abs(P.speed) > 6 && this.touching(v, P)) {
      applyPit(P, v, aim.lat >= 0 ? 1 : -1); ch.pitCd = 7; this.stats.pits++; this.note(`unit ${u.id} PIT`); this.radio('spun', u, true);
    }
    return true;
  }
  // the suspect's driven path while units have eyes on it (and a moment after): intercept cars follow it round corners
  recordTrail() {
    const tg = this.target(); if (this.state !== 'pursuing') { if (this.trail && this.trail.length) this.trail = []; return; }
    if (!tg.v || this.seenT > 2) return; const tr = this.trail || (this.trail = []); if (tr.v !== tg.v) { tr.length = 0; tr.v = tg.v; }
    const l = tr[tr.length - 1]; if (!l || (l.x - tg.x) ** 2 + (l.z - tg.z) ** 2 > 9) { tr.push({ x: tg.x, z: tg.z }); if (tr.length > 140) { tr.shift(); for (const u of this.units) { const c = u.v && u.v.ai && u.v.ai.chase; if (c && c.ti > 0) c.ti--; } } }
  }
  trailAim(v, ch) {
    const tr = this.trail; if (!tr || tr.length < 2 || tr.v !== this.target().v) return null; const first = ch.ti == null || ch.ti >= tr.length;
    let bi = first ? 0 : ch.ti, bd = Infinity; for (let k = first ? 0 : ch.ti, e = first ? tr.length : Math.min(tr.length, ch.ti + 30); k < e; k++) { const d = (tr[k].x - v.x) ** 2 + (tr[k].z - v.z) ** 2; if (d < bd) { bd = d; bi = k; } }
    ch.ti = bi; const look = 6 + Math.max(0, v.speed) * 0.45; let acc = 0, k = bi; while (k < tr.length - 1 && acc < look) { acc += Math.hypot(tr[k + 1].x - tr[k].x, tr[k + 1].z - tr[k].z); k++; }
    return tr[k];
  }
  lineBlocked(v, x, z) { const c = this.g.collision; if (!c || !c.raycast) return false; const y = (v.y || 0) + 0.7; return c.raycast(v.x, y, v.z, x, y, z, 0.7, false, 0.9) < 0.97; }
  touching(a, b) { for (const p of a.circles()) for (const q of b.circles()) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < a.radius + b.radius + 0.35) return true; return false; }

  // ------------------------------------------------------------------ roadblocks (4★+) and spike strips (5★)
  updateRoadblocks(dt) {
    this.blockCd -= dt; const tg = this.target(); const lv = this.stars();
    for (const u of this.units) if (u.strip && tg.v && !tg.v.flat && overStrip(u.strip, tg.v)) { tg.v.flat = true; tg.v.impact(7); this.stats.flats++; this.note('suspect tyres punctured'); this.g.hud.notify('Tyres punctured', 'You drove over a police spike strip — the car is slow and hard to control now. Switch vehicles to get away.', 'warn', 4); this.radio('flat', u, true); }
    if (this.state !== 'pursuing' || lv < 4 || !tg.v || Math.abs(tg.v.speed) < 8 || this.seenT > 0.3 || this.blockCd > 0 || this.g.indoor) return;
    if (this.units.filter((u) => u.task === 'block').length >= (lv >= 5 ? 4 : 2)) return;
    this.blockCd = 6; const site = roadblockSite(tg.v, () => nearestRoad(this.T.drivableSegs, tg.x, tg.z), this.T.drivable, 150, 240); if (!site) return;
    const cam = this.g.camera.position; if (Math.hypot(site.x - cam.x, site.z - cam.z) < 130) return;
    if (this.T.all().some((o) => !o.player && Math.hypot(o.x - site.x, o.z - site.z) < 12)) return; // never spawn on top of traffic
    const fx = Math.sin(site.yaw), fz = Math.cos(site.yaw), rx = fz, rz = -fx; const hw = site.hw; const spikes = lv >= 5;
    // two cars broadside; with spikes they leave a tempting gap on one side and the strip lies across it, nearer the suspect
    const offs = spikes ? [-hw * 0.55, hw * 0.05] : [-hw * 0.48, hw * 0.48]; const made = [];
    offs.forEach((o, k) => { const x = site.x + rx * o + fx * (k ? 1.6 : -0.4), z = site.z + rz * o + fz * (k ? 1.6 : -0.4); const u = this.spawnUnit({ at: { x, z, yaw: site.yaw + Math.PI / 2 + (k ? 0.22 : -0.22) }, jeep: lv >= 5 && k === 1 }); if (u) made.push(u); });
    if (!made.length) return; this.blockCd = 35; this.stats.roadblocks++;
    for (const u of made) { u.task = 'block'; u.blockT = 0; u.patrol = false; const v = u.v; v.speed = 0; v.ai.stopped = true; u.officers.forEach((o, i) => { o.mode = 'exit'; o.t = -i * 0.4 - 0.5; }); this.syncSeated(u); }
    if (spikes) { const gap0 = hw * 0.05 + 2.6, gap1 = hw + 0.4; const c = (gap0 + gap1) / 2, len = Math.max(2.5, gap1 - gap0); const x = site.x + rx * c + fx * 7, z = site.z + rz * c + fz * 7; const st = makeSpikeStrip(x, z, site.yaw, len); this.g.scene.add(st.mesh); made[made.length - 1].strip = st; this.stats.spikes++; }
    const road = L.roadNameAt(site.x, site.z) || 'the road ahead'; this.note(`roadblock on ${road}${spikes ? ' + spike strip' : ''}`); this.radio(spikes ? 'spikes' : 'roadblock', made[0], true, { road });
  }
  dropStrip(u) { if (u.strip) { u.strip.mesh.parent?.remove(u.strip.mesh); u.strip = null; } }

  // ------------------------------------------------------------------ radio chatter (subtitled; real street names and compass direction)
  radio(kind, u, force = false, extra = {}) {
    if (!force && this.radioCd > 0) return; const live = this.seenT < 0.3 || !this.lastSeen; const T0 = this.target(); const tg = live ? T0 : { x: this.lastSeen.x, z: this.lastSeen.z, v: T0.v }; const P = this.g.player; const h = live ? (tg.v ? (tg.v.speed >= 0 ? tg.v.yaw : tg.v.yaw + Math.PI) : P.yaw) : this.lastSeen.h || 0; // only what has been seen
    const l = radioLine(kind, { road: L.roadNameAt(tg.x, tg.z), dir: compass(h), vtype: tg.v ? tg.v.type : 'foot', unit: u ? u.id : 1, alt: this.radioN % 3 === 2, ...extra }); if (!l.en && !l.si) return;
    this.radioN++; this.radioCd = 7 + Math.random() * 4; const lang = l.si ? 'si' : 'en'; this.g.hud.subtitle(kind === 'heading' || kind === 'roadblock' || kind === 'spikes' || kind === 'lost' ? 'Police radio · Control' : `Police radio · Unit ${u ? u.id : 1}`, l.si || l.en, l.tr || '', 3, lang); Audio.radioBlip?.();
  }
  updateRadio(dt) { this.radioCd -= dt; if (this.state === 'pursuing' && this.stars() >= 2 && this.seenT < 0.3 && this.radioCd <= 0) this.radio('heading'); }

  // ------------------------------------------------------------------ officers
  // front-seat crews get in and out the way the player does (Boarding.js): cached geometry for this officer + seat
  boardFor(o, v) { if (!v || !o.seat) return null; if (o.bfV !== v || o.bfSeat !== o.seat) { o.bfV = v; o.bfSeat = o.seat; o.bf = npcBoardSetup(v, o.seat, o.ch.anim); } return o.bf; }
  shutDoorNow(bf) { if (bf && bf.door) { bf.door.ang = 0; bf.door.vel = 0; bf.door.pivot.rotation.y = 0; } }
  exitWorld(o, v) { v.mesh.updateMatrixWorld(); const bf = this.boardFor(o, v); const e = bf ? bf.H0 : o.seat.exit || [Math.sign(o.seat.x || 1) * (v.T.wid / 2 + 0.6), o.seat.z]; const w = new THREE.Vector3(e[0], 0, e[1]).applyMatrix4(v.mesh.matrixWorld); return [w.x, w.z, e]; }
  updateOfficer(o, u, dt) {
    const g = this.g, A = o.ch.anim, v = u.v; let speed = 0;
    if (o.mode === 'seated') { if (v) { o.x = v.x; o.z = v.z; o.y = v.y; o.yaw = v.yaw; if (v.doorShut && v.doorShut === o.bf) { const ev = swingDoor(v, o.bf.door, o.bf.side, -0.35, dt, 6.5, 0.9); if (ev === 'latched' || (o.shutT = (o.shutT || 0) + dt) > 1.4) { if (ev !== 'latched') this.shutDoorNow(o.bf); v.doorShut = null; o.shutT = 0; } } } return; } // animated by Traffic.updateOccupants (the driver pulls his door shut first)
    if (o.mode === 'exit') { // slide out of the seat to the door spot while standing up (reverse of entering)
      o.t += dt; if (o.t < 0) { A.update(dt, 0); return; }
      const bf = this.boardFor(o, v); if (bf) { // front seat: door open, then the player's step-out motion (outer leg out, rise under the roof, inner foot down)
        if (bf.door) swingDoor(v, bf.door, bf.side, 1, dt, 8.5, 0.62); const tt = o.t - (bf.door ? 0.35 : 0); if (tt < 0) { A.update(dt, 0); return; }
        if (!o.boarding) { lapGrips(o.ch, v, o.seat, bf.G); o.boarding = true; A.set(null); A.standUp(); A.duck = 0; }
        const TX = bf.T * (bf.kind === 'bike' || bf.G.lap ? 1 : EXIT_K); /* no door to swing out on: a passenger is not hurried */ const k = 1 - Math.min(1, tt / TX), tl = TX + 0.12 - tt;
        poseBoard(A, bf.G, boardCurve(bf.G, k), v.mesh, boardGroundFn(v, g.collision), 0, Math.min(1, Math.max(0, tl) / 0.25)); A.update(dt, 0, 0);
        if (tl <= 0) { A.board = null; o.boarding = false; const r = o.ch.root; const p = r.getWorldPosition(new THREE.Vector3()); const yw = new THREE.Euler().setFromQuaternion(r.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
          v.mesh.remove(r); g.scene.add(r); r.rotation.set(0, 0, 0); o.x = p.x; o.z = p.z; o.y = g.collision.groundAt(p.x, p.z, v.y + 0.6); o.yaw = yw; o.mode = 'foot'; o.goal = null; this.placeOfficer(o); A.update(0.0001, 0, 0); } // the door is left open while the crew is out
        return;
      }
      const k = Math.min(1, o.t / 0.9), sm = k * k * (3 - 2 * k); const [, , ex] = this.exitWorld(o, v);
      o.ch.root.position.set(lerp(o.seat.x, ex[0], sm), lerp(o.seat.y, 0, Math.min(1, sm * 1.3)), lerp(o.seat.z, ex[1], sm)); o.ch.root.rotation.set(0, lerp(0, Math.atan2(ex[0] - o.seat.x, ex[1] - o.seat.z), Math.min(1, sm * 1.5)), 0);
      A.sitIn(o.seat, 1 - sm, null); A.update(dt, k > 0.5 ? 1.0 : 0);
      if (k >= 1) { A.standUp(); const [wx, wz] = this.exitWorld(o, v); v.mesh.remove(o.ch.root); g.scene.add(o.ch.root); o.x = wx; o.z = wz; o.y = g.collision.groundAt(wx, wz, v.y + 0.6); o.yaw = v.yaw + o.ch.root.rotation.y; o.mode = 'foot'; o.goal = null; this.placeOfficer(o); }
      return;
    }
    if (o.mode === 'enter') { // slide from the door spot into the seat
      const bf = this.boardFor(o, v); if (bf) { o.t += dt; if (bf.door) swingDoor(v, bf.door, bf.side, 1, dt, 8.5, 0.62);
        if (!o.boarding) { // the last step to the stand point beside the opening, turning to face along the car while the door swings wide
          v.mesh.updateMatrixWorld(); const hw = new THREE.Vector3(bf.H0[0], 0, bf.H0[1]).applyMatrix4(v.mesh.matrixWorld); const dx = hw.x - o.x, dz = hw.z - o.z, dd = Math.hypot(dx, dz);
          if (dd > 1e-4) { const st = Math.min(dd, 1.3 * dt); o.x += dx / dd * st; o.z += dz / dd * st; } const dy = Math.atan2(Math.sin(v.yaw - o.yaw), Math.cos(v.yaw - o.yaw)); o.yaw += dy * Math.min(1, 9 * dt);
          o.y = g.collision.groundAt(o.x, o.z, v.y + 0.6); this.placeOfficer(o); this.animOfficer(o, dt, dd > 0.03 ? 1.1 : 0);
          if ((dd < 0.03 && Math.abs(dy) < 0.08 && (!bf.door || bf.door.ang > 0.85)) || o.t > 3) { o.x = hw.x; o.z = hw.z; o.yaw = v.yaw; this.placeOfficer(o); o.ch.root.parent?.remove(o.ch.root); v.mesh.add(o.ch.root); lapGrips(o.ch, v, o.seat, bf.G); o.boarding = true; o.t = 0; A.set(null); A.standUp(); A.duck = 0; }
          else return; } // (on the frame it is re-parented the step-in pose is applied at once: no frame in vehicle space at world coordinates)
        const k = Math.min(1, Math.max(0, o.t - 0.12) / bf.T); poseBoard(A, bf.G, boardCurve(bf.G, k), v.mesh, boardGroundFn(v, g.collision), 0, Math.min(1, o.t / 0.25)); A.update(dt, 0, 0);
        if (k >= 1) { A.board = null; o.boarding = false; seatCharacter(o.ch, v, o.seat); o.mode = 'seated'; if (bf.door) { v.doorShut = bf; o.shutT = 0; } this.syncSeated(u); }
        return;
      }
      o.t += dt; const k = Math.min(1, o.t / 0.9), sm = k * k * (3 - 2 * k); const ex = o.ex;
      o.ch.root.position.set(lerp(ex[0], o.seat.x, sm), lerp(0, o.seat.y, Math.min(1, sm * 1.3)), lerp(ex[1], o.seat.z, sm)); o.ch.root.rotation.set(0, lerp(Math.atan2(o.seat.x - ex[0], o.seat.z - ex[1]), 0, sm), 0);
      A.sitIn(o.seat, sm, null); A.update(dt, 0); if (k >= 1) { seatCharacter(o.ch, v, o.seat); o.mode = 'seated'; this.syncSeated(u); }
      return;
    }
    if (o.vault) { this.stepVault(o, dt); return; }
    if (o.mode === 'down') { o.downT -= dt; if (o.downT <= 0) { o.mode = 'foot'; A.set(null); o.hits = 0; } this.animOfficer(o, dt, 0); return; }
    // on foot
    const tg = this.target(); const P = g.player; const st = this.state; const dP = this.distTo(o, tg);
    if (o.mode === 'return' || u.task === 'leave' || u.task === 'mount') {
      if (!v) { o.goal = null; speed = this.walkAway(o, dt); }
      else { let [wx, wz, ex] = this.exitWorld(o, v); const dw = this.detour(o, v, ex); const tx = dw ? dw[0] : wx, tz = dw ? dw[1] : wz; speed = this.moveTo(o, tx, tz, 2.4, dt); o.retT = (o.retT || 0) + dt; const dd = Math.hypot(wx - o.x, wz - o.z);
        if (dd < 2.2 && (o.blockedT > 0.5 || o.retT > 12) && dd >= 0.35 && this.boardFor(o, v)) { o.t = 0; o.mode = 'enter'; o.retT = 0; o.boarding = false; return; }
        if (dd < 2.2 && (o.blockedT > 0.5 || o.retT > 12) && dd >= 0.35) { v.mesh.updateMatrixWorld(); const lp = v.mesh.worldToLocal(new THREE.Vector3(o.x, v.y, o.z)); o.ch.root.parent?.remove(o.ch.root); v.mesh.add(o.ch.root); o.ex = [lp.x, lp.z]; o.t = 0; o.mode = 'enter'; o.retT = 0; A.set(null); return; }
        if (o.retT > 20 && !this.inView(o)) { seatCharacter(o.ch, v, o.seat); this.shutDoorNow(this.boardFor(o, v)); o.mode = 'seated'; o.retT = 0; this.syncSeated(u); return; }
        if (dd < 0.35 && this.boardFor(o, v)) { o.retT = 0; o.t = 0; o.mode = 'enter'; o.boarding = false; return; }
        if (dd < 0.35) { o.retT = 0; o.ch.root.parent?.remove(o.ch.root); v.mesh.add(o.ch.root); o.ex = ex; o.t = 0; o.mode = 'enter'; A.set(null); return; } }
      this.animOfficer(o, dt, speed); return;
    }
    if (u.ems && o.mode === 'foot') { this.ems.medic(o, u, dt); return; } // 1990 ambulance crew (EMS.js)
    if (u.civil && o.mode === 'foot') { this.civilOfficer(o, u, dt); return; }
    if (o.tackle) { this.updateTackle(o, u, dt); return; }
    o.tackleCd = Math.max(0, (o.tackleCd || 0) - dt);
    { const ffs = this.ff.officer(o, u, dt); if (ffs !== null) { this.animOfficer(o, dt, ffs); return; } } // cover / armed response
    const sees = this.ff.sees(o, dt); const ls = this.lastSeen;
    if (u.task === 'block' && dP > 22) { const fx = sees ? tg : ls || tg; o.yaw += angDiff(Math.atan2(fx.x - o.x, fx.z - o.z), o.yaw) * Math.min(1, dt * 4); const want = dP < 70 ? 'point' : null; if (A.action !== want) A.set(want); this.animOfficer(o, dt, 0); return; } // roadblock: hold the line
    // chase only what is known: the suspect while THIS officer sees them, otherwise the last point anyone saw them (no
    // tracking through walls); arriving there without a sighting, the officer stops and looks around
    const chasing = st === 'pursuing' && (sees || (ls && this.t - ls.t < 12));
    if (chasing) {
      const stopMode = this.stars() <= 1; const want = stopMode ? 1.5 : 0.7; const run = !stopMode || (this.stop && this.stop.fled);
      const goal = sees ? tg : ls; const dG = sees ? dP : Math.hypot(goal.x - o.x, goal.z - o.z);
      if (dG > (sees ? want : 1.2)) speed = this.moveTo(o, goal.x, goal.z, run ? [5.7, 5.7, 6.1, 6.5, 6.8, 7.0][this.stars()] : dG > 8 ? 3.2 : 1.6, dt); else if (sees) { o.yaw += angDiff(Math.atan2(tg.x - o.x, tg.z - o.z), o.yaw) * Math.min(1, dt * 6); } else { o.yaw += dt * 1.1; if (A.action !== 'look' && !o.torchOn) A.set('look'); }
      if (stopMode && sees && dP < 5 && !this.stop) this.beginStop(o);
      // tackle (2★+): a suspect running away on foot within reach — the officer dives at their legs
      if (!stopMode && sees && !tg.v && !this.busy && o.tackleCd <= 0 && dP < 2.6 && dP > 0.8 && (P.speed || 0) > 2.4) { const fx = (tg.x - o.x) / dP, fz = (tg.z - o.z) / dP; const away = Math.sin(P.yaw) * fx + Math.cos(P.yaw) * fz; if (away > 0.25 || (P.speed || 0) > 5) { this.startTackle(o, tg); return; } }
      if (!stopMode && dP < (tg.v ? 0.7 : 1.4) && (!tg.v || Math.abs(tg.v.speed) < 1)) { o.grab = (o.grab || 0) + dt; if (o.grab > (tg.v ? 1.6 : 0.9)) { this.arrest(o, 'grab'); return; } } else o.grab = Math.max(0, (o.grab || 0) - dt);
      if (A.action && A.action !== 'talk' && A.action !== 'point' && A.action !== 'torch' && !(A.action === 'look' && !sees)) A.set(null); if (stopMode && sees && dP < 4 && A.action !== 'point' && A.action !== 'talk') A.set('point');
    } else { // look around the scene / search area
      if (!o.goal || o.goalT <= 0) { const c = st === 'searching' && this.search ? { x: o.x, z: o.z } : this.incident || { x: o.x, z: o.z }; for (let k = 0; k < 6; k++) { const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 9; const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; if (!g.collision.blocked(x, z, 0.3)) { o.goal = { x, z }; break; } } o.goalT = 6 + Math.random() * 4; o.pause = 0; }
      o.goalT -= dt; if (o.goal) { const d = Math.hypot(o.goal.x - o.x, o.goal.z - o.z); if (d > 0.4) speed = this.moveTo(o, o.goal.x, o.goal.z, 1.45, dt); else if (A.action !== 'look' && !o.torchOn) A.set('look'); }
      if (speed > 0 && A.action === 'look') A.set(null);
    }
    this.animOfficer(o, dt, speed);
  }
  // ---- civil calls (no wanted level): a bystander reports a street fight; one patrol car comes with its lights on, the
  // officers break it up, handcuff the people involved, walk them to the back seats and drive away. These units are kept
  // apart from the wanted-level units (this.civil), so dispatch / pursuit logic never touches them.
  civilCall(inc, force = false) {
    if (this.level > 0 || this.state === 'pursuing' || this.g.director.active || this.busy || (this.civil.length && !force)) return null;
    const u = this.spawnUnit({ near: !!(inc.F && inc.F.player) }) || this.spawnUnit(); if (!u) return null; this.units = this.units.filter((q) => q !== u); this.civil.push(u);
    u.civil = inc; u.task = 'civil'; u.cphase = 'drive'; u.prisoners = []; u.ct = 0; u.v.ai.v0 = 13;
    if (!this.plan(u, inc.x, inc.z)) { this.removeCivil(u); return null; }
    this.stats.civil = (this.stats.civil || 0) + 1; this.note(`unit ${u.id} civil call (${inc.kind})`); return u;
  }
  // ---- 119 from the player's phone (Phone → Contacts). Police: the person who is fighting / has just punched the player
  // is arrested and driven away (a civil unit with a one-person incident); failing that, a street fight nearby is reported.
  emergencyCall(kind) { return kind === 'ambulance' ? this.ems.call() : this.policeCall(); }
  assailant(r = 60) { const C = this.g.crowd, P = this.g.player; if (!C) return { live: null, dead: null }; let live = null, dead = null, bl = r, bd = r;
    for (const p of C.peds) { const recent = p.state === 'fight' || (p.foughtT !== undefined && C.t - p.foughtT < 90); if (!recent || p.reported119) continue; const d = Math.hypot(p.x - P.x, p.z - P.z); if (p.dead) { if (d < bd) { bd = d; dead = p; } } else if (d < bl) { bl = d; live = p; } }
    return { live, dead }; }
  policeCall() {
    const g = this.g, C = g.crowd, P = g.player; const R = (ok, msg) => ({ ok, title: 'Police 119', msg });
    if (this.level > 0) return R(false, 'The police are already looking for YOU — no separate unit is sent.');
    if (g.indoor) return R(false, 'Go outside so the patrol car can find you.');
    if (g.director.active || this.busy) return R(false, 'All units are committed right now. Try again shortly.');
    if (this.civil.some((u) => u.civil && u.civil.F && u.civil.F.player)) return R(false, 'A patrol car is already on its way to you.');
    const { live, dead } = this.assailant();
    if (!live) {
      if (dead) return R(false, 'The person who attacked you is not moving. Call 119 again and ask for an ambulance.');
      const SL = C && C.life; const F = SL && SL.fights && SL.fights.find((f) => !f.unit && !f.handed && Math.hypot(f.x - P.x, f.z - P.z) < 60);
      if (F) { const u = this.civilCall({ x: F.x, z: F.z, kind: 'fight', F, road: L.roadNameAt ? L.roadNameAt(F.x, F.z) : '' }, true); if (u) { F.unit = u; F.called = true; return R(true, `A patrol car is coming to break up the fight on ${L.roadNameAt?.(F.x, F.z) || 'your street'}.`); } return R(false, 'No patrol car can reach you right now — try again in a moment.'); }
      return R(false, 'There is nobody attacking you nearby, so no unit is sent. (Calling 119 without cause is an offence.)');
    }
    const p = live; const crowd = C;
    const life = { handOver: (F) => { F.handed = true; const a = F.a; a.keep = false; a.ch.anim.fightOn(false); a.ch.anim.block?.(false); a.ch.mesh.rotation.set(0, 0, 0); a.ch.mesh.position.set(0, 0, 0); crowd.release(a); this.stats.assaultArrests = (this.stats.assaultArrests || 0) + 1; },
      endFight: (F, why) => { F.ended = true; F.why = why; if (F.a) { F.a.keep = false; F.a.reported119 = false; } } };
    const F = { a: p, b: null, kind: 'assault', player: true, life, x: p.x, z: p.z }; p.keep = true; p.reported119 = true;
    const u = this.civilCall({ x: p.x, z: p.z, kind: 'assault', F, road: L.roadNameAt ? L.roadNameAt(p.x, p.z) : '' }, true);
    if (!u) { p.keep = false; p.reported119 = false; return R(false, 'No patrol car can reach you right now — try again in a moment.'); }
    F.unit = u; this.note(`119: assault on the player reported, unit ${u.id}`);
    const st = this.nearestStation(); return R(true, `A patrol car from ${st.name.replace(', Kompannaveediya', '')} is on its way for the man who attacked you. Keep your distance.`);
  }
  checkAssault(u, F) { // the suspect died / vanished before the arrest
    if (F.handed || F.ended || !F.a) return; const a = F.a; const C = this.g.crowd;
    if (a.dead) { F.life.endFight(F, 'dead'); this.g.hud.notify('Police 119', 'The suspect is down and not moving — no arrest. Call 119 for an ambulance.', 'info', 5); }
    else if (C && !C.peds.includes(a)) F.life.endFight(F, 'gone');
  }
  nearPlayer(x, z, r = 35) { const P = this.g.player; return Math.hypot(P.x - x, P.z - z) < r; }
  updateCivil(u, dt) {
    const g = this.g, v = u.v, inc = u.civil; u.ct += dt;
    if (!v || v.player || this.level > 0) { this.abortCivil(u); return; } // the player took the car / became wanted: normal police logic takes over
    v.beacons(u.cphase !== 'leave', this.t); v.lights = g.atmos ? g.atmos.night > 0.4 : false;
    for (const o of u.officers) this.updateOfficer(o, u, dt);
    for (const q of u.prisoners) this.updatePrisoner(q, u, dt);
    const F = inc.F; if (F && F.player) this.checkAssault(u, F);
    if (u.cphase === 'drive') {
      const ai = v.ai; if (F && !F.handed && !F.ended && F.a) { const b2 = F.b || F.a; inc.x = (F.a.x + b2.x) / 2; inc.z = (F.a.z + b2.z) / 2; }
      const gd = ai.goal && ai.goal.piece && ai.goal.dist !== undefined ? ai.goal.dist : Infinity; const near = Math.hypot(v.x - inc.x, v.z - inc.z);
      if (v.speed < 0.3 && gd > 5) u.stuckT += dt; else u.stuckT = 0;
      if ((gd < 5 && v.speed < 0.6) || (near < 16 && v.speed < 0.6) || (u.stuckT > 6 && near < 40)) { u.cphase = 'scene'; u.sceneT = 0; this.dismount(u, 'civil'); u.task = 'civil'; }
      else if (u.stuckT > 6) { u.stuckT = 0; this.plan(u, inc.x, inc.z); }
      else if (u.ct > 150) { this.civilLeave(u); }
      return;
    }
    if (u.cphase === 'scene') { u.sceneT += dt;
      const gone = !F || F.ended || (!F.handed && !F.a); // nobody left to arrest (they walked off before the police came)
      if ((gone && u.sceneT > 10) || u.sceneT > 120) { for (const o of u.officers) if (o.mode === 'foot') { o.mode = 'return'; o.goal = null; } u.cphase = 'mount'; }
      if (F && F.handed && u.prisoners.length && u.prisoners.every((q) => q.mode === 'seated')) { for (const o of u.officers) if (o.mode === 'foot') { o.mode = 'return'; o.goal = null; } u.cphase = 'mount'; }
      return;
    }
    if (u.cphase === 'mount') { if (this.allSeated(u) && u.prisoners.every((q) => q.mode === 'seated')) this.civilLeave(u); return; }
    if (u.cphase === 'leave') { u.leaveT += dt; const P = g.player; const d = Math.hypot(v.x - P.x, v.z - P.z); if ((d > 140 && !this.inView(v)) || d > 300 || u.leaveT > 120) this.removeCivil(u); }
  }
  civilLeave(u) { u.cphase = 'leave'; u.leaveT = 0; const v = u.v; v.ai.stopped = false; v.ai.route = null; v.ai.goal = null; v.ai.v0 = 11; v.beacons(false); if (u.prisoners.length) this.stats.civilArrests = (this.stats.civilArrests || 0) + u.prisoners.length; this.note(`unit ${u.id} leaving with ${u.prisoners.length} detained`); }
  removeCivil(u) { // prisoners in the car are disposed with it (v.pax); anyone left standing is disposed here
    for (const q of u.prisoners || []) if (q.mode !== 'seated') { q.ch.root.parent?.remove(q.ch.root); q.ch.dispose(); }
    this.civil = this.civil.filter((q) => q !== u); this.units.push(u); this.removeUnit(u);
  }
  abortCivil(u) { // hand over to the normal logic; people not yet in the car are let go
    for (const q of u.prisoners) if (q.mode !== 'seated') { q.ch.anim.set(null); if (this.g.crowd && this.g.crowd.adopt) this.g.crowd.adopt(q.ch, q.x, q.z, q.yaw, 'flee'); else { q.ch.root.parent?.remove(q.ch.root); q.ch.dispose(); } }
    u.prisoners = u.prisoners.filter((q) => q.mode === 'seated'); const F = u.civil && u.civil.F; if (F && !F.handed && F.life) F.life.endFight(F, 'police'); if (F) F.unit = null;
    u.civil = null; this.civil = this.civil.filter((q) => q !== u); if (u.v && !u.v.player) { u.task = 'idle'; this.units.push(u); } else { this.units.push(u); this.removeUnit(u); }
  }
  civilOfficer(o, u, dt) {
    const A = o.ch.anim, inc = u.civil, F = inc.F, k = u.officers.indexOf(o); let speed = 0;
    if (F && !F.handed && !F.ended && F.a) { // still fighting: go in; within a few metres shout, and both stop with their hands up
      const tgt = k === 0 ? F.a : (F.b || F.a); const d = Math.hypot(tgt.x - o.x, tgt.z - o.z);
      const ko = F.player && tgt.state === 'down' && !tgt.dead; // knocked out: stand over them until they come round, then arrest
      if (d > (ko ? 1.8 : 8.5)) speed = this.moveTo(o, tgt.x, tgt.z, d > 15 ? 3.4 : 2.2, dt);
      else if (ko) { o.yaw += angDiff(Math.atan2(tgt.x - o.x, tgt.z - o.z), o.yaw) * Math.min(1, dt * 5); if (!F.saidWait && k === 0) { F.saidWait = true; if (this.nearPlayer(o.x, o.z)) this.say(o, 'waitUp', 'Police officer'); } }
      else { F.stopped = true; if (this.nearPlayer(o.x, o.z)) this.say(o, F.player ? 'arrest' : 'breakup', 'Police officer'); this.takePrisoners(u, F); }
      if (A.action !== (speed ? null : 'point')) A.set(speed ? null : 'point'); this.animOfficer(o, dt, speed); return;
    }
    const q = u.prisoners.find((p) => p.officer === o);
    if (!q || q.mode === 'seated' || q.mode === 'enter') { // nobody (left) to take, or done: look round, then back to the car
      if (q) { o.mode = 'return'; o.goal = null; if (A.action === 'hold') A.set(null); o.ch.anim.holdR = null; this.animOfficer(o, dt, 0); return; }
      if (!o.goal || o.goalT <= 0) { const a = Math.random() * Math.PI * 2; o.goal = { x: inc.x + Math.cos(a) * 4, z: inc.z + Math.sin(a) * 4 }; o.goalT = 5; } o.goalT -= dt; speed = Math.hypot(o.goal.x - o.x, o.goal.z - o.z) > 0.4 ? this.moveTo(o, o.goal.x, o.goal.z, 1.4, dt) : 0; if (!speed && A.action !== 'look') A.set('look'); this.animOfficer(o, dt, speed); return; }
    if (q.mode === 'held') { // walk round behind them; they turn their back; handcuffs
      const bx = q.x - Math.sin(q.yaw) * 0.62, bz = q.z - Math.cos(q.yaw) * 0.62; const d = Math.hypot(bx - o.x, bz - o.z);
      if (d > 0.25 && !(d < 0.5 && o.blockedT > 0.4)) { speed = this.moveTo(o, bx, bz, d > 6 ? 2.6 : 1.3, dt); if (A.action) A.set(null); }
      else { o.yaw += angDiff(Math.atan2(q.x - o.x, q.z - o.z), o.yaw) * Math.min(1, dt * 6); q.mode = 'cuffing'; q.t = 0; A.set('interact'); if (u.officers[0] === o && this.nearPlayer(o.x, o.z)) this.say(o, u.prisoners.length === 1 ? 'cuff1' : 'cuff', 'Police officer'); }
      this.animOfficer(o, dt, speed); return; }
    if (q.mode === 'cuffing') { o.yaw += angDiff(Math.atan2(q.x - o.x, q.z - o.z), o.yaw) * Math.min(1, dt * 6); if (A.action !== 'interact') A.set('interact'); this.animOfficer(o, dt, 0); return; }
    if (q.mode === 'escort') { // walk them to their door, a hand on the upper arm
      const v = u.v; const [wx, wz, ex] = this.exitWorld(q, v); const d = Math.hypot(wx - q.x, wz - q.z);
      // the officer stands just outside the door spot (away from the car, a little toward the front): never inside the car's footprint
      const side = Math.sign(ex[0]) || 1, rx = Math.cos(v.yaw) * side, rz = -Math.sin(v.yaw) * side, fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      let ox = wx + rx * 0.55 + fx * 0.45, oz = wz + rz * 0.55 + fz * 0.45; if (this.g.collision.blocked(ox, oz, 0.25)) { ox = wx + fx * 0.7; oz = wz + fz * 0.7; } const dO = Math.hypot(ox - o.x, oz - o.z);
      if (d > 0.9 && dO > 0.3 && !(o.blockedT > 1.2) && q.t < 20) speed = this.moveTo(o, ox, oz, 1.25, dt); else { q.mode = 'toDoor'; q.t = 0; }
      this.holdArm(o, q); this.animOfficer(o, dt, speed); return; }
    if (q.mode === 'toDoor') { o.yaw += angDiff(Math.atan2(q.x - o.x, q.z - o.z), o.yaw) * Math.min(1, dt * 4); this.holdArm(o, q); this.animOfficer(o, dt, 0); return; }
    this.animOfficer(o, dt, 0);
  }
  holdArm(o, q) { // officer's right hand on the detainee's upper arm (detainee walks on the officer's right)
    const A = o.ch.anim, c = q.ch.bones.chest; c.updateWorldMatrix(true, false); const s = q.ch.anim.s || 1; const w = c.localToWorld(new THREE.Vector3(0.19 * s, -0.04 * s, -0.01));
    const oc = o.ch.bones.chest; oc.updateWorldMatrix(true, false); oc.worldToLocal(w); w.multiplyScalar(1 / (A.s || 1)); A.holdR = w; A.holdL = null; if (Math.hypot(w.x, w.y, w.z) > 0.62) { if (A.action === 'hold') A.set(null); return; } if (A.action !== 'hold') A.set('hold');
  }
  takePrisoners(u, F) { // the two people leave the crowd and are handled here until they are in the car
    if (F.handed) return; const v = u.v, seats = v.mesh.userData.seats; const used = new Set(u.officers.map((o) => o.si));
    const free = seats.map((q, i) => i).filter((i) => !used.has(i) && !seats[i].driver).sort((i, j) => seats[i].z - seats[j].z); // rear seats first
    const ppl = [F.a, F.b].filter(Boolean); if (F.life) F.life.handOver(F); else F.handed = true; const taken = new Set();
    ppl.forEach((p, k) => { const o = u.officers[k] || u.officers[0]; const side = Math.sign(o.seat.x || 1); // the back seat on the escorting officer's side: nobody walks round the car
      const si = free.find((i) => !taken.has(i) && Math.sign(seats[i].x || 1) === side) ?? free.find((i) => !taken.has(i)) ?? free[0]; taken.add(si);
      u.prisoners.push({ ch: p.ch, x: p.x, z: p.z, y: p.y || 0.15, yaw: p.yaw, mode: 'held', seat: seats[si], si, officer: o, t: 0, acc: 0, hits: 0 }); p.ch.anim.set('handsup'); p.ch.face.mood = 'concern'; });
    this.note(`unit ${u.id}: ${ppl.length} people detained`);
  }
  updatePrisoner(q, u, dt) {
    const A = q.ch.anim, o = q.officer, g = this.g; let speed = 0; q.t += dt;
    if (q.mode === 'enter' || q.mode === 'seated') { this.updateOfficer(q, u, dt); return; }
    if (q.mode === 'held') { const d = Math.hypot(o.x - q.x, o.z - q.z); const face = d < 4 ? Math.atan2(q.x - o.x, q.z - o.z) : Math.atan2(o.x - q.x, o.z - q.z); // turn their back to the officer as he comes up
      q.yaw += angDiff(face, q.yaw) * Math.min(1, dt * 3); if (A.action !== 'handsup') A.set('handsup'); }
    else if (q.mode === 'cuffing') { if (q.t > 0.9 && A.action !== 'cuffed') A.set('cuffed'); if (q.t > 2.2) { q.mode = 'escort'; q.t = 0; if (o.ch.anim.action === 'interact') o.ch.anim.set(null); } }
    else if (q.mode === 'escort') { // beside the officer, a little ahead, matching his pace
      const fx = Math.sin(o.yaw), fz = Math.cos(o.yaw); const tx = o.x - fz * 0.45 + fx * 0.12, tz = o.z + fx * 0.45 + fz * 0.12; const dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz);
      const st = Math.min(d, 2.2 * dt); if (d > 1e-3) { q.x += dx / d * st; q.z += dz / d * st; } speed = st / Math.max(dt, 1e-4); q.yaw += angDiff(d > 0.15 ? Math.atan2(dx, dz) : o.yaw, q.yaw) * Math.min(1, dt * 5); q.y = g.collision.groundAt(q.x, q.z, q.y + 0.45); }
    else if (q.mode === 'toDoor') { const v = u.v; const [wx, wz, ex] = this.exitWorld(q, v); const d = Math.hypot(wx - q.x, wz - q.z);
      if (d > 0.3 && q.t < 6) speed = this.moveTo(q, wx, wz, 0.9, dt);
      else { q.ch.root.parent?.remove(q.ch.root); v.mesh.add(q.ch.root); v.mesh.updateMatrixWorld(); const lp = v.mesh.worldToLocal(new THREE.Vector3(q.x, v.y, q.z)); q.ex = d > 0.3 ? [lp.x, lp.z] : ex; q.t = 0; q.mode = 'enter'; o.ch.anim.holdR = null; if (o.ch.anim.action === 'hold') o.ch.anim.set(null); return; } }
    if (q.mode !== 'escort' && q.mode !== 'toDoor' && q.t > 40 && !this.inView(q) && u.v) { seatCharacter(q.ch, u.v, q.seat); q.mode = 'seated'; this.syncSeated(u); return; } // stuck somewhere off-screen: put them in
    this.animOfficer(q, dt, speed);
  }
  // standing on the far side of the car from the door you need: walk round the front of it (greedy steering can't)
  detour(o, v, ex) {
    v.mesh.updateMatrixWorld(); const lp = v.mesh.worldToLocal(new THREE.Vector3(o.x, v.y, o.z)); const sd = Math.sign(ex[0]) || 1, hw = (v.T.wid || 1.7) / 2, hl = v.half || 2.2;
    if (Math.sign(lp.x) === sd || Math.abs(lp.x) < 0.2 || lp.z > hl + 2.5 || lp.z < -hl - 0.5) return null;
    const front = lp.z < hl + 0.7 ? [Math.sign(lp.x) * (hw + 0.8), hl + 1.0] : [sd * (hw + 0.8), hl + 1.0]; const w = new THREE.Vector3(front[0], 0, front[1]).applyMatrix4(v.mesh.matrixWorld); return [w.x, w.z];
  }
  walkAway(o, dt) { if (!o.goal) { const a = Math.random() * Math.PI * 2; o.goal = { x: o.x + Math.cos(a) * 60, z: o.z + Math.sin(a) * 60 }; } return this.moveTo(o, o.goal.x, o.goal.z, 1.5, dt); }
  // walk towards (tx,tz): straight when the way is clear, otherwise along an A* path (FootNav) that goes round walls and
  // cars and climbs low compound walls. Speed is smoothed and the side-step keeps its side, so officers never jitter.
  moveTo(o, tx, tz, sp, dt) {
    if (o.vault) { this.stepVault(o, dt); return 0; }
    const col = this.g.collision; const d0 = Math.hypot(tx - o.x, tz - o.z); if (d0 < 0.05) return 0;
    let wx = tx, wz = tz; const N = this.nav;
    o.losT = (o.losT || 0) - dt;
    if (o.losT <= 0) { o.losT = 0.3 + Math.random() * 0.1; o.direct = d0 < 0.6 || N.lineClear(o.x, o.z, tx, tz, N.nearCars(Math.min(o.x, tx) - 3, Math.min(o.z, tz) - 3, Math.max(o.x, tx) + 3, Math.max(o.z, tz) + 3)); if (o.direct) N.stats.direct++; }
    if (!o.direct) {
      const P = o.path; const stale = !P || Math.hypot(P.gx - tx, P.gz - tz) > 1.5 || this.t - P.t > (P.reached ? 2 : 4) || (o.blockedT || 0) > 0.6;
      if (stale && this.navT !== this.t) { this.navT = this.t; o.path = N.plan(o.x, o.z, tx, tz); o.path.t = this.t; o.path.i = 0; o.blockedT = 0; } // at most one search per frame for the whole force (no frame spikes)
      const Q = o.path || { pts: [{ x: tx, z: tz }], i: 0, reached: true, ex: tx, ez: tz }; while (Q.i < Q.pts.length - 1 && Math.hypot(Q.pts[Q.i].x - o.x, Q.pts[Q.i].z - o.z) < (Q.pts[Q.i].vault ? 0.45 : 0.5)) { const w = Q.pts[Q.i]; if (w.vault) { this.startVault(o, w); Q.i++; return 0; } Q.i++; }
      const w = Q.pts[Math.min(Q.i, Q.pts.length - 1)]; if (w) { wx = w.x; wz = w.z; }
      if (!Q.reached && Q.i >= Q.pts.length - 1 && Math.hypot(Q.ex - o.x, Q.ez - o.z) < 0.6) { // as close as anyone on foot can get: hold here, facing the goal
        o.navHold = true; o.curSp = 0; o.yaw += angDiff(Math.atan2(tx - o.x, tz - o.z), o.yaw) * Math.min(1, dt * 5); this.placeOfficer(o); return 0; }
    } else o.path = null;
    o.navHold = false;
    const dx = wx - o.x, dz = wz - o.z, d = Math.hypot(dx, dz); if (d < 0.02) return 0; const want = Math.atan2(dx, dz);
    o.curSp = (o.curSp || 0) + clamp(sp - (o.curSp || 0), -10 * dt, 7 * dt); const v = Math.max(0.6, o.curSp); const step = Math.min(d, v * dt);
    const stuckIn = col.blocked(o.x, o.z, 0.2) || this.carAt(o.x, o.z); // e.g. a door spot beside a parked car: walk out of it
    const side = o.lastSide || 1; // keep the side-step on the same side as last time (no frame-to-frame flip-flop)
    for (const off of [0, 0.45 * side, -0.45 * side, 0.9 * side, -0.9 * side, 1.5 * side, -1.5 * side, 2.2 * side, -2.2 * side]) { const a = want + off; const nx = o.x + Math.sin(a) * step, nz = o.z + Math.cos(a) * step; if (!stuckIn && (col.blocked(nx, nz, 0.28) || this.carAt(nx, nz))) continue;
      if (off) o.lastSide = Math.sign(off); o.x = nx; o.z = nz; o.y = col.groundAt(nx, nz, o.y + 0.45); o.yaw += angDiff(a, o.yaw) * Math.min(1, dt * 8); o.blockedT = Math.max(0, (o.blockedT || 0) - dt); this.placeOfficer(o); return v; }
    o.curSp *= 0.5; o.blockedT = (o.blockedT || 0) + dt; o.losT = 0; o.direct = false; return 0;
  }
  // climbing a low wall (as the player can): up onto the top, over, and down the other side — about a second
  startVault(o, w) { const V = w.vault; const g = this.g; o.vault = { t: 0, x0: o.x, z0: o.z, y0: o.y, x1: V.x, z1: V.z, y1: g.collision.groundAt(V.x, V.z, (V.top || o.y + 1.6) + 0.2), top: Math.max(o.y + 0.6, V.top || o.y + 1.6), yaw: Math.atan2(V.x - o.x, V.z - o.z), f: -1 }; o.ch.anim.set('handsup'); this.stats.vaults = (this.stats.vaults || 0) + 1; }
  stepVault(o, dt) {
    const V = o.vault; if (!V || V.f === this.t) return; V.f = this.t; V.t += dt / 1.05; const k = Math.min(1, V.t);
    const up = Math.min(1, k / 0.45), hz = k < 0.35 ? 0.25 * (k / 0.35) : k < 0.75 ? 0.25 + 0.6 * ((k - 0.35) / 0.4) : 0.85 + 0.15 * ((k - 0.75) / 0.25);
    const y = k < 0.6 ? lerp(V.y0, V.top + 0.02, up * up * (3 - 2 * up)) : lerp(V.top + 0.02, V.y1, Math.min(1, ((k - 0.6) / 0.4) ** 1.6));
    o.x = lerp(V.x0, V.x1, hz); o.z = lerp(V.z0, V.z1, hz); o.y = y; o.yaw += angDiff(V.yaw, o.yaw) * Math.min(1, dt * 10);
    const A = o.ch.anim; if (k > 0.62 && A.action === 'handsup') A.set(null); this.ff.pose?.(o, dt); A.update(dt, 0); this.placeOfficer(o);
    if (k >= 1) { o.vault = null; o.y = V.y1; o.curSp = 1.5; o.losT = 0; this.placeOfficer(o); }
  }
  carAt(x, z) { for (const v of this.T.all()) { if (Math.abs(v.x - x) > 6 || Math.abs(v.z - z) > 6) continue; const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const rx = x - v.x, rz = z - v.z; if (Math.abs(rx * fx + rz * fz) < v.half + 0.15 && Math.abs(rx * fz - rz * fx) < (v.T.wid || 1.7) / 2 + 0.2) return true; } return false; }
  placeOfficer(o) { o.ch.root.position.set(o.x, o.y, o.z); o.ch.root.rotation.y = o.yaw; }
  animOfficer(o, dt, speed) { const tg = this.target(); const d = Math.hypot(tg.x - o.x, tg.z - o.z); o.acc += dt; const rate = d < 50 ? 0 : d < 120 ? 0.12 : 0.4; this.ff.torch(o, dt); this.ff.pose(o, dt); o.animSp = (o.animSp || 0) + (speed - (o.animSp || 0)) * Math.min(1, dt * (speed > (o.animSp || 0) ? 9 : 6)); if (speed === 0 && o.animSp < 0.25) o.animSp = 0; /* gait speed eased: a single blocked step no longer snaps the walk cycle to a stand */ if (o.acc >= rate) { o.ch.anim.update(Math.min(o.acc, 0.25), o.animSp); o.acc = 0; } this.placeOfficer(o); this.ff.placeTorch(o); }
  officerHit(o, dx, dz) { // non-graphic: the first round staggers; a second puts the officer down for good
    if (o.mode !== 'foot' && o.mode !== 'down') return; if (o.tackle) { o.tackle = null; } o.hits = (o.hits || 0) + 1; this.reason = 'assaulting a police officer'; this.ff.onOfficerHit(o);
    this.incident = { x: this.g.player.x, z: this.g.player.z, t: this.t }; this.addHeat(1, this.reason, 'You attacked an officer.'); this.spotted();
    if (o.hits >= 2) this.killOfficer(o, dx, dz); else { const col = this.g.collision; let nx = o.x + dx * 0.35, nz = o.z + dz * 0.35; if (col) { const r = col.resolveCircle(nx, nz, 0.3, o.y || 0.15, 0.3); nx = r.x; nz = r.z; } o.x = nx; o.z = nz; o.ch.face?.set?.('fear', 2); } // staggered back, never into a wall
  }
  // incapacitated: the body stays where it fell (it no longer belongs to the unit, so a unit driving off or being removed
  // never makes it vanish in view) and is cleared away later, unseen. A unit with nobody left leaves its car parked.
  killOfficer(o, dx = 0, dz = 0) {
    if (o.dead) return; if (o.boarding || o.ch.anim.board) { const r = o.ch.root; o.ch.anim.board = null; o.boarding = false; if (r.parent && r.parent !== this.g.scene) { const p = r.getWorldPosition(new THREE.Vector3()); r.parent.remove(r); this.g.scene.add(r); r.position.copy(p); r.rotation.set(0, o.yaw || 0, 0); o.x = p.x; o.z = p.z; } }
    o.dead = true; o.mode = 'dead'; o.tackle = null; o.cuffing = false; o.torchOn = false; if (o.torchM) o.torchM.visible = false;
    o.ch.anim.ik = null; o.ch.anim.aim = null; o.ch.anim.set('down'); o.ch.face?.set?.('blink', 1e9); this.ff.disarm?.(o);
    const u = o.unit; if (u) u.officers = u.officers.filter((q) => q !== o);
    const R = this.g.ragdolls; if (R && o.ch.root.parent && !o.ch.rag) R.add(o.ch, { vel: [dx * 1.8, 0, dz * 1.8] }); // goes limp (ragdoll)
    this.bodies.push({ o, ch: o.ch, x: o.x, z: o.z, t: 0 }); this.stats.officersDown = (this.stats.officersDown || 0) + 1; this.note('officer down (incapacitated)');
    if (u && !u.officers.length) this.abandonUnit(u);
  }
  abandonUnit(u) {
    const T = this.T; this.dropStrip(u); const v = u.v;
    if (v && !v.player) { const i = T.vehicles.indexOf(v); if (i >= 0) T.vehicles.splice(i, 1); v.ai = null; v.speed = 0; v.police = null; v.driverChar = null; T.release(v, true); }
    else if (v) v.police = null;
    this.units = this.units.filter((q) => q !== u); this.civil = this.civil.filter((q) => q !== u); this.note(`unit ${u.id} has nobody left — car left where it stopped`);
  }
  updateBodies(dt) {
    for (const b of this.bodies) { b.t += dt; const r = b.ch.rag;
      if (r) { if (!r.kin) { const P = r.pelvis(); b.x = b.o.x = P.x; b.z = b.o.z = P.z; } if (!b.pooled && this.g.blood && (r.asleep || b.t > 3)) { b.pooled = true; const P = r.pelvis(), C = r.part('chest'); this.g.blood.pool(P.x * 0.45 + C.x * 0.55, P.z * 0.45 + C.z * 0.55, 1.0 + Math.random() * 0.4, P.y); } }
      else if (b.t < 2.5) { b.o.ch.anim.update(dt, 0); this.placeOfficer(b.o); } }
    const tg = this.target(); const gone = this.bodies.filter((b) => b.t > 150 && !this.inView(b) && Math.hypot(b.x - tg.x, b.z - tg.z) > 35 || Math.hypot(b.x - tg.x, b.z - tg.z) > 260);
    for (const b of gone) { if (b.ch.rag) { this.g.ragdolls?.remove(b.ch.rag); b.ch.rag = null; } b.ch.root.parent?.remove(b.ch.root); b.ch.dispose(); } if (gone.length) this.bodies = this.bodies.filter((b) => !gone.includes(b));
  }
  pushPlayer() { const P = this.g.player; if (P.vehicle) return; for (const o of this.foot) { const dx = P.x - o.x, dz = P.z - o.z, d = Math.hypot(dx, dz); if (d < 0.55 && d > 1e-3) { P.x = o.x + (dx / d) * 0.55; P.z = o.z + (dz / d) * 0.55; } } }
  say(o, kind, who) { const arr = LINES[kind]; if (!arr) return; const l = arr[Math.floor(Math.random() * arr.length)]; const lang = l.si ? 'si' : l.ta ? 'ta' : 'en'; this.g.hud.subtitle(who || 'Police officer', l.si || l.ta || l.en, l.tr || '', 2.6, lang); Audio.talkBlip?.(lang); }

  // ------------------------------------------------------------------ stop → fine (1★)
  beginStop(o) { this.stop = { o, t: 0, still: 0, fled: false, warned: true }; this.say(o, 'stop', 'Police officer'); this.note('stop issued'); }
  updateStop(dt) {
    const S = this.stop; if (!S) return; const P = this.g.player; const o = S.o; S.t += dt;
    if (o.mode !== 'foot' || this.stars() >= 2 || this.state !== 'pursuing') { this.stop = null; return; }
    const tg = this.target(); const d = this.distTo(o, tg); const moving = P.vehicle ? Math.abs(P.vehicle.speed) > 0.8 : P.speed > 0.6;
    this.prompt = P.vehicle ? 'Police stop — stay stopped to comply' : 'Police stop — stand still to comply (move away to run)';
    if (d < 3.2 && !moving) { S.still += dt; if (S.still > 0.4 && !S.saidComply) { S.saidComply = true; this.say(o, 'comply', 'Police officer'); } } else if (moving) S.still = Math.max(0, S.still - dt * 2);
    if (S.still > 2.6) { this.fine(o); return; }
    if (d > 9 && S.t > 1) { S.fled = true; this.stop = null; this.reason = 'failing to stop for the police'; this.level = Math.max(this.level, 1); this.addHeat(1, this.reason, 'You ran from an officer.'); this.spotted(); }
  }
  chargeable(amount) { const money = this.g.story.state.money; return Math.max(0, Math.min(amount, money)); }
  fine(o) {
    const amount = FINE_ON_SPOT; const paid = this.chargeable(amount); const why = this.reason || 'public disturbance';
    if (paid > 0) this.g.story.pay(-paid, `Police fine — ${why}`);
    this.stats.fines++; this.note(`fined Rs ${paid}/${amount}`); this.lastPenalty = { kind: 'fine', amount, paid, why };
    this.g.hud.notify('Fined on the spot', `Rs. ${amount.toLocaleString('en-LK')} for ${why}${paid < amount ? ` — you only had Rs. ${paid.toLocaleString('en-LK')}; the rest was waived` : ''}. Wanted level cleared.`, 'info', 6);
    o.ch.anim.set('talk'); this.stop = null; this.standDown(null);
  }

  // ------------------------------------------------------------------ arrest → release (2★+)
  // ---- tackle (2★+)
  startTackle(o, tg) { const dx = tg.x - o.x, dz = tg.z - o.z, d = Math.hypot(dx, dz) || 1; o.tackle = { t: 0, dx: dx / d, dz: dz / d }; o.yaw = Math.atan2(dx, dz); o.ch.anim.set('tackle'); o.grab = 0; this.stats.tackles++; this.note('tackle attempt'); }
  updateTackle(o, u, dt) {
    const T = o.tackle, P = this.g.player, col = this.g.collision; T.t += dt;
    const sp = T.t < 0.18 ? 6.2 : T.t < 0.5 ? 7.6 : Math.max(0, 7.6 * (1 - (T.t - 0.5) / 0.3)); const nx = o.x + T.dx * sp * dt, nz = o.z + T.dz * sp * dt;
    if (!col.blocked(nx, nz, 0.25) && !this.carAt(nx, nz)) { o.x = nx; o.z = nz; o.y = col.groundAt(nx, nz, o.y + 0.45); }
    if (T.t > 0.14 && T.t < 0.52 && !P.vehicle && !this.busy) { const cx = o.x + T.dx * 0.75, cz = o.z + T.dz * 0.75; if (Math.hypot(P.x - cx, P.z - cz) < 0.8 && Math.abs((P.y || 0) - (o.y || 0)) < 0.8) { this.stats.tackleHits++; this.note('tackle: suspect brought down'); P.yaw = Math.atan2(T.dx, T.dz); P.ch.root.rotation.y = P.yaw; this.arrest(o, 'tackle'); this.animOfficer(o, dt, 0); return; } }
    if (T.t > 0.95) { o.tackle = null; o.mode = 'down'; o.downT = 1.4; o.tackleCd = 6; this.note('tackle missed'); }
    this.animOfficer(o, dt, 0);
  }
  // shot down by police (Health.damage at 0 HP with cause 'shot by police'): the nearest officer on foot makes the arrest
  killedByPolice() { const P = this.g.player; let best = null, bd = 1e9; for (const o of this.foot) { if (o.mode !== 'foot') continue; const d = Math.hypot(o.x - P.x, o.z - P.z); if (d < bd) { bd = d; best = o; } } this.arrest(best, 'shot'); }

  // ------------------------------------------------------------------ arrest → BUSTED sequence → penalties → release (2★+)
  // kind: 'grab' (caught standing) | 'tackle' | 'shot' (brought down by police fire: treated under guard at the National
  // Hospital, then released there). Penalties: fine by level (never more than the cash in hand), ammunition confiscated at
  // 3★+, held for questioning (plus the hospital hours when shot).
  async arrest(o, kind = 'grab') {
    if (this.busy) return; const g = this.g, P = g.player, lv = Math.max(this.stars(), kind === 'shot' ? 4 : 2); this.busy = true; this.stats.arrests++; this.stats.busted[kind] = (this.stats.busted[kind] || 0) + 1; this.note(`arrest at ${lv}★ (${kind})`);
    const H = g.health; const healthWasBusy = H ? H.busy : false; if (H) H.busy = true;
    g.weapons?.forceHolster?.(); if (o && o.tackle && kind !== 'tackle') o.tackle = null;
    P.abortVehicleTransition?.(); // arrested mid-entry
    if (P.vehicle) { const v = P.vehicle; v.speed = 0; v.mesh.remove(P.ch.root); g.scene.add(P.ch.root); v.player = false; P.vehicle = null; P.exiting = null; P.entry = null; P.ch.anim.standUp(); g.traffic.release(v); const yo = o ? o.yaw : P.yaw; P.teleport(o ? o.x + Math.sin(yo) * 0.9 : P.x + 1.5, o ? o.z + Math.cos(yo) * 0.9 : P.z, yo + Math.PI); }
    P.control = false; P.speed = 0; if (P.ch.anim.ik) P.ch.anim.ik = null; P.ch.anim.aim = null;
    // penalties are decided now (shown on the custody record) and applied behind the final fade
    const why = this.reason || 'public disorder'; const fine = ARREST_FINE[lv]; const paid = this.chargeable(fine); const money = g.story.state.money;
    let conf = 0; if (lv >= 3 && g.weapons) for (const w of g.weapons.inv) conf += w.mag + w.reserve;
    const shot = kind === 'shot'; const hours = HOLD_HOURS[lv] + (shot ? HOSPITAL.hours : 0); const meds = shot ? Math.max(0, Math.min(HOSPITAL.medicines, money - paid)) : 0;
    const st = shot ? { x: L.PLACES.hospital.x, z: L.PLACES.hospital.z, name: HOSPITAL.name } : this.nearestStation();
    const name = g.squad?.activeMember?.def?.full || 'Suspect'; const caseNo = `CMB/${String(10000 + Math.floor(Math.random() * 89999))}/${String(26 + Math.floor(((g.atmos?.day || 1) - 1) / 365)).padStart(2, '0')}`;
    const rs = (n) => 'Rs. ' + n.toLocaleString('en-LK');
    const rows = [['Suspect', name], ['Charge', why.charAt(0).toUpperCase() + why.slice(1)], ['Wanted', '★'.repeat(lv) + ` (${lv})`]];
    if (shot) rows.push(['Injuries', 'Gunshot wounds — treated under police guard']);
    rows.push([shot ? 'Custody' : 'Taken to', shot ? `${HOSPITAL.name}, police ward` : st.name], ['Fine', `${rs(fine)}${paid < fine ? ` — ${rs(paid)} paid, balance waived` : ' — paid'}`], ['Ammunition', conf ? `${conf} rounds confiscated` : lv >= 3 ? 'none carried' : 'not seized (below 3★)'], ['Held', `${hours} h${shot ? ` (incl. ${HOSPITAL.hours} h in hospital)` : ' for questioning'}`]);
    if (shot) rows.push(['Medicines', meds ? `${rs(meds)} at the pharmacy` : 'given on credit, waived']);
    const info = { lv, why, fine, paid, hours, conf, station: st.name, name, caseNo, rows, kind };
    this.cine = new BustedCinematic(g, this, { kind, officer: o, info }); this.cine.start();
    await this.cine.promise; if (g.hud.fade) await g.hud.fade(1, 0.01);
    // ---- penalties
    if (paid > 0) g.story.pay(-paid, `Police fine — ${why}`);
    if (lv >= 3 && g.weapons) for (const w of g.weapons.inv) { w.mag = 0; w.reserve = 0; } // all nine weapons are firearms
    if (shot) { const S = g.story; if (S.side) { S.side = null; S.hud?.setTimer?.(null); S.hud?.setObjective?.('', ''); S.removeNPC?.('fare'); } if (S.running) { const err = S.fail('You were shot and arrested by the police.'); for (const c of S.conds || []) c.rej(err); S.conds = []; } if (meds > 0) S.pay(-meds, 'Pharmacy — medicines prescribed at the National Hospital (treatment there is free)'); }
    g.atmos.advance(hours * 60);
    if (g.interiors?.current) { const room = g.interiors.current; room.g.visible = false; g.interiors.current = null; g.setIndoor?.(false); } P.indoor = null;
    const [sx, sz] = g.story.safeSpot(st.x, st.z); P.teleport(sx, sz, shot ? Math.PI : 0); P.ch.anim.set(null); P.speed = 0; if (shot && H) { H.hp = 100; H.lastHurt = -99; P.stamina = 1; }
    g.world?.warm?.(sx, sz);
    this.cine.dispose(); this.cine = null;
    for (const u of this.units.slice()) this.removeUnit(u); this.queue = []; this.baseState = {}; this.level = 0; this.stop = null; this.search = null; this.incident = null; this.lastSeen = null; this.setState('patrol'); this.patrolCd = 60;
    this.lastPenalty = { kind: 'arrest', how: kind, level: lv, fine, paid, hours, confiscated: conf, station: st.name, why, meds };
    P.snapCamera?.(); await this.wait(0.6); await g.hud.fade(0, 0.8); P.control = true; this.busy = false; if (H) H.busy = false; void healthWasBusy;
    g.hud.notify(shot ? `Released — ${HOSPITAL.name}` : `Released — ${st.name}`, `${shot ? 'Shot and arrested by the police; treated under guard and charged' : 'Charged'} with ${why} (${'★'.repeat(lv)}). Fine Rs. ${fine.toLocaleString('en-LK')}${paid < fine ? ` (you had Rs. ${paid.toLocaleString('en-LK')} — the balance was waived)` : ' paid'}. Held ${hours} h${conf ? `; ${conf} rounds of ammunition confiscated` : ''}${shot ? `. Treatment is free; medicines ${meds ? `Rs. ${meds.toLocaleString('en-LK')}` : 'waived'}` : ''}.`, 'info', 10);
  }
  nearestStation() { const P = this.g.player; const list = [{ ...L.PLACES.police, name: 'Kollupitiya Police Station' }, { x: L.PLACES.policeHQ2.x, z: L.PLACES.policeHQ2.z - 6, name: 'Police Headquarters, Kompannaveediya' }]; return list.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0]; }
  wait(sec) { const t0 = this.g.clock; return new Promise((res) => { const chk = () => { if (this.g.clock - t0 >= sec) res(); else this.waits.push(chk); }; this.waits.push(chk); }); }
  tickWaits() { const w = this.waits || []; this.waits = []; for (const f of w) f(); }

  // ------------------------------------------------------------------ siren (synthesised wail; nearest responding unit, spatialised)
  updateSiren(dt, mute) {
    if (!Audio.ready || !Audio.ctx) return; const c = Audio.ctx;
    if (!this.siren) { const o1 = c.createOscillator(), o2 = c.createOscillator(); o1.type = 'square'; o2.type = 'sawtooth'; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.8; const gn = c.createGain(); gn.gain.value = 0; const pan = c.createStereoPanner ? c.createStereoPanner() : null; o1.connect(f); o2.connect(f); f.connect(gn); if (pan) { gn.connect(pan); pan.connect(Audio.bus.sfx); } else gn.connect(Audio.bus.sfx); o1.start(); o2.start(); this.siren = { o1, o2, gn, pan, ph: 0 }; }
    const S = this.siren; let best = null, bd = 1e9; if (!mute && this.stars() >= 2) for (const u of this.units) { if (!u.v || u.task === 'leave' || u.patrol) continue; const d = Math.hypot(u.v.x - this.g.camera.position.x, u.v.z - this.g.camera.position.z); if (d < bd) { bd = d; best = u.v; } }
    const now = c.currentTime; let gain = 0, pan = 0; if (best) { const [gg, pp] = Audio.spatial(best.x, best.z, 90); gain = 0.07 * gg * (this.g.indoor ? 0.3 : 1); pan = pp; }
    const yelp = best && bd < 45 && this.state === 'pursuing'; S.ph += dt; const k = 0.5 - 0.5 * Math.cos((S.ph / (yelp ? 0.36 : 3.4)) * Math.PI * 2); const fq = yelp ? 820 + 620 * k : 620 + 760 * k; // wail → yelp up close
    S.o1.frequency.setTargetAtTime(fq, now, 0.03); S.o2.frequency.setTargetAtTime(fq * 1.005, now, 0.03); S.gn.gain.setTargetAtTime(gain, now, 0.15); if (S.pan) S.pan.pan.setTargetAtTime(pan, now, 0.1);
  }

  // ------------------------------------------------------------------ HUD feed
  hudInfo() {
    const units = []; for (const u of this.units) { const p = u.v || u.officers[0]; if (p) units.push({ x: p.x, z: p.z, lights: !!(u.v && u.v.beaconsOn), patrol: u.patrol }); }
    const lv = this.stars(); let label = lv > 0 || this.state === 'return' ? STATE_LABEL[this.state] || '' : '';
    if (this.state === 'searching' && this.search) { const s = Math.max(0, Math.ceil(this.search.t)); label += ` ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
    if (this.stop) label = 'POLICE STOP';
    return { level: lv, label, units, search: this.search && { x: this.search.x, z: this.search.z, r: this.search.r } };
  }
}
