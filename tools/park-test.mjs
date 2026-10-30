// Parked-vehicle acceptance test (Node, headless):
//  1. no generated kerb-parking spot overlaps a zebra crossing / stop line / junction box or sits beside a level crossing;
//  2. AI traffic never drives through a parked vehicle: one abandoned in the middle of its lane, one slewed across the
//     lane, and one parked at the kerb (which it should pass by pulling out, without touching it).
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const L = await import('../src/world/Layout.js');
const CP = await import('../src/world/CityPlan.js');
const { Traffic, evalPiece } = await import('../src/vehicles/Traffic.js');
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
let pass = 0, fail = 0; const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };

// ---- 1. parking spots vs crossings (zebra is painted 0.8–4.2 m past the junction edge node.hwH / hwV, stop line at +5.1)
const plan = CP.generatePlan(); let bad = 0, rail = 0, worst = '';
for (const p of plan.parking) {
  const s = L.segments[p.seg]; const h = s.dir === 'h'; const n0 = h ? L.nodeAt(s.i, s.j) : L.nodeAt(s.i, s.j), n1 = h ? L.nodeAt(s.i + 1, s.j) : L.nodeAt(s.i, s.j + 1);
  const a = h ? s.x0 + n0.hwV : s.z0 + n0.hwH, b = h ? s.x1 - n1.hwV : s.z1 - n1.hwH; const c = h ? p.x : p.z; const half = 2.6;
  const j0 = n0.segs.length >= 3, j1 = n1.segs.length >= 3;
  const hit = c - half < a + (j0 ? 5.5 : 0) || c + half > b - (j1 ? 5.5 : 0);
  if (hit) { bad++; if (!worst) worst = `${p.x.toFixed(1)},${p.z.toFixed(1)}`; }
  if (L.distToRail(p.x, p.z) < 12) rail++;
}
ok(plan.parking.length > 200, `plenty of kerb parking still generated (${plan.parking.length})`);
ok(bad === 0, `no parked car on a zebra crossing, stop line or junction (${bad} bad, e.g. ${worst})`);
ok(rail === 0, `no parked car beside a level crossing (${rail})`);

// ---- 2. AI vs parked vehicles
function corners(v) { const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), hl = v.T.len / 2, hw = v.T.wid / 2; return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([l, w]) => [v.x + fx * hl * l + fz * hw * w, v.z + fz * hl * l - fx * hw * w]); }
function overlap(A, B) { // separating-axis test of two rectangles
  const ca = corners(A), cb = corners(B);
  for (const poly of [ca, cb]) for (let i = 0; i < 4; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % 4]; const nx = z1 - z0, nz = x0 - x1;
    const pa = ca.map(([x, z]) => x * nx + z * nz), pb = cb.map(([x, z]) => x * nx + z * nz); if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false; }
  return true;
}
const events = { emit() {}, on() {} };
function scenario(name, setup) {
  const T = new Traffic(new THREE.Scene(), { blocked: () => false, resolveCircle: (x, z) => ({ x, z, hit: false }) }, events); T.max = 0;
  const seg = T.drivableSegs.filter((s) => (s.level === 1 || s.level === 2) && !s.crossing && Math.abs((s.z1 - s.z0) + (s.x1 - s.x0)) > 75)[2];
  const ln = T.laneNear((seg.x0 + seg.x1) / 2, (seg.z0 + seg.z1) / 2, seg.dir === 'v' ? 0 : Math.PI / 2); ln.s = 6;
  const car = new Vehicle('car', 11, T.scene); T.adoptAI(car, ln, { v0: 9 });
  const [px, pz, pyaw] = evalPiece(ln.piece, 40); const pk = new Vehicle('sedan', 12, T.scene); const fx = Math.sin(pyaw), fz = Math.cos(pyaw);
  setup(pk, px, pz, pyaw, fx, fz); T.release(pk);
  let touched = false, passed = false, minGap = 99; const focus = { x: px + 20, z: pz };
  for (let i = 0; i < 40 * 20 && T.vehicles.includes(car); i++) { T.update(0.05, focus, null, i * 0.05, [], null); if (overlap(car, pk)) touched = true;
    const al = (car.x - pk.x) * fx + (car.z - pk.z) * fz; if (al > pk.T.len) passed = true; minGap = Math.min(minGap, Math.hypot(car.x - pk.x, car.z - pk.z)); }
  return { touched, passed, minGap };
}
const mid = scenario('mid-lane', (pk, x, z, yaw) => pk.place(x, z, yaw));
ok(!mid.touched, `AI stops behind a car abandoned mid-lane instead of driving through it (closest ${mid.minGap.toFixed(1)} m)`);
const slew = scenario('slewed', (pk, x, z, yaw) => pk.place(x, z, yaw + 1.2));
ok(!slew.touched, `AI never drives through a car slewed across its lane (closest ${slew.minGap.toFixed(1)} m)`);
const kerb = scenario('kerb', (pk, x, z, yaw, fx, fz) => pk.place(x + fz * 1.0, z - fx * 1.0, yaw)); // pushed 1 m toward the kerb (left)
ok(!kerb.touched, `AI does not clip a kerb-parked car (closest ${kerb.minGap.toFixed(1)} m)`);
ok(kerb.passed, 'AI pulls out and passes the kerb-parked car');
console.log(`park test: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
