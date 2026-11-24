// 81st request — DYNAMIC CITY EVENTS: the site layouts. One function per template builds, in the site's LOCAL frame (metres;
// x across, z from the entrance at −D/2 to the back at +D/2; y = 0 at the site's base height), three build tiers of geometry
// (EvKit: one mesh per shared material each) + colliders, and every place a person uses:
//   tier 0 'ground' — perimeter fence / barriers, stage deck, tents and their canopies, generator, toilets, security post
//   tier 1 'rig'    — truss, roof, PA, lighting, LED screen, header banners, cable ramps, FOH console
//   tier 2 'dress'  — chairs (instanced), tables and cloths, stall wares, bins, boards, signs, flags, bunting, lamps, kolam
// Spots: stand (audience standing places), seats (chairs; sit pose from StationLife's bench pose), stalls (vendor + customer
// place), posts (staff), stage (performers, on the deck), queue (the line at the gate / dansal counter), wander (aisle points),
// nav (points the in-site router may pass through). The ground under every part is sampled (gy) so nothing floats or sinks.
import { EvKit, COL } from './EventKit.js';
import { PALETTES } from './CityEventCatalog.js';

const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => Math.pow(v, 2.2)); };
// print atlas (2048 × 1024) regions — drawn by EventArt.atlasJob (in steps)
export const ATLAS = {
  banner: [0, 0, 1536, 192], screen: [0, 192, 1024, 576], poster: [1024, 192, 512, 704], kolam: [1536, 0, 512, 512],
  vbanA: [1536, 512, 256, 512], vbanB: [1792, 512, 256, 512], gate: [0, 768, 512, 128], aid: [512, 768, 256, 128], reg: [768, 768, 256, 128],
  stall0: [0, 896, 256, 128], stall1: [256, 896, 256, 128], stall2: [512, 896, 256, 128], stall3: [768, 896, 256, 128], wc: [1024, 896, 256, 128], exit: [1280, 896, 256, 128],
};
const TAU = Math.PI * 2;
// ------------------------------------------------------------------------------------------------ builder context
class Ctx {
  constructor(site, gy, rng) {
    this.site = site; this.gy = gy; this.rng = rng; this.tiers = [new EvKit(), new EvKit(), new EvKit()]; this.k = this.tiers[0]; this.tier = 0;
    this.chairs = []; this.soft = []; this.cols = []; this.stand = []; this.seats = []; this.stalls = []; this.posts = []; this.stage = []; this.wander = []; this.nav = []; this.info = null; this.queue = null; this.decoGlow = 0; this.beams = 0;
  }
  T(i) { this.tier = i; this.k = this.tiers[i]; return this; }
  // a part standing on the ground at (x, z); y offset dy above the ground
  put(name, x, z, yaw = 0, o = {}) { const y = (o.abs ?? this.gy(x, z)) + (o.dy || 0); this.k.part(name, x, y, z, yaw, o.s ?? 1, o.tint || null, o.pitch || 0, o.roll || 0); return this; }
  // collider (local AABB, height above the ground there). tier = the tier it appears with
  solid(x0, z0, x1, z1, h, kind = 'event') { const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; this.cols.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, y0: this.gy(cx, cz), kind, tier: this.tier }); return this; }
  softBox(x0, z0, x1, z1) { this.soft.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) }); }
  print(mat, x, y, z, w, h, yaw, rect) { this.k.print(mat, x, y, z, w, h, yaw, ATLAS[rect] || rect); return this; }
  // a straight line of sections (fence / barrier / mojo) from a to b; parts overlap a little instead of being stretched
  run(name, ax, az, bx, bz, w, o = {}) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / w - 0.05)), yaw = Math.atan2(-(bz - az), bx - ax) + (o.flip ? Math.PI : 0);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; this.put(name, ax + (bx - ax) * t, az + (bz - az) * t, yaw, o); }
    if (o.h) { const r = o.r ?? 0.12; this.solid(Math.min(ax, bx) - r, Math.min(az, bz) - r, Math.max(ax, bx) + r, Math.max(az, bz) + r, o.h, o.kind || 'fence'); }
    return this;
  }
  // a horizontal truss span from a to b at height y (segments of 2 m, a 1 m / 0.5 m filler), corner blocks at both ends
  truss(ax, az, bx, bz, y) { const L = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(-(bz - az), bx - ax), ux = (bx - ax) / L, uz = (bz - az) / L; let s = 0.16;
    const seg = (name, len) => { this.k.part(name, ax + ux * s, y, az + uz * s, yaw); s += len; };
    while (L - 0.16 - s >= 2) seg('truss2', 2); while (L - 0.16 - s >= 1) seg('truss1', 1); while (L - 0.16 - s >= 0.45) seg('truss05', 0.5);
    this.k.part('trussCorner', ax, y, az, 0); this.k.part('trussCorner', bx, y, bz, 0); return this; }
  // a vertical tower on a base plate from the ground to height h
  tower(x, z, h) { const g = this.gy(x, z); this.k.part('trussBase', x, g, z, 0); let s = 0.05; const roll = Math.PI / 2;
    while (h - s >= 2) { this.k.part('truss2', x, g + s, z, 0, 1, null, 0, roll); s += 2; } while (h - s >= 1) { this.k.part('truss1', x, g + s, z, 0, 1, null, 0, roll); s += 1; } while (h - s >= 0.45) { this.k.part('truss05', x, g + s, z, 0, 1, null, 0, roll); s += 0.5; }
    this.solid(x - 0.4, z - 0.4, x + 0.4, z + 0.4, h, 'pole'); return this; }
  // audience standing grid inside a rectangle facing (wx, wz); keeps clear of colliders / soft boxes
  standGrid(x0, z0, x1, z1, wx, wz, step = 1.05) { for (let z = z0; z <= z1; z += step) for (let x = x0; x <= x1; x += step) { const jx = x + (this.rng() - 0.5) * 0.36, jz = z + (this.rng() - 0.5) * 0.3; if (this.blockedAt(jx, jz, 0.45)) continue; this.stand.push({ x: jx, z: jz, yaw: Math.atan2(wx - jx, wz - jz), used: null }); } }
  blockedAt(x, z, r) { for (const c of this.cols) if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true; for (const c of this.soft) if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true; return false; }
  // rows of chairs facing +z (the stage) between x0..x1, rows from z0 back to z1 (z0 > z1), centre aisle |x| < aisle
  chairRows(x0, x1, zFront, rows, pitch, aisle, colA, colB = null) {
    for (let r = 0; r < rows; r++) { const z = zFront - r * pitch; const blocks = [[x0, -aisle], [aisle, x1]];
      for (const [bx0, bx1] of blocks) { const n = Math.floor((bx1 - bx0) / 0.56); if (n < 1) continue; const off = (bx1 - bx0 - n * 0.56) / 2;
        for (let i = 0; i < n; i++) { const x = bx0 + off + 0.28 + i * 0.56; const col = colB && (i + r) % 7 === 3 ? colB : colA; this.chairs.push({ x, z, yaw: 0, col, y: this.gy(x, z) });
          this.seats.push({ x, z: z + 0.02, yaw: 0, y: this.gy(x, z) + 0.44, ax: x, az: z + 0.62, row: r, used: null }); }
        this.softBox(bx0 + off, z - 0.3, bx0 + off + n * 0.56, z + 0.26); } } }
  // a 3 × 3 m gazebo stall at (x, z) whose customer side faces direction yaw (0 = +z); table across the front, vendor behind
  stall(x, z, yaw, canopy, cloth, wares, label = null) {
    const c = Math.cos(yaw), s = Math.sin(yaw); const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    this.T(0).put('gazebo', x, z, yaw, { tint: canopy }); for (const [lx, lz] of [[-1.45, -1.45], [1.45, -1.45], [-1.45, 1.45], [1.45, 1.45]]) { const [px, pz] = L(lx, lz); this.solid(px - 0.1, pz - 0.1, px + 0.1, pz + 0.1, 2.3, 'pole'); }
    const [tx, tz] = L(0, 0.95); this.T(2).put('table', tx, tz, yaw).put('tableCloth', tx, tz, yaw, { tint: cloth });
    const hw = Math.abs(c) * 0.93 + Math.abs(s) * 0.4, hd = Math.abs(s) * 0.93 + Math.abs(c) * 0.4; this.T(0).solid(tx - hw, tz - hd, tx + hw, tz + hd, 0.8, 'table'); this.T(2);
    if (wares) wares(this, L, yaw);
    if (label) { const [bx, bz] = L(0, 1.52); this.print('evPrint', bx, this.gy(bx, bz) + 2.05, bz, 1.5, 0.75 * 0.5, yaw, label); }
    const [vx, vz] = L(0, 0.05), [cx, cz] = L(0, 2.05); this.stalls.push({ vx, vz, vyaw: yaw, cx, cz, cyaw: yaw + Math.PI, used: null, vendor: null });
    return this;
  }
}
// ------------------------------------------------------------------------------------------------ wares on stall tables
const WARES = {
  food: (B, L, yaw) => { const [x, z] = L(-0.45, 0.95), [x2, z2] = L(0.4, 0.95); const y = B.gy(x, z) + 0.76; const K = B.k;
    K.mb('evSteel').cylinder(x, y, z, 0.2, 0.2, 0.24, 14, { col: [0.75, 0.75, 0.78] }); K.mb('evSteel').cylinder(x, y + 0.24, z, 0.21, 0.21, 0.015, 14, { col: [0.6, 0.6, 0.62] }); // a pot with its lid
    K.mb('evSteel').box(x2, y + 0.02, z2, 0.7, 0.04, 0.42, { col: [0.7, 0.7, 0.72] }); for (let i = 0; i < 6; i++) K.mb('evPaint').box(x2 - 0.25 + (i % 3) * 0.25, y + 0.06, z2 - 0.1 + Math.floor(i / 3) * 0.2, 0.18, 0.04, 0.14, { col: hex(i % 2 ? '#b8742f' : '#d49a3c') }); // trays of wade / short eats
    const [cx, cz] = L(0.85, 0.75); K.mb('evPlastic').box(cx, y + 0.12, cz, 0.3, 0.24, 0.24, { col: hex('#2a7fd0') }); }, // cool box
  art: (B, L, yaw) => { const K = B.k; for (let i = 0; i < 3; i++) { const [x, z] = L(-0.6 + i * 0.6, 0.98); const y = B.gy(x, z) + 0.76; const fr = [0.32, 0.22, 0.12];
    K.mb('evWood').box(x, y + 0.22, z, 0.42, 0.44, 0.03, { col: fr, uvScale: 0.4 }); K.mb('evPaint').box(x, y + 0.22, z + Math.cos(yaw) * 0.0 + 0.0, 0.36, 0.38, 0.034, { col: hex(['#c45a3a', '#3a7fa0', '#6aa04a'][i]) }); }
    for (let i = 0; i < 2; i++) { const [x, z] = L(-1.15 + i * 2.3, 0.3); const y = B.gy(x, z); K.mb('evWood').box(x, y + 0.9, z, 0.6, 0.8, 0.03, { col: [0.3, 0.2, 0.12] }); K.mb('evPaint').box(x, y + 0.9, z, 0.54, 0.74, 0.036, { col: hex(['#d8a640', '#8a4fbf'][i]) }); } },
  books: (B, L) => { const K = B.k; for (let i = 0; i < 8; i++) { const [x, z] = L(-0.75 + (i % 4) * 0.5, 0.82 + Math.floor(i / 4) * 0.28); const y = B.gy(x, z) + 0.76; const h = 0.06 + (i * 37 % 5) * 0.02; K.mb('evPaint').box(x, y + h / 2, z, 0.2, h, 0.15, { col: hex(['#2a4a7a', '#7a2a2a', '#2a6a4a', '#c8a050', '#4a2a6a'][i % 5]) }); } },
  avurudu: (B, L) => { const K = B.k; for (let i = 0; i < 4; i++) { const [x, z] = L(-0.6 + i * 0.4, 0.95); const y = B.gy(x, z) + 0.76; K.mb('evWood').cylinder(x, y, z, 0.16, 0.13, 0.05, 12, { col: [0.6, 0.45, 0.3] }); for (let k = 0; k < 4; k++) K.mb('evPaint').cylinder(x + (k % 2 - 0.5) * 0.12, y + 0.05, z + (k > 1 ? 0.06 : -0.06), 0.045, 0.05, 0.035, 8, { col: hex(i % 2 ? '#8a4b18' : '#e6c27a') }); } }, // kavum / kokis on wooden plates
  lanterns: (B, L) => { const K = B.k; for (let i = 0; i < 3; i++) { const [x, z] = L(-0.9 + i * 0.9, 0.2); const y = B.gy(x, z) + 1.75; lantern(K, x, y, z, 0.22, hex(['#ffcc00', '#ff7f00', '#0050a4'][i])); B.decoGlow++; } },
};
function lantern(K, x, y, z, r, col) { // a paper Vesak / festival lantern: glowing octagonal body, dark cap and tail ribbons
  const G = K.mb('evGlow'); G.cylinder(x, y - r, z, r * 0.7, r * 0.7, r * 1.2, 8, { col }); G.cylinder(x, y + r * 0.2, z, r * 0.25, r * 0.7, r * 0.5, 8, { col }); G.cylinder(x, y - r * 1.5, z, r * 0.7, r * 0.2, r * 0.5, 8, { col });
  K.mb('evPaint').cylinder(x, y + r * 0.7, z, 0.03, 0.03, 0.4, 5, { col: [0.1, 0.1, 0.1] }); for (let k = 0; k < 4; k++) { const a = k * 1.57; K.mb('evCloth').box(x + Math.cos(a) * r * 0.3, y - r * 2.1, z + Math.sin(a) * r * 0.3, 0.03, 0.5, 0.004, { col }); } }
// bunting (pennants on a sagging line between two points at height h)
function bunting(B, ax, az, bx, bz, h, cols, flag = false) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.floor(L / 0.42)); const ga = B.gy(ax, az), gb = B.gy(bx, bz); const K = B.k; const ux = (bx - ax) / L, uz = (bz - az) / L; let prev = null;
  for (let i = 0; i <= n; i++) { const t = i / n, sag = Math.sin(t * Math.PI) * Math.min(0.9, L * 0.035); const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ga + (gb - ga) * t + h - sag; if (prev) { K.mb('evRubber'); tubeLine(K, prev, [x, y, z]); }
    if (i < n) { const col = cols[i % cols.length]; const x1 = x + ux * 0.3, z1 = z + uz * 0.3; const y1 = ga + (gb - ga) * ((i + 0.7) / n) + h - Math.sin(((i + 0.7) / n) * Math.PI) * Math.min(0.9, L * 0.035);
      if (flag) K.mb('evFlag').quad([x, y - 0.26, z], [x1, y1 - 0.26, z1], [x1, y1, z1], [x, y, z], [0, 0, 1, 1]); else K.mb('evCloth').planar([[x, y, z], [x1, y1, z1], [(x + x1) / 2, (y + y1) / 2 - 0.28, (z + z1) / 2]], col, 1); }
    prev = [x, y, z]; } }
function tubeLine(K, a, b) { const M = K.mb('evRubber'); const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1; const nx = -dz / L * 0.006, nz = dx / L * 0.006; M.quad([a[0] - nx, a[1], a[2] - nz], [b[0] - nx, b[1], b[2] - nz], [b[0] + nx, b[1], b[2] + nz], [a[0] + nx, a[1], a[2] + nz], [0, 0, 1, 0.01]); M.quad([a[0], a[1] - 0.006, a[2]], [b[0], b[1] - 0.006, b[2]], [b[0], b[1] + 0.006, b[2]], [a[0], a[1] + 0.006, a[2]], [0, 0, 1, 0.01]); }
// a flag pole with a Buddhist flag (poya / vesak) or a coloured festival flag
function flagPole(B, x, z, h, buddhist, col) { const K = B.k, g = B.gy(x, z); K.mb('evSteel').cylinder(x, g, z, 0.025, 0.03, h, 6, { col: [0.85, 0.85, 0.85] }); K.mb('evSteel').cylinder(x, g, z, 0.16, 0.18, 0.08, 8, { col: [0.4, 0.4, 0.4] });
  const y = g + h - 0.05; if (buddhist) K.mb('evFlag').quad([x, y - 0.6, z], [x + 0.9, y - 0.6, z], [x + 0.9, y, z], [x, y, z], [0, 0, 1, 1]), K.mb('evFlag').quad([x + 0.9, y - 0.6, z], [x, y - 0.6, z], [x, y, z], [x + 0.9, y, z], [1, 0, 0, 1]);
  else K.mb('evCloth').box(x + 0.45, y - 0.3, z, 0.9, 0.6, 0.01, { col }); B.solid(x - 0.2, z - 0.2, x + 0.2, z + 0.2, h, 'pole'); }
function oilLamps(B, x0, z0, x1, z1, n) { const K = B.k; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, g = B.gy(x, z); K.mb('evPaint').cylinder(x, g, z, 0.05, 0.035, 0.035, 8, { col: hex('#9a4e22') }); K.mb('evGlow').planar([[x - 0.012, g + 0.035, z], [x + 0.012, g + 0.035, z], [x, g + 0.085, z]], hex('#ffb347'), 1); K.mb('evGlow').planar([[x, g + 0.035, z - 0.012], [x, g + 0.035, z + 0.012], [x, g + 0.085, z]], hex('#ffb347'), 1); } B.decoGlow += n; }
// perimeter: fence (or barriers) round the site with the gate gap at the front centre; returns gate info
function perimeter(B, W, D, kind, gate = 6) { B.T(0); const hw = W / 2, hd = D / 2, part = kind === 'fence' ? 'fence' : 'barrier', w = kind === 'fence' ? 3.4 : 2.3, h = kind === 'fence' ? 2.1 : 1.15;
  B.run(part, -hw, -hd, -gate / 2, -hd, w, { h, flip: true }); B.run(part, gate / 2, -hd, hw, -hd, w, { h, flip: true }); B.run(part, -hw, -hd, -hw, hd, w, { h }); B.run(part, hw, hd, hw, -hd, w, { h }); B.run(part, hw, hd, -hw, hd, w, { h });
  B.gateIn = { x: -1.2, z: -hd + 2.2 }; B.gateOut = { x: -1.2, z: -hd - 1.4 }; B.exitIn = { x: 1.4, z: -hd + 2.2 }; B.exitOut = { x: 1.4, z: -hd - 1.4 }; B.nav.push(B.gateIn, B.exitIn); }
// entry lane: barriers splitting the gate into an IN and an OUT lane; queue slots run out from the gate
function entryLane(B, D, queueOutside = true) { B.T(0); const hd = D / 2; B.run('barrier', 0.15, -hd + 0.2, 0.15, -hd + 4.6, 2.3, { h: 1.15 }); B.queue = { x: -1.2, z: -hd + 1.0, dx: 0, dz: -1, sp: 0.95, n: 18, out: queueOutside, head: { x: -1.2, z: -hd + 1.2 } }; }
// ------------------------------------------------------------------------------------------------ STAGE (34 × 40)
function stageLayout(B, T, pal, ev) {
  const W = 34, D = 40, hd = D / 2; const P = PALETTES[pal]; const canopy = hex(P.canopy), cloth = hex(P.cloth), A = hex(P.a);
  perimeter(B, W, D, 'fence'); if (ev.cat === 'concert' || ev.cat === 'celebration' || !ev.seats) entryLane(B, D);
  // stage deck 12 × 7 × 1.2 at the back, skirt, steps
  const sz0 = hd - 9, sz1 = hd - 2, sx = 6, DH = 1.2; B.T(0); const K = B.k; const gD = Math.max(B.gy(-sx, sz0), B.gy(sx, sz0), B.gy(-sx, sz1), B.gy(sx, sz1)), top = gD + DH;
  K.mb('evDeck').box(0, top - 0.02, (sz0 + sz1) / 2, sx * 2, 0.04, sz1 - sz0, { col: [1, 1, 1], uvScale: 0.5 }); K.mb('evBlack').box(0, top - 0.12, (sz0 + sz1) / 2, sx * 2 - 0.04, 0.16, sz1 - sz0 - 0.04, { col: [0.6, 0.6, 0.6], bottom: true });
  for (let x = -sx + 0.3; x <= sx; x += 2) for (let z = sz0 + 0.3; z <= sz1; z += 2) K.mb('evSteel').box(x, gD + DH / 2 - 0.1, z, 0.06, DH - 0.2, 0.06, { col: [0.7, 0.7, 0.7] }); // deck legs
  K.mb('evSkirt').quad([sx, gD - 0.05, sz0 - 0.01], [-sx, gD - 0.05, sz0 - 0.01], [-sx, top - 0.04, sz0 - 0.01], [sx, top - 0.04, sz0 - 0.01], [0, 0, 12, 1.2]); // front skirt (faces −z)
  for (const s of [-1, 1]) K.mb('evSkirt').quad(s > 0 ? [sx + 0.01, gD - 0.05, sz0] : [-sx - 0.01, gD - 0.05, sz1], s > 0 ? [sx + 0.01, gD - 0.05, sz1] : [-sx - 0.01, gD - 0.05, sz0], s > 0 ? [sx + 0.01, top - 0.04, sz1] : [-sx - 0.01, top - 0.04, sz0], s > 0 ? [sx + 0.01, top - 0.04, sz0] : [-sx - 0.01, top - 0.04, sz1], [0, 0, 7, 1.2]);
  for (let i = 0; i < 4; i++) { const h = (i + 1) * DH / 4; K.mb('evDeck').box(sx - 1.2, gD + h / 2, sz1 + 0.35 + (3 - i) * 0.3, 1.2, h, 0.3, { col: [0.9, 0.9, 0.9], uvScale: 0.5 }); } // steps at the back right
  B.solid(-sx, sz0, sx, sz1, DH, 'stage'); B.solid(sx - 1.8, sz1, sx - 0.6, sz1 + 1.6, DH, 'stage');
  B.stageTop = top; B.watch = { x: 0, y: top + 1.6, z: (sz0 + sz1) / 2 };
  // ground stacks
  for (const s of [-1, 1]) { const x = s * 7.4, z = sz0 + 0.6; B.put('sub', x, z, Math.PI).put('sub', x, z, Math.PI, { dy: 0.7 }).put('top', x, z, Math.PI, { dy: 1.4 }); B.solid(x - 0.65, z - 0.45, x + 0.65, z + 0.45, 2.4, 'speaker'); }
  // FOH tent at the centre of the audience (gazebo + console), barriers round it
  // (81st fix: it used to be one solid box, so the two FOH technicians stood *inside* a collider. Now the four barrier sides are thin colliders,
  //  the rear-right half is the staff opening, the gazebo legs and the console desk are solid, and the inside is a soft no-standing area)
  const fz = -4.5, fr = 2.3; B.put('gazebo', 0, fz, 0, { tint: hex('#2a2a2c') });
  B.run('barrier', -fr, fz + fr, fr, fz + fr, 2.3).run('barrier', -fr, fz + fr, -fr, fz - fr, 2.3).run('barrier', fr, fz - fr, fr, fz + fr, 2.3).run('barrier', 0, fz - fr, -fr, fz - fr, 2.3);
  B.T(0).solid(-fr - 0.1, fz + fr - 0.1, fr + 0.1, fz + fr + 0.1, 1.15, 'barrier').solid(-fr - 0.1, fz - fr - 0.1, -fr + 0.1, fz + fr + 0.1, 1.15, 'barrier').solid(fr - 0.1, fz - fr - 0.1, fr + 0.1, fz + fr + 0.1, 1.15, 'barrier').solid(-fr - 0.1, fz - fr - 0.1, 0, fz - fr + 0.1, 1.15, 'barrier');
  for (const lx of [-1.5, 1.5]) for (const lz of [-1.5, 1.5]) B.solid(lx - 0.05, fz + lz - 0.05, lx + 0.05, fz + lz + 0.05, 2.3, 'pole');
  B.solid(-0.58, fz + 0.08, 0.58, fz + 0.72, 0.95, 'desk'); B.softBox(-fr + 0.15, fz - fr + 0.15, fr - 0.15, fz + fr - 0.15);
  B.nav.push({ x: -fr - 1.0, z: fz - fr - 1.0 }, { x: fr + 1.0, z: fz - fr - 1.0 }, { x: -fr - 1.0, z: fz + fr + 1.0 }, { x: fr + 1.0, z: fz + fr + 1.0 }, { x: 1.15, z: fz - fr - 0.9 });
  // backstage: generator, cases, toilets (side), security post, first aid, bars
  B.put('generator', 12.5, hd - 1.6, 0); B.solid(10.2, hd - 2.3, 14.7, hd - 0.9, 1.6, 'generator');
  for (let i = 0; i < 5; i++) { const x = -13 + (i % 3) * 0.7, z = hd - 1.2 - Math.floor(i / 3) * 0.7; B.put('case', x, z, (i * 0.7) % 0.3); } B.solid(-13.4, hd - 2.3, -11.2, hd - 0.8, 1.1, 'case');
  for (let i = 0; i < 3; i++) { const z = -2 + i * 1.3; B.put('toilet', -W / 2 + 1.0, z, Math.PI / 2, { tint: hex(i === 1 ? '#2e6fb0' : '#2f8a4a') }); } B.solid(-W / 2 + 0.35, -2.7, -W / 2 + 1.65, 1.95, 2.3, 'cabin');
  B.put('secHut', -6.2, -hd + 1.6, 0); B.solid(-7, -hd + 0.8, -5.4, -hd + 2.5, 2.4, 'cabin');
  // first aid gazebo with cot (right side, near the gate)
  B.put('gazebo', W / 2 - 2.2, -hd + 6, -Math.PI / 2, { tint: hex('#f4f4f4') }); B.T(2).put('cot', W / 2 - 2.0, -hd + 6, 0); B.T(0).solid(W / 2 - 2.4, -hd + 5.0, W / 2 - 1.6, -hd + 7.0, 0.6, 'cot');
  B.posts.push({ role: 'medic', x: W / 2 - 3.3, z: -hd + 6.2, yaw: -Math.PI / 2, act: 'crossarms' });
  // food / drink stalls on the right side facing in
  const lab = ['stall0', 'stall1', 'stall2']; for (let i = 0; i < 3; i++) B.stall(W / 2 - 2.0, -hd + 11 + i * 3.4, -Math.PI / 2, canopy, cloth, WARES.food, lab[i]);
  // ---- rig: towers, roof grid, roof canopy, line arrays, lights, LED backdrop, banner
  B.T(1); const tx = 6.6, tz0 = sz0 + 0.3, tz1 = sz1 - 0.3, TH = 7.2; for (const x of [-tx, tx]) for (const z of [tz0, tz1]) B.tower(x, z, TH);
  const gy0 = gD + TH + 0.15; B.truss(-tx, tz0, tx, tz0, gy0).truss(-tx, tz1, tx, tz1, gy0).truss(-tx, tz0, -tx, tz1, gy0).truss(tx, tz0, tx, tz1, gy0);
  { const F = B.k.mb('evFabric'), y = gy0 + 0.2, r = 0.5; F.planar([[-tx - r, y, tz0 - r], [tx + r, y, tz0 - r], [tx + r, y + 1.1, (tz0 + tz1) / 2], [-tx - r, y + 1.1, (tz0 + tz1) / 2]], hex('#2b2d31'), 0.5); F.planar([[tx + r, y, tz1 + r], [-tx - r, y, tz1 + r], [-tx - r, y + 1.1, (tz0 + tz1) / 2], [tx + r, y + 1.1, (tz0 + tz1) / 2]], hex('#2b2d31'), 0.5); }
  for (const s of [-1, 1]) B.k.part('lineArray', s * 5.4, gy0 - 0.15, tz0 - 0.25, 0); for (let i = 0; i < 8; i++) B.k.part('par', -4.6 + i * 1.3, gy0 - 0.15, tz0 + 0.05, 0); for (let i = 0; i < 6; i++) B.k.part('par', -4 + i * 1.6, gy0 - 0.15, tz1 - 0.05, Math.PI);
  for (let i = 0; i < 4; i++) B.k.part('movHead', -4.5 + i * 3, top, sz1 - 0.6, Math.PI);
  B.beamsAt = []; for (let i = 0; i < 8; i++) B.beamsAt.push([-4.6 + i * 1.3, gy0 - 0.5, tz0 + 0.3, (i % 2 ? 1 : -1) * 0.25]);
  if (ev.screen !== false) B.print('evScreen', 0, top + 2.9, sz1 - 0.35, 8.0, 4.5, Math.PI, 'screen');
  B.print('evPrint', 0, gy0 + 0.75, tz0 - 0.18, 12.6, 1.55, Math.PI, 'banner');
  for (const s of [-1, 1]) B.print('evPrint', s * 9.4, gD + 3.3, sz0 + 1.2, 1.6, 3.2, Math.PI, s < 0 ? 'vbanA' : 'vbanB'); // vertical banners on two scaffold poles
  for (const s of [-1, 1]) { const x = s * 9.4, z = sz0 + 1.25; for (const dx of [-0.85, 0.85]) { B.k.mb('evSteel').cylinder(x + dx, B.gy(x, z), z, 0.03, 0.03, 5.1, 6, { col: [0.8, 0.8, 0.8] }); B.solid(x + dx - 0.15, z - 0.15, x + dx + 0.15, z + 0.15, 5, 'pole'); } }
  B.T(1); for (let i = 0; i < 3; i++) B.put('monitor', -3 + i * 3, sz0 + 0.6, 0, { abs: top }); for (let i = 0; i < 3; i++) B.put('micStand', -3 + i * 3, sz0 + 1.25, 0, { abs: top });
  B.put('console', 0, fz + 0.4, 0); for (let z = fz + fr + 0.5; z < sz0 - 1.4; z += 0.9) B.put('cableRamp', 0, z, Math.PI / 2);
  // performers' marks on the deck (facing the audience, −z) and the stage crew post
  for (let i = 0; i < 3; i++) B.stage.push({ x: -3 + i * 3, z: sz0 + 1.95, yaw: Math.PI, y: top, mic: true }); B.stage.push({ x: -4.5, z: sz1 - 1.6, yaw: Math.PI, y: top }, { x: 4.5, z: sz1 - 1.6, yaw: Math.PI, y: top }, { x: 0, z: sz1 - 2.2, yaw: Math.PI, y: top });
  // front-of-stage mojo barrier and the security pit
  B.T(0).run('mojo', -sx - 1, sz0 - 1.6, sx + 1, sz0 - 1.6, 1.0, { flip: true }); B.solid(-sx - 1, sz0 - 1.7, sx + 1, sz0 - 1.45, 1.25, 'barrier');
  B.posts.push({ role: 'security', x: -2.5, z: sz0 - 0.8, yaw: Math.PI, act: 'guard' }, { role: 'security', x: 2.5, z: sz0 - 0.8, yaw: Math.PI, act: 'crossarms' });
  B.posts.push({ role: 'tech', x: 0, z: fz - 0.3, yaw: 0, act: 'type' }, { role: 'tech', x: 0.9, z: fz - 0.6, yaw: 0.2, act: 'watch' }, { role: 'security', x: -3.2, z: -hd + 1.2, yaw: Math.PI, act: 'guard' }, { role: 'security', x: 3.2, z: -hd + 1.2, yaw: Math.PI, act: 'crossarms' }, { role: 'organiser', x: -9, z: -hd + 4, yaw: 0.6, act: 'comms' }, { role: 'cleaner', x: -12, z: 4, yaw: 0, roam: true });
  // ---- dress: info board, bins, signs, chairs / standing area, decorations
  B.T(2); B.put('infoBoard', -4.2, -hd + 3.8, Math.PI); B.info = { x: -4.2, z: -hd + 3.8 - 0.9 }; B.print('evPrint', -4.2, B.gy(-4.2, -hd + 3.8) + 1.45, -hd + 3.75, 1.2, 1.65, Math.PI, 'poster'); B.T(0).solid(-5, -hd + 3.7, -3.4, -hd + 3.95, 2.3, 'sign'); B.T(2);
  B.print('evPrint', 0, B.gy(0, -hd) + 2.6, -hd - 0.06, 6.2, 1.55, Math.PI, 'gate'); for (const s of [-1, 1]) { B.k.mb('evSteel').cylinder(s * 3.15, B.gy(s * 3.15, -hd), -hd - 0.06, 0.04, 0.04, 3.4, 6, { col: [0.75, 0.75, 0.75] }); }
  B.print('evPrint', W / 2 - 2.2, B.gy(W / 2 - 2.2, -hd + 6) + 2.15, -hd + 7.55, 1.4, 0.7, Math.PI, 'aid'); B.print('evPrint', -W / 2 + 1.0, B.gy(-W / 2 + 1, -3.2) + 2.5, -3.0, 1.2, 0.6, Math.PI, 'wc');
  for (const [x, z] of [[-10, -hd + 3], [10, -hd + 3], [-14, 8], [14, 8], [-14, -8], [W / 2 - 1.1, 2]]) { B.put('bin', x, z, 0, { tint: hex(((x * 3 + z) | 0) % 2 ? '#2f7d3a' : '#2b5fa8') }); B.T(0).solid(x - 0.35, z - 0.45, x + 0.35, z + 0.45, 1.05, 'bin'); B.T(2); }
  if (ev.seats) { B.chairRows(-10.5, 10.5, sz0 - 3.6, 9, 1.12, 0.9, hex('#f2f2f0'), hex('#d8d8d6')); B.nav.push({ x: 0, z: sz0 - 3.0 }, { x: -11.4, z: sz0 - 3.0 }, { x: 11.4, z: sz0 - 3.0 }, { x: -11.4, z: sz0 - 13 }, { x: 11.4, z: sz0 - 13 }, { x: 0, z: sz0 - 13.2 }); for (const s of B.seats) B.nav.push({ x: Math.abs(s.x) < 1 ? 0 : (s.x < 0 ? -11.4 : 11.4), z: s.az }); }
  B.standGrid(-11.5, ev.seats ? -hd + 6.5 : -hd + 7.5, 11.5, sz0 - (ev.seats ? 14.5 : 2.4), 0, B.watch.z, 1.0);
  deco(B, ev.deco, W, D, P);
  B.wander.push({ x: -12, z: -10 }, { x: 12, z: -10 }, { x: -12, z: 6 }, { x: 12, z: 6 }, { x: 0, z: -12 }, { x: -6, z: -15 }, { x: 6, z: -15 });
  B.nav.push({ x: -12, z: -12 }, { x: 12, z: -12 }, { x: -12.5, z: 6 }, { x: 12.5, z: 4 }, { x: -6, z: -14 }, { x: 6, z: -14 });
}
// ------------------------------------------------------------------------------------------------ EXPO (30 × 34): rows of stalls, marquee seating, small stage
function expoLayout(B, T, pal, ev) {
  const W = 30, D = 34, hd = D / 2; const P = PALETTES[pal]; const canopy = hex(P.canopy), cloth = hex(P.cloth); perimeter(B, W, D, 'fence', 7); if (ev.ticket) entryLane(B, D);
  const wares = WARES[ev.stalls] || WARES.food; const labs = ['stall0', 'stall1', 'stall2', 'stall3'];
  for (let i = 0; i < 5; i++) { const z = -8 + i * 3.1; B.stall(-10.9, z, Math.PI / 2, i % 2 ? hex(P.canopy) : hex(P.b), cloth, wares, labs[i % 4]); B.stall(-3.6, z, -Math.PI / 2, canopy, cloth, wares, labs[(i + 1) % 4]); B.stall(3.6, z, Math.PI / 2, canopy, cloth, wares, labs[(i + 2) % 4]); B.stall(10.9, z, -Math.PI / 2, i % 2 ? hex(P.b) : canopy, cloth, wares, labs[(i + 3) % 4]); }
  B.T(0); for (const x of [-12.45, 12.45, -2.15, 2.15]) B.solid(x - 0.1, -9.55, x + 0.1, 5.85, 2.1, 'wall'); // the backs of the rows are closed by PVC walls (thin colliders: the vendors stand inside)
  { const K = B.k; for (const x of [-12.45, 12.45, -2.15, 2.15]) for (let i = 0; i < 5; i++) { const z = -8 + i * 3.1; K.mb('evFabric').quad(x > 0 && Math.abs(x) > 5 || x < 0 && Math.abs(x) < 5 ? [x, B.gy(x, z), z - 1.5] : [x, B.gy(x, z), z + 1.5], x > 0 && Math.abs(x) > 5 || x < 0 && Math.abs(x) < 5 ? [x, B.gy(x, z), z + 1.5] : [x, B.gy(x, z), z - 1.5], x > 0 && Math.abs(x) > 5 || x < 0 && Math.abs(x) < 5 ? [x, B.gy(x, z) + 2.05, z + 1.5] : [x, B.gy(x, z) + 2.05, z - 1.5], x > 0 && Math.abs(x) > 5 || x < 0 && Math.abs(x) < 5 ? [x, B.gy(x, z) + 2.05, z - 1.5] : [x, B.gy(x, z) + 2.05, z + 1.5], [0, 0, 3, 2]); } } // back walls (white PVC)
  // marquee food court at the back (9 m across) with tables + chairs, small stage at its back
  const mz = hd - 6.5; B.T(0).put('marquee', 0, mz, Math.PI / 2, { tint: canopy }); for (const x of [-4.5, -2.25, 0, 2.25, 4.5]) for (const z of [mz - 3, mz + 3]) B.solid(x - 0.1, z - 0.1, x + 0.1, z + 0.1, 2.5, 'pole');
  for (let i = 0; i < 4; i++) { const x = -3 + (i % 2) * 6 - 0.0, z = mz - 1.2 + Math.floor(i / 2) * 2.2; B.T(2).put('table', x, z, 0).put('tableCloth', x, z, 0, { tint: cloth }); B.T(0).solid(x - 0.93, z - 0.4, x + 0.93, z + 0.4, 0.8, 'table');
    for (const s of [-1, 1]) for (const dx of [-0.5, 0.5]) { const cx = x + dx, cz = z + s * 0.72, yaw = s > 0 ? Math.PI : 0; B.chairs.push({ x: cx, z: cz, yaw, col: hex('#f2f2f0'), y: B.gy(cx, cz) }); B.seats.push({ x: cx, z: cz + (s > 0 ? -0.02 : 0.02), yaw, y: B.gy(cx, cz) + 0.44, ax: cx + (dx < 0 ? -0.55 : 0.55), az: cz, used: null, table: true }); } }
  B.watch = { x: 0, y: 1.6, z: hd - 2 };
  { const K = B.T(0).k, g = B.gy(0, hd - 2.2); K.mb('evDeck').box(0, g + 0.4, hd - 2.2, 5, 0.06, 2.6, { col: [1, 1, 1], uvScale: 0.5 }); K.mb('evSkirt').quad([2.5, g, hd - 3.51], [-2.5, g, hd - 3.51], [-2.5, g + 0.42, hd - 3.51], [2.5, g + 0.42, hd - 3.51], [0, 0, 5, 0.42]); K.mb('evBlack').box(0, g + 0.18, hd - 2.2, 4.9, 0.36, 2.5, { col: [0.5, 0.5, 0.5] }); B.solid(-2.5, hd - 3.5, 2.5, hd - 0.9, 0.43, 'stage'); B.stageTop = g + 0.43; }
  B.T(1); for (const s of [-1, 1]) { B.put('case', s * 3.1, hd - 2.4, 0).put('top', s * 3.1, hd - 2.4, Math.PI, { dy: 1.07 }); } B.T(0).solid(-3.45, hd - 2.75, -2.75, hd - 2.05, 2.1, 'speaker'); B.solid(2.75, hd - 2.75, 3.45, hd - 2.05, 2.1, 'speaker');
  B.T(1).put('micStand', 0, hd - 2.6, 0, { abs: B.stageTop }); B.stage.push({ x: 0, z: hd - 1.95, yaw: Math.PI, y: B.stageTop, mic: true }, { x: -1.4, z: hd - 1.8, yaw: Math.PI, y: B.stageTop });
  B.print('evPrint', 0, B.gy(0, hd - 1) + 2.0, hd - 0.95, 5.5, 0.7, Math.PI, 'banner');
  B.T(0).put('generator', 12.6, hd - 1.4, 0); B.solid(10.4, hd - 2.1, 14.8, hd - 0.7, 1.6, 'generator'); for (let i = 0; i < 2; i++) B.put('toilet', -W / 2 + 1.0, hd - 2 - i * 1.3, Math.PI / 2, { tint: hex('#2f8a4a') }); B.solid(-W / 2 + 0.35, hd - 3.95, -W / 2 + 1.65, hd - 1.35, 2.3, 'cabin');
  B.put('gazebo', W / 2 - 2.2, -hd + 4.5, -Math.PI / 2, { tint: hex('#f4f4f4') }); B.T(2).put('cot', W / 2 - 2.0, -hd + 4.5, 0); B.T(0).solid(W / 2 - 2.4, -hd + 3.5, W / 2 - 1.6, -hd + 5.5, 0.6, 'cot'); B.posts.push({ role: 'medic', x: W / 2 - 3.3, z: -hd + 4.6, yaw: -Math.PI / 2, act: 'crossarms' });
  if (ev.ticket) { B.T(2).put('desk', -4.4, -hd + 3.2, Math.PI); B.print('evPrint', -4.4, B.gy(-4.4, -hd + 3.2) + 0.55, -hd + 2.98, 1.8, 0.8, Math.PI, 'reg'); B.T(0).solid(-5.5, -hd + 2.9, -3.3, -hd + 3.9, 1.05, 'desk'); B.posts.push({ role: 'reg', x: -4.85, z: -hd + 3.85, yaw: Math.PI, act: 'type', seat: true }, { role: 'reg', x: -3.95, z: -hd + 3.85, yaw: Math.PI, act: 'talk', seat: true }); B.regDesk = { x: -2.6, z: -hd + 2.8, yaw: -Math.PI / 2 }; }
  B.T(2); B.put('infoBoard', 5, -hd + 3.2, Math.PI); B.info = { x: 5, z: -hd + 3.2 - 0.9 }; B.print('evPrint', 5, B.gy(5, -hd + 3.2) + 1.45, -hd + 3.15, 1.2, 1.65, Math.PI, 'poster'); B.T(0).solid(4.2, -hd + 3.1, 5.8, -hd + 3.35, 2.3, 'sign'); B.T(2);
  B.print('evPrint', 0, B.gy(0, -hd) + 2.6, -hd - 0.06, 6.8, 1.6, Math.PI, 'gate'); for (const s of [-1, 1]) B.k.mb('evSteel').cylinder(s * 3.45, B.gy(s * 3.45, -hd), -hd - 0.06, 0.04, 0.04, 3.4, 6, { col: [0.75, 0.75, 0.75] });
  for (const [x, z] of [[-7.2, -hd + 3], [7.2, -hd + 3], [-7.3, 7.5], [7.3, 7.5], [0, 7.4]]) { B.put('bin', x, z, 0, { tint: hex('#2f7d3a') }); B.T(0).solid(x - 0.35, z - 0.45, x + 0.35, z + 0.45, 1.05, 'bin'); B.T(2); }
  B.T(0).put('secHut', -7.5, -hd + 1.5, 0); B.solid(-8.3, -hd + 0.7, -6.7, -hd + 2.4, 2.4, 'cabin');
  B.posts.push({ role: 'security', x: -3.4, z: -hd + 1.2, yaw: Math.PI, act: 'guard' }, { role: 'security', x: 3.6, z: -hd + 1.2, yaw: Math.PI, act: 'crossarms' }, { role: 'organiser', x: 0, z: -hd + 6, yaw: 0, act: 'comms' }, { role: 'cleaner', x: 7, z: 0, roam: true }, { role: 'tech', x: 4.2, z: hd - 2.0, yaw: Math.PI, act: 'watch' });
  // browsing aisles (the outer ones are 3.6 m wide, the centre one 4.2 m) + standing in front of the small stage
  for (const ax of [-7.25, 0, 7.25]) for (let z = -9; z <= 6; z += 3) B.wander.push({ x: ax, z }); B.standGrid(-6.5, mz + 1.6, 6.5, hd - 4.4, 0, hd - 2, 1.0);
  for (const ax of [-7.25, 0, 7.25]) B.nav.push({ x: ax, z: -12 }, { x: ax, z: -1.5 }, { x: ax, z: 7.6 }); B.nav.push({ x: -5.5, z: mz }, { x: 5.5, z: mz }, { x: 0, z: mz });
  deco(B, ev.deco, W, D, P);
}
// ------------------------------------------------------------------------------------------------ SCREEN (30 × 34): big LED screen on a ground-support frame
function screenLayout(B, T, pal, ev) {
  const W = 30, D = 34, hd = D / 2; const P = PALETTES[pal]; const canopy = hex(P.canopy), cloth = hex(P.cloth); perimeter(B, W, D, 'barrier', 6);
  const sz = hd - 3, gS = B.gy(0, sz); B.T(1); for (const x of [-4.6, 4.6]) B.tower(x, sz, 6.4); B.truss(-4.6, sz, 4.6, sz, gS + 6.55);
  { const K = B.k; K.mb('evBlack').box(0, gS + 3.9, sz + 0.12, 8.6, 4.9, 0.14, { col: [0.5, 0.5, 0.5] }); } B.print('evScreen', 0, gS + 3.9, sz - 0.02, 8.32, 4.68, Math.PI, 'screen'); B.solid(-4.4, sz - 0.1, 4.4, sz + 0.3, 6.4, 'screen');
  for (const x of [-4.6, 4.6]) for (const dz of [-1.4, 1.4]) { B.k.mb('evPlastic').box(x, B.gy(x, sz + dz) + 0.35, sz + dz, 0.9, 0.7, 0.9, { col: hex('#c9c9c4') }); B.solid(x - 0.45, sz + dz - 0.45, x + 0.45, sz + dz + 0.45, 0.7, 'ballast'); B.k.mb('evSteel').box(x, B.gy(x, sz) + 0.9, sz + dz / 2, 0.06, 0.06, Math.abs(dz), { col: [0.7, 0.7, 0.7] }); } // water-filled ballast + stays
  B.T(0); for (const s of [-1, 1]) { const x = s * 6.3, z = sz - 0.4; B.put('sub', x, z, Math.PI).put('top', x, z, Math.PI, { dy: 0.7 }); B.solid(x - 0.65, z - 0.45, x + 0.65, z + 0.45, 1.7, 'speaker'); }
  B.print('evPrint', 0, gS + 7.25, sz - 0.2, 9.0, 1.1, Math.PI, 'banner'); B.watch = { x: 0, y: gS + 3.9, z: sz };
  B.T(0).put('generator', 12.5, hd - 1.5, 0); B.solid(10.3, hd - 2.2, 14.7, hd - 0.8, 1.6, 'generator');
  for (let i = 0; i < 3; i++) B.stall(W / 2 - 2.0, -hd + 6 + i * 3.4, -Math.PI / 2, canopy, cloth, WARES.food, ['stall0', 'stall1', 'stall2'][i]);
  for (let i = 0; i < 2; i++) B.put('toilet', -W / 2 + 1.0, -4 + i * 1.3, Math.PI / 2, { tint: hex('#2f8a4a') }); B.solid(-W / 2 + 0.35, -4.7, -W / 2 + 1.65, -1.75, 2.3, 'cabin');
  B.put('gazebo', -W / 2 + 2.4, -hd + 4.5, Math.PI / 2, { tint: hex('#f4f4f4') }); B.T(2).put('cot', -W / 2 + 2.2, -hd + 4.5, 0); B.T(0).solid(-W / 2 + 1.8, -hd + 3.5, -W / 2 + 2.6, -hd + 5.5, 0.6, 'cot'); B.posts.push({ role: 'medic', x: -W / 2 + 3.5, z: -hd + 4.6, yaw: Math.PI / 2, act: 'crossarms' });
  B.T(1).put('console', 0, -6.5, 0); B.T(0).solid(-0.6, -6.85, 0.6, -6.15, 0.95, 'desk'); B.posts.push({ role: 'tech', x: 0, z: -7.2, yaw: 0, act: 'type' });
  B.T(2); for (let z = -5.6; z < sz - 6; z += 0.9) B.put('cableRamp', 0, z, Math.PI / 2);
  if (ev.seats) { B.chairRows(-9.5, 9.5, sz - 6.5, 6, 1.12, 0.9, hex(P.a === '#123a7a' ? '#1f4fa0' : '#f2f2f0'), hex('#f2c230')); for (const s of B.seats) B.nav.push({ x: Math.abs(s.x) < 1 ? 0 : (s.x < 0 ? -10.4 : 10.4), z: s.az }); B.nav.push({ x: -10.4, z: sz - 5.8 }, { x: 10.4, z: sz - 5.8 }, { x: -10.4, z: sz - 13.5 }, { x: 10.4, z: sz - 13.5 }, { x: 0, z: sz - 13.4 }); }
  // mats on the grass in front of the chairs (people sit on the ground there)
  { const K = B.k; for (let i = 0; i < 6; i++) { const x = -7.5 + i * 3, z = sz - 4.6, g = B.gy(x, z) + 0.012; K.mb('evCloth').quad([x - 1.2, g, z - 0.7], [x + 1.2, g, z - 0.7], [x + 1.2, g, z + 0.7], [x - 1.2, g, z + 0.7], [0, 0, 2.4, 1.4]); for (const dx of [-0.6, 0.6]) B.seats.push({ x: x + dx, z, yaw: 0, y: g, ax: x + dx, az: z - 0.75, ground: true, used: null }); } }
  B.standGrid(-11, -hd + 6.5, 9, -8.5, 0, sz, 1.0);
  B.T(2); B.put('infoBoard', 4.2, -hd + 3.2, Math.PI); B.info = { x: 4.2, z: -hd + 3.2 - 0.9 }; B.print('evPrint', 4.2, B.gy(4.2, -hd + 3.2) + 1.45, -hd + 3.15, 1.2, 1.65, Math.PI, 'poster'); B.T(0).solid(3.4, -hd + 3.1, 5, -hd + 3.35, 2.3, 'sign'); B.T(2);
  B.print('evPrint', 0, B.gy(0, -hd) + 2.4, -hd - 0.06, 5.8, 1.4, Math.PI, 'gate'); for (const s of [-1, 1]) B.k.mb('evSteel').cylinder(s * 2.95, B.gy(s * 2.95, -hd), -hd - 0.06, 0.04, 0.04, 3.1, 6, { col: [0.75, 0.75, 0.75] });
  for (const [x, z] of [[-8, -hd + 3], [8, -hd + 3], [-12, 6], [11.5, 9]]) { B.put('bin', x, z, 0, { tint: hex('#2f7d3a') }); B.T(0).solid(x - 0.35, z - 0.45, x + 0.35, z + 0.45, 1.05, 'bin'); B.T(2); }
  B.posts.push({ role: 'security', x: -3.4, z: -hd + 1.2, yaw: Math.PI, act: 'guard' }, { role: 'security', x: 3.4, z: -hd + 1.2, yaw: Math.PI, act: 'crossarms' }, { role: 'organiser', x: -6, z: 4, yaw: 0, act: 'watch' }, { role: 'cleaner', x: 8, z: -6, roam: true });
  B.wander.push({ x: -11, z: -8 }, { x: 11, z: -10 }, { x: -11, z: 6 }, { x: 0, z: -12 }); B.nav.push({ x: -11.5, z: -9 }, { x: 11, z: -10 }, { x: -11.5, z: 7 }, { x: 11, z: 8 }, { x: 0, z: -11 });
  deco(B, ev.deco, W, D, P);
}
// ------------------------------------------------------------------------------------------------ GATHER (20 × 30): barriers, marquee (dansal / tea / health desk), low riser
function gatherLayout(B, T, pal, ev) {
  const W = 20, D = 30, hd = D / 2; const P = PALETTES[pal]; const canopy = hex(P.canopy), cloth = hex(P.cloth); perimeter(B, W, D, 'barrier', 5);
  const mz = hd - 4.2; B.T(0).put('marquee', 0, mz, Math.PI / 2, { tint: canopy }); for (const x of [-4.5, -2.25, 0, 2.25, 4.5]) for (const z of [mz - 3, mz + 3]) B.solid(x - 0.1, z - 0.1, x + 0.1, z + 0.1, 2.5, 'pole');
  // serving counter: three tables in a row under the front edge of the marquee, volunteers behind (dansal / tea / health check)
  for (let i = 0; i < 3; i++) { const x = -2 + i * 2; B.T(2).put('table', x, mz - 1.6, Math.PI).put('tableCloth', x, mz - 1.6, Math.PI, { tint: cloth }); }
  B.T(0).solid(-2.95, mz - 2.0, 2.95, mz - 1.2, 0.8, 'table');
  { const K = B.T(2).k; for (let i = 0; i < 3; i++) { const x = -2 + i * 2, z = mz - 1.6, y = B.gy(x, z) + 0.76; K.mb('evSteel').cylinder(x - 0.4, y, z, 0.17, 0.17, 0.45, 12, { col: [0.78, 0.78, 0.8] }); K.mb('evSteel').cylinder(x - 0.4, y + 0.45, z, 0.06, 0.17, 0.08, 12, { col: [0.6, 0.6, 0.62] }); for (let k = 0; k < 8; k++) K.mb('evPlastic').cylinder(x + 0.1 + (k % 4) * 0.12, y, z - 0.1 + Math.floor(k / 4) * 0.16, 0.035, 0.03, 0.08, 8, { col: hex('#f4f1ea') }); } } // tea urns + cups
  for (let i = 0; i < 3; i++) B.posts.push({ role: ev.dansal ? 'volunteer' : 'organiser', x: -2 + i * 2, z: mz - 0.75, yaw: Math.PI, act: 'interact', counter: true });
  B.counter = { x: 0, z: mz - 2.5, yaw: 0 };
  if (ev.dansal) { B.queue = { x: -2.6, z: mz - 2.6, dx: 0, dz: -1, sp: 0.95, n: 8, out: false, head: { x: -2.0, z: mz - 2.5 }, counter: true };
    B.T(0).run('barrier', -3.6, mz - 2.4, -3.6, mz - 9.4, 2.3, { h: 1.15 }); B.softBox(-3.5, mz - 9.6, -1.7, mz - 2.4); } // the queue rail
  B.watch = { x: 0, y: 1.6, z: mz };
  // riser for speeches / songs on the right, 2 tops on cases, mic
  { const K = B.T(0).k, x = 6.2, z = mz - 1.5, g = B.gy(x, z); K.mb('evDeck').box(x, g + 0.38, z, 3.0, 0.05, 2.4, { col: [1, 1, 1], uvScale: 0.5 }); K.mb('evSkirt').quad([x + 1.5, g, z - 1.21], [x - 1.5, g, z - 1.21], [x - 1.5, g + 0.4, z - 1.21], [x + 1.5, g + 0.4, z - 1.21], [0, 0, 3, 0.4]); K.mb('evBlack').box(x, g + 0.17, z, 2.95, 0.34, 2.35, { col: [0.5, 0.5, 0.5] }); B.solid(x - 1.5, z - 1.2, x + 1.5, z + 1.2, 0.41, 'stage'); B.stageTop = g + 0.41;
    B.T(1).put('micStand', x, z - 0.5, 0, { abs: B.stageTop }); B.stage.push({ x, z: z + 0.2, yaw: Math.PI, y: B.stageTop, mic: true }); B.put('case', x + 2.1, z, 0).put('top', x + 2.1, z, Math.PI, { dy: 1.07 }); B.T(0).solid(x + 1.75, z - 0.35, x + 2.45, z + 0.35, 2.1, 'speaker'); }
  if (ev.seats) { B.chairRows(-7.5, 7.5, mz - 3.6, 6, 1.12, 0.8, hex('#f2f2f0'), hex(P.b)); for (const s of B.seats) B.nav.push({ x: Math.abs(s.x) < 1 ? 0 : (s.x < 0 ? -8.4 : 8.4), z: s.az }); B.nav.push({ x: -8.4, z: mz - 4.0 }, { x: 8.4, z: mz - 4.0 }, { x: -8.4, z: mz - 11 }, { x: 8.4, z: mz - 11 }); }
  B.standGrid(-7.5, -hd + 4, 7.5, ev.seats ? mz - 11.6 : mz - 3.4, 0, mz, 1.05);
  B.T(0).put('generator', 7.2, hd - 1.3, 0); B.solid(5.0, hd - 2.0, 9.4, hd - 0.6, 1.6, 'generator'); B.put('toilet', -W / 2 + 1.0, hd - 2, Math.PI / 2, { tint: hex('#2f8a4a') }); B.solid(-W / 2 + 0.35, hd - 2.65, -W / 2 + 1.65, hd - 1.35, 2.3, 'cabin');
  B.T(2); B.put('infoBoard', 3.4, -hd + 2.6, Math.PI); B.info = { x: 3.4, z: -hd + 2.6 - 0.9 }; B.print('evPrint', 3.4, B.gy(3.4, -hd + 2.6) + 1.45, -hd + 2.55, 1.2, 1.65, Math.PI, 'poster'); B.T(0).solid(2.6, -hd + 2.5, 4.2, -hd + 2.75, 2.3, 'sign'); B.T(2);
  B.print('evPrint', 0, B.gy(0, -hd) + 2.4, -hd - 0.06, 4.8, 1.2, Math.PI, 'gate'); for (const s of [-1, 1]) B.k.mb('evSteel').cylinder(s * 2.45, B.gy(s * 2.45, -hd), -hd - 0.06, 0.04, 0.04, 3.0, 6, { col: [0.75, 0.75, 0.75] });
  B.print('evPrint', 0, B.gy(0, mz - 3) + 2.2, mz - 3.05, 4.4, 0.55, Math.PI, 'banner');
  for (const [x, z] of [[-6, -hd + 2.5], [6, -hd + 2.5], [-8.6, 4]]) { B.put('bin', x, z, 0, { tint: hex('#2f7d3a') }); B.T(0).solid(x - 0.35, z - 0.45, x + 0.35, z + 0.45, 1.05, 'bin'); B.T(2); }
  B.posts.push({ role: 'security', x: -3.0, z: -hd + 1.0, yaw: Math.PI, act: 'guard' }, { role: 'organiser', x: 3.0, z: -hd + 4.4, yaw: 0, act: 'comms' }, { role: 'cleaner', x: -6, z: 0, roam: true });
  if (ev.cat === 'community' && ev.id === 'wellness') B.posts.push({ role: 'medic', x: 2, z: mz - 0.8, yaw: Math.PI, act: 'interact' });
  B.wander.push({ x: -8.5, z: -10 }, { x: 8.5, z: -10 }, { x: -8.5, z: 5 }, { x: 8.5, z: 5 }); B.nav.push({ x: -8.6, z: -12 }, { x: 8.6, z: -12 }, { x: -8.6, z: mz - 3.2 }, { x: 8.6, z: mz - 3.2 }, { x: -4.4, z: mz - 2.8 }, { x: -2.6, z: mz - 10 });
  deco(B, ev.deco, W, D, P);
}
// ------------------------------------------------------------------------------------------------ decorations per theme (tier 2)
function deco(B, kind, W, D, P) {
  B.T(2); const hw = W / 2 - 0.5, hd = D / 2 - 0.5; const cols = [hex(P.a), hex(P.b), hex(P.c), hex('#ffffff')];
  if (kind === 'poya' || kind === 'vesak') { // Buddhist flags along the barriers, bunting of flags, paper lanterns under the marquee
    for (let z = -hd + 3; z < hd - 2; z += 4) { flagPole(B, -hw + 0.2, z, 3.6, true); flagPole(B, hw - 1.1, z, 3.6, true); }
    bunting(B, -hw + 0.2, -hd + 3, hw - 1.1, -hd + 3, 3.4, cols, true); bunting(B, -hw + 0.2, hd - 5, hw - 1.1, hd - 5, 3.4, cols, true);
    for (let i = 0; i < 6; i++) { const x = -3.75 + i * 1.5, z = hd - 4.4; lantern(B.k, x, B.gy(x, z) + 2.35, z, 0.2, hex(['#ffcc00', '#ff7f00', '#ffffff', '#0050a4', '#d40000', '#ffcc00'][i])); B.decoGlow++; }
    if (kind === 'vesak') for (let i = 0; i < 5; i++) { const x = -8 + i * 4, z = -hd + 6; lantern(B.k, x, B.gy(x, z) + 3.0, z, 0.32, hex(['#ffcc00', '#ff7f00', '#ffffff', '#ffcc00', '#ff7f00'][i])); B.decoGlow++; } }
  else if (kind === 'deepavali') { // rows of clay oil lamps along a kolam at the front, marigold-coloured bunting
    const g = B.gy(0, -hd + 6.5) + 0.006; B.k.mb('evPrint').quad([-2.4, g, -hd + 4.1], [2.4, g, -hd + 4.1], [2.4, g, -hd + 8.9], [-2.4, g, -hd + 8.9], [ATLAS.kolam[0] / 2048, 1 - (ATLAS.kolam[1] + ATLAS.kolam[3]) / 1024, (ATLAS.kolam[0] + ATLAS.kolam[2]) / 2048, 1 - ATLAS.kolam[1] / 1024]);
    oilLamps(B, -2.6, -hd + 3.9, 2.6, -hd + 3.9, 18); oilLamps(B, -2.6, -hd + 9.1, 2.6, -hd + 9.1, 18); oilLamps(B, -2.7, -hd + 4.0, -2.7, -hd + 9.0, 14); oilLamps(B, 2.7, -hd + 4.0, 2.7, -hd + 9.0, 14);
    bunting(B, -hw, -hd + 2, hw, -hd + 2, 3.0, [hex('#f4a51c'), hex('#e2462e'), hex('#f4a51c'), hex('#7a1c4b')]); bunting(B, -hw, 0, hw, 0, 3.2, [hex('#f4a51c'), hex('#e2462e')]); B.softBox(-2.8, -hd + 3.8, 2.8, -hd + 9.2); }
  else if (kind === 'harvest') { const g = B.gy(0, -hd + 6.5) + 0.006; B.k.mb('evPrint').quad([-2.2, g, -hd + 4.3], [2.2, g, -hd + 4.3], [2.2, g, -hd + 8.7], [-2.2, g, -hd + 8.7], [ATLAS.kolam[0] / 2048, 1 - (ATLAS.kolam[1] + ATLAS.kolam[3]) / 1024, (ATLAS.kolam[0] + ATLAS.kolam[2]) / 2048, 1 - ATLAS.kolam[1] / 1024]); B.softBox(-2.4, -hd + 4.1, 2.4, -hd + 8.9);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const x = s * (3.2 + k * 0.12), z = -hd + 4.4 + k * 0.08, gg = B.gy(x, z); B.k.mb('evPaint').cylinder(x, gg, z, 0.025, 0.03, 2.4, 6, { col: hex('#6b8e23') }); B.k.mb('evCloth').box(x, gg + 2.5, z, 0.3, 0.4, 0.01, { col: hex('#7fae3a') }); } // sugarcane at the kolam
    bunting(B, -hw, -hd + 2, hw, -hd + 2, 3.0, cols); }
  else if (kind === 'christmas') { for (let i = 0; i < 6; i++) { const x = -hw + 2 + i * ((W - 5) / 5), z = -hd + 2.5; star(B.k, x, B.gy(x, z) + 3.0, z, hex(i % 2 ? '#e9c46a' : '#ffffff')); B.decoGlow++; } bunting(B, -hw, -hd + 2.5, hw, -hd + 2.5, 3.1, [hex('#b91c1c'), hex('#14532d'), hex('#e9c46a')]); }
  else if (kind === 'heritage' || kind === 'community' || kind === 'gallery' || kind === 'sport' || kind === 'food') { bunting(B, -hw, -hd + 2, hw, -hd + 2, 3.0, cols); if (kind !== 'gallery') bunting(B, -hw, 2, hw, 2, 3.4, cols); if (kind === 'sport') for (let i = 0; i < 4; i++) flagPole(B, -hw + 0.3 + i * (W - 2) / 3, -hd + 1.2, 4.2, false, hex('#123a7a')); if (kind === 'heritage') for (let i = 0; i < 4; i++) flagPole(B, -hw + 0.3 + i * (W - 2) / 3, -hd + 1.2, 4.5, false, i % 2 ? hex('#6d1420') : hex('#d6a640')); }
  else if (kind === 'concert') { for (let i = 0; i < 2; i++) { const s = i ? 1 : -1; for (let k = 0; k < 12; k++) { const x = s * (W / 2 - 0.6), z = -hd + 4 + k * 2.6, g = B.gy(x, z); B.k.mb('evGlow').cylinder(x, g + 2.4, z, 0.05, 0.05, 0.08, 6, { col: hex(k % 3 === 0 ? '#ffd27a' : k % 3 === 1 ? '#ff7aa8' : '#7ad1ff') }); } } B.decoGlow += 24; }
}
function star(K, x, y, z, col) { const G = K.mb('evGlow'); const pts = []; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, r = i % 2 ? 0.14 : 0.34; pts.push([x + Math.sin(a) * r, y + Math.cos(a) * r, z]); } for (let i = 0; i < 10; i++) G.planar([[x, y, z], pts[i], pts[(i + 1) % 10]], col, 1); K.mb('evPaint').cylinder(x, y + 0.34, z, 0.006, 0.006, 0.8, 4, { col: [0.1, 0.1, 0.1] }); }

const BUILD = { stage: stageLayout, expo: expoLayout, screen: screenLayout, gather: gatherLayout };
// site: { x, z, yaw, W, D, base }; gy(lx, lz): ground height above base; rng(): deterministic
export function buildLayout(T, type, site, gy, rng) {
  const B = new Ctx(site, gy, rng); BUILD[type.tpl](B, T, type.pal, type);
  if (!B.watch) B.watch = { x: 0, y: 1.6, z: site.D / 2 - 4 };
  return B;
}
export { COL };
