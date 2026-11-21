// dev view: a real car's side with one front door taken out (as if swung wide open) — what stays in the doorway
//   node tools/cars/dooropen-view.mjs <type> <out.png>
import '../node-dom-stub.mjs';
import * as THREE from 'three';
import { render, stackPNG } from './lib.mjs';
const { createVehicleMesh } = await import('../../src/vehicles/VehicleModels.js');
const { allDoorsLive, poseDoor, syncDoors } = await import('../../src/vehicles/DoorRig.js');
const [type = 'vanta', out = '/tmp/dooropen.png'] = process.argv.slice(2);
const g = createVehicleMesh(type, 1); const ud = g.userData; allDoorsLive(ud, true);
const D = ud.doors.find((d) => d.role === 'front' && d.side < 0); D.ang = 1.2; poseDoor(D); syncDoors(ud); g.updateMatrixWorld(true);
const far = ud.real ? [ud.real.mid, ud.real.low] : []; const tris = []; const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const COL = { paint: [0.2, 0.35, 0.8], glass: [0.6, 0.85, 0.9], interior: [0.45, 0.3, 0.15] };
g.traverse((o) => { if (!o.isMesh) return; let p = o; while (p) { if (p === D.pivot || far.includes(p) || p.visible === false) return; p = p.parent; }
  const I = o.geometry.index, P = o.geometry.attributes.position; const gr = o.geometry.groups.length ? o.geometry.groups : [{ start: 0, count: I ? I.count : P.count }];
  const col = COL[o.name] || [0.25, 0.25, 0.25];
  for (const q of gr) for (let t = q.start; t < q.start + q.count; t += 3) { for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(P, I ? I.getX(t + k) : t + k).applyMatrix4(o.matrixWorld); tris.push({ a: v[0].toArray(), b: v[1].toArray(), c: v[2].toArray(), col }); } });
const lo = [-1.2, 0, -1.4], hi = [1.2, 1.4, 1.2];
await stackPNG(out, [render(tris, { right: [0, 0, -1], up: [0, 1, 0], look: [1, 0, 0] }, { px: 260, lo, hi, pad: 0.05, grid: 0.25 })]); // from the left (−x) side
console.log('wrote', out, tris.length);
