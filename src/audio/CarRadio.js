// 76th: the car radio (sounds window → "Vehicle radio"), replacing the old two-mode music switch. Three original stations:
//   Radio Lanka Breeze 98.4 · Island Pulse 104.2 (music: up to 4 streamed songs each, DJ talk breaks and station stings between
//   songs) · Colombo Talk 91.6 (talk segments with stings). Every motor vehicle remembers its own station (v.radio).
//   Keys: radio (R) next station, radioPrev ([) previous — off → 98.4 → 104.2 → 91.6 → off. A change plays the tuning sound
//   over a short burst of static, then the station fades in.
//   Live stations: a station you leave keeps "playing" — coming back to it later picks the song up where it would be by now.
//   Without recordings a music station plays its Music → "Car radio — station" loop (the slot from before), else its original
//   generative groove (Audio.groove, unchanged); the talk station falls back to synthesised studio chatter.
//   Inside the vehicle the radio is the vehicle's speakers at full range (the game's score steps aside, as before). Get out with
//   it on and it carries on from the car: positioned, attenuated with distance, low-passed by the body (opening a door or broken
//   windows let more through; open vehicles — tuk-tuks, motorcycles — barely muffle it); getting back in opens it up again.
//   It goes quiet past 40 m, pauses while you are away from the car (the stream is paused, not restarted) and stops for good
//   when the vehicle is wrecked or unloaded (disposed / towed).
//   One <audio> element (streams are decoded by the browser as they play — no song is decoded into memory) through one
//   MediaElementSource, one loop holder and one static holder are reused for every station and vehicle.
import { Audio, mechClass } from './Audio.js';
import { SoundBank as SB } from './SoundBank.js';
import { RADIO_STATIONS } from './EnvSoundDefs.js';

const N = RADIO_STATIONS.length, HEAR = 40;
class CarRadioSys {
  constructor() { this.g = null; this.v = null; this.stn = RADIO_STATIONS.map((s) => ({ ...s, idx: 0, at: 0, left: 0, played: 0, seg: null, gs: { nextNote: 0, step: 0 } })); this.cur = -1; this.tuneT = 0; this.loopH = {}; this.staticH = {}; this.el = null; this.src = null; this.out = null; this.stats = { switches: 0, songs: 0, talk: 0, stings: 0, muffled: 0 }; }
  init(g) { this.g = g; }
  chain() { const c = Audio.ctx; if (this.out || !c || !Audio.bus.radio) return !!this.out;
    this.out = c.createGain(); this.out.gain.value = 0; this.pan = c.createStereoPanner(); this.out.connect(this.pan); this.pan.connect(Audio.bus.radio);
    this.st = c.createGain(); this.st.gain.value = 0; this.st.connect(this.out); // the station's own level (fades between items / on tuning)
    this.stat = c.createGain(); this.stat.gain.value = 0; this.stat.connect(this.out); return true; }
  // ---- controls (the vehicle's own state)
  step(v, dir) { if (!v) return; const cur = v.radio ?? -1; let n = cur + dir; if (n >= N) n = -1; if (n < -1) n = N - 1; this.set(v, n); }
  set(v, n) { v.radio = n; this.stats.switches++; this.tuneT = n >= 0 ? 0.45 : 0; if (this.g && this.g.hud) { const S = RADIO_STATIONS[n]; this.g.hud.notify('Radio', S ? `${S.name}` : 'Off', 'info', 1.6); }
    if (!Audio.live) return; if (!SB.play('radio.tune', 0.9, 0, 0, { out: 'music', key: 'radio' })) { Audio.noise(0.3, { f: 1200, q: 2, vol: 0.03, sweep: 3200, out: 'music' }); Audio.tone(900, 0.04, { type: 'square', vol: 0.01, out: 'music' }); } }
  hudText(v) { const n = v && v.radio != null ? v.radio : -1; const S = RADIO_STATIONS[n]; return S ? `♪ ${S.name}` : ''; }
  // the score steps aside while you sit in a vehicle with the radio on (Game music selection)
  get inCar() { return !!(this.v && this.inside && this.v.radio >= 0); }
  // ---- per frame
  update(dt) {
    const g = this.g, P = g && g.player; if (!P || !Audio.ready || !this.chain()) return; const c = Audio.ctx, t = c.currentTime;
    // which vehicle's radio is heard: the one you are in, else the last one you left with it on (if near, intact, still loaded)
    const inV = P.vehicle && !P.vehicle.T.pedal && mechClass(P.vehicle.type) ? P.vehicle : null;
    if (inV) { this.v = inV; this.inside = true; } else this.inside = false;
    const v = this.v; let lvl = 0, lp = 20000, pan = 0;
    if (v && (v.disposed || v.wrecked || v.health <= 0)) { v.radio = -1; this.v = null; } // destroyed / unloaded: the radio dies with it
    const n = this.v ? this.v.radio ?? -1 : -1;
    if (this.v && n >= 0) {
      if (this.inside) { lvl = 1; lp = 20000; }
      else { const d = Math.hypot(v.x - P.x, v.z - P.z); if (d < HEAR) { const [gg, pp] = Audio.spatial(v.x, v.z, 6); const o = this.openness(v); lvl = gg * (0.35 + 0.65 * o) * Math.min(1, (HEAR - d) / 8); lp = 650 + o * o * 6000; pan = pp; this.stats.muffled++; } }
      if (g.indoor || g.seamK > 0.6) lvl = 0; // inside a building: not heard
    }
    // ramp the chain (the entering transition is this ramp: muffled → open as you sit down)
    this.out.gain.setTargetAtTime(lvl, t, 0.25); Audio.radioLP.frequency.setTargetAtTime(lp, t, this.inside ? 0.3 : 0.15); this.pan.pan.setTargetAtTime(pan, t, 0.2);
    const want = lvl > 0.001 ? n : -1;
    if (want !== this.cur) { this.leaveStation(this.cur, t); this.cur = want; if (want >= 0) this.enterStation(want, t); }
    // tuning: static under the dial sweep, the station held down until it clears
    if (this.tuneT > 0) this.tuneT -= dt; const tuning = this.tuneT > 0 && want >= 0;
    this.stat.gain.setTargetAtTime(tuning ? 0.5 : 0, t, 0.05); if (tuning) { if (!SB.syncLoop(this.staticH, 'radio.static', this.stat)) this.staticNoise(); } else if (this.staticH.smp && this.stat.gain.value < 0.01) SB.stopLoop(this.staticH);
    if (this.cur >= 0) this.play(this.stn[this.cur], dt, t, tuning);
  }
  openness(v) { const k = mechClass(v.type); if (k === 'bike' || k === 'tuktuk' || v.T.open) return 1; let o = 0;
    for (const d of (v.mesh && v.mesh.userData.doors) || []) if ((d.ang || 0) > 0.12 || d.off || d.detached) o = Math.max(o, 0.75);
    const G = v.vd && v.vd.glass; if (G && G.broken) { let b = 0; for (let i = 0; i < G.broken.length; i++) b += G.broken[i] ? 1 : 0; o = Math.max(o, Math.min(0.6, b * 0.15)); } return o; }
  staticNoise() { const c = Audio.ctx; if (this.sn && this.sn.until > c.currentTime) return; const s = c.createBufferSource(); s.buffer = Audio.noiseBuf; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.4; const g = c.createGain(); g.gain.value = 0.05; s.connect(f); f.connect(g); g.connect(this.stat); s.start(c.currentTime, Math.random() * 2); s.stop(c.currentTime + 0.5); this.sn = { until: c.currentTime + 0.45 }; }
  // the items a station plays, in order: its songs (with a talk break after every second one) or its talk segments
  songs(S) { const out = []; for (let i = 1; i <= 4; i++) { const id = `radio.${S.key}.${i}`; if (SB.has(id)) out.push(id); } return out; }
  talks() { const out = []; for (let i = 1; i <= 4; i++) { const id = `radio.talk.${i}`; if (SB.has(id)) out.push(id); } return out; }
  leaveStation(i, t) { if (i < 0) return; const S = this.stn[i]; S.left = t; if (this.el && S.seg) { S.at = this.el.currentTime || 0; this.el.pause(); } this.ended = false; SB.stopLoop(this.loopH); this.st.gain.cancelScheduledValues(t); this.st.gain.setValueAtTime(0, t); }
  enterStation(i, t) { const S = this.stn[i]; this.st.gain.cancelScheduledValues(t); this.st.gain.setValueAtTime(0, t); this.st.gain.setTargetAtTime(1, t + (this.tuneT > 0 ? this.tuneT : 0), 0.3); S.gs.nextNote = 0;
    if (S.seg) { S.at += t - (S.left || t); S.resume = true; } } // live: it went on playing while you listened to something else
  element() { if (this.el) return this.el; const a = new window.Audio(); a.preload = 'auto'; this.el = a; try { this.src = Audio.ctx.createMediaElementSource(a); this.src.connect(this.st); } catch (e) { console.warn('[radio] media element', e); } a.onended = () => { this.ended = true; }; return a; }
  // the next item of station S: songs in turn with a talk break after every second song (music stations), segments in turn (talk);
  // first: tuning in for the first time — a random item, joined part-way through
  next(S, first = false) { const songs = this.songs(S), talks = this.talks();
    if (S.kind === 'talk') { if (!talks.length) return null; S.idx = first ? (Math.random() * talks.length) | 0 : (S.idx + 1) % talks.length; return { id: talks[S.idx], talk: true }; }
    if (!songs.length) return null; if (!first) { S.played++; if (S.played % 3 === 0 && talks.length) return { id: talks[((S.played / 3) | 0) % talks.length], talk: true }; }
    S.idx = first ? (Math.random() * songs.length) | 0 : (S.idx + 1) % songs.length; return { id: songs[S.idx] }; }
  // start S's current item on the element at S.at seconds (−1: a random point in its first 60 %); past its end → the next item
  load(S) { const a = this.el, url = SB.url(S.seg.id); if (!url) { S.seg = null; return; } const off = S.at; S.at = 0; if (S.seg.talk) this.stats.talk++; else this.stats.songs++;
    const go = () => { a.onloadedmetadata = null; const D = isFinite(a.duration) ? a.duration : 0; const o = off < 0 ? (D ? Math.random() * D * 0.6 : 0) : off;
      if (D && o >= D - 0.5) { this.ended = true; return; } try { if (o > 0) a.currentTime = o; } catch { /* not seekable yet */ } a.play().catch(() => {}); };
    if (a.src !== url) { a.onloadedmetadata = go; a.src = url; } else if (a.readyState >= 1) go(); else a.onloadedmetadata = go; }
  play(S, dt, t, tuning) {
    const songs = S.kind === 'talk' ? this.talks() : this.songs(S);
    if (songs.length) { // streamed recordings
      this.element(); SB.stopLoop(this.loopH);
      if (!S.seg || songs.indexOf(S.seg.id) < 0 && !S.seg.talk) { S.seg = this.next(S, true); S.at = -1; S.resume = true; }
      else if (this.ended) { this.ended = false; if (!tuning) this.sting(); S.seg = this.next(S); S.at = 0; S.resume = true; }
      if (S.resume && S.seg) { S.resume = false; this.load(S); }
      return; }
    if (this.el && !this.el.paused) this.el.pause(); S.seg = null;
    if (S.bed && SB.has(S.bed)) { SB.syncLoop(this.loopH, S.bed, this.st); return; } // the station's Music slot (from before)
    SB.stopLoop(this.loopH);
    if (S.mode) Audio.groove(S.gs, S.mode, 'radio'); // the original generative groove, through the radio
    else this.chatter(S, t); }
  sting() { this.stats.stings++; SB.play('radio.transition', 0.8, 0, 0, { out: 'music', key: 'radio' }) || [880, 1175, 1568].forEach((f, i) => Audio.tone(f, 0.18, { type: 'triangle', vol: 0.02, when: i * 0.12, out: 'radio' })); }
  // talk station without recordings: syllable-rate formant bursts — two voices taking turns (no words; an impression of a studio)
  chatter(S, t) { if (S.chT && t < S.chT) return; const who = (S.chW = (S.chW || 0) + (Math.random() < 0.15 ? 1 : 0)) % 2; const f0 = who ? 1100 : 780; const n = 3 + ((Math.random() * 5) | 0);
    for (let i = 0; i < n; i++) Audio.noise(0.09 + Math.random() * 0.06, { f: f0 + Math.random() * 500, q: 3.5, vol: 0.05, when: i * 0.16, attack: 0.02, out: 'radio' });
    S.chT = t + n * 0.16 + 0.15 + Math.random() * 0.4; }
  // a vehicle left with the radio on was towed / unloaded / wrecked elsewhere: handled in update (disposed / wrecked checks)
}
export const CarRadio = new CarRadioSys();
if (typeof window !== 'undefined') window.__radio = CarRadio;
