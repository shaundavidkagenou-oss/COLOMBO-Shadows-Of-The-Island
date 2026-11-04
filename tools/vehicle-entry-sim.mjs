// Vehicle entry / exit simulation (node tools/vehicle-entry-sim.mjs): the REAL Player stage machine (approach → open →
// step to the sill → step-in boarding → close / kick … and the reverse) on REAL vehicles, with and without a driver to
// pull out, for car / van / tuk-tuk / bike types. Every frame checks
//  · nothing is NaN and no bone moves faster than 6 m/s (no pops — especially at the seams between stages);
//  · soles never sink through the road outside the vehicle;
//  · the player ends seated (root at the seat) and, after exiting, stands outside the body clear of it;
//  · a pulled-out driver climbs out by the doorway: his hips / chest never pass through the body sides or the roof, he
//    never walks through the player, and the crowd takes him over.
import './node-dom-stub.mjs';
const el = () => ({ style: { setProperty() {}, removeProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild(c) { return c; }, append() {}, remove() {}, setAttribute() {}, querySelector: () => el(), querySelectorAll: () => [], addEventListener() {} });
const doc = globalThis.document; doc.body = doc.body || el(); doc.addEventListener = doc.addEventListener || (() => {}); globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import('three');
const { Character } = await import('../src/actors/Character.js');
const { Player } = await import('../src/actors/Player.js');
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
const { seatCharacter } = await import('../src/actors/Seating.js');
const { boardKind } = await import('../src/actors/Boarding.js');
const { updateDoorClosers } = await import('../src/vehicles/DoorRig.js');

let pass = 0, fail = 0; const fails = []; const seen = new Set(); const ok = (c, m) => { if (c) pass++; else { fail++; const key = m.replace(/[0-9.]+ m\/s|[0-9.]+ m /g, ''); if (!seen.has(key) && fails.length < 80) { seen.add(key); fails.push(m); } } };
let cabCross = 0; const DT = 1 / 60; const BONES = ['hips', 'spine', 'chest', 'head', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR'];
const L = await import('../src/world/Layout.js');
const collision = { groundAt: (x, z) => L.groundY(x, z), resolveCircle: (x, z) => ({ x, z }), blocked: () => false, raycast: () => 1, query: () => [] };
const events = { emit() {}, on() {} };
const W = (ch, n) => { const v = new THREE.Vector3(); ch.bones[n].getWorldPosition(v); return v; };
const { VTYPES } = await import('../src/vehicles/VehicleModels.js');
const TYPES = process.env.TYPES ? process.env.TYPES.split(',') : Object.keys(VTYPES).filter((t) => boardKind({ T: VTYPES[t] }) || t === 'bus' || t === 'pbus'); // every step-in type + the buses (walked up the treads; lorry cabs keep their own boarding)
const stats = [];
for (const type of TYPES) for (const withDriver of [false, true]) {
  const scene = new THREE.Scene(); const v = new Vehicle(type, 7, scene); v.place(10, 20, 0.6); v.mesh.updateMatrixWorld(true);
  const kind = boardKind(v); const tag = `${type}${withDriver ? '+driver' : ''}`;
  const P = new Player(scene, new THREE.PerspectiveCamera(), collision, events); P.nightLights = false;
  let adopted = null; P.crowd = { adopt: (ch, x, z, yaw, mode) => { adopted = { ch, x, z, mode }; scene.add(ch.root); ch.root.position.set(x, L.groundY(x, z), z); ch.root.rotation.set(0, yaw, 0); ch.root.updateMatrixWorld(true); } };
  const traffic = { takeOver: () => withDriver, release() {} };
  const seat = v.driverSeat(); let drv = null;
  if (withDriver) { drv = new Character({ sex: 'm', height: 1.74, build: 1, seed: 3 }); seatCharacter(drv, v, seat); v.driverChar = drv; }
  // start 4 m off the driver side, a little behind
  const e = v.mesh.userData.entry; const sp = new THREE.Vector3(e.x * 2.2, 0, e.z - 1.5).applyMatrix4(v.mesh.matrixWorld); P.x = sp.x; P.z = sp.z; P.y = 0; P.yaw = v.yaw; P.sync();
  const st = { tag, kind, maxV: 0, maxVat: '', sink: 0, drvIn: 0, drvNear: 9, tIn: 0, tOut: 0 };
  let prev = null, prevD = null, prevStage = ''; const cabSide = new Map();
  const check = (phase) => {
    P.ch.root.updateMatrixWorld(true); const cur = BONES.map((n) => W(P.ch, n)); const X = P.entry || P.exiting; const stage = phase + ':' + ((X && X.stage) || '-') + (process.env.T && X ? '@' + X.t.toFixed(3) : '');
    for (const p of cur) ok(Number.isFinite(p.x + p.y + p.z), `${tag}: NaN bone (${stage})`);
    const LOCO = /approach|align|open|resist|pull|toSill|stepAway|close|seated|busWait|busIn|busWalk|busBack/; const loco = LOCO.test(stage) && LOCO.test(prevStage); /* walking / turning / idle within one stage; the seams into and out of boarding stay checked */ // regular gait / turning / idle (not under test here)
    if (prev && !loco) cur.forEach((p, k) => { const sp = p.distanceTo(prev[k]) / DT; if (sp > st.maxV) { st.maxV = sp; st.maxVat = `${BONES[k]} @${prevStage}→${stage}`; } ok(sp < 6, `${tag}: ${BONES[k]} moves ${sp.toFixed(1)} m/s (${prevStage} → ${stage})`); });
    prev = cur; prevStage = stage;
    // soles above the road while outside the body footprint
    v.mesh.updateMatrixWorld(); const inv = new THREE.Matrix4().copy(v.mesh.matrixWorld).invert(); const hw = v.T.wid / 2, hl = v.T.len / 2;
    for (const f of ['footL', 'footR']) { const w = W(P.ch, f); const l = w.clone().applyMatrix4(inv); if (Math.abs(l.x) > hw + 0.02 || Math.abs(l.z) > hl) { const sink = 0.05 - (w.y - L.groundY(w.x, w.z)); st.sink = Math.max(st.sink, sink); ok(sink < 0.03, `${tag}: ${f} ${sink.toFixed(3)} m into the road (${stage})`); } }
    // cab doors (lorry / truck): a joint crossing the cab side passes through the door opening — between its edges and above the
    // bottom of that part of the (notched) opening — never through the solid panel below / beside it
    const cabD = (v.mesh.userData.doors || []).filter((d) => d.cab && d.rects);
    if (cabD.length) { const crossers = [[P.ch, 'p'], ...(drv && drv.root.parent && !adopted ? [[drv, 'd']] : [])];
      for (const [ch, who] of crossers) for (const n of ['hips', 'chest', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR']) { const l = W(ch, n).applyMatrix4(inv); const key = who + n; const d = cabD.find((q) => Math.sign(q.pivot.position.x) === Math.sign(l.x)); if (!d) continue;
        const skin = Math.abs(d.pivot.position.x), out = Math.abs(l.x) > skin; const was = cabSide.get(key); cabSide.set(key, out);
        if (was !== undefined && was !== out && l.y < 2.0 && l.y > 0.35) { /* (nothing solid under the cab sides near the road) */ const r = d.rects.find((q) => l.z >= q[0] && l.z <= q[1]); const zs = d.rects.map((q) => [q[0], q[1]]).flat();
          ok(r && l.y > r[2] && l.z > Math.min(...zs) && l.z < Math.max(...zs), `${tag}: ${who === 'p' ? '' : 'driver '}${n} crosses the cab side outside the door opening at z ${l.z.toFixed(2)} y ${l.y.toFixed(2)} (${stage})`); cabCross++; } } }
    if (drv && drv.root.parent && !adopted) { drv.root.updateMatrixWorld(true); const E = P.entry;
      if (E && E.npcK >= 1) { // standing / walking off: hips + chest outside the body sides, never through the player
        for (const n of ['hips', 'chest']) { const l = W(drv, n).applyMatrix4(inv); const inside = hw - Math.abs(l.x); if (Math.abs(l.z) < hl - 0.3 && l.y < (seat.roof ?? 2) + 0.1) { st.drvIn = Math.max(st.drvIn, inside); ok(inside < 0.02, `${tag}: driver's ${n} ${inside.toFixed(2)} m inside the body side while walking off`); } } }
      if (E && E.stage === 'busPull' && drv.root.parent) { const dh = W(drv, 'hips'), ph = W(P.ch, 'hips'); const dd = Math.hypot(dh.x - ph.x, dh.z - ph.z); st.drvNear = Math.min(st.drvNear, dd); ok(dd > 0.4, `${tag}: bus driver passes ${dd.toFixed(2)} m from the player`);
        for (const n of ['hips', 'chest', 'head', 'handL', 'handR', 'footL', 'footR']) { const l = W(drv, n).applyMatrix4(inv); if (Math.abs(Math.abs(l.x) - hw) < 0.03 && l.y > 0.3 && Math.abs(l.z) < hl - 0.3) { const lv = v.mesh.userData.doors.filter((d) => d.leaf && Math.abs(d.hz - d.leaf * 0.475 - e.z) < 0.2); ok(l.x > 0 && Math.abs(l.z - e.z) < 0.46 && lv.every((d) => d.ang > 0.8), `${tag}: bus driver's ${n} crosses the side at z ${(l.z - e.z).toFixed(2)} from the door (leaves ${lv.map((d) => d.ang.toFixed(2))})`); } } }
      if (E && E.npcG) { const dh = W(drv, 'hips'), ph = W(P.ch, 'hips'); const dd = Math.hypot(dh.x - ph.x, dh.z - ph.z); st.drvNear = Math.min(st.drvNear, dd); ok(dd > 0.4, `${tag}: driver passes ${dd.toFixed(2)} m from the player (bodies overlap)`); }
      const cur2 = BONES.map((n) => W(drv, n)); if (prevD) cur2.forEach((p, k) => { const sp = p.distanceTo(prevD[k]) / DT; const walking = P.entry && P.entry.npcK >= 1; ok(sp < (walking ? 10 : 7), /* walking off at a hurried 2.4 m/s: the swing foot itself reaches 7–8 m/s */ `${tag}: driver ${BONES[k]} moves ${sp.toFixed(1)} m/s (${(P.entry && P.entry.stage) || '-'}${P.entry && P.entry.npcK !== undefined ? (P.entry.npcK < 1 ? ' climbing out u=' + (1 - P.entry.npcK).toFixed(3) : ' walking off') : ''})`); }); prevD = cur2;
    } else prevD = null;
  };
  P.enterVehicle(v, traffic); let t = 0; while (P.entry && t < 20) { P.updateEntry(DT); updateDoorClosers(DT); t += DT; check('in'); } st.tIn = t;
  ok(!P.entry && P.vehicle === v, `${tag}: entry finished (stuck in ${P.entry && P.entry.stage})`);
  ok(P.ch.root.parent === v.mesh && P.ch.root.position.distanceTo(new THREE.Vector3(seat.x, seat.y, seat.z)) < 1e-6, `${tag}: seated at the driver seat`);
  ok(P.ch.anim.board === null && P.ch.anim.seated === seat, `${tag}: seat pose active at the end`);
  if (withDriver) ok(adopted && adopted.ch === drv && !v.driverChar, `${tag}: pulled-out driver handed to the crowd`);
  for (let i = 0; i < 90; i++) { P.ch.anim.update(DT, 0, 0); v.sync(DT); updateDoorClosers(DT); }
  if (type === 'bus' || type === 'pbus') ok(v.mesh.userData.doors.every((d) => !d.leaf || d.ang < 0.02), `${tag}: bus doors shut behind the driver`);
  prev = null; check('seated');
  ok(P.exitVehicle(traffic), `${tag}: exit starts`); t = 0; while (P.exiting && t < 20) { P.updateExit(DT); updateDoorClosers(DT); t += DT; check('out'); } st.tOut = t;
  ok(!P.exiting && !P.vehicle && P.ch.root.parent === scene, `${tag}: exit finished`);
  { const inv = new THREE.Matrix4().copy(v.mesh.matrixWorld).invert(); const l = new THREE.Vector3(P.x, 0, P.z).applyMatrix4(inv); ok(Math.abs(l.x) > v.T.wid / 2 + 0.25, `${tag}: standing clear of the body after exit (${(Math.abs(l.x) - v.T.wid / 2).toFixed(2)} m)`); }
  stats.push(st);
}
// interrupted mid-way (death / arrest → Player.abortVehicleTransition): back in the world standing, no boarding pose left
for (const [type, when] of [['sedan', 'stepIn'], ['sedan', 'climb'], ['bike', 'climb'], ['suv', 'walk']]) {
  const scene = new THREE.Scene(); const v = new Vehicle(type, 7, scene); v.place(10, 20, 0.6); v.mesh.updateMatrixWorld(true); const seat = v.driverSeat();
  const P = new Player(scene, new THREE.PerspectiveCamera(), collision, events); let adopted = null; P.crowd = { adopt: (ch) => { adopted = ch; scene.add(ch.root); } };
  let drv = null; if (when !== 'stepIn') { drv = new Character({ sex: 'm', height: 1.7, build: 1, seed: 5 }); seatCharacter(drv, v, seat); v.driverChar = drv; }
  const e = v.mesh.userData.entry; const sp = new THREE.Vector3(e.x * 2, 0, e.z).applyMatrix4(v.mesh.matrixWorld); P.x = sp.x; P.z = sp.z; P.sync();
  P.enterVehicle(v, { takeOver: () => !!drv, release() {} }); let t = 0;
  const at = () => { const E = P.entry; if (!E) return true; if (when === 'stepIn') return E.stage === 'stepIn' && E.t > 1; if (when === 'climb') return E.npcK > 0.5 && E.npcK < 1; return E.npcW > 0.4; };
  while (P.entry && !at() && t < 20) { P.updateEntry(DT); t += DT; }
  const tag = `abort ${type} mid-${when}`; ok(!!P.entry, `${tag}: reached the interrupt point`); P.abortVehicleTransition();
  ok(!P.entry && P.ch.root.parent === scene && P.ch.anim.board === null && !P.ch.anim.seated, `${tag}: player back in the world, standing`);
  ok(Math.abs(P.ch.root.rotation.x) < 1e-6 && Math.abs(P.ch.root.rotation.z) < 1e-6, `${tag}: player upright`);
  if (drv && when === 'climb') ok(drv.root.parent === v.mesh && drv.anim.board === null && drv.anim.seated === seat && v.driverChar === drv, `${tag}: driver back in his seat`);
  if (drv && when === 'walk') ok(adopted === drv && drv.anim.board === null, `${tag}: driver handed to the crowd`);
  for (let i = 0; i < 20; i++) P.ch.anim.update(DT, 0, 0); P.ch.root.updateMatrixWorld(true); ok(BONES.every((n) => Number.isFinite(W(P.ch, n).y)), `${tag}: pose valid afterwards`);
}
for (const s of stats) console.log(`${s.tag.padEnd(18)} ${String(s.kind).padEnd(5)} in ${s.tIn.toFixed(1)}s out ${s.tOut.toFixed(1)}s  max ${s.maxV.toFixed(1)} m/s (${s.maxVat})  sink ${s.sink.toFixed(3)}  drvIn ${s.drvIn.toFixed(2)} drvNear ${s.drvNear === 9 ? '-' : s.drvNear.toFixed(2)}`);
for (const f of fails) console.log('FAIL', f);
console.log(`cab-side crossings checked: ${cabCross}`); console.log(`vehicle-entry-sim: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
