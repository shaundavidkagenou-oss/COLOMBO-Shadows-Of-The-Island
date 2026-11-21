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
  const ti = interiorAtlas();
  rearMats = {
    face: new THREE.MeshStandardMaterial({ map: t, roughness: 0.42, metalness: 0.05 }),
    edge: new THREE.MeshStandardMaterial({ color: 0xe9ebe9, roughness: 0.5 }),
    cavTex: ti,
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
  const cav = new THREE.Mesh(rearGeo.cav, interiorMaterial(M.cavTex)); cav.position.set(0, yc, AMB.rearZ - 0.012); cav.visible = false; grp.add(cav);
  return { group: grp, L: leaves[1], R: leaves[-1], cav, open: 0 };
}
// open fraction k (0..1): each leaf swings outward ~109° about its corner hinge
export function setAmbRear(r, k) { if (!r) return; r.open = k; const a = 1.9 * k; r.L.rotation.y = -a; r.R.rotation.y = a; r.cav.visible = k > 0.01; }

// ---------------------------------------------------------------- 75th: the rear compartment, interior-mapped
// One quad in the door opening (as before: 1 draw call, only while the doors are open) whose shader traces the view ray into
// a 1.64 × 1.37 × 2.9 m box behind it — the real compartment — and paints the face it hits from a 512² atlas: bench seat +
// overhead cabinets (left), monitor / defibrillator, suction, O2 outlets + cylinder, drawers (right), partition with the cab
// window, sharps bin and attendant seat (front), anti-slip floor with the cot rails, ceiling with LED panels. Corners get
// ambient occlusion; the stowed cot (empty, or with the covered patient) is traced as a box on the floor rails (uCot).
const IA = { L: [0, 0, 512, 112], R: [0, 112, 512, 112], F: [0, 224, 512, 112], C: [0, 336, 512, 64], B: [0, 400, 160, 112] }; // atlas rects (px)
function interiorAtlas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  const rect = (r, col) => { g.fillStyle = col; g.fillRect(r[0], r[1], r[2], r[3]); };
  const speck = (r, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(r[0] + Math.random() * r[2], r[1] + Math.random() * r[3], 1, 1); } };
  // u runs from the doors (0) to the partition (512) along the walls; v from the ceiling (top) to the floor (bottom)
  const wall = (r, side) => { const [x0, y0, w, h] = r; rect(r, '#e7ecea'); speck(r, 700, 0.05);
    const Y = (f) => y0 + f * h; // f: 0 ceiling … 1 floor
    g.fillStyle = '#d4dbd8'; g.fillRect(x0, Y(0.08), w, Y(0.36) - Y(0.08)); // overhead cabinet band
    for (let i = 0; i < 6; i++) { const cx = x0 + 18 + i * 80; g.fillStyle = '#c3ccc9'; g.fillRect(cx, Y(0.1), 74, Y(0.34) - Y(0.1)); g.fillStyle = 'rgba(160,190,200,0.55)'; g.fillRect(cx + 4, Y(0.12), 66, Y(0.31) - Y(0.12)); // acrylic doors
      for (let k = 0; k < 4; k++) { g.fillStyle = ['#2f6fb5', '#e8e8e2', '#d9a03a', '#7bb36a', '#c94a3b'][(i + k * 2 + (side > 0 ? 1 : 0)) % 5]; g.fillRect(cx + 8 + k * 15, Y(0.2), 12, Y(0.3) - Y(0.2)); } // supplies behind
      g.fillStyle = '#8a9592'; g.fillRect(cx + 30, Y(0.315), 14, 2); }
    g.fillStyle = '#b8c0be'; g.fillRect(x0, Y(0.37), w, 2); // grab rail
    g.fillStyle = '#9ba6a3'; g.fillRect(x0, Y(0.38), w, 1);
    if (side < 0) { // left: the long bench seat (green vinyl) with seat belts and back cushions
      for (let i = 0; i < 3; i++) { const bx = x0 + 40 + i * 140; g.fillStyle = '#1e6e3a'; g.fillRect(bx, Y(0.46), 128, Y(0.66) - Y(0.46)); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(bx + 4, Y(0.47), 120, 3); g.fillStyle = '#111'; g.fillRect(bx + 60, Y(0.48), 5, Y(0.72) - Y(0.48)); }
      g.fillStyle = '#18592f'; g.fillRect(x0 + 34, Y(0.69), 432, Y(0.76) - Y(0.69)); g.fillStyle = '#2a7d45'; g.fillRect(x0 + 34, Y(0.69), 432, 3); // seat squab edge
      g.fillStyle = '#c9d0ce'; g.fillRect(x0 + 34, Y(0.76), 432, Y(1) - Y(0.76)); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0 + 34, Y(0.76), 432, 4); // locker base under the bench
      for (let i = 0; i < 4; i++) { g.strokeStyle = '#a3abaa'; g.strokeRect(x0 + 44 + i * 106, Y(0.8), 98, Y(0.97) - Y(0.8)); }
    } else { // right: monitor/defibrillator on its bracket, suction, O2 outlets, cylinder, drawers, the attendant's seat at the front
      g.fillStyle = '#2b2f33'; g.fillRect(x0 + 150, Y(0.42), 96, Y(0.62) - Y(0.42)); g.fillStyle = '#0a0f0d'; g.fillRect(x0 + 156, Y(0.44), 62, Y(0.6) - Y(0.44));
      g.strokeStyle = '#2ee66b'; g.lineWidth = 1.5; g.beginPath(); for (let i = 0; i <= 60; i++) { const xx = x0 + 157 + i, ph = i % 20; const yy = Y(0.5) - (ph === 8 ? 7 : ph === 9 ? -4 : ph === 7 ? -1 : 0); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke();
      g.fillStyle = '#ffd23a'; g.font = 'bold 9px sans-serif'; g.fillText('72', x0 + 222, Y(0.5)); g.fillStyle = '#e8b41c'; g.fillRect(x0 + 222, Y(0.56), 18, 6); // HR + shock button
      g.fillStyle = '#d0d6d4'; g.fillRect(x0 + 270, Y(0.44), 40, Y(0.62) - Y(0.44)); g.fillStyle = 'rgba(160,200,210,0.7)'; g.fillRect(x0 + 275, Y(0.47), 30, Y(0.58) - Y(0.47)); // suction canister
      for (let i = 0; i < 3; i++) { g.fillStyle = ['#ffffff', '#1d1d1d', '#e8e8e8'][i]; g.beginPath(); g.arc(x0 + 340 + i * 16, Y(0.5), 5, 0, 7); g.fill(); } g.fillStyle = '#5a6461'; g.fillRect(x0 + 330, Y(0.56), 56, 3); // O2 / air / vacuum outlets
      g.fillStyle = '#1e1f21'; g.fillRect(x0 + 410, Y(0.4), 26, Y(0.98) - Y(0.4)); g.fillStyle = '#f2f2f0'; g.fillRect(x0 + 410, Y(0.4), 26, Y(0.47) - Y(0.4)); g.fillStyle = '#6b7472'; g.fillRect(x0 + 404, Y(0.62), 38, 5); // O2 cylinder (black, white shoulder) in its strap
      g.fillStyle = '#ccd3d1'; g.fillRect(x0 + 20, Y(0.66), 120, Y(1) - Y(0.66)); for (let i = 0; i < 4; i++) { g.strokeStyle = '#9aa3a1'; g.strokeRect(x0 + 24, Y(0.68) + i * 9, 112, 8); g.fillStyle = '#7d8785'; g.fillRect(x0 + 70, Y(0.68) + i * 9 + 3, 20, 2); } // drawers
      g.fillStyle = '#1e6e3a'; g.fillRect(x0 + 460, Y(0.5), 46, Y(0.74) - Y(0.5)); g.fillStyle = '#18592f'; g.fillRect(x0 + 456, Y(0.72), 54, Y(0.78) - Y(0.72)); // attendant's seat
    }
    const gr = g.createLinearGradient(0, y0, 0, y0 + h); gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)'); g.fillStyle = gr; g.fillRect(x0, y0, w, h);
  };
  wall(IA.L, -1); wall(IA.R, 1);
  { const [x0, y0, w, h] = IA.F; rect(IA.F, '#4a4f52'); speck(IA.F, 2600, 0.12); // floor: grey anti-slip vinyl, coved edges, two cot rails, the cot lock at the front
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, y0, w, 6); g.fillRect(x0, y0 + h - 6, w, 6);
    for (const f of [0.36, 0.64]) { g.fillStyle = '#9aa2a6'; g.fillRect(x0, y0 + f * h - 3, w, 6); g.fillStyle = '#5e6569'; g.fillRect(x0, y0 + f * h + 2, w, 1); }
    g.fillStyle = '#c8b02a'; g.fillRect(x0 + 470, y0 + 0.3 * h, 24, 0.4 * h); g.fillStyle = '#d9d200'; g.fillRect(x0, y0 + 1, 20, h - 2); } // cot lock; yellow step edge at the doors
  { const [x0, y0, w, h] = IA.C; rect(IA.C, '#eef1f0'); speck(IA.C, 300, 0.04); // ceiling: two LED panels, IV hook rail, vents
    for (const px of [70, 300]) { g.fillStyle = '#ffffff'; g.fillRect(x0 + px, y0 + 14, 140, 36); g.strokeStyle = '#c4cbc9'; g.strokeRect(x0 + px, y0 + 14, 140, 36); }
    g.fillStyle = '#9aa2a1'; g.fillRect(x0 + 20, y0 + 30, 472, 3); for (let i = 0; i < 4; i++) g.fillRect(x0 + 60 + i * 120, y0 + 26, 4, 10);
    for (let i = 0; i < 6; i++) { g.fillStyle = '#c9cfcd'; g.fillRect(x0 + 230 + (i % 3) * 8, y0 + 52 + ((i / 3) | 0) * 4, 6, 2); } }
  { const [x0, y0, w, h] = IA.B; rect(IA.B, '#e2e7e5'); speck(IA.B, 300, 0.05); // partition: cab window, cabinet, sharps bin, a wall clock
    g.fillStyle = '#1a2024'; g.fillRect(x0 + 50, y0 + 18, 60, 30); g.fillStyle = 'rgba(120,150,170,0.35)'; g.fillRect(x0 + 52, y0 + 20, 26, 10);
    g.fillStyle = '#c6cecb'; g.fillRect(x0 + 8, y0 + 56, 70, 38); g.strokeStyle = '#9aa3a1'; g.strokeRect(x0 + 8, y0 + 56, 70, 38); g.strokeRect(x0 + 8, y0 + 56, 35, 38);
    g.fillStyle = '#f2c21a'; g.fillRect(x0 + 96, y0 + 62, 22, 26); g.fillStyle = '#c41f1f'; g.fillRect(x0 + 96, y0 + 62, 22, 5);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x0 + 132, y0 + 30, 9, 0, 7); g.fill(); g.strokeStyle = '#333'; g.lineWidth = 1.2; g.stroke(); g.beginPath(); g.moveTo(x0 + 132, y0 + 30); g.lineTo(x0 + 132, y0 + 24); g.moveTo(x0 + 132, y0 + 30); g.lineTo(x0 + 136, y0 + 31); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x0, y0 + h - 10, w, 10); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t;
}
const UVR = (r) => new THREE.Vector4(r[0] / 512, 1 - (r[1] + r[3]) / 512, r[2] / 512, r[3] / 512); // (u0, v0, du, dv) in texture space (flipY)
function interiorMaterial(tex) {
  const H = AMB.doorY1 - AMB.doorY0 - 0.04;
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uL: { value: UVR(IA.L) }, uR: { value: UVR(IA.R) }, uF: { value: UVR(IA.F) }, uC: { value: UVR(IA.C) }, uB: { value: UVR(IA.B) },
      // room in the quad's local frame (the quad faces out of the van: the room lies along −z): half width, floor, ceiling, depth
      uRoom: { value: new THREE.Vector4(0.8, -H / 2 - 0.02, H / 2 + 0.06, 2.85) }, uCot: { value: 0 }, uCotIn: { value: 2.2 }, uLight: { value: 1 } },
    vertexShader: `varying vec3 vP; varying vec3 vCam;
      void main() { vP = position; vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec4 uL, uR, uF, uC, uB, uRoom; uniform float uCot, uCotIn, uLight; varying vec3 vP; varying vec3 vCam;
      vec3 tex(vec4 r, vec2 uv) { uv = clamp(uv, 0.004, 0.996); return texture2D(map, r.xy + uv * r.zw).rgb; }
      void main() {
        vec3 rd = normalize(vP - vCam); vec3 p = vP; p.xz = -p.xz; rd.xz = -rd.xz; /* the quad's geometry is turned half round (it faces out of the van): the room lies along −z here */ float hw = uRoom.x, y0 = uRoom.y, y1 = uRoom.z, D = uRoom.w;
        float tx = ((rd.x > 0.0 ? hw : -hw) - p.x) / rd.x; float ty = ((rd.y > 0.0 ? y1 : y0) - p.y) / rd.y; float tz = (-D - p.z) / min(rd.z, -1e-4);
        float t = min(tx, min(ty, tz)); vec3 h = p + rd * t; vec3 col; float ao;
        float depth = clamp(-h.z / D, 0.0, 1.0); // 0 at the doors … 1 at the partition
        if (t == tz) { col = tex(uB, vec2((h.x + hw) / (2.0 * hw), (h.y - y0) / (y1 - y0))); ao = min(min(hw - abs(h.x), h.y - y0), y1 - h.y); }
        else if (t == tx) { vec2 uv = vec2(depth, (h.y - y0) / (y1 - y0)); col = rd.x > 0.0 ? tex(uR, uv) : tex(uL, uv); ao = min(min(D + h.z, h.y - y0), y1 - h.y); }
        else if (rd.y < 0.0) { col = tex(uF, vec2(depth, (h.x + hw) / (2.0 * hw))); ao = min(hw - abs(h.x), D + h.z); }
        else { col = tex(uC, vec2(depth, (h.x + hw) / (2.0 * hw))); ao = min(hw - abs(h.x), D + h.z) + 0.15; }
        col *= mix(0.55, 1.0, smoothstep(0.0, 0.28, ao)); // corners
        col *= mix(1.0, 0.82, depth * (1.0 - step(0.5, float(rd.y > 0.0 && t == ty)))); // light falls off toward the partition (LED panels over the middle)
        if (uCot > 0.5) { // the stowed cot: a box on the rails, from the doors (z 0) to uCotIn into the van
          vec3 bmin = vec3(-0.28, y0, -uCotIn), bmax = vec3(0.28, y0 + 0.43, 0.0); vec3 inv = 1.0 / rd; vec3 t0 = (bmin - p) * inv, t1 = (bmax - p) * inv; vec3 tn = min(t0, t1), tf = max(t0, t1);
          float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
          if (b > max(a, 0.0) && a < t) { vec3 q = p + rd * a; float k = (q.z + uCotIn) / max(uCotIn, 0.01);
            if (abs(q.y - bmax.y) < 0.004) { col = vec3(0.11, 0.115, 0.13); if (uCot > 1.5) { float bump = sin(clamp(k, 0.0, 1.0) * 3.14159); col = vec3(0.86, 0.86, 0.84) * (0.8 + 0.2 * bump) * (0.85 + 0.15 * (1.0 - abs(q.x) / 0.28)); } }
            else { col = (q.y > bmax.y - 0.12) ? vec3(0.62, 0.64, 0.67) : vec3(0.16, 0.17, 0.18); if (uCot > 1.5 && q.y > bmax.y - 0.12) col = vec3(0.8, 0.8, 0.78); } col *= 0.9; } }
        gl_FragColor = vec4(col * uLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
