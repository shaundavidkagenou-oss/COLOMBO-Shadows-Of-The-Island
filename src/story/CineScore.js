// OFFICIAL CINEMATIC TRAILER — original score, synthesised live with WebAudio (no samples, no borrowed music).
// C minor, 96 bpm (beat 0.625 s, bar 2.5 s): every section change and every big cut sits on a bar line of the edit
// (CinePlan.js). Act I — the city waking: warm pads, a bamboo-flute line over plucked arpeggios, the pulse arriving under
// the Galle Road traffic. Act II — life: a swung street groove (kick, snare, tabla, sub bass, pluck ostinato). Act III —
// the underworld: a darker half-time beat, distorted bass, braams, a tremolo-string robbery. Act IV — the city strikes back:
// the helicopter's lift-off over a held drone and heartbeat, then the drop; taiko rolls for the rapid cuts; half-time
// strings for the slow-motion wide. Act V — the full theme (flute + choir + strings) over the driving beat, an accelerating
// snare roll and riser into the cut to black. Act VI — the impact, the title chord and the studio's sound logo.
// It reuses the original trailer's synth voices (TrailerScore) and adds a sub bass, tabla, choir and bell.
import { TrailerScore } from './TrailerScore.js';
import { Audio } from '../audio/Audio.js';

const N = (semi) => 73.416 * Math.pow(2, semi / 12); // semitones above D2
// C minor: roots relative to D2
const CM = -2, AB = -6, EB = 1, BB = -4, FM = 3, GM = 5;
const B = 0.625, BAR = 2.5;
// chord tones (root, minor/major third, fifth) for a root
const MINOR = new Set([CM, FM, GM]);
const triad = (r) => [r, r + (MINOR.has(r) ? 3 : 4), r + 7];

export class CineScore extends TrailerScore {
  constructor() { super(); this.level = 1; }
  // ------------------------------------------------------------------ extra voices
  sub(t, semi, dur, vol = 0.16, from = null) { // 808-style sub bass: a sine with a short pitch drop, softly saturated
    const c = this.c, g = c.createGain(); const sh = c.createWaveShaper(); const cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; cv[i] = Math.tanh(x * 1.8); } sh.curve = cv;
    g.connect(sh); this.route(sh, 0.04); const end = this.env(g, t, 0.006, vol, dur * 0.5, dur * 0.6);
    const f = N(semi - 12); const o = this.osc('sine', from ? N(from - 12) : f * 1.5, t, end, { glide: f, glideT: t + (from ? 0.18 : 0.05) }); o.connect(g);
  }
  tabla(t, vol = 0.12, hi = true) { // 'na' (bright, ringing) / 'ge' (low, bending up)
    const c = this.c, g = c.createGain(); this.route(g, 0.3);
    if (hi) { const end = this.env(g, t, 0.002, vol, 0, 0.32); this.osc('sine', 620, t, end, { glide: 560, glideT: t + 0.1 }).connect(g); const g2 = c.createGain(); this.route(g2, 0.2); this.env(g2, t, 0.001, vol * 0.5, 0, 0.05); const f = this.filt('bandpass', 3200, 2); this.nz(t, t + 0.08).connect(f); f.connect(g2); }
    else { const end = this.env(g, t, 0.003, vol * 1.3, 0, 0.42); this.osc('sine', 92, t, end, { glide: 128, glideT: t + 0.2 }).connect(g); }
  }
  choir(t, semis, dur, vol = 0.03, att = 1.0) { // 'aah': detuned saws through two vowel formants
    const c = this.c, g = c.createGain(); const f1 = this.filt('bandpass', 760, 3.5), f2 = this.filt('bandpass', 1180, 4); const m = c.createGain(); g.connect(f1); g.connect(f2); f1.connect(m); f2.connect(m); this.route(m, 0.8);
    const end = this.env(g, t, att, vol, Math.max(0, dur - att - 1), 1.4);
    for (const s of semis) for (const d of [-9, 0, 8]) { const o = this.osc('sawtooth', N(s + 12), t, end, { detune: d }); const vib = c.createOscillator(); vib.frequency.value = 4.6 + Math.random(); const vg = c.createGain(); vg.gain.value = 5; vib.connect(vg); vg.connect(o.detune); vib.start(t); vib.stop(end + 0.05); o.connect(g); }
  }
  bell(t, semi, vol = 0.06, len = 3.5) { // struck metal: inharmonic partials, long decay
    for (const [k, a, d] of [[1, 1, 1], [2.76, 0.5, 0.6], [5.4, 0.28, 0.35], [8.93, 0.12, 0.2]]) { const g = this.c.createGain(); this.route(g, 0.6); const end = this.env(g, t, 0.002, vol * a, 0, len * d); this.osc('sine', N(semi + 24) * k, t, end).connect(g); }
  }
  stab(t, semis, vol = 0.05, dur = 0.5) { // brass-like stab: saws with a filter that opens and closes
    const c = this.c, g = c.createGain(); const f = this.filt('lowpass', 400, 1.2); f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.06); f.frequency.exponentialRampToValueAtTime(700, t + dur); g.connect(f); this.route(f, 0.45);
    const end = this.env(g, t, 0.012, vol, dur * 0.3, dur * 0.7); for (const s of semis) for (const d of [-6, 6]) this.osc('sawtooth', N(s + 12), t, end, { detune: d }).connect(g);
  }
  dist(t, semi, dur, vol = 0.05) { // overdriven bass for the underworld
    const c = this.c, g = c.createGain(); const sh = c.createWaveShaper(); const cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; cv[i] = Math.tanh(x * 5); } sh.curve = cv; const f = this.filt('lowpass', 900, 1.5); g.connect(sh); sh.connect(f); this.route(f, 0.1);
    const end = this.env(g, t, 0.005, vol, dur * 0.4, dur * 0.6); this.osc('sawtooth', N(semi - 12), t, end).connect(g); this.osc('square', N(semi - 12), t, end, { detune: 9 }).connect(g);
  }
  tick(t, vol = 0.03) { const f = this.filt('bandpass', 5200, 6); const g = this.c.createGain(); this.env(g, t, 0.001, vol, 0, 0.02); this.nz(t, t + 0.04).connect(f); f.connect(g); this.route(g, 0.2); }
  // ------------------------------------------------------------------ seek: a fresh output chain (everything already scheduled on the old one is cut off)
  rebase(t0) {
    if (!this.ok) return; const c = this.c, now = c.currentTime;
    for (const g of [this.out, this.hallOut]) if (g) { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + 0.05); const old = g; setTimeout(() => { try { old.disconnect(); } catch { /* gone */ } }, 200); }
    { const oldHall = this.hall; setTimeout(() => { try { oldHall.disconnect(); } catch { /* gone */ } }, 80); } // the old reverb (and its tail) is cut off too
    this.out = c.createGain(); this.out.gain.value = 1; this.out.connect(this.lvl);
    const hall = c.createConvolver(); hall.buffer = this.hall.buffer; this.hall = hall; this.hallOut = c.createGain(); this.hallOut.gain.value = 0.42; hall.connect(this.hallOut); this.hallOut.connect(this.lvl);
    if (this.vout) { const old = this.vout; old.gain.cancelScheduledValues(now); old.gain.setValueAtTime(old.gain.value, now); old.gain.linearRampToValueAtTime(0, now + 0.05); setTimeout(() => { try { old.disconnect(); } catch { /* gone */ } }, 200); this.vout = c.createGain(); this.vout.gain.value = 1; this.vout.connect(Audio.bus.dlg); }
    this.lvl.gain.cancelScheduledValues(now); this.lvl.gain.setValueAtTime(this.level || 1, now);
    this.t0 = t0; this.stopLoops();
  }
  // ------------------------------------------------------------------ dialogue (49th): the recorded lines on the dialogue bus
  // list: [{ e (edit s), file, dur }], bufs: { file: AudioBuffer }, sighs: [edit s]. The score ducks under every line.
  setVoices(list, bufs, sighs = []) {
    if (!this.ok) return; this.voices = list.map((v) => ({ ...v, buf: bufs[v.file] || null, done: false })); this.sighs = sighs.map((e) => ({ e, dur: 1.5, done: false, sigh: true }));
    this.vout = this.c.createGain(); this.vout.gain.value = 1; this.vout.connect(Audio.bus.dlg);
  }
  playVoices(e) {
    if (!this.vout) return; const c = this.c, now = c.currentTime + 0.005;
    for (const v of [...this.voices, ...this.sighs]) {
      if (v.done || e < v.e - 0.35 || e >= v.e + v.dur - 0.05) continue; v.done = true;
      const when = this.t0 + v.e, off = Math.max(0, now - when), start = Math.max(now, when);
      if (v.sigh) { this.sigh(start); continue; }
      if (!v.buf || off >= v.buf.duration - 0.05) continue;
      const src = c.createBufferSource(); src.buffer = v.buf; const g = c.createGain(); g.gain.value = 1.15; src.connect(g); g.connect(this.vout); src.start(start, off);
      const L = this.lvl.gain, lv = this.level || 1; L.setTargetAtTime(lv * 0.5, Math.max(now, start - 0.08), 0.06); L.setTargetAtTime(lv, start + (v.buf.duration - off), 0.3); // duck the score under the line
    }
  }
  sigh(t) { // a tired breath in, then a long sigh out: filtered noise (no sample)
    const c = this.c; const gi = c.createGain(), fi = this.filt('bandpass', 1700, 0.8); this.env(gi, t, 0.18, 0.035, 0.1, 0.12); this.nz(t, t + 0.45).connect(fi); fi.connect(gi); gi.connect(this.vout);
    const go = c.createGain(), fo = this.filt('bandpass', 1050, 0.9); fo.frequency.setValueAtTime(1050, t + 0.42); fo.frequency.exponentialRampToValueAtTime(480, t + 1.4); this.env(go, t + 0.42, 0.08, 0.075, 0.25, 0.65); this.nz(t + 0.42, t + 1.5).connect(fo); fo.connect(go); go.connect(this.vout);
  }
  seek(e) { super.seek(e); for (const v of [...(this.voices || []), ...(this.sighs || [])]) v.done = e >= v.e + v.dur - 0.05; }
  // section level: the score sits under the city in Act I, then full
  update(e) {
    if (!this.ok || this.hold) return; // hold: the runtime is re-simulating up to a seek point
    const k = e < 3.6 ? 1.3 : e < 25 ? 1.6 : 1; if (k !== this.level) { this.level = k; this.lvl.gain.setTargetAtTime(k, this.c.currentTime, 0.05); }
    this.playVoices(e);
    const E = this.ev; while (this.i < E.length && E[this.i].t < e + 0.35) { const ev = E[this.i++]; if (ev.t < e - 0.15) continue; try { ev.fn(Math.max(this.c.currentTime + 0.005, this.t0 + ev.t)); } catch (err) { console.warn('trailer score', err); } }
  }
  // ------------------------------------------------------------------ the cue sheet (edit seconds)
  build() {
    const E = [], at = (t, fn) => E.push({ t, fn }); const bar = (n) => n * BAR; // bar n starts at n × 2.5 s
    const prog = [CM, AB, EB, BB]; // i – VI – III – VII
    // ===== 0 – 3.6: black — the city alone, a sub swell
    at(0.6, (w) => this.drone(w, 6.5, 0.06)); // a low drone under the black and the first light
    at(2.0, (w) => this.revCym(w, 2.4, 0.07));
    // ===== ACT I (3.6 – 25): dawn
    at(4.4, (w) => { this.boom(w, 0.3, 4); this.pad(w, triad(CM).map((s) => s - 12).concat([CM + 12]), 5.2, 0.045, { att: 0.4, lp: 1100 }); this.bell(w, CM + 12, 0.04, 4); }); // "COLOMBO"
    for (let i = 0; i < 4; i++) { const t = 9.375 + i * 5; const r = prog[i % 4]; at(t, (w) => this.pad(w, triad(r).map((s) => s - 12).concat([r + 12]), 5.4, 0.04, { att: 1.2, lp: 950 })); }
    // bamboo-flute line (C minor pentatonic + the 2nd), phrased over the shots
    const flute = [[5.6, CM + 12, 1.2], [6.9, EB + 12, 0.6], [7.5, FM + 12, 1.6], [10.0, GM + 12, 1.0], [11.25, AB + 12, 0.5], [11.9, GM + 12, 1.8], [15.0, EB + 12, 0.9], [16.25, FM + 12, 0.6], [16.9, EB + 12, 0.6], [17.5, CM + 12, 1.6], [20.0, BB + 12, 0.9], [21.25, CM + 24, 2.2], [23.8, BB + 12, 0.8]];
    for (const [t, s, d] of flute) at(t, (w) => this.flute(w, s, d, 0.038));
    // plucked arpeggio from the Lotus Tower on, 8ths
    for (let t = 9.375; t < 24.9; t += B / 2) { const i = Math.floor((t - 9.375) / 5) % 4, r = prog[i], tones = triad(r), k = Math.round((t - 9.375) / (B / 2)); const n = [tones[0], tones[1], tones[2], tones[1] + 12][k % 4] + (k % 8 >= 4 ? 12 : 0); at(t, (w) => this.pluck(w, n, 0.028 + 0.012 * ((t - 9.375) / 16))); }
    // the pulse arrives with the traffic (14.0), hats with the skyline
    for (let t = 14.375; t < 24.9; t += B) { const k = Math.round((t - 14.375) / B); at(t, (w) => this.kick(w, k % 2 === 0 ? 0.34 : 0.2)); }
    for (let t = 18.75; t < 24.9; t += B / 2) at(t, (w) => this.hat(w, 0.018));
    at(19.6, (w) => this.strings(w, [CM, EB, GM, CM + 12], 5, 0.026)); // the tagline
    at(22.5, (w) => this.riser(w, 2.5, 0.05)); at(23.4, (w) => this.revCym(w, 1.6, 0.09));
    // ===== ACT II (25 – 55): life — the street groove
    at(25, (w) => { this.kick(w, 0.5); this.sub(w, CM, 1.2, 0.17, CM + 7); this.stab(w, triad(CM), 0.045, 0.6); });
    for (let b = 10; b < 22; b++) {
      const t0 = bar(b), r = prog[Math.floor((b - 10) / 1) % 4], last = b === 21, fx = b === 20 || b === 21; // dusk (52.5 –): the groove filters away
      const swing = (k) => t0 + k * (B / 2) + (k % 2 ? 0.07 : 0);
      // drums: kick 1, the "and" of 2, 3; snare 2 and 4; swung 8th hats; tabla answers
      if (!last) { for (const o of [0, 1.5, 2]) at(t0 + o * B, (w) => this.kick(w, fx ? 0.25 : 0.46)); for (const o of [1, 3]) at(t0 + o * B, (w) => this.snare(w, fx ? 0.08 : 0.16)); }
      for (let k = 0; k < 8; k++) if (!last) at(swing(k), (w) => this.hat(w, k % 2 ? 0.016 : 0.026, k === 7 && b % 2 === 1));
      if (b >= 12 && !fx) { at(t0 + 0.5 * B + 0.07, (w) => this.tabla(w, 0.08, true)); at(t0 + 2.75 * B, (w) => this.tabla(w, 0.09, false)); at(t0 + 3.5 * B + 0.07, (w) => this.tabla(w, 0.07, true)); }
      // sub bass: root on 1, a pickup to the fifth
      at(t0, (w) => this.sub(w, r, last ? 2.4 : 1.1, fx ? 0.09 : 0.15)); if (!fx) at(t0 + 2.5 * B, (w) => this.sub(w, r + 7, 0.5, 0.1));
      // pluck ostinato (16ths in a 3-3-2 figure) and a chord pad
      if (!fx) for (const k of [0, 3, 6, 8, 11, 14]) { const n = triad(r)[k % 3] + 12; at(t0 + k * (B / 4), (w) => this.pluck(w, n, 0.03)); }
      at(t0, (w) => this.pad(w, triad(r).map((s) => s - 12), BAR + 0.4, fx ? 0.03 : 0.022, { att: 0.3, lp: fx ? 600 : 1300 }));
      if (b >= 14 && b < 20) at(t0, (w) => this.strings(w, triad(r).map((s) => s + 12), BAR, 0.016));
    }
    // the flute hook over Life
    const hook = [[30.0, GM + 12, 0.45], [30.6, AB + 12, 0.45], [31.25, GM + 12, 0.9], [32.5, EB + 12, 0.6], [33.1, FM + 12, 1.1], [40.0, CM + 24, 0.5], [40.6, BB + 12, 0.5], [41.25, GM + 12, 1.1], [42.5, AB + 12, 0.6], [43.1, GM + 12, 0.6], [43.75, EB + 12, 1.6], [47.5, GM + 12, 0.6], [48.1, BB + 12, 0.6], [48.75, CM + 24, 1.6]];
    for (const [t, s, d] of hook) at(t, (w) => this.flute(w, s, d, 0.034));
    at(52.5, (w) => this.choir(w, [CM, EB, GM], 2.6, 0.022, 0.8)); at(53.0, (w) => this.riser(w, 2.0, 0.06)); at(53.8, (w) => this.revCym(w, 1.2, 0.1));
    // ===== ACT III (55 – 85): the underworld — half time, darker
    at(55, (w) => { this.braam(w, CM, 3.2, 0.15); this.boom(w, 0.4, 3); this.sub(w, CM, 2.2, 0.18, CM + 12); });
    const dark = [CM, CM, AB, AB, FM, FM, GM, GM, CM, CM, AB, BB];
    for (let b = 22; b < 34; b++) {
      const t0 = bar(b), r = dark[b - 22], inside = b >= 25 && b < 29, launch = b >= 29;
      if (!inside) { at(t0, (w) => this.kick(w, 0.5)); at(t0 + 2 * B, (w) => { this.snare(w, 0.2); this.taiko(w, 0.32, 1.1); }); if (launch) for (const o of [1.5, 2.5, 3.25]) at(t0 + o * B, (w) => this.kick(w, 0.36)); }
      else { at(t0, (w) => this.heart(w, 0.3)); at(t0 + 2 * B, (w) => this.heart(w, 0.24)); }
      for (let k = 0; k < 16; k++) if (!inside || k % 4 === 2) at(t0 + k * (B / 4), (w) => this.tick(w, k % 4 === 0 ? 0.03 : 0.014));
      if (launch) for (let k = 0; k < 8; k++) at(t0 + k * (B / 2), (w) => this.dist(w, r, 0.28, 0.045)); else for (const k of [0, 3, 6]) at(t0 + k * (B / 2), (w) => this.dist(w, r, 0.5, inside ? 0.025 : 0.04));
      if (b % 2 === 0 && !inside) at(t0, (w) => this.braam(w, r, 2.2, 0.11));
      at(t0, (w) => this.pad(w, [r - 12, r - 5, r + (MINOR.has(r) ? 3 : 4)], BAR + 0.4, 0.028, { att: 0.25, lp: 700 }));
    }
    at(61.2, (w) => this.bell(w, GM, 0.035, 2.5)); // the shop door (Shashika pushes it open)
    at(bar(25) + 0.9, (w) => this.strings(w, [CM, CM + 1, GM], 9.2, 0.026)); // after the three shots: tremolo strings, a semitone rub, under the dialogue
    at(70.0, (w) => this.braam(w, AB, 2.4, 0.07)); // the case
    at(72.5, (w) => { this.boom(w, 0.4, 2.5); this.stab(w, triad(CM), 0.05, 0.4); });
    at(81.25, (w) => this.choir(w, [CM, GM, CM + 12], 3.6, 0.03, 1.2)); at(82.5, (w) => this.riser(w, 2.5, 0.08)); at(83.4, (w) => this.revCym(w, 1.6, 0.13));
    // ===== ACT IV (85 – 115): the city strikes back
    at(85, (w) => { this.hit(w, 0.22); this.sub(w, CM, 2.4, 0.2, CM + 12); });
    for (let b = 34; b < 37; b++) { const t0 = bar(b), half = b === 36; /* 90 – 91.25 only: the band stops dead for the OIC's office */ for (const o of [0, 0.75, 1.5, 2, 2.75, 3.5]) if (!half || o < 2) at(t0 + o * B, (w) => this.taiko(w, o === 0 || o === 2 ? 0.5 : 0.3, o === 0 ? 0.8 : 1.05)); for (let k = 0; k < (half ? 4 : 8); k++) at(t0 + k * (B / 2), (w) => this.dist(w, [CM, CM, AB][b - 34], 0.25, 0.045)); at(t0 + B, (w) => this.snare(w, 0.18)); if (!half) at(t0 + 3 * B, (w) => this.snare(w, 0.2)); }
    at(90.0, (w) => this.stab(w, triad(GM), 0.05, 0.35));
    // the OIC's office (91.25 – 97.5): no band under the dialogue — a low held drone and a slow heartbeat; a hit on "WHAT?!"
    at(91.25, (w) => { this.boom(w, 0.22, 2.5); this.pad(w, [CM - 12, CM - 5], 6.2, 0.026, { att: 0.5, lp: 420 }); });
    for (const t of [92.5, 93.75, 95.0]) at(t, (w) => this.heart(w, 0.2));
    at(96.2, (w) => { this.hit(w, 0.16); this.stab(w, triad(GM), 0.04, 0.5); this.sub(w, GM, 1.2, 0.14); });
    // the lift-off (97.5 – 101.25): a held chord under the rotor, a heartbeat, the choir rising into the drop
    at(97.5, (w) => { this.boom(w, 0.3, 3); this.pad(w, [CM - 12, CM - 5, CM], 4.0, 0.04, { att: 0.5, lp: 520 }); this.choir(w, [CM, EB, GM], 4.0, 0.026, 1.6); });
    for (const t of [97.9, 99.15, 100.4]) at(t, (w) => this.heart(w, 0.3));
    at(98.75, (w) => this.riser(w, 2.5, 0.07)); at(99.75, (w) => this.revCym(w, 1.5, 0.14));
    // the drop (101.25): the full beat + choir + strings (bars counted from the drop)
    at(101.25, (w) => { this.hit(w, 0.24); this.stab(w, triad(CM), 0.06, 0.6); this.sub(w, CM, 2.4, 0.2, CM + 7); });
    const big = [CM, AB];
    for (let i = 0; i < 2; i++) { const t0 = 101.25 + i * BAR, r = big[i]; for (const o of [0, 1.5, 2]) at(t0 + o * B, (w) => this.kick(w, 0.52)); for (const o of [1, 3]) at(t0 + o * B, (w) => { this.snare(w, 0.2); this.taiko(w, 0.28, 1.2); }); for (let k = 0; k < 8; k++) at(t0 + k * (B / 2), (w) => this.hat(w, 0.022)); at(t0, (w) => this.sub(w, r, 1.2, 0.17)); at(t0 + 2.5 * B, (w) => this.sub(w, r + 7, 0.5, 0.12)); at(t0, (w) => this.strings(w, triad(r).map((s) => s + 12), BAR, 0.024)); if (i > 0) at(t0, (w) => this.stab(w, triad(r), 0.045, 0.4)); }
    // rapid cuts 106.25 – 110: a taiko roll
    { let t = 106.25; let step = 0.22; while (t < 109.9) { const v = 0.22 + ((t - 106.25) / 3.65) * 0.33; at(t, (w) => this.taiko(w, v, 1.15)); t += step; step = Math.max(0.07, step * 0.93); } }
    // the slow-motion wide (110 – 115): half time, soaring strings, the theme on the choir
    at(110, (w) => { this.hit(w, 0.2); this.choir(w, [CM, EB, GM, CM + 12], 5.0, 0.034, 1.2); this.strings(w, [CM + 12, EB + 12, GM + 12], 5.0, 0.032); });
    for (let b = 44; b < 46; b++) { const t0 = bar(b), r = [CM, BB][b - 44]; at(t0, (w) => { this.kick(w, 0.4); this.sub(w, r, 2.2, 0.15); this.pad(w, triad(r).map((s) => s - 12), BAR + 0.4, 0.035, { att: 0.4, lp: 900 }); }); at(t0 + 2 * B, (w) => { this.snare(w, 0.16); this.taiko(w, 0.35, 0.9); }); }
    at(111.25, (w) => this.flute(w, GM + 12, 1.4, 0.036)); at(112.8, (w) => this.flute(w, AB + 12, 0.5, 0.036)); at(113.3, (w) => this.flute(w, BB + 12, 1.3, 0.036));
    at(112.5, (w) => this.riser(w, 2.5, 0.08)); at(113.6, (w) => this.revCym(w, 1.4, 0.14));
    // ===== ACT V (115 – 136): the finale — eight shots, one bar each, the full theme
    const fin = [CM, AB, EB, BB, CM, AB, FM, GM];
    const hush = (t) => t >= 123.7 && t < 127.45; // Dineth alone after the chase: the band drops out under his sigh and his line
    for (let b = 46; b < 54; b++) {
      const t0 = bar(b), r = fin[b - 46];
      if (b === 50) { at(t0 - 1.25, (w) => { this.pad(w, triad(r).map((s) => s - 12), 4.0, 0.03, { att: 0.5, lp: 700 }); this.choir(w, triad(r), 4.0, 0.016, 0.8); }); at(t0 + 1.9, (w) => this.riser(w, 0.6, 0.05)); continue; }
      const at2 = (t, fn) => { if (!hush(t)) at(t, fn); };
      at2(t0, (w) => { this.kick(w, 0.55); this.sub(w, r, 1.2, 0.18); this.stab(w, triad(r), 0.05, 0.5); this.strings(w, triad(r).map((s) => s + 12), b === 49 ? BAR / 2 : BAR, 0.028); this.choir(w, triad(r), b === 49 ? BAR / 2 + 0.3 : BAR + 0.3, 0.024, 0.15); });
      for (const o of [1.5, 2]) at2(t0 + o * B, (w) => this.kick(w, 0.46)); for (const o of [1, 3]) at2(t0 + o * B, (w) => { this.snare(w, 0.22); this.taiko(w, 0.3, 1.1); });
      for (let k = 0; k < 16; k++) at2(t0 + k * (B / 4), (w) => this.hat(w, k % 2 ? 0.012 : 0.024));
      at2(t0 + 2.5 * B, (w) => this.sub(w, r + 7, 0.5, 0.12)); if (b % 2) at2(t0 + 3.5 * B, (w) => this.tabla(w, 0.08, false));
    }
    const theme = [[115.0, GM + 12, 0.6], [115.65, AB + 12, 0.6], [116.25, GM + 12, 1.2], [117.5, EB + 12, 0.6], [118.15, FM + 12, 0.6], [118.75, GM + 12, 1.2], [120.0, BB + 12, 0.6], [120.65, CM + 24, 0.6], [121.25, BB + 12, 1.2], [122.5, GM + 12, 2.2], [125.0, GM + 12, 0.6], [125.65, AB + 12, 0.6], [126.25, BB + 12, 1.2], [127.5, CM + 24, 0.6], [128.15, BB + 12, 0.6], [128.75, AB + 12, 1.2], [130.0, GM + 12, 0.6], [130.65, FM + 12, 0.6], [131.25, GM + 12, 1.1], [132.5, CM + 24, 3.0]];
    for (const [t, s, d] of theme) if (!hush(t) && !hush(t + d)) at(t, (w) => this.flute(w, s, d, 0.04));
    { let t = 130; let step = 0.3125; while (t < 135.9) { const v = 0.05 + ((t - 130) / 6) * 0.2; at(t, (w) => this.snare(w, v)); t += step; step = Math.max(0.05, step * 0.94); } }
    at(132.5, (w) => this.riser(w, 3.45, 0.1)); at(134.2, (w) => this.revCym(w, 1.75, 0.16));
    // ===== ACT VI (136 – 146): the cut to black, the title, the studio, the sound logo
    at(136.0, (w) => { this.hit(w, 0.28); this.boom(w, 0.5, 5); this.sub(w, CM, 3.5, 0.2, CM + 12); });
    at(137.0, (w) => { this.pad(w, [CM - 12, CM, GM, EB + 12], 4.6, 0.045, { att: 0.8, lp: 1300 }); this.choir(w, [CM, GM, CM + 12], 4.6, 0.026, 1.0); this.strings(w, [CM + 12, GM + 12], 4.6, 0.022); });
    // the sound logo (142.1): a three-note flute motif over a struck bell and a deep bloom — the studio's signature
    at(142.1, (w) => { this.bell(w, CM + 12, 0.07, 3.6); this.boom(w, 0.32, 3.4); this.sub(w, CM, 2.8, 0.16); });
    at(142.35, (w) => this.flute(w, GM + 12, 0.42, 0.042)); at(142.8, (w) => this.flute(w, EB + 12, 0.42, 0.042)); at(143.25, (w) => this.flute(w, CM + 24, 1.6, 0.045));
    at(143.25, (w) => { this.pad(w, [CM - 12, CM, GM, EB + 12], 2.6, 0.04, { att: 0.3, lp: 1400, type: 'triangle' }); this.bell(w, GM + 12, 0.035, 2.4); });
    E.sort((a, b) => a.t - b.t); this.ev = E; this.i = 0;
  }
  // the end: everything rings out under the last black, gone by 146 s
  endFade(e) { if (!this.ok || this.endDone || e < 144.6) return; this.endDone = true; const t = this.c.currentTime; for (const g of [this.out, this.hallOut, this.sfx]) if (g) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + Math.max(0.2, 146 - e - 0.05)); } }
}
export const CINE_SCORE = { BAR, BEAT: B };
