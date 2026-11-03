// Punched-into-a-wall test (Node, headless): real city colliders, real Crowd + RagdollWorld. People standing right in front
// of building walls (and fences / compound walls) are punched toward the wall — jabs, hooks, uppercuts, knock-downs and a
// fatal beating (ragdoll). Every frame, every bone of the body must stay outside every building / wall footprint.
// Run: node tools/punch-wall-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const L = await import('../src/world/Layout.js');
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Collision } = await import('../src/world/Collision.js');
const { Crowd } = await import('../src/actors/Crowd.js');
const { RagdollWorld } = await import('../src/actors/Ragdoll.js');
const BOD = await import('../src/actors/Bodies.js'); const separate = BOD.separate;
const col = new Collision(); col.addAll(CP.plan.colliders); BOD.setBodiesCollision?.(col);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
// test spots: the street face of real buildings / walls (a point 0.45 m out from the middle of a long side, on open ground)
const solids = CP.plan.colliders.filter((c) => (c.kind === 'building' || c.kind === 'wall') && c.h > 2 && (c.x1 - c.x0) > 3 && (c.z1 - c.z0) > 0.15);
const spots = []; const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
for (let k = 0; k < 4000 && spots.length < 24; k++) { const c = solids[Math.floor(rng() * solids.length)]; const side = Math.floor(rng() * 4); const u = 0.3 + 0.4 * rng();
  let x, z, nx = 0, nz = 0; if (side === 0) { x = c.x0 + (c.x1 - c.x0) * u; z = c.z0 - 0.45; nz = -1; } else if (side === 1) { x = c.x0 + (c.x1 - c.x0) * u; z = c.z1 + 0.45; nz = 1; } else if (side === 2) { x = c.x0 - 0.45; z = c.z0 + (c.z1 - c.z0) * u; nx = -1; } else { x = c.x1 + 0.45; z = c.z0 + (c.z1 - c.z0) * u; nx = 1; }
  if (L.isWater(x, z) || col.blocked(x, z, 0.3)) continue; if (col.blocked(x + nx * 2.5, z + nz * 2.5, 0.4)) continue; // room for the attacker
  spots.push({ x, z, nx, nz, c }); }
ok(spots.length >= 16, `found wall-side test spots (${spots.length})`);
const inside = (x, z, y) => { for (const c of col.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05)) { if (!(c.kind === 'building' || c.kind === 'wall')) continue; if (c.h < 1 || y > (c.y0 ?? 0) + c.h || y < (c.y0 ?? 0) - 0.2) continue; const m = 0.04; if (x > c.x0 + m && x < c.x1 - m && z > c.z0 + m && z < c.z1 - m) return c; } return null; };
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];
const v = new THREE.Vector3(); const worst = []; const SEQ = [['jab'], /* + a fighter pushed for 3 s */ ['hook'], ['upper'], ['hook', 'hook', 'upper', 'hook', 'upper', 'hook'], ['hook', 'upper', 'hook', 'upper', 'hook', 'upper', 'hook', 'upper', 'hook', 'upper', 'hook', 'upper']];
for (const [si, S] of spots.entries()) for (const [qi, seq] of SEQ.entries()) {
  const scene = new THREE.Scene(); const C = new Crowd(scene, col, { emit() {}, on() {} }); C.max = 1; C.prepareSpecs(1); C.ragdolls = new RagdollWorld(col);
  const focus = { x: S.x, z: S.z }; const src = { x: S.x - S.nx * 0.75, z: S.z - S.nz * 0.75, y: 0, yaw: Math.atan2(S.nx, S.nz), vehicle: null, ch: null };
  const ctx = { simTime: 0, vehicles: [], player: src, bodies: [], hourFactor: 1, hour: 12 }; const dt = 1 / 60;
  const nid = C.nearestNode ? C.nearestNode(S.x, S.z) : 0; C.makePed(C.specs[0], S.x, S.z, typeof nid === 'object' && nid ? nid.id ?? 0 : nid ?? 0);
  const p = C.peds[0]; if (!p) { ok(false, 'spawned'); continue; } p.x = S.x; p.z = S.z; p.y = col.groundAt(S.x, S.z, 1, 3); p.keep = true; p.yaw = Math.atan2(-S.nx, -S.nz); p.vx = p.vz = 0; C.react(p, 'idle', 30, {}, true); p.fighter = false;
  let bad = null, t = 0, k = 0, maxIn = 0; const tick = () => { C.update(dt, focus, new THREE.Vector3(0, 0, -1), ctx); C.ragdolls.update(dt, []); t += dt; p.ch.root.updateMatrixWorld(true);
    for (const n of BONES) { const b = p.ch.bones[n]; if (!b) continue; b.getWorldPosition(v); const c = inside(v.x, v.z, v.y); if (c) { const d = Math.min(v.x - c.x0, c.x1 - v.x, v.z - c.z0, c.z1 - v.z); if (d > maxIn) { maxIn = d; bad = `${n} ${(d * 100).toFixed(0)} cm inside the ${c.kind} at t=${t.toFixed(2)} (state ${p.state}${p.dead ? ', dead' : ''}${p.ch.rag ? ', ragdoll' : ''})`; } } }
    const c0 = inside(p.x, p.z, (p.y || 0) + 0.5); if (c0) { maxIn = Math.max(maxIn, 1); bad = `root inside the ${c0.kind} at t=${t.toFixed(2)}`; } };
  const stepIn = () => { if (p.state === 'down' || p.dead) return; const dx = p.x - src.x, dz = p.z - src.z, d = Math.hypot(dx, dz) || 1; let nx = src.x + dx / d * 1.6 * dt, nz = src.z + dz / d * 1.6 * dt; const q = separate([{ x: p.x, z: p.z, y: p.y || 0, r: 0.3, ped: p, ch: p.ch }], nx, nz, 0, 0.32, null, 0.55); src.x = q.x; src.z = q.z; };
  for (const mv of seq) { src.x = p.x - S.nx * 0.75; src.z = p.z - S.nz * 0.75; if (p.state !== 'down' && !p.dead) C.punched(p, src, mv); for (let i = 0; i < 0.45 / dt; i++) { if (i < 0.3 / dt) stepIn(); tick(); } k++; } // the attacker keeps stepping in (Player movement pushes people via Bodies.separate)
  if (qi === 0) { p.fighter = true; p.temper = 1; src.x = p.x - S.nx * 0.75; src.z = p.z - S.nz * 0.75; C.punched(p, src, 'jab'); for (let i = 0; i < 3 / dt; i++) { stepIn(); tick(); } } // a man who squares up while the player keeps walking into him
  if (qi === SEQ.length - 1 && !p.dead) { C.kill(p); } for (let i = 0; i < 6 / dt; i++) tick();
  worst.push([maxIn, `spot ${si} ${S.c.kind} (${S.x.toFixed(1)},${S.z.toFixed(1)}) ${seq.length > 1 ? seq.length + ' blows' : seq[0]}: ${bad}`]);
  ok(maxIn < 0.06, `spot ${si} ${S.c.kind} (${S.x.toFixed(1)},${S.z.toFixed(1)}) — ${seq.length > 1 ? seq.length + ' blows' : seq[0]}${qi === SEQ.length - 1 ? ' + killed' : ''}: ${bad}`);
}
worst.sort((a, b) => b[0] - a[0]); console.log('worst:', worst.slice(0, 3).map((w) => w[1]).join('\n       '));
console.log(`punch-wall: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
