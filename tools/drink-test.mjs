// Drink animation test (Node): the real HeroRooms.Drink choreography played frame by frame on every playable hero
// (Animator + postPose + HeroRig fingers, the real skinned hand mesh), at the club bar (marble top at 1.10 m) and at the
// hero-room table heights. Checks:
//   - the glass and the bottle never sink into the surface they stand on (lowest point of each vs the top, while over it)
//   - while held, the hand really holds them: finger / thumb skin not buried in the glass / bottle, the hand touching it
// Run: node tools/drink-test.mjs   (V=1 prints per-case numbers)
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.addEventListener ??= () => {}; globalThis.navigator ??= {}; navigator.getGamepads ??= () => []; document.addEventListener ??= () => {};
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const { Character, HEROES } = await import('../src/actors/Character.js');
const { Drink, DRINK_T } = await import('../src/world/HeroRooms.js');
const RP = await import('../src/world/RoomProps.js');
const V = !!process.env.V;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; if (fail < 40) console.log('  FAIL', m); } };

// cases: surface box (room-local x0..x1, z0..z1, top y), bottle / glass positions and the drinking spot — the club bar
// exactly as Club.js builds it, and the three hero-room tables (HeroRooms.js placeBottleGlass + drinkSpot)
const CASES = [
  { name: 'club bar', top: 1.1, box: [-8.65, -7.85, -5.3, 5.3], b: [-8.04, 0.09], gl: [-8.0, -0.08], spot: { x: -7.62, z: 0, yaw: -Math.PI / 2 } },
  { name: 'table .754', top: 0.754, box: [-0.45, 0.45, -0.3, 0.3], b: [-0.2, -0.1], gl: [-0.22, 0.06], spot: { x: -0.62, z: -0.02, yaw: Math.PI / 2 } },
  { name: 'desk .862', top: 0.862, box: [-0.3, 0.6, -0.4, 0.05], b: [0.22, -0.16], gl: [0.38, -0.13], spot: { x: 0.33, z: 0.3, yaw: Math.PI } },
  { name: 'shelf .758', top: 0.758, box: [-0.05, 0.45, -0.25, 0.1], b: [0.12, -0.04], gl: [0.28, 0.0], spot: { x: 0.2, z: 0.42, yaw: Math.PI } },
];
const FING = /^(idx|mid|rng|pnk|thb)([123])([LR])$/;
const v = new THREE.Vector3(), inv = new THREE.Matrix4();
// signed distance to an object's body (local cylinder r over y0..y1)
function sdObj(obj, r, y0, y1, p) { inv.copy(obj.matrixWorld).invert(); const q = p.clone().applyMatrix4(inv); const dr = Math.hypot(q.x, q.z) - r, dy = Math.max(y0 - q.y, q.y - y1); return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0)); }
// lowest point of a lathe object (base rim + top rim) in room-local coordinates, plus whether it is over the surface box
function lowest(obj, r, h, room, box) { let lo = 9, over = false; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; for (const y of [0, h]) { v.set(Math.cos(a) * r, y, Math.sin(a) * r).applyMatrix4(obj.matrixWorld).sub(room); if (v.x > box[0] && v.x < box[1] && v.z > box[2] && v.z < box[3]) { over = true; lo = Math.min(lo, v.y); } } } return { lo, over }; }

for (const hn of ['dineth', 'shashika', 'david']) for (const C of CASES) {
  const scene = new THREE.Scene(); const ch = new Character(HEROES[hn]); scene.add(ch.root);
  const g = new THREE.Group(); g.position.set(-387.8, 3.45, 215.45); scene.add(g);
  const bottle = RP.bottle(); bottle.position.set(C.b[0], C.top, C.b[1]); bottle.rotation.y = 0.6; g.add(bottle);
  const glass = RP.shotGlass(); glass.position.set(C.gl[0], C.top, C.gl[1]); g.add(glass);
  const room = { g, game: { hud: { notify() {} }, drunk: null, weapons: null } };
  const P = { x: g.position.x + C.spot.x, y: g.position.y, z: g.position.z + C.spot.z, yaw: C.spot.yaw, ch, control: true, sync() { ch.root.position.set(this.x, this.y, this.z); ch.root.rotation.set(0, this.yaw, 0); } };
  P.sync(); const mesh = ch.mesh; const sk = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, bones = mesh.skeleton.bones;
  const fingers = { L: [], R: [] }, palm = { L: [], R: [] };
  for (let i = 0; i < mesh.geometry.attributes.position.count; i++) { let mb = sk.getX(i), mw = sw.getX(i); for (let c = 1; c < 4; c++) if (sw.getComponent(i, c) > mw) { mw = sw.getComponent(i, c); mb = sk.getComponent(i, c); } const n = bones[mb].name; const m = FING.exec(n); if (m) fingers[m[3]].push(i); else if (n === 'handL' || n === 'handR') palm[n[4]].push(i); }
  for (let k = 0; k < 30; k++) ch.anim.update(1 / 60, 0, 0); // settle the idle pose
  const d = new Drink(room, bottle, glass, C.spot); d.start(P);
  const dt = 1 / 60; let sinkG = 0, sinkB = 0, buriedMax = { L: 0, R: 0 }, gapMax = { L: 0, R: 0 }, frames = 0;
  while (d.active) {
    d.update(dt); ch.anim.update(dt, 0, 0); P.sync(); scene.updateMatrixWorld(true); mesh.skeleton.update(); frames++;
    const lg = lowest(glass, 0.024, 0.062, g.position, C.box), lb = lowest(bottle, 0.04, 0.2, g.position, C.box);
    if (lg.over) sinkG = Math.max(sinkG, C.top - lg.lo); if (lb.over) sinkB = Math.max(sinkB, C.top - lb.lo);
    const t = d.t, T = DRINK_T;
    const heldR = t > T.reach + 0.3 && t < T.glassDown - 0.15, heldL = t > T.reach + 0.3 && t < T.bottleDown - 0.15;
    if (frames % 3) continue;
    for (const [S, held, obj, r, y0, y1] of [['R', heldR, glass, 0.025, 0.002, 0.06], ['L', heldL, bottle, 0.04, 0.01, 0.2]]) {
      if (!held) continue; let bur = 0, n = 0, gap = 9;
      for (let k = 0; k < fingers[S].length; k += 3) { mesh.getVertexPosition(fingers[S][k], v); v.applyMatrix4(mesh.matrixWorld); const s = sdObj(obj, r, y0, y1, v); n++; if (s < -0.003) bur++; gap = Math.min(gap, s); }
      for (let k = 0; k < palm[S].length; k += 5) { mesh.getVertexPosition(palm[S][k], v); v.applyMatrix4(mesh.matrixWorld); gap = Math.min(gap, sdObj(obj, r, y0, y1, v)); }
      buriedMax[S] = Math.max(buriedMax[S], bur / n); gapMax[S] = Math.max(gapMax[S], gap);
    }
    if (frames > 2000) break;
  }
  if (V) console.log(`${hn.padEnd(8)} ${C.name.padEnd(11)} glass sinks ${(sinkG * 1000).toFixed(1)} mm · bottle sinks ${(sinkB * 1000).toFixed(1)} mm · finger skin in glass ≤${(buriedMax.R * 100).toFixed(0)}% bottle ≤${(buriedMax.L * 100).toFixed(0)}% · hand–glass gap ≤${(gapMax.R * 1000).toFixed(0)} mm, hand–bottle ≤${(gapMax.L * 1000).toFixed(0)} mm`);
  ok(sinkG < 0.002, `${hn} ${C.name}: glass sinks ${(sinkG * 1000).toFixed(1)} mm into the surface`);
  ok(sinkB < 0.002, `${hn} ${C.name}: bottle sinks ${(sinkB * 1000).toFixed(1)} mm into the surface`);
  ok(buriedMax.R < 0.12, `${hn} ${C.name}: right-hand finger skin inside the glass ${(buriedMax.R * 100).toFixed(0)}%`);
  ok(buriedMax.L < 0.12, `${hn} ${C.name}: left-hand finger skin inside the bottle ${(buriedMax.L * 100).toFixed(0)}%`);
  ok(gapMax.R < 0.012, `${hn} ${C.name}: right hand not on the glass (gap ${(gapMax.R * 1000).toFixed(0)} mm)`);
  ok(gapMax.L < 0.012, `${hn} ${C.name}: left hand not on the bottle (gap ${(gapMax.L * 1000).toFixed(0)} mm)`);
}
console.log(`drink: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
