// node tools/cars/procdump.mjs <type> <out-prefix> [names=interior,dash] : renders the procedural model's parts (by game material)
import '../node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const { cleanLook, VTYPES } = await import('../../src/vehicles/VehicleModels.js');
const { render, stackPNG, keyColour } = await import('./lib.mjs');
const [type, out, names] = process.argv.slice(2); const want = names ? names.split(',') : null; const T = VTYPES[type];
const L = cleanLook(type, T.colors[0], 0); const tris = []; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; const cnt = {};
for (const [name, g] of [...L.geos, ...L.dgeos.map(([n, g]) => ['d:' + n, g])]) { const P = g.attributes.position, Cc = g.attributes.color, I = g.index; cnt[name] = (cnt[name] || 0) + (I ? I.count / 3 : P.count / 3);
  if (want && !want.includes(name.replace('d:', ''))) continue; const n = I ? I.count : P.count; const kc = keyColour(name);
  for (let k = 0; k < n; k += 3) { const v = [0, 1, 2].map((j) => { const i = I ? I.getX(k + j) : k + j; return [P.getX(i), P.getY(i), P.getZ(i)]; }); const i0 = I ? I.getX(k) : k;
    const col = process.env.FALSE ? kc : Cc ? [Cc.getX(i0), Cc.getY(i0), Cc.getZ(i0)] : [0.5, 0.5, 0.5]; tris.push({ a: v[0], b: v[1], c: v[2], col });
    for (const p of v) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p[a]); hi[a] = Math.max(hi[a], p[a]); } } }
console.log(type, 'T', T.len, T.wid, T.hgt, 'R', T.wheelR, 'wheels', JSON.stringify(L.m.wheels), '\n tris', JSON.stringify(cnt), '\n seats', JSON.stringify(L.m.seats.map((s) => [s.x, s.y, s.z].map((v) => +v.toFixed(2)))), 'steer', JSON.stringify(L.m.steerWheel && [L.m.steerWheel.position?.toArray?.()]), '\n doors', JSON.stringify(L.m.doors.map((d) => ({ side: d.side, role: d.role, hinge: d.hinge.map((v) => +v.toFixed(3)), len: +d.len.toFixed(3), zR: d.spec && +d.spec.zR.toFixed(3), by: d.spec && +d.spec.by.toFixed(3), rects: d.spec && d.spec.rects }))));
const A = { R: [0, 0, 1], U: [0, 1, 0], D: [1, 0, 0] }; const neg = (a) => a.map((v) => -v);
await stackPNG(out + '-proc.png', [{ right: A.R, up: A.U, look: A.D }, { right: A.D, up: A.U, look: neg(A.R) }, { right: A.R, up: neg(A.D), look: neg(A.U) }].map((v) => render(tris, v, { px: 110, lo, hi })));
