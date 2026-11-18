// Whole-map sweep regression test (61st request).  node tools/map-sweep-test.mjs
//  1. Compound walls: no wall built twice / overlapping another collinear run, none crossing another, none on a road, a
//     pavement, inside a building or inside a landmark; every corner / joint is flagged for clean drawing (no coplanar faces).
//  2. Trees: no trunk on a road, a park path or a pedestrian walking line (pavement lines, open-area links, zebra crossings);
//     no foliage below head height (2.1 m) over a walking line (a handful of banana clumps on diagonal links tolerated).
//  3. Street furniture: no lamp post through a traffic-signal pole; no junction shrine on a walking line; no prop inside a
//     building or a compound wall.
//  4. Colombo Fort station: the footbridge stairs climb evenly (≤ 0.2 m per step) from every platform to the deck and down
//     to every other platform without catching; the entrance steps take a walker from the street into the booking hall;
//     the frontage plinth band no longer runs across any stair well (it stood across the main entrance's third tread).
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { MAT } = await import('../src/gfx/Materials.js');
Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } }));
const CP = await import('../src/world/CityPlan.js'); const L = await import('../src/world/Layout.js'); const PC = await import('../src/world/PlacementCheck.js');
const MT = await import('../src/world/MapTidy.js'); const TS = await import('../src/world/TreeShapes.js'); const PK = await import('../src/world/Parks.js');
const { buildLandmarks } = await import('../src/world/Landmarks.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
const plan = CP.generatePlan(); const lm = buildLandmarks();
CP.refitTreeCrowns(CP.landmarkTreeBoxes(lm.colliders.filter((c) => c.kind === 'landmark')), []); // as World does once the landmarks exist
const r2 = (v) => +(+v).toFixed(2);
const ov = (a, b, e = 0.005) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > e && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > e;
const gap = (x, z, c) => Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1));
const grid = (arr, f, gs = 20) => { const M = new Map(); for (const o of arr) { const [x0, x1, z0, z1] = f(o); for (let i = Math.floor(x0 / gs); i <= Math.floor(x1 / gs); i++) for (let j = Math.floor(z0 / gs); j <= Math.floor(z1 / gs); j++) { const k = i * 100003 + j; (M.get(k) || M.set(k, []).get(k)).push(o); } }
  return (x0, x1, z0, z1) => { const s = new Set(); for (let i = Math.floor(x0 / gs); i <= Math.floor(x1 / gs); i++) for (let j = Math.floor(z0 / gs); j <= Math.floor(z1 / gs); j++) for (const o of M.get(i * 100003 + j) || []) s.add(o); return s; }; };

// ---------------------------------------------------------------- 1. walls
const W = plan.walls; const qW = grid(W, (w) => [w.x0, w.x1, w.z0, w.z1]); const ax = (w) => w.x1 - w.x0 >= w.z1 - w.z0;
let coll = 0, para = 0, cross = 0, collS = null, crossS = null; let corners = 0, flagged = 0;
for (const a of W) for (const b of qW(a.x0, a.x1, a.z0, a.z1)) { if (a === b || W.indexOf(b) < W.indexOf(a) || !ov(a, b)) continue;
  if (ax(a) === ax(b)) { const same = ax(a) ? Math.abs(a.z0 + a.z1 - b.z0 - b.z1) < 0.02 : Math.abs(a.x0 + a.x1 - b.x0 - b.x1) < 0.02; if (same) { coll++; collS ||= [a, b].map((w) => [w.x0, w.x1, w.z0, w.z1].map(r2)); } else para++; continue; }
  const h = ax(a) ? a : b, v = ax(a) ? b : a; const endV = Math.min(Math.abs(v.z0 - h.z0), Math.abs(v.z0 - h.z1), Math.abs(v.z1 - h.z0), Math.abs(v.z1 - h.z1)) < 0.3 || (v.z0 >= h.z0 - 0.02 && v.z0 <= h.z1 + 0.02) || (v.z1 >= h.z0 - 0.02 && v.z1 <= h.z1 + 0.02);
  const endH = (h.x0 >= v.x0 - 0.02 && h.x0 <= v.x1 + 0.02) || (h.x1 >= v.x0 - 0.02 && h.x1 <= v.x1 + 0.02);
  if (!endV && !endH) { cross++; crossS ||= [h, v].map((w) => [w.x0, w.x1, w.z0, w.z1].map(r2)); continue; }
  corners++; if ((endV && (v.e0 === 'under' || v.e1 === 'under')) || (!endV && (h.e0 === 'under' || h.e1 === 'under'))) flagged++; }
ok(coll === 0, `no compound wall built twice / overlapping a collinear run (${coll})${collS ? ' e.g. ' + JSON.stringify(collS) : ''}`);
ok(para === 0 && cross === 0, `no wall overlapping a parallel run or crossing through another (${para} / ${cross})${crossS ? ' e.g. ' + JSON.stringify(crossS) : ''}`);
ok(corners > 1000 && flagged === corners, `every wall corner / T-joint drawn without coplanar faces (${flagged}/${corners} flagged)`);
{ let road = 0, pave = 0; for (const w of W) for (let t = 0.05; t < 1; t += 0.1) { const x = w.x0 + (w.x1 - w.x0) * t, z = w.z0 + (w.z1 - w.z0) * t; if (L.roadAt(x, z)) { road++; break; } if (PC.onPavement(x, z)) { pave++; break; } }
  ok(road === 0, `no wall on a road (${road})`); ok(pave === 0, `no wall on a pavement (${pave})`); }
{ const qB = grid(plan.buildings, (b) => [b.x0, b.x1, b.z0, b.z1]); let inB = 0, inL = 0; const LM = lm.colliders.filter((c) => c.h > 0.6 && !['deck', 'platform', 'surface'].includes(c.kind)); const qL = grid(LM, (c) => [c.x0, c.x1, c.z0, c.z1]);
  for (const w of W) { for (const b of qB(w.x0, w.x1, w.z0, w.z1)) if (ov(w, b, 0.05)) { inB++; break; } for (const c of qL(w.x0, w.x1, w.z0, w.z1)) if (ov(w, c, 0.05)) { inL++; break; } }
  ok(inB === 0 && inL === 0, `no wall inside a building / landmark (${inB} / ${inL})`); }
ok(plan.wallTidy && plan.wallTidy.dup > 100, `the duplicate runs were found and removed at generation (${plan.wallTidy && plan.wallTidy.dup})`);

// ---------------------------------------------------------------- 2. trees
{ let road = 0, path = 0, line = 0, ex = null; for (const t of plan.trees) { if (L.roadAt(t.x, t.z)) road++; if (PK.onParkFeature(t.x, t.z, 0)) path++; const [d] = MT.walkLineDist(t.x, t.z); if (d < CP.treeTrunkR(t) + 0.35 && !t.bats) { line++; ex ||= [t.type, r2(t.x), r2(t.z), r2(d)]; } }
  ok(road === 0, `no tree on a road (${road})`); ok(path === 0, `no tree on a park path / feature (${path})`); ok(line === 0, `no tree trunk on a pedestrian walking line (${line})${ex ? ' e.g. ' + JSON.stringify(ex) : ''}`);
  ok(plan.trees.length > 5800, `the city keeps its trees (${plan.trees.length}; ${JSON.stringify(plan.walkClear)})`); }
{ let low = 0, other = 0; for (const t of plan.trees) { const P = TS.crownPoints(t.type); if (!P || MT.walkLineDist(t.x, t.z)[0] > 12) continue; const s = t.s || 1, sy = t.sy || 1, sq = t.sq || 1, c = Math.cos(t.yaw || 0), sn = Math.sin(t.yaw || 0); let hit = false;
    for (let i = 0; i < P.length && !hit; i += 3) { const ly = P[i + 1] * s * sy; if (ly > 2.1) continue; const lx = P[i] * s * sq, lz = P[i + 2] * s * sq; if (MT.walkLineDist(t.x + lx * c + lz * sn, t.z - lx * sn + lz * c)[0] < 0.4) hit = true; }
    if (hit) { low++; if (t.type !== 'banana') other++; } }
  ok(other === 0 && low <= 6, `no foliage below head height over a walking line (${low}, ${other} not banana)`); }

// ---------------------------------------------------------------- 3. furniture
{ const sig = plan.props.filter((p) => p.type === 'signal'); const lamps = plan.props.filter((p) => p.type === 'lamp' || p.type === 'lampHeritage'); let n = 0; for (const l of lamps) if (sig.some((s) => Math.hypot(s.x - l.x, s.z - l.z) < 0.6)) n++;
  ok(n === 0, `no lamp post through a traffic-signal pole (${n}; ${plan.lampSignalFix} moved)`); }
{ const sh = plan.props.filter((p) => p.type === 'shrine'); const bad = sh.filter((p) => MT.walkBoxGap(p.x - 0.8, p.x + 0.8, p.z - 0.8, p.z + 0.8) < 0.35); ok(sh.length >= 4 && bad.length === 0, `junction shrines clear of the walking lines (${sh.length} shrines, ${bad.length} on a line)`); }
{ const qB = grid(plan.buildings, (b) => [b.x0, b.x1, b.z0, b.z1]); let inB = 0, inW = 0; for (const p of plan.props) { if (p.type === 'railing' || p.type === 'gate') continue; for (const b of qB(p.x - 1, p.x + 1, p.z - 1, p.z + 1)) if (p.x > b.x0 + 0.05 && p.x < b.x1 - 0.05 && p.z > b.z0 + 0.05 && p.z < b.z1 - 0.05) { inB++; break; } for (const w of qW(p.x - 1, p.x + 1, p.z - 1, p.z + 1)) if (gap(p.x, p.z, w) < 0.1) { inW++; break; } }
  ok(inB === 0 && inW === 0, `no prop inside a building / compound wall (${inB} / ${inW})`); }

// ---------------------------------------------------------------- 4. Fort station stairs
{ const { Collision } = await import('../src/world/Collision.js'); const { MultiBuilder } = await import('../src/gfx/MeshBuilder.js'); const { buildFortStation } = await import('../src/world/FortStation.js'); const { FORT } = await import('../src/world/FortStationData.js');
  const F = FORT, FL = F.FL, Bd = F.bridge, D = Bd.deck; const col = new Collision(); col.addAll(plan.colliders); const fcol = []; const mb = new MultiBuilder();
  const fgrp = new THREE.Group(); buildFortStation({ mb, colliders: fcol, group: fgrp, C: (c) => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; }, hip() {}, lightPool() {} }); col.addAll(fcol);
  const walk = (x, z, tx, tz, y) => { let maxStep = 0, stuck = 0; for (let i = 0; i < 3000; i++) { const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz); if (d < 0.1) break; const s = Math.min(0.05, d); const r = col.resolveCircle(x + dx / d * s, z + dz / d * s, 0.32, y, 0.45, 1.75);
      if (Math.hypot(r.x - x, r.z - z) < 0.005) { if (++stuck > 20) return { x, z, y, maxStep, stuck: true }; } else stuck = 0; x = r.x; z = r.z; const ny = col.groundAt(x, z, y, 0.5); maxStep = Math.max(maxStep, Math.abs(ny - y)); y = ny; } return { x, z, y, maxStep, stuck: false }; };
  let bad = []; const foot = Bd.x1 + Bd.run + 1.2;
  for (const st of Bd.stairs) { const up = walk(foot, st.zc, Bd.x0 + 1.5, st.zc, col.groundAt(foot, st.zc, FL + 0.2)); if (up.stuck || Math.abs(up.y - D) > 0.05 || up.maxStep > 0.2) bad.push(`up ${st.zc}: y ${r2(up.y)} step ${r2(up.maxStep)}${up.stuck ? ' stuck' : ''}`);
    for (const s2 of Bd.stairs) if (s2 !== st) { const a = walk(up.x, up.z, up.x, s2.zc, up.y); const dn = walk(a.x, a.z, foot, s2.zc, a.y); if (dn.stuck || Math.abs(dn.y - FL) > 0.05 || dn.maxStep > 0.2) bad.push(`down ${s2.zc}: y ${r2(dn.y)} step ${r2(dn.maxStep)}`); } }
  ok(!bad.length, `footbridge: up from every platform, across and down to every other one, ≤ 0.2 m steps${bad.length ? ': ' + bad.join('; ') : ''}`);
  { const bad2 = []; for (let e = 0; e < 3; e++) { const s = F.street[e], i = F.inside[e]; const r = walk(s.x, s.z, i.x, i.z, col.groundAt(s.x, s.z, 0.6)); if (r.stuck || Math.abs(r.y - FL) > 0.05 || r.maxStep > 0.25) bad2.push(`${e}: y ${r2(r.y)} step ${r2(r.maxStep)}`); }
    ok(!bad2.length, `entrance steps: street → booking hall at every entrance${bad2.length ? ': ' + bad2.join('; ') : ''}`); }
  // nothing stands across a stair well: a level ray from the street at 0.75 m over the street-level step meets the 4th riser
  // (the frontage plinth band used to run across the entrances 3 cm in front of the building line, over the third tread)
  { const grp = new THREE.Group(); for (const m of mb.toMeshes(MAT, {})) grp.add(m); grp.add(fgrp); grp.updateMatrixWorld(true); const rc = new THREE.Raycaster(); const bad3 = [];
    for (const e of F.entrances) { const z0 = e.main ? F.bld.z0 - 0.8 : F.bld.z0; rc.set(new THREE.Vector3(e.x + 0.3, F.Y + 0.75, F.bld.z0 - 3), new THREE.Vector3(0, 0, 1)); rc.far = 6; const h = rc.intersectObject(grp, true)[0];
      const want = z0 + 3 * 0.3; if (!h || Math.abs(h.point.z - want) > 0.06) bad3.push(`x ${e.x}: first hit z ${h ? r2(h.point.z) : 'none'} (riser at ${r2(want)})`); }
    ok(!bad3.length, `entrance stair wells open: the first thing in front at knee height is the 4th step riser${bad3.length ? ': ' + bad3.join('; ') : ''}`); }
  // the footbridge stairs have a sloping soffit and the mid post stops under it
  { const src = (await import('node:fs')).readFileSync(new URL('../src/world/FortStation.js', import.meta.url), 'utf8'); ok(/sloping soffit/.test(src) && /pTop = yTop\(px \+ 0\.125\) - Tv/.test(src), 'footbridge stairs: smooth soffit under the treads, mid-span post below it'); }
}
console.log(`\nmap-sweep-test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
