// Fallen-body test (Node, headless): people killed (ragdoll), punched out (knocked down) or hit by a car all over the
// map stay ON the ground: no hip ever below the walkable ground under it, no NaN pose, nobody left hanging in the air,
// for ragdolls and for the knocked-down pose, sampled across every district (pavements, roads, parks, promenades,
// bridges, market streets, railings) and at a low frame rate too.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
const { RagdollWorld } = await import('../src/actors/Ragdoll.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene(); const C = new Crowd(scene, col, { emit() {}, on() {} }); C.prepareSpecs(40); C.max = 40;
const R = new RagdollWorld(col); C.ragdolls = R;
const camDir = { x: 0, z: 1 }; const v = new THREE.Vector3();
// sample points: crowd-graph nodes spread over the map (every district), deterministic
const nodes = L.pedNodes.filter((n) => n.edges && n.edges.length); const pick = []; const want = +(process.env.N || 36);
for (let i = 0; i < want; i++) pick.push(nodes[Math.floor((i + 0.5) / want * nodes.length)]);
const bad = []; let bodies = 0, ragN = 0, downN = 0, worst = 0; const kinds = { kill: 0, punch: 0, car: 0, shot: 0 };
for (const [si, n] of pick.entries()) {
  C.clear(); const focus = { x: n.x, z: n.z }; const dt = si % 3 === 2 ? 1 / 15 : 0.05; // every third site at 15 fps
  const ctx = { simTime: 0, vehicles: [], player: { x: n.x + 300, z: n.z, vehicle: null, ch: null, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1, hour: 11, police: null };
  for (let i = 0; i < 80; i++) { ctx.simTime += 0.1; C.update(0.1, focus, camDir, ctx); }
  const near = C.peds.filter((p) => p.state !== 'down' && p.ch.root.parent && Math.hypot(p.x - n.x, p.z - n.z) < 35).slice(0, 8);
  near.forEach((p, i) => { const k = ['kill', 'punch', 'car', 'shot'][(i + si) % 4]; p.__k = k; kinds[k]++;
    const fx = Math.sin(p.yaw + i), fz = Math.cos(p.yaw + i);
    if (k === 'kill') C.kill(p);
    else if (k === 'punch') { p.ko = 1; p.koAt = C.t; C.punched(p, { x: p.x - fx, z: p.z - fz }, 'hook'); }
    else if (k === 'car') C.knock(p, fx, fz, 9 + (i % 3) * 5);
    else { p.hits = 2; C.kill(p); if (p.ch.rag) p.ch.rag.impulse(fx * 4, 0.6, fz * 4, null); } });
  bodies += near.length;
  for (let s = 0; s < Math.round(12 / dt); s++) { ctx.simTime += dt; C.update(dt, focus, camDir, ctx); R.update(dt, []);
    if (s % 5) continue;
    for (const p of near) { if (!p.ch.root.parent) continue; p.ch.root.updateMatrixWorld(true); const hb = p.ch.bones.hips; hb.getWorldPosition(v);
      const gy = col.groundAt(v.x, v.z, v.y + 0.6); const d = v.y - gy; const nan = !(v.y === v.y);
      if (nan || d < -0.12) { worst = Math.max(worst, nan ? 99 : -d); if (bad.length < 12) bad.push(`${p.__k} @${v.x.toFixed(1)},${v.z.toFixed(1)} hip ${v.y.toFixed(2)} ground ${gy.toFixed(2)} state ${p.state} rag ${!!p.ch.rag} t ${(s * dt).toFixed(1)}s dt ${dt.toFixed(3)} water ${L.isWater(v.x, v.z)}`); } } }
  for (const p of near) { if (p.ch.rag) ragN++; else if (p.state === 'down') downN++;
    if (p.ch.rag) { const P = p.ch.rag.p; for (const q of P) if (!(q.y === q.y)) { if (bad.length < 12) bad.push(`${p.__k} NaN particle`); worst = 99; break; } } }
  if (process.env.V) console.log('site', si, n.x.toFixed(0), n.z.toFixed(0), L.districtIdAt(n.x, n.z), near.length, 'bodies');
}
// ---- special cases, one body each
const fresh = () => { C.clear(); const n = pick[3]; const focus = { x: n.x, z: n.z }; const ctx = { simTime: 0, vehicles: [], player: { x: n.x + 300, z: n.z, vehicle: null, ch: null, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1, hour: 11, police: null };
  for (let i = 0; i < 60; i++) { ctx.simTime += 0.1; C.update(0.1, focus, camDir, ctx); } return C.peds.find((p) => p.state !== 'down' && p.ch.root.parent); };
const settle = (r, sec = 6) => { for (let i = 0; i < sec * 20; i++) R.update(0.05, []); };
// a) thrown into Beira Lake: floats at the surface (−0.55 m), never sinks to the bed out of sight
{ let edge = null; for (let z = -700; z < 400 && !edge; z += 7) for (let x = -400; x < 600; x += 1) if (L.inLake(x + 2, z) && !L.inLake(x, z) && !L.isWater(x - 2, z) && !L.roadAt(x - 2, z)) { edge = [x - 1, z]; break; }
  const p = fresh(); if (edge && p) { p.x = edge[0]; p.z = edge[1]; p.y = col.groundAt(p.x, p.z, 0.5); p.ch.root.position.set(p.x, p.y, p.z); p.ch.root.updateMatrixWorld(true);
    R.add(p.ch, { vel: [7, 2.5, 0] }); settle(p.ch.rag, 8); const P = p.ch.rag.pelvis();
    ok(L.inLake(P.x, P.z) && P.y > -0.75 && P.y < -0.2, `a body thrown into Beira Lake floats at the surface (pelvis y ${P.y.toFixed(2)} in lake ${L.inLake(P.x, P.z)})`); }
  else ok(false, 'found a lake edge to test'); }
// b) killed while seated in a moving, turned car: taken out into the world where they are, lands on the ground there
{ const p = fresh(); const car = new THREE.Group(); car.position.set(p.x + 3, 0.2, p.z - 2); car.rotation.y = 1.1; scene.add(car); car.updateMatrixWorld(true);
  p.ch.root.updateMatrixWorld(true); const w0 = p.ch.bones.hips.getWorldPosition(new THREE.Vector3()); car.attach(p.ch.root); p.ch.root.updateMatrixWorld(true);
  const w1 = p.ch.bones.hips.getWorldPosition(new THREE.Vector3()); C.peds.splice(C.peds.indexOf(p), 1);
  const r = R.add(p.ch, { vel: [0, 0, 0] }); settle(r, 5); const P = r.pelvis(); const gy = col.groundAt(P.x, P.z, P.y + 0.5);
  ok(p.ch.root.parent === scene && Math.hypot(P.x - w1.x, P.z - w1.z) < 1.2 && P.y > gy && P.y < gy + 0.45, `a body taken out of a car stays where it was and lies on the ground (moved ${Math.hypot(P.x - w0.x, P.z - w0.z).toFixed(2)} m, pelvis ${(P.y - gy).toFixed(2)} m above ground)`); }
// c) safety net: a NaN pose is restored; a body pushed 1 m under the ground is lifted back onto it
{ const p = fresh(); C.kill(p); const r = p.ch.rag; settle(r, 3); const good = r.pelvis().clone(); r.asleep = false; r.p[3].set(NaN, NaN, NaN); R.update(0.05, []);
  ok(r.p.every((q) => q.y === q.y) && r.pelvis().distanceTo(good) < 0.3, 'a ragdoll pose that went NaN is restored to its last good pose');
  r.asleep = false; for (const q of r.p) q.y -= 1.0; for (let i = 0; i < r.o.length; i++) r.o[i].copy(r.p[i]); r.gy.fill(-5); R.update(0.05, []); settle(r, 2); const P = r.pelvis(); const gy = col.groundAt(P.x, P.z, P.y + 0.5);
  ok(P.y > gy && P.y < gy + 0.45, `a body pushed under the ground is lifted back onto it (pelvis ${(P.y - gy).toFixed(2)} m above ground)`); }
console.log(`bodies ${bodies} (${JSON.stringify(kinds)}), ragdolls ${ragN}, still down ${downN}, worst sink ${(worst * 100).toFixed(0)} cm`);
for (const b of bad) console.log('  ', b);
ok(bodies > 100, `enough bodies sampled across the map (${bodies} at ${pick.length} sites)`);
ok(bad.length === 0, `no fallen body sinks below the ground or goes NaN (${bad.length} bad samples, worst ${(worst * 100).toFixed(0)} cm)`);
console.log(`fall test: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
