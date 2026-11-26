// 92nd: a night street-race meet. Rival cars wait at the kerb by the start; the player pulls up in a car, picks a
// difficulty and joins. Grid, a 3-2-1 start, checkpoints, laps, positions, results, then the rivals are handed to the
// ordinary traffic (Traffic.adoptAI) and drive off like any car.
//
// The rivals are real Vehicles driven through Vehicle.drive — the player's own physics: same top speed, acceleration,
// braking, grip limit and steering. RaceDriver (the AI) only turns the route + what it sees into throttle / steer.
// No catch-up: a rival never gets more speed or grip than its car has, whoever is leading. Rivals are registered as
// traffic.guests while racing (civilians brake for them, the player and weapons can hit them, they never get culled).
// Cost: looks come from the vehicle model cache (the loading screen built one of every type), one car per frame via the
// shared BUILDS token in prepare(), the route is precomputed on the loading screen; per frame each rival runs a pursuit
// controller + a profile lookup and every ~0.15 s a short traffic scan.
import { Vehicle } from '../vehicles/Vehicle.js';
import { modelCached } from '../vehicles/VehicleModels.js';
import { BUILDS } from '../core/FrameBudget.js';
import { Audio } from '../audio/Audio.js';
import { buildRoute, nearestIdx, lateral, gridSlots, STEP } from './RaceRoutes.js';
import { RaceDriver, DIFFICULTY, PERSONALITY, trackProgress } from './RaceDriver.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const RIVAL_CARS = { easy: ['arco', 'tarvo', 'trevan', 'ezra', 'kivo', 'solace'], normal: ['praetor', 'arco', 'tarvo', 'trevan', 'ezra', 'kivo'], hard: ['raiden', 'praetor', 'praetor', 'arco', 'tarvo', 'trevan'], expert: ['vanta', 'raiden', 'raiden', 'praetor', 'praetor', 'arco'] };
export const RIVALS = [
  { id: 'shehan', name: 'Shehan "Ghost"', persona: 'consistent' }, { id: 'akila', name: 'Akila R.', persona: 'aggressive' }, { id: 'malsha', name: 'Malsha', persona: 'safe' },
  { id: 'yohan', name: 'Yohan "Turbo" Dias', persona: 'aggressive' }, { id: 'pasan', name: 'Pasan', persona: 'consistent' }, { id: 'nadee', name: 'Nadee K.', persona: 'safe' },
];
export const DIFF_ORDER = ['easy', 'normal', 'hard', 'expert'];
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
export { fmt as fmtTime };

export class StreetRace {
  constructor(mgr, ev) { this.m = mgr; this.g = mgr.g; this.ev = ev; this.R = null; this.cars = []; this.queue = []; this.ready = false; this.state = 'meet'; this.diff = ev.diff || 'normal'; this.stats = { built: 0, buildMs: 0, stepMaxMs: 0, aiMs: 0, scans: 0 }; this.log = []; }
  note(s) { this.log.push(`${this.g.atmos?.timeString || ''} ${s}`); if (this.log.length > 40) this.log.shift(); }
  // the meet: a row along the kerb before the start line; rivals wait there with the engine running
  prepare() {
    const t0 = performance.now(); this.R = buildRoute(this.ev.route); const R = this.R; this.site = this.ev.site;
    const n = DIFFICULTY[this.diff].rivals; const types = RIVAL_CARS[this.diff]; this.kerb = [];
    for (let k = 0; k < n; k++) { const i = R.at(R.startI - Math.round((26 + k * 7.5) / STEP)); const off = R.hw[i] - 1.3; this.kerb.push({ x: R.cx[i] + R.nx[i] * off, z: R.cz[i] + R.nz[i] * off, yaw: R.hd[i] }); }
    for (let k = 0; k < n; k++) { const type = types[k % types.length]; let seed = 0; for (let s = 1; s < 400 && !seed; s++) if (modelCached(type, s * 13 + 5)) seed = s * 13 + 5; this.queue.push({ type, seed: seed || 4242 + k, k, rival: RIVALS[k % RIVALS.length] }); }
    this.stats.buildMs += performance.now() - t0; this.note(`${R.name || this.ev.route}: ${n} rivals queued (${this.diff})`);
  }
  build(fresh = false) {
    while (this.queue.length) { if (!BUILDS.can(fresh)) return false; const q = this.queue.shift(); const t0 = performance.now(); BUILDS.spend();
      const v = new Vehicle(q.type, q.seed, this.g.scene); const p = this.kerb[q.k]; v.place(p.x, p.z, p.yaw); v.keep = true; v.lights = true; v.speed = 0; this.g.traffic.guests.push(v); try { this.g.traffic.addDriver(v); } catch (e) { console.warn('race driver', e); } // a driver from the traffic's pool
      this.cars.push({ v, rival: q.rival, d: null }); this.stats.built++; this.stats.buildMs += performance.now() - t0; if (!fresh) return !this.queue.length; }
    this.ready = true; return true;
  }
  eligible(P) { const v = P.vehicle; return !!(v && !v.T.pedal && v.T.entry !== 'bike' && (v.T.mass || 1400) < 3000 && !v.T.police && !v.T.ambulance && !v.wrecked); }
  atMeet(P) { const s = this.kerb && this.kerb[Math.floor(this.kerb.length / 2)]; return s && Math.hypot(P.x - s.x, P.z - s.z) < 32; }
  prompt(key) { const P = this.g.player; if (this.state !== 'meet' || !this.ready || !this.atMeet(P)) return null; const D = DIFFICULTY[this.diff];
    if (!P.vehicle) return `Street race · ${this.R.name} — come back in a car`; if (!this.eligible(P)) return `Street race · ${this.R.name} — cars only`;
    if (this.g.police && this.g.police.level > 0) return 'Street race — not with the police on you';
    return `${key('interact')} Join: ${this.R.name} · ${this.R.laps} lap${this.R.laps > 1 ? 's' : ''} · ${D.label} (${key('more')} change)`; }
  cycleDiff() { const i = DIFF_ORDER.indexOf(this.diff); this.wantDiff = DIFF_ORDER[(i + 1) % 4]; this.diff = this.wantDiff; Audio.ui('click'); }
  // ---- join: fade, everyone on the grid (the player at the back half), countdown
  // `spectate` (benchmark R): the same field, grid, countdown and race without the player — nothing is saved, nobody finishes
  async join(o = {}) {
    if (this.state !== 'meet') return false; const g = this.g, P = g.player, R = this.R; this.state = 'grid'; const spect = !!o.spectate; this.spectate = spect;
    // the field follows the difficulty picked at the meet (rival count / cars): rebuild only if it changed
    const n = DIFFICULTY[this.diff].rivals; if (this.cars.length !== n || this.builtDiff !== this.diff) { this.disposeCars(); this.queue = []; this.prepare(); this.build(true); }
    this.builtDiff = this.diff;
    if (g.hud.fade && !this.m.instant && !spect) await g.hud.fade(1, 0.45);
    const slots = gridSlots(R, n + 1); const me = spect ? -1 : Math.min(n, Math.floor((n + 1) * 0.6)); // the player starts a little behind the middle
    let k = 0; for (let s = 0; s < slots.length; s++) { if (s === me) continue; const c = this.cars[k++]; if (!c) break; const sl = slots[s]; c.v.place(sl.x, sl.z, sl.yaw); c.v.speed = 0; c.v.free = null; c.v.ai = null; c.d = new RaceDriver(c.v, R, this.diff, c.rival.persona, (this.ev.seed || 1) * 17 + k).prepare(); c.v.raceDriver = c.d; c.done = false; c.time = null; }
    if (spect) { this.gridMe = null; this.me = { spectate: true, dnf: true, done: false, prog: -1e9, lap: 0, cp: 0, idx: 0, time: null }; this.t = 0; this.countT = 4.2; this.lastBeep = 4; this.raceT = 0; this.finishers = []; this.state = 'countdown'; this.note(`grid (spectating): ${n} cars, ${this.diff}`); return true; }
    const sl = slots[me]; this.gridMe = sl; P.vehicle.place(sl.x, sl.z, sl.yaw); P.vehicle.speed = 0; P.vehicle.lat = 0; P.yaw = sl.yaw; P.camYaw = sl.yaw + Math.PI; P.updateCamera?.(1, true);
    this.me = { _u: undefined, lap: 0, prog: 0, idx: nearestIdx(R, sl.x, sl.z), cp: 0, time: null, done: false, dnf: false }; trackProgress(this.me, R, this.me.idx);
    this.t = 0; this.countT = 4.2; this.lastBeep = 4; this.raceT = 0; this.finishers = []; this.state = 'countdown'; this.note(`grid: ${n + 1} cars, ${this.diff}`);
    if (g.hud.fade && !this.m.instant) g.hud.fade(0, 0.45);
    g.hud.setObjective(this.R.name, `${DIFFICULTY[this.diff].label} · ${R.laps} lap${R.laps > 1 ? 's' : ''} · ${n + 1} cars`); return true;
  }
  // checkpoints are the route's own (R.cps: sample indices), passed in order by progress
  nextCp() { const R = this.R, me = this.me; const per = R.cps.length; const k = me.cp; const lap = Math.floor(k / per); const i = R.cps[k % per]; return { i, lap, n: k, total: per * R.laps, x: R.cx[i], z: R.cz[i] }; }
  progOfCp(c) { const R = this.R; return c.lap * R.N + ((c.i - R.startI + R.N) % R.N); }
  positions() { const list = this.cars.map((c) => ({ who: c.rival.name, prog: c.done ? 1e9 - (c.time || 0) : c.d ? c.d.prog : -1e9, car: c })); list.push({ who: 'You', prog: this.me.done ? 1e9 - this.me.time : this.me.prog, me: true }); list.sort((a, b) => b.prog - a.prog); return list; }
  update(dt) {
    if (!this.ready) return; const t0 = performance.now(); const g = this.g, P = g.player, R = this.R, T = g.traffic;
    if (this.state === 'meet') { for (const c of this.cars) { c.v.speed = 0; c.v.brake = true; } return; } // parked at the kerb, lights on
    if (this.state === 'grid') return;
    const all = T.all(); const ctx = { t: this.raceT, bins: T.bins || null, peds: g.crowd ? g.crowd.peds : null, playerV: P.vehicle, holding: this.state === 'countdown' };
    if (this.state === 'countdown') { this.countT -= dt; const n = Math.ceil(this.countT - 0.2);
      if (n < this.lastBeep && n >= 1 && n <= 3 && !this.spectate) { this.lastBeep = n; g.hud.bigMessage(String(n), this.R.name, 'info', 0.8); Audio.tone(660, 0.22, { type: 'square', vol: 0.09 }); }
      if (P.vehicle && this.gridMe) { const v = P.vehicle; if (Math.hypot(v.x - this.gridMe.x, v.z - this.gridMe.z) > 1.2) { v.place(this.gridMe.x, this.gridMe.z, this.gridMe.yaw); } v.speed = Math.min(v.speed, 0.3); } // no rolling start
      if (this.countT <= 0.2) { this.state = 'race'; if (!this.spectate) { g.hud.bigMessage('GO', '', 'good', 1.1); Audio.tone(1320, 0.5, { type: 'square', vol: 0.1 }); } this.note('GO'); } }
    if (this.state === 'race' || this.state === 'countdown') {
      if (this.state === 'race') this.raceT += dt;
      const ta = performance.now();
      for (const c of this.cars) { if (!c.d) continue; if (c.done) { c.v.drive(dt, { throttle: c.v.speed > 1 ? -0.4 : 0, steer: 0, handbrake: false }, g.collision, all); continue; }
        const inp = c.d.update(dt, ctx); c.v.drive(dt, inp, g.collision, all);
        if (this.state === 'race' && !this.spectate && c.d.prog >= R.N * R.laps) { c.done = true; c.time = this.raceT; this.finishers.push({ who: c.rival.name, time: c.time, car: c.v.type }); if (this.finishers.length === 1) this.note(`${c.rival.name} wins in ${fmt(c.time)}`); } }
      this.stats.aiMs = performance.now() - ta;
      // the player
      if (this.state === 'race' && !this.me.done && !this.spectate) { const me = this.me; const v = P.vehicle;
        if (!v || v.wrecked) { this.dnf('out of the car'); } else {
          me.idx = nearestIdx(R, v.x, v.z, me.idx, 10); const off = Math.abs(lateral(R, me.idx, v.x, v.z)) > R.hw[me.idx] + 60; if (off) { me.lostT = (me.lostT || 0) + dt; if (me.lostT > 12) this.dnf('left the route'); } else me.lostT = 0;
          me.prog = trackProgress(me, R, me.idx); const c = this.nextCp(); if (me.prog >= this.progOfCp(c) - 2 && me.prog < this.progOfCp(c) + R.N * 0.25) { me.cp++; Audio.ui('collect'); }
          if (me.cp >= R.cps.length * R.laps && me.prog >= R.N * R.laps - 1) { me.done = true; me.time = this.raceT; this.finishers.push({ who: 'You', time: me.time, me: true, car: v.type }); this.note(`you finish ${this.finishers.length} in ${fmt(me.time)}`); this.finish(); }
          else this.hudRace(); } }
      // everyone done, or the player well behind the winner
      if (this.state === 'race' && !this.spectate) { const winner = this.finishers[0]; if ((this.me.done || this.me.dnf) && this.cars.every((c) => c.done || !c.d)) this.finish(); else if (winner && !this.me.done && !this.me.dnf && this.raceT - winner.time > 90) this.dnf('too far behind'); }
    }
    if (this.state === 'results') { this.resT -= dt; for (const c of this.cars) if (c.d && c.done) c.v.drive(dt, { throttle: c.v.speed > 1 ? -0.5 : 0, steer: 0, handbrake: false }, g.collision, all); if (this.resT <= 0) this.handBack(); }
    const ms = performance.now() - t0; this.stats.lastMs = ms; if (ms > this.stats.stepMaxMs) this.stats.stepMaxMs = ms;
  }
  hudRace() { const g = this.g, R = this.R, me = this.me; const pos = this.positions(); const p = pos.findIndex((x) => x.me) + 1; const c = this.nextCp();
    const lap = clamp(me.lap + 1, 1, R.laps); g.hud.setObjective(`${R.name} · P${p}/${pos.length}`, `Lap ${lap}/${R.laps} · checkpoint ${Math.min(c.n + 1, c.total)}/${c.total} · ${fmt(this.raceT)}`, { x: c.x, z: c.z });
    g.hud.addBlip('race-cp', c.x, c.z, 'objective', 'Checkpoint'); this.pos = p; }
  dnf(why) { if (this.me.done || this.me.dnf) return; this.me.dnf = true; this.note(`DNF: ${why}`); this.g.hud.notify('Race over', `Did not finish — ${why}.`, 'info', 4); this.finish(); }
  finish() {
    if (this.state === 'results' || this.state === 'done') return; const g = this.g, S = this.m.save; this.state = 'results'; this.resT = 7; g.hud.removeBlip('race-cp');
    const key = `${this.ev.route}:${this.diff}`; const rec = S.races[key] || (S.races[key] = { best: null, wins: 0, starts: 0, podiums: 0 }); rec.starts++;
    { const R = this.R; for (const c of this.cars) if (c.d && !c.done) { const rate = c.d.prog / Math.max(1, this.raceT), left = R.N * R.laps - c.d.prog; if (rate > 0.5 && left > 0) this.finishers.push({ who: c.rival.name, time: this.raceT + left / rate, car: c.v.type, est: true }); } // still running: classified on their pace so far
      this.finishers.sort((a, b) => a.time - b.time); }
    const pos = this.me.dnf ? null : this.finishers.findIndex((f) => f.me) + 1; this.result = { pos, time: this.me.time, field: this.cars.length + 1, finishers: this.finishers.slice(), dnf: !!this.me.dnf };
    if (pos) { if (pos === 1) rec.wins++; if (pos <= 3) rec.podiums++; if (!rec.best || this.me.time < rec.best) { rec.best = +this.me.time.toFixed(2); this.result.record = true; } }
    for (const c of this.cars) { const r = S.rivals[c.rival.id] || (S.rivals[c.rival.id] = { starts: 0, beatYou: 0, youBeat: 0 }); r.starts++; if (pos) { const ci = this.finishers.findIndex((f) => f.who === c.rival.name); if (ci >= 0 && ci < pos - 1) r.beatYou++; else r.youBeat++; } }
    const txt = pos ? `P${pos} of ${this.result.field} · ${fmt(this.me.time)}${this.result.record ? ' · personal best' : ''}` : 'Did not finish';
    g.hud.bigMessage(pos === 1 ? 'You win' : pos ? `P${pos}` : 'DNF', txt, pos === 1 ? 'good' : 'info', 4); g.hud.setObjective('', ''); if (pos) Audio.ui(pos === 1 ? 'success' : 'notify'); this.note('results: ' + this.finishers.map((f, i) => `${i + 1}. ${f.who} ${f.est ? '~' : ''}${fmt(f.time)}`).join(', '));
  }
  // hand the rivals to the traffic: each joins the nearest lane and becomes an ordinary car (culled by distance like any)
  handBack() { const T = this.g.traffic; let n = 0;
    for (const c of this.cars) { const v = c.v; v.raceDriver = null; c.d = null; const gi = T.guests.indexOf(v); if (gi >= 0) T.guests.splice(gi, 1); v.keep = false; const ln = T.laneNear ? T.laneNear(v.x, v.z, v.yaw, 30) : null;
      if (ln && T.adoptAI(v, ln, { place: false })) n++; else T.remove(v); }
    this.cars = []; this.state = 'done'; this.note(`handed ${n} rivals to the traffic`); }
  disposeCars() { const T = this.g.traffic; for (const c of this.cars) { const gi = T.guests.indexOf(c.v); if (gi >= 0) T.guests.splice(gi, 1); c.v.raceDriver = null; T.remove(c.v); } this.cars = []; }
  cleanup() { if (this.state === 'race' || this.state === 'countdown' || this.state === 'grid') { this.me && (this.me.dnf = true); } this.g.hud.removeBlip('race-cp'); if (this.state === 'race' || this.state === 'countdown') this.g.hud.setObjective('', ''); if (this.state === 'results') this.handBack(); this.disposeCars(); this.queue = []; this.ready = false; this.state = 'done'; }
  busy() { return this.state === 'grid' || this.state === 'countdown' || this.state === 'race'; }
  fillPool() {}
}
export { PERSONALITY };
