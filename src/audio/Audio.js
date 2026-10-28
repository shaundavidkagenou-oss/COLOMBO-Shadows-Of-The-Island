// Procedural audio (WebAudio): ambience layers, engines, horns, footsteps, weather, UI and a generative original score.
import { Settings } from '../core/Settings.js';
import { bus } from '../core/Events.js';
import { clamp, lerp } from '../core/math.js';
import * as L from '../world/Layout.js';

class AudioEngine {
  constructor() { this.ctx = null; this.ready = false; this.engines = []; this.musicMode = 'none'; this.nextNote = 0; this.step = 0; this.radio = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(this.master); this.out = comp;
    const mk = () => { const g = c.createGain(); g.connect(comp); return g; };
    this.bus = { music: mk(), sfx: mk(), amb: mk(), dlg: mk() };
    // reverb (short convolution) for music + some sfx
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(2.2); const vg = c.createGain(); vg.gain.value = 0.25; this.verb.connect(vg); vg.connect(comp);
    this.noiseBuf = this.makeNoise(3, 'white'); this.brownBuf = this.makeNoise(4, 'brown');
    // ambience loops
    this.layers = {};
    const loop = (buf, f, q, type = 'lowpass') => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.bus.amb); s.start(); return { s, f: fl, g }; };
    this.layers.city = loop(this.brownBuf, 420, 0.5);
    this.layers.rain = loop(this.noiseBuf, 2600, 0.4, 'bandpass');
    this.layers.rainLow = loop(this.brownBuf, 900, 0.3);
    this.layers.sea = loop(this.brownBuf, 600, 0.6);
    this.layers.wind = loop(this.noiseBuf, 500, 2.5, 'bandpass');
    this.applyVolumes(); bus.on('settings', () => this.applyVolumes());
    this.ready = true;
  }
  applyVolumes() { if (!this.ctx) return; const S = (k) => Settings.get(k); this.master.gain.value = S('master'); this.bus.music.gain.value = S('music') * 0.55; this.bus.sfx.gain.value = S('sfx'); this.bus.amb.gain.value = S('ambience'); this.bus.dlg.gain.value = S('dialogue'); }
  makeNoise(sec, kind) { const c = this.ctx; const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate); const d = b.getChannelData(0); let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; } return b; }
  impulse(sec) { const c = this.ctx; const b = c.createBuffer(2, c.sampleRate * sec, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); } return b; }
  env(g, t, a, peak, d, sus = 0) { g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d); }
  tone(freq, dur, { type = 'sine', vol = 0.2, out = 'sfx', attack = 0.01, when = 0, detune = 0, pan = 0, verb = false, glide = null } = {}) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime + when; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur); o.detune.value = detune;
    const g = c.createGain(); this.env(g, t, attack, vol, dur); const p = c.createStereoPanner(); p.pan.value = pan; o.connect(g); g.connect(p); p.connect(this.bus[out]); if (verb) p.connect(this.verb); o.start(t); o.stop(t + attack + dur + 0.05);
  }
  noise(dur, { f = 1000, q = 1, type = 'bandpass', vol = 0.2, out = 'sfx', when = 0, attack = 0.005, pan = 0, buf = null } = {}) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime + when; const s = c.createBufferSource(); s.buffer = buf || this.noiseBuf; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); this.env(g, t, attack, vol, dur); const p = c.createStereoPanner(); p.pan.value = pan; s.connect(fl); fl.connect(g); g.connect(p); p.connect(this.bus[out]); s.start(t, Math.random() * 2); s.stop(t + dur + attack + 0.1);
  }
  // ---- spatial helper: returns [gain, pan] for a world point relative to listener
  spatial(x, z, ref = 30) { if (!this.listener) return [1, 0]; const l = this.listener; const dx = x - l.x, dz = z - l.z; const d = Math.hypot(dx, dz); const g = clamp(ref / (ref + d * d * 0.08), 0, 1); const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw); const pan = clamp((dx * rx + dz * rz) / (d + 1), -1, 1) * -1; return [g, pan]; }
  // ---- sfx
  footstep(sprint, wet) { this.noise(0.07, { f: wet ? 1800 : 900 + Math.random() * 300, q: 1.2, vol: sprint ? 0.12 : 0.07, type: 'bandpass' }); if (wet) this.noise(0.05, { f: 3500, q: 2, vol: 0.04, when: 0.02 }); }
  horn(type, x, z) {
    const [g, pan] = this.spatial(x, z, 60); if (g < 0.02) return; const v = 0.25 * g;
    if (type === 'tuktuk' || type === 'bike') { this.tone(1150, 0.18, { type: 'square', vol: v * 0.5, pan }); this.tone(1220, 0.16, { type: 'square', vol: v * 0.3, pan, when: 0.22 }); }
    else if (type === 'bus' || type === 'pbus' || type === 'lorry') { for (const f of [233, 294, 349]) this.tone(f, 0.9, { type: 'sawtooth', vol: v * 0.35, pan, attack: 0.04 }); }
    else { this.tone(420, 0.35, { type: 'square', vol: v * 0.4, pan }); this.tone(520, 0.35, { type: 'square', vol: v * 0.3, pan }); }
  }
  crash(v) { this.noise(0.5, { f: 600, q: 0.7, vol: clamp(v / 20, 0.1, 0.6), type: 'lowpass', buf: this.brownBuf }); this.noise(0.25, { f: 3000, q: 1, vol: clamp(v / 40, 0.05, 0.3), when: 0.02 }); for (let i = 0; i < 4; i++) this.tone(2000 + Math.random() * 3000, 0.15, { type: 'triangle', vol: 0.03, when: 0.05 + i * 0.04 }); }
  thunder(dist = 0.5) { this.noise(3.5, { f: 180, q: 0.5, type: 'lowpass', vol: 0.6 * (1 - dist * 0.5), attack: 0.08 + dist * 0.4, buf: this.brownBuf, out: 'amb', when: dist * 1.5 }); this.noise(1.2, { f: 900, q: 0.4, type: 'lowpass', vol: 0.2 * (1 - dist), when: dist * 1.5 }); }
  ui(kind = 'click') { if (kind === 'click') this.tone(880, 0.05, { type: 'triangle', vol: 0.08 }); else if (kind === 'hover') this.tone(1320, 0.03, { type: 'sine', vol: 0.03 }); else if (kind === 'notify') { this.tone(660, 0.2, { vol: 0.1, verb: true }); this.tone(990, 0.3, { vol: 0.08, when: 0.1, verb: true }); } else if (kind === 'success') { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.4, { vol: 0.09, when: i * 0.09, verb: true, type: 'triangle' })); } else if (kind === 'fail') { [392, 330, 262].forEach((f, i) => this.tone(f, 0.4, { vol: 0.1, when: i * 0.14, type: 'triangle' })); } else if (kind === 'collect') { [988, 1319].forEach((f, i) => this.tone(f, 0.25, { vol: 0.09, when: i * 0.07, verb: true })); } else if (kind === 'camera') { this.noise(0.04, { f: 4000, vol: 0.2 }); this.noise(0.06, { f: 2500, vol: 0.15, when: 0.08 }); } else if (kind === 'door') { this.noise(0.3, { f: 300, q: 0.8, vol: 0.2, type: 'lowpass', buf: this.brownBuf }); } }
  talkBlip(lang) { const base = lang === 'ta' ? 210 : lang === 'si' ? 190 : 200; for (let i = 0; i < 3; i++) this.tone(base + Math.random() * 60, 0.06, { type: 'triangle', vol: 0.025, when: i * 0.09, out: 'dlg' }); }
  boom() { this.tone(42, 3.5, { type: 'sine', vol: 0.55, attack: 0.6, glide: 30 }); this.noise(4, { f: 90, q: 0.5, type: 'lowpass', vol: 0.3, attack: 1.2, buf: this.brownBuf }); }
  riser(dur = 3) { if (!this.ready) return; this.noise(dur, { f: 400, q: 2, vol: 0.12, attack: dur * 0.9 }); this.tone(110, dur, { type: 'sawtooth', vol: 0.03, attack: dur * 0.9, glide: 440 }); }
  trainHorn(x, z) { const [g, pan] = this.spatial(x, z, 400); if (g < 0.02) return; for (const f of [311, 370]) this.tone(f, 1.6, { type: 'sawtooth', vol: 0.12 * g, pan, attack: 0.1, verb: true }); }
  breadTuk(x, z) { // the bakery tuk-tuk chime (Beethoven's Für Elise, public domain)
    const [g, pan] = this.spatial(x, z, 120); if (g < 0.03) return; const N = [659, 622, 659, 622, 659, 494, 587, 523, 440]; N.forEach((f, i) => this.tone(f * 2, 0.22, { type: 'square', vol: 0.04 * g, pan, when: i * 0.2 }));
  }
  // ---- per-frame
  update(dt, st) {
    if (!this.ready) return; const c = this.ctx, t = c.currentTime; this.listener = st.listener; const L_ = this.layers;
    const night = st.night, rain = st.rain;
    const coast = Math.max(0, 1 - Math.abs(st.listener.x - L.coastX(st.listener.z)) / 140);
    const busy = clamp(st.traffic / 30, 0, 1);
    const set = (layer, v, f) => { layer.g.gain.setTargetAtTime(v, t, 0.6); if (f) layer.f.frequency.setTargetAtTime(f, t, 0.6); };
    set(L_.city, (0.05 + busy * 0.12) * (1 - night * 0.4) * (st.indoor ? 0.25 : 1), 300 + busy * 300);
    set(L_.rain, rain * 0.22 * (st.indoor ? 0.35 : 1), st.indoor ? 900 : 2600); set(L_.rainLow, rain * 0.2, 700);
    set(L_.sea, coast * 0.22 * (st.indoor ? 0.2 : 1)); set(L_.wind, (0.02 + st.wind * 0.04) * (st.indoor ? 0.1 : 1), 400 + st.wind * 200);
    // random ambient events
    if (!st.indoor) {
      if (!night && Math.random() < dt * 0.35) this.crow();
      if (!night && rain < 0.3 && Math.random() < dt * 0.5) this.bird();
      if (night && Math.random() < dt * 0.4) this.cricket();
      if (Math.random() < dt * 0.05 * busy) this.horn(Math.random() < 0.6 ? 'tuktuk' : 'car', st.listener.x + (Math.random() - 0.5) * 200, st.listener.z + (Math.random() - 0.5) * 200);
    }
    this.updateEngines(st); this.updateMusic(dt, st);
  }
  crow() { const [g, pan] = [0.5 + Math.random() * 0.5, Math.random() * 2 - 1]; const n = 1 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) { this.noise(0.22, { f: 1100 + Math.random() * 200, q: 6, vol: 0.05 * g, pan, when: i * 0.32 }); this.tone(520 + Math.random() * 60, 0.2, { type: 'sawtooth', vol: 0.012 * g, pan, when: i * 0.32, glide: 430 }); } }
  bird() { const f = 2500 + Math.random() * 2000; const pan = Math.random() * 2 - 1; const n = 2 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) this.tone(f + Math.random() * 600, 0.07, { vol: 0.015, pan, when: i * 0.11, glide: f * 1.3 }); }
  cricket() { const pan = Math.random() * 2 - 1; for (let i = 0; i < 6; i++) this.tone(4200, 0.03, { vol: 0.008, pan, when: i * 0.05, type: 'triangle' }); }
  // engines: a few oscillator voices assigned to the nearest vehicles
  updateEngines(st) {
    const c = this.ctx, t = c.currentTime; const want = st.vehicles || [];
    while (this.engines.length < 6) { const o = c.createOscillator(); o.type = 'sawtooth'; const o2 = c.createOscillator(); o2.type = 'square'; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2; const g = c.createGain(); g.gain.value = 0; const p = c.createStereoPanner(); const am = c.createGain(); const lfo = c.createOscillator(); lfo.frequency.value = 18; const lfoG = c.createGain(); lfoG.gain.value = 0.3; lfo.connect(lfoG); lfoG.connect(am.gain); o.connect(am); o2.connect(am); am.connect(f); f.connect(g); g.connect(p); p.connect(this.bus.sfx); o.start(); o2.start(); lfo.start(); this.engines.push({ o, o2, f, g, p, lfo }); }
    this.engines.forEach((e, i) => {
      const v = want[i]; if (!v) { e.g.gain.setTargetAtTime(0, t, 0.2); return; }
      const sp = Math.abs(v.speed); const k = v.type; let base, fc, vol;
      if (k === 'tuktuk') { base = 38 + sp * 5; fc = 900 + sp * 60; vol = 0.11; e.lfo.frequency.value = base * 0.5; }
      else if (k === 'bike') { base = 55 + sp * 7; fc = 1400 + sp * 40; vol = 0.09; e.lfo.frequency.value = base * 0.5; }
      else if (k === 'bus' || k === 'pbus' || k === 'lorry') { base = 28 + sp * 2.2; fc = 300 + sp * 20; vol = 0.16; e.lfo.frequency.value = 9; }
      else { base = 32 + sp * 3.2; fc = 380 + sp * 35; vol = 0.08; e.lfo.frequency.value = 6; }
      const gearSp = v.player ? ((sp % 9) / 9) * 0.6 + 0.6 : 1; e.o.frequency.setTargetAtTime(base * gearSp, t, 0.08); e.o2.frequency.setTargetAtTime(base * gearSp * 0.5, t, 0.08); e.f.frequency.setTargetAtTime(fc, t, 0.1);
      const [g, pan] = v.player ? [1, 0] : this.spatial(v.x, v.z, 20); e.g.gain.setTargetAtTime(vol * g * (v.player ? 1.2 : 0.8) * (st.indoor ? 0.2 : 1), t, 0.1); e.p.pan.setTargetAtTime(pan, t, 0.1);
    });
  }
  // ---- generative original score
  setMusic(mode) { if (mode === this.musicMode) return; this.musicMode = mode; this.step = 0; if (this.ctx) this.nextNote = this.ctx.currentTime + 0.1; }
  updateMusic(dt, st) {
    if (this.musicMode === 'none' || !this.ctx) return; const c = this.ctx;
    const mode = this.musicMode; const bpm = { menu: 76, explore: 84, tension: 118, night: 68, radio1: 124, radio2: 92, chase: 132, intro: 60 }[mode] || 80; const spb = 60 / bpm / 2; // eighth notes
    // scale: D Dorian-ish with a raised 4th flavour for colour
    const root = mode === 'tension' || mode === 'chase' ? 110 : 146.83; const SC = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15];
    const f = (deg, oct = 0) => root * Math.pow(2, (SC[((deg % SC.length) + SC.length) % SC.length] + 12 * (oct + Math.floor(deg / SC.length))) / 12);
    while (this.nextNote < c.currentTime + 0.2) {
      const s = this.step, w = this.nextNote - c.currentTime; const bar = Math.floor(s / 8) % 4; const prog = [0, 5, 3, 4][bar];
      if (mode === 'radio1') { // upbeat 6/8 baila-flavoured groove (original)
        const s6 = s % 6; if (s6 === 0 || s6 === 3) this.drum(w, s6 === 0 ? 70 : 90, 0.3); if (s6 === 2 || s6 === 5) this.noise(0.05, { f: 6000, vol: 0.04, when: w, out: 'music' });
        if (s6 === 0) [0, 2, 4].forEach((d) => this.tone(f(prog + d, 1), spb * 5, { type: 'triangle', vol: 0.03, when: w, out: 'music' }));
        if (s6 === 1 || s6 === 4) this.tone(f(prog, 0) / 2, spb * 1.5, { type: 'sawtooth', vol: 0.05, when: w, out: 'music' });
        if (Math.random() < 0.5) this.tone(f(prog + [0, 2, 4, 5, 7][Math.floor(Math.random() * 5)], 2), spb * 0.9, { type: 'square', vol: 0.018, when: w, out: 'music' });
      } else {
        const sparse = mode === 'night' || mode === 'menu' || mode === 'intro';
        if (s % 16 === 0) [0, 2, 4, 7].forEach((d) => this.tone(f(prog + d, 0), spb * 16, { type: 'sine', vol: sparse ? 0.035 : 0.03, attack: 1.2, when: w, out: 'music', verb: true, detune: (Math.random() - 0.5) * 8 }));
        if (s % 16 === 0) this.tone(f(prog, -1), spb * 16, { type: 'triangle', vol: 0.05, attack: 0.5, when: w, out: 'music' });
        // tabla-like percussion
        const pat = mode === 'tension' || mode === 'chase' ? [1, 0, 1, 1, 0, 1, 1, 0] : sparse ? [1, 0, 0, 0, 0, 0, 1, 0] : [1, 0, 0, 1, 0, 0, 1, 0];
        if (pat[s % 8] && mode !== 'intro') this.drum(w, s % 8 === 0 ? 85 : 160, mode === 'tension' || mode === 'chase' ? 0.22 : 0.14);
        if ((mode === 'tension' || mode === 'chase') && s % 2 === 1) this.noise(0.04, { f: 7000, vol: 0.025, when: w, out: 'music' });
        // flute-like motif
        if (!sparse || s % 4 === 0) { if (Math.random() < (sparse ? 0.35 : 0.3)) { const deg = prog + [0, 2, 4, 5, 7, 4, 2][Math.floor(Math.random() * 7)]; this.flute(f(deg, 2), spb * (Math.random() < 0.3 ? 4 : 2), w); } }
      }
      this.step++; this.nextNote += spb;
    }
  }
  drum(w, f, vol) { this.tone(f * 2.2, 0.25, { type: 'sine', vol, when: w, glide: f, out: 'music' }); this.noise(0.03, { f: 3000, vol: vol * 0.2, when: w, out: 'music' }); }
  flute(freq, dur, w) { if (!this.ready) return; const c = this.ctx, t = c.currentTime + w; const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq; const vib = c.createOscillator(); vib.frequency.value = 5.2; const vg = c.createGain(); vg.gain.value = freq * 0.008; vib.connect(vg); vg.connect(o.frequency); const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03, t + 0.08); g.gain.setValueAtTime(0.03, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.bus.music); g.connect(this.verb); o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05); }
}
export const Audio = new AudioEngine();
