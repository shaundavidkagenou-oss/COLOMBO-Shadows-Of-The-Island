// Railway: one smooth centre-line path (the Layout.RAIL polyline with filleted curves) shared by the track geometry,
// the platforms, the level crossings and the running trains (src/vehicles/Trains.js).
// Sri Lanka Railways uses broad gauge (1,676 mm / 5 ft 6 in); rails here are built at that gauge.
import * as L from './Layout.js';

export const GAUGE = 1.676;
export const RAIL_OFF = GAUGE / 2 + 0.036; // rail-head centre from the track centre line
export const BALLAST_Y = L.LAND_Y + 0.15; // top of the ballast bed
export const SLEEPER_TOP = BALLAST_Y + 0.03; // concrete sleepers sit mostly embedded in the ballast
export const RAIL_TOP = SLEEPER_TOP + 0.15; // running surface — constant along the whole line (crossings are humped decks)
export const DECK_HW = 2.3, RAMP = 5; // level-crossing deck half-width and ramp length either side
export const PLATFORM_EDGE = 1.65; // platform face from the track centre (a train body is ~3.1 m wide)
const STEP = 2;

// ---------------------------------------------------------------- smooth path
function buildPath() {
  const R = L.RAIL; const pts = [R[0]];
  for (let i = 1; i < R.length - 1; i++) {
    const [ax, az] = R[i - 1], [bx, bz] = R[i], [cx, cz] = R[i + 1];
    const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz);
    const d1 = [(bx - ax) / l1, (bz - az) / l1], d2 = [(cx - bx) / l2, (cz - bz) / l2];
    const turn = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
    if (turn < 1e-3) { pts.push(R[i]); continue; }
    // fillet radius ≤ 160 m, tangent length limited to 45 % of each neighbouring leg
    let t = 160 * Math.tan(turn / 2); t = Math.min(t, 0.45 * l1, 0.45 * l2); const rad = t / Math.tan(turn / 2);
    const p1 = [bx - d1[0] * t, bz - d1[1] * t]; const side = Math.sign(d1[0] * d2[1] - d1[1] * d2[0]); // + = turning toward +normal
    const nx = -d1[1] * side, nz = d1[0] * side; const ox = p1[0] + nx * rad, oz = p1[1] + nz * rad; // arc centre
    const a0 = Math.atan2(p1[1] - oz, p1[0] - ox); const n = Math.max(2, Math.ceil((rad * turn) / 1.5));
    for (let k = 0; k <= n; k++) { const a = a0 + side * turn * (k / n); pts.push([ox + Math.cos(a) * rad, oz + Math.sin(a) * rad]); }
  }
  pts.push(R[R.length - 1]);
  // resample at a fixed spacing → index = s / STEP
  const xs = [], zs = []; let carry = 0; xs.push(pts[0][0]); zs.push(pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const l = Math.hypot(bx - ax, bz - az); let s = STEP - carry;
    while (s <= l) { xs.push(ax + ((bx - ax) * s) / l); zs.push(az + ((bz - az) * s) / l); s += STEP; }
    carry = l - (s - STEP);
  }
  // relax the dense path (Laplacian smoothing) so tight dog-legs become continuous-curvature curves, then resample evenly
  for (let it = 0; it < ITER; it++) for (let k = 1; k < xs.length - 1; k++) { xs[k] = 0.5 * xs[k] + 0.25 * (xs[k - 1] + xs[k + 1]); zs[k] = 0.5 * zs[k] + 0.25 * (zs[k - 1] + zs[k + 1]); }
  const X = [xs[0]], Z = [zs[0]]; let c2 = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const l = Math.hypot(xs[i + 1] - xs[i], zs[i + 1] - zs[i]); let s = STEP - c2;
    while (s <= l) { X.push(xs[i] + ((xs[i + 1] - xs[i]) * s) / l); Z.push(zs[i] + ((zs[i + 1] - zs[i]) * s) / l); s += STEP; }
    c2 = l - (s - STEP);
  }
  return { xs: Float64Array.from(X), zs: Float64Array.from(Z), total: (X.length - 1) * STEP };
}
const ITER = 80;
export const PATH = buildPath();

// position + unit heading at arc length s (clamped)
export function sampleAt(s, out = {}) {
  const n = PATH.xs.length; const f = Math.max(0, Math.min(PATH.total - 1e-6, s)) / STEP; const i = Math.min(n - 2, Math.floor(f)); const t = f - i;
  const ax = PATH.xs[i], az = PATH.zs[i], bx = PATH.xs[i + 1], bz = PATH.zs[i + 1]; const l = Math.hypot(bx - ax, bz - az) || 1;
  out.x = ax + (bx - ax) * t; out.z = az + (bz - az) * t; out.dx = (bx - ax) / l; out.dz = (bz - az) / l; return out;
}
// nearest arc length to a point (coarse scan + local refine); returns {s, d}
export function nearestS(x, z) {
  let best = 1e18, bi = 0; for (let i = 0; i < PATH.xs.length; i += 4) { const d = (PATH.xs[i] - x) ** 2 + (PATH.zs[i] - z) ** 2; if (d < best) { best = d; bi = i; } }
  for (let i = Math.max(0, bi - 5); i <= Math.min(PATH.xs.length - 1, bi + 5); i++) { const d = (PATH.xs[i] - x) ** 2 + (PATH.zs[i] - z) ** 2; if (d <= best) { best = d; bi = i; } }
  const p = sampleAt(bi * STEP); const along = (x - p.x) * p.dx + (z - p.z) * p.dz; const s = Math.max(0, Math.min(PATH.total, bi * STEP + along));
  const q = sampleAt(s); return { s, d: Math.hypot(x - q.x, z - q.z) };
}

// ---------------------------------------------------------------- stations: where trains stop (arc length of the platform centre)
export const STOPS = L.STATIONS.map((st) => ({ ...st, s: nearestS(st.x, st.z).s })).sort((a, b) => a.s - b.s);

// ---------------------------------------------------------------- level crossings: road segments flagged `crossing` in Layout
function findCrossings() {
  const out = [];
  for (const sg of L.segments) {
    if (!sg.crossing) continue; const mx = (sg.x0 + sg.x1) / 2, mz = (sg.z0 + sg.z1) / 2;
    // the point on the segment centre line nearest to the railway
    let bestD = 1e9, bx = mx, bz = mz; const n = 40;
    for (let k = 0; k <= n; k++) { const x = sg.x0 + ((sg.x1 - sg.x0) * k) / n, z = sg.z0 + ((sg.z1 - sg.z0) * k) / n; const r = nearestS(x, z); if (r.d < bestD) { bestD = r.d; bx = x; bz = z; } }
    if (bestD > 6) continue; const r = nearestS(bx, bz); const p = sampleAt(r.s);
    if (out.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 12)) continue;
    const ax = sg.dir === 'v' ? [0, 1] : [1, 0]; const sinA = Math.max(0.35, Math.abs(ax[0] * p.dz - ax[1] * p.dx)); // road ⟂ rail → 1
    const half = Math.min(18, ((sg.hw || 5) + (sg.walk || 3) + 1) / sinA);
    out.push({ x: p.x, z: p.z, s: r.s, rdx: p.dx, rdz: p.dz, ax, half, seg: sg, dir: sg.dir, hw: sg.hw || 5, closed: false, boom: 0 });
  }
  return out;
}
export const CROSSINGS = findCrossings();

// ---------------------------------------------------------------- track geometry (called by GroundBuilder per chunk)
// quad whose face points along `want` (flips the winding if needed — mis-wound ballast was being back-face culled)
function quadFacing(m, a, b, c, d, uv, col, want) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * want[0] + ny * want[1] + nz * want[2] >= 0) m.quad(a, b, c, d, uv, col); else m.quad(b, a, d, c, [uv[2], uv[1], uv[0], uv[3]], col); // reversed winding, same UV per vertex
}
export function buildTrack(at) {
  const n = PATH.xs.length; const UP = [0, 1, 0];
  const BAL = [1, 1, 1], BAL_S = [0.86, 0.84, 0.8], SLP = [0.62, 0.6, 0.56], RAILC = [0.66, 0.64, 0.62], RAIL_SIDE = [0.36, 0.3, 0.27], DECK = [0.3, 0.3, 0.31], RAMPC = [0.36, 0.36, 0.37];
  const deckAt = (s) => CROSSINGS.some((c) => Math.abs(s - c.s) <= c.half);
  let segs = 0;
  for (let i = 0; i < n - 1; i++) {
    const x0 = PATH.xs[i], z0 = PATH.zs[i], x1 = PATH.xs[i + 1], z1 = PATH.zs[i + 1]; const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const water = L.isWater(mx, mz) && !L.inCanal(mz) && !L.bridgeWalkAt(mx, mz); if (water) continue;
    const l = Math.hypot(x1 - x0, z1 - z0) || 1; const dx = (x1 - x0) / l, dz = (z1 - z0) / l;
    // mitred normals at both ends so curved track has no gaps or overlaps
    const nrm = (k) => { const a = sampleAt(Math.max(0, k - 0.5) * STEP), b = sampleAt(Math.min(PATH.total, (k + 0.5) * STEP)); const tx = a.dx + b.dx, tz = a.dz + b.dz, tl = Math.hypot(tx, tz) || 1; return [-tz / tl, tx / tl]; };
    const [n0x, n0z] = nrm(i), [n1x, n1z] = nrm(i + 1);
    const P = (w, y, end) => (end ? [x1 + n1x * w, y, z1 + n1z * w] : [x0 + n0x * w, y, z0 + n0z * w]);
    const mb = at(mx, mz); const conc = mb.get('concrete'), metal = mb.get('metal'), bal = mb.get('ballast');
    if (L.isWater(mx, mz)) { // canal: steel plate-girder bridge carrying the ballast bed
      const gy0 = BALLAST_Y - 1.3, gy1 = BALLAST_Y + 0.55, GC = [0.32, 0.35, 0.36];
      for (const sd of [-1, 1]) {
        quadFacing(metal, P(sd * 2.1, gy0, 0), P(sd * 2.1, gy1, 0), P(sd * 2.1, gy1, 1), P(sd * 2.1, gy0, 1), [0, 0, 1, 1], GC, [n0x * sd, 0, n0z * sd]);
        quadFacing(metal, P(sd * 1.95, gy0, 0), P(sd * 1.95, gy1, 0), P(sd * 1.95, gy1, 1), P(sd * 1.95, gy0, 1), [0, 0, 1, 1], GC, [-n0x * sd, 0, -n0z * sd]);
        quadFacing(metal, P(sd * 1.95, gy1, 0), P(sd * 2.1, gy1, 0), P(sd * 2.1, gy1, 1), P(sd * 1.95, gy1, 1), [0, 0, 1, 1], GC, UP);
      }
      quadFacing(metal, P(-2.1, gy0, 0), P(2.1, gy0, 0), P(2.1, gy0, 1), P(-2.1, gy0, 1), [0, 0, 1, 1], [0.25, 0.27, 0.28], [0, -1, 0]);
      if (i % 5 === 0) conc.box(x0, gy0 - 1.5, z0, 1.2, 3, 4.6, { col: [0.6, 0.58, 0.55], rotY: Math.atan2(dx, dz) + Math.PI / 2 }); // pier
    }
    const deck = deckAt((i + 0.5) * STEP), deckPrev = i > 0 && deckAt((i - 0.5) * STEP), deckNext = deckAt((i + 1.5) * STEP);
    if (deck) {
      // humped level crossing: a flat deck level with the rail heads and asphalt ramps down to the road either side
      const dy = RAIL_TOP - 0.006;
      quadFacing(conc, P(-DECK_HW, dy, 0), P(DECK_HW, dy, 0), P(DECK_HW, dy, 1), P(-DECK_HW, dy, 1), [0, 0, 1.5, 1], DECK, UP);
      for (const sd of [-1, 1]) {
        quadFacing(conc, P(sd * DECK_HW, dy, 0), P(sd * (DECK_HW + RAMP), L.ROAD_Y - 0.01, 0), P(sd * (DECK_HW + RAMP), L.ROAD_Y - 0.01, 1), P(sd * DECK_HW, dy, 1), [0, 0, 1, 1], RAMPC, [n0x * sd, 1, n0z * sd]);
        for (const [cap, end, want] of [[!deckPrev, 0, [-dx, 0, -dz]], [!deckNext, 1, [dx, 0, dz]]]) if (cap) {
          const a = P(sd * DECK_HW, dy, end), b = P(sd * (DECK_HW + RAMP), L.ROAD_Y - 0.01, end), c = P(sd * DECK_HW, L.ROAD_Y - 0.01, end);
          quadFacing(conc, a, b, c, c, [0, 0, 1, 1], RAMPC, want);
        }
      }
      for (const [cap, end, want] of [[!deckPrev, 0, [-dx, 0, -dz]], [!deckNext, 1, [dx, 0, dz]]]) if (cap) quadFacing(conc, P(-DECK_HW, L.LAND_Y - 0.02, end), P(DECK_HW, L.LAND_Y - 0.02, end), P(DECK_HW, dy, end), P(-DECK_HW, dy, end), [0, 0, 1, 0.3], RAMPC, want);
      // white edge lines on the deck
      for (const sd of [-1, 1]) quadFacing(conc, P(sd * (DECK_HW - 0.25), dy + 0.004, 0), P(sd * (DECK_HW - 0.1), dy + 0.004, 0), P(sd * (DECK_HW - 0.1), dy + 0.004, 1), P(sd * (DECK_HW - 0.25), dy + 0.004, 1), [0, 0, 1, 1], [0.9, 0.9, 0.86], UP);
    } else {
      const by = BALLAST_Y;
      quadFacing(bal, P(-1.9, by, 0), P(1.9, by, 0), P(1.9, by, 1), P(-1.9, by, 1), [0, (i * STEP) % 64, 3.8, (i * STEP) % 64 + STEP], BAL, UP);
      for (const sd of [-1, 1]) quadFacing(bal, P(sd * 1.9, by, 0), P(sd * 3.1, L.LAND_Y - 0.03, 0), P(sd * 3.1, L.LAND_Y - 0.03, 1), P(sd * 1.9, by, 1), [0, (i * STEP) % 64, 1.2, (i * STEP) % 64 + STEP], BAL_S, [n0x * sd, 0.6, n0z * sd]);
      for (let s = 0; s < l; s += 0.65) { const sx = x0 + dx * s, sz = z0 + dz * s; conc.box(sx, SLEEPER_TOP - 0.06, sz, 0.24, 0.12, 2.6, { col: SLP, rotY: Math.atan2(dx, dz) + Math.PI / 2, top: true }); }
    }
    // rails: foot, web and head (broad gauge)
    for (const sd of [-1, 1]) {
      const o = sd * RAIL_OFF; const y0 = RAIL_TOP - 0.15, yWeb = y0 + 0.012, yHead = y0 + 0.11, yTop = RAIL_TOP;
      if (!deck) {
        quadFacing(metal, P(o - 0.065, yWeb, 0), P(o + 0.065, yWeb, 0), P(o + 0.065, yWeb, 1), P(o - 0.065, yWeb, 1), [0, 0, 1, 1], RAIL_SIDE, UP); // foot
        for (const e of [-1, 1]) quadFacing(metal, P(o + e * 0.009, yWeb, 0), P(o + e * 0.009, yHead, 0), P(o + e * 0.009, yHead, 1), P(o + e * 0.009, yWeb, 1), [0, 0, 1, 1], RAIL_SIDE, [n0x * e, 0, n0z * e]); // web
        for (const e of [-1, 1]) quadFacing(metal, P(o + e * 0.036, yHead, 0), P(o + e * 0.036, yTop, 0), P(o + e * 0.036, yTop, 1), P(o + e * 0.036, yHead, 1), [0, 0, 1, 1], RAIL_SIDE, [n0x * e, 0, n0z * e]); // head sides
      } else for (const e of [-1, 1]) quadFacing(conc, P(o + e * 0.04, RAIL_TOP - 0.001, 0), P(o + e * 0.1, RAIL_TOP - 0.001, 0), P(o + e * 0.1, RAIL_TOP - 0.001, 1), P(o + e * 0.04, RAIL_TOP - 0.001, 1), [0, 0, 1, 1], [0.08, 0.08, 0.08], UP); // flangeway grooves
      quadFacing(metal, P(o - 0.036, yTop, 0), P(o + 0.036, yTop, 0), P(o + 0.036, yTop, 1), P(o - 0.036, yTop, 1), [0, 0, 1, 1], RAILC, UP); // polished running surface
    }
    segs++;
  }
  return segs;
}
// ground height of the railway formation (ballast bed / crossing hump) — registered with Layout.groundY so the player,
// pedestrians and vehicles stand on the bed and drive over the humped level crossings instead of sinking into them.
export function railGroundAt(x, z) {
  if (L.distToRail(x, z) > 14) return null;
  const r = nearestS(x, z); const d = r.d; if (d > DECK_HW + RAMP + 0.5) return null;
  for (const c of CROSSINGS) if (Math.abs(r.s - c.s) <= c.half) { const top = RAIL_TOP - 0.006; if (d <= DECK_HW) return top; if (d <= DECK_HW + RAMP) return top + ((L.ROAD_Y - top) * (d - DECK_HW)) / RAMP; return null; }
  if (L.roadAt(x, z)) return null;
  if (d <= 1.9) return BALLAST_Y; if (d <= 3.1) return BALLAST_Y + ((L.LAND_Y - BALLAST_Y) * (d - 1.9)) / 1.2; return null;
}
L.setGroundHook(railGroundAt);
