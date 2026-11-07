// Ambulance kit for the van body: the free national pre-hospital ambulance (hotline 1990, "Suwa Seriya") is a white
// high-roof van with green livery. This is an original, unbadged model — no manufacturer badge, no Red Cross emblem
// (protected symbol); the medical mark is the blue Star of Life. Lettering is trilingual (English / Sinhala / Tamil):
// AMBULANCE · ගිලන් රථ · நோயாளர் காவு வண்டி.
//  - addAmbulanceKit(m, T): static geometry (frosted rear-compartment windows, green bands, decals, light bars, corner lamps)
//  - buildAmbRear(): runtime twin rear doors (hinged at the rear corners) + the lit cabin interior seen when they open
import { doorGapsMeta, spansOutside } from './DoorSpans.js';
import * as THREE from 'three';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const AMB_GREEN = '#1f8a3c';
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// van body numbers (VehicleModels P.van): greenhouse 1.10 → 1.91, glass half width 0.9W → 0.86W, rear face z −2.36
export const AMB = { rearZ: -2.36, doorZ: -2.395, doorX: 0.66, doorY0: 0.53, doorY1: 1.9, bandY: [0.65, 0.77], thinY: [0.5575, 0.5825], panelZ: [-2.29, 0.72] };

// Star of Life: three blue bars at 60° with a white edge and the white staff + serpent in the middle
function starOfLife(g, cx, cy, s) {
  g.save(); g.translate(cx, cy);
  const bar = (fill, grow) => { for (let i = 0; i < 3; i++) { g.save(); g.rotate((i * Math.PI) / 3); g.fillStyle = fill; const w = s * 0.34 + grow, h = s + grow; g.beginPath(); if (g.roundRect) g.roundRect(-w / 2, -h, w, 2 * h, s * 0.03); else g.rect(-w / 2, -h, w, 2 * h); g.fill(); g.restore(); } };
  bar('#ffffff', s * 0.09); bar('#1d5bd6', 0);
  g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineWidth = s * 0.07; g.beginPath(); g.moveTo(0, -s * 0.78); g.lineTo(0, s * 0.8); g.stroke();
  g.lineWidth = s * 0.055; g.beginPath(); g.moveTo(-s * 0.02, s * 0.62);
  for (let k = 0; k <= 24; k++) { const t = k / 24; g.lineTo(Math.sin(t * Math.PI * 3.2) * s * 0.17, s * 0.62 - t * s * 1.22); }
  g.stroke(); g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(s * 0.05, -s * 0.64, s * 0.085, s * 0.06, -0.3, 0, Math.PI * 2); g.fill();
  g.restore();
}
const LAT = (w, px) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const LOCAL = (px) => `600 ${px}px "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif`;
export const AMB_SI = 'ගිලන් රථ', AMB_TA = 'நோயாளர் காவு வண்டி';

// decal atlas (transparent): regions are referenced by the UV rects in AMB_UV
//   A  AMBULANCE (side)            0..1024 × 0..180
//   B  Sinhala · Tamil line        0..1024 × 186..262
//   C  1990 (hotline, red)         0..400 × 280..470
//   D  Star of Life                420..620 × 280..470
//   E  AMBULANCE mirrored (front)  0..1024 × 490..650
//   F  1990 + EMERGENCY line       0..1024 × 670..800
const uvR = (x0, y0, x1, y1) => [x0 / 1024, 1 - y1 / 1024, x1 / 1024, 1 - y0 / 1024];
export const AMB_UV = { A: uvR(0, 0, 1024, 180), B: uvR(0, 186, 1024, 262), C: uvR(0, 280, 400, 470), D: uvR(420, 270, 620, 470), E: uvR(0, 490, 1024, 650), F: uvR(0, 670, 1024, 800) };
let decal = null;
export function ambDecalMat() {
  if (decal) return decal;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d'); g.clearRect(0, 0, 1024, 1024);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = AMB_GREEN; g.font = LAT('bold', 170); g.fillText('AMBULANCE', 512, 96, 1000);
  g.font = LOCAL(54); g.fillText(`${AMB_SI}  ·  ${AMB_TA}`, 512, 226, 1000);
  g.fillStyle = '#d0202a'; g.font = LAT('bold', 190); g.fillText('1990', 200, 378, 390);
  starOfLife(g, 520, 370, 92);
  g.save(); g.translate(1024, 0); g.scale(-1, 1); g.fillStyle = AMB_GREEN; g.font = LAT('bold', 150); g.fillText('AMBULANCE', 512, 572, 1000); g.restore(); // reads correctly in a mirror ahead
  g.fillStyle = '#d0202a'; g.font = LAT('bold', 120); g.fillText('1990', 200, 736, 380); g.fillStyle = AMB_GREEN; g.font = LAT('600', 64); g.fillText('FREE EMERGENCY AMBULANCE', 690, 736, 640);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (decal = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
}

// slanted side quad (x varies with y), readable from outside on either side; uv = [u0, v0, u1, v1]
function sideQ(b, sx, xA, xB, y0, y1, z0, z1, uv, col = [1, 1, 1]) {
  if (sx > 0) b.quad([xA, y0, z1], [xA, y0, z0], [xB, y1, z0], [xB, y1, z1], uv, col);
  else b.quad([-xA, y0, z0], [-xA, y0, z1], [-xB, y1, z1], [-xB, y1, z0], uv, col);
}

export function addAmbulanceKit(m, T) {
  const mb = m.mb, paint = mb.get('paint'), rubber = mb.get('rubber'), dec = mb.get('amb'), green = C(AMB_GREEN), W = T.wid / 2;
  const frost = C('#dfe4e2'), gw0 = W * 0.9, gw1 = W * 0.86, y0 = 1.1, y1 = 1.91; const [pz0, pz1] = AMB.panelZ;
  const glassX = (y) => gw0 + (gw1 - gw0) * (y - y0) / (y1 - y0);
  // body skin x at height y (shared van taper: tumblehome above 0.75, tuck under 0.42)
  const skin = (y) => W * (1 - 0.02 * sstep(0.75, 1.0, y) - 0.03 * sstep(0.42, 0.3, y));
  const spans = (sx) => spansOutside(-2.2, 2.0, doorGapsMeta(m.doors, sx)); // driver door carries its own band piece
  for (const sx of [-1, 1]) {
    // rear-compartment windows: frosted (privacy film), flush with the window pillars
    const xa = glassX(y0) + 0.045, xb = glassX(y1) + 0.045;
    sideQ(paint, sx, xa, xb, y0, y1, pz0, pz1, [0, 0, 0.1, 0.1], frost);
    // green body band + thin pinstripe along the whole side
    for (const [za, zb] of spans(sx)) { sideQ(paint, sx, skin(AMB.bandY[0]) + 0.006, skin(AMB.bandY[1]) + 0.006, AMB.bandY[0], AMB.bandY[1], za, zb, [0, 0, 0.1, 0.1], green); sideQ(paint, sx, skin(AMB.thinY[0]) + 0.006, skin(AMB.thinY[1]) + 0.006, AMB.thinY[0], AMB.thinY[1], za, zb, [0, 0, 0.1, 0.1], green); }
    // lettering on the frosted panel: AMBULANCE + Sinhala / Tamil, Star of Life toward the rear
    const xd = (y) => glassX(y) + 0.051; const L = (ya, yb, za, zb, uv) => sideQ(dec, sx, xd(ya), xd(yb), ya, yb, za, zb, uv);
    L(1.47, 1.8, -1.5, 0.62, AMB_UV.A); L(1.22, 1.42, -1.5, 0.62, AMB_UV.B); L(1.2, 1.8, -2.22, -1.62, AMB_UV.D);
    // 1990 hotline between the band and the belt, behind the sliding door
    const xs = (y) => skin(y) + 0.009; sideQ(dec, sx, xs(0.8), xs(1.02), 0.8, 1.02, -2.05, -0.62, AMB_UV.F);
  }
  // roof: Star of Life (seen from above) and the front light bar (red / blue)
  const roofY = 1.966; dec.quad([0.5, roofY + 0.006, -1.0], [-0.5, roofY + 0.006, -1.0], [-0.5, roofY + 0.006, -2.0], [0.5, roofY + 0.006, -2.0], AMB_UV.D, [1, 1, 1]);
  rubber.box(0, roofY + 0.025, 1.18, 1.2, 0.05, 0.28, { col: C('#1a1a1a') }); mb.get('lbRed').box(-0.3, roofY + 0.1, 1.18, 0.56, 0.1, 0.24, { col: [1, 1, 1] }); mb.get('lbBlue').box(0.3, roofY + 0.1, 1.18, 0.56, 0.1, 0.24, { col: [1, 1, 1] });
  // front: mirrored AMBULANCE on the bonnet slope (z 2.32 → 2.10, y 0.95 → 1.05) and the green band across the nose
  { const n = [0, 0.91, 0.41], o = 0.012, P = (x, y, z) => [x + n[0] * o, y + n[1] * o, z + n[2] * o]; dec.quad(P(-0.46, 0.958, 2.3), P(0.46, 0.958, 2.3), P(0.46, 1.042, 2.115), P(-0.46, 1.042, 2.115), AMB_UV.E, [1, 1, 1]); }
  // rear: corner posts (carry the lamp strips + beacons), header above the doors
  const rz = AMB.rearZ;
  for (const sx of [-1, 1]) {
    paint.box(sx * 0.73, 1.235, rz - 0.015, 0.14, 1.37, 0.03, { col: C('#f4f4f2') });
    paint.box(sx * 0.73, (AMB.bandY[0] + AMB.bandY[1]) / 2, rz - 0.0315, 0.14, AMB.bandY[1] - AMB.bandY[0], 0.003, { col: green });
    mb.get('vtail').box(sx * 0.735, 0.93, rz - 0.04, 0.09, 0.22, 0.02); mb.get('vind').box(sx * 0.735, 1.1, rz - 0.04, 0.09, 0.1, 0.02); mb.get('vrev').box(sx * 0.735, 0.58, rz - 0.04, 0.09, 0.07, 0.02);
    mb.get(sx > 0 ? 'lbRed' : 'lbBlue').box(sx * 0.72, 1.83, rz - 0.045, 0.1, 0.12, 0.03, { col: [1, 1, 1] });
  }
  paint.box(0, 1.93, rz - 0.015, 1.6, 0.06, 0.03, { col: C('#f4f4f2') });
}

// ---------------------------------------------------------------- runtime rear doors
let rearMats = null;
function rearMaterials() {
  if (rearMats) return rearMats;
  const H = AMB.doorY1 - AMB.doorY0, Wd = 2 * AMB.doorX; const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d');
  const Y = (y) => ((AMB.doorY1 - y) / H) * 1024, X = (x) => ((AMB.doorX - x) / Wd) * 1024; // x: +x (viewer's left from behind) → u = 0
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, 1024, 1024);
  // frosted windows, one per leaf
  g.fillStyle = '#d9dfdd'; for (const [xa, xb] of [[0.6, 0.07], [-0.07, -0.6]]) { g.beginPath(); const r = 26; if (g.roundRect) g.roundRect(X(xa), Y(1.8), X(xb) - X(xa), Y(1.13) - Y(1.8), r); else g.rect(X(xa), Y(1.8), X(xb) - X(xa), Y(1.13) - Y(1.8)); g.fill(); }
  g.strokeStyle = '#2b2f31'; g.lineWidth = 6; g.beginPath(); g.moveTo(512, 0); g.lineTo(512, 1024); g.stroke(); // leaf seam
  starOfLife(g, (X(0.6) + X(0.07)) / 2, (Y(1.8) + Y(1.13)) / 2, 120);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#d0202a'; g.font = LAT('bold', 210); g.fillText('1990', (X(-0.07) + X(-0.6)) / 2, (Y(1.8) + Y(1.13)) / 2 + 8, 380);
  g.fillStyle = AMB_GREEN; g.font = LAT('bold', 200); g.fillText('AMBULANCE', 512, (Y(1.05) + Y(0.8)) / 2 + 6, 980);
  g.fillRect(0, Y(AMB.bandY[1]), 1024, Y(AMB.bandY[0]) - Y(AMB.bandY[1]));
  g.fillStyle = '#ffffff'; g.font = LOCAL(48); g.fillText(`${AMB_SI}  ·  ${AMB_TA}`, 512, (Y(AMB.bandY[1]) + Y(AMB.bandY[0])) / 2 + 2, 960);
  g.fillStyle = '#2b2f31'; g.fillRect(X(-0.03), Y(1.0), X(-0.15) - X(-0.03), 18); // handle
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  // interior (what you see with the doors open): pale cabin walls, cabinets, ceiling light, stretcher rails on the floor
  const ci = document.createElement('canvas'); ci.width = 512; ci.height = 512; const h = ci.getContext('2d');
  const gr = h.createRadialGradient ? h.createRadialGradient(256, 230, 30, 256, 256, 360) : null; if (gr) { gr.addColorStop(0, '#d5dfdb'); gr.addColorStop(1, '#7d8a86'); } h.fillStyle = gr || '#b9c4c0'; h.fillRect(0, 0, 512, 512);
  h.fillStyle = '#eef3f1'; h.fillRect(60, 40, 392, 26); // ceiling light
  h.fillStyle = '#9fb0aa'; for (const x of [12, 400]) { h.fillRect(x, 90, 100, 230); } h.fillStyle = '#c7d3cf'; for (const x of [20, 408]) for (const y of [100, 170, 240]) h.fillRect(x, y, 84, 60);
  h.fillStyle = '#3d4446'; h.beginPath(); h.moveTo(0, 512); h.lineTo(512, 512); h.lineTo(390, 360); h.lineTo(122, 360); h.closePath(); h.fill(); // floor in perspective
  h.fillStyle = '#9aa3a6'; h.fillRect(180, 380, 12, 132); h.fillRect(320, 380, 12, 132); // stretcher rails
  h.fillStyle = '#1f8a3c'; h.fillRect(150, 330, 212, 16); // seat bench edge
  const ti = new THREE.CanvasTexture(ci); ti.colorSpace = THREE.SRGBColorSpace;
  rearMats = {
    face: new THREE.MeshStandardMaterial({ map: t, roughness: 0.42, metalness: 0.05 }),
    edge: new THREE.MeshStandardMaterial({ color: 0xe9ebe9, roughness: 0.5 }),
    cav: new THREE.MeshStandardMaterial({ map: ti, emissiveMap: ti, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.9 }),
  };
  return rearMats;
}
const rearGeo = {};
export function buildAmbRear() {
  const M = rearMaterials(); const H = AMB.doorY1 - AMB.doorY0, lw = AMB.doorX - 0.005, yc = (AMB.doorY0 + AMB.doorY1) / 2;
  if (!rearGeo.edge) {
    rearGeo.edge = new THREE.BoxGeometry(lw, H, 0.03);
    for (const side of [1, -1]) { const p = new THREE.PlaneGeometry(lw, H); p.rotateY(Math.PI); const uv = p.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, side > 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5); rearGeo[side] = p; }
    rearGeo.cav = new THREE.PlaneGeometry(2 * AMB.doorX - 0.02, H - 0.04); rearGeo.cav.rotateY(Math.PI);
  }
  const grp = new THREE.Group(); grp.name = 'ambRear'; const leaves = {};
  for (const side of [1, -1]) { // side +1: +x leaf (hinge at +doorX), −1: −x leaf
    const pv = new THREE.Group(); pv.position.set(side * AMB.doorX, yc, AMB.doorZ);
    const e = new THREE.Mesh(rearGeo.edge, M.edge); e.position.x = -side * lw / 2; e.castShadow = true;
    const f = new THREE.Mesh(rearGeo[side], M.face); f.position.set(-side * lw / 2, 0, -0.0155);
    pv.add(e, f); grp.add(pv); leaves[side] = pv;
  }
  const cav = new THREE.Mesh(rearGeo.cav, M.cav); cav.position.set(0, yc, AMB.rearZ - 0.012); cav.visible = false; grp.add(cav);
  return { group: grp, L: leaves[1], R: leaves[-1], cav, open: 0 };
}
// open fraction k (0..1): each leaf swings outward ~109° about its corner hinge
export function setAmbRear(r, k) { if (!r) return; r.open = k; const a = 1.9 * k; r.L.rotation.y = -a; r.R.rotation.y = a; r.cav.visible = k > 0.01; }
