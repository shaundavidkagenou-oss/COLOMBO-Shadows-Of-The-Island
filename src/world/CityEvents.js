// 81st request — DYNAMIC CITY EVENTS: the event manager. One instance (Game.cityEvents) owns every city event of the save.
//  · schedule: the game calendar (CityEventCatalog: day 1 = Sun 1 Nov 2026) is filled a week ahead from the type rules —
//    weekly concerts / markets / screenings / community mornings and the festivals on their dates — deterministic per save
//    seed; each instance gets a venue whose measured site (EventSites.findSite) is free for its whole set-up → clean-up window
//  · lifecycle (game time): scheduled → preparation (crew; structures go up tier by tier) → active (gates open half an hour
//    before; attendance builds, plateaus, thins) → ending (the crowd leaves) → cleanup (taken down) → completed.
//    Disturbances: paused (a scuffle nearby: music stops, security goes over, resumes when calm) and suspended (gunfire, a
//    vehicle driven in, someone hurt: announcement, people leave, organisers call the police; resumes after a calm half hour
//    if there is time left, otherwise cancelled). Weather: a storm at set-up time postpones the event a day (or cancels it).
//    Time skips (sleeping) fast-forward the states; nothing depends on frame time except the programme on stage.
//  · far away an event is a number (attendance curve) only; within ~450 m its site is built (EventSite), within ~170 m its
//    people run. The phone's City Events app and the console read the same instances; nothing is shown that is not here.
//  · save / load: the instances of the window (state, notes, reschedules) go into the save (SaveSystem field `events`).
import { TYPES, TYPE_BY_ID, TEMPLATES, CATEGORIES, typesOn, FILLERS, dateLabel, hourLabel, dateOf } from './events/CityEventCatalog.js';
import { VENUES, findSite } from './events/EventSites.js';
import { evMaterial, chairGeometry, EV_MAT_NAMES } from './events/EventKit.js';
import { EventSite, hashStr, eventSpecs } from './events/EventSite.js';
import { buildLayout } from './events/EventLayouts.js';
import { mulberry32 } from '../core/rng.js';
import { SoundBank } from '../audio/SoundBank.js';
import { PlaceSound } from '../audio/PlaceAudio.js';
import { CE_SOUND_DEFS } from '../audio/CityEventSoundDefs.js';
import { Settings } from '../core/Settings.js';
import * as THREE from 'three';

const BUILD_R = 450, DROP_R = 560, ENDING_H = 0.4, WINDOW_BACK = 3, WINDOW_AHEAD = 7;
const VOICE = Object.fromEntries(CE_SOUND_DEFS.filter((d) => d.voice).map((d) => [d.id, d.voice]));
const SHOW = new Set(['active', 'paused', 'suspended', 'ending']);
const BUILT = new Set(['preparation', 'active', 'paused', 'suspended', 'ending', 'cleanup']);
export const STATE_LABEL = { scheduled: 'Scheduled', preparation: 'Setting up', active: 'Happening now', paused: 'Paused', suspended: 'Suspended', ending: 'Ending', cleanup: 'Clearing up', completed: 'Completed', cancelled: 'Cancelled', postponed: 'Postponed' };

export class CityEvents {
  constructor(game) {
    this.g = game; this.seed = 1; this.list = []; this.byId = new Map(); this.sites = new Map(); this.genDays = new Set(); this.stats = { builds: 0, buildMs: 0, maxBuildMs: 0, disposes: 0, disturbances: 0, routeMs: 0, transitions: 0, timeJumps: 0 };
    this.marks = []; this.cool = new Map(); this.voices = []; this.loopKeys = new Set(); this.crowdExtra = 0; this.tokenFrame = -1; this.tokenUsed = false; this.frame = 0; this.lastNow = null; this.ready = false; this.zones = []; this.policeCd = 0;
    this.frustum = new THREE.Frustum(); this.pm = new THREE.Matrix4(); this.sphere = new THREE.Sphere();
    if (game.crowd) (game.crowd.alarmHooks || (game.crowd.alarmHooks = [])).push((x, z, r, sev, kind, byPlayer, src) => this.onAlarm(x, z, r, sev, kind, byPlayer, src));
  }
  get secPerMin() { return Settings.get('timeScale') || 2; }
  get now() { const A = this.g.atmos; return ((A.day || 1) - 1) * 24 + A.hour; }
  // ------------------------------------------------------------------------------------------------ loading
  // called during Game loading: measure the venue sites, build the shared materials / chair geometry, the staff bodies
  async prewarm(tick = null) {
    const t0 = performance.now(); const col = this.g.collision; this.siteMs = {}; this.matMs = {};
    for (const T of TYPES) for (const v of T.venues) { const tp = TEMPLATES[T.tpl]; const k = `${v}|${tp.W}x${tp.D}`; if (this.siteMs[k] !== undefined) continue; const t1 = performance.now(); findSite(col, v, tp.W, tp.D); this.siteMs[k] = Math.round(performance.now() - t1); }
    for (const name of EV_MAT_NAMES()) { const t1 = performance.now(); evMaterial(name); this.matMs[name] = Math.round(performance.now() - t1); if (tick) await tick(); } // 1K procedural textures: one per loading tick (the bar keeps moving)
    chairGeometry();
    // the layout + kit builders run once per event type now (flat ground, thrown away): the first real site later is built by warm (JIT-compiled) code
    const t2 = performance.now(); const sites = {}; for (const T of TYPES) { const tp = TEMPLATES[T.tpl]; const site = sites[T.tpl] || (sites[T.tpl] = { x: 0, z: 0, yaw: 0, W: tp.W, D: tp.D, base: 0, entry: { x: 0, z: -tp.D / 2 - 6 }, node: 0, venue: T.venues[0] });
      try { const B = buildLayout(tp, T, site, () => 0, mulberry32(hashStr(T.id))); for (const tr of B.tiers) { const grp = tr.build({ evPrint: evMaterial('evPaint') }, { cast: false }); grp.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); } } catch (e) { console.warn('event layout warm', T.id, e); }
      if (tick) await tick(); }
    this.warmLayoutMs = Math.round(performance.now() - t2); this.prewarmMs = performance.now() - t0; return this.prewarmMs;
  }
  specs() { return eventSpecs(); }
  reset(seed = 1) { this.disposeAll(); this.seed = seed; this.list = []; this.byId.clear(); this.genDays.clear(); this.ready = true; this.lastNow = this.now; this.fill(); }
  // ------------------------------------------------------------------------------------------------ schedule
  site(venue, tpl) { const tp = TEMPLATES[tpl]; return findSite(this.g.collision, venue, tp.W, tp.D); }
  windowFree(venue, a, b, except = null) { return !this.list.some((e) => e !== except && e.venue === venue && e.state !== 'cancelled' && e.state !== 'postponed' && a < e.tCleanEnd + 0.25 && b > e.tPrep - 0.25); }
  make(T, day, start, venue, extra = {}) {
    const tp = TEMPLATES[T.tpl]; const site = this.site(venue, T.tpl); if (!site) return null; const r = mulberry32(hashStr(`${T.id}|${day}|${this.seed}`));
    const ev = { id: extra.id || `${T.id}-d${day}`, T, tpl: tp, day, start, dur: T.dur, prep: tp.prep, clean: tp.clean, venue, venueName: VENUES[venue].name, venueShort: VENUES[venue].short, site,
      peak: Math.round(T.cap[0] + (T.cap[1] - T.cap[0]) * r()), state: 'scheduled', cancelled: false, reason: '', notes: [], seedK: Math.floor(r() * 8), disturb: 0, pauseUntil: 0, calmSince: 0, attendK: 1, ...extra };
    this.times(ev); return ev;
  }
  times(ev) { ev.t0 = (ev.day - 1) * 24 + ev.start; ev.tEnd = ev.t0 + ev.dur; ev.tPrep = ev.t0 - ev.prep; ev.tCleanStart = ev.tEnd + ENDING_H; ev.tCleanEnd = ev.tCleanStart + ev.clean; }
  add(ev) { this.list.push(ev); this.byId.set(ev.id, ev); this.list.sort((a, b) => a.t0 - b.t0); return ev; }
  genDay(day) {
    if (this.genDays.has(day) || day < 1) return; this.genDays.add(day); const rng = mulberry32(hashStr(`day${day}|${this.seed}`)); let types = typesOn(day, rng); let made = 0;
    const order = types.slice().sort((a, b) => (b.rule.fixed ? 1 : 0) - (a.rule.fixed ? 1 : 0)); // festivals first: they get their venue
    for (const T of order) { if (this.byId.has(`${T.id}-d${day}`)) continue; for (const v of T.venues) { const tmp = this.make(T, day, T.start, v); if (!tmp) continue; if (!this.windowFree(v, tmp.tPrep, tmp.tCleanEnd)) continue; this.add(tmp); made++; break; } }
    if (!made) { for (let k = 0; k < FILLERS.length; k++) { const T = TYPE_BY_ID[FILLERS[(day + k) % FILLERS.length]]; let ok = false; for (const v of T.venues) { const tmp = this.make(T, day, T.start, v); if (tmp && this.windowFree(v, tmp.tPrep, tmp.tCleanEnd)) { this.add(tmp); ok = true; break; } } if (ok) break; } }
  }
  fill() { const d = this.g.atmos.day || 1; for (let k = -1; k <= WINDOW_AHEAD; k++) this.genDay(d + k); const cut = (d - WINDOW_BACK - 1) * 24; this.list = this.list.filter((e) => e.tCleanEnd > cut || BUILT.has(e.state)); this.byId = new Map(this.list.map((e) => [e.id, e])); }
  // ------------------------------------------------------------------------------------------------ attendance (a number; the site's people are a sample of it)
  frac(ev, now = this.now) {
    const open = ev.t0 - 0.5, full = ev.t0 + ev.dur * 0.35, thin = ev.tEnd - ev.dur * 0.15; let f;
    if (now < open) f = 0; else if (now < ev.t0) f = 0.05 + 0.15 * (now - open) / 0.5; else if (now < full) f = 0.2 + 0.8 * (now - ev.t0) / (full - ev.t0); else if (now < thin) f = 1; else if (now < ev.tEnd) f = 1 - 0.35 * (now - thin) / (ev.tEnd - thin); else if (now < ev.tCleanStart) f = 0.65 * (1 - (now - ev.tEnd) / ENDING_H); else f = 0;
    if (ev.state === 'suspended') f *= Math.max(0, 1 - (now - ev.suspendedAt) / 0.3); if (ev.state === 'cancelled' || ev.state === 'postponed' || ev.state === 'completed' || ev.state === 'cleanup' || ev.state === 'scheduled') f = 0;
    const w = this.g.atmos.w || {}; const wk = 1 - Math.min(0.55, (w.rain || 0) * 0.6); return Math.max(0, Math.min(1, f * wk * ev.attendK));
  }
  attendance(ev) { return Math.round(ev.peak * this.frac(ev)); }
  acceptsVisitors(ev) { return (ev.state === 'active' || ev.state === 'paused' || (ev.state === 'preparation' && this.now >= ev.t0 - 0.5)) && !ev.cancelled; }
  // ------------------------------------------------------------------------------------------------ lifecycle
  note(ev, text, at = null) { const t = at ?? this.now; ev.notes.push({ at: t, text: `${hourLabel(((t % 24) + 24) % 24)} · ${text}` }); if (ev.notes.length > 12) ev.notes.shift(); }
  set(ev, s, why = '', at = null) { if (ev.state === s) return; const from = ev.state; ev.state = s; this.stats.transitions++; if (why) this.note(ev, why, at); /* (a transition caught up after a time skip is stamped with the time it was due) */ const site = this.sites.get(ev.id); this.onState(ev, from, s, site); }
  onState(ev, from, s, site) {
    if (!site) return;
    if (s === 'active' && from === 'preparation') { site.evacuating = false; if (this.near(site, 90)) this.announce(site, 'ce.stage.mcWelcome', 24); }
    if (s === 'active' && (from === 'paused' || from === 'suspended')) { site.evacuating = false; this.announce(site, 'ce.safe.annResume', 26); }
    if (s === 'paused') { this.shot(site, 'ce.safe.musicCut', site.watch.x, site.watch.z, 22, 1, 4); this.announce(site, 'ce.safe.annPause', 26); }
    if (s === 'suspended') { site.evacuating = true; this.shot(site, 'ce.safe.musicCut', site.watch.x, site.watch.z, 22, 1, 4); this.announce(site, 'ce.safe.annSuspend', 30); for (const a of site.visitors) if (a.alive() && a.p.state === 'job') a.goEvac(site.lastTrouble); this.securityToExits(site); }
    if (s === 'ending' && from === 'active') { this.announce(site, 'ce.stage.mcThanks', 24); if (ev.T.id === 'nye') this.shot(site, 'ce.cult.countdown', site.watch.x, site.watch.z, 30, 1, 60); }
    if (s === 'cleanup' && ev.cancelled && from !== 'ending') { this.announce(site, 'ce.safe.annCancel', 30); site.evacuating = true; for (const a of site.visitors) if (a.alive() && a.p.state === 'job' && a.phase !== 'leave') a.leave(); }
  }
  step(ev, now) { // one transition if due; returns true when something changed. Caught up after a time skip: no timeline note
    const s = ev.state;
    if (s === 'scheduled') { if (now >= ev.tPrep) { const wx = this.g.atmos.target || this.g.atmos.weather; if (wx === 'storm' && now < ev.t0) { this.postpone(ev, 'Monsoon thunderstorm forecast at set-up time'); return true; } this.set(ev, 'preparation', 'Set-up started', ev.tPrep); return true; } return false; }
    if (s === 'preparation') { if (now >= ev.t0) { this.set(ev, 'active', 'Event started', ev.t0); return true; } return false; }
    if (s === 'active') { if (now >= ev.tEnd) { this.set(ev, 'ending', 'Programme finished — the crowd is leaving', ev.tEnd); return true; } return false; }
    if (s === 'paused') { if (now >= ev.tEnd) { this.set(ev, 'ending', 'Programme ended (it was paused)'); return true; } if (now >= ev.pauseUntil) { this.set(ev, 'active', 'Programme resumed'); return true; } return false; }
    if (s === 'suspended') { const calm = now - ev.calmSince; if (calm >= 0.5) { if (ev.tEnd - now >= 0.75 && ev.disturb < 3) { ev.attendK *= 0.6; this.set(ev, 'active', 'Resumed after the suspension'); } else this.cancel(ev, ev.tEnd - now < 0.75 ? 'Not enough time left after the suspension' : 'Repeated incidents at the event'); return true; } if (now >= ev.tEnd) { this.cancel(ev, 'Suspended until the end of the programme'); return true; } return false; }
    if (s === 'ending') { if (now >= ev.tCleanStart) { this.set(ev, 'cleanup', 'Clean-up started', ev.tCleanStart); return true; } return false; }
    if (s === 'cleanup') { if (now >= ev.tCleanEnd) { this.set(ev, ev.cancelled ? 'cancelled' : 'completed', ev.cancelled ? 'Site cleared' : 'Site cleared — event completed', ev.tCleanEnd); return true; } return false; }
    return false;
  }
  cancel(ev, why) {
    if (ev.state === 'cancelled' || ev.state === 'completed') return false; ev.cancelled = true; ev.reason = why;
    if (ev.state === 'scheduled') { this.set(ev, 'cancelled', `Cancelled — ${why}`); return true; }
    if (ev.state === 'cleanup') { this.note(ev, `Cancelled — ${why}`); return true; }
    const now = this.now; ev.tCleanStart = Math.min(ev.tCleanStart, now); ev.tCleanEnd = ev.tCleanStart + ev.clean; this.set(ev, 'cleanup', `Cancelled — ${why}`); return true;
  }
  postpone(ev, why) { // the same event the next day if its venue is free then, otherwise cancelled
    const day = ev.day + 1; const nv = this.make(ev.T, day, ev.start, ev.venue, { id: `${ev.T.id}-d${day}r` }); ev.cancelled = true; ev.reason = why;
    if (nv && this.windowFree(ev.venue, nv.tPrep, nv.tCleanEnd, ev) && !this.byId.has(nv.id)) { nv.notes.push({ at: this.now, text: `Rescheduled from ${dateLabel(ev.day)} (${why.toLowerCase()})` }); this.add(nv); ev.resched = nv.id; this.set(ev, 'postponed', `Postponed to ${dateLabel(day)} — ${why}`); return nv; }
    this.set(ev, 'cancelled', `Cancelled — ${why}`); return null;
  }
  suspend(ev, why) { if (!SHOW.has(ev.state) || ev.state === 'ending') return false; ev.suspendedAt = this.now; ev.calmSince = this.now; if (ev.state !== 'suspended') this.set(ev, 'suspended', `Suspended — ${why}`); else this.note(ev, why); return true; }
  pause(ev, why, mins = 8) { if (ev.state !== 'active' && ev.state !== 'paused') return false; ev.pauseUntil = Math.max(ev.pauseUntil || 0, this.now + mins / 60); if (ev.state !== 'paused') this.set(ev, 'paused', `Paused — ${why}`); return true; }
  // ------------------------------------------------------------------------------------------------ disturbances (Crowd.alarm hook)
  onAlarm(x, z, r, sev, kind, byPlayer, src) {
    if (!this.ready) return; for (const [id, site] of this.sites) { const ev = this.byId.get(id); if (!ev || !BUILT.has(ev.state)) continue;
      const d = Math.hypot(x - site.cx, z - site.cz) - site.R; const reach = sev >= 2 ? Math.max(35, r * 0.5) : 14; if (d > reach) continue; if (!byPlayer && sev < 2) continue; // only the player's disturbances (and serious incidents) affect events
      this.stats.disturbances++; site.lastTrouble = { x, z, sev, kind }; ev.disturb++; const what = this.kindLabel(kind, sev);
      if (sev >= 2) { if (SHOW.has(ev.state) && ev.state !== 'ending') { if (ev.state === 'suspended') { ev.calmSince = this.now; if (ev.disturb >= 3) this.cancel(ev, `repeated incidents (${what})`); else this.note(ev, `Further incident: ${what}`); } else this.suspend(ev, what); } else if (ev.state === 'preparation') { this.note(ev, `Incident during set-up: ${what}`); if (ev.disturb >= 2) this.cancel(ev, `incident during set-up (${what})`); } }
      else if (ev.state === 'active' || ev.state === 'paused') this.pause(ev, what, 6 + 3 * Math.min(3, ev.disturb));
      else if (ev.state === 'suspended') ev.calmSince = this.now;
      // people notice; security reacts; organisers phone 119 (once a while) — the police / EMS of the game take it from there
      for (const a of site.visitors) if (a.alive() && a.p.state === 'job') a.notice({ sev }, { x, z, sev });
      this.securityRespond(site, x, z, sev);
      if (byPlayer && (sev >= 2 || ev.disturb >= 2) && (this.policeCd <= 0)) { this.policeCd = 40; this.g.bus?.emit('pedReport', { x, z, kind: 'event' }); this.note(ev, 'Organisers called the police (119)'); }
      if (this.near(site, 80)) this.shot(site, sev >= 2 ? 'ce.crowd.alarm' : 'ce.crowd.gasp', site.cx, site.cz, 20, 1, 6);
    }
  }
  kindLabel(kind, sev) { const k = String(kind || ''); if (k.includes('gun') || k.includes('shot')) return 'gunshots near the event'; if (k.includes('explo') || k.includes('blast')) return 'an explosion nearby'; if (k.includes('vehicle') || k.includes('car') || k.includes('crash')) return 'a vehicle driven into the event area'; if (k.includes('fight') || k.includes('scuffle') || k.includes('dispute') || k.includes('assault')) return 'a fight in the crowd'; return sev >= 2 ? 'a serious incident nearby' : 'a disturbance in the crowd'; }
  securityRespond(site, x, z, sev) {
    const sec = site.staff.filter((a) => a.role === 'security' && a.alive() && a.p.state === 'job'); if (!sec.length) return;
    if (sev >= 2) { this.securityToExits(site); return; }
    sec.sort((a, b) => Math.hypot(a.p.x - x, a.p.z - z) - Math.hypot(b.p.x - x, b.p.z - z)); for (const a of sec.slice(0, 2)) if (!a.task) a.give({ kind: 'respond', x, z, stop: 3 + Math.random() * 1.5, dur: 18 + Math.random() * 10 });
    const org = site.staff.find((a) => a.role === 'organiser' && a.alive() && !a.task); if (org) org.p.ch.anim.play('comms', 1);
  }
  securityToExits(site) { const sec = site.staff.filter((a) => a.role === 'security' && a.alive() && a.p.state === 'job'); sec.forEach((a, i) => { const e = i % 2 ? site.exitIn : site.gateIn; a.give({ kind: 'respond', x: e.x + (i > 1 ? 1.2 : 0), z: e.z, stop: 0.6, dur: 90 }); }); }
  // ------------------------------------------------------------------------------------------------ sound helpers (only recordings the player supplied; voice lines as subtitles otherwise)
  near(site, r) { const P = this.g.player; return Math.hypot(P.x - site.cx, P.z - site.cz) < r + site.R; }
  shot(site, id, x, z, ref = 12, k = 1, cd = 4, noFallback = false) {
    const t = performance.now() / 1000; const key = `${site.ev.id}|${id}`; if ((this.cool.get(key) || 0) > t) return false; this.voices = this.voices.filter((v) => v > t); if (this.voices.length >= 3) return false;
    this.cool.set(key, t + cd); if (!SoundBank.has(id)) return false; PlaceSound.shot(id, x, z, ref, k); this.voices.push(t + 2.5); this.stats.shots = (this.stats.shots || 0) + 1; return true;
  }
  announce(site, id, ref = 26) { const played = this.shot(site, id, site.watch.x, site.watch.z, ref, 1, 20); if (!played && VOICE[id] && this.near(site, 70) && (this.cool.get('sub|' + id + site.ev.id) || 0) < performance.now() / 1000) { this.cool.set('sub|' + id + site.ev.id, performance.now() / 1000 + 25); this.g.hud?.subtitle(id.startsWith('ce.safe') ? 'Event PA' : 'MC', VOICE[id], '', 6); } return played; }
  loop(key, slot, x, z, ref, lvl) { if (!slot || !SoundBank.has(slot)) return; this.loopKeys.add(key); PlaceSound.want(key, { id: slot, x, z, ref, lvl, fadeIn: 1.2, fadeOut: 1.5, out: 'amb' }); }
  stopLoops(prefix) { for (const L of [...PlaceSound.loops.values()]) if (L.key.startsWith(prefix + ':')) PlaceSound.release(L); for (const k of [...this.loopKeys]) if (k.startsWith(prefix + ':')) this.loopKeys.delete(k); }
  // one Character build a frame for the whole event system
  buildToken() { return this.tokenFrame !== this.frame || !this.tokenUsed; }
  useToken() { this.tokenFrame = this.frame; this.tokenUsed = true; }
  // ------------------------------------------------------------------------------------------------ traffic: slow zone at the entrance while people arrive / leave (never for responding units)
  zonesUpdate() {
    const T = this.g.traffic; if (!T) return; const out = []; const now = this.now;
    for (const ev of this.list) { if (!(ev.state === 'active' || ev.state === 'paused' || ev.state === 'suspended' || ev.state === 'ending' || (ev.state === 'preparation' && now > ev.t0 - 0.75))) continue; if (this.frac(ev) < 0.08 && ev.state !== 'ending' && ev.state !== 'suspended') continue; const e = ev.site.entry || ev.site; out.push({ x: e.x, z: e.z, r: ev.T.cap[1] > 5000 ? 70 : 50, v: 7, id: ev.id }); }
    this.zones = out; T.slowZones = out;
  }
  // ------------------------------------------------------------------------------------------------ per frame
  seenSite(site) { const cam = this.g.camera; if (!cam) return true; this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.pm); this.sphere.center.set(site.cx, site.s.base + 3, site.cz); this.sphere.radius = site.R + 6; return this.frustum.intersectsSphere(this.sphere); }
  targetTiers(ev) { const now = this.now; if (ev.state === 'preparation') { const u = (now - ev.tPrep) / ev.prep; return u >= 0.7 ? 3 : u >= 0.35 ? 2 : 1; } if (SHOW.has(ev.state)) return 3; if (ev.state === 'cleanup') { const v = (now - ev.tCleanStart) / Math.max(0.1, ev.tCleanEnd - ev.tCleanStart); return v < 0.25 ? 3 : v < 0.55 ? 2 : v < 0.9 ? 1 : 0; } return 0; }
  mk(what) { if (this.marks.length < 24) this.marks.push(what); } // what ran this frame (the frame-spike log: stats.spikes)
  update(dt) {
    this.marks.length = 0;
    if (!this.ready) this.reset(1); /* a game entered without newGame / load (test shortcuts): fresh calendar */ this.frame++; this.tokenUsed = this.tokenFrame === this.frame && this.tokenUsed; this.policeCd -= dt; const now = this.now;
    if (this.lastNow !== null && now - this.lastNow > 0.25) this.stats.timeJumps++;
    if (this.lastNow !== null && now < this.lastNow - 0.1) this.rewind(now); // the clock was set back (console / tests): states follow it
    this.lastNow = now;
    if (this.frame % 120 === 1) this.fill();
    for (const ev of this.list) { let n = 0; while (n++ < 8 && this.step(ev, now)); }
    if (this.frame % 30 === 2) this.zonesUpdate();
    const P = this.g.player, px = P.vehicle ? P.vehicle.x : P.x, pz = P.vehicle ? P.vehicle.z : P.z; const A = this.g.atmos; this.crowdExtra = 0; let built = false;
    for (const ev of this.list) {
      const s = ev.site; const d = Math.hypot(px - s.x, pz - s.z); let site = this.sites.get(ev.id); const want = BUILT.has(ev.state) && this.targetTiers(ev) > 0;
      if (!site && want && d < BUILD_R && !built && !this.g.indoor) { const t0 = performance.now(); this.mk('site'); site = new EventSite(this, ev); this.sites.set(ev.id, site); const ms = performance.now() - t0; this.stats.builds++; this.stats.buildMs += ms; this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, ms); built = true; continue; } // its structures follow on the next frames, one piece per frame (print atlas, tier 0, 1, 2)
      if (!site) continue; const seen = this.seenSite(site);
      if ((d > DROP_R || (!want && site.shown === 0)) && (!seen || d > DROP_R)) { site.dispose(); this.sites.delete(ev.id); this.stats.disposes++; continue; }
      const tt = this.targetTiers(ev); if (tt !== site.shown && (!seen || d > 300)) site.setTiers(tt);
      // the player's vehicle driven into a site with people: a disturbance by the player
      if (P.vehicle && SHOW.has(ev.state) && Math.abs(P.vehicle.speed || 0) > 2.5 && site.inside(px, pz, 0.5) && (this.vehCd = (this.vehCd || 0) - dt) <= 0) { this.vehCd = 12; this.g.crowd.alarm(px, pz, 30, 2, null, 'vehicle', true); }
      site.update(dt, { state: ev.state, frac: this.frac(ev), night: A.night || 0, dist: d, seen });
    }
    if (this.g.crowd) this.g.crowd.extraEv = this.crowdExtra;
  }
  rewind(now) { for (const ev of this.list) { if (ev.cancelled || ev.state === 'postponed') continue; if (now < ev.tPrep && ev.state !== 'scheduled') { const site = this.sites.get(ev.id); if (site) { site.dispose(); this.sites.delete(ev.id); } ev.state = 'scheduled'; ev.attendK = 1; ev.disturb = 0; } } }
  disposeAll() { for (const s of this.sites.values()) s.dispose(); this.sites.clear(); if (this.g.traffic) this.g.traffic.slowZones = []; if (this.g.crowd) this.g.crowd.extraEv = 0; }
  // ------------------------------------------------------------------------------------------------ app / console API
  status(ev) { if (ev.state === 'cleanup' && ev.cancelled) return 'Cancelled — clearing up'; if (ev.state === 'postponed') return `Postponed to ${ev.resched && this.byId.get(ev.resched) ? dateLabel(this.byId.get(ev.resched).day) : 'a later date'}`; return STATE_LABEL[ev.state] || ev.state; }
  crowdLabel(ev) { const n = this.attendance(ev); if (!n) return SHOW.has(ev.state) || ev.state === 'preparation' ? 'Gates not open yet' : '—'; const f = this.frac(ev); return `${n.toLocaleString('en-LK')} people · ${f > 0.85 ? 'very busy' : f > 0.55 ? 'busy' : f > 0.25 ? 'filling up' : 'quiet'}`; }
  view(ev) {
    const c = CATEGORIES[ev.T.cat] || {}; return { id: ev.id, title: ev.T.title, cat: c.name, catId: ev.T.cat, icon: c.icon, col: c.col, pal: ev.T.pal, desc: ev.T.desc, acts: ev.T.acts, info: ev.T.info, date: dateLabel(ev.day, true), dateShort: dateLabel(ev.day), start: hourLabel(ev.start), end: hourLabel(ev.start + ev.dur), venue: ev.venueName, venueShort: ev.venueShort,
      state: ev.state, status: this.status(ev), crowd: this.crowdLabel(ev), peak: ev.peak, attendance: this.attendance(ev), notes: ev.notes.slice(-5).map((n) => n.text), reason: ev.reason, at: ev.site.entry ? { x: ev.site.entry.x, z: ev.site.entry.z } : { x: ev.site.x, z: ev.site.z }, day: ev.day, built: this.sites.has(ev.id) };
  }
  // the app's sections: happening now (incl. paused / suspended / setting up today), today, upcoming, recent & completed
  sections() {
    const now = this.now, today = this.g.atmos.day || 1; const now_ = [], today_ = [], up = [], recent = [];
    for (const ev of this.list) { const live = SHOW.has(ev.state) || (ev.state === 'preparation'); if (live) now_.push(ev); else if (ev.state === 'scheduled' && ev.day === today) today_.push(ev); else if (ev.state === 'scheduled' && ev.day > today && ev.day <= today + 6) up.push(ev); else if ((ev.state === 'completed' || ev.state === 'cancelled' || ev.state === 'postponed' || ev.state === 'cleanup') && ev.tCleanEnd > now - 72 && ev.t0 <= now + 24 * 7) recent.push(ev); }
    recent.sort((a, b) => b.t0 - a.t0); return { now: now_, today: today_, upcoming: up, recent: recent.slice(0, 10) };
  }
  // ------------------------------------------------------------------------------------------------ save / load
  serialize() { return { v: 1, seed: this.seed, days: [...this.genDays], list: this.list.map((e) => ({ id: e.id, t: e.T.id, day: e.day, start: e.start, venue: e.venue, state: e.state, cancelled: e.cancelled, reason: e.reason, notes: e.notes, peak: e.peak, disturb: e.disturb, pauseUntil: e.pauseUntil, calmSince: e.calmSince, suspendedAt: e.suspendedAt, attendK: e.attendK, resched: e.resched || null, tCleanStart: e.tCleanStart, tCleanEnd: e.tCleanEnd })) }; }
  restore(d) {
    this.disposeAll(); if (!d || d.v !== 1) { this.reset(1); return; } this.seed = d.seed || 1; this.list = []; this.byId.clear(); this.genDays = new Set(d.days || []);
    for (const s of d.list || []) { const T = TYPE_BY_ID[s.t]; if (!T) continue; const ev = this.make(T, s.day, s.start, s.venue, { id: s.id }); if (!ev) continue; Object.assign(ev, { state: s.state, cancelled: !!s.cancelled, reason: s.reason || '', notes: s.notes || [], peak: s.peak || ev.peak, disturb: s.disturb || 0, pauseUntil: s.pauseUntil || 0, calmSince: s.calmSince || 0, suspendedAt: s.suspendedAt, attendK: s.attendK ?? 1, resched: s.resched });
      if (s.tCleanStart !== undefined && s.tCleanStart !== null) { ev.tCleanStart = s.tCleanStart; ev.tCleanEnd = s.tCleanEnd; } this.list.push(ev); this.byId.set(ev.id, ev); }
    this.list.sort((a, b) => a.t0 - b.t0); this.ready = true; this.lastNow = this.now; this.fill();
  }
  // console helpers
  find(q) { if (!q) return null; return this.byId.get(q) || this.list.find((e) => e.id.startsWith(q) || e.T.id === q && SHOW.has(e.state)) || this.list.find((e) => e.T.id === q && e.state === 'scheduled') || null; }
  // move an event to start now (+ lead hours) — for testing: keeps its venue, re-checks the window
  startNow(ev, lead = 0) { const A = this.g.atmos; const now = this.now; const d = Math.floor((now + lead) / 24) + 1; ev.day = d; ev.start = (now + lead) - (d - 1) * 24; this.times(ev); ev.state = 'scheduled'; ev.cancelled = false; ev.reason = ''; ev.attendK = 1; ev.disturb = 0; ev.notes.push({ at: now, text: `${hourLabel(A.hour)} · (test) moved to start ${lead ? 'in ' + lead.toFixed(2) + ' h' : 'now'}` }); this.list.sort((a, b) => a.t0 - b.t0); const site = this.sites.get(ev.id); if (site) { site.dispose(); this.sites.delete(ev.id); } return ev; }
  dateOf(day) { return dateOf(day); }
}
