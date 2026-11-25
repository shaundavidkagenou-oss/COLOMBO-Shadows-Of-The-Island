// 92nd — STREET RACING: precomputed routes on the existing road graph (world/Layout.js). Nothing here runs per frame.
//
// A route is a closed loop (or a sprint) through grid junctions on level-0 / level-1 roads. build() checks every grid
// segment it runs along really exists (a road the graph rejected — water, a landmark zone — fails loudly), then makes:
//   1. the centre line, sampled every STEP metres, each 90° junction turned on an arc whose radius is the narrower road's
//      half width (the inside edge of that arc is exactly the kerb corner of the junction box);
//   2. the usable half width at every sample (road half width minus a kerb margin; a car's own half width is subtracted
//      by the driver);
//   3. the racing line: a constrained minimum-curvature relaxation of the lateral offset inside that corridor (outside →
//      apex → outside), smoothed;
//   4. its curvature, heading and arc length — everything a driver needs to pick a corner speed (v = √(a·R)) and a
//      braking point (backwards pass over the deceleration it trusts), computed per driver in RaceDriver.prepare().
// Plain arrays (Float32Array) so a driver's per-frame lookup is an index walk, never a search of the whole route.
import * as L from '../world/Layout.js';

export const STEP = 2; // m between samples
const KERB = 1.1; // m kept clear of the kerb line (sticking out mirrors, the gutter)

// corners: junction coordinates [x, z] in driving order. meet: where the cars wait before the race (start straight).
export const ROUTES = {
  marine: {
    id: 'marine', name: 'Marine Drive Circuit', short: 'Marine Drive / Galle Road', laps: 2, loop: true,
    corners: [[-475, 40], [-475, 900], [-400, 900], [-400, 40]], startS: 60,
    blurb: 'Down the sea front on Marine Drive, back up Galle Road. Two long straights, four junction corners — top speed and late braking.',
  },
  cinnamon: {
    id: 'cinnamon', name: 'Cinnamon Gardens Run', short: 'Duplication Rd / Bauddhaloka Mw', laps: 2, loop: true,
    corners: [[-280, 40], [-280, 400], [240, 400], [240, 40]], startS: 60,
    blurb: 'Duplication Road, Bauddhaloka Mawatha past the embassies, Darley Road and back along Dharmapala. Narrower on Darley Road.',
  },
  fort: {
    id: 'fort', name: 'Fort & Pettah Circuit', short: 'Port Access Rd / Baseline Rd / Olcott Mw', laps: 1, loop: true,
    corners: [[-400, -1000], [660, -1000], [660, -660], [-400, -660]], startS: 80,
    blurb: 'Along the harbour wall on Port Access Road, down Baseline Road, back past Fort and Maradana stations on Olcott Mawatha, up Janadhipathi Mawatha. One long lap.',
  },
};

const xi = (x) => L.XS.findIndex((l) => l.pos === x), zj = (z) => L.ZS.findIndex((l) => l.pos === z);
// grid segments between two junctions on one line (null when any piece is missing)
function segsBetween(a, b) {
  const out = []; if (a[0] === b[0]) { const i = xi(a[0]); let j0 = zj(a[1]), j1 = zj(b[1]); if (i < 0 || j0 < 0 || j1 < 0) return null; const d = j1 > j0 ? 1 : -1;
    for (let j = j0; j !== j1; j += d) { const s = L.getV(i, d > 0 ? j : j - 1); if (!s) return null; out.push(s); } }
  else if (a[1] === b[1]) { const j = zj(a[1]); let i0 = xi(a[0]), i1 = xi(b[0]); if (j < 0 || i0 < 0 || i1 < 0) return null; const d = i1 > i0 ? 1 : -1;
    for (let i = i0; i !== i1; i += d) { const s = L.getH(d > 0 ? i : i - 1, j); if (!s) return null; out.push(s); } }
  else return null; return out;
}
// half width of the road at a point along a leg (narrowest piece of the leg near that point)
function hwAlong(segs, x, z) { let best = null, bd = 1e9; for (const s of segs) { const cx = Math.max(Math.min(x, Math.max(s.x0, s.x1)), Math.min(s.x0, s.x1)), cz = Math.max(Math.min(z, Math.max(s.z0, s.z1)), Math.min(s.z0, s.z1)); const d = Math.hypot(cx - x, cz - z); if (d < bd) { bd = d; best = s; } } return best ? best.hw : 6; }

const CACHE = new Map();
export function buildRoute(id) {
  if (CACHE.has(id)) return CACHE.get(id); const R = ROUTES[id]; if (!R) throw new Error('no route ' + id);
  const C = R.corners, n = C.length, legs = [];
  for (let k = 0; k < (R.loop ? n : n - 1); k++) { const a = C[k], b = C[(k + 1) % n]; const segs = segsBetween(a, b); if (!segs) throw new Error(`route ${id}: no road from ${a} to ${b}`); legs.push({ a, b, segs, len: Math.hypot(b[0] - a[0], b[1] - a[1]), hw: Math.min(...segs.map((s) => s.hw)), level: Math.max(...segs.map((s) => s.level)) }); }
  // corner radius at each junction = the narrower road's half width
  const rad = C.map((c, k) => { const lin = legs[(k - 1 + legs.length) % legs.length], lout = legs[k]; if (!R.loop && (k === 0 || k === n - 1)) return 0; return Math.min(lin.hw, lout.hw); });
  const P = []; // [x, z, hw]
  const push = (x, z, hw) => P.push([x, z, hw]);
  for (let k = 0; k < legs.length; k++) {
    const g = legs[k]; const dx = (g.b[0] - g.a[0]) / g.len, dz = (g.b[1] - g.a[1]) / g.len; const r0 = rad[k], r1 = rad[(k + 1) % n] || 0;
    const s0 = r0, s1 = g.len - (R.loop || k < legs.length - 1 ? r1 : 0);
    for (let s = s0; s < s1; s += STEP) { const x = g.a[0] + dx * s, z = g.a[1] + dz * s; push(x, z, hwAlong(g.segs, x, z)); }
    // the arc into the next leg
    if (R.loop || k < legs.length - 1) { const h = legs[(k + 1) % legs.length]; const ex = (h.b[0] - h.a[0]) / h.len, ez = (h.b[1] - h.a[1]) / h.len; const r = r1; if (r > 0) {
      const ax = g.b[0] - dx * r, az = g.b[1] - dz * r; const cx = ax + ex * r, cz = az + ez * r; // arc centre: the inside kerb corner
      const a0 = Math.atan2(ax - cx, az - cz), a1 = Math.atan2(g.b[0] + ex * r - cx, g.b[1] + ez * r - cz); let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const m = Math.max(2, Math.ceil(Math.abs(da) * r / STEP)); const hwc = Math.min(g.hw, h.hw) * 1.0 + r * (Math.SQRT2 - 1) * 0.9; // the junction box is wider on the diagonal
      for (let q = 0; q < m; q++) { const a = a0 + da * (q / m); push(cx + Math.sin(a) * r, cz + Math.cos(a) * r, hwc); } } }
  }
  if (!R.loop) { const g = legs[legs.length - 1]; push(g.b[0], g.b[1], g.hw); }
  // resample evenly
  const N0 = P.length; const cum = [0]; for (let i = 1; i < N0; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = R.loop ? cum[N0 - 1] + Math.hypot(P[0][0] - P[N0 - 1][0], P[0][1] - P[N0 - 1][1]) : cum[N0 - 1];
  const N = Math.floor(total / STEP); const cx = new Float32Array(N), cz = new Float32Array(N), hw = new Float32Array(N);
  for (let i = 0, k = 0; i < N; i++) { const s = i * STEP; while (k < N0 - 1 && cum[k + 1] < s) k++; const a = P[k], b = P[(k + 1) % N0]; const segL = (k + 1 < N0 ? cum[k + 1] : total) - cum[k]; const t = segL > 1e-6 ? (s - cum[k]) / segL : 0;
    cx[i] = a[0] + (b[0] - a[0]) * t; cz[i] = a[1] + (b[1] - a[1]) * t; hw[i] = Math.min(a[2], b[2]) - KERB; }
  // normals (left of travel)
  const nx = new Float32Array(N), nz = new Float32Array(N); const at = (i) => (R.loop ? (i + N) % N : Math.max(0, Math.min(N - 1, i)));
  for (let i = 0; i < N; i++) { const a = at(i - 1), b = at(i + 1); let tx = cx[b] - cx[a], tz = cz[b] - cz[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; nx[i] = tz; nz[i] = -tx; }
  // racing line: minimum curvature inside the corridor (relaxation of the lateral offset)
  const off = new Float32Array(N); const lim = new Float32Array(N); for (let i = 0; i < N; i++) lim[i] = Math.max(0.5, hw[i] - 1.0);
  // (minimises the summed squared second difference of the line — its curvature — not its length: a length-minimising band
  // hugs the inside kerb all the way round and turns tight at the corner; this one runs wide before a corner, clips the
  // apex and drifts out on the exit). Coarse-to-fine: the long-wavelength shape settles on every 4th / 2nd sample first.
  const px = new Float32Array(N), pz = new Float32Array(N); for (let i = 0; i < N; i++) { px[i] = cx[i]; pz[i] = cz[i]; }
  for (const [st, iters] of [[8, 1000], [4, 700], [2, 500], [1, 500]]) for (let it = 0; it < iters; it++) for (let i = 0; i < N; i++) {
    if (!R.loop && (i < 2 * st || i > N - 1 - 2 * st)) continue; let a = i - st, b = i + st, a2 = i - 2 * st, b2 = i + 2 * st; if (a < 0) a += N; if (a2 < 0) a2 += N; if (b >= N) b -= N; if (b2 >= N) b2 -= N;
    const qx = (4 * (px[a] + px[b]) - (px[a2] + px[b2])) / 6, qz = (4 * (pz[a] + pz[b]) - (pz[a2] + pz[b2])) / 6;
    let o = off[i] + ((qx - px[i]) * nx[i] + (qz - pz[i]) * nz[i]) * 0.6; if (o > lim[i]) o = lim[i]; else if (o < -lim[i]) o = -lim[i]; off[i] = o; px[i] = cx[i] + nx[i] * o; pz[i] = cz[i] + nz[i] * o; }
  // line geometry: position, heading, curvature (signed, + = turning left), arc length along the line
  const lx = new Float32Array(N), lz = new Float32Array(N), hd = new Float32Array(N), kap = new Float32Array(N), ls = new Float32Array(N);
  for (let i = 0; i < N; i++) { lx[i] = cx[i] + nx[i] * off[i]; lz[i] = cz[i] + nz[i] * off[i]; }
  for (let i = 0; i < N; i++) { const a = at(i - 1), b = at(i + 1); hd[i] = Math.atan2(lx[b] - lx[a], lz[b] - lz[a]); }
  for (let i = 0; i < N; i++) { const a = at(i - 2), b = at(i + 2); let dh = hd[b] - hd[a]; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; const ds = Math.hypot(lx[b] - lx[a], lz[b] - lz[a]) || 1; kap[i] = dh / ds; }
  { const k2 = new Float32Array(N); for (let i = 0; i < N; i++) { let s = 0; for (let d = -3; d <= 3; d++) s += kap[at(i + d)]; k2[i] = s / 7; } kap.set(k2); } // smoothed (the relaxation leaves a little ripple)
  for (let i = 1; i < N; i++) ls[i] = ls[i - 1] + Math.hypot(lx[i] - lx[i - 1], lz[i] - lz[i - 1]);
  const lineLen = R.loop ? ls[N - 1] + Math.hypot(lx[0] - lx[N - 1], lz[0] - lz[N - 1]) : ls[N - 1];
  // checkpoints every ~260 m of centre line (the start / finish line is index startI)
  const startI = Math.min(N - 1, Math.round((R.startS || 0) / STEP)); const cps = []; const every = Math.round(260 / STEP);
  for (let k = 1; k * every < N - every / 3; k++) cps.push((startI + k * every) % N);
  const out = { id, name: R.name, short: R.short, def: R, N, loop: !!R.loop, laps: R.laps, cx, cz, hw, nx, nz, off, lx, lz, hd, kap, ls, len: total, lineLen, startI, cps, legs: legs.map((g) => ({ a: g.a, b: g.b, len: g.len, hw: g.hw, level: g.level, name: g.segs[0].name })), at };
  CACHE.set(id, out); return out;
}
// nearest sample to (x, z), searching a window around a hint index (no whole-route scan per frame)
export function nearestIdx(R, x, z, hint = -1, win = 40) {
  let best = -1, bd = 1e18; if (hint < 0) { for (let i = 0; i < R.N; i += 4) { const d = (R.cx[i] - x) ** 2 + (R.cz[i] - z) ** 2; if (d < bd) { bd = d; best = i; } } hint = best; bd = 1e18; win = 6; }
  for (let d = -win; d <= win; d++) { const i = R.at(hint + d); const q = (R.cx[i] - x) ** 2 + (R.cz[i] - z) ** 2; if (q < bd) { bd = q; best = i; } } return best;
}
// lateral offset of (x, z) from the centre line at sample i (+ = left of travel)
export function lateral(R, i, x, z) { return (x - R.cx[i]) * R.nx[i] + (z - R.cz[i]) * R.nz[i]; }
// grid slots behind the start line: two columns, staggered
export function gridSlots(R, n) {
  const out = []; for (let k = 0; k < n; k++) { const row = Math.floor(k / 2), col = k % 2; const i = R.at(R.startI - 2 - Math.round((row * 9 + col * 4.5) / STEP)); const side = col ? -1 : 1; const o = side * Math.min(3.2, R.hw[i] * 0.4);
    out.push({ x: R.cx[i] + R.nx[i] * o, z: R.cz[i] + R.nz[i] * o, yaw: Math.atan2(R.cx[R.at(i + 1)] - R.cx[i], R.cz[R.at(i + 1)] - R.cz[i]), i }); }
  return out;
}
