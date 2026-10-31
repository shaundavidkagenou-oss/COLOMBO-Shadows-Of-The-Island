// Map-edge / dead-end regression test.
//  1. No street segment touches the outer map lines (streets used to run into the edge and stop at an invisible wall).
//  2. Every remaining dead end faces an open, visible boundary: the sea, Beira Lake, the railway or a park/landmark edge
//     (never the next block's buildings).
//  3. The boundary built by World.buildBoundary() (east wall, north quay parapet, Dehiwala Canal far wall) stops a
//     walker BEFORE the old bounds clamp, all the way along each edge — so what stops the player is always visible.
import './node-dom-stub.mjs';
import * as THREE from 'three';

const { TEX } = await import('../src/gfx/Textures.js');
const { MAT } = await import('../src/gfx/Materials.js');
Object.setPrototypeOf(TEX, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) { const tx = new THREE.Texture(); tx.map = tx.emissive = tx.rm = new THREE.Texture(); t[k] = tx; } return t[k]; } }));
Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ name: k }); return t[k]; } }));
const L = await import('../src/world/Layout.js');
const { Collision } = await import('../src/world/Collision.js');
const { World } = await import('../src/world/World.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  FAIL', msg); } };
const B = L.BOUNDS;

// 1. no segment on / into the outer lines
for (const s of L.segments) {
  const touches = Math.min(s.x0, s.x1) <= B.minX + 5 || Math.max(s.x0, s.x1) >= B.maxX - 5 || Math.min(s.z0, s.z1) <= B.minZ + 5 || Math.max(s.z0, s.z1) >= B.maxZ - 5;
  if (touches) ok(false, `segment ${s.name} (${s.x0},${s.z0})→(${s.x1},${s.z1}) runs into the map edge`);
}
ok(L.segments.every((s, i) => s.id === i), 'segment ids equal their index');

// 2. no dead end runs into a building or compound wall (checked against the generated city plan, 30 m ahead, across the road width)
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan(); const plan = CP.plan;
const inside = (x, z, b, pad = 0) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;
let dead = 0;
for (const n of L.nodes) {
  if (n.segs.length !== 1) continue; dead++;
  const s = n.segs[0]; const dx = Math.sign(n.x - (s.x0 + s.x1) / 2), dz = Math.sign(n.z - (s.z0 + s.z1) / 2);
  let blocked = null;
  for (let d = 0; d <= 30 && !blocked; d += 1) for (const o of [-s.hw * 0.8, 0, s.hw * 0.8]) { const x = n.x + dx * d + (dz ? o : 0), z = n.z + dz * d + (dx ? o : 0);
    blocked = plan.buildings.find((b) => inside(x, z, b)) || plan.walls.find((w) => inside(x, z, w, 0.3)); if (blocked) break; }
  ok(!blocked, `dead end of ${s.name} at (${n.x}, ${n.z}) runs into a ${blocked && blocked.floors ? 'building' : 'wall'}`);
}
ok(dead <= 12, `dead ends: ${dead} (≤ 12 expected)`);

// 3. the boundary stops walkers before the clamp
const fake = { root: new THREE.Group(), collision: new Collision() };
World.prototype.buildBoundary.call(fake);
ok(fake.boundary && fake.boundary.children.length > 0, 'boundary meshes built');
const walk = (x, z, dx, dz) => { let hitWall = false; for (let k = 0; k < 400; k++) { const r = fake.collision.resolveCircle(x + dx * 0.1, z + dz * 0.1, 0.3, L.LAND_Y); if (r.hit && Math.abs(r.x - (x + dx * 0.1)) + Math.abs(r.z - (z + dz * 0.1)) > 1e-6) hitWall = true; x = r.x; z = r.z; } return { x, z, hitWall }; };
const CLAMP = 2; // Collision clamps the walker 2 m inside BOUNDS
let n3 = 0;
for (let z = B.minZ + 6; z < L.CANALS[1].z0; z += 23) { const r = walk(B.maxX - 20, z, 1, 0); n3++; ok(r.x < B.maxX - CLAMP - 0.1, `east edge z=${z}: reached the invisible clamp (x=${r.x.toFixed(2)})`); }
for (let x = 240; x < B.maxX - 6; x += 23) { const r = walk(x, B.minZ + 20, 0, -1); n3++; ok(r.z > B.minZ + CLAMP + 0.1, `north edge x=${x}: reached the invisible clamp (z=${r.z.toFixed(2)})`); }
for (let x = L.coastX(B.maxZ) + 4; x < B.maxX - 6; x += 23) { const r = walk(x, L.CANALS[1].z0 + 4, 0, 1); n3++; ok(r.z < B.maxZ - CLAMP - 0.1, `south edge x=${x.toFixed(0)}: reached the invisible clamp (z=${r.z.toFixed(2)})`); }
console.log(`edge: ${pass} passed, ${fail} failed · ${L.segments.length} segments, ${dead} dead ends (all open), ${n3} boundary walks`);
process.exit(fail ? 1 : 0);
