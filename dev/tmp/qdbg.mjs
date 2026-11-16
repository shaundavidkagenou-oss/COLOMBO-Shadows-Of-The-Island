import './nodeshim.mjs';
import * as THREE from 'three';
import { Boat } from '../../src/boats/Boat.js';
import { boatModel } from '../../src/boats/BoatModels.js';
import { buildMarina, marinaBerths } from '../../src/boats/Marina.js';
import * as L from '../../src/world/Layout.js';
const { Boats } = await import('../../src/boats/Boats.js');
const F = Object.create(Boats.prototype); F.marina = buildMarina(new THREE.Scene(), { addAll() {} }); F.rects = F.marina.colliders.filter((c) => c.kind === 'deck' || c.kind === 'pole' || c.kind === 'building'); F.all = [];
const B = marinaBerths().find((q) => q.id === 'Q1'); const M = boatModel('meridian72'); const x = B.x(M.len, M.halfBeam);
const b = new Boat('meridian72', { mode: 'drive', x, z: B.zc - 2.5, yaw: Math.PI });
for (const [cx, cz, r] of b.circles()) { const w = F.wet(cx, cz, r); const rr = F.rects.filter((c) => cx > c.x0 - r && cx < c.x1 + r && cz > c.z0 - r && cz < c.z1 + r); console.log(cx.toFixed(1), cz.toFixed(1), r.toFixed(2), 'wet', w, rr.map((c) => c.kind + JSON.stringify([c.x0, c.x1, c.z0, c.z1])).join(' '));
  if (!w) for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) console.log('   ', (cx + dx).toFixed(1), (cz + dz).toFixed(1), L.isSea(cx + dx, cz + dz), L.inLake(cx + dx, cz + dz)); }
const b2 = new Boat('meridian72', { mode: 'drive', x: 218.9, z: -1214.7, yaw: 66 / 57.3 }); F.all = [];
for (const [cx, cz, r] of b2.circles()) { const w = F.wet(cx, cz, r); const rr = F.rects.filter((c) => cx > c.x0 - r && cx < c.x1 + r && cz > c.z0 - r && cz < c.z1 + r); console.log('b2', cx.toFixed(1), cz.toFixed(1), r.toFixed(2), 'wet', w, rr.map((c) => c.kind + JSON.stringify([c.x0, c.x1, c.z0, c.z1])).join(' ')); }
