// Fort Harbour Marina — a pontoon marina in the east end of Colombo harbour (x 140‥230, north of the container quay and clear
// of the cranes and the two moored container ships further west). Built once at load: merged geometry (a few draw calls),
// walkable 'deck' colliders (Collision.js), the berths (finger berths both sides of a spine, two alongside the east wall, the
// player's long alongside berth on the T-head), the marina office, and the routes boats use to leave / come in.
//
//   east sidewalk (x 230+) ── gangway (down to the pontoons) ── head walkway (E–W) ── spine (N–S) ── T-head (the player's berth)
//                                                         fingers west (boats ≤ 11.5 m) │ fingers east (≤ 14 m)
// The pontoons float: deck 0.5 m above the harbour plane, a dark float under it, steel guide piles through them.
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { HARBOUR_Y } from './BoatWater.js';

export const MARINA = {
  name: 'Fort Harbour Marina',
  deckY: HARBOUR_Y + 0.52,                    // pontoon walking surface
  quayY: 0.17,                                 // the quay top (LAND_Y 0.15) the gangway starts from
  gang: { x0: 221, x1: 230.4, z0: -1200.75, z1: -1198.25 },
  head: { x0: 150, x1: 221, z0: -1201, z1: -1198 },
  spine: { x0: 183.5, x1: 186.5, z0: -1285, z1: -1201 },
  tee: { x0: 168, x1: 212, z0: -1288, z1: -1285 },
  office: { x0: 205, x1: 211, z0: -1197.6, z1: -1193.6, counter: { x: 208, z: -1199.4 } },
  berthPrice: 3500000,
  slipName: 'Berth T-1',
  // where an owned boat is delivered / switched in: alongside the north face of the T-head, bow east
  slip: (len, halfBeam) => ({ x: 190, z: -1288 - 0.75 - halfBeam, yaw: Math.PI / 2, side: 'tee' }),
  terminal: { x: 172.5, z: -1286.5 },        // the berth's service pedestal (switch / bring back your boat)
  saleSign: { x: 190, z: -1285.9 },          // 58th: the For Sale board on the T-head (the berth is bought in person, here or at the office)
  gangTop: { x: 232.5, z: -1199.5 },           // on the sidewalk at the head of the gangway
};
const FINGERS = 7, PITCH = 11;
const fingerZ = (k) => MARINA.head.z0 - PITCH * k; // k = 1..7
// finger berths: west side bow east (toward the spine), east side bow west
export function marinaBerths() {
  const out = [];
  for (let k = 1; k <= FINGERS; k++) {
    // 58th: the slot centre (routes, crew) and where a boat actually lies — alongside finger k, her hull ~0.55 m off the float
    // (fenders out, lines on its cleats) so she can be stepped onto / off from the finger, not floating mid-slot
    const zc = (fingerZ(k - 1) + fingerZ(k)) / 2; const zf = fingerZ(k); const zAt = (hb) => zf + 0.6 + 0.55 + hb;
    out.push({ id: `W${k}`, side: 'W', zc, zAt, maxLen: 11.5, yaw: Math.PI / 2, x: (len) => MARINA.spine.x0 - 0.8 - len / 2, walk: [MARINA.spine.x0 - 4, zf] });
    out.push({ id: `E${k}`, side: 'E', zc, zAt, maxLen: 14, yaw: -Math.PI / 2, x: (len) => MARINA.spine.x1 + 0.8 + len / 2, walk: [MARINA.spine.x1 + 4, zf] });
  }
  // alongside the east harbour wall (big motor yachts), bow north (out toward the T-head); 20 m+ between them so the inner one can swing out
  out.push({ id: 'Q1', side: 'Q', zc: -1220, zAt: () => -1220, maxLen: 24, yaw: Math.PI, x: (len, hb) => 230 - 0.7 - hb, walk: null });
  out.push({ id: 'Q2', side: 'Q', zc: -1263, zAt: () => -1263, maxLen: 18, yaw: Math.PI, x: (len, hb) => 230 - 0.7 - hb, walk: null });
  return out;
}
// the way out of a berth (and, reversed, in): boat-space-free world points; `rev` = go astern on that leg
export function berthRoute(b, len, hb = null) {
  const bx = b.x(len, 1.5), z = b.zc; const zl = hb !== null && b.zAt ? b.zAt(hb) : z; // 58th: she lies alongside the finger — back straight out along that line (any swing puts her bow into the finger), then ease over
  // astern until the bow is clear of the finger ends (W fingers end at x 172, E at 200.5), then out along the fairway
  const zr = Math.min(z, MARINA.head.z0 - len / 2 - 1.5); // the inner berths: astern a little north too, so a long boat can swing clear of the head walkway
  if (b.side === 'W') return [{ x: 172 - len / 2 - 0.5, z: zl, rev: true, r: 1.2, line: null }, { x: 172 - len / 2 - 2.5, z: zr, rev: true }, { x: 162, z: z - 4 }, { x: 160, z: -1296 }, { x: 150, z: -1330 }, { x: 40, z: -1420 }];
  if (b.side === 'E') return [{ x: 200.5 + len / 2 + 0.5, z: zl, rev: true, r: 1.2, line: null }, { x: 200.5 + len / 2 + 2.5, z: zr, rev: true }, { x: 215, z: zr - 5 }, { x: 218, z: Math.min(zr - 10, -1282), r: 3 }, { x: 218, z: -1296 }, { x: 205, z: -1330 }, { x: 120, z: -1430 }];
  // alongside the wall: straight ahead first (any swing puts the stern into the wall), then ease off it
  return [{ x: b.x(len, 1.5) + 0.7, z: z - len * 0.4, v: 1.2 }, { x: bx - 4, z: z - len * 0.5 - 12 }, { x: 217, z: z - len * 0.5 - 22 }, { x: 218, z: -1296 }, { x: 200, z: -1330 }, { x: 110, z: -1430 }];
}
// the owner's walk from the head of the gangway to a finger berth (and back)
export function walkRoute(b) {
  const g = MARINA.gang, s = MARINA.spine, h = MARINA.head; const gy = (g.z0 + g.z1) / 2; const sx = (s.x0 + s.x1) / 2;
  return [[MARINA.gangTop.x, MARINA.gangTop.z], [g.x0 - 0.5, gy], [sx, (h.z0 + h.z1) / 2], [sx, b.walk[1]], b.walk]; // down the spine, then out along her finger
}

export function buildMarina(scene, collision) {
  const M = MARINA, PT = M.deckY; const deck = new MeshBuilder(), metal = new MeshBuilder(), paint = new MeshBuilder();
  const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
  const DECK = C('#8f8476'), DECK2 = C('#7f7468'), FLOAT = C('#3a3f44'), RUB = C('#2d2a27'), PILE = C('#55595e'), WHITE = C('#e9e9e6'), ALU = C('#a9adb1');
  const colliders = []; const lamps = [];
  // a floating pontoon (58th rebuild, after real concrete marina pontoons): a light broom-finished concrete deck with a smooth
  // trowelled margin, module joints with galvanised cover plates, the concrete float hull standing ~0.5 m out of the water
  // (weed / tide stain at the waterline), hardwood walers bolted along every edge and a black rubber D-fender on them;
  // walkable collider on its top (and solid down to the float bottom for swimmers, see Swim.js)
  const CONC = C('#b7b3a9'), MARGIN = C('#c8c4ba'), JOINT = C('#5a5852'), HULL = C('#9c998f'), WEED = C('#4c5440'), WALER = C('#5a4331'), WALER2 = C('#4a3727'), PLATE = C('#8e9397'), BOLT = C('#6f7377');
  const WL = HARBOUR_Y; // waterline
  const pontoon = (x0, x1, z0, z1, opt = {}) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0; const along = w > d; const L = along ? w : d, Wd = along ? d : w;
    deck.box(cx, PT - 0.06, cz, w - 0.1, 0.12, d - 0.1, { col: CONC, uvScale: 0.35 });
    // trowelled margin round the slab
    const m = 0.11; deck.hrect(x0 + 0.05, z0 + 0.05, x1 - 0.05, z0 + 0.05 + m, PT + 0.002, 1, MARGIN); deck.hrect(x0 + 0.05, z1 - 0.05 - m, x1 - 0.05, z1 - 0.05, PT + 0.002, 1, MARGIN);
    deck.hrect(x0 + 0.05, z0 + 0.05 + m, x0 + 0.05 + m, z1 - 0.05 - m, PT + 0.002, 1, MARGIN); deck.hrect(x1 - 0.05 - m, z0 + 0.05 + m, x1 - 0.05, z1 - 0.05 - m, PT + 0.002, 1, MARGIN);
    // module joints (a unit every ~12 m on walkways, none on short fingers) with a galvanised cover plate
    const nm = L > 14 ? Math.round(L / 12) : 1; for (let i = 1; i < nm; i++) { const t = i / nm; if (along) { const x = x0 + w * t; deck.hrect(x - 0.015, z0 + 0.05, x + 0.015, z1 - 0.05, PT + 0.003, 1, JOINT); paint.box(x, PT + 0.004, cz, 0.24, 0.008, d - 0.3, { col: PLATE }); } else { const z = z0 + d * t; deck.hrect(x0 + 0.05, z - 0.015, x1 - 0.05, z + 0.015, PT + 0.003, 1, JOINT); paint.box(cx, PT + 0.004, z, w - 0.3, 0.008, 0.24, { col: PLATE }); } }
    // the float hull: concrete sides from the deck down past the waterline, a weed / tide band at the water
    deck.box(cx, (PT - 0.12 + WL - 0.42) / 2, cz, w - 0.14, PT - 0.12 - (WL - 0.42), d - 0.14, { col: HULL, uvScale: 0.5 });
    paint.box(cx, WL + 0.04, cz, w - 0.125, 0.14, d - 0.125, { col: WEED });
    // hardwood walers (bolted, 0.1 × 0.24) and the rubber D-fender along them; ends wrapped
    const wal = (bx, bz, lx, lz) => { paint.box(bx, PT - 0.15, bz, lx, 0.24, lz, { col: WALER }); paint.box(bx, PT - 0.015, bz, lx, 0.03, lz, { col: WALER2 }); };
    wal(cx, z0 + 0.05, w, 0.1); wal(cx, z1 - 0.05, w, 0.1); wal(x0 + 0.05, cz, 0.1, d - 0.2); wal(x1 - 0.05, cz, 0.1, d - 0.2);
    if (!opt.noFender) { const fs = (bx, bz, lx, lz) => paint.box(bx, PT - 0.18, bz, lx, 0.09, lz, { col: RUB }); if (along) { fs(cx, z0 - 0.02, w - 0.3, 0.05); fs(cx, z1 + 0.02, w - 0.3, 0.05); } else { fs(x0 - 0.02, cz, 0.05, d - 0.3); fs(x1 + 0.02, cz, 0.05, d - 0.3); } }
    // through-bolts on the walers every 1.2 m (tiny, merged)
    const nb = Math.floor(L / 1.2); for (let i = 1; i < nb; i++) { const t = i / nb; if (along) { const x = x0 + w * t; metal.box(x, PT - 0.1, z0 - 0.002, 0.035, 0.035, 0.01, { col: BOLT }); metal.box(x, PT - 0.1, z1 + 0.002, 0.035, 0.035, 0.01, { col: BOLT }); } else { const z = z0 + d * t; metal.box(x0 - 0.002, PT - 0.1, z, 0.01, 0.035, 0.035, { col: BOLT }); metal.box(x1 + 0.002, PT - 0.1, z, 0.01, 0.035, 0.035, { col: BOLT }); } }
    void Wd;
    colliders.push({ x0, x1, z0, z1, y0: PT - 1.15, h: 1.15, kind: 'deck', marina: true }); // deck top + the float under it (~0.6 m draft)
  };
  // finger tip: white PVC corner bumpers; finger root: a concrete knee (gusset) into the main walkway
  const tipBumpers = (x, z0, z1, dir) => { paint.box(x + dir * 0.04, PT - 0.16, z0 + 0.08, 0.14, 0.26, 0.2, { col: WHITE }); paint.box(x + dir * 0.04, PT - 0.16, z1 - 0.08, 0.14, 0.26, 0.2, { col: WHITE }); };
  const knee = (x, zc, dir) => { for (const sz of [-1, 1]) { const z = zc + sz * 0.6; const m = new THREE.Matrix4().compose(new THREE.Vector3(x + dir * 0.36, PT - 0.07, z + sz * 0.25), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sz * dir * Math.PI / 4, 0)), new THREE.Vector3(1, 1, 1)); deck.geometry(new THREE.BoxGeometry(0.5, 0.12, 0.5), m, CONC); colliders.push({ x0: Math.min(x, x + dir * 0.7), x1: Math.max(x, x + dir * 0.7), z0: Math.min(z, z + sz * 0.5), z1: Math.max(z, z + sz * 0.5), y0: PT - 1.15, h: 1.15, kind: 'deck', marina: true }); } };
  const pile = (x, z) => { paint.cylinder(x, (PT + 1.5 + -3.6) / 2, z, 0.17, 0.17, 1.5 + 3.6, 12, { col: C('#8b9094') }); /* galvanised steel pile (dull grey, not a mirror-dark metal) */ metal.cylinder(x, PT + 1.52, z, 0.19, 0.19, 0.05, 12, { col: C('#d9b52a') }); paint.cylinder(x, PT - 0.08, z, 0.25, 0.25, 0.2, 12, { col: C('#a3a8ab') }); /* galvanised pile hoop (the guide the pontoon rides on) */ paint.cylinder(x, WL + 0.1, z, 0.175, 0.175, 0.3, 12, { col: WEED }); /* tide band */ colliders.push({ x0: x - 0.18, x1: x + 0.18, z0: z - 0.18, z1: z + 0.18, y0: PT - 0.6, h: 2.2, kind: 'pole', marina: true }); };
  const cleat = (x, z, rot) => { metal.box(x, PT + 0.02, z, rot ? 0.08 : 0.14, 0.04, rot ? 0.14 : 0.08, { col: ALU }); metal.box(x, PT + 0.075, z, rot ? 0.05 : 0.34, 0.035, rot ? 0.34 : 0.05, { col: ALU }); }; // base + horns
  // service pedestal: shore power + water, a small lamp on top (lit at night)
  const pedestal = (x, z) => { paint.box(x, PT + 0.45, z, 0.32, 0.9, 0.26, { col: WHITE }); paint.box(x, PT + 0.93, z, 0.36, 0.06, 0.3, { col: C('#2a2c2e') }); lamps.push([x, PT + 1.0, z, 'courtesy']); colliders.push({ x0: x - 0.18, x1: x + 0.18, z0: z - 0.15, z1: z + 0.15, y0: PT, h: 1.0, kind: 'prop', marina: true }); };
  // low bollard light along the walkways
  const bollard = (x, z) => { metal.cylinder(x, PT + 0.35, z, 0.07, 0.07, 0.7, 8, { col: C('#30343a') }); paint.box(x, PT + 0.62, z, 0.12, 0.08, 0.12, { col: C('#f3e7c8') }); lamps.push([x, PT + 0.62, z, 'courtesy']); };

  // gangway: hinged aluminium ramp from the harbour wall down to the head walkway, handrails both sides (stepped colliders)
  { const g = M.gang, n = 10; for (let i = 0; i < n; i++) { const xa = g.x1 - ((g.x1 - g.x0) * i) / n, xb = g.x1 - ((g.x1 - g.x0) * (i + 1)) / n; const ya = M.quayY + 0.02 + (PT - M.quayY - 0.02) * (i / n), yb = M.quayY + 0.02 + (PT - M.quayY - 0.02) * ((i + 1) / n); const ym = (ya + yb) / 2;
      metal.box((xa + xb) / 2, ym - 0.05, (g.z0 + g.z1) / 2, xa - xb + 0.02, 0.1, g.z1 - g.z0, { col: ALU }); for (let k = 0; k < 6; k++) metal.box((xa + xb) / 2 - 0.5 + k * 0.2, ym + 0.005, (g.z0 + g.z1) / 2, 0.03, 0.02, g.z1 - g.z0 - 0.1, { col: C('#8d9196') }); /* anti-slip cleats across the ramp */
      colliders.push({ x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: g.z0, z1: g.z1, y0: ym - 0.7, h: 0.7, kind: 'deck', marina: true }); }
    for (const z of [g.z0 + 0.05, g.z1 - 0.05]) { const pts = []; for (let i = 0; i <= 5; i++) { const x = g.x1 - ((g.x1 - g.x0) * i) / 5; const y = M.quayY + 0.02 + (PT - M.quayY - 0.02) * (i / 5); pts.push([x, y, z]); metal.cylinder(x, y + 0.5, z, 0.025, 0.025, 1.0, 6, { col: ALU }); }
      for (let i = 0; i < 5; i++) { const [xa, ya] = pts[i], [xb, yb] = pts[i + 1]; const L = Math.hypot(xb - xa, yb - ya); const m = new THREE.Matrix4().compose(new THREE.Vector3((xa + xb) / 2, (ya + yb) / 2 + 1.0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.atan2(yb - ya, xb - xa))), new THREE.Vector3(L, 1, 1)); metal.geometry(new THREE.BoxGeometry(1, 0.05, 0.05), m, ALU); }
      colliders.push({ x0: g.x0, x1: g.x1, z0: z - 0.06, z1: z + 0.06, y0: PT, h: 1.6, kind: 'rail', marina: true }); }
    paint.box(g.x1 - 0.2, M.quayY + 0.07, (g.z0 + g.z1) / 2, 0.5, 0.06, g.z1 - g.z0 + 0.3, { col: C('#6c6f72') }); // hinge plate on the wall
  }
  // pontoons
  const H = M.head, S = M.spine, T = M.tee; pontoon(H.x0, H.x1, H.z0, H.z1); pontoon(S.x0, S.x1, S.z0, H.z0); pontoon(T.x0, T.x1, T.z0, T.z1);
  for (let k = 1; k <= FINGERS; k++) { const zf = fingerZ(k); pontoon(172, S.x0, zf - 0.6, zf + 0.6); pontoon(S.x1, 200.5, zf - 0.6, zf + 0.6); tipBumpers(172, zf - 0.6, zf + 0.6, -1); tipBumpers(200.5, zf - 0.6, zf + 0.6, 1); knee(S.x0, zf, -1); knee(S.x1, zf, 1);
    pile(172.6, zf - 0.84); pile(199.9, zf - 0.84); /* the open side of the finger: boats lie alongside its north face */ cleat(173, zf, false); cleat(178, zf, false); cleat(199.8, zf, false); cleat(194, zf, false);
    pedestal(S.x0 - 0.5, zf - 0.2); pedestal(S.x1 + 0.5, zf + 0.2); }
  // marina office platform + cabin on the head walkway (counter window facing the walkway)
  { const O = M.office; pontoon(O.x0 - 2, O.x1 + 2, H.z1, O.z1 + 0.4);
    paint.box((O.x0 + O.x1) / 2, PT + 1.3, (O.z0 + O.z1) / 2, O.x1 - O.x0, 2.6, O.z1 - O.z0, { col: C('#f1efe9') });
    paint.box((O.x0 + O.x1) / 2, PT + 2.68, (O.z0 + O.z1) / 2, O.x1 - O.x0 + 0.8, 0.16, O.z1 - O.z0 + 0.8, { col: C('#28507a') }); // flat roof, navy fascia
    paint.box((O.x0 + O.x1) / 2, PT + 1.45, O.z0 - 0.01, 2.4, 0.9, 0.02, { col: C('#1b2a33') }); // counter window (dark glass)
    paint.box((O.x0 + O.x1) / 2, PT + 0.98, O.z0 - 0.2, 2.6, 0.06, 0.4, { col: C('#d9d4c8') }); // counter shelf
    paint.box(O.x1 - 0.9, PT + 1.0, O.z0 - 0.01, 0.9, 2.0, 0.02, { col: C('#3b4a55') }); // door
    lamps.push([(O.x0 + O.x1) / 2, PT + 2.45, O.z0 - 0.3, 'deck']);
    colliders.push({ x0: O.x0, x1: O.x1, z0: O.z0, z1: O.z1, y0: PT, h: 2.8, kind: 'building', marina: true }); }
  // piles along the spine / head / T-head, bollard lights, the T-head's service pedestal for the owner's berth
  for (let z = S.z0 + 6; z < H.z0; z += 11) { pile(S.x0 - 0.25, z); /* 1 m south of each finger, clear of the bows */ bollard(S.x1 - 0.2, z - 3); }
  for (let x = H.x0 + 4; x < H.x1; x += 12) { pile(x, H.z0 - 0.25); bollard(x + 6, H.z1 - 0.2); }
  for (let x = T.x0 + 3; x < T.x1; x += 9) { pile(x, T.z1 + 0.25); cleat(x + 3, T.z0 + 0.25, false); }
  pedestal(M.terminal.x, M.terminal.z); bollard(T.x1 - 0.3, T.z1 - 0.3); bollard(T.x0 + 0.3, T.z1 - 0.3);
  // a sign over the head of the gangway (canvas text, crisp at any range)
  const sign = (() => { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
    x.fillStyle = '#1f4a72'; x.fillRect(0, 0, 512, 96); x.fillStyle = '#f4f1e8'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = 'bold 40px Arial, Helvetica, sans-serif'; x.fillText('FORT HARBOUR MARINA', 256, 40); x.font = '20px Arial, Helvetica, sans-serif'; x.fillText('Berth holders & guests  ·  Office on the pontoon', 256, 76);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }); m.name = 'marinaSign';
    const p = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.8), m); p.position.set(M.gang.x1 + 0.6, M.quayY + 2.5, (M.gang.z0 + M.gang.z1) / 2); p.rotation.y = Math.PI / 2; p.name = 'marinaSign'; return p; })();
  for (const z of [M.gang.z0 - 0.4, M.gang.z1 + 0.4]) metal.cylinder(M.gang.x1 + 0.6, (M.quayY + 2.95) / 2, z, 0.05, 0.05, 2.95 - M.quayY, 8, { col: C('#2f3338') });

  const g = new THREE.Group(); g.name = 'marina';
  const add = (mb, mat, name, shadow = true) => { const geo = mb.build(); if (!geo) return; const m = new THREE.Mesh(geo, mat); m.name = name; m.castShadow = shadow; m.receiveShadow = true; m.matrixAutoUpdate = false; g.add(m); };
  add(deck, MAT.concrete || MAT.paint, 'marinaDeck', false); /* composite decking: the weathered concrete map tinted warm grey */ add(paint, MAT.paint || new THREE.MeshStandardMaterial({ vertexColors: true }), 'marinaPaint'); add(metal, MAT.metal || new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8 }), 'marinaMetal');
  if (sign) g.add(sign);
  // 58th: the berth's For Sale board on the T-head (two posts, a printed board facing the spine); turns into a "private berth"
  // plate once it is bought (setSold)
  const saleBoard = (() => { if (typeof document === 'undefined') return null; const mk = (sold) => { const c = document.createElement('canvas'); c.width = 512; c.height = 320; const x = c.getContext('2d');
      x.fillStyle = '#f6f3ea'; x.fillRect(0, 0, 512, 320); x.fillStyle = sold ? '#1f4a72' : '#c4161c'; x.fillRect(0, 0, 512, 92); x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 64px Arial, Helvetica, sans-serif'; x.fillText(sold ? 'PRIVATE BERTH' : 'FOR SALE', 256, 50); x.fillStyle = '#1b1b1b'; x.font = 'bold 44px Arial, Helvetica, sans-serif'; x.fillText(M.slipName.toUpperCase(), 256, 134);
      x.font = '26px Arial, Helvetica, sans-serif'; x.fillText(sold ? 'Berth holder only · no mooring' : 'T-head alongside · boats up to 42 m', 256, 182); x.fillText(sold ? 'Shore power & water · 24 h security' : 'Shore power, water, 24 h security', 256, 218);
      x.fillStyle = sold ? '#1f4a72' : '#c4161c'; x.font = 'bold 36px Arial, Helvetica, sans-serif'; x.fillText(sold ? M.name : 'Rs. ' + M.berthPrice.toLocaleString('en-US'), 256, 270); x.strokeStyle = '#1b1b1b'; x.lineWidth = 6; x.strokeRect(3, 3, 506, 314);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    const forSale = mk(false), sold = mk(true); const m = new THREE.MeshStandardMaterial({ map: forSale, roughness: 0.55 }); m.name = 'berthSale';
    const grp = new THREE.Group(); grp.name = 'berthSaleSign'; const S0 = M.saleSign; grp.position.set(S0.x, PT, S0.z);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.94, 0.03), [MAT.metal || m, MAT.metal || m, MAT.metal || m, MAT.metal || m, m, MAT.metal || m]); board.position.y = 1.35; board.castShadow = true; grp.add(board);
    const postM = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.35 }); for (const sx of [-0.6, 0.6]) { const pst = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.85, 8), postM); pst.position.set(sx, 0.925, -0.03); pst.castShadow = true; grp.add(pst); const ft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.14), postM); ft.position.set(sx, 0.006, -0.03); grp.add(ft); }
    grp.userData.setSold = (v) => { m.map = v ? sold : forSale; m.needsUpdate = true; }; colliders.push({ x0: S0.x - 0.75, x1: S0.x + 0.75, z0: S0.z - 0.1, z1: S0.z + 0.06, y0: PT, h: 1.9, kind: 'prop', marina: true }); return grp; })();
  if (saleBoard) g.add(saleBoard);
  scene.add(g); g.updateMatrixWorld(true);
  if (collision) collision.addAll(colliders);
  return { group: g, colliders, lamps, saleBoard };
}
// is (x, z) on (or within `pad` of) a marina pontoon / gangway? (boats keep off them)
export function marinaRects(colliders) { return colliders.filter((c) => c.kind === 'deck' || c.kind === 'pole' || c.kind === 'building'); }
