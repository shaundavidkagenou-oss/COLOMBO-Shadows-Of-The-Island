// 76th: what is underfoot — for footsteps (Footsteps.js) and tyre noise (VehicleAudio.js). Reads only data the world already
// keeps (the road grid, the ground-detail registry of footways / drain gratings / manholes, the collider grid for decks and
// platforms, the lot materials GroundBuilder paints, the interior a character is in), so a lookup is a handful of grid reads
// — done once per footstep, never per frame.
//
//   surface key: concrete · asphalt · gravel · grass · wood · metalStair · grate · tile   (dry)
//   wet(key, wetness) turns hard ground into 'wet' and earth into 'mud' when the ground is wet (rain or just after)
import * as L from '../world/Layout.js';
import { groundDetailAt } from '../world/GroundDetail.js';

const FLOOR = { wood: 'wood', concrete: 'concrete', redoxide: 'concrete', granite: 'tile', ceramic: 'tile', terrazzo: 'tile', checker: 'tile', marble: 'tile', tile: 'tile', vinyl: 'tile', carpet: 'wood' };
const OLD_ROOMS = { garage: 'concrete', room: 'wood', kade: 'wood', hq: 'tile' }; // Interiors.js rooms (plain coloured floors)
const LOT = { lawn: 'grass', grass: 'grass', sand: 'gravel', laterite: 'gravel', concrete: 'concrete' };
// the ground a lot is laid with — the same rule GroundBuilder.lotMaterial paints (kept here: importing the builder from the audio
// side would pull its whole module graph in early)
const LAWN_ZONES = new Set(['vmpark', 'museum', 'townhall', 'slpHQ', 'johns']);
function lotMaterial(cell) { const zn = L.zoneAt(cell.cx, cell.cz);
  if (zn) return LAWN_ZONES.has(zn.id) ? 'lawn' : zn.id === 'gangaramaya' || zn.id === 'kovil' ? 'sand' : 'concrete';
  const st = L.DISTRICTS[cell.district] && L.DISTRICTS[cell.district].style; return { villa: 'lawn', residential: 'laterite', lake: 'lawn', green: 'grass', port: 'concrete' }[st] || 'concrete'; }

// the floor of an interior proxy / room (P.indoor, Interiors.current)
export function floorOf(I) {
  if (!I) return null; if (I.hospital) return 'tile';
  const k = I.floorKind || (I.room && I.room.g && I.room.g.userData.floorKind) || (I.g && I.g.userData && I.g.userData.floorKind);
  if (k) return FLOOR[k] || 'tile';
  if (I.id && OLD_ROOMS[I.id]) return OLD_ROOMS[I.id];
  return 'tile';
}

// surface at (x, z) for feet at height y. collision: the world's collider grid (decks, platforms, stairs). indoor: the
// interior the walker is in (or null)
export function surfaceAt(x, z, y = L.LAND_Y, collision = null, indoor = null) {
  if (indoor) return floorOf(indoor) || 'tile';
  // standing on a raised deck / platform / stair (the top within a step of the feet)
  if (collision) { let best = null, bt = -1e9;
    for (const c of collision.query(x, z, x, z)) { if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue; if (c.kind !== 'deck' && c.kind !== 'platform' && c.kind !== 'stair') continue;
      const top = (c.y0 || 0) + c.h; if (Math.abs(top - y) < 0.3 && top > bt) { bt = top; best = c; } }
    if (best) return best.metal ? 'metalStair' : best.marina ? 'wood' : best.wood ? 'wood' : 'concrete'; }
  const rail = L.distToRail && L.distToRail(x, z) < 4 ? true : false;
  if (rail && !L.roadAt(x, z)) { const g = L.groundY(x, z); if (Math.abs(g - (L.LAND_Y + 0.15)) < 0.05 || g < L.LAND_Y + 0.15) return 'gravel'; } // the ballast bed
  const gd = groundDetailAt(x, z); if (gd === 'grate') return 'grate';
  if (L.fuelSurfaceAt(x, z) != null || L.customsSurfaceAt(x, z) != null) return 'concrete'; // forecourts, the Customs lot
  if (L.roadAt(x, z)) return 'asphalt';
  if (gd === 'walk') return 'concrete';
  if (L.bridgeWalkAt(x, z) || L.copingAt(x, z) != null) return 'concrete';
  if (L.surfaceY(x, z) > L.groundY(x, z) + 0.01) return 'concrete'; // park paving (paths, plaza, ring)
  const c = L.cellAt(x, z); if (!c) return 'concrete';
  return LOT[lotMaterial(c)] || 'concrete';
}

// the wet version of a surface: wetness 0..1 (Atmosphere.wet); covered: under a roof
export function wetSurface(s, wet, covered = false) {
  if (covered || wet < 0.35) return s;
  if (s === 'concrete' || s === 'asphalt') return 'wet';
  if (s === 'grass') return wet > 0.55 ? 'mud' : 'grass';
  if (s === 'gravel') return wet > 0.7 ? 'mud' : 'gravel';
  return s; // wood, metal, grates: stay themselves (a puddle splash is layered on hard ground — Footsteps.puddle)
}
// standing water on hard outdoor ground in heavy rain: the road's puddle-prone patches are random smooth areas of the
// asphalt roughness map, so the audio uses a matching deterministic scatter of 2 m cells (about a fifth of the ground)
export function puddleAt(x, z, wet) { if (wet < 0.6) return false; const i = Math.floor(x / 2), j = Math.floor(z / 2); const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h) < 0.2 * Math.min(1, (wet - 0.5) * 2); }
