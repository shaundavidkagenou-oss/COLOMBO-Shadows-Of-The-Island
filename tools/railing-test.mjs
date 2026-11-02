// Roadside railing test (Node, headless): the yellow/black pedestrian barriers on the busy Pettah / Fort / Maradana roads
//  1. are laid as continuous runs: every section sits on a solid run collider and the sections cover each run end to end
//     (no hairline gaps, no missing sections inside a run);
//  2. are solid: someone walking at the barrier is stopped at it, along the whole run, ends included;
//  3. keep their openings: none in front of a bus stop, none across a pedestrian crossing or a walkway link of the crowd
//     graph, and the pavement and road stay walkable at the openings.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); const plan = CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Collision } = await import('../src/world/Collision.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
const col = new Collision(); col.addAll(plan.colliders);

const runs = plan.colliders.filter((c) => c.kind === 'railing'), rails = plan.props.filter((p) => p.type === 'railing');
ok(runs.length > 20 && rails.length > 100, `barriers exist (${runs.length} runs, ${rails.length} sections)`);
// 1. sections ↔ runs
const along = (c) => (c.x1 - c.x0 > c.z1 - c.z0 ? 'x' : 'z');
let orphan = 0, gaps = 0, worstGap = 0, cover = 0; const per = new Map(runs.map((c) => [c, []]));
for (const p of rails) { const horiz = Math.abs(Math.sin(p.rot)) < 0.5; // rot 0: the section runs along x
  const c = runs.find((r) => (horiz ? along(r) === 'x' && p.x - 1.5 >= r.x0 - 0.01 && p.x + 1.5 <= r.x1 + 0.01 && p.z > r.z0 && p.z < r.z1 : along(r) === 'z' && p.z - 1.5 >= r.z0 - 0.01 && p.z + 1.5 <= r.z1 + 0.01 && p.x > r.x0 && p.x < r.x1));
  if (!c) orphan++; else per.get(c).push(horiz ? p.x : p.z); }
for (const [c, xs] of per) { xs.sort((a, b) => a - b); const a0 = (along(c) === 'x' ? c.x0 : c.z0) + 0.07, a1 = (along(c) === 'x' ? c.x1 : c.z1) - 0.07;
  let at = a0; for (const x of xs) { const g = x - 1.5 - at; if (Math.abs(g) > 0.01) { gaps++; worstGap = Math.max(worstGap, Math.abs(g)); } at = x + 1.5; }
  if (Math.abs(a1 - at) > 0.01) { gaps++; worstGap = Math.max(worstGap, Math.abs(a1 - at)); } else cover++; }
ok(orphan === 0, `every railing section stands on a solid run (${orphan} without a collider)`);
ok(gaps === 0 && cover === runs.length, `sections cover each run end to end, post to post (${gaps} gaps, worst ${(worstGap * 100).toFixed(1)} cm)`);
ok(runs.every((c) => Math.max(c.x1 - c.x0, c.z1 - c.z0) <= 24.2), 'runs are at most 24 m, then a pedestrian opening');
ok(runs.every((c) => { const n = 9; for (let i = 0; i <= n; i++) { const t = i / n; const x = c.x0 + (c.x1 - c.x0) * t, z = c.z0 + (c.z1 - c.z0) * t; if (L.isWater(x, z)) return false; } return true; }), 'no barrier stands in water');
// 2. solid: walk a person (r 0.3) straight at the barrier from the pavement side at many points; they must stay on their side
let through = 0, tried = 0;
for (const c of runs) { const ax = along(c), mid = ax === 'x' ? (c.z0 + c.z1) / 2 : (c.x0 + c.x1) / 2; const lo = ax === 'x' ? c.x0 : c.z0, hi = ax === 'x' ? c.x1 : c.z1;
  for (const t of [0.02, 0.25, 0.5, 0.75, 0.98]) { const u = lo + (hi - lo) * t;
    for (const s of [-1, 1]) { tried++; let x = ax === 'x' ? u : mid + s * 1.2, z = ax === 'x' ? mid + s * 1.2 : u; const y = col.groundAt(x, z, 0.5);
      for (let k = 0; k < 40; k++) { if (ax === 'x') z -= s * 0.08; else x -= s * 0.08; const r = col.resolveCircle(x, z, 0.3, y, 0.45, 1.8); x = r.x; z = r.z; }
      const side = ax === 'x' ? Math.sign(z - mid) : Math.sign(x - mid); if (side !== s) through++; } } }
ok(through === 0, `nobody walks through a barrier (${through}/${tried} pushes got through)`);
// 3. openings
let blockedStop = 0; for (const q of plan.busStops) for (const c of runs) { const d = 4.0; if (q.x > c.x0 - d && q.x < c.x1 + d && q.z > c.z0 - d && q.z < c.z1 + d) { const ax = along(c); const off = ax === 'x' ? Math.abs(q.z - (c.z0 + c.z1) / 2) : Math.abs(q.x - (c.x0 + c.x1) / 2); const inSpan = ax === 'x' ? q.x > c.x0 - 2.2 && q.x < c.x1 + 2.2 : q.z > c.z0 - 2.2 && q.z < c.z1 + 2.2; if (off < 3.5 && inSpan) blockedStop++; } }
ok(blockedStop === 0, `no barrier in front of a bus stop (${blockedStop})`);
const hitsRail = (ax, az, bx, bz, r) => { const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25)); for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; for (const c of col.query(x - r, z - r, x + r, z + r)) if (c.kind === 'railing' && x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return true; } return false; };
let cutWalk = 0, cutCross = 0, crossN = 0;
for (const E of L.pedEdges) { const a = L.pedNodes[E.a], b = L.pedNodes[E.b]; if (E.type === 'cross') { crossN++; if (hitsRail(a.x, a.z, b.x, b.z, 0.3)) cutCross++; } else if (hitsRail(a.x, a.z, b.x, b.z, 0.12)) cutWalk++; }
ok(cutCross === 0 && crossN > 50, `no barrier across a pedestrian crossing (${cutCross}/${crossN})`);
ok(cutWalk === 0, `no barrier across a walkway link of the crowd graph (${cutWalk})`);
ok(L.pedNodes.every((n) => !hitsRail(n.x, n.z, n.x, n.z, 0.35)), 'no crowd-graph node stands inside a barrier');
// openings are real openings: between two runs in line, a person passes the 2.4 m gap from the road to the pavement
let opens = 0, openOk = 0; const byLine = new Map();
for (const c of runs) { const ax = along(c), key = ax + ':' + (ax === 'x' ? ((c.z0 + c.z1) / 2).toFixed(2) : ((c.x0 + c.x1) / 2).toFixed(2)); (byLine.get(key) || byLine.set(key, []).get(key)).push(c); }
for (const [key, cs] of byLine) { const ax = key[0], m = +key.slice(2); cs.sort((a, b) => (ax === 'x' ? a.x0 - b.x0 : a.z0 - b.z0));
  for (let i = 1; i < cs.length; i++) { const e = ax === 'x' ? cs[i - 1].x1 : cs[i - 1].z1, s = ax === 'x' ? cs[i].x0 : cs[i].z0; if (Math.abs(s - e - 2.26) > 0.05) continue; /* 2.4 m between posts = 2.26 m between the collider faces */ opens++;
    const u = (e + s) / 2; let x = ax === 'x' ? u : m - 1.2, z = ax === 'x' ? m - 1.2 : u; const y = col.groundAt(x, z, 0.5);
    for (let k = 0; k < 30; k++) { if (ax === 'x') z += 0.08; else x += 0.08; const r = col.resolveCircle(x, z, 0.3, y, 0.45, 1.8); x = r.x; z = r.z; }
    if ((ax === 'x' ? z : x) > m + 0.8) openOk++; } }
ok(opens > 10 && openOk === opens, `the 2.4 m pedestrian openings are passable (${openOk}/${opens})`);
console.log(`railing test: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
