// High-detail vehicle kit (near LOD). Everything here is extra geometry layered on the base bodies built in
// VehicleModels.js: lamp internals (reflector bowls, projector lenses, bulbs, clear lens covers, DRL strips), grilles
// with slats and badge, bumper intakes and fog lamps, plate frames, wiper arms, shut lines, rain visors, door-handle
// recesses, mirror caps with repeaters, fuel flaps, mud flaps, drip rails, antennas, rear lamp segmentation and third
// brake lights, reflectors, exhaust tips, underbody (floor pan, suspension arms, tank, exhaust run) and cabin detail
// (instrument binnacle and dials, centre stack, vents, gear and hand-brake levers, pedals, seat belts, sun visors,
// grab handles, headrest posts). Built per model into a separate merged group that is only shown near the camera
// (Game.updateVehicleLOD), so the far city keeps its draw-call budget.
//
// High-detail wheels: lathed tyre with tread grooves + tread blocks + sidewall ring, multi-spoke / steel rims with
// lips, barrels, lug nuts, centre caps and valve stems, ventilated brake discs (spin with the wheel) and calipers (do not).
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
// reflector bowl, open towards +z, unit radius, depth 0.6
export const cupGeo = (() => { const p = []; for (let i = 0; i <= 8; i++) { const t = i / 8; p.push(V2(0.04 + Math.sin(t * Math.PI / 2) * 0.96, -0.6 * Math.cos(t * Math.PI / 2))); } const g = new THREE.LatheGeometry(p, 20); g.rotateX(Math.PI / 2); return g; })();
export const discZ = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 20); g.rotateX(Math.PI / 2); return g; })();
export const discX = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 20); g.rotateZ(Math.PI / 2); return g; })();
export const ringZ = new THREE.TorusGeometry(1, 0.12, 6, 24);
export const ringX = (() => { const g = new THREE.TorusGeometry(1, 0.12, 6, 24); g.rotateY(Math.PI / 2); return g; })();
export const arcX = (() => { const g = new THREE.TorusGeometry(1, 0.07, 5, 18, Math.PI); g.rotateY(Math.PI / 2); return g; })(); // half ring in the z/y plane (wheel-arch lip)
const hexX = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 6); g.rotateZ(Math.PI / 2); return g; })();
const sphLo = new THREE.SphereGeometry(1, 10, 6);

const _e = new THREE.Euler(), _v = new THREE.Vector3();
const loc = (o, rot, lx, ly, lz) => { _v.set(lx, ly, lz).applyEuler(_e.set(...rot)); return [o[0] + _v.x, o[1] + _v.y, o[2] + _v.z]; };

// ------------------------------------------------------------------------------------------------ cars / taxi / SUV / van
export function carDetail(dm, K, c) {
  const { beam, part, C, unitBox, unitCyl } = K;
  const { W, R, D, k, type, fz, rz, taper, gw0, gw1, fy, hy, nw, ty, sill, isVan, col, gh, roofF, roofR, seatY, sz, dz, floorY, variant } = c;
  const rub = dm.get('rubber'), chr = dm.get('chrome'), refl = dm.get('vrefl'), lens = dm.get('lens'), head = dm.get('vlight'), tail = dm.get('vtail'), ind = dm.get('vind'), pnt = dm.get('paint'), I = dm.get('interior'), gl = dm.get('glass');
  const black = C('#0e0e10'), dark = C('#1b1c1e'), chrome = C('#cfd3d7'), satin = C('#8d9196'), amber = C('#c87a14'), red = C('#8a1010');
  const xAt = (z, y) => W * taper(z, y);
  // ---- headlamps: housing interior, two reflector bowls, projector lens, bulbs, DRL strip, clear lens cover, black surround
  const rot = [-0.5, 0, 0];
  for (const sx of [-1, 1]) {
    const o = [sx * (nw - 0.18), (fy + hy) / 2 + 0.005, fz - 0.05];
    part(rub, unitBox, loc(o, rot, 0, 0, 0.056), rot, [0.33, 0.11, 0.004], C('#2a2c30')); // dark housing back plate
    for (const [lx, r] of [[sx * 0.085, 0.043], [-sx * 0.06, 0.038]]) {
      part(head, cupGeo, loc(o, rot, lx, 0.004, 0.083), rot, [r, r, r * 0.7]);
      part(head, sphLo, loc(o, rot, lx, 0.004, 0.071), rot, [0.011, 0.011, 0.011]);
      part(chr, ringZ, loc(o, rot, lx, 0.004, 0.083), rot, [r, r, r], satin);
    }
    part(lens, sphLo, loc(o, rot, -sx * 0.06, 0.004, 0.078), rot, [0.022, 0.022, 0.014]); // projector lens
    part(head, unitBox, loc(o, rot, 0, -0.046, 0.08), rot, [0.27, 0.008, 0.006]); // DRL light guide (part of the headlamp)
    part(lens, unitBox, loc(o, rot, 0, 0, 0.09), rot, [0.35, 0.125, 0.005]); // clear polycarbonate cover
    for (const [a, b] of [[[-0.18, 0.065], [0.18, 0.065]], [[-0.18, -0.065], [0.18, -0.065]], [[-0.18, -0.065], [-0.18, 0.065]], [[0.18, -0.065], [0.18, 0.065]]]) beam(rub, loc(o, rot, a[0], a[1], 0.088), loc(o, rot, b[0], b[1], 0.088), 0.008, 0.008, black);
    // indicator lens
    part(lens, unitBox, [sx * (nw - 0.02), (fy + hy) / 2 - 0.01, fz - 0.065], rot, [0.075, 0.095, 0.006]);
  }
  // ---- grille: chrome surround, slats, mesh bars, badge
  const gy0 = D.top[1][1] + 0.015, gy1 = fy - 0.005, gx = nw * 0.45, gz = fz + 0.024;
  for (const [a, b] of [[[-gx, gy0], [gx, gy0]], [[-gx, gy1], [gx, gy1]], [[-gx, gy0], [-gx, gy1]], [[gx, gy0], [gx, gy1]]]) beam(chr, [a[0], a[1], gz], [b[0], b[1], gz], 0.014, 0.014, chrome);
  for (let x = -gx + 0.05; x < gx - 0.02; x += 0.055) beam(rub, [x, gy0 + 0.006, gz - 0.006], [x, gy1 - 0.006, gz - 0.006], 0.007, 0.018, dark);
  part(chr, discZ, [0, (gy0 + gy1) / 2, gz + 0.012], [0, 0, 0], [0.06, 0.038, 0.012], chrome); part(rub, discZ, [0, (gy0 + gy1) / 2, gz + 0.019], [0, 0, 0], [0.046, 0.026, 0.002], C('#1d2a44')); // badge (plain oval, no brand)
  // ---- front bumper: lower intake with slats, fog lamps, tow-eye cover, plate frame, splitter lip
  const bz = fz + 0.061, iy = sill + 0.045;
  rub.box(0, iy, bz, nw * 1.1, 0.055, 0.004, { col: C('#070708') });
  for (let i = 0; i < 2; i++) rub.box(0, iy - 0.012 + i * 0.024, bz + 0.004, nw * 1.08, 0.006, 0.006, { col: C('#2a2b2e') });
  for (let x = -nw * 0.52; x <= nw * 0.52; x += 0.07) rub.box(x, iy, bz + 0.004, 0.006, 0.05, 0.006, { col: C('#2a2b2e') });
  for (const sx of [-1, 1]) { const fx = sx * (nw - 0.08), fy2 = sill + 0.1; part(rub, discZ, [fx, fy2, bz - 0.002], [0, 0, 0], [0.052, 0.052, 0.006], C('#070708')); part(refl, cupGeo, [fx, fy2, bz + 0.01], [0, 0, 0], [0.034, 0.034, 0.02], chrome); part(lens, discZ, [fx, fy2, bz + 0.012], [0, 0, 0], [0.036, 0.036, 0.004]); part(chr, ringZ, [fx, fy2, bz + 0.008], [0, 0, 0], [0.042, 0.042, 0.042], satin); }
  part(rub, discZ, [0.42, sill + 0.09, bz + 0.002], [0, 0, 0], [0.025, 0.018, 0.004], C('#232427'));
  for (const [a, b] of [[[-0.205, -0.062], [0.205, -0.062]], [[-0.205, 0.062], [0.205, 0.062]], [[-0.205, -0.062], [-0.205, 0.062]], [[0.205, -0.062], [0.205, 0.062]]]) beam(rub, [a[0], sill + 0.13 + a[1], fz + 0.067], [b[0], sill + 0.13 + b[1], fz + 0.067], 0.012, 0.006, black);
  rub.box(0, sill + 0.012, fz + 0.03, nw * 1.9, 0.014, 0.06, { col: black });
  // ---- bonnet shut lines + washer nozzles; wiper arms, blades, spines and pivot caps
  const bf = D.top[3], bb = D.top[4];
  beam(rub, [-(xAt(bf[0] - 0.03, bf[1]) - 0.06), bf[1] + 0.004, bf[0] - 0.03], [xAt(bf[0] - 0.03, bf[1]) - 0.06, bf[1] + 0.004, bf[0] - 0.03], 0.005, 0.004, black);
  for (const sx of [-1, 1]) { beam(rub, [sx * (xAt(bf[0], bf[1]) - 0.06), bf[1] + 0.004, bf[0] - 0.03], [sx * (Math.min(gw0, xAt(bb[0], bb[1])) - 0.06), bb[1] + 0.004, bb[0] + 0.05], 0.005, 0.004, black);
    part(rub, unitBox, [sx * 0.22, lerp(bf[1], bb[1], 0.8) + 0.008, lerp(bf[0], bb[0], 0.8)], [0, 0, 0], [0.02, 0.01, 0.02], black); }
  const sy = gh[0][1], szw = gh[0][0];
  for (const sx of [-1, 1]) {
    const a = [sx * 0.05, sy + 0.03, szw - 0.02], b = [sx * 0.55, sy + 0.05, szw - 0.1]; const p = [sx * 0.5 + 0.08, sy - 0.005, szw + 0.05];
    beam(chr, [a[0], a[1] + 0.012, a[2]], [b[0], b[1] + 0.012, b[2]], 0.006, 0.006, C('#1c1c1c'));
    beam(chr, p, [lerp(a[0], b[0], 0.45), lerp(a[1], b[1], 0.45) + 0.022, lerp(a[2], b[2], 0.45)], 0.012, 0.008, C('#1c1c1c'));
    part(rub, unitCyl, p, [0, 0, 0], [0.018, 0.02, 0.018], C('#151515'));
  }
  rub.box(0, sy - 0.004, szw + 0.06, gw0 * 1.85, 0.01, 0.1, { col: C('#121214') }); // scuttle panel
  // ---- roof: drip rails, antenna
  for (const sx of [-1, 1]) beam(rub, [sx * (gw1 - 0.002), roofF[2] + 0.004, roofF[0]], [sx * (gw1 - 0.002), roofR[2] + 0.004, roofR[0]], 0.012, 0.012, black);
  part(rub, sphLo, [0.0, roofR[2] + 0.03, roofR[0] + 0.12], [0, 0, 0], [0.03, 0.045, 0.085], C('#151517')); // shark-fin antenna
  // ---- sides
  const belt = gh[0][1] - 0.02;
  const doorsZ = [[D.door[0], D.door[1]]]; if (D.rearDoor) doorsZ.push([D.rearDoor[0], D.rearDoor[1]]);
  for (const sx of [-1, 1]) {
    // rain visors over the side windows (dark smoked acrylic), very common on Colombo cars
    if (!isVan || k === 'suv') for (const [z0, z1] of doorsZ) { if (sx < 0 && z0 === D.door[0]) continue; /* the swinging driver door carries its own visor */ const ry = (z) => { for (let i = 1; i < gh.length; i++) { const A = gh[i - 1], B = gh[i]; if (z <= A[0] && z >= B[0]) return lerp(A[2], B[2], (A[0] - z) / (A[0] - B[0] || 1)); } return gh[1][2]; };
      beam(gl, [sx * (gw1 + 0.035), ry(z0 - 0.04) - 0.05, z0 - 0.04], [sx * (gw1 + 0.035), ry(z1 + 0.03) - 0.05, z1 + 0.03], 0.006, 0.065, C('#fff')); }
    // door-handle recesses + key cylinder on the front doors; inner-belt chrome strip
    for (const [, d1] of doorsZ) { if (sx < 0 && d1 === D.door[1]) continue; const x = sx * (xAt(d1 + 0.18, belt - 0.12) + 0.004); rub.box(x, belt - 0.12, d1 + 0.18, 0.006, 0.05, 0.17, { col: C('#0c0c0d') }); }
    if (sx > 0) part(chr, discX, [sx * (xAt(D.door[1] + 0.32, belt - 0.12) + 0.008), belt - 0.12, D.door[1] + 0.32], [0, 0, 0], [0.006, 0.014, 0.014], chrome);
    { const gA = [gh[0][0] - 0.05, belt + 0.012], gB = [gh[gh.length - 1][0] + 0.12, gh[gh.length - 1][1] + 0.012], bp = (z) => [sx * (gw0 + 0.012), lerp(gA[1], gB[1], (gA[0] - z) / (gA[0] - gB[0])), z];
      if (sx > 0) beam(chr, bp(gA[0]), bp(gB[0]), 0.008, 0.012, satin); else { beam(chr, bp(gA[0]), bp(D.door[0]), 0.008, 0.012, satin); beam(chr, bp(D.door[1]), bp(gB[0]), 0.008, 0.012, satin); } } // inner-belt strip (not across the driver door)
    // mirror: aerodynamic cap + repeater + mirror glass bezel
    const mx = sx * gw0, my = gh[0][1] + 0.08, mz = gh[0][0] - 0.12;
    part(pnt, sphLo, [mx + sx * 0.18, my + 0.02, mz - 0.01], [0, sx * 0.12, 0], [0.072, 0.048, 0.05], col);
    part(ind, unitBox, [mx + sx * 0.2, my - 0.018, mz - 0.03], [0, sx * 0.12, 0], [0.08, 0.008, 0.02]);
    beam(rub, [mx + sx * 0.115, my - 0.03, mz - 0.093], [mx + sx * 0.245, my - 0.03, mz - 0.093], 0.006, 0.006, black); beam(rub, [mx + sx * 0.115, my + 0.07, mz - 0.093], [mx + sx * 0.245, my + 0.07, mz - 0.093], 0.006, 0.006, black);
    // wheel-arch lips (black plastic on SUVs / vans, body colour lip elsewhere), mud flaps behind each wheel
    for (const wz of [D.wf, D.wr]) { const x = sx * (xAt(wz, R + 0.2) + 0.012); part(isVan ? rub : pnt, arcX, [x, R, wz], [0, 0, 0], [0.5, R + 0.075, R + 0.075], isVan ? C('#1a1a1c') : col);
      rub.box(sx * (W - 0.13), 0.2, wz - R - 0.14, 0.2, 0.2, 0.012, { col: black }); }
    // side skirt
    beam(rub, [sx * (xAt(0, sill) - 0.01), sill - 0.015, D.wr + R + 0.12], [sx * (xAt(0, sill) - 0.01), sill - 0.015, D.wf - R - 0.12], 0.04, 0.04, C('#1e1f22'));
  }
  // fuel flap on the kerb side (left = +x) rear quarter
  { const z = D.wr + R + 0.25, y = 0.8, x = xAt(z, y) + 0.006; part(rub, ringX, [x, y, z], [0, 0, 0], [0.004, 0.075, 0.075], C('#111')); part(pnt, discX, [x + 0.002, y, z], [0, 0, 0], [0.004, 0.07, 0.07], col); }
  // ---- rear: lamp segmentation + lens covers, third brake light, reflectors, garnish, wiper, exhaust tip, diffuser
  for (const sx of [-1, 1]) {
    const tx = sx * (W * 0.86 - 0.14), tz = rz - 0.038;
    for (const dx of [-0.065, 0.055]) { part(refl, ringZ, [tx + dx, ty + 0.012, tz], [0, Math.PI, 0], [0.04, 0.04, 0.04], C('#d0b0b0')); part(tail, discZ, [tx + dx, ty + 0.012, tz + 0.004], [0, 0, 0], [0.026, 0.026, 0.004]); }
    beam(rub, [tx - 0.13, ty - 0.035, tz - 0.001], [tx + 0.13, ty - 0.035, tz - 0.001], 0.006, 0.006, C('#2a0606'));
    part(lens, unitBox, [tx, ty, rz - 0.042], [0, 0, 0], [0.27, 0.16, 0.004]);
    part(lens, unitBox, [sx * (W * 0.86 - 0.34), ty - 0.02, rz - 0.035], [0, 0, 0], [0.125, 0.085, 0.004]);
    part(rub, unitBox, [sx * (W * 0.8), sill + 0.13, rz - 0.065], [0, 0, 0], [0.09, 0.025, 0.006], red); // red reflector (unlit)
  }
  { const n = gh.length - 1; tail.box(0, roofR[2] - 0.035, roofR[0] - 0.005, 0.34, 0.025, 0.02); rub.box(0, roofR[2] - 0.035, roofR[0] + 0.004, 0.38, 0.04, 0.012, { col: black });
    chr.box(0, ty - 0.11, rz - 0.04, 0.55, 0.028, 0.012, { col: chrome });
    if (k === 'car' || isVan) { const p = [0, gh[n][1] + 0.1, gh[n][0] + 0.02]; beam(rub, p, [-0.32, gh[n][1] + 0.38, gh[n][0] + 0.06], 0.008, 0.008, C('#151515')); part(rub, unitCyl, p, [Math.PI / 2, 0, 0], [0.02, 0.03, 0.02], C('#151515')); } }
  part(rub, discZ, [0.45, sill - 0.02, rz - 0.042], [0, 0, 0], [0.026, 0.026, 0.006], C('#050505')); // exhaust tip bore
  for (let i = -3; i <= 3; i++) rub.box(i * 0.12, sill - 0.01, rz + 0.03, 0.01, 0.05, 0.12, { col: black }); // diffuser fins
  // ---- underbody: floor pan, sump, tank, exhaust run, suspension arms and struts
  rub.box(0, sill - 0.03, (D.wf + D.wr) / 2, W * 1.6, 0.02, D.wf - D.wr - 0.3, { col: C('#141416') });
  rub.box(0, R * 0.9, D.wf - 0.2, 0.5, 0.18, 0.5, { col: C('#202124') }); rub.box(0, sill + 0.02, D.wr + 0.6, 0.9, 0.16, 0.45, { col: C('#18191b') });
  beam(rub, [0.3, sill - 0.04, D.wf - 0.5], [0.45, sill - 0.03, rz + 0.12], 0.05, 0.05, C('#3a3a3a'), unitCyl); part(rub, unitBox, [0.42, sill - 0.04, D.wr - 0.35], [0, 0, 0], [0.24, 0.12, 0.42], C('#4a4a4c'));
  for (const sx of [-1, 1]) for (const wz of [D.wf, D.wr]) { beam(rub, [sx * 0.35, R - 0.06, wz - 0.12], [sx * (W - 0.28), R - 0.02, wz], 0.04, 0.035, C('#2b2b2e')); beam(rub, [sx * (W - 0.32), R + 0.05, wz], [sx * (W - 0.36), R + 0.48, wz - 0.04], 0.05, 0.05, C('#3a3b3e'), unitCyl); }
  // ---- cabin detail
  const dashY = gh[0][1] + 0.06, dz2 = dz - 0.1;
  I.box(-0.38, dashY + 0.025, dz2 - 0.08, 0.36, 0.05, 0.16, { col: C('#161617') }); // binnacle hood
  for (const dx of [-0.085, 0.085]) { part(I, discZ, [-0.38 + dx, dashY - 0.02, dz2 - 0.155], [0, 0, 0], [0.048, 0.048, 0.01], C('#0a0a0b')); part(chr, ringZ, [-0.38 + dx, dashY - 0.02, dz2 - 0.162], [0, 0, 0], [0.05, 0.05, 0.05], satin); part(I, unitBox, [-0.38 + dx, dashY - 0.01, dz2 - 0.163], [0, 0, dx > 0 ? 0.6 : -0.9], [0.004, 0.04, 0.002], C('#d84a20')); }
  gl.box(0.02, dashY - 0.06, dz2 - 0.23, 0.2, 0.12, 0.01, { col: C('#fff') }); I.box(0.02, dashY - 0.06, dz2 - 0.223, 0.22, 0.14, 0.01, { col: C('#0d0d0e') }); // centre screen
  for (const x of [-0.62, -0.14, 0.18, 0.62]) { part(chr, ringZ, [x, dashY - 0.035, dz2 - 0.228], [0, 0, 0], [0.032, 0.032, 0.05], satin); part(I, discZ, [x, dashY - 0.035, dz2 - 0.226], [0, 0, 0], [0.03, 0.03, 0.004], C('#0a0a0a')); }
  for (let i = 0; i < 6; i++) I.box(-0.06 + (i % 3) * 0.08, dashY - 0.17 - Math.floor(i / 3) * 0.035, dz2 - 0.222, 0.05, 0.022, 0.01, { col: C('#2b2c2f') }); // climate buttons
  I.box(0.42, dashY - 0.1, dz2 - 0.222, 0.36, 0.004, 0.006, { col: C('#0a0a0a') }); // glovebox shut line
  const gz2 = sz + 0.28; beam(I, [0, floorY + 0.24, gz2], [0, floorY + 0.38, gz2 - 0.03], 0.016, 0.016, C('#101010'), unitCyl); part(I, sphLo, [0, floorY + 0.4, gz2 - 0.03], [0, 0, 0], [0.032, 0.03, 0.036], C('#1a1a1a'));
  beam(I, [0.09, floorY + 0.24, sz - 0.02], [0.09, floorY + 0.3, sz + 0.2], 0.03, 0.03, C('#141414'));
  for (const [x, w] of [[-0.52, 0.06], [-0.4, 0.08], [-0.27, 0.06]]) part(I, unitBox, [x, floorY + 0.11, dz2 - 0.02], [-0.6, 0, 0], [w, 0.09, 0.015], C('#2a2a2c')); // clutch / brake / accelerator
  for (const sx of [-1, 1]) {
    I.box(sx * 0.33, roofF[2] - 0.065, roofF[0] - 0.13, 0.34, 0.016, 0.15, { col: C('#bdb8ac') }); // sun visors
    beam(I, [sx * (gw0 - 0.06), roofF[2] - 0.13, D.pillarsB + 0.02], [sx * 0.2, seatY + 0.08, sz - 0.1], 0.045, 0.008, C('#151515')); // seat belt
    I.box(sx * (gw1 - 0.06), roofF[2] - 0.1, (roofF[0] + roofR[0]) / 2, 0.025, 0.025, 0.2, { col: C('#9c978c') }); // grab handle
    for (const dx of [-0.07, 0.07]) beam(chr, [sx * 0.38 + dx, seatY + 0.57, sz - 0.31], [sx * 0.38 + dx, seatY + 0.66, sz - 0.33], 0.008, 0.008, satin, unitCyl); // headrest posts
    I.box(sx * 0.38, floorY + 0.018, sz + 0.42, 0.42, 0.006, 0.36, { col: C('#151515') }); // floor mats
  }
  I.box(0, roofF[2] - 0.06, roofF[0] - 0.28, 0.16, 0.02, 0.07, { col: C('#9c978c') }); // dome lamp housing
}

// ------------------------------------------------------------------------------------------------ tuk-tuk
export function tukDetail(dm, K, c) {
  const { beam, part, C, unitBox, unitCyl } = K; const { R, col, variant } = c;
  const rub = dm.get('rubber'), chr = dm.get('chrome'), refl = dm.get('vrefl'), lens = dm.get('lens'), head = dm.get('vlight'), tail = dm.get('vtail'), I = dm.get('interior'), pnt = dm.get('paint'), cv = dm.get('canvas');
  const chrome = C('#cfd3d7'), black = C('#0e0e10');
  // headlamp internals
  part(head, cupGeo, [0, 0.79, 1.259], [0, 0, 0], [0.066, 0.066, 0.022]); part(head, sphLo, [0, 0.79, 1.251], [0, 0, 0], [0.013, 0.013, 0.013]); part(lens, discZ, [0, 0.79, 1.262], [0, 0, 0], [0.072, 0.072, 0.004]); part(chr, ringZ, [0, 0.79, 1.260], [0, 0, 0], [0.08, 0.08, 0.08], chrome);
  // horn under the lamp, front fork springs, mudguard stays
  part(rub, discZ, [0.27, 0.69, 1.224], [0, 0, 0], [0.045, 0.045, 0.03], C('#1a1a1a'));
  for (let i = 0; i < 7; i++) part(chr, ringZ, [0, R + 0.18 + i * 0.035, 1.0 - i * 0.005], [Math.PI / 2, 0, 0], [0.04, 0.04, 0.08], C('#3a3a3c'));
  for (const sx of [-1, 1]) beam(chr, [sx * 0.08, R + 0.02, 1.0], [sx * 0.08, R * 2 + 0.05, 0.95], 0.012, 0.012, C('#2a2a2a'), unitCyl);
  // decorative fringe along the canopy front edge (common Colombo three-wheeler styling)
  const fr = [C('#d43a2a'), C('#f2c21a'), C('#2a7a3a'), C('#f4f4f2')];
  for (let i = 0; i < 22; i++) { const x = -0.5 + i * (1.0 / 21); part(cv, sphLo, [x, 1.462, 0.935], [0, 0, 0], [0.014, 0.022, 0.014], fr[i % 4]); beam(cv, [x, 1.48, 0.93], [x, 1.5, 0.925], 0.005, 0.005, fr[(i + 1) % 4]); }
  // canopy seams and roll-up straps, rear grab rail, meter box, inner mirror, step mat ribs, exhaust, rear lamp lenses
  for (const z of [-0.7, 0.05]) beam(rub, [-0.66, 1.62, z], [0.66, 1.62, z], 0.006, 0.006, C('#101010'));
  for (const sx of [-1, 1]) for (const z of [-0.95, -0.35]) beam(rub, [sx * 0.675, 1.42, z], [sx * 0.676, 1.32, z], 0.02, 0.004, C('#2a2a2a'));
  beam(chr, [-0.5, 1.15, -1.18], [0.5, 1.15, -1.18], 0.02, 0.02, chrome, unitCyl);
  I.box(0.3, 1.1, 0.75, 0.16, 0.09, 0.08, { col: C('#151515') }); I.box(0.3, 1.11, 0.709, 0.12, 0.03, 0.004, { col: C('#1f3a26') }); // fare meter (unlit display)
  part(chr, unitBox, [0, 1.4, 0.82], [0.2, 0, 0], [0.16, 0.05, 0.015], C('#222')); part(chr, unitBox, [0, 1.4, 0.812], [0.2, 0, 0], [0.14, 0.035, 0.004], chrome);
  for (let i = 0; i < 6; i++) rub.box(0, 0.425, 0.32 + i * 0.03, 0.62, 0.006, 0.012, { col: black });
  beam(chr, [0.45, 0.22, -0.6], [0.5, 0.24, -1.35], 0.035, 0.035, C('#8a8d90'), unitCyl); part(rub, discZ, [0.5, 0.24, -1.352], [0, 0, 0], [0.028, 0.028, 0.004], C('#050505'));
  for (const sx of [-1, 1]) { part(lens, unitBox, [sx * 0.5, 0.72, -1.282], [0, 0, 0], [0.095, 0.21, 0.004]); part(refl, ringZ, [sx * 0.5, 0.74, -1.28], [0, Math.PI, 0], [0.03, 0.03, 0.03], C('#d0b0b0')); }
  tail.box(0, 1.39, -1.28, 0.2, 0.025, 0.015); // high-level brake light on the canopy rear
  if (variant % 2 === 0) for (const sx of [-1, 1]) pnt.box(sx * 0.646, 0.46, -0.5, 0.004, 0.035, 0.9, { col: C('#f4f4f2') }); // pinstripe
}

// ------------------------------------------------------------------------------------------------ motorcycle / scooter
export function bikeDetail(dm, K, c) {
  const { beam, part, C, unitBox, unitCyl } = K; const { R, col, scooter } = c;
  const rub = dm.get('rubber'), chr = dm.get('chrome'), refl = dm.get('vrefl'), lens = dm.get('lens'), head = dm.get('vlight'), I = dm.get('interior'), pnt = dm.get('paint');
  const chrome = C('#cfd3d7'), black = C('#0e0e10'), alu = C('#a8acb0');
  part(head, cupGeo, [0, 1.0, 0.766], [0, 0, 0], [0.068, 0.068, 0.02]); part(head, sphLo, [0, 1.0, 0.758], [0, 0, 0], [0.012, 0.012, 0.012]); part(lens, discZ, [0, 1.0, 0.769], [0, 0, 0], [0.074, 0.074, 0.004]);
  // instrument pod, levers, mirrors' backs, ignition, cables
  part(I, discZ, [0, 1.14, 0.58], [-0.6, 0, 0], [0.06, 0.06, 0.03], C('#151515')); part(I, discZ, [0, 1.15, 0.566], [-0.6, 0, 0], [0.047, 0.047, 0.004], C('#0a0a0b')); part(chr, ringZ, [0, 1.15, 0.564], [-0.6, 0, 0], [0.05, 0.05, 0.05], chrome); part(I, unitBox, [0.01, 1.155, 0.562], [-0.6, 0, -0.7], [0.004, 0.035, 0.002], C('#d84a20'));
  for (const sx of [-1, 1]) { beam(chr, [sx * 0.26, 1.13, 0.52], [sx * 0.36, 1.12, 0.58], 0.012, 0.006, alu); beam(rub, [sx * 0.05, 1.13, 0.5], [sx * 0.12, 0.85, 0.6], 0.008, 0.008, black, unitCyl); }
  if (!scooter) {
    // engine: finned cylinder, crankcase covers, carburettor, chain, sprockets, chain guard, heat shield, rear shocks
    for (let i = 0; i < 7; i++) chr.box(0, 0.4 + i * 0.035, 0.27, 0.28, 0.012, 0.16, { col: C('#6a6d70') });
    part(chr, discX, [0.13, 0.4, 0.05], [0, 0, 0], [0.012, 0.11, 0.11], alu); part(chr, discX, [-0.13, 0.4, 0.05], [0, 0, 0], [0.012, 0.09, 0.09], alu);
    part(rub, unitBox, [0, 0.6, -0.05], [0, 0, 0], [0.1, 0.08, 0.08], C('#3a3a3c'));
    beam(rub, [0.12, 0.385, 0.0], [0.12, R + 0.1, -0.68], 0.02, 0.012, C('#1a1a1a')); beam(rub, [0.12, 0.295, 0.0], [0.12, R - 0.1, -0.68], 0.02, 0.012, C('#1a1a1a'));
    part(chr, ringX, [0.12, R, -0.68], [0, 0, 0], [0.12, 0.1, 0.1], C('#555')); part(chr, ringX, [0.12, 0.34, 0.0], [0, 0, 0], [0.12, 0.045, 0.045], C('#555'));
    beam(pnt, [0.14, 0.43, -0.05], [0.14, R + 0.15, -0.6], 0.012, 0.05, black); // chain guard
    beam(chr, [0.16, 0.42, -0.15], [0.19, 0.45, -0.55], 0.012, 0.07, chrome); // exhaust heat shield
    for (const sx of [-1, 1]) { const a = [sx * 0.13, R + 0.03, -0.62], b = [sx * 0.12, 0.84, -0.32]; beam(chr, a, b, 0.035, 0.035, C('#2a2a2a'), unitCyl); for (let i = 0; i < 6; i++) { const t = 0.2 + i * 0.11; part(chr, ringZ, [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)], [Math.PI / 2 + 0.53, 0, 0], [0.032, 0.032, 0.06], C('#c43a2a')); } }
    for (const sx of [-1, 1]) pnt.box(sx * 0.13, 0.86, 0.12, 0.012, 0.09, 0.18, { col: C('#1a1a1a') }); // knee pads
    part(chr, discZ, [0, 1.005, 0.12], [Math.PI / 2, 0, 0], [0.035, 0.035, 0.012], chrome); // fuel cap
    beam(chr, [-0.14, 0.92, -0.62], [0.14, 0.92, -0.62], 0.018, 0.018, black, unitCyl); for (const sx of [-1, 1]) beam(chr, [sx * 0.14, 0.92, -0.62], [sx * 0.13, 0.9, -0.42], 0.018, 0.018, black, unitCyl); // grab rail
  } else {
    for (let i = 0; i < 4; i++) rub.box(0, 0.4, 0.15 + i * 0.05, 0.26, 0.004, 0.012, { col: black }); // floorboard ribs
    pnt.box(0, 0.62, 0.64, 0.2, 0.06, 0.012, { col: C('#151515') });
  }
  // fork gaiters / front disc + caliper, rear mudguard, plate holder, kickstand, tail lens
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const t = 0.12 + i * 0.05; part(rub, ringZ, [sx * 0.07, lerp(R, 1.07, t), lerp(0.72, 0.52, t)], [Math.PI / 2 - 0.25, 0, 0], [0.042, 0.042, 0.06], black); }
  part(rub, unitBox, [-0.1, R + R * 0.3, 0.6], [0, 0, 0], [0.03, 0.08, 0.06], C('#2a2a2c')); // front caliper
  pnt.box(0, R * 2 + 0.01, -0.8, 0.12, 0.012, 0.25, { col: col }); rub.box(0, 0.62, -0.92, 0.26, 0.012, 0.08, { col: black });
  // (the side stand is a separate animated part on the left: Kickstand.js)
  part(lens, unitBox, [0, 0.86, -0.922], [0, 0, 0], [0.13, 0.07, 0.004]);
}

// ------------------------------------------------------------------------------------------------ buses + lorry
export function heavyDetail(dm, K, c) {
  const { beam, part, C, unitBox, unitCyl } = K; const { L, W, H, R, kind, belt, winTop, wf, wr } = c; const fz = L / 2, rz = -L / 2;
  const rub = dm.get('rubber'), chr = dm.get('chrome'), refl = dm.get('vrefl'), lens = dm.get('lens'), head = dm.get('vlight'), gl = dm.get('glass');
  const chrome = C('#cfd3d7'), black = C('#0e0e10'), amber = C('#d08a1a'), red = C('#8a1010');
  const wy = kind === 'lorry' ? 1.86 : belt - 0.06, wz = kind === 'lorry' ? fz + 0.02 : fz + 0.035;
  for (const sx of [-1, 1]) { // big pantograph wipers
    const a = kind === 'lorry' ? [sx * 0.08, wy + 0.02, wz] : [sx * 0.3, belt - 0.12, fz + 0.04], b = kind === 'lorry' ? [sx * 0.95, wy + 0.06, wz - 0.01] : [sx * 0.75, belt + 0.45, fz - 0.03];
    if (kind === 'lorry') beam(rub, a, b, 0.012, 0.012, black); beam(chr, [a[0], a[1], a[2] + 0.014], [b[0], b[1], b[2] + 0.014], 0.008, 0.008, C('#1c1c1c'));
    const p = kind === 'lorry' ? [sx * 0.9, wy - 0.05, wz + 0.02] : [sx * 0.22, belt - 0.22, fz + 0.06]; beam(chr, p, [lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5), lerp(a[2], b[2], 0.5) + 0.02], 0.016, 0.01, C('#1c1c1c')); part(rub, discZ, p, [0, 0, 0], [0.03, 0.03, 0.03], black);
    // mirror glass faces and second (kerb-view) mirror
    part(gl, unitBox, [sx * (W + (kind === 'lorry' ? 0.27 : 0.3)), kind === 'lorry' ? 2.0 : 1.78, fz + (kind === 'lorry' ? 0.03 : 0.127)], [0, 0, 0], [0.085, kind === 'lorry' ? 0.32 : 0.38, 0.006], C('#fff'));
    // headlamp bowls
    if (kind === 'lorry') for (const dx of [-0.08, 0.08]) { const x = sx * (W - 0.3) + dx; part(head, cupGeo, [x, 0.95, fz + 0.065], [0, 0, 0], [0.065, 0.065, 0.02]); part(head, sphLo, [x, 0.95, fz + 0.057], [0, 0, 0], [0.013, 0.013, 0.013]); part(lens, discZ, [x, 0.95, fz + 0.068], [0, 0, 0], [0.07, 0.07, 0.004]); }
    else for (const [dx, r] of [[0.28, 0.085], [0.48, 0.07]]) { const x = sx * (W - dx); part(head, cupGeo, [x, 0.85, fz + 0.078], [0, 0, 0], [r * 0.95, r * 0.95, 0.02]); part(head, sphLo, [x, 0.85, fz + 0.07], [0, 0, 0], [0.014, 0.014, 0.014]); part(lens, discZ, [x, 0.85, fz + 0.081], [0, 0, 0], [r, r, 0.004]); part(chr, ringZ, [x, 0.85, fz + 0.079], [0, 0, 0], [r * 1.05, r * 1.05, r], chrome); }
    // roof-edge rain gutter, cab / body marker lamps (unlit amber reflectors), mud flaps, reflectors, tow hooks
    beam(rub, [sx * (W - 0.01), (kind === 'lorry' ? 2.6 : winTop) + 0.02, rz + (kind === 'lorry' ? L - 1.95 : 0.1)], [sx * (W - 0.01), (kind === 'lorry' ? 2.55 : winTop) + 0.02, fz - 0.15], 0.02, 0.02, black);
    for (let z = rz + 1.0; z < fz - 0.8; z += 2.0) part(rub, unitBox, [sx * (W + 0.008), kind === 'lorry' ? 1.0 : 0.62, z], [0, 0, 0], [0.01, 0.04, 0.09], amber);
    for (const z of [wf, wr]) rub.box(sx * (W - 0.22), 0.3, z - R - 0.15, 0.42, 0.4, 0.015, { col: black });
    part(rub, unitBox, [sx * (W - 0.15), kind === 'lorry' ? 0.62 : 0.42, rz - 0.13], [0, 0, 0], [0.12, 0.05, 0.01], red);
    part(chr, ringZ, [sx * 0.55, kind === 'lorry' ? 0.48 : 0.28, fz + 0.12], [Math.PI / 2, 0, 0], [0.05, 0.05, 0.05], C('#2a2a2a'));
  }
  for (const sx of [-1, 0, 1]) part(rub, unitBox, [sx * 0.5, (kind === 'lorry' ? 2.86 : H) + 0.03, fz - 0.3], [0, 0, 0], [0.12, 0.04, 0.06], amber); // roof markers
  if (kind === 'lorry') {
    rub.box(0, 2.68, fz + 0.06, W * 2 - 0.1, 0.06, 0.2, { col: C('#1a1a1a') }); // sun visor
    for (const sx of [-1, 1]) { rub.box(sx * (W - 0.12), 0.45, fz - 0.95, 0.26, 0.03, 0.3, { col: C('#2a2a2a') }); rub.box(sx * (W - 0.12), 0.25, fz - 0.95, 0.26, 0.03, 0.3, { col: C('#2a2a2a') }); } // cab steps
    beam(chr, [-W - 0.09, 0.7, fz - 2.08], [-W - 0.09, 3.0, fz - 2.08], 0.06, 0.06, chrome, unitCyl); part(rub, discZ, [-W - 0.09, 3.0, fz - 2.08], [Math.PI / 2, 0, 0], [0.05, 0.05, 0.004], C('#050505')); for (const y of [1.3, 2.2]) rub.box(-W - 0.03, y, fz - 2.08, 0.1, 0.05, 0.05, { col: C('#1a1a1a') }); // exhaust stack: outboard, behind the cab (clear of the bed and its tarp)
    for (const dx of [-0.15, 0.15]) part(chr, unitCyl, [dx, 2.92, fz - 0.6], [Math.PI / 2, 0, 0], [0.04, 0.32, 0.04], chrome); // air horns
    rub.box(W - 0.3, 0.5, 0.2, 0.42, 0.3, 0.5, { col: C('#151515') }); // battery box
    for (let z = rz + 0.4; z < fz - 2.1; z += 0.5) for (const sx of [-1, 1]) part(chr, unitBox, [sx * (W + 0.01), 0.92, z], [0, 0, 0], [0.02, 0.04, 0.04], C('#555')); // rope hooks
  } else {
    rub.box(0, winTop - 0.02, fz - 0.05, W * 2 - 0.2, 0.05, 0.12, { col: C('#1a1a1a') }); // inside sun blind rail
    for (let i = 0; i < 4; i++) rub.box(0, 0.18 + i * 0.06, fz + 0.15, 0.7, 0.012, 0.05, { col: C('#2a2a2a') }); // bumper step ribs
    for (let i = 0; i < 7; i++) chr.box(W - 0.25, 1.05 + i * 0.28, rz - 0.045, 0.35, 0.025, 0.025, { col: chrome }); // rear ladder rungs
    for (const sx of [-1, 1]) beam(chr, [W - 0.25 + sx * 0.17, 1.0, rz - 0.045], [W - 0.25 + sx * 0.17, 2.85, rz - 0.045], 0.025, 0.025, chrome, unitCyl);
    part(chr, discX, [-W - 0.006, 0.85, -0.9], [0, 0, 0], [0.006, 0.07, 0.07], chrome); // fuel filler cap
  }
}

// ------------------------------------------------------------------------------------------------ high-detail wheels
const hiCache = new Map();
export function hiWheelParts(R, w, style, kind, K) {
  const key = `${R}:${w}:${style}:${kind}`; if (hiCache.has(key)) return hiCache.get(key);
  const { beam, part, C, unitBox, unitCyl } = K; const h = w / 2; const bike = kind === 'bike', heavy = kind === 'heavy';
  // tyre: rounded sidewalls, shoulders, three circumferential grooves; plus raised tread blocks and a sidewall ring
  const ri = bike ? 0.8 : 0.66, gd = R * 0.012, prof = bike ? [V2(R * 0.8, h * 0.9), V2(R * 0.9, h * 1.05), V2(R * 0.97, h * 0.85), V2(R, h * 0.4)] : [V2(R * 0.66, h * 0.92), V2(R * 0.8, h * 1.02), V2(R * 0.9, h * 1.0), V2(R * 0.965, h * 0.88), V2(R - gd, h * 0.66)];
  const grooves = bike ? [] : [0.36, 0, -0.36];
  for (const g of grooves) { const y = g * h; prof.push(V2(R - gd, y + h * 0.07), V2(R - gd * 3.5, y + h * 0.05), V2(R - gd * 3.5, y - h * 0.05), V2(R - gd, y - h * 0.07)); }
  if (bike) prof.push(V2(R, -h * 0.4), V2(R * 0.97, -h * 0.85), V2(R * 0.9, -h * 1.05), V2(R * 0.8, -h * 0.9)); else prof.push(V2(R - gd, -h * 0.66), V2(R * 0.965, -h * 0.88), V2(R * 0.9, -h * 1.0), V2(R * 0.8, -h * 1.02), V2(R * 0.66, -h * 0.92));
  const tl = new THREE.LatheGeometry(prof, bike ? 40 : 56); tl.rotateZ(-Math.PI / 2);
  const tb = new MeshBuilder(); tb.geometry(tl, new THREE.Matrix4(), [1, 1, 1]);
  const nb = bike ? 0 : heavy ? 40 : 36; const bw = (2 * Math.PI * R) / nb * 0.55;
  for (let i = 0; i < nb; i++) { const a = (i / nb) * Math.PI * 2; for (const s of [-1, 1]) { const off = s * h * 0.55, ia = a + (s > 0 ? 0 : Math.PI / nb); part(tb, unitBox, [off, Math.sin(ia) * (R - gd * 0.4), Math.cos(ia) * (R - gd * 0.4)], [Math.PI / 2 - ia, 0, 0], [h * 0.42, gd * 2.2, bw], [1, 1, 1]); } }
  if (!bike) part(tb, ringX, [h * 1.0, 0, 0], [0, 0, 0], [0.1, R * 0.83, R * 0.83], [1, 1, 1]);
  const tyre = tb.build(); tl.dispose();
  // rim (+ brake disc that spins with it)
  const mb = new MeshBuilder(); const rc = style === 1 ? C(heavy ? '#d8dadc' : '#2a2a2c') : style === 2 ? C('#c9ccd0') : C('#a4aab0'); const dk = C('#3a3d40'); const rr = R * ri;
  const barrel = new THREE.LatheGeometry([V2(rr * 0.96, h * 0.85), V2(rr, h * 0.78), V2(rr * 0.97, h * 0.5), V2(rr * 0.9, h * 0.2), V2(rr * 0.9, -h * 0.6), V2(rr, -h * 0.8)], 36); barrel.rotateZ(-Math.PI / 2); mb.geometry(barrel, new THREE.Matrix4(), rc); barrel.dispose();
  part(mb, ringX, [h * 0.84, 0, 0], [0, 0, 0], [0.15, rr * 0.99, rr * 0.99], rc); // rim lip
  if (bike) { // laced wire wheel: hub, 32 spokes, drum
    part(mb, discX, [0, 0, 0], [0, 0, 0], [h * 1.1, R * 0.16, R * 0.16], C('#9a9ea2'));
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2, s = i % 2 ? 1 : -1; beam(mb, [s * h * 0.45, Math.sin(a) * R * 0.14, Math.cos(a) * R * 0.14], [0, Math.sin(a + 0.25 * s) * rr * 0.9, Math.cos(a + 0.25 * s) * rr * 0.9], 0.004, 0.004, C('#c8ccd0'), unitCyl); }
    part(mb, discX, [-h * 0.6, 0, 0], [0, 0, 0], [0.006, R * 0.42, R * 0.42], C('#9a9ea2')); part(mb, ringX, [-h * 0.6, 0, 0], [0, 0, 0], [0.1, R * 0.3, R * 0.3], C('#55595e'));
  } else if (style === 1) { // pressed steel wheel: dished disc, ventilation holes, hub cap, lug nuts
    const dish = new THREE.LatheGeometry([V2(0.001, h * 0.42), V2(R * 0.2, h * 0.46), V2(R * 0.26, h * 0.3), V2(rr * 0.75, h * 0.38), V2(rr * 0.9, h * 0.2)], 36); dish.rotateZ(-Math.PI / 2); mb.geometry(dish, new THREE.Matrix4(), rc); dish.dispose();
    const nh = heavy ? 10 : 8; for (let i = 0; i < nh; i++) { const a = (i / nh) * Math.PI * 2; part(mb, discX, [h * 0.395, Math.sin(a) * rr * 0.55, Math.cos(a) * rr * 0.55], [0, 0, 0], [0.006, R * 0.055, R * 0.055], C('#0a0a0a')); }
    const nl = heavy ? 10 : 6; for (let i = 0; i < nl; i++) { const a = (i / nl) * Math.PI * 2; part(mb, hexX, [h * 0.5, Math.sin(a) * R * 0.17, Math.cos(a) * R * 0.17], [a, 0, 0], [0.02, R * 0.028, R * 0.028], C('#8a8d90')); }
    part(mb, discX, [h * (heavy ? 0.62 : 0.5), 0, 0], [0, 0, 0], [heavy ? 0.09 : 0.02, R * 0.12, R * 0.12], C(heavy ? '#c4c8cc' : '#55595e'));
  } else { // alloy: twin spokes (5) or six-spoke, centre cap with plain emblem, lug nuts, valve stem
    const ns = style === 2 ? 6 : 5;
    for (let i = 0; i < ns; i++) { const a = (i / ns) * Math.PI * 2; for (const o of style === 2 ? [0] : [-0.11, 0.11]) { const a2 = a + o; beam(mb, [h * 0.5, Math.sin(a) * R * 0.16, Math.cos(a) * R * 0.16], [h * 0.62, Math.sin(a2) * rr * 0.93, Math.cos(a2) * rr * 0.93], R * (style === 2 ? 0.1 : 0.055), h * 0.14, rc); } }
    part(mb, discX, [h * 0.46, 0, 0], [0, 0, 0], [h * 0.12, R * 0.2, R * 0.2], rc);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 5; part(mb, hexX, [h * 0.55, Math.sin(a) * R * 0.12, Math.cos(a) * R * 0.12], [a, 0, 0], [0.02, R * 0.022, R * 0.022], C('#d0d3d6')); }
    part(mb, discX, [h * 0.56, 0, 0], [0, 0, 0], [0.012, R * 0.075, R * 0.075], C('#1c1e22')); part(mb, discX, [h * 0.565, 0, 0], [0, 0, 0], [0.004, R * 0.05, R * 0.05], C('#c9ccd0'));
    beam(mb, [h * 0.5, rr * 0.86, 0.04], [h * 0.62, rr * 0.86, 0.04], 0.008, 0.008, C('#222'), unitCyl);
    part(mb, discX, [-h * 0.05, 0, 0], [0, 0, 0], [0.025, rr * 0.82, rr * 0.82], C('#6e7276')); // brake disc
    part(mb, ringX, [-h * 0.05, 0, 0], [0, 0, 0], [0.2, rr * 0.5, rr * 0.5], C('#3a3c3e'));
  }
  const rim = mb.build();
  // caliper (does not spin): mounted behind the spokes at the trailing top
  let caliper = null; if (!bike && style !== 1) { const cb = new MeshBuilder(); part(cb, unitBox, [-h * 0.02, rr * 0.62, -rr * 0.32], [0.5, 0, 0], [0.07, R * 0.14, R * 0.34], C(style === 2 ? '#a82020' : '#3a3c40')); caliper = cb.build(); }
  const out = { tyre, rim, caliper }; hiCache.set(key, out); return out;
}
const lerp = (a, b, t) => a + (b - a) * t;
