// Calling a friend (phone → Contacts). The two protagonists you are not playing never tag along on their own: each lives
// his own life (SquadLife.js). Call one and ask him to come along and he names a pickup spot — a real place on the
// map: the kerb outside his work (Shashika: Lanka Auto Care, Maradana; David: his Pettah repair stall) or, for Dineth
// out in his three-wheeler, the landmark nearest to where he is. The spot gets a map marker and a GPS route. He waits
// there at the kerb until you pull up beside him in a vehicle with a free seat; then he gets in and stays with you
// (rides along, follows on foot). Call him again to send him off: he goes back to his own day (out of a car at the
// next stop). Nobody comes while the police are after you.
import * as L from '../world/Layout.js';

export const PICKUP_STATE = { NONE: null, WAITING: 'pickup', WITH: 'with' };
const DINETH_SPOTS = ['seema', 'museum', 'townhall', 'fortStation', 'clockTower', 'gfHotel', 'kanatte', 'wellawatte', 'lotus', 'hospital', 'meeting', 'tailor'];
const ANCHOR = {
  shashika: () => ({ x: L.PLACES.garage.x, z: L.PLACES.garage.z, label: 'outside Lanka Auto Care, Maradana' }),
  david: () => ({ x: -70, z: -900, label: 'by his phone-repair stall in Pettah' }),
};
const LINES = {
  shashika: { hi: 'Shashika here. Kohomada, machan?', yes: (s) => `Sure. I'll knock off here — pick me up ${s}.`, where: (s) => `I'm waiting ${s}. Hurry up, no?`, bye: 'Okay, I\'m heading back to the garage. Call me.', cancel: 'No problem, I\'ll get back to the engine.', wanted: 'With the police on you? Not a chance. Lose them first and call me.', noCar: 'Where\'s the car, machan? You said you\'d pick me up.', noRoom: 'No room in that. Come back with a car.', got: 'Took your time!' },
  david: { hi: 'David. What\'s up?', yes: (s) => `Give me two minutes to close up. Pick me up ${s}.`, where: (s) => `Still ${s}. I\'m standing at the kerb.`, bye: 'Right, back to the stall. Ping me if you need me.', cancel: 'Okay, I\'ll open up again then.', wanted: 'Not while you\'ve got the police behind you. Shake them off first.', noCar: 'You walked here? Bring a car — that was the plan.', noRoom: 'I\'m not fitting on that. Bring a car.', got: 'Finally. Let\'s go.' },
  dineth: { hi: 'Dineth. Ane, what happened?', yes: (s) => `I\'ll park the tuk. Come get me ${s}.`, where: (s) => `I\'m ${s}, by the road.`, bye: 'Fine, I\'ll go back to the tuk. Call if you need me.', cancel: 'Okay, back to work then.', wanted: 'Police are after you, no? Lose them, then call.', noCar: 'Where\'s the vehicle? Come pick me up properly.', noRoom: 'No space in that. Bring a car.', got: 'Hari, let\'s go.' },
};
export const lines = (id) => LINES[id] || LINES.dineth;

// a kerbside spot by the road nearest the anchor: where he stands (pavement, facing the road) and where a car stops.
// The walk from the carriageway edge to the spot must be clear (roadside fences, railings and walls are solid), so it
// slides along the kerb — and, failing that, tries the roads around — until there is an opening.
export function pickupSpot(T, col, a) {
  const free = (x, z) => !L.roadAt(x, z) && !L.isWater(x, z) && !(col && col.blocked && col.blocked(x, z, 0.35));
  const across = (pc, s) => { const sx = pc.p0[0] + pc.d[0] * s, sz = pc.p0[1] + pc.d[1] * s; const lx = pc.d[1], lz = -pc.d[0]; // left of the travel direction (the kerb in left-hand traffic)
    for (const sgn of [1, -1]) for (let r = 1; r < 16; r += 0.4) { const x = sx + lx * sgn * r, z = sz + lz * sgn * r; if (L.roadAt(x, z)) continue; if (!free(x, z)) break;
      const x2 = x + lx * sgn * 0.7, z2 = z + lz * sgn * 0.7; if (!free(x2, z2)) break; const x3 = x + lx * sgn * 1.4, z3 = z + lz * sgn * 1.4; const [px, pz] = free(x3, z3) ? [x2, z2] : [x, z];
      return { x: px, z: pz, y: L.groundY(px, pz), yaw: Math.atan2(sx - px, sz - pz), stop: { x: sx, z: sz } }; }
    return null; };
  const tryNear = (x, z) => { const ln = T && T.laneNear ? T.laneNear(x, z, 0, 160) : null; if (!ln) return null; const pc = ln.piece;
    for (const off of [0, 5, -5, 10, -10, 16, -16, 24, -24, 34, -34]) { const s = ln.s + off; if (s < 3 || s > pc.len - 3) continue; const r = across(pc, s); if (r) return r; } return null; };
  for (const [dx, dz] of [[0, 0], [40, 0], [-40, 0], [0, 40], [0, -40], [70, 70], [-70, -70], [70, -70], [-70, 70]]) { const r = tryNear(a.x + dx, a.z + dz); if (r) return r; }
  return { x: a.x, z: a.z, y: L.groundY(a.x, a.z), yaw: 0, stop: { x: a.x, z: a.z } };
}
export function anchorFor(m) {
  const id = m.def.id; if (ANCHOR[id]) return ANCHOR[id]();
  let best = null, bd = Infinity; for (const k of DINETH_SPOTS) { const p = L.PLACES[k]; if (!p) continue; const d = Math.hypot(p.x - m.x, p.z - m.z); if (d < bd) { bd = d; best = p; } }
  return best ? { x: best.x, z: best.z, label: `at ${best.name}` } : { x: m.x, z: m.z, label: 'by the road' };
}
// phone options for a friend in a given state, and what each one does
export function callOptions(m) {
  if (m.crew === 'with') return [{ id: 'bye', t: 'See you later — head off' }, { id: 'hang', t: 'Hang up' }];
  if (m.crew === 'pickup') return [{ id: 'where', t: 'Where are you again?' }, { id: 'cancel', t: 'Never mind — don\'t wait' }, { id: 'hang', t: 'Hang up' }];
  return [{ id: 'come', t: 'Come along — I\'ll pick you up' }, { id: 'hang', t: 'Hang up' }];
}
export function canPickUp(v, freeSeat) {
  if (!v) return 'noCar'; if ((v.T && v.T.entry) === 'bike') return 'noRoom'; return freeSeat ? null : 'noRoom';
}
