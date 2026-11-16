// Colombo Fort Clock Tower — the old Colombo lighthouse (1857, Emily Elizabeth Ward's design; light retired 1952) at the
// corner of Chatham Street and Janadhipathi Mawatha. 52nd request: "more detailed, hyper-detailed down to every small thing,
// make the clock work, greenery around it". Built from the reference photos (dev/ref/p52/):
//   • granite plinth and a red-brick ground stage with cream pilasters, a real round-arched recess on every face (brick and
//     stone voussoirs, keystone, impost band, panelled timber door at the back), moulded cornice stepping in to the shaft;
//   • a 4.3 m square shaft in cream render with alternating long/short red-brick quoins on all four corners, paired
//     round-arched windows on two levels (real recesses: jambs, soffits, sills, glazing bars, a stone colonnette between
//     the lights, brick hood rings), a 1.83 m clock on each face, and a triple arched window under the crown;
//   • the crown: red frieze with cream dentils, a corbel table of modillion brackets under the projecting cornice, the
//     balustraded gallery (turned balusters, corner piers with ball finials), the cylindrical lantern with its diamond-lattice
//     glazing, the old lens pedestal inside, the gilded ribbed dome, finial and weather vane;
//   • the clock WORKS: hour and minute hands on all four dials follow the game clock (Atmosphere.hour); the opal dials glow
//     at night as they have since 1913. Hands are one InstancedMesh (8 instances), dials one mesh: two draw calls.
//   • a small garden on the open corner plot beside it: lawn with a stone kerb, clipped hedges, flowering shrubs, a paved
//     apron with cast-iron bollards; its trees and garden plants are planted by Greenery (king coconuts, flamboyant, …).
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { hedgeBox, bushBall } from './HedgeBush.js';

export const CLOCK_TOWER = { x: -385, z: -915, garden: [-380.5, -362, -936, -910.6] };
const CREAM = '#efe4c8', CREAM2 = '#e6d8b8', BRICK = '#97452c', BRICK2 = '#a3502f', STONE = '#d9ccb0', GRANITE = '#b9b2a6', DARK = '#1b1d1b', GOLD = '#c9a34c';

function dialTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const cx = S / 2, cy = S / 2;
  const grd = g.createRadialGradient(cx, cy, 10, cx, cy, S / 2); grd.addColorStop(0, '#fbfaf4'); grd.addColorStop(0.85, '#f1eee2'); grd.addColorStop(1, '#d9d4c2'); // opal glass, a little yellowed at the rim
  g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, S / 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#141414'; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, S / 2 - 9, 0, Math.PI * 2); g.stroke(); // bezel shadow line
  g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, S / 2 - 30, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(cx, cy, S / 2 - 52, 0, Math.PI * 2); g.stroke(); // chapter ring (minute track)
  for (let k = 0; k < 60; k++) { const a = k / 60 * Math.PI * 2; const r0 = S / 2 - 52, r1 = S / 2 - 30; g.lineWidth = k % 5 ? 2.5 : 7; g.beginPath(); g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0); g.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1); g.stroke(); }
  const R = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']; g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const r = S / 2 - 92; g.save(); g.translate(cx + Math.sin(a) * r, cy - Math.cos(a) * r); g.rotate(a); g.font = `700 ${R[k].length > 3 ? 44 : 52}px "Cormorant Garamond", Georgia, serif`; g.fillText(R[k], 0, 2); g.restore(); }
  g.strokeStyle = 'rgba(60,50,30,0.18)'; g.lineWidth = 1; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(cx, cy, 40 + k * 22, 0, Math.PI * 2); g.stroke(); } // faint glazing joints
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function handGeometry() { // spade (Breguet-ish) hand pointing +y from the arbor, a short counterpoise tail; thin extrusion
  const s = new THREE.Shape(); s.moveTo(-0.035, -0.2); s.lineTo(0.035, -0.2); s.lineTo(0.022, 0.0); s.lineTo(0.028, 0.6); s.quadraticCurveTo(0.11, 0.72, 0.0, 1.0); s.quadraticCurveTo(-0.11, 0.72, -0.028, 0.6); s.lineTo(-0.022, 0.0); s.closePath();
  const h = new THREE.Path(); h.absarc(0, 0.74, 0.03, 0, Math.PI * 2, true); s.holes.push(h); // the pierced spade
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: false, curveSegments: 6 }); return g;
}

export function buildClockTower({ mb, coll, group, label, C, LAND_Y }) {
  const T = CLOCK_TOWER, X = T.x, Z = T.z, y0 = LAND_Y; const conc = mb.get('kerb') /* clean limewashed render: the weathered 'concrete' (rising damp, grime) made the well-kept tower look grey and dirty */, paint = mb.get('paint'), metal = mb.get('metal'), glass = mb.get('glass'), ds = mb.get('paintDS'), walk = mb.get('walkGrey'), lawn = mb.get('lawn');
  // ---- face frames: k = 0..3, outward normal n, right (as seen from outside) r; P(u, y, d) on the face plane at half-width hw
  const F = [0, 1, 2, 3].map((k) => { const a = k * Math.PI / 2, nx = Math.sin(a), nz = Math.cos(a); return { a, nx, nz, rx: nz, rz: -nx }; });
  const P = (f, hw, u, y, d = 0) => [X + f.rx * u + f.nx * (hw + d), y0 + y, Z + f.rz * u + f.nz * (hw + d)];
  const uvs = 3; const UV = (u0, y0_, u1, y1, k = 0) => [(u0 + k * 7) / uvs, y0_ / uvs, (u1 + k * 7) / uvs, y1 / uvs];
  const rect = (B, f, hw, u0, u1, ya, yb, d, col, k) => { if (u1 - u0 < 1e-4 || yb - ya < 1e-4) return; B.quad(P(f, hw, u0, ya, d), P(f, hw, u1, ya, d), P(f, hw, u1, yb, d), P(f, hw, u0, yb, d), UV(u0, ya, u1, yb, k), C(col)); };
  const fbox = (B, f, hw, u, y, d, sx, sy, sz, col, o = {}) => { const p = P(f, hw, u, y, d); B.box(p[0], p[1], p[2], sx, sy, sz, { col: C(col), rotY: f.a, uvScale: 2, bottom: true, ...o }); };
  const ARC = 10; const arcPts = (uc, spring, R) => { const out = []; for (let i = 0; i <= ARC; i++) { const th = Math.PI - (i / ARC) * Math.PI; out.push([uc + Math.cos(th) * R, spring + Math.sin(th) * R]); } return out; };
  // an arched recess cut into a face band: jambs, soffit (intrados), sill, back panel; the wall round it is built by wallBand
  const recess = (f, hw, o, k) => { const R = (o.u1 - o.u0) / 2, uc = (o.u0 + o.u1) / 2, A = arcPts(uc, o.spring, R), dep = o.depth, B = o.mat || conc;
    B.quad(P(f, hw, o.u0, o.sill, 0), P(f, hw, o.u0, o.sill, -dep), P(f, hw, o.u0, o.spring, -dep), P(f, hw, o.u0, o.spring, 0), [0, 0, 0.3, 1], C(o.reveal)); // left jamb (faces +r)
    B.quad(P(f, hw, o.u1, o.sill, -dep), P(f, hw, o.u1, o.sill, 0), P(f, hw, o.u1, o.spring, 0), P(f, hw, o.u1, o.spring, -dep), [0, 0, 0.3, 1], C(o.reveal)); // right jamb (faces −r)
    for (let i = 0; i < ARC; i++) { const a = A[i], b = A[i + 1]; B.quad(P(f, hw, a[0], a[1], -dep), P(f, hw, b[0], b[1], -dep), P(f, hw, b[0], b[1], 0), P(f, hw, a[0], a[1], 0), [0, 0, 0.3, 0.3], C(o.reveal)); } // soffit
    if (o.sill > 0.01) { const sb = o.sillMat || conc; sb.quad(P(f, hw, o.u0, o.sill, 0), P(f, hw, o.u1, o.sill, 0), P(f, hw, o.u1, o.sill, -dep), P(f, hw, o.u0, o.sill, -dep), [0, 0, 1, 0.2], C(o.sillCol || STONE)); }
    const bp = o.back || paint; const bc = C(o.backCol || DARK); // back panel: rectangle + arch fan
    bp.quad(P(f, hw, o.u0, o.sill, -dep), P(f, hw, o.u1, o.sill, -dep), P(f, hw, o.u1, o.spring, -dep), P(f, hw, o.u0, o.spring, -dep), [0, 0, 1, 1], bc);
    const cpt = P(f, hw, uc, o.spring, -dep); for (let i = 0; i < ARC; i++) { const a = A[i], b = A[i + 1]; bp.quad(cpt, P(f, hw, b[0], b[1], -dep), P(f, hw, a[0], a[1], -dep), P(f, hw, a[0], a[1], -dep), [0, 0, 1, 1], bc); }
    if (o.bars) { const d = -dep + 0.012; // glazing bars + horizontal transoms (dark green painted iron)
      fbox(metal, f, hw, uc, (o.sill + o.spring + R) / 2, d, 0.03, o.spring + R - o.sill - 0.04, 0.02, '#26332b');
      for (let y = o.sill + 0.38; y < o.spring + R * 0.6; y += 0.38) { const half = y > o.spring ? Math.sqrt(Math.max(0, R * R - (y - o.spring) ** 2)) : R; fbox(metal, f, hw, uc, y, d, half * 2 - 0.02, 0.025, 0.02, '#26332b'); } }
    if (o.ring) { const w = o.ring, dd = 0.035; for (let i = 0; i < ARC; i++) { const th0 = Math.PI - (i / ARC) * Math.PI, th1 = Math.PI - ((i + 1) / ARC) * Math.PI; // voussoir hood ring, alternating brick / stone
        const I0 = [uc + Math.cos(th0) * R, o.spring + Math.sin(th0) * R], I1 = [uc + Math.cos(th1) * R, o.spring + Math.sin(th1) * R], O0 = [uc + Math.cos(th0) * (R + w), o.spring + Math.sin(th0) * (R + w)], O1 = [uc + Math.cos(th1) * (R + w), o.spring + Math.sin(th1) * (R + w)];
        const col = C(i === ARC / 2 - 1 || i === ARC / 2 ? (o.key || STONE) : i % 2 ? o.ringA || BRICK : o.ringB || BRICK2); const B2 = conc;
        B2.quad(P(f, hw, I0[0], I0[1], dd), P(f, hw, I1[0], I1[1], dd), P(f, hw, O1[0], O1[1], dd), P(f, hw, O0[0], O0[1], dd), [0, 0, 0.3, 0.3], col);
        B2.quad(P(f, hw, O0[0], O0[1], dd), P(f, hw, O1[0], O1[1], dd), P(f, hw, O1[0], O1[1], 0), P(f, hw, O0[0], O0[1], 0), [0, 0, 0.3, 0.05], col);
        B2.quad(P(f, hw, I1[0], I1[1], dd), P(f, hw, I0[0], I0[1], dd), P(f, hw, I0[0], I0[1], 0), P(f, hw, I1[0], I1[1], 0), [0, 0, 0.3, 0.05], col); }
      for (const s of [o.u0 - w, o.u1]) { fbox(conc, f, hw, s + w / 2, o.spring - 0.06, dd / 2 + 0.005, w + 0.04, 0.12, dd + 0.01, STONE); } } }; // impost blocks at the springing
  // a horizontal band [ya, yb] of a face with arched openings (each opening: sill ≥ ya, spring + R ≤ yb); the wall is the
  // piers between openings, the panel under each sill and the spandrel strips over each arch — so the recesses are real holes
  const wallBand = (f, hw, ya, yb, ops, col, k) => { const s = [...ops].sort((p, q) => p.u0 - q.u0); let u = -hw;
    for (const o of s) { rect(conc, f, hw, u, o.u0, ya, yb, 0, col, k); rect(conc, f, hw, o.u0, o.u1, ya, o.sill, 0, col, k);
      const R = (o.u1 - o.u0) / 2, A = arcPts((o.u0 + o.u1) / 2, o.spring, R); rect(conc, f, hw, o.u0, o.u1, o.spring + R, yb, 0, col, k);
      for (let i = 0; i < ARC; i++) { const a = A[i], b = A[i + 1], top = o.spring + R; conc.quad(P(f, hw, a[0], a[1], 0), P(f, hw, b[0], b[1], 0), P(f, hw, b[0], top, 0), P(f, hw, a[0], top, 0), UV(a[0], a[1], b[0], top, k), C(col)); }
      recess(f, hw, o, k); u = o.u1; }
    rect(conc, f, hw, u, hw, ya, yb, 0, col, k); };

  // ================================================================ plinth + ground stage (0 – 5.6 m)
  const HB = 2.75; // ground stage half-width
  conc.box(X, y0 + 0.2, Z, 6.3, 0.4, 6.3, { col: C(GRANITE), uvScale: 2 }); conc.box(X, y0 + 0.47, Z, 6.0, 0.14, 6.0, { col: C('#c7c0b3'), uvScale: 2 }); // granite plinth + chamfer course
  for (const f of F) {
    // the arch: 2.2 m wide, springing at 3.25 m; red brick stage, cream pilasters at the corners, stone impost band
    const op = { u0: -1.1, u1: 1.1, sill: 0.54, spring: 3.25, depth: 0.62, reveal: '#8a3f29', back: paint, backCol: '#3a2618', ring: 0.34, ringA: BRICK, ringB: STONE, key: STONE, sillMat: walk, sillCol: '#ffffff' };
    wallBand(f, HB, 0.54, 5.0, [op], BRICK, f.a);
    rect(conc, f, HB, -HB, HB, 5.0, 5.6, 0, BRICK2, f.a);
    // recess floor (stone) and the panelled timber door at its back, with iron studs and ring handles
    for (const s of [-1, 1]) { fbox(paint, f, HB, s * 0.52, 1.75, -0.6, 0.94, 2.3, 0.04, '#4b3020'); for (const py of [0.95, 2.05]) fbox(paint, f, HB, s * 0.52, py, -0.575, 0.7, 0.8, 0.02, '#563823'); fbox(metal, f, HB, s * 0.12, 1.55, -0.56, 0.05, 0.05, 0.05, '#2a2a28'); }
    fbox(paint, f, HB, 0, 3.6, -0.6, 2.1, 0.7, 0.03, '#2d2017'); // fanlight panel over the doors (dark, grille below)
    for (let i = -4; i <= 4; i++) fbox(metal, f, HB, i * 0.22, 3.62, -0.58, 0.025, 0.66, 0.02, '#202522');
    // cream rusticated pilasters on both corners of the face, cap + base mouldings
    for (const s of [-1, 1]) { const u = s * (HB - 0.29); fbox(conc, f, HB, u, 2.8, 0.04, 0.74, 4.5, 0.08, CREAM);
      for (let y = 0.95; y < 5.0; y += 0.55) fbox(conc, f, HB, u, y, 0.085, 0.66, 0.035, 0.012, '#cdbf9f'); // rustication joints
      fbox(conc, f, HB, u, 0.62, 0.07, 0.74, 0.16, 0.14, STONE); fbox(conc, f, HB, u, 5.02, 0.08, 0.76, 0.16, 0.16, STONE); }
    for (const s of [-1, 1]) fbox(conc, f, HB, s * 1.72, 3.25, 0.03, 0.58, 0.12, 0.06, STONE); // impost band (between the arch ring and the pilasters)
    // cornice over the ground stage: three steps in, then the shaft
    fbox(conc, f, HB, 0, 5.32, 0.09, 2 * HB + 0.18, 0.2, 0.18, STONE); fbox(conc, f, HB, 0, 5.5, 0.03, 2 * HB + 0.06, 0.16, 0.06, CREAM2);
    for (let u = -HB + 0.18; u <= HB - 0.17; u += 0.3) fbox(conc, f, HB, u, 5.2, 0.12, 0.11, 0.08, 0.06, CREAM2); // dentils
  }
  conc.box(X, y0 + 5.75, Z, 5.1, 0.3, 5.1, { col: C(CREAM2), uvScale: 2 }); // set-back course to the shaft
  // plaque on the plinth (cast bronze)
  label([{ text: 'OLD COLOMBO LIGHTHOUSE', font: '700 64px "Cormorant Garamond", Georgia, serif', color: '#e9d9a6' }, { text: 'CLOCK TOWER  ·  1857', font: '700 56px "Cormorant Garamond", Georgia, serif', color: '#e9d9a6' }], X + 1.62, y0 + 1.25, Z + HB + 0.02, 0.9, 0.36, 0, { w: 1024, h: 410, bg: '#4a3b22', border: '#b89a5a', glow: false });

  // ================================================================ the shaft (5.9 – 23.6 m)
  const HS = 2.15; const SH0 = 5.9, SH1 = 23.6;
  const pair = (sill, spring, w = 0.6, gap = 0.3) => [{ u0: -gap / 2 - w, u1: -gap / 2, sill, spring, depth: 0.3, reveal: '#d8caa8', bars: true, ring: 0.13 }, { u0: gap / 2, u1: gap / 2 + w, sill, spring, depth: 0.3, reveal: '#d8caa8', bars: true, ring: 0.13 }];
  const W1 = pair(9.4, 11.25), W2 = pair(14.3, 16.15); const TRI = [-1, 0, 1].map((k) => ({ u0: k * 0.68 - 0.27, u1: k * 0.68 + 0.27, sill: 21.0, spring: 22.25, depth: 0.3, reveal: '#d8caa8', bars: true, ring: 0.13 }));
  const CY = 19.15, CR = 0.915; // clock centre / dial radius (6 ft dial)
  for (const f of F) { const k = f.a;
    rect(conc, f, HS, -HS, HS, SH0, 9.4 - 0.001, 0, CREAM, k); wallBand(f, HS, 9.4, 11.25 + 0.3 + 0.2, W1, CREAM, k); rect(conc, f, HS, -HS, HS, 11.75, 14.3, 0, CREAM, k);
    wallBand(f, HS, 14.3, 16.65, W2, CREAM, k); rect(conc, f, HS, -HS, HS, 16.65, 21.0, 0, CREAM, k); wallBand(f, HS, 21.0, 22.6, TRI, CREAM, k); rect(conc, f, HS, -HS, HS, 22.6, SH1, 0, CREAM, k);
    // stone sills (projecting, with drip) under each window group, and the slim colonnettes between the paired lights
    for (const [ws, sy] of [[W1, 9.4], [W2, 14.3], [TRI, 21.0]]) { const u0 = ws[0].u0 - 0.12, u1 = ws[ws.length - 1].u1 + 0.12; fbox(conc, f, HS, (u0 + u1) / 2, sy - 0.05, 0.07, u1 - u0, 0.1, 0.14, STONE); fbox(conc, f, HS, (u0 + u1) / 2, sy - 0.14, 0.035, u1 - u0 - 0.1, 0.08, 0.07, '#d1c4a6');
      for (let i = 0; i < ws.length - 1; i++) { const u = (ws[i].u1 + ws[i + 1].u0) / 2, p = P(f, HS, u, sy, 0.0); const h = ws[i].spring - sy; conc.cylinder(p[0], p[1], p[2], 0.07, 0.065, h, 10, { col: C(STONE) }); const q = P(f, HS, u, sy + h, 0.0); conc.box(q[0], q[1] + 0.05, q[2], 0.2, 0.1, 0.2, { col: C(STONE), rotY: f.a }); conc.box(q[0], p[1] + 0.04, q[2], 0.17, 0.08, 0.17, { col: C(STONE), rotY: f.a }); } }
    // thin string courses (cream, slightly proud) dividing the stages
    for (const sy of [8.2, 13.1, 17.6, 20.6]) fbox(conc, f, HS, 0, sy, 0.03, 2 * HS - 0.02, 0.12, 0.06, CREAM2);
    // the clock: moulded round surround (stone torus + brick ring), dial set in a dark bronze bezel, central boss
    { const ringN = 32, rr = [CR + 0.03, CR + 0.14, CR + 0.24]; for (let i = 0; i < ringN; i++) { const a0 = i / ringN * Math.PI * 2, a1 = (i + 1) / ringN * Math.PI * 2;
        const q = (r, a, d) => P(f, HS, Math.cos(a) * r, CY + Math.sin(a) * r, d);
        metal.quad(q(rr[0], a0, 0.07), q(rr[0], a1, 0.07), q(CR - 0.01, a1, 0.07), q(CR - 0.01, a0, 0.07), [0, 0, 1, 1], C('#2b2620')); // bezel
        conc.quad(q(rr[1], a0, 0.06), q(rr[1], a1, 0.06), q(rr[0], a1, 0.07), q(rr[0], a0, 0.07), [0, 0, 0.2, 0.2], C(STONE)); // torus (bevelled)
        conc.quad(q(rr[2], a0, 0.025), q(rr[2], a1, 0.025), q(rr[1], a1, 0.06), q(rr[1], a0, 0.06), [0, 0, 0.2, 0.2], C(i % 2 ? BRICK : BRICK2)); // brick ring
        conc.quad(q(rr[2], a0, 0.0), q(rr[2], a1, 0.0), q(rr[2], a1, 0.025), q(rr[2], a0, 0.025), [0, 0, 0.2, 0.05], C(BRICK)); } // outer edge
    }
  }
  // brick quoins: alternating long / short blocks on every corner, wrapping round it (red-brown, slightly proud, mortar gaps)
  { const course = 0.42; let n = 0; for (let y = SH0 + 0.02; y < SH1 - 0.3; y += course, n++) for (const f of F) for (const s of [-1, 1]) { const long = ((n + Math.round(f.a / (Math.PI / 2))) % 2) === 0; const L = long ? 0.62 : 0.36; // corners alternate: long on one face where the other is short
    fbox(conc, f, HS, s * (HS + 0.03 - (L + 0.03) / 2), y + course / 2, 0.015, L + 0.03, course - 0.035, 0.03, n % 3 ? BRICK : BRICK2, { uvScale: 0.6 }); } }
  // ================================================================ the crown (23.3 – 25.4 m)
  for (const f of F) {
    fbox(conc, f, HS, 0, 23.42, 0.02, 2 * HS + 0.08, 0.32, 0.04, BRICK); // red frieze
    for (let u = -HS + 0.08; u <= HS - 0.07; u += 0.18) fbox(conc, f, HS, u, 23.5, 0.06, 0.09, 0.09, 0.06, CREAM2); // dentil course
    fbox(conc, f, HS, 0, 23.67, 0.1, 2 * HS + 0.24, 0.12, 0.2, STONE); // bed moulding
    for (let u = -HS + 0.05; u <= HS - 0.04; u += 0.36) { fbox(conc, f, HS, u, 23.86, 0.24, 0.13, 0.26, 0.28, CREAM2); fbox(conc, f, HS, u, 23.77, 0.34, 0.13, 0.1, 0.08, '#d4c6a6'); } // modillion brackets (scrolled ends)
    fbox(conc, f, HS, 0, 24.08, 0.26, 2 * HS + 0.56, 0.18, 0.52, STONE); fbox(conc, f, HS, 0, 24.22, 0.3, 2 * HS + 0.66, 0.1, 0.6, '#cbbd9e'); // corona + cymatium
  }
  conc.box(X, y0 + 24.12, Z, 2 * HS, 0.26, 2 * HS, { col: C(STONE), uvScale: 2 }); // gallery deck
  { const G = HS + 0.5; // balustrade on the cornice: corner piers with ball finials, turned balusters, moulded rail
    for (const f of F) { for (const s of [1]) { const p = P(f, G - 0.14, s * (G - 0.14), 24.27, 0); conc.box(p[0], p[1] + 0.38, p[2], 0.3, 0.76, 0.3, { col: C(CREAM), rotY: f.a }); conc.box(p[0], p[1] + 0.8, p[2], 0.36, 0.08, 0.36, { col: C(STONE), rotY: f.a });
        const gb = new THREE.SphereGeometry(0.11, 10, 8); const m = new THREE.Matrix4().makeTranslation(p[0], p[1] + 0.95, p[2]); conc.geometry(gb, m, C(STONE)); gb.dispose(); }
      for (let u = -G + 0.36; u <= G - 0.35; u += 0.2) { const p = P(f, G - 0.14, u, 24.27, 0); const lg = new THREE.LatheGeometry([[0.0, 0], [0.055, 0], [0.055, 0.06], [0.035, 0.1], [0.06, 0.26], [0.03, 0.44], [0.045, 0.5], [0.055, 0.56], [0.0, 0.56]].map(([r, h]) => new THREE.Vector2(r, h)), 6);
        conc.geometry(lg, new THREE.Matrix4().makeTranslation(p[0], p[1], p[2]), C(CREAM)); lg.dispose(); }
      const r0 = P(f, G - 0.14, 0, 24.27, 0); conc.box(r0[0], r0[1] + 0.03, r0[2], 2 * G - 0.4, 0.06, 0.2, { col: C(STONE), rotY: f.a }); conc.box(r0[0], r0[1] + 0.6, r0[2], 2 * G - 0.4, 0.08, 0.22, { col: C(STONE), rotY: f.a }); } }
  // ================================================================ lantern, dome, finial, vane (24.25 – 29.9 m)
  const lathe = (B, pts, seg, y, col) => { const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg); B.geometry(g, new THREE.Matrix4().makeTranslation(X, y0 + y, Z), C(col)); g.dispose(); };
  lathe(conc, [[0, 0], [1.42, 0], [1.42, 0.1], [1.36, 0.14], [1.36, 0.5], [1.44, 0.56], [1.44, 0.64], [0, 0.64]], 24, 24.25, CREAM); // lantern drum (masonry)
  const LR = 1.24, LY0 = 24.89, LY1 = 26.95;
  { const g = new THREE.CylinderGeometry(LR, LR, LY1 - LY0, 32, 1, true); glass.geometry(g, new THREE.Matrix4().makeTranslation(X, y0 + (LY0 + LY1) / 2, Z), C('#3a5a52')); g.dispose(); } // the glazing
  { const nH = 16, seg = 8; for (const sg of [-1, 1]) for (let j = 0; j < nH; j++) for (let s = 0; s < seg; s++) { // diamond lattice: two families of helical astragals
      const t0 = s / seg, t1 = (s + 1) / seg, a0 = j / nH * Math.PI * 2 + sg * t0 * Math.PI * 2 / 8, a1 = j / nH * Math.PI * 2 + sg * t1 * Math.PI * 2 / 8, w = 0.018, r = LR + 0.012;
      const p = (a, t, o) => [X + Math.cos(a + o) * r, y0 + LY0 + t * (LY1 - LY0), Z + Math.sin(a + o) * r];
      ds.quad(p(a0, t0, -w), p(a1, t1, -w), p(a1, t1, w), p(a0, t0, w), [0, 0, 1, 1], C('#1f2e29')); } }
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const p = [X + Math.cos(a) * (LR + 0.02), y0 + LY0, Z + Math.sin(a) * (LR + 0.02)]; metal.box(p[0], p[1] + (LY1 - LY0) / 2, p[2], 0.05, LY1 - LY0, 0.05, { col: C('#1f2e29'), rotY: -a }); } // mullions
  metal.cylinder(X, y0 + LY0 - 0.02, Z, LR + 0.05, LR + 0.05, 0.08, 32, { col: C('#1f2e29') }); metal.cylinder(X, y0 + LY0 + 0.95, Z, LR + 0.03, LR + 0.03, 0.04, 32, { col: C('#1f2e29'), caps: false }); // sill ring + mid rail
  lathe(metal, [[LR + 0.12, 0], [LR + 0.16, 0.06], [LR + 0.1, 0.16], [LR - 0.05, 0.2], [0, 0.2]], 32, LY1, '#24342e'); // lantern cornice ring
  lathe(metal, [[0, 0], [0.32, 0], [0.26, 0.5], [0.42, 0.72], [0.5, 1.15], [0.36, 1.5], [0, 1.6]], 16, LY0, '#8a7440'); // the retired lens on its pedestal (brass, inside the glass)
  // gilded ribbed dome: slightly bell-shaped profile, 16 raised ribs, a collar and a ball-and-spike finial
  const DY = LY1 + 0.18; const domeP = []; for (let i = 0; i <= 12; i++) { const t = i / 12; const ang = t * Math.PI / 2; domeP.push([Math.max(0.001, (LR + 0.02) * Math.cos(ang) * (1 + 0.06 * Math.sin(t * Math.PI))), 1.38 * Math.sin(ang)]); }
  lathe(metal, domeP, 32, DY, GOLD);
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; for (let i = 0; i < 11; i++) { const [r0, h0] = domeP[i], [r1, h1] = domeP[i + 1]; const w = 0.025;
      const q = (r, h, o, e) => [X + Math.cos(a + o) * (r + e), y0 + DY + h, Z + Math.sin(a + o) * (r + e)];
      ds.quad(q(r0, h0, -w / Math.max(0.2, r0), 0.02), q(r0, h0, w / Math.max(0.2, r0), 0.02), q(r1, h1, w / Math.max(0.2, r1), 0.02), q(r1, h1, -w / Math.max(0.2, r1), 0.02), [0, 0, 1, 1], C('#b48d3c')); } }
  lathe(metal, [[0.24, 0], [0.24, 0.12], [0.1, 0.2], [0.1, 0.32], [0.16, 0.42], [0.18, 0.5], [0.16, 0.58], [0.06, 0.66], [0.03, 1.15], [0, 1.3]], 12, DY + 1.34, GOLD); // finial
  { const vy = y0 + DY + 2.2; metal.box(X, vy, Z, 1.1, 0.025, 0.025, { col: C('#2a2a26') }); metal.box(X, vy, Z, 0.025, 0.025, 1.1, { col: C('#2a2a26') }); // compass arms
    for (const [dx, dz] of [[0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]]) metal.box(X + dx, vy, Z + dz, 0.06, 0.06, 0.06, { col: C(GOLD) });
    const ay = vy + 0.28; metal.box(X, ay, Z, 0.02, 0.02, 1.3, { col: C(GOLD) }); // vane: arrow shaft, head and tail feather (sheet)
    ds.quad([X, ay - 0.08, Z + 0.65], [X, ay + 0.08, Z + 0.65], [X, ay, Z + 0.85], [X, ay, Z + 0.85], [0, 0, 1, 1], C(GOLD)); ds.quad([X, ay - 0.04, Z - 0.65], [X, ay + 0.2, Z - 0.75], [X, ay + 0.2, Z - 0.35], [X, ay - 0.02, Z - 0.4], [0, 0, 1, 1], C(GOLD)); metal.box(X, (vy + ay) / 2 - 0.1, Z, 0.03, ay - vy + 0.4, 0.03, { col: C('#2a2a26') }); }

  // ================================================================ the working clock: dials (one mesh) + hands (one InstancedMesh)
  const dialMat = new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.35, metalness: 0, emissive: 0xfff2d8, emissiveIntensity: 0 }); dialMat.emissiveMap = dialMat.map;
  { const db = new MultiBuilder(); const dg = db.get('dial'); const cg = new THREE.CircleGeometry(CR, 48);
    for (const f of F) { const p = P(f, HS, 0, CY, 0.072); const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, f.a, 0)), new THREE.Vector3(1, 1, 1)); dg.geometry(cg, m, [1, 1, 1]); }
    cg.dispose(); for (const m of db.toMeshes({ dial: dialMat }, { cast: false, receive: true })) { m.name = 'clocktower-dials'; group.add(m); } }
  const handMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.4 }); const hands = new THREE.InstancedMesh(handGeometry(), handMat, 8); hands.name = 'clocktower-hands'; hands.castShadow = false; hands.frustumCulled = false;
  { const bossG = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12); for (const f of F) { const p = P(f, HS, 0, CY, 0.11); metal.geometry(bossG, new THREE.Matrix4().makeTranslation(...p).multiply(new THREE.Matrix4().makeRotationY(f.a)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), C('#151515')); } bossG.dispose(); } // arbor bosses
  group.add(hands);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qz = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1), _y = new THREE.Vector3(0, 1, 0);
  let lastMin = -1;
  const update = (hour, night = 0) => {
    dialMat.emissiveIntensity = 0.04 + night * 0.85; // opal dials lit from behind after dusk
    const min = Math.floor(((hour % 24) + 24) % 24 * 60 * 4); if (min === lastMin) return; lastMin = min; // quarter-minute steps (the minute hand creeps like a real turret clock)
    const h = ((hour % 12) + 12) % 12; const aH = h / 12 * Math.PI * 2, aM = (h % 1) * Math.PI * 2; let i = 0;
    for (const f of F) { _q.setFromAxisAngle(_y, f.a);
      for (const [ang, len, wid, d] of [[aH, 0.56, 1.35, 0.082], [aM, 0.82, 1.0, 0.096]]) { _qz.setFromAxisAngle(_z, -ang); const q = _q.clone().multiply(_qz); _p.set(...P(f, HS, 0, CY, d)); _s.set(wid * len * 0.95, len, 1); _m.compose(_p, q, _s); hands.setMatrixAt(i++, _m); } }
    hands.instanceMatrix.needsUpdate = true; };
  update(16.5); hands.computeBoundingSphere(); hands.frustumCulled = true;

  // ================================================================ paved apron, bollards, and the corner garden
  walk.box(X, y0 + 0.03, Z, 8.4, 0.06, 8.4, { uvScale: 1 }); // granite setts round the plinth
  for (const f of F) for (const u of [-3.6, -1.4, 1.4, 3.6]) { const p = P(f, 4.0, u, 0, 0); metal.cylinder(p[0], p[1], p[2], 0.11, 0.09, 0.85, 10, { col: C('#1d1f1d') }); metal.cylinder(p[0], p[1] + 0.85, p[2], 0.1, 0.03, 0.12, 10, { col: C('#1d1f1d') }); metal.cylinder(p[0], p[1] + 0.62, p[2], 0.125, 0.125, 0.05, 10, { col: C('#c9a34c'), caps: false });
    coll(p[0] - 0.12, p[0] + 0.12, p[2] - 0.12, p[2] + 0.12, 0.95, { kind: 'pole' }); }
  // tower colliders: the core, and the four corner piers of the ground stage (the arched recesses can be walked into)
  coll(X - 2.15, X + 2.15, Z - 2.15, Z + 2.15, 30); for (const sx of [-1, 1]) for (const sz of [-1, 1]) coll(Math.min(X + sx * 1.1, X + sx * 2.75), Math.max(X + sx * 1.1, X + sx * 2.75), Math.min(Z + sz * 1.1, Z + sz * 2.75), Math.max(Z + sz * 1.1, Z + sz * 2.75), 5.6);
  coll(X - 3.15, X + 3.15, Z - 3.15, Z + 3.15, 0.4, { kind: 'low' }); // the plinth step (walkers step up, vehicles stop)
  const [gx0, gx1, gz0, gz1] = T.garden; const ky = 0.13;
  { // stone kerb round the lawn, the lawn, a setts path from Chatham Street to the apron, and a round flower bed at its end
    const kerb = (ax, az, bx, bz) => { const cx = (ax + bx) / 2, cz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az); conc.box(cx, y0 + ky / 2, cz, Math.abs(bx - ax) > 0.01 ? l : 0.16, ky, Math.abs(bz - az) > 0.01 ? l : 0.16, { col: C('#cfc8b8'), uvScale: 1 }); };
    kerb(gx0, gz0, gx1, gz0); kerb(gx1, gz0, gx1, gz1); kerb(gx0, gz1, -372.3, gz1); kerb(-369.7, gz1, gx1, gz1); kerb(gx0, gz0, gx0, -918.6); kerb(gx0, -911.4, gx0, gz1);
    lawn.quad([gx0 + 0.08, y0 + 0.07, gz1 - 0.08], [gx1 - 0.08, y0 + 0.07, gz1 - 0.08], [gx1 - 0.08, y0 + 0.07, gz0 + 0.08], [gx0 + 0.08, y0 + 0.07, gz0 + 0.08], [gx0 / 4, gz1 / 4, gx1 / 4, gz0 / 4]);
    walk.box(-371, y0 + 0.08, (gz1 - 915) / 2 - 0.0, 2.4, 0.03, Math.abs(gz1 + 915) + 1.2, { uvScale: 1 }); walk.box((gx0 - 368) / 2 - 0.3, y0 + 0.08, -915, Math.abs(gx0 + 368) + 0.6, 0.03, 2.2, { uvScale: 1 });
    conc.cylinder(-366.4, y0, -915, 2.3, 2.3, 0.32, 28, { col: C('#d9d4c8'), caps: false }); mb.get('soil').cylinder(-366.4, y0 + 0.02, -915, 2.15, 2.15, 0.27, 28, { col: [1, 1, 1] });
    coll(-368.7, -364.1, -917.3, -912.7, 0.4, { kind: 'low' });
    // flowering shrubs in the bed (ixora red-orange, a bougainvillea mound) — real leaf sprays (HedgeBush)
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; bushBall(mb, -366.4 + Math.cos(a) * 1.35, y0 + 0.28, -915 + Math.sin(a) * 1.35, 0.42, 0.62, { col: [0.74, 0.9, 0.66], flowers: 22, flowerCol: k % 2 ? [0.93, 0.25, 0.08] : [0.95, 0.75, 0.2], seed: 300 + k }); }
    bushBall(mb, -366.4, y0 + 0.28, -915, 0.7, 1.0, { col: [0.8, 0.92, 0.7], flowers: 40, flowerCol: [0.85, 0.12, 0.5], seed: 310 });
    // clipped hedges: along the north and east edges, and both sides of the garden gate on Chatham Street
    hedgeBox(mb, (gx0 + gx1) / 2, y0, gz0 + 0.55, gx1 - gx0 - 0.6, 1.0, 0.8, 0, { col: [0.76, 0.92, 0.7], seed: 401 }); coll(gx0 + 0.3, gx1 - 0.3, gz0 + 0.15, gz0 + 0.95, 1.0, { kind: 'hedge' });
    hedgeBox(mb, gx1 - 0.55, y0, (gz0 + gz1) / 2 + 0.6, gz1 - gz0 - 2.6, 1.0, 0.8, Math.PI / 2, { col: [0.76, 0.92, 0.7], seed: 402 }); coll(gx1 - 0.95, gx1 - 0.15, gz0 + 1.3, gz1 - 0.1, 1.0, { kind: 'hedge' });
    hedgeBox(mb, (gx0 + 0.3 + -372.6) / 2, y0, gz1 - 0.5, -372.6 - gx0 - 0.3, 0.8, 0.7, 0, { col: [0.8, 0.94, 0.72], seed: 403 }); coll(gx0 + 0.3, -372.6, gz1 - 0.85, gz1 - 0.15, 0.8, { kind: 'hedge' });
    hedgeBox(mb, (-369.4 + gx1 - 1.0) / 2, y0, gz1 - 0.5, gx1 - 1.0 + 369.4, 0.8, 0.7, 0, { col: [0.8, 0.94, 0.72], seed: 404 }); coll(-369.4, gx1 - 1.0, gz1 - 0.85, gz1 - 0.15, 0.8, { kind: 'hedge' });
    // a low hedge either side of the path into the apron (west edge of the lawn)
    hedgeBox(mb, gx0 + 0.45, y0, (gz0 + 1.2 + -918.9) / 2, -918.9 - gz0 - 1.2, 0.7, 0.6, Math.PI / 2, { col: [0.8, 0.94, 0.72], seed: 405 }); coll(gx0 + 0.15, gx0 + 0.75, gz0 + 1.2, -918.9, 0.7, { kind: 'hedge' });
    // a garden bench facing the tower, beside the path
    { const bx = -374.5, bz = -917.6; paint.box(bx, y0 + 0.45, bz, 1.7, 0.06, 0.45, { col: C('#3e5a3a') }); paint.box(bx, y0 + 0.75, bz - 0.22, 1.7, 0.36, 0.05, { col: C('#3e5a3a') }); for (const s of [-0.75, 0.75]) metal.box(bx + s, y0 + 0.23, bz, 0.06, 0.46, 0.4, { col: C('#1e1e1e') }); coll(bx - 0.85, bx + 0.85, bz - 0.28, bz + 0.25, 0.5, { kind: 'bench' }); }
  }
  return { update, hands, dialMat };
}
