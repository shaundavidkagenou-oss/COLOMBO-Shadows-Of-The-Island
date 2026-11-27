// The world simulation director (feature 60, and the coordinator behind 27 / 34 / 52 / 55 / 56 / 57 / 59).
//
// The city already had a dozen systems that each knew their own job but none of them knew about each other: the crowd had an
// hour curve, the businesses had opening hours, the traffic had a density setting, the events had a schedule, the works and
// the street services ran whenever the player came near. This is the one mind on top: it reads the time of day, the day of
// the week, the weather, the businesses that are actually open, the events that are actually on and the trouble the player
// has caused, turns that into an activity level for each district, and then spends that budget:
//
//   · population — hands the crowd the hour factor it spawns against, so a Tuesday 11:00 in Pettah is packed and the same
//     street at 03:00 is nearly empty, and a rainstorm thins it out (the crowd's own per-hour curve stays the floor)
//   · the heavy street works — never more than one of {a manned construction site, a refuse round, an event crowd} within a
//     hundred metres of the player; when they collide the quietest one stands down (its people go back to the street), which
//     is what keeps the near-field budgets and the frame time flat
//   · weather — heavy rain sends the sweepers home and empties the pavements; the sun brings everyone back out
//   · persistence — the day it stopped, the works roster, the bins, the business day: what the player comes back to is the
//     city they left, not a fresh one (restore fills the hours that passed while they were away)
//
// It runs at 4 Hz, allocates nothing per tick, and everything it touches is an existing system through its own API.
import { RNG } from '../core/rng.js';
import * as L from './Layout.js';

const TICK = 0.25;
const HEAVY_R = 110;      // "near the player" for budget arbitration
const HEAVY_MAX = 2;      // at most this many heavy street works around the player

// how busy a place is through the day: morning market, lunch, the evening rush, the small hours
function hourCurve(h) {
  if (h < 4.5) return 0.12;
  if (h < 6) return 0.18 + (h - 4.5) * 0.1;
  if (h < 8.5) return 0.62 + (h - 6) * 0.15;    // the commute builds
  if (h < 11) return 0.94;
  if (h < 14) return 1.0;                        // lunch
  if (h < 16.5) return 0.88;
  if (h < 19) return 0.98;                       // the evening rush
  if (h < 21.5) return 0.72;
  if (h < 23.5) return 0.4;
  return 0.22;
}

export class SimDirector {
  constructor(game) {
    this.g = game; this.t = 0; this.tick = 0; this.hour = 12; this.day = 1; this.rain = 0; this.night = 0;
    this.seed = 1; this.rng = new RNG(20832); this.activity = new Map(); this.act = 0.8;
    this.stats = { tick: 0, stood: 0, budget: 0, heard: 0, day: 1, act: 0.8, people: 0, rainStood: 0 };
    this.weather = 'clear'; this.lastDay = 1; this.history = []; // (the day's shape, for the pause-map readout and the save)
    this.owned = { construction: false, services: false };
    this.baseTraffic = game.traffic ? game.traffic.max : 0; // the density setting's own maximum (Game.applyDensity refreshes it)
  }
  // ---------------------------------------------------------------- activity
  // 0..1 for one district: the hour's shape, how many of its businesses are open, the weather, and any event drawing people
  districtActivity(x, z) {
    let k = hourCurve(this.hour);
    const C = this.g.crowd, B = C && C.biz;
    if (B && C.nearPOIs) { // the shops that are actually open around this corner, and how busy each one is
      let sum = 0, n = 0; for (const q of C.nearPOIs(x, z, 55)) { if (q.type !== 'shop' && q.type !== 'vendor') continue; sum += B.footfall(q); if (++n >= 40) break; }
      if (n) k *= 0.5 + 0.65 * (sum / n);
    }
    k *= 1 - this.rain * 0.35;
    return k < 0 ? 0 : k > 1.15 ? 1.15 : k;
  }
  // the number the crowd spawns against (Game.hourFactor → here): the old hour-only curve is the safety floor
  factor() {
    const base = this.hour < 5 ? 0.25 : this.hour < 7 ? 0.55 : this.hour < 19 ? 1 : this.hour < 22 ? 0.8 : 0.45;
    return Math.max(0.05, Math.min(1, base * (0.55 + 0.55 * this.act))); // (never above the density setting's own maximum)
  }
  // how much of the traffic density setting should be on the road at this hour: the school-and-office rush is the peak,
  // the small hours are the quietest, and a downpour keeps some of it at home
  trafficDemand() {
    const h = this.hour; const rush = (h > 6.5 && h < 9.5) || (h > 16 && h < 19.5);
    let v = rush ? 1 : h < 5 ? 0.3 : h < 6.5 ? 0.45 : h < 21.5 ? 0.85 : 0.55;
    return v * (1 - this.rain * 0.12);
  }
  // ---------------------------------------------------------------- per frame
  update(dt, ctx = {}) {
    if (ctx.hour !== undefined) this.hour = ctx.hour; if (ctx.day !== undefined) this.day = ctx.day;
    if (ctx.rain !== undefined) this.rain = ctx.rain; if (ctx.night !== undefined) this.night = ctx.night;
    this.t += dt; if (this.t < TICK) return; const step = this.t; this.t = 0; this.tick++;
    const g = this.g, P0 = g.player || { x: 0, z: 0 }, did = L.districtIdAt(P0.x, P0.z);
    const a = this.districtActivity(P0.x, P0.z); this.act += (a - this.act) * 0.35;
    this.activity.set(did, a);
    if (this.day !== this.lastDay) { this.lastDay = this.day; this.history.push({ day: this.day - 1, act: +this.act.toFixed(2) }); if (this.history.length > 16) this.history.shift(); }
    // ---- budget: count the heavy street works near the player and stand the quietest one down when they pile up
    const P = g.player || { x: 0, z: 0 }; const heavy = [];
    const K = g.construction; if (K) for (const s of K.sites) { if (!s.built || !s.crew.some((w) => w.p)) continue; const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < HEAVY_R) heavy.push({ kind: 'works', d, what: s }); }
    const S = g.streetSvc; if (S && S.run) { const b = S.run.bins[0]; const d = b ? Math.hypot(b.x - P.x, b.z - P.z) : Infinity; if (d < HEAVY_R * 1.4) heavy.push({ kind: 'refuse', d, what: S.run }); }
    const EV = g.cityEvents; if (EV && EV.acceptsVisitors) for (const e of EV.list) { if (!EV.acceptsVisitors(e)) continue; for (const [, site] of EV.sites) { const d = Math.hypot(site.x - P.x, site.z - P.z); if (d < HEAVY_R) { heavy.push({ kind: 'event', d, what: e }); break; } } }
    // ---- traffic: the volume follows the hour the same way the pavement does (the density setting stays the ceiling)
    const T = g.traffic; if (T && this.baseTraffic) { const want = Math.max(4, Math.round(this.baseTraffic * this.trafficDemand())); if (Math.abs(T.max - want) > Math.max(1, this.baseTraffic * 0.04)) { T.max = want; this.stats.trafficMax = want; } }
    this.stats.budget = heavy.length; this.stats.heard = heavy.filter((q) => q.d < 60).length;
    if (heavy.length > HEAVY_MAX) {
      heavy.sort((x, y) => y.d - x.d);                       // the farthest one is the one nobody is watching
      const drop = heavy[0];
      if (drop.kind === 'refuse' && S && S.run === drop.what) { S.run.phase = 'abort'; this.stats.stood++; }
      else if (drop.kind === 'works') { for (const w of drop.what.crew) if (w.p) drop.what.releaseWorker ? drop.what.releaseWorker(w) : null; this.stats.stood++; }
    }
    // ---- weather: sweepers are the first to go home when it pours (heavy rain, not the Colombo drizzle)
    if (S && this.rain > 0.55) { for (const w of S.crew.slice()) S.wantRelease(w); this.stats.rainStood++; }
    // ---- the day's shape, for the readout and the save
    this.stats.act = +this.act.toFixed(3); this.stats.day = this.day; this.stats.tick = this.tick; this.stats.people = g.crowd ? g.crowd.peds.length : 0;
    this.weather = this.rain > 0.55 ? 'rain' : this.rain > 0.15 ? 'drizzle' : 'clear';
    void step;
  }
  info() { return { act: +this.act.toFixed(2), traffic: this.g.traffic ? this.g.traffic.max : 0, weather: this.weather, budget: this.stats.budget, stood: this.stats.stood, day: this.day, hour: +this.hour.toFixed(2), people: this.stats.people, history: this.history.slice(-4) }; }
  // ---------------------------------------------------------------- persistence
  serialize() { return { v: 1, seed: this.seed, day: this.day, hour: +this.hour.toFixed(2), stood: this.stats.stood, history: this.history.slice(-8), works: this.g.construction ? this.g.construction.serialize() : null, street: this.g.streetSvc ? this.g.streetSvc.serialize() : null, biz: this.g.crowd && this.g.crowd.biz ? this.g.crowd.biz.serialize() : null }; }
  restore(d) {
    if (!d) return; this.seed = d.seed || 1; this.day = d.day || 1; this.history = Array.isArray(d.history) ? d.history.slice(-8) : [];
    try { if (d.biz && this.g.crowd && this.g.crowd.biz) this.g.crowd.biz.restore(d.biz); } catch (e) { console.warn('[world] business restore', e); }
    try { if (d.street && this.g.streetSvc) this.g.streetSvc.restore(d.street); } catch (e) { console.warn('[world] street restore', e); }
    try { if (d.works && this.g.construction) this.g.construction.restore(d.works); } catch (e) { console.warn('[world] works restore', e); }
  }
}
