// Grenade reactions (Node, headless) on the real city plan, collision, ragdolls and PoliceResponse (54th):
//  - an officer who sees a grenade land far off braces (back to it, arms over the head / crouched behind cover)
//  - close with time left: he runs to a spot out of its line of sight or a safe distance away — never towards it
//  - close with no time: he dives away (ragdoll, face down), stays down until it has gone off, then gets up on his own
//  - a grenade he cannot see (behind a wall) is not reacted to; one still climbing is not reacted to
//  - thrown by a blast (PoliceResponse.blastKnock / Crowd-style ragdoll): carried away from the charge, lands, gets up
//  - the peaked cap comes off in falls/blasts and settles on the ground (LooseCaps); nothing NaN anywhere
//   node tools/grenade-react-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.addEventListener ??= () => {};
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Collision } = await import('../src/world/Collision.js');
const { Traffic } = await import('../src/vehicles/Traffic.js');
const { PoliceResponse } = await import('../src/police/PoliceResponse.js');
const { Character } = await import('../src/actors/Character.js'); const { makePoliceAppearance } = await import('../src/actors/Appearance.js');
const { RagdollWorld } = await import('../src/actors/Ragdoll.js'); const { LooseCaps } = await import('../src/actors/LooseCaps.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };

const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene(); const T = new Traffic(scene, col, { emit() {}, on() {} }); T.max = 0;
const playerCh = new Character(makePoliceAppearance(91, 'patrol')); scene.add(playerCh.root);
const player = { x: 0, z: 0, y: 0, yaw: 0, vehicle: null, speed: 0, crouching: false, control: true, ch: playerCh, stamina: 1, events: { on() {} }, camOverride: false, teleport() {}, snapCamera() {} };
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
const ragdolls = new RagdollWorld(col); const caps = new LooseCaps(scene, col); ragdolls.caps = caps;
const grenades = { live: [] };
const g = { scene, traffic: T, collision: col, camera, player, mode: 'play', clock: 0, timeSlow: 1, indoor: false, crowd: { peds: [], alarm() {} }, director: { active: false }, ragdolls, caps, grenades,
  hud: { notify() {}, subtitle() {}, show() {}, hurt() {}, fade: async () => {}, root: { classList: { contains: () => false } } },
  story: { state: { money: 60000, health: 100 }, pay() {}, safeSpot: (x, z) => [x, z], running: false, conds: [], fail() { return new Error('x'); } },
  atmos: { night: 0, hour: 14, day: 1, w: { rain: 0 }, advance() {} }, squad: { activeMember: { def: { full: 'Dineth Perera' } } }, weapons: null, events: { emit() {}, on() {} } };
const police = new PoliceResponse(g); g.police = police; police.patrolCd = 1e9; const ff = police.ff;
police.level = 2; police.state = 'pursuing';
const unit = { v: null, officers: [] };
const mkOfficer = (x, z, yaw, seed = 1) => { const ch = new Character(makePoliceAppearance(7000 + seed * 13, 'patrol')); scene.add(ch.root); const o = { ch, unit, mode: 'foot', x, z, y: col.groundAt(x, z, 0.5), yaw, t: 0, hits: 0, acc: 0 }; ff.arm(o); police.placeOfficer(o); return o; };
const fin = (o) => [o.x, o.y, o.z, o.yaw].every(Number.isFinite) && (!o.ch.rag || o.ch.rag.p.every((p) => Number.isFinite(p.x + p.y + p.z)));
const DT = 1 / 30;
const step = (o, n, after = null) => { let bad = false; for (let i = 0; i < n; i++) { police.t += DT; for (const gr of grenades.live) gr.fuse -= DT; ragdolls.update(DT, []); caps.update(DT, [], player); police.updateOfficer(o, unit, DT); if (!fin(o)) bad = true; if (after && after(i)) break; } return !bad; };
const mkGrenade = (x, z, fuse = 2.5, extra = {}) => { const gr = { p: new THREE.Vector3(x, col.groundAt(x, z, 0.5) + 0.04, z), v: new THREE.Vector3(), fuse, rest: true, onGround: true, water: false, gone: false, ...extra }; grenades.live.push(gr); return gr; };
const boom = (gr) => { gr.gone = true; grenades.live = grenades.live.filter((q) => q !== gr); };
const remove = (o) => { if (o.ch.rag) { ragdolls.remove(o.ch.rag); o.ch.rag = null; } scene.remove(o.ch.root); };

// an open, flat, dry square: 30 m with nothing solid in it
const open = (x, z) => { for (let a = 0; a < 16; a++) for (const r of [0, 4, 8, 12, 15]) { const px = x + Math.sin(a / 16 * 6.283) * r, pz = z + Math.cos(a / 16 * 6.283) * r; if (col.blocked(px, pz, 0.5) || L.isWater(px, pz) || Math.abs(col.groundAt(px, pz, 0.5) - col.groundAt(x, z, 0.5)) > 0.05) return false; } return true; };
let S = null; for (let x = -600; x < 600 && !S; x += 9) for (let z = -1100; z < 900 && !S; z += 9) if (open(x, z)) S = { x, z };
ok(!!S, 'found an open flat square for the test');
const cx = S.x, cz = S.z;

// ---- 1. far (11 m): braces, back to the grenade, never moves towards it
{ const o = mkOfficer(cx, cz, Math.PI, 1); const gr = mkGrenade(cx, cz - 11, 2.5); let d0 = null; // (until he has taken it in he carries on with what he was doing)
  const fine = step(o, 45, () => { if (d0 === null && o.evade && o.evade.kind) d0 = Math.hypot(o.x - gr.p.x, o.z - gr.p.z); return false; }); d0 ??= 0; const A = o.ch.anim; const face = Math.atan2(o.x - gr.p.x, o.z - gr.p.z); const dyaw = Math.abs(Math.atan2(Math.sin(o.yaw - face), Math.cos(o.yaw - face)));
  ok(fine, 'brace: nothing NaN'); ok(A.action === 'cower' || A.action === 'cover', `brace: officer 11 m away braces (action ${A.action})`);
  ok(dyaw < 0.3, `brace: back turned to the grenade (|Δyaw| ${dyaw.toFixed(2)})`); ok(d0 > 0 && Math.hypot(o.x - gr.p.x, o.z - gr.p.z) >= d0 - 0.05, 'brace: never closer to the grenade once he has seen it');
  boom(gr); step(o, 10); ok(!o.evade && A.action !== 'cower', `brace: once it has gone off he stands up again (action ${A.action})`); remove(o); }

// ---- 2. close (4 m), 3 s of fuse: runs to a safe spot (≥ 9.5 m or out of its line of sight) before it goes off
{ const o = mkOfficer(cx, cz, 0, 2); const gr = mkGrenade(cx + 4, cz, 3.0); const d0 = 4; let minD = 9, maxSp = 0, px = o.x, pz = o.z;
  const fine = step(o, Math.round(2.8 / DT), () => { const d = Math.hypot(o.x - gr.p.x, o.z - gr.p.z); minD = Math.min(minD, d); maxSp = Math.max(maxSp, Math.hypot(o.x - px, o.z - pz) / DT); px = o.x; pz = o.z; return false; });
  const d = Math.hypot(o.x - gr.p.x, o.z - gr.p.z); const hidden = col.raycast(gr.p.x, gr.p.y + 0.25, gr.p.z, o.x, (o.y || 0) + 0.7, o.z, 0.02, true) < 0.95;
  ok(fine, 'run: nothing NaN'); ok(police.stats.grenadeRun >= 1 || o.mode === 'blown', `run: chose to run (runs ${police.stats.grenadeRun || 0}, mode ${o.mode})`);
  ok(d >= 9.4 || hidden || o.mode === 'blown', `run: safe when it goes off — ${d.toFixed(1)} m away${hidden ? ', out of sight' : ''}`);
  ok(minD > d0 - 0.6, `run: never ran towards it (closest ${minD.toFixed(2)} m from a start of ${d0} m)`); ok(maxSp < 7.5, `run: a human sprint (peak ${maxSp.toFixed(1)} m/s)`);
  boom(gr); step(o, 90, () => o.mode === 'foot' && !o.evade); ok(o.mode === 'foot', `run: back to normal duty after the blast (mode ${o.mode})`); remove(o); }

// ---- 3. close (2 m), 0.5 s: no time — dives away, face down, stays down until it has gone off, then gets up
{ const o = mkOfficer(cx, cz, 0, 3); const gr = mkGrenade(cx, cz + 2, 0.9); const s0 = police.stats.grenadeDive || 0;
  let fine = step(o, 22); ok(o.mode === 'blown' && !!o.ch.rag, `dive: officer went down (mode ${o.mode}, dives ${(police.stats.grenadeDive || 0) - s0})`);
  const p0 = o.ch.rag ? o.ch.rag.pelvis().clone() : new THREE.Vector3(o.x, 0, o.z);
  fine = step(o, 30) && fine; const P = o.ch.rag ? o.ch.rag.pelvis() : p0; const away = (P.z - cz) < -0.4;
  ok(away, `dive: carried away from the grenade (pelvis dz ${(P.z - cz).toFixed(2)} m, grenade at +2)`);
  const r = o.ch.rag; const chest = r && r.part('chest'), pel = r && r.pelvis(); const fwd = new THREE.Vector3(Math.sin(o.yaw), 0, Math.cos(o.yaw));
  if (r) { const head = r.part('head'); ok(head.clone().sub(pel).dot(fwd) > 0.3, `dive: lands head-first away from it (head ${head.clone().sub(pel).dot(fwd).toFixed(2)} m ahead of the pelvis)`); }
  ok(o.mode === 'blown', 'dive: stays down while the grenade is live'); boom(gr);
  let upAt = -1; fine = step(o, Math.round(25 / DT), (i) => { if (o.mode === 'foot') { upAt = i * DT; return true; } return false; }) && fine;
  ok(fine, 'dive: nothing NaN through the fall and the get-up'); ok(upAt > 0, `dive: back on his feet on his own after the blast (${upAt.toFixed(1)} s)`);
  ok(!o.ch.rag, 'dive: ragdoll released'); ok(Math.abs(o.y - col.groundAt(o.x, o.z, o.y + 0.5)) < 0.05, `dive: standing on the ground (y ${o.y.toFixed(2)})`);
  void chest; remove(o); }

// ---- 4. a grenade he cannot see (behind a wall) / one still climbing: no reaction
{ let wall = null; for (const c of CP.plan.colliders) { if (c.h < 3 || (c.x1 - c.x0) < 4 || (c.x1 - c.x0) > 30 || (c.z1 - c.z0) < 4) continue; const zc = (c.z0 + c.z1) / 2;
    const ax = c.x0 - 2.5, bx = c.x1 + 2.5; if ((c.x1 - c.x0) + 5 > 15) continue; if (!col.blocked(ax, zc, 0.6) && !col.blocked(bx, zc, 0.6) && !L.isWater(ax, zc) && !L.isWater(bx, zc) && col.raycast(ax, 1.6, zc, bx, 0.2, zc, 0.05) < 0.97) { wall = { ax, bx, zc }; break; } }
  ok(!!wall, 'found a wall for the hidden-grenade case');
  if (wall) { const o = mkOfficer(wall.ax, wall.zc, -Math.PI / 2, 4); const gr = mkGrenade(wall.bx, wall.zc, 2.0); step(o, 30); ok(!o.evade && o.mode === 'foot' && o.ch.anim.action !== 'cower', 'hidden: no reaction to a grenade behind a wall'); boom(gr); remove(o); }
  const o = mkOfficer(cx, cz, 0, 5); const gr = mkGrenade(cx, cz + 5, 3, { rest: false, onGround: false, v: new THREE.Vector3(0, 4, 2) }); gr.p.y += 3; police.evadeGrenade(o, DT);
  ok(!o.evade, 'climbing: a grenade still rising is not reacted to'); boom(gr); remove(o); }

// ---- 5. thrown by a blast: away from the charge, lands, cap off and on the ground, gets up
{ let capsOff = 0, capsGround = 0, ups = 0, nan = 0, awayN = 0; const N = 6; const k0 = caps.stats.knocked;
  for (let k = 0; k < N; k++) { const o = mkOfficer(cx + (k % 3) * 0.3, cz + (k % 2) * 0.3, k, 10 + k); const a = k * 1.05; const ux = Math.sin(a), uz = Math.cos(a);
    const f = 0.35 + 0.1 * k; police.blastKnock(o, ux, uz, f, false); if (o.mode !== 'blown') { nan++; remove(o); continue; }
    let land = null; const fine = step(o, Math.round(18 / DT), (i) => { if (!land && i > 30 && o.ch.rag) land = o.ch.rag.pelvis().clone(); return o.mode === 'foot'; });
    if (!fine) nan++; if (o.mode === 'foot') ups++; if (land && (land.x - cx) * ux + (land.z - cz) * uz > 1.0) awayN++;
    if (o.ch.capOff) { capsOff++; const c = o.ch._looseCap; if (c) { const gy = col.groundAt(c.mesh.position.x, c.mesh.position.z, c.mesh.position.y + 0.5); if (c.mesh.position.y - gy < 0.2 && c.mesh.position.y - gy > -0.02) capsGround++; } }
    remove(o); }
  ok(nan === 0, `blast: nothing NaN (${N} officers)`); ok(awayN >= N - 1, `blast: carried away from the charge (${awayN}/${N} landed > 1 m out along the blast direction)`);
  ok(ups === N, `blast: every officer got up again on his own (${ups}/${N})`); ok(capsOff >= Math.floor(N / 2) && caps.stats.knocked - k0 === capsOff, `blast: caps came off (${capsOff}/${N}) and stay off after he gets up (no pop back onto the head)`); ok(capsGround === capsOff, `blast: every loose cap rests on the ground (${capsGround}/${capsOff})`); }

// ---- 6. pedestrians thrown by a blast (Crowd.blastKnock): ragdoll away from the charge, lie a few seconds, get up, no NaN
{ const { Crowd } = await import('../src/actors/Crowd.js');
  const C = new Crowd(new THREE.Scene(), col, { emit() {}, on() {} }); C.max = 6; C.prepareSpecs(6); C.ragdolls = new RagdollWorld(col);
  const focus = { x: cx, z: cz }; const ctx = { simTime: 0, vehicles: [], player: { x: cx + 40, z: cz, vehicle: null, ch: null }, bodies: [], hourFactor: 1, hour: 12 };
  for (let i = 0; i < 120 && C.peds.length < 4; i++) C.update(DT, focus, [0, 1], ctx);
  const peds = C.peds.slice(0, 4); ok(peds.length >= 3, `crowd: ${peds.length} pedestrians spawned for the blast case`);
  peds.forEach((p, k) => { const a = k * 1.6; p.x = cx + Math.sin(a) * 3; p.z = cz + Math.cos(a) * 3; p.y = col.groundAt(p.x, p.z, 0.5); p.keep = true; p.ch.root.position.set(p.x, p.y, p.z); p.ch.root.updateMatrixWorld(true); p.ux = Math.sin(a); p.uz = Math.cos(a); });
  for (const p of peds) C.blastKnock(p, p.ux, p.uz, 0.6);
  ok(peds.every((p) => p.koRag && p.ch.rag), 'crowd: every pedestrian in the ring became a ragdoll');
  let nan = false; const out = new Map(), up = new Map();
  for (let i = 0; i < Math.round(22 / DT); i++) { C.ragdolls.update(DT, []); C.update(DT, focus, [0, 1], ctx);
    for (const p of peds) { if (![p.x, p.z].every(Number.isFinite) || (p.ch.rag && !p.ch.rag.p.every((q) => Number.isFinite(q.x + q.y + q.z)))) nan = true;
      if (i === 45) out.set(p, (p.x - cx) * p.ux + (p.z - cz) * p.uz); if (!up.has(p) && !p.koRag && i > 10) up.set(p, i * DT); } }
  ok(!nan, 'crowd: nothing NaN'); const outs = peds.map((p) => out.get(p) ?? 0); ok(outs.every((d) => d > 4), `crowd: thrown away from the charge (radial ${outs.map((d) => d.toFixed(1)).join(', ')} m, started at 3 m)`);
  ok(up.size === peds.length, `crowd: all got up again on their own (${[...up.values()].map((t) => t.toFixed(1)).join(', ')} s)`); }

console.log(`grenade-react-test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
