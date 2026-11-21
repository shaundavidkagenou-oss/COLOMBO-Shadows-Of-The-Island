// 80th request — roadside assistance & vehicle recovery: the two service vehicles of the Street Customs breakdown service.
//
//   rsvan    mechanic service van on the van body (VehicleModels P.van, same shell as the 1990 ambulance): white, panelled rear
//            side windows, orange body band, trilingual ROADSIDE ASSISTANCE lettering (English / Sinhala / Tamil), roof rack
//            with a ladder and an amber light bar, amber corner flashers at the rear, twin rear doors (AmbulanceKit's runtime
//            doors with this van's own skin) that open onto a racked tool compartment (interior-mapped: shelves with tool cases,
//            drawers, spare wheels, a battery booster, cones and triangles in their bays)
//   flatbed  tilt-and-slide car carrier on the lorry cab (P.lorry): cab protector (headboard) with an amber light bar and work
//            lamp, under-deck tool lockers both sides, the hydraulic control station behind the driver's door, under-ride bar
//            with a rear lamp bar and red / fluorescent-yellow chevrons, mirrored RECOVERY on the visor. The deck itself is a
//            separate runtime group (buildFlatDeck): it tilts back and slides down to the road, with the winch at its head.
//
// Markings are plain service words (ROADSIDE ASSISTANCE, VEHICLE RECOVERY, 24 HOUR BREAKDOWN SERVICE) and the operator line
// "Street Customs · Colombo 03" — the game's own garage, where recovered vehicles are taken. No manufacturer badges.
// Lighting: amber beacons use the shared beacon materials re-coloured per vehicle (Vehicle.beacons flashes them); no lights.
import * as THREE from 'three';
import { IA } from './AmbulanceKit.js';
import { doorGapsMeta, spansOutside } from './DoorSpans.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const RS_ORANGE = '#ff6a00', RS_NAVY = '#1b2a4a';
export const RS_SI = 'මාර්ග සහාය', RS_TA = 'வீதியோர உதவி', REC_SI = 'වාහන ඇදගෙන යාම', REC_TA = 'வாகன மீட்பு';
const LAT = (w, px) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
const LOCAL = (px) => `600 ${px}px "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif`;

// small geometry helpers (the van / lorry builders' own are module-private)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const unitBox = new THREE.BoxGeometry(1, 1, 1), unitCyl = new THREE.CylinderGeometry(1, 1, 1, 12);
export function part(b, geo, pos, rot, scale, col) { _m.compose(_v.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2])), _s.set(scale[0], scale[1], scale[2])); b.geometry(geo, _m, col); }
export function beam(b, a, c, tx, tz, col, geo = unitBox) { const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]); const len = d.length() || 1e-4; _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  _m.compose(_v.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2), _q, _s.set(tx, len, tz)); b.geometry(geo, _m, col); }
export { unitBox, unitCyl };

// ---------------------------------------------------------------- decal atlas (one transparent 1024² texture, both vehicles)
const uvR = (x0, y0, x1, y1) => [x0 / 1024, 1 - y1 / 1024, x1 / 1024, 1 - y0 / 1024];
export const RS_UV = { A: uvR(0, 0, 1024, 150), B: uvR(0, 156, 1024, 226), C: uvR(0, 232, 1024, 302), D: uvR(0, 308, 1024, 448), E: uvR(0, 454, 1024, 524),
  F: uvR(0, 530, 1024, 640), G: uvR(0, 646, 1024, 706), H: uvR(0, 720, 256, 976), I: uvR(270, 720, 1024, 1010) };
function spannerIcon(g, cx, cy, r) {
  g.fillStyle = RS_ORANGE; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = r * 0.08; g.beginPath(); g.arc(cx, cy, r * 0.9, 0, Math.PI * 2); g.stroke();
  g.save(); g.translate(cx, cy); g.rotate(-Math.PI / 4); g.fillStyle = '#ffffff'; g.fillRect(-r * 0.11, -r * 0.5, r * 0.22, r * 1.05); // handle
  for (const s of [-1, 1]) { g.beginPath(); g.arc(0, s * r * 0.55, r * 0.24, 0, Math.PI * 2); g.fill(); } g.fillStyle = RS_ORANGE; for (const s of [-1, 1]) g.fillRect(-r * 0.08, s * r * 0.55 - (s > 0 ? 0 : r * 0.3), r * 0.16, r * 0.3); // open jaws
  g.restore();
}
function chevrons(g, x0, y0, w, h, step = 70) {
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip(); g.fillStyle = '#e8f000'; g.fillRect(x0, y0, w, h); g.fillStyle = '#d0141e';
  for (let x = x0 - h; x < x0 + w + h; x += step * 2) { g.beginPath(); g.moveTo(x, y0 + h); g.lineTo(x + step, y0 + h); g.lineTo(x + step + h * 0.9, y0); g.lineTo(x + h * 0.9, y0); g.closePath(); g.fill(); }
  g.restore();
}
let decal = null;
export function rsDecalMat() {
  if (decal) return decal;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const g = c.getContext('2d'); g.clearRect(0, 0, 1024, 1024); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = RS_NAVY; g.font = LAT('bold', 132); g.fillText('ROADSIDE ASSISTANCE', 512, 78, 1010);
  g.font = LOCAL(52); g.fillText(`${RS_SI}  ·  ${RS_TA}`, 512, 192, 1000);
  g.fillStyle = RS_ORANGE; g.font = LAT('bold', 60); g.fillText('24 HOUR BREAKDOWN SERVICE', 512, 268, 1000);
  g.fillStyle = RS_NAVY; g.font = LAT('bold', 132); g.fillText('VEHICLE RECOVERY', 512, 380, 1010);
  g.font = LOCAL(52); g.fillText(`${REC_SI}  ·  ${REC_TA}`, 512, 490, 1000);
  g.save(); g.translate(1024, 0); g.scale(-1, 1); g.fillStyle = RS_NAVY; g.font = LAT('bold', 112); g.fillText('RECOVERY', 512, 586, 1000); g.restore(); // reads correctly in a mirror ahead
  g.fillStyle = '#2b2f33'; g.font = LAT('600', 50); g.fillText('STREET CUSTOMS  ·  COLOMBO 03', 512, 677, 1000);
  spannerIcon(g, 128, 848, 118); chevrons(g, 270, 720, 754, 290, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (decal = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
}
// amber beacons: the shared red / blue beacon materials re-coloured (same shader program; per vehicle like the police lights)
export function amberBeacons(lbBlue, lbRed) { const a = lbBlue.clone(), b = lbRed.clone(); for (const m of [a, b]) { m.color.set(0x5a3a08); m.emissive.set(0xffa010); m.emissiveIntensity = 0; } return { a, b }; }

function sideQ(b, sx, xA, xB, y0, y1, z0, z1, uv, col = [1, 1, 1]) {
  if (sx > 0) b.quad([xA, y0, z1], [xA, y0, z0], [xB, y1, z0], [xB, y1, z1], uv, col);
  else b.quad([-xA, y0, z0], [-xA, y0, z1], [-xB, y1, z1], [-xB, y1, z0], uv, col);
}

// ---------------------------------------------------------------- mechanic service van (van body)
// van numbers (VehicleModels P.van / AmbulanceKit.AMB): greenhouse 1.10 → 1.91, glass half width 0.9W → 0.86W, rear face z −2.36
export function addRoadsideVanKit(m, T) {
  const doorGaps = (sx) => spansOutside(-2.2, 2.0, doorGapsMeta(m.doors, sx));
  const mb = m.mb, paint = mb.get('paint'), rubber = mb.get('rubber'), ch = mb.get('chrome'), dec = mb.get('rsa'), W = T.wid / 2;
  const white = C('#f4f4f2'), orange = C(RS_ORANGE), navy = C(RS_NAVY), gw0 = W * 0.9, gw1 = W * 0.86, y0 = 1.1, y1 = 1.91, pz0 = -2.29, pz1 = 0.72;
  const glassX = (y) => gw0 + (gw1 - gw0) * (y - y0) / (y1 - y0); const skin = (y) => W * (1 - 0.02 * sstep(0.75, 1.0, y) - 0.03 * sstep(0.42, 0.3, y));
  for (const sx of [-1, 1]) {
    sideQ(paint, sx, glassX(y0) + 0.045, glassX(y1) + 0.045, y0, y1, pz0, pz1, [0, 0, 0.1, 0.1], white); // panel van: the rear side windows are steel panels
    for (const [za, zb] of doorGaps(sx)) { sideQ(paint, sx, skin(0.66) + 0.006, skin(0.8) + 0.006, 0.66, 0.8, za, zb, [0, 0, 0.1, 0.1], orange); sideQ(paint, sx, skin(0.58) + 0.006, skin(0.61) + 0.006, 0.58, 0.61, za, zb, [0, 0, 0.1, 0.1], navy); }
    const xd = (y) => glassX(y) + 0.051; const Lq = (ya, yb, za, zb, uv) => sideQ(dec, sx, xd(ya), xd(yb), ya, yb, za, zb, uv);
    Lq(1.5, 1.8, -1.62, 0.66, RS_UV.A); Lq(1.28, 1.44, -1.62, 0.66, RS_UV.B); Lq(1.2, 1.8, -2.24, -1.7, RS_UV.H); Lq(1.13, 1.23, -1.4, 0.4, RS_UV.G);
    const xs = (y) => skin(y) + 0.009; sideQ(dec, sx, xs(0.84), xs(0.98), 0.84, 0.98, -2.1, -0.4, RS_UV.C);
  }
  // roof: rails, a ladder on the rack, the amber light bar at the front, a work lamp at the back
  const roofY = 1.966;
  for (const sx of [-1, 1]) { beam(ch, [sx * 0.62, roofY + 0.12, 1.0], [sx * 0.62, roofY + 0.12, -2.15], 0.035, 0.035, C('#b8bcc0'), unitCyl); for (const z of [0.85, -0.6, -2.0]) beam(rubber, [sx * 0.62, roofY, z], [sx * 0.62, roofY + 0.12, z], 0.04, 0.04, C('#222')); }
  for (const z of [0.85, -0.6, -2.0]) beam(ch, [-0.62, roofY + 0.12, z], [0.62, roofY + 0.12, z], 0.03, 0.03, C('#b8bcc0'), unitCyl);
  for (const sx of [-1, 1]) beam(ch, [sx * 0.2, roofY + 0.17, 0.7], [sx * 0.2, roofY + 0.17, -1.9], 0.03, 0.05, C('#c9ccd0')); // ladder stiles
  for (let z = 0.6; z > -1.9; z -= 0.3) beam(ch, [-0.2, roofY + 0.17, z], [0.2, roofY + 0.17, z], 0.022, 0.022, C('#c9ccd0'), unitCyl); // rungs
  rubber.box(0, roofY + 0.025, 1.18, 1.22, 0.05, 0.28, { col: C('#1a1a1a') }); mb.get('lbBlue').box(-0.3, roofY + 0.1, 1.18, 0.56, 0.1, 0.24, { col: [1, 1, 1] }); mb.get('lbRed').box(0.3, roofY + 0.1, 1.18, 0.56, 0.1, 0.24, { col: [1, 1, 1] });
  rubber.box(0, roofY + 0.09, -2.22, 0.3, 0.12, 0.1, { col: C('#202020') }); mb.get('vlight').box(0, roofY + 0.09, -2.275, 0.24, 0.08, 0.01); // rear work lamp (lit by headlamp logic: dark by day)
  // front: mirrored RECOVERY on the bonnet slope, orange band across the nose
  { const n = [0, 0.91, 0.41], o = 0.012, P = (x, y, z) => [x + n[0] * o, y + n[1] * o, z + n[2] * o]; dec.quad(P(-0.42, 0.958, 2.3), P(0.42, 0.958, 2.3), P(0.42, 1.042, 2.115), P(-0.42, 1.042, 2.115), RS_UV.F, [1, 1, 1]); }
  // rear corner posts with lamp strips + amber flashers (the doors carry chevrons and lettering: rsRearStyle)
  const rz = -2.36;
  for (const sx of [-1, 1]) {
    paint.box(sx * 0.73, 1.235, rz - 0.015, 0.14, 1.37, 0.03, { col: white }); paint.box(sx * 0.73, 0.73, rz - 0.0315, 0.14, 0.14, 0.003, { col: orange });
    mb.get('vtail').box(sx * 0.735, 0.93, rz - 0.04, 0.09, 0.22, 0.02); mb.get('vind').box(sx * 0.735, 1.1, rz - 0.04, 0.09, 0.1, 0.02); mb.get('vrev').box(sx * 0.735, 0.58, rz - 0.04, 0.09, 0.07, 0.02);
    mb.get(sx > 0 ? 'lbRed' : 'lbBlue').box(sx * 0.72, 1.83, rz - 0.045, 0.1, 0.12, 0.03, { col: [1, 1, 1] });
  }
  paint.box(0, 1.93, rz - 0.015, 1.6, 0.06, 0.03, { col: white });
  // step bumper with a tow ball
  rubber.box(0, 0.4, rz - 0.12, 1.3, 0.08, 0.2, { col: C('#1c1c1c') }); part(ch, unitCyl, [0, 0.47, rz - 0.3], [0, 0, 0], [0.025, 0.08, 0.025], C('#a8acb0')); part(ch, new THREE.SphereGeometry(1, 10, 8), [0, 0.53, rz - 0.3], [0, 0, 0], [0.04, 0.04, 0.04], C('#b8bcc0'));
}

// the van's twin rear doors (AmbulanceKit.buildAmbRear with this style): chevrons below, lettering and tinted glass above
export const rsRearStyle = {
  key: 'rsvan',
  face(g, X, Y, LATf, LOCALf) {
    g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, 1024, 1024);
    g.fillStyle = '#20262b'; for (const [xa, xb] of [[0.6, 0.07], [-0.07, -0.6]]) { g.beginPath(); const r = 22; const x = X(xa), y = Y(1.8), w = X(xb) - X(xa), hh = Y(1.3) - Y(1.8); if (g.roundRect) g.roundRect(x, y, w, hh, r); else g.rect(x, y, w, hh); g.fill(); } // tinted glass
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = RS_NAVY; g.font = LATf('bold', 112); g.fillText('ROADSIDE ASSISTANCE', 512, (Y(1.24) + Y(1.08)) / 2 + 4, 990);
    g.font = LOCALf(44); g.fillText(`${RS_SI}  ·  ${RS_TA}`, 512, (Y(1.06) + Y(0.97)) / 2, 960);
    chevrons(g, 0, Y(0.94), 1024, Y(0.55) - Y(0.94), 80);
    g.strokeStyle = '#2b2f31'; g.lineWidth = 6; g.beginPath(); g.moveTo(512, 0); g.lineTo(512, 1024); g.stroke(); // leaf seam
    g.fillStyle = '#2b2f31'; g.fillRect(X(-0.03), Y(1.27), X(-0.15) - X(-0.03), 18); // handle
  },
  atlas() { return toolAtlas(); },
};
// rear compartment of the service van (interior-mapped, same IA layout as the ambulance): steel racking both sides
function toolAtlas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
  const rect = (r, col) => { g.fillStyle = col; g.fillRect(r[0], r[1], r[2], r[3]); };
  const speck = (r, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(r[0] + Math.random() * r[2], r[1] + Math.random() * r[3], 1, 1); } };
  const wall = (r, side) => { const [x0, y0, w, h] = r; const Y = (f) => y0 + f * h; rect(r, '#c9ccc8'); speck(r, 900, 0.07);
    for (const f of [0.3, 0.55, 0.8]) { g.fillStyle = '#7d8388'; g.fillRect(x0, Y(f), w, 3); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0, Y(f) + 3, w, 3); } // shelf lips
    for (let i = 0; i < 6; i++) g.fillRect(x0 + 6 + i * 84, Y(0.05), 4, Y(0.98) - Y(0.05)); // uprights
    const caseCols = ['#c4161c', '#1d4f8a', '#1a1a1a', '#d9a514', '#3a3d40'];
    for (let i = 0; i < 9; i++) { const bx = x0 + 14 + i * 54, top = Y(0.12), hh = Y(0.29) - top; g.fillStyle = caseCols[(i + (side > 0 ? 2 : 0)) % 5]; g.fillRect(bx, top + (i % 3) * 3, 44, hh - (i % 3) * 3); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(bx + 4, top + 6, 36, 3); } // tool cases
    if (side < 0) { // left: drawers unit + battery booster + jerry can, spare wheels on the floor
      for (let i = 0; i < 4; i++) { g.strokeStyle = '#5c6166'; g.strokeRect(x0 + 20, Y(0.34) + i * 11, 200, 10); g.fillStyle = '#4a4f54'; g.fillRect(x0 + 108, Y(0.34) + i * 11 + 4, 24, 2); }
      g.fillStyle = '#e8b414'; g.fillRect(x0 + 250, Y(0.36), 60, Y(0.54) - Y(0.36)); g.fillStyle = '#1a1a1a'; g.fillRect(x0 + 258, Y(0.4), 44, 10); g.fillStyle = '#c4161c'; g.fillRect(x0 + 262, Y(0.47), 10, 8); g.fillStyle = '#111'; g.fillRect(x0 + 288, Y(0.47), 10, 8); // booster
      g.fillStyle = '#2f6b2a'; g.fillRect(x0 + 340, Y(0.37), 40, Y(0.54) - Y(0.37)); // jerry can
      for (let i = 0; i < 2; i++) { const cx = x0 + 90 + i * 150; g.fillStyle = '#151515'; g.beginPath(); g.ellipse(cx, Y(0.82), 60, Y(0.98) - Y(0.82), 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#8a8f94'; g.beginPath(); g.ellipse(cx, Y(0.82) + 8, 30, (Y(0.98) - Y(0.82)) * 0.5, 0, 0, Math.PI * 2); g.fill(); } // spare wheels
    } else { // right: cones + triangles bay, straps on hooks, a trolley jack, air line reel
      for (let i = 0; i < 3; i++) { const cx = x0 + 40 + i * 34; g.fillStyle = '#ff6a00'; g.beginPath(); g.moveTo(cx, Y(0.58)); g.lineTo(cx - 14, Y(0.79)); g.lineTo(cx + 14, Y(0.79)); g.closePath(); g.fill(); g.fillStyle = '#f2f2ee'; g.fillRect(cx - 7, Y(0.66), 14, 5); }
      g.strokeStyle = '#d0141e'; g.lineWidth = 5; g.beginPath(); g.moveTo(x0 + 170, Y(0.6)); g.lineTo(x0 + 150, Y(0.78)); g.lineTo(x0 + 190, Y(0.78)); g.closePath(); g.stroke();
      for (let i = 0; i < 4; i++) { g.fillStyle = '#e8c414'; g.fillRect(x0 + 240 + i * 22, Y(0.33), 8, Y(0.52) - Y(0.33)); } // ratchet straps
      g.fillStyle = '#c4161c'; g.fillRect(x0 + 360, Y(0.88), 100, Y(0.96) - Y(0.88)); g.fillStyle = '#1a1a1a'; g.fillRect(x0 + 440, Y(0.62), 6, Y(0.88) - Y(0.62)); // trolley jack
      g.fillStyle = '#1d4f8a'; g.beginPath(); g.arc(x0 + 400, Y(0.43), 24, 0, Math.PI * 2); g.fill(); g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(x0 + 400, Y(0.43), 9, 0, Math.PI * 2); g.fill(); // air line reel
    }
    const gr = g.createLinearGradient(0, y0, 0, y0 + h); gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = gr; g.fillRect(x0, y0, w, h); };
  wall(IA.L, -1); wall(IA.R, 1);
  { const [x0, y0, w, h] = IA.F; rect(IA.F, '#3c3f42'); for (let i = 0; i < w; i += 16) for (let j = 0; j < h; j += 16) { g.fillStyle = (i / 16 + j / 16) % 2 ? '#484b4e' : '#34373a'; g.fillRect(x0 + i + 3, y0 + j + 3, 8, 3); } speck(IA.F, 1800, 0.1); g.fillStyle = '#d9d200'; g.fillRect(x0, y0 + 1, 18, h - 2); } // chequer plate floor, yellow step edge
  { const [x0, y0, w, h] = IA.C; rect(IA.C, '#d8dbd8'); speck(IA.C, 300, 0.05); for (const px of [80, 300]) { g.fillStyle = '#ffffff'; g.fillRect(x0 + px, y0 + 18, 120, 26); } }
  { const [x0, y0, w, h] = IA.B; rect(IA.B, '#bfc3c0'); speck(IA.B, 300, 0.06); g.fillStyle = '#7d8388'; for (let i = 0; i < 6; i++) g.fillRect(x0 + 10 + i * 25, y0 + 20, 3, h - 30); // pegboard bulkhead with tools
    const tools = ['#c4161c', '#1a1a1a', '#b8bcc0', '#d9a514']; for (let i = 0; i < 10; i++) { g.fillStyle = tools[i % 4]; g.fillRect(x0 + 14 + (i % 5) * 28, y0 + 26 + Math.floor(i / 5) * 34, 6, 26); } g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x0, y0 + h - 10, w, 10); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t;
}

// ---------------------------------------------------------------- flatbed car carrier (lorry cab): static body parts
// ctx: the lorry builder's numbers / builders { L, W, R, cabL, wf, wr, col, paint, rubber, ch, ind, tails, mb }
export const FLAT = { deckL: 5.5, deckW: 2.3, deckT: 0.12, frontZ: 1.48, deckY: 0.88, supportZ: -3.15, angle: 0.2, headZ: 1.55 };
FLAT.rearZ0 = FLAT.frontZ - FLAT.deckL; // −4.02: the deck's rear edge when stowed (0.42 m past the tail)
export function addFlatbedBody(ctx) {
  const { L, W, mb, paint, rubber, ch, col } = ctx; const dec = mb.get('rsa'); const steel = C('#3a3c40'), dark = C('#1d1d1f'), alu = C('#b8bcc0'), white = C('#f2f2f0');
  // sub-frame rails + tilt cylinders (the deck rests on them), roller at the rear support
  for (const sx of [-1, 1]) { rubber.box(sx * 0.45, 0.8, (FLAT.headZ + FLAT.supportZ) / 2, 0.14, 0.14, FLAT.headZ - FLAT.supportZ, { col: dark }); beam(ch, [sx * 0.3, 0.74, 0.4], [sx * 0.3, 0.84, -1.6], 0.07, 0.07, C('#9a9ea2'), unitCyl); }
  part(ch, unitCyl, [0, FLAT.deckY - 0.06, FLAT.supportZ], [0, 0, Math.PI / 2], [0.07, 1.1, 0.07], C('#6a6e72'));
  // cab protector (headboard): posts, cross bars, a mesh panel, the amber light bar and a work lamp on top
  const hz = FLAT.headZ;
  for (const sx of [-1, 1]) beam(paint, [sx * (W - 0.12), 0.88, hz], [sx * (W - 0.12), 2.5, hz], 0.09, 0.09, col);
  for (const y of [1.2, 1.85, 2.5]) beam(paint, [-(W - 0.12), y, hz], [W - 0.12, y, hz], 0.07, 0.07, col);
  for (let x = -W + 0.3; x < W - 0.25; x += 0.18) beam(rubber, [x, 1.22, hz - 0.01], [x, 2.48, hz - 0.01], 0.015, 0.015, C('#2a2a2a'));
  rubber.box(0, 2.58, hz, 1.25, 0.06, 0.26, { col: dark }); mb.get('lbBlue').box(-0.31, 2.66, hz, 0.58, 0.1, 0.24, { col: [1, 1, 1] }); mb.get('lbRed').box(0.31, 2.66, hz, 0.58, 0.1, 0.24, { col: [1, 1, 1] });
  rubber.box(0.75, 2.62, hz - 0.12, 0.22, 0.12, 0.1, { col: dark }); mb.get('vlight').box(0.75, 2.62, hz - 0.175, 0.18, 0.08, 0.01);
  // under-deck tool lockers (both sides), chrome T-handles, lettering
  const lz0 = 1.42, lz1 = -1.3, ly0 = 0.42, ly1 = 0.84;
  for (const sx of [-1, 1]) {
    paint.box(sx * (W - 0.3), (ly0 + ly1) / 2, (lz0 + lz1) / 2, 0.6, ly1 - ly0, lz0 - lz1, { col: white });
    rubber.box(sx * (W - 0.0), (ly0 + ly1) / 2, (lz0 + lz1) / 2, 0.01, ly1 - ly0 - 0.02, 0.012, { col: dark }); // door split
    for (const z of [lz0 - 0.3, lz1 + 0.3]) ch.box(sx * (W + 0.005), ly1 - 0.08, z, 0.02, 0.03, 0.12, { col: alu });
    paint.box(sx * (W + 0.002), ly0 + 0.035, (lz0 + lz1) / 2, 0.005, 0.05, lz0 - lz1, { col: C(RS_ORANGE) }); // orange kick strip
    const x = sx * (W + 0.006); const q = (ya, yb, za, zb, uv) => { if (sx > 0) dec.quad([x, ya, zb], [x, ya, za], [x, yb, za], [x, yb, zb], uv, [1, 1, 1]); else dec.quad([x, ya, za], [x, ya, zb], [x, yb, zb], [x, yb, za], uv, [1, 1, 1]); };
    q(0.58, 0.8, lz1 + 0.08, lz0 - 0.08, RS_UV.D); q(0.5, 0.58, lz1 + 0.5, lz0 - 0.5, RS_UV.G);
  }
  // hydraulic control station behind the driver's door (−x = driver side): lever box with three levers + a gauge
  { const x = -(W + 0.02), z = 1.25; paint.box(x + 0.08, 1.02, z, 0.16, 0.3, 0.36, { col: steel }); for (let i = 0; i < 3; i++) beam(ch, [x - 0.01, 1.08, z - 0.12 + i * 0.12], [x - 0.12, 1.24, z - 0.12 + i * 0.12], 0.018, 0.018, alu, unitCyl);
    for (let i = 0; i < 3; i++) part(rubber, unitCyl, [x - 0.125, 1.25, z - 0.12 + i * 0.12], [0, 0, 0], [0.025, 0.04, 0.025], C(['#c4161c', '#1a1a1a', '#e8b414'][i])); part(ch, unitCyl, [x - 0.005, 0.95, z], [0, 0, Math.PI / 2], [0.04, 0.02, 0.04], C('#e8e8e4')); }
  // rear: under-ride bar with the lamp bar, chevron panel, mud flaps
  const rz = -L / 2;
  rubber.box(0, 0.5, rz - 0.15, W * 2 - 0.1, 0.12, 0.1, { col: dark }); for (const sx of [-1, 1]) beam(rubber, [sx * 0.45, 0.72, rz + 0.05], [sx * 0.45, 0.5, rz - 0.15], 0.08, 0.08, dark);
  dec.quad([W - 0.08, 0.6, rz - 0.21], [-W + 0.08, 0.6, rz - 0.21], [-W + 0.08, 0.86, rz - 0.21], [W - 0.08, 0.86, rz - 0.21], RS_UV.I, [1, 1, 1]); // chevrons (flipped so the stripes slope to the centre)
  paint.box(0, 0.73, rz - 0.19, W * 2 - 0.1, 0.3, 0.03, { col: steel });
  for (const sx of [-1, 1]) { rubber.box(sx * (W - 0.32), 0.25, ctx.wr - 0.62, 0.42, 0.42, 0.02, { col: C('#141414') }); }
  // visor lettering (mirrored RECOVERY, front of the sun visor)
  dec.quad([-0.6, 2.56, L / 2 + 0.165], [0.6, 2.56, L / 2 + 0.165], [0.6, 2.645, L / 2 + 0.165], [-0.6, 2.645, L / 2 + 0.165], RS_UV.F, [1, 1, 1]);
}

// ---------------------------------------------------------------- flatbed: the runtime deck (tilt + slide) with its winch
// Local frame of the deck group: origin at the deck's rear edge, bottom, centre; the deck runs along +z. setFlatDeck(k):
// 0 = stowed on the sub-frame, 1 = tilted (FLAT.angle) and slid back until the rear edge is on the road.
let deckGeo = null;
export function buildFlatDeck(M) {
  if (!deckGeo) deckGeo = deckGeometry();
  const grp = new THREE.Group(); grp.name = 'flatDeck';
  for (const [name, geo] of deckGeo) { const mesh = new THREE.Mesh(geo, name === 'chrome' ? M.vchrome : name === 'rubber' ? M.vrubber : name === 'rsa' ? rsDecalMat() : M.vworn); mesh.name = 'deck_' + name; mesh.castShadow = name !== 'rsa'; mesh.receiveShadow = name === 'paint'; grp.add(mesh); }
  const cable = new THREE.Mesh(unitCyl, M.vrubber); cable.name = 'winchCable'; cable.visible = false; cable.castShadow = false;
  const hook = new THREE.Mesh(unitBox, M.vchrome); hook.scale.set(0.05, 0.1, 0.035); hook.visible = false;
  const D = { group: grp, cable, hook, k: 0, angle: 0, slide: 0 }; setFlatDeck(D, 0); return D;
}
function deckGeometry() {
  const parts = new Map(); const get = (n) => { if (!parts.has(n)) parts.set(n, new MiniBuilder()); return parts.get(n); };
  const P = get('paint'), R = get('rubber'), Ch = get('chrome'), D = get('rsa'); const Ld = FLAT.deckL, Wd = FLAT.deckW / 2, t = FLAT.deckT;
  const plate = C('#4a4d52'), rib = C('#5c6066'), orange = C(RS_ORANGE), dark = C('#1d1d1f');
  P.box(0, t / 2, Ld / 2, Wd * 2, t, Ld, plate); // deck plate
  for (let z = 0.35; z < Ld - 0.2; z += 0.32) P.box(0, t + 0.006, z, Wd * 2 - 0.2, 0.012, 0.04, rib); // anti-slip ribs
  for (const sx of [-1, 1]) { P.box(sx * (Wd - 0.04), t + 0.05, Ld / 2, 0.08, 0.1, Ld, orange); for (let z = 0.5; z < Ld; z += 0.7) R.box(sx * (Wd - 0.04), t + 0.11, z, 0.06, 0.02, 0.1, dark); } // side rails, stake pockets
  for (const sx of [-1, 1]) D.quad([sx * (Wd + 0.002), t - 0.01, sx > 0 ? 1.4 : 4.1], [sx * (Wd + 0.002), t - 0.01, sx > 0 ? 4.1 : 1.4], [sx * (Wd + 0.002), t + 0.09, sx > 0 ? 4.1 : 1.4], [sx * (Wd + 0.002), t + 0.09, sx > 0 ? 1.4 : 4.1], RS_UV.C); // 24 HOUR BREAKDOWN SERVICE along the rails
  P.box(0, t / 2 - 0.02, -0.12, Wd * 2 - 0.1, 0.06, 0.26, C('#3a3c40')); // tapered tail plate (rests on the road when tilted)
  for (const sx of [-1, 1]) { R.box(sx * 0.66, -0.07, Ld / 2 + 0.3, 0.12, 0.14, Ld - 1.2, dark); } // long members under the deck (slide on the sub-frame)
  // winch at the head: frame, drum, motor, fairlead
  P.box(0, t + 0.2, Ld - 0.12, 0.9, 0.38, 0.16, C('#3a3c40')); Ch.cyl(0, t + 0.22, Ld - 0.3, 0.13, 0.62, C('#2a2a2a'), true); Ch.cyl(0.42, t + 0.22, Ld - 0.3, 0.1, 0.22, C('#c4161c'), true); Ch.box(0, t + 0.16, Ld - 0.5, 0.18, 0.08, 0.06, C('#9a9ea2'));
  for (const sx of [-1, 1]) Ch.box(sx * (Wd - 0.15), t + 0.04, 0.25, 0.22, 0.04, 0.3, C('#a0a4a8')); // rear tie-down plates
  const out = []; for (const [n, b] of parts) { const g = b.build(); if (g) out.push([n, g]); } return out;
}
// minimal coloured-box builder for the runtime parts (vertex colours like the vehicle bodies, so the same shader programs)
export class MiniBuilder {
  constructor() { this.geos = []; }
  box(x, y, z, sx, sy, sz, col) { const g = unitBox.clone(); g.scale(sx, sy, sz); g.translate(x, y, z); this.push(g, col); return this; }
  cyl(x, y, z, r, len, col, alongX = false, seg = 12) { const g = new THREE.CylinderGeometry(r, r, len, seg); if (alongX) g.rotateZ(Math.PI / 2); g.translate(x, y, z); this.push(g, col); return this; }
  geo(g, col, m = null) { const q = g.clone(); if (m) q.applyMatrix4(m); this.push(q, col); return this; }
  quad(a, b, c, d, uv = [0, 0, 1, 1]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); this.push(g, [1, 1, 1]); return this; }
  push(g, col) { const ng = g.index ? g.toNonIndexed() : g; if (ng !== g) g.dispose(); if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2)); const n = ng.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; } ng.setAttribute('color', new THREE.BufferAttribute(c, 3)); this.geos.push(ng); }
  build() { if (!this.geos.length) return null; let n = 0; for (const g of this.geos) n += g.attributes.position.count; const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3); let o = 0;
    for (const g of this.geos) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); col.set(g.attributes.color.array, o * 3); o += c; g.dispose(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeBoundingSphere(); this.geos = []; return g; }
}
// deck pose. k 0 → 0.35: tilt up to FLAT.angle about the rear support roller; 0.25 → 1: slide back along the tilted line until
// the rear edge reaches the road. Returns the deck frame in vehicle space: { ox, oy, oz (rear edge), angle }.
export function deckPose(k) {
  const A = FLAT.angle * sstep(0, 0.35, k); const Lr0 = FLAT.supportZ - FLAT.rearZ0; // rear edge → support roller, stowed (0.87 m)
  const slideMax = FLAT.deckY / Math.sin(FLAT.angle) - Lr0; const sl = slideMax * sstep(0.25, 1, k); const d = Lr0 + sl;
  return { oy: FLAT.deckY - Math.sin(A) * d, oz: FLAT.supportZ - Math.cos(A) * d, angle: A, slide: sl };
}
export function setFlatDeck(D, k) { if (!D) return; D.k = k; const p = deckPose(k); D.group.position.set(0, p.oy, p.oz); D.group.rotation.set(-p.angle, 0, 0); D.angle = p.angle; D.slide = p.slide; }
// the deck's top surface in vehicle space at deck-local z: [y, z]
export function deckTop(D, lz) { const p = deckPose(D.k); const t = FLAT.deckT; return [p.oy + Math.sin(p.angle) * lz + Math.cos(p.angle) * t, p.oz + Math.cos(p.angle) * lz - Math.sin(p.angle) * t]; }
