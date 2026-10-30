// Player health (0-100), saved in story.state.health.
// Damage sources (all non-graphic: a red edge flash + stumble, never wounds or blood):
//   - crashing a vehicle you are driving (threshold/scale by vehicle type: bikes and tuk-tuks hurt most)
//   - being struck by a moving vehicle while on foot
//   - falls from height (landing speed above ~3 m drop)
// Recovery: after 12 s without damage health slowly regenerates to 60; food restores 25; rest/hospital restores fully.
// At 0 the player is taken to the National Hospital (Colombo). Treatment in Sri Lankan state hospitals is free of charge,
// so the only charge is for medicines bought at the pharmacy outside on discharge (a common reality), capped by your cash.
import * as L from '../world/Layout.js';

export const HOSPITAL = { name: 'National Hospital of Sri Lanka', medicines: 1500, ambulanceMedicines: 900, hours: 3 };
const REGEN_TO = 60, REGEN_RATE = 0.9, REGEN_DELAY = 12;

export class Health {
  constructor(game) {
    this.g = game; this.lastHurt = -99; this.impactSeen = 0; this.busy = false; this.stats = { hits: 0, crashes: 0, falls: 0, admissions: 0, lastCause: null };
    const P = game.player; this.bind(P);
  }
  bind(P) { // Player is rebuilt on load/outfit change: (re)attach the event hooks
    if (!P || P.__healthBound === this) return; P.__healthBound = this;
    P.events.on('land', () => { const v = -P.lastLandVy; if (v > 9) { this.stats.falls++; this.damage((v - 9) * 9, 'fall'); } });
    P.events.on('hitByVehicle', (speed) => { this.stats.hits++; this.damage(Math.min(85, 8 + speed * 3.4), 'struck by a vehicle'); });
  }
  get hp() { const s = this.g.story.state; if (typeof s.health !== 'number' || !isFinite(s.health)) s.health = 100; return s.health; }
  set hp(v) { this.g.story.state.health = Math.max(0, Math.min(100, v)); }
  damage(n, cause) {
    const g = this.g; if (this.busy || !(n > 0) || g.director.active || g.mode !== 'play') return;
    n *= (g.player && g.player.perk && g.player.perk.armor) || 1; // Shashika's plate carrier takes some of it
    this.hp = this.hp - n; this.lastHurt = g.clock; this.stats.lastCause = cause; g.hud.hurt?.(Math.min(1, n / 40));
    if (this.hp <= 0) this.hospitalise(cause);
  }
  heal(n) { this.hp = this.hp + n; }
  update(dt) {
    const g = this.g, P = g.player; this.bind(P); if (this.busy) return;
    const v = P.vehicle;
    if (v && v.lastImpact && v.lastImpact.t !== this.impactSeen) {
      this.impactSeen = v.lastImpact.t; const s = v.lastImpact.v; const exposed = v.T.entry === 'bike' || v.type === 'tuktuk';
      const thr = exposed ? 7 : 11; if (s > thr) { this.stats.crashes++; this.damage((s - thr) * (v.T.entry === 'bike' ? 3.2 : exposed ? 2.4 : 1.5), 'vehicle crash'); }
    }
    if (g.clock - this.lastHurt > REGEN_DELAY && this.hp < REGEN_TO) this.hp = Math.min(REGEN_TO, this.hp + REGEN_RATE * dt);
  }
  // ambulance = voluntary admission via the phone (1990 Suwa Seriya): same care, lighter pharmacy bill
  async hospitalise(cause, ambulance = false) {
    const g = this.g, P = g.player, S = g.story; if (this.busy) return; this.busy = true; this.stats.admissions++;
    g.weapons?.forceHolster?.(); P.control = false; P.speed = 0;
    if (S.side) { S.side = null; S.hud.setTimer(null); S.hud.setObjective('', ''); S.removeNPC?.('fare'); }
    if (S.running) { const err = S.fail(ambulance ? 'You called an ambulance.' : 'You were taken to hospital.'); for (const c of S.conds) c.rej(err); S.conds = []; }
    if (!ambulance) P.ch.anim.set('stumble');
    await this.wait(ambulance ? 0.2 : 1.2); await g.hud.fade(1, 0.9);
    if (P.vehicle) { const veh = P.vehicle; veh.speed = 0; veh.mesh.remove(P.ch.root); g.scene.add(P.ch.root); veh.player = false; P.vehicle = null; P.exiting = null; P.entry = null; P.ch.anim.standUp(); g.traffic.release(veh); }
    if (g.police && g.police.level > 0) { for (const u of g.police.units.slice()) g.police.removeUnit(u); g.police.level = 0; g.police.stop = null; g.police.search = null; g.police.incident = null; g.police.lastSeen = null; g.police.setState('patrol'); }
    if (g.interiors.current) { const room = g.interiors.current; room.g.visible = false; g.interiors.current = null; g.setIndoor(false); } // shop/flat interior: leave it
    P.indoor = null;
    g.atmos.advance(HOSPITAL.hours * 60);
    const [hx, hz] = S.safeSpot(L.PLACES.hospital.x, L.PLACES.hospital.z); P.teleport(hx, hz, Math.PI); P.ch.anim.set(null); g.world.warm(hx, hz);
    this.hp = 100; P.stamina = 1; this.lastHurt = -99;
    const want = ambulance ? HOSPITAL.ambulanceMedicines : HOSPITAL.medicines; const paid = Math.max(0, Math.min(want, S.state.money));
    if (paid > 0) S.pay(-paid, 'Pharmacy — medicines prescribed at the National Hospital (treatment there is free)');
    this.last = { cause, ambulance, paid, want, hours: HOSPITAL.hours };
    await this.wait(0.4); await g.hud.fade(0, 0.9); P.control = true; this.busy = false;
    g.hud.notify(`Discharged — ${HOSPITAL.name}`, `${ambulance ? 'Brought in by a 1990 Suwa Seriya ambulance (free service). ' : `Admitted after: ${cause}. `}Treatment at a government hospital is free; ${paid ? `you paid Rs. ${paid.toLocaleString('en-LK')} for medicines at the pharmacy outside${paid < want ? ' (all the cash you had)' : ''}` : 'you had no cash, so the pharmacy gave the medicines on credit and waived it'}. ${HOSPITAL.hours} hours passed.`, 'info', 10);
  }
  wait(sec) { return this.g.police.wait(sec); }
}
