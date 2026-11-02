// Viharamahadevi Park test (Node, headless): the new features (golden Buddha shrine, lily ponds + bridges, play area +
// Jet Provost, Cenotaph) sit on lawn, never on the original walks; no tree, lamp or bench lands in them; the bridges are
// walkable at their deck height while the pond water blocks walkers; the shrine steps rise in 15 cm steps; the play-area
// gate is open and its fence holds; the baked statue decodes cleanly and fits its throne; the bats' roost timetable.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const P = await import('../src/world/Parks.js');
const L = await import('../src/world/Layout.js');
const { Collision } = await import('../src/world/Collision.js');
const CP = await import('../src/world/CityPlan.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const segDist = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
const orig = P.PATH_SEGS.slice(0, P.EXTRA0);
const onOrig = (x, z, m = 0) => orig.some((s) => segDist(x, z, s[0], s[1], s[2], s[3]) < s[4] / 2 + m) || P.PATH_RINGS.some(([cx, cz, r, w]) => Math.abs(Math.hypot(x - cx, z - cz) - r) < w / 2 + m) || P.PLAZAS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + m)
  || P.BEDS.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + 0.2 + m) || P.HEDGES.some((h) => segDist(x, z, h[0], h[1], h[2], h[3]) < 0.6 + m);
const inFeature = (x, z, m = 0) => P.PONDS.some((pd) => P.inPoly(x, z, pd.poly) || P.polyDist(x, z, pd.poly) < m) || Math.max(Math.abs(x - P.BUDDHA.x), Math.abs(z - P.BUDDHA.z)) < P.BUDDHA.steps[0] + m
  || (x > P.PLAY.x0 - m && x < P.PLAY.x1 + m && z > P.PLAY.z0 - m && z < P.PLAY.z1 + m) || Math.max(Math.abs(x - P.CENOTAPH.x), Math.abs(z - P.CENOTAPH.z)) < P.CENOTAPH.half + m;
// 1. features on lawn, inside the park, clear of the original walks
{ let bad = 0, at = ''; const K = P.PARK;
  for (let x = K.x0; x < K.x1; x += 0.5) for (let z = K.z0; z < K.z1; z += 0.5) if (inFeature(x, z, 0.3) && onOrig(x, z)) { bad++; if (!at) at = `${x},${z}`; }
  ok(bad === 0, `no new feature overlaps an original walk, bed or hedge (${bad} samples, e.g. ${at})`);
  let out = 0; for (let x = K.x0 - 20; x < K.x1 + 20; x += 1) for (let z = K.z0 - 20; z < K.z1 + 20; z += 1) if (inFeature(x, z) && (x < K.x0 + 3 || x > K.x1 - 3 || z < K.z0 + 3 || z > K.z1 - 3)) out++;
  ok(out === 0, `every feature lies well inside the park (${out})`);
  for (const pd of P.PONDS) { const b = pd.bridge; ok(!P.inPoly(b.x, b.z0, pd.poly) && !P.inPoly(b.x, b.z1, pd.poly) && P.inPoly(b.x, (b.z0 + b.z1) / 2, pd.poly), `bridge at x ${b.x} spans its pond from bank to bank`);
    ok(pd.jets.every(([x, z]) => P.inPoly(x, z, pd.poly) && P.polyDist(x, z, pd.poly) > 2 && Math.abs(x - b.x) > 3), 'pond fountains sit in open water, clear of the bridge'); }
  const extra = P.PATH_SEGS.slice(P.EXTRA0); ok(extra.length === 7, 'garden walks to the bridges, shrine, Cenotaph and play gate');
  ok(extra.every((s) => [[s[0], s[1]], [s[2], s[3]]].every(([x, z]) => P.onParkFeature(x, z, 0.1))), 'each new walk ends on a path or a feature'); }
// 2. the plan: trees, lamps, benches
const plan = CP.generatePlan(); const K = P.PARK;
{ const inPark = (o) => o.x > K.x0 && o.x < K.x1 && o.z > K.z0 && o.z < K.z1;
  const tr = plan.trees.filter(inPark); const badT = tr.filter((t) => inFeature(t.x, t.z, 1.2)); ok(badT.length === 0, `no tree in a pond, on the shrine, in the play area or on the Cenotaph square (${badT.length})`);
  ok(P.BAT_TREES.every(([x, z]) => tr.some((t) => t.bats && Math.hypot(t.x - x, t.z - z) < 0.01)), 'the three giant roost trees are planted');
  ok(P.BAT_TREES.every(([x, z]) => !P.onParkFeature(x, z, 1.5)), 'roost trees stand on open lawn');
  const lamps = P.parkLamps(); const badL = lamps.filter(([x, z]) => inFeature(x, z, 0.5) || P.PATH_SEGS.slice(P.EXTRA0).some((s) => segDist(x, z, s[0], s[1], s[2], s[3]) < s[4] / 2 + 0.25));
  ok(badL.length === 0, `no park lamp in a feature or on a new walk (${badL.map((l) => l.slice(0, 2).map((v) => v.toFixed(1)).join(',')).join(' ')})`);
  const benches = plan.poi.filter((p) => p.type === 'bench' && inPark(p)); const badB = benches.filter((b) => inFeature(b.x, b.z, 0.2) && !(b.x > P.PLAY.x0 && b.x < P.PLAY.x1 && b.z > P.PLAY.z0 && b.z < P.PLAY.z1));
  ok(badB.length === 0, `no bench inside a pond, shrine or Cenotaph (${badB.length})`);
  const lawn = plan.poi.filter((p) => p.type === 'lawn' && inPark(p)); ok(lawn.every((p) => !inFeature(p.x, p.z, 0.5)), 'lawn sitters keep off the new features'); }
// 3. walking: bridges, pond water, shrine steps, play fence + gate
const col = new Collision(); col.addAll(plan.colliders);
const solidAt = (x, z, y, r = 0.3) => col.resolveCircle(x, z, r, y, 0.45, 1.8).hit;
for (const pd of P.PONDS) { const b = pd.bridge; let worst = 0, blocked = 0, maxStep = 0, py = null;
  for (let z = b.z0 - 3; z <= b.z1 + 3; z += 0.1) { const y = col.groundAt(b.x, z, py ?? L.LAND_Y, 0.6); const want = P.bridgeY(b, z); if (want !== null) worst = Math.max(worst, Math.abs(y - want)); if (py !== null) maxStep = Math.max(maxStep, Math.abs(y - py)); py = y; if (solidAt(b.x, z, y)) blocked++; }
  ok(worst < 0.03, `bridge x ${b.x}: feet follow the deck (worst ${worst.toFixed(3)} m)`); ok(blocked === 0, `bridge x ${b.x}: walkable end to end (${blocked} blocked samples)`); ok(maxStep < 0.06, `bridge x ${b.x}: no step on the arch (${maxStep.toFixed(3)})`);
  let open = 0, n = 0; for (let x = pd.cx - 16; x < pd.cx + 16; x += 0.7) for (let z = pd.cz - 10; z < pd.cz + 10; z += 0.7) if (P.inPoly(x, z, pd.poly) && Math.abs(x - b.x) > b.hw + 0.5) { n++; if (!solidAt(x, z, L.LAND_Y, 0.05)) open++; }
  ok(n > 50 && open === 0, `pond ${pd.cx}: the water blocks walkers everywhere off the bridge (${open}/${n} open)`); }
{ const B = P.BUDDHA; let prev = null, maxRise = 0, top = 0; for (let x = B.x + 8; x > B.x + B.ped + 0.4; x -= 0.05) { const y = col.groundAt(x, B.z, prev ?? L.LAND_Y, 0.6); if (prev !== null) maxRise = Math.max(maxRise, y - prev); prev = y; top = y; }
  ok(Math.abs(maxRise - B.rise) < 0.01 && Math.abs(top - (L.LAND_Y + 6 * B.rise)) < 0.01, `shrine steps: ${B.rise} m risers up to the upper terrace (max rise ${maxRise.toFixed(3)}, top ${top.toFixed(2)})`);
  ok(solidAt(B.x + B.ped - 0.1, B.z, top), 'the pedestal is solid'); ok(!solidAt(B.x + 7.6, B.z, L.LAND_Y), 'the approach from the Town Hall gate is open');
  ok(!solidAt(P.PARK.x1 - 2.6, B.z, L.LAND_Y), 'the hedge has a gate at the shrine path'); ok(solidAt(P.PARK.x1 - 2.6, B.z + 8, L.LAND_Y), 'the hedge is closed beside it'); }
{ const Pl = P.PLAY; ok(!solidAt(Pl.x1, Pl.gate, L.LAND_Y), 'play-area gate is open'); ok(solidAt(Pl.x1, Pl.gate + 4, L.LAND_Y), 'play-area fence blocks beside the gate'); ok(solidAt(Pl.x0, (Pl.z0 + Pl.z1) / 2, L.LAND_Y), 'play-area fence blocks on the far side');
  ok(!solidAt(Pl.jet.x + 4.5 * Math.cos(Pl.jet.yaw), Pl.jet.z - 4.5 * Math.sin(Pl.jet.yaw), L.LAND_Y), 'people walk under the Jet Provost wing (it is 0.9 m up on its plinth)'); }
// 4. the statue mesh
{ const B = await import('../src/world/BuddhaStatue.js'); const DATA = (await import('../src/world/buddhaData.js')).default;
  for (const lod of ['hi', 'lo']) { const g = B.buddhaGeometry(DATA, lod); const p = g.attributes.position.array; let nan = 0; for (const v of p) if (!Number.isFinite(v)) nan++; g.computeBoundingBox(); const bb = g.boundingBox;
    ok(nan === 0, `${lod}: no NaN vertices`); ok(bb.max.y > 5.3 && bb.max.y < 5.8 && bb.min.y > -0.05, `${lod}: seated height ${bb.max.y.toFixed(2)} m`); ok(Math.max(-bb.min.x, bb.max.x) < 2.75 && Math.max(-bb.min.z, bb.max.z) < 2.75, `${lod}: fits on its 2.75 m throne`);
    const tris = g.index.count / 3; ok(lod === 'hi' ? tris > 50000 && tris < 120000 : tris < 25000, `${lod}: ${tris} triangles`); }
  const th = B.lotusThroneGeometry(); ok(th.attributes.position.count / 3 < 15000, 'lotus throne stays light'); }
// 5. bats
{ const { ParkLife } = await import('../src/world/ParkLife.js'); const R = ParkLife.roosting;
  ok(R(12) === 1 && R(17.9) === 1, 'the whole colony hangs in the trees by day'); ok(R(19.4) < 0.1 && R(23) < 0.1 && R(3) < 0.1, 'most bats are out at night'); ok(R(18.6) > R(19) && R(5.5) > R(5), 'they leave through the dusk and return through the dawn'); }
console.log(`vmpark test: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
