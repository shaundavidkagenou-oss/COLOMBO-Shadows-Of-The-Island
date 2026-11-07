// Tree / building clearance: no leaf card or branch of any tree is inside a building, a balcony, a roof or a landmark.
// Uses the real crown geometry (TreeShapes) with each tree's planned yaw / scale / pruning — exactly what Vegetation renders.
import './node-dom-stub.mjs';
import * as THREE from 'three';
const { TEX } = await import('../src/gfx/Textures.js');
const { MAT } = await import('../src/gfx/Materials.js');
Object.setPrototypeOf(TEX, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) { const tx = new THREE.Texture(); tx.map = tx.emissive = tx.rm = new THREE.Texture(); t[k] = tx; } return t[k]; } }));
Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ name: k }); return t[k]; } }));
const CP = await import('../src/world/CityPlan.js');
const { buildLandmarks } = await import('../src/world/Landmarks.js');
const V = await import('../src/world/Vegetation.js');
const TS = await import('../src/world/TreeShapes.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; if (fail <= 25) console.log('  FAIL', m); } };

CP.generatePlan(); const plan = CP.plan; const n0 = plan.trees.length;
const lm = buildLandmarks(); const lmBoxes = CP.landmarkTreeBoxes(lm.colliders.map((c) => ({ kind: 'landmark', ...c })));
const r = CP.refitTreeCrowns(lmBoxes);
// rendering uses the same geometry objects as the clearance check
V.buildTreeGeometries(); const S = TS.treeShapes(); for (const k of Object.keys(S)) ok(V.TREES[k] && V.TREES[k].crown === S[k].crown, `${k}: rendered crown is the checked crown`);
// every tree vs every building volume (brute force: every building within reach, not just the chunk neighbourhood) + landmark volumes
const vols = plan.buildings.map((b) => CP.buildingVolumes(b)).flat().concat(lmBoxes);
let checked = 0;
for (const t of plan.trees) {
  const near = vols.filter((v) => t.x > v[0] - 16 && t.x < v[1] + 16 && t.z > v[2] - 16 && t.z < v[3] + 16);
  const hit = CP.crownHits(t.type, t.x, t.z, t.yaw, t.s, t.sy, t.sq, near); checked++;
  ok(!hit, `${t.type} at (${t.x.toFixed(1)}, ${t.z.toFixed(1)}) s ${t.s.toFixed(2)} sq ${t.sq}: leaves/branches inside a building`);
  ok(Number.isFinite(t.yaw) && t.sq >= 0.5 && t.sq <= 1 && t.s >= 0.5, `${t.type} at (${t.x.toFixed(1)}, ${t.z.toFixed(1)}): sane yaw/scale`);
}
// trunks never in a road, the water or a building
for (const t of plan.trees) ok(!vols.some((v) => t.x > v[0] + 0.2 && t.x < v[1] - 0.2 && t.z > v[2] + 0.2 && t.z < v[3] - 0.2), `trunk inside a building at (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`);
const f = plan.crownFix, g = plan.crownFixLandmarks;
// bark is single-sided: a trunk / limb with an open end or a gap between sections shows as a see-through hole. Every edge of
// the trunk mesh above ground must be shared by exactly two triangles (only the buried root ring, 25 cm down, may be open).
for (const [k, d] of Object.entries(S)) { const g = d.trunk, p = g.attributes.position, ix = (t) => (g.index ? g.index.getX(t) : t); const tris = (g.index ? g.index.count : p.count) / 3;
  const key = (i) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`; const E = new Map();
  for (let t = 0; t < tris; t++) { const v = [key(ix(t * 3)), key(ix(t * 3 + 1)), key(ix(t * 3 + 2))]; for (let e = 0; e < 3; e++) { const a = v[e], b = v[(e + 1) % 3]; if (a === b) continue; const kk = a < b ? a + '|' + b : b + '|' + a; E.set(kk, (E.get(kk) || 0) + 1); } }
  let open = 0; for (const [kk, c] of E) if (c !== 2 && Math.max(...kk.split('|').map((q) => +q.split(',')[1])) > -0.1) open++;
  ok(open === 0, `${k}: bark is watertight above ground (${open} open / non-manifold edges)`); }
console.log(`trees: ${pass} passed, ${fail} failed · ${checked} trees clear (${n0} before the landmark pass) · fixed vs buildings: turned ${f.turned}, pruned ${f.pruned}, smaller ${f.shrunk}, species ${f.swapped || 0}, moved ${f.moved}, removed ${f.dropped} · vs landmarks: moved ${g.moved}, removed ${g.dropped}`);
process.exit(fail ? 1 : 0);
