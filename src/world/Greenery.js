// Greenery: the extra trees, palms, banana clumps and the shrubs / ferns / weeds that make Colombo green. Runs at the end of
// CityPlan.generatePlan with its OWN random streams, so the rest of the city (which shares the generators' streams) is unchanged.
//   greenTrees  — before the crown-clearance passes (so every new tree is fitted clear of buildings like the old ones):
//                 more street trees (mixed species per district instead of one species in a row; districts that had none get
//                 a few), and garden trees round the villas and houses: banana clumps, areca palms, mango, coconut, araliya, jak.
//   greenPlants — after them: shrubs in the house gardens (crotons, hibiscus, ixora, bougainvillea) planted along the house walls
//                 and inside the compound walls, ferns under garden trees, weeds and ferns along wall bases and in the shady gaps
//                 between buildings. Never on a road, pavement, forecourt, park path, or inside a building / wall; never on a
//                 doorstep or gateway, a parking bay, a bus halt or a vendor's pitch.
import { RNG } from '../core/rng.js';
import * as L from './Layout.js';
import { onParkFeature } from './Parks.js';
import { plantShapes } from './TreeShapes.js';

const ROAD_TREES = { // district: [spacing (m), [type, weight]…]
  cinnamon: [26, [['rain', 4], ['mara', 2], ['mango', 1.5], ['bo', 1], ['jak', 0.8]]], beira: [30, [['rain', 3], ['mara', 2], ['palm', 1]]], lake: [30, [['rain', 3], ['palm', 1.5], ['mara', 1]]],
  kollupitiya: [34, [['mara', 4], ['mango', 1.5], ['bo', 1.5], ['frangipani', 1]]], bambalapitiya: [36, [['mara', 4], ['mango', 1.5], ['palm', 1], ['frangipani', 1]]],
  havelock: [30, [['mara', 3], ['rain', 2], ['mango', 1.5], ['jak', 1]]], borella: [34, [['mara', 3], ['mango', 2], ['jak', 1], ['bo', 0.6]]], fort: [46, [['mara', 3], ['bo', 1]]],
  slave: [40, [['rain', 2], ['mara', 2], ['mango', 1]]], kotahena: [55, [['mara', 2], ['mango', 1.5], ['bo', 0.8]]], maradana: [55, [['mara', 2], ['mango', 1], ['bo', 0.6]]],
  wellawatte: [50, [['mara', 2], ['mango', 1.5], ['palm', 1]]], pettah: [85, [['mara', 2], ['bo', 1]]], gftowers: [22, [['palm', 1]]],
};
const GARDEN_TREES = [['banana', 2.8], ['areca', 2], ['mango', 1.4], ['palm', 1.4], ['frangipani', 1], ['jak', 0.8], ['rain', 0.25], ['bo', 0.2]];
const SHRUBS = [['croton', 3], ['hibiscus', 2], ['ixora', 2], ['shrub', 2], ['bougain', 1]];
const WALL_SHRUBS = [['bougain', 3], ['shrub', 2], ['hibiscus', 1.5], ['croton', 1.5]];
const pickW = (rng, list) => { let s = 0; for (const [, w] of list) s += w; let r = rng.next() * s; for (const [k, w] of list) { if ((r -= w) <= 0) return k; } return list[0][0]; };

// spatial helpers shared by both passes (rebuilt each call: the plan changes between them)
function index(plan) {
  const G = new Map(), cs = 4; const put = (x, z, r, tag) => { const k = Math.floor(x / cs) * 100003 + Math.floor(z / cs); let a = G.get(k); if (!a) G.set(k, (a = [])); a.push(x, z, r, tag); };
  const R = { gate: 3.2, containers: 5, stall: 2.6, busStop: 3.5, railing: 1.4, shrine: 2, bench: 1.6, foodcart: 2.5, signal: 1, lamp: 0.9, lampHeritage: 0.9, pole: 0.9 };
  for (const p of plan.props) put(p.x, p.z, R[p.type] ?? 1.2, 0);
  for (const t of plan.trees) put(t.x, t.z, 0.6, 1);
  for (const q of plan.poi) if (q.type !== 'lawn') put(q.x, q.z, q.type === 'door' ? 2.6 : q.type === 'shop' ? 1.8 : 1.6, 0);
  for (const q of plan.parking) put(q.x, q.z, 3.2, 0); for (const q of plan.busStops) put(q.x, q.z, 4, 0);
  for (const p of plan.plants || []) put(p.x, p.z, 0.5, 2);
  const W = new Map(), ws = 20; for (const w of plan.walls) for (let i = Math.floor(w.x0 / ws); i <= Math.floor(w.x1 / ws); i++) for (let j = Math.floor(w.z0 / ws); j <= Math.floor(w.z1 / ws); j++) { const k = i * 100003 + j; let a = W.get(k); if (!a) W.set(k, (a = [])); a.push(w); }
  const B = new Map(); for (const b of plan.buildings) for (let i = Math.floor(b.x0 / ws); i <= Math.floor(b.x1 / ws); i++) for (let j = Math.floor(b.z0 / ws); j <= Math.floor(b.z1 / ws); j++) { const k = i * 100003 + j; let a = B.get(k); if (!a) B.set(k, (a = [])); a.push(b); }
  const gapR = (x, z, r) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
  const near = (M, x, z, R0) => { const out = []; for (let i = Math.floor((x - R0) / ws); i <= Math.floor((x + R0) / ws); i++) for (let j = Math.floor((z - R0) / ws); j <= Math.floor((z + R0) / ws); j++) { const a = M.get(i * 100003 + j); if (a) for (const o of a) if (!out.includes(o)) out.push(o); } return out; };
  return {
    put,
    // nearest occupied thing (its own clearance radius added); tagMask: 1 props/POIs, 2 trees, 4 plants
    clear(x, z, r, tagMask = 7) { for (let i = Math.floor((x - r - 5) / cs); i <= Math.floor((x + r + 5) / cs); i++) for (let j = Math.floor((z - r - 5) / cs); j <= Math.floor((z + r + 5) / cs); j++) { const a = G.get(i * 100003 + j); if (!a) continue;
      for (let k = 0; k < a.length; k += 4) { if (!(tagMask & (1 << a[k + 3]))) continue; if (Math.hypot(a[k] - x, a[k + 1] - z) < r + a[k + 2]) return false; } } return true; },
    treeGap(x, z, r) { for (let i = Math.floor((x - r) / cs); i <= Math.floor((x + r) / cs); i++) for (let j = Math.floor((z - r) / cs); j <= Math.floor((z + r) / cs); j++) { const a = G.get(i * 100003 + j); if (!a) continue; for (let k = 0; k < a.length; k += 4) if (a[k + 3] === 1 && Math.hypot(a[k] - x, a[k + 1] - z) < r) return false; } return true; },
    bldGap(x, z) { let m = 1e9; for (const b of near(B, x, z, 10)) m = Math.min(m, gapR(x, z, b)); return m; },
    wallGap(x, z) { let m = 1e9; for (const w of near(W, x, z, 6)) m = Math.min(m, gapR(x, z, w)); return m; },
    near: (x, z, R0) => near(B, x, z, R0), gapR,
  };
}
// strictly inside a block's building lot (not road, kerb or pavement), on land
function inLot(x, z, m = 0.3) { const c = L.cellAt(x, z); if (!c || !c.lot || c.water) return false; const [a, b, d, e] = c.lot; return x > a + m && x < b - m && z > d + m && z < e - m && !L.isWater(x, z) && !L.roadAt(x, z); }
const garden = (b) => (b.style === 'villa' || b.style === 'colonial' || (b.style === 'apartment' && b.tanks)) && ['villa', 'residential'].includes(L.DISTRICTS[b.district]?.style);
// the side a building faces ('N' → its front is at z0) as an outward unit vector
const FRONT = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
// a point round a building's footprint: side 0..3 (N,E,S,W), t 0..1 along it, d metres out from the wall
function around(b, side, t, d) { switch (side) { case 0: return [b.x0 + (b.x1 - b.x0) * t, b.z0 - d]; case 1: return [b.x1 + d, b.z0 + (b.z1 - b.z0) * t]; case 2: return [b.x0 + (b.x1 - b.x0) * t, b.z1 + d]; default: return [b.x0 - d, b.z0 + (b.z1 - b.z0) * t]; } }

export function greenTrees(ctx) {
  const { plan, addTree, onRailReserve, inSchool } = ctx; const rng = new RNG(7171); const I = index(plan); const n0 = plan.trees.length;
  const okTrunk = (x, z) => !L.isWater(x, z) && !L.roadAt(x, z) && !onRailReserve(x, z) && !inSchool(x, z) && !L.fuelSiteAt(x, z, 4) && !onParkFeature(x, z, 2);
  const plant = (type, x, z, s) => { const before = plan.trees.length; addTree(type, x, z, s); if (plan.trees.length > before) { I.put(x, z, 0.6, 1); return true; } return false; };
  // 1. street trees: fill the gaps between the existing ones, mixed species; a few in districts that had none
  for (const seg of L.segments) { if (seg.level > 2 || seg.bridge) continue; const horizontal = seg.dir === 'h'; const len = horizontal ? seg.x1 - seg.x0 : seg.z1 - seg.z0;
    const d = L.districtIdAt((seg.x0 + seg.x1) / 2, (seg.z0 + seg.z1) / 2); const spec = ROAD_TREES[d]; if (!spec) continue; const off = seg.hw + seg.walk * 0.55;
    for (let t = 12; t < len - 10; t += spec[0] * rng.range(0.8, 1.2)) for (const side of [-1, 1]) { const tt = t + side * spec[0] * 0.25; const x = horizontal ? seg.x0 + tt : seg.x0 + side * off, z = horizontal ? seg.z0 + side * off : seg.z0 + tt;
      if (!okTrunk(x, z) || L.zoneAt(x, z, -2) || L.distToRail(x, z) < 6) continue; if (!I.clear(x, z, 2.0, 1) || !I.treeGap(x, z, 7.5)) continue; if (I.bldGap(x, z) < 1.6) continue;
      if (rng.chance(0.85)) plant(pickW(rng, spec[1]), x, z, rng.range(0.8, 1.15)); } }
  const street = plan.trees.length - n0;
  // 2. garden trees round houses and villas
  for (const b of plan.buildings) { if (!garden(b)) continue; const n = b.style === 'apartment' ? rng.int(1, 2) : rng.int(2, 5); const f = FRONT[b.front] || [0, -1];
    for (let k = 0, tries = 0; k < n && tries < n * 6; tries++) { const side = rng.int(0, 3), t = rng.range(0.05, 0.95), dd = rng.range(2.4, 7.5); const [x, z] = around(b, side, t, dd);
      const isFront = (side === 0 && f[1] < 0) || (side === 2 && f[1] > 0) || (side === 1 && f[0] > 0) || (side === 3 && f[0] < 0); if (isFront && Math.abs(t - 0.5) < 0.22) continue; // the path to the door
      if (!inLot(x, z, 1.2) || !okTrunk(x, z) || L.zoneAt(x, z, 1)) continue; if (I.bldGap(x, z) < 2.2 || I.wallGap(x, z) < 1.0 || !I.clear(x, z, 1.8, 1) || !I.treeGap(x, z, 4.2)) continue;
      const type = pickW(rng, GARDEN_TREES); if (plant(type, x, z, type === 'banana' || type === 'areca' ? rng.range(0.85, 1.15) : rng.range(0.7, 1.05))) k++; } }
  plan.greenTreeStats = { street, garden: plan.trees.length - n0 - street };
}

export function greenPlants(ctx) {
  const { plan } = ctx; const rng = new RNG(7272); plan.plants = []; const I = index(plan); const PS = plantShapes();
  const okGround = (x, z, m = 0.3) => inLot(x, z, m) && !L.fuelSiteAt(x, z, 2) && !onParkFeature(x, z, 1) && !L.zoneAt(x, z, 1) && L.distToRail(x, z) > 7;
  const add = (type, x, z, s, yaw) => { const r = PS[type].r * s; if (!I.clear(x, z, Math.max(0.35, r * 0.7))) return false; if (I.bldGap(x, z) < r * 0.85 + 0.12 || I.wallGap(x, z) < r * 0.85 + 0.1) return false;
    plan.plants.push({ type, x, z, s, yaw: yaw ?? rng.next() * Math.PI * 2 }); I.put(x, z, r * 0.6, 2); return true; };
  const c = { shrub: 0, wall: 0, fern: 0, weed: 0 };
  // 1. foundation planting round garden houses (the front path to the door stays open)
  for (const b of plan.buildings) { if (!garden(b)) continue; const f = FRONT[b.front] || [0, -1];
    for (let side = 0; side < 4; side++) { const len = side % 2 ? b.z1 - b.z0 : b.x1 - b.x0; const isFront = (side === 0 && f[1] < 0) || (side === 2 && f[1] > 0) || (side === 1 && f[0] > 0) || (side === 3 && f[0] < 0);
      for (let u = 0.8; u < len - 0.8; u += rng.range(1.8, 2.8)) { const t = u / len; if (isFront && Math.abs(t - 0.5) < 0.2) continue; if (!rng.chance(isFront ? 0.75 : 0.45)) continue;
        const type = pickW(rng, SHRUBS), s = rng.range(0.75, 1.1); const [x, z] = around(b, side, t, PS[type].r * s * 0.9 + 0.25); if (okGround(x, z) && add(type, x, z, s)) c.shrub++; } } }
  // 2. inside the compound walls: bougainvillea and shrubs against the wall, weeds and ferns at the foot of every wall run
  for (const w of plan.walls) { const alongX = w.x1 - w.x0 > w.z1 - w.z0; const len = alongX ? w.x1 - w.x0 : w.z1 - w.z0; if (len < 2) continue;
    for (let u = 0.6; u < len - 0.6; u += rng.range(1.6, 3.2)) { for (const sg of [-1, 1]) { const r = rng.next(); if (r > 0.5) continue;
        const big = r < 0.25; const type = big ? pickW(rng, WALL_SHRUBS) : rng.chance(0.72) ? 'weed' : 'fern'; const s = big ? rng.range(0.7, 1.05) : rng.range(0.7, 1.2); const off = (PS[type].r * s * (big ? 0.95 : 0.6)) + 0.14;
        const x = alongX ? w.x0 + u : (sg < 0 ? w.x0 - off : w.x1 + off), z = alongX ? (sg < 0 ? w.z0 - off : w.z1 + off) : w.z0 + u;
        if (!okGround(x, z, 0.2)) continue; if (add(type, x, z, s)) c[big ? 'wall' : type]++; } } }
  // 3. ferns and weeds in the shady gaps along the sides / backs of buildings (terraces, shophouses), and round garden tree trunks
  for (const b of plan.buildings) { const dense = !garden(b); if (dense && !rng.chance(0.35)) continue; const f = FRONT[b.front] || [0, -1];
    for (let side = 0; side < 4; side++) { const isFront = (side === 0 && f[1] < 0) || (side === 2 && f[1] > 0) || (side === 1 && f[0] > 0) || (side === 3 && f[0] < 0); if (isFront) continue; const len = side % 2 ? b.z1 - b.z0 : b.x1 - b.x0;
      for (let u = 0.6; u < len - 0.6; u += rng.range(2.2, 4.5)) { if (!rng.chance(dense ? 0.3 : 0.2)) continue; const type = rng.chance(0.55) ? 'weed' : 'fern', s = rng.range(0.7, 1.15); const [x, z] = around(b, side, u / len, PS[type].r * s * 0.6 + 0.15);
        if (okGround(x, z, 0.2) && add(type, x, z, s)) c[type]++; } } }
  for (const t of plan.trees) { if (!inLot(t.x, t.z, 0.5) || t.type === 'banana' || !rng.chance(0.55)) continue; const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) { const a = rng.next() * 6.28, d = rng.range(0.9, 2.2) * Math.max(0.8, t.s || 1); const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d; const type = rng.chance(0.6) ? 'fern' : 'weed';
      if (okGround(x, z, 0.2) && add(type, x, z, rng.range(0.8, 1.2))) c[type]++; } }
  plan.plantStats = c;
}
