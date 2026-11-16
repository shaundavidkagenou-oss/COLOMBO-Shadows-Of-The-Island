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
    txt(x, 'COLOMBO FORT  ·  කොටුව  ·  கோட்டை', 512, 225, FS(700, 46), '#1b2b3a', 1000);
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
  const stone = mb.get('kerb'), wallM = mb.get('paint'), paint = mb.get('paint'), metal = mb.get('metal'), wglass = mb.get('winGlass'), glass = mb.get('glass'), emis = mb.get('emissive'), corr = mb.get('corrugated');
  // box from bounds
  const B = (b, x0, x1, y0, y1, z0, z1, col, o = {}) => { if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0]; if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4 || z1 - z0 < 1e-4) return; b.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, { col: cc(col), uvScale: o.uv || 3, bottom: o.bottom ?? true, top: o.top ?? true }); };
  const coll = (x0, x1, z0, z1, h, extra = {}) => colliders.push({ x0, x1, z0, z1, h, kind: 'landmark', ...extra });
  const surf = (x0, x1, z0, z1, h, kind = 'platform', extra = {}) => colliders.push({ x0, x1, z0, z1, h, kind, ...extra });
  const up = (b, x0, x1, z0, z1, y, col) => b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [x0 / 3, z0 / 3, x1 / 3, z1 / 3], cc(col)); // upward rectangle
  const down = (b, x0, x1, z0, z1, y, col) => b.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 0, 1, 1], cc(col)); // downward (ceilings)
  const sb = new MultiBuilder(); const SA = sb.get('sA'), SBd = sb.get('sB'), SC = sb.get('sC'), SD = sb.get('sD');
  const clocks = []; // {x, y, z, face, r}
  const anim = { clocks, ledMeshes: [] };

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
  // a wall along x (face planes z0 / z1) with openings [x0, x1, top, arch?]: solid piers full height, lintels / arch spandrels
  const wallX = (z0, z1, xa, xb, holes, col, o = {}) => {
    const hs = holes.filter((h) => h[1] > xa && h[0] < xb).sort((p, q) => p[0] - q[0]); let x = xa;
    for (const h of hs) { if (h[0] > x) { B(wallM, x, h[0], FL, TOP, z0, z1, col); if (!o.noColl) coll(x, h[0], z0, z1, TOP); } x = Math.max(x, h[1]);
      const [h0, h1, ht, arch, sill] = h; if (sill) B(wallM, h0, h1, FL, sill, z0, z1, col);
      if (arch) { const r = (h1 - h0) / 2, n = 14; for (let k = 0; k < n; k++) { const xa2 = h0 + (k / n) * (h1 - h0), xb2 = h0 + ((k + 1) / n) * (h1 - h0), u = ((xa2 + xb2) / 2 - (h0 + r)) / r; const ya = ht - r + Math.sqrt(Math.max(0, 1 - u * u)) * r; B(wallM, xa2, xb2, ya, TOP, z0, z1, col); } }
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
  dado(-9.8, -2.6, ZF + 0.4, ZF + 0.42); dado(-0.6 + 1.2, 7.8, ZF + 0.4, ZF + 0.42); dado(-9.8, 7.8, ZB - 0.42, ZB - 0.4); dado(-9.8, -9.78, ZF + 0.4, ZB - 0.4);

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
    for (let x = xa + 0.6; x < xb - 0.3; x += 3) { const pts = []; for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; pts.push([ZF - Math.sin(a) * (CD - 0.4), CY - 1.3 + (1 - Math.cos(a)) * 1.3]); }
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
    signQuad(SA, -35, FL + 5.2, zf - 0.02, 9.4, 0.6, '-z', T.fascia(3));
    // balustrade
    B(wallM, xa - 0.2, xb + 0.2, ht, ht + 0.14, zf - 0.3, ZF, '#eee8da'); B(wallM, xa - 0.2, xb + 0.2, ht + 0.82, ht + 0.95, zf - 0.3, zf + 0.05, '#eee8da');
    for (let x = xa + 0.2; x <= xb - 0.2; x += 0.32) { if (x > -36.7 && x < -33.3) continue; wallM.cylinder(x, ht + 0.14, zf - 0.13, 0.06, 0.09, 0.34, 8, { col: cc('#f1ece0') }); wallM.cylinder(x, ht + 0.48, zf - 0.13, 0.09, 0.05, 0.34, 8, { col: cc('#f1ece0') }); }
    for (const px of [xa, -37.2, -32.8, xb]) { B(wallM, px - 0.3, px + 0.3, ht, ht + 1.1, zf - 0.35, zf + 0.25, '#ede7d8'); wallM.cylinder(px, ht + 1.1, zf - 0.05, 0.12, 0.24, 0.18, 10, { col: cc('#ede7d8') }); wallM.cylinder(px, ht + 1.28, zf - 0.05, 0.24, 0.12, 0.2, 10, { col: cc('#ede7d8') }); wallM.cylinder(px, ht + 1.48, zf - 0.05, 0.05, 0.05, 0.12, 6, { col: cc('#ede7d8') }); } // pedestals + ball finials
    // curved scrolled pediment: a segmental crown over the clock with scrolls (volutes) at its feet
    const pw = 3.6, py = ht + 0.14; const n = 16; for (let k = 0; k < n; k++) { const u0 = -1 + (2 * k) / n, u1 = -1 + (2 * (k + 1)) / n, um = (u0 + u1) / 2; const yt = py + 1.2 + Math.sqrt(1 - um * um) * 1.15; B(wallM, -35 + u0 * pw / 2, -35 + u1 * pw / 2, py, yt, zf - 0.1, zf + 0.25, W); B(wallM, -35 + u0 * pw / 2 - 0.02, -35 + u1 * pw / 2 + 0.02, yt, yt + 0.16, zf - 0.22, zf + 0.25, '#e7e0cd'); }
    for (const e of [-1, 1]) { const g = new THREE.CylinderGeometry(0.34, 0.34, 0.4, 14); const m = new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(-35 + e * (pw / 2 + 0.1), py + 0.45, zf - 0.02); wallM.geometry(g, m, cc('#ece6d6')); const g2 = new THREE.CylinderGeometry(0.16, 0.16, 0.42, 10); wallM.geometry(g2, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(-35 + e * (pw / 2 + 0.1), py + 0.45, zf - 0.04), cc('#d9d1bb')); g.dispose(); g2.dispose(); }
    paint.cylinder(-35, py + 1.9, zf - 0.12, 0.98, 0.98, 0.02, 24, { col: cc('#2a2a2a'), caps: false }); clocks.push({ x: -35, y: py + 1.9, z: zf - 0.125, face: '-z', r: 0.9 });
  }
  // round-arched entrance pavilion (reservations office): pilasters, entablature, urn finials, archivolt
  { const cx = F.res.portalX, xa = cx - 3.6, xb = cx + 3.6, zf = PZ, ht = Y + 9.2, r = 1.6, spring = FL + 2.6;
    B(wallM, xa, cx - r, FL, ht, zf, ZF, W); B(wallM, cx + r, xb, FL, ht, zf, ZF, W); coll(xa, cx - r, zf, ZF, ht); coll(cx + r, xb, zf, ZF, ht); B(stone, xa, cx - r, Y, FL, zf, ZF, '#8e8a80'); B(stone, cx + r, xb, Y, FL, zf, ZF, '#8e8a80');
    const n = 14; for (let k = 0; k < n; k++) { const xa2 = cx - r + (2 * r * k) / n, xb2 = cx - r + (2 * r * (k + 1)) / n, u = ((xa2 + xb2) / 2 - cx) / r; B(wallM, xa2, xb2, spring + Math.sqrt(Math.max(0, 1 - u * u)) * r, ht, zf, ZF, W); }
    for (let k = 0; k < 12; k++) { const a0 = Math.PI - (k / 12) * Math.PI, a1 = Math.PI - ((k + 1) / 12) * Math.PI; beam(wallM, cx + Math.cos(a0) * (r + 0.12), spring + Math.sin(a0) * (r + 0.12), zf - 0.06, cx + Math.cos(a1) * (r + 0.12), spring + Math.sin(a1) * (r + 0.12), zf - 0.06, 0.26, 0.12, cc('#e6dfcc')); } // archivolt
    B(wallM, cx - 0.2, cx + 0.2, spring + r - 0.1, spring + r + 0.45, zf - 0.14, zf, '#e3dccb');
    for (const px of [xa + 0.4, cx - r - 0.55, cx + r + 0.55, xb - 0.4]) { B(wallM, px - 0.3, px + 0.3, FL, ht - 0.8, zf - 0.16, zf, '#f7f4ec'); B(wallM, px - 0.4, px + 0.4, ht - 1.05, ht - 0.8, zf - 0.26, zf, '#ebe5d4'); }
    B(wallM, xa - 0.3, xb + 0.3, ht - 0.8, ht, zf - 0.42, ZF, '#efe9da'); B(wallM, xa, xb, ht, ht + 0.5, zf, ZF, '#f2eee3');
    for (const px of [xa + 0.4, xb - 0.4]) { B(wallM, px - 0.32, px + 0.32, ht + 0.5, ht + 0.9, zf + 0.1, zf + 0.74, '#ede7d8'); wallM.cylinder(px, ht + 0.9, zf + 0.42, 0.12, 0.3, 0.3, 12, { col: cc('#e9e2d1') }); wallM.cylinder(px, ht + 1.2, zf + 0.42, 0.3, 0.2, 0.32, 12, { col: cc('#e9e2d1') }); wallM.cylinder(px, ht + 1.52, zf + 0.42, 0.1, 0.02, 0.22, 8, { col: cc('#e9e2d1') }); } // urn finials
    signQuad(SC, cx, FL + 5.0, zf - 0.02, 3.4, 1.7, '-z', T.intercity);
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
  for (let i = 0; i < F.benches.length; i += 3) { const a = F.benches[i], c = F.benches[i + 2]; const x0 = Math.min(a.x, c.x) - 0.5, x1 = Math.max(a.x, c.x) + 0.5, zc = a.z, s = a.yaw ? 1 : -1; // s: side of the backrest
    for (let k = 0; k < 3; k++) B(paint, x0, x1, FL + 0.42, FL + 0.45, zc - 0.22 + k * 0.15, zc - 0.12 + k * 0.15, BENCH); for (let k = 0; k < 3; k++) B(paint, x0, x1, FL + 0.55 + k * 0.13, FL + 0.64 + k * 0.13, zc + s * 0.27, zc + s * 0.3, BENCH);
    for (const ex of [x0 + 0.1, (x0 + x1) / 2, x1 - 0.1]) { B(metal, ex - 0.03, ex + 0.03, FL, FL + 0.42, zc - 0.22, zc - 0.18, IRON); B(metal, ex - 0.03, ex + 0.03, FL, FL + 0.95, zc + s * 0.26, zc + s * 0.31, IRON); B(metal, ex - 0.03, ex + 0.03, FL + 0.38, FL + 0.42, zc - 0.25, zc + 0.3, IRON); }
    coll(x0, x1, zc - 0.25, zc + 0.31, FL + 0.48); }
  // kiosks: food & drinks (glass display, shelves of packets), books & newspapers
  const kiosk = (x0, x1, z0, z1, sign) => { B(paint, x0, x1, FL, FL + 1.0, z0, z1, '#7a2a1c'); B(glass, x0 + 0.05, x1 - 0.05, FL + 1.0, FL + 1.45, z0 - 0.01, z0 + 0.5, '#9fb8c0'); B(paint, x0, x1, FL + 2.5, FL + 2.62, z0 - 0.3, z1, '#f2f0e8');
    for (const xx of [x0, x1]) B(metal, xx - 0.03, xx + 0.03, FL + 1.0, FL + 2.5, z0, z0 + 0.06, STEEL); for (let r = 0; r < 3; r++) { B(paint, x0 + 0.1, x1 - 0.1, FL + 1.25 + r * 0.38, FL + 1.28 + r * 0.38, z1 - 0.45, z1 - 0.05, '#c8b89a'); for (let k = 0; k < 9; k++) B(paint, x0 + 0.15 + k * (x1 - x0 - 0.3) / 9, x0 + 0.15 + (k + 0.7) * (x1 - x0 - 0.3) / 9, FL + 1.28 + r * 0.38, FL + 1.5 + r * 0.38, z1 - 0.35, z1 - 0.12, ['#e0b030', '#c02020', '#2060b0', '#20a050', '#f0f0e0'][(k + r) % 5]); }
    signQuad(SD, (x0 + x1) / 2, FL + 2.85, z0 - 0.32, Math.min(2.4, x1 - x0 + 0.3), 0.6, '-z', T.sign(sign)); coll(x0, x1, z0, z1, FL + 2.6); };
  kiosk(-14.5, -11.2, -636.2, -632.2, 0); kiosk(-14.5, -11.2, -648.6, -645.6, 1);
  // ceiling fans + tube lights, hanging LCD screens, the hall clock, the red LED clock on the counter wall, wayfinding
  for (const x of [-52, -35, -18]) for (const z of [-645, -636]) { metal.cylinder(x, F.hall.ceil - 0.6, z, 0.015, 0.015, 0.6, 6, { col: cc('#ddd') }); paint.cylinder(x, F.hall.ceil - 0.72, z, 0.13, 0.13, 0.14, 10, { col: cc('#e8e8e0') }); for (let k = 0; k < 3; k++) { const a = k * 2.094 + x; ebox(paint, x + Math.cos(a) * 0.45, F.hall.ceil - 0.68, z + Math.sin(a) * 0.45, 0.72, 0.012, 0.13, 0, -a, 0, cc('#e9e7df')); } }
  for (let x = -57; x < -12; x += 5) for (const z of [-648, -641, -633]) { B(emis, x - 0.6, x + 0.6, F.hall.ceil - 0.05, F.hall.ceil - 0.01, z - 0.03, z + 0.03, [1, 0.98, 0.92]); if ((x + z) % 2 === 0) lightPool(x, z, FL + 0.012, 4); }
  for (const [x, z, f, k] of [[-35, -636.8, '-z', 0], [-35, -637.0, '+z', 1], [-40, -645.5, '+x', 0]]) { const n = FACE_N[f]; B(paint, x - (n[0] ? 0.05 : 1.15), x + (n[0] ? 0.05 : 1.15), FL + 3.55, FL + 4.25, z - (n[2] ? 0.05 : 1.15), z + (n[2] ? 0.05 : 1.15), '#111'); signQuad(SD, x + n[0] * 0.052, FL + 3.9, z + n[2] * 0.052, 2.2, 0.55, f, T.lcd(k)); for (const e of [-0.9, 0.9]) metal.cylinder(x + (n[0] ? 0 : e), FL + 4.25, z + (n[2] ? 0 : e), 0.012, 0.012, F.hall.ceil - FL - 4.25, 4, { col: cc('#888') }); }
  paint.box(-10.21, FL + 4.2, -637, 0.02, 0.95, 0.95, { col: cc('#2a2a2a') }); clocks.push({ x: -10.23, y: FL + 4.2, z: -637, face: '-x', r: 0.42 });
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
    paint.box(7.79, FL + 2.8, -640.2, 0.02, 0.62, 0.62, { col: cc('#2a2a2a') }); clocks.push({ x: 7.77, y: FL + 2.8, z: -640.2, face: '-x', r: 0.28 });
    for (const z of [-645, -636]) { metal.cylinder(-1, FL + 3.8, z, 0.015, 0.015, 0.4, 6, { col: cc('#ddd') }); paint.cylinder(-1, FL + 3.7, z, 0.12, 0.12, 0.12, 10, { col: cc('#e8e8e0') }); for (let k = 0; k < 3; k++) { const a = k * 2.094 + z; ebox(paint, -1 + Math.cos(a) * 0.42, FL + 3.74, z + Math.sin(a) * 0.42, 0.66, 0.012, 0.12, 0, -a, 0, cc('#e9e7df')); } }
    for (const z of [-647, -640, -633]) B(emis, -5.6, -4.4, FL + 4.12, FL + 4.16, z - 0.03, z + 0.03, [1, 0.98, 0.92]);
    for (let k = 0; k < 6; k++) rod(metal, -5.8 + k * 0.7, FL + 1.2, ZB - 0.45, -5.8 + k * 0.7, FL + 2.6, ZB - 0.45, 0.012, cc('#2a2a2a')); B(wglass, -6, -2, FL + 1.2, FL + 2.6, ZB - 0.21, ZB - 0.19, '#000');
    for (const z of [-646.5, -642.5]) { B(paint, -8.6, -5.4, FL + 0.42, FL + 0.46, z - 0.22, z + 0.22, BENCH); B(paint, -8.6, -5.4, FL + 0.55, FL + 0.9, z + 0.24, z + 0.28, BENCH); B(metal, -8.6, -5.4, FL, FL + 0.42, z - 0.05, z + 0.05, IRON); coll(-8.6, -5.4, z - 0.25, z + 0.3, FL + 0.48); }
  }
  { const A = F.ann; // the announcer's room: desk under the window onto platform 1, gooseneck mic, PA console, phone, timetable, clock, fan
    B(paint, 9.0, 13.6, FL + 0.72, FL + 0.77, ZB - 1.2, ZB - 0.42, '#6d5a44'); B(paint, 9.05, 9.15, FL, FL + 0.72, ZB - 1.15, ZB - 0.45, '#5a4a38'); B(paint, 13.45, 13.55, FL, FL + 0.72, ZB - 1.15, ZB - 0.45, '#5a4a38'); coll(9.0, 13.6, ZB - 1.2, ZB - 0.42, FL + 0.8);
    B(paint, 11.6, 12.9, FL + 0.77, FL + 0.9, ZB - 1.0, ZB - 0.55, '#2b2d30'); for (let k = 0; k < 8; k++) B(emis, 11.7 + k * 0.15, 11.76 + k * 0.15, FL + 0.9, FL + 0.91, ZB - 0.9, ZB - 0.85, k % 3 ? [0.2, 0.9, 0.3] : [0.95, 0.3, 0.2]); for (let k = 0; k < 6; k++) metal.cylinder(11.75 + k * 0.2, FL + 0.9, ZB - 0.7, 0.025, 0.025, 0.03, 8, { col: cc('#ccc') });
    metal.cylinder(10.9, FL + 0.77, ZB - 0.75, 0.07, 0.08, 0.03, 10, { col: cc('#222') }); rod(metal, 10.9, FL + 0.8, ZB - 0.75, 10.95, FL + 1.12, ZB - 0.98, 0.008, cc('#333')); rod(metal, 10.95, FL + 1.12, ZB - 0.98, 11.0, FL + 1.2, ZB - 1.12, 0.008, cc('#333')); paint.cylinder(11.0, FL + 1.17, ZB - 1.14, 0.025, 0.03, 0.08, 8, { col: cc('#111') }); // gooseneck mic
    B(paint, 9.3, 9.6, FL + 0.77, FL + 0.85, ZB - 0.95, ZB - 0.7, '#1e1e1e'); B(paint, 10.1, 10.5, FL + 0.77, FL + 0.79, ZB - 1.05, ZB - 0.75, '#f4f2ea'); B(paint, 10.15, 10.55, FL + 0.79, FL + 0.8, ZB - 1.0, ZB - 0.72, '#f4f2ea');
    B(paint, 12.95, 13.45, FL + 0.77, FL + 1.12, ZB - 0.98, ZB - 0.6, '#1b1b1d'); B(emis, 12.97, 13.43, FL + 0.82, FL + 1.08, ZB - 1.0, ZB - 0.99, [0.3, 0.5, 0.75]);
    paint.cylinder(A.chair.x, FL, A.chair.z, 0.24, 0.24, 0.05, 10, { col: cc('#222') }); metal.cylinder(A.chair.x, FL + 0.05, A.chair.z, 0.025, 0.025, 0.37, 6, { col: cc('#555') }); B(paint, A.chair.x - 0.24, A.chair.x + 0.24, FL + 0.4, FL + 0.47, A.chair.z - 0.24, A.chair.z + 0.22, '#1f2a44'); B(paint, A.chair.x - 0.22, A.chair.x + 0.22, FL + 0.5, FL + 1.05, A.chair.z - 0.3, A.chair.z - 0.24, '#1f2a44');
    B(paint, 8.21, 8.23, FL + 1.2, FL + 2.2, -636.6, -634.6, '#f7f6ef'); for (let r = 0; r < 9; r++) B(paint, 8.23, 8.235, FL + 1.3 + r * 0.1, FL + 1.32 + r * 0.1, -636.5, -634.7, '#6d7a90');
    paint.box(8.21, FL + 2.45, -633, 0.02, 0.5, 0.5, { col: cc('#2a2a2a') }); clocks.push({ x: 8.23, y: FL + 2.45, z: -633, face: '+x', r: 0.22 });
    B(paint, 17.55, 17.78, FL + 1.6, FL + 2.0, -633, -632.6, '#2b2b2b'); B(emis, 12.4, 13.6, FL + 3.15, FL + 3.18, -634.5, -634.44, [1, 0.98, 0.92]);
    B(glass, A.win[0], A.win[1], FL + 1.0, FL + 2.3, ZB - 0.21, ZB - 0.19, '#9fb8c0'); for (const x of [A.win[0], (A.win[0] + A.win[1]) / 2, A.win[1]]) B(paint, x - 0.04, x + 0.04, FL + 1.0, FL + 2.3, ZB - 0.25, ZB - 0.15, '#e8e4d8');
    signQuad(SC, (A.win[0] + A.win[1]) / 2, FL + 2.85, ZB + 0.03, 1.8, 0.9, '+z', T.announce);
    B(paint, A.door.x - 0.55, A.door.x - 0.5, FL, FL + 2.2, ZB - 0.4, ZB, '#5a3a22'); B(paint, A.door.x + 0.5, A.door.x + 0.55, FL, FL + 2.2, ZB - 0.4, ZB, '#5a3a22');
    const dg = new THREE.BoxGeometry(0.04, 2.1, 1.0); paint.geometry(dg, new THREE.Matrix4().makeRotationY(-1.1).setPosition(A.door.x - 0.55 + Math.cos(1.1) * 0.5, FL + 1.05, ZB - 0.4 - Math.sin(1.1) * 0.5), cc('#6b4428')); dg.dispose(); // the door stands open, swung into the room
  }

  // ================================================================ 5. platforms, sidings, stabled trains
  const platform = (x0, x1, z0, z1, faces) => { // faces: list of z planes that front a track
    B(stone, x0, x1, Y - 0.05, FL - 0.06, z0, z1, '#9f9a90', { top: false }); up(stone, x0, x1, z0, z1, FL, TERRA); surf(x0, x1, z0, z1, FL);
    for (const zf of faces) { const s = Math.abs(zf - z0) < 0.01 ? 1 : -1; // s: +1 if the face is the z0 side
      B(paint, x0, x1, Y, FL - 0.06, s > 0 ? zf - 0.02 : zf, s > 0 ? zf : zf + 0.02, OCHRE, { top: false }); B(stone, x0, x1, FL - 0.06, FL + 0.005, s > 0 ? zf - 0.03 : zf - 0.32, s > 0 ? zf + 0.32 : zf + 0.03, COPING);
      const tz = zf + s * 0.85; B(paint, x0, x1, FL, FL + 0.008, tz - 0.3, tz + 0.3, TACT); }
    for (let x = x0 + 0.6; x < x1; x += 1.2) B(paint, x, x + 0.01, FL + 0.001, FL + 0.003, z0, z1, '#8e4d35');
  };
  const P1 = F.p1; platform(P1.x0, P1.x1, P1.z0, P1.z1, [P1.z1]);
  B(stone, P1.x0, X0, Y, FL - 0.06, P1.z0 - 0.02, P1.z0, '#9f9a90'); for (let x = P1.x0 + 0.2; x < X0; x += 1.8) metal.cylinder(x, FL, P1.z0 + 0.1, 0.03, 0.03, 1.1, 6, { col: cc(IRON) }); rod(metal, P1.x0, FL + 1.05, P1.z0 + 0.1, X0, FL + 1.05, P1.z0 + 0.1, 0.025, cc(IRON)); coll(P1.x0, X0, P1.z0, P1.z0 + 0.15, FL + 1.1);
  for (const I of F.islands) platform(I.x0, I.x1, I.z0, I.z1, [I.z0, I.z1]);
  const endSteps = (xe, dir, z0, z1) => { for (let k = 0; k < 5; k++) { const h = (FL - Y) * (1 - (k + 1) / 6), xa = xe + dir * 0.45 * k, xb = xa + dir * 0.45; B(stone, Math.min(xa, xb), Math.max(xa, xb), Y - 0.05, Y + h, z0 + 0.5, z1 - 0.5, '#9f9a90'); surf(Math.min(xa, xb), Math.max(xa, xb), z0 + 0.5, z1 - 0.5, Y + h, 'deck'); } };
  endSteps(P1.x0, -1, P1.z0 + 2, P1.z1 - 1); endSteps(P1.x1, 1, P1.z0 + 2, P1.z1 - 1); for (const I of F.islands) { endSteps(I.x0, -1, I.z0 + 1, I.z1 - 1); endSteps(I.x1, 1, I.z0 + 1, I.z1 - 1); }
  // sidings: ballast bed, concrete sleepers, rails, buffer stops at both ends
  const ball = mb.get('ballast');
  for (const S of F.sidings) { ball.box((S.x0 + S.x1) / 2, (Y + BALLAST_Y) / 2, S.z, S.x1 - S.x0, BALLAST_Y - Y + 0.02, 3.4, { col: [0.82, 0.8, 0.77], uvScale: 2 }); surf(S.x0, S.x1, S.z - 1.7, S.z + 1.7, BALLAST_Y, 'deck');
    for (let x = S.x0 + 0.3; x < S.x1 - 0.2; x += 0.65) B(stone, x - 0.12, x + 0.12, BALLAST_Y - 0.04, BALLAST_Y + 0.15, S.z - 1.3, S.z + 1.3, '#8f8b84', { bottom: false });
    for (const e of [-1, 1]) { B(metal, S.x0, S.x1, BALLAST_Y + 0.15, RAIL_TOP, S.z + e * GAUGE / 2 - 0.035, S.z + e * GAUGE / 2 + 0.035, '#6a625a', { bottom: false }); B(metal, S.x0, S.x1, RAIL_TOP - 0.02, RAIL_TOP, S.z + e * GAUGE / 2 - 0.036, S.z + e * GAUGE / 2 + 0.036, '#b8b4ae'); }
    for (const [xe, d] of [[S.x0 + 0.4, 1], [S.x1 - 0.4, -1]]) { B(paint, xe - 0.25, xe + 0.25, BALLAST_Y, 1.25, S.z - 1.3, S.z + 1.3, '#b81f1f'); for (let k = 0; k < 6; k++) B(paint, xe - 0.26, xe + 0.26, 1.0, 1.25, S.z - 1.3 + k * 0.52, S.z - 1.04 + k * 0.52, k % 2 ? '#f2f2ee' : '#b81f1f'); for (const e of [-1, 1]) { rod(metal, xe, 1.05, S.z + e * 0.87, xe + d * 0.45, 1.05, S.z + e * 0.87, 0.07, cc('#222')); rod(metal, xe + d * 0.45, 1.05, S.z + e * 0.87, xe + d * 0.5, 1.05, S.z + e * 0.87, 0.2, cc('#333')); } beam(metal, xe - d * 2.2, BALLAST_Y, S.z, xe, 1.1, S.z, 0.25, 0.25, cc('#7a1515')); coll(xe - 0.3, xe + 0.3, S.z - 1.35, S.z + 1.35, 1.3); }
  }
  // stabled maroon rake (siding A) and a parked blue S11-style set (siding B): merged into the landmarks mesh (static)
  const MAPN = { paint: 'paint', metal: 'metal', trainGlass: 'glass', trainCabGlass: 'winGlass', trainLamp: 'emissive' };
  const place = (sub, x, z, yaw) => { const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, RAIL_TOP, z); for (const [name, b] of sub.b) { const g = b.build(); if (!g) continue; mb.get(MAPN[name] || name).geometry(g, m, [1, 1, 1]); g.dispose(); } };
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
  for (let k = 1; k < S.frames; k += 2) { const x = S.x0 + 2 + k * S.dx + 1.0;
    for (const [z, nums] of [[-621.5, [0]], [-606, [1, 2]], [-594, [3, 4]]]) { const y = FL + 3.7; metal.cylinder(x, y + 0.4, z, 0.01, 0.01, arcY(z, z < S.zM ? S.zA : S.zM, z < S.zM ? S.zM : S.zB, S.rise - 1.0) - y - 0.4, 4, { col: cc('#555') });
      paint.box(x, y, z, 0.04, 0.82, 0.82, { col: cc('#fff') }); signQuad(SC, x + 0.025, y, z, 0.78, 0.78, '+x', T.num(nums[0])); signQuad(SC, x - 0.025, y, z, 0.78, 0.78, '-x', T.num(nums[nums.length - 1])); } }
  for (const [x, z, f, k] of [[-44, -623.5, '+x', 0], [-44, -623.5, '-x', 1], [8, -606.8, '+x', 0], [8, -606.8, '-x', 1]]) { const n = FACE_N[f]; B(paint, x - 0.06, x + 0.06, FL + 3.45, FL + 4.15, z - 1.15, z + 1.15, '#111'); signQuad(SD, x + n[0] * 0.065, FL + 3.8, z, 2.2, 0.55, f, T.lcd(k)); }
  paint.box(-27.5, FL + 4.6, ZB + 0.01, 1.1, 1.1, 0.02, { col: cc('#2a2a2a') }); clocks.push({ x: -27.5, y: FL + 4.6, z: ZB + 0.03, face: '+z', r: 0.5 });
  paint.box(-53, FL + 4.3, -606, 0.08, 0.9, 0.9, { col: cc('#2a2a2a') }); clocks.push({ x: -52.95, y: FL + 4.3, z: -606, face: '+x', r: 0.4 }, { x: -53.05, y: FL + 4.3, z: -606, face: '-x', r: 0.4 });
  const horn = new THREE.CylinderGeometry(0.2, 0.05, 0.36, 10, 1, true);
  for (const s of F.speakers) { const onCol = Math.abs(s.z - (S.zA + 0.4)) < 0.01 || Math.abs(s.z - S.zM) < 0.01; const y = onCol ? FL + 3.5 : s.z < ZF ? FL + 3.4 : FL + 5.4; const dir = s.z < ZF ? -1 : 1;
    for (const d of Math.abs(s.z - S.zM) < 0.01 ? [-1, 1] : [dir]) { const m = new THREE.Matrix4().makeRotationX(d * Math.PI / 2 * 0.9).setPosition(s.x, y, s.z + d * 0.35); metal.geometry(horn, m, cc('#bfc3c2')); metal.box(s.x, y, s.z + d * 0.15, 0.06, 0.06, 0.3, { col: cc('#888') }); } }
  horn.dispose();
  // areca palms in square planters against the building on platform 1 (the frontage has no forecourt for them in this city)
  for (const px of [-62.6, 20.5]) { planterPalm(mb, px, ZB + 0.9, FL, cc); coll(px - 0.75, px + 0.75, ZB + 0.15, ZB + 1.65, FL + 0.75); }
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
  const smats = { sA: mk(at.a), sB: mk(at.b), sC: mk(at.c), sD: mk(at.d, true) }; anim.signMats = smats;
  for (const k of clocks) signQuad(SC, k.x + FACE_N[k.face][0] * 0.004, k.y, k.z + FACE_N[k.face][2] * 0.004, k.r * 2, k.r * 2, k.face, T.dial); // clock dials (atlas C)
  for (const m of sb.toMeshes(smats, { cast: false, receive: true })) { m.name = 'fort-' + m.name; group.add(m); }
  // clock hands: one InstancedMesh, hour + minute per dial
  { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); const hands = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }), clocks.length * 2); hands.name = 'fort-clock-hands'; hands.castShadow = false; hands.frustumCulled = false; group.add(hands); anim.hands = hands; }
  // red LED clock (128 × 32 canvas, redrawn once a game minute)
  { const c = document.createElement('canvas'); c.width = 128; c.height = 32; const t = tex(c); const mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false }); anim.led = { c, x: c.getContext('2d'), t, last: -1 };
    for (const s of anim.ledSpots) { const n = FACE_N[s.face]; const box = new THREE.Mesh(new THREE.BoxGeometry(n[0] ? 0.08 : s.w + 0.1, s.h + 0.1, n[2] ? 0.08 : s.w + 0.1), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 })); box.position.set(s.x - n[0] * 0.04, s.y, s.z - n[2] * 0.04); group.add(box);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat); p.position.set(s.x + n[0] * 0.002, s.y, s.z + n[2] * 0.002); p.rotation.y = Math.atan2(n[0], n[2]); group.add(p); anim.ledMeshes.push(p); } }

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
  };
  anim.update(12, 0);
  return anim;
}

// ---------------------------------------------------------------- an areca palm in a square planter (forecourt)
function planterPalm(mb, x, z, y0, C) {
  const P = mb.get('kerb'), bark = mb.get('bark'), leaf = mb.get('palm');
  P.box(x, y0 + 0.35, z, 1.4, 0.7, 1.4, { col: C('#d8d2c4'), uvScale: 2 }); P.box(x, y0 + 0.72, z, 1.5, 0.06, 1.5, { col: C('#c8c1b0') }); mb.get('paint').box(x, y0 + 0.69, z, 1.3, 0.02, 1.3, { col: C('#3a2a1e') });
  const stems = [[0, 0, 3.4], [0.25, 0.18, 2.6], [-0.22, 0.2, 2.9], [0.1, -0.25, 2.2]];
  for (const [ox, oz, h] of stems) { bark.cylinder(x + ox, y0 + 0.7, z + oz, 0.07, 0.055, h, 7, { col: C('#7d8a5a') }); for (let r = 0.4; r < h; r += 0.35) bark.cylinder(x + ox, y0 + 0.7 + r, z + oz, 0.075, 0.075, 0.025, 7, { col: C('#5e6a44'), caps: false });
    const tx = x + ox, ty = y0 + 0.7 + h, tz = z + oz;
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + ox * 7, L = 1.5, droop = 0.55; const dx = Math.cos(a), dz = Math.sin(a), px = -dz * 0.32, pz = dx * 0.32;
      const mid = [tx + dx * L * 0.5, ty + 0.35, tz + dz * L * 0.5], end = [tx + dx * L, ty + 0.35 - droop, tz + dz * L];
      leaf.quad([tx - px * 0.3, ty, tz - pz * 0.3], [tx + px * 0.3, ty, tz + pz * 0.3], [mid[0] + px, mid[1], mid[2] + pz], [mid[0] - px, mid[1], mid[2] - pz], [0, 0, 1, 0.5], [0.9, 1, 0.85]);
      leaf.quad([mid[0] - px, mid[1], mid[2] - pz], [mid[0] + px, mid[1], mid[2] + pz], [end[0] + px * 0.4, end[1], end[2] + pz * 0.4], [end[0] - px * 0.4, end[1], end[2] - pz * 0.4], [0, 0.5, 1, 1], [0.9, 1, 0.85]); }
  }
}
