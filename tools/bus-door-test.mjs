// Bus door test (Node): bus + private bus, every colour / variant.
//  1. both kerb-side doorways have two hinged leaves (shut: baked into the body, nothing on the pivots)
//  2. shut: rays from the street into the doorway hit the leaves (the doorway is closed by real panels)
//  3. open: the leaves swing out to the street and rays through the doorway (standing height, and over each stair tread)
//     hit nothing at all — no body side, glass, trim, floor edge or detail kit left in the way of a passenger
//  4. the treads are there (a ray straight down in the stairwell lands on each tread top)
import './node-dom-stub.mjs';
import * as THREE from 'three';
const { createVehicleMesh, VTYPES, BUS_STEPS } = await import('../src/vehicles/VehicleModels.js');
const { allDoorsLive, poseDoor, syncDoors, busLeaves } = await import('../src/vehicles/DoorRig.js');
let fails = 0, checks = 0; const bad = [];
const ok = (c, msg) => { checks++; if (!c) { fails++; if (bad.length < 40) bad.push(msg); } };
const rc = new THREE.Raycaster();
const hits = (g, a, b) => { const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); rc.set(a, d.normalize()); rc.near = 0; rc.far = L; const out = []; g.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible !== false) { let p = o; let vis = true; while (p) { if (p.visible === false) vis = false; p = p.parent; } if (vis) for (const h of rc.intersectObject(o, false)) out.push(h); } }); return out.sort((p, q) => p.distance - q.distance); };
for (const type of ['bus', 'pbus']) for (let seed = 1; seed <= 8; seed++) {
  const g = createVehicleMesh(type, seed); const ud = g.userData; const W = VTYPES[type].wid / 2; g.updateMatrixWorld(true);
  const leaves = ud.doors.filter((d) => d.leaf); ok(leaves.length === 4, `${type}#${seed}: 4 leaves (${leaves.length})`);
  ok(ud.door === null, `${type}#${seed}: no car door picked as the driver's door`);
  ok(leaves.every((d) => !d.live && !d.pivot.visible && !d.pivot.children.length), `${type}#${seed}: shut leaves are baked`);
  const doorZs = [...new Set(leaves.map((d) => +(d.hz - d.leaf * 0.475).toFixed(2)))]; ok(doorZs.length === 2, `${type}#${seed}: two doorways (${doorZs})`);
  allDoorsLive(ud); g.updateMatrixWorld(true);
  for (const dz of doorZs) {
    const pair = busLeaves(ud, dz); ok(pair.length === 2, `${type}#${seed} z${dz}: leaf pair`);
    // shut: the leaves close the opening
    for (const y of [0.6, 1.2, 2.0]) for (const oz of [-0.3, 0, 0.3]) { const h = hits(g, new THREE.Vector3(W + 1.5, y, dz + oz), new THREE.Vector3(0, y, dz + oz)); const first = h[0]; let isLeaf = false; if (first) { let p = first.object; while (p) { if (/^door\d/.test(p.name)) isLeaf = true; p = p.parent; } }
      ok(first && isLeaf && first.point.x > W - 0.06, `${type}#${seed} z${dz}: shut doorway closed by a leaf at y${y} dz${oz} (${first ? first.object.name + '@' + first.point.x.toFixed(3) : 'nothing'})`); }
    // open
    for (const d of pair) { d.ang = 1; poseDoor(d); } syncDoors(ud); g.updateMatrixWorld(true);
    for (const d of pair) { const tip = new THREE.Vector3(0, 1.2, -d.leaf * d.len).applyMatrix4(d.pivot.matrixWorld); ok(tip.x > W + 0.35, `${type}#${seed}: open leaf stands out in the street (tip x ${tip.x.toFixed(2)})`); }
    const T = BUS_STEPS(W); const rays = [];
    for (const oz of [-0.36, -0.2, 0, 0.2, 0.36]) { for (const y of [1.05, 1.5, 2.0, 2.45]) rays.push([[W + 1.5, y, dz + oz], [W - 0.75, y, dz + oz]]);
      rays.push([[W + 1.5, T[0][0] + 0.03, dz + oz], [T[0][1] + 0.02, T[0][0] + 0.03, dz + oz]]); rays.push([[W + 1.5, T[1][0] + 0.03, dz + oz], [T[1][1] + 0.02, T[1][0] + 0.03, dz + oz]]); rays.push([[W + 1.5, 0.95, dz + oz], [W - 0.75, 0.95, dz + oz]]); }
    for (const [a, b] of rays) { const h = hits(g, new THREE.Vector3(...a), new THREE.Vector3(...b)); ok(!h.length, `${type}#${seed} z${dz}: open doorway clear y${a[1].toFixed(2)} z${(a[2] - dz).toFixed(2)} (hit ${h[0] ? (h[0].object.name || h[0].object.parent?.name || '?') + '@' + h[0].point.toArray().map((v) => v.toFixed(2)) : ''})`); }
    for (const [ty, x0, x1] of T) { const xm = (x0 + x1) / 2; const h = hits(g, new THREE.Vector3(xm, ty + 0.5, dz), new THREE.Vector3(xm, ty - 0.3, dz)); ok(h.length && Math.abs(h[0].point.y - ty) < 0.02, `${type}#${seed} z${dz}: tread at ${ty} (${h[0] ? h[0].point.y.toFixed(3) : 'none'})`); }
    { const h = hits(g, new THREE.Vector3(W - 0.8, 1.5, dz), new THREE.Vector3(W - 0.8, 0.6, dz)); ok(h.length && Math.abs(h[0].point.y - 0.92) < 0.03, `${type}#${seed} z${dz}: floor inside the doorway at 0.92 (${h[0] ? h[0].point.y.toFixed(3) : 'none'})`); }
    for (const d of pair) { d.ang = 0; poseDoor(d); } syncDoors(ud); ok(pair.every((d) => !d.live), `${type}#${seed}: shut leaves fold back into the bake`); allDoorsLive(ud); g.updateMatrixWorld(true);
  }
}
console.log(`bus-door-test: ${checks} checks, ${fails} failed`); for (const b of bad) console.log('  FAIL', b);
process.exit(fails ? 1 : 0);
