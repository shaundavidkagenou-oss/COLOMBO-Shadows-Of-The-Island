// Ceylon Meridian Bank sounds (67th): the banking-hall room tone and the ATM's own sounds. Each has a slot in the sounds
// window (SoundBank: bank.ambience, bank.chime, atm.beep, atm.card, atm.cash) — a supplied recording replaces the synthesised
// sound below. Levels are kept low (a quiet, air-conditioned hall); the room tone fades in on entering the bank and is
// fully stopped (sources released) a moment after leaving it.
import { Audio } from './Audio.js';
import { SoundBank as SB } from './SoundBank.js';

export const BankSound = {
  amb: null, on: false, evT: 3, chimeT: 30, printT: 18,
  // room tone: aircon hum (low brown noise), ventilation hiss, a soft murmur of voices that breathes slowly
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
  // per frame while the bank room is active: recording swap, random hall sounds while inside, release after leaving
  tick(dt, inside) {
    const A = Audio, m = this.amb; if (!A.ready || !A.ctx) return; const t = A.ctx.currentTime;
    if (m) { const rec = !!SB.syncLoop(m, "bank.ambience", m.g); if (rec !== m.rec) { m.rec = rec; m.og.gain.setTargetAtTime(rec ? 0 : 1, t, 0.3); }
      if (!this.on && m.stopAt && t > m.stopAt) this.release(); }
    if (!inside || !this.on) return;
    if ((this.evT -= dt) <= 0) { this.evT = 4 + Math.random() * 6; const n = 5 + Math.floor(Math.random() * 8); for (let i = 0; i < n; i++) A.noise(0.012, { f: 3200 + Math.random() * 900, q: 3, vol: 0.006 + Math.random() * 0.004, when: i * (0.07 + Math.random() * 0.09), pan: -0.3 + Math.random() * 0.6 }); } // a keyboard behind the counter
    if ((this.printT -= dt) <= 0) { this.printT = 22 + Math.random() * 25; A.noise(0.55, { f: 1500, q: 2.5, vol: 0.01, sweep: 2600, pan: 0.2 }); } // receipt printer
    if ((this.chimeT -= dt) <= 0) { this.chimeT = 35 + Math.random() * 40; this.chime(); } // queue display: next number
  },
  release() { const m = this.amb; if (!m) return; this.amb = null; try { SB.syncLoop(m, 'bank.ambience', null); } catch (e) { /* no recording */ } for (const s of m.srcs) { try { s.stop(); } catch (e) { /* already stopped */ } } try { m.g.disconnect(); } catch (e) { /* gone */ } },
  stopNow() { this.on = false; this.release(); },
  chime() { if (SB.play('bank.chime', 0.8)) return; Audio.tone(784, 0.45, { vol: 0.028, verb: true }); Audio.tone(659, 0.6, { vol: 0.026, when: 0.32, verb: true }); },
  beep(vol = 1) { if (SB.play('atm.beep', vol)) return; Audio.tone(1240, 0.055, { type: 'square', vol: 0.03 * vol, attack: 0.002 }); },
  card(out = false) { if (SB.play('atm.card', 0.9, 0, 0, { rate: out ? 1.08 : 1 })) return; Audio.noise(0.32, { f: out ? 1100 : 800, q: 2.2, vol: 0.045, sweep: out ? 1600 : 420, buf: Audio.brownBuf }); Audio.tone(140, 0.05, { vol: 0.05, when: 0.3 }); },
  // cash: the dispenser's transport whirring, the note pick clicking, the shutter opening (withdraw) / the counter riffling (deposit)
  cash(deposit = false) {
    if (SB.play('atm.cash', 0.9, 0, 0, { rate: deposit ? 1.12 : 1 })) return; const A = Audio;
    A.noise(1.15, { f: deposit ? 900 : 650, q: 3, vol: 0.045, sweep: deposit ? 1400 : 1050, buf: A.brownBuf });
    for (let i = 0; i < 14; i++) A.noise(0.02, { f: 2400, q: 4, vol: 0.022, when: 0.18 + i * (deposit ? 0.045 : 0.06) });
    A.noise(0.12, { f: 320, q: 1, vol: 0.07, type: 'lowpass', when: deposit ? 0.95 : 1.35, buf: A.brownBuf });
  },
};
