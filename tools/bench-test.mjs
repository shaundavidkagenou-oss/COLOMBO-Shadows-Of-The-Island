// Benches and park flower beds are solid (people could walk straight through them) — on the real city plan + collision:
//  - walking across any bench (both directions, along its normal) is blocked; nobody ends up inside the slats
//  - the spot in front of each seat that sitters walk up to is free (they can still reach the seat)
//  - someone getting up from the seat (inside the bench footprint) is pushed out by the seat front, never through the backrest
//  - no raised flower bed in Viharamahadevi Park lies on a garden walk / pond / pond bench; a bed can't be stepped onto
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js'); const P = await import('../src/world/Parks.js');
const { Collision } = await import('../src/world/Collision.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; if (fail < 25) console.log('FAIL', m); } };
const col = new Collision(); col.addAll(CP.plan.colliders);
const benches = CP.plan.props.filter((p) => p.type === 'bench'); ok(benches.length > 40, `benches in the plan (${benches.length})`);
let crossed = 0, front = 0, frontOut = 0, total = 0;
for (const b of benches) { const s = Math.sin(b.rot), c = Math.cos(b.rot); const y = L.groundY(b.x, b.z); total++;
  // walk from 1.2 m in front to 1.2 m behind, 5 cm steps, resolving like a walker (r 0.28, step 0.3)
  for (const dir of [-1, 1]) { let x = b.x + s * 1.2 * dir, z = b.z + c * 1.2 * dir; for (let k = 0; k < 48; k++) { x -= s * 0.05 * dir; z -= c * 0.05 * dir; const r = col.resolveCircle(x, z, 0.28, y, 0.3); x = r.x; z = r.z; }
    const side = ((x - b.x) * s + (z - b.z) * c) * dir; if (side < 0.15) { crossed++; if (crossed < 6) console.log('  crossed bench at', b.x.toFixed(1), b.z.toFixed(1), 'dir', dir); } }
  // the approach point sitters walk to (0.55 m in front of the seat line) is not pushed
  { const ax = b.x + s * 0.55, az = b.z + c * 0.55; const r = col.resolveCircle(ax, az, 0.28, y, 0.3); if (Math.hypot(r.x - ax, r.z - az) < 0.03) front++; }
  // getting up: from the seat (hips at the seat line, ±0.42 m along it) the push-out goes forward
  for (const off of [-0.42, 0.42]) { const hx = b.x + c * off, hz = b.z - s * off; const r = col.resolveCircle(hx, hz, 0.28, y, 0.3); const fwd = (r.x - hx) * s + (r.z - hz) * c; if (fwd > 0.1) frontOut++; }
}
ok(crossed === 0, `nobody walks through a bench (${crossed} crossings of ${total * 2})`);
ok(front >= total * 0.97, `seat approach spot free (${front}/${total})`);
ok(frontOut >= total * 2 * 0.97, `getting up leaves by the seat front (${frontOut}/${total * 2})`);
// flower beds
const sd = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
for (const [x, z, r] of P.BEDS) {
  ok(P.PATH_SEGS.every((q) => sd(x, z, q[0], q[1], q[2], q[3]) > q[4] / 2 + r + 0.15), `bed (${x.toFixed(1)}, ${z.toFixed(1)}) clear of the walks`);
  ok(P.PONDS.every((pd) => !P.inPoly(x, z, pd.poly) && P.polyDist(x, z, pd.poly) > r + 0.5), `bed (${x.toFixed(1)}, ${z.toFixed(1)}) clear of the ponds`);
  ok(P.POND_BENCHES.every(([bx, bz]) => Math.hypot(x - bx, z - bz) > r + 1.2), `bed (${x.toFixed(1)}, ${z.toFixed(1)}) clear of the pond benches`);
  const y = L.groundY(x + r + 1, z); let px = x + r + 1.2; for (let k = 0; k < 40; k++) { px -= 0.05; const q = col.resolveCircle(px, z, 0.32, y, 0.45, 1.75); px = q.x; }
  ok(px > x + r + 0.1, `bed (${x.toFixed(1)}, ${z.toFixed(1)}) can't be walked into / stepped onto (stopped at ${(px - x).toFixed(2)} m from centre)`);
}
console.log(`bench: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
