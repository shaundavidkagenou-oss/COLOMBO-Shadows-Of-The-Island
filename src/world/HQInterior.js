// Police Headquarters interior: two furnished floors joined by a staircase, built below the street like the other interiors.
// The room plan is INVENTED for the game (an artistic interpretation) — it is not the real building's layout.
// Room interface (shared with Interiors.js): { id, D, g, bounds, obstacles, spawn, y, door } plus multi-floor hooks used by
// Player.js: floorAt(x, z, y), obsFor(y), ceilAt(y), clampCam(from, to) and update(dt, player).
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { Character } from '../actors/Character.js';
import { makeAppearance, makePoliceAppearance } from '../actors/Appearance.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const HQ_DEF = { name: 'Police Headquarters', note: 'Interior is an artistic interpretation for the game, not the real building layout.' };
const Y = -40, H = 3.6, W = 34, D = 18;
// stairs: straight flight on the east side, rising towards the back of the building (local u/v metres)
const ST = { u0: 10.5, u1: 13, v0: 10, v1: 16.5 };

function canvasMat(w, h, draw, basic = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return basic ? new THREE.MeshBasicMaterial({ map: t, toneMapped: false }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
}
function plateMat(text, sub = '') {
  return canvasMat(512, 128, (g, w, h) => { g.fillStyle = '#1d3a7a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d9b13b'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${sub ? 54 : 62}px "Barlow Condensed", sans-serif`; g.fillText(text, w / 2, sub ? 50 : h / 2, w - 30);
    if (sub) { g.font = '600 32px "Barlow Condensed", sans-serif'; g.fillStyle = '#f1d27a'; g.fillText(sub, w / 2, 98, w - 30); } }, false);
}

export function buildHQInterior(game, door) {
  const cx = door.x, z1 = door.z - 200, z0 = z1 - D, x0 = cx - W / 2, x1 = cx + W / 2;
  const X = (u) => cx + u, Z = (v) => z1 - v; const FY = (f) => Y + f * H;
  const mb = new MultiBuilder(); const paint = mb.get('paint'), conc = mb.get('concrete'), glass = mb.get('glass'), emis = mb.get('emissive'), metal = mb.get('metal');
  const g = new THREE.Group(); g.name = 'hq-interior';
  const obs = [[], []]; const bx = (b, u, y, v, su, sy, sv, col) => b.box(X(u), y, Z(v), su, sy, sv, { col: C(col) });
  const ob = (f, u0, u1, v0, v1, top) => obs[f].push({ x0: X(Math.min(u0, u1)), x1: X(Math.max(u0, u1)), z0: Z(Math.max(v0, v1)), z1: Z(Math.min(v0, v1)), top: top ?? FY(f) + H }); // top: the camera may pass over low furniture
  const block = (f, u, y, v, su, sy, sv, col, b = paint) => { bx(b, u, FY(f) + y, v, su, sy, sv, col); ob(f, u - su / 2, u + su / 2, v - sv / 2, v + sv / 2, FY(f) + Math.max(y + sy / 2, 1.0)); };
  const WALL = '#efe9dc', DADO = '#9aa3ad', TH = 0.16;
  // walls along u (constant v) and along v (constant u) with door gaps; lintels above gaps; a grey dado band on both faces
  const wallU = (f, v, u0, u1, gaps = [], col = WALL) => { const segs = []; let a = u0; for (const [ga, gb] of gaps.slice().sort((p, q) => p[0] - q[0])) { segs.push([a, ga]); a = gb; } segs.push([a, u1]);
    for (const [a1, b1] of segs) if (b1 - a1 > 0.02) { bx(paint, (a1 + b1) / 2, FY(f) + H / 2, v, b1 - a1, H, TH, col); bx(paint, (a1 + b1) / 2, FY(f) + 0.5, v, b1 - a1, 1.0, TH + 0.03, DADO); ob(f, a1, b1, v - TH / 2, v + TH / 2); }
    for (const [ga, gb] of gaps) { bx(paint, (ga + gb) / 2, FY(f) + (H + 2.25) / 2, v, gb - ga, H - 2.25, TH, col); bx(paint, (ga + gb) / 2, FY(f) + 2.22, v, gb - ga + 0.12, 0.08, TH + 0.04, '#6b4a2a'); } };
  const wallV = (f, u, v0, v1, gaps = [], col = WALL) => { const segs = []; let a = v0; for (const [ga, gb] of gaps.slice().sort((p, q) => p[0] - q[0])) { segs.push([a, ga]); a = gb; } segs.push([a, v1]);
    for (const [a1, b1] of segs) if (b1 - a1 > 0.02) { bx(paint, u, FY(f) + H / 2, (a1 + b1) / 2, TH, H, b1 - a1, col); bx(paint, u, FY(f) + 0.5, (a1 + b1) / 2, TH + 0.03, 1.0, b1 - a1, DADO); ob(f, u - TH / 2, u + TH / 2, a1, b1); }
    for (const [ga, gb] of gaps) { bx(paint, u, FY(f) + (H + 2.25) / 2, (ga + gb) / 2, TH, H - 2.25, gb - ga, col); bx(paint, u, FY(f) + 2.22, (ga + gb) / 2, TH + 0.04, 0.08, gb - ga + 0.12, '#6b4a2a'); } };
  // door leaf standing open against the wall, and a name plate above the door on the corridor side
  const plates = [];
  const plate = (f, text, u, v, facePlusV, sub = '') => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), plateMat(text, sub)); m.position.set(X(u), FY(f) + 2.62, Z(v + (facePlusV ? 0.1 : -0.1))); m.rotation.y = facePlusV ? Math.PI : 0; g.add(m); plates.push(text); };
  const leaf = (f, u, v, alongU = true) => bx(paint, u + (alongU ? 0 : 0), FY(f) + 1.1, v, alongU ? 0.95 : 0.05, 2.15, alongU ? 0.05 : 0.95, '#7a5434');

  // ---------------------------------------------------------------- floors, slab with stairwell, ceilings
  const TILE = '#d6d1c7', TILE2 = '#c9c3b6';
  conc.hrect(x0, z0, x1, z1, Y, 1.0, C(TILE)); conc.hrect(X(-6), Z(7), X(6), Z(0), Y + 0.005, 1.0, C('#cfc7b8')); // lobby inlay
  for (let u = -16.5; u <= 16.5; u += 1.5) bx(paint, u, Y + 0.004, 8.25, 0.03, 0.004, 2.5, TILE2); // corridor tile joints
  const slab = [[-W / 2, ST.u0, 0, D], [ST.u1, W / 2, 0, D], [ST.u0, ST.u1, 0, ST.v0 - 0.0], [ST.u0, ST.u1, ST.v1, D]];
  for (const [ua, ub, va, vb] of slab) { conc.hrect(X(ua), Z(vb), X(ub), Z(va), FY(1), 1.0, C(TILE)); paint.hrect(X(ua), Z(vb), X(ub), Z(va), FY(1) - 0.02, 1, C('#f4f1ea'), true); }
  paint.hrect(x0, z0, x1, z1, FY(2), 1, C('#f4f1ea'), true);
  for (let f = 0; f < 2; f++) for (let u = -14; u <= 14; u += 4) for (const v of [3.5, 8.25, 13.75]) { if (f === 0 && u >= 10 && v > 9 && v < 17) continue; const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.position.set(X(u), FY(f + 1) - 0.04, Z(v)); g.add(m); } // tube lights

  // ---------------------------------------------------------------- outer walls with windows (both floors)
  for (let f = 0; f < 2; f++) {
    wallU(f, 0, -W / 2, W / 2, f === 0 ? [[-0.95, 0.95]] : []); wallU(f, D, -W / 2, W / 2); wallV(f, -W / 2, 0, D); wallV(f, W / 2, 0, D);
    for (let u = -15; u <= 15; u += 3.4) { if (f === 0 && Math.abs(u) < 2) continue; for (const v of [0.09, D - 0.09]) { if (f === 0 && v > 1 && u < -3.5) continue; // no windows behind the dispatch screen wall
 bx(emis, u, FY(f) + 1.75, v, 1.6, 1.3, 0.02, '#b9d2e6'); bx(paint, u, FY(f) + 1.08, v, 1.75, 0.06, 0.08, '#e8e2d6'); for (const k of [-0.27, 0.27]) bx(paint, u + k, FY(f) + 1.75, v, 0.04, 1.3, 0.035, '#f4f1ea'); } }
    for (const v of [2.5, 5.5, 12.5, 15.5]) for (const u of [-W / 2 + 0.09, W / 2 - 0.09]) bx(emis, u, FY(f) + 1.75, v, 0.02, 1.3, 1.6, '#b9d2e6');
  }
  bx(glass, -0.48, Y + 1.15, 0, 0.9, 2.2, 0.05, '#ffffff'); bx(glass, 0.48, Y + 1.15, -0.25, 0.9, 2.2, 0.05, '#ffffff'); // glass entrance doors (one standing open)

  // ---------------------------------------------------------------- GROUND FLOOR
  // corridor walls: front rooms behind v = 7, back rooms behind v = 9.5
  wallU(0, 7, -W / 2, W / 2, [[-10.5, -9.5], [-1.5, 1.5], [7.8, 8.8], [13.6, 14.6]]); wallU(0, 9.5, -W / 2, ST.u0 - 0.1, [[-8.2, -7.2], [3, 4]]);
  wallV(0, -6, 0, 7); wallV(0, 6, 0, 7); wallV(0, 11, 0, 7); wallV(0, -3, 9.5, D); wallV(0, ST.u0 - 0.1, 9.5, D);
  plate(0, 'RECORDS', -10, 7, true); plate(0, 'DUTY OFFICER', 8.3, 7, true); plate(0, 'STORE', 14.1, 7, true); plate(0, 'OPERATIONS / DISPATCH', -7.7, 9.5, false); plate(0, "OFFICERS' MESS", 3.5, 9.5, false);
  leaf(0, -9.0 + 0.5, 7.5, false); leaf(0, 9.3, 7.5, false); leaf(0, 15.1, 7.5, false); leaf(0, -6.7, 9.0, false); leaf(0, 4.5, 9.0, false);
  // lobby: reception counter, waiting chairs, notice board, sign
  block(0, 3.4, 0.55, 4.8, 4.4, 1.1, 0.7, '#6b4a2a'); bx(paint, 3.4, Y + 1.12, 4.7, 4.6, 0.05, 0.9, '#d8cbb0'); bx(paint, 1.2, Y + 0.55, 6.0, 0.7, 1.1, 2.1, '#6b4a2a'); ob(0, 0.85, 1.55, 4.9, 7);
  bx(paint, 2.3, Y + 1.36, 5.0, 0.45, 0.32, 0.05, '#1a1a1a'); bx(emis, 2.3, Y + 1.36, 4.97, 0.4, 0.26, 0.01, '#6fa8dc'); bx(paint, 2.3, Y + 1.16, 5.1, 0.08, 0.1, 0.08, '#1a1a1a'); // PC on the counter
  bx(paint, 4.6, Y + 1.16, 4.8, 0.36, 0.04, 0.26, '#f4f4f0'); bx(paint, 4.6, Y + 1.19, 4.8, 0.3, 0.02, 0.2, '#222'); // register/book
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), plateMat('RECEPTION', 'Complaints · Enquiries · Lost property')); m.position.set(X(3.4), Y + 2.7, Z(6.9)); m.rotation.y = 0; g.add(m); }
  const chair = (f, u, v, yaw, col = '#2c4a7a') => { const c = Math.cos(yaw), s = Math.sin(yaw); bx(paint, u, FY(f) + 0.44, v, 0.46, 0.06, 0.46, col); bx(paint, u - s * 0.21, FY(f) + 0.72, v + c * 0.21, 0.46 * Math.abs(c) + 0.06 * Math.abs(s), 0.5, 0.46 * Math.abs(s) + 0.06 * Math.abs(c), col);
    for (const [a, b] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) bx(metal, u + a, FY(f) + 0.21, v + b, 0.035, 0.42, 0.035, '#555a60'); ob(f, u - 0.26, u + 0.26, v - 0.26, v + 0.26, FY(f) + 1.0); };
  // chair facing: yaw 0 = towards the entrance side (−v), π = deeper (+v), +π/2 = +u. Back-rest sits opposite the facing.
  const chairF = (f, u, v, face) => chair(f, u, v, face === 'u+' ? Math.PI / 2 : face === 'u-' ? -Math.PI / 2 : face === 'v+' ? Math.PI : 0);
  for (const v of [2.0, 3.6]) for (const u of [-5.2, -4.6, -4.0, -3.4]) chairF(0, u, v, 'u+');
  chairF(0, 2.2, 5.85, 'v-');
  { bx(paint, -3.8, Y + 1.7, 0.12, 2.6, 1.3, 0.04, '#b08a5a'); const notes = ['#f4f4f0', '#f1d27a', '#cfe0f0', '#f4c6c6', '#f4f4f0', '#d8f0d0']; for (let k = 0; k < 9; k++) bx(paint, -4.8 + (k % 3) * 0.95 + (k * 0.07) % 0.2, Y + 1.25 + Math.floor(k / 3) * 0.4, 0.15, 0.55, 0.32, 0.01, notes[k % notes.length]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.36), plateMat('POLICE EMERGENCY 119')); m.position.set(X(-1.9), Y + 1.75, Z(0.15)); m.rotation.y = Math.PI; g.add(m); }
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), plateMat('PUBLIC WAITING AREA')); m.position.set(X(-5.9), Y + 2.6, Z(2.8)); m.rotation.y = Math.PI / 2; g.add(m); }
  bx(paint, -5.6, Y + 0.45, 5.9, 0.5, 0.9, 0.5, '#2a6db0'); bx(paint, -5.6, Y + 1.05, 5.9, 0.3, 0.4, 0.3, '#cfe6f5'); ob(0, -5.85, -5.35, 5.65, 6.15); // water dispenser
  for (const [u, v] of [[-5.5, 0.6], [5.5, 0.6]]) { paint.cylinder(X(u), Y, Z(v), 0.25, 0.2, 0.5, 10, { col: C('#8a5a3a') }); mb.get('leaves').box(X(u), Y + 0.85, Z(v), 0.6, 0.7, 0.6, { col: C('#3f7a34') }); ob(0, u - 0.3, u + 0.3, v - 0.3, v + 0.3); }
  // records: filing cabinets + two clerk desks with PCs
  for (let v = 0.6; v < 6.6; v += 0.62) block(0, -16.6, 0.66, v, 0.6, 1.32, 0.56, '#7d8790');
  for (let u = -15.6; u < -7; u += 0.62) block(0, u, 0.66, 0.42, 0.56, 1.32, 0.5, '#7d8790');
  const desk = (f, u, v, w = 1.4, d = 0.7, pc = true) => { block(f, u, 0.74, v, w, 0.05, d, '#8a6a48'); for (const [a, b] of [[-w / 2 + 0.06, -d / 2 + 0.06], [w / 2 - 0.06, -d / 2 + 0.06], [-w / 2 + 0.06, d / 2 - 0.06], [w / 2 - 0.06, d / 2 - 0.06]]) bx(metal, u + a, FY(f) + 0.37, v + b, 0.05, 0.74, 0.05, '#4a4f55');
    if (pc) { bx(paint, u, FY(f) + 0.98, v + 0.12, 0.5, 0.32, 0.04, '#1a1a1a'); bx(emis, u, FY(f) + 0.98, v + 0.095, 0.44, 0.26, 0.01, '#7fb3e0'); bx(paint, u, FY(f) + 0.79, v - 0.12, 0.42, 0.02, 0.14, '#2a2a2a'); bx(paint, u + 0.45, FY(f) + 0.8, v - 0.05, 0.22, 0.06, 0.3, '#f4f4f0'); } };
  desk(0, -13.5, 3.6); desk(0, -10.2, 3.6); chairF(0, -13.5, 2.8, 'v+'); chairF(0, -10.2, 2.8, 'v+'); desk(0, -11.8, 5.9, 2.6, 0.8, false);
  for (let k = 0; k < 6; k++) bx(paint, -12.8 + k * 0.4, Y + 0.84, 5.9, 0.3, 0.14, 0.4, ['#c9a227', '#8a2a1a', '#2c4a7a', '#f4f4f0'][k % 4]); // file stacks
  // duty officer: desk, chair, cabinet, wall board
  desk(0, 8.5, 3.4); chairF(0, 8.5, 2.6, 'v+'); chairF(0, 8.0, 4.6, 'v-'); chairF(0, 9.0, 4.6, 'v-'); block(0, 10.5, 0.66, 0.6, 0.56, 1.32, 0.5, '#7d8790');
  bx(paint, 8.5, Y + 1.8, 0.12, 2.2, 1.1, 0.03, '#f4f4f0'); for (let k = 0; k < 5; k++) bx(paint, 8.5, Y + 2.2 - k * 0.18, 0.14, 1.8, 0.03, 0.01, '#1d3a7a');
  // store: steel shelving with boxes, cones, barrier stands
  for (const u of [12.0, 14.0, 16.4]) { block(0, u, 1.1, 3.3, 0.55, 2.2, 5.0, '#5a6068', metal); for (let lv = 0; lv < 4; lv++) for (let vv = 1.2; vv < 5.6; vv += 0.55) bx(paint, u, Y + 0.35 + lv * 0.52, vv, 0.45, 0.32, 0.42, ['#b0905a', '#a0804a', '#c0a06a', '#2c4a7a'][(lv + Math.round(vv * 3)) % 4]); }
  for (let k = 0; k < 4; k++) { paint.cylinder(X(15.2), Y + k * 0.1, Z(6.3), 0.18, 0.04, 0.6, 10, { col: C(k % 2 ? '#ffffff' : '#e8601c') }); } ob(0, 14.9, 15.5, 6.0, 6.6);
  // dispatch: console desks facing a screen wall, radio rack
  { const scr = canvasMat(1024, 256, (c2, w, h) => { c2.fillStyle = '#0b1622'; c2.fillRect(0, 0, w, h); c2.strokeStyle = '#2f5a7a'; c2.lineWidth = 3; for (let i = 0; i < 12; i++) { c2.beginPath(); c2.moveTo(40 + i * 60, 20); c2.lineTo(30 + i * 62, 236); c2.stroke(); } for (let j = 0; j < 5; j++) { c2.beginPath(); c2.moveTo(20, 40 + j * 45); c2.lineTo(760, 30 + j * 47); c2.stroke(); }
      c2.fillStyle = '#4fa3e0'; c2.fillRect(20, 150, 740, 10); const units = [[160, 90, 'B-12'], [330, 140, 'M-4'], [520, 70, 'T-7'], [640, 190, 'B-3'], [250, 210, 'M-9']]; c2.font = '700 22px "Barlow Condensed", sans-serif';
      for (const [ux, uy, n] of units) { c2.fillStyle = '#ffd34d'; c2.beginPath(); c2.arc(ux, uy, 7, 0, 7); c2.fill(); c2.fillText(n, ux + 10, uy - 8); }
      c2.fillStyle = '#e8eef4'; c2.font = '700 30px "Barlow Condensed", sans-serif'; c2.fillText('COLOMBO CITY — UNIT STATUS', 790, 40); c2.font = '600 24px "Barlow Condensed", sans-serif';
      ['B-12  Fort         ON PATROL', 'M-4   Pettah       ON PATROL', 'T-7   Union Pl.    TRAFFIC', 'B-3   Kollupitiya  AVAILABLE', 'M-9   Borella      ON PATROL'].forEach((t, i) => { c2.fillStyle = i === 3 ? '#7be08a' : '#cfe0f0'; c2.fillText(t, 790, 84 + i * 32, 230); }); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), scr); m.position.set(X(-10), Y + 1.95, Z(D - 0.12)); g.add(m); }
  for (const u of [-14.6, -12, -9.4, -6.8]) { block(0, u, 0.38, 16.3, 2.2, 0.76, 0.8, '#3a4550'); bx(paint, u - 0.5, Y + 1.0, 16.45, 0.5, 0.32, 0.04, '#111'); bx(emis, u - 0.5, Y + 1.0, 16.42, 0.44, 0.26, 0.01, '#79c2a0'); bx(paint, u + 0.5, Y + 1.0, 16.45, 0.5, 0.32, 0.04, '#111'); bx(emis, u + 0.5, Y + 1.0, 16.42, 0.44, 0.26, 0.01, '#7fb3e0'); bx(paint, u, Y + 0.8, 16.0, 0.3, 0.06, 0.16, '#222'); }
  chairF(0, -13.3, 15.4, 'v+'); chairF(0, -8.1, 15.4, 'v+'); block(0, -16.5, 0.9, 11.5, 0.6, 1.8, 1.6, '#2a2d33', metal); for (let k = 0; k < 6; k++) bx(emis, -16.18, Y + 0.5 + k * 0.22, 11.5, 0.01, 0.04, 0.08, k % 2 ? '#3ad16b' : '#ffb020');
  // officers' mess: two tables, tea urn, cupboard
  for (const u of [0.5, 5.5]) { block(0, u, 0.74, 13.2, 1.6, 0.05, 0.9, '#d8cbb0'); bx(metal, u, Y + 0.37, 13.2, 0.1, 0.74, 0.1, '#4a4f55'); chairF(0, u - 1.1, 13.2, 'u+'); chairF(0, u + 1.1, 13.2, 'u-'); }
  block(0, 2, 0.45, 17.4, 4.0, 0.9, 0.6, '#8a6a48'); paint.cylinder(X(1.2), Y + 0.9, Z(17.4), 0.2, 0.2, 0.45, 12, { col: C('#b8bcc0') }); for (let k = 0; k < 6; k++) paint.cylinder(X(2.2 + k * 0.18), Y + 0.9, Z(17.3), 0.04, 0.035, 0.09, 8, { col: C('#f4f4f0') });
  // stairs: solid flight of 18 steps, handrail on the open (east) side, wall on the west side, under-landing store blocked
  { const n = 18, run = (ST.v1 - ST.v0) / n, rise = H / n; for (let k = 0; k < n; k++) { const top = Y + (k + 1) * rise; bx(conc, (ST.u0 + ST.u1) / 2, (Y + top) / 2, ST.v0 + (k + 0.5) * run, ST.u1 - ST.u0, top - Y, run, k % 2 ? '#bdb6aa' : '#c6bfb2'); }
    for (let k = 0; k <= n; k += 3) { const v = ST.v0 + k * run; bx(metal, ST.u1 + 0.05, Y + k * rise + 0.5, v, 0.04, 1.0, 0.04, '#3a3f46'); }
    for (let k = 0; k < n; k++) { const va = ST.v0 + k * run; bx(metal, ST.u1 + 0.05, Y + (k + 0.5) * rise + 0.98, va + run / 2, 0.06, 0.06, run + 0.02, '#6b4a2a'); }
    ob(0, ST.u1, ST.u1 + 0.12, ST.v0 + 0.4, ST.v1); ob(0, ST.u0 - 0.2, ST.u1 + 0.12, ST.v1, D); bx(paint, (ST.u0 + ST.u1) / 2, Y + 1.1, ST.v1 + 0.05, ST.u1 - ST.u0, 2.2, 0.06, '#7a5434');
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), plateMat('STAIRS · FIRST FLOOR')); m.position.set(X(15.5), Y + 2.6, Z(9.62)); g.add(m); }

  // ---------------------------------------------------------------- FIRST FLOOR
  wallU(1, 7, -W / 2, W / 2, [[-6.2, -5.2], [3.0, 4.0], [12.0, 13.0]]); wallU(1, 9.5, -W / 2, ST.u0 - 0.6, [[-8.2, -7.2], [3, 4]]);
  wallV(1, -3, 0, 7); wallV(1, 9, 0, 7); wallV(1, -3, 9.5, D); wallV(1, ST.u0 - 0.6, 9.5, D);
  plate(1, 'BRIEFING ROOM', -5.7, 7, true); plate(1, 'INVESTIGATIONS', 3.5, 7, true); plate(1, 'OFFICER IN CHARGE', 12.5, 7, true); plate(1, 'CSRU READY ROOM', -7.7, 9.5, false, 'Colombo Special Response Unit'); plate(1, 'MEETING ROOM', 3.5, 9.5, false);
  leaf(1, -4.7, 7.5, false); leaf(1, 4.5, 7.5, false); leaf(1, 13.5, 7.5, false); leaf(1, -6.7, 9.0, false); leaf(1, 4.5, 9.0, false);
  // stairwell railing (open towards the landing at the top of the flight)
  { const f = 1, ry = FY(1); const rail = (u0, u1, v0, v1) => { bx(metal, (u0 + u1) / 2, ry + 1.0, (v0 + v1) / 2, Math.max(0.06, u1 - u0), 0.06, Math.max(0.06, v1 - v0), '#6b4a2a'); const L2 = Math.max(u1 - u0, v1 - v0); for (let t = 0; t <= L2; t += 0.6) bx(metal, u0 + (u1 > u0 + 0.1 ? t : 0), ry + 0.5, v0 + (v1 > v0 + 0.1 ? t : 0), 0.04, 1.0, 0.04, '#3a3f46'); ob(f, u0 - 0.08, u1 + 0.08, v0 - 0.08, v1 + 0.08); };
    rail(ST.u0 - 0.06, ST.u0 - 0.06, ST.v0, ST.v1); rail(ST.u1 + 0.06, ST.u1 + 0.06, ST.v0, ST.v1); rail(ST.u0 - 0.06, ST.u1 + 0.06, ST.v0 - 0.06, ST.v0 - 0.06); }
  // briefing room: screen, lectern, rows of chairs
  { const scr = canvasMat(1024, 512, (c2, w, h) => { c2.fillStyle = '#10223e'; c2.fillRect(0, 0, w, h); c2.fillStyle = '#d9b13b'; c2.fillRect(0, 0, w, 70); c2.fillStyle = '#10223e'; c2.font = '700 46px "Barlow Condensed", sans-serif'; c2.fillText('MORNING BRIEFING', 30, 50);
      c2.fillStyle = '#e8eef4'; c2.font = '600 36px "Barlow Condensed", sans-serif'; ['• Traffic plan: Union Place / Galle Road junctions', '• Motorcycle patrol sectors: Fort, Pettah, Slave Island', '• Monsoon advisory: watch blocked drains, flooding', '• Tourist season: assist visitors at Galle Face', '• Report all incidents to Operations / Dispatch'].forEach((t, i) => c2.fillText(t, 40, 140 + i * 70, w - 80)); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), scr); m.position.set(X(-16.9), FY(1) + 1.8, Z(3.5)); m.rotation.y = Math.PI / 2; g.add(m); }
  block(1, -14.8, 0.55, 3.5, 0.6, 1.1, 0.5, '#6b4a2a');
  for (const u of [-12.4, -10.9, -9.4]) for (const v of [1.6, 2.6, 3.6, 4.6, 5.6]) chairF(1, u, v, 'u-');
  // investigations: desks, case board
  desk(1, -1.2, 2.2); desk(1, 1.6, 2.2); desk(1, -1.2, 5.0); desk(1, 1.6, 5.0); chairF(1, -1.2, 1.4, 'v+'); chairF(1, 1.6, 4.2, 'v+'); chairF(1, 1.6, 1.4, 'v+');
  { bx(paint, 6.2, FY(1) + 1.6, 0.12, 3.0, 1.4, 0.04, '#b08a5a'); for (let k = 0; k < 10; k++) bx(paint, 5.0 + (k % 5) * 0.6, FY(1) + 1.2 + Math.floor(k / 5) * 0.6, 0.15, 0.4, 0.3, 0.01, k % 3 ? '#f4f4f0' : '#cfe0f0'); for (let k = 0; k < 4; k++) bx(paint, 5.3 + k * 0.6, FY(1) + 1.55, 0.155, 0.6, 0.01, 0.005, '#c0262d'); }
  for (let v = 0.6; v < 6.6; v += 0.62) block(1, 8.5, 0.66, v, 0.6, 1.32, 0.56, '#7d8790');
  // officer in charge: big desk, visitor chairs, sofa, cabinet
  block(1, 13, 0.76, 2.4, 2.2, 0.06, 1.0, '#5a3a22'); bx(paint, 13, FY(1) + 0.38, 2.4, 2.1, 0.74, 0.9, '#4a2e1a'); chairF(1, 13, 1.5, 'v+'); chairF(1, 12.4, 3.6, 'v-'); chairF(1, 13.6, 3.6, 'v-');
  block(1, 16.3, 0.4, 5.0, 0.8, 0.8, 2.6, '#2c3e50'); block(1, 10.2, 0.9, 0.5, 1.6, 1.8, 0.4, '#5a3a22');
  // CSRU ready room (fictional unit): lockers, benches, kit table
  for (let u = -16.4; u < -3.6; u += 0.62) { bx(metal, u, FY(1) + 0.95, 17.6, 0.58, 1.9, 0.5, '#4a5560'); bx(paint, u + 0.2, FY(1) + 1.2, 17.34, 0.03, 0.12, 0.02, '#c8ccd0'); } ob(1, -16.7, -3.3, 17.3, D);
  for (const v of [13, 15]) block(1, -10, 0.24, v, 6, 0.48, 0.4, '#5a3a22');
  block(1, -15.8, 0.45, 11.3, 1.6, 0.9, 1.0, '#3a4550'); for (let k = 0; k < 4; k++) bx(paint, -16.3 + k * 0.35, FY(1) + 0.98, 11.3, 0.28, 0.12, 0.5, '#20262e');
  // meeting room: long table + chairs
  block(1, 3.5, 0.75, 13.5, 6, 0.06, 1.6, '#6b4a2a'); bx(paint, 3.5, FY(1) + 0.37, 13.5, 5.6, 0.72, 0.3, '#4a2e1a'); for (let k = 0; k < 5; k++) { chairF(1, 1.1 + k * 1.2, 12.3, 'v+'); chairF(1, 1.1 + k * 1.2, 14.7, 'v-'); }
  // stair hall (first floor, east): water dispenser and notice board
  block(1, 16.4, 0.45, 12.0, 0.5, 0.9, 0.5, '#2a6db0'); bx(paint, 16.88, FY(1) + 1.7, 14.5, 0.04, 1.0, 1.8, '#b08a5a');

  // ---------------------------------------------------------------- meshes and lights
  for (const m of mb.toMeshes(MAT, { cast: false, receive: true })) g.add(m);
  g.add(new THREE.HemisphereLight(0xfff6ea, 0x8a8478, 1.1));
  for (const [u, v, f] of [[0, 3.5, 0], [-11, 13, 0], [8, 8.25, 0], [-10, 3.5, 1], [3, 8.25, 1], [-9, 13.5, 1]]) { const l = new THREE.PointLight(0xfff1dc, 14, 16, 1.6); l.position.set(X(u), FY(f) + H - 0.5, Z(v)); g.add(l); }
  g.visible = false; game.scene.add(g);

  // ---------------------------------------------------------------- people
  const npcs = []; let sd = 7100;
  const yawOf = (face) => (face === 'u+' ? Math.PI / 2 : face === 'u-' ? -Math.PI / 2 : face === 'v+' ? Math.PI : 0); // world yaw (faces +z at 0; v+ is world −z)
  const person = (spec, f, u, v, face, action = null, walk = null) => { const ch = new Character(spec); ch.root.position.set(X(u), FY(f), Z(v)); ch.root.rotation.y = typeof face === 'number' ? face : yawOf(face); g.add(ch.root);
    if (action) ch.anim.set(action); for (let k = 0; k < 30; k++) ch.anim.update(0.04, 0); const n = { ch, f, u, v, action, walk, t: Math.random() * 10, spec }; npcs.push(n); return n; };
  const cop = (role, f, u, v, face, action, o = {}, walk) => person(makePoliceAppearance(sd++ * 3 + 1, role, Object.assign({ cap: null }, o)), f, u, v, face, action, walk); // caps off indoors
  const civ = (f, u, v, face, action, o = {}) => person(makeAppearance(sd++ * 5 + 3, Object.assign({ age: 'adult' }, o)), f, u, v, face, action);
  // ground floor
  cop('staff', 0, 3.4, 5.6, 'v-', null, { sex: 'f' }); cop('admin', 0, 2.2, 5.85, 'v-', 'sit');
  civ(0, -5.2, 2.0, 'u+', 'sit'); civ(0, -3.4, 3.6, 'u+', 'sit', { sex: 'f' }); civ(0, 1.8, 3.6, 'v+', 'talk');
  cop('admin', 0, -13.5, 2.8, 'v+', 'sit', { sex: 'f' }); cop('admin', 0, -10.2, 2.8, 'v+', 'sit');
  cop('supervisor', 0, 8.5, 2.6, 'v+', 'sit');
  cop('staff', 0, -13.3, 15.4, 'v+', 'sit'); cop('staff', 0, -8.1, 15.4, 'v+', 'sit', { sex: 'f' }); cop('supervisor', 0, -10.6, 13.0, 'v+', 'look');
  cop('patrol', 0, -0.6, 13.2, 'u+', 'sit'); cop('traffic', 0, 1.6, 13.2, 'u-', 'sit'); cop('staff', 0, 2.6, 16.6, 'v+', 'phone');
  cop('patrol', 0, -14, 8.25, 'u+', null, {}, { a: -15, b: 8.5, axis: 'u', sp: 1.25 });
  // first floor
  cop('supervisor', 1, -14.6, 3.0, 'u+', 'talk');
  [[-12.4, 1.6], [-12.4, 3.6], [-10.9, 2.6], [-10.9, 4.6], [-9.4, 1.6], [-9.4, 5.6]].forEach(([u, v], i) => cop(i % 3 === 0 ? 'motorcycle' : i % 3 === 1 ? 'patrol' : 'traffic', 1, u, v, 'u-', 'sit', i === 4 ? { sex: 'f' } : {}));
  cop('investigator', 1, -1.2, 1.4, 'v+', 'sit'); cop('investigator', 1, 1.6, 4.2, 'v+', 'sit', { sex: 'f' }); cop('investigator', 1, 5.6, 1.0, 'v-', 'look');
  cop('supervisor', 1, 13, 1.5, 'v+', 'sit', { band: 'mature' });
  cop('csru', 1, -12, 11.6, 'u+', 'talk'); cop('csru', 1, -10.8, 11.4, 'u-', 'look'); cop('csru', 1, -6.5, 15.9, 'v-', 'phone');
  cop('staff', 1, 6, 8.25, 'u-', null, { sex: 'f' }, { a: -12, b: 8, axis: 'u', sp: 1.15 });

  // ---------------------------------------------------------------- room object
  const room = {
    id: 'hq', D: HQ_DEF, g, fan: null, y: Y, door, H, plates, npcs, multiFloor: true,
    bounds: { x0: x0 + 0.25, x1: x1 - 0.25, z0: z0 + 0.25, z1: z1 - 0.25 }, obstacles: obs[0], obsByFloor: obs,
    spawn: [cx, z1 - 1.2], keeperPos: null,
    floorIndex(y) { return y > Y + H * 0.5 ? 1 : 0; },
    floorAt(x, z, y) { const u = x - cx, v = z1 - z; if (u > ST.u0 - 0.05 && u < ST.u1 + 0.05 && v >= ST.v0 && v <= ST.v1) return Y + ((v - ST.v0) / (ST.v1 - ST.v0)) * H; if (u > ST.u0 - 0.05 && u < ST.u1 + 0.05 && v > ST.v1) return Y + H; return y > Y + H * 0.5 ? Y + H : Y; },
    obsFor(y) { return obs[this.floorIndex(y)]; },
    ceilAt(y) { return FY(this.floorIndex(y) + 1) - 0.3; },
    // pull the camera in front of the first wall between the player and the desired camera position
    clampCam(from, to) { const ob2 = obs[this.floorIndex(from.y - 1.4)], n = 14; let last = 0; const R = 0.14;
      for (let k = 1; k <= n; k++) { const t = k / n; const x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t; let hit = false; const y = from.y + (to.y - from.y) * t; for (const o of ob2) if (y < o.top + 0.08 && x > o.x0 - R && x < o.x1 + R && z > o.z0 - R && z < o.z1 + R) { hit = true; break; } if (hit) break; last = t; }
      if (last < 1) { to.x = from.x + (to.x - from.x) * last; to.z = from.z + (to.z - from.z) * last; to.y = from.y + (to.y - from.y) * last; } return to; },
    // ambient animation: walkers patrol the corridors, everyone else idles / talks / types; people near the player turn to look
    update(dt, p) {
      for (const n of npcs) { n.t += dt; let speed = 0;
        if (n.walk) { const w = n.walk; if (n.dir === undefined) n.dir = 1; const tgt = n.dir > 0 ? w.b : w.a; const cur = w.axis === 'u' ? n.u : n.v; const d = tgt - cur;
          if (Math.abs(d) < 0.1) { n.pause = (n.pause || 0) + dt; if (n.pause > 2.5) { n.pause = 0; n.dir *= -1; } } else { const st = Math.sign(d) * Math.min(Math.abs(d), w.sp * dt); if (w.axis === 'u') n.u += st; else n.v += st; speed = w.sp; n.ch.root.rotation.y = w.axis === 'u' ? (d > 0 ? Math.PI / 2 : -Math.PI / 2) : d > 0 ? Math.PI : 0; }
          n.ch.root.position.set(X(n.u), FY(n.f), Z(n.v)); }
        else if (!n.action && p && Math.abs(p.y - FY(n.f)) < 1.5 && Math.hypot(p.x - X(n.u), p.z - Z(n.v)) < 3.2) { const want = Math.atan2(p.x - X(n.u), p.z - Z(n.v)); let dd = want - n.ch.root.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); n.ch.root.rotation.y += dd * Math.min(1, dt * 3); }
        n.ch.anim.update(dt, speed); }
    },
    dispose() { for (const n of npcs) n.ch.dispose && n.ch.dispose(); },
  };
  // walkers must not be blocked by their own obstacles: corridors are open, nothing to add
  return room;
}
