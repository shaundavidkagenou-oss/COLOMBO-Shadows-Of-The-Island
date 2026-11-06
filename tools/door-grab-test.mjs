// Door grab test (Node): the player's hand on the car door while getting in, on the real hero rigs (finger bones, skinned
// hands) and the real door meshes of every hinged-door vehicle:
//   • stepping in (Boarding.carCurve, the outer hand holding the open door until it leaves for the wheel): while the grasp
//     is held, the hand / finger skin must not be inside the door panel and the hand must actually touch it;
//   • opening (Player 'open' stage: Boarding.doorHandleGrip on the outside handle): the solved grasp on the closed door —
//     skin not inside the door, palm / fingers on the handle.
// Run: node tools/door-grab-test.mjs   (V=1 per-vehicle numbers; OLD=1 measures the old wrist-point grip for comparison)
import './node-dom-stub.mjs';
import * as THREE from 'three';
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
{ const { MAT } = await import('../src/gfx/Materials.js'); Object.setPrototypeOf(MAT, new Proxy({}, { get: (t, k) => { if (typeof k !== 'string') return undefined; if (!t[k]) t[k] = new THREE.MeshStandardMaterial({ vertexColors: true }); return t[k]; } })); }
const { createVehicleMesh, VTYPES } = await import('../src/vehicles/VehicleModels.js');
const { allDoorsLive } = await import('../src/vehicles/DoorRig.js');
const { Character, HEROES } = await import('../src/actors/Character.js');
const { boardGeom, boardCurve, poseBoard, boardKind, BOARD_T, doorGripFn, doorHandleGrip, doorHoldAngle } = await import('../src/actors/Boarding.js');
const Vb = !!process.env.V, OLD = !!process.env.OLD;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; if (fail < 50) console.log('  FAIL', m); } };
const rc = new THREE.Raycaster(); const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d) => new THREE.Vector3(...d));
const inside = (p, meshes) => { let n = 0; for (const d of DIRS) { rc.set(p, d); rc.far = 0.3; const h = rc.intersectObjects(meshes, false)[0]; if (h && h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(d) > 0) n++; } return n >= 4; };
const near = (p, meshes) => { let best = 9; for (const d of DIRS) { rc.set(p, d); rc.far = 0.06; const h = rc.intersectObjects(meshes, false)[0]; if (h) best = Math.min(best, h.distance); } return best; };
const HAND = /^(hand|idx|mid|rng|pnk|thb)[123]?([LR])$/;
const types = Object.keys(VTYPES).filter((t) => { const k = boardKind({ T: VTYPES[t] }); return (k === 'car' || k === 'van' || k === 'cab') && (!process.env.TYPES || process.env.TYPES.split(',').includes(t)); });
const heroes = ['dineth', 'shashika', 'david']; const chars = heroes.map((h) => new Character(HEROES[h]));
const summary = [];
for (const type of types) {
  const T = VTYPES[type]; const g = createVehicleMesh(type, 1); const ud = g.userData; const d = ud.door; if (!d || d.slide || d.leaf) continue;
  const scene = new THREE.Scene(); scene.add(g); allDoorsLive(ud); const seat = ud.seats.find((s) => s.driver) || ud.seats[0]; const side = ud.entry ? ud.entry.side : -1;
  const meshes = []; d.pivot.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); meshes.push(o); } });
  const setAng = (a) => { d.ang = a; d.pivot.rotation.y = d.max * a * (side < 0 ? 1 : -1); d.pivot.updateMatrixWorld(true); };
  for (let hi = 0; hi < chars.length; hi++) {
    const ch = chars[hi]; const A = ch.anim; const S = side < 0 ? 'R' : 'L'; const mesh = ch.mesh; const sk = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, bones = mesh.skeleton.bones;
    const verts = []; for (let i = 0; i < mesh.geometry.attributes.position.count; i += 3) { let mb = sk.getX(i), mw = sw.getX(i); for (let c = 1; c < 4; c++) if (sw.getComponent(i, c) > mw) { mw = sw.getComponent(i, c); mb = sk.getComponent(i, c); } const m = HAND.exec(bones[mb].name); if (m && m[2] === S) verts.push(i); }
    g.add(ch.root); const v = new THREE.Vector3(); const tag = `${type} ${heroes[hi]}`;
    const measure = () => { scene.updateMatrixWorld(true); mesh.skeleton.update(); let bur = 0, gap = 9; for (const i of verts) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); if (inside(v, meshes)) bur++; else gap = Math.min(gap, near(v, meshes)); } return { bur: bur / verts.length, gap }; };
    // ---- stepping in, door held
    setAng(0); const doorG = { x: d.pivot.position.x, z: d.pivot.position.z, len: d.len, max: d.max };
    const G = boardGeom({ T, mesh: g }, seat, A, side, doorG); const holdA = process.env.ANG ? +process.env.ANG : OLD ? 1 : doorHoldAngle(G, d, ch, side); setAng(holdA); G.doorGrip = doorGripFn(d, doorG, side, OLD ? null : ch);
    if (!G.doorGrip) { ch.root.removeFromParent(); continue; }
    A.board = null; A.seated = null; A.seatW = 0; for (let k = 0; k < 20; k++) { ch.root.position.set(0, 0, 0); A.update(1 / 60, 0, 0); }
    const dt = 1 / 60, N = Math.ceil(BOARD_T[boardKind({ T })] / dt); let worst = 0, gapW = 0, held = 0, gFr = 0, spW = 0, prevH = null;
    for (let i = 0; i <= N; i++) { const u = i / N; const F = boardCurve(G, u); poseBoard(A, G, F, g, () => 0, 0, 1); A.update(dt, 0, 0);
      { const hp = ch.bones['hand' + S].getWorldPosition(new THREE.Vector3()); if (prevH) { const sp = hp.distanceTo(prevH) / dt; spW = Math.max(spW, sp); if (sp > 6 && (process.env.DBG || process.env.SPD)) console.log(`  speed u ${u.toFixed(3)} ${sp.toFixed(1)} m/s`); } prevH = hp; }
      const hq = F.handQ && F.handQ[S]; const hw = F.handW ? F.handW[S] || 0 : 0; const grasp = OLD ? (u < 0.45 && hw > 0.8) : (hq && hq.w > 0.8 && hw > 0.8 && F.fing && F.fing[S] && F.fing[S].w > 0.95);
      if (i % 4) continue; const r = measure(); worst = Math.max(worst, r.bur); if (process.env.DBG && r.bur > 0.05) console.log(`  buried u ${u.toFixed(2)} ${(r.bur * 100).toFixed(0)}% grasp ${!!grasp} hq ${hq ? hq.w.toFixed(2) : '-'} hw ${hw.toFixed(2)} handInPivot ${d.pivot.worldToLocal(ch.bones['hand' + S].getWorldPosition(new THREE.Vector3())).toArray().map((x) => x.toFixed(3))} tgt ${F.hands && F.hands[S] ? F.hands[S].map((x) => x.toFixed(2)) : '-'} win ${JSON.stringify(d.grab.win)}`); if (!grasp) continue; gFr++;
      const dg0 = G.doorGrip(); const hpw = ch.bones['hand' + S].getWorldPosition(new THREE.Vector3()); const err = hpw.distanceTo(new THREE.Vector3(dg0[0], dg0[1], dg0[2]).applyMatrix4(g.matrixWorld));
      if (err < 0.015) { held++; gapW = Math.max(gapW, r.gap); if (process.env.DBG) console.log(`  held u ${u.toFixed(2)} err ${(err * 1000).toFixed(0)} gap ${r.gap}`); } else if (!OLD && err > 0.05 && F.fing && F.fing[S] && F.fing[S].w > 0.95) ok(r.gap > 0.004 || r.bur > 0, `${tag}: u ${u.toFixed(2)} hand ${(err * 1000).toFixed(0)} mm off its door grasp yet brushing the door`);
      if (process.env.DBG) { const dg = G.doorGrip(); const tw = new THREE.Vector3(dg[0], dg[1], dg[2]).applyMatrix4(g.matrixWorld); const hb = ch.bones['hand' + S]; const hp = hb.getWorldPosition(new THREE.Vector3()); const hqW = hb.getWorldQuaternion(new THREE.Quaternion()); const want = g.getWorldQuaternion(new THREE.Quaternion()).multiply(dg.q);
        const sh = ch.bones['arm' + S].getWorldPosition(new THREE.Vector3()); console.log(`u=${u.toFixed(2)} wristErr ${(hp.distanceTo(tw) * 1000).toFixed(0)}mm angErr ${(2 * Math.acos(Math.min(1, Math.abs(hqW.dot(want))))).toFixed(2)} reach ${sh.distanceTo(tw).toFixed(3)} handW ${hw.toFixed(2)} qW ${hq ? hq.w.toFixed(2) : '-'} bur ${(r.bur * 100).toFixed(0)}% gap ${(r.gap * 1000).toFixed(0)}`); } }
    A.board = null;
    if (process.env.DBG && !OLD) { const { doorEdgeGrip } = await import('../src/actors/Boarding.js'); const E = doorEdgeGrip(ch, d.grab, S); for (let k = 0; k < 40; k++) { A.update(1 / 60, 0, 0); ch.rig.hand(S, E.pose, 1); }
      const hand = ch.bones['hand' + S]; hand.matrixWorld.compose(E.wrist.clone().applyMatrix4(d.pivot.matrixWorld), d.pivot.getWorldQuaternion(new THREE.Quaternion()).multiply(E.q), new THREE.Vector3(1, 1, 1)); for (const c of hand.children) c.updateMatrixWorld(true);
      mesh.skeleton.update(); let bur = 0, gap = 9; for (const i of verts) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); if (inside(v, meshes)) bur++; else gap = Math.min(gap, near(v, meshes)); } console.log(`  static edge grasp: in door ${(bur / verts.length * 100).toFixed(1)}% gap ${(gap * 1000).toFixed(0)} mm win ${JSON.stringify(d.grab.win)} wrist ${E.wrist.toArray().map((x) => x.toFixed(3))}`); }
    ok(!d.grab.win || held >= Math.max(1, gFr * 0.3), `${tag}: the outer hand holds the door in only ${held}/${gFr} grasp frames`);
    ok(spW < 6, `${tag}: getting in — the hand jumps (${spW.toFixed(1)} m/s)`);
    ok(worst < 0.08, `${tag}: getting in — ${(worst * 100).toFixed(0)}% of the hand skin inside the open door`);
    ok(gapW < 0.015, `${tag}: getting in — the hand is ${(gapW * 1000).toFixed(0)} mm off the door (not holding it)`);
    // ---- opening: the handle grasp on the closed door (pose the hand bone directly from the solved grasp)
    let hb = 0, hg = 0; const H = !OLD && doorHandleGrip(ch, d.grab, S);
    if (H) { setAng(0); for (let k = 0; k < 40; k++) { A.update(1 / 60, 0, 0); ch.rig.hand(S, H.pose, 1); }
      const hand = ch.bones['hand' + S]; hand.matrixWorld.compose(H.wrist.clone().applyMatrix4(d.pivot.matrixWorld), d.pivot.getWorldQuaternion(new THREE.Quaternion()).multiply(H.q), new THREE.Vector3(1, 1, 1)); for (const c of hand.children) c.updateMatrixWorld(true);
      mesh.skeleton.update(); let bur = 0, gap = 9; for (const i of verts) { mesh.getVertexPosition(i, v); v.applyMatrix4(mesh.matrixWorld); if (inside(v, meshes)) bur++; else gap = Math.min(gap, near(v, meshes)); } hb = bur / verts.length; hg = gap;
      ok(hb < 0.08, `${tag}: door handle — ${(hb * 100).toFixed(0)}% of the hand skin inside the door`); ok(hg < 0.01, `${tag}: door handle — hand ${(hg * 1000).toFixed(0)} mm off the door`); }
    summary.push(worst); if (Vb) console.log(`${tag.padEnd(22)} door held at ${holdA} · step-in: skin in door ≤${(worst * 100).toFixed(1)}% gap ≤${(gapW * 1000).toFixed(0)} mm (held ${held}/${gFr} frames)` + (H ? ` · handle: in door ${(hb * 100).toFixed(1)}% gap ${(hg * 1000).toFixed(0)} mm` : ''));
    ch.root.removeFromParent(); setAng(0);
  }
}
summary.sort((a, b) => a - b); if (summary.length) console.log(`hand skin inside the door while held: median ${(summary[summary.length >> 1] * 100).toFixed(1)}% · worst ${(summary[summary.length - 1] * 100).toFixed(1)}%`);
console.log(`door-grab: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
