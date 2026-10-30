// Johns Private Girls' School — a FICTIONAL private school in Cinnamon Gardens (Colombo 7), on Horton Place.
// Name, crest-free signage and layout are invented for the game; the architecture follows the common Sri Lankan school
// pattern: a long three-storey classroom block with open arcaded corridors facing a quadrangle, red-oxide cement floors,
// barred classroom windows with green shutters, an open-sided assembly hall under a Calicut-tile roof with a stage and a
// brass oil lamp (pahana), a netball court, canteen, water-tap trough, a guard hut and a walled compound with iron gates.
// Ground-floor classrooms are walkable and fully furnished; the upper floors are furnished and visible but not accessible
// (the stairwell is behind a locked grille). Life around the school (staff, parents, school vans, the 1:30 pm dismissal)
// is in actors/SchoolLife.js. No student characters exist anywhere in the game.
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';

export const SCHOOL = {
  name: "Johns Private Girls' School", si: 'ජෝන්ස් බාලිකා විද්‍යාලය', ta: 'ஜோன்ஸ் மகளிர் பாடசாலை',
  wall: [250, 338, 330, 386], gate: { x0: 266, x1: 276, z: 330 }, wicket: { x0: 277.4, x1: 279 },
  main: [254, 334, 370, 384], rooms: 9, roomW: 8, corridor: 2.6, storeys: 3, FH: 3.6, plinth: 0.3,
  wing: [254, 266, 343, 370], hall: [300, 334, 346, 366.5], court: [271, 295, 349.5, 362],
  hut: [257.4, 260.2, 331.6, 334.4], canteen: [314, 324, 340.6, 344.6],
  vanBays: [[310, 337.0], [303, 337.0], [296, 337.0], [289, 337.0]], // inner drive, vans park nose-east in arrival order (first in → furthest east → first out)
  outside: { x: 271, z: 327.8 }, // pavement in front of the gate (Horton Place)
};

export function buildJohnsSchool({ mb, box, coll, label, group, LAND_Y, SANS, SI, TA, EN, hip, anim, C }) {
  const S = SCHOOL, y0 = LAND_Y; const conc = mb.get('concrete'), paint = mb.get('paint'), metal = mb.get('metal'), glass = mb.get('glass'), hedge = mb.get('hedge'), road = mb.get('road'), walkG = mb.get('walkGrey'), mark = mb.get('marking'), soil = mb.get('soil'), leaves = mb.get('leaves'), corr = mb.get('corrugated');
  const CREAM = '#efe7d3', MAROON = '#7a1f2b', GOLD = '#c9a13b', WOOD = '#6b4a2a', DARKWOOD = '#4e3320', GREEN = '#2f5d3a', REDOX = '#9a3b2c', IRON = '#1d1d1f';
  const TRIM = '#f6f1e4';
  // joinery on a wall facing +x / −x at wall-face x = wx (nx = ±1): a closed panelled door in a moulded frame, and a
  // recessed glazed window with frame, glazing bar and sill. Every layer has its own depth (no coplanar faces → no flicker).
  const doorOnX = (wx, nx, z, yb, w = 1.1, h = 2.1) => {
    const o = (d) => wx + nx * d;
    box(paint, o(0.006), yb + h / 2, z, 0.012, h, w, '#2a1d14'); // shadowed reveal behind the leaf
    for (const s2 of [-1, 1]) box(paint, o(0.03), yb + (h + 0.08) / 2, z + s2 * (w / 2 + 0.05), 0.06, h + 0.08, 0.1, TRIM); box(paint, o(0.03), yb + h + 0.09, z, 0.06, 0.1, w + 0.2, TRIM); // architrave
    box(paint, o(0.022), yb + h / 2, z, 0.035, h - 0.02, w - 0.03, DARKWOOD); // leaf
    for (const [py, ph] of [[0.55, 0.8], [1.5, 0.95]]) for (const s2 of [-1, 1]) box(paint, o(0.045), yb + py, z + s2 * (w / 4 - 0.01), 0.012, ph, w / 2 - 0.16, WOOD); // raised panels
    box(metal, o(0.06), yb + 1.0, z - (w / 2 - 0.1), 0.03, 0.03, 0.12, GOLD); box(metal, o(0.05), yb + 0.98, z - (w / 2 - 0.1), 0.012, 0.12, 0.05, GOLD); // brass lever + escutcheon
  };
  const windowOnX = (wx, nx, z, yc, w = 1.0, h = 1.3) => {
    const o = (d) => wx + nx * d;
    box(paint, o(0.004), yc, z, 0.008, h, w, '#1f2a2e'); // dark room behind the glass
    box(glass, o(0.02), yc, z, 0.01, h - 0.04, w - 0.04, '#ffffff');
    for (const s2 of [-1, 1]) box(paint, o(0.035), yc, z + s2 * (w / 2 + 0.03), 0.05, h + 0.06, 0.06, TRIM); for (const s2 of [-1, 1]) box(paint, o(0.035), yc + s2 * (h / 2 + 0.03), z, 0.05, 0.06, w + 0.12, TRIM);
    box(paint, o(0.032), yc, z, 0.03, h - 0.04, 0.035, TRIM); box(paint, o(0.07), yc - h / 2 - 0.07, z, 0.12, 0.05, w + 0.24, TRIM); // glazing bar, sill
  };
  const [wx0, wx1, wz0, wz1] = S.wall;

  // ------------------------------------------------------------ ground: drive, paths, court
  walkG.hrect(wx0 + 0.3, wz0 + 0.3, wx1 - 0.3, wz0 + 11, y0 + 0.02, 0.5, C('#cfcac0')); // inner drive / drop-off
  walkG.hrect(266, wz0 + 11, 270, 367, y0 + 0.02, 0.5, C('#cfcac0')); // gate → corridor path
  walkG.hrect(wx0 + 0.3, 366, wx1 - 0.3, 369.8, y0 + 0.02, 0.5, C('#cfcac0')); // strip along the classroom block
  walkG.hrect(304, wz0 + 11, 308, 345.4, y0 + 0.02, 0.5, C('#cfcac0')); // drive → hall
  { const [cx0, cx1, cz0, cz1] = S.court; road.hrect(cx0 - 1, cz0 - 1, cx1 + 1, cz1 + 1, y0 + 0.025, 0.25, C('#8e9a92'));
    const ln = (x0, z0, x1, z1) => box(mark, (x0 + x1) / 2, y0 + 0.035, (z0 + z1) / 2, Math.max(0.06, Math.abs(x1 - x0)), 0.01, Math.max(0.06, Math.abs(z1 - z0)), '#ffffff');
    ln(cx0, cz0, cx1, cz0); ln(cx0, cz1, cx1, cz1); ln(cx0, cz0, cx0, cz1); ln(cx1, cz0, cx1, cz1); // netball court, divided into thirds
    const t = (cx1 - cx0) / 3; ln(cx0 + t, cz0, cx0 + t, cz1); ln(cx0 + 2 * t, cz0, cx0 + 2 * t, cz1);
    const cz = (cz0 + cz1) / 2; mark.cylinder((cx0 + cx1) / 2, y0 + 0.03, cz, 0.45, 0.45, 0.01, 16, { col: C('#ffffff') });
    for (const [gx, sd] of [[cx0, 1], [cx1, -1]]) { // goal semicircles and posts
      for (let k = 0; k < 14; k++) { const a0 = -Math.PI / 2 + (k / 14) * Math.PI, a1 = -Math.PI / 2 + ((k + 1) / 14) * Math.PI, r = 4.2; ln(gx + sd * Math.cos(a0) * r, cz + Math.sin(a0) * r, gx + sd * Math.cos(a1) * r, cz + Math.sin(a1) * r); }
      metal.cylinder(gx, y0, cz, 0.05, 0.05, 3.05, 8, { col: C('#d8d8d4') }); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; box(metal, gx + sd * (0.24 + Math.cos(a) * 0.19), y0 + 3.0, cz + Math.sin(a) * 0.19, 0.03, 0.02, 0.13, '#c0392b'); }
      coll(gx - 0.08, gx + 0.08, cz - 0.08, cz + 0.08, y0 + 3.05, { kind: 'pole' }); }
    for (const bz of [cz0 - 2.2, cz1 + 2.2]) { box(paint, (cx0 + cx1) / 2, y0 + 0.42, bz, 6, 0.06, 0.4, WOOD); for (const dx of [-2.6, 0, 2.6]) box(conc, (cx0 + cx1) / 2 + dx, y0 + 0.2, bz, 0.12, 0.4, 0.36, '#b9b2a4'); coll((cx0 + cx1) / 2 - 3, (cx0 + cx1) / 2 + 3, bz - 0.2, bz + 0.2, y0 + 0.46); } }

  // ------------------------------------------------------------ boundary wall, gate, wicket
  const wallSeg = (x0, x1, z0, z1) => { box(paint, (x0 + x1) / 2, y0 + 0.95, (z0 + z1) / 2, x1 - x0, 1.9, z1 - z0, CREAM); box(paint, (x0 + x1) / 2, y0 + 1.95, (z0 + z1) / 2, x1 - x0 + 0.08, 0.1, z1 - z0 + 0.08, MAROON); coll(x0, x1, z0, z1, y0 + 2.05); };
  const T = 0.25, G = S.gate, Wk = S.wicket;
  wallSeg(wx0, G.x0 - 0.35, wz0 - T / 2, wz0 + T / 2); wallSeg(G.x1 + 0.7, Wk.x0, wz0 - T / 2, wz0 + T / 2); wallSeg(Wk.x1 + 0.35, wx1, wz0 - T / 2, wz0 + T / 2);
  wallSeg(wx0, wx1, wz1 - T / 2, wz1 + T / 2); wallSeg(wx0 - T / 2, wx0 + T / 2, wz0, wz1); wallSeg(wx1 - T / 2, wx1 + T / 2, wz0, wz1);
  for (let x = wx0 + 8; x < wx1 - 4; x += 8) if (x < G.x0 - 1 || x > Wk.x1 + 1) box(paint, x, y0 + 1.05, wz0, 0.45, 2.1, 0.45, CREAM); // wall piers
  const pillar = (x, h) => { box(paint, x, y0 + h / 2, wz0, 0.7, h, 0.7, CREAM); box(paint, x, y0 + h + 0.08, wz0, 0.86, 0.16, 0.86, MAROON); coll(x - 0.35, x + 0.35, wz0 - 0.35, wz0 + 0.35, y0 + h); };
  pillar(G.x0 - 0.35, 4.0); pillar(G.x1 + 0.35, 4.0); pillar(Wk.x1 + 0.35, 2.4);
  box(paint, (G.x0 + G.x1) / 2, y0 + 4.55, wz0, G.x1 - G.x0 + 1.4, 1.3, 0.5, MAROON, { bottom: true }); // name arch
  label([{ text: S.si, font: SI(62), color: '#f3d27a' }, { text: "JOHNS PRIVATE GIRLS' SCHOOL", font: EN(104), color: '#ffffff' }, { text: S.ta, font: TA(54), color: '#f3d27a' }], (G.x0 + G.x1) / 2, y0 + 4.55, wz0 - 0.26, G.x1 - G.x0 + 1.0, 1.15, Math.PI, { w: 2048, h: 236, bg: '#6e1a26', glow: false });
  label([{ text: 'VISITORS PLEASE REPORT TO THE SECURITY OFFICE', font: SANS(74), color: '#ffffff' }], (G.x0 + G.x1) / 2, y0 + 4.55, wz0 + 0.26, G.x1 - G.x0 + 0.4, 0.42, 0, { w: 2048, h: 120, bg: '#6e1a26', glow: false });
  { // swing gates (SchoolLife opens them): iron bars with gold finials, pivots at the pillars
    const L = G.x1 - G.x0, w = L / 2; const mkLeaf = (gb, sd) => { const b = gb.get('metal'); const xs = (x) => sd * x; // local x runs from the pivot towards the centre
      for (const y of [0.15, 1.0, 1.85]) b.box(xs(w / 2), y, 0, w, 0.07, 0.06, { col: C(IRON) }); for (let x = 0.07; x < w; x += 0.14) { b.box(xs(x), 1.0, 0, 0.025, 1.9, 0.025, { col: C(IRON) }); b.box(xs(x), 1.97, 0, 0.04, 0.08, 0.04, { col: C(GOLD) }); }
      b.box(xs(w / 2), 1.0, 0.02, 0.9, 0.5, 0.02, { col: C(MAROON) }); };
    const leaves2 = []; for (const sd of [1, -1]) { const g = new THREE.Group(), gb = new MultiBuilder(); mkLeaf(gb, sd); for (const m of gb.toMeshes(MAT, { cast: true, receive: true })) g.add(m);
      g.position.set(sd > 0 ? G.x0 : G.x1, y0, wz0 + 0.18); group.add(g); leaves2.push(g); }
    anim.schoolGate = leaves2; coll(G.x0, G.x1, wz0 - 0.15, wz0 + 0.3, y0 + 2.0, { id: 'schoolGate' });
  }
  // guard hut
  { const [hx0, hx1, hz0, hz1] = S.hut, cx = (hx0 + hx1) / 2, cz = (hz0 + hz1) / 2, w = hx1 - hx0, d = hz1 - hz0;
    box(paint, cx, y0 + 1.25, cz, w, 2.5, d, CREAM); box(paint, cx, y0 + 2.6, cz, w + 0.5, 0.2, d + 0.5, MAROON, { bottom: true }); windowOnX(hx1, 1, cz - 0.5, y0 + 1.55, 0.9, 0.9); box(paint, cx, y0 + 1.55, hz0 - 0.004, 1.6, 0.9, 0.008, '#1f2a2e'); box(glass, cx, y0 + 1.55, hz0 - 0.02, 1.56, 0.86, 0.01, '#ffffff'); for (const s2 of [-1, 1]) box(paint, cx + s2 * 0.83, y0 + 1.55, hz0 - 0.035, 0.06, 0.96, 0.05, TRIM); for (const s2 of [-1, 1]) box(paint, cx, y0 + 1.55 + s2 * 0.48, hz0 - 0.035, 1.72, 0.06, 0.05, TRIM); // hut windows (side + gate-facing)
    doorOnX(hx1, 1, hz1 - 0.6, y0, 0.85, 2.05); coll(hx0, hx1, hz0, hz1, y0 + 2.7);
    label([{ text: 'SECURITY', font: SANS(110), color: '#ffffff' }], cx, y0 + 2.25, hz0 - 0.03, 1.6, 0.3, Math.PI, { w: 512, h: 96, bg: MAROON, glow: false }); }
  { // the watchman's blue plastic chair beside the hut (SchoolGuard.CHAIR: seat top 0.44 m, facing the road)
    const chx = 261.5, chz = 335.2, PL = '#2c5aa0'; box(paint, chx, y0 + 0.42, chz, 0.46, 0.04, 0.44, PL);
    for (const ex of [-0.2, 0.2]) for (const ez of [-0.18, 0.18]) box(paint, chx + ex, y0 + 0.2, chz + ez, 0.035, 0.4, 0.035, PL);
    box(paint, chx, y0 + 0.68, chz + 0.215, 0.46, 0.44, 0.03, PL); for (const ex of [-0.21, 0.21]) box(paint, chx + ex, y0 + 0.6, chz, 0.035, 0.03, 0.4, PL);
    coll(chx - 0.24, chx + 0.24, chz - 0.23, chz + 0.24, y0 + 0.9); }
  { // pedestrian wicket: one iron leaf hinged at the wall end, swings inwards (SchoolLife opens it; locked at night)
    const w = Wk.x1 - Wk.x0, gb = new MultiBuilder(), b = gb.get('metal'), g = new THREE.Group();
    for (const y of [0.15, 1.0, 1.85]) b.box(w / 2, y, 0, w, 0.07, 0.06, { col: C(IRON) });
    for (const x of [0.03, w - 0.03]) b.box(x, 1.0, 0, 0.05, 1.95, 0.05, { col: C(IRON) });
    for (let x = 0.12; x < w - 0.06; x += 0.14) { b.box(x, 1.0, 0, 0.025, 1.9, 0.025, { col: C(IRON) }); b.box(x, 1.97, 0, 0.04, 0.08, 0.04, { col: C(GOLD) }); }
    for (const m of gb.toMeshes(MAT, { cast: true, receive: true })) g.add(m);
    g.position.set(Wk.x0, y0, wz0 + 0.18); group.add(g); anim.schoolWicket = g; coll(Wk.x0, Wk.x1, wz0 - 0.15, wz0 + 0.3, y0 + 2.0, { id: 'schoolWicket' }); }

  // ------------------------------------------------------------ main classroom block (three storeys, arcaded corridors)
  const [mx0, mx1, mz0, mz1] = S.main, FH = S.FH, P = S.plinth, zc = mz0 + S.corridor, NR = S.rooms, RW = S.roomW; const yF = (f) => y0 + P + f * FH; const top = yF(S.storeys);
  box(conc, (mx0 + mx1) / 2, y0 + P / 2, (mz0 + mz1) / 2 - 0.2, mx1 - mx0, P, mz1 - mz0 + 0.4, '#b9b2a4'); coll(mx0, mx1, mz0 - 0.4, mz1, y0 + P, { kind: 'deck' });
  for (let f = 0; f < S.storeys; f++) paint.hrect(mx0, mz0 - (f ? 0.15 : 0.4), mx1, mz1, yF(f) + 0.006, 1, C(REDOX)); // red-oxide cement floors
  for (let f = 1; f <= S.storeys; f++) { box(paint, (mx0 + mx1) / 2, yF(f) - 0.12, (mz0 + mz1) / 2 - 0.08, mx1 - mx0 + 0.3, 0.24, mz1 - mz0 + 0.46, '#ece6d6', { bottom: true }); box(paint, (mx0 + mx1) / 2, yF(f) - 0.12, mz0 - 0.32, mx1 - mx0 + 0.3, 0.24, 0.03, MAROON); }
  hip(mx0 - 0.2, mx1 + 0.2, mz0 - 0.4, mz1 + 0.2, top, 3.2, '#b5532e');
  // wall with openings: o = [{a, b, lo, hi}] along x at fixed z
  const wallX = (b, xa, xb, z, th, yb, h, ops, col) => { let x = xa; ops = ops.slice().sort((p, q) => p.a - q.a);
    for (const o of ops) { if (o.a > x) box(b, (x + o.a) / 2, yb + h / 2, z, o.a - x, h, th, col); if (o.lo > 0) box(b, (o.a + o.b) / 2, yb + o.lo / 2, z, o.b - o.a, o.lo, th, col); if (o.hi < h) box(b, (o.a + o.b) / 2, yb + (o.hi + h) / 2, z, o.b - o.a, h - o.hi, th, col); x = o.b; }
    if (xb > x) box(b, (x + xb) / 2, yb + h / 2, z, xb - x, h, th, col); };
  const bars = (a, b, z, yb, lo, hi) => { for (let x = a + 0.1; x < b - 0.05; x += 0.15) box(metal, x, yb + (lo + hi) / 2, z, 0.022, hi - lo, 0.022, '#2b3a30'); box(metal, (a + b) / 2, yb + (lo + hi) / 2, z, b - a, 0.03, 0.03, '#2b3a30'); };
  const nCol = 21; const colX = (k) => mx0 + 0.2 + (k / (nCol - 1)) * (mx1 - mx0 - 0.4);
  for (let f = 0; f < S.storeys; f++) { const yb = yF(f), h = FH - 0.24;
    for (let k = 0; k < nCol; k++) { box(paint, colX(k), yb + h / 2, mz0 + 0.22, 0.34, h, 0.34, '#f3ecda'); if (f === 0) coll(colX(k) - 0.18, colX(k) + 0.18, mz0 + 0.04, mz0 + 0.4, top); }
    if (f > 0) { box(paint, (mx0 + mx1) / 2, yb + 0.5, mz0 + 0.1, mx1 - mx0, 1.0, 0.16, '#f3ecda'); box(paint, (mx0 + mx1) / 2, yb + 1.03, mz0 + 0.1, mx1 - mx0 + 0.1, 0.07, 0.26, MAROON); }
    // classroom front wall (corridor side): two barred windows and a door per room; the last bay is the stairwell
    const front = [], back = [];
    for (let k = 0; k < NR; k++) { const x0 = mx0 + k * RW; front.push({ a: x0 + 1.0, b: x0 + 2.8, lo: 0.9, hi: 2.3 }, { a: x0 + 3.5, b: x0 + 5.3, lo: 0.9, hi: 2.3 }, { a: x0 + 6.3, b: x0 + 7.4, lo: 0, hi: 2.2 }); back.push({ a: x0 + 1.2, b: x0 + 3.4, lo: 0.9, hi: 2.4 }, { a: x0 + 4.6, b: x0 + 6.8, lo: 0.9, hi: 2.4 }); }
    const sx0 = mx0 + NR * RW; front.push({ a: sx0 + 1.0, b: sx0 + 3.4, lo: 0, hi: 2.4 }); back.push({ a: sx0 + 2.2, b: sx0 + 5.8, lo: 1.2, hi: 2.6 });
    wallX(paint, mx0, mx1, zc + 0.1, 0.2, yb, h, front, CREAM); wallX(paint, mx0, mx1, mz1 - 0.1, 0.2, yb, h, back, CREAM);
    for (const o of front) { if (o.lo > 0) bars(o.a, o.b, zc + 0.1, yb, o.lo, o.hi); else if (o.b - o.a < 2) { const zf = zc; for (const xx of [o.a - 0.05, o.b + 0.05]) box(paint, xx, yb + 1.15, zf - 0.03, 0.1, 2.3, 0.06, TRIM); box(paint, (o.a + o.b) / 2, yb + 2.25, zf - 0.03, o.b - o.a + 0.2, 0.1, 0.06, TRIM); /* architrave */
      const lw = o.b - o.a - 0.04; box(paint, o.a + 0.04, yb + 1.05, zc + 0.2 + lw / 2, 0.04, 2.08, lw, DARKWOOD); for (const sx2 of [-1, 1]) for (const [py, ph] of [[0.55, 0.8], [1.5, 0.95]]) box(paint, o.a + 0.04 + sx2 * 0.026, yb + py, zc + 0.2 + lw / 2, 0.012, ph, lw - 0.24, WOOD); /* leaf hinged open at 90° against the classroom wall, panelled both sides */
      box(metal, o.a + 0.1, yb + 1.0, zc + 0.2 + lw - 0.1, 0.06, 0.03, 0.03, GOLD); } else bars(o.a, o.b, zc + 0.1, yb, 0.02, o.hi); /* stairwell grille, locked */ }
    for (const o of back) { bars(o.a, o.b, mz1 - 0.1, yb, o.lo, o.hi); const sh = (o.b - o.a) / 2; for (const [x, s2] of [[o.a - sh / 2 - 0.02, -1], [o.b + sh / 2 + 0.02, 1]]) box(paint, x, yb + (o.lo + o.hi) / 2, mz1 + 0.03, sh, o.hi - o.lo, 0.04, GREEN); void 0; }
    for (let k = 1; k <= NR; k++) box(paint, mx0 + k * RW, yb + h / 2, (zc + mz1) / 2, 0.2, h, mz1 - zc, CREAM); // dividing walls
    for (const x of [mx0 + 0.1, mx1 - 0.1]) box(paint, x, yb + h / 2, (zc + mz1) / 2, 0.2, h, mz1 - zc, CREAM); // end walls
    box(paint, (mx0 + mx1) / 2, yb + 0.6, zc + 0.215, mx1 - mx0 - 0.4, 1.2, 0.03, '#a9c4a0'); // pale green dado along the corridor
    // furnishing: every classroom on every floor (desks face the blackboard on the west wall)
    for (let k = 0; k < NR; k++) { const x0 = mx0 + k * RW, zm = (zc + mz1) / 2;
      box(paint, x0 + 0.23, yb + 1.55, zm, 0.03, 1.36, 3.9, WOOD); box(paint, x0 + 0.255, yb + 1.55, zm, 0.03, 1.2, 3.7, '#24412f'); box(paint, x0 + 0.31, yb + 0.92, zm, 0.1, 0.03, 3.6, WOOD); // blackboard + chalk ledge
      box(paint, x0 + 1.5, yb + 0.76, zm + 1.4, 0.8, 0.05, 1.4, WOOD, { bottom: true }); for (const dz of [-0.62, 0.62]) box(paint, x0 + 1.5, yb + 0.37, zm + 1.4 + dz, 0.74, 0.74, 0.04, DARKWOOD); // teacher's table
      box(paint, x0 + 2.05, yb + 0.46, zm + 1.4, 0.42, 0.04, 0.42, WOOD); box(paint, x0 + 2.27, yb + 0.7, zm + 1.4, 0.03, 0.48, 0.42, WOOD); for (const dz of [-0.19, 0.19]) box(paint, x0 + 2.05, yb + 0.22, zm + 1.4 + dz, 0.4, 0.44, 0.03, DARKWOOD);
      for (let j = 0; j < 5; j++) { const zd = zc + 1.4 + j * 2.0; for (let i = 0; i < 4; i++) { const xd = x0 + 3.0 + i * 1.22; // single wooden desk + chair
          box(paint, xd, yb + 0.72, zd, 0.46, 0.04, 0.62, WOOD, { bottom: true }); box(paint, xd, yb + 0.6, zd, 0.42, 0.02, 0.58, DARKWOOD); for (const dz of [-0.28, 0.28]) box(paint, xd, yb + 0.35, zd + dz, 0.42, 0.7, 0.03, DARKWOOD);
          const xc = xd + 0.52; box(paint, xc, yb + 0.45, zd, 0.38, 0.035, 0.38, WOOD); box(paint, xc + 0.18, yb + 0.68, zd, 0.025, 0.42, 0.36, WOOD); for (const dz of [-0.17, 0.17]) box(paint, xc, yb + 0.22, zd + dz, 0.36, 0.44, 0.025, DARKWOOD); }
        if (f === 0) coll(x0 + 2.72, x0 + 7.4, zd - 0.33, zd + 0.33, yb + 0.78); }
      for (const fz of [zc + 3.4, zc + 7.9]) { const fx = x0 + 4.6; metal.cylinder(fx, yb + FH - 0.75, fz, 0.012, 0.012, 0.5, 6, { col: C('#e8e8e4') }); metal.cylinder(fx, yb + FH - 0.82, fz, 0.1, 0.1, 0.1, 10, { col: C('#e8e8e4') }); box(metal, fx, yb + FH - 0.78, fz, 1.2, 0.012, 0.11, '#e8e8e4'); box(metal, fx, yb + FH - 0.78, fz, 0.11, 0.012, 1.2, '#e8e8e4'); } // ceiling fans
      box(paint, x0 + 4.4, yb + 1.7, mz1 - 0.215, 2.4, 1.0, 0.03, '#a8835a'); [['#f4d35e', -0.8, 0.15], ['#7fb8e6', -0.2, -0.2], ['#ffffff', 0.5, 0.18], ['#f28b82', 0.85, -0.18], ['#b4e197', 0.1, 0.25]].forEach(([c, dx, dy]) => box(paint, x0 + 4.4 + dx, yb + 1.7 + dy, mz1 - 0.235, 0.42, 0.3, 0.01, c)); // notice board
      box(paint, x0 + 7.35, yb + 0.95, mz1 - 0.5, 0.9, 1.9, 0.55, '#5c3d24'); // cupboard
      if (f === 0) { coll(x0 + 1.05, x0 + 2.35, zm + 0.65, zm + 2.15, yb + 0.8); coll(x0 + 6.85, x0 + 7.85, mz1 - 0.8, mz1 - 0.2, yb + 1.9); } }
    // stairwell (two flights per storey, visible through the locked grille)
    if (f < S.storeys - 1) for (let s = 0; s < 9; s++) { const r = 0.2, run = 0.8; box(conc, sx0 + 2.0, yb + (s + 1) * r / 2, zc + 0.6 + s * run + run / 2, 3.2, (s + 1) * r, run, '#cfc8bb'); box(conc, sx0 + 6.0, yb + (1.8 + (s + 1) * r) / 2, mz1 - 3.4 - s * run - run / 2, 3.2, 1.8 + (s + 1) * r, run, '#cfc8bb'); }
    if (f < S.storeys - 1) box(conc, sx0 + 4.0, yb + 0.9, mz1 - 1.7, 7.4, 1.8, 3.2, '#cfc8bb'); // half landing
  }
  // ground-floor walls as colliders (doors open, windows solid); stairwell closed
  { const yb = yF(0), ht = top; let x = mx0; for (let k = 0; k < NR; k++) { const x0 = mx0 + k * RW; coll(x, x0 + 6.3, zc, zc + 0.2, ht); x = x0 + 7.4; } coll(x, mx1, zc, zc + 0.2, ht);
    coll(mx0, mx1, mz1 - 0.2, mz1, ht); for (let k = 1; k <= NR; k++) coll(mx0 + k * RW - 0.1, mx0 + k * RW + 0.1, zc, mz1, ht); coll(mx0, mx0 + 0.2, zc, mz1, ht); coll(mx0 + NR * RW, mx1, zc, mz1, ht); void yb; }
  // water-tap trough at the west end of the block
  box(conc, 259, y0 + 0.4, 367.2, 6, 0.8, 0.6, '#b9b2a4'); for (let k = 0; k < 6; k++) { metal.cylinder(256.5 + k, y0 + 0.8, 367.2, 0.015, 0.015, 0.22, 6, { col: C('#c8ccd0') }); box(metal, 256.5 + k, y0 + 1.0, 367.12, 0.03, 0.03, 0.16, '#c8ccd0'); } coll(256, 262, 366.9, 367.5, y0 + 0.8);

  // ------------------------------------------------------------ west wing: principal's office, staff room, library (two storeys)
  { const [ax0, ax1, az0, az1] = S.wing, H2 = 2 * FH, cx = (ax0 + ax1) / 2, cz = (az0 + az1) / 2;
    box(conc, cx + 1.2, y0 + P / 2, cz, ax1 - ax0 + 2.4, P, az1 - az0, '#b9b2a4'); coll(ax0, ax1 + 2.4, az0, az1, y0 + P, { kind: 'deck' });
    box(paint, cx, y0 + P + H2 / 2, cz, ax1 - ax0, H2, az1 - az0, CREAM); coll(ax0, ax1, az0, az1, y0 + P + H2 + 1);
    hip(ax0 - 0.2, ax1 + 2.6, az0, az1, y0 + P + H2, 2.6, '#b5532e'); box(paint, ax1 + 1.2, y0 + P + FH - 0.12, cz, 2.4, 0.24, az1 - az0, '#ece6d6', { bottom: true }); box(paint, ax1 + 1.2, y0 + P + 2 * FH - 0.06, cz, 2.6, 0.12, az1 - az0, '#ece6d6', { bottom: true });
    for (let k = 0; k < 6; k++) { const z = az0 + 0.3 + (k / 5) * (az1 - az0 - 0.6); box(paint, ax1 + 2.2, y0 + P + FH / 2, z, 0.3, FH, 0.3, '#f3ecda'); box(paint, ax1 + 2.2, y0 + P + FH + FH / 2, z, 0.3, FH, 0.3, '#f3ecda'); coll(ax1 + 2.05, ax1 + 2.35, z - 0.15, z + 0.15, y0 + 4); }
    box(paint, ax1 + 2.2, y0 + P + FH + 0.5, cz, 0.16, 1.0, az1 - az0, '#f3ecda'); box(paint, ax1 + 2.2, y0 + P + FH + 1.03, cz, 0.26, 0.07, az1 - az0, MAROON);
    [["PRINCIPAL'S OFFICE", 347.5], ['STAFF ROOM', 356.5], ['LIBRARY', 365.5]].forEach(([t, z]) => { doorOnX(ax1, 1, z, y0 + P, 1.2, 2.15); label([{ text: t, font: SANS(80), color: '#ffffff' }], ax1 + 0.06, y0 + P + 2.55, z, 1.5, 0.26, Math.PI / 2, { w: 768, h: 130, bg: MAROON, glow: false }); });
    for (let f = 0; f < 2; f++) for (const z of [344.8, 351.6, 353.4, 360.6, 362.4, 368.2]) { windowOnX(ax1, 1, z, y0 + P + f * FH + 1.6); for (const s2 of [-1, 1]) box(paint, ax1 + 0.03, y0 + P + f * FH + 1.6, z + s2 * 0.83, 0.03, 1.3, 0.5, GREEN); }
    for (let f = 0; f < 2; f++) for (let z = az0 + 2; z < az1 - 1; z += 3.2) { windowOnX(ax0, -1, z, y0 + P + f * FH + 1.6); for (const s2 of [-1, 1]) box(paint, ax0 - 0.03, y0 + P + f * FH + 1.6, z + s2 * 0.83, 0.03, 1.3, 0.5, GREEN); }
    for (const [x, z] of [[ax1 + 3.2, 346], [ax1 + 3.2, 352], [ax1 + 3.2, 360]]) { box(soil, x, y0 + 0.12, z, 1.0, 0.24, 3.4, '#5a3d2a'); for (let k = 0; k < 4; k++) leaves.box(x, y0 + 0.45, z - 1.2 + k * 0.8, 0.6, 0.5, 0.6, { col: C(k % 2 ? '#3f7d3a' : '#4f8f3c') }); } }

  // ------------------------------------------------------------ assembly hall (open sides, Calicut-tile roof, stage, brass oil lamp)
  { const [hx0, hx1, hz0, hz1] = S.hall, PH = 0.45, yb = y0 + PH, cx = (hx0 + hx1) / 2, cz = (hz0 + hz1) / 2, eave = yb + 5.2;
    box(conc, cx, y0 + PH / 2, cz, hx1 - hx0, PH, hz1 - hz0, '#b9b2a4'); coll(hx0, hx1, hz0, hz1, yb, { kind: 'deck' }); paint.hrect(hx0 + 0.2, hz0 + 0.2, hx1 - 0.2, hz1 - 0.2, yb + 0.006, 1, C('#b9806a'));
    box(conc, hx0 - 0.3, y0 + 0.11, cz, 0.6, 0.22, hz1 - hz0 - 4, '#b9b2a4'); coll(hx0 - 0.6, hx0, hz0 + 2, hz1 - 2, y0 + 0.22, { kind: 'deck' }); box(conc, cx - 2, y0 + 0.11, hz0 - 0.3, hx1 - hx0 - 8, 0.22, 0.6, '#b9b2a4'); coll(hx0 + 2, hx1 - 6, hz0 - 0.6, hz0, y0 + 0.22, { kind: 'deck' });
    const colAt = (x, z) => { box(paint, x, yb + 2.6, z, 0.42, 5.2, 0.42, '#f3ecda'); coll(x - 0.21, x + 0.21, z - 0.21, z + 0.21, eave); };
    for (let k = 0; k < 9; k++) { const x = hx0 + 0.3 + (k / 8) * (hx1 - hx0 - 0.6); colAt(x, hz0 + 0.3); colAt(x, hz1 - 0.3); } for (let k = 1; k < 5; k++) { const z = hz0 + 0.3 + (k / 5) * (hz1 - hz0 - 0.6); colAt(hx0 + 0.3, z); colAt(hx1 - 0.3, z); }
    box(paint, cx, yb + 0.45, hz1 - 0.3, hx1 - hx0, 0.9, 0.2, CREAM); coll(hx0, hx1, hz1 - 0.4, hz1 - 0.2, yb + 0.9); // low parapet on the south side
    box(paint, hx1 - 0.25, yb + 2.6, cz, 0.3, 5.2, hz1 - hz0, CREAM); coll(hx1 - 0.4, hx1, hz0, hz1, eave); // solid wall behind the stage
    box(paint, cx, eave + 0.06, cz, hx1 - hx0 + 0.4, 0.12, hz1 - hz0 + 0.4, '#f0ebe0', { bottom: true }); for (let k = 0; k < 8; k++) box(paint, hx0 + 2 + k * 4.3, eave - 0.2, cz, 0.18, 0.3, hz1 - hz0, WOOD, { bottom: true }); // ceiling + exposed beams
    hip(hx0, hx1, hz0, hz1, eave + 0.12, 3.6, '#b5532e');
    // stage
    const sx0 = hx1 - 7, sy = yb + 0.9; box(conc, (sx0 + hx1 - 0.4) / 2, yb + 0.45, cz, hx1 - 0.4 - sx0, 0.9, hz1 - hz0 - 2, '#ddd6c8'); box(paint, sx0 - 0.01, yb + 0.45, cz, 0.04, 0.9, hz1 - hz0 - 2, MAROON); coll(sx0, hx1 - 0.4, hz0 + 1, hz1 - 1, sy, { kind: 'deck' });
    for (const [dx, h] of [[-0.9, 0.3], [-0.45, 0.6]]) { box(conc, sx0 + dx + 0.225, yb + h / 2, cz, 0.45, h, 4, '#ddd6c8'); coll(sx0 + dx, sx0 + dx + 0.45, cz - 2, cz + 2, yb + h, { kind: 'deck' }); }
    box(paint, hx1 - 0.45, sy + 2.0, cz, 0.08, 4.0, hz1 - hz0 - 3, '#6e1a26'); box(paint, hx1 - 0.5, sy + 4.05, cz, 0.12, 0.35, hz1 - hz0 - 3, GOLD); // curtain + valance
    label([{ text: 'ASSEMBLY HALL', font: SANS(120), color: '#f3d27a' }, { text: S.name.toUpperCase(), font: SANS(64), color: '#ffffff' }], hx1 - 0.52, sy + 3.3, cz, 6, 0.9, -Math.PI / 2, { w: 1536, h: 230, bg: null, glow: false });
    box(paint, sx0 + 2.2, sy + 0.55, cz - 2.5, 0.6, 1.1, 0.55, WOOD); coll(sx0 + 1.9, sx0 + 2.5, cz - 2.8, cz - 2.2, sy + 1.1); // lectern
    { const lx = sx0 + 2.4, lz = cz + 2.8; const B = (r, y, h) => metal.cylinder(lx, sy + y, lz, r, r, h, 12, { col: C(GOLD) }); B(0.26, 0, 0.06); B(0.12, 0.06, 0.1); B(0.03, 0.16, 1.2); B(0.2, 0.62, 0.04); B(0.15, 0.92, 0.04); B(0.1, 1.2, 0.04); metal.cylinder(lx, sy + 1.36, lz, 0.05, 0.0, 0.25, 8, { col: C(GOLD) }); coll(lx - 0.26, lx + 0.26, lz - 0.26, lz + 0.26, sy + 1.6); } // brass oil lamp (pahana)
    // rows of chairs facing the stage, central aisle
    for (let r = 0; r < 9; r++) { const x = hx0 + 3.5 + r * 2.1; for (const [za, zb] of [[hz0 + 2.2, cz - 0.8], [cz + 0.8, hz1 - 2.2]]) { for (let z = za + 0.25; z < zb; z += 0.62) {
        box(paint, x, yb + 0.45, z, 0.42, 0.04, 0.44, '#7a1f2b'); box(paint, x - 0.2, yb + 0.72, z, 0.03, 0.5, 0.42, '#7a1f2b'); for (const dz of [-0.19, 0.19]) box(metal, x, yb + 0.22, z + dz, 0.4, 0.44, 0.02, '#9aa0a6'); }
      coll(x - 0.25, x + 0.25, za, zb, yb + 0.8); } } }

  // ------------------------------------------------------------ canteen and garden
  { const [kx0, kx1, kz0, kz1] = S.canteen, cx = (kx0 + kx1) / 2, cz = (kz0 + kz1) / 2;
    box(paint, cx, y0 + 1.3, cz + 0.6, kx1 - kx0, 2.6, kz1 - kz0 - 1.2, CREAM); box(paint, cx, y0 + 0.55, kz0 + 0.5, kx1 - kx0, 1.1, 0.5, '#7b5536'); box(paint, cx, y0 + 1.12, kz0 + 0.45, kx1 - kx0 + 0.1, 0.05, 0.62, '#d8d0c0');
    corr.box(cx, y0 + 2.75, cz, kx1 - kx0 + 1.0, 0.08, kz1 - kz0 + 1.4, { col: C('#9aa3a8'), bottom: true }); for (const x of [kx0 + 0.1, kx1 - 0.1]) box(metal, x, y0 + 1.35, kz0 - 0.4, 0.08, 2.7, 0.08, '#5f666b');
    label([{ text: 'CANTEEN', font: SANS(120), color: '#ffffff' }], cx, y0 + 2.45, kz0 + 0.33, 2.4, 0.4, Math.PI, { w: 640, h: 110, bg: MAROON, glow: false }); coll(kx0, kx1, kz0 + 0.2, kz1, y0 + 2.8); }
  for (const [x0, x1] of [[271, 303.6], [308.4, 313.6], [324.4, 336]]) { hedge.box((x0 + x1) / 2, y0 + 0.45, 341.6, x1 - x0, 0.9, 0.7, { col: C('#3f7d3a') }); coll(x0, x1, 341.25, 341.95, y0 + 0.9); }
  for (const [x, z] of [[283, 345], [297, 345], [283, 365.5], [297, 365.5]]) { box(soil, x, y0 + 0.1, z, 2.4, 0.2, 1.0, '#5a3d2a'); for (let k = 0; k < 3; k++) leaves.box(x - 0.8 + k * 0.8, y0 + 0.4, z, 0.55, 0.45, 0.55, { col: C(['#c0392b', '#f1c40f', '#e67e22'][k]) }); }
  // ------------------------------------------------------------ night lighting
  // Corridor tube lights over the classroom doors (every bay on the ground floor, every other bay upstairs — what a
  // school leaves on overnight), lanterns on the gate pillars, a bulb over the security hut door and its lit window.
  // Fittings: 'emissive' tubes (white by day, bright at night) and 'lampHead' lanterns/bulbs (dark by day, glow at night);
  // the light they throw: additive night-only pools on floors and washes on walls (MAT.pool, as the street lamps).
  { const pool = mb.get('pool'), tube = mb.get('emissive'), lampH = mb.get('lampHead');
    const gp = (x, z, y, size) => { const h = size / 2; pool.hrect(x - h, z - h, x + h, z + h, y, size, null, false, [-(x - h) / size, (z + h) / size]); };
    const washZ = (x, z, yc, w, h, facing) => { const A = [x - w / 2, yc - h / 2, z], B2 = [x + w / 2, yc - h / 2, z], C2 = [x + w / 2, yc + h / 2, z], D = [x - w / 2, yc + h / 2, z]; if (facing < 0) pool.quad(B2, A, D, C2); else pool.quad(A, B2, C2, D); };
    for (let f = 0; f < S.storeys; f++) for (let k = 0; k <= NR; k++) { if (f > 0 && k % 2) continue; const x = mx0 + k * RW + RW / 2 - (k === NR ? 0.8 : 0); const yb = yF(f);
      tube.box(x, yb + 2.62, zc - 0.06, 1.22, 0.05, 0.05, { col: [1, 0.98, 0.94] }); metal.box(x, yb + 2.62, zc - 0.025, 1.3, 0.07, 0.03, { col: C('#d8d8d4') });
      gp(x, mz0 + 1.25, yb + (f ? 0.012 : 0.31), 3.4); washZ(x, zc - 0.02, yb + 1.9, 3.2, 2.0, -1); }
    for (const px of [G.x0 - 0.35, G.x1 + 0.35]) { // bracket lanterns on the street face of the gate pillars (below the name arch)
      const lz = wz0 - 0.35 - 0.2; lampH.box(px, y0 + 3.2, lz, 0.22, 0.32, 0.22, { bottom: true }); for (const [ex, ez] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) metal.box(px + ex * 0.12, y0 + 3.2, lz + ez * 0.12, 0.03, 0.36, 0.03, { col: C(IRON) });
      metal.box(px, y0 + 3.4, lz, 0.32, 0.05, 0.32, { col: C(IRON) }); metal.box(px, y0 + 3.48, wz0 - 0.35 - 0.1, 0.05, 0.05, 0.22, { col: C(IRON) });
      gp(px, wz0 - 2.4, y0 + 0.03, 6.0); }
    for (const px of [G.x0 - 0.35, G.x1 + 0.35]) gp(px, wz0 + 2.4, y0 + 0.03, 4.0); // drive side, from the hut and corridor spill
    const [hx0, hx1, hz0, hz1] = S.hut; // hut: bulb over the door, lit window (panel between the dark backing and the glass)
    lampH.box(hx1 + 0.1, y0 + 2.32, hz1 - 0.6, 0.12, 0.12, 0.12, { bottom: true }); gp(hx1 + 1.2, hz1 - 0.6, y0 + 0.03, 3.4);
    lampH.box((hx0 + hx1) / 2, y0 + 1.55, hz0 - 0.011, 1.5, 0.8, 0.004); gp((hx0 + hx1) / 2, hz0 - 1.3, y0 + 0.03, 2.6); }
  return { top };
}
