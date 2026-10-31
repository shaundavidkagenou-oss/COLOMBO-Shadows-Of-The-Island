// Park landscaping: Viharamahadevi Park path network (fountain plaza, promenade ring, axial avenues, perimeter walk and
// diagonals) with concrete edging, raised flower beds, clipped hedges with entrance gaps and heritage lamps; worn
// desire-line footpaths across Galle Face Green. The path/hedge description lives here so CityPlan (tree, bench, lamp and
// collider placement), the grass blade field (no blades on paths or beds) and the renderer all agree.
import * as THREE from 'three';
import { LAND_Y, cellAt, setSurfaceHook } from './Layout.js';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { RNG } from '../core/rng.js';
import { FlowerBeds } from './Flowers.js';

// The park's real lawn = the zone rectangle minus the boundary roads and their pavements (Ananda Coomaraswamy Mw. on the
// south, Green Path on the west): every path, hedge, bed, lamp and tree is laid out inside these bounds, never on a road.
const ZONE = { x0: -10, x1: 190, z0: -170, z1: 40 };
const lotEdge = (x, z, k, fb) => { const c = cellAt(x, z); return c ? c.lot[k] : fb; };
const VM = { cx: 90, cz: -60, x0: lotEdge(ZONE.x0 + 0.5, -60, 0, ZONE.x0), x1: lotEdge(ZONE.x1 - 0.5, -60, 1, ZONE.x1), z0: lotEdge(90, ZONE.z0 + 0.5, 2, ZONE.z0), z1: lotEdge(90, ZONE.z1 - 0.5, 3, ZONE.z1) };
const IN = 7; // perimeter walk inset from the park edge
export const PARK = VM;
// straight paths: [ax, az, bx, bz, width, material]
export const PATH_SEGS = [
  // axial avenues from the promenade ring to the four gates
  [VM.cx + 28.7, VM.cz, VM.x1 - 0.05, VM.cz, 4.2, 'walkGrey'], [VM.x0 + 0.05, VM.cz, VM.cx - 28.7, VM.cz, 4.2, 'walkGrey'],
  [VM.cx, VM.z0 + 0.05, VM.cx, VM.cz - 28.7, 4.2, 'walkGrey'], [VM.cx, VM.cz + 28.7, VM.cx, VM.z1 - 0.05, 4.2, 'walkGrey'],
  // spokes from the fountain plaza to the ring
  [VM.cx + 15, VM.cz, VM.cx + 25.3, VM.cz, 3, 'walkGrey'], [VM.cx - 25.3, VM.cz, VM.cx - 15, VM.cz, 3, 'walkGrey'],
  [VM.cx, VM.cz - 25.3, VM.cx, VM.cz - 15, 3, 'walkGrey'], [VM.cx, VM.cz + 15, VM.cx, VM.cz + 25.3, 3, 'walkGrey'],
  // perimeter walk
  [VM.x0 + IN, VM.z0 + IN, VM.x1 - IN, VM.z0 + IN, 2.6, 'walk'], [VM.x1 - IN, VM.z0 + IN, VM.x1 - IN, VM.z1 - IN, 2.6, 'walk'],
  [VM.x1 - IN, VM.z1 - IN, VM.x0 + IN, VM.z1 - IN, 2.6, 'walk'], [VM.x0 + IN, VM.z1 - IN, VM.x0 + IN, VM.z0 + IN, 2.6, 'walk'],
];
// diagonals: ring → perimeter corners
for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
  const cx = sx > 0 ? VM.x1 - IN : VM.x0 + IN, cz = sz > 0 ? VM.z1 - IN : VM.z0 + IN;
  const dx = cx - VM.cx, dz = cz - VM.cz, l = Math.hypot(dx, dz);
  PATH_SEGS.push([VM.cx + dx / l * 28.4, VM.cz + dz / l * 28.4, cx, cz, 2.6, 'walk']);
}
// worn desire lines across Galle Face Green (people cut across between the promenade, Galle Road and the hotel)
export const WORN_SEGS = [
  [-432, -655, -462, -540, 1.7], [-462, -540, -455, -420, 1.7], [-455, -420, -428, -262, 1.7],
  [-498, -585, -414, -560, 1.4], [-500, -470, -455, -420, 1.3], [-499, -330, -415, -352, 1.5],
];
export const PATH_RINGS = [[VM.cx, VM.cz, 27, 3.4]]; // [cx, cz, radius, width]
export const PLAZAS = [[VM.cx, VM.cz, 15]];           // paved discs
export const BEDS = [];                               // [x, z, r]
for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const d of [48, 76]) for (const s of [-1, 1]) {
  BEDS.push([VM.cx + ax * d + (-az) * s * 6.6, VM.cz + az * d + ax * s * 6.6, d === 48 ? 2.4 : 1.9]);
}
// hedges along the park boundary, gaps at the four gates and the corners: [ax, az, bx, bz]
export const HEDGES = [];
{
  const e = 2.6, g = 5.5; // inset from the edge, half gate width
  const run = (ax, az, bx, bz) => HEDGES.push([ax, az, bx, bz]);
  run(VM.x0 + 9, VM.z0 + e, VM.cx - g, VM.z0 + e); run(VM.cx + g, VM.z0 + e, VM.x1 - 9, VM.z0 + e);
  run(VM.x0 + 9, VM.z1 - e, VM.cx - g, VM.z1 - e); run(VM.cx + g, VM.z1 - e, VM.x1 - 9, VM.z1 - e);
  run(VM.x0 + e, VM.z0 + 9, VM.x0 + e, VM.cz - g); run(VM.x0 + e, VM.cz + g, VM.x0 + e, VM.z1 - 9);
  run(VM.x1 - e, VM.z0 + 9, VM.x1 - e, VM.cz - g); run(VM.x1 - e, VM.cz + g, VM.x1 - e, VM.z1 - 9);
}

const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
// true where the ground is a path, plaza, bed or hedge (grass blades, trees and lawn sitters keep off)
export function onParkFeature(x, z, m = 0) {
  if (x > VM.x0 - 1 && x < VM.x1 + 1 && z > VM.z0 - 1 && z < VM.z1 + 1) {
    for (const s of PATH_SEGS) if (segDist(x, z, s[0], s[1], s[2], s[3]) < s[4] / 2 + m) return true;
    for (const [cx, cz, r, w] of PATH_RINGS) if (Math.abs(Math.hypot(x - cx, z - cz) - r) < w / 2 + m) return true;
    for (const [cx, cz, r] of PLAZAS) if (Math.hypot(x - cx, z - cz) < r + m) return true;
    for (const [cx, cz, r] of BEDS) if (Math.hypot(x - cx, z - cz) < r + 0.2 + m) return true;
    for (const h of HEDGES) if (segDist(x, z, h[0], h[1], h[2], h[3]) < 0.55 + m) return true;
  }
  for (const s of WORN_SEGS) if (segDist(x, z, s[0], s[1], s[2], s[3]) < s[4] / 2 + m) return true;
  return false;
}
// colliders + lamp positions for CityPlan
export function parkColliders() {
  const out = [];
  for (const [ax, az, bx, bz] of HEDGES) out.push({ x0: Math.min(ax, bx) - 0.5, x1: Math.max(ax, bx) + 0.5, z0: Math.min(az, bz) - 0.5, z1: Math.max(az, bz) + 0.5, h: 1.05, kind: 'hedge' });
  for (const [x, z, r] of BEDS) out.push(...discColliders(x, z, r + 0.15, 0.6, 'bed')); // the whole raised bed to its outer rim (nobody stands in the concrete or walks through the flowers)
  return out;
}
// a round solid as thin strips that never stick out past the circle (no invisible wall beyond a round rim), covering it fully
export function discColliders(cx, cz, r, h, kind, dz = 0.4) { const out = []; const n = Math.ceil((2 * r) / dz);
  for (let k = 0; k < n; k++) { const z0 = -r + k * (2 * r) / n, z1 = z0 + (2 * r) / n; const far = Math.max(Math.abs(z0), Math.abs(z1)); const hw = Math.sqrt(Math.max(0, r * r - far * far)); const near = Math.min(Math.abs(z0), Math.abs(z1)) * (z0 < 0 && z1 > 0 ? 0 : 1);
    const w = Math.max(hw, Math.min(Math.sqrt(Math.max(0, r * r - near * near)), Math.sqrt(Math.max(0, (r + 0.05) ** 2 - far * far)))); /* as wide as the circle allows: corners ≤ 5 cm outside the rim */ if (w > 0.02) out.push({ x0: cx - w, x1: cx + w, z0: cz + z0, z1: cz + z1, h, kind }); }
  return out; }
// paving heights (match buildParks): perimeter walk / avenues / diagonals, promenade ring, fountain plaza, kerbs, worn laterite paths
const PAVE_Y = LAND_Y + 0.03;
export function parkSurfaceY(x, z) {
  let best = -Infinity;
  if (x > VM.x0 - 1 && x < VM.x1 + 1 && z > VM.z0 - 1 && z < VM.z1 + 1) {
    for (const [cx, cz, r] of PLAZAS) if (Math.hypot(x - cx, z - cz) < r) best = Math.max(best, PAVE_Y + 0.03);
    for (const [cx, cz, r, w] of PATH_RINGS) { const d = Math.abs(Math.hypot(x - cx, z - cz) - r); if (d < w / 2) best = Math.max(best, PAVE_Y + 0.02); else if (d < w / 2 + 0.12) best = Math.max(best, LAND_Y + 0.08); }
    PATH_SEGS.forEach((sg, i) => { const d = segDist(x, z, sg[0], sg[1], sg[2], sg[3]); const ly = i < 8 ? PAVE_Y + 0.01 : i < 12 ? PAVE_Y - 0.01 : PAVE_Y; if (d < sg[4] / 2 + 0.01) best = Math.max(best, ly); else if (sg[4] >= 4 && d < sg[4] / 2 + 0.12) best = Math.max(best, LAND_Y + 0.08); });
  }
  for (const sg of WORN_SEGS) if (segDist(x, z, sg[0], sg[1], sg[2], sg[3]) < sg[4] / 2) best = Math.max(best, LAND_Y + 0.02);
  return best;
}
setSurfaceHook(parkSurfaceY);
export function parkLamps() {
  const out = [];
  for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; out.push([VM.cx + Math.cos(a) * 22, VM.cz + Math.sin(a) * 22, -a]); }
  for (const s of PATH_SEGS.slice(0, 4)) { // avenues: lamps every ~22 m, alternating sides
    const [ax, az, bx, bz, w] = s; const l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l;
    for (let d = 11, k = 0; d < l - 6; d += 22, k++) { const sd = k % 2 ? 1 : -1, o = w / 2 + 0.9; out.push([ax + ux * d - uz * sd * o, az + uz * d + ux * sd * o, Math.atan2(uz * sd, -ux * sd)]); }
  }
  return out;
}

function ringPoly(cx, cz, r, n = 48) { const p = []; for (let k = 0; k < n; k++) { const a = -k / n * Math.PI * 2; p.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return p; }
export function buildParks(MAT) {
  const mb = new MultiBuilder(); const y = LAND_Y + 0.03; const edge = [0.74, 0.73, 0.7]; const rng = new RNG(808);
  const strip = (m, ax, az, bx, bz, w, yy, uv = 2) => { // flat ribbon a→b, with round caps so joints never gap
    const l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l * w / 2, nz = (bx - ax) / l * w / 2;
    mb.get(m).quad([ax + nx, yy, az + nz], [bx + nx, yy, bz + nz], [bx - nx, yy, bz - nz], [ax - nx, yy, az - nz], [0, 0, l / uv, w / uv]);
    for (const [cx, cz] of [[ax, az], [bx, bz]]) mb.get(m).hpoly(ringPoly(cx, cz, w / 2, 14), yy - 0.003, uv); // caps stay between this layer and the one below
  };
  // every path class has its own layer, 1 cm apart, so crossings never share a plane (no z-fighting where walks overlap):
  // perimeter walk < diagonals < avenues/spokes < promenade ring < fountain plaza
  const layerOf = (i) => (i < 8 ? y + 0.01 : i < 12 ? y - 0.01 : y);
  const Y_RING = y + 0.02, Y_PLAZA = y + 0.03;
  // kerbs/edging are cut wherever another walk crosses them (no kerb stubs lying across a path)
  const crossed = (x, z, self) => PATH_SEGS.some((s, i) => i !== self && segDist(x, z, s[0], s[1], s[2], s[3]) < s[4] / 2 + 0.12)
    || (self !== 'ring' && PATH_RINGS.some(([cx, cz, r, w]) => Math.abs(Math.hypot(x - cx, z - cz) - r) < w / 2 + 0.2)) || PLAZAS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + 0.1);
  const kerbRun = (ax, az, bx, bz, self) => { const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 0.5)); let s0 = null;
    for (let k = 0; k <= n; k++) { const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, free = k < n && !crossed(x, z, self);
      if (free && s0 === null) s0 = t; if ((!free || k === n) && s0 !== null) { const t1 = free ? 1 : Math.max(s0, t - 0.5 / l); if ((t1 - s0) * l > 0.3) kerb(ax + (bx - ax) * s0, az + (bz - az) * s0, ax + (bx - ax) * t1, az + (bz - az) * t1); s0 = null; } } };
  const kerb = (ax, az, bx, bz) => { const l = Math.hypot(bx - ax, bz - az); mb.get('kerb').box((ax + bx) / 2, LAND_Y + 0.04, (az + bz) / 2, l, 0.08, 0.12, { col: edge, rotY: Math.atan2(bz - az, bx - ax) * -1 + 0, uvScale: 1 }); };
  PATH_SEGS.forEach(([ax, az, bx, bz, w, m], i) => {
    strip(m, ax, az, bx, bz, w, layerOf(i));
    if (w >= 4) { const l = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / l * (w / 2 + 0.06), nz = (bx - ax) / l * (w / 2 + 0.06); kerbRun(ax + nx, az + nz, bx + nx, bz + nz, i); kerbRun(ax - nx, az - nz, bx - nx, bz - nz, i); }
  });
  for (const [cx, cz, r, w] of PATH_RINGS) { // annulus + edging on both sides
    const n = 72;
    for (let k = 0; k < n; k++) {
      const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, ri = r - w / 2, ro = r + w / 2;
      const P = (a, rr) => [cx + Math.cos(a) * rr, Y_RING, cz + Math.sin(a) * rr];
      mb.get('walkGrey').quad(P(a0, ri), P(a1, ri), P(a1, ro), P(a0, ro), [a0 * r / 2, 0, a1 * r / 2, w / 2]);
      for (const rr of [ri - 0.06, ro + 0.06]) { const p0 = P(a0, rr), p1 = P(a1, rr); kerbRun(p0[0], p0[2], p1[0], p1[2], 'ring'); } // open where avenues, spokes and diagonals join
    }
  }
  for (const [cx, cz, r] of PLAZAS) mb.get('walk').hpoly(ringPoly(cx, cz, r, 64), Y_PLAZA, 2);
  for (const s of WORN_SEGS) strip('laterite', s[0], s[1], s[2], s[3], s[4], LAND_Y + 0.02, 3);
  // raised flower beds: concrete rim and dark soil; the plants are modelled in Flowers.js
  for (const [x, z, r] of BEDS) {
    mb.get('concrete').cylinder(x, LAND_Y, z, r + 0.15, r + 0.15, 0.32, 28, { col: [0.86, 0.85, 0.82], caps: false });
    mb.get('concrete').cylinder(x, LAND_Y, z, r, r, 0.32, 28, { col: [0.8, 0.79, 0.76], caps: false });
    { const p = ringPoly(x, z, r + 0.15, 28), q = ringPoly(x, z, r, 28); for (let k = 0; k < 28; k++) { const a = p[k], b = p[(k + 1) % 28], c = q[(k + 1) % 28], d = q[k]; mb.get('concrete').quad([a[0], LAND_Y + 0.32, a[1]], [b[0], LAND_Y + 0.32, b[1]], [c[0], LAND_Y + 0.32, c[1]], [d[0], LAND_Y + 0.32, d[1]], [0, 0, 1, 0.1], [0.88, 0.87, 0.84]); } }
    mb.get('soil').hpoly(ringPoly(x, z, r, 28), LAND_Y + 0.26, 1.5);
    /* plants: real 3D canna / marigold / salvia / periwinkle from Flowers.js (instanced, LOD) — added below */
  }
  // clipped hedges (Murraya / ixora type): rounded top, leaf-textured
  for (const [ax, az, bx, bz] of HEDGES) {
    const l = Math.hypot(bx - ax, bz - az), r = Math.atan2(bz - az, bx - ax) * -1; const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    mb.get('hedge').box(cx, LAND_Y + 0.45, cz, l, 0.9, 0.95, { rotY: r, uvScale: 1.2, col: [1, 1, 1] });
    mb.get('hedge').box(cx, LAND_Y + 0.95, cz, l - 0.1, 0.16, 0.7, { rotY: r, uvScale: 1.2, col: [1.05, 1.08, 1] });
  }
  const g = new THREE.Group(); g.name = 'parks';
  for (const m of mb.toMeshes(MAT, { cast: false, receive: true })) { if (m.name === 'hedge' || m.name === 'foliage') m.castShadow = true; g.add(m); }
  const flowers = new FlowerBeds(BEDS, LAND_Y + 0.26); g.add(flowers.group); g.userData.flowers = flowers;
  return g;
}
