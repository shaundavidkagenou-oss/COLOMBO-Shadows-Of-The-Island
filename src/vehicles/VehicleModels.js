// Procedural vehicle models typical of Colombo streets. Local frame: +z forward, y up, origin at ground under the vehicle centre.
import * as THREE from 'three';
import { MeshBuilder, MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { RNG } from '../core/rng.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const VTYPES = {
  tuktuk: { len: 2.65, wid: 1.3, hgt: 1.75, wheelR: 0.24, maxSpeed: 15, accel: 3.2, mass: 350, seats: 3, steer: 0.62, sound: 'tuk', colors: ['#1b6b3a', '#b51f1f', '#1d3f8a', '#e0b420', '#6b1f2a', '#202020', '#e05a1a', '#2a7a8a'] },
  car: { len: 4.0, wid: 1.68, hgt: 1.5, wheelR: 0.31, maxSpeed: 38, accel: 5.5, mass: 1100, seats: 4, steer: 0.55, sound: 'car', colors: ['#e9e9e6', '#c0c4c8', '#2a2c30', '#8c1c22', '#1f3a6b', '#6b6f74', '#f2f2f0', '#3a4a3a', '#b8a888'] },
  sedan: { len: 4.45, wid: 1.72, hgt: 1.45, wheelR: 0.32, maxSpeed: 42, accel: 6, mass: 1250, seats: 4, steer: 0.52, sound: 'car', colors: ['#f2f2f0', '#c0c4c8', '#1a1c20', '#6b6f74', '#24365a', '#5a1a1a'] },
  taxi: { len: 4.0, wid: 1.68, hgt: 1.5, wheelR: 0.31, maxSpeed: 36, accel: 5.2, mass: 1100, seats: 4, steer: 0.55, sound: 'car', colors: ['#f2c21a'] },
  van: { len: 4.7, wid: 1.72, hgt: 2.0, wheelR: 0.33, maxSpeed: 34, accel: 4.6, mass: 1800, seats: 8, steer: 0.5, sound: 'van', colors: ['#f4f4f2', '#e8e8e4', '#c0c4c8', '#1a1c20'] },
  suv: { len: 4.8, wid: 1.9, hgt: 1.85, wheelR: 0.38, maxSpeed: 44, accel: 6.5, mass: 2100, seats: 5, steer: 0.5, sound: 'van', colors: ['#111214'] },
  bus: { len: 11, wid: 2.5, hgt: 3.15, wheelR: 0.5, maxSpeed: 24, accel: 2.0, mass: 9000, seats: 40, steer: 0.42, sound: 'bus', colors: ['#9c1c1c'] },
  pbus: { len: 10.4, wid: 2.45, hgt: 3.1, wheelR: 0.5, maxSpeed: 26, accel: 2.2, mass: 8500, seats: 40, steer: 0.42, sound: 'bus', colors: ['#f4f4f2', '#2a5aa8', '#e8e0d0', '#1f7a5a'] },
  lorry: { len: 7.2, wid: 2.3, hgt: 3.0, wheelR: 0.48, maxSpeed: 24, accel: 2.0, mass: 7000, seats: 2, steer: 0.45, sound: 'bus', colors: ['#1d4f8a', '#b51f1f', '#e0b420', '#2a6b3a'] },
  bike: { len: 1.95, wid: 0.7, hgt: 1.1, wheelR: 0.3, maxSpeed: 30, accel: 6.5, mass: 160, seats: 2, steer: 0.7, sound: 'bike', colors: ['#151515', '#b51f1f', '#1d3f8a', '#e8e8e4', '#5a6b3a'] },
};

// lofted body from cross-sections [z, y0, y1, halfW0 (bottom), halfW1 (top), round]
function loft(mb, secs, col, { capFront = true, capBack = true } = {}) {
  const ring = (s) => { const [z, y0, y1, w0, w1, r = 0.12] = s; const h = y1 - y0; const rr = Math.min(r, h * 0.45);
    return [[-w0 + rr * 0.3, y0], [w0 - rr * 0.3, y0], [w0, y0 + rr], [w0 + (w1 - w0) * 0.55, y0 + h * 0.55], [w1, y1 - rr], [w1 - rr, y1], [-w1 + rr, y1], [-w1, y1 - rr], [-(w0 + (w1 - w0) * 0.55), y0 + h * 0.55], [-w0, y0 + rr]].map(([x, y]) => [x, y, z]); };
  const rings = secs.map(ring); const n = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < n; k++) { const a = rings[i][k], b = rings[i][(k + 1) % n], c = rings[i + 1][(k + 1) % n], d = rings[i + 1][k]; mb.quad(a, b, c, d, [0, 0, 1, 1], col); }
  const cap = (r, front) => { const ctr = r.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]); for (let k = 0; k < n; k++) { const a = r[k], b = r[(k + 1) % n]; if (front) mb.quad(ctr, b, a, ctr, [0, 0, 1, 1], col); else mb.quad(ctr, a, b, ctr, [0, 0, 1, 1], col); } };
  if (capBack) cap(rings[0], false); if (capFront) cap(rings[rings.length - 1], true);
}
const wheelGeos = new Map();
export function wheelGeometry(r, w) {
  const k = r + ':' + w; if (wheelGeos.has(k)) return wheelGeos.get(k);
  const mb = new MeshBuilder();
  // tyre (axis along x), built as cylinder rotated
  const seg = 16; const tyre = C('#151515'), rim = C('#9aa0a6');
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2; const P = (a, rr, x) => [x, Math.sin(a) * rr, Math.cos(a) * rr];
    mb.quad(P(a0, r, -w / 2), P(a1, r, -w / 2), P(a1, r, w / 2), P(a0, r, w / 2), [0, 0, 1, 1], tyre);
    for (const sx of [-1, 1]) { const x = sx * w / 2; if (sx > 0) { mb.quad(P(a0, r, x), P(a1, r, x), P(a1, r * 0.62, x), P(a0, r * 0.62, x), [0, 0, 1, 1], tyre); mb.quad(P(a0, r * 0.62, x), P(a1, r * 0.62, x), P(a1, 0.02, x + 0.01), P(a0, 0.02, x + 0.01), [0, 0, 1, 1], i % 4 === 0 ? C('#555a60') : rim); } else { mb.quad(P(a1, r, x), P(a0, r, x), P(a0, 0.02, x), P(a1, 0.02, x), [0, 0, 1, 1], tyre); } }
  }
  const g = mb.build(); wheelGeos.set(k, g); return g;
}

let lightMat = null, tailMatBase = null, indicatorMat = null; const routeMats = [];
// Destination boards: route number + destination (Sinhala/English). Wording limited to verified place names.
const ROUTES = [['138', 'කොටුව', 'FORT'], ['100', 'පිටකොටුව', 'PETTAH'], ['154', 'බොරැල්ල', 'BORELLA']];
function routeMat(i) {
  if (routeMats[i]) return routeMats[i];
  const c = document.createElement('canvas'); c.width = 512; c.height = 80; const g = c.getContext('2d');
  g.fillStyle = '#0c0c0c'; g.fillRect(0, 0, 512, 80); g.fillStyle = '#ffb020'; g.font = 'bold 54px "Barlow Condensed", sans-serif'; g.textBaseline = 'middle'; g.fillText(ROUTES[i][0], 14, 42);
  g.font = '600 40px "Noto Sans Sinhala", sans-serif'; g.fillText(ROUTES[i][1], 120, 42); g.font = 'bold 40px "Barlow Condensed", sans-serif'; g.textAlign = 'right'; g.fillText(ROUTES[i][2], 500, 42);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return (routeMats[i] = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.4 }));
}
export function vehicleMaterials() {
  if (!lightMat) {
    lightMat = new THREE.MeshStandardMaterial({ color: 0xf4f4ee, emissive: 0xfff4dd, emissiveIntensity: 0.2, roughness: 0.2 });
    tailMatBase = new THREE.MeshStandardMaterial({ color: 0x7a0a0a, emissive: 0xff1a10, emissiveIntensity: 0.15, roughness: 0.3 });
    indicatorMat = new THREE.MeshStandardMaterial({ color: 0xa06010, emissive: 0xffa020, emissiveIntensity: 0, roughness: 0.3 });
  }
  return { lightMat, tailMatBase, indicatorMat };
}
export function setVehicleNight(n) { vehicleMaterials(); lightMat.emissiveIntensity = 0.2 + n * 3.5; tailMatBase.emissiveIntensity = 0.15 + n * 1.6; }

// Number plates (Sri Lankan format: province + letters + digits; white front, yellow rear). Atlas rows 0-3 rear, 4-7 front.
let plateMat = null;
function plateMaterial() {
  if (plateMat) return plateMat;
  const c = document.createElement('canvas'); c.width = 256; c.height = 512; const g = c.getContext('2d'); const r = new RNG(77);
  for (let i = 0; i < 8; i++) { const y = i * 64; g.fillStyle = i < 4 ? '#f2c818' : '#f4f4f0'; g.fillRect(0, y, 256, 64); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(3, y + 3, 250, 58);
    g.fillStyle = '#111'; g.font = 'bold 15px "Barlow Condensed", sans-serif'; g.textBaseline = 'middle'; g.fillText('WP', 12, y + 32);
    g.font = 'bold 44px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; const L = 'ABCDKLNPQ'; g.fillText(`${L[r.int(0, L.length - 1)]}${L[r.int(0, L.length - 1)]}${L[r.int(0, L.length - 1)]}-${r.int(1000, 9999)}`, 140, y + 34); g.textAlign = 'left'; }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (plateMat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.45, metalness: 0.1 }));
}
function plateQuad(mb, cx, cy, z, hw, hh, front, variant) {
  const row = (front ? 4 : 0) + (variant % 4); const v0 = 1 - (row + 1) / 8 + 0.004, v1 = 1 - row / 8 - 0.004; const pm = mb.get('plate');
  if (front) pm.quad([cx - hw, cy - hh, z], [cx + hw, cy - hh, z], [cx + hw, cy + hh, z], [cx - hw, cy + hh, z], [0, v0, 1, v1], C('#fff'));
  else pm.quad([cx + hw, cy - hh, z], [cx - hw, cy - hh, z], [cx - hw, cy + hh, z], [cx + hw, cy + hh, z], [0, v0, 1, v1], C('#fff'));
}

const modelCache = new Map();
function buildModel(type, color, variant) {
  const T = VTYPES[type]; const mb = new MultiBuilder(); const paint = mb.get('paint'), dark = mb.get('metal'), glass = mb.get('glass'), lights = mb.get('vlight'), tails = mb.get('vtail');
  const col = C(color), black = C('#1a1a1c'), chrome = C('#b8bcc0'), L = T.len, W = T.wid / 2, H = T.hgt; const seats = [];
  const R = T.wheelR;
  if (type === 'tuktuk') {
    // Bajaj-style three-wheeler. Hood canvas is black on some, body-coloured on others (both common in Colombo).
    const hood = variant % 2 ? col : C('#1c1c1e'); const ds = mb.get('paintDS'); const trim = variant === 2 ? C('#f2f2ee') : C('#d4af37');
    loft(paint, [[-1.25, 0.32, 0.95, 0.62, 0.64, 0.1], [-0.2, 0.32, 0.95, 0.64, 0.64, 0.1], [0.35, 0.3, 0.75, 0.55, 0.5, 0.1]], col);
    loft(paint, [[0.35, 0.28, 1.05, 0.5, 0.45, 0.1], [0.95, 0.3, 0.98, 0.32, 0.3, 0.14], [1.2, 0.36, 0.7, 0.16, 0.14, 0.08]], col);
    // rounded canopy with a short canvas valance down the sides
    loft(ds, [[-1.3, 1.4, 1.8, 0.665, 0.5, 0.22], [-1.18, 1.38, 1.83, 0.67, 0.53, 0.22], [0.78, 1.38, 1.82, 0.67, 0.53, 0.22], [0.93, 1.44, 1.75, 0.64, 0.5, 0.16]], hood);
    for (const [x, z] of [[-0.6, -1.22], [0.6, -1.22], [-0.55, 0.85], [0.55, 0.85]]) dark.box(x, 1.17, z, 0.04, 0.46, 0.04, { col: black });
    // rear canvas with a clear window (faces -z)
    const rzC = -1.27, q = (x0, x1, y0, y1) => ds.quad([x1, y0, rzC], [x0, y0, rzC], [x0, y1, rzC], [x1, y1, rzC], [0, 0, 1, 1], hood);
    q(-0.64, -0.36, 0.95, 1.42); q(0.36, 0.64, 0.95, 1.42); q(-0.36, 0.36, 0.95, 1.08); q(-0.36, 0.36, 1.34, 1.42);
    glass.quad([0.36, 1.08, rzC + 0.01], [-0.36, 1.08, rzC + 0.01], [-0.36, 1.34, rzC + 0.01], [0.36, 1.34, rzC + 0.01], [0, 0, 1, 1], C('#fff'));
    // windscreen + frame, mirrors
    glass.quad([-0.5, 1.05, 0.98], [0.5, 1.05, 0.98], [0.52, 1.42, 0.9], [-0.52, 1.42, 0.9], [0, 0, 1, 1], C('#fff'));
    dark.box(0, 1.04, 0.98, 1.06, 0.04, 0.04, { col: black }); dark.box(0, 1.42, 0.9, 1.08, 0.04, 0.04, { col: black });
    for (const sx of [-1, 1]) { dark.box(sx * 0.6, 1.1, 0.96, 0.02, 0.14, 0.02, { col: chrome }); dark.box(sx * 0.66, 1.2, 0.96, 0.12, 0.08, 0.025, { col: black }); }
    // lamps, rear bar, mudflaps, front mudguard
    lights.box(0, 0.86, 1.02, 0.18, 0.12, 0.08); for (const sx of [-1, 1]) { tails.box(sx * 0.5, 0.72, -1.262, 0.09, 0.2, 0.03); dark.box(sx * 0.58, 0.2, -1.1, 0.17, 0.26, 0.015, { col: black }); dark.box(sx * 0.5, 0.36, -1.29, 0.03, 0.03, 0.08, { col: chrome }); }
    dark.box(0, 0.36, -1.33, 1.12, 0.045, 0.045, { col: chrome });
    paint.box(0, R * 2 + 0.05, 1.0, 0.18, 0.03, 0.44, { col }); dark.box(0, 0.62, 1.0, 0.05, 0.6, 0.05, { col: black });
    plateQuad(mb, 0, 0.57, -1.258, 0.17, 0.06, false, variant); plateQuad(mb, 0, 0.47, 1.205, 0.12, 0.045, true, variant);
    // seats + interior, trim stripe along the side
    dark.box(0, 0.62, -0.75, 1.15, 0.12, 0.5, { col: C('#2a2420') }); dark.box(0, 0.95, -1.05, 1.15, 0.55, 0.1, { col: C('#2a2420') });
    dark.box(0, 1.05, 0.55, 0.62, 0.04, 0.04, { col: chrome }); dark.box(0, 0.6, 0.2, 0.36, 0.1, 0.36, { col: C('#2a2420') });
    paint.box(0, 0.36, -0.45, 1.29, 0.03, 1.55, { col: trim, top: false }); paint.box(0, 0.82, -0.5, 1.296, 0.045, 1.5, { col: trim, top: false });
    seats.push({ x: 0, y: 0.68, z: 0.15, driver: true }, { x: -0.3, y: 0.68, z: -0.75 }, { x: 0.3, y: 0.68, z: -0.75 });
    return { mb, wheels: [[0, R, 1.0, 0.12], [-0.58, R, -0.85, 0.14], [0.58, R, -0.85, 0.14]], seats, steerWheel: [0, 1.05, 0.55] };
  }
  if (type === 'bike') {
    loft(paint, [[-0.6, 0.55, 0.78, 0.13, 0.11, 0.06], [0.1, 0.5, 0.8, 0.15, 0.14, 0.06], [0.55, 0.55, 0.95, 0.1, 0.08, 0.06]], col);
    dark.box(0, 0.86, -0.25, 0.26, 0.08, 0.7, { col: C('#151515') }); dark.box(0, 0.45, 0.0, 0.18, 0.2, 0.5, { col: C('#555') });
    dark.box(0, 0.62, 0.72, 0.05, 0.6, 0.05, { col: chrome, rotY: 0 }); dark.box(0, 1.0, 0.68, 0.62, 0.04, 0.04, { col: black });
    lights.box(0, 0.95, 0.8, 0.14, 0.12, 0.06); tails.box(0, 0.8, -0.62, 0.12, 0.06, 0.04);
    seats.push({ x: 0, y: 0.9, z: -0.1, driver: true, ride: true }, { x: 0, y: 0.92, z: -0.45, ride: true });
    return { mb, wheels: [[0, R, 0.7, 0.1], [0, R, -0.68, 0.12]], seats, steerWheel: [0, 1.0, 0.68] };
  }
  if (type === 'bus' || type === 'pbus' || type === 'lorry' || type === 'van' || type === 'suv') {
    const box = type !== 'lorry';
    if (type === 'van' || type === 'suv') {
      const hood = type === 'suv' ? 0.95 : 0.55; const roofY = H; const belt = type === 'suv' ? 1.1 : 1.05;
      loft(paint, [[-L / 2, 0.38, belt, W - 0.02, W - 0.06, 0.12], [L / 2 - hood, 0.36, belt, W, W - 0.04, 0.12], [L / 2 - 0.08, 0.4, belt * 0.92, W - 0.06, W - 0.1, 0.14], [L / 2, 0.45, belt * 0.85, W - 0.14, W - 0.18, 0.1]], col);
      loft(glass, [[-L / 2 + 0.06, belt, roofY - 0.08, W - 0.07, W - 0.12, 0.04], [L / 2 - hood - 0.1, belt, roofY - 0.08, W - 0.05, W - 0.12, 0.04], [L / 2 - hood + 0.3, belt, belt + 0.05, W - 0.06, W - 0.12, 0.02]], C('#fff'), { capFront: true });
      paint.hrect(-W + 0.1, -L / 2 + 0.05, W - 0.1, L / 2 - hood - 0.12, roofY - 0.06, 1, col);
      paint.box(0, roofY - 0.04, -L / 2 + 0.03 + (L - hood) / 2 - 0.1, W * 2 - 0.2, 0.06, L - hood - 0.15, { col });
      for (const z of [L / 2 - hood - 0.1, -0.2, -L / 2 + 0.08]) for (const sx of [-1, 1]) paint.box(sx * (W - 0.09), (belt + roofY) / 2, z, 0.06, roofY - belt, 0.08, { col: z > 0 ? col : black });
      dark.box(0, 0.45, L / 2 + 0.02, W * 2 - 0.2, 0.18, 0.08, { col: type === 'suv' ? C('#2a2a2a') : chrome });
      lights.box(-W + 0.25, belt * 0.8, L / 2 - 0.03, 0.3, 0.12, 0.05); lights.box(W - 0.25, belt * 0.8, L / 2 - 0.03, 0.3, 0.12, 0.05);
      tails.box(-W + 0.12, belt * 0.85, -L / 2 - 0.01, 0.14, 0.3, 0.04); tails.box(W - 0.12, belt * 0.85, -L / 2 - 0.01, 0.14, 0.3, 0.04);
      seats.push({ x: -0.38, y: 0.62, z: 0.3, driver: true }, { x: 0.38, y: 0.62, z: 0.3 }, { x: 0.38, y: 0.62, z: -0.7 }, { x: -0.38, y: 0.62, z: -0.7 });
      const wz = L / 2 - hood - 0.15; return { mb, wheels: [[-W + 0.14, R, wz, 0.22], [W - 0.14, R, wz, 0.22], [-W + 0.14, R, -L / 2 + 0.8, 0.22], [W - 0.14, R, -L / 2 + 0.8, 0.22]], seats, steerWheel: [-0.38, 1.05, 0.75] };
    }
    if (box) {
      // bus: boxy body with window band, colourful stripes
      const red = type === 'bus'; const y0 = 0.45, belt = 1.55, top = H; const stripe = red ? C('#e8b820') : C(variant % 2 ? '#d43a2a' : '#e8a020');
      loft(paint, [[-L / 2, y0, belt, W, W, 0.1], [L / 2, y0, belt, W, W, 0.1]], col);
      loft(glass, [[-L / 2 + 0.02, belt, top - 0.3, W - 0.03, W - 0.05, 0.03], [L / 2 - 0.02, belt, top - 0.3, W - 0.03, W - 0.05, 0.03]], C('#fff'));
      loft(paint, [[-L / 2, top - 0.3, top, W - 0.05, W - 0.15, 0.2], [L / 2, top - 0.3, top, W - 0.05, W - 0.15, 0.2]], red ? C('#8a1a1a') : col);
      for (const sx of [-1, 1]) { paint.box(sx * (W + 0.005), belt - 0.25, 0, 0.02, 0.16, L - 0.4, { col: stripe }); paint.box(sx * (W + 0.005), 0.75, 0, 0.02, 0.1, L - 0.4, { col: red ? C('#f2f2ee') : C('#1a3a8a') }); for (let z = -L / 2 + 1.2; z < L / 2 - 0.5; z += 1.25) paint.box(sx * (W - 0.02), (belt + top - 0.3) / 2, z, 0.06, top - 0.3 - belt, 0.09, { col: C('#202020') }); }
      // door gap (left side, front) — left-hand traffic: doors on the left (−x is the kerb side when driving +z? kerb is on the left = +x for +z heading)
      paint.box(W + 0.01, 1.4, L / 2 - 1.6, 0.03, 2.1, 1.0, { col: C('#2a2a2a') });
      lights.box(-W + 0.35, 0.9, L / 2 + 0.01, 0.35, 0.18, 0.04); lights.box(W - 0.35, 0.9, L / 2 + 0.01, 0.35, 0.18, 0.04);
      mb.get('route' + (variant % 3)).quad([-0.95, top - 0.33, L / 2 + 0.03], [0.95, top - 0.33, L / 2 + 0.03], [0.95, top - 0.04, L / 2 + 0.03], [-0.95, top - 0.04, L / 2 + 0.03], [0, 0, 1, 1]);
      tails.box(-W + 0.2, 0.95, -L / 2 - 0.01, 0.2, 0.3, 0.04); tails.box(W - 0.2, 0.95, -L / 2 - 0.01, 0.2, 0.3, 0.04);
      dark.box(0, 0.42, L / 2 + 0.05, W * 2, 0.2, 0.12, { col: black }); dark.box(0, 0.42, -L / 2 - 0.05, W * 2, 0.2, 0.12, { col: black });
      seats.push({ x: -0.75, y: 1.0, z: L / 2 - 1.0, driver: true });
      return { mb, wheels: [[-W + 0.2, R, L / 2 - 2.0, 0.3], [W - 0.2, R, L / 2 - 2.0, 0.3], [-W + 0.25, R, -L / 2 + 2.6, 0.5], [W - 0.25, R, -L / 2 + 2.6, 0.5]], seats, steerWheel: [-0.75, 1.5, L / 2 - 0.6] };
    }
    // lorry: cab + flat bed with side boards (tarp)
    const cabL = 1.9; const cz = L / 2 - cabL / 2;
    loft(paint, [[L / 2 - cabL, 0.7, 1.75, W, W - 0.05, 0.1], [L / 2, 0.7, 1.75, W - 0.04, W - 0.08, 0.1]], col);
    loft(glass, [[L / 2 - cabL + 0.05, 1.75, 2.55, W - 0.05, W - 0.12, 0.05], [L / 2 - 0.1, 1.75, 2.45, W - 0.08, W - 0.16, 0.05]], C('#fff'));
    paint.box(0, 2.62, cz - 0.05, W * 2 - 0.2, 0.15, cabL - 0.2, { col });
    dark.box(0, 0.75, -cabL / 2 + 0.1, W * 2, 0.2, L - cabL, { col: C('#2a2420') });
    for (const sx of [-1, 1]) mb.get('paintDS').box(sx * (W - 0.03), 1.45, -cabL / 2 + 0.1, 0.05, 1.2, L - cabL - 0.1, { col: C(variant % 2 ? '#c49a3a' : '#3a5a8a') });
    mb.get('paintDS').box(0, 1.45, -L / 2 + 0.05, W * 2, 1.2, 0.05, { col: C('#c49a3a') });
    mb.get('paintDS').box(0, 2.15, -cabL / 2 + 0.1, W * 2 + 0.04, 0.12, L - cabL - 0.1, { col: C('#2f5a3a') }); // tarp
    lights.box(-W + 0.3, 1.0, L / 2 + 0.01, 0.3, 0.2, 0.04); lights.box(W - 0.3, 1.0, L / 2 + 0.01, 0.3, 0.2, 0.04); tails.box(-W + 0.2, 0.8, -L / 2 - 0.01, 0.2, 0.15, 0.04); tails.box(W - 0.2, 0.8, -L / 2 - 0.01, 0.2, 0.15, 0.04);
    seats.push({ x: -0.55, y: 1.25, z: cz, driver: true });
    return { mb, wheels: [[-W + 0.2, R, L / 2 - 1.1, 0.3], [W - 0.2, R, L / 2 - 1.1, 0.3], [-W + 0.25, R, -L / 2 + 1.5, 0.5], [W - 0.25, R, -L / 2 + 1.5, 0.5]], seats, steerWheel: [-0.55, 1.75, L / 2 - 0.4] };
  }
  // cars (hatch / sedan / taxi)
  const sedan = type === 'sedan'; const belt = 0.95, roof = H; const fz = L / 2, rz = -L / 2;
  loft(paint, [[rz, 0.32, belt, W - 0.12, W - 0.1, 0.14], [rz + 0.15, 0.28, belt, W - 0.02, W - 0.02, 0.14], [fz - 0.9, 0.28, belt - 0.02, W, W - 0.03, 0.14], [fz - 0.15, 0.32, 0.78, W - 0.06, W - 0.1, 0.16], [fz, 0.38, 0.68, W - 0.2, W - 0.25, 0.12]], col);
  const cabR = sedan ? rz + 0.75 : rz + 0.1, cabF = fz - 1.25;
  loft(glass, [[cabR, belt - 0.01, roof - 0.07, W - 0.08, W - 0.22, 0.05], [cabR + 0.25, belt - 0.01, roof - 0.04, W - 0.06, W - 0.2, 0.05], [cabF - 0.2, belt - 0.01, roof - 0.04, W - 0.06, W - 0.2, 0.05], [cabF + 0.35, belt - 0.01, belt + 0.06, W - 0.06, W - 0.1, 0.03]], C('#fff'));
  paint.box(0, roof - 0.03, (cabR + 0.15 + cabF - 0.15) / 2, (W - 0.22) * 2, 0.05, cabF - cabR - 0.35, { col });
  if (sedan) loft(paint, [[rz + 0.02, belt - 0.05, belt + 0.05, W - 0.1, W - 0.15, 0.04], [cabR + 0.02, belt - 0.05, belt + 0.06, W - 0.1, W - 0.15, 0.04]], col);
  for (const sx of [-1, 1]) { paint.box(sx * (W - 0.1), (belt + roof) / 2 - 0.02, (cabR + cabF) / 2 - 0.1, 0.06, roof - belt - 0.06, 0.08, { col }); dark.box(sx * (W + 0.02), belt - 0.08, cabF + 0.05, 0.08, 0.06, 0.14, { col: black }); }
  dark.box(0, 0.36, fz - 0.02, W * 2 - 0.3, 0.14, 0.06, { col: black }); dark.box(0, 0.36, rz + 0.02, W * 2 - 0.25, 0.14, 0.06, { col: black });
  lights.box(-W + 0.28, 0.66, fz - 0.06, 0.3, 0.1, 0.08); lights.box(W - 0.28, 0.66, fz - 0.06, 0.3, 0.1, 0.08);
  tails.box(-W + 0.16, 0.8, rz + 0.06, 0.22, 0.14, 0.06); tails.box(W - 0.16, 0.8, rz + 0.06, 0.22, 0.14, 0.06);
  if (type === 'taxi') { paint.box(0, roof + 0.1, (cabR + cabF) / 2, 0.5, 0.16, 0.22, { col: C('#151515') }); lights.box(0, roof + 0.1, (cabR + cabF) / 2 + 0.115, 0.42, 0.1, 0.01); }
  plateQuad(mb, 0, 0.58, rz - 0.006, 0.2, 0.055, false, variant); plateQuad(mb, 0, 0.5, fz + 0.006, 0.19, 0.05, true, variant);
  seats.push({ x: -0.36, y: 0.5, z: -0.05, driver: true }, { x: 0.36, y: 0.5, z: -0.05 }, { x: 0.36, y: 0.5, z: -0.95 }, { x: -0.36, y: 0.5, z: -0.95 });
  const wf = fz - 0.75, wr = rz + 0.7;
  return { mb, wheels: [[-W + 0.13, R, wf, 0.2], [W - 0.13, R, wf, 0.2], [-W + 0.13, R, wr, 0.2], [W - 0.13, R, wr, 0.2]], seats, steerWheel: [-0.36, 0.95, 0.35] };
}

// Returns a THREE.Group with .userData {wheels:[mesh], tailMat, seats, type}
export function createVehicleMesh(type, seed = 1) {
  const T = VTYPES[type]; const r = new RNG(seed); const color = r.pick(T.colors); const variant = r.int(0, 3);
  const key = type + color + variant; let cached = modelCache.get(key);
  const { lightMat, tailMatBase } = vehicleMaterials();
  if (!cached) {
    const m = buildModel(type, color, variant); const mats = { ...MAT, vlight: lightMat, vtail: tailMatBase, route0: routeMat(0), route1: routeMat(1), route2: routeMat(2), plate: plateMaterial() };
    const geos = []; for (const [name, b] of m.mb.b) { const g = b.build(); if (g) geos.push([name, g]); }
    cached = { geos, wheels: m.wheels, seats: m.seats, steerWheel: m.steerWheel, mats }; modelCache.set(key, cached);
  }
  const g = new THREE.Group(); const tailMat = tailMatBase.clone();
  for (const [name, geo] of cached.geos) { const mat = name === 'vtail' ? tailMat : cached.mats[name]; const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = name !== 'glass' && name !== 'vlight'; mesh.receiveShadow = name === 'paint'; g.add(mesh); }
  const wheels = cached.wheels.map(([x, y, z, w]) => { const pivot = new THREE.Group(); pivot.position.set(x, y, z); const wm = new THREE.Mesh(wheelGeometry(T.wheelR, w), MAT.paint); if (x < 0) wm.rotation.y = Math.PI; wm.castShadow = true; const spin = new THREE.Group(); spin.add(wm); pivot.add(spin); pivot.userData.spin = spin; pivot.userData.front = z > 0; g.add(pivot); return pivot; });
  g.userData = { wheels, tailMat, seats: cached.seats, type, color, steerWheel: cached.steerWheel };
  return g;
}
