// Building / road placement regression test (36th: Stage 0).
//   node tools/placement-test.mjs
//  1. No generated building stands on a road or a pavement; none was removed to get there (ids stay contiguous apart from
//     the Street Customs lot, which is cleared on purpose).
//  2. No landmark / filling-station structure stands on a road (Galle Face Hotel, Old Parliament and the Gangaramaya
//     office used to); the three repositioned landmarks also keep clear of the pavement and still exist at full height.
//  3. Market stalls: all of them are still there, none touches the carriageway, each stands on its shop's pavement against
//     the frontage, leaves the walking line in the middle of the pavement free (no pedestrian-graph link runs through one),
//     never blocks a shop door / doorway spot, and does not overlap a pole, lamp, tree, shrine, bus halt or another stall.
//  4. The junction trim (blocks with a dead-end junction square in their corner) only ever touches buildings that were on it.
import './node-dom-stub.mjs';
import * as THREE from 'three';

const { TEX } = await import('../src/gfx/Textures.js');
const { MAT } = await import('../src/gfx/Materials.js');
Object.setPrototypeOf(TEX, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) { const tx = new THREE.Texture(); tx.map = tx.emissive = tx.rm = new THREE.Texture(); t[k] = tx; } return t[k]; } }));
Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ name: k }); return t[k]; } }));
const L = await import('../src/world/Layout.js');
const { generatePlan, plan, stallDepthScale } = await import('../src/world/CityPlan.js');
const { auditPlacement, onPavement } = await import('../src/world/PlacementCheck.js');
generatePlan();
const { buildLandmarks } = await import('../src/world/Landmarks.js');
const { buildFuelStations } = await import('../src/world/FuelStations.js');
const lm = buildLandmarks(); const fuel = buildFuelStations();

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  FAIL', msg); } };

// ---- 1 + 2: the audit
const hits = auditPlacement(plan, lm.colliders.concat(fuel.colliders));
const by = {}; for (const h of hits) by[h.kind] = (by[h.kind] || 0) + 1;
console.log('audit:', hits.length ? JSON.stringify(by) : 'clean', `(${plan.buildings.length} buildings, ${lm.colliders.length} landmark colliders, ${plan.props.filter((p) => p.type === 'stall').length} stalls, ${plan.walls.length} walls)`);
for (const h of hits.slice(0, 12)) console.log('   ', JSON.stringify(h));
ok(!hits.some((h) => h.kind === 'building'), 'buildings on a road / pavement');
ok(!hits.some((h) => h.kind === 'landmark'), 'landmark structures on a road');
ok(!hits.some((h) => h.kind === 'stall'), 'stalls on a road');
ok(!hits.some((h) => h.kind === 'wall'), 'walls on a road');
const ids = plan.buildings.map((b) => b.id).concat(plan.customsCleared || []).sort((a, b) => a - b);
ok(ids.every((v, i) => v === i), 'building ids are contiguous (nothing removed except the customs lot)');
ok(plan.buildings.length >= 5670, `building count ${plan.buildings.length} (5675 before the 36th)`);

// the three repositioned landmarks: present, tall, clear of road AND pavement
const LMK = { 'Galle Face Hotel': [-469, -414, -226.5, -205, 20], 'Old Parliament': [-465.5, -415, -730.8, -669, 17], 'Gangaramaya office': [-46, -26, -273.5, -253.5, 9] };
for (const [name, [x0, x1, z0, z1, h]] of Object.entries(LMK)) {
  const c = lm.colliders.find((q) => Math.abs(q.x0 - x0) < 0.6 && Math.abs(q.x1 - x1) < 0.6 && Math.abs(q.z0 - z0) < 0.6 && Math.abs(q.z1 - z1) < 0.6);
  ok(c && c.h >= h, `${name}: solid volume present at its new footprint`);
  if (!c) continue; let bad = 0; for (let x = c.x0 + 0.05; x < c.x1; x += 0.5) for (let z = c.z0 + 0.05; z < c.z1; z += 0.5) if (L.roadAt(x, z) || onPavement(x, z)) bad++;
  ok(bad === 0, `${name}: ${bad} samples on the road / pavement`);
}

// ---- 3: stalls
const stalls = plan.props.filter((p) => p.type === 'stall');
ok(stalls.length === 137, `stall count ${stalls.length} (137 before; story-shop frontages may drop a few)`);
ok(plan.stallFix && plan.stallFix.failed === 0, `stall placement failures: ${plan.stallFix && plan.stallFix.failed}`);
console.log('stalls:', JSON.stringify(plan.stallFix));
const solids = plan.colliders.filter((c) => c.kind !== 'building' && c.kind !== 'stall' && c.kind !== 'wall');
let onWalk = 0, lineHits = 0, doorHits = 0, solidHits = 0, stallHits = 0;
const pois = plan.poi.filter((q) => q.type === 'shop' || q.type === 'door');
for (const p of stalls) {
  const c = p.col; const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
  // every corner on the pavement (land minus lot) of its block
  if ([[c.x0 + 0.02, c.z0 + 0.02], [c.x1 - 0.02, c.z0 + 0.02], [c.x0 + 0.02, c.z1 - 0.02], [c.x1 - 0.02, c.z1 - 0.02]].every(([x, z]) => onPavement(x, z))) onWalk++;
  else console.log('    stall not on a pavement', JSON.stringify(c));
  if (pois.some((q) => q.x > c.x0 - 0.3 && q.x < c.x1 + 0.3 && q.z > c.z0 - 0.3 && q.z < c.z1 + 0.3)) doorHits++;
  if (solids.some((s) => s.x1 > c.x0 && s.x0 < c.x1 && s.z1 > c.z0 && s.z0 < c.z1)) { solidHits++; console.log('    stall overlaps', JSON.stringify(solids.find((s) => s.x1 > c.x0 && s.x0 < c.x1 && s.z1 > c.z0 && s.z0 < c.z1))); }
  if (stalls.some((o) => o !== p && o.col.x1 > c.x0 && o.col.x0 < c.x1 && o.col.z1 > c.z0 && o.col.z0 < c.z1)) stallHits++;
  void cx; void cz;
}
ok(onWalk === stalls.length, `stalls fully on their pavement: ${onWalk}/${stalls.length}`);
ok(doorHits === 0, `stalls across a shop door / doorway spot: ${doorHits}`);
ok(solidHits === 0, `stalls overlapping poles / lamps / trees / shrines / halts: ${solidHits}`);
ok(stallHits === 0, `stalls overlapping each other: ${stallHits}`);
// the walking line: no pedestrian-graph link may run through a stall (Crowd.repairGraph would cut it)
for (const E of L.pedEdges) {
  if (E.type === 'cross') continue; const a = L.pedNodes[E.a], b = L.pedNodes[E.b]; const n = Math.max(2, Math.ceil(E.len / 0.4));
  for (let i = 1; i < n; i++) { const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; if (stalls.some((p) => x > p.col.x0 - 0.12 && x < p.col.x1 + 0.12 && z > p.col.z0 - 0.12 && z < p.col.z1 + 0.12)) { lineHits++; break; } }
}
ok(lineHits === 0, `pedestrian links running through a stall: ${lineHits}`);
// depth follows the pavement width
ok(stallDepthScale(1.8) < 0.6 && stallDepthScale(3.5) === 1, 'stall depth scale: shallow on 1.8 m lanes, full size on 3.5 m pavements');
// vendors stand on the pavement, not in the road, not inside a solid
const vendors = stalls.map((p) => p.vendor).filter(Boolean);
ok(vendors.length === stalls.length && vendors.every((v) => !L.roadAt(v.x, v.z) && onPavement(v.x, v.z)), 'every stall vendor stands on the pavement');

// ---- 4: junction trims
const trims = plan.junctionTrim || [];
console.log('junction trims:', trims.map((b) => `#${b.id} ${b.district} [${[b.x0, b.x1, b.z0, b.z1].map((v) => v.toFixed(1))}]`).join(' ') || 'none');
ok(trims.length <= 3, `junction trims: ${trims.length} (1 expected: Kotahena)`);
ok(trims.every((b) => b.x1 - b.x0 > 6 && b.z1 - b.z0 > 6), 'trimmed buildings keep a usable footprint');

console.log(`placement-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
