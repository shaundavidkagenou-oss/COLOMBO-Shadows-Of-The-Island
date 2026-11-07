// Streaming without hitches must not change the city: chunk detail / window joinery built incrementally (World.stepJob:
// per building / per facade, merged in SliceBuild slices under a time budget) must equal the one-shot build exactly.
import './node-dom-stub.mjs';
const { generatePlan, plan } = await import('../src/world/CityPlan.js');
const { MultiBuilder, SliceBuild } = await import('../src/gfx/MeshBuilder.js');
const { buildDetail, buildWindows, windowTasks } = await import('../src/world/BuildingGen.js');
generatePlan();
// facade window layouts come from the browser-generated facade textures; in Node they are empty, so fill every style with
// synthetic layouts covering each window kind (plain, arched, shutter, grill with bars) - real joinery is then built both ways
const { FACADE_WINDOWS } = await import('../src/gfx/Textures.js');
const styles = new Set(); for (const b of plan.buildings) { styles.add(b.style); if (b.tower) styles.add(b.tower.style); }
for (const st of styles) FACADE_WINDOWS['f_' + st] = [{ u0: 0.06, u1: 0.2, v0: 0.12, v1: 0.38 }, { u0: 0.3, u1: 0.44, v0: 0.12, v1: 0.4, arch: 0.25, kind: 'shutter', shut: '#3a6b52' }, { u0: 0.55, u1: 0.7, v0: 0.6, v1: 0.88, kind: 'grill', bar: 4 }, { u0: 0.8, u1: 0.94, v0: 0.6, v1: 0.86, frame: '#c8c0b0' }];
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const same = (g, sb) => { const A = ['position', 'normal', 'uv', 'color']; for (const k of A) { const a = g.attributes[k].array, b = sb.attributes[k].array; if (a.length !== b.length || a.constructor !== b.constructor) return k + ' length/type'; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return k + ' @' + i; }
  const a = g.index.array, b = sb.index.array; if (a.length !== b.length || a.constructor !== b.constructor) return 'index length/type'; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return 'index @' + i;
  if (!g.boundingBox.equals(sb.boundingBox)) return 'bounding box'; if (!g.boundingSphere.equals(sb.boundingSphere)) return 'bounding sphere'; return null; };
const dense = plan.byChunk.map((c, i) => [i, c ? c.buildings.length : 0]).sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0]);
let verts = 0, steps = 0, wverts = 0, u32 = 0;
for (const idx of dense) {
  const bs = plan.byChunk[idx].buildings;
  // detail: one-shot vs. sliced with a zero budget (every step yields as early as it can)
  const one = new MultiBuilder(); for (const b of bs) buildDetail(b, one);
  const inc = new MultiBuilder(); for (const b of bs) buildDetail(b, inc);
  for (const [name, mb] of one.b) { const g = mb.build(); if (!g) continue; const s = new SliceBuild(inc.b.get(name)); let n = 0; while (!s.step(performance.now(), 0)) n++; steps += n + 1; const diff = same(g, s.geometry()); ok(!diff, `chunk ${idx} detail '${name}' identical when sliced (${diff})`); verts += g.attributes.position.count; }
  // windows: facade tasks in order == buildWindows
  const s1 = new MultiBuilder(), g1 = new MultiBuilder(), s2 = new MultiBuilder(), g2 = new MultiBuilder(); let n1 = 0, n2 = 0;
  for (const b of bs) n1 += buildWindows(b, s1, g1); for (const b of bs) for (const t of windowTasks(b, s2, g2)) n2 += t();
  ok(n1 === n2 && n1 > 0, `chunk ${idx} windows: same window count, sliced per facade column (${n1} vs ${n2})`);
  for (const [A, B] of [[s1, s2], [g1, g2]]) for (const [name, mb] of A.b) { const g = mb.build(); if (!g) continue; const sbB = B.b.get(name) && new SliceBuild(B.b.get(name)); let h = null; if (sbB) { while (!sbB.step(performance.now(), 0)) steps++; h = sbB.geometry(); if (g.index.array instanceof Uint32Array) u32++; } ok(h && !same(g, h), `chunk ${idx} windows '${name}' identical`); wverts += g.attributes.position.count; }
}
{ // loading-screen vehicle warm-up: every type has a built look; the parked vehicles around the spawn are pre-built
  const THREE = await import('three'); const { Traffic } = await import('../src/vehicles/Traffic.js'); const { VTYPES, modelCached } = await import('../src/vehicles/VehicleModels.js'); const { Collision } = await import('../src/world/Collision.js');
  const T = new Traffic(new THREE.Scene(), new Collision(), { emit() {}, on() {} }); const t0 = performance.now(); await T.warmModels([[-140, -891.8]]); const ms = performance.now() - t0;
  const types = T.streetTypes(); ok(types.every((t) => T.looks.get(t)?.length && modelCached(t, T.looks.get(t)[0])), `every street vehicle type has a pre-built look (${types.length} types, ${ms.toFixed(0)} ms in Node)`);
  const near = plan.parking.map((p) => [(p.x + 140) ** 2 + (p.z + 891.8) ** 2, p]).filter((n) => n[0] < 150 * 150).sort((a, b) => a[0] - b[0]).slice(0, 26);
  ok(near.length > 0 && near.every(([, p]) => { const l = T.parkedLook(p); return modelCached(l.type, l.seed); }), `parked vehicles around the spawn are pre-built (${near.length} spots)`); }
ok(u32 > 0, `32-bit index merges covered (${u32})`); ok(steps > dense.length * 4, `slicing actually spread the work (${steps} steps)`);
console.log(`stream: ${pass} passed, ${fail} failed · ${dense.length} densest chunks, ${verts} detail + ${wverts} window verts compared, ${steps} slice steps`); process.exit(fail ? 1 : 0);
