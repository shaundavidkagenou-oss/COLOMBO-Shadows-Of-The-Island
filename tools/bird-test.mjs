// Birds: model quality / proportions and behaviour (Node, headless). Real species sizes: house crow ~42 cm long, wingspan
// 76–85 cm; rock pigeon ~32 cm, wingspan 62–68 cm; rose-ringed parakeet ~40 cm incl. tail, wingspan 42–48 cm.
import './node-dom-stub.mjs';
import * as THREE from 'three';
const BM = await import('../src/world/BirdModels.js');
const B = await import('../src/world/Birds.js');
const CP = await import('../src/world/CityPlan.js');
const L = await import('../src/world/Layout.js');
const { Collision } = await import('../src/world/Collision.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } if (process.env.VERB) console.log('  ', c ? 'ok ' : 'NO ', m); };
const box = (geo, m) => { const g = geo.clone().applyMatrix4(m); g.computeBoundingBox(); return g.boundingBox; };
const SPAN = { crow: [0.72, 0.92], pigeon: [0.6, 0.74], parakeet: [0.4, 0.52] };
for (const sp of ['crow', 'pigeon', 'parakeet']) {
  const P = BM.birdParts(sp); const tris = BM.triangleCount(sp); ok(tris >= 6000, `${sp}: ${tris} triangles (smooth lofted body/head, individual feathers)`);
  let bad = 0; for (const n of BM.PART_NAMES) { const a = P[n].attributes.position.array; for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) bad++; if (P[n].index.count < 30) bad++; } ok(bad === 0, `${sp}: all ${BM.PART_NAMES.length} parts finite and non-trivial`);
  const mats = Array.from({ length: 11 }, () => new THREE.Matrix4());
  // standing: toes on the ground, folded wings hug the flanks, nothing below the feet
  const rest = B.restPose(sp); B.poseBird(sp, rest, mats); const legB = box(P.leg, mats[7]); ok(Math.abs(legB.min.y) < 0.012, `${sp}: feet on the ground when standing (toe ${(legB.min.y * 100).toFixed(1)} cm)`);
  const bodyB = box(P.body, mats[0]), foldB = box(P.fold, mats[9]); const bw = bodyB.max.x - bodyB.min.x, fw = foldB.max.x - foldB.min.x;
  ok(foldB.max.x - bodyB.max.x < 0.02 && foldB.max.z - foldB.min.z > 0.1, `${sp}: folded wing lies against the body (sticks out ${((foldB.max.x - bodyB.max.x) * 100).toFixed(1)} cm, length ${((foldB.max.z - foldB.min.z) * 100).toFixed(0)} cm)`); void bw; void fw;
  ok(box(P.wingIn, mats[2]).isEmpty() || box(P.wingIn, mats[2]).max.x - box(P.wingIn, mats[2]).min.x < 1e-6, `${sp}: open-wing meshes hidden while perched`);
  for (const k of [0, 1, 6, 9, 10]) { const bb = box(P[BM.PART_NAMES[k]], mats[k]); if (bb.min.y < -0.02) ok(false, `${sp}: ${BM.PART_NAMES[k]} below the ground (${bb.min.y.toFixed(3)})`); }
  // wings spread level: wingspan in the real range
  const sp1 = { ...rest, spread: 1, flap: 0, flapOut: 0, sweep: 0, sweepOut: 0, pitch: 0, y: 1 }; B.poseBird(sp, sp1, mats); const l = box(P.wingOut, mats[3]), r = box(P.wingOutR, mats[5]); const span = l.max.x - r.min.x;
  ok(span > SPAN[sp][0] && span < SPAN[sp][1], `${sp}: wingspan ${(span * 100).toFixed(0)} cm (real ${SPAN[sp].map((v) => v * 100).join('–')} cm)`); ok(Math.abs(l.max.x + r.min.x) < 0.005, `${sp}: wings symmetric`);
  // flap cycle: tips rise above and fall below the body
  let hi = -1, lo = 1; for (let ph = 0; ph < 1; ph += 0.05) { B.poseBird(sp, { ...sp1, ...B.flapPose(sp, ph) }, mats); const bb = box(P.wingOut, mats[3]); hi = Math.max(hi, bb.max.y - 1); lo = Math.min(lo, bb.min.y - 1); }
  ok(hi > 0.1 && lo < -0.06, `${sp}: wingbeat amplitude (tip +${(hi * 100).toFixed(0)} / ${(lo * 100).toFixed(0)} cm)`);
}
// ---- behaviour on the real city
CP.generatePlan(); const col = new Collision(); col.addAll(CP.plan.colliders);
const cam = new THREE.PerspectiveCamera(); cam.position.set(-470, 5, -470); cam.lookAt(-470, 0, -400);
const player = { x: -470, z: -440, y: L.LAND_Y, speed: 0, vehicle: null };
const g = { scene: new THREE.Scene(), camera: cam, collision: col, player, atmos: { night: 0, w: { rain: 0 } }, traffic: { vehicles: [] }, indoor: false };
const birds = new B.Birds(g);
for (let i = 0; i < 20 * 30; i++) birds.update(0.05);
const n0 = birds.birds.length; const bySp = (s) => birds.birds.filter((b) => b.sp === s).length;
ok(bySp('pigeon') >= 12, `pigeons flock at Galle Face (${bySp('pigeon')})`); ok(bySp('crow') >= 8, `crows around (${bySp('crow')})`);
let under = 0, inside = 0; const chk = () => { for (const b of birds.birds) { const gy = L.groundY(b.x, b.z); if (b.y < gy + 0.03) { under++; if (process.env.DBG) console.log("under", b.sp, b.state, b.y.toFixed(3), gy.toFixed(3), b.x.toFixed(1), b.z.toFixed(1), (b.vy||0).toFixed(2)); } if ((b.state === 'ground') && col.blocked(b.x, b.z, 0.05)) inside++; } };
chk();
// walk the player through the flock: birds near the path take off, fly, and land again elsewhere
const t0 = birds.stats.takeoffs; let flying = 0;
for (let i = 0; i < 20 * 40; i++) { player.x = -470 + Math.sin(i * 0.004) * 40; player.z = -440 + Math.cos(i * 0.006) * 30; player.speed = 3.4; birds.update(0.05); if (i % 10 === 0) chk(); flying = Math.max(flying, birds.birds.filter((b) => b.state === 'fly').length); }
ok(birds.stats.takeoffs - t0 >= 8, `birds take off as the player walks through (${birds.stats.takeoffs - t0})`); ok(flying >= 3, `several in the air at once (${flying})`); ok(birds.stats.landings >= 5, `and land again (${birds.stats.landings})`);
const near = birds.birds.filter((b) => (b.state === 'ground') && Math.hypot(b.x - player.x, b.z - player.z) < 2.5).length; ok(near === 0, `nobody stays on the ground within 2.5 m of a walking player (${near})`);
ok(under === 0, `never below the ground (${under} samples)`); ok(inside === 0, `never standing inside a building/wall (${inside} samples)`);
// gunshot: everything within range goes up
for (let i = 0; i < 20 * 20; i++) { player.speed = 0; birds.update(0.05); }
const grounded = () => birds.birds.filter((b) => (b.state === 'ground' || b.state === 'perch') && Math.hypot(b.x - player.x, b.z - player.z) < 40).length; const before = grounded();
birds.scare(player.x, player.z, 50); for (let i = 0; i < 20; i++) birds.update(0.05); ok(before === 0 || grounded() <= before * 0.2, `a gunshot scatters the birds (${before} → ${grounded()} on the ground within 40 m)`);
// night: fewer, roosting
g.atmos.night = 1; for (let i = 0; i < 20 * 30; i++) birds.update(0.05); ok(birds.birds.length <= n0, `fewer birds at night (${birds.birds.length} vs ${n0})`);
g.indoor = true; birds.update(0.05); ok(!birds.root.visible, 'hidden indoors');
console.log(`birds: ${pass} passed, ${fail} failed · stats ${JSON.stringify(birds.stats)}`); process.exit(fail ? 1 : 0);
