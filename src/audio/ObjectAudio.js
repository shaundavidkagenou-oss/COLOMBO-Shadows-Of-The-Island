// 76th: interactive object audio (sounds window → "Interactive objects"). Called from the systems that already detect a real
// contact — never polled per physics frame:
//   • Vehicle.drive (VEH_HOOKS.objHit): a vehicle pushed out of a world collider this frame — the collider tells what it hit
//     (litter bin, pole / shelter / container / barrier, railing / fence, bench / stall, wall); one impact per object per 0.35 s,
//     with the closing speed as the level; grinding along it with a sliding speed starts the dragging loop (stops ~0.15 s after
//     the last frame of contact)
//   • Weapons.applyHit: a round striking such an object (the world raycast now reports which collider it stopped on)
//   • PropBreak: a pole sheared off (metal + its lamp / signal heads breaking) and the pole hitting the ground
//   • LooseCaps: a cap / dropped object landing hard
// Every sound is positioned (stereo pan, distance gain, distance low-pass); anything beyond ~70 m is skipped outright.
// Recordings go through the SoundBank's shared voice pool (one key per sound family, MAX_VOICES each, plus the global budget).
import { Audio } from './Audio.js';
import { SoundBank as SB } from './SoundBank.js';

// the material family a collider sounds like when struck (null: buildings, walls, landmarks — no object sound of their own)
export function objKind(c) {
  if (!c) return null; const k = c.kind;
  if (c.bin) return 'trash';
  if (k === 'pole' || k === 'shelter' || k === 'container' || k === 'barrier' || c.brk) return 'metal';
  if (k === 'railing' || k === 'fence' || k === 'rail') return 'fence';
  if (k === 'bench' || k === 'stall' || k === 'wood' || c.front) return 'wood';
  if (k === 'prop') return 'collision';
  return null;
}
const SYN = {
  trash: (v, p) => { Audio.tone(210 + Math.random() * 40, 0.25, { type: 'triangle', vol: 0.06 * v, pan: p }); Audio.noise(0.12, { f: 900, q: 1.4, vol: 0.08 * v, pan: p }); Audio.tone(480, 0.18, { type: 'sine', vol: 0.025 * v, pan: p, when: 0.01 }); },
  metal: (v, p) => { Audio.tone(620 + Math.random() * 120, 0.35, { type: 'sine', vol: 0.04 * v, pan: p }); Audio.tone(1370, 0.22, { type: 'sine', vol: 0.02 * v, pan: p }); Audio.noise(0.06, { f: 2500, q: 1.5, vol: 0.06 * v, pan: p }); },
  fence: (v, p) => { for (let i = 0; i < 6; i++) Audio.noise(0.04, { f: 1800 + Math.random() * 1400, q: 3, vol: 0.045 * v * (1 - i / 7), pan: p, when: i * 0.045 + Math.random() * 0.01 }); },
  wood: (v, p) => { Audio.tone(140 + Math.random() * 40, 0.12, { type: 'triangle', vol: 0.07 * v, pan: p }); Audio.noise(0.07, { f: 700, q: 1.1, vol: 0.06 * v, pan: p }); },
  fall: (v, p) => { Audio.noise(0.14, { f: 220, q: 0.8, type: 'lowpass', vol: 0.12 * v, pan: p }); Audio.noise(0.05, { f: 1400, q: 1.2, vol: 0.03 * v, pan: p, when: 0.01 }); },
  collision: (v, p) => { Audio.noise(0.1, { f: 320, q: 0.9, type: 'lowpass', vol: 0.1 * v, pan: p }); },
  glass: (v, p) => { for (let i = 0; i < 7; i++) Audio.tone(2800 + Math.random() * 3200, 0.05 + Math.random() * 0.08, { type: 'sine', vol: 0.018 * v, pan: p, when: i * 0.02 + Math.random() * 0.03 }); Audio.noise(0.18, { f: 5200, q: 0.8, vol: 0.05 * v, pan: p }); },
};

class ObjectSounds {
  constructor() { this.cool = new WeakMap(); this.drag = null; this.stats = { hits: 0, skipped: 0, drags: 0, bullets: 0, falls: 0 }; }
  // one impact of family kind at (x, z), strength k (0..~1.5); src: the struck object for the cooldown
  hit(kind, x, z, k = 1, src = null, cd = 0.35) {
    if (!Audio.live || !kind) return false; const t = this.clock || 0; // game time (pauses / slow motion), not the audio clock
    if (src) { const last = this.cool.get(src) || -9; if (t - last < cd) { this.stats.skipped++; return false; } this.cool.set(src, t); }
    const A = Audio.at(x, z, 10); if (A.g < 0.015 || A.d > 70) { this.stats.skipped++; return false; } this.stats.hits++;
    const v = Math.min(1.4, k) * A.g; const id = 'obj.' + kind;
    if (SB.play(id, v, A.pan, A.delay, { rate: 0.94 + Math.random() * 0.12, lp: A.lp, verb: A.d > 20, wet: A.wet, key: 'obj' })) return true;
    (SYN[kind] || SYN.collision)(v, A.pan); return false;
  }
  // a vehicle pushed out of collider c this frame (closing speed vn m/s, sliding speed vt m/s along it)
  vehicleHit(v, c, vn, vt) {
    const kind = objKind(c) || (vn > 1.5 ? 'collision' : null); const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    if (kind && vn > 1.2) this.hit(kind, Math.max(c.x0, Math.min(v.x, c.x1)), Math.max(c.z0, Math.min(v.z, c.z1)), Math.min(1.4, 0.25 + vn / 9), c);
    if (vt > 2.5 && (c.x1 - c.x0 > 1.6 || c.z1 - c.z0 > 1.6 || kind === 'fence' || kind === 'metal')) this.dragAt(v, cx, cz, vt);
  }
  // grinding along a wall / barrier: a loop at the vehicle, level and pitch from the sliding speed; fades when contact stops
  dragAt(v, x, z, vt) { const D = (this.drag ||= { h: {}, g: null, t: 0, v: null, k: 0 }); D.v = v; D.t = 0.18; D.k = Math.min(1, vt / 12); D.x = v.x; D.z = v.z; this.stats.drags++; }
  update(dt) {
    this.clock = (this.clock || 0) + dt; const D = this.drag; if (!D || !Audio.ready) return; const c = Audio.ctx, t = c.currentTime;
    if (!D.g) { D.g = c.createGain(); D.g.gain.value = 0; D.p = c.createStereoPanner(); D.g.connect(D.p); D.p.connect(Audio.bus.sfx); }
    D.t -= dt; const on = D.t > 0 && D.v && !D.v.disposed; const [g, pan] = on ? (D.v.player ? [1, 0] : Audio.spatial(D.v.x, D.v.z, 15)) : [0, 0];
    const smp = on ? SB.syncLoop(D.h, 'obj.drag', D.g) : null;
    if (smp) { smp.src.playbackRate.setTargetAtTime(0.8 + D.k * 0.5, t, 0.08); D.g.gain.setTargetAtTime(g * (0.35 + 0.65 * D.k), t, 0.05); D.p.pan.setTargetAtTime(pan, t, 0.1); D.syn = false; }
    else if (on) { D.g.gain.setTargetAtTime(0, t, 0.05); if (!D.nt || t > D.nt) { D.nt = t + 0.07; Audio.noise(0.09, { f: 1400 + D.k * 1800, q: 0.9, vol: 0.06 * g * (0.4 + D.k), pan }); } } // synthesised: rasping bursts
    else { D.g.gain.setTargetAtTime(0, t, 0.08); if (D.h.smp && D.g.gain.value < 0.004) { SB.stopLoop(D.h); D.v = null; } }
  }
  // a round striking collider c at point p (THREE.Vector3)
  bullet(p, c) { const kind = objKind(c); if (!kind || kind === 'collision') return; this.stats.bullets++; this.hit(kind, p.x, p.z, 0.8, null); }
  // PropBreak: a pole knocked down at (x, z): the shaft's clang and its lamp / signal heads breaking; returns true when a recording played
  // (the existing synthesised debris + metal sounds stay when obj.metal has no recording; a glass recording is layered on either way)
  poleDown(x, z, type) { const m = SB.has('obj.metal'), gl = /^(lamp|signal)/.test(type || '') && SB.has('obj.glass');
    if (m) this.hit('metal', x, z, 1.2, null); if (gl) this.hit('glass', x, z, 0.9, null); return m; }
  // something landing on the ground at (x, z) with impact speed vy (m/s); light: a cap / wallet (quieter, higher)
  fall(x, z, vy, src = null, light = false) { if (vy < (light ? 1.5 : 0.6)) return false; this.stats.falls++; return this.hit('fall', x, z, light ? Math.min(0.5, vy / 8) : Math.min(1.4, 0.4 + vy / 5), src, 0.25); }
}
export const ObjectAudio = new ObjectSounds();
if (typeof window !== 'undefined') window.__objAudio = ObjectAudio;
