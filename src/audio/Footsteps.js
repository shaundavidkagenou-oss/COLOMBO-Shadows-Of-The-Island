// 76th: footsteps & character foley (sounds window → "Footsteps & surfaces", "Character foley").
//
//  • a step plays on the real foot contact of the walk cycle (Animator.stepped → Player 'footstep' event; NPCs near the player:
//    their own Animator contacts, read here). The recording comes from the surface under that foot (Surface.js), the gait
//    (walk < 2.4 m/s ≤ jog < 5 m/s ≤ run / sprint) and the wetness (rain → 'wet' hard ground / 'mud'; puddles add a splash).
//    Each slot's variations are drawn from a shuffle bag (never the same file twice in a row) with a little pitch / level
//    spread. A walker's previous step is faded out as the next one lands — steps never pile up on each other.
//  • fallbacks (nothing silent while slots are empty): the same surface's other gaits → a related surface → the original
//    Player → Footstep recording (75th: the sound everyone used) → a small synthesised step shaped for the surface.
//  • foley on the same contacts: clothing rustle by gait, equipment rattle while a long gun is carried; breathing as two loops
//    (light / heavy) whose levels follow an exertion value driven by stamina and sprinting (rises quickly, settles slowly).
//  Cost: one surface lookup per step (a few grid reads); NPC contacts are read only for people within 12 m, at most four steps
//  per quarter second; breathing is two looping sources (only when recordings exist) updated with two gain targets.
import { Audio } from './Audio.js';
import { SoundBank as SB } from './SoundBank.js';
import { surfaceAt, wetSurface, puddleAt } from './Surface.js';
import { WEAPONS } from '../combat/WeaponDefs.js';

export const gaitOf = (sp, sprint = false) => (sprint || sp >= 5 ? 'run' : sp >= 2.4 ? 'jog' : 'walk');
const GAITS = ['walk', 'jog', 'run'];
const RELATED = { wet: ['concrete', 'asphalt'], mud: ['grass', 'gravel'], metalStair: ['grate'], grate: ['metalStair'], tile: ['concrete'], asphalt: ['concrete'], concrete: ['asphalt'], gravel: [], grass: [], wood: [] };
const GAIN = { walk: 0.62, jog: 0.82, run: 1 };
const CLOTH = { walk: 'foley.cloth.walk', jog: 'foley.cloth.run', run: 'foley.cloth.sprint' };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the recording id a step of (surface, gait) plays, or null (→ synthesised)
export function stepId(s, gait) {
  for (const g of [gait, ...GAITS.filter((x) => x !== gait)]) if (SB.has(`step.${s}.${g}`)) return `step.${s}.${g}`;
  for (const r of RELATED[s] || []) for (const g of [gait, ...GAITS.filter((x) => x !== gait)]) if (SB.has(`step.${r}.${g}`)) return `step.${r}.${g}`;
  return SB.has('footstep') ? 'footstep' : null;
}

class FootstepAudio {
  constructor() { this.g = null; this.prev = new WeakMap(); this.npcT = 0; this.npcN = 0; this.ex = 0; this.breath = { light: {}, heavy: {} }; this.nextBreath = 0; this.stats = { player: 0, npc: 0, surf: {} }; this.lastP = 0; }
  init(g) { this.g = g; }
  get ctx() { return Audio.ctx; }
  // one footstep of walker w (an object to key the "previous step" on) at (x, z): s surface, gait, k level, A spatial cues
  play(w, s, gait, k, A, wetLayer = false) {
    const c = this.ctx; if (!c || !Audio.live) return; const now = c.currentTime;
    const pv = this.prev.get(w); if (pv && pv.voice && pv.voice.end > now + 0.04) { try { pv.voice.g.gain.cancelScheduledValues(now); pv.voice.g.gain.setTargetAtTime(0, now, 0.02); pv.voice.src.stop(now + 0.12); } catch { /* ended */ } } // no overlapping steps
    const id = stepId(s, gait); const tr = {}; const lv = k * GAIN[gait] * (0.88 + Math.random() * 0.24);
    if (id && SB.play(id, (id === 'footstep' ? (gait === 'run' ? 1 : 0.6) : 1) * lv * A.g, A.pan, 0, { rate: 0.95 + Math.random() * 0.1, lp: A.lp, track: tr, key: 'steps' })) { this.prev.set(w, tr); }
    else this.synth(s, gait, lv * A.g, A.pan);
    if (wetLayer) SB.play('step.puddle', 0.9 * lv * A.g, A.pan, 0.01, { rate: 0.92 + Math.random() * 0.16, lp: A.lp, key: 'steps' }) || Audio.noise(0.09, { f: 2400, q: 0.8, vol: 0.05 * lv * A.g, pan: A.pan, when: 0.012 });
    this.stats.surf[s] = (this.stats.surf[s] || 0) + 1;
  }
  // a small synthesised step per surface (only when no recording at all exists for it)
  synth(s, gait, v, pan) { const N = (d, o) => Audio.noise(d, { pan, ...o }), T = (f, d, o) => Audio.tone(f, d, { pan, ...o }); const hard = gait === 'run' ? 1.3 : gait === 'jog' ? 1.1 : 1;
    switch (s) {
      case 'asphalt': N(0.065, { f: 760 + Math.random() * 200, q: 1, vol: 0.075 * v * hard }); break;
      case 'gravel': for (let i = 0; i < 4; i++) N(0.025, { f: 2400 + Math.random() * 1600, q: 1.5, vol: 0.05 * v * hard, when: i * 0.018 + Math.random() * 0.01 }); break;
      case 'grass': N(0.12, { f: 1700 + Math.random() * 400, q: 0.6, vol: 0.035 * v * hard, attack: 0.02 }); break;
      case 'mud': N(0.1, { f: 380, q: 0.8, type: 'lowpass', vol: 0.09 * v * hard }); N(0.06, { f: 1300, q: 4, vol: 0.03 * v, when: 0.05 }); break;
      case 'wet': N(0.06, { f: 1500 + Math.random() * 300, q: 1.1, vol: 0.07 * v * hard }); N(0.05, { f: 3600, q: 2, vol: 0.035 * v, when: 0.02 }); break;
      case 'tile': N(0.045, { f: 2100 + Math.random() * 300, q: 2, vol: 0.06 * v * hard }); T(180, 0.04, { type: 'sine', vol: 0.02 * v }); break;
      case 'wood': T(150 + Math.random() * 30, 0.08, { type: 'triangle', vol: 0.05 * v * hard }); N(0.05, { f: 620, q: 1.2, vol: 0.04 * v }); break;
      case 'metalStair': T(410 + Math.random() * 40, 0.12, { type: 'square', vol: 0.012 * v * hard }); T(690, 0.09, { type: 'sine', vol: 0.02 * v }); N(0.04, { f: 1800, q: 2, vol: 0.04 * v }); break;
      case 'grate': T(880 + Math.random() * 60, 0.1, { type: 'sine', vol: 0.025 * v * hard }); T(1310, 0.07, { type: 'sine', vol: 0.014 * v }); N(0.04, { f: 1500, q: 2, vol: 0.035 * v }); break;
      default: N(0.07, { f: 900 + Math.random() * 300, q: 1.2, vol: 0.07 * v * hard }); // concrete (the original synthesised step)
    }
  }
  wetness(indoor) { const A = this.g && this.g.atmos; return indoor || !A ? 0 : A.wet || 0; }
  // ---- the player's step (Player / Cover / DoorBreach 'footstep' event)
  playerStep(e) {
    const g = this.g, P = g && g.player; if (!P || !Audio.live) return; const now = Audio.ctx.currentTime; if (now - this.lastP < 0.14) return; this.lastP = now; // (two emitters on the same contact)
    const gait = gaitOf(P.speed || 0, e && e.sprint); const I = P.indoor || null; const wet = this.wetness(I);
    const s0 = surfaceAt(P.x, P.z, P.y, g.collision, I); const s = wetSurface(s0, wet); this.lastSurface = s; this.lastGait = gait;
    const splash = !I && (s === 'wet' || s0 === 'wood' || s0 === 'grate') && puddleAt(P.x, P.z, wet) && (g.atmos.w ? g.atmos.w.rain > 0.15 : true);
    this.play(P, s, gait, P.crouching ? 0.55 : 1, { g: 1, pan: 0, lp: 0 }, splash); this.stats.player++;
    // foley on the same contact
    const cl = CLOTH[gait]; if (!SB.play(cl, gait === 'walk' ? 0.8 : 1, 0, 0.015, { rate: 0.94 + Math.random() * 0.12, key: 'foley' }) && gait !== 'walk') Audio.noise(0.09, { f: 2800 + Math.random() * 600, q: 0.5, vol: gait === 'run' ? 0.011 : 0.007, when: 0.01, attack: 0.02 });
    const W = P.weapons; const d = W && (W.def || (W.sel >= 0 && W.inv && W.inv[W.sel] && W.inv[W.sel].owned ? WEAPONS[W.sel] : null));
    if (d && d.cls !== 'pistol' && gait !== 'walk' || (d && gait === 'run')) { if (!SB.play('foley.gear', gait === 'run' ? 1 : 0.7, 0, 0.03, { rate: 0.95 + Math.random() * 0.1, key: 'foley' })) Audio.noise(0.04, { f: 3200 + Math.random() * 900, q: 3, vol: 0.008, when: 0.03 }); }
  }
  land() { const g = this.g, P = g && g.player; if (!P) return; const I = P.indoor || null; const s = wetSurface(surfaceAt(P.x, P.z, P.y, g.collision, I), this.wetness(I)); this.play(P, s, 'run', 1.25, { g: 1, pan: 0, lp: 0 }); this.lastP = Audio.ctx ? Audio.ctx.currentTime : 0; }
  // ---- NPC steps (Audio.npcStep → here; the crowd's own foot contacts near the player in update())
  npc(x, z, k = 0.7, sp = 1.4, w = null) {
    const g = this.g; if (!g || !Audio.live) return; const t = Audio.ctx.currentTime; if (t - this.npcT > 0.25) { this.npcT = t; this.npcN = 0; } if (this.npcN >= 4) return; // budget
    const A = Audio.at(x, z, 4); if (A.g < 0.02) return; this.npcN++;
    const P = g.player; const I = P && P.indoor && P.indoor.bounds && x > P.indoor.bounds.x0 - 0.5 && x < P.indoor.bounds.x1 + 0.5 && z > P.indoor.bounds.z0 - 0.5 && z < P.indoor.bounds.z1 + 0.5 ? P.indoor : null;
    const s = wetSurface(surfaceAt(x, z, I ? P.y : undefined, I ? null : g.collision, I), this.wetness(I));
    this.play(w || { x, z }, s, gaitOf(sp), k * 0.85, A); this.stats.npc++;
  }
  // ---- per frame
  update(dt) {
    const g = this.g, P = g && g.player; if (!P || !Audio.ready) return;
    // crowd foot contacts within 12 m (on foot, outdoors — interiors keep their own NPC steps: HospitalAudio)
    const C = g.crowd; if (C && C.peds && !P.vehicle && !P.indoor) for (const p of C.peds) { const dx = p.x - P.x, dz = p.z - P.z; if (dx * dx + dz * dz > 144) continue; const A = p.ch && p.ch.anim; if (!A || !A.stepped) continue; A.stepped = false; if (p.dead || p.ragdoll) continue; this.npc(p.x, p.z, 0.6, A.speed || p.sp || 1.3, p); }
    this.updateBreath(dt, P);
  }
  // breathing: exertion from stamina (and the effort of sprinting), two loops cross-faded on it — or synthesised breaths
  updateBreath(dt, P) {
    const c = Audio.ctx; if (!c) return; const t = c.currentTime; const B = this.breath;
    const onFoot = !P.vehicle && !P.boat && !P.swim && !(P.health && P.health.dead) && !P.cinematic;
    const want = !onFoot ? 0 : Math.min(1, (1 - (P.stamina ?? 1)) * 1.15 + (P.sprinting ? 0.25 : 0));
    this.ex += (want - this.ex) * Math.min(1, dt / (want > this.ex ? 1.2 : 4.5)); const e = this.ex;
    const lw = smooth(0.12, 0.45, e) * (1 - smooth(0.6, 0.9, e)), hw = smooth(0.5, 0.85, e);
    let rec = false;
    for (const [k, w] of [['light', lw], ['heavy', hw]]) { const H = B[k]; const id = 'foley.breath.' + k;
      if (!H.g) { H.g = c.createGain(); H.g.gain.value = 0; H.g.connect(Audio.bus.sfx); }
      if (w > 0.01 && SB.has(id)) { SB.syncLoop(H, id, H.g); rec = true; } else if (H.smp && H.g.gain.value < 0.005) SB.stopLoop(H); // the loop only runs while heard
      H.g.gain.setTargetAtTime(SB.has(id) ? w : 0, t, 0.25); }
    if (!rec && e > 0.25 && t >= this.nextBreath && Audio.live) { // synthesised: an in-breath and an out-breath, faster and louder with exertion
      const per = 2.3 - 1.5 * e, v = 0.008 + 0.024 * e; Audio.noise(per * 0.32, { f: 1300, q: 0.7, vol: v * 0.7, attack: per * 0.12 }); Audio.noise(per * 0.3, { f: 850, q: 0.6, vol: v, attack: 0.03, when: per * 0.45 }); this.nextBreath = t + per; }
  }
}
export const Footsteps = new FootstepAudio();
if (typeof window !== 'undefined') window.__footsteps = Footsteps;
