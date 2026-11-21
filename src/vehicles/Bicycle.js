// "Dineth's Bike" (44th request): a real pedal bicycle, built part by part like the motorcycles (BikeModels.js) but with a
// bicycle's own geometry — a lime frame printed with black polka dots (a small tiling dot texture on the tube UVs, so the dots
// keep their size on every tube), red riser handlebar with black grips, black rims / spokes / tyres / saddle, a crankset that
// really turns with the rear wheel (freewheel: it stops when he coasts), chain, derailleur, rim brakes and cables.
//
// The rider side (stunts, pedalling pose, spawning at his room) is BicycleRide.js.
// It rides with the normal two-wheeler code (entry 'bike': boarding, kick-stand, lean, crash damage) but has no engine: no engine
// voice, exhaust, fuel, lamps, radio or Street Customs work. Only Dineth can do its stunts (digit keys while riding):
//   1  Flamingo       stands on the saddle on one foot, body stretched forward over the bars, the other leg out behind him
//   2  Floor touch    carves into a deep lean and drags his right hand on the road
//   3  Wheel neutral  a balanced wheelie, coasting with the cranks level
//   4  Rumba          stands on the pedals and rocks the bike from side to side under him
// The poses are solved on the real skeleton every frame (leg / arm IK onto pedals, saddle, bars and the road) through the
// animator's postPose hook; the bike's own pitch / roll for the stunts goes through Vehicle.stunt (applied in Vehicle.sync).
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';

export const DBIKE_ID = 'dbike';
export const R = 0.34; // 700c wheel with a 32 mm tyre
export const ZF = 0.515, ZR = -0.505; // axles: 1.02 m wheelbase
export const BB = [0, 0.275, -0.085]; // bottom bracket (crank axle)
export const CRANK = 0.17; // crank arm length
export const PEDAL_X = 0.15; // pedal centre from the bike's centre line
export const SEAT = [0, 0.93, -0.29]; // saddle top centre (the rider's root)
export const GRIPS = [[0.27, 0.935, 0.415], [-0.27, 0.935, 0.415]]; // +x = the bike's left
export const GEAR = 2.6; // wheel turns per crank turn (44 / 17)
export const DBIKE_T = { len: 1.74, wid: 0.64, hgt: 1.05, wheelR: R, maxSpeed: 9.2, accel: 2.5, mass: 13, seats: 1, steer: 0.62, sound: 'none', entry: 'bike', base: 'bike',
  colors: ['#9fd323'], family: 'bicycle', cls: 'bicycle', pedal: true, noLamps: true, standOff: [-0.075, 0, -0.22], name: "Dineth's Bike" };

const LIME = [0.62, 0.83, 0.14], BLACK = [0.035, 0.035, 0.038], RED = [0.72, 0.05, 0.05], STEEL = [0.62, 0.64, 0.66], DARK = [0.09, 0.09, 0.1];
const I4 = new THREE.Matrix4(); const V = (a) => new THREE.Vector3(...a);

// ---------------------------------------------------------------------------------------------- geometry helpers
// a frame tube printed with the dot pattern: uv scaled to metres (one 8 cm tile = two staggered dots) so the dots are the same
// size on a 23 mm down tube and a 9 mm seat stay
function dotTube(b, pts, r, rs = 12) {
  const c = new THREE.CatmullRomCurve3(pts.map(V)); const len = c.getLength(); const g = new THREE.TubeGeometry(c, Math.max(2, (pts.length - 1) * 6), r, rs, false);
  const uv = g.attributes.uv; const ku = len / 0.08, kv = Math.max(1, Math.round(2 * Math.PI * r / 0.08)); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ku, uv.getY(i) * kv);
  b.geometry(g, I4, [1, 1, 1]); g.dispose();
}
function tube(b, pts, r, col, rs = 8) { const c = new THREE.CatmullRomCurve3(pts.map(V)); const g = new THREE.TubeGeometry(c, Math.max(2, (pts.length - 1) * 6), r, rs, false); b.geometry(g, I4, col); g.dispose(); }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function cyl(b, a, e, r, col, seg = 12) { const A = V(a), E = V(e); const len = A.distanceTo(E); const g = new THREE.CylinderGeometry(r, r, len, seg); _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), E.clone().sub(A).normalize()); _m.compose(A.add(E).multiplyScalar(0.5), _q, _s.set(1, 1, 1)); b.geometry(g, _m, col); g.dispose(); }
function box(b, c, sz, col, rx = 0) { const g = new THREE.BoxGeometry(...sz); _m.compose(_p.set(...c), _q.setFromEuler(new THREE.Euler(rx, 0, 0)), _s.set(1, 1, 1)); b.geometry(g, _m, col); g.dispose(); }
// racing-style saddle: a closed parametric shell (superellipse sections), wide at the back, narrow nose, slightly dished top
function saddle(b, cz, top, col) {
  const nu = 14, nv = 16; const P = []; const half = (t) => 0.022 + 0.055 * Math.pow(Math.sin(Math.min(1, (1 - t) * 1.15) * Math.PI / 2), 1.6); // t: 0 back → 1 nose
  for (let i = 0; i <= nu; i++) { const t = i / nu; const z = cz - 0.14 + t * 0.27; const w = half(t) * (t < 0.06 ? 0.75 + 4 * t : 1); const h = 0.045 - 0.012 * t; const row = [];
    for (let j = 0; j < nv; j++) { const a = j / nv * Math.PI * 2; const c = Math.cos(a), s = Math.sin(a); const x = Math.sign(c) * Math.pow(Math.abs(c), 0.55) * w; let y = Math.sign(s) * Math.pow(Math.abs(s), 0.6) * h / 2; if (s > 0) y -= 0.004 * Math.exp(-((x / (w + 1e-3)) ** 2) * 6) * (t > 0.2 && t < 0.8 ? 1 : 0); row.push([x, top - h / 2 + y, z + (t > 0.95 ? -0.004 * (1 - Math.abs(c)) : 0)]); } P.push(row); }
  const mb = new MeshBuilder();
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = P[i][j], bb = P[i][(j + 1) % nv], c = P[i + 1][(j + 1) % nv], d = P[i + 1][j]; mb.quad(a, bb, c, d, [0, 0, 1, 1], col); }
  for (const [row, f] of [[P[0], false], [P[nu], true]]) { const ctr = row.reduce((q, p) => [q[0] + p[0] / nv, q[1] + p[1] / nv, q[2] + p[2] / nv], [0, 0, 0]); for (let j = 0; j < nv; j++) { const a = row[j], c = row[(j + 1) % nv]; if (f) mb.quad(ctr, a, c, ctr, [0, 0, 1, 1], col); else mb.quad(ctr, c, a, ctr, [0, 0, 1, 1], col); } }
  let g = mb.build(); if (g) { g.deleteAttribute('normal'); g.computeVertexNormals(); b.geometry(g, I4); g.dispose(); }
}

// ---------------------------------------------------------------------------------------------- wheel templates (hub space, axle = x)
function wheelTemplate(hi) {
  const tyre = new THREE.TorusGeometry(R - 0.016, 0.016, hi ? 10 : 6, hi ? 48 : 28); tyre.rotateY(Math.PI / 2);
  const rb = new MeshBuilder(); const rim = (r0, r1, w, n) => { const g = new THREE.CylinderGeometry(r1, r1, w, n, 1, true); g.rotateZ(Math.PI / 2); rb.geometry(g, I4, BLACK); g.dispose(); const g2 = new THREE.CylinderGeometry(r0, r0, w * 0.8, n, 1, true); g2.rotateZ(Math.PI / 2); rb.geometry(g2, I4, BLACK); g2.dispose();
    for (const sx of [-1, 1]) { const ring = new THREE.RingGeometry(r0, r1, n, 1); ring.rotateY(sx * Math.PI / 2); rb.geometry(ring, new THREE.Matrix4().makeTranslation(sx * w / 2, 0, 0), BLACK); ring.dispose(); } };
  rim(R - 0.058, R - 0.03, 0.022, hi ? 48 : 28); // deep-section black rim under the tyre bead
  const hub = new THREE.CylinderGeometry(0.018, 0.018, 0.1, hi ? 14 : 8); hub.rotateZ(Math.PI / 2); rb.geometry(hub, I4, DARK); hub.dispose();
  for (const sx of [-1, 1]) { const fl = new THREE.CylinderGeometry(0.03, 0.03, 0.004, hi ? 16 : 8); fl.rotateZ(Math.PI / 2); rb.geometry(fl, new THREE.Matrix4().makeTranslation(sx * 0.032, 0, 0), DARK); fl.dispose(); }
  const n = hi ? 32 : 16; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, sx = i % 2 ? 1 : -1, a2 = a + sx * 0.32; // laced 2-cross: each spoke leaves the flange tangentially
    const h = [sx * 0.032, Math.sin(a) * 0.028, Math.cos(a) * 0.028], r = [0, Math.sin(a2) * (R - 0.058), Math.cos(a2) * (R - 0.058)]; cyl(rb, h, r, 0.0011, BLACK, 3); }
  const rg = rb.build(); return [['tyre', tyre], ['rim', rg]];
}

// ---------------------------------------------------------------------------------------------- the frame + fittings
export function buildBicycle(mb, dm) {
  const DOT = mb.get('dots'), RB = mb.get('rubber'), CH = mb.get('chrome'), PT = mb.get('paint'); const dRB = dm.get('rubber'), dCH = dm.get('chrome');
  const ST = [0, 0.80, -0.245], HT_T = [0, 0.835, 0.355], HT_B = [0, 0.69, 0.40];
  // main triangle + rear triangle (lime, dotted)
  dotTube(DOT, [ST, [0, 0.812, 0.06], [HT_T[0], HT_T[1] - 0.02, HT_T[2] - 0.01]], 0.0185); // top tube
  dotTube(DOT, [BB, [0, 0.49, 0.16], [0, 0.71, 0.392]], 0.023); // down tube
  dotTube(DOT, [BB, [0, 0.54, -0.165], [ST[0], ST[1] + 0.02, ST[2] - 0.006]], 0.016); // seat tube
  dotTube(DOT, [HT_B, HT_T], 0.024); // head tube
  for (const sx of [-1, 1]) {
    dotTube(DOT, [[sx * 0.022, BB[1], BB[2] - 0.02], [sx * 0.06, 0.3, -0.3], [sx * 0.066, R, ZR + 0.012]], 0.01); // chain stays
    dotTube(DOT, [[sx * 0.016, ST[1] - 0.02, ST[2] + 0.004], [sx * 0.05, 0.56, -0.38], [sx * 0.066, R + 0.012, ZR + 0.01]], 0.0085); // seat stays
    dotTube(DOT, [[sx * 0.05, 0.67, 0.41], [sx * 0.052, 0.52, 0.46], [sx * 0.05, R + 0.015, ZF - 0.004]], 0.0125); // fork blades (raked)
    box(CH, [sx * 0.066, R, ZR], [0.008, 0.035, 0.03], DARK); box(CH, [sx * 0.05, R, ZF], [0.008, 0.03, 0.025], DARK); // drop-outs
  }
  dotTube(DOT, [[-0.055, 0.672, 0.405], [0.055, 0.672, 0.405]], 0.016); // fork crown
  cyl(CH, [-0.045, BB[1], BB[2]], [0.045, BB[1], BB[2]], 0.021, DARK, 14); // bottom-bracket shell
  cyl(CH, [0, HT_B[1] - 0.012, HT_B[2] + 0.004], [0, HT_B[1] + 0.006, HT_B[2]], 0.027, BLACK, 14); cyl(CH, [0, HT_T[1] - 0.004, HT_T[2]], [0, HT_T[1] + 0.016, HT_T[2] - 0.004], 0.026, BLACK, 14); // headset cups
  // cockpit: black stem + spacers, red riser bar, black lock-on grips, levers, bell
  cyl(CH, [0, HT_T[1] + 0.016, HT_T[2] - 0.004], [0, 0.885, 0.343], 0.0145, BLACK, 12); // steerer + spacers
  tube(PT, [[0, 0.88, 0.345], [0, 0.893, 0.39], [0, 0.9, 0.428]], 0.016, BLACK, 10); box(PT, [0, 0.9, 0.43], [0.045, 0.04, 0.03], BLACK);
  tube(PT, [[0.31, 0.937, 0.412], [0.2, 0.932, 0.42], [0.09, 0.912, 0.428], [0, 0.9, 0.43], [-0.09, 0.912, 0.428], [-0.2, 0.932, 0.42], [-0.31, 0.937, 0.412]], 0.0115, RED, 10); // riser bar
  for (const sx of [-1, 1]) { tube(RB, [[sx * 0.205, 0.932, 0.42], [sx * 0.312, 0.937, 0.412]], 0.0165, BLACK, 12); cyl(CH, [sx * 0.312, 0.937, 0.412], [sx * 0.318, 0.937, 0.412], 0.0168, BLACK, 12); cyl(CH, [sx * 0.2, 0.932, 0.42], [sx * 0.207, 0.932, 0.42], 0.018, DARK, 12); // grips, end plugs, lock rings
    box(dCH, [sx * 0.19, 0.935, 0.43], [0.04, 0.03, 0.03], BLACK); tube(dCH, [[sx * 0.2, 0.935, 0.44], [sx * 0.24, 0.93, 0.47], [sx * 0.28, 0.925, 0.468]], 0.0045, DARK, 5); // brake lever
    tube(dRB, [[sx * 0.18, 0.94, 0.44], [sx * 0.12, 0.98, 0.46], [sx * 0.03, 0.93, 0.4], [sx * 0.015, 0.85, 0.34], [sx * 0.012, 0.81, 0.2]], 0.0025, BLACK, 4); } // cable housing
  cyl(dCH, [0.13, 0.95, 0.425], [0.13, 0.965, 0.425], 0.022, STEEL, 14); // bell
  // seat post + clamp + saddle
  cyl(CH, [ST[0], ST[1] - 0.04, ST[2] + 0.012], [0, 0.9, -0.283], 0.0135, BLACK, 12); cyl(CH, [ST[0], ST[1] - 0.006, ST[2]], [ST[0], ST[1] + 0.02, ST[2] - 0.008], 0.019, BLACK, 12);
  box(CH, [0, 0.905, -0.285], [0.03, 0.02, 0.06], DARK); saddle(RB, SEAT[2] - 0.005, SEAT[1] + 0.012, BLACK);
  // rim brakes (front on the crown, rear on the stay bridge), rear reflector, chain, derailleur
  for (const [y, z] of [[0.665, 0.425], [0.66, -0.4]]) { for (const sx of [-1, 1]) tube(dCH, [[sx * 0.012, y + 0.012, z], [sx * 0.05, y - 0.01, z + 0.01], [sx * 0.035, y - 0.05, z + 0.014]], 0.005, BLACK, 5); }
  cyl(dCH, [-0.05, 0.66, -0.4], [0.05, 0.66, -0.4], 0.006, BLACK, 6); // stay bridge
  box(PT, [0, 0.79, -0.27], [0.05, 0.03, 0.006], [0.55, 0.04, 0.03], -0.25); // red reflector on the seat-post clamp
  const cx = -0.072, ry = [BB[1] + 0.098, BB[1] - 0.098], rr = [R + 0.04, R - 0.04];
  tube(dCH, [[cx, ry[0], BB[2]], [cx, rr[0], ZR]], 0.0032, DARK, 4); tube(dCH, [[cx, ry[1], BB[2]], [cx, (ry[1] + 0.21) / 2, (BB[2] + ZR) / 2 - 0.1], [cx, 0.21, ZR + 0.01]], 0.0032, DARK, 4); // chain runs (top / bottom via the derailleur)
  cyl(dCH, [cx - 0.004, R, ZR], [cx + 0.004, R, ZR], 0.042, STEEL, 18); // rear cassette
  box(dCH, [cx - 0.012, 0.25, ZR + 0.02], [0.012, 0.09, 0.03], BLACK); cyl(dCH, [cx - 0.004, 0.21, ZR + 0.01], [cx + 0.004, 0.21, ZR + 0.01], 0.014, DARK, 10); // derailleur cage + jockey wheel
  const s0 = { x: 0, y: SEAT[1], z: SEAT[2] };
  const seats = [{ ...s0, floor: BB[1], fz: BB[2] + CRANK - SEAT[2] - 0.06, fx: PEDAL_X, footStagger: -2 * CRANK, roof: 9, lean: 0.42, hands: 'bars', bars: GRIPS, kind: 'ride', driver: true, ride: true, exit: [0.72, SEAT[2] + 0.1], kneeOut: 0, pedal: true }];
  return { wheels: [[0, R, ZF, 0.034], [0, R, ZR, 0.034]], seats, steerWheel: [0, 0.935, 0.42], wheelStyle: 0, realWheel: { hi: wheelTemplate(true), lo: wheelTemplate(false) } };
}

// the polka-dot frame material (a 64² tile: lime with two staggered black dots)
let dotsMat = null;
export function dotsMaterial() {
  if (dotsMat) return dotsMat; let map = null;
  if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#9fd323'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#0d0d0d';
    for (const [px, py] of [[16, 16], [48, 48], [-16, 48], [80, 48], [48, -16], [48, 80]]) { x.beginPath(); x.arc(px, py, 7, 0, Math.PI * 2); x.fill(); }
    map = new THREE.CanvasTexture(c); map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; }
  dotsMat = new THREE.MeshPhysicalMaterial({ map, color: map ? 0xffffff : 0x9fd323, vertexColors: true, roughness: 0.38, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.12, envMapIntensity: 0.7 }); dotsMat.name = 'bike-dots';
  return dotsMat;
}

// ---------------------------------------------------------------------------------------------- the turning crankset
let crankParts = null;
export function crankGroup() {
  if (!crankParts) { const blk = new THREE.MeshStandardMaterial({ color: 0x121213, roughness: 0.38, metalness: 0.6 }), sil = new THREE.MeshStandardMaterial({ color: 0xb8bcc1, roughness: 0.28, metalness: 0.92 });
    const ring = new THREE.CylinderGeometry(0.104, 0.104, 0.004, 44); ring.rotateZ(Math.PI / 2); const spider = new THREE.CylinderGeometry(0.05, 0.05, 0.008, 5); spider.rotateZ(Math.PI / 2);
    const axle = new THREE.CylinderGeometry(0.012, 0.012, 0.2, 10); axle.rotateZ(Math.PI / 2);
    const arm = new THREE.BoxGeometry(0.014, 0.03, CRANK + 0.02); arm.translate(0, 0, CRANK / 2); // along +z from the axle
    const pedal = new THREE.BoxGeometry(0.092, 0.022, 0.075); const spin = new THREE.CylinderGeometry(0.007, 0.007, 0.06, 6); spin.rotateZ(Math.PI / 2);
    crankParts = { blk, sil, ring, spider, axle, arm, pedal, spin }; }
  const P = crankParts; const g = new THREE.Group(); g.name = 'crank'; g.position.set(...BB);
  const add = (geo, mat, x, y = 0, z = 0, par = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
  add(P.ring, P.sil, -0.072); add(P.spider, P.blk, -0.068); add(P.axle, P.blk, 0);
  add(P.arm, P.blk, 0.085); const aR = add(P.arm, P.blk, -0.085); aR.rotation.x = Math.PI; // left arm forward at angle 0, right arm back
  const pedals = []; for (const [x, z] of [[PEDAL_X, CRANK], [-PEDAL_X, -CRANK]]) { const pv = new THREE.Group(); pv.position.set(x, 0, z); g.add(pv); add(P.pedal, P.blk, 0, 0, 0, pv); add(P.spin, P.sil, -Math.sign(x) * 0.04, 0, 0, pv); pedals.push(pv); }
  g.userData.pedals = pedals; return g;
}

