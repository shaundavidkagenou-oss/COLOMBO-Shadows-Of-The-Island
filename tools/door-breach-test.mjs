// 73rd: door breach (middle mouse) — Node, the real Player, WalkIn door and Character pose; the bank room's own reaction.
//  - middle mouse facing a closed shop door from the pavement: he squares up on the latch side, kicks (the right heel goes out
//    at lock height at the impact moment), a glazed door bursts on the first kick and swings round hard to its stop, bounces
//    and hangs open (closer broken); the room's keeper flinches and cowers, then recovers
//  - a heavy door (bronze / steel) takes the first kick (barely moves) and goes on the second
//  - not facing it / too far / door already open: nothing happens
//  - the bank: every customer and member of staff reacts (flinch → cower / freeze), then carries on
//   node tools/door-breach-test.mjs
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.addEventListener ??= () => {};
{ const doc = globalThis.document; if (doc && !doc.addEventListener) doc.addEventListener = () => {}; }
const M = await import('../src/gfx/Materials.js'); M.MAT.paint ||= new THREE.MeshStandardMaterial({ vertexColors: true }); M.MAT.emissive ||= new THREE.MeshBasicMaterial({ vertexColors: true });
for (const k of ['metal', 'glass', 'concrete']) M.MAT[k] ||= new THREE.MeshStandardMaterial({ vertexColors: true });
const L = await import('../src/world/Layout.js');
const { WalkIn } = await import('../src/world/WalkIn.js');
const { Player } = await import('../src/actors/Player.js'); const { Input } = await import('../src/core/Input.js');
const { Character } = await import('../src/actors/Character.js'); const { makeAppearance } = await import('../src/actors/Appearance.js');
const { Audio } = await import('../src/audio/Audio.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
const realTimeout = globalThis.setTimeout; globalThis.setTimeout = () => 0;
const sounds = []; Audio.ready = true; Audio.doorBreach = (x, z, hold) => sounds.push(hold ? 'hold' : 'burst'); Audio.debrisHit = () => sounds.push('bang');
const scene = new THREE.Scene(); const alarms = [];
const game = { scene, player: null, weapons: null, crowd: { alarm: (x, z, r, sev, src, kind, byP) => alarms.push({ r, sev, kind, byP }) }, hud: { key: () => '[E]' } };
const collision = { groundAt: (x, z) => L.groundY(x, z), resolveCircle: (x, z) => ({ x, z }), blocked: () => false, raycast: () => 1, query: () => [], walkableWater: () => false, surfaceAt: () => 'concrete' };
const P = new Player(scene, new THREE.PerspectiveCamera(), collision, { emit() {}, on() {} }); P.nightLights = false; P.control = true; game.player = P;
const W = new WalkIn(game); P.walkIn = W;
const keeperRoom = () => { const g = new THREE.Group(); const kp = new Character(makeAppearance(5)); kp.root.position.set(0, 0, -3); g.add(kp.root);
  return { g, keeper: kp, keeperPos: [0, -3], bounds: { x0: -3, x1: 3, z0: -6 }, obstacles: [], proxy: { walkIn: true }, update(dt) { kp.anim.update(dt, 0); } }; };
const X0 = 40, Z0 = 60;
const shop = W.add({ id: 'test-shop', name: 'Test', door: { x: X0, z: Z0, faceIn: 0 }, style: 'alu', hinge: -1, build: keeperRoom });
const heavy = W.add({ id: 'test-bank1', name: 'Heavy', door: { x: X0 + 30, z: Z0, faceIn: 0 }, style: 'bronze', hinge: -1, build: keeperRoom });
const frame = (press = []) => { for (const b of press) Input.mousePressed.add(b); P.updateFoot(1 / 60, { all: () => [] }); W.update(1 / 60); Input.endFrame(); };
const run = (sec, each) => { for (let i = 0; i < sec * 60; i++) { frame(); if (each) each(); } };
// on the pavement in front of a door, facing it (the shop is at local z < 0: world +z here since faceIn = 0)
const front = (s, d = 1.6, lx = 0.2) => { P.indoor = null; const [x, z] = W.world(s, lx, d); P.x = x; P.z = z; P.y = L.groundY(x, z); P.yaw = s.yaw + Math.PI; P.camYaw = P.yaw + Math.PI; P.speed = 0; P.sync(); for (let i = 0; i < 3; i++) frame(); };
// ---- 1. not facing it: nothing
front(shop); P.yaw = shop.yaw; P.camYaw = P.yaw + Math.PI; frame([1]); ok(!P.breach, 'facing away from the door: middle mouse does nothing');
// ---- 2. a glazed door: one kick
front(shop); frame([1]); ok(!!P.breach, 'middle mouse facing a closed shop door: the breach starts');
let footAtImpact = null, impactT = -1, t = 0, maxAng = 0, kicked = false, pos0 = null;
const D = shop.doorObj; const sc = P.ch.spec.height / 1.72;
run(3, () => { t += 1 / 60; const B = P.breach; if (B && B.ph === 'kick' && !pos0) pos0 = { x: P.x, z: P.z };
  if (B && B.ph === 'kick' && B.hit && !kicked) { kicked = true; impactT = t; P.ch.root.updateMatrixWorld(true); footAtImpact = P.ch.bones.footR.getWorldPosition(new THREE.Vector3()); }
  maxAng = Math.max(maxAng, Math.abs(D.ang)); });
if (pos0) { const [lx, lz] = W.local(shop, pos0.x, pos0.z); ok(lx * -D.hinge > 0.05 && Math.abs(lz - 0.72 * sc) < 0.08, `squares up on the latch side, an arm's length off it (${lx.toFixed(2)}, ${lz.toFixed(2)})`); }
ok(kicked, 'the kick lands');
if (footAtImpact) { const [flx, flz] = W.local(shop, footAtImpact.x, footAtImpact.z); const fy = footAtImpact.y - shop.y0; console.log(`  heel at impact: local ${flx.toFixed(2)}, ${flz.toFixed(2)}, ${fy.toFixed(2)} m up`);
  ok(fy > 0.55 && fy < 1.2 && flz < 0.12 && flz > -0.1, `the right foot is up at the leaf at lock height (${fy.toFixed(2)} m up, ${flz.toFixed(2)} m off the door)`); }
ok(sounds.includes('burst') && !sounds.includes('hold'), 'a glazed door bursts on the first kick (crash sound)');
ok(maxAng > 1.5 && D.breachT > 0, `the leaf slams round to its stop (${maxAng.toFixed(2)} rad) and the closer is broken`);
ok(sounds.includes('bang'), 'it bangs off the stop');
ok(Math.abs(D.ang) > 0.9 && Math.abs(D.ang) < 1.63, `and hangs open (${D.ang.toFixed(2)} rad)`);
ok(!P.breach && P.ch.anim.action !== 'doorKick', 'control back to the player afterwards');
ok(alarms.length > 0 && alarms.every((a) => a.byP === false), 'the bang alarms the pavement (no police report from it)');
const kp = shop.room && shop.room.keeper; ok(!!kp && kp.anim.action === 'cower', `the keeper cowers (${kp && kp.anim.action})`);
run(9); ok(kp && kp.anim.action !== 'cower' && !shop.room.keeperBusy, 'and recovers a few seconds later');
frame([1]); ok(!P.breach, 'the door already open: no second breach');
// ---- 3. a heavy door: two kicks
sounds.length = 0; front(heavy); if (process.env.DBG) console.log('heavy', heavy.dist, P.indoor, P.grounded, P.cover, P.control, heavy.doorObj.ang, W.local(heavy, P.x, P.z)); frame([1]); if (process.env.DBG) console.log('breach?', !!P.breach); let maxA1 = 0; run(1.5, () => { if (sounds.length === 1) maxA1 = Math.max(maxA1, Math.abs(heavy.doorObj.ang)); });
ok(sounds[0] === 'hold' && maxA1 < 0.12, `the bank's bronze door takes the first kick (it holds: ${maxA1.toFixed(3)} rad)`);
run(2); ok(sounds.includes('burst') && heavy.doorObj.breachT > 0, `and bursts on the second (${sounds.join(', ')})`);
// ---- 4. the bank's people
globalThis.setTimeout = () => 0;
const { buildBankInterior } = await import('../src/world/BankInterior.js'); const { BankSound } = await import('../src/audio/BankAudio.js');
for (const f of ['ring', 'ringStop', 'handset', 'chair', 'say', 'step', 'beep']) BankSound[f] = () => 0;
const g2 = { clock: 0, hud: { key: () => '[E]', subtitle: () => {}, notify: () => {} } }; const room = buildBankInterior(g2, null); room.staffOn = () => true;
const pl = { x: 0, z: 0.6, y: 0, yaw: Math.PI, inside: true }; const dt = 1 / 30; for (let i = 0; i < 40 / dt; i++) { g2.clock += dt; room.update(dt, pl); }
const custs = room.customers.filter((c) => c.on && !(c.cmd && c.cmd.fn)); room.breach();
if (process.env.DBG) console.log(custs.map((c) => `${c.seat} ${c.ch.anim.seated} ${c.cmd && Object.keys(c.cmd)} ${c.ch.anim.action}`).join(' | '));
const staff = [...room.shift.people]; let flinched = new Set(), cowered = new Set(), frozen = 0; let moved0 = null;
if (process.env.DBG) console.log(staff.map((p) => `${p.role}:${p.duty}:${p.away}:${p.stunT && p.stunT.toFixed(1)}:${p.waveT}`).join(' | '));
for (let i = 0; i < 1.6 / dt; i++) { if (i === Math.round(0.55 / dt)) moved0 = custs.map((c) => [c.x, c.z]); g2.clock += dt; room.update(dt, pl); for (const c of custs) { if (c.ch.anim.action === 'flinch') flinched.add(c); if (c.ch.anim.action === 'cower') cowered.add(c); } for (const p of staff) if (p.ch.anim.action === 'flinch') flinched.add(p); }
if (process.env.DBG) console.log(custs.map((c) => `${c.on} ${c.stunA} ${c.stunT} ${c.x.toFixed(1)},${c.z.toFixed(1)} ${c.ch.anim.action}`).join(' | '));
frozen = custs.filter((c, i) => c.on && Math.hypot(c.x - moved0[i][0], c.z - moved0[i][1]) < 0.05).length;
const gone = custs.filter((c) => !c.on); custs.splice(0, custs.length, ...custs.filter((c) => c.on)); /* (one who had already gone out of the door and been handed to the street crowd) */
ok(custs.length > 0 && custs.every((c) => flinched.has(c)), `every customer jumps at the bang (${custs.filter((c) => flinched.has(c)).length}/${custs.length}${gone.length ? `, ${gone.length} already out on the street` : ''})`); ok(gone.every((c) => !(c.stunT > 0)), 'a customer handed off to the street keeps no stun state for the next visit');
ok(custs.filter((c) => !(c.seat >= 0)).every((c) => cowered.has(c)), 'customers on their feet duck down and cower');
ok(frozen === custs.length, `they stop and freeze where they are (${frozen}/${custs.length})`);
ok(staff.filter((p) => p.duty === 'on').every((p) => flinched.has(p)), `the staff jump too (${staff.filter((p) => flinched.has(p)).length}/${staff.filter((p) => p.duty === 'on').length})`);
for (let i = 0; i < 8 / dt; i++) { g2.clock += dt; room.update(dt, pl); }
ok(custs.every((c) => !(c.stunT > 0) && c.ch.anim.action !== 'cower'), 'a few seconds later they carry on');
ok(room.stats.breaches === 1, 'counted');
globalThis.setTimeout = realTimeout;
console.log(fail ? `FAILED ${fail} / ${pass + fail}` : `ALL PASS (${pass})`); process.exit(fail ? 1 : 0);
