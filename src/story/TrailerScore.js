// Official trailer — original score + trailer sound design, synthesised live with WebAudio (no samples, no borrowed music).
// D minor, 120 bpm (one bar = 2 s): Act I a slow drone with a bamboo-flute line, Act II a pulsing ostinato under the
// character cards, Act III taiko drums, braams and a driving bass, with drop-outs for the slow-motion moments.
// Everything is scheduled ahead on the AudioContext clock from the edit's times, so picture and music stay locked even if
// a frame stalls. Routed through the game's music / sfx buses (the player's volume settings apply).
import { Audio } from '../audio/Audio.js';

const N = (semi) => 73.416 * Math.pow(2, semi / 12); // semitones above D2
// chord roots (semitones from D2): i = Dm, VI = Bb, III = F, VII = C, iv = Gm
const DM = 0, BB = -4, FF = 3, CC = -2, GM = 5;

export class TrailerScore {
  constructor() {
    this.ok = !!(Audio.ready && Audio.ctx); if (!this.ok) return;
    const c = (this.c = Audio.ctx);
    this.out = c.createGain(); this.out.gain.value = 1; this.out.connect(Audio.bus.music);
    this.hall = c.createConvolver(); this.hall.buffer = hallIR(c, 3.6); const hg = c.createGain(); hg.gain.value = 0.42; this.hall.connect(hg); hg.connect(Audio.bus.music);
    this.sfx = c.createGain(); this.sfx.gain.value = 1; this.sfx.connect(Audio.bus.sfx);
    this.ev = []; this.i = 0; this.t0 = 0;
  }
  // ------------------------------------------------------------------ low-level voices (absolute AudioContext times)
  env(g, t, a, peak, hold, rel) { const p = g.gain; p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); if (hold > 0) p.setValueAtTime(Math.max(peak, 0.0002), t + a + hold); p.exponentialRampToValueAtTime(0.0001, t + a + hold + rel); return t + a + hold + rel; }
  route(node, verb = 0.3, dest = null) { node.connect(dest || this.out); if (verb > 0) { const s = this.c.createGain(); s.gain.value = verb; node.connect(s); s.connect(this.hall); } }
  osc(type, f, t, end, { detune = 0, glide = null, glideT = null } = {}) { const o = this.c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (glide) o.frequency.exponentialRampToValueAtTime(glide, glideT ?? end); o.detune.value = detune; o.start(t); o.stop(end + 0.05); return o; }
  nz(t, end, buf = null) { const s = this.c.createBufferSource(); s.buffer = buf || Audio.noiseBuf; s.loop = true; s.start(t, Math.random() * 2); s.stop(end + 0.05); return s; }
  filt(type, f, q = 0.7) { const b = this.c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  // ------------------------------------------------------------------ instruments
  pad(t, semis, dur, vol = 0.05, { att = 1.4, verb = 0.6, type = 'sawtooth', lp = 900 } = {}) {
    const g = this.c.createGain(); const f = this.filt('lowpass', lp, 0.4); g.connect(f); this.route(f, verb); const end = this.env(g, t, att, vol, Math.max(0, dur - att - 1.2), 1.6);
    for (const s of semis) for (const d of [-7, 6]) this.osc(type, N(s), t, end, { detune: d }).connect(g);
  }
  drone(t, dur, vol = 0.07) { const g = this.c.createGain(); const f = this.filt('lowpass', 260, 0.5); g.connect(f); this.route(f, 0.4); const end = this.env(g, t, 2.5, vol, dur - 4, 2.5); this.osc('sine', N(-12), t, end).connect(g); this.osc('triangle', N(-5), t, end, { detune: 4 }).connect(g); this.osc('sine', N(0), t, end, { detune: -3 }).connect(g); }
  flute(t, semi, dur, vol = 0.045) {
    const c = this.c, f0 = N(semi + 24); const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f0 * 0.97, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.09);
    const vib = c.createOscillator(); vib.frequency.value = 5.2; const vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f0 * 0.012, t + Math.min(0.6, dur * 0.5)); vib.connect(vg); vg.connect(o.frequency);
    const g = c.createGain(); this.route(g, 0.7); const end = this.env(g, t, 0.12, vol, Math.max(0, dur - 0.4), 0.45); o.connect(g); o.start(t); o.stop(end + 0.05); vib.start(t); vib.stop(end + 0.05);
    const b = this.filt('bandpass', f0 * 2, 1.5); const bg = c.createGain(); this.env(bg, t, 0.05, vol * 0.25, 0.05, 0.3); this.nz(t, t + 0.5).connect(b); b.connect(bg); this.route(bg, 0.5); // breath
  }
  pluck(t, semi, vol = 0.05) { const g = this.c.createGain(); this.route(g, 0.55); const end = this.env(g, t, 0.004, vol, 0, 1.3); this.osc('triangle', N(semi + 12), t, end).connect(g); const g2 = this.c.createGain(); this.route(g2, 0.4); this.env(g2, t, 0.002, vol * 0.4, 0, 0.35); this.osc('sine', N(semi + 24), t, end).connect(g2); }
  bass(t, semi, dur, vol = 0.09, lp = 380) { const g = this.c.createGain(); const f = this.filt('lowpass', lp, 2.2); f.frequency.setValueAtTime(lp * 2.4, t); f.frequency.exponentialRampToValueAtTime(lp, t + dur * 0.8); g.connect(f); this.route(f, 0.08); const end = this.env(g, t, 0.006, vol, dur * 0.4, dur * 0.6); this.osc('sawtooth', N(semi - 12), t, end).connect(g); this.osc('square', N(semi - 24), t, end, { detune: 5 }).connect(g); }
  kick(t, vol = 0.5) { const g = this.c.createGain(); this.route(g, 0.05); const end = this.env(g, t, 0.003, vol, 0, 0.42); this.osc('sine', 130, t, end, { glide: 38, glideT: t + 0.16 }).connect(g); }
  taiko(t, vol = 0.55, pitch = 1) {
    const g = this.c.createGain(); this.route(g, 0.55); const end = this.env(g, t, 0.004, vol, 0, 0.9); this.osc('sine', 92 * pitch, t, end, { glide: 44 * pitch, glideT: t + 0.3 }).connect(g);
    const f = this.filt('lowpass', 700, 0.6); const ng = this.c.createGain(); this.env(ng, t, 0.002, vol * 0.6, 0, 0.22); this.nz(t, t + 0.3, Audio.brownBuf).connect(f); f.connect(ng); this.route(ng, 0.6);
    const f2 = this.filt('bandpass', 2200, 1); const sg = this.c.createGain(); this.env(sg, t, 0.001, vol * 0.18, 0, 0.05); this.nz(t, t + 0.08).connect(f2); f2.connect(sg); this.route(sg, 0.3); // stick
  }
  snare(t, vol = 0.18) { const f = this.filt('highpass', 1400, 0.6); const g = this.c.createGain(); this.env(g, t, 0.001, vol, 0, 0.16); this.nz(t, t + 0.2).connect(f); f.connect(g); this.route(g, 0.35); const g2 = this.c.createGain(); this.route(g2, 0.2); const e2 = this.env(g2, t, 0.002, vol * 0.7, 0, 0.09); this.osc('triangle', 190, t, e2, { glide: 150 }).connect(g2); }
  hat(t, vol = 0.04, open = false) { const f = this.filt('highpass', 7200, 0.7); const g = this.c.createGain(); this.env(g, t, 0.001, vol, 0, open ? 0.22 : 0.035); this.nz(t, t + 0.3).connect(f); f.connect(g); this.route(g, 0.1); }
  braam(t, semi = DM, dur = 3.2, vol = 0.16) {
    const c = this.c, g = c.createGain(); const f = this.filt('lowpass', 180, 1.6); f.frequency.setValueAtTime(180, t); f.frequency.exponentialRampToValueAtTime(1900, t + 0.18); f.frequency.exponentialRampToValueAtTime(420, t + dur * 0.8);
    g.connect(f); this.route(f, 0.55); const end = this.env(g, t, 0.025, vol, dur * 0.35, dur * 0.65);
    for (const [s, d] of [[semi - 12, -9], [semi - 12, 8], [semi - 5, -4], [semi, 6], [semi + 3, -6]]) this.osc('sawtooth', N(s), t, end, { detune: d }).connect(g);
    const sub = c.createGain(); this.route(sub, 0); this.env(sub, t, 0.02, vol * 1.6, dur * 0.3, dur * 0.7); this.osc('sine', N(semi - 24), t, end).connect(sub);
    const nf = this.filt('lowpass', 900, 0.5); const ng = c.createGain(); this.env(ng, t, 0.004, vol * 0.8, 0, 0.6); this.nz(t, t + 0.7, Audio.brownBuf).connect(nf); nf.connect(ng); this.route(ng, 0.6);
  }
  boom(t, vol = 0.5, len = 4) { const g = this.c.createGain(); this.route(g, 0.5); const end = this.env(g, t, 0.01, vol, 0, len); this.osc('sine', 58, t, end, { glide: 24, glideT: t + len * 0.8 }).connect(g); const f = this.filt('lowpass', 160, 0.5); const ng = this.c.createGain(); this.env(ng, t, 0.02, vol * 0.7, 0, len * 0.8); this.nz(t, t + len, Audio.brownBuf).connect(f); f.connect(ng); this.route(ng, 0.6); }
  riser(t, dur, vol = 0.07) { const f = this.filt('bandpass', 300, 2.2); f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(5200, t + dur); const g = this.c.createGain(); this.env(g, t, dur * 0.92, vol, 0, 0.05); this.nz(t, t + dur).connect(f); f.connect(g); this.route(g, 0.4); const g2 = this.c.createGain(); this.route(g2, 0.3); this.env(g2, t, dur * 0.95, vol * 0.4, 0, 0.04); this.osc('sawtooth', N(0), t, t + dur, { glide: N(24) }).connect(g2); }
  revCym(t, dur = 1.6, vol = 0.12) { const f = this.filt('highpass', 3000, 0.5); const g = this.c.createGain(); const p = g.gain; p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(vol, t + dur); p.setValueAtTime(0.0001, t + dur + 0.01); this.nz(t, t + dur + 0.02).connect(f); f.connect(g); this.route(g, 0.5); }
  strings(t, semis, dur, vol = 0.035) { const c = this.c, g = c.createGain(); const f = this.filt('lowpass', 2600, 0.5); const trem = c.createOscillator(); trem.frequency.value = 11; const tg = c.createGain(); tg.gain.value = 0.45; trem.connect(tg); const am = c.createGain(); am.gain.value = 0.55; tg.connect(am.gain); am.connect(g); g.connect(f); this.route(f, 0.7); const end = this.env(g, t, dur * 0.6, vol, dur * 0.3, 0.6); trem.start(t); trem.stop(end + 0.05); for (const s of semis) for (const d of [-5, 7]) this.osc('sawtooth', N(s + 24), t, end, { detune: d }).connect(am); }
  heart(t, vol = 0.35) { this.kick(t, vol); this.kick(t + 0.22, vol * 0.65); }
  hit(t, vol = 0.2) { this.braam(t, DM, 2.2, vol); this.taiko(t, 0.7, 0.8); this.boom(t, 0.35, 3); }
  // ------------------------------------------------------------------ the cue sheet (edit times, seconds)
  build(hits = {}) {
    const E = [], at = (t, fn) => E.push({ t, fn });
    const blast = hits.blast ?? 78.17;
    // ===== ACT I — postcards (0 – 26): drone, flute, plucked arpeggios, swell
    at(0.2, (w) => this.drone(w, 26));
    at(0.4, (w) => this.pad(w, [DM, DM + 7, DM + 15], 8, 0.022, { att: 3, lp: 700, type: 'triangle' }));
    const arp = [0, 3, 7, 10, 12, 10, 7, 3]; for (let b = 0; b < 12; b++) { const root = [DM, DM, BB, BB, FF, FF, CC, CC, DM, DM, BB, CC][b]; for (let k = 0; k < 4; k++) at(2 + b * 2 + k * 0.5, (w) => this.pluck(w, root + arp[(b * 4 + k) % 8], b < 2 ? 0.025 : 0.04)); }
    const line = [[3.0, 12, 1.4], [4.5, 15, 0.9], [5.5, 17, 1.8], [8.2, 19, 1.0], [9.3, 17, 0.8], [10.2, 15, 2.2], [13.0, 12, 1.6], [14.8, 10, 1.0], [15.8, 7, 2.4], [17.4, 12, 0.8], [18.3, 15, 0.8], [19.2, 17, 1.0], [20.3, 19, 1.4], [22.0, 22, 0.8], [22.9, 19, 0.6], [23.6, 17, 2.0]];
    for (const [t, s, d] of line) at(t, (w) => this.flute(w, s, d));
    at(8, (w) => this.pad(w, [BB, BB + 7, BB + 16], 8, 0.022, { att: 2.5, lp: 800, type: 'triangle' }));
    at(16, (w) => this.pad(w, [FF, FF + 7, FF + 16], 6, 0.024, { att: 2.5, lp: 900, type: 'triangle' }));
    at(21, (w) => this.strings(w, [DM, FF, DM + 12], 5, 0.03));
    at(22, (w) => this.riser(w, 4, 0.06)); at(24.4, (w) => this.revCym(w, 1.6, 0.1));
    for (let k = 0; k < 8; k++) at(22 + k * 0.5, (w) => this.taiko(w, 0.12 + k * 0.035, 1.2));
    // ===== ACT II — the crew (26 – 48)
    at(26, (w) => this.hit(w, 0.2));
    for (let b = 0; b < 7; b++) { // 27 … 40.5: pulse
      const root = [DM, DM, BB, BB, GM, GM, CC][b]; const t0 = 27 + b * 2;
      for (let k = 0; k < 8; k++) { const tt = t0 + k * 0.25; if (tt < 40.4) at(tt, (w) => this.bass(w, root + (k % 4 === 3 ? 7 : 0), 0.2, 0.065, 300)); }
      for (let k = 0; k < 4; k++) { const tt = t0 + k * 0.5; if (tt < 40.4) at(tt, (w) => this.hat(w, k % 2 ? 0.03 : 0.018)); }
      if (t0 < 40.4) { at(t0, (w) => this.kick(w, 0.42)); if (t0 + 1 < 40.4) at(t0 + 1, (w) => this.kick(w, 0.3)); }
    }
    at(27, (w) => this.pad(w, [DM, DM + 7, DM + 15], 13.5, 0.03, { att: 1.5, lp: 1100 }));
    for (const t of [27.5, 32.0, 36.5]) at(t, (w) => { this.taiko(w, 0.55, 0.85); this.boom(w, 0.22, 2.2); });
    at(40.5, (w) => this.hit(w, 0.22)); // ONE CITY.
    for (let b = 0; b < 3; b++) { const t0 = 41.5 + b * 1.5; const root = [DM, BB, CC][b]; for (let k = 0; k < 12; k++) { const tt = t0 + k * 0.125; if (tt < 46) at(tt, (w) => this.bass(w, root, 0.11, 0.06 + b * 0.012, 340)); } }
    at(41.5, (w) => this.strings(w, [DM, FF, AA(), DM + 12], 4.5, 0.04));
    for (let k = 0; k < 9; k++) at(41.5 + k * 0.5, (w) => this.kick(w, 0.3 + k * 0.03));
    for (let k = 0; k < 8; k++) at(44 + k * 0.25, (w) => this.snare(w, 0.05 + k * 0.02));
    at(46, (w) => { this.braam(w, BB, 2.2, 0.2); this.boom(w, 0.45, 2.5); }); // NO WAY BACK.
    at(46.6, (w) => this.riser(w, 1.4, 0.07)); at(46.4, (w) => this.revCym(w, 1.6, 0.12));
    // ===== ACT III — the getaway (48 – 92)
    at(48, (w) => { this.taiko(w, 0.65, 0.8); this.boom(w, 0.3, 2); });
    for (let k = 0; k < 9; k++) at(48.5 + k * 0.5, (w) => this.bass(w, DM, 0.3, 0.06 + k * 0.004, 300)); // engine idle pulse under the dialogue
    for (let k = 0; k < 5; k++) at(50 + k * 0.5, (w) => this.taiko(w, 0.18 + k * 0.05, 1.1));
    at(52.5, (w) => { this.braam(w, DM, 1.6, 0.17); this.taiko(w, 0.6, 0.75); });
    // drift slow-mo drop-out 53 – 57: heartbeat + a high string, then a reverse cymbal into the drop
    at(53.2, (w) => this.strings(w, [DM + 12, DM + 19], 4.4, 0.022));
    for (const t of [53.6, 54.6, 55.6, 56.6]) at(t, (w) => this.heart(w, 0.3));
    at(56.4, (w) => this.revCym(w, 1.6, 0.13));
    // the drop 58 – 74.5: taiko groove, 16th bass ostinato, braams every two bars
    const prog = [DM, DM, BB, BB, FF, FF, CC, CC];
    for (let b = 0; b < 8; b++) { const t0 = 58 + b * 2; if (t0 >= 74.5) break; const root = prog[b];
      for (let k = 0; k < 16; k++) { const tt = t0 + k * 0.125; if (tt < 74.4) at(tt, (w) => this.bass(w, root + (k === 6 || k === 14 ? 7 : k === 11 ? 3 : 0), 0.1, 0.07, 360)); }
      for (const [o, v, p] of [[0, 0.6, 0.8], [0.75, 0.32, 1.1], [1.0, 0.5, 0.9], [1.5, 0.3, 1.25], [1.75, 0.34, 1.1]]) { const tt = t0 + o; if (tt < 74.4) at(tt, (w) => this.taiko(w, v, p)); }
      for (let k = 0; k < 8; k++) { const tt = t0 + k * 0.25; if (tt < 74.4) at(tt, (w) => this.hat(w, k % 2 ? 0.035 : 0.02, k === 7)); }
      if (t0 + 0.5 < 74.4) { at(t0 + 0.5, (w) => this.snare(w, 0.14)); at(t0 + 1.5, (w) => this.snare(w, 0.14)); }
      if (b % 2 === 0) at(t0, (w) => this.braam(w, root, 1.9, 0.13));
    }
    at(58, (w) => this.strings(w, [DM, FF, AA(), DM + 12], 8, 0.03)); at(66, (w) => this.strings(w, [FF - 12, FF, AA(), CC + 12], 8.4, 0.033));
    at(72.5, (w) => this.riser(w, 2, 0.06));
    // the ambush 74.5 – 78: slow motion, everything thins to a heartbeat and a held chord
    at(74.5, (w) => { this.taiko(w, 0.55, 0.7); this.pad(w, [DM - 12, DM, DM + 7], 3.6, 0.04, { att: 0.3, lp: 600 }); });
    for (const t of [75.0, 76.1, 77.2]) at(t, (w) => this.heart(w, 0.32));
    at(76.5, (w) => this.revCym(w, blast - 76.5, 0.12));
    // the explosion: everything stops, then the ears ring (Audio.concuss) — the music comes back at 83
    at(blast, (w) => { this.boom(w, 0.6, 5); this.braam(w, DM, 3.5, 0.15); });
    at(80.5, (w) => this.strings(w, [DM + 12, DM + 24], 2.6, 0.018));
    at(82.2, (w) => this.revCym(w, 0.8, 0.1));
    for (let b = 0; b < 3; b++) { const t0 = 83 + b * 1.0; const root = [CC, BB, CC][b]; for (let k = 0; k < 8; k++) { const tt = t0 + k * 0.125; at(tt, (w) => this.bass(w, root, 0.1, 0.07, 380)); } for (const o of [0, 0.5, 0.75]) at(t0 + o, (w) => this.taiko(w, 0.45, 0.95)); }
    // the walk away 86 – 92: snare roll accelerating, ostinato climbing, riser into black
    for (let b = 0; b < 3; b++) { const t0 = 86 + b * 2; const root = [DM, BB, CC][b]; for (let k = 0; k < 16; k++) { const tt = t0 + k * 0.125; at(tt, (w) => this.bass(w, root + (b === 2 && k >= 8 ? 2 : 0), 0.1, 0.07 + b * 0.01, 380 + b * 60)); } at(t0, (w) => this.braam(w, root, 1.8, 0.13)); at(t0, (w) => this.taiko(w, 0.6, 0.8)); at(t0 + 1, (w) => this.taiko(w, 0.5, 0.9)); }
    { let tt = 88; let step = 0.25; while (tt < 91.95) { const v = 0.05 + ((tt - 88) / 4) * 0.2; at(tt, (w) => this.snare(w, v)); tt += step; step = Math.max(0.0625, step * 0.93); } }
    at(86, (w) => this.strings(w, [DM, FF, AA(), DM + 12, FF + 12], 6, 0.04)); at(88.5, (w) => this.riser(w, 3.5, 0.08)); at(90.4, (w) => this.revCym(w, 1.6, 0.14));
    // 92 – 94: silence under the last line. 94: the title
    at(94, (w) => { this.hit(w, 0.26); this.pad(w, [DM - 12, DM, DM + 7, DM + 15], 4, 0.05, { att: 0.05, lp: 1400 }); });
    at(96, (w) => this.pad(w, [BB - 12, BB, BB + 7, BB + 16], 2.2, 0.045, { att: 0.3, lp: 1300 })); at(98, (w) => this.pad(w, [FF - 12, FF, FF + 7, FF + 16], 2.2, 0.045, { att: 0.3, lp: 1300 })); at(100, (w) => this.pad(w, [CC - 12, CC, CC + 7, CC + 16], 2.2, 0.045, { att: 0.3, lp: 1300 }));
    for (let k = 0; k < 4; k++) at(94 + k * 2, (w) => { this.taiko(w, 0.5, 0.8); this.taiko(w + 1.0, 0.32, 1.0); });
    at(95, (w) => this.flute(w, 12, 2.2, 0.035)); at(97.3, (w) => this.flute(w, 15, 1.0, 0.035)); at(98.4, (w) => this.flute(w, 17, 2.6, 0.035));
    at(102.4, (w) => { this.braam(w, DM, 4.5, 0.12); this.boom(w, 0.4, 5); this.pad(w, [DM - 12, DM, DM + 7], 6, 0.035, { att: 0.5, lp: 900, type: 'triangle' }); });
    E.sort((a, b) => a.t - b.t); this.ev = E; this.i = 0;
  }
  start(t0) { if (!this.ok) return; this.t0 = t0; }
  // schedule everything due within the look-ahead window (called every frame with the current edit time)
  update(e) { if (!this.ok) return; const E = this.ev; while (this.i < E.length && E[this.i].t < e + 0.35) { const ev = E[this.i++]; if (ev.t < e - 0.15) continue; try { ev.fn(Math.max(this.c.currentTime + 0.005, this.t0 + ev.t)); } catch (err) { console.warn('trailer score', err); } } }
  seek(e) { if (!this.ok) return; let i = 0; while (i < this.ev.length && this.ev[i].t < e) i++; this.i = i; }
  fadeOut(sec = 0.6) { if (!this.ok) return; const t = this.c.currentTime; for (const g of [this.out, this.sfx]) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + sec); } this.stopLoops(); }
  // ------------------------------------------------------------------ live trailer sound design (driven per frame by the runtime)
  // continuous voices: tyre screech + police sirens (Doppler from the radial speed relative to the camera)
  loop(key, make) { if (!this.loops) this.loops = new Map(); let L = this.loops.get(key); if (!L) { L = make(); this.loops.set(key, L); } return L; }
  screech(k, pan = 0, rate = 1) {
    if (!this.ok) return; const c = this.c, t = c.currentTime;
    const L = this.loop('screech', () => { const s = c.createBufferSource(); s.buffer = Audio.noiseBuf; s.loop = true; const b1 = this.filt('bandpass', 2100, 9), b2 = this.filt('bandpass', 3300, 7); const g = c.createGain(); g.gain.value = 0; const p = c.createStereoPanner(); s.connect(b1); s.connect(b2); b1.connect(g); b2.connect(g); g.connect(p); p.connect(this.sfx); s.start(); const lfo = c.createOscillator(); lfo.frequency.value = 23; const lg = c.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(b1.frequency); lfo.start(); return { s, b1, b2, g, p, lfo }; });
    L.g.gain.setTargetAtTime(Math.min(0.5, k * 0.55), t, 0.05); L.p.pan.setTargetAtTime(pan, t, 0.05); L.b1.frequency.setTargetAtTime(2100 * (0.55 + 0.45 * rate), t, 0.05); L.b2.frequency.setTargetAtTime(3300 * (0.55 + 0.45 * rate), t, 0.05); L.s.playbackRate.setTargetAtTime(0.4 + 0.6 * rate, t, 0.05);
  }
  siren(key, on, gain, pan, doppler, simT, rate = 1) {
    if (!this.ok) return; const c = this.c, t = c.currentTime;
    const L = this.loop('siren' + key, () => { const o1 = c.createOscillator(); o1.type = 'square'; const o2 = c.createOscillator(); o2.type = 'sawtooth'; const bp = this.filt('bandpass', 1100, 0.8); const g = c.createGain(); g.gain.value = 0; const p = c.createStereoPanner(); o1.connect(bp); o2.connect(bp); bp.connect(g); g.connect(p); p.connect(this.sfx); const vs = c.createGain(); vs.gain.value = 0.25; g.connect(vs); vs.connect(Audio.verb); o1.start(); o2.start(); return { o1, o2, g, p }; });
    const k = (simT * 1) / 3.4, ph = k - Math.floor(k); const wail = 620 + 760 * (ph < 0.5 ? ph * 2 : 2 - ph * 2); const f = wail * doppler * (0.6 + 0.4 * rate);
    L.o1.frequency.setTargetAtTime(f, t, 0.03); L.o2.frequency.setTargetAtTime(f * 1.005, t, 0.03); L.g.gain.setTargetAtTime(on ? Math.min(0.09, gain * 0.09) : 0, t, 0.08); L.p.pan.setTargetAtTime(pan, t, 0.08);
  }
  stopLoops() { if (!this.loops) return; const t = this.c.currentTime; for (const L of this.loops.values()) L.g.gain.setTargetAtTime(0, t, 0.05); }
  // one rifle shot (pitched and stretched in slow motion); gain / pan from the camera position
  gun(gain, pan, rate = 1, dist = 20) {
    if (!this.ok || gain < 0.02) return; const c = this.c, t = c.currentTime + 0.005; const r = Math.max(0.3, Math.min(1, rate)); const st = 1 / r;
    const f = this.filt('lowpass', 5200 * (0.4 + 0.6 * r), 0.6); const g = c.createGain(); this.env(g, t, 0.001, 0.5 * gain, 0, 0.09 * st); this.nz(t, t + 0.2 * st).connect(f); f.connect(g); const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfx);
    const g2 = c.createGain(); this.env(g2, t, 0.002, 0.35 * gain, 0, 0.16 * st); const o = this.osc('sine', 160 * r, t, t + 0.25 * st, { glide: 55 * r }); o.connect(g2); g2.connect(p);
    const tail = this.filt('lowpass', 520, 0.5); const g3 = c.createGain(); this.env(g3, t + 0.03 + Math.min(0.2, dist / 340), 0.02, 0.22 * gain, 0, 0.9 * st); this.nz(t, t + 1.4 * st, Audio.brownBuf).connect(tail); tail.connect(g3); g3.connect(p); const vs = c.createGain(); vs.gain.value = 0.4; g3.connect(vs); vs.connect(Audio.verb);
  }
  ping(gain, pan) { if (!this.ok || gain < 0.03) return; const c = this.c, t = c.currentTime; const g = c.createGain(); this.env(g, t, 0.001, 0.12 * gain, 0, 0.18); const o = this.osc('triangle', 2600 + Math.random() * 1600, t, t + 0.2, { glide: 1800 }); const p = c.createStereoPanner(); p.pan.value = pan; o.connect(g); g.connect(p); p.connect(this.sfx); } // bullet on bodywork
  whoosh(vol = 0.12, dur = 0.7, pan = 0) { if (!this.ok) return; const c = this.c, t = c.currentTime; const f = this.filt('bandpass', 400, 1.2); f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.5); f.frequency.exponentialRampToValueAtTime(500, t + dur); const g = c.createGain(); this.env(g, t, dur * 0.45, vol, 0, dur * 0.55); const p = c.createStereoPanner(); p.pan.value = pan; this.nz(t, t + dur).connect(f); f.connect(g); g.connect(p); p.connect(this.sfx); }
  door(vol = 0.3) { if (!this.ok) return; const c = this.c, t = c.currentTime; const f = this.filt('lowpass', 170, 0.8); const g = c.createGain(); this.env(g, t, 0.002, vol, 0, 0.22); this.nz(t, t + 0.3, Audio.brownBuf).connect(f); f.connect(g); g.connect(this.sfx); const g2 = c.createGain(); this.env(g2, t, 0.002, vol * 0.5, 0, 0.16); this.osc('sine', 75, t, t + 0.2, { glide: 50 }).connect(g2); g2.connect(this.sfx); }
  rev(vol = 0.2, dur = 1.6) { if (!this.ok) return; const c = this.c, t = c.currentTime; const g = c.createGain(); const f = this.filt('lowpass', 500, 2); f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + dur * 0.5); f.frequency.exponentialRampToValueAtTime(700, t + dur); g.connect(f); f.connect(this.sfx); this.env(g, t, 0.05, vol, dur * 0.3, dur * 0.65); this.osc('sawtooth', 48, t, t + dur, { glide: 190, glideT: t + dur * 0.5 }).connect(g); this.osc('square', 24, t, t + dur, { glide: 95, glideT: t + dur * 0.5 }).connect(g); }
}
function AA() { return 7; } // A above D2 (the fifth): named for readability in the chord lists
function hallIR(c, sec) { const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const k = i / n; lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4; d[i] = lp * Math.pow(1 - k, 2.6) * (i < c.sampleRate * 0.012 ? i / (c.sampleRate * 0.012) : 1); } } return b; }
