// Procedural vehicle models typical of Colombo streets. Local frame: +z forward, y up, origin on the ground under the
// vehicle centre. Right-hand drive (Sri Lanka): the driver sits on the right = local −x, kerb side is local +x.
//
// Construction: body sides are extruded silhouettes with real wheel-arch cut-outs, then warped in plan (rounded noses,
// tumblehome) so the bodywork reads as pressed panels rather than boxes; cabins get pillars, tinted glass and visible
// interiors (seats, dashboard, steering wheel); wheels are lathed tyres with alloy rims; cars and vans get a separately
// hinged driver door used by the entry/exit animation.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { carDetail, tukDetail, bikeDetail, heavyDetail, hiWheelParts } from './VehicleDetail.js';
import { MeshBuilder, MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { RNG } from '../core/rng.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const lerp = (a, b, t) => a + (b - a) * t; const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const VTYPES = {
  tuktuk: { len: 2.65, wid: 1.3, hgt: 1.8, wheelR: 0.24, maxSpeed: 15, accel: 3.2, mass: 350, seats: 3, steer: 0.62, sound: 'tuk', entry: 'tuk', colors: ['#1b6b3a', '#8c1c22', '#1d3f8a', '#d9a514', '#5a1824', '#1e1e20', '#c9501a', '#22707e', '#2f4f2f'] },
  car: { len: 4.0, wid: 1.7, hgt: 1.5, wheelR: 0.31, maxSpeed: 38, accel: 5.5, mass: 1100, seats: 4, steer: 0.55, sound: 'car', entry: 'car', colors: ['#e9e9e6', '#b9bec4', '#2a2c30', '#7c1820', '#1f3a6b', '#5e6268', '#f2f2f0', '#3a4a3a', '#b8a888'] },
  sedan: { len: 4.5, wid: 1.74, hgt: 1.45, wheelR: 0.32, maxSpeed: 42, accel: 6, mass: 1250, seats: 4, steer: 0.52, sound: 'car', entry: 'car', colors: ['#f2f2f0', '#c0c4c8', '#1a1c20', '#5e6268', '#24365a', '#5a1a1a'] },
  taxi: { len: 4.0, wid: 1.7, hgt: 1.5, wheelR: 0.31, maxSpeed: 36, accel: 5.2, mass: 1100, seats: 4, steer: 0.55, sound: 'car', entry: 'car', colors: ['#f2c21a', '#e8b414'] },
  van: { len: 4.7, wid: 1.72, hgt: 2.0, wheelR: 0.33, maxSpeed: 34, accel: 4.6, mass: 1800, seats: 8, steer: 0.5, sound: 'van', entry: 'van', colors: ['#f4f4f2', '#e8e8e4', '#c0c4c8', '#1a1c20'] },
  suv: { len: 4.8, wid: 1.9, hgt: 1.85, wheelR: 0.38, maxSpeed: 44, accel: 6.5, mass: 2100, seats: 5, steer: 0.5, sound: 'van', entry: 'van', colors: ['#111214'] },
  bus: { len: 11, wid: 2.5, hgt: 3.15, wheelR: 0.5, maxSpeed: 24, accel: 2.0, mass: 9000, seats: 40, steer: 0.42, sound: 'bus', entry: 'bus', colors: ['#9c1c1c'] },
  pbus: { len: 10.4, wid: 2.45, hgt: 3.1, wheelR: 0.5, maxSpeed: 26, accel: 2.2, mass: 8500, seats: 40, steer: 0.42, sound: 'bus', entry: 'bus', colors: ['#f4f4f2', '#2a5aa8', '#e8e0d0', '#1f7a5a'] },
  lorry: { len: 7.2, wid: 2.3, hgt: 3.0, wheelR: 0.48, maxSpeed: 24, accel: 2.0, mass: 7000, seats: 2, steer: 0.45, sound: 'bus', entry: 'bus', colors: ['#1d4f8a', '#b51f1f', '#e0b420', '#2a6b3a'] },
  // Sri Lanka Police vehicles (white with blue bands, trilingual POLICE lettering, blue/red beacons). Built on the civilian
  // body of `base` plus a police kit; never part of random traffic (Traffic.js MIX lists them nowhere).
  police: { base: 'sedan', police: true, len: 4.5, wid: 1.74, hgt: 1.45, wheelR: 0.32, maxSpeed: 46, accel: 6.4, mass: 1300, seats: 4, steer: 0.52, sound: 'car', entry: 'car', colors: ['#f4f4f2'] },
  policejeep: { base: 'suv', police: true, len: 4.8, wid: 1.9, hgt: 1.85, wheelR: 0.38, maxSpeed: 44, accel: 6.2, mass: 2150, seats: 5, steer: 0.5, sound: 'van', entry: 'van', colors: ['#f4f4f2'] },
  policebike: { base: 'bike', police: true, len: 1.95, wid: 0.7, hgt: 1.1, wheelR: 0.3, maxSpeed: 32, accel: 6.8, mass: 175, seats: 2, steer: 0.7, sound: 'bike', entry: 'bike', colors: ['#f4f4f2'] },
  bike: { len: 1.95, wid: 0.7, hgt: 1.1, wheelR: 0.3, maxSpeed: 30, accel: 6.5, mass: 160, seats: 2, steer: 0.7, sound: 'bike', entry: 'bike', colors: ['#151515', '#b51f1f', '#1d3f8a', '#e8e8e4', '#5a6b3a'] },
};
// clean private vehicles get clear-coated paint; working vehicles get worn, dirtier paint
const WORN = new Set(['tuktuk', 'taxi', 'bus', 'pbus', 'lorry']);

// lofted body from cross-sections [z, y0, y1, halfW0 (bottom), halfW1 (top), round]
// loft cross-section ring (10 points, counter-clockwise from the bottom-left); points 6..9 + 0 form the −x side
function loftRing(s) { const [z, y0, y1, w0, w1, r = 0.12] = s; const h = y1 - y0; const rr = Math.min(r, h * 0.45);
  return [[-w0 + rr * 0.3, y0], [w0 - rr * 0.3, y0], [w0, y0 + rr], [w0 + (w1 - w0) * 0.55, y0 + h * 0.55], [w1, y1 - rr], [w1 - rr, y1], [-w1 + rr, y1], [-w1, y1 - rr], [-(w0 + (w1 - w0) * 0.55), y0 + h * 0.55], [-w0, y0 + rr]].map(([x, y]) => [x, y, z]); }
function loft(mb, secs, col, { capFront = true, capBack = true, noBottom = false, skip = null } = {}) {
  const rings = secs.map(loftRing); const n = rings[0].length; const tmp = new MeshBuilder();
  for (let i = 0; i < rings.length - 1; i++) for (let k = noBottom ? 1 : 0; k < n; k++) { if (skip && skip(i, k)) continue; const a = rings[i][k], b = rings[i][(k + 1) % n], c = rings[i + 1][(k + 1) % n], d = rings[i + 1][k]; tmp.quad(a, b, c, d, [0, 0, 1, 1], col); }
  // smooth-shaded sides (pressed panels), flat caps
  let g = tmp.build(); if (g) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-5); g.computeVertexNormals(); mb.geometry(g, new THREE.Matrix4()); g.dispose(); }
  const cap = (r, front) => { const ctr = r.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]); for (let k = 0; k < n; k++) { const a = r[k], b = r[(k + 1) % n]; if (front) mb.quad(ctr, b, a, ctr, [0, 0, 1, 1], col); else mb.quad(ctr, a, b, ctr, [0, 0, 1, 1], col); } };
  if (capBack) cap(rings[0], false); if (capFront) cap(rings[rings.length - 1], true);
}

// Extruded side silhouette with semicircular wheel-arch cut-outs.
//  top: [[z,y]...] contour from the front-bottom corner over the top to the rear-bottom corner
//  sill: y of the bottom edge; arches: [[zc, wheelR]]; W: half width; taper(z,y) → half-width factor
function sideBody(mb, top, sill, arches, W, col, { taper = null, bevel = 0.05, openTop = null } = {}) {
  const sh = new THREE.Shape(); const f = top[0], r = top[top.length - 1];
  sh.moveTo(r[0], sill);
  for (const [zc, R] of [...arches].sort((a, b) => a[0] - b[0])) {
    const ra = R + 0.07, s = Math.min(0.95, Math.max(-0.95, (R - sill) / ra)); const dx = Math.sqrt(Math.max(0, ra * ra - (R - sill) ** 2));
    sh.lineTo(zc - dx, sill); sh.absarc(zc, R, ra, Math.PI + Math.asin(s), -Math.asin(s), true);
  }
  sh.lineTo(f[0], sill); for (const p of top) sh.lineTo(p[0], p[1]); sh.lineTo(r[0], sill);
  const depth = Math.max(0.02, 2 * W - 2 * bevel);
  let g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelOffset: -bevel * 0.6, bevelSegments: 3, curveSegments: 14 });
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, W - bevel, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  if (openTop) { // remove the upward-facing cap over the cabin so occupants are not sliced by it (interior trims line the cabin)
    const [z0, z1, yMin] = openTop; const P = g.attributes.position, I = g.index.array, keep = []; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let t = 0; t < I.length; t += 3) { a.fromBufferAttribute(P, I[t]); b.fromBufferAttribute(P, I[t + 1]); c.fromBufferAttribute(P, I[t + 2]); n.subVectors(c, b).cross(b.clone().sub(a)).normalize();
      const cz = (a.z + b.z + c.z) / 3, cy = (a.y + b.y + c.y) / 3, cx = Math.abs(a.x + b.x + c.x) / 3; const up = Math.abs(n.y) > 0.8;
      if (up && cy > yMin && cz > z0 && cz < z1 && cx < W - bevel * 1.2 && Math.min(a.z, b.z, c.z) > z0 - 0.05 && Math.max(a.z, b.z, c.z) < z1 + 0.05) continue; keep.push(I[t], I[t + 1], I[t + 2]); }
    g.setIndex(keep);
  }
  if (taper) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * taper(p.getZ(i), p.getY(i))); }
  g.computeVertexNormals(); mb.geometry(g, new THREE.Matrix4(), col); g.dispose();
  // dark wheel-well liners inside the arch tunnels
  for (const [zc, Rw] of arches) archLiner(liners || mb, W * 0.97, zc, Rw, Rw + 0.06);
}
let liners = null;
function archLiner(mb, hw, zc, yc, ra) {
  const n = 12, a0 = -0.15, a1 = Math.PI + 0.15; const col = C('#0b0b0c');
  for (let i = 0; i < n; i++) { const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
    const p = (x, t) => [x, yc + Math.sin(t) * ra, zc + Math.cos(t) * ra];
    mb.quad(p(-hw, t0), p(hw, t0), p(hw, t1), p(-hw, t1), [0, 0, 1, 1], col); }
}
// a straight beam (box) between two points
const _ma = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _s = new THREE.Vector3();
const unitBox = new THREE.BoxGeometry(1, 1, 1); const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12); const unitSph = new THREE.SphereGeometry(1, 12, 8);
function beam(mb, a, b, tx, tz, col, geo = unitBox) {
  _va.set(...a); _vb.set(...b); const len = _va.distanceTo(_vb); const dir = _vb.clone().sub(_va).normalize();
  _q.setFromUnitVectors(_up, dir); _ma.compose(_va.clone().add(_vb).multiplyScalar(0.5), _q, _s.set(tx, len, tz)); mb.geometry(geo, _ma, col);
}
function part(mb, geo, pos, rot = [0, 0, 0], scale = [1, 1, 1], col) { _ma.compose(_va.set(...pos), _q.setFromEuler(new THREE.Euler(...rot)), _s.set(...scale)); mb.geometry(geo, _ma, col); }
const torus = new THREE.TorusGeometry(1, 0.11, 8, 24);
const KIT = { beam, part, C, unitBox, unitCyl };
const linerCyl = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true, -0.08, Math.PI + 0.16); // upper arc only (after the 90° z-turn, theta 0..π is the top half)

// ------------------------------------------------------------------ wheels
const wheelCache = new Map();
export function wheelGeometry(r, w) { return wheelParts(r, w).tyre; }
function wheelParts(R, w, style = 0) {
  const k = `${R}:${w}:${style}`; if (wheelCache.has(k)) return wheelCache.get(k);
  const V = (x, y) => new THREE.Vector2(x, y); const h = w / 2;
  const tyre = new THREE.LatheGeometry([V(R * 0.64, h * 0.95), V(R * 0.86, h * 1.04), V(R * 0.96, h * 0.92), V(R, h * 0.6), V(R, -h * 0.6), V(R * 0.96, -h * 0.92), V(R * 0.86, -h * 1.04), V(R * 0.64, -h * 0.95)], 28);
  tyre.rotateZ(-Math.PI / 2);
  const mb = new MeshBuilder(); const rimCol = style === 1 ? C('#2a2a2c') : style === 2 ? C('#c9ccd0') : C('#9aa0a6');
  const dish = new THREE.LatheGeometry([V(0.001, h * 0.55), V(R * 0.18, h * 0.6), V(R * 0.22, h * 0.45), V(R * 0.6, h * 0.5), V(R * 0.66, h * 0.75), V(R * 0.66, -h * 0.6), V(R * 0.2, -h * 0.4), V(0.001, -h * 0.4)], 24);
  dish.rotateZ(-Math.PI / 2); mb.geometry(dish, new THREE.Matrix4(), rimCol);
  const spokes = style === 1 ? 0 : style === 2 ? 6 : 5;
  for (let i = 0; i < spokes; i++) { const a = (i / spokes) * Math.PI * 2; beam(mb, [h * 0.58, Math.sin(a) * R * 0.17, Math.cos(a) * R * 0.17], [h * 0.52, Math.sin(a) * R * 0.6, Math.cos(a) * R * 0.6], R * 0.09, h * 0.18, rimCol); }
  if (style === 1) for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; part(mb, unitCyl, [h * 0.56, Math.sin(a) * R * 0.42, Math.cos(a) * R * 0.42], [0, 0, Math.PI / 2], [R * 0.06, 0.01, R * 0.06], C('#111')); }
  part(mb, unitCyl, [h * 0.6, 0, 0], [0, 0, Math.PI / 2], [R * 0.12, 0.02, R * 0.12], C('#55595e'));
  const out = { tyre, rim: mb.build() }; wheelCache.set(k, out); return out;
}

// ------------------------------------------------------------------ materials
let mats = null; const routeMats = [];
const ROUTES = [['138', 'කොටුව', 'FORT'], ['100', 'පිටකොටුව', 'PETTAH'], ['154', 'බොරැල්ල', 'BORELLA']];
// Door / top-box lettering: POLICE with Sinhala and Tamil (පොලිසිය / பொலிஸ்) on a transparent background.
let policeMat = null;
function policeDecalMat() {
  if (policeMat) return policeMat;
  const c = document.createElement('canvas'); c.width = 512; c.height = 160; const g = c.getContext('2d'); g.clearRect(0, 0, 512, 160);
  g.fillStyle = '#1b3f94'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 86px "Barlow Condensed", sans-serif'; g.fillText('POLICE', 256, 56, 490);
  g.font = '600 40px "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif'; g.fillText('පොලිසිය  ·  பொலிஸ்', 256, 126, 490);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (policeMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.25, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
}
// side decal quad readable from outside on either side (x = side offset, z0 < z1)
function sideDecal(b, sx, x, y0, y1, z0, z1, uv = [0, 0, 1, 1], col = [1, 1, 1]) {
  if (sx > 0) b.quad([x, y0, z1], [x, y0, z0], [x, y1, z0], [x, y1, z1], uv, col); else b.quad([-x, y0, z0], [-x, y0, z1], [-x, y1, z1], [-x, y1, z0], uv, col);
}
function addPoliceKit(m, base, T) {
  const mb = m.mb, paint = mb.get('paint'), rubber = mb.get('rubber'), dec = mb.get('police'), blue = C('#1b3f94'), W = T.wid / 2;
  if (base === 'bike') { // white top box with lettering and a beacon, blue tank band
    paint.box(0, 1.1, -0.84, 0.42, 0.3, 0.34, { col: C('#f4f4f2') }); rubber.box(0, 0.94, -0.84, 0.44, 0.03, 0.36, { col: C('#222') });
    for (const sx of [-1, 1]) sideDecal(dec, sx, 0.212, 1.0, 1.2, -0.99, -0.69, [0, 0, 1, 1]);
    dec.quad([0.2, 1.0, -1.012], [-0.2, 1.0, -1.012], [-0.2, 1.2, -1.012], [0.2, 1.2, -1.012], [0, 0, 1, 1], [1, 1, 1]);
    rubber.box(0, 1.27, -0.84, 0.05, 0.04, 0.05, { col: C('#222') }); mb.get('lbBlue').box(-0.05, 1.32, -0.84, 0.09, 0.07, 0.09, { col: [1, 1, 1] }); mb.get('lbRed').box(0.05, 1.32, -0.84, 0.09, 0.07, 0.09, { col: [1, 1, 1] });
    for (const sx of [-1, 1]) paint.box(sx * 0.165, 0.76, 0.1, 0.012, 0.05, 0.36, { col: blue });
    return;
  }
  const H = T.hgt, hy = base === 'suv' ? 0.78 : 0.66; // body bands and door lettering
  for (const sx of [-1, 1]) { const x = W + 0.012; sideDecal(paint, sx, x, hy, hy + 0.07, -1.45, 1.45, [0, 0, 0.1, 0.1], blue); sideDecal(paint, sx, x, hy - 0.1, hy - 0.075, -1.45, 1.45, [0, 0, 0.1, 0.1], blue); sideDecal(dec, sx, x + 0.002, hy - 0.4, hy - 0.12, -0.98, -0.08); } // lettering on the rear doors (the driver door is a separate swinging mesh)
  const ry = H - (base === 'suv' ? 0.0 : 0.02), rz = base === 'suv' ? -0.2 : -0.35; // roof light bar
  rubber.box(0, ry + 0.03, rz, 1.15, 0.05, 0.26, { col: C('#1a1a1a') }); mb.get('lbBlue').box(-0.29, ry + 0.1, rz, 0.54, 0.1, 0.22, { col: [1, 1, 1] }); mb.get('lbRed').box(0.29, ry + 0.1, rz, 0.54, 0.1, 0.22, { col: [1, 1, 1] });
  dec.quad([0.5, 0.62, -T.len / 2 - 0.03], [-0.5, 0.62, -T.len / 2 - 0.03], [-0.5, 0.8, -T.len / 2 - 0.03], [0.5, 0.8, -T.len / 2 - 0.03], [0, 0.5, 1, 1], [1, 1, 1]); // POLICE on the boot
}
function routeMat(i) {
  if (routeMats[i]) return routeMats[i];
  const c = document.createElement('canvas'); c.width = 512; c.height = 80; const g = c.getContext('2d');
  g.fillStyle = '#0c0c0c'; g.fillRect(0, 0, 512, 80); g.fillStyle = '#ffb020'; g.font = 'bold 54px "Barlow Condensed", sans-serif'; g.textBaseline = 'middle'; g.fillText(ROUTES[i][0], 14, 42);
  g.font = '600 40px "Noto Sans Sinhala", sans-serif'; g.fillText(ROUTES[i][1], 120, 42); g.font = 'bold 40px "Barlow Condensed", sans-serif'; g.textAlign = 'right'; g.fillText(ROUTES[i][2], 500, 42);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (routeMats[i] = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.4 }));
}
// Number plates (Sri Lankan format: province + letters + digits; white front, yellow rear). Atlas rows 0-3 rear, 4-7 front.
function plateMaterial() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d'); const r = new RNG(77);
  for (let i = 0; i < 8; i++) { const y = i * 64; g.fillStyle = i < 4 ? '#f2c818' : '#f4f4f0'; g.fillRect(0, y, 256, 64); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(3, y + 3, 250, 58);
    g.fillStyle = '#111'; g.font = 'bold 15px "Barlow Condensed", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('WP', 12, y + 32);
    g.font = 'bold 44px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; const L = 'ABCDKLNPQ'; g.fillText(`${L[r.int(0, 8)]}${L[r.int(0, 8)]}${L[r.int(0, 8)]}-${r.int(1000, 9999)}`, 140, y + 34); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.1 });
}
export function vehicleMaterials() {
  if (!mats) {
    mats = {
      vpaint: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.0 }),
      vworn: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, envMapIntensity: 0.7 }),
      vglass: new THREE.MeshStandardMaterial({ color: 0x10171c, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.74, envMapIntensity: 0.8, depthWrite: false, side: THREE.DoubleSide }),
      vchrome: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.8, envMapIntensity: 1.2 }),
      vrim: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3, envMapIntensity: 1.0, side: THREE.DoubleSide }),
      vrubber: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.0, side: THREE.DoubleSide }),
      vtyre: new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.93, metalness: 0.0, side: THREE.DoubleSide }),
      vinterior: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.0 }),
      vcanvas: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }),
      vlight: new THREE.MeshStandardMaterial({ color: 0xf4f4ee, emissive: 0xfff4dd, emissiveIntensity: 0.2, roughness: 0.1, metalness: 0.2 }),
      vtail: new THREE.MeshStandardMaterial({ color: 0x7a0a0a, emissive: 0xff1a10, emissiveIntensity: 0.15, roughness: 0.25 }),
      vrev: new THREE.MeshStandardMaterial({ color: 0xd8d8d4, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.15, metalness: 0.1 }), // reverse lamp lens: lit only while reversing
      vlens: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.16, envMapIntensity: 1.6, depthWrite: false }), // clear lamp covers
      vrefl: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.95, envMapIntensity: 1.4, side: THREE.DoubleSide }), // reflector bowls / rings
      vind: new THREE.MeshStandardMaterial({ color: 0xb06a10, emissive: 0xffa020, emissiveIntensity: 0.05, roughness: 0.25 }),
      plate: plateMaterial(), route0: routeMat(0), route1: routeMat(1), route2: routeMat(2), police: policeDecalMat(),
      lbBlue: new THREE.MeshStandardMaterial({ color: 0x0c1e5a, emissive: 0x2a5cff, emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.92 }),
      lbRed: new THREE.MeshStandardMaterial({ color: 0x5a0c0c, emissive: 0xff2020, emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.92 }),
    };
  }
  return { lightMat: mats.vlight, tailMatBase: mats.vtail, indicatorMat: mats.vind, mats };
}
export function setVehicleNight(n) { vehicleMaterials(); mats.vlight.emissiveIntensity = 0.2 + n * 3.0; mats.vtail.emissiveIntensity = 0.08 + n * 0.5; }

function plateQuad(mb, cx, cy, z, hw, hh, front, variant) {
  const row = (front ? 4 : 0) + (variant % 4); const v0 = 1 - (row + 1) / 8 + 0.004, v1 = 1 - row / 8 - 0.004; const pm = mb.get('plate');
  if (front) pm.quad([cx - hw, cy - hh, z], [cx + hw, cy - hh, z], [cx + hw, cy + hh, z], [cx - hw, cy + hh, z], [0, v0, 1, v1], C('#fff'));
  else pm.quad([cx + hw, cy - hh, z], [cx - hw, cy - hh, z], [cx - hw, cy + hh, z], [cx + hw, cy + hh, z], [0, v0, 1, v1], C('#fff'));
}
// seat: cushion + reclined backrest + headrest
function seat(mb, x, y, z, w, col, { back = 0.55, head = true } = {}) {
  const I = mb.get('interior'); part(I, unitBox, [x, y, z], [0, 0, 0], [w, 0.12, 0.48], col);
  part(I, unitBox, [x, y + back / 2 + 0.02, z - 0.24], [-0.22, 0, 0], [w, back, 0.12], col);
  if (head) part(I, unitBox, [x, y + back + 0.12, z - 0.33], [-0.22, 0, 0], [w * 0.55, 0.16, 0.1], col);
}
function steering(mb, p, r = 0.18, tilt = 1.1) {
  const I = mb.get('interior'); part(I, torus, p, [tilt, 0, 0], [r, r, r * 1.4], C('#141414'));
  beam(I, p, [p[0], p[1] - 0.25, p[2] + 0.3], 0.05, 0.05, C('#1a1a1a'), unitCyl); beam(I, [p[0] - r * 0.9, p[1], p[2]], [p[0] + r * 0.9, p[1], p[2]], 0.03, 0.03, C('#1a1a1a'));
}
function mirror(mb, x, y, z, side, paintCol) {
  const P = mb.get('paint'); beam(P, [x, y - 0.03, z], [x + side * 0.14, y, z - 0.03], 0.04, 0.05, paintCol);
  part(P, unitBox, [x + side * 0.18, y + 0.02, z - 0.04], [0, side * 0.12, 0], [0.13, 0.085, 0.07], paintCol);
  mb.get('chrome').quad([x + side * 0.12, y - 0.025, z - 0.091], [x + side * 0.24, y - 0.025, z - 0.091], [x + side * 0.24, y + 0.065, z - 0.091], [x + side * 0.12, y + 0.065, z - 0.091], [0, 0, 1, 1], C('#cfd6dc'));
}
// door seam / trim line on the body side
function seam(mb, x, pts, col = C('#141414')) { const X = typeof x === 'function' ? x : () => x; for (let i = 0; i < pts.length - 1; i++) beam(mb.get('rubber'), [X(pts[i][0], pts[i][1]), pts[i][1], pts[i][0]], [X(pts[i + 1][0], pts[i + 1][1]), pts[i + 1][1], pts[i + 1][0]], 0.006, 0.012, col); }
// front-door outline [z,y]; doors that reach over the front wheel arch are notched around it (cab-over vans)
function notchOutline(D, R, sill, by) {
  const [d0, d1] = D.door; const archBack = D.wf - (R + 0.07) - 0.03, archTop = 2 * R + 0.1;
  if (d0 <= archBack) return [[d0, by], [d0, sill + 0.06], [d1, sill + 0.06], [d1, by], [d0, by]];
  return [[d0, by], [d0, archTop], [archBack, archTop], [archBack, sill + 0.06], [d1, sill + 0.06], [d1, by], [d0, by]];
}

// ------------------------------------------------------------------ model builders
const modelCache = new Map();
function buildModel(type, color, variant) {
  const TP = VTYPES[type]; if (TP.police) { const m = buildBaseModel(TP.base, color, TP.base === 'bike' ? variant & ~1 : variant); /* police bikes: always the motorcycle body */ addPoliceKit(m, TP.base, TP); return m; }
  return buildBaseModel(type, color, variant);
}
function buildBaseModel(type, color, variant) {
  const T = VTYPES[type]; const mb = new MultiBuilder(); const dm = new MultiBuilder(); const L = T.len, W = T.wid / 2, H = T.hgt, R = T.wheelR;
  const col = C(color), black = C('#151517'), chrome = C('#c4c8cc'), trimGrey = C('#2a2b2e'); const seats = []; let doors = []; let wheelStyle = variant % 3;
  const paint = mb.get('paint'), rubber = mb.get('rubber'), glass = mb.get('glass'), lights = mb.get('vlight'), tails = mb.get('vtail'), ind = mb.get('vind'), ch = mb.get('chrome');
  liners = rubber;
  const out = (wheels, steerWheel, extra = {}) => ({ mb, dm, wheels, seats, steerWheel, doors, wheelStyle, ...extra });

  // =============================================================== TUK-TUK (Bajaj RE style three-wheeler)
  if (type === 'tuktuk') {
    const hood = variant % 2 ? col : C('#1c1c1e'); const ds = mb.get('canvas'); const trim = variant === 2 ? C('#f2f2ee') : variant === 3 ? C('#c0c4c8') : C('#d4af37');
    wheelStyle = 1;
    // rear body: extruded side profile with the rear-wheel arches cut out
    sideBody(paint, [[0.28, 0.3], [0.3, 0.56], [0.18, 0.64], [-0.92, 0.64], [-1.0, 0.98], [-1.18, 1.0], [-1.27, 0.9], [-1.29, 0.4]], 0.3, [[-0.85, R]], 0.645, col,
      { taper: (z, y) => 1 - 0.05 * sstep(-0.95, -1.29, z) - 0.03 * sstep(0.6, 0.96, y), bevel: 0.04, openTop: [-0.45, 0.17, 0.5] });
    for (const sx of [-1, 1]) mb.get('interior').box(sx * 0.6, 0.5, -0.14, 0.025, 0.27, 0.62, { col: C('#2a2a2a') });
    part(paint, unitBox, [0, 0.5, 0.15], [0, 0, 0], [0.3, 0.3, 0.3], C('#1a1a1a')); // driver seat pedestal
    // passenger floor + front cowl / dash fairing
    loft(paint, [[0.25, 0.28, 0.4, 0.6, 0.6, 0.06], [0.5, 0.28, 0.42, 0.5, 0.5, 0.06]], col);
    loft(paint, [[0.38, 0.28, 1.04, 0.5, 0.44, 0.12], [0.75, 0.29, 1.02, 0.42, 0.36, 0.14], [1.02, 0.32, 0.92, 0.28, 0.24, 0.14], [1.2, 0.4, 0.66, 0.15, 0.12, 0.08]], col);
    // rounded canopy with canvas valance; frame tubes
    loft(ds, [[-1.3, 1.42, 1.8, 0.665, 0.5, 0.22], [-1.18, 1.4, 1.83, 0.67, 0.53, 0.22], [0.8, 1.4, 1.82, 0.67, 0.53, 0.22], [0.95, 1.46, 1.75, 0.64, 0.5, 0.16]], hood);
    for (const [x, z] of [[-0.6, -1.22], [0.6, -1.22], [-0.55, 0.86], [0.55, 0.86]]) beam(ch, [x, 0.95, z], [x * 0.98, 1.42, z], 0.035, 0.035, C('#3a3a3c'), unitCyl);
    for (const sx of [-1, 1]) beam(ch, [sx * 0.6, 0.64, 0.22], [sx * 0.6, 1.42, 0.22], 0.025, 0.025, chrome, unitCyl); // grab poles
    // rear canvas with window
    const rzC = -1.275, q = (x0, x1, y0, y1) => ds.quad([x1, y0, rzC], [x0, y0, rzC], [x0, y1, rzC], [x1, y1, rzC], [0, 0, 1, 1], hood);
    q(-0.62, -0.34, 0.95, 1.42); q(0.34, 0.62, 0.95, 1.42); q(-0.34, 0.34, 0.95, 1.08); q(-0.34, 0.34, 1.33, 1.42);
    glass.quad([0.34, 1.08, rzC - 0.005], [-0.34, 1.08, rzC - 0.005], [-0.34, 1.33, rzC - 0.005], [0.34, 1.33, rzC - 0.005], [0, 0, 1, 1], C('#fff'));
    // windscreen, frame, wiper, visor strip, mirrors
    glass.quad([-0.48, 1.04, 0.99], [0.48, 1.04, 0.99], [0.52, 1.44, 0.9], [-0.52, 1.44, 0.9], [0, 0, 1, 1], C('#fff'));
    beam(rubber, [-0.5, 1.04, 0.99], [0.5, 1.04, 0.99], 0.035, 0.035, black); beam(rubber, [-0.53, 1.44, 0.9], [0.53, 1.44, 0.9], 0.04, 0.04, black);
    for (const sx of [-1, 1]) beam(rubber, [sx * 0.5, 1.04, 0.99], [sx * 0.53, 1.44, 0.9], 0.035, 0.035, black);
    beam(rubber, [0.05, 1.06, 1.0], [-0.3, 1.25, 0.96], 0.012, 0.012, black);
    if (variant !== 1) part(paint, unitBox, [0, 1.49, 0.9], [0.25, 0, 0], [1.08, 0.1, 0.03], trim);
    for (const sx of [-1, 1]) { beam(ch, [sx * 0.42, 1.0, 1.0], [sx * 0.55, 1.22, 1.0], 0.015, 0.015, chrome, unitCyl); part(paint, unitSph, [sx * 0.57, 1.26, 1.0], [0, 0, 0], [0.06, 0.045, 0.02], black); }
    // headlamp in chrome bezel on the cowl, indicators, tail lamps, plates
    part(ch, unitCyl, [0, 0.88, 1.08], [Math.PI / 2, 0, 0], [0.085, 0.09, 0.085], chrome); part(lights, unitCyl, [0, 0.88, 1.125], [Math.PI / 2, 0, 0], [0.072, 0.012, 0.072]);
    for (const sx of [-1, 1]) { part(ind, unitSph, [sx * 0.24, 0.98, 0.98], [0, 0, 0], [0.03, 0.03, 0.03]); tails.box(sx * 0.5, 0.72, -1.265, 0.09, 0.2, 0.03); ind.box(sx * 0.5, 0.6, -1.265, 0.09, 0.05, 0.03); rubber.box(sx * 0.58, 0.2, -1.1, 0.17, 0.26, 0.015, { col: black }); }
    beam(ch, [-0.58, 0.36, -1.33], [0.58, 0.36, -1.33], 0.045, 0.045, chrome, unitCyl); for (const sx of [-1, 1]) beam(ch, [sx * 0.5, 0.36, -1.33], [sx * 0.5, 0.36, -1.24], 0.03, 0.03, chrome);
    plateQuad(mb, 0, 0.55, -1.27, 0.17, 0.06, false, variant); plateQuad(mb, 0, 0.5, 1.215, 0.11, 0.042, true, variant);
    // front fork + mudguard + handlebar with grips + speedo
    beam(ch, [0, R, 1.0], [0, 0.85, 0.92], 0.05, 0.05, C('#2a2a2a'), unitCyl);
    loft(paint, [[0.78, R * 2 + 0.02, R * 2 + 0.06, 0.09, 0.09, 0.02], [1.0, R * 2 + 0.06, R * 2 + 0.1, 0.09, 0.09, 0.02], [1.22, R * 1.6, R * 1.6 + 0.04, 0.09, 0.09, 0.02]], col);
    beam(ch, [-0.32, 1.06, 0.62], [0.32, 1.06, 0.62], 0.025, 0.025, chrome, unitCyl); for (const sx of [-1, 1]) beam(rubber, [sx * 0.28, 1.06, 0.62], [sx * 0.38, 1.06, 0.62], 0.04, 0.04, black, unitCyl);
    part(mb.get('interior'), unitCyl, [0, 1.06, 0.72], [-1.1, 0, 0], [0.06, 0.03, 0.06], C('#202020'));
    // seats + trim stripes
    seat(mb, 0, 0.7, -0.7, 1.12, C('#2a2420'), { back: 0.5, head: false }); seat(mb, 0, 0.68, 0.15, 0.4, C('#2a2420'), { back: 0.18, head: false });
    paint.box(0, 0.36, -0.45, 1.29, 0.03, 1.5, { col: trim, top: false }); paint.box(0, 0.56, -0.35, 1.3, 0.035, 1.1, { col: trim, top: false });
    mb.get('interior').box(0, 0.36, -0.5, 1.2, 0.03, 1.3, { col: C('#2a2a2a') }); // rear compartment floor mat
    const bars = [[0.33, 1.06, 0.62], [-0.33, 1.06, 0.62]];
    seats.push({ x: 0, y: 0.74, z: 0.15, floor: 0.32, fz: 0.42, fx: 0.12, roof: 1.74, lean: 0.1, hands: 'bars', bars, kind: 'drive', driver: true, exit: [-0.98, 0.25] },
      { x: 0.28, y: 0.76, z: -0.7, floor: 0.375, fz: 0.44, fx: 0.11, roof: 1.74, lean: -0.08, hands: 'lap', kind: 'sit', exit: [1.0, -0.55] },
      { x: -0.28, y: 0.76, z: -0.7, floor: 0.375, fz: 0.44, fx: 0.11, roof: 1.74, lean: -0.08, hands: 'lap', kind: 'sit', exit: [-1.0, -0.55] });
    tukDetail(dm, KIT, { R, col, variant });
    return out([[0, R, 1.0, 0.12], [-0.58, R, -0.85, 0.14], [0.58, R, -0.85, 0.14]], [0, 1.06, 0.62]);
  }

  // =============================================================== MOTORCYCLE / SCOOTER
  if (type === 'bike') {
    const scooter = variant % 2 === 1; wheelStyle = 1;
    if (scooter) {
      loft(paint, [[-0.72, 0.42, 0.78, 0.15, 0.13, 0.08], [-0.2, 0.36, 0.82, 0.17, 0.15, 0.1], [0.12, 0.3, 0.42, 0.14, 0.14, 0.05], [0.38, 0.3, 0.44, 0.14, 0.14, 0.05]], col);
      loft(paint, [[0.38, 0.3, 1.0, 0.18, 0.15, 0.1], [0.6, 0.45, 1.05, 0.16, 0.12, 0.1], [0.66, 0.7, 1.08, 0.12, 0.1, 0.06]], col); // front apron
      part(mb.get('interior'), unitBox, [0, 0.86, -0.35], [0, 0, 0], [0.28, 0.08, 0.62], C('#151515'));
    } else {
      loft(paint, [[-0.25, 0.75, 0.92, 0.12, 0.1, 0.06], [0.1, 0.72, 1.0, 0.16, 0.13, 0.08], [0.42, 0.78, 0.98, 0.12, 0.1, 0.06]], col); // tank
      part(rubber, unitBox, [0, 0.52, 0.05], [0, 0, 0], [0.22, 0.28, 0.42], C('#3a3a3a')); part(ch, unitCyl, [0, 0.42, 0.25], [0, 0, Math.PI / 2], [0.1, 0.24, 0.1], C('#8a8d90')); // engine
      beam(ch, [0.1, 0.38, 0.1], [0.14, 0.42, -0.75], 0.05, 0.05, C('#b8bcc0'), unitCyl); // exhaust
      part(mb.get('interior'), unitBox, [0, 0.9, -0.38], [0.08, 0, 0], [0.26, 0.08, 0.6], C('#151515'));
      loft(paint, [[-0.85, 0.7, 0.82, 0.1, 0.08, 0.04], [-0.55, 0.78, 0.86, 0.12, 0.1, 0.04]], col); // tail
    }
    for (const sx of [-1, 1]) beam(ch, [sx * 0.07, R, 0.72], [sx * 0.07, 1.07, 0.52], 0.035, 0.035, C('#a8acb0'), unitCyl); // fork
    loft(paint, [[0.55, R * 2 + 0.02, R * 2 + 0.05, 0.08, 0.08, 0.02], [0.85, R * 1.7, R * 1.7 + 0.04, 0.08, 0.08, 0.02]], col);
    beam(ch, [-0.36, 1.13, 0.5], [0.36, 1.13, 0.5], 0.022, 0.022, black, unitCyl); for (const sx of [-1, 1]) { beam(rubber, [sx * 0.3, 1.13, 0.5], [sx * 0.4, 1.13, 0.5], 0.035, 0.035, black, unitCyl); beam(ch, [sx * 0.24, 1.13, 0.5], [sx * 0.3, 1.32, 0.54], 0.012, 0.012, chrome, unitCyl); part(ch, unitSph, [sx * 0.3, 1.27, 0.6], [0, 0, 0], [0.05, 0.035, 0.012], chrome); }
    part(ch, unitCyl, [0, 1.0, 0.7], [Math.PI / 2, 0, 0], [0.09, 0.08, 0.09], scooter ? col : chrome); part(lights, unitCyl, [0, 1.0, 0.745], [Math.PI / 2, 0, 0], [0.075, 0.01, 0.075]);
    tails.box(0, 0.86, -0.9, 0.12, 0.06, 0.04); for (const sx of [-1, 1]) { part(ind, unitSph, [sx * 0.16, 0.98, 0.66], [0, 0, 0], [0.025, 0.025, 0.035]); part(ind, unitSph, [sx * 0.12, 0.82, -0.9], [0, 0, 0], [0.025, 0.025, 0.035]); }
    plateQuad(mb, 0, 0.7, -0.93, 0.12, 0.045, false, variant);
    for (const sx of [-1, 1]) { beam(ch, [sx * 0.12, 0.42, -0.4], [sx * 0.26, 0.42, -0.4], 0.025, 0.025, black, unitCyl); if (!scooter) beam(ch, [sx * 0.1, 0.36, 0.06], [sx * 0.24, 0.36, 0.06], 0.025, 0.025, black, unitCyl); } // foot pegs
    const sy = scooter ? 0.9 : 0.94, bars = [[0.33, 1.13, 0.5], [-0.33, 1.13, 0.5]];
    seats.push({ x: 0, y: sy, z: -0.08, floor: scooter ? 0.42 : 0.36, fz: scooter ? 0.3 : 0.14, fx: scooter ? 0.12 : 0.2, roof: 9, lean: 0.3, hands: 'bars', bars, kind: 'ride', driver: true, ride: true, exit: [0.75, -0.1] },
      { x: 0, y: sy + 0.01, z: -0.46, floor: 0.42, fz: 0.06, fx: 0.25, roof: 9, lean: 0.08, hands: 'lap', kind: 'ride', ride: true, exit: [0.75, -0.6] });
    bikeDetail(dm, KIT, { R, col, scooter });
    return out([[0, R, 0.7, 0.1], [0, R, -0.68, 0.12]], [0, 1.06, 0.56]);
  }

  // =============================================================== BUSES (SLTB red + private)
  if (type === 'bus' || type === 'pbus') {
    const red = type === 'bus'; const sill = 0.42, belt = 1.5, winTop = H - 0.32; const stripe = red ? C('#e8b820') : C(variant % 2 ? '#d43a2a' : '#e8a020');
    const wf = L / 2 - 2.0, wr = -L / 2 + 2.6; wheelStyle = 1;
    sideBody(paint, [[L / 2, 0.45], [L / 2 + 0.02, 1.2], [L / 2 - 0.02, belt], [-L / 2 + 0.04, belt], [-L / 2, 1.3], [-L / 2, 0.45]], sill, [[wf, R], [wr, R]], W, col,
      { taper: (z, y) => 1 - 0.035 * sstep(L / 2 - 0.4, L / 2, z) - 0.03 * sstep(-L / 2 + 0.4, -L / 2, z), bevel: 0.08, openTop: [-L / 2 - 0.2, L / 2 + 0.2, 1.3] });
    // window band (glass) with pillars, roof with rounded edges and hatches
    loft(glass, [[-L / 2 + 0.06, belt, winTop, W - 0.04, W - 0.06, 0.04], [L / 2 - 0.25, belt, winTop, W - 0.04, W - 0.06, 0.04]], C('#fff'), { noBottom: true });
    loft(paint, [[-L / 2 + 0.02, winTop, H, W - 0.02, W - 0.16, 0.24], [L / 2 - 0.2, winTop, H, W - 0.02, W - 0.16, 0.24]], red ? C('#7c1414') : col);
    for (const z of [-2.2, 1.0]) part(paint, unitBox, [0, H + 0.04, z], [0, 0, 0], [0.8, 0.08, 0.7], C('#d8d8d4'));
    // front: raked windscreen in two panes, destination board, wipers, grille, headlamps, big bumper
    const fz = L / 2; glass.quad([-W + 0.08, belt - 0.15, fz + 0.02], [W - 0.08, belt - 0.15, fz + 0.02], [W - 0.1, winTop, fz - 0.2], [-W + 0.1, winTop, fz - 0.2], [0, 0, 1, 1], C('#fff'));
    beam(rubber, [0, belt - 0.15, fz + 0.03], [0, winTop, fz - 0.19], 0.06, 0.05, black); for (const sx of [-1, 1]) beam(paint, [sx * (W - 0.05), belt - 0.15, fz + 0.01], [sx * (W - 0.07), winTop, fz - 0.2], 0.1, 0.1, col);
    loft(paint, [[fz - 0.2, winTop, H - 0.02, W - 0.04, W - 0.16, 0.2], [fz, winTop + 0.02, H - 0.06, W - 0.08, W - 0.2, 0.16]], col);
    mb.get('route' + (variant % 3)).quad([-0.95, winTop + 0.02, fz - 0.17], [0.95, winTop + 0.02, fz - 0.17], [0.95, H - 0.08, fz - 0.17], [-0.95, H - 0.08, fz - 0.17], [0, 0, 1, 1]);
    for (const sx of [-1, 1]) { beam(rubber, [sx * 0.3, belt - 0.12, fz + 0.04], [sx * 0.75, belt + 0.45, fz - 0.03], 0.015, 0.015, black); part(ch, unitBox, [sx * (W - 0.38), 0.85, fz + 0.03], [0, 0, 0], [0.42, 0.22, 0.04], chrome); part(lights, unitCyl, [sx * (W - 0.28), 0.85, fz + 0.05], [Math.PI / 2, 0, 0], [0.085, 0.02, 0.085]); part(lights, unitCyl, [sx * (W - 0.48), 0.85, fz + 0.05], [Math.PI / 2, 0, 0], [0.07, 0.02, 0.07]); ind.box(sx * (W - 0.1), 0.85, fz + 0.04, 0.08, 0.14, 0.03); }
    for (let i = 0; i < 5; i++) ch.box(0, 0.62 + i * 0.07, fz + 0.035, 1.0, 0.025, 0.02, { col: C('#2a2a2a') });
    rubber.box(0, 0.42, fz + 0.08, W * 2 + 0.04, 0.24, 0.16, { col: C('#222') }); plateQuad(mb, 0, 0.42, fz + 0.165, 0.24, 0.06, true, variant);
    // big mirrors on arms
    for (const sx of [-1, 1]) { beam(ch, [sx * (W - 0.02), 2.1, fz - 0.25], [sx * (W + 0.28), 2.0, fz + 0.15], 0.03, 0.03, black, unitCyl); part(paint, unitBox, [sx * (W + 0.3), 1.78, fz + 0.16], [0, 0, 0], [0.1, 0.42, 0.06], black); }
    // rear: window, engine grille, tail clusters, ladder
    const rz = -L / 2; glass.quad([W - 0.15, belt + 0.25, rz - 0.01], [-W + 0.15, belt + 0.25, rz - 0.01], [-W + 0.15, winTop - 0.1, rz - 0.01], [W - 0.15, winTop - 0.1, rz - 0.01], [0, 0, 1, 1], C('#fff'));
    for (let i = 0; i < 6; i++) rubber.box(0, 0.65 + i * 0.08, rz - 0.015, 1.3, 0.03, 0.02, { col: C('#1a1a1a') });
    for (const sx of [-1, 1]) { tails.box(sx * (W - 0.18), 1.0, rz - 0.02, 0.18, 0.3, 0.04); ind.box(sx * (W - 0.18), 0.78, rz - 0.02, 0.18, 0.1, 0.04); }
    rubber.box(0, 0.42, rz - 0.06, W * 2 + 0.02, 0.22, 0.12, { col: C('#222') }); plateQuad(mb, 0, 0.6, rz - 0.025, 0.24, 0.06, false, variant);
    // side: pillars between windows, livery stripes, doors on the kerb side (+x), wheel-arch shadows
    for (const sx of [-1, 1]) {
      for (let z = -L / 2 + 0.9; z < L / 2 - 0.6; z += 1.18) if (sx < 0 || (Math.abs(z - (L / 2 - 1.05)) > 0.6 && Math.abs(z + 0.6) > 0.6)) beam(paint, [sx * (W - 0.035), belt, z], [sx * (W - 0.05), winTop, z], 0.05, 0.09, col);
      paint.box(sx * (W + 0.006), belt - 0.22, 0, 0.012, 0.14, L - 0.5, { col: stripe }); paint.box(sx * (W + 0.006), 0.78, 0, 0.012, 0.08, L - 0.5, { col: red ? C('#f2f2ee') : C('#1a3a8a') });
      for (let z = -L / 2 + 0.6; z < L / 2 - 0.3; z += 1.18) beam(rubber, [sx * (W - 0.03), (belt + winTop) / 2 + 0.05, z], [sx * (W - 0.03), (belt + winTop) / 2 + 0.05, z + 0.6], 0.012, 0.02, C('#3a3a3a'));
      beam(rubber, [sx * (W + 0.005), belt, -L / 2 + 0.1], [sx * (W + 0.005), belt, L / 2 - 0.1], 0.02, 0.03, C('#111'));
    }
    for (const dz of [L / 2 - 1.05, -0.6]) { // folding doors: dark glazed leaves with frames
      const x = W + 0.012; part(rubber, unitBox, [x, 1.5, dz], [0, 0, 0], [0.02, 2.1, 0.95], C('#1a1a1a'));
      for (const s of [-0.24, 0.24]) glass.quad([x + 0.012, 0.8, dz + s - 0.2], [x + 0.012, 0.8, dz + s + 0.2], [x + 0.012, 2.4, dz + s + 0.2], [x + 0.012, 2.4, dz + s - 0.2], [0, 0, 1, 1], C('#fff'));
      part(ch, unitBox, [x + 0.02, 0.5, dz], [0, 0, 0], [0.04, 0.12, 0.9], C('#888'));
    }
    // interior: rows of seats seen through the windows, driver seat + flat steering wheel
    const I = mb.get('interior'); I.box(0, 0.9, 0, W * 2 - 0.12, 0.04, L - 0.3, { col: C('#3a3a38') }); for (const sx of [-1, 1]) I.box(sx * (W - 0.07), (0.92 + belt) / 2, 0, 0.03, belt - 0.92, L - 0.3, { col: C('#6a6a66') }); I.box(0, H - 0.12, 0, W * 2 - 0.12, 0.03, L - 0.3, { col: C('#d8d8d0') }); I.box(0, (0.92 + belt) / 2, -L / 2 + 0.2, W * 2 - 0.12, belt - 0.92, 0.03, { col: C('#6a6a66') });
    const rowZ = [];  for (let z = -L / 2 + 1.2; z < L / 2 - 2.2; z += 0.85) for (const sx of [-1, 1]) { if (sx > 0 && Math.abs(z + 0.6) < 0.7) continue; rowZ.push([sx, z]); part(I, unitBox, [sx * (W - 0.5), 1.3, z], [0, 0, 0], [0.85, 0.12, 0.45], C(red ? '#3a4a6a' : '#6a2a2a')); part(I, unitBox, [sx * (W - 0.5), 1.62, z - 0.22], [-0.12, 0, 0], [0.85, 0.6, 0.08], C(red ? '#3a4a6a' : '#6a2a2a')); part(I, unitCyl, [sx * (W - 0.12), 1.95, z], [0, 0, 0], [0.02, 0.9, 0.02], C('#b0b4b8')); }
    part(I, unitBox, [0, 1.3, fz - 0.35], [0, 0, 0], [W * 2 - 0.1, 0.3, 0.4], C('#2a2a2a')); I.box(0, 1.0, fz - 0.2, W * 2 - 0.1, 0.2, 0.12, { col: C('#222') }); seat(mb, -0.75, 1.3, fz - 1.2, 0.5, C('#2a2a2a'));
    const bw = { p: [-0.75, 1.74, fz - 0.66], r: 0.24, tilt: 1.1 }; steering(mb, bw.p, bw.r, bw.tilt);
    seats.push({ x: -0.75, y: 1.36, z: fz - 1.2, floor: 0.92, fz: 0.56, fx: 0.13, roof: H - 0.14, lean: -0.06, hands: 'wheel', wheel: bw, kind: 'drive', driver: true, exit: [W + 0.6, L / 2 - 1.05] });
    for (const [sx, z] of rowZ) for (const o of [-0.21, 0.21]) seats.push({ x: sx * (W - 0.5) + o, y: 1.36, z, floor: 0.92, fz: 0.42, fx: 0.11, roof: H - 0.14, lean: -0.05, hands: 'lap', kind: 'sit', bus: true, exit: [W + 0.6, z > 1.2 ? L / 2 - 1.05 : -0.6] });
    heavyDetail(dm, KIT, { L, W, H, R, kind: 'bus', belt, winTop, wf, wr });
    return out([[-W + 0.22, R, wf, 0.3], [W - 0.22, R, wf, 0.3], [-W + 0.26, R, wr, 0.46], [W - 0.26, R, wr, 0.46]], [-0.75, 1.45, fz - 0.72], { busDoor: [W + 0.6, L / 2 - 1.05] });
  }

  // =============================================================== LORRY (cab-over truck with drop-side bed)
  if (type === 'lorry') {
    const cabL = 1.95; const cz = L / 2 - cabL / 2; const wf = L / 2 - 1.15, wr = -L / 2 + 1.55; wheelStyle = 1;
    sideBody(paint, [[L / 2, 0.62], [L / 2 + 0.02, 1.75], [L / 2 - 0.04, 1.82], [L / 2 - cabL, 1.82], [L / 2 - cabL, 0.62]], 0.62, [[wf, R]], W, col, { bevel: 0.07, openTop: [L / 2 - cabL + 0.06, L / 2 - 0.1, 1.2] });
    loft(glass, [[L / 2 - cabL + 0.05, 1.8, 2.62, W - 0.05, W - 0.12, 0.05], [L / 2 - 0.12, 1.8, 2.55, W - 0.06, W - 0.14, 0.05]], C('#fff'), { noBottom: true });
    loft(paint, [[L / 2 - cabL + 0.02, 2.6, 2.86, W - 0.04, W - 0.16, 0.12], [L / 2 - 0.1, 2.55, 2.84, W - 0.06, W - 0.18, 0.12]], col);
    for (const sx of [-1, 1]) { beam(paint, [sx * (W - 0.06), 1.8, L / 2 - 0.1], [sx * (W - 0.1), 2.55, L / 2 - 0.12], 0.08, 0.1, col); beam(paint, [sx * (W - 0.05), 1.8, L / 2 - cabL + 0.6], [sx * (W - 0.1), 2.62, L / 2 - cabL + 0.6], 0.06, 0.08, col); seam(mb, sx * (W + 0.003), [[L / 2 - 0.3, 0.75], [L / 2 - 0.3, 1.78], [L / 2 - cabL + 0.62, 1.78], [L / 2 - cabL + 0.62, 0.75]]); }
    glass.quad([-W + 0.1, 1.85, L / 2 + 0.025], [W - 0.1, 1.85, L / 2 + 0.025], [W - 0.12, 2.52, L / 2 - 0.1], [-W + 0.12, 2.52, L / 2 - 0.1], [0, 0, 1, 1], C('#fff'));
    for (let i = 0; i < 4; i++) ch.box(0, 1.0 + i * 0.1, L / 2 + 0.03, 1.2, 0.04, 0.02, { col: C('#2a2a2a') });
    for (const sx of [-1, 1]) { part(lights, unitBox, [sx * (W - 0.3), 0.95, L / 2 + 0.03], [0, 0, 0], [0.32, 0.18, 0.02]); ind.box(sx * (W - 0.08), 0.95, L / 2 + 0.03, 0.1, 0.16, 0.02); beam(ch, [sx * (W - 0.02), 2.3, L / 2 - 0.25], [sx * (W + 0.25), 2.2, L / 2 + 0.05], 0.025, 0.025, black, unitCyl); part(paint, unitBox, [sx * (W + 0.27), 2.0, L / 2 + 0.06], [0, 0, 0], [0.08, 0.36, 0.05], black); }
    rubber.box(0, 0.62, L / 2 + 0.07, W * 2 + 0.04, 0.26, 0.14, { col: C('#2a2a2a') }); plateQuad(mb, 0, 0.62, L / 2 + 0.145, 0.22, 0.06, true, variant);
    // chassis, bed, drop sides with planks, tarp, fuel tank, mudflaps, spare
    rubber.box(0, 0.62, -cabL / 2 + 0.1, 1.0, 0.22, L - cabL + 0.2, { col: C('#1d1d1d') });
    paint.box(0, 0.86, -cabL / 2, W * 2, 0.12, L - cabL - 0.1, { col: C('#3a2a1e') });
    const side = C(variant % 2 ? '#c49a3a' : '#3a5a8a'); const bedL = L - cabL - 0.1, bz = -cabL / 2;
    for (const sx of [-1, 1]) { for (let i = 0; i < 4; i++) paint.box(sx * (W - 0.03), 1.04 + i * 0.25, bz, 0.05, 0.22, bedL, { col: side }); for (let z = bz - bedL / 2 + 0.3; z < bz + bedL / 2; z += 1.0) ch.box(sx * (W - 0.0), 1.42, z, 0.03, 0.95, 0.06, { col: C('#555') }); }
    for (let i = 0; i < 4; i++) paint.box(0, 1.04 + i * 0.25, -L / 2 + 0.05, W * 2, 0.22, 0.05, { col: side });
    loft(mb.get('canvas'), [[-L / 2 + 0.05, 1.95, 2.35, W, W - 0.2, 0.3], [L / 2 - cabL - 0.05, 1.95, 2.4, W, W - 0.2, 0.3]], C('#2f5a3a'));
    part(ch, unitCyl, [-W + 0.25, 0.6, 0.4], [Math.PI / 2, 0, 0], [0.22, 0.8, 0.22], C('#a0a4a8'));
    for (const sx of [-1, 1]) { rubber.box(sx * (W - 0.25), 0.35, wr - 0.75, 0.4, 0.45, 0.02, { col: black }); tails.box(sx * (W - 0.2), 0.8, -L / 2 - 0.01, 0.2, 0.15, 0.04); ind.box(sx * (W - 0.42), 0.8, -L / 2 - 0.01, 0.16, 0.12, 0.04); }
    plateQuad(mb, 0, 0.75, -L / 2 - 0.02, 0.22, 0.06, false, variant);
    const I = mb.get('interior'); part(I, unitBox, [0, 1.75, L / 2 - 0.35], [0, 0, 0], [W * 2 - 0.15, 0.25, 0.35], C('#2a2a2a')); seat(mb, -0.55, 1.15, L / 2 - 0.95, 0.55, C('#3a3a3a')); seat(mb, 0.4, 1.15, L / 2 - 0.95, 0.8, C('#3a3a3a'));
    I.box(0, 0.79, cz, W * 2 - 0.12, 0.04, cabL - 0.1, { col: C('#2a2a2a') }); for (const sx of [-1, 1]) I.box(sx * (W - 0.07), 1.3, cz, 0.03, 1.0, cabL - 0.2, { col: C('#4a4a48') }); I.box(0, 2.56, cz, W * 2 - 0.12, 0.03, cabL - 0.1, { col: C('#bdbdb5') }); I.box(0, 1.7, L / 2 - cabL + 0.06, W * 2 - 0.12, 1.8, 0.03, { col: C('#4a4a48') });
    const lw = { p: [-0.55, 1.76, L / 2 - 0.6], r: 0.22, tilt: 0.65 }; steering(mb, lw.p, lw.r, lw.tilt);
    seats.push({ x: -0.55, y: 1.21, z: L / 2 - 0.95, floor: 0.81, fz: 0.5, fx: 0.13, roof: 2.54, lean: -0.1, hands: 'wheel', wheel: lw, kind: 'drive', driver: true, exit: [-W - 0.6, L / 2 - 0.9] },
      { x: 0.45, y: 1.21, z: L / 2 - 0.95, floor: 0.81, fz: 0.5, fx: 0.13, roof: 2.54, lean: -0.12, hands: 'lap', kind: 'sit', exit: [W + 0.6, L / 2 - 0.9] });
    heavyDetail(dm, KIT, { L, W, H, R, kind: 'lorry', belt: 1.8, winTop: 2.6, wf, wr });
    return out([[-W + 0.22, R, wf, 0.3], [W - 0.22, R, wf, 0.3], [-W + 0.26, R, wr, 0.46], [W - 0.26, R, wr, 0.46]], [-0.55, 1.76, L / 2 - 0.6], { busDoor: [W + 0.6, cz] });
  }

  // =============================================================== CARS, TAXI, VAN, SUV — shared passenger-vehicle builder
  const P = {
    car: { top: [[2.0, 0.3], [2.02, 0.52], [1.97, 0.66], [1.82, 0.76], [1.12, 0.9], [-1.86, 0.98], [-1.99, 0.86], [-2.02, 0.55], [-1.98, 0.3]], sill: 0.28,
      gh: [[1.12, 0.9, 0.92], [0.7, 0.94, 1.22], [0.36, 0.95, 1.46], [-0.6, 0.96, 1.48], [-1.5, 0.98, 1.46], [-1.88, 0.98, 1.02]], wf: 1.25, wr: -1.3, door: [0.86, -0.06], rearDoor: [-0.09, -0.9], pillarsB: -0.075 },
    sedan: { top: [[2.25, 0.3], [2.27, 0.5], [2.2, 0.66], [2.06, 0.74], [1.18, 0.88], [-1.38, 0.97], [-2.12, 0.96], [-2.25, 0.62], [-2.22, 0.3]], sill: 0.28,
      gh: [[1.18, 0.88, 0.9], [0.8, 0.92, 1.18], [0.42, 0.93, 1.42], [-0.85, 0.96, 1.43], [-1.38, 0.97, 0.99]], wf: 1.42, wr: -1.42, door: [1.01, 0.0], rearDoor: [-0.03, -1.0], pillarsB: -0.015 },
    van: { top: [[2.35, 0.35], [2.37, 0.62], [2.32, 0.95], [2.1, 1.05], [1.98, 1.06], [-2.33, 1.1], [-2.36, 0.9], [-2.36, 0.35]], sill: 0.33,
      gh: [[1.98, 1.06, 1.08], [1.75, 1.07, 1.6], [1.45, 1.08, 1.94], [-2.28, 1.1, 1.94], [-2.34, 1.1, 1.9]], wf: 1.75, wr: -1.55, door: [1.62, 0.8], slide: [0.62, -0.55], pillarsB: 0.78 },
    suv: { top: [[2.4, 0.42], [2.42, 0.72], [2.36, 0.98], [2.2, 1.06], [1.42, 1.12], [-2.34, 1.16], [-2.4, 0.95], [-2.4, 0.42]], sill: 0.4,
      gh: [[1.42, 1.12, 1.14], [1.1, 1.13, 1.5], [0.82, 1.14, 1.78], [-2.2, 1.16, 1.8], [-2.32, 1.16, 1.75]], wf: 1.5, wr: -1.5, door: [1.02, 0.08], rearDoor: [0.05, -0.98], pillarsB: 0.065 },
  };
  const k = type === 'taxi' ? 'car' : type; const D = P[k]; const isVan = k === 'van' || k === 'suv';
  const fz = D.top[0][0], rz = D.top[D.top.length - 1][0]; const sill = D.sill;
  const taper = (z, y) => 1 - 0.11 * sstep(fz - 0.45, fz + 0.02, z) - 0.08 * sstep(rz + 0.35, rz - 0.02, z) - (isVan ? 0.02 : 0.045) * sstep(0.75, 1.0, y) - 0.03 * sstep(0.42, 0.3, y);
  sideBody(paint, D.top, sill, [[D.wf, R], [D.wr, R]], W, col, { taper, bevel: isVan ? 0.06 : 0.07, openTop: [D.gh[D.gh.length - 1][0] + 0.03, D.gh[0][0] - 0.03, sill + 0.3] });
  // wheel-well liners (stop see-through above the tyres)
  for (const wz of [D.wf, D.wr]) for (const sx of [-1, 1]) part(rubber, linerCyl, [sx * (W - 0.24), R, wz], [0, 0, Math.PI / 2], [R + 0.06, 0.3, R + 0.06], C('#0c0c0c')); // open sleeve: no end caps covering the wheel face
  // greenhouse: tinted glass loft; half widths follow the tumblehome
  const gw0 = W * 0.9, gw1 = W * (isVan ? 0.86 : 0.76);
  // the driver-door window is cut out of the greenhouse (−x side between the door edges) and rebuilt on the door itself,
  // so the glass and its frame swing open with the door instead of a fixed pane staying behind / a frame poking out
  const ghAt = (z) => { const G = D.gh; for (let i = 1; i < G.length; i++) { const a = G[i - 1], b = G[i]; if (z <= a[0] && z >= b[0]) { const t = (a[0] - z) / (a[0] - b[0] || 1); return [z, lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; } } return [z, G[0][1], G[0][2]]; };
  const [wd0, wd1] = [Math.min(D.door[0], D.gh[0][0] - 0.02), D.door[1]];
  const ghSecs = [...D.gh.filter((g) => g[0] > wd0), ghAt(wd0), ...D.gh.filter((g) => g[0] < wd0 && g[0] > wd1), ghAt(wd1), ...D.gh.filter((g) => g[0] < wd1)];
  const iD0 = ghSecs.findIndex((g) => g[0] === wd0), iD1 = ghSecs.findIndex((g) => g[0] === wd1);
  const glassSecs = ghSecs.map(([z, y0, y1]) => [z, y0, y1, gw0 - 0.01, gw1, 0.05]);
  loft(glass, glassSecs, C('#fff'), { noBottom: true, skip: (i, k) => i >= iD0 && i < iD1 && k >= 7 });
  const doorGlass = glassSecs.slice(iD0, iD1 + 1).map(loftRing);
  // roof panel + pillars (A, B, C) + belt trim
  const gh = D.gh; const roofF = gh[2], roofR = gh[gh.length - 2];
  loft(paint, [[roofR[0] - 0.02, roofR[2] - 0.03, roofR[2] + 0.025, gw1 + 0.01, gw1 - 0.06, 0.05], [roofF[0] + 0.02, roofF[2] - 0.03, roofF[2] + 0.025, gw1 + 0.01, gw1 - 0.06, 0.05]], col);
  for (const sx of [-1, 1]) {
    // A-pillars follow the windscreen edge up to the roof; C/D-pillars follow the rear glass edge
    const top = (i) => [sx * (i === 0 ? (gw0 + gw1) / 2 : gw1 - 0.01), gh[i][2] - 0.01, gh[i][0]];
    for (let i = 0; i < 2; i++) beam(paint, top(i), top(i + 1), 0.06, 0.06, col);
    const nL = gh.length - 1; beam(paint, top(nL - 1), top(nL), isVan ? 0.07 : 0.1, 0.07, col);
    beam(paint, [sx * gw0 * 0.94, gh[nL][1] + 0.02, gh[nL][0] + 0.1], top(nL), isVan ? 0.05 : 0.1, 0.07, col);
    beam(paint, [sx * gw0, gh[0][1] + 0.02, D.pillarsB], [sx * (gw1 + 0.005), roofF[2] - 0.01, D.pillarsB - 0.03], 0.05, 0.1, C('#111'));
    beam(rubber, [sx * (gw0 + 0.005), gh[0][1] + 0.005, gh[0][0]], [sx * (gw0 + 0.005), gh[gh.length - 1][1] + 0.005, gh[gh.length - 1][0]], 0.012, 0.025, C('#111'));
    if (isVan && k === 'van') for (const z of [-0.9, -1.8]) beam(paint, [sx * gw0, 1.1, z], [sx * gw1, 1.93, z], 0.04, 0.08, col);
  }
  // front: grille, headlamps with chrome bezels, indicators, bumper, plate, wipers, bonnet seam
  const fy = D.top[2][1], hy = D.top[3][1]; const nw = W * 0.86;
  part(rubber, unitBox, [0, (D.top[1][1] + fy) / 2 + 0.02, fz + 0.005], [0, 0, 0], [nw * 0.9, fy - D.top[1][1] - 0.02, 0.03], C('#141414'));
  for (let i = 0; i < 3; i++) ch.box(0, D.top[1][1] + 0.04 + i * 0.045, fz + 0.022, nw * 0.85, 0.012, 0.012, { col: chrome });
  for (const sx of [-1, 1]) {
    const hx = sx * (nw - 0.18); part(ch, unitBox, [hx, (fy + hy) / 2, fz - 0.07], [-0.5, 0, 0], [0.36, 0.13, 0.1], C('#9aa0a6')); part(lights, unitBox, [hx, (fy + hy) / 2 + 0.005, fz - 0.05], [-0.5, 0, 0], [0.32, 0.1, 0.1]);
    part(ind, unitBox, [sx * (nw - 0.02), (fy + hy) / 2 - 0.01, fz - 0.12], [-0.5, 0, 0], [0.07, 0.09, 0.1]); part(ind, unitBox, [sx * (W + 0.004), 0.82, D.wf + 0.45], [0, 0, 0], [0.01, 0.03, 0.06]);
    beam(rubber, [sx * 0.05, D.gh[0][1] + 0.03, D.gh[0][0] - 0.02], [sx * 0.55, D.gh[0][1] + 0.05, D.gh[0][0] - 0.1], 0.012, 0.012, black);
  }
  rubber.box(0, sill + 0.1, fz + 0.02, nw * 2 + 0.06, 0.16, 0.08, { col: type === 'suv' ? C('#2a2a2a') : trimGrey }); plateQuad(mb, 0, sill + 0.13, fz + 0.065, 0.19, 0.05, true, variant);
  // rear: tail clusters, reverse lights, indicators, rear glass trim, bumper, plate, exhaust
  const ty = (D.top[D.top.length - 3][1] + D.top[D.top.length - 2][1]) / 2 - 0.05;
  for (const sx of [-1, 1]) { tails.box(sx * (W * 0.86 - 0.14), ty, rz - 0.01, 0.26, 0.15, 0.05); mb.get('vrev').box(sx * (W * 0.86 - 0.34), ty - 0.02, rz - 0.012, 0.12, 0.08, 0.04); ind.box(sx * (W * 0.86 - 0.04), ty, rz - 0.012, 0.06, 0.15, 0.04); }
  rubber.box(0, sill + 0.1, rz - 0.02, W * 1.8, 0.17, 0.08, { col: trimGrey }); plateQuad(mb, 0, ty - 0.2, rz - 0.04, 0.2, 0.055, false, variant);
  part(ch, unitCyl, [0.45, sill - 0.02, rz + 0.05], [Math.PI / 2, 0, 0], [0.035, 0.18, 0.035], C('#8a8d90'));
  if (k === 'suv') { part(rubber, unitCyl, [0, 1.0, rz - 0.13], [Math.PI / 2, 0, 0], [0.36, 0.24, 0.36], C('#151515')); part(paint, unitCyl, [0, 1.0, rz - 0.255], [Math.PI / 2, 0, 0], [0.3, 0.02, 0.3], col); for (const sx of [-1, 1]) beam(ch, [sx * (gw1 - 0.06), roofF[2] + 0.06, roofF[0] - 0.1], [sx * (gw1 - 0.06), roofF[2] + 0.06, roofR[0] + 0.1], 0.03, 0.04, C('#2a2a2a')); }
  if (type === 'taxi') { part(paint, unitBox, [0, roofF[2] + 0.11, (roofF[0] + roofR[0]) / 2 + 0.2], [0, 0, 0], [0.5, 0.15, 0.22], C('#f4f4f0')); part(rubber, unitBox, [0, roofF[2] + 0.03, (roofF[0] + roofR[0]) / 2 + 0.2], [0, 0, 0], [0.3, 0.03, 0.12], C('#111')); for (const sx of [-1, 1]) paint.box(sx * (W + 0.004), 0.62, -0.1, 0.01, 0.08, 2.2, { col: C('#111') }); }
  // body-side details: door seams, handles, sill trim, mirrors
  for (const sx of [-1, 1]) {
    const x = sx * (W * taper(0, 0.6) + 0.002); const xf = (z, y) => sx * (W * taper(z, y) + 0.004); const [d0, d1] = D.door; const by = gh[0][1] - 0.02;
    seam(mb, xf, notchOutline(D, R, sill, by));
    if (D.rearDoor) seam(mb, xf, [[D.rearDoor[0], by], [D.rearDoor[0], sill + 0.06], [D.rearDoor[1], sill + 0.06], [D.rearDoor[1], by]]);
    if (D.slide && sx > 0) seam(mb, xf, [[D.slide[0], 1.9], [D.slide[0], sill + 0.06], [D.slide[1], sill + 0.06], [D.slide[1], 1.9]]);
    ch.box(x + sx * 0.01, by - 0.12, d1 + 0.18, 0.02, 0.03, 0.14, { col: chrome }); if (D.rearDoor) ch.box(x + sx * 0.01, by - 0.12, D.rearDoor[1] + 0.18, 0.02, 0.03, 0.14, { col: chrome });
    beam(rubber, [sx * (W * 0.97), sill + 0.03, D.wr + R + 0.1], [sx * (W * 0.97), sill + 0.03, D.wf - R - 0.1], 0.03, 0.05, trimGrey);
    mirror(mb, sx * gw0, gh[0][1] + 0.08, gh[0][0] - 0.12, sx, col);
  }
  // interior: dashboard, seats, steering wheel (right-hand drive), rear-view mirror
  const I = mb.get('interior'); const dz = gh[0][0] - 0.15, seatY = k === 'van' ? 0.6 : k === 'suv' ? 0.64 : k === 'sedan' ? 0.38 : 0.42; const sz = isVan ? D.door[0] - 0.75 : 0.0; const floorY = sill + 0.04;
  part(I, unitBox, [0, gh[0][1] - 0.05, dz - 0.1], [0, 0, 0], [gw0 * 2 - 0.1, 0.22, 0.45], C('#1e1e20'));
  { // cabin shell seen from inside: floor pan, door trims to the beltline, headliner, firewall, console, parcel shelf
    const zf = gh[0][0] - 0.05, zr = gh[gh.length - 1][0] + 0.08, trim = C(variant % 2 ? '#2c2c2e' : '#5a5046'); const beltY = Math.min(...gh.map((g) => g[1]));
    I.box(0, floorY, (zf + zr) / 2, gw0 * 2 - 0.08, 0.03, zf - zr, { col: C('#202022') });
    for (const sx of [-1, 1]) I.box(sx * (gw0 - 0.045), (floorY + beltY) / 2 + 0.01, (zf + zr) / 2, 0.03, beltY - floorY, zf - zr - 0.04, { col: trim });
    const roofIn = Math.min(roofF[2], roofR[2]) - 0.035; I.box(0, roofIn, (roofF[0] + roofR[0]) / 2, gw1 * 2 - 0.1, 0.02, roofF[0] - roofR[0], { col: C('#c8c4ba') });
    I.box(0, (floorY + gh[0][1] - 0.16) / 2, dz + 0.12, gw0 * 2 - 0.1, gh[0][1] - 0.16 - floorY, 0.04, { col: C('#18181a') });
    I.box(0, floorY + 0.12, (sz + dz - 0.25) / 2, 0.2, 0.22, Math.max(0.2, dz - 0.25 - sz), { col: C('#1c1c1e') });
    const backZ = (k === 'van' ? -1.4 : sz - 0.9) - 0.3; if (backZ > zr) I.box(0, beltY - 0.02, (backZ + zr) / 2, gw0 * 2 - 0.08, 0.025, backZ - zr, { col: trim });
  }
  seat(mb, -0.38, seatY, sz, 0.48, C(variant % 2 ? '#2a2a2c' : '#4a4038')); seat(mb, 0.38, seatY, sz, 0.48, C(variant % 2 ? '#2a2a2c' : '#4a4038'));
  if (k !== 'van') seat(mb, 0, seatY, sz - 0.9, W * 1.5, C(variant % 2 ? '#2a2a2c' : '#4a4038'));
  else for (const z of [-0.4, -1.4]) seat(mb, 0, seatY, z, W * 1.6, C('#3a3a3c'));
  const sw = [-0.38, seatY + 0.55, sz + 0.42]; steering(mb, sw, 0.18, 1.15); const cw = { p: sw, r: 0.18, tilt: 1.15 };
  part(I, unitBox, [0, roofF[2] - 0.1, roofF[0] - 0.1], [0, 0, 0], [0.22, 0.06, 0.02], C('#222'));
  { const cy = seatY + 0.06, roofAt = (z) => { for (let i = 1; i < gh.length; i++) { const a = gh[i - 1], b = gh[i]; if (z <= a[0] && z >= b[0]) return lerp(a[2], b[2], (a[0] - z) / (a[0] - b[0] || 1)) - 0.06; } return gh[2][2] - 0.06; };
    const hw = W + 0.6, mk = (x, z, o = {}) => ({ x, y: cy, z, floor: floorY + 0.015, fz: 0.6, fx: 0.12, roof: roofAt(z), lean: -0.22, hands: 'lap', kind: 'sit', exit: [Math.sign(x) * hw, z + 0.1], ...o });
    seats.push(mk(-0.38, sz, { driver: true, hands: 'wheel', wheel: cw, kind: 'drive', fz: 0.62 }), mk(0.38, sz, { fz: 0.64 }));
    if (k === 'van') for (const z of [-0.4, -1.4]) seats.push(mk(0.4, z, { fz: 0.55 }), mk(-0.4, z, { fz: 0.55 }));
    else seats.push(mk(0.4, sz - 0.9, { fz: 0.52 }), mk(-0.4, sz - 0.9, { fz: 0.52 })); }
  // separately hinged driver door (right side, −x) used by the entry/exit animation
  const [d0, d1] = D.door; const by = gh[0][1] - 0.02; const dx = -(W * taper((d0 + d1) / 2, 0.6) + 0.014);
  const archBack = D.wf - (R + 0.07) - 0.03;
  doors = [{ side: -1, hinge: [dx, d0], len: d0 - d1, y0: sill + 0.06, y1: by, inset: -dx - gw0, glass: doorGlass, notch: d0 > archBack ? [d0 - archBack, 2 * R + 0.1] : null }];
  { // door aperture: dark jamb + trim behind the door, hidden by the closed door, visible as the opening when it swings out
    const ax = dx + 0.006, jam = C('#1d1d1f'), y0 = sill + 0.06, nt = d0 > archBack ? [archBack, 2 * R + 0.1] : null;
    const q = (za, zb, ya, yb, c) => I.quad([ax, ya, za], [ax, ya, zb], [ax, yb, zb], [ax, yb, za], [0, 0, 1, 1], c);
    if (nt) { q(d0 - 0.02, d1 + 0.02, nt[1], by - 0.01, jam); q(nt[0], d1 + 0.02, y0 + 0.01, nt[1], jam); } else q(d0 - 0.02, d1 + 0.02, y0 + 0.01, by - 0.01, jam);
    I.box(ax + 0.03, y0 + 0.04, (d0 + d1) / 2, 0.06, 0.03, d0 - d1 - 0.1, { col: C('#3a3b3e') }); // scuff plate on the sill
  }
  carDetail(dm, KIT, { W, R, D, k, type, fz, rz, taper, gw0, gw1, fy, hy, nw, ty, sill, isVan, col, gh, roofF, roofR, seatY, sz, dz, floorY, variant });
  return out([[-W + 0.15, R, D.wf, 0.21], [W - 0.15, R, D.wf, 0.21], [-W + 0.15, R, D.wr, 0.21], [W - 0.15, R, D.wr, 0.21]], sw);
}

// Driver door: own little mesh group on a hinge pivot (front edge) so it can swing open.
function buildDoor(d, col, matsByName, stripes = null) {
  const mb = new MultiBuilder(); const len = d.len; const th = 0.05; const P = mb.get('paint');
  if (stripes) for (const [y, h, sc] of stripes) P.box(-0.0145, y, -len / 2, 0.003, h, len - 0.03, { col: sc }); // police bands continue across the door
  if (d.notch) { const [nz, ny] = d.notch; P.box(0.012, (ny + d.y1) / 2, -len / 2, th, d.y1 - ny, len - 0.02, { col }); P.box(0.012, (d.y0 + ny) / 2, -(nz + len) / 2, th, ny - d.y0, len - nz - 0.02, { col }); }
  else P.box(0.012, (d.y0 + d.y1) / 2, -len / 2, th, d.y1 - d.y0, len - 0.02, { col });
  // window: the same glass surface that was cut out of the greenhouse (model space → hinge space), framed in rubber
  const toL = (p) => [p[0] - d.hinge[0], p[1], p[2] - d.hinge[1]]; const G = d.glass.map((r) => r.map(toL)); const gl = mb.get('glass'), rb = mb.get('rubber');
  for (let i = 0; i < G.length - 1; i++) for (const k of [6, 7, 8, 9]) { const a = G[i][k], b = G[i][(k + 1) % 10], c = G[i + 1][(k + 1) % 10], e = G[i + 1][k]; if (k === 6) continue; gl.quad(a, b, c, e, [0, 0, 1, 1], C('#fff')); }
  for (let i = 0; i < G.length - 1; i++) beam(rb, G[i][7], G[i + 1][7], 0.022, 0.03, C('#111')); // top frame along the roof line
  for (const r of [G[0], G[G.length - 1]]) { beam(rb, r[0], r[9], 0.022, 0.03, C('#111')); beam(rb, r[9], r[8], 0.022, 0.03, C('#111')); beam(rb, r[8], r[7], 0.022, 0.03, C('#111')); } // front + rear frame
  mb.get('rubber').box(d.inset / 2, d.y1 + 0.012, -len / 2, d.inset + 0.04, 0.03, len - 0.03, { col: C('#141416') }); // belt-line cap between panel and glass
  mb.get('chrome').box(-0.03, d.y1 - 0.12, -len + 0.18, 0.02, 0.03, 0.14, { col: C('#c4c8cc') });
  mb.get('interior').box(0.045, (Math.max(d.y0, d.notch ? d.notch[1] : 0) + d.y1) / 2, -len / 2, 0.02, d.y1 - Math.max(d.y0, d.notch ? d.notch[1] : 0) - 0.06, len - 0.08, { col: C('#2a2a2c') });
  const pivot = new THREE.Group(); pivot.position.set(d.hinge[0], 0, d.hinge[1]);
  for (const [name, b] of mb.b) { const geo = b.build(); if (geo) { const m = new THREE.Mesh(geo, matsByName[name]); m.castShadow = name === 'paint'; pivot.add(m); } }
  return pivot;
}

// Returns a THREE.Group with .userData {wheels, tailMat, seats, type, color, steerWheel, door, entry}
export function createVehicleMesh(type, seed = 1) {
  const T = VTYPES[type]; const r = new RNG(seed); const color = r.pick(T.colors); const variant = r.int(0, 3);
  const key = type + color + variant; let cached = modelCache.get(key);
  const { mats: M } = vehicleMaterials(); const worn = WORN.has(type) || (type === 'van' && variant === 3);
  const byName = { paint: worn ? M.vworn : M.vpaint, glass: M.vglass, chrome: M.vchrome, rubber: M.vrubber, interior: M.vinterior, canvas: M.vcanvas, vlight: M.vlight, vtail: M.vtail, vind: M.vind, plate: M.plate, route0: M.route0, route1: M.route1, route2: M.route2, police: M.police, lbBlue: M.lbBlue, lbRed: M.lbRed };
  let beacons = null; if (T.police) { byName.lbBlue = M.lbBlue.clone(); byName.lbRed = M.lbRed.clone(); beacons = { blue: byName.lbBlue, red: byName.lbRed }; } // per vehicle: only responding units flash
  if (!cached) {
    const m = buildModel(type, color, variant); const geos = [];
    for (const [name, b] of m.mb.b) { const g = b.build(); if (!g) continue; if (worn && (name === 'paint' || name === 'canvas')) dirty(g, seed); geos.push([name, g]); }
    const dgeos = []; for (const [name, b] of m.dm.b) { const g2 = b.build(); if (g2) dgeos.push([name, g2]); }
    cached = { geos, dgeos, wheels: m.wheels, seats: m.seats, steerWheel: m.steerWheel, doors: m.doors, wheelStyle: m.wheelStyle, busDoor: m.busDoor }; modelCache.set(key, cached);
  }
  const g = new THREE.Group(); const tailMat = M.vtail.clone(); const indMat = M.vind.clone(); const headMat = M.vlight.clone(); const revMat = M.vrev.clone(); byName.vtail = tailMat; byName.vind = indMat; byName.vlight = headMat; byName.vrev = revMat; headMat.emissiveIntensity = 0.04; tailMat.emissiveIntensity = 0.03; revMat.emissiveIntensity = 0; // per vehicle (start dark): each car's own lamps
  for (const [name, geo] of cached.geos) { const mesh = new THREE.Mesh(geo, byName[name] || MAT.paint); mesh.name = name; mesh.castShadow = name !== 'glass' && name !== 'vlight' && name !== 'interior'; mesh.receiveShadow = name === 'paint'; if (name === 'glass') mesh.renderOrder = 2; g.add(mesh); }
  const det = new THREE.Group(); det.name = 'detail'; det.visible = false; byName.lens = M.vlens; byName.vrefl = M.vrefl;
  for (const [name, geo] of cached.dgeos) { const mesh = new THREE.Mesh(geo, byName[name] || M.vchrome); mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = name === 'paint'; if (name === 'glass' || name === 'lens') mesh.renderOrder = 2; mesh.matrixAutoUpdate = false; det.add(mesh); }
  g.add(det); const base = T.base || type; const wkind = base === 'bike' ? 'bike' : (base === 'bus' || base === 'pbus' || base === 'lorry') ? 'heavy' : 'car';
  const wp = wheelParts(T.wheelR, cached.wheels[0][3], cached.wheelStyle);
  const wheels = cached.wheels.map(([x, y, z, w]) => {
    const parts = w === cached.wheels[0][3] ? wp : wheelParts(T.wheelR, w, cached.wheelStyle);
    const pivot = new THREE.Group(); pivot.position.set(x, y, z); const spin = new THREE.Group();
    const tyre = new THREE.Mesh(parts.tyre, M.vtyre); const rim = new THREE.Mesh(parts.rim, M.vrim); tyre.castShadow = true;
    const holder = new THREE.Group(); holder.add(tyre, rim); if (x < 0) holder.rotation.y = Math.PI; spin.add(holder); pivot.add(spin);
    const hp = hiWheelParts(T.wheelR, w, cached.wheelStyle, wkind, KIT); const hi = new THREE.Group(); const t2 = new THREE.Mesh(hp.tyre, M.vtyre); t2.castShadow = true; hi.add(t2, new THREE.Mesh(hp.rim, M.vrim)); if (x < 0) hi.rotation.y = Math.PI; hi.visible = false; spin.add(hi);
    let cal = null; if (hp.caliper) { cal = new THREE.Mesh(hp.caliper, M.vrim); if (x < 0) cal.rotation.y = Math.PI; cal.visible = false; pivot.add(cal); }
    pivot.userData.lo = holder; pivot.userData.hi = hi; pivot.userData.cal = cal;
    pivot.userData.spin = spin; pivot.userData.front = z > 0; pivot.userData.baseY = y; g.add(pivot); return pivot;
  });
  let door = null; if (cached.doors && cached.doors[0]) { const d = cached.doors[0]; const hy = T.base === 'suv' ? 0.78 : 0.66; const pv = buildDoor(d, C(color), byName, T.police ? [[hy + 0.035, 0.07, C('#1b3f94')], [hy - 0.0875, 0.025, C('#1b3f94')]] : null); g.add(pv); door = { pivot: pv, side: d.side, open: 0, max: 1.15 }; }
  const ds = cached.seats.find((s) => s.driver) || cached.seats[0];
  const side = T.entry === 'bike' ? 1 : -1; const hw = T.wid / 2;
  const entry = cached.busDoor ? { x: cached.busDoor[0], z: cached.busDoor[1], side: 1 } : { x: side * (hw + (T.entry === 'tuk' ? 0.35 : T.entry === 'bike' ? 0.45 : 0.55)), z: door ? cached.doors[0].hinge[1] - cached.doors[0].len * 0.55 : ds.z, side };
  g.userData = { detail: det, lodNear: false, lodR: wkind === 'heavy' ? 80 : wkind === 'bike' ? 45 : 60, wheels, tailMat, indMat, headMat, revMat, seats: cached.seats, type, color, steerWheel: cached.steerWheel, door, entry, beacons };
  return g;
}
// darken lower panels and add per-vehicle grime variation to working vehicles
function dirty(g, seed) {
  const p = g.attributes.position, c = g.attributes.color; const r = new RNG(seed * 7 + 3);
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = (0.78 + 0.22 * sstep(0.15, 0.9, y)) * (0.93 + 0.07 * Math.sin(p.getX(i) * 9.1 + p.getZ(i) * 3.7 + r.next())); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k * 0.97); }
  c.needsUpdate = true;
}
