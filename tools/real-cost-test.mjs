// Real-car body cost (Node): for each real-body type, the meshes (≈ draw calls), shadow casters and triangles actually
// visible after the game's own LOD switch (Vehicle.updateVehicleLOD) with the camera 8 / 30 / 80 / 160 m away.
// Run twice for the A/B:  node tools/real-cost-test.mjs   and   NO_REAL_CARS=1 node tools/real-cost-test.mjs (procedural)
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const { createVehicleMesh } = await import('../src/vehicles/VehicleModels.js');
const { LIVE_VEHICLES, updateVehicleLOD } = await import('../src/vehicles/Vehicle.js');
const { REAL_TYPES, realTypesLoaded } = await import('../src/vehicles/RealModels.js');
const types = (process.env.TYPES || REAL_TYPES.join(',')).split(','); const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 1.6, 0);
console.log(process.env.NO_REAL_CARS ? 'PROCEDURAL bodies (NO_REAL_CARS=1)' : 'REAL bodies loaded: ' + realTypesLoaded().join(', '));
const tot = {};
for (const t of types) { const mesh = createVehicleMesh(t, 7); const v = { mesh }; LIVE_VEHICLES.add(v); const row = [];
  for (const d of [8, 30, 80, 160]) { mesh.position.set(0, 0, d); mesh.updateMatrixWorld(true); updateVehicleLOD(cam); updateVehicleLOD(cam);
    let calls = 0, shadow = 0, tris = 0; mesh.traverseVisible((o) => { if (!o.isMesh) return; const g = o.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); calls++; tris += n; if (o.castShadow) shadow++; });
    row.push(`${String(d).padStart(3)} m: ${String(calls).padStart(3)} calls ${String(shadow).padStart(3)} shadow ${(tris / 1000).toFixed(1).padStart(6)}k tris`); const k = d; tot[k] = tot[k] || [0, 0, 0]; tot[k][0] += calls; tot[k][1] += shadow; tot[k][2] += tris; }
  LIVE_VEHICLES.delete(v); console.log(t.padEnd(8), row.join(' | ')); }
console.log('total   ', Object.entries(tot).map(([d, [c, s, n]]) => `${String(d).padStart(3)} m: ${String(c).padStart(3)} calls ${String(s).padStart(3)} shadow ${(n / 1000).toFixed(1).padStart(6)}k tris`).join(' | '));
