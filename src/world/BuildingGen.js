// Converts building descriptors into geometry. "Base" = silhouette + facades (always loaded),
// "detail" = parapets, cornices, colonnades, awnings, signs, balconies, tanks, AC units (streamed near the player).
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { LAND_Y } from './Layout.js';
import { FLOOR_H, GROUND_H } from './CityPlan.js';
import { SIGN_COLS, SIGN_ROWS, SIGNS } from '../gfx/Textures.js';

const BAY = 3.2;
const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
// Wall sides in CCW order, each with outward direction
function sides(x0, x1, z0, z1) {
  return [
    { id: 'S', a: [x0, z1], b: [x1, z1], n: [0, 1], len: x1 - x0 },
    { id: 'E', a: [x1, z1], b: [x1, z0], n: [1, 0], len: z1 - z0 },
    { id: 'N', a: [x1, z0], b: [x0, z0], n: [0, -1], len: x1 - x0 },
    { id: 'W', a: [x0, z0], b: [x0, z1], n: [-1, 0], len: z1 - z0 },
  ];
}
function facadeWall(mb, s, y0, y1, uOff, vStart, color) {
  const u0 = uOff, u1 = uOff + s.len / (4 * BAY);
  const v0 = (y0 - vStart) / (2 * FLOOR_H), v1 = (y1 - vStart) / (2 * FLOOR_H);
  mb.wall(s.a[0], s.a[1], s.b[0], s.b[1], y0, y1, [u0, v0, u1, v1], color);
}
function shopWall(mb, s, y0, y1, row, colIdx) {
  const n = Math.max(1, Math.round(s.len / 5));
  const v0 = 1 - (row + 1) / 8 + 0.002, v1 = 1 - row / 8 - 0.002;
  const u0 = colIdx / 4, u1 = colIdx / 4 + n / 4;
  mb.wall(s.a[0], s.a[1], s.b[0], s.b[1], y0, y1, [u0, v0, u1, v1], [1, 1, 1]);
}
function hipRoof(mb, x0, x1, z0, z1, y, rise, overhang, color) {
  x0 -= overhang; x1 += overhang; z0 -= overhang; z1 += overhang;
  const w = x1 - x0, d = z1 - z0; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const ridgeHalf = Math.max(0, (Math.max(w, d) - Math.min(w, d)) / 2);
  let r0, r1;
  if (w >= d) { r0 = [cx - ridgeHalf, y + rise, cz]; r1 = [cx + ridgeHalf, y + rise, cz]; }
  else { r0 = [cx, y + rise, cz - ridgeHalf]; r1 = [cx, y + rise, cz + ridgeHalf]; }
  const A = [x0, y, z1], B = [x1, y, z1], C = [x1, y, z0], D = [x0, y, z0];
  const s = 0.25; // uv scale (tile texture repeats every 4 m)
  if (w >= d) {
    mb.quad(A, B, r1, r0, [0, 0, w * s, d * 0.5 * s * 1.3], color); // south slope
    mb.quad(C, D, r0, r1, [0, 0, w * s, d * 0.5 * s * 1.3], color); // north slope
    tri(mb, B, C, r1, color); tri(mb, D, A, r0, color);
  } else {
    mb.quad(B, C, r0, r1, [0, 0, d * s, w * 0.5 * s * 1.3], color);
    mb.quad(D, A, r1, r0, [0, 0, d * s, w * 0.5 * s * 1.3], color);
    tri(mb, A, B, r1, color); tri(mb, C, D, r0, color);
  }
  // soffit
  mb.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 0, 1, 1], [0.55, 0.5, 0.45]);
}
function tri(mb, a, b, c, color) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
  const i0 = mb.vert(a[0], a[1], a[2], nx / l, ny / l, nz / l, 0, 0, color), i1 = mb.vert(b[0], b[1], b[2], nx / l, ny / l, nz / l, 1, 0, color), i2 = mb.vert(c[0], c[1], c[2], nx / l, ny / l, nz / l, 0.5, 1, color);
  mb.idx.push(i0, i1, i2);
}
function gableRoof(mb, x0, x1, z0, z1, y, rise, color, alongX = true) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (alongX) {
    mb.quad([x0, y, z1], [x1, y, z1], [x1, y + rise, cz], [x0, y + rise, cz], [0, 0, (x1 - x0) / 4, 1], color);
    mb.quad([x1, y, z0], [x0, y, z0], [x0, y + rise, cz], [x1, y + rise, cz], [0, 0, (x1 - x0) / 4, 1], color);
    tri(mb, [x1, y, z1], [x1, y, z0], [x1, y + rise, cz], color); tri(mb, [x0, y, z0], [x0, y, z1], [x0, y + rise, cz], color);
  } else {
    mb.quad([x1, y, z1], [x1, y, z0], [cx, y + rise, z0], [cx, y + rise, z1], [0, 0, (z1 - z0) / 4, 1], color);
    mb.quad([x0, y, z0], [x0, y, z1], [cx, y + rise, z1], [cx, y + rise, z0], [0, 0, (z1 - z0) / 4, 1], color);
    tri(mb, [x0, y, z1], [x1, y, z1], [cx, y + rise, z1], color); tri(mb, [x1, y, z0], [x0, y, z0], [cx, y + rise, z0], color);
  }
}

export function buildBase(b, multi) {
  const paint = col(b.color || '#ffffff');
  const fac = multi.get('f_' + b.style);
  const y0 = LAND_Y; const hasGround = b.groundRow != null; const yTop = y0 + b.h;
  for (const s of sides(b.x0, b.x1, b.z0, b.z1)) {
    if (s.len < 0.1) continue;
    const front = s.id === b.front;
    if (hasGround) {
      if (front) shopWall(multi.get('shops'), s, y0, y0 + GROUND_H, b.groundRow, b.groundCol || 0);
      else facadeWall(fac, s, y0, y0 + GROUND_H, b.uOff || 0, y0 + GROUND_H - 2 * FLOOR_H, paint);
      facadeWall(fac, s, y0 + GROUND_H, yTop, b.uOff || 0, y0 + GROUND_H, paint);
    } else facadeWall(fac, s, y0, yTop, b.uOff || 0, y0, paint);
  }
  // roof
  const roofCol = [0.78, 0.76, 0.72];
  if (b.roof === 'tile') hipRoof(multi.get('roofTiles'), b.x0, b.x1, b.z0, b.z1, yTop, Math.min(b.x1 - b.x0, b.z1 - b.z0) * 0.32, 0.7, [1, 1, 1]);
  else if (b.roof === 'corrugated') { gableRoof(multi.get('corrugated'), b.x0 - 0.3, b.x1 + 0.3, b.z0 - 0.3, b.z1 + 0.3, yTop, b.style === 'warehouse' ? 2.5 : 1.0, [1, 1, 1], (b.x1 - b.x0) >= (b.z1 - b.z0)); }
  else multi.get('roofFlat').hrect(b.x0, b.z0, b.x1, b.z1, yTop, 6, roofCol);
  // tower on podium
  if (b.tower) {
    const t = b.tower, i = t.inset; const tx0 = b.x0 + i, tx1 = b.x1 - i, tz0 = b.z0 + i, tz1 = b.z1 - i;
    const th = t.floors * FLOOR_H; const tfac = multi.get('f_' + t.style); const tc = col(t.color || '#fff');
    for (const s of sides(tx0, tx1, tz0, tz1)) facadeWall(tfac, s, yTop, yTop + th, 0, yTop, tc);
    multi.get('roofFlat').hrect(tx0, tz0, tx1, tz1, yTop + th, 6, roofCol);
    if (t.crown) { const ci = Math.min(tx1 - tx0, tz1 - tz0) * 0.2; multi.get('concrete').box((tx0 + tx1) / 2, yTop + th + 2, (tz0 + tz1) / 2, tx1 - tx0 - ci, 4, tz1 - tz0 - ci, { col: [0.85, 0.86, 0.88], uvScale: 4 }); }
  }
}

const AWNING = ['#2f6fa8', '#d9682a', '#3f8f4a', '#b8322f', '#e3b23c', '#5b5b9a', '#1f8a8a', '#c0c0c0', '#7a3f2a'];
const TANK = ['#1b1b1b', '#1d3f7a', '#222222', '#e8e8e2', '#2a2a2a'];
function signUV(idx) {
  const n = SIGN_COLS * SIGN_ROWS; idx = ((idx % n) + n) % n;
  const c = idx % SIGN_COLS, r = Math.floor(idx / SIGN_COLS);
  return [c / SIGN_COLS + 0.002, 1 - (r + 1) / SIGN_ROWS + 0.002, (c + 1) / SIGN_COLS - 0.002, 1 - r / SIGN_ROWS - 0.002];
}
export function buildDetail(b, multi) {
  const rng = new RNG(5000 + b.id * 13);
  const paint = col(b.color || '#ffffff'); const darker = paint.map((v) => v * 0.86);
  const y0 = LAND_Y, yTop = y0 + b.h; const conc = multi.get('concrete');
  const sd = sides(b.x0, b.x1, b.z0, b.z1); const front = sd.find((s) => s.id === b.front) || sd[0];
  const along = (s, t) => [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
  const rotOf = (s) => Math.atan2(s.n[0], s.n[1]);
  // parapet (flat roofs)
  if (b.roof === 'flat' || !b.roof) {
    const ph = b.style === 'villa' ? 0.5 : 0.9, th = 0.25;
    conc.box((b.x0 + b.x1) / 2, yTop + ph / 2, b.z0 + th / 2, b.x1 - b.x0, ph, th, { col: darker, uvScale: 3 });
    conc.box((b.x0 + b.x1) / 2, yTop + ph / 2, b.z1 - th / 2, b.x1 - b.x0, ph, th, { col: darker, uvScale: 3 });
    conc.box(b.x0 + th / 2, yTop + ph / 2, (b.z0 + b.z1) / 2, th, ph, b.z1 - b.z0, { col: darker, uvScale: 3 });
    conc.box(b.x1 - th / 2, yTop + ph / 2, (b.z0 + b.z1) / 2, th, ph, b.z1 - b.z0, { col: darker, uvScale: 3 });
  }
  // cornices / string courses on heritage buildings
  if (b.cornice) {
    const ext = 0.35;
    for (const yy of [y0 + GROUND_H, yTop - 0.3]) conc.box((b.x0 + b.x1) / 2, yy, (b.z0 + b.z1) / 2, b.x1 - b.x0 + ext * 2, 0.45, b.z1 - b.z0 + ext * 2, { col: paint.map((v) => v * 0.95), uvScale: 3, bottom: true });
    if (b.style === 'colonial') { // balustrade + pediment over the front
      const s = front, mid = along(s, 0.5); const r = rotOf(s);
      conc.box(mid[0] + s.n[0] * 0.2, yTop + 1.4, mid[1] + s.n[1] * 0.2, Math.min(s.len * 0.4, 14), 1.6, 0.5, { col: paint, rotY: r, uvScale: 3 });
    }
  }
  if (b.colonnade) { // Fort arcades
    const s = front, n = Math.max(2, Math.floor(s.len / 4)); const r = rotOf(s);
    for (let k = 0; k <= n; k++) { const p = along(s, k / n); conc.cylinder(p[0] + s.n[0] * 0.6, y0, p[1] + s.n[1] * 0.6, 0.32, 0.28, GROUND_H, 10, { col: paint, caps: false }); }
    const mid = along(s, 0.5); conc.box(mid[0] + s.n[0] * 0.6, y0 + GROUND_H + 0.2, mid[1] + s.n[1] * 0.6, s.len + 0.8, 0.4, 1.6, { col: paint, rotY: r, uvScale: 3, bottom: true });
  }
  // storefront dressing: awnings + trilingual signs
  if (b.groundRow != null && b.groundRow !== 5 && b.groundRow !== 4 || b.sign != null) {
    const s = front; const n = Math.max(1, Math.round(s.len / 5)); const r = rotOf(s);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n; const pa = along(s, t0 + 0.02), pb = along(s, t1 - 0.02);
      if (b.awning) {
        const c = col(rng.pick(AWNING)); const yA = y0 + GROUND_H - 0.75, yB = yA - 0.7, d = rng.range(1.3, 1.9);
        multi.get('awning').quad([pa[0] + s.n[0] * d, yB, pa[1] + s.n[1] * d], [pb[0] + s.n[0] * d, yB, pb[1] + s.n[1] * d], [pb[0], yA, pb[1]], [pa[0], yA, pa[1]], [0, 0, 2, 1], c);
        if (rng.chance(0.5)) { // corrugated metal awning instead: add front valance
          multi.get('awning').quad([pa[0] + s.n[0] * d, yB - 0.25, pa[1] + s.n[1] * d], [pb[0] + s.n[0] * d, yB - 0.25, pb[1] + s.n[1] * d], [pb[0] + s.n[0] * d, yB, pb[1] + s.n[1] * d], [pa[0] + s.n[0] * d, yB, pa[1] + s.n[1] * d], [0, 0, 2, 0.2], c.map((v) => v * 0.8));
        }
      }
    }
    // planned signage: one business per building (two on wide frontages), each sign centred over its own frontage at the
    // atlas' true 4:1 aspect (never stretched), on a dark mounting board just above the awning line
    const signs = b.sign == null || rng.chance(0.15) ? 0 : s.len >= 16 ? 2 : 1;
    for (let k = 0; k < signs; k++) {
      const idx = k === 0 ? b.sign : b.sign + 7 + (b.id % 5); const half = s.len / signs; const room = half - 0.8; if (room < 1.6) continue;
      const hS = Math.min(1.15, room / 4), wS = hS * 4; const tc = (k + 0.5) / signs; const dt = (wS / 2) / s.len;
      const qa = along(s, tc - dt), qb = along(s, tc + dt); const ys0 = y0 + GROUND_H - 0.5, ys1 = ys0 + hS; const o = 0.14; const uv = signUV(idx);
      multi.get('signs').quad([qa[0] + s.n[0] * o, ys0, qa[1] + s.n[1] * o], [qb[0] + s.n[0] * o, ys0, qb[1] + s.n[1] * o], [qb[0] + s.n[0] * o, ys1, qb[1] + s.n[1] * o], [qa[0] + s.n[0] * o, ys1, qa[1] + s.n[1] * o], uv);
      conc.box((qa[0] + qb[0]) / 2 + s.n[0] * 0.07, (ys0 + ys1) / 2, (qa[1] + qb[1]) / 2 + s.n[1] * 0.07, wS + 0.12, hS + 0.12, 0.12, { col: [0.2, 0.2, 0.2], rotY: r });
      b.signIdx = b.signIdx ?? idx;
    }
    // projecting vertical sign on some market buildings
    if (b.district === 'pettah' && b.signIdx != null && rng.chance(0.12) && b.floors >= 2) { // blade sign repeats the same business
      const p = along(s, rng.chance(0.5) ? 0.08 : 0.92); const uv = signUV(b.signIdx); const yb = y0 + GROUND_H + 0.6, yt = yb + 0.65; // 2.6 m × 0.65 m = the atlas' 4:1
      const tx = -s.n[1], tz = s.n[0]; // tangent direction
      const ox = p[0] + s.n[0] * 0.15, oz = p[1] + s.n[1] * 0.15;
      // two faces (each reads correctly from its own side) around a thin dark frame, plus a wall bracket
      const e = 0.035, ex = ox + s.n[0] * 2.6, ez = oz + s.n[1] * 2.6;
      multi.get('signs').quad([ox + tx * e, yb, oz + tz * e], [ex + tx * e, yb, ez + tz * e], [ex + tx * e, yt, ez + tz * e], [ox + tx * e, yt, oz + tz * e], uv);
      multi.get('signs').quad([ex - tx * e, yb, ez - tz * e], [ox - tx * e, yb, oz - tz * e], [ox - tx * e, yt, oz - tz * e], [ex - tx * e, yt, ez - tz * e], uv);
      const r2 = rotOf(s); conc.box((ox + ex) / 2, (yb + yt) / 2, (oz + ez) / 2, e * 1.7, yt - yb + 0.08, 2.68, { col: [0.16, 0.16, 0.17], rotY: r2 });
      conc.box(p[0] + s.n[0] * 0.08, yt + 0.08, p[1] + s.n[1] * 0.08, 0.06, 0.06, 0.3, { col: [0.2, 0.2, 0.2], rotY: r2 });
    }
  }
  // balconies on the front
  if (b.balconies && b.floors >= 2) {
    const s = front; const r = rotOf(s); const bays = Math.max(1, Math.floor(s.len / BAY));
    const startF = b.groundRow != null ? 1 : 1;
    for (let f = startF; f < b.floors; f++) for (let k = 0; k < bays; k++) {
      if ((k + f) % 2 && !rng.chance(0.3)) continue;
      const p = along(s, (k + 0.5) / bays); const yb = y0 + (b.groundRow != null ? GROUND_H : 0) + (f - (b.groundRow != null ? 1 : 0)) * FLOOR_H + 0.05;
      if (yb > yTop - 1) continue;
      const w = Math.min(BAY * 0.9, s.len / bays - 0.3), d = 0.95;
      conc.box(p[0] + s.n[0] * d / 2, yb, p[1] + s.n[1] * d / 2, w, 0.16, d, { col: darker, rotY: r, bottom: true });
      multi.get('metal').box(p[0] + s.n[0] * d, yb + 0.5, p[1] + s.n[1] * d, w, 0.9, 0.05, { col: [0.18, 0.18, 0.18], rotY: r });
      if (rng.chance(0.15)) multi.get('paint').box(p[0] + s.n[0] * (d - 0.2), yb + 0.5, p[1] + s.n[1] * (d - 0.2), 0.4, 0.6, 0.3, { col: col(rng.pick(['#3a7d44', '#9b2d20', '#e0b030'])), rotY: r }); // potted plant/box
    }
  }
  // AC units on side walls
  for (const s of sd) {
    if (s.id === b.front || s.len < 4 || b.style === 'villa') continue;
    const n = rng.int(0, Math.min(4, b.floors));
    for (let k = 0; k < n; k++) {
      const p = along(s, rng.range(0.15, 0.85)); const yy = y0 + rng.range(3, Math.max(3.2, b.h - 1));
      multi.get('paint').box(p[0] + s.n[0] * 0.2, yy, p[1] + s.n[1] * 0.2, 0.85, 0.6, 0.35, { col: [0.9, 0.9, 0.88], rotY: rotOf(s) });
    }
  }
  // roof clutter: water tanks, stair hut, dish
  if ((b.roof === 'flat' || !b.roof) && !b.tower) {
    if (b.tanks || rng.chance(0.4)) {
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) {
        const tx = rng.range(b.x0 + 1.2, b.x1 - 1.2), tz = rng.range(b.z0 + 1.2, b.z1 - 1.2);
        multi.get('metal').box(tx, yTop + 0.5, tz, 1.3, 1.0, 1.3, { col: [0.25, 0.25, 0.25] });
        multi.get('paint').cylinder(tx, yTop + 1.0, tz, 0.62, 0.6, 1.25, 12, { col: col(rng.pick(TANK)) });
      }
    }
    if (b.floors >= 3 && (b.x1 - b.x0) > 6 && (b.z1 - b.z0) > 6) conc.box(b.x0 + 2, yTop + 1.3, b.z0 + 2, 2.6, 2.6, 2.6, { col: darker, uvScale: 3 });
    if (rng.chance(0.3)) { const dx = rng.range(b.x0 + 1, b.x1 - 1), dz = rng.range(b.z0 + 1, b.z1 - 1); multi.get('paint').cylinder(dx, yTop + 0.9, dz, 0.45, 0.05, 0.25, 10, { col: [0.85, 0.85, 0.85] }); multi.get('metal').box(dx, yTop + 0.45, dz, 0.06, 0.9, 0.06, { col: [0.4, 0.4, 0.4] }); }
  }
  // villa porch
  if (b.porch) {
    const s = front; const mid = along(s, 0.5); const r = rotOf(s);
    conc.box(mid[0] + s.n[0] * 1.4, y0 + 2.9, mid[1] + s.n[1] * 1.4, 4.2, 0.2, 2.8, { col: paint, rotY: r, bottom: true });
    for (const t of [0.5 - 1.9 / s.len, 0.5 + 1.9 / s.len]) { const p = along(s, t); conc.cylinder(p[0] + s.n[0] * 2.6, y0, p[1] + s.n[1] * 2.6, 0.16, 0.16, 2.8, 8, { col: paint, caps: false }); }
    conc.box(mid[0] + s.n[0] * 1.4, y0 + 0.1, mid[1] + s.n[1] * 1.4, 4.4, 0.2, 3, { col: [0.75, 0.7, 0.65], rotY: r });
  }
}
export function buildWall(w, multi) {
  const c = col(w.col); const conc = multi.get('concrete');
  conc.box((w.x0 + w.x1) / 2, LAND_Y + w.h / 2, (w.z0 + w.z1) / 2, w.x1 - w.x0, w.h, w.z1 - w.z0, { col: c, uvScale: 2 });
  conc.box((w.x0 + w.x1) / 2, LAND_Y + w.h + 0.05, (w.z0 + w.z1) / 2, w.x1 - w.x0 + 0.08, 0.1, w.z1 - w.z0 + 0.12, { col: c.map((v) => v * 0.85), uvScale: 2 });
}
