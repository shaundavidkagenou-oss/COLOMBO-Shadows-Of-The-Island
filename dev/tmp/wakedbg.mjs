import './nodeshim.mjs';
import * as THREE from 'three';
import { Boat } from '../../src/boats/Boat.js';
import { Wakes } from '../../src/boats/BoatWater.js';
import { waterUniforms } from '../../src/world/Water.js';
const W = new Wakes(new THREE.Group()); const b = new Boat('dondra26', { mode: 'drive', x: 150, z: -1382, yaw: -Math.PI / 2 });
const env = { wakes: W, blocked: () => false, near: 999, wind: 0.4, t: 0 };
for (let i = 0; i < 200; i++) { env.t += 0.05; waterUniforms.uTime.value = env.t; b.update(0.05, { thr: 0.6, steer: 0 }, env); W.update(0.05); }
const T = [...W.trails.values()][0]; console.log('trails', W.trails.size, 'pts', T && T.pts.length, 'range', W.geo.drawRange.count, 'boat', b.x.toFixed(1), b.u.toFixed(1));
for (const i of [0, 1, 3, 8, 15]) { const o = i * 7 + 3; console.log('row', i, 'pos', [...W.pos.slice(o * 3, o * 3 + 3)].map((v) => v.toFixed(2)).join(','), 'aW', [...W.w.slice(o * 4, o * 4 + 4)].map((v) => v.toFixed(2)).join(',')); }
{ const ix = W.geo.index.array, P = W.pos; let up = 0, dn = 0; for (let t = 0; t < W.geo.drawRange.count; t += 3) { const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]]; const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 2] - P[a * 3 + 2]], e2 = [P[c * 3] - P[a * 3], P[c * 3 + 2] - P[a * 3 + 2]]; const ny = e1[1] * e2[0] - e1[0] * e2[1]; if (ny > 1e-6) up++; else if (ny < -1e-6) dn++; } console.log('normals up', up, 'down', dn); }
