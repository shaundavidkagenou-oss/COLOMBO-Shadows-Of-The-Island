// Boarding test (Node): the step-in / step-out choreography (src/actors/Boarding.js) on real skeletons (short, average,
// tall adults) in every car / van / tuk-tuk / motorcycle model. Per sampled frame of the curve:
//   • every foot reaches its IK target (planted feet do not float or stretch);
//   • a foot crossing the door sill keeps its sole above the sill; the rider's right foot clears the saddle;
//   • while the head is inside the door line the crown is under the door-frame top (ducks in, never through the roof);
//   • the hips are never sunk into the body below the cushion;
//   • torso / knees keep clear of the opened driver door panel;
//   • no bone moves faster than 5 m/s between consecutive frames (no pops / flips), and the last frame equals the seated pose (no pop at the
//     hand-over to Seating.applySeatPose).
import './node-dom-stub.mjs';
import * as THREE from 'three';
const { createVehicleMesh, VTYPES } = await import('../src/vehicles/VehicleModels.js');
const { makeSkeleton } = await import('../src/actors/Character.js');
const { applySeatPose, seatLocal } = await import('../src/actors/Seating.js');
const { boardGeom, boardCurve, poseBoard, applyBoardPose, boardKind, BOARD_T } = await import('../src/actors/Boarding.js');
let pass = 0, fail = 0; const bad = []; const ok = (c, m) => { if (c) pass++; else { fail++; if (bad.length < 60) bad.push(m); } };
const W = (b, n) => new THREE.Vector3().setFromMatrixPosition(b[n].matrixWorld);
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR'];
const stats = {};
const types = Object.keys(VTYPES).filter((t) => boardKind({ T: VTYPES[t] }));
for (const type of types) {
  const T = VTYPES[type]; const g = createVehicleMesh(type, 1); const ud = g.userData; const seat = ud.seats.find((s) => s.driver) || ud.seats[0]; const hw = T.wid / 2; const kind = boardKind({ T });
  const side = ud.entry ? ud.entry.side : -1; const st = (stats[type] = { reach: 0, head: -9, sill: 9, jump: 0, end: 0, door: 9, sink: 9 });
  const veh = new THREE.Group(); veh.updateMatrixWorld();
  const d = ud.door; let doorSeg = null; if (d) { let len = 0; d.pivot.traverse((o) => { if (o.geometry) { o.geometry.computeBoundingBox(); len = Math.max(len, -o.geometry.boundingBox.min.z); } }); const th = d.max * 1.05; const hx = d.pivot.position.x, hz = d.pivot.position.z; doorSeg = [hx, hz, hx + side * len * Math.sin(th), hz - len * Math.cos(th)]; }
  for (const height of [1.52, 1.72, 1.88]) {
    const sp = { sex: height < 1.6 ? 'f' : 'm', height, build: height > 1.8 ? 1.08 : 0.96 }; const { bones } = makeSkeleton(sp, 'b' + height);
    const b = Object.fromEntries(bones.map((x) => [x.name, x])); const root = new THREE.Group(); const mesh = new THREE.Group(); root.add(mesh); mesh.add(bones[0]); veh.add(root);
    const s = height / 1.72; const A = { ch: { bones: b, root, spec: sp, hipY: bones[0].position.y }, s, ankle: 0.085 * s, seatW: 0, t: 0, seed: 0.3, vehSpeed: 0, seatLookT: 9, steer: 0 };
    const G = boardGeom({ T }, seat, A, kind === 'bike' ? 1 : side, d ? { x: d.pivot.position.x, z: d.pivot.position.z, len: Math.hypot(doorSeg[2] - doorSeg[0], doorSeg[3] - doorSeg[1]), max: d.max } : null);
    if (d) G.doorGrip = () => [doorSeg[0] + (doorSeg[2] - doorSeg[0]) * 0.88, 1.05, doorSeg[1] + (doorSeg[3] - doorSeg[1]) * 0.88];
    const bind = bones.map((x) => [x.quaternion.clone(), x.position.clone()]); const reset = () => bones.forEach((x, k) => { x.quaternion.copy(bind[k][0]); x.position.copy(bind[k][1]); });
    let prev = null; const N = 120; const maxStep = 5.0 * BOARD_T[kind] / N; // 5 m/s: a stepping foot peaks ~4 m/s; pops / flips are far faster
    for (let i = 0; i <= N; i++) {
      const u = i / N; reset(); const F = boardCurve(G, u); poseBoard(A, G, F, veh, () => 0, 0); applyBoardPose(A); root.updateMatrixWorld(true);
      const tag = `${type} h${height} u=${u.toFixed(2)}`;
      // feet reach their targets
      for (const sd of ['L', 'R']) { const t = new THREE.Vector3(...A.board.feet[sd]); root.localToWorld(t); const e = W(b, 'foot' + sd).distanceTo(t); st.reach = Math.max(st.reach, e); ok(e < 0.035, `${tag}: foot${sd} misses its target by ${e.toFixed(3)}`); }
      // sill / saddle clearance
      for (const sd of ['L', 'R']) { const f = W(b, 'foot' + sd); const sole = f.y - A.ankle * 0.9;
        if (kind !== 'bike') { if (Math.abs(f.x) > hw - 0.2 && Math.abs(f.x) < hw + 0.05 && f.z > seat.z - 0.5 && f.z < seat.z + 0.9) { const m = sole - G.fl; st.sill = Math.min(st.sill, m); ok(m > 0.0, `${tag}: foot${sd} sole ${m.toFixed(3)} m into the sill`); } }
        else if (sd === 'R' && Math.abs(f.x) < 0.17 && f.z > seat.z - 0.45 && f.z < seat.z + 0.25 && u < 0.6) { const m = sole - seat.y; st.sill = Math.min(st.sill, m); ok(m > 0.0, `${tag}: right foot ${m.toFixed(3)} m into the saddle`); } }
      // head under the door-frame top while inside the door line
      if (kind !== 'bike') { const h = W(b, 'head'); const crown = h.y + 0.2 * s + 0.02; if (Math.abs(h.x) < hw + 0.03) { const m = crown - (seat.roof + 0.05); st.head = Math.max(st.head, m); ok(m < 0, `${tag}: crown ${m.toFixed(3)} m above the door frame`); } }
      // hips never inside the body below the cushion
      if (kind !== 'bike') { const hj = W(b, 'thighL').y, hr = W(b, 'thighR').y; const hx = W(b, 'hips').x; if (Math.abs(hx) < hw - 0.08) { const m = Math.min(hj, hr) - seat.y; st.sink = Math.min(st.sink, m); ok(m > 0.0, `${tag}: hips ${m.toFixed(3)} m below the cushion`); } }
      // open driver door panel
      if (doorSeg) for (const n of ['hips', 'chest', 'head', 'shinL', 'shinR', 'footL', 'footR']) { const p = W(b, n); if (Math.abs(p.x) < hw) continue; const dd = segDist(p.x, p.z, ...doorSeg); st.door = Math.min(st.door, dd); ok(dd > 0.1, `${tag}: ${n} ${dd.toFixed(2)} m from the open door panel`); }
      // smoothness
      const cur = BONES.map((n) => W(b, n)); if (prev) { let j = 0; for (let k = 0; k < cur.length; k++) j = Math.max(j, cur[k].distanceTo(prev[k])); st.jump = Math.max(st.jump, j); ok(j < maxStep, `${tag}: a bone jumps ${j.toFixed(3)} m in one frame`); } prev = cur;
    }
    // last frame == seated pose
    const endB = BONES.map((n) => W(b, n)); A.board = null; root.position.set(seat.x, seat.y, seat.z); root.quaternion.identity(); A.seatW = 1; A.seated = seat; A.seatL = seatLocal(seat);
    reset(); applySeatPose(A, 0.016); root.updateMatrixWorld(true); let e = 0; BONES.forEach((n, k) => { e = Math.max(e, W(b, n).distanceTo(endB[k])); }); st.end = Math.max(st.end, e); ok(e < 0.02, `${type} h${height}: last boarding frame differs from the seated pose by ${e.toFixed(3)} m`);
    veh.remove(root);
  }
}
console.log(bad.join('\n'));
for (const [t, s] of Object.entries(stats)) console.log(`${t.padEnd(12)} reach ${s.reach.toFixed(3)}  head ${s.head.toFixed(2)}  sill/saddle ${s.sill.toFixed(3)}  sink ${s.sink.toFixed(2)}  door ${s.door.toFixed(2)}  jump ${s.jump.toFixed(3)}  end ${s.end.toFixed(3)}`);
console.log(`boarding: ${pass} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
