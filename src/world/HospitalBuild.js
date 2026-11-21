// 74th request — builds the National Hospital from HospitalPlan (data) with HospitalKit (materials + furniture):
//   • exterior shell (outer faces, windows, canopies, signs, grounds) + a simplified far LOD, merged by material;
//   • one group per ROOM (its floor, ceiling, the room-side half of every wall round it, its window insides and its
//     furniture, merged by material) so the runtime (Hospital.js) can draw only the rooms that can be seen;
//   • moving parts (sliding entrance leaves, hinged door leaves, lift doors) as small separate meshes;
//   • world colliders (outside) and per-floor obstacle boxes (inside), the light points of every room, the portals.
// Everything is built once at load (no material / geometry is made while playing).
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { HOSP, Y0, FLOOR_Y, ROOMS, DOORS, OUTER, ROOFS, WINDOWS, FURNITURE, STAIR, LIFT, GROUNDS, GARDEN_TREES, GARDEN_BEDS, roomAt } from './HospitalPlan.js';
import { hospitalMatTable, hospitalMaterials, drawItem, C, plateUV, bigUV, BIG, screenUV } from './HospitalKit.js';
import { bushBall, hedgeBox } from './HedgeBush.js'; // 75th: real shrubs and clipped hedges (leaf cards, the city's shared foliage materials)
import { parkBench, parkBenchColliders } from './ParkBench.js';
import { GARDEN_FOUNTAIN } from './PlaceAmbience.js';
import { buildBodyRoom } from './HospitalBodyRoom.js'; // 75th

const { PX, FZ, H, CEIL, SLAB, WALL, EXT } = HOSP;
const X = (u) => PX + u, Z = (v) => FZ - v;
const EPS = 1e-4;
// per-room finishes: dado [material, colour, height], wall colour, corridor crash rail
const STYLE = {
  lobby: { dado: ['h_wood', '#ffffff', 1.1], wall: '#f4f0e6' }, pharmacy: { dado: ['h_wall', '#cfe3da', 1.0], wall: '#f3f3ef' },
  ed: { dado: ['h_wall', '#bcdcd0', 1.2], wall: '#f2f4f2', rail: true }, corr0: { dado: ['h_wall', '#c4dbe6', 1.0], wall: '#f3f1ea', rail: true },
  corr1: { dado: ['h_wall', '#c4dbe6', 1.0], wall: '#f3f1ea', rail: true }, wc: { dado: ['h_tile', '#ffffff', 2.1], wall: '#eef0ee' },
  treat1: { dado: ['h_wall', '#bfe0d2', 1.2], wall: '#f3f4f1' }, treat2: { dado: ['h_wall', '#bfe0d2', 1.2], wall: '#f3f4f1' },
  ward: { dado: ['h_wall', '#c9e2d6', 1.0], wall: '#f4f3ee', rail: true }, nurses: { dado: ['h_wall', '#c9e2d6', 1.0], wall: '#f4f3ee' },
  consult: { dado: ['h_wood', '#ffffff', 1.0], wall: '#f3efe7' }, store: { dado: ['h_wall', '#d4d8da', 1.0], wall: '#eeeeea' },
  private1: { dado: ['h_wood', '#ffffff', 0.95], wall: '#f2ece0' }, private2: { dado: ['h_wood', '#ffffff', 0.95], wall: '#f2ece0' },
  stairs: { dado: ['h_wall', '#c4dbe6', 1.0], wall: '#f3f1ea' }, lift: { dado: ['h_metal', '#e0e3e5', 3.3], wall: '#d8dbdd' },
};
const FLOORMAT = { terrazzo: ['h_terrazzo', '#ffffff', 1], vinyl: ['h_vinyl', '#e4e8e4', 2], vinylBlue: ['h_vinyl', '#cfe0ea', 2], tileWc: ['h_tile', '#ffffff', 1], steel: ['h_metal', '#8a8f93', 1], rubber: ['h_vinyl', '#74787c', 3] };
export const DOOR_HEIGHT = { slide: 2.4, open: 2.4, swing: HOSP.DOOR_H, double: HOSP.DOOR_H, lift: 2.1 };
export function doorSpanY(d) { return d.kind === 'hatch' ? [0.95, 2.1] : [0, DOOR_HEIGHT[d.kind] || 2.2]; }
const winSpanY = (w) => (w[5] === 'clear' ? [0.12, 2.95] : [HOSP.WIN_SILL, HOSP.WIN_HEAD]);

// ---------------------------------------------------------------------------------------------- geometry helpers
// quad with an explicit outward normal n (the corner order is flipped if needed)
function Q(b, p0, p1, p2, p3, n, uv, col) {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * n[0] + ny * n[1] + nz * n[2] < 0) b.quad(p1, p0, p3, p2, uv ? [uv[2], uv[1], uv[0], uv[3]] : undefined, col); else b.quad(p0, p1, p2, p3, uv || undefined, col);
}
// a point on wall line (axis, at) at along-coordinate s, offset o (in the line's own +normal axis), height y
function WP(axis, at, s, o, y) { return axis === 'u' ? [X(s), y, Z(at + o)] : [X(at + o), y, Z(s)]; }
// world normal of the +offset direction of a wall line (axis 'u': +v = world −z; axis 'v': +u = world +x)
const NRM = (axis, sgn) => (axis === 'u' ? [0, 0, -sgn] : [sgn, 0, 0]);
const SN = (axis, sgn) => (axis === 'u' ? [sgn, 0, 0] : [0, 0, -sgn]); // world direction of +s
// flat face on a wall line at offset o, spanning s0..s1, y0..y1, facing the sgn side
function face(b, axis, at, o, sgn, s0, s1, y0, y1, col, uvs = 2) {
  if (s1 - s0 < EPS || y1 - y0 < EPS) return;
  Q(b, WP(axis, at, s0, o, y0), WP(axis, at, s1, o, y0), WP(axis, at, s1, o, y1), WP(axis, at, s0, o, y1), NRM(axis, sgn), [s0 / uvs, y0 / uvs, s1 / uvs, y1 / uvs], col);
}
// subtract holes [s0,s1,y0,y1] from the rect s0..s1 × y0..y1 → list of rects
function cut(s0, s1, y0, y1, holes) {
  const hs = holes.filter((h) => h[1] > s0 + EPS && h[0] < s1 - EPS && h[3] > y0 + EPS && h[2] < y1 - EPS);
  const xs = [s0, s1]; for (const h of hs) { if (h[0] > s0) xs.push(h[0]); if (h[1] < s1) xs.push(h[1]); } xs.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) { const a = xs[i], c = xs[i + 1]; if (c - a < EPS) continue; const m = (a + c) / 2;
    const ys = hs.filter((h) => h[0] < m && h[1] > m).map((h) => [Math.max(y0, h[2]), Math.min(y1, h[3])]).sort((p, q) => p[0] - q[0]);
    let y = y0; for (const [ya, yb] of ys) { if (ya > y + EPS) out.push([a, c, y, ya]); y = Math.max(y, yb); } if (y1 > y + EPS) out.push([a, c, y, y1]); }
  return out;
}
// a box along an arbitrary segment p→q (square section w), for sloped handrails
function bar(b, p, q, w, col) {
  const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]; const L = Math.hypot(...d); if (L < EPS) return; const t = d.map((x) => x / L);
  let s = [t[2], 0, -t[0]]; let sl = Math.hypot(...s); if (sl < 1e-3) { s = [1, 0, 0]; sl = 1; } s = s.map((x) => (x / sl) * w / 2);
  const up = [t[1] * s[2] - t[2] * s[1], t[2] * s[0] - t[0] * s[2], t[0] * s[1] - t[1] * s[0]]; const ul = Math.hypot(...up) || 1; const u = up.map((x) => (x / ul) * w / 2);
  const P = (o, a, c) => [o[0] + a * s[0] + c * u[0], o[1] + a * s[1] + c * u[1], o[2] + a * s[2] + c * u[2]];
  const sides = [[1, 1, -1, 1], [-1, 1, -1, -1], [-1, -1, 1, -1], [1, -1, 1, 1]];
  for (const [a0, c0, a1, c1] of sides) { const n = [(a0 + a1) / 2 * s[0] + (c0 + c1) / 2 * u[0], (a0 + a1) / 2 * s[1] + (c0 + c1) / 2 * u[1], (a0 + a1) / 2 * s[2] + (c0 + c1) / 2 * u[2]]; Q(b, P(p, a0, c0), P(q, a0, c0), P(q, a1, c1), P(p, a1, c1), n, null, col); }
}
// the segments of a room rect's edge that are not shared with another rect of the same room
function freeEdges(room) {
  const out = [];
  room.rects.forEach((r, i) => {
    const edges = [['u', r[2], r[0], r[1], 1], ['u', r[3], r[0], r[1], -1], ['v', r[0], r[2], r[3], 1], ['v', r[1], r[2], r[3], -1]]; // [axis, at, s0, s1, side the room is on]
    for (const [axis, at, s0, s1, sgn] of edges) {
      let segs = [[s0, s1]];
      room.rects.forEach((q, j) => { if (j === i) return; // a shared edge of another rect of this room on the other side
        const qa = axis === 'u' ? [q[2], q[3]] : [q[0], q[1]], qs = axis === 'u' ? [q[0], q[1]] : [q[2], q[3]];
        if (Math.abs((sgn > 0 ? qa[1] : qa[0]) - at) > EPS) return;
        segs = segs.flatMap(([a, b]) => { const lo = Math.max(a, qs[0]), hi = Math.min(b, qs[1]); if (hi - lo < EPS) return [[a, b]]; const o = []; if (lo - a > EPS) o.push([a, lo]); if (b - hi > EPS) o.push([hi, b]); return o; }); });
      for (const [a, b] of segs) out.push({ axis, at, s0: a, s1: b, sgn });
    }
  });
  return out;
}
const onLine = (o, axis, at, s0, s1) => o.axis === axis && Math.abs(o.at - at) < EPS && o.s[1] > s0 + EPS && o.s[0] < s1 - EPS;
function isOuter(f, axis, at, s0, s1) { return OUTER.some((w) => w[0] === f && w[1] === axis && Math.abs(w[2] - at) < EPS && w[4] > s0 + EPS && w[3] < s1 - EPS); }
const windowsOn = (f, axis, at) => WINDOWS.filter((w) => w[0] === f && w[1] === axis && Math.abs(w[2] - at) < EPS);

// ---------------------------------------------------------------------------------------------- the build
export function buildHospital() {
  const mats = hospitalMatTable(); hospitalMaterials();
  const root = new THREE.Group(); root.name = 'National Hospital';
  const ext = new THREE.Group(); ext.name = 'hospital-exterior'; const lod = new THREE.Group(); lod.name = 'hospital-lod'; lod.visible = false;
  const interior = new THREE.Group(); interior.name = 'hospital-interior'; interior.userData.interior = true;
  const doorsG = new THREE.Group(); doorsG.name = 'hospital-doors'; interior.add(doorsG);
  root.add(ext, lod, interior);
  const obs = [[], []]; const obsKeys = new Set(); const colliders = [];
  const addObs = (f, x0, x1, z0, z1, top, tag) => { const k = [f, x0.toFixed(2), x1.toFixed(2), z0.toFixed(2), z1.toFixed(2)].join(','); if (obsKeys.has(k)) return null; obsKeys.add(k); const o = { x0, x1, z0, z1, top, tag }; obs[f].push(o); return o; };
  const lineBox = (axis, at, s0, s1, t0, t1) => (axis === 'u' ? { x0: X(s0), x1: X(s1), z0: Z(at + t1), z1: Z(at + t0) } : { x0: X(at + t0), x1: X(at + t1), z0: Z(s1), z1: Z(s0) });
  const rooms = new Map();

  // ------------------------------------------------------------------ rooms
  for (const R of ROOMS) {
    const mb = new MultiBuilder(); const B = (m) => mb.get(m); const st = STYLE[R.id] || STYLE.corr0; const lights = [];
    for (const f of R.floors) {
      const fy = FLOOR_Y[f]; const shaft = !!R.shaft; const stairs = R.id === 'stairs';
      const top = stairs && f === 0 ? fy + H : fy + CEIL; // the stair void is open to the floor above
      // floor
      const [fm, fc, fs] = FLOORMAT[R.floor] || FLOORMAT.vinyl;
      const floorRects = stairs && f === 1 ? [[STAIR.u1, R.rects[0][1], R.rects[0][2], R.rects[0][3]], [R.rects[0][0], STAIR.u1, STAIR.v1, R.rects[0][3]]] : R.rects;
      for (const r of floorRects) B(fm).hrect(X(r[0]), Z(r[3]), X(r[1]), Z(r[2]), fy + 0.004, fs, C(fc));
      // ceiling (+ light panels)
      const ceilRects = stairs && f === 0 ? [[STAIR.u1, R.rects[0][1], R.rects[0][2], R.rects[0][3]]] : R.rects;
      const cy = stairs && f === 0 ? FLOOR_Y[1] - SLAB : fy + CEIL;
      for (const r of ceilRects) B('h_ceiling').hrect(X(r[0]), Z(r[3]), X(r[1]), Z(r[2]), cy, 0.6, C('#ffffff'), true);
      if (stairs && f === 0) { // the landing slab's edge over lane A, and the floor-above ceiling seen up the void
        face(B('h_wall'), 'v', STAIR.u1, 0, -1, R.rects[0][2], STAIR.v1, FLOOR_Y[1] - SLAB, FLOOR_Y[1], C(st.wall)); }
      const lp = (shaft && f === 1) || !shaft ? R.lights : R.lights.slice(0, 1);
      for (const [lu, lv] of lp) { const ly = (stairs && f === 0) ? FLOOR_Y[1] - SLAB : fy + CEIL;
        const lw = R.id === 'lift' ? 0.5 : 1.2, ld = R.id === 'lift' ? 0.5 : 0.6; B('h_light').hrect(X(lu - lw / 2), Z(lv + ld / 2), X(lu + lw / 2), Z(lv - ld / 2), ly - 0.006, 1, null, true);
        B('h_metal').box(X(lu), ly - 0.003, Z(lv), lw + 0.06, 0.006, ld + 0.06, { col: C('#e6e8ea'), top: false, bottom: true });
        const rr = R.rects.find((q) => lu >= q[0] && lu <= q[1] && lv >= q[2] && lv <= q[3]) || R.rects[0];
        lights.push({ x: X(lu), y: ly - 0.15, z: Z(lv), f, room: R.id, wallD: Math.min(lu - rr[0], rr[1] - lu, lv - rr[2], rr[3] - lv), d: Math.min(9, Math.max(4.5, Math.hypot(rr[1] - rr[0], rr[3] - rr[2]) * 0.62)) }); }
      // walls (room-side half of every partition / outer wall round the room)
      for (const e of freeEdges(R)) {
        const outer = isOuter(f, e.axis, e.at, e.s0, e.s1); const t = outer ? EXT / 2 : WALL / 2; const o = e.sgn * t;
        const doors = DOORS.filter((d) => d.floor === f && onLine(d, e.axis, e.at, e.s0, e.s1) && d.rooms.includes(R.id));
        const wins = windowsOn(f, e.axis, e.at).filter((w) => w[3] + w[4] / 2 > e.s0 && w[3] - w[4] / 2 < e.s1 && outer);
        const holes = doors.map((d) => { const [a, b] = doorSpanY(d); return [d.s[0], d.s[1], fy + a, fy + b]; }).concat(wins.map((w) => { const [a, b] = winSpanY(w); return [w[3] - w[4] / 2, w[3] + w[4] / 2, fy + a, fy + b]; }));
        const dh = st.dado[2]; const bands = [[fy, Math.min(top, fy + dh), st.dado[0], C(st.dado[1])], [Math.min(top, fy + dh), top, 'h_wall', C(st.wall)]];
        for (const [ya, yb, m, col] of bands) for (const [a, b, c, d] of cut(e.s0, e.s1, ya, yb, holes)) face(B(m), e.axis, e.at, o, e.sgn, a, b, c, d, col, m === 'h_tile' ? 1 : 2);
        // skirting + crash rail along the solid spans
        const spans = cut(e.s0, e.s1, fy, fy + 0.12, holes); for (const [a, b] of spans) face(B('h_plastic'), e.axis, e.at, o + e.sgn * 0.006, e.sgn, a, b, fy, fy + 0.1, C('#5d646a'));
        if (st.rail) for (const [a, b] of cut(e.s0, e.s1, fy + 0.88, fy + 1.02, holes)) { const mid = (a + b) / 2, len = b - a; const p = WP(e.axis, e.at, mid, o + e.sgn * 0.025, fy + 0.95); B('h_wood').box(p[0], p[1], p[2], e.axis === 'u' ? len : 0.05, 0.14, e.axis === 'u' ? 0.05 : len, { col: C('#ffffff') }); }
        // reveals of every opening (this room's half of the wall thickness)
        for (const hl of holes) { const [a, b, c, d] = hl; if (b < e.s0 + EPS || a > e.s1 - EPS) continue; const col = C(st.wall); const lo = Math.min(0, o), hi = Math.max(0, o);
          for (const [s, dir] of [[a, 1], [b, -1]]) { if (s < e.s0 - EPS || s > e.s1 + EPS) continue; const n = SN(e.axis, dir); const P = (oo, y) => WP(e.axis, e.at, s, oo, y); Q(B('h_wall'), P(lo, c), P(hi, c), P(hi, d), P(lo, d), n, [0, c / 2, t / 2, d / 2], col); }
          const P2 = (s, oo, y) => WP(e.axis, e.at, s, oo, y); Q(B('h_wall'), P2(a, lo, d), P2(b, lo, d), P2(b, hi, d), P2(a, hi, d), [0, -1, 0], null, col);
          if (c > fy + 0.05) { Q(B('h_plastic'), P2(a, lo, c), P2(b, lo, c), P2(b, hi + e.sgn * 0.03, c), P2(a, hi + e.sgn * 0.03, c), [0, 1, 0], null, C('#f4f4f2')); } }
        // window insides: blinds / frosted panel at the wall line, a slim aluminium frame
        for (const w of wins) { const [a, b] = winSpanY(w); const s0 = w[3] - w[4] / 2, s1 = w[3] + w[4] / 2;
          if (w[5] === 'frost') face(B('h_frost'), e.axis, e.at, e.sgn * 0.012, e.sgn, s0, s1, fy + a, fy + b, null, w[4]);
          else if (w[5] !== 'clear') { const o = e.sgn * 0.012; Q(B('h_blinds'), WP(e.axis, e.at, s0, o, fy + a), WP(e.axis, e.at, s1, o, fy + a), WP(e.axis, e.at, s1, o, fy + b), WP(e.axis, e.at, s0, o, fy + b), NRM(e.axis, e.sgn), [0, 0, 1, 1], null); } // 75th: one view picture per pane
          // 75th: a deep sill board (window boards in hospitals: white solid surface) + a slim glazing bead inside the frame
          { const p = WP(e.axis, e.at, (s0 + s1) / 2, e.sgn * 0.09, fy + a - 0.015); B('h_plastic').box(p[0], p[1], p[2], e.axis === 'u' ? s1 - s0 + 0.12 : 0.16, 0.03, e.axis === 'u' ? 0.16 : s1 - s0 + 0.12, { col: C('#eeede8') }); }
          const fr = C('#c9ccce'); const F1 = (sa, sb, ya, yb) => { const p = WP(e.axis, e.at, (sa + sb) / 2, e.sgn * 0.03, (ya + yb) / 2); B('h_metal').box(p[0], p[1], p[2], e.axis === 'u' ? sb - sa : 0.05, yb - ya, e.axis === 'u' ? 0.05 : sb - sa, { col: fr }); };
          F1(s0, s0 + 0.05, fy + a, fy + b); F1(s1 - 0.05, s1, fy + a, fy + b); F1(s0, s1, fy + b - 0.05, fy + b); F1(s0, s1, fy + a, fy + a + 0.05); if (w[5] === 'clear') { for (let k = 1; k < 2; k++) F1(s0 + (s1 - s0) * k / 2 - 0.025, s0 + (s1 - s0) * k / 2 + 0.025, fy + a, fy + b); } else F1(s0, s1, fy + a + 0.9, fy + a + 0.95); }
        // obstacles: the full wall thickness between openings you can walk through
        const walkHoles = doors.filter((d) => d.kind !== 'hatch').map((d) => [d.s[0], d.s[1], -1, 99]);
        for (const [a, b] of cut(e.s0, e.s1, 0, 1, walkHoles)) { const T = outer ? EXT / 2 : WALL / 2; const bxw = lineBox(e.axis, e.at, a, b, -T - 0.0, T); addObs(f, bxw.x0, bxw.x1, bxw.z0, bxw.z1, fy + H, 'wall'); }
      }
      // room name plates over the doors (corridor side) and the furniture of this room
      for (const d of DOORS) { if (d.floor !== f || !d.name || d.rooms[1] === 'out') continue; const corr = d.rooms.find((r) => r.startsWith('corr') || r === 'lobby'); if (corr !== R.id) continue;
        const other = d.rooms[0] === R.id ? d.rooms[1] : d.rooms[0]; const lab = PLATE_OF[other] || PLATE_OF[d.id]; if (!lab) continue;
        const sgnIn = sideOf(R, d); const mid = (d.s[0] + d.s[1]) / 2; const [ya] = [fy + 2.5]; const tt = WALL / 2 + 0.01; const s0 = mid - 0.5, s1 = mid + 0.5;
        Q(B('h_signs'), WP(d.axis, d.at, s0, sgnIn * tt, ya - 0.25), WP(d.axis, d.at, s1, sgnIn * tt, ya - 0.25), WP(d.axis, d.at, s1, sgnIn * tt, ya + 0.25), WP(d.axis, d.at, s0, sgnIn * tt, ya + 0.25), NRM(d.axis, sgnIn), uvFor(d.axis, sgnIn, plateUV(lab))); }
      for (const it of FURNITURE) { if (it[1] !== f) continue; const r = roomAt(it[2], it[3], f); if (!r || r.id !== R.id) continue; const box = drawItem(B, it, fy); if (box) addObs(f, box.x0, box.x1, box.z0, box.z1, box.top, box.type); }
    }
    if (R.id === 'stairs') buildStairs(B, addObs);
    if (R.id === 'lift') buildLiftCar(B);
    if (R.id === 'corr0' || R.id === 'corr1') hangingSigns(B, R.id);
    const g = new THREE.Group(); g.name = 'hosp-room-' + R.id; for (const m of mb.toMeshes(mats, { cast: false, receive: true })) g.add(m); g.visible = false; interior.add(g);
    const carDoors = R.id === 'lift' ? liftCarDoors(mats, g) : null;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const r of R.rects) { x0 = Math.min(x0, X(r[0])); x1 = Math.max(x1, X(r[1])); z0 = Math.min(z0, Z(r[3])); z1 = Math.max(z1, Z(r[2])); }
    rooms.set(R.id, { id: R.id, def: R, group: g, lights, carDoors, box: { x0, x1, z0, z1, y0: FLOOR_Y[R.floors[0]], y1: FLOOR_Y[R.floors[R.floors.length - 1]] + H } });
  }

  // ------------------------------------------------------------------ moving parts: hinged doors, held-open doubles, lift doors
  const doors = [];
  for (const d of DOORS) {
    const fy = FLOOR_Y[d.floor]; const w = d.s[1] - d.s[0]; const mid = (d.s[0] + d.s[1]) / 2; const [ya, yb] = doorSpanY(d);
    const D = { d, id: d.id, kind: d.kind, k: d.kind === 'double' || d.kind === 'open' ? 1 : 0, want: 0, leaves: [], fy, mid, w,
      box: new THREE.Box3(new THREE.Vector3(...minV(WP(d.axis, d.at, d.s[0], -0.25, fy + ya), WP(d.axis, d.at, d.s[1], 0.25, fy + yb))), new THREE.Vector3(...maxV(WP(d.axis, d.at, d.s[0], -0.25, fy + ya), WP(d.axis, d.at, d.s[1], 0.25, fy + yb)))),
      centre: WP(d.axis, d.at, mid, 0, fy), obs: null };
    const inSgn = d.rooms[0] === 'out' ? 0 : sideOf(ROOMS.find((r) => r.id === d.rooms[0]), d); D.inSgn = inSgn;
    if (d.kind === 'swing') { const leaf = leafMesh(mats, w - 0.02, yb - 0.02, d.staff); const piv = new THREE.Group(); const hs = d.hinge < 0 ? d.s[0] + 0.01 : d.s[1] - 0.01; piv.position.set(...WP(d.axis, d.at, hs, 0, fy));
      const dir = d.hinge < 0 ? 1 : -1; piv.rotation.y = lineYaw(d.axis, dir); piv.add(leaf); doorsG.add(piv); D.leaves.push(piv); D.base = piv.rotation.y; D.swingSign = rotSign(d.axis, dir, inSgn);
      const bxw = lineBox(d.axis, d.at, d.s[0], d.s[1], -0.06, 0.06); D.obs = addObs(d.floor, bxw.x0, bxw.x1, bxw.z0, bxw.z1, fy + 2.2, 'door'); D.closedBox = Object.assign({}, D.obs); }
    else if (d.kind === 'double') { // two leaves held open against the wall on the room side
      for (const hs of [d.s[0], d.s[1]]) { const leaf = leafMesh(mats, w / 2 - 0.02, yb - 0.02, false, hs === d.s[1]); const piv = new THREE.Group(); piv.position.set(...WP(d.axis, d.at, hs, 0, fy)); const dir = hs === d.s[0] ? 1 : -1; piv.rotation.y = lineYaw(d.axis, dir) + rotSign(d.axis, dir, inSgn) * Math.PI * 0.5; piv.add(leaf); doorsG.add(piv); D.leaves.push(piv); } }
    else if (d.kind === 'lift') { for (const sd of [-1, 1]) { const m = new THREE.Mesh(LIFT_LEAF(mats, w / 2), mats.h_metal); m.matrixAutoUpdate = true; const piv = new THREE.Group(); piv.position.set(...WP(d.axis, d.at, mid + sd * w / 4, -0.06, fy)); piv.rotation.y = lineYaw(d.axis, 1); piv.add(m); doorsG.add(piv); piv.userData.home = piv.position.clone(); piv.userData.dir = SN(d.axis, sd); D.leaves.push(piv); }
      const bxw = lineBox(d.axis, d.at, d.s[0], d.s[1], -0.08, 0.08); D.obs = addObs(d.floor, bxw.x0, bxw.x1, bxw.z0, bxw.z1, fy + 2.2, 'lift'); D.closedBox = Object.assign({}, D.obs); }
    doors.push(D);
  }

  // ------------------------------------------------------------------ exterior shell
  const emb = new MultiBuilder(); const E = (m) => emb.get(m); const RENDER = C('#f2efe7'), PLINTH = C('#8f8b84'), ACCENT = C('#2f6f9f'), CONC = C('#d9d6cf');
  const topY = Y0 + 2 * H, parapet = 0.95;
  // 78th: at an outside (convex) corner both faces stood EXT/2 out from the wall lines but stopped AT the corner line, so the
  // two faces never met: a 0.15 m open slit up the corner ("two walls are separate", seen from the garden). A face whose
  // end meets a perpendicular outer wall that faces away from this wall's span is carried on by EXT/2 to the outer corner.
  const convexExt = (f, axis, at, s, dir) => { const nb = OUTER.find((q) => q[0] === f && q[1] !== axis && Math.abs(q[2] - s) < EPS && at > Math.min(q[3], q[4]) - EPS && at < Math.max(q[3], q[4]) + EPS); return nb && nb[5] === dir ? dir * EXT / 2 : 0; };
  for (const w0 of OUTER) {
    const w = w0.slice(); { const [f, axis, at, a0, a1] = w0; w[3] = a0 + convexExt(f, axis, at, a0, -1); w[4] = a1 + convexExt(f, axis, at, a1, 1); }
    const [f, axis, at, s0, s1, out] = w; const fy = FLOOR_Y[f]; const o = out * EXT / 2; const yb = f === 0 ? fy + H : topY + parapet; const ya = f === 0 ? Y0 - 0.17 : fy;
    const wins = windowsOn(f, axis, at).filter((q) => q[3] > s0 && q[3] < s1); const drs = DOORS.filter((d) => d.floor === f && d.rooms[1] === 'out' && onLine(d, axis, at, s0, s1));
    const holes = wins.map((q) => { const [a, b] = winSpanY(q); return [q[3] - q[4] / 2, q[3] + q[4] / 2, fy + a, fy + b]; }).concat(drs.map((d) => [d.s[0], d.s[1], fy, fy + DOOR_HEIGHT.slide + 0.3]));
    const bands = f === 0 ? [[ya, fy + 0.55, PLINTH], [fy + 0.55, yb, RENDER]] : [[ya, topY + parapet - 0.45, RENDER], [topY + parapet - 0.45, topY + parapet, ACCENT]];
    for (const [a1, b1, col] of bands) for (const [a, b, c, d] of cut(s0, s1, a1, b1, holes)) face(E('h_render'), axis, at, o, out, a, b, c, d, col, 4);
    for (const hl of holes) { const [a, b, c, d] = hl; const lo = Math.min(0, o), hi = Math.max(0, o);
      for (const [s, dir] of [[a, 1], [b, -1]]) Q(E('h_render'), WP(axis, at, s, lo, c), WP(axis, at, s, hi, c), WP(axis, at, s, hi, d), WP(axis, at, s, lo, d), SN(axis, dir), null, CONC);
      Q(E('h_render'), WP(axis, at, a, lo, d), WP(axis, at, b, lo, d), WP(axis, at, b, hi, d), WP(axis, at, a, hi, d), [0, -1, 0], null, CONC);
      if (c > fy + 0.2) { const p = WP(axis, at, (a + b) / 2, o + out * 0.05, c - 0.03); E('h_render').box(p[0], p[1], p[2], axis === 'u' ? b - a + 0.12 : 0.16, 0.06, axis === 'u' ? 0.16 : b - a + 0.12, { col: CONC }); } }
    for (const q of wins) { const [a, b] = winSpanY(q); const qs0 = q[3] - q[4] / 2, qs1 = q[3] + q[4] / 2;
      if (q[5] === 'clear') { face(E('h_glass'), axis, at, -out * 0.01, out, qs0, qs1, fy + a, fy + b, null, 4); face(E('h_glass'), axis, at, -out * 0.03, -out, qs0, qs1, fy + a, fy + b, null, 4); }
      else face(E('h_extGlass'), axis, at, -out * 0.012, out, qs0, qs1, fy + a, fy + b, null, 4);
      const fr = C('#5b6166'); const F1 = (sa, sb, y1, y2) => { const p = WP(axis, at, (sa + sb) / 2, -out * 0.035, (y1 + y2) / 2); E('h_metal').box(p[0], p[1], p[2], axis === 'u' ? sb - sa : 0.06, y2 - y1, axis === 'u' ? 0.06 : sb - sa, { col: fr }); };
      F1(qs0, qs0 + 0.06, fy + a, fy + b); F1(qs1 - 0.06, qs1, fy + a, fy + b); F1(qs0, qs1, fy + b - 0.06, fy + b); F1(qs0, qs1, fy + a, fy + a + 0.06);
      if (q[5] === 'clear') F1(q[3] - 0.03, q[3] + 0.03, fy + a, fy + b); else F1(qs0, qs1, fy + a + 0.9, fy + a + 0.96);
      // sun-shade hood over every window of the street and east facades (Colombo's afternoon sun)
      if (q[5] !== 'clear' && (axis === 'u' && at === 0 || axis === 'v' && at === 21 || axis === 'u' && at === 22)) { const p = WP(axis, at, q[3], o + out * 0.33, fy + b + 0.18); E('h_render').box(p[0], p[1], p[2], axis === 'u' ? q[4] + 0.5 : 0.66, 0.1, axis === 'u' ? 0.66 : q[4] + 0.5, { col: CONC, bottom: true });
        for (const s of [qs0 - 0.2, qs1 + 0.2]) { const pp = WP(axis, at, s, o + out * 0.18, fy + (a + b) / 2 + 0.1); E('h_render').box(pp[0], pp[1], pp[2], axis === 'u' ? 0.08 : 0.36, b - a + 0.2, axis === 'u' ? 0.36 : 0.08, { col: CONC }); } } }
    // world collider: the full wall (gaps at the entrance doors are closed by their own door colliders)
    for (const [a, b] of cut(s0, s1, 0, 1, drs.map((d) => [d.s[0], d.s[1], -1, 2]))) { const bxw = lineBox(axis, at, a, b, -EXT / 2, EXT / 2); if (f === 0) colliders.push(Object.assign(bxw, { h: topY + 1, kind: 'landmark', id: 'hospWall' })); }
    // floor-1 indoor obstacles for the outer walls are made by the rooms; floor-slab band (string course) at the first floor
    if (f === 0) { const p = WP(axis, at, (s0 + s1) / 2, o + out * 0.09, Y0 + H - 0.02); E('h_render').box(p[0], p[1], p[2], axis === 'u' ? s1 - s0 + 0.36 : 0.18, 0.36, axis === 'u' ? 0.18 : s1 - s0 + 0.36, { col: CONC, bottom: true }); }
    if (f === 1) { const p = WP(axis, at, (s0 + s1) / 2, o * 0, topY + parapet + 0.04); E('h_render').box(p[0], p[1], p[2], axis === 'u' ? s1 - s0 + EXT : EXT + 0.1, 0.08, axis === 'u' ? EXT + 0.1 : s1 - s0 + EXT, { col: CONC }); }
  }
  // street-front balconies off the general ward (two, each across a pair of ward windows): cantilevered slab, a low concrete
  // upstand and a steel railing — merged into the exterior draws (decorative: no door opens onto them)
  { const fy = FLOOR_Y[1], D = 0.95, o0 = -EXT / 2; const RAIL = C('#3c4348');
    for (const [s0, s1] of [[-13.3, -8.3], [-4.3, 0.7]]) { const m = (s0 + s1) / 2, w = s1 - s0;
      let p = WP('u', 0, m, o0 - D / 2, fy - 0.11); E('h_render').box(p[0], p[1], p[2], w, 0.2, D, { col: CONC, bottom: true }); // slab
      p = WP('u', 0, m, o0 - D + 0.05, fy + 0.12); E('h_render').box(p[0], p[1], p[2], w, 0.26, 0.1, { col: CONC }); // front upstand
      for (const e of [s0 + 0.05, s1 - 0.05]) { p = WP('u', 0, e, o0 - D / 2, fy + 0.12); E('h_render').box(p[0], p[1], p[2], 0.1, 0.26, D, { col: CONC }); }
      p = WP('u', 0, m, o0 - D + 0.05, fy + 1.02); E('h_metal').box(p[0], p[1], p[2], w, 0.05, 0.06, { col: RAIL }); // top rail (front)
      for (const e of [s0 + 0.05, s1 - 0.05]) { p = WP('u', 0, e, o0 - D / 2, fy + 1.02); E('h_metal').box(p[0], p[1], p[2], 0.06, 0.05, D, { col: RAIL }); }
      for (let x = s0 + 0.15; x < s1 - 0.1; x += 0.14) { p = WP('u', 0, x, o0 - D + 0.05, fy + 0.62); E('h_metal').box(p[0], p[1], p[2], 0.018, 0.76, 0.018, { col: RAIL }); }
      for (const e of [s0 + 0.05, s1 - 0.05]) for (let z = 0.2; z < D - 0.1; z += 0.14) { p = WP('u', 0, e, o0 - z, fy + 0.62); E('h_metal').box(p[0], p[1], p[2], 0.018, 0.76, 0.018, { col: RAIL }); } } }
  // terrace / plant-deck parapets on the single-storey parts (floor-0 outer walls with no first floor above them)
  for (const w of OUTER) { const [f, axis, at, s0, s1, out] = w; if (f !== 0) continue; const br = new Set([s0, s1]); for (const R of ROOMS) for (const r of R.rects) for (const v of axis === 'u' ? [r[0], r[1]] : [r[2], r[3]]) if (v > s0 && v < s1) br.add(v);
    const xs = [...br].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) { const a = xs[i], b = xs[i + 1], m = (a + b) / 2; const iu = axis === 'u' ? m : at - out * 0.4, iv = axis === 'u' ? at - out * 0.4 : m; if (roomAt(iu, iv, 1)) continue;
      const o = out * EXT / 2; const ea = a === s0 ? convexExt(0, axis, at, s0, -1) : 0, eb = b === s1 ? convexExt(0, axis, at, s1, 1) : 0; face(E('h_render'), axis, at, o, out, a + ea, b + eb, Y0 + H, Y0 + H + 1.0, RENDER, 4); /* 78th: closed at outside corners */ face(E('h_render'), axis, at, -o, -out, a, b, Y0 + H, Y0 + H + 1.0, RENDER, 4);
      const p = WP(axis, at, m, 0, Y0 + H + 1.04); E('h_render').box(p[0], p[1], p[2], axis === 'u' ? b - a + EXT : EXT + 0.08, 0.08, axis === 'u' ? EXT + 0.08 : b - a + EXT, { col: CONC }); } }
  // roofs: membrane on the slabs, parapet insides, plant (AC condensers, water tanks, lift motor room) on the top roof
  for (const [f, u0, u1, v0, v1, kind] of ROOFS) { const y = FLOOR_Y[f] + H + 0.01; const isTop = f === 1; const col = kind === 'terrace' ? C('#b9b3a8') : C('#ffffff');
    E(kind === 'terrace' ? 'h_paving' : 'h_roof').hrect(X(u0), Z(v1), X(u1), Z(v0), y, kind === 'terrace' ? 2 : 3, col);
    if (isTop) E('h_render').hrect(X(u0), Z(v1), X(u1), Z(v0), FLOOR_Y[1] + H - SLAB, 4, CONC, true); }
  // inside faces of the top parapet
  for (const w of OUTER) { const [f, axis, at, s0, s1, out] = w; if (f !== 1) continue; face(E('h_render'), axis, at, -out * EXT / 2, -out, s0, s1, topY, topY + parapet, RENDER, 4); }
  roofPlant(E); terraceDressing(E);
  // the entrance canopy, the emergency canopy, the entrance doors' frames and the signs
  const sliders = []; buildCanopies(E, colliders); buildSigns(E);
  for (const d of DOORS.filter((q) => q.kind === 'slide')) sliders.push(slideDoor(E, mats, ext, d, colliders, addObs));
  buildGrounds(E, colliders);
  buildBodyRoom(E, colliders); // 75th: the body holding room annex behind the ambulance bay
  for (const m of emb.toMeshes(mats, { cast: true, receive: true })) { if (m.material === mats.h_glass) m.castShadow = false; ext.add(m); }
  // far LOD: the massing, a window band and the main sign (3 draws)
  { const lb = new MultiBuilder(); const L = (m) => lb.get(m);
    const box = (u0, u1, v0, v1, y0, y1) => { L('h_render').box(X((u0 + u1) / 2), (y0 + y1) / 2, Z((v0 + v1) / 2), u1 - u0 + EXT, y1 - y0, v1 - v0 + EXT, { col: RENDER, top: true }); };
    box(-21, 21, 0, 22, Y0 - 0.15, Y0 + H + 1.0); box(-14, 21, 0, 9, Y0 + H, topY + parapet); box(-21, -14, 9, 22, Y0 + H, topY + parapet); box(-14, 21, 9, 11.6, Y0 + H, topY + parapet); box(7, 21, 11.6, 22, Y0 + H, topY + parapet);
    for (const q of WINDOWS) { if (q[5] === 'clear' && q[1] !== 'u') continue; const [a, b] = winSpanY(q); const fy = FLOOR_Y[q[0]]; const out = OUTER.find((w) => w[0] === q[0] && w[1] === q[1] && Math.abs(w[2] - q[2]) < EPS)?.[5] || -1; face(L('h_extGlass'), q[1], q[2], out * (EXT / 2 + 0.02), out, q[3] - q[4] / 2, q[3] + q[4] / 2, fy + a, fy + b, null, 4); }
    mainSign(L); for (const m of lb.toMeshes(mats, { cast: true, receive: true })) lod.add(m); }

  // ------------------------------------------------------------------ portals for the runtime (world boxes of every door opening)
  const bounds = { x0: X(-21) - EXT, x1: X(21) + EXT, z0: Z(22) - EXT, z1: Z(0) + EXT, y0: Y0, y1: topY + parapet };
  root.updateMatrixWorld(true);
  return { root, ext, lod, interior, doorsG, rooms, doors, sliders, obs, colliders, bounds, mats };
}

// ---------------------------------------------------------------------------------------------- pieces
const PLATE_OF = { pharmacy: 'Pharmacy', ed: 'Emergency', treat1: 'Treatment Room 1', treat2: 'Treatment Room 2', wc: 'Toilets', stairs: 'Stairs', lift: 'Lift', ward: 'General Ward', nurses: "Nurses' Station", consult: 'Consultation', store: 'Medical Store', private1: 'Private Room 1', private2: 'Private Room 2', pharmDoor: 'Staff Only' };
// which side (+1 / −1 of the line's offset axis) of door d room R is on
function sideOf(R, d) { const mid = (d.s[0] + d.s[1]) / 2; for (const sgn of [1, -1]) { const u = d.axis === 'u' ? mid : d.at + sgn * 0.3, v = d.axis === 'u' ? d.at + sgn * 0.3 : mid; for (const r of R.rects) if (u > r[0] && u < r[1] && v > r[2] && v < r[3]) return sgn; } return 1; }
// uv for a plate quad written left→right along +s; mirrored when it faces the other way so the text reads correctly
function uvFor(axis, sgn, uv) { const facingFlip = axis === 'u' ? sgn > 0 : sgn < 0; return facingFlip ? [uv[2], uv[1], uv[0], uv[3]] : uv; }
function minV(a, b) { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])]; }
function maxV(a, b) { return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])]; }
// yaw of a leaf built along local +x so that it lies along +s (dir 1) or −s (dir −1) of the line
function lineYaw(axis, dir) { const s = SN(axis, dir); return Math.atan2(-s[2], s[0]); }
// rotation sign that swings a leaf (pivot at the hinge, lying along the opening) into the room side inSgn
// (a leaf lying along +s (dir 1) or −s (dir −1) of its line, pivot at the hinge; rotating by +θ about +y moves it towards n when s_z·n_x − s_x·n_z > 0)
function rotSign(axis, dir, inSgn) { const s = SN(axis, dir), n = NRM(axis, inSgn || 1); return s[2] * n[0] - s[0] * n[2] >= 0 ? 1 : -1; }

const LEAF = new Map();
function leafMesh(mats, w, h, staff, mirror = false) { // 75th: a hospital flush door — HPL faces (pearl grey public / soft blue staff),
  // aluminium edge lipping, a stainless kick plate and push plate, a framed vision panel (public doors), a lever handle on a rose
  const key = [w.toFixed(2), h.toFixed(2), staff ? 1 : 0, mirror ? 1 : 0].join(); let g = LEAF.get(key);
  if (!g) { const mb = new MultiBuilder(); const b = mb.get('h_door'); const t = 0.045; const face = C(staff ? '#c9d5df' : '#e4e3dd');
    b.box(w / 2, h / 2, 0, w - 0.012, h - 0.006, t, { col: face, uvRect: [0, 0, 1, 1] }); // the leaf (the picture spans it)
    for (const x of [0.003, w - 0.003]) b.box(x, h / 2, 0, 0.006, h, t + 0.002, { col: C('#b7bbbe') }); // edge lipping
    for (const z of [t / 2 + 0.002, -t / 2 - 0.002]) { const sg = Math.sign(z);
      b.box(w / 2, 0.16, z, w - 0.03, 0.3, 0.003, { col: C('#b9bdc0') }); b.box(w / 2, 0.305, z + sg * 0.0005, w - 0.03, 0.006, 0.003, { col: C('#d8dbdd') }); // kick plate
      if (!staff) { b.box(w * 0.5, 1.42, z, 0.3, 0.7, 0.006, { col: C('#9ea5aa') }); b.box(w * 0.5, 1.42, z + sg * 0.002, 0.24, 0.62, 0.004, { col: C('#2f3d45') }); // vision panel frame + glass
        b.box(w * 0.5 - 0.05, 1.52, z + sg * 0.0045, 0.03, 0.4, 0.001, { col: C('#58707c') }); }
      b.box(w - 0.1, 1.05, z + sg * 0.004, 0.06, 0.06, 0.008, { col: C('#c9ccce') }); // rose
      b.box(w - 0.1, 1.05, z + sg * 0.03, 0.02, 0.02, 0.05, { col: C('#d6d9db') }); b.box(w - 0.19, 1.05, z + sg * 0.055, 0.17, 0.022, 0.022, { col: C('#e0e3e5') }); // lever
      b.box(w - 0.1, 0.96, z + sg * 0.004, 0.012, 0.03, 0.004, { col: C('#9aa0a4') }); // key / thumb-turn
      b.box(w - 0.12, 1.3, z + sg * 0.002, 0.1, 0.3, 0.002, { col: C('#cdd1d3') }); } // push plate
    g = mb.b.get('h_door').build(); LEAF.set(key, g); }
  const m = new THREE.Mesh(g, mats.h_door); m.castShadow = false; m.receiveShadow = true; return m;
}
const LIFT_G = new Map();
function LIFT_LEAF(mats, w) { const k = w.toFixed(2); let g = LIFT_G.get(k); if (!g) { const mb = new MultiBuilder(); mb.get('h_metal').box(0, 1.05, 0, w, 2.1, 0.04, { col: C('#d9dcde') }); g = mb.b.get('h_metal').build(); LIFT_G.set(k, g); } return g; }

function buildStairs(B, addObs) {
  const { u0, u1, v0, v1, n } = STAIR; const rise = H / n, go = (v1 - v0) / n; const tread = C('#ffffff'), riser = C('#d8d2c6');
  for (let i = 0; i < n; i++) { const y1 = Y0 + rise * (i + 1); const va = v0 + go * i, vb = va + go;
    B('h_terrazzo').box(X((u0 + u1) / 2), (Y0 + y1) / 2, Z((va + vb) / 2), u1 - u0, y1 - Y0, go, { col: riser, top: false, sides: 1 | 4 }); // riser (faces −v = world +z) + the side towards lane B (+x)
    B('h_terrazzo').hrect(X(u0), Z(vb), X(u1), Z(va), y1, 1, tread); B('h_plastic').box(X((u0 + u1) / 2), y1 - 0.01, Z(va + 0.03), u1 - u0, 0.02, 0.06, { col: C('#4a4f54') }); } // nosing strip
  // handrails: sloped rail on the lane-B side of the flight + wall rail; balustrade on the landing edge upstairs
  const yA = (v) => Y0 + Math.max(0, Math.min(H, (v - v0) / (v1 - v0) * H));
  for (let v = v0 + 0.15; v <= v1 + 0.01; v += 1.15) { const y = yA(v); B('h_metal').box(X(u1 - 0.04), y + 0.5, Z(v), 0.03, 1.0, 0.03, { col: C('#c9ccce') }); }
  bar(B('h_metal'), [X(u1 - 0.04), yA(v0) + 1.0, Z(v0)], [X(u1 - 0.04), yA(v1) + 1.0, Z(v1)], 0.05, C('#c9ccce'));
  bar(B('h_wood'), [X(u0 + 0.06), yA(v0) + 0.9, Z(v0)], [X(u0 + 0.06), yA(v1) + 0.9, Z(v1)], 0.05, C('#ffffff'));
  B('h_glass').box(X(u1 - 0.04), FLOOR_Y[1] + 0.5, Z((11.75 + v1) / 2), 0.015, 0.95, v1 - 11.75); bar(B('h_metal'), [X(u1 - 0.04), FLOOR_Y[1] + 1.02, Z(11.75)], [X(u1 - 0.04), FLOOR_Y[1] + 1.02, Z(v1)], 0.05, C('#c9ccce'));
  for (let v = 11.8; v <= v1; v += 1.0) B('h_metal').box(X(u1 - 0.04), FLOOR_Y[1] + 0.5, Z(v), 0.03, 1.0, 0.03, { col: C('#c9ccce') });
  // the side of the flight seen from lane B (a solid stringer wall up to the rail) on the ground floor
  const side = (f, a, b, top) => { const x0 = X(u1 - 0.06), x1 = X(u1 + 0.06); addObs(f, x0, x1, Z(b), Z(a), top, 'stairRail'); };
  side(0, v0 + 0.25, 22, FLOOR_Y[1] + 1.1); side(1, 11.6, v1, FLOOR_Y[1] + 1.1);
  // floor 1: nobody walks into the void (lane A below the top of the flight)
  addObs(1, X(u0), X(u1), Z(v1 - 0.25), Z(11.6), FLOOR_Y[1] + 1.1, 'void');
}
function buildLiftCar(B) { // 75th: a real hospital bed-lift car — satin stainless panels with shadow-gap seams, a kick plate,
  // a mirror-finish back wall panel, handrails on three sides, a car operating panel with a floor display, an LED ceiling;
  // landings: a stainless architrave round the doors, a call station (up/down) and a floor indicator over the door.
  const iu0 = -16.5 + WALL / 2, iu1 = -14 - WALL / 2, iv0 = 11.6 + WALL / 2, iv1 = 14.4 - WALL / 2; const cuM = (iu0 + iu1) / 2, cvM = (iv0 + iv1) / 2;
  for (const f of [0, 1]) { const fy = FLOOR_Y[f]; const v = 11.6 - WALL / 2 - 0.012; const cu = LIFT.doorU1 + 0.42; const um = (LIFT.doorU0 + LIFT.doorU1) / 2;
    // landing: architrave (jambs + head) round the opening, a sill plate, the call station, the indicator
    for (const u of [LIFT.doorU0 - 0.05, LIFT.doorU1 + 0.05]) B('h_metal').box(X(u), fy + 1.1, Z(v - 0.01), 0.1, 2.2, 0.03, { col: C('#d4d7d9') });
    B('h_metal').box(X(um), fy + 2.17, Z(v - 0.01), LIFT.doorU1 - LIFT.doorU0 + 0.2, 0.1, 0.03, { col: C('#d4d7d9') });
    B('h_metal').box(X(um), fy + 0.006, Z(11.6), LIFT.doorU1 - LIFT.doorU0, 0.012, WALL + 0.06, { col: C('#a9adb0') });
    B('h_metal').box(X(cu), fy + 1.12, Z(v - 0.008), 0.11, 0.26, 0.016, { col: C('#c9ccce') });
    for (const [y, c] of [[1.17, '#f2f2ee'], [1.07, '#f2f2ee']]) { B('h_metal').box(X(cu), fy + y, Z(v - 0.02), 0.05, 0.05, 0.012, { col: C('#b5b9bc') }); B('h_plastic').box(X(cu), fy + y, Z(v - 0.027), 0.03, 0.03, 0.004, { col: C(c) }); }
    B('h_plastic').box(X(cu - 0.035), fy + 1.12, Z(v - 0.018), 0.008, 0.008, 0.004, { col: C('#ffb347') }); // the 'hall call registered' pip
    const uv = screenUV(5); B('h_metal').box(X(um), fy + 2.36, Z(v - 0.01), 0.3, 0.24, 0.02, { col: C('#2b2e31') });
    B('h_screens').quad([X(um + 0.12), fy + 2.26, Z(v - 0.022)], [X(um - 0.12), fy + 2.26, Z(v - 0.022)], [X(um - 0.12), fy + 2.46, Z(v - 0.022)], [X(um + 0.12), fy + 2.46, Z(v - 0.022)], [uv[2], uv[1], uv[0], uv[3]]);
    // car: wall panel seams (shadow gaps) on the side and back walls, a kick plate, the back mirror panel
    for (const u of [iu0 + 0.004, iu1 - 0.004]) for (const vv of [iv0 + 0.85, iv0 + 1.7]) B('h_plastic').box(X(u), fy + 1.25, Z(vv), 0.004, 2.1, 0.012, { col: C('#3a3e42') });
    for (const uu of [iu0 + 0.8, iu1 - 0.8]) B('h_plastic').box(X(uu), fy + 1.25, Z(iv1 - 0.004), 0.012, 2.1, 0.004, { col: C('#3a3e42') });
    for (const u of [iu0 + 0.006, iu1 - 0.006]) B('h_metal').box(X(u), fy + 0.08, Z(cvM), 0.012, 0.16, iv1 - iv0, { col: C('#8d9296') });
    B('h_metal').box(X(cuM), fy + 0.08, Z(iv1 - 0.006), iu1 - iu0, 0.16, 0.012, { col: C('#8d9296') });
    B('h_metal').box(X(cuM), fy + 1.45, Z(iv1 - 0.008), 0.7, 1.0, 0.006, { col: C('#f4f6f8') }); // polished mirror panel
    // handrails (tube on stand-off brackets) on the back and both sides
    B('h_metal').box(X(cuM), fy + 0.92, Z(iv1 - 0.06), iu1 - iu0 - 0.3, 0.035, 0.035, { col: C('#eef0f2') });
    for (const uu of [iu0 + 0.3, iu1 - 0.3]) B('h_metal').box(X(uu), fy + 0.92, Z(iv1 - 0.03), 0.02, 0.02, 0.06, { col: C('#cfd2d4') });
    for (const [u, sg] of [[iu0, 1], [iu1, -1]]) { B('h_metal').box(X(u + sg * 0.06), fy + 0.92, Z(cvM + 0.1), 0.035, 0.035, iv1 - iv0 - 0.7, { col: C('#eef0f2') });
      for (const vv of [iv0 + 0.55, iv1 - 0.35]) B('h_metal').box(X(u + sg * 0.03), fy + 0.92, Z(vv), 0.06, 0.02, 0.02, { col: C('#cfd2d4') }); }
    // car operating panel beside the door (strike side): a tall brushed plate, the floor display, two floor buttons, alarm, door open/close
    const pu = iu1 - 0.006, pv = iv0 + 0.32; B('h_metal').box(X(pu), fy + 1.15, Z(pv), 0.01, 1.3, 0.24, { col: C('#babec1') });
    B('h_screens').quad([X(pu - 0.007), fy + 1.62, Z(pv - 0.07)], [X(pu - 0.007), fy + 1.62, Z(pv + 0.07)], [X(pu - 0.007), fy + 1.72, Z(pv + 0.07)], [X(pu - 0.007), fy + 1.72, Z(pv - 0.07)], [uv[0], uv[1], uv[2], uv[3]]);
    for (const [y, c] of [[1.38, '#f2f2ee'], [1.28, '#f2f2ee'], [1.12, '#f2f2ee'], [1.02, '#f2f2ee'], [0.9, '#f5c518']]) { B('h_metal').box(X(pu - 0.008), fy + y, Z(pv), 0.01, 0.06, 0.06, { col: C('#a6aaad') }); B('h_plastic').box(X(pu - 0.014), fy + y, Z(pv), 0.004, 0.036, 0.036, { col: C(c) }); }
    B('h_plastic').box(X(pu - 0.007), fy + 0.72, Z(pv), 0.004, 0.08, 0.16, { col: C('#2b2e31') }); // speaker grille (emergency intercom)
    // ceiling: a satin frame round an LED diffuser (the room's light panel) and a vent slot
    B('h_metal').box(X(cuM), fy + CEIL - 0.02, Z(cvM), iu1 - iu0, 0.04, iv1 - iv0, { col: C('#b8bcbf'), top: false, bottom: true });
    B('h_plastic').box(X(cuM), fy + CEIL - 0.045, Z(iv1 - 0.25), 0.8, 0.01, 0.06, { col: C('#33373a'), top: false, bottom: true });
  }
}
// 75th: the car's own doors (they ride with the car: the landing doors stay at the landings) — two leaves per floor
function liftCarDoors(mats, g) { const out = []; const w = LIFT.doorU1 - LIFT.doorU0; const um = (LIFT.doorU0 + LIFT.doorU1) / 2; const v = 11.6 + WALL / 2 + 0.03;
  for (const f of [0, 1]) { const fy = FLOOR_Y[f]; const pair = []; for (const sd of [-1, 1]) { const m = new THREE.Mesh(LIFT_LEAF(mats, w / 2 + 0.02), mats.h_metal); m.matrixAutoUpdate = true; m.position.set(X(um + sd * w / 4), fy, Z(v)); m.userData.home = m.position.clone(); m.userData.dir = SN('u', sd); g.add(m); pair.push(m); } out.push(pair); }
  return out; }
function hangingSigns(B, id) { const f = id === 'corr0' ? 0 : 1; const fy = FLOOR_Y[f]; const v = 10.3; const y = fy + CEIL - 0.45;
  const sign = (u, lab) => { const uv = plateUV(lab); const w = 1.4, h = 0.7; for (const s of [1, -1]) { const zz = Z(v) - s * 0.012; const P = (a, b) => [X(u + a), y + b, zz]; // s > 0: faces −z (seen from the front rooms' side), s < 0: faces +z
      B('h_signs').quad(...(s > 0 ? [P(w / 2, -h / 2), P(-w / 2, -h / 2), P(-w / 2, h / 2), P(w / 2, h / 2)] : [P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)]), uv); }
    B('h_metal').box(X(u), y + 0.35 + (CEIL - 0.45 - 0.35 - 0.0) / 2 - 0.0, Z(v), 0.02, 0.08, 0.02, { col: C('#9aa0a4') }); for (const s of [-0.5, 0.5]) B('h_metal').box(X(u + s), y + 0.35 + 0.05, Z(v), 0.015, 0.1, 0.015, { col: C('#9aa0a4') }); };
  if (f === 0) { sign(-8.6, '← Wards · Lift · Stairs'); sign(4.0, 'Emergency →'); } else { sign(-10.0, 'Floor 1'); sign(12.0, 'Silence Please'); }
}
function roofPlant(E) { const y = Y0 + 2 * H; const ac = C('#d9dbdc'), dk = C('#5b6166');
  for (let k = 0; k < 5; k++) { const u = -10 + k * 3.2, v = 4.5; E('h_metal').box(X(u), y + 0.45, Z(v), 0.9, 0.7, 0.4, { col: ac }); E('h_plastic').box(X(u), y + 0.47, Z(v - 0.205), 0.55, 0.55, 0.01, { col: dk }); }
  for (const [u, v] of [[-18.5, 15], [-17, 19.5]]) { E('h_plastic').cylinder(X(u), y + 0.3, Z(v), 0.75, 0.75, 1.4, 14, { col: C('#2b3f6e') }); E('h_metal').box(X(u), y + 0.15, Z(v), 1.7, 0.3, 1.7, { col: dk }); }
  E('h_render').box(X(-15.2), y + 1.3, Z(13), 3.0, 2.6, 3.2, { col: C('#ece8df') }); // lift motor room
  for (let k = 0; k < 4; k++) E('h_metal').box(X(8 + k * 3), y + 0.35, Z(17), 1.0, 0.6, 0.5, { col: ac });
  E('h_metal').box(X(0), y + 0.08, Z(10.2), 30, 0.12, 0.25, { col: dk }); // cable tray
}
function terraceDressing(E) { const y = Y0 + H + 0.01; // pharmacy roof terrace: planters along the parapet; plant deck: condensers + pipes
  for (const [u, v] of [[-20.2, 2], [-20.2, 5], [-20.2, 8]]) { E('h_render').box(X(u), y + 0.3, Z(v), 0.8, 0.6, 2.2, { col: C('#cfcac0') }); hedgeBox({ get: E }, X(u), y + 0.6, Z(v), 2.0, 0.45, 0.66, Math.PI / 2, { core: true, density: 11, seed: 300 + v * 7 }); }
  for (let k = 0; k < 6; k++) { E('h_metal').box(X(-12 + k * 3.2), y + 0.4, Z(17), 0.9, 0.7, 0.4, { col: C('#d9dbdc') }); }
  E('h_metal').box(X(-3), y + 0.12, Z(14.6), 20, 0.12, 0.2, { col: C('#7a8086') });
}
function mainSign(B) { // on the street parapet over the lobby: 12 m × 1.5 m
  const uv = bigUV(BIG.main); const u0 = -10.4, u1 = 1.6, y0 = Y0 + 2 * H - 0.55, y1 = y0 + 1.5, v = -EXT / 2 - 0.07;
  B('h_bigSigns').quad([X(u0), y0, Z(v)], [X(u1), y0, Z(v)], [X(u1), y1, Z(v)], [X(u0), y1, Z(v)], uv);
  B('h_metal').box(X((u0 + u1) / 2), (y0 + y1) / 2, Z(v + 0.03), u1 - u0 + 0.1, 1.6, 0.05, { col: C('#9aa0a4') });
}
function buildSigns(E) {
  mainSign(E);
  // ED: on the emergency canopy fascia (faces the street) and a projecting box sign at the corner
  const c = GROUNDS.edCanopy; const uv = bigUV(BIG.ed); const fy = Y0 + c.h + 0.12; { const u0 = c.u0 + 0.6, u1 = c.u1 - 0.4, v = c.v0 - 0.03; E('h_bigSigns').quad([X(u0), fy, Z(v)], [X(u1), fy, Z(v)], [X(u1), fy + 1.15, Z(v)], [X(u0), fy + 1.15, Z(v)], uv); }
  { const u = 21 + EXT / 2 + 0.6, v = -0.4, y = Y0 + 5.6; E('h_metal').box(X(u - 0.3), y, Z(v), 0.6, 0.06, 0.06, { col: C('#9aa0a4') });
    for (const s of [1, -1]) { const P = (a, b) => [X(u + a), y + b, Z(v) + s * 0.08]; const q = [P(-0.0, -0.45), P(3.6, -0.45), P(3.6, 0.45), P(-0.0, 0.45)]; if (s > 0) E('h_bigSigns').quad(q[0], q[1], q[2], q[3], uv); else E('h_bigSigns').quad(q[1], q[0], q[3], q[2], uv); }
    E('h_plastic').box(X(u + 1.8), y, Z(v), 3.64, 0.94, 0.14, { col: C('#a32020') }); }
  // ambulance bay: KEEP CLEAR sign on the canopy column line + bay marking (in buildGrounds)
  { const a = GROUNDS.ambulanceBay; const uv2 = bigUV(BIG.ambulance); const u0 = a.u - 1.6, u1 = a.u + 1.6, y = Y0 + 2.6, v = c.v1 + 0.15; E('h_bigSigns').quad([X(u0), y, Z(v)], [X(u1), y, Z(v)], [X(u1), y + 0.4, Z(v)], [X(u0), y + 0.4, Z(v)], uv2); }
  // totem at the main gate: OUT-PATIENTS · PHARMACY · WARDS (both faces)
  { const u = -16.5, v = -11.2, y = Y0 + 1.2; const uv3 = bigUV(BIG.sideName); E('h_render').box(X(u), Y0 + 1.15, Z(v), 3.4, 2.3, 0.3, { col: C('#ffffff') }); for (const s of [1, -1]) { const zz = Z(v) + s * 0.152; const P = (a, b) => [X(u + a), y + b, zz]; const q = [P(-1.6, 0.0), P(1.6, 0.0), P(1.6, 0.42), P(-1.6, 0.42)]; if (s < 0) E('h_bigSigns').quad(q[1], q[0], q[3], q[2], uv3); else E('h_bigSigns').quad(q[0], q[1], q[2], q[3], uv3); }
    const uvm = bigUV(BIG.main); for (const s of [1, -1]) { const zz = Z(v) + s * 0.152; const P = (a, b) => [X(u + a), y + b, zz]; const q = [P(-1.6, 0.55), P(1.6, 0.55), P(1.6, 0.95), P(-1.6, 0.95)]; if (s < 0) E('h_bigSigns').quad(q[1], q[0], q[3], q[2], uvm); else E('h_bigSigns').quad(q[0], q[1], q[2], q[3], uvm); } }
}
function buildCanopies(E, colliders) {
  const CONC = C('#e9e6df'), DK = C('#5b6166');
  for (const [c, ed] of [[GROUNDS.canopy, false], [GROUNDS.edCanopy, true]]) {
    const y = Y0 + c.h; const u0 = c.u0, u1 = c.u1, v0 = c.v0, v1 = c.v1;
    E('h_render').box(X((u0 + u1) / 2), y + 0.2, Z((v0 + v1) / 2), u1 - u0, 0.4, v1 - v0, { col: CONC, bottom: true });
    E('h_render').box(X((u0 + u1) / 2), y + 0.55, Z(v0 + 0.06), u1 - u0, 0.3, 0.12, { col: ed ? C('#c62828') : C('#2f6f9f') }); // fascia band
    for (let u = u0 + 1.2; u < u1 - 0.6; u += 2.2) for (let v = v0 + 1.2; v < v1 - 0.6; v += 2.4) E('h_light').box(X(u), y - 0.005, Z(v), 0.32, 0.01, 0.32, {}); // downlights
    const cols = ed ? [[u0 + 0.3, v0 + 0.3], [u1 - 0.3, v0 + 0.3], [u1 - 0.3, v1 - 0.3]] : [[u0 + 0.3, v0 + 0.3], [u1 - 0.3, v0 + 0.3]];
    for (const [cu, cv] of cols) { E('h_render').box(X(cu), Y0 + c.h / 2, Z(cv), 0.36, c.h, 0.36, { col: CONC }); E('h_plastic').box(X(cu), Y0 + 0.3, Z(cv), 0.38, 0.6, 0.38, { col: DK });
      colliders.push({ x0: X(cu) - 0.2, x1: X(cu) + 0.2, z0: Z(cv) - 0.2, z1: Z(cv) + 0.2, h: Y0 + c.h, kind: 'pole', id: 'hospCanopy' }); }
    // rain-water down pipe
    E('h_plastic').box(X(u1 - 0.1), Y0 + c.h / 2, Z(v1 - 0.12), 0.1, c.h, 0.1, { col: C('#d9d6cf') });
  }
}
function slideDoor(E, mats, ext, d, colliders, addObs) {
  const fy = FLOOR_Y[d.floor]; const h = DOOR_HEIGHT.slide; const w = d.s[1] - d.s[0]; const mid = (d.s[0] + d.s[1]) / 2; const fr = C('#4c5257');
  const P = (s, o, y) => WP(d.axis, d.at, s, o, y);
  { const p = P(mid, 0, fy + h + 0.15); E('h_metal').box(p[0], p[1], p[2], d.axis === 'u' ? w + 0.3 : 0.32, 0.3, d.axis === 'u' ? 0.32 : w + 0.3, { col: fr }); } // operator box
  for (const s of [d.s[0], d.s[1]]) { const p = P(s, 0, fy + h / 2); E('h_metal').box(p[0], p[1], p[2], d.axis === 'u' ? 0.08 : 0.2, h, d.axis === 'u' ? 0.2 : 0.08, { col: fr }); }
  { const p = P(mid, 0, fy + 0.008); E('h_metal').box(p[0], p[1], p[2], d.axis === 'u' ? w : 0.3, 0.016, d.axis === 'u' ? 0.3 : w, { col: C('#9aa0a4') }); }
  // two glass leaves (one geometry, framed glass): slide apart along ±s
  const lw = w / 2 + 0.04; const mb = new MultiBuilder(); const g0 = mb.get('h_glass'); const g1 = mb.get('h_metal');
  g0.box(0, h / 2, 0, lw - 0.1, h - 0.12, 0.012); g1.box(-lw / 2 + 0.03, h / 2, 0, 0.06, h, 0.05, { col: fr }); g1.box(lw / 2 - 0.03, h / 2, 0, 0.06, h, 0.05, { col: fr }); g1.box(0, 0.05, 0, lw, 0.1, 0.05, { col: fr }); g1.box(0, h - 0.04, 0, lw, 0.08, 0.05, { col: fr });
  g1.box(0, 1.1, 0.03, lw - 0.1, 0.05, 0.01, { col: C('#c8102e') }); // safety band
  const gGlass = g0.build(), gFrame = g1.build(); const leaves = [];
  for (const sd of [-1, 1]) { const piv = new THREE.Group(); const p = P(mid + sd * (lw / 2 - 0.02), -0.06 * (d.axis === 'u' ? 1 : 1), fy); piv.position.set(...p); piv.rotation.y = lineYaw(d.axis, 1);
    const a = new THREE.Mesh(gGlass, mats.h_glass), b = new THREE.Mesh(gFrame, mats.h_metal); a.castShadow = false; b.castShadow = true; piv.add(a, b); ext.add(piv); piv.userData.home = piv.position.clone(); piv.userData.dir = SN(d.axis, sd); piv.userData.travel = lw - 0.08; leaves.push(piv); }
  const bxw = (() => { const a = P(d.s[0], -0.12, 0), b = P(d.s[1], 0.12, 0); return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]) }; })();
  const coll = Object.assign({}, bxw, { h: fy + h, kind: 'landmark', id: 'hospDoor-' + d.id }); colliders.push(coll);
  const ob = addObs(d.floor, bxw.x0, bxw.x1, bxw.z0, bxw.z1, fy + h, 'slide');
  return { d, leaves, coll, obs: ob, closedBox: Object.assign({}, ob), k: 0, hFull: coll.h, centre: P(mid, 0, fy), mid };
}
function buildGrounds(E, colliders) {
  const G = GROUNDS; const y = Y0 + 0.005; const fence = G.fence;
  // forecourt paving across the front strip; asphalt for the drop-off lay-by, the ambulance drive and the parking bays
  E('h_paving').hrect(X(fence.u0), Z(0), X(fence.u1), Z(fence.front), y - 0.004, 2, C('#ffffff'));
  const asphalt = (u0, u1, v0, v1) => E('h_asphalt').hrect(X(u0), Z(v1), X(u1), Z(v0), y + 0.004, 3, C('#ffffff'));
  const dr = G.dropOff; asphalt(dr.u - dr.w / 2, dr.u + dr.w / 2, dr.v - dr.d / 2, dr.v + dr.d / 2);
  asphalt(dr.u - 8, dr.u + 8, fence.front, dr.v - dr.d / 2); // the main gate → lay-by apron
  const a = G.ambulanceBay; asphalt(a.u - 3.3, a.u + 3.3, fence.front, G.edCanopy.v1 + 1.5); // the ED drive (from the street to past the bay)
  for (const [pu, pv] of G.parking) asphalt(pu - 1.3, pu + 1.3, pv - 2.5, pv + 2.5);
  // markings: bay lines, the ambulance box with KEEP CLEAR, zebra across the drop-off, kerb paint
  const mark = (u0, u1, v0, v1, col) => E('h_plastic').hrect(X(u0), Z(v1), X(u1), Z(v0), y + 0.01, 1, col);
  const W = C('#f2f2ee'), Yl = C('#f2c230');
  for (const [pu, pv] of G.parking) { mark(pu - 1.3, pu - 1.22, pv - 2.5, pv + 2.5, W); mark(pu + 1.22, pu + 1.3, pv - 2.5, pv + 2.5, W); }
  { const L = a.len / 2, Wd = a.wid / 2; mark(a.u - Wd, a.u + Wd, a.v - L, a.v - L + 0.12, Yl); mark(a.u - Wd, a.u + Wd, a.v + L - 0.12, a.v + L, Yl); mark(a.u - Wd, a.u - Wd + 0.12, a.v - L, a.v + L, Yl); mark(a.u + Wd - 0.12, a.u + Wd, a.v - L, a.v + L, Yl);
    for (let k = -4; k <= 4; k++) { const v = a.v + k * 0.6; mark(a.u - Wd + 0.2, a.u + Wd - 0.2, v - 0.06, v + 0.06, Yl); } }
  for (let k = 0; k < 7; k++) { const u = -8.6 + k * 0.62; mark(u, u + 0.38, dr.v - dr.d / 2, dr.v + dr.d / 2 + 0.1, W); } // zebra from the lay-by to the canopy
  mark(dr.u - dr.w / 2, dr.u + dr.w / 2, dr.v + dr.d / 2 - 0.1, dr.v + dr.d / 2, Yl);
  // kerbs round the asphalt (low, step-over) + bollards along the canopy edge
  for (const u of [-9.3, -3.7, -2.6]) { E('h_metal').box(X(u), Y0 + 0.45, Z(G.canopy.v0 + 0.3), 0.14, 0.9, 0.14, { col: C('#3c4146') }); E('h_plastic').box(X(u), Y0 + 0.8, Z(G.canopy.v0 + 0.3), 0.15, 0.06, 0.15, { col: C('#f2c230') });
    colliders.push({ x0: X(u) - 0.09, x1: X(u) + 0.09, z0: Z(G.canopy.v0 + 0.3) - 0.09, z1: Z(G.canopy.v0 + 0.3) + 0.09, h: Y0 + 0.9, kind: 'pole', id: 'hospBollard' }); }
  // planters with shrubs in front of the facade windows (between the bays and the walls)
  const planter = (u0, u1, v0, v1) => { E('h_render').box(X((u0 + u1) / 2), Y0 + 0.25, Z((v0 + v1) / 2), u1 - u0, 0.5, v1 - v0, { col: C('#cfcac0') }); E('h_lawn').hrect(X(u0 + 0.1), Z(v1 - 0.1), X(u1 - 0.1), Z(v0 + 0.1), Y0 + 0.46, 2, C('#ffffff'));
    const dw = v1 - v0; // shallow strips under the windows: a low clipped hedge; the deep beds at the corners: mounded shrubs with a few flowers
    if (dw < 1.2) hedgeBox({ get: E }, X((u0 + u1) / 2), Y0 + 0.46, Z((v0 + v1) / 2), u1 - u0 - 0.3, 0.42, Math.max(0.3, dw - 0.12), 0, { density: 11 });
    else for (let u = u0 + 0.9; u < u1 - 0.6; u += 1.9) { const k = Math.abs(Math.round(u * 3)) % 4; bushBall({ get: E }, X(u), Y0 + 0.46, Z((v0 + v1) / 2 + ((k % 2) - 0.5) * 0.9), 0.62 + k * 0.05, 0.85 + k * 0.08, { round: true, density: 24, size: 0.2, flowers: k === 1 ? 14 : 0, flowerCol: [0.86, 0.16, 0.42] }); }
    colliders.push({ x0: X(u0), x1: X(u1), z0: Z(v1), z1: Z(v0), h: Y0 + 0.5, kind: 'landmark', id: 'hospPlanter' }); };
  planter(-20.6, -14.6, -0.85, -0.25); planter(2.0, 4.6, -0.85, -0.25); planter(7.0, 15.2, -0.85, -0.25); planter(16.6, 20.2, -0.85, -0.25);
  planter(-53, -24, -12.2, -7.5); planter(31.5, 53, -12.2, -7.5);
  // boundary: low wall + railings on the street front (gaps at the gates), plain 2 m walls round the sides and the back
  const fv = fence.front; const WALLC = C('#ece8df'), RAIL = C('#2f3a40');
  const spans = []; { let s = fence.u0; const gs = G.gates.map((q) => [q.u - q.w / 2, q.u + q.w / 2]).sort((p, q) => p[0] - q[0]); for (const [ga, gb] of gs) { spans.push([s, ga]); s = gb; } spans.push([s, fence.u1]); }
  for (const [s0, s1] of spans) { if (s1 - s0 < 0.2) continue; E('h_render').box(X((s0 + s1) / 2), Y0 + 0.35, Z(fv), s1 - s0, 0.7, 0.3, { col: WALLC }); E('h_render').box(X((s0 + s1) / 2), Y0 + 0.73, Z(fv), s1 - s0 + 0.05, 0.06, 0.36, { col: C('#d9d6cf') });
    for (let u = s0 + 0.12; u < s1 - 0.05; u += 0.24) E('h_metal').box(X(u), Y0 + 1.2, Z(fv), 0.025, 0.9, 0.025, { col: RAIL, top: false });
    E('h_metal').box(X((s0 + s1) / 2), Y0 + 1.62, Z(fv), s1 - s0, 0.05, 0.05, { col: RAIL }); E('h_metal').box(X((s0 + s1) / 2), Y0 + 0.86, Z(fv), s1 - s0, 0.04, 0.04, { col: RAIL });
    for (let u = s0; u <= s1 + 0.01; u += Math.max(2.5, (s1 - s0) / Math.max(1, Math.round((s1 - s0) / 3)))) E('h_render').box(X(Math.min(s1 - 0.2, Math.max(s0 + 0.2, u))), Y0 + 0.9, Z(fv), 0.42, 1.8, 0.42, { col: WALLC });
    colliders.push({ x0: X(s0), x1: X(s1), z0: Z(fv) - 0.2, z1: Z(fv) + 0.2, h: Y0 + 1.7, kind: 'landmark', id: 'hospFence' }); }
  for (const q of G.gates) for (const s of [-1, 1]) { const u = q.u + s * (q.w / 2 + 0.25); E('h_render').box(X(u), Y0 + 1.1, Z(fv), 0.6, 2.2, 0.6, { col: WALLC }); E('h_render').box(X(u), Y0 + 2.25, Z(fv), 0.7, 0.1, 0.7, { col: C('#d9d6cf') }); }
  const wallRun = (u0, u1, v0, v1) => { const cx = (u0 + u1) / 2, cv = (v0 + v1) / 2, lu = Math.max(0.25, u1 - u0), lv = Math.max(0.25, v1 - v0); E('h_render').box(X(cx), Y0 + 1.0, Z(cv), lu, 2.0, lv, { col: WALLC }); E('h_render').box(X(cx), Y0 + 2.04, Z(cv), lu + 0.08, 0.08, lv + 0.08, { col: C('#d9d6cf') });
    colliders.push({ x0: X(u0) - 0.02, x1: X(u1) + 0.02, z0: Z(v1) - 0.02, z1: Z(v0) + 0.02, h: Y0 + 2.1, kind: 'landmark', id: 'hospFence' }); };
  wallRun(fence.u0 - 0.125, fence.u0 + 0.125, fv, fence.back); wallRun(fence.u1 - 0.125, fence.u1 + 0.125, fv, fence.back); wallRun(fence.u0, fence.u1, fence.back - 0.125, fence.back + 0.125);
  // security booth at the main gate (east side)
  { const u = 3.6, v = -10.6; E('h_render').box(X(u), Y0 + 1.2, Z(v), 1.8, 2.4, 1.6, { col: C('#f2efe7') }); E('h_extGlass').box(X(u), Y0 + 1.55, Z(v - 0.81), 1.4, 0.8, 0.02); E('h_render').box(X(u), Y0 + 2.5, Z(v), 2.2, 0.16, 2.0, { col: C('#2f6f9f') });
    colliders.push({ x0: X(u) - 0.92, x1: X(u) + 0.92, z0: Z(v) - 0.82, z1: Z(v) + 0.82, h: Y0 + 2.5, kind: 'landmark', id: 'hospBooth' }); }
  // the garden behind the building (75th): lawns either side of the path to the back gate, low clipped hedges lining the
  // path, mounded shrubs (some flowering: hibiscus red, bougainvillea magenta, allamanda yellow) in clusters, teak park
  // benches, the stone fountain on the path (HospitalGarden.js) — trees are planted by the city plan (CityPlan.js: the
  // city's instanced trees, solid trunks). Foliage = leaf cards in the city's shared leaf materials: 3 draws for all of it.
  const lawn = (u0, u1, v0, v1) => { E('h_lawn').hrect(X(u0), Z(v1), X(u1), Z(v0), y + 0.002, 2.5, C('#ffffff')); E('h_render').box(X((u0 + u1) / 2), Y0 + 0.06, Z(v0), u1 - u0, 0.12, 0.12, { col: C('#bdb8ae') }); E('h_render').box(X((u0 + u1) / 2), Y0 + 0.06, Z(v1), u1 - u0, 0.12, 0.12, { col: C('#bdb8ae') }); };
  lawn(-51, -24, 2, 104); lawn(32, 51, 10, 104); lawn(-22, -3, 26, 104); lawn(3, 30, 26, 104);
  const mb = { get: E }; const F = GARDEN_FOUNTAIN;
  for (const su of [-1, 1]) for (const [v0, v1] of [[27, 41.2], [56, 69], [72, 84], [87, 101]]) { // path hedges (gaps onto the lawns)
    hedgeBox(mb, X(su * 3.45), Y0, Z((v0 + v1) / 2), v1 - v0, 0.55, 0.5, Math.PI / 2, { density: 11, seed: 40 + v0 * 3 + su });
    colliders.push({ x0: X(su * 3.45) - 0.25, x1: X(su * 3.45) + 0.25, z0: Z(v1), z1: Z(v0), h: Y0 + 0.55, kind: 'landmark', id: 'hospHedge' }); }
  const FL = { red: [0.88, 0.12, 0.1], mag: [0.86, 0.16, 0.48], yel: [0.95, 0.78, 0.16], wht: [0.95, 0.94, 0.9] };
  const shrub = (u, v, r, h, fl, n = 0) => { bushBall(mb, X(u), Y0, Z(v), r, h, { round: true, density: 24, size: 0.2, flowers: fl ? n || Math.round(r * 22) : 0, flowerCol: FL[fl] });
    colliders.push({ x0: X(u) - r * 0.7, x1: X(u) + r * 0.7, z0: Z(v) - r * 0.7, z1: Z(v) + r * 0.7, h: Y0 + h, kind: 'landmark', id: 'hospShrub' }); };
  // round the fountain: four flowering beds on the lawn corners
  for (const [du, dv, fl] of [[-4.6, -1.8, 'red'], [4.6, -1.8, 'mag'], [-4.6, 1.8, 'yel'], [4.6, 1.8, 'red']]) { shrub(F.u + du, F.v + dv, 0.7, 1.0, fl); shrub(F.u + du * 1.25, F.v + dv * 1.6, 0.5, 0.75, null); }
  // clusters on the lawns (clear of the trees and the walls)
  for (const [u, v, s, fl] of [[-30, 22, 1, null], [-44, 46, 1.1, 'mag'], [-14, 36, 0.9, null], [14, 46, 1, 'red'], [20, 74, 1, null], [-16, 80, 1, 'yel'], [44, 32, 1.1, null], [42, 70, 1, 'mag'], [-44, 92, 1, null], [-34, 64, 0.9, 'wht'], [24, 98, 0.9, null]]) {
    shrub(u, v, 0.8 * s, 1.15 * s, fl); shrub(u + 1.1 * s, v + 0.5, 0.55 * s, 0.85 * s, null); shrub(u - 0.5, v + 1.0 * s, 0.5 * s, 0.7 * s, fl && 'wht', 6); }
  // benches along the path (the one the garden patient sits on is built with him, HospitalGarden.js)
  for (const [u, v] of [[2.25, 52], [-2.25, 64], [2.25, 78], [-2.25, 92]]) { const yaw = u < 0 ? Math.PI / 2 : -Math.PI / 2; parkBench(E, X(u), Y0, Z(v), yaw, 0.45); parkBenchColliders(colliders, X(u), Z(v), yaw, Y0 + 0.86, 'hospBench'); }
  // 80th: raised flower beds (stone kerb, dark soil; the plants are Flowers.js instances, HospitalGarden.js) and a mixed
  // shrub border along the compound walls, clear of the trees, the beds and the back gate
  const N = 28, ring = (u, v, r) => Array.from({ length: N }, (_, k) => { const a = k / N * Math.PI * 2; return [X(u) + Math.cos(a) * r, Z(v) + Math.sin(a) * r]; });
  for (const [u, v, r] of GARDEN_BEDS) { const x = X(u), z = Z(v);
    E('h_render').cylinder(x, Y0, z, r + 0.16, r + 0.16, 0.34, N, { col: C('#cfc9bb'), caps: false }); E('h_render').cylinder(x, Y0, z, r, r, 0.34, N, { col: C('#b9b3a5'), caps: false });
    const p = ring(u, v, r + 0.16), q = ring(u, v, r); for (let k = 0; k < N; k++) { const a = p[k], b = p[(k + 1) % N], c = q[(k + 1) % N], d = q[k]; E('h_render').quad([a[0], Y0 + 0.34, a[1]], [b[0], Y0 + 0.34, b[1]], [c[0], Y0 + 0.34, c[1]], [d[0], Y0 + 0.34, d[1]], [0, 0, 1, 0.1], C('#ddd8cb')); }
    E('soil').hpoly(q, Y0 + 0.26, 1.5);
    colliders.push({ x0: x - r - 0.16, x1: x + r + 0.16, z0: z - r - 0.16, z1: z + r + 0.16, h: Y0 + 0.34, kind: 'landmark', id: 'hospBed' }); }
  { const clear = (u, v, m) => GARDEN_TREES.every(([, tu, tv]) => Math.hypot(u - tu, v - tv) > m) && GARDEN_BEDS.every(([bu, bv, br]) => Math.hypot(u - bu, v - bv) > br + m);
    const KIND = [[1.35, 1.8, 'red'], [1.0, 1.3, null], [1.55, 2.1, null], [1.15, 1.5, 'mag'], [0.95, 1.2, null], [1.4, 1.85, 'yel'], [1.1, 1.45, null], [1.25, 1.65, 'wht']];
    const runs = [[-49.6, 5, -49.6, 102], [49.6, 13, 49.6, 102], [-49.6, 102.6, -5.5, 102.6], [5.5, 102.6, 49.6, 102.6]]; let n = 0;
    for (const [u0, v0, u1, v1] of runs) { const L = Math.hypot(u1 - u0, v1 - v0), cnt = Math.floor(L / 2.1);
      for (let i = 0; i <= cnt; i++) { const t = i / cnt, j = Math.sin(n * 12.9898) * 0.5; const u = u0 + (u1 - u0) * t + (u0 === u1 ? j * 0.5 : 0), v = v0 + (v1 - v0) * t + (v0 === v1 ? j * 0.5 : 0);
        const [r, h, fl] = KIND[n++ % KIND.length]; if (!clear(u, v, r + 1.2)) continue; shrub(u, v, r, h, fl);
        if (n % 2 === 0) { const iu = u + (u0 === u1 ? -Math.sign(u) * (r + 0.55) : 0.6), iv = v + (v0 === v1 ? -(r + 0.55) : 0.7); if (clear(iu, iv, 1.5)) shrub(iu, iv, 0.6, 0.75, n % 4 === 0 ? 'wht' : null, 8); } } } }
  // low clipped hedges framing the four lawns' path corners near the building (box-edged beds of ixora: flowering red)
  for (const su of [-1, 1]) { hedgeBox(mb, X(su * 12.5), Y0, Z(26.8), 15, 0.45, 0.45, 0, { density: 11, seed: 300 + su });
    colliders.push({ x0: X(su * 12.5) - 7.5, x1: X(su * 12.5) + 7.5, z0: Z(26.8) - 0.23, z1: Z(26.8) + 0.23, h: Y0 + 0.45, kind: 'landmark', id: 'hospHedge' }); }
}
