// Traffic passengers getting out (node tools/traffic-disembark-test.mjs): REAL Traffic.disembark / updateDisembark on REAL
// vehicles with every seat taken (cars incl. rear seats, SUV, van, taxi, tuk-tuk, bus, private bus). Every frame:
//  · nothing NaN, no bone faster than 6.5 m/s (no pops between seat pose, step-out and walking);
//  · a body part crossing the vehicle's side plane does so only at an OPEN door: car/van — through that seat's own door
//    while it is open; bus — only inside a doorway (z band) with both of its leaves swung open;
//  · bus passengers walk on the floor / treads (hips never below the tread they are over);
// and at the end everyone has been handed to the crowd standing outside the body, and the doors are shut again
// (passengers who calmly get out push their door to; the bus leaves close after the last one is down).
import './node-dom-stub.mjs';
const THREE = await import('three');
const { Character, randomSpec } = await import('../src/actors/Character.js');
const { Vehicle } = await import('../src/vehicles/Vehicle.js');
const { Traffic } = await import('../src/vehicles/Traffic.js');
const { seatCharacter } = await import('../src/actors/Seating.js');
const { VTYPES } = await import('../src/vehicles/VehicleModels.js');
const { updateDoorClosers } = await import('../src/vehicles/DoorRig.js');
const L = await import('../src/world/Layout.js');
let pass = 0, fail = 0; const fails = []; const seen = new Set(); const ok = (c, m) => { if (c) pass++; else { fail++; const key = m.replace(/[0-9.-]+/g, '#'); if (!seen.has(key) && fails.length < 50) { seen.add(key); fails.push(m); } } };
const DT = 1 / 60; const BONES = ['hips', 'spine', 'chest', 'head', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR'];
const collision = { groundAt: (x, z) => L.groundY(x, z), resolveCircle: (x, z) => ({ x, z, hit: false }), blocked: () => false, raycast: () => 1, query: () => [] };
const carOf = (base) => Object.keys(VTYPES).find((k) => (VTYPES[k].base || k) === base && !VTYPES[k].police && !VTYPES[k].ambulance && VTYPES[k].entry === (base === 'van' ? 'van' : 'car'));
const TYPES = process.env.TYPES ? process.env.TYPES.split(',') : [...new Set(['taxi', carOf('car') || 'car', carOf('suv') || 'suv', 'van', 'tuktuk', 'bus', 'pbus'])].filter((t) => VTYPES[t]);
const rows = [];
for (const type of TYPES) for (const reason of ['calm', 'flee']) {
  const scene = new THREE.Scene(); const tr = new Traffic(scene, collision, { emit() {}, on() {} }); const adopted = [];
  tr.crowd = { adopt: (ch, x, z, yaw) => adopted.push({ ch, x, z, yaw }) };
  const v = new Vehicle(type, 21, scene); v.place(12, 30, 0.4); v.speed = 0; v.mesh.updateMatrixWorld(true); const ud = v.mesh.userData; const seats = ud.seats; const W = v.T.wid / 2;
  tr.addDriver(v); const bus = type === 'bus' || type === 'pbus';
  let free = seats.map((q, i) => i).filter((i) => !seats[i].driver); if (bus) free = free.filter((i, k) => k % 5 === 0 || seats[i].z > v.T.len / 2 - 3 || seats[i].z < -v.T.len / 2 + 1.6).slice(0, 12);
  v.paxPlan = free.map((si, k) => ({ si, spec: randomSpec(4000 + k * 17, { sex: k % 3 ? 'm' : 'f', age: 'adult' }), mode: 'lap' })); v.pax = [];
  for (const p of v.paxPlan) { const ch = new Character(p.spec); seatCharacter(ch, v, seats[p.si], 'lap'); v.pax.push(ch); }
  const n = v.pax.length; tr.paxCount = n; tr.disembark(v, reason, null);
  const st = { type, reason, n, maxV: 0, at: '', t: 0, doors: new Set() }; const prev = new Map(); const inv = new THREE.Matrix4().copy(v.mesh.matrixWorld).invert(); const q = new THREE.Vector3();
  const list = v.disembarking; for (const o of list) if (o.bf && o.bf.door) st.doors.add(o.bf.door.role + (o.bf.door.side > 0 ? '+' : '-'));
  let t = 0; while (t < 40 && list.some((o) => !o.done)) {
    tr.updateDisembark(DT); updateDoorClosers(DT); t += DT; v.mesh.updateMatrixWorld(true);
    for (const o of list) { const ch = o.ch; if (o.done) { prev.delete(ch); continue; } ch.root.updateMatrixWorld(true); const cur = {};
      for (const b of BONES) { const w = ch.bones[b].getWorldPosition(new THREE.Vector3()); cur[b] = w; if (!Number.isFinite(w.x + w.y + w.z)) { ok(false, `${type}/${reason}: NaN bone ${b}`); continue; }
        const pw = prev.get(ch); if (pw && o.t > 0.05) { const sp = w.distanceTo(pw[b]) / DT; if (sp > st.maxV) { st.maxV = sp; st.at = `${b} t${o.t.toFixed(2)}`; } ok(sp < 6.5, `${type}/${reason}: ${b} ${sp.toFixed(1)} m/s at t ${o.t.toFixed(2)}`); }
        q.copy(w).applyMatrix4(inv); const out = Math.abs(q.x) > W - 0.02 && q.y > 0.25 && q.y < 2.4 && q.z > -v.T.len / 2 + 0.3 && q.z < v.T.len / 2 - 0.3;
        if (out && Math.abs(q.x) < W + 0.04) { // a body part passing the side plane right now
          if (bus) { const lv = ud.doors.filter((d) => d.leaf && Math.abs(d.hz - d.leaf * 0.475 - o.P.dz) < 0.2); ok(q.x > 0 && Math.abs(q.z - o.P.dz) < 0.46 && lv.every((d) => d.ang > 0.8), `${type}/${reason}: ${b} through the side at z ${(q.z - o.P.dz).toFixed(2)} from its doorway (leaves ${lv.map((d) => d.ang.toFixed(2))})`); }
          else if (o.bf && o.bf.door) { const d = o.bf.door; ok(d.ang > 0.45, `${type}/${reason}: ${b} through the ${d.role} door opening while it is shut-ish (ang ${d.ang.toFixed(2)})`); }
        }
        if (bus && o.walking && b === 'hips') { const fl = Math.abs(q.x) < W - 0.62 ? 0.92 : 0; ok(q.y > fl + 0.55, `${type}/${reason}: hips ${q.y.toFixed(2)} over floor ${fl} (x ${q.x.toFixed(2)})`); }
      }
      prev.set(ch, cur); }
  }
  st.t = t; ok(adopted.length === n, `${type}/${reason}: all ${n} passengers handed to the crowd (${adopted.length}) in ${t.toFixed(1)} s`);
  for (const a of adopted) { q.set(a.x, 0, a.z).applyMatrix4(inv); ok(Math.abs(q.x) > W + 0.15 || Math.abs(q.z) > v.T.len / 2 + 0.15, `${type}/${reason}: adopted outside the body (local ${q.x.toFixed(2)}, ${q.z.toFixed(2)})`); ok(!a.ch.root.parent || a.ch.root.parent !== v.mesh, `${type}/${reason}: no longer parented to the vehicle`); }
  for (let k = 0; k < 240; k++) updateDoorClosers(DT);
  const doors = ud.doors || []; if (reason === 'calm' || bus) ok(doors.every((d) => (d.ang || 0) < 0.02), `${type}/${reason}: doors shut afterwards (${doors.map((d) => (d.role || '') + (d.ang || 0).toFixed(2)).join(' ')})`);
  ok(!tr.leaving.includes(v) && tr.paxCount === 0, `${type}/${reason}: bookkeeping cleared`);
  rows.push(st); for (const a of adopted) a.ch.dispose?.();
}
for (const s of rows) console.log(`${s.type.padEnd(10)} ${s.reason.padEnd(5)} ${String(s.n).padStart(2)} pax  doors [${[...s.doors].join(',')}]  all out ${s.t.toFixed(1)} s  max bone ${s.maxV.toFixed(1)} m/s (${s.at})`);
console.log(`traffic-disembark-test: ${pass} passed, ${fail} failed`); for (const f of fails) console.log('  FAIL', f);
process.exit(fail ? 1 : 0);
