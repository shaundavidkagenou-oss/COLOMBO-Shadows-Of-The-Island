// STREET CUSTOMS — the workshop building (site: Layout.CUSTOMS_SITE, Duplication Road, Cinnamon Gardens). Built once at load
// (World.build); no browser-only imports at module level (Node tests build it; canvas signage is skipped without a DOM).
//
// A modern performance workshop on a 46 × 32 m lot: concrete forecourt with customer bays and a wide driveway, a 44 × 19 m steel
// hall at the back with one 7 m roller-door bay facing the road, an illuminated fascia and a monolith pylon at the kerb. Inside:
//   centre    — the inspection / preview turntable (a real rotating plate; the vehicle being modified stands on it) under an LED
//               light rig, diagnostics cart beside it
//   left      — a two-post lift, red roll cabinets and a workbench, tyre changer + wheel balancer, tyre rack
//   right     — the rim display wall (real wheel geometry from CustomsWheels), a glazed paint booth, reception with a counter
// The six ceiling lights are ordinary shadowless point lights, the same count as the Police HQ interior's (whose shader variants
// the loading screen already compiles); they are only in the scene near the workshop, never together with the HQ's, and while
// the camera is outside the hall their reach is clamped to the walls (nothing lights through the cladding).
// Frame: u along the road (near-lane direction), w into the lot; group local axes x = u, z = −w.
import * as THREE from 'three';
import { MultiBuilder, MeshBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import * as L from './Layout.js';
import { modelFloor, FLOOR_TOP } from './FloorKit.js';
import { rimGeometry, makeRimMaterial, setRimMaterial, tyreGeometry } from '../customs/CustomsWheels.js';
import { tyreMaterial } from '../vehicles/TyreMaterial.js';
import { garageWallTextures, garageFloorTextures, oilSpillTexture } from '../gfx/RealTextures.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const S = L.CUSTOMS_SLAB, H = L.CUSTOMS_HALL, W2 = L.CUSTOMS_W / 2, D = L.CUSTOMS_D;
export const CG = { // layout the service (customs/CustomsService.js) and the mechanics use
  door: { u0: -H.door, u1: H.door, w: H.w0 }, tt: { u: H.tt[0], w: H.tt[1], r: H.ttR }, hall: { u0: -H.hu, u1: H.hu, w0: H.w0, w1: H.w1 },
  lift: { u: -14.5, w: 22.5 }, bench: { u: -20.4, w: 15.5 }, changer: { u: -18.6, w: 28.6 }, booth: { u0: 9.5, u1: 20.5, w0: 24.6, w1: 30.6 }, desk: { u: 16.6, w: 14.6 }, cart: { u: 5.4, w: 18.2 },
  bays: [-19.5, -16.3, -13.1], // customer parking bays (u centres) on the forecourt, w 2.4–7.6
  yard: { u0: -4, u1: 16, w0: 32.6, w1: 40 },
};
const B = (mb, u0, u1, y0, y1, w0, w1, col, o = {}) => mb.box((u0 + u1) / 2, (y0 + y1) / 2, -(w0 + w1) / 2, Math.abs(u1 - u0), Math.abs(y1 - y0), Math.abs(w1 - w0), Object.assign({ col, bottom: true }, o)); // closed underneath: inside the hall the ceiling, beams and lintels are seen from below
const cyl = (mb, u, w, y0, h, r0, r1, seg, col, caps = true) => mb.cylinder(u, y0, -w, r0, r1, h, seg, { col, caps });
function face(mb, dir, a0, a1, y0, y1, at, uv, col) { let P; if (dir === '-w') P = [[a0, y0, -at], [a1, y0, -at], [a1, y1, -at], [a0, y1, -at]]; else if (dir === '+w') P = [[a1, y0, -at], [a0, y0, -at], [a0, y1, -at], [a1, y1, -at]]; else if (dir === '-u') P = [[at, y0, -a1], [at, y0, -a0], [at, y1, -a0], [at, y1, -a1]]; else P = [[at, y0, -a0], [at, y0, -a1], [at, y1, -a1], [at, y1, -a0]]; mb.quad(P[0], P[1], P[2], P[3], uv, col); }
function aoRect(mb, u0, u1, w0, w1, pad, k, y = S + 0.004) { const dark = [k, k, k], white = [1, 1, 1]; const base = mb.vcount; const I = [[u0, w0], [u1, w0], [u1, w1], [u0, w1]], O = [[u0 - pad, w0 - pad], [u1 + pad, w0 - pad], [u1 + pad, w1 + pad], [u0 - pad, w1 + pad]];
  for (const [u, w] of I) mb.vert(u, y, -w, 0, 1, 0, 0, 0, dark); for (const [u, w] of O) mb.vert(u, y, -w, 0, 1, 0, 0, 0, white); mb.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; mb.idx.push(base + i, base + 4 + i, base + 4 + j, base + i, base + 4 + j, base + j); } }
function canvas(w, h) { if (typeof document === 'undefined') return null; const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const a = cv.getContext && cv.getContext('2d'); if (!a || !a.fillText) return null; return { cv, a }; }
const BC = '"Barlow Condensed", "Arial Narrow", sans-serif';
// sign atlas (1024 × 512): fascia (0,0,1024,160), pylon face (0,160,256,352), wall banner (256,160,768,120), bay / safety plates
const R = { fascia: [0, 0, 1024, 160], pylon: [0, 160, 256, 352], banner: [256, 160, 768, 120], hours: [256, 280, 256, 232], bay: [512, 280, 256, 116], safety: [512, 396, 256, 116], booth: [768, 280, 256, 116], recep: [768, 396, 256, 116] };
const uvOf = (r) => [r[0] / 1024, 1 - (r[1] + r[3]) / 512, (r[0] + r[2]) / 1024, 1 - r[1] / 512];
function signAtlas() {
  const c = canvas(1024, 512); if (!c) return null; const a = c.a; const OR = '#ff7a1a', CH = '#202226';
  const logo = (x, y, s) => { a.save(); a.translate(x, y); a.scale(s, s); a.strokeStyle = OR; a.lineWidth = 7; a.beginPath(); a.arc(0, 0, 40, Math.PI * 0.8, Math.PI * 2.2); a.stroke(); for (let i = 0; i < 6; i++) { const t = Math.PI * 0.8 + (i / 5) * Math.PI * 1.4; a.beginPath(); a.moveTo(Math.cos(t) * 30, Math.sin(t) * 30); a.lineTo(Math.cos(t) * 40, Math.sin(t) * 40); a.stroke(); } a.fillStyle = OR; a.beginPath(); a.moveTo(-6, 6); a.lineTo(26, -20); a.lineTo(6, 6); a.closePath(); a.fill(); a.beginPath(); a.arc(0, 4, 8, 0, Math.PI * 2); a.fill(); a.restore(); }; // original gauge mark
  const fit = (txt, x, y, maxW, font) => { a.font = font; const w = a.measureText(txt).width; if (w > maxW) { a.save(); a.translate(x, y); a.scale(maxW / w, 1); a.fillText(txt, 0, 0); a.restore(); } else a.fillText(txt, x, y); };
  // fascia: charcoal, orange rule, white letters
  { const [x, y, w, h] = R.fascia; a.fillStyle = CH; a.fillRect(x, y, w, h); a.fillStyle = OR; a.fillRect(x, y + h - 14, w, 8); logo(x + 92, y + 72, 1.05); a.fillStyle = '#ffffff'; a.textBaseline = 'middle'; a.textAlign = 'left'; fit('STREET CUSTOMS', x + 170, y + 66, 780, `700 92px ${BC}`); a.fillStyle = '#c9ccd2'; fit('PERFORMANCE  ·  PAINT  ·  WHEELS  ·  LIGHTING', x + 174, y + 128, 760, `600 30px ${BC}`); }
  // pylon face
  { const [x, y, w, h] = R.pylon; a.fillStyle = CH; a.fillRect(x, y, w, h); a.fillStyle = OR; a.fillRect(x, y + 120, w, 6); logo(x + w / 2, y + 62, 0.9); a.fillStyle = '#fff'; a.textAlign = 'center'; a.textBaseline = 'middle'; fit('STREET', x + w / 2, y + 160, 220, `700 50px ${BC}`); fit('CUSTOMS', x + w / 2, y + 206, 220, `700 50px ${BC}`);
    a.fillStyle = '#c9ccd2'; for (const [k, t] of ['PERFORMANCE', 'PAINT', 'WHEELS'].entries()) fit(t, x + w / 2, y + 252 + k * 30, 220, `600 26px ${BC}`); a.fillStyle = OR; fit('OPEN 7 DAYS', x + w / 2, y + 336, 220, `700 22px ${BC}`); }
  // wall banner (inside)
  { const [x, y, w, h] = R.banner; a.fillStyle = '#16181b'; a.fillRect(x, y, w, h); a.fillStyle = OR; a.fillRect(x, y, 12, h); a.fillStyle = '#fff'; a.textAlign = 'left'; a.textBaseline = 'middle'; fit('BUILT IN COLOMBO.  TUNED FOR THE ISLAND.', x + 36, y + 46, w - 60, `700 46px ${BC}`); a.fillStyle = '#9aa0a8'; fit('Engine  ·  Turbo  ·  Transmission  ·  Suspension  ·  Brakes  ·  Armour  ·  Exhaust', x + 38, y + 92, w - 70, `500 26px ${BC}`); }
  // opening hours
  { const [x, y, w, h] = R.hours; a.fillStyle = '#f2f2ee'; a.fillRect(x, y, w, h); a.fillStyle = CH; a.textAlign = 'center'; a.textBaseline = 'middle'; fit('STREET CUSTOMS', x + w / 2, y + 30, w - 20, `700 30px ${BC}`); a.font = `500 22px ${BC}`; const L2 = ['Mon – Sat   8.00 – 20.00', 'Sunday   9.00 – 17.00', '', 'Drive-in service bay', 'Free inspection & preview', 'Prices in Sri Lankan rupees']; L2.forEach((t, i) => a.fillText(t, x + w / 2, y + 74 + i * 26)); }
  // bay plate, safety plate, booth plate, reception plate
  const plate = (r, bg, fg, l1, l2) => { const [x, y, w, h] = r; a.fillStyle = bg; a.fillRect(x, y, w, h); a.fillStyle = fg; a.textAlign = 'center'; a.textBaseline = 'middle'; fit(l1, x + w / 2, y + h * 0.38, w - 16, `700 38px ${BC}`); if (l2) fit(l2, x + w / 2, y + h * 0.76, w - 16, `500 22px ${BC}`); };
  plate(R.bay, '#1d4fa8', '#fff', 'CUSTOMER PARKING', 'Street Customs only'); plate(R.safety, '#f2c21b', '#151515', 'AUTHORISED STAFF', 'Lifts · compressed air · paint'); plate(R.booth, '#f4f4f0', '#c8141b', 'PAINT BOOTH', 'Respirator required'); plate(R.recep, OR, '#fff', 'RECEPTION', 'Quotes · bookings · pick-up');
  const t = new THREE.CanvasTexture(c.cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function buildCustoms(site = L.CUSTOMS_SITE) {
  const g = new THREE.Group(); g.name = 'street-customs'; g.position.set(site.O[0], 0, site.O[1]); g.rotation.y = site.rotY; g.updateMatrixWorld(true);
  const mb = new MultiBuilder(); const paint = mb.get('paint'), metal = mb.get('metal'), conc = mb.get('concrete'), mark = mb.get('marking'), glass = mb.get('glass'), ao = mb.get('ao'), corr = mb.get('corrugated'), roof = mb.get('roofFlat'), gWall = mb.get('garageWall'), gFloor = mb.get('garageFloor'), deck = mb.get('garageDeck'), oilB = new MeshBuilder();
  const signs = new MultiBuilder(), sLit = signs.get('lit'), sFlat = signs.get('flat'); const ledB = new MeshBuilder();
  const colliders = [], crown = []; const col = (u0, u1, w0, w1, h, kind = 'prop', y0) => { const r = site.box(u0, u1, w0, w1); const c = { x0: r[0], x1: r[1], z0: r[2], z1: r[3], h, kind, customs: true }; if (y0 !== undefined) c.y0 = y0; colliders.push(c); return c; };
  const CH = C('#25272b'), CH2 = C('#33363b'), OR = C('#ff7a1a'), white = C('#f1f1ee'), offW = C('#e3e2dd'), steel = C('#b9bcc0'), darkS = C('#3a3d41'), black = C('#141416'), yellow = C('#f2c21b'), red = C('#b8141b'), grey = C('#8c8f92'), epoxy = C('#5c6066');
  const hu = H.hu, w0 = H.w0, w1 = H.w1, top = S + H.h, t = 0.25;

  // ---------------------------------------------------------------- ground: forecourt, hall floor, driveway crossing, ramps
  g.add(modelFloor({ kind: 'concrete', size: 6, joint: 0.024, chamfer: 0.005, colors: ['#dedbd4', '#d6d3cb', '#e3e0d9'], grout: '#6f6c66', rough: 0.85, tone: 0.035, lip: 0, wet: [0.85, 0.45], seed: 4711 }, -W2, -w0, W2, 0, S - FLOOR_TOP));
  gFloor.hrect(-hu, -w1, hu, -w0, S, 4, [1, 1, 1]); // workshop floor: worn power-floated concrete, saw cuts, tyre scrub, soaked-in oil (RealTextures.garageFloorTextures)
  for (const [u0, u1, a0, a1] of [[-W2, -hu, w0, D], [hu, W2, w0, D], [-hu, hu, w1, D]]) conc.hrect(u0, -a1, u1, -a0, S, 3, C('#d2cfc8'));
  { const c0 = -L.CUSTOMS_DRIVE_HW, c1 = L.CUSTOMS_DRIVE_HW; conc.hrect(c0, 0, c1, site.walk, S, 3.2, C('#c9c6be'));
    const yR = L.ROAD_Y + 0.004, wr = site.walk + L.CUSTOMS_RAMP; conc.quad([c0, yR, wr], [c1, yR, wr], [c1, S, site.walk], [c0, S, site.walk], [c0 / 3.2, 0, c1 / 3.2, 0.3], C('#bdb9b0'));
    for (const e of [c0, c1]) { const s = e === c0 ? -1 : 1; const P = s < 0 ? [[e, yR, wr], [e, S, site.walk], [e, L.ROAD_Y, site.walk]] : [[e, yR, wr], [e, L.ROAD_Y, site.walk], [e, S, site.walk]]; conc.quad(P[0], P[1], P[2], P[2], [0, 0, 0.3, 0.1], C('#b5b1a8')); B(paint, e - 0.06, e + 0.06, S - 0.02, S + 0.012, -site.walk, 0, C('#e8e4da')); }
    for (let x = c0 + 0.2; x < c1 - 0.1; x += 0.25) B(paint, x, x + 0.04, S - 0.004, S + 0.003, 0.4, 0.75, darkS); B(paint, c0, c1, S - 0.01, S + 0.001, 0.38, 0.77, black); }
  // markings: customer bays (left), keep-clear hatch + arrow in front of the door, a yellow walkway to reception
  for (const u of CG.bays) { for (const s of [-1.55, 1.55]) B(mark, u + s - 0.05, u + s + 0.05, S, S + 0.003, 2.2, 7.8, white); } B(mark, CG.bays[0] - 1.6, CG.bays[2] + 1.6, S, S + 0.003, 7.75, 7.85, white);
  for (let k = 0; k < 9; k++) { const u = -H.door + 0.4 + k * 0.82; mark.quad([u, S + 0.003, -(w0 - 3.2)], [u + 0.22, S + 0.003, -(w0 - 3.2)], [u + 0.62, S + 0.003, -(w0 - 0.25)], [u + 0.4, S + 0.003, -(w0 - 0.25)], [0, 0, 1, 1], yellow); }
  for (const s of [-1, 1]) B(mark, s * (H.door + 0.05) - 0.06, s * (H.door + 0.05) + 0.06, S, S + 0.003, w0 - 3.3, w0, yellow);
  { const u = 0, a = 3.4; mark.quad([u - 0.25, S + 0.003, -(a)], [u + 0.25, S + 0.003, -(a)], [u + 0.25, S + 0.003, -(a + 2.2)], [u - 0.25, S + 0.003, -(a + 2.2)], [0, 0, 1, 1], white); mark.quad([u - 0.75, S + 0.003, -(a + 2.2)], [u + 0.75, S + 0.003, -(a + 2.2)], [u, S + 0.003, -(a + 3.3)], [u, S + 0.003, -(a + 3.3)], [0, 0, 1, 1], white); }
  B(mark, 14.2, 15.2, S, S + 0.003, 0.4, w0, C('#e0b21a')); // pedestrian walkway to the reception door
  // ---- boundary: low block wall + hedge planter along the frontage (gap for the driveway), 2.2 m walls on the sides
  for (const [u0, u1] of [[-W2, -L.CUSTOMS_DRIVE_HW - 0.2], [L.CUSTOMS_DRIVE_HW + 0.2, 13.6], [15.8, W2]]) { B(conc, u0, u1, S, S + 0.55, 0.05, 0.35, C('#cfcac0')); B(paint, u0, u1, S + 0.55, S + 0.6, 0.02, 0.38, CH); col(u0, u1, 0.05, 0.35, 0.6); }
  for (const s of [-1, 1]) { const u = s * (W2 - 0.12); B(conc, u - 0.12, u + 0.12, S, S + 2.2, 0.05, w0, C('#d6d1c6')); B(paint, u - 0.15, u + 0.15, S + 2.2, S + 2.28, 0.05, w0, CH); col(u - 0.13, u + 0.13, 0.05, w0, 2.3, 'wall'); }

  // ---------------------------------------------------------------- the hall shell
  // walls: charcoal ribbed cladding outside (corrugated), white lining inside, orange accent band at the eaves
  const wallSeg = (u0, u1, a0, a1) => { B(corr, u0, u1, S, top, a0, a1, CH2, { uvScale: 0.5 }); };
  wallSeg(-hu, -H.door, w0, w0 + t); wallSeg(H.door, hu, w0, w0 + t); B(corr, -H.door, H.door, S + H.doorH, top, w0, w0 + t, CH2); // front with the roller-door opening
  wallSeg(-hu, hu, w1 - t, w1); wallSeg(-hu, -hu + t, w0, w1); wallSeg(hu - t, hu, w0, w1);
  const LH = top - S; B(gWall, -hu + t, hu - t, S, top, w1 - t - 0.02, w1 - t, [1, 1, 1], { uvScale: LH }); B(gWall, -hu + t, -hu + t + 0.02, S, top, w0 + t, w1 - t, [1, 1, 1], { uvScale: LH }); B(gWall, hu - t - 0.02, hu - t, S, top, w0 + t, w1 - t, [1, 1, 1], { uvScale: LH }); // inner lining, floor to deck: painted block, grimy (RealTextures.garageWallTextures: one tile = this height)
  for (const [u0, u1] of [[-hu + t, -H.door], [H.door, hu - t]]) B(gWall, u0, u1, S, top, w0 + t, w0 + t + 0.02, [1, 1, 1], { uvScale: top - S });
  B(paint, -H.door, H.door, S + H.doorH + 0.65, top, w0 + t, w0 + t + 0.02, C('#5b5853')); // over the door, inside (above the drum housing)
    B(paint, -hu - 0.02, hu + 0.02, top - 0.55, top - 0.25, w0 - 0.03, w0, OR); for (const s of [-1, 1]) B(paint, s * hu - 0.03 * s, s * hu, top - 0.55, top - 0.25, w0, w1, OR); // orange eaves band
  B(roof, -hu - 0.1, hu + 0.1, top, top + 0.3, w0 - 0.1, w1 + 0.1, C('#9a9790')); B(paint, -hu - 0.1, hu + 0.1, top + 0.3, top + 0.75, w0 - 0.1, w0 + 0.1, CH); // roof slab + front parapet
  B(deck, -hu + t, hu - t, top - 0.04, top, w0 + t, w1 - t, C('#8d9093'), { uvScale: 0.6 }); // ceiling: the underside of the profiled steel roof deck (closed: no sky through the hall)
  for (let k = 0; k < 6; k++) { const w = w0 + t + 0.4 + k * ((w1 - w0 - 2 * t - 0.8) / 5); B(metal, -hu + t, hu - t, top - 0.62, top - 0.54, w - 0.05, w + 0.05, C('#5a5e63')); } // purlins
  for (let k = 0; k <= 8; k++) { const u = -hu + 1.2 + k * ((2 * hu - 2.4) / 8); B(metal, u - 0.1, u + 0.1, top - 0.5, top - 0.02, w0 + t, w1 - t, C('#4c5056')); B(metal, u - 0.16, u + 0.16, top - 0.52, top - 0.48, w0 + t, w1 - t, C('#4c5056')); } // roof steel
  // high glazing band on the front (frosted), mullions
  for (const [u0, u1] of [[-hu + 1, -H.door - 1], [H.door + 1, hu - 1]]) { B(glass, u0, u1, S + 5.3, S + 6.6, w0 - 0.02, w0 + t + 0.02, white); for (let u = u0; u <= u1 + 0.01; u += (u1 - u0) / 6) B(metal, u - 0.04, u + 0.04, S + 5.25, S + 6.65, w0 - 0.05, w0 + t + 0.05, CH); B(metal, u0, u1, S + 5.22, S + 5.3, w0 - 0.06, w0 + t + 0.06, CH); B(metal, u0, u1, S + 6.6, S + 6.68, w0 - 0.06, w0 + t + 0.06, CH); }
  // roller door: rolled up in its drum housing above the opening, guide rails down the jambs, yellow/black jamb guards
  B(metal, -H.door - 0.2, H.door + 0.2, S + H.doorH, S + H.doorH + 0.65, w0 + t + 0.02, w0 + t + 0.62, C('#6d7174')); /* drum housing, inside above the opening */ for (const s of [-1, 1]) { B(metal, s * H.door - 0.09, s * H.door + 0.09, S, S + H.doorH, w0 + t - 0.02, w0 + t + 0.14, steel); /* guide rail */ for (let k = 0; k < 6; k++) B(paint, s * (H.door + 0.12) - 0.1, s * (H.door + 0.12) + 0.1, S + k * 0.2, S + k * 0.2 + 0.2, w0 - 0.22, w0 - 0.02, k % 2 ? black : yellow); }
  // reception glass door (pedestrians) on the front right + canopy
  { const u0 = 13.9, u1 = 15.5; B(glass, u0, u1, S, S + 2.4, w0 - 0.02, w0 + t + 0.02, white); B(metal, u0 - 0.06, u1 + 0.06, S + 2.4, S + 2.5, w0 - 0.04, w0 + t + 0.04, CH); for (const u of [u0, (u0 + u1) / 2, u1]) B(metal, u - 0.04, u + 0.04, S, S + 2.4, w0 - 0.04, w0 + t + 0.04, CH); B(paint, u0 - 0.6, u1 + 0.6, S + 2.75, S + 2.9, w0 - 1.3, w0, CH); }
  // fascia sign over the door + small sign plates
  face(sLit, '-w', -8.5, 8.5, S + 5.7, S + 7.1, w0 - 0.07, uvOf(R.fascia)); B(paint, -8.6, 8.6, S + 5.6, S + 7.2, w0 - 0.06, w0, C('#191a1d'));
  face(sFlat, '-w', 16.2, 17.6, S + 1.4, S + 2.67, w0 - 0.02, uvOf(R.hours)); face(sFlat, '-w', 13.2, 16.2, S + 2.95, S + 3.45, w0 - 0.02, uvOf(R.recep));
  face(sFlat, '-w', -20.8, -18.3, S + 2.4, S + 3.5, w0 - 0.02, uvOf(R.bay)); face(sFlat, '-w', 4.2, 6.2, S + 1.5, S + 2.4, w0 - 0.02, uvOf(R.safety));
  // colliders: wall pieces (door opening left free; a lintel above it), roof
  col(-hu, -H.door, w0, w0 + t, H.h + 0.75, 'building'); col(H.door, 13.85, w0, w0 + t, H.h + 0.75, 'building'); col(15.55, hu, w0, w0 + t, H.h + 0.75, 'building'); col(-H.door, H.door, w0 - 0.55, w0 + t, H.h - H.doorH + 0.75, 'building', S + H.doorH);
  col(13.85, 15.55, w0, w0 + t, H.h - 2.5, 'building', S + 2.5); // over the reception door (the door itself opens for pedestrians: it is glass, walk-through)
  col(-hu, hu, w1 - t, w1, H.h, 'building'); col(-hu, -hu + t, w0, w1, H.h, 'building'); col(hu - t, hu, w0, w1, H.h, 'building'); col(-hu, hu, w0, w1, 0.4, 'building', top);
  { const r = site.box(-hu, hu, w0, w1); crown.push([r[0] - 1.2, r[1] + 1.2, r[2] - 1.2, r[3] + 1.2, top + 1.6]); const p = site.box(-18, -16.4, 0.7, 1.5); crown.push([p[0] - 1, p[1] + 1, p[2] - 1, p[3] + 1, S + 7.2]); }

  // ---------------------------------------------------------------- turntable + preview light rig
  const TT = CG.tt; const ttMb = new MeshBuilder(); { const n = 72, rr = TT.r; const base = ttMb.vcount; ttMb.vert(0, 0, 0, 0, 1, 0, 1.15, 1.15, C('#8c8a85'));
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; ttMb.vert(Math.cos(a) * rr, 0, Math.sin(a) * rr, 0, 1, 0, 1.15 + Math.cos(a) * 1.15, 1.15 + Math.sin(a) * 1.15, /* uv ×2.3: the grime texture at its real 4 m scale */ C(i % 12 < 6 ? '#908e88' : '#86847e')); }
    for (let i = 0; i < n; i++) ttMb.idx.push(base, base + 2 + i, base + 1 + i);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const ca = Math.cos(a), sa = Math.sin(a); ttMb.quad([ca * 0.6 - sa * 0.012, 0.002, sa * 0.6 + ca * 0.012], [ca * rr * 0.97 - sa * 0.012, 0.002, sa * rr * 0.97 + ca * 0.012], [ca * rr * 0.97 + sa * 0.012, 0.002, sa * rr * 0.97 - ca * 0.012], [ca * 0.6 + sa * 0.012, 0.002, sa * 0.6 - ca * 0.012], [0, 0, 1, 1], C('#2e3135')); } // plate seams
    for (const r0 of [0.6, rr * 0.55]) for (let i = 0; i < 48; i++) { const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2; ttMb.quad([Math.cos(a0) * r0, 0.002, Math.sin(a0) * r0], [Math.cos(a1) * r0, 0.002, Math.sin(a1) * r0], [Math.cos(a1) * (r0 + 0.025), 0.002, Math.sin(a1) * (r0 + 0.025)], [Math.cos(a0) * (r0 + 0.025), 0.002, Math.sin(a0) * (r0 + 0.025)], [0, 0, 1, 1], C('#2e3135')); } }
  const ttGeo = ttMb.build(); const FT = garageFloorTextures(), ttFT = FT; /* worn steel plate: the shop floor's grime / tyre scuffs / oil over dark steel, low sky reflection (MAT.metal mirrored the outdoor sky blue indoors) */
  const ttMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: ttFT ? ttFT.map : null, roughnessMap: ttFT ? ttFT.rough : null, normalMap: ttFT ? ttFT.normal : null, normalScale: new THREE.Vector2(0.5, 0.5), color: 0xb2b0aa, metalness: 0.22, roughness: 0.8, envMapIntensity: 0.2 }); ttMat.name = 'customs-turntable';
  const turntable = new THREE.Mesh(ttGeo, ttMat); turntable.name = 'customs-turntable'; turntable.position.set(TT.u, S + 0.004, -TT.w); turntable.receiveShadow = true; turntable.castShadow = false; g.add(turntable);
  for (let i = 0; i < 64; i++) { const a0 = (i / 64) * Math.PI * 2, a1 = ((i + 1) / 64) * Math.PI * 2, r0 = TT.r, r1 = TT.r + 0.12; paint.quad([TT.u + Math.cos(a0) * r0, S + 0.003, -TT.w + Math.sin(a0) * r0], [TT.u + Math.cos(a1) * r0, S + 0.003, -TT.w + Math.sin(a1) * r0], [TT.u + Math.cos(a1) * r1, S + 0.003, -TT.w + Math.sin(a1) * r1], [TT.u + Math.cos(a0) * r1, S + 0.003, -TT.w + Math.sin(a0) * r1], [0, 0, 1, 1], i % 2 ? yellow : black); } // hazard ring
  { const y = top - 1.25, a = 3.7; for (const s of [-1, 1]) { B(metal, TT.u - a, TT.u + a, y - 0.12, y + 0.12, TT.w + s * a - 0.12, TT.w + s * a + 0.12, C('#2a2c30')); B(metal, TT.u + s * a - 0.12, TT.u + s * a + 0.12, y - 0.12, y + 0.12, TT.w - a, TT.w + a, C('#2a2c30')); } // truss square
    for (const [du, dw] of [[-a, -a], [a, -a], [-a, a], [a, a]]) B(metal, TT.u + du - 0.015, TT.u + du + 0.015, y + 0.12, top - 0.5, TT.w + dw - 0.015, TT.w + dw + 0.015, grey); // hangers
    for (let k = -2; k <= 2; k++) { ledB.box(TT.u + k * 1.4, y - 0.15, -TT.w, 0.32, 0.04, 6.6, { col: [1, 1, 1] }); B(metal, TT.u + k * 1.4 - 0.2, TT.u + k * 1.4 + 0.2, y - 0.13, y - 0.05, TT.w - 3.35, TT.w + 3.35, C('#1d1f22')); } }
  // other ceiling lights (LED battens over the work areas)
  for (const [u, w] of [[-15, 16], [-15, 26.5], [15, 16], [15, 27], [-6.5, 15], [6.5, 15], [-6.5, 28], [6.5, 28]]) { ledB.box(u, top - 0.85, -w, 2.4, 0.05, 0.18, { col: [1, 1, 1] }); B(metal, u - 1.25, u + 1.25, top - 0.83, top - 0.78, w - 0.12, w + 0.12, C('#d0d2d4')); B(metal, u - 0.01, u + 0.01, top - 0.78, top - 0.5, w - 0.01, w + 0.01, grey); }
  face(sFlat, '+w', -8, 8, S + 4.1, S + 5.4, w1 - t - 0.04, uvOf(R.banner)); // back-wall banner, seen from the turntable

  // ---------------------------------------------------------------- left: lift with a car body frame, cabinets, bench, tyre gear
  { const { u, w } = CG.lift; for (const s of [-1, 1]) { const pu = u + s * 1.75; B(paint, pu - 0.18, pu + 0.18, S, S + 3.9, w - 0.18, w + 0.18, C('#1e4fa0')); B(metal, pu - 0.3, pu + 0.3, S, S + 0.04, w - 0.3, w + 0.3, darkS); B(paint, pu - 0.2, pu + 0.2, S + 3.9, S + 4.0, w - 0.2, w + 0.2, CH); col(pu - 0.3, pu + 0.3, w - 0.3, w + 0.3, 4.0);
      for (const dw of [-1, 1]) { const y = S + 1.55; B(metal, pu - s * 0.15 - 0.05, pu - s * 1.05 + 0.05, y, y + 0.08, w + dw * 0.9 - 0.06, w + dw * 0.9 + 0.06, C('#2c2f33')); B(paint, pu - s * 1.05 - 0.12, pu - s * 1.05 + 0.12, y + 0.08, y + 0.14, w + dw * 0.9 - 0.12, w + dw * 0.9 + 0.12, C('#d0b31a')); } }
    B(metal, u - 1.75, u + 1.75, S + 3.92, S + 3.98, w - 0.08, w + 0.08, darkS); face(sFlat, '-w', u - 1.1, u + 1.1, S + 2.3, S + 3.2, w - 0.21, uvOf(R.safety)); aoRect(ao, u - 2.2, u + 2.2, w - 1.9, w + 1.9, 0.6, 0.72); }
  for (let k = 0; k < 4; k++) { const w = 13.6 + k * 1.2; B(paint, -hu + t + 0.02, -hu + t + 0.72, S + 0.1, S + 1.05, w - 0.55, w + 0.55, red); for (let d = 0; d < 6; d++) B(metal, -hu + t + 0.72, -hu + t + 0.73, S + 0.2 + d * 0.14, S + 0.24 + d * 0.14, w - 0.45, w + 0.45, steel); B(paint, -hu + t + 0.02, -hu + t + 0.76, S + 1.05, S + 1.1, w - 0.57, w + 0.57, C('#1a1a1c')); for (const dw of [-0.45, 0.45]) cyl(metal, -hu + t + 0.37, w + dw, S, 0.1, 0.05, 0.05, 8, black); }
  col(-hu + t, -hu + t + 0.78, 13, 18.4, 1.1);
  { const { u, w } = CG.bench; B(paint, -hu + t + 0.02, -hu + t + 0.82, S + 0.92, S + 0.97, w + 3.4, w + 5.8, C('#8a6a44')); for (const dw of [3.5, 5.7]) B(metal, -hu + t + 0.1, -hu + t + 0.16, S, S + 0.92, w + dw - 0.03, w + dw + 0.03, darkS); B(paint, -hu + t + 0.02, -hu + t + 0.05, S + 1.2, S + 2.4, w + 3.4, w + 5.8, C('#3d4045')); for (let i = 0; i < 9; i++) B(metal, -hu + t + 0.05, -hu + t + 0.07, S + 1.4 + (i % 3) * 0.33, S + 1.5 + (i % 3) * 0.33, w + 3.6 + (i / 3 | 0) * 0.7, w + 3.66 + (i / 3 | 0) * 0.7, steel); col(-hu + t, -hu + t + 0.85, w + 3.4, w + 5.8, 1.0); void u; } // pegboard with tools
  { const { u, w } = CG.changer; B(paint, u - 0.45, u + 0.45, S, S + 0.95, w - 0.4, w + 0.4, red); cyl(metal, u, w, S + 0.95, 0.06, 0.4, 0.4, 20, darkS); B(metal, u + 0.32, u + 0.42, S + 0.95, S + 1.75, w - 0.05, w + 0.05, darkS); B(metal, u - 0.1, u + 0.42, S + 1.68, S + 1.75, w - 0.04, w + 0.04, darkS); col(u - 0.5, u + 0.5, w - 0.45, w + 0.45, 1.75);
    const bu = u + 2.2; B(paint, bu - 0.4, bu + 0.4, S, S + 1.0, w - 0.35, w + 0.35, C('#2a2c30')); cyl(metal, bu + 0.42, w, S + 0.62, 0.02, 0.05, 0.05, 8, steel); B(paint, bu - 0.42, bu + 0.42, S + 1.0, S + 1.35, w - 0.38, w - 0.36, C('#1a1b1e')); col(bu - 0.45, bu + 0.5, w - 0.4, w + 0.4, 1.35); }
  // tyre rack along the back wall (left), real tyre geometry stacked
  const tyreSlots = []; for (let k = 0; k < 20; k++) for (let r = 0; r < 2; r++) tyreSlots.push([-hu + 1.45 + k * 0.315, S + 0.455 + r * 0.95, w1 - t - 0.4]); // standing on the two shelves, tread to the room
  { for (let k = 0; k <= 1; k++) B(metal, -hu + 1.2, -hu + 7.8, S + 0.08 + k * 0.95, S + 0.12 + k * 0.95, w1 - t - 0.75, w1 - t - 0.05, darkS); for (const u of [-hu + 1.2, -hu + 4.5, -hu + 7.8]) B(metal, u - 0.03, u + 0.03, S, S + 2.0, w1 - t - 0.75, w1 - t - 0.05, darkS); col(-hu + 1.1, -hu + 7.9, w1 - t - 0.8, w1 - t, 2.0); }

  // ---------------------------------------------------------------- right: rim wall, paint booth, reception, diagnostics cart
  const rimRow = []; for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) rimRow.push([hu - t - 0.08, S + 1.0 + r * 0.95, 13.8 + k * 1.05, (r * 6 + k) % 7]);
  B(paint, hu - t - 0.06, hu - t - 0.02, S + 0.45, S + 3.35, 13.2, 20.2, C('#1b1c1f')); for (const [u, y, w] of rimRow) { B(metal, hu - t - 0.36, u, y - 0.025, y + 0.025, w - 0.025, w + 0.025, steel); B(paint, hu - t - 0.07, hu - t - 0.05, y - 0.06, y + 0.06, w - 0.06, w + 0.06, darkS); } // wall pegs through the centre bores col(hu - t - 0.35, hu - t, 13.2, 20.2, 3.4);
  { const b = CG.booth; B(paint, b.u0, b.u1, S, S + 3.4, b.w1 - 0.1, b.w1, white); for (const u of [b.u0, b.u1]) B(paint, u - 0.05, u + 0.05, S, S + 3.4, b.w0, b.w1, white); B(paint, b.u0, b.u1, S + 3.4, S + 3.7, b.w0, b.w1, C('#e9e9e6'));
    for (let k = 0; k < 4; k++) { const u0 = b.u0 + 0.15 + k * ((b.u1 - b.u0 - 0.3) / 4); B(glass, u0 + 0.04, u0 + (b.u1 - b.u0 - 0.3) / 4 - 0.04, S + 0.25, S + 3.3, b.w0 - 0.02, b.w0 + 0.02, white); B(metal, u0 - 0.03, u0 + 0.03, S, S + 3.4, b.w0 - 0.04, b.w0 + 0.04, CH); }
    B(metal, b.u0, b.u1, S, S + 0.25, b.w0 - 0.04, b.w0 + 0.04, CH); B(metal, b.u0, b.u1, S + 3.3, S + 3.4, b.w0 - 0.04, b.w0 + 0.04, CH); face(sFlat, '-w', (b.u0 + b.u1) / 2 - 1, (b.u0 + b.u1) / 2 + 1, S + 2.6, S + 3.1, b.w0 - 0.05, uvOf(R.booth));
    for (let k = 0; k < 3; k++) ledB.box((b.u0 + b.u1) / 2 + (k - 1) * 3, S + 3.38, -(b.w0 + b.w1) / 2, 2.4, 0.03, 4.6, { col: [1, 1, 1] }); for (let k = 0; k < 8; k++) B(metal, b.u0 + 0.5 + k * 1.3, b.u0 + 1.4 + k * 1.3, S + 0.02, S + 0.04, b.w0 + 0.6, b.w1 - 0.6, darkS); // floor grating
    col(b.u0 - 0.05, b.u1 + 0.05, b.w0 - 0.05, b.w0 + 0.05, 3.7, 'wall'); col(b.u0 - 0.05, b.u0 + 0.05, b.w0, b.w1, 3.7, 'wall'); col(b.u1 - 0.05, b.u1 + 0.05, b.w0, b.w1, 3.7, 'wall'); }
  { const { u, w } = CG.desk; B(paint, u - 1.9, u + 1.9, S, S + 1.05, w - 0.35, w + 0.35, C('#f0efea')); B(paint, u - 1.95, u + 1.95, S + 1.05, S + 1.1, w - 0.4, w + 0.4, CH); B(paint, u - 1.9, u + 1.9, S + 0.15, S + 0.2, w - 0.36, w - 0.35, OR);
    B(paint, u - 0.3, u + 0.3, S + 1.1, S + 1.45, w + 0.05, w + 0.08, C('#101114')); B(paint, u - 0.04, u + 0.04, S + 1.1, S + 1.22, w + 0.1, w + 0.18, darkS); col(u - 1.95, u + 1.95, w - 0.4, w + 0.4, 1.1);
    B(paint, 9.4, 11.6, S, S + 0.42, w0 + t + 0.1, w0 + t + 0.95, C('#2c2e33')); B(paint, 9.4, 11.6, S + 0.42, S + 0.85, w0 + t + 0.1, w0 + t + 0.28, C('#2c2e33')); for (const u2 of [9.4, 11.45]) B(paint, u2, u2 + 0.15, S + 0.42, S + 0.62, w0 + t + 0.1, w0 + t + 0.95, C('#2c2e33')); col(9.4, 11.6, w0 + t + 0.1, w0 + t + 0.95, 0.85); void u; } // counter + monitor; waiting sofa against the front wall
  { const { u, w } = CG.cart; B(paint, u - 0.35, u + 0.35, S + 0.12, S + 0.95, w - 0.28, w + 0.28, C('#2a2c30')); for (const [du, dw] of [[-0.28, -0.22], [0.28, -0.22], [-0.28, 0.22], [0.28, 0.22]]) cyl(metal, u + du, w + dw, S, 0.12, 0.05, 0.05, 8, black);
    B(paint, u - 0.3, u + 0.3, S + 0.95, S + 1.35, w - 0.04, w + 0.0, C('#0f1012')); B(metal, u - 0.03, u + 0.03, S + 0.95, S + 1.0, w, w + 0.1, darkS); col(u - 0.38, u + 0.38, w - 0.3, w + 0.3, 1.35); }
  // ---------------------------------------------------------------- the yard behind the hall: shipping container, tyre stacks, wall
  { const Y = CG.yard; B(corr, Y.u0 + 0.4, Y.u0 + 6.5, S, S + 2.6, Y.w0 + 0.6, Y.w0 + 3.04, C('#a0421c'), { uvScale: 0.6 }); B(paint, Y.u0 + 0.4, Y.u0 + 6.5, S + 2.6, S + 2.62, Y.w0 + 0.6, Y.w0 + 3.04, C('#8a3816')); col(Y.u0 + 0.4, Y.u0 + 6.5, Y.w0 + 0.6, Y.w0 + 3.04, 2.6);
    for (const s of [Y.u0, Y.u1]) { B(conc, s - 0.12, s + 0.12, S, S + 2.2, w1, Y.w1, C('#d6d1c6')); col(s - 0.12, s + 0.12, w1, Y.w1, 2.2, 'wall'); } B(conc, Y.u0, Y.u1, S, S + 2.2, Y.w1 - 0.24, Y.w1, C('#d6d1c6')); col(Y.u0, Y.u1, Y.w1 - 0.24, Y.w1, 2.2, 'wall');
    conc.hrect(Y.u0, -Y.w1, Y.u1, -w1, S, 3, C('#cfcbc3')); }
  const yardTyres = []; for (let k = 0; k < 3; k++) for (let h = 0; h < 4; h++) yardTyres.push([CG.yard.u0 + 9 + k * 1.0, S + 0.12 + h * 0.235, CG.yard.w0 + 2.2 + (k % 2) * 0.3]);

  // ---------------------------------------------------------------- pylon at the kerb
  { const u = -17.2, w = 1.1; B(paint, u - 0.75, u + 0.75, S, S + 0.5, w - 0.4, w + 0.4, C('#c8c3b8')); B(paint, u - 0.62, u + 0.62, S + 0.5, S + 6.4, w - 0.24, w + 0.24, CH); B(paint, u - 0.64, u + 0.64, S + 6.4, S + 6.55, w - 0.26, w + 0.26, OR);
    face(sLit, '-w', u - 0.56, u + 0.56, S + 1.6, S + 6.15, w - 0.245, uvOf(R.pylon)); face(sLit, '+w', u - 0.56, u + 0.56, S + 1.6, S + 6.15, w + 0.245, uvOf(R.pylon)); col(u - 0.75, u + 0.75, w - 0.4, w + 0.4, 6.55); }

  // ---------------------------------------------------------------- meshes
  // workshop surfaces (35th request): grimy painted block, oil-stained concrete, the grey steel deck; plain-colour fallbacks in Node
  const WT = garageWallTextures(top - S); // FT (floor textures) made once above, shared with the turntable
  const wallMat = new THREE.MeshStandardMaterial({ envMapIntensity: 0.4, map: WT ? WT.map : null, normalMap: WT ? WT.normal : null, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: WT ? WT.rough : null, roughness: 1, color: WT ? 0xffffff : 0x9c978e, vertexColors: true }); wallMat.name = 'customs-wall';
  const floorMat = new THREE.MeshStandardMaterial({ envMapIntensity: 0.25, map: FT ? FT.map : null, normalMap: FT ? FT.normal : null, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: FT ? FT.rough : null, roughness: 1, color: FT ? 0xffffff : 0x6f6b64, vertexColors: true }); floorMat.name = 'customs-floor';
  const deckMat = MAT.corrugated ? MAT.corrugated : MAT.metal;
  const mats = Object.assign({}, MAT, { garageWall: wallMat, garageFloor: floorMat, garageDeck: deckMat });
  for (const m of mb.toMeshes(mats, { cast: true, receive: true })) { if (m.name === 'garageFloor') m.castShadow = false; if (m.name === 'ao') { m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1; } if (m.name === 'marking' || m.name === 'glass') m.castShadow = false; g.add(m); }
  const atlas = signAtlas(); const signLit = new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.45, color: atlas ? 0xffffff : 0x303236, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const signFlat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.55, color: atlas ? 0xffffff : 0xdddddd, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const m of signs.toMeshes({ lit: signLit, flat: signFlat }, { cast: false, receive: true })) g.add(m);
  { const spills = [[CG.lift.u - 0.6, CG.lift.w + 0.3, 1.5, 0.3], [CG.lift.u + 0.9, CG.lift.w - 0.8, 0.7, 1.9], [-2.2, H.w0 + 3.6, 1.1, 2.6], [1.6, H.w0 + 6.2, 0.6, 0.9], [CG.changer.u + 1.4, CG.changer.w - 1.6, 0.9, 4.1], [-19.6, 25.4, 1.3, 5.2], [8.2, 27.6, 0.8, 3.3], [-9.5, 19.5, 0.55, 0.4], [CG.tt.u + 5.4, CG.tt.w + 1.8, 0.7, 2.2], [-15.6, 28.9, 1.0, 1.0]];
    for (const [u, w, r, a] of spills) { const ca = Math.cos(a) * r, sa = Math.sin(a) * r; const y = S + 0.003; oilB.quad([u - ca + sa, y, -(w - sa - ca)], [u + ca + sa, y, -(w + sa - ca)], [u + ca - sa, y, -(w + sa + ca)], [u - ca - sa, y, -(w - sa + ca)], [0, 0, 1, 1], [1, 1, 1]); }
    const ot = oilSpillTexture(); const og = oilB.build(); if (og && ot) { const om = new THREE.MeshStandardMaterial({ map: ot, transparent: true, depthWrite: false, roughness: 0.3, metalness: 0, envMapIntensity: 0.06, color: 0xd8d8d8, /* indoors: the env map is the outdoor sky — it made the pools glow blue */ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); om.name = 'customs-oil';
      const m = new THREE.Mesh(og, om); m.name = 'customs-oil'; m.castShadow = false; m.receiveShadow = true; m.renderOrder = 2; m.matrixAutoUpdate = false; m.updateMatrix(); g.add(m); } }
  const led = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, emissive: 0xf4f8ff, emissiveIntensity: 1.6, roughness: 0.3 }); led.name = 'customs-led'; const ledG = ledB.build(); if (ledG) { const m = new THREE.Mesh(ledG, led); m.name = 'customsLED'; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); g.add(m); }
  // real wheel geometry on the rim wall, the tyre rack and the yard stacks (merged: one mesh per material)
  const rimMats = [makeRimMaterial(), makeRimMaterial()]; setRimMaterial(rimMats[0], '#c9ccd0', 'chrome'); setRimMaterial(rimMats[1], '#1a1b1d', 'paint');
  const DES = ['split5', 'mesh', 'multi10', 'dish', 'turbine', 'y6', 'mono7']; const rimB = [new MeshBuilder(), new MeshBuilder()]; const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(1, 1, 1);
  const place = (mbx, geo, u, y, w, rotY) => mbx.geometry(geo, M4.compose(V.set(u, y, -w), Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), SC), null);
  rimRow.forEach(([u, y, w, d], i) => { const geo = rimGeometry(DES[d], 0.34, 0.22, 0.72, 'car', true, false); place(rimB[i % 3 === 1 ? 1 : 0], geo, u - 0.12, y, w, Math.PI); });
  // tyres: one instanced mesh of the real tyre geometry (the tyre shader works in the tyre's own space, so no merging)
  const tyG = tyreGeometry(0.33, 0.21, 0.66, 'sport', false, false); const tyAll = tyreSlots.map(([u, y, w]) => [u, y, w, 0]).concat(yardTyres.map(([u, y, w]) => [u, y, w, 1]));
  const tyres = new THREE.InstancedMesh(tyG, tyreMaterial(tyG, 0), tyAll.length); tyres.name = 'customs-tyres'; tyres.castShadow = true; tyres.receiveShadow = true;
  tyAll.forEach(([u, y, w, flat], i) => tyres.setMatrixAt(i, M4.compose(V.set(u, y, -w), flat ? Q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2) : Q.identity(), SC))); tyres.instanceMatrix.needsUpdate = true; tyres.computeBoundingSphere(); g.add(tyres);
  rimB.forEach((b, i) => { const geo = b.build(); if (!geo) return; const m = new THREE.Mesh(geo, rimMats[i]); m.name = 'customs-rims'; m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); g.add(m); });
  // roller door (35th request: it opens as the player drives up, see CustomsService.doorTarget): 56 galvanised slats on a curtain that
  // rolls up into the drum — it is lifted and clipped at the head of the opening (a world-space clip plane on its own material), so
  // the rising curtain disappears into the housing exactly like a real one. A collider closes the bay while the door is down.
  const doorG = new THREE.Group(); doorG.name = 'customs-door'; doorG.position.set(0, S + H.doorH, -(w0 + t + 0.07)); g.add(doorG);
  const dB = new MeshBuilder(); const DP = 0.09, nSl = Math.ceil(H.doorH / DP) + 1, dw = 2 * H.door + 0.14;
  for (let k = 0; k < nSl; k++) { const y = -(k + 0.5) * DP; const sh = k % 2 ? [0.93, 0.93, 0.93] : [1, 1, 1]; dB.box(0, y + 0.012, 0, dw, DP * 0.55, 0.03, { col: sh, bottom: true }); dB.box(0, y - 0.025, 0.006, dw, DP * 0.42, 0.024, { col: [sh[0] * 0.8, sh[1] * 0.8, sh[2] * 0.8], bottom: true }); }
  dB.box(0, -H.doorH + 0.04, 0, dw, 0.08, 0.07, { col: [0.32, 0.33, 0.34], bottom: true }); // bottom rail + seal
  const clipDoor = new THREE.Plane(new THREE.Vector3(0, -1, 0), S + H.doorH - 0.02);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0xa9adb0, metalness: 0.5, roughness: 0.48, vertexColors: true, clippingPlanes: [clipDoor], side: THREE.DoubleSide }); doorMat.name = 'customs-door';
  const doorMesh = new THREE.Mesh(dB.build(), doorMat); doorMesh.name = 'customs-door'; doorMesh.castShadow = true; doorMesh.receiveShadow = true; doorG.add(doorMesh);
  const doorCol = col(-H.door, H.door, w0 - 0.05, w0 + t + 0.15, H.doorH, 'wall', S); let doorOpen = -1;
  const setDoor = (k) => { k = Math.max(0, Math.min(1, k)); if (k === doorOpen) return; doorOpen = k; doorMesh.position.y = k * (H.doorH + 0.1); doorMesh.visible = k < 0.999; doorMesh.updateMatrix();
    if (k > 0.94) doorCol.h = 0; else { doorCol.y0 = S + H.doorH * k; doorCol.h = H.doorH * (1 - k); } }; // raised edge: a car fits under once it is high enough (the service waits for fully open anyway)
  setDoor(0);
  // lights: six shadowless points (see header); their group is shown / hidden by the service with the distance rule
  const lights = new THREE.Group(); lights.name = 'customs-lights'; lights.visible = false; g.add(lights); const lightList = [];
  for (const [u, w, i] of [[0, 21.5, 26], [-13, 17, 16], [-13, 27, 16], [13, 17, 16], [13, 27.5, 16], [0, 14.6, 12]]) { const l = new THREE.PointLight(0xfff4e6, i, 18, 1.5); l.position.set(u, top - 1.6, -w); l.userData.wallD = Math.min(w - w0, w1 - w, hu - Math.abs(u)); l.userData.base = i; lights.add(l); lightList.push(l); }
  g.updateMatrixWorld(true);
  // world-space helpers for the service
  const toWorld = (u, w) => site.toWorld(u, w);
  return { site, group: g, colliders, crownBoxes: crown, turntable, lights, lightList, mats: { led, signLit, rim: rimMats, wall: wallMat, floor: floorMat }, toWorld, setDoor, get doorOpen() { return doorOpen; }, doorCol,
    insideHall: (x, z) => { const [u, w] = site.toLocal(x, z); return Math.abs(u) < hu - t && w > w0 + t && w < w1 - t; },
    update(night, camInside, dt = 0.016) { signLit.emissiveIntensity = 0.15 + night * 1.0; this.inK = (this.inK ?? (camInside ? 1 : 0)) + ((camInside ? 1 : 0) - (this.inK ?? 0)) * Math.min(1, dt * 4); const k = this.inK; for (const l of lightList) { const dw = Math.max(1.5, l.userData.wallD + 0.3); l.distance = dw + (18 - dw) * k; } } }; // reach eases with the camera crossing the door line (no pop)
}
