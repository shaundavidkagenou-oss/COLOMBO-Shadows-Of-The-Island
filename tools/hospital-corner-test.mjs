// 78th: the hospital's outside corners are closed — for every convex corner of the outer walls (both floors) a ray aimed
// diagonally at the corner from outside, at several heights, hits the exterior shell within a few cm of the outer corner
// point (before the fix it went through a 0.15 m slit between the two wall faces). Node; uses the real builder.
import './node-dom-stub.mjs';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
import * as THREE from 'three';
const P = await import('../src/world/HospitalPlan.js');
const { buildHospital } = await import('../src/world/HospitalBuild.js');
const B = buildHospital(); const { OUTER, HOSP, FLOOR_Y, toWorld } = P; const EXT = HOSP.EXT, H = HOSP.H;
const meshes = []; B.ext.updateMatrixWorld(true); B.ext.traverse((o) => { if (o.isMesh) { o.material.side = THREE.DoubleSide; meshes.push(o); } });
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const rc = new THREE.Raycaster();
const corners = [];
for (const w of OUTER) { const [f, axis, at, s0, s1, out] = w;
  for (const [s, dir] of [[s0, -1], [s1, 1]]) { const nb = OUTER.find((q) => q[0] === f && q[1] !== axis && Math.abs(q[2] - s) < 1e-4 && at > Math.min(q[3], q[4]) - 1e-4 && at < Math.max(q[3], q[4]) + 1e-4);
    if (!nb || nb[5] !== dir) continue; // concave or open end
    const u = axis === 'u' ? s + dir * EXT / 2 : at + out * EXT / 2, v = axis === 'u' ? at + out * EXT / 2 : s + dir * EXT / 2; // outer corner point (plan)
    const du = axis === 'u' ? dir : out, dv = axis === 'u' ? out : dir; const key = f + ':' + u + ',' + v; if (corners.some((c) => c.key === key)) continue;
    corners.push({ key, f, u, v, du, dv }); } }
for (const c of corners) { const fy = FLOOR_Y[c.f]; let worst = 0; const ys = c.f === 0 ? [fy + 0.3, fy + 1.0, fy + 2.0, fy + 3.2] : [fy + 0.3, fy + 1.2, fy + 2.4, fy + H + 0.5];
  for (const y of ys) { const [cx, cz] = toWorld(c.u, c.v); const [ox, oz] = toWorld(c.u + c.du * 3, c.v + c.dv * 3); const o = new THREE.Vector3(ox, y, oz), d = new THREE.Vector3(cx - ox, 0, cz - oz).normalize();
    rc.set(o, d); rc.far = 10; const h = rc.intersectObjects(meshes, false)[0]; const miss = h ? Math.hypot(h.point.x - cx, h.point.z - cz) : 99;
    // a hit nearer than the corner (a sun hood, pilaster, string course…) also closes the view; only a hit BEYOND the corner is a slit
    const beyond = h ? (h.distance - Math.hypot(cx - ox, cz - oz)) : 99; worst = Math.max(worst, beyond > 0.03 ? miss : 0); }
  ok(worst < 0.05, `corner f${c.f} (u ${c.u}, v ${c.v}) open: ray reaches ${worst.toFixed(2)} m past the outer corner`); }
console.log(`${corners.length} outside corners checked`); console.log(fail ? fail + ' FAILED' : 'ALL PASS (' + pass + ')'); process.exit(fail ? 1 : 0);
