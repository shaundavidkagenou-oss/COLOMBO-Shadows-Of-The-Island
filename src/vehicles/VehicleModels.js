// Procedural vehicle models typical of Colombo streets. Local frame: +z forward, y up, origin on the ground under the
// vehicle centre. Right-hand drive (Sri Lanka): the driver sits on the right = local −x, kerb side is local +x.
//
// Construction: body sides are extruded silhouettes with real wheel-arch cut-outs, then warped in plan (rounded noses,
// tumblehome) so the bodywork reads as pressed panels rather than boxes; cabins get pillars, tinted glass and visible
// interiors (seats, dashboard, steering wheel); wheels are lathed tyres with alloy rims; cars and vans get a separately
// hinged driver door used by the entry/exit animation.
import { doorGapsMeta, spansOutside } from './DoorSpans.js';
import { poseDoor } from './DoorRig.js';
import * as THREE from 'three';
import { bodySkin, makeBodyWarp } from './BodyShape.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { carDetail, tukDetail, heavyDetail, hiWheelParts } from './VehicleDetail.js';
import { BIKES } from './BikeCatalog.js';
import { liveryMaterial } from './RaceBody.js';
import { buildBike } from './BikeModels.js';
import { weaponSurface } from '../combat/WeaponSurface.js';
import { MeshBuilder, MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { RNG } from '../core/rng.js';
import { standMeshes } from './Kickstand.js';
import { addAmbulanceKit, ambDecalMat, buildAmbRear, AMB_GREEN } from './AmbulanceKit.js';
import { CATALOG } from './VehicleCatalog.js';
import { styleVehicle, badgeMaterial, badgeText, placeEmblem } from './VehicleStyle.js';

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
  lorry: { len: 7.2, wid: 2.3, hgt: 3.0, wheelR: 0.48, maxSpeed: 24, accel: 2.0, mass: 7000, seats: 2, steer: 0.45, sound: 'bus', entry: 'cab', colors: ['#1d4f8a', '#b51f1f', '#e0b420', '#2a6b3a'] },
  // Sri Lanka Police vehicles (white with blue bands, trilingual POLICE lettering, blue/red beacons). Built on the civilian
  // body of `base` plus a police kit; never part of random traffic (Traffic.js MIX lists them nowhere).
  police: { base: 'sedan', police: true, len: 4.5, wid: 1.74, hgt: 1.45, wheelR: 0.32, maxSpeed: 46, accel: 6.4, mass: 1300, seats: 4, steer: 0.52, sound: 'car', entry: 'car', colors: ['#f4f4f2'] },
  policejeep: { base: 'suv', police: true, len: 4.8, wid: 1.9, hgt: 1.85, wheelR: 0.38, maxSpeed: 44, accel: 6.2, mass: 2150, seats: 5, steer: 0.5, sound: 'van', entry: 'van', colors: ['#f4f4f2'] },
  policebike: { base: 'bike', police: true, len: 1.95, wid: 0.7, hgt: 1.1, wheelR: 0.3, maxSpeed: 32, accel: 6.8, mass: 175, seats: 2, steer: 0.7, sound: 'bike', entry: 'bike', colors: ['#f4f4f2'] },
  // national free pre-hospital ambulance (hotline 1990): white high-roof van, green livery, Star of Life, trilingual lettering,
  // red/blue beacons, twin rear doors (AmbulanceKit.js). Unbadged; only appears when the player calls 119 → ambulance.
  ambulance: { base: 'van', ambulance: true, len: 4.7, wid: 1.72, hgt: 2.0, wheelR: 0.33, maxSpeed: 38, accel: 5.0, mass: 2100, seats: 8, steer: 0.5, sound: 'van', entry: 'van', colors: ['#f4f4f2'] },
  // municipal wrecker on the lorry cab: equipment deck, boom and winch, rear wheel-lift; only appears to tow a vehicle the player abandoned
  tow: { base: 'lorry', tow: true, len: 7.2, wid: 2.3, hgt: 3.0, wheelR: 0.48, maxSpeed: 24, accel: 2.0, mass: 6500, seats: 2, steer: 0.45, sound: 'bus', entry: 'cab', colors: ['#e0b420', '#f2f2f0'] },
  bike: { len: 1.95, wid: 0.7, hgt: 1.1, wheelR: 0.3, maxSpeed: 30, accel: 6.5, mass: 160, seats: 2, steer: 0.7, sound: 'bike', entry: 'bike', colors: ['#151515', '#b51f1f', '#1d3f8a', '#e8e8e4', '#5a6b3a'] },
};
// the 40 catalogue models (fictional makes, real-world proportions) — VehicleCatalog.js
Object.assign(VTYPES, CATALOG); Object.assign(VTYPES, BIKES); // + 20 motorcycle / scooter kinds (BikeCatalog.js)
// clean private vehicles get clear-coated paint; working vehicles get worn, dirtier paint
const WORN = new Set(['tuktuk', 'taxi', 'bus', 'pbus', 'lorry', 'tow', 'tara', 'hakobi', 'bhoomimaxi']);

// lofted body from cross-sections [z, y0, y1, halfW0 (bottom), halfW1 (top), round]
// loft cross-section ring (10 points, counter-clockwise from the bottom-left); points 6..9 + 0 form the −x side
function loftRing(s) { const [z, y0, y1, w0, w1, r = 0.12] = s; const h = y1 - y0; const rr = Math.min(r, h * 0.45);
  return [[-w0 + rr * 0.3, y0], [w0 - rr * 0.3, y0], [w0, y0 + rr], [w0 + (w1 - w0) * 0.55, y0 + h * 0.55], [w1, y1 - rr], [w1 - rr, y1], [-w1 + rr, y1], [-w1, y1 - rr], [-(w0 + (w1 - w0) * 0.55), y0 + h * 0.55], [-w0, y0 + rr]].map(([x, y]) => [x, y, z]); }
// a smooth swept strip with a flattened half-round section (pillars lying on the glasshouse instead of square beams):
// pts = path, nrm(i) = outward direction at pts[i] (the flat underside faces −nrm, 3 mm into the surface it sits on)
function strip(mb, pts, nrm, w, t, col, seg = 6) {
  const tmp = new MeshBuilder(); const V = (a) => new THREE.Vector3(...a); const rings = [];
  for (let i = 0; i < pts.length; i++) { const T = V(pts[Math.min(pts.length - 1, i + 1)]).sub(V(pts[Math.max(0, i - 1)])).normalize(); const N = V(nrm(i)); N.addScaledVector(T, -N.dot(T)).normalize(); const B = new THREE.Vector3().crossVectors(T, N).normalize(); const P = V(pts[i]);
    const r = []; for (let j = 0; j <= seg; j++) { const th = Math.PI * j / seg; r.push(P.clone().addScaledVector(B, (w / 2) * Math.cos(th)).addScaledVector(N, t * Math.sin(th) - 0.003).toArray()); } rings.push(r); }
  for (let i = 0; i < rings.length - 1; i++) { const a = rings[i], b = rings[i + 1]; for (let j = 0; j < seg; j++) tmp.quad(a[j], b[j], b[j + 1], a[j + 1], [0, 0, 1, 1], col); tmp.quad(a[seg], b[seg], b[0], a[0], [0, 0, 1, 1], col); }
  let g = tmp.build(); if (g) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-5); g.computeVertexNormals(); mb.geometry(g, new THREE.Matrix4()); g.dispose(); }
  for (const [r, f] of [[rings[0], false], [rings[rings.length - 1], true]]) { const c = r.reduce((q, p) => [q[0] + p[0] / r.length, q[1] + p[1] / r.length, q[2] + p[2] / r.length], [0, 0, 0]); for (let j = 0; j < seg; j++) { if (f) mb.quad(c, r[j], r[j + 1], c, [0, 0, 1, 1], col); else mb.quad(c, r[j + 1], r[j], c, [0, 0, 1, 1], col); } }
}
function loft(mb, secs, col, { capFront = true, capBack = true, noBottom = false, skip = null } = {}) {
  const rings = secs.map(loftRing); const n = rings[0].length; const tmp = new MeshBuilder();
  for (let i = 0; i < rings.length - 1; i++) for (let k = noBottom ? 1 : 0; k < n; k++) { if (skip && skip(i, k)) continue; const a = rings[i][k], b = rings[i][(k + 1) % n], c = rings[i + 1][(k + 1) % n], d = rings[i + 1][k]; tmp.quad(a, b, c, d, [0, 0, 1, 1], col); }
  // smooth-shaded sides (pressed panels), flat caps
  let g = tmp.build(); if (g) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-5); g.computeVertexNormals(); mb.geometry(g, new THREE.Matrix4()); g.dispose(); }
  const cap = (r, front) => { const ctr = r.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]); for (let k = 0; k < n; k++) { const a = r[k], b = r[(k + 1) % n]; if (front) mb.quad(ctr, a, b, ctr, [0, 0, 1, 1], col); else mb.quad(ctr, b, a, ctr, [0, 0, 1, 1], col); } }; // rings run counter-clockwise seen from +z: the front cap (last ring) faces +z, the back cap −z
  if (capBack) cap(rings[0], false); if (capFront) cap(rings[rings.length - 1], true);
}

// Extruded side silhouette with semicircular wheel-arch cut-outs.
//  top: [[z,y]...] contour from the front-bottom corner over the top to the rear-bottom corner
//  sill: y of the bottom edge; arches: [[zc, wheelR]]; W: half width; taper(z,y) → half-width factor
// polygon helpers for cutting the door aperture out of the side cap ([z,y] points, orientation preserved)
function clipHalf(poly, f) { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b); if (fa >= 0) out.push(a); if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } } return out; }
function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function subtractRect(poly, [z0, z1, y0, y1]) { // convex poly minus axis-aligned rect → up to 4 convex pieces
  const mid = clipHalf(clipHalf(poly, (p) => p[0] - z0), (p) => z1 - p[0]);
  return [clipHalf(poly, (p) => z0 - p[0]), clipHalf(poly, (p) => p[0] - z1), clipHalf(mid, (p) => y0 - p[1]), clipHalf(mid, (p) => p[1] - y1)].filter((q) => q.length >= 3 && Math.abs(polyArea(q)) > 1e-9);
}
//  cut: { rects: [[z0,z1,y0,y1]], z0, z1, yTop, side } (or a list of them) — opens a door aperture in the −x (side −1) or +x
//  (side +1) cap: cap clipped around the rects, shoulder bevel over the door removed
function sideBody(mb, top, sill, arches, W, col, { taper = null, bevel = 0.05, openTop = null, cut = null } = {}) {
  const cuts = cut ? (Array.isArray(cut) ? cut : [cut]).map((c) => ({ side: -1, ...c })) : null; if (cuts && !cuts.length) cut = null;
  if (cut) { const zsAll = [...new Set(cuts.flatMap((c) => [c.z1, c.z0]))]; const t2 = [top[0]]; for (let i = 1; i < top.length; i++) { const a = top[i - 1], b = top[i]; for (const zs of zsAll) if ((a[0] - zs) * (b[0] - zs) < 0) { const t = (a[0] - zs) / (a[0] - b[0]); t2.push([zs, a[1] + (b[1] - a[1]) * t]); } t2.push(b); } top = t2; } // contour vertices at the door edges so the bevel splits there
  const sh = new THREE.Shape(); const f = top[0], r = top[top.length - 1];
  sh.moveTo(r[0], sill);
  for (const [zc, R] of [...arches].sort((a, b) => a[0] - b[0])) {
    const ra = R + 0.07, s = Math.min(0.95, Math.max(-0.95, (R - sill) / ra)); const dx = Math.sqrt(Math.max(0, ra * ra - (R - sill) ** 2));
    sh.lineTo(zc - dx, sill); sh.absarc(zc, R, ra, Math.PI + Math.asin(s), -Math.asin(s), true);
  }
  sh.lineTo(f[0], sill); for (const p of top) sh.lineTo(p[0], p[1]); sh.lineTo(r[0], sill);
  // the same outline as the Shape above, as [z, y] points (arches sampled every ~4 cm) → a densely surfaced skin (BodyShape.js)
  const ol = [[r[0], sill]];
  for (const [zc, R] of [...arches].sort((a, b) => a[0] - b[0])) {
    const ra = R + 0.07, s = Math.min(0.95, Math.max(-0.95, (R - sill) / ra)); const al = Math.asin(s), a0 = Math.PI + al, a1 = -al; const n = Math.max(8, Math.ceil(ra * (a0 - a1) / 0.04));
    for (let k = 0; k <= n; k++) { const t = a0 + (a1 - a0) * k / n; ol.push([zc + Math.cos(t) * ra, R + Math.sin(t) * ra]); }
  }
  ol.push([f[0], sill]); for (const p of top) ol.push([p[0], p[1]]);
  const olc = ol.filter((p, i) => { const q = ol[(i + 1) % ol.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5; });
  let g = mergeVertices(bodySkin(olc, W, bevel), 1e-4); sideOutline = olc;
  if (openTop) { // remove the upward-facing cap over the cabin so occupants are not sliced by it (interior trims line the cabin)
    const ranges = Array.isArray(openTop[0]) ? openTop : [openTop]; const P = g.attributes.position, I = g.index.array, keep = []; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    for (let t = 0; t < I.length; t += 3) { a.fromBufferAttribute(P, I[t]); b.fromBufferAttribute(P, I[t + 1]); c.fromBufferAttribute(P, I[t + 2]); n.subVectors(c, b).cross(b.clone().sub(a)).normalize();
      const cz = (a.z + b.z + c.z) / 3, cy = (a.y + b.y + c.y) / 3, cx = Math.abs(a.x + b.x + c.x) / 3; const up = Math.abs(n.y) > 0.8;
      if (up && cx < W - bevel * 1.2 && ranges.some(([z0, z1, yMin]) => cy > yMin && cz > z0 && cz < z1 && Math.min(a.z, b.z, c.z) > z0 - 0.05 && Math.max(a.z, b.z, c.z) < z1 + 0.05)) continue; keep.push(I[t], I[t + 1], I[t + 2]); }
    g.setIndex(keep);
  }
  if (cut) { // real door apertures: nothing of the body is left where a door sits
    const P = g.attributes.position, I = g.index.array, keep = [], pos = Array.from(P.array); const xs = W - 1e-4, xb = W - bevel - 1e-4, e = 1e-3;
    for (let t = 0; t < I.length; t += 3) { const v = [I[t], I[t + 1], I[t + 2]]; const X = v.map((i) => P.getX(i)), Y = v.map((i) => P.getY(i)), Z = v.map((i) => P.getZ(i));
      const capSide = Math.max(...X) <= -xs ? -1 : Math.min(...X) >= xs ? 1 : 0;
      if (capSide) { const mine = cuts.filter((c) => c.side === capSide); let polys = [[[Z[0], Y[0]], [Z[1], Y[1]], [Z[2], Y[2]]]];
        const whole = mine.every((c) => Math.min(...Z) > c.z1 + e || Math.max(...Z) < c.z0 - e || Math.max(...Y) < Math.min(...c.rects.map((r) => r[2])) - e);
        if (whole) { keep.push(...v); continue; }
        for (const c of mine) for (const rc of c.rects) polys = polys.flatMap((q) => subtractRect(q, rc));
        for (const q of polys) { const base = pos.length / 3; for (const [z, y] of q) pos.push(capSide * W, y, z); for (let k = 1; k < q.length - 1; k++) if (Math.abs(polyArea([q[0], q[k], q[k + 1]])) > 1e-8) keep.push(base, base + k, base + k + 1); }
        continue; }
      const bevSide = Math.max(...X) <= -xb ? -1 : Math.min(...X) >= xb ? 1 : 0;
      if (bevSide && cuts.some((c) => c.side === bevSide && Math.min(...Z) >= c.z0 - 0.005 && Math.max(...Z) <= c.z1 + 0.005 && Math.min(...Y) > c.yTop)) continue; // shoulder bevel over a door: it is part of the door skin now
      if (bevSide) { const cz = (Z[0] + Z[1] + Z[2]) / 3, cy = (Y[0] + Y[1] + Y[2]) / 3; if (cuts.some((c) => c.side === bevSide && c.rects.some((rc) => cz > rc[0] - e && cz < rc[1] + e && cy > rc[2] - e && cy < rc[3] + e))) continue; } // wheel-arch bevel under a notched door's skin
      keep.push(...v); }
    g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(keep); const g2 = mergeVertices(g, 1e-4); g.dispose(); g = g2;
  }
  if (taper) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * taper(p.getZ(i), p.getY(i))); }
  g.computeVertexNormals(); mb.geometry(g, new THREE.Matrix4(), col); g.dispose();
  // dark wheel-well liners inside the arch tunnels
  for (const [zc, Rw] of arches) archLiner(liners || mb, W * 0.97, zc, Rw, Rw + 0.06);
}
let liners = null; let sideOutline = null; // the last side silhouette sideBody built (the body shape field follows it)
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
const BKIT = { ...KIT, unitSph, loft, plateQuad }; // motorcycles (BikeModels.js)
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
// Colombo bus routes (route number, Sinhala, Tamil, English destination) shown on the amber LED destination boards
const ROUTES = [['138', 'කොට්ටාව', 'கொட்டாவ', 'KOTTAWA'], ['100', 'පානදුර', 'பாணந்துறை', 'PANADURA'], ['154', 'අඟුලාන', 'அங்குலானை', 'ANGULANA'], ['101', 'මොරටුව', 'மொரட்டுவை', 'MORATUWA'],
  ['120', 'හොරණ', 'ஹொரணை', 'HORANA'], ['177', 'කඩුවෙල', 'கடுவலை', 'KADUWELA'], ['155', 'රත්මලාන', 'இரத்மலானை', 'RATMALANA'], ['103', 'නාරාහේන්පිට', 'நாரஹேன்பிட்டி', 'NARAHENPITA']];
export const BUS_ROUTES = ROUTES.length;
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
  if (base === 'bike') { // white top box (sits on the commuter's luggage rack, y 0.81) with lettering and a beacon, blue tank band
    paint.box(0, 1.0, -0.84, 0.42, 0.3, 0.34, { col: C('#f4f4f2') }); rubber.box(0, 0.835, -0.84, 0.44, 0.03, 0.36, { col: C('#222') });
    for (const sx of [-1, 1]) sideDecal(dec, sx, 0.212, 0.9, 1.1, -0.99, -0.69, [0, 0, 1, 1]);
    dec.quad([0.2, 0.9, -1.012], [-0.2, 0.9, -1.012], [-0.2, 1.1, -1.012], [0.2, 1.1, -1.012], [0, 0, 1, 1], [1, 1, 1]);
    rubber.box(0, 1.17, -0.84, 0.05, 0.04, 0.05, { col: C('#222') }); mb.get('lbBlue').box(-0.05, 1.22, -0.84, 0.09, 0.07, 0.09, { col: [1, 1, 1] }); mb.get('lbRed').box(0.05, 1.22, -0.84, 0.09, 0.07, 0.09, { col: [1, 1, 1] });
    for (const sx of [-1, 1]) paint.box(sx * 0.165, 0.76, 0.1, 0.012, 0.05, 0.36, { col: blue });
    return;
  }
  const H = T.hgt, hy = base === 'suv' ? 0.78 : 0.66; // body bands and door lettering
  const spans = (sx) => spansOutside(-1.45, 1.45, doorGapsMeta(m.doors, sx)); // driver side: bands stop at the door gap (the door has its own)
  for (const sx of [-1, 1]) { const x = W + 0.012; for (const [za, zb] of spans(sx)) { sideDecal(paint, sx, x, hy, hy + 0.07, za, zb, [0, 0, 0.1, 0.1], blue); sideDecal(paint, sx, x, hy - 0.1, hy - 0.075, za, zb, [0, 0, 0.1, 0.1], blue); } sideDecal(dec, sx, x + 0.002, hy - 0.4, hy - 0.12, -0.98, -0.08); } // lettering on the rear doors (the driver door is a separate swinging mesh)
  const ry = H - (base === 'suv' ? 0.0 : 0.02), rz = base === 'suv' ? -0.2 : -0.35; // roof light bar
  rubber.box(0, ry + 0.03, rz, 1.15, 0.05, 0.26, { col: C('#1a1a1a') }); mb.get('lbBlue').box(-0.29, ry + 0.1, rz, 0.54, 0.1, 0.22, { col: [1, 1, 1] }); mb.get('lbRed').box(0.29, ry + 0.1, rz, 0.54, 0.1, 0.22, { col: [1, 1, 1] });
  dec.quad([0.5, 0.62, -T.len / 2 - 0.03], [-0.5, 0.62, -T.len / 2 - 0.03], [-0.5, 0.8, -T.len / 2 - 0.03], [0.5, 0.8, -T.len / 2 - 0.03], [0, 0.5, 1, 1], [1, 1, 1]); // POLICE on the boot
}
// One atlas (row per route) of amber dot-matrix LED boards: big route number left; Sinhala / Tamil / English stacked right.
// Rendered once; the LED look is a dark dot grid laid over the lettering. Night brightness: setVehicleNight.
let routeAtlas = null;
function routeMat() {
  if (routeAtlas) return routeAtlas;
  const RW = 512, RH = 128, n = ROUTES.length; const c = document.createElement('canvas'); c.width = RW; c.height = RH * n; const g = c.getContext('2d');
  ROUTES.forEach(([no, si, ta, en], k) => { const y = k * RH; g.save(); g.beginPath(); g.rect(0, y, RW, RH); g.clip(); g.fillStyle = '#060606'; g.fillRect(0, y, RW, RH);
    g.fillStyle = '#ffae1a'; g.textBaseline = 'middle'; g.font = 'bold 92px "Barlow Condensed", sans-serif'; g.fillText(no, 10, y + RH / 2 + 4);
    const fit = (txt, font, max, yy) => { g.font = font; const w = g.measureText(txt).width; g.save(); g.translate(500, yy); if (w > max) g.scale(max / w, 1); g.textAlign = 'right'; g.fillText(txt, 0, 0); g.restore(); };
    fit(si, '600 40px "Noto Sans Sinhala", sans-serif', 330, y + 30); fit(ta, '600 26px "Noto Sans Tamil", sans-serif', 330, y + 70); fit(en, 'bold 30px "Barlow Condensed", sans-serif', 330, y + 104);
    g.restore(); });
  g.fillStyle = 'rgba(6,6,6,0.82)'; for (let x = 0; x < RW; x += 4) g.fillRect(x, 0, 1.4, RH * n); for (let yy = 0; yy < RH * n; yy += 4) g.fillRect(0, yy, RW, 1.4); // LED dot grid
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (routeAtlas = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.35 }));
}
// uv rect of route k: full board, or just the number (rear/side number boxes)
const routeUV = (k, numberOnly = false) => { const n = ROUTES.length, v1 = 1 - k / n, v0 = 1 - (k + 1) / n; return [0, v0 + 0.002, numberOnly ? 0.215 : 1, v1 - 0.002]; };
// Number plates (Sri Lankan format: province + letters + digits; white front, yellow rear). Atlas rows 0-3 rear, 4-7 front.
// motorcycle instruments atlas: left half an analogue speedometer (white on black, red needle, tell-tales), top-right quarter a colour TFT
// (rev bar, gear, speed, riding mode, lap timer); lit from behind at night (emissive = the same image)
function dashMaterial() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#050506'; g.fillRect(0, 0, 512, 256);
  // analogue speedo
  g.save(); g.translate(128, 132); g.strokeStyle = '#e8e8e4'; g.fillStyle = '#e8e8e4'; g.lineWidth = 3; g.font = 'bold 17px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let v = 0; v <= 120; v += 10) { const a = (-225 + (v / 120) * 270) * Math.PI / 180; const r0 = v % 20 ? 92 : 84; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * 104, Math.sin(a) * 104); g.stroke(); if (v % 20 === 0) g.fillText(String(v), Math.cos(a) * 68, Math.sin(a) * 68); }
  g.strokeStyle = '#d02020'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 100, (-225 + 250) * Math.PI / 180, 45 * Math.PI / 180); g.stroke();
  g.font = '12px sans-serif'; g.fillText('km/h', 0, 34); g.fillStyle = '#20c040'; g.fillText('N', -22, 58); g.fillStyle = '#3a7bff'; g.fillText('\u25C9', 22, 58);
  g.fillStyle = '#ff3a20'; g.rotate((-225 + 4) * Math.PI / 180); g.fillRect(0, -3, 92, 6); g.restore(); g.fillStyle = '#222'; g.beginPath(); g.arc(128, 132, 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#18c040'; g.beginPath(); g.moveTo(26, 40); g.lineTo(42, 30); g.lineTo(42, 50); g.fill(); g.beginPath(); g.moveTo(230, 40); g.lineTo(214, 30); g.lineTo(214, 50); g.fill();
  // TFT
  const X = 256; const grd = g.createLinearGradient(X + 16, 0, X + 240, 0); grd.addColorStop(0, '#e8f4ff'); grd.addColorStop(0.7, '#ffb000'); grd.addColorStop(1, '#ff2010');
  g.fillStyle = '#0b0d12'; g.fillRect(X + 6, 6, 244, 116); g.fillStyle = grd; for (let i = 0; i < 26; i++) { const h = 6 + i * 1.3; g.globalAlpha = i < 9 ? 1 : 0.22; g.fillRect(X + 16 + i * 8.6, 44 - h, 6, h); } g.globalAlpha = 1;
  g.fillStyle = '#f2f2f2'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', X + 52, 86); g.font = 'bold 40px sans-serif'; g.fillText('0', X + 150, 82);
  g.font = '12px sans-serif'; g.fillText('km/h', X + 150, 108); g.fillStyle = '#ff3030'; g.font = 'bold 13px sans-serif'; g.fillText('RACE', X + 220, 64); g.fillStyle = '#9ad'; g.font = '11px sans-serif'; g.fillText('LAP 0:00.0', X + 214, 100);
  g.fillStyle = '#2a8'; g.fillRect(X + 196, 112, 44, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.45, roughness: 0.18, metalness: 0.0 });
}
function plateMaterial() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d'); const r = new RNG(77);
  for (let i = 0; i < 8; i++) { const y = i * 64; g.fillStyle = i < 4 ? '#f2c818' : '#f4f4f0'; g.fillRect(0, y, 256, 64); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(3, y + 3, 250, 58);
    g.fillStyle = '#111'; g.font = 'bold 15px "Barlow Condensed", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('WP', 12, y + 32);
    g.font = 'bold 44px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; const L = 'ABCDKLNPQ'; g.fillText(`${L[r.int(0, 8)]}${L[r.int(0, 8)]}${L[r.int(0, 8)]}-${r.int(1000, 9999)}`, 140, y + 34); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.1 });
}
// Lamp lenses emit only from surfaces facing the lamp's direction (+z = forward for headlights, −z for tail / reverse
// lamps): the emissive boxes no longer glow from behind / through the cabin and rear glass.
function directionalLamp(mat, dir) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLampDir;').replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n  vLampDir = objectNormal.z * ${dir.toFixed(1)};`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLampDir;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= smoothstep( 0.3, 0.8, vLampDir );');
  };
  mat.customProgramCacheKey = () => 'lamp' + dir;
}
// Soft contact shadow / ambient occlusion under every vehicle: the dark patch real cars always sit on (without it a body
// reads as hovering above the asphalt even when the tyres touch). One shared material + one unit quad, scaled per type.
let contactGeo = null;
function contactShadowMat() { // texture-free: per-vertex alpha (inner rectangle opaque, feathered ring fading to 0)
  return new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
}
// unit footprint (±0.5): core ±0.5 × body, feather out to ±0.5 × (1 + f); RGBA colours, alpha 1 inside → 0 at the rim
function contactShadowGeo() {
  const ci = 0.5 / 1.42 * 1.0, cz = 0.5 / 1.22 * 1.0, o = 0.5; // core = body footprint inside the scaled quad
  const P = [[-ci, -cz], [ci, -cz], [ci, cz], [-ci, cz], [-o, -o], [o, -o], [o, o], [-o, o]];
  const pos = [], col = []; for (const [k, [x, z]] of P.entries()) { pos.push(x, 0, z); col.push(0, 0, 0, k < 4 ? 1 : 0); }
  const idx = [0, 2, 1, 0, 3, 2]; for (let k = 0; k < 4; k++) { const a = k, b = (k + 1) % 4, A = a + 4, B = b + 4; idx.push(a, b, B, a, B, A); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// metallic paint: aluminium flakes under the clear coat. Object-space hash cells (~0.7 mm) jitter the BASE layer's normal and
// roughness; the clearcoat keeps the unperturbed normal (smooth lacquer over a sparkly base, as on real paint). Flakes fade
// out where a cell is smaller than a pixel (fwidth), so distant traffic never shimmers. One shared program, a few ALU ops.
function paintFlakes(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFlakeP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlakeP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFlakeP;\nfloat flakeH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nvec3 flakeC = floor(vFlakeP * 1400.0); float flakeA = clamp(1.6 - length(fwidth(vFlakeP)) * 1400.0, 0.0, 1.0); roughnessFactor = clamp(roughnessFactor * (1.0 + (flakeH(flakeC) - 0.5) * 0.6 * flakeA), 0.04, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + (vec3(flakeH(flakeC + 1.3), flakeH(flakeC + 7.1), flakeH(flakeC + 3.7)) - 0.5) * 0.16 * flakeA);');
  };
  m.customProgramCacheKey = () => 'vpaint-flakes'; return m;
}
export function vehicleMaterials() {
  if (!mats) {
    mats = {
      vpaint: paintFlakes(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.0 })),
      vworn: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, envMapIntensity: 0.7 }),
      vglass: new THREE.MeshPhysicalMaterial({ color: 0x0c1215, roughness: 0.1, metalness: 0.0, specularIntensity: 0.38, transparent: true, opacity: 0.8, envMapIntensity: 0.5, depthWrite: false, side: THREE.DoubleSide }), // tinted automotive glass: weak Fresnel so sloped rear screens never read as white glowing panels against the sky
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
      // motorcycles: twill carbon fibre under clear lacquer, machined alloy, sand-cast engine cases, real mirror glass, instrument faces
      vcarbon: weaponSurface(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 }), 'carbon'),
      valloy: weaponSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.92, envMapIntensity: 1.15 }), 'steel'),
      vengine: weaponSurface(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6, envMapIntensity: 0.9 }), 'cast'),
      vmirror: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.03, metalness: 1.0, envMapIntensity: 1.6 }),
      vdash: dashMaterial(),
      contact: contactShadowMat(),
      livery: liveryMaterial(), badge: badgeMaterial(), plate: plateMaterial(), route: routeMat(), police: policeDecalMat(), amb: ambDecalMat(),
      lbBlue: new THREE.MeshStandardMaterial({ color: 0x0c1e5a, emissive: 0x2a5cff, emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.92 }),
      lbRed: new THREE.MeshStandardMaterial({ color: 0x5a0c0c, emissive: 0xff2020, emissiveIntensity: 0, roughness: 0.2, transparent: true, opacity: 0.92 }),
    };
  }
  return { lightMat: mats.vlight, tailMatBase: mats.vtail, indicatorMat: mats.vind, mats };
}
export function setVehicleNight(n) { vehicleMaterials(); mats.vdash.emissiveIntensity = 0.45 + n * 0.9; mats.vlight.emissiveIntensity = 0.2 + n * 3.0; mats.vtail.emissiveIntensity = 0.08 + n * 0.5; mats.route.emissiveIntensity = 0.45 + n * 1.5; }

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
  if (TP.ambulance) { const m = buildBaseModel(TP.base, color, variant & ~3, { amb: true }); addAmbulanceKit(m, TP); return m; } // plain (not worn) body
  if (TP.tow) return buildBaseModel(TP.base, color, variant, { tow: true });
  return buildBaseModel(type, color, variant);
}
// bus stairwell treads [top y, inner x, outer x] (vehicle-local, kerb side): two steps up to the 0.92 m floor
export const BUS_STEPS = (W) => [[0.45, W - 0.32, W - 0.04], [0.69, W - 0.6, W - 0.32]];
function buildBaseModel(type, color, variant, opts = {}) {
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
    // Bajaj-RE-style front: driver's footboard; a tall front shield as wide as the cab at the windscreen base, rounded face,
    // sitting above the front wheel + mudguard; lower skirts either side of the wheel; footwell wings wrapping the driver's legs
    loft(paint, [[0.18, 0.27, 0.35, 0.6, 0.6, 0.03], [0.62, 0.27, 0.35, 0.56, 0.56, 0.03], [0.72, 0.28, 0.35, 0.44, 0.44, 0.03]], col);
    loft(paint, [[0.62, 0.55, 1.04, 0.5, 0.6, 0.1], [1.04, 0.55, 1.05, 0.5, 0.6, 0.12], [1.14, 0.56, 1.035, 0.48, 0.57, 0.12], [1.2, 0.58, 1.0, 0.44, 0.52, 0.1], [1.225, 0.61, 0.96, 0.38, 0.46, 0.07]], col); // broad, nearly flat face with rounded edges
    for (const sx of [-1, 1]) {
      paint.box(sx * 0.41, 0.45, 0.88, 0.18, 0.3, 0.52, { col }); // lower skirt beside the front wheel, flush with the shield side
      const lw = paint; lw.box(sx * 0.585, 0.46, 0.43, 0.03, 0.34, 0.42, { col }); // footwell wing
      ch.box(sx * 0.585, 0.635, 0.43, 0.04, 0.02, 0.43, { col: chrome }); // chrome edge on the wing
    }
    for (const sx of [-1, 1]) for (const [a, b] of [[[sx * 0.56, 1.045, 0.64], [sx * 0.56, 1.045, 0.98]], [[sx * 0.56, 1.045, 0.98], [sx * 0.4, 0.98, 1.16]]]) beam(ch, a, b, 0.012, 0.012, chrome, unitCyl); // chrome trim along the shield top
    beam(ch, [0, 0.9, 1.215], [0, 1.02, 1.17], 0.016, 0.016, chrome, unitCyl); // centre nose strip above the lamp
    // chrome front guard bar (a common Sri Lankan fitment) around the shield's lower edge
    beam(ch, [-0.44, 0.5, 1.27], [0.44, 0.5, 1.27], 0.022, 0.022, chrome, unitCyl); for (const sx of [-1, 1]) beam(ch, [sx * 0.44, 0.5, 1.27], [sx * 0.46, 0.6, 1.15], 0.02, 0.02, chrome, unitCyl);
    // rounded canopy with canvas valance; frame tubes
    loft(ds, [[-1.3, 1.42, 1.8, 0.665, 0.5, 0.22], [-1.18, 1.4, 1.83, 0.67, 0.53, 0.22], [0.8, 1.4, 1.82, 0.67, 0.53, 0.22], [0.95, 1.46, 1.75, 0.64, 0.5, 0.16]], hood, { noBottom: true }); // an open canvas shell (roof + side valances): the ceiling is the roof itself (~1.8 m), not a slab at 1.4 m that heads went into
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
    part(ch, unitCyl, [0, 0.79, 1.225], [Math.PI / 2, 0, 0], [0.1, 0.06, 0.1], chrome); part(lights, unitCyl, [0, 0.79, 1.257], [Math.PI / 2, 0, 0], [0.083, 0.012, 0.083]); // big round headlamp in a chrome bezel, centre of the shield
    for (const sx of [-1, 1]) { part(ind, unitSph, [sx * 0.39, 0.94, 1.222], [0, 0, 0], [0.042, 0.036, 0.03]); tails.box(sx * 0.5, 0.72, -1.265, 0.09, 0.2, 0.03); ind.box(sx * 0.5, 0.6, -1.265, 0.09, 0.05, 0.03); rubber.box(sx * 0.58, 0.2, -1.1, 0.17, 0.26, 0.015, { col: black }); }
    beam(ch, [-0.58, 0.36, -1.33], [0.58, 0.36, -1.33], 0.045, 0.045, chrome, unitCyl); for (const sx of [-1, 1]) beam(ch, [sx * 0.5, 0.36, -1.33], [sx * 0.5, 0.36, -1.24], 0.03, 0.03, chrome);
    plateQuad(mb, 0, 0.55, -1.27, 0.17, 0.06, false, variant); plateQuad(mb, 0, 0.652, 1.237, 0.11, 0.042, true, variant); // front plate low on the shield face, under the headlamp
    // front fork + mudguard + handlebar with grips + speedo
    beam(ch, [0, R, 1.0], [0, 0.85, 0.92], 0.05, 0.05, C('#2a2a2a'), unitCyl);
    loft(paint, [[0.78, R * 2 + 0.02, R * 2 + 0.06, 0.09, 0.09, 0.02], [1.0, R * 2 + 0.06, R * 2 + 0.1, 0.09, 0.09, 0.02], [1.22, R * 1.6, R * 1.6 + 0.04, 0.09, 0.09, 0.02]], col);
    beam(ch, [-0.32, 1.06, 0.62], [0.32, 1.06, 0.62], 0.025, 0.025, chrome, unitCyl); for (const sx of [-1, 1]) beam(rubber, [sx * 0.28, 1.06, 0.62], [sx * 0.38, 1.06, 0.62], 0.04, 0.04, black, unitCyl);
    part(mb.get('interior'), unitCyl, [0, 1.1, 0.6], [-1.1, 0, 0], [0.06, 0.03, 0.06], C('#202020')); beam(ch, [0, 1.06, 0.62], [0, 0.98, 0.7], 0.03, 0.03, C('#2a2a2a'), unitCyl); // speedo + steering column into the shield
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
  if (type === 'bike' || T.bike) { // every two-wheeler is built from real parts in BikeModels.js (the generic 'bike' = an everyday commuter)
    const r = buildBike(mb, dm, BKIT, T.bike || null, col, variant); seats.push(...r.seats); wheelStyle = r.wheelStyle;
    return out(r.wheels, r.steerWheel);
  }

  // =============================================================== BUSES (SLTB red + private)
  if (type === 'bus' || type === 'pbus') {
    const red = type === 'bus'; const sill = 0.42, belt = 1.5, winTop = H - 0.32; const stripe = red ? C('#e8b820') : C(variant % 2 ? '#d43a2a' : '#e8a020');
    const wf = L / 2 - 2.0, wr = -L / 2 + 2.6; wheelStyle = 1;
    // kerb-side (+x) doorways: real openings (body side + window band cut away), two-leaf folding doors on hinges, stairwell steps
    const doorZ = [L / 2 - 1.05, -0.6], BD = doorZ.map((z) => [z - 0.475, z + 0.475]);
    const solid = (z0, z1, m = 0) => { const out = []; let a = z0; for (const [p, q] of BD.slice().sort((u, v) => u[0] - v[0])) { if (q + m < a || p - m > z1) continue; if (p - m > a) out.push([a, p - m]); a = q + m; } if (a < z1) out.push([a, z1]); return out; }; // z spans of the kerb side between the doorways
    sideBody(paint, [[L / 2, 0.45], [L / 2 + 0.02, 1.2], [L / 2 - 0.02, belt], [-L / 2 + 0.04, belt], [-L / 2, 1.3], [-L / 2, 0.45]], sill, [[wf, R], [wr, R]], W, col,
      { taper: (z, y) => 1 - 0.035 * sstep(L / 2 - 0.4, L / 2, z) - 0.03 * sstep(-L / 2 + 0.4, -L / 2, z), bevel: 0.08, openTop: [-L / 2 - 0.2, L / 2 + 0.2, 1.3], cut: BD.map(([a, b]) => ({ side: 1, rects: [[a, b, sill - 0.05, 9]], z0: a, z1: b, yTop: sill - 0.1 })) });
    // window band (glass) with pillars, roof with rounded edges and hatches (no glass where the doors are, a transom pane over them)
    loft(glass, [-L / 2 + 0.06, BD[1][0], BD[1][1], BD[0][0], BD[0][1], L / 2 - 0.25].map((z) => [z, belt, winTop, W - 0.04, W - 0.06, 0.04]), C('#fff'), { noBottom: true, skip: (i, k) => (i === 1 || i === 3) && k >= 1 && k <= 4 });
    for (const [a, b] of BD) { glass.quad([W - 0.04, 2.6, a], [W - 0.04, 2.6, b], [W - 0.05, winTop, b], [W - 0.05, winTop, a], [0, 0, 1, 1], C('#fff'));
      rubber.box(W - 0.035, 2.575, (a + b) / 2, 0.07, 0.07, b - a + 0.08, { col: C('#1a1a1a') }); for (const z of [a - 0.02, b + 0.02]) rubber.box(W - 0.035, (sill + 2.6) / 2, z, 0.07, 2.6 - sill, 0.04, { col: C('#1a1a1a') });
      for (const [y, x0, x1] of BUS_STEPS(W)) { rubber.box((x0 + x1) / 2, y - 0.02, (a + b) / 2, x1 - x0, 0.04, b - a, { col: C('#2a2a2a') }); ch.box(x1 - 0.015, y + 0.002, (a + b) / 2, 0.03, 0.012, b - a - 0.02, { col: C('#9a9ea2') }); } // treads with alloy nosing (outer edge)
      for (const [y0, y1, x] of [[0.43, 0.67, W - 0.32], [0.67, 0.9, W - 0.6]]) rubber.box(x - 0.01, (y0 + y1) / 2, (a + b) / 2, 0.02, y1 - y0, b - a, { col: C('#222') }); // risers
      for (const z of [a + 0.05, b - 0.05]) beam(ch, [W - 0.1, 0.5, z], [W - 0.1, 2.2, z], 0.018, 0.018, C('#b0b4b8'), unitCyl); } // grab poles either side
    loft(paint, [[-L / 2 + 0.02, winTop, H, W - 0.02, W - 0.16, 0.24], [L / 2 - 0.2, winTop, H, W - 0.02, W - 0.16, 0.24]], red ? C('#7c1414') : col);
    for (const z of [-2.2, 1.0]) part(paint, unitBox, [0, H + 0.04, z], [0, 0, 0], [0.8, 0.08, 0.7], C('#d8d8d4'));
    // front: raked windscreen in two panes, destination board, wipers, grille, headlamps, big bumper
    const fz = L / 2; glass.quad([-W + 0.08, belt - 0.15, fz + 0.02], [W - 0.08, belt - 0.15, fz + 0.02], [W - 0.1, winTop, fz - 0.2], [-W + 0.1, winTop, fz - 0.2], [0, 0, 1, 1], C('#fff'));
    beam(rubber, [0, belt - 0.15, fz + 0.03], [0, winTop, fz - 0.19], 0.06, 0.05, black); for (const sx of [-1, 1]) beam(paint, [sx * (W - 0.05), belt - 0.15, fz + 0.01], [sx * (W - 0.07), winTop, fz - 0.2], 0.1, 0.1, col);
    loft(paint, [[fz - 0.2, winTop, H - 0.02, W - 0.04, W - 0.16, 0.2], [fz, winTop + 0.02, H - 0.06, W - 0.08, W - 0.2, 0.16]], col);
    { const rk = variant % ROUTES.length, rb = mb.get('route'); rb.quad([-0.95, winTop + 0.05, fz + 0.012], [0.95, winTop + 0.05, fz + 0.012], [0.95, H - 0.1, fz + 0.012], [-0.95, H - 0.1, fz + 0.012], routeUV(rk)); // on the header's front face (it used to sit inside the header block, invisible)
      // kerb-side board over the front door window band, and the route number high on the back
      const sy0 = winTop + 0.04, sy1 = H - 0.1, sz = L / 2 - 1.0, sx = W - 0.005; rb.quad([sx, sy0, sz], [sx, sy0, sz - 1.7], [sx, sy1, sz - 1.7], [sx, sy1, sz], routeUV(rk));
      const ry0 = H - 0.46, ry1 = H - 0.1, rz = -L / 2 - 0.035; rb.quad([0.21, ry0, rz], [-0.21, ry0, rz], [-0.21, ry1, rz], [0.21, ry1, rz], routeUV(rk, true)); }
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
      for (const [a, b] of sx > 0 ? solid(-L / 2 + 0.25, L / 2 - 0.25, 0.04) : [[-L / 2 + 0.25, L / 2 - 0.25]]) { paint.box(sx * (W + 0.006), belt - 0.22, (a + b) / 2, 0.012, 0.14, b - a, { col: stripe }); paint.box(sx * (W + 0.006), 0.78, (a + b) / 2, 0.012, 0.08, b - a, { col: red ? C('#f2f2ee') : C('#1a3a8a') }); }
      for (let z = -L / 2 + 0.6; z < L / 2 - 0.3; z += 1.18) if (sx < 0 || !BD.some(([a, b]) => z + 0.6 > a - 0.05 && z < b + 0.05)) beam(rubber, [sx * (W - 0.03), (belt + winTop) / 2 + 0.05, z], [sx * (W - 0.03), (belt + winTop) / 2 + 0.05, z + 0.6], 0.012, 0.02, C('#3a3a3a'));
      for (const [a, b] of sx > 0 ? solid(-L / 2 + 0.1, L / 2 - 0.1, 0.04) : [[-L / 2 + 0.1, L / 2 - 0.1]]) beam(rubber, [sx * (W + 0.005), belt, a], [sx * (W + 0.005), belt, b], 0.02, 0.03, C('#111'));
    }
    // folding doors: two dark glazed leaves per doorway, each hinged at its jamb and folding in against it (DoorRig poses them)
    for (const dz of doorZ) for (const s of [1, -1]) doors.push({ side: 1, role: 'leaf', leaf: s, mirror: false, hinge: [W - 0.01, dz + s * 0.475], len: 0.478, spec: null });
    // interior: rows of seats seen through the windows, driver seat + flat steering wheel
    const I = mb.get('interior'); I.box(-0.28, 0.9, 0, W * 2 - 0.68, 0.04, L - 0.3, { col: C('#3a3a38') }); // floor (the stairwells cut out of its kerb edge)
    for (const [a, b] of solid(-L / 2 + 0.15, L / 2 - 0.15)) { I.box(W - 0.34, 0.9, (a + b) / 2, 0.56, 0.04, b - a, { col: C('#3a3a38') }); I.box(W - 0.07, (0.92 + belt) / 2, (a + b) / 2, 0.03, belt - 0.92, b - a, { col: C('#6a6a66') }); }
    I.box(-(W - 0.07), (0.92 + belt) / 2, 0, 0.03, belt - 0.92, L - 0.3, { col: C('#6a6a66') }); I.box(0, H - 0.12, 0, W * 2 - 0.12, 0.03, L - 0.3, { col: C('#d8d8d0') }); I.box(0, (0.92 + belt) / 2, -L / 2 + 0.2, W * 2 - 0.12, belt - 0.92, 0.03, { col: C('#6a6a66') });
    const rowZ = [];  for (let z = -L / 2 + 1.2; z < L / 2 - 2.2; z += 0.85) for (const sx of [-1, 1]) { if (sx > 0 && Math.abs(z + 0.6) < 0.7) continue; rowZ.push([sx, z]); part(I, unitBox, [sx * (W - 0.5), 1.3, z], [0, 0, 0], [0.85, 0.12, 0.45], C(red ? '#3a4a6a' : '#6a2a2a')); part(I, unitBox, [sx * (W - 0.5), 1.62, z - 0.22], [-0.12, 0, 0], [0.85, 0.6, 0.08], C(red ? '#3a4a6a' : '#6a2a2a')); part(I, unitCyl, [sx * (W - 0.12), 1.95, z], [0, 0, 0], [0.02, 0.9, 0.02], C('#b0b4b8')); }
    part(I, unitBox, [0, 1.3, fz - 0.35], [0, 0, 0], [W * 2 - 0.1, 0.3, 0.4], C('#2a2a2a')); I.box(0, 1.0, fz - 0.2, W * 2 - 0.1, 0.2, 0.12, { col: C('#222') }); seat(mb, -0.75, 1.3, fz - 1.2, 0.5, C('#2a2a2a'));
    const bw = { p: [-0.75, 1.74, fz - 0.66], r: 0.24, tilt: 1.1 }; steering(mb, bw.p, bw.r, bw.tilt);
    seats.push({ x: -0.75, y: 1.36, z: fz - 1.2, floor: 0.92, fz: 0.56, fx: 0.13, roof: H - 0.14, lean: -0.06, hands: 'wheel', wheel: bw, kind: 'drive', driver: true, exit: [W + 0.6, L / 2 - 1.05] });
    for (const [sx, z] of rowZ) for (const o of [-0.21, 0.21]) seats.push({ x: sx * (W - 0.5) + o, y: 1.36, z, floor: 0.92, fz: 0.42, fx: 0.11, roof: H - 0.14, lean: -0.05, hands: 'lap', kind: 'sit', bus: true, exit: [W + 0.6, z > 1.2 ? L / 2 - 1.05 : -0.6] });
    heavyDetail(dm, KIT, { L, W, H, R, kind: 'bus', belt, winTop, wf, wr, doorZ });
    return out([[-W + 0.22, R, wf, 0.3], [W - 0.22, R, wf, 0.3], [-W + 0.26, R, wr, 0.46], [W - 0.26, R, wr, 0.46]], [-0.75, 1.45, fz - 0.72], { busDoor: [W + 0.6, L / 2 - 1.05] });
  }

  // =============================================================== LORRY (cab-over truck with drop-side bed)
  if (type === 'lorry') {
    const cabL = 1.95; const cz = L / 2 - cabL / 2; const wf = L / 2 - 1.15, wr = -L / 2 + 1.55; wheelStyle = 1;
    // cab doors (both sides): real hinged doors on the A-pillar, notched over the front wheel arch, with their own window in the
    // cab's glass plane; a tread hangs under the front part (in front of the wheel) and a grab handle sits on the A-pillar
    const czF = L / 2 - 0.16, czR = L / 2 - cabL + 0.64, czN = wf + R + 0.1, archY = R + (R + 0.07) + 0.04; const gA = [L / 2 - cabL + 0.05, 1.8, 2.66, W - 0.05, W - 0.12, 0.05], gB = [L / 2 - 0.12, 1.8, 2.6, W - 0.06, W - 0.14, 0.05];
    const gAt = (z) => { const t = (z - gA[0]) / (gB[0] - gA[0]); return gA.map((a, i) => (i === 0 ? z : lerp(a, gB[i], t))); };
    sideBody(paint, [[L / 2, 0.62], [L / 2 + 0.02, 1.75], [L / 2 - 0.04, 1.82], [L / 2 - cabL, 1.82], [L / 2 - cabL, 0.62]], 0.62, [[wf, R]], W, col, { bevel: 0.07, openTop: [L / 2 - cabL + 0.06, L / 2 - 0.1, 1.2], cut: [-1, 1].map((side) => ({ side, rects: [[czN, czF, 0.55, 9], [czR, czN, archY, 9]], z0: czR, z1: czF, yTop: 1.5 })) });
    loft(glass, [gA, gAt(czR), gAt(czF), gB], C('#fff'), { noBottom: true, skip: (i, k) => i === 1 && ((k >= 1 && k <= 4) || k >= 6) });
    for (const side of [-1, 1]) doors.push({ side, role: 'front', mirror: false, hinge: [side * W, czF], len: czF - czR, max: 1.6, gripY: 1.62, spec: null,
      cab: { rects: [[czN, czF, 0.62], [czR, czN, archY]], belt: 1.82, win: [gAt(czR + 0.03), gAt(czF - 0.03)].map((q) => q.slice(0, 5)), W, col, trim: C('#3a3a3a') } });
    const cabStep = { y: 0.4, z0: czN + 0.06, z1: czF - 0.05, out: 0.32, sx: W + 0.16, handle: [W + 0.06, 1.78, L / 2 - 0.075], yaw: 1.0, kneeIn: 0.25 }; // the tread sits right behind the hinge: the climber faces further into the cab and the stepping knee turns in a little (clear of the open door)
    for (const sx of [-1, 1]) { rubber.box(sx * (W + cabStep.out / 2 - 0.02), cabStep.y - 0.02, (cabStep.z0 + cabStep.z1) / 2, cabStep.out + 0.04, 0.04, cabStep.z1 - cabStep.z0, { col: C('#2a2a2a') }); // tread (chequer plate)
      for (const z of [cabStep.z0 + 0.03, cabStep.z1 - 0.03]) rubber.box(sx * (W + 0.05), (cabStep.y + 0.62) / 2, z, 0.03, 0.62 - cabStep.y, 0.03, { col: C('#1a1a1a') }); // hangers
      beam(ch, [sx * (W + 0.045), 1.45, L / 2 - 0.07], [sx * (W + 0.045), 2.25, L / 2 - 0.08], 0.016, 0.016, C('#b0b4b8'), unitCyl); for (const y of [1.45, 2.25]) ch.box(sx * (W + 0.02), y, L / 2 - 0.075, 0.05, 0.02, 0.02, { col: C('#888') }); } // grab handle on the A-pillar
    loft(paint, [[L / 2 - cabL + 0.02, 2.6, 2.86, W - 0.04, W - 0.16, 0.12], [L / 2 - 0.1, 2.55, 2.84, W - 0.06, W - 0.18, 0.12]], col);
    for (const sx of [-1, 1]) { beam(paint, [sx * (W - 0.06), 1.8, L / 2 - 0.1], [sx * (W - 0.1), 2.55, L / 2 - 0.12], 0.08, 0.1, col); beam(paint, [sx * (W - 0.05), 1.8, L / 2 - cabL + 0.6], [sx * (W - 0.1), 2.62, L / 2 - cabL + 0.6], 0.06, 0.08, col); }
    glass.quad([-W + 0.1, 1.85, L / 2 + 0.025], [W - 0.1, 1.85, L / 2 + 0.025], [W - 0.12, 2.52, L / 2 - 0.1], [-W + 0.12, 2.52, L / 2 - 0.1], [0, 0, 1, 1], C('#fff'));
    for (let i = 0; i < 4; i++) ch.box(0, 1.0 + i * 0.1, L / 2 + 0.03, 1.2, 0.04, 0.02, { col: C('#2a2a2a') });
    for (const sx of [-1, 1]) { part(lights, unitBox, [sx * (W - 0.3), 0.95, L / 2 + 0.03], [0, 0, 0], [0.32, 0.18, 0.02]); ind.box(sx * (W - 0.08), 0.95, L / 2 + 0.03, 0.1, 0.16, 0.02); beam(ch, [sx * (W - 0.02), 2.3, L / 2 - 0.08], [sx * (W + 0.25), 2.2, L / 2 + 0.05], 0.025, 0.025, black, unitCyl); part(paint, unitBox, [sx * (W + 0.27), 2.0, L / 2 + 0.06], [0, 0, 0], [0.08, 0.36, 0.05], black); }
    rubber.box(0, 0.62, L / 2 + 0.07, W * 2 + 0.04, 0.26, 0.14, { col: C('#2a2a2a') }); plateQuad(mb, 0, 0.62, L / 2 + 0.145, 0.22, 0.06, true, variant);
    // chassis, bed, drop sides with planks, tarp, fuel tank, mudflaps, spare
    rubber.box(0, 0.62, -cabL / 2 + 0.1, 1.0, 0.22, L - cabL + 0.2, { col: C('#1d1d1d') });
    if (opts.tow) { // wrecker body instead of the cargo bed
      const steel = C('#3a3c40'), yel = col;
      paint.box(0, 0.88, -0.5, W * 2 - 0.1, 0.1, 4.2, { col: steel }); // equipment deck
      for (const sx of [-1, 1]) { paint.box(sx * (W - 0.28), 1.18, 0.85, 0.52, 0.5, 1.3, { col: yel }); ch.box(sx * (W - 0.02), 1.3, 0.85, 0.01, 0.03, 1.1, { col: C('#888') }); } // lockers
      for (const sx of [-1, 1]) beam(paint, [sx * 0.62, 0.95, -0.9], [sx * 0.12, 2.75, -2.3], 0.09, 0.09, yel); // A-frame
      beam(paint, [0, 1.15, -0.2], [0, 2.95, -3.05], 0.2, 0.16, yel); // boom
      part(ch, unitCyl, [0, 1.15, -0.55], [0, 0, Math.PI / 2], [0.16, 0.7, 0.16], C('#2a2a2a')); // winch drum
      beam(ch, [0, 2.95, -3.05], [0, 1.25, -3.35], 0.012, 0.012, C('#1a1a1a'), unitCyl); ch.box(0, 1.2, -3.35, 0.06, 0.12, 0.04, { col: C('#555') }); // cable + hook
      rubber.box(0, 0.52, -L / 2 - 0.35, 0.24, 0.14, 1.0, { col: C('#2a2a2a') }); rubber.box(0, 0.42, -L / 2 - 0.85, 1.7, 0.1, 0.16, { col: C('#2a2a2a') }); // wheel-lift arm + crossbar
      for (const sx of [-1, 1]) { rubber.box(sx * 0.72, 0.42, -L / 2 - 0.85, 0.08, 0.1, 0.5, { col: C('#2a2a2a') }); for (let i = 0; i < 4; i++) paint.box(sx * (W - 0.03), 1.0 + i * 0.12, -L / 2 + 0.35 + i * 0.001, 0.05, 0.06, 0.5, { col: i % 2 ? C('#b51f1f') : C('#f2f2f0') }); } // forks; chevrons on the tail posts
      paint.box(0, 1.0, -L / 2 + 0.05, W * 2, 0.22, 0.05, { col: steel }); // tail beam
    } else {
    paint.box(0, 0.86, -cabL / 2, W * 2, 0.12, L - cabL - 0.1, { col: C('#3a2a1e') });
    const side = C(variant % 2 ? '#c49a3a' : '#3a5a8a'); const bedL = L - cabL - 0.1, bz = -cabL / 2;
    for (const sx of [-1, 1]) { for (let i = 0; i < 4; i++) paint.box(sx * (W - 0.03), 1.04 + i * 0.25, bz, 0.05, 0.22, bedL, { col: side }); for (let z = bz - bedL / 2 + 0.3; z < bz + bedL / 2; z += 1.0) ch.box(sx * (W - 0.0), 1.42, z, 0.03, 0.95, 0.06, { col: C('#555') }); }
    for (let i = 0; i < 4; i++) paint.box(0, 1.04 + i * 0.25, -L / 2 + 0.05, W * 2, 0.22, 0.05, { col: side });
    loft(mb.get('canvas'), [[-L / 2 + 0.05, 1.95, 2.35, W, W - 0.2, 0.3], [L / 2 - cabL - 0.05, 1.95, 2.4, W, W - 0.2, 0.3]], C('#2f5a3a'));
    }
    part(ch, unitCyl, [-W + 0.25, 0.6, 0.4], [Math.PI / 2, 0, 0], [0.22, 0.8, 0.22], C('#a0a4a8'));
    for (const sx of [-1, 1]) { rubber.box(sx * (W - 0.25), 0.35, wr - 0.75, 0.4, 0.45, 0.02, { col: black }); tails.box(sx * (W - 0.2), 0.8, -L / 2 - 0.01, 0.2, 0.15, 0.04); ind.box(sx * (W - 0.42), 0.8, -L / 2 - 0.01, 0.16, 0.12, 0.04); }
    plateQuad(mb, 0, 0.75, -L / 2 - 0.02, 0.22, 0.06, false, variant);
    const I = mb.get('interior'); part(I, unitBox, [0, 1.75, L / 2 - 0.35], [0, 0, 0], [W * 2 - 0.15, 0.25, 0.35], C('#2a2a2a')); seat(mb, -0.55, 1.15, L / 2 - 0.95, 0.55, C('#3a3a3a')); seat(mb, 0.4, 1.15, L / 2 - 0.95, 0.8, C('#3a3a3a'));
    I.box(0, 0.79, cz, W * 2 - 0.12, 0.04, cabL - 0.1, { col: C('#2a2a2a') }); for (const sx of [-1, 1]) I.box(sx * (W - 0.07), 1.3, (L / 2 - cabL + 0.1 + czR) / 2, 0.03, 1.0, czR - (L / 2 - cabL + 0.1), { col: C('#4a4a48') }); // behind the door (the door carries its own trim) I.box(0, 2.56, cz, W * 2 - 0.12, 0.03, cabL - 0.1, { col: C('#bdbdb5') }); I.box(0, 1.7, L / 2 - cabL + 0.06, W * 2 - 0.12, 1.8, 0.03, { col: C('#4a4a48') });
    const lw = { p: [-0.55, 1.76, L / 2 - 0.6], r: 0.22, tilt: 0.65 }; steering(mb, lw.p, lw.r, lw.tilt);
    seats.push({ x: -0.55, y: 1.21, z: L / 2 - 0.95, floor: 0.81, fz: 0.5, fx: 0.13, roof: 2.54, lean: -0.1, hands: 'wheel', wheel: lw, kind: 'drive', driver: true, exit: [-W - 0.6, L / 2 - 0.9] },
      { x: 0.45, y: 1.21, z: L / 2 - 0.95, floor: 0.81, fz: 0.5, fx: 0.13, roof: 2.54, lean: -0.12, hands: 'lap', kind: 'sit', exit: [W + 0.6, L / 2 - 0.9] });
    heavyDetail(dm, KIT, { L, W, H, R, kind: 'lorry', belt: 1.8, winTop: 2.6, wf, wr, cabDoor: [czR, czF] });
    return out([[-W + 0.22, R, wf, 0.3], [W - 0.22, R, wf, 0.3], [-W + 0.26, R, wr, 0.46], [W - 0.26, R, wr, 0.46]], [-0.55, 1.76, L / 2 - 0.6], { cabStep });
  }

  // =============================================================== CAB-OVER TRUCKS (catalogue: 4-wheel mini truck, 3-tonne light truck)
  if (T.truck) {
    const tr = T.truck; wheelStyle = 1; const I = mb.get('interior'); const badgeB = mb.get('badge');
    const cw = tr.cabW, fzc = L / 2, cr = fzc - tr.cabL, sC = tr.floor - 0.16, wf = tr.wf, wr = tr.wr, belt = tr.belt, roof = tr.roof, wsT = tr.wsTop;
    const zW = fzc - tr.nose, zT = zW - tr.wsRake; const g0 = cw - 0.04, g1 = cw - 0.09;
    const FP = [[fzc - 0.015, sC], [fzc, sC + 0.3], [fzc - tr.nose * 0.6, belt - 0.12], [zW, belt]];
    const fZ = (y) => { for (let i = 0; i < FP.length - 1; i++) { const a = FP[i], b = FP[i + 1]; if (y >= a[1] && y <= b[1]) return lerp(a[0], b[0], (y - a[1]) / ((b[1] - a[1]) || 1)); } return y < sC ? FP[0][0] : zW; };
    // cab shell (front wheel arch cut into the cab sides), glass house, roof cap, rear panel with a small window
    // real hinged doors (both sides) between the B-pillar and the raked A-pillar: panel up to the belt, the window follows the
    // A-pillar rake; hinged at the front; the high cab-over (floor > 0.7) gets a tread ahead of the front wheel + a grab handle
    const zA = zW - 0.06, zB = cr + 0.12, db = Math.max(sC + 0.04, 2 * R + 0.12), zN = wf + R + 0.1, notch = tr.floor > 0.7 && zN < zA - 0.3, dR = notch ? [[zN, zA, sC + 0.04], [zB, zN, db]] : [[zB, zA, db]], skX = (z) => cw * (1 - 0.035 * sstep(fzc - 0.3, fzc + 0.02, z));
    const SG = [[zW, belt, belt + 0.02], [(zW + zT) / 2, belt, (belt + wsT) / 2 + 0.01], [zT, belt, wsT], [cr + 0.06, belt, wsT - 0.01], [cr + 0.035, belt, wsT - 0.04]].map(([z, y0, y1]) => [z, y0, y1, g0, g1, 0.04]);
    const sgAt = (z) => { for (let i = 0; i < SG.length - 1; i++) { const a = SG[i], b = SG[i + 1]; if (z <= a[0] && z >= b[0]) { const t = (a[0] - z) / (a[0] - b[0]); return a.map((v, k) => (k === 0 ? z : lerp(v, b[k], t))); } } return SG[SG.length - 1]; };
    const SG2 = [...SG.filter((q) => q[0] > zA + 0.005), sgAt(zA), ...SG.filter((q) => q[0] < zA - 0.005 && q[0] > zB + 0.005), sgAt(zB), ...SG.filter((q) => q[0] < zB - 0.005)]; const iA = SG2.findIndex((q) => q[0] === zA), iB = SG2.findIndex((q) => q[0] === zB);
    sideBody(paint, [...FP, [cr + 0.02, belt], [cr, sC]], sC, [[wf, R]], cw, col, { bevel: 0.06, taper: (z) => 1 - 0.035 * sstep(fzc - 0.3, fzc + 0.02, z), openTop: [cr + 0.06, zW - 0.04, belt - 0.25], cut: [-1, 1].map((side) => ({ side, rects: dR.map((r) => [r[0], r[1], r[2], 9]), z0: zB, z1: zA, yTop: belt - 0.1 })) });
    loft(glass, SG2, C('#fff'), { noBottom: true, skip: (i, k) => i >= iA && i < iB && ((k >= 1 && k <= 4) || k >= 6) });
    // door window outline: the top edge stays a pillar's width (~6 cm square to it) clear of the raked A-pillar beam and of the
    // roof edge; columns at the kinks of that line, the front one where the window is still 8 cm tall
    const topY = (z) => Math.min(sgAt(Math.min(z + 0.085, zW))[2] - 0.02, sgAt(z)[2] - 0.065); let zf = zA - 0.03; while (zf > zB + 0.3 && topY(zf) < belt + 0.08) zf -= 0.005;
    const dWin = [...new Set([zB + 0.03, ...SG.map((q) => q[0] - 0.085).filter((z) => z > zB + 0.06 && z < zf - 0.03), zf])].map((z) => { const q = sgAt(z); return [z, q[1], topY(z), q[3], q[4]]; }); const hi = tr.floor > 0.7;
    for (const side of [-1, 1]) doors.push({ side, role: 'front', mirror: false, hinge: [side * skX(zA), zA], len: zA - zB, max: hi ? 1.45 : 1.15, gripY: belt - 0.1, spec: null,
      cab: { rects: dR, belt, win: dWin, inset: 0, W: cw, tp: [fzc - 0.3, fzc + 0.02, 0.035], col, trim: C('#3a3a3a') } });
    const pz = (y) => zW - (zW - zT) * (y - belt) / (wsT - belt); // A-pillar z at height y
    const cabStep = hi ? { y: Math.round((sC + 0.02) * 0.66 * 100) / 100, z0: wf + R + 0.12, z1: zA - 0.05, out: 0.32, sx: cw + 0.17, handle: [cw - 0.16, belt + 0.27, pz(belt + 0.27) - 0.09] } : null;
    loft(paint, [[cr + 0.015, wsT - 0.03, roof, g1 + 0.014, g1 - 0.03, 0.08], [zT + 0.03, wsT - 0.03, roof - 0.015, g1 + 0.014, g1 - 0.03, 0.08]], col);
    { const z = cr + 0.02, wy0 = belt + 0.12, wy1 = Math.min(wsT - 0.08, belt + 0.38), hx = 0.32; paint.box(0, (belt + wy0) / 2, z, g0 * 2, wy0 - belt, 0.03, { col }); paint.box(0, (wy1 + wsT) / 2, z, g0 * 2, wsT - wy1, 0.03, { col }); for (const sx of [-1, 1]) paint.box(sx * (hx + g0) / 2, (wy0 + wy1) / 2, z, g0 - hx, wy1 - wy0, 0.03, { col }); }
    for (const sx of [-1, 1]) {
      beam(paint, [sx * (g0 + g1) / 2, belt + 0.01, zW], [sx * g1, wsT, zT], 0.06, 0.07, col); beam(paint, [sx * g0, belt, cr + 0.05], [sx * g1, wsT, cr + 0.05], 0.06, 0.06, col);
      if (cabStep) { const cs = cabStep; rubber.box(sx * (cw + cs.out / 2 - 0.02), cs.y - 0.02, (cs.z0 + cs.z1) / 2, cs.out + 0.04, 0.04, cs.z1 - cs.z0, { col: C('#2a2a2a') }); // tread
        for (const z of [cs.z0 + 0.03, cs.z1 - 0.03]) rubber.box(sx * (cw + 0.04), (cs.y + sC + 0.02) / 2, z, 0.03, sC + 0.02 - cs.y, 0.03, { col: C('#1a1a1a') }); // hangers
        const h = cs.handle; beam(ch, [sx * h[0], belt + 0.08, pz(belt + 0.08) - 0.09], [sx * (h[0] - 0.01), belt + 0.46, pz(belt + 0.46) - 0.09], 0.015, 0.015, C('#b0b4b8'), unitCyl); } // grab handle inside on the A-pillar
      part(ind, unitBox, [sx * (skX(zW - 0.01) + 0.004), belt - 0.15, zW - 0.01], [0, 0, 0], [0.012, 0.035, 0.05]);
      // truck mirrors on tubular arms
      beam(ch, [sx * (cw - 0.03), belt + 0.04, zW - 0.01], [sx * (cw + 0.2), belt + 0.12, zW - 0.05], 0.022, 0.022, black, unitCyl); part(paint, unitBox, [sx * (cw + 0.22), belt + 0.28, zW - 0.04], [0, 0, 0], [0.07, 0.3, 0.05], black);
      beam(rubber, [sx * 0.05, belt + 0.03, zW - 0.02], [sx * (g0 - 0.15), belt + 0.05, zW - 0.08], 0.012, 0.012, black); // wipers
    }
    // front face: lamps, grille, emblem, wordmark, bumper, plate
    const ly = tr.lamps === 'low' ? sC + 0.24 : sC + 0.36; const lz = fZ(ly) + 0.012;
    for (const sx of [-1, 1]) { const x = sx * (cw - 0.2); ch.box(x, ly, lz, 0.29, 0.15, 0.02, { col: C('#8d9196') }); lights.box(x, ly, lz + 0.016, 0.26, 0.12, 0.03); ind.box(sx * (cw - 0.035), ly, lz + 0.01, 0.06, 0.12, 0.03); }
    rubber.box(0, ly, lz + 0.004, 2 * (cw - 0.37), 0.13, 0.02, { col: C('#121214') }); for (let i = 0; i < 3; i++) ch.box(0, ly - 0.04 + i * 0.04, lz + 0.016, 2 * (cw - 0.39), 0.012, 0.012, { col: chrome });
    placeEmblem({ mb, T }, T.make, [0, belt - 0.1, fZ(belt - 0.1) + 0.02], 0.045, 1, 0.25);
    badgeText(badgeB, `b:${T.make}`, 0, belt - 0.24, fZ(belt - 0.24) + 0.01, 0.075, true);
    rubber.box(0, sC + 0.1, fzc + 0.04, cw * 2 + 0.04, 0.16, 0.12, { col: C('#2a2b2e'), bottom: true }); plateQuad(mb, 0, sC + 0.1, fzc + 0.102, 0.19, 0.05, true, variant);
    // chassis rails, deck / box body
    const dW = tr.deckW, dz0 = cr - 0.06, dz1 = -L / 2, dL = dz0 - dz1, dzc = (dz0 + dz1) / 2, dY = tr.deckY;
    for (const sx of [-1, 1]) rubber.box(sx * 0.4, R + 0.1, (cr + dz1) / 2, 0.08, 0.18, cr - dz1, { col: C('#1d1d1f'), bottom: true });
    const tarp = tr.deck === 'box' && variant % 2 === 1; const deck = tarp ? 'drop' : tr.deck;
    if (deck === 'box') { const al = C('#c9ccd0'), y1 = dY + tr.side;
      paint.box(0, (dY + y1) / 2, dzc, dW * 2, y1 - dY, dL, { col: al, bottom: true });
      for (const sx of [-1, 1]) for (let z = dz1 + 0.2; z < dz0 - 0.1; z += 0.42) ch.box(sx * (dW + 0.01), (dY + y1) / 2, z, 0.02, y1 - dY - 0.06, 0.04, { col: C('#aeb2b7') });
      for (const y of [dY + 0.02, y1 - 0.02]) for (const sx of [-1, 1]) ch.box(sx * (dW + 0.012), y, dzc, 0.03, 0.05, dL, { col: C('#9a9ea3') });
      seam(mb, (z, y) => 0, [[dz1 - 0.003, y1 - 0.05], [dz1 - 0.003, dY + 0.05]]); for (const sx of [-1, 1]) { beam(ch, [sx * dW * 0.45, dY + 0.1, dz1 - 0.02], [sx * dW * 0.45, y1 - 0.1, dz1 - 0.02], 0.018, 0.018, C('#8a8e93'), unitCyl); beam(ch, [sx * dW * 0.15, dY + 0.1, dz1 - 0.02], [sx * dW * 0.15, y1 - 0.1, dz1 - 0.02], 0.018, 0.018, C('#8a8e93'), unitCyl); }
      rubber.box(0, (dY + y1) / 2, dz1 - 0.008, 0.008, y1 - dY - 0.04, 0.004, { col: C('#151515') });
      badgeText(badgeB, `b:${T.make}`, 0, y1 - 0.3, dz0 + 0.004, 0.12, true);
    } else { const st = C(variant % 2 ? '#6d7277' : '#4a5a7a'), y1 = dY + 0.04 + tr.side;
      paint.box(0, dY, dzc, dW * 2, 0.06, dL, { col: C('#3a3026'), bottom: true });
      for (const sx of [-1, 1]) { paint.box(sx * (dW - 0.02), (dY + y1) / 2 + 0.02, dzc, 0.04, y1 - dY - 0.04, dL - 0.04, { col: st }); for (let z = dz1 + 0.35; z < dz0 - 0.1; z += 0.6) ch.box(sx * (dW + 0.005), (dY + y1) / 2 + 0.02, z, 0.02, y1 - dY - 0.06, 0.05, { col: C('#555a5f') }); rubber.box(sx * (dW + 0.004), dY + 0.06, dzc, 0.01, 0.02, dL - 0.1, { col: C('#151515') }); }
      paint.box(0, (dY + y1) / 2 + 0.02, dz1 + 0.02, dW * 2, y1 - dY - 0.04, 0.04, { col: st });
      paint.box(0, (dY + roof - 0.12) / 2, dz0 - 0.02, dW * 2, roof - 0.12 - dY, 0.05, { col: st }); // headboard
      for (let x = -dW + 0.12; x < dW; x += 0.16) ch.box(x, (y1 + roof - 0.12) / 2, dz0 - 0.05, 0.02, roof - 0.12 - y1, 0.02, { col: C('#3a3c40') });
      if (tarp) loft(mb.get('canvas'), [[dz1 + 0.02, y1, dY + tr.side + 0.15, dW + 0.01, dW - 0.15, 0.3], [dz0 - 0.04, y1, dY + tr.side + 0.18, dW + 0.01, dW - 0.15, 0.3]], C(variant === 1 ? '#2f5a8a' : '#2f5a3a'));
    }
    // rear: lamps on the cross member, plate, under-run bar, mudflaps, fuel tank
    const ry = dY - 0.13;
    rubber.box(0, ry, dz1 - 0.03, dW * 2 - 0.1, 0.12, 0.06, { col: C('#1d1d1f') });
    for (const sx of [-1, 1]) { tails.box(sx * (dW - 0.2), ry, dz1 - 0.065, 0.2, 0.09, 0.03); ind.box(sx * (dW - 0.06), ry, dz1 - 0.065, 0.07, 0.09, 0.03); mb.get('vrev').box(sx * (dW - 0.34), ry, dz1 - 0.065, 0.06, 0.07, 0.03); rubber.box(sx * (dW - 0.2), 0.32, wr - R - 0.12, 0.3, 0.38, 0.015, { col: black }); }
    plateQuad(mb, 0, ry, dz1 - 0.065, 0.2, 0.055, false, variant); rubber.box(0, 0.42, dz1 + 0.1, dW * 1.7, 0.08, 0.06, { col: C('#2a2a2c') });
    if (tr.dual) part(ch, unitCyl, [-(dW - 0.32), dY - 0.32, (wf + wr) / 2 - 0.4], [Math.PI / 2, 0, 0], [0.2, 0.7, 0.2], C('#a0a4a8'));
    // cab interior: floor, trims, headliner, rear wall, dashboard, seats, steering wheel
    const sz = cr + 0.42, sx0 = tr.sx; const seatY = tr.seatY;
    I.box(0, tr.floor, (cr + zW) / 2, g0 * 2 - 0.06, 0.03, zW - cr - 0.08, { col: C('#262628') });
    for (const sx of [-1, 1]) I.box(sx * (g0 - 0.03), (tr.floor + belt) / 2, (cr + 0.06 + zB) / 2, 0.025, belt - tr.floor, zB - cr - 0.06, { col: C('#4a4a48') }); // behind the door (it carries its own trim)
    I.box(0, roof - 0.05, (cr + zT) / 2, g1 * 2 - 0.06, 0.02, zT - cr - 0.04, { col: C('#bdbdb5') }); I.box(0, (tr.floor + belt) / 2, cr + 0.05, g0 * 2 - 0.06, belt - tr.floor, 0.025, { col: C('#3a3a3a') });
    part(I, unitBox, [0, belt - 0.06, zW - 0.2], [0, 0, 0], [g0 * 2 - 0.12, 0.2, 0.32], C('#2a2a2a'));
    I.box(0, (tr.floor + seatY) / 2, sz - 0.02, g0 * 2 - 0.1, seatY - tr.floor, 0.42, { col: C('#2c2c2e') }); // engine cover / seat base
    seat(mb, -sx0, seatY, sz, 0.46, C('#3a3a3a')); seat(mb, sx0, seatY, sz, 0.46, C('#3a3a3a'));
    const sw = [-sx0, seatY + 0.55, sz + 0.42]; steering(mb, sw, 0.18, 1.15); const whl = { p: sw, r: 0.18, tilt: 1.15 };
    const rf = Math.min(roof - 0.06, wsT + 0.05);
    seats.push({ x: -sx0, y: seatY + 0.06, z: sz, floor: tr.floor + 0.015, fz: 0.55, fx: 0.12, roof: rf, lean: -0.18, hands: 'wheel', wheel: whl, kind: 'drive', driver: true, exit: [-W - 0.6, sz] },
      { x: sx0, y: seatY + 0.06, z: sz, floor: tr.floor + 0.015, fz: 0.57, fx: 0.12, roof: rf, lean: -0.2, hands: 'lap', kind: 'sit', exit: [W + 0.6, sz] });
    const rw = tr.dual ? 0.44 : 0.2, rx = tr.dual ? dW - 0.24 : dW - 0.15;
    return out([[-cw + 0.17, R, wf, 0.2], [cw - 0.17, R, wf, 0.2], [-rx, R, wr, rw], [rx, R, wr, rw]], sw, { cabStep }); // driver climbs in on the driver's (right, −x) side
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
  // catalogue models (VehicleCatalog.js) bring their own profile, cabin layout and styling; the original generic types use P
  const SP = T.catalog ? T : null; const k = SP ? SP.family : type === 'taxi' ? 'car' : type; const D = SP ? SP.body : P[k];
  const isVan = SP ? (SP.upright ?? (k === 'suv' || k === 'van' || k === 'pickup')) : (k === 'van' || k === 'suv'); const S = SP ? SP.style : null; const cab = SP ? SP.cab : null;
  if (S && S.wheels) wheelStyle = S.wheels[variant % S.wheels.length];
  const fz = D.top[0][0], rz = D.top[D.top.length - 1][0]; const sill = D.sill;
  const [tpN, tpR, tpS] = SP && SP.tp ? SP.tp : [0.11, 0.08, isVan ? 0.02 : 0.045]; const beltY0 = D.gh[0][1];
  const taper = SP ? (z, y) => 1 - tpN * sstep(fz - 0.45, fz + 0.02, z) - tpR * sstep(rz + 0.35, rz - 0.02, z) - tpS * sstep(beltY0 - 0.3, beltY0 - 0.05, y) - 0.03 * sstep(sill + 0.14, sill + 0.02, y)
    : (z, y) => 1 - 0.11 * sstep(fz - 0.45, fz + 0.02, z) - 0.08 * sstep(rz + 0.35, rz - 0.02, z) - (isVan ? 0.02 : 0.045) * sstep(0.75, 1.0, y) - 0.03 * sstep(0.42, 0.3, y);
  // driver door aperture (−x side): the body side is really cut open there and the door is the missing piece of skin
  const bev = SP && SP.bevel !== undefined ? SP.bevel : isVan ? 0.06 : 0.07; const [d0, d1] = D.door; const archBack = D.wf - (R + 0.07) - 0.03, archTop = 2 * R + 0.1, notched = d0 > archBack, dy0 = sill + 0.06;
  const topAt = (z) => { const T2 = D.top; for (let i = 1; i < T2.length; i++) { const a = T2[i - 1], b = T2[i]; if (z <= a[0] && z >= b[0] && Math.min(a[1], b[1]) > sill + 0.3) return lerp(a[1], b[1], (a[0] - z) / (a[0] - b[0] || 1)); } return D.gh[0][1]; };
  const lipY = (z, t) => topAt(z) - 0.6 * bev + 0.6 * bev * Math.sin(t * Math.PI / 2); // same rounded shoulder as the extrusion bevel
  const skinPt = (z, y, t = 0) => [-(W - bev + bev * Math.cos(t * Math.PI / 2)) * taper(z, y), y, z];
  const prof = (z, yb, ny = 8) => { const o = []; for (let j = 0; j <= ny; j++) o.push(skinPt(z, lerp(yb, lipY(z, 0), j / ny))); for (let m = 1; m <= 3; m++) o.push(skinPt(z, lipY(z, m / 3), m / 3)); return o; };
  // door apertures: the front doors on both sides, the rear doors on both sides (four-door bodies) and the sliding door on the
  // kerb side (vans). Each is a set of vertical slabs (a door reaching over a wheel arch is notched round it) + its outline.
  const archFrontR = D.wr + (R + 0.07) + 0.03, gpD = 0.005;
  const aperture = (za, zb, nF, nR) => {
    const bz = (z, g) => (z === za || z === archBack ? z - g : z + g); const zs = [zb, ...(nR ? [archFrontR] : []), ...(nF ? [archBack] : []), za];
    const slabs = (g) => zs.slice(0, -1).map((z0, i) => { const z1 = zs[i + 1]; const hi = (nR && z0 === zb) || (nF && z1 === za); return [bz(z0, g), bz(z1, g), (hi ? archTop : dy0) + g]; });
    const path = (g) => { const o = [[bz(za, g), lipY(bz(za, g), 0)]]; if (nF) o.push([bz(za, g), archTop + g], [bz(archBack, g), archTop + g], [bz(archBack, g), dy0 + g]); else o.push([bz(za, g), dy0 + g]);
      if (nR) o.push([bz(archFrontR, g), dy0 + g], [bz(archFrontR, g), archTop + g], [bz(zb, g), archTop + g]); else o.push([bz(zb, g), dy0 + g]); o.push([bz(zb, g), lipY(bz(zb, g), 0)]); return o; };
    return { za, zb, nF, nR, apRects: slabs(0).map((r) => [...r, 9]), apPath: path(0), dRects: slabs(gpD), dPath: path(gpD), zF: za - gpD, zR: zb + gpD };
  };
  const apF = aperture(d0, d1, notched, false);
  const apR = D.rearDoor ? aperture(D.rearDoor[0], D.rearDoor[1], false, D.rearDoor[1] < archFrontR) : null;
  const apS = D.slide ? aperture(D.slide[0], D.slide[1], false, D.slide[1] < archFrontR) : null;
  const openings = [{ ap: apF, side: -1, role: 'front' }, { ap: apF, side: 1, role: 'front' }, ...(apR ? [{ ap: apR, side: -1, role: 'rear' }, { ap: apR, side: 1, role: 'rear' }] : []), ...(apS ? [{ ap: apS, side: 1, role: 'slide' }] : [])];
  const apRects = apF.apRects;
  // [za, zb] spans along one side outside every opening there (strips / bands / trims stop at the door gaps)
  const sideSpans = (sx, za, zb, pad = 0.005, minL = 0.02) => { let segs = [[za, zb]]; for (const o of openings) { if (o.side !== sx) continue; const lo = o.ap.zb - pad, hi = o.ap.za + pad; segs = segs.flatMap(([a, b]) => (b <= lo || a >= hi ? [[a, b]] : [[a, lo], [hi, b]].filter(([p, q]) => q - p > minL))); } return segs; };
  sideBody(paint, D.top, sill, [[D.wf, R], [D.wr, R]], W, col, { taper, bevel: bev, cut: openings.map(({ ap, side }) => ({ rects: ap.apRects, z0: ap.zb, z1: ap.za, yTop: Math.min(topAt(ap.za), topAt(ap.zb)) - 0.6 * bev - 0.01, side })), openTop: D.bed ? [[D.gh[D.gh.length - 1][0] + 0.03, D.gh[0][0] - 0.03, sill + 0.3], [D.bed.z1 + 0.03, D.bed.z0 + 0.005, D.bed.floor - 0.25]] : [D.gh[D.gh.length - 1][0] + 0.03, D.gh[0][0] - 0.03, sill + 0.3] }); const shapeOutline = sideOutline;
  // wheel-well liners (stop see-through above the tyres)
  for (const wz of [D.wf, D.wr]) for (const sx of [-1, 1]) part(rubber, linerCyl, [sx * (W - 0.24), R, wz], [0, 0, Math.PI / 2], [R + 0.06, 0.3, R + 0.06], C('#0c0c0c')); // open sleeve: no end caps covering the wheel face
  // greenhouse: tinted glass loft; half widths follow the tumblehome
  const gw0 = W * 0.9, gw1 = W * (SP && SP.tumble ? SP.tumble : isVan ? 0.86 : 0.76);
  // the driver-door window is cut out of the greenhouse (−x side between the door edges) and rebuilt on the door itself,
  // so the glass and its frame swing open with the door instead of a fixed pane staying behind / a frame poking out
  const ghAt = (z) => { const G = D.gh; for (let i = 1; i < G.length; i++) { const a = G[i - 1], b = G[i]; if (z <= a[0] && z >= b[0]) { const t = (a[0] - z) / (a[0] - b[0] || 1); return [z, lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; } } return [z, G[0][1], G[0][2]]; };
  // every door window is cut out of the greenhouse and rebuilt on its door (front windows start just behind the windscreen)
  const winZ = (o) => [o.role === 'front' ? Math.min(o.ap.za, D.gh[0][0] - 0.02) : o.ap.za, o.ap.zb];
  const cutZ = [...new Set(openings.flatMap((o) => winZ(o)))]; const inner = (z) => !cutZ.some((c) => Math.abs(c - z) < 1e-9);
  // SUVs / pickups: a section 30 cm ahead of the tailgate glass, where the D-pillar panel starts (behind the last door window)
  const dpZ = (k === 'suv' || k === 'pickup') && !(isVan && D.winTop) ? D.gh[D.gh.length - 1][0] + 0.3 : null; const winEnd = Math.min(...openings.map((o) => winZ(o)[1])); /* winZ = [front edge, rear edge] */
  const extraZ = dpZ !== null && dpZ < winEnd - 0.05 && !D.gh.some((g) => Math.abs(g[0] - dpZ) < 0.03) ? [dpZ] : [];
  const ghSecs = [...D.gh.filter((g) => inner(g[0])), ...cutZ.map(ghAt), ...extraZ.map(ghAt)].sort((a, b) => b[0] - a[0]);
  const secI = (z) => ghSecs.findIndex((g) => Math.abs(g[0] - z) < 1e-9);
  const wins = openings.map((o) => { const [a, b] = winZ(o); return { side: o.side, i0: secI(a), i1: secI(b) }; });
  const wTop = (z, y1) => (D.winTop && z < D.gh[2][0] - 0.01 ? Math.min(y1, D.winTop) : y1);
  const glassSecs = ghSecs.map(([z, y0, y1]) => [z, y0, wTop(z, y1), gw0 - 0.01, D.winTop ? lerp(gw0, gw1, (wTop(z, y1) - y0) / Math.max(0.01, y1 - y0)) : gw1, 0.05]);
  loft(glass, glassSecs, C('#fff'), { noBottom: true, skip: (i, k) => wins.some((w) => i >= w.i0 && i < w.i1 && (w.side < 0 ? k >= 7 : k >= 1 && k <= 3)) });
  const winGlass = (o) => { const w = wins[openings.indexOf(o)]; return glassSecs.slice(w.i0, w.i1 + 1).map(loftRing); }; // −x orientation (+x doors are mirrored copies)
  // roof panel + pillars (A, B, C) + belt trim
  const gh = D.gh; const roofF = gh[2], roofR = gh[gh.length - 2];
  const roofCol = S && S.twoTone ? (S.twoTone === 'v' ? (variant % 2 ? C('#151517') : col) : C(S.twoTone)) : col; const pilCol = S && S.blackPillars ? C('#101012') : roofCol;
  { const rs = gh.slice(2, gh.length - 1).reverse(); rs[0] = [rs[0][0] - 0.02, rs[0][1], rs[0][2]]; rs[rs.length - 1] = [rs[rs.length - 1][0] + 0.02, rs[rs.length - 1][1], rs[rs.length - 1][2]];
    loft(paint, rs.map(([z, , y]) => [z, y - 0.03, y + 0.025, gw1 + 0.01, gw1 - 0.06, 0.05]), roofCol); }
  if (D.winTop) { // painted upper body panels above the side windows (high-roof vans)
    const up = gh.slice(3, gh.length - 1).map(([z, y0, y1]) => [z, D.winTop - 0.015, y1 - 0.02, lerp(gw0, gw1, (D.winTop - y0) / Math.max(0.01, y1 - y0)) + 0.006, gw1 + 0.004, 0.04]).reverse();
    up.unshift([gh[gh.length - 1][0] - 0.005, D.winTop - 0.015, Math.min(gh[gh.length - 1][2], gh[gh.length - 2][2]) - 0.02, up[0][3], up[0][4], 0.04]); up.push([roofF[0] - 0.08, D.winTop - 0.015, roofF[2] + 0.0, gw0 * 0.93, gw1 + 0.004, 0.04]);
    loft(paint, up, col); }
  // C / D pillars: a painted panel over the glasshouse behind the last side window, 4 mm proud of the glass, on the same loft
  // rings (it follows the greenhouse curvature and the body shape field; no box beams). Saloons and hatches get the broad
  // sail panel from the last door window back; SUVs / pickups keep their rear quarter glass and get a D-pillar over the last
  // bay; vans keep their windows (box beams, as before).
  const sailPanel = !(isVan && (k === 'van' || D.winTop)); const lastSec = ghSecs.length - 1;
  const sailFrom = (sx) => { const e = Math.max(0, ...wins.filter((w) => w.side === sx).map((w) => w.i1)); return extraZ.length ? Math.max(e, secI(extraZ[0])) : k === 'suv' || k === 'pickup' || isVan ? Math.max(e, lastSec - 1) : e; };
  if (sailPanel) { const off = glassSecs.map(([z, y0, y1, w0, w1, r]) => [z, y0, y1 + 0.004, w0 + 0.004, w1 + 0.004, r]); const fL = sailFrom(-1), fR = sailFrom(1);
    loft(paint, off, pilCol, { noBottom: true, capFront: false, capBack: false, skip: (i, kk) => !((kk >= 6 && i >= fL) || (kk >= 1 && kk <= 4 && i >= fR)) }); }
  for (const sx of [-1, 1]) {
    // A-pillars: a flattened rounded strip along the windscreen / side-glass corner up to the roof
    const top = (i) => [sx * (i === 0 ? (gw0 + gw1) / 2 : gw1 - 0.01), gh[i][2] - 0.01, gh[i][0]];
    { const pa = []; for (let i = 0; i < 2; i++) for (let u = 0; u < 4; u++) { const a0 = top(i), a1 = top(i + 1); pa.push(a0.map((v, c) => v + (a1[c] - v) * u / 4)); } pa.push(top(2));
      const dz = gh[2][0] - gh[0][0], dy = gh[2][2] - gh[0][2], l = Math.hypot(dz, dy) || 1; const nWs = [0, -dz / l, dy / l];
      strip(paint, pa, () => [sx * 0.9, nWs[1] * 0.8 + 0.25, nWs[2] * 0.8], 0.085, 0.012, pilCol); }
    const nL = gh.length - 1; if (!sailPanel) { beam(paint, top(nL - 1), top(nL), isVan ? 0.07 : 0.1, 0.07, pilCol);
      beam(paint, [sx * gw0 * 0.94, gh[nL][1] + 0.02, gh[nL][0] + 0.1], top(nL), isVan ? 0.05 : 0.1, 0.07, pilCol); }
    /* with the sail panel, its own edge is the C-pillar (no strip standing off the rear glass) */
    { const yT = D.winTop ? Math.min(roofF[2] - 0.01, D.winTop - 0.005) : roofF[2] - 0.01; const o2 = openings.find((o) => o.side === sx && o.role !== 'front'); /* a rear / sliding door behind: the pillar fills only the gap between the two openings (it must not overhang the door that swings past it) */ const zc = o2 ? (apF.zb + o2.ap.za) / 2 : D.pillarsB, dz = o2 ? Math.max(0.012, apF.zb - o2.ap.za - 0.008) : 0.1;
      beam(paint, [sx * gw0, gh[0][1] + 0.02, zc], [sx * (gw1 + 0.005), yT, o2 ? zc : D.pillarsB - 0.03], 0.05, dz, C('#111')); } /* high-roof vans: the black pillar stops at the glass, not in the painted band */
    { const gL = gh[gh.length - 1], rl = (z) => [sx * (gw0 + 0.005), lerp(gh[0][1], gL[1], (gh[0][0] - z) / (gh[0][0] - gL[0])) + 0.005, z]; // outer belt weatherstrip (the driver door carries its own piece)
      for (const [za, zb] of sideSpans(sx, gL[0], gh[0][0], 0)) beam(rubber, rl(zb), rl(za), 0.012, 0.025, C('#111')); } // (each door carries its own piece)
    if (!SP && k === 'van') for (const z of [-0.9, -1.8]) beam(paint, [sx * gw0, 1.1, z], [sx * gw1, 1.93, z], 0.04, 0.08, col);
    if (cab && cab.vanPillars) for (const z of cab.vanPillars) { const g2 = ghAt(z); beam(paint, [sx * gw0, g2[1], z], [sx * (D.winTop ? lerp(gw0, gw1, (D.winTop - g2[1]) / (g2[2] - g2[1])) : gw1), wTop(z, g2[2]), z], 0.04, 0.08, col); }
  }
  // front: grille, headlamps with chrome bezels, indicators, bumper, plate, wipers, bonnet seam
  const fy = D.top[2][1], hy = D.top[3][1]; const nw = W * 0.86;
  if (S) for (const sx of [-1, 1]) { // styled models: lamps / grille / bumpers come from VehicleStyle; keep wipers + side repeaters here
    part(ind, unitBox, [sx * (W * taper(Math.min(D.wf + R + 0.12, fz - 0.14), gh[0][1] - 0.2) + 0.004), gh[0][1] - 0.2, Math.min(D.wf + R + 0.12, fz - 0.14)], [0, 0, 0], [0.01, 0.03, 0.06]);
    beam(rubber, [sx * 0.05, D.gh[0][1] + 0.03, D.gh[0][0] - 0.02], [sx * Math.min(0.55, gw0 - 0.12), D.gh[0][1] + 0.05, D.gh[0][0] - 0.1], 0.012, 0.012, black);
  }
  const ty = (D.top[D.top.length - 3][1] + D.top[D.top.length - 2][1]) / 2 - 0.05;
  if (!S) {
  part(rubber, unitBox, [0, (D.top[1][1] + fy) / 2 + 0.02, fz + 0.005], [0, 0, 0], [nw * 0.9, fy - D.top[1][1] - 0.02, 0.03], C('#141414'));
  for (let i = 0; i < 3; i++) ch.box(0, D.top[1][1] + 0.04 + i * 0.045, fz + 0.022, nw * 0.85, 0.012, 0.012, { col: chrome });
  for (const sx of [-1, 1]) {
    const hx = sx * (nw - 0.18); part(ch, unitBox, [hx, (fy + hy) / 2, fz - 0.07], [-0.5, 0, 0], [0.36, 0.13, 0.1], C('#9aa0a6')); part(lights, unitBox, [hx, (fy + hy) / 2 + 0.005, fz - 0.05], [-0.5, 0, 0], [0.32, 0.1, 0.1]);
    part(ind, unitBox, [sx * (nw - 0.02), (fy + hy) / 2 - 0.01, fz - 0.12], [-0.5, 0, 0], [0.07, 0.09, 0.1]); part(ind, unitBox, [sx * (W + 0.004), 0.82, D.wf + 0.45], [0, 0, 0], [0.01, 0.03, 0.06]);
    beam(rubber, [sx * 0.05, D.gh[0][1] + 0.03, D.gh[0][0] - 0.02], [sx * 0.55, D.gh[0][1] + 0.05, D.gh[0][0] - 0.1], 0.012, 0.012, black);
  }
  rubber.box(0, sill + 0.1, fz + 0.02, nw * 2 + 0.06, 0.16, 0.08, { col: type === 'suv' ? C('#2a2a2a') : trimGrey }); plateQuad(mb, 0, sill + 0.13, fz + 0.065, 0.19, 0.05, true, variant);
  // rear: tail clusters, reverse lights, indicators, rear glass trim, bumper, plate, exhaust
  if (!opts.amb) for (const sx of [-1, 1]) { tails.box(sx * (W * 0.86 - 0.14), ty, rz - 0.01, 0.26, 0.15, 0.05); mb.get('vrev').box(sx * (W * 0.86 - 0.34), ty - 0.02, rz - 0.012, 0.12, 0.08, 0.04); ind.box(sx * (W * 0.86 - 0.04), ty, rz - 0.012, 0.06, 0.15, 0.04); }
  rubber.box(0, sill + 0.1, rz - 0.02, W * 1.8, 0.17, 0.08, { col: trimGrey }); plateQuad(mb, 0, opts.amb ? 0.43 : ty - 0.2, opts.amb ? rz - 0.065 : rz - 0.04, 0.2, 0.055, false, variant); // ambulance: on the bumper below the twin rear doors
  }
  part(ch, unitCyl, [0.45, sill - 0.02, rz + 0.05], [Math.PI / 2, 0, 0], [0.035, 0.18, 0.035], C('#8a8d90'));
  if (!S && k === 'suv') { part(rubber, unitCyl, [0, 1.0, rz - 0.13], [Math.PI / 2, 0, 0], [0.36, 0.24, 0.36], C('#151515')); part(paint, unitCyl, [0, 1.0, rz - 0.255], [Math.PI / 2, 0, 0], [0.3, 0.02, 0.3], col); for (const sx of [-1, 1]) beam(ch, [sx * (gw1 - 0.06), roofF[2] + 0.06, roofF[0] - 0.1], [sx * (gw1 - 0.06), roofF[2] + 0.06, roofR[0] + 0.1], 0.03, 0.04, C('#2a2a2a')); }
  if (type === 'taxi') { part(paint, unitBox, [0, roofF[2] + 0.11, (roofF[0] + roofR[0]) / 2 + 0.2], [0, 0, 0], [0.5, 0.15, 0.22], C('#f4f4f0')); part(rubber, unitBox, [0, roofF[2] + 0.03, (roofF[0] + roofR[0]) / 2 + 0.2], [0, 0, 0], [0.3, 0.03, 0.12], C('#111')); for (const sx of [-1, 1]) for (const [za, zb] of sideSpans(sx, -1.2, 1.0, 0, 0.004)) paint.box(sx * (W + 0.004), 0.62, (za + zb) / 2, 0.01, 0.08, zb - za, { col: C('#111') }); } // taxi side stripe (each door carries its piece)
  // body-side details: door seams, handles, sill trim, mirrors
  for (const sx of [-1, 1]) {
    const x = sx * (W * taper(0, 0.6) + 0.002); const xf = (z, y) => sx * (W * taper(z, y) + 0.004); const [d0, d1] = D.door; const by = gh[0][1] - 0.02;
    // front / rear / sliding doors are real panels with real shut lines (no painted-on seams); a sliding door's rail stays
    if (D.slide && sx > 0) { const yr = gh[0][1] - 0.03, z0 = D.slide[1] - 0.03, z1 = Math.max(D.wr + R + 0.12, D.slide[1] - 0.85); rubber.box(xf((z0 + z1) / 2, yr) + 0.006, yr, (z0 + z1) / 2, 0.012, 0.022, z0 - z1, { col: C('#151517') }); } // sliding door's upper track
    void x; void d0; void d1; // handles are on the doors
    beam(rubber, [sx * (W * 0.97), sill + 0.03, D.wr + R + 0.1], [sx * (W * 0.97), sill + 0.03, D.wf - R - 0.1], 0.03, 0.05, trimGrey);
    mirror(mb, sx * gw0, gh[0][1] + 0.08, gh[0][0] - 0.12, sx, S && (S.blackMirrors || S.bumper === 'black') ? C('#1b1c1e') : col);
  }
  // interior: dashboard, seats, steering wheel (right-hand drive), rear-view mirror
  const I = mb.get('interior'); const dz = gh[0][0] - 0.15, seatY = cab ? cab.seatY : k === 'van' ? 0.6 : k === 'suv' ? 0.64 : k === 'sedan' ? 0.38 : 0.42; const sz = cab ? (cab.sz ?? D.door[1] + (isVan ? 0.2 : 0.06)) : isVan ? D.door[0] - 0.75 : 0.0; const floorY = SP && (k === 'car' || k === 'sedan') ? sill - 0.005 : sill + 0.04; /* catalogue cars: floor pan just above the underbody pan so the cushion sits a realistic height over the heel floor */
  // seat layout: front pair + rear rows ([z, count]); seat spacing follows the cabin width (kei cars are narrow)
  const sxF = cab ? (cab.sx ?? Math.min(0.38, gw0 - 0.3)) : 0.38; const rows0 = cab ? cab.rows : k === 'van' ? [[-0.4, 2], [-1.4, 2]] : [[sz - 0.9, 2]];
  // the rearmost row sits at least 4 cm ahead of where the roof starts falling to the rear glass, otherwise a tall adult's
  // head ends up in the sloping roof (fastback saloons / hatches)
  const zRoofEnd = gh[gh.length - 2][0] + 0.04, zLast = rows0.length ? Math.min(...rows0.map((r2) => r2[0])) : 0;
  const rows = rows0.map(([z, ...rest]) => [z === zLast && z < zRoofEnd && gh[gh.length - 2][2] - gh[gh.length - 1][2] > 0.2 ? zRoofEnd : z, ...rest]); // [z, count, cushion dy]
  const rowX = (n) => (n >= 3 ? (() => { const x = Math.max(0.38, Math.min(0.5, gw0 - 0.36)); return [-x, 0, x]; })() : [-Math.min(0.4, gw0 - 0.3), Math.min(0.4, gw0 - 0.3)]);
  part(I, unitBox, [0, gh[0][1] - 0.05, dz - 0.1], [0, 0, 0], [gw0 * 2 - 0.17, 0.22, 0.45], C('#1e1e20')); // ends stop short of the door cards (no coplanar faces)
  { // cabin shell seen from inside: floor pan, door trims to the beltline, headliner, firewall, console, parcel shelf
    const zf = gh[0][0] - 0.05, zr = gh[gh.length - 1][0] + 0.08, trim = C(variant % 2 ? '#2c2c2e' : '#5a5046'); const beltY = Math.min(...gh.map((g) => g[1]));
    I.box(0, floorY, (zf + zr) / 2, gw0 * 2 - 0.08, 0.03, zf - zr, { col: C('#202022') });
    for (const sx of [-1, 1]) for (const [za, zb] of sideSpans(sx, zr + 0.02, zf - 0.02, 0)) I.box(sx * (gw0 - 0.045), (floorY + beltY) / 2 + 0.01, (za + zb) / 2, 0.03, beltY - floorY, zb - za, { col: trim }); // only between the doorways (each door carries its own card)
    const roofIn = Math.min(roofF[2], roofR[2]) - 0.035; I.box(0, roofIn, (roofF[0] + roofR[0]) / 2, gw1 * 2 - 0.1, 0.02, roofF[0] - roofR[0], { col: C('#c8c4ba') });
    I.box(0, (floorY + gh[0][1] - 0.16) / 2, dz + 0.12, gw0 * 2 - 0.1, gh[0][1] - 0.16 - floorY, 0.04, { col: C('#18181a') });
    I.box(0, floorY + 0.12, (sz + dz - 0.25) / 2, 0.2, 0.22, Math.max(0.2, dz - 0.25 - sz), { col: C('#1c1c1e') });
    const backZ = (rows.length ? Math.min(...rows.map((r2) => r2[0])) : sz) - 0.3; if (!D.bed && backZ > zr) I.box(0, beltY - 0.02, (backZ + zr) / 2, gw0 * 2 - 0.08, 0.025, backZ - zr, { col: trim });
  }
  const seatCol = C(variant % 2 ? '#2a2a2c' : '#4a4038'); const fw = Math.min(0.48, 2 * sxF - 0.22);
  seat(mb, -sxF, seatY, sz, fw, seatCol); seat(mb, sxF, seatY, sz, fw, seatCol);
  if (!SP && k === 'van') for (const z of [-0.4, -1.4]) seat(mb, 0, seatY, z, W * 1.6, C('#3a3a3c'));
  else for (const [z, n, dy = 0] of rows) { const xs = rowX(n); seat(mb, 0, seatY + dy, z, SP ? Math.min(2 * gw0 - 0.14, 2 * xs[xs.length - 1] + 0.5) : W * 1.5, SP && k === 'van' ? C('#3a3a3c') : seatCol); }
  const sw = [-sxF, seatY + 0.55, sz + 0.42]; steering(mb, sw, 0.18, 1.15); const cw = { p: sw, r: 0.18, tilt: 1.15 };
  part(I, unitBox, [0, roofF[2] - 0.1, roofF[0] - 0.1], [0, 0, 0], [0.22, 0.06, 0.02], C('#222'));
  { const cy = seatY + 0.06, roofAt = (z) => { for (let i = 1; i < gh.length; i++) { const a = gh[i - 1], b = gh[i]; if (z <= a[0] && z >= b[0]) return lerp(a[2], b[2], (a[0] - z) / (a[0] - b[0] || 1)) - 0.06; } return gh[2][2] - 0.06; };
    const hw = W + 0.6, mk = (x, z, o = {}) => ({ x, y: cy, z, floor: floorY + 0.015, fz: 0.6, fx: 0.12, roof: roofAt(z), roofSlope: Math.max(0, (roofAt(z + 0.12) - roofAt(z - 0.12)) / 0.24), lean: -0.22, hands: 'lap', kind: 'sit', exit: [(x < -0.01 ? -1 : 1) * hw, z + 0.1], ...o }); /* centre seats leave on the kerb (left, +x) side */
    const fzK = (f) => (SP ? Math.max(0.42, Math.min(0.68, f - (seatY - floorY - 0.23) * 0.8)) : f); // higher cushions: feet come back under the knees
    seats.push(mk(-sxF, sz, { driver: true, hands: 'wheel', wheel: cw, kind: 'drive', fz: fzK(0.62) }), mk(sxF, sz, { fz: fzK(0.64) }));
    if (!SP && k === 'van') for (const z of [-0.4, -1.4]) seats.push(mk(0.4, z, { fz: 0.55 }), mk(-0.4, z, { fz: 0.55 }));
    else for (const [z, n, dy = 0] of rows) for (const x of rowX(n).slice().sort((a, b) => b - a)) seats.push(mk(x, z, { y: cy + dy, fz: fzK(SP && k === 'van' ? 0.55 : 0.52) - dy * 0.8 })); }
  // separately hinged doors (front both sides, rear both sides, the van's sliding door) used by the boarding animations. Each
  // outer skin is the exact piece of body surface that was cut out (same taper + shoulder), so closed it is flush with a
  // real 5 mm shut line all round. Doors are specified in −x orientation; +x doors are built as mirror images.
  { const xj = -(gw0 - 0.08), by = gh[0][1] - 0.02, jam = col.map((v) => v * 0.42), J = paint;
    const mirP = (p) => [-p[0], p[1], p[2]]; const skinM = (z, y, t) => mirP(skinPt(z, y, t)); const profM = (z, yb, ny) => prof(z, yb, ny).map(mirP);
    // jamb: painted walls from the skin into the body around each opening (pillar faces, sill, notch steps), dark sill wall, scuff plate
    for (const { ap, side } of openings) { const sp = side < 0 ? skinPt : skinM, pf = side < 0 ? prof : profM, xi = side < 0 ? xj : -xj;
      doorShell(J, ap.apPath, sp, pf, xi, jam, topAt, lipY);
      for (const [za, zb, yb] of ap.apRects) dquad(I, [xi, floorY, za], [xi, floorY, zb], [xi, yb, zb], [xi, yb, za], C('#1d1d1f'));
      const lo = ap.apRects.reduce((m, r) => (r[2] <= m[2] + 1e-6 && r[1] - r[0] > m[1] - m[0] ? r : m)); const [za, zb] = lo; const xo = sp((za + zb) / 2, dy0)[0];
      I.box((xo + xi) / 2, dy0 + 0.004, (za + zb) / 2, Math.abs(xo - xi) - 0.01, 0.008, zb - za - 0.06, { col: C('#3a3b3e') }); } // scuff plate on the sill
    const gL = gh[gh.length - 1]; const glY = (z) => lerp(gh[0][1], gL[1], (gh[0][0] - z) / (gh[0][0] - gL[0]));
    const roofY = (z) => { for (let i = 1; i < gh.length; i++) { const a = gh[i - 1], b = gh[i]; if (z <= a[0] && z >= b[0]) return lerp(a[2], b[2], (a[0] - z) / (a[0] - b[0] || 1)); } return gh[1][2]; };
    const visor = S ? !S.noVisor && (!isVan || k === 'suv' || k === 'pickup') : !isVan || k === 'suv'; const trim = C(variant % 2 ? '#2c2c2e' : '#5a5046');
    doors = openings.map((o) => ({ side: o.side, role: o.role, mirror: o.side > 0, hinge: [o.side * (W + 0.004), o.ap.zF], len: o.ap.zF - o.ap.zR, glass: winGlass(o),
      spec: { rects: o.ap.dRects, path: o.ap.dPath, zF: o.ap.zF, zR: o.ap.zR, skinPt, prof, topAt, lipY, xc: -(gw0 - 0.05), gw0, gw1, glY, roofY, by, visor: visor && o.role !== 'slide', trim, jam, seatY, floorY, dashR: dz - 0.335, slide: o.role === 'slide', key: o.role === 'front' && o.side < 0 } }));
  }
  carDetail(dm, KIT, { W, R, D, k, type, fz, rz, taper, gw0, gw1, fy, hy, nw, ty: S ? 0 : ty, sill, isVan, col, gh, roofF, roofR, seatY, sz, dz, floorY, variant, style: S, sx0: sxF, visors: S ? !S.noVisor && (!isVan || k === 'suv' || k === 'pickup') : !isVan || k === 'suv' });
  if (S) styleVehicle({ mb, dm, T, S, D, W, R, fz, rz, sill, col, gh, gw0, gw1, roofF, roofR, taper, variant, isVan, k, type, bev, wf: D.wf, wr: D.wr, floorY, plate: (cx, cy, z, hw, hh, front) => plateQuad(mb, cx, cy, z, hw, hh, front, variant) });
  // body shape field (BodyShape.js): plan-view rounding of nose / tail corners, crowned bonnet / boot / roof, tumblehome.
  // Per family: low, curvy saloons and hatches get the most; upright SUVs, pickups and vans keep flatter, squarer panels.
  const fam = SP ? SP.family : k; const FS = { car: [0.15, 0.1, 0.035, 0.045, 0.035], sedan: [0.16, 0.12, 0.035, 0.045, 0.035], suv: [0.11, 0.06, 0.03, 0.035, 0.03], pickup: [0.1, 0.03, 0.03, 0.035, 0.03], van: [0.09, 0.035, 0.025, 0.03, 0.025] }[fam] || [0.12, 0.07, 0.03, 0.04, 0.03];
  const shape = { W, outline: shapeOutline, roof: D.gh.map(([z, , y]) => [z, y]), roofW: gw1, nose: FS[0], tail: FS[1], crown: FS[2], roofCrown: FS[3], tuckSill: FS[4] * 0.75, tuckBelt: FS[4] * 0.4, sill, belt: D.gh[0][1] };
  return out([[-W + 0.15, R, D.wf, 0.21], [W - 0.15, R, D.wf, 0.21], [-W + 0.15, R, D.wr, 0.21], [W - 0.15, R, D.wr, 0.21]], sw, { shape });
}

// double-sided quad (thin shells seen from both sides: jambs, door edges)
function dquad(b, p, q, r, t, c) { b.quad(p, q, r, t, [0, 0, 1, 1], c); b.quad(p, t, r, q, [0, 0, 1, 1], c); }
// walls between the outer skin and an inner plane x = xi along an outline [[z,y]...] (first/last points are the top of the
// flat skin at the front/rear edge); the rounded shoulder at both ends is closed with a fan
function doorShell(b, path, skinPt, prof, xi, c, topAt, lipY) {
  for (let i = 0; i < path.length - 1; i++) { const [za, ya] = path[i], [zb, yb] = path[i + 1]; const n = Math.max(1, Math.ceil(Math.hypot(zb - za, yb - ya) / 0.08));
    for (let s = 0; s < n; s++) { const z0 = lerp(za, zb, s / n), y0 = lerp(ya, yb, s / n), z1 = lerp(za, zb, (s + 1) / n), y1 = lerp(ya, yb, (s + 1) / n); dquad(b, skinPt(z0, y0), skinPt(z1, y1), [xi, y1, z1], [xi, y0, z0], c); } }
  for (const z of [path[0][0], path[path.length - 1][0]]) { const lip = prof(z, lipY(z, 0), 1).slice(1); const c0 = [xi, lipY(z, 0), z], pts = [skinPt(z, lipY(z, 0)), ...lip, [xi, topAt(z), z]];
    for (let i = 0; i < pts.length - 1; i++) dtri(b, c0, pts[i], pts[i + 1], c); }
}
function dtri(b, p, q, r, c) { b.quad(p, q, r, r, [0, 0, 1, 1], c); b.quad(p, r, q, q, [0, 0, 1, 1], c); }
// smooth indexed grid (columns of equal-length point rows) added with averaged normals; flip reverses the facing
function gridInto(b, cols, col, flip = false) {
  const pos = [], idx = []; const nr = cols[0].length; for (const c of cols) for (const p of c) pos.push(p[0], p[1], p[2]);
  for (let i = 0; i < cols.length - 1; i++) for (let j = 0; j < nr - 1; j++) { const a = i * nr + j, bb = (i + 1) * nr + j, c = (i + 1) * nr + j + 1, d = i * nr + j + 1; if (flip) idx.push(a, c, bb, a, d, c); else idx.push(a, bb, c, a, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); b.geometry(g, new THREE.Matrix4(), col); g.dispose();
}
const zCols = (za, zb, step = 0.08) => { const n = Math.max(2, Math.ceil((zb - za) / step)); return Array.from({ length: n + 1 }, (_, i) => lerp(za, zb, i / n)); };

// Where a hand takes hold of a hinged door, in its pivot's frame (hinge at the origin, the panel running back along −z, the
// outside of the car towards side·x): the outside handle (bar centre + the skin behind it) and the panel's rear edge (inner
// door-card and outer-skin x, a height below the belt where the panel is solid). Used by Boarding / Player to put a solved
// grasp (GripSolver) on the door instead of a wrist point inside the panel.
// the outside pull handle, model space (outside = −x): a bar on two posts standing off the skin, its inner face 2 cm clear of
// the most outward point of the panel at and just below it, so fingers hook in behind it even where the side bulges out under
// the handle line (curvier bodies). xs: skin at the bar height; xb: bar centre; posts run from the skin to the bar.
export function handleBar(S) {
  const z = S.zR + 0.175, y = S.by - 0.12, xs = S.skinPt(z, y)[0]; let base = xs; for (const dy of [0.02, 0.04, 0.06]) base = Math.min(base, S.skinPt(z, y - dy)[0]);
  return { z, y, xs, xb: base - 0.026, half: 0.006, h: 0.028, len: 0.13 };
}
function doorGrab(d) {
  if (d.leaf || d.role === 'slide') return null; const side = d.side, S = d.spec;
  if (!S) { const y = d.gripY ?? 1.05; return { side, y, zR: -d.len + 0.004, card: -side * 0.06, skin: 0, handle: null }; } // cab doors: plain slab estimate
  const hxN = -Math.abs(d.hinge[0]); const loc = (x) => -side * (x - hxN); const zr = S.zR + 0.004;
  const y = Math.min(S.by - 0.1, S.topAt(zr + 0.06) - 0.07); const skin = loc(S.skinPt(zr + 0.06, y)[0]), card = loc(S.xc);
  const HB = handleBar(S); const hz = HB.z, hy = HB.y; const hs = loc(HB.xs);
  // the window's rear edge (glass + rubber, between the belt and the roof line): what a hand holds the open door by
  let win = null; if (S.glY && S.roofY && S.gw0) { const g0 = S.glY(zr), g1 = S.roofY(zr); if (g1 - g0 > 0.2) { const wy = g0 + Math.min(0.2, (g1 - g0) * 0.42); const gxAt = (yy) => loc(-lerp(S.gw0, S.gw1 ?? S.gw0, (yy - g0) / (g1 - g0))); win = { y: wy, x: gxAt(wy), tilt: gxAt(wy + 0.1) * 10 - gxAt(wy) * 10, zR: zr - d.hinge[1] - 0.024 }; } } // the rubber frame runs ~2.5 cm past the panel's rear edge; the glass leans in (tumblehome)
  const g = { side, y, zR: zr - d.hinge[1], card, skin, win, handle: { x: loc(HB.xb), half: HB.half, posts: [HB.len / 2 - 0.008, -HB.len / 2 + 0.008], skin: hs, y: hy, z: hz - d.hinge[1], lo: [0.04, 0.08, 0.12].map((dy) => loc(S.skinPt(hz, hy - dy)[0])) } };
  // the body shape field moved the door with the body (BodyShape.js): the grasp targets follow it (hinge-local x through the field)
  if (d.field) { const F = d.field, o = [0, 0, 0]; const X = (l, yy, zb) => { F(hxN - side * l, yy, zb, o); return -side * (o[0] - hxN); };
    g.skin = X(skin, y, zr + 0.06); g.card = X(card, y, zr + 0.06); const H = g.handle; H.x = X(H.x, hy, hz); H.skin = X(hs, hy, hz); H.lo = H.lo.map((l) => l + (H.skin - hs)); /* the grip solver's panel bands: kept at their unwarped offset from the skin (the belt tuck adds ~3 mm of swell under the bar, which leaves the curled fingers no room behind it; the hand-in-door check runs on the real warped mesh) */
    if (win) { const wx = X(win.x, win.y, zr), wx1 = X(win.x + win.tilt / 10, win.y + 0.1, zr); F(hxN - side * win.x, win.y, zr, o); g.win = { ...win, x: wx, tilt: (wx1 - wx) * 10, y: o[1] }; } }
  return g; // lo: the skin below the bar (the side bulges out under the handle line)
}

// Driver door: own mesh group on a hinge pivot (front edge) so it can swing open. Built in model space from the spec the
// body builder left (the cut-out skin), then moved into hinge space. stripes: police bands [[yCentre, height, colour]].
function buildDoorGeos(d, col, stripes = null) {
  const S = d.spec; const mb = new MultiBuilder(); const P = mb.get('paint'), rb = mb.get('rubber'), I = mb.get('interior'), ch = mb.get('chrome');
  // outer skin, smooth, exactly on the old body surface
  for (const [za, zb, yb] of S.rects) gridInto(P, zCols(za, zb).map((z) => S.prof(z, yb)), col);
  // police bands follow the skin (body bands sit 12 mm proud of the flat side; same here so they line up across the gap)
  if (stripes) for (const [yc, h, sc, off = 0.012] of stripes) for (const [za, zb, yb] of S.rects) { const y0 = Math.max(yb, yc - h / 2), y1 = yc + h / 2; if (y1 <= y0) continue;
    gridInto(P, zCols(za, zb).map((z) => [y0, y1].map((y) => { const q = S.skinPt(z, y); return [q[0] - off, y, z]; })), sc); }
  // edges (shut-line faces), rounded shoulder ends, belt cap, inner door card
  doorShell(P, S.path, S.skinPt, S.prof, S.xc, S.jam, S.topAt, S.lipY);
  for (const [za, zb] of S.rects) { const zs = zCols(za, zb); for (let i = 0; i < zs.length - 1; i++) { const a = zs[i], b = zs[i + 1]; dquad(rb, S.skinPt(a, S.topAt(a), 1), S.skinPt(b, S.topAt(b), 1), [S.xc, S.topAt(b), b], [S.xc, S.topAt(a), a], C('#141416')); } }
  for (const [za, zb, yb] of S.rects) gridInto(I, zCols(za, zb).map((z) => [[S.xc, yb + 0.01, z], [S.xc, S.topAt(z) - 0.004, z]]), S.trim, true);
  // outer belt weatherstrip up to the glass + satin belt strip (match the body's strips either side of the door)
  { const xs = -(S.gw0 + 0.005); beam(rb, [xs, S.glY(S.zF) + 0.005, S.zF], [xs, S.glY(S.zR) + 0.005, S.zR], 0.012, 0.025, C('#111'));
    const zs = zCols(S.zR, S.zF); for (let i = 0; i < zs.length - 1; i++) { const a = zs[i], b = zs[i + 1]; dquad(rb, [xs, S.topAt(a), a], [xs, S.topAt(b), b], [xs, S.glY(b) + 0.004, b], [xs, S.glY(a) + 0.004, a], C('#111')); } }
  // handle in its dark recess, key cylinder (same height as the other doors' handles)
  { const HB = handleBar(S), z = HB.z, y = HB.y, x = HB.xs; rb.box(x - 0.002, y, z, 0.006, 0.05, 0.17, { col: C('#0c0c0d') }); // dark recess plate
    ch.box(HB.xb, y, z, HB.half * 2, HB.h, HB.len, { col: C('#c4c8cc') }); for (const e of [-1, 1]) { const zp = z + e * (HB.len / 2 - 0.008), dx = x - HB.xb; ch.box(HB.xb + dx / 2 + 0.002, y, zp, dx + 0.004, 0.02, 0.016, { col: C('#b4b8bc') }); } // pull bar on two posts
    if (S.key) { const zk = S.zR + 0.315, xk = S.skinPt(zk, y)[0]; ch.box(xk - 0.004, y, zk, 0.006, 0.026, 0.026, { col: C('#c4c8cc') }); } } // key cylinder: driver's door only
  // inside: armrest with pull cup, interior handle, speaker grille low at the front
  { const zm = (S.zF + S.zR) / 2, ya = S.seatY + 0.22, aL = Math.min(0.55, (S.zF - S.zR) * 0.6), aF = Math.min(zm - 0.05 + aL / 2, S.dashR ?? 9), aB = zm - 0.05 - aL / 2; /* the armrest ends behind the dashboard (kei vans: the cabin is short) */ if (aF - aB > 0.12 && !S.slide) I.box(S.xc + 0.035, ya, (aF + aB) / 2, 0.07, 0.05, aF - aB, { col: S.trim.map((v) => v * 0.75) });
    ch.box(S.xc + 0.012, ya + 0.14, S.zF - 0.24, 0.015, 0.03, 0.09, { col: C('#9aa0a6') }); const lo = S.rects.reduce((m, r) => (r[1] - r[0] > m[1] - m[0] ? r : m)); if (lo[1] - lo[0] > 0.3) I.box(S.xc + 0.006, lo[2] + 0.16, Math.max(lo[0] + 0.1, lo[1] - 0.17), 0.012, 0.14, 0.16, { col: C('#141416') }); } /* speaker on the widest panel section, always inside the door (a notched door can have a sliver of panel under the notch) */ // speaker on the lower panel (ahead of it a notched door has the wheel arch)
  // window: the same glass surface that was cut out of the greenhouse, framed in rubber; rain visor over it
  { const G = d.glass; const gl = mb.get('glass');
    for (let i = 0; i < G.length - 1; i++) for (const k of [7, 8, 9]) { const a = G[i][k], b = G[i][(k + 1) % 10], c = G[i + 1][(k + 1) % 10], e = G[i + 1][k]; gl.quad(a, b, c, e, [0, 0, 1, 1], C('#fff')); }
    for (let i = 0; i < G.length - 1; i++) beam(rb, G[i][7], G[i + 1][7], 0.022, 0.03, C('#111'));
    for (const r of [G[0], G[G.length - 1]]) { beam(rb, r[0], r[9], 0.022, 0.03, C('#111')); beam(rb, r[9], r[8], 0.022, 0.03, C('#111')); beam(rb, r[8], r[7], 0.022, 0.03, C('#111')); }
    if (S.visor) beam(gl, [-(S.gw1 + 0.035), S.roofY(S.zF - 0.04) - 0.05, S.zF - 0.04], [-(S.gw1 + 0.035), S.roofY(S.zR + 0.03) - 0.05, S.zR + 0.03], 0.006, 0.065, C('#fff')); }
  const geos = []; const m = new THREE.Matrix4().makeTranslation(-d.hinge[0], 0, -d.hinge[1]);
  for (const [name, b] of mb.b) { const geo = b.build(); if (geo) { geo.applyMatrix4(m); geo.computeBoundingSphere(); geos.push([name, geo]); } }
  return geos;
}

// bus door leaf (hinge space: hinge on its jamb, the leaf runs along −leaf·z): dark glazed panel, glass both faces, kick plate,
// rubber seal on the free edge. Swings out to the street (DoorRig poseDoor), so it never sweeps through the stairwell.
function buildLeafGeos(d) {
  const mb = new MultiBuilder(), rb = mb.get('rubber'), gl = mb.get('glass'), ch = mb.get('chrome'); const s = d.leaf, n = d.len, zc = -s * n / 2, y0 = 0.4, y1 = 2.53;
  rb.box(0, (y0 + y1) / 2, zc, 0.03, y1 - y0, n, { col: C('#1a1a1a') }); rb.box(0, (y0 + y1) / 2, -s * (n - 0.012), s > 0 ? 0.046 : 0.04, y1 - y0, 0.024, { col: C('#0d0d0d') });
  const za = Math.min(-s * 0.035, -s * (n - 0.04)), zb = Math.max(-s * 0.035, -s * (n - 0.04));
  gl.quad([0.016, 0.85, za], [0.016, 0.85, zb], [0.016, 2.42, zb], [0.016, 2.42, za], [0, 0, 1, 1], C('#fff')); gl.quad([-0.016, 0.85, zb], [-0.016, 0.85, za], [-0.016, 2.42, za], [-0.016, 2.42, zb], [0, 0, 1, 1], C('#fff'));
  ch.box(0, 0.55, zc, 0.04, 0.12, n - 0.03, { col: C('#888') }); ch.box(0.02, 1.25, -s * (n - 0.08), 0.03, 0.4, 0.025, { col: C('#b0b4b8') }); // kick plate, grab handle by the free edge
  const geos = []; for (const [name, b] of mb.b) { const geo = b.build(); if (geo) { geo.computeBoundingSphere(); geos.push([name, geo]); } } return geos;
}

// quad facing `want` (flips the winding if needed; paint is single-sided)
function quadF(m, a, b, c, d, want, col) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  if ((uy * vz - uz * vy) * want[0] + (uz * vx - ux * vz) * want[1] + (ux * vy - uy * vx) * want[2] >= 0) m.quad(a, b, c, d, [0, 0, 1, 1], col); else m.quad(b, a, d, c, [0, 0, 1, 1], col); }
// truck / lorry cab door (hinge space, built directly for its side s): a steel panel per notch rect up to the belt whose skin
// follows the cab's plan taper (c.tp = [z0, z1, amount] narrowing toward the nose), inner trim card, window frame + glass in
// the cab's glass plane through the columns c.win ([z, y0, y1, w0, w1] — the window outline follows a raked A-pillar), handle
function buildCabDoorGeos(d) {
  const c = d.cab, s = d.side, zF = d.hinge[1], hx = Math.abs(d.hinge[0]), mb = new MultiBuilder(), P = mb.get('paint'), gl = mb.get('glass'), ch = mb.get('chrome'), I = mb.get('interior'), rb = mb.get('rubber');
  const X = (x) => s * x, TH = 0.05, sk = (z) => (c.tp ? c.W * (1 - c.tp[2] * sstep(c.tp[0], c.tp[1], z)) : c.W) - hx; // skin offset (outward) from the hinge line
  const y1 = c.belt; let zMin = 9;
  for (const [za, zb, y0] of c.rects) { zMin = Math.min(zMin, za); const n = c.tp ? 6 : 1;
    for (let i = 0; i < n; i++) { const z0 = za + (zb - za) * i / n, z1 = za + (zb - za) * (i + 1) / n, o0 = sk(z0), o1 = sk(z1), a = z0 - zF, b = z1 - zF;
      quadF(P, [X(o0), y0, a], [X(o1), y0, b], [X(o1), y1, b], [X(o0), y1, a], [s, 0, 0], c.col); quadF(P, [X(o0 - TH), y0, a], [X(o1 - TH), y0, b], [X(o1 - TH), y1, b], [X(o0 - TH), y1, a], [-s, 0, 0], c.col);
      quadF(P, [X(o0), y0, a], [X(o1), y0, b], [X(o1 - TH), y0, b], [X(o0 - TH), y0, a], [0, -1, 0], c.col); quadF(P, [X(o0), y1, a], [X(o1), y1, b], [X(o1 - TH), y1, b], [X(o0 - TH), y1, a], [0, 1, 0], c.col); }
    for (const [z, w] of [[za, -1], [zb, 1]]) { const o = sk(z); quadF(P, [X(o), y0, z - zF], [X(o - TH), y0, z - zF], [X(o - TH), y1, z - zF], [X(o), y1, z - zF], [0, 0, w], c.col); }
    const zm = (za + zb) / 2; I.box(X(sk(zm) - 0.065), (y0 + y1) / 2, zm - zF, 0.02, y1 - y0 - 0.06, zb - za - 0.06, { col: c.trim }); }
  const W = c.win.slice().sort((p, q) => p[0] - q[0]), ins = c.inset ?? 0.04, last = W.length - 1;
  const pt = (q, top, j) => { const zi = j === 0 ? 0.06 : j === last ? -0.06 : 0; return top ? [X(q[4] - hx), q[2] - ins, q[0] - zF + zi] : [X(q[3] - hx), q[1] + 0.05, q[0] - zF + zi]; };
  for (let j = 0; j < last; j++) { const A = W[j], B = W[j + 1]; quadF(gl, pt(A, 0, j), pt(B, 0, j + 1), pt(B, 1, j + 1), pt(A, 1, j), [s, 0, 0], C('#fff'));
    beam(P, [X(A[3] - hx), A[1] + 0.02, A[0] - zF], [X(B[3] - hx), B[1] + 0.02, B[0] - zF], 0.05, 0.05, c.col); beam(P, [X(A[4] - hx), A[2] - ins + 0.01, A[0] - zF], [X(B[4] - hx), B[2] - ins + 0.01, B[0] - zF], 0.045, 0.05, c.col); }
  for (const [q, w] of [[W[0], 1], [W[last], -1]]) beam(P, [X(q[3] - hx), q[1], q[0] - zF + w * 0.025], [X(q[4] - hx), q[2] - ins + 0.01, q[0] - zF + w * 0.025], 0.05, 0.05, c.col);
  { const q = W[0]; beam(rb, [X(q[3] - hx + 0.006), q[1] + 0.05, q[0] - zF + 0.055], [X(q[4] - hx + 0.006), q[2] - ins - 0.04, q[0] - zF + 0.055], 0.012, 0.02, C('#111')); }
  const zh = zMin + 0.17; ch.box(X(sk(zh) + 0.012), c.belt - 0.16, zh - zF, 0.02, 0.035, 0.16, { col: C('#c4c8cc') }); rb.box(X(sk(zh) + 0.004), c.belt - 0.16, zh - zF, 0.008, 0.06, 0.19, { col: C('#0c0c0d') }); // handle in its recess
  ch.box(X(sk(zh + 0.08) - 0.08), c.belt - 0.2, zh + 0.08 - zF, 0.02, 0.03, 0.1, { col: C('#9aa0a6') }); // inside pull
  const geos = []; for (const [name, b] of mb.b) { const geo = b.build(); if (geo) { geo.computeBoundingSphere(); geos.push([name, geo]); } } return geos;
}

// Returns a THREE.Group with .userData {wheels, tailMat, seats, type, color, steerWheel, door, entry}
// is this (type, seed) look already built? (traffic spreads first-time model builds out so they never stack up in one frame)
// a look's geometry is the same for every paint colour except the vertex colours, which are the paint colour or an exact
// multiple of it (door-jamb shade). So each type + variant is built once with a probe colour nothing else uses, and every
// paint colour is a copy of that build with the probe vertices recoloured: ~1 ms instead of a 10-40 ms model build mid-drive
// (identical result: tools/vehicle-recolor-test.mjs compares every look against a direct build).
const PROBE_HEX = '#d2508e'; let PROBE = null; const shapeCache = new Map();
function shapeOf(type, variant) {
  const key = type + '|' + variant; let s = shapeCache.get(key); if (s) return s; PROBE = PROBE || C(PROBE_HEX);
  const m = buildModel(type, PROBE_HEX, variant); const raw = (mbb) => { const out = []; for (const [name, b] of mbb.b) { const g = b.build(); if (g) out.push([name, g]); } return out; };
  const mask = (l) => l.map(([name, g]) => [name, g, probeMask(g)]);
  // body shape field (BodyShape.js): every part is first refined where the field bends (in bakeDoors for the door leaves, which
  // live in hinge space), then the whole baked body — skin, shut doors, glass, lamps, trims — moves through the one field
  const SF = m.shape && m.shape.outline && !globalThis.__noBodyWarp ? makeBodyWarp(m.shape) : null;
  const body = { geos: raw(m.mb), doors: m.doors, refine: SF ? SF.refine : null }; if (m.doors && m.doors.length) bakeDoors(body, VTYPES[type], type, PROBE); else if (SF) body.geos = body.geos.map(([n, g]) => [n, SF.refine(g, null, n)]);
  if (SF) { if (m.doors) for (const d of m.doors) d.field = SF.field; for (const [, g] of body.geos) SF.warp(g); m.dgeosWarp = (g) => SF.warp(g); m.dgeosRefine = SF.refine; } // the whole baked body (skin + shut doors + glass + lamps + trims) follows one smooth shape field // shut doors baked into the body once per shape (paint recolour covers them too)
  let dg = raw(m.dm); if (m.dgeosWarp) { dg = dg.map(([n, g]) => [n, m.dgeosRefine(g, null, n)]); for (const [, g] of dg) m.dgeosWarp(g); } s = { geos: mask(body.geos), dgeos: mask(dg), doorRanges: body.doorRanges, m }; shapeCache.set(key, s); return s;
}
// per vertex: the multiple of the probe colour it carries (0 = not paint)
function probeMask(g) { const c = g.attributes.color; if (!c) return null; const a = c.array, P = PROBE; let mask = null;
  for (let i = 0; i < a.length; i += 3) { const k = a[i] / P[0]; if (k > 0 && Math.abs(a[i + 1] - k * P[1]) < 2e-5 && Math.abs(a[i + 2] - k * P[2]) < 2e-5) { if (!mask) mask = new Float32Array(a.length / 3); mask[i / 3] = k; } }
  return mask; }
// a look = the shape with its own vertex colours: index / position / normal / uv stay SHARED with the shape (nothing ever moves a
// vehicle's vertices; looks are cached, never disposed), only the colour array is copied — a new paint colour used to clone every
// attribute (4-19 ms per new look mid-drive, a visible hitch when a street of parked cars streamed in) and upload it all again
function recolor(g, mask, col) { const out = new THREE.BufferGeometry(); out.name = g.name; out.setIndex(g.index); for (const n in g.attributes) out.setAttribute(n, n === 'color' ? g.attributes.color.clone() : g.attributes[n]);
  for (const q of g.groups) out.addGroup(q.start, q.count, q.materialIndex); out.boundingBox = g.boundingBox ? g.boundingBox.clone() : null; out.boundingSphere = g.boundingSphere ? g.boundingSphere.clone() : null; out.userData = { ...g.userData };
  if (!mask) return out; const a = out.attributes.color.array; for (let j = 0; j < mask.length; j++) { const k = mask[j]; if (k) { a[j * 3] = Math.fround(k * col[0]); a[j * 3 + 1] = Math.fround(k * col[1]); a[j * 3 + 2] = Math.fround(k * col[2]); } } return out; }
// door / bus-door metadata carry colours too (the door jamb shade): copy, recolouring any probe-multiple triple
function recolorMeta(o, col) { if (Array.isArray(o)) { if (o.length === 3 && o.every((v) => typeof v === 'number')) { const k = o[0] / PROBE[0]; if (k > 0 && Math.abs(o[1] - k * PROBE[1]) < 2e-5 && Math.abs(o[2] - k * PROBE[2]) < 2e-5) return [k * col[0], k * col[1], k * col[2]]; return o.slice(); } return o.map((x) => recolorMeta(x, col)); }
  if (o && typeof o === 'object' && !o.isBufferGeometry && !o.isVector3) { const r = {}; for (const k in o) r[k] = recolorMeta(o[k], col); return r; } return o; }
export function shapeCacheSize() { return shapeCache.size; }
export function modelCached(type, seed = 1) { const T = VTYPES[type]; if (!T) return true; const r = new RNG(seed); const color = r.pick(T.colors); const variant = r.int(0, 3); return modelCache.has(type + color + variant) || shapeCache.has(type + '|' + variant); }
// ---- doors baked into the body while shut (DoorRig.js brings a moving door out onto its pivot)
function doorStripes(T, type) { const hy = T.base === 'suv' ? 0.78 : 0.66; return T.police ? [[hy + 0.035, 0.07, C('#1b3f94')], [hy - 0.0875, 0.025, C('#1b3f94')]] : T.ambulance ? [[0.71, 0.12, C(AMB_GREEN)], [0.57, 0.025, C(AMB_GREEN)]] : type === 'taxi' ? [[0.62, 0.08, C('#111'), 0.009]] : null; } // police bands / taxi stripe continue across the doors
// concatenate indexed geometries (position / normal / uv / colour), each with an optional matrix (a mirroring matrix flips the winding)
function concatGeos(parts) {
  let nv = 0, ni = 0; for (const p of parts) { nv += p.geo.attributes.position.count; ni += p.geo.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3).fill(1), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), m3 = new THREE.Matrix3(); let vo = 0, io = 0; const ranges = [];
  for (const { geo, m } of parts) { const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, Cc = geo.attributes.color, I = geo.index; if (m) m3.getNormalMatrix(m); const flip = m && m.determinant() < 0;
    for (let i = 0; i < P.count; i++) { const o = vo + i; v.fromBufferAttribute(P, i); if (m) v.applyMatrix4(m); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      if (N) { n.fromBufferAttribute(N, i); if (m) n.applyMatrix3(m3).normalize(); nor[o * 3] = n.x; nor[o * 3 + 1] = n.y; nor[o * 3 + 2] = n.z; } if (U) { uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i); } if (Cc) { col[o * 3] = Cc.getX(i); col[o * 3 + 1] = Cc.getY(i); col[o * 3 + 2] = Cc.getZ(i); } }
    for (let k = 0; k < I.count; k += 3) { const a = vo + I.getX(k), b = vo + I.getX(k + 1), c = vo + I.getX(k + 2); idx[io + k] = a; idx[io + k + 1] = flip ? c : b; idx[io + k + 2] = flip ? b : c; }
    ranges.push({ v0: vo, v1: vo + P.count, i0: io, i1: io + I.count }); vo += P.count; io += I.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); g.computeBoundingBox(); return { geo: g, ranges };
}
// door i's own geometry (hinge space) cut back out of the baked body: same vertices / colours (worn grime included)
function slicePivotGeos(cached, i) {
  if (!cached.pivotGeos) cached.pivotGeos = []; if (cached.pivotGeos[i]) return cached.pivotGeos[i]; const d = cached.doors[i]; const out = [];
  for (const [name, src] of cached.geos) { const R = cached.doorRanges[name]; const r = R && R.doors.find((q) => q.door === i); if (!r) continue; const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'color']) { const A = src.attributes[k]; const arr = A.array.slice(r.v0 * A.itemSize, r.v1 * A.itemSize); if (k === 'position') for (let j = 0; j < arr.length; j += 3) { arr[j] -= d.hinge[0]; arr[j + 2] -= d.hinge[1]; } g.setAttribute(k, new THREE.BufferAttribute(arr, A.itemSize)); }
    const I = src.index.array.slice(r.i0, r.i1); for (let j = 0; j < I.length; j++) I[j] -= r.v0; g.setIndex(new THREE.BufferAttribute(I, 1)); g.computeBoundingSphere(); out.push([name, g]); }
  return (cached.pivotGeos[i] = out);
}
function bakeDoors(cached, T, type, col) {
  const doors = cached.doors, stripes = doorStripes(T, type);
  const dg = doors.map((d) => d.leaf ? buildLeafGeos(d) : d.cab ? buildCabDoorGeos(d) : buildDoorGeos(d.mirror ? { ...d, hinge: [-d.hinge[0], d.hinge[1]] } : d, col, stripes)); // hinge space, −x orientation
  const names = [...new Set([...cached.geos.map((q) => q[0]), ...dg.flatMap((l) => l.map((q) => q[0]))])]; const ranges = {}, baked = [];
  for (const name of names) { const body = cached.geos.find((q) => q[0] === name); const parts = body ? [{ geo: cached.refine ? cached.refine(body[1], null, name) : body[1], m: null }] : []; const who = [];
    dg.forEach((l, i) => { const q = l.find((x) => x[0] === name); if (!q) return; const d = doors[i]; const M = new THREE.Matrix4().makeTranslation(d.hinge[0], 0, d.hinge[1]); if (d.mirror) M.multiply(new THREE.Matrix4().makeScale(-1, 1, 1)); parts.push({ geo: cached.refine ? cached.refine(q[1], M, name) : q[1], m: M }); who.push(i); });
    const { geo, ranges: rr } = concatGeos(parts); const off = body ? 1 : 0; ranges[name] = { body: body ? rr[0].i1 : 0, doors: who.map((i, k) => ({ door: i, ...rr[k + off] })) }; baked.push([name, geo]); if (body) body[1].dispose(); }
  for (const l of dg) for (const [, g] of l) g.dispose();
  cached.geos = baked; cached.doorRanges = ranges;
}
// the shared (cached) geometry for a look: built once per type + colour + variant
function ensureModel(type, seed) {
  const T = VTYPES[type]; const r = new RNG(seed); const color = r.pick(T.colors); const variant = r.int(0, 3);
  const key = type + color + variant; let cached = modelCache.get(key); const worn = WORN.has(type) || (type === 'van' && variant === 3);
  if (!cached) {
    const S = shapeOf(type, variant), m = S.m, col = C(color); const geos = [];
    for (const [name, g0, mask] of S.geos) geos.push([name, recolor(g0, mask, col)]);
    const dgeos = []; for (const [name, g0, mask] of S.dgeos) dgeos.push([name, recolor(g0, mask, col)]);
    cached = { geos, dgeos, wheels: m.wheels, seats: m.seats, steerWheel: m.steerWheel, doors: recolorMeta(m.doors, col), wheelStyle: m.wheelStyle, busDoor: recolorMeta(m.busDoor, col), cabStep: m.cabStep, exhaust: (m.dm && m.dm.exhaust) || null };
    cached.doorRanges = S.doorRanges;
    if (worn) for (const [name, g] of cached.geos) if (name === 'paint' || name === 'canvas') dirty(g, seed); // after baking: shut doors carry the same grime as the panels round them
    modelCache.set(key, cached);
  }
  return { T, color, variant, worn, cached };
}
// loading screen: build a look's geometry ahead of time (no meshes / materials are created)
export function warmModel(type, seed = 1) { if (VTYPES[type]) ensureModel(type, seed); }
export function warmShape(type, variant) { if (VTYPES[type]) shapeOf(type, variant); }
export function cleanLook(type, color, variant) { const S = shapeOf(type, variant), col = C(color); const f = (L) => L.map(([n, g, k]) => [n, recolor(g, k, col)]); return { geos: f(S.geos), dgeos: f(S.dgeos), m: { ...S.m, doors: recolorMeta(S.m.doors, col), busDoor: recolorMeta(S.m.busDoor, col) } }; } // tests only
export function directModel(type, color, variant) { const m = buildModel(type, color, variant); const f = (mbb) => [...mbb.b].map(([n, b]) => [n, b.build()]).filter((q) => q[1]); const body = { geos: f(m.mb), doors: m.doors }; if (m.doors && m.doors.length) bakeDoors(body, VTYPES[type], type, C(color)); return { geos: body.geos, dgeos: f(m.dm), m }; } // tests only (doors baked in the paint colour directly)
// shadow pass: parts that sit flush on (or inside) the painted body add a draw call per vehicle but never change the shadow
// (lamp lenses, indicators, plates, route boards: the body's own silhouette already covers theirs)
const NO_CAST = new Set(['livery', 'glass', 'vlight', 'interior', 'badge', 'amb', 'vtail', 'vind', 'vrev', 'plate', 'route', 'mirror', 'dash']);
export function createVehicleMesh(type, seed = 1) {
  const { T, color, variant, worn, cached } = ensureModel(type, seed);
  const { mats: M } = vehicleMaterials();
  const byName = { carbon: M.vcarbon, alloy: M.valloy, engine: M.vengine, mirror: M.vmirror, dash: M.vdash, paint: worn ? M.vworn : M.vpaint, glass: M.vglass, chrome: M.vchrome, rubber: M.vrubber, interior: M.vinterior, canvas: M.vcanvas, vlight: M.vlight, vtail: M.vtail, vind: M.vind, plate: M.plate, livery: M.livery, badge: M.badge, route: M.route, police: M.police, amb: M.amb, lbBlue: M.lbBlue, lbRed: M.lbRed };
  let beacons = null; if (T.police || T.ambulance) { byName.lbBlue = M.lbBlue.clone(); byName.lbRed = M.lbRed.clone(); beacons = { blue: byName.lbBlue, red: byName.lbRed }; } // per vehicle: only responding units flash
  const g = new THREE.Group(); const tailMat = M.vtail.clone(); const indMat = M.vind.clone(); const headMat = M.vlight.clone(); const revMat = M.vrev.clone(); byName.vtail = tailMat; byName.vind = indMat; byName.vlight = headMat; byName.vrev = revMat; headMat.emissiveIntensity = 0.04; tailMat.emissiveIntensity = 0.03; revMat.emissiveIntensity = 0; // per vehicle (start dark): each car's own lamps
  directionalLamp(headMat, 1); directionalLamp(tailMat, -1); directionalLamp(revMat, -1); // lamps glow only from the lens face (seen through the cabin glass from the other end they stay dark)
  const bodyMeshes = {}, shared = {}, mats = {}; for (const [name, geo] of cached.geos) { const mesh = new THREE.Mesh(geo, byName[name] || MAT.paint); mesh.name = name; bodyMeshes[name] = mesh; shared[name] = geo; mats[name] = mesh.material; mesh.castShadow = !NO_CAST.has(name); mesh.receiveShadow = name === 'paint'; if (name === 'glass') mesh.renderOrder = 2; mesh.matrixAutoUpdate = false; g.add(mesh); } /* body parts never move inside the vehicle: skip recomposing their local matrix every frame */
  const det = new THREE.Group(); det.name = 'detail'; det.visible = false; byName.lens = M.vlens; byName.vrefl = M.vrefl;
  for (const [name, geo] of cached.dgeos) { const mesh = new THREE.Mesh(geo, byName[name] || M.vchrome); mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = name === 'paint'; if (name === 'glass' || name === 'lens') mesh.renderOrder = 2; mesh.matrixAutoUpdate = false; det.add(mesh); }
  det.userData.host = g; /* added by setVehicleLOD when near */ const base = T.base || type; const wkind = base === 'bike' ? 'bike' : (base === 'bus' || base === 'pbus' || base === 'lorry' || T.family === 'truck') ? 'heavy' : 'car';
  const wp = wheelParts(T.wheelR, cached.wheels[0][3], cached.wheelStyle);
  const wheels = cached.wheels.map(([x, y, z, w]) => {
    const parts = w === cached.wheels[0][3] ? wp : wheelParts(T.wheelR, w, cached.wheelStyle);
    const pivot = new THREE.Group(); pivot.position.set(x, y, z); const spin = new THREE.Group();
    const tyre = new THREE.Mesh(parts.tyre, M.vtyre); const rim = new THREE.Mesh(parts.rim, M.vrim); tyre.castShadow = true;
    const holder = new THREE.Group(); holder.add(tyre, rim); if (x < 0) holder.rotation.y = Math.PI; spin.add(holder); pivot.add(spin);
    const hp = hiWheelParts(T.wheelR, w, cached.wheelStyle, wkind, KIT, z > 0); const hi = new THREE.Group(); const t2 = new THREE.Mesh(hp.tyre, M.vtyre); t2.castShadow = true; hi.add(t2, new THREE.Mesh(hp.rim, M.vrim)); if (x < 0) hi.rotation.y = Math.PI; hi.visible = false; spin.add(hi);
    let cal = null; if (hp.caliper) { cal = new THREE.Mesh(hp.caliper, M.vrim); if (x < 0) cal.rotation.y = Math.PI; cal.visible = false; pivot.add(cal); }
    for (const o of [holder, tyre, rim, hi, ...hi.children, cal]) if (o) { o.updateMatrix(); o.matrixAutoUpdate = false; } // fixed inside the wheel: only pivot (steer, suspension) and spin move
    holder.userData.host = hi.userData.host = spin; spin.remove(hi); if (cal) { cal.userData.host = pivot; pivot.remove(cal); } // far LOD at birth: see setVehicleLOD
    pivot.userData.lo = holder; pivot.userData.hi = hi; pivot.userData.cal = cal;
    pivot.userData.spin = spin; pivot.userData.front = z > 0; pivot.userData.baseY = y; g.add(pivot); return pivot;
  });
  // doors: shut ones are part of the body meshes; DoorRig puts a moving one on its pivot (front edge hinge / sliding track)
  const doors = (cached.doors || []).map((d, i) => { const pivot = new THREE.Group(); pivot.position.set(d.hinge[0], 0, d.hinge[1]); pivot.visible = false; pivot.name = 'door' + i; g.add(pivot);
    const o = { pivot, i, side: d.side, role: d.role, slide: d.role === 'slide', leaf: d.leaf || 0, cab: !!d.cab, gripY: d.gripY, open: 0, max: d.max ?? (d.leaf ? 1.45 : d.role === 'rear' ? 1.05 : 1.15), ang: 0, vel: 0, len: d.len, hx: d.hinge[0], hz: d.hinge[1], rects: (d.spec && d.spec.rects) || (d.cab && d.cab.rects), live: false, grab: doorGrab(d) }; poseDoor(o); return o; });
  if (doors.length) for (const name in cached.doorRanges) if (!mats[name]) mats[name] = byName[name] || MAT.paint; // a material only the doors use
  const door = doors.find((d) => !d.leaf) || null; // car door the driver uses (bus door leaves are not)
  const ds = cached.seats.find((s) => s.driver) || cached.seats[0];
  const side = T.entry === 'bike' ? 1 : -1; const hw = T.wid / 2;
  // hinged door: stand just outside the door's swing arc, a little behind its rear edge (radius len + 0.3 from the hinge, 40° back
  // from the body side) so the opening door passes in front of the body and the way in runs behind the opened panel
  const dR = door ? door.len + 0.3 : 0;
  const entry = cached.busDoor ? { x: cached.busDoor[0], z: cached.busDoor[1], side: cached.busDoor[0] < 0 ? -1 : 1 } : door ? { x: side * (hw + dR * Math.sin(0.7)), z: cached.doors[0].hinge[1] - dR * Math.cos(0.7), side } : { x: side * (hw + (T.entry === 'tuk' ? 0.35 : T.entry === 'bike' ? 0.45 : 0.55)), z: ds.z, side };
  { if (!contactGeo) contactGeo = contactShadowGeo();
    const bikeish = base === 'bike' || base === 'tuktuk'; const cs = new THREE.Mesh(contactGeo, M.contact); cs.name = 'contactShadow';
    cs.scale.set(T.wid * (bikeish ? 1.7 : 1.42), 1, T.len * 1.22); /* core (34/64 × 40/64 of the quad) ≈ body footprint, soft edge beyond */ cs.position.y = 0.015; cs.raycast = () => {}; cs.castShadow = cs.receiveShadow = false; cs.renderOrder = 1;
    cs.updateMatrix(); cs.matrixAutoUpdate = false; g.add(cs); }
  const rear = T.ambulance ? buildAmbRear() : null; if (rear) g.add(rear.group); // twin rear doors + lit cabin (opened by the medics)
  const stand = base === 'bike' ? standMeshes(M.vrim) : null; if (stand) g.add(stand); // animated side stand (Kickstand.js)
  g.userData = { wheelStyle: cached.wheelStyle, exhaust: cached.exhaust, doors, bake: doors.length ? { ranges: cached.doorRanges, meshes: bodyMeshes, shared, mats, pivotGeos: (i) => slicePivotGeos(cached, i) } : null, stand, detail: det, lodNear: false, lodR: wkind === 'heavy' ? 80 : wkind === 'bike' ? 45 : 60, lodFar: false, farR: wkind === 'heavy' ? 160 : wkind === 'bike' ? 0 : 140, farHide: ['interior', 'dash', 'plate', 'badge'].map((n) => bodyMeshes[n]).filter(Boolean), /* far LOD (Vehicle.updateVehicleLOD): cabin, plate, badges off beyond farR — lamps stay */ wheels, tailMat, indMat, headMat, revMat, seats: cached.seats, type, color, steerWheel: cached.steerWheel, door, entry, beacons, rear, cabStep: cached.cabStep };
  return g;
}
// darken lower panels and add per-vehicle grime variation to working vehicles
function dirty(g, seed) {
  const p = g.attributes.position, c = g.attributes.color; const r = new RNG(seed * 7 + 3);
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = (0.78 + 0.22 * sstep(0.15, 0.9, y)) * (0.93 + 0.07 * Math.sin(p.getX(i) * 9.1 + p.getZ(i) * 3.7 + r.next())); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k * 0.97); }
  c.needsUpdate = true;
}
