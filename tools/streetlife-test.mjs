// Street-life test (Node, headless): ambient activities happen with the right props and contact (cigarette filter at the
// lips, newspaper held in both hands, phone in the hand on a call, couples hold hands / hug / kiss without heads passing
// through each other), and a street fight is reported by a bystander, a patrol car comes, the officers stop the fight,
// handcuff both people, walk them to the back seats and drive away — no wanted level, nobody left behind or leaked.
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); for (const k of ['paint', 'metal', 'concrete', 'road', 'ballast']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true }); }
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { Crowd } = await import('../src/actors/Crowd.js'); const { Collision } = await import('../src/world/Collision.js');
const { Traffic } = await import('../src/vehicles/Traffic.js'); const { PoliceResponse } = await import('../src/police/PoliceResponse.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; if (process.env.V) console.log('ok  ', m); } else { fail++; console.log('FAIL', m); } };
const col = new Collision(); col.addAll(CP.plan.colliders);
const scene = new THREE.Scene();
const C = new Crowd(scene, col, { emit() {}, on() {} }); C.prepareSpecs(40); C.max = 70;
const camDir = { x: 0, z: 1 };

// ---------------------------------------------------------------- 1. ambient activities
const life = C.life; const lip = [], kissD = [], chestD = []; let paperOk = 0, paperN = 0, phoneOk = 0, phoneN = 0, holdN = 0, smokeAtLips = 0;
const props = new Set();
for (const S of [{ x: -128, z: -880 }, { x: -60, z: -80 }, { x: 150, z: -300 }]) {
  C.clear(); life.coupleCd = 5; life.fightCd = 1e9; const focus = { x: S.x, z: S.z };
  const ctx = { simTime: 0, vehicles: [], player: { x: S.x + 400, z: S.z, vehicle: null, ch: null, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1, hour: 10, police: null };
  for (let i = 0; i < 2400; i++) { ctx.simTime += 0.1; C.update(0.1, focus, camDir, ctx); if (i % 300 === 0) life.coupleCd = Math.min(life.coupleCd, 2);
    for (const p of C.peds) { if (p.cig) props.add('cig'); if (p.paper) props.add('paper'); if (p.phone) props.add('phone'); if (p.holdFor && Math.hypot(p.x - focus.x, p.z - focus.z) < 70) holdN++;
      const d = Math.hypot(p.x - focus.x, p.z - focus.z); if (d > 40) continue; // full-rate pose only near the focus
      const A = p.ch.anim;
      if (p.cig && (A.smokeK || 0) > 0.97 && !(A.smokeLight > 0.02) && p.scene && p.scene.phase === 'drag') { smokeAtLips++; p.cig.updateWorldMatrix(true, false); const tip = p.cig.localToWorld(new THREE.Vector3(0.041, 0, 0)); lip.push(tip.distanceTo(life.mouthWorld(p, new THREE.Vector3()))); }
      if (p.paper && A.action === 'paper' && !(A.paperFlip > 0)) { paperN++; const hl = p.ch.bones.handL.getWorldPosition(new THREE.Vector3()), hr = p.ch.bones.handR.getWorldPosition(new THREE.Vector3()); const pp = p.paper.getWorldPosition(new THREE.Vector3());
        const w = hl.distanceTo(hr); if (w > 0.4 && w < 0.62 && hl.distanceTo(pp) < 0.42 && hr.distanceTo(pp) < 0.42) paperOk++; }
      if (p.phone) { phoneN++; if (p.phone.parent === p.ch.bones.handR) phoneOk++; }
      if (p.scene && p.scene.kind === 'couple' && p.scene.cp.a === p && p.scene.cp.phase === 'kiss' && p.scene.cp.t > 1.0 && p.scene.cp.t < 1.8) { const o = p.scene.cp.b; kissD.push(p.ch.bones.head.getWorldPosition(new THREE.Vector3()).distanceTo(o.ch.bones.head.getWorldPosition(new THREE.Vector3())));
        chestD.push(p.ch.bones.chest.getWorldPosition(new THREE.Vector3()).distanceTo(o.ch.bones.chest.getWorldPosition(new THREE.Vector3()))); }
    } }
}
// deterministic: activities started right beside the camera, so contact can be measured at full pose rate
{ const S = { x: -128, z: -880 }; C.clear(); life.coupleCd = 1e9; life.fightCd = 1e9; const focus = { x: S.x, z: S.z };
  const ctx = { simTime: 0, vehicles: [], player: { x: S.x + 400, z: S.z, vehicle: null, ch: null, yaw: 0, speed: 0 }, bodies: [], hourFactor: 1, hour: 10, police: null };
  for (let i = 0; i < 300; i++) { ctx.simTime += 0.1; C.update(0.1, focus, camDir, ctx); }
  const nodes = C.nodesNear(S.x, S.z, 40).filter((n) => Math.hypot(n.x - S.x, n.z - S.z) < 30 && !L.roadAt(n.x, n.z));
  const near = C.peds.filter((p) => p.state === 'walk' && Math.hypot(p.x - S.x, p.z - S.z) < 35).slice(0, 6);
  near.forEach((p, k) => life.startSolo(p, ['smoke', 'paper', 'call', 'smoke', 'paper', 'call'][k], { x: p.x, z: p.z }, p.yaw, { dur: 60 }));
  const m = C.specs.find((q) => q.sex === 'm' && q.age !== 'elder'), f = C.specs.find((q) => q.sex === 'f' && q.age !== 'elder'); const n = nodes[0];
  const a = C.makePed(m, n.x, n.z, n.id), b = C.makePed(f, n.x + 0.6, n.z, n.id); a.partner = b; b.partner = a; a.pace = b.pace = 1.1; a.jog = b.jog = false;
  const nb = nodes.find((q) => Math.hypot(q.x - n.x, q.z - n.z) > 12 && Math.hypot(q.x - n.x, q.z - n.z) < 30 && C.route(n.id, q.id) && C.route(n.id, q.id).cost < 60) || nodes[1];
  a.route = C.route(n.id, nb.id); a.coupleSpot = { type: 'lawn', x: nb.x, z: nb.z }; b.state = 'scene'; b.scene = { kind: 'follow', lead: a, t: 0 }; life.couples.push({ a, b, spot: a.coupleSpot, t: 0 }); C.pickNext(a);
  for (let i = 0; i < 1500; i++) { ctx.simTime += 0.05; C.update(0.05, focus, camDir, ctx);
    if (process.env.DBG && i % 40 === 0) console.log('cp', i, a.state, a.scene && a.scene.kind, a.scene && a.scene.cp && a.scene.cp.phase, 'spot', !!a.coupleSpot, 'route', a.route && a.route.length, 'pos', a.x.toFixed(1), a.z.toFixed(1), 'tgt', a.target && a.target.x.toFixed(1), a.target && a.target.z.toFixed(1), 'b', b.state, b.x.toFixed(1), b.z.toFixed(1), C.peds.includes(a), C.peds.includes(b));
    for (const p of C.peds) { const A = p.ch.anim; if (Math.hypot(p.x - focus.x, p.z - focus.z) > 40) continue;
      if (p.cig && (A.smokeK || 0) > 0.97 && !(A.smokeLight > 0.02) && p.scene && p.scene.phase === 'drag') { p.cig.updateWorldMatrix(true, false); const tip = p.cig.localToWorld(new THREE.Vector3(0.041, 0, 0)); lip.push(tip.distanceTo(life.mouthWorld(p, new THREE.Vector3()))); }
      if (p.paper && A.action === 'paper' && !(A.paperFlip > 0) && p.scene && p.scene.phase === 'read') { paperN++; const hl = p.ch.bones.handL.getWorldPosition(new THREE.Vector3()), hr = p.ch.bones.handR.getWorldPosition(new THREE.Vector3()); const pp = p.paper.getWorldPosition(new THREE.Vector3());
        const w = hl.distanceTo(hr); if (w > 0.4 && w < 0.62 && hl.distanceTo(pp) < 0.42 && hr.distanceTo(pp) < 0.42) paperOk++; else if (paperN - paperOk < 3) console.log('paper hands', w.toFixed(2), hl.distanceTo(pp).toFixed(2), hr.distanceTo(pp).toFixed(2)); }
      if (p.phone) { phoneN++; if (p.phone.parent === p.ch.bones.handR) phoneOk++; }
      if (p.holdFor) holdN++;
      if (process.env.DBG && p.scene && p.scene.kind === 'couple' && p.scene.cp.a === p && p.scene.cp.phase !== 'meet' && p.scene.cp.phase !== 'talk' && i % 5 === 0) { const o = p.scene.cp.b; console.log('K', p.scene.cp.phase, p.scene.cp.t.toFixed(2), JSON.stringify(p.ch.anim.nearLean), JSON.stringify(p.ch.anim.holdL), JSON.stringify(o.ch.anim.holdL), p.ch.bones.head.getWorldPosition(new THREE.Vector3()).toArray().map((x) => x.toFixed(2)).join(','), p.x.toFixed(2), o.x.toFixed(2), p.scene.cp.lean); }
      if (p.scene && p.scene.kind === 'couple' && p.scene.cp.a === p && p.scene.cp.phase === 'kiss' && p.scene.cp.t > 1.0 && p.scene.cp.t < 1.8) { const o = p.scene.cp.b; kissD.push(p.ch.bones.head.getWorldPosition(new THREE.Vector3()).distanceTo(o.ch.bones.head.getWorldPosition(new THREE.Vector3())));
        chestD.push(p.ch.bones.chest.getWorldPosition(new THREE.Vector3()).distanceTo(o.ch.bones.chest.getWorldPosition(new THREE.Vector3()))); }
    } }
  console.log('forced couple phases seen', life.stats.kiss, 'couple state', a.state, a.scene && a.scene.kind, b.scene && b.scene.kind);
}
const st = life.stats; const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length); const max = (a) => a.reduce((m, x) => Math.max(m, x), 0); const min = (a) => a.reduce((m, x) => Math.min(m, x), 9);
console.log('activities', JSON.stringify(st));
console.log(`lips: n ${lip.length} mean ${(mean(lip) * 100).toFixed(1)} cm max ${(max(lip) * 100).toFixed(1)} cm · paper ${paperOk}/${paperN} · phone ${phoneOk}/${phoneN} · hand-in-hand samples ${holdN} · kiss head dist ${kissD.length ? (min(kissD) * 100).toFixed(0) + '–' + (max(kissD) * 100).toFixed(0) + ' cm' : '-'} chest ${chestD.length ? (min(chestD) * 100).toFixed(0) + ' cm min' : '-'}`);
ok(st.smoke >= 3 && st.paper >= 3 && st.call >= 2, `people smoke (${st.smoke}), read the paper (${st.paper}), take calls (${st.call})`);
ok(st.couple >= 2 && st.kiss >= 1 && holdN > 50, `couples walk hand in hand and kiss (${st.couple} couples, ${st.kiss} kisses, ${holdN} hand-in-hand samples)`);
ok(props.has('cig') && props.has('paper') && props.has('phone'), `props appear (${[...props].join(', ')})`);
ok(lip.length > 20 && mean(lip) < 0.02 && max(lip) < 0.04, `cigarette filter at the lips on a drag (mean ${(mean(lip) * 100).toFixed(1)} cm, max ${(max(lip) * 100).toFixed(1)} cm)`);
ok(paperN > 50 && paperOk >= paperN * 0.97, `newspaper held open in both hands (${paperOk}/${paperN})`);
ok(phoneN > 50 && phoneOk === phoneN, `phone in the right hand on calls / texting (${phoneOk}/${phoneN})`);
ok(kissD.length > 3 && min(kissD) > 0.15 && max(kissD) < 0.26, `kiss: heads meet without passing through (${(min(kissD) * 100).toFixed(0)}–${(max(kissD) * 100).toFixed(0)} cm head to head)`);
ok(chestD.length > 3 && min(chestD) > 0.2, `kiss / hug: bodies close but not inside each other (chest to chest ≥ ${(min(chestD) * 100).toFixed(0)} cm)`);
// no leftovers: props removed when people stop
const stray = C.peds.filter((p) => (p.cig && !(p.scene && p.scene.kind === 'smoke')) || (p.paper && !(p.scene && p.scene.kind === 'paper') && !p.benchRead) || (p.phone && !['phone', 'text'].includes(p.ch.anim.action)));
ok(stray.length === 0, `no props left in hands after an activity ends (${stray.length})`);

// ---------------------------------------------------------------- 2. street fight → bystander call → arrest → drive away
const T = new Traffic(scene, col, { emit() {}, on() {} }); T.max = 0;
const S = { x: -128, z: -880 }; const player = { x: S.x + 20, z: S.z + 6, y: 0.15, yaw: 0, vehicle: null, speed: 0 };
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1000); camera.position.set(player.x, 3, player.z - 6); camera.lookAt(player.x, 1.5, player.z);
const subs = [];
const g = { scene, traffic: T, collision: col, camera, player, hud: { notify() {}, subtitle: (who, l, tr) => subs.push(`${who}: ${tr || l}`) }, director: { active: false }, story: { state: { money: 1000 }, pay() {} }, atmos: { night: 0, hour: 14 }, crowd: C, clock: 0, dt: 0.05, events: { emit() {}, on() {} } };
const police = new PoliceResponse(g); police.patrolCd = 1e9;
C.clear(); life.fightCd = 1e9; life.coupleCd = 1e9; const focus = { x: player.x, z: player.z };
const ctx = { simTime: 0, vehicles: T.vehicles, player, bodies: [], hourFactor: 1, hour: 14, police };
const step = (dt) => { g.clock += dt; ctx.simTime = g.clock; C.update(dt, focus, camDir, ctx); police.update(dt); T.update(dt, player, null, g.clock, [], null); };
for (let i = 0; i < 400; i++) step(0.05); // populate
let F = null; for (let k = 0; k < 40 && !F; k++) { for (let i = 0; i < 20; i++) step(0.05); if (life.startFight(ctx)) F = life.fights[0]; }
ok(!!F, 'a fight starts between two men on the pavement');
const seen = new Set(), qseen = new Set(); let unit = null, tArr = null, removed = false, maxStars = 0, held = [], escortHold = 0, escortN = 0, cuffedN = 0, onRoadFight = 0, t = 0, carIn = 0;
const chars0 = F ? [F.a.ch, F.b.ch] : [];
for (let i = 0; i < 20 * 260 && F; i++) { step(0.05); t += 0.05; if (!F.handed && !F.ended) { seen.add(F.phase); if (L.roadAt(F.a.x, F.a.z) || L.roadAt(F.b.x, F.b.z)) onRoadFight++; }
  if (F.unit && !unit) unit = F.unit; if (process.env.DBG && unit && i % 100 === 0) console.log(t.toFixed(0), unit.cphase, unit.v.x.toFixed(0), unit.v.z.toFixed(0), unit.v.speed.toFixed(1), 'to fight', Math.hypot(unit.v.x - unit.civil.x, unit.v.z - unit.civil.z).toFixed(0), unit.prisoners.map((q) => q.mode + ':' + Math.hypot(q.x - q.officer.x, q.z - q.officer.z).toFixed(1)).join(','), unit.officers.map((o) => o.mode).join(',')); maxStars = Math.max(maxStars, police.level);
  if (unit) { seen.add('unit:' + unit.cphase); for (const q of unit.prisoners) { qseen.add(q.mode); if (q.mode === 'escort') { escortN++; if (q.officer.ch.anim.action === 'hold') escortHold++; if (q.ch.anim.action === 'cuffed') cuffedN++; } }
    if (unit.prisoners.length) held = unit.prisoners; if (unit.prisoners.length === 2 && unit.prisoners.every((q) => q.mode === 'seated') && tArr === null) tArr = t;
    if (unit.cphase === 'leave' && police.civil.includes(unit)) carIn = unit.v.pax.length + (unit.v.driverChar ? 1 : 0);
    if (!police.civil.includes(unit) && seen.has('unit:leave')) { removed = true; break; } }
  if (F.ended && !F.unit && t > 120) break;
}
console.log(`fight: ${[...seen].join(' → ')} · prisoners ${[...qseen].join(' → ')} · seated after ${tArr ? tArr.toFixed(0) : '-'} s · car load ${carIn} · subtitles: ${[...new Set(subs)].slice(0, 6).join(' | ')}`);
console.log(police.log.filter((l) => /civil|detained|leaving|removed/.test(l)).join('\n'));
ok(seen.has('argue') && seen.has('brawl'), 'the fight escalates: argue → shove → exchange of blows');
ok(onRoadFight === 0, `the fight stays on the pavement (${onRoadFight} samples on the road)`);
ok(!!unit && life.stats.reported >= 1, 'a bystander phones it in and a patrol car is dispatched');
ok(maxStars === 0, 'no wanted level for the player at any point');
ok(seen.has('unit:scene') && held.length === 2, `officers get out and detain both men (${held.length})`);
ok(['held', 'cuffing', 'escort', 'toDoor', 'enter', 'seated'].every((m) => qseen.has(m)), `hands up → handcuffed → escorted → into the back seat (${[...qseen].join(', ')})`);
ok(escortN > 20 && cuffedN === escortN && escortHold >= escortN * 0.75, `walked to the car handcuffed, an officer's hand on the arm (${cuffedN}/${escortN} cuffed, ${escortHold} held)`);
ok(carIn === 4, `everyone in the car when it leaves: 2 officers + 2 detained (${carIn})`);
ok(removed, 'the car drives away and is removed out of view');
ok(chars0.every((ch) => !C.peds.some((p) => p.ch === ch)), 'the two men are no longer crowd pedestrians');
ok(police.civil.length === 0 && police.units.every((u) => !u.civil), 'no civil unit left over');
console.log(`streetlife: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
