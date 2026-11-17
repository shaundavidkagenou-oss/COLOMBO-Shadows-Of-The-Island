// The boat models: one builder per type of boat, all from the lofted hull + parts kit in BoatGeo.js. Each returns
//   geo     — the whole body (one draw call, surfaces per vertex)
//   sails   — sail definitions (luff / leech corners in boat space; drawn and shot through by Boat.js)
//   seat    — the helm position (seated / leaning-post / astride), the hands' wheel or bars; crew: extra places
//   lights  — every lamp on the boat, at its lens: navigation lights with their COLREG arcs (sidelights 112.5° from
//             ahead to each side, masthead 225° forward, stern 135° aft, all-round 360°, sailing tricolour at the
//             masthead), deck / cockpit down-lights, underwater lights, police beacons
//   boxes   — hit boxes for bullets (hull, cabin, engine)
// Built once per type and shared by every boat of that type.
import * as THREE from 'three';
import { BoatBuilder, Hull, deck, cockpit, rail, seat, wheel, outboard, canopy, planPoly, C, lerp } from './BoatGeo.js';
import { SURF } from './BoatMaterial.js';
import { BOATS } from './BoatCatalog.js';

const SADDLE = new THREE.CapsuleGeometry(0.5, 1, 4, 14).rotateX(Math.PI / 2); // unit saddle: radius 0.5, 2 long along z
const RED = '#ff2c1c', GREEN = '#22ff6e', WHITE = '#fff4dc';
const GLASS = '#18222b', SS = '#d6dade', BLACK = '#18191b', TEAK = '#a8774d', CREAM = '#ece6d6', OFF = '#f4f3ee';
// combined bicolour lantern on the bow (red to port, green to starboard), screened down the middle
function bicolour(bb, x, y, z) {
  bb.box(SURF.paint, BLACK, x, y, z, 0.13, 0.06, 0.09); bb.box(SURF.lens, RED, x + 0.035, y, z + 0.015, 0.055, 0.045, 0.07); bb.box(SURF.lens, GREEN, x - 0.035, y, z + 0.015, 0.055, 0.045, 0.07);
  bb.light('port', x + 0.045, y, z + 0.04).light('stbd', x - 0.045, y, z + 0.04);
}
// sidelight on a flank / screen (sd = +1 port, −1 starboard)
function sidelight(bb, x, y, z, sd) { bb.box(SURF.paint, BLACK, x, y, z, 0.05, 0.08, 0.16); bb.box(SURF.lens, sd > 0 ? RED : GREEN, x + sd * 0.03, y, z + 0.02, 0.02, 0.06, 0.12); bb.light(sd > 0 ? 'port' : 'stbd', x + sd * 0.05, y, z + 0.03); }
function allround(bb, x, y0, y1, z, kind = 'allround') { bb.cyl(SURF.steel, SS, [x, y0, z], [x, y1, z], 0.012, 0.012, 6, false); bb.cyl(SURF.lens, WHITE, [x, y1, z], [x, y1 + 0.07, z], 0.03, 0.03, 8); bb.cyl(SURF.paint, BLACK, [x, y1 + 0.07, z], [x, y1 + 0.085, z], 0.035, 0.035, 8); bb.light(kind, x, y1 + 0.035, z); }
function masthead(bb, x, y, z) { bb.box(SURF.paint, BLACK, x, y, z - 0.03, 0.07, 0.09, 0.06); bb.box(SURF.lens, WHITE, x, y, z + 0.01, 0.06, 0.07, 0.04); bb.light('mast', x, y, z + 0.04); }
function sternLight(bb, x, y, z) { bb.box(SURF.paint, BLACK, x, y, z + 0.02, 0.08, 0.05, 0.04); bb.box(SURF.lens, WHITE, x, y, z - 0.01, 0.065, 0.04, 0.025); bb.light('stern', x, y, z - 0.03); }
function cleat(bb, x, y, z, ry = 0) { bb.box(SURF.steel, SS, x, y + 0.03, z, 0.04, 0.05, 0.2, { ry }); bb.box(SURF.steel, SS, x, y + 0.06, z, 0.03, 0.025, 0.26, { ry }); }
function fenders(bb, H, sd, s0, s1, n, col = '#1d2c4a', r = 0.11, len = 0.55) { for (let i = 0; i < n; i++) { const s = lerp(s0, s1, n === 1 ? 0.5 : i / (n - 1)); const x = H.h.xOff + sd * (H.hb(s) + r * 0.8), z = H.z(s), y = H.sheer(s); bb.cyl(SURF.fender, col, [x, y - 0.15 - len, z], [x, y - 0.15, z], r, r, 10); bb.cyl(SURF.fender, '#e9e9e4', [x, y - 0.15, z], [x - sd * 0.1, y + 0.04, z], 0.006, 0.006, 3, false); } }
function antenna(bb, x, y, z, h = 2.4) { bb.cyl(SURF.paint, '#f2f2ee', [x, y, z], [x, y + h, z], 0.018, 0.006, 6); bb.box(SURF.steel, SS, x, y + 0.04, z, 0.05, 0.08, 0.05); }
// a set of windows along one side of a cabin (glass panes let into a face between y0..y1 and z0..z1, at half-width x)

// 58th: side glazing that follows a curved / sloping cabin wall. Each window is split into short segments along the hull, every
// corner put on the wall (xAt(s, y) = the wall's half-width at station s, height y) a hair outside it — flat panes laid as a
// chord across a curved wall sank into it in the middle and showed as black slivers / holes at the ends ("gaps")
function wallWindows(bb, H, sA, sB, y0, y1, sd, surf, n, gapS, xAt, out = 0.014) {
  const w = (sB - sA - gapS * (n - 1)) / n;
  for (let i = 0; i < n; i++) { const a = sA + i * (w + gapS), b = a + w; const m = Math.max(2, Math.ceil(Math.abs(H.z(b) - H.z(a)) / 0.6));
    for (let j = 0; j < m; j++) { const u = a + (b - a) * j / m, v = a + (b - a) * (j + 1) / m;
      const P = [[xAt(u, y0) + out, y0, H.z(u)], [xAt(v, y0) + out, y0, H.z(v)], [xAt(v, y1) + out, y1, H.z(v)], [xAt(u, y1) + out, y1, H.z(u)]];
      P.forEach((p) => (p[0] *= sd)); if (sd > 0) bb.quad(surf, GLASS, ...P); else bb.quad(surf, GLASS, P[1], P[0], P[3], P[2]); } } }

// =====================================================================================================================
const LAYOUTS = {
  // ----------------------------------------------------------------------------------- centre console (and police base)
  cc(d, bb, { police = false } = {}) {
    const L = d.len, B = d.beam; const H = new Hull({ L, B, T: 0.48, Ft: 0.92, Fm: 1.0, Fb: 1.32, dr0: 0.4, dr1: 0.95, tw: 0.86, fine: 1.8, rake: 0.75, flare: 0.1, keelRise: 0.62 });
    H.build(bb, { col: d.col.hull });
    const fy = 0.38; cockpit(bb, H, 0.02, 0.86, fy, { gw: 0.13, floorCol: '#e7e5de', padCol: police ? '#2c3440' : '#e8e2d2' });
    deck(bb, H, 0.86, 1.0, { surf: SURF.nonskid, col: '#ebe9e2', camber: 0.02 });
    // sheer stripe / rub rail
    for (let i = 0; i < 20; i++) { const s0 = lerp(0.0, 0.99, i / 20), s1 = lerp(0.0, 0.99, (i + 1) / 20); for (const sd of [1, -1]) bb.cyl(SURF.rubber, police ? '#1a2a52' : SS, [sd * (H.hb(s0) + 0.015), H.sheer(s0) - 0.03, H.z(s0)], [sd * (H.hb(s1) + 0.015), H.sheer(s1) - 0.03, H.z(s1)], 0.03, 0.03, 5, false); }
    // console (moulded, with windscreen), leaning post, front seat
    const cz = 0.15 * L * 0.12 - 0.1, cw = 1.0, ch = 1.15;
    bb.box(SURF.paint, OFF, 0, fy + ch / 2, cz, cw, ch, 1.05); bb.box(SURF.paint, OFF, 0, fy + ch + 0.08, cz - 0.12, cw - 0.04, 0.16, 0.8, { rx: 0.35 });
    bb.box(SURF.paint, BLACK, 0, fy + ch + 0.12, cz - 0.18, cw - 0.12, 0.02, 0.5, { rx: 0.42 }); // dash panel
    bb.box(SURF.glass, '#1d2830', 0.0, fy + ch + 0.08, cz - 0.24, 0.32, 0.18, 0.012, { rx: 0.42 }); bb.box(SURF.glass, '#1d2830', 0.33, fy + ch + 0.08, cz - 0.24, 0.24, 0.16, 0.012, { rx: 0.42 }); // MFD screens
    const ws = [[0.5, fy + ch + 0.14, cz + 0.3], [-0.5, fy + ch + 0.14, cz + 0.3], [-0.44, fy + ch + 0.46, cz + 0.08], [0.44, fy + ch + 0.46, cz + 0.08]]; bb.quad2(SURF.glass, '#4a5a60', ...ws); bb.tube(SURF.steel, SS, [[0.5, fy + ch + 0.14, cz + 0.32], [0.45, fy + ch + 0.48, cz + 0.08], [-0.45, fy + ch + 0.48, cz + 0.08], [-0.5, fy + ch + 0.14, cz + 0.32]], 0.014); // a short acrylic windscreen on a stainless grab rail
    const wh = wheel(bb, [0, fy + ch + 0.08, cz - 0.6], 0.19, 0.95);
    bb.box(SURF.paint, '#2a2c30', -0.34, fy + ch - 0.02, cz - 0.62, 0.1, 0.12, 0.14); bb.cyl(SURF.steel, SS, [-0.34, fy + ch + 0.04, cz - 0.62], [-0.34, fy + ch + 0.2, cz - 0.56], 0.012, 0.012, 5, false); // throttle box + levers
    seat(bb, 0, fy + 0.62, cz + 0.85, 0.9, 0.55, { back: 0.35, col: police ? '#2f3540' : CREAM, ry: Math.PI }); // seat on the console front
    const lpz = cz - 1.35; bb.box(SURF.paint, OFF, 0, fy + 0.38, lpz, 0.95, 0.76, 0.75); bb.box(SURF.vinyl, police ? '#2f3540' : CREAM, 0, fy + 0.95, lpz - 0.08, 0.9, 0.42, 0.24, { rx: -0.12 }); // leaning post + bolster
    bb.box(SURF.steel, SS, 0, fy + 0.9, lpz + 0.3, 0.95, 0.03, 0.03);
    // T-top on four legs
    const ty = fy + ch + 1.05; canopy(bb, -0.82, 0.82, cz - 1.75, cz + 0.55, fy + 0.02, ty, { col: OFF });
    for (let i = 0; i < 5; i++) bb.cyl(SURF.steel, SS, [-0.6 + i * 0.3, ty + 0.07, cz - 1.6], [-0.6 + i * 0.3, ty + 0.5, cz - 1.75], 0.02, 0.02, 6, false); // rocket launcher rod holders
    // bow: bicolour on the stem, anchor locker + cleats; stern: twin outboards, all-round white on a pole on the T-top
    const bz = H.z(0.985), by = H.sheer(0.985); bicolour(bb, 0, by + 0.07, bz - 0.06);
    rail(bb, H, 0.8, 0.985, { h: 0.55, step: 0.6, mid: false, joinBow: true }); cleat(bb, 0.35, H.sheer(0.86), H.z(0.86)); cleat(bb, -0.35, H.sheer(0.86), H.z(0.86));
    cleat(bb, H.hb(0.04) - 0.1, H.sheer(0.04), H.z(0.04)); cleat(bb, -H.hb(0.04) + 0.1, H.sheer(0.04), H.z(0.04));
    const tz = H.z(0), tyy = H.sheer(0); const eng = [];
    for (const x of [0.42, -0.42]) { outboard(bb, x, tyy - 0.35, tz - 0.02, { size: 1.05, col: police ? '#1b1d21' : '#f0f0ee' }); eng.push([x, tyy - 0.1, tz - 0.45]); }
    bb.box(SURF.paint, OFF, 0, tyy - 0.2, tz + 0.2, B * 0.82, 0.4, 0.35); // transom live-well / bench
    if (!police) allround(bb, 0.0, ty + 0.07, ty + 0.85, cz - 1.55);
    bb.light('deck', 0, ty - 0.05, cz - 0.6, { col: '#ffe2b8', soft: 1 });
    fenders(bb, H, 1, 0.25, 0.65, 3, '#2a3c60'); fenders(bb, H, -1, 0.25, 0.65, 3, '#2a3c60');
    bb.hit(-B / 2, B / 2, -0.5, H.sheer(0.5), H.z(0), H.z(1), 'hull'); bb.hit(-0.5, 0.5, fy, fy + ch + 0.6, cz - 0.6, cz + 0.55, 'cabin'); bb.hit(-0.7, 0.7, tyy - 1.2, tyy + 0.5, tz - 0.8, tz, 'engine');
    const seatSpec = { x: 0, y: fy + 0.92, z: lpz + 0.05, floor: fy, fz: 0.42, fx: 0.15, roof: 9, lean: 0.12, hands: 'wheel', wheel: wh, kind: 'drive', driver: true };
    return { H, seat: seatSpec, crew: [{ x: 0, y: fy + 0.62, z: cz + 0.85, floor: fy, fz: 0.4, fx: 0.14, roof: 9, lean: -0.05, hands: 'lap', kind: 'sit', yaw: 0 }], engines: eng, deckY: fy, tTop: { y: ty, cz }, board: [0, fy, H.z(0.15)] };
  },
  police(d, bb) {
    const R = LAYOUTS.cc(d, bb, { police: true }); const { H } = R; const ty = R.tTop.y, cz = R.tTop.cz;
    // police light bar across the T-top (blue to port, red to starboard), forward-facing work light, radar dome, all-round white
    bb.box(SURF.paint, '#1d1f22', 0, ty + 0.12, cz + 0.25, 1.3, 0.08, 0.3);
    for (let i = 0; i < 4; i++) { const x = 0.55 - i * 0.18; bb.box(SURF.blue, '#2a55ff', x, ty + 0.2, cz + 0.25, 0.16, 0.08, 0.26); bb.light('beaconB', x, ty + 0.22, cz + 0.25, { idx: i }); }
    for (let i = 0; i < 4; i++) { const x = -0.55 + i * 0.18; bb.box(SURF.red, '#ff2a20', x, ty + 0.2, cz + 0.25, 0.16, 0.08, 0.26); bb.light('beaconR', x, ty + 0.22, cz + 0.25, { idx: i }); }
    bb.cyl(SURF.paint, '#f2f2ef', [0, ty + 0.07, cz - 0.9], [0, ty + 0.3, cz - 0.9], 0.27, 0.27, 14); bb.sphere(SURF.paint, '#f2f2ef', [0, ty + 0.3, cz - 0.9], 0.27, 0.35, 12); // radar dome
    allround(bb, -0.6, ty + 0.07, ty + 0.75, cz - 1.5); antenna(bb, 0.65, ty + 0.07, cz - 1.5, 2.6);
    bb.box(SURF.paint, '#1b1d21', 0.0, ty + 0.15, cz + 0.52, 0.2, 0.14, 0.16); bb.box(SURF.lens, '#fff6e4', 0, ty + 0.15, cz + 0.61, 0.16, 0.1, 0.01); // searchlight
    // hull lettering band: the deep blue sheer band + a red pin stripe (the trilingual POLICE lettering is a decal, Boat.js)
    for (const sd of [1, -1]) for (let i = 0; i < 14; i++) { const s0 = lerp(0.12, 0.8, i / 14), s1 = lerp(0.12, 0.8, (i + 1) / 14); const y0 = H.sheer(s0) - 0.32, y1 = H.sheer(s1) - 0.32; bb.quad(SURF.paint, '#c4242a', [sd * (H.beamAt(s0, y0) + 0.004), y0, H.z(s0)], [sd * (H.beamAt(s1, y1) + 0.004), y1, H.z(s1)], [sd * (H.beamAt(s1, y1 + 0.04) + 0.004), y1 + 0.04, H.z(s1)], [sd * (H.beamAt(s0, y0 + 0.04) + 0.004), y0 + 0.04, H.z(s0)]); }
    R.crew = [R.crew[0]]; R.police = true; return R;
  },
  // ----------------------------------------------------------------------------------- bowrider / wake boat
  bowrider(d, bb, { wake = false } = {}) {
    const L = d.len, B = d.beam; const H = new Hull({ L, B, T: 0.42, Ft: 0.82, Fm: 0.9, Fb: 1.05, dr0: wake ? 0.3 : 0.36, dr1: 0.9, tw: 0.9, fine: 1.5, rake: 0.55, flare: 0.12, keelRise: 0.58, maxAt: 0.45 });
    H.build(bb, { col: d.col.hull });
    const fy = 0.32; cockpit(bb, H, 0.1, 0.95, fy, { gw: 0.12, floorSurf: SURF.nonskid, floorCol: '#d9d6cc', padCol: CREAM });
    deck(bb, H, 0.95, 1.0, { surf: SURF.paint, col: OFF, camber: 0.02 }); deck(bb, H, 0.0, 0.1, { surf: SURF.paint, col: OFF });
    // wraparound windscreen at ~s 0.62 with walk-through gap, helm console to starboard, passenger console to port
    const sw = 0.6, wz = H.z(sw), wy = H.sheer(sw), hw = H.hb(sw) - 0.08;
    for (const sd of [1, -1]) { const p0 = [sd * hw, wy + 0.02, wz - 0.25], p1 = [sd * 0.32, wy + 0.02, wz + 0.15], p2 = [sd * 0.32, wy + 0.42, wz - 0.02], p3 = [sd * (hw - 0.05), wy + 0.4, wz - 0.42];
      if (sd > 0) bb.quad(SURF.glass, '#3b4a52', p0, p1, p2, p3); else bb.quad(SURF.glass, '#3b4a52', p1, p0, p3, p2); bb.tube(SURF.steel, SS, [[p3[0], p3[1] + 0.01, p3[2]], [p2[0], p2[1] + 0.01, p2[2]]], 0.012);
      bb.box(SURF.paint, OFF, sd * (hw - 0.28), fy + 0.42, wz - 0.4, 0.62, 0.84, 0.75); }
    const hx = -(hw - 0.3); bb.box(SURF.paint, BLACK, hx, fy + 0.86, wz - 0.55, 0.5, 0.02, 0.32, { rx: 0.5 }); const wh = wheel(bb, [hx, fy + 0.82, wz - 0.95], 0.18, 0.95);
    seat(bb, hx, fy + 0.45, wz - 1.4, 0.55, 0.55, { back: 0.45, col: CREAM }); seat(bb, -hx, fy + 0.45, wz - 1.4, 0.55, 0.55, { back: 0.45, col: CREAM });
    seat(bb, 0, fy + 0.4, H.z(0.14) + 0.35, B - 0.45, 0.6, { back: 0.45, col: CREAM }); // stern bench
    for (const sd of [1, -1]) seat(bb, sd * (H.hb(0.82) - 0.42), fy + 0.4, H.z(0.82), 0.5, 1.3, { back: 0, col: CREAM }); // bow lounges
    if (wake) { // wake tower: two raked legs to a crossbar with speaker pods, all-round white on top; ballast-shaped swim deck
      const tz = H.z(0.42), ty2 = fy + 2.05; for (const sd of [1, -1]) { bb.tube(SURF.alu, '#2b2e33', [[sd * (H.hb(0.4) - 0.12), H.sheer(0.4), tz - 0.3], [sd * 0.75, ty2 - 0.3, tz], [sd * 0.62, ty2, tz + 0.08]], 0.045); bb.box(SURF.paint, '#1d1f22', sd * 0.45, ty2 - 0.12, tz + 0.18, 0.22, 0.24, 0.3); }
      bb.cyl(SURF.alu, '#2b2e33', [0.64, ty2, tz + 0.08], [-0.64, ty2, tz + 0.08], 0.05, 0.05, 8, false); bb.box(SURF.paint, '#26292e', 0, ty2 + 0.05, tz - 0.25, 1.4, 0.06, 0.9); allround(bb, 0, ty2 + 0.08, ty2 + 0.5, tz - 0.55);
      bb.box(SURF.teak, TEAK, 0, H.sheer(0) - 0.45, H.z(0) - 0.45, B * 0.92, 0.07, 0.9); // swim deck
      bb.box(SURF.paint, '#d9d9d6', 0, 0.06, H.z(0.02) + 0.02, 0.12, 0.08, 0.2); // V-drive exhaust
    } else {
      allround(bb, 0, H.sheer(0.03) + 0.02, H.sheer(0.03) + 1.05, H.z(0.03) + 0.15); // fold-down stern pole
      bb.box(SURF.teak, TEAK, 0, H.sheer(0) - 0.5, H.z(0) - 0.3, B * 0.75, 0.06, 0.6); bb.box(SURF.paint, '#2b2d31', 0, -0.05, H.z(0) - 0.25, 0.32, 0.5, 0.38); // swim step + sterndrive leg
      bb.box(SURF.paint, '#2b2d31', 0, -0.42, H.z(0) - 0.38, 0.14, 0.4, 0.26); for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; bb.box(SURF.steel, '#9aa0a5', Math.cos(a) * 0.12, -0.5 + Math.sin(a) * 0.12, H.z(0) - 0.55, 0.08, 0.18, 0.03, { rz: a }); }
    }
    bicolour(bb, 0, H.sheer(0.99) + 0.06, H.z(0.99) - 0.05); rail(bb, H, 0.82, 0.99, { h: 0.35, step: 0.45, mid: false, joinBow: true });
    for (const sd of [1, -1]) { cleat(bb, sd * (H.hb(0.05) - 0.08), H.sheer(0.05), H.z(0.05)); cleat(bb, sd * (H.hb(0.9) - 0.08), H.sheer(0.9), H.z(0.9)); }
    bb.light('courtesy', 0, fy + 0.15, H.z(0.4), { col: '#7fb7ff', soft: 1 });
    fenders(bb, H, 1, 0.3, 0.6, 2); fenders(bb, H, -1, 0.3, 0.6, 2);
    bb.hit(-B / 2, B / 2, -0.45, H.sheer(0.5), H.z(0), H.z(1), 'hull'); bb.hit(-0.5, 0.5, -0.6, 0.6, H.z(0) - 0.7, H.z(0), 'engine');
    return { H, seat: { x: hx, y: fy + 0.5, z: wz - 1.38, floor: fy, fz: 0.45, fx: 0.13, roof: 9, lean: -0.08, hands: 'wheel', wheel: wh, kind: 'drive', driver: true }, crew: [{ x: -hx, y: fy + 0.5, z: wz - 1.38, floor: fy, fz: 0.45, fx: 0.13, roof: 9, lean: -0.1, hands: 'lap', kind: 'sit', yaw: 0 }], engines: [[0, 0.1, H.z(0) - 0.3]], deckY: fy, board: [0, fy, H.z(0.2)] };
  },
  wake(d, bb) { return LAYOUTS.bowrider(d, bb, { wake: true }); },
  // ----------------------------------------------------------------------------------- RIB
  rib(d, bb) {
    const L = d.len, B = d.beam; const tubeR = 0.24; const H = new Hull({ L: L - 0.25, B: B - 2 * tubeR * 1.2, T: 0.4, Ft: 0.42, Fm: 0.45, Fb: 0.6, dr0: 0.4, dr1: 0.95, tw: 0.88, fine: 1.6, rake: 0.4, keelRise: 0.7, flare: 0.05 });
    H.build(bb, { col: d.col.hull }); deck(bb, H, 0.02, 0.98, { surf: SURF.nonskid, col: '#cfd0cc', inset: 0.02, camber: 0.0, drop: 0.12 });
    // the inflatable collar: a tube following the sheer, closing round the bow, ending in cones aft
    const pts = []; for (let i = 0; i <= 22; i++) { const s = lerp(-0.02, 0.97, i / 22); const sc = Math.max(0, s); pts.push([H.hb(sc) + tubeR * 0.75, H.sheer(sc) + 0.05 + 0.18 * Math.pow(Math.max(0, s - 0.6) / 0.4, 2), H.z(sc) + (s < 0 ? s * L : 0)]); }
    for (const sd of [1, -1]) { const P = pts.map(([x, y, z]) => [sd * x, y, z]); for (let i = 0; i < P.length - 1; i++) bb.cyl(SURF.rubber, d.col.tube, P[i], P[i + 1], tubeR, tubeR, 14, false); for (let i = 1; i < P.length - 1; i++) bb.sphere(SURF.rubber, d.col.tube, P[i], tubeR, 1, 12);
      bb.cyl(SURF.rubber, d.col.tube, P[0], [P[0][0], P[0][1], P[0][2] - 0.35], tubeR, tubeR * 0.55, 14); // aft cone
      const rp = P.map(([x, y, z]) => [x * 1.0 + sd * 0.02, y - tubeR * 0.55, z]); bb.tube(SURF.rubber, '#16171a', rp, 0.035, 5); } // rubbing strake
    const nose = pts[pts.length - 1]; bb.cyl(SURF.rubber, d.col.tube, [nose[0], nose[1], nose[2]], [-nose[0], nose[1], nose[2]], tubeR, tubeR, 14, false);
    const fy = H.sheer(0.5) - 0.1; const cz = H.z(0.42);
    bb.box(SURF.paint, OFF, 0, fy + 0.45, cz, 0.6, 0.9, 0.62); bb.box(SURF.glass, '#3a4850', 0, fy + 1.02, cz + 0.12, 0.56, 0.3, 0.012, { rx: -0.4 }); const wh = wheel(bb, [0, fy + 0.88, cz - 0.38], 0.15, 0.9);
    bb.box(SURF.vinyl, '#25282c', 0, fy + 0.55, cz - 0.95, 0.42, 0.25, 0.85); bb.box(SURF.paint, OFF, 0, fy + 0.2, cz - 0.95, 0.4, 0.45, 0.6); // jockey seat
    bb.cyl(SURF.steel, SS, [0, fy + 0.9, cz + 0.3], [0, fy + 1.5, cz + 0.3], 0.012, 0.012, 5, false);
    outboard(bb, 0, H.sheer(0) - 0.3, H.z(0) - 0.02, { size: 0.82, col: '#2b2d31' }); allround(bb, 0.0, H.sheer(0) + 0.05, H.sheer(0) + 1.25, H.z(0.05));
    { const ly = H.sheer(0.95) + tubeR * 2 + 0.16; bicolour(bb, 0, ly, H.z(0.95)); bb.cyl(SURF.steel, SS, [0, H.sheer(0.95), H.z(0.95)], [0, ly - 0.03, H.z(0.95)], 0.012, 0.012, 5, false); } /* staff clears the bow tube, so the bicolour is seen from ahead and abeam */
    bb.hit(-B / 2, B / 2, -0.4, 0.7, H.z(0) - 0.3, H.z(1) + 0.2, 'hull'); bb.hit(-0.4, 0.4, -0.5, 0.9, H.z(0) - 0.6, H.z(0), 'engine');
    return { H, seat: { x: 0, y: fy + 0.66, z: cz - 0.9, floor: fy, fz: 0.42, fx: 0.18, roof: 9, lean: 0.1, hands: 'wheel', wheel: wh, kind: 'ride', ride: true, driver: true, kneeOut: 0.3 }, crew: [], engines: [[0, 0.2, H.z(0) - 0.35]], deckY: fy, board: [0, fy, H.z(0.3)] };
  },
  // ----------------------------------------------------------------------------------- offshore go-fast
  offshore(d, bb) {
    const L = d.len, B = d.beam; const H = new Hull({ L, B, T: 0.55, Ft: 0.78, Fm: 0.85, Fb: 0.92, dr0: 0.42, dr1: 1.0, tw: 0.82, fine: 2.4, rake: 0.9, flare: 0.04, keelRise: 0.62, maxAt: 0.35, forefoot: 0.6 });
    H.build(bb, { col: d.col.hull });
    deck(bb, H, 0.5, 1.0, { surf: SURF.paint, col: d.col.hull, camber: 0.1 }); // long foredeck
    const fy = 0.3; cockpit(bb, H, 0.12, 0.5, fy, { gw: 0.12, floorCol: '#2a2c30', wallCol: '#25272b', capCol: d.col.hull, padCol: '#c9a033' });
    deck(bb, H, 0.0, 0.12, { surf: SURF.paint, col: d.col.hull, camber: 0.04 });
    // tinted canopy over the cockpit front (cuddy): a low blister of glass
    const s0 = 0.4, s1 = 0.62; for (let i = 0; i < 8; i++) { const a = lerp(s0, s1, i / 8), b = lerp(s0, s1, (i + 1) / 8); const ka = Math.sin(((i) / 8) * Math.PI * 0.5 + Math.PI * 0.5), kb = Math.sin(((i + 1) / 8) * Math.PI * 0.5 + Math.PI * 0.5);
      const ya = H.sheer(a) + 0.48 * ka + 0.02, yb = H.sheer(b) + 0.48 * kb + 0.02; const wa = H.hb(a) - 0.15, wb = H.hb(b) - 0.15;
      for (const sd of [1, -1]) { const A = [sd * wa, H.sheer(a), H.z(a)], Bp = [sd * wb, H.sheer(b), H.z(b)], Ct = [sd * wb * 0.55, yb, H.z(b)], Dt = [sd * wa * 0.55, ya, H.z(a)]; bb.quad(SURF.glass, '#0f1418', A, Bp, Ct, Dt); }
      bb.quad(SURF.glass, '#0f1418', [wa * 0.55, ya, H.z(a)], [wb * 0.55, yb, H.z(b)], [-wb * 0.55, yb, H.z(b)], [-wa * 0.55, ya, H.z(a)]); }
    const hz = H.z(0.33); const wh = wheel(bb, [-0.42, fy + 0.95, hz + 0.45], 0.17, 0.75);
    bb.box(SURF.paint, '#26282c', 0, fy + 0.55, hz + 0.75, B - 0.6, 0.5, 0.35); bb.box(SURF.glass, '#18232b', -0.4, fy + 0.82, hz + 0.62, 0.5, 0.18, 0.01, { rx: 0.5 });
    for (const x of [0.42, -0.42]) { bb.box(SURF.vinyl, '#1c1d20', x, fy + 0.45, hz - 0.05, 0.55, 0.6, 0.55); bb.box(SURF.vinyl, '#1c1d20', x, fy + 0.95, hz - 0.3, 0.55, 0.6, 0.18, { rx: -0.15 }); bb.box(SURF.vinyl, d.col.boot, x, fy + 0.95, hz - 0.21, 0.52, 0.04, 0.02); }
    seat(bb, 0, fy + 0.42, H.z(0.15) + 0.2, B - 0.5, 0.55, { back: 0.4, col: '#1c1d20', base: '#26282c' });
    const tz = H.z(0); const eng = []; for (const x of [0.75, 0.25, -0.25, -0.75]) { outboard(bb, x, H.sheer(0) - 0.35, tz - 0.05, { size: 1.12, col: '#141518', trim: '#0d0e10' }); eng.push([x, H.sheer(0) - 0.1, tz - 0.5]); }
    bb.box(SURF.alu, '#2a2d31', 0, H.sheer(0) - 0.4, tz - 0.15, B * 0.86, 0.2, 0.25); // engine bracket
    // the hull's two steps (dark notches across the bottom) and gold sheer stripe come from the hull material bands
    bicolour(bb, 0, H.sheer(0.995) + 0.07, H.z(0.995) - 0.08); allround(bb, 0.0, H.sheer(0.1) + 0.02, H.sheer(0.1) + 0.9, H.z(0.08));
    for (const sd of [1, -1]) { cleat(bb, sd * (H.hb(0.06) - 0.1), H.sheer(0.06), H.z(0.06)); cleat(bb, sd * 0.2, H.sheer(0.9) + 0.05, H.z(0.9)); }
    bb.light('courtesy', 0, fy + 0.12, hz, { col: '#ffb44a', soft: 1 });
    fenders(bb, H, 1, 0.25, 0.6, 3, BLACK); fenders(bb, H, -1, 0.25, 0.6, 3, BLACK);
    bb.hit(-B / 2, B / 2, -0.5, 1.0, H.z(0), H.z(1), 'hull'); bb.hit(-1.0, 1.0, -0.6, 0.8, tz - 0.8, tz, 'engine');
    return { H, seat: { x: -0.42, y: fy + 0.6, z: hz - 0.02, floor: fy, fz: 0.48, fx: 0.13, roof: 9, lean: 0.02, hands: 'wheel', wheel: wh, kind: 'drive', driver: true }, crew: [{ x: 0.42, y: fy + 0.6, z: hz - 0.02, floor: fy, fz: 0.48, fx: 0.13, roof: 9, lean: -0.05, hands: 'lap', kind: 'sit', yaw: 0 }], engines: eng, deckY: fy, board: [0, fy, H.z(0.2)] };
  },
  // ----------------------------------------------------------------------------------- sailing: sloop / daysailer
  sloop(d, bb, { day = false } = {}) {
    const L = d.len, B = d.beam; const H = new Hull({ kind: 'round', L, B, T: day ? 0.42 : 0.62, Ft: day ? 0.62 : 0.95, Fm: day ? 0.68 : 1.05, Fb: day ? 0.85 : 1.28, tw: day ? 0.55 : 0.82, fine: 1.4, rake: day ? 0.7 : 0.18, keelRise: 0.9, maxAt: 0.42, forefoot: 0.45, flare: 0.05, transomRake: day ? -0.35 : 0.0 });
    H.build(bb, { col: d.col.hull, transomCol: day ? null : d.col.hull });
    // fin keel with bulb + spade rudder
    const kd = day ? 1.1 : 2.1; const kz = H.z(0.5); const kt = H.keel(0.5);
    for (const [y0, y1, c0, c1] of [[kt, kt - kd * 0.86, 1.6 * L / 14, 1.0 * L / 14]]) { bb.prism(SURF.hull, d.col.anti, [[0.09, kz - c0 / 2], [-0.09, kz - c0 / 2], [-0.06, kz + c0 / 2], [0.06, kz + c0 / 2]], [[0.07, kz - c1 / 2 - 0.15], [-0.07, kz - c1 / 2 - 0.15], [-0.05, kz + c1 / 2 - 0.15], [0.05, kz + c1 / 2 - 0.15]], y0 + 0.05, y1, { cap: true }); }
    bb.cyl(SURF.paint, '#2a2d33', [0, kt - kd * 0.9, kz - 0.7 * L / 14 - 0.15], [0, kt - kd * 0.9, kz + 0.75 * L / 14 - 0.15], 0.18 * L / 14, 0.12 * L / 14, 10);
    const rz = H.z(0.1); bb.prism(SURF.hull, d.col.anti, [[0.05, rz - 0.25], [-0.05, rz - 0.25], [-0.04, rz + 0.2], [0.04, rz + 0.2]], [[0.03, rz - 0.2], [-0.03, rz - 0.2], [-0.025, rz + 0.12], [0.025, rz + 0.12]], H.keel(0.1) + 0.1, H.keel(0.1) - kd * 0.6, { cap: true });
    deck(bb, H, 0.0, 1.0, { surf: SURF.teak, col: TEAK, camber: 0.06, inset: 0 });
    // toe rail (teak) along the sheer
    for (const sd of [1, -1]) { const P = H.outline(0.0, 1.0, 0.0, 24).map(([x, y, z]) => [sd * x, y + 0.04, z]); bb.tube(SURF.paint, '#7a5536', P, 0.025, 4); }
    // cockpit aft + coachroof (cabin trunk) with ports
    const fy = H.sheer(0.15) - (day ? 0.32 : 0.45); cockpit(bb, H, day ? 0.06 : 0.0, day ? 0.42 : 0.33, fy, { gw: day ? 0.28 : 0.42, floorSurf: SURF.teak, floorCol: TEAK, wallCol: OFF, capSurf: SURF.teak, capCol: TEAK, aftWall: !day });
    const c0 = day ? 0.42 : 0.34, c1 = day ? 0.62 : 0.68; const ch = day ? 0.32 : 0.48; const P0 = planPoly(H, c0, c1, day ? 0.35 : 0.55, 8), P1 = P0.map(([x, z]) => [x * 0.9, z]); const by = H.sheer((c0 + c1) / 2) - 0.02;
    bb.prism(SURF.paint, OFF, P0, P1.map(([x, z]) => [x, z - (z > H.z((c0 + c1) / 2) ? 0.2 : 0)]), by, by + ch, { capSurf: SURF.nonskid, capCol: '#e6e3da' });
    for (const sd of [1, -1]) { const x0 = Math.abs(P0[0][0]) * 0.96, zA = H.z(c0) + 0.4, zB = H.z(c1) - 0.6; void x0; void zA; void zB; const ins = day ? 0.35 : 0.55; wallWindows(bb, H, c0 + 0.4 / (H.z(1) - H.z(0)), c1 - 0.6 / (H.z(1) - H.z(0)), by + ch * 0.35, by + ch * 0.75, sd, day ? SURF.glass : SURF.cabin, day ? 2 : 3, 0.25 / (H.z(1) - H.z(0)), (q, yy) => Math.max(0.05, H.hb(q) - ins) * (1 - 0.1 * (yy - by) / ch)); }
    bb.box(SURF.cabin, GLASS, 0, by + ch * 0.55, H.z(c1) - 0.32, Math.abs(P0[0][0]) * 1.2, ch * 0.4, 0.02, { rx: -0.6 });
    // rig: mast stepped on the coachroof, boom, shrouds, forestay, backstay, spreaders
    const mz = H.z(day ? 0.62 : 0.6), mh = day ? 8.6 : 18.5, my0 = by + ch, mTop = my0 + mh; const boomY = my0 + (day ? 0.85 : 1.35), boomL = day ? 3.0 : 5.6;
    bb.cyl(SURF.alu, '#cfd3d6', [0, my0, mz], [0, mTop, mz], day ? 0.06 : 0.11, day ? 0.045 : 0.075, 10);
    bb.spars = [{ a: [0, boomY, mz - 0.05], b: [0, boomY - 0.05, mz - boomL], r0: day ? 0.045 : 0.075, r1: day ? 0.04 : 0.065 }]; // the boom swings with the mainsail (Boat.js)
    const sp = [[mTop * 0.45 + my0 * 0.55, day ? 0.6 : 1.1], [mTop * 0.72 + my0 * 0.28, day ? 0.4 : 0.75]]; for (const [y, w] of sp) bb.cyl(SURF.alu, '#cfd3d6', [w, y, mz], [-w, y, mz], 0.02, 0.02, 5, false);
    const chainS = (sd) => [sd * (H.hb(0.52) - 0.05), H.sheer(0.52), H.z(0.52)]; const W = 0.007;
    for (const sd of [1, -1]) { const cp = chainS(sd); bb.tube(SURF.steel, '#b9bec2', [cp, [sd * sp[0][1], sp[0][0], mz], [sd * sp[1][1], sp[1][0], mz], [0, mTop - 0.3, mz]], W, 3); bb.cyl(SURF.steel, '#b9bec2', cp, [0, sp[0][0], mz], W, W, 3, false); }
    const stem = [0, H.sheer(1) + 0.05, H.z(1) + (day ? 0.05 : 0.15)]; bb.cyl(SURF.steel, '#b9bec2', stem, [0, mTop - (day ? 0.6 : 0.2), mz], W * 1.2, W * 1.2, 3, false); // forestay
    bb.cyl(SURF.steel, '#b9bec2', [0, H.sheer(0) + 0.05, H.z(0) + 0.1], [0, mTop, mz], W, W, 3, false); // backstay
    // masthead: tricolour + anchor light, windex; steaming light on the mast front, deck light under the spreaders
    bb.box(SURF.paint, BLACK, 0, mTop + 0.05, mz + 0.06, 0.1, 0.08, 0.1); bb.cyl(SURF.lens, '#fff', [0, mTop + 0.09, mz + 0.06], [0, mTop + 0.16, mz + 0.06], 0.035, 0.035, 8);
    bb.light('tri', 0, mTop + 0.12, mz + 0.06); bb.light('anchor', 0, mTop + 0.2, mz + 0.06); bb.cyl(SURF.lens, WHITE, [0, mTop + 0.17, mz + 0.06], [0, mTop + 0.23, mz + 0.06], 0.025, 0.025, 8);
    masthead(bb, 0, my0 + mh * 0.55, mz + (day ? 0.08 : 0.13)); bb.light('deck', 0, sp[0][0] - 0.1, mz + 0.1, { col: '#fff1d6', soft: 1, down: 1 });
    // pulpit (bow rail) with bicolour, pushpit with stern light, lifelines
    rail(bb, H, day ? 0.15 : 0.04, 0.97, { h: day ? 0.45 : 0.62, step: day ? 1.2 : 1.6, joinBow: true });
    bicolour(bb, 0, H.sheer(0.98) + (day ? 0.48 : 0.66), H.z(0.98) - 0.02); if (!day) sternLight(bb, 0, H.sheer(0) + 0.7, H.z(0) + 0.05); else sternLight(bb, 0, H.sheer(0) + 0.08, H.z(0) - 0.02);
    // steering: twin wheels on pedestals (yacht) / tiller (daysailer)
    let wh = null; const helmZ = H.z(day ? 0.12 : 0.06) + (day ? 0 : 0.55);
    if (!day) { for (const sd of [1, -1]) { const x = sd * 0.75; bb.cyl(SURF.steel, SS, [x, fy, helmZ + 0.25], [x, fy + 0.85, helmZ + 0.25], 0.06, 0.05, 8); const w = wheel(bb, [x, fy + 0.95, helmZ + 0.3], 0.42, 1.5); if (sd < 0) wh = w; } bb.box(SURF.teak, TEAK, 0, fy + 0.45, helmZ + 1.5, 0.5, 0.7, 0.4); seat(bb, -0.75, fy + 0.45, helmZ - 0.35, 0.6, 0.45, { back: 0, col: '#d8cdb7', base: TEAK }); }
    else { bb.cyl(SURF.paint, '#7a5536', [0, H.sheer(0) + 0.05, H.z(0) + 0.05], [0, fy + 0.62, helmZ + 1.2], 0.03, 0.025, 6, false); for (const sd of [1, -1]) seat(bb, sd * (H.hb(0.25) - 0.45), fy + 0.4, H.z(0.24), 0.36, 1.6, { back: 0, col: '#d8cdb7', base: TEAK }); }
    if (!day) { bb.box(SURF.teak, TEAK, 0, H.sheer(0) - 0.55, H.z(0) - 0.35, B * 0.6, 0.06, 0.7); } // drop-down swim platform
    for (const sd of [1, -1]) { cleat(bb, sd * (H.hb(0.05) - 0.12), H.sheer(0.05), H.z(0.05)); cleat(bb, sd * (H.hb(0.93) - 0.12), H.sheer(0.93), H.z(0.93)); }
    fenders(bb, H, 1, 0.25, 0.65, day ? 2 : 4, '#f1f1ee', day ? 0.09 : 0.12); fenders(bb, H, -1, 0.25, 0.65, day ? 2 : 4, '#f1f1ee', day ? 0.09 : 0.12);
    // sails: mainsail (luff on the mast, foot on the boom, a slight roach) and the jib on the forestay
    const sails = [
      { id: 'main', tack: [0, boomY + 0.05, mz - 0.08], head: [0, mTop - (day ? 0.25 : 0.6), mz - 0.08], clew: [0, boomY, mz - boomL + 0.2], pivot: [0, 0, mz], roach: 0.06, boom: true },
      { id: 'jib', tack: [0, H.sheer(1) + 0.25, H.z(1) + (day ? 0 : 0.05)], head: [0, mTop - (day ? 1.1 : 2.6), mz + 0.2], clew: [0, by + ch + 0.35, H.z(day ? 0.62 : 0.6) + (day ? 0.2 : 0.5)], pivot: [0, 0, H.z(1)], roach: 0, jib: true },
    ];
    const sk = (day ? 1.7 : 3.2); bb.hit(-B / 2, B / 2, -0.6, H.sheer(0.5) + ch, H.z(0), H.z(1), 'hull'); bb.hit(-0.1, 0.1, my0, mTop, mz - 0.1, mz + 0.1, 'mast'); void sk;
    const seatSpec = day ? { x: H.hb(0.2) - 0.45, y: fy + 0.5, z: H.z(0.2), floor: fy, fz: 0.4, fx: 0.15, roof: 9, lean: -0.1, hands: 'lap', kind: 'sit', yaw: 0 }
      : { x: -0.75, y: fy + 0.55, z: helmZ - 0.3, floor: fy, fz: 0.55, fx: 0.13, roof: 9, lean: 0.05, hands: 'wheel', wheel: wh, kind: 'drive', driver: true };
    return { H, seat: seatSpec, crew: [], engines: [[0, -0.2, H.z(0.08)]], deckY: fy, sails, mast: { z: mz, top: mTop, base: my0 }, board: [0, fy, H.z(0.1)] };
  },
  daysailer(d, bb) { return LAYOUTS.sloop(d, bb, { day: true }); },
  // ----------------------------------------------------------------------------------- sailing catamaran
  cat(d, bb) {
    const L = d.len, B = d.beam; const hb = 1.15; const off = B / 2 - hb / 2 - 0.05; const Hs = [];
    for (const sd of [1, -1]) { const H = new Hull({ kind: 'round', L, B: hb, T: 0.75, Ft: 1.25, Fm: 1.28, Fb: 1.45, tw: 0.78, fine: 1.2, rake: 0.0, keelRise: 1.0, maxAt: 0.45, forefoot: 0.8, flare: 0.0, xOff: sd * off, NS: 32 }); H.build(bb, { col: d.col.hull }); Hs.push(H); deck(bb, H, 0.0, 1.0, { surf: SURF.nonskid, col: '#e8e6df', camber: 0.02 });
      // a long hull window band (owner's hull) and the mini keel
      for (const s2 of [1, -1]) { const x = sd * off + s2 * (hb / 2 - 0.02); const P = [[x, 0.62, H.z(0.3)], [x, 0.62, H.z(0.62)], [x, 0.78, H.z(0.6)], [x, 0.78, H.z(0.32)]]; bb.pane(SURF.cabin, P[0], P[1], P[2], P[3], 0.01, undefined, [sd * off, H.z(0.46)]); }
      bb.prism(SURF.hull, d.col.anti, [[sd * off + 0.05, H.z(0.4)], [sd * off - 0.05, H.z(0.4)], [sd * off - 0.04, H.z(0.62)], [sd * off + 0.04, H.z(0.62)]], [[sd * off + 0.03, H.z(0.45)], [sd * off - 0.03, H.z(0.45)], [sd * off - 0.02, H.z(0.6)], [sd * off + 0.02, H.z(0.6)]], -0.7, -1.25, { cap: true });
      bb.box(SURF.teak, TEAK, sd * off, 0.25, H.z(0) - 0.35, hb * 0.85, 0.06, 0.7); // sugar-scoop steps
      sternLight(bb, sd * off, 1.1, H.z(0) - 0.01); void 0; }
    const H = Hs[0];
    // bridgedeck: cockpit floor + saloon with wraparound windows + coachroof (hard bimini over the cockpit)
    const z0 = H.z(0.05), z1 = H.z(0.62); const by = 1.25; bb.box(SURF.hull, d.col.hull, 0, by - 0.25, (z0 + z1) / 2, B - 1.0, 0.5, z1 - z0); // bridgedeck nacelle
    bb.box(SURF.teak, TEAK, 0, by + 0.02, (z0 + H.z(0.3)) / 2, B - 0.4, 0.04, H.z(0.3) - z0); // teak cockpit floor
    const sP = [[B / 2 - 0.3, H.z(0.3)], [-B / 2 + 0.3, H.z(0.3)], [-B / 2 + 0.35, H.z(0.6)], [-1.0, H.z(0.66)], [1.0, H.z(0.66)], [B / 2 - 0.35, H.z(0.6)]];
    const tP = sP.map(([x, z]) => [x * 0.96, z > H.z(0.5) ? z - 0.45 : z]); bb.prism(SURF.paint, OFF, sP, tP, by, by + 2.05, { capSurf: SURF.paint, capCol: '#ecebe6' });
    for (let i = 0; i < 6; i++) { const a = sP[i], b = sP[(i + 1) % 6]; if (i === 0) continue; const ta = tP[i], tb = tP[(i + 1) % 6]; bb.pane(SURF.cabin, [a[0] * 0.995, by + 0.95, a[1]], [b[0] * 0.995, by + 0.95, b[1]], [lerp(b[0], tb[0], 0.8) * 0.995, by + 1.85, lerp(b[1], tb[1], 0.8)], [lerp(a[0], ta[0], 0.8) * 0.995, by + 1.85, lerp(a[1], ta[1], 0.8)], -0.012); }
    bb.pane(SURF.cabin, [B / 2 - 0.35, by + 0.1, H.z(0.3) + 0.01], [-B / 2 + 0.35, by + 0.1, H.z(0.3) + 0.01], [-B / 2 + 0.4, by + 1.95, H.z(0.3) + 0.01], [B / 2 - 0.4, by + 1.95, H.z(0.3) + 0.01], 0.01); // saloon doors (glass)
    bb.box(SURF.paint, OFF, 0, by + 2.12, (z0 + H.z(0.3)) / 2 - 0.2, B - 0.5, 0.1, H.z(0.3) - z0 + 0.4); for (const sd of [1, -1]) bb.cyl(SURF.steel, SS, [sd * (B / 2 - 0.35), by, z0 + 0.3], [sd * (B / 2 - 0.35), by + 2.08, z0 + 0.3], 0.04, 0.04, 8, false);
    seat(bb, 0, by + 0.42, z0 + 0.45, B - 1.2, 0.55, { back: 0.45, col: '#d9d1bf' }); bb.box(SURF.teak, TEAK, 0, by + 0.42, z0 + 1.6, 1.4, 0.06, 0.8); bb.cyl(SURF.steel, SS, [0, by, z0 + 1.6], [0, by + 0.4, z0 + 1.6], 0.04, 0.04, 8, false);
    // helm station on the starboard bulkhead, raised
    const hx = -(B / 2 - 0.7), hz = H.z(0.3) - 0.45; bb.box(SURF.paint, OFF, hx, by + 0.75, hz + 0.3, 0.7, 1.5, 0.3); const wh = wheel(bb, [hx, by + 1.25, hz + 0.1], 0.36, 1.45); seat(bb, hx, by + 0.75, hz - 0.45, 0.6, 0.45, { back: 0.4, col: '#d9d1bf' });
    // trampoline forward between the hulls, crossbeam + longeron to the bow
    const tz0 = H.z(0.66), tz1 = H.z(0.98); bb.quad2(SURF.vinyl, '#1d2023', [B / 2 - 0.62, 1.2, tz0], [-B / 2 + 0.62, 1.2, tz0], [-B / 2 + 0.62, 1.22, tz1], [B / 2 - 0.62, 1.22, tz1]);
    bb.cyl(SURF.alu, '#cfd3d6', [B / 2 - 0.6, 1.3, tz1], [-B / 2 + 0.6, 1.3, tz1], 0.09, 0.09, 8, false); bb.cyl(SURF.alu, '#cfd3d6', [0, 1.3, tz1], [0, 1.4, tz0], 0.07, 0.07, 6, false);
    // rig: mast on the coachroof, boom, shrouds to the hulls, forestay to the crossbeam, steaming + masthead lights
    const mz = H.z(0.56), my0 = by + 2.05, mTop = my0 + 17.5, boomY = my0 + 0.6, boomL = 5.0;
    bb.cyl(SURF.alu, '#cfd3d6', [0, my0, mz], [0, mTop, mz], 0.12, 0.08, 10); bb.spars = [{ a: [0, boomY, mz - 0.05], b: [0, boomY, mz - boomL], r0: 0.08, r1: 0.07 }];
    for (const sd of [1, -1]) bb.tube(SURF.steel, '#b9bec2', [[sd * off, 1.3, mz - 0.4], [sd * 1.0, my0 + 7, mz], [0, mTop - 0.4, mz]], 0.008, 3); bb.cyl(SURF.alu, '#cfd3d6', [1.05, my0 + 7, mz], [-1.05, my0 + 7, mz], 0.025, 0.025, 5, false);
    bb.cyl(SURF.steel, '#b9bec2', [0, 1.35, tz1], [0, mTop - 0.5, mz], 0.009, 0.009, 3, false);
    bb.box(SURF.paint, BLACK, 0, mTop + 0.05, mz + 0.06, 0.1, 0.08, 0.1); bb.cyl(SURF.lens, '#fff', [0, mTop + 0.09, mz + 0.06], [0, mTop + 0.17, mz + 0.06], 0.035, 0.035, 8); bb.light('tri', 0, mTop + 0.12, mz + 0.06); bb.light('anchor', 0, mTop + 0.22, mz + 0.06);
    masthead(bb, 0, my0 + 9.5, mz + 0.14); bb.light('deck', 0, my0 + 6.8, mz + 0.12, { col: '#fff1d6', soft: 1, down: 1 }); bb.light('deck', 0, by + 2.02, z0 + 1.0, { col: '#ffe0b0', soft: 1 });
    for (const sd of [1, -1]) { sidelight(bb, sd * (off + hb / 2 - 0.08), 1.5, H.z(0.9), sd); rail(bb, Hs[sd > 0 ? 0 : 1], 0.7, 0.97, { h: 0.6, step: 1.2, joinBow: true }); cleat(bb, sd * off, H.sheer(0.97), H.z(0.97)); cleat(bb, sd * off, H.sheer(0.04), H.z(0.04)); }
    for (const Hh of Hs) { fenders(bb, Hh, Math.sign(Hh.h.xOff), 0.2, 0.6, 3, '#f1f1ee', 0.12); }
    const sails = [{ id: 'main', tack: [0, boomY + 0.05, mz - 0.1], head: [0, mTop - 0.5, mz - 0.1], clew: [0, boomY, mz - boomL + 0.2], pivot: [0, 0, mz], roach: 0.1, boom: true },
      { id: 'jib', tack: [0, 1.5, tz1], head: [0, mTop - 2.2, mz + 0.2], clew: [0, by + 2.4, mz + 0.4], pivot: [0, 0, tz1], roach: 0, jib: true }];
    bb.hit(-B / 2, B / 2, -0.75, by + 2.1, H.z(0), H.z(1), 'hull'); bb.hit(-0.12, 0.12, my0, mTop, mz - 0.12, mz + 0.12, 'mast');
    return { H, cat: true, seat: { x: hx, y: by + 0.8, z: hz - 0.42, floor: by, fz: 0.5, fx: 0.13, roof: 9, lean: 0.05, hands: 'wheel', wheel: wh, kind: 'drive', driver: true }, crew: [], engines: [[off, -0.3, H.z(0.1)], [-off, -0.3, H.z(0.1)]], deckY: by, sails, mast: { z: mz, top: mTop, base: my0 }, board: [off, 1.2, H.z(0.05)], halfBeam: B / 2 };
  },
  // ----------------------------------------------------------------------------------- express sport cruiser
  sport(d, bb) {
    const L = d.len, B = d.beam; const H = new Hull({ L, B, T: 0.7, Ft: 1.05, Fm: 1.2, Fb: 1.55, dr0: 0.32, dr1: 0.95, tw: 0.92, fine: 1.9, rake: 1.5, flare: 0.1, keelRise: 0.55, maxAt: 0.4 });
    H.build(bb, { col: d.col.hull });
    const fy = 0.62; deck(bb, H, 0.55, 1.0, { surf: SURF.paint, col: OFF, camber: 0.12 }); cockpit(bb, H, 0.05, 0.55, fy, { gw: 0.18, floorSurf: SURF.teak, floorCol: TEAK, capCol: OFF, padCol: '#e2dccb' });
    bb.box(SURF.teak, TEAK, 0, 0.32, H.z(0) - 0.85, B * 0.95, 0.08, 1.7); bb.box(SURF.paint, OFF, 0, 0.18, H.z(0) - 0.85, B * 0.95, 0.2, 1.68); // hydraulic swim platform
    // hull window strips (dark, the cabin glow at night) and the long sheer band in the boat's accent colour
    for (const sd of [1, -1]) { const y0 = 0.55, y1 = 0.75; const za = H.z(0.56), zb = H.z(0.8); const xa = H.beamAt(0.56, 0.65) + 0.004, xb = H.beamAt(0.8, 0.65) + 0.004; const P = [[sd * xa, y0, za], [sd * xb, y0 + 0.12, zb], [sd * (xb - 0.01), y1 + 0.05, zb], [sd * (xa - 0.01), y1, za]]; if (sd > 0) bb.quad(SURF.cabin, GLASS, ...P); else bb.quad(SURF.cabin, GLASS, P[1], P[0], P[3], P[2]); }
    // swept windscreen (frameless glass) + radar arch over the cockpit, sunpad aft, wet bar, U-shaped lounge, helm to starboard
    const wsS = 0.55, wz = H.z(wsS), wy = H.sheer(wsS); const hw = H.hb(wsS) - 0.12;
    const wsP = [[hw, wy, wz + 0.35], [-hw, wy, wz + 0.35], [-hw * 0.8, wy + 0.62, wz - 0.35], [hw * 0.8, wy + 0.62, wz - 0.35]]; bb.quad(SURF.glass, '#25343c', ...wsP);
    for (const sd of [1, -1]) bb.quad(SURF.glass, '#25343c', [sd * hw, wy, wz + 0.35], [sd * hw, wy, wz - 0.9], [sd * (hw * 0.8), wy + 0.5, wz - 0.9], [sd * hw * 0.8, wy + 0.62, wz - 0.35]);
    const az = H.z(0.27); for (const sd of [1, -1]) { bb.prism(SURF.paint, '#2e3238', [[sd * (H.hb(0.27) - 0.08), az + 0.5], [sd * (H.hb(0.27) - 0.32), az + 0.5], [sd * (H.hb(0.27) - 0.32), az - 0.5], [sd * (H.hb(0.27) - 0.08), az - 0.5]], [[sd * 1.25, az - 0.1], [sd * 1.05, az - 0.1], [sd * 1.05, az - 0.7], [sd * 1.25, az - 0.7]], H.sheer(0.27), fy + 2.35, { cap: false }); }
    bb.box(SURF.paint, '#2e3238', 0, fy + 2.4, az - 0.4, 2.7, 0.12, 0.8); bb.box(SURF.paint, '#2e3238', 0, fy + 2.32, az + 0.4, 2.5, 0.06, 1.4); // arch beam + sunshade
    bb.cyl(SURF.paint, '#f0f0ee', [0, fy + 2.46, az - 0.4], [0, fy + 2.62, az - 0.4], 0.32, 0.32, 14); // radome
    masthead(bb, 0, fy + 2.5, az - 0.02); allround(bb, 0.9, fy + 2.46, fy + 2.85, az - 0.55, 'anchor'); antenna(bb, -0.9, fy + 2.46, az - 0.55, 2.4); sternLight(bb, 0, H.sheer(0) - 0.05, H.z(0) - 0.01);
    for (const sd of [1, -1]) sidelight(bb, sd * (H.hb(0.6) + 0.02), H.sheer(0.6) - 0.1, H.z(0.6), sd);
    for (let i = 0; i < 4; i++) bb.light('deck', -0.8 + i * 0.55, fy + 2.26, az + 0.4, { col: '#ffe1b4', soft: 1, down: 1 });
    const hx = -(hw - 0.42); bb.box(SURF.paint, OFF, hx, fy + 0.5, wz - 0.75, 0.9, 1.0, 0.7); bb.box(SURF.paint, BLACK, hx, fy + 1.02, wz - 0.9, 0.86, 0.02, 0.45, { rx: 0.45 }); bb.box(SURF.glass, '#16212a', hx, fy + 1.06, wz - 0.86, 0.7, 0.2, 0.01, { rx: 0.45 });
    const wh = wheel(bb, [hx, fy + 1.02, wz - 1.25], 0.2, 0.95); seat(bb, hx, fy + 0.5, wz - 1.85, 0.75, 0.6, { back: 0.55, col: '#efe9da' }); seat(bb, -hx, fy + 0.5, wz - 1.85, 0.75, 0.6, { back: 0.55, col: '#efe9da' });
    seat(bb, 0.2, fy + 0.45, H.z(0.2), 1.7, 0.6, { back: 0.5, col: '#efe9da', ry: Math.PI / 2 }); bb.box(SURF.teak, TEAK, -0.6, fy + 0.72, H.z(0.2), 0.7, 0.05, 1.2);
    bb.box(SURF.vinyl, '#efe9da', 0, H.sheer(0.06) + 0.12, H.z(0.06), B - 0.5, 0.18, 1.4); // aft sunpad
    for (let i = 0; i < 6; i++) bb.box(SURF.vinyl, '#efe9da', 0, H.sheer(0.78 + i * 0.02) + 0.1, H.z(0.78 + i * 0.022), 1.6 - i * 0.1, 0.1, 0.36); // foredeck sunpad
    rail(bb, H, 0.65, 0.985, { h: 0.5, step: 1.0, mid: false, joinBow: true }); for (const sd of [1, -1]) { cleat(bb, sd * (H.hb(0.04) - 0.12), H.sheer(0.04), H.z(0.04)); cleat(bb, sd * (H.hb(0.9) - 0.1), H.sheer(0.9), H.z(0.9)); }
    bb.box(SURF.uwl, '#2a3238', 0.6, -0.25, H.z(0) + 0.01, 0.14, 0.1, 0.03); bb.box(SURF.uwl, '#2a3238', -0.6, -0.25, H.z(0) + 0.01, 0.14, 0.1, 0.03); bb.light('uwl', 0, -0.3, H.z(0) - 0.6);
    fenders(bb, H, 1, 0.2, 0.62, 4, '#1d2c4a', 0.13); fenders(bb, H, -1, 0.2, 0.62, 4, '#1d2c4a', 0.13);
    bb.hit(-B / 2, B / 2, -0.6, H.sheer(0.5), H.z(0), H.z(1), 'hull'); bb.hit(-1.3, 1.3, fy, fy + 2.5, az - 0.8, wz + 0.3, 'cabin'); bb.hit(-1.2, 1.2, -0.7, fy, H.z(0), H.z(0.2), 'engine');
    return { H, seat: { x: hx, y: fy + 0.55, z: wz - 1.82, floor: fy, fz: 0.5, fx: 0.14, roof: 9, lean: -0.05, hands: 'wheel', wheel: wh, kind: 'drive', driver: true }, crew: [{ x: -hx, y: fy + 0.55, z: wz - 1.82, floor: fy, fz: 0.5, fx: 0.14, roof: 9, lean: -0.08, hands: 'lap', kind: 'sit', yaw: 0 }], engines: [[0.7, 0.05, H.z(0) - 0.2], [-0.7, 0.05, H.z(0) - 0.2]], deckY: fy, board: [0, 0.4, H.z(0) - 0.7] };
  },
  // ----------------------------------------------------------------------------------- flybridge motor yacht
  fly(d, bb) {
    const L = d.len, B = d.beam; const H = new Hull({ L, B, T: 0.85, Ft: 1.55, Fm: 1.7, Fb: 2.25, dr0: 0.26, dr1: 0.9, tw: 0.94, fine: 1.6, rake: 1.7, flare: 0.1, keelRise: 0.5, maxAt: 0.42 });
    H.build(bb, { col: d.col.hull });
    const fy = 1.3; cockpit(bb, H, 0.02, 0.2, fy, { gw: 0.16, floorSurf: SURF.teak, floorCol: TEAK, foreWall: false });
    deck(bb, H, 0.2, 1.0, { surf: SURF.teak, col: TEAK, camber: 0.05 });
    bb.box(SURF.teak, TEAK, 0, 0.42, H.z(0) - 0.9, B * 0.96, 0.08, 1.8); bb.box(SURF.paint, OFF, 0, 0.28, H.z(0) - 0.9, B * 0.96, 0.2, 1.78); // swim platform
    for (const sd of [1, -1]) { // long hull glazing for the full-beam owner's suite + portholes forward
      wallWindows(bb, H, 0.38, 0.58, 0.85, 1.22, sd, SURF.cabin, 1, 0, (s, y) => H.beamAt(s, y), 0.008);
      for (let k = 0; k < 3; k++) { const s = 0.68 + k * 0.05; bb.cyl(SURF.cabin, GLASS, [sd * (H.beamAt(s, 1.1) - 0.02), 1.1, H.z(s)], [sd * (H.beamAt(s, 1.1) + 0.02), 1.1, H.z(s)], 0.1, 0.1, 10); } }
    // main-deck saloon: wide glass sides, raked windscreen forward, overhang aft over the cockpit
    const s0 = 0.18, s1 = 0.7; const P0 = planPoly(H, s0, s1, 0.32, 8).map(([x, z]) => [x, z]); const top = P0.map(([x, z]) => [x * 0.93, z > H.z(0.55) ? z - (z - H.z(0.55)) * 0.55 : z]);
    const sy = H.sheer(0.4); const sh = 2.05; bb.prism(SURF.paint, OFF, P0, top, sy, sy + sh, { capSurf: SURF.paint, capCol: '#e9e9e5' });
    for (const sd of [1, -1]) wallWindows(bb, H, 0.24, 0.6, sy + 0.62, sy + 1.82, sd, SURF.cabin, 3, 0.012, (s, y) => Math.max(0.05, H.hb(s) - 0.32) * (1 - 0.07 * (y - sy) / sh));
    { const zf = H.z(s1); const xF = H.hb(s1) - 0.32; bb.pane(SURF.cabin, [xF * 0.98, sy + 0.7, zf + 0.01], [-xF * 0.98, sy + 0.7, zf + 0.01], [-xF * 0.6, sy + sh - 0.1, H.z(0.55) + (zf - H.z(0.55)) * 0.45 + 0.02], [xF * 0.6, sy + sh - 0.1, H.z(0.55) + (zf - H.z(0.55)) * 0.45 + 0.02], 0.02); }
    bb.pane(SURF.cabin, [H.hb(0.2) - 0.5, fy + 0.05, H.z(s0) + 0.01], [-(H.hb(0.2) - 0.5), fy + 0.05, H.z(s0) + 0.01], [-(H.hb(0.2) - 0.5), fy + 2.0, H.z(s0) + 0.01], [H.hb(0.2) - 0.5, fy + 2.0, H.z(s0) + 0.01], -0.02); // aft glass doors
    // flybridge: deck on the saloon roof, its helm forward with a low screen, seating, the radar mast; overhang aft on posts
    const fby = sy + sh; const fz0 = H.z(0.05), fz1 = H.z(0.56); bb.box(SURF.paint, OFF, 0, fby + 0.06, (fz0 + fz1) / 2, B - 0.5, 0.12, fz1 - fz0); bb.box(SURF.teak, TEAK, 0, fby + 0.13, (fz0 + fz1) / 2, B - 0.7, 0.02, fz1 - fz0 - 0.2);
    for (const sd of [1, -1]) { bb.cyl(SURF.steel, SS, [sd * (B / 2 - 0.4), fy, fz0 + 0.25], [sd * (B / 2 - 0.4), fby, fz0 + 0.25], 0.05, 0.05, 8, false); bb.box(SURF.paint, OFF, sd * (B / 2 - 0.26), fby + 0.5, (fz0 + fz1) / 2 + 0.6, 0.06, 0.8, fz1 - fz0 - 2.2); }
    bb.box(SURF.paint, OFF, 0, fby + 0.55, fz1 - 0.45, B - 0.7, 0.9, 0.5); bb.box(SURF.glass, '#2a3840', 0, fby + 1.15, fz1 - 0.35, B - 0.9, 0.35, 0.012, { rx: -0.5 });
    const hx = -0.85; bb.box(SURF.paint, BLACK, hx, fby + 1.0, fz1 - 0.72, 1.1, 0.02, 0.4, { rx: 0.4 }); const wh = wheel(bb, [hx, fby + 0.98, fz1 - 1.05], 0.22, 1.0);
    seat(bb, hx, fby + 0.62, fz1 - 1.65, 0.65, 0.6, { back: 0.6, col: CREAM }); seat(bb, 0.0, fby + 0.62, fz1 - 1.65, 0.65, 0.6, { back: 0.6, col: CREAM }); seat(bb, 0.7, fby + 0.55, H.z(0.28), 1.8, 0.6, { back: 0.5, col: CREAM, ry: -Math.PI / 2 });
    bb.box(SURF.teak, TEAK, -0.4, fby + 0.75, H.z(0.28), 0.9, 0.05, 1.3); bb.box(SURF.vinyl, CREAM, 0, fby + 0.4, H.z(0.12), B - 1.0, 0.18, 1.6);
    rail(bb, { h: { xOff: 0, L }, hb: (s) => (B / 2 - 0.3), sheer: () => fby + 0.12, z: (s) => lerp(fz0 + 0.3, fz1 - 0.2, (s - 0.05) / 0.51) }, 0.05, 0.56, { h: 0.85, step: 1.2, inset: 0 });
    const mz = H.z(0.42); bb.prism(SURF.paint, '#e6e6e2', [[0.35, mz - 0.4], [-0.35, mz - 0.4], [-0.25, mz + 0.4], [0.25, mz + 0.4]], [[0.25, mz - 0.6], [-0.25, mz - 0.6], [-0.18, mz - 0.1], [0.18, mz - 0.1]], fby + 0.13, fby + 1.9);
    bb.box(SURF.paint, BLACK, 0, fby + 1.95, mz - 0.35, 1.9, 0.12, 0.25); bb.cyl(SURF.paint, '#f0f0ee', [0.45, fby + 1.9, mz + 0.2], [0.45, fby + 2.08, mz + 0.2], 0.3, 0.3, 14);
    masthead(bb, 0, fby + 1.72, mz - 0.03); allround(bb, -0.45, fby + 1.92, fby + 2.35, mz - 0.1, 'anchor'); antenna(bb, 0.75, fby + 1.9, mz - 0.4, 3.0); antenna(bb, -0.75, fby + 1.9, mz - 0.4, 3.0);
    for (const sd of [1, -1]) sidelight(bb, sd * (H.hb(0.66) - 0.3), sy + 1.4, H.z(0.66), sd); sternLight(bb, 0, H.sheer(0) - 0.1, H.z(0) - 0.01);
    for (let i = 0; i < 3; i++) for (const sd of [1, -1]) bb.light('deck', sd * 1.4, fby - 0.08, H.z(0.03) + 0.6 + i * 1.0, { col: '#ffe1b4', soft: 1, down: 1 });
    bb.light('deck', 0, fby + 1.65, H.z(0.3), { col: '#ffe1b4', soft: 1, down: 1 });
    rail(bb, H, 0.45, 0.985, { h: 0.75, step: 1.3, joinBow: true }); for (const sd of [1, -1]) { cleat(bb, sd * (H.hb(0.04) - 0.14), H.sheer(0.04), H.z(0.04)); cleat(bb, sd * (H.hb(0.88) - 0.14), H.sheer(0.88), H.z(0.88)); cleat(bb, sd * (H.hb(0.45) - 0.14), H.sheer(0.45), H.z(0.45)); }
    bb.box(SURF.steel, SS, 0, H.sheer(1) + 0.02, H.z(1) + 0.1, 0.24, 0.12, 0.7); // anchor roller + anchor
    for (const x of [0.9, 0, -0.9]) { bb.box(SURF.uwl, '#2a3238', x, -0.35, H.z(0) + 0.01, 0.16, 0.1, 0.03); } bb.light('uwl', 0, -0.4, H.z(0) - 0.8);
    fenders(bb, H, 1, 0.2, 0.62, 4, '#1d2c4a', 0.16, 0.75); fenders(bb, H, -1, 0.2, 0.62, 4, '#1d2c4a', 0.16, 0.75);
    bb.hit(-B / 2, B / 2, -0.8, H.sheer(0.5), H.z(0), H.z(1), 'hull'); bb.hit(-B / 2 + 0.3, B / 2 - 0.3, sy, fby + 2, H.z(0.05), H.z(0.7), 'cabin'); bb.hit(-1.5, 1.5, -0.8, fy, H.z(0), H.z(0.25), 'engine');
    return { H, seat: { x: hx, y: fby + 0.67, z: fz1 - 1.62, floor: fby + 0.13, fz: 0.5, fx: 0.14, roof: 9, lean: -0.05, hands: 'wheel', wheel: wh, kind: 'drive', driver: true }, crew: [{ x: 0, y: fby + 0.67, z: fz1 - 1.62, floor: fby + 0.13, fz: 0.5, fx: 0.14, roof: 9, lean: -0.08, hands: 'lap', kind: 'sit', yaw: 0 }], engines: [[1.0, 0.05, H.z(0) - 0.2], [-1.0, 0.05, H.z(0) - 0.2]], deckY: fy, board: [0, 0.5, H.z(0) - 0.8] };
  },
  // ----------------------------------------------------------------------------------- superyacht
  super(d, bb) {
    const L = d.len, B = d.beam; const H = new Hull({ kind: 'round', L, B, T: 2.1, Ft: 2.1, Fm: 2.35, Fb: 3.2, tw: 0.9, fine: 1.35, rake: 0.25, keelRise: 0.62, maxAt: 0.45, forefoot: 0.72, flare: 0.07, transomRake: 0.0, NS: 48 });
    H.build(bb, { col: d.col.hull, transomCol: d.col.hull });
    const md = H.sheer(0.4) - 0.05; deck(bb, H, 0.06, 1.0, { surf: SURF.teak, col: TEAK, camber: 0.08 });
    // beach club at the stern: a low aft deck at water level, transom doors to the garage
    bb.box(SURF.teak, TEAK, 0, 0.62, H.z(0) - 1.3, B * 0.86, 0.1, 2.6); bb.box(SURF.paint, d.col.hull, 0, 0.32, H.z(0) - 1.3, B * 0.86, 0.5, 2.58);
    for (const sd of [1, -1]) bb.box(SURF.steel, SS, sd * 1.8, 1.1, H.z(0) - 0.05, 0.8, 1.0, 0.03); bb.pane(SURF.cabin, [1.3, 0.75, H.z(0) - 0.02], [-1.3, 0.75, H.z(0) - 0.02], [-1.3, 1.85, H.z(0) - 0.02], [1.3, 1.85, H.z(0) - 0.02], -0.02);
    for (let k = 0; k < 4; k++) bb.box(SURF.teak, TEAK, 0, 0.75 + k * 0.33, H.z(0) - 0.1 + k * 0.32, 2.2, 0.06, 0.32); // steps up to the main deck
    // hull ports + the boot stripe from the material, a white sheer band
    for (const sd of [1, -1]) for (let k = 0; k < 9; k++) { const s = 0.2 + k * 0.065; const w = k % 3 === 2 ? 0.0 : 1; if (!w) continue; const y = 1.25; const ds = 0.6 / (H.z(1) - H.z(0)); wallWindows(bb, H, s - ds, s + ds, y - 0.18, y + 0.18, sd, SURF.cabin, 1, 0, (q, yy) => H.beamAt(q, yy), 0.006); }
    // three decks of superstructure stepping back, each with long dark window bands (lit warm at night) and white bulwarks
    const levels = [{ s0: 0.12, s1: 0.78, inset: 0.55, h: 2.55, win: [0.75, 2.2] }, { s0: 0.24, s1: 0.7, inset: 0.75, h: 2.45, win: [0.8, 2.15] }, { s0: 0.38, s1: 0.64, inset: 1.1, h: 2.35, win: [0.65, 2.05] }];
    let y = md; const tops = [];
    for (let li = 0; li < levels.length; li++) { const lv = levels[li]; const P = planPoly(H, lv.s0, lv.s1, lv.inset, 10); const zF = H.z(lv.s1), zM = H.z(lv.s1 - 0.08);
      const T = P.map(([x, z]) => [x * 0.985, z > zM ? zM + (z - zM) * 0.25 : z]); bb.prism(SURF.paint, '#f3f3f1', P, T, y, y + lv.h, { capSurf: SURF.paint, capCol: '#ebebe8' });
      for (const sd of [1, -1]) { const yb = y, hh = lv.h; wallWindows(bb, H, lv.s0 + 0.02, lv.s1 - 0.1, y + lv.win[0], y + lv.win[1], sd, SURF.cabin, li === 2 ? 2 : 4, 0.3 / (H.z(1) - H.z(0)), (q, yy) => Math.max(0.05, H.hb(q) - lv.inset) * (1 - 0.015 * (yy - yb) / hh)); }
      const xf = H.hb(lv.s1) - lv.inset; bb.pane(SURF.cabin, [xf * 0.9, y + lv.win[0], zF - 0.02], [-xf * 0.9, y + lv.win[0], zF - 0.02], [-xf * 0.85, y + lv.win[1], zM + (zF - zM) * 0.35], [xf * 0.85, y + lv.win[1], zM + (zF - zM) * 0.35], 0.03);
      // aft deck overhang above (the next deck reaches aft over this one's terrace) on slim posts
      bb.box(SURF.paint, '#f3f3f1', 0, y + lv.h - 0.08, H.z(lv.s0) - 1.4, (H.hb(lv.s0) - lv.inset) * 2, 0.16, 2.8); for (const sd of [1, -1]) bb.cyl(SURF.steel, SS, [sd * (H.hb(lv.s0) - lv.inset - 0.2), y, H.z(lv.s0) - 2.6], [sd * (H.hb(lv.s0) - lv.inset - 0.2), y + lv.h - 0.15, H.z(lv.s0) - 2.6], 0.06, 0.06, 8, false);
      for (let k = 0; k < 4; k++) bb.light('deck', (k - 1.5) * 1.3, y + lv.h - 0.18, H.z(lv.s0) - 1.4, { col: '#ffe1b4', soft: 1, down: 1 });
      tops.push(y + lv.h); y += lv.h; }
    // bridge wings at the third level with the sidelights on their screens; the main bulwark rail around the deck
    const bz = H.z(0.62), bY = md + levels[0].h + levels[1].h; for (const sd of [1, -1]) { bb.box(SURF.paint, '#f3f3f1', sd * (B / 2 - 0.35), bY + 0.55, bz, 0.7, 1.1, 1.2); sidelight(bb, sd * (B / 2 - 0.02), bY + 0.85, bz + 0.3, sd); }
    for (const sd of [1, -1]) { const P = H.outline(0.06, 0.99, 0.0, 30).map(([x, yy, z]) => [sd * x, yy, z]); for (let i = 0; i < P.length - 1; i++) bb.quad(SURF.paint, '#f3f3f1', [P[i][0], P[i][1], P[i][2]], [P[i + 1][0], P[i + 1][1], P[i + 1][2]], [P[i + 1][0] * 0.995, P[i + 1][1] + 0.95, P[i + 1][2]], [P[i][0] * 0.995, P[i][1] + 0.95, P[i][2]]); bb.tube(SURF.teak, TEAK, P.map(([x, yy, z]) => [x * 0.99, yy + 0.98, z]), 0.05, 4); }
    // sun deck: the mast with radar arrays, domes, masthead + anchor lights; spa pool, loungers, hard top
    const sd0 = tops[2]; const mz = H.z(0.52); bb.prism(SURF.paint, '#f3f3f1', [[0.6, mz - 1.0], [-0.6, mz - 1.0], [-0.4, mz + 0.8], [0.4, mz + 0.8]], [[0.4, mz - 1.3], [-0.4, mz - 1.3], [-0.25, mz], [0.25, mz]], sd0, sd0 + 3.2);
    bb.box(SURF.paint, '#2c3038', 0, sd0 + 3.3, mz - 0.6, 2.6, 0.14, 0.3); for (const sd of [1, -1]) bb.cyl(SURF.paint, '#f0f0ee', [sd * 1.0, sd0 + 3.2, mz - 1.5], [sd * 1.0, sd0 + 3.5, mz - 1.5], 0.45, 0.45, 14);
    bb.cyl(SURF.steel, SS, [0, sd0 + 3.2, mz - 0.05], [0, sd0 + 3.86, mz - 0.05], 0.025, 0.025, 6, false); masthead(bb, 0, sd0 + 3.9, mz + 0.0); /* aft masthead light, the higher one (vessel >= 50 m: two, the aft >= 4.5 m above the forward) */
    { const fz = H.z(0.672), fy2 = tops[1]; bb.cyl(SURF.paint, '#f3f3f1', [0, fy2, fz], [0, fy2 + 0.85, fz], 0.06, 0.05, 8, false); masthead(bb, 0, fy2 + 0.9, fz + 0.04); } allround(bb, 0, sd0 + 3.37, sd0 + 3.9, mz - 0.6, 'anchor'); antenna(bb, 0.8, sd0 + 3.37, mz - 0.7, 2.6); antenna(bb, -0.8, sd0 + 3.37, mz - 0.7, 2.6);
    bb.box(SURF.paint, '#f3f3f1', 0, sd0 + 2.7, H.z(0.42), 4.6, 0.14, 5.0); for (const sd of [1, -1]) for (const zz of [H.z(0.36), H.z(0.48)]) bb.cyl(SURF.steel, SS, [sd * 2.1, sd0, zz], [sd * 2.1, sd0 + 2.65, zz], 0.06, 0.06, 8, false);
    bb.box(SURF.paint, '#58a3b9', 0, sd0 + 0.38, H.z(0.6), 2.6, 0.04, 1.8); bb.box(SURF.paint, '#f3f3f1', 0, sd0 + 0.2, H.z(0.6), 2.8, 0.4, 2.0); // spa pool
    for (let k = 0; k < 4; k++) bb.box(SURF.vinyl, '#efe9da', (k - 1.5) * 0.9, sd0 + 0.3, H.z(0.4) - 1.2, 0.7, 0.18, 1.9);
    for (let k = 0; k < 4; k++) bb.light('deck', (k - 1.5) * 1.1, sd0 + 2.6, H.z(0.42), { col: '#ffe1b4', soft: 1, down: 1 });
    sternLight(bb, 0, md + 1.02, H.z(0.06) - 0.1); /* on the aft bulwark capping, over the beach club */ bb.light('deck', 0, 2.4, H.z(0) - 1.2, { col: '#ffe1b4', soft: 1, down: 1 });
    for (const sd of [1, -1]) for (let k = 0; k < 3; k++) { bb.box(SURF.uwl, '#2a3238', sd * (0.8 + k * 0.9), -0.45, H.z(0) + 0.02, 0.18, 0.12, 0.03); }
    bb.light('uwl', 1.6, -0.5, H.z(0) - 1.2); bb.light('uwl', -1.6, -0.5, H.z(0) - 1.2); bb.light('uwl', 0, -0.5, H.z(0.03) - 1.6);
    bb.box(SURF.steel, SS, 0, H.sheer(1) + 0.05, H.z(1) - 0.4, 0.5, 0.25, 1.4); for (const sd of [1, -1]) { cleat(bb, sd * (H.hb(0.95) - 0.25), H.sheer(0.95), H.z(0.95)); cleat(bb, sd * (H.hb(0.08) - 0.25), H.sheer(0.08), H.z(0.08)); bb.cyl(SURF.steel, SS, [sd * 0.4, H.sheer(0.97), H.z(0.97)], [sd * 0.4, H.sheer(0.97) + 0.3, H.z(0.97)], 0.12, 0.12, 10); }
    fenders(bb, H, 1, 0.2, 0.7, 6, '#1d2a3c', 0.25, 1.1); fenders(bb, H, -1, 0.2, 0.7, 6, '#1d2a3c', 0.25, 1.1);
    const hz = H.z(0.6), hy = bY; const wh = wheel(bb, [0, hy + 1.05, hz - 0.2], 0.25, 1.1); bb.box(SURF.paint, BLACK, 0, hy + 0.9, hz + 0.1, 2.2, 0.06, 0.5, { rx: 0.35 }); seat(bb, 0, hy + 0.65, hz - 0.85, 0.65, 0.6, { back: 0.7, col: '#2a2d33', base: '#1d1f22' });
    bb.hit(-B / 2, B / 2, -2.1, md, H.z(0), H.z(1), 'hull'); bb.hit(-B / 2 + 0.5, B / 2 - 0.5, md, tops[2] + 3.4, H.z(0.12), H.z(0.78), 'cabin');
    return { H, seat: { x: 0, y: hy + 0.7, z: hz - 0.82, floor: hy, fz: 0.5, fx: 0.14, roof: 9, lean: -0.05, hands: 'wheel', wheel: wh, kind: 'drive', driver: true }, crew: [], engines: [[1.4, 0.4, H.z(0.04)], [-1.4, 0.4, H.z(0.04)]], deckY: md, board: [0, 0.7, H.z(0) - 1.6], halfBeam: B / 2 };
  },
  // ----------------------------------------------------------------------------------- Sri Lankan FRP day boat
  frp(d, bb) {
    const L = d.len, B = d.beam; const H = new Hull({ L, B, T: 0.3, Ft: 0.55, Fm: 0.6, Fb: 1.15, dr0: 0.25, dr1: 0.85, chine: 0.82, tw: 0.62, fine: 1.4, rake: 0.65, flare: 0.22, keelRise: 0.72, maxAt: 0.42 });
    H.build(bb, { col: d.col.hull });
    const fy = 0.12; cockpit(bb, H, 0.03, 0.88, fy, { gw: 0.05, floorSurf: SURF.paint, floorCol: '#d8d2c0', wallCol: d.col.inner, capSurf: SURF.paint, capCol: d.col.sheer });
    deck(bb, H, 0.88, 1.0, { surf: SURF.paint, col: d.col.inner, camber: 0.0 }); deck(bb, H, 0.0, 0.03, { surf: SURF.paint, col: d.col.inner });
    for (const s of [0.18, 0.42, 0.66]) { const hw = H.hb(s) - 0.05; bb.box(SURF.paint, '#9a6a43', 0, H.sheer(s) - 0.2, H.z(s), hw * 2, 0.05, 0.28); } // timber thwarts
    for (const sd of [1, -1]) { const P = H.outline(0.0, 0.99, -0.02, 18).map(([x, y, z]) => [sd * x, y - 0.06, z]); bb.tube(SURF.paint, '#c23a2a', P, 0.022, 4); } // red rubbing strake
    outboard(bb, 0, H.sheer(0) - 0.22, H.z(0) - 0.01, { size: 0.55, col: '#1d4f9c', trim: '#2b2d31' }); bb.box(SURF.paint, '#d4c9a8', 0.3, fy + 0.18, H.z(0.12), 0.3, 0.34, 0.4); // fuel can
    bb.box(SURF.paint, '#c9b9a0', 0, fy + 0.15, H.z(0.5), 0.6, 0.2, 1.2); // folded net
    allround(bb, 0.0, H.sheer(0.92), H.sheer(0.92) + 1.4, H.z(0.92), 'allround'); bb.cyl(SURF.paint, '#1e1e1e', [0.0, H.sheer(0.92) + 1.4, H.z(0.92)], [0.0, H.sheer(0.92) + 2.0, H.z(0.92)], 0.008, 0.008, 4, false); bb.box(SURF.vinyl, '#d23a2a', 0.18, H.sheer(0.92) + 1.85, H.z(0.92), 0.36, 0.22, 0.01); // flag pole + red flag
    bicolour(bb, 0, H.sheer(0.96) + 0.2, H.z(0.96)); bb.cyl(SURF.steel, SS, [0, H.sheer(0.96), H.z(0.96)], [0, H.sheer(0.96) + 0.17, H.z(0.96)], 0.01, 0.01, 5, false); /* on a bracket over the stem head */
    bb.hit(-B / 2, B / 2, -0.3, H.sheer(0.5), H.z(0), H.z(1), 'hull'); bb.hit(-0.3, 0.3, -0.4, 0.5, H.z(0) - 0.5, H.z(0), 'engine');
    return { H, seat: { x: 0.2, y: fy + 0.4, z: H.z(0.09), floor: fy, fz: 0.35, fx: 0.15, roof: 9, lean: 0, hands: 'tiller', kind: 'sit', driver: true, tiller: [0, H.sheer(0) + 0.05, H.z(0) + 0.45] }, crew: [{ x: 0, y: H.sheer(0.42) - 0.16, z: H.z(0.42), floor: fy, fz: 0.35, fx: 0.15, roof: 9, lean: 0, hands: 'lap', kind: 'sit', yaw: 0 }], engines: [[0, 0.1, H.z(0) - 0.25]], deckY: fy, board: [0, fy, H.z(0.3)] };
  },
  // ----------------------------------------------------------------------------------- oruwa outrigger canoe
  oruwa(d, bb) {
    const L = d.len, B = d.beam; const H = new Hull({ kind: 'round', L, B, T: 0.32, Ft: 0.55, Fm: 0.5, Fb: 0.72, tw: 0.12, fine: 1.2, rake: 0.5, keelRise: 1.15, maxAt: 0.5, forefoot: 0.7, flare: 0.25, transomRake: -0.4, NS: 30 });
    H.build(bb, { col: d.col.hull });
    for (const sd of [1, -1]) { const P = H.outline(0.04, 0.96, 0.0, 20); for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; const A = [sd * a[0], a[1], a[2]], Bq = [sd * b[0], b[1], b[2]]; bb.quad2(SURF.paint, d.col.sheer, A, Bq, [Bq[0] * 1.05, Bq[1] + 0.28, Bq[2]], [A[0] * 1.05, A[1] + 0.28, A[2]]); // sewn washstrake
      bb.cyl(SURF.paint, '#2d2117', [A[0] * 1.06, A[1] + 0.29, A[2]], [Bq[0] * 1.06, Bq[1] + 0.29, Bq[2]], 0.015, 0.015, 4, false); } }
    // outrigger: two curved booms to a log float on the port side
    const fx = 3.4; for (const s of [0.36, 0.62]) { const z = H.z(s), y = H.sheer(s) + 0.3; bb.tube(SURF.paint, '#7b5a3c', [[-0.3, y, z], [0.5, y + 0.15, z], [fx * 0.6, y + 0.1, z], [fx, 0.25, z]], 0.05, 5); bb.cyl(SURF.paint, '#6a4c33', [fx, 0.25, z], [fx, 0.0, z], 0.04, 0.04, 5, false); }
    bb.cyl(SURF.paint, '#4a3626', [fx, 0.0, H.z(0.2)], [fx, 0.0, H.z(0.78)], 0.17, 0.17, 10); bb.cyl(SURF.paint, '#4a3626', [fx, 0.0, H.z(0.78)], [fx, 0.12, H.z(0.86)], 0.17, 0.05, 10); bb.cyl(SURF.paint, '#4a3626', [fx, 0.0, H.z(0.2)], [fx, 0.1, H.z(0.12)], 0.17, 0.05, 10);
    // mast + yard: a tall rectangular cotton sail
    const mz = H.z(0.56), mTop = 6.8; bb.cyl(SURF.paint, '#6d5137', [0, 0.1, mz], [0, mTop, mz], 0.07, 0.05, 8); bb.spars = [{ a: [0, mTop - 0.2, mz + 1.9], b: [0, mTop - 0.45, mz - 1.9], r0: 0.04, r1: 0.04, wood: true }, { a: [0, 0.95, mz + 1.6], b: [0, 0.85, mz - 1.8], r0: 0.035, r1: 0.035, wood: true }]; // yards turn with the sail
    bb.cyl(SURF.paint, '#c9b892', [0, mTop - 0.1, mz], [0, H.sheer(0.95) + 0.25, H.z(0.95)], 0.006, 0.006, 3, false); bb.cyl(SURF.paint, '#c9b892', [0, mTop - 0.1, mz], [fx * 0.8, 0.5, H.z(0.5)], 0.006, 0.006, 3, false);
    bb.light('allround', 0, mTop - 0.6, mz + 0.06); bb.box(SURF.lens, '#ffe7b0', 0, mTop - 0.6, mz + 0.08, 0.08, 0.12, 0.06); // a hurricane lamp hung on the mast
    const sails = [{ id: 'main', tack: [0, 0.95, mz + 1.6], head: [0, mTop - 0.22, mz + 1.85], headL: [0, mTop - 0.22, mz + 1.85], headR: [0, mTop - 0.45, mz - 1.85], clew: [0, 0.85, mz - 1.75], pivot: [0, 0, mz], roach: 0, square: true, col: '#e7dcc4' }];
    bb.hit(-0.45, 0.45, -0.32, 0.85, H.z(0), H.z(1), 'hull'); bb.hit(-0.1, 0.1, 0, mTop, mz - 0.1, mz + 0.1, 'mast');
    return { H, seat: { x: 0, y: H.sheer(0.12) + 0.05, z: H.z(0.12), floor: H.sheer(0.12) - 0.2, fz: 0.25, fx: 0.12, roof: 9, lean: 0, hands: 'lap', kind: 'sit', driver: true }, crew: [], engines: [], deckY: 0.15, sails, mast: { z: mz, top: mTop, base: 0.1 }, board: [0, 0.3, H.z(0.3)], halfBeam: 0.6 };
  },
  // ----------------------------------------------------------------------------------- cabin cruiser (hardtop walkaround)
  cruiser(d, bb) {
    const L = d.len, B = d.beam; const H = new Hull({ L, B, T: 0.55, Ft: 1.0, Fm: 1.1, Fb: 1.45, dr0: 0.36, dr1: 0.92, tw: 0.9, fine: 1.7, rake: 0.85, flare: 0.1, keelRise: 0.6 });
    H.build(bb, { col: d.col.hull });
    const fy = 0.42; cockpit(bb, H, 0.02, 0.5, fy, { gw: 0.16, floorCol: '#e3e1d9', padCol: '#e5ddca' }); deck(bb, H, 0.5, 1.0, { surf: SURF.nonskid, col: '#e8e6df', camber: 0.05 });
    // cabin trunk forward with hull windows; hardtop over the helm on a windscreen frame + aft posts
    const P = planPoly(H, 0.5, 0.86, 0.38, 8); const by = H.sheer(0.62) - 0.02; bb.prism(SURF.paint, OFF, P, P.map(([x, z]) => [x * 0.88, z > H.z(0.75) ? z - 0.35 : z]), by, by + 0.5, { capSurf: SURF.nonskid, capCol: '#e6e3da' });
    for (const sd of [1, -1]) { const y0 = 0.68, y1 = 0.84; const P2 = [[sd * (H.beamAt(0.6, 0.76) + 0.004), y0, H.z(0.6)], [sd * (H.beamAt(0.78, 0.76) + 0.004), y0 + 0.05, H.z(0.78)], [sd * (H.beamAt(0.78, 0.9) + 0.003), y1 + 0.05, H.z(0.78)], [sd * (H.beamAt(0.6, 0.9) + 0.003), y1, H.z(0.6)]]; if (sd > 0) bb.quad(SURF.cabin, GLASS, ...P2); else bb.quad(SURF.cabin, GLASS, P2[1], P2[0], P2[3], P2[2]); }
    const wz = H.z(0.5), ty = fy + 2.0; for (const sd of [1, -1]) { bb.quad(SURF.glass, '#2c3a42', [sd * (H.hb(0.5) - 0.18), H.sheer(0.5), wz], [sd * 0.05, H.sheer(0.5) + 0.05, wz + 0.15], [sd * 0.05, ty - 0.05, wz - 0.45], [sd * (H.hb(0.45) - 0.22), ty - 0.05, wz - 0.6]); bb.cyl(SURF.steel, SS, [sd * (H.hb(0.5) - 0.18), H.sheer(0.5), wz], [sd * (H.hb(0.45) - 0.22), ty, wz - 0.6], 0.035, 0.035, 6, false); bb.cyl(SURF.steel, SS, [sd * (H.hb(0.3) - 0.2), fy, H.z(0.3)], [sd * (H.hb(0.3) - 0.2), ty, H.z(0.3)], 0.035, 0.035, 6, false); }
    bb.box(SURF.paint, OFF, 0, ty + 0.04, (wz - 0.5 + H.z(0.28)) / 2, B - 0.35, 0.09, wz - 0.5 - H.z(0.28)); bb.box(SURF.glass, '#2a3a44', 0, ty + 0.1, wz - 0.85, 0.9, 0.01, 0.5); // hardtop + skylight
    masthead(bb, 0, ty + 0.2, wz - 0.55); bb.box(SURF.paint, BLACK, 0, ty + 0.14, wz - 0.6, 0.12, 0.12, 0.1); sternLight(bb, 0, ty - 0.03, H.z(0.28) - 0.04); /* under the hardtop's aft edge: clear over the outboards */ antenna(bb, -0.9, ty + 0.09, H.z(0.3) + 0.2, 2.4);
    for (const sd of [1, -1]) sidelight(bb, sd * (H.hb(0.47) - 0.18), H.sheer(0.47) + 0.08, H.z(0.47), sd);
    const hx = -0.55; bb.box(SURF.paint, OFF, hx, fy + 0.5, wz - 0.65, 0.8, 1.0, 0.6); bb.box(SURF.paint, BLACK, hx, fy + 1.02, wz - 0.78, 0.76, 0.02, 0.36, { rx: 0.45 }); const wh = wheel(bb, [hx, fy + 1.0, wz - 1.12], 0.19, 0.95);
    seat(bb, hx, fy + 0.5, wz - 1.65, 0.65, 0.55, { back: 0.5, col: '#ece4d0' }); seat(bb, -hx, fy + 0.5, wz - 1.65, 0.65, 0.55, { back: 0.5, col: '#ece4d0' }); seat(bb, 0, fy + 0.42, H.z(0.06) + 0.35, B - 0.5, 0.55, { back: 0.45, col: '#ece4d0' });
    const eng = []; for (const x of [0.38, -0.38]) { outboard(bb, x, H.sheer(0) - 0.32, H.z(0) - 0.45, { size: 1.0, col: '#f0f0ee' }); eng.push([x, H.sheer(0) - 0.1, H.z(0) - 0.9]); } bb.box(SURF.paint, OFF, 0, H.sheer(0) - 0.45, H.z(0) - 0.3, B * 0.7, 0.3, 0.6); // bracket
    for (let i = 0; i < 2; i++) bb.light('deck', -0.4 + i * 0.8, ty - 0.02, wz - 1.3, { col: '#ffe1b4', soft: 1, down: 1 });
    rail(bb, H, 0.55, 0.985, { h: 0.6, step: 0.9, joinBow: true }); allround(bb, 0.6, ty + 0.09, ty + 0.55, H.z(0.3) + 0.2, 'anchor');
    for (const sd of [1, -1]) { cleat(bb, sd * (H.hb(0.04) - 0.12), H.sheer(0.04), H.z(0.04)); cleat(bb, sd * (H.hb(0.9) - 0.12), H.sheer(0.9), H.z(0.9)); }
    fenders(bb, H, 1, 0.2, 0.62, 3); fenders(bb, H, -1, 0.2, 0.62, 3);
    bb.hit(-B / 2, B / 2, -0.55, H.sheer(0.5), H.z(0), H.z(1), 'hull'); bb.hit(-B / 2 + 0.2, B / 2 - 0.2, fy, ty, H.z(0.3), H.z(0.86), 'cabin'); bb.hit(-0.8, 0.8, -0.6, 0.9, H.z(0) - 1.2, H.z(0), 'engine');
    return { H, seat: { x: hx, y: fy + 0.55, z: wz - 1.62, floor: fy, fz: 0.48, fx: 0.14, roof: ty - fy, lean: -0.06, hands: 'wheel', wheel: wh, kind: 'drive', driver: true }, crew: [{ x: -hx, y: fy + 0.55, z: wz - 1.62, floor: fy, fz: 0.48, fx: 0.14, roof: ty - fy, lean: -0.08, hands: 'lap', kind: 'sit', yaw: 0 }], engines: eng, deckY: fy, board: [0, fy, H.z(0.15)] };
  },
  // ----------------------------------------------------------------------------------- sport-fishing convertible
  sportfish(d, bb) {
    const L = d.len, B = d.beam; const H = new Hull({ L, B, T: 0.75, Ft: 1.05, Fm: 1.25, Fb: 1.85, dr0: 0.24, dr1: 0.9, tw: 0.95, fine: 1.6, rake: 1.2, flare: 0.16, keelRise: 0.55, maxAt: 0.4, tumble: 0.03 });
    H.build(bb, { col: d.col.hull });
    const fy = 0.55; cockpit(bb, H, 0.0, 0.32, fy, { gw: 0.15, floorSurf: SURF.teak, floorCol: TEAK, capSurf: SURF.teak, capCol: TEAK, foreWall: false }); deck(bb, H, 0.32, 1.0, { surf: SURF.nonskid, col: '#e8e6df', camber: 0.07 });
    const P = planPoly(H, 0.32, 0.74, 0.22, 8); const sy = H.sheer(0.45) - 0.02; const sh = 1.95; bb.prism(SURF.paint, OFF, P, P.map(([x, z]) => [x * 0.94, z > H.z(0.62) ? z - (z - H.z(0.62)) * 0.6 : z]), sy, sy + sh, { capSurf: SURF.paint, capCol: '#ebebe7' });
    for (const sd of [1, -1]) wallWindows(bb, H, 0.36, 0.62, sy + 0.95, sy + 1.6, sd, SURF.cabin, 2, 0.2 / (H.z(1) - H.z(0)), (q, yy) => Math.max(0.05, H.hb(q) - 0.22) * (1 - 0.06 * (yy - sy) / sh));
    { const zf = H.z(0.74), zm = H.z(0.62) + (zf - H.z(0.62)) * 0.4, xF = H.hb(0.74) - 0.22; bb.pane(SURF.cabin, [xF, sy + 1.0, zf], [-xF, sy + 1.0, zf], [-xF * 0.8, sy + 1.75, zm], [xF * 0.8, sy + 1.75, zm], 0.02); }
    bb.pane(SURF.cabin, [B / 2 - 0.55, fy + 0.05, H.z(0.32) + 0.01], [-(B / 2 - 0.55), fy + 0.05, H.z(0.32) + 0.01], [-(B / 2 - 0.55), fy + 1.85, H.z(0.32) + 0.01], [B / 2 - 0.55, fy + 1.85, H.z(0.32) + 0.01], -0.02);
    // flybridge + tuna tower + outriggers
    const fby = sy + sh; const z0 = H.z(0.3), z1 = H.z(0.62); bb.box(SURF.paint, OFF, 0, fby + 0.45, z1 - 0.3, B - 0.6, 0.9, 0.5); const hx = 0; const wh = wheel(bb, [hx, fby + 0.95, z1 - 0.85], 0.2, 0.95);
    seat(bb, -0.7, fby + 0.55, z1 - 1.45, 0.6, 0.6, { back: 0.5, col: CREAM }); seat(bb, 0, fby + 0.55, z1 - 1.45, 0.6, 0.6, { back: 0.5, col: CREAM }); seat(bb, 0.7, fby + 0.55, z1 - 1.45, 0.6, 0.6, { back: 0.5, col: CREAM });
    bb.box(SURF.paint, OFF, 0, fby + 0.05, (z0 + z1) / 2, B - 0.4, 0.1, z1 - z0);
    const towerTop = fby + 3.2; for (const sx of [1, -1]) for (const zz of [z0 + 0.4, z1 - 0.2]) bb.cyl(SURF.alu, '#cfd3d6', [sx * 1.15, fby + 0.1, zz], [sx * 0.7, towerTop, zz + (zz > (z0 + z1) / 2 ? -0.3 : 0.3)], 0.035, 0.035, 6, false);
    bb.box(SURF.paint, OFF, 0, towerTop + 0.05, (z0 + z1) / 2, 1.5, 0.08, z1 - z0 - 0.6); rail(bb, { h: { xOff: 0, L }, hb: () => 0.72, sheer: () => towerTop + 0.08, z: (s) => lerp(z0 + 0.6, z1 - 0.5, s) }, 0, 1, { h: 0.7, step: 0.8, inset: 0 });
    for (const sd of [1, -1]) bb.cyl(SURF.alu, '#cfd3d6', [sd * (B / 2 - 0.2), H.sheer(0.4) + 0.1, H.z(0.4)], [sd * 4.2, towerTop + 2.5, H.z(0.2)], 0.03, 0.012, 6, false); // outriggers (spread)
    masthead(bb, 0, towerTop + 0.2, z1 - 0.45); allround(bb, 0, towerTop + 0.09, towerTop + 0.85, (z0 + z1) / 2 - 0.4, 'anchor'); sternLight(bb, 0, H.sheer(0) - 0.08, H.z(0) - 0.01);
    for (const sd of [1, -1]) sidelight(bb, sd * (H.hb(0.6) - 0.22), sy + 1.0, H.z(0.6), sd);
    bb.cyl(SURF.steel, SS, [0, fy, H.z(0.15)], [0, fy + 0.45, H.z(0.15)], 0.08, 0.06, 10); bb.box(SURF.vinyl, '#ece4d0', 0, fy + 0.55, H.z(0.15), 0.6, 0.12, 0.6); bb.box(SURF.vinyl, '#ece4d0', 0, fy + 0.85, H.z(0.15) - 0.28, 0.6, 0.5, 0.1); // fighting chair
    for (let i = 0; i < 2; i++) bb.light('deck', -0.5 + i, fby - 0.06, H.z(0.12), { col: '#fff3dc', soft: 1, down: 1 });
    rail(bb, H, 0.65, 0.985, { h: 0.65, step: 1.1, joinBow: true }); bb.box(SURF.steel, SS, 0, H.sheer(1) + 0.03, H.z(1) + 0.05, 0.2, 0.1, 0.6);
    for (const sd of [1, -1]) { cleat(bb, sd * (H.hb(0.03) - 0.12), H.sheer(0.03), H.z(0.03)); cleat(bb, sd * (H.hb(0.9) - 0.12), H.sheer(0.9), H.z(0.9)); }
    fenders(bb, H, 1, 0.2, 0.6, 3, '#13304f', 0.14, 0.65); fenders(bb, H, -1, 0.2, 0.6, 3, '#13304f', 0.14, 0.65);
    bb.hit(-B / 2, B / 2, -0.75, H.sheer(0.5), H.z(0), H.z(1), 'hull'); bb.hit(-B / 2 + 0.2, B / 2 - 0.2, sy, fby + 1.2, H.z(0.3), H.z(0.74), 'cabin'); bb.hit(-1.2, 1.2, -0.7, fy, H.z(0), H.z(0.25), 'engine');
    return { H, seat: { x: hx, y: fby + 0.6, z: z1 - 1.42, floor: fby + 0.1, fz: 0.5, fx: 0.14, roof: 9, lean: -0.05, hands: 'wheel', wheel: wh, kind: 'drive', driver: true }, crew: [{ x: -0.7, y: fby + 0.6, z: z1 - 1.42, floor: fby + 0.1, fz: 0.5, fx: 0.14, roof: 9, lean: -0.08, hands: 'lap', kind: 'sit', yaw: 0 }], engines: [[0.8, 0.05, H.z(0) - 0.2], [-0.8, 0.05, H.z(0) - 0.2]], deckY: fy, board: [0, fy, H.z(0.12)] };
  },
  // ----------------------------------------------------------------------------------- personal watercraft
  jetski(d, bb) {
    const L = d.len, B = d.beam, v = d.ski | 0; const c = d.col;
    const H = new Hull({ L, B, T: 0.28, Ft: 0.32, Fm: 0.36, Fb: 0.55, dr0: v === 2 ? 0.38 : 0.3, dr1: 0.9, chine: 0.78, tw: 0.82, fine: 1.4, rake: 0.55, flare: 0.25, keelRise: 0.6, maxAt: 0.45, NS: 30 });
    H.build(bb, { col: c.hull });
    // the deck moulding: footwells either side of a raised spine, a hood + handlebar pod forward, the seat on the spine
    const fw = 0.12; deck(bb, H, 0.0, 0.2, { surf: SURF.paint, col: c.deck, camber: 0.02 });
    for (let i = 0; i < 12; i++) { const a = lerp(0.04, 0.62, i / 12), b = lerp(0.04, 0.62, (i + 1) / 12); for (const sd of [1, -1]) bb.quad(SURF.nonskid, '#2a2c30', [sd * (H.hb(a) - 0.04), H.sheer(a) - fw, H.z(a)], [sd * 0.22, H.sheer(a) - fw, H.z(a)], [sd * 0.22, H.sheer(b) - fw, H.z(b)], [sd * (H.hb(b) - 0.04), H.sheer(b) - fw, H.z(b)]); }
    const spineP = []; for (let i = 0; i <= 10; i++) { const s = lerp(0.04, 0.66, i / 10); spineP.push([0.24, s]); } const sb = spineP.map(([x, s]) => [x, H.z(s)]); const spine = [...sb, ...sb.slice().reverse().map(([x, z]) => [-x, z])];
    bb.prism(SURF.paint, c.deck, spine, spine.map(([x, z]) => [x * 0.86, z]), H.sheer(0.3) - fw - 0.02, H.sheer(0.3) + 0.12, {});
    const s0 = v === 3 ? 0.1 : 0.16, s1 = 0.6; const seatH = H.sheer(0.4) + 0.22 + (v === 2 ? 0.04 : 0); { const zl = H.z(s1) - H.z(s0), zc = (H.z(s0) + H.z(s1)) / 2; const m = new THREE.Matrix4().compose(new THREE.Vector3(0, seatH - 0.04, zc), new THREE.Quaternion(), new THREE.Vector3(0.46, 0.2, zl / 2)); bb.geom(SURF.vinyl, c.seat, SADDLE, m); // one padded saddle
      const m2 = new THREE.Matrix4().compose(new THREE.Vector3(0, seatH - 0.1, zc), new THREE.Quaternion(), new THREE.Vector3(0.5, 0.12, zl / 2 + 0.03)); bb.geom(SURF.paint, c.trim, SADDLE, m2); } // its moulded base
    if (v === 3) { bb.box(SURF.vinyl, c.seat, 0, seatH + 0.2, H.z(0.12), 0.42, 0.3, 0.1, { rx: -0.2 }); bb.box(SURF.teak, TEAK, 0, H.sheer(0) - 0.05, H.z(0) - 0.18, B * 0.8, 0.04, 0.36); } // touring backrest + platform
    const hoodS0 = 0.62; const hP = planPoly(H, hoodS0, 0.97, 0.08, 8); bb.prism(SURF.paint, c.deck, hP, hP.map(([x, z]) => [x * 0.72, z - 0.05]), H.sheer(0.75) - 0.06, H.sheer(0.75) + 0.2, {});
    const podZ = H.z(0.63), podY = seatH + 0.28; bb.box(SURF.paint, c.trim, 0, podY - 0.1, podZ, 0.42, 0.22, 0.32, { rx: -0.3 }); bb.box(SURF.glass, '#1a2128', 0, podY + 0.03, podZ + 0.08, 0.3, 0.12, 0.01, { rx: -0.6 });
    const bars = [[0.32, podY + 0.04, podZ - 0.05], [-0.32, podY + 0.04, podZ - 0.05]]; bb.cyl(SURF.steel, '#2a2c30', bars[0], bars[1], 0.016, 0.016, 6, false); for (const b of bars) bb.cyl(SURF.rubber, '#141516', [b[0] * 0.8, b[1], b[2]], [b[0] * 1.05, b[1], b[2]], 0.02, 0.02, 8, false);
    bb.box(SURF.paint, c.trim, 0, H.sheer(0.02) - 0.02, H.z(0) - 0.06, 0.5, 0.12, 0.14); bb.box(SURF.paint, '#2a2c30', 0, -0.06, H.z(0) - 0.12, 0.2, 0.16, 0.24); // tow hook / jet nozzle
    for (const sd of [1, -1]) { bb.box(SURF.paint, c.trim, sd * (H.hb(0.4) + 0.01), H.sheer(0.4) - 0.08, H.z(0.4), 0.03, 0.04, L * 0.5); bb.box(SURF.paint, c.trim, sd * (H.hb(0.1) + 0.02), 0.02, H.z(0.08), 0.05, 0.03, 0.3); } // rub rails + sponsons
    if (v === 2) { for (const sd of [1, -1]) bb.box(SURF.paint, c.deck, sd * 0.38, H.sheer(0.52) + 0.04, H.z(0.52), 0.06, 0.1, 0.4); } // knee pockets
    // a PWC's legal lights at night: the all-round white is not fitted to most; sidelights in the hood flanks + a stern light
    for (const sd of [1, -1]) { const s = 0.8; bb.box(SURF.lens, sd > 0 ? RED : GREEN, sd * (H.hb(s) * 0.82), H.sheer(s) + 0.05, H.z(s), 0.02, 0.025, 0.07); bb.light(sd > 0 ? 'port' : 'stbd', sd * (H.hb(s) * 0.82 + 0.02), H.sheer(s) + 0.05, H.z(s)); }
    bb.box(SURF.lens, WHITE, 0, H.sheer(0.02) + 0.07, H.z(0) - 0.12, 0.08, 0.025, 0.02); bb.light('stern', 0, H.sheer(0.02) + 0.07, H.z(0) - 0.14);
    bb.hit(-B / 2, B / 2, -0.3, seatH + 0.3, H.z(0), H.z(1), 'hull');
    return { H, ski: true, seat: { x: 0, y: seatH + 0.05, z: H.z(0.42), floor: H.sheer(0.42) - fw, fz: 0.18, fx: 0.32, roof: 9, lean: 0.32, hands: 'bars', bars, kind: 'ride', driver: true, ride: true, kneeOut: 0.45 }, crew: [], engines: [[0, -0.05, H.z(0) - 0.15]], deckY: H.sheer(0.3) - fw, board: [0, H.sheer(0.1), H.z(0.1)] };
  },
};

// =====================================================================================================================
const CACHE = new Map();
export function boatModel(id) {
  let m = CACHE.get(id); if (m) return m; const d = BOATS[id]; if (!d) throw new Error('boat type: ' + id);
  const bb = new BoatBuilder(); const R = LAYOUTS[d.layout](d, bb); const H = R.H; const geo = bb.build();
  let sparGeo = null; if (bb.spars && R.sails) { const sb = new BoatBuilder(); const pv = R.sails[0].pivot; for (const sp of bb.spars) { const a = [sp.a[0] - pv[0], sp.a[1] - pv[1], sp.a[2] - pv[2]], b = [sp.b[0] - pv[0], sp.b[1] - pv[1], sp.b[2] - pv[2]]; sb.cyl(sp.wood ? SURF.paint : SURF.alu, sp.wood ? '#6d5137' : '#cfd3d6', a, b, sp.r0, sp.r1, 8); } sparGeo = sb.build(); } // in the main sail's pivot frame
  const bbx = geo.boundingBox; const len = d.len, beam = d.beam;
  m = { id, def: d, geo, sparGeo, H, seat: R.seat, crew: R.crew || [], lights: bb.lights, boxes: bb.boxes, sails: R.sails || [], mast: R.mast || null, engines: R.engines || [], deckY: R.deckY, board: R.board,
    len, beam, halfBeam: R.halfBeam || beam / 2, draft: -bbx.min.y, height: bbx.max.y, bow: [0, H.sheer(1), H.z(1)], stern: [0, H.sheer(0), H.z(0)], cat: !!R.cat, ski: !!R.ski, police: !!R.police,
    tris: (geo.index ? geo.index.count : geo.attributes.position.count) / 3 };
  CACHE.set(id, m); return m;
}
export function sailGeometry(s, NI = 10, NJ = 14) { // a sail as a cloth grid in its own frame: origin at the tack, the plane x = 0
  const t = new THREE.Vector3(...s.tack), hL = new THREE.Vector3(...(s.headL || s.head)), hR = new THREE.Vector3(...(s.headR || s.head)), c = new THREE.Vector3(...s.clew); const pos = [], uv = [], idx = [];
  for (let j = 0; j <= NJ; j++) { const v = j / NJ; const L = t.clone().lerp(hL, v), R = c.clone().lerp(hR, v); for (let i = 0; i <= NI; i++) { const u = i / NI; const p = L.clone().lerp(R, u); if (s.roach && i === NI) { p.z -= s.roach * Math.sin(v * Math.PI) * c.distanceTo(t); } else if (s.roach) p.z -= s.roach * Math.sin(v * Math.PI) * c.distanceTo(t) * Math.pow(u, 3); pos.push(0, p.y - t.y, p.z - t.z); uv.push(u, v); } }
  for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) { const a = j * (NI + 1) + i, b = a + NI + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
export const BOAT_LAYOUTS = Object.keys(LAYOUTS);
// POLICE lettering strip conforming to both topsides (one mesh: uv.x along the strip, the far side mirrored so it reads)
export function policeDecalGeometry(M, s0 = 0.3, s1 = 0.68, yTop = 0.4, h = 0.3) {
  const H = M.H, N = 12, pos = [], uv = [], idx = [];
  for (const sd of [1, -1]) { const base = pos.length / 3;
    for (let i = 0; i <= N; i++) { const t = i / N, s = lerp(s0, s1, t); const yt = H.sheer(s) - yTop, yb = yt - h; for (const [y, v] of [[yb, 0], [yt, 1]]) { pos.push(sd * (H.beamAt(s, y) + 0.012), y, H.z(s)); uv.push(sd > 0 ? 1 - t : t, v); } }
    for (let i = 0; i < N; i++) { const a = base + i * 2; if (sd > 0) idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); else idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
void C;
