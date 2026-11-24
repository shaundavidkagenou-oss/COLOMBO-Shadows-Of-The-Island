// The Velvet Monsoon's sound system (58th): the DJ plays the player's own songs (sounds window → Music → "Club DJ — song
// 1…7") through the club's PA, so it sounds like being in the room rather than like background music:
//   · the songs are streamed from the saved files (an <audio> element each for two decks), never decoded whole in memory;
//   · the DJ mixes one song into the next (6 s cross-fade), in order or shuffled (sounds window picker); the set keeps going
//     while the player is away, so coming back drops you into a later part of it;
//   · the mids/highs come out of the actual speaker boxes — left and right main stacks and the flown arrays (stereo), fills
//     over the bar, the booths and the lobby, monitors in the DJ booth — as 3-D sound sources placed at the boxes and heard
//     from the camera (Web Audio panners: distance, direction); the sub-bass fills the whole room evenly, like a real club;
//   · behind the lobby curtain the highs are cut; out on Galle Road near the club's door only a muffled bass thump leaks out;
//   · the club's light show follows the music's kick drum (analyser) instead of a fixed tempo.
// Without any song in the slots the club keeps its original generated groove (Audio.js 'club' mode); a recording put in the
// older "Night club PA" loop slot is played through the speakers the same way.
import { Audio } from './Audio.js';
import { SoundBank as SB } from './SoundBank.js';
import { Settings } from '../core/Settings.js';

const XF = 6; // DJ cross-fade, s
const SLOTS = [1, 2, 3, 4, 5, 6, 7].map((n) => 'music.club' + n);
// speaker boxes in club-local metres (x across, y up from the club floor, z from the stage (−12) to the entrance (+12));
// ch: L / R (stereo mains) or M (mono fills); g: level of that box
export const CLUB_PA = [
  { id: 'stackL', p: [-5.25, 1.3, -11.2], to: [-2, 1.6, -2], ch: 'L', g: 1 }, { id: 'stackR', p: [5.25, 1.3, -11.2], to: [2, 1.6, -2], ch: 'R', g: 1 },
  { id: 'flyL', p: [-6.4, 3.35, -9.3], to: [-2.5, 1.4, 0], ch: 'L', g: 0.9 }, { id: 'flyR', p: [6.4, 3.35, -9.3], to: [2.5, 1.4, 0], ch: 'R', g: 0.9 },
  { id: 'fillBar1', p: [-9.65, 3.75, -3.6], to: [-5, 1.2, -3.6], ch: 'M', g: 0.32 }, { id: 'fillBar2', p: [-9.65, 3.75, 3.6], to: [-5, 1.2, 3.6], ch: 'M', g: 0.32 },
  { id: 'fillBooth1', p: [9.65, 3.75, -3.6], to: [5, 1.2, -3.6], ch: 'M', g: 0.32 }, { id: 'fillBooth2', p: [9.65, 3.75, 3.6], to: [5, 1.2, 3.6], ch: 'M', g: 0.32 },
  { id: 'fillBack', p: [0, 4.2, 7.9], to: [0, 1.2, 3], ch: 'M', g: 0.35 }, { id: 'monL', p: [-9.15, 1.41, -10.65], to: [-8, 1.7, -10.65], ch: 'L', g: 0.3 }, { id: 'monR', p: [-6.85, 1.41, -10.65], to: [-8, 1.7, -10.65], ch: 'R', g: 0.3 },
];

class ClubPA {
  constructor() { this.live = false; this.pulse = 0; this.beats = 0; this.level = 0; this.set = null; this.awayT = 0; this.nowName = ''; }
  songs() { const s = SLOTS.filter((id) => SB.has(id)); if (s.length) return s; return SB.raw.has('music.club') && !SB.bypass ? ['music.club'] : []; }
  // ---- audio graph (built once, on the first visit)
  build() {
    const c = Audio.ctx; const A = Audio; this.c = c;
    const deck = () => { const el = new window.Audio(); el.preload = 'auto'; el.crossOrigin = 'anonymous'; const src = c.createMediaElementSource(el); const g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.mix); return { el, g, id: null }; };
    this.mix = c.createGain();
    this.an = c.createAnalyser(); this.an.fftSize = 1024; this.an.smoothingTimeConstant = 0.1; this.mix.connect(this.an); this.fb = new Uint8Array(this.an.frequencyBinCount);
    // tops: high-passed (the subs carry the lows), behind-the-curtain low-pass, split L / R into the boxes
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 95; hp.Q.value = 0.6; this.mix.connect(hp);
    this.curtain = c.createBiquadFilter(); this.curtain.type = 'lowpass'; this.curtain.frequency.value = 20000; this.curtain.Q.value = 0.5; hp.connect(this.curtain);
    const presence = c.createBiquadFilter(); presence.type = 'peaking'; presence.frequency.value = 3200; presence.Q.value = 0.9; presence.gain.value = 1.5; this.curtain.connect(presence); // PA horn presence
    const split = c.createChannelSplitter(2); presence.connect(split);
    this.hall = c.createGain(); this.hall.gain.value = 0; this.hall.connect(A.bus.amb);
    const verb = c.createGain(); verb.gain.value = 0.22; this.hall.connect(verb); verb.connect(A.verb); // the room's reflections
    this.boxes = CLUB_PA.map((b) => { const pn = c.createPanner(); pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse'; pn.refDistance = 2.2; pn.rolloffFactor = 1.1; pn.maxDistance = 60;
      pn.coneInnerAngle = 120; pn.coneOuterAngle = 260; pn.coneOuterGain = 0.35; // boxes are louder in front
      const g = c.createGain(); g.gain.value = b.g;
      if (b.ch === 'M') { const h = c.createGain(); h.gain.value = 0.5; split.connect(h, 0); split.connect(h, 1); h.connect(g); } else split.connect(g, b.ch === 'L' ? 0 : 1);
      g.connect(pn); pn.connect(this.hall); return { b, pn }; });
    // subs: everything under ~110 Hz, the same everywhere in the hall (bass waves fill a room this size)
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110; lp.Q.value = 0.7; this.mix.connect(lp);
    const shelf = c.createBiquadFilter(); shelf.type = 'lowshelf'; shelf.frequency.value = 70; shelf.gain.value = 4; lp.connect(shelf);
    this.sub = c.createGain(); this.sub.gain.value = 0; shelf.connect(this.sub); this.sub.connect(A.bus.amb);
    // outside: what leaks through the walls and the door — a low thump from the door's direction
    const olp = c.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 230; olp.Q.value = 0.8; this.mix.connect(olp);
    this.out = c.createGain(); this.out.gain.value = 0; this.outPan = c.createStereoPanner(); olp.connect(this.out); this.out.connect(this.outPan); this.outPan.connect(A.bus.amb);
    this.decks = [deck(), deck()]; this.cur = 0; this.order = []; this.oi = -1; this.xf = null;
  }
  nextId() {
    const songs = this.songs(); if (!songs.length) return null; const shuffle = Settings.get('clubOrder') === 'shuffle';
    if (!this.order.length || this.order.some((id) => !songs.includes(id)) || this.order.length !== songs.length) { this.order = songs.slice(); this.oi = -1; if (shuffle) this.shuffle(); }
    this.oi++; if (this.oi >= this.order.length) { this.oi = 0; if (shuffle) { const last = this.order[this.order.length - 1]; this.shuffle(); if (this.order[0] === last && this.order.length > 1) this.order.push(this.order.shift()); } }
    return this.order[this.oi];
  }
  shuffle() { const a = this.order; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
  load(d, id, at = 0) { const url = SB.url(id); if (!url) return false; d.id = id; d.el.loop = id === 'music.club'; if (d.el.src !== url) d.el.src = url; try { d.el.currentTime = at; } catch { /* not seekable yet */ } d.el.play().catch(() => {}); this.nowName = (SB.info(id) || {}).name || id; this.announce(); return true; }
  announce() { if (this.inside && this.g && this.g.hud && this.nowName) this.g.hud.notify('The Velvet Monsoon', `DJ is playing: ${this.nowName.replace(/\.(mp3|wav|ogg)$/i, '')}`, 'info', 2.6); }
  start(skip = 0) { // begin (or resume) the set; skip: seconds the set ran on while nobody was listening
    const d = this.decks[this.cur]; const t = this.c.currentTime;
    if (d.id && SB.has(d.id) && d.el.duration > 0) { let at = d.el.currentTime + skip; if (at < d.el.duration - XF) { try { d.el.currentTime = at; } catch { /* */ } d.el.play().catch(() => {}); d.g.gain.setTargetAtTime(SB.level(d.id), t, 0.3); return; } }
    const id = this.nextId(); if (!id) return; this.load(d, id, 0); d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(0, t); d.g.gain.setTargetAtTime(SB.level(id), t, 0.4);
  }
  halt() { if (this.live && this.c) { this.stop(); this.live = false; this.pausedAt = performance.now(); } this.pulse = 0; } // left the game (menu, loading)
  stop() { for (const d of this.decks) { d.el.pause(); d.g.gain.cancelScheduledValues(this.c.currentTime); d.g.gain.setValueAtTime(0, this.c.currentTime); } this.xf = null; }
  // ---- per frame (Game.update)
  update(dt, g) {
    this.g = g; if (!Audio.ready || Audio.offline || !Audio.ctx) { this.live = false; return; }
    const P = g.player; const room = g.interiors && g.interiors.current; const inside = !!(g.indoor && room && room.id === 'club'); this.inside = inside;
    const door = !g.indoor && g.interiors && g.interiors.doors ? g.interiors.doors.find((d) => d.id === 'club') : null; const dOut = door ? Math.hypot(P.x - door.x, P.z - door.z) : 1e9;
    const want = (inside || dOut < 70) && this.songs().length > 0;
    if (!want) { if (this.live) { this.awayT = 0; if (this.c) this.stop(); this.live = false; this.pausedAt = performance.now(); } this.pulse = 0; return; }
    if (!this.c) this.build();
    const c = this.c, t = c.currentTime;
    if (!this.live) { this.live = true; const skip = this.pausedAt ? (performance.now() - this.pausedAt) / 1000 : 0; this.pausedAt = 0; this.start(skip); if (inside) this.announce(); }
    if (inside !== this.wasInside) { this.wasInside = inside; if (inside) this.announce(); }
    // DJ mix: start the next song on the other deck before this one ends, fade across
    const d = this.decks[this.cur], o = this.decks[1 - this.cur];
    if (d.id && !SB.has(d.id)) { this.stop(); d.id = null; this.start(); } // its slot was emptied in the sounds window
    const left = d.el.duration > 0 && !d.el.loop ? d.el.duration - d.el.currentTime : 1e9;
    if (!this.xf && (left < XF || d.el.ended)) { const id = this.nextId(); if (id) { this.load(o, id, 0); const lv = SB.level(id); o.g.gain.cancelScheduledValues(t); o.g.gain.setValueAtTime(0.0001, t); o.g.gain.linearRampToValueAtTime(lv, t + XF * 0.6); d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(d.g.gain.value, t); d.g.gain.linearRampToValueAtTime(0.0001, t + XF); this.xf = { end: t + XF + 0.2 }; this.cur = 1 - this.cur; } }
    if (this.xf && t > this.xf.end) { o.el.pause(); o.id = o.id && SB.has(o.id) ? o.id : null; this.xf = null; }
    // where the player hears it from
    const k = 1 - Math.exp(-dt * 6);
    if (inside && room.g) { const R = room.g.position; const cam = g.camera; const L = c.listener; cam.updateMatrixWorld(); const e = cam.matrixWorld.elements; const fx = -e[8], fy = -e[9], fz = -e[10];
      const px = cam.position.x, py = cam.position.y, pz = cam.position.z;
      if (L.positionX) { L.positionX.setTargetAtTime(px, t, 0.02); L.positionY.setTargetAtTime(py, t, 0.02); L.positionZ.setTargetAtTime(pz, t, 0.02); L.forwardX.setTargetAtTime(fx, t, 0.02); L.forwardY.setTargetAtTime(fy, t, 0.02); L.forwardZ.setTargetAtTime(fz, t, 0.02); L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      else { L.setPosition(px, py, pz); L.setOrientation(fx, fy, fz, 0, 1, 0); }
      if (!this.placedFor || this.placedFor !== room.g) { this.placedFor = room.g; for (const { b, pn } of this.boxes) { const [x, y, z] = b.p; const set = (a, v) => (a ? (a.value = v) : 0); set(pn.positionX, R.x + x); set(pn.positionY, R.y + y); set(pn.positionZ, R.z + z); if (!pn.positionX) pn.setPosition(R.x + x, R.y + y, R.z + z);
        const ax = b.to[0] - x, ay = b.to[1] - y, az = b.to[2] - z, al = Math.hypot(ax, ay, az); if (pn.orientationX) { pn.orientationX.value = ax / al; pn.orientationY.value = ay / al; pn.orientationZ.value = az / al; } else pn.setOrientation(ax / al, ay / al, az / al); } } // each box aims at its part of the room
      const lz = P.z - R.z; const lobby = lz > 8.4; this.curtain.frequency.setTargetAtTime(lobby ? 1800 : 20000, t, 0.12);
      this.hall.gain.setTargetAtTime(lobby ? 0.55 : 1, t, 0.15); this.sub.gain.setTargetAtTime(lobby ? 0.6 : 0.95, t, 0.15); this.out.gain.setTargetAtTime(0, t, 0.1);
    } else { // on the street: muffled bass through the frontage, strongest at the door
      this.hall.gain.setTargetAtTime(0, t, 0.1); this.sub.gain.setTargetAtTime(0, t, 0.1);
      const near = Math.max(0, 1 - dOut / 70); const gOut = 0.55 * near * near; this.out.gain.setTargetAtTime(gOut, t, 0.2);
      if (door) { const [, pan] = Audio.spatial(door.x, door.z, 60); this.outPan.pan.setTargetAtTime(pan, t, 0.1); }
    }
    // the kick drum: low-band energy against its running average → a 0..1 pulse and a beat count for the lights
    this.an.getByteFrequencyData(this.fb); const e = (this.fb[1] + this.fb[2] + this.fb[3]) / 765; this.avg = this.avg == null ? e : this.avg + (e - this.avg) * Math.min(1, dt * 0.8);
    const hit = e > this.avg * 1.12 + 0.04 && e > (this.prevE || 0) + 0.015 && (this.sinceBeat || 9) > 0.28; this.prevE = e; this.sinceBeat = (this.sinceBeat || 9) + dt;
    if (hit) { this.beats++; this.sinceBeat = 0; this.pulse = 1; } else this.pulse *= Math.exp(-dt * 6); this.level += (e - this.level) * k;
  }
}
export const ClubSound = new ClubPA();
