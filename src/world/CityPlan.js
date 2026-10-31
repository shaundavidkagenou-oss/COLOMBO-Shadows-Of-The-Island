// Turns the Layout into concrete buildings, props and points of interest, per 200 m chunk.
import { nearestS } from './Railway.js';
import { RNG, hash2 } from '../core/rng.js';
import * as L from './Layout.js';
import { onParkFeature, parkColliders, parkLamps, PARK } from './Parks.js';
import { SIGNS, SHOP_ROWS } from '../gfx/Textures.js';
import { crownPoints } from './TreeShapes.js';

export const CHUNK = 200;
export const NCX = Math.ceil((L.BOUNDS.maxX - L.BOUNDS.minX) / CHUNK), NCZ = Math.ceil((L.BOUNDS.maxZ - L.BOUNDS.minZ) / CHUNK);
export function chunkCoord(x, z) { return [Math.floor((x - L.BOUNDS.minX) / CHUNK), Math.floor((z - L.BOUNDS.minZ) / CHUNK)]; }
export function chunkIndex(x, z) { const [cx, cz] = chunkCoord(x, z); if (cx < 0 || cz < 0 || cx >= NCX || cz >= NCZ) return -1; return cz * NCX + cx; }
export function chunkCenter(idx) { const cx = idx % NCX, cz = Math.floor(idx / NCX); return [L.BOUNDS.minX + (cx + 0.5) * CHUNK, L.BOUNDS.minZ + (cz + 0.5) * CHUNK]; }

export const FLOOR_H = 3.3, GROUND_H = 4.2;
const PAINTS = {
  market: ['#f3e3b5', '#cfe3d8', '#f2c6b4', '#bcd4e6', '#f6f0e2', '#e8d07a', '#d7e8b0', '#f0b8c0', '#c4c8f0', '#ffffff', '#e6c79c', '#9ed2c6'],
  dense: ['#efe6d2', '#d9e4dc', '#f0d6c4', '#d0dce8', '#f4f1ea', '#e3d6a8', '#cfdcc0', '#ead0d4', '#ffffff', '#d8cfc4'],
  fort: ['#f2ead8', '#efe2c4', '#e9dcc0', '#f6f2e8', '#e6d6b4'],
  villa: ['#ffffff', '#f7f3ea', '#f3efe6', '#efe8d6', '#f6efe0', '#e9f0ea'],
  residential: ['#f4efe2', '#e6efe8', '#f2e2d2', '#e2e8f0', '#f8f6f0', '#efe2b8', '#dcead0'],
  modern: ['#ffffff', '#f0f0f0', '#e8e6e0', '#dfe6ea'],
};
export const plan = {
  buildings: [], props: [], trees: [], colliders: [], parking: [], busStops: [], poi: [], walls: [], vendors: [],
  byChunk: [], // { buildings:[], props:[], trees:[], poi:[] }
};
for (let i = 0; i < NCX * NCZ; i++) plan.byChunk.push({ buildings: [], props: [], trees: [], poi: [], walls: [] });
function addToChunk(kind, obj, x, z) { const c = chunkIndex(x, z); if (c >= 0) plan.byChunk[c][kind].push(obj); }

// ---------------------------------------------------------------- helpers
function rectFree(x0, x1, z0, z1, margin = 1.5) {
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) {
    if (L.isWater(px, pz) || L.inLake(px, pz, margin + 2)) return false;
    if (L.distToRail(px, pz) < 10) return false;
  }
  for (const zn of L.ZONES) { const [a, b, c, d] = zn.rect; if (x1 > a - margin && x0 < b + margin && z1 > c - margin && z0 < d + margin) return false; }
  if (L.isSea(x0 - 4, z0) || L.isSea(x0 - 4, z1)) return false;
  return true;
}
let bid = 0;
function addBuilding(b) {
  b.id = bid++; b.h = b.floors * FLOOR_H + (b.groundRow != null ? GROUND_H - FLOOR_H : 0);
  if (b.tower) b.totalH = b.h + b.tower.floors * FLOOR_H; else b.totalH = b.h;
  plan.buildings.push(b); addToChunk('buildings', b, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
  plan.colliders.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, h: b.totalH, kind: 'building', b });
  return b;
}
function addProp(type, x, z, rot = 0, extra = {}) { const p = { type, x, z, rot, ...extra }; plan.props.push(p); addToChunk('props', p, x, z); return p; }
function onRailReserve(x, z) { if (L.distToRail(x, z) < 7.5 || (L.distToRail(x, z) < 15 && nearestS(x, z).d < 7.5)) return true; for (const st of L.STATIONS) { if (st.along === 'x' ? Math.abs(x - st.x) < 95 && z > -633 && z < -610 : Math.abs(z - st.z) < 60 && Math.abs(x - st.x) < 10) return true; } return false; } // track corridor + platforms stay clear
const inSchool = (x, z) => x > 247 && x < 341 && z > 328.5 && z < 388; // Johns school compound builds its own grounds
function addTree(type, x, z, s = 1, extra = {}) { if (L.isWater(x, z) || L.roadAt(x, z) || onRailReserve(x, z) || inSchool(x, z)) return; const t = { type, x, z, s, ...extra }; plan.trees.push(t); addToChunk('trees', t, x, z); t.col = { x0: x - 0.35 * s, x1: x + 0.35 * s, z0: z - 0.35 * s, z1: z + 0.35 * s, h: 6, kind: 'tree' }; plan.colliders.push(t.col); }
function addPOI(type, x, z, rot, extra = {}) { const p = { type, x, z, rot, used: 0, ...extra }; plan.poi.push(p); addToChunk('poi', p, x, z); return p; }
function addWall(x0, x1, z0, z1, h, col = '#ece6d8') { if (inSchool((x0 + x1) / 2, (z0 + z1) / 2)) return; const w = { x0, x1, z0, z1, h, col }; plan.walls.push(w); addToChunk('walls', w, (x0 + x1) / 2, (z0 + z1) / 2); plan.colliders.push({ x0, x1, z0, z1, h, kind: 'wall' }); }

const missionSigns = Object.fromEntries(SIGNS.map((s, i) => [s.mission, i]).filter(([m]) => m));
const signsByKind = {}; SIGNS.forEach((s, i) => { if (!s.mission) (signsByKind[s.kind] ||= []).push(i); });
const kindToRow = { textile: SHOP_ROWS.textile, electronics: SHOP_ROWS.electronics, produce: SHOP_ROWS.produce, cafe: SHOP_ROWS.cafe, shutter: SHOP_ROWS.shutter };

// front: 'N' faces -z, 'S' faces +z, 'W' faces -x, 'E' faces +x
function frontageStrip(rng, cell, side, x0, x1, z0, z1, opts) {
  const horizontal = side === 'N' || side === 'S';
  const len = horizontal ? x1 - x0 : z1 - z0; let t = 0;
  while (t < len - 3.5) {
    let w = rng.range(opts.wMin, opts.wMax); if (len - t - w < opts.wMin) w = len - t;
    const a = horizontal ? x0 + t : x0, b = horizontal ? x0 + t + w : x1;
    const c = horizontal ? z0 : z0 + t, d = horizontal ? z1 : z0 + t + w;
    t += w;
    if (!rectFree(a, b, c, d)) continue;
    opts.make(rng, a, b, c, d, side);
  }
}
function shopFor(rng, district) {
  let kind;
  if (district === 'pettah') kind = rng.weighted([['textile', 4], ['electronics', 3], ['produce', 3], ['shutter', 2], ['cafe', 2]]);
  else kind = rng.weighted([['shutter', 3], ['cafe', 2], ['electronics', 2], ['produce', 2], ['textile', 1]]);
  const signs = signsByKind[kind] || signsByKind.shutter;
  const variant = rng.int(0, 1) * SIGNS.length;
  return { groundRow: kindToRow[kind], groundCol: rng.int(0, 3), sign: rng.pick(signs) + variant, shopKind: kind };
}
function frontPoint(b, off = 1.4) { // a point on the sidewalk in front of the building's front
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  switch (b.front) { case 'N': return [cx, b.z0 - off, Math.PI]; case 'S': return [cx, b.z1 + off, 0]; case 'W': return [b.x0 - off, cz, -Math.PI / 2]; default: return [b.x1 + off, cz, Math.PI / 2]; }
}
// rotation convention for POIs: yaw angle where 0 faces +z. Person at front point looking at the shop faces opposite of building front normal.
function facingIntoShop(front) { return { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 }[front]; }

// ---------------------------------------------------------------- district generators
function genDense(rng, cell, d, kind) {
  const [lx0, lx1, lz0, lz1] = cell.lot; const W = lx1 - lx0, D = lz1 - lz0; if (W < 6 || D < 6) return;
  const market = kind === 'market';
  const sides = { N: !!cell.T, S: !!cell.B, W: !!cell.L, E: !!cell.R };
  const depthN = Math.min(rng.range(10, 16), D / (sides.S ? 2 : 1)), depthS = Math.min(rng.range(10, 16), D / (sides.N ? 2 : 1));
  const depthW = Math.min(rng.range(10, 15), W / (sides.E ? 2 : 1)), depthE = Math.min(rng.range(10, 15), W / (sides.W ? 2 : 1));
  const floorsBase = market ? [2, 4] : cell.district === 'wellawatte' ? [2, 7] : [2, 5];
  const make = (r, a, b, c, dd, side) => {
    const shop = (market || r.chance(0.7)) ? shopFor(r, cell.district) : null;
    const floors = r.int(floorsBase[0], floorsBase[1]) + (r.chance(0.08) ? r.int(2, 5) : 0);
    const style = r.chance(0.75) ? (r.chance(0.5) ? 'shop' : 'shop2') : 'apartment';
    const bld = addBuilding({ x0: a, x1: b, z0: c, z1: dd, floors, style, color: r.pick(PAINTS[market ? 'market' : 'dense']), front: side, district: cell.district,
      groundRow: shop ? shop.groundRow : SHOP_ROWS.shutter, groundCol: shop ? shop.groundCol : r.int(0, 3), sign: shop ? shop.sign : null, shopKind: shop ? shop.shopKind : 'home',
      awning: market ? r.chance(0.75) : r.chance(0.35), balconies: r.chance(0.5), tanks: r.chance(0.7), roof: r.chance(market ? 0.35 : 0.2) ? 'corrugated' : 'flat', uOff: r.int(0, 3) / 4 });
    if (shop) { const [px, pz] = frontPoint(bld, 1.0); addPOI('shop', px, pz, facingIntoShop(side), { b: bld.id, kind: shop.shopKind }); }
    if (r.chance(0.35)) { const [px, pz] = frontPoint(bld, 0.6); addPOI('door', px, pz, facingIntoShop(side), { b: bld.id }); }
    if (market && r.chance(0.18)) { const [px, pz, rot] = frontPoint(bld, 2.2); const stp = addProp('stall', px, pz, rot, { seed: r.int(0, 999) }); { const c = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot)); const hx = 1.1 * c + 0.62 * sn, hz = 1.1 * sn + 0.62 * c; stp.col = { x0: px - hx, x1: px + hx, z0: pz - hz, z1: pz + hz, h: 2.3, kind: 'stall' }; plan.colliders.push(stp.col); } /* solid table + canopy poles */ addPOI('vendor', px + Math.sin(rot) * 0.9, pz + Math.cos(rot) * 0.9, rot + Math.PI, {}); }
  };
  const opts = { wMin: market ? 4.2 : 5, wMax: market ? 8 : 11, make };
  if (sides.N) frontageStrip(rng, cell, 'N', lx0, lx1, lz0, lz0 + depthN, opts);
  if (sides.S) frontageStrip(rng, cell, 'S', lx0, lx1, lz1 - depthS, lz1, opts);
  const zA = lz0 + (sides.N ? depthN : 0), zB = lz1 - (sides.S ? depthS : 0);
  if (zB - zA > 5) {
    if (sides.W) frontageStrip(rng, cell, 'W', lx0, lx0 + depthW, zA, zB, opts);
    if (sides.E) frontageStrip(rng, cell, 'E', lx1 - depthE, lx1, zA, zB, opts);
  }
  // back-lot building or courtyard trees
  const ix0 = lx0 + (sides.W ? depthW : 0) + 2, ix1 = lx1 - (sides.E ? depthE : 0) - 2;
  if (ix1 - ix0 > 8 && zB - zA > 8) {
    if (rng.chance(0.55) && rectFree(ix0, ix1, zA + 2, zB - 2)) addBuilding({ x0: ix0, x1: ix1, z0: zA + 2, z1: zB - 2, floors: rng.int(2, 4), style: 'apartment', color: rng.pick(PAINTS.dense), front: 'N', district: cell.district, groundRow: null, tanks: true, roof: 'flat', uOff: 0 });
    else addTree(rng.chance(0.5) ? 'palm' : 'mango', (ix0 + ix1) / 2, (zA + zB) / 2, rng.range(0.8, 1.1));
  }
}
function genFort(rng, cell) {
  const [lx0, lx1, lz0, lz1] = cell.lot; const W = lx1 - lx0, D = lz1 - lz0; if (W < 8 || D < 8) return;
  const n = W > 50 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const a = lx0 + (W / n) * k + (k ? 1 : 0), b = lx0 + (W / n) * (k + 1) - (k < n - 1 ? 1 : 0);
    if (!rectFree(a, b, lz0, lz1)) continue;
    const r = rng.next(); const front = cell.T ? 'N' : cell.B ? 'S' : cell.L ? 'W' : 'E';
    if (r < 0.55) {
      const brick = rng.chance(0.25);
      const bld = addBuilding({ x0: a, x1: b, z0: lz0, z1: lz1, floors: rng.int(3, 5), style: brick ? 'brick' : 'colonial', color: brick ? '#ffffff' : rng.pick(PAINTS.fort), front, district: 'fort', groundRow: SHOP_ROWS.arcade, groundCol: rng.int(0, 3), colonnade: true, cornice: true, roof: 'flat', uOff: 0, sign: rng.chance(0.4) ? rng.pick(signsByKind.electronics) : null });
      const [px, pz] = frontPoint(bld, 1.2); addPOI('door', px, pz, facingIntoShop(front), { b: bld.id });
    } else if (r < 0.8) {
      addBuilding({ x0: a, x1: b, z0: lz0, z1: lz1, floors: rng.int(6, 12), style: 'office', color: rng.pick(PAINTS.modern), front, district: 'fort', groundRow: SHOP_ROWS.lobby, groundCol: rng.int(0, 3), roof: 'flat', tanks: rng.chance(0.4), uOff: rng.int(0, 3) / 4 });
    } else {
      const inset = Math.min(W / n, D) * 0.18;
      addBuilding({ x0: a, x1: b, z0: lz0, z1: lz1, floors: rng.int(3, 5), style: 'office', color: '#f0eee8', front, district: 'fort', groundRow: SHOP_ROWS.lobby, groundCol: 0, roof: 'flat', uOff: 0,
        tower: { inset, floors: rng.int(14, 30), style: rng.chance(0.5) ? 'glass' : 'glass2', color: '#ffffff' } });
    }
  }
}
function genTowers(rng, cell) {
  const [lx0, lx1, lz0, lz1] = cell.lot; const W = lx1 - lx0, D = lz1 - lz0; if (W < 12 || D < 12) return;
  if (!rectFree(lx0, lx1, lz0, lz1)) return genDense(rng, cell, null, 'commercial');
  const front = cell.L ? 'W' : cell.T ? 'N' : 'E';
  const hotel = rng.chance(0.5);
  addBuilding({ x0: lx0, x1: lx1, z0: lz0, z1: lz1, floors: rng.int(3, 6), style: hotel ? 'hotel' : 'office', color: '#f4f2ec', front, district: cell.district, groundRow: SHOP_ROWS.lobby, groundCol: rng.int(0, 3), roof: 'flat', uOff: 0,
    tower: { inset: Math.min(W, D) * rng.range(0.15, 0.25), floors: rng.int(18, 48), style: hotel ? 'hotel' : rng.pick(['glass', 'glass2']), color: '#ffffff', crown: rng.chance(0.6) } });
}
function genCommercial(rng, cell) {
  const [lx0, lx1, lz0, lz1] = cell.lot; const W = lx1 - lx0, D = lz1 - lz0; if (W < 8 || D < 8) return;
  const onArterial = [cell.L, cell.R, cell.T, cell.B].some((s) => s && s.level === 0);
  if (onArterial && rng.chance(0.22) && W > 30 && D > 30 && rectFree(lx0, lx1, lz0, lz1)) return genTowers(rng, cell);
  const make = (r, a, b, c, dd, side) => {
    const big = onArterial && r.chance(0.6);
    const shop = r.chance(0.7) ? shopFor(r, cell.district) : null;
    const bld = addBuilding({ x0: a, x1: b, z0: c, z1: dd, floors: big ? r.int(4, 9) : r.int(2, 4), style: r.pick(big ? ['office', 'apartment', 'hotel', 'shop'] : ['shop', 'shop2', 'apartment']), color: r.pick(PAINTS.dense), front: side, district: cell.district,
      groundRow: shop ? shop.groundRow : SHOP_ROWS.lobby, groundCol: shop ? shop.groundCol : r.int(0, 3), sign: shop ? shop.sign : null, shopKind: shop ? shop.shopKind : 'office', awning: r.chance(0.3), balconies: r.chance(0.4), tanks: r.chance(0.6), roof: 'flat', uOff: r.int(0, 3) / 4 });
    if (shop) { const [px, pz] = frontPoint(bld, 1.0); addPOI('shop', px, pz, facingIntoShop(side), { b: bld.id, kind: shop.shopKind }); }
  };
  const opts = { wMin: 8, wMax: 18, make };
  const dN = Math.min(rng.range(14, 22), D / 2), dS = Math.min(rng.range(14, 22), D / 2);
  if (cell.T) frontageStrip(rng, cell, 'N', lx0, lx1, lz0, lz0 + dN, opts);
  if (cell.B) frontageStrip(rng, cell, 'S', lx0, lx1, lz1 - dS, lz1, opts);
  const zA = lz0 + (cell.T ? dN : 0), zB = lz1 - (cell.B ? dS : 0);
  if (zB - zA > 8) { if (cell.L) frontageStrip(rng, cell, 'W', lx0, lx0 + Math.min(18, W / 2), zA, zB, opts); if (cell.R) frontageStrip(rng, cell, 'E', lx1 - Math.min(18, W / 2), lx1, zA, zB, opts); }
}
function genVilla(rng, cell, residential = false) {
  const [lx0, lx1, lz0, lz1] = cell.lot; const W = lx1 - lx0, D = lz1 - lz0; if (W < 10 || D < 10) return;
  const plotW = residential ? [14, 22] : [24, 38];
  const sideList = [];
  if (cell.T) sideList.push('N'); if (cell.B) sideList.push('S');
  const depth = Math.min(residential ? 22 : 34, D / (cell.T && cell.B ? 2 : 1));
  const wallCol = rng.pick(['#ece6d8', '#f2efe6', '#e2d8c4', '#d8d0c0']);
  for (const side of sideList) {
    let t = 0, lastB = null; // lastB: x of the previous plot's east side wall (shared boundary → one wall, not two)
    while (t < W - 8) {
      let w = rng.range(plotW[0], plotW[1]); if (W - t - w < plotW[0]) w = W - t;
      const a = lx0 + t, b = lx0 + t + w; t += w;
      const c = side === 'N' ? lz0 : lz1 - depth, d = side === 'N' ? lz0 + depth : lz1;
      if (!rectFree(a, b, c, d, 0)) continue;
      const setF = residential ? rng.range(3, 5) : rng.range(6, 10), setS = residential ? 1.5 : rng.range(3, 6), setB = residential ? 2 : 4;
      const bx0 = a + setS, bx1 = b - setS; const bz0 = side === 'N' ? c + setF : c + setB, bz1 = side === 'N' ? d - setB : d - setF;
      if (bx1 - bx0 < 6 || bz1 - bz0 < 6) continue;
      const apt = residential && rng.chance(0.18);
      addBuilding({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, floors: apt ? rng.int(4, 7) : rng.int(1, residential ? 3 : 2), style: apt ? 'apartment' : 'villa', color: rng.pick(PAINTS[residential ? 'residential' : 'villa']), front: side, district: cell.district,
        groundRow: null, roof: apt ? 'flat' : rng.chance(residential ? 0.6 : 0.85) ? 'tile' : 'flat', tanks: residential, balconies: apt, porch: !apt && rng.chance(0.6), uOff: rng.int(0, 3) / 4 });
      // compound wall along road with a gate gap
      const wz = side === 'N' ? c + 0.15 : d - 0.15; const gate = a + w * rng.range(0.3, 0.7);
      // closed compound: front wall (gate gap), side walls on the plot lines and a back wall — every run meets the next one
      const wh = residential ? 1.6 : 2.0, wb = side === 'N' ? d - 0.15 : c + 0.15, zlo = Math.min(wz, wb) - 0.12, zhi = Math.max(wz, wb) + 0.12;
      addWall(a, gate - 2, wz - 0.12, wz + 0.12, wh, wallCol);
      addWall(gate + 2, b, wz - 0.12, wz + 0.12, wh, wallCol);
      addWall(a, b, wb - 0.12, wb + 0.12, wh, wallCol);
      if (lastB === null || Math.abs(lastB - a) > 0.01) addWall(a - 0.12, a + 0.12, zlo, zhi, wh, wallCol);
      addWall(b - 0.12, b + 0.12, zlo, zhi, wh, wallCol); lastB = b;
      if (!inSchool(gate, wz)) { addProp('gate', gate, wz, side === 'N' ? 0 : Math.PI, { w: 4 });
      plan.colliders.push({ x0: gate - 2.28, x1: gate + 2.28, z0: wz - 0.18, z1: wz + 0.18, h: 2.2, kind: 'wall' }); // closed iron gate + its two pillars are solid
      addPOI('door', gate, side === 'N' ? wz - 1.2 : wz + 1.2, side === 'N' ? 0 : Math.PI, {}); }
      // garden trees
      const ntrees = residential ? rng.int(0, 2) : rng.int(1, 4);
      for (let k = 0; k < ntrees; k++) {
        const tx = rng.chance(0.5) ? rng.range(a + 1.5, bx0 - 0.5) : rng.range(bx1 + 0.5, b - 1.5); const tz = rng.range(c + 2, d - 2);
        if (Math.abs(tx - a) > 1 && Math.abs(tx - b) > 1) addTree(rng.pick(['rain', 'mango', 'palm', 'frangipani', 'jak']), tx, tz, rng.range(0.7, 1.15));
      }
      if (!residential && rng.chance(0.6)) addTree('palm', rng.range(a + 2, b - 2), side === 'N' ? c + 3 : d - 3, rng.range(0.9, 1.2));
    }
  }
  // interior / side plots: occasional institutional block
  const zA = lz0 + (cell.T ? depth : 0) + 2, zB = lz1 - (cell.B ? depth : 0) - 2;
  if (zB - zA > 16 && W > 20 && rectFree(lx0 + 4, lx1 - 4, zA, zB)) {
    if (rng.chance(0.5)) addBuilding({ x0: lx0 + 4, x1: lx1 - 4, z0: zA, z1: zB, floors: rng.int(2, 4), style: rng.pick(['villa', 'colonial', 'apartment']), color: rng.pick(PAINTS.villa), front: cell.L ? 'W' : 'E', district: cell.district, groundRow: null, roof: rng.chance(0.5) ? 'tile' : 'flat', uOff: 0 });
    else for (let k = 0; k < 3; k++) addTree('rain', rng.range(lx0 + 6, lx1 - 6), rng.range(zA + 3, zB - 3), rng.range(0.9, 1.3));
  }
}
function genPort(rng, cell) {
  const [lx0, lx1, lz0, lz1] = cell.lot; const W = lx1 - lx0, D = lz1 - lz0; if (W < 12 || D < 12) return;
  const inYard = L.zoneAt(cell.cx, cell.cz)?.id === 'containers';
  if (inYard && cell.cx < -150 && !L.isWater(lx0, lz0) && !L.isWater(lx1, lz1)) {
    const wb = addBuilding({ x0: lx0 + 2, x1: lx1 - 2, z0: lz0 + 2, z1: lz1 - 2, floors: rng.int(2, 3), style: 'warehouse', color: rng.pick(['#ffffff', '#dfe8ee', '#e8e0d0', '#c8d8e0']), front: 'S', district: cell.district, groundRow: null, roof: 'corrugated', uOff: 0 });
    return;
  }
  if (inYard) {
    // container stacks — gaps between rows act as alleys
    for (let x = lx0 + 3; x < lx1 - 14; x += 16) for (let z = lz0 + 3; z < lz1 - 4; z += 6) {
      if (rng.chance(0.25)) continue; const tiers = rng.int(1, 4);
      addProp('containers', x + 6.1, z + 1.25, 0, { tiers, seed: rng.int(0, 9999) });
      plan.colliders.push({ x0: x, x1: x + 12.2, z0: z, z1: z + 2.5, h: tiers * 2.6, kind: 'container' });
    }
    return;
  }
  if (!rectFree(lx0 + 2, lx1 - 2, lz0 + 2, lz1 - 2)) return;
  addBuilding({ x0: lx0 + 2, x1: lx1 - 2, z0: lz0 + 2, z1: lz1 - 2, floors: rng.int(2, 3), style: 'warehouse', color: rng.pick(['#ffffff', '#dfe8ee', '#e8e0d0', '#c8d8e0']), front: 'N', district: cell.district, groundRow: null, roof: 'corrugated', uOff: 0 });
}
function genLakeside(rng, cell) {
  const [lx0, lx1, lz0, lz1] = cell.lot; const W = lx1 - lx0, D = lz1 - lz0; if (W < 10 || D < 10) return;
  if (rng.chance(0.45) && rectFree(lx0 + 3, lx1 - 3, lz0 + 3, lz1 - 3)) {
    addBuilding({ x0: lx0 + 3, x1: lx1 - 3, z0: lz0 + 3, z1: lz1 - 3, floors: rng.int(3, 6), style: rng.pick(['hotel', 'apartment', 'office']), color: rng.pick(PAINTS.modern), front: cell.T ? 'N' : 'S', district: cell.district, groundRow: SHOP_ROWS.lobby, groundCol: rng.int(0, 3), roof: 'flat', uOff: 0,
      tower: rng.chance(0.4) ? { inset: Math.min(W, D) * 0.2, floors: rng.int(10, 26), style: rng.pick(['glass', 'glass2', 'hotel']), color: '#fff' } : null });
  } else {
    for (let k = 0; k < 4; k++) { const tx = rng.range(lx0 + 2, lx1 - 2), tz = rng.range(lz0 + 2, lz1 - 2); if (!L.inLake(tx, tz, 4)) addTree(rng.pick(['rain', 'palm', 'bo']), tx, tz, rng.range(0.8, 1.2)); }
  }
}

// ---------------------------------------------------------------- street furniture along roads
function genStreetProps(seg, rng) {
  const horizontal = seg.dir === 'h'; const len = horizontal ? seg.x1 - seg.x0 : seg.z1 - seg.z0;
  const d = L.districtIdAt((seg.x0 + seg.x1) / 2, (seg.z0 + seg.z1) / 2);
  const heritage = d === 'fort' || d === 'gftowers' || d === 'gfgreen';
  const lampSpacing = seg.level === 0 ? 30 : seg.level === 1 ? 36 : 44;
  const edge = seg.hw + 0.55;
  const P = (t, side, off = edge) => horizontal ? [seg.x0 + t, seg.z0 + side * off] : [seg.x0 + side * off, seg.z0 + t];
  const rotFor = (side) => horizontal ? (side < 0 ? 0 : Math.PI) : (side < 0 ? Math.PI / 2 : -Math.PI / 2); // arm points toward road
  const ok = (x, z) => !L.isWater(x, z) && !L.roadAt(x, z) && L.distToRail(x, z) > 6 && !L.zoneAt(x, z, -2);
  // lamps (both sides on arterials, staggered)
  for (let t = 16; t < len - 12; t += lampSpacing) {
    for (const side of seg.level === 0 ? [-1, 1] : [((Math.floor(t / lampSpacing) % 2) ? 1 : -1)]) {
      const [x, z] = P(t + (side > 0 ? lampSpacing / 2 : 0), side); if (t + lampSpacing / 2 > len - 10 && side > 0) continue;
      if (ok(x, z)) { addProp(heritage ? 'lampHeritage' : 'lamp', x, z, rotFor(side), { arm: Math.min(seg.hw * 0.6, 4) }); plan.colliders.push({ x0: x - 0.15, x1: x + 0.15, z0: z - 0.15, z1: z + 0.15, h: 7, kind: 'pole' }); }
    }
  }
  // utility poles + cables in dense / residential districts
  if (seg.level >= 1 && ['pettah', 'maradana', 'kotahena', 'slave', 'wellawatte', 'borella', 'havelock', 'kollupitiya', 'bambalapitiya'].includes(d)) {
    const side = hash2(seg.id, 3) < 0.5 ? -1 : 1; let prev = null;
    for (let t = 8; t < len - 6; t += rng.range(24, 32)) {
      const [x, z] = P(t, side, seg.hw + seg.walk - 0.4);
      if (!ok(x, z)) { prev = null; continue; }
      const pole = addProp('pole', x, z, rotFor(side), { transformer: rng.chance(0.12), prev: prev ? [prev.x, prev.z] : null });
      plan.colliders.push({ x0: x - 0.15, x1: x + 0.15, z0: z - 0.15, z1: z + 0.15, h: 8, kind: 'pole' });
      prev = pole;
    }
  }
  // roadside trees
  const treeD = { cinnamon: ['rain', 22], beira: ['rain', 26], gftowers: ['palm', 18], kollupitiya: ['mara', 40], bambalapitiya: ['mara', 44], havelock: ['mara', 36], borella: ['mara', 40], fort: ['mara', 50], lake: ['rain', 26] }[d];
  if (treeD && seg.level <= 2) {
    for (let t = 10; t < len - 8; t += treeD[1] * rng.range(0.8, 1.2)) for (const side of [-1, 1]) {
      const [x, z] = P(t + side * 5, side, seg.hw + seg.walk * 0.55); if (ok(x, z) && rng.chance(0.8)) addTree(treeD[0], x, z, rng.range(0.85, 1.2));
    }
  }
  // bus halts on arterials
  if (seg.level <= 1 && len > 60 && rng.chance(seg.level === 0 ? 0.55 : 0.3)) {
    const side = rng.chance(0.5) ? -1 : 1; const t = len * rng.range(0.35, 0.65);
    const [x, z] = P(t, side, seg.hw + seg.walk * 0.6);
    if (ok(x, z)) {
      const rot = rotFor(side); // shelter opening faces the road
      const stop = { x, z, rot, seg: seg.id, side, t, name: seg.name };
      plan.busStops.push(stop); addProp('busStop', x, z, rot, {});
      plan.colliders.push({ x0: x - (horizontal ? 2.2 : 0.4), x1: x + (horizontal ? 2.2 : 0.4), z0: z - (horizontal ? 0.4 : 2.2), z1: z + (horizontal ? 0.4 : 2.2), h: 2.6, kind: 'shelter', walkUnder: true });
      for (let k = -1; k <= 1; k++) addPOI('busStop', x + (horizontal ? k * 1.1 : 0) + Math.sin(rot) * 0.6, z + (horizontal ? 0 : k * 1.1) + Math.cos(rot) * 0.6, rot, { stop });
    }
  }
  // jaywalk barriers on busy Pettah/Fort arterials
  if (seg.level === 0 && (d === 'pettah' || d === 'fort' || d === 'maradana')) {
    for (const side of [-1, 1]) for (let t = 14; t < len - 14; t += 3) { const [x, z] = P(t, side, seg.hw + 0.25); if (ok(x, z) && (Math.floor(t / 3) % 9) !== 0) addProp('railing', x, z, horizontal ? 0 : Math.PI / 2, {}); }
  }
  // parking spots on local streets
  if (seg.level >= 1 && seg.level <= 2) {
    // keep clear of the junction box, the zebra crossing (0.8–4.2 m past the junction edge), the stop line and a car length beyond
    const n0 = horizontal ? L.nodeAt(seg.i, seg.j) : L.nodeAt(seg.i, seg.j), n1 = horizontal ? L.nodeAt(seg.i + 1, seg.j) : L.nodeAt(seg.i, seg.j + 1);
    const e0 = (horizontal ? n0?.hwV : n0?.hwH) ?? 8, e1 = (horizontal ? n1?.hwV : n1?.hwH) ?? 8; const clear0 = e0 + 4.2 + 1.5 + 3.4, clear1 = len - (e1 + 4.2 + 1.5 + 3.4);
    for (let t = Math.max(14, clear0); t < Math.min(len - 12, clear1); t += rng.range(9, 16)) {
      if (!rng.chance(0.45)) continue; const side = rng.chance(0.5) ? -1 : 1; // left-hand kerb parking
      const off = seg.hw - 1.3; const [x, z] = horizontal ? [seg.x0 + t, seg.z0 + side * off] : [seg.x0 + side * off, seg.z0 + t];
      if (L.distToRail(x, z) < 14) continue; // never on or beside a level crossing
      const heading = horizontal ? (side > 0 ? 1 : -1) : (side < 0 ? 1 : -1); // drive direction consistent with left-hand traffic
      const yaw = horizontal ? (heading > 0 ? Math.PI / 2 : -Math.PI / 2) : (heading > 0 ? 0 : Math.PI);
      plan.parking.push({ x, z, yaw, seg: seg.id, district: d });
    }
  }
}

// ---------------------------------------------------------------- run
// ---------------------------------------------------------------- crown clearance
// No leaf card or branch of any tree may be inside a building (walls, balconies, roof). Every tree gets a fixed yaw and
// height factor here (Vegetation renders exactly these), and its real crown vertices (TreeShapes.crownPoints) are tested
// against the volumes of the buildings around it. An offending tree is, in order of preference: turned to a yaw where it
// clears; given a pruned (narrower) crown; made smaller; moved up to 6 m to a free spot; and only then removed.
export const CROWN_PAD = 0.35; // facade relief (sills, reveals, AC units, signs) kept leaf-free
export function buildingVolumes(b) { // [x0, x1, z0, z1, top] boxes (heights above the ground)
  const out = [], bp = b.balconies ? 1.3 : CROWN_PAD;
  if (b.roof === 'tile') { out.push([b.x0 - bp, b.x1 + bp, b.z0 - bp, b.z1 + bp, b.h + 0.3]); out.push([b.x0 - 0.8, b.x1 + 0.8, b.z0 - 0.8, b.z1 + 0.8, b.h + Math.min(b.x1 - b.x0, b.z1 - b.z0) * 0.32 + 0.3]); }
  else out.push([b.x0 - bp, b.x1 + bp, b.z0 - bp, b.z1 + bp, b.h + 1.4]); // parapet, tanks, plant
  return out;
}
// solid landmark volumes for the second crown pass (shared by World and tools/tree-test.mjs): tall, non-trivial colliders
export function landmarkTreeBoxes(colliders) { return colliders.filter((c) => c.kind !== 'pole' && c.h - (c.y0 || 0) > 3 && (c.x1 - c.x0) * (c.z1 - c.z0) > 2.5 && c.h > 0).map((c) => [c.x0 - CROWN_PAD, c.x1 + CROWN_PAD, c.z0 - CROWN_PAD, c.z1 + CROWN_PAD, c.h + 0.8]); }
export function crownHits(type, x, z, yaw, s, sy, sq, boxes) {
  const P = crownPoints(type); const c = Math.cos(yaw), sn = Math.sin(yaw), hs = s * sq, vs = s * sy;
  for (let i = 0; i < P.length; i += 3) { const lx = P[i] * hs, ly = P[i + 1] * vs, lz = P[i + 2] * hs; const wx = x + lx * c + lz * sn, wz = z - lx * sn + lz * c; // = THREE rotation about +y
    for (let k = 0; k < boxes.length; k++) { const b = boxes[k]; if (ly < b[4] && wx > b[0] && wx < b[1] && wz > b[2] && wz < b[3]) return true; } }
  return false;
}
const REACH = { rain: 13, mara: 9, bo: 9, palm: 7, mango: 6.6, jak: 6.2, frangipani: 4.5 };
let EXTRA = null; // extra solid volumes (landmark buildings, from World) bucketed on a 50 m grid
// Second pass, run by World once the landmark buildings exist: refit every tree against them too. Returns the trunk
// colliders that moved or were removed so World can re-file them in the collision grid.
export function refitTreeCrowns(boxes) {
  EXTRA = new Map(); for (const b of boxes) for (let i = Math.floor(b[0] / 50); i <= Math.floor(b[1] / 50); i++) for (let j = Math.floor(b[2] / 50); j <= Math.floor(b[3] / 50); j++) { const k = i * 100003 + j; if (!EXTRA.has(k)) EXTRA.set(k, []); EXTRA.get(k).push(b); }
  const before = new Map(plan.trees.map((t) => [t, t.x + ',' + t.z])); const r = fitTreeCrowns(); EXTRA = null;
  const changed = new Set(); for (const [t, k] of before) if (t.col && (r.drop.has(t) || k !== t.x + ',' + t.z)) changed.add(t.col);
  plan.crownFixLandmarks = r.stats; return { changed, keep: plan.trees.filter((t) => t.col && changed.has(t.col)).map((t) => t.col) };
}
function fitTreeCrowns() {
  const near = (x, z, R) => { const out = []; const [cx, cz] = chunkCoord(x, z);
    if (EXTRA) { const seen = new Set(); for (let i = Math.floor((x - R - 2) / 50); i <= Math.floor((x + R + 2) / 50); i++) for (let j = Math.floor((z - R - 2) / 50); j <= Math.floor((z + R + 2) / 50); j++) for (const b of EXTRA.get(i * 100003 + j) || []) { if (seen.has(b)) continue; seen.add(b); if (x > b[0] - R - 1.5 && x < b[1] + R + 1.5 && z > b[2] - R - 1.5 && z < b[3] + R + 1.5) out.push(b); } }
    for (let j = cz - 1; j <= cz + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) { if (i < 0 || j < 0 || i >= NCX || j >= NCZ) continue;
      for (const b of plan.byChunk[j * NCX + i].buildings) if (x > b.x0 - R - 1.5 && x < b.x1 + R + 1.5 && z > b.z0 - R - 1.5 && z < b.z1 + R + 1.5) out.push(...(b._vol ||= buildingVolumes(b))); }
    return out; };
  const trunkClear = (x, z) => !L.isWater(x, z) && !L.roadAt(x, z) && !onRailReserve(x, z) && !inSchool(x, z) && near(x, z, 0).every((v) => Math.hypot(Math.max(v[0] - x, 0, x - v[1]), Math.max(v[2] - z, 0, z - v[3])) >= 1.2);
  const stats = { ok: 0, turned: 0, pruned: 0, shrunk: 0, moved: 0, dropped: 0 }; const drop = new Set();
  const YAWS = 16;
  const tryFit = (t, x, z, sqs, ss, nYaw) => { const R = (REACH[t.type] || 9) * Math.max(...ss) + 0.5; const boxes = near(x, z, R); if (!boxes.length) return { yaw: t.yaw, sq: sqs[0], s: ss[0] };
    for (const s of ss) for (const sq of sqs) for (let k = 0; k < nYaw; k++) { const yaw = t.yaw + k * Math.PI * 2 / nYaw; if (!crownHits(t.type, x, z, yaw, s, t.sy, sq, boxes)) return { yaw, sq, s }; }
    return null; };
  for (const t of plan.trees) {
    if (t.yaw === undefined) { t.yaw = hash2(Math.round(t.x * 10), Math.round(t.z * 10), 71) * Math.PI * 2; t.sy = 0.9 + 0.2 * hash2(Math.round(t.x * 10), Math.round(t.z * 10), 72); t.sq = 1; }
    if (!crownPoints(t.type in REACH ? t.type : 'mara')) continue; if (!(t.type in REACH)) t.type = 'mara';
    const s0 = t.s || 1;
    let f = tryFit(t, t.x, t.z, [t.sq], [s0], 1); if (f) { stats.ok++; continue; }
    f = tryFit(t, t.x, t.z, [1], [s0], YAWS); if (f) { t.yaw = f.yaw; stats.turned++; continue; }
    f = tryFit(t, t.x, t.z, [0.85, 0.72, 0.6], [s0], YAWS); if (f) { t.yaw = f.yaw; t.sq = f.sq; stats.pruned++; continue; }
    f = tryFit(t, t.x, t.z, [1, 0.8, 0.62, 0.5], [s0 * 0.85, Math.max(0.55, s0 * 0.7)], YAWS); if (f) { Object.assign(t, { yaw: f.yaw, sq: f.sq, s: f.s }); stats.shrunk++; continue; }
    { let sw = null; for (const type of ['jak', 'mango', 'frangipani', 'palm']) { if (type === t.type) continue; const tt = { ...t, type }; const g = tryFit(tt, t.x, t.z, type === 'palm' ? [1, 0.85] : [1, 0.8, 0.62], type === 'palm' ? [1, 1.2, 1.35] : [Math.min(1.1, s0), 0.8], YAWS); if (g) { sw = [type, g]; break; } }
      if (sw) { t.type = sw[0]; Object.assign(t, { yaw: sw[1].yaw, sq: sw[1].sq, s: sw[1].s }); stats.swapped = (stats.swapped || 0) + 1; continue; } } // a species that fits the spot (tall narrow jak, low mango, small araliya, or a coconut palm whose crown clears the eaves)
    let mv = null;
    for (let r = 1; r <= 4.01 && !mv; r += 1) for (let k = 0; k < 8 && !mv; k++) { const x = t.x + Math.cos(k * Math.PI / 4) * r, z = t.z + Math.sin(k * Math.PI / 4) * r; if (!trunkClear(x, z)) continue; const g = tryFit(t, x, z, [1, 0.8, 0.62], [s0, Math.max(0.55, s0 * 0.75)], 8); if (g) mv = [x, z, g]; }
    if (!mv) { drop.add(t); stats.dropped++; continue; }
    const [x, z, g] = mv; const c0 = chunkIndex(t.x, t.z), dx = x - t.x, dz = z - t.z; t.x = x; t.z = z; Object.assign(t, { yaw: g.yaw, sq: g.sq, s: g.s }); stats.moved++;
    if (t.col) { t.col.x0 += dx; t.col.x1 += dx; t.col.z0 += dz; t.col.z1 += dz; }
    const c1 = chunkIndex(t.x, t.z); if (c1 !== c0) { if (c0 >= 0) plan.byChunk[c0].trees = plan.byChunk[c0].trees.filter((q) => q !== t); if (c1 >= 0) plan.byChunk[c1].trees.push(t); }
  }
  if (drop.size) { const cols = new Set([...drop].map((t) => t.col).filter(Boolean)); plan.trees = plan.trees.filter((t) => !drop.has(t)); plan.colliders = plan.colliders.filter((c) => !cols.has(c)); for (const ch of plan.byChunk) ch.trees = ch.trees.filter((t) => !drop.has(t)); }
  if (!EXTRA) plan.crownFix = stats; return { stats, drop };
}

export function generatePlan() {
  const t0 = performance.now();
  for (const cell of L.cells) {
    if (cell.water || cell.centerWater) continue;
    const rng = new RNG(1000 + cell.id * 7);
    const style = L.DISTRICTS[cell.district].style;
    switch (style) {
      case 'market': genDense(rng, cell, null, 'market'); break;
      case 'dense': genDense(rng, cell, null, 'dense'); break;
      case 'fort': genFort(rng, cell); break;
      case 'towers': genTowers(rng, cell); break;
      case 'commercial': genCommercial(rng, cell); break;
      case 'villa': genVilla(rng, cell, false); break;
      case 'residential': genVilla(rng, cell, true); break;
      case 'port': genPort(rng, cell); break;
      case 'lake': genLakeside(rng, cell); break;
      default: break;
    }
  }
  const rng = new RNG(4242);
  for (const seg of L.segments) genStreetProps(seg, rng);
  // traffic signals
  for (const n of L.nodes) if (n.signal) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = n.x + sx * (n.hwV + 0.8), z = n.z + sz * (n.hwH + 0.8);
      if (!L.isWater(x, z) && !L.roadAt(x, z)) { addProp('signal', x, z, sx > 0 ? (sz > 0 ? 0 : Math.PI / 2) : (sz > 0 ? -Math.PI / 2 : Math.PI), { node: n.id }); plan.colliders.push({ x0: x - 0.15, x1: x + 0.15, z0: z - 0.15, z1: z + 0.15, h: 4, kind: 'pole' }); }
    }
  }
  // Galle Face Green: promenade palms, benches, food carts
  for (let z = -640; z < -250; z += 14) {
    const cx = L.coastX(z) + 16; addTree('palm', cx + rng.range(-1, 1), z, rng.range(0.9, 1.25));
    if (Math.floor(z / 14) % 2 === 0) { addProp('bench', cx + 3, z + 7, -Math.PI / 2, {}); addPOI('bench', cx + 3, z + 7, -Math.PI / 2, { seats: 2 }); }
  }
  for (let k = 0; k < 9; k++) { const z = -400 + k * 16, x = L.coastX(z) + 24; addProp('foodcart', x, z, -Math.PI / 2, { seed: k }); addPOI('vendor', x + 1.4, z, -Math.PI / 2, { cart: true }); plan.colliders.push({ x0: x - 1.1, x1: x + 1.1, z0: z - 1.6, z1: z + 1.6, h: 2.2, kind: 'cart' }); }
  for (let k = 0; k < 40; k++) addPOI('lawn', rng.range(-490, -425), rng.range(-640, -260), rng.range(0, 6.28), {});
  // parks: Viharamahadevi
  const vm = [PARK.x0, PARK.x1, PARK.z0, PARK.z1]; // the lawn itself (zone rect minus boundary roads + pavements)
  for (let k = 0; k < 70; k++) { const x = rng.range(vm[0] + 6, vm[1] - 6), z = rng.range(vm[2] + 6, vm[3] - 6); if (Math.hypot(x - 90, z + 60) > 22 && !onParkFeature(x, z, 2.2)) addTree(rng.pick(['rain', 'rain', 'bo', 'palm', 'frangipani']), x, z, rng.range(0.9, 1.4)); }
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; const x = 90 + Math.cos(a) * 30, z = -60 + Math.sin(a) * 30; addProp('bench', x, z, -a - Math.PI / 2, {}); addPOI('bench', x, z, -a - Math.PI / 2, { seats: 2 }); /* seat faces the fountain; sitters use the same facing */ }
  for (let k = 0; k < 30; k++) { const x = rng.range(vm[0] + 8, vm[1] - 8), z = rng.range(vm[2] + 8, vm[3] - 8); if (!onParkFeature(x, z, 1)) addPOI('lawn', x, z, rng.range(0, 6.28), {}); }
  // landscaping (Parks.js): hedges + flower-bed rims collide, heritage lamps light the paths at night
  plan.colliders.push(...parkColliders());
  for (const [x, z, r] of parkLamps()) { addProp('lampHeritage', x, z, r, {}); plan.colliders.push({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2, h: 5, kind: 'pole' }); }
  // Police Headquarters compound: palms along the fence and by the sign, shade trees on the rear lawn
  for (const [x, z, t, sc] of [[1, -224.5, 'palm', 1.1], [19, -221, 'palm', 1.0], [26, -224, 'palm', 1.15], [27.5, -215, 'palm', 1.05], [-49.5, -183, 'rain', 1.2], [-38, -180.5, 'palm', 1.0], [-20, -180.5, 'palm', 1.1], [-2, -180.5, 'palm', 0.95], [14, -180.5, 'palm', 1.05], [27.5, -181, 'rain', 1.1], [-49.6, -209, 'palm', 1.0], [5, -216.5, 'frangipani', 1.0], [-26, -216.2, 'frangipani', 0.9]]) addTree(t, x, z, sc);
  // lakeside benches
  for (let k = 0; k < 40; k++) {
    const a = rng.next() * Math.PI * 2; const [cx, cz, rx, rz] = L.LAKE[0]; const x = cx + Math.cos(a) * (rx + 9), z = cz + Math.sin(a) * (rz + 9);
    if (!L.inLake(x, z, 5) && !L.roadAt(x, z) && !L.zoneAt(x, z)) { addProp('bench', x, z, Math.atan2(cx - x, cz - z), {}); addPOI('bench', x, z, Math.atan2(cx - x, cz - z), { seats: 2 }); }
  }
  // chat spots on sidewalks near intersections
  for (const pn of L.pedNodes) if (hash2(pn.id, 77) < 0.12) addPOI('chat', pn.x + (hash2(pn.id, 1) - 0.5) * 2, pn.z + (hash2(pn.id, 2) - 0.5) * 2, 0, {});
  // small Buddha shrines at a few junctions (glass-fronted, as found across Colombo)
  for (const n of L.nodes) if (n.segs.length === 3 && hash2(n.i, n.j, 55) < 0.05) {
    const x = n.x + (n.hwV + 2.2) * (hash2(n.i, 1) < 0.5 ? -1 : 1), z = n.z + (n.hwH + 2.2) * (hash2(n.j, 2) < 0.5 ? -1 : 1);
    if (!L.isWater(x, z) && !L.roadAt(x, z) && !L.zoneAt(x, z, 2)) { addProp('shrine', x, z, Math.atan2(n.x - x, n.z - z), {}); plan.colliders.push({ x0: x - 0.8, x1: x + 0.8, z0: z - 0.8, z1: z + 0.8, h: 2.8, kind: 'shrine' }); }
  }
  // story shops: give the nearest suitable shophouse the mission sign and record a frontage point
  plan.missionShops = {}; const taken = new Set();
  const WANT = { kade: [-78, -893], fathima: [-40, -905], selvaraj: [-175, -905], bandara: [-110, -868], tailor: [L.PLACES.tailor.x, L.PLACES.tailor.z], garage: [L.PLACES.garage.x, L.PLACES.garage.z], gunshop: [L.PLACES.gunshop.x, L.PLACES.gunshop.z] };
  for (const [m, [tx, tz]] of Object.entries(WANT)) {
    let best = null, bd = 1e12;
    for (const b of plan.buildings) { if (taken.has(b) || !b.front || b.groundRow === undefined || b.totalH > 40) continue; const [fx, fz] = frontPoint(b, 1.2); const d = (fx - tx) ** 2 + (fz - tz) ** 2; if (d < bd) { bd = d; best = b; } }
    if (!best) continue; taken.add(best);
    best.sign = missionSigns[m]; best.mission = m; best.awning = m !== 'garage' && m !== 'gunshop'; best.groundRow = { kade: SHOP_ROWS.cafe, fathima: SHOP_ROWS.textile, selvaraj: SHOP_ROWS.electronics, bandara: SHOP_ROWS.produce, tailor: SHOP_ROWS.textile, garage: SHOP_ROWS.gate, gunshop: SHOP_ROWS.electronics }[m];
    const [x, z, rot] = frontPoint(best, 1.3); plan.missionShops[m] = { x, z, rot, faceIn: facingIntoShop(best.front), b: best.id, name: SIGNS[missionSigns[m]].en || m };
  }
  // keep story-shop frontages clear: no pavement stall (or its vendor) blocking the door of a mission shop
  { const near = (o) => Object.values(plan.missionShops).some((m) => Math.hypot(o.x - m.x, o.z - m.z) < 4.5);
    const drop = new Set(plan.props.filter((p) => p.type === 'stall' && near(p)));
    if (drop.size) { const cols = new Set([...drop].map((p) => p.col)); plan.props = plan.props.filter((p) => !drop.has(p)); plan.colliders = plan.colliders.filter((c) => !cols.has(c));
      for (const ch of plan.byChunk) ch.props = ch.props.filter((p) => !drop.has(p));
      const dq = (q) => q.type === 'vendor' && !q.cart && near(q); plan.poi = plan.poi.filter((q) => !dq(q)); for (const ch of plan.byChunk) ch.poi = ch.poi.filter((q) => !dq(q)); } }
  // no tree may grow inside (or through) a building. Garden/back-lot trees planted against a wall are moved out to 1.6 m
  // from it (crown no longer pushes through the facade); if there is no free spot they are dropped. Around the landmark
  // buildings with walk-in interiors (Police HQ, Galle Face Hotel) the whole crown must stay outside the walls.
  { const SOLID = [[-40, 18, -205, -183], [-467.5, -414, -240, -205]]; // PoliceHQ.HQ.building, Landmarks Galle Face Hotel
    const R = (b) => (b._r ||= [b.x0, b.x1, b.z0, b.z1]);
    const gapAt = (x, z, r) => Math.hypot(Math.max(r[0] - x, 0, x - r[1]), Math.max(r[2] - z, 0, z - r[3]));
    const MIN = 1.6; const near = (x, z) => { const out = []; const [cx, cz] = chunkCoord(x, z); // buildings are filed by centre: scan the 3x3 chunk block
      for (let j = cz - 1; j <= cz + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) { if (i < 0 || j < 0 || i >= NCX || j >= NCZ) continue;
        for (const b of plan.byChunk[j * NCX + i].buildings) if (x > b.x0 - 4 && x < b.x1 + 4 && z > b.z0 - 4 && z < b.z1 + 4) out.push(R(b)); }
      return out; };
    const clear = (x, z, t) => near(x, z).every((r) => gapAt(x, z, r) >= MIN - 1e-6) && !SOLID.some((r) => gapAt(x, z, r) < 3.6 * (t.s || 1));
    const free = (x, z, t) => clear(x, z, t) && !L.isWater(x, z) && !L.roadAt(x, z) && !onRailReserve(x, z);
    const drop = new Set(); let moved = 0;
    for (const t of plan.trees) {
      if (clear(t.x, t.z, t)) continue; // (addTree already rejected water / road / rail spots)
      if (SOLID.some((r) => gapAt(t.x, t.z, r) < 3.6 * (t.s || 1))) { drop.add(t); continue; }
      let ok = null; // try pushing straight out of the nearest wall, then the 8 compass directions, in growing steps
      const r0 = near(t.x, t.z).sort((a, b) => gapAt(t.x, t.z, a) - gapAt(t.x, t.z, b))[0];
      const dirs = []; if (r0) { const cx = Math.max(r0[0], Math.min(t.x, r0[1])), cz = Math.max(r0[2], Math.min(t.z, r0[3])); let dx = t.x - cx, dz = t.z - cz; if (Math.hypot(dx, dz) < 1e-3) { const m = Math.min(t.x - r0[0], r0[1] - t.x, t.z - r0[2], r0[3] - t.z); dx = m === t.x - r0[0] ? -1 : m === r0[1] - t.x ? 1 : 0; dz = dx ? 0 : (m === t.z - r0[2] ? -1 : 1); } const l = Math.hypot(dx, dz); dirs.push([dx / l, dz / l]); }
      for (let k = 0; k < 8; k++) dirs.push([Math.cos(k * Math.PI / 4), Math.sin(k * Math.PI / 4)]);
      for (let step = 0.4; step <= 4.01 && !ok; step += 0.4) for (const [dx, dz] of dirs) { const x = t.x + dx * step, z = t.z + dz * step; if (free(x, z, t)) { ok = [x, z]; break; } }
      if (!ok) { drop.add(t); continue; }
      const c0 = chunkIndex(t.x, t.z), dx = ok[0] - t.x, dz = ok[1] - t.z; t.x = ok[0]; t.z = ok[1]; moved++;
      if (t.col) { t.col.x0 += dx; t.col.x1 += dx; t.col.z0 += dz; t.col.z1 += dz; }
      const c1 = chunkIndex(t.x, t.z); if (c1 !== c0) { if (c0 >= 0) plan.byChunk[c0].trees = plan.byChunk[c0].trees.filter((q) => q !== t); if (c1 >= 0) plan.byChunk[c1].trees.push(t); }
    }
    if (drop.size) { const cols = new Set([...drop].map((t) => t.col)); plan.trees = plan.trees.filter((t) => !drop.has(t)); plan.colliders = plan.colliders.filter((c) => !cols.has(c));
      for (const ch of plan.byChunk) ch.trees = ch.trees.filter((t) => !drop.has(t)); }
    plan.treeFix = { moved, dropped: drop.size }; }
  fitTreeCrowns();
  plan.stats = { buildings: plan.buildings.length, props: plan.props.length, trees: plan.trees.length, parking: plan.parking.length, poi: plan.poi.length, ms: Math.round(performance.now() - t0) };
  return plan;
}
export { missionSigns };
