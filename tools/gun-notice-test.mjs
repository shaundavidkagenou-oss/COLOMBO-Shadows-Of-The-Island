// 73rd: civilians notice the player carrying a drawn gun (Node, headless, real city plan + collision + crowd):
//  - nobody reacts while the gun is holstered; with it drawn the people around notice — in different ways (a stare and a wide
//    berth, backing off, running, ringing someone, warning others), not as a herd
//  - nobody phones the police over it (no wanted level for carrying), and the sight checks stay cheap (≤ 2 rays per check)
//  - someone with a wall between them and the player does not notice
//   node tools/gun-notice-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
const col = new Collision(); col.addAll(CP.plan.colliders); let rays = 0; const rc = col.raycast.bind(col); col.raycast = (...a) => { rays++; return rc(...a); };
const reports = []; const lines = []; const C = new Crowd(new THREE.Scene(), col, { emit(n, e) { if (n === 'pedReport') reports.push(e); if (n === 'npcLine' && e.cat === 'gunSeen') lines.push(e.line); }, on() {} }); C.prepareSpecs(60); C.max = 110;
const S = { x: -300, z: -300 }; const focus = { x: S.x, z: S.z };
const player = { x: S.x, z: S.z, y: 0, vehicle: null, ch: null, yaw: 0, speed: 0 };
const ctx = { simTime: 0, vehicles: [], player, bodies: [], hourFactor: 1, hour: 10, armed: false, aiming: false };
const run = (sec, each) => { for (let i = 0; i < sec * 10; i++) { ctx.simTime += 0.1; C.update(0.1, focus, { x: 0, z: 1 }, ctx); if (each) each(i); } };
run(60); // populate
// stand where people pass: the busiest pavement point near the focus
const near = (r) => C.peds.filter((p) => Math.hypot(p.x - player.x, p.z - player.z) < r).length;
let best = null; for (const p of C.peds) { const n = C.peds.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 14).length; if (!best || n > best[0]) best = [n, p.x, p.z]; } player.x = best[1] + 0.8; player.z = best[2]; focus.x = player.x; focus.z = player.z;
C.stats.gunSeen = 0; run(30); ok((C.stats.gunSeen || 0) === 0, `gun holstered: nobody reacts (${C.stats.gunSeen || 0}; ${near(18)} people within 18 m)`);
ctx.armed = true; rays = 0; let checks = 0, maxRaysPerCheck = 0, prevRays = 0;
run(60, () => { if (C.gunT >= 0.24) { checks++; maxRaysPerCheck = Math.max(maxRaysPerCheck, rays - prevRays); } prevRays = rays; if (Math.random() < 0.02) { player.x += (Math.random() - 0.5) * 6; player.z += (Math.random() - 0.5) * 6; if (col.blocked(player.x, player.z, 0.4)) { player.x = best[1]; player.z = best[2]; } } });
const st = C.stats; const kinds = ['stare', 'wary', 'flee', 'phone', 'warn'].filter((k) => st['gun_' + k] > 0);
console.log('  ', JSON.stringify(Object.fromEntries(Object.entries(st).filter(([k]) => k.startsWith('gun')))), 'lines:', lines.slice(0, 4).map((l) => l.en || l.tr).join(' | '));
ok(st.gunSeen >= 5, `with the gun drawn, people around notice (${st.gunSeen})`);
ok(kinds.length >= 3, `in different ways (${kinds.join(', ')})`);
ok(reports.filter((r) => r && r.ped && r.ped.repPlayer !== false).length === 0 && reports.length === 0, `nobody calls the police over it (${reports.length} reports)`);
ok(maxRaysPerCheck <= 2, `cheap: at most ${maxRaysPerCheck} sight rays per check`);
// behind a wall: a ped facing the player through a building never notices
let wall = null; for (const c of CP.plan.colliders) { if (c.h < 6 || (c.x1 - c.x0) < 6 || (c.x1 - c.x0) > 20 || (c.z1 - c.z0) < 6) continue; const zc = (c.z0 + c.z1) / 2, ax = c.x0 - 3, bx = c.x1 + 3; if ((bx - ax) > 17 || col.blocked(ax, zc, 0.5) || col.blocked(bx, zc, 0.5)) continue; if (rc(ax, 1.6, zc, bx, 1.25, zc, 0.1) < 0.97) { wall = { ax, bx, zc }; break; } }
if (wall && C.peds.length) { const p = C.peds[0]; C.react(p, 'idle', 0); p.state = 'idle'; p.timer = 1e9; p.gunSeen = -1e9; p.x = wall.ax; p.z = wall.zc; p.yaw = Math.PI / 2; player.x = wall.bx; player.z = wall.zc; let seen = 0; const n0 = st.gunSeen; for (let k = 0; k < 40; k++) { C.gunT = 0; C.noticeGun(0.25, player, false); if (p.gunSeen > 0) seen++; } ok(seen === 0, `nobody notices through a ${(wall.bx - wall.ax).toFixed(0)} m building (${seen}; others ${st.gunSeen - n0})`); }
else ok(false, 'found a wall for the sight test');
console.log(fail ? `FAILED ${fail} / ${pass + fail}` : `ALL PASS (${pass})`); process.exit(fail ? 1 : 0);
