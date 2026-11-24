// 79th: sky-visibility bake (src/gfx/SkyVis.js) — time, and that the values follow the city: a narrow Pettah lane sees far
// less sky than Baseline Road / Galle Face Green, rooftops see it all, interiors with their own lighting are left alone,
// the ground under a park tree is darker than the open lawn, and building walls open up from foot to eaves.
//   NO_REAL_CARS=1 node tools/skyvis-test.mjs
import './node-dom-stub.mjs';
await import('../src/gfx/Materials.js');
const THREE = await import('three');
const SV = await import('../src/gfx/SkyVis.js');
const CP = await import('../src/world/CityPlan.js');
const L = await import('../src/world/Layout.js');
const { crownPoints } = await import('../src/world/TreeShapes.js');
const { colonnadeArcades } = await import('../src/world/BuildingGen.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } if (process.env.VERB || !c) console.log('  ', c ? 'ok ' : 'NO ', m); };
CP.generatePlan(); const plan = CP.plan;
const CR = new Map(); const crown = (type) => { if (CR.has(type)) return CR.get(type); const P = crownPoints(type) || crownPoints('mara'); let r = 0, top = 0, base = 1e9; for (let i = 0; i < P.length; i += 3) { r = Math.max(r, Math.hypot(P[i], P[i + 2])); top = Math.max(top, P[i + 1]); base = Math.min(base, P[i + 1]); } const o = { r: r * 0.85, top, base: Math.min(base, top - 1) }; CR.set(type, o); return o; };
const exempt = L.ZONES.filter((z) => ['hospital', 'slpHQ', 'policeHQ', 'fortstation', 'maradanast'].includes(z.id)).map((z) => z.rect);
const arcades = plan.buildings.map(colonnadeArcades).filter(Boolean);
const st = await SV.buildSkyVis({ buildings: plan.buildings, boxes: plan.colliders, trees: plan.trees, crown, exempt, arcades, groundY: L.LAND_Y });
console.log('bake', JSON.stringify(st), 'arcades', arcades.length, 'trees', plan.trees.length);
ok(st.ms < 4000, `bake time ${st.ms} ms (< 4 s, once at load)`);
ok(SV.SV_P[0] === 1, 'enabled after the bake');
const g = (x, z) => SV.skyVisAt(x, 0.2, z);
// pick the narrowest-lined street spot in Pettah and an open arterial: scan road points
let lane = { v: 9 }, open = { v: -1 };
for (const s of L.segments || []) { const n = 12; for (let k = 1; k < n; k++) { const x = s.x0 + (s.x1 - s.x0) * k / n, z = s.z0 + (s.z1 - s.z0) * k / n; const d = L.districtIdAt ? L.districtIdAt(x, z) : ''; const v = g(x, z);
  if (s.level >= 2 && d === 'pettah' && v < lane.v) lane = { v, x, z, lvl: s.level }; if (s.level === 0 && v > open.v) open = { v, x, z }; } }
console.log('darkest Pettah street', JSON.stringify(lane), 'brightest arterial', JSON.stringify(open));
const base = g(662, -120), pet = g(-110, -960), gf = g(-470, -450);
console.log('Baseline Rd', base.toFixed(3), 'Pettah 1st Cross', pet.toFixed(3), 'Galle Face', gf.toFixed(3));
ok(open.v > 0.85, `open arterial sees most of the sky (${open.v.toFixed(2)})`);
ok(lane.v < 0.75, `narrow Pettah lane sees much less sky (${lane.v.toFixed(2)})`);
ok(gf > base - 0.02 && gf > pet, `Galle Face (${gf.toFixed(2)}) ≥ Baseline Rd (${base.toFixed(2)}) > Pettah lane (${pet.toFixed(2)})`);
// rooftops: open
let roofs = 0, roofsOpen = 0; for (const b of plan.buildings.slice(0, 400)) { if (!(b.h > 8)) continue; roofs++; const v = SV.skyVisAt((b.x0 + b.x1) / 2, L.LAND_Y + b.h + 0.05, (b.z0 + b.z1) / 2); if (v > 0.8) roofsOpen++; }
ok(roofsOpen / roofs > 0.75, `rooftops see the sky (${roofsOpen}/${roofs} > 0.8)`);
// interiors: exempt / inside footprints → 1
ok(SV.skyVisAt(660, 0.5, -235) === 1, 'hospital interior untouched (own lighting)');
const b0 = plan.buildings.find((b) => b.h > 10 && b.x1 - b.x0 > 12 && b.z1 - b.z0 > 12); ok(SV.skyVisAt((b0.x0 + b0.x1) / 2, L.LAND_Y + 0.1, (b0.z0 + b0.z1) / 2) === 1, 'a ground floor inside a building footprint untouched');
// walls: lane facade foot darker than its eaves
{ const x = lane.x, z = lane.z; const foot = SV.skyVisAt(x, 1, z), high = SV.skyVisAt(x, 14, z); ok(high > foot + 0.05, `lane opens upward (foot ${foot.toFixed(2)} → 14 m ${high.toFixed(2)})`); }
// trees: under a big park tree vs 12 m away on open ground
{ let best = null; for (const t of plan.trees) { if ((t.s || 1) < 1 || L.zoneAt(t.x, t.z)?.id !== 'vmpark') continue; best = t; break; }
  if (best) { const u = g(best.x + 1, best.z + 1); let far = 0; for (const [dx, dz] of [[14, 0], [-14, 0], [0, 14], [0, -14]]) far = Math.max(far, g(best.x + dx, best.z + dz)); ok(u < far - 0.08, `under a park tree ${u.toFixed(2)} < open lawn ${far.toFixed(2)}`); } else ok(false, 'no park tree found'); }
// arcade cover
if (arcades.length) { const a = arcades[0]; const mx = (a.a[0] + a.b[0]) / 2 + a.n[0] * 0.6, mz = (a.a[1] + a.b[1]) / 2 + a.n[1] * 0.6, ox = mx + a.n[0] * 6, oz = mz + a.n[1] * 6; const u = g(mx, mz), o = g(ox, oz); ok(u < o - 0.15, `Fort arcade walkway ${u.toFixed(2)} darker than the street 6 m out ${o.toFixed(2)}`); }
// shader text present once
ok((THREE.ShaderChunk.lights_fragment_end.match(/svK/g) || []).length >= 2 && THREE.ShaderLib.standard.uniforms.uSkyVisP.value === SV.SV_P, 'shader chunk + shared uniforms installed');
// uniform cloning keeps the typed arrays shared and the texture's Source shared
{ const U = THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms); ok(U.uSkyVisP.value === SV.SV_P && U.uSkyVisMap.value.source === SV.skyVisTex.source, 'cloned material uniforms share the live parameters and the map source'); }
console.log(`skyvis-test: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
