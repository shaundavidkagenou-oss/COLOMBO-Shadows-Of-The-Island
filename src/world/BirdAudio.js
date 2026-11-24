// 83rd request — the sounds of the city's birds and its residential air, played from the existing positional audio
// (PlaceSound: one-shots with distance attenuation / panning / low-pass, loops built only while audible and released when
// no longer wanted). Every slot is a player-uploaded recording on the `sounds` board (BirdAmbSoundDefs.js): an empty slot
// plays nothing — no synthesised stand-in, and no audio node is even built for it.
//
//  • calls / wings: from the bird that makes them (Birds.js calls in here), each slot with a cooldown, at most VOICES
//    one-shots in any 2.5 s window (a flock never machine-guns the same call), a random interval per bird; birds out of
//    sight / far away use the distant-calls slot instead of their own.
//  • beds: ONE shared positional source per bed — the decorative birds feed it (their centroid / count drives where it sits
//    and how loud it is), never a loop per bird; faded in / out (PlaceSound fades) and released when not wanted. Morning /
//    day by the clock, tree and rooftop by where the birds are, rooftop also when the player is up high.
//  • balconies: the nearest curtain / washing anchor (BalconyLife — only buildings whose window tier is loaded have them, so
//    they stop when that unloads) with the wind strength; washing goes quiet when it is taken in from the rain.
// No per-frame allocation: scratch arrays are reused; the update runs at 5 Hz except for the PlaceSound wants (cheap).
import { PlaceSound } from '../audio/PlaceAudio.js';
import { SoundBank as SB } from '../audio/SoundBank.js';
import { anchorsNear, rainIn } from './BalconyLife.js';
import { windStr } from './Wind.js';
import { LAND_Y } from './Layout.js';

const VOICES = 4, WINDOW = 2.5;
const CD = { 'ba.crow.call': 2.2, 'ba.crow.call2': 3, 'ba.myna.call': 1.6, 'ba.myna.call2': 2.5, 'ba.pigeon.coo': 2.5, 'ba.kite.call': 7, 'ba.distant': 3.5, 'ba.pigeon.flutter': 0.9, 'ba.wing.move': 0.7, 'ba.flight': 1.5, 'ba.flock.takeoff': 6 };
const CALL = { crow: ['ba.crow.call', 'ba.crow.call2'], myna: ['ba.myna.call', 'ba.myna.call2'], pigeon: ['ba.pigeon.coo'], kite: ['ba.kite.call'], parakeet: [] };
const S = { t: 0, last: new Map(), recent: [], tick: 0, beds: { morning: 0, day: 0, tree: 0, rooftop: 0 }, bedPos: { x: 0, z: 0, tx: 0, tz: 0, rx: 0, rz: 0 }, curtain: null, laundry: null, resN: 0, resX: 0, resZ: 0 };
export const BIRD_AUDIO = { stats: { played: 0, missing: 0, capped: 0, cooldown: 0 }, missing: new Set() };
const tmp = [];
const has = (id) => !!SB.info(id);
function canPlay(id) {
  if (!has(id)) { BIRD_AUDIO.stats.missing++; BIRD_AUDIO.missing.add(id); return false; }
  const l = S.last.get(id); if (l !== undefined && S.t - l < (CD[id] || 1.5)) { BIRD_AUDIO.stats.cooldown++; return false; }
  let n = 0; for (let i = 0; i < S.recent.length; i++) if (S.t - S.recent[i] < WINDOW) n++; if (n >= VOICES) { BIRD_AUDIO.stats.capped++; return false; }
  return true;
}
function fire(id, x, z, ref, k) { S.last.set(id, S.t); if (S.recent.length >= 8) S.recent.shift(); S.recent.push(S.t); BIRD_AUDIO.stats.played++; PlaceSound.shot(id, x, z, ref, k); }
const pick = (a) => a[(Math.random() * a.length) | 0];

export const BirdAudio = {
  // a bird calls (perched / walking / soaring); far = beyond ~55 m or unseen → the distant slot
  call(b, far) { const ids = CALL[b.sp]; if (!ids || !ids.length) return; let id = far ? 'ba.distant' : pick(ids); if (!far && !has(id)) for (const o of ids) if (has(o)) { id = o; break; } if (!canPlay(id)) return; fire(id, b.x, b.z, far ? 30 : b.sp === 'kite' ? 40 : 14, far ? 0.6 : 1); },
  takeoff(b, n) { const id = n >= 4 ? 'ba.flock.takeoff' : b.sp === 'pigeon' ? 'ba.pigeon.flutter' : 'ba.wing.move'; if (canPlay(id)) fire(id, b.x, b.z, n >= 4 ? 16 : 8, 1); },
  land(b) { if (canPlay('ba.wing.move')) fire('ba.wing.move', b.x, b.z, 6, 0.8); },
  pass(b) { if (canPlay('ba.flight')) fire('ba.flight', b.x, b.z, 7, 1); },
  // per frame from Birds.update (after the birds moved). P = player, game for clock / indoor
  update(dt, birds, P, game) {
    S.t += dt; const indoor = !!game.indoor || !!(P.indoor && P.indoor.walkIn); const A = game.atmos; const hour = A ? A.hour : 12; const rain = A && A.w ? A.w.rain : 0; const night = A ? A.night : 0;
    if ((S.tick -= dt) <= 0) { S.tick = 0.2; // 5 Hz: where the beds sit, how strong they are
      let n = 0, sx = 0, sz = 0, nt = 0, tx = 0, tz = 0, nr = 0, rx = 0, rz = 0;
      for (const b of birds) { if (b.sp === 'kite' || b.state === 'gone') continue; const d = Math.abs(b.x - P.x) + Math.abs(b.z - P.z); if (d > 90) continue; n++; sx += b.x; sz += b.z; const k = b.spot && b.spot.kind; if (k === 'tree') { nt++; tx += b.x; tz += b.z; } else if (k === 'roof' || k === 'wire' || k === 'rail') { nr++; rx += b.x; rz += b.z; } }
      const P0 = S.bedPos; if (n) { P0.x = sx / n; P0.z = sz / n; } else { P0.x = P.x; P0.z = P.z; } if (nt) { P0.tx = tx / nt; P0.tz = tz / nt; } if (nr) { P0.rx = rx / nr; P0.rz = rz / nr; }
      const morning = hour > 5.3 && hour < 9.2 ? Math.min(1, (hour - 5.3) * 2, (9.2 - hour) * 1.5) : 0; const quiet = (1 - night) * (1 - rain * 0.7) * (indoor ? 0 : 1); const pop = Math.min(1, n / 12);
      S.beds.morning = morning * quiet * (0.4 + 0.6 * pop); S.beds.day = (1 - morning) * quiet * (0.25 + 0.75 * pop) * (hour > 9 && hour < 18.5 ? 1 : 0.4); S.beds.tree = quiet * Math.min(1, nt / 5); const high = (P.y || 0) - LAND_Y > 9; // on a roof / high walkway S.beds.rooftop = quiet * Math.max(Math.min(1, nr / 6), high ? 0.8 : 0);
      S.high = high;
      // balconies: the nearest curtain / washing within 26 m; residential bed where there are many balconies about
      S.curtain = nearest(anchorsNear('curtain', P.x, P.z, 26, tmp), P); S.laundry = nearest(anchorsNear('laundry', P.x, P.z, 26, tmp), P);
      const res = anchorsNear('laundry', P.x, P.z, 80, tmp); S.resN = res.length; if (res.length) { let ax = 0, az = 0; for (const a of res) { ax += a.p[0]; az += a.p[2]; } S.resX = ax / res.length; S.resZ = az / res.length; }
    }
    if (indoor) return;
    const B = S.beds, P0 = S.bedPos, w = Math.min(1.4, windStr.value);
    if (B.morning > 0.02 && has('ba.amb.morning')) PlaceSound.want('ba.bed.morning', { id: 'ba.amb.morning', x: P0.x, z: P0.z, ref: 60, lvl: B.morning, fadeIn: 3, fadeOut: 4 });
    if (B.day > 0.02 && has('ba.amb.day')) PlaceSound.want('ba.bed.day', { id: 'ba.amb.day', x: P0.x, z: P0.z, ref: 60, lvl: B.day, fadeIn: 3, fadeOut: 4 });
    if (B.tree > 0.02 && has('ba.amb.tree')) PlaceSound.want('ba.bed.tree', { id: 'ba.amb.tree', x: P0.tx, z: P0.tz, ref: 18, lvl: B.tree, fadeIn: 2, fadeOut: 3 });
    if (B.rooftop > 0.02 && has('ba.amb.rooftop')) PlaceSound.want('ba.bed.rooftop', { id: 'ba.amb.rooftop', x: S.high ? P.x : P0.rx, z: S.high ? P.z : P0.rz, ref: 25, lvl: B.rooftop, fadeIn: 2, fadeOut: 3 });
    if (S.high && has('ba.amb.roof')) PlaceSound.want('ba.bed.roof', { id: 'ba.amb.roof', x: P.x, z: P.z, ref: 30, lvl: 0.8, fadeIn: 2, fadeOut: 2.5 });
    if (has('ba.amb.city')) PlaceSound.want('ba.bed.city', { id: 'ba.amb.city', x: P.x, z: P.z, ref: 40, lvl: 0.7 * (1 - rain * 0.3), fadeIn: 3, fadeOut: 3 });
    if (S.resN >= 4 && has('ba.amb.residential')) PlaceSound.want('ba.bed.res', { id: 'ba.amb.residential', x: S.resX, z: S.resZ, ref: 60, lvl: Math.min(1, S.resN / 14) * (night > 0.8 ? 0.5 : 1), fadeIn: 3, fadeOut: 3 });
    if (S.curtain && has('ba.curtain.wind')) PlaceSound.want('ba.curtain', { id: 'ba.curtain.wind', x: S.curtain.p[0], z: S.curtain.p[2], ref: 6, lvl: Math.min(1, 0.2 + w * 0.7), fadeIn: 1, fadeOut: 1.5 });
    if (S.laundry && has('ba.laundry')) { const k = Math.min(1, 0.15 + w * 0.75) * (1 - Math.min(1, rainIn())); if (k > 0.02) PlaceSound.want('ba.laundry', { id: 'ba.laundry', x: S.laundry.p[0], z: S.laundry.p[2], ref: 6, lvl: k, fadeIn: 1, fadeOut: 1.5 }); }
  },
  // which slots of this category are still empty (for the report / dev console)
  emptySlots(defs) { return defs.filter((d) => !has(d.id)).map((d) => d.id); },
  beds() { return { ...S.beds }; },
};
function nearest(list, P) { let best = null, bd = 1e9; for (const a of list) { const d = (a.p[0] - P.x) ** 2 + (a.p[2] - P.z) ** 2; if (d < bd) { bd = d; best = a; } } return best; }
