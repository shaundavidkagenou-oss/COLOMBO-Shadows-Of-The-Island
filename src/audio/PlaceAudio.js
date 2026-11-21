// 75th request — positional loops for places (and a few moving things), one small engine for all of them:
//   the hospital garden (fountain, birds, breeze, quiet chatter, crickets at night), Viharamahadevi Park (big fountain,
//   lily-pond jets, birds, breeze, people, night chorus + koel / crows / squirrel / vendor / ducks now and then), the
//   hospital's air conditioners (the bank's `bank.ac` recording), the lift ride, CPR compressions, BPM monitors.
// Callers describe what should be sounding THIS frame with PlaceSound.want(key, spec); PlaceSound.update() (once per
// frame, Game) makes it so: a loop is only built when it would be audible (gain > 0.01), fades in / out with the spec's
// times, and is fully released (sources stopped, nodes disconnected) a moment after it is no longer wanted. Nothing is
// allocated per frame for loops that already exist; a supplied recording (sounds window) replaces the synthesised
// placeholder through SoundBank.syncLoop, exactly like the bank and hospital loops.
import { Audio } from './Audio.js';
import { SoundBank as SB } from './SoundBank.js';
import { BankSound } from './BankAudio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const R = Math.random;

// ---- synthesised placeholders: (ctx, dest) → [sources]  (continuous parts) and tick(L, dt, g, pan) (scheduled parts)
function layer(c, dest, buf, type, f, q, vol, out) { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = vol; s.connect(fl); fl.connect(g); g.connect(dest); s.start(c.currentTime, R() * 2); out.push(s); return g; }
function lfo(c, target, f, depth, out) { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.value = depth; o.connect(g); g.connect(target); o.start(); out.push(o); }
export const SYNTH = {
  water(big) { return (c, d) => { const A = Audio, o = []; const g1 = layer(c, d, A.noiseBuf, 'bandpass', big ? 900 : 1400, 0.6, big ? 0.05 : 0.035, o); layer(c, d, A.noiseBuf, 'highpass', 3500, 0.5, big ? 0.018 : 0.012, o); layer(c, d, A.brownBuf, 'lowpass', 300, 0.7, big ? 0.05 : 0.02, o); lfo(c, g1.gain, 0.7 + R() * 0.5, big ? 0.015 : 0.01, o); return o; }; },
  breeze: (c, d) => { const o = []; const g = layer(c, d, Audio.brownBuf, 'bandpass', 520, 0.5, 0.03, o); layer(c, d, Audio.noiseBuf, 'bandpass', 2400, 0.4, 0.004, o); lfo(c, g.gain, 0.08, 0.022, o); return o; },
  hum: (c, d) => { const o = []; const s = c.createOscillator(); s.type = 'sawtooth'; s.frequency.value = 56; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; const g = c.createGain(); g.gain.value = 0.03; s.connect(f); f.connect(g); g.connect(d); s.start(); o.push(s); layer(c, d, Audio.brownBuf, 'lowpass', 180, 0.7, 0.05, o); layer(c, d, Audio.noiseBuf, 'bandpass', 1500, 2, 0.0025, o); return o; },
  ac: (c, d) => BankSound.acSynth(c, d),
  quiet: () => [],
};
// scheduled placeholder parts (only while not replaced by a recording): birds, chatter, crickets, compressions, monitor beeps
export const TICK = {
  birds(L, dt, g, pan) { if ((L.t -= dt) > 0) return; L.t = 0.4 + R() * 2.2; const f = 2200 + R() * 2600, n = 2 + ((R() * 5) | 0); for (let i = 0; i < n; i++) Audio.tone(f * (0.9 + R() * 0.25), 0.05 + R() * 0.06, { vol: 0.006 * g, pan: clamp(pan + (R() - 0.5) * 0.8, -1, 1), when: i * (0.07 + R() * 0.05), glide: f * (0.8 + R() * 0.5), out: 'amb' }); },
  chatter(L, dt, g, pan) { if ((L.t -= dt) > 0) return; L.t = 0.25 + R() * 0.6; Audio.noise(0.18 + R() * 0.3, { f: 330 + R() * 420, q: 4, vol: 0.006 * g, pan, out: 'amb', attack: 0.04 }); },
  people(L, dt, g, pan) { TICK.chatter(L, dt, g * 0.8, pan); if ((L.t2 = (L.t2 ?? 3) - dt) > 0) return; L.t2 = 2 + R() * 5; Audio.tone(900 + R() * 500, 0.18, { vol: 0.004 * g, pan: (R() - 0.5), glide: 1300 + R() * 400, out: 'amb' }); },
  crickets(L, dt, g, pan) { if ((L.t -= dt) > 0) return; L.t = 0.18 + R() * 0.12; for (let i = 0; i < 3; i++) Audio.tone(4300 + R() * 300, 0.025, { vol: 0.004 * g, pan: clamp(pan + (R() - 0.5), -1, 1), when: i * 0.045, out: 'amb' }); },
  cpr(L, dt, g, pan) { if ((L.t -= dt) > 0) return; L.t = 0.55; Audio.noise(0.09, { f: 140, q: 0.8, vol: 0.06 * g, pan, type: 'lowpass' }); Audio.noise(0.05, { f: 900, q: 2, vol: 0.012 * g, pan, when: 0.02 }); },
  monitor(L, dt, g, pan, s) { if ((L.t -= dt) > 0) return; L.t = 60 / (s.bpm || 72); Audio.tone(960, 0.08, { vol: 0.012 * g, pan, out: 'amb' }); },
};

export const PlaceSound = {
  loops: new Map(), L: { x: 0, z: 0, yaw: 0 }, frame: 0, stats: { built: 0, released: 0, live: 0 },
  // spec: { id (sound-board slot), x, z, ref (m: full level within ~ref), lvl, fadeIn, fadeOut (s), synth, tick, bpm, out ('amb'|'sfx') }
  want(key, spec) { const L = this.loops.get(key); if (L) { L.spec = spec; L.seen = this.frame; return L; } const g = this.gainFor(spec); if (g < 0.01) return null; return this.build(key, spec); },
  gainFor(s) { const d = Math.hypot(s.x - this.L.x, s.z - this.L.z); const ref = s.ref || 6; return clamp(ref / (ref + d * d * 0.12), 0, 1) * (s.lvl ?? 1); },
  build(key, spec) {
    const A = Audio; if (!A.ready || !A.ctx) return null; const c = A.ctx;
    const inG = c.createGain(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 12000; const out = c.createGain(); out.gain.value = 0; const p = c.createStereoPanner();
    inG.connect(lp); lp.connect(out); out.connect(p); p.connect(spec.out === 'sfx' ? A.bus.sfx : A.bus.amb); const syn = c.createGain(); syn.gain.value = 1; syn.connect(lp);
    const L = { key, spec, inG, lp, out, p, syn, srcs: [], synSrcs: spec.synth ? spec.synth(c, syn) : [], rec: false, t: R(), seen: this.frame, g: 0 };
    this.loops.set(key, L); this.stats.built++; return L;
  },
  release(L) { try { SB.syncLoop(L, L.spec.id, null); } catch { /* none */ } for (const s of L.srcs.concat(L.synSrcs)) { try { s.stop(); } catch { /* stopped */ } } try { L.p.disconnect(); } catch { /* gone */ } this.loops.delete(L.key); this.stats.released++; },
  update(dt, x, z, yaw) {
    this.L.x = x; this.L.z = z; this.L.yaw = yaw; const A = Audio; if (!A.ready || !A.ctx) { this.frame++; return; } const t = A.ctx.currentTime; const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const L of this.loops.values()) { const s = L.spec; const wanted = L.seen === this.frame; const target = wanted ? this.gainFor(s) : 0;
      const rec = !!SB.syncLoop(L, s.id, L.inG); if (rec !== L.rec) { L.rec = rec; L.syn.gain.setTargetAtTime(rec ? 0 : 1, t, 0.2); }
      const tc = target > L.g ? (s.fadeIn ?? 0.4) : (s.fadeOut ?? 0.5); L.g += (target - L.g) * Math.min(1, dt / Math.max(0.02, tc));
      const dx = s.x - x, dz = s.z - z, d = Math.hypot(dx, dz); const pan = -clamp((dx * rx + dz * rz) / (d + 1), -1, 1) * 0.8;
      L.out.gain.setTargetAtTime(L.g, t, 0.05); L.p.pan.setTargetAtTime(pan, t, 0.1); L.lp.frequency.setTargetAtTime(clamp(16000 / (1 + d / 6), 1800, 16000), t, 0.2);
      if (!L.rec && s.tick && L.g > 0.02) s.tick(L, dt, L.g, pan, s);
      if (!wanted && L.g < 0.004) L.dead = (L.dead || 0) + dt; else L.dead = 0; if (L.dead > 0.6) this.release(L); }
    this.stats.live = this.loops.size; this.frame++;
  },
  // a one-shot at a point (recording or placeholder)
  shot(id, x, z, ref = 12, k = 1, synth = null) { if (!Audio.ready || !Audio.ctx) return; const A = Audio.at(x, z, ref); if (A.g < 0.01) return; if (SB.play(id, A.g * k, A.pan, 0, { lp: A.lp, verb: true, wet: 0.25 })) return; if (synth) synth(A.g * k, A.pan); },
  stopAll() { for (const L of [...this.loops.values()]) this.release(L); },
};
