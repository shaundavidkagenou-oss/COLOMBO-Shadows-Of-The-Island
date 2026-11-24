// The nine handguns, drawn from photographs of the real pistols (dimensions in mm, drawing frame: z = 0 at the rear of the
// slide, +z to the muzzle, bore on y = 0; see GunKit.js). No maker's markings or logos — only the shapes, finishes and
// hardware that make each one recognisable: the M9's open-top slide and round hammer, the PM's rounded slide and one-piece
// bakelite grip, the 1911's grip safety, spur hammer and barrel bushing, the TT-pattern's slim slide, and so on.
import * as THREE from 'three';
import { weaponMaterials } from './WeaponModels.js';
import { Kit, slab, lathe, bx, cyl, rail, serrations, gripBox, holdFrom, MM } from './GunKit.js';

const G0 = new THREE.Vector3(0, -0.012, -0.034); // where every pistol's grip centre sits in the hand frame

// common pistol hardware --------------------------------------------------------------------------------------------
const screw = (K, m, z, y, x, r = 2.4) => { K.add(m.steel, cyl(r, 1.0, x, y, z, 'x', 14)); K.add(m.slot, bx(0.4, r * 1.7, r * 0.35, x + Math.sign(x) * 0.5, y, z)); };
const pin = (K, m, z, y, w, r = 1.5) => K.add(m.steel, cyl(r, w + 0.6, 0, y, z, 'x', 10));
const disc = (z, y, r, w, x = 0, seg = 18) => slab([{ arc: [z, y, r, 0, Math.PI * 2 * (seg - 1) / seg], n: seg - 1 }], w, { cx: x, bev: Math.min(0.35, w * 0.25), seg: 1 });
function ringHammer(K, m, z, y, r, w, spur = false) { // round / ring hammer seen from the side, cocked back a little
  K.add(m.oxide, slab([{ arc: [z, y, r, -0.2, Math.PI * 1.9], n: 16 }, [z + 3, y - r - 4], [z + 6, y - r - 3]], w, { bev: 0.8, holes: spur ? [] : [[{ arc: [z - 0.5, y + 0.5, r * 0.42, 0, Math.PI * 2 * 15 / 16], n: 15 }]] }));
}
function spurHammer(K, m, z, y, w) { // 1911 / TT pattern: spur reaching back over the web of the hand, grooved top
  K.add(m.blued, slab([[z + 6, y - 8], [z + 5, y + 2, 2], [z - 2, y + 7, 2], [z - 11, y + 6, 2], [z - 13, y + 3, 1], [z - 4, y + 1, 3], [z - 2, y - 8]], w, { bev: 0.7 }));
  for (let i = 0; i < 4; i++) K.add(m.slot, bx(w + 0.2, 0.5, 0.6, 0, y + 6.3 - i * 0.6, z - 4 - i * 2.2));
}
export function curvedTrigger(K, m, z, y, len = 18, w = 6) { // curved blade from the pivot (z, y) down and back
  K.add(m.steel, slab([[z - 2.5, y], [z + 2.5, y], [z + 4.5, y - len * 0.45, 3], [z + 1.5, y - len, 1.5], [z - 1, y - len + 1], [z, y - len * 0.5, 3]], w, { bev: 0.8 }));
}
function flatTrigger(K, m, z, y, len = 14, w = 6) { // 1911 / striker flat-faced shoe
  K.add(m.steel, slab([[z - 2, y], [z + 2.5, y], [z + 3, y - len, 1], [z - 1, y - len, 1], [z - 2.5, y - len * 0.5]], w, { bev: 0.8 }));
}
function sights(K, m, D) { const s = D.sight; // dovetailed rear (two ears with the notch between) + front blade, optional night-sight dots
  const top = D.slideTop; const ear = [[s.rz - 4.5, top - 0.5], [s.rz + 4.5, top - 0.5], [s.rz + 4, top + s.rh], [s.rz - 3, top + s.rh, 0.8], [s.rz - 4.5, top + s.rh - 1.5]];
  K.to('slide', m.oxide, slab(ear, 4, { cx: 3.6, bev: 0.5 }), slab(ear, 4, { cx: -3.6, bev: 0.5 }), bx(11, 2.2, 8, 0, top + 0.6, s.rz));
  K.to('slide', m.oxide, slab([[s.fz - 4, s.fy - 0.5], [s.fz + 4, s.fy - 0.5], [s.fz + 3, s.fy + s.fh, 0.6], [s.fz - 2, s.fy + s.fh, 0.6]], 3, { bev: 0.4 }));
  if (s.dots) K.to('slide', m.tritium, cyl(0.9, 0.3, 0, s.fy + s.fh - 1.6, s.fz + 3.2, 'z', 8), cyl(0.9, 0.3, 3.6, top + s.rh - 1.7, s.rz + 4.2, 'z', 8), cyl(0.9, 0.3, -3.6, top + s.rh - 1.7, s.rz + 4.2, 'z', 8));
}
const railUnder = (K, mat, z0, z1, y) => { for (const g of rail(z0, z1, 0, 21)) { g.rotateZ(Math.PI); g.translate(0, y * MM, 0); K.add(mat, g); } }; // rail hanging under the dust cover, slots facing down

// ------------------------------------------------------------------------------------------------------------------
// drawings (one per pistol)
const DRAW = {
  // M9 — 9×19 mm double-action service pistol: open-top slide (barrel exposed between the slide wings), slide-mounted
  // safety/decocker, round spurred hammer, big rounded trigger guard with a recurved front, chequered black grip panels
  service: (m) => ({ L: 217, slideTop: 13, slideBot: -13, slideW: 23.5, frameW: 22, gripW: 35,
    slide: [[-1, -13], [124, -13], [124, 8.6], [118, 8.6, 1], [100, 13, 9], [5, 13, 1.5], [-1, 10, 2]], slideMat: m.oxide, taper: [-13, 13, 0.84],
    wings: { pts: [[110, -13], [207, -13, 1], [212, -11, 2], [212, 5, 3], [207, 8.6, 3], [110, 8.6]], t: 4.6, bridge: [[192, -13], [207, -13, 1], [212, -11, 2], [212, -4], [192, -4]] },
    serr: [7, 40, 11, -11, 10], sight: { rz: 10, rh: 4.5, fz: 199, fy: 8.6, fh: 5.2 },
    barrel: [[96, 6.8], [208, 6.8], [213, 6.3], [213, 4.6], [200, 4.6]], port: [100, 134],
    frame: [[1, -13], [196, -13], [199, -18, 2], [196, -26, 2], [114, -27], [114, -40, 9], [106, -57, 9], [64, -58, 6], [55, -50, 3], [32, -121, 2], [-13, -121, 2], [5, -40], [4, -27, 6], [0, -18, 3]],
    guardHole: [[63, -30], [104, -30, 1], [106, -41, 7], [100, -51, 6], [67, -51, 5], [60, -43, 3]], frameMat: m.oxide,
    panel: [[50, -48, 5], [33, -114, 4], [-8, -114, 4], [4, -40, 8], [24, -32, 6], [46, -36, 6]], panelMat: m.gripBlack, screws: [[30, -48], [14, -104]], medallion: [20, -76, 7],
    mag: { base: [[-13, -121], [33, -121], [35, -127, 1.5], [-15, -127, 1.5]], body: [[-4, -40], [44, -40], [30, -121], [-13, -121]] },
    trig: [76, -30], trigLen: 19, hammer: (K) => ringHammer(K, m, -4, -1, 7.5, 6),
    parts: (K, D) => { for (const s of [1, -1]) K.to('slide', m.steel, slab([[12, 2], [26, 2], [28, 5, 1], [12, 7, 2]], 2.4, { cx: s * 12.6, bev: 0.5 })); // safety / decocker levers
      K.add(m.oxide, slab([[72, -15], [93, -15], [96, -19, 2], [74, -21, 2]], 2.2, { cx: 12, bev: 0.5 }), disc(110, -19, 3.4, 1.2, 11.4), disc(53, -47, 4, 1.4, 11.8)); // slide catch, takedown button, magazine release
      pin(K, m, 76, -30, D.frameW); pin(K, m, 92, -22, D.frameW); },
    grip: { front: [[52, -50], [32, -118]], back: [[4, -42], [-12, -118]] },
  }),
  // M17 — 9×19 mm striker-fired modular pistol: coyote polymer frame with an accessory rail and textured grip, squared
  // black nitride slide with front and rear cocking serrations, ambidextrous thumb safety, squared trigger guard
  m17: (m) => ({ seatDy: -4, thumbK: 0, L: 203, slideTop: 15, slideBot: -12, slideW: 25.5, frameW: 25, gripW: 31,
    slide: [[-1, -12], [199, -12, 1], [203, -8, 2], [203, 10, 4], [196, 15, 3], [4, 15, 2], [-1, 11, 2]], slideMat: m.oxide, taper: [-12, 15, 0.9],
    serr: [6, 32, 9, -10, 12], serrF: [160, 186, 8, -10, 12], sight: { rz: 9, rh: 4.8, fz: 192, fy: 15, fh: 5, dots: true },
    barrel: [[150, 6.2], [203.5, 6.2], [203.5, 4.6], [195, 4.6]], port: [56, 98, 13],
    frame: [[2, -12], [188, -12], [190, -17, 2], [186, -27, 1], [118, -27], [116, -33, 2], [112, -55, 3], [64, -57, 5], [56, -48, 3], [38, -123, 2], [-6, -123, 2], [6, -42], [6, -26, 6], [1, -18, 3]],
    guardHole: [[63, -29], [108, -29, 1], [106, -50, 5], [68, -51, 5], [60, -42, 3]], frameMat: m.polyFDE,
    panel: [[52, -46, 4], [38, -116, 4], [-4, -116, 4], [6, -42, 6], [22, -34, 6], [46, -38, 6]], panelMat: m.gripTan, panelW: 28,
    mag: { base: [[-6, -123], [38, -123], [40, -129, 1.5], [-8, -129, 1.5]], body: [[0, -40], [46, -40], [36, -123], [-6, -123]] },
    trig: [78, -29], trigLen: 17, trigFlat: true,
    parts: (K, D) => { railUnder(K, m.polyFDE, 124, 182, -27);
      for (const s of [1, -1]) K.add(m.oxide, slab([[16, -18], [34, -18], [36, -22, 2], [18, -24, 2]], 2.4, { cx: s * 13.2, bev: 0.5 })); // ambidextrous thumb safety
      K.add(m.oxide, slab([[70, -16], [90, -16], [92, -20, 2], [72, -21]], 2.2, { cx: 13, bev: 0.5 }), disc(54, -46, 4, 2.4, 13.4));
      pin(K, m, 78, -29, D.frameW); pin(K, m, 98, -20, D.frameW); },
    grip: { front: [[54, -48], [38, -120]], back: [[6, -42], [-6, -120]] },
  }),
  // Type 54 — 7.62×25 mm: the TT-pattern pistol, slim flat slide with alternating wide/narrow rear grooves, exposed spur
  // hammer, thin black grooved grip panels, lanyard loop, no safety lever
  type54: (m) => ({ L: 196, slideTop: 12, slideBot: -11, slideW: 21, frameW: 20, gripW: 28,
    slide: [[-1, -11], [190, -11, 1], [195, -8, 3], [195, 7, 3], [190, 12, 2], [4, 12, 2], [-1, 9, 2]], slideMat: m.blued, taper: [-11, 12, 0.92],
    serr: [8, 46, 13, -9, 10], sight: { rz: 8, rh: 4.2, fz: 186, fy: 12, fh: 4.5 },
    barrel: [[150, 6.5], [196, 6.5], [196, 4.2], [185, 4.2]], port: [58, 96],
    frame: [[1, -11], [150, -11], [152, -17, 2], [146, -22, 2], [102, -23], [101, -36, 8], [92, -50, 8], [62, -51, 5], [54, -44, 3], [42, -114, 2], [2, -114, 2], [8, -40], [6, -24, 5], [0, -17, 3]],
    guardHole: [[62, -26], [94, -26, 1], [96, -35, 6], [89, -45, 6], [66, -45, 5], [59, -38, 3]], frameMat: m.blued,
    panel: [[51, -46, 4], [40, -108, 4], [5, -108, 4], [9, -38, 6], [24, -30, 6], [46, -34, 6]], panelMat: m.gripBlack, screws: [[27, -70]],
    mag: { base: [[2, -114], [42, -114], [43, -118, 1], [1, -118, 1]], body: [[8, -36], [50, -36], [42, -114], [2, -114]] },
    trig: [72, -26], trigLen: 16, hammer: (K) => spurHammer(K, m, 2, -4, 6),
    parts: (K, D) => { K.add(m.blued, slab([[72, -14], [98, -14], [100, -17, 2], [74, -19, 2]], 2, { cx: 10.6, bev: 0.5 })); // slide stop
      K.add(m.steel, slab([{ arc: [6, -119, 4.2, 0, Math.PI * 1.9], n: 12 }], 2, { holes: [[{ arc: [6, -119, 2.4, 0, Math.PI * 1.9], n: 12 }]], bev: 0.5 })); // lanyard ring
      pin(K, m, 72, -26, D.frameW); pin(K, m, 86, -17, D.frameW); },
    grip: { front: [[52, -46], [42, -112]], back: [[8, -40], [2, -112]] },
  }),
  // PM — 9×18 mm: compact blowback pistol with a rounded-rear slide, slide-mounted safety, rounded ring hammer and the
  // one-piece wrap-around chequered bakelite grip with its heel magazine catch
  compact: (m) => ({ L: 161, slideTop: 12, slideBot: -11, slideW: 22, frameW: 21, gripW: 30,
    slide: [[-1, -11], [154, -11, 2], [161, -7, 4], [161, 6, 4], [155, 12, 4], [10, 12, 4], [0, 7, 6]], slideMat: m.blued, taper: [-11, 12, 0.82],
    serr: [12, 36, 13, -9, 9, 0.6, 3], sight: { rz: 13, rh: 4, fz: 152, fy: 12, fh: 4 },
    barrel: [[140, 6], [161.5, 6], [161.5, 4.6], [150, 4.6]], port: [52, 82],
    frame: [[2, -11], [148, -11], [151, -16, 3], [144, -21, 2], [126, -21], [126, -34, 10], [112, -47, 9], [70, -48, 6], [60, -40, 3], [44, -108, 2], [4, -108, 2], [9, -38], [6, -22, 5], [0, -16, 3]],
    guardHole: [[68, -24], [118, -24, 1], [120, -33, 7], [110, -42, 6], [72, -42, 5], [64, -35, 3]], frameMat: m.blued,
    panel: [[58, -42, 4], [44, -106, 4], [-3, -106, 5], [-6, -80, 6], [7, -36, 8], [22, -28, 6], [52, -32, 6]], panelMat: m.bakeliteGrip, panelW: 30, panelMono: true, screws: [[24, -70]],
    mag: { base: [[2, -106], [45, -106], [46, -112, 2], [0, -112, 2]], body: [[10, -32], [56, -32], [44, -106], [2, -106]] },
    trig: [80, -24], trigLen: 16, hammer: (K) => ringHammer(K, m, -2, -2, 6.5, 6),
    parts: (K, D) => { K.to('slide', m.blued, slab([[14, 0], [30, -1], [32, 4, 2], [16, 6, 2]], 2.4, { cx: 11.3, bev: 0.5 })); // safety lever
      K.add(m.blued, slab([[66, -13], [92, -13], [94, -17, 2], [68, -18, 2]], 2, { cx: 10.8, bev: 0.5 }), bx(5, 6, 8, 0, -102, -4)); pin(K, m, 80, -24, D.frameW); }, // slide stop, heel catch
    grip: { front: [[59, -42], [44, -106]], back: [[8, -38], [-4, -106]] },
  }),
  // PSM — 5.45×18 mm: the very flat (17 mm) self-loading pistol, alloy frame, thin grip plates, spurless hammer
  psm: (m) => ({ L: 155, slideTop: 10, slideBot: -9, slideW: 17, frameW: 16, gripW: 18,
    slide: [[-1, -9], [150, -9, 1], [155, -6, 3], [155, 5, 3], [150, 10, 2], [5, 10, 2], [-1, 6, 3]], slideMat: m.blued, taper: [-9, 10, 0.88],
    serr: [7, 28, 9, -7, 8], sight: { rz: 8, rh: 3.2, fz: 146, fy: 10, fh: 3.5 },
    barrel: [[130, 4.6], [155.5, 4.6], [155.5, 3.2], [145, 3.2]], port: [46, 74],
    frame: [[1, -9], [142, -9], [144, -14, 2], [138, -18, 2], [104, -18], [103, -30, 8], [94, -42, 7], [62, -43, 5], [54, -36, 3], [42, -100, 2], [4, -100, 2], [8, -34], [6, -20, 5], [0, -14, 3]],
    guardHole: [[61, -21], [96, -21, 1], [98, -29, 6], [90, -37, 5], [65, -37, 5], [58, -31, 3]], frameMat: m.park,
    panel: [[52, -38, 4], [41, -96, 4], [6, -96, 4], [9, -34, 6], [24, -26, 5], [46, -30, 5]], panelMat: m.gripBlack, panelW: 18.6, screws: [[25, -64]],
    mag: { base: [[4, -100], [42, -100], [43, -104, 1], [3, -104, 1]], body: [[8, -32], [50, -32], [42, -100], [4, -100]] },
    trig: [72, -21], trigLen: 14,
    parts: (K, D) => { K.to('slide', m.blued, slab([[10, -3], [22, -3], [23, 1, 1], [11, 2, 1]], 1.6, { cx: 8.8, bev: 0.4 })); pin(K, m, 72, -21, D.frameW); pin(K, m, 22, -14, D.frameW); },
    grip: { front: [[53, -38], [42, -100]], back: [[8, -34], [4, -100]] },
  }),
  // M11 — 9×19 mm compact double-action: tall squared slide, alloy frame with a decocking lever above the left grip
  // panel, rounded hammer with a hole, chequered wrap grips
  m11: (m) => ({ L: 180, slideTop: 16, slideBot: -12, slideW: 25, frameW: 23, gripW: 33,
    slide: [[-1, -12], [176, -12, 1], [180, -8, 3], [180, 12, 4], [175, 16, 3], [4, 16, 2], [-1, 12, 2]], slideMat: m.oxide, taper: [-12, 16, 0.86],
    serr: [7, 36, 10, -10, 12], sight: { rz: 9, rh: 4.8, fz: 170, fy: 16, fh: 4.8, dots: true },
    barrel: [[150, 6.4], [180.5, 6.4], [180.5, 4.6], [170, 4.6]], port: [54, 92, 14],
    frame: [[1, -12], [168, -12], [171, -17, 2], [166, -26, 2], [114, -26], [114, -38, 9], [104, -53, 8], [64, -54, 6], [55, -46, 3], [38, -120, 2], [-8, -120, 2], [5, -40], [4, -26, 6], [0, -17, 3]],
    guardHole: [[63, -29], [106, -29, 1], [107, -39, 6], [99, -48, 6], [67, -48, 5], [59, -40, 3]], frameMat: m.alu,
    panel: [[51, -46, 5], [37, -114, 4], [-4, -114, 4], [5, -40, 8], [24, -32, 6], [46, -36, 6]], panelMat: m.gripBlack, screws: [[34, -50], [16, -100]],
    mag: { base: [[-8, -120], [38, -120], [40, -126, 1.5], [-10, -126, 1.5]], body: [[-2, -40], [46, -40], [36, -120], [-8, -120]] },
    trig: [76, -29], trigLen: 18, hammer: (K) => ringHammer(K, m, -3, 0, 7, 6),
    parts: (K, D) => { K.add(m.oxide, slab([[38, -26], [54, -24], [56, -28, 2], [40, -31, 2]], 2.4, { cx: 12.2, bev: 0.5 }), slab([[70, -15], [92, -15], [94, -19, 2], [72, -20]], 2.2, { cx: 12, bev: 0.5 }), disc(54, -45, 4, 2.4, 12.2)); // decocker, slide catch, magazine release
      pin(K, m, 76, -29, D.frameW); pin(K, m, 104, -20, D.frameW); },
    grip: { front: [[53, -48], [37, -118]], back: [[5, -42], [-8, -118]] },
  }),
  // M1911A1 — .45 ACP single-action: parkerized finish, flat-topped slide with fine rear grooves and the round barrel
  // bushing, wide spur hammer over a short grip safety, thumb safety + slide stop on the left, arched mainspring housing,
  // short trigger, brown chequered panels with two screws each
  heavy: (m) => ({ seatDy: -10, thumbK: 0.5, thumbDz: -10, L: 216, slideTop: 12, slideBot: -12, slideW: 23.5, frameW: 22, gripW: 33,
    slide: [[2, -12], [209, -12, 1], [210, -9], [210, 9], [206, 12, 2], [5, 12, 1.5], [1, 9, 1.5]], slideMat: m.park, taper: [-12, 12, 0.9],
    serr: [7, 30, 14, -10, 10], sight: { rz: 10, rh: 3.8, fz: 199, fy: 12, fh: 4.2 },
    barrel: [[205, 9.2], [214, 9.2], [215, 8.6], [215, 5.8], [208, 5.8]], port: [64, 112],
    frame: [[1, -12], [160, -12], [162, -18, 2], [156, -24, 2], [108, -24], [108, -36, 8], [100, -49, 8], [64, -50, 6], [56, -42, 3], [40, -122, 2], [-10, -122, 2], [-12, -100, 10], [-4, -60], [-4, -36, 6], [-14, -24, 6], [-12, -18, 4], [0, -16, 2]],
    guardHole: [[63, -27], [100, -27, 1], [102, -36, 6], [95, -44, 6], [67, -44, 5], [60, -37, 3]], frameMat: m.park,
    panel: [[52, -44, 3], [40, -114, 3], [-4, -114, 3], [1, -46, 4], [10, -32, 4], [46, -32, 4]], panelMat: m.gripOlive, screws: [[33, -42], [22, -104]],
    mag: { base: [[-6, -122], [40, -122], [41, -126, 1], [-7, -126, 1]], body: [[2, -36], [52, -36], [40, -122], [-6, -122]] },
    trig: [74, -26], trigLen: 13, trigFlat: true, hammer: (K) => spurHammer(K, m, 0, -4, 7),
    parts: (K, D) => { K.add(m.park, slab([[-4, -18], [10, -16], [12, -22, 2], [2, -30, 4], [-12, -24, 4], [-14, -19, 3]], D.frameW - 2, { bev: 1.2 })); // grip safety tang
      K.add(m.park, slab([[4, -16], [24, -14], [26, -19, 2], [8, -21, 2]], 2.4, { cx: 12, bev: 0.6 }), slab([[64, -14], [88, -14], [90, -19, 2], [66, -21, 2]], 2.2, { cx: 12, bev: 0.6 }), cyl(2.8, 1.4, 12.2, -19, 75, 'x', 12)); // thumb safety, slide stop + its pin
      pin(K, m, 74, -24, D.frameW); pin(K, m, 12, -21, D.frameW); pin(K, m, 22, -38, D.frameW, 1.2);
      for (let i = 0; i < 9; i++) K.add(m.slot, bx(D.frameW - 3, 0.6, 1.2, 0, -66 - i * 4.5, -6.2 - i * 0.65)); }, // mainspring-housing grooves
    grip: { front: [[54, -44], [40, -120]], back: [[-3, -40], [-11, -118]] },
  }),
  // Mk 23 Mod 0 — .45 ACP special-operations pistol: large polymer frame with a long dust cover and accessory grooves,
  // big squared trigger guard, rounded heavy slide, threaded barrel protruding for a suppressor, decocker behind the safety
  mk23: (m) => ({ seatDy: -11, thumbK: 0, thumbDz: -6, trigShift: 5, L: 245, slideTop: 16, slideBot: -13, slideW: 27, frameW: 26, gripW: 36,
    slide: [[-1, -13], [229, -13, 1], [234, -9, 3], [234, 10, 5], [226, 16, 4], [6, 16, 3], [-1, 11, 3]], slideMat: m.oxide, taper: [-13, 16, 0.84],
    serr: [8, 38, 10, -11, 12], sight: { rz: 11, rh: 5, fz: 223, fy: 16, fh: 5, dots: true },
    barrel: [[220, 8], [234, 8], [236, 7.4], [248, 7.4], [249, 6.8], [249, 5], [238, 5]], port: [64, 108, 14],
    frame: [[2, -13], [222, -13], [225, -19, 2], [220, -30, 2], [136, -30], [134, -38, 2], [128, -62, 4], [72, -63, 6], [62, -54, 3], [42, -132, 2], [-8, -132, 2], [5, -46], [5, -30, 7], [0, -20, 3]],
    guardHole: [[70, -33], [126, -33, 1], [123, -56, 5], [76, -57, 5], [67, -47, 3]], frameMat: m.poly,
    panel: [[58, -54, 5], [42, -126, 4], [-3, -126, 4], [6, -46, 8], [26, -38, 6], [52, -42, 6]], panelMat: m.gripBlack, panelW: 34,
    mag: { base: [[-8, -132], [42, -132], [44, -138, 1.5], [-10, -138, 1.5]], body: [[0, -44], [52, -44], [42, -132], [-8, -132]] },
    trig: [90, -33], trigLen: 19, hammer: (K) => ringHammer(K, m, -4, 0, 8, 7, true),
    parts: (K, D) => { for (let i = 0; i < 3; i++) K.add(m.poly, bx(D.frameW + 1, 2.2, 52, 0, -22 - i * 3.6, 194)); // accessory grooves
      for (const g of [slab([[12, -22], [30, -20], [32, -25, 2], [14, -28, 2]], 2.6, { cx: 13.8, bev: 0.6 }), slab([[34, -30], [46, -28], [47, -33, 2], [35, -35, 2]], 2.6, { cx: 13.8, bev: 0.6 }), slab([[80, -18], [104, -18], [106, -23, 2], [82, -24]], 2.4, { cx: 13.6, bev: 0.6 }), disc(62, -54, 4.4, 2.4, 14)]) K.add(m.oxide, g); // safety, decocker, slide stop, magazine release
      pin(K, m, 90, -33, D.frameW); pin(K, m, 116, -22, D.frameW); },
    grip: { front: [[60, -54], [42, -130]], back: [[5, -46], [-8, -130]] },
  }),
  // M45A1 — .45 ACP close-quarters 1911: coyote cerakote, rail on the dust cover, front + rear angled serrations, high
  // beavertail grip safety with memory bump, ring hammer, ambidextrous safety, tan textured panels, night sights
  m45a1: (m) => ({ seatDy: -8, thumbK: 0, L: 218, slideTop: 12, slideBot: -12, slideW: 23.5, frameW: 22, gripW: 33,
    slide: [[2, -12], [211, -12, 1], [212, -9], [212, 8], [207, 12, 2], [5, 12, 1.5], [1, 9, 1.5]], slideMat: m.coat, taper: [-12, 12, 0.88],
    serr: [7, 32, 9, -10, 10, 0.6, 3], serrF: [158, 190, 8, -10, 10], sight: { rz: 11, rh: 4.6, fz: 200, fy: 12, fh: 4.8, dots: true },
    barrel: [[207, 9.2], [216, 9.2], [216, 5.8], [210, 5.8]], port: [64, 112],
    frame: [[1, -12], [178, -12], [180, -18, 2], [174, -27, 2], [108, -27], [108, -36, 8], [100, -49, 8], [64, -50, 6], [56, -42, 3], [40, -122, 2], [-8, -122, 2], [-6, -60], [-4, -44, 6], [-16, -30, 5], [-22, -20, 3], [-6, -16, 2]],
    guardHole: [[63, -29], [100, -29, 1], [102, -37, 6], [95, -44, 6], [67, -44, 5], [60, -37, 3]], frameMat: m.coat,
    panel: [[52, -44, 3], [40, -114, 3], [-2, -114, 3], [1, -46, 4], [10, -32, 4], [46, -32, 4]], panelMat: m.gripTan, screws: [[33, -42], [22, -104]],
    mag: { base: [[-8, -122], [40, -122], [42, -128, 1.5], [-10, -128, 1.5]], body: [[0, -36], [52, -36], [40, -122], [-8, -122]] },
    trig: [74, -28], trigLen: 13, trigFlat: true, hammer: (K) => ringHammer(K, m, -1, -3, 6.5, 6),
    parts: (K, D) => { K.add(m.coat, slab([[-6, -18], [10, -16], [12, -22, 2], [2, -32, 4], [-6, -46, 3], [-2, -38], [-16, -28, 4], [-24, -21, 4], [-20, -17, 3]], D.frameW - 2, { bev: 1.2 })); // beavertail + memory bump
      railUnder(K, m.coat, 120, 172, -27);
      for (const s of [1, -1]) K.add(m.coat, slab([[2, -16], [24, -14], [26, -19, 2], [6, -21, 2]], 2.4, { cx: s * 12, bev: 0.6 }));
      K.add(m.coat, slab([[64, -14], [88, -14], [90, -19, 2], [66, -21, 2]], 2.2, { cx: 12, bev: 0.6 })); pin(K, m, 74, -28, D.frameW); pin(K, m, 12, -21, D.frameW); },
    grip: { front: [[54, -44], [40, -120]], back: [[-4, -44], [-8, -118]] },
  }),
};
export const PISTOL_MODELS = Object.keys(DRAW);

export function buildPistol(def) {
  const m = weaponMaterials(); const D = DRAW[def.model || def.id](m); const K = new Kit();
  // slide (moves on recoil / when racked): profile, serrations, sights, ejection port, firing-pin plate
  K.to('slide', D.slideMat, slab(D.slide, D.slideW, { bev: 1.6, taper: D.taper }));
  if (D.wings) { const W = D.wings; for (const s of [1, -1]) K.to('slide', D.slideMat, slab(W.pts, W.t, { cx: s * (D.slideW / 2 - W.t / 2), bev: 1.2 })); K.to('slide', D.slideMat, slab(W.bridge, D.slideW - 2, { bev: 1.2 })); } // open-top slide: the barrel shows between the wings
  for (const sr of [D.serr, D.serrF].filter(Boolean)) K.to('slide', D.slideMat, serrations(sr[0], sr[1], sr[2], sr[3], sr[4], D.slideW / 2 * 0.93, sr[5] || 0.55, sr[6] || 0));
  sights(K, m, D);
  if (D.port) { const [z0, z1, top = D.slideTop - 2] = D.port; const x = -D.slideW / 2 * 0.95;
    K.to('slide', m.slot, slab([[z0, -1], [z1, -1], [z1, top], [z0, top, 2]], 1, { cx: x, bev: 0.2 })); K.to('slide', m.steel, slab([[z0 + 3, 1], [z1 - 4, 1], [z1 - 4, top - 1.5, 1], [z0 + 3, top - 1.5, 1]], 1, { cx: x - 0.45, bev: 0.2 })); } // dark port with the barrel hood in it
  K.to('slide', m.steel, slab([[-1.2, -8], [-1.2, 6], [0.2, 6], [0.2, -8]], 9, { bev: 0.3 })); // firing-pin retainer plate
  K.add(m.steel, lathe(D.barrel, 0, 0, 24));
  // frame with the trigger guard cut through, grip panels (both sides), screws, medallion
  K.add(D.frameMat, slab(D.frame, D.frameW, { bev: 1.6, holes: [D.guardHole] }));
  const pw = D.panelW || D.gripW; if (D.panelMono) K.add(D.panelMat, slab(D.panel, pw, { bev: 3.2 }));
  else for (const s of [1, -1]) K.add(D.panelMat, slab(D.panel, (pw - D.frameW) / 2 + 1, { cx: s * (D.frameW / 2 + (pw - D.frameW) / 4 - 0.5), bev: 1.1 }));
  for (const [z, y] of D.screws || []) for (const s of [1, -1]) screw(K, m, z, y, s * (pw / 2 + 0.3));
  if (D.medallion) for (const s of [1, -1]) K.add(D.panelMat, disc(D.medallion[0], D.medallion[1], D.medallion[2], 0.8, s * (pw / 2 + 0.25)));
  (D.trigFlat ? flatTrigger : curvedTrigger)(K, m, D.trig[0] + 2 - (D.trigShift || 0), D.trig[1], D.trigLen, 6);
  if (D.hammer) D.hammer(K);
  D.parts(K, D);
  // magazine: baseplate (always visible under the grip) + body (inside the grip, seen when it drops out)
  K.to('mag', m.oxide, slab(D.mag.base, D.gripW - 6, { bev: 1.2 })); K.to('mag', m.steel, slab(D.mag.body, D.gripW - 14, { bev: 0.8 }));
  // into the hand frame: the grip centre lands on G0
  const gb = gripBox(D.grip.front, D.grip.back, D.gripW); const off = new THREE.Vector3(G0.x, G0.y - gb.c[1] * MM, G0.z - gb.c[0] * MM);
  const parts = K.build(off); const g = parts.body; const slide = parts.slide, mag = parts.mag; g.add(slide); g.add(mag);
  const T = (z, y, x = 0) => new THREE.Vector3(x * MM + off.x, y * MM + off.y, z * MM + off.z);
  const muzZ = D.barrel.reduce((a, p) => Math.max(a, p[0]), 0);
  const gy = Math.min(...D.guardHole.map((p) => p[1]));
  const spec = { grip: gb, trigger: { z: D.trig[0] - (D.trigShift || 0), y: D.trig[1] }, guard: { z0: D.guardHole[0][0], z1: Math.max(...D.guardHole.map((p) => p[0])) + 3, yb: gy - 3, yt: D.trig[1], w: 8 },
    blocks: [[(D.frame[0][0] + D.frame[1][0]) / 2, D.slideBot - 6, D.frameW, 12, D.frame[1][0] - D.frame[0][0]], [D.L / 2, (D.slideTop + D.slideBot) / 2, D.slideW, D.slideTop - D.slideBot, D.L]],
    thumbR: [gb.c[0] + (D.thumbDz || 0), gb.c[1] + 57 + (D.seatDy || 0) * (D.thumbK ?? 1), D.gripW / 2 + 3 + (D.thumbDx || 0)], thumbL: [gb.c[0] + 104, gb.c[1] + 38, D.gripW / 2 + 11], wrap: 0.55 };
  const mb = [(D.mag.base[0][0] + D.mag.base[1][0]) / 2, D.mag.base[0][1]];
  g.userData = { muzzle: T(muzZ + 1, 0), support: new THREE.Vector3(0.024, -0.03, 0.004), magWell: T(mb[0], mb[1] + 8), rack: T(16, D.slideTop + 2), mag, slide, eject: T((D.port || [60, 90])[0] + 16, 6, -D.slideW / 2 - 2), stockZ: 0,
    sight: T(D.sight.rz + 2, D.slideTop + D.sight.rh - 0.6), hold: Object.assign(holdFrom(spec, off), { seatDy: (D.seatDy || 0) * MM }), model: def.model || def.id };
  return g;
}
