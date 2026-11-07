// Grenade physics + rules test (Node, headless): a thrown grenade bounces off a wall, lands on top of a table, bonks off a
// car roof, rolls to rest on the ground, sinks in water, and detonates when its fuze runs out; per-character counts / cap.
import './node-dom-stub.mjs';
import * as THREE from 'three';
if (!globalThis.addEventListener) globalThis.addEventListener = () => {};
if (!document.addEventListener) document.addEventListener = () => {}; if (!globalThis.localStorage) { const m = new Map(); globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
if (!document.head) document.head = { appendChild() {} }; if (!document.body) document.body = { appendChild() {} }; if (!document.getElementById) document.getElementById = () => null;
const { Grenades } = await import('../src/combat/Grenades.js');
const { GRENADE, GRENADE_CAP } = await import('../src/combat/Shop.js');
const L = await import('../src/world/Layout.js');

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
// a quiet, dry, flat test spot (no water, no ground slope)
let X0 = null; for (let x = -400; x < 400 && !X0; x += 7) for (let z = -900; z < 900; z += 7) { if (L.isWater(x, z)) continue; const g = L.surfaceY(x, z); if (Math.abs(L.surfaceY(x + 12, z) - g) < 0.01 && Math.abs(L.surfaceY(x - 12, z) - g) < 0.01 && Math.abs(L.surfaceY(x, z + 12) - g) < 0.01 && !L.isWater(x + 12, z)) { X0 = { x, z, g }; break; } }
ok(!!X0, 'found a flat test spot');
const { x: x0, z: z0, g: gy } = X0;
const boxes = [];
const collision = { query: (ax, az, bx, bz) => boxes.filter((c) => c.x1 >= ax && c.x0 <= bx && c.z1 >= az && c.z0 <= bz) };
const blasts = []; const members = [{ grenades: 3, def: { name: 'A' } }, { grenades: 0, def: { name: 'B' } }]; let active = 0;
const game = { scene: new THREE.Scene(), collision, traffic: null, crowd: null, camera: new THREE.PerspectiveCamera(), hud: null, weapons: null,
  squad: { get activeMember() { return members[active]; } }, explosions: { blast: (p, o) => blasts.push({ p, o }) } };
const G = new Grenades(game);
const run = (sec) => { for (let t = 0; t < sec; t += 1 / 60) G.physics(1 / 60); };

// counts are per character, capped
ok(G.count === 3, 'count reads the active character'); active = 1; ok(G.count === 0, 'switching character switches the count'); G.count = 99; ok(members[1].grenades === GRENADE_CAP, 'count is capped'); active = 0;

// 1) straight at a wall 4 m away: bounces back, ends up resting on the ground, then explodes on its fuze
boxes.push({ x0: x0 + 4, x1: x0 + 5, z0: z0 - 5, z1: z0 + 5, h: 6, kind: 'building' });
let o = G.spawnLive(new THREE.Vector3(x0, gy + 1.5, z0), new THREE.Vector3(12, 1, 0), 'player', 'thrown');
let maxX = -1e9; for (let t = 0; t < 3.5; t += 1 / 60) { G.physics(1 / 60); maxX = Math.max(maxX, o.p.x); }
ok(maxX < x0 + 4, `never passes through the wall (max x ${(maxX - x0).toFixed(2)})`); ok(o.p.x < x0 + 3.9 && o.v.x <= 0.01, 'bounced back off the wall');
ok(Math.abs(o.p.y - (gy + 0.034)) < 0.02, `rests on the ground (y ${(o.p.y - gy).toFixed(3)})`); ok(o.rest, 'comes to rest (rolling friction)'); ok(o.bounces >= 2, `bounced (${o.bounces})`);
ok(blasts.length === 0, 'not exploded before the fuze'); run(GRENADE.fuse - 3.5 + 0.1); ok(blasts.length === 1 && !G.live.length, 'detonates when the fuze runs out, removed from the world');
ok(blasts[0] && blasts[0].o.source === 'player', 'blast carries the thrower');
boxes.length = 0;

// 2) lobbed onto a table (top 0.8 m): lands and stays on top
boxes.push({ x0: x0 + 2, x1: x0 + 4, z0: z0 - 1, z1: z0 + 1, h: 0.8, y0: gy, kind: 'prop' });
o = G.spawnLive(new THREE.Vector3(x0, gy + 1.6, z0), new THREE.Vector3(3.2, 3, 0), 'player', 'thrown'); run(2.5);
ok(o.p.x > x0 + 2 && o.p.x < x0 + 4 && Math.abs(o.p.y - (gy + 0.8 + 0.034)) < 0.03, `lands on the table top (x ${(o.p.x - x0).toFixed(2)}, y ${(o.p.y - gy).toFixed(2)})`);
G.clear(); boxes.length = 0;

// 3) dropped onto a car roof: bounces up off it, ends on the ground beside or on the roof — never inside the body
const car = { x: x0 + 3, z: z0, y: gy, yaw: 0, T: { wid: 1.8, len: 4.4, hgt: 1.5 } }; game.traffic = { all: () => [car] };
o = G.spawnLive(new THREE.Vector3(x0 + 3, gy + 4, z0 + 0.2), new THREE.Vector3(0, -2, 0.4), 'player', 'thrown');
let upAfterRoof = false, inside = false; let prevVy = 0;
for (let t = 0; t < 3; t += 1 / 60) { G.physics(1 / 60); if (o.p.y > gy + 1.4 && prevVy < 0 && o.v.y > 0) upAfterRoof = true; const lx = o.p.x - car.x, lz = o.p.z - car.z; if (Math.abs(lx) < 0.85 && Math.abs(lz) < 2.15 && o.p.y > gy + 0.2 && o.p.y < gy + 1.45) inside = true; prevVy = o.v.y; }
ok(upAfterRoof, 'bounces off the car roof'); ok(!inside, 'never ends up inside the vehicle body');
G.clear(); game.traffic = null;

// 4) a dropped (pin-pulled, interrupted) grenade is live with no lever
o = G.spawnLive(new THREE.Vector3(x0, gy + 1, z0), new THREE.Vector3(0, 0.5, 0), 'player', 'dropped'); ok(!o.m.userData.spoon.visible, 'dropped grenade: lever already gone'); run(GRENADE.fuse + 0.2); ok(blasts.length === 2, 'dropped grenade still goes off');

// 5) water: sinks (slowed), still detonates (as an underwater blast)
let W = null; for (let x = -1200; x < 1200 && !W; x += 9) for (let z = -1500; z < 1500; z += 9) if (L.isWater(x, z) && L.isWater(x + 6, z) && L.isWater(x - 6, z) && !(L.bridgeWalkAt && L.bridgeWalkAt(x, z))) { W = { x, z }; break; }
if (W) { o = G.spawnLive(new THREE.Vector3(W.x, L.groundY(W.x, W.z) + 2, W.z), new THREE.Vector3(1, 0, 0), 'player', 'thrown'); run(1); ok(o.water, 'lands in the water'); run(GRENADE.fuse); ok(blasts.length === 3 && blasts[2].o.power < 1, 'underwater blast is weaker'); }
else ok(true, 'no water found (skipped)');

console.log(`grenades: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
