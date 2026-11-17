// Colombo Fort railway station (54th request: "do not miss a single detail").
// Built from the real station: the long white single-storey frontage on Olcott Mawatha with its cantilevered canopy on
// curved iron brackets and the trilingual fascia (FORT RAILWAY STATION · කොටුව දුම්රිය ස්ථානය · கோட்டை புகையிரத நிலையம்);
// the white central pavilion with the round clock in a curved, scrolled pediment, balustrade and ball finials; the round-
// arched entrance pavilion with pilasters and urn finials; brown hipped roofs; the green mosaic dado; palms in planters; the
// white barrel awning over the outside counters (season tickets / special counter) with the red LED clock.
// Inside: the booking hall — white-painted walls over a green-grey mosaic dado, dark timber ticket windows with vertical bars
// and a brown sill, white boards with big red counter numbers and trilingual destinations, tall fare boards, stainless queue
// rails, hanging LCD departure screens, ceiling fans and tube lights, wooden benches, the kiosks; behind the windows the clerks
// at their desks with the old Edmondson ticket racks. The intercity reservations office (yellow trilingual sign, dark-red
// counter front with black diamonds, glass screens on stainless posts, tiled ceiling, fans, AC unit, clock, barred window)
// and the announcer's room (desk under a window onto platform 1, gooseneck microphone, PA console, timetable, clock).
// Behind: the train shed — riveted lattice arched trusses on slender round iron columns with curved brackets, a corrugated
// roof with a glazed ridge clerestory, pendant lamps, square white platform signs with red numerals, LCD boards, clocks, PA
// horn speakers; platform 1 and two island platforms with ochre faces, terracotta pavers, a white coping and the yellow
// tactile strip; the footbridge with its stairs; the stabling sidings with buffer stops, a stabled maroon rake and a parked
// blue S11-style set; benches; the mesh-caged staff kiosk.
// Draw cost: everything solid goes into the landmarks' shared MultiBuilder (no extra draw calls); the signs are 4 small
// canvas atlases (1024×256 each — the size of one 512² texture), the clock hands one InstancedMesh, the red LED clock one
// 128×32 canvas. No lights are created (the tubes are emissive, the light pools are the landmarks' existing decal).
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { LayerRouter, mergeLayered, stationMaterial, colKey } from '../gfx/StationPBR.js';
import { setInterior, setInteriorNight, patchInterior } from '../gfx/InteriorLight.js';
import { MAT } from '../gfx/Materials.js';
import * as goods from '../gfx/Goods.js';
import { officeChair } from '../gfx/OfficeChair.js';
import { RNG } from '../core/rng.js';
import { FORT } from './FortStationData.js';
import { RAIL_TOP, BALLAST_Y, GAUGE } from './Railway.js';
import { buildClassicCoach, buildDmuCar, ebox, beam, solids, COACH_LEN, CAR_LEN as DMU_LEN } from '../vehicles/TrainModels.js';
// thin bars (window bars, railings, balusters): a square-section beam reads the same at these sizes for 12 triangles instead of 32
const rod = (b, ax, ay, az, bx, by, bz, r, col) => beam(b, ax, ay, az, bx, by, bz, r * 2, r * 2, col);

const W = '#f1ede2', CREAM = '#e6dcc4', DADO = '#5d7c6b', DADO_D = '#466253', PLINTH = '#6e6c66', SHUT = '#2f4a3a', WOOD = '#4a2c1a', SILL = '#6b3f22', BENCH = '#7a4e2c';
const TERRA = '#a65a3e', OCHRE = '#c8842e', TACT = '#e2bf1c', COPING = '#d9d5c9', IRON = '#2c3a33', STEEL = '#b9bdbf', DARK = '#1c1c1c', ROOF = '#76503a';

// ---------------------------------------------------------------- sign atlases (canvas, 1024 × 256)
function atlasCanvas() { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; return [c, c.getContext('2d')]; }
const FS = (w, px, fam = '"Barlow Condensed", "Noto Sans", sans-serif') => `${w} ${px}px ${fam}`;
const SI = (px) => `700 ${px}px "Noto Sans Sinhala", sans-serif`, TA = (px) => `700 ${px}px "Noto Sans Tamil", sans-serif`;
function txt(x, s, cx, cy, font, col, maxW) { x.font = font; x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, cx, cy, maxW); }
// uv rect of a canvas pixel rect (CanvasTexture flipY: canvas top = v 1)
const UVR = (x, y, w, h, CW = 1024, CH = 256) => [x / CW, 1 - (y + h) / CH, (x + w) / CW, 1 - y / CH];
function buildAtlases() {
  const A = {};
  { // A: fascia lettering (4 rows of 1024 × 64, boards 16:1)
    const [c, x] = atlasCanvas(); x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, 1024, 256);
    txt(x, 'FORT  RAILWAY  STATION', 512, 33, FS(700, 54, '"Cormorant Garamond", "Times New Roman", serif'), '#151515', 1000);
    txt(x, 'කොටුව දුම්රිය ස්ථානය', 512, 97, SI(46), '#151515', 1000);
    txt(x, 'கோட்டை புகையிரத நிலையம்', 512, 161, TA(42), '#151515', 1000);
    { // the pavilion frieze: Latin, Sinhala and Tamil each in its own face (Barlow has no Sinhala / Tamil glyphs: the old line lost them)
      const parts = [['COLOMBO FORT', FS(700, 46)], ['  ·  ', FS(700, 46)], ['කොටුව', SI(40)], ['  ·  ', FS(700, 46)], ['கோட்டை', TA(36)]]; let w = 0; for (const [t, f] of parts) { x.font = f; w += x.measureText(t).width; }
      let px = 512 - w / 2; x.fillStyle = '#1b2b3a'; x.textAlign = 'left'; x.textBaseline = 'middle'; for (const [t, f] of parts) { x.font = f; x.fillText(t, px, 226); px += x.measureText(t).width; } }
    A.a = c;
  }
  { // B: the counter boards — big red number, trilingual destination
    const [c, x] = atlasCanvas(); x.fillStyle = '#fbfbf7'; x.fillRect(0, 0, 1024, 256);
    FORT.counterSigns.forEach(([n, en, si, sub], i) => { const ox = (i % 4) * 256, oy = Math.floor(i / 4) * 128; x.strokeStyle = '#222'; x.lineWidth = 3; x.strokeRect(ox + 3, oy + 3, 250, 122);
      txt(x, n, ox + 44, oy + 66, FS(800, 100), '#d0161b', 80); txt(x, si, ox + 166, oy + 30, SI(19), '#1a1a1a', 160); txt(x, en, ox + 166, oy + 64, FS(700, 24), '#1a1a1a', 162); txt(x, sub, ox + 166, oy + 98, FS(700, 22), '#d0161b', 160); });
    A.b = c;
  }
  { // C: fare boards ×2 · intercity sign · announcements sign · platform numbers · clock dial
    const [c, x] = atlasCanvas(); x.fillStyle = '#fbfbf5'; x.fillRect(0, 0, 1024, 256);
    const fares = [['MARADANA', 20, 40], ['DEMATAGODA', 30, 50], ['KELANIYA', 40, 70], ['RAGAMA', 60, 110], ['GAMPAHA', 80, 140], ['VEYANGODA', 100, 190], ['POLGAHAWELA', 150, 270], ['PERADENIYA', 190, 340], ['KANDY', 200, 360], ['BADULLA', 400, 720]];
    const fares2 = [['KOLLUPITIYA', 20, 30], ['WELLAWATTE', 30, 50], ['MOUNT LAVINIA', 40, 60], ['MORATUWA', 50, 90], ['PANADURA', 60, 110], ['KALUTARA S.', 90, 160], ['ALUTHGAMA', 110, 200], ['HIKKADUWA', 160, 290], ['GALLE', 180, 320], ['MATARA', 230, 410]];
    [[fares, 'MAIN LINE'], [fares2, 'COAST LINE']].forEach(([L, t], k) => { const ox = k * 256; x.fillStyle = '#123a73'; x.fillRect(ox + 4, 4, 248, 40); txt(x, t + ' · FARES (Rs.)', ox + 128, 17, FS(700, 22), '#fff', 240); txt(x, 'ALL STATIONS   3 CLASS   2 CLASS', ox + 128, 36, FS(600, 13), '#ffd54a', 240);
      L.forEach(([s, a, b], i) => { const y = 58 + i * 19.5; x.fillStyle = i % 2 ? '#eef0f4' : '#fbfbf5'; x.fillRect(ox + 4, y - 9, 248, 19); x.textAlign = 'left'; x.font = FS(700, 15); x.fillStyle = '#1a1a1a'; x.fillText(s, ox + 10, y); x.textAlign = 'right'; x.fillText(a.toFixed(2), ox + 186, y); x.fillText(b.toFixed(2), ox + 246, y); }); x.strokeStyle = '#333'; x.lineWidth = 3; x.strokeRect(ox + 3, 3, 250, 250); });
    x.fillStyle = '#f2c230'; x.fillRect(512, 0, 256, 128); x.strokeStyle = '#3a2a00'; x.lineWidth = 4; x.strokeRect(514, 2, 252, 124);
    txt(x, 'INTERCITY TRAIN RESERVATIONS', 640, 24, FS(800, 24), '#141414', 244); txt(x, 'අන්තර් නගර දුම්රිය වෙන්කිරීම්', 640, 52, SI(17), '#141414', 244); txt(x, 'நகரங்களுக்கிடையிலான ரயில் முன்பதிவு', 640, 76, TA(14), '#141414', 244); txt(x, 'KANDY · JAFFNA / K.K.S · BATTICALOA · VAVUNIYA', 640, 104, FS(700, 15), '#7a1010', 244);
    x.fillStyle = '#123a73'; x.fillRect(512, 128, 256, 128); txt(x, 'ANNOUNCEMENTS', 640, 160, FS(800, 34), '#fff', 240); txt(x, 'නිවේදන', 640, 198, SI(26), '#fff', 240); txt(x, 'அறிவிப்புகள்', 640, 232, TA(22), '#fff', 240);
    ['01', '02', '03', '04', '05', '11', '16', 'i'].forEach((s, i) => { const ox = 768 + (i % 4) * 64, oy = Math.floor(i / 4) * 64; x.fillStyle = '#fff'; x.fillRect(ox + 1, oy + 1, 62, 62); x.strokeStyle = '#222'; x.lineWidth = 3; x.strokeRect(ox + 2, oy + 2, 60, 60); txt(x, s, ox + 32, oy + 34, FS(800, 46), s === 'i' ? '#123a73' : '#d0161b', 58); });
    { const cx = 832, cy = 192, r = 60; x.fillStyle = '#fbf8ee'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 5; x.stroke();
      for (let k = 0; k < 60; k++) { const a = (k / 60) * Math.PI * 2, l = k % 5 ? 4 : 10; x.lineWidth = k % 5 ? 1.5 : 3.5; x.beginPath(); x.moveTo(cx + Math.sin(a) * (r - 4), cy - Math.cos(a) * (r - 4)); x.lineTo(cx + Math.sin(a) * (r - 4 - l), cy - Math.cos(a) * (r - 4 - l)); x.stroke(); }
      for (let k = 1; k <= 12; k++) { const a = (k / 12) * Math.PI * 2; txt(x, String(k), cx + Math.sin(a) * (r - 20), cy - Math.cos(a) * (r - 20) + 1, FS(700, 13, 'serif'), '#111'); } }
    x.fillStyle = '#d8d8d0'; x.fillRect(896, 128, 128, 128); txt(x, 'TICKETS', 960, 150, FS(800, 22), '#123a73', 120); txt(x, 'ප්‍රවේශ පත්‍ර', 960, 182, SI(16), '#123a73', 120); txt(x, 'பயணச்சீட்டுகள்', 960, 212, TA(13), '#123a73', 120); txt(x, '→', 960, 240, FS(800, 24), '#123a73', 120);
    A.c = c;
  }
  { // D (lit): LCD departure boards, kiosk / wayfinding signs
    const [c, x] = atlasCanvas(); x.fillStyle = '#050607'; x.fillRect(0, 0, 1024, 256);
    const lcd = (ox, oy, rows, head) => { x.fillStyle = '#0b0f14'; x.fillRect(ox + 2, oy + 2, 508, 124); x.fillStyle = '#123a73'; x.fillRect(ox + 2, oy + 2, 508, 24); txt(x, head, ox + 256, oy + 14, FS(700, 18), '#fff', 500);
      rows.forEach((r, i) => { const y = oy + 42 + i * 22; x.font = FS(700, 18); x.fillStyle = '#ffb21a'; x.textAlign = 'left'; x.fillText(r[0], ox + 10, y); x.fillText(r[1], ox + 80, y); x.textAlign = 'right'; x.fillText(r[2], ox + 400, y); x.fillStyle = r[3] === 'ON TIME' ? '#5be35b' : '#ff5a4a'; x.fillText(r[3], ox + 500, y); }); };
    lcd(0, 0, [['06:10', 'MARADANA', 'PF 1', 'ON TIME'], ['06:25', 'WELLAWATTE', 'PF 1', 'ON TIME'], ['06:55', 'KANDY  (I/C)', 'PF 4', 'DELAYED'], ['07:20', 'GALLE  MATARA', 'PF 2', 'ON TIME']], 'DEPARTURES · පිටත්වීම් · புறப்பாடு');
    lcd(512, 0, [['06:05', 'WELLAWATTE', 'PF 1', 'ON TIME'], ['06:18', 'MARADANA', 'PF 1', 'ON TIME'], ['06:40', 'BADULLA', 'PF 4', 'DELAYED'], ['07:02', 'PUTTALAM', 'PF 3', 'ON TIME']], 'ARRIVALS · පැමිණීම් · வருகை');
    const sign = (ox, oy, w, en, si, ta, bg, fg) => { x.fillStyle = bg; x.fillRect(ox + 2, oy + 2, w - 4, 60); txt(x, en, ox + w / 2, oy + 20, FS(800, 22), fg, w - 12); txt(x, `${si}   ${ta}`, ox + w / 2, oy + 46, SI(15), fg, w - 12); };
    sign(0, 128, 256, 'FOOD & DRINKS', 'ආහාර පාන', 'உணவு பானம்', '#8a1c1c', '#fff2c2'); sign(256, 128, 256, 'BOOKS · NEWSPAPERS', 'පොත් · පුවත්පත්', 'புத்தகங்கள்', '#1f4d2b', '#fff');
    sign(512, 128, 256, 'TO PLATFORMS', 'වේදිකා වෙත', 'மேடைகளுக்கு', '#123a73', '#fff'); sign(768, 128, 256, 'WAY OUT', 'පිටවීම', 'வெளியேறும் வழி', '#1d6b3a', '#fff');
    sign(0, 192, 256, 'SEASON TICKETS  11', 'සීසන් ටිකට්', 'பருவச்சீட்டு', '#fbfbf5', '#c3121a'); sign(256, 192, 256, 'SPECIAL COUNTER  16', 'විශේෂ කවුළුව', 'சிறப்பு கருமபீடம்', '#fbfbf5', '#c3121a');
    sign(512, 192, 256, 'TEA · ISSO WADE', 'තේ · ඉස්සෝ වඩේ', 'தேநீர் · வடை', '#f2c230', '#2a1a00'); sign(768, 192, 256, 'WAITING ROOM', 'පොරොත්තු ශාලාව', 'காத்திருப்பு அறை', '#123a73', '#fff');
    A.d = c;
  }
  return A;
}
const T = { // tile uv rects
  fascia: (row) => UVR(0, row * 64, 1024, 64), counter: (i) => UVR((i % 4) * 256, Math.floor(i / 4) * 128, 256, 128),
  fare: (k) => UVR(k * 256, 0, 256, 256), intercity: UVR(512, 0, 256, 128), announce: UVR(512, 128, 256, 128),
  num: (i) => UVR(768 + (i % 4) * 64, Math.floor(i / 4) * 64, 64, 64), dial: UVR(768, 128, 128, 128), tickets: UVR(896, 128, 128, 128),
  lcd: (k) => UVR(k * 512, 0, 512, 128), sign: (k) => UVR((k % 4) * 256, 128 + Math.floor(k / 4) * 64, 256, 64),
};
// vertical sign quad facing one axis direction, CCW from the front (see MeshBuilder.quad)
// round sign (clock dial) facing one axis direction: a fan over the uv rect's inscribed circle
function signDisc(B, cx, cy, cz, r, face, uv, seg = 40) {
  const n = FACE_N[face], rt = FACE_R[face]; const uc = (uv[0] + uv[2]) / 2, vc = (uv[1] + uv[3]) / 2, ur = (uv[2] - uv[0]) / 2 * (60 / 64), vr = (uv[3] - uv[1]) / 2 * (60 / 64);
  for (let k = 0; k < seg; k++) { const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2; const P = (a) => [cx + rt[0] * Math.cos(a) * r, cy + Math.sin(a) * r, cz + rt[2] * Math.cos(a) * r];
    const b = B.vcount; const pc = [cx, cy, cz], p0 = P(a0), p1 = P(a1);
    B.vert(...pc, ...n, uc, vc); B.vert(...p0, ...n, uc + Math.cos(a0) * ur, vc + Math.sin(a0) * vr); B.vert(...p1, ...n, uc + Math.cos(a1) * ur, vc + Math.sin(a1) * vr); B.idx.push(b, b + 1, b + 2); }
}
function signQuad(B, cx, cy, cz, w, h, face, uv) {
  const a = cy - h / 2, b = cy + h / 2, hw = w / 2;
  if (face === '-z') B.quad([cx + hw, a, cz], [cx - hw, a, cz], [cx - hw, b, cz], [cx + hw, b, cz], uv);
  else if (face === '+z') B.quad([cx - hw, a, cz], [cx + hw, a, cz], [cx + hw, b, cz], [cx - hw, b, cz], uv);
  else if (face === '+x') B.quad([cx, a, cz + hw], [cx, a, cz - hw], [cx, b, cz - hw], [cx, b, cz + hw], uv);
  else B.quad([cx, a, cz - hw], [cx, a, cz + hw], [cx, b, cz + hw], [cx, b, cz - hw], uv);
}
const FACE_N = { '-z': [0, 0, -1], '+z': [0, 0, 1], '+x': [1, 0, 0], '-x': [-1, 0, 0] };
const FACE_R = { '-z': [-1, 0, 0], '+z': [1, 0, 0], '+x': [0, 0, -1], '-x': [0, 0, 1] }; // viewer's right

export function buildFortStation({ mb, colliders, group, C, hip, lightPool }) {
  const F = FORT, Y = F.Y, FL = F.FL, TOP = F.bld.top, ZF0 = F.bld.z0;
  const cc = (c) => (Array.isArray(c) ? c : C(c));
  // 55th: every opaque surface of the station is on the layered PBR material (gfx/StationPBR.js): the builder routes each
  // part to a real surface (plaster, mosaic, terrazzo, timber, cast iron, stainless …) from its colour
  const lmb = new MultiBuilder(); const LK = new Map(); const lay = (layer, ...hex) => { for (const h of hex) LK.set(colKey(cc(h)), layer); };
  lay('wood', WOOD, SILL, BENCH, '#5a4a38', '#6d5a44', '#5a3a22', '#6b4428', '#3e2a18', '#6b4a2c', '#5d4a36', '#2a1d14', '#7a6a52', '#5a3520');
  lay('timberPaint', SHUT, '#7a2a1c', '#6a1a14', '#3a2618', '#e8e4d8'); lay('mosaic', DADO, DADO_D); lay('pavers', TERRA, '#9a5a44', '#8e4d35'); lay('rubber', TACT, '#111', '#1b1b1d', '#1e1e1e', '#2b2d30', '#2c2c2c', '#151515', '#1a1a1a', '#121212');
  lay('terrazzo', '#cfc6b0', '#9a8f7c'); lay('vinyl', '#b9b1a0', '#a49c8c', '#8f8676'); lay('enamel', '#2a2a2a', '#f0f0ec', '#fff', '#1c1c1c', '#d8d8d4'); lay('brass', '#b08d57'); lay('fabric', '#1f2a44'); lay('concrete', '#7a7a74', COPING, '#9f9a90', '#8e8a80', '#9a948a', '#a8846a', '#8f8b84', PLINTH, '#b7b2a6', '#b1aca0', '#6e6a62', '#d8d2c2');
  lay('iron', IRON, '#3c4a42', '#2c3a33', '#4a5a4a', '#3a4a3a', '#2d4a3c', '#4a4f4c', '#222', '#333', '#3a3a3a', '#7a1515'); lay('steel', STEEL, '#ddd', '#ccc', '#888', '#bfc3c2', '#555', '#666', '#b8b4ae', '#444'); lay('under', '#6a625a');
  const pick = (c) => LK.get(colKey(c));
  const stone = new LayerRouter(lmb, 'concrete', pick), wallM = new LayerRouter(lmb, 'plaster', (c) => { const k = pick(c); return k === 'mosaic' || k === 'concrete' ? k : null; }), paint = new LayerRouter(lmb, 'paint', pick), metal = new LayerRouter(lmb, 'iron', (c) => { const k = pick(c); return k === 'steel' || k === 'under' || k === 'rubber' || k === 'enamel' || k === 'wood' ? k : null; });
  const wglass = mb.get('winGlass'), glass = mb.get('glass'), emis = mb.get('emissive'), corr = mb.get('corrugated');
  // box from bounds
  const B = (b, x0, x1, y0, y1, z0, z1, col, o = {}) => { if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0]; if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return; b.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, { col: cc(col), uvScale: o.uv || 3, bottom: o.bottom ?? true, top: o.top ?? true }); };
  const XC = new THREE.CylinderGeometry(1, 1, 1, 18); const xcyl = (b, xa, xb2, y, z, r, col) => b.geometry(XC, new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeScale(Math.abs(xb2 - xa), r, r)).setPosition((xa + xb2) / 2, y, z), col); // round bar along x
  const coll = (x0, x1, z0, z1, h, extra = {}) => colliders.push({ x0, x1, z0, z1, h, kind: 'landmark', ...extra });
  const surf = (x0, x1, z0, z1, h, kind = 'platform', extra = {}) => colliders.push({ x0, x1, z0, z1, h, kind, ...extra });
  const up = (b, x0, x1, z0, z1, y, col) => b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [x0 / 3, z0 / 3, x1 / 3, z1 / 3], cc(col)); // upward rectangle
  const down = (b, x0, x1, z0, z1, y, col) => b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 0, 1, 1], cc(col)); // downward (ceilings)
  const sb = new MultiBuilder(); const SA = sb.get('sA'), SBd = sb.get('sB'), SC = sb.get('sC'), SD = sb.get('sD');
  // 55th: LCD departure / arrival screens — a 16:8 panel in a slim black bezel behind a glass cover, hung on two rods; the
  // picture is one live canvas (top half departures, bottom half arrivals) redrawn from the running trains (anim.live)
  const LB = new MultiBuilder().get('lcd');
  const lcdScreen = (x, y, z, f, k, hang) => { const n = FACE_N[f], W = 1.9, H = 0.95, hw = W / 2 + 0.06, hh = H / 2 + 0.06;
    const bx = n[0] ? [x - n[0] * 0.1, x] : [x - hw, x + hw], bz = n[2] ? [z - n[2] * 0.1, z] : [z - hw, z + hw];
    B(paint, Math.min(...bx), Math.max(...bx), y - hh, y + hh, Math.min(...bz), Math.max(...bz), '#141516'); // bezel + back box
    B(paint, Math.min(...bx) + (n[0] ? 0 : 0.6), Math.max(...bx) - (n[0] ? 0 : 0.6), y - hh - 0.035, y - hh, Math.min(...bz) + (n[2] ? 0 : 0.6), Math.max(...bz) - (n[2] ? 0 : 0.6), '#202224'); // chin with the status LED
    B(emis, x + n[0] * 0.002 - (n[0] ? 0.004 : -0.75), x + n[0] * 0.002 + (n[0] ? 0.004 : 0.77), y - hh - 0.022, y - hh - 0.012, z + n[2] * 0.002 - (n[2] ? 0.004 : -0.75), z + n[2] * 0.002 + (n[2] ? 0.004 : 0.77), [0.1, 0.9, 0.3]);
    signQuad(LB, x + n[0] * 0.004, y, z + n[2] * 0.004, W, H, f, k ? [0, 0, 1, 0.5] : [0, 0.5, 1, 1]);
    signQuad(glass, x + n[0] * 0.012, y, z + n[2] * 0.012, W + 0.04, H + 0.04, f, [0, 0, 1, 1]); // cover glass: catches the lamps
    if (hang) for (const e of [-0.65, 0.65]) { const hx = x + (n[0] ? -n[0] * 0.05 : e), hz = z + (n[2] ? -n[2] * 0.05 : e); metal.cylinder(hx, y + hh, hz, 0.012, 0.012, Math.max(0.1, hang - y - hh), 6, { col: cc('#8a8d8f') }); B(metal, hx - 0.04, hx + 0.04, y + hh, y + hh + 0.03, hz - 0.04, hz + 0.04, '#5a5d5f'); }
    lcdSpots.push({ x, y, z, f, k }); };
  const lcdSpots = [], hangSigns = [];
  const GB = new MultiBuilder(), GD = GB.get('goods'), BG = GB.get('bottleGlass'); // printed goods + bottle glass (section 8)
  const clocks = []; // {x, y, z, face, r}
  const anim = { clocks, ledMeshes: [] };
  // a round station clock (55th): case behind the dial plane, a moulded / brass rim proud of it, the round enamel dial
  // (atlas C, cut round — no square corners), glass over the dial; the hands are the animated InstancedMesh (anim.hands)
  const ORI = (face) => { const m = new THREE.Matrix4(); if (face === '-z' || face === '+z') m.makeRotationX(Math.PI / 2); else m.makeRotationZ(Math.PI / 2); return m; };
  const clockFace = (x, y, z, face, r, o = {}) => { const n = FACE_N[face], d = o.depth ?? 0.1, rw = o.rimW ?? 0.06; const rimB = o.plaster ? wallM : paint;
    const cg = new THREE.CylinderGeometry(r + rw * 0.3, r + rw * 0.45, d, 36, 1, false); paint.geometry(cg, ORI(face).setPosition(x - n[0] * d / 2, y, z - n[2] * d / 2), cc(o.case || '#1c1c1c')); cg.dispose();
    const tg = new THREE.TorusGeometry(r + rw * 0.25, rw * 0.5, 8, 44); const tm = new THREE.Matrix4(); if (n[0]) tm.makeRotationY(Math.PI / 2); tm.setPosition(x + n[0] * 0.012, y, z + n[2] * 0.012); rimB.geometry(tg, tm, cc(o.rim || '#b08d57')); tg.dispose();
    signDisc(SC, x + n[0] * 0.004, y, z + n[2] * 0.004, r, face, T.dial);
    if (o.glass !== false) { const gg = new THREE.CylinderGeometry(r, r, 0.006, 32); glass.geometry(gg, ORI(face).setPosition(x + n[0] * 0.04, y, z + n[2] * 0.04), cc('#dfe8ea')); gg.dispose(); }
    clocks.push({ x, y, z, face, r: r * 0.95 }); };

  // ================================================================ 1. building: plinth, floors, walls with real openings
  // Olcott Mawatha's footway is only ~1 m wide in front of the frontage (the carriageway edge is at z −651), so the five steps
  // from the street up to the hall floor sit INSIDE each entrance (through the wall and into a stair well in the slab)
  const STEP_R = 0.2, STEP_T = 0.3, NSTEP = Math.round((FL - Y) / STEP_R), RUN = NSTEP * STEP_T;
  const PZ = ZF0 - 0.8; // outer face of the two pavilions
  const stairs = F.entrances.map((e) => ({ x0: e.x - e.w / 2, x1: e.x + e.w / 2, z0: e.main ? PZ : ZF0, z1: (e.main ? PZ : ZF0) + RUN })).concat([{ x0: F.res.portalX - 1.6, x1: F.res.portalX + 1.6, z0: PZ, z1: PZ + RUN }]);
  // a rectangle minus the stair wells → pieces (x split at the wells' edges, z intervals subtracted)
  const minusStairs = (x0, x1, z0, z1) => { const xs = [x0, x1]; for (const h of stairs) for (const v of [h.x0, h.x1]) if (v > x0 && v < x1) xs.push(v); xs.sort((a, b) => a - b); const out = [];
    for (let i = 0; i < xs.length - 1; i++) { const a = xs[i], b = xs[i + 1]; if (b - a < 1e-4) continue; const m = (a + b) / 2; const hz = stairs.filter((h) => m > h.x0 && m < h.x1).map((h) => [h.z0, h.z1]); for (const [c, d] of solids(z0, z1, hz)) out.push([a, b, c, d]); } return out; };
  const upC = (b, x0, x1, z0, z1, y, col) => { for (const [a, c, d, e] of minusStairs(x0, x1, z0, z1)) up(b, a, c, d, e, y, col); };
  for (const [a, b, c, d] of minusStairs(F.bld.x0, F.bld.x1, F.bld.z0, F.bld.z1)) { B(stone, a, b, Y - 0.05, FL, c, d, '#8e8a80'); surf(a, b, c, d, FL); } // plinth = floor slab
  for (const h of stairs) { for (let k = 0; k < NSTEP; k++) { const z0 = h.z0 + k * STEP_T, top = Y + STEP_R * (k + 1); B(stone, h.x0, h.x1, Y - 0.05, top, z0, h.z1, k % 2 ? '#b7b2a6' : '#b1aca0'); B(paint, h.x0, h.x1, top - 0.03, top + 0.002, z0, z0 + 0.05, '#6e6a62'); surf(h.x0, h.x1, z0, h.z1, top, 'deck'); }
    for (const xe of [h.x0 + 0.06, h.x1 - 0.06]) { if (h.z1 <= ZF0 + 0.45) continue; const za = ZF0 + 0.45; for (const zz of [za, h.z1]) metal.cylinder(xe, FL, zz, 0.025, 0.025, 1.0, 8, { col: cc(STEEL) }); rod(metal, xe, FL + 0.98, za, xe, FL + 0.98, h.z1, 0.02, cc(STEEL)); rod(metal, xe, FL + 0.5, za, xe, FL + 0.5, h.z1, 0.015, cc(STEEL)); coll(xe - 0.04, xe + 0.04, za, h.z1, FL + 1.0); } } // well-side handrails in the hall
  B(paint, F.bld.x0 - 0.02, F.bld.x1 + 0.02, Y, FL - 0.02, F.bld.z0 - 0.03, F.bld.z0, PLINTH, { top: false });
  // the masonry above a round arch in a wall along x: centre cx, springing line sy, radius r, up to `top`, between z0 and z1
  const archFill = (b, cx, sy, r, top, z0, z1, col) => { const sh = new THREE.Shape(); sh.moveTo(-r, 0); sh.lineTo(-r, top - sy); sh.lineTo(r, top - sy); sh.lineTo(r, 0); for (let k = 1; k < 24; k++) { const a = (k / 24) * Math.PI; sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); } sh.lineTo(-r, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, curveSegments: 1 }); b.geometry(g, new THREE.Matrix4().makeTranslation(cx, sy, z0), typeof col === 'string' ? cc(col) : col); g.dispose(); };
  // a wall along x (face planes z0 / z1) with openings [x0, x1, top, arch?]: solid piers full height, lintels / arch spandrels
  const wallX = (z0, z1, xa, xb, holes, col, o = {}) => {
    const hs = holes.filter((h) => h[1] > xa && h[0] < xb).sort((p, q) => p[0] - q[0]); let x = xa;
    for (const h of hs) { if (h[0] > x) { B(wallM, x, h[0], FL, TOP, z0, z1, col); if (!o.noColl) coll(x, h[0], z0, z1, TOP); } x = Math.max(x, h[1]);
      const [h0, h1, ht, arch, sill] = h; if (sill) B(wallM, h0, h1, FL, sill, z0, z1, col);
      if (arch) { const r = (h1 - h0) / 2; archFill(wallM, h0 + r, ht - r, r, TOP, z0, z1, col); } // 55th: a true semicircular arch (it was 14 stepped boxes)
      else B(wallM, h0, h1, ht, TOP, z0, z1, col);
      if (o.noColl !== true && sill && o.sillColl) coll(h0, h1, z0, z1, TOP); }
    if (xb > x) { B(wallM, x, xb, FL, TOP, z0, z1, col); if (!o.noColl) coll(x, xb, z0, z1, TOP); }
  };
  const wallZ = (x0, x1, za, zb, holes, col, o = {}) => {
    const hs = holes.filter((h) => h[1] > za && h[0] < zb).sort((p, q) => p[0] - q[0]); let z = za;
    for (const h of hs) { if (h[0] > z) { B(wallM, x0, x1, FL, TOP, z, h[0], col); coll(x0, x1, z, h[0], TOP); } z = Math.max(z, h[1]); const [h0, h1, ht, , sill] = h; if (sill) B(wallM, x0, x1, FL, sill, h0, h1, col); B(wallM, x0, x1, ht, o.top || TOP, h0, h1, col); if (sill) coll(x0, x1, h0, h1, TOP); }
    if (zb > z) { B(wallM, x0, x1, FL, TOP, z, zb, col); coll(x0, x1, z, zb, TOP); }
  };
  const ZF = F.bld.z0, ZB = F.bld.z1, X0 = F.bld.x0, X1 = F.bld.x1;
  const frontHoles = F.entrances.map((e) => [e.x - e.w / 2, e.x + e.w / 2, FL + e.h]).concat([[F.res.portalX - 1.6, F.res.portalX + 1.6, FL + 4.2, true]]);
  wallX(ZF, ZF + 0.4, X0, X1, frontHoles, W);
  const backHoles = F.backArches.map((x) => [x - F.archW / 2, x + F.archW / 2, FL + 6.0, true]).concat([[F.ann.door.x - 0.55, F.ann.door.x + 0.55, FL + 2.2], [F.ann.win[0], F.ann.win[1], FL + 2.3, false, FL + 1.0], [-6, -2, FL + 2.6, false, FL + 1.2]]);
  wallX(ZB - 0.4, ZB, X0, X1, backHoles, W, { sillColl: true });
  B(wallM, X0, X0 + 0.4, FL, TOP, ZF, ZB, W); B(wallM, X1 - 0.4, X1, FL, TOP, ZF, ZB, W);
  coll(X0, -60, ZF, ZB, TOP); // west wing (offices; the clerks' strip behind the counter is inside it)
  coll(8.2, X1, ZF, -638.2, TOP); coll(18.2, X1, -638.2, ZB, TOP); // east block offices
  // hall west wall: the eight ticket windows (openings through to the clerks)
  wallZ(-60.4, -60.0, ZF + 0.4, ZB - 0.4, F.windows.map((w) => [w.z - 0.65, w.z + 0.65, FL + 2.25, false, FL + 0.95]), W);
  // hall east wall with the door into the reservations office, reservation office east wall, announcer's room walls
  wallZ(-10.2, -9.8, ZF + 0.4, ZB - 0.4, [[F.res.door.z - 1, F.res.door.z + 1, FL + 2.6]], W);
  wallZ(7.8, 8.2, ZF + 0.4, ZB - 0.4, [], W);
  B(wallM, 8.2, 18.2, FL, TOP, -638.2, -637.8, W); coll(8.2, 18.2, -638.2, -637.8, TOP); B(wallM, 17.8, 18.2, FL, TOP, -637.8, ZB - 0.4, W);
  B(wallM, -64.2, -63.8, FL, TOP, ZF + 0.4, ZB - 0.4, CREAM); // clerks' strip back wall
  // ceilings
  down(paint, -60, -10.2, ZF + 0.4, ZB - 0.4, F.hall.ceil, '#f4f2ea'); down(paint, -63.8, -60.4, ZF + 0.4, ZB - 0.4, FL + 3.4, '#ece8dc');
  down(paint, -9.8, 7.8, ZF + 0.4, ZB - 0.4, FL + 4.2, '#efede6'); down(paint, 8.2, 17.8, -637.8, ZB - 0.4, FL + 3.2, '#efede6');
  for (let x = -9.8; x < 7.8; x += 0.6) B(paint, x, x + 0.02, FL + 4.17, FL + 4.19, ZF + 0.4, ZB - 0.4, '#c9c6bc'); for (let z = ZF + 0.4; z < ZB - 0.4; z += 0.6) B(paint, -9.8, 7.8, FL + 4.17, FL + 4.19, z, z + 0.02, '#c9c6bc'); // tiled ceiling grid
  // floors: hall checker tiles (cream / terracotta-grey terrazzo), office vinyl
  upC(paint, -60, -10.2, ZF + 0.4, ZB - 0.4, FL + 0.003, '#cfc6b0');
  for (let x = -60, i = 0; x < -10.2 - 0.01; x += 0.6, i++) for (let z = ZF + 0.4, j = 0; z < ZB - 0.4 - 0.01; z += 0.6, j++) if ((i + j) % 2) upC(paint, x, Math.min(x + 0.6, -10.2), z, Math.min(z + 0.6, ZB - 0.4), FL + 0.005, '#9a8f7c');
  upC(paint, -9.8, 7.8, ZF + 0.4, ZB - 0.4, FL + 0.003, '#b9b1a0'); up(paint, 8.2, 17.8, -637.8, ZB - 0.4, FL + 0.003, '#a49c8c'); up(paint, -63.8, -60.4, ZF + 0.4, ZB - 0.4, FL + 0.003, '#8f8676');
  // interior mosaic dado (green-grey) with a dark top trim, all round the hall and the reservations office
  const dado = (x0, x1, z0, z1) => { B(paint, x0, x1, FL, FL + 1.2, z0, z1, DADO, { bottom: false }); const dx = x1 - x0 > z1 - z0; B(paint, dx ? x0 : x0 - 0.005, dx ? x1 : x1 + 0.005, FL + 1.2, FL + 1.26, dx ? z0 - 0.005 : z0, dx ? z1 + 0.005 : z1, DADO_D); };
  for (const [a, b] of [[-60, -53.5], [-50.5, -37.5], [-32.5, -19.5], [-16.5, -10.2]]) dado(a, b, ZF + 0.4, ZF + 0.42);
  for (const [a, b] of [[-60, -52.5], [-47.5, -37.5], [-32.5, -22.5], [-17.5, -10.2]]) dado(a, b, ZB - 0.42, ZB - 0.4);
  dado(-10.22, -10.2, ZF + 0.4, F.res.door.z - 1); dado(-10.22, -10.2, F.res.door.z + 1, ZB - 0.4);
  dado(-9.8, -2.6, ZF + 0.4, ZF + 0.42); dado(-0.6 + 1.2, 7.8, ZF + 0.4, ZF + 0.42); dado(-9.8, 7.8, ZB - 0.42, ZB - 0.4); dado(-9.8, -9.78, ZF + 0.4, F.res.door.z - 1); dado(-9.8, -9.78, F.res.door.z + 1, ZB - 0.4); // (55th: this one ran straight across the waiting-room doorway)

  // ================================================================ 2. facade: windows, pilasters, cornice, dado, canopy, pavilions
  const fx = (x, zf, sgn) => { // decorative tall window with segmental arch head on a facade plane (sgn −1: facing −z)
    const z = zf + sgn * 0.02, w = 1.7, y0 = FL + 1.35, y1 = FL + 3.9;
    B(wglass, x - w / 2 + 0.06, x + w / 2 - 0.06, y0 + 0.05, y1, z - 0.01, z + 0.01, '#000');
    for (const e of [-1, 1]) B(paint, x + e * (w / 2 - 0.05) - 0.05, x + e * (w / 2 - 0.05) + 0.05, y0, y1 + 0.2, z - 0.04, z + 0.04, SHUT);
    for (let k = 0; k < 11; k++) { const yy = y0 + 0.12 + k * 0.155; B(paint, x - w / 2 + 0.1, x + w / 2 - 0.1, yy, yy + 0.07, z - 0.05, z + 0.05, SHUT); } // louvred lower shutters (upper part glazed fanlight)
    B(paint, x - 0.025, x + 0.025, y0, y0 + 1.85, z - 0.05, z + 0.05, SHUT);
    B(paint, x - w / 2 - 0.12, x + w / 2 + 0.12, y0 - 0.1, y0, z - 0.14 * -sgn, z, '#d8d2c2'); // sill
    const R = 1.6; for (let k = 0; k < 9; k++) { const a0 = -0.56 + (k / 9) * 1.12, a1 = -0.56 + ((k + 1) / 9) * 1.12; const xa = x + Math.sin(a0) * R, xb = x + Math.sin(a1) * R, ya = y1 - R + Math.cos(a0) * R + 0.38, yb = y1 - R + Math.cos(a1) * R + 0.38; beam(paint, xa, ya, z + sgn * 0.04, xb, yb, z + sgn * 0.04, 0.18, 0.08, cc('#e9e4d6')); } // segmental arch moulding
    B(paint, x - 0.14, x + 0.14, y1 + 0.18, y1 + 0.52, z + sgn * 0.02, z + sgn * 0.09, '#e3dccb'); // keystone
  };
  const frontBays = []; for (let x = X0 + 2.5; x < X1 - 2; x += 4) { if (frontHoles.some((h) => x > h[0] - 1.3 && x < h[1] + 1.3)) continue; if ((x > -42 && x < -28) || (x > -5.2 && x < 3.2) || (x > -93 && x < -83)) continue; frontBays.push(x); }
  for (const x of frontBays) fx(x, ZF, -1);
  for (let x = X0 + 2.5; x < X1 - 2; x += 4) { if (x > -61 && x < 18.5) continue; fx(x, ZB, 1); } // back elevation (west wing, east offices)
  for (let x = X0 + 0.5; x <= X1 - 0.5; x += 4) { if (frontHoles.some((h) => x > h[0] - 0.4 && x < h[1] + 0.4) || (x > -41.4 && x < -28.6) || (x > -4.9 && x < 2.9)) continue; B(wallM, x - 0.25, x + 0.25, FL + 1.1, TOP - 0.6, ZF - 0.1, ZF, '#f6f3ea'); } // pilasters
  for (const [zf, s] of [[ZF, -1], [ZB, 1]]) { B(wallM, X0 - 0.3, X1 + 0.3, TOP - 0.6, TOP - 0.3, s < 0 ? zf - 0.25 : zf, s < 0 ? zf : zf + 0.25, '#f3efe4'); B(wallM, X0 - 0.45, X1 + 0.45, TOP - 0.3, TOP, s < 0 ? zf - 0.4 : zf, s < 0 ? zf : zf + 0.4, '#ece6d6'); } // cornice
  // outside mosaic dado on the front (green), with a dark capping line
  for (const [a, b] of (() => { const o = []; let x = X0; for (const h of [...frontHoles].sort((p, q) => p[0] - q[0])) { o.push([x, h[0]]); x = h[1]; } o.push([x, X1]); return o; })()) { B(paint, a, b, FL, FL + 1.1, ZF - 0.03, ZF, DADO, { bottom: false }); B(paint, a, b, FL + 1.1, FL + 1.16, ZF - 0.05, ZF, DADO_D); }
  // cantilevered canopy on curved iron brackets, white fascia board (trilingual lettering on it)
  const CY = FL + 3.7, CD = 2.0; // the cantilever stops 1 m out over the kerb (the footway here is narrow)
  const canopy = (xa, xb) => {
    B(paint, xa, xb, CY, CY + 0.1, ZF - CD, ZF, '#e8e8e2'); corr.box((xa + xb) / 2, CY + 0.16, ZF - CD / 2, xb - xa, 0.03, CD, { col: [0.78, 0.8, 0.8], uvScale: 3 });
    B(paint, xa, xb, CY - 0.45, CY + 0.45, ZF - CD - 0.08, ZF - CD, '#f6f4ee'); B(paint, xa, xb, CY - 0.5, CY - 0.45, ZF - CD - 0.1, ZF - CD, '#2a2a2a');
    for (let x0 = xa + 0.6; x0 < xb - 0.3; x0 += 3) { const hole = frontHoles.find((h) => x0 > h[0] - 0.25 && x0 < h[1] + 0.25); const x = hole ? (x0 - hole[0] < hole[1] - x0 ? hole[0] - 0.35 : hole[1] + 0.35) : x0; if (x < xa + 0.2 || x > xb - 0.2) continue; const pts = []; for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; pts.push([ZF - Math.sin(a) * (CD - 0.4), CY - 1.3 + (1 - Math.cos(a)) * 1.3]); }
      for (let k = 0; k < 6; k++) beam(metal, x, pts[k][1], pts[k][0], x, pts[k + 1][1], pts[k + 1][0], 0.06, 0.08, cc(IRON)); beam(metal, x, CY - 1.3, ZF, x, CY - 0.02, ZF - CD + 0.4, 0.04, 0.04, cc(IRON)); metal.cylinder(x, CY - 0.75, ZF - 0.75, 0.12, 0.12, 0.04, 10, { col: cc(IRON) }); }
  };
  for (const [a, b] of [[X0 + 0.3, -93], [-83, -41.2], [-28.8, -4.8], [2.8, X1 - 0.3]]) canopy(a, b);
  signQuad(SA, -63, CY, ZF - CD - 0.09, 16, 0.86, '-z', T.fascia(0)); signQuad(SA, -16.8, CY, ZF - CD - 0.09, 16, 0.86, '-z', T.fascia(1)); signQuad(SA, 15.6, CY, ZF - CD - 0.09, 16, 0.86, '-z', T.fascia(2));
  // central clock pavilion: protruding frontispiece, pilasters, cornice, balustrade + ball finials, curved scrolled pediment with the clock
  { const xa = -41, xb = -29, zf = PZ, ht = Y + 11.1;
    B(wallM, xa, -37.5, FL, ht, zf, ZF, W); B(wallM, -32.5, xb, FL, ht, zf, ZF, W); B(wallM, -37.5, -32.5, FL + 4.0, ht, zf, ZF, W); coll(xa, -37.5, zf, ZF, ht); coll(-32.5, xb, zf, ZF, ht);
    B(stone, xa, -37.5, Y, FL, zf, ZF, '#8e8a80'); B(stone, -32.5, xb, Y, FL, zf, ZF, '#8e8a80');
    for (const px of [-40.55, -38.15, -31.85, -29.45]) { B(wallM, px - 0.3, px + 0.3, FL, ht - 0.5, zf - 0.15, zf, '#f7f4ec'); B(wallM, px - 0.4, px + 0.4, ht - 0.75, ht - 0.5, zf - 0.25, zf, '#ebe5d4'); B(wallM, px - 0.4, px + 0.4, FL, FL + 0.5, zf - 0.22, zf, '#ebe5d4'); }
    B(wallM, xa - 0.3, xb + 0.3, ht - 0.5, ht, zf - 0.45, ZF, '#efe9da'); // entablature
    for (const [a, b] of [[-37.5, -37.2], [-32.8, -32.5]]) B(paint, a, b, FL, FL + 4.0, zf - 0.02, ZF + 0.4, '#e7e1d0'); B(paint, -37.5, -32.5, FL + 3.8, FL + 4.1, zf - 0.06, zf, '#e7e1d0');
    B(wallM, xa - 0.12, xb + 0.12, FL + 4.78, FL + 5.62, zf - 0.22, zf, '#f4f0e6'); B(wallM, xa - 0.16, xb + 0.16, FL + 5.62, FL + 5.7, zf - 0.27, zf, '#e6dfcc'); B(wallM, xa - 0.16, xb + 0.16, FL + 4.72, FL + 4.78, zf - 0.25, zf, '#e6dfcc'); // frieze band across the pilasters (the lettering is painted on it, never behind a pilaster)
    signQuad(SA, -35, FL + 5.2, zf - 0.225, 9.4, 0.6, '-z', T.fascia(3));
    // balustrade
    B(wallM, xa - 0.2, xb + 0.2, ht, ht + 0.14, zf - 0.3, ZF, '#eee8da'); B(wallM, xa - 0.2, xb + 0.2, ht + 0.82, ht + 0.95, zf - 0.3, zf + 0.05, '#eee8da');
    for (let x = xa + 0.2; x <= xb - 0.2; x += 0.32) { if (x > -36.7 && x < -33.3) continue; wallM.cylinder(x, ht + 0.14, zf - 0.13, 0.06, 0.09, 0.34, 8, { col: cc('#f1ece0') }); wallM.cylinder(x, ht + 0.48, zf - 0.13, 0.09, 0.05, 0.34, 8, { col: cc('#f1ece0') }); }
    for (const px of [xa, -37.2, -32.8, xb]) { B(wallM, px - 0.3, px + 0.3, ht, ht + 1.1, zf - 0.35, zf + 0.25, '#ede7d8'); wallM.cylinder(px, ht + 1.1, zf - 0.05, 0.12, 0.24, 0.18, 10, { col: cc('#ede7d8') }); wallM.cylinder(px, ht + 1.28, zf - 0.05, 0.24, 0.12, 0.2, 10, { col: cc('#ede7d8') }); wallM.cylinder(px, ht + 1.48, zf - 0.05, 0.05, 0.05, 0.12, 6, { col: cc('#ede7d8') }); } // pedestals + ball finials
    // curved scrolled pediment: a segmental crown over the clock with scrolls (volutes) at its feet
    const pw = 4.0, py = ht + 0.14; // the pediment: one smooth extruded segmental crown (55th: it was a staircase of 16 boxes)
    { const sh = new THREE.Shape(); sh.moveTo(-pw / 2, 0); sh.lineTo(pw / 2, 0); sh.lineTo(pw / 2, 1.7); for (let k = 1; k <= 32; k++) { const u = 1 - (2 * k) / 32; sh.lineTo(u * pw / 2, 1.7 + Math.sqrt(Math.max(0, 1 - u * u)) * 1.45); } sh.lineTo(-pw / 2, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false, curveSegments: 1 }); wallM.geometry(g, new THREE.Matrix4().makeTranslation(-35, py, zf - 0.1), cc(W)); g.dispose();
      for (let k = 0; k < 28; k++) { const u0 = -1 + (2 * k) / 28, u1 = -1 + (2 * (k + 1)) / 28; const y0 = py + 1.7 + Math.sqrt(Math.max(0, 1 - u0 * u0)) * 1.45, y1 = py + 1.7 + Math.sqrt(Math.max(0, 1 - u1 * u1)) * 1.45; beam(wallM, -35 + u0 * pw / 2, y0 + 0.08, zf - 0.03, -35 + u1 * pw / 2, y1 + 0.08, zf - 0.03, 0.42, 0.18, cc('#e7e0cd')); } // crown moulding
      for (const e of [-1, 1]) beam(wallM, -35 + e * pw / 2, py + 1.62, zf - 0.03, -35 + e * pw / 2, py + 1.9, zf - 0.03, 0.42, 0.22, cc('#e7e0cd')); }
    for (const e of [-1, 1]) { const g = new THREE.CylinderGeometry(0.34, 0.34, 0.4, 14); const m = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(-35 + e * (pw / 2 + 0.1), py + 0.45, zf - 0.02); wallM.geometry(g, m, cc('#ece6d6')); const g2 = new THREE.CylinderGeometry(0.16, 0.16, 0.42, 10); wallM.geometry(g2, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(-35 + e * (pw / 2 + 0.1), py + 0.45, zf - 0.04), cc('#d9d1bb')); g.dispose(); g2.dispose(); }
    // the clock is set INTO the pediment face (55th: it used to stand proud of the crown and cut through it): a moulded round
    // surround, the white enamel dial under glass, black hands — the whole dial inside the pediment's outline
    clockFace(-35, py + 1.95, zf - 0.1, '-z', 0.66, { rim: '#e3dccb', rimW: 0.12, depth: 0.08, glass: true });
  }
  // round-arched entrance pavilion (reservations office): pilasters, entablature, urn finials, archivolt
  { const cx = F.res.portalX, xa = cx - 3.6, xb = cx + 3.6, zf = PZ, ht = Y + 9.2, r = 1.6, spring = FL + 2.6;
    B(wallM, xa, cx - r, FL, ht, zf, ZF, W); B(wallM, cx + r, xb, FL, ht, zf, ZF, W); coll(xa, cx - r, zf, ZF, ht); coll(cx + r, xb, zf, ZF, ht); B(stone, xa, cx - r, Y, FL, zf, ZF, '#8e8a80'); B(stone, cx + r, xb, Y, FL, zf, ZF, '#8e8a80');
    { const sh = new THREE.Shape(); sh.moveTo(-r, 0); sh.lineTo(-r, ht - spring); sh.lineTo(r, ht - spring); sh.lineTo(r, 0); for (let k = 1; k < 24; k++) { const a = (k / 24) * Math.PI; sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); } sh.lineTo(-r, 0); // 55th: a true round arch (it was 14 stepped boxes)
      const g = new THREE.ExtrudeGeometry(sh, { depth: ZF - zf, bevelEnabled: false, curveSegments: 1 }); wallM.geometry(g, new THREE.Matrix4().makeTranslation(cx, spring, zf), cc(W)); g.dispose(); }
    for (let k = 0; k < 12; k++) { const a0 = Math.PI - (k / 12) * Math.PI, a1 = Math.PI - ((k + 1) / 12) * Math.PI; beam(wallM, cx + Math.cos(a0) * (r + 0.12), spring + Math.sin(a0) * (r + 0.12), zf - 0.06, cx + Math.cos(a1) * (r + 0.12), spring + Math.sin(a1) * (r + 0.12), zf - 0.06, 0.26, 0.12, cc('#e6dfcc')); } // archivolt
    B(wallM, cx - 0.2, cx + 0.2, spring + r - 0.1, spring + r + 0.45, zf - 0.14, zf, '#e3dccb');
    for (const px of [xa + 0.4, cx - r - 0.55, cx + r + 0.55, xb - 0.4]) { B(wallM, px - 0.3, px + 0.3, FL, ht - 0.8, zf - 0.16, zf, '#f7f4ec'); B(wallM, px - 0.4, px + 0.4, ht - 1.05, ht - 0.8, zf - 0.26, zf, '#ebe5d4'); }
    B(wallM, xa - 0.3, xb + 0.3, ht - 0.8, ht, zf - 0.42, ZF, '#efe9da'); B(wallM, xa, xb, ht, ht + 0.5, zf, ZF, '#f2eee3');
    for (const px of [xa + 0.4, xb - 0.4]) { B(wallM, px - 0.32, px + 0.32, ht + 0.5, ht + 0.9, zf + 0.1, zf + 0.74, '#ede7d8'); wallM.cylinder(px, ht + 0.9, zf + 0.42, 0.12, 0.3, 0.3, 12, { col: cc('#e9e2d1') }); wallM.cylinder(px, ht + 1.2, zf + 0.42, 0.3, 0.2, 0.32, 12, { col: cc('#e9e2d1') }); wallM.cylinder(px, ht + 1.52, zf + 0.42, 0.1, 0.02, 0.22, 8, { col: cc('#e9e2d1') }); } // urn finials
    signQuad(SC, cx, FL + 5.55, zf - 0.02, 3.2, 1.6, '-z', T.intercity); // above the keystone, clear of the archivolt
  }
  // side entrances: signs over the doors (their steps are inside, see the stair wells above)
  for (const e of F.entrances) { if (e.main) continue; signQuad(SD, e.x, FL + 3.55, ZF - 0.03, 2.9, 0.72, '-z', T.sign(2)); }
  // outside counters under the white barrel awning (11 season tickets, 16 special counter) + the red LED clock
  { const xs = [-90.4, -85.6]; xs.forEach((x, i) => { ticketWindow(x, ZF, '-z'); signQuad(SD, x, Y + 2.6, ZF - 0.08, 2.0, 0.5, '-z', T.sign(4 + i)); });
    const ax = -88, r = 0.75, y0 = Y + 2.95, L = 9; const ds = mb.get('paintDS'); for (let k = 0; k < 10; k++) { const a0 = (k / 10) * Math.PI, a1 = ((k + 1) / 10) * Math.PI; const p0 = [ZF - r + Math.cos(a0) * r, y0 + Math.sin(a0) * r * 0.9], p1 = [ZF - r + Math.cos(a1) * r, y0 + Math.sin(a1) * r * 0.9]; ds.quad([ax - L / 2, p0[1], p0[0]], [ax + L / 2, p0[1], p0[0]], [ax + L / 2, p1[1], p1[0]], [ax - L / 2, p1[1], p1[0]], [0, 0, 1, 1], cc('#f4f4f0')); }
    for (const e of [-1, 1]) for (let k = 0; k < 10; k++) { const a0 = (k / 10) * Math.PI, a1 = ((k + 1) / 10) * Math.PI; ds.quad([ax + e * L / 2, y0, ZF - r], [ax + e * L / 2, y0 + Math.sin(a0) * r * 0.9, ZF - r + Math.cos(a0) * r], [ax + e * L / 2, y0 + Math.sin(a1) * r * 0.9, ZF - r + Math.cos(a1) * r], [ax + e * L / 2, y0 + Math.sin(a1) * r * 0.9, ZF - r + Math.cos(a1) * r], [0, 0, 1, 1], cc('#ecece6')); }
    for (const e of [-1, 1]) beam(metal, ax + e * (L / 2 - 0.2), y0 - 0.4, ZF, ax + e * (L / 2 - 0.2), y0, ZF - 1.4, 0.04, 0.04, cc(IRON));
    anim.ledSpots = [{ x: ax, y: FL + 4.15, z: ZF - 0.05, face: '-z', w: 1.6, h: 0.42 }, { x: -59.96, y: FL + 6.0, z: -640, face: '+x', w: 1.6, h: 0.42 }];
  }
  function ticketWindow(x, zf, face) { // an outside ticket window on a facade (timber frame, bars, sill)
    const s = face === '-z' ? -1 : 1, z = zf + s * 0.08, G = Y; // served from the footway: sill at counter height above the street
    B(paint, x - 0.9, x + 0.9, G + 0.3, G + 2.4, zf + s * 0.02, z, '#2a1d14'); // timber surround, proud of the dado
    B(wglass, x - 0.7, x + 0.7, G + 0.95, G + 2.2, z - 0.01, z + 0.01, '#000'); for (const e of [-1, 1]) B(paint, x + e * 0.75 - 0.06, x + e * 0.75 + 0.06, G + 0.9, G + 2.3, z - 0.06, z + 0.06, WOOD);
    B(paint, x - 0.81, x + 0.81, G + 2.24, G + 2.34, z - 0.06, z + 0.06, WOOD); B(paint, x - 0.85, x + 0.85, G + 0.86, G + 0.95, z - 0.3, z + 0.02, SILL);
    for (let k = 0; k < 8; k++) rod(metal, x - 0.62 + k * 0.177, G + 0.95, z + s * 0.03, x - 0.62 + k * 0.177, G + 2.24, z + s * 0.03, 0.012, cc('#3a3a3a'));
  }
  // roofs: brown hipped roofs (hall higher), small hips on the pavilions
  hip(X0, -60, ZF, ZB, TOP, 3.0, ROOF); hip(-60, -10, ZF, ZB, TOP + 0.6, 3.4, ROOF); hip(-10, X1, ZF, ZB, TOP, 3.0, ROOF);
  hip(-4.6, 2.6, ZF - 1.0, ZF + 1.5, Y + 9.7, 1.4, ROOF);

  // ================================================================ 3. booking hall fit-out
  // ticket windows (hall side): timber frames, vertical bars, glass with the speaking slot, brown sill + ledge, number boards
  F.windows.forEach((w, i) => {
    const z = w.z, x = -59.98; B(paint, x, x + 0.06, FL + 0.9, FL + 2.35, z - 0.78, z - 0.65, WOOD); B(paint, x, x + 0.06, FL + 0.9, FL + 2.35, z + 0.65, z + 0.78, WOOD); B(paint, x, x + 0.06, FL + 2.25, FL + 2.4, z - 0.78, z + 0.78, WOOD);
    B(paint, x - 0.42, x + 0.36, FL + 0.9, FL + 0.97, z - 0.8, z + 0.8, SILL); B(paint, x, x + 0.06, FL + 0.3, FL + 0.9, z - 0.8, z + 0.8, '#5a3520');
    for (let k = 0; k < 7; k++) rod(metal, x + 0.02, FL + 0.97, z - 0.54 + k * 0.18, x + 0.02, FL + 2.25, z - 0.54 + k * 0.18, 0.011, cc('#2a2a2a'));
    B(glass, -60.22, -60.2, FL + 1.38, FL + 2.25, z - 0.65, z + 0.65, '#9fb8c0');
    signQuad(SBd, -59.9, FL + 2.85, z, 1.95, 0.97, '+x', T.counter(i));
    // the clerk's side: desk at sill height, high stool + footrest, monitor, printer, cash tray, Edmondson ticket rack on the back wall
    B(paint, -61.45, -60.4, FL + 0.86, FL + 0.92, z - 1.0, z + 1.0, '#6d5a44'); B(paint, -61.4, -61.35, FL, FL + 0.86, z - 0.9, z + 0.9, '#5a4a38');
    B(paint, -60.9, -60.62, FL + 0.92, FL + 1.22, z + 0.35, z + 0.75, '#1b1b1d'); B(emis, -60.63, -60.6, FL + 0.96, FL + 1.19, z + 0.38, z + 0.72, [0.35, 0.55, 0.8]);
    B(paint, -61.0, -60.7, FL + 0.92, FL + 1.04, z - 0.7, z - 0.4, '#d4d2cc'); B(paint, -60.95, -60.55, FL + 0.92, FL + 0.96, z - 0.2, z + 0.15, '#7a6a52');
    metal.cylinder(-61.75, FL, z, 0.025, 0.025, 0.7, 6, { col: cc('#3a3a3a') }); paint.cylinder(-61.75, FL + 0.66, z, 0.2, 0.2, 0.06, 10, { col: cc('#2c2c2c') }); metal.cylinder(-61.75, FL + 0.26, z, 0.2, 0.2, 0.02, 10, { col: cc('#555'), caps: false });
    B(paint, -63.8, -63.5, FL + 1.1, FL + 2.3, z - 0.7, z + 0.7, '#6b4a2c'); for (let r = 0; r < 6; r++) B(paint, -63.52, -63.48, FL + 1.12 + r * 0.2, FL + 1.14 + r * 0.2, z - 0.68, z + 0.68, '#3e2a18'); for (let c = 0; c < 8; c++) B(paint, -63.52, -63.48, FL + 1.1, FL + 2.3, z - 0.68 + c * 0.19, z - 0.66 + c * 0.19, '#3e2a18');
    for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) if ((r * 7 + c * 3 + i) % 4) B(paint, -63.5, -63.46, FL + 1.15 + r * 0.2, FL + 1.27 + r * 0.2, z - 0.63 + c * 0.19, z - 0.53 + c * 0.19, ['#d9c25a', '#c8d8e8', '#e8b0b0', '#b8d8b0'][(r + c + i) % 4]);
  });
  for (let z = ZF + 2; z < ZB - 1; z += 4) B(emis, -62.2, -61.9, FL + 3.36, FL + 3.4, z - 0.6, z + 0.6, [1, 0.98, 0.92]);
  // fare boards high on the counter wall + the trilingual TICKETS board, queue rails
  signQuad(SC, -59.96, FL + 4.6, -644.2, 2.6, 2.6, '+x', T.fare(0)); signQuad(SC, -59.96, FL + 4.6, -635.4, 2.6, 2.6, '+x', T.fare(1)); signQuad(SC, -59.96, FL + 4.6, -639.8, 1.6, 1.6, '+x', T.tickets);
  for (let k = 0; k <= 8; k++) { const z = k === 0 ? F.windows[0].z - 1.1 : F.windows[k - 1].z + 1.1; if (z < ZF + 0.6 || z > ZB - 0.6) continue; const xa = -59.6, xb = -55.6;
    for (let p = 0; p <= 3; p++) metal.cylinder(xa + (p / 3) * (xb - xa), FL, z, 0.025, 0.025, 1.0, 8, { col: cc(STEEL) }); for (const h of [0.5, 0.98]) rod(metal, xa, FL + h, z, xb, FL + h, z, 0.018, cc(STEEL)); coll(xa, xb, z - 0.05, z + 0.05, FL + 1.0); }
  // benches (hall + platform 1): slatted wooden seat and back on cast-iron ends
  // 55th: a real station bench — cast-iron ends (curved front leg on a foot, raked rear leg running up into the back post, seat
  // rail, armrests on the outer ends), hardwood seat slats with gaps and a rounded nose, raked back slats, carriage bolts at
  // every slat / end crossing, an iron stretcher under the seat. s: the side the back is on (±z); seat top at FL + 0.45.
  const bench = (x0, x1, zc, s) => { const ends = [x0 + 0.1, (x0 + x1) / 2, x1 - 0.1], Z = (d) => zc + s * d, BOLT = '#1c1c1a';
    for (let q = 0; q < 4; q++) { const d0 = -0.235 + q * 0.105; B(paint, x0, x1, FL + 0.415, FL + 0.45, Z(d0), Z(d0 + 0.085), BENCH); }
    xcyl(paint, x0, x1, FL + 0.432, Z(-0.24), 0.018, cc(BENCH)); // rounded nose of the front slat
    for (let q = 0; q < 3; q++) { const y = FL + 0.56 + q * 0.13, d = 0.215 + (y - FL - 0.45) * 0.2; B(paint, x0, x1, y, y + 0.095, Z(d), Z(d + 0.028), BENCH); } // raked back
    for (const ex of ends) { const outer = ex !== ends[1], R = (ax, ay, ad, bx2, by2, bd, w, h) => beam(metal, ex, FL + ay, Z(ad), ex, FL + by2, Z(bd), w, h, cc(IRON));
      R(0, 0.02, -0.25, 0, 0.2, -0.27, 0.05, 0.035); R(0, 0.2, -0.27, 0, 0.4, -0.235, 0.05, 0.035); // curved front leg (two segments)
      B(metal, ex - 0.035, ex + 0.035, FL, FL + 0.025, Z(-0.3), Z(-0.2), IRON); B(metal, ex - 0.035, ex + 0.035, FL, FL + 0.025, Z(0.2), Z(0.3), IRON); // feet
      R(0, 0.02, 0.25, 0, 0.4, 0.2, 0.05, 0.035); R(0, 0.4, 0.2, 0, 0.98, 0.32, 0.05, 0.035); // rear leg + back post
      R(0, 0.39, -0.26, 0, 0.395, 0.21, 0.035, 0.05); // seat rail
      if (outer) { R(0, 0.395, -0.2, 0, 0.64, -0.21, 0.04, 0.03); R(0, 0.66, -0.25, 0, 0.66, 0.26, 0.05, 0.03); paint.cylinder(ex, FL + 0.645, Z(-0.255), 0.022, 0.022, 0.03, 8, { col: cc(BENCH) }); } // armrest + its scroll cap
      for (let q = 0; q < 4; q++) { const d = -0.235 + q * 0.105 + 0.042; B(metal, ex - 0.008, ex + 0.008, FL + 0.45, FL + 0.455, Z(d) - 0.008, Z(d) + 0.008, BOLT); }
      for (let q = 0; q < 3; q++) { const y = FL + 0.6 + q * 0.13, d = 0.215 + (y - FL - 0.45) * 0.2; B(metal, ex - 0.008, ex + 0.008, y - 0.008, y + 0.008, Z(d) - 0.005 * s, Z(d), BOLT); } }
    beam(metal, x0 + 0.1, FL + 0.18, Z(0.0), x1 - 0.1, FL + 0.18, Z(0.0), 0.03, 0.03, cc(IRON)); }
  for (let i = 0; i < F.benches.length; i += 3) { const a = F.benches[i], c = F.benches[i + 2]; const x0 = Math.min(a.x, c.x) - 0.5, x1 = Math.max(a.x, c.x) + 0.5, zc = a.z, s = a.yaw ? 1 : -1; // s: side of the backrest
    bench(x0, x1, zc, s); coll(x0, x1, zc - 0.25, zc + 0.31, FL + 0.48); }
  // kiosks: food & drinks (glass display, shelves of packets), books & newspapers
  // kiosks (55th: rebuilt as real booths): painted steel side and back panels, a counter with a laminate top and a stainless
  // kick plate, a framed glass display case on it, a roof with an overhang and its tube light, strips of snack sachets
  // clipped along the front, back shelves of printed goods (bottles with liquid, labels and caps; packets; bars), a
  // drinks cooler (food) or a book / magazine wall and a newspaper rack (books). sf: the side the counter faces (−1 = −z).
  const kiosk = (x0, x1, za, zb, sign, sf) => { const zf = sf < 0 ? za : zb, zk = sf < 0 ? zb : za, I = (d) => zf - sf * d; // I(d): d metres in from the counter front
    const zr = (a, b) => [Math.min(I(a), I(b)), Math.max(I(a), I(b))]; const RD = '#7a2a1c', food = sign === 0;
    for (const xe of [x0, x1 - 0.05]) { B(paint, xe, xe + 0.05, FL, FL + 2.5, ...zr(0, Math.abs(zk - zf)), RD); } // side panels
    B(paint, x0, x1, FL, FL + 2.5, ...zr(Math.abs(zk - zf) - 0.05, Math.abs(zk - zf)), RD); // back panel
    B(paint, x0 + 0.05, x1 - 0.05, FL, FL + 1.0, ...zr(0, 0.55), RD); B(metal, x0 + 0.05, x1 - 0.05, FL, FL + 0.16, ...zr(-0.004, 0.0), STEEL); // counter front + kick plate
    B(paint, x0 - 0.02, x1 + 0.02, FL + 1.0, FL + 1.04, ...zr(-0.04, 0.6), '#5a3520'); // laminate top (wood)
    { const [c0, c1] = zr(0.04, 0.5), y0 = FL + 1.04, y1 = FL + 1.42; // display case: steel frame, glass panes, two tiers of goods
      for (const xe of [x0 + 0.08, x1 - 0.08]) for (const ze of [c0, c1]) B(metal, xe - 0.015, xe + 0.015, y0, y1, ze - 0.015, ze + 0.015, STEEL);
      for (const ze of [c0, c1]) B(metal, x0 + 0.08, x1 - 0.08, y1 - 0.02, y1, ze - 0.015, ze + 0.015, STEEL); B(metal, x0 + 0.08, x1 - 0.08, y1 - 0.004, y1, c0, c1, '#ccc');
      B(glass, x0 + 0.08, x1 - 0.08, y0, y1 - 0.02, I(0.045) - 0.003, I(0.045) + 0.003, '#9fb8c0'); for (const xe of [x0 + 0.08, x1 - 0.08]) B(glass, xe - 0.003, xe + 0.003, y0, y1 - 0.02, c0, c1, '#9fb8c0');
      B(paint, x0 + 0.1, x1 - 0.1, y0 + 0.17, y0 + 0.18, c0 + 0.02, c1 - 0.02, '#e8e4d8'); // glass shelf (seen as a white edge)
      let k = 0; for (let x = x0 + 0.18; x < x1 - 0.2; x += 0.13, k++) { goods.packet(GD, x, y0, (c0 + c1) / 2 + ((k % 2) - 0.5) * 0.12, 0.1, 0.03, 0.15, goods.GOODS.small(k % 8)); goods.packet(GD, x, y0 + 0.18, (c0 + c1) / 2, 0.1, 0.11, 0.025, goods.GOODS.small((k + 3) % 8), sf < 0 ? 0 : Math.PI); }
      if (food) for (let r = 0; r < 2; r++) for (let q = 0; q < 6; q++) paint.cylinder(x0 + 0.35 + q * 0.09, y0 + 0.012 + r * 0.02, I(0.12 + r * 0.07), 0.04, 0.04, 0.02, 10, { col: cc('#a8641e') }); } // isso wade on a tray
    B(paint, x0 - 0.05, x1 + 0.05, FL + 2.5, FL + 2.62, ...zr(-0.3, Math.abs(zk - zf) + 0.05), '#f2f0e8'); B(emis, x0 + 0.3, x1 - 0.3, FL + 2.47, FL + 2.5, ...zr(0.1, 0.14), [1, 0.98, 0.92]); // roof + tube
    rod(metal, x0 + 0.05, FL + 2.42, I(-0.15), x1 - 0.05, FL + 2.42, I(-0.15), 0.006, cc('#888')); for (let q = 0; q < 7; q++) goods.strip(GD, x0 + 0.3 + q * ((x1 - x0 - 0.6) / 6), FL + 2.42, I(-0.15), 4 + (q % 3), (q * 3) % 8, sf < 0 ? 'z' : 'z', q); // clip line + sachet strips
    // back shelves: steel uprights, 4 timber boards, each a row of goods
    const zs0 = Math.abs(zk - zf) - 0.45, zs1 = Math.abs(zk - zf) - 0.05; const [s0, s1] = zr(zs0, zs1); const xr0 = x0 + 0.08 + (food ? 0.72 : 0), xr1 = x1 - 0.08;
    for (const xe of [xr0, xr1 - 0.03]) B(metal, xe, xe + 0.03, FL + 1.0, FL + 2.4, s0, s1, '#888');
    for (let r = 0; r < 4; r++) { const y = FL + 1.05 + r * 0.34; B(paint, xr0, xr1, y, y + 0.022, s0, s1, '#6b4a2c'); const yy = y + 0.022;
      if (food) { if (r === 3) { let k = 0; for (let x = xr0 + 0.07; x < xr1 - 0.05; x += 0.075, k++) goods.bottle(GD, BG, x, yy, I(zs0 + 0.2), k % 8, 1); } // bottles
        else if (r === 2) { let k = 0; for (let x = xr0 + 0.06; x < xr1 - 0.06; x += 0.11, k++) goods.packet(GD, x, yy, I(zs0 + 0.2), 0.095, 0.19, 0.055, goods.GOODS.pack(k % 8), sf < 0 ? 0 : Math.PI); }
        else if (r === 1) { let k = 0; for (let x = xr0 + 0.06; x < xr1 - 0.06; x += 0.1, k++) for (let st = 0; st < 3; st++) goods.packet(GD, x, yy + st * 0.032, I(zs0 + 0.2), 0.085, 0.03, 0.06, goods.GOODS.small((k + st) % 8), sf < 0 ? 0 : Math.PI); }
        else { let k = 0; for (let x = xr0 + 0.07; x < xr1 - 0.06; x += 0.12, k++) goods.packet(GD, x, yy, I(zs0 + 0.18), 0.1, 0.25, 0.07, goods.GOODS.pack((k + 2) % 8), sf < 0 ? 0 : Math.PI); } }
      else { let k = 0; for (let x = xr0 + 0.04; x < xr1 - 0.04; k++) { const w = 0.025 + ((k * 7) % 5) * 0.008, h = 0.2 + ((k * 3) % 4) * 0.025; B(paint, x, x + w, yy, yy + h, I(zs0 + 0.08) - 0.1, I(zs0 + 0.08) + 0.1, ['#7a1e12', '#1d4fae', '#1f6a3a', '#e8e0c8', '#3a2a1a', '#c9a227', '#5a2a6a'][k % 7]); x += w + 0.004; } } } // books, spines out
    if (food) { const cx = x0 + 0.42, [q0, q1] = zr(zs0 - 0.2, zs1); B(paint, cx - 0.34, cx + 0.34, FL, FL + 1.85, q0, q1, '#f0f0ec'); const zg = I(zs0 - 0.2); // drinks cooler: white cabinet, lit inside, glass door, 4 shelves of bottles
      B(emis, cx - 0.28, cx + 0.28, FL + 1.74, FL + 1.76, Math.min(zg, zg - sf * 0.4), Math.max(zg, zg - sf * 0.4), [0.9, 0.95, 1]); B(paint, cx - 0.3, cx + 0.3, FL + 1.55, FL + 1.8, zg - 0.002 * sf - 0.001, zg - 0.002 * sf + 0.001, '#b3121a');
      for (let r = 0; r < 4; r++) { const y = FL + 0.2 + r * 0.33; B(metal, cx - 0.3, cx + 0.3, y - 0.01, y, Math.min(zg, zg + sf * 0.5), Math.max(zg, zg + sf * 0.5), '#ccc'); for (let q = 0; q < 6; q++) goods.bottle(GD, BG, cx - 0.24 + q * 0.095, y, I(zs0 - 0.3), (q + r * 2) % 8, 1); }
      B(glass, cx - 0.32, cx + 0.32, FL + 0.1, FL + 1.52, zg - sf * 0.004 - 0.003, zg - sf * 0.004 + 0.003, '#9fb8c0'); for (const xe of [cx - 0.33, cx + 0.31]) B(metal, xe, xe + 0.02, FL + 0.1, FL + 1.52, zg - 0.01, zg + 0.01, '#bbb'); }
    else { const [r0, r1] = zr(-0.75, -0.15); for (const xe of [x0 + 0.2, x1 - 0.23]) for (const ze of [r0, r1 - 0.03]) B(metal, xe, xe + 0.03, FL, FL + 0.75, ze, ze + 0.03, '#2e2e2e'); B(metal, x0 + 0.2, x1 - 0.2, FL + 0.72, FL + 0.75, r0, r1, '#2e2e2e'); B(metal, x0 + 0.2, x1 - 0.2, FL + 0.2, FL + 0.22, r0, r1, '#2e2e2e'); for (let k = 0; k < 6; k++) goods.paper(GD, x0 + 0.42 + (k % 3) * 0.8, FL + 0.22 + Math.floor(k / 3) * 0.02, (r0 + r1) / 2, (k + 1) % 4, Math.PI / 2); for (let k = 0; k < 8; k++) goods.paper(GD, x0 + 0.42 + (k % 4) * 0.62, FL + 0.75 + Math.floor(k / 4) * 0.014, (r0 + r1) / 2, k % 4, Math.PI / 2 + (k * 0.07 - 0.2)); } // newspaper rack in front
    { const w = Math.min(2.4, x1 - x0 + 0.3), cx = (x0 + x1) / 2, sy = FL + 2.98, zS = I(-0.25), fs = sf < 0 ? '-z' : '+z'; // name board on the roof
      B(paint, cx - w / 2 - 0.03, cx + w / 2 + 0.03, FL + 2.62, sy + 0.33, Math.min(zS, zS - sf * 0.05), Math.max(zS, zS - sf * 0.05), '#2a2a2a'); signQuad(SD, cx, sy, zS + sf * 0.002, w, 0.6, fs, T.sign(sign));
      for (const e of [-w / 2 + 0.2, w / 2 - 0.2]) beam(metal, cx + e, sy + 0.15, zS - sf * 0.05, cx + e, FL + 2.62, I(0.4), 0.03, 0.03, cc('#555')); }
    coll(x0, x1, za, zb, FL + 2.6); if (!food) coll(x0 + 0.2, x1 - 0.2, ...zr(-0.75, -0.15), FL + 0.8); };
  kiosk(-14.5, -11.2, -636.2, -632.2, 0, -1); kiosk(-14.5, -11.2, -648.6, -645.6, 1, 1);
  // ceiling fans + tube lights, hanging LCD screens, the hall clock, the red LED clock on the counter wall, wayfinding
  for (const x of [-52, -35, -18]) for (const z of [-645, -636]) { metal.cylinder(x, F.hall.ceil - 0.6, z, 0.015, 0.015, 0.6, 6, { col: cc('#ddd') }); paint.cylinder(x, F.hall.ceil - 0.72, z, 0.13, 0.13, 0.14, 10, { col: cc('#e8e8e0') }); for (let k = 0; k < 3; k++) { const a = k * 2.094 + x; ebox(paint, x + Math.cos(a) * 0.45, F.hall.ceil - 0.68, z + Math.sin(a) * 0.45, 0.72, 0.012, 0.13, 0, -a, 0, cc('#e9e7df')); } }
  for (let x = -57; x < -12; x += 5) for (const z of [-648, -641, -633]) { B(emis, x - 0.6, x + 0.6, F.hall.ceil - 0.05, F.hall.ceil - 0.01, z - 0.03, z + 0.03, [1, 0.98, 0.92]); if ((x + z) % 2 === 0) lightPool(x, z, FL + 0.012, 4); }
  lcdScreen(-35, FL + 3.9, -637.0, '-z', 0, F.hall.ceil); lcdScreen(-35, FL + 3.9, -636.8, '+z', 1, F.hall.ceil); lcdScreen(-40, FL + 3.9, -645.5, '+x', 0, F.hall.ceil); // live departure / arrival screens (section 8)
  clockFace(-10.29, FL + 4.2, -637, '-x', 0.42, { depth: 0.09 });
  for (const x of F.backArches) signQuad(SD, x, FL + 3.25, ZB - 0.43, 2.4, 0.6, '+z', T.sign(2)); signQuad(SD, -35, FL + 3.25, ZF + 0.43, 2.4, 0.6, '+z', T.sign(3));
  signQuad(SD, -10.23, FL + 2.95, F.res.door.z, 2.0, 0.5, '-x', T.sign(7));

  // ================================================================ 4. intercity reservations office + announcer's room
  { const cxw = F.res.counterX; // dark-red counter front with black diamonds, glass screens on stainless posts, the clerk behind
    B(paint, cxw - 0.2, cxw + 0.4, FL, FL + 1.05, -648, -633, '#6a1a14'); B(paint, cxw - 0.3, cxw + 0.45, FL + 1.05, FL + 1.1, -648.1, -632.9, '#3a2618'); coll(cxw - 0.2, 7.8, -648, -633, FL + 1.1);
    for (let z = -647.4; z < -633.4; z += 0.8) ebox(paint, cxw - 0.205, FL + 0.55, z, 0.02, 0.36, 0.36, Math.PI / 4, 0, 0, cc('#121212'));
    for (let z = -648; z <= -633; z += 1.5) { metal.cylinder(cxw + 0.1, FL + 1.1, z, 0.02, 0.02, 1.15, 8, { col: cc(STEEL) }); if (z < -633.5) B(glass, cxw + 0.09, cxw + 0.11, FL + 1.3, FL + 2.2, z + 0.03, z + 1.47, '#9fb8c0'); }
    rod(metal, cxw + 0.1, FL + 2.25, -648, cxw + 0.1, FL + 2.25, -633, 0.02, cc(STEEL));
    signQuad(SC, cxw + 0.05, FL + 3.1, -640.5, 3.2, 1.6, '-x', T.intercity);
    for (const z of [-646, -641.5, -637]) { B(paint, cxw + 0.45, cxw + 1.2, FL + 0.72, FL + 0.76, z - 0.7, z + 0.7, '#5d4a36'); B(paint, cxw + 0.5, cxw + 0.75, FL + 0.76, FL + 1.05, z + 0.1, z + 0.45, '#1b1b1d'); }
    // AC unit, wall clock, fans, tubes, barred window (back wall), benches for the queue
    B(paint, 7.55, 7.78, FL + 3.0, FL + 3.32, -645.5, -644.4, '#f0f0ec'); for (let k = 0; k < 5; k++) B(paint, 7.53, 7.55, FL + 3.04 + k * 0.05, FL + 3.06 + k * 0.05, -645.45, -644.45, '#bbb');
    clockFace(7.73, FL + 2.8, -640.2, '-x', 0.27, { depth: 0.07, case: '#f0f0ec', rim: '#d8d8d4' });
    for (const z of [-645, -636]) { metal.cylinder(-1, FL + 3.8, z, 0.015, 0.015, 0.4, 6, { col: cc('#ddd') }); paint.cylinder(-1, FL + 3.7, z, 0.12, 0.12, 0.12, 10, { col: cc('#e8e8e0') }); for (let k = 0; k < 3; k++) { const a = k * 2.094 + z; ebox(paint, -1 + Math.cos(a) * 0.42, FL + 3.74, z + Math.sin(a) * 0.42, 0.66, 0.012, 0.12, 0, -a, 0, cc('#e9e7df')); } }
    for (const z of [-647, -640, -633]) B(emis, -5.6, -4.4, FL + 4.12, FL + 4.16, z - 0.03, z + 0.03, [1, 0.98, 0.92]);
    for (let k = 0; k < 6; k++) rod(metal, -5.8 + k * 0.7, FL + 1.2, ZB - 0.45, -5.8 + k * 0.7, FL + 2.6, ZB - 0.45, 0.012, cc('#2a2a2a')); B(wglass, -6, -2, FL + 1.2, FL + 2.6, ZB - 0.21, ZB - 0.19, '#000');
    for (const z of [-646.5, -642.5]) { bench(-8.6, -5.4, z, 1); coll(-8.6, -5.4, z - 0.25, z + 0.3, FL + 0.48); }
  }
  { const A = F.ann; // the announcer's room: desk under the window onto platform 1, gooseneck mic, PA console, phone, timetable, clock, fan
    // 55th: rebuilt as a real SLR station operator's office. Walls: oil-painted lower wall with a dado rail, timber skirting;
    // floor: vinyl tiles. Furniture: a twin-pedestal office desk, an operator office chair (gfx/OfficeChair.js), a steel
    // almirah, a red plastic visitor chair, a 19-inch PA rack, a cork notice board, a calendar, a ceiling fan, the framed
    // fare / timetable sheets. On the desk: the PA mixer (faders, knobs, VU meters), the gooseneck paging mic on its
    // push-to-talk base, a monitor showing the live departures (the same canvas as the hall boards: no extra draw call),
    // keyboard and mouse, the desk phone, the open train register, files, a cup of tea, a bottle of water.
    const RX0 = 8.2, RX1 = 17.8, RZ0 = -637.8, RZ1 = ZB - 0.4, OIL = '#a9c4b4', OIL_D = '#6f8f7e', SK = '#3e2a18';
    for (const [a0, a1, b0, b1, ax] of [[RX0, RX0 + 0.012, RZ0, RZ1, 1], [RX1 - 0.012, RX1, RZ0, RZ1, 1], [RX0, RX1, RZ0, RZ0 + 0.012, 0], [RX0, A.door.x - 0.56, RZ1 - 0.012, RZ1, 0], [A.door.x + 0.56, RX1, RZ1 - 0.012, RZ1, 0]]) {
      const top = ax === 0 && b0 > -632 ? FL + 0.95 : FL + 1.2; B(paint, a0, a1, FL + 0.1, top, b0, b1, OIL, { bottom: false }); // oil-paint lower wall (under the window: to the sill)
      const g = 0.012; B(paint, ax ? a0 - (a0 < 13 ? 0 : g) : a0, ax ? a1 + (a0 < 13 ? g : 0) : a1, top, top + 0.035, ax ? b0 : b0 - (b0 < -634 ? 0 : g), ax ? b1 : b1 + (b0 < -634 ? g : 0), OIL_D); // dado rail
      B(paint, ax ? a0 - (a0 < 13 ? 0 : 0.008) : a0, ax ? a1 + (a0 < 13 ? 0.008 : 0) : a1, FL, FL + 0.1, ax ? b0 : b0 - (b0 < -634 ? 0 : 0.008), ax ? b1 : b1 + (b0 < -634 ? 0.008 : 0), SK); } // skirting
    for (let x = RX0, ii = 0; x < RX1 - 0.01; x += 0.3, ii++) for (let z = RZ0, jj = 0; z < RZ1 - 0.01; z += 0.3, jj++) if ((ii + jj) % 2) up(paint, x, Math.min(x + 0.3, RX1), z, Math.min(z + 0.3, RZ1), FL + 0.005, '#8f8676'); // vinyl tiles
    // desk: laminate top with an edge band, two drawer pedestals, a modesty panel against the wall
    const DT = FL + 0.75, dz0 = ZB - 1.2, dz1 = ZB - 0.42;
    B(paint, 9.0, 13.6, DT - 0.035, DT, dz0, dz1, '#6d5a44'); B(paint, 9.0, 13.6, DT - 0.04, DT - 0.035, dz0 - 0.004, dz1, '#3e2a18');
    for (const [p0, p1] of [[9.04, 9.5], [13.1, 13.56]]) { B(paint, p0, p1, FL + 0.02, DT - 0.04, dz0 + 0.04, dz1 - 0.02, '#5a4a38'); B(paint, p0, p1, FL, FL + 0.02, dz0 + 0.06, dz1 - 0.04, SK);
      for (let d = 0; d < 3; d++) { const y0 = FL + 0.05 + d * 0.215, y1 = y0 + 0.2; B(paint, p0 + 0.015, p1 - 0.015, y0, y1, dz0 + 0.03, dz0 + 0.04, '#6b4a2c'); B(metal, (p0 + p1) / 2 - 0.06, (p0 + p1) / 2 + 0.06, y1 - 0.05, y1 - 0.035, dz0 + 0.012, dz0 + 0.03, '#bfc3c2'); B(metal, (p0 + p1) / 2 - 0.012, (p0 + p1) / 2 + 0.012, y1 - 0.03, y1 - 0.012, dz0 + 0.028, dz0 + 0.031, '#b08d57'); } }
    B(paint, 9.5, 13.1, FL + 0.25, DT - 0.04, dz1 - 0.04, dz1 - 0.02, '#5a4a38'); coll(9.0, 13.6, dz0, dz1, FL + 0.8);
    // PA mixer: a sloped panel (back edge up, towards the window) with 8 channel strips
    { const mx0 = 11.55, mx1 = 12.95, mz0 = dz0 + 0.12, mz1 = dz0 + 0.5, sl = 0.2, Y = (z) => DT + 0.035 + (z - mz0) * Math.tan(sl);
      ebox(paint, (mx0 + mx1) / 2, DT + 0.035 + (mz1 - mz0) * Math.tan(sl) / 2, (mz0 + mz1) / 2, mx1 - mx0, 0.02, (mz1 - mz0) / Math.cos(sl), -sl, 0, 0, cc('#2b2d30'));
      for (const [xa, xb] of [[mx0, mx0 + 0.02], [mx1 - 0.02, mx1]]) ebox(paint, (xa + xb) / 2, DT + 0.02 + (mz1 - mz0) * Math.tan(sl) / 2, (mz0 + mz1) / 2, 0.02, 0.04 + (mz1 - mz0) * Math.tan(sl), mz1 - mz0, 0, 0, 0, cc('#1b1b1d')); // cheeks
      B(paint, mx0, mx1, DT, DT + 0.035, mz0 - 0.01, mz1, '#1b1b1d'); B(paint, mx0, mx1, DT, Y(mz1) + 0.01, mz1, mz1 + 0.02, '#1b1b1d'); // base + back
      for (let c = 0; c < 8; c++) { const x = mx0 + 0.09 + c * 0.15; const zf = mz0 + 0.07; B(paint, x - 0.004, x + 0.004, Y(zf) + 0.012, Y(zf) + 0.013, zf - 0.05, zf + 0.06, '#111'); // fader slot
        const fp = zf + (-0.04 + ((c * 37) % 9) * 0.01); B(paint, x - 0.012, x + 0.012, Y(fp) + 0.012, Y(fp) + 0.026, fp - 0.008, fp + 0.008, c === 7 ? '#7a1515' : '#d8d8d4'); // fader cap (master red)
        for (let r = 0; r < 3; r++) { const kz = mz0 + 0.17 + r * 0.06; paint.cylinder(x, Y(kz) + 0.01, kz, 0.011, 0.01, 0.016, 10, { col: cc(r === 0 ? '#1e1e1e' : '#1c1c1c') }); B(paint, x - 0.001, x + 0.001, Y(kz) + 0.026, Y(kz) + 0.027, kz - 0.009, kz - 0.002, '#fff'); } // pots with pointer lines
        B(emis, x - 0.01, x + 0.01, Y(mz0 + 0.13) + 0.011, Y(mz0 + 0.13) + 0.016, mz0 + 0.125, mz0 + 0.135, c % 3 ? [0.2, 0.9, 0.3] : [0.95, 0.3, 0.2]); }
      for (const vx of [mx1 - 0.2, mx1 - 0.1]) { B(emis, vx - 0.035, vx + 0.035, Y(mz1 - 0.04) + 0.012, Y(mz1 - 0.04) + 0.05, mz1 - 0.045, mz1 - 0.035, [1.0, 0.75, 0.35]); B(paint, vx - 0.002, vx + 0.002, Y(mz1 - 0.04) + 0.014, Y(mz1 - 0.04) + 0.045, mz1 - 0.047, mz1 - 0.046, '#111'); } } // VU meters
    // gooseneck paging mic on its base: push-to-talk bar, on-air LED
    B(paint, 10.8, 11.0, DT, DT + 0.035, dz0 + 0.1, dz0 + 0.26, '#1e1e1e'); B(paint, 10.82, 10.98, DT + 0.035, DT + 0.045, dz0 + 0.11, dz0 + 0.15, '#7a1515'); B(emis, 10.955, 10.975, DT + 0.035, DT + 0.042, dz0 + 0.2, dz0 + 0.215, [0.1, 1.0, 0.25]);
    { const bx2 = 10.9, bz2 = dz0 + 0.22; let px = bx2, py = DT + 0.04, pz = bz2; for (let k = 1; k <= 10; k++) { const t = k / 10, nx = bx2 + 0.02 * t, ny = DT + 0.04 + Math.sin(t * Math.PI * 0.55) * 0.34, nz = bz2 - 0.25 * t * t; rod(metal, px, py, pz, nx, ny, nz, 0.006, cc('#222')); px = nx; py = ny; pz = nz; }
      paint.cylinder(px, py - 0.01, pz - 0.035, 0.016, 0.022, 0.08, 10, { col: cc('#111') }); B(metal, px - 0.012, px + 0.012, py - 0.025, py - 0.015, pz - 0.075, pz - 0.07, '#888'); } // capsule + grille band
    // monitor (live departures), keyboard, mouse + pad
    { const mx = 13.0, mz = dz0 + 0.45, sy = DT + 0.33; B(paint, mx - 0.29, mx + 0.29, sy - 0.17, sy + 0.17, mz, mz + 0.03, '#141516'); signQuad(LB, mx, sy, mz - 0.002, 0.52, 0.26, '-z', [0, 0.5, 1, 1]); signQuad(glass, mx, sy, mz - 0.004, 0.54, 0.28, '-z', [0, 0, 1, 1]);
      B(paint, mx - 0.03, mx + 0.03, DT, sy - 0.12, mz + 0.03, mz + 0.06, '#1b1b1d'); B(paint, mx - 0.12, mx + 0.12, DT, DT + 0.012, mz - 0.06, mz + 0.1, '#1b1b1d'); B(emis, mx + 0.25, mx + 0.255, sy - 0.162, sy - 0.157, mz - 0.003, mz - 0.001, [0.2, 0.6, 1]);
      B(paint, mx - 0.24, mx + 0.18, DT, DT + 0.02, dz0 + 0.06, dz0 + 0.2, '#1c1c1c'); for (let r = 0; r < 5; r++) for (let k = 0; k < 14; k++) B(paint, mx - 0.23 + k * 0.0285, mx - 0.23 + k * 0.0285 + 0.024, DT + 0.02, DT + 0.028, dz0 + 0.07 + r * 0.026, dz0 + 0.07 + r * 0.026 + 0.022, '#2b2d30'); // keys
      B(paint, mx + 0.24, mx + 0.46, DT, DT + 0.003, dz0 + 0.06, dz0 + 0.26, '#1a1a1a'); ebox(paint, mx + 0.35, DT + 0.015, dz0 + 0.14, 0.06, 0.03, 0.1, 0, 0.1, 0, cc('#2b2d30')); }
    // desk phone: wedge base, keypad, handset in its cradle, curly cord
    { const px = 9.75, pz = dz0 + 0.2; ebox(paint, px, DT + 0.03, pz, 0.2, 0.06, 0.2, 0.25, 0, 0, cc('#1e1e1e')); for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) B(paint, px - 0.035 + k * 0.03, px - 0.035 + k * 0.03 + 0.022, DT + 0.062 - r * 0.01, DT + 0.068 - r * 0.01, pz - 0.05 + r * 0.025, pz - 0.05 + r * 0.025 + 0.018, '#d8d8d4');
      ebox(paint, px + 0.065, DT + 0.075, pz, 0.05, 0.035, 0.21, 0, 0, 0, cc('#1e1e1e')); for (const e of [-1, 1]) paint.cylinder(px + 0.065, DT + 0.07, pz + e * 0.09, 0.026, 0.026, 0.035, 10, { col: cc('#1e1e1e') });
      let cx2 = px + 0.065, cy2 = DT + 0.06, cz2 = pz - 0.1; for (let k = 1; k <= 16; k++) { const t = k / 16, nx = px + 0.065 - 0.12 * t + Math.cos(k * 2.2) * 0.008, ny = DT + 0.06 - 0.05 * Math.sin(t * Math.PI) + Math.sin(k * 2.2) * 0.008, nz = pz - 0.1 - 0.05 * t; rod(metal, cx2, cy2, cz2, nx, ny, nz, 0.004, cc('#222')); cx2 = nx; cy2 = ny; cz2 = nz; } }
    // the open train register, pen, files with a tape, a cup of tea on its saucer, a bottle of water
    { const lx = 10.3, lz = dz0 + 0.18; for (const e of [-1, 1]) { ebox(paint, lx + e * 0.105, DT + 0.012, lz, 0.21, 0.012, 0.3, 0, 0, -e * 0.04, cc('#7a1515')); ebox(paint, lx + e * 0.1, DT + 0.022, lz, 0.195, 0.008, 0.285, 0, 0, -e * 0.04, cc('#f0f0ec')); }
      for (let r = 0; r < 9; r++) B(paint, lx - 0.19, lx + 0.19, DT + 0.0275, DT + 0.028, lz - 0.12 + r * 0.028, lz - 0.119 + r * 0.028, '#6d7a90'); ebox(paint, lx + 0.06, DT + 0.032, lz + 0.02, 0.006, 0.006, 0.14, 0, 0.5, 0, cc('#1d4fae'));
      for (let k = 0; k < 4; k++) ebox(paint, 9.75, DT + 0.012 + k * 0.022, dz0 + 0.5, 0.25, 0.02, 0.32, 0, 0.05 * (k - 1.5), 0, cc(k % 2 ? '#c9a86a' : '#b8925a')); B(paint, 9.74, 9.76, DT, DT + 0.1, dz0 + 0.34, dz0 + 0.66, '#f0f0ec');
      paint.cylinder(11.25, DT, dz0 + 0.28, 0.065, 0.07, 0.008, 14, { col: cc('#fff') }); paint.cylinder(11.25, DT + 0.008, dz0 + 0.28, 0.038, 0.03, 0.07, 14, { col: cc('#fff') }); paint.cylinder(11.25, DT + 0.068, dz0 + 0.28, 0.035, 0.035, 0.002, 14, { col: cc('#7a3a12') }); // tea
      goods.bottle(GD, BG, 13.45, DT, dz0 + 0.12, 0, 1.1); }
    officeChair(paint, cc, A.chair.x, FL, A.chair.z, A.chair.yaw); // the operator chair (seat top at FL + SEAT_Y = the announcer's sit height)
    // steel almirah (north wall): grey enamel, two doors, handle, keyhole, louvres, plinth
    { const ax0 = 8.35, ax1 = 9.35, az0 = RZ0, az1 = RZ0 + 0.5, h = FL + 1.85; B(metal, ax0, ax1, FL + 0.06, h, az0, az1, '#8f8b84'); B(metal, ax0 + 0.02, ax1 - 0.02, FL, FL + 0.06, az0, az1 - 0.03, SK);
      B(metal, (ax0 + ax1) / 2 - 0.003, (ax0 + ax1) / 2 + 0.003, FL + 0.1, h - 0.04, az1, az1 + 0.002, '#444'); for (const yy of [FL + 0.1, h - 0.04]) B(metal, ax0 + 0.03, ax1 - 0.03, yy - 0.002, yy + 0.002, az1, az1 + 0.002, '#444');
      B(metal, (ax0 + ax1) / 2 + 0.03, (ax0 + ax1) / 2 + 0.045, FL + 0.9, FL + 1.12, az1, az1 + 0.03, '#bfc3c2'); paint.cylinder((ax0 + ax1) / 2 + 0.09, FL + 1.0, az1 + 0.002, 0.008, 0.008, 0.004, 8, { col: cc('#b08d57') });
      for (let k = 0; k < 6; k++) B(metal, ax1 - 0.25, ax1 - 0.08, h - 0.25 + k * 0.025, h - 0.24 + k * 0.025, az1, az1 + 0.002, '#555'); coll(ax0, ax1, az0, az1, h); }
    // red plastic visitor chair by the almirah
    { const cx = 10.2, cz = RZ0 + 0.55, R = '#a8241c'; B(paint, cx - 0.22, cx + 0.22, FL + 0.43, FL + 0.46, cz - 0.2, cz + 0.22, R); for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(paint, cx + sx * 0.19, FL + 0.44, cz + sz * 0.18, cx + sx * 0.23, FL, cz + sz * 0.23, 0.035, 0.035, cc(R));
      ebox(paint, cx, FL + 0.72, cz - 0.23, 0.42, 0.34, 0.02, -0.12, 0, 0, cc(R)); for (let k = 0; k < 4; k++) ebox(paint, cx - 0.12 + k * 0.08, FL + 0.74, cz - 0.231, 0.03, 0.16, 0.022, -0.12, 0, 0, cc('#7a1515')); for (const sx of [-1, 1]) beam(paint, cx + sx * 0.2, FL + 0.46, cz - 0.2, cx + sx * 0.2, FL + 0.6, cz - 0.22, 0.03, 0.03, cc(R)); }
    // 19-inch PA rack on the east wall: amplifier units with power LEDs, level knobs, vent slots, rack ears with screws
    { const rx0 = RX1 - 0.6, rz0 = -634.9, rz1 = -634.3, h = FL + 1.3; B(paint, rx0, RX1, FL, h, rz0, rz1, '#1b1b1d'); coll(rx0, RX1, rz0, rz1, h);
      for (let u = 0; u < 5; u++) { const y0 = FL + 0.25 + u * 0.19, y1 = y0 + 0.16, fx = rx0 - 0.004; B(paint, fx, fx + 0.004, y0, y1, rz0 + 0.02, rz1 - 0.02, u === 0 ? '#2b2d30' : '#2c2c2c');
        for (const zz of [rz0 + 0.035, rz1 - 0.035]) paint.cylinder(fx - 0.002, (y0 + y1) / 2, zz, 0.006, 0.006, 0.004, 6, { col: cc('#ccc') });
        B(emis, fx - 0.003, fx, y1 - 0.03, y1 - 0.02, rz1 - 0.09, rz1 - 0.08, u % 2 ? [0.1, 0.9, 0.3] : [1, 0.55, 0.1]); for (let k = 0; k < 3; k++) paint.cylinder(fx - 0.006, y0 + 0.07, rz0 + 0.12 + k * 0.08, 0.016, 0.016, 0.012, 10, { col: cc('#1c1c1c') });
        for (let k = 0; k < 8; k++) B(paint, fx - 0.001, fx, y0 + 0.03, y0 + 0.13, rz1 - 0.3 + k * 0.022, rz1 - 0.29 + k * 0.022, '#111'); } }
    // cable trunking from the desk to the rack (up and over the door, not across it); switch plate by the door
    { const TR = '#f0f0ec', tz0 = RZ1 - 0.035, tz1 = RZ1 - 0.012, dx0 = A.door.x - 0.62, ty = FL + 2.4;
      B(paint, 13.6, dx0, FL + 0.95, FL + 0.99, tz0, tz1, TR); B(paint, dx0 - 0.04, dx0, FL + 0.95, ty, tz0, tz1, TR); B(paint, dx0 - 0.04, RX1 - 0.012, ty - 0.04, ty, tz0, tz1, TR);
      B(paint, RX1 - 0.035, RX1 - 0.012, ty - 0.04, ty, -634.4, tz1, TR); B(paint, RX1 - 0.035, RX1 - 0.012, FL + 1.3, ty, -634.45, -634.35, TR); }
    B(paint, A.door.x - 0.9, A.door.x - 0.7, FL + 1.25, FL + 1.4, RZ1 - 0.015, RZ1 - 0.012, '#f0f0ec'); for (let k = 0; k < 3; k++) B(paint, A.door.x - 0.88 + k * 0.06, A.door.x - 0.85 + k * 0.06, FL + 1.3, FL + 1.35, RZ1 - 0.02, RZ1 - 0.015, '#1c1c1c');
    // cork notice board with pinned circulars; wall calendar; ceiling fan
    { const nx0 = 11.4, nx1 = 13.6, ny0 = FL + 1.35, ny1 = FL + 2.15, z = RZ0 + 0.012; B(paint, nx0, nx1, ny0, ny1, z, z + 0.015, '#6b4428'); B(paint, nx0 + 0.03, nx1 - 0.03, ny0 + 0.03, ny1 - 0.03, z + 0.015, z + 0.02, '#a8846a');
      const r2 = new RNG(77); for (let k = 0; k < 9; k++) { const w = 0.2 + r2.next() * 0.1, hh = 0.26 + r2.next() * 0.06, px = nx0 + 0.18 + (k % 5) * 0.4 + r2.next() * 0.05, py = ny0 + 0.2 + Math.floor(k / 5) * 0.36; ebox(paint, px, py, z + 0.022, w, hh, 0.002, 0, 0, (r2.next() - 0.5) * 0.08, cc(k % 4 === 3 ? '#f4e04a' : '#f0f0ec')); paint.cylinder(px, py + hh / 2 - 0.02, z + 0.024, 0.006, 0.006, 0.006, 6, { col: cc(k % 2 ? '#7a1515' : '#1d4fae') }); } }
    { const cx = 14.6, cy = FL + 1.75, z = RZ0 + 0.012; B(paint, cx - 0.2, cx + 0.2, cy - 0.3, cy + 0.25, z, z + 0.004, '#f0f0ec'); B(paint, cx - 0.2, cx + 0.2, cy + 0.12, cy + 0.25, z + 0.004, z + 0.006, '#7a1515'); for (let r = 0; r < 5; r++) for (let k = 0; k < 7; k++) B(paint, cx - 0.17 + k * 0.05, cx - 0.14 + k * 0.05, cy - 0.27 + r * 0.06, cy - 0.24 + r * 0.06, z + 0.004, z + 0.005, '#555'); }
    { const fx = 13.0, fz = -634.2, fy = FL + 3.2; metal.cylinder(fx, fy - 0.45, fz, 0.012, 0.012, 0.45, 6, { col: cc('#ddd') }); paint.cylinder(fx, fy - 0.56, fz, 0.11, 0.11, 0.11, 12, { col: cc('#f0f0ec') }); for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.4; ebox(paint, fx + Math.cos(a) * 0.48, fy - 0.53, fz + Math.sin(a) * 0.48, 0.66, 0.008, 0.12, 0, -a, 0.08, cc('#f0f0ec')); } }
    // two printed fare / timetable sheets in a timber frame on the west wall (they were blue stripes)
    B(paint, 8.21, 8.235, FL + 1.3, FL + 2.36, -636.43, -634.77, '#6b4428'); for (const [k, zc] of [[0, -636.05], [1, -635.15]]) { B(paint, 8.235, 8.24, FL + 1.35, FL + 2.31, zc - 0.4, zc + 0.4, '#f7f6ef'); signQuad(SC, 8.242, FL + 1.83, zc, 0.78, 0.78, '+x', T.fare(k)); }
    clockFace(8.27, FL + 2.45, -633, '+x', 0.21, { depth: 0.07, case: '#f0f0ec', rim: '#d8d8d4' });
    { const sx = 17.78, sz = -632.8, sy = FL + 2.35; B(metal, sx - 0.02, sx, sy - 0.04, sy + 0.04, sz - 0.03, sz + 0.03, '#555'); rod(metal, sx - 0.02, sy, sz, sx - 0.12, sy - 0.04, sz, 0.008, cc('#555')); ebox(paint, sx - 0.2, sy - 0.12, sz, 0.18, 0.28, 0.18, 0, 0, 0.35, cc('#2b2b2b')); ebox(paint, sx - 0.292, sy - 0.15, sz, 0.008, 0.24, 0.15, 0, 0, 0.35, cc('#1a1a1a')); } // wall PA monitor speaker on its bracket, tilted down at the desk B(paint, 12.3, 13.7, FL + 3.12, FL + 3.2, -634.56, -634.38, '#f0f0ec'); B(emis, 12.38, 13.62, FL + 3.115, FL + 3.12, -634.52, -634.42, [1, 0.98, 0.92]); // batten fitting + its tube
    B(glass, A.win[0], A.win[1], FL + 1.0, FL + 2.3, ZB - 0.21, ZB - 0.19, '#9fb8c0'); for (const x of [A.win[0], (A.win[0] + A.win[1]) / 2, A.win[1]]) B(paint, x - 0.04, x + 0.04, FL + 1.0, FL + 2.3, ZB - 0.25, ZB - 0.15, '#e8e4d8');
    signQuad(SC, (A.win[0] + A.win[1]) / 2, FL + 2.85, ZB + 0.03, 1.8, 0.9, '+z', T.announce);
    B(paint, A.door.x - 0.55, A.door.x - 0.5, FL, FL + 2.2, ZB - 0.4, ZB, '#5a3a22'); B(paint, A.door.x + 0.5, A.door.x + 0.55, FL, FL + 2.2, ZB - 0.4, ZB, '#5a3a22');
    { // the door stands open, swung 63° into the room — 55th: hung on its hinges (the leaf used to stand off the frame: its
      // rotation did not match its offset), with two raised panels a side, lever handles and three butt hinges
      const ph = 1.1, hx = A.door.x - 0.5, hz = ZB - 0.4, dx = Math.cos(ph), dz = -Math.sin(ph), th = Math.atan2(dx, dz), nx = Math.cos(th), nz = -Math.sin(th);
      const at = (u, v) => [hx + dx * u + nx * v, hz + dz * u + nz * v]; const [cx, cz] = at(0.5, 0); ebox(paint, cx, FL + 1.05, cz, 0.04, 2.1, 0.98, 0, th, 0, cc('#6b4428'));
      for (const sd of [-1, 1]) { for (const [py, ph2] of [[FL + 1.5, 0.8], [FL + 0.5, 0.7]]) { const [px, pz] = at(0.5, sd * 0.022); ebox(paint, px, py, pz, 0.006, ph2, 0.68, 0, th, 0, cc('#5a3a22')); }
        const [lx, lz] = at(0.88, sd * 0.03); ebox(metal, lx, FL + 1.0, lz, 0.02, 0.15, 0.04, 0, th, 0, cc('#bfc3c2')); const [gx, gz] = at(0.8, sd * 0.055); ebox(metal, gx, FL + 1.0, gz, 0.02, 0.02, 0.12, 0, th, 0, cc('#bfc3c2')); }
      for (const hy of [FL + 0.25, FL + 1.05, FL + 1.85]) { const [bx3, bz3] = at(0.0, 0); metal.cylinder(bx3, hy - 0.05, bz3, 0.008, 0.008, 0.1, 6, { col: cc('#b08d57') }); } }
  }

  // ================================================================ 5. platforms, sidings, stabled trains
  const platform = (x0, x1, z0, z1, faces) => { // faces: list of z planes that front a track
    B(stone, x0, x1, Y - 0.05, FL - 0.06, z0, z1, '#9f9a90', { top: false }); up(stone, x0, x1, z0, z1, FL, TERRA); surf(x0, x1, z0, z1, FL);
    for (const zf of faces) { const s = Math.abs(zf - z0) < 0.01 ? 1 : -1; // s: +1 if the face is the z0 side
      B(paint, x0, x1, Y, FL - 0.06, s > 0 ? zf - 0.02 : zf, s > 0 ? zf : zf + 0.02, OCHRE, { top: false }); B(stone, x0, x1, FL - 0.06, FL + 0.005, s > 0 ? zf - 0.03 : zf - 0.32, s > 0 ? zf + 0.32 : zf + 0.03, COPING);
      const tz = zf + s * 0.85; B(paint, x0, x1, FL, FL + 0.008, tz - 0.3, tz + 0.3, TACT); }
    for (let x = x0 + 0.6; x < x1; x += 1.2) B(paint, x, x + 0.01, FL + 0.001, FL + 0.003, z0, z1, '#8e4d35');
    // 55th: the platform body is solid from the track (its top is a walkable surface only from above — walking off the ballast
    // you used to walk into the platform, under its floor): a solid band along every track face and the ends beside the steps
    for (const zf of faces) { const s = Math.abs(zf - z0) < 0.01 ? 1 : -1; coll(x0, x1, s > 0 ? zf : zf - 0.7, s > 0 ? zf + 0.7 : zf, FL); }
    const sz = z0 === F.p1.z0 ? [z0 + 2, z1 - 1] : [z0 + 1, z1 - 1]; for (const [xa, xb] of [[x0, x0 + 0.7], [x1 - 0.7, x1]]) { coll(xa, xb, z0, sz[0], FL); coll(xa, xb, sz[1], z1, FL); }
  };
  const P1 = F.p1; platform(P1.x0, P1.x1, P1.z0, P1.z1, [P1.z1]);
  B(stone, P1.x0, X0, Y, FL - 0.06, P1.z0 - 0.02, P1.z0, '#9f9a90'); for (let x = P1.x0 + 0.2; x < X0; x += 1.8) metal.cylinder(x, FL, P1.z0 + 0.1, 0.03, 0.03, 1.1, 6, { col: cc(IRON) }); rod(metal, P1.x0, FL + 1.05, P1.z0 + 0.1, X0, FL + 1.05, P1.z0 + 0.1, 0.025, cc(IRON)); coll(P1.x0, X0, P1.z0, P1.z0 + 0.15, FL + 1.1);
  for (const I of F.islands) platform(I.x0, I.x1, I.z0, I.z1, [I.z0, I.z1]);
  const endSteps = (xe, dir, z0, z1) => { for (let k = 0; k < 5; k++) { const h = (FL - Y) * (1 - (k + 1) / 6), xa = xe + dir * 0.45 * k, xb = xa + dir * 0.45; B(stone, Math.min(xa, xb), Math.max(xa, xb), Y - 0.05, Y + h, z0 + 0.5, z1 - 0.5, '#9f9a90'); surf(Math.min(xa, xb), Math.max(xa, xb), z0 + 0.5, z1 - 0.5, Y + h, 'deck'); } };
  // 55th (outside of the station looked unfinished): each platform end is a staff ramp of steps, closed off from the street at
  // its head by a painted iron palisade with a padlocked double gate (the real station is fenced; the public comes in through
  // the booking hall and over the footbridge) — bars with spear tips on two rails, square posts with caps, a diagonal brace in
  // each gate leaf, a hasp; galvanised handrails down both sides of the steps and a yellow anti-slip nosing on every tread.
  // All merged into the existing station meshes (no new draw calls); one collider per fence line
  const endGate = (xe, dir, z0, z1) => { const za = z0 + 0.5, zb = z1 - 0.5, x = xe + dir * 0.06, y0 = FL, zm = (za + zb) / 2, gw = 1.2;
    for (let k = 0; k < 5; k++) { const xa = xe + dir * 0.45 * k, xn = xa + dir * 0.04, h = (FL - Y) * (1 - k / 6); B(paint, Math.min(xa, xn), Math.max(xa, xn), Y + h - 0.004, Y + h + 0.003, za, zb, TACT); }
    for (const zr of [za + 0.06, zb - 0.06]) { const xL = xe + dir * 2.3; rod(metal, x, FL + 0.95, zr, xL, Y + 0.95, zr, 0.022, cc(STEEL)); for (const xx of [x, xe + dir * 1.15, xL]) { const yb = xx === x ? FL : xx === xL ? Y : Y + (FL - Y) * 0.5; metal.cylinder(xx, yb, zr, 0.022, 0.022, 0.95, 6, { col: cc(STEEL) }); } }
    const post = (zz) => { B(metal, x - 0.045, x + 0.045, y0, y0 + 1.5, zz - 0.045, zz + 0.045, IRON); B(metal, x - 0.065, x + 0.065, y0 + 1.5, y0 + 1.54, zz - 0.065, zz + 0.065, IRON); };
    for (let zz = za; zz <= zb + 1e-3; zz += 2.4) post(Math.min(zz, zb)); post(zb); post(zm - gw - 0.05); post(zm + gw + 0.05);
    for (const yr of [y0 + 0.14, y0 + 1.3]) B(metal, x - 0.02, x + 0.02, yr - 0.025, yr + 0.025, za, zb, IRON);
    for (let zz = za + 0.08; zz < zb - 0.04; zz += 0.125) { B(metal, x - 0.009, x + 0.009, y0 + 0.06, y0 + 1.42, zz - 0.009, zz + 0.009, IRON); B(metal, x - 0.016, x + 0.016, y0 + 1.42, y0 + 1.47, zz - 0.016, zz + 0.016, IRON); }
    for (const sg of [-1, 1]) { const zo = zm + sg * 0.03, zf = zm + sg * gw; rod(metal, x, y0 + 0.16, zf, x, y0 + 1.28, zo, 0.014, cc(IRON)); }
    B(metal, x - 0.04 * dir, x - 0.01 * dir, y0 + 0.92, y0 + 1.06, zm - 0.09, zm + 0.09, '#6e6a62'); B(metal, x - 0.07 * dir, x - 0.04 * dir, y0 + 0.86, y0 + 0.96, zm - 0.03, zm + 0.03, '#a88a3a');
    coll(Math.min(x - 0.08, x + 0.08), Math.max(x - 0.08, x + 0.08), z0, z1, FL + 1.5); };
  endSteps(P1.x0, -1, P1.z0 + 2, P1.z1 - 1); endSteps(P1.x1, 1, P1.z0 + 2, P1.z1 - 1); for (const I of F.islands) { endSteps(I.x0, -1, I.z0 + 1, I.z1 - 1); endSteps(I.x1, 1, I.z0 + 1, I.z1 - 1); }
  endGate(P1.x0, -1, P1.z0 + 2, P1.z1 - 1); endGate(P1.x1, 1, P1.z0 + 2, P1.z1 - 1); for (const I of F.islands) { endGate(I.x0, -1, I.z0 + 1, I.z1 - 1); endGate(I.x1, 1, I.z0 + 1, I.z1 - 1); }
  // sidings: ballast bed, concrete sleepers, rails, buffer stops at both ends
  const ball = mb.get('ballast');
  for (const S of F.sidings) { ball.box((S.x0 + S.x1) / 2, (Y + BALLAST_Y) / 2, S.z, S.x1 - S.x0, BALLAST_Y - Y + 0.02, 3.4, { col: [0.82, 0.8, 0.77], uvScale: 2 }); surf(S.x0, S.x1, S.z - 1.7, S.z + 1.7, BALLAST_Y, 'deck');
    for (let x = S.x0 + 0.3; x < S.x1 - 0.2; x += 0.65) B(stone, x - 0.12, x + 0.12, BALLAST_Y - 0.04, BALLAST_Y + 0.15, S.z - 1.3, S.z + 1.3, '#8f8b84', { bottom: false });
    for (const e of [-1, 1]) { B(metal, S.x0, S.x1, BALLAST_Y + 0.15, RAIL_TOP, S.z + e * GAUGE / 2 - 0.035, S.z + e * GAUGE / 2 + 0.035, '#6a625a', { bottom: false }); B(metal, S.x0, S.x1, RAIL_TOP - 0.02, RAIL_TOP, S.z + e * GAUGE / 2 - 0.036, S.z + e * GAUGE / 2 + 0.036, '#b8b4ae'); }
    // 55th: welded rail-built buffer stops (as at Fort): two I-section posts on the running rails, raking I-section back stays
    // bolted to the rails behind with clamp plates, diagonal bracing, a red headstock with white chevrons, two sprung
    // buffers (housing, plunger, round head) and the red / white end-of-track board on its own post
    for (const [x0, d] of [[S.x0 + 2.6, 1], [S.x1 - 2.6, -1]]) { const xb = x0 - d * 2.3, HY = 1.08, I = '#3a3a3a';
      for (const e of [-1, 1]) { const z = S.z + e * GAUGE / 2;
        beam(metal, x0, RAIL_TOP, z, x0, HY + 0.2, z, 0.2, 0.012, cc(I)); for (const f of [-1, 1]) beam(metal, x0 + f * 0.1, RAIL_TOP, z, x0 + f * 0.1, HY + 0.2, z, 0.016, 0.16, cc(I)); // post (web + flanges)
        const L = Math.hypot(x0 - xb, HY - RAIL_TOP), px = -(HY - RAIL_TOP) / L * d, py = (x0 - xb) / L * 1; // stay: web in the vertical plane, flanges either side of it
        beam(metal, x0, HY, z, xb, RAIL_TOP + 0.02, z, 0.012, 0.2, cc(I)); for (const f of [-1, 1]) beam(metal, x0 + px * f * 0.1 * d, HY + py * f * 0.1, z, xb + px * f * 0.1 * d, RAIL_TOP + 0.02 + py * f * 0.1, z, 0.16, 0.016, cc(I));
        for (const cx of [x0, xb + d * 0.15]) { B(metal, cx - 0.2, cx + 0.2, RAIL_TOP - 0.16, RAIL_TOP + 0.03, z - 0.11, z - 0.05, '#2c2c2c'); B(metal, cx - 0.2, cx + 0.2, RAIL_TOP - 0.16, RAIL_TOP + 0.03, z + 0.05, z + 0.11, '#2c2c2c'); for (const bx of [-0.12, 0.12]) rod(metal, cx + bx, RAIL_TOP - 0.08, z - 0.15, cx + bx, RAIL_TOP - 0.08, z + 0.15, 0.022, cc('#4a4a4a')); } // fishplate clamps + bolts
        beam(metal, x0 - d * 0.1, HY - 0.05, z, xb + d * 0.4, RAIL_TOP + 0.1, z === S.z - GAUGE / 2 ? S.z + GAUGE / 2 : S.z - GAUGE / 2, 0.06, 0.01, cc(I)); } // cross bracing (flat bar)
      beam(metal, x0 + d * 0.11, HY, S.z - 1.2, x0 + d * 0.11, HY, S.z + 1.2, 0.012, 0.32, cc(I)); for (const f of [-1, 1]) beam(metal, x0 + d * 0.11, HY + f * 0.16, S.z - 1.2, x0 + d * 0.11, HY + f * 0.16, S.z + 1.2, 0.2, 0.016, cc(I)); // headstock I-beam
      B(paint, Math.min(x0 + d * 0.21, x0 + d * 0.33), Math.max(x0 + d * 0.21, x0 + d * 0.33), HY - 0.17, HY + 0.17, S.z - 1.25, S.z + 1.25, '#b81f1f'); // timber baulk, signal red
      for (let k = -2; k <= 2; k++) ebox(paint, x0 + d * 0.335, HY, S.z + k * 0.5, 0.008, 0.36, 0.09, 0.55 * Math.sign(k || 1), 0, 0, cc('#f2f2ee')); // white chevrons
      for (const e of [-1, 1]) { const zb = S.z + e * 0.98; xcyl(metal, x0 + d * 0.33, x0 + d * 0.6, HY, zb, 0.13, cc('#2a2a2a')); xcyl(metal, x0 + d * 0.6, x0 + d * 0.78, HY, zb, 0.075, cc('#b9bdbf')); xcyl(metal, x0 + d * 0.78, x0 + d * 0.84, HY, zb, 0.22, cc('#333')); B(metal, Math.min(x0 + d * 0.33, x0 + d * 0.35), Math.max(x0 + d * 0.33, x0 + d * 0.35), HY - 0.2, HY + 0.2, zb - 0.2, zb + 0.2, '#2c2c2c'); } // sprung buffers: housing on a base plate, plunger, round head
      { const bx = x0 - d * 0.5, bz = S.z + 1.55; metal.cylinder(bx, BALLAST_Y, bz, 0.04, 0.04, 2.1 - BALLAST_Y, 8, { col: cc('#666') }); B(paint, bx - 0.02, bx + 0.02, 1.75, 2.35, bz - 0.3, bz + 0.3, '#b81f1f'); B(paint, bx - d * 0.024 - 0.001, bx - d * 0.024 + 0.001, 1.89, 2.21, bz - 0.16, bz + 0.16, '#f2f2ee'); B(paint, bx + d * 0.024 - 0.001, bx + d * 0.024 + 0.001, 1.89, 2.21, bz - 0.16, bz + 0.16, '#f2f2ee'); } // end-of-track board
      coll(Math.min(x0, x0 + d * 0.85), Math.max(x0, x0 + d * 0.85), S.z - 1.3, S.z + 1.3, 1.3); coll(Math.min(x0, xb), Math.max(x0, xb), S.z - 1.0, S.z + 1.0, 0.9); }
  }
  // stabled maroon rake (siding A) and a parked blue S11-style set (siding B): merged into the landmarks mesh (static)
  const MAPN = { paint: 'paint', metal: 'metal', trainGlass: 'glass', trainCabGlass: 'winGlass', trainLamp: 'emissive' };
  const place = (sub, x, z, yaw) => { const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, RAIL_TOP, z); for (const [name, b] of sub.b) { const g = b.build(); if (!g) continue; (name[0] === '@' ? lmb.get(name.slice(1)) : mb.get(MAPN[name] || name)).geometry(g, m, [1, 1, 1]); g.dispose(); } }; // '@layer' = the cars' layered PBR surfaces
  { const coach = buildClassicCoach(); for (let k = 0; k < 3; k++) { const x = -96 + k * (COACH_LEN + 1.0); place(coach, x, F.sidings[0].z, Math.PI / 2); coll(x - COACH_LEN / 2, x + COACH_LEN / 2, F.sidings[0].z - 1.45, F.sidings[0].z + 1.45, RAIL_TOP + 3.9); } }
  { const cab = buildDmuCar(true).mb, tr = buildDmuCar(false).mb; const z = F.sidings[1].z; const xs = [-40, -40 - (DMU_LEN + 1), -40 - 2 * (DMU_LEN + 1)]; place(cab, xs[0], z, Math.PI / 2); place(tr, xs[1], z, Math.PI / 2); place(cab, xs[2], z, -Math.PI / 2); for (const x of xs) coll(x - DMU_LEN / 2, x + DMU_LEN / 2, z - 1.5, z + 1.5, RAIL_TOP + 4.0); }

  // ================================================================ 6. the train shed: columns, lattice arched trusses, roof + clerestory
  const onPlat = (z) => (z > F.p1.z0 + 1 && z < F.p1.z1 - 1) || F.islands.some((I) => z > I.z0 + 1 && z < I.z1 - 1);
  const S = F.shed, spans = [[S.zA, S.zM], [S.zM, S.zB]], EAV = S.eave;
  const arcY = (z, za, zb, rise) => { const t = (z - za) / (zb - za); return EAV + rise * Math.sin(Math.PI * t); };
  const colZ = [S.zA, S.zM, S.zB];
  for (let k = 0; k < S.frames; k++) { const x = S.x0 + 2 + k * S.dx;
    for (const z of colZ) { const base = z === S.zB ? Y : FL; // slender round iron columns: base, fluted shaft, capital, curved brackets
      metal.cylinder(x, base, z, 0.24, 0.2, 0.45, 10, { col: cc(IRON) }); metal.cylinder(x, base + 0.45, z, 0.13, 0.12, EAV - base - 0.95, 10, { col: cc(IRON), caps: false }); metal.cylinder(x, EAV - 0.5, z, 0.12, 0.26, 0.3, 10, { col: cc(IRON) }); metal.box(x, EAV - 0.12, z, 0.5, 0.24, 0.5, { col: cc(IRON) });
      for (const d of [-1, 1]) { if ((z === S.zA && d < 0) || (z === S.zB && d > 0)) continue; const pts = []; for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; pts.push([z + d * (1 - Math.cos(a)) * 1.5, EAV - 1.7 + Math.sin(a) * 1.6]); } for (let i = 0; i < 5; i++) beam(metal, x, pts[i][1], pts[i][0], x, pts[i + 1][1], pts[i + 1][0], 0.05, 0.08, cc(IRON)); }
      colliders.push({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2, h: EAV, kind: 'pole' }); }
    for (const [za, zb] of spans) { const n = 12, rise = S.rise; // riveted lattice truss: arched top chord, flatter bottom chord, zig-zag web
      const top = [], bot = []; for (let i = 0; i <= n; i++) { const z = za + ((zb - za) * i) / n; top.push([z, arcY(z, za, zb, rise)]); bot.push([z, arcY(z, za, zb, rise - 1.0) - (i === 0 || i === n ? 0 : 0.0)]); }
      for (let i = 0; i < n; i++) { beam(metal, x, top[i][1], top[i][0], x, top[i + 1][1], top[i + 1][0], 0.12, 0.22, cc(IRON)); beam(metal, x, bot[i][1], bot[i][0], x, bot[i + 1][1], bot[i + 1][0], 0.1, 0.14, cc(IRON)); const a = i % 2 ? top : bot, b = i % 2 ? bot : top; beam(metal, x, a[i][1], a[i][0], x, b[i + 1][1], b[i + 1][0], 0.06, 0.06, cc(IRON)); if (i) beam(metal, x, bot[i][1], bot[i][0], x, top[i][1], top[i][0], 0.05, 0.05, cc(IRON)); }
      // pendant lamps under the truss + platform numbers / LCD boards on alternate frames
      for (const zl of [za + (zb - za) * 0.25, za + (zb - za) * 0.75]) { const yb = arcY(zl, za, zb, rise - 1.0); const yl = FL + 4.4; if (yl > yb - 0.2) continue; metal.cylinder(x, yl, zl, 0.008, 0.008, yb - yl, 4, { col: cc('#444') }); paint.cylinder(x, yl - 0.18, zl, 0.3, 0.07, 0.2, 10, { col: cc('#2d4a3c'), caps: false }); B(emis, x - 0.14, x + 0.14, yl - 0.2, yl - 0.17, zl - 0.14, zl + 0.14, [1, 0.95, 0.85]); if (onPlat(zl)) lightPool(x, zl, FL + 0.012, 6); }
    }
  }
  // purlins + corrugated roof with the glazed ridge clerestory, gutters, the gable valances
  for (const [za, zb] of spans) { const n = 24, rise = S.rise; const xa = S.x0 - 0.6, xb = S.x1 + 0.6;
    for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; const z0 = za + (zb - za) * t0, z1 = za + (zb - za) * t1; let y0 = arcY(z0, za, zb, rise) + 0.12, y1 = arcY(z1, za, zb, rise) + 0.12; const crown = t0 >= 0.4 && t1 <= 0.6; if (crown) { y0 += 0.95; y1 += 0.95; }
      corr.quad([xa, y0, z0], [xa, y1, z1], [xb, y1, z1], [xb, y0, z0], [0, 0, (xb - xa) / 2.5, 1.5], [0.72, 0.74, 0.74]); if (i % 2 === 0) beam(metal, xa, y0 - 0.06, z0, xb, y0 - 0.06, z0, 0.06, 0.1, cc(IRON)); }
    for (const t of [0.4, 0.6]) { const z = za + (zb - za) * t, y = arcY(z, za, zb, rise) + 0.12; B(glass, xa, xb, y, y + 0.95, z - 0.02, z + 0.02, '#c8d8dc'); for (let x = xa; x < xb; x += 1.2) B(metal, x, x + 0.05, y, y + 0.95, z - 0.04, z + 0.04, IRON); }
    for (const xe of [xa, xb]) for (let i = 0; i < n; i++) { const z0 = za + (zb - za) * (i / n), z1 = za + (zb - za) * ((i + 1) / n), y0 = arcY(z0, za, zb, rise) + 0.12, y1 = arcY(z1, za, zb, rise) + 0.12; corr.quad([xe, y0 - 1.1, z0], [xe, y1 - 1.1, z1], [xe, y1, z1], [xe, y0, z0], [0, 0, 0.6, 0.5], [0.85, 0.83, 0.78]); for (let zz = z0; zz < z1; zz += 0.5) B(paint, xe - 0.02, xe + 0.02, Math.min(y0, y1) - 1.25, Math.min(y0, y1) - 1.1, zz, zz + 0.25, '#e7e2d4'); } // valance with a scalloped lower edge
  }
  for (const z of colZ) B(metal, S.x0 - 0.6, S.x1 + 0.6, EAV - 0.05, EAV + 0.2, z - 0.25, z + 0.25, '#4a4f4c');
  corr.quad([S.x0 - 0.6, TOP - 0.2, S.zA - 0.3], [S.x1 + 0.6, TOP - 0.2, S.zA - 0.3], [S.x1 + 0.6, EAV + 0.25, S.zA - 0.3], [S.x0 - 0.6, EAV + 0.25, S.zA - 0.3], [0, 0, 50, 1], [0.76, 0.77, 0.76]);
  B(stone, S.x0 - 6, S.x1 + 6, Y, Y + 2.4, S.zB + 0.6, S.zB + 0.85, '#a8846a'); coll(S.x0 - 6, S.x1 + 6, S.zB + 0.6, S.zB + 0.85, Y + 2.4); // boundary wall beyond the outer siding
  // platform signs (red numerals), LCD boards, clocks, PA horn speakers
  // 55th: the platform-number signs hang from the truss's bottom chord on two rods with clamps and eye bolts, in a steel
  // frame; they live in their own mesh (section 8) so they can sway — a slow breeze, and a real swing when a bullet hits
  for (let k = 1; k < S.frames; k += 2) { const x = S.x0 + 2 + k * S.dx;
    for (const [z, nums] of [[-621.5, [0]], [-606, [1, 2]], [-594, [3, 4]]]) hangSigns.push({ x, y: FL + 3.7, z, top: arcY(z, z < S.zM ? S.zA : S.zM, z < S.zM ? S.zM : S.zB, S.rise - 1.0), a: nums[0], b: nums[nums.length - 1] }); }
  for (const [x, z, f, k] of [[-43.9, -623.5, '+x', 0], [-44.1, -623.5, '-x', 1], [8.1, -606.8, '+x', 0], [7.9, -606.8, '-x', 1]]) lcdScreen(x, FL + 3.8, z, f, k, arcY(z, z < S.zM ? S.zA : S.zM, z < S.zM ? S.zM : S.zB, S.rise - 1.0));
  clockFace(-27.5, FL + 4.6, ZB + 0.1, '+z', 0.5, { depth: 0.1 });
  { // the island platform's double-faced clock: a drum on a cast-iron bracket arm off the column (55th: it used to sit
    // inside the column), dials facing both ways along the platform
    const cx = -53, cz = S.zM + 0.78, cy = FL + 4.55; clockFace(cx + 0.13, cy, cz, '+x', 0.4, { depth: 0.13 }); clockFace(cx - 0.13, cy, cz, '-x', 0.4, { depth: 0.13 });
    beam(metal, cx, cy + 0.62, S.zM + 0.1, cx, cy + 0.62, cz + 0.1, 0.06, 0.09, cc(IRON)); metal.cylinder(cx, cy + 0.41, cz, 0.02, 0.02, 0.21, 6, { col: cc(IRON) }); // arm + hanger
    const pts = []; for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push([S.zM + 0.12 + (1 - Math.cos(a)) * 0.55, cy - 0.15 + Math.sin(a) * 0.74]); } for (let i = 0; i < 6; i++) beam(metal, cx, pts[i][1], pts[i][0], cx, pts[i + 1][1], pts[i + 1][0], 0.035, 0.05, cc(IRON)); // scroll strut
    metal.cylinder(cx, cy + 0.66, cz + 0.1, 0.05, 0.03, 0.08, 8, { col: cc(IRON) }); B(metal, cx - 0.16, cx + 0.16, cy + 0.5, cy + 0.66, S.zM + 0.08, S.zM + 0.2, IRON); } // finial, collar on the column
  const horn = new THREE.CylinderGeometry(0.2, 0.05, 0.36, 10, 1, true);
  for (const s of F.speakers) for (const d of s.dirs) { // horn + its bracket back to the column / wall (s.at = the mounting plane / column axis)
    const back = s.mount === 'col' ? s.at + d * 0.12 : s.at; const hz = s.mount === 'col' ? s.at + d * 0.35 : s.z;
    const m = new THREE.Matrix4().makeRotationX(d * (Math.PI / 2 + 0.22)).setPosition(s.x, s.y, hz); metal.geometry(horn, m, cc('#bfc3c2')); metal.cylinder(s.x, s.y - 0.05, hz - d * 0.18, 0.07, 0.07, 0.1, 8, { col: cc('#8a8f8e') }); // horn + driver
    B(metal, s.x - 0.025, s.x + 0.025, s.y - 0.03, s.y + 0.03, back, hz - d * 0.18, '#666'); B(metal, s.x - 0.06, s.x + 0.06, s.y - 0.12, s.y + 0.12, back - (s.mount === 'col' ? 0 : d * 0.015), back + d * 0.015, '#666'); }
  horn.dispose();
  // areca palms in square planters against the building on platform 1 (the frontage has no forecourt for them in this city)
  for (const px of [-62.6, 20.5]) { planterPalm(mb, lmb, px, ZB + 0.9, FL, cc); coll(px - 0.75, px + 0.75, ZB + 0.15, ZB + 1.65, FL + 0.75); }
  // staff kiosk on platform 1 (mesh cage) by the footbridge
  { const x0 = -84, x1 = -81.4, z0 = -628.4, z1 = -626.2; B(paint, x0, x1, FL, FL + 0.9, z0, z1, '#4a5a4a'); B(paint, x0, x1, FL + 2.3, FL + 2.4, z0 - 0.1, z1 + 0.1, '#3a4a3a'); for (let x = x0; x <= x1; x += 0.15) rod(metal, x, FL + 0.9, z1, x, FL + 2.3, z1, 0.006, cc('#666')); for (let y = FL + 0.9; y <= FL + 2.3; y += 0.15) rod(metal, x0, y, z1, x1, y, z1, 0.006, cc('#666')); for (const z of [z0, z1]) for (const x of [x0, x1]) metal.cylinder(x, FL, z, 0.03, 0.03, 2.3, 6, { col: cc('#3a4a3a') }); coll(x0, x1, z0, z1, FL + 2.4); }

  // ================================================================ 7. footbridge with stairs to platform 1 and both islands
  { const Bd = F.bridge, D = Bd.deck, xa = Bd.x0, xb = Bd.x1;
    B(paint, xa, xb, D - 0.25, D, Bd.z0, Bd.z1, '#7a7a74'); up(stone, xa, xb, Bd.z0, Bd.z1, D + 0.002, '#9a5a44'); surf(xa, xb, Bd.z0, Bd.z1, 0.25, 'deck', { y0: D - 0.25 });
    for (const xe of [xa, xb]) B(metal, xe - 0.08, xe + 0.08, D - 0.9, D - 0.25, Bd.z0, Bd.z1, '#3c4a42');
    const openE = Bd.stairs.map((s) => [s.zc - Bd.w / 2, s.zc + Bd.w / 2]);
    for (const [xe, opens] of [[xa, []], [xb, openE]]) { let z = Bd.z0; for (const [o0, o1] of [...opens, [Bd.z1, Bd.z1]]) { if (o0 > z) { for (let zz = z; zz < o0 - 0.01; zz += 1.4) metal.box(xe, D + 0.55, Math.min(zz + 0.02, o0), 0.06, 1.1, 0.06, { col: cc('#3c4a42') }); rod(metal, xe, D + 1.1, z, xe, D + 1.1, o0, 0.03, cc('#3c4a42')); for (let zz = z; zz < o0; zz += 0.12) rod(metal, xe, D + 0.08, zz, xe, D + 1.05, zz, 0.008, cc('#55625a')); coll(xe - 0.06, xe + 0.06, z, o0, 1.15, { y0: D }); } z = o1; } }
    for (const zs of [Bd.z0, Bd.z1]) { B(metal, xa, xb, D, D + 1.1, zs - 0.03, zs + 0.03, '#3c4a42'); coll(xa, xb, zs - 0.06, zs + 0.06, 1.15, { y0: D }); }
    for (const zsup of [-617.2, -603.0, -597.4, -591.0]) for (const xe of [xa + 0.2, xb - 0.2]) { const base = zsup < -612 || (zsup > -610.3 && zsup < -601.7) || zsup > -598.3 ? FL : Y; metal.box(xe, (base + D - 0.9) / 2, zsup, 0.3, D - 0.9 - base, 0.3, { col: cc('#3c4a42') }); colliders.push({ x0: xe - 0.16, x1: xe + 0.16, z0: zsup - 0.16, z1: zsup + 0.16, h: D - 0.9, kind: 'pole' }); }
    const nSt = Math.round((D - FL) / 0.172), rise = (D - FL) / nSt, run = Bd.run / nSt;
    for (const st of Bd.stairs) { const z0 = st.zc - Bd.w / 2, z1 = st.zc + Bd.w / 2;
      for (let k = 0; k < nSt; k++) { const top = D - rise * (k + 1) + rise, xa2 = xb + run * k, xb2 = xa2 + run; const yb = Math.max(FL, top - 0.3); B(stone, xa2, xb2, yb, top, z0, z1, '#9a948a'); surf(xa2, xb2, z0, z1, top - yb, 'deck', { y0: yb }); }
      for (const ze of [z0, z1]) { beam(metal, xb, D - 0.3, ze, xb + Bd.run, FL - 0.05, ze, 0.08, 0.35, cc('#3c4a42')); beam(metal, xb, D + 1.0, ze, xb + Bd.run, FL + 1.0, ze, 0.05, 0.05, cc('#3c4a42')); for (let k = 0; k <= 8; k++) { const t = k / 8; rod(metal, xb + Bd.run * t, D + (FL - D) * t, ze, xb + Bd.run * t, D + (FL - D) * t + 1.0, ze, 0.02, cc('#3c4a42')); }
        for (let k = 0; k < 6; k++) { const ta = k / 6, tb = (k + 1) / 6, ya = D + (FL - D) * tb; colliders.push({ x0: xb + Bd.run * ta, x1: xb + Bd.run * tb, z0: ze - 0.05, z1: ze + 0.05, h: 1.0 + (D - FL) / 6, y0: ya, kind: 'landmark' }); } }
      metal.box(xb + Bd.run * 0.55, (FL + D * 0.5) / 2 + 0.2, st.zc, 0.25, D * 0.5 - FL + 0.4, 0.25, { col: cc('#3c4a42') }); }
  }

  // ================================================================ 8. atlases → meshes, clock hands, LED clock
  const at = buildAtlases(); const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const mk = (c, lit) => { const t = tex(c); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.62, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: lit ? 0.75 : 0, side: THREE.FrontSide }); };
  const smats = { sA: mk(at.a), sB: mk(at.b), sC: mk(at.c), sD: mk(at.d, true) }; anim.signMats = smats; for (const k in smats) patchInterior(smats[k]);
  for (const k of ['corrugated', 'roofTiles', 'winGlass', 'glass']) if (MAT[k] && !MAT[k].userData.interior) { patchInterior(MAT[k]); MAT[k].userData.interior = true; } // the shed roof's underside, the glazing: dim under the roofs too
  for (const m of sb.toMeshes(smats, { cast: false, receive: true })) { m.name = 'fort-' + m.name; group.add(m); }
  { const g1 = GD.build(); if (g1) { const m = new THREE.Mesh(g1, goods.goodsMaterial()); m.name = 'fort-goods'; m.castShadow = true; m.receiveShadow = true; group.add(m); } const g2 = BG.build(); if (g2) { const m = new THREE.Mesh(g2, goods.bottleGlassMaterial()); m.name = 'fort-bottle-glass'; m.renderOrder = 3; group.add(m); } }
  { // swinging signs: one mesh, one draw call — every vertex carries its sign's pivot + index, the vertex shader turns it
    const HB = new MultiBuilder().get('hang'), WU = [773 / 1024, 1 - 7 / 256]; const swv = []; const sw = [];
    const flat = (v0) => { for (let v = v0; v < HB.vcount; v++) { HB.uv[v * 2] = WU[0]; HB.uv[v * 2 + 1] = WU[1]; } };
    hangSigns.forEach((h, i) => { const v0 = HB.vcount, ty = h.y + 0.43, dark = cc('#2a2c2e');
      for (const e of [-0.3, 0.3]) { HB.cylinder(h.x, ty + 0.03, h.z + e, 0.009, 0.009, h.top - ty - 0.06, 5, { col: dark, caps: false }); HB.box(h.x, h.top - 0.03, h.z + e, 0.12, 0.06, 0.08, { col: dark }); HB.box(h.x, ty + 0.02, h.z + e, 0.03, 0.05, 0.05, { col: dark }); } // rods, chord clamps, eye bolts
      HB.box(h.x, h.y, h.z, 0.05, 0.86, 0.86, { col: cc('#3a3d40') }); HB.box(h.x, h.y, h.z, 0.056, 0.8, 0.8, { col: cc('#f4f4f0') }); flat(v0); // frame + enamel board
      signQuad(HB, h.x + 0.029, h.y, h.z, 0.78, 0.78, '+x', T.num(h.a)); signQuad(HB, h.x - 0.029, h.y, h.z, 0.78, 0.78, '-x', T.num(h.b));
      for (let v = v0; v < HB.vcount; v++) swv.push(h.x, h.top, h.z, i); sw.push({ x: h.x, y: h.y, z: h.z, L: h.top - h.y, ax: 0, az: 0, vx: 0, vz: 0, ph: i * 1.7 + h.x * 0.13 }); });
    const g = HB.build(); if (g) { g.setAttribute('swing', new THREE.Float32BufferAttribute(swv, 4));
      const U = { uSw: { value: sw.map(() => new THREE.Vector2()) } };
      const mat = new THREE.MeshStandardMaterial({ map: smats.sC.map, vertexColors: true, roughness: 0.55, metalness: 0.0 });
      mat.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nattribute vec4 swing;\nuniform vec2 uSw[${sw.length}];\nvec3 swRot(vec3 d, vec2 a) { float cx = cos(a.x), sx = sin(a.x), cz = cos(a.y), sz = sin(a.y); d = vec3(d.x * cz - d.y * sz, d.x * sz + d.y * cz, d.z); return vec3(d.x, d.y * cx - d.z * sx, d.y * sx + d.z * cx); }`)
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = swRot(objectNormal, uSw[int(swing.w + 0.5)]);')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = swing.xyz + swRot(transformed - swing.xyz, uSw[int(swing.w + 0.5)]);'); };
      mat.customProgramCacheKey = () => 'fort-swing-' + sw.length; patchInterior(mat);
      const m = new THREE.Mesh(g, mat); m.name = 'fort-hang-signs'; m.frustumCulled = false; m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m);
      anim.swing = { list: sw, U, last: 0, t: 0 }; } }
  // a bullet path (a → b) passing a sign kicks it: angular velocity from the bullet's direction, more when it hits low
  anim.shot = (a, b) => { const S2 = anim.swing; if (!S2) return false; const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz || 1; let hitAny = false;
    for (const s of S2.list) { const t = Math.max(0, Math.min(1, ((s.x - a.x) * dx + (s.y - a.y) * dy + (s.z - a.z) * dz) / L2)); const px = a.x + dx * t - s.x, py = a.y + dy * t - s.y, pz = a.z + dz * t - s.z;
      if (px * px + py * py + pz * pz > 0.45 * 0.45) continue; const l = Math.sqrt(L2), k = 1.6 * (1 + (s.y - (a.y + dy * t)) / 0.8 * 0.4); s.vz += (dx / l) * k; s.vx -= (dz / l) * k * 0.35; hitAny = true; }
    return hitAny; };
  { const g = mergeLayered(lmb); const m = new THREE.Mesh(g, stationMaterial()); m.name = 'fort-pbr'; m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); anim.pbr = m; }
  // covered spaces: sky visibility falls off inside the halls / under the shed, the tubes and pendant lamps light them
  { const S = F.shed, hc = F.hall.ceil;
    const shedRows = [S.zA, S.zM].flatMap((za, i) => { const zb = i ? S.zB : S.zM; return [za + (zb - za) * 0.25, za + (zb - za) * 0.75]; }).map((zl) => ({ start: S.x0 + 2, step: S.dx, n: S.frames, y: FL + 4.2, at: zl, axis: 'x', I: 5.5, R: 9, clip: [S.x0 - 4, S.zA, S.x1 + 4, S.zB] }));
    setInterior({
      zones: [{ x0: X0, z0: ZF, x1: X1, z1: ZB, top: hc + 0.2, base: 0.16, edge: 0.34, soft: 4 }, { x0: S.x0 - 0.6, z0: S.zA, x1: S.x1 + 0.6, z1: S.zB + 0.6, top: S.eave + S.rise + 1.2, roofY: S.eave - 0.3, base: 0.42, edge: 0.75, soft: 7 },
        { x0: X0 - 0.3, z0: ZF - 2.0, x1: X1 + 0.3, z1: ZF, top: FL + 3.68, base: 0.62, edge: 0.8, soft: 0.6 }],
      portals: [...F.entrances.map((e) => ({ x: e.x, z: ZF + 0.2, y: FL, r: e.w * 0.85, s: 0.55 })), ...F.backArches.map((x) => ({ x, z: ZB - 0.2, y: FL, r: 4.2, s: 0.7 })), { x: F.res.portalX, z: ZF + 0.2, y: FL, r: 2.6, s: 0.5 }, { x: (F.ann.win[0] + F.ann.win[1]) / 2, z: ZB - 0.2, y: FL + 1.0, r: 2.4, s: 0.45 }, { x: F.ann.door.x, z: ZB - 0.2, y: FL, r: 1.5, s: 0.35 }],
      rows: [{ start: -57, step: 5, n: 9, y: hc - 0.05, at: -648, axis: 'x', I: 5, R: 9, clip: [-60, ZF + 0.4, -10.2, ZB - 0.4] }, { start: -57, step: 5, n: 9, y: hc - 0.05, at: -641, axis: 'x', I: 5, R: 9, clip: [-60, ZF + 0.4, -10.2, ZB - 0.4] }, { start: -57, step: 5, n: 9, y: hc - 0.05, at: -633, axis: 'x', I: 5, R: 9, clip: [-60, ZF + 0.4, -10.2, ZB - 0.4] },
        { start: -647, step: 7, n: 3, y: FL + 4.12, at: -5, axis: 'z', I: 2.6, R: 8, clip: [-9.8, ZF + 0.4, 7.8, ZB - 0.4] }, { start: -634.47, step: 1, n: 1, y: FL + 3.15, at: 13, axis: 'z', I: 1.6, R: 6, clip: [8.2, -637.8, 17.8, ZB - 0.4] },
        { start: ZF + 2, step: 4, n: 5, y: FL + 3.36, at: -62.05, axis: 'z', I: 1.3, R: 5, clip: [-63.8, ZF + 0.4, -60.4, ZB - 0.4] }, ...shedRows] }); }
  // clock hands: one InstancedMesh, hour + minute per dial
  { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); const hands = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }), clocks.length * 2); hands.name = 'fort-clock-hands'; hands.castShadow = false; hands.frustumCulled = false; group.add(hands); anim.hands = hands; }
  // red LED clock (128 × 32 canvas, redrawn once a game minute)
  { const c = document.createElement('canvas'); c.width = 128; c.height = 32; const t = tex(c); const mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false }); anim.led = { c, x: c.getContext('2d'), t, last: -1 };
    for (const s of anim.ledSpots) { const n = FACE_N[s.face]; const box = new THREE.Mesh(new THREE.BoxGeometry(n[0] ? 0.08 : s.w + 0.1, s.h + 0.1, n[2] ? 0.08 : s.w + 0.1), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 })); box.position.set(s.x - n[0] * 0.04, s.y, s.z - n[2] * 0.04); group.add(box);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat); p.position.set(s.x + n[0] * 0.002, s.y, s.z + n[2] * 0.002); p.rotation.y = Math.atan2(n[0], n[2]); group.add(p); anim.ledMeshes.push(p); } }

  { const c = document.createElement('canvas'); c.width = 512; c.height = 512; const t = tex(c); t.anisotropy = 8; t.generateMipmaps = true;
    const mat = new THREE.MeshBasicMaterial({ map: t, color: 0xdedede, toneMapped: false }); const g = LB.build(); if (g) { const m = new THREE.Mesh(g, mat); m.name = 'fort-lcd'; m.matrixAutoUpdate = false; m.updateMatrix(); group.add(m); }
    anim.lcd = { c, x: c.getContext('2d'), t, last: -1e9, tick: 0 }; drawBoards(anim.lcd, [], 12, 0); }
  // anim.live(trains, hour, gameMinutesPerSecond, px, pz): redraws the screens twice a second while the player is near the station
  anim.live = (trains, hour, mps, px, pz) => { const L = anim.lcd; if (!L || !trains || !trains.forecast) return; const now = performance.now(); if (now - L.last < 500) return;
    if (px !== undefined && Math.hypot(px - (X0 + X1) / 2, pz - (ZF + F.shed.zB) / 2) > 320) return; L.last = now; L.tick++;
    drawBoards(L, trains.forecast(FORT.stopName || 'Colombo Fort', 4), hour, mps); };
  const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  anim.update = (hour, night) => {
    const h = ((hour % 24) + 24) % 24, mins = h * 60;
    clocks.forEach((k, i) => { const n = FACE_N[k.face], r = FACE_R[k.face];
      for (const [j, a, len, w] of [[0, ((mins / 720) % 1) * Math.PI * 2, k.r * 0.55, 0.06 * k.r / 0.5], [1, ((mins % 60) / 60) * Math.PI * 2, k.r * 0.85, 0.04 * k.r / 0.5]]) {
        _y.set(r[0] * Math.sin(a), Math.cos(a), r[2] * Math.sin(a)); _z.set(n[0], n[1], n[2]); _x.crossVectors(_y, _z);
        _m.makeBasis(_x.multiplyScalar(w), _y.clone().multiplyScalar(len), _z.clone().multiplyScalar(0.012)); _m.setPosition(k.x + n[0] * (0.01 + j * 0.006), k.y, k.z + n[2] * (0.01 + j * 0.006)); anim.hands.setMatrixAt(i * 2 + j, _m); } });
    anim.hands.instanceMatrix.needsUpdate = true;
    const mm = Math.floor(mins) % 1440; const L = anim.led; if (L && mm !== L.last) { L.last = mm; const x = L.x; x.fillStyle = '#080000'; x.fillRect(0, 0, 128, 32); x.font = '700 28px "Courier New", monospace'; x.fillStyle = '#ff2a12'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(`${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`, 64, 17); L.t.needsUpdate = true; }
    for (const k of ['sA', 'sB', 'sC']) smats[k].emissiveIntensity = 0.22 * (night || 0);
    setInteriorNight(night || 0);
    const SW = anim.swing; if (SW) { const now = performance.now() / 1000, dt = Math.min(0.05, SW.last ? now - SW.last : 0); SW.last = now; SW.t += dt;
      SW.list.forEach((s, i) => { const w = Math.sqrt(9.81 / Math.max(0.5, s.L)); // a pendulum on its rods; across the board it swings freely, in its plane the two rods hold it stiff
        const breeze = 0.004 * Math.sin(SW.t * 0.37 + s.ph) + 0.003 * Math.sin(SW.t * 0.91 + s.ph * 2.3); // ≈ ±0.4°: you have to look for it
        s.vz += (-w * w * (s.az - breeze) - 0.55 * s.vz) * dt; s.vx += (-((w * 3) ** 2) * s.ax - 2.5 * s.vx) * dt; s.az = Math.max(-0.9, Math.min(0.9, s.az + s.vz * dt)); s.ax += s.vx * dt;
        SW.U.uSw.value[i].set(s.ax, s.az); }); }
  };
  anim.update(12, 0);
  return anim;
}

// ---------------------------------------------------------------- the live LCD boards (55th)
// Modelled on the screens at Fort: a dark navy board, header with the board name in three languages and the clock, a
// column-header row, alternating blue rows (time, destination in English with Sinhala / Tamil under it, train type,
// platform, remarks), the train-type legend and a scrolling notice line. Every row is a real call of a running train.
const hhmm = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const TICKER = 'Please stand behind the yellow line  ·  කරුණාකර කහ ඉරෙන් පිටුපසින් සිටින්න  ·  தயவுசெய்து மஞ்சள் கோட்டின் பின்னால் நிற்கவும்  ·  Keep your belongings with you  ·  Smoking is prohibited in the station  ·  ';
function drawBoards(L, calls, hour, mps) {
  const x = L.x, nowM = hour * 60, blink = L.tick % 2 === 0;
  const font = (w, px, fam = '"Barlow Condensed", "Noto Sans", sans-serif') => `${w} ${px}px ${fam}`;
  const T = (s, cx, cy, f, col, al = 'left', maxW) => { x.font = f; x.fillStyle = col; x.textAlign = al; x.textBaseline = 'middle'; x.fillText(s, cx, cy, maxW); };
  for (const [oy, arr] of [[0, false], [256, true]]) {
    // backplate + header
    x.fillStyle = '#040a18'; x.fillRect(0, oy, 512, 256);
    let g = x.createLinearGradient(0, oy, 0, oy + 36); g.addColorStop(0, '#163f86'); g.addColorStop(1, '#0c2a5e'); x.fillStyle = g; x.fillRect(0, oy, 512, 36);
    T(arr ? 'ARRIVALS' : 'DEPARTURES', 10, oy + 13, font(800, 21), '#ffffff'); T(arr ? 'පැමිණීම්  ·  வருகை' : 'පිටත්වීම්  ·  புறப்பாடு', 10, oy + 29, '600 10px "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif', '#bcd2ff');
    T('COLOMBO FORT', 256, oy + 13, font(700, 15), '#dfe8ff', 'center'); T('කොටුව  ·  கோட்டை', 256, oy + 28, '600 10px "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif', '#9fb6e6', 'center');
    const hm = hhmm(Math.floor(nowM)); x.fillStyle = '#06142e'; x.fillRect(420, oy + 5, 86, 26); T(blink ? hm : hm.replace(':', ' '), 463, oy + 19, font(700, 24, '"Barlow Condensed", monospace'), '#ffd23a', 'center');
    // column headers
    x.fillStyle = '#1f56b0'; x.fillRect(0, oy + 36, 512, 18); const hf = font(700, 12), hc = '#ffe27a';
    T('TIME', 10, oy + 45, hf, hc); T(arr ? 'FROM' : 'DESTINATION', 66, oy + 45, hf, hc); T('TYPE', 300, oy + 45, hf, hc); T('PF', 352, oy + 45, hf, hc); T('REMARKS', 392, oy + 45, hf, hc);
    // rows
    const rows = calls.slice(0, 4);
    for (let i = 0; i < 4; i++) { const y = oy + 54 + i * 40; x.fillStyle = i % 2 ? '#0e2f6e' : '#0a2456'; x.fillRect(0, y, 512, 40); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(0, y, 512, 1);
      const c = rows[i]; if (!c) { T('—', 10, y + 20, font(600, 16), '#5f78a8'); continue; }
      const st = arr ? c.from : c.to, tm = nowM + (arr ? c.t : c.dep) * mps;
      T(hhmm(tm), 10, y + 20, font(700, 22), '#ffffff'); T(st.name.toUpperCase(), 66, y + 14, font(700, 19), '#ffffff', 'left', 226);
      T(`${st.si}  ·  ${st.ta}`, 66, y + 31, '500 11px "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif', '#a9c4ff', 'left', 226);
      T('Slow', 300, y + 20, font(600, 16), '#e6ecff'); T('1', 358, y + 20, font(800, 22), '#ffd23a', 'center');
      let rm = 'On time', rc = '#5be36b';
      if (c.here) { if (arr) { rm = 'Arrived'; } else if (c.dep < 8) { rm = 'Departing'; rc = '#ffb21a'; } else { rm = 'Boarding'; } }
      else if (c.late) { rm = 'Delayed'; rc = '#ff5a4a'; } else if (c.t < 60) { rm = arr ? 'Arriving' : 'On time'; rc = arr ? '#ffb21a' : rc; if (arr && !blink) rc = '#a86f10'; }
      T(rm, 392, y + 20, font(700, 17), rc); }
    // legend + scrolling notice
    x.fillStyle = '#071936'; x.fillRect(0, oy + 214, 512, 20); T('S – Slow    E – Express    I – Intercity', 10, oy + 224, font(600, 12), '#c8d6f5'); T('Sri Lanka Railways', 502, oy + 224, font(600, 12), '#8fa6d6', 'right');
    x.fillStyle = '#020611'; x.fillRect(0, oy + 234, 512, 22); x.save(); x.beginPath(); x.rect(0, oy + 234, 512, 22); x.clip();
    x.font = '600 13px "Noto Sans", "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif'; const w = Math.max(1, x.measureText(TICKER).width); const off = (L.tick * 14) % w;
    for (let k = -1; k < 3; k++) T(TICKER, 512 - off + k * w - 512, oy + 245, x.font, '#ffcf4a'); x.restore();
    // LCD look: a faint vertical sheen and darker edges (backlight falloff)
    g = x.createLinearGradient(0, 0, 512, 0); g.addColorStop(0, 'rgba(0,0,0,0.22)'); g.addColorStop(0.12, 'rgba(0,0,0,0)'); g.addColorStop(0.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.22)'); x.fillStyle = g; x.fillRect(0, oy, 512, 256);
  }
  L.t.needsUpdate = true;
}

// ---------------------------------------------------------------- an areca palm in a square planter (forecourt)
function planterPalm(mb, lmb, x, z, y0, C) {
  const P = lmb.get('concrete'), bark = mb.get('bark'), leaf = mb.get('palm');
  P.box(x, y0 + 0.35, z, 1.4, 0.7, 1.4, { col: C('#d8d2c4'), uvScale: 2 }); P.box(x, y0 + 0.72, z, 1.5, 0.06, 1.5, { col: C('#c8c1b0') }); lmb.get('concrete').box(x, y0 + 0.69, z, 1.3, 0.02, 1.3, { col: C('#3a2a1e') });
  const stems = [[0, 0, 3.4], [0.25, 0.18, 2.6], [-0.22, 0.2, 2.9], [0.1, -0.25, 2.2]];
  for (const [ox, oz, h] of stems) { bark.cylinder(x + ox, y0 + 0.7, z + oz, 0.07, 0.055, h, 7, { col: C('#7d8a5a') }); for (let r = 0.4; r < h; r += 0.35) bark.cylinder(x + ox, y0 + 0.7 + r, z + oz, 0.075, 0.075, 0.025, 7, { col: C('#5e6a44'), caps: false });
    const tx = x + ox, ty = y0 + 0.7 + h, tz = z + oz;
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + ox * 7, L = 1.5, droop = 0.55; const dx = Math.cos(a), dz = Math.sin(a), px = -dz * 0.32, pz = dx * 0.32;
      const mid = [tx + dx * L * 0.5, ty + 0.35, tz + dz * L * 0.5], end = [tx + dx * L, ty + 0.35 - droop, tz + dz * L];
      leaf.quad([tx - px * 0.3, ty, tz - pz * 0.3], [tx + px * 0.3, ty, tz + pz * 0.3], [mid[0] + px, mid[1], mid[2] + pz], [mid[0] - px, mid[1], mid[2] - pz], [0, 0, 1, 0.5], [0.9, 1, 0.85]);
      leaf.quad([mid[0] - px, mid[1], mid[2] - pz], [mid[0] + px, mid[1], mid[2] + pz], [end[0] + px * 0.4, end[1], end[2] + pz * 0.4], [end[0] - px * 0.4, end[1], end[2] - pz * 0.4], [0, 0.5, 1, 1], [0.9, 1, 0.85]); }
  }
}
