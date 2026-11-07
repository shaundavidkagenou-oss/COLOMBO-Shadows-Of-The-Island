// Being drunk (an original take on the drunk effect seen in open-world games). `level` is what has been drunk; the felt
// effect `eff` follows it slowly (alcohol takes a minute to hit) and wears off over several minutes.
//   screen   PostFX senses pass: wobble, double vision, motion smear, swimming edges, richer colour
//   camera   slow sway + roll (Player.camFx)
//   body     the spine / head sway (Animator.drunkSway), the walking path weaves, no sprinting when very drunk,
//            now and then a stumble
//   driving  the steering drifts (Player)
//   sound    slightly muffled (Audio.setMuffle)
//   too much one drink after "very drunk" → blackout: fade to black, wake up hours later in bed with a hangover
import * as THREE from 'three';
import { Audio } from '../audio/Audio.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const SHOT = 0.2; // one shot of vodka

export class Drunk {
  constructor(game) { this.g = game; this.level = 0; this.eff = 0; this.hold = 0; this.t = 0; this.stumbleT = 8; this.stats = { drinks: 0, blackouts: 0, stumbles: 0 }; this.per = {}; this.who = null; }
  get label() { const e = this.eff; return e < 0.15 ? 'Sober' : e < 0.4 ? 'Tipsy' : e < 0.7 ? 'Drunk' : 'Very drunk'; }
  drink(amount = SHOT) {
    this.stats.drinks++; if (this.level >= 0.95) { this.blackout(); return 'blackout'; }
    this.level = clamp(this.level + amount, 0, 1.1); this.hold = Math.max(this.hold, 40); return this.level >= 0.95 ? 'very' : 'ok';
  }
  update(dt) {
    const g = this.g, P = g.player; this.t += dt; if (!P) return;
    // each protagonist has his own blood alcohol: switching hands over to the other man's state
    const me = g.squad?.activeMember?.def?.id || 'p'; if (this.who !== me) { if (this.who) this.per[this.who] = { level: this.level, eff: this.eff, hold: this.hold }; const s = this.per[me] || { level: 0, eff: 0, hold: 0 }; this.level = s.level; this.eff = s.eff; this.hold = s.hold; this.who = me; }
    if (this.lastCh && this.lastCh !== P.ch) this.lastCh.anim.drunkSway = 0; this.lastCh = P.ch;
    if (g.health && g.health.hp <= 0) { this.level = 0; this.eff = 0; this.hold = 0; } // dying sobers you up
    if (this.busy) { this.apply(P, dt); return; }
    if (this.hold > 0) this.hold -= dt; else this.level = Math.max(0, this.level - dt / 420); // ~7 game-play minutes from very drunk to sober
    this.eff += (this.level - this.eff) * (1 - Math.exp(-dt / (this.level > this.eff ? 9 : 4))); if (this.eff < 0.004 && this.level === 0) this.eff = 0;
    this.apply(P, dt);
    // stumbles while walking when properly drunk
    if (this.eff > 0.5 && !P.vehicle && !P.indoorBusy && (P.speed || 0) > 0.8 && P.control) { this.stumbleT -= dt * this.eff; if (this.stumbleT <= 0) { this.stumbleT = 5 + Math.random() * 9; const A = P.ch.anim; if (!A.action || A.action === 'crouch') { A.play('stumble', 0.9); this.stats.stumbles++; P.yaw += (Math.random() - 0.5) * 0.6; } } }
  }
  apply(P, dt) {
    const e = this.eff, t = this.t; const g = this.g;
    P.drunk = e; P.ch.anim.drunkSway = e;
    P.camFx = e > 0.01 ? { roll: (Math.sin(t * 0.55) * 0.045 + Math.sin(t * 1.37) * 0.012) * e, pitch: Math.sin(t * 0.71 + 1) * 0.018 * e, yaw: Math.sin(t * 0.43 + 2) * 0.025 * e } : null;
    if (g.post && g.post.setDrunk) g.post.setDrunk(clamp(e * 0.95, 0, 1));
    if (this._muf === undefined || Math.abs(this._muf - e) > 0.02) { this._muf = e; Audio.setMuffle(e * 0.45); }
    void dt;
  }
  // too much: the screen goes, the clock jumps, you wake up in bed (in your room if you were there) with a hangover
  async blackout() {
    const g = this.g; if (this.busy) return; this.busy = true; this.stats.blackouts++; const P = g.player; const room = g.interiors?.current;
    P.control = false; await g.hud.fade(1, 2.2);
    const A = g.atmos; const hrs = 7 + Math.random() * 2; A.advance(hrs * 60); A.update(0.016, new THREE.Vector3(P.x, 0, P.z), g.camera, 0);
    if (room && room.bed) { P.x = room.bed.wake[0]; P.z = room.bed.wake[1]; P.yaw = room.bed.wake[2] || 0; P.sync(); P.snapCamera?.(); }
    this.level = 0.35; this.eff = 0.55; this.hold = 0; P.control = true;
    await g.hud.fade(0, 2.5); this.busy = false;
    g.hud.notify('Blacked out', `You drank too much and passed out. It's ${A.timeString}. Your head is pounding.`, 'warn', 6);
  }
  reset() { this.level = 0; this.eff = 0; this.hold = 0; const P = this.g.player; if (P) { P.drunk = 0; P.camFx = null; P.ch.anim.drunkSway = 0; } this.g.post?.setDrunk?.(0); }
}
