// Bike leg-clearance test (Node): seats short / average / tall adults on every bike with the game's seat pose and measures
// how far thighs and shins sink into the bodywork, frame and engine (exact closest-point-on-triangle distances). Fails when
// any leg sinks deeper than TOL (thigh flesh resting on the seat / tank junction is allowed; a knee through a tank is not).
import './node-dom-stub.mjs';
import * as THREE from 'three';
const { createVehicleMesh } = await import('../src/vehicles/VehicleModels.js');
const { makeSkeleton } = await import('../src/actors/Character.js');
const { applySeatPose, seatLocal } = await import('../src/actors/Seating.js');
const P = (b, n) => new THREE.Vector3().setFromMatrixPosition(b[n].matrixWorld);
const MATS = new Set(['paint', 'livery', 'carbon', 'alloy', 'engine']);
const { BIKE_IDS } = await import('../src/vehicles/BikeCatalog.js');
const TOL = -0.045; let fails = 0;
const types = process.argv[2] ? process.argv[2].split(',') : BIKE_IDS, ks = [null];
for (const type of types) {
  const g = createVehicleMesh(type, 0); g.updateMatrixWorld(true); const seat = g.userData.seats[0]; const tris = [];
  g.traverse((o) => { if (!o.isMesh || !MATS.has(o.name)) return; const pa = o.geometry.attributes.position, ix = o.geometry.index; const n = ix ? ix.count : pa.count;
    for (let i = 0; i < n; i += 3) { const v = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pa, ix ? ix.getX(i + k) : i + k).applyMatrix4(o.matrixWorld)); if (v.some((p) => Math.abs(p.x) > 0.1 && p.y > 0.45 && p.y < 0.95 && p.z > -0.35 && p.z < 0.35)) tris.push(new THREE.Triangle(...v)); } });
  const out = [];
  for (const k of ks) { let worst = 9, at = '';
    for (const height of [1.52, 1.68, 1.88]) {
      const sp = { sex: height < 1.6 ? 'f' : 'm', height, build: height > 1.8 ? 1.08 : 0.96 }; const { bones } = makeSkeleton(sp, 'k' + height + sp.build);
      const b = Object.fromEntries(bones.map((x) => [x.name, x])); const root = new THREE.Group(); const mesh = new THREE.Group(); root.add(mesh); mesh.add(bones[0]);
      root.position.set(seat.x, seat.y, seat.z); const s = height / 1.72; const S2 = k == null ? seat : { ...seat, kneeOut: k };
      applySeatPose({ ch: { bones: b, root, spec: sp }, s, ankle: 0.085 * s, seatW: 1, seatL: seatLocal(S2), t: 0, seed: 0.3, vehSpeed: 0, seatLookT: 9, steer: 0 }, 0.016); root.updateMatrixWorld(true);
      for (const [a0, c0, r] of [['thighL', 'shinL', 0.062 * s], ['shinL', 'footL', 0.048 * s]]) { const a = P(b, a0), c = P(b, c0); for (let i = 3; i <= 12; i++) { const q = a.clone().lerp(c, i / 12); const cp = new THREE.Vector3();
        for (const t of tris) { t.closestPointToPoint(q, cp); const m = cp.distanceTo(q) - r; if (m < worst) { worst = m; at = `h${height} ${a0}@${(i / 12).toFixed(2)} (${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)}) hit (${cp.x.toFixed(2)},${cp.y.toFixed(2)},${cp.z.toFixed(2)})`; } } } }
    }
    if (worst < TOL) fails++; out.push(`${worst < TOL ? 'FAIL' : 'ok  '} ${type} kneeOut ${seat.kneeOut ?? 0}: deepest ${worst.toFixed(3)} m ${at}`); }
  console.log(out.join('\n'));
}
console.log(`bike leg clearance: ${types.length} bikes × 3 riders, ${fails} failures`); process.exit(fails ? 1 : 0);
