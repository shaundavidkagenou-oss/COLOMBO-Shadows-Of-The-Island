// 92nd: night activities — underground fight nights and street-race meets. A small manager next to CityEvents (it never
// touches the festival calendar): a nightly schedule, one activity built at a time near the player, the same lifecycle
// for every type (scheduled → preparing → live → ending → cleanup), the save field `activities`, prompts, map blips and the
// data for the phone's After Dark app. Activity types are classes with prepare / build / update / cleanup (FightNight,
// StreetRace), so a new kind of activity plugs in without changing this file's flow.
import { rectClear } from '../world/events/EventSites.js';
import { Input } from '../core/Input.js';
import { Settings } from '../core/Settings.js';
import { FightNight, ROSTER } from './FightNight.js';
import { StreetRace, DIFF_ORDER, fmtTime } from './StreetRace.js';
import { ROUTES, buildRoute } from './RaceRoutes.js';
import { DIFFICULTY } from './RaceDriver.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// fight venues: real yards next to the buildings named in the brief (the buildings themselves are shells — no interiors,
// no roof access, so no rooftop fights). A clear 14 × 14 m patch is searched around each anchor. The anchors were moved onto
// lots the clear-yard search actually finds (the blocks around the auto garage and Union Place are built solid — probed 92nd).
export const VENUES = [
  { id: 'garage', name: 'Back lot off Maradana Road', area: 'Maradana', ax: 477, az: -606 },
  { id: 'port', name: 'Port warehouse loading yard', area: 'Fort', ax: -100, az: -1060 },
  { id: 'union', name: 'Kompanna Veediya backstreet lot', area: 'Slave Island', ax: -176, az: -198 },
  { id: 'kotahena', name: 'Industrial lot by St. Lucia\'s', area: 'Kotahena', ax: 360, az: -1070 },
];
const ROUTE_IDS = Object.keys(ROUTES);
const PREP_R = 320, DROP_R = 480;

export class ActivityManager {
  constructor(game) {
    this.g = game; this.inst = null; this.cur = null; this.sites = new Map(); this.save = ActivityManager.fresh(); this.stats = { prepared: 0, cleaned: 0, lastMs: 0, maxMs: 0, buildFrames: 0 }; this.log = [];
    this.roundT = 60; this.forced = []; this.cam = 0; this.instant = false;
    if (game.crowd) (game.crowd.alarmHooks || (game.crowd.alarmHooks = [])).push((x, z, r, sev) => { const I = this.inst; if (I && I.scatter && I.site && I.ready && sev >= 1 && Math.hypot(x - I.site.x, z - I.site.z) < Math.max(r, 30) + 20) { I.scatter(x, z); } });
    // venue lamps: borrow the WalkIn pool (a second lender after the hospital) — no light is ever added to the scene
    const W = game.interiors && game.interiors.walkIn; if (W) { const prev = W.ext; const me = this; W.ext = { get wantsPool() { return !!(prev && prev.wantsPool) || me.wantsPool(); }, poolSoon: () => !!(prev && prev.poolSoon && prev.poolSoon()) || me.poolSoon(), fillPool: (pool, P) => (prev && prev.wantsPool ? prev.fillPool(pool, P) : me.fillPool(pool, P)) }; this.prevExt = prev; }
  }
  static fresh() { return { points: 100, predictions: 0, correct: 0, fighters: {}, races: {}, rivals: {}, refillDay: 0 }; }
  note(s) { this.log.push(`${this.g.atmos?.timeString || ''} ${s}`); if (this.log.length > 60) this.log.shift(); }
  rng(seed) { return mulberry(seed | 0); }
  gameH() { const A = this.g.atmos; return (A.day || 1) * 24 + A.hour; }
  near(site, r) { const P = this.g.player; return Math.hypot(P.x - site.x, P.z - site.z) < r; }
  crowdSize() { const q = Settings.get('quality') || 'high'; return { low: 8, medium: 12, high: 16, ultra: 20 }[q] || 14; }
  stake() { return 10; }
  shake(k) { const P = this.g.player; if (this.inst && this.inst.site && this.near(this.inst.site, 12) && !P.vehicle) P.shake = Math.max(P.shake || 0, k); }
  // ---- the nightly schedule (deterministic per day): one fight night, one race meet
  schedule(day) {
    const r = mulberry(day * 7331 + 17); const out = [];
    const v = VENUES[(day + Math.floor(r() * 2)) % VENUES.length]; const pool = ROSTER.slice(); const card = [];
    for (let i = 0; i < 3; i++) { const a = pool.splice(Math.floor(r() * pool.length), 1)[0], b = pool.splice(Math.floor(r() * pool.length), 1)[0]; card.push([a.id, b.id]); }
    out.push({ id: `f${day}`, type: 'fight', day, venue: v.id, name: `Fight night · ${v.area}`, place: v.name, start: day * 24 + 21.5, end: day * 24 + 25.5, card, seed: day * 101 + 7 });
    const route = ROUTE_IDS[(day + 1) % ROUTE_IDS.length]; const diff = DIFF_ORDER[(day + Math.floor(r() * 3)) % 4];
    out.push({ id: `r${day}`, type: 'race', day, route, diff, name: `Race meet · ${ROUTES[route].name}`, place: ROUTES[route].short, start: day * 24 + 22.5, end: day * 24 + 26.5, seed: day * 131 + 3 });
    return out;
  }
  events() { const d = this.g.atmos.day || 1; return this.forced.concat(this.schedule(d - 1), this.schedule(d), this.schedule(d + 1)); }
  // where an event happens (a fight venue is searched once and cached; a race meets at its kerb row by the start)
  siteOf(ev) {
    if (ev.site) return ev.site; if (ev.type === 'race') { const R = buildRoute(ev.route); const i = R.at(R.startI - Math.round(45 / 2)); ev.site = { x: R.cx[i], z: R.cz[i], yaw: R.hd[i] }; return ev.site; }
    const v = VENUES.find((x) => x.id === ev.venue); if (!this.sites.has(v.id)) this.sites.set(v.id, this.findVenue(v)); ev.site = this.sites.get(v.id); return ev.site;
  }
  findVenue(v) {
    const col = this.g.collision; const H = 7; let best = null;
    for (let r = 0; r <= 96 && !best; r += 4) for (let a = 0; a < (r ? Math.ceil((2 * Math.PI * r) / 4) : 1) && !best; a++) {
      const ang = r ? (a / Math.ceil((2 * Math.PI * r) / 4)) * Math.PI * 2 : 0; const x = Math.round(v.ax + Math.cos(ang) * r), z = Math.round(v.az + Math.sin(ang) * r);
      if (rectClear(col, x - H, z - H, x + H, z + H, { slope: 0.5 })) best = { x, z, yaw: 0, venue: v.id };
    }
    if (!best) { best = { x: v.ax, z: v.az, yaw: 0, venue: v.id, unchecked: true }; console.warn('[activities] no clear yard near', v.id); }
    this.note(`venue ${v.id} at ${best.x}, ${best.z}`); return best;
  }
  state(ev, H = this.gameH()) { if (this.cur === ev.id && this.inst) return this.inst.state === 'race' || this.inst.state === 'countdown' ? 'racing' : this.inst.ready ? 'live' : 'preparing'; return H < ev.start ? 'scheduled' : H < ev.end ? 'on' : 'over'; }
  // ---- per frame
  update(dt) {
    const t0 = performance.now(); const g = this.g, P = g.player, H = this.gameH();
    if (this.save.refillDay !== g.atmos.day && this.save.points < 20) { this.save.points = 20; this.save.refillDay = g.atmos.day; } // the house spots you 20 points a night (points are free and never money)
    // the live event nearest the player, within reach
    let want = null, wd = 1e9; if (!g.indoor) for (const ev of this.events()) { if (H < ev.start - 0.5 || H >= ev.end) continue; const s = this.siteOf(ev); const d = Math.hypot(P.x - s.x, P.z - s.z); if (d < PREP_R && d < wd) { want = ev; wd = d; } }
    const I = this.inst;
    if (I) { const ev = I.ev; const d = Math.hypot(P.x - I.site.x, P.z - I.site.z); const over = H >= ev.end || I.scattered || I.state === 'done';
      const busy = I.busy && I.busy(); if (!busy && (d > DROP_R || (over && (d > 140 || I.state === 'done')) || (want && want !== ev && wd < d - 60))) this.drop(); }
    if (!this.inst && want && !(this.dropped && this.dropped[want.id] && H < (this.dropped[want.id] || 0))) this.start(want);
    const J = this.inst; if (J) { if (!J.ready) { J.build(); this.stats.buildFrames++; } J.update(dt); this.updateCam(dt); }
    this.blips(H);
    const ms = performance.now() - t0; this.stats.lastMs = ms; if (ms > this.stats.maxMs) this.stats.maxMs = ms;
  }
  start(ev) { const site = this.siteOf(ev); this.inst = ev.type === 'fight' ? new FightNight(this, ev) : new StreetRace(this, ev); this.inst.site = site; this.cur = ev.id; this.inst.prepare(); this.stats.prepared++; this.note(`prepare ${ev.id} (${ev.type})`); }
  drop() { const I = this.inst; if (!I) return; this.camOff(); I.cleanup(); if (I.scattered) (this.dropped || (this.dropped = {}))[I.ev.id] = I.ev.end; this.note(`cleanup ${I.ev.id}`); this.inst = null; this.cur = null; this.stats.cleaned++; }
  blips(H) { const hud = this.g.hud; if (!hud) return; for (const ev of this.events()) { const id = 'act-' + ev.type; const on = H >= ev.start - 2 && H < ev.end && !(this.inst && this.inst.busy && this.inst.busy());
      const cur = this._blip && this._blip[id]; if (on) { if (cur !== ev.id) { const s = this.siteOf(ev); hud.addBlip(id, s.x, s.z, ev.type, ev.name); (this._blip || (this._blip = {}))[id] = ev.id; } } else if (cur === ev.id) { hud.removeBlip(id); this._blip[id] = null; } } }
  // ---- prompts (Game.updateInteractions)
  interact(P, key) {
    const I = this.inst; if (!I || !I.ready) return null;
    if (I instanceof StreetRace) { if (I.state !== 'meet') return null; const p = I.prompt(key); if (p && p.startsWith(key('interact'))) { if (Input.wasPressed('interact')) { I.join(); return null; } if (Input.wasPressed('more')) I.cycleDiff(); } return p; }
    if (P.vehicle || !I.bout) return null; const d = Math.hypot(P.x - I.site.x, P.z - I.site.z); if (d > 9.5) return null;
    if (Input.wasPressed('more')) this.cycleCam();
    const B = I.bout, a = B.a.f, b = B.b.f; const cam = ` · ${key('more')} ${['ringside view', 'overhead view', 'free camera'][this.cam]}`;
    if (I.predictOpen()) { if (Input.wasPressed('interact')) I.cyclePick(); const pick = I.pick === 1 ? a.name : I.pick === 2 ? b.name : 'none';
      return `${key('interact')} Predict (${this.stake()} pts): ${pick} · odds ${I.odds[0]} / ${I.odds[1]} · ${this.save.points} pts` + cam; }
    const R = B.result; const st = B.phase === 'over' ? (R && R.winner ? `${R.winner.f.name} won (${R.how})` : 'Draw') : B.phase === 'count' ? `count ${B.count}` : B.phase === 'rest' ? `between rounds (${B.round}/${B.rounds})` : `round ${B.round}/${B.rounds} · ${Math.max(0, Math.ceil(B.roundT - B.t))} s`;
    return `${a.name} v ${b.name} · ${st}${I.pick ? ` · your pick: ${I.pick === 1 ? a.name : b.name}` : ''}` + cam;
  }
  // ---- ringside cameras (fight): T cycles ringside → overhead → back to the player's own camera; moving off ends it
  cycleCam() { this.cam = (this.cam + 1) % 3; if (this.cam === 0) this.camOff(); }
  camOff() { const P = this.g.player; if (this.camOn) { this.camOn = false; P.camOverride = false; P.updateCamera?.(1, true); } this.cam = 0; }
  updateCam(dt) {
    const I = this.inst, P = this.g.player; if (!this.cam || !(I instanceof FightNight) || !I.bout) { if (this.camOn) this.camOff(); return; }
    if (P.vehicle || Math.hypot(P.x - I.site.x, P.z - I.site.z) > 12 || Math.abs(Input.moveX) + Math.abs(Input.moveY) > 0.3) { this.camOff(); return; }
    const B = I.bout, cam = this.g.camera; const mx = (B.a.x + B.b.x) / 2, mz = (B.a.z + B.b.z) / 2; const gy = I.ground(mx, mz); this.camOn = true; P.camOverride = true; this.camT = (this.camT || 0) + dt;
    if (this.cam === 1) { const ax = B.b.x - B.a.x, az = B.b.z - B.a.z, al = Math.hypot(ax, az) || 1; const side = Math.sin(this.camT * 0.05) > 0 ? 1 : -1; const tx = mx - (az / al) * 3.6 * side, tz = mz + (ax / al) * 3.6 * side; cam.position.lerp({ x: tx, y: gy + 1.55, z: tz }, Math.min(1, dt * 2.5)); }
    else { cam.position.lerp({ x: I.site.x + 3.2, y: gy + 6.8, z: I.site.z + 3.2 }, Math.min(1, dt * 2)); }
    const sh = P.shake || 0; cam.lookAt(mx + (Math.random() - 0.5) * sh * 0.05, gy + 1.25, mz); if (sh > 0) P.shake = Math.max(0, sh - dt * 2);
  }
  // ---- the borrowed WalkIn light pool
  wantsPool() { const I = this.inst; return !!(I && I instanceof FightNight && I.ready && !I.scattered && this.g.atmos.night > 0.3 && this.near(I.site, 70)); }
  poolSoon() { const I = this.inst; return !!(I && I instanceof FightNight && this.near(I.site, 95)); }
  fillPool(pool) { if (this.inst && this.inst.fillPool) this.inst.fillPool(pool); }
  // ---- the phone's After Dark app
  phoneRows() {
    const H = this.gameH(); const rows = []; for (const ev of this.events()) { if (ev.end <= H - 0.01 || ev.start > H + 30) continue; const s = this.siteOf(ev); const st = this.state(ev, H);
      const when = `${hh(ev.start)}–${hh(ev.end)}${ev.day !== this.g.atmos.day ? (ev.day < this.g.atmos.day ? ' (tonight)' : ' (tomorrow)') : ''}`;
      if (ev.type === 'fight') { const card = ev.card.map(([a, b]) => `${nameOf(a)} v ${nameOf(b)}`).join(' · '); rows.push({ t: ev.name, d: `${ev.place} · ${when} · ${st}`, sub: card, at: { x: s.x, z: s.z }, ev }); }
      else { const rec = this.save.races[`${ev.route}:${ev.diff}`]; rows.push({ t: ev.name, d: `${ev.place} · ${when} · ${st}`, sub: `${DIFFICULTY[ev.diff].label} field (change it at the meet) · ${ROUTES[ev.route].laps} laps${rec && rec.best ? ` · your best ${fmtTime(rec.best)}` : ''}`, at: { x: s.x, z: s.z }, ev }); } }
    return rows;
  }
  summary() { const S = this.save; return `${S.points} prediction points · ${S.correct}/${S.predictions} right`; }
  // ---- save
  serialize() { return JSON.parse(JSON.stringify(this.save)); }
  restore(d) { this.drop(); this.save = Object.assign(ActivityManager.fresh(), d || {}); this.dropped = {}; }
  reset() { this.drop(); this.save = ActivityManager.fresh(); this.dropped = {}; this.forced = []; }
  // loading screen: the race routes (80–170 ms each) are computed here, never in play
  async prewarm(tick) { for (const id of ROUTE_IDS) { buildRoute(id); await tick(); } }
  // tests / benchmarks: an event of `type` live right now at a venue / route
  force(type, o = {}) { const H = this.gameH(); const base = this.schedule(this.g.atmos.day || 1).find((e) => e.type === type); const ev = { ...base, ...o, id: `x${type}${(this.forceN = (this.forceN || 0) + 1)}`, start: H - 0.01, end: H + (o.hours || 3) }; delete ev.site; this.forced.push(ev); return ev; }
}
const hh = (H) => { const h = ((H % 24) + 24) % 24; const m = Math.round((h % 1) * 60); return `${String(Math.floor(h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
const nameOf = (id) => { const f = ROSTER.find((x) => x.id === id); return f ? f.name.replace(/ ".*"/, '') : id; };
