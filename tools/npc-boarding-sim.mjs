// NPC step-in / step-out (node tools/npc-boarding-sim.mjs): police crews and 1990 medics get out of and back into their
// vehicles with the same motion as the player (Boarding.js), driven by the REAL PoliceResponse officer update on REAL
// vehicles (police car, police jeep, ambulance, police bike). Every frame checks
//  · nothing is NaN, no bone moves faster than 6 m/s while getting in / out (no pops at the seams into and out of it);
//  · soles never sink through the road outside the vehicle;
//  · after getting out both stand outside the body (driver's door open — crews leave it open on a call), clear of each other;
//  · after getting back in both sit exactly at their seats with the seat pose active and every door used latched shut;
//  · four-up cars use the rear doors; nobody's body passes through a door's opening band unless that door is open.
import './node-dom-stub.mjs';
const el = () => ({ style: { setProperty() {}, removeProperty() {} }, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild(c) { return c; }, append() {}, remove() {}, setAttribute() {}, querySelector: () => el(), querySelectorAll: () => [], addEventListener() {} });
const doc = globalThis.document; doc.body = doc.body || el(); doc.addEventListener = doc.addEventListener || (() => {}); globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
const THREE = await import('three');
const { Character } = await import('../src/actors/Character.js');
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
const { seatCharacter } = await import('../src/actors/Seating.js');
const { makePoliceAppearance, makeMedicAppearance } = await import('../src/actors/Appearance.js');
const PR = await import('../src/police/PoliceResponse.js');
const L = await import('../src/world/Layout.js');
const { updateDoorClosers } = await import('../src/vehicles/DoorRig.js');

let pass = 0, fail = 0; const fails = []; const seen = new Set(); const ok = (c, m) => { if (c) pass++; else { fail++; const key = m.replace(/[0-9.-]+/g, '#'); if (!seen.has(key) && fails.length < 60) { seen.add(key); fails.push(m); } } };
const DT = 1 / 60; const BONES = ['hips', 'spine', 'chest', 'head', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR'];
const W = (ch, n) => { const v = new THREE.Vector3(); ch.bones[n].getWorldPosition(v); return v; };
const collision = { groundAt: (x, z) => L.groundY(x, z), resolveCircle: (x, z) => ({ x, z, hit: false }), blocked: () => false, raycast: () => 1, query: () => [] };
const TYPES = process.env.TYPES ? process.env.TYPES.split(',') : ['police', 'policejeep', 'ambulance', 'policebike'];
const out = [];
for (const type of TYPES) {
  const scene = new THREE.Scene(); const v = new Vehicle(type, 11, scene); v.place(10, 20, 0.6); v.mesh.updateMatrixWorld(true);
  const traffic = { vehicles: [v], parked: [], all: () => [v], extend() {}, laneNear: () => null, drivableSegs: [], drivable: new Set(), release() {} };
  const g = { scene, collision, traffic, player: { x: 200, z: 200, y: 0, yaw: 0, speed: 0 }, hud: { notify() {}, subtitle() {} }, director: { active: false }, story: { state: { money: 0 }, pay() {} },
    camera: { position: new THREE.Vector3(200, 2, 200), getWorldDirection: (q) => q.set(0, 0, 1) }, atmos: { night: 0, w: { rain: 0 } }, indoor: false, clock: 0, dt: DT, events: { emit() {}, on() {} } };
  const p = new PR.PoliceResponse(g); p.say = () => {}; p.radio = () => {};
  const ems = type === 'ambulance'; const u = { id: 1, v, officers: [], task: 'idle', patrol: false, arrived: true, footT: 0, stuckT: 0, planT: 0, goalPt: null, enterT: 0, ems }; v.police = u; v.ai = { pieces: [], s: 0, stopped: false };
  const seats = v.mesh.userData.seats; const di = seats.findIndex((q) => q.driver); const others = seats.map((q, i) => i).filter((i) => i !== di).sort((i, j) => Math.abs(seats[i].z - seats[di].z) - Math.abs(seats[j].z - seats[di].z));
  const crew = /police$|policejeep/.test(type) ? [di, ...others.slice(0, 3)] : [di, others[0]];
  for (const [k, si] of crew.map((si, k) => [k, si])) { if (si === undefined || si < 0 || (k === 1 && /bike/.test(type))) continue; /* police bikes are ridden solo */ const ch = new Character(ems ? makeMedicAppearance(9100 + k * 7) : makePoliceAppearance(7000 + k * 5, 'patrol', k === 1 ? { sex: 'f' } : {})); seatCharacter(ch, v, seats[si]);
    u.officers.push({ ch, unit: u, seat: seats[si], si, mode: 'seated', x: v.x, z: v.z, y: v.y, yaw: v.yaw, t: 0, hits: 0, acc: 0, noTorch: true, medic: ems }); }
  p.units = [u]; p.syncSeated(u); if (ems) p.ems.medic = () => {}; // (the medic's job itself is not under test)
  const st = { type, n: u.officers.length, maxV: 0, at: '', sink: 0, tOut: 0, tIn: 0 }; const prev = new Map(); const prevStage = new Map();
  const hw = v.T.wid / 2, hl = v.T.len / 2; const inv = new THREE.Matrix4().copy(v.mesh.matrixWorld).invert();
  const check = (phase) => {
    for (const o of u.officers) { const ch = o.ch; scene.updateMatrixWorld(true); const cur = BONES.map((n) => W(ch, n)); const stage = `${phase}:${o.mode}${o.boarding ? '*' : ''}`;
      for (const q of cur) ok(Number.isFinite(q.x + q.y + q.z), `${type}/${o.si}: NaN bone (${stage})`);
      const walk = /foot|return/.test(stage) || (/enter$/.test(stage) && /enter$|return|foot/.test(prevStage.get(o) || '')); // walking to the car / the last step to the stand point: ordinary gait
      const pr = prev.get(o); if (pr && !walk) cur.forEach((q, k) => { const sp = q.distanceTo(pr[k]) / DT; if (sp > st.maxV) { st.maxV = sp; st.at = `${BONES[k]} ${prevStage.get(o)}→${stage}`; } ok(sp < 6, `${type}/${o.si}: ${BONES[k]} moves ${sp.toFixed(1)} m/s (${prevStage.get(o)} → ${stage})`); });
      prev.set(o, cur); prevStage.set(o, stage);
      if (o.boarding || /exit|enter/.test(o.mode)) for (const d of v.mesh.userData.doors || []) { const zLo = d.slide ? d.hz - d.len : d.hz - d.len, zHi = d.hz; // a body part crossing this door's opening band
        for (const q of cur) { const l = q.clone().applyMatrix4(inv); if (Math.sign(l.x) === d.side && Math.abs(l.x) > hw - 0.06 && Math.abs(l.x) < hw + 0.04 && l.z > zLo + 0.06 && l.z < zHi - 0.04 && l.y > 0.35 && l.y < 1.2) { ok((d.ang || 0) > 0.6, `${type}/${o.si}: body passes a shut ${d.role}${d.side > 0 ? '+' : '-'} door (ang ${(d.ang || 0).toFixed(2)}, ${stage})`); break; } } }
      for (const f of ['footL', 'footR']) { const w = W(ch, f); const l = w.clone().applyMatrix4(inv); if (Math.abs(l.x) > hw + 0.02 || Math.abs(l.z) > hl) { const sink = 0.05 - (w.y - L.groundY(w.x, w.z)); st.sink = Math.max(st.sink, sink); ok(sink < 0.03, `${type}/${o.si}: sole ${sink.toFixed(3)} m into the road (${stage})`); } } }
  };
  // ---- out
  p.dismount(u, 'test'); let t = 0; while (u.officers.some((o) => o.mode !== 'foot') && t < 12) { for (const o of u.officers) if (o.mode !== 'foot') p.updateOfficer(o, u, DT); else o.ch.anim.update(DT, 0, 0); updateDoorClosers(DT); t += DT; check('out'); } st.tOut = t;
  const used = [...new Set(u.officers.map((o) => o.bf && o.bf.door).filter(Boolean))]; st.doors = used.map((d) => d.role + (d.side > 0 ? '+' : '-')).join(',');
  for (const d of used) ok((d.ang || 0) > 0.85, `${type}: ${d.role}${d.side > 0 ? '+' : '-'} door left open while the crew is out (ang ${(d.ang || 0).toFixed(2)})`);
  const door = v.mesh.userData.door;
  ok(u.officers.every((o) => o.mode === 'foot'), `${type}: crew out (stuck: ${u.officers.map((o) => o.mode).join(',')})`);
  for (const o of u.officers) { ok(o.ch.root.parent === scene && !o.ch.anim.board, `${type}/${o.si}: back in the world, board pose cleared`); const l = new THREE.Vector3(o.x, 0, o.z).applyMatrix4(inv); ok(Math.abs(l.x) > hw - 0.05, `${type}/${o.si}: stands outside the body side (|x| ${Math.abs(l.x).toFixed(2)} vs half-width ${hw.toFixed(2)})`); }
  if (u.officers.length === 2) { const [a, b] = u.officers; ok(Math.hypot(a.x - b.x, a.z - b.z) > 0.6, `${type}: the two officers stand clear of each other`); }
  if (door && door.len && !/bike/.test(type)) ok(used.includes(door), `${type}: the driver uses the driver's door`);
  if (/police$|policejeep/.test(type)) ok(used.filter((d) => d.role === 'rear').length === 2, `${type}: four-up crew uses both rear doors (${st.doors})`);
  // a few seconds standing about, then back to the car
  for (let i = 0; i < 60; i++) { for (const o of u.officers) { o.ch.anim.update(DT, 0, 0); } check('idle'); }
  u.task = 'mount'; for (const o of u.officers) { o.mode = 'return'; o.goal = null; o.retT = 0; }
  t = 0; while ((u.officers.some((o) => o.mode !== 'seated') || used.some((d) => (d.ang || 0) > 0)) && t < 25) { for (const o of u.officers) p.updateOfficer(o, u, DT); updateDoorClosers(DT); t += DT; check('in'); } st.tIn = t;
  for (const o of u.officers) { ok(o.mode === 'seated' && o.ch.root.parent === v.mesh && o.ch.root.position.distanceTo(new THREE.Vector3(o.seat.x, o.seat.y, o.seat.z)) < 1e-6, `${type}/${o.si}: seated at the seat (mode ${o.mode})`); ok(!o.ch.anim.board && o.ch.anim.seated === o.seat, `${type}/${o.si}: seat pose active`); }
  for (const d of used) ok((d.ang || 0) === 0 && !d.live, `${type}: ${d.role}${d.side > 0 ? '+' : '-'} door pulled shut, latched and folded back into the body (ang ${(d.ang || 0).toFixed(2)})`);
  if (!used.length && !/bike/.test(type)) ok(false, `${type}: no door used`);
  out.push(st);
}
for (const s of out) console.log(`${s.type.padEnd(11)} crew ${s.n} doors [${s.doors}]  out ${s.tOut.toFixed(1)} s  in ${s.tIn.toFixed(1)} s  max bone ${s.maxV.toFixed(1)} m/s (${s.at})  sink ${Math.max(0, s.sink).toFixed(3)}`);
for (const f of fails) console.log('FAIL', f);
console.log(`npc boarding: ${pass} checks, ${fail} failed`); process.exit(fail ? 1 : 0);
