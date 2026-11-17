// Original procedural weapon models (no real-world brand geometry). Every model is built around the right-hand GRIP point:
// origin = grip, +z = barrel direction, +y = up. userData exposes the hold points the IK uses (grip / support), the muzzle,
// and the moving parts used by animations (magazine, slide or bolt).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxShape } from './GripSolver.js';
import { weaponSurface } from './WeaponSurface.js';
import { sweep, latheZ, ringZ, flutedZ } from './WeaponLoft.js';
import { buildPistol } from './GunPistols.js';
import { buildRifle } from './GunRifles.js';
import { clearThumb } from './GunKit.js';

let MATS = null;
export function weaponMaterials() {
  if (MATS) return MATS;
  // every surface gets its procedural finish (WeaponSurface.js): machined / scratched metal, real wood grain under varnish, stippled polymer
  const S = (c, r, m = 0, kind = null) => weaponSurface(new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }), kind);
  const W = (c, r) => weaponSurface(new THREE.MeshPhysicalMaterial({ color: c, roughness: r, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.32 }), 'wood'); // oiled + varnished
  MATS = {
    metal: S('#2b2d31', 0.36, 0.82, 'metal'), steel: S('#6a6e75', 0.26, 0.92, 'steel'), poly: S('#1b1c1e', 0.72, 0, 'poly'), polyTan: S('#9c8763', 0.68, 0, 'poly'), polyOlive: S('#4a4d36', 0.7, 0, 'poly'),
    wood: W('#6a4123', 0.5), woodDark: W('#4a2c17', 0.55), rubber: S('#121212', 0.9, 0, 'rubber'), brass: S('#b48a3c', 0.32, 0.95, 'brass'),
    blued: S('#1c1e23', 0.38, 0.85, 'blued'), woodT56: W('#7a4a26', 0.46), woodT56d: W('#5a3419', 0.52), canvas: S('#4d4b34', 0.92),
    park: S('#3b3d39', 0.62, 0.55, 'metal'), // parkerized (manganese phosphate) steel: grey-green, matte
    oxide: S('#17181a', 0.42, 0.7, 'blued'), // black-oxide / nitride: slides, AK receivers
    coat: S('#7d6a4f', 0.58, 0.25, 'cast'), // coyote cerakote (M45A1)
    alu: S('#1e1f21', 0.4, 0.6, 'metal'), // hard-anodised aluminium (AR receivers, rails, scope rings)
    gripBlack: S('#151617', 0.7, 0, 'grip'), gripBrown: S('#4a2116', 0.5, 0, 'grip'), gripOlive: S('#3b2f1f', 0.62, 0, 'grip'), gripTan: S('#8f7b5a', 0.68, 0, 'grip'),
    polyFDE: S('#8b7a5c', 0.7, 0, 'poly'), polyGreen: S('#3c4634', 0.72, 0, 'poly'), polyOD: S('#545a3e', 0.74, 0, 'poly'), plum: S('#4d2a22', 0.6, 0, 'poly'), bakelite: S('#5a2414', 0.45, 0, 'poly'),
    woodRed: W('#6e341a', 0.42), woodBirch: W('#8a5a2e', 0.48), woodWalnut: W('#4e2e19', 0.5),
    bakeliteGrip: S('#5a2414', 0.45, 0, 'grip'), tritium: new THREE.MeshStandardMaterial({ color: '#c9ffb8', roughness: 0.3, emissive: '#7dff5a', emissiveIntensity: 0.35 }),
    slot: S('#050505', 0.85, 0.3), /* screw slots, hex sockets: the shadowed recess */
    torchLens: new THREE.MeshStandardMaterial({ color: '#fff6dc', roughness: 0.1, emissive: '#fff1c8', emissiveIntensity: 2.5 }),
    lens: new THREE.MeshStandardMaterial({ color: '#0d1a26', roughness: 0.05, metalness: 0.6, emissive: '#06121c' }),
    dot: new THREE.MeshBasicMaterial({ color: '#ff3b2f' }),
  };
  return MATS;
}

// tiny geometry helpers -----------------------------------------------------------------------------------------------
const E = new THREE.Euler(); const Q = new THREE.Quaternion(); const M = new THREE.Matrix4(); const V = new THREE.Vector3(); const ONE = new THREE.Vector3(1, 1, 1);
function place(g, x, y, z, rx = 0, ry = 0, rz = 0) { M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), ONE); g.applyMatrix4(M); return g; }
const box = (w, h, d, x, y, z, rx, ry, rz) => place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
const cylZ = (r, len, x, y, z, seg = 14, r2 = r) => place(new THREE.CylinderGeometry(r2, r, len, seg), x, y, z, Math.PI / 2, 0, 0); // axis along +z, r at -z end, r2 at +z end
const cylX = (r, len, x, y, z, seg = 10) => place(new THREE.CylinderGeometry(r, r, len, seg), x, y, z, 0, 0, Math.PI / 2);
const cylY = (r, len, x, y, z, seg = 10) => place(new THREE.CylinderGeometry(r, r, len, seg), x, y, z);
const sph = (r, x, y, z) => place(new THREE.SphereGeometry(r, 8, 6), x, y, z);
// side profile (points as [z, y]) extruded across x, centred on x = cx, with a small bevel (rounded wooden / pressed-steel edges)
function prof(pts, w, cx = 0, bev = 0.003, curve = null) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, w - 2 * bev), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -(w - 2 * bev) / 2); g.rotateY(-Math.PI / 2); g.translate(cx, 0, 0); return g; // shape x → +z, extrusion → x
}
const qcurve = (a, c, b, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; });

// small hardware: screws, bolts, pins, knurling — modelled, not painted on. s = which face (+1 left / up / front, −1 right / down / rear);
// x0 / y0 / z0 = the surface the part sits on
const SH = 0.0011; // screw-head height
function screwX(P, m, x0, s, y, z, r = 0.0026, ang = 0.7) { P.add(m.steel, cylX(r, SH, x0 + s * SH / 2, y, z, 12)); P.add(m.slot, box(0.0004, r * 1.75, r * 0.32, x0 + s * (SH + 0.0001), y, z, ang)); }
function screwY(P, m, x, y0, s, z, r = 0.0026, ang = 0.4) { P.add(m.steel, cylY(r, SH, x, y0 + s * SH / 2, z, 12)); P.add(m.slot, box(r * 1.75, 0.0004, r * 0.32, x, y0 + s * (SH + 0.0001), z, 0, ang)); }
function screwZ(P, m, x, y, z0, s, r = 0.0026, ang = 0.5) { P.add(m.steel, cylZ(r, SH, x, y, z0 + s * SH / 2, 12)); P.add(m.slot, box(r * 1.75, r * 0.32, 0.0004, x, y, z0 + s * (SH + 0.0001), 0, 0, ang)); }
function hexX(P, m, x0, s, y, z, r = 0.003) { const h = 0.0022; P.add(m.steel, cylX(r * 1.35, 0.0005, x0 + s * 0.00025, y, z, 14), place(new THREE.CylinderGeometry(r, r, h, 6), x0 + s * (0.0005 + h / 2), y, z, 0, 0, Math.PI / 2)); } // hex bolt head on its washer
function capX(P, m, x0, s, y, z, r = 0.0026) { const h = 0.0018; P.add(m.metal, cylX(r, h, x0 + s * h / 2, y, z, 14)); P.add(m.slot, cylX(r * 0.5, 0.0004, x0 + s * (h + 0.0001), y, z, 6)); } // socket-head cap screw
const pinX = (P, m, w, y, z, r = 0.0018) => P.add(m.steel, cylX(r, w + 0.0012, 0, y, z, 10)); // cross pin, flush ends on both sides
// knurled / notched ring (turret caps, castle nut): alternate rim vertices pushed out
function knurl(r, h, x, y, z, axis = 'y', seg = 28, amp = 0.08) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const px = p.getX(i), pz = p.getZ(i); if (px * px + pz * pz < 1e-12) continue; const a = Math.atan2(px, pz); const k = Math.round(((a + Math.PI) / (2 * Math.PI)) * seg) % 2 ? 1 + amp : 1; p.setX(i, px * k); p.setZ(i, pz * k); }
  g.computeVertexNormals(); return axis === 'x' ? place(g, x, y, z, 0, 0, Math.PI / 2) : axis === 'z' ? place(g, x, y, z, Math.PI / 2, 0, 0) : place(g, x, y, z);
}

class Parts { // collects geometry per material, merges into one mesh per material
  constructor() { this.by = new Map(); }
  add(mat, ...gs) { if (!this.by.has(mat)) this.by.set(mat, []); for (const g of gs) { const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); this.by.get(mat).push(n); } return this; }
  build(group) { for (const [mat, gs] of this.by) { const m = new THREE.Mesh(mergeGeometries(gs), mat); m.castShadow = true; group.add(m); } return group; }
}

// hand surfaces for the grip solver (GripSolver.js): grip box, trigger, guard + parts the fingers must not enter, forend
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function guardShapes(z, y) { // same placement as trigger(): guard bar under the trigger, front post, trigger blade
  return { shapes: [boxShape(V3(0, y - 0.012, z + 0.006), 0, [0.0025, 0.002, 0.025], 0.001), boxShape(V3(0, y, z + 0.03), 0, [0.0025, 0.013, 0.0025], 0.001)], blade: boxShape(V3(0, y - 0.002, z + 0.004), -0.25, [0.002, 0.008, 0.002], 0.001), trig: V3(0, y - 0.006, z + 0.007) };
}
function makeHold(grip, gz, gy, extra, opts = {}) {
  const gs = guardShapes(gz, gy); const shapes = [grip, ...gs.shapes, gs.blade, ...extra];
  return { grip, trig: gs.trig, trigBlade: gs.blade, shapes, thumbR: opts.thumbR || V3(grip.h[0] + 0.007, gy + 0.004, grip.c.z - 0.006) /* over the back of the grip onto its left side */, thumbL: opts.thumbL || null, fore: opts.fore || null, foreAngle: opts.foreAngle, wrap: opts.wrap };
}
const foreShape = (y, z, hx, hy, rr) => ({ c: V3(0, y, z), X: V3(1, 0, 0), Y: V3(0, 1, 0), Z: V3(0, 0, 1), h: [hx, hy, 0.09], rr: Math.min(rr, hx, hy) });

// ---------------------------------------------------------------------------------------------------------------------
function trigger(P, m, z = 0.03, y = 0.02) { // trigger + guard
  P.add(m.metal, box(0.005, 0.004, 0.05, 0, y - 0.012, z + 0.006), box(0.005, 0.026, 0.005, 0, y, z + 0.03));
  P.add(m.steel, box(0.004, 0.016, 0.004, 0, y - 0.002, z + 0.004, -0.25));
}

// ---------------------------------------------------------------------------------------------------------------------
// T-56 service rifle (police only). The Type 56 pattern is the rifle Sri Lanka Police officers are commonly seen carrying:
// a long-stroke gas rifle with wooden furniture, a curved 30-round steel magazine, the closed front-sight hood and a spike
// bayonet folded back under the barrel. Original low-poly geometry built from the general layout only (no markings, no
// maker's logos). A small torch is clamped to the left of the handguard for night searches (hidden until lit).
function t56(player = false) {
  const m = weaponMaterials(); const g = new THREE.Group(); const P = new Parts(); const bore = 0.075;
  const rx0 = -0.085, rx1 = 0.215; // receiver span (grip origin at z 0)
  // receiver: stamped body with small corner radii (stepped down round the magazine well), rounded dust cover with two
  // pressed ribs and its recoil-spring button, front trunnion / rear sight block, rivets, ejection port
  const tb = (z, top, bot, hw, n, o = {}) => ({ z, y: (top + bot) / 2, hd: (top - bot) / 2, hw, n, ...o });
  P.add(m.blued, sweep([tb(rx0, 0.075, 0.026, 0.0215, 7), tb(rx0 + 0.02, 0.075, 0.025, 0.022, 7), tb(rx0 + 0.045, 0.075, 0.006, 0.022, 7), tb(rx0 + 0.08, 0.075, 0.004, 0.022, 7), tb(rx1 - 0.01, 0.075, 0.004, 0.022, 7), tb(rx1, 0.075, 0.006, 0.0215, 7)], { vertical: true, seg: 28, sub: 3 }));
  P.add(m.metal, sweep([tb(rx0 + 0.003, 0.0905, 0.06, 0.0205, 2.2), tb(rx0 + 0.02, 0.0955, 0.054, 0.0222, 2.2), tb(rx1 - 0.03, 0.0955, 0.054, 0.0222, 2.2), tb(rx1 - 0.012, 0.0955, 0.054, 0.0222, 2.2)], { vertical: true, seg: 32 }));
  for (const z of [rx0 + 0.07, rx0 + 0.16]) P.add(m.metal, sweep([tb(z - 0.005, 0.0961, 0.06, 0.0228, 2.2), tb(z + 0.005, 0.0961, 0.06, 0.0228, 2.2)], { vertical: true, seg: 32, sub: 1 }));
  P.add(m.steel, latheZ([[rx0 - 0.006, 0.00001], [rx0 - 0.006, 0.0042], [rx0 - 0.004, 0.0052], [rx0 + 0.006, 0.0052]], 0.083, 0, 16));
  P.add(m.steel, ...[-0.06, -0.03, 0.15, 0.18].map((z) => cylX(0.0032, 0.047, 0, 0.033, z, 8))); P.add(m.slot, box(0.002, 0.016, 0.06, -0.0214, 0.064, 0.085));
  P.add(m.blued, sweep([{ z: rx1 - 0.014, y: 0.088, hd: 0.016, hw: 0.017, n: 3.5 }, { z: rx1, y: 0.088, hd: 0.016, hw: 0.017, n: 3.5 }, { z: rx1 + 0.03, y: 0.087, hd: 0.0145, hw: 0.016, n: 3.5 }, { z: rx1 + 0.04, y: 0.085, hd: 0.012, hw: 0.014, n: 3.5 }], { vertical: true }));
  // rear sight leaf + notch block (sight point sits on its top edge)
  P.add(m.metal, box(0.024, 0.006, 0.07, 0, 0.106, rx1 + 0.008, -0.04), box(0.026, 0.012, 0.01, 0, 0.112, rx1 - 0.02));
  // selector lever (large, right side = -x) and the bolt-hold notch
  P.add(m.steel, box(0.003, 0.014, 0.12, -0.0235, 0.074, 0.06, 0.06), box(0.004, 0.02, 0.012, -0.0237, 0.064, 0.0));
  // lower handguard: palm swell, narrower top edge, a finger groove along each side; round upper handguard on the gas tube;
  // steel retainer bands that follow the wood
  const hg = (z, y, hd, hw, pinch = 0) => ({ z, y, hd, hw, n: 3, topK: 0.9, pinch, pinchY: -0.12 });
  P.add(m.woodT56, sweep([hg(rx1 + 0.004, 0.057, 0.022, 0.0235), hg(rx1 + 0.025, 0.0545, 0.0265, 0.026), hg(rx1 + 0.08, 0.053, 0.027, 0.0265, 0.09), hg(rx1 + 0.19, 0.0545, 0.0255, 0.026, 0.09), hg(rx1 + 0.24, 0.058, 0.021, 0.0245), hg(rx1 + 0.256, 0.06, 0.019, 0.023)], { vertical: true, seg: 32 }));
  P.add(m.woodT56, sweep([{ z: rx1 + 0.06, y: 0.106, hd: 0.011, hw: 0.014, n: 2.4 }, { z: rx1 + 0.076, y: 0.108, hd: 0.0132, hw: 0.0165, n: 2.4 }, { z: rx1 + 0.2, y: 0.108, hd: 0.0132, hw: 0.0165, n: 2.4 }, { z: rx1 + 0.22, y: 0.1065, hd: 0.0115, hw: 0.0148, n: 2.4 }], { vertical: true }));
  P.add(m.steel, sweep([{ z: rx1 + 0.253, y: 0.058, hd: 0.0222, hw: 0.0256, n: 3.4 }, { z: rx1 + 0.266, y: 0.058, hd: 0.0222, hw: 0.0256, n: 3.4 }], { vertical: true, sub: 1, seg: 32 }), sweep([{ z: rx1 + 0.219, y: 0.1065, hd: 0.0136, hw: 0.0172, n: 2.6 }, { z: rx1 + 0.229, y: 0.1065, hd: 0.0136, hw: 0.0172, n: 2.6 }], { vertical: true, sub: 1 }));
  // gas tube, gas block with the slanted front face and front sling loop, stepped barrel with the threaded muzzle nut and
  // an open bore, front sight base, open-topped hood + post
  P.add(m.blued, latheZ([[rx1 + 0.218, 0.0108], [rx1 + 0.29, 0.0108]], 0.104, 0, 18));
  P.add(m.blued, sweep([{ z: rx1 + 0.282, y: 0.091, hd: 0.027, hw: 0.0145, n: 3.5 }, { z: rx1 + 0.3, y: 0.09, hd: 0.026, hw: 0.0145, n: 3.5 }, { z: rx1 + 0.318, y: 0.082, hd: 0.018, hw: 0.013, n: 3.5 }], { vertical: true }));
  P.add(m.steel, place(new THREE.TorusGeometry(0.0062, 0.0016, 6, 14), 0, 0.0565, rx1 + 0.3, 0, Math.PI / 2, 0));
  P.add(m.metal, latheZ([[rx1 - 0.002, 0.0125], [rx1 + 0.03, 0.0125], [rx1 + 0.036, 0.0104], [rx1 + 0.2, 0.0099], [rx1 + 0.418, 0.0095], [rx1 + 0.4185, 0.0121], [rx1 + 0.439, 0.0121], [rx1 + 0.442, 0.0103], [rx1 + 0.442, 0.0045], [rx1 + 0.41, 0.0045], [rx1 + 0.41, 0.00001]], bore, 0, 22));
  for (let i = 0; i < 6; i++) P.add(m.metal, ringZ(0.0121, 0.0006, rx1 + 0.4215 + i * 0.0028, bore, 0, Math.PI * 2, 0, 22)); // muzzle-nut threads
  P.add(m.blued, sweep([{ z: rx1 + 0.386, y: 0.091, hd: 0.029, hw: 0.0135, n: 3.5 }, { z: rx1 + 0.416, y: 0.091, hd: 0.029, hw: 0.0135, n: 3.5 }], { vertical: true, sub: 1 }));
  { const gap = 0.9, hood = new THREE.LatheGeometry([[0.0108, 0.39], [0.0134, 0.39], [0.0134, 0.411], [0.0108, 0.411], [0.0108, 0.39]].map(([r, z]) => new THREE.Vector2(r, rx1 + z)), 22, Math.PI + gap / 2, Math.PI * 2 - gap); hood.rotateX(Math.PI / 2); hood.translate(0, 0.1215, 0); P.add(m.blued, hood); }
  P.add(m.steel, box(0.003, 0.022, 0.004, 0, 0.114, rx1 + 0.4));
  // spike bayonet folded back under the barrel: hinge block at the front sight base, turned spike tapering to a point
  P.add(m.steel, sweep([{ z: rx1 + 0.392, y: 0.055, hd: 0.009, hw: 0.0095, n: 3 }, { z: rx1 + 0.418, y: 0.055, hd: 0.009, hw: 0.0095, n: 3 }], { vertical: true, sub: 1 }), latheZ([[rx1 + 0.165, 0.00001], [rx1 + 0.172, 0.0019], [rx1 + 0.3, 0.0046], [rx1 + 0.39, 0.0066], [rx1 + 0.393, 0.00001]], 0.052, 0, 12), box(0.012, 0.01, 0.01, 0, 0.052, rx1 + 0.17));
  // pistol grip swept along its rake with a palm swell, trigger + guard, magazine release paddle
  P.add(m.woodT56d, sweep([{ z: -0.002, y: 0.032, hd: 0.021, hw: 0.0125, n: 2.6 }, { z: -0.012, y: 0.0, hd: 0.019, hw: 0.0135, n: 2.6 }, { z: -0.022, y: -0.035, hd: 0.0205, hw: 0.0145, n: 2.6 }, { z: -0.03, y: -0.065, hd: 0.021, hw: 0.0145, n: 2.6 }, { z: -0.0325, y: -0.077, hd: 0.0195, hw: 0.0135, n: 2.6 }], { seg: 28 }));
  trigger(P, m, 0.022, 0.016); P.add(m.steel, box(0.014, 0.006, 0.014, 0, 0.0, 0.066));
  // fixed wooden stock with drop: narrow wrist swelling to the butt, comb narrower than the belly, steel buttplate that
  // follows the butt outline, rear sling loop
  const lin = (pts, d) => { for (let i = 1; i < pts.length; i++) if (d <= pts[i][0] || i === pts.length - 1) { const [a, ya] = pts[i - 1], [b, yb] = pts[i]; return ya + (yb - ya) * Math.min(1, Math.max(0, (d - a) / (b - a))); } return 0; };
  const top = [[-0.004, 0.074], [0.11, 0.058], [0.28, 0.046]], bot = [[-0.004, 0.026], [0.1, 0.012], [0.2, -0.052], [0.28, -0.074]];
  const st = (d, hw, n = 2.7) => tb(rx0 - d, lin(top, d), lin(bot, d), hw, n, { topK: 0.84 });
  P.add(m.woodT56, sweep([st(-0.004, 0.0172), st(0.03, 0.0165), st(0.07, 0.0163), st(0.11, 0.0172), st(0.15, 0.0184), st(0.19, 0.0193), st(0.23, 0.0197), st(0.262, 0.0198), st(0.276, 0.0196)], { vertical: true, seg: 32 }));
  P.add(m.steel, sweep([st(0.276, 0.0201, 2.9), st(0.284, 0.0201, 2.9)], { vertical: true, sub: 1, seg: 32 }), place(new THREE.TorusGeometry(0.0062, 0.0016, 6, 14), 0, lin(bot, 0.2) - 0.006, rx0 - 0.2, 0, Math.PI / 2, 0));
  // hardware: trigger / hammer pins, front-trunnion rivets, buttplate + tang + grip screws, handguard retainer lever, gas-tube lock lever
  pinX(P, m, 0.044, 0.03, 0.03); pinX(P, m, 0.044, 0.035, 0.005); P.add(m.steel, ...[0.035, 0.048, 0.061].map((y) => cylX(0.003, 0.047, 0, y, 0.2, 8)));
  screwZ(P, m, 0, 0.027, rx0 - 0.284, -1); screwZ(P, m, 0, -0.053, rx0 - 0.284, -1, 0.0026, 1.3); screwY(P, m, 0, lin(top, 0.014) - 0.0004, 1, rx0 - 0.014, 0.0024); screwY(P, m, 0, -0.0772, -1, -0.0325, 0.0024, 1.1);
  P.add(m.steel, box(0.002, 0.008, 0.02, -0.0266, 0.058, rx1 + 0.262), cylX(0.0022, 0.001, -0.026, 0.053, rx1 + 0.258, 10), box(0.002, 0.012, 0.008, -0.0175, 0.1, rx1 + 0.03, 0.4));
  // canvas sling hanging slack between the swivels (catenary of short straps)
  if (!player) { const a = new THREE.Vector3(0, 0.045, rx1 + 0.3), b = new THREE.Vector3(0, -0.045, rx0 - 0.2); const N = 9; let prev = a.clone();
    for (let i = 1; i <= N; i++) { const k = i / N; const p = a.clone().lerp(b, k); p.y -= Math.sin(k * Math.PI) * 0.07; p.x = 0.024; const mid = prev.clone().add(p).multiplyScalar(0.5); const len = prev.distanceTo(p); const ang = Math.atan2(p.y - prev.y, p.z - prev.z);
      P.add(m.canvas, box(0.004, 0.022, len + 0.004, mid.x, mid.y, mid.z, -ang)); prev = p; } }
  P.build(g);
  // curved 30-round steel magazine (three segments with ribs) — drops out on reload
  const mag = new THREE.Group(); const Mg = new Parts(); const mz = 0.098;
  { const front = qcurve([0.132, 0.028], [0.136, -0.075], [0.212, -0.168]), rear = qcurve([0.068, 0.028], [0.074, -0.068], [0.148, -0.18]);
    // swept down the curve: the section runs front-to-back across the curve (perpendicular to it), rounded-box corners
    const ctr = (t) => { const k = Math.min(7.999, Math.max(0, t)), i = Math.floor(k), u = k - i; const L = (a, b) => a + (b - a) * u;
      const f = [L(front[i][0], front[i + 1][0]), L(front[i][1], front[i + 1][1])], r = [L(rear[i][0], rear[i + 1][0]), L(rear[i][1], rear[i + 1][1])];
      return { z: (f[0] + r[0]) / 2, y: (f[1] + r[1]) / 2, hd: Math.hypot(f[0] - r[0], f[1] - r[1]) / 2 * 0.97 }; };
    Mg.add(m.blued, sweep([0, 1, 2, 3, 4, 5, 6, 7, 7.75].map((t) => ({ ...ctr(t), hw: 0.0135, n: 5 })), { seg: 28 }));
    const band = (t, w, k) => sweep([t - w, t, t + w].map((u) => { const c = ctr(u); return { ...c, hd: c.hd * k, hw: 0.0135 * k + 0.0009, n: 5 }; }), { seg: 28, sub: 2 });
    Mg.add(m.metal, band(3, 0.18, 1.02), band(6, 0.18, 1.02), sweep([7.4, 7.6, 7.78].map((t) => { const c = ctr(t); return { ...c, hd: c.hd * 1.06 + 0.001, hw: 0.0158, n: 4 }; }), { seg: 28, sub: 2 })); } // ribs + floorplate
  Mg.build(mag); g.add(mag);
  // bolt carrier + charging handle (right side): racks on reload
  const bolt = new THREE.Group(); const B = new Parts(); B.add(m.steel, box(0.01, 0.012, 0.03, -0.028, 0.072, 0.15), sph(0.0085, -0.04, 0.072, 0.162)); B.build(bolt); g.add(bolt);
  // clamp-on torch, left of the handguard (lit at night by Firefight)
  const torch = new THREE.Group(); const Tp = new Parts(); Tp.add(m.poly, cylZ(0.0115, 0.11, 0.041, 0.05, rx1 + 0.17, 12), cylZ(0.0115, 0.022, 0.041, 0.05, rx1 + 0.235, 12, 0.0155), box(0.014, 0.022, 0.03, 0.031, 0.05, rx1 + 0.17));
  Tp.build(torch); const lens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 14), m.torchLens); lens.position.set(0.041, 0.05, rx1 + 0.2465); torch.add(lens); torch.visible = false; g.add(torch);
  g.userData = { muzzle: new THREE.Vector3(0, bore, rx1 + 0.442), support: new THREE.Vector3(0, 0.03, rx1 + 0.13), magWell: new THREE.Vector3(0, -0.03, mz), rack: new THREE.Vector3(-0.04, 0.072, 0.162), mag, slide: bolt, eject: new THREE.Vector3(-0.026, 0.084, 0.09), stockZ: rx0 - 0.288, sight: new THREE.Vector3(0, 0.118, rx1 - 0.02), torch, torchLens: lens, torchPos: new THREE.Vector3(0.041, 0.05, rx1 + 0.25), sling: true };
  g.updateMatrixWorld(true); g.userData.buttZ = new THREE.Box3().setFromObject(g).min.z;
  return g;
}
export function buildT56() { const g = t56(); g.name = 'weapon-t56'; return g; }
// the player's Type 56 (gun-shop rifle): the same rifle without the police torch and sling, with hand surfaces for the grip solver
function t56Player() { const g = t56(true); const ud = g.userData; if (ud.torch) { g.remove(ud.torch); ud.torch = null; ud.torchLens = null; } ud.sling = false;
  const rx0 = -0.085, rx1 = 0.21; ud.hold = makeHold(boxShape(V3(0, -0.022, -0.017), 0.27, [0.0138, 0.054, 0.0205], 0.007), 0.022, 0.016,
    [boxShape(V3(0, 0.041, (rx0 + rx1) / 2), 0, [0.0225, 0.035, (rx1 - rx0) / 2], 0.003), boxShape(V3(0, -0.05, 0.13), 0.5, [0.0135, 0.06, 0.03], 0.003)], { fore: foreShape(0.056, rx1 + 0.13, 0.024, 0.026, 0.012) });
  ud.support = new THREE.Vector3(0, 0.03, rx1 + 0.13); ud.model = 'type56'; return g; }

export function buildWeaponModel(def) {
  const g = def.cls === 'pistol' ? buildPistol(def) : (def.model || def.id) === 'type56' ? t56Player() : buildRifle(def); g.name = 'weapon-' + def.id;
  const h = g.userData.hold; const mag = g.userData.mag; if (h) { clearThumb(g, h.thumbR, 0.0085, (o) => mag && o.parent === mag); if (h.thumbL) clearThumb(g, h.thumbL, 0.0085, (o) => mag && o.parent === mag); }
  return g;
}
