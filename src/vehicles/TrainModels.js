// Train geometry (54th request: "the train should look Sri Lankan and specially realistic, with real windows").
//
// buildDmuCar(cab) — a Sri Lanka Railways commuter diesel multiple unit car in the S11 style seen at Colombo Fort every
//   day: blue body, red lower body with two white pin-stripes, cream window surrounds; the driving car has the white cab
//   front with the red roof cap, twin rectangular headlamp clusters, a red grille band, a red pilot with bars, side buffers
//   and a centre coupler. The car is a real shell, NOT a painted box: every side window is an opening through an outer skin
//   and an inner lining (frame, three safety bars, the upper sash glazed and the lower sash dropped open on most windows),
//   the doorways are open (Sri Lankan commuters ride with the doors open) with grab poles and a step, and through them you
//   see the interior: grey floor, cream lining, 3 + 2 facing vinyl benches in every bay, luggage racks, aisle grab rails,
//   ceiling fans and fluorescent tubes (lit at night).
// buildClassicCoach() — the older maroon SLR passenger coach (barred windows with wooden shutters, open end doorways,
//   wooden benches) used for the stabled rake in the Fort yard.
// No textures: vertex colours on the shared materials (MAT.paint / MAT.metal) + three small train materials; one mesh per
// material per car prototype (the running train instances the prototypes; the yard coaches are merged into the station).
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { LayerRouter, mergeLayered, stationMaterial, colKey } from '../gfx/StationPBR.js';

export const CAR_LEN = 19.6, BOGIE = 14, CAR_W = 3.0;
export const FLOOR_Y = 1.3; // car floor above the rail top
export const DOOR_W = 1.15, DOOR_TOP = 3.12;
const SILL = 1.98, HEAD = 2.86, EAVE = 3.42, CEIL = 3.34, ROOF_TOP = 3.98, SKIN = 0.025, LIN = 0.02, WALL = 0.085;
export const COL = {
  blue: [0.09, 0.21, 0.56], red: [0.74, 0.1, 0.12], white: [0.93, 0.93, 0.9], cream: [0.9, 0.87, 0.77], roof: [0.55, 0.56, 0.57], roofDk: [0.36, 0.37, 0.38],
  under: [0.15, 0.15, 0.16], bogie: [0.11, 0.11, 0.11], gang: [0.08, 0.08, 0.08], yellow: [0.92, 0.75, 0.1], lining: [0.85, 0.84, 0.76], ceiling: [0.92, 0.92, 0.88],
  floor: [0.3, 0.31, 0.32], seat: [0.13, 0.27, 0.52], seatDk: [0.1, 0.2, 0.4], frameAl: [0.78, 0.79, 0.8], bar: [0.62, 0.63, 0.64], black: [0.05, 0.05, 0.05],
  maroon: [0.42, 0.1, 0.09], maroonDk: [0.3, 0.07, 0.06], wood: [0.45, 0.3, 0.17], woodDk: [0.33, 0.21, 0.12], liningOld: [0.78, 0.74, 0.6],
};

// 55th: real surfaces — every paint / metal call lands on a layered PBR material picked from its colour (carriage enamel
// with grime and rain streaks, greasy underframe steel, galvanised roof, sheet vinyl floor and seats, rubber, brushed
// steel, varnished wood). The layer builders live in the car's MultiBuilder under '@layer' keys.
const TRAIN_LAYER = new Map([
  ...['blue', 'red', 'white', 'cream', 'maroon', 'maroonDk'].map((k) => [colKey(COL[k]), 'carPaint']),
  ...['under', 'bogie'].map((k) => [colKey(COL[k]), 'under']), [colKey([0.3, 0.29, 0.28]), 'under'], [colKey([0.2, 0.2, 0.21]), 'under'], [colKey([0.22, 0.22, 0.23]), 'under'], [colKey([0.18, 0.18, 0.18]), 'under'], [colKey([0.5, 0.48, 0.2]), 'under'],
  [colKey(COL.gang), 'rubber'], [colKey(COL.black), 'rubber'], [colKey([0.15, 0.15, 0.15]), 'rubber'],
  [colKey(COL.floor), 'vinyl'], [colKey(COL.seat), 'vinyl'], [colKey(COL.seatDk), 'vinyl'], [colKey([0.6, 0.62, 0.6]), 'vinyl'],
  [colKey(COL.lining), 'paint'], [colKey(COL.ceiling), 'paint'], [colKey(COL.liningOld), 'paint'], [colKey([0.86, 0.84, 0.74]), 'paint'], [colKey([0.55, 0.57, 0.58]), 'paint'],
  [colKey(COL.frameAl), 'steel'], [colKey(COL.bar), 'steel'], [colKey(COL.yellow), 'enamel'],
  [colKey(COL.wood), 'wood'], [colKey(COL.woodDk), 'wood'],
  [colKey(COL.roof), 'galv'], [colKey(COL.roofDk), 'galv'], [colKey([0.3, 0.27, 0.26]), 'galv'], [colKey([0.22, 0.2, 0.19]), 'galv'], [colKey([0.25, 0.23, 0.22]), 'galv'], [colKey([0.3, 0.31, 0.32]), 'galv'],
]);
class LayerMB { constructor(mb) { this.mb = mb; } get(n) { return this.mb.get('@' + n); } }
const routers = (mb) => { const lm = new LayerMB(mb), pick = (c) => TRAIN_LAYER.get(colKey(c)); return { P: new LayerRouter(lm, 'carPaint', pick), M: new LayerRouter(lm, 'steel', pick) }; };

// ---------------------------------------------------------------- helpers
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
// box with any orientation (Euler XYZ, radians)
export function ebox(b, cx, cy, cz, sx, sy, sz, rx, ry, rz, col) { _q.setFromEuler(_e.set(rx, ry, rz)); _m.compose(_p.set(cx, cy, cz), _q, _s.set(sx, sy, sz)); b.geometry(UNIT, _m, col); }
// beam between two points, cross-section w × h
export function beam(b, ax, ay, az, bx, by, bz, w, h, col) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1e-6; const yaw = Math.atan2(dx, dz), pitch = -Math.asin(Math.max(-1, Math.min(1, dy / L)));
  _q.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ')); _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(w, h, L)); b.geometry(UNIT, _m, col);
}
// round bar between two points
export function rod(b, ax, ay, az, bx, by, bz, r, col) {
  _d.set(bx - ax, by - ay, bz - az); const L = _d.length() || 1e-6; _q.setFromUnitVectors(UP, _d.normalize());
  _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(r, L, r)); b.geometry(CYL, _m, col);
}
// split [a, b] by holes [[h0, h1], …] → solid pieces
export function solids(a, b, holes) { const hs = holes.filter(([h0, h1]) => h1 > a && h0 < b).sort((p, q) => p[0] - q[0]); const out = []; let x = a; for (const [h0, h1] of hs) { if (h0 > x + 1e-4) out.push([x, Math.min(h0, b)]); x = Math.max(x, h1); } if (b > x + 1e-4) out.push([x, b]); return out; }
// evenly spaced windows inside each solid wall segment
function spreadWindows(segs, pitch, ww) { const out = []; for (const [a, b] of segs) { const S = b - a; const n = Math.floor((S - 0.25) / pitch); if (n < 1) continue; const p = S / n; for (let k = 0; k < n; k++) if (p >= ww + 0.18) out.push(a + p * (k + 0.5)); } return out; }

// ---------------------------------------------------------------- generic car shell with real openings
function shell(mb, o) {
  const { P, M } = routers(mb), G = mb.get('trainGlass'), E = mb.get('trainLamp');
  const L2 = o.len / 2, hw = o.hw, inner = hw - WALL; const sill = o.sill ?? SILL, head = o.head ?? HEAD, doorTop = o.doorTop ?? DOOR_TOP;
  const cabBack = o.cabLen ? L2 - o.cabLen : L2;
  const doorHoles = o.doors.map((z) => [z - DOOR_W / 2, z + DOOR_W / 2]);
  const winZ = spreadWindows(solids(-L2 + 0.55, cabBack - 0.35, doorHoles.map(([a, b]) => [a - 0.18, b + 0.18])), o.pitch, o.windowW);
  const ww = o.windowW, winHoles = winZ.map((z) => [z - ww / 2, z + ww / 2]);
  const lowTop = o.bands[o.bands.length - 1][1];
  for (const sx of [-1, 1]) {
    const xs = sx * (hw - SKIN / 2), xl = sx * (inner + LIN / 2);
    const skin = (z0, z1, y0, y1, col) => { if (o.cabLen && y1 > 2.25) z1 = Math.min(z1, L2 - 0.34 * Math.min(1, (y1 - 2.25) / 1.2) - 0.01); if (z1 <= z0) return; P.box(xs, (y0 + y1) / 2, (z0 + z1) / 2, SKIN, y1 - y0, z1 - z0, { col, top: false }); };
    const lin = (z0, z1, y0, y1, col) => P.box(xl, (y0 + y1) / 2, (z0 + z1) / 2, LIN, y1 - y0, z1 - z0, { col, top: false });
    // outer skin: lower livery bands (doorways cut through), window band piers, band above the windows, cant rail band
    for (const [y0, y1, col] of o.bands) for (const [a, b] of solids(-L2, L2, doorHoles)) skin(a, b, y0, y1, col);
    for (const [a, b] of solids(-L2, L2, [...doorHoles, ...winHoles])) skin(a, b, lowTop, head, o.body);
    for (const [a, b] of solids(-L2, L2, doorHoles)) skin(a, b, head, doorTop, o.body);
    skin(-L2, L2, doorTop, EAVE, o.upper || o.body);
    if (o.cantStripe) P.box(sx * (hw + 0.002), EAVE - 0.05, -0.17 * (o.cabLen ? 1 : 0), 0.01, 0.04, o.len - (o.cabLen ? 0.36 : 0), { col: o.cantStripe });
    // inner lining with the same openings
    for (const [a, b] of solids(-L2 + 0.1, L2 - 0.1, doorHoles)) lin(a, b, FLOOR_Y, sill, o.liningLow || o.lining);
    for (const [a, b] of solids(-L2 + 0.1, L2 - 0.1, [...doorHoles, ...winHoles])) lin(a, b, sill, head, o.lining);
    for (const [a, b] of solids(-L2 + 0.1, L2 - 0.1, doorHoles)) lin(a, b, head, doorTop, o.lining);
    lin(-L2 + 0.1, L2 - 0.1, doorTop, CEIL, o.lining);
    // windows: frame through the wall, safety bars, upper sash glazed, lower sash dropped (a few pushed up)
    winZ.forEach((z, i) => {
      const xr = sx * (hw - WALL / 2), F = o.frame, fw = 0.045;
      P.box(xr, sill + 0.012, z, WALL + 0.012, 0.03, ww + 0.02, { col: F, top: true });
      P.box(xr, head - 0.015, z, WALL + 0.012, 0.03, ww + 0.02, { col: F, bottom: true });
      for (const e of [-1, 1]) P.box(xr, (sill + head) / 2, z + e * (ww / 2 - fw / 2 + 0.005), WALL + 0.012, head - sill, fw, { col: F });
      const xb = sx * (hw - 0.03), nb = o.bars ?? 3; for (let k = 0; k < nb; k++) M.box(xb, sill + ((head - sill) * (k + 1)) / (nb + 1), z, 0.018, 0.018, ww - 0.06, { col: COL.bar });
      const mid = (sill + head) / 2, xg = sx * (hw - 0.055);
      P.box(sx * (hw - 0.05), mid + 0.01, z, 0.02, 0.025, ww - 0.04, { col: F }); // meeting rail
      G.box(xg, (mid + head) / 2, z, 0.008, head - mid - 0.03, ww - 0.08); // upper sash: fixed glass
      const shut = o.glazedEvery && i % o.glazedEvery === (sx > 0 ? 1 : 2) % o.glazedEvery;
      if (shut) G.box(xg - sx * 0.02, (sill + mid) / 2, z, 0.008, mid - sill - 0.03, ww - 0.08);
      else G.box(xg - sx * 0.02, sill + 0.06, z, 0.008, 0.08, ww - 0.08); // dropped lower sash: only its top edge above the sill
      if (o.shutters && i % 3 === (sx > 0 ? 0 : 1)) P.box(sx * (hw - 0.07), (sill + mid) / 2, z, 0.015, mid - sill - 0.02, ww - 0.06, { col: COL.woodDk });
    });
    // doorways: reveals, header, grab poles, step with a yellow nosing
    for (const dz of o.doors) {
      const xr = sx * (hw - WALL / 2);
      for (const e of [-1, 1]) P.box(xr, (FLOOR_Y + doorTop) / 2, dz + e * (DOOR_W / 2 + 0.02), WALL + 0.01, doorTop - FLOOR_Y, 0.04, { col: o.frame });
      P.box(xr, doorTop + 0.02, dz, WALL + 0.01, 0.04, DOOR_W + 0.08, { col: o.frame, bottom: true });
      for (const e of [-1, 1]) rod(M, sx * (hw - 0.16), FLOOR_Y + 0.05, dz + e * (DOOR_W / 2 - 0.06), sx * (hw - 0.16), doorTop - 0.05, dz + e * (DOOR_W / 2 - 0.06), 0.017, COL.yellow);
      P.box(sx * (hw + 0.05), 0.97, dz, 0.2, 0.05, DOOR_W - 0.05, { col: [0.2, 0.2, 0.21], bottom: true });
      P.box(sx * (hw + 0.146), 0.99, dz, 0.014, 0.026, DOOR_W - 0.05, { col: COL.yellow });
      P.box(sx * (hw - 0.02), (0.97 + FLOOR_Y) / 2, dz, 0.04, FLOOR_Y - 0.97, DOOR_W - 0.05, { col: [0.2, 0.2, 0.21] });
    }
  }
  // floor, underframe, ceiling, curved roof
  P.box(0, FLOOR_Y - 0.04, 0, inner * 2, 0.08, o.len - 0.04, { col: COL.floor });
  P.box(0, 1.1, 0, hw * 2 - 0.04, 0.24, o.len - 0.06, { col: COL.under, bottom: true, top: false });
  P.box(0, CEIL + 0.01, 0, inner * 2, 0.02, o.len - 0.2, { col: o.ceiling || COL.ceiling, top: false, bottom: true });
  const prof = [], NR = 7; for (let k = 0; k <= NR; k++) { const a = (k / NR) * Math.PI; prof.push([Math.cos(a) * hw, EAVE + Math.sin(a) * (ROOF_TOP - EAVE)]); }
  const rc = o.roof || COL.roof, rEnd = o.cabLen ? L2 - 0.34 : L2;
  for (let k = 0; k < NR; k++) { const [x0, y0] = prof[k], [x1, y1] = prof[k + 1]; P.quad([x0, y0, -L2], [x1, y1, -L2], [x1, y1, rEnd], [x0, y0, rEnd], [0, 0, 1, 1], rc); }
  for (const zc of o.cabLen ? [-L2] : [-L2, L2]) for (let k = 0; k < NR; k++) { const [x0, y0] = prof[k], [x1, y1] = prof[k + 1]; if (zc > 0) P.quad([0, EAVE - 0.01, zc], [x0, y0, zc], [x1, y1, zc], [x1, y1, zc], [0, 0, 1, 1], o.endCol || o.body); else P.quad([0, EAVE - 0.01, zc], [x1, y1, zc], [x0, y0, zc], [x0, y0, zc], [0, 0, 1, 1], o.endCol || o.body); }
  P.box(0, ROOF_TOP - 0.005, o.cabLen ? -0.5 : 0, 0.5, 0.03, o.len - (o.cabLen ? 1.6 : 0.6), { col: o.roofDk || COL.roofDk });
  for (const sx of [-1, 1]) P.box(sx * (hw - 0.01), EAVE + 0.03, o.cabLen ? -0.17 : 0, 0.05, 0.05, o.len - (o.cabLen ? 0.34 : 0), { col: o.roofDk || COL.roofDk });
  // ends: outer end wall + inner bulkhead with a gangway door
  for (const s of [-1, 1]) {
    if (o.cabLen && s > 0) continue;
    P.box(0, (1.0 + EAVE) / 2, s * (L2 - SKIN / 2), hw * 2, EAVE - 1.0, SKIN, { col: o.endCol || o.body });
    P.box(0, (FLOOR_Y + CEIL) / 2, s * (L2 - 0.12), inner * 2, CEIL - FLOOR_Y, 0.02, { col: o.lining });
    P.box(0, (FLOOR_Y + 2.95) / 2, s * (L2 - 0.135), 0.9, 2.95 - FLOOR_Y, 0.012, { col: o.interior === 'classic' ? COL.woodDk : [0.55, 0.57, 0.58] });
  }
  // ---- interior fit-out
  const seats = [];
  if (o.interior === 'dmu') {
    for (const zc of winZ) for (const f of [-1, 1]) { // facing pair per window bay: 3-seat (x < 0) and 2-seat (x > 0) across the aisle
      const sz = zc - f * 0.52, yaw = f > 0 ? 0 : Math.PI, seatY = FLOOR_Y + 0.44;
      for (const [x0, x1, n] of [[-inner + 0.02, -0.08, 3], [0.52, inner - 0.02, 2]]) {
        const cx = (x0 + x1) / 2, wdt = x1 - x0;
        P.box(cx, seatY - 0.05, sz, wdt, 0.1, 0.44, { col: COL.seat, bottom: true });
        P.box(cx, seatY + 0.33, sz - f * 0.22, wdt, 0.62, 0.07, { col: COL.seatDk });
        P.box(cx, seatY + 0.66, sz - f * 0.22, wdt, 0.05, 0.1, { col: COL.frameAl });
        M.box(cx, FLOOR_Y + 0.2, sz, 0.05, 0.4, 0.36, { col: COL.bar });
        for (let k = 0; k < n; k++) seats.push({ x: x0 + (wdt * (k + 0.5)) / n, y: seatY, z: sz + f * 0.03, yaw });
      }
    }
    for (const sx of [-1, 1]) for (const [a, b] of solids(-L2 + 0.3, cabBack - 0.3, doorHoles.map(([p, q]) => [p - 0.1, q + 0.1]))) { for (const xo of [0.12, 0.36]) rod(M, sx * (inner - xo), 2.98, a, sx * (inner - xo), 2.98, b, 0.012, COL.bar); for (let z = a + 0.2; z < b; z += 1.6) M.box(sx * (inner - 0.2), 3.0, z, 0.4, 0.03, 0.03, { col: COL.bar }); }
    for (const x of [-0.12, 0.6]) rod(M, x, 2.92, -L2 + 0.5, x, 2.92, cabBack - 0.5, 0.014, COL.bar);
    for (let z = -L2 + 2.5; z < cabBack - 1; z += 4.2) {
      M.box(0.24, CEIL - 0.1, z, 0.04, 0.2, 0.04, { col: COL.white }); P.box(0.24, CEIL - 0.24, z, 0.22, 0.1, 0.22, { col: COL.white, bottom: true });
      for (let k = 0; k < 3; k++) { const a = k * (Math.PI * 2 / 3) + z; ebox(P, 0.24 + Math.cos(a) * 0.32, CEIL - 0.26, z + Math.sin(a) * 0.32, 0.5, 0.012, 0.11, 0, -a, 0, COL.white); }
    }
    for (let z = -L2 + 1.2; z < cabBack - 0.8; z += 2.6) for (const x of [-0.85, 1.05]) E.box(x, CEIL - 0.025, z, 0.06, 0.03, 1.15, { bottom: true });
  } else if (o.interior === 'classic') {
    for (const zc of winZ) for (const f of [-1, 1]) { const sz = zc - f * 0.48, seatY = FLOOR_Y + 0.42;
      for (const [x0, x1] of [[-inner + 0.02, -0.35], [0.35, inner - 0.02]]) { const cx = (x0 + x1) / 2, wdt = x1 - x0; P.box(cx, seatY - 0.04, sz, wdt, 0.06, 0.42, { col: COL.wood, bottom: true }); P.box(cx, seatY + 0.32, sz - f * 0.2, wdt, 0.55, 0.05, { col: COL.woodDk }); P.box(cx, FLOOR_Y + 0.19, sz, wdt - 0.1, 0.38, 0.05, { col: COL.woodDk }); } }
    for (let z = -L2 + 2; z < L2 - 1; z += 3.2) E.box(0, CEIL - 0.025, z, 0.06, 0.03, 1.0, { bottom: true });
  }
  return { seats, winZ };
}

// ---------------------------------------------------------------- running gear
// a wheelset: two wheels (dished web, rim, polished tread band, flange on the inside), the axle, a balance weight and hub bolts
// on each outer face (so the turning is visible). y = 0 at the axle centre.
const WPROF = [[0.0, -0.09], [0.11, -0.09], [0.34, -0.035], [0.4, -0.065], [0.455, -0.065], [0.46, 0.035], [0.49, 0.055], [0.44, 0.07], [0.34, 0.03], [0.11, 0.09], [0.0, 0.09]].map(([r, a]) => new THREE.Vector2(r, a));
const WLATHE = new THREE.LatheGeometry(WPROF, 16), WTREAD = new THREE.CylinderGeometry(0.4615, 0.4615, 0.095, 16, 1, true), WAXLE = new THREE.CylinderGeometry(0.075, 0.075, 1.62, 10);
export function addWheelset(mb, M4) {
  const lm = new LayerMB(mb), U = lm.get('under'), S = lm.get('steel'); const m = new THREE.Matrix4(), r = new THREE.Matrix4(), t = new THREE.Matrix4();
  for (const sx of [-1, 1]) { r.makeRotationZ(sx < 0 ? -Math.PI / 2 : Math.PI / 2); t.makeTranslation(sx * 0.87, 0, 0); const W = new THREE.Matrix4().multiplyMatrices(M4, t).multiply(r);
    U.geometry(WLATHE, W, [0.3, 0.29, 0.28]); S.geometry(WTREAD, m.copy(W).multiply(new THREE.Matrix4().makeTranslation(0, -0.015, 0)), [0.62, 0.6, 0.58]);
    U.geometry(UNIT, m.copy(W).multiply(new THREE.Matrix4().compose(new THREE.Vector3(0.25, -0.05, 0), new THREE.Quaternion(), new THREE.Vector3(0.12, 0.03, 0.07))), [0.24, 0.23, 0.22]); // balance weight
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; U.geometry(UNIT, m.copy(W).multiply(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 0.065, -0.095, Math.sin(a) * 0.065), new THREE.Quaternion(), new THREE.Vector3(0.022, 0.014, 0.022))), [0.4, 0.39, 0.37]); } }
  r.makeRotationZ(Math.PI / 2); U.geometry(WAXLE, m.multiplyMatrices(M4, r), [0.3, 0.29, 0.28]);
}
// the running train's wheelsets are one InstancedMesh per train (Trains.js), turned by the distance run
export function wheelsetGeometry() { const mb = new MultiBuilder(); addWheelset(mb, new THREE.Matrix4()); return mergeLayered(layerParts(mb).lay); }
export function wheelsetSpots(bogie) { const out = []; for (const bz of [-bogie / 2, bogie / 2]) for (const az of [-1.3, 1.3]) out.push(bz + az); return out; }
function runningGear(mb, bogie, power, liveWheels = false) {
  const { P, M } = routers(mb);
  if (power) { P.box(0, 0.78, 0, 2.2, 0.45, 6.5, { col: COL.under }); P.box(0, 0.8, 0, 2.5, 0.3, 1.2, { col: [0.22, 0.22, 0.23] }); } // engine + fuel tank
  else P.box(0, 0.86, 0, 1.6, 0.3, 2.4, { col: COL.under }); // brake cylinder / battery box
  for (const z of [-2.2, 2.4]) P.box(0.7, 0.8, z, 0.9, 0.34, 1.1, { col: [0.2, 0.2, 0.21] });
  for (const bz of [-bogie / 2, bogie / 2]) {
    P.box(0, 0.6, bz, 1.4, 0.26, 2.0, { col: COL.bogie, bottom: true }); P.box(0, 0.88, bz, 1.4, 0.2, 1.4, { col: COL.bogie }); for (const sx of [-1, 1]) P.box(sx * 0.95, 0.66, bz, 0.26, 0.14, 0.5, { col: COL.bogie }); // transom + bolster clear of the wheels (55th: they cut through them), transom arms to the side frames
    for (const sx of [-1, 1]) { P.box(sx * 1.12, 0.62, bz, 0.12, 0.42, 2.9, { col: COL.bogie }); for (const az of [-0.6, 0.6]) M.cylinder(sx * 1.12, 0.66, bz + az, 0.09, 0.09, 0.36, 8, { col: [0.5, 0.48, 0.2] }); }
    for (const az of [-1.3, 1.3]) { if (!liveWheels) addWheelset(mb, new THREE.Matrix4().makeTranslation(0, 0.46, bz + az)); for (const sx of [-1, 1]) { P.box(sx * 1.08, 0.46, bz + az, 0.16, 0.22, 0.3, { col: [0.18, 0.18, 0.18] }); } } // axle boxes
  }
}

// ---------------------------------------------------------------- the DMU car (local: +z = car front, y = 0 at rail top)
export function doorZs(cab) { const L2 = CAR_LEN / 2; return [-L2 + 3.4, cab ? L2 - 4.7 : L2 - 3.4]; }
export function buildDmuCar(cab, { liveWheels = false } = {}) {
  const mb = new MultiBuilder(); const { P, M } = routers(mb), C = mb.get('trainCabGlass'); const L2 = CAR_LEN / 2, hw = CAR_W / 2;
  runningGear(mb, BOGIE, cab, liveWheels);
  const r = shell(mb, {
    len: CAR_LEN, hw, doors: doorZs(cab), cabLen: cab ? 2.7 : 0, windowW: 1.06, pitch: 1.5, interior: 'dmu', glazedEvery: 4,
    bands: [[1.0, 1.4, COL.red], [1.4, 1.45, COL.white], [1.45, 1.78, COL.red], [1.78, 1.83, COL.white], [1.83, SILL, COL.blue]],
    body: COL.blue, frame: COL.cream, lining: COL.lining, liningLow: [0.6, 0.62, 0.6], cantStripe: COL.white, endCol: COL.blue,
  });
  for (const s of cab ? [-1] : [-1, 1]) { P.box(0, 2.3, s * (L2 + 0.22), 1.3, 2.3, 0.44, { col: COL.gang }); for (const e of [-1, 1]) P.box(e * 0.68, 2.3, s * (L2 + 0.2), 0.06, 2.2, 0.4, { col: [0.15, 0.15, 0.15] }); for (let k = 0; k < 6; k++) P.box(0, 2.3, s * (L2 + 0.04 + k * 0.07), 1.34, 2.34, 0.025, { col: [0.15, 0.15, 0.15] }); P.box(0, 1.05, s * (L2 + 0.21), 0.3, 0.24, 0.42, { col: COL.under }); } // 55th: bellows end 4 cm short of the gap's middle (the two cars' gangways used to meet face to face and flicker); bellows folds
  for (let z = -L2 + 1.8; z < L2 - (cab ? 3.2 : 1.5); z += 2.4) { P.cylinder(0, ROOF_TOP - 0.02, z, 0.17, 0.2, 0.12, 10, { col: COL.roofDk }); P.cylinder(0, ROOF_TOP + 0.1, z, 0.24, 0.24, 0.05, 10, { col: COL.roof }); }
  if (cab) {
    P.box(0, ROOF_TOP + 0.08, -2.5, 1.3, 0.22, 2.4, { col: [0.3, 0.31, 0.32] }); M.cylinder(0.35, ROOF_TOP, -4.4, 0.09, 0.09, 0.42, 8, { col: [0.15, 0.15, 0.15] }); // radiator housing + exhaust
    const zf = L2, W = COL.white, Rd = COL.red;
    P.box(0, 1.65, zf - 0.03, CAR_W - 0.02, 1.3, 0.06, { col: W });
    P.box(0, 1.62, zf + 0.005, 2.3, 0.26, 0.04, { col: Rd }); for (let k = -5; k <= 5; k++) P.box(k * 0.13, 1.62, zf + 0.03, 0.05, 0.18, 0.02, { col: [0.45, 0.06, 0.07] }); // red band + grille
    for (const sx of [-1, 1]) P.box(sx * 0.98, 2.06, zf, 0.5, 0.26, 0.06, { col: COL.black }); // headlamp housings (lamp faces are live meshes in Trains.js)
    ebox(P, 0, 2.86, zf - 0.17, CAR_W - 0.04, 1.2, 0.06, -0.26, 0, 0, W); // raked upper front
    for (const sx of [-1, 1]) { ebox(P, sx * 0.62, 2.84, zf - 0.135, 1.12, 0.82, 0.03, -0.26, 0, 0, COL.black); ebox(C, sx * 0.62, 2.84, zf - 0.115, 1.02, 0.72, 0.02, -0.26, 0, 0); beam(M, sx * 0.62 - 0.35, 2.55, zf - 0.07, sx * 0.62 + 0.05, 2.95, zf - 0.16, 0.02, 0.02, COL.black); }
    P.box(0, 3.55, zf - 0.33, CAR_W - 0.04, 0.42, 0.06, { col: Rd }); P.box(0, 3.55, zf - 0.295, 1.4, 0.3, 0.02, { col: COL.black }); // red cap band + destination blind
    const pf = []; for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI; pf.push([Math.cos(a) * hw, EAVE + Math.sin(a) * (ROOF_TOP - EAVE)]); }
    for (let k = 0; k < 6; k++) { const [x0, y0] = pf[k], [x1, y1] = pf[k + 1]; P.quad([0, 3.4, zf - 0.34], [x0, y0, zf - 0.34], [x1, y1, zf - 0.34], [x1, y1, zf - 0.34], [0, 0, 1, 1], Rd); }
    P.box(0, ROOF_TOP + 0.005, zf - 1.3, CAR_W * 0.6, 0.06, 1.9, { col: Rd }); P.box(0, 3.82, zf - 0.42, 0.42, 0.2, 0.14, { col: COL.black });
    for (const sx of [-1, 1]) {
      P.box(sx * (hw + 0.005), 2.75, zf - 1.5, 0.01, 1.3, 2.3, { col: Rd }); P.box(sx * (hw + 0.005), 1.55, zf - 1.35, 0.01, 1.1, 2.6, { col: W }); // red over white, edge to edge (they overlapped 2 mm apart: flicker)
      P.box(sx * (hw + 0.016), 2.2, zf - 1.55, 0.012, 2.0, 0.72, { col: [0.6, 0.08, 0.09] }); C.box(sx * (hw + 0.028), 2.75, zf - 1.55, 0.008, 0.62, 0.5); C.box(sx * (hw + 0.016), 2.75, zf - 0.75, 0.008, 0.62, 0.6); // cab door 1 cm proud, its droplight 1 cm proud of that
      rod(M, sx * (hw + 0.07), 1.6, zf - 1.1, sx * (hw + 0.07), 2.9, zf - 1.1, 0.015, COL.bar); rod(M, sx * (hw + 0.07), 1.6, zf - 2.0, sx * (hw + 0.07), 2.9, zf - 2.0, 0.015, COL.bar);
    }
    P.box(0, 0.72, zf + 0.12, 2.6, 0.62, 0.14, { col: Rd, bottom: true }); for (let k = -9; k <= 9; k++) M.box(k * 0.13, 0.66, zf + 0.2, 0.035, 0.42, 0.03, { col: [0.5, 0.07, 0.08] }); // pilot with bars
    for (const sx of [-1, 1]) { rod(M, sx * 1.12, 1.08, zf, sx * 1.12, 1.08, zf + 0.36, 0.07, COL.black); rod(M, sx * 1.12, 1.08, zf + 0.36, sx * 1.12, 1.08, zf + 0.4, 0.2, [0.25, 0.25, 0.25]); } // buffers
    P.box(0, 1.06, zf + 0.32, 0.36, 0.3, 0.55, { col: COL.black }); P.box(0, 1.06, zf + 0.62, 0.26, 0.36, 0.1, { col: COL.black }); // centre coupler
    for (const sx of [-0.55, 0.55]) rod(M, sx, 1.05, zf + 0.15, sx * 0.9, 0.62, zf + 0.3, 0.025, COL.black);
    P.box(0, 1.85, zf - 0.55, 2.6, 0.5, 0.5, { col: [0.25, 0.27, 0.27] }); P.box(-0.75, 1.7, zf - 1.4, 0.5, 0.12, 0.5, { col: COL.seatDk }); P.box(-0.75, 2.05, zf - 1.68, 0.5, 0.6, 0.08, { col: COL.seatDk });
    P.box(0, (FLOOR_Y + CEIL) / 2, zf - 2.68, CAR_W - 0.18, CEIL - FLOOR_Y, 0.05, { col: COL.lining }); P.box(0.6, 2.2, zf - 2.71, 0.7, 1.8, 0.02, { col: [0.55, 0.57, 0.58] });
  }
  return { mb, seats: r.seats, winZ: r.winZ };
}

// ---------------------------------------------------------------- classic maroon coach (stabled in the yard)
export const COACH_LEN = 18.6;
export function buildClassicCoach() {
  const mb = new MultiBuilder(); const L2 = COACH_LEN / 2; const { P, M } = routers(mb);
  runningGear(mb, 13, false);
  shell(mb, { len: COACH_LEN, hw: 1.45, doors: [-L2 + 1.0, L2 - 1.0], windowW: 0.72, pitch: 1.18, interior: 'classic', sill: 2.02, head: 2.74, doorTop: 3.05, bars: 3, shutters: true, glazedEvery: 0,
    bands: [[1.0, 1.95, COL.maroon], [1.95, 2.02, COL.maroonDk]], body: COL.maroon, frame: COL.maroonDk, lining: COL.liningOld, liningLow: COL.woodDk, roof: [0.3, 0.27, 0.26], roofDk: [0.22, 0.2, 0.19], endCol: COL.maroonDk, ceiling: [0.86, 0.84, 0.74] });
  for (const s of [-1, 1]) { P.box(0, 2.25, s * (L2 + 0.21), 1.2, 2.1, 0.42, { col: COL.gang }); for (const sx of [-1, 1]) rod(M, sx * 1.1, 1.05, s * L2, sx * 1.1, 1.05, s * (L2 + 0.38), 0.18, [0.22, 0.22, 0.22]); }
  for (let z = -L2 + 1.5; z < L2 - 1.2; z += 2.2) P.box(0, ROOF_TOP + 0.02, z, 0.36, 0.1, 0.36, { col: [0.25, 0.23, 0.22] });
  return mb;
}

// ---------------------------------------------------------------- materials
export function makeTrainMaterials() {
  return Object.assign(Object.create(MAT), {
    trainGlass: new THREE.MeshStandardMaterial({ color: 0x9fb6c0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.26, depthWrite: false }),
    trainCabGlass: new THREE.MeshStandardMaterial({ color: 0x10171c, roughness: 0.06, metalness: 0.6 }),
    trainLamp: new THREE.MeshBasicMaterial({ color: 0x8a8a86, toneMapped: false }),
  });
}
// meshes of a prototype: glass/tubes never cast shadows (the sun comes in through the windows)
export function layerParts(mb) { const plain = new MultiBuilder(), lay = { b: new Map() }; for (const [k, b] of mb.b) { if (k[0] === '@') lay.b.set(k.slice(1), b); else plain.b.set(k, b); } return { plain, lay }; }
export function protoMeshes(mb, mats) { const { plain, lay } = layerParts(mb); const out = plain.toMeshes(mats, { cast: true, receive: true });
  { const g = mergeLayered(lay); if (g) { const m = new THREE.Mesh(g, stationMaterial()); m.name = 'trainPBR'; m.castShadow = true; m.receiveShadow = true; out.unshift(m); } } for (const m of out) if (m.name === 'trainGlass' || m.name === 'trainLamp') { m.castShadow = false; m.receiveShadow = m.name === 'trainGlass' ? false : m.receiveShadow; m.renderOrder = 2; } return out; }
