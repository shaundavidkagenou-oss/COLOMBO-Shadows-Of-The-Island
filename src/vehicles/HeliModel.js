// Police helicopter model: a medium twin-engine utility helicopter in Sri Lanka Police livery (white over navy, gold pin-stripe,
// "POLICE / පොලිසිය · பொலிஸ்" on the tail boom, a 4R- registration on the fin). Generic design in the class of the twin
// turboshaft, four-blade utility helicopters police and air-ambulance units fly — no manufacturer's name, badge or shape copied.
// Main dimensions: fuselage 12.9 m nose to tail-rotor, 14 m four-blade main rotor (mast top 3.9 m), 2.6 m two-blade tail rotor on
// the left of the fin, cabin 2.4 m wide, tubular skids 2.6 m apart.
// Built procedurally from lofted cross-sections (smooth normals) with the vehicles' shared materials (vertex-coloured paint,
// glass, rubber, metal, lamps) plus the aircraft's own surfaces (HeliMaterials.js: polyurethane-on-riveted-skin paint with
// seams, rivets, soot and oil streaks; clear acrylic canopy; composite blades with erosion strips; forged rotor-head steel) — no
// new textures except the shared police lettering and one small registration canvas.
// Local frame like the vehicles: +z forward (nose), +y up, +x LEFT. Returns { group, rotor, blades, disc, tail, tailBlades,
// light (searchlight gimbal: yaw group → pitch group → lens at its tip), lamps { navR, navG, tail, beacon, belly, strobe },
// crew (pilot + observer, hidden when parked), skidY (bottom of the skids, local 0), hub (mast top local y) }.
import { HOOKS } from '../core/Hooks.js';
import * as THREE from 'three';
import { MultiBuilder, MeshBuilder } from '../gfx/MeshBuilder.js';
import { Character } from '../actors/Character.js';
import { makePoliceAppearance } from '../actors/Appearance.js';
import { vehicleMaterials } from './VehicleModels.js';
import { heliMaterials, LIVERY_CABIN, LIVERY_BOOM } from './HeliMaterials.js';

export const HELI = { rotorR: 7.0, hubY: 3.9, tailR: 1.3, len: 12.9, skidW: 1.3, mass: 5400 };
const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const WHITE = C('#e0e3df'), NAVY = C('#18306e'), GOLD = C('#c9a33a'), DARK = C('#2a2d31'), GREY = C('#7d8287'), BLADE = C('#33363a'), TIP = C('#d8b72a');

// lofted body: sections { z, yc (centre), hw (half width), ht (top above yc), hb (bottom below yc), n (squareness) }; the
// ring is a superellipse, flattened at the bottom. region(z, x, y, upper) → builder name or null (skip: an opening)
function loft(mb, S, M, region, colour, inward = false) {
  const ring = []; const pts = (s) => { const out = []; for (let i = 0; i <= M; i++) { const a = (i / M) * Math.PI * 2; const c = Math.cos(a), sn = Math.sin(a); const e = 2 / s.n;
    const x = s.hw * Math.sign(c) * Math.pow(Math.abs(c), e), y = sn >= 0 ? s.ht * Math.pow(Math.abs(sn), e) : -s.hb * Math.pow(Math.abs(sn), e); out.push([x, s.yc + y, s.z, a]); } return out; };
  for (const s of S) ring.push(pts(s));
  // smooth normals from the surface grid
  const nrm = (k, i) => { const r = ring[k]; const a = r[(i + 1) % M], b = r[(i - 1 + M) % M]; const f = ring[Math.min(S.length - 1, k + 1)][i], bk = ring[Math.max(0, k - 1)][i];
    const tx = a[0] - b[0], ty = a[1] - b[1], tz = a[2] - b[2], ux = f[0] - bk[0], uy = f[1] - bk[1], uz = f[2] - bk[2];
    let nx = ty * uz - tz * uy, ny = tz * ux - tx * uz, nz = tx * uy - ty * ux; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const cx = r[i][0], cy = r[i][1] - S[k].yc; if (nx * cx + ny * cy < 0) { nx = -nx; ny = -ny; nz = -nz; } return [nx, ny, nz]; };
  for (let k = 0; k < S.length - 1; k++) for (let i = 0; i < M; i++) {
    const p00 = ring[k][i], p01 = ring[k][i + 1], p10 = ring[k + 1][i], p11 = ring[k + 1][i + 1];
    const zm = (p00[2] + p10[2]) / 2, xm = (p00[0] + p01[0] + p10[0] + p11[0]) / 4, ym = (p00[1] + p01[1] + p10[1] + p11[1]) / 4;
    const name = region(zm, xm, ym, ym > (S[k].yc + S[k + 1].yc) / 2, (p00[3] + p01[3]) / 2); if (!name) continue; const b = mb.get(name); const sg = inward ? -1 : 1;
    const v = (p, kk, ii) => { const n = nrm(kk, ii % M); return b.vert(p[0], p[1], p[2], n[0] * sg, n[1] * sg, n[2] * sg, p[3] / 6.283, kk / S.length, colour(p[2], p[0], p[1])); };
    const a = v(p00, k, i), bb = v(p01, k, i + 1), c = v(p11, k + 1, i + 1), d = v(p10, k + 1, i);
    const n0 = nrm(k, i); const e1 = [p11[0] - p00[0], p11[1] - p00[1], p11[2] - p00[2]], e2 = [p01[0] - p00[0], p01[1] - p00[1], p01[2] - p00[2]];
    const out = (e1[1] * e2[2] - e1[2] * e2[1]) * n0[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * n0[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * n0[2] >= 0;
    if (out !== inward) b.idx.push(a, c, bb, a, d, c); else b.idx.push(a, bb, c, a, c, d); // counter-clockwise seen from outside
  }
  // close the ends with fans (nose / tail of each loft)
  for (const [k, sgn] of [[0, 1], [S.length - 1, -1]]) { const s = S[k]; if (s.hw < 0.02) continue; const b = mb.get(region(s.z, 0, s.yc, false, -1) || 'hpaint'); const sn = inward ? -sgn : sgn; const c0 = b.vert(0, s.yc, s.z, 0, 0, sn, 0.5, 0.5, colour(s.z, 0, s.yc));
    const base = b.vcount; for (let i = 0; i <= M; i++) { const p = ring[k][i]; b.vert(p[0], p[1], p[2], 0, 0, sn, 0, 0, colour(p[2], p[0], p[1])); } for (let i = 0; i < M; i++) { if (sn > 0) b.idx.push(c0, base + i, base + i + 1); else b.idx.push(c0, base + i + 1, base + i); } }
}
// a tube along a polyline (skids, cross tubes, exhaust pipes)
function tube(b, pts, r, seg = 8, col) {
  for (let k = 0; k < pts.length - 1; k++) { const a = new THREE.Vector3(...pts[k]), c = new THREE.Vector3(...pts[k + 1]); const len = a.distanceTo(c); const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize()); m.compose(a.clone().add(c).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)); b.geometry(g.toNonIndexed(), m, col && Array.isArray(col[0]) ? col[Math.min(k, col.length - 1)] : col); g.dispose(); }
}
function geo(b, g, pos, rot = [0, 0, 0], scl = [1, 1, 1], col) { const m = new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scl)); b.geometry(g, m, col); g.dispose(); }

let regMat = null;
function registrationMat(reg) {
  if (regMat) return regMat;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d'); x.clearRect(0, 0, 512, 128);
  x.fillStyle = '#18306e'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = 'bold 92px "Barlow Condensed", sans-serif'; x.fillText(reg, 256, 66, 500);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const P = vehicleMaterials().mats.police; // same shader as the police lettering (only the map differs: no new program)
  regMat = P.clone(); regMat.map = t; return regMat;
}

export function buildHeliModel({ reg = '4R-SLP', crew = true } = {}) {
  const { mats } = vehicleMaterials(); const HM = heliMaterials(); const mb = new MultiBuilder(); const group = new THREE.Group(); group.name = 'policeHeli';
  // --------------------------------------------------------------------------------------------- fuselage (cabin + nose)
  const S = []; const sec = (z, yc, hw, ht, hb, n) => S.push({ z, yc, hw, ht, hb, n });
  // nose tip → cockpit → cabin → aft fairing (where the boom starts)
  // (50th request: the old body was a 2.4 m wide tube with a long pointed nose — a toy's proportions; this follows a modern light
  // twin: 2.0 m cabin, flat floor, the canopy sweeping down into a short blunt nose, the belly rising into the tail cone)
  sec(5.42, 1.16, 0.02, 0.02, 0.02, 2.2); sec(5.36, 1.17, 0.26, 0.24, 0.26, 2.2); sec(5.22, 1.21, 0.5, 0.42, 0.42, 2.3); sec(5.0, 1.28, 0.7, 0.6, 0.53, 2.4);
  sec(4.7, 1.37, 0.85, 0.78, 0.61, 2.6); sec(4.3, 1.47, 0.95, 0.93, 0.67, 2.8); sec(3.85, 1.55, 1.0, 1.01, 0.71, 3.0); sec(3.4, 1.6, 1.02, 1.02, 0.73, 3.2);
  for (let z = 3.0; z >= -0.6; z -= 0.4) sec(+z.toFixed(2), 1.62, 1.02, 1.0, 0.74, 3.4);
  sec(-1.0, 1.66, 0.99, 0.96, 0.7, 3.2); sec(-1.45, 1.74, 0.88, 0.88, 0.6, 2.9); sec(-1.9, 1.84, 0.72, 0.76, 0.47, 2.6); sec(-2.35, 1.93, 0.56, 0.62, 0.37, 2.3); sec(-2.7, 1.98, 0.46, 0.52, 0.32, 2.1);
  // white over navy with a gold pin-stripe, the split rising toward the nose: drawn per pixel by the paint shader (HeliMaterials
  // LIVERY_CABIN), so the line is crisp — vertex colours zig-zagged across the lofted grid on the tapering nose
  const paint = () => LIVERY_CABIN;
  // windscreen and chin windows follow the loft's own lines (ring angle × station: a = 0 left side, π/2 top, π right, 3π/2
  // belly), so their frames run straight along the nose instead of stair-stepping across the grid
  const glassAt = (z, x, y, up, a = -1) => {
    const ax = Math.abs(x), P = Math.PI;
    if (z > 3.15 && z < 5.3 && a > 0.12 * P && a < 0.88 * P && !(z < 3.5 && a > 0.4 * P && a < 0.6 * P)) return true; // windscreen sweeping round the sides + roof eyebrow, a centre frame over the cabin roof
    if (z > 4.45 && z < 5.15 && ((a > 1.16 * P && a < 1.42 * P) || (a > 1.58 * P && a < 1.84 * P))) return true; // chin windows (the pilot's view down past the pedals)
    if (ax > 0.86 && y > 1.6 && y < 2.3) { if (z > 2.0 && z < 3.05) return true; if (z > 0.15 && z < 1.65) return true; if (z > -1.0 && z < -0.25) return true; } // cockpit door, sliding cabin door, rear cabin window
    return false;
  };
  loft(mb, S, 36, (z, x, y, up, a) => (glassAt(z, x, y, up, a) ? 'hglass' : 'hpaint'), paint);
  // interior behind the glass (dark cabin), so the windows read as windows and not as see-through holes
  // cabin lining: the hull's inside face (dark trim) from the rear bulkhead to the nose, open at every window, so through the
  // clear canopy you see a cabin, not a black block — and never the sky through the far wall (the skin is single-sided)
  { const k = 0.965, Sin = S.filter((q) => q.z >= -1.0 && q.z <= 5.9).map((q) => ({ ...q, hw: q.hw * k, ht: q.ht * k, hb: q.hb * k }));
    loft(mb, Sin, 36, (z, x, y, up, a) => (glassAt(z, x / k, 1.62 + (y - 1.62) / k, up, a) ? null : 'vinterior'), () => C('#34373c'), true); }
  { const ib = mb.get('vinterior'); const PANEL = C('#1a1c1f'), SEAT = C('#2c3036'), CUSH = C('#3a3f47'), STICK = C('#141414'), MFD = C('#0c1a24'), BEZ = C('#2b2e33');
    ib.box(0, 0.99, 1.72, 1.86, 0.06, 5.2, { col: C('#26282b') }); /* cabin floor (top 1.02) */
    ib.box(0, 1.12, 4.3, 0.36, 0.26, 0.9, { col: C('#1d1f22') }); /* centre console between the seats */ ib.box(0, 1.27, 4.42, 0.3, 0.04, 0.6, { col: BEZ }); /* radio / nav heads on it */
    ib.box(0, 1.6, 4.55, 1.36, 0.4, 0.12, { col: PANEL }); ib.box(0, 1.81, 4.6, 1.3, 0.035, 0.2, { col: C('#0d0e0f') }); /* instrument panel + glare shield (inside the canopy at its sides) */
    for (const sx of [-1, 1]) for (const k of [0, 1]) { const x = sx * (0.18 + k * 0.3); ib.box(x, 1.62, 4.485, 0.25, 0.22, 0.012, { col: BEZ }); ib.box(x, 1.625, 4.478, 0.21, 0.17, 0.006, { col: MFD }); } /* four flight / map displays */
    ib.box(0, 2.56, 3.2, 0.52, 0.05, 0.62, { col: C('#202226') }); /* overhead switch console */
    for (const sx of [-1, 1]) { const x = sx * 0.43; // crew seats (crash-attenuating frames), cushion top at 1.38; pedals; cyclic between the knees; collective on the left
      ib.box(x, 1.34, 3.62, 0.5, 0.08, 0.5, { col: CUSH }); ib.box(x, 1.2, 3.62, 0.44, 0.2, 0.42, { col: SEAT }); ib.box(x, 1.76, 3.33, 0.5, 0.78, 0.09, { col: CUSH }); ib.box(x, 2.24, 3.34, 0.26, 0.2, 0.08, { col: CUSH }); /* headrest */
      for (const px of [-0.13, 0.13]) { ib.box(x + px, 1.08, 4.36, 0.09, 0.03, 0.2, { col: STICK }); ib.box(x + px, 1.13, 4.45, 0.08, 0.1, 0.02, { col: STICK }); } /* pedals */
      tube(ib, [[x, 1.02, 3.98], [x, 1.32, 3.97], [x, 1.5, 3.95]], 0.016, 6, STICK); ib.box(x, 1.54, 3.95, 0.04, 0.09, 0.04, { col: STICK }); /* cyclic + grip */
      tube(ib, [[x + 0.3, 1.18, 3.55], [x + 0.3, 1.26, 3.75], [x + 0.3, 1.32, 3.92]], 0.018, 6, STICK); ib.box(x + 0.3, 1.34, 3.95, 0.04, 0.05, 0.08, { col: STICK }); } /* collective + throttle head */
    ib.box(0, 1.27, 0.5, 1.84, 0.12, 0.52, { col: CUSH }); ib.box(0, 1.72, 0.22, 1.84, 0.8, 0.09, { col: CUSH }); /* rear-cabin bench */ }
  // --------------------------------------------------------------------------------------------- engine deck, cowlings, exhausts
  const E = []; const es = (z, yc, hw, ht, hb, n) => E.push({ z, yc, hw, ht, hb, n });
  es(2.6, 2.58, 0.05, 0.03, 0.05, 2.2); es(2.3, 2.62, 0.5, 0.18, 0.2, 2.4); es(1.6, 2.68, 0.72, 0.36, 0.22, 2.8); es(0.6, 2.72, 0.78, 0.46, 0.24, 3.2); es(-0.6, 2.74, 0.78, 0.48, 0.24, 3.2); es(-1.7, 2.66, 0.66, 0.4, 0.24, 2.8); es(-2.6, 2.46, 0.4, 0.22, 0.2, 2.3); es(-3.0, 2.34, 0.06, 0.04, 0.04, 2.2);
  loft(mb, E, 24, () => 'hpaint', (z, x, y) => (y > 3.1 ? C('#d9dcd8') : WHITE));
  { const w = mb.get('vworn'); for (const sx of [-1, 1]) { w.box(sx * 0.79, 2.86, 0.7, 0.03, 0.22, 1.1, { col: C('#3a3d42') }); /* intake grille */ for (let k = 0; k < 5; k++) w.box(sx * 0.795, 2.78 + k * 0.04, 0.7, 0.01, 0.012, 1.06, { col: DARK }); }
    for (const sx of [-1, 1]) tube(mb.get('vengine'), [[sx * 0.42, 2.85, -1.9], [sx * 0.5, 2.98, -2.35], [sx * 0.56, 3.12, -2.65]], 0.13, 10, [C('#7a6a55'), C('#4d4a52')]); // exhaust stacks: heat-tinted stainless (straw / bronze at the root, blue-grey toward the lip)
    for (const sx of [-1, 1]) { const lip = mb.get('vrubber'); lip.cylinder(sx * 0.565, 3.135, -2.665, 0.118, 0.118, 0.04, 10, { col: C('#141312') }); } // sooted inside of each lip
    mb.get('hpaint').cylinder(0, 3.02, 0.25, 0.42, 0.36, 0.22, 16, { col: C('#e2e4e2') }); /* transmission fairing under the mast (painted like the cowling) */ }
  // --------------------------------------------------------------------------------------------- tail boom, fins, stabiliser
  const B = []; for (let i = 0; i <= 10; i++) { const t = i / 10; const z = -2.6 - t * 5.3; B.push({ z, yc: 2.0 + 0.22 * t, hw: 0.46 - 0.24 * t, ht: 0.5 - 0.26 * t, hb: 0.42 - 0.22 * t, n: 2.3 }); }
  loft(mb, B, 20, () => 'hpaint', () => LIVERY_BOOM);
  { const p = mb.get('hpaint'); const fin = new THREE.Shape(); fin.moveTo(-7.4, 2.0); fin.lineTo(-8.35, 2.05); fin.lineTo(-8.95, 4.15); fin.lineTo(-8.45, 4.2); fin.lineTo(-7.75, 2.75); fin.lineTo(-7.55, 2.3); fin.closePath();
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }); fg.translate(0, 0, -0.08); // shape in (z, y), extruded across x
    geo(p, fg, [0, 0, 0], [0, -Math.PI / 2, 0], [1, 1, 1], WHITE);
    const vf = new THREE.Shape(); vf.moveTo(-7.5, 1.92); vf.lineTo(-8.2, 1.95); vf.lineTo(-8.45, 1.45); vf.lineTo(-8.05, 1.5); vf.closePath(); const vg = new THREE.ExtrudeGeometry(vf, { depth: 0.1, bevelEnabled: false }); vg.translate(0, 0, -0.05); geo(p, vg, [0, 0, 0], [0, -Math.PI / 2, 0], [1, 1, 1], NAVY); // ventral fin + tail skid
    tube(mb.get('valloy'), [[0, 1.62, -7.7], [0, 1.4, -8.2], [0, 1.42, -8.55]], 0.035, 6, GREY);
    // horizontal stabiliser (inverted airfoil) with end plates
    const hs = new THREE.Shape(); hs.moveTo(0, 0); hs.quadraticCurveTo(0.2, 0.07, 0.62, 0.02); hs.lineTo(0.62, -0.01); hs.quadraticCurveTo(0.25, -0.03, 0, 0); const hg = new THREE.ExtrudeGeometry(hs, { depth: 3.0, bevelEnabled: false }); hg.translate(0, 0, -1.5);
    geo(p, hg, [0, 2.05, -5.2], [0, Math.PI / 2, 0], [1, 1, 1], WHITE);
    for (const sx of [-1, 1]) p.box(sx * 1.52, 2.12, -5.5, 0.04, 0.42, 0.55, { col: NAVY });
  }
  // --------------------------------------------------------------------------------------------- skids
  { const m = mb.get('valloy'); for (const sx of [-1, 1]) { const x = sx * HELI.skidW; tube(m, [[x, 0.06, -2.3], [x, 0.06, 2.6], [x, 0.12, 3.05], [x, 0.32, 3.35], [x, 0.5, 3.45]], 0.05, 8, C('#9aa0a6'));
      for (const z of [1.55, -1.25]) tube(m, [[x, 0.06, z], [x * 0.98, 0.36, z], [x * 0.9, 0.62, z], [x * 0.7, 0.82, z], [x * 0.45, 0.9, z]], 0.055, 8, C('#9aa0a6')); // curved cross tubes up to the belly
      m.box(x, 0.2, 2.4, 0.06, 0.04, 0.5, { col: DARK }); /* boarding step */ m.box(x * 0.93, 0.36, 2.4, 0.04, 0.32, 0.04, { col: C('#9aa0a6') }); }
    for (const z of [1.55, -1.25]) tube(m, [[0.45, 0.9, z], [-0.45, 0.9, z]], 0.055, 8, C('#9aa0a6')); }
  // --------------------------------------------------------------------------------------------- small details
  { const r = mb.get('vrubber'), w = mb.get('vworn'), a = mb.get('valloy');
    for (const sx of [-1, 1]) { // door seams, sliding-door rail, handles
      const x = sx * 1.024; for (const z of [1.95, 3.1, 0.1, 1.7]) r.box(x, 1.72, z, 0.012, 0.86, 0.022, { col: DARK }); r.box(sx * 0.975, 2.2, 0.95, 0.03, 0.03, 3.3, { col: DARK }); r.box(sx * 0.925, 1.1, 0.95, 0.03, 0.03, 3.3, { col: DARK }); /* door seams, sliding-door rails */
      a.box(sx * 1.03, 1.52, 2.12, 0.02, 0.03, 0.16, { col: C('#c8ccd0') }); a.box(sx * 1.03, 1.52, 0.3, 0.02, 0.03, 0.2, { col: C('#c8ccd0') }); /* handles */
    }
    a.box(0, 2.62, 4.55, 0.04, 0.42, 0.06, { col: GREY }); a.box(0, 0.62, 5.0, 0.04, 0.36, 0.06, { col: GREY }); // wire-strike cutters above / below the cockpit
    for (const sx of [-1, 1]) tube(a, [[sx * 0.16, 1.42, 5.25], [sx * 0.16, 1.42, 5.62]], 0.012, 5, GREY); // pitot tubes
    w.box(0, 0.76, -0.4, 0.02, 0.28, 0.32, { col: DARK }); w.box(0, 3.25, -1.6, 0.02, 0.22, 0.3, { col: DARK }); w.box(0, 0.82, 2.2, 0.02, 0.18, 0.22, { col: DARK }); // antenna blades
    // FLIR / camera turret under the nose
    geo(mb.get('vworn'), new THREE.SphereGeometry(0.22, 14, 10), [0, 0.6, 4.62], [0, 0, 0], [1, 1, 1], C('#3b3f44')); mb.get('hglass').box(0, 0.6, 4.83, 0.15, 0.09, 0.03, {});
    w.cylinder(0, 0.8, 4.62, 0.07, 0.07, 0.12, 8, { col: DARK });
  }
  // lettering: POLICE (shared material) on both boom sides, registration on the fin
  { // POLICE / පොලිසිය · பொலிஸ் on the white cabin side between the gold band and the windows (follows the side's tumblehome)
    const d = mb.get('police'); const zA = -0.55, zB = 0.75, y0 = 1.25, y1 = 1.59, xb = 0.99, xt = 1.027;
    d.quad([xb, y0, zB], [xb, y0, zA], [xt, y1, zA], [xt, y1, zB], [0, 0, 1, 1], [1, 1, 1]); d.quad([-xb, y0, zA], [-xb, y0, zB], [-xt, y1, zB], [-xt, y1, zA], [0, 0, 1, 1], [1, 1, 1]); // reads nose → tail on both sides
    // and smaller on the tail boom (white upper half), each side
    const bz0 = -3.2, bz1 = -4.4, by0 = 1.95, by1 = 2.22, bx0 = 0.445, bx1 = 0.395;
    d.quad([bx0, by0, bz0], [bx1, by0, bz1], [bx1, by1, bz1], [bx0, by1, bz0], [0, 0, 1, 1], [1, 1, 1]); d.quad([-bx1, by0, bz1], [-bx0, by0, bz0], [-bx0, by1, bz0], [-bx1, by1, bz1], [0, 0, 1, 1], [1, 1, 1]);
    const rg = mb.get('reg'); const fx = 0.115; rg.quad([fx, 2.55, -7.8], [fx, 2.55, -8.45], [fx, 2.8, -8.45], [fx, 2.8, -7.8], [0, 0, 1, 1], [1, 1, 1]); rg.quad([-fx, 2.55, -8.45], [-fx, 2.55, -7.8], [-fx, 2.8, -7.8], [-fx, 2.8, -8.45], [0, 0, 1, 1], [1, 1, 1]); }
  const M = { ...mats, ...HM, reg: registrationMat(reg) };
  for (const [name, b] of mb.b) { const g = b.build(); if (!g) continue; const m = new THREE.Mesh(g, M[name] || mats.vpaint); m.castShadow = name !== 'vglass' && name !== 'hglass' && name !== 'police' && name !== 'reg'; m.receiveShadow = true; m.name = 'heli.' + name; group.add(m); }
  // --------------------------------------------------------------------------------------------- main rotor
  const rotor = new THREE.Group(); rotor.position.set(0, HELI.hubY, 0.25); group.add(rotor);
  { const hb = new MultiBuilder(); const w = hb.get('hmetal'); // bearingless hub: a composite flex-beam star, pitch cuffs over each beam, swashplate and links below, a dome cap
    w.cylinder(0, -0.68, 0, 0.11, 0.12, 0.7, 12, { col: C('#8d9298') }); /* mast */ w.cylinder(0, -0.4, 0, 0.3, 0.3, 0.05, 18, { col: GREY }); w.cylinder(0, -0.33, 0, 0.24, 0.26, 0.05, 18, { col: C('#5d6268') }); /* swashplate (fixed + rotating) */
    w.cylinder(0, -0.02, 0, 0.24, 0.26, 0.12, 18, { col: DARK }); /* hub plate */ w.cylinder(0, 0.1, 0, 0.12, 0.2, 0.14, 14, { col: C('#d7dad6') }); /* dome cap */
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const ca = Math.cos(a), sa = Math.sin(a);
      w.box(ca * 0.38, -0.02, sa * 0.38, 0.06 + Math.abs(ca) * 0.5, 0.05, 0.06 + Math.abs(sa) * 0.5, { col: C('#2a2c2f') }); /* flex beam */
      w.box(ca * 0.5, 0, sa * 0.5, 0.12 + Math.abs(ca) * 0.3, 0.1, 0.12 + Math.abs(sa) * 0.3, { col: C('#4a4e54') }); /* pitch cuff */
      const px = -sa * 0.1, pz = ca * 0.1; w.box(ca * 0.36 + px, -0.06, sa * 0.36 + pz, 0.06, 0.04, 0.06, { col: C('#3b3e43') }); /* pitch horn */ tube(w, [[ca * 0.24 + px, -0.32, sa * 0.24 + pz], [ca * 0.36 + px, -0.08, sa * 0.36 + pz]], 0.02, 5, GREY); /* pitch link */ }
    for (const [name, b] of hb.b) { const m = new THREE.Mesh(b.build(), HM[name] || mats[name]); m.castShadow = true; rotor.add(m); } }
  const blades = []; { const bg = new MultiBuilder(); const b = bg.get('hblade'); const L = HELI.rotorR - 0.55; // one blade along +x from the grip, then cloned 4×
    // symmetric 12 % aerofoil (NACA 0012 thickness law), leading edge at +z (the rotor turns clockwise seen from above), pitch
    // axis at quarter chord, chord tapering slightly to the tip; the last 0.5 m is the painted (high-visibility) tip
    const N = 14, foil = []; for (let i = 0; i <= N; i++) { const t = i / N, xc = 0.5 - 0.5 * Math.cos(t * Math.PI); const yt = 0.6 * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4); foil.push([xc, yt]); }
    const ring = []; for (let i = N; i >= 0; i--) ring.push([foil[i][0], foil[i][1]]); for (let i = 1; i < N; i++) ring.push([foil[i][0], -foil[i][1]]); // TE → LE over the top, back under
    const nr = ring.length, nrm2 = ring.map((q, i) => { const a = ring[(i + 1) % nr], c = ring[(i - 1 + nr) % nr]; const dx = a[0] - c[0], dy = a[1] - c[1]; const l = Math.hypot(dx, dy) || 1; return [dy / l, -dx / l]; }); // outward (checked numerically: every face normal agrees with its vertex normals)
    const stations = [0.55, 1.4, 2.6, 3.8, 5.0, 5.95, HELI.rotorR - 0.5, HELI.rotorR - 0.02];
    const rows = stations.map((r, si) => { const ch = 0.56 - 0.04 * (r - 0.55) / L, col = si >= 6 ? TIP : BLADE; return ring.map((q, i) => { const n = nrm2[i]; return b.vert(r, q[1] * ch, ch * (0.25 - q[0]), 0, n[1], -n[0], 0, 0, col); }); });
    for (let si = 0; si < rows.length - 1; si++) { if (si === 5) continue; for (let i = 0; i < nr; i++) { const a = rows[si][i], c = rows[si][(i + 1) % nr], d = rows[si + 1][(i + 1) % nr], e = rows[si + 1][i]; b.idx.push(a, d, e, a, c, d); } }
    { const r2 = stations[6]; // the joint between the grey blade and the painted tip: a separate ring so the colours don't smear
      const ch = 0.56 - 0.04 * (r2 - 0.55) / L; const ga = ring.map((q, i) => { const n = nrm2[i]; return b.vert(r2, q[1] * ch, ch * (0.25 - q[0]), 0, n[1], -n[0], 0, 0, BLADE); });
      for (let i = 0; i < nr; i++) { const a = rows[5][i], c = rows[5][(i + 1) % nr], d = ga[(i + 1) % nr], e = ga[i]; b.idx.push(a, d, e, a, c, d); } }
    { const last = rows[rows.length - 1]; const ch = 0.52, cz = ch * 0.25 - ch * 0.3; const c0 = b.vert(HELI.rotorR, 0, cz, 1, 0, 0, 0, 0, TIP); for (let i = 0; i < nr; i++) b.idx.push(c0, last[i], last[(i + 1) % nr]); } // tip cap
    const bgeo = b.build(); for (let k = 0; k < 4; k++) { const piv = new THREE.Group(); piv.rotation.y = k * Math.PI / 2; const m = new THREE.Mesh(bgeo, HM.hblade); m.castShadow = true; piv.add(m); rotor.add(piv); blades.push(m); } }
  // blurred disc of the spinning blades (fades in with rotor speed)
  const discMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const dg = new THREE.RingGeometry(0.6, HELI.rotorR, 48, 7); dg.rotateX(-Math.PI / 2);
  { const P = dg.attributes.position, cols = []; for (let i = 0; i < P.count; i++) { const r = Math.hypot(P.getX(i), P.getZ(i)); const tip = r > HELI.rotorR - 0.6 ? 1 : 0; const a = Math.min(1, 1.5 / r) * (tip ? 0.85 : 1); // blade coverage ∝ 1/r; the painted tips leave a faint yellow ring
      cols.push(tip ? 0.3 : 0.14, tip ? 0.27 : 0.15, tip ? 0.12 : 0.16, a); } dg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4)); } const disc = new THREE.Mesh(dg, discMat); disc.renderOrder = 2; disc.visible = false; rotor.add(disc);
  // --------------------------------------------------------------------------------------------- tail rotor (left side of the fin)
  const tail = new THREE.Group(); tail.position.set(0.24, 3.4, -8.4); group.add(tail);
  const tailBlades = new THREE.Group(); tail.add(tailBlades);
  { const tb = new MultiBuilder(); const w = tb.get('hblade'); w.cylinder(0, 0, 0, 0.1, 0.1, 0.14, 10, { col: DARK }); for (const s of [-1, 1]) { w.box(0, s * HELI.tailR / 2, 0, 0.03, HELI.tailR - 0.08, 0.2, { col: BLADE }); w.box(0, s * (HELI.tailR - 0.12), 0, 0.032, 0.2, 0.2, { col: TIP }); }
    const m = new THREE.Mesh(tb.get('hblade').build(), HM.hblade); tailBlades.add(m); m.castShadow = true; // blades along y, spun about x
    const tdisc = new THREE.Mesh(new THREE.CircleGeometry(HELI.tailR, 24), discMat); tdisc.rotation.y = Math.PI / 2; tdisc.position.x = 0.02; tail.add(tdisc); tail.userData.disc = tdisc; tdisc.visible = false; }
  // --------------------------------------------------------------------------------------------- searchlight (right side, under the cabin)
  const light = new THREE.Group(); light.position.set(-1.05, 0.58, 3.3); group.add(light);
  const lightPitch = new THREE.Group(); light.add(lightPitch);
  { const lb = new MultiBuilder(); const w = lb.get('hmetal'); w.box(0.25, 0.12, 0, 0.5, 0.08, 0.12, { col: DARK }); /* mount arm */ w.cylinder(0, 0.06, 0, 0.05, 0.05, 0.12, 8, { col: DARK });
    for (const [name, b] of lb.b) { const m = new THREE.Mesh(b.build(), HM[name] || mats[name]); light.add(m); }
    const hb = new MultiBuilder(); const h = hb.get('vworn'); h.cylinder(0, -0.2, 0, 0.19, 0.17, 0.42, 16, { col: C('#30343a') }); h.box(0, -0.2, 0, 0.44, 0.06, 0.06, { col: DARK }); // lamp barrel (axis along -y, turned to +z below)
    const head = new THREE.Mesh(hb.get('vworn').build(), mats.vworn); /* painted lamp barrel */ head.rotation.x = Math.PI / 2; lightPitch.add(head); // barrel along +z (the beam axis)
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.1, 0.06, 20, 1, true), mats.vrefl); bowl.rotation.x = Math.PI / 2; bowl.position.z = 0.19; lightPitch.add(bowl); // polished reflector ring round the lamp
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), mats.vlight.clone()); lens.position.set(0, 0, 0.225); lightPitch.add(lens); light.userData.lens = lens; }
  // --------------------------------------------------------------------------------------------- lamps (navigation, anti-collision, police strobe)
  const lamp = (mat, x, y, z, s = 0.06) => { const m = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), mat); m.position.set(x, y, z); group.add(m); return m; };
  const navRm = mats.vtail.clone(); const navGm = new THREE.MeshStandardMaterial({ color: 0x0a5a20, emissive: 0x20ff60, emissiveIntensity: 0.6, roughness: 0.25 }); const whiteM = mats.vlight.clone();
  const lamps = { navR: lamp(navRm, 1.56, 2.12, -5.45), navG: lamp(navGm, -1.56, 2.12, -5.45), tail: lamp(whiteM, 0, 1.95, -8.62, 0.05), beacon: lamp(mats.lbRed.clone(), 0, 3.24, -1.55, 0.09), belly: lamp(mats.lbRed.clone(), 0, 0.68, 0.6, 0.08), strobe: lamp(mats.lbBlue.clone(), 0, 0.7, 2.6, 0.08) };
  lamps.navR.material.emissiveIntensity = 0.6;
  // --------------------------------------------------------------------------------------------- crew: pilot (right seat) and observer (left), only in flight
  // real people (the game's own Character bodies, 50th request: the old crew were a box torso under a white ball): police air
  // wing aircrew in navy flight suits, flight gloves and visored flight helmets. The pilot flies from the right seat (right hand on
  // the cyclic between his knees, left on the collective); the observer sits left, hands on his lap.
  // Distance LOD (renderer-driven, so it follows the camera that draws the frame, shadows included): the real crew within ~38 m;
  // beyond that a person in the cockpit is a few pixels behind tinted glass, so a merged stand-in (navy suit, white helmet, dark
  // visor: one draw call, ~300 triangles) replaces the two ~16k-triangle bodies.
  const crewG = new THREE.LOD(); crewG.name = 'heliCrew'; crewG.position.set(0, 1.6, 3.6); group.add(crewG);
  const crewHi = new THREE.Group(); crewHi.position.set(0, -1.6, -3.6); const crewLo = new THREE.Group(); crewLo.position.copy(crewHi.position);
  crewG.addLevel(crewHi, 0, 0.06); crewG.addLevel(crewLo, 38, 0.06);
  const crewChars = [];
  if (crew) {
    for (const [k, sx] of [[0, -1], [1, 1]]) { const x = sx * 0.43, pilot = k === 0;
      const sp = makePoliceAppearance(7301 + k * 17, 'csru', { sex: 'm', band: 'adult' });
      for (const key of ['vest', 'holster', 'pouch', 'strap', 'lanyard', 'cord']) delete sp[key];
      Object.assign(sp, { outfit: 'security', top: '#2b3443', bottom: '#2b3443', longSleeve: true, collar: true, cap: '#e6e7e3', capStyle: 'flight', gloves: '#17181a', cuff: '#17181a', belt: '#1a1a1a', shoes: '#141414' });
      const ch = new Character(sp); const seat = { x, y: 1.38, z: 3.62, floor: 1.02, fz: 0.72, fx: 0.11, roof: 2.5, lean: pilot ? 0.06 : -0.02, kind: 'sit',
        hands: pilot ? 'bars' : 'lap', bars: pilot ? [[x + 0.3, 1.34, 3.92], [x, 1.54, 3.95]] : null };
      ch.root.position.set(x, 1.38, 3.62); ch.anim.mocapOff = true; ch.anim.sitIn(seat, 1); for (let f = 0; f < 4; f++) ch.anim.update(1 / 30, 0, 0);
      ch.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); crewHi.add(ch.root); crewChars.push(ch); }
    const pb = new MeshBuilder(); const SUIT = C('#2b3443'), HELM = C('#e6e7e3'), VIS = C('#16181b'), GLOVE = C('#17181a');
    for (const [k, sx] of [[0, -1], [1, 1]]) { const x = sx * 0.43, pilot = k === 0;
      pb.box(x, 1.72, 3.6, 0.38, 0.56, 0.22, { col: SUIT }); /* torso against the seat back */ pb.box(x, 1.47, 3.85, 0.34, 0.15, 0.5, { col: SUIT }); /* thighs */
      pb.box(x, 1.2, 4.12, 0.28, 0.42, 0.13, { col: SUIT }); /* shins to the pedals */ pb.box(x, 2.03, 3.62, 0.1, 0.07, 0.1, { col: SUIT }); /* neck */
      pb.cylinder(x, 2.17, 3.62, 0.135, 0.13, 0.25, 10, { col: HELM }); /* flight helmet */ pb.box(x, 2.15, 3.74, 0.22, 0.09, 0.03, { col: VIS }); /* visor */
      for (const s2 of [-1, 1]) { const hx = x + s2 * 0.24; pb.box(hx, 1.78, 3.66, 0.09, 0.3, 0.1, { col: SUIT }); /* upper arm */
        const fwd = pilot ? 0.3 : 0.18; pb.box(hx - s2 * 0.04, 1.58, 3.7 + fwd / 2, 0.08, 0.08, fwd, { col: SUIT }); pb.box(hx - s2 * 0.05, 1.58, 3.72 + fwd, 0.08, 0.08, 0.08, { col: GLOVE }); } }
    const pm = new THREE.Mesh(pb.build(), mats.vinterior); pm.castShadow = true; crewLo.add(pm);
  }
  // keep the crew's seated pose (and small head turns) alive; the owner calls it only when the aircraft is near the camera
  const updateCrew = (dt) => { if (crewG.getCurrentLevel() !== 0) return; for (const ch of crewChars) ch.anim.update(dt, 0, 0); };
  group.userData.__vtype = 'heli:police'; if (HOOKS.vehicle) HOOKS.vehicle(group, 'heli:police'); // 68th: model tools
  return { group, rotor, blades, disc, discMat, tail, tailBlades, light, lightPitch, lamps, crew: crewG, crewChars, updateCrew, hub: HELI.hubY };
}
