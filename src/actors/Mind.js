// NPC minds: personality, emotions, memory, relationships and the world-event (stimulus) bus for the crowd.
//
// Every crowd pedestrian carries a Mind:
//  • personality — 10 traits (0..1): confidence, aggression, friendliness, intelligence, patience, curiosity, fearfulness,
//    sociability, honesty, risk tolerance. Derived from a seed with real correlations (fearful people are rarely
//    confident; elders are more patient and take fewer risks; tourists are curious but lost) so no two people are alike.
//  • emotions — 10 values (0..1): happiness, anger, fear, sadness, confusion, excitement, embarrassment, suspicion,
//    frustration, stress. Events push them; they relax back toward a baseline mood at per-person rates. The baseline
//    itself follows the world: rain, night, rush hour, being away from home.
//  • memory — at most MEM_CAP events (who, what, where, when, importance, good/bad). Importance fades with a half-life
//    that grows with how important it was; weak memories are dropped; a new memory replaces the weakest one.
//  • relationships — to each protagonist (like, fear, encounters, harassment, help) and up to TIE_CAP other residents.
//
// Residents: a person's identity is look × district ("the man in the blue sarong around Pettah"). Their mind is kept
// when they walk off-screen and comes back with them; PERSONA_CAP residents are kept, the most memorable SAVE_CAP go in the
// save game. Anyone who is not a resident (a second person with the same look in the same district, an adopted driver)
// gets a pooled anonymous mind that lives only as long as they do.
//
// Cost model (FPS first): nothing here runs per person per frame. Events are pushed once to the people in range (an O(n)
// pass per event, events are rare); each mind is "ticked" on a staggered schedule — every 0.3 s near the camera, 0.6 s
// at mid range, 1.5 s far, 3 s beyond 90 m (decay only) — and at most TICK_BUDGET minds per frame. Social look-ups use
// the crowd's existing 2 m neighbour grid; no per-frame allocation (minds and memory slots are pooled).
import * as L from '../world/Layout.js';
import { RNG } from '../core/rng.js';

export const TRAITS = ['confidence', 'aggression', 'friendliness', 'intelligence', 'patience', 'curiosity', 'fearfulness', 'sociability', 'honesty', 'risk'];
export const EMOS = ['happiness', 'anger', 'fear', 'sadness', 'confusion', 'excitement', 'embarrassment', 'suspicion', 'frustration', 'stress'];
const CONF = 0, AGG = 1, FRI = 2, INT = 3, PAT = 4, CUR = 5, FEARF = 6, SOC = 7, HON = 8, RISK = 9;
const HAP = 0, ANG = 1, FEA = 2, SAD = 3, CON = 4, EXC = 5, EMB = 6, SUS = 7, FRU = 8, STR = 9;
export const TI = { CONF, AGG, FRI, INT, PAT, CUR, FEARF, SOC, HON, RISK };
export const EI = { HAP, ANG, FEA, SAD, CON, EXC, EMB, SUS, FRU, STR };
export const MEM_CAP = 6, TIE_CAP = 4, PERSONA_CAP = 260, SAVE_CAP = 150;
const INCIDENT_CAP = 6, TICK_BUDGET = 14;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampR = (v, a, b) => (v < a ? a : v > b ? b : v);
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const VIOLENT = new Set(['gunshot', 'explosion', 'assault', 'threat', 'shot', 'punched', 'hitByCar', 'weapon']);
const GATHER = new Set(['accident', 'crash', 'fight', 'arrest']);

// emotional push of each kind of event at its source (scaled by distance), how strongly it draws the curious, how much it
// is worth remembering, and its severity (0 = background, 1 = disturbance, 2+ = danger)
const STIM = {
  gunshot: { e: [[FEA, 0.75], [STR, 0.6], [CON, 0.2], [EXC, 0.06]], mem: 0.7, sev: 2 },
  explosion: { e: [[FEA, 0.95], [STR, 0.8], [CON, 0.35]], mem: 0.9, sev: 3 },
  assault: { e: [[FEA, 0.5], [STR, 0.45], [ANG, 0.18], [SUS, 0.3]], mem: 0.55, sev: 3 },
  fight: { e: [[EXC, 0.35], [STR, 0.2], [FEA, 0.12], [SUS, 0.1]], mem: 0.3, sev: 1 },
  scuffle: { e: [[EXC, 0.2], [STR, 0.1], [SUS, 0.12]], mem: 0.15, sev: 1 },
  dispute: { e: [[EXC, 0.2], [CON, 0.1]], mem: 0.12, sev: 1 },
  accident: { e: [[FEA, 0.3], [SAD, 0.3], [STR, 0.4], [EXC, 0.15]], mem: 0.5, sev: 1 },
  crash: { e: [[FEA, 0.25], [STR, 0.3], [EXC, 0.3], [CON, 0.15]], mem: 0.35, sev: 1 },
  threat: { e: [[FEA, 0.55], [STR, 0.5]], mem: 0.6, sev: 1 },
  panic: { e: [[FEA, 0.2], [CON, 0.3], [STR, 0.15]], mem: 0, sev: 0 },
  siren: { e: [[STR, 0.1], [SUS, 0.08], [EXC, 0.06]], mem: 0, sev: 0 },
  horn: { e: [[FRU, 0.14], [STR, 0.05]], mem: 0, sev: 0 },
  arrest: { e: [[EXC, 0.25], [SUS, 0.2], [STR, 0.1]], mem: 0.3, sev: 1 },
  weapon: { e: [[FEA, 0.6], [STR, 0.5], [SUS, 0.2]], mem: 0.6, sev: 2 },
};
export const STIM_KINDS = Object.keys(STIM);
const SEV_KIND = ['panic', 'scuffle', 'gunshot', 'assault'];

export class Mind {
  constructor() {
    this.tr = new Float32Array(10); this.em = new Float32Array(10); this.base = new Float32Array(10); this.rate = new Float32Array(10);
    this.mem = []; for (let i = 0; i < MEM_CAP; i++) this.mem.push({ k: null, who: null, x: 0, z: 0, t: 0, imp: 0, val: 0, n: 0 });
    this.ties = []; this.rel = {}; this.reset();
  }
  reset() {
    this.pid = null; this.home = null; this.seed = 0; this.jit = 0.5; this.live = false; this.dead = false; this.tourist = false; this.p = null;
    this.em.fill(0); this.base.fill(0); for (const m of this.mem) { m.k = null; m.imp = 0; } this.ties.length = 0; this.rel = {};
    this.nextT = 0; this.lastT = -1; this.socialT = 0; this.recogT = 0; this.eyeT = 0; this.greetT = 0; this.placeT = 0; this.stareT = 0; this.panicT = 0; this.lastSeen = -1e9;
  }
}

// ------------------------------------------------------------------ personality
// sp: the look (age band, sex, profile). Elders patient and careful, young people bolder and more curious, tourists curious
// but unsure of themselves, vendors / shopkeepers sociable. Fearfulness and risk tolerance are tied to confidence.
export function genTraits(m, seed, sp = {}) {
  const r = new RNG(seed || 1), t = m.tr; const n = () => (r.next() + r.next() + r.next()) / 3; // bell-shaped around 0.5
  for (let i = 0; i < 10; i++) t[i] = n();
  const elder = sp.age === 'elder' || sp.band === 'senior', young = sp.band === 'young', prof = sp.profile || '', male = sp.sex === 'm';
  if (elder) { t[PAT] += 0.2; t[RISK] -= 0.25; t[AGG] -= 0.15; t[CONF] += 0.05; t[CUR] -= 0.05; }
  if (young) { t[RISK] += 0.15; t[CUR] += 0.1; t[PAT] -= 0.1; t[SOC] += 0.05; }
  if (male && !elder) t[AGG] += 0.06;
  if (prof === 'tourist') { t[CUR] += 0.25; t[CONF] -= 0.1; t[SOC] += 0.05; m.tourist = true; } else m.tourist = false;
  if (/vendor|shop|trader|conductor|tuk/.test(sp.preset || prof)) { t[SOC] += 0.18; t[FRI] += 0.1; t[CONF] += 0.08; }
  if (/security|construction|labour/.test(sp.preset || prof)) { t[CONF] += 0.1; t[RISK] += 0.06; }
  t[FEARF] = 0.62 * t[FEARF] + 0.38 * (1 - t[CONF]); t[RISK] = 0.6 * t[RISK] + 0.4 * t[CONF] - 0.15 * (t[FEARF] - 0.5);
  t[FRI] = 0.75 * t[FRI] + 0.25 * t[SOC]; t[AGG] = 0.8 * t[AGG] + 0.2 * (1 - t[PAT]);
  for (let i = 0; i < 10; i++) t[i] = clampR(t[i], 0.02, 0.98);
  // personal relaxation rates (per second): the confident shake off fear quickly; the impatient stay angry longer
  const R = m.rate; R[HAP] = 0.02; R[ANG] = 0.02 + 0.035 * t[PAT]; R[FEA] = 0.05 + 0.08 * t[CONF]; R[SAD] = 0.008; R[CON] = 0.06 + 0.1 * t[INT]; R[EXC] = 0.05;
  R[EMB] = 0.08 + 0.05 * t[CONF]; R[SUS] = 0.015 + 0.01 * t[FRI]; R[FRU] = 0.025 + 0.04 * t[PAT]; R[STR] = 0.02 + 0.02 * t[CONF];
  m.seed = seed >>> 0; m.jit = r.next();
}
// how strongly an emotion responds to a push, by personality
function gain(t, e) {
  switch (e) {
    case FEA: return 0.55 + 0.9 * t[FEARF] - 0.3 * t[CONF];
    case ANG: return 0.4 + 0.8 * t[AGG] - 0.3 * t[PAT];
    case HAP: return 0.6 + 0.4 * t[FRI];
    case SAD: return 0.5 + 0.3 * (1 - t[CONF]);
    case CON: return 0.8 - 0.5 * t[INT];
    case EXC: return 0.4 + 0.4 * t[CUR] + 0.3 * t[RISK];
    case EMB: return 0.4 + 0.5 * (1 - t[CONF]) + 0.2 * t[SOC];
    case SUS: return 0.4 + 0.4 * (1 - t[FRI]) + 0.3 * t[INT];
    case FRU: return 0.5 + 0.6 * (1 - t[PAT]);
    default: return 0.5 + 0.5 * t[FEARF]; // stress
  }
}
// push an emotion (saturating: the closer to 1, the less a further push adds); negative amounts calm it
export function feel(m, e, amt) { if (!m) return; const v = m.em[e]; m.em[e] = amt >= 0 ? clamp01(v + amt * gain(m.tr, e) * (1 - v)) : clamp01(v + amt); }
// relax every emotion toward its baseline over el seconds
function relax(m, el) { if (el <= 0) return; const E = m.em, B = m.base, R = m.rate; for (let i = 0; i < 10; i++) E[i] += (B[i] - E[i]) * (1 - Math.exp(-R[i] * el)); }

// ------------------------------------------------------------------ memory
const memHalf = (imp) => 240 + imp * imp * 5400; // seconds of game clock: a trivial thing ~4 min, a shooting ~1.5 h
export function memNow(e, now) { return e.k ? e.imp * Math.pow(0.5, Math.max(0, now - e.t) / memHalf(e.imp)) : 0; }
export function remember(m, k, who, x, z, now, imp, val) {
  if (!m || imp <= 0.02) return null; let slot = null, weakest = null, wv = Infinity;
  for (const e of m.mem) {
    if (e.k === k && e.who === who && now - e.t < 90 && Math.abs(e.x - x) + Math.abs(e.z - z) < 30) { slot = e; break; } // the same incident: strengthen, don't duplicate
    const v = memNow(e, now); if (v < wv) { wv = v; weakest = e; }
  }
  if (slot) { slot.imp = Math.min(1, Math.max(memNow(slot, now), imp) + imp * 0.2); slot.t = now; slot.n++; slot.val = (slot.val + val) / 2; return slot; }
  if (!weakest || wv > imp) return null; // everything remembered matters more than this
  Object.assign(weakest, { k, who, x, z, t: now, imp: Math.min(1, imp), val, n: 1 }); return weakest;
}
export function recall(m, k, who, now) { let s = 0; for (const e of m.mem) if (e.k && (k === null || e.k === k) && (who === undefined || e.who === who)) s += memNow(e, now); return s; }
function pruneMem(m, now) { for (const e of m.mem) if (e.k && memNow(e, now) < 0.03) { e.k = null; e.imp = 0; } }
export function memories(m, now) { return m.mem.filter((e) => e.k).map((e) => ({ what: e.k, who: e.who, imp: +memNow(e, now).toFixed(2), val: +e.val.toFixed(2), n: e.n, ago: Math.round(now - e.t), at: [Math.round(e.x), Math.round(e.z)] })); }

// ------------------------------------------------------------------ relationships
export function rel(m, hero) { return m.rel[hero] || (m.rel[hero] = { like: 0, fear: 0, n: 0, harass: 0, helped: 0, crimes: 0, last: -1e9 }); }
export function tieOf(m, pid, make = false) {
  if (!pid || pid === m.pid) return null; for (const t of m.ties) if (t.pid === pid) return t; if (!make) return null;
  if (m.ties.length >= TIE_CAP) { let w = 0; for (let i = 1; i < m.ties.length; i++) if (Math.abs(m.ties[i].aff) < Math.abs(m.ties[w].aff)) w = i; m.ties.splice(w, 1); }
  const t = { pid, aff: 0, n: 0 }; m.ties.push(t); return t;
}
export function affinity(m, pid) { const t = tieOf(m, pid); return t ? t.aff : 0; }
// neighbours already know a few people in their own district before the player ever arrives (~1 pair in 8: deterministic,
// so the same two residents are always acquainted); real meetings (bond) then take over
export function knownAff(m, om) { if (!m.pid || !om.pid) return 0; const t = tieOf(m, om.pid); if (t) return t.aff; if (!m.home || m.home !== om.home) return 0;
  const h = hashStr(m.pid < om.pid ? m.pid + '|' + om.pid : om.pid + '|' + m.pid); return (h & 7) === 0 ? 0.22 + ((h >>> 3) & 7) * 0.03 : 0; }
export function bond(a, b, d) { if (!a || !b || !a.pid || !b.pid) return; const ta = tieOf(a, b.pid, true), tb = tieOf(b, a.pid, true); ta.aff = clampR(ta.aff + d, -1, 1); tb.aff = clampR(tb.aff + d, -1, 1); ta.n++; tb.n++; }

// ------------------------------------------------------------------ expression
// the strongest feeling that shows on the face (null = keep neutral); thresholds sit above the ordinary baseline
export function moodOf(m) {
  const E = m.em; let best = null, bv = 0.34;
  if (E[FEA] > bv) { bv = E[FEA]; best = 'fear'; }
  if (E[ANG] > bv) { bv = E[ANG]; best = 'angry'; }
  if (E[FRU] * 0.85 > bv) { bv = E[FRU] * 0.85; best = 'angry'; }
  if (E[SAD] > bv) { bv = E[SAD]; best = 'sad'; }
  if (E[CON] > bv) { bv = E[CON]; best = 'confused'; }
  if (E[SUS] > bv) { bv = E[SUS]; best = 'suspicious'; }
  if (E[EMB] > bv) { bv = E[EMB]; best = 'embarrassed'; }
  if (E[EXC] > bv) { bv = E[EXC]; best = 'excited'; }
  if (E[STR] * 0.9 > bv) { bv = E[STR] * 0.9; best = 'concern'; }
  if (!best && E[HAP] > 0.6) best = 'smile';
  return best || 'neutral';
}
// voice for the dialogue blip: pitch / tempo / loudness by emotion
export function voiceTone(m) {
  if (!m) return null; const E = m.em;
  return { pitch: clampR(1 + 0.22 * E[FEA] + 0.1 * E[EXC] + 0.06 * E[HAP] - 0.12 * E[SAD] - 0.08 * E[ANG], 0.8, 1.3), rate: clampR(1 + 0.35 * E[FEA] + 0.3 * E[ANG] + 0.15 * E[EXC] - 0.25 * E[SAD], 0.75, 1.45), vol: clampR(1 + 0.6 * E[ANG] + 0.3 * E[FEA] - 0.3 * E[SAD], 0.6, 1.7) };
}

// ------------------------------------------------------------------ choosing a response to a witnessed event
// weighted by personality and current feelings; ~same situation, different people, different choices
export function responseWeights(m, sev, d, kind, sp, out) {
  const t = m ? m.tr : null, E = m ? m.em : null; out.length = 0;
  const T = (i) => (t ? t[i] : 0.5), F = (i) => (E ? E[i] : 0.1); const adult = !sp || sp.age !== 'elder';
  if (sev <= 1) {
    out.push(['look', 1.8 + 1.6 * (1 - T(CUR))], ['watch', 1.2 + 2.5 * T(CUR)], ['comment', 0.5 + 1.5 * T(SOC)], ['avoid', 0.4 + 2.5 * T(FEARF) + 2 * F(FEA)]);
    out.push(['film', adult ? (0.15 + 2.2 * T(CUR) * T(RISK)) * (m && m.tourist ? 1.6 : 1) : 0.05]);
    if (GATHER.has(kind) && d > 3) out.push(['gather', 0.5 + 4 * T(CUR) * (1 - 0.5 * T(FEARF))]);
    if (kind === 'accident') out.push(['help', 0.3 + 3 * T(FRI) * T(HON) * (1 - F(FEA))], ['report', 0.2 + 1.4 * T(HON) * T(INT)]);
    if (kind === 'fight' || kind === 'scuffle') out.push(['report', 0.1 + 1.2 * T(HON) * T(INT) * (d > 8 ? 1 : 0.4)]);
    if (kind === 'threat') out.push(['flee', 1 + 3 * T(FEARF)], ['report', 0.3 + 1.5 * T(HON) * (1 - F(FEA))]);
  } else {
    out.push(['flee', 3 + 3 * T(FEARF) + 2 * F(FEA)], ['cower', 0.8 + 2.2 * T(FEARF) * (1 - T(RISK))], ['hide', 0.7 + 1.8 * T(INT)], ['freeze', 0.3 + 1.2 * (1 - T(INT)) * (0.5 + F(CON))]);
    out.push(['report', (d > 15 ? 1.1 : 0.3) + 1.5 * T(HON) * T(INT) * (1 - F(FEA))], ['film', (d > 25 ? 0.6 : 0.04) * 2 * T(RISK) * T(CUR)]);
  }
  return out;
}
// a gesture only interrupts 'soft' upper-body actions — never an umbrella, a phone call, a carried load, a job or a seat
const SOFT = new Set(['talk', 'listen', 'look', 'crossarms', 'hips', 'argue', 'laugh', 'nod', 'wave', 'shrug', 'glance', 'point', 'clap']);
function gest(p, a, dur) { const A = p.ch.anim; if (!A || (A.action && !SOFT.has(A.action)) || p.sit || p.job) return false; A.play(a, dur); return true; }
export function pickWeighted(list, u) { let s = 0; for (const it of list) s += Math.max(0, it[1]); let v = u * s; for (const it of list) { v -= Math.max(0, it[1]); if (v <= 0) return it[0]; } return list.length ? list[list.length - 1][0] : null; }
// how long before this person reacts: farther, slower thinkers and the incurious react later; fright speeds it up
export function reactDelay(m, sev, d, u) {
  const t = m ? m.tr : null, f = m ? m.em[FEA] : 0;
  return Math.max(0.08, 0.12 + u * (sev >= 2 ? 0.6 : 1.2) + d * 0.035 + 0.35 * (1 - (t ? t[INT] : 0.5)) + (sev <= 1 ? 0.25 * (1 - (t ? t[CUR] : 0.5)) : 0) - 0.15 * f);
}

// ================================================================== the system (owned by Crowd)
export class MindSystem {
  constructor(crowd) {
    this.C = crowd; this.rng = new RNG(4242); this.personas = new Map(); this.pool = []; this.incidents = []; this.enabled = true;
    this.stats = { stim: 0, ticks: 0, social: 0, greet: 0, chats: 0, laughs: 0, argues: 0, gossip: 0, gather: 0, recog: 0, avoid: 0, rage: 0, evicted: 0, tickMs: 0 };
    this.sirenT = 0; this.panicBudget = 4; this.ticksThisFrame = 0; this._w = []; this.hero = 'dineth';
  }
  now() { return this.C.simTime ?? this.C.t; }
  // ---- identity
  attach(p, opts = {}) {
    const C = this.C, sp = p.sp || {}; let m = null; const dist = opts.district ?? L.districtIdAt(p.x, p.z);
    const k = sp._k; const pid = k !== undefined && dist ? `${k}@${dist}` : null;
    if (pid && !opts.anon) { const old = this.personas.get(pid); if (old && !old.live && !old.dead) { m = old; if (m.needTraits && p.sp) { genTraits(m, hashStr(pid), sp); m.needTraits = false; } } else if (!old) { m = new Mind(); m.pid = pid; m.home = dist; genTraits(m, hashStr(pid), sp); this.personas.set(pid, m); this.evict(); } }
    if (!m) { m = this.pool.pop() || new Mind(); m.reset(); genTraits(m, opts.seed ?? ((this.rng.next() * 4294967296) >>> 0), sp); m.home = opts.home ?? null; }
    const now = this.now(); m.live = true; m.p = p; this.baseline(m, p); if (m.lastT < 0) m.em.set(m.base); else relax(m, Math.min(3600, now - m.lastT)); m.lastT = now;
    m.nextT = C.t + m.jit * 0.5; p.mind = m;
    const t = m.tr; p.temper = clamp01(0.75 * t[AGG] + 0.25 * (1 - t[PAT])); // the crowd's older temper value now comes from the personality
    return m;
  }
  detach(p) { if (p.ch && p.ch.anim) p.ch.anim.emo = null; p.emoPace = 1; const m = p.mind; if (!m) return; m.live = false; m.p = null; p.mind = null; if (!m.pid) this.pool.push(m); else pruneMem(m, this.now()); }
  died(p) { const m = p.mind; if (!m) return; if (m.pid) { m.dead = true; m.deadAt = this.now(); } }
  // keep at most PERSONA_CAP residents: drop the least memorable ones that are not on the street
  evict() {
    if (this.personas.size <= PERSONA_CAP) return; const now = this.now(); let worst = null, wv = Infinity;
    for (const m of this.personas.values()) { if (m.live) continue; const v = this.worth(m, now); if (v < wv) { wv = v; worst = m; } }
    if (worst) { this.personas.delete(worst.pid); this.stats.evicted++; }
  }
  worth(m, now) { let v = recall(m, null, undefined, now); for (const h in m.rel) { const r = m.rel[h]; v += Math.abs(r.like) + r.fear + r.n * 0.05; } for (const t of m.ties) v += Math.abs(t.aff) * 0.5; return v + 1e-6 * (m.lastT || 0); }
  // ---- context baseline: weather, time of day, rush hour, home ground
  baseline(m, p) {
    const C = this.C, t = m.tr, B = m.base, h = C.hour ?? 12, night = C.night || 0, rain = C.rain ? 1 : 0;
    const rush = (h >= 7 && h < 9.5) || (h >= 16.5 && h < 19) ? 1 : 0; const away = m.tourist ? 1 : m.home && p && L.districtIdAt(p.x, p.z) !== m.home ? 0.5 : 0;
    const wet = rain && p && !p.umbrellaOpen && !p.indoorShelter ? 1 : 0;
    B[HAP] = clamp01(0.32 + 0.2 * t[FRI] + 0.1 * t[SOC] - 0.1 * rain - 0.08 * wet - 0.06 * night * t[FEARF] + (h >= 17 && h < 21 && !rain ? 0.05 : 0));
    B[ANG] = 0.02 + 0.04 * t[AGG]; B[FEA] = clamp01(0.02 + 0.14 * night * t[FEARF] + 0.04 * away * (1 - t[CONF]));
    B[SAD] = 0.03 + 0.05 * rain * (1 - t[CONF]); B[CON] = 0.02 + 0.16 * away * (1 - t[INT] * 0.5); B[EXC] = 0.03 + 0.04 * t[CUR] * (1 - rain);
    B[EMB] = 0.01; B[SUS] = clamp01(0.04 + 0.1 * night + 0.06 * (1 - t[FRI])); B[FRU] = clamp01(0.03 + 0.12 * wet * (1 - t[PAT]) + 0.06 * rush * (1 - t[PAT]));
    B[STR] = clamp01(0.06 + 0.16 * rush * (1 - t[PAT]) + 0.08 * rain + 0.12 * night * t[FEARF] + 0.08 * away * (1 - t[CONF]));
    const hero = this.hero; const r = m.rel[hero]; if (r && p && C.player) { const d = Math.hypot(C.player.x - p.x, C.player.z - p.z); if (d < 20) { B[SUS] = clamp01(B[SUS] + 0.25 * r.fear + Math.max(0, -r.like) * 0.2); B[FEA] = clamp01(B[FEA] + 0.3 * r.fear); B[HAP] = clamp01(B[HAP] + Math.max(0, r.like) * 0.15); } }
  }
  // ---- once per frame (from Crowd.update): budgets, siren scan, incidents
  update(dt, ctx) {
    if (!this.enabled) return; this.ticksThisFrame = 0; this.panicBudget = Math.min(6, this.panicBudget + dt * 4); if (ctx.hero) this.hero = ctx.hero;
    const now = this.now(); for (let i = this.incidents.length - 1; i >= 0; i--) if (now > this.incidents[i].until) this.incidents.splice(i, 1);
    this.sirenT -= dt; if (this.sirenT <= 0) { this.sirenT = 1; const f = this.C.focus; // emergency vehicles with lights on: one 'siren' event each per second
      if (f) for (const v of this.C.vehicles || []) if (v.beaconsOn && Math.abs(v.x - f.x) < 140 && Math.abs(v.z - f.z) < 140) this.stimulus('siren', v.x, v.z, 55, 0, null); }
  }
  incident(kind, x, z, life = 40) {
    const now = this.now(); for (const I of this.incidents) if (Math.abs(I.x - x) + Math.abs(I.z - z) < 12) { I.until = Math.max(I.until, now + life); if (GATHER.has(kind)) I.kind = kind; return I; }
    if (this.incidents.length >= INCIDENT_CAP) this.incidents.shift(); const I = { kind, x, z, t: now, until: now + life, n: 0, help: 0 }; this.incidents.push(I); return I;
  }
  incidentAt(x, z, r = 14) { for (const I of this.incidents) if (Math.abs(I.x - x) < r && Math.abs(I.z - z) < r) return I; return null; }
  // ---- an event in the world: feelings + memories for everyone in range (reactions are queued by Crowd.alarm)
  stimulus(kind, x, z, r, sev, src, byPlayer = false) {
    if (!this.enabled) return; const S = STIM[kind] || STIM[SEV_KIND[Math.min(3, sev | 0)]]; if (!S) return; this.stats.stim++;
    const now = this.now(), hero = this.hero, r2 = r * r; const who = byPlayer ? hero : null; const C = this.C; const glance = kind === 'siren' || kind === 'horn'; let pt = null;
    if (GATHER.has(kind)) this.incident(kind, x, z, kind === 'arrest' ? 30 : 45);
    for (const p of this.C.peds) {
      const m = p.mind; if (!m || p === src || p.dead) continue; const dx = p.x - x, dz = p.z - z, d2 = dx * dx + dz * dz; if (d2 > r2) continue;
      const k = Math.pow(1 - Math.sqrt(d2) / r, 0.7); for (const [e, a] of S.e) feel(m, e, a * k);
      if (S.mem && k * S.mem > 0.1) remember(m, kind, who, x, z, now, S.mem * k, VIOLENT.has(kind) ? -0.8 : -0.2);
      if (glance && d2 < r2 * 0.4 && !(p.lookT > 0) && C.isRoutine(p.state) && this.rng.next() < 0.12 + 0.45 * m.tr[CUR]) { // some heads turn, not all
        p.lookT = 0.8 + this.rng.next() * 1.6; p.lookAtPt = pt || (pt = { x, z }); if (kind === 'siren' && this.rng.next() < 0.05 * (0.5 + m.tr[SOC]) && C.speak) C.speak(p, 'siren', 0); }
      if (byPlayer && VIOLENT.has(kind) && d2 < 900) { const R = rel(m, hero); R.fear = clamp01(R.fear + 0.35 * k * (0.6 + m.tr[FEARF])); R.like = clampR(R.like - 0.3 * k, -1, 1); R.crimes++; R.last = now; } // they saw who did it
    }
  }
  // fright is contagious: someone sprinting away in panic unsettles the people around them (bounded: per-person cooldown + global budget)
  contagion(p) { const m = p.mind; if (!m || this.panicBudget < 1 || this.C.t < m.panicT) return; m.panicT = this.C.t + 4; this.panicBudget--; this.stimulus('panic', p.x, p.z, 7, 0, p); }
  // ---- the staggered per-person update
  tick(p, dist) {
    const m = p.mind, C = this.C; if (!m) return;
    if (this.ticksThisFrame >= TICK_BUDGET) { m.nextT = C.t + 0.03 + m.jit * 0.05; return; } this.ticksThisFrame++; this.stats.ticks++;
    const iv = dist < 25 ? 0.3 : dist < 45 ? 0.6 : dist < 90 ? 1.5 : 3; m.nextT = C.t + iv * (0.8 + 0.4 * this.rng.next());
    const now = this.now(), el = m.lastT < 0 ? 0 : Math.min(30, Math.max(0, now - m.lastT)); m.lastT = now;
    this.baseline(m, p); relax(m, el);
    if (dist > 90) return; // far: feelings keep evolving, nothing visible to drive
    this.express(p, m);
    if (C.rain && !p.umbrellaOpen && (p.state === 'walk' || p.state === 'toPoi')) { feel(m, FRU, 0.02 * el); feel(m, SAD, 0.006 * el); }
    if (p.state === 'gather' && m.em[FEA] > 0.45 + 0.3 * m.tr[CONF]) { C.react(p, 'recover', 2.5 + this.rng.next() * 2, { fleeDir: p.gather ? norm2(p.x - p.gather.x, p.z - p.gather.z) : null }); C.speak(p, 'scared', 0); } // the scene turned dangerous: the timid leave first
    if (dist > 45) return;
    if (C.t > m.placeT) { m.placeT = C.t + 5 + this.rng.next() * 3; this.placeMemory(p, m, now); }
    this.social(p, m); this.aware(p, m, dist, now);
  }
  // face, posture, walking pace
  express(p, m) {
    const E = m.em, t = m.tr, A = p.ch.anim, face = p.ch.face, C = this.C;
    p.emoPace = clampR(1 + 0.32 * Math.max(E[FEA], E[STR] * 0.55) + 0.1 * E[ANG] + 0.08 * E[EXC] - 0.16 * E[SAD] + 0.04 * E[HAP] + 0.06 * E[FRU], 0.82, 1.35);
    const T = A.emo || (A.emo = { slump: 0, tense: 0, proud: 0, agit: 0, shake: 0 });
    T.slump = clamp01(E[SAD] * 1.3 + (1 - t[CONF]) * 0.12 - E[HAP] * 0.25); T.tense = clamp01(Math.max(E[FEA], E[STR] * 0.7) * 1.1 - 0.05);
    T.proud = clamp01(t[CONF] * 0.55 + E[HAP] * 0.35 - E[SAD] - E[FEA] - 0.2); T.agit = clamp01(E[ANG] * 1.1 + E[FRU] * 0.4 - 0.05); if (T.shake > 0) T.shake = Math.max(0, T.shake - 0.25);
    if (face && (C.isRoutine(p.state) || p.state === 'scene' || p.state === 'gather')) { const md = moodOf(m); if (face.mood !== md) { face.mood = md; if (face.exprT <= 0) face.expr = md; } }
  }
  // walking past a place where they saw something bad happen: uneasy
  placeMemory(p, m, now) { for (const e of m.mem) { if (!e.k || !VIOLENT.has(e.k)) continue; const v = memNow(e, now); if (v < 0.25) continue; if (Math.abs(e.x - p.x) < 25 && Math.abs(e.z - p.z) < 25) { feel(m, STR, 0.08 * v); feel(m, SUS, 0.08 * v); } } }
  // ---- people meeting people (near the camera only; uses the crowd's 2 m grid)
  social(p, m) {
    const C = this.C; if (C.t < m.socialT || p.state !== 'walk' || p.crossing || p.toKerb || p.jog || p.keep || p.scene) return; /* (a walker heading for a crossing holds its place in the queue) */ m.socialT = C.t + 1.4 + this.rng.next() * 1.6;
    const grid = C._grid; if (!grid) return; const gi = Math.floor(p.x / 2), gj = Math.floor(p.z / 2); const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    for (let i = gi - 3; i <= gi + 3; i++) for (let j = gj - 3; j <= gj + 3; j++) {
      const a = grid.get(i * 10000 + j); if (!a) continue;
      for (const o of a) {
        if (o === p || !o.mind || o.dead || o.keep || o.scene) continue; const walking = o.state === 'walk' && !o.crossing && !o.toKerb && !o.jog; if (!walking && o.state !== 'idle') continue; /* (someone standing at a stall / stop can be greeted, not pulled into a walk-chat) */ const om = o.mind; const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz); if (d > 6 || d < 0.5) continue;
        if (dx * fx + dz * fz < 0) continue; // only someone ahead (coming towards / walking beside)
        const aff = knownAff(m, om);
        if (aff < -0.3) { this.stats.avoid++; p.lat = clampR((p.lat || 0) + ((dx * fz - dz * fx) > 0 ? -0.5 : 0.5), -0.9, 0.9); p.ch.face.set('suspicious', 1.5); feel(m, SUS, 0.15); return; } // someone they fell out with: a wide berth and a cold look
        const sameHome = m.home && m.home === om.home; const known = aff > 0.2;
        const want = known ? 0.8 : sameHome ? 0.1 + 0.3 * m.tr[SOC] * m.tr[FRI] : 0.035 * m.tr[SOC] * (C.hour > 6 && C.hour < 20 ? 1 : 0.4);
        if (C.t < m.greetT || C.t < om.greetT || this.rng.next() > want) continue;
        this.greet(p, o, aff, walking); return;
      }
    }
  }
  greet(p, o, aff, canChat = true) {
    const C = this.C, m = p.mind, om = o.mind; m.greetT = C.t + 25 + this.rng.next() * 30; om.greetT = C.t + 20; this.stats.greet++;
    p.lookT = 1.6; p.lookAtPt = o; p.ch.face.set('smile', 2); gest(p, this.rng.chance(0.5) ? 'wave' : 'nod', 1.1); feel(m, HAP, 0.12);
    const answers = om.tr[SOC] > 0.3 || aff > 0.15;
    if (answers) { o.lookT = 1.6; o.lookAtPt = p; o.ch.face.set('smile', 2); gest(o, this.rng.chance(0.4) ? 'wave' : 'nod', 1.0); feel(om, HAP, 0.1); bond(m, om, 0.06); if (aff > 0.2) C.speak(p, 'greetFriend', 0); else if (this.rng.chance(0.3)) C.speak(p, 'greet', 0); }
    else { feel(m, EMB, 0.4); p.ch.face.set('embarrassed', 2); gest(p, 'shrug', 1.0); bond(m, om, -0.02); return; } // greeted and ignored: awkward
    // friends (or two sociable neighbours in no hurry) stop for a chat
    const calm = m.em[STR] < 0.45 && om.em[STR] < 0.45 && !C.rain; const k = (aff > 0.2 ? 0.5 : 0.18) * (m.tr[SOC] + om.tr[SOC]) * 0.5 + aff * 0.3;
    if (calm && canChat && this.rng.next() < k) this.startChat(p, o);
  }
  startChat(a, b) {
    const q = { type: 'chat', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, used: 2, temp: true }; const dur = 8 + this.rng.next() * 16; this.stats.chats++;
    for (const [p, o] of [[a, b], [b, a]]) { if (p.phone) { p.phone.parent?.remove(p.phone); p.phone = null; } /* hang up to chat: a ped already posed this frame would otherwise keep the phone at the ear for a frame */ p.routine = { state: 'walk', target: p.target, node: p.node, nextNode: p.nextNode, edge: p.edge, poi: null, x: p.x, z: p.z, timer: 0, via: p.via, toKerb: p.toKerb, route: p.route, goalPoi: p.goalPoi, crossing: p.crossing }; /* the walk resumes afterwards (no re-plan) */ p.state = 'idle'; p.poi = q; p.timer = dur + this.rng.next() * 3; p.lookAt = { x: o.x, z: o.z }; p.chatWith = o; p.speaking = p === a; p.chatT = 1.5 + this.rng.next() * 2; p.ch.anim.set(p === a ? 'talk' : 'listen'); p.ch.face.talking = p === a; p.act = null; p.vx *= 0.3; p.vz *= 0.3; }
  }
  // one turn of a conversation ended (Crowd's chat code): laughter, an argument, gossip about what they saw, friendship
  chatTurn(p) {
    if (!this.enabled) return;
    const C = this.C, m = p.mind; if (!m) return; const o = p.chatWith && p.chatWith.poi === p.poi ? p.chatWith : this.partner(p); if (!o || !o.mind) return; const om = o.mind; p.chatWith = o;
    const aff = knownAff(m, om); const r = this.rng.next(); const now = this.now();
    const argueK = (aff < -0.15 ? 0.35 : 0.04) * (0.5 + m.tr[AGG]) * (1.5 - m.tr[PAT]) + 0.2 * m.em[FRU];
    const laughK = (0.06 + 0.3 * (m.em[HAP] + om.em[HAP])) * (0.5 + m.tr[FRI]) * (aff >= 0 ? 1 : 0.3);
    if (!p.speaking && r < argueK) { // disagreement: both raise their voices and gesture
      this.stats.argues++; for (const q of [p, o]) { q.ch.anim.set('argue'); q.ch.face.set('angry', 3); q.ch.anim.emo && (q.ch.anim.emo.shake = 1); feel(q.mind, ANG, 0.25); feel(q.mind, FRU, 0.2); } C.speak(p, 'argue', 0, 2.4); bond(m, om, -0.08);
      if (m.em[ANG] > 0.6 && m.tr[PAT] < 0.4) { p.timer = Math.min(p.timer, 0.5); feel(om, EMB, 0.2); } // storms off
      return;
    }
    if (!p.speaking && r < argueK + laughK) { this.stats.laughs++; for (const q of [p, o]) { if (this.rng.chance(0.75) || q === p) { gest(q, 'laugh', 1.4 + this.rng.next() * 0.8); q.ch.face.set('laugh', 1.8); feel(q.mind, HAP, 0.15); } } if (this.rng.chance(0.35)) C.speak(p, 'laugh', 0, 1.6); bond(m, om, 0.05); return; }
    if (p.speaking) {
      let best = null, bv = 0.25; for (const e of m.mem) { if (!e.k || e.k === 'heard' || e.k === 'talked') continue; const v = memNow(e, now); if (v > bv) { bv = v; best = e; } }
      if (best && this.rng.chance(0.45)) { // gossip: what they saw spreads (weaker) to the listener, including who did it
        this.stats.gossip++; C.speak(p, 'gossip', 0, 2.6); remember(om, 'heard', best.who, best.x, best.z, now, bv * 0.5, best.val); feel(om, SUS, 0.1 * bv); feel(om, EXC, 0.1);
        if (best.who) { const R = rel(om, best.who), Rm = m.rel[best.who]; if (Rm) R.like = clampR(R.like + 0.35 * Rm.like * bv, -1, 1); R.fear = clamp01(R.fear + 0.3 * (Rm ? Rm.fear : 0) * bv); }
      } else if (this.rng.chance(0.25)) C.speak(p, this.topic(p), 0);
    }
    bond(m, om, 0.015 + 0.02 * (m.tr[FRI] + om.tr[FRI]) * 0.5); remember(m, 'talked', om.pid, p.x, p.z, now, 0.12, 0.3);
  }
  topic(p) { const C = this.C; if (C.rain) return 'chatRain'; if ((C.hour ?? 12) >= 20 || (C.hour ?? 12) < 5) return 'chatNight'; const d = L.districtIdAt(p.x, p.z); if (d === 'pettah' || d === 'maradana') return 'chatMarket'; if (d === 'gfgreen' || d === 'gftowers') return 'chatSea'; return 'chat'; }
  partner(p) { const g = this.C._grid; if (!g || !p.poi) return null; const gi = Math.floor(p.x / 2), gj = Math.floor(p.z / 2); for (let i = gi - 2; i <= gi + 2; i++) for (let j = gj - 2; j <= gj + 2; j++) { const a = g.get(i * 10000 + j); if (a) for (const o of a) if (o !== p && o.poi === p.poi) return o; } return null; }
  // ---- the player: recognition, eye contact, avoidance, staring
  aware(p, m, dist, now) {
    const C = this.C, P = C.player; if (!P || P.vehicle || P.indoor || !C.isRoutine(p.state)) return; const dx = P.x - p.x, dz = P.z - p.z, pd = Math.hypot(dx, dz); if (pd > 16) { m.stareT = 0; return; }
    const R = m.rel[this.hero]; const facing = (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / (pd || 1);
    if (R && (R.n > 0 || R.crimes > 0) && C.t > m.recogT && facing > -0.3) {
      m.recogT = C.t + 18 + this.rng.next() * 10; if (this.rng.next() < 0.45 + 0.45 * m.tr[INT]) { this.stats.recog++; R.last = now;
        if (R.fear > 0.55 && pd < 12) { feel(m, FEA, 0.4); const crime = R.crimes > 0 && m.tr[HON] > 0.55 && this.rng.chance(0.5); C.speak(p, crime ? 'recognizeBad' : 'wary', 1); if (crime) C.react(p, 'report', 7, { fleeDir: norm2(-dx, -dz) }); else C.react(p, 'flee', 3 + this.rng.next() * 2, { fleeDir: norm2(-dx, -dz), fleeSp: 2.8 + this.rng.next() }); this.stats.avoid++; return; }
        if (R.like < -0.3 || R.harass >= 2) { feel(m, SUS, 0.3); p.ch.face.set('suspicious', 3); if (pd < 7) { C.react(p, 'complain', 3 + this.rng.next() * 2); C.speak(p, 'wary', 0); this.stats.avoid++; } else { p.lat = clampR((p.lat || 0) + ((dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw)) > 0 ? -0.6 : 0.6), -0.9, 0.9); } return; } // keeps away from someone who hassled them
        if (R.like > 0.25 && pd < 7) { feel(m, HAP, 0.2); p.lookT = 2; p.lookAtPt = null; p.ch.face.set('smile', 2.5); gest(p, 'wave', 1.2); C.speak(p, R.helped > 0 ? 'grateful' : 'rememberGood', 1); return; }
      }
    }
    if (pd < 5 && C.t > m.eyeT && facing > 0.2) { // eye contact: a friendly nod and smile, or a guarded glance away
      m.eyeT = C.t + 4 + this.rng.next() * 5; const warm = m.tr[FRI] > 0.5 && m.em[SUS] < 0.3 && m.em[FEA] < 0.3 && (!R || R.like >= 0);
      if (warm) { p.lookT = 1 + this.rng.next(); p.lookAtPt = null; if (m.em[HAP] > 0.4) p.ch.face.set('smile', 1.2); } else if (m.em[SUS] > 0.3 || m.em[FEA] > 0.25 || m.tr[FRI] < 0.3) { p.lookT = 0.4; p.lookAtPt = null; p.ch.face.set('suspicious', 1.4); }
    }
    if (pd < 1.7 && (p.state === 'idle' || p.state === 'waitCross') && (C.playerSpeed || 0) < 0.3) { // someone standing right up close and not moving
      m.stareT += 0.3; if (m.stareT > 3 + 3 * m.tr[PAT]) { m.stareT = -6; feel(m, EMB, 0.3); feel(m, SUS, 0.3); p.ch.face.set(m.tr[CONF] > 0.6 ? 'suspicious' : 'embarrassed', 2.5); C.speak(p, 'stare', 1); if (m.tr[CONF] < 0.5 && p.state === 'waitCross') { /* holds their place at the kerb */ } else if (m.tr[CONF] < 0.5) C.react(p, 'complain', 2); }
    } else if (m.stareT > 0) m.stareT = 0;
  }
  // ---- player interactions with this person (Crowd.interact / punched / threaten / EMS)
  // two strangers doing the sidestep dance on the pavement: a sheepish smile / shrug, or a mutter from the impatient
  awkward(p, o) {
    const m = p.mind; if (!m) return; const t = m.tr; const C = this.C; feel(m, EMB, 0.2); feel(m, FRU, 0.1 * (1 - t[PAT]));
    if (t[PAT] < 0.35 && t[AGG] > 0.55) { p.ch.face.set('angry', 1.5); if (C.speak) C.speak(p, 'excuse', 0); }
    else { p.ch.face.set(this.rng.chance(0.6) ? 'embarrassed' : 'smile', 1.6); if (this.rng.chance(0.5)) gest(p, 'shrug', 0.9); if (this.rng.chance(0.35) && C.speak) C.speak(p, 'awkward', 0); }
    p.lookT = 0.8; p.lookAtPt = o; if (o.mind) bond(m, o.mind, 0.01);
  }
  playerAct(p, kind) {
    const m = p.mind; if (!m) return null; const R = rel(m, this.hero), now = this.now(); R.n++; R.last = now; const C = this.C; let witnesses = 0;
    for (const o of C.peds) if (o !== p && o.mind && Math.abs(o.x - p.x) < 10 && Math.abs(o.z - p.z) < 10) witnesses++;
    switch (kind) {
      case 'talk': feel(m, HAP, 0.08); R.like = clampR(R.like + 0.04 * (1 - R.like), -1, 1); remember(m, 'talked', this.hero, p.x, p.z, now, 0.15, 0.3); break;
      case 'wave': feel(m, HAP, 0.1); R.like = clampR(R.like + 0.05 * (1 - R.like), -1, 1); break;
      case 'photo': feel(m, EXC, 0.15); feel(m, HAP, 0.06); break;
      case 'insult': R.harass++; R.like = clampR(R.like - 0.22, -1, 1); feel(m, ANG, 0.35); feel(m, EMB, 0.15 + 0.05 * Math.min(4, witnesses)); remember(m, 'insulted', this.hero, p.x, p.z, now, 0.35 + 0.1 * R.harass, -0.6); break;
      case 'shove': R.harass++; R.like = clampR(R.like - 0.32, -1, 1); R.fear = clamp01(R.fear + 0.1); feel(m, ANG, 0.45); feel(m, EMB, 0.2 + 0.05 * Math.min(4, witnesses)); remember(m, 'shoved', this.hero, p.x, p.z, now, 0.45 + 0.1 * R.harass, -0.7); break;
      case 'punched': R.harass += 2; R.like = clampR(R.like - 0.5, -1, 1); R.fear = clamp01(R.fear + 0.3 * (0.5 + m.tr[FEARF])); feel(m, FEA, 0.4); feel(m, ANG, 0.4); remember(m, 'punched', this.hero, p.x, p.z, now, 0.75, -0.9); break;
      case 'threat': R.like = clampR(R.like - 0.4, -1, 1); R.fear = clamp01(R.fear + 0.45 * (0.5 + m.tr[FEARF])); feel(m, FEA, 0.7); feel(m, STR, 0.5); remember(m, 'threat', this.hero, p.x, p.z, now, 0.8, -1); break;
      case 'hitByCar': R.like = clampR(R.like - 0.35, -1, 1); R.fear = clamp01(R.fear + 0.2); feel(m, ANG, 0.4); feel(m, FEA, 0.4); remember(m, 'hitByCar', this.hero, p.x, p.z, now, 0.7, -0.8); break;
      case 'crashed': R.like = clampR(R.like - 0.25, -1, 1); feel(m, ANG, 0.45); feel(m, FRU, 0.35); remember(m, 'crashed', this.hero, p.x, p.z, now, 0.55, -0.7); break;
      case 'helped': R.helped++; R.like = clampR(R.like + 0.55 * (1 - R.like), -1, 1); R.fear = clamp01(R.fear - 0.3); feel(m, HAP, 0.45); feel(m, FEA, -0.3); remember(m, 'helped', this.hero, p.x, p.z, now, 0.85, 1); break;
    }
    return R;
  }
  // ---- save game: the most memorable residents (traits are re-derived from the identity, not stored)
  save() {
    const now = this.now(), out = []; const list = [...this.personas.values()].filter((m) => !m.dead || now - (m.deadAt || 0) < 7200).map((m) => [m, this.worth(m, now)]).filter((x) => x[1] > 0.05).sort((a, b) => b[1] - a[1]).slice(0, SAVE_CAP);
    for (const [m] of list) {
      const mem = m.mem.filter((e) => e.k && memNow(e, now) > 0.04).map((e) => [e.k, e.who, Math.round(e.x), Math.round(e.z), Math.round(e.t), +e.imp.toFixed(3), +e.val.toFixed(2), e.n]);
      const rl = {}; for (const h in m.rel) { const r = m.rel[h]; rl[h] = [+r.like.toFixed(3), +r.fear.toFixed(3), r.n, r.harass, r.helped, r.crimes, Math.round(r.last)]; }
      out.push({ id: m.pid, e: Array.from(m.em, (v) => +v.toFixed(3)), t: Math.round(m.lastT), m: mem, r: rl, ti: m.ties.map((t) => [t.pid, +t.aff.toFixed(3), t.n]), d: m.dead ? 1 : 0 });
    }
    return { v: 1, n: out.length, minds: out };
  }
  load(d) {
    this.personas.clear(); if (!d || !Array.isArray(d.minds)) return 0; let n = 0;
    for (const o of d.minds) {
      if (!o || typeof o.id !== 'string') continue; const [k, dist] = o.id.split('@'); const sp = this.C.specs ? this.C.specs[+k] : null; const m = new Mind(); m.pid = o.id; m.home = dist || null; genTraits(m, hashStr(o.id), sp || {}); m.needTraits = !sp; /* specs not built yet: redo with the real look on first sight */
      if (Array.isArray(o.e)) for (let i = 0; i < 10; i++) m.em[i] = clamp01(+o.e[i] || 0); m.lastT = +o.t || 0; m.dead = !!o.d;
      (o.m || []).slice(0, MEM_CAP).forEach((e, i) => Object.assign(m.mem[i], { k: e[0], who: e[1], x: e[2], z: e[3], t: e[4], imp: e[5], val: e[6], n: e[7] || 1 }));
      for (const h in o.r || {}) { const r = o.r[h]; m.rel[h] = { like: r[0], fear: r[1], n: r[2], harass: r[3], helped: r[4], crimes: r[5], last: r[6] }; }
      for (const t of (o.ti || []).slice(0, TIE_CAP)) m.ties.push({ pid: t[0], aff: t[1], n: t[2] });
      this.personas.set(o.id, m); n++;
    }
    return n;
  }
  // debug: everything about one person (console `mind`)
  describe(p) {
    const m = p && p.mind; if (!m) return null; const now = this.now(); const r2 = (a) => +a.toFixed(2);
    return { id: m.pid || '(passer-by)', home: m.home, traits: Object.fromEntries(TRAITS.map((k, i) => [k, r2(m.tr[i])])), emotions: Object.fromEntries(EMOS.map((k, i) => [k, r2(m.em[i])])), mood: moodOf(m), state: p.state, pace: r2(p.emoPace || 1),
      memories: memories(m, now), player: Object.fromEntries(Object.entries(m.rel).map(([h, r]) => [h, { like: r2(r.like), fear: r2(r.fear), met: r.n, harassed: r.harass, helped: r.helped, crimesSeen: r.crimes }])), ties: m.ties.map((t) => ({ who: t.pid, aff: r2(t.aff), met: t.n })) };
  }
  info() { let live = 0; for (const p of this.C.peds) if (p.mind) live++; return { live, residents: this.personas.size, pooled: this.pool.length, incidents: this.incidents.length, ...this.stats }; }
}
function norm2(x, z) { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; }
