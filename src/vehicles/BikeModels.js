// Motorcycle / scooter geometry, built from real parts rather than a toy silhouette: frame (steel cradle, steel trellis or
// aluminium twin-spar), engine (finned air-cooled single, liquid-cooled single, parallel twin, triple, inline four, 90° V-twin,
// scooter CVT unit), exhaust headers routed round the engine into a silencer, telescopic or upside-down forks with triple clamps,
// swingarm with chain adjusters, rear shocks with real coil springs, chain and sprockets, lofted tank / seat / tail / fairings,
// headlamps with reflectors and clear covers, LED or bulb indicators on stalks, mirrors with real mirror glass, analogue or TFT
// instruments, levers, master cylinders, switch gear, foot pegs, carbon-fibre panels on the superbikes.
// The main builder (mb) carries everything that shapes the silhouette; the near-LOD builder (dm, shown inside ~45 m) carries the
// small parts. Coordinates: +z forward, +x = the bike's LEFT (the kick-stand side), y up from the ground, metres.
import * as THREE from 'three';
import { BIKES } from './BikeCatalog.js';
import { raceBody } from './RaceBody.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z); const I4 = new THREE.Matrix4();
const lerp = (a, b, t) => a + (b - a) * t; const L3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
// curved tube through points (headers, frame tubes, brake lines, cables)
function tube(b, pts, r, col, rs = 8, segs = 0) { const c = new THREE.CatmullRomCurve3(pts.map((p) => V(...p))); const g = new THREE.TubeGeometry(c, segs || Math.max(6, pts.length * 7), r, rs, false); b.geometry(g, I4, col); g.dispose(); }
// coil spring between two points
function coil(b, a, e, r, turns, wire, col) { const d = V(e[0] - a[0], e[1] - a[1], e[2] - a[2]); const len = d.length(); d.normalize(); const u = Math.abs(d.y) < 0.9 ? V(0, 1, 0).cross(d).normalize() : V(1, 0, 0).cross(d).normalize(); const w = d.clone().cross(u);
  const pts = []; const n = turns * 10; for (let i = 0; i <= n; i++) { const t = i / n, ang = t * turns * Math.PI * 2; pts.push([a[0] + d.x * len * t + (u.x * Math.cos(ang) + w.x * Math.sin(ang)) * r, a[1] + d.y * len * t + (u.y * Math.cos(ang) + w.y * Math.sin(ang)) * r, a[2] + d.z * len * t + (u.z * Math.cos(ang) + w.z * Math.sin(ang)) * r]); }
  tube(b, pts, wire, col, 5, n); }
// fender / mudguard: a curved band over a wheel, both faces (angles from +z towards +y)
function arcBand(b, zc, yc, r, a0, a1, hw, col, n = 12) { for (let i = 0; i < n; i++) { const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n; const p = (x, t) => [x, yc + Math.sin(t) * r, zc + Math.cos(t) * r];
  b.quad(p(-hw, t0), p(hw, t0), p(hw, t1), p(-hw, t1), [0, 0, 1, 1], col); b.quad(p(hw, t0), p(-hw, t0), p(-hw, t1), p(hw, t1), [0, 0, 1, 1], col); } }
// toothed sprocket / gear, axis along x
const gearCache = new Map();
function gearGeo(teeth) { if (gearCache.has(teeth)) return gearCache.get(teeth); const g = new THREE.CylinderGeometry(1, 1, 1, teeth * 2, 1); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); if (x * x + z * z < 1e-9) continue; const a = Math.atan2(x, z); const k = Math.round(((a + Math.PI) / (2 * Math.PI)) * teeth * 2) % 2 ? 1 : 0.88; p.setX(i, x * k); p.setZ(i, z * k); }
  g.computeVertexNormals(); g.rotateZ(Math.PI / 2); gearCache.set(teeth, g); return g; }
const discX = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 20); g.rotateZ(Math.PI / 2); return g; })();
const ringZq = new THREE.TorusGeometry(1, 0.08, 5, 24); // bezel ring in the x/y plane (axis z)
const discZ = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 20); g.rotateX(Math.PI / 2); return g; })();
const hexX = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 6); g.rotateZ(Math.PI / 2); return g; })();
const cup = (() => { const p = []; for (let i = 0; i <= 8; i++) { const t = i / 8; p.push(new THREE.Vector2(0.04 + Math.sin(t * Math.PI / 2) * 0.96, -0.6 * Math.cos(t * Math.PI / 2))); } const g = new THREE.LatheGeometry(p, 20); g.rotateX(Math.PI / 2); return g; })();
const sph = new THREE.SphereGeometry(1, 12, 8);
// moulded plastic panel: a unit superellipsoid (rounded box, 1 × 1 × 1 like unitBox) — scaled thin it is a domed side cover
const pillow = (() => { const g = new THREE.SphereGeometry(0.5, 18, 12); const p = g.attributes.position; const e = 0.4;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) * 2, y = p.getY(i) * 2, z = p.getZ(i) * 2; const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), e) * 0.5; p.setXYZ(i, f(x), f(y), f(z)); }
  g.deleteAttribute('uv'); g.computeVertexNormals(); return g; })();
// extruded aluminium section: a unit rounded rectangle (superellipse, n = 4) along y with flat ends — frame spars, swingarm legs
const rbar = (() => { const seg = 20, pos = [], idx = []; const pt = (k) => { const a = k / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); return [Math.sign(c) * Math.pow(Math.abs(c), 0.5) * 0.5, Math.sign(s) * Math.pow(Math.abs(s), 0.5) * 0.5]; };
  for (const y of [-0.5, 0.5]) for (let k = 0; k < seg; k++) { const [x, z] = pt(k); pos.push(x, y, z); }
  for (let k = 0; k < seg; k++) { const a = k, b = (k + 1) % seg, c = a + seg, d = b + seg; idx.push(a, c, b, b, c, d); }
  const g0 = new THREE.BufferGeometry(); g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g0.setIndex(idx); g0.computeVertexNormals();
  const caps = []; for (const [y, ny] of [[-0.5, -1], [0.5, 1]]) { const cg = new THREE.CircleGeometry(0.5, seg); const cp = cg.attributes.position; for (let i = 1; i < cp.count; i++) { const [x, z] = pt((i - 1) % seg); cp.setXYZ(i, x, 0, z); } cp.setXYZ(0, 0, 0, 0); cg.rotateX(0); cg.deleteAttribute('uv');
    const P2 = cg.attributes.position; for (let i = 0; i < P2.count; i++) P2.setY(i, y); const N = cg.attributes.normal; for (let i = 0; i < N.count; i++) N.setXYZ(i, 0, ny, 0); if (ny < 0) { const ix = cg.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } } caps.push(cg); }
  const all = [g0.toNonIndexed(), ...caps.map((c) => c.toNonIndexed())]; let n = 0; for (const g of all) n += g.attributes.position.count; const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3); let o = 0;
  for (const g of all) { P.set(g.attributes.position.array, o * 3); Nn.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); return g; })();
// a flat face whose normal is (0, cos φ, −sin φ) — tilted back towards the rider by φ from straight up — centred at c, half sizes hw × hh,
// wound so a single-sided material shows it from the rider's side; uv rect left = the rider's left (+x)
function faceQuad(b, c, phi, hw, hh, uv, col = [1, 1, 1]) { const uy = Math.sin(phi) * hh, uz = Math.cos(phi) * hh;
  b.quad([c[0] + hw, c[1] - uy, c[2] - uz], [c[0] - hw, c[1] - uy, c[2] - uz], [c[0] - hw, c[1] + uy, c[2] + uz], [c[0] + hw, c[1] + uy, c[2] + uz], uv, col); }
const nrm = (phi, d) => [0, Math.cos(phi) * d, -Math.sin(phi) * d];

// ----------------------------------------------------------------------------------------------- layouts per style
// zF / zR axles; head = steering-head top [y, z]; rake (rad from vertical); fork: tele | usd, spacing fx, tube radius; bar: tube | clip
// with grip point; seat = rider hip point [y, z]; peg = [x, y, z]; pillion seat / peg
const LAY = {
  commuter: { zF: 0.64, zR: -0.63, head: [0.98, 0.32], rake: 0.46, fork: 'tele', fx: 0.075, fr: 0.017, bar: 'tube', grip: [0.33, 1.06, 0.18], seat: [0.8, -0.2], peg: [0.2, 0.3, 0.04], pil: [0.81, -0.5], ppeg: [0.2, 0.38, -0.38], tail: -0.86 },
  street: { zF: 0.66, zR: -0.65, head: [0.98, 0.33], rake: 0.44, fork: 'tele', fx: 0.08, fr: 0.019, bar: 'tube', grip: [0.33, 1.02, 0.2], seat: [0.8, -0.22], peg: [0.2, 0.33, -0.02], pil: [0.86, -0.52], ppeg: [0.2, 0.42, -0.36], tail: -0.9 },
  naked: { zF: 0.67, zR: -0.66, head: [0.96, 0.35], rake: 0.43, fork: 'usd', fx: 0.085, fr: 0.021, bar: 'tube', grip: [0.36, 1.01, 0.24], seat: [0.82, -0.2], peg: [0.2, 0.36, -0.08], pil: [0.9, -0.5], ppeg: [0.2, 0.46, -0.34], tail: -0.86 },
  sport: { zF: 0.68, zR: -0.67, head: [0.9, 0.42], rake: 0.42, fork: 'tele', fx: 0.09, fr: 0.021, bar: 'clip', grip: [0.31, 0.86, 0.36], seat: [0.82, -0.2], peg: [0.2, 0.38, -0.14], pil: [0.9, -0.5], ppeg: [0.2, 0.47, -0.4], tail: -0.92 },
  super: { zF: 0.71, zR: -0.71, head: [0.88, 0.45], rake: 0.41, fork: 'usd', fx: 0.1, fr: 0.026, bar: 'clip', grip: [0.31, 0.84, 0.39], seat: [0.84, -0.2], peg: [0.2, 0.41, -0.18], pil: [0.94, -0.52], ppeg: [0.2, 0.5, -0.42], tail: -0.95 },
  classic: { zF: 0.71, zR: -0.68, head: [1.0, 0.36], rake: 0.47, fork: 'tele', fx: 0.085, fr: 0.019, bar: 'tube', grip: [0.36, 1.08, 0.18], seat: [0.8, -0.2], peg: [0.2, 0.3, 0.0], pil: [0.84, -0.56], ppeg: [0.2, 0.36, -0.38], tail: -0.93 },
  adv: { zF: 0.76, zR: -0.71, head: [1.1, 0.38], rake: 0.47, fork: 'tele', fx: 0.09, fr: 0.021, bar: 'tube', grip: [0.39, 1.2, 0.2], seat: [0.85, -0.22], peg: [0.2, 0.38, -0.04], pil: [0.92, -0.55], ppeg: [0.2, 0.46, -0.38], tail: -1.0 },
  trail: { zF: 0.72, zR: -0.68, head: [1.08, 0.34], rake: 0.47, fork: 'tele', fx: 0.085, fr: 0.022, bar: 'tube', grip: [0.39, 1.15, 0.2], seat: [0.88, -0.2], peg: [0.2, 0.4, -0.04], pil: [0.92, -0.5], ppeg: [0.2, 0.48, -0.36], tail: -0.96 },
  scooter: { zF: 0.6, zR: -0.6, head: [1.04, 0.42], rake: 0.42, fork: 'tele', fx: 0.065, fr: 0.017, bar: 'scoot', grip: [0.33, 1.06, 0.36], seat: [0.78, -0.2], peg: [0.18, 0.35, 0.16], pil: [0.81, -0.54], ppeg: [0.2, 0.4, -0.38], tail: -0.84 },
};
LAY.scooterSport = { ...LAY.scooter, zF: 0.61, zR: -0.61, seat: [0.79, -0.2], tail: -0.86 };
LAY.retroScooter = { ...LAY.scooter, tail: -0.82 };

// the legacy generic type ('bike' / police bike, wheelR 0.30): an everyday 125 cc commuter, or (odd variants) a 100 cc one
const LEGACY = [BIKES.takami_tenro.bike, BIKES.veera_saathi.bike];

export function buildBike(mb, dm, K, spec, col, variant) {
  const { beam, part, C, unitBox, unitCyl, plateQuad } = K;
  // the shared loft winds its faces outward only when the sections run toward +z; bodywork here is mostly authored
  // front → back, so reverse those (and swap the caps) — otherwise the single-sided paint shows the shell's inside
  const loft = (mb, secs, col, o = {}) => { if (secs.length > 1 && secs[secs.length - 1][0] < secs[0][0]) { secs = [...secs].reverse(); o = { ...o, capFront: o.capBack ?? true, capBack: o.capFront ?? true }; } return K.loft(mb, secs, col, o); };
  const S = spec || LEGACY[variant % 2]; const st = S.style; const Lo = LAY[st]; const R = S.R; const scoot = st === 'scooter' || st === 'scooterSport' || st === 'retroScooter';
  const faired = st === 'sport' || st === 'super'; const sup = st === 'super';
  const P = mb.get('paint'), CH = mb.get('chrome'), RB = mb.get('rubber'), IN = mb.get('interior'), CF = mb.get('carbon'), AL = mb.get('alloy'), EN = mb.get('engine'), GL = mb.get('glass'), HL = mb.get('vlight'), TL = mb.get('vtail'), IND = mb.get('vind'), MR = mb.get('mirror');
  const dCH = dm.get('chrome'), dRB = dm.get('rubber'), dAL = dm.get('alloy'), dEN = dm.get('engine'), dLens = dm.get('lens'), dRefl = dm.get('vrefl'), dHL = dm.get('vlight'), dDash = dm.get('dash');
  const blk = C('#111214'), dark = C('#1c1d20'), satin = C('#8d9196'), steel = C('#b8bcc0'), chrome = C('#d4d8dc'), gold = C('#c9a23a'), rubber = C('#0e0e10'), seatC = C(st === 'classic' ? '#3a2416' : '#151517');
  const frameC = C(S.frameCol || (st === 'classic' ? S.colors[0] : '#151517')), acc = C(S.accent || '#d0d0d0');
  const engC = C(sup || st === 'naked' || st === 'sport' ? '#1d1e21' : st === 'classic' ? '#9a9ea2' : '#2a2b2e'), engCover = C(st === 'classic' ? '#c8ccd0' : sup ? '#3a3b3e' : '#8d9196');
  const { zF, zR } = Lo; const [hy, hz] = Lo.head; const sr = Math.sin(Lo.rake), cr = Math.cos(Lo.rake);
  const wF = sup ? 0.12 : st === 'sport' || st === 'naked' ? 0.11 : scoot ? 0.1 : st === 'trail' || st === 'adv' ? 0.09 : 0.085;
  const wR = sup ? 0.19 : st === 'sport' ? (S.wheel === 2 ? 0.15 : 0.13) : st === 'naked' ? (S.wheel === 2 ? 0.15 : 0.13) : scoot ? 0.11 : st === 'classic' || st === 'adv' ? 0.12 : 0.1;
  // ---- fork: axis from the front axle up to the steering head, legs at ±fx
  const fAt = (t) => [0, R + (hy + 0.02 - R) * t, zF + 0.025 - ((hy + 0.02 - R) / cr) * sr * t];
  const fTop = fAt(1), fLow = fAt(0.86);
  for (const s of [1, -1]) {
    const a = [s * Lo.fx, R, zF + 0.025], b = [s * Lo.fx, fTop[1], fTop[2]];
    if (Lo.fork === 'usd') { beam(CH, a, L3(a, b, 0.5), Lo.fr * 0.82, Lo.fr * 0.82, C('#2a2a2e'), unitCyl); beam(AL, L3(a, b, 0.42), b, Lo.fr * 1.25, Lo.fr * 1.25, sup ? gold : C('#1b1c1f'), unitCyl); part(AL, unitBox, [s * Lo.fx, R + 0.01, zF + 0.03], [Lo.rake, 0, 0], [0.04, 0.09, 0.06], C('#1b1c1f')); }
    else { beam(CH, a, L3(a, b, 0.62), Lo.fr, Lo.fr, chrome, unitCyl); beam(scoot ? P : AL, L3(a, b, 0.55), b, Lo.fr * 1.3, Lo.fr * 1.3, scoot ? col : satin, unitCyl); part(AL, unitBox, [s * Lo.fx, R + 0.005, zF + 0.025], [Lo.rake, 0, 0], [0.034, 0.09, 0.05], satin); }
    part(dAL, hexX, [s * (Lo.fx + 0.022), R, zF + 0.025], [0, 0, 0], [0.01, 0.012, 0.012], steel); // axle nut / pinch bolt
  }
  // triple clamps + steering stem nut
  part(AL, unitBox, [0, fTop[1] - 0.012, fTop[2]], [Lo.rake, 0, 0], [Lo.fx * 2 + 0.07, 0.022, 0.07], sup ? C('#8d9196') : satin); part(AL, unitBox, [0, fLow[1], fLow[2]], [Lo.rake, 0, 0], [Lo.fx * 2 + 0.06, 0.035, 0.06], dark);
  part(dAL, hexX, [0, fTop[1] + 0.003, fTop[2]], [0, 0, Math.PI / 2], [0.012, 0.02, 0.02], steel);
  const headTube = [[0, hy - 0.02, hz - 0.01], [0, hy - 0.2, hz + 0.08]];
  // ---- handlebars, grips, levers, master cylinders, switch gear
  const [gx, gy, gz] = Lo.grip; let bars;
  if (Lo.bar === 'clip') {
    for (const s of [1, -1]) { beam(AL, [s * Lo.fx, gy + 0.005, fTop[2] - 0.035], [s * (gx - 0.06), gy, gz + 0.01], 0.011, 0.011, blk, unitCyl); beam(RB, [s * (gx - 0.07), gy, gz + 0.01], [s * (gx + 0.03), gy - 0.004, gz - 0.005], 0.017, 0.017, rubber, unitCyl); part(AL, unitCyl, [s * Lo.fx, gy + 0.005, fTop[2] - 0.035], [Lo.rake, 0, 0], [0.024, 0.05, 0.024], C('#2a2a2e')); }
  } else if (Lo.bar === 'tube') {
    tube(CH, [[-gx + 0.05, gy, gz], [-gx * 0.55, gy - 0.02, gz + 0.06], [0, fTop[1] + 0.04, fTop[2] - 0.01], [gx * 0.55, gy - 0.02, gz + 0.06], [gx - 0.05, gy, gz]], st === 'naked' ? 0.014 : 0.0115, st === 'naked' ? blk : st === 'classic' ? chrome : C('#a8acb0'), 8, 30);
    for (const s of [1, -1]) beam(RB, [s * (gx - 0.1), gy, gz + 0.01], [s * (gx + 0.01), gy, gz - 0.005], 0.018, 0.018, rubber, unitCyl);
    part(AL, unitBox, [0, fTop[1] + 0.035, fTop[2] - 0.015], [Lo.rake, 0, 0], [0.09, 0.028, 0.04], st === 'classic' ? chrome : dark); // bar clamp
  }
  if (Lo.bar !== 'scoot') for (const s of [1, -1]) {
    part(RB, unitBox, [s * (gx - 0.12), gy + 0.005, gz + 0.02], [0, 0, 0], [0.05, 0.045, 0.05], blk); // switch gear
    beam(dAL, [s * (gx - 0.11), gy + 0.005, gz + 0.05], [s * (gx + 0.05), gy - 0.01, gz + 0.075], 0.008, 0.016, sup ? satin : C('#a8acb0')); // lever
    if (s < 0 || sup) { part(dAL, unitBox, [s * (gx - 0.165), gy + 0.035, gz + 0.03], [0.3, 0, 0], [0.035, 0.03, 0.03], s < 0 ? C('#1a1a1c') : blk); part(dLens, unitBox, [s * (gx - 0.165), gy + 0.04, gz + 0.047], [0.3, 0, 0], [0.026, 0.018, 0.003]); } // brake / clutch fluid reservoirs with sight glass
    tube(dRB, [[s * (gx - 0.16), gy - 0.01, gz + 0.03], [s * (Lo.fx + 0.03), gy - 0.12, gz + 0.12], [s * (Lo.fx + 0.02), R + 0.3, zF - 0.06]], 0.0045, blk, 5, 14); // brake / clutch line
  }
  bars = [[gx, gy, gz], [-gx, gy, gz]];
  // ---- frame
  const piv = [0, sup || st === 'sport' ? 0.46 : st === 'naked' ? 0.42 : 0.38, scoot ? -0.15 : -0.06];
  if (S.frame === 'spar') for (const s of [1, -1]) { const w = sup ? 0.17 : 0.15; const a = [s * 0.06, hy - 0.08, hz - 0.02], m = [s * w, hy - 0.12, hz - 0.3], b = [s * w, piv[1] + 0.05, piv[2] + 0.02];
    beam(AL, a, m, 0.035, 0.11, sup ? C('#8d9196') : C('#2a2b2e'), rbar); beam(AL, m, b, 0.035, 0.12, sup ? C('#8d9196') : C('#2a2b2e'), rbar); part(AL, pillow, [s * w, piv[1] - 0.04, piv[2] + 0.01], [0, 0, 0], [0.04, 0.22, 0.13], sup ? C('#8d9196') : C('#2a2b2e'));
    part(dAL, hexX, [s * (w + 0.02), piv[1], piv[2]], [0, 0, 0], [0.012, 0.016, 0.016], steel); }
  else if (S.frame === 'trellis') for (const s of [1, -1]) { const w = 0.13; const top = [[s * 0.05, hy - 0.06, hz - 0.03], [s * w, hy - 0.1, hz - 0.22], [s * w, hy - 0.14, hz - 0.44], [s * w, piv[1] + 0.12, piv[2] + 0.06]], bot = [[s * 0.05, hy - 0.2, hz + 0.0], [s * w, hy - 0.3, hz - 0.2], [s * w, hy - 0.36, hz - 0.4], [s * w, piv[1] + 0.02, piv[2] + 0.05]];
    for (let i = 0; i < 3; i++) { beam(P, top[i], top[i + 1], 0.013, 0.013, frameC, unitCyl); beam(P, bot[i], bot[i + 1], 0.013, 0.013, frameC, unitCyl); beam(P, top[i + 1], bot[i], 0.011, 0.011, frameC, unitCyl); beam(P, top[i + 1], bot[i + 1], 0.011, 0.011, frameC, unitCyl); } }
  else if (S.frame === 'cradle') { beam(P, headTube[1], [0, 0.28, hz - 0.02], 0.02, 0.02, frameC, unitCyl); tube(P, [[0, 0.28, hz - 0.02], [0, 0.2, hz - 0.12], [0, 0.2, piv[2] + 0.12], [0, piv[1] - 0.05, piv[2] + 0.02]], 0.018, frameC, 8, 20);
    tube(P, [[0, hy - 0.04, hz - 0.03], [0, hy - 0.1, hz - 0.3], [0, piv[1] + 0.28, piv[2] - 0.05], [0, piv[1] + 0.02, piv[2] + 0.02]], 0.022, frameC, 8, 24); }
  else { tube(P, [[0, hy - 0.1, hz - 0.02], [0, 0.45, hz - 0.12], [0, 0.3, hz - 0.3], [0, 0.3, -0.1], [0, 0.5, -0.4]], 0.03, frameC, 8, 24); } // scooter underbone
  if (!scoot) for (const s of [1, -1]) { tube(P, [[s * 0.07, piv[1] + 0.16, piv[2] - 0.02], [s * 0.08, Lo.seat[0] - 0.06, Lo.seat[1] - 0.1], [s * 0.065, Lo.pil[0] - 0.06, Lo.pil[1] - 0.15], [s * 0.05, Lo.pil[0] - 0.08, Lo.tail + 0.25]], 0.011, frameC === blk ? blk : C('#151517'), 6, 20); } // rear subframe
  part(RB, unitBox, [0.13, 0.31, -0.02], [0, 0, 0], [0.03, 0.04, 0.05], blk); // side-stand lug (Kickstand.js pivot)
  // ---- swingarm, chain adjusters, rear shocks
  const armW = (wR / 2) + 0.035;
  if (S.ssa) { beam(AL, [armW + 0.02, piv[1], piv[2]], [armW + 0.03, R + 0.02, zR], 0.05, 0.1, C('#8d9196')); part(AL, discX, [armW + 0.02, R, zR], [0, 0, 0], [0.05, 0.075, 0.075], C('#8d9196')); } // single-sided swingarm (left)
  else for (const s of [1, -1]) {
    const a = [s * (scoot ? 0.11 : armW), piv[1], piv[2]], b = [s * armW, R + 0.01, zR];
    if (scoot) continue;
    beam(st === 'classic' || st === 'commuter' || st === 'street' ? P : AL, a, b, sup || st === 'sport' ? 0.035 : 0.028, sup ? 0.085 : st === 'naked' || st === 'sport' ? 0.06 : 0.042, sup ? C('#8d9196') : st === 'classic' || st === 'commuter' || st === 'street' ? frameC : C('#2a2b2e'), sup ? rbar : unitBox);
    if (sup && s < 0) tube(AL, [[s * armW, piv[1] + 0.03, piv[2] - 0.05], [s * (armW + 0.005), piv[1] + 0.06, lerp(piv[2], zR, 0.45)], [s * armW, R + 0.06, zR + 0.12]], 0.016, C('#8d9196'), 8, 16); // banana brace (right)
    part(dAL, unitBox, [s * armW, R + 0.01, zR - 0.035], [0, 0, 0], [0.03, 0.025, 0.05], steel); part(dAL, hexX, [s * (armW + 0.018), R, zR], [0, 0, 0], [0.01, 0.014, 0.014], steel); // chain adjuster + axle nut
  }
  if (st === 'commuter' || st === 'street' || st === 'classic' || scoot) for (const s of scoot ? [-1] : [1, -1]) { // twin shocks with chrome / red springs
    const a = [s * (armW + 0.005), R + 0.05, zR + 0.06], b = [s * 0.11, Lo.pil[0] - 0.06, zR + 0.26];
    beam(CH, a, b, 0.012, 0.012, satin, unitCyl); coil(CH, L3(a, b, 0.12), L3(a, b, 0.86), 0.026, 7, 0.0045, st === 'street' ? C('#c42020') : chrome); part(CH, unitCyl, L3(a, b, 0.9), [0, 0, 0], [0.03, 0.04, 0.03], dark);
  } else { const a = [0, piv[1] + 0.03, piv[2] - 0.06], b = [0, piv[1] + 0.24, piv[2] - 0.12]; beam(CH, a, b, 0.012, 0.012, satin, unitCyl); coil(CH, L3(a, b, 0.1), L3(a, b, 0.85), 0.03, 6, 0.006, sup ? C('#e8b400') : C('#c42020')); part(dAL, unitCyl, L3(a, b, 0.95), [0, 0, 0], [0.025, 0.03, 0.025], gold); } // monoshock
  // ---- engine
  const E = S.engine;
  if (E === 'single' || E === 'singleLC') {
    const ac = E === 'single'; const tilt = st === 'commuter' || st === 'street' ? 1.15 : st === 'classic' ? 0.25 : st === 'adv' || st === 'trail' ? 0.3 : 0.5;
    const cc = [0, 0.33, 0.02]; part(EN, unitBox, cc, [0, 0, 0], [0.2, 0.2, 0.32], engC); part(EN, discX, [-0.105, 0.33, 0.0], [0, 0, 0], [0.025, 0.105, 0.105], engCover); part(EN, discX, [0.105, 0.34, 0.08], [0, 0, 0], [0.025, 0.085, 0.085], engCover);
    const base = [0, 0.4, 0.12], ax2 = [0, Math.cos(tilt), Math.sin(tilt)]; const at = (d) => [0, base[1] + ax2[1] * d, base[2] + ax2[2] * d];
    part(EN, unitBox, at(0.08), [tilt, 0, 0], [0.12, 0.16, 0.12], ac ? C('#2a2b2e') : engC);
    if (ac) for (let i = 0; i < 7; i++) part(EN, unitBox, at(0.03 + i * 0.022), [tilt, 0, 0], [0.2 - (i === 6 ? 0.02 : 0), 0.006, 0.17], i % 2 ? C('#3a3b3e') : C(st === 'classic' ? '#b0b4b8' : '#4a4c50')); // cooling fins
    else { part(EN, unitBox, at(0.18), [tilt, 0, 0], [0.15, 0.06, 0.14], C('#2a2b2e')); beam(RB, [0, 0.62, 0.36], [0, 0.42, 0.42], 0.016, 0.016, blk, unitCyl); }
    part(EN, unitBox, at(0.2), [tilt, 0, 0], [0.16, 0.05, 0.13], st === 'classic' ? chrome : engCover); // rocker cover
    part(dRB, unitCyl, L3(at(0.17), [0.08, at(0.17)[1], at(0.17)[2]], 0.6), [0, 0, Math.PI / 2], [0.012, 0.05, 0.012], C('#1a1a1a')); // spark plug cap
    const port = at(0.09); const exS = [0, port[1] - 0.04, port[2] + 0.06];
    if (!scoot) { // carburettor / throttle body + airbox behind the cylinder
      part(EN, unitCyl, [0, 0.55, -0.02], [Math.PI / 2, 0, 0], [0.03, 0.08, 0.03], satin); part(RB, unitBox, [0, 0.6, -0.14], [0, 0, 0], [0.16, 0.14, 0.16], blk);
      // exhaust: header down from the port, round under the engine on the right, into the silencer
      const hdr = [[0, exS[1], exS[2]], [-0.02, exS[1] - 0.12, exS[2] + 0.02], [-0.07, 0.2, 0.12], [-0.11, 0.22, -0.12]];
      tube(CH, hdr, 0.019, st === 'classic' ? chrome : C('#4a4b4e'), 8, 22);
      const s0 = [-0.12, 0.24, -0.15], s1 = st === 'trail' ? [-0.13, Lo.pil[0] - 0.05, Lo.tail + 0.2] : st === 'adv' ? [-0.15, 0.55, -0.62] : [-0.15, st === 'naked' ? 0.42 : 0.36, -0.68];
      if (st === 'classic') { beam(CH, s0, s1, 0.042, 0.042, chrome, unitCyl); part(CH, unitCyl, s1, [Math.PI / 2 - 0.06, 0, 0], [0.034, 0.05, 0.034], chrome); }
      else if (st === 'naked') { beam(CH, s0, L3(s0, [-0.15, 0.3, -0.38], 1), 0.03, 0.03, C('#3a3b3e'), unitCyl); part(AL, unitCyl, [-0.16, 0.35, -0.44], [Math.PI / 2 - 0.35, 0, 0], [0.06, 0.2, 0.06], C('#2a2b2e')); part(dCH, discZ, [-0.168, 0.385, -0.537], [-0.35, 0, 0], [0.04, 0.04, 0.01], C('#0a0a0a')); }
      else { beam(st === 'trail' ? CH : CH, s0, s1, 0.04, 0.04, st === 'trail' || st === 'adv' ? C('#2a2b2e') : C('#3a3b3e'), unitCyl); beam(dCH, L3(s0, s1, 0.2), L3(s0, s1, 0.75), 0.012, 0.075, chrome); part(dCH, discZ, s1, [0, 0, 0], [0.022, 0.022, 0.03], C('#0a0a0a')); } // heat shield + tail pipe
      dm.exhaust = { p: st === 'naked' ? [-0.168, 0.39, -0.55] : s1, d: [0, 0.05, -1], fuel: 'bike' };
    }
    if (!ac) { part(EN, unitBox, [0, 0.55, hz - 0.06], [-Lo.rake, 0, 0], [0.22, 0.2, 0.035], blk); for (let i = 0; i < 9; i++) part(dEN, unitBox, [0, 0.47 + i * 0.019, hz - 0.035 + i * 0.008], [-Lo.rake, 0, 0], [0.2, 0.004, 0.004], C('#3a3b3e')); } // radiator + fins
  } else if (E === 'twin' || E === 'i3' || E === 'i4') {
    const n = E === 'twin' ? 2 : E === 'i3' ? 3 : 4, W = 0.09 * n + 0.04, tilt = 0.55;
    part(EN, sup ? pillow : unitBox, [0, 0.31, sup ? 0.02 : 0.0], [0, 0, 0], [sup ? W : W + 0.04, sup ? 0.22 : 0.2, sup ? 0.34 : 0.36], engC); part(EN, sup ? pillow : unitBox, [0, 0.2, 0.0], [0, 0, 0], [W * 0.62, 0.07, 0.26], C('#2a2b2e')); // crankcase, sump (moulded castings on the racers, tucked inside the fairing)
    const base = [0, 0.42, 0.1]; const at = (d) => [0, base[1] + Math.cos(tilt) * d, base[2] + Math.sin(tilt) * d];
    part(EN, unitBox, at(0.08), [tilt, 0, 0], [W, 0.16, 0.16], engC); part(EN, unitBox, at(0.19), [tilt, 0, 0], [W - 0.01, 0.07, 0.17], C('#2a2b2e'));
    part(EN, unitBox, at(0.245), [tilt, 0, 0], [W - 0.03, 0.045, 0.15], sup ? acc : engCover); // cam cover (painted on the superbikes)
    part(EN, discX, [-(W / 2 + 0.03), 0.33, -0.02], [0, 0, 0], [0.03, 0.1, 0.1], engCover); part(EN, discX, [W / 2 + 0.03, 0.36, 0.12], [0, 0, 0], [0.03, 0.075, 0.075], engCover); part(EN, unitBox, [W / 2 + 0.025, 0.36, -0.07], [0, 0, 0], [0.025, 0.09, 0.1], engCover);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; part(dAL, hexX, [-(W / 2 + 0.047), 0.33 + Math.sin(a) * 0.085, -0.02 + Math.cos(a) * 0.085], [0, 0, 0], [0.006, 0.006, 0.006], steel); } // clutch-cover bolts
    for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.09; part(dRB, unitBox, [x, at(0.28)[1], at(0.28)[2]], [tilt, 0, 0], [0.03, 0.02, 0.03], C('#c42020')); } // coil-on-plug caps
    // radiator in front of the cylinders, with fins and a guard
    part(EN, unitBox, [0, 0.6, 0.34], [-Lo.rake, 0, 0], [W + 0.06, 0.26, 0.04], blk); for (let i = 0; i < 11; i++) part(dEN, unitBox, [0, 0.49 + i * 0.022, 0.365 - i * 0.0095], [-Lo.rake, 0, 0], [W + 0.04, 0.004, 0.004], C('#3a3b3e'));
    // headers: one per cylinder, down in front of the crankcase (clear of the front tyre), into a collector under the engine
    const hc = sup ? C('#9a8a72') : C('#4a4b4e'), hb = sup ? C('#55618a') : C('#3a3b3e');
    for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.09; const p0 = at(0.12); tube(CH, [[x, p0[1] - 0.06, p0[2] + 0.07], [x * 0.98, 0.42, 0.33], [x * 0.9, 0.3, 0.33]], 0.017, hb, 8, 14); tube(CH, [[x * 0.9, 0.3, 0.33], [x * 0.75, 0.2, 0.28], [x * 0.35, 0.14, 0.14], [-0.03, 0.13, -0.02]], 0.017, hc, 8, 18); }
    const mufS = [-0.06, 0.15, -0.08];
    if (E === 'i3') { part(AL, pillow, [0, 0.13, -0.16], [0.05, 0, 0], [0.2, 0.1, 0.26], C('#2a2b2e')); part(dCH, discZ, [-0.06, 0.13, -0.285], [0, 0, 0], [0.028, 0.028, 0.012], C('#0a0a0a')); part(dCH, discZ, [0.06, 0.13, -0.285], [0, 0, 0], [0.028, 0.028, 0.012], C('#0a0a0a')); dm.exhaust = { p: [-0.06, 0.13, -0.3], d: [0, 0, -1], fuel: 'bike' }; } // underslung triple box
    else { const s1 = [-0.17, sup ? 0.5 : 0.44, -0.58]; tube(CH, [mufS, [-0.12, 0.2, -0.2], [-0.15, 0.3, -0.3]], 0.03, hc, 8, 12);
      const can = sup ? CF : AL; part(can, unitCyl, L3([-0.15, 0.3, -0.3], s1, 0.55), [Math.PI / 2 - 0.42, 0, 0], [0.058, 0.32, 0.052], sup ? C('#232326') : C('#55585c')); // silencer: carbon on the superbikes
      part(AL, unitCyl, s1, [Math.PI / 2 - 0.42, 0, 0], [0.05, 0.05, 0.05], C('#8d9196')); part(dCH, discZ, [s1[0], s1[1] + 0.016, s1[2] - 0.03], [-0.42, 0, 0], [0.026, 0.026, 0.02], C('#050505'));
      dm.exhaust = { p: [s1[0], s1[1] + 0.02, s1[2] - 0.05], d: [0, 0.4, -1], fuel: 'bike' }; }
  } else if (E === 'v2') { // 90° V-twin: front cylinder nearly level, rear cylinder upright, belt covers, underbelly exhaust
    part(EN, unitBox, [0, 0.3, 0.0], [0, 0, 0], [0.24, 0.22, 0.38], engC);
    for (const [ang, d] of [[1.35, [0, 0.36, 0.14]], [-0.22, [0, 0.42, -0.05]]]) { const at = (k) => [0, d[1] + Math.cos(ang) * k, d[2] + Math.sin(ang) * k];
      part(EN, unitBox, at(0.1), [ang, 0, 0], [0.13, 0.17, 0.13], engC); part(EN, unitBox, at(0.21), [ang, 0, 0], [0.15, 0.07, 0.15], C('#2a2b2e')); part(EN, unitBox, at(0.255), [ang, 0, 0], [0.13, 0.03, 0.13], acc); part(EN, unitBox, [0.09, at(0.12)[1], at(0.12)[2]], [ang, 0, 0], [0.012, 0.22, 0.1], C('#c8102e')); } // cylinders, heads, cam covers, red belt covers
    part(EN, discX, [-0.135, 0.31, -0.02], [0, 0, 0], [0.03, 0.1, 0.1], C('#3a3b3e'));
    part(EN, unitBox, [0, 0.62, 0.36], [-Lo.rake, 0, 0], [0.26, 0.24, 0.04], blk);
    tube(CH, [[0, 0.33, 0.38], [0, 0.18, 0.34], [-0.03, 0.12, 0.1], [-0.04, 0.12, -0.1]], 0.02, C('#9a8a72'), 8, 18);
    part(CF, pillow, [-0.02, 0.12, -0.2], [0.04, 0, 0], [0.22, 0.09, 0.28], C('#232326')); for (const x of [-0.07, 0.03]) part(dCH, discZ, [x, 0.12, -0.335], [0, 0, 0], [0.025, 0.025, 0.012], C('#050505'));
    dm.exhaust = { p: [-0.02, 0.12, -0.35], d: [0, -0.05, -1], fuel: 'bike' };
  } else { // scooter: engine + CVT case is the left half of the swing arm; silencer on the right
    part(EN, unitBox, [0.07, 0.3, -0.38], [0, 0, 0], [0.11, 0.17, 0.46], C('#8d9196')); part(EN, unitBox, [0.12, 0.3, -0.38], [0, 0, 0], [0.02, 0.14, 0.4], C('#55585c'));
    part(EN, unitBox, [0, 0.32, -0.15], [0.9, 0, 0], [0.12, 0.13, 0.12], C('#3a3b3e')); part(RB, unitBox, [0.04, 0.48, -0.42], [0, 0, 0], [0.12, 0.1, 0.22], blk); // cylinder + airbox
    const s0 = [-0.1, 0.27, -0.2], s1 = [-0.15, 0.33, -0.62]; tube(CH, [[0, 0.26, -0.08], [-0.06, 0.2, -0.12], s0], 0.017, C('#3a3b3e'), 8, 12); beam(RB, s0, s1, 0.048, 0.056, C('#1c1c1e'), unitCyl); beam(dCH, L3(s0, s1, 0.3), L3(s0, s1, 0.8), 0.01, 0.07, chrome); part(dCH, unitCyl, [s1[0], s1[1] + 0.005, s1[2] - 0.04], [Math.PI / 2, 0, 0], [0.018, 0.06, 0.018], steel);
    dm.exhaust = { p: [s1[0], s1[1] + 0.005, s1[2] - 0.08], d: [0, 0, -1], fuel: 'bike' };
  }
  // ---- chain + sprockets (left side) on every geared bike
  if (!scoot) { const cx = (wR / 2) + 0.01, fs = [cx, piv[1] - 0.08, piv[2] + 0.06], rs = [cx, R, zR];
    part(dAL, gearGeo(15), fs, [0, 0, 0], [0.008, 0.04, 0.04], C('#3a3b3e')); const rr = sup ? 0.1 : 0.11;
    for (const s of [1, -1]) { const a = [cx, fs[1] + s * 0.038, fs[2]], b = [cx, rs[1] + s * rr, rs[2]]; beam(dRB, a, b, 0.012, 0.009, C('#2a2a2c')); const n = 18; for (let i = 0; i < n; i++) part(dAL, unitBox, L3(a, b, (i + 0.5) / n), [0, 0, 0], [0.014, 0.011, 0.012], C('#55585c')); }
    if (st === 'commuter' || st === 'street' || st === 'classic') beam(P, [cx + 0.02, fs[1] + 0.07, fs[2] - 0.02], [cx + 0.02, rs[1] + 0.14, rs[2] + 0.18], 0.012, 0.05, st === 'classic' ? col : blk); // chain guard
    else beam(RB, [cx + 0.012, fs[1] + 0.06, fs[2] - 0.12], [cx + 0.012, rs[1] + 0.13, rs[2] + 0.25], 0.006, 0.03, blk);
  }

  // ---- bodywork per style
  const ts = S.tankK || 1;
  if (sup || st === 'sport') {
    const tz = Lo.tail; const nz = zF + 0.13, ny = sup ? 0.79 : 0.8;
    if (sup) { // sculpted race bodywork + livery stickers (RaceBody.js); winglets in carbon on the cowl flanks
      raceBody(mb, { col, blk, seatC, cf: C('#232326'), make: S.make });
      for (const sx of [1, -1]) part(CF, pillow, [sx * 0.245, 0.742, 0.6], [0.06, sx * 0.12, sx * 0.22], [0.075, 0.009, 0.1], C('#232326')); // thin carbon winglets on the cowl flanks
    } else {
    const s = sup ? 1 : 0.94;
    loft(P, [[hz - 0.03, 0.78, 0.96 * s + 0.04, 0.14, 0.11, 0.06], [0.24, 0.76, 1.02 * s + 0.02, 0.17, 0.15, 0.08], [0.02, 0.76, 0.99 * s + 0.02, 0.165, 0.13, 0.08], [-0.13, 0.8, 0.9, 0.13, 0.1, 0.05]], col); // tank
    if (sup) loft(CF, [[0.3, 0.98, 1.035, 0.12, 0.1, 0.03], [0.05, 0.96, 1.0, 0.12, 0.1, 0.03]], C('#2a2a2e')); // carbon tank cover
    // upper fairing (nose), side panels, belly pan, winglets
        loft(P, [[hz + 0.04, 0.58, 1.0, 0.235, 0.2, 0.08], [hz + 0.2, 0.62, 0.98, 0.215, 0.16, 0.08], [nz - 0.06, ny - 0.07, ny + 0.13, 0.13, 0.09, 0.06], [nz, ny - 0.04, ny + 0.06, 0.06, 0.04, 0.03]], col);
    loft(P, [[hz + 0.08, 0.3, 0.7, 0.2, 0.245, 0.06], [hz - 0.12, 0.25, 0.76, 0.22, 0.25, 0.06], [0.08, 0.3, 0.76, 0.2, 0.225, 0.05], [-0.04, 0.42, 0.74, 0.16, 0.17, 0.04]], col, { noBottom: true }); // lower fairing: wide enough to enclose the engine and radiator (≈0.5 m)
    loft(P, [[hz + 0.07, 0.56, 0.9, 0.245, 0.2, 0.05], [0.3, 0.55, 0.86, 0.245, 0.195, 0.05], [0.14, 0.58, 0.8, 0.215, 0.18, 0.04]], col, { noBottom: true }); // upper side fairing: nose → tank → lower panels in one skin
    loft(P, [[hz - 0.02, 0.16, 0.3, 0.12, 0.17, 0.04], [0.0, 0.17, 0.3, 0.14, 0.17, 0.04], [-0.12, 0.2, 0.3, 0.1, 0.12, 0.03]], sup ? blk : col); // belly pan
    for (const sx of [1, -1]) {
      const sideX = sx * 0.246; IN.quad([sideX + sx * 0.001, 0.45, hz - 0.18], [sideX + sx * 0.001, 0.45, hz - 0.02], [sideX + sx * 0.001, 0.6, hz + 0.0], [sideX + sx * 0.001, 0.6, hz - 0.2], [0, 0, 1, 1], blk); // side vent
      if (sx < 0) IN.quad([sideX - 0.001, 0.45, hz - 0.18], [sideX - 0.001, 0.6, hz - 0.2], [sideX - 0.001, 0.6, hz + 0.0], [sideX - 0.001, 0.45, hz - 0.02], [0, 0, 1, 1], blk);
      if (sup) { part(CF, unitBox, [sx * 0.24, 0.7, hz + 0.12], [0, sx * 0.08, 0], [0.012, 0.05, 0.13], C('#232326')); part(CF, unitBox, [sx * 0.26, 0.7, hz + 0.1], [0, 0, sx * 0.25], [0.06, 0.008, 0.1], C('#232326')); } // carbon winglets
      // livery: stripes / colour blocks
      if (sup && S.livery === 'tricolour') { P.box(sx * 0.247, 0.52, hz - 0.08, 0.004, 0.06, 0.34, { col: acc }); P.box(sx * 0.226, 0.66, 0.06, 0.004, 0.035, 0.2, { col: C('#f2f2f0') }); }
      if (sup && S.livery === 'motorsport') { P.box(sx * 0.247, 0.5, hz - 0.1, 0.004, 0.035, 0.36, { col: acc }); P.box(sx * 0.247, 0.46, hz - 0.1, 0.004, 0.02, 0.36, { col: C('#c8102e') }); }
      if (sup && S.livery === 'split') P.box(sx * 0.247, 0.35, hz - 0.12, 0.004, 0.1, 0.3, { col: blk });
    }
    if (S.livery === 'stripe' || st === 'sport') { P.box(0, 1.045 * s + 0.0, 0.14, 0.05, 0.004, 0.3, { col: acc }); }
    // screen (smoked), headlamps (twin LED slits + projector), ram-air intake
    loft(GL, [[hz + 0.04, 0.98, 1.12, 0.15, 0.1, 0.04], [hz + 0.2, 0.96, 1.0, 0.15, 0.14, 0.02]], C('#fff'), { noBottom: true, capFront: false, capBack: false });
    for (const sx of [1, -1]) { HL.quad(...(sx > 0 ? [[0.03, ny - 0.0, nz - 0.03], [0.12, ny + 0.03, nz - 0.1], [0.12, ny + 0.06, nz - 0.1], [0.03, ny + 0.03, nz - 0.02]] : [[-0.03, ny + 0.03, nz - 0.02], [-0.12, ny + 0.06, nz - 0.1], [-0.12, ny + 0.03, nz - 0.1], [-0.03, ny - 0.0, nz - 0.03]]), [0, 0, 1, 1], [1, 1, 1]);
      part(dRefl, cup, [sx * 0.07, ny - 0.02, nz - 0.07], [0, sx * 0.4, 0], [0.032, 0.032, 0.02], C('#d8dce0')); part(dHL, sph, [sx * 0.07, ny - 0.02, nz - 0.072], [0, 0, 0], [0.014, 0.014, 0.008]); }
    part(IN, unitBox, [0, ny - 0.04, nz - 0.005], [0, 0, 0], [0.05, 0.035, 0.02], blk); // ram-air intake
    // tail: narrow upswept tail with seat cowl, LED light, plate hugger on an arm with LED indicators
    loft(P, [[-0.1, 0.64, 0.86, 0.15, 0.13, 0.05], [-0.42, 0.74, 0.95, 0.12, 0.1, 0.045], [tz + 0.12, 0.86, 1.02, 0.065, 0.05, 0.03], [tz + 0.02, 0.92, 1.03, 0.035, 0.03, 0.015]], col); // tail unit closed down to the undertray
    loft(RB, [[-0.2, 0.62, 0.66, 0.12, 0.13, 0.015], [tz + 0.1, 0.82, 0.86, 0.05, 0.06, 0.012]], blk); // undertray
    loft(IN, [[-0.06, 0.82, 0.875, 0.12, 0.115, 0.03], [-0.36, 0.86, 0.9, 0.11, 0.1, 0.03]], seatC); // rider seat (thin, firm)
    loft(sup ? CF : P, [[-0.4, 0.93, 0.98, 0.085, 0.07, 0.03], [-0.62, 0.95, 1.0, 0.07, 0.055, 0.025]], sup ? C('#232326') : col); // pillion seat cowl
    TL.quad([-0.035, 0.955, tz + 0.015], [0.035, 0.955, tz + 0.015], [0.03, 0.99, tz + 0.02], [-0.03, 0.99, tz + 0.02], [0, 0, 1, 1], [1, 1, 1]); TL.quad([0.035, 0.955, tz + 0.016], [-0.035, 0.955, tz + 0.016], [-0.03, 0.99, tz + 0.021], [0.03, 0.99, tz + 0.021], [0, 0, 1, 1], [1, 1, 1]);
    }
    // plate holder: racers carry a short tail tidy tucked right under the tail tip; the sport body keeps its longer hugger arm
    const plY = sup ? 0.78 : 0.6, plZ = sup ? tz + 0.02 : tz, inY = sup ? 0.84 : 0.67;
    beam(RB, sup ? [0, 0.95, -0.8] : [0, 0.74, -0.66], [0, plY, plZ + 0.03], 0.012, sup ? 0.06 : 0.07, blk);
    plateQuad(mb, 0, plY, plZ, 0.1, 0.04, false, variant);
    for (const sx of [1, -1]) { beam(dRB, [sx * 0.03, inY - 0.01, plZ + 0.06], [sx * 0.11, inY, plZ + 0.06], 0.008, 0.008, blk, unitCyl); part(IND, unitBox, [sx * 0.12, inY, plZ + 0.06], [0, 0, 0], [0.025, 0.012, 0.02]); }
    // mirrors on the fairing with integrated LED indicators
    for (const sx of [1, -1]) { const m = [sx * 0.24, 0.98, hz + 0.16]; beam(P, [sx * 0.16, 0.92, hz + 0.2], m, 0.015, 0.02, blk); part(P, pillow, [sx * 0.27, 0.99, hz + 0.15], [0, sx * 0.15, 0], [0.12, 0.055, 0.04], col);
      MR.quad(...(sx > 0 ? [[0.325, 0.968, hz + 0.122], [0.215, 0.968, hz + 0.139], [0.215, 1.012, hz + 0.139], [0.325, 1.012, hz + 0.122]] : [[-0.215, 0.968, hz + 0.139], [-0.325, 0.968, hz + 0.122], [-0.325, 1.012, hz + 0.122], [-0.215, 1.012, hz + 0.139]]), [0, 0, 1, 1], [1, 1, 1]);
      part(IND, unitBox, [sx * 0.3, 0.99, hz + 0.172], [0, sx * 0.15, 0], [0.06, 0.008, 0.004]); }
    // TFT dash behind the screen
    { const c = [0, 1.0, hz + 0.05], n = nrm(0.85, 0.0135); part(IN, unitBox, c, [-0.85, 0, 0], [0.15, 0.025, 0.09], blk); faceQuad(dDash, [c[0] + n[0], c[1] + n[1], c[2] + n[2]], 0.85, 0.065, 0.04, [0.5, 0.5, 1, 1]); }
    // front mudguard (carbon on the superbikes), hugger
    arcBand(sup ? CF : P, zF, R, R + 0.03, 0.55, 1.95, wF / 2 + 0.012, sup ? C('#232326') : col, 12); arcBand(sup ? CF : RB, zR, R, R + 0.025, 1.9, 2.6, wR / 2 + 0.01, sup ? C('#232326') : blk, 6);
    if (sup) { for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(dAL, unitCyl, [Math.sin(a) * 0.03, 1.03, 0.2 + Math.cos(a) * 0.03], [0, 0, 0], [0.004, 0.006, 0.004], steel); } part(AL, unitCyl, [0, 1.025, 0.2], [0, 0, 0], [0.038, 0.012, 0.038], C('#8d9196')); } // aircraft-style fuel cap with its bolt ring
  } else if (st === 'naked') {
    const sm = S.small ? 0.94 : 1;
    loft(P, [[hz - 0.03, 0.8, 0.98 * sm + 0.04, 0.13, 0.11, 0.06], [0.22, 0.76, 1.03 * sm + 0.02, 0.17, 0.15, 0.08], [0.0, 0.77, 0.98 * sm + 0.02, 0.16, 0.13, 0.08], [-0.12, 0.8, 0.9, 0.12, 0.1, 0.05]], col);
    for (const sx of [1, -1]) part(P, pillow, [sx * 0.178, 0.74, 0.28], [0, sx * -0.25, 0.1 * sx], [0.035, 0.2, 0.26], acc); // radiator shrouds (moulded)
    // angular LED headlamp mask, short flyscreen
    loft(P, [[zF - 0.2, 0.84, 1.0, 0.1, 0.09, 0.03], [zF - 0.12, 0.86, 0.98, 0.09, 0.07, 0.03]], blk); HL.quad([-0.06, 0.87, zF - 0.115], [0.06, 0.87, zF - 0.115], [0.05, 0.94, zF - 0.115], [-0.05, 0.94, zF - 0.115], [0, 0, 1, 1], [1, 1, 1]);
    part(dRefl, cup, [0, 0.905, zF - 0.13], [0, 0, 0], [0.045, 0.03, 0.02], C('#d8dce0')); GL.quad([-0.08, 0.98, zF - 0.16], [0.08, 0.98, zF - 0.16], [0.07, 1.06, zF - 0.21], [-0.07, 1.06, zF - 0.21], [0, 0, 1, 1], C('#fff'));
    const tz = Lo.tail; loft(P, [[-0.1, 0.78, 0.86, 0.13, 0.12, 0.04], [-0.42, 0.84, 0.96, 0.11, 0.1, 0.04], [tz + 0.06, 0.92, 1.0, 0.05, 0.04, 0.02]], st === 'naked' && S.frameCol ? C('#f2f2f0') : col);
    loft(IN, [[-0.06, 0.82, 0.88, 0.13, 0.12, 0.03], [-0.36, 0.86, 0.92, 0.11, 0.1, 0.03], [-0.62, 0.9, 0.96, 0.085, 0.07, 0.03]], seatC);
    TL.quad([-0.03, 0.93, tz + 0.055], [0.03, 0.93, tz + 0.055], [0.025, 0.965, tz + 0.06], [-0.025, 0.965, tz + 0.06], [0, 0, 1, 1], [1, 1, 1]);
    beam(RB, [0, 0.8, -0.62], [0, 0.6, tz - 0.0], 0.03, 0.12, blk); plateQuad(mb, 0, 0.6, tz - 0.04, 0.1, 0.04, false, variant);
    for (const sx of [1, -1]) { beam(dRB, [sx * 0.03, 0.66, tz + 0.02], [sx * 0.11, 0.67, tz + 0.02], 0.008, 0.008, blk, unitCyl); part(IND, unitBox, [sx * 0.12, 0.67, tz + 0.02], [0, 0, 0], [0.025, 0.012, 0.02]); beam(dRB, [sx * 0.07, 0.86, zF - 0.17], [sx * 0.13, 0.86, zF - 0.17], 0.007, 0.007, blk, unitCyl); part(IND, unitBox, [sx * 0.14, 0.86, zF - 0.17], [0, 0, 0], [0.025, 0.012, 0.02]); }
    { const c = [0, fTop[1] + 0.07, fTop[2] - 0.03], n = nrm(0.7, 0.0135); part(IN, unitBox, c, [-0.7, 0, 0], [0.12, 0.025, 0.08], blk); faceQuad(dDash, [c[0] + n[0], c[1] + n[1], c[2] + n[2]], 0.7, 0.052, 0.034, [0.5, 0.5, 1, 1]); } // TFT
    arcBand(P, zF, R, R + 0.03, 0.6, 1.9, wF / 2 + 0.012, blk, 10); arcBand(RB, zR, R, R + 0.025, 1.9, 2.6, wR / 2 + 0.01, blk, 6);
  } else if (st === 'commuter' || st === 'street' || st === 'classic' || st === 'adv' || st === 'trail') {
    const cl = st === 'classic', tr = st === 'trail', adv = st === 'adv';
    const ty = tr ? 0.08 : adv ? 0.06 : 0; // tall bikes
    loft(P, cl ? [[hz - 0.04, 0.76, 0.92, 0.09, 0.09, 0.07], [0.2, 0.72, 0.98, 0.155, 0.14, 0.1], [0.0, 0.73, 0.95, 0.15, 0.13, 0.1], [-0.12, 0.77, 0.86, 0.1, 0.09, 0.06]]
      : tr ? [[hz - 0.04, 0.82, 0.96, 0.1, 0.09, 0.04], [0.14, 0.82, 0.98, 0.13, 0.11, 0.05], [-0.06, 0.84, 0.95, 0.11, 0.09, 0.04]]
        : [[hz - 0.04, 0.74 + ty, 0.9 + ty, 0.1, 0.1, 0.05], [0.2, 0.7 + ty, 0.96 * ts + ty, 0.155 * ts, 0.13, 0.07], [0.0, 0.7 + ty, 0.93 * ts + ty, 0.155 * ts, 0.13, 0.07], [-0.13, 0.73 + ty, 0.85 + ty, 0.12, 0.1, 0.05]], col);
    if (cl) { for (const sx of [1, -1]) { part(CH, sph, [sx * 0.15, 0.84, 0.08], [0, 0, 0], [0.006, 0.06, 0.09], chrome); P.box(sx * 0.152, 0.84, 0.1, 0.004, 0.05, 0.16, { col: acc }); } part(CH, discZ, [0, 0.99, 0.12], [Math.PI / 2, 0, 0], [0.04, 0.04, 0.012], chrome); } // tank badges, pin-stripes, chrome cap
    else part(dCH, discZ, [0, 0.965 * ts + ty, 0.12], [Math.PI / 2, 0, 0], [0.035, 0.035, 0.012], chrome);
    if (st === 'street') { for (const sx of [1, -1]) part(P, pillow, [sx * 0.165, 0.76, 0.2], [0, -sx * 0.2, 0], [0.025, 0.16, 0.2], acc); } // tank extensions
    if (!cl && !tr) for (const sx of [1, -1]) part(P, pillow, [sx * 0.112, 0.6 + ty, -0.26], [0, 0, 0], [0.035, 0.17, 0.3], st === 'street' ? blk : col); // side covers (moulded)
    // seat: long bench (commuter / adventure), split (street), sprung saddle + pillion pad (classic), long flat (trail)
    if (cl) { loft(IN, [[-0.08, 0.77, 0.81, 0.11, 0.13, 0.03], [-0.32, 0.78, 0.83, 0.13, 0.12, 0.03]], seatC); for (const sx of [1, -1]) coil(dCH, [sx * 0.07, 0.68, -0.3], [sx * 0.07, 0.77, -0.3], 0.014, 5, 0.003, chrome); loft(IN, [[-0.46, 0.79, 0.83, 0.1, 0.1, 0.03], [-0.66, 0.79, 0.83, 0.09, 0.09, 0.03]], seatC); }
    else if (st === 'street') { loft(IN, [[-0.08, 0.74, 0.8, 0.13, 0.12, 0.04], [-0.34, 0.75, 0.81, 0.13, 0.12, 0.04]], seatC); loft(IN, [[-0.4, 0.8, 0.86, 0.11, 0.1, 0.03], [-0.66, 0.82, 0.87, 0.09, 0.08, 0.03]], seatC); }
    else loft(IN, [[-0.1, 0.74 + ty, 0.8 + ty, 0.13, 0.12, 0.04], [-0.3, 0.74 + ty, 0.81 + ty, 0.14, 0.13, 0.04], [-0.62, 0.75 + ty, 0.81 + ty, 0.12, 0.11, 0.04], [-0.72, 0.76 + ty, 0.8 + ty, 0.09, 0.08, 0.03]], seatC);
    // rear mudguard / tail, tail lamp, rack or grab rail
    const tz = Lo.tail;
    if (cl) { arcBand(P, zR, R, R + 0.04, 1.2, 2.75, wR / 2 + 0.02, col, 14); }
    else if (tr) { loft(P, [[-0.5, 0.86, 0.9, 0.08, 0.08, 0.02], [tz + 0.02, 0.92, 0.95, 0.06, 0.05, 0.015]], col); }
    else { loft(P, [[-0.68, 0.7 + ty, 0.78 + ty, 0.11, 0.1, 0.03], [tz + 0.04, 0.72 + ty, 0.78 + ty, 0.08, 0.07, 0.03]], st === 'street' ? col : col); arcBand(RB, zR, R, R + 0.035, 1.75, 2.65, wR / 2 + 0.012, blk, 8); }
    const tly = cl ? 0.6 : tr ? 0.93 : 0.75 + ty; TL.box(0, tly, tz + 0.01, 0.1, 0.05, 0.035); part(dLens, unitBox, [0, tly, tz - 0.009], [0, 0, 0], [0.11, 0.06, 0.004]);
    if (st === 'commuter' || adv) { for (const sx of [1, -1]) beam(CH, [sx * 0.11, 0.8 + ty, -0.55], [sx * 0.1, 0.81 + ty, tz + 0.06], 0.009, 0.009, adv ? blk : C('#a8acb0'), unitCyl); beam(CH, [-0.1, 0.81 + ty, tz + 0.06], [0.1, 0.81 + ty, tz + 0.06], 0.009, 0.009, adv ? blk : C('#a8acb0'), unitCyl); } // carrier rack
    plateQuad(mb, 0, tly - 0.08, tz - 0.005, 0.11, 0.042, false, variant);
    for (const sx of [1, -1]) { beam(dRB, [sx * 0.05, tly, tz + 0.05], [sx * 0.13, tly + 0.005, tz + 0.05], 0.007, 0.007, blk, unitCyl); part(IND, sph, [sx * 0.14, tly + 0.005, tz + 0.05], [0, 0, 0], [0.024, 0.02, 0.032]); }
    // headlamp: round chrome bezel (commuter / classic) with reflector + bulb + clear lens; bikini cowl (street); rally beak + screen (adventure); number-board lamp (trail)
    const lz = zF - 0.18, ly = hy - 0.06;
    if (st === 'street') { loft(P, [[lz - 0.06, ly - 0.12, ly + 0.11, 0.12, 0.1, 0.05], [lz + 0.06, ly - 0.08, ly + 0.07, 0.09, 0.07, 0.04]], col); HL.quad([-0.06, ly - 0.06, lz + 0.065], [0.06, ly - 0.06, lz + 0.065], [0.05, ly + 0.03, lz + 0.065], [-0.05, ly + 0.03, lz + 0.065], [0, 0, 1, 1], [1, 1, 1]); GL.quad([-0.09, ly + 0.07, lz + 0.03], [0.09, ly + 0.07, lz + 0.03], [0.08, ly + 0.15, lz - 0.03], [-0.08, ly + 0.15, lz - 0.03], [0, 0, 1, 1], C('#fff')); }
    else if (adv) { loft(P, [[lz - 0.1, ly - 0.14, ly + 0.14, 0.16, 0.13, 0.05], [lz + 0.04, ly - 0.1, ly + 0.08, 0.13, 0.1, 0.05]], col); part(CH, unitCyl, [0, ly - 0.03, lz + 0.05], [Math.PI / 2, 0, 0], [0.075, 0.03, 0.075], chrome); part(HL, unitCyl, [0, ly - 0.03, lz + 0.066], [Math.PI / 2, 0, 0], [0.065, 0.004, 0.065]); GL.quad([-0.14, ly + 0.12, lz - 0.06], [0.14, ly + 0.12, lz - 0.06], [0.12, ly + 0.36, lz - 0.16], [-0.12, ly + 0.36, lz - 0.16], [0, 0, 1, 1], C('#fff'));
      arcBand(P, zF, R, R + 0.13, 0.4, 1.45, 0.07, col, 8); for (const sx of [1, -1]) tube(CH, [[sx * 0.12, 0.62, 0.32], [sx * 0.24, 0.5, 0.26], [sx * 0.22, 0.28, 0.12], [sx * 0.1, 0.2, 0.05]], 0.012, blk, 6, 16); part(AL, unitBox, [0, 0.14, 0.08], [0.15, 0, 0], [0.2, 0.012, 0.34], satin); } // beak, screen, crash bars, bash plate
    else if (tr) { part(P, pillow, [0, ly - 0.02, lz + 0.04], [-Lo.rake, 0, 0], [0.18, 0.2, 0.02], col); part(CH, unitCyl, [0, ly - 0.02, lz + 0.06], [Math.PI / 2, 0, 0], [0.06, 0.02, 0.06], blk); part(HL, unitCyl, [0, ly - 0.02, lz + 0.071], [Math.PI / 2, 0, 0], [0.05, 0.004, 0.05]); arcBand(P, zF - 0.02, R, R + 0.1, 0.9, 2.2, 0.055, col, 10); } // number board + high front fender
    else { part(CH, unitCyl, [0, ly, lz + 0.02], [Math.PI / 2, 0, 0], [0.085, 0.09, 0.085], cl || st === 'commuter' ? chrome : blk); part(HL, unitCyl, [0, ly, lz + 0.067], [Math.PI / 2, 0, 0], [0.074, 0.004, 0.074]);
      part(dRefl, cup, [0, ly, lz + 0.06], [0, 0, 0], [0.07, 0.07, 0.03], C('#d8dce0')); part(dHL, sph, [0, ly, lz + 0.05], [0, 0, 0], [0.012, 0.012, 0.012]); part(dLens, discZ, [0, ly, lz + 0.069], [0, 0, 0], [0.075, 0.075, 0.003]);
      for (const sx of [1, -1]) beam(CH, [sx * (Lo.fx + 0.015), ly - 0.02, lz - 0.02], [sx * 0.07, ly - 0.02, lz + 0.0], 0.008, 0.008, chrome, unitCyl); } // headlamp ears
    if (!tr) for (const sx of [1, -1]) { beam(dRB, [sx * 0.07, ly - 0.02, lz - 0.01], [sx * 0.15, ly - 0.01, lz - 0.0], 0.007, 0.007, blk, unitCyl); part(IND, sph, [sx * 0.16, ly - 0.01, lz + 0.005], [0, 0, 0], [0.026, 0.022, 0.035]); }
    if (!adv && !tr) arcBand(cl ? CH : P, zF, R, R + 0.035, 0.55, 2.0, wF / 2 + 0.014, cl ? chrome : col, 12); // front mudguard
    // analogue instruments: round speedo (classic: twin pods) on the top clamp
    const dz = fTop[2] - 0.035, dy = fTop[1] + 0.08;
    for (const ox of cl ? [-0.055, 0.055] : [0]) { const c = [ox, dy, dz], n = nrm(0.85, 0.0205); part(IN, discZ, c, [Math.PI / 2 - 0.85, 0, 0], [0.055, 0.055, 0.04], cl ? chrome : blk); faceQuad(dDash, [c[0] + n[0], c[1] + n[1], c[2] + n[2]], 0.85, 0.046, 0.046, [0, 0, 0.5, 1]); part(dCH, ringZq, [c[0] + n[0] * 1.05, c[1] + n[1] * 1.05, c[2] + n[2] * 1.05], [Math.PI / 2 - 0.85, 0, 0], [0.05, 0.05, 0.05], chrome); } // dial + chrome bezel ring
  } else { // ---- scooters: front apron + leg shield, floorboard, under-seat body, handlebar cowl with lamp and speedo
    const rt = st === 'retroScooter', sp = st === 'scooterSport';
    loft(P, [[0.36, 0.3, 0.6, 0.15, 0.17, 0.08], [0.52, 0.36, 0.95, 0.18, 0.16, 0.08], [0.6, 0.5, 1.0, 0.13, 0.11, 0.06], [0.64, 0.66, 0.98, 0.07, 0.06, 0.03]], col); // apron
    P.quad([-0.16, 0.36, 0.42], [0.16, 0.36, 0.42], [0.15, 0.95, 0.44], [-0.15, 0.95, 0.44], [0, 0, 1, 1], C('#1c1c1e')); // inner leg shield
    loft(RB, [[0.42, 0.26, 0.345, 0.19, 0.19, 0.03], [0.0, 0.26, 0.345, 0.19, 0.19, 0.03]], blk); for (let i = 0; i < 6; i++) dRB.box(0, 0.347, 0.36 - i * 0.065, 0.34, 0.004, 0.012, { col: C('#2a2a2c') }); // wide floorboard (feet ~0.18 m out) + ribs
    loft(P, [[0.02, 0.28, 0.62, 0.15, 0.13, 0.08], [-0.2, 0.3, 0.76, 0.18, 0.16, 0.1], [-0.55, 0.42, 0.78, 0.17, 0.14, 0.1], [Lo.tail + 0.06, 0.55, 0.74, 0.09, 0.08, 0.06]], col, { noBottom: true }); // body
    if (sp) for (const sx of [1, -1]) part(P, unitBox, [sx * 0.17, 0.56, -0.42], [0, 0, 0.1 * sx], [0.01, 0.06, 0.3], acc);
    loft(IN, [[-0.08, 0.74, 0.8, 0.14, 0.13, 0.04], [-0.38, 0.76, 0.82, 0.14, 0.13, 0.04], [-0.64, 0.77, 0.83, 0.11, 0.1, 0.04]], seatC);
    if (rt) { part(CH, sph, [0, 0.86, Lo.tail + 0.08], [0, 0, 0], [0.003, 0.003, 0.003], chrome); beam(CH, [-0.12, 0.82, -0.58], [0.12, 0.82, -0.58], 0.01, 0.01, chrome, unitCyl); }
    TL.box(0, 0.68, Lo.tail + 0.04, 0.12, 0.05, 0.03); plateQuad(mb, 0, 0.56, Lo.tail + 0.02, 0.1, 0.04, false, variant); for (const sx of [1, -1]) part(IND, unitBox, [sx * 0.1, 0.66, Lo.tail + 0.045], [0, 0, 0], [0.04, 0.025, 0.02]);
    arcBand(P, zF, R, R + 0.03, 0.6, 2.0, wF / 2 + 0.015, col, 10); arcBand(RB, zR, R, R + 0.03, 1.8, 2.7, wR / 2 + 0.012, blk, 8);
    // handlebar cowl (the bars are inside it), grips, levers, headlamp, speedo
    loft(P, [[fTop[2] - 0.12, fTop[1] - 0.02, fTop[1] + 0.1, 0.12, 0.1, 0.05], [fTop[2] + 0.08, fTop[1] - 0.04, fTop[1] + 0.06, 0.1, 0.08, 0.04]], rt ? C('#f2f0ea') : col);
    for (const sx of [1, -1]) { beam(RB, [sx * 0.2, gy, gz], [sx * (gx + 0.01), gy, gz - 0.01], 0.018, 0.018, rubber, unitCyl); beam(CH, [sx * 0.12, gy, gz], [sx * 0.2, gy, gz], 0.011, 0.011, satin, unitCyl); beam(dAL, [sx * 0.2, gy + 0.01, gz + 0.04], [sx * (gx + 0.04), gy, gz + 0.06], 0.008, 0.015, satin); }
    if (rt) { part(CH, unitCyl, [0, fTop[1] + 0.03, fTop[2] + 0.1], [Math.PI / 2, 0, 0], [0.07, 0.04, 0.07], chrome); part(HL, unitCyl, [0, fTop[1] + 0.03, fTop[2] + 0.121], [Math.PI / 2, 0, 0], [0.06, 0.004, 0.06]); }
    else HL.quad([-0.07, fTop[1] - 0.01, fTop[2] + 0.085], [0.07, fTop[1] - 0.01, fTop[2] + 0.085], [0.06, fTop[1] + 0.04, fTop[2] + 0.08], [-0.06, fTop[1] + 0.04, fTop[2] + 0.08], [0, 0, 1, 1], [1, 1, 1]);
    for (const sx of [1, -1]) part(IND, unitBox, [sx * 0.11, 0.9, 0.62], [0, 0, 0], [0.05, 0.03, 0.03]);
    faceQuad(dDash, [0, fTop[1] + 0.098, fTop[2] - 0.06], 0.45, sp ? 0.06 : 0.04, sp ? 0.03 : 0.04, sp ? [0.5, 0.5, 1, 1] : [0, 0, 0.5, 1]); // speedo in the cowl top
  }
  // ---- mirrors on stalks (everything but the faired bikes): housing + real mirror glass facing the rider
  if (!faired) for (const sx of [1, -1]) {
    const base = Lo.bar === 'scoot' ? [sx * 0.2, gy + 0.03, gz + 0.02] : [sx * (gx - 0.13), gy + 0.02, gz + 0.03], top = [sx * (gx - 0.04), gy + (st === 'naked' ? 0.2 : 0.27), gz + 0.04];
    beam(CH, base, top, 0.006, 0.006, st === 'classic' ? chrome : blk, unitCyl); const hx = top[0] + sx * 0.03;
    if (st === 'classic' || st === 'retroScooter' || st === 'commuter') { part(P, discZ, [hx, top[1] + 0.02, top[2]], [0, 0, 0], [0.055, 0.055, 0.03], st === 'classic' ? chrome : blk); part(MR, discZ, [hx, top[1] + 0.02, top[2] - 0.016], [0, 0, 0], [0.048, 0.048, 0.002], [1, 1, 1]); }
    else { part(P, pillow, [hx, top[1] + 0.02, top[2]], [0, 0, sx * 0.15], [0.12, 0.06, 0.03], blk); MR.quad([hx + 0.055, top[1] - 0.005, top[2] - 0.016], [hx - 0.055, top[1] - 0.005, top[2] - 0.016], [hx - 0.055, top[1] + 0.045, top[2] - 0.016], [hx + 0.055, top[1] + 0.045, top[2] - 0.016], [0, 0, 1, 1], [1, 1, 1]); } /* mirror glass faces back at the rider */
  }
  // ---- foot pegs, gear lever (left), brake pedal (right), pillion pegs, horn
  if (!scoot) for (const sx of [1, -1]) {
    const [px, py, pz] = Lo.peg; beam(RB, [sx * (px - 0.07), py, pz], [sx * (px + 0.04), py, pz], 0.012, 0.012, faired || st === 'naked' ? satin : blk, unitCyl);
    beam(dAL, [sx * (px - 0.02), py + 0.0, pz + 0.04], [sx * (px - 0.02), py + 0.04, pz + 0.17], 0.008, 0.012, satin); // gear lever / brake pedal
    if (faired || st === 'naked') part(AL, unitBox, [sx * (px - 0.04), py + 0.06, pz + 0.02], [0.3, 0, 0], [0.012, 0.13, 0.06], C('#2a2b2e')); // rear-set hanger
    const [qx, qy, qz] = Lo.ppeg; beam(dRB, [sx * (qx - 0.05), qy, qz], [sx * (qx + 0.03), qy, qz], 0.01, 0.01, blk, unitCyl);
  }
  if (!faired) part(dCH, discZ, [0.06, hy - 0.2, hz + 0.06], [0, 0, 0], [0.03, 0.03, 0.012], C('#1a1a1c'));

  // ---- seats (rider / pillion) for boarding + the riding pose
  const lean = sup ? 0.62 : st === 'sport' ? 0.55 : st === 'naked' ? 0.38 : st === 'classic' ? 0.18 : scoot ? 0.24 : 0.28;
  const seats = [{ x: 0, y: Lo.seat[0], z: Lo.seat[1], floor: Lo.peg[1], fz: Lo.peg[2] - Lo.seat[1], fx: Lo.peg[0], roof: 9, lean, hands: 'bars', bars, kind: 'ride', driver: true, ride: true, exit: [0.75, Lo.seat[1] + 0.12] },
    { x: 0, y: Lo.pil[0], z: Lo.pil[1], floor: Lo.ppeg[1], fz: Lo.ppeg[2] - Lo.pil[1], fx: Lo.ppeg[0] + 0.08, roof: 9, lean: 0.08 + (sup ? 0.2 : 0), hands: 'lap', kind: 'ride', ride: true, exit: [0.75, Lo.pil[1] - 0.1] }];
  const wheelStyle = S.wheel ?? 0;
  return { wheels: [[0, R, zF, wF], [0, R, zR, wR]], seats, steerWheel: [0, gy, gz + 0.04], wheelStyle, bikeStyle: st };
}

export function bikeSpecOf(T, variant) { return T && T.bike ? T.bike : LEGACY[variant % 2]; }
