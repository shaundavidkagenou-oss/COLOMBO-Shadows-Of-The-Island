// FPS without visual change: the per-building BatchedMesh (World.stepJob → CellBatch.RangeBatch) and the per-cell BatchedMesh
// (CellBatch.cellBatch, street dressing) must contain exactly the triangles of the merged mesh they replace — same vertices,
// same attributes, every triangle once — with one instance per building / cell (so each can be frustum-culled).
import './node-dom-stub.mjs';
import * as THREE from 'three';
const { generatePlan, plan } = await import('../src/world/CityPlan.js');
const { MultiBuilder } = await import('../src/gfx/MeshBuilder.js');
const { buildDetail, windowTasks } = await import('../src/world/BuildingGen.js');
const { RangeBatch, rangesFor, cellBatch } = await import('../src/gfx/CellBatch.js');
generatePlan();
const { FACADE_WINDOWS } = await import('../src/gfx/Textures.js');
const styles = new Set(); for (const b of plan.buildings) { styles.add(b.style); if (b.tower) styles.add(b.tower.style); }
for (const st of styles) FACADE_WINDOWS['f_' + st] = [{ u0: 0.06, u1: 0.2, v0: 0.12, v1: 0.38 }, { u0: 0.3, u1: 0.44, v0: 0.12, v1: 0.4, arch: 0.25, kind: 'shutter', shut: '#3a6b52' }, { u0: 0.55, u1: 0.7, v0: 0.6, v1: 0.88, kind: 'grill', bar: 4 }];
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const NAMES = ['position', 'normal', 'uv', 'color'];
// every triangle as a string of its 3 vertices' attributes (rounded), sorted — a multiset comparison
const triKeys = (geo, i0, i1, ix = geo.index.array, off = 0) => { const out = []; for (let t = i0; t < i1; t += 3) { let k = ''; for (let j = 0; j < 3; j++) { const v = ix[t + j] + off; for (const n of NAMES) { const A = geo.attributes[n]; if (!A) continue; for (let c = 0; c < A.itemSize; c++) k += A.array[v * A.itemSize + c].toFixed(4) + ','; } k += '|'; } out.push(k); } return out; };
const batchKeys = (B) => { const g = B.geometry; const out = []; const n = B._geometryInfo ? B._geometryInfo.length : B.instanceCount; let inst = 0;
  for (let gid = 0; gid < n; gid++) { const r = B.getGeometryRangeAt(gid); if (!r) continue; inst++; for (const k of triKeys(g, r.start, r.start + r.count)) out.push(k); } return { keys: out, inst }; };
const dense = plan.byChunk.map((c, i) => [i, c ? c.buildings.length : 0]).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
const mat = new THREE.MeshStandardMaterial({ vertexColors: true }); let tris = 0, batches = 0;
for (const idx of dense) { const bs = plan.byChunk[idx].buildings;
  for (const kind of ['detail', 'win']) { const mb = new MultiBuilder(), glass = new MultiBuilder(); const marks = []; const mark = () => marks.push(new Map([...mb.b].map(([n, b]) => [n, [b.pos.length / 3, b.idx.length]])));
    for (const b of bs) { mark(); if (kind === 'detail') buildDetail(b, mb); else for (const t of windowTasks(b, mb, glass)) t(); } mark();
    for (const [name, b] of mb.b) { const g = b.build(); if (!g) continue; const ranges = rangesFor(marks, name); if (ranges.length < 3) continue;
      const cover = ranges.reduce((s, r) => s + r[3] - r[2], 0); ok(cover === g.index.count, `chunk ${idx} ${kind} '${name}': building ranges cover every index (${cover}/${g.index.count})`);
      ok(ranges.every((r) => { for (let k = r[2]; k < r[3]; k++) { const v = g.index.array[k]; if (v < r[0] || v >= r[1]) return false; } return true; }), `chunk ${idx} ${kind} '${name}': each building's triangles only use its own vertices`);
      const ref = triKeys(g, 0, g.index.count).sort(); const RB = new RangeBatch(g.clone(), ranges, mat); while (!RB.step(performance.now(), 1e9)); const { keys, inst } = batchKeys(RB.mesh); keys.sort();
      ok(inst === ranges.length, `chunk ${idx} ${kind} '${name}': one instance per building (${inst}/${ranges.length})`);
      ok(keys.length === ref.length && keys.every((k, i) => k === ref[i]), `chunk ${idx} ${kind} '${name}': batched triangles identical to the merged mesh (${keys.length} vs ${ref.length})`);
      tris += ref.length; batches++; } } }
{ // cellBatch: a big merged mesh spread over several cells
  const mb = new MultiBuilder(); for (const idx of dense) for (const b of plan.byChunk[idx].buildings) buildDetail(b, mb);
  const [name, b] = [...mb.b].sort((x, y) => y[1].idx.length - x[1].idx.length)[0]; const g = b.build(); const ref = triKeys(g, 0, g.index.count).sort();
  const m = new THREE.Mesh(g.clone(), mat); m.name = name; m.castShadow = true; const B = cellBatch(m, 50); ok(B.isBatchedMesh, `cellBatch turned '${name}' into a BatchedMesh`);
  const { keys, inst } = batchKeys(B); keys.sort(); ok(inst >= 3, `cellBatch: several cells (${inst})`); ok(keys.length === ref.length && keys.every((k, i) => k === ref[i]), `cellBatch: identical triangles (${keys.length} vs ${ref.length})`);
  ok(B.castShadow && B.name === name && B.perObjectFrustumCulled, 'cellBatch keeps flags and culls per cell'); }
console.log(`cellbatch: ${pass} passed, ${fail} failed · ${batches} batched materials, ${tris} triangles compared`); process.exit(fail ? 1 : 0);
