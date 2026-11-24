// every nav lamp of every boat: what fraction of its required arc is blocked by the boat itself (rays slightly downward/level/up)
import * as THREE from 'three';
import { boatModel } from '../../src/boats/BoatModels.js';
import { BOATS } from '../../src/boats/BoatCatalog.js';
const D = Math.PI / 180;
const ARC = { port: [0, 112.5], stbd: [-112.5, 0], mast: [-112.5, 112.5], stern: [112.5, 247.5], allround: [0, 360], anchor: [0, 360], tri: [0, 360] };
const ids = process.argv[2] ? process.argv[2].split(',') : Object.keys(BOATS); let worst = [];
for (const id of ids) { const M = boatModel(id); const mesh = new THREE.Mesh(M.geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); const parts = [mesh];
  if (M.sparGeo) parts.push(new THREE.Mesh(M.sparGeo, mesh.material)); const rc = new THREE.Raycaster(); const out = [];
  for (const l of M.lights) { const A = ARC[l.kind]; if (!A) continue; let n = 0, bl = 0; const o = new THREE.Vector3(...l.p);
    for (let a = A[0] + 2; a <= A[1] - 2; a += (A[1] - A[0] - 4) / 24) for (const el of [-1.5, 0, 3]) { const az = a * D; const d = new THREE.Vector3(Math.sin(az), Math.sin(el * D), Math.cos(az)).normalize(); // az from ahead (+z) toward port (+x)
      rc.set(o, d); rc.near = 0.14; rc.far = 400; const h = rc.intersectObjects(parts, false); n++; if (h.length) bl++; }
    const f = bl / n; out.push(`${l.kind}${f > 0.08 ? '!' : ''}${(f * 100).toFixed(0)}%`); if (f > 0.08) worst.push(`${id} ${l.kind} ${l.p.map((v) => v.toFixed(2))} ${(f * 100).toFixed(0)}%`); }
  console.log(id.padEnd(12), out.join(' ')); }
console.log('\nBLOCKED >8%:\n' + worst.join('\n'));
