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
// Non-graphic: officers never shoot; hit officers stagger and at worst go down and recover.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { linePiece, segNodes, otherEnd } from '../vehicles/Traffic.js';
import { Character } from '../actors/Character.js';
import { makePoliceAppearance } from '../actors/Appearance.js';
import { seatCharacter } from '../actors/Seating.js';
import { Audio } from '../audio/Audio.js';
import { clamp, lerp } from '../core/math.js';
import { chaseAim, rejoinLane, applyPit, roadblockSite, makeSpikeStrip, overStrip, radioLine, compass, catchUpSpeed, straggler } from './Pursuit.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const UNITS_FOR = [0, 1, 3, 5, 6, 8];
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
    this.reason = 'disturbance'; this.stop = null; this.t = 0; this.siren = null; this.waits = []; this.radioCd = 4; this.radioN = 0; this.blockCd = 12;
    Object.assign(this.stats, { intercepts: 0, pits: 0, roadblocks: 0, spikes: 0, flats: 0, recycled: 0 });
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
  gunfire(x, z) { this.reason = 'discharging a firearm in public'; this.addHeat(0.05, this.reason, null, true); this.crime(x, z, 'gunfire'); }
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
  spotted() { const tg = this.target(); this.lastSeen = { x: tg.x, z: tg.z, t: this.t }; this.seenT = 0; if (this.state !== 'pursuing') { this.stats.sightings++; this.setState('pursuing'); for (const u of this.units) if (u.v && u.task !== 'leave' && !u.v.player) { u.v.ai.v0 = CHASE_V0[this.stars()]; u.planT = 0; } this.g.hud.notify('Spotted by police', this.stars() >= 2 ? 'Units are closing in. Break line of sight to lose them.' : 'An officer wants to speak to you. Stand still to comply, or run.', 'warn', 3.2); } }

  // ------------------------------------------------------------------ main update
  update(dt) {
    const g = this.g; this.t += dt; this.stateT += dt; this.prompt = ''; this.tickWaits();
    if (g.director.active || this.busy) { this.updateSiren(dt, true); return; }
    this.foot = []; for (const u of this.units.concat(this.civil)) for (const o of u.officers) if (o.mode === 'foot' || o.mode === 'down' || o.mode === 'return') this.foot.push(o);
    this.updateGlobal(dt);
    for (const u of this.units.slice()) this.updateUnit(u, dt);
    for (const u of this.civil.slice()) this.updateCivil(u, dt);
    this.updateRoadblocks(dt); this.updateRadio(dt);
    this.updateStop(dt); this.g.player.policeStop = !!this.stop; this.pushPlayer(); this.updateSiren(dt, false);
    this.stats.maxUnits = Math.max(this.stats.maxUnits, this.units.filter((u) => !u.patrol).length);
  }
  updateGlobal(dt) {
    const want = UNITS_FOR[this.stars()] || 0; const active = this.units.filter((u) => u.task !== 'leave' && !u.patrol);
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
          else { this.g.hud.notify('Search scaled down', `${'★'.repeat(this.stars())} — fewer units are still checking the area.`, 'info', 3); this.beginSearch(this.search.x, this.search.z); for (const u of active.slice(UNITS_FOR[this.stars()])) this.leave(u); }
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
    this.g.hud.notify(lv >= 2 ? 'Police responding' : 'Police investigating', lv >= 2 ? 'Units with sirens are on the way to where you were reported.' : 'A patrol car is coming to check the reported location.', 'warn', 3.2);
  }
  topUp(want, pt) { this.spawnCd -= this.g.dt || 0.05; if (this.spawnCd > 0 || !pt) return; const active = this.units.filter((u) => u.task !== 'leave' && !u.patrol); if (active.length >= want) return; const lv = this.stars(); const ahead = lv >= 3 && this.state === 'pursuing' && active.length % 2 === 1; const u = this.spawnUnit({ jeep: lv >= 3 && active.length % 3 === 1, ahead }) || (ahead ? this.spawnUnit({}) : null); if (u) { this.spawnCd = lv >= 4 ? 0.7 : lv >= 3 ? 1 : 1.5; this.assign(u, 'drive', pt); } else this.spawnCd = 0.5; }
  beginSearch(x, z, fromSight = false) {
    const lv = Math.max(1, this.stars()); const r0 = 50 + lv * 18; const P = this.g.player;
    // the search centre is the last known position pushed along the suspect's heading — not the live position
    let cx = x, cz = z; if (fromSight) { const h = P.vehicle ? P.vehicle.yaw : P.yaw; cx += Math.sin(h) * 15; cz += Math.cos(h) * 15; }
    this.search = { x: cx, z: cz, r: r0, r0, t: SEARCH_TIME(lv), t0: SEARCH_TIME(lv) }; this.stats.searches++; this.setState('searching');
    for (const u of this.units) if (u.task !== 'leave' && !u.patrol) { u.searchFoot = !u.searchedOnce; this.searchNext(u); }
  }
  standDown(msg) {
    this.level = 0; this.stats.standDowns++; this.search = null; this.incident = null; this.stop = null; this.setState('return'); for (const u of this.units) if (!u.patrol) this.leave(u);
    if (msg) this.g.hud.notify('Police standing down', msg, 'success', 3.5);
  }
  restore(level) { this.level = clamp(level || 0, 0, 5); if (this.level > 0) { const P = this.g.player; this.incident = { x: P.x, z: P.z, t: 0 }; this.beginSearch(P.x + (Math.random() * 2 - 1) * 25, P.z + (Math.random() * 2 - 1) * 25); } }
  save() { return { level: this.level }; }

  // ------------------------------------------------------------------ sight
  unitSees(u, mult = 1) {
    const g = this.g; if (g.indoor) return false; const tg = this.target(); const P = g.player; const A = g.atmos;
    const env = (1 - 0.35 * (A ? A.night : 0)) * (1 - 0.15 * (A && A.w ? A.w.rain : 0)) * (P.crouching && !P.vehicle ? 0.7 : 1) * (tg.v ? 1.25 : 1) * mult;
    const eyes = [];
    if (u.v && u.officers.some((o) => o.mode === 'seated')) eyes.push({ x: u.v.x, y: u.v.y + 1.3, z: u.v.z, R: (46 + this.stars() * 7) * env, fov: -1 });
    for (const o of u.officers) if (o.mode === 'foot') eyes.push({ x: o.x, y: o.y + 1.6, z: o.z, R: (34 + this.stars() * 4) * env, fov: -0.35, yaw: o.yaw });
    for (const e of eyes) {
      const dx = tg.x - e.x, dz = tg.z - e.z, d = Math.hypot(dx, dz); if (d > e.R) continue;
      if (e.fov > -1 && d > 10) { const c = (Math.sin(e.yaw) * dx + Math.cos(e.yaw) * dz) / d; if (c < e.fov) continue; }
      if (g.collision.raycast(e.x, e.y, e.z, tg.x, (tg.y || 0) + 1.3, tg.z, 0.05) >= 0.98) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ units
  spawnUnit({ patrol = false, jeep = false, ahead = false, at = null } = {}) {
    const g = this.g, T = this.T, P = g.player; const f = this.target(); const cam = g.camera; const cd = new THREE.Vector3(); cam.getWorldDirection(cd);
    if (at) { const ln = T.laneNear(at.x, at.z, at.yaw, 40); return ln ? this.makeUnit(at.x, at.z, at.yaw, ln.piece, ln.s, false, jeep) : null; } // placed (roadblock)
    for (let tries = 0; tries < 40; tries++) {
      const seg = T.drivableSegs[Math.floor(Math.random() * T.drivableSegs.length)]; if (seg.level >= 3) continue;
      const mx = (seg.x0 + seg.x1) / 2, mz = (seg.z0 + seg.z1) / 2; const d = Math.hypot(mx - f.x, mz - f.z);
      const hy = f.v ? f.v.yaw : P.yaw; const lo = ahead ? 170 : 150, hi = ahead ? 310 : 280; if (d < lo || d > hi) continue; if (ahead && ((mx - f.x) * Math.sin(hy) + (mz - f.z) * Math.cos(hy)) < d * 0.55) continue; // intercepting units come from ahead
      if (d < 240 && ((mx - cam.position.x) * cd.x + (mz - cam.position.z) * cd.z) / Math.hypot(mx - cam.position.x, mz - cam.position.z) > 0.25 && !(ahead && g.collision.raycast && g.collision.raycast(cam.position.x, cam.position.y, cam.position.z, mx, 1.6, mz, 0.1) < 0.97)) continue; // out of view (or hidden behind buildings)
      const [a, b] = segNodes(seg); const toward = Math.hypot(a.x - f.x, a.z - f.z) < Math.hypot(b.x - f.x, b.z - f.z); const from = toward ? b : a, to = toward ? a : b;
      const lane = seg.level <= 1 ? 1 : 0; const piece = linePiece(seg, from, to, lane); const s = piece.len * (0.2 + Math.random() * 0.4);
      const x = lerp(piece.p0[0], piece.p1[0], s / piece.len), z = lerp(piece.p0[1], piece.p1[1], s / piece.len); if (Math.hypot(x - P.x, z - P.z) < 140) continue;
      if (T.vehicles.some((v) => (v.x - x) ** 2 + (v.z - z) ** 2 < 15 * 15)) continue;
      return this.makeUnit(x, z, Math.atan2(piece.d[0], piece.d[1]), piece, s, patrol, jeep);
    }
    return null;
  }
  makeUnit(x, z, yaw, piece, s, patrol, jeep) {
    const g = this.g, T = this.T, P = g.player; {
      const type = jeep ? 'policejeep' : 'police'; const v = new Vehicle(type, 3000 + this.seed * 7, g.scene); v.place(x, z, yaw);
      v.keep = true; v.ai = { pieces: [piece], s, v0: patrol ? 9 : 11, stuck: 0, honkCd: 99, bumped: 0, aggressive: 1.2, emergency: true }; T.extend(v);
      const u = { id: this.seed++, v, officers: [], task: patrol ? 'patrol' : 'idle', patrol, arrived: false, footT: 0, stuckT: 0, planT: 0, goalPt: null, enterT: 0 };
      v.police = u; const seats = v.mesh.userData.seats; const di = seats.findIndex((q) => q.driver); const pi = seats.map((q, i) => i).filter((i) => i !== di).sort((i, j) => Math.abs(seats[i].z - seats[di].z) - Math.abs(seats[j].z - seats[di].z))[0];
      for (const [k, si] of [[0, di], [1, pi]]) { if (si === undefined || si < 0) continue; const ch = new Character(makePoliceAppearance(7000 + u.id * 13 + k * 5, 'patrol', k === 1 && u.id % 3 === 0 ? { sex: 'f' } : {})); seatCharacter(ch, v, seats[si]); ch.mesh.castShadow = false; u.officers.push({ ch, unit: u, seat: seats[si], si, mode: 'seated', x, z, y: v.y, yaw: v.yaw, t: 0, hits: 0, acc: 0 }); }
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
    this.units = this.units.filter((q) => q !== u); this.note(`unit ${u.id} removed`);
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
        if (straggler(v, tg, dToT, this.inView(v))) { this.stats.recycled++; this.note(`unit ${u.id} fell behind, recycled`); this.leave(u); return; } /* topUp sends a fresh car from ahead */
      }
      if (st === 'pursuing' && u.planT <= 0) { // chase: aim ~2.5 s ahead of a moving suspect (soft goal, no braking); hard stop only once they have stopped
        u.planT = 1.6; const live = this.seenT < 1.5; const ls = live ? tg : this.lastSeen; const sp = live && tg.v ? Math.abs(tg.v.speed) : live ? (this.g.player.speed || 0) : 0;
        if (ls) { const h = tg.v ? tg.v.yaw : this.g.player.yaw; const lead = live ? Math.min(45, sp * 2.5) : 0; const ax = ls.x + Math.sin(h) * lead, az = ls.z + Math.cos(h) * lead; const soft = sp > 2;
          if (!u.goalPt || Math.hypot(u.goalPt.x - ax, u.goalPt.z - az) > 10 || soft !== !!u.softGoal) { u.goalPt = { x: ax, z: az }; u.softGoal = soft; this.plan(u, ax, az, soft); } } }
      const P = g.player; const close = dToT < (tg.v ? 16 : 28) && this.seenT < 1.5;
      const footChase = st === 'pursuing' && close && (!tg.v || Math.abs(tg.v.speed) < 1.5);
      const gd = ai.goal && ai.goal.piece && ai.goal.dist !== undefined ? ai.goal.dist : Infinity; const reached = gd < 5 && v.speed < 0.6;
      if (v.speed < 0.3 && !reached) u.stuckT += dt; else u.stuckT = 0;
      if (footChase) { this.brakeHere(u); if (v.speed < 1) { this.dismount(u, 'chase'); this.say(u.officers[0], this.stars() >= 2 ? 'chase' : 'stop', 'Officer'); } }
      else if (reached || (u.stuckT > 6 && u.goalPt && Math.hypot(v.x - u.goalPt.x, v.z - u.goalPt.z) < 40)) { u.arrived = true; this.onArrive(u); }
      else if (u.stuckT > 6) { u.stuckT = 0; if (u.goalPt) this.plan(u, u.goalPt.x, u.goalPt.z); }
      if (!ai.route && !ai.goal && u.goalPt && u.planT <= -1) { u.planT = 0; this.plan(u, u.goalPt.x, u.goalPt.z); }
    } else if (u.task === 'foot') {
      u.footT += dt; const st = this.state;
      const done = st === 'searching' ? u.footT > 12 : st === 'pursuing' ? false : st === 'investigating' || st === 'responding' ? u.footT > 20 : true;
      const far = u.officers.every((o) => o.mode !== 'foot' || Math.hypot(o.x - tg.x, o.z - tg.z) > 50);
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
      if (!can || this.seenT > 1 || d > 75 || Math.abs(P.speed) < 2.5) return false;
      const busy = this.units.filter((q) => q.v && q.v.ai && q.v.ai.chase).map((q) => q.v.ai.chase.role);
      const role = lv < 3 ? 'tail' : ['pit', 'block', 'tail'].find((r) => !busy.includes(r)) || (u.id % 2 ? 'pit' : 'tail');
      ai.chase = { role, ax: v.x, az: v.z, speed: v.speed, blockT: 0, boost: [1, 1, 1.02, 1.06, 1.1, 1.14][lv], t: 0, pitCd: 1.5, stop: false, contact: false };
      ai.route = null; ai.goal = null; this.stats.intercepts++; this.note(`unit ${u.id} intercepting (${role})`);
      if (lv >= 3) this.radio(role === 'pit' ? 'pit' : role === 'block' ? 'block' : 'ram', u);
    }
    const ch = ai.chase; ch.t += dt; ch.pitCd -= dt;
    if (!can || this.seenT > 2.5 || d > 120 || ch.blockT > 2.5) { // lost them / wedged: back to the road network and the routed chase
      if (rejoinLane(this.T, v)) { u.planT = 0; u.goalPt = null; u.stuckT = 0; this.note(`unit ${u.id} back on the road`); return false; }
      const nr = nearestRoad(this.T.drivableSegs, v.x, v.z); if (nr) { ch.ax = nr.px; ch.az = nr.pz; ch.speed = 6; ch.stop = false; ch.blockT = 0; } return true;
    }
    if (this.seenT > 0.6 && this.lastSeen) { ch.ax = this.lastSeen.x; ch.az = this.lastSeen.z; ch.speed = Math.max(10, Math.abs(P.speed)); ch.stop = false; return true; } // momentarily out of sight: drive to where they were
    const aim = chaseAim(ch.role, P, v, lv, ch.t); ch.ax = aim.x; ch.az = aim.z; ch.speed = aim.speed; ch.contact = aim.contact;
    ch.stop = Math.abs(P.speed) < 1.5 && d < 18; // suspect stopped: pull up beside them, crew out
    if (ch.stop && v.speed < 1) { this.dismount(u, 'chase'); this.say(u.officers[0], 'chase', 'Officer'); return true; }
    if (ch.role === 'pit' && aim.contact && aim.along < 0 && ch.pitCd <= 0 && Math.abs(P.speed) > 6 && this.touching(v, P)) {
      applyPit(P, v, aim.lat >= 0 ? 1 : -1); ch.pitCd = 7; this.stats.pits++; this.note(`unit ${u.id} PIT`); this.radio('spun', u, true);
    }
    return true;
  }
  touching(a, b) { for (const p of a.circles()) for (const q of b.circles()) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < a.radius + b.radius + 0.35) return true; return false; }

  // ------------------------------------------------------------------ roadblocks (4★+) and spike strips (5★)
  updateRoadblocks(dt) {
    this.blockCd -= dt; const tg = this.target(); const lv = this.stars();
    for (const u of this.units) if (u.strip && tg.v && !tg.v.flat && overStrip(u.strip, tg.v)) { tg.v.flat = true; tg.v.impact(7); this.stats.flats++; this.note('suspect tyres punctured'); this.g.hud.notify('Tyres punctured', 'You drove over a police spike strip — the car is slow and hard to control now. Switch vehicles to get away.', 'warn', 4); this.radio('flat', u, true); }
    if (this.state !== 'pursuing' || lv < 4 || !tg.v || Math.abs(tg.v.speed) < 8 || this.seenT > 2 || this.blockCd > 0 || this.g.indoor) return;
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
    if (!force && this.radioCd > 0) return; const tg = this.target(); const P = this.g.player; const h = tg.v ? (tg.v.speed >= 0 ? tg.v.yaw : tg.v.yaw + Math.PI) : P.yaw;
    const l = radioLine(kind, { road: L.roadNameAt(tg.x, tg.z), dir: compass(h), vtype: tg.v ? tg.v.type : 'foot', unit: u ? u.id : 1, alt: this.radioN % 3 === 2, ...extra }); if (!l.en && !l.si) return;
    this.radioN++; this.radioCd = 7 + Math.random() * 4; const lang = l.si ? 'si' : 'en'; this.g.hud.subtitle(kind === 'heading' || kind === 'roadblock' || kind === 'spikes' || kind === 'lost' ? 'Police radio · Control' : `Police radio · Unit ${u ? u.id : 1}`, l.si || l.en, l.tr || '', 3, lang); Audio.radioBlip?.();
  }
  updateRadio(dt) { this.radioCd -= dt; if (this.state === 'pursuing' && this.stars() >= 2 && this.seenT < 1.5 && this.radioCd <= 0) this.radio('heading'); }

  // ------------------------------------------------------------------ officers
  exitWorld(o, v) { v.mesh.updateMatrixWorld(); const e = o.seat.exit || [Math.sign(o.seat.x || 1) * (v.T.wid / 2 + 0.6), o.seat.z]; const w = new THREE.Vector3(e[0], 0, e[1]).applyMatrix4(v.mesh.matrixWorld); return [w.x, w.z, e]; }
  updateOfficer(o, u, dt) {
    const g = this.g, A = o.ch.anim, v = u.v; let speed = 0;
    if (o.mode === 'seated') { if (v) { o.x = v.x; o.z = v.z; o.y = v.y; o.yaw = v.yaw; } return; } // animated by Traffic.updateOccupants
    if (o.mode === 'exit') { // slide out of the seat to the door spot while standing up (reverse of entering)
      o.t += dt; if (o.t < 0) { A.update(dt, 0); return; }
      const k = Math.min(1, o.t / 0.9), sm = k * k * (3 - 2 * k); const [, , ex] = this.exitWorld(o, v);
      o.ch.root.position.set(lerp(o.seat.x, ex[0], sm), lerp(o.seat.y, 0, Math.min(1, sm * 1.3)), lerp(o.seat.z, ex[1], sm)); o.ch.root.rotation.set(0, lerp(0, Math.atan2(ex[0] - o.seat.x, ex[1] - o.seat.z), Math.min(1, sm * 1.5)), 0);
      A.sitIn(o.seat, 1 - sm, null); A.update(dt, k > 0.5 ? 1.0 : 0);
      if (k >= 1) { A.standUp(); const [wx, wz] = this.exitWorld(o, v); v.mesh.remove(o.ch.root); g.scene.add(o.ch.root); o.x = wx; o.z = wz; o.y = g.collision.groundAt(wx, wz, v.y + 0.6); o.yaw = v.yaw + o.ch.root.rotation.y; o.mode = 'foot'; o.goal = null; this.placeOfficer(o); }
      return;
    }
    if (o.mode === 'enter') { // slide from the door spot into the seat
      o.t += dt; const k = Math.min(1, o.t / 0.9), sm = k * k * (3 - 2 * k); const ex = o.ex;
      o.ch.root.position.set(lerp(ex[0], o.seat.x, sm), lerp(0, o.seat.y, Math.min(1, sm * 1.3)), lerp(ex[1], o.seat.z, sm)); o.ch.root.rotation.set(0, lerp(Math.atan2(o.seat.x - ex[0], o.seat.z - ex[1]), 0, sm), 0);
      A.sitIn(o.seat, sm, null); A.update(dt, 0); if (k >= 1) { seatCharacter(o.ch, v, o.seat); o.mode = 'seated'; this.syncSeated(u); }
      return;
    }
    if (o.mode === 'down') { o.downT -= dt; if (o.downT <= 0) { o.mode = 'foot'; A.set(null); o.hits = 0; } this.animOfficer(o, dt, 0); return; }
    // on foot
    const tg = this.target(); const P = g.player; const st = this.state; const dP = this.distTo(o, tg);
    if (o.mode === 'return' || u.task === 'leave' || u.task === 'mount') {
      if (!v) { o.goal = null; speed = this.walkAway(o, dt); }
      else { let [wx, wz, ex] = this.exitWorld(o, v); const dw = this.detour(o, v, ex); const tx = dw ? dw[0] : wx, tz = dw ? dw[1] : wz; speed = this.moveTo(o, tx, tz, 2.4, dt); o.retT = (o.retT || 0) + dt; const dd = Math.hypot(wx - o.x, wz - o.z);
        if (dd < 2.2 && (o.blockedT > 0.5 || o.retT > 12) && dd >= 0.35) { v.mesh.updateMatrixWorld(); const lp = v.mesh.worldToLocal(new THREE.Vector3(o.x, v.y, o.z)); o.ch.root.parent?.remove(o.ch.root); v.mesh.add(o.ch.root); o.ex = [lp.x, lp.z]; o.t = 0; o.mode = 'enter'; o.retT = 0; A.set(null); return; }
        if (o.retT > 20 && !this.inView(o)) { seatCharacter(o.ch, v, o.seat); o.mode = 'seated'; o.retT = 0; this.syncSeated(u); return; }
        if (dd < 0.35) { o.retT = 0; o.ch.root.parent?.remove(o.ch.root); v.mesh.add(o.ch.root); o.ex = ex; o.t = 0; o.mode = 'enter'; A.set(null); return; } }
      this.animOfficer(o, dt, speed); return;
    }
    if (u.civil && o.mode === 'foot') { this.civilOfficer(o, u, dt); return; }
    if (u.task === 'block' && dP > 22) { o.yaw += angDiff(Math.atan2(tg.x - o.x, tg.z - o.z), o.yaw) * Math.min(1, dt * 4); const want = dP < 70 ? 'point' : null; if (A.action !== want) A.set(want); this.animOfficer(o, dt, 0); return; } // roadblock: hold the line
    const chasing = st === 'pursuing' && (this.seenT < 3 || dP < 25);
    if (chasing) {
      const stopMode = this.stars() <= 1; const want = stopMode ? 1.5 : 0.7; const run = !stopMode || (this.stop && this.stop.fled);
      if (dP > want) speed = this.moveTo(o, tg.x, tg.z, run ? [5.7, 5.7, 6.1, 6.5, 6.8, 7.0][this.stars()] : dP > 8 ? 3.2 : 1.6, dt); else { o.yaw += angDiff(Math.atan2(tg.x - o.x, tg.z - o.z), o.yaw) * Math.min(1, dt * 6); }
      if (stopMode && dP < 5 && !this.stop) this.beginStop(o);
      if (!stopMode && dP < (tg.v ? 0.7 : 1.4) && (!tg.v || Math.abs(tg.v.speed) < 1)) { o.grab = (o.grab || 0) + dt; if (o.grab > (tg.v ? 1.6 : 0.9)) { this.arrest(o); return; } } else o.grab = Math.max(0, (o.grab || 0) - dt);
      if (A.action && A.action !== 'talk' && A.action !== 'point') A.set(null); if (stopMode && dP < 4 && A.action !== 'point' && A.action !== 'talk') A.set('point');
    } else { // look around the scene / search area
      if (!o.goal || o.goalT <= 0) { const c = st === 'searching' && this.search ? { x: o.x, z: o.z } : this.incident || { x: o.x, z: o.z }; for (let k = 0; k < 6; k++) { const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 9; const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; if (!g.collision.blocked(x, z, 0.3)) { o.goal = { x, z }; break; } } o.goalT = 6 + Math.random() * 4; o.pause = 0; }
      o.goalT -= dt; if (o.goal) { const d = Math.hypot(o.goal.x - o.x, o.goal.z - o.z); if (d > 0.4) speed = this.moveTo(o, o.goal.x, o.goal.z, 1.45, dt); else if (A.action !== 'look') A.set('look'); }
      if (speed > 0 && A.action === 'look') A.set(null);
    }
    this.animOfficer(o, dt, speed);
  }
  // ---- civil calls (no wanted level): a bystander reports a street fight; one patrol car comes with its lights on, the
  // officers break it up, handcuff the people involved, walk them to the back seats and drive away. These units are kept
  // apart from the wanted-level units (this.civil), so dispatch / pursuit logic never touches them.
  civilCall(inc) {
    if (this.level > 0 || this.state === 'pursuing' || this.g.director.active || this.busy || this.civil.length) return null;
    const u = this.spawnUnit(); if (!u) return null; this.units = this.units.filter((q) => q !== u); this.civil.push(u);
    u.civil = inc; u.task = 'civil'; u.cphase = 'drive'; u.prisoners = []; u.ct = 0; u.v.ai.v0 = 13;
    if (!this.plan(u, inc.x, inc.z)) { this.removeCivil(u); return null; }
    this.stats.civil = (this.stats.civil || 0) + 1; this.note(`unit ${u.id} civil call (${inc.kind})`); return u;
  }
  nearPlayer(x, z, r = 35) { const P = this.g.player; return Math.hypot(P.x - x, P.z - z) < r; }
  updateCivil(u, dt) {
    const g = this.g, v = u.v, inc = u.civil; u.ct += dt;
    if (!v || v.player || this.level > 0) { this.abortCivil(u); return; } // the player took the car / became wanted: normal police logic takes over
    v.beacons(u.cphase !== 'leave', this.t); v.lights = g.atmos ? g.atmos.night > 0.4 : false;
    for (const o of u.officers) this.updateOfficer(o, u, dt);
    for (const q of u.prisoners) this.updatePrisoner(q, u, dt);
    const F = inc.F;
    if (u.cphase === 'drive') {
      const ai = v.ai; if (F && !F.handed && !F.ended && F.a) { inc.x = (F.a.x + F.b.x) / 2; inc.z = (F.a.z + F.b.z) / 2; }
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
      const tgt = k === 0 ? F.a : F.b; const d = Math.hypot(tgt.x - o.x, tgt.z - o.z);
      if (d > 8.5) speed = this.moveTo(o, tgt.x, tgt.z, d > 15 ? 3.4 : 2.2, dt);
      else { F.stopped = true; if (this.nearPlayer(o.x, o.z)) this.say(o, 'breakup', 'Police officer'); this.takePrisoners(u, F); }
      if (A.action !== (speed ? null : 'point')) A.set(speed ? null : 'point'); this.animOfficer(o, dt, speed); return;
    }
    const q = u.prisoners.find((p) => p.officer === o);
    if (!q || q.mode === 'seated' || q.mode === 'enter') { // nobody (left) to take, or done: look round, then back to the car
      if (q) { o.mode = 'return'; o.goal = null; if (A.action === 'hold') A.set(null); o.ch.anim.holdR = null; this.animOfficer(o, dt, 0); return; }
      if (!o.goal || o.goalT <= 0) { const a = Math.random() * Math.PI * 2; o.goal = { x: inc.x + Math.cos(a) * 4, z: inc.z + Math.sin(a) * 4 }; o.goalT = 5; } o.goalT -= dt; speed = Math.hypot(o.goal.x - o.x, o.goal.z - o.z) > 0.4 ? this.moveTo(o, o.goal.x, o.goal.z, 1.4, dt) : 0; if (!speed && A.action !== 'look') A.set('look'); this.animOfficer(o, dt, speed); return; }
    if (q.mode === 'held') { // walk round behind them; they turn their back; handcuffs
      const bx = q.x - Math.sin(q.yaw) * 0.62, bz = q.z - Math.cos(q.yaw) * 0.62; const d = Math.hypot(bx - o.x, bz - o.z);
      if (d > 0.25 && !(d < 0.5 && o.blockedT > 0.4)) { speed = this.moveTo(o, bx, bz, d > 6 ? 2.6 : 1.3, dt); if (A.action) A.set(null); }
      else { o.yaw += angDiff(Math.atan2(q.x - o.x, q.z - o.z), o.yaw) * Math.min(1, dt * 6); q.mode = 'cuffing'; q.t = 0; A.set('interact'); if (u.officers[0] === o && this.nearPlayer(o.x, o.z)) this.say(o, 'cuff', 'Police officer'); }
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
    const ppl = [F.a, F.b]; if (F.life) F.life.handOver(F); else F.handed = true; const taken = new Set();
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
  moveTo(o, tx, tz, sp, dt) {
    const col = this.g.collision; const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz); if (d < 0.05) return 0; const want = Math.atan2(dx, dz); const step = Math.min(d, sp * dt);
    const stuckIn = col.blocked(o.x, o.z, 0.2) || this.carAt(o.x, o.z); // e.g. a door spot beside a parked car: walk out of it
    for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5, 2.2, -2.2]) { const a = want + off; const nx = o.x + Math.sin(a) * step, nz = o.z + Math.cos(a) * step; if (!stuckIn && (col.blocked(nx, nz, 0.28) || this.carAt(nx, nz))) continue;
      o.x = nx; o.z = nz; o.y = col.groundAt(nx, nz, o.y + 0.45); o.yaw += angDiff(a, o.yaw) * Math.min(1, dt * 8); o.blockedT = 0; this.placeOfficer(o); return sp; }
    o.blockedT = (o.blockedT || 0) + dt; return 0;
  }
  carAt(x, z) { for (const v of this.T.all()) { if (Math.abs(v.x - x) > 6 || Math.abs(v.z - z) > 6) continue; const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const rx = x - v.x, rz = z - v.z; if (Math.abs(rx * fx + rz * fz) < v.half + 0.15 && Math.abs(rx * fz - rz * fx) < (v.T.wid || 1.7) / 2 + 0.2) return true; } return false; }
  placeOfficer(o) { o.ch.root.position.set(o.x, o.y, o.z); o.ch.root.rotation.y = o.yaw; }
  animOfficer(o, dt, speed) { const tg = this.target(); const d = Math.hypot(tg.x - o.x, tg.z - o.z); o.acc += dt; const rate = d < 50 ? 0 : d < 120 ? 0.12 : 0.4; if (o.acc >= rate) { o.ch.anim.update(Math.min(o.acc, 0.25), speed); o.acc = 0; } this.placeOfficer(o); }
  officerHit(o, dx, dz) { // non-graphic: the officer staggers; repeated hits put them down for a while (they recover)
    if (o.mode !== 'foot' && o.mode !== 'down') return; o.hits = (o.hits || 0) + 1; this.reason = 'assaulting a police officer';
    this.incident = { x: this.g.player.x, z: this.g.player.z, t: this.t }; this.addHeat(1, this.reason, 'You attacked an officer.'); this.spotted();
    if (o.hits >= 2 && o.mode !== 'down') { o.mode = 'down'; o.downT = 25; o.ch.anim.set('down'); this.note('officer down (will recover)'); } else { o.x += dx * 0.35; o.z += dz * 0.35; o.ch.face?.set?.('fear', 2); }
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
  async arrest(o) {
    if (this.busy) return; const g = this.g, P = g.player, lv = this.stars(); this.busy = true; this.stats.arrests++; this.note(`arrest at ${lv}★`);
    g.weapons?.forceHolster?.(); o.ch.anim.set('interact'); g.hud.notify('Arrested', 'Officers have detained you.', 'warn', 3);
    if (P.vehicle) { const v = P.vehicle; v.speed = 0; v.mesh.remove(P.ch.root); g.scene.add(P.ch.root); v.player = false; P.vehicle = null; P.exiting = null; P.ch.anim.standUp(); g.traffic.release(v); P.teleport(o.x + Math.sin(o.yaw) * 0.9, o.z + Math.cos(o.yaw) * 0.9, o.yaw + Math.PI); }
    P.control = false; P.speed = 0; P.ch.anim.set('handsup');
    await this.wait(1.6); await g.hud.fade(1, 0.8);
    const why = this.reason || 'public disorder'; const fine = ARREST_FINE[lv]; const paid = this.chargeable(fine); if (paid > 0) g.story.pay(-paid, `Police fine — ${why}`);
    let conf = 0; if (lv >= 3 && g.weapons) for (const w of g.weapons.inv) { conf += w.mag + w.reserve; w.mag = 0; w.reserve = 0; } // all nine weapons are firearms
    const hours = HOLD_HOURS[lv]; g.atmos.advance(hours * 60);
    const st = this.nearestStation(); const [sx, sz] = g.story.safeSpot(st.x, st.z); P.teleport(sx, sz, 0); P.ch.anim.set(null); P.speed = 0;
    for (const u of this.units.slice()) this.removeUnit(u); this.level = 0; this.stop = null; this.search = null; this.incident = null; this.lastSeen = null; this.setState('patrol'); this.patrolCd = 60;
    this.lastPenalty = { kind: 'arrest', level: lv, fine, paid, hours, confiscated: conf, station: st.name, why };
    await this.wait(0.6); await g.hud.fade(0, 0.8); P.control = true; this.busy = false;
    g.hud.notify(`Released — ${st.name}`, `Charged with ${why} (${'★'.repeat(lv)}). Fine Rs. ${fine.toLocaleString('en-LK')}${paid < fine ? ` (you had Rs. ${paid.toLocaleString('en-LK')} — the balance was waived)` : ' paid'}. Held ${hours} h for questioning${conf ? `; ${conf} rounds of ammunition confiscated` : ''}.`, 'info', 9);
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
