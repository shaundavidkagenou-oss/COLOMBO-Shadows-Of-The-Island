// 77th request: "models that looks simple make them ultra detailed and realistic … try to keep the size and fps same".
//
// Detailed builders for the Ceylon Meridian Bank's furniture and fittings that used to be a handful of boxes. Everything is
// built to real dimensions from rounded parts, curved / lathed surfaces and two-sided leaf blades, and is merged straight into
// the room's existing per-material builders (Kit slots: plastic, steel, chrome, fabric, paint, glaze, metal, glass, gold,
// emissive), so the hall draws with exactly the same materials and draw calls as before; only the triangle count rises.
// No textures or files of their own (the surfaces are the hall's 2048² materials).
//   officeChair   five-star nylon base with tapered legs and twin-wheel castors, gas lift with its telescoping shroud, tilt
//                 mechanism + paddle, moulded seat shell, contoured waterfall cushion, curved back on its spine, T-arms
//   monitor       slim LED monitor: oval base, tilted neck, VESA hinge, thin bezel housing with rear bulge + vents, chin
//                 with power LED, cable — the screen quad stays exactly where it was (the LCD atlas)
//   keyboard      a full 104-key keyboard (key caps on a wedge plate) + mouse with wheel on a pad
//   plant         a glazed tapered pot with rim, soil + pebble top dressing, a Dracaena clump: canes with leaf scars and
//                 crowns of arching strap leaves (two-sided, base-to-tip colour, lighter midrib)
//   waitingChairTop  the instanced waiting-chair top (seat + back + arms) as contoured upholstery on a moulded shell
//   waterDispenser, ticketKiosk, litterBin, vaultDoor, frontShrub, brochureRack
// Seats keep their seat-top heights exactly (`top`): sitters are fitted to them (seatTopFor / fitSeat).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { C } from './ShopKit.js';

const ONE = new THREE.Vector3(1, 1, 1), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
// local frame at (x, y, z) turned by yaw about Y (the same turn as BankInterior's rot())
export const frameAt = (x, y, z, yaw = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), ONE);
// merge geo into builder b at local (lx, ly, lz), rotation (rx, ry, rz; YXZ), scale (sx, sy, sz) within frame F; disposes geo
export function put(b, F, geo, lx, ly, lz, rx = 0, ry = 0, rz = 0, col, sx = 1, sy = 1, sz = 1) {
  _m.compose(_v.set(lx, ly, lz), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)); b.geometry(geo, new THREE.Matrix4().multiplyMatrices(F, _m), col); geo.dispose(); }
export const rbox = (w, h, d, r, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)));
const cyl = (r0, r1, h, seg = 12, open = false) => new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
const lath = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(0.0005, r), h)), seg);
// bend a geometry: z += k·x² (a back rest curving round the sitter), then recompute normals
function bend(geo, k) { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + k * p.getX(i) * p.getX(i)); geo.computeVertexNormals(); return geo; }
// a cylinder between two local points (stems, cables, rods)
function rod(b, F, a, c, r0, r1, col, seg = 6) { const A = new THREE.Vector3(...a), B = new THREE.Vector3(...c); const d = B.clone().sub(A), L = d.length(); if (L < 1e-5) return;
  const g = cyl(r1, r0, L, seg, true); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); const M = new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, ONE);
  b.geometry(g, new THREE.Matrix4().multiplyMatrices(F, M), col); g.dispose(); }
let SEED = 1; const rnd = () => { SEED = (SEED * 16807) % 2147483647; return SEED / 2147483647; };

// ------------------------------------------------------------------------------------------------ office chair
export function officeChair(k, x, z, yaw, top, { high = false, col = '#2b2e34' } = {}) {
  const st = k.get('steel'), pl = k.get('plastic'), fb = k.get('fabric'), ch = st; /* no chrome slot: a teller chair is a Kit of its own — one more material would be one more draw */ const cc = C(col), blk = C('#18191b'), nyl = C('#1f2023');
  const F = frameAt(x, 0, z, yaw);
  // base: hub + five tapered legs sloping down to the castors
  put(pl, F, lath([[0.001, 0.07], [0.05, 0.07], [0.058, 0.085], [0.05, 0.125], [0.034, 0.13], [0.001, 0.13]], 18), 0, 0, 0, 0, 0, 0, nyl);
  for (let i = 0; i < 5; i++) { const an = i * Math.PI * 2 / 5, sa = Math.sin(an), ca = Math.cos(an);
    const leg = rbox(0.05, 0.034, 0.27, 0.012); const p = leg.attributes.position; for (let j = 0; j < p.count; j++) { const t = (p.getZ(j) + 0.135) / 0.27; p.setX(j, p.getX(j) * (1 - t * 0.35)); p.setY(j, p.getY(j) * (1 - t * 0.25) - t * 0.02); } leg.computeVertexNormals();
    put(pl, F, leg, sa * 0.165, 0.098, ca * 0.165, 0, an, 0, nyl);
    const cx = sa * 0.3, cz = ca * 0.3; put(pl, F, rbox(0.04, 0.03, 0.05, 0.012, 1), cx, 0.062, cz, 0, an, 0, blk); // castor hood
    put(st, F, cyl(0.006, 0.006, 0.02, 8), cx, 0.082, cz, 0, 0, 0, C('#8a8e93')); // stem
    for (const s of [-1, 1]) { const w = cyl(0.025, 0.025, 0.013, 14); put(pl, F, w, cx + ca * s * 0.009, 0.025, cz - sa * s * 0.009, 0, an, Math.PI / 2, blk); /* axle across the leg, the twin wheels side by side on it */ } }
  // gas lift: chrome piston, black telescoping shroud, tilt mechanism with its paddle
  const lift = Math.max(0.06, top - 0.27); put(ch, F, cyl(0.014, 0.014, lift, 14), 0, 0.13 + lift / 2, 0, 0, 0, 0, C('#cfd3d6'));
  put(pl, F, cyl(0.03, 0.033, Math.min(0.1, lift), 16), 0, 0.13 + Math.min(0.1, lift) / 2, 0, 0, 0, 0, blk);
  for (let r = 0; r < 3; r++) put(pl, F, cyl(0.034, 0.034, 0.004, 16), 0, 0.14 + r * 0.03, 0, 0, 0, 0, C('#111214')); // shroud rings
  put(pl, F, rbox(0.2, 0.05, 0.24, 0.012), 0, top - 0.13, -0.01, 0, 0, 0, blk); put(pl, F, rbox(0.1, 0.012, 0.03, 0.005, 1), 0.15, top - 0.135, 0.06, 0, 0, -0.15, blk); // mechanism + paddle
  // seat: moulded shell + contoured cushion (waterfall front), its top exactly at `top`
  put(pl, F, rbox(0.47, 0.03, 0.45, 0.012), 0, top - 0.093, 0, 0, 0, 0, blk);
  { const cu = rbox(0.5, 0.075, 0.48, 0.032, 3); const p = cu.attributes.position; for (let j = 0; j < p.count; j++) { const X = p.getX(j), Z = p.getZ(j), Y = p.getY(j); if (Y > 0.0) p.setY(j, Y - 0.006 * Math.exp(-((X * X) / 0.02 + ((Z + 0.03) ** 2) / 0.03)) - (Z > 0.18 ? (Z - 0.18) * 0.12 : 0)); } cu.computeVertexNormals();
    put(fb, F, cu, 0, top - 0.0375, 0, 0, 0, 0, cc); }
  put(fb, F, rbox(0.47, 0.006, 0.006, 0.002, 1), 0, top - 0.004, 0.238, 0, 0, 0, C('#15161a')); // piping along the front edge
  // back: spine from the mechanism, curved back shell + cushion (reclined a little), lumbar
  const bh = high ? 0.72 : 0.52, by = top + 0.07 + bh / 2, bz = -0.27, tilt = -0.1;
  put(pl, F, rbox(0.07, 0.03, 0.2, 0.01), 0, top - 0.13, -0.17, 0, 0, 0, blk); put(pl, F, rbox(0.07, 0.3, 0.03, 0.01), 0, top + 0.02, bz - 0.04, tilt * 0.5, 0, 0, blk);
  put(pl, F, bend(rbox(0.45, bh, 0.03, 0.012, 2), 0.35), 0, by, bz - 0.026, tilt, 0, 0, blk);
  put(fb, F, bend(rbox(0.46, bh - 0.02, 0.06, 0.027, 3), 0.35), 0, by, bz + 0.012, tilt, 0, 0, cc);
  put(fb, F, bend(rbox(0.38, 0.12, 0.03, 0.014, 2), 0.35), 0, top + 0.17, bz + 0.05, tilt, 0, 0, cc); // lumbar bolster
  if (high) put(fb, F, bend(rbox(0.3, 0.14, 0.06, 0.025, 2), 0.3), 0, top + 0.07 + bh + 0.1, bz - 0.02, tilt, 0, 0, cc); // headrest
  // T-arms: bracket under the seat, upright, soft pad
  for (const s of [-1, 1]) { put(pl, F, rbox(0.11, 0.022, 0.05, 0.008, 1), s * 0.2, top - 0.105, -0.03, 0, 0, 0, blk); put(pl, F, rbox(0.032, 0.25, 0.05, 0.012), s * 0.265, top + 0.03, -0.03, 0, 0, s * 0.04, blk);
    put(pl, F, rbox(0.075, 0.028, 0.26, 0.013, 2), s * 0.27, top + 0.18, -0.01, 0, 0, 0, C('#202125')); }
}

// ------------------------------------------------------------------------------------------------ monitor
// screen face kept at local z = +0.012 (the LCD quad BankInterior places at z + 0.0125)
export function monitor(k, x, y, z, yaw, w = 0.52) {
  const pl = k.get('plastic'), em = k.get('emissive'), blk = C('#141518'), dk = C('#0e0f11'), F = frameAt(x, 0, z, yaw); const h = w * 0.6;
  put(pl, F, lath([[0.001, 0], [0.11, 0], [0.115, 0.004], [0.112, 0.01], [0.09, 0.013], [0.001, 0.013]], 28), 0, y, -0.06, 0, 0, 0, blk, 1.15, 1, 0.8); // oval base
  put(pl, F, rbox(0.05, 0.3, 0.022, 0.008), 0, y + 0.15, -0.075, -0.1, 0, 0, blk); // neck
  put(pl, F, rbox(0.09, 0.09, 0.03, 0.01), 0, y + 0.3, -0.04, 0, 0, 0, dk); // VESA hinge
  put(pl, F, rbox(w, h, 0.016, 0.005), 0, y + 0.3, 0.004, 0, 0, 0, blk); // panel (front face at +0.012)
  put(pl, F, rbox(w * 0.66, h * 0.62, 0.03, 0.014, 2), 0, y + 0.29, -0.012, 0, 0, 0, blk); // rear bulge (electronics)
  for (let i = 0; i < 9; i++) put(pl, F, rbox(w * 0.4, 0.004, 0.004, 0.0015, 1), 0, y + 0.29 + h * 0.2 - i * 0.008, -0.027, 0, 0, 0, C('#0a0a0b')); // vents
  put(pl, F, rbox(w, 0.022, 0.018, 0.005, 1), 0, y + 0.3 - h / 2 + 0.006, 0.004, 0, 0, 0, C('#1b1c20')); // chin
  put(em, F, new THREE.BoxGeometry(0.004, 0.003, 0.002), w / 2 - 0.03, y + 0.3 - h / 2 + 0.006, 0.0135, 0, 0, 0, [0.35, 0.75, 1.0]); // power LED
  put(pl, F, new THREE.BoxGeometry(0.012, 0.006, 0.002), w / 2 - 0.05, y + 0.3 - h / 2 + 0.006, 0.0135, 0, 0, 0, C('#2a2c30')); // buttons strip
  rod(pl, F, [0.02, y + 0.24, -0.03], [0.05, y + 0.005, -0.12], 0.003, 0.003, dk, 6); // cable
}

// ------------------------------------------------------------------------------------------------ keyboard + mouse
// row layouts in key units (1 u = 19.05 mm); 0 = a gap of that many units (negative)
const ROWS = [[1, -1, 1, 1, 1, 1, -0.5, 1, 1, 1, 1, -0.5, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2], [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5], [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25], [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75], [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25]];
export function keyboard(k, x, y, z, yaw) {
  const pl = k.get('plastic'), F = frameAt(x, 0, z, yaw), base = C('#16171a'), cap = C('#2a2c31'), cap2 = C('#34373d'); const U = 0.0186;
  { const p = rbox(0.44, 0.018, 0.145, 0.006); const a = p.attributes.position; for (let j = 0; j < a.count; j++) if (a.getY(j) > 0) a.setY(j, a.getY(j) + (a.getZ(j) + 0.0725) * -0.04 + 0.003); /* wedge: higher at the back */ p.computeVertexNormals(); put(pl, F, p, 0, y + 0.009, 0, 0, 0, 0, base); }
  const keys = new THREE.BoxGeometry(1, 1, 1); keys.deleteAttribute('uv'); keys.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(keys.attributes.position.count * 2), 2)); // (reused per key)
  const x0 = -0.209, z0 = -0.058; const keyAt = (cx, cz, wu, hu, c) => { const g = keys.clone(); put(pl, F, g, cx, y + 0.025 - (cz - z0) * 0.04, cz, 0, 0, 0, c, wu * U - 0.0032, 0.007, hu * U - 0.0032); };
  ROWS.forEach((row, r) => { let ux = 0; const rz = z0 + r * U * (r === 0 ? 1 : 1) + (r > 0 ? U * 0.35 : 0); for (const wu of row) { if (wu < 0) { ux += -wu; continue; } keyAt(x0 + (ux + wu / 2) * U, rz, wu, r === 0 ? 0.85 : 1, wu > 1.4 || r === 0 ? cap2 : cap); ux += wu; } });
  const nx = x0 + 15.25 * U; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (r === 0 || r === 1 || r === 2) keyAt(nx + (c + 0.5) * U, z0 + (r === 0 ? 0 : r + 0.35) * U, 1, r === 0 ? 0.85 : 1, cap2); // nav cluster
  for (const [c, r] of [[1, 4.35], [0, 5.35], [1, 5.35], [2, 5.35]]) keyAt(nx + (c + 0.5) * U, z0 + r * U, 1, 1, cap); // arrows
  const px = nx + 3.25 * U; for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) { if (c === 3 && (r === 2 || r === 4)) continue; const tall = c === 3 && (r === 1 || r === 3), wide = r === 4 && c === 0; // numpad: + and Enter span two rows, 0 is 2 u wide
    keyAt(px + (c + (wide ? 1 : 0.5)) * U, z0 + (r + 1.35) * U + (tall ? U / 2 : 0), wide ? 2 : 1, tall ? 2 : 1, cap); if (wide) c++; }
  keys.dispose();
  // mouse pad + mouse (scaled sphere body, wheel)
  put(k.get('paint'), F, rbox(0.21, 0.003, 0.18, 0.0015, 1), 0.33, y + 0.0015, 0.0, 0, 0, 0, C('#1c2a3e'));
  put(pl, F, new THREE.SphereGeometry(0.03, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0.33, y + 0.003, 0.0, 0, 0, 0, C('#1d1f23'), 0.63, 0.75, 1.05);
  put(pl, F, cyl(0.007, 0.007, 0.005, 12), 0.33, y + 0.021, -0.016, 0, 0, Math.PI / 2, C('#3a3d42'));
  put(pl, F, new THREE.BoxGeometry(0.0012, 0.004, 0.03), 0.33, y + 0.021, -0.012, 0, 0, 0, C('#0b0b0c'));
}

// ------------------------------------------------------------------------------------------------ potted plant (Dracaena)
function leafGeo(L, W, droop, fold, colBase, colTip, colRib) {
  const N = 8, pos = [], colr = [], idx = [];
  for (let i = 0; i <= N; i++) { const t = i / N; const w = W * Math.sin(Math.PI * Math.min(1, t * 1.08) ** 0.75) * (t > 0.92 ? (1 - t) / 0.08 * 0.6 + 0.0 : 1);
    const zc = L * t, yc = L * (0.45 * t - droop * t * t); for (const s of [-1, 0, 1]) { pos.push(s * w * 0.5, yc + (s ? -fold * w : 0), zc); const c = s ? colBase.map((v, j) => v + (colTip[j] - v) * t) : colRib.map((v, j) => v * (0.85 + 0.15 * t)); colr.push(...c); } }
  for (let i = 0; i < N; i++) for (let s = 0; s < 2; s++) { const a = i * 3 + s, b = a + 1, c = a + 3, d = a + 4; idx.push(a, c, b, b, c, d); }
  const back = idx.slice(); for (let i = 0; i < back.length; i += 3) { const t = back[i + 1]; back[i + 1] = back[i + 2]; back[i + 2] = t; }
  const nV = pos.length / 3; const P2 = pos.concat(pos), C2 = colr.concat(colr), I2 = idx.concat(back.map((v) => v + nV));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C2, 3)); g.setIndex(I2);
  // normals: front half from the front faces, back half from the reversed ones (computeVertexNormals per half)
  const f = new THREE.BufferGeometry(); f.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); f.setIndex(idx); f.computeVertexNormals(); const nf = f.attributes.normal.array; f.dispose();
  const nn = new Float32Array(nf.length * 2); nn.set(nf); for (let i = 0; i < nf.length; i++) nn[nf.length + i] = -nf[i]; g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(nV * 4), 2)); return g;
}
export function plant(k, x, z, h = 1.2, potCol = '#e9e5dc', seed = 7) {
  SEED = Math.floor(seed * 7919 + x * 131 + z * 17) % 2147483646 + 1; for (let i = 0; i < 4; i++) rnd();
  const F = frameAt(x, 0, z, 0), gz = k.get('glaze'), pa = k.get('paint'), pl = k.get('plastic');
  // pot: tapered glazed planter with a rolled rim and an inner wall down to the soil
  put(gz, F, lath([[0.001, 0], [0.15, 0], [0.158, 0.008], [0.162, 0.03], [0.2, 0.355], [0.212, 0.372], [0.216, 0.392], [0.21, 0.402], [0.198, 0.4], [0.192, 0.37], [0.188, 0.34]], 36), 0, 0, 0, 0, 0, 0, C(potCol));
  put(pa, F, lath([[0.001, 0.352], [0.19, 0.345]], 24), 0, 0, 0, 0, 0, 0, C('#3a2a1e')); // soil
  for (let i = 0; i < 34; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 0.17; put(pa, F, new THREE.IcosahedronGeometry(0.012 + rnd() * 0.01, 0), Math.cos(a) * r, 0.356, Math.sin(a) * r, rnd() * 3, rnd() * 3, 0, C(['#d9d4c8', '#b9b2a4', '#8f8a80', '#e6e1d6'][i % 4]), 1, 0.6, 1); } // pebble top dressing
  // canes: 3 (tall plants) or a short clump; each with leaf scars and a crown of arching strap leaves
  const canes = h > 0.9 ? 3 : 2; const leafB = [0.17, 0.32, 0.15], leafT = [0.33, 0.56, 0.24], rib = [0.42, 0.6, 0.3];
  for (let c = 0; c < canes; c++) { const a = c * 2.1 + rnd() * 0.6, r0 = 0.04 + rnd() * 0.03, ch = (h - 0.45) * (0.55 + c * 0.2 + rnd() * 0.1); const lean = 0.05 + rnd() * 0.06;
    const base = [Math.cos(a) * r0, 0.35, Math.sin(a) * r0], tip = [Math.cos(a) * (r0 + lean), 0.35 + ch, Math.sin(a) * (r0 + lean)];
    rod(pa, F, base, tip, 0.016, 0.012, C('#6e5c49'), 8);
    for (let s = 1; s < 6; s++) { const t = s / 6; put(pa, F, cyl(0.0175 - t * 0.004, 0.0175 - t * 0.004, 0.004, 8), base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t, base[2] + (tip[2] - base[2]) * t, 0, 0, 0, C('#57483a')); } // leaf scars
    const nL = 11 + Math.floor(rnd() * 4); for (let i = 0; i < nL; i++) { const ya = i * 2.399 + rnd() * 0.3, up = i < 4 ? 0.9 : 0.35 + rnd() * 0.4; const L = 0.32 + rnd() * 0.2, W = 0.05 + rnd() * 0.022;
      const g = leafGeo(L, W, 0.55 + (1 - up) * 0.5, 0.18, leafB, leafT, rib); put(pl, F, g, tip[0], tip[1] - 0.02 + (i % 3) * 0.012, tip[2], -up * 0.9 + 0.1, ya, (rnd() - 0.5) * 0.3, [1, 1, 1]); } }
}

// ------------------------------------------------------------------------------------------------ waiting chair top (instanced)
// built in the instance's own frame: seat top at y = 0, back toward −z (the instance is turned to face the room)
export function waitingChairTop(tb) {
  const navy = C('#1f3556'), shell = C('#232427'), dark = C('#1a1b1e'); const I = new THREE.Matrix4();
  { const cu = rbox(0.5, 0.075, 0.48, 0.03, 3); const p = cu.attributes.position; for (let j = 0; j < p.count; j++) { const X = p.getX(j), Z = p.getZ(j), Y = p.getY(j); if (Y > 0) p.setY(j, Y - 0.005 * Math.exp(-(X * X / 0.02 + (Z * Z) / 0.03)) - (Z > 0.18 ? (Z - 0.18) * 0.1 : 0)); } cu.computeVertexNormals(); put(tb, I, cu, 0, -0.0375, 0, 0, 0, 0, navy); }
  put(tb, I, rbox(0.46, 0.03, 0.44, 0.012), 0, -0.09, 0, 0, 0, 0, shell); // moulded shell
  put(tb, I, rbox(0.47, 0.006, 0.006, 0.002, 1), 0, -0.004, 0.238, 0, 0, 0, dark); // front piping
  put(tb, I, bend(rbox(0.47, 0.44, 0.03, 0.012), 0.3), 0, 0.25, -0.262, -0.08, 0, 0, shell); // back shell
  put(tb, I, bend(rbox(0.48, 0.42, 0.06, 0.026, 3), 0.3), 0, 0.25, -0.225, -0.08, 0, 0, navy); // back cushion
  put(tb, I, bend(rbox(0.4, 0.004, 0.004, 0.0015, 1), 0.3), 0, 0.12, -0.192, -0.08, 0, 0, dark); // stitched lumbar seam
  put(tb, I, rbox(0.07, 0.24, 0.03, 0.01), 0, 0.02, -0.29, -0.04, 0, 0, shell); // spine
  put(tb, I, rbox(0.2, 0.045, 0.22, 0.01), 0, -0.125, 0, 0, 0, 0, shell); // seat plate
  put(tb, I, cyl(0.03, 0.03, 0.25, 16), 0, -0.27, 0, 0, 0, 0, C('#9ea2a6')); put(tb, I, cyl(0.034, 0.034, 0.01, 16), 0, -0.15, 0, 0, 0, 0, dark); // column top + collar
  for (const s of [-1, 1]) { put(tb, I, rbox(0.032, 0.24, 0.045, 0.012), s * 0.27, 0.07, -0.02, 0, 0, s * 0.03, shell); put(tb, I, rbox(0.07, 0.028, 0.34, 0.013), s * 0.27, 0.205, 0.0, 0, 0, 0, dark); put(tb, I, rbox(0.1, 0.02, 0.05, 0.008, 1), s * 0.2, -0.105, -0.02, 0, 0, 0, shell); }
}
// the static pedestal under each waiting chair: domed base with a rubber foot ring, chrome column
export function waitingChairBase(chrome, pl, x, z) {
  const F = frameAt(x, 0, z, 0);
  put(pl, F, lath([[0.001, 0.0], [0.235, 0.0], [0.24, 0.006], [0.23, 0.016], [0.12, 0.03], [0.05, 0.045], [0.04, 0.05], [0.001, 0.05]], 36), 0, 0, 0, 0, 0, 0, C('#202124'));
  put(chrome, F, cyl(0.035, 0.035, 0.22, 20), 0, 0.15, 0, 0, 0, 0, [1, 1, 1]); put(chrome, F, cyl(0.042, 0.042, 0.012, 20), 0, 0.055, 0, 0, 0, 0, [1, 1, 1]);
}

// ------------------------------------------------------------------------------------------------ water dispenser (bottle on top)
export function waterDispenser(k, x, z, yaw = Math.PI / 2) {
  const F = frameAt(x, 0, z, yaw), pa = k.get('paint'), pl = k.get('plastic'), st = k.get('steel'), gl = k.get('cmbGlass'); const wht = C('#ecebe7');
  put(pa, F, rbox(0.32, 0.98, 0.32, 0.025, 3), 0, 0.5, 0, 0, 0, 0, wht); // cabinet
  put(pl, F, rbox(0.3, 0.04, 0.3, 0.01), 0, 0.02, 0, 0, 0, 0, C('#2b2d31')); // kick base
  put(pl, F, rbox(0.23, 0.24, 0.04, 0.012), 0, 0.8, 0.147, 0, 0, 0, C('#2c2e32')); // dispensing recess
  for (const [dx, col] of [[-0.055, '#2f6fb0'], [0.055, '#b0322a']]) { put(pl, F, rbox(0.045, 0.05, 0.035, 0.01, 2), dx, 0.87, 0.172, 0, 0, 0, C(col)); put(st, F, cyl(0.006, 0.008, 0.025, 10), dx, 0.835, 0.17, 0, 0, 0, C('#cfd2d5')); }
  put(st, F, rbox(0.21, 0.015, 0.11, 0.004, 1), 0, 0.69, 0.16, 0, 0, 0, C('#b9bdc1')); for (let i = 0; i < 7; i++) put(pl, F, new THREE.BoxGeometry(0.17, 0.004, 0.006), 0, 0.698, 0.12 + i * 0.012, 0, 0, 0, C('#202124')); // drip tray + grille
  for (let i = 0; i < 6; i++) put(pl, F, rbox(0.2, 0.008, 0.004, 0.002, 1), 0, 0.2 + i * 0.03, 0.161, 0, 0, 0, C('#cfcfca')); // front vent slots
  put(pl, F, lath([[0.001, 0.98], [0.15, 0.98], [0.15, 1.0], [0.13, 1.04], [0.06, 1.05], [0.05, 1.03], [0.001, 1.03]], 32), 0, 0, 0, 0, 0, 0, C('#d8d8d4')); // bottle collar
  // 19-litre bottle (upside down): neck in the collar, ribbed body, handle
  const B = [[0.03, 1.02], [0.032, 1.07], [0.045, 1.1], [0.12, 1.15], [0.135, 1.2], [0.135, 1.27], [0.128, 1.29], [0.135, 1.31], [0.135, 1.38], [0.128, 1.4], [0.135, 1.42], [0.135, 1.5], [0.11, 1.53], [0.001, 1.535]];
  put(gl, F, lath(B, 36), 0, 0, 0, 0, 0, 0, [0.82, 0.9, 1.0]);
  put(gl, F, lath(B.slice(0, 13).map(([r, y]) => [r * 0.95, Math.min(y, 1.41)]), 28), 0, 0, 0, 0, 0, 0, [0.55, 0.75, 0.95]); // the water inside
  // cup holder on the side with a stack of paper cups
  put(pl, F, cyl(0.04, 0.04, 0.2, 16, true), 0.18, 0.7, 0.05, 0, 0, 0, C('#dcdcd8')); put(pa, F, cyl(0.036, 0.03, 0.05, 16), 0.18, 0.585, 0.05, 0, 0, 0, C('#f6f6f2'));
}

// ------------------------------------------------------------------------------------------------ queue-ticket kiosk
// (the screen face, logo and ticket slot stay where BankInterior draws them: screen centre y 1.08, face z + 0.152)
export function ticketKiosk(k, x, z, navy) {
  const F = frameAt(x, 0, z, 0), mt = k.get('steel'), pa = k.get('paint'), pl = k.get('plastic'), gd = k.get('gold');
  put(pa, F, rbox(0.46, 0.04, 0.36, 0.012), 0, 0.02, 0, 0, 0, 0, C('#2a2c30')); // plinth
  put(mt, F, rbox(0.4, 1.26, 0.3, 0.03, 3), 0, 0.67, 0, 0, 0, 0, C('#d7d9db')); // body
  put(pl, F, rbox(0.36, 0.22, 0.012, 0.01, 2), 0, 1.08, 0.146, 0, 0, 0, C('#111214')); // screen bezel
  put(pl, F, rbox(0.2, 0.05, 0.02, 0.008, 1), 0, 0.84, 0.148, 0, 0, 0, C('#1a1b1e')); // ticket printer face
  put(pa, F, new THREE.BoxGeometry(0.055, 0.004, 0.035), 0.0, 0.833, 0.172, 0.25, 0, 0, C('#f4f2ea')); // a ticket in the slot
  put(pa, F, rbox(0.42, 0.06, 0.32, 0.02), 0, 1.32, 0, 0, 0, 0, navy); put(gd, F, new THREE.BoxGeometry(0.424, 0.006, 0.324), 0, 1.29, 0, 0, 0, 0, [1, 1, 1]); // navy cap + brass line
  for (const s of [-1, 1]) put(pl, F, rbox(0.006, 1.0, 0.02, 0.002, 1), s * 0.2, 0.62, 0.11, 0, 0, 0, C('#b9bcbf')); // side shadow gaps
  put(pl, F, cyl(0.012, 0.012, 0.003, 16), 0.13, 0.95, 0.151, Math.PI / 2, 0, 0, C('#3a6fd0')); // contactless / help button
}

// ------------------------------------------------------------------------------------------------ stainless litter bin with swing flap
export function litterBin(k, x, z) {
  const F = frameAt(x, 0, z, 0), mt = k.get('steel'), pl = k.get('plastic'); const ss = C('#a7abaf');
  put(pl, F, lath([[0.001, 0], [0.15, 0], [0.155, 0.01], [0.15, 0.025]], 32), 0, 0, 0, 0, 0, 0, C('#1d1e20')); // foot ring
  put(mt, F, lath([[0.148, 0.02], [0.152, 0.1], [0.158, 0.105], [0.153, 0.11], [0.157, 0.5], [0.163, 0.505], [0.158, 0.51], [0.161, 0.6]], 40), 0, 0, 0, 0, 0, 0, ss); // body with rolled beads
  put(pl, F, lath([[0.168, 0.6], [0.168, 0.625], [0.15, 0.66], [0.08, 0.68], [0.001, 0.682]], 40), 0, 0, 0, 0, 0, 0, C('#202124')); // domed lid
  put(pl, F, rbox(0.17, 0.11, 0.012, 0.01, 2), 0, 0.64, 0.12, 0.85, 0, 0, C('#2b2c2f')); // swing flap
}

// ------------------------------------------------------------------------------------------------ vault door
// a round vault door in its square frame: stepped door edge, locking bolts, hinge, 5-spoke wheel, combination dial
export function vaultDoor(k, vx, vy, z0) {
  const st = k.get('steel'), mt = st, gd = k.get('gold'), F = frameAt(vx, vy, z0, 0), R = Math.PI / 2;
  put(mt, F, rbox(1.8, 2.2, 0.08, 0.01, 2), 0, 0, 0.04, 0, 0, 0, C('#7d8287')); // frame plate
  put(st, F, lath([[0.92, 0], [0.92, 0.03], [0.88, 0.05], [0.001, 0.05]], 64), 0, 0, 0.08, R, 0, 0, C('#8a9096')); // frame ring
  put(st, F, lath([[0.001, 0], [0.84, 0], [0.84, 0.05], [0.81, 0.08], [0.8, 0.14], [0.76, 0.16], [0.001, 0.16]], 64), 0, 0, 0.09, R, 0, 0, C('#b4b9be')); // stepped door
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; put(st, F, cyl(0.022, 0.022, 0.03, 10), Math.cos(a) * 0.71, Math.sin(a) * 0.71, 0.26, R, 0, 0, C('#8d9297')); } // bolt heads
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + 0.3; put(st, F, cyl(0.03, 0.03, 0.14, 12), Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0.18, 0, 0, a + R, C('#cfd3d7')); } // locking bolts at the edge
  for (const y of [-0.55, 0.55]) put(st, F, cyl(0.07, 0.07, 0.34, 20), 0.95, y, 0.16, 0, 0, 0, C('#868b90')); put(st, F, rbox(0.2, 1.4, 0.06, 0.02), 0.9, 0, 0.12, 0, 0, 0, C('#7a7f84')); // hinge
  put(st, F, cyl(0.07, 0.07, 0.12, 24), 0, 0, 0.3, R, 0, 0, C('#d4d7da')); // wheel hub
  put(st, F, new THREE.TorusGeometry(0.42, 0.025, 10, 48), 0, 0, 0.34, 0, 0, 0, C('#d4d7da')); // wheel rim
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.3; put(st, F, cyl(0.018, 0.018, 0.42, 10), Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0.34, 0, 0, a - R, C('#d4d7da')); put(st, F, new THREE.SphereGeometry(0.035, 12, 8), Math.cos(a) * 0.47, Math.sin(a) * 0.47, 0.34, 0, 0, 0, C('#e1e3e5')); } // spokes + knobs
  put(st, F, cyl(0.11, 0.11, 0.04, 48), -0.45, 0.42, 0.28, R, 0, 0, C('#2c2f33')); put(st, F, cyl(0.07, 0.075, 0.05, 40), -0.45, 0.42, 0.31, R, 0, 0, C('#c9ccd0')); // combination dial
  for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; put(st, F, new THREE.BoxGeometry(0.004, i % 5 ? 0.012 : 0.022, 0.003), -0.45 + Math.cos(a) * 0.095, 0.42 + Math.sin(a) * 0.095, 0.302, 0, 0, a - R, C('#e8e8e8')); } // dial ticks
  put(gd, F, rbox(0.34, 0.08, 0.008, 0.003, 1), 0, -0.55, 0.26, 0, 0, 0, [1, 1, 1]); // maker's plate
}

// ------------------------------------------------------------------------------------------------ clipped shrub (facade planter)
// a clipped box-leaf shrub: a subdivided blob displaced by layered noise (leaf clusters), lighter on top, darker within
export function frontShrub(b, x, y, z, r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 4); const p = g.attributes.position, n = p.count; const col = new Float32Array(n * 3); const s = seed * 1.7;
  const nz = (X, Y, Z) => Math.sin(X * 23 + s) * Math.sin(Y * 19 + s * 1.3) * Math.sin(Z * 21 + s * 0.7) + 0.5 * Math.sin(X * 51 + Y * 7 + s) * Math.sin(Z * 47 - Y * 11) + 0.25 * Math.sin(X * 97 - Z * 31 + s) * Math.sin(Y * 89);
  for (let i = 0; i < n; i++) { _v.fromBufferAttribute(p, i); const d = _v.clone().normalize(); const k = 1 + nz(d.x, d.y, d.z) * 0.07 - (d.y < -0.3 ? (-0.3 - d.y) * 0.4 : 0); _v.multiplyScalar(k); p.setXYZ(i, _v.x, _v.y * 0.82, _v.z);
    const lit = 0.75 + 0.35 * Math.max(0, d.y) + nz(d.x * 3, d.y * 3, d.z * 3) * 0.12; const yg = 0.5 + 0.5 * Math.sin(d.x * 9 + d.z * 7 + s); col[i * 3] = (0.2 + 0.08 * yg) * lit; col[i * 3 + 1] = (0.38 + 0.08 * yg) * lit; col[i * 3 + 2] = (0.17 + 0.03 * yg) * lit; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  b.geometry(g, new THREE.Matrix4().makeTranslation(x, y, z), [1, 1, 1]); g.dispose();
}

// ------------------------------------------------------------------------------------------------ wall brochure rack
// a wall-hung literature rack (2 rows × 4 pockets) at the wall x = xw, facing -x, centred on z: a brushed-steel back panel
// with folded return edges and four countersunk fixings, a steel shelf + lip per row, clear acrylic pocket fronts (low, so
// the brochures' tops stand above them) with side cheeks, and a stack of leaflets behind each cover. The covers themselves
// stay the room's print-atlas faces (BankInterior), at x = xw - 0.17, standing on the shelves (centre y = row + 0.002).
export function brochureRack(k, xw, z) {
  const F = frameAt(xw, 0, z, 0), mt = k.get('steel'), gl = k.get('cmbGlass'), pa = k.get('paint'), pl = k.get('plastic'); const ss = C('#c8cbce');
  put(mt, F, rbox(0.014, 0.9, 0.62, 0.005, 2), -0.009, 1.25, 0, 0, 0, 0, ss); // back panel
  for (const s of [-1, 1]) put(mt, F, rbox(0.03, 0.9, 0.008, 0.003, 1), -0.022, 1.25, s * 0.306, 0, 0, 0, ss); // folded return edges
  for (const sy of [-1, 1]) for (const sz of [-1, 1]) { put(mt, F, cyl(0.007, 0.0055, 0.003, 12), -0.0175, 1.25 + sy * 0.41, sz * 0.27, 0, 0, Math.PI / 2, C('#9ea2a6')); // countersunk fixings
    put(pl, F, new THREE.BoxGeometry(0.0008, 0.0015, 0.008), -0.0192, 1.25 + sy * 0.41, sz * 0.27, 0, 0, 0, C('#55595d')); } // their slots
  for (let r = 0; r < 2; r++) { const yb = 1.1 + r * 0.38 - 0.085;
    put(mt, F, rbox(0.2, 0.012, 0.6, 0.004, 2), -0.11, yb, 0, 0, 0, 0, ss); // shelf
    put(mt, F, rbox(0.01, 0.025, 0.6, 0.003, 1), -0.207, yb + 0.012, 0, 0, 0, 0, ss); // front lip
    for (let c = 0; c < 4; c++) { const zz = -0.22 + c * 0.145, yy = 1.1 + r * 0.38;
      put(gl, F, rbox(0.004, 0.09, 0.134, 0.0015, 1), -0.2, yy - 0.034, zz, 0, 0, -0.06); // acrylic front (leans back a touch)
      for (const s of [-1, 1]) put(gl, F, new THREE.BoxGeometry(0.06, 0.09, 0.003), -0.172, yy - 0.034, zz + s * 0.0685); // pocket cheeks
      for (let j = 0; j < 4; j++) put(pa, F, new THREE.BoxGeometry(0.004, 0.158 - j * 0.002, 0.118 - j * 0.002), -0.166 + j * 0.0045, yy + 0.002 - j * 0.001, zz + (j % 2 ? 0.002 : -0.0015), 0, 0, -0.03, C(j ? '#ecebe6' : '#f6f5f1')); // leaflet stack
    } }
}
