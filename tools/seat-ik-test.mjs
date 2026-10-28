// Seat test (Node): builds every vehicle model (all variants) and seats short / average / tall adults in every seat.
// Checks per occupant: ankles reach the floor/peg target, hips rest on the cushion (not sunk), head clears the roof,
// hands reach the wheel rim / handlebar grips, knees clear the steering wheel, and occupants do not overlap.
import './node-dom-stub.mjs';
import * as THREE from 'three';
const { createVehicleMesh, VTYPES } = await import('../src/vehicles/VehicleModels.js');
const { makeSkeleton } = await import('../src/actors/Character.js');
const { applySeatPose, seatLocal } = await import('../src/actors/Seating.js');
let fails = 0, checks = 0; const bad = []; const worst = {};
const P = (b, n) => new THREE.Vector3().setFromMatrixPosition(b[n].matrixWorld);
for (const type of Object.keys(VTYPES)) for (let variant = 0; variant < 4; variant++) {
  const g = createVehicleMesh(type, variant); const seats = g.userData.seats; const hipsW = [];
  for (const height of [1.52, 1.68, 1.88]) seats.forEach((seat, si) => {
    const sp = { sex: height < 1.6 ? 'f' : 'm', height, build: height > 1.8 ? 1.08 : 0.96 }; const { bones } = makeSkeleton(sp, 'k' + height + sp.build);
    const b = Object.fromEntries(bones.map((x) => [x.name, x])); const root = new THREE.Group(); const mesh = new THREE.Group(); root.add(mesh); mesh.add(bones[0]);
    root.position.set(seat.x, seat.y, seat.z); // vehicle frame == world frame here
    const s = height / 1.72; const A = { ch: { bones: b, root, spec: sp }, s, ankle: 0.085 * s, seatW: 1, seatL: seatLocal(seat), t: 0, seed: 0.3, vehSpeed: 0, seatLookT: 9, steer: 0 };
    applySeatPose(A, 0.016); root.updateMatrixWorld(true);
    const L = seatLocal(seat); const issues = [];
    const tgt = new THREE.Vector3(seat.x + seat.fx, seat.floor + 0.085 * s, seat.z + seat.fz); const ae = P(b, 'footL').distanceTo(tgt); if (ae > 0.035) issues.push('ankle ' + ae.toFixed(3));
    const hj = P(b, 'thighL').y - seat.y; if (hj < 0.03 || hj > 0.15) issues.push('hip ' + hj.toFixed(3));
    const crown = P(b, 'head').y + 0.2 * s + 0.02; if (crown > seat.roof) issues.push(`head ${crown.toFixed(2)}>${seat.roof.toFixed(2)}`);
    const knee = P(b, 'shinL'), kneeR = P(b, 'shinR');
    if (seat.wheel) { const W = seat.wheel; const c = new THREE.Vector3(...W.p); const hd = Math.abs(P(b, 'handL').distanceTo(c) - W.r); if (hd > 0.09) issues.push('handL→rim ' + hd.toFixed(3));
      const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(1, 0, 0), W.tilt); // wheel axis
      for (const k of [knee, kneeR]) { for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const rp = new THREE.Vector3(Math.cos(a) * W.r, Math.sin(a) * W.r * Math.cos(W.tilt), Math.sin(a) * W.r * Math.sin(W.tilt)).add(c); const d = rp.distanceTo(k); if (d < 0.075) { issues.push('knee↔wheel ' + d.toFixed(3)); break; } } } }
    if (seat.bars) { const gl = seat.bars[0][0] > 0 ? seat.bars[0] : seat.bars[1]; const hd = P(b, 'handL').distanceTo(new THREE.Vector3(...gl)); if (hd > 0.12) issues.push('handL→grip ' + hd.toFixed(3)); }
    if (height === 1.88) hipsW.push({ si, p: P(b, 'hips'), seat });
    const key = `${type}`; worst[key] = Math.max(worst[key] ?? -9, crown - seat.roof);
    checks++; if (issues.length) { fails++; if (bad.length < 40) bad.push(`${type}/v${variant} seat${si}${seat.driver ? '(drv)' : ''} h${height}: ${issues.join(', ')}`); }
  });
  // occupant overlap (tallest adults in every seat at once): hips at least 0.36 m apart side-by-side
  for (let i = 0; i < hipsW.length; i++) for (let j = i + 1; j < hipsW.length; j++) { const a = hipsW[i], c = hipsW[j]; const dx = Math.abs(a.p.x - c.p.x), dz = Math.abs(a.p.z - c.p.z); if (dz < 0.3 && dx < 0.36) { fails++; bad.push(`${type}/v${variant} seats ${a.si}&${c.si} overlap dx=${dx.toFixed(2)}`); } }
}
console.log(bad.join('\n')); console.log('head margin (crown − roof, worst, should be < 0):', Object.entries(worst).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('  '));
console.log(`${checks} occupant checks, ${fails} failures`); process.exit(fails ? 1 : 0);
