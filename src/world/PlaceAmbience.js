// 75th request — what should be heard around Viharamahadevi Park and the hospital garden (PlaceAudio.js plays it).
// Per frame: a few distance checks; the specs are persistent objects (mutated, never re-created), so nothing is
// allocated. Loops only exist while audible: the park's while the player is in or near the park, the garden's while he
// is in the hospital grounds (not inside the building).
import { PlaceSound, SYNTH, TICK } from '../audio/PlaceAudio.js';
import { PARK, PONDS } from './Parks.js';
import { groundsWorld, toWorld } from './HospitalPlan.js';
import { Audio } from '../audio/Audio.js';

const R = Math.random;
const sp = (id, o = {}) => Object.assign({ id, x: 0, z: 0, ref: 1, lvl: 1, fadeIn: 1.2, fadeOut: 1.5 }, o);
// the garden fountain (HospitalBuild.gardenFountain) and the bench group round it
export const GARDEN_FOUNTAIN = { u: 0, v: 46 };

// one-shot placeholders (a recording in the Viharamahadevi Park block replaces each)
const ONE = {
  koel: (g, pan) => { for (let i = 0; i < 3; i++) { Audio.tone(620 + i * 40, 0.16, { vol: 0.02 * g, pan, when: i * 0.9, glide: 820 + i * 50, out: 'amb' }); Audio.tone(900 + i * 50, 0.3, { vol: 0.022 * g, pan, when: i * 0.9 + 0.2, glide: 1250 + i * 60, out: 'amb' }); } },
  crow: (g, pan) => { for (let i = 0; i < 3; i++) Audio.noise(0.16, { f: 1100 + R() * 300, q: 3.5, vol: 0.03 * g, pan, when: i * 0.32 + R() * 0.08, out: 'amb' }); },
  squirrel: (g, pan) => { for (let i = 0; i < 9; i++) Audio.tone(3300 + R() * 500, 0.03, { vol: 0.012 * g, pan, when: i * 0.11, glide: 2600, out: 'amb' }); },
  vendor: (g, pan) => { for (let i = 0; i < 4; i++) Audio.tone(2100, 0.5, { vol: 0.012 * g, pan, when: i * 0.22, out: 'amb' }); },
  ducks: (g, pan) => { for (let i = 0; i < 3; i++) Audio.noise(0.12, { f: 750 + R() * 120, q: 7, vol: 0.03 * g, pan, when: i * 0.25 + R() * 0.1, out: 'amb' }); },
};

export class PlaceAmbience {
  constructor(game) {
    this.g = game;
    this.park = { fountain: sp('park.fountain', { x: 90, z: -60, ref: 10, lvl: 1, synth: SYNTH.water(true), fadeIn: 0.6, fadeOut: 0.6 }),
      jets: PONDS.flatMap((p) => p.jets.map(([x, z]) => sp('park.jets', { x, z, ref: 3, lvl: 0.8, synth: SYNTH.water(false), fadeIn: 0.6, fadeOut: 0.6 }))),
      birds: sp('park.birds', { synth: SYNTH.quiet, tick: TICK.birds }), breeze: sp('park.breeze', { synth: SYNTH.breeze }),
      people: sp('park.people', { synth: SYNTH.quiet, tick: TICK.people }), night: sp('park.night', { synth: SYNTH.quiet, tick: TICK.crickets }) };
    const [fx, fz] = toWorld(GARDEN_FOUNTAIN.u, GARDEN_FOUNTAIN.v);
    this.garden = { fountain: sp('garden.fountain', { x: fx, z: fz, ref: 4, lvl: 1, synth: SYNTH.water(false), fadeIn: 0.6, fadeOut: 0.6 }),
      chatter: sp('garden.chatter', { x: fx - 5, z: fz, ref: 3, lvl: 0.8, synth: SYNTH.quiet, tick: TICK.chatter }),
      birds: sp('garden.birds', { synth: SYNTH.quiet, tick: TICK.birds }), breeze: sp('garden.breeze', { synth: SYNTH.breeze }), night: sp('garden.crickets', { synth: SYNTH.quiet, tick: TICK.crickets }) };
    this.gw = groundsWorld(); this.timers = { koel: 20, crow: 12, squirrel: 30, vendor: 50, ducks: 35 }; this.stats = { park: 0, garden: 0 };
  }
  // 0 outside … 1 inside the rectangle, fading over `fade` metres outside it
  near(r, x, z, fade) { const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1); return Math.max(0, 1 - Math.hypot(dx, dz) / fade); }
  zone(s, x, z, lvl) { s.x = x; s.z = z; s.lvl = lvl; if (lvl > 0.005) PlaceSound.want(s.key || (s.key = s.id + '#zone'), s); }
  update(dt) {
    const g = this.g, P = g.player; if (!P) return; const x = P.x, z = P.z; const A = g.atmos; const h = A ? A.hour : 12; const day = h > 5.8 && h < 18.7;
    const rain = A && A.w ? Math.min(1, A.w.rain || 0) : 0; const inside = !!g.indoor || (g.hospital && P.indoor === g.hospital.room); const out = inside ? 0.25 : 1;
    // ---- Viharamahadevi Park
    const kp = this.near(PARK, x, z, 40) * out; this.stats.park = kp;
    if (kp > 0 || Math.hypot(x - 90, z + 60) < 90) {
      const F = this.park; if (Math.hypot(x - F.fountain.x, z - F.fountain.z) < 90) PlaceSound.want('park.fountain', F.fountain);
      for (const j of F.jets) if (Math.hypot(x - j.x, z - j.z) < 40) PlaceSound.want(j.key || (j.key = 'park.jets@' + j.x), j);
      this.zone(F.breeze, x, z, kp * (0.7 + rain * 0.3)); this.zone(F.birds, x, z, day ? kp * (1 - rain * 0.8) : 0); this.zone(F.people, x, z, day ? kp * (1 - rain) * 0.9 : 0); this.zone(F.night, x, z, day ? 0 : kp);
      if (kp > 0.5) this.shots(dt, day, rain, x, z);
    }
    // ---- hospital garden (the grounds round the building)
    const kg = this.near(this.gw, x, z, 25) * (inside ? 0 : 1); this.stats.garden = kg;
    if (kg > 0) { const G = this.garden; if (Math.hypot(x - G.fountain.x, z - G.fountain.z) < 50) PlaceSound.want('garden.fountain', G.fountain);
      if (day && !rain && Math.hypot(x - G.chatter.x, z - G.chatter.z) < 30) PlaceSound.want('garden.chatter', G.chatter);
      this.zone(G.breeze, x, z, kg * 0.7); this.zone(G.birds, x, z, day ? kg * (1 - rain * 0.8) * 0.9 : 0); this.zone(G.night, x, z, day ? 0 : kg); }
  }
  at(dt, id, k, ref, n0, n1, near, x, z) { const T = this.timers; if ((T[k] -= dt) > 0) return; T[k] = n0 + R() * n1; const a = R() * Math.PI * 2, d = near > 0 ? near : 12 + R() * 25; PlaceSound.shot(id, x + Math.cos(a) * d, z + Math.sin(a) * d, ref, 1, ONE[k]); }
  shots(dt, day, rain, x, z) {
    if (day && rain < 0.4) { this.at(dt, 'park.koel', 'koel', 25, 25, 45, 0, x, z); this.at(dt, 'park.squirrel', 'squirrel', 10, 30, 50, 6 + R() * 8, x, z); this.at(dt, 'park.vendor', 'vendor', 18, 70, 90, 0, x, z); }
    this.at(dt, 'park.crow', 'crow', 20, 20, 35, 0, x, z);
    let pd = 1e9; for (const p of PONDS) pd = Math.min(pd, Math.hypot(x - p.cx, z - p.cz)); if (pd < 35 && day) this.at(dt, 'park.ducks', 'ducks', 10, 40, 50, 8, x, z);
  }
}
