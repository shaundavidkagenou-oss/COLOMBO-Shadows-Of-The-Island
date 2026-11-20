// 74th request — the National Hospital's shared materials and its furniture / fixture kit.
// Materials: ONE set for the whole building (walls, floors, ceilings, metal, plastic, fabric, laminate, screens, signs …),
// each a plain MeshStandardMaterial / MeshBasicMaterial with a small procedural texture (256–1024 px, drawn once) so they
// share shader programs with the rest of the game. Every material is named 'Hospital · …' (the Texture Studio lists and
// edits each of them). Repeated items differ by vertex colour only, so a room's furniture merges into a handful of draws.
// Furniture: kit(type, …) draws one item of HospitalPlan.FURNITURE into a MultiBuilder in its own local frame (x = right,
// y = up, z = the way it faces) and returns its collision footprint. Node-safe (no canvas → flat-colour materials).
import * as THREE from 'three';
import { MAT } from '../gfx/Materials.js';
import { canvasTex } from './ShopKit.js';
import { toWorld } from './HospitalPlan.js';

export const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const hasCanvas = () => typeof document !== 'undefined' && !!document.createElement;

// ----------------------------------------------------------------------------------------------- textures (≤ 1024 px)
const speckle = (a, w, h, r, base, n, cols, s0 = 1, s1 = 3) => { a.fillStyle = base; a.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { a.fillStyle = cols[(r() * cols.length) | 0]; const s = s0 + r() * (s1 - s0); a.fillRect(r() * w, r() * h, s, s * (0.6 + r() * 0.8)); } };
export const HTEX = {
  wall: () => canvasTex('h.wall', 256, 256, (a, w, h, r) => { speckle(a, w, h, r, '#f4f2ee', 7000, ['rgba(0,0,0,0.035)', 'rgba(255,255,255,0.06)', 'rgba(120,110,100,0.03)'], 1, 3); }),
  vinyl: () => canvasTex('h.vinyl', 512, 512, (a, w, h, r) => { speckle(a, w, h, r, '#e9e9e6', 26000, ['rgba(80,86,92,0.22)', 'rgba(255,255,255,0.5)', 'rgba(140,150,160,0.25)', 'rgba(60,60,60,0.12)'], 1, 2.6);
    a.strokeStyle = 'rgba(0,0,0,0.08)'; a.lineWidth = 2; a.strokeRect(1, 1, w - 2, h - 2); }), // 2 m sheet seams (repeat 0.5 / m)
  terrazzo: () => canvasTex('h.terrazzo', 512, 512, (a, w, h, r) => { speckle(a, w, h, r, '#e6e1d8', 9000, ['#b9b2a6', '#8f887d', '#cfc6b6', '#6f6a63', '#f5f1ea', '#a89a86'], 1.5, 6);
    a.strokeStyle = 'rgba(150,130,90,0.55)'; a.lineWidth = 3; a.strokeRect(1.5, 1.5, w - 3, h - 3); }), // brass divider every 1 m
  tile: () => canvasTex('h.tile', 256, 256, (a, w, h, r) => { a.fillStyle = '#b8bcbc'; a.fillRect(0, 0, w, h); const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const t = 0.96 + r() * 0.05; a.fillStyle = `rgb(${Math.round(244 * t)},${Math.round(246 * t)},${Math.round(245 * t)})`; a.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); } }), // 25 cm tiles
  ceiling: () => canvasTex('h.ceiling', 256, 256, (a, w, h, r) => { a.fillStyle = '#d9dad8'; a.fillRect(0, 0, w, h); a.fillStyle = '#f3f3f0'; a.fillRect(3, 3, w - 6, h - 6);
    for (let i = 0; i < 2600; i++) { a.fillStyle = 'rgba(90,90,90,0.18)'; a.fillRect(4 + r() * (w - 8), 4 + r() * (h - 8), 1.2, 1.2); } }), // 600 mm lay-in tiles
  brushed: () => canvasTex('h.brushed', 128, 128, (a, w, h, r) => { a.fillStyle = '#c9ccce'; a.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { a.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '60,64,68'},${0.05 + r() * 0.08})`; a.fillRect(0, r() * h, w, 0.6 + r()); } }),
  fabric: () => canvasTex('h.fabric', 128, 128, (a, w, h, r) => { a.fillStyle = '#e8e8e8'; a.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { a.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`; a.fillRect(0, y, w, 1); } for (let x = 0; x < w; x += 2) { a.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.05})`; a.fillRect(x, 0, 1, h); } }),
  laminate: () => canvasTex('h.laminate', 256, 256, (a, w, h, r) => { a.fillStyle = '#d8c4a4'; a.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { a.strokeStyle = r() < 0.6 ? 'rgba(140,100,60,0.25)' : 'rgba(250,235,210,0.25)'; a.lineWidth = 0.6 + r() * 1.6; a.beginPath(); const y = r() * h; for (let x = 0; x <= w; x += 8) a.lineTo(x, y + Math.sin(x * 0.02 + i) * 3); a.stroke(); } }),
  render: () => canvasTex('h.render', 512, 512, (a, w, h, r) => { speckle(a, w, h, r, '#f1eee6', 30000, ['rgba(0,0,0,0.04)', 'rgba(255,255,255,0.07)', 'rgba(110,100,85,0.05)'], 1, 3);
    for (let i = 0; i < 26; i++) { const x = r() * w, g = a.createLinearGradient(x, 0, x, h * (0.2 + r() * 0.5)); g.addColorStop(0, 'rgba(70,64,56,0.10)'); g.addColorStop(1, 'rgba(70,64,56,0)'); a.fillStyle = g; a.fillRect(x, 0, 3 + r() * 10, h); } }), // weathered render, rain streaks
  roof: () => canvasTex('h.roof', 256, 256, (a, w, h, r) => { speckle(a, w, h, r, '#9a9893', 9000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.06)', 'rgba(60,70,50,0.07)'], 1, 4); }),
  paving: () => canvasTex('h.paving', 512, 512, (a, w, h, r) => { a.fillStyle = '#8c8780'; a.fillRect(0, 0, w, h); const bw = 64, bh = 32; // interlocking pavers, 20 × 10 cm
    for (let y = 0, row = 0; y < h; y += bh, row++) for (let x = -(row % 2) * bw / 2; x < w; x += bw) { const t = 0.86 + r() * 0.2; const red = r() < 0.2; a.fillStyle = red ? `rgb(${Math.round(150 * t)},${Math.round(96 * t)},${Math.round(80 * t)})` : `rgb(${Math.round(176 * t)},${Math.round(170 * t)},${Math.round(160 * t)})`; a.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3); } }),
  asphalt: () => canvasTex('h.asphalt', 256, 256, (a, w, h, r) => { speckle(a, w, h, r, '#3c3d3f', 12000, ['rgba(255,255,255,0.08)', 'rgba(0,0,0,0.2)', 'rgba(120,110,100,0.12)'], 1, 2.5); }),
  lawn: () => canvasTex('h.lawn', 256, 256, (a, w, h, r) => { a.fillStyle = '#4f7a35'; a.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { a.fillStyle = r() < 0.5 ? 'rgba(30,60,20,0.3)' : 'rgba(150,190,90,0.25)'; a.fillRect(r() * w, r() * h, 1, 2 + r() * 3); } }),
  leaf: () => canvasTex('h.leaf', 256, 256, (a, w, h, r) => { a.fillStyle = '#2f5a26'; a.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { a.fillStyle = r() < 0.5 ? 'rgba(20,45,15,0.6)' : 'rgba(110,160,70,0.5)'; a.beginPath(); a.ellipse(r() * w, r() * h, 3 + r() * 5, 1.5 + r() * 2.5, r() * 3, 0, 7); a.fill(); } }),
  // window blinds seen from inside in daylight (emissive map: the brightness follows the hour, Hospital.update)
  blinds: () => canvasTex('h.blinds', 128, 256, (a, w, h, r) => { for (let x = 0; x < w; x += 16) { const g = a.createLinearGradient(x, 0, x + 16, 0); g.addColorStop(0, '#d9e1e6'); g.addColorStop(0.5, '#f4f7f8'); g.addColorStop(1, '#c4ccd2'); a.fillStyle = g; a.fillRect(x, 0, 16, h); } for (let i = 0; i < 30; i++) { a.fillStyle = 'rgba(255,255,255,0.05)'; a.fillRect(r() * w, 0, 2, h); } }),
  frost: () => canvasTex('h.frost', 128, 128, (a, w, h, r) => { speckle(a, w, h, r, '#e4ecef', 3000, ['rgba(255,255,255,0.3)', 'rgba(150,170,180,0.12)'], 1, 2); }),
};

// ----------------------------------------------------------------------------------------------- screens atlas (1024 × 512)
// eight 256 × 256 cells: 0 vital-signs monitor, 1 patient-records PC, 2 queue / token board, 3 ward bed board, 4 TV (health
// channel), 5 lift indicator, 6 x-ray viewer, 7 pharmacy token display. Drawn as a lit LCD: dark panel, crisp UI, pixel grid.
export const SCREEN_CELLS = 8;
export function screenUV(cell) { const cx = cell % 4, cy = (cell / 4) | 0; return [cx / 4 + 0.004, 1 - (cy + 1) / 2 + 0.008, (cx + 1) / 4 - 0.004, 1 - cy / 2 - 0.008]; }
function screensTexture() {
  return canvasTex('h.screens', 1024, 512, (a, W, H, r) => {
    const F = (px, wgt = 600) => `${wgt} ${px}px "Barlow Condensed", "Manrope", Arial, sans-serif`;
    const cell = (i, draw) => { a.save(); a.translate((i % 4) * 256, ((i / 4) | 0) * 256); a.beginPath(); a.rect(0, 0, 256, 256); a.clip(); draw(); a.restore(); };
    const panel = (c0, c1) => { const g = a.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, c0); g.addColorStop(1, c1); a.fillStyle = g; a.fillRect(0, 0, 256, 256); };
    const txt = (s, x, y, px, col, al = 'left', wgt) => { a.font = F(px, wgt); a.fillStyle = col; a.textAlign = al; a.textBaseline = 'alphabetic'; a.fillText(s, x, y); };
    // 0 vitals
    cell(0, () => { panel('#04080a', '#020405'); const tr = (y, col, f) => { a.strokeStyle = col; a.lineWidth = 2; a.beginPath(); for (let x = 6; x < 176; x++) { const yy = y + f(x); if (x === 6) a.moveTo(x, yy); else a.lineTo(x, yy); } a.stroke(); };
      tr(52, '#36e05a', (x) => { const p = x % 58; return p > 20 && p < 24 ? -26 + (p - 20) * 3 : p >= 24 && p < 28 ? 14 - (p - 24) * 4 : p > 34 && p < 44 ? -5 * Math.sin((p - 34) / 10 * Math.PI) : 0; });
      tr(118, '#30c8f0', (x) => -10 * Math.max(0, Math.sin(x / 9.5)) ** 2 + 3);
      tr(182, '#f0d23a', (x) => -9 * Math.sin(x / 15) - 3 * Math.sin(x / 5));
      txt('HR', 184, 30, 16, '#36e05a'); txt('76', 250, 70, 48, '#36e05a', 'right', 700); txt('SpO2', 184, 98, 16, '#30c8f0'); txt('98', 250, 138, 44, '#30c8f0', 'right', 700);
      txt('NIBP', 184, 164, 16, '#f0f0f0'); txt('118/76', 250, 196, 30, '#f0f0f0', 'right', 700); txt('RESP 16', 8, 244, 18, '#f0d23a'); txt('TEMP 36.8', 250, 244, 18, '#ff8a6a', 'right');
      a.fillStyle = '#16323a'; a.fillRect(0, 222, 256, 1); });
    // 1 records PC
    cell(1, () => { panel('#e9eef3', '#dfe6ec'); a.fillStyle = '#1d5d8f'; a.fillRect(0, 0, 256, 30); txt('HOSPITAL INFORMATION SYSTEM', 8, 21, 16, '#ffffff', 'left', 700);
      a.fillStyle = '#ffffff'; a.fillRect(8, 40, 240, 70); a.strokeStyle = '#b6c3cf'; a.strokeRect(8.5, 40.5, 240, 70); txt('Patient  ·  OPD 2026/10/4417', 14, 60, 15, '#25313b', 'left', 700);
      for (let k = 0; k < 3; k++) { a.fillStyle = '#cfd9e2'; a.fillRect(14, 70 + k * 12, 120 + r() * 100, 6); }
      for (let k = 0; k < 6; k++) { a.fillStyle = k % 2 ? '#f6f8fa' : '#e8eef4'; a.fillRect(8, 120 + k * 18, 240, 18); a.fillStyle = '#8796a3'; a.fillRect(14, 126 + k * 18, 40, 6); a.fillRect(70, 126 + k * 18, 70 + r() * 80, 6); }
      a.fillStyle = '#2f8f4e'; a.fillRect(176, 232, 72, 18); txt('SAVE', 212, 246, 14, '#fff', 'center', 700); });
    // 2 queue board
    cell(2, () => { panel('#071425', '#030a14'); a.fillStyle = '#0d3b6e'; a.fillRect(0, 0, 256, 40); txt('NOW SERVING', 128, 28, 22, '#ffffff', 'center', 700);
      txt('A-047', 128, 112, 66, '#ffc531', 'center', 700); txt('Counter 1', 128, 140, 20, '#9fd0ff', 'center');
      a.fillStyle = '#0b2440'; a.fillRect(10, 158, 236, 1); [['A-048', 'Registration'], ['P-112', 'Pharmacy'], ['E-009', 'Emergency']].forEach(([n, l], k) => { txt(n, 20, 186 + k * 24, 20, '#e8f2ff', 'left', 700); txt(l, 236, 186 + k * 24, 18, '#7fa8d0', 'right'); }); });
    // 3 bed board
    cell(3, () => { panel('#0b1a16', '#06100d'); txt('WARD 1  ·  BED STATUS', 10, 24, 17, '#d7f5e6', 'left', 700);
      for (let k = 0; k < 6; k++) { const y = 36 + k * 34; const occ = k !== 4; a.fillStyle = occ ? '#123a2c' : '#2a2a12'; a.fillRect(8, y, 240, 28); txt('BED ' + (k + 1), 16, y + 20, 17, '#ffffff', 'left', 700); txt(occ ? 'OCCUPIED' : 'CLEANING', 240, y + 20, 15, occ ? '#5ee0a0' : '#f0d050', 'right', 700); a.fillStyle = occ ? '#5ee0a0' : '#f0d050'; a.fillRect(100, y + 11, 8, 8); } });
    // 4 TV — health channel slide
    cell(4, () => { const g = a.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, '#0f6aa8'); g.addColorStop(1, '#0a3a66'); a.fillStyle = g; a.fillRect(0, 0, 256, 256);
      a.fillStyle = 'rgba(255,255,255,0.12)'; a.beginPath(); a.arc(196, 70, 70, 0, 7); a.fill(); a.fillStyle = '#ffffff'; a.fillRect(176, 40, 40, 60); a.fillRect(166, 60, 60, 20); a.fillStyle = '#d32f2f'; a.fillRect(186, 50, 20, 40); a.fillRect(176, 60, 40, 20);
      txt('WASH YOUR HANDS', 14, 160, 28, '#ffffff', 'left', 700); txt('Clean hands save lives', 14, 186, 18, '#cfe8ff'); a.fillStyle = '#d32f2f'; a.fillRect(0, 222, 256, 34); txt('HEALTH NEWS  ·  Dengue prevention week', 8, 245, 15, '#fff', 'left', 700); });
    // 5 lift indicator
    cell(5, () => { panel('#050505', '#020202'); a.fillStyle = '#ff3b1f'; a.beginPath(); a.moveTo(128, 30); a.lineTo(168, 80); a.lineTo(88, 80); a.fill(); txt('1', 128, 200, 120, '#ff3b1f', 'center', 700); });
    // 6 x-ray viewer (back-lit film)
    cell(6, () => { a.fillStyle = '#e8f1f6'; a.fillRect(0, 0, 256, 256); a.fillStyle = '#16191b'; a.fillRect(16, 16, 224, 224); a.strokeStyle = 'rgba(230,236,240,0.85)'; a.lineWidth = 9; a.beginPath(); a.moveTo(128, 30); a.lineTo(128, 230); a.stroke();
      a.lineWidth = 5; for (let k = 0; k < 7; k++) { const y = 62 + k * 22; for (const s of [-1, 1]) { a.beginPath(); a.moveTo(128, y); a.bezierCurveTo(128 + s * 60, y - 10, 128 + s * 90, y + 10, 128 + s * 88, y + 34); a.stroke(); } }
      a.fillStyle = 'rgba(200,210,215,0.2)'; a.beginPath(); a.ellipse(96, 140, 34, 70, 0, 0, 7); a.fill(); a.beginPath(); a.ellipse(160, 140, 34, 70, 0, 0, 7); a.fill(); txt('R', 26, 40, 16, '#e0e6ea', 'left', 700); });
    // 7 pharmacy token display
    cell(7, () => { panel('#051d12', '#020d08'); txt('PHARMACY', 128, 34, 26, '#8ff0b8', 'center', 700); txt('ෆාමසිය  ·  மருந்தகம்', 128, 60, 17, '#8ff0b8', 'center');
      txt('P-112', 128, 150, 64, '#ffffff', 'center', 700); txt('Please collect your medicine', 128, 196, 17, '#bfeacf', 'center'); });
    // LCD sub-pixel grid + faint glare over everything (reads as a screen, not a printed sticker)
    a.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = 0; y < H; y += 3) a.fillRect(0, y, W, 1); for (let x = 0; x < W; x += 3) a.fillRect(x, 0, 1, H);
    const gl = a.createLinearGradient(0, 0, W, H); gl.addColorStop(0, 'rgba(255,255,255,0.05)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); a.fillStyle = gl; a.fillRect(0, 0, W, H);
  }, { repeat: false, aniso: 8 });
}

// ----------------------------------------------------------------------------------------------- signs atlas (1024 × 1024)
// interior plates (256 × 128 cells, 4 × 6 at the top) and the three big exterior signs below (1024 × 128 each).
export const PLATE = {}; // label → cell index (filled by signsTexture)
const PLATES = [
  ['Reception', 'පිළිගැනීම', 'வரவேற்பு'], ['Pharmacy', 'ෆාමසිය', 'மருந்தகம்'], ['Emergency', 'හදිසි ප්‍රතිකාර', 'அவசர சிகிச்சை'], ['Treatment Room 1', 'ප්‍රතිකාර කාමරය 1', 'சிகிச்சை அறை 1'],
  ['Treatment Room 2', 'ප්‍රතිකාර කාමරය 2', 'சிகிச்சை அறை 2'], ['Toilets', 'වැසිකිළි', 'கழிப்பறை'], ['Stairs', 'පඩිපෙළ', 'படிக்கட்டு'], ['Lift', 'සෝපානය', 'மின்தூக்கி'],
  ['General Ward', 'සාමාන්‍ය වාට්ටුව', 'பொது வார்டு'], ["Nurses' Station", 'හෙද මධ්‍යස්ථානය', 'தாதியர் நிலையம்'], ['Consultation', 'උපදේශන කාමරය', 'ஆலோசனை அறை'], ['Medical Store', 'වෛද්‍ය ගබඩාව', 'மருத்துவ களஞ்சியம்'],
  ['Private Room 1', 'පුද්ගලික කාමරය 1', 'தனி அறை 1'], ['Private Room 2', 'පුද්ගලික කාමරය 2', 'தனி அறை 2'], ['Staff Only', 'කාර්ය මණ්ඩලයට පමණි', 'பணியாளர்கள் மட்டும்'], ['Registration', 'ලියාපදිංචිය', 'பதிவு'],
  ['← Wards · Lift · Stairs', 'වාට්ටු · සෝපානය', 'வார்டுகள் · மின்தூக்கி'], ['Emergency →', 'හදිසි අනතුරු →', 'அவசர →'], ['Fire Exit', 'ගිනි ගැනීමේ පිටවීම', 'தீ வெளியேறும் வழி'], ['Silence Please', 'නිශ්ශබ්දතාව රකින්න', 'அமைதி காக்கவும்'],
  ['Floor 1', '1 වන මහල', 'முதல் மாடி'], ['Ground Floor', 'බිම් මහල', 'தரைத் தளம்'], ['No Smoking', 'දුම් පානය තහනම්', 'புகைபிடிக்க தடை'], ['Wash Hands', 'අත් සෝදන්න', 'கைகளை கழுவவும்'],
];
PLATES.forEach((p, i) => { PLATE[p[0]] = i; });
export const BIG = { main: 0, ed: 1, ambulance: 2, sideName: 3 };
export function plateUV(label) { const i = PLATE[label] ?? 0; const cx = i % 4, cy = (i / 4) | 0; return [cx / 4 + 0.003, 1 - (cy + 1) * 0.125 + 0.003, (cx + 1) / 4 - 0.003, 1 - cy * 0.125 - 0.003]; }
export function bigUV(k) { return [0.002, 1 - (k + 1) / 4 + 0.004, 0.998, 1 - k / 4 - 0.004]; } // exterior signs texture: four 1024 × 128 rows
function signsTexture() {
  return canvasTex('h.signs', 1024, 1024, (a) => {
    const EN = (px) => `700 ${px}px "Barlow Condensed", "Manrope", Arial, sans-serif`, SI = (px) => `600 ${px}px "Noto Sans Sinhala", sans-serif`, TA = (px) => `600 ${px}px "Noto Sans Tamil", sans-serif`;
    a.textAlign = 'center'; a.textBaseline = 'middle';
    PLATES.forEach(([en, si, ta], i) => { const x = (i % 4) * 256, y = ((i / 4) | 0) * 128; const red = /Emergency|Fire|No Smoking/.test(en), grn = /Fire Exit/.test(en);
      a.fillStyle = grn ? '#1e7b3c' : red ? '#b3261e' : '#14508a'; a.fillRect(x + 2, y + 2, 252, 124); a.fillStyle = 'rgba(255,255,255,0.9)'; a.fillRect(x + 2, y + 2, 252, 3);
      a.fillStyle = '#ffffff'; a.font = EN(en.length > 16 ? 34 : 40); a.fillText(en, x + 128, y + 36, 236); a.font = SI(24); a.fillText(si, x + 128, y + 76, 236); a.font = TA(21); a.fillText(ta, x + 128, y + 106, 236); });
  }, { repeat: false, aniso: 8 });
}

function bigSignsTexture() {
  return canvasTex('h.bigsigns', 1024, 512, (a) => {
    const EN = (px) => `700 ${px}px "Barlow Condensed", "Manrope", Arial, sans-serif`, SI = (px) => `600 ${px}px "Noto Sans Sinhala", sans-serif`, TA = (px) => `600 ${px}px "Noto Sans Tamil", sans-serif`;
    a.textAlign = 'center'; a.textBaseline = 'middle';
    const row = (k, bg, draw) => { a.save(); a.translate(0, k * 128); a.fillStyle = bg; a.fillRect(0, 0, 1024, 128); draw(); a.restore(); };
    const cross = (x, y, s, c0, c1) => { a.fillStyle = c0; a.fillRect(x, y, s, s); a.fillStyle = c1; a.fillRect(x + s * 0.36, y + s * 0.14, s * 0.28, s * 0.72); a.fillRect(x + s * 0.14, y + s * 0.36, s * 0.72, s * 0.28); };
    row(0, '#ffffff', () => { cross(18, 14, 100, '#c62828', '#ffffff'); a.fillStyle = '#123f6e'; a.font = EN(66); a.fillText('NATIONAL HOSPITAL', 570, 44, 860); a.font = SI(34); a.fillText('ජාතික රෝහල', 380, 100); a.font = TA(30); a.fillText('தேசிய வைத்தியசாலை', 770, 100);
      a.fillStyle = '#c62828'; a.fillRect(140, 126, 884, 2); });
    row(1, '#c62828', () => { cross(18, 14, 100, '#ffffff', '#c62828'); a.fillStyle = '#ffffff'; a.font = EN(64); a.fillText('ACCIDENT & EMERGENCY', 570, 44, 860); a.font = SI(32); a.fillText('හදිසි අනතුරු ඒකකය', 370, 100); a.font = TA(28); a.fillText('விபத்து அவசர சிகிச்சை', 780, 100); });
    row(2, '#ffd200', () => { a.fillStyle = '#1a1a1a'; a.font = EN(62); a.fillText('AMBULANCE ONLY  ·  KEEP CLEAR', 512, 44, 990); a.font = SI(32); a.fillText('ගිලන් රථ සඳහා පමණි', 300, 100); a.font = TA(28); a.fillText('அம்புலன்ஸ் மட்டும்', 740, 100); });
    row(3, '#123f6e', () => { a.fillStyle = '#ffffff'; a.font = EN(60); a.fillText('OUT-PATIENTS  ·  PHARMACY  ·  WARDS', 512, 44, 990); a.font = SI(30); a.fillText('බාහිර රෝගී අංශය  ·  ෆාමසිය', 330, 100); a.font = TA(26); a.fillText('வெளிநோயாளர் பிரிவு', 770, 100); });
  }, { repeat: false, aniso: 8 });
}

// ----------------------------------------------------------------------------------------------- materials
let HM = null;
export function hospitalMaterials() {
  if (HM) return HM; const cv = hasCanvas();
  const std = (label, o) => { const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.7 }, o)); m.name = 'Hospital · ' + label; return m; };
  const tx = (k, rx = 1, ry = rx) => { const t = cv ? HTEX[k]() : null; if (t) t.repeat.set(rx, ry); return t; };
  HM = {
    h_wall: std('Wall paint', { map: tx('wall'), roughness: 0.9 }),
    h_vinyl: std('Vinyl floor', { map: tx('vinyl'), roughness: 0.35, envMapIntensity: 0.6 }),
    h_terrazzo: std('Terrazzo floor', { map: tx('terrazzo'), roughness: 0.28, envMapIntensity: 0.7 }),
    h_tile: std('Ceramic tiles', { map: tx('tile'), roughness: 0.25, envMapIntensity: 0.6 }),
    h_ceiling: std('Ceiling tiles', { map: tx('ceiling'), roughness: 0.95 }),
    h_metal: std('Brushed steel', { map: tx('brushed'), metalness: 0.75, roughness: 0.35 }),
    h_plastic: std('Plastic & laminate surfaces', { roughness: 0.5 }),
    h_fabric: std('Curtains & upholstery', { map: tx('fabric', 1), roughness: 0.95 }),
    h_wood: std('Timber laminate', { map: tx('laminate'), roughness: 0.55 }),
    h_render: std('Facade render', { map: tx('render'), roughness: 0.92 }),
    h_roof: std('Roof membrane', { map: tx('roof'), roughness: 0.95 }),
    h_paving: std('Forecourt paving', { map: tx('paving'), roughness: 0.85 }),
    h_asphalt: std('Driveway asphalt', { map: tx('asphalt'), roughness: 0.9 }),
    h_lawn: std('Lawn', { map: tx('lawn'), roughness: 1 }),
    h_leaf: std('Shrubs', { map: tx('leaf'), roughness: 0.9 }),
    // exterior window glass: opaque (no transparency sorting), dark and reflective; the inside face shows lit blinds / frost
    h_extGlass: std('Window glass (outside)', { color: 0x9aa9b3, metalness: 0.55, roughness: 0.12, envMapIntensity: 1.4, vertexColors: false }),
    h_blinds: std('Window blinds (inside)', { map: tx('blinds'), emissiveMap: tx('blinds'), emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.8, vertexColors: false }),
    h_frost: std('Frosted glass (inside)', { map: tx('frost'), emissiveMap: tx('frost'), emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.6, vertexColors: false }),
    h_light: Object.assign(new THREE.MeshBasicMaterial({ color: 0xf6f9ff, toneMapped: false }), { name: 'Hospital · Ceiling light panels' }),
    h_screens: Object.assign(new THREE.MeshBasicMaterial({ map: cv ? screensTexture() : null, color: cv ? 0xffffff : 0x223344, toneMapped: false }), { name: 'Hospital · Digital screens' }),
    h_signs: std('Signs', { map: cv ? signsTexture() : null, emissiveMap: cv ? signsTexture() : null, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.55, vertexColors: false }),
    h_bigSigns: std('Exterior signs', { map: cv ? bigSignsTexture() : null, emissiveMap: cv ? bigSignsTexture() : null, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.5, vertexColors: false }),
    h_glass: MAT.glass || std('Clear glass', { color: 0x9fb8c0, transparent: true, opacity: 0.5, vertexColors: false }),
  };
  if (cv && HM.h_screens.map) { HM.h_screens.map.minFilter = THREE.LinearMipmapLinearFilter; }
  return HM;
}
export function hospitalMatTable() { return Object.assign({}, MAT, hospitalMaterials()); }

// ----------------------------------------------------------------------------------------------- furniture frame
// F: an item's local frame. x → right, z → the way it faces, y up from the floor. World = origin + x·right + z·facing with
// facing = (sin yaw, −cos yaw) in world x / z (yaw 0 faces +v = into the building = world −z).
export function itemFrame(u, v, yaw, y) { const [ox, oz] = toWorld(u, v); const c = Math.cos(yaw), s = Math.sin(yaw); return { ox, oz, y, c, s, yaw, rot: -yaw, P(lx, lz) { return [ox + lx * c + lz * s, oz + lx * s - lz * c]; } }; }

const COL = {
  white: C('#f2f3f1'), offwhite: C('#e3e1da'), grey: C('#9aa0a4'), dark: C('#2a2d30'), black: C('#151617'), steel: C('#d6d9db'),
  blue: C('#3f78b5'), navy: C('#21436e'), teal: C('#3b9c9a'), mint: C('#bfe0d2'), green: C('#2e8b57'), red: C('#c0392b'), yellow: C('#e8c547'),
  sheet: C('#f7f8fa'), sheetBlue: C('#c9dcef'), mattress: C('#5b86b8'), curtain: C('#6aa7c9'), curtain2: C('#9cc7b3'), wood: C('#ffffff'), woodDark: C('#a88a66'),
  seat: C('#2d6aa3'), seatGrey: C('#5f6870'), leather: C('#3b4a5a'), plant: C('#3d7a35'), pot: C('#c8b9a0'), paper: C('#fbfbf6'), cork: C('#b08a5a'),
};
export { COL };

// kit: the item drawers. B(mat) → MeshBuilder; F: item frame; x: the item's `extra` object. Returns its footprint
// [x0, x1, z0, z1, top] in the local frame (null: walk-through, e.g. curtains / ceiling rails / wall-mounted items).
const K = {};
function bx(B, F, mat, lx, ly, lz, sx, sy, sz, col, o = {}) { const [x, z] = F.P(lx, lz); B(mat).box(x, F.y + ly, z, sx, sy, sz, Object.assign({ col, rotY: F.rot, bottom: !!o.bottom }, o)); }
function cyl(B, F, mat, lx, ly, lz, r0, r1, h, seg, col) { const [x, z] = F.P(lx, lz); B(mat).cylinder(x, F.y + ly, z, r0, r1, h, seg, { col }); }
// a flat screen quad facing +z (the item's facing) at local (lx, ly, lz), w × h, showing atlas cell `cell`
// (item frames are mirrored — world = (x·c + z·s, x·s − z·c) — so seen from the front local +x is on the viewer's LEFT: the
// corners go +x → −x to face the viewer, image the right way round; tools/hospital-plan-test.mjs §11 checks every quad)
function screen(B, F, lx, ly, lz, w, h, cell) {
  const uv = screenUV(cell); const P = (x, y) => { const [wx, wz] = F.P(lx + x, lz); return [wx, F.y + ly + y, wz]; };
  // facing +z local: counter-clockwise seen from the front (from +z): left-bottom, right-bottom, right-top, left-top
  B('h_screens').quad(P(w / 2, -h / 2), P(-w / 2, -h / 2), P(-w / 2, h / 2), P(w / 2, h / 2), uv);
}
function plateQuad(B, F, lx, ly, lz, w, h, uv) { const P = (x, y) => { const [wx, wz] = F.P(lx + x, lz); return [wx, F.y + ly + y, wz]; }; B('h_signs').quad(P(w / 2, -h / 2), P(-w / 2, -h / 2), P(-w / 2, h / 2), P(w / 2, h / 2), uv); }
export { screen as kitScreen, plateQuad as kitPlate, bx as kitBox };

K.counter = (B, F, x) => { const w = x.w || 4; // reception / nurses' counter: public face (+z side faces the public), worktop at 0.76 behind a 1.1 m transaction ledge
  bx(B, F, 'h_wood', 0, 0.55, 0.28, w, 1.1, 0.06, COL.wood); bx(B, F, 'h_plastic', 0, 0.06, 0.29, w, 0.12, 0.08, COL.dark);
  bx(B, F, 'h_plastic', 0, 1.12, 0.22, w + 0.04, 0.04, 0.34, COL.white); bx(B, F, 'h_plastic', 0, 0.75, -0.12, w, 0.04, 0.72, COL.offwhite);
  bx(B, F, 'h_wood', -w / 2 + 0.02, 0.38, -0.12, 0.04, 0.76, 0.7, COL.wood); bx(B, F, 'h_wood', w / 2 - 0.02, 0.38, -0.12, 0.04, 0.76, 0.7, COL.wood);
  for (let k = -1; k <= 1; k += 2) bx(B, F, 'h_plastic', k * w * 0.25, 0.9, 0.315, w * 0.3, 0.06, 0.012, COL.blue); // accent strips
  if (x.name) plateQuad(B, F, 0, 0.62, 0.315, Math.min(1.6, w * 0.4), 0.8 * 0.5, plateUV(x.name === 'Registration counter' ? 'Registration' : x.name === "Nurses' station" ? "Nurses' Station" : 'Reception'));
  return [-w / 2, w / 2, -0.5, 0.32, 1.14]; };
K.counterEnd = (B, F, x) => { const d = x.d || 1.6; bx(B, F, 'h_wood', 0, 0.55, 0, 0.06, 1.1, d, COL.wood); bx(B, F, 'h_plastic', 0, 1.12, 0, 0.3, 0.04, d, COL.white); bx(B, F, 'h_plastic', -0.3, 0.75, 0, 0.6, 0.04, d, COL.offwhite); return [-0.62, 0.15, -d / 2, d / 2, 1.14]; };
K.officeChair = (B, F, x = {}) => { cyl(B, F, 'h_metal', 0, 0.06, 0, 0.03, 0.03, 0.38, 6, COL.dark); for (let k = 0; k < 5; k++) { const a = k * 1.2566; bx(B, F, 'h_plastic', Math.sin(a) * 0.17, 0.04, Math.cos(a) * 0.17, 0.05, 0.03, 0.05, COL.black); }
  bx(B, F, 'h_plastic', 0, 0.035, 0, 0.5, 0.02, 0.06, COL.black); bx(B, F, 'h_plastic', 0, 0.035, 0, 0.06, 0.02, 0.5, COL.black);
  if (x.npc) return [-0.26, 0.26, -0.26, 0.26, 0.9]; // gas-lift seat + back: set to the sitter's height at runtime (Hospital.js seat shells)
  bx(B, F, 'h_fabric', 0, 0.47, 0.02, 0.48, 0.07, 0.46, COL.navy); bx(B, F, 'h_fabric', 0, 0.82, -0.22, 0.44, 0.5, 0.06, COL.navy); bx(B, F, 'h_metal', 0, 0.6, -0.22, 0.05, 0.2, 0.03, COL.dark); return [-0.26, 0.26, -0.26, 0.26, 0.9]; };
K.visitorChair = (B, F) => { for (const sx of [-0.2, 0.2]) for (const sz of [-0.18, 0.18]) bx(B, F, 'h_metal', sx, 0.22, sz, 0.025, 0.44, 0.025, COL.steel);
  bx(B, F, 'h_fabric', 0, 0.46, 0.02, 0.46, 0.06, 0.44, COL.seat); bx(B, F, 'h_fabric', 0, 0.75, -0.2, 0.44, 0.38, 0.05, COL.seat); return [-0.24, 0.24, -0.24, 0.24, 0.85]; };
K.waitChair = (B, F, x = {}) => { // beam seating module: moulded seat + back on a steel beam
  // the beam runs low (0.22) so a seat set for a short sitter (0.27 m) still clears it; each seat stands on its own bracket
  bx(B, F, 'h_metal', 0, 0.22, -0.05, 0.56, 0.05, 0.06, COL.steel); bx(B, F, 'h_metal', 0, 0.11, -0.05, 0.04, 0.22, 0.04, COL.steel); bx(B, F, 'h_metal', 0, 0.02, -0.05, 0.04, 0.03, 0.42, COL.steel);
  if (x.npc) return [-0.28, 0.28, -0.25, 0.25, 0.9]; // the moulded shell is set to the sitter's height at runtime (Hospital.js)
  bx(B, F, 'h_metal', 0, 0.33, -0.05, 0.05, 0.17, 0.05, COL.steel); bx(B, F, 'h_plastic', 0, 0.44, 0.02, 0.5, 0.05, 0.44, COL.seat); bx(B, F, 'h_plastic', 0, 0.74, -0.2, 0.5, 0.42, 0.05, COL.seat); bx(B, F, 'h_plastic', 0.27, 0.6, 0, 0.04, 0.03, 0.36, COL.dark);
  return [-0.28, 0.28, -0.25, 0.25, 0.9]; };
K.bench = (B, F, x) => { const w = x.w || 2; bx(B, F, 'h_wood', 0, 0.44, 0, w, 0.05, 0.42, COL.wood); bx(B, F, 'h_wood', 0, 0.75, -0.19, w, 0.3, 0.04, COL.wood); for (const s of [-1, 1]) bx(B, F, 'h_metal', s * (w / 2 - 0.1), 0.21, 0, 0.05, 0.42, 0.4, COL.dark); return [-w / 2, w / 2, -0.23, 0.23, 0.9]; };
K.sofa = (B, F, x) => { const w = x.w || 1.8; bx(B, F, 'h_fabric', 0, 0.22, 0, w, 0.24, 0.8, COL.leather); bx(B, F, 'h_fabric', 0, 0.42, 0.04, w - 0.3, 0.16, 0.66, COL.leather); bx(B, F, 'h_fabric', 0, 0.62, -0.33, w, 0.56, 0.16, COL.leather);
  for (const s of [-1, 1]) bx(B, F, 'h_fabric', s * (w / 2 - 0.08), 0.5, 0.02, 0.16, 0.34, 0.76, COL.leather); return [-w / 2, w / 2, -0.4, 0.4, 0.9]; };
K.desk = (B, F, x) => { const w = x.w || 1.4; bx(B, F, 'h_wood', 0, 0.74, 0, w, 0.04, 0.7, COL.wood); bx(B, F, 'h_wood', -w / 2 + 0.22, 0.36, 0, 0.42, 0.72, 0.66, COL.wood); bx(B, F, 'h_plastic', w / 2 - 0.03, 0.36, 0, 0.03, 0.72, 0.66, COL.grey);
  bx(B, F, 'h_wood', 0.1, 0.42, -0.32, w - 0.5, 0.5, 0.02, COL.wood); for (let k = 0; k < 3; k++) bx(B, F, 'h_metal', -w / 2 + 0.22, 0.6 - k * 0.22, 0.335, 0.12, 0.015, 0.012, COL.steel);
  bx(B, F, 'h_plastic', 0.25, 0.77, 0.1, 0.24, 0.02, 0.3, COL.paper); return [-w / 2, w / 2, -0.35, 0.35, 0.78]; };
K.nurseDesk = (B, F, x) => K.counter(B, F, Object.assign({ name: null }, x));
K.pc = (B, F) => { bx(B, F, 'h_plastic', 0, 0.77, 0, 0.2, 0.015, 0.16, COL.dark); bx(B, F, 'h_plastic', 0, 0.9, -0.02, 0.04, 0.24, 0.03, COL.dark); bx(B, F, 'h_plastic', 0, 1.08, 0, 0.52, 0.32, 0.03, COL.black);
  screen(B, F, 0, 1.08, 0.016, 0.48, 0.28, 1); bx(B, F, 'h_plastic', 0, 0.772, 0.26, 0.44, 0.02, 0.14, COL.dark); bx(B, F, 'h_plastic', 0.3, 0.77, 0.26, 0.06, 0.02, 0.1, COL.dark); return null; };
K.phone = (B, F) => { bx(B, F, 'h_plastic', 0, 0.79, 0, 0.18, 0.05, 0.2, COL.dark); bx(B, F, 'h_plastic', -0.05, 0.83, 0, 0.05, 0.04, 0.2, COL.black); return null; };
K.cabinet = (B, F, x) => { const w = x.w || 1.2; bx(B, F, 'h_metal', 0, 0.68, 0, w, 1.36, 0.45, COL.offwhite); const n = Math.max(1, Math.round(w / 0.45));
  for (let k = 0; k < n; k++) { const cx = -w / 2 + (k + 0.5) * w / n; for (let j = 0; j < 4; j++) { bx(B, F, 'h_metal', cx, 0.2 + j * 0.32, 0.228, w / n - 0.03, 0.29, 0.006, COL.grey); bx(B, F, 'h_metal', cx, 0.3 + j * 0.32, 0.236, 0.12, 0.02, 0.012, COL.dark); } }
  return [-w / 2, w / 2, -0.23, 0.23, 1.36]; };
K.shelf = (B, F, x) => { const w = x.w || 2, h = x.h || 2.0; for (const s of [-1, 1]) bx(B, F, 'h_metal', s * (w / 2 - 0.02), h / 2, 0, 0.04, h, 0.4, COL.offwhite); bx(B, F, 'h_metal', 0, h / 2, -0.19, w, h, 0.02, COL.offwhite);
  const nS = Math.max(2, Math.round(h / 0.42)); for (let j = 0; j < nS; j++) { const y = 0.08 + j * (h - 0.1) / (nS - 1); bx(B, F, 'h_metal', 0, y, 0, w - 0.04, 0.025, 0.38, COL.offwhite);
    if (j < nS - 1) for (let k = 0, xx = -w / 2 + 0.1; xx < w / 2 - 0.12; k++) { const bw = 0.08 + ((k * 37 + j * 11) % 9) / 40, bh = 0.1 + ((k * 13 + j * 7) % 7) / 30; const col = [COL.white, COL.sheetBlue, COL.yellow, COL.mint, COL.paper, COL.red][(k + j * 3) % 6];
      if ((k + j) % 7 !== 3) bx(B, F, 'h_plastic', xx + bw / 2, y + 0.012 + bh / 2, 0.02, bw, bh, 0.24, col); xx += bw + 0.02; } }
  return [-w / 2, w / 2, -0.2, 0.2, h]; };
K.pharmCounter = (B, F, x) => { const w = x.w || 3.6; bx(B, F, 'h_wood', 0, 0.5, 0, w, 1.0, 0.6, COL.wood); bx(B, F, 'h_plastic', 0, 1.02, 0.05, w + 0.06, 0.04, 0.72, COL.white); bx(B, F, 'h_plastic', 0, 0.06, 0.28, w, 0.12, 0.06, COL.dark);
  screen(B, F, 0.9, 1.3, 0.2, 0.42, 0.32, 7); bx(B, F, 'h_plastic', 0.9, 1.3, 0.18, 0.46, 0.36, 0.03, COL.black); bx(B, F, 'h_metal', 0.9, 1.1, 0.18, 0.03, 0.12, 0.03, COL.dark);
  return [-w / 2, w / 2, -0.32, 0.4, 1.04]; };
K.medFridge = (B, F) => { bx(B, F, 'h_metal', 0, 0.95, 0, 0.7, 1.9, 0.65, COL.white); bx(B, F, 'h_glass', 0, 1.0, 0.33, 0.56, 1.5, 0.01); bx(B, F, 'h_metal', 0.3, 1.0, 0.345, 0.03, 0.5, 0.03, COL.steel);
  for (let j = 0; j < 4; j++) bx(B, F, 'h_plastic', 0, 0.45 + j * 0.36, 0.05, 0.6, 0.12, 0.4, j % 2 ? COL.sheetBlue : COL.white); return [-0.36, 0.36, -0.33, 0.35, 1.9]; };
K.waterCooler = (B, F) => { bx(B, F, 'h_plastic', 0, 0.5, 0, 0.32, 1.0, 0.32, COL.white); bx(B, F, 'h_plastic', 0, 0.8, 0.165, 0.2, 0.12, 0.01, COL.dark); cyl(B, F, 'h_glass', 0, 1.0, 0, 0.13, 0.13, 0.42, 10); return [-0.17, 0.17, -0.17, 0.17, 1.42]; };
K.plant = (B, F) => { cyl(B, F, 'h_plastic', 0, 0, 0, 0.18, 0.22, 0.42, 10, COL.pot); for (let k = 0; k < 6; k++) { const a = k * 1.05; bx(B, F, 'h_leaf', Math.sin(a) * 0.14, 0.78 + (k % 3) * 0.12, Math.cos(a) * 0.14, 0.34, 0.5, 0.06, COL.plant, { rotY: F.rot + a }); }
  bx(B, F, 'h_leaf', 0, 1.0, 0, 0.3, 0.6, 0.3, COL.plant); return [-0.22, 0.22, -0.22, 0.22, 1.2]; };
K.noticeBoard = (B, F, x) => { const w = x.w || 1.2; bx(B, F, 'h_wood', 0, 1.55, -0.01, w, 0.8, 0.02, COL.cork); for (let k = 0; k < 7; k++) bx(B, F, 'h_plastic', -w / 2 + 0.16 + (k % 4) * (w - 0.3) / 3, 1.75 - ((k / 4) | 0) * 0.36, 0.005, 0.2, 0.26, 0.004, [COL.paper, COL.sheetBlue, COL.yellow][k % 3]); return null; };
K.tvScreen = (B, F, x) => { const cell = x.screen === 'queue' ? 2 : x.screen === 'beds' ? 3 : 4; const w = cell === 4 ? 0.96 : 0.86, h = w * 0.58; const y = cell === 2 ? 2.25 : cell === 3 ? 1.75 : 1.85;
  bx(B, F, 'h_plastic', 0, y, 0.02, w + 0.04, h + 0.04, 0.04, COL.black); screen(B, F, 0, y, 0.041, w, h, cell); bx(B, F, 'h_metal', 0, y, -0.01, 0.2, 0.2, 0.02, COL.dark); return null; };
K.sanitizer = (B, F) => { bx(B, F, 'h_plastic', 0, 1.25, 0.05, 0.12, 0.22, 0.1, COL.white); bx(B, F, 'h_plastic', 0, 1.18, 0.1, 0.06, 0.03, 0.02, COL.blue); return null; };
K.fireExt = (B, F) => { cyl(B, F, 'h_plastic', 0, 0.3, 0.1, 0.08, 0.08, 0.5, 8, COL.red); bx(B, F, 'h_plastic', 0, 0.86, 0.1, 0.06, 0.06, 0.06, COL.black); plateQuad(B, F, 0, 1.45, 0.01, 0.4, 0.2, plateUV('Fire Exit')); return [-0.12, 0.12, 0, 0.2, 0.9]; };
K.wheelchair = (B, F) => { for (const s of [-1, 1]) { cyl(B, F, 'h_metal', s * 0.3, 0.05, -0.05, 0.3, 0.3, 0.03, 12, COL.dark); bx(B, F, 'h_metal', s * 0.24, 0.62, -0.25, 0.025, 0.55, 0.025, COL.steel); bx(B, F, 'h_metal', s * 0.24, 0.1, 0.3, 0.06, 0.12, 0.06, COL.black); }
  bx(B, F, 'h_fabric', 0, 0.5, 0, 0.46, 0.04, 0.44, COL.black); bx(B, F, 'h_fabric', 0, 0.75, -0.23, 0.46, 0.4, 0.03, COL.black); bx(B, F, 'h_metal', 0, 0.2, 0.36, 0.4, 0.02, 0.12, COL.steel); return [-0.34, 0.34, -0.32, 0.4, 0.95]; };
// hospital bed: head at −z (the item faces head → foot), mattress top at 0.62
K.bed = (B, F) => { const L = 2.08, W = 0.98; // 75th: an electric ward bed — shrouded low chassis on twin-wheel castors with a brake bar,
  // a sectioned steel deck, a 14 cm pressure-care mattress (blue PU cover, rounded edges), a fitted sheet wrapped round its sides,
  // a top sheet turned down over a cellular blanket, a plump pillow in a case, moulded head / foot boards (nurse panel on the
  // foot board), split side rails (tube frames, the head rails with the patient handset), corner bumpers and IV sockets.
  for (const sx of [-0.38, 0.38]) for (const sz of [-0.86, 0.86]) { bx(B, F, 'h_metal', sx, 0.1, sz, 0.035, 0.07, 0.035, COL.steel); bx(B, F, 'h_plastic', sx, 0.065, sz, 0.07, 0.05, 0.06, COL.grey);
    for (const o of [-0.022, 0.022]) cyl(B, F, 'h_plastic', sx + o, 0.0, sz, 0.05, 0.05, 0.03, 10, COL.black); }
  bx(B, F, 'h_metal', 0, 0.075, 0.86, 0.72, 0.02, 0.03, COL.dark); bx(B, F, 'h_plastic', 0.25, 0.09, 0.86, 0.12, 0.012, 0.05, C('#d64232')); // brake bar + green/red pedal
  bx(B, F, 'h_plastic', 0, 0.2, 0, W - 0.22, 0.16, L - 0.4, COL.offwhite); bx(B, F, 'h_plastic', 0, 0.12, 0, W - 0.3, 0.04, L - 0.5, COL.grey); // chassis shroud
  bx(B, F, 'h_metal', 0, 0.33, 0, 0.16, 0.1, 0.6, COL.steel); // lifting column
  for (const sg of [-1, 1]) bx(B, F, 'h_metal', sg * (W / 2 - 0.06), 0.43, 0, 0.05, 0.06, L - 0.16, COL.steel); // deck rails
  for (const [z0, z1] of [[-0.9, -0.2], [-0.18, 0.1], [0.12, 0.55], [0.57, 0.9]]) bx(B, F, 'h_metal', 0, 0.455, (z0 + z1) / 2, W - 0.16, 0.025, z1 - z0, C('#cfd3d6')); // deck sections
  // mattress: core + a slightly narrower, taller crown (reads as rounded edges), then the fitted sheet over the top and down the sides
  bx(B, F, 'h_fabric', 0, 0.525, 0, W - 0.12, 0.11, L - 0.2, COL.mattress); bx(B, F, 'h_fabric', 0, 0.54, 0, W - 0.16, 0.12, L - 0.24, COL.mattress);
  bx(B, F, 'h_fabric', 0, 0.603, 0, W - 0.14, 0.012, L - 0.22, COL.sheet); for (const sg of [-1, 1]) bx(B, F, 'h_fabric', sg * (W / 2 - 0.058), 0.565, 0, 0.008, 0.07, L - 0.22, COL.sheet);
  for (const sg of [-1, 1]) bx(B, F, 'h_fabric', 0, 0.565, sg * (L / 2 - 0.108), W - 0.14, 0.07, 0.008, COL.sheet);
  // top sheet + blanket over the lower part, turned down (the cuff), the blanket folded at the foot
  bx(B, F, 'h_fabric', 0, 0.614, 0.32, W - 0.1, 0.01, 1.18, COL.sheetBlue); bx(B, F, 'h_fabric', 0, 0.622, -0.24, W - 0.1, 0.012, 0.09, COL.sheet);
  for (const sg of [-1, 1]) bx(B, F, 'h_fabric', sg * (W / 2 - 0.045), 0.57, 0.32, 0.01, 0.09, 1.18, COL.sheetBlue);
  bx(B, F, 'h_fabric', 0, 0.635, 0.74, W - 0.16, 0.035, 0.3, C('#a9c4de')); bx(B, F, 'h_fabric', 0, 0.656, 0.75, W - 0.2, 0.012, 0.26, C('#b8cfe5'));
  // pillow: a full body + a puffed middle and a thinner border (a pillow case seam), sitting at the head end
  bx(B, F, 'h_fabric', 0, 0.64, -0.76, 0.64, 0.06, 0.4, COL.white); bx(B, F, 'h_fabric', 0, 0.668, -0.76, 0.54, 0.05, 0.3, COL.white); bx(B, F, 'h_fabric', 0, 0.688, -0.76, 0.42, 0.03, 0.2, C('#f8f9fa'));
  bx(B, F, 'h_fabric', 0.33, 0.64, -0.76, 0.02, 0.035, 0.36, C('#e7eaec'));
  // head board (moulded: a lower panel + a rounded top band) and foot board with the nurse control panel + chart holder
  bx(B, F, 'h_plastic', 0, 0.73, -L / 2 + 0.03, W - 0.02, 0.56, 0.05, COL.offwhite); bx(B, F, 'h_plastic', 0, 1.03, -L / 2 + 0.03, W - 0.1, 0.06, 0.06, COL.offwhite); bx(B, F, 'h_plastic', 0, 0.96, -L / 2 + 0.06, W - 0.22, 0.1, 0.012, COL.blue);
  bx(B, F, 'h_plastic', 0, 0.68, L / 2 - 0.03, W - 0.02, 0.44, 0.05, COL.offwhite); bx(B, F, 'h_plastic', 0, 0.91, L / 2 - 0.03, W - 0.1, 0.05, 0.055, COL.offwhite);
  bx(B, F, 'h_plastic', -0.22, 0.8, L / 2 + 0.0, 0.3, 0.12, 0.012, COL.dark); for (let k = 0; k < 4; k++) bx(B, F, 'h_plastic', -0.32 + k * 0.065, 0.78, L / 2 + 0.007, 0.04, 0.03, 0.004, k === 3 ? COL.yellow : COL.grey);
  bx(B, F, 'h_plastic', 0.24, 0.76, L / 2 + 0.01, 0.24, 0.16, 0.02, COL.blue); bx(B, F, 'h_plastic', 0.24, 0.76, L / 2 + 0.022, 0.2, 0.13, 0.003, COL.paper); // chart
  // split side rails: tube frame (top + bottom rail, end posts, two bars) — head pair with the handset recess, foot pair
  for (const sg of [-1, 1]) { const x = sg * (W / 2 + 0.005);
    for (const [zc, len] of [[-0.48, 0.74], [0.42, 0.68]]) { bx(B, F, 'h_plastic', x, 0.83, zc, 0.03, 0.035, len, COL.offwhite); bx(B, F, 'h_plastic', x, 0.66, zc, 0.025, 0.025, len - 0.04, COL.offwhite);
      for (const o of [-len / 2 + 0.03, len / 2 - 0.03]) bx(B, F, 'h_plastic', x, 0.745, zc + o, 0.03, 0.2, 0.035, COL.offwhite); for (const o of [-len / 6, len / 6]) bx(B, F, 'h_plastic', x, 0.745, zc + o, 0.015, 0.17, 0.015, COL.offwhite); }
    bx(B, F, 'h_plastic', x + sg * 0.012, 0.75, -0.5, 0.008, 0.08, 0.14, COL.dark); bx(B, F, 'h_metal', x, 0.5, 0, 0.02, 0.04, 0.3, COL.dark); } // patient handset, rail latch
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { cyl(B, F, 'h_plastic', sx * (W / 2 - 0.02), 0.4, sz * (L / 2 - 0.02), 0.04, 0.04, 0.06, 8, COL.grey); cyl(B, F, 'h_metal', sx * (W / 2 - 0.05), 0.42, sz * (L / 2 - 0.06), 0.012, 0.012, 0.1, 6, COL.steel); } // bumpers, IV sockets
  return [-W / 2, W / 2, -L / 2, L / 2, 0.8]; };
K.examCouch = (B, F) => { const L = 1.9; bx(B, F, 'h_metal', 0, 0.32, 0, 0.6, 0.64, L - 0.3, COL.offwhite); bx(B, F, 'h_fabric', 0, 0.7, 0.15, 0.66, 0.1, L - 0.4, COL.leather); bx(B, F, 'h_fabric', 0, 0.8, -L / 2 + 0.3, 0.66, 0.1, 0.55, COL.leather, { rotY: F.rot });
  bx(B, F, 'h_fabric', 0, 0.756, 0.15, 0.56, 0.01, L - 0.5, COL.paper); bx(B, F, 'h_plastic', 0, 0.12, L / 2 - 0.05, 0.4, 0.12, 0.2, COL.grey); return [-0.34, 0.34, -L / 2, L / 2, 0.85]; };
K.locker = (B, F) => { bx(B, F, 'h_plastic', 0, 0.42, 0, 0.46, 0.84, 0.44, COL.offwhite); bx(B, F, 'h_plastic', 0, 0.86, 0, 0.5, 0.03, 0.48, COL.white); bx(B, F, 'h_plastic', 0, 0.3, 0.225, 0.4, 0.4, 0.01, COL.mint);
  bx(B, F, 'h_metal', 0.15, 0.62, 0.23, 0.08, 0.015, 0.015, COL.steel); bx(B, F, 'h_plastic', -0.08, 0.93, 0.05, 0.08, 0.12, 0.08, COL.white); bx(B, F, 'h_glass', 0.1, 0.93, -0.05, 0.07, 0.14, 0.07); return [-0.25, 0.25, -0.24, 0.24, 0.9]; };
K.monitor = (B, F, x) => { const y = x.wall ? 1.75 : 1.45; if (!x.wall) { cyl(B, F, 'h_metal', 0, 0.02, 0, 0.22, 0.2, 0.04, 10, COL.dark); cyl(B, F, 'h_metal', 0, 0.06, 0, 0.02, 0.02, y - 0.2, 6, COL.steel); }
  else bx(B, F, 'h_metal', 0, y, -0.03, 0.1, 0.1, 0.06, COL.dark);
  // 75th: a patient monitor body (moulded case, carry handle, alarm lamp bar, rotary knob, side module slots); its screen is
  // dark glass (OFF) — Hospital.js lays a live, animated screen over it only while a patient is in the bed it serves
  bx(B, F, 'h_plastic', 0, y, -0.005, 0.37, 0.31, 0.1, COL.offwhite); bx(B, F, 'h_plastic', 0, y, 0.046, 0.345, 0.285, 0.006, C('#cfd0cc'));
  bx(B, F, 'h_plastic', 0, y + 0.01, 0.05, MON_SCR.w + 0.012, MON_SCR.h + 0.012, 0.004, C('#0b0e10')); // the glass (off)
  bx(B, F, 'h_plastic', 0, y + 0.172, -0.01, 0.2, 0.03, 0.03, COL.offwhite); bx(B, F, 'h_plastic', 0, y + 0.162, 0.03, 0.12, 0.012, 0.02, C('#e0e2de')); // handle, alarm lamp bar
  cyl(B, F, 'h_plastic', 0.155, y - 0.12, 0.05, 0.014, 0.014, 0.012, 8, COL.dark); bx(B, F, 'h_plastic', -0.14, y - 0.125, 0.05, 0.012, 0.006, 0.004, C('#f0a020')); // knob, standby LED
  for (const sy of [-0.06, 0.04]) bx(B, F, 'h_plastic', 0.186, y + sy, -0.005, 0.004, 0.07, 0.07, COL.grey);
  bx(B, F, 'h_plastic', 0, y - 0.142, 0.05, 0.3, 0.012, 0.004, COL.blue); return x.wall ? null : [-0.2, 0.2, -0.2, 0.2, 1.6]; };
export const MON_SCR = { w: 0.3, h: 0.22, dy: 0.01, dz: 0.0535 }; // the screen rectangle (item-local, above the mount height)
export function monitorY(x) { return x && x.wall ? 1.75 : 1.45; }
K.ivStand = (B, F) => { for (let k = 0; k < 5; k++) { const a = k * 1.2566; bx(B, F, 'h_metal', Math.sin(a) * 0.14, 0.05, Math.cos(a) * 0.14, 0.04, 0.03, 0.3, COL.steel, { rotY: F.rot + a }); cyl(B, F, 'h_plastic', Math.sin(a) * 0.27, 0, Math.cos(a) * 0.27, 0.025, 0.025, 0.04, 6, COL.black); }
  cyl(B, F, 'h_metal', 0, 0.05, 0, 0.012, 0.012, 1.95, 6, COL.steel); bx(B, F, 'h_metal', 0, 2.0, 0, 0.42, 0.012, 0.012, COL.steel);
  bx(B, F, 'h_glass', 0.14, 1.82, 0, 0.11, 0.2, 0.04); bx(B, F, 'h_plastic', 0.14, 1.95, 0, 0.03, 0.06, 0.03, COL.white); bx(B, F, 'h_plastic', 0, 1.15, 0.04, 0.12, 0.16, 0.08, COL.offwhite); screen(B, F, 0, 1.17, 0.081, 0.08, 0.05, 0);
  return [-0.2, 0.2, -0.2, 0.2, 2.0]; };
K.crashCart = (B, F) => { bx(B, F, 'h_plastic', 0, 0.5, 0, 0.75, 0.9, 0.5, COL.red); for (let j = 0; j < 5; j++) bx(B, F, 'h_plastic', 0, 0.2 + j * 0.16, 0.255, 0.68, 0.13, 0.01, COL.red); for (let j = 0; j < 5; j++) bx(B, F, 'h_metal', 0, 0.24 + j * 0.16, 0.265, 0.3, 0.02, 0.015, COL.steel);
  bx(B, F, 'h_plastic', 0, 0.97, 0, 0.8, 0.04, 0.55, COL.dark); bx(B, F, 'h_plastic', 0.1, 1.08, 0, 0.36, 0.18, 0.28, COL.yellow); screen(B, F, 0.1, 1.1, 0.142, 0.16, 0.1, 0); for (const s of [-1, 1]) cyl(B, F, 'h_plastic', s * 0.3, 0, 0.18, 0.04, 0.04, 0.06, 6, COL.black);
  return [-0.42, 0.42, -0.3, 0.3, 1.2]; };
K.trolley = (B, F) => { for (const sx of [-0.25, 0.25]) for (const sz of [-0.18, 0.18]) bx(B, F, 'h_metal', sx, 0.45, sz, 0.02, 0.9, 0.02, COL.steel); for (const y of [0.15, 0.55, 0.9]) bx(B, F, 'h_metal', 0, y, 0, 0.56, 0.02, 0.42, COL.steel);
  bx(B, F, 'h_plastic', -0.1, 0.95, 0, 0.18, 0.08, 0.14, COL.white); bx(B, F, 'h_plastic', 0.12, 0.93, 0.05, 0.14, 0.04, 0.1, COL.sheetBlue); return [-0.3, 0.3, -0.23, 0.23, 1.0]; };
K.medTrolley = (B, F) => { bx(B, F, 'h_plastic', 0, 0.5, 0, 0.62, 0.84, 0.46, COL.white); for (let j = 0; j < 4; j++) bx(B, F, 'h_plastic', 0, 0.22 + j * 0.19, 0.235, 0.56, 0.16, 0.01, [COL.blue, COL.yellow, COL.green, COL.red][j]); bx(B, F, 'h_metal', 0, 0.95, -0.25, 0.5, 0.03, 0.03, COL.steel); return [-0.33, 0.33, -0.27, 0.25, 1.0]; };
K.linenCart = (B, F) => { bx(B, F, 'h_metal', 0, 0.55, 0, 0.9, 1.1, 0.5, COL.steel); for (let j = 0; j < 3; j++) bx(B, F, 'h_fabric', 0, 0.35 + j * 0.3, 0, 0.84, 0.2, 0.44, j % 2 ? COL.sheetBlue : COL.sheet); return [-0.46, 0.46, -0.26, 0.26, 1.1]; };
K.cylinders = (B, F) => { for (let k = 0; k < 4; k++) { cyl(B, F, 'h_metal', -0.45 + k * 0.3, 0, 0, 0.11, 0.11, 1.3, 10, k % 2 ? COL.white : COL.dark); cyl(B, F, 'h_metal', -0.45 + k * 0.3, 1.3, 0, 0.11, 0.04, 0.14, 10, COL.white); } bx(B, F, 'h_metal', 0, 0.9, 0.12, 1.2, 0.04, 0.02, COL.yellow); return [-0.6, 0.6, -0.14, 0.14, 1.5]; };
K.sink = (B, F) => { bx(B, F, 'h_plastic', 0, 0.84, 0.25, 0.55, 0.16, 0.45, COL.white); bx(B, F, 'h_metal', 0, 1.0, 0.07, 0.04, 0.24, 0.04, COL.steel); bx(B, F, 'h_metal', 0, 1.1, 0.14, 0.04, 0.03, 0.18, COL.steel); bx(B, F, 'h_plastic', 0.4, 1.3, 0.05, 0.22, 0.3, 0.1, COL.white);
  bx(B, F, 'h_tile', 0, 1.25, 0.01, 0.8, 0.6, 0.012, COL.white); return [-0.3, 0.3, 0, 0.5, 0.92]; };
K.sinkRow = (B, F, x) => { const n = x.n || 2; for (let k = 0; k < n; k++) K.sink(B, Object.assign({}, F, { P: (lx, lz) => F.P(lx + (k - (n - 1) / 2) * 0.8, lz) }), {}); return [-n * 0.4, n * 0.4, 0, 0.5, 0.92]; };
K.mirror = (B, F, x) => { const w = x.w || 1.2; bx(B, F, 'h_metal', 0, 1.55, 0.01, w, 0.75, 0.01, COL.steel, { }); return null; };
K.wcStalls = (B, F, x) => { const n = x.n || 3, w = 1.0, d = 1.6; for (let k = 0; k <= n; k++) bx(B, F, 'h_plastic', -n * w / 2 + k * w, 1.0, 0, 0.03, 1.85, d, COL.teal);
  for (let k = 0; k < n; k++) { const cx = -n * w / 2 + (k + 0.5) * w; bx(B, F, 'h_plastic', cx - 0.12, 1.0, d / 2, w - 0.27, 1.85, 0.03, COL.teal); bx(B, F, 'h_metal', cx + 0.2, 1.0, d / 2 + 0.02, 0.04, 0.06, 0.02, COL.steel);
    bx(B, F, 'h_plastic', cx, 0.22, -0.45, 0.38, 0.44, 0.5, COL.white); bx(B, F, 'h_plastic', cx, 0.62, -0.72, 0.4, 0.4, 0.16, COL.white); bx(B, F, 'h_plastic', cx, 0.45, -0.42, 0.38, 0.03, 0.46, COL.offwhite); }
  bx(B, F, 'h_plastic', 0, 1.94, 0, n * w, 0.04, 0.04, COL.steel); return [-n * w / 2, n * w / 2, -d / 2, d / 2 + 0.03, 2.0]; };
K.curtain = (B, F, x) => { const w = x.w || 3; bx(B, F, 'h_metal', 0, 2.5, 0, w, 0.03, 0.04, COL.steel); const n = Math.round(w / 0.24); // a drawn privacy curtain: pleated
  for (let k = 0; k < n; k++) bx(B, F, 'h_fabric', -w / 2 + (k + 0.5) * w / n, 1.4, (k % 2) * 0.05 - 0.025, w / n + 0.02, 2.1, 0.012, COL.curtain); return null; };
K.bay = (B, F, x) => { const w = x.w || 2.7, d = x.d || 3; const y = 2.5; // ceiling track round the bay + curtains on the two side lines (open at the front)
  bx(B, F, 'h_metal', -w / 2, y, 0, 0.03, 0.03, d, COL.steel); bx(B, F, 'h_metal', w / 2, y, 0, 0.03, 0.03, d, COL.steel); bx(B, F, 'h_metal', 0, y, d / 2, w, 0.03, 0.03, COL.steel);
  for (const s of [-1, 1]) { const n = Math.round((d - 0.4) / 0.22); for (let k = 0; k < n; k++) bx(B, F, 'h_fabric', s * w / 2 + ((k % 2) * 0.05 - 0.025), 1.4, -d / 2 + 0.2 + (k + 0.5) * (d - 0.4) / n, 0.012, 2.05, (d - 0.4) / n + 0.02, COL.curtain2); }
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) bx(B, F, 'h_fabric', s * (w / 2 - 0.12 - k * 0.07), 1.4, d / 2 - (k % 2) * 0.04, 0.08, 2.05, 0.012, COL.curtain2); // bunched at the front corners
  return null; };
K.curtainRail = (B, F, x) => { const w = x.w || 2.6, d = x.d || 2.6; const y = 2.55; for (const s of [-1, 1]) { bx(B, F, 'h_metal', s * w / 2, y, 0, 0.03, 0.03, d, COL.steel); }
  bx(B, F, 'h_metal', 0, y, d / 2, w, 0.03, 0.03, COL.steel); for (const s of [-1, 1]) for (let k = 0; k < 5; k++) bx(B, F, 'h_fabric', s * w / 2 + ((k % 2) * 0.04 - 0.02), 1.45, -d / 2 + 0.1 + k * 0.1, 0.012, 2.1, 0.12, COL.curtain); return null; };
K.whiteboard = (B, F, x) => { const w = x.w || 2; bx(B, F, 'h_plastic', 0, 1.5, 0.01, w, 1.0, 0.02, COL.white); bx(B, F, 'h_metal', 0, 1.0, 0.04, w, 0.03, 0.06, COL.steel);
  for (let k = 0; k < 8; k++) bx(B, F, 'h_plastic', -w / 2 + 0.2 + (k % 4) * 0.42, 1.8 - ((k / 4) | 0) * 0.2, 0.022, 0.3, 0.02, 0.002, k % 3 ? COL.blue : COL.red); return null; };
K.viewer = (B, F) => { bx(B, F, 'h_plastic', 0, 1.6, 0.04, 0.82, 0.56, 0.08, COL.offwhite); screen(B, F, 0, 1.6, 0.081, 0.76, 0.5, 6); return null; };
K.wardrobe = (B, F, x) => { const w = x.w || 1.2; bx(B, F, 'h_wood', 0, 1.0, 0, w, 2.0, 0.58, COL.wood); bx(B, F, 'h_wood', 0, 1.0, 0.292, 0.01, 1.9, 0.004, COL.woodDark); for (const s of [-1, 1]) bx(B, F, 'h_metal', s * 0.06, 1.05, 0.3, 0.02, 0.3, 0.02, COL.steel); return [-w / 2, w / 2, -0.3, 0.3, 2.0]; };

export const KIT_TYPES = Object.keys(K);
// draw one FURNITURE entry; returns the world AABB of its footprint { x0, x1, z0, z1, top } (or null)
export function drawItem(B, f, floorY) {
  const [type, , u, v, yaw = 0, extra = {}] = f; const fn = K[type]; if (!fn) { console.warn('hospital kit: unknown item', type); return null; }
  const F = itemFrame(u, v, yaw, floorY); const fp = fn(B, F, extra || {}); if (!fp) return null;
  const [a, b, c, d, top] = fp; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [lx, lz] of [[a, c], [b, c], [b, d], [a, d]]) { const [x, z] = F.P(lx, lz); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0, x1, z0, z1, top: floorY + top, type };
}
