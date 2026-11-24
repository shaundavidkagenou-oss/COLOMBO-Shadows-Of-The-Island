// Lane test (Node, headless): every path the traffic AI can drive — each lane of every road, every junction turn and
// straight-through, the U-turn at a dead end — keeps a car's whole footprint on the carriageway: never across a footpath,
// a park path or a kerb corner. Also: the drivable network has no dead ends (no place where all traffic turns around).
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const T = await import('../src/vehicles/Traffic.js');
const V = process.env.V; let pass = 0, fail = 0; const bad = []; const ok = (c, m) => { if (c) pass++; else { fail++; bad.push(m); } };
const HALF = 0.95, LEN = 2.3; // a mid-size car: half width, half length
const drv = new Set(T.flowNetwork(L.segments.filter((s) => !s.crossing || s.level <= 2))); // the network ambient traffic drives
function offRoad(x, z, yaw) { // corners + mid-sides of the footprint not on the carriageway
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx; let n = 0;
  for (const [a, b] of [[LEN, HALF], [LEN, -HALF], [-LEN, HALF], [-LEN, -HALF], [0, HALF], [0, -HALF], [LEN, 0]]) { const px = x + fx * a + rx * b, pz = z + fz * a + rz * b; if (!L.roadAt(px, pz) && !L.junctionAt?.(px, pz)) n++; }
  return n;
}
let turns = 0, worst = [];
for (const node of L.nodes) {
  const segs = node.segs.filter((s) => drv.has(s)); if (!segs.length) continue;
  for (const sin of segs) for (const sout of segs) {
    if (sin === sout && segs.length > 1) continue; // a U-turn is only taken at a dead end
    const from = T.otherEnd(sin, node), to = T.otherEnd(sout, node);
    const lanesIn = sin.level <= 1 ? 2 : 1;
    for (let lane = 0; lane < lanesIn; lane++) {
      const a = T.linePiece(sin, from, node, lane); const lanesOut = sout.level <= 1 ? 2 : 1; const b = T.linePiece(sout, node, to, Math.min(lanesOut - 1, lane));
      const c = T.curvePiece(a, b, node, 3.8); turns++;
      let w = 0, wk = null; for (let s = 0; s <= c.len; s += 0.5) { const [x, z, yaw] = T.evalPiece(c, Math.min(s, c.len)); const n = offRoad(x, z, yaw); if (n > w) { w = n; wk = [x, z]; } }
      for (const P of [a, b]) for (let s = 0; s <= P.len; s += 2) { const [x, z, yaw] = T.evalPiece(P, s); const n = offRoad(x, z, yaw); if (n > w) { w = n; wk = [x, z]; } }
      const tag = `${c.turn} at node ${node.id} (${node.x.toFixed(0)}, ${node.z.toFixed(0)}) lane ${lane} ${sin.name || ''}→${sout.name || ''}`;
      ok(w === 0, `${tag}: ${w} footprint points off the carriageway near (${wk && wk[0].toFixed(1)}, ${wk && wk[1].toFixed(1)})`);
    }
  }
}
// dead ends in the drivable network (a node reached by exactly one drivable road): all traffic turns around there
let dead = 0; for (const node of L.nodes) { const n = node.segs.filter((s) => drv.has(s)).length; if (n === 1) { dead++; ok(false, `dead end at node ${node.id} (${node.x.toFixed(0)}, ${node.z.toFixed(0)})`); } }
if (V || fail) { const byKind = {}; for (const m of bad) { const k = m.split(' ')[0]; byKind[k] = (byKind[k] || 0) + 1; } console.log('failures by kind', JSON.stringify(byKind)); for (const m of bad.slice(0, V ? 400 : 25)) console.log('FAIL', m); }
console.log(`lane: ${turns} lane/turn paths, ${dead} dead ends, ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
