// COLOMBO city layout: a compressed but geographically faithful plan of central Colombo.
// Coordinates are metres. +x = east, +z = south, so the Indian Ocean lies to the west (-x)
// and the harbour to the north (-z). Ground is flat (Colombo is), roads sit at y=0.02 and
// every non-road land surface (sidewalks, lots) sits at y=0.15.
import { RNG, hash2 } from '../core/rng.js';

export const BOUNDS = { minX: -560, maxX: 900, minZ: -1300, maxZ: 1400 };
export const ROAD_Y = 0.02, LAND_Y = 0.15;
export const ROAD_W = [18, 12, 9, 6.5];
export const WALK_W = [4.5, 3.5, 2.6, 1.8];

// ---------------------------------------------------------------- water
export function coastX(z) {
  // Gentle undulation of the seawall / rocky shore.
  let x = -520 + 5 * Math.sin(z / 95) + 3 * Math.sin(z / 31);
  if (z < -660) x = -515 + 3 * Math.sin(z / 40); // Fort seafront
  return x;
}
export const LAKE = [ // Beira Lake as a union of ellipses [cx, cz, rx, rz]
  [-60, -420, 165, 105],
  [120, -470, 130, 52],
  [-125, -270, 62, 78],
  [-180, -470, 70, 60],
];
export function inLake(x, z, pad = 0) {
  for (const [cx, cz, rx, rz] of LAKE) {
    const dx = (x - cx) / (rx + pad), dz = (z - cz) / (rz + pad);
    if (dx * dx + dz * dz < 1) return true;
  }
  return false;
}
export const CANALS = [ { z0: 1072, z1: 1088, name: 'Wellawatte Canal' }, { z0: 1370, z1: 1400, name: 'Dehiwala Canal' } ];
export function inCanal(z) { for (const c of CANALS) if (z > c.z0 && z < c.z1) return c; return null; }
export function inHarbour(x, z) { return z < -1180 && x < 230; }
export function isSea(x, z) { return x < coastX(z) || inHarbour(x, z) || z < BOUNDS.minZ; }
export function isWater(x, z) { return isSea(x, z) || inLake(x, z) || !!inCanal(z); }

// ---------------------------------------------------------------- districts
export const DISTRICTS = {
  port:       { name: 'Port of Colombo', si: 'කොළඹ වරාය', ta: 'கொழும்பு துறைமுகம்', maxLevel: 1, style: 'port', color: '#5d6b74' },
  kotahena:   { name: 'Kotahena', si: 'කොටහේන', ta: 'கொட்டாஞ்சேனை', maxLevel: 3, style: 'dense', color: '#8a6a4f' },
  gfgreen:    { name: 'Galle Face Green', si: 'ගාලු මුවදොර', ta: 'காலி முகத்திடல்', maxLevel: -1, style: 'green', color: '#5f8a45' },
  fort:       { name: 'Colombo Fort', si: 'කොටුව', ta: 'கோட்டை', maxLevel: 2, style: 'fort', color: '#b49a6a' },
  pettah:     { name: 'Pettah', si: 'පිටකොටුව', ta: 'புறக்கோட்டை', maxLevel: 3, style: 'market', color: '#c0583e' },
  maradana:   { name: 'Maradana', si: 'මරදාන', ta: 'மருதானை', maxLevel: 3, style: 'dense', color: '#9a7a5a' },
  gftowers:   { name: 'Galle Face', si: 'ගාලු මුවදොර', ta: 'காலி முகத்திடல்', maxLevel: 2, style: 'towers', color: '#5a7894' },
  beira:      { name: 'Beira Lake', si: 'බේරේ වැව', ta: 'பேரே வாவி', maxLevel: 2, style: 'lake', color: '#4f7f8a' },
  slave:      { name: 'Slave Island · Kompanna Veediya', si: 'කොම්පඤ්ඤ වීදිය', ta: 'கொம்பனித் தெரு', maxLevel: 3, style: 'dense', color: '#9b6b7a' },
  kollupitiya:{ name: 'Kollupitiya', si: 'කොල්ලුපිටිය', ta: 'கொள்ளுப்பிட்டி', maxLevel: 2, style: 'commercial', color: '#7a7aa0' },
  cinnamon:   { name: 'Cinnamon Gardens · Colombo 7', si: 'කුරුඳුවත්ත', ta: 'கறுவாத்தோட்டம்', maxLevel: 1, style: 'villa', color: '#6d9a5c' },
  borella:    { name: 'Borella', si: 'බොරැල්ල', ta: 'பொரளை', maxLevel: 2, style: 'residential', color: '#a08a6a' },
  bambalapitiya:{ name: 'Bambalapitiya', si: 'බම්බලපිටිය', ta: 'பம்பலப்பிட்டி', maxLevel: 2, style: 'commercial', color: '#6f86a6' },
  havelock:   { name: 'Havelock Town', si: 'හැව්ලොක් නගරය', ta: 'ஹவ்லொக் நகரம்', maxLevel: 2, style: 'residential', color: '#8f9a70' },
  wellawatte: { name: 'Wellawatte', si: 'වැල්ලවත්ත', ta: 'வெள்ளவத்தை', maxLevel: 3, style: 'dense', color: '#a0786a' },
};
const DISTRICT_RECTS = [ // first match wins: [id, x0, x1, z0, z1]
  ['port', -600, 230, -1400, -1000],
  ['kotahena', 230, 1000, -1400, -960],
  ['gfgreen', -600, -409, -660, -240],
  ['fort', -600, -160, -1000, -640],
  ['pettah', -160, 230, -1000, -640],
  ['maradana', 230, 1000, -960, -300],
  ['gftowers', -409, -250, -660, -240],
  ['beira', -250, 230, -640, -240],
  ['slave', -250, 0, -240, 40],
  ['kollupitiya', -600, -250, -240, 400],
  ['cinnamon', 0, 600, -300, 700],
  ['cinnamon', -250, 0, 40, 700],
  ['borella', 600, 1000, -300, 700],
  ['bambalapitiya', -600, -250, 400, 950],
  ['wellawatte', -600, 100, 950, 1500],
  ['havelock', -250, 1000, 700, 1500],
];
export function districtIdAt(x, z) {
  for (const [id, x0, x1, z0, z1] of DISTRICT_RECTS) if (x >= x0 && x < x1 && z >= z0 && z < z1) return id;
  return 'havelock';
}
export function districtAt(x, z) { return DISTRICTS[districtIdAt(x, z)]; }

// ---------------------------------------------------------------- reserved zones (landmarks & parks)
export const ZONES = [
  { id: 'vmpark', name: 'Viharamahadevi Park', rect: [-10, 190, -170, 40], blockRoads: true, kind: 'park' },
  { id: 'townhall', name: 'Colombo Town Hall', rect: [190, 300, -100, 40], blockRoads: true, kind: 'landmark' },
  { id: 'museum', name: 'National Museum', rect: [-10, 190, 40, 180], blockRoads: true, kind: 'landmark' },
  { id: 'lotus', name: 'Lotus Tower', rect: [250, 360, -560, -400], blockRoads: true, kind: 'landmark' },
  { id: 'gangaramaya', name: 'Gangaramaya Temple', rect: [-50, 20, -320, -240], blockRoads: true, kind: 'landmark' },
  { id: 'slpHQ', name: 'Police Headquarters', rect: [-60, 40, -240, -170], blockRoads: true, kind: 'landmark' },
  { id: 'gfhotel', name: 'Galle Face Hotel', rect: [-470, -409, -240, -170], blockRoads: true, kind: 'landmark' },
  { id: 'parliament', name: 'Old Parliament', rect: [-475, -409, -740, -668], blockRoads: true, kind: 'landmark' },
  { id: 'wtc', name: 'Twin Towers', rect: [-340, -280, -1000, -900], blockRoads: true, kind: 'landmark' },
  { id: 'dutch', name: 'Dutch Hospital', rect: [-400, -340, -900, -830], blockRoads: false, kind: 'landmark' },
  { id: 'cargills', name: 'Cargills Building', rect: [-280, -220, -900, -830], blockRoads: false, kind: 'landmark' },
  { id: 'fortstation', name: 'Colombo Fort Railway Station', rect: [-110, 40, -652, -622], blockRoads: true, kind: 'landmark' },
  { id: 'maradanast', name: 'Maradana Railway Station', rect: [420, 540, -652, -622], blockRoads: true, kind: 'landmark' },
  { id: 'stlucia', name: "St. Lucia's Cathedral", rect: [300, 420, -1210, -1080], blockRoads: true, kind: 'landmark' },
  { id: 'hospital', name: 'National Hospital', rect: [600, 720, -300, -170], blockRoads: true, kind: 'landmark' },
  { id: 'kovil', name: 'Sri Murugan Kovil', rect: [-220, -160, 560, 610], blockRoads: false, kind: 'landmark' },
  { id: 'dagoba', name: 'Borella Vihara', rect: [720, 790, 180, 250], blockRoads: false, kind: 'landmark' },
  { id: 'mall', name: 'Majestic Arcade', rect: [-400, -340, 610, 680], blockRoads: false, kind: 'landmark' },
  { id: 'policeHQ', name: 'Kollupitiya Police Station', rect: [-340, -280, -30, 40], blockRoads: false, kind: 'landmark' },
  { id: 'mosque', name: 'Jami Ul-Alfar Mosque', rect: [-5, 31, -891, -864], blockRoads: false, kind: 'landmark' },
  { id: 'clocktower', name: 'Fort Clock Tower', rect: [-392, -378, -924, -906], blockRoads: false, kind: 'landmark' },
  { id: 'lighthouse', name: 'Colombo Lighthouse', rect: [-515, -485, -790, -740], blockRoads: false, kind: 'landmark' },
  { id: 'johns', name: "Johns Private Girls' School", rect: [248, 340, 328, 388], blockRoads: false, kind: 'landmark' }, // fictional school, Horton Place
  { id: 'containers', name: 'Container Terminal', rect: [-480, 230, -1180, -1000], blockRoads: false, kind: 'port' },
];
export function zoneAt(x, z, pad = 0) {
  for (const zn of ZONES) { const [x0, x1, z0, z1] = zn.rect; if (x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad) return zn; }
  return null;
}
export function zoneById(id) { return ZONES.find((z) => z.id === id); }

// ---------------------------------------------------------------- railway
// Coastal line hugs the shore, swings inland past Slave Island, then runs east from Fort station to Maradana.
export const RAIL = [
  [-502, 1400], [-502, -150], [-490, -178], [-460, -192], [-300, -205], [-262, -220], [-250, -250],
  [-250, -540], [-240, -580], [-215, -604], [-185, -612], [900, -612],
];
export const STATIONS = [
  { name: 'Colombo Fort', si: 'කොටුව', ta: 'கோட்டை', x: -35, z: -612, along: 'x' },
  { name: 'Maradana', si: 'මරදාන', ta: 'மருதானை', x: 480, z: -612, along: 'x' },
  { name: 'Kompanna Veediya', si: 'කොම්පඤ්ඤ වීදිය', ta: 'கொம்பனித் தெரு', x: -250, z: -330, along: 'z' },
  { name: 'Kollupitiya', si: 'කොල්ලුපිටිය', ta: 'கொள்ளுப்பிட்டி', x: -502, z: 180, along: 'z' },
  { name: 'Bambalapitiya', si: 'බම්බලපිටිය', ta: 'பம்பலப்பிட்டி', x: -502, z: 640, along: 'z' },
  { name: 'Wellawatte', si: 'වැල්ලවත්ත', ta: 'வெள்ளவத்தை', x: -502, z: 1150, along: 'z' },
];
export function distToRail(x, z) {
  let best = 1e9;
  for (let i = 0; i < RAIL.length - 1; i++) {
    const [ax, az] = RAIL[i], [bx, bz] = RAIL[i + 1];
    const dx = bx - ax, dz = bz - az; const L = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / L; t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - x, pz = az + dz * t - z; const d = px * px + pz * pz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------- road grid lines
const L = (pos, spans) => ({ pos, spans: spans.map(([min, max, level, name]) => ({ min, max, level, name })) });
const ALL = [-1400, 1500];
export const XS = [ // north–south roads
  L(-560, []),
  L(-475, [[-1000, -660, 1, 'Chaithya Road'], [-170, 1500, 0, 'Marine Drive']]),
  L(-400, [[-1000, -660, 0, 'Janadhipathi Mawatha'], [-660, -240, 0, 'Galle Face Centre Road'], [-240, 1500, 0, 'Galle Road']]),
  L(-340, [[...ALL, 2, 'Lighthouse Street']]),
  L(-280, [[-1000, -660, 1, 'York Street'], [-260, 1500, 0, 'Duplication Road']]),
  L(-220, [[...ALL, 2, 'Kew Lane']]),
  L(-160, [[-1000, -640, 1, 'Front Street'], [-260, 1500, 1, 'Sir James Peiris Mawatha']]),
  L(-110, [[...ALL, 3, '1st Cross Street']]),
  L(-60, [[...ALL, 2, 'Bodhiraja Mawatha']]),
  L(-10, [[...ALL, 3, '2nd Cross Street']]),
  L(40, [[-1000, -640, 1, 'Sea Street'], [-640, 1500, 1, 'Green Path']]),
  L(90, [[...ALL, 3, '3rd Cross Street']]),
  L(140, [[...ALL, 2, 'Barrack Lane']]),
  L(190, [[...ALL, 3, '4th Cross Street']]),
  L(240, [[...ALL, 1, 'Darley Road']]),
  L(300, [[...ALL, 2, 'Temple Lane']]),
  L(360, [[...ALL, 3, 'Armour Lane']]),
  L(420, [[...ALL, 1, 'Maradana Road']]),
  L(480, [[...ALL, 2, 'Deans Road']]),
  L(540, [[...ALL, 3, 'Jayantha Lane']]),
  L(600, [[...ALL, 2, 'Ananda Rajakaruna Mawatha']]),
  L(660, [[...ALL, 0, 'Baseline Road']]),
  L(720, [[...ALL, 2, 'Cotta Road']]),
  L(790, [[...ALL, 2, 'Kanatte Lane']]),
  L(860, [[...ALL, 1, 'Castle Street']]),
  L(900, []),
];
export const ZS = [ // east–west roads
  L(-1300, []),
  L(-1270, [[230, 1000, 1, 'Jampettah Street']]),
  L(-1210, [[...ALL, 2, 'Kotahena Street']]),
  L(-1150, [[...ALL, 2, 'Quay Road']]),
  L(-1080, [[...ALL, 1, 'Wolfendhal Street']]),
  L(-1000, [[...ALL, 0, 'Port Access Road']]),
  L(-950, [[...ALL, 3, 'Gabo\'s Lane']]),
  L(-900, [[-600, -160, 1, 'Chatham Street'], [-160, 1000, 1, 'Main Street']]),
  L(-860, [[...ALL, 3, 'Prince Street']]),
  L(-820, [[-600, -160, 2, 'Bank of Ceylon Mawatha'], [-160, 1000, 2, 'Keyzer Street']]),
  L(-780, [[...ALL, 3, 'Bankshall Street']]),
  L(-740, [[...ALL, 2, 'Gasworks Street']]),
  L(-700, [[...ALL, 3, 'Old Moor Street']]),
  L(-660, [[-600, -160, 0, 'Lotus Road'], [-160, 1000, 0, 'Olcott Mawatha']]),
  L(-560, [[...ALL, 2, 'Gardiner Mawatha']]),
  L(-480, [[...ALL, 2, 'Lake Drive']]),
  L(-400, [[...ALL, 1, 'Nawam Mawatha']]),
  L(-320, [[...ALL, 2, 'Perahera Mawatha']]),
  L(-240, [[...ALL, 0, 'Union Place']]),
  L(-170, [[...ALL, 2, 'Malay Street']]),
  L(-100, [[...ALL, 1, 'Glennie Street']]),
  L(-30, [[...ALL, 2, 'Justice Akbar Mawatha']]),
  L(40, [[...ALL, 0, 'Dharmapala Mawatha']]),
  L(110, [[...ALL, 2, 'Alfred House Road']]),
  L(180, [[...ALL, 1, 'Ward Place']]),
  L(250, [[...ALL, 2, 'Rosmead Place']]),
  L(320, [[...ALL, 1, 'Horton Place']]),
  L(400, [[...ALL, 0, 'Bauddhaloka Mawatha']]),
  L(470, [[...ALL, 2, 'Fussels Lane']]),
  L(540, [[...ALL, 1, 'Dickmans Road']]),
  L(610, [[...ALL, 2, 'Daisy Villa Avenue']]),
  L(680, [[...ALL, 2, 'Frankfort Place']]),
  L(750, [[...ALL, 1, 'Lauries Road']]),
  L(820, [[...ALL, 2, 'Vajira Road']]),
  L(900, [[...ALL, 0, 'W.A. Silva Mawatha']]),
  L(960, [[...ALL, 3, 'Ramakrishna Lane']]),
  L(1020, [[...ALL, 2, 'Vihara Lane']]),
  L(1140, [[...ALL, 1, 'Station Road']]),
  L(1200, [[...ALL, 3, 'Fernando Lane']]),
  L(1260, [[...ALL, 2, 'Hampden Lane']]),
  L(1340, [[...ALL, 1, 'Canal Bank Road']]),
  L(1400, []),
];
export const NX = XS.length, NZ = ZS.length;
function spanAt(line, t) { for (const s of line.spans) if (t >= s.min && t < s.max) return s; return null; }

// ---------------------------------------------------------------- the road graph
export const segments = []; // {id, dir:'v'|'h', i, j, level, w, hw, name, x0,z0,x1,z1, crossing, bridge}
export const vseg = []; // vseg[i][j] : x=XS[i], z from ZS[j] to ZS[j+1]
export const hseg = []; // hseg[i][j] : z=ZS[j], x from XS[i] to XS[i+1]

function segAllowed(x0, z0, x1, z1, level) {
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  const dist = districtAt(mx, mz);
  if (level > 0 && level > dist.maxLevel) return { ok: false };
  if (dist === DISTRICTS.gfgreen) return { ok: false };
  let crossing = false, bridge = false;
  const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(2, Math.ceil(len / 3));
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (isSea(x, z) || inLake(x, z, 6)) return { ok: false };
    if (inCanal(z)) { if (level > 1) return { ok: false }; bridge = true; }
    if (distToRail(x, z) < 7) { if (level > 1) return { ok: false }; crossing = true; }
    const zn = zoneAt(x, z, -1.5);
    if (zn && zn.blockRoads && k > 0 && k < n) return { ok: false };
  }
  return { ok: true, crossing, bridge };
}

for (let i = 0; i < NX; i++) {
  vseg[i] = [];
  for (let j = 0; j < NZ - 1; j++) {
    const x = XS[i].pos, z0 = ZS[j].pos, z1 = ZS[j + 1].pos;
    const sp = spanAt(XS[i], (z0 + z1) / 2);
    vseg[i][j] = null;
    if (!sp || x < BOUNDS.minX + 5 || x > BOUNDS.maxX - 5) continue;
    const r = segAllowed(x, z0, x, z1, sp.level);
    if (!r.ok) continue;
    const s = { id: segments.length, dir: 'v', i, j, level: sp.level, w: ROAD_W[sp.level], hw: ROAD_W[sp.level] / 2, walk: WALK_W[sp.level], name: sp.name, x0: x, z0, x1: x, z1, crossing: r.crossing, bridge: r.bridge };
    segments.push(s); vseg[i][j] = s;
  }
}
for (let i = 0; i < NX - 1; i++) {
  hseg[i] = [];
  for (let j = 0; j < NZ; j++) {
    const z = ZS[j].pos, x0 = XS[i].pos, x1 = XS[i + 1].pos;
    const sp = spanAt(ZS[j], (x0 + x1) / 2);
    hseg[i][j] = null;
    if (!sp || z < BOUNDS.minZ + 5 || z > BOUNDS.maxZ - 5) continue;
    const r = segAllowed(x0, z, x1, z, sp.level);
    if (!r.ok) continue;
    const s = { id: segments.length, dir: 'h', i, j, level: sp.level, w: ROAD_W[sp.level], hw: ROAD_W[sp.level] / 2, walk: WALK_W[sp.level], name: sp.name, x0, z0: z, x1, z1: z, crossing: r.crossing, bridge: r.bridge };
    segments.push(s); hseg[i][j] = s;
  }
}
export function getV(i, j) { return (vseg[i] && vseg[i][j]) || null; }
export function getH(i, j) { return (hseg[i] && hseg[i][j]) || null; }

// Nodes / intersections
export const nodes = []; // index i*NZ + j
for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
  const segs = [getV(i, j - 1), getV(i, j), getH(i - 1, j), getH(i, j)];
  const n = { id: i * NZ + j, i, j, x: XS[i].pos, z: ZS[j].pos, segs: segs.filter(Boolean), up: segs[0], down: segs[1], left: segs[2], right: segs[3] };
  n.hwV = Math.max(segs[0] ? segs[0].hw : 0, segs[1] ? segs[1].hw : 0);
  n.hwH = Math.max(segs[2] ? segs[2].hw : 0, segs[3] ? segs[3].hw : 0);
  const major = n.segs.filter((s) => s.level <= 1).length;
  n.signal = n.segs.length >= 3 && (major >= 3 || (major >= 2 && n.segs.some((s) => s.level === 0)));
  n.signalOffset = hash2(i, j, 9) * 24;
  nodes.push(n);
}
export function nodeAt(i, j) { return nodes[i * NZ + j]; }
// Signal phases: returns 'green' | 'yellow' | 'red' for an approach axis ('v' or 'h').
export const SIGNAL_CYCLE = 26;
export function signalState(node, axis, t) {
  if (!node.signal) return 'green';
  const c = ((t + node.signalOffset) % SIGNAL_CYCLE + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  // v: green 0-10, yellow 10-12.5, red after. h: green 13-23, yellow 23-25.5
  if (axis === 'v') return c < 10 ? 'green' : c < 12.5 ? 'yellow' : 'red';
  return c >= 13 && c < 23 ? 'green' : c >= 23 && c < 25.5 ? 'yellow' : 'red';
}
export function pedSignal(node, crossAxis, t) {
  // Pedestrians crossing a road of axis 'v' walk while 'h' traffic has green and vice versa... simplified:
  // crossing a vertical road requires vertical traffic to be red.
  if (!node.signal) return true;
  return signalState(node, crossAxis, t) === 'red' && signalState(node, crossAxis === 'v' ? 'h' : 'v', t) === 'green';
}

// ---------------------------------------------------------------- cells (blocks)
export const cells = [];
for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NZ - 1; j++) {
  const x0 = XS[i].pos, x1 = XS[i + 1].pos, z0 = ZS[j].pos, z1 = ZS[j + 1].pos;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const L = getV(i, j), R = getV(i + 1, j), T = getH(i, j), B = getH(i, j + 1);
  const land = [x0 + (L ? L.hw : 0), x1 - (R ? R.hw : 0), z0 + (T ? T.hw : 0), z1 - (B ? B.hw : 0)];
  const lot = [land[0] + (L ? L.walk : 0), land[1] - (R ? R.walk : 0), land[2] + (T ? T.walk : 0), land[3] - (B ? B.walk : 0)];
  let waterSamples = 0;
  for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) if (isWater(x0 + (x1 - x0) * a / 4, z0 + (z1 - z0) * b / 4)) waterSamples++;
  const did = districtIdAt(cx, cz);
  cells.push({ id: cells.length, i, j, x0, x1, z0, z1, cx, cz, L, R, T, B, land, lot, district: did, water: waterSamples === 25, partial: waterSamples > 0 && waterSamples < 25, centerWater: isWater(cx, cz) });
}
export function cellAt(x, z) {
  const i = findIndex(XS, x), j = findIndex(ZS, z);
  if (i < 0 || j < 0 || i >= NX - 1 || j >= NZ - 1) return null;
  return cells[i * (NZ - 1) + j];
}
function findIndex(lines, v) {
  let lo = 0, hi = lines.length - 1;
  if (v < lines[0].pos || v >= lines[hi].pos) return -1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (lines[m].pos <= v) lo = m; else hi = m; }
  return lo;
}

// Is (x,z) on a road surface? Returns the segment (or a node) or null.
export function roadAt(x, z) {
  const c = cellAt(x, z); if (!c) return null;
  if (c.L && x - c.x0 <= c.L.hw) return c.L;
  if (c.R && c.x1 - x <= c.R.hw) return c.R;
  if (c.T && z - c.z0 <= c.T.hw) return c.T;
  if (c.B && c.z1 - z <= c.B.hw) return c.B;
  for (const [ni, nj] of [[c.i, c.j], [c.i + 1, c.j], [c.i, c.j + 1], [c.i + 1, c.j + 1]]) {
    const n = nodeAt(ni, nj);
    if (n.segs.length && Math.abs(x - n.x) <= n.hwV && Math.abs(z - n.z) <= n.hwH) return n;
  }
  return null;
}
export function bridgeWalkAt(x, z) {
  const c = inCanal(z); if (!c) return false;
  const i = findIndex(XS, x); if (i < 0) return false;
  for (const k of [i, i + 1]) {
    const line = XS[k]; if (!line) continue; const j = findIndex(ZS, z); const s = getV(k, j);
    if (s && s.bridge && Math.abs(x - line.pos) <= s.hw + s.walk) return true;
  }
  return false;
}
let groundHook = null; // Railway registers the ballast bed / level-crossing humps here (avoids an import cycle)
export function setGroundHook(fn) { groundHook = fn; }
export function groundY(x, z) {
  if (groundHook) { const h = groundHook(x, z); if (h != null) return h; }
  if (roadAt(x, z)) return ROAD_Y;
  if (isWater(x, z)) return bridgeWalkAt(x, z) ? LAND_Y : -1.2;
  const cp = copingAt(x, z); if (cp != null) return cp;
  return LAND_Y;
}
// Raised copings along the water (built in GroundBuilder): feet stand ON them instead of sinking into the concrete.
//  * Beira Lake embankment: 0.9 m wide coping, top LAND_Y + 0.3, just outside the lake ellipses
//  * seawall (z −1000…1370, not the harbour): 0.6 m coping on the land side of the coast line, top LAND_Y + 0.55
export const SEAWALL_Z = [-1000, 1370];
export function copingAt(x, z) {
  if (inLake(x, z, 0.9) && !inLake(x, z)) return LAND_Y + 0.3;
  if (z >= SEAWALL_Z[0] && z < SEAWALL_Z[1]) { const c = coastX(z); if (x >= c && x < c + 0.6 && !inHarbour(x, z)) return LAND_Y + 0.55; }
  return null;
}
// The railings along the water are solid: the lake railing stands 0.4 m out on the coping, the Galle Face promenade
// railing 0.4 m in from the seawall edge. True where a walker's centre would be inside / beyond the railing line.
export const PROMENADE_END = -160; // Galle Face promenade + seawall railing run from the Fort end (z -655) down to here
export function beyondRailing(x, z, r = 0.3) {
  if (inLake(x, z, 0.4 + r) && !inLake(x, z)) return true;
  if (z >= -655 && z < PROMENADE_END && x >= coastX(z) && x < coastX(z) + 0.4 + r) return true;
  if (Math.abs(z - PROMENADE_END) < 0.05 + r && x >= coastX(z) && x < coastX(z) + 13 + r) return true; // the return railing at the promenade's south end
  return false;
}
export function roadNameAt(x, z) {
  const r = roadAt(x, z); if (!r) return null;
  if (r.name) return r.name;
  const s = r.segs && r.segs.find((q) => q.level === Math.min(...r.segs.map((k) => k.level)));
  return s ? s.name : null;
}

// ---------------------------------------------------------------- pedestrian graph
// Nodes sit at sidewalk corners around each intersection; edges run along sidewalks and across crossings.
export const pedNodes = []; export const pedEdges = [];
const pedIndex = new Map();
function pedKey(i, j, sx, sz) { return `${i},${j},${sx},${sz}`; }
function cellOf(i, j) { if (i < 0 || j < 0 || i >= NX - 1 || j >= NZ - 1) return null; return cells[i * (NZ - 1) + j]; }
function okPed(x, z) {
  if (isWater(x, z) || inLake(x, z, 4)) return false;
  if (distToRail(x, z) < 5) return false;
  const zn = zoneAt(x, z); if (zn && (zn.id === 'containers' || zn.id === 'lotus' || zn.id === 'fortstation' || zn.id === 'maradanast')) return false;
  return x > BOUNDS.minX + 10 && x < BOUNDS.maxX - 10 && z > BOUNDS.minZ + 10 && z < BOUNDS.maxZ - 30;
}
for (let i = 1; i < NX - 1; i++) for (let j = 1; j < NZ - 1; j++) {
  const n = nodeAt(i, j);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = cellOf(i + (sx > 0 ? 0 : -1), j + (sz > 0 ? 0 : -1));
    if (!c || c.water) continue;
    const sideX = sx > 0 ? c.L : c.R, sideZ = sz > 0 ? c.T : c.B;
    const ox = sideX ? sideX.hw + sideX.walk * 0.5 : (n.hwV ? n.hwV + 1.2 : 1.2);
    const oz = sideZ ? sideZ.hw + sideZ.walk * 0.5 : (n.hwH ? n.hwH + 1.2 : 1.2);
    const x = n.x + sx * ox, z = n.z + sz * oz;
    if (!okPed(x, z)) continue;
    const pn = { id: pedNodes.length, x, z, i, j, sx, sz, edges: [], cell: c.id, node: n.id, walkW: Math.min(sideX ? sideX.walk : 2, sideZ ? sideZ.walk : 2) };
    pedIndex.set(pedKey(i, j, sx, sz), pn); pedNodes.push(pn);
  }
}
function addPedEdge(a, b, type, extra = {}) {
  if (!a || !b) return;
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  if (!okPed(mx, mz) && type !== 'cross') return;
  if (type === 'cross' && (isWater(mx, mz) || distToRail(mx, mz) < 4)) return;
  const e = { id: pedEdges.length, a: a.id, b: b.id, type, len: Math.hypot(a.x - b.x, a.z - b.z), ...extra };
  pedEdges.push(e); a.edges.push(e.id); b.edges.push(e.id);
}
for (let i = 1; i < NX - 1; i++) for (let j = 1; j < NZ - 1; j++) {
  const n = nodeAt(i, j);
  const P = (sx, sz) => pedIndex.get(pedKey(i, j, sx, sz));
  // along sidewalks to neighbouring intersections
  if (getH(i, j)) for (const sz of [-1, 1]) addPedEdge(P(1, sz), pedIndex.get(pedKey(i + 1, j, -1, sz)), 'walk');
  if (getV(i, j)) for (const sx of [-1, 1]) addPedEdge(P(sx, 1), pedIndex.get(pedKey(i, j + 1, sx, -1)), 'walk');
  // corners around this intersection
  for (const sz of [-1, 1]) { const road = sz < 0 ? n.up : n.down; addPedEdge(P(-1, sz), P(1, sz), road ? 'cross' : 'walk', road ? { node: n.id, axis: 'v', seg: road.id } : {}); }
  for (const sx of [-1, 1]) { const road = sx < 0 ? n.left : n.right; addPedEdge(P(sx, -1), P(sx, 1), road ? 'cross' : 'walk', road ? { node: n.id, axis: 'h', seg: road.id } : {}); }
}
// open-area connectivity (parks / green): connect quadrant nodes across cells without roads
for (let i = 1; i < NX - 2; i++) for (let j = 1; j < NZ - 1; j++) {
  if (!getH(i, j)) { const a = pedIndex.get(pedKey(i, j, 1, 1)), b = pedIndex.get(pedKey(i + 1, j, -1, 1)); if (a && b && !a.edges.some((e) => pedEdges[e].b === b.id)) addPedEdge(a, b, 'walk'); }
}

// ---------------------------------------------------------------- named places used by story & activities
export const PLACES = {
  meeting:       { x: -128, z: -893, name: 'Main Street, Pettah' },
  kade:          { x: -78, z: -893, name: 'Lucky Tea Kade, Pettah' },
  mosque:        { x: 6, z: -880, name: 'Jami Ul-Alfar Mosque' },
  gfPromenade:   { x: -508, z: -450, name: 'Galle Face Promenade' },
  gfKade:        { x: -492, z: -330, name: 'Galle Face food carts' },
  gfHotel:       { x: -440, z: -222, name: 'Galle Face Hotel' },
  lotus:         { x: 305, z: -480, name: 'Lotus Tower' },
  seema:         { x: -112, z: -300, name: 'Seema Malaka' },
  museum:        { x: 90, z: 110, name: 'National Museum' },
  townhall:      { x: 245, z: -30, name: 'Town Hall' },
  vmpark:        { x: 90, z: -60, name: 'Viharamahadevi Park' },
  fortStation:   { x: -35, z: -645, name: 'Fort Railway Station' },
  clockTower:    { x: -385, z: -903, name: 'Fort Clock Tower' },
  slaveFlat:     { x: -150, z: -150, name: "Dineth's room, Slave Island" },
  garage:        { x: 455, z: -790, name: 'Lanka Auto Care, Maradana' },
  gunshop:       { x: 380, z: -700, name: 'Ceylon Arms Co., Maradana' },
  tailor:        { x: -305, z: 470, name: 'Ceylon Threads, Bambalapitiya' },
  hospital:      { x: 660, z: -160, name: 'National Hospital' },
  police:        { x: -310, z: 45, name: 'Kollupitiya Police Station' },
  policeHQ2:     { x: -10, z: -231.5, name: 'Police Headquarters' },
  johns:         { x: 271, z: 327.8, name: "Johns Private Girls' School" },
  warehouse:     { x: -120, z: -40, name: 'Union Place warehouse' },
  port:          { x: -100, z: -1060, name: 'Port of Colombo' },
  stlucia:       { x: 360, z: -1070, name: "St. Lucia's Cathedral" },
  wellawatte:    { x: -390, z: 1150, name: 'Wellawatte Junction' },
  kanatte:       { x: 660, z: 120, name: 'Borella Junction' },
};

export const STATS = { segments: segments.length, cells: cells.length, pedNodes: pedNodes.length, pedEdges: pedEdges.length };
