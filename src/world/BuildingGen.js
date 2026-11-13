// Converts building descriptors into geometry. "Base" = silhouette + facades (always loaded),
// "detail" = parapets, cornices, colonnades, awnings, signs, balconies, tanks, AC units (streamed near the player).
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { LAND_Y } from './Layout.js';
import { FLOOR_H, GROUND_H } from './CityPlan.js';
import { dressFort, fortCrown, fortHeritage } from './FortStyle.js';
import { dressDistrict } from './DistrictStyle.js';
import { SIGN_COLS, SIGN_ROWS, SIGNS, FACADE_WINDOWS } from '../gfx/Textures.js';

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
// Free-standing front columns (world x, z, radius): villa porch columns and Fort arcade columns. The meshes in buildDetail
// and the colliders registered by World both come from here, so every column you can see is solid.
function frontSide(b) { const sd = sides(b.x0, b.x1, b.z0, b.z1); return sd.find((q) => q.id === b.front) || sd[0]; }
export function porchPillars(b) {
  if (!b.porch) return [];
  const s = frontSide(b);
  return [0.5 - 1.9 / s.len, 0.5 + 1.9 / s.len].map((t) => [s.a[0] + (s.b[0] - s.a[0]) * t + s.n[0] * 2.6, s.a[1] + (s.b[1] - s.a[1]) * t + s.n[1] * 2.6, 0.16]);
}
export function colonnadeColumns(b) {
  if (!b.colonnade) return [];
  const s = frontSide(b), n = Math.max(2, Math.floor(s.len / 4)), out = [];
  for (let k = 0; k <= n; k++) out.push([s.a[0] + (s.b[0] - s.a[0]) * k / n + s.n[0] * 0.6, s.a[1] + (s.b[1] - s.a[1]) * k / n + s.n[1] * 0.6, 0.32]);
  return out;
}
export const frontColumns = (b) => porchPillars(b).concat(colonnadeColumns(b));
function facadeWall(mb, s, y0, y1, uOff, vStart, color) {
  const u0 = uOff, u1 = uOff + s.len / (4 * BAY);
  const v0 = (y0 - vStart) / (2 * FLOOR_H), v1 = (y1 - vStart) / (2 * FLOOR_H);
  mb.wall(s.a[0], s.a[1], s.b[0], s.b[1], y0, y1, [u0, v0, u1, v1], color);
}
function shopWall(mb, s, y0, y1, row, colIdx, bid = 0, hole = null) {
  const n = Math.max(1, Math.round(s.len / 5));
  const v0 = 1 - (row + 1) / 8 + 0.002, v1 = 1 - row / 8 - 0.002;
  // + a whole number of atlas widths per building (the atlas repeats, so it samples the same) → floor(u·4) is a unique
  // id for every shop unit, used by the night shader (each shop keeps its own hours and shutter)
  const K = 1 + (bid % 97); const u0 = K + colIdx / 4, u1 = K + colIdx / 4 + n / 4;
  if (!hole) { mb.wall(s.a[0], s.a[1], s.b[0], s.b[1], y0, y1, [u0, v0, u1, v1], [1, 1, 1]); return; }
  // walk-in shop (WalkIn.js): the doorway is a real opening — left / right of it and the lintel above, same atlas mapping
  const P = (t) => [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t], U = (t) => u0 + (u1 - u0) * t, V = (y) => v0 + (v1 - v0) * (y - y0) / (y1 - y0);
  const ta = hole.t - hole.w / 2 / s.len, tb = hole.t + hole.w / 2 / s.len, yh = y0 + hole.h;
  const q = (t0, t1, ya, yb) => { const A = P(t0), B = P(t1); mb.wall(A[0], A[1], B[0], B[1], ya, yb, [U(t0), V(ya), U(t1), V(yb)], [1, 1, 1]); };
  q(0, ta, y0, y1); q(tb, 1, y0, y1); q(ta, tb, yh, y1);
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

// quad with per-vertex colours, wound so it faces `want` (a direction vector)
function gquad(mb, P, C, want) {
  const [a, b, , d] = P; const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  let idx = [0, 1, 2, 3]; if (nx * want[0] + ny * want[1] + nz * want[2] < 0) { idx = [0, 3, 2, 1]; nx = -nx; ny = -ny; nz = -nz; }
  const l = Math.hypot(nx, ny, nz) || 1; const v = idx.map((k) => mb.vert(P[k][0], P[k][1], P[k][2], nx / l, ny / l, nz / l, 0, 0, C[k]));
  mb.idx.push(v[0], v[1], v[2], v[0], v[2], v[3]);
}
// Contact ambient occlusion where a building meets the ground: a gradient band up the bottom 1.5 m of each wall and a
// matching falloff on the paving beside it. Multiplied (MAT.ao), so it reads as real occlusion on every quality preset.
const AO_H = [0, 0.25, 0.7, 1.5], AO_C = [0.56, 0.76, 0.92, 1];
function contactAO(mb, s, y0) {
  const ox = s.n[0] * 0.012, oz = s.n[1] * 0.012; const g = (v) => [v, v, v]; const want = [s.n[0], 0, s.n[1]];
  for (let k = 0; k < 3; k++) {
    const ya = y0 + AO_H[k], yb = y0 + AO_H[k + 1];
    gquad(mb, [[s.a[0] + ox, ya, s.a[1] + oz], [s.b[0] + ox, ya, s.b[1] + oz], [s.b[0] + ox, yb, s.b[1] + oz], [s.a[0] + ox, yb, s.a[1] + oz]], [g(AO_C[k]), g(AO_C[k]), g(AO_C[k + 1]), g(AO_C[k + 1])], want);
  }
  const W = [0, 0.35, 1.1], WC = [0.6, 0.84, 1], yy = y0 + 0.014;
  for (let k = 0; k < 2; k++) {
    const pa = (w) => [s.a[0] + s.n[0] * w, yy, s.a[1] + s.n[1] * w], pb = (w) => [s.b[0] + s.n[0] * w, yy, s.b[1] + s.n[1] * w];
    gquad(mb, [pa(W[k]), pb(W[k]), pb(W[k + 1]), pa(W[k + 1])], [g(WC[k]), g(WC[k]), g(WC[k + 1]), g(WC[k + 1])], [0, 1, 0]);
  }
}
// Façade variant per building: style names stay as they are (gardens, birds, roofs, the map editor key off them); only the
// texture differs. Hashed from the footprint so it is stable across reloads and works for editor-placed buildings.
const FAC_VARIANTS = { office: ['office', 'office2', 'office3'], apartment: ['apartment', 'apartment2'], shop2: ['shop2', 'shop3'], shop: ['shop', 'shop', 'shop3'], glass: ['glass', 'glass3'], glass2: ['glass2', 'office3'] };
export function facKey(style, b, salt = 0) { const v = FAC_VARIANTS[style]; if (!v) return style;
  const h = (Math.imul(Math.round(b.x0 * 10) + salt * 977, 73856093) ^ Math.imul(Math.round(b.z0 * 10), 19349663)) >>> 0; return v[h % v.length]; }
// Stage 1 colour: sun-bleached / lichen-dulled Calicut tiles and aged sheet roofs (vertex tint over the shared texture —
// no new texture or material). Cool tints pull the terracotta / rust toward grey; the Port's sheds get the least rust.
const TILE_TONES = [[0.86, 0.84, 0.82], [0.8, 0.8, 0.8], [0.9, 0.86, 0.82], [0.76, 0.77, 0.78], [0.84, 0.83, 0.84]];
const SHEET_TONES = [[0.92, 0.93, 0.94], [0.86, 0.87, 0.88], [0.95, 0.94, 0.92], [0.82, 0.84, 0.86]];
const SHEET_TONES_PORT = [[0.84, 0.9, 0.95], [0.8, 0.86, 0.9], [0.88, 0.92, 0.95]];
function roofTone(b, T) { return T[((b.id || 0) * 7 + 3) % T.length]; }
export function buildBase(b, multi) {
  const paint = col(b.color || '#ffffff');
  const fac = multi.get('f_' + facKey(b.style, b));
  const y0 = LAND_Y; const hasGround = b.groundRow != null; const yTop = y0 + b.h;
  for (const s of sides(b.x0, b.x1, b.z0, b.z1)) {
    if (s.len < 0.1) continue;
    const front = s.id === b.front;
    if (hasGround) {
      if (front) shopWall(multi.get('shops'), s, y0, y0 + GROUND_H, b.groundRow, b.groundCol || 0, b.id || 0, b.walkIn || null);
      else facadeWall(fac, s, y0, y0 + GROUND_H, b.uOff || 0, y0 + GROUND_H - 2 * FLOOR_H, paint);
      facadeWall(fac, s, y0 + GROUND_H, yTop, b.uOff || 0, y0 + GROUND_H, paint);
    } else facadeWall(fac, s, y0, yTop, b.uOff || 0, y0, paint);
    contactAO(multi.get('ao'), s, y0);
  }
  // roof
  const roofCol = [0.78, 0.76, 0.72];
  if (b.roof === 'tile') hipRoof(multi.get('roofTiles'), b.x0, b.x1, b.z0, b.z1, yTop, Math.min(b.x1 - b.x0, b.z1 - b.z0) * 0.32, 0.7, roofTone(b, TILE_TONES));
  else if (b.roof === 'corrugated') { gableRoof(multi.get('corrugated'), b.x0 - 0.3, b.x1 + 0.3, b.z0 - 0.3, b.z1 + 0.3, yTop, b.style === 'warehouse' ? 2.5 : 1.0, roofTone(b, b.district === 'port' ? SHEET_TONES_PORT : SHEET_TONES), (b.x1 - b.x0) >= (b.z1 - b.z0)); }
  else multi.get('roofFlat').hrect(b.x0, b.z0, b.x1, b.z1, yTop, 6, roofCol);
  // tower on podium
  if (b.tower) {
    const t = b.tower, i = t.inset; const tx0 = b.x0 + i, tx1 = b.x1 - i, tz0 = b.z0 + i, tz1 = b.z1 - i;
    const th = t.floors * FLOOR_H; const tfac = multi.get('f_' + facKey(t.style, b, 7)); const tc = col(t.color || '#fff');
    for (const s of sides(tx0, tx1, tz0, tz1)) facadeWall(tfac, s, yTop, yTop + th, 0, yTop, tc);
    multi.get('roofFlat').hrect(tx0, tz0, tx1, tz1, yTop + th, 6, roofCol);
    { // rooftop services: parapet, lift overrun, plant units, tanks, antenna (seeded per building)
      const ry = yTop + th, w = tx1 - tx0, d = tz1 - tz0, cx = (tx0 + tx1) / 2, cz = (tz0 + tz1) / 2, cc = multi.get('concrete'), mt = multi.get('metal');
      const rr = new RNG(9100 + (b.id || 0) * 7); const pc = [0.72, 0.73, 0.74];
      cc.box(cx, ry + 0.55, tz0 + 0.15, w, 1.1, 0.3, { col: pc, uvScale: 3 }); cc.box(cx, ry + 0.55, tz1 - 0.15, w, 1.1, 0.3, { col: pc, uvScale: 3 });
      cc.box(tx0 + 0.15, ry + 0.55, cz, 0.3, 1.1, d, { col: pc, uvScale: 3 }); cc.box(tx1 - 0.15, ry + 0.55, cz, 0.3, 1.1, d, { col: pc, uvScale: 3 });
      if (!t.crown) {
        const lw = Math.min(8, w * 0.3), ld = Math.min(6, d * 0.25), lx = cx + rr.range(-0.15, 0.15) * w, lz = cz + rr.range(-0.15, 0.15) * d;
        cc.box(lx, ry + 2.2, lz, lw, 4.4, ld, { col: [0.8, 0.8, 0.79], uvScale: 3 }); // lift/stair overrun
        const nu = 2 + Math.floor(rr.next() * 4);
        for (let k = 0; k < nu; k++) { const ux = tx0 + 2.5 + rr.next() * (w - 5), uz = tz0 + 2.5 + rr.next() * (d - 5); if (Math.abs(ux - lx) < lw / 2 + 2 && Math.abs(uz - lz) < ld / 2 + 2) continue;
          mt.box(ux, ry + 0.9, uz, 2.6, 1.8, 1.6, { col: [0.62, 0.64, 0.66] }); mt.cylinder(ux - 0.6, ry + 1.8, uz, 0.5, 0.5, 0.12, 14, { col: [0.2, 0.2, 0.22] }); mt.cylinder(ux + 0.6, ry + 1.8, uz, 0.5, 0.5, 0.12, 14, { col: [0.2, 0.2, 0.22] }); }
        if (rr.chance(0.7)) { const kx = tx0 + 2 + rr.next() * (w - 4); mt.cylinder(kx, ry, tz1 - 2.5, 1.1, 1.1, 2.4, 16, { col: [0.85, 0.85, 0.83] }); mt.cylinder(kx + 2.6, ry, tz1 - 2.5, 1.1, 1.1, 2.4, 16, { col: [0.85, 0.85, 0.83] }); }
        if (rr.chance(0.6)) mt.cylinder(lx, ry + 4.4, lz, 0.08, 0.05, 9 + rr.next() * 8, 6, { col: [0.5, 0.5, 0.52] }); // antenna
      }
    }
    fortCrown(b, multi);
    if (t.crown) { const ci = Math.min(tx1 - tx0, tz1 - tz0) * 0.2; multi.get('concrete').box((tx0 + tx1) / 2, yTop + th + 2, (tz0 + tz1) / 2, tx1 - tx0 - ci, 4, tz1 - tz0 - ci, { col: [0.85, 0.86, 0.88], uvScale: 4 }); }
  }
}

// sun-faded canvas / PVC awnings and water tanks (black and dull-blue polyethylene, the odd grey-white one) — same counts
const AWNING = ['#4a6a86', '#b06a44', '#4d7652', '#94463f', '#c0a05a', '#5e5e7e', '#3e7474', '#a9aaa6', '#6e4a3a'];
const TANK = ['#1e1e1e', '#2c4560', '#262626', '#c9c9c2', '#2d2d2d'];
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
  const fortH = fortHeritage(b); const skipP = fortH ? b.front : null; // Fort heritage fronts get a real balustrade instead (FortStyle.js)
  if (b.roof === 'flat' || !b.roof) {
    const ph = b.style === 'villa' ? 0.5 : 0.9, th = 0.25;
    if (skipP !== 'N') conc.box((b.x0 + b.x1) / 2, yTop + ph / 2, b.z0 + th / 2, b.x1 - b.x0, ph, th, { col: darker, uvScale: 3 });
    if (skipP !== 'S') conc.box((b.x0 + b.x1) / 2, yTop + ph / 2, b.z1 - th / 2, b.x1 - b.x0, ph, th, { col: darker, uvScale: 3 });
    if (skipP !== 'W') conc.box(b.x0 + th / 2, yTop + ph / 2, (b.z0 + b.z1) / 2, th, ph, b.z1 - b.z0, { col: darker, uvScale: 3 });
    if (skipP !== 'E') conc.box(b.x1 - th / 2, yTop + ph / 2, (b.z0 + b.z1) / 2, th, ph, b.z1 - b.z0, { col: darker, uvScale: 3 });
  }
  // cornices / string courses on heritage buildings
  if (b.cornice) {
    const ext = 0.35;
    for (const yy of [y0 + GROUND_H, yTop - 0.3]) conc.box((b.x0 + b.x1) / 2, yy, (b.z0 + b.z1) / 2, b.x1 - b.x0 + ext * 2, 0.45, b.z1 - b.z0 + ext * 2, { col: paint.map((v) => v * 0.95), uvScale: 3, bottom: true });
    if (b.style === 'colonial' && !fortH) { // balustrade + pediment over the front
      const s = front, mid = along(s, 0.5); const r = rotOf(s);
      conc.box(mid[0] + s.n[0] * 0.2, yTop + 1.4, mid[1] + s.n[1] * 0.2, Math.min(s.len * 0.4, 14), 1.6, 0.5, { col: paint, rotY: r, uvScale: 3 });
    }
  }
  if (b.district === 'fort') dressFort(b, multi, { sd, front, paint }); // Colombo Fort benchmark district relief
  else dressDistrict(b, multi, { sd, front, paint, fk: facKey(b.style, b) }); // the rest of the city: vernacular relief per facade type (DistrictStyle.js)
  if (b.colonnade) { // Fort arcades
    const s = front, n = Math.max(2, Math.floor(s.len / 4)); const r = rotOf(s);
    for (const [px, pz] of colonnadeColumns(b)) conc.cylinder(px, y0, pz, 0.32, 0.28, GROUND_H, 10, { col: paint, caps: false }); // solid (World)
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
    const signs = b.sign == null || rng.chance(0.15) ? 0 : s.len >= 16 ? 2 : 1; b._signSpans = [];
    for (let k = 0; k < signs; k++) {
      const idx = k === 0 ? b.sign : b.sign + 7 + (b.id % 5); const half = s.len / signs; const room = half - 0.8; if (room < 1.6) continue;
      const hS = Math.min(1.15, room / 4), wS = hS * 4; const tc = (k + 0.5) / signs; const dt = (wS / 2) / s.len;
      const qa = along(s, tc - dt), qb = along(s, tc + dt); const ys0 = y0 + GROUND_H - 0.5, ys1 = ys0 + hS; const o = 0.14; const uv = signUV(idx);
      multi.get('signs').quad([qa[0] + s.n[0] * o, ys0, qa[1] + s.n[1] * o], [qb[0] + s.n[0] * o, ys0, qb[1] + s.n[1] * o], [qb[0] + s.n[0] * o, ys1, qb[1] + s.n[1] * o], [qa[0] + s.n[0] * o, ys1, qa[1] + s.n[1] * o], uv);
      conc.box((qa[0] + qb[0]) / 2 + s.n[0] * 0.07, (ys0 + ys1) / 2, (qa[1] + qb[1]) / 2 + s.n[1] * 0.07, wS + 0.12, hS + 0.12, 0.12, { col: [0.2, 0.2, 0.2], rotY: r });
      b.signIdx = b.signIdx ?? idx; (b._signSpans ||= []).push([(tc - dt) * s.len - 0.1, (tc + dt) * s.len + 0.1]);
    }
    // projecting vertical sign on some market buildings
    if (b.district === 'pettah' && b.signIdx != null && rng.chance(0.12) && b.floors >= 2) { // blade sign repeats the same business
      const edge = Math.min(0.5, 0.12 / s.len), p = along(s, rng.chance(0.5) ? edge : 1 - edge); const uv = signUV(b.signIdx); /* on the pier at the building edge: clear of every window reveal and balcony */ const yb = y0 + GROUND_H + 0.6, yt = yb + 0.65; // 2.6 m × 0.65 m = the atlas' 4:1
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
      if (f === startF && b._signSpans) { const c0 = (k + 0.5) / bays * s.len, hw = Math.min(BAY * 0.9, s.len / bays - 0.3) / 2; if (b._signSpans.some(([a1, b1]) => c0 + hw > a1 && c0 - hw < b1)) continue; } // no balcony slab through the shop sign below it
      const p = along(s, (k + 0.5) / bays); const yb = y0 + (b.groundRow != null ? GROUND_H : 0) + (f - (b.groundRow != null ? 1 : 0)) * FLOOR_H + 0.05;
      if (yb > yTop - 1) continue;
      const w = Math.min(BAY * 0.9, s.len / bays - 0.3), d = 0.95;
      conc.box(p[0] + s.n[0] * d / 2, yb, p[1] + s.n[1] * d / 2, w, 0.16, d, { col: darker, rotY: r, bottom: true });
      // balustrade: a rendered parapet wall or a painted steel railing (top/bottom rail + balusters), front and both returns
      const tx = -s.n[1], tz = s.n[0]; const solidWall = rng.chance(0.4);
      const side = (along, depth, len, rot) => [p[0] + tx * along + s.n[0] * depth, p[1] + tz * along + s.n[1] * depth, len, rot];
      const runs = [side(0, d - 0.03, w, r), side(-w / 2 + 0.03, d / 2, d, r + Math.PI / 2), side(w / 2 - 0.03, d / 2, d, r + Math.PI / 2)];
      for (const [qx, qz, len, rot] of runs) {
        if (solidWall) { conc.box(qx, yb + 0.53, qz, len, 0.9, 0.1, { col: paint.map((v) => v * 0.97), rotY: rot, uvScale: 2 }); continue; }
        const rc = [0.12, 0.12, 0.12], mt = multi.get('metal');
        mt.box(qx, yb + 1.0, qz, len, 0.05, 0.06, { col: rc, rotY: rot, bottom: true }); mt.box(qx, yb + 0.16, qz, len, 0.04, 0.04, { col: rc, rotY: rot });
        const nb = Math.max(2, Math.round(len / 0.2)), cr = Math.cos(rot), sr = Math.sin(rot);
        for (let k = 0; k <= nb; k++) { const o = -len / 2 + (k / nb) * len; mt.box(qx + o * cr, yb + 0.58, qz - o * sr, 0.022, 0.82, 0.022, { col: rc, top: false }); }
      }
      if (rng.chance(0.15)) multi.get('paint').box(p[0] + s.n[0] * (d - 0.2), yb + 0.5, p[1] + s.n[1] * (d - 0.2), 0.4, 0.6, 0.3, { col: col(rng.pick(['#3a7d44', '#9b2d20', '#e0b030'])), rotY: r }); // potted plant/box
    }
  }
  // AC units on side walls
  for (const s of sd) {
    if (s.id === b.front || s.len < 4 || b.style === 'villa') continue;
    const n = rng.int(0, Math.min(4, b.floors));
    for (let k = 0; k < n; k++) {
      const p = along(s, rng.range(0.15, 0.85)); const yy = y0 + rng.range(3, Math.max(3.2, b.h - 1));
      const r = rotOf(s), tx = -s.n[1], tz = s.n[0], pm = multi.get('paint'), mt = multi.get('metal'); // split-AC condenser: casing, fan grille + hub, wall brackets
      pm.box(p[0] + s.n[0] * 0.22, yy, p[1] + s.n[1] * 0.22, 0.85, 0.6, 0.32, { col: [0.9, 0.9, 0.88], rotY: r });
      const fx = p[0] + s.n[0] * 0.385 - tx * 0.12, fz = p[1] + s.n[1] * 0.385 - tz * 0.12;
      { const h = 0.23, ax = tx * h, az = tz * h, ox = fx, oz = fz; mt.quad([ox + ax, yy - h, oz + az], [ox - ax, yy - h, oz - az], [ox - ax, yy + h, oz - az], [ox + ax, yy + h, oz + az], [0, 0, 1, 1], [0.16, 0.16, 0.17]); } // fan grille (one quad)
      mt.box(p[0] + s.n[0] * 0.22, yy - 0.33, p[1] + s.n[1] * 0.22, 0.8, 0.04, 0.4, { col: [0.3, 0.3, 0.3], rotY: r, top: false }); // wall bracket shelf
    }
  }
  // roof clutter: water tanks, stair hut, dish
  if ((b.roof === 'flat' || !b.roof) && !b.tower) {
    if (b.tanks || rng.chance(0.4)) {
      const n = rng.int(1, 3);
      for (let k = 0; k < n; k++) {
        const tx = rng.range(b.x0 + 1.2, b.x1 - 1.2), tz = rng.range(b.z0 + 1.2, b.z1 - 1.2);
        // steel stand (4 angle legs + platform) carrying a ribbed polyethylene tank with a screw lid (kept lean: thousands of roofs)
        const mt = multi.get('metal'), pm = multi.get('paint'), sc = [0.24, 0.24, 0.25], tc = col(rng.pick(TANK)), sh = rng.range(0.7, 1.4);
        for (const [ox, oz] of [[-0.58, -0.58], [0.58, -0.58], [-0.58, 0.58], [0.58, 0.58]]) mt.box(tx + ox, yTop + sh / 2, tz + oz, 0.06, sh, 0.06, { col: sc, top: false, bottom: false });
        mt.box(tx, yTop + sh, tz, 1.3, 0.06, 1.3, { col: sc });
        pm.cylinder(tx, yTop + sh + 0.03, tz, 0.6, 0.55, 1.25, 12, { col: tc });
        pm.cylinder(tx, yTop + sh + 0.62, tz, 0.6, 0.6, 0.06, 12, { col: tc.map((v) => v * 0.85), caps: false }); // moulded rib
        pm.cylinder(tx, yTop + sh + 1.28, tz, 0.2, 0.2, 0.07, 8, { col: tc.map((v) => v * 0.8) }); // lid
      }
    }
    if (b.floors >= 3 && (b.x1 - b.x0) > 6 && (b.z1 - b.z0) > 6) conc.box(b.x0 + 2, yTop + 1.3, b.z0 + 2, 2.6, 2.6, 2.6, { col: darker, uvScale: 3 });
    if (rng.chance(0.3)) { const dx = rng.range(b.x0 + 1, b.x1 - 1), dz = rng.range(b.z0 + 1, b.z1 - 1); multi.get('paint').cylinder(dx, yTop + 0.9, dz, 0.45, 0.05, 0.25, 10, { col: [0.85, 0.85, 0.85] }); multi.get('metal').box(dx, yTop + 0.45, dz, 0.06, 0.9, 0.06, { col: [0.4, 0.4, 0.4] }); }
  }
  // building fabric: rendered plinth course, rainwater downpipes (PVC grey or painted black/cast iron on heritage),
  // eave gutters on tiled roofs, and a CEB electricity meter box beside the entrance
  {
    const shopFront = b.groundRow != null; const pc = paint.map((v) => v * 0.62 + 0.08); const heritage = b.style === 'colonial' || b.style === 'brick'; const fk = facKey(b.style, b); const curtain = /^glass/.test(fk) || fk === 'office3' || ((fk === 'office' || fk === 'hotel') && b.floors > 6);
    const pipeCol = heritage ? [0.12, 0.12, 0.13] : rng.chance(0.5) ? [0.72, 0.72, 0.7] : [0.42, 0.44, 0.46]; const pm = multi.get('paint');
    for (const s of sd) {
      if (s.len < 1.5) continue; const r = rotOf(s); const mid = along(s, 0.5);
      if (!(shopFront && s.id === b.front)) conc.box(mid[0] + s.n[0] * 0.035, y0 + 0.24, mid[1] + s.n[1] * 0.035, s.len + 0.07, 0.48, 0.07, { col: pc, uvScale: 2, rotY: r });
    }
    const tiled = b.roof === 'tile'; const ov = tiled ? 0.7 : 0;
    const pipeSides = curtain ? [] : sd.filter((s) => s.len >= 5 && (s.id === b.front || s.id === sd[(sd.indexOf(front) + 2) % 4].id));
    for (const s of pipeSides) for (const t of [0.6 / s.len, 1 - 0.6 / s.len]) {
      if (s.len < 9 && t > 0.5) continue; // narrow frontages get a single pipe
      const p = along(s, t); const px = p[0] + s.n[0] * 0.11, pz = p[1] + s.n[1] * 0.11; const top = tiled ? yTop - 0.3 : yTop + 0.2;
      pm.cylinder(px, y0 + 0.05, pz, 0.055, 0.055, top - y0 - 0.05, 8, { col: pipeCol, caps: false });
      pm.cylinder(px, y0 + 0.02, pz, 0.075, 0.06, 0.1, 8, { col: pipeCol }); // shoe
      for (let yb = y0 + 1.8; yb < top - 0.5; yb += 2.2) pm.cylinder(px, yb, pz, 0.068, 0.068, 0.05, 8, { col: pipeCol }); // wall brackets
      if (tiled) { const dx = s.n[0] * (ov - 0.05), dz = s.n[1] * (ov - 0.05); pm.box(px + dx / 2, top + 0.12, pz + dz / 2, Math.abs(dx) + 0.1, 0.1, Math.abs(dz) + 0.1, { col: pipeCol }); }
      else pm.box(px - s.n[0] * 0.05, top + 0.05, pz - s.n[1] * 0.05, 0.16, 0.12, 0.16, { col: pipeCol }); // parapet outlet
    }
    if (tiled) for (const s of sd) { // half-round gutter hung along each eave
      const mid = along(s, 0.5); const r = rotOf(s);
      pm.box(mid[0] + s.n[0] * (ov + 0.05), yTop - 0.06, mid[1] + s.n[1] * (ov + 0.05), s.len + ov * 2 + 0.1, 0.13, 0.14, { col: pipeCol, rotY: r, bottom: true });
    }
    if (!shopFront && front.len >= 4) { const p = along(front, rng.chance(0.5) ? 0.22 : 0.78); const r = rotOf(front);
      pm.box(p[0] + front.n[0] * 0.09, y0 + 1.55, p[1] + front.n[1] * 0.09, 0.34, 0.46, 0.16, { col: [0.78, 0.78, 0.74], rotY: r, bottom: true });
      pm.box(p[0] + front.n[0] * 0.175, y0 + 1.62, p[1] + front.n[1] * 0.175, 0.14, 0.1, 0.01, { col: [0.15, 0.2, 0.22], rotY: r }); // meter window
      pm.cylinder(p[0] + front.n[0] * 0.09, y0 + 1.78, p[1] + front.n[1] * 0.09, 0.018, 0.018, yTop - y0 - 1.8, 5, { col: [0.1, 0.1, 0.1], caps: false }); // service cable up the wall
    }
  }
  // villa porch
  if (b.porch) {
    const s = front; const mid = along(s, 0.5); const r = rotOf(s);
    conc.box(mid[0] + s.n[0] * 1.4, y0 + 2.9, mid[1] + s.n[1] * 1.4, 4.2, 0.2, 2.8, { col: paint, rotY: r, bottom: true });
    for (const [px, pz] of porchPillars(b)) conc.cylinder(px, y0, pz, 0.16, 0.16, 2.8, 8, { col: paint, caps: false }); // solid: World registers porchPillars() as colliders
    conc.box(mid[0] + s.n[0] * 1.4, y0 + 0.1, mid[1] + s.n[1] * 1.4, 4.4, 0.2, 3, { col: [0.75, 0.7, 0.65], rotY: r });
  }
  // house lights at night (most Colombo homes leave the front light on): a ceiling bulb under the porch, or a bracket lamp
  // over the front door, with the warm light it throws on the wall and the ground. Night-driven emissive (MAT.lampHead)
  // and additive light pools (MAT.pool) — the same materials as the street lamps, so they fade in at dusk with them.
  if (b.style === 'villa' && front.len >= 4 && rng.chance(0.8)) {
    const s = front, r = rotOf(s), n = s.n, m = along(s, 0.5); const lamp = multi.get('lampHead'), pool = multi.get('pool');
    const ux = (s.b[0] - s.a[0]) / s.len, uz = (s.b[1] - s.a[1]) / s.len; const flip = (-uz * n[0] + ux * n[1]) < 0; // quad winding so the wash faces outwards
    const gp = (x, z, y, size) => { const h = size / 2; pool.hrect(x - h, z - h, x + h, z + h, y, size, null, false, [-(x - h) / size, (z + h) / size]); };
    const wash = (yc, w, h) => { const ox = m[0] + n[0] * 0.035, oz = m[1] + n[1] * 0.035; const A = [ox - ux * w / 2, yc - h / 2, oz - uz * w / 2], B2 = [ox + ux * w / 2, yc - h / 2, oz + uz * w / 2];
      const C2 = [B2[0], yc + h / 2, B2[2]], D = [A[0], yc + h / 2, A[2]]; if (flip) pool.quad(B2, A, D, C2); else pool.quad(A, B2, C2, D); };
    if (b.porch) { const px = m[0] + n[0] * 1.4, pz = m[1] + n[1] * 1.4;
      lamp.box(px, y0 + 2.76, pz, 0.2, 0.07, 0.2, { rotY: r, bottom: true }); gp(px, pz, y0 + 0.215, 3.6); gp(m[0] + n[0] * 3.7, m[1] + n[1] * 3.7, y0 + 0.025, 3.0); wash(y0 + 1.9, 3.6, 2.4); }
    else { lamp.box(m[0] + n[0] * 0.12, y0 + 2.45, m[1] + n[1] * 0.12, 0.14, 0.2, 0.14, { rotY: r, bottom: true }); multi.get('metal').box(m[0] + n[0] * 0.06, y0 + 2.6, m[1] + n[1] * 0.06, 0.05, 0.05, 0.12, { col: [0.12, 0.12, 0.12], rotY: r });
      wash(y0 + 2.05, 2.6, 2.6); gp(m[0] + n[0] * 1.3, m[1] + n[1] * 1.3, y0 + 0.025, 3.2); }
  }
}
export function buildWall(w, multi) {
  const hv = Math.sin((w.x0 * 12.9898 + w.z0 * 78.233)) * 43758.5453, k = 0.94 + 0.08 * (hv - Math.floor(hv)); // each run of wall repainted at a different time
  const c = col(w.col).map((v) => v * k); const conc = multi.get('concrete');
  conc.box((w.x0 + w.x1) / 2, LAND_Y + w.h / 2, (w.z0 + w.z1) / 2, w.x1 - w.x0, w.h, w.z1 - w.z0, { col: c, uvScale: 2 });
  conc.box((w.x0 + w.x1) / 2, LAND_Y + w.h + 0.05, (w.z0 + w.z1) / 2, w.x1 - w.x0 + 0.08, 0.1, w.z1 - w.z0 + 0.12, { col: c.map((v) => v * 0.85), uvScale: 2 });
}

// ----------------------------------------------------------------------------- window dressing (near LOD)
// Real 3D joinery on every painted opening of a facade, placed from the exact rectangles the facade painter recorded
// (FACADE_WINDOWS) through the same UV mapping as facadeWall(), so geometry and texture line up:
//  • a projecting reveal (jambs + head) so the glazing reads as set ~13 cm back into the wall, with a deeper sill below;
//  • a slim frame + glazing bars in the joinery colour the texture uses (white sash, dark timber, aluminium);
//  • a glass pane with physically based Fresnel reflection of the sky/city (additive, so the parallax interior and the
//    night-time room lights behind it stay visible), louvred slats on shuttered openings and steel security grills on
//    shophouses. Only openings up to ~10 floors are dressed — that is what is seen up close; higher floors keep the
//    texture + interior mapping, which already reads correctly at that distance.
const WIN_MAX_Y = 34;
const HOOD_KEYS = new Set(['f_shop', 'f_shop2', 'f_apartment', 'f_apartment2', 'f_villa', 'f_office2']);
function dressFacade(solid, glass, s, y0, y1, uOff, vStart, key, paint, cols = null) { // cols = [iu from, iu to): a slice of the facade (streaming)
  const wins = FACADE_WINDOWS[key]; if (!wins || !wins.length || s.len < 1.5) return 0;
  const TW = 4 * BAY, TH = 2 * FLOOR_H; const r = Math.atan2(s.n[0], s.n[1]);
  const dx = (s.b[0] - s.a[0]) / s.len, dz = (s.b[1] - s.a[1]) / s.len, nx = s.n[0], nz = s.n[1];
  const top = Math.min(y1, LAND_Y + WIN_MAX_Y); if (top <= y0 + 0.5) return 0;
  const iu0 = Math.floor(uOff), iu1 = Math.ceil(uOff + s.len / TW), iv0 = Math.floor((y0 - vStart) / TH), iv1 = Math.ceil((top - vStart) / TH);
  const surr = paint.map((v) => v * 0.9), sillC = paint.map((v) => v * 0.97);
  const conc = solid.get('concrete'), join = solid.get('paint'), met = solid.get('metal'), gl = glass.get('winGlass');
  const grillC = [0.06, 0.06, 0.065]; let n = 0;
  const hoods = HOOD_KEYS.has(key) && ((Math.imul(Math.round(s.a[0] * 7 + s.a[1] * 13), 2654435761) >>> 0) % 10) < 7; // ~70 % of such walls
  for (let iu = cols ? Math.max(iu0, cols[0]) : iu0, iuE = cols ? Math.min(iu1, cols[1]) : iu1; iu < iuE; iu++) for (let iv = iv0; iv < iv1; iv++) for (const w of wins) {
    const d0 = (iu + w.u0 - uOff) * TW, d1 = (iu + w.u1 - uOff) * TW; if (d0 < 0.3 || d1 > s.len - 0.3) continue;
    const ya = vStart + (iv + w.v0) * TH, yb = vStart + (iv + w.v1) * TH; if (ya < y0 + 0.08 || yb > top - 0.08) continue;
    const W = d1 - d0, H = yb - ya, dm = (d0 + d1) / 2; n++;
    const P = (along, out) => [s.a[0] + dx * (dm + along) + nx * out, s.a[1] + dz * (dm + along) + nz * out];
    const B = (mb, along, y, out, sx, sy, sz, c, o = {}) => { const p = P(along, out); mb.box(p[0], y, p[1], sx, sy, sz, { col: c, rotY: r, uvScale: 1.5, ...o }); };
    const fc = col(w.frame || '#e8e8e4'); const e = 0.085, dep = 0.13;
    const spring = w.arch ? yb - H * w.arch : yb; // arched heads: straight reveal up to the springing line
    // reveal: jambs + head (the inner faces are what make the opening read as recessed)
    B(conc, -(W / 2 + e / 2), (ya + spring) / 2, dep / 2, e, spring - ya, dep, surr);
    B(conc, W / 2 + e / 2, (ya + spring) / 2, dep / 2, e, spring - ya, dep, surr);
    if (w.arch) { B(conc, 0, yb + 0.11, dep / 2 + 0.01, 0.2, 0.26, dep + 0.02, surr, { bottom: true }); // keystone
      for (const sg of [-1, 1]) B(conc, sg * (W / 2 + e / 2), spring + 0.05, dep / 2 + 0.015, e + 0.06, 0.1, dep + 0.03, surr, { bottom: true }); } // imposts
    else B(conc, 0, yb + e / 2, dep / 2, W + 2 * e, e, dep, surr, { bottom: true });
    // sill: deeper and wider, with a drip edge underneath
    B(conc, 0, ya - 0.045, dep / 2 + 0.05, W + 2 * e + 0.16, 0.09, dep + 0.1, sillC, { bottom: true });
    // Colombo window hood ("sunshade"): a thin cast slab over the opening on two small brackets, on most shophouse and
    // apartment walls — the deep shadow line it throws is what makes these streets read as real concrete buildings
    if (hoods && !w.arch && w.kind !== 'door') { const hy = yb + e + 0.12, hd = 0.42;
      B(conc, 0, hy, hd / 2 + 0.02, W + 0.42, 0.07, hd, surr, { bottom: true });
      for (const sg of [-1, 1]) B(conc, sg * (W / 2 + 0.12), hy - 0.13, hd * 0.32, 0.07, 0.2, hd * 0.55, surr, { bottom: true }); }
    const gTop = w.arch ? spring : yb;
    if (w.kind === 'shutter') { // louvred timber shutters: angled slats catch the light like real louvres
      const sc = col(w.shut || '#3a6b52'), sd = sc.map((v) => v * 0.55); const step = 0.1;
      for (let y = ya + 0.04; y + step <= gTop - 0.02; y += step) {
        const a0 = P(-W / 2, 0.07), a1 = P(W / 2, 0.07), b0 = P(-W / 2, 0.02), b1 = P(W / 2, 0.02);
        join.quad([a0[0], y, a0[1]], [a1[0], y, a1[1]], [b1[0], y + step * 0.92, b1[1]], [b0[0], y + step * 0.92, b0[1]], [0, 0, 1, 1], sc);
        join.quad([b0[0], y + step * 0.92, b0[1]], [b1[0], y + step * 0.92, b1[1]], [a1[0], y + step, a1[1]], [a0[0], y + step, a0[1]], [0, 0, 1, 1], sd);
      }
      B(join, 0, (ya + gTop) / 2, 0.05, 0.05, gTop - ya, 0.05, sd); // meeting stile
      B(join, -W / 2 + 0.025, (ya + gTop) / 2, 0.05, 0.05, gTop - ya, 0.06, sc); B(join, W / 2 - 0.025, (ya + gTop) / 2, 0.05, 0.05, gTop - ya, 0.06, sc);
      continue;
    }
    // frame (flush inside the reveal) + glazing bars
    const fw = 0.05, fd = 0.05, fo = 0.03;
    B(join, 0, ya + fw / 2, fo, W, fw, fd, fc); B(join, 0, gTop - fw / 2, fo, W, fw, fd, fc, { bottom: true });
    B(join, -W / 2 + fw / 2, (ya + gTop) / 2, fo, fw, gTop - ya, fd, fc); B(join, W / 2 - fw / 2, (ya + gTop) / 2, fo, fw, gTop - ya, fd, fc);
    if (W > 0.75) B(join, 0, (ya + gTop) / 2, fo, 0.04, gTop - ya - fw * 2, 0.045, fc);
    if (w.bar > 0) { const yt = yb - H * w.bar; if (yt > ya + 0.2 && yt < gTop - 0.1) B(join, 0, yt, fo, W - fw * 2, 0.04, 0.045, fc, { bottom: true }); }
    // glass pane (just proud of the painted glass so it never z-fights)
    const g0 = P(-W / 2 + fw, 0.012), g1 = P(W / 2 - fw, 0.012);
    gl.quad([g0[0], ya + fw, g0[1]], [g1[0], ya + fw, g1[1]], [g1[0], gTop - fw, g1[1]], [g0[0], gTop - fw, g0[1]], [0, 0, 1, 1]);
    if (w.kind === 'grill') { // steel security grill in front of the glass (Colombo shophouse standard)
      const nb = Math.max(3, Math.round(W / 0.14));
      for (let k = 1; k < nb; k++) B(met, -W / 2 + (k / nb) * W, (ya + yb) / 2, 0.085, 0.018, H, 0.018, grillC, { top: false });
      for (const fy of [0.08, 0.5, 0.92]) B(met, 0, ya + H * fy, 0.085, W, 0.02, 0.02, grillC);
    }
  }
  return n;
}
// The same work as one ordered list of facade tasks, so streaming can spread a building over several frames
// (a large shop-house row is thousands of 3D window frames: up to ~130 ms for one building in a single call).
export function windowTasks(b, solid, glass) {
  const paint = col(b.color || '#ffffff'); const y0 = LAND_Y, yTop = y0 + b.h; const hasGround = b.groundRow != null; const key = 'f_' + facKey(b.style, b);
  const T = []; const F = (...a) => { const s = a[2], uOff = a[5]; const i0 = Math.floor(uOff), i1 = Math.ceil(uOff + s.len / (4 * BAY)); for (let k = i0; k < i1; k++) T.push(() => dressFacade(...a, [k, k + 1])); }; // one 4-bay column per task
  for (const s of sides(b.x0, b.x1, b.z0, b.z1)) {
    if (s.len < 0.1) continue;
    if (hasGround) {
      if (s.id !== b.front) F(solid, glass, s, y0, y0 + GROUND_H, b.uOff || 0, y0 + GROUND_H - 2 * FLOOR_H, key, paint);
      F(solid, glass, s, y0 + GROUND_H, yTop, b.uOff || 0, y0 + GROUND_H, key, paint);
    } else F(solid, glass, s, y0, yTop, b.uOff || 0, y0, key, paint);
  }
  if (b.tower) {
    const t = b.tower, i = t.inset; const th = t.floors * FLOOR_H;
    for (const s of sides(b.x0 + i, b.x1 - i, b.z0 + i, b.z1 - i)) F(solid, glass, s, yTop, yTop + th, 0, yTop, 'f_' + facKey(t.style, b, 7), col(t.color || '#fff'));
  }
  return T;
}
// one-shot build (warm / loading); identical output to running windowTasks() in order (tools/stream-test.mjs)
export function buildWindows(b, solid, glass) {
  const paint = col(b.color || '#ffffff'); const y0 = LAND_Y, yTop = y0 + b.h; const hasGround = b.groundRow != null; const key = 'f_' + facKey(b.style, b);
  let n = 0;
  for (const s of sides(b.x0, b.x1, b.z0, b.z1)) {
    if (s.len < 0.1) continue;
    if (hasGround) {
      if (s.id !== b.front) n += dressFacade(solid, glass, s, y0, y0 + GROUND_H, b.uOff || 0, y0 + GROUND_H - 2 * FLOOR_H, key, paint);
      n += dressFacade(solid, glass, s, y0 + GROUND_H, yTop, b.uOff || 0, y0 + GROUND_H, key, paint);
    } else n += dressFacade(solid, glass, s, y0, yTop, b.uOff || 0, y0, key, paint);
  }
  if (b.tower) {
    const t = b.tower, i = t.inset; const th = t.floors * FLOOR_H;
    for (const s of sides(b.x0 + i, b.x1 - i, b.z0 + i, b.z1 - i)) n += dressFacade(solid, glass, s, yTop, yTop + th, 0, yTop, 'f_' + facKey(t.style, b, 7), col(t.color || '#fff'));
  }
  return n;
}
