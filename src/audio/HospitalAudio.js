// 74th request — National Hospital sounds. Every sound has its own slot in the sounds window, Hospital section (SoundBank:
// hosp.*): a supplied recording replaces the synthesised placeholder below. Nothing here runs continuously while the
// player is away: the room tone and the positional loops fade in when the hospital's interior becomes active (player
// inside, or right at the doors) and are fully released (sources stopped, nodes disconnected) a moment after leaving.
//   loops (positional, seamless — SoundBank.loopBuffer): hall room tone (hosp.ambience: aircon + ventilation + distant
//     voices, follows the player), reception chatter (hosp.chatter: at the registration counter), the ward's monitor
//     (hosp.monitor: a slow patient-monitor beep at the bed that has one)
//   one-shots at a point: footsteps on vinyl / terrazzo, sliding entrance doors, swing doors (open / close), the lift
//     (ding, doors, motor), the desk phone, the PA chime + announcement, the water cooler, sanitiser, bed creak,
//     the invoice printer, the ambulance reversing beeper
//   voices: the four recovery lines and the receptionist's lines (shown as subtitles; a recording plays when supplied)
import { Audio } from './Audio.js';
import { SoundBank as SB } from './SoundBank.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export { RECOVERY_LINES, RECEPTION_LINES, HOSPITAL_SOUND_DEFS } from './HospitalSoundDefs.js';

export const HospitalSound = {
  on: false, amb: null, loops: [], L: { x: 0, z: 0 }, annT: 90, stats: { shots: 0, voices: 0, announce: 0 },
  // a one-shot at a world point: the recording when there is one, else the synthesised placeholder
  shot(id, x, z, ref = 10, k = 1, synth = null) {
    if (!Audio.ready || !Audio.ctx) return; const A = Audio.at(x, z, ref); if (A.g < 0.01) return; this.stats.shots++;
    if (SB.play(id, A.g * k, A.pan, 0, { lp: A.lp, verb: true, wet: 0.35 })) return; if (synth) synth(A.g * k, A.pan);
  },
  step(x, z) { this.shot('hosp.step', x, z, 5, 0.8, (g, pan) => { Audio.noise(0.05, { f: 900 + Math.random() * 300, q: 1.2, vol: 0.035 * g, pan }); Audio.noise(0.03, { f: 3200, q: 2, vol: 0.012 * g, pan, when: 0.012 }); }); },
  slide(x, z) { this.shot('hosp.door.slide', x, z, 10, 1, (g, pan) => { Audio.noise(1.0, { f: 260, q: 0.8, vol: 0.05 * g, pan, attack: 0.15, type: 'lowpass' }); Audio.noise(0.9, { f: 1800, q: 3, vol: 0.012 * g, pan, attack: 0.2, sweep: 1200 }); }); },
  door(x, z, open) { this.shot(open ? 'hosp.door.open' : 'hosp.door.close', x, z, 8, 1, (g, pan) => { if (open) { Audio.noise(0.04, { f: 2400, q: 3, vol: 0.05 * g, pan }); Audio.noise(0.25, { f: 500, q: 1.5, vol: 0.02 * g, pan, when: 0.05, sweep: 300 }); } else { Audio.noise(0.08, { f: 180, q: 0.8, vol: 0.08 * g, pan, type: 'lowpass' }); Audio.noise(0.03, { f: 2600, q: 3, vol: 0.05 * g, pan, when: 0.05 }); } }); },
  liftDing(x, z) { this.shot('hosp.lift.ding', x, z, 8, 1, (g, pan) => { Audio.tone(1318, 0.5, { vol: 0.05 * g, pan }); Audio.tone(1046, 0.7, { vol: 0.05 * g, pan, when: 0.32 }); }); },
  liftDoors(x, z) { this.shot('hosp.lift.doors', x, z, 7, 1, (g, pan) => Audio.noise(0.9, { f: 700, q: 1.2, vol: 0.03 * g, pan, attack: 0.1 })); },
  liftMotor(x, z) { this.shot('hosp.lift.motor', x, z, 7, 1, (g, pan) => { Audio.tone(58, 3.6, { type: 'sawtooth', vol: 0.02 * g, pan, attack: 0.6 }); Audio.noise(3.6, { f: 160, q: 0.7, vol: 0.03 * g, pan, attack: 0.6, type: 'lowpass' }); }); },
  phone(x, z) { this.shot('hosp.phone', x, z, 10, 1, (g, pan) => { for (let i = 0; i < 2; i++) for (let k = 0; k < 14; k++) Audio.tone(k % 2 ? 1100 : 900, 0.05, { type: 'square', vol: 0.012 * g, pan, when: i * 3 + k * 0.05 }); }); },
  trolley(x, z) { this.shot('hosp.trolley', x, z, 7, 1, (g, pan) => { Audio.noise(2.2, { f: 420, q: 1.5, vol: 0.02 * g, pan, attack: 0.3 }); for (let i = 0; i < 5; i++) Audio.noise(0.04, { f: 2000, q: 4, vol: 0.01 * g, pan, when: 0.3 + i * 0.4 }); }); },
  water(x, z) { this.shot('hosp.water', x, z, 6, 1, (g, pan) => { Audio.noise(1.6, { f: 1200, q: 0.6, vol: 0.03 * g, pan, attack: 0.1 }); Audio.tone(320, 0.12, { vol: 0.02 * g, pan, when: 1.5, glide: 520 }); }); },
  sanitizer(x, z) { this.shot('hosp.sanitizer', x, z, 5, 1, (g, pan) => { Audio.noise(0.08, { f: 900, q: 2, vol: 0.05 * g, pan }); Audio.noise(0.25, { f: 4000, q: 1, vol: 0.015 * g, pan, when: 0.06 }); }); },
  bed(x, z) { this.shot('hosp.bed', x, z, 6, 1, (g, pan) => { Audio.noise(0.35, { f: 600, q: 4, vol: 0.03 * g, pan, sweep: 420 }); Audio.noise(0.2, { f: 1400, q: 5, vol: 0.012 * g, pan, when: 0.15 }); }); },
  printer(x, z) { this.shot('hosp.printer', x, z, 6, 1, (g, pan) => { for (let i = 0; i < 6; i++) Audio.noise(0.18, { f: 1700, q: 3, vol: 0.02 * g, pan, when: i * 0.22, sweep: 2400 }); }); },
  reverseBeep(x, z) { this.shot('hosp.amb.reverse', x, z, 25, 1, (g, pan) => Audio.tone(1040, 0.42, { type: 'square', vol: 0.03 * g, pan, attack: 0.01 })); },
  // a spoken line: the recording if supplied (returns its length in s), else 0 — the caller shows the subtitle either way
  voice(id, x, z) { if (!Audio.ready || !Audio.ctx) return 0; this.stats.voices++; const A = Audio.at(x, z, 8); if (SB.play(id, Math.max(0.4, A.g), A.pan, 0, { verb: true, wet: 0.25 })) return SB.lastDur || 0; return 0; },
  // ---- PA: two-note chime, then the announcement (recording) or a muffled "voice" placeholder through a horn speaker
  announce() {
    if (!Audio.ready || !Audio.ctx) return; this.stats.announce++; if (SB.play('hosp.announce', 0.8, 0, 0, { hp: 300, verb: true, wet: 0.6 })) return;
    Audio.tone(784, 0.6, { vol: 0.04, verb: true }); Audio.tone(659, 0.9, { vol: 0.04, verb: true, when: 0.55 });
    for (let i = 0; i < 14; i++) Audio.noise(0.16 + Math.random() * 0.12, { f: 600 + Math.random() * 500, q: 3, vol: 0.012, when: 1.7 + i * 0.24, verb: true });
  },
  // ---- the interior's room tone + positional loops ---------------------------------------------------------------------
  listen(x, z) { this.L.x = x; this.L.z = z; },
  ambience(on) {
    this.on = on; const A = Audio; if (!A.ready || !A.ctx) return; const c = A.ctx, t = c.currentTime;
    if (on && !this.amb) {
      const g = c.createGain(); g.gain.value = 0; g.connect(A.bus.amb); const og = c.createGain(); og.gain.value = 1; og.connect(g); const srcs = [];
      const layer = (buf, type, f, q, vol) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const lg = c.createGain(); lg.gain.value = vol; s.connect(fl); fl.connect(lg); lg.connect(og); s.start(t, Math.random() * 2); srcs.push(s); return lg; };
      layer(A.brownBuf, 'lowpass', 120, 0.7, 0.06); layer(A.noiseBuf, 'bandpass', 2900, 0.4, 0.003); const mur = layer(A.brownBuf, 'bandpass', 470, 1.2, 0.016);
      const lfo = c.createOscillator(); lfo.frequency.value = 0.09; const lg = c.createGain(); lg.gain.value = 0.008; lfo.connect(lg); lg.connect(mur.gain); lfo.start(t); srcs.push(lfo);
      this.amb = { g, og, srcs, rec: false, stopAt: 0 };
    }
    const m = this.amb; if (!m) return; m.g.gain.cancelScheduledValues(t); m.g.gain.setTargetAtTime(on ? 1 : 0, t, on ? 0.6 : 0.25); m.stopAt = on ? 0 : t + 1.6;
  },
  loop(key, def) {
    const A = Audio; if (!A.ready || !A.ctx) return null; let L = this.loops.find((q) => q.key === key); if (L) return L; const c = A.ctx;
    const inG = c.createGain(); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 12000; const out = c.createGain(); out.gain.value = 0; const p = c.createStereoPanner();
    inG.connect(lp); lp.connect(out); out.connect(p); p.connect(A.bus.amb); const syn = c.createGain(); syn.gain.value = 1; syn.connect(lp);
    L = { key, def, inG, lp, out, p, syn, srcs: [], rec: false, beepT: 0 }; this.loops.push(L); return L;
  },
  // per frame while the hospital interior is active. srcs: [{ key, id, x, z, ref, lvl, on }] (world positions; reused array)
  tick(dt, inside, srcs, yaw = 0) {
    const A = Audio, m = this.amb; if (!A.ready || !A.ctx) return; const t = A.ctx.currentTime;
    if (m) { const rec = !!SB.syncLoop(m, 'hosp.ambience', m.g); if (rec !== m.rec) { m.rec = rec; m.og.gain.setTargetAtTime(rec ? 0 : 1, t, 0.3); } if (!this.on && m.stopAt && t > m.stopAt) this.release(); }
    if (srcs && this.on) for (const s of srcs) { const L = this.loop(s.key, s); if (!L) continue;
      const rec = !!SB.syncLoop(L, s.id, L.inG); if (rec !== L.rec) { L.rec = rec; L.syn.gain.setTargetAtTime(rec ? 0 : 1, t, 0.2); }
      const dx = s.x - this.L.x, dz = s.z - this.L.z, d = Math.hypot(dx, dz); const ref = s.ref || 6; const g = clamp(ref / (ref + d * d * 0.12), 0, 1) * (s.on === false ? 0 : 1) * (s.lvl ?? 1);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw); const pan = -clamp((dx * rx + dz * rz) / (d + 1), -1, 1) * 0.8;
      L.out.gain.setTargetAtTime(g, t, 0.15); L.p.pan.setTargetAtTime(pan, t, 0.1); L.lp.frequency.setTargetAtTime(clamp(16000 / (1 + d / 5), 2200, 16000), t, 0.2);
      if (!L.rec && s.id === 'hosp.monitor' && g > 0.03 && (L.beepT -= dt) <= 0) { L.beepT = 1.05; A.tone(1000, 0.09, { vol: 0.012 * g, pan, out: 'amb' }); } // synth monitor: one beep a second
      if (!L.rec && s.id === 'hosp.chatter' && g > 0.03 && (L.beepT -= dt) <= 0) { L.beepT = 0.25 + Math.random() * 0.5; A.noise(0.2 + Math.random() * 0.25, { f: 380 + Math.random() * 380, q: 4, vol: 0.006 * g, pan, out: 'amb', attack: 0.04 }); } }
    if (!inside || !this.on) return;
    if ((this.annT -= dt) <= 0) { this.annT = 140 + Math.random() * 120; this.announce(); }
  },
  release() {
    const m = this.amb; this.amb = null;
    if (m) { try { SB.syncLoop(m, 'hosp.ambience', null); } catch { /* none */ } for (const s of m.srcs) { try { s.stop(); } catch { /* stopped */ } } try { m.g.disconnect(); } catch { /* gone */ } }
    for (const L of this.loops) { try { SB.syncLoop(L, L.def.id, null); } catch { /* none */ } for (const s of L.srcs) { try { s.stop(); } catch { /* stopped */ } } try { L.p.disconnect(); } catch { /* gone */ } }
    this.loops = [];
  },
  stopNow() { this.on = false; this.release(); },
};
