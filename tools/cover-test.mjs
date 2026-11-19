// 73rd: taking cover with Q (Node, headless: the real Player on the real city plan + collision).
//  - Q by a building: he moves in to stand with his shoulder to it, the right distance off the face; nothing near: no cover
//  - left / right slide along the face and stop at its end (or carry on along the next section of the same wall)
//  - behind a low wall he crouches (a lower target), and stands up to aim over it
//  - a stopped car is cover too; Q again, or pushing away from it, leaves cover
//   node tools/cover-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.addEventListener ??= () => {};
{ const doc = globalThis.document; if (doc && !doc.addEventListener) doc.addEventListener = () => {}; }
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Collision } = await import('../src/world/Collision.js');
const { Player } = await import('../src/actors/Player.js'); const { Input } = await import('../src/core/Input.js');
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene(); const events = { emit() {}, on() {} };
const P = new Player(scene, new THREE.PerspectiveCamera(), col, events); P.nightLights = false; P.control = true;
let traffic = { all: () => [] };
const frame = (keys = [], press = []) => { for (const k of press) Input.pressed.add(k); for (const k of keys) Input.down.add(k); P.updateFoot(1 / 60, traffic); Input.endFrame(); for (const k of keys) Input.down.delete(k); };
const run = (sec, keys = []) => { for (let i = 0; i < sec * 60; i++) frame(keys); };
const put = (x, z, faceYaw) => { P.cover = null; P.x = x; P.z = z; P.y = col.groundAt(x, z, 0.5); P.yaw = faceYaw; P.camYaw = faceYaw + Math.PI; P.speed = 0; P.ch.anim.set(null); P.crouching = false; P.aiming = false; P.sync(); };
const open = (x, z) => !col.blocked(x, z, 0.45) && !L.isWater(x, z) && !L.roadAt(x, z);
// a box face with open pavement in front of it (x-facing faces: walk along z)
const findFace = (pred) => { for (const c of CP.plan.colliders) { if (!pred(c)) continue; const zc = (c.z0 + c.z1) / 2, x = c.x1 + 0.9; if ((c.z1 - c.z0) < 3) continue;
  let clear = true; for (let dz = -1.2; dz <= 1.2; dz += 0.6) if (!open(x, zc + dz)) clear = false; if (clear && Math.abs(col.groundAt(x, zc, 0.5) - (c.y0 || 0)) < 0.3) return { c, x, zc }; } return null; };
// ---- 1. a building
const B = findFace((c) => c.kind === 'building' && c.h > 6);
ok(!!B, 'found a building face with open pavement in front');
if (B) { put(B.x, B.zc, -Math.PI / 2); frame([], ['KeyQ']); ok(!!P.cover && P.cover.F.box === B.c, 'Q by a building: in cover against it'); run(1);
  const off = P.x - B.c.x1; ok(Math.abs(off - 0.36) < 0.05, `moved in, ${off.toFixed(2)} m off the wall`); ok(P.cover && !P.cover.low && !P.crouching, 'tall cover: standing');
  const z0 = P.z; run(1.5, ['KeyD']); const dz = Math.abs(P.z - z0); ok(dz > 1.2 && Math.abs(P.x - B.c.x1 - 0.36) < 0.05, `slides along the wall (${dz.toFixed(2)} m), staying against it`);
  run(40, ['KeyD']); const zEnd = P.z; ok(zEnd >= P.cover.F.t0 + 0.25 && zEnd <= P.cover.F.t1 - 0.25 && Math.abs(P.x - B.c.x1 - 0.36) < 0.08, `stops at the end of the wall (${(P.cover.F.t1 - P.cover.F.t0).toFixed(1)} m of face), never past it`);
  P.aiming = true; run(0.6); const outD = Math.abs(P.z - zEnd); P.aiming = false; ok(P.cover.edge !== 0 ? outD > 0.3 : true, `aiming at the corner: steps out round it (${outD.toFixed(2)} m)`); run(0.6); ok(Math.abs(P.z - zEnd) < 0.1, 'back into cover after aiming');
  frame([], ['KeyQ']); ok(!P.cover, 'Q again leaves cover');
  put(B.x, B.zc, -Math.PI / 2); frame([], ['KeyQ']); run(0.5); run(0.5, ['KeyS']); ok(!P.cover, 'pushing away from the wall leaves cover');
  // gamepad B (button 1) does the same as Q
  const padB = () => { Input.pad.prev = []; Input.pad.buttons = [false, true]; P.updateFoot(1 / 60, traffic); Input.endFrame(); Input.pad.prev = Input.pad.buttons; Input.pad.buttons = []; };
  put(B.x, B.zc, -Math.PI / 2); padB(); ok(!!P.cover, 'gamepad B by a wall: in cover'); run(0.5); padB(); ok(!P.cover && P.coverLeft, 'gamepad B again: out of cover (and flagged, so it does not also insult anyone)'); }
// ---- 2. a low wall
const W = findFace((c) => (c.kind === 'wall' || c.kind === 'hedge') && c.h > 0.8 && c.h < 1.3);
if (W) { put(W.x, W.zc, -Math.PI / 2); frame([], ['KeyQ']); run(1); ok(P.cover && P.cover.low && P.crouching && P.ch.anim.crouch > 0.8, `behind a ${W.c.h.toFixed(2)} m wall: crouched (crouch ${P.ch.anim.crouch.toFixed(2)})`);
  P.aiming = true; run(0.5); ok(!P.crouching, 'stands up to aim over it'); P.aiming = false; run(0.5); ok(P.crouching, 'and back down'); frame([], ['KeyQ']); }
else ok(false, 'found a low wall');
// ---- 3. nothing near
{ let spot = null; for (let i = 0; i < 400 && !spot; i++) { const x = -600 + (i % 20) * 60, z = -900 + Math.floor(i / 20) * 60; if (open(x, z) && !col.query(x - 2, z - 2, x + 2, z + 2).some((c) => c.h > 0.7)) spot = [x, z]; }
  if (spot) { put(spot[0], spot[1], 0); frame([], ['KeyQ']); ok(!P.cover, 'Q in the open: no cover'); } else ok(false, 'found open ground'); }
// ---- 4. a stopped car
if (B) { const v = new Vehicle('sedan', 3, scene); const x = B.x, z = B.zc; v.place(x + 1.0 + v.T.wid / 2, z, 0); v.speed = 0; traffic = { all: () => [v] }; put(x, z, Math.PI / 2); frame([], ['KeyQ']); run(1);
  ok(P.cover && P.cover.F.kind === 'veh' && P.cover.low && P.crouching, 'a stopped car: crouched behind it'); const s = Math.sin(v.yaw), c = Math.cos(v.yaw); const lx = (P.x - v.x) * c - (P.z - v.z) * s;
  ok(Math.abs(Math.abs(lx) - (v.T.wid / 2 + 0.36)) < 0.06, `against its side (${(Math.abs(lx) - v.T.wid / 2).toFixed(2)} m off)`); v.speed = 3; run(0.1); ok(!P.cover, 'the car drives off: out of cover'); }
console.log(fail ? `FAILED ${fail} / ${pass + fail}` : `ALL PASS (${pass})`); process.exit(fail ? 1 : 0);
