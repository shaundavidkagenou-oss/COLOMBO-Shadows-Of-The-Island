// The eighteen long guns, drawn from photographs of the real rifles (mm; drawing frame: z = 0 at the rear face of the
// receiver, +z to the muzzle, bore on y = 0 — see GunKit.js). Built from per-platform part sets — AR (M4A1, Mk 18,
// M110), AK (AK-47, AKS-74U, AK-74M, and the SVD's long receiver), M14 (M14, Mk 14 EBR), FAL (L1A1), G3 (G3A3), turn-bolt
// actions (M24, M40A5, M91/30, L115A3, M2010) and the M107 — with each rifle's own stock, handguard, muzzle device,
// sights / optic and magazine. No maker's markings or logos.
import * as THREE from 'three';
import { weaponMaterials } from './WeaponModels.js';
import { Kit, slab, lathe, tube, bx, cyl, rail, gripBox, holdFrom, MM } from './GunKit.js';
import { flutedZ } from './WeaponLoft.js';
import { curvedTrigger } from './GunPistols.js';

const G1 = new THREE.Vector3(0, -0.008, -0.024); // where every long gun's pistol-grip centre sits in the hand frame
const q2 = (a, c, b, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; });
const pin = (K, m, z, y, w, r = 1.6) => K.add(m.steel, cyl(r, w + 0.8, 0, y, z, 'x', 10));
const rivet = (K, m, z, y, w, r = 2.2) => { for (const s of [1, -1]) K.add(m.steel, lathe([[0, r], [0.9, r * 0.8], [1.3, 0.01]], 0, 0, 10).rotateY(s * Math.PI / 2).translate(s * w / 2 * MM, y * MM, z * MM)); };
const ringBand = (z0, z1, y, r, x = 0) => lathe([[z0, r - 0.4], [z0 + 0.6, r], [z1 - 0.6, r], [z1, r - 0.4]], y, x, 28);

// pistol grip: top attachment front (zf, yt), depth d along the receiver, raked back by `rake` (rad), length `len`.
// style: 'a2' finger nub, 'ak' plain tapered, 'ergo' palm swell
function pgrip(zf, yt, d, len, rake, style = 'ak') {
  const dz = -Math.sin(rake), dy = -Math.cos(rake); const F0 = [zf, yt], B0 = [zf - d, yt]; const F1 = [zf + dz * len, yt + dy * len], B1 = [zf - d + dz * len * 1.04, yt + dy * len * 1.04];
  const at = (P, Q, t, o) => [P[0] + (Q[0] - P[0]) * t + o * Math.cos(rake), P[1] + (Q[1] - P[1]) * t - o * Math.sin(rake)];
  const front = style === 'a2' ? [F0, at(F0, F1, 0.3, 0), at(F0, F1, 0.42, 3.5), at(F0, F1, 0.55, 0), [...F1, 4]] : style === 'ergo' ? [F0, at(F0, F1, 0.35, -1.5), at(F0, F1, 0.7, 1), [...F1, 5]] : [F0, at(F0, F1, 0.5, -1), [...F1, 4]];
  const back = style === 'ergo' ? [[...B1, 6], at(B0, B1, 0.6, -3.5), at(B0, B1, 0.25, -1), B0] : [[...B1, 5], at(B0, B1, 0.55, -2), B0];
  return { pts: [...front, ...back], front: [F0, F1], back: [B0, B1] };
}
// magazine from a front and a rear curve (top → bottom), with raised side ribs and a floorplate
function magazine(K, mat, front, rear, w, opt = {}) {
  const pts = [...front, ...rear.slice().reverse()]; K.to('mag', mat, slab(pts, w, { bev: opt.bev ?? 2.4, seg: 2 }));
  const n = front.length; const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (opt.ribs !== false) { const i0 = Math.floor(n * 0.28), i1 = n - 2; const inF = [], inR = []; for (let i = i0; i <= i1; i++) { inF.push(lerp(front[i], rear[i], 0.16)); inR.push(lerp(front[i], rear[i], 0.84)); }
    K.to('mag', mat, slab([...inF, ...inR.reverse()], w + 1.6, { bev: 0.8, seg: 2 })); }
  const f = front[n - 1], r = rear[n - 1]; const dz = f[0] - r[0], dy = f[1] - r[1]; const L = Math.hypot(dz, dy); const nz = -dy / L * 5, ny = dz / L * 5; // floorplate, a little proud all round
  K.to('mag', opt.plate || mat, slab([[r[0] - dz / L * 2.5 + nz * 0.3, r[1] - dy / L * 2.5 + ny * 0.3], [f[0] + dz / L * 2.5 + nz * 0.3, f[1] + dy / L * 2.5 + ny * 0.3], [f[0] + dz / L * 2.5 - nz, f[1] + dy / L * 2.5 - ny, 1.5], [r[0] - dz / L * 2.5 - nz, r[1] - dy / L * 2.5 - ny, 1.5]], w + 2.4, { bev: 1.2 }));
}
// trigger guard ring (bar under the trigger), z0…z1, top yt, bottom yb
const guardRing = (z0, z1, yt, yb, w = 9, t = 4.5) => slab([[z0, yt], [z1, yt], [z1, yb + 6, 5], [z1 - 6, yb, 5], [z0 + 4, yb, 5], [z0, yb + 5, 4]], w, { bev: 1.4, holes: [[[z0 + t, yt - 1], [z1 - t, yt - 1], [z1 - t, yb + t + 4, 4], [z1 - t - 5, yb + t, 4], [z0 + t + 3, yb + t, 4], [z0 + t, yb + t + 4, 4]]] });
// riflescope: tube along z centred at zc, axis height y; len, main tube r, objective r, eyepiece r; rings at rz[] standing on yb
function scope(K, m, zc, y, len, r, ro, re, rz, yb, opt = {}) {
  const z0 = zc - len / 2, z1 = zc + len / 2, x = opt.x || 0;
  K.add(m.oxide, lathe([[z0, 0.01], [z0, re - 1], [z0 + 2, re], [z0 + 38, re], [z0 + 44, re - 2], [z0 + 52, r + 2.5], [z0 + 64, r + 2.5], [z0 + 68, r], [z1 - 95, r], [z1 - 55, ro - 1], [z1 - 6, ro], [z1, ro - 1], [z1, 0.01]], y, x, 32));
  for (let i = 0; i < 6; i++) K.add(m.rubber, ringBand(z0 + 52.5 + i * 2, z0 + 53.5 + i * 2, y, r + 2.9, x));
  K.add(m.lens, cyl(ro - 3, 0.6, x, y, z1 + 0.1, 'z', 28), cyl(re - 3, 0.6, x, y, z0 - 0.1, 'z', 24));
  if (opt.shade) K.add(m.oxide, lathe([[z1, ro + 0.6], [z1 + opt.shade, ro + 0.6], [z1 + opt.shade, ro - 0.6], [z1, ro - 0.6]], y, x, 32));
  const tz = zc - len * 0.06; K.add(m.oxide, cyl(r * 0.8, 10, x, y + r + 5, tz, 'y', 24), cyl(r * 0.8, 10, x - r - 5, y, tz, 'x', 24), cyl(r * 0.85, 12, x, y, tz, 'y', 24).translate(0, 0, 0));
  K.add(m.alu, cyl(r * 0.88, 6, x, y + r + 12, tz, 'y', 28), cyl(r * 0.88, 6, x - r - 12, y, tz, 'x', 28)); // knurled caps
  if (opt.side) K.add(m.alu, cyl(r * 0.7, 9, x + r + 4, y, tz, 'x', 20));
  for (const z of rz) { K.add(m.alu, ringBand(z - 7, z + 7, y, r + 3.2, x)); K.add(m.alu, slab([[z - 9, yb], [z + 9, yb], [z + 7, y - r + 2], [z - 7, y - r + 2]], 16, { cx: x, bev: 1.2 })); for (const s of [1, -1]) K.add(m.steel, cyl(1.6, 1, x + s * (r + 3.6), y + 4, z, 'x', 8)); }
}
function bipodFolded(K, m, z0, z1, y, x = 13) { K.add(m.alu, slab([[z0 - 12, y + 4], [z0 + 18, y + 4], [z0 + 18, y - 10, 3], [z0 - 12, y - 10, 3]], 34, { bev: 2 }));
  for (const s of [1, -1]) { K.add(m.oxide, lathe([[z0, 5.2], [z1 - 40, 5.2], [z1 - 38, 4.2], [z1, 4.2]], y - 12, s * x, 14)); K.add(m.rubber, lathe([[z1, 6], [z1 + 14, 6.5], [z1 + 18, 0.01]], y - 12, s * x, 14)); }
}

// ------------------------------------------------------------------------------------------------------------------
// AR platform (M4A1, Mk 18, M110 at scale 1.1)
function arLower(K, m, s = 1) {
  const S = (p) => p.map(([z, y, r]) => [z * s, y * s, r]);
  K.add(m.alu, slab(S([[-12, -13], [172, -13], [172, -30, 3], [168, -38], [168, -68, 2], [171, -78, 2], [104, -78, 2], [106, -68], [104, -40], [52, -40], [34, -38], [6, -36, 6], [-12, -30, 6]]), 22 * s, { bev: 1.6 }));
  K.add(m.alu, slab(S([[104, -60], [170, -60], [172, -78, 2], [104, -78, 2]]), 28 * s, { bev: 2 })); // flared magwell
  K.add(m.alu, guardRing(52 * s, 106 * s, -38 * s, -58 * s, 9 * s));
  pin(K, m, -4 * s, -22 * s, 22 * s, 2.4); pin(K, m, 164 * s, -22 * s, 22 * s, 2.4); pin(K, m, 64 * s, -28 * s, 22 * s); pin(K, m, 48 * s, -24 * s, 22 * s);
  K.add(m.steel, slab(S([[24, -26], [40, -22], [41, -26, 2], [26, -31, 2]]), 2.4, { cx: 11.6 * s, bev: 0.6 }), cyl(4.6, 1.4, 11.8 * s, -27 * s, 30 * s, 'x', 16)); // selector
  K.add(m.steel, cyl(4.2, 3, -11.8 * s, -36 * s, 100 * s, 'x', 16), slab(S([[92, -18], [104, -18], [104, -32, 2], [94, -32, 2]]), 2, { cx: 11.6 * s, bev: 0.5 })); // magazine release, bolt catch
}
function arUpper(K, m, s = 1, opt = {}) {
  const S = (p) => p.map(([z, y, r]) => [z * s, y * s, r]);
  K.add(m.alu, slab(S([[0, -13], [182, -13], [182, 13], [178, 15], [2, 15], [0, 12]]), 25 * s, { bev: 2.2, taper: [-13 * s, 15 * s, 0.86] }));
  K.add(m.alu, ...rail(0, 180 * s, 15 * s, 21.2));
  K.add(m.alu, lathe([[20, 6.8], [52, 6.8], [54, 6]], 4 * s, -15 * s, 16), slab(S([[56, 4], [70, 4], [70, 14], [60, 14, 3]]), 4, { cx: -13.6 * s, bev: 1 })); // forward assist, brass deflector
  K.add(m.slot, slab(S([[72, -6], [134, -6], [134, 7], [72, 7, 2]]), 1, { cx: -12.4 * s, bev: 0.2 })); K.add(m.alu, slab(S([[72, -8], [134, -8], [134, -6], [72, -6]]), 1.4, { cx: -12.8 * s, bev: 0.3 })); // ejection port + cover hinge
  K.to('bolt', m.steel, slab(S([[76, -4], [126, -4], [126, 5], [76, 5]]), 1.2, { cx: -12.3 * s, bev: 0.3 })); // bolt carrier seen through the port
  K.to('bolt', m.alu, slab(S([[-14, 9], [4, 9], [4, 15], [-6, 15], [-14, 13, 2]]), 16 * s, { bev: 1 }), slab(S([[-16, 9], [-8, 9], [-8, 15], [-14, 15, 2]]), 32 * s, { bev: 1.6 })); // charging handle + its latch wings
  if (opt.barrelNut !== false) K.add(m.oxide, lathe([[182, 17 * s], [192, 17 * s], [194, 15 * s]], 0, 0, 24));
}
function arStock(K, m, s = 1, kind = 'm4') {
  K.add(m.oxide, lathe([[-175 * s, 14.5 * s], [-8 * s, 14.5 * s], [-4 * s, 16.5 * s], [0, 16.5 * s]], -2 * s, 0, 24)); // buffer tube + castle nut
  K.add(m.steel, slab([[-2, -16], [2, -16], [2, 12], [-2, 12]], 30 * s, { bev: 0.8 })); // end plate
  if (kind === 'm4') { // 6-position collapsible stock with its lightening slots and rubber butt
    const P = [[-95, 17], [-238, 18], [-246, 20, 3], [-248, -96, 3], [-238, -100, 4], [-222, -90], [-130, -24, 10], [-95, -20, 3]].map(([z, y, r]) => [z * s, y * s, r]);
    K.add(m.poly, slab(P, 40 * s, { bev: 7 * s, holes: [[[-150 * s, 6 * s], [-215 * s, 6 * s], [-215 * s, -2 * s, 2], [-150 * s, -2 * s, 2]]] }));
    K.add(m.rubber, slab([[-246, 22], [-256, 22, 3], [-258, -98, 3], [-246, -102, 3]].map(([z, y, r]) => [z * s, y * s, r]), 42 * s, { bev: 3 }));
    K.add(m.poly, slab([[-130, -18], [-170, -24], [-170, -32, 2], [-150, -34, 2]].map(([z, y, r]) => [z * s, y * s, r]), 16 * s, { bev: 2 })); // adjustment lever
  } else { // fixed rifle stock with an adjustable comb (M110)
    K.add(m.poly, slab([[-6, 14], [-300, 20], [-312, 22, 3], [-314, -104, 4], [-300, -110, 4], [-200, -70, 20], [-80, -36, 20], [-6, -22]].map(([z, y, r]) => [z * s, y * s, r]), 44 * s, { bev: 9 }));
    K.add(m.poly, slab([[-120, 20], [-270, 24], [-276, 34, 3], [-124, 32, 3]].map(([z, y, r]) => [z * s, y * s, r]), 36 * s, { bev: 6 }));
    K.add(m.rubber, slab([[-312, 24], [-324, 24, 3], [-326, -106, 3], [-312, -110, 3]].map(([z, y, r]) => [z * s, y * s, r]), 46 * s, { bev: 3 }));
  }
}
function stanag(K, m, s = 1, n = 30) { const L = n === 20 ? 120 : 165, c = n === 20 ? 6 : 16; magazine(K, m.alu, q2([164 * s, -40 * s], [168 * s, -40 * s - L * 0.5 * s], [164 * s + c * s, -40 * s - L * s]), q2([108 * s, -40 * s], [110 * s, -40 * s - L * 0.5 * s], [106 * s + c * s, -44 * s - L * s]), 23 * s, { plate: m.poly, bev: 2 }); }
function arCommon(K, m, s, grip) { arLower(K, m, s); const g = pgrip(56 * s, -38 * s, 32 * s, 98 * s, 0.44, grip || 'a2'); K.add(m.poly, slab(g.pts, 27 * s, { bev: 8 * s })); curvedTrigger(K, m, 70 * s, -36 * s, 20 * s, 6); return g; }

// AK platform: receiver, top cover, rear sight block, safety lever, charging handle, pistol grip, guard, magazine catch
function akReceiver(K, m, o = {}) {
  const L = o.L || 250, mat = o.mat || m.oxide;
  K.add(mat, slab([[0, -34], [L - 6, -34], [L, -28, 3], [L + 6, -8, 3], [L + 6, 6], [0, 4]], 30, { bev: 1.8 }));
  K.add(mat, slab([[2, 2], [L - 36, 2], [L - 36, 10], [L - 42, 16, 4], [12, 19, 6], [2, 15, 3]], 30, { bev: 4, taper: [2, 19, 0.82] })); // top cover
  for (let i = 0; i < (o.ribs ?? 3); i++) K.add(mat, slab([[40 + i * 52, 17.5], [52 + i * 52, 17.5], [52 + i * 52, 19.6, 1], [40 + i * 52, 19.6, 1]], 18, { bev: 1 }));
  K.add(mat, slab([[L - 38, 4], [L + 8, 4], [L + 8, 12], [L, 16], [L - 34, 22, 2], [L - 38, 18]], 26, { bev: 2 })); // rear sight block
  K.add(m.steel, slab([[L - 34, 18], [L - 4, 18], [L - 4, 23], [L - 32, 24, 1]], 12, { bev: 0.8 }), bx(4, 3, 6, 0, 25, L - 30)); // tangent leaf + notch
  K.add(mat, slab([[22, -3], [150, -12], [154, -18, 2], [146, -20], [22, -11, 4]], 2.6, { cx: -16, bev: 0.7 }), cyl(5, 2.4, -16, -7, 24, 'x', 16)); // safety lever (right)
  K.add(m.slot, slab([[140, -8], [L - 40, -8], [L - 40, 2], [140, 2, 2]], 1, { cx: -15.2, bev: 0.2 })); // ejection port
  K.to('bolt', m.steel, slab([[150, -4], [208, -4], [208, 3], [150, 3]], 3, { cx: -15.8, bev: 0.6 }), cyl(5, 14, -23, 0, 200, 'x', 14), lathe([[0, 5], [3, 5.5], [5, 0.01]], 0, 0, 12).rotateY(-Math.PI / 2).translate(-0.030, 0, 0.2)); // carrier + charging handle
  for (const z of [6, 14]) rivet(K, m, z, -18, 30, 2.4); for (const z of [L - 14, L - 8]) for (const y of [-26, -14]) rivet(K, m, z, y, 30, 2.4);
  pin(K, m, 74, -26, 30, 2.2); pin(K, m, 56, -22, 30, 2.2); pin(K, m, 34, -24, 30, 1.6);
  K.add(m.slot, slab([{ arc: [160, -14, 6, 0, Math.PI * 1.9], n: 12 }], 0.6, { cx: 15.2, bev: 0.15 })); // magazine-guide dimple (left)
  K.add(mat, slab([[48, -33], [128, -33], [128, -40], [124, -52, 6], [112, -58, 4], [60, -58, 4], [48, -50, 3]], 10, { bev: 1.5, holes: [[[58, -36], [118, -36], [116, -50, 4], [64, -52, 4], [56, -44, 3]]] }));
  K.add(mat, slab([[120, -40], [130, -40], [132, -58], [126, -60, 2]], 14, { bev: 1.5 })); // magazine catch paddle
  curvedTrigger(K, m, 76, -32, 18, 6);
  if (o.noGrip) return null; const g = pgrip(62, -34, 34, 96, 0.38, 'ak'); K.add(o.grip || m.woodT56d, slab(g.pts, 27, { bev: 8 })); return g;
}
const akMag762 = (K, mat) => magazine(K, mat, q2([186, -30], [192, -122], [250, -224]), q2([126, -30], [124, -120], [186, -238]), 26);
const akMag545 = (K, mat) => magazine(K, mat, q2([186, -30], [190, -120], [226, -212]), q2([126, -30], [124, -120], [162, -228]), 25);

// ------------------------------------------------------------------------------------------------------------------
const DRAW = {
  // M4A1 — 5.56 mm carbine: flat-top upper with the detachable carry handle, ribbed round handguard, triangular front
  // sight base, M4 barrel step, birdcage flash hider, 6-position stock, 30-round magazine
  carbine: (K, m) => { const g = arCommon(K, m, 1); arUpper(K, m); arStock(K, m, 1, 'm4'); stanag(K, m);
    K.add(m.alu, slab([[8, 21], [150, 21], [150, 26], [140, 66, 6], [26, 66, 6], [14, 56, 4], [8, 26]], 18, { bev: 2.4, holes: [[[34, 30], [130, 30], [130, 56, 6], [34, 56, 6]]] })); // carry handle
    K.add(m.alu, slab([[12, 64], [26, 64], [26, 74, 2], [14, 74, 2]], 12, { bev: 1 }), cyl(7, 6, -9, 64, 18, 'x', 18)); K.add(m.slot, cyl(1.6, 13, 0, 71, 19, 'z', 10)); // rear aperture + windage drum
    K.add(m.oxide, ringBand(186, 196, 0, 30)); K.add(m.poly, lathe([[196, 27], [200, 28.5], [358, 28.5], [362, 26]], 0, 0, 28)); for (let i = 0; i < 16; i++) K.add(m.poly, ringBand(204 + i * 9.8, 208 + i * 9.8, 0, 29.6)); K.add(m.oxide, ringBand(362, 368, 0, 25));
    K.add(m.oxide, lathe([[182, 10], [374, 9.5], [376, 8.5], [452, 8.5], [454, 9.5], [548, 9.5]], 0, 0, 20));
    K.add(m.oxide, slab([[374, -12], [394, -12], [394, 10], [386, 58, 2], [380, 58, 2], [378, 12]], 16, { bev: 2, holes: [[[383, 40], [388, 40], [387, 54], [383, 54]]] }), bx(2.4, 10, 2.4, 0, 52, 385), slab([[376, -12], [392, -12], [392, -22, 2], [380, -22]], 10, { bev: 1.5 }));
    K.add(m.oxide, lathe([[548, 11], [592, 11], [592, 7], [560, 7]], 0, 0, 24)); for (let i = 0; i < 4; i++) K.add(m.slot, bx(3.4, 3, 30, Math.cos(i * 1.57 + 0.78) * 10, Math.sin(i * 1.57 + 0.78) * 10, 572).rotateZ(0));
    return { grip: g, trig: [70, -36], guard: [52, 106, -38, -58], recv: [90, 0, 25, 30, 182], fore: [280, 0, 58, 58, 26], muzzle: 592, sight: [19, 71], rack: [-8, 12, 0], eject: [100, 2, -16], magWell: [136, -78], scoped: false };
  },
  // Mk 18 Mod 0 — 5.56 mm close-quarters carbine: 10.3" barrel under a four-rail handguard, flip-up iron sights, a
  // holographic sight, collapsible stock
  mk18: (K, m) => { const g = arCommon(K, m, 1); arUpper(K, m); arStock(K, m, 1, 'm4'); stanag(K, m);
    K.add(m.alu, tube([{ z: 190, y: 0, hw: 24, hd: 24, n: 7 }, { z: 420, y: 0, hw: 24, hd: 24, n: 7 }], { vertical: true, sub: 1, seg: 32 }));
    for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const gg of rail(194, 418, 23.5, 21)) { gg.rotateZ(r); K.add(m.alu, gg); }
    K.add(m.oxide, lathe([[182, 10], [442, 9], [442, 10.5], [486, 10.5], [486, 7], [450, 7]], 0, 0, 20)); for (let i = 0; i < 4; i++) K.add(m.slot, bx(3.4, 3, 30, Math.cos(i * 1.57 + 0.78) * 10, Math.sin(i * 1.57 + 0.78) * 10, 466));
    K.add(m.oxide, slab([[392, 29], [414, 29], [412, 56, 2], [404, 56, 2]], 14, { bev: 1.5 }), slab([[10, 21], [34, 21], [32, 50, 2], [22, 50, 2]], 18, { bev: 1.5, holes: [[[22, 40], [28, 40], [28, 46], [22, 46]]] })); // flip-up front / rear sights
    K.add(m.alu, slab([[70, 21], [140, 21], [140, 30, 2], [70, 30, 2]], 30, { bev: 2 }), slab([[76, 28], [136, 28], [134, 68, 4], [108, 70, 6], [78, 66, 4]], 32, { bev: 3, holes: [[[86, 34], [126, 34], [124, 62, 4], [88, 62, 4]]] })); // holographic sight hood
    K.add(m.lens, slab([[100, 34], [104, 34], [104, 62], [100, 62]], 26, { bev: 0.3 })); K.add(m.dot, cyl(0.8, 0.3, 0, 48, 104.4, 'z', 8));
    return { grip: g, trig: [70, -36], guard: [52, 106, -38, -58], recv: [90, 0, 25, 30, 182], fore: [300, 0, 52, 52, 14], muzzle: 486, sight: [72, 48], rack: [-8, 12, 0], eject: [100, 2, -16], magWell: [136, -78], scoped: false };
  },
  // M110 — 7.62 mm semi-automatic sniper system: the larger AR-10 receiver, free-float rail, 20" barrel with flash
  // suppressor, fixed stock with an adjustable comb, scope on the flat-top, folded bipod
  m110: (K, m) => { const s = 1.12; const g = arCommon(K, m, s, 'ergo'); arUpper(K, m, s); arStock(K, m, s, 'fixed');
    magazine(K, m.alu, q2([184, -45], [186, -110], [190, -160]), q2([118, -45], [118, -110], [122, -166]), 26, { plate: m.poly });
    K.add(m.alu, tube([{ z: 210, y: 0, hw: 27, hd: 27, n: 6 }, { z: 520, y: 0, hw: 27, hd: 27, n: 6 }], { vertical: true, sub: 1, seg: 32 })); for (const gg of rail(212, 518, 26.5, 21)) K.add(m.alu, gg);
    for (const gg of rail(250, 400, 26.5, 21)) { gg.rotateZ(Math.PI); K.add(m.alu, gg); }
    K.add(m.oxide, lathe([[204, 11], [520, 11], [540, 10], [712, 9.5], [714, 11], [756, 11], [756, 7.5], [720, 7.5]], 0, 0, 22)); for (let i = 0; i < 4; i++) K.add(m.slot, bx(3.6, 3.2, 30, Math.cos(i * 1.57 + 0.78) * 10.5, Math.sin(i * 1.57 + 0.78) * 10.5, 736));
    scope(K, m, 95, 58, 330, 15, 25, 21, [40, 150], 23); bipodFolded(K, m, 440, 640, -28);
    return { grip: g, trig: [78, -40], guard: [58, 119, -43, -65], recv: [100, 0, 28, 34, 204], fore: [300, 0, 56, 56, 14], muzzle: 756, sight: [-70, 58], rack: [-9, 14, 0], eject: [112, 2, -17], magWell: [152, -87], scoped: true };
  },
  // AK-47 — 7.62×39 mm: stamped receiver and ribbed top cover, wooden stock / handguards / grip, 45° gas block, hooded
  // front sight, cleaning rod, muzzle nut, the long right-hand safety lever and the deeply curved steel magazine
  assault: (K, m) => { const g = akReceiver(K, m, { grip: m.woodWalnut }); akMag762(K, m.blued);
    K.add(m.wood, slab([[0, 4], [-10, 4], [-296, -26, 4], [-304, -28], [-306, -126, 3], [-296, -132, 3], [-180, -100, 40], [-60, -50, 30], [-10, -36], [0, -34]], 38, { bev: 9 }));
    K.add(m.steel, slab([[-302, -24], [-311, -25, 2], [-313, -128, 2], [-302, -133]], 40, { bev: 2 })); K.add(m.steel, cyl(5.5, 1, 0, 4.5, -14, 'y', 12));
    K.add(m.wood, tube([{ z: 268, y: 22, hw: 14, hd: 10, n: 2.4 }, { z: 284, y: 22, hw: 16, hd: 12, n: 2.4 }, { z: 430, y: 22, hw: 16, hd: 12, n: 2.4 }, { z: 444, y: 22, hw: 13.5, hd: 10, n: 2.4 }], { vertical: true, seg: 28 }));
    K.add(m.oxide, lathe([[262, 9.5], [470, 9.5]], 22, 0, 16));
    K.add(m.wood, slab([[258, 8], [460, 8], [464, 4, 3], [464, -22, 6], [440, -30, 10], [300, -34, 16], [262, -30, 6]], 46, { bev: 12 }));
    K.add(m.steel, slab([[460, 10], [472, 10], [472, -18, 3], [460, -18, 3]], 40, { bev: 2.4 }));
    K.add(m.oxide, lathe([[256, 13], [262, 10.5], [266, 8.5], [540, 8], [640, 7.6], [665, 7.6]], 0, 0, 20));
    K.add(m.oxide, slab([[470, -10], [500, -10], [500, 6], [490, 31, 3], [470, 31, 3]], 24, { bev: 3 }), slab([[476, -10], [498, -10], [498, -18, 2], [480, -18]], 10, { bev: 1.5 }));
    K.add(m.oxide, slab([[590, -10], [612, -10], [612, 8], [608, 14], [606, 22, 1], [596, 22, 1], [594, 14], [590, 8]], 18, { bev: 2 }), lathe([[594, 9.5], [598, 10.5], [604, 10.5], [608, 9.5]], 30, 0, 18).scale(1, 1, 1), bx(2, 9, 2, 0, 29, 601));
    K.add(m.steel, lathe([[300, 3], [632, 3], [636, 4.5], [640, 4.5]], -13, 0, 10)); K.add(m.oxide, lathe([[665, 8.6], [681, 8.6], [683, 7]], 0, 0, 20));
    return { grip: g, trig: [76, -32], guard: [48, 128, -36, -58], recv: [125, -14, 30, 40, 250], fore: [360, -12, 46, 44, 14], muzzle: 683, sight: [236, 25], rack: [200, 0, -26], eject: [180, 0, -18], magWell: [156, -34], scoped: false };
  },
  // AK-74M — 5.45×39 mm: black polymer furniture and solid side-folding stock, side rail, long ported muzzle brake, the
  // shallower-curved plum-coloured magazine
  ak74m: (K, m) => { const g = akReceiver(K, m, { grip: m.poly }); akMag545(K, m.plum);
    K.add(m.poly, slab([[0, 4], [-14, 4], [-292, -14, 4], [-302, -16], [-304, -116, 3], [-292, -122, 3], [-210, -96, 20], [-160, -60, 16], [-110, -58, 16], [-60, -44, 20], [-10, -34], [0, -34]], 36, { bev: 9, holes: [[[-120, -14], [-210, -22, 12], [-206, -56, 10], [-160, -44, 14], [-124, -40, 10]]] }));
    K.add(m.rubber, slab([[-300, -12], [-310, -13, 2], [-312, -118, 2], [-300, -123]], 40, { bev: 2 }));
    K.add(m.oxide, slab([[40, -18], [200, -18], [200, -4], [40, -4]], 4, { cx: 16.4, bev: 0.8 })); // side rail (left)
    K.add(m.poly, tube([{ z: 268, y: 22, hw: 14, hd: 10, n: 2.6 }, { z: 284, y: 22, hw: 16, hd: 12, n: 2.6 }, { z: 430, y: 22, hw: 16, hd: 12, n: 2.6 }, { z: 444, y: 22, hw: 13.5, hd: 10, n: 2.6 }], { vertical: true, seg: 28 }));
    K.add(m.poly, slab([[258, 8], [460, 8], [464, 4, 3], [464, -22, 6], [440, -32, 8], [270, -32, 8], [262, -28, 6]], 46, { bev: 11 })); for (let i = 0; i < 6; i++) K.add(m.poly, slab([[290 + i * 26, -30], [304 + i * 26, -30], [304 + i * 26, -33.5, 1], [290 + i * 26, -33.5, 1]], 40, { bev: 1 }));
    K.add(m.steel, slab([[460, 10], [472, 10], [472, -18, 3], [460, -18, 3]], 40, { bev: 2.4 })); K.add(m.oxide, lathe([[262, 9.5], [470, 9.5]], 22, 0, 16));
    K.add(m.oxide, lathe([[256, 13], [262, 10.5], [266, 8.5], [540, 8], [640, 7.4], [665, 7.4]], 0, 0, 20));
    K.add(m.oxide, slab([[470, -10], [500, -10], [500, 6], [490, 31, 3], [470, 31, 3]], 24, { bev: 3 }), slab([[590, -10], [612, -10], [612, 8], [608, 14], [606, 22, 1], [596, 22, 1], [594, 14], [590, 8]], 18, { bev: 2 }), lathe([[594, 9.5], [598, 10.5], [604, 10.5], [608, 9.5]], 30, 0, 18), bx(2, 9, 2, 0, 29, 601));
    K.add(m.oxide, lathe([[665, 12], [745, 12], [748, 10], [748, 3], [738, 3]], 0, 0, 24)); for (let i = 0; i < 2; i++) for (const s of [1, -1]) K.add(m.slot, cyl(3.6, 1, s * 11.8, 0, 690 + i * 20, 'x', 12)); K.add(m.slot, bx(3, 1, 18, 0, 11.8, 712));
    return { grip: g, trig: [76, -32], guard: [48, 128, -36, -58], recv: [125, -14, 30, 40, 250], fore: [360, -12, 46, 44, 14], muzzle: 748, sight: [236, 25], rack: [200, 0, -26], eject: [180, 0, -18], magWell: [156, -34], scoped: false };
  },
  // AKS-74U — 5.45×39 mm carbine: the AK receiver with a hinged top cover, very short barrel with the cylindrical muzzle
  // booster, combined gas block / tall front sight, laminated plum handguards, triangular side-folding skeleton stock
  aks74u: (K, m) => { const g = akReceiver(K, m, { grip: m.plum, ribs: 0 }); akMag545(K, m.plum);
    K.add(m.oxide, slab([[0, 6], [-236, 6], [-246, 4, 3], [-248, -92, 3], [-236, -98, 3], [-10, -30], [0, -30]], 18, { bev: 3, holes: [[[-26, -2], [-222, -2], [-224, -78, 3], [-36, -26, 3]]] })); K.add(m.rubber, slab([[-244, 8], [-254, 8, 2], [-256, -96, 2], [-244, -100]], 38, { bev: 2 }));
    K.add(m.woodRed, tube([{ z: 268, y: 22, hw: 14, hd: 10, n: 2.4 }, { z: 280, y: 22, hw: 16, hd: 12, n: 2.4 }, { z: 340, y: 22, hw: 16, hd: 12, n: 2.4 }, { z: 352, y: 22, hw: 13.5, hd: 10, n: 2.4 }], { vertical: true, seg: 28 }));
    K.add(m.woodRed, slab([[258, 8], [352, 8], [356, 4, 3], [356, -22, 6], [340, -32, 8], [270, -32, 8], [262, -28, 6]], 46, { bev: 11 }));
    K.add(m.oxide, lathe([[256, 13], [262, 10.5], [266, 8.5], [400, 8]], 0, 0, 20), lathe([[262, 9.5], [362, 9.5]], 22, 0, 16));
    K.add(m.oxide, slab([[356, -12], [396, -12], [396, 10], [390, 30], [386, 48, 2], [380, 48, 2], [374, 30], [362, 32, 3], [356, 12]], 22, { bev: 2.4, holes: [[[379, 34], [387, 34], [386, 44], [380, 44]]] }), bx(2, 10, 2, 0, 40, 383));
    K.add(m.oxide, lathe([[396, 15], [404, 16.5], [452, 16.5], [462, 13], [470, 13], [470, 5], [456, 5]], 0, 0, 28)); for (let i = 0; i < 3; i++) K.add(m.steel, ringBand(410 + i * 14, 412 + i * 14, 0, 16.9));
    return { grip: g, trig: [76, -32], guard: [48, 128, -36, -58], recv: [125, -14, 30, 40, 250], fore: [310, -12, 46, 44, 14], muzzle: 470, sight: [236, 25], rack: [200, 0, -26], eject: [180, 0, -18], magWell: [156, -34], scoped: false };
  },
  // M14 — 7.62×51 mm: one-piece walnut stock with the semi-pistol grip, ventilated upper handguard, op-rod handle on the
  // right, aperture rear sight with its knobs, gas cylinder, flash suppressor with front sight, 20-round box magazine
  battle: (K, m) => {
    K.add(m.woodWalnut, slab([[560, -8], [560, -30, 6], [520, -40], [200, -44], [176, -40], [116, -42], [108, -36], [30, -36], [6, -40, 14], [-12, -96, 10], [-36, -100, 8], [-44, -84], [-60, -50, 20], [-150, -96, 30], [-318, -146, 4], [-326, -142], [-328, -24, 3], [-318, -18, 4], [-30, -4, 10], [0, -6]], 44, { bev: 10 }));
    K.add(m.steel, slab([[-324, -20], [-334, -21, 2], [-336, -144, 2], [-324, -150]], 46, { bev: 2 }));
    K.add(m.park, slab([[0, -8], [232, -8], [236, 4, 3], [232, 14, 3], [40, 16, 4], [10, 14, 2], [0, 8, 2]], 30, { bev: 3, taper: [-8, 16, 0.8] })); K.add(m.slot, slab([[60, -2], [150, -2], [150, 10], [60, 10, 2]], 1, { cx: -12.6, bev: 0.2 }));
    K.to('bolt', m.park, slab([[100, -6], [250, -10], [256, -6, 2], [256, 2, 2], [240, 4], [100, 0]], 3, { cx: -17, bev: 0.8 }), lathe([[0, 6], [8, 6], [10, 0.01]], 0, 0, 12).rotateY(-Math.PI / 2).translate(-0.021, 0.0, 0.25)); // op rod + handle
    K.add(m.park, slab([[2, 14], [26, 14], [26, 30, 2], [6, 34, 2]], 18, { bev: 1.2, holes: [[[12, 24], [18, 24], [18, 30], [12, 30]]] }), cyl(6.5, 6, -12, 20, 16, 'x', 18), cyl(6.5, 6, 12, 22, 12, 'x', 18));
    K.add(m.polyOD, tube([{ z: 236, y: 12, hw: 15, hd: 9, n: 2.6 }, { z: 450, y: 12, hw: 15, hd: 9, n: 2.6 }], { vertical: true, sub: 1, seg: 24 })); for (let i = 0; i < 4; i++) for (const s of [1, -1]) K.add(m.slot, slab([[260 + i * 46, 10], [290 + i * 46, 10], [290 + i * 46, 16, 2], [260 + i * 46, 16, 2]], 0.6, { cx: s * 14.6, bev: 0.15 }));
    K.add(m.park, lathe([[232, 13], [240, 10], [800, 8.5]], 0, 0, 20), lathe([[560, 9], [650, 9]], -18, 0, 16), slab([[560, 0], [600, 0], [600, -28, 3], [560, -28, 3]], 18, { bev: 2 }));
    K.add(m.park, lathe([[795, 10.5], [840, 10.5], [844, 8], [844, 5], [830, 5]], 0, 0, 24), slab([[818, 6], [834, 6], [832, 40, 1], [826, 40, 1]], 10, { bev: 1 })); for (let i = 0; i < 5; i++) K.add(m.slot, bx(2, 3, 16, Math.cos(i * 1.26 - 1.6) * 10, Math.sin(i * 1.26 - 1.6) * 10, 826));
    K.add(m.park, guardRing(12, 98, -40, -66, 10)); curvedTrigger(K, m, 44, -40, 18, 6);
    magazine(K, m.park, q2([176, -38], [178, -100], [180, -150]), q2([118, -38], [118, -100], [120, -154]), 26, { ribs: true });
    const g = { front: [[6, -42], [-12, -96]], back: [[-30, -6], [-48, -82]] };
    return { grip: g, gripW: 44, trig: [44, -40], guard: [12, 98, -40, -66], recv: [116, 2, 30, 24, 232], blocks: [[120, -24, 44, 26, 260]], fore: [320, -16, 44, 44, 14], muzzle: 844, sight: [15, 30], rack: [250, 0, -26], eject: [100, 4, -16], magWell: [148, -40], scoped: false };
  },
  // Mk 14 EBR — the M14 action in an aluminium chassis: rails all round, AR-style pistol grip, collapsible stock on a
  // buffer tube, 18" barrel with flash suppressor, scope, folded bipod
  mk14: (K, m) => {
    K.add(m.park, slab([[0, -8], [232, -8], [236, 4, 3], [232, 14, 3], [40, 16, 4], [10, 14, 2], [0, 8, 2]], 30, { bev: 3, taper: [-8, 16, 0.8] }));
    K.to('bolt', m.park, slab([[100, -6], [250, -10], [256, -6, 2], [256, 2, 2], [240, 4], [100, 0]], 3, { cx: -20, bev: 0.8 }), lathe([[0, 6], [8, 6], [10, 0.01]], 0, 0, 12).rotateY(-Math.PI / 2).translate(-0.024, 0.0, 0.25));
    K.add(m.alu, slab([[-20, -10], [450, -10], [456, -16, 4], [456, -40, 4], [180, -42], [176, -46], [116, -46], [108, -40], [30, -40], [10, -42], [-20, -30, 6]], 38, { bev: 4 }));
    K.add(m.alu, tube([{ z: 236, y: 2, hw: 25, hd: 22, n: 6 }, { z: 460, y: 2, hw: 25, hd: 22, n: 6 }], { vertical: true, sub: 1, seg: 32 })); for (const r of [Math.PI / 2, -Math.PI / 2]) for (const gg of rail(260, 452, 24.5, 21)) { gg.rotateZ(r); gg.translate(0, 0.002, 0); K.add(m.alu, gg); }
    K.add(m.alu, ...rail(-10, 456, 25, 21));
    K.add(m.park, lathe([[232, 13], [240, 10], [720, 9]], 0, 0, 20), lathe([[716, 10.5], [760, 10.5], [764, 8], [764, 5], [750, 5]], 0, 0, 24)); for (let i = 0; i < 5; i++) K.add(m.slot, bx(2, 3, 16, Math.cos(i * 1.26 - 1.6) * 10, Math.sin(i * 1.26 - 1.6) * 10, 746));
    K.add(m.alu, guardRing(48, 112, -40, -64, 10)); curvedTrigger(K, m, 70, -40, 18, 6); const g = pgrip(54, -40, 32, 98, 0.44, 'ergo'); K.add(m.poly, slab(g.pts, 27, { bev: 8 }));
    K.add(m.oxide, lathe([[-200, 14.5], [-20, 14.5]], -8, 0, 24)); K.add(m.poly, slab([[-110, 11], [-250, 12], [-258, 14, 3], [-260, -100, 3], [-250, -104, 4], [-232, -94], [-140, -30, 10], [-110, -26, 3]], 40, { bev: 7 })); K.add(m.rubber, slab([[-258, 16], [-268, 16, 3], [-270, -102, 3], [-258, -106, 3]], 42, { bev: 3 }));
    magazine(K, m.park, q2([176, -42], [178, -100], [180, -152]), q2([118, -42], [118, -100], [120, -156]), 26);
    scope(K, m, 80, 60, 300, 15, 23, 20, [30, 130], 29); bipodFolded(K, m, 400, 590, -42);
    return { grip: g, trig: [70, -40], guard: [48, 112, -40, -64], recv: [116, 2, 30, 24, 232], blocks: [[200, -26, 38, 30, 470]], fore: [300, 2, 60, 52, 10], muzzle: 764, sight: [-80, 60], rack: [250, 0, -28], eject: [100, 4, -16], magWell: [148, -44], scoped: true };
  },
  // L1A1 — 7.62×51 mm self-loading rifle: tall two-part receiver, folding cocking handle on the left, black synthetic
  // stock / grip / ventilated handguard, carrying handle, long slotted flash hider, 20-round magazine
  l1a1: (K, m) => {
    K.add(m.park, slab([[0, -12], [250, -12], [254, -2, 3], [250, 14, 3], [190, 18], [12, 22, 4], [0, 18, 2]], 30, { bev: 3, taper: [-12, 22, 0.84] }));
    K.add(m.park, slab([[-4, -12], [176, -12], [176, -24], [172, -46, 3], [112, -46], [104, -40], [40, -40], [20, -36], [-4, -30, 6]], 28, { bev: 2.4 }));
    K.add(m.park, slab([[110, -40], [176, -40], [178, -54, 2], [110, -54, 2]], 32, { bev: 2 })); // magazine well
    K.add(m.slot, slab([[90, -4], [170, -4], [170, 10], [90, 10, 2]], 1, { cx: -14.4, bev: 0.2 }));
    K.to('bolt', m.steel, slab([[150, 4], [168, 4], [168, 10], [150, 10]], 3, { cx: 16, bev: 0.6 }), slab([[158, 6], [162, 6], [176, 24, 2], [172, 26, 2]], 4, { cx: 19, bev: 0.8 })); // folding cocking handle (left)
    K.add(m.park, slab([[4, 20], [26, 20], [26, 32, 2], [8, 34, 2]], 16, { bev: 1.2, holes: [[[12, 26], [18, 26], [18, 30], [12, 30]]] }));
    K.add(m.park, slab([[80, 20], [92, 20], [100, 44, 4], [160, 44, 4], [166, 20]], 6, { cx: 0, bev: 1.4, holes: [[[94, 24], [156, 24], [154, 38, 4], [102, 38, 4]]] })); // carrying handle
    K.add(m.poly, slab([[254, 12], [470, 12], [474, 8, 3], [474, -22, 8], [450, -28, 10], [270, -30, 10], [256, -24, 4]], 44, { bev: 10 })); for (let i = 0; i < 6; i++) for (const s of [1, -1]) K.add(m.slot, slab([[290 + i * 28, -8], [306 + i * 28, -8], [306 + i * 28, 2, 3], [290 + i * 28, 2, 3]], 0.6, { cx: s * 21.6, bev: 0.15 }));
    K.add(m.park, lathe([[250, 14], [262, 11], [470, 10], [780, 8.6]], 0, 0, 20), slab([[470, -8], [500, -8], [500, 26], [470, 26]], 22, { bev: 2.4 }));
    K.add(m.park, slab([[748, -8], [770, -8], [770, 12], [766, 36, 1], [752, 36, 1], [748, 12]], 18, { bev: 2, holes: [[[754, 22], [764, 22], [764, 32], [754, 32]]] }), bx(2, 12, 2, 0, 30, 759));
    K.add(m.park, lathe([[780, 11], [836, 11], [838, 9], [838, 6], [820, 6]], 0, 0, 24)); for (let i = 0; i < 6; i++) K.add(m.slot, bx(2.2, 3, 32, Math.cos(i * 1.05) * 10.6, Math.sin(i * 1.05) * 10.6, 814));
    K.add(m.poly, slab([[-4, 10], [-14, 12], [-300, 2, 4], [-310, 0], [-312, -112, 3], [-300, -118, 4], [-150, -72, 30], [-40, -34, 20], [-4, -30]], 42, { bev: 10 })); K.add(m.rubber, slab([[-308, 2], [-320, 1, 2], [-322, -114, 2], [-308, -119]], 44, { bev: 2.4 }));
    K.add(m.park, guardRing(40, 106, -40, -60, 9)); curvedTrigger(K, m, 74, -38, 18, 6); const g = pgrip(36, -40, 32, 96, 0.36, 'ak'); K.add(m.poly, slab(g.pts, 28, { bev: 8 }));
    K.add(m.steel, slab([[22, -26], [36, -22], [37, -26, 2], [24, -30, 2]], 2.4, { cx: 14.6, bev: 0.6 })); pin(K, m, 8, -22, 28, 2.4);
    magazine(K, m.park, q2([174, -42], [176, -110], [184, -160]), q2([114, -42], [112, -110], [118, -166]), 26);
    return { grip: g, trig: [74, -38], guard: [40, 106, -40, -60], recv: [125, 2, 30, 34, 250], blocks: [[86, -28, 28, 30, 180]], fore: [340, -10, 44, 40, 14], muzzle: 838, sight: [15, 30], rack: [160, 10, 20], eject: [130, 4, -16], magWell: [144, -54], scoped: false };
  },
  // G3A3 — 7.62×51 mm: stamped receiver with the cocking tube running over the barrel, cocking handle up front on the
  // left, rotary-drum rear sight, slim ventilated handguard, slim fixed stock, polymer trigger pack, 20-round magazine
  g3a3: (K, m) => {
    K.add(m.oxide, slab([[0, -12], [270, -12], [274, -4, 3], [274, 10, 3], [268, 18], [10, 18, 3], [0, 12, 2]], 32, { bev: 3, taper: [-12, 18, 0.88] }));
    K.add(m.oxide, slab([[270, 10], [528, 10], [534, 16, 3], [534, 34, 6], [526, 38, 4], [270, 38]], 26, { bev: 7 })); // cocking tube
    K.add(m.oxide, slab([[110, -12], [176, -12], [178, -54, 2], [110, -54, 2]], 32, { bev: 2 })); K.add(m.slot, slab([[100, -4], [176, -4], [176, 8], [100, 8, 2]], 1, { cx: -15.4, bev: 0.2 }));
    K.to('bolt', m.oxide, slab([[400, 22], [412, 22], [430, 52, 3], [424, 54, 3]], 5, { cx: 14, bev: 1 })); // cocking handle (left, front)
    K.add(m.oxide, slab([[6, 18], [36, 18], [36, 30, 2], [6, 30, 2]], 22, { bev: 2 }), cyl(10, 22, 0, 36, 18, 'x', 22)); K.add(m.slot, cyl(1.8, 23, 0, 40, 18, 'z', 8)); // drum rear sight
    K.add(m.polyGreen, slab([[278, 10], [520, 10], [524, 6, 3], [524, -22, 8], [506, -28, 8], [290, -30, 8], [280, -24, 4]], 44, { bev: 11 })); for (let i = 0; i < 8; i++) for (const s of [1, -1]) K.add(m.slot, cyl(3.2, 0.6, s * 21.6, -10, 300 + i * 26, 'x', 12));
    K.add(m.oxide, lathe([[270, 14], [282, 11], [720, 8.8]], 0, 0, 20)); K.add(m.oxide, slab([[512, 36], [534, 36], [532, 58, 3], [514, 58, 3]], 18, { bev: 2, holes: [[[518, 44], [528, 44], [528, 54], [518, 54]]] }), bx(2, 12, 2, 0, 50, 523));
    K.add(m.oxide, lathe([[720, 11], [770, 11], [772, 9], [772, 6], [756, 6]], 0, 0, 24)); for (let i = 0; i < 4; i++) K.add(m.slot, bx(2.4, 3, 30, Math.cos(i * 1.57) * 10.6, Math.sin(i * 1.57) * 10.6, 750));
    K.add(m.poly, slab([[-4, -12], [100, -12], [104, -30, 4], [100, -66, 6], [80, -68, 6], [44, -40], [20, -38], [-4, -30, 6]], 30, { bev: 3, holes: [[[52, -38], [96, -38], [94, -60, 4], [80, -62, 4], [56, -44, 3]]] })); // trigger pack + guard
    curvedTrigger(K, m, 58, -36, 18, 6); const g = pgrip(44, -38, 32, 96, 0.4, 'ergo'); K.add(m.poly, slab(g.pts, 28, { bev: 8 }));
    K.add(m.poly, slab([[-4, 12], [-14, 12], [-300, 4, 4], [-310, 2], [-312, -104, 3], [-300, -110, 4], [-170, -64, 30], [-40, -30, 16], [-4, -24]], 40, { bev: 9 })); K.add(m.rubber, slab([[-308, 4], [-320, 3, 2], [-322, -106, 2], [-308, -111]], 44, { bev: 2.4 }));
    K.add(m.steel, slab([[22, -26], [34, -22], [36, -27, 2], [24, -31, 2]], 2.4, { cx: 15.6, bev: 0.6 })); pin(K, m, 10, -22, 30, 2.4); pin(K, m, 92, -22, 30, 2.4);
    magazine(K, m.alu, q2([174, -46], [176, -110], [184, -164]), q2([112, -46], [112, -110], [116, -170]), 26);
    return { grip: g, trig: [58, -36], guard: [52, 98, -38, -64], recv: [135, 2, 32, 30, 270], fore: [350, -8, 44, 40, 14], muzzle: 772, sight: [18, 42], rack: [415, 30, 20], eject: [140, 4, -17], magWell: [144, -54], scoped: false };
  },
  // SVD — 7.62×54R mm: the long AK-type receiver, skeletonised wooden thumbhole stock with cheek rest, ventilated
  // wooden handguard, long barrel with slotted flash hider, side-mounted 4× scope with sunshade, 10-round ribbed magazine
  semi: (K, m) => { const g = akReceiver(K, m, { L: 300, grip: m.woodBirch, ribs: 0 });
    K.add(m.woodBirch, slab([[0, 4], [-20, 4], [-90, 14, 6], [-240, 14, 6], [-300, 4, 6], [-330, 2], [-334, -116, 3], [-322, -124, 3], [-270, -112], [-150, -104, 20], [-30, -122, 10], [-2, -118, 4], [6, -96], [0, -34]], 40, { bev: 9,
      holes: [[[-26, -14], [-150, -18, 12], [-150, -76, 10], [-40, -100, 10], [-10, -66, 6]], [[-190, -10], [-280, -12, 10], [-286, -60, 12], [-200, -70, 12]]] }));
    K.add(m.rubber, slab([[-330, 4], [-340, 4, 2], [-344, -118, 2], [-330, -126]], 42, { bev: 2 }));
    K.add(m.woodBirch, slab([[-100, 14], [-220, 14], [-220, 30, 6], [-100, 30, 6]], 30, { bev: 7 })); // cheek rest
    K.add(m.woodBirch, tube([{ z: 316, y: 4, hw: 22, hd: 22, n: 2.4 }, { z: 330, y: 4, hw: 24, hd: 24, n: 2.4 }, { z: 520, y: 4, hw: 23, hd: 22, n: 2.4 }, { z: 532, y: 4, hw: 20, hd: 19, n: 2.4 }], { vertical: true, seg: 28 }));
    for (let i = 0; i < 6; i++) for (const s of [1, -1]) K.add(m.slot, slab([[350 + i * 26, -2], [370 + i * 26, -2], [370 + i * 26, 6, 3], [350 + i * 26, 6, 3]], 0.6, { cx: s * 23.4, bev: 0.15 }));
    K.add(m.oxide, lathe([[306, 13], [312, 10.5], [316, 9], [920, 7.8]], 0, 0, 20), slab([[536, -10], [570, -10], [570, 10], [560, 30, 3], [536, 30, 3]], 24, { bev: 3 }));
    K.add(m.oxide, slab([[886, -9], [906, -9], [906, 8], [902, 30, 1], [890, 30, 1], [886, 8]], 16, { bev: 2 }), bx(2, 10, 2, 0, 24, 896));
    K.add(m.oxide, lathe([[920, 10.5], [1000, 10.5], [1002, 8], [1002, 5], [986, 5]], 0, 0, 24)); for (let i = 0; i < 5; i++) K.add(m.slot, bx(2.2, 3, 50, Math.cos(i * 1.26) * 10.2, Math.sin(i * 1.26) * 10.2, 966));
    K.add(m.oxide, slab([[40, -6], [200, -6], [200, 34], [40, 34]], 8, { cx: 17, bev: 1.2 })); scope(K, m, 110, 66, 375, 13, 19, 18, [60, 170], 34, { x: 10, shade: 40, side: true });
    magazine(K, m.blued, q2([176, -30], [178, -100], [186, -150]), q2([118, -30], [116, -100], [122, -156]), 26);
    return { grip: g, trig: [76, -32], guard: [48, 128, -36, -58], recv: [150, -14, 30, 40, 300], fore: [360, 4, 46, 44, 18], muzzle: 1002, sight: [-60, 66], rack: [200, 0, -26], eject: [180, 0, -18], magWell: [148, -30], scoped: true };
  },
};

// turn-bolt rifles (M24, M40A5, M91/30) and the precision rifles (M2010, L115A3), M107 -----------------------------------
function boltAction(K, m, o) { // round receiver on the bore line, bolt with its handle on the right, trigger guard / floorplate
  K.add(o.rmat || m.oxide, lathe([[0, 15], [4, 17], [o.L - 6, 17], [o.L, 15]], 1, 0, 32));
  K.add(m.slot, slab([[40, -6], [o.L - 40, -6], [o.L - 40, 12], [40, 12, 3]], 1, { cx: -16.4, bev: 0.2 }));
  const bolt = o.boltZ || 30; K.to('bolt', m.steel, lathe([[bolt - 40, 9], [bolt + 70, 9]], 1, 0, 18), cyl(4.5, 40, -22, 1, bolt, 'x', 12));
  K.to('bolt', o.knob || m.oxide, lathe([[0, 0.01], [2, 7], [10, 8.5], [18, 7], [20, 0.01]], 0, 0, 16).rotateY(-Math.PI / 2).translate(-0.040, 0.001 - (o.bent ? 0.012 : 0), bolt * MM));
  if (o.bent) K.to('bolt', m.steel, cyl(3.5, 14, -36, -5, bolt, 'y', 10));
}
const DRAW2 = {
  // M24 — 7.62×51 mm sniper weapon system: olive-drab composite stock with a vertical grip and adjustable butt, round
  // long action, heavy barrel, fixed 10× scope, hinged floorplate
  bolt: (K, m) => { boltAction(K, m, { L: 220 });
    K.add(m.polyOD, slab([[230, -12], [600, -10], [606, -14, 4], [606, -40, 8], [560, -46], [230, -50], [200, -54], [110, -54], [100, -48], [40, -46], [8, -58, 10], [-14, -110, 10], [-40, -112, 8], [-50, -96], [-58, -54, 20], [-140, -86, 20], [-290, -116, 4], [-298, -112], [-300, -6, 3], [-290, 0, 4], [-60, 4, 10], [0, -12]], 50, { bev: 11 }));
    K.add(m.rubber, slab([[-298, -4], [-312, -4, 3], [-314, -114, 3], [-298, -118, 3]], 50, { bev: 3 })); K.add(m.oxide, slab([[-286, -8], [-296, -8], [-296, -112], [-286, -112]], 44, { bev: 1.5 }));
    K.add(m.oxide, lathe([[220, 15], [232, 14], [240, 13], [600, 12], [820, 10.5], [826, 10], [826, 4], [814, 4]], 0, 0, 24));
    K.add(m.oxide, guardRing(0, 90, -52, -76, 10)); curvedTrigger(K, m, 40, -50, 18, 6); K.add(m.steel, slab([[110, -50], [210, -50], [210, -56, 2], [110, -56, 2]], 30, { bev: 1.5 }));
    K.add(m.oxide, slab([[-10, 14], [222, 14], [222, 22], [-10, 22]], 20, { bev: 1.5 })); scope(K, m, 100, 58, 320, 15, 25, 21, [40, 170], 22);
    K.add(m.steel, cyl(5, 18, 0, -48, 550, 'z', 12), lathe([[540, 2], [560, 2]], -50, 0, 8));
    const g = { front: [[8, -58], [-14, -110]], back: [[-36, -10], [-56, -96]] };
    return { grip: g, gripW: 50, trig: [40, -50], guard: [0, 90, -52, -76], recv: [110, 1, 34, 34, 220], blocks: [[200, -32, 50, 36, 400]], fore: [340, -30, 50, 36, 16], muzzle: 826, sight: [-60, 58], rack: [30, 1, -46], eject: [120, 4, -18], magWell: [160, -54], scoped: true, boltY: 1 };
  },
  // M40A5 — 7.62×51 mm: woodland-green fibreglass stock with an adjustable cheek piece and spacer butt, detachable box
  // magazine, threaded muzzle with suppressor mount, scope on a one-piece rail
  m40a5: (K, m) => { boltAction(K, m, { L: 220 });
    K.add(m.polyGreen, slab([[230, -12], [610, -10], [616, -14, 4], [616, -40, 8], [570, -48], [230, -52], [200, -54], [110, -54], [100, -48], [40, -46], [10, -58, 10], [-10, -106, 12], [-36, -110, 8], [-48, -94], [-56, -56, 18], [-150, -96, 20], [-280, -112, 4], [-290, -106], [-292, -10, 3], [-280, -4, 4], [-60, 4, 10], [0, -12]], 50, { bev: 11 }));
    K.add(m.polyGreen, slab([[-80, 4], [-250, 2], [-254, 22, 4], [-84, 22, 4]], 34, { bev: 7 })); for (const z of [-120, -210]) K.add(m.steel, cyl(3, 10, 0, 12, z, 'y', 10));
    K.add(m.rubber, slab([[-290, -8], [-304, -8, 3], [-306, -108, 3], [-290, -112, 3]], 50, { bev: 3 })); K.add(m.steel, slab([[-282, -10], [-290, -10], [-290, -108], [-282, -108]], 44, { bev: 1 }));
    K.add(m.oxide, lathe([[220, 15], [232, 14], [240, 13], [620, 12], [846, 10.5], [848, 12.5], [880, 12.5], [882, 10], [882, 4], [870, 4]], 0, 0, 24)); for (let i = 0; i < 3; i++) for (const s of [1, -1]) K.add(m.slot, cyl(3, 1, s * 12.3, 0, 856 + i * 9, 'x', 10));
    K.add(m.oxide, guardRing(0, 90, -52, -76, 10)); curvedTrigger(K, m, 40, -50, 18, 6);
    magazine(K, m.oxide, q2([170, -40], [170, -70], [171, -96]), q2([112, -40], [112, -70], [113, -96]), 24, { ribs: false });
    K.add(m.alu, ...rail(-10, 226, 15, 21)); scope(K, m, 100, 60, 340, 15, 27, 21, [40, 180], 22, { shade: 30 });
    const g = { front: [[10, -58], [-10, -106]], back: [[-36, -10], [-54, -94]] };
    return { grip: g, gripW: 50, trig: [40, -50], guard: [0, 90, -52, -76], recv: [110, 1, 34, 34, 220], blocks: [[200, -32, 50, 36, 400]], fore: [350, -30, 50, 36, 16], muzzle: 882, sight: [-70, 60], rack: [30, 1, -46], eject: [120, 4, -18], magWell: [141, -96], scoped: true, boltY: 1 };
  },
  // M91/30 sniper — 7.62×54R mm: long shellac-finished wooden stock with two barrel bands, hexagonal receiver ring,
  // turned-down bolt handle, straight wrist, steel buttplate, short PU scope on its side mount, hooded front sight
  m9130: (K, m) => { boltAction(K, m, { L: 180, bent: true, knob: m.steel, rmat: m.blued });
    K.add(m.blued, lathe([[180, 18], [214, 18]], 1, 0, 6));
    K.add(m.woodRed, slab([[214, -8], [690, -6], [694, -10, 3], [694, -22, 6], [660, -28], [214, -34], [180, -38], [110, -40], [96, -34], [40, -36], [0, -38, 20], [-60, -66, 20], [-140, -90, 30], [-332, -132, 4], [-340, -128], [-342, -26, 3], [-330, -20, 4], [-40, -10, 10], [0, -10]], 42, { bev: 10 }));
    K.add(m.steel, slab([[-338, -22], [-348, -23, 2], [-350, -132, 2], [-338, -136]], 44, { bev: 2 }));
    for (const z of [380, 610]) K.add(m.steel, slab([[z, -8], [z + 14, -8], [z + 14, -30, 3], [z, -30, 3]], 44, { bev: 2 }), lathe([[z, 10.5], [z + 14, 10.5]], 0, 0, 20));
    K.add(m.blued, lathe([[214, 13], [230, 12], [700, 9], [760, 8.5]], 0, 0, 20)); K.add(m.blued, lathe([[734, 10], [752, 10]], 0, 0, 20), slab([[736, 6], [750, 6], [750, 26, 1], [736, 26, 1]], 6, { bev: 1 })); K.add(m.blued, lathe([[732, 12], [754, 12], [754, 11], [732, 11]], 18, 0, 20));
    K.add(m.blued, guardRing(-8, 70, -38, -62, 9)); curvedTrigger(K, m, 18, -36, 16, 6);
    K.add(m.blued, slab([[30, -10], [150, -10], [150, 38], [30, 38]], 6, { cx: 22, bev: 1 })); scope(K, m, 90, 52, 170, 11, 13, 14, [50, 130], 34, { x: 0 });
    const g = { front: [[2, -42], [-22, -88]], back: [[-34, -16], [-58, -66]] };
    return { grip: g, gripW: 42, trig: [18, -36], guard: [-8, 70, -38, -62], recv: [90, 1, 34, 34, 214], blocks: [[330, -22, 42, 28, 540]], fore: [330, -20, 42, 30, 14], muzzle: 760, sight: [-10, 52], rack: [30, -10, -46], eject: [100, 4, -18], magWell: [130, -40], scoped: true, boltY: 1 };
  },
  // M2010 — .300 Win Mag: coyote chassis with a free-float forend, folding stock with adjustable comb and length of pull,
  // AR-type grip, long suppressor, large scope, folded bipod
  precision: (K, m) => { boltAction(K, m, { L: 220 });
    K.add(m.polyFDE, slab([[-20, -12], [520, -12], [526, -18, 4], [526, -48, 6], [230, -52], [200, -56], [110, -56], [100, -50], [30, -48], [-20, -40, 6]], 46, { bev: 6 }));
    K.add(m.polyFDE, tube([{ z: 232, y: -6, hw: 26, hd: 28, n: 5 }, { z: 528, y: -6, hw: 26, hd: 28, n: 5 }], { vertical: true, sub: 1, seg: 32 })); for (let i = 0; i < 5; i++) for (const s of [1, -1]) K.add(m.slot, slab([[260 + i * 50, -14], [290 + i * 50, -14], [290 + i * 50, -2, 2], [260 + i * 50, -2, 2]], 0.6, { cx: s * 25.6, bev: 0.15 }));
    K.add(m.polyFDE, ...rail(-30, 528, 19, 21));
    K.add(m.oxide, lathe([[220, 15], [232, 14], [528, 12.5], [760, 11]], 0, 0, 24), lathe([[760, 20], [764, 22], [990, 22], [994, 19], [994, 5], [984, 5]], 0, 0, 32)); // barrel + suppressor
    K.add(m.polyFDE, guardRing(28, 110, -50, -74, 10)); curvedTrigger(K, m, 70, -48, 18, 6); const g = pgrip(30, -50, 32, 98, 0.42, 'ergo'); K.add(m.poly, slab(g.pts, 27, { bev: 8 }));
    K.add(m.polyFDE, slab([[-20, 10], [-60, 10], [-60, -40], [-20, -44]], 40, { bev: 4 })); // folding hinge
    K.add(m.polyFDE, slab([[-60, 6], [-290, 6], [-300, 4, 4], [-302, -110, 4], [-290, -116, 4], [-240, -100], [-120, -50, 14], [-60, -44, 6]], 40, { bev: 6, holes: [[[-90, -6], [-260, -6, 8], [-262, -60, 10], [-220, -80, 10], [-110, -40, 8]]] }));
    K.add(m.polyFDE, slab([[-110, 8], [-250, 8], [-252, 26, 4], [-112, 26, 4]], 34, { bev: 6 })); K.add(m.rubber, slab([[-300, 6], [-312, 6, 3], [-314, -112, 3], [-300, -118, 3]], 44, { bev: 3 }));
    magazine(K, m.oxide, q2([172, -44], [172, -80], [173, -104]), q2([110, -44], [110, -80], [111, -104]), 26, { ribs: false });
    scope(K, m, 90, 66, 380, 17, 29, 22, [30, 180], 25, { shade: 40, side: true }); bipodFolded(K, m, 450, 650, -50);
    return { grip: g, trig: [70, -48], guard: [28, 110, -50, -74], recv: [110, 1, 34, 34, 220], blocks: [[250, -30, 46, 44, 540]], fore: [380, -10, 52, 56, 14], muzzle: 994, sight: [-90, 66], rack: [30, 1, -46], eject: [120, 4, -18], magWell: [141, -104], scoped: true, boltY: 1 };
  },
  // L115A3 — .338 long-range rifle: green aluminium/polymer thumbhole chassis that folds, cheek piece, long fluted barrel
  // with muzzle brake, large scope with sunshade, 5-round magazine, folded bipod
  l115a3: (K, m) => { boltAction(K, m, { L: 230 });
    K.add(m.polyGreen, slab([[240, -12], [560, -12], [566, -16, 4], [566, -44, 6], [240, -50], [200, -56], [110, -56], [100, -50], [40, -50], [10, -60, 8], [-10, -110, 10], [-36, -112, 8], [-44, -96], [-50, -62], [-60, -40], [-100, -50], [-300, -110, 4], [-310, -106], [-312, -10, 3], [-300, -2, 4], [-60, 6, 10], [0, -12]], 50, { bev: 10,
      holes: [[[-20, -16], [-50, -20, 6], [-40, -56, 6], [-14, -92, 6], [-2, -64, 6]], [[-140, -20], [-270, -18, 10], [-276, -80, 12], [-170, -60, 12]]] }));
    K.add(m.polyGreen, slab([[-90, 6], [-260, 4], [-264, 24, 4], [-94, 24, 4]], 34, { bev: 7 })); K.add(m.rubber, slab([[-310, -6], [-324, -6, 3], [-326, -108, 3], [-310, -112, 3]], 50, { bev: 3 }));
    K.add(m.oxide, lathe([[230, 15], [242, 14], [560, 13]], 0, 0, 24), lathe([[560, 13], [900, 11]], 0, 0, 48)); K.add(m.oxide, flutedZ(0.0112, 0.6, 0.88, 0, 6, 0.0018, 0.03));
    K.add(m.oxide, slab([[900, -14], [960, -14], [960, 14], [900, 14]], 36, { bev: 4 })); for (let i = 0; i < 3; i++) for (const s of [1, -1]) K.add(m.slot, slab([[910 + i * 16, -10], [920 + i * 16, -10], [920 + i * 16, 10], [910 + i * 16, 10]], 0.6, { cx: s * 18.1, bev: 0.15 }));
    K.add(m.polyGreen, guardRing(6, 96, -52, -76, 10)); curvedTrigger(K, m, 44, -50, 18, 6);
    magazine(K, m.oxide, q2([176, -44], [176, -80], [177, -108]), q2([112, -44], [112, -80], [113, -108]), 28, { ribs: false });
    K.add(m.oxide, ...rail(-10, 236, 15, 21)); scope(K, m, 100, 66, 400, 17, 30, 22, [30, 180], 22, { shade: 50, side: true }); bipodFolded(K, m, 460, 660, -46);
    const g = { front: [[10, -60], [-10, -110]], back: [[-30, -18], [-46, -96]] };
    return { grip: g, gripW: 50, trig: [44, -50], guard: [6, 96, -52, -76], recv: [115, 1, 34, 34, 230], blocks: [[300, -30, 50, 36, 520]], fore: [350, -30, 50, 36, 16], muzzle: 960, sight: [-100, 66], rack: [30, 1, -46], eject: [120, 4, -18], magWell: [144, -108], scoped: true, boltY: 1 };
  },
  // M107 — .50 BMG semi-automatic anti-materiel rifle: big stamped upper and lower receivers, fluted barrel recoiling in
  // the upper, double-chamber arrowhead muzzle brake, carry handle, monopod butt, scope rail, 10-round box, bipod
  m107: (K, m) => {
    K.add(m.park, slab([[-40, -22], [560, -22], [580, -14, 6], [580, 22, 6], [560, 30], [-40, 30, 6]], 44, { bev: 4, taper: [-22, 30, 0.9] })); // upper
    K.add(m.park, slab([[-40, -22], [180, -22], [184, -60, 4], [110, -64], [100, -56], [40, -56], [20, -50], [-40, -50]], 40, { bev: 3 })); // lower
    K.add(m.park, slab([[-40, 28], [-300, 28, 4], [-300, -112, 6], [-250, -112, 6], [-200, -84, 20], [-90, -58, 16], [-40, -52]], 40, { bev: 5, holes: [[[-80, 14], [-250, 14, 8], [-250, -40, 8], [-190, -62, 14], [-96, -42, 10]]] })); // skeleton butt
    K.add(m.park, slab([[100, -56], [180, -56], [182, -76, 3], [100, -76, 3]], 46, { bev: 2.4 }));
    K.add(m.park, ...rail(-40, 400, 30, 21)); K.add(m.park, slab([[180, 36], [200, 36], [214, 70, 6], [300, 70, 6], [314, 36], [334, 36]], 10, { bev: 2, holes: [[[206, 40], [308, 40], [298, 62, 6], [216, 62, 6]]] }));
    K.add(m.rubber, slab([[-300, 34], [-322, 34, 6], [-326, -112, 6], [-300, -116, 6]], 52, { bev: 5 })); K.add(m.park, slab([[-300, 30], [-322, 30], [-322, -110], [-300, -110]], 46, { bev: 2 }));
    K.add(m.oxide, lathe([[-200, 8], [-120, 8]], -64, 0, 14), slab([[-206, -64], [-194, -64], [-194, -110, 3], [-206, -110, 3]], 16, { bev: 2 })); // monopod
    K.add(m.oxide, lathe([[580, 18], [620, 17]], 0, 0, 40), flutedZ(0.0166, 0.62, 1.2, 0, 8, 0.0022, 0.04));
    K.add(m.park, slab([[1200, -26], [1220, -34], [1260, -34], [1290, -18], [1300, 0], [1290, 18], [1260, 34], [1220, 34], [1200, 26]].map(([z, y]) => [z, y]), 26, { bev: 4, holes: [[[1214, -24], [1236, -24], [1236, 24], [1214, 24]], [[1248, -24], [1270, -20], [1270, 20], [1248, 24]]] }));
    K.add(m.park, guardRing(60, 124, -54, -84, 12)); curvedTrigger(K, m, 80, -50, 18, 7); const g = pgrip(68, -58, 32, 100, 0.44, 'ergo'); K.add(m.poly, slab(g.pts, 30, { bev: 8 }));
    K.to('bolt', m.steel, slab([[120, 6], [150, 6], [150, 20], [120, 20]], 6, { cx: -24, bev: 1.4 }));
    magazine(K, m.park, q2([178, -60], [178, -110], [180, -150]), q2([102, -60], [102, -110], [104, -154]), 42, { ribs: false });
    scope(K, m, 140, 80, 380, 17, 29, 22, [70, 220], 37, { shade: 40, side: true });
    K.add(m.oxide, slab([[540, -18], [580, -18], [580, -40, 4], [540, -40, 4]], 50, { bev: 4 })); for (const s of [1, -1]) { K.add(m.oxide, lathe([[580, 6], [800, 6], [802, 5], [860, 5]], -36, s * 18, 14)); K.add(m.rubber, lathe([[860, 8], [880, 8]], -36, s * 18, 14)); }
    const g2 = g; return { grip: g2, trig: [80, -50], guard: [60, 124, -56, -84], recv: [270, 4, 44, 52, 620], fore: [360, -10, 44, 52, 16], muzzle: 1300, sight: [-50, 80], rack: [135, 13, -27], eject: [180, 10, -24], magWell: [140, -76], scoped: true };
  },
};
for (const k of Object.keys(DRAW2)) DRAW[k] = DRAW2[k];
export const RIFLE_MODELS = Object.keys(DRAW);

export function buildRifle(def) {
  const m = weaponMaterials(); const K = new Kit(); const id = def.model || def.id; const R = DRAW[id](K, m);
  const gb = gripBox(R.grip.front, R.grip.back, R.gripW || 28); /* stock-wrist rifles: the hand closes round the full width of the wood */ const off = new THREE.Vector3(G1.x, G1.y - gb.c[1] * MM, G1.z - gb.c[0] * MM);
  const parts = K.build(off); const g = parts.body; const mag = parts.mag || new THREE.Group(); const bolt = parts.bolt || new THREE.Group(); g.add(mag); g.add(bolt);
  const T = (z, y, x = 0) => new THREE.Vector3(x * MM + off.x, y * MM + off.y, z * MM + off.z);
  if (R.boltY != null) { const py = R.boltY * MM + off.y; for (const c of bolt.children) c.geometry.translate(0, -py, 0); bolt.position.y = py; } // turn-bolt: rotates about the bore
  const [rz, ry, rw, rh, rd] = R.recv; const blocks = [[rz, ry, rw, rh, rd], ...(R.blocks || [])];
  const spec = { grip: gb, trigger: { z: R.trig[0], y: R.trig[1] }, guard: { z0: R.guard[0], z1: R.guard[1], yb: R.guard[3] + 3, yt: R.guard[2], w: 9 }, blocks, fore: R.fore, thumbR: null, thumbL: null };
  const hold = holdFrom(spec, off);
  if (R.gripW) { hold.thumbR = T(R.trig[0] - 34, R.trig[1] + 4, -(R.gripW / 2 + 9)); } // stock-wrist rifles: the firing thumb lies along the right side of the wrist (marksman's grip), not wrapped through the wood
  const fz = R.fore[0], fy = R.fore[1] - R.fore[3] / 2;
  g.userData = { muzzle: T(R.muzzle + 2, 0), support: T(fz, fy - 6), magWell: T(R.magWell[0], R.magWell[1]), rack: T(R.rack[0], R.rack[1], R.rack[2]), mag, slide: bolt, bolt: def.cls === 'sniper' ? bolt : undefined, eject: T(R.eject[0], R.eject[1], R.eject[2]), stockZ: 0, sight: T(R.sight[0], R.sight[1]), hold, model: id };
  g.updateMatrixWorld(true); g.userData.stockZ = new THREE.Box3().setFromObject(g).min.z;
  return g;
}
