// A real typist / operator office chair (55th request: the announcer's chair; shared with tools/people-view's seated check).
// Five-star base with twin-wheel castors, chrome gas lift in a black shroud, a mechanism plate, a contoured seat cushion with a
// waterfall front edge and a rounded rear, a back support bar and a curved, slightly reclined backrest cushion.
// The seat top is at y + SEAT_Y; the person sits facing +z (rotated by yaw). Builder `b`: MeshBuilder-like (geometry(g, m, col)).
// `cc(hex)` → vertex colour. Colours: FABRIC (navy weave), PLASTIC (black), CHROME.
import * as THREE from 'three';

export const SEAT_Y = 0.47;
const FABRIC = '#1f2a44', PLASTIC = '#1c1c1c', CHROME = '#d8d8d4';
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const UNIT = new THREE.BoxGeometry(1, 1, 1);
let CUSH = null, BACK = null, CYL = null, WHEEL = null;
// seat cushion: a rounded slab (plan: a rounded rectangle, the rear corners rounder), the front edge rolled down (waterfall)
function cushion() {
  if (CUSH) return CUSH;
  const w = 0.44, d = 0.43, r0 = 0.07, r1 = 0.12, sh = new THREE.Shape(); const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  sh.moveTo(x0 + r0, z1); sh.lineTo(x1 - r0, z1); sh.quadraticCurveTo(x1, z1, x1, z1 - r0); sh.lineTo(x1, z0 + r1); sh.quadraticCurveTo(x1, z0, x1 - r1, z0);
  sh.lineTo(x0 + r1, z0); sh.quadraticCurveTo(x0, z0, x0, z0 + r1); sh.lineTo(x0, z1 - r0); sh.quadraticCurveTo(x0, z1, x0 + r0, z1);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 3, curveSegments: 6 });
  g.rotateX(Math.PI / 2); g.translate(0, 0.058, 0); // shape xy → xz (shape +y = the front, +z); y 0 … 0.076
  // waterfall: the front 9 cm curl down; a shallow dish in the middle where you sit
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const f = Math.max(0, (z - (d / 2 - 0.09)) / 0.09);
    const dish = Math.max(0, 1 - (x / (w * 0.42)) ** 2 - ((z + 0.02) / (d * 0.45)) ** 2) * 0.012; if (y > 0.04) p.setY(i, y - 0.035 * f * f - dish); }
  g.computeVertexNormals(); return (CUSH = g);
}
// backrest: a curved cushion (the sides wrap forward round the sitter), rounded corners, lumbar swell
function backrest() {
  if (BACK) return BACK;
  const w = 0.42, h = 0.46, r = 0.08, sh = new THREE.Shape(); const x0 = -w / 2, x1 = w / 2;
  sh.moveTo(x0 + r, 0); sh.lineTo(x1 - r, 0); sh.quadraticCurveTo(x1, 0, x1, r); sh.lineTo(x1 + 0.01, h - r); sh.quadraticCurveTo(x1 + 0.01, h, x1 - r, h);
  sh.lineTo(x0 + r, h); sh.quadraticCurveTo(x0 - 0.01, h, x0 - 0.01, h - r); sh.lineTo(x0, r); sh.quadraticCurveTo(x0, 0, x0 + r, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3, curveSegments: 6 });
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const lumbar = Math.exp(-(((y - 0.14) / 0.09) ** 2)) * 0.02;
    p.setZ(i, z + 0.6 * x * x + (z > 0.03 ? lumbar : 0)); }
  g.computeVertexNormals(); return (BACK = g);
}
// the chair at (x, y = floor, z) facing +z rotated by yaw
export function officeChair(b, cc, x, y, z, yaw = 0) {
  if (!CYL) { CYL = new THREE.CylinderGeometry(1, 1, 1, 14); WHEEL = new THREE.CylinderGeometry(1, 1, 1, 12); WHEEL.rotateZ(Math.PI / 2); }
  const root = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z); const loc = new THREE.Matrix4();
  const P = (g, lx, ly, lz, rx, ry, rz, sx, sy, sz, col) => { _q.setFromEuler(_e.set(rx, ry, rz)); loc.compose(_p.set(lx, ly, lz), _q, _s.set(sx, sy, sz)); b.geometry(g, _m.multiplyMatrices(root, loc), cc(col)); };
  // five-star base: tapered arms with a polished ridge, a hub, twin-wheel castors with their swivel stems
  P(CYL, 0, 0.1, 0, 0, 0, 0, 0.055, 0.07, 0.055, PLASTIC);
  for (let k = 0; k < 5; k++) { const a = k * (Math.PI * 2 / 5) + 0.3, ca = Math.cos(a), sa = Math.sin(a);
    P(UNIT, sa * 0.16, 0.085, ca * 0.16, -0.12, a, 0, 0.045, 0.035, 0.3, PLASTIC);
    P(UNIT, sa * 0.165, 0.11, ca * 0.165, -0.12, a, 0, 0.022, 0.012, 0.26, CHROME);
    const ex = sa * 0.3, ez = ca * 0.3; P(CYL, ex, 0.06, ez, 0, 0, 0, 0.012, 0.03, 0.012, CHROME);
    for (const s2 of [-1, 1]) P(WHEEL, ex + Math.cos(a) * 0.014 * s2 + sa * 0.02, 0.025, ez - Math.sin(a) * 0.014 * s2 + ca * 0.02, 0, a, 0, 0.012, 0.025, 0.025, PLASTIC);
    P(UNIT, ex + sa * 0.02, 0.045, ez + ca * 0.02, 0, a, 0, 0.03, 0.02, 0.045, PLASTIC); }
  // gas lift: the black telescopic shroud, the chrome piston above it; the mechanism plate and the adjust lever
  P(CYL, 0, 0.21, 0, 0, 0, 0, 0.03, 0.17, 0.03, PLASTIC); P(CYL, 0, 0.33, 0, 0, 0, 0, 0.016, 0.08, 0.016, CHROME);
  P(UNIT, 0, 0.36, 0.01, 0, 0, 0, 0.2, 0.03, 0.22, PLASTIC); P(UNIT, 0.14, 0.355, 0.04, 0, 0, 0, 0.12, 0.012, 0.018, PLASTIC); P(CYL, 0.2, 0.355, 0.04, 0, 0, Math.PI / 2, 0.012, 0.03, 0.012, PLASTIC);
  // seat: shell + cushion (top at SEAT_Y)
  P(UNIT, 0, 0.388, 0.0, 0, 0, 0, 0.42, 0.02, 0.41, PLASTIC); P(cushion(), 0, SEAT_Y - 0.076, 0.0, 0, 0, 0, 1, 1, 1, FABRIC);
  // back support bar (J-bar from under the seat up behind the backrest), the backrest, its rear shell
  P(UNIT, 0, 0.37, -0.2, 0, 0, 0, 0.06, 0.02, 0.12, PLASTIC); P(UNIT, 0, 0.5, -0.265, -0.1, 0, 0, 0.06, 0.24, 0.02, PLASTIC);
  P(backrest(), 0, 0.58, -0.255, -0.12, 0, 0, 1, 1, 1, FABRIC); P(UNIT, 0, 0.8, -0.3, -0.12, 0, 0, 0.36, 0.36, 0.012, PLASTIC);
}
