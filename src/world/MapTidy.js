// 61st request — whole-map sweep fixes, run as passes over the finished plan (so every generator keeps its random stream and
// the city keeps its layout):
//  • tidyWalls: compound walls built twice (the side wall on a plot line shared by two cells / two street sides was emitted by
//    both, 168 identical boxes) are removed; every run is told what meets each of its ends so BuildingGen.buildWall can draw
//    corners and joints without coplanar faces (the coping overhangs of two abutting runs overlapped 8 cm, and at every
//    corner the side wall's end face and coping sat in the plane of the front wall's face: flickering patches).
//  • clearWalkLines: no tree trunk on a pedestrian walking line. Street trees were planted in the middle of the pavement
//    (hw + walk × 0.55, the pedestrian network walks at hw + walk × 0.5) and garden trees could land on it too. Each such
//    trunk moves sideways to the nearest spot clear of every walking line (on a pavement that is the kerb-side tree-pit band
//    or the boundary side), keeping clear of the road, walls, furniture, buildings and other trunks; a big species that
//    cannot fit a narrow pavement becomes a slim mast tree (ashoka) in the tree-pit band, and only if that fails is it dropped.
import * as L from './Layout.js';

const EPS = 0.012;
const alongX = (w) => w.x1 - w.x0 >= w.z1 - w.z0;
const ovl = (a, b, e = 0.005) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > e && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > e;

export function tidyWalls(plan) {
  const W = plan.walls; const drop = new Set(); const st = { dup: 0, abut: 0, corner: 0 };
  // a 20 m grid by footprint so each wall only meets its neighbours
  const G = new Map(), gs = 20; const cells = (w, f) => { for (let i = Math.floor((w.x0 - 0.3) / gs); i <= Math.floor((w.x1 + 0.3) / gs); i++) for (let j = Math.floor((w.z0 - 0.3) / gs); j <= Math.floor((w.z1 + 0.3) / gs); j++) f(i + ',' + j); };
  for (const w of W) cells(w, (k) => { let a = G.get(k); if (!a) G.set(k, (a = [])); a.push(w); });
  const trim = (o, ax, lo, hi) => { const c = plan.colliders.find((q) => q.kind === 'wall' && q.x0 === o.x0 && q.x1 === o.x1 && q.z0 === o.z0 && q.z1 === o.z1);
    for (const t of [o, c]) { if (!t) continue; if (ax) { if (lo !== null) t.x0 = lo; if (hi !== null) t.x1 = hi; } else { if (lo !== null) t.z0 = lo; if (hi !== null) t.z1 = hi; } } st.trim = (st.trim || 0) + 1; };
  const near = (w) => { const s = new Set(); cells(w, (k) => { for (const o of G.get(k) || []) if (o !== w) s.add(o); }); return s; };
  // 1. duplicates: same line, same thickness, range inside another run's (the earlier one stays; the taller height wins)
  for (const w of W) { if (drop.has(w)) continue; const ax = alongX(w);
    for (const o of near(w)) { if (drop.has(o) || alongX(o) !== ax) continue;
      const same = ax ? Math.abs(o.z0 - w.z0) < 0.02 && Math.abs(o.z1 - w.z1) < 0.02 : Math.abs(o.x0 - w.x0) < 0.02 && Math.abs(o.x1 - w.x1) < 0.02; if (!same) continue;
      const [w0, w1, o0, o1] = ax ? [w.x0, w.x1, o.x0, o.x1] : [w.z0, w.z1, o.z0, o.z1];
      if (o0 >= w0 - 0.02 && o1 <= w1 + 0.02) { drop.add(o); st.dup++; if (o.h > w.h) w.h = o.h; continue; }
      // partly over this run: the other one is cut back to meet it end to end (its collider with it)
      if (o0 < w1 - 0.02 && o1 > w1 + 0.02 && o0 >= w0 - 0.02) trim(o, ax, w1, null); else if (o1 > w0 + 0.02 && o0 < w0 - 0.02 && o1 <= w1 + 0.02) trim(o, ax, null, w0); } }
  if (drop.size) { const key = (c) => `${c.x0},${c.x1},${c.z0},${c.z1}`; const dk = new Map(); for (const w of drop) dk.set(key(w), (dk.get(key(w)) || 0) + 1);
    const keepW = new Set(W.filter((w) => !drop.has(w)).map(key)); // the surviving run keeps its own collider (identical box)
    plan.colliders = plan.colliders.filter((c) => { if (c.kind !== 'wall') return true; const k = key(c); const n = dk.get(k); if (!n) return true; if (keepW.has(k)) { dk.set(k, n - 1); if (n - 1 <= 0) dk.delete(k); return false; } return true; });
    plan.walls = W.filter((w) => !drop.has(w)); for (const ch of plan.byChunk) if (ch.walls) ch.walls = ch.walls.filter((w) => !drop.has(w)); }
  // the survivors' colliders: raise any whose run took a taller duplicate's height
  { const byKey = new Map(plan.walls.map((w) => [`${w.x0},${w.x1},${w.z0},${w.z1}`, w])); for (const c of plan.colliders) if (c.kind === 'wall') { const w = byKey.get(`${c.x0},${c.x1},${c.z0},${c.z1}`); if (w && w.h > c.h) c.h = w.h; } }
  // 1b. the first / last side wall of a row was centred on the property line, so its outer half (0.12 m) stood on the
  //     pavement: moved in to stand on the plot, flush with the line (its collider with it)
  for (const w of plan.walls) { const c = L.cellAt((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2); if (!c || !c.lot || !c.land) continue; const [l0, l1, m0, m1] = c.lot, [a0, a1, b0, b1] = c.land; let dx = 0, dz = 0;
    if (w.x0 < l0 - 0.005 && w.x1 > l0 && l0 - a0 > 0.5) dx = l0 - w.x0; else if (w.x1 > l1 + 0.005 && w.x0 < l1 && a1 - l1 > 0.5) dx = l1 - w.x1;
    if (w.z0 < m0 - 0.005 && w.z1 > m0 && m0 - b0 > 0.5) dz = m0 - w.z0; else if (w.z1 > m1 + 0.005 && w.z0 < m1 && b1 - m1 > 0.5) dz = m1 - w.z1;
    if (Math.abs(dx) > 0.3 || Math.abs(dz) > 0.3 || (!dx && !dz)) continue;
    const col = plan.colliders.find((q) => q.kind === 'wall' && q.x0 === w.x0 && q.x1 === w.x1 && q.z0 === w.z0 && q.z1 === w.z1);
    for (const t of [w, col]) if (t) { t.x0 += dx; t.x1 += dx; t.z0 += dz; t.z1 += dz; } st.offPave = (st.offPave || 0) + 1; }
  // 2. joints: what meets each end. e0/e1 = 'abut' (a collinear run continues: coping flush, no overhang) or 'under' (this run
  //    ends inside a crossing run: its end and coping stop 12 mm short of that run's faces and sit 12 mm lower)
  for (const w of plan.walls) { const ax = alongX(w); const [w0, w1] = ax ? [w.x0, w.x1] : [w.z0, w.z1];
    for (const o of near(w)) { if (drop.has(o)) continue; const oax = alongX(o);
      if (oax === ax) { const same = ax ? Math.abs(o.z0 - w.z0) < 0.02 && Math.abs(o.z1 - w.z1) < 0.02 : Math.abs(o.x0 - w.x0) < 0.02 && Math.abs(o.x1 - w.x1) < 0.02; if (!same) continue;
        const [o0, o1] = ax ? [o.x0, o.x1] : [o.z0, o.z1]; if (Math.abs(o1 - w0) < 0.02 || (o0 < w0 && o1 > w0)) { w.e0 = w.e0 || 'abut'; st.abut++; } if (Math.abs(o0 - w1) < 0.02 || (o0 < w1 && o1 > w1)) { w.e1 = w.e1 || 'abut'; st.abut++; } continue; }
      if (!ovl(w, o, -0.005)) continue;
      // perpendicular: at a corner the z-running run gives way to the x-running one (consistent, so a corner is never drawn
      // twice); at a T (a run ending against the side of another, mid-span) the ending run gives way
      const [o0, o1] = ax ? [o.x0, o.x1] : [o.z0, o.z1]; const [p0, p1] = ax ? [o.z0, o.z1] : [o.x0, o.x1]; const [t0, t1] = ax ? [w.z0, w.z1] : [w.x0, w.x1];
      const oEnds = (p0 >= t0 - 0.02 && p0 <= t1 + 0.02) || (p1 >= t0 - 0.02 && p1 <= t1 + 0.02); // the other run ends inside this one's thickness
      if (ax && oEnds) continue; // corner (both end here): the z-running one is flagged when it is visited; a T with the other ending: likewise
      if (w0 >= o0 - 0.02 && w0 <= o1 + 0.02) { w.e0 = 'under'; st.corner++; } if (w1 >= o0 - 0.02 && w1 <= o1 + 0.02) { w.e1 = 'under'; st.corner++; } } }
  plan.wallTidy = st; return st;
}
export const WALL_EPS = EPS;

// ---------------------------------------------------------------- trees off the walking lines
export function clearWalkLines(plan, { treeTrunkR, onRailReserve, inSchool, chunkIndex }) {
  const PED_R = 0.32, GAP = 0.12; // a walker's radius + a little air
  const gs = 16; const put = (M, x0, z0, x1, z1, v) => { for (let i = Math.floor(x0 / gs); i <= Math.floor(x1 / gs); i++) for (let j = Math.floor(z0 / gs); j <= Math.floor(z1 / gs); j++) { const k = i * 100003 + j; let a = M.get(k); if (!a) M.set(k, (a = [])); a.push(v); } };
  const get = (M, x, z, r) => { const out = new Set(); for (let i = Math.floor((x - r) / gs); i <= Math.floor((x + r) / gs); i++) for (let j = Math.floor((z - r) / gs); j <= Math.floor((z + r) / gs); j++) for (const v of M.get(i * 100003 + j) || []) out.add(v); return out; };
  const lineD = walkLineDist;
  // obstacles: solid colliders (walls, poles, furniture, stalls…) and buildings (crown room: 1.6 m, as the building refit)
  const CG = new Map(); for (const c of plan.colliders) { if (c.kind === 'tree' || c.kind === 'building' || !(c.h > 0.3) || c.walkUnder) continue; put(CG, c.x0, c.z0, c.x1, c.z1, c); }
  const BG = new Map(); for (const b of plan.buildings) put(BG, b.x0, b.z0, b.x1, b.z1, b);
  const TG = new Map(); for (const t of plan.trees) put(TG, t.x, t.z, t.x, t.z, t);
  const boxGap = (x, z, c) => Math.hypot(Math.max(c.x0 - x, 0, x - c.x1), Math.max(c.z0 - z, 0, z - c.z1));
  const free = (t, x, z, r) => { if (L.isWater(x, z) || onRailReserve(x, z) || inSchool(x, z)) return false;
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) if (L.roadAt(x + ox, z + oz)) return false; // the whole trunk off the carriageway
    if (lineD(x, z)[0] < r + PED_R + GAP) return false;
    for (const c of get(CG, x, z, r + 1)) if (c !== t.col && boxGap(x, z, c) < r + 0.1) return false;
    for (const b of get(BG, x, z, 3)) if (boxGap(x, z, b) < 1.6) return false;
    for (const o of get(TG, x, z, 4)) if (o !== t && Math.hypot(o.x - x, o.z - z) < r + treeTrunkR(o) + 0.9) return false;
    return true; };
  const STREET = new Set(['rain', 'mara', 'kottamba', 'flamboyant', 'bo', 'mango', 'jak']);
  const moved = [], dropped = [], slim = []; let checked = 0;
  for (const t of plan.trees) { if (t.bats || t.type === 'nuga') continue; const r = treeTrunkR(t); const [d, s] = lineD(t.x, t.z); if (!s || d >= r + PED_R + GAP) continue; checked++;
    // sideways off the nearest line (perpendicular to it), nearest spot first; then a little along it as well
    const dx = s[2] - s[0], dz = s[3] - s[1], l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, nx = -uz, nz = ux;
    const tryAt = (rr) => { for (let off = 0.1; off <= 3.2 + 1e-6; off += 0.1) for (const along of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4]) for (const sg of [1, -1]) {
      const x = t.x + nx * off * sg + ux * along, z = t.z + nz * off * sg + uz * along; if (free(t, x, z, rr)) return [x, z]; } return null; };
    let to = tryAt(r), swap = false;
    if (!to && STREET.has(t.type) && onPave(t.x, t.z)) { const s2 = 0.95, r2 = 0.25 * s2; to = tryAt(r2); swap = !!to; }
    if (!to) { dropped.push(t); continue; }
    const c0 = chunkIndex(t.x, t.z), mx = to[0] - t.x, mz = to[1] - t.z; t.x = to[0]; t.z = to[1];
    if (swap) { slim.push(t.type); t.type = 'ashoka'; t.s = 0.95; const cr = 0.35 * t.s; if (t.col) { t.col.x0 = t.x - cr; t.col.x1 = t.x + cr; t.col.z0 = t.z - cr; t.col.z1 = t.z + cr; } }
    else if (t.col) { t.col.x0 += mx; t.col.x1 += mx; t.col.z0 += mz; t.col.z1 += mz; }
    const c1 = chunkIndex(t.x, t.z); if (c1 !== c0) { if (c0 >= 0) plan.byChunk[c0].trees = plan.byChunk[c0].trees.filter((q) => q !== t); if (c1 >= 0) plan.byChunk[c1].trees.push(t); }
    put(TG, t.x, t.z, t.x, t.z, t); moved.push(t); }
  if (dropped.length) { const ds = new Set(dropped), cols = new Set(dropped.map((t) => t.col).filter(Boolean)); plan.trees = plan.trees.filter((t) => !ds.has(t)); plan.colliders = plan.colliders.filter((c) => !cols.has(c)); for (const ch of plan.byChunk) ch.trees = ch.trees.filter((t) => !ds.has(t)); }
  plan.walkClear = { checked, moved: moved.length, slim: slim.length, dropped: dropped.length }; return plan.walkClear;
}
// on a pavement: inside a cell's land but outside its lot (the strip between kerb and property line)
function onPave(x, z) { const c = L.cellAt(x, z); if (!c || !c.land || !c.lot) return false; const [a0, a1, b0, b1] = c.land, [l0, l1, m0, m1] = c.lot; const inLand = x >= a0 && x <= a1 && z >= b0 && z <= b1; const inLot = x > l0 && x < l1 && z > m0 && z < m1; return inLand && !inLot; }

// distance from (x, z) to the nearest pedestrian walking line (pavements, open-area links, zebra crossings) and that line
// [ax, az, bx, bz]; the network is static (Layout), indexed once on a 16 m grid
let WL = null;
export function walkLineDist(x, z) {
  if (!WL) { WL = new Map(); for (const e of L.pedEdges) { const a = L.pedNodes[e.a], b = L.pedNodes[e.b]; const s = [a.x, a.z, b.x, b.z];
    for (let i = Math.floor(Math.min(a.x, b.x) / 16); i <= Math.floor(Math.max(a.x, b.x) / 16); i++) for (let j = Math.floor(Math.min(a.z, b.z) / 16); j <= Math.floor(Math.max(a.z, b.z) / 16); j++) { const k = i * 100003 + j; let q = WL.get(k); if (!q) WL.set(k, (q = [])); q.push(s); } } }
  let d = 1e9, best = null; const r = 6;
  for (let i = Math.floor((x - r) / 16); i <= Math.floor((x + r) / 16); i++) for (let j = Math.floor((z - r) / 16); j <= Math.floor((z + r) / 16); j++) for (const s of WL.get(i * 100003 + j) || []) {
    const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz; let t = l2 > 0 ? ((x - s[0]) * dx + (z - s[1]) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t)); const q = Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t); if (q < d) { d = q; best = s; } }
  return [d, best];
}
// the clearance a trunk of radius r needs from a walking line
export const walkNeed = (r) => r + 0.32 + 0.12;
// the smallest distance from a box to any walking line near it
export function walkBoxGap(x0, x1, z0, z1) { walkLineDist(x0, z0); let m = 1e9; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = Math.max(x1 - x0, z1 - z0) / 2 + 4;
  for (let i = Math.floor((cx - R) / 16); i <= Math.floor((cx + R) / 16); i++) for (let j = Math.floor((cz - R) / 16); j <= Math.floor((cz + R) / 16); j++) for (const s of WL.get(i * 100003 + j) || []) {
    const n = Math.max(2, Math.ceil(Math.hypot(s[2] - s[0], s[3] - s[1]) / 0.1)); for (let k = 0; k <= n; k++) { const x = s[0] + (s[2] - s[0]) * k / n, z = s[1] + (s[3] - s[1]) * k / n; if (Math.abs(x - cx) > R || Math.abs(z - cz) > R) continue;
      const g = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)); if (g < m) m = g; } }
  return m; }
// head-room corridors over the walking lines near (x, z): [x0, x1, z0, z1, top] boxes (the crown fit keeps leaves out of them
// below 2.15 m — people walk under the street trees, not through their foliage). Axis-aligned lines only (all but a few links).
export function walkBoxes(x, z, R) { walkLineDist(x, z); const out = []; const seen = new Set();
  for (let i = Math.floor((x - R) / 16); i <= Math.floor((x + R) / 16); i++) for (let j = Math.floor((z - R) / 16); j <= Math.floor((z + R) / 16); j++) for (const s of WL.get(i * 100003 + j) || []) {
    if (seen.has(s)) continue; seen.add(s); const x0 = Math.min(s[0], s[2]), x1 = Math.max(s[0], s[2]), z0 = Math.min(s[1], s[3]), z1 = Math.max(s[1], s[3]);
    if (x1 - x0 > 0.3 && z1 - z0 > 0.3) continue; if (x1 < x - R || x0 > x + R || z1 < z - R || z0 > z + R) continue;
    out.push([x0 - 0.45, x1 + 0.45, z0 - 0.45, z1 + 0.45, 2.15]); }
  return out; }
