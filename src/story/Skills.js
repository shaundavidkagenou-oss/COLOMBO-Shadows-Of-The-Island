// Player skills (45th request): every playable character — Dineth, Shashika, David — has their own seven skills (0–100),
// saved with the game (story.state.skills). They grow GTA-style from doing the thing (sprinting, driving fast, landing
// punches, hitting what you shoot at, swimming, holding your breath, cycling) and in big steps from stunt jumps. Each
// skill changes the simulation through SKILL_FX, a plain object other modules read every frame (no import cycles):
//   stamina   sprint / swim drain and recovery           shooting  spread, sway, recoil, reload time
//   strength  punch damage                               driving   tyre grip limit, steering response (cars, motorbikes)
//   cycling   bicycle top speed, pedalling pull, stunt   swimming  stroke speed, swim fatigue
//   lung      breath held underwater
// Lifetime statistics (state.pstats) feed the player tab of the pause map.

export const SKILLS = [
  { id: 'stamina', name: 'Stamina', desc: 'Sprint and swim further before tiring; recover faster.', how: 'Sprint, swim, cycle' },
  { id: 'shooting', name: 'Shooting', desc: 'Tighter spread, steadier aim, softer recoil, quicker reloads.', how: 'Hit what you shoot at' },
  { id: 'strength', name: 'Strength', desc: 'Punches land harder and put people down sooner.', how: 'Land punches' },
  { id: 'driving', name: 'Driving', desc: 'More grip through corners and sharper steering.', how: 'Drive fast without crashing · car stunt jumps' },
  { id: 'cycling', name: 'Cycling', desc: 'Faster pedalling and a higher top speed on a bicycle.', how: 'Ride bicycles · bicycle ramps' },
  { id: 'swimming', name: 'Swimming', desc: 'Faster strokes, less tiring in the water.', how: 'Swim in the sea or Beira Lake' },
  { id: 'lung', name: 'Lung Capacity', desc: 'Hold your breath longer underwater.', how: 'Swim underwater' },
];
export const SKILL_IDS = SKILLS.map((s) => s.id);
// starting levels: each character's background (Dineth grew up on a bicycle in the city, Shashika is the heavy hitter,
// David the marksman and the one who learnt to swim off Mount Lavinia)
const BASE = {
  dineth: { stamina: 58, shooting: 34, strength: 38, driving: 46, cycling: 72, swimming: 44, lung: 36 },
  shashika: { stamina: 40, shooting: 55, strength: 76, driving: 52, cycling: 24, swimming: 30, lung: 30 },
  david: { stamina: 46, shooting: 72, strength: 32, driving: 60, cycling: 34, swimming: 62, lung: 58 },
};
// what other modules read (multipliers; 1 = the old behaviour at a mid skill)
export const SKILL_FX = { staminaDrain: 1, staminaRegen: 1, sprint: 1, spread: 1, sway: 1, recoil: 1, reload: 1, punch: 1, grip: 1, steer: 1, bikeTop: 1, bikeAccel: 1, swimSpeed: 1, swimDrain: 1, breath: 20 };

export class Skills {
  constructor(game) { this.g = game; this.acc = {}; this.lastPos = null; this.toastT = 0; this._st = null; }
  get S() { const st = this.g.story.state; if (!st.skills) st.skills = {}; for (const id in BASE) if (!st.skills[id]) st.skills[id] = { ...BASE[id] }; return st.skills; }
  get stats() { const st = this.g.story.state; if (!st.pstats) st.pstats = { play: 0, foot: 0, drive: 0, cycle: 0, swim: 0, under: 0, topSpeed: 0, carJumps: [], bikeRamps: [], stuntsTried: 0, bikeStunts: 0, shots: 0, hits: 0, punches: 0, robberies: 0, robbed: 0, earned: 0, spent: 0, crashes: 0 }; return st.pstats; }
  who() { const sq = this.g.squad; return (sq && sq.activeMember && sq.activeMember.def && sq.activeMember.def.id) || 'dineth'; }
  lvl(id, who = this.who()) { const s = this.S[who] || this.S.dineth; return s[id] ?? 0; }
  k(id, who) { return this.lvl(id, who) / 100; }
  // raise a skill; whole-point gains pop a GTA-style toast with the new bar
  add(id, amt, why = '', who = this.who()) {
    const s = this.S[who]; if (!s || !(id in s)) return 0; const before = s[id]; s[id] = Math.min(100, before + amt); const gain = s[id] - before;
    if (Math.floor(s[id]) > Math.floor(before) || amt >= 1) this.toast(id, s[id], gain, why);
    this.refresh(); return gain;
  }
  // slow growth from activity (amt per unit); accumulates fractions so gains land as whole points
  grow(id, amt) { this.acc[id] = (this.acc[id] || 0) + amt; if (this.acc[id] >= 1) { const n = Math.floor(this.acc[id]); this.acc[id] -= n; this.add(id, n * 0.5); } }
  toast(id, v, gain, why) {
    const H = this.g.hud; if (!H || !H.skillToast) return; const sk = SKILLS.find((q) => q.id === id); H.skillToast(sk.name, v, gain, why);
  }
  refresh() {
    const k = (id) => this.k(id), F = SKILL_FX;
    F.staminaDrain = 1.25 - 0.55 * k('stamina'); F.staminaRegen = 0.8 + 0.5 * k('stamina'); F.sprint = 0.97 + 0.07 * k('stamina');
    const sh = k('shooting'); F.spread = 1.3 - 0.6 * sh; F.sway = 1.35 - 0.7 * sh; F.recoil = 1.2 - 0.4 * sh; F.reload = 1.15 - 0.3 * sh;
    F.punch = 0.75 + 0.6 * k('strength');
    F.grip = 0.93 + 0.14 * k('driving'); F.steer = 0.9 + 0.2 * k('driving');
    F.bikeTop = 0.88 + 0.24 * k('cycling'); F.bikeAccel = 0.85 + 0.35 * k('cycling');
    F.swimSpeed = 0.75 + 0.5 * k('swimming'); F.swimDrain = 1.3 - 0.6 * k('swimming'); F.breath = 15 + 45 * k('lung');
  }
  // per frame: activity → skill growth + lifetime stats
  update(dt) {
    { const w = this.who(); if (this._st !== this.g.story.state || this._who !== w) { this._st = this.g.story.state; this._who = w; this.refresh(); } } // first frame / a save was loaded / switched character: that member's skills apply
    const P = this.g.player, st = this.stats; if (!P || this.g.mode !== 'play') return; st.play += dt;
    const cur = P.vehicle || P; const lp = this.lastPos; this.lastPos = { x: cur.x, z: cur.z, v: P.vehicle || null, swim: !!P.swim };
    if (!lp || lp.v !== (P.vehicle || null)) return; const d = Math.hypot(cur.x - lp.x, cur.z - lp.z); if (d > 30) return; // teleports
    const v = P.vehicle;
    if (v) { const sp = Math.abs(v.speed || 0); if (sp > st.topSpeed) st.topSpeed = sp;
      if (v.T.pedal) { st.cycle += d; this.grow('cycling', d / 260); if (sp > 4) this.grow('stamina', d / 900); }
      else { st.drive += d; if (sp > 16 && !(v.lastImpact && performance.now() - v.lastImpact.t < 4000)) this.grow('driving', d / 700); } } // fast and clean
    else if (P.swim) { st.swim += d; this.grow('swimming', d / 120); if (P.swim.under) { st.under += dt; this.grow('lung', dt / 6); } if (P.swim.sprint) this.grow('stamina', d / 250); }
    else { st.foot += d; if (P.sprinting) this.grow('stamina', d / 220); }
    this.toastT -= dt;
  }
  onShot(hit) { const st = this.stats; st.shots++; if (hit && (hit.kind === 'ped' || hit.kind === 'officer' || hit.kind === 'keeper' || hit.kind === 'vehicle' || hit.kind === 'target')) { st.hits++; this.grow('shooting', 0.35); } }
  onPunch() { this.stats.punches++; this.grow('strength', 0.6); }
  onPay(n, why) { const st = this.stats; if (n > 0) st.earned += n; else st.spent -= n; if (n > 0 && /^Store robbery/.test(why || '')) { st.robberies++; st.robbed += n; } }
  // a cleared stunt jump: a big step on the matching skill (first clear of each jump gives the most)
  onStunt(stunt, first) { const st = this.stats; const list = stunt.kind === 'car' ? st.carJumps : st.bikeRamps; if (!list.includes(stunt.id)) list.push(stunt.id);
    const v = this.g.player.vehicle; const id = stunt.kind === 'car' || (v && !v.T.pedal) ? 'driving' : 'cycling'; return { id, gain: this.add(id, first ? 5 : 2, stunt.name) }; }
  summary(who) { const s = this.S[who]; return SKILLS.map((q) => ({ ...q, v: s[q.id] })); }
}
