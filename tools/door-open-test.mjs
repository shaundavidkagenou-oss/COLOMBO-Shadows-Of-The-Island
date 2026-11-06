// Door opening test (Node): the REAL Player stage machine (Dineth, finger-rigged hero) walks up to every hinged-door car /
// van and opens the door by its handle. During the 'open' stage it checks
//   • the hand really takes the handle: while the reach is at full weight the hand bone is on the solved grasp (≤ 2 cm) and
//     the hand / finger skin is touching the door, not inside it (≤ 8 % of the hand vertices);
//   • the latch only pops once the hand is on the handle, and the door then swings out to its hold angle;
//   • the door never sweeps through the player: chest / hips / knees stay outside the swinging panel's volume;
//   • the trunk / arms never jump (< 6 m/s; the legs, taking real steps, < 7 m/s), and the stage hands over to the step-in cleanly.
// Run: node tools/door-open-test.mjs   (TYPES=a,b to pick vehicles, V=1 per-vehicle numbers)
import './node-dom-stub.mjs';
import * as THREE from 'three';
{ let sd = +(process.env.SEED || 7); Math.random = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; }; } // reproducible idle variation
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.addEventListener ??= () => {};
{ const doc = globalThis.document; if (doc && !doc.addEventListener) doc.addEventListener = () => {}; }
const { Player } = await import('../src/actors/Player.js');
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
const { boardKind, doorHandleGrip } = await import('../src/actors/Boarding.js');
const { updateDoorClosers, allDoorsLive } = await import('../src/vehicles/DoorRig.js');
const { VTYPES } = await import('../src/vehicles/VehicleModels.js');
const L = await import('../src/world/Layout.js');
const Vb = !!process.env.V;
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; if (fail < 60) console.log('  FAIL', m); } };
const collision = { groundAt: (x, z) => L.groundY(x, z), resolveCircle: (x, z) => ({ x, z }), blocked: () => false, raycast: () => 1, query: () => [] };
const events = { emit() {}, on() {} };
const rc = new THREE.Raycaster(); const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((d) => new THREE.Vector3(...d));
const inside = (p, meshes) => { let n = 0; for (const d of DIRS) { rc.set(p, d); rc.far = 0.3; const h = rc.intersectObjects(meshes, false)[0]; if (h && h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(d) > 0) n++; } return n >= 4; };
const near = (p, meshes) => { let best = 9; for (const d of DIRS) { rc.set(p, d); rc.far = 0.06; const h = rc.intersectObjects(meshes, false)[0]; if (h) best = Math.min(best, h.distance); } return best; };
const DIR14 = DIRS.concat([[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]].map((d) => new THREE.Vector3(...d).normalize()));
const within = (p, r, meshes) => { for (const d of DIR14) { rc.set(p, d); rc.far = r; if (rc.intersectObjects(meshes, false).length) return true; } return inside(p, meshes); };
const HAND = /^(hand|idx|mid|rng|pnk|thb)[123]?([LR])$/;
const types = Object.keys(VTYPES).filter((t) => { const k = boardKind({ T: VTYPES[t] }); return (k === 'car' || k === 'van') && (!process.env.TYPES || process.env.TYPES.split(',').includes(t)); });
const DT = 1 / 60; const BODY = ['chest', 'hips', 'shinL', 'shinR', 'thighL', 'thighR', 'head'];
for (const type of types) {
  const scene = new THREE.Scene(); const v = new Vehicle(type, 7, scene); v.place(10, 20, 0.6); v.mesh.updateMatrixWorld(true);
  const ud = v.mesh.userData; const d = ud.door; if (!d || d.slide || d.leaf || !d.grab || !d.grab.handle) continue; allDoorsLive(ud);
  const P = new Player(scene, new THREE.PerspectiveCamera(), collision, events); P.nightLights = false;
  const ch = P.ch; const S = ud.entry.side < 0 ? 'R' : 'L'; const H = doorHandleGrip(ch, d.grab, S); if (!H) { ok(false, `${type}: no handle grasp`); continue; }
  const meshes = []; d.pivot.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); meshes.push(o); } });
  const mesh = ch.mesh; const sk = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight, bones = mesh.skeleton.bones; const verts = [];
  for (let i = 0; i < mesh.geometry.attributes.position.count; i += 3) { let mb = sk.getX(i), mw = sw.getX(i); for (let c = 1; c < 4; c++) if (sw.getComponent(i, c) > mw) { mw = sw.getComponent(i, c); mb = sk.getComponent(i, c); } const m = HAND.exec(bones[mb].name); if (m && m[2] === S) verts.push(i); }
  // the door's own volume in its pivot frame (closed): body joints (as spheres) must stay out of it while it swings
  d.pivot.rotation.y = 0; d.pivot.updateMatrixWorld(true); const box = new THREE.Box3(); { const ip = new THREE.Matrix4().copy(d.pivot.matrixWorld).invert(); for (const m of meshes) { m.geometry.computeBoundingBox(); const bb = m.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(ip, m.matrixWorld)); box.union(bb); } }
  const RAD = { chest: 0.13, hips: 0.12, shinL: 0.055, shinR: 0.055, thighL: 0.08, thighR: 0.08, head: 0.11 };
  const e = ud.entry; const sp = new THREE.Vector3(e.x * 2.2, 0, e.z - 1.5).applyMatrix4(v.mesh.matrixWorld); P.x = sp.x; P.z = sp.z; P.y = 0; P.yaw = v.yaw; P.sync();
  P.enterVehicle(v, { takeOver: () => false, release() {} });
  let t = 0, prev = null, sawOpen = false, onHandle = 0, worstBur = 0, worstErr = 0, maxV = 0, maxLeg = 0, popAt = -1, popErr = 9, bodyHit = 0, hold = 1, endAng = 0, next = '';
  const v3 = new THREE.Vector3(); const inv = new THREE.Matrix4();
  while (P.entry && t < 12) {
    const was = P.entry.stage; const ang0 = d.ang || 0; P.updateEntry(DT); updateDoorClosers(DT); t += DT; if (!P.entry) break; const st = P.entry.stage;
    if (was === 'open' && st !== 'open') { endAng = d.ang; next = st; hold = P.entry.G ? P.entry.G.doorHold : 1; }
    if (st !== 'open') { prev = null; if (sawOpen && st !== 'open') { if (st === 'toSill' || st === 'stepIn') { /* door keeps clear of the body while stepping to the sill */ } } continue; }
    sawOpen = true; scene.updateMatrixWorld(true); mesh.skeleton.update();
    const cur = BODY.concat(['hand' + S, 'fore' + S]).map((n) => ch.bones[n].getWorldPosition(new THREE.Vector3()));
    if (prev) cur.forEach((p, k) => { const s = p.distanceTo(prev[k]) / DT; if (/^(shin|thigh)/.test(BODY[k] || '')) maxLeg = Math.max(maxLeg, s); else maxV = Math.max(maxV, s); if (s > (+process.env.JT || 6) && process.env.DBG) console.log(`  jump ${k} t ${P.entry.t.toFixed(2)} ${s.toFixed(1)}`); }); prev = cur;
    if (process.env.DUMP === type && P.entry.t > 0.28 && P.entry.t < 0.46) { const A = ch.anim; console.log(`  dump t ${P.entry.t.toFixed(3)} sp ${A.speed.toFixed(2)} w ${A.locoW.toFixed(2)} cyc ${A.cyc.toFixed(3)} crouch ${A.crouch.toFixed(2)} hipYs ${A.hipYs.toFixed(3)} shinL ${cur[2].toArray().map((x) => x.toFixed(3))} shinR ${cur[3].toArray().map((x) => x.toFixed(3))} legs ${A.legState.map((l) => `${l.contact ? 'C' : 's'}${l.u.toFixed(2)} th${l.thW.toFixed(2)} kn${l.kn.toFixed(2)}`).join(' ')}`); }
    const R = ch.anim.reach; const hb = ch.bones['hand' + S].getWorldPosition(new THREE.Vector3());
    if (R && R.w > 0.98) { const err = hb.distanceTo(R.p); worstErr = Math.max(worstErr, err); let bur = 0, gap = 9; for (const i of verts) { mesh.getVertexPosition(i, v3); v3.applyMatrix4(mesh.matrixWorld); if (inside(v3, meshes)) bur++; else gap = Math.min(gap, near(v3, meshes)); } bur /= verts.length; worstBur = Math.max(worstBur, bur); if (process.env.DBG) console.log(`  bur t ${P.entry.t.toFixed(2)} ${(bur * 100).toFixed(1)}% gap ${(gap * 1000).toFixed(0)} err ${(err * 1000).toFixed(0)}`); if (err < 0.02 && gap < 0.01) onHandle++; }
    if (popAt < 0 && ang0 < 0.002 && d.ang >= 0.002) { popAt = P.entry.t; d.pivot.updateMatrixWorld(true); popErr = hb.distanceTo(H.wrist.clone().applyMatrix4(d.pivot.matrixWorld)); }
    // body vs the swinging panel: a body joint inside the door's slab (pivot frame: panel from the hinge back along −z, ±6 cm thick, below the roof)
    d.pivot.updateMatrixWorld(true); inv.copy(d.pivot.matrixWorld).invert();
    for (let k = 0; k < BODY.length; k++) { const l = cur[k].clone().applyMatrix4(inv); const r = RAD[BODY[k]]; if (l.x > box.min.x - r && l.x < box.max.x + r && l.y > box.min.y - r && l.y < box.max.y + r && l.z > box.min.z - r && l.z < box.max.z + r && within(cur[k], r * 0.8, meshes)) { /* the joint's flesh (≈ its radius) touches the door surface */ bodyHit++; if (process.env.DBG) console.log(`  body ${BODY[k]} t ${P.entry.t.toFixed(2)} local ${l.toArray().map((x) => x.toFixed(2))} ang ${d.ang.toFixed(2)}`); } }
    if (process.env.DBG && R) console.log(`  t ${P.entry.t.toFixed(2)} w ${R.w.toFixed(2)} err ${(hb.distanceTo(R.p) * 1000).toFixed(0)} ang ${d.ang.toFixed(3)} lean ${(ch.anim._rLean || 0).toFixed(2)} dsh ${ch.bones['arm' + S].getWorldPosition(new THREE.Vector3()).distanceTo(R.p).toFixed(3)} L ${(ch.bones['fore' + S].position.length() + ch.bones['hand' + S].position.length()).toFixed(3)} pY ${(R.p.y - P.y).toFixed(2)} shY ${(ch.bones['arm' + S].getWorldPosition(new THREE.Vector3()).y - P.y).toFixed(2)} hipY ${(ch.bones.hips.getWorldPosition(new THREE.Vector3()).y - P.y).toFixed(2)}`);
  }
  ok(sawOpen, `${type}: the open stage never ran`);
  ok(onHandle >= 6, `${type}: the hand is on the handle in only ${onHandle} frames`);
  ok(worstErr < 0.02, `${type}: hand ${(worstErr * 1000).toFixed(0)} mm off the handle grasp at full reach`);
  ok(worstBur < 0.08, `${type}: ${(worstBur * 100).toFixed(1)}% of the hand skin inside the door on the handle`);
  ok(popAt > 0 && popErr < 0.03, `${type}: latch pops with the hand ${(popErr * 1000).toFixed(0)} mm off the handle (t ${popAt.toFixed(2)})`);
  ok(bodyHit === 0, `${type}: the door sweeps through the player (${bodyHit} joint-frames)`);
  ok(maxV < 6, `${type}: the trunk / arm jumps ${maxV.toFixed(1)} m/s while opening`); ok(maxLeg < 7, `${type}: a leg jumps ${maxLeg.toFixed(1)} m/s while opening`);
  ok(Math.abs(endAng - hold) < 0.1 && next === 'toSill', `${type}: open ends at door ${endAng.toFixed(2)} (hold ${hold}) → ${next}`);
  if (Vb) console.log(`${type.padEnd(12)} hold ${hold} · on handle ${onHandle} frames · err ≤${(worstErr * 1000).toFixed(0)} mm · skin in door ≤${(worstBur * 100).toFixed(1)}% · pop t ${popAt.toFixed(2)} (${(popErr * 1000).toFixed(0)} mm) · body hits ${bodyHit} · max ${maxV.toFixed(1)} m/s (legs ${maxLeg.toFixed(1)}) · → ${next} at ${endAng.toFixed(2)}`);
  ch.root.removeFromParent();
}
console.log(`door-open: ${pass + fail} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
