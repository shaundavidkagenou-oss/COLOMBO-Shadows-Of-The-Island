// Body shape test (Node): the procedural body surfacing in src/vehicles/BodyShape.js and its use on the real fleet.
//   • capTriangulate: a ring with long collinear runs + interior points → exact area, every ring edge used once, no
//     T-junctions (each interior edge shared by exactly two triangles), no point dropped, no slivers;
//   • bodySkin on a car-like silhouette (sill, two wheel arches, bonnet, roof line): watertight (every edge shared by
//     exactly two triangles), no degenerate triangles, sane side-face triangle angles;
//   • refineForField + the body warp: a coarse box bent by the field stays closed (no cracks between refined and
//     unrefined neighbours) and actually follows the curve (its face bulges with the field instead of staying straight);
//   • the field never folds (finite-difference Jacobian determinant > 0.25 over the body volume — the nose and tail bands
//     compress the corners by design, ~0.45);
//   • every vehicle type builds, with no NaN positions or normals anywhere.
// Run: node tools/body-shape-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial(); return t[k]; } })); }
const { bodySkin, capTriangulate, makeBodyWarp, refineForField } = await import('../src/vehicles/BodyShape.js');
const { createVehicleMesh, VTYPES } = await import('../src/vehicles/VehicleModels.js');

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const edgeCounts = (I) => { const E = new Map(); for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3]; const key = a < b ? a * 1e7 + b : b * 1e7 + a; E.set(key, (E.get(key) || 0) + 1); } return E; };

// 1. cap triangulation
{
  const ring = []; for (let i = 0; i < 10; i++) ring.push(new THREE.Vector2(i * 0.1, 0)); for (let i = 0; i < 5; i++) ring.push(new THREE.Vector2(1, i * 0.1)); for (let i = 10; i > 0; i--) ring.push(new THREE.Vector2(i * 0.1, 0.5)); for (let i = 5; i > 0; i--) ring.push(new THREE.Vector2(0, i * 0.1));
  const inner = []; for (let x = 0.1; x < 0.95; x += 0.1) for (let y = 0.1; y < 0.45; y += 0.1) inner.push(new THREE.Vector2(x + 0.03, y));
  const { pts, tris } = capTriangulate(ring, inner); const n = ring.length; let area = 0, neg = 0, minA = 180;
  for (const [a, b, c] of tris) { const A = pts[a], B = pts[b], C = pts[c]; const ar = ((B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x)) / 2; area += ar; if (ar <= 0) neg++;
    for (const [P, Q, R] of [[A, B, C], [B, C, A], [C, A, B]]) { const u = Q.clone().sub(P), w = R.clone().sub(P); minA = Math.min(minA, Math.acos(Math.max(-1, Math.min(1, u.dot(w) / u.length() / w.length()))) * 180 / Math.PI); } }
  const E = edgeCounts(tris.flat()); let ringOk = 0, bad = 0; for (const [k, c] of E) { const p = Math.floor(k / 1e7), q = k % 1e7; const isRing = p < n && q < n && (q - p === 1 || q - p === n - 1); if (isRing && c === 1) ringOk++; else if (!isRing && c !== 2) bad++; }
  ok(Math.abs(area - 0.5) < 1e-9, `cap: area ${area} ≠ 0.5`); ok(neg === 0, `cap: ${neg} inverted triangles`); ok(ringOk === n, `cap: ${ringOk}/${n} ring edges`); ok(bad === 0, `cap: ${bad} T-junction edges`);
  ok(new Set(tris.flat()).size === pts.length, 'cap: points dropped'); ok(minA > 20, `cap: min angle ${minA.toFixed(1)}°`);
  console.log(`cap triangulation: ${tris.length} tris, min angle ${minA.toFixed(1)}°`);
}

// 2. skin watertight
const ol = [[-2.2, 0.3]]; for (const [zc, R] of [[-1.35, 0.3], [1.35, 0.3]]) { const ra = R + 0.07, al = Math.asin((R - 0.3) / ra); const a0 = Math.PI + al, a1 = -al; for (let k = 0; k <= 20; k++) { const t = a0 + (a1 - a0) * k / 20; ol.push([zc + Math.cos(t) * ra, R + Math.sin(t) * ra]); } }
ol.push([2.25, 0.3], [2.3, 0.6], [2.2, 0.8], [1.0, 0.9], [0.8, 0.92], [-1.2, 0.95], [-2.15, 0.9], [-2.25, 0.6]);
{
  const g = mergeVertices(bodySkin(ol, 0.85, 0.07), 1e-4); const P = g.attributes.position.array, I = g.index.array; const E = edgeCounts(I); let open = 0; for (const [, c] of E) if (c !== 2) open++;
  let degen = 0, minA = 180; for (let t = 0; t < I.length; t += 3) { const v = [0, 1, 2].map((k) => new THREE.Vector3().fromArray(P, I[t + k] * 3)); if (new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])).length() < 1e-10) degen++;
    if (v.every((p) => Math.abs(p.x) > 0.849)) for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3], c = v[(k + 2) % 3]; minA = Math.min(minA, b.clone().sub(a).angleTo(c.clone().sub(a)) * 180 / Math.PI); } }
  ok(open === 0, `skin: ${open} open / non-manifold edges`); ok(degen === 0, `skin: ${degen} degenerate triangles`); ok(minA > 3, `skin: side-face min angle ${minA.toFixed(1)}°`);
  console.log(`body skin: ${I.length / 3} tris, ${open} open edges, side-face min angle ${minA.toFixed(1)}°`);
}

// 3. refine + warp: a coarse box across the nose stays closed and bends with the field
const spec = { W: 0.85, outline: ol, roof: [[1.0, 0.9], [0.4, 1.4], [-0.9, 1.4], [-1.2, 0.95]], roofW: 0.65, nose: 0.15, tail: 0.1, crown: 0.035, roofCrown: 0.045, sill: 0.3, belt: 0.92, tuckSill: 0.026, tuckBelt: 0.014 };
const SF = makeBodyWarp(spec);
{
  const box = new THREE.BoxGeometry(1.9, 0.18, 0.12, 1, 1, 1); box.translate(0, 0.42, 2.27); box.deleteAttribute('uv'); box.deleteAttribute('normal'); const merged = mergeVertices(box, 1e-6); // welded by position (a closed box)
  const r = refineForField(merged, SF.field); SF.warp(r); const E = edgeCounts(r.index.array); let open = 0; for (const [, c] of E) if (c !== 2) open++;
  const P = r.attributes.position; let zMid = -9, zEnd = 9; for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); if (Math.abs(x) < 0.05) zMid = Math.max(zMid, z); if (Math.abs(x) > 0.9) zEnd = Math.min(zEnd, z); }
  ok(r.index.count > merged.index.count, 'refine: the coarse box was not refined'); ok(open === 0, `refine: ${open} cracked edges after warping`);
  ok(zMid - zEnd > 0.1, `refine: the box face did not follow the nose curve (centre ${zMid.toFixed(3)}, ends ${zEnd.toFixed(3)})`);
  console.log(`refine: ${merged.index.count / 3} → ${r.index.count / 3} tris, closed, nose bow ${((zMid - zEnd) * 100).toFixed(1)} cm`);
}

// 4. the field never folds
{
  const o = [0, 0, 0], a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], e = 1e-3; let minDet = 9;
  for (let x = -0.9; x <= 0.9; x += 0.06) for (let y = 0; y <= 1.5; y += 0.05) for (let z = -2.4; z <= 2.4; z += 0.05) {
    SF.field(x, y, z, o); SF.field(x + e, y, z, a); SF.field(x, y + e, z, b); SF.field(x, y, z + e, c);
    const j = [[(a[0] - o[0]) / e, (b[0] - o[0]) / e, (c[0] - o[0]) / e], [(a[1] - o[1]) / e, (b[1] - o[1]) / e, (c[1] - o[1]) / e], [(a[2] - o[2]) / e, (b[2] - o[2]) / e, (c[2] - o[2]) / e]];
    const det = j[0][0] * (j[1][1] * j[2][2] - j[1][2] * j[2][1]) - j[0][1] * (j[1][0] * j[2][2] - j[1][2] * j[2][0]) + j[0][2] * (j[1][0] * j[2][1] - j[1][1] * j[2][0]); minDet = Math.min(minDet, det); }
  ok(minDet > 0.25, `field: Jacobian determinant down to ${minDet.toFixed(3)} (folding / extreme squash)`); console.log(`field: min Jacobian determinant ${minDet.toFixed(3)}`);
}

// 5. the fleet builds, no NaN
{
  let n = 0, nan = 0; const tri = {}; const t0 = performance.now();
  for (const t of Object.keys(VTYPES)) { let g; try { g = createVehicleMesh(t, 1009); } catch (err) { ok(false, `${t}: build threw ${err.message}`); continue; } n++; let tc = 0;
    g.traverse((m) => { if (!m.isMesh || !m.geometry) return; const G = m.geometry; for (const k of ['position', 'normal']) { const A = G.attributes[k]; if (!A) continue; for (let i = 0; i < A.array.length; i++) if (!Number.isFinite(A.array[i])) { nan++; break; } } tc += (G.index ? G.index.count : G.attributes.position.count) / 3; });
    tri[t] = Math.round(tc); }
  ok(nan === 0, `fleet: ${nan} attributes with NaN`);
  const fam = (t) => VTYPES[t].catalog ? VTYPES[t].family || 'catalog' : t; const by = {}; for (const t in tri) { const f = fam(t); (by[f] ||= []).push(tri[t]); }
  console.log(`fleet: ${n} types built in ${((performance.now() - t0) / 1000).toFixed(1)} s; triangles per vehicle (LOD0 incl. detail):`, Object.entries(by).map(([f, l]) => `${f} ${Math.round(l.reduce((s, v) => s + v, 0) / l.length)}`).join(', '));
}
console.log(`body-shape: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
