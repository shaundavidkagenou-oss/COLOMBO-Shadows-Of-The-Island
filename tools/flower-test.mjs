// Flower beds: modelled 3D plants (no crossed picture cards), planted inside the bed rims without overlaps, with LOD.
import './node-dom-stub.mjs';
import fs from 'fs';
const F = await import('../src/world/Flowers.js');
const P = await import('../src/world/Parks.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } if (process.env.VERB) console.log('  ', c ? 'ok ' : 'NO ', m); };
const src = fs.readFileSync(new URL('../src/world/Parks.js', import.meta.url), 'utf8');
ok(!/blossom cluster|two small crossed petals|foliage'\)\.quad/.test(src), 'old crossed-quad flowers removed from Parks.js');
const T = F.flowerTriangles();
for (const [k, t] of Object.entries(T)) { ok(t.hi >= 250, `${k}: ${t.hi} triangles up close (modelled leaves and petals)`); ok(t.lo >= 30 && t.lo <= t.hi / 4, `${k}: ${t.lo} triangles far away (LOD)`); }
const fb = new F.FlowerBeds(P.BEDS, 0.41);
let outside = 0, overlap = 0, total = 0, minD = 9;
const SP = { canna: 0.42 * 0.62, mari: 0.27 * 0.62, salvia: 0.27 * 0.62, peri: 0.2 * 0.62 };
const kind = (k) => k.startsWith('canna') ? 'canna' : k.startsWith('mari') ? 'mari' : k.startsWith('salvia') ? 'salvia' : 'peri';
for (const b of fb.beds) {
  total += b.plants.length; const sp = new Set(b.plants.map((p) => kind(p.key)));
  ok(sp.has('canna') && sp.has('peri') && (sp.has('mari') || sp.has('salvia')), `bed at (${b.x.toFixed(0)}, ${b.z.toFixed(0)}): canna centre, marigold/salvia ring, periwinkle edge (${b.plants.length} plants)`);
  for (const p of b.plants) if (Math.hypot(p.x - b.x, p.z - b.z) > b.r - 0.15) outside++;
  for (let i = 0; i < b.plants.length; i++) for (let j = i + 1; j < b.plants.length; j++) { const a = b.plants[i], c = b.plants[j]; const d = Math.hypot(a.x - c.x, a.z - c.z); if (kind(a.key) === kind(c.key)) { minD = Math.min(minD, d); if (d < SP[kind(a.key)]) overlap++; } }
}
ok(outside === 0, `every plant inside its bed rim (${outside} outside)`); ok(overlap === 0, `no two plants of a ring inside each other (min spacing ${minD.toFixed(2)} m)`); ok(total > 1500, `${total} plants in ${fb.beds.length} beds`);
const b0 = fb.beds[0]; fb.update({ x: b0.x + 3, z: b0.z + 3 }); ok(b0.level === 0 && fb.counts.hi >= b0.plants.length, `near a bed: full detail (${fb.counts.hi} hi / ${fb.counts.lo} lo)`);
fb.update({ x: b0.x + 3 + 31, z: b0.z + 3 }); ok(b0.level === 0, 'hysteresis: no flip just past the near band');
fb.update({ x: b0.x + 80, z: b0.z }); ok(b0.level === 1, 'farther: low detail');
fb.update({ x: b0.x + 600, z: b0.z }); ok(fb.counts.hi + fb.counts.lo === 0 && Object.values(fb.meshes).every((m) => !m.visible), 'beyond 220 m: nothing drawn');
ok(fb.update({ x: b0.x + 600, z: b0.z }) === false, 'no instance rebuild while nothing changes');
console.log(`flowers: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
