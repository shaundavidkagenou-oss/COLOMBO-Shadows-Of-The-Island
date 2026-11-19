// Ceylon Meridian Bank sounds (67th, 71st): the banking-hall room tone, the hall's own sources and the ATM. Every sound has a
// slot in the sounds window, Bank section (SoundBank: bank.*, atm.*) — a supplied recording replaces the synthesised sound
// below. Levels are kept low (a quiet, air-conditioned hall); everything fades in on entering the bank and is fully stopped
// (sources released) a moment after leaving it.
// 71st: the hall is heard from where the player stands. Sources live in the room's own frame (BankInterior positions);
// `listen(x, z, yaw)` is the player in that frame every frame, and each source gets distance gain, pan and a low-pass that
// closes with distance — and further when the counter glass is between the player and a source behind it (occ callback).
//   positional loops: the two wall split air conditioners (bank.ac) and the office staff typing / clicking along the teller
//   desks (bank.office, a line source: heard from the nearest point of the desks) — both seamless (SoundBank.loopBuffer)
//   one-shots at a point: NPC footsteps on the tiles, the landline ringing (stoppable: it stops the moment it is picked up),
//   handset up / down, the office chair getting up / sitting down (held to their exact lengths)
import { Audio } from './Audio.js';
import { SoundBank as SB } from './SoundBank.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (base, n) => { const have = []; for (let i = 1; i <= n; i++) if (SB.has(base + i)) have.push(i); return have.length ? have[Math.floor(Math.random() * have.length)] : 1 + Math.floor(Math.random() * n); };
// the moment the sitter's weight lands on the seat in each "sitting down" recording (s from its start)
export const CHAIR_SEATED_AT = { 1: 1.3, 2: 1.0, 3: 1.0 };
export const CHAIR_LEN = 2, RING_LEN = 31, PHONE_LEN = 1, STEP_LEN = 1, ATM_OPEN_LEN = 1, ATM_BUTTON_LEN = 1, CASH_LEN = 5, CARD_MACHINE_LEN = 2.3, CARD_OUT_AT = 2.3, CARD_OUT_LEN = 0.7;

export const BankSound = {
  amb: null, on: false, evT: 3, chimeT: 30, printT: 18,
  L: { x: 0, z: 0, yaw: 0 }, occ: null, loops: [], ringing: null,
  // ---- the listener in the room's frame (BankInterior.update) and the distance / occlusion cues of a point
  listen(x, z, yaw) { this.L.x = x; this.L.z = z; this.L.yaw = yaw; },
  at(x, z, ref = 6) {
    const L = this.L, dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz); let g = clamp(ref / (ref + d * d * 0.08), 0, 1);
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw); const pan = -clamp((dx * rx + dz * rz) / (d + 1), -1, 1) * 0.85;
    let lp = clamp(17000 / (1 + d / 4.5), 2600, 17000); const o = this.occ ? this.occ(x, z) : 0; if (o > 0) { lp *= 1 - 0.55 * o; g *= 1 - 0.4 * o; }
    return { g, pan, lp, d };
  },
  // ---- room tone: aircon hum (low brown noise), ventilation hiss, a soft murmur of voices that breathes slowly
  ambience(on) {
    this.on = on; const A = Audio; if (!A.ready || !A.ctx) return; const c = A.ctx, t = c.currentTime;
    if (on && !this.amb) {
      const g = c.createGain(); g.gain.value = 0; g.connect(A.bus.amb); const og = c.createGain(); og.gain.value = 1; og.connect(g); const srcs = [];
      const layer = (buf, type, f, q, vol) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const lg = c.createGain(); lg.gain.value = vol; s.connect(fl); fl.connect(lg); lg.connect(og); s.start(t, Math.random() * 2); srcs.push(s); return lg; };
      layer(A.brownBuf, 'lowpass', 130, 0.7, 0.07); layer(A.noiseBuf, 'bandpass', 2400, 0.35, 0.004);
      const mur = layer(A.brownBuf, 'bandpass', 430, 1.1, 0.022); const lfo = c.createOscillator(); lfo.frequency.value = 0.13; const lg = c.createGain(); lg.gain.value = 0.01; lfo.connect(lg); lg.connect(mur.gain); lfo.start(t); srcs.push(lfo);
      this.amb = { g, og, srcs, rec: false, stopAt: 0 };
    }
    const m = this.amb; if (!m) return;
    m.g.gain.cancelScheduledValues(t); m.g.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.5 : 0.2); m.stopAt = on ? 0 : t + 1.4;
  },
  // ---- positional loops: { id, x, z, ref, seg?: [x0, x1] (line source along x), lvl, synth(c, dest) } — made on first use
  loop(key, def) {
    const A = Audio; if (!A.ready || !A.ctx) return null; let L = this.loops.find((q) => q.key === key); if (L) return L; const c = A.ctx;
    const inG = c.createGain(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 12000; lp.Q.value = 0.5; const out = c.createGain(); out.gain.value = 0; const p = c.createStereoPanner();
    inG.connect(lp); lp.connect(out); out.connect(p); p.connect(A.bus.amb); const syn = c.createGain(); syn.gain.value = 1; syn.connect(lp); const srcs = def.synth ? def.synth(c, syn) : [];
    L = { key, def, inG, lp, out, p, syn, srcs, rec: false, want: 0 }; this.loops.push(L); return L;
  },
  // per frame while the bank room is active: recordings, the positional loops, random hall sounds while inside, release after leaving
  tick(dt, inside, srcs = null) {
    const A = Audio, m = this.amb; if (!A.ready || !A.ctx) return; const t = A.ctx.currentTime;
    if (m) { const rec = !!SB.syncLoop(m, 'bank.ambience', m.g); if (rec !== m.rec) { m.rec = rec; m.og.gain.setTargetAtTime(rec ? 0 : 1, t, 0.3); }
      if (!this.on && m.stopAt && t > m.stopAt) this.release(); }
    if (srcs && this.on) for (const s of srcs) { const L = this.loop(s.key, s); if (!L) continue; L.def = s;
      const rec = !!SB.syncLoop(L, s.id, L.inG); if (rec !== L.rec) { L.rec = rec; L.syn.gain.setTargetAtTime(rec ? 0 : 1, t, 0.2); }
      const x = s.seg ? clamp(this.L.x, s.seg[0], s.seg[1]) : s.x; const P = this.at(x, s.z, s.ref || 6); const want = (s.on === false ? 0 : 1) * P.g * (s.lvl ?? 1);
      L.out.gain.setTargetAtTime(want, t, s.on === false ? 0.6 : 0.12); L.p.pan.setTargetAtTime(P.pan, t, 0.1); L.lp.frequency.setTargetAtTime(P.lp, t, 0.15); }
    if (this.ringing && this.ringing.trk && this.ringing.trk.voice) { const R = this.ringing, V = R.trk.voice; if (V.end > t) { const P = this.at(R.x, R.z, 7); V.g.gain.setTargetAtTime(Math.max(0.0001, V.lvl * P.g / Math.max(1e-3, R.g0)), t, 0.08); V.p.pan.setTargetAtTime(P.pan, t, 0.08); } }
    if (!inside || !this.on) return;
    if (!SB.has('bank.office') && (this.evT -= dt) <= 0) { this.evT = 4 + Math.random() * 6; const n = 5 + Math.floor(Math.random() * 8); for (let i = 0; i < n; i++) A.noise(0.012, { f: 3200 + Math.random() * 900, q: 3, vol: 0.006 + Math.random() * 0.004, when: i * (0.07 + Math.random() * 0.09), pan: -0.3 + Math.random() * 0.6 }); } // a keyboard behind the counter (the office loop replaces it)
    if ((this.printT -= dt) <= 0) { this.printT = 22 + Math.random() * 25; A.noise(0.55, { f: 1500, q: 2.5, vol: 0.01, sweep: 2600, pan: 0.2 }); } // receipt printer
    if ((this.chimeT -= dt) <= 0) { this.chimeT = 35 + Math.random() * 40; this.chime(); } // queue display: next number
  },
  release() {
    const m = this.amb; this.amb = null; this.ringStop(true);
    if (m) { try { SB.syncLoop(m, 'bank.ambience', null); } catch { /* no recording */ } for (const s of m.srcs) { try { s.stop(); } catch { /* already stopped */ } } try { m.g.disconnect(); } catch { /* gone */ } }
    for (const L of this.loops) { try { SB.syncLoop(L, L.def.id, null); } catch { /* none */ } for (const s of L.srcs) { try { s.stop(); } catch { /* stopped */ } } try { L.p.disconnect(); } catch { /* gone */ } }
    this.loops = [];
  },
  stopNow() { this.on = false; this.release(); },
  // ---- synthesised beds for the loops (used until a recording is supplied)
  acSynth(c, dest) { const A = Audio; const out = []; const mk = (buf, type, f, q, v) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = v; s.connect(fl); fl.connect(g); g.connect(dest); s.start(c.currentTime, Math.random() * 2); out.push(s); };
    mk(A.noiseBuf, 'bandpass', 900, 0.6, 0.05); mk(A.brownBuf, 'lowpass', 260, 0.6, 0.14); mk(A.noiseBuf, 'highpass', 4200, 0.5, 0.006); // the cross-flow fan's air, its low rumble, the hiss off the louvre
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 100; const og = c.createGain(); og.gain.value = 0.006; o.connect(og); og.connect(dest); o.start(); out.push(o); return out; }, // mains hum of the fan motor
  // ---- one-shots at a point of the room
  at1(id, x, z, k, opts = {}, ref = 6) { const P = this.at(x, z, ref); if (P.g < 0.01) return { ok: true, P }; return { ok: SB.play(id, k * P.g, P.pan, opts.when || 0, { lp: P.lp, ...opts }), P }; },
  step(x, z, k = 1) { const r = this.at1('bank.step.tile', x, z, k * (0.8 + Math.random() * 0.25), { dur: STEP_LEN, rate: 0.95 + Math.random() * 0.1, key: 'bank.step' }, 5);
    if (!r.ok && r.P.g > 0.02) { Audio.noise(0.03, { f: 2300 + Math.random() * 500, q: 1.4, vol: 0.016 * r.P.g * k, pan: r.P.pan, attack: 0.001 }); Audio.noise(0.05, { f: 260, q: 0.8, type: 'lowpass', vol: 0.02 * r.P.g * k, pan: r.P.pan, buf: Audio.brownBuf, attack: 0.002 }); } }, // heel on granite: a short hard tick over a soft thud
  // the landline: rings for RING_LEN (31 s) unless picked up first; returns true when it started
  ring(x, z) {
    this.ringStop(true); const A = Audio; if (!A.ready || !A.ctx) return false; const P = this.at(x, z, 7); const trk = {};
    if (SB.play('bank.phone.ring', P.g, P.pan, 0, { dur: RING_LEN, lp: P.lp, track: trk, key: 'bank.ring' })) { this.ringing = { x, z, trk, g0: P.g, t0: A.ctx.currentTime }; return true; }
    // synthesised: an electronic desk-phone warble (two tones alternating at 20 Hz) in the double-ring cadence (0.4 on, 0.2 off, 0.4 on, 2 off)
    const c = A.ctx, t = c.currentTime; const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1100; const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 20; const lg = c.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(o.frequency);
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = Math.min(P.lp, 5000); const g = c.createGain(); g.gain.value = 0; const p = c.createStereoPanner(); p.pan.value = P.pan; o.connect(fl); fl.connect(g); g.connect(p); p.connect(A.bus.sfx);
    const v = 0.022 * P.g; for (let c0 = 0; c0 < RING_LEN; c0 += 3) for (const [a, b] of [[0, 0.4], [0.6, 1.0]]) { if (c0 + b > RING_LEN) break; g.gain.setValueAtTime(0, t + c0 + a); g.gain.linearRampToValueAtTime(v, t + c0 + a + 0.01); g.gain.setValueAtTime(v, t + c0 + b - 0.01); g.gain.linearRampToValueAtTime(0, t + c0 + b); }
    o.start(t); lfo.start(t); o.stop(t + RING_LEN + 0.05); lfo.stop(t + RING_LEN + 0.05);
    this.ringing = { x, z, synth: { o, lfo, g }, t0: t }; return true;
  },
  ringStop(now = false) { const R = this.ringing; if (!R) return; this.ringing = null; const A = Audio; if (!A.ctx) return; const t = A.ctx.currentTime;
    try { if (R.trk && R.trk.voice) { R.trk.voice.g.gain.cancelScheduledValues(t); R.trk.voice.g.gain.setTargetAtTime(0, t, now ? 0.01 : 0.03); R.trk.voice.src.stop(t + 0.15); }
      if (R.synth) { R.synth.g.gain.cancelScheduledValues(t); R.synth.g.gain.setTargetAtTime(0, t, 0.01); R.synth.o.stop(t + 0.1); R.synth.lfo.stop(t + 0.1); } } catch { /* already stopped */ } },
  ringLeft() { const R = this.ringing; if (!R || !Audio.ctx) return 0; return Math.max(0, RING_LEN - (Audio.ctx.currentTime - R.t0)); },
  handset(up, x, z) { const id = (up ? 'bank.phone.pickup' : 'bank.phone.hangup') + pick(up ? 'bank.phone.pickup' : 'bank.phone.hangup', 2); const r = this.at1(id, x, z, 1, { dur: PHONE_LEN });
    if (!r.ok && r.P.g > 0.02) { const g = r.P.g, pan = r.P.pan; if (up) { Audio.noise(0.025, { f: 2600, q: 2.5, vol: 0.05 * g, pan, attack: 0.001 }); Audio.noise(0.08, { f: 900, q: 1.2, vol: 0.03 * g, pan, when: 0.03 }); Audio.tone(1900, 0.03, { type: 'triangle', vol: 0.008 * g, pan, when: 0.12 }); } // the hook switch, the handset leaving the cradle
      else { Audio.noise(0.06, { f: 700, q: 1, vol: 0.07 * g, pan, attack: 0.001, type: 'lowpass', buf: Audio.brownBuf }); Audio.noise(0.02, { f: 2400, q: 3, vol: 0.05 * g, pan, when: 0.012 }); } } }, // plastic into the cradle, the switch
  // office chair: kind 'up' | 'down', variation n (1..3); returns the variation used (the caller syncs to CHAIR_SEATED_AT[n])
  chair(kind, x, z, n = 0) { const base = 'bank.chair.' + kind; n = n || pick(base, 3); const r = this.at1(base + n, x, z, 1, { dur: CHAIR_LEN });
    if (!r.ok && r.P.g > 0.02) { const g = r.P.g, pan = r.P.pan, A = Audio;
      if (kind === 'up') { A.noise(0.35, { f: 520, q: 3, vol: 0.02 * g, pan, sweep: 760, when: 0.25 }); A.noise(0.7, { f: 300, q: 0.8, type: 'lowpass', vol: 0.05 * g, pan, buf: A.brownBuf, when: 0.55 }); A.noise(0.05, { f: 1800, q: 2, vol: 0.02 * g, pan, when: 1.15 }); } // gas lift sighs, the seat creaks, the castors roll back
      else { const s = CHAIR_SEATED_AT[n] || 1; A.noise(0.5, { f: 260, q: 0.8, type: 'lowpass', vol: 0.035 * g, pan, buf: A.brownBuf, when: Math.max(0, s - 0.75) }); A.noise(0.14, { f: 180, q: 0.7, type: 'lowpass', vol: 0.09 * g, pan, buf: A.brownBuf, when: s, attack: 0.003 }); A.noise(0.3, { f: 600, q: 4, vol: 0.018 * g, pan, sweep: 450, when: s + 0.03 }); } } // castors, the cushion taking the weight, the tilt spring creak
    return n; },
  chime() { if (SB.play('bank.chime', 0.8)) return; Audio.tone(784, 0.45, { vol: 0.028, verb: true }); Audio.tone(659, 0.6, { vol: 0.026, when: 0.32, verb: true }); },
  // ---- the ATM (the player stands at it: not positional)
  beep(vol = 1) { if (SB.play('atm.beep', vol)) return; Audio.tone(1240, 0.055, { type: 'square', vol: 0.03 * vol, attack: 0.002 }); },
  button(vol = 1) { if (SB.play('atm.button', vol, 0, 0, { dur: ATM_BUTTON_LEN })) return; this.beep(vol); },
  open() { if (SB.play('atm.open', 1, 0, 0, { dur: ATM_OPEN_LEN })) return; Audio.tone(988, 0.12, { vol: 0.03 }); Audio.tone(1319, 0.22, { vol: 0.028, when: 0.12 }); Audio.noise(0.04, { f: 3000, q: 2, vol: 0.012 }); },
  card(out = false) { if (SB.play('atm.card', 0.9, 0, 0, { rate: out ? 1.08 : 1 })) return; Audio.noise(0.32, { f: out ? 1100 : 800, q: 2.2, vol: 0.045, sweep: out ? 1600 : 420, buf: Audio.brownBuf }); Audio.tone(140, 0.05, { vol: 0.05, when: 0.3 }); },
  // returning the card: the transport motor for CARD_MACHINE_LEN (2.3 s), then the card slides out of the slot
  cardReturn() { if (!SB.play('atm.card.machine', 0.9, 0, 0, { dur: CARD_MACHINE_LEN })) { const A = Audio; A.noise(CARD_MACHINE_LEN, { f: 520, q: 2.5, vol: 0.03, buf: A.brownBuf, attack: 0.08 }); A.tone(180, CARD_MACHINE_LEN - 0.1, { type: 'sawtooth', vol: 0.006, attack: 0.1 }); A.noise(0.04, { f: 1500, q: 2, vol: 0.02, when: 0.05 }); A.noise(0.04, { f: 1500, q: 2, vol: 0.02, when: CARD_MACHINE_LEN - 0.08 }); }
    if (!SB.play('atm.card.out', 0.9, 0, CARD_OUT_AT, { dur: CARD_OUT_LEN })) { Audio.noise(0.28, { f: 1300, q: 2.2, vol: 0.045, sweep: 1800, when: CARD_OUT_AT }); Audio.tone(150, 0.04, { vol: 0.04, when: CARD_OUT_AT + 0.27 }); } },
  // cash: CASH_LEN (5 s) for a withdrawal and a deposit alike — the "counting" page is held exactly that long
  cash(deposit = false) {
    if (SB.play('atm.cash', 0.9, 0, 0, { dur: CASH_LEN })) return; const A = Audio;
    A.noise(1.6, { f: deposit ? 900 : 650, q: 3, vol: 0.04, sweep: deposit ? 1400 : 1050, buf: A.brownBuf, when: 0.2 });
    for (let i = 0; i < 26; i++) A.noise(0.02, { f: 2400, q: 4, vol: 0.02, when: 0.5 + i * (deposit ? 0.09 : 0.1) });
    A.noise(1.2, { f: 700, q: 2.5, vol: 0.03, buf: A.brownBuf, when: 3.2 });
    A.noise(0.12, { f: 320, q: 1, vol: 0.07, type: 'lowpass', when: 4.6, buf: A.brownBuf });
  },
};
