// Vehicle entry/exit path checks (node tools/entry-test.mjs): for every vehicle with a hinged driver door, the standing
// spot is outside the door's swing, the body and knees never pass through the opened door panel, and the character is
// never seated while still outside the vehicle (the "sits before getting in" bug).
import './node-dom-stub.mjs';
const VM = await import('../src/vehicles/VehicleModels.js');
const { seatPath } = await import('../src/actors/Seating.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
for (const type of Object.keys(VM.VTYPES)) {
  const g = VM.createVehicleMesh(type, 3); const ud = g.userData; const T = VM.VTYPES[type]; const hw = T.wid / 2; const e = ud.entry;
  const seat = ud.seats.find((s) => s.driver) || ud.seats[0];
  if (!seat.ride && !ud.busDoor) { // never seated outside: while sitW > 0.5 the hips are within the body (+ sill overhang)
    let worst = 0; for (let i = 0; i <= 100; i++) { const p = seatPath(seat, [e.x, e.z], i / 100, hw); if (p.sitW > 0.5) worst = Math.max(worst, Math.abs(p.x) - hw); }
    ok(worst < 0.2, `${type}: seated ${worst.toFixed(2)} m outside the body side`);
    const p0 = seatPath(seat, [e.x, e.z], 0, hw), p1 = seatPath(seat, [e.x, e.z], 1, hw);
    ok(Math.abs(p0.x - e.x) < 1e-6 && p0.sitW < 1e-6, `${type}: path starts standing at the entry spot`); ok(Math.abs(p1.x - seat.x) < 1e-6 && Math.abs(p1.sitW - 1) < 1e-6 && p1.turn > 0.999, `${type}: path ends seated facing forward`);
  }
  const d = ud.door; if (!d) continue;
  const hx = d.pivot.position.x, hz = d.pivot.position.z; const L = hz - (g.userData.door && ud.entry ? 0 : 0); const len = (() => { let m = 0; d.pivot.traverse((o) => { if (o.geometry) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; m = Math.max(m, -b.min.z); } }); return m; })();
  ok(len > 0.6 && len < 1.4, `${type}: door length ${len.toFixed(2)}`);
  ok(Math.hypot(e.x - hx, e.z - hz) > len + 0.22, `${type}: standing spot clear of the door swing (${(Math.hypot(e.x - hx, e.z - hz) - len).toFixed(2)} m)`);
  const th = d.max * 1.05; const fx = hx + Math.sign(e.x) * len * Math.sin(th), fz = hz - len * Math.cos(th); // fully open (check-strap stop)
  let minT = 9, minK = 9;
  for (let i = 0; i <= 100; i++) { const u = i / 100; const p = seatPath(seat, [e.x, e.z], u, hw); const yaw = (1 - p.turn) * (-e.side * Math.PI / 2);
    if (Math.abs(p.x) > hw - 0.05) minT = Math.min(minT, segDist(p.x, p.z, hx, hz, fx, fz)); // torso, while outside the body line
    const kx = p.x + Math.sin(yaw) * 0.45 * p.sitW, kz = p.z + Math.cos(yaw) * 0.45 * p.sitW; if (Math.abs(kx) > hw - 0.05) minK = Math.min(minK, segDist(kx, kz, hx, hz, fx, fz)); }
  ok(minT > 0.24, `${type}: torso clears the open door by ${minT.toFixed(2)} m`); ok(minK > 0.1, `${type}: knees clear the open door by ${minK.toFixed(2)} m`);
}
console.log(`entry: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
