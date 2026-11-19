// 73rd: a traffic officer on point duty and a wanted suspect (Node, headless, on the real city plan, collision, traffic and
// PoliceResponse):
//  - he only reacts when he can actually see the suspect (one ray every 0.4 s)
//  - he turns to face them (stepping round, not snapping), points and shouts
//  - he pulls off his right gauntlet (the hand underneath is bare skin) and flings it down: it falls and lies on the road
//  - he runs to his motorcycle, steps over it, kicks the stand up and joins the chase as a one-man unit (no rifle)
//  - if it is over before he is on the bike, he walks back to the glove, picks it up, pulls it on and returns to his post
//   node tools/traffic-chase-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Collision } = await import('../src/world/Collision.js');
const { Traffic } = await import('../src/vehicles/Traffic.js');
const { PoliceResponse } = await import('../src/police/PoliceResponse.js');
const { TrafficDuty } = await import('../src/police/TrafficDuty.js');
const { Character } = await import('../src/actors/Character.js'); const { makePoliceAppearance } = await import('../src/actors/Appearance.js');
const { Health } = await import('../src/actors/Health.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };

const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene(); const T = new Traffic(scene, col, { emit() {}, on() {} }); T.max = 0;
const playerCh = new Character(makePoliceAppearance(91, 'patrol')); scene.add(playerCh.root);
const player = { x: 0, z: 0, y: 0, yaw: 0, vehicle: null, speed: 0, crouching: false, control: true, ch: playerCh, stamina: 1, events: { on() {} }, camOverride: false,
  teleport(x, z, yaw = 0) { this.x = x; this.z = z; this.yaw = yaw; this.y = col.groundAt(x, z, 0.5); this.ch.root.position.set(x, this.y, z); this.ch.root.rotation.y = yaw; }, snapCamera() {} };
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000);
const g = { scene, traffic: T, collision: col, camera, player, mode: 'play', clock: 0, timeSlow: 1, indoor: false, crowd: { peds: [], alarm() {} }, director: { active: false },
  hud: { notify() {}, subtitle() {}, show() {}, hurt() {}, fade: async () => {}, root: { classList: { contains: () => false } } },
  story: { state: { money: 60000, health: 100 }, pay() {}, safeSpot: (x, z) => [x, z], running: false, conds: [], fail() { return new Error('x'); } },
  atmos: { night: 0, hour: 10, day: 1, w: { rain: 0 }, advance() {} }, squad: { activeMember: { def: { full: 'Dineth Perera' } } }, weapons: null, events: { emit() {}, on() {} }, hqLife: null };
g.health = new Health(g);
const police = new PoliceResponse(g); g.police = police; police.patrolCd = 1e9; police.spawnUnit = () => null; // (only the traffic officer comes)
const D = new TrafficDuty(g);
const finite = (...a) => a.every(Number.isFinite);
const step = (sec, each) => { for (let i = 0; i < sec * 20; i++) { const dt = 0.05; g.clock += dt; D.update(dt); police.update(dt); T.update(dt, player, null, g.clock, [], null); camera.position.set(player.x, 3, player.z + 6); if (each && each()) return true; } return false; };

// a post with its motorcycle and open ground in sight of it, 14 m away
const spotFor = (p) => { for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, x = p.x + Math.sin(a) * 14, z = p.z + Math.cos(a) * 14;
  if (col.blocked(x, z, 0.5) || L.isWater(x, z)) continue; const y0 = L.groundY(p.x, p.z) + 1.6; if (col.raycast(p.x, y0, p.z, x, L.groundY(x, z) + 1.3, z, 0.1) < 0.97) continue; return [x, z]; } return null; };
const posts = D.posts.filter((p) => D.bikeSpotFor(p) && spotFor(p));
ok(posts.length >= 2, `posts with a motorcycle spot and open ground in view (${posts.length})`);

// ---------------------------------------------------------------- 1. the chase
const p = posts[0]; player.teleport(p.x + 60, p.z); step(1.5); ok(p.on && p.state === 'duty' && p.bike, 'officer on point duty, his motorcycle on its stand nearby');
const [sx, sz] = spotFor(p); player.teleport(sx, sz);
police.level = 2; police.state = 'pursuing';
const seen = []; let bareSeen = false, gloveRest = null, maxTurn = 0, prevYaw = p.pyaw, nan = false;
step(40, () => { if (seen[seen.length - 1] !== p.state) seen.push(p.state); if (p.ch && p.ch.bare) bareSeen = true;
  if (p.state === 'alert') { maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(p.pyaw - prevYaw), Math.cos(p.pyaw - prevYaw))) / 0.05); prevYaw = p.pyaw; }
  for (const G of D.gloves) if (G.rest) gloveRest = G; if (p.ch && !finite(p.ch.root.position.x, p.ch.root.position.z)) nan = true; return p.state === 'chase' && police.units.some((u) => u.bike); });
console.log('  states:', seen.join(' → '), '| notes:', D.log.slice(-6).join(' | '));
ok(seen.includes('alert'), 'he sees the wanted suspect and stops directing traffic');
ok(maxTurn > 0 && maxTurn < 6, `turns to face them at a human rate (max ${maxTurn.toFixed(2)} rad/s), not snapping round`);
ok(seen.includes('glove') && bareSeen, 'pulls off his right gauntlet (bare hand underneath)');
ok(!!gloveRest, 'the glove is flung down and lies on the road');
if (gloveRest) { const m = gloveRest.m; const gy = L.groundY(m.position.x, m.position.z); ok(Math.abs(m.position.y - gy) < 0.05 && Math.hypot(m.position.x - p.px, m.position.z - p.pz) < 5, `lying on the ground at his feet (${(m.position.y - gy).toFixed(3)} m above it, ${Math.hypot(m.position.x - p.px, m.position.z - p.pz).toFixed(1)} m from his post)`); }
ok(['toBike', 'mount', 'kick', 'pull'].every((s) => seen.includes(s)), 'runs to the motorcycle, gets on, kicks the stand up, pulls out');
const u = police.units.find((q) => q.bike);
ok(!!u && p.state === 'chase' && u.v && u.v.driverChar === p.ch, 'joins the chase as a one-man motorcycle unit');
ok(!!u && !u.officers[0].rifle, 'no rifle on a traffic officer');
ok(!nan, 'no NaN positions');
if (u) { const d0 = Math.hypot(u.v.x - player.x, u.v.z - player.z); let maxV = 0, dMin = d0;
  step(25, () => { maxV = Math.max(maxV, Math.abs(u.v ? u.v.speed : 0)); const o = u.officers[0]; if (o) dMin = Math.min(dMin, Math.hypot(o.x - player.x, o.z - player.z)); return false; });
  ok(maxV > 2, `rides after the suspect (top speed ${maxV.toFixed(1)} m/s)`); ok(dMin < Math.max(6, d0 - 3), `closes in (${d0.toFixed(1)} → ${dMin.toFixed(1)} m)`);
  if (u.v && u.officers.every((o) => o.mode !== 'seated') && Math.abs(u.v.speed) < 0.2) ok(u.v.stand === 1, 'off the bike: it is left on its side stand'); }

// ---------------------------------------------------------------- 2. over before he is on the bike: back for the glove
police.level = 0; police.state = 'idle'; police.units.length = 0; police.foot = [];
const q = posts[1]; player.teleport(q.x + 60, q.z); step(1.5); ok(q.on && q.state === 'duty', 'second officer on duty');
const [qx, qz] = spotFor(q); player.teleport(qx, qz); police.level = 2; police.state = 'pursuing';
step(15, () => q.state === 'toBike'); ok(q.state === 'toBike', `throws the glove and heads for the bike (${q.state})`);
police.level = 0; police.state = 'idle'; player.teleport(qx + 30, qz);
const seen2 = []; step(60, () => { const st = q.state + (q.ph && q.state === 'pickup' ? ':' + q.ph : ''); if (seen2[seen2.length - 1] !== st) seen2.push(st); return q.state === 'duty' && seen2.length > 2; });
console.log('  states:', seen2.join(' → '));
ok(seen2.some((s) => s.startsWith('pickup:walk')) && seen2.some((s) => s.startsWith('pickup:bend')) && seen2.some((s) => s.startsWith('pickup:on')), 'walks back to the glove, bends for it, pulls it on');
ok(q.state === 'duty' && !q.ch.bare && !q.glove, 'gloved again and back at his post');
ok(Math.hypot(q.px - q.x, q.pz - q.z) < 0.6, `on his own spot (${Math.hypot(q.px - q.x, q.pz - q.z).toFixed(2)} m off)`);
ok(D.gloves.filter((G) => G.post === q).length === 0, 'the glove is gone from the road');
console.log(fail ? `FAILED ${fail} / ${pass + fail}` : `ALL PASS (${pass})`); process.exit(fail ? 1 : 0);
