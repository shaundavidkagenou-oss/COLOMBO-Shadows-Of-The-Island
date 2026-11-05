// The Velvet Monsoon (world/Club.js): builds the club in Node and checks
//   layout   spawn, bar, tip spots reachable on foot from the door (grid walk round every obstacle); nobody stands in furniture
//   dancers  60 s of pole dancing per dancer: no skin inside the pole (beyond the hand on it), nothing under the stage, arm IK
//            reach error small, no bone jumping between frames, the hand-on-pole grips actually touch the pole
//   seats    every seated customer's thighs/seat rest on their seat (no sinking in, no floating)
//   money    tip (E) and make-it-rain (Q) take the money, throw notes that land on the dancer's stage, and she reacts
// Run: node tools/club-test.mjs
import './node-dom-stub.mjs';
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {}; globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} }; globalThis.navigator ??= { getGamepads: () => [] }; document.addEventListener ??= () => {};
const THREE = await import('three');
const { buildClub } = await import('../src/world/Club.js');
const { CLUB, CLUB_CHAIRS, PATRON_SPOTS, seatTopFor } = await import('../src/world/ClubCast.js');
const { POLE_R } = await import('../src/actors/PoleDance.js');
const { Input } = await import('../src/core/Input.js');

let checks = 0, fails = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL', msg); } };
const scene = new THREE.Scene();
const story = { state: { money: 20000, ledger: [] }, pay(n) { this.state.money += n; } };
const notes = []; const game = { scene, hud: { key: (a) => `[${a}]`, notify: (t, b) => notes.push(t + ': ' + b) }, story, drunk: { drink: () => null, label: 'Tipsy' }, weapons: null };
const door = { id: 'club', x: -388, z: 215.5, rot: 0, faceIn: Math.PI / 2 };
const t0 = Date.now(); const room = buildClub(game, door); const buildMs = Date.now() - t0; room.g.visible = true;
const P = { x: room.spawn[0], z: room.spawn[1], y: room.y, yaw: Math.PI, control: true, indoorBusy: false, ch: { anim: { play() {} }, bones: {} } };
game.player = P;
console.log(`built in ${buildMs} ms · obstacles ${room.obstacles.length} · people ${room.npcs.length} · dancers ${room.dancers.length}`);
ok(room.dancers.length === 4, 'four dancers'); ok(room.npcs.length >= 14, 'staff and customers present');

// ---------------------------------------------------------------- layout: walkable grid from the door
const ox = room.g.position.x, oz = room.g.position.z, R = 0.3, cell = 0.1;
const blocked = (x, z) => { const b = room.bounds; if (x < b.x0 + R || x > b.x1 - R || z < b.z0 + R || z > b.z1 - R) return true; for (const o of room.obstacles) if (x > o.x0 - R && x < o.x1 + R && z > o.z0 - R && z < o.z1 + R) return true; return false; };
const nx = Math.round(CLUB.W / cell), nz = Math.round(CLUB.D / cell); const seen = new Uint8Array(nx * nz);
const idx = (lx, lz) => { const i = Math.floor((lx + CLUB.W / 2) / cell), j = Math.floor((lz + CLUB.D / 2) / cell); return i < 0 || j < 0 || i >= nx || j >= nz ? -1 : j * nx + i; };
const centre = (i) => [-CLUB.W / 2 + (i % nx + 0.5) * cell, -CLUB.D / 2 + (Math.floor(i / nx) + 0.5) * cell];
{ const s = idx(CLUB.spawn[0], CLUB.spawn[1]); ok(!blocked(room.spawn[0], room.spawn[1]), 'spawn is free'); const q = [s]; seen[s] = 1;
  while (q.length) { const c = q.pop(); const i = c % nx, j = Math.floor(c / nx); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz) continue; const n = b * nx + a; if (seen[n]) continue; const [lx, lz] = centre(n); if (blocked(lx + ox, lz + oz)) continue; seen[n] = 1; q.push(n); } } }
const reach = (lx, lz, what) => { let good = false; for (let dx = -0.15; dx <= 0.15 && !good; dx += 0.05) for (let dz = -0.15; dz <= 0.15 && !good; dz += 0.05) { const n = idx(lx + dx, lz + dz); if (n >= 0 && seen[n]) good = true; } ok(good, `reachable on foot: ${what} (${lx.toFixed(2)}, ${lz.toFixed(2)})`); };
reach(CLUB.drinkSpot.x, CLUB.drinkSpot.z, 'bar drink spot'); reach(0, 0.55, 'round-platform tip spot'); reach(2.6, -7.0, 'stage-right tip spot'); reach(-2.6, -7.0, 'stage-left tip spot'); reach(3.75, 3.4, 'podium tip spot'); reach(0, 7.5, 'hall through the curtain'); reach(-6, 5.5, 'bar side of the hall'); reach(7, -2.8, 'booth aisle');
let area = 0; for (let i = 0; i < seen.length; i++) area += seen[i]; console.log(`walkable floor ${(area * cell * cell).toFixed(1)} m²`); ok(area * cell * cell > 120, 'plenty of walkable floor');
// standing people are not inside furniture or each other (seated ones are checked below)
for (const p of room.npcs) { if (p.kind === 'patron') continue; const wx = p.x + ox, wz = p.z + oz; let inside = 0; for (const o of room.obstacles) { const w = Math.min(o.x1, wx + 0.2) - Math.max(o.x0, wx - 0.2), d = Math.min(o.z1, wz + 0.2) - Math.max(o.z0, wz - 0.2); const onTop = p.ch.root.position.y > 0.2 && o.x0 <= wx - 0.2 && o.x1 >= wx + 0.2 && o.z0 <= wz - 0.2 && o.z1 >= wz + 0.2; /* standing on a riser */ if (!onTop && w > 0.02 && d > 0.02 && !(Math.abs((o.x0 + o.x1) / 2 - wx) < 0.01 && Math.abs((o.z0 + o.z1) / 2 - wz) < 0.01)) inside++; } ok(inside === 0, `${p.kind} at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) clear of furniture (${inside})`); }

// ---------------------------------------------------------------- run the room: dancers + seated customers
const v = new THREE.Vector3(), bw = new THREE.Vector3();
const st = room.dancers.map((d) => ({ name: d.name, pole: 9, poleK: '', floor: 9, floorK: '', reach: 0, reachK: '', grip: 9, gripK: '', jump: 0, jumpK: '', prev: null, kinds: {} }));
const seat = []; // seated customers
for (const p of room.npcs) if (p.kind === 'patron') seat.push({ p, min: 9, max: -9, n: 0 });
const dt = 1 / 30, T = Number(process.env.SECS || 60);
for (let f = 0; f < T * 30; f++) {
  room.tick(dt, P); scene.updateMatrixWorld(true);
  room.dancers.forEach((d, k) => { const S = st[k], m = d.move, key = m.kind + '@' + (d.t - m.t0).toFixed(1); S.kinds[m.kind] = (S.kinds[m.kind] || 0) + 1;
    for (const r of d.debug.reach) if (r > S.reach) { S.reach = r; S.reachK = key; }
    const bones = d.ch.mesh.skeleton.bones; const cur = bones.map((b) => b.getWorldPosition(new THREE.Vector3()));
    if (!S.live) { S.live = new Set(); const sk = d.ch.mesh.geometry.attributes.skinIndex, sw = d.ch.mesh.geometry.attributes.skinWeight; for (let i = 0; i < sk.count; i++) for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > 0.01) S.live.add(sk.getComponent(i, c)); } // bones that move skin
    if (S.prev && f > 1) for (let i = 0; i < cur.length; i++) { if (!S.live.has(i)) continue; const j = cur[i].distanceTo(S.prev[i]); if (j > S.jump) { S.jump = j; S.jumpK = key + ' ' + bones[i].name; } } S.prev = cur;
    if (f % 5) return; const mesh = d.ch.mesh, pos = mesh.geometry.attributes.position, sk = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight; const pole = d.pole;
    const gripMin = {};
    for (let i = 0; i < pos.count; i += 2) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); room.g.worldToLocal(v);
      const fy = v.y - pole.y0; if (fy < S.floor) { S.floor = fy; S.floorK = key; }
      const pd = Math.hypot(v.x - pole.x, v.z - pole.z) - POLE_R; if (pd >= S.pole && pd >= 0) continue;
      let main = sk.getX(i), w = sw.getX(i); for (const [ii, ww] of [[sk.getY(i), sw.getY(i)], [sk.getZ(i), sw.getZ(i)], [sk.getW(i), sw.getW(i)]]) if (ww > w) { w = ww; main = ii; }
      const bn = bones[main].name; if (/^hand/.test(bn) && d.cur.h[bn.slice(-1)].grip) { gripMin[bn] = Math.min(gripMin[bn] ?? 9, pd); continue; } // the hand on the pole is checked on its own
      if (pd < S.pole) { S.pole = pd; S.poleK = key + ' ' + bn; } }
    for (const g of Object.values(gripMin)) if (g < S.grip) { S.grip = g; S.gripK = key; }
  });
  if (f % 15 === 0 && f >= 30) for (const s of seat) /* after the first second (sitting pose settled) */ { const ch = s.p.ch, mesh = ch.mesh, pos = mesh.geometry.attributes.position; ch.bones.hips.getWorldPosition(bw); room.g.worldToLocal(bw); let lo = 9;
    for (let i = 0; i < pos.count; i += 2) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); room.g.worldToLocal(v); if (Math.hypot(v.x - bw.x, v.z - bw.z) < 0.16 && v.y < bw.y) lo = Math.min(lo, v.y); }
    s.lo = lo; s.min = Math.min(s.min, lo); s.max = Math.max(s.max, lo); s.n++; }
}
for (const S of st) {
  console.log(`${S.name.padEnd(8)} pole ${S.pole.toFixed(3)} (${S.poleK}) · floor ${S.floor.toFixed(3)} (${S.floorK}) · reach ${S.reach.toFixed(3)} (${S.reachK}) · grip ${S.grip.toFixed(3)} (${S.gripK}) · max bone step ${S.jump.toFixed(3)} (${S.jumpK}) · ${JSON.stringify(S.kinds)}`);
  ok(S.pole > -0.006, `${S.name}: body clear of the pole (${S.pole.toFixed(3)} at ${S.poleK})`); ok(S.floor > -0.012, `${S.name}: nothing under the stage (${S.floor.toFixed(3)} at ${S.floorK})`);
  ok(S.reach < 0.05, `${S.name}: arm IK reach error ${S.reach.toFixed(3)}`); ok(S.grip > -0.012, `${S.name}: gripping hand not sunk into the pole (${S.grip.toFixed(3)})`); ok(S.jump < 0.2, `${S.name}: no bone snaps (${S.jump.toFixed(3)} m in one frame at ${S.jumpK})`);
  ok(Object.keys(S.kinds).length >= 3, `${S.name}: varied routine (${Object.keys(S.kinds).join(', ')})`);
}
// seats: the skin under the hips must rest on the seat top it was built for
PATRON_SPOTS.forEach((sp, i) => { if (sp.stand) return; const s = seat.find((q) => Math.abs(q.p.x - (sp.chair !== undefined ? CLUB_CHAIRS[sp.chair][0] : 9.62) - (sp.chair !== undefined ? -Math.sin(CLUB_CHAIRS[sp.chair][2]) * 0.04 : 0.04)) < 0.02 && (sp.booth !== undefined || Math.abs(q.p.z - CLUB_CHAIRS[sp.chair][1] + Math.cos(CLUB_CHAIRS[sp.chair][2]) * 0.04) < 0.02));
  if (!s) { ok(false, `customer ${i} seat found`); return; } const top = seatTopFor(s.p.ch);
  console.log(`customer ${i} seat top ${top.toFixed(3)} · skin under hips ${s.min.toFixed(3)}…${s.max.toFixed(3)}`);
  ok(s.min > top - 0.03, `customer ${i}: not sunk into the seat (${(top - s.min).toFixed(3)} m)`); ok(s.max < top + 0.02, `customer ${i}: not floating above the seat (${(s.max - top).toFixed(3)} m)`); });

// ---------------------------------------------------------------- money: tip + make it rain at the round platform
const press = (a) => { Input.pressed.add(Input.code(a)); };
const clear = () => Input.pressed.clear();
{ const d = room.dancers[2]; P.x = ox + 0; P.z = oz + 0.55; P.yaw = Math.atan2(d.ch.root.position.x - 0, d.ch.root.position.z - 0.55); room.update(dt, P); ok(/Tip/.test(room.prompt || ''), `tip prompt in front of the platform (${room.prompt})`);
  const m0 = story.state.money; press('interact'); room.update(dt, P); clear(); ok(story.state.money === m0 - 500, 'tip takes Rs 500'); ok(d.attn, 'dancer turns to the tipper');
  for (let i = 0; i < 40; i++) room.tick(dt, P);
  P.yaw = Math.atan2(d.ch.root.position.x - 0, d.ch.root.position.z - 0.55); room.update(dt, P); const m1 = story.state.money; press('more'); room.update(dt, P); clear(); ok(story.state.money === m1 - 5000, 'make it rain takes Rs 5,000'); ok(P.indoorBusy, 'busy while throwing');
  for (let i = 0; i < 30 * 5; i++) room.tick(dt, P); ok(!P.indoorBusy, 'throwing finished');
  const im = room.g.children.filter((c) => c.isInstancedMesh); let landed = 0, onStage = 0; const mm = new THREE.Matrix4(), pp = new THREE.Vector3();
  for (const m of im) for (let i = 0; i < m.count; i++) { m.getMatrixAt(i, mm); pp.setFromMatrixPosition(mm); landed++; if (Math.hypot(pp.x - CLUB.poles.round.x, pp.z - CLUB.poles.round.z) < CLUB.roundR - 0.05 && Math.abs(pp.y - CLUB.stageY) < 0.02) onStage++; }
  console.log(`notes ${landed}, on the platform ${onStage}`); ok(landed === 51, `51 notes thrown (${landed})`); ok(onStage === landed, 'every note lies on the platform');
  story.state.money = 100; press('interact'); room.update(dt, P); clear(); ok(story.state.money === 100, 'no tip without money');
  P.x = ox + CLUB.drinkSpot.x; P.z = oz + CLUB.drinkSpot.z; room.update(dt, P); ok(/shot/.test(room.prompt || ''), `drink prompt at the bar (${room.prompt})`); }
// ---------------------------------------------------------------- street: the club's site in the city plan and its frontage
{ const { plan, generatePlan } = await import('../src/world/CityPlan.js'); const L = await import('../src/world/Layout.js'); const { buildClubFront } = await import('../src/world/ClubFront.js');
  generatePlan(); const sh = plan.missionShops.club; ok(!!sh, 'the club has a site in the city plan');
  if (sh) { const b = plan.buildings.find((q) => q.id === sh.b); ok(!!b && b.mission === 'club', 'its building is marked as the club');
    console.log(`club door (${sh.x.toFixed(1)}, ${sh.z.toFixed(1)}) · PLACES.club (${L.PLACES.club.x}, ${L.PLACES.club.z})`); ok(Math.hypot(sh.x - L.PLACES.club.x, sh.z - L.PLACES.club.z) < 12, 'map place is at the door');
    const f = buildClubFront(sh, b); ok(f.group.children.length > 0 && f.colliders.length > 0, `frontage built (${f.group.children.length} parts, ${f.colliders.length} colliders)`);
    const inside = (x, z) => f.colliders.some((c) => x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3);
    const dx = Math.sin(sh.faceIn), dz = Math.cos(sh.faceIn); let walk = true; for (let t = -3; t <= 0.8; t += 0.1) if (inside(sh.x + dx * t, sh.z + dz * t)) walk = false;
    ok(walk, 'a clear walk from the pavement up the red carpet to the door');
    let inB = false; for (const c of f.colliders) { const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2; if (cx > b.x0 + 0.05 && cx < b.x1 - 0.05 && cz > b.z0 + 0.05 && cz < b.z1 - 0.05) inB = true; } ok(!inB, 'rope posts stand on the pavement, outside the building'); } }
console.log(`\nclub: ${checks} checks, ${fails} failed`);
process.exit(fails ? 1 : 0);
