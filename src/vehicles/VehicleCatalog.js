// Catalogue of the everyday vehicles seen on Sri Lankan roads, modelled from their real proportions (overall length /
// width / height, wheelbase, overhangs, wheel size, glass line, door cuts) but sold here under FICTIONAL makes and model
// names with original, invented emblems. No real manufacturer name or logo is used anywhere in the game.
//
// This module is pure data (no three.js) so Audio / Traffic / Pursuit / tests can read it cheaply.
//
// Body generator: every passenger body is described by a handful of side-profile measurements (metres, +z forward,
// origin on the ground under the vehicle centre). Front distances (d…) are measured back from the nose, rear distances
// from the tail. `body()` turns them into the profile format the shared builder in VehicleModels.js consumes:
//   top  — side silhouette [z, y] from the front-bottom corner over the bonnet / belt to the rear-bottom corner
//          (fixed 9-point layout: nose bottom, bumper top, lamp line, bonnet edge, cowl, rear belt / rear-glass base,
//           tail top, tail middle, tail bottom)
//   gh   — greenhouse sections [z, beltY, roofY] front → rear (windscreen base, windscreen middle, roof front,
//          optional roof points, roof rear, rear-glass base)
//   wf / wr — axle positions; door [front edge, rear edge] of the front door; rearDoor / slide seams; pillarsB
//   bed  — pickups: open load bed behind the cab; winTop — vans with a high roof: glass stops at this height

const r3 = (v) => Math.round(v * 1000) / 1000;
export function body(o) {
  const L = o.L, fz = L / 2, rz = -L / 2; const F = (d) => r3(fz - d), B = (d) => r3(rz + d); const s = o.sill;
  const wf = F(o.fo), wr = r3(wf - o.wb);
  const top = [[F(o.nb ?? 0.02), s], [r3(fz), o.bump], [F(o.fyd ?? 0.04), o.fy], [F(o.hd), o.hy], [F(o.cd), o.cy], [B(o.bd), o.by], [B(o.td ?? 0.02), o.ty], [r3(rz), o.tm], [B(o.rb ?? 0.04), s]];
  const cz = F(o.cd), wz = F(o.wd), rr = B(o.rd), gz = B(o.bd);
  const beltAt = (z) => r3(o.cy + (o.by - o.cy) * (cz - z) / (cz - gz));
  const mz = r3((cz + wz) / 2);
  const gh = [[cz, o.cy, r3(o.cy + 0.02)], [mz, beltAt(mz), r3((o.cy + o.roof) / 2 + (o.bow ?? 0.03))], [wz, beltAt(wz), o.roof]];
  for (const [d, y] of o.roofPts || []) gh.push([F(d), beltAt(F(d)), y]);
  gh.push([rr, beltAt(rr), o.roofR ?? o.roof], [gz, o.by, o.gy1]);
  const D = { top, sill: s, gh, wf, wr, door: o.door, pillarsB: o.pB ?? r3(o.door[1] - 0.04) };
  if (o.rearDoor) D.rearDoor = o.rearDoor; if (o.slide) D.slide = o.slide; if (o.winTop) D.winTop = o.winTop;
  if (o.bed) D.bed = { z0: r3(gz - 0.07), z1: r3(rz + 0.05), floor: o.bed.floor, rail: o.ty };
  return D;
}

// ------------------------------------------------------------------------------------------------ fictional makes
// Emblems are original geometric designs (built in VehicleStyle.js); wordmarks are set in plain capitals.
export const BRANDS = {
  hoshida: { name: 'HOSHIDA', origin: 'Japan', emblem: 'peak' },       // star-and-mountain oval
  kensei: { name: 'KENSEI', origin: 'Japan', emblem: 'blade' },        // rounded square with a single slash
  ryuka: { name: 'RYUKA', origin: 'Japan', emblem: 'orbit' },          // ring crossed by a bar
  takuma: { name: 'TAKUMA', origin: 'Japan', emblem: 'target' },       // two concentric rings and a dot
  daikan: { name: 'DAIKAN', origin: 'Japan', emblem: 'hex' },          // hexagon outline with a centre bead
  vardhan: { name: 'VARDHAN', origin: 'India', emblem: 'bars' },       // three rising bars in a rounded frame
  orvane: { name: 'ORVANE', origin: 'Korea', emblem: 'ellipse' },      // ring with a tilted inner ellipse
  seruni: { name: 'SERUNI', origin: 'Malaysia', emblem: 'petals' },    // five-petal flower
  bristen: { name: 'BRISTEN', origin: 'Britain', emblem: 'plaque' },   // chrome-edged blue plaque with wordmark
  strelau: { name: 'STRELAU', origin: 'Germany', emblem: 'compass' },  // ring with a compass cross
};

// palettes typical of Colombo traffic: lots of white / pearl / silver / black, some colour on the small cars
const PAL = {
  pearl: ['#f1f1ec', '#ecebe4', '#c3c7cb', '#1a1b1e', '#5d6166'],
  suv: ['#f1f1ec', '#141517', '#b9bdc2', '#53575c', '#6b5a48'],
  kei: ['#f2f2ee', '#c0c4c8', '#e9e6dc', '#8fb0cc', '#1b1c1f', '#b31f26', '#c9b98f'],
  small: ['#f2f2ee', '#bfc3c7', '#a8151d', '#24497f', '#55595e', '#e6e3d8'],
  work: ['#f2f2ee', '#eeeeea', '#c3c6ca'],
};

// ------------------------------------------------------------------------------------------------ the 40 models
// cls: radio / UI description; ref: the real-world vehicle class the proportions are taken from (documentation only,
// never shown in game). fam: builder family (car / sedan / suv / van / pickup / truck). w: traffic weight.
// cab: seatY = cushion height, sz = front-row hip z, rows = rear rows [z, count], sx = front seat |x|.
const M = [];
const add = (id, o) => M.push([id, o]);

// ======================================================================= SUVs (10)
add('bastion', { brand: 'hoshida', name: 'Bastion 70', cls: 'SUV', fam: 'suv', ref: '70-series body-on-frame 4x4 wagon (common government / estate vehicle)',
  len: 4.91, wid: 1.87, hgt: 1.94, wheelR: 0.39, maxSpeed: 40, accel: 5.2, mass: 2300, seats: 5, steer: 0.48, colors: ['#f2f2ee', '#c9b994', '#7d8186', '#4a5a3a', '#e9e6dc'],
  b: { L: 4.91, sill: 0.48, fo: 0.86, wb: 2.73, bump: 0.78, fy: 0.86, fyd: 0.03, hd: 0.07, hy: 1.13, cd: 1.45, cy: 1.2, wd: 1.62, roof: 1.9, rd: 0.09, bd: 0.03, by: 1.22, gy1: 1.84, ty: 1.04, tm: 0.72, rb: 0.02, door: [0.98, 0.02], rearDoor: [-0.01, -0.63] },
  cab: { seatY: 0.72, rows: [[-0.7, 3]] }, tp: [0.035, 0.03, 0.012], tumble: 0.9,
  S: { head: { t: 'rect', w: 0.27, h: 0.17, x: 0.2 }, grille: { t: 'hbars', w: 0.62, chrome: false, n: 5 }, bumper: 'grey', tail: { t: 'small', w: 0.12, h: 0.22 }, snorkel: true, flares: true, rack: 'v', step: true, wheels: [1, 2], antenna: true, barnDoors: true } });
add('kaizan', { brand: 'hoshida', name: 'Kaizan', cls: 'SUV', fam: 'suv', ref: 'mid-size luxury body-on-frame 4x4, spare wheel on the side-hinged tailgate',
  len: 4.78, wid: 1.885, hgt: 1.85, wheelR: 0.385, maxSpeed: 46, accel: 6.6, mass: 2200, seats: 5, steer: 0.5, colors: PAL.suv,
  b: { L: 4.78, sill: 0.45, fo: 0.87, wb: 2.79, bump: 0.7, fy: 0.82, hd: 0.13, hy: 1.06, cd: 1.26, cy: 1.13, wd: 1.76, roof: 1.81, rd: 0.22, roofR: 1.79, bd: 0.09, by: 1.18, gy1: 1.68, ty: 1.02, tm: 0.62, door: [1.0, 0.02], rearDoor: [-0.01, -0.81] },
  cab: { seatY: 0.68, rows: [[-0.66, 3]] },
  S: { head: { t: 'swept', w: 0.36, h: 0.15, x: 0.2, wrap: 0.22 }, grille: { t: 'vslats', w: 0.5, chrome: true, trap: 0.82 }, lower: { t: 'trapezoid', w: 0.5, h: 0.1 }, tail: { t: 'wrap', w: 0.3, h: 0.17, up: 0.12 }, rails: true, step: true, spare: 'cover', wheels: [0, 2] } });
add('varuna', { brand: 'daikan', name: 'Varuna', cls: 'SUV', fam: 'suv', ref: 'long-wheelbase 4th-generation full-size 4x4, spare on the tailgate, kinked rear quarter glass',
  len: 4.9, wid: 1.875, hgt: 1.87, wheelR: 0.385, maxSpeed: 45, accel: 6.3, mass: 2250, seats: 5, steer: 0.5, colors: ['#f1f1ec', '#b9bdc2', '#141517', '#5a5e63', '#2a3a4e'],
  b: { L: 4.9, sill: 0.45, fo: 0.82, wb: 2.78, bump: 0.72, fy: 0.82, hd: 0.1, hy: 1.08, cd: 1.3, cy: 1.12, wd: 1.72, roof: 1.85, rd: 0.18, roofR: 1.83, bd: 0.05, by: 1.2, gy1: 1.76, ty: 1.0, tm: 0.6, door: [1.1, 0.05], rearDoor: [0.02, -0.68] },
  cab: { seatY: 0.68, rows: [[-0.62, 3]] },
  S: { head: { t: 'swept', w: 0.34, h: 0.16, x: 0.18, wrap: 0.16 }, grille: { t: 'hbars', w: 0.48, chrome: true, n: 3, vbar: true }, lower: { t: 'mesh', w: 0.45, h: 0.1 }, tail: { t: 'vertical', w: 0.12, h: 0.42, up: 0.3 }, rails: true, step: true, spare: 'cover', wheels: [2, 0] } }); // arches blended into the body (no separate flares)
add('warden', { brand: 'bristen', name: 'Warden 110', cls: '4x4 wagon', fam: 'suv', ref: 'classic flat-panel long-wheelbase British 4x4 (110 station wagon)',
  len: 4.6, wid: 1.79, hgt: 2.0, wheelR: 0.4, maxSpeed: 36, accel: 4.4, mass: 2100, seats: 5, steer: 0.48, colors: ['#3b4a35', '#ecebe5', '#6d7173', '#b9a98a', '#2c3e57'],
  b: { L: 4.6, sill: 0.52, fo: 0.72, wb: 2.794, bump: 0.6, fy: 0.74, fyd: 0.02, hd: 0.03, hy: 1.12, cd: 1.15, cy: 1.22, wd: 1.25, roof: 1.98, bow: 0.0, rd: 0.04, bd: 0.03, by: 1.24, gy1: 1.92, ty: 1.2, tm: 0.72, rb: 0.01, nb: 0.0, door: [1.06, 0.22], rearDoor: [0.19, -0.56] },
  cab: { seatY: 0.78, rows: [[-0.55, 3]] }, tp: [0.02, 0.015, 0.01], tumble: 0.9, bevel: 0.035,
  S: { head: { t: 'round', r: 0.09, x: 0.2 }, grille: { t: 'mesh', w: 0.42, chrome: false, between: true }, bumper: 'black', tail: { t: 'small', w: 0.1, h: 0.2 }, flares: true, spare: 'bare', snorkel: 'v', rack: 'v', alpine: true, noVisor: true, wheels: [1, 2], antenna: true } });
add('ezra', { brand: 'kensei', name: 'Ezra', cls: 'crossover', fam: 'suv', ref: 'compact coupe-style hybrid crossover (very common Colombo family car)',
  len: 4.295, wid: 1.77, hgt: 1.605, wheelR: 0.335, maxSpeed: 44, accel: 6.2, mass: 1300, seats: 5, steer: 0.53, colors: ['#f1f1ec', '#141517', '#9e1b22', '#23426e', '#b9bdc2', '#4f5357'],
  b: { L: 4.295, sill: 0.36, fo: 0.87, wb: 2.61, bump: 0.58, fy: 0.66, hd: 0.22, hy: 0.84, cd: 1.12, cy: 0.95, wd: 1.72, roof: 1.6, rd: 0.56, roofR: 1.53, bd: 0.2, by: 1.06, gy1: 1.12, ty: 0.96, tm: 0.66, door: [0.84, -0.1], rearDoor: [-0.13, -0.92] },
  cab: { seatY: 0.5, rows: [[-0.92, 3]] }, tp: [0.11, 0.08, 0.04], tumble: 0.8, upright: false,
  S: { head: { t: 'slim', w: 0.36, h: 0.085, x: 0.16, wrap: 0.2 }, grille: { t: 'bar', w: 0.6, chrome: true }, lower: { t: 'trapezoid', w: 0.55, h: 0.16 }, tail: { t: 'wrap', w: 0.32, h: 0.11, up: 0.04 }, cladding: true, hiddenRear: true, wheels: [0, 2] } });
add('kivo', { brand: 'hoshida', name: 'Kivo', cls: 'crossover', fam: 'suv', ref: 'diamond-styled compact hybrid crossover with high rear door handles',
  len: 4.36, wid: 1.795, hgt: 1.55, wheelR: 0.34, maxSpeed: 44, accel: 6.3, mass: 1400, seats: 5, steer: 0.53, colors: ['#f1f1ec', '#9e1b22', '#55595e', '#2a5d8a', '#141517', '#c9a34a'],
  b: { L: 4.36, sill: 0.36, fo: 0.92, wb: 2.64, bump: 0.58, fy: 0.7, hd: 0.18, hy: 0.86, cd: 1.18, cy: 0.98, wd: 1.76, roof: 1.54, rd: 0.62, roofR: 1.45, bd: 0.15, by: 1.1, gy1: 1.14, ty: 0.98, tm: 0.7, door: [0.81, -0.12], rearDoor: [-0.15, -0.95] },
  cab: { seatY: 0.48, rows: [[-0.94, 3]] }, tp: [0.12, 0.1, 0.05], tumble: 0.76, upright: false,
  S: { head: { t: 'slim', w: 0.36, h: 0.07, x: 0.15, wrap: 0.25, tilt: 0.12 }, grille: { t: 'slot', w: 0.45 }, lower: { t: 'trapezoid', w: 0.62, h: 0.2, mesh: true }, tail: { t: 'wrap', w: 0.36, h: 0.1, up: 0.0, proud: 0.05 }, cladding: true, hiddenRear: true, twoTone: 'v', wheels: [0, 2] } });
add('trevan', { brand: 'takuma', name: 'Trevan', cls: 'SUV', fam: 'suv', ref: '3rd-generation compact 4x4 SUV with V-shaped chrome grille',
  len: 4.64, wid: 1.82, hgt: 1.715, wheelR: 0.36, maxSpeed: 45, accel: 6.2, mass: 1550, seats: 5, steer: 0.52, colors: ['#f1f1ec', '#141517', '#b9bdc2', '#5e4b3c', '#7a1a20'],
  b: { L: 4.64, sill: 0.4, fo: 0.93, wb: 2.705, bump: 0.64, fy: 0.74, hd: 0.2, hy: 0.92, cd: 1.2, cy: 1.02, wd: 1.8, roof: 1.7, rd: 0.4, roofR: 1.66, bd: 0.14, by: 1.1, gy1: 1.4, ty: 1.0, tm: 0.66, door: [0.92, -0.04], rearDoor: [-0.07, -0.87] },
  cab: { seatY: 0.56, rows: [[-0.86, 3]] }, upright: false,
  S: { head: { t: 'swept', w: 0.36, h: 0.12, x: 0.16, wrap: 0.25, tilt: 0.08 }, grille: { t: 'vmotion', w: 0.42 }, lower: { t: 'mesh', w: 0.5, h: 0.12 }, tail: { t: 'wrap', w: 0.3, h: 0.14, up: 0.1 }, rails: true, cladding: true, wheels: [0, 2] } });
add('bhoomi', { brand: 'vardhan', name: 'Bhoomi', cls: 'SUV', fam: 'suv', ref: 'Indian body-on-frame utility SUV (sub-4-metre, boxy, tailgate spare)',
  len: 3.995, wid: 1.745, hgt: 1.88, wheelR: 0.37, maxSpeed: 38, accel: 4.6, mass: 1650, seats: 5, steer: 0.5, colors: ['#f2f2ee', '#c3c6ca', '#55595e', '#1b1c1f', '#7a1a20'],
  b: { L: 3.995, sill: 0.48, fo: 0.63, wb: 2.68, bump: 0.62, fy: 0.76, hd: 0.06, hy: 1.08, cd: 1.08, cy: 1.12, wd: 1.32, roof: 1.86, rd: 0.05, bd: 0.03, by: 1.15, gy1: 1.8, ty: 1.08, tm: 0.66, door: [0.87, 0.05], rearDoor: [0.02, -0.8] },
  cab: { seatY: 0.74, rows: [[-0.82, 3]] }, tp: [0.05, 0.03, 0.015], tumble: 0.88,
  S: { head: { t: 'rect', w: 0.3, h: 0.16, x: 0.16, tilt: -0.1 }, grille: { t: 'vslats', w: 0.4, chrome: true }, bumper: 'black', tail: { t: 'vertical', w: 0.11, h: 0.4, up: 0.2 }, flares: true, spare: 'cover', stripe: true, wheels: [1, 2] } });
add('kito', { brand: 'ryuka', name: 'Kito', cls: 'mini 4x4', fam: 'suv', ref: 'compact ladder-frame two-door 4x4 with round lamps and slotted grille',
  len: 3.6, wid: 1.645, hgt: 1.73, wheelR: 0.35, maxSpeed: 36, accel: 5.0, mass: 1100, seats: 4, steer: 0.56, colors: ['#c9b51c', '#3e4a37', '#d9d2b8', '#f2f2ee', '#1b1c1f', '#6a6e72'],
  b: { L: 3.6, sill: 0.48, fo: 0.6, wb: 2.25, bump: 0.6, fy: 0.74, fyd: 0.02, hd: 0.05, hy: 1.02, cd: 0.9, cy: 1.08, wd: 1.12, roof: 1.72, rd: 0.05, bd: 0.03, by: 1.1, gy1: 1.66, ty: 1.04, tm: 0.62, door: [0.73, -0.3] },
  cab: { seatY: 0.66, sz: -0.12, rows: [[-0.95, 2]] }, tp: [0.05, 0.03, 0.015], tumble: 0.88, bevel: 0.05,
  S: { head: { t: 'round', r: 0.085, x: 0.17 }, grille: { t: 'slots', w: 0.42, n: 5 }, bumper: 'black', tail: { t: 'small', w: 0.1, h: 0.1, low: true }, flares: true, spare: 'bare', drip: true, twoTone: 'v', wheels: [1, 2] } });
add('tarvo', { brand: 'hoshida', name: 'Tarvo', cls: 'SUV', fam: 'suv', ref: 'pickup-based 7-seat SUV (2nd generation) with chrome D-pillar kink',
  len: 4.795, wid: 1.855, hgt: 1.835, wheelR: 0.38, maxSpeed: 45, accel: 6.2, mass: 2100, seats: 5, steer: 0.5, colors: PAL.suv,
  b: { L: 4.795, sill: 0.44, fo: 0.93, wb: 2.745, bump: 0.68, fy: 0.82, hd: 0.18, hy: 1.05, cd: 1.3, cy: 1.12, wd: 1.78, roof: 1.82, rd: 0.26, roofR: 1.79, bd: 0.1, by: 1.16, gy1: 1.66, ty: 1.02, tm: 0.64, door: [0.98, 0.0], rearDoor: [-0.03, -0.82] },
  cab: { seatY: 0.68, rows: [[-0.7, 3]] },
  S: { head: { t: 'slim', w: 0.36, h: 0.1, x: 0.17, wrap: 0.22, tilt: 0.06 }, grille: { t: 'trapezoid', w: 0.5, chrome: true, n: 2 }, lower: { t: 'trapezoid', w: 0.5, h: 0.12 }, tail: { t: 'wrap', w: 0.32, h: 0.09, up: 0.06 }, rails: true, step: true, kink: true, wheels: [0, 2] } });

// ======================================================================= kei cars and small hatches
add('tora', { brand: 'ryuka', name: 'Tora', cls: 'hatchback', fam: 'car', ref: 'tall-boy kei hatchback (the most common small car in Sri Lanka), tail lamps in the D-pillars',
  len: 3.395, wid: 1.475, hgt: 1.64, wheelR: 0.28, maxSpeed: 34, accel: 4.6, mass: 820, seats: 4, steer: 0.6, colors: PAL.kei,
  b: { L: 3.395, sill: 0.28, fo: 0.53, wb: 2.425, bump: 0.52, fy: 0.6, hd: 0.12, hy: 0.76, cd: 0.64, cy: 0.9, wd: 1.28, roof: 1.63, rd: 0.06, roofR: 1.62, bd: 0.06, by: 0.98, gy1: 1.58, ty: 0.92, tm: 0.6, door: [0.79, -0.08], rearDoor: [-0.11, -0.9] },
  cab: { seatY: 0.52, rows: [[-0.84, 2]] }, tp: [0.08, 0.05, 0.03], tumble: 0.84, upright: true,
  S: { head: { t: 'tall', w: 0.28, h: 0.15, x: 0.13, wrap: 0.16, tilt: 0.25 }, grille: { t: 'bar', w: 0.42, chrome: true }, lower: { t: 'slot', w: 0.4, h: 0.06 }, tail: { t: 'pillar', w: 0.09, h: 0.42 }, wheels: [1, 0] } });
add('nippa', { brand: 'ryuka', name: 'Nippa 800', cls: 'hatchback', fam: 'car', ref: 'Indian-built entry-level 800 cc hatchback (very common budget car)',
  len: 3.43, wid: 1.49, hgt: 1.475, wheelR: 0.27, maxSpeed: 32, accel: 4.2, mass: 720, seats: 4, steer: 0.6, colors: PAL.small,
  b: { L: 3.43, sill: 0.26, fo: 0.5, wb: 2.36, bump: 0.48, fy: 0.58, hd: 0.14, hy: 0.72, cd: 0.8, cy: 0.84, wd: 1.3, roof: 1.47, rd: 0.26, roofR: 1.43, bd: 0.1, by: 0.92, gy1: 1.02, ty: 0.86, tm: 0.55, door: [0.82, -0.1], rearDoor: [-0.13, -0.81] },
  cab: { seatY: 0.4, rows: [[-0.86, 2]] }, tp: [0.1, 0.07, 0.04], tumble: 0.8,
  S: { head: { t: 'swept', w: 0.27, h: 0.11, x: 0.12, wrap: 0.16 }, grille: { t: 'slot', w: 0.3, chrome: true }, lower: { t: 'slot', w: 0.42, h: 0.06 }, tail: { t: 'vertical', w: 0.12, h: 0.24, up: 0.06 }, wheels: [1] } });
add('sathi', { brand: 'vardhan', name: 'Sathi 800', cls: 'hatchback', fam: 'car', ref: '1980s–2000s Indian 800 cc boxy hatchback, still running everywhere',
  len: 3.335, wid: 1.44, hgt: 1.405, wheelR: 0.26, maxSpeed: 30, accel: 3.8, mass: 650, seats: 4, steer: 0.62, colors: ['#f2f2ee', '#a8151d', '#24497f', '#c9b98f', '#bfc3c7', '#2f4a3a'],
  b: { L: 3.335, sill: 0.26, fo: 0.55, wb: 2.175, bump: 0.44, fy: 0.52, hd: 0.08, hy: 0.7, cd: 0.85, cy: 0.8, wd: 1.25, roof: 1.4, bow: 0.02, rd: 0.2, roofR: 1.38, bd: 0.1, by: 0.86, gy1: 1.2, ty: 0.8, tm: 0.5, door: [0.75, -0.12], rearDoor: [-0.15, -0.72] },
  cab: { seatY: 0.36, rows: [[-0.82, 2]] }, tp: [0.05, 0.04, 0.03], tumble: 0.82, bevel: 0.05,
  S: { head: { t: 'rect', w: 0.22, h: 0.12, x: 0.12 }, grille: { t: 'hbars', w: 0.5, chrome: false, n: 3, between: true }, bumper: 'black', tail: { t: 'rect', w: 0.2, h: 0.1 }, antenna: true, wheels: [1] } });
add('chhoti', { brand: 'vardhan', name: 'Chhoti', cls: 'city car', fam: 'car', ref: 'Indian rear-engined egg-shaped micro car',
  len: 3.1, wid: 1.495, hgt: 1.652, wheelR: 0.26, maxSpeed: 28, accel: 3.6, mass: 620, seats: 4, steer: 0.62, colors: ['#e8c21c', '#b3202a', '#f2f2ee', '#cdb98d', '#2c5e9e', '#bfc3c7'],
  b: { L: 3.1, sill: 0.27, fo: 0.45, wb: 2.23, bump: 0.5, fy: 0.6, hd: 0.1, hy: 0.76, cd: 0.5, cy: 0.9, wd: 1.0, roof: 1.64, bow: 0.05, rd: 0.14, roofR: 1.6, bd: 0.06, by: 0.98, gy1: 1.48, ty: 0.9, tm: 0.58, door: [0.74, -0.12], rearDoor: [-0.15, -0.79] },
  cab: { seatY: 0.5, rows: [[-0.82, 2]] }, tp: [0.16, 0.12, 0.06], tumble: 0.78, upright: true,
  S: { head: { t: 'tall', w: 0.26, h: 0.17, x: 0.12, wrap: 0.18, tilt: 0.35 }, grille: { t: 'none' }, lower: { t: 'smile', w: 0.42, h: 0.07 }, tail: { t: 'vertical', w: 0.11, h: 0.3, up: 0.08 }, wheels: [1] } });
add('hopper', { brand: 'ryuka', name: 'Hopper', cls: 'kei crossover', fam: 'car', ref: 'boxy two-tone kei crossover with round lamps',
  len: 3.395, wid: 1.475, hgt: 1.665, wheelR: 0.29, maxSpeed: 34, accel: 4.6, mass: 840, seats: 4, steer: 0.6, colors: ['#e2781e', '#e5c82a', '#4f88c8', '#b31f26', '#f2f2ee', '#8fc9b4'],
  b: { L: 3.395, sill: 0.32, fo: 0.53, wb: 2.425, bump: 0.56, fy: 0.66, hd: 0.08, hy: 0.82, cd: 0.66, cy: 0.94, wd: 1.22, roof: 1.66, rd: 0.06, roofR: 1.65, bd: 0.05, by: 1.0, gy1: 1.58, ty: 0.94, tm: 0.62, door: [0.77, -0.08], rearDoor: [-0.11, -0.9] },
  cab: { seatY: 0.56, rows: [[-0.84, 2]] }, tp: [0.06, 0.04, 0.025], tumble: 0.86, upright: true,
  S: { head: { t: 'round', r: 0.085, x: 0.15, ring: true }, grille: { t: 'slots', w: 0.34, n: 3, horiz: true }, bumper: 'black', tail: { t: 'pillar', w: 0.1, h: 0.3 }, flares: true, skid: true, twoTone: '#f2f2ee', wheels: [2, 1] } });
add('kargo', { brand: 'ryuka', name: 'Kargo', cls: 'kei van', fam: 'van', ref: 'semi-cab-over kei van with sliding doors (delivery and family use)',
  len: 3.395, wid: 1.475, hgt: 1.895, wheelR: 0.27, maxSpeed: 30, accel: 3.8, mass: 900, seats: 4, steer: 0.6, colors: ['#f2f2ee', '#eeeeea', '#c3c6ca', '#3a5f8f'],
  b: { L: 3.395, sill: 0.3, fo: 0.38, wb: 2.43, bump: 0.5, fy: 0.64, hd: 0.08, hy: 0.86, cd: 0.3, cy: 0.95, wd: 0.62, roof: 1.88, rd: 0.03, bd: 0.02, by: 1.0, gy1: 1.84, ty: 0.95, tm: 0.55, door: [1.29, 0.55], slide: [0.52, -0.46], pB: 0.53 },
  cab: { seatY: 0.66, sz: 0.62, rows: [[-0.35, 2]] }, tp: [0.04, 0.03, 0.02], tumble: 0.88,
  S: { head: { t: 'rect', w: 0.25, h: 0.15, x: 0.12, tilt: -0.08 }, grille: { t: 'slot', w: 0.3 }, bumper: 'grey', tail: { t: 'pillar', w: 0.08, h: 0.5 }, wheels: [1], noVisor: true } });
add('pico', { brand: 'orvane', name: 'Pico', cls: 'hatchback', fam: 'car', ref: 'Korean city hatchback with pinched "nose" grille',
  len: 3.595, wid: 1.595, hgt: 1.485, wheelR: 0.29, maxSpeed: 36, accel: 5.0, mass: 900, seats: 4, steer: 0.58, colors: ['#b31b20', '#f2f2ee', '#bfc3c7', '#24497f', '#5b8a3a', '#e07a1f'],
  b: { L: 3.595, sill: 0.3, fo: 0.67, wb: 2.385, bump: 0.54, fy: 0.64, hd: 0.2, hy: 0.8, cd: 0.95, cy: 0.9, wd: 1.5, roof: 1.48, rd: 0.38, roofR: 1.44, bd: 0.12, by: 0.98, gy1: 1.06, ty: 0.92, tm: 0.6, door: [0.74, -0.12], rearDoor: [-0.15, -0.89] },
  cab: { seatY: 0.42, rows: [[-0.88, 2]] },
  S: { head: { t: 'swept', w: 0.32, h: 0.14, x: 0.14, wrap: 0.24, tilt: 0.12 }, grille: { t: 'tiger', w: 0.3 }, lower: { t: 'trapezoid', w: 0.5, h: 0.12 }, tail: { t: 'vertical', w: 0.16, h: 0.26, up: 0.1 }, wheels: [0, 2] } });
add('pixa', { brand: 'hoshida', name: 'Pixa', cls: 'hatchback', fam: 'car', ref: '3rd-generation supermini hatchback (imported reconditioned, extremely common)',
  len: 3.885, wid: 1.695, hgt: 1.5, wheelR: 0.3, maxSpeed: 38, accel: 5.4, mass: 1000, seats: 4, steer: 0.56, colors: ['#f2f2ee', '#bfc3c7', '#1b1c1f', '#a8151d', '#24497f', '#c96a86', '#d8ccb0'],
  b: { L: 3.885, sill: 0.3, fo: 0.78, wb: 2.51, bump: 0.56, fy: 0.66, hd: 0.2, hy: 0.8, cd: 1.0, cy: 0.92, wd: 1.6, roof: 1.49, rd: 0.38, roofR: 1.45, bd: 0.12, by: 1.0, gy1: 1.06, ty: 0.92, tm: 0.6, door: [0.76, -0.12], rearDoor: [-0.15, -0.97] },
  cab: { seatY: 0.42, rows: [[-0.9, 2]] },
  S: { head: { t: 'swept', w: 0.34, h: 0.12, x: 0.15, wrap: 0.22, tilt: 0.1 }, grille: { t: 'slot', w: 0.36, chrome: true }, lower: { t: 'trapezoid', w: 0.55, h: 0.12 }, tail: { t: 'wrap', w: 0.28, h: 0.14, up: 0.08 }, wheels: [1, 0] } });
add('mizu', { brand: 'hoshida', name: 'Mizu', cls: 'hybrid hatch', fam: 'car', ref: 'low wedge-shaped compact hybrid hatchback (Colombo taxi / family favourite)',
  len: 3.995, wid: 1.695, hgt: 1.455, wheelR: 0.3, maxSpeed: 40, accel: 5.4, mass: 1080, seats: 4, steer: 0.56, colors: ['#f1f1ec', '#bfc3c7', '#1b1c1f', '#9cc3d9', '#a8151d', '#7fae4a'],
  b: { L: 3.995, sill: 0.28, fo: 0.8, wb: 2.55, bump: 0.52, fy: 0.62, hd: 0.22, hy: 0.74, cd: 1.0, cy: 0.9, wd: 1.62, roof: 1.45, rd: 0.5, roofR: 1.38, bd: 0.16, by: 0.98, gy1: 1.04, ty: 0.92, tm: 0.6, door: [0.79, -0.1], rearDoor: [-0.13, -0.97] },
  cab: { seatY: 0.38, rows: [[-0.9, 2]] },
  S: { head: { t: 'swept', w: 0.36, h: 0.09, x: 0.15, wrap: 0.26, tilt: 0.1 }, grille: { t: 'slot', w: 0.26 }, lower: { t: 'trapezoid', w: 0.62, h: 0.15 }, tail: { t: 'wrap', w: 0.24, h: 0.16, up: 0.1 }, wheels: [0, 2] } });
add('kobi', { brand: 'kensei', name: 'Kobi', cls: 'hatchback', fam: 'car', ref: '3rd-generation one-motion hybrid hatch with tall tail lamps',
  len: 3.955, wid: 1.695, hgt: 1.525, wheelR: 0.3, maxSpeed: 40, accel: 5.6, mass: 1080, seats: 4, steer: 0.56, colors: ['#f1f1ec', '#bfc3c7', '#2d5a9a', '#a8151d', '#d8641c', '#1b1c1f'],
  b: { L: 3.955, sill: 0.3, fo: 0.78, wb: 2.53, bump: 0.56, fy: 0.66, hd: 0.18, hy: 0.8, cd: 0.82, cy: 0.92, wd: 1.62, roof: 1.52, rd: 0.32, roofR: 1.48, bd: 0.1, by: 1.0, gy1: 1.12, ty: 0.94, tm: 0.62, door: [0.79, -0.12], rearDoor: [-0.15, -0.95] },
  cab: { seatY: 0.42, rows: [[-0.9, 2]] },
  S: { head: { t: 'swept', w: 0.33, h: 0.1, x: 0.15, wrap: 0.24, tilt: 0.12 }, grille: { t: 'bar', w: 0.6, chrome: true }, lower: { t: 'trapezoid', w: 0.5, h: 0.12 }, tail: { t: 'pillar', w: 0.11, h: 0.36, low: 0.12 }, wheels: [0, 2] } });
add('rizo', { brand: 'ryuka', name: 'Rizo', cls: 'hatchback', fam: 'car', ref: 'sporty supermini hatchback with blacked-out pillars (floating roof)',
  len: 3.85, wid: 1.695, hgt: 1.51, wheelR: 0.305, maxSpeed: 42, accel: 6.0, mass: 1000, seats: 4, steer: 0.57, colors: ['#b8141d', '#f2f2ee', '#bfc3c7', '#1f4f9b', '#1b1c1f', '#55595e'],
  b: { L: 3.85, sill: 0.3, fo: 0.75, wb: 2.43, bump: 0.56, fy: 0.68, hd: 0.2, hy: 0.82, cd: 0.98, cy: 0.92, wd: 1.58, roof: 1.5, rd: 0.3, roofR: 1.48, bd: 0.1, by: 1.0, gy1: 1.14, ty: 0.94, tm: 0.62, door: [0.77, -0.1], rearDoor: [-0.13, -0.87] },
  cab: { seatY: 0.42, rows: [[-0.88, 2]] },
  S: { head: { t: 'tall', w: 0.3, h: 0.15, x: 0.13, wrap: 0.26, tilt: 0.28 }, grille: { t: 'mesh', w: 0.32, trap: 0.8 }, lower: { t: 'mesh', w: 0.5, h: 0.12 }, tail: { t: 'vertical', w: 0.16, h: 0.24, up: 0.12 }, blackPillars: true, wheels: [0, 2] } });
add('lumo', { brand: 'takuma', name: 'Lumo', cls: 'electric hatch', fam: 'car', ref: '1st-generation electric family hatchback (popular reconditioned EV)',
  len: 4.445, wid: 1.77, hgt: 1.55, wheelR: 0.315, maxSpeed: 40, accel: 6.4, mass: 1520, seats: 5, steer: 0.54, colors: ['#f1f1ec', '#3f6fa8', '#bfc3c7', '#1b1c1f', '#a8151d'],
  b: { L: 4.445, sill: 0.3, fo: 0.88, wb: 2.7, bump: 0.56, fy: 0.66, hd: 0.25, hy: 0.8, cd: 1.12, cy: 0.94, wd: 1.78, roof: 1.55, bow: 0.05, rd: 0.45, roofR: 1.5, bd: 0.14, by: 1.02, gy1: 1.12, ty: 0.96, tm: 0.64, door: [0.92, -0.08], rearDoor: [-0.11, -0.97] },
  cab: { seatY: 0.45, rows: [[-0.9, 3]] }, tp: [0.13, 0.09, 0.05],
  S: { head: { t: 'tall', w: 0.42, h: 0.12, x: 0.12, wrap: 0.3, tilt: 0.4, fin: true }, grille: { t: 'none', charge: true }, lower: { t: 'trapezoid', w: 0.5, h: 0.1 }, tail: { t: 'pillar', w: 0.1, h: 0.46, low: 0.06 }, wheels: [2, 0] } });
add('kecil', { brand: 'seruni', name: 'Kecil', cls: 'hatchback', fam: 'car', ref: 'Malaysian-built budget hatchback with tall tail lamps',
  len: 3.64, wid: 1.62, hgt: 1.51, wheelR: 0.29, maxSpeed: 36, accel: 4.8, mass: 850, seats: 4, steer: 0.58, colors: ['#f2f2ee', '#bfc3c7', '#a5151d', '#55595e', '#b39760', '#24497f'],
  b: { L: 3.64, sill: 0.3, fo: 0.65, wb: 2.455, bump: 0.54, fy: 0.64, hd: 0.18, hy: 0.78, cd: 0.92, cy: 0.9, wd: 1.5, roof: 1.5, rd: 0.3, roofR: 1.46, bd: 0.1, by: 0.98, gy1: 1.1, ty: 0.92, tm: 0.6, door: [0.78, -0.12], rearDoor: [-0.15, -0.91] },
  cab: { seatY: 0.42, rows: [[-0.88, 2]] },
  S: { head: { t: 'swept', w: 0.32, h: 0.13, x: 0.14, wrap: 0.2, tilt: 0.1 }, grille: { t: 'hbars', w: 0.38, chrome: true, n: 2 }, lower: { t: 'trapezoid', w: 0.5, h: 0.11 }, tail: { t: 'pillar', w: 0.12, h: 0.32, low: 0.14 }, wheels: [1, 0] } });

// ======================================================================= saloons
add('ventra', { brand: 'hoshida', name: 'Ventra', cls: 'saloon', fam: 'sedan', ref: '2010s compact saloon, the default family / office car',
  len: 4.4, wid: 1.695, hgt: 1.46, wheelR: 0.3, maxSpeed: 42, accel: 5.8, mass: 1150, seats: 5, steer: 0.53, colors: PAL.pearl,
  b: { L: 4.4, sill: 0.28, fo: 0.9, wb: 2.6, bump: 0.52, fy: 0.62, hd: 0.2, hy: 0.74, cd: 1.18, cy: 0.88, wd: 1.72, roof: 1.46, rd: 1.36, roofR: 1.43, bd: 0.95, by: 0.96, gy1: 0.98, td: 0.1, ty: 0.95, tm: 0.62, door: [0.9, -0.04], rearDoor: [-0.07, -0.92] },
  cab: { seatY: 0.38, rows: [[-0.88, 3]] },
  S: { head: { t: 'swept', w: 0.36, h: 0.11, x: 0.15, wrap: 0.24, tilt: 0.08 }, grille: { t: 'hbars', w: 0.4, chrome: true, n: 2 }, lower: { t: 'trapezoid', w: 0.55, h: 0.12 }, tail: { t: 'wrap', w: 0.3, h: 0.14, deck: true }, wheels: [0, 2] } });
add('solace', { brand: 'hoshida', name: 'Solace', cls: 'saloon', fam: 'sedan', ref: '2000s–2010s mid-size premium saloon with chrome-heavy trim',
  len: 4.595, wid: 1.695, hgt: 1.475, wheelR: 0.315, maxSpeed: 44, accel: 6.0, mass: 1250, seats: 5, steer: 0.52, colors: ['#f1f1ec', '#c3c7cb', '#1a1b1e', '#5d6166', '#6a5a4a'],
  b: { L: 4.595, sill: 0.28, fo: 0.92, wb: 2.7, bump: 0.52, fy: 0.62, hd: 0.2, hy: 0.75, cd: 1.22, cy: 0.89, wd: 1.78, roof: 1.47, rd: 1.4, roofR: 1.44, bd: 1.0, by: 0.97, gy1: 0.99, td: 0.12, ty: 0.96, tm: 0.62, door: [0.96, -0.02], rearDoor: [-0.05, -0.93] },
  cab: { seatY: 0.39, rows: [[-0.88, 3]] },
  S: { head: { t: 'swept', w: 0.36, h: 0.12, x: 0.15, wrap: 0.22, tilt: 0.06 }, grille: { t: 'hbars', w: 0.42, chrome: true, n: 4, frame: true }, lower: { t: 'slot', w: 0.55, h: 0.08 }, tail: { t: 'wrap', w: 0.32, h: 0.14, deck: true, garnish: true }, chromeBelt: true, wheels: [2, 0] } });
add('ecora', { brand: 'hoshida', name: 'Ecora', cls: 'hybrid', fam: 'car', ref: '3rd-generation triangular hybrid liftback with split rear glass',
  len: 4.46, wid: 1.745, hgt: 1.49, wheelR: 0.31, maxSpeed: 42, accel: 5.8, mass: 1360, seats: 5, steer: 0.53, colors: ['#f1f1ec', '#c3c7cb', '#1a1b1e', '#2f5f9a', '#5d6166'],
  b: { L: 4.46, sill: 0.28, fo: 0.92, wb: 2.7, bump: 0.54, fy: 0.64, hd: 0.22, hy: 0.76, cd: 1.12, cy: 0.88, wd: 1.95, roof: 1.49, bow: 0.04, rd: 0.88, roofR: 1.41, bd: 0.12, by: 1.0, gy1: 1.08, ty: 0.98, tm: 0.62, door: [0.9, -0.05], rearDoor: [-0.08, -1.0] },
  cab: { seatY: 0.37, sz: 0.0, rows: [[-0.84, 3]] },
  S: { head: { t: 'swept', w: 0.4, h: 0.1, x: 0.14, wrap: 0.3, tilt: 0.15 }, grille: { t: 'slot', w: 0.3 }, lower: { t: 'trapezoid', w: 0.6, h: 0.15 }, tail: { t: 'wrap', w: 0.34, h: 0.1, up: 0.02 }, splitGlass: true, wheels: [2, 0] } });
add('elana', { brand: 'kensei', name: 'Elana', cls: 'hybrid saloon', fam: 'sedan', ref: 'compact hybrid saloon with a chrome "wing" grille bar',
  len: 4.44, wid: 1.695, hgt: 1.475, wheelR: 0.305, maxSpeed: 42, accel: 5.8, mass: 1180, seats: 5, steer: 0.53, colors: ['#f1f1ec', '#c3c7cb', '#1a1b1e', '#2d4f7a', '#5a4636'],
  b: { L: 4.44, sill: 0.28, fo: 0.9, wb: 2.6, bump: 0.53, fy: 0.64, hd: 0.2, hy: 0.76, cd: 1.08, cy: 0.89, wd: 1.72, roof: 1.47, rd: 1.3, roofR: 1.44, bd: 0.92, by: 0.98, gy1: 1.0, td: 0.1, ty: 0.97, tm: 0.63, door: [0.91, -0.05], rearDoor: [-0.08, -0.9] },
  cab: { seatY: 0.38, rows: [[-0.88, 3]] },
  S: { head: { t: 'swept', w: 0.36, h: 0.1, x: 0.14, wrap: 0.24, tilt: 0.1 }, grille: { t: 'bar', w: 0.62, chrome: true, thick: true }, lower: { t: 'trapezoid', w: 0.5, h: 0.12 }, tail: { t: 'wrap', w: 0.3, h: 0.12, deck: true }, wheels: [0, 2] } });
add('arlen', { brand: 'hoshida', name: 'Arlen', cls: 'saloon', fam: 'sedan', ref: '1990s compact saloon with the classic rounded mid-90s shape',
  len: 4.27, wid: 1.685, hgt: 1.38, wheelR: 0.29, maxSpeed: 38, accel: 4.8, mass: 1020, seats: 5, steer: 0.54, colors: ['#f2f2ee', '#bfc3c7', '#2f4a3a', '#5a1a22', '#c4b48c', '#5f6a74'],
  b: { L: 4.27, sill: 0.24, fo: 0.87, wb: 2.465, bump: 0.48, fy: 0.56, hd: 0.14, hy: 0.7, cd: 1.2, cy: 0.84, wd: 1.74, roof: 1.38, rd: 1.32, roofR: 1.36, bd: 0.9, by: 0.92, gy1: 0.94, td: 0.08, ty: 0.91, tm: 0.6, door: [0.87, -0.08], rearDoor: [-0.11, -0.83] },
  cab: { seatY: 0.32, sz: 0.02, rows: [[-0.88, 3, -0.025]] }, tp: [0.08, 0.06, 0.04], // old low saloon: rear bench sits lower
  S: { head: { t: 'rect', w: 0.36, h: 0.11, x: 0.13, wrap: 0.1, tilt: 0.0, amber: true }, grille: { t: 'hbars', w: 0.36, chrome: true, n: 3, between: true }, tail: { t: 'bar', w: 0.6, h: 0.13, deck: true }, rubStrip: true, antenna: true, wheels: [1, 2] } });
add('lanzo', { brand: 'daikan', name: 'Lanzo', cls: 'saloon', fam: 'sedan', ref: 'early-2000s compact saloon with a wedge belt line',
  len: 4.52, wid: 1.695, hgt: 1.44, wheelR: 0.305, maxSpeed: 42, accel: 5.6, mass: 1200, seats: 5, steer: 0.53, colors: ['#c3c7cb', '#f2f2ee', '#1a1b1e', '#8e1a20', '#c8b48e'],
  b: { L: 4.52, sill: 0.28, fo: 0.92, wb: 2.6, bump: 0.52, fy: 0.62, hd: 0.18, hy: 0.76, cd: 1.2, cy: 0.9, wd: 1.75, roof: 1.44, rd: 1.35, roofR: 1.41, bd: 0.95, by: 0.99, gy1: 1.01, td: 0.1, ty: 0.98, tm: 0.63, door: [0.93, -0.02], rearDoor: [-0.05, -0.88] },
  cab: { seatY: 0.37, rows: [[-0.88, 3, -0.02]] },
  S: { head: { t: 'swept', w: 0.32, h: 0.15, x: 0.15, wrap: 0.18, tilt: 0.0 }, grille: { t: 'hbars', w: 0.38, chrome: true, n: 3, frame: true }, lower: { t: 'trapezoid', w: 0.5, h: 0.1 }, tail: { t: 'wrap', w: 0.32, h: 0.17, deck: true }, wheels: [2, 0] } });
add('wren', { brand: 'bristen', name: 'Wren', cls: 'classic', fam: 'sedan', ref: '1950s–60s British small saloon (still loved and driven in Sri Lanka)',
  len: 3.76, wid: 1.55, hgt: 1.52, wheelR: 0.31, maxSpeed: 28, accel: 3.0, mass: 780, seats: 4, steer: 0.55, colors: ['#e8e2cf', '#151517', '#5a1a20', '#8fb2c9', '#9db28b', '#7d8186'],
  b: { L: 3.76, sill: 0.3, fo: 0.7, wb: 2.184, bump: 0.42, fy: 0.62, hd: 0.3, hy: 0.84, cd: 1.12, cy: 0.94, wd: 1.4, roof: 1.51, bow: 0.06, roofPts: [[1.9, 1.52]], rd: 1.0, roofR: 1.44, bd: 0.66, by: 0.98, gy1: 1.0, td: 0.12, ty: 0.84, tm: 0.52, door: [0.74, -0.1], rearDoor: [-0.13, -0.62] },
  cab: { seatY: 0.42, sz: 0.0, rows: [[-0.8, 2, -0.03]] }, tp: [0.2, 0.16, 0.08], tumble: 0.74, bevel: 0.1,
  S: { head: { t: 'round', r: 0.085, x: 0.0, fender: true }, grille: { t: 'classic', w: 0.3 }, bumper: 'chrome', tail: { t: 'round', r: 0.05 }, fenders: true, splitScreen: true, antenna: false, whitewall: true, noVisor: true, wheels: [1] } });
add('praetor', { brand: 'strelau', name: 'Praetor', cls: 'executive saloon', fam: 'sedan', ref: 'German-style executive saloon with twin-lamp face (E-segment)',
  len: 4.87, wid: 1.85, hgt: 1.47, wheelR: 0.33, maxSpeed: 50, accel: 7.2, mass: 1700, seats: 5, steer: 0.5, colors: ['#151517', '#c3c7cb', '#f1f1ec', '#1c2a44', '#55595e'],
  b: { L: 4.87, sill: 0.3, fo: 0.84, wb: 2.874, bump: 0.54, fy: 0.64, hd: 0.18, hy: 0.76, cd: 1.4, cy: 0.9, wd: 1.98, roof: 1.47, rd: 1.45, roofR: 1.44, bd: 0.98, by: 1.0, gy1: 1.02, td: 0.1, ty: 0.99, tm: 0.64, door: [0.92, -0.02], rearDoor: [-0.05, -0.88] },
  cab: { seatY: 0.39, rows: [[-0.9, 3]] },
  S: { head: { t: 'quad', w: 0.17, h: 0.12, x: 0.12, wrap: 0.1 }, grille: { t: 'hbars', w: 0.34, chrome: true, n: 3, frame: true, emblemBig: true }, lower: { t: 'mesh', w: 0.6, h: 0.1 }, tail: { t: 'wrap', w: 0.34, h: 0.13, deck: true }, chromeBelt: true, wheels: [0, 2] } });
add('arco', { brand: 'kensei', name: 'Arco', cls: 'saloon', fam: 'sedan', ref: '8th-generation arched cab-forward compact saloon',
  len: 4.54, wid: 1.75, hgt: 1.435, wheelR: 0.31, maxSpeed: 45, accel: 6.2, mass: 1250, seats: 5, steer: 0.53, colors: ['#f2f2ee', '#bfc3c7', '#1b1c1f', '#a8151d', '#24497f'],
  b: { L: 4.54, sill: 0.28, fo: 0.92, wb: 2.7, bump: 0.52, fy: 0.62, hd: 0.22, hy: 0.74, cd: 1.0, cy: 0.86, wd: 1.88, roof: 1.43, bow: 0.06, rd: 1.34, roofR: 1.39, bd: 0.82, by: 0.98, gy1: 1.0, td: 0.08, ty: 0.97, tm: 0.64, door: [0.93, -0.06], rearDoor: [-0.09, -0.96] },
  cab: { seatY: 0.36, rows: [[-0.88, 3]] },
  S: { head: { t: 'swept', w: 0.4, h: 0.09, x: 0.14, wrap: 0.3, tilt: 0.12 }, grille: { t: 'bar', w: 0.5, chrome: true }, lower: { t: 'trapezoid', w: 0.55, h: 0.12 }, tail: { t: 'wrap', w: 0.3, h: 0.13, deck: true }, wheels: [0, 2] } });

// ======================================================================= wagons, vans
add('workline', { brand: 'hoshida', name: 'Workline', cls: 'wagon', fam: 'car', ref: 'commercial estate / light van (company runabout), unpainted bumpers, steel wheels',
  len: 4.245, wid: 1.69, hgt: 1.525, wheelR: 0.3, maxSpeed: 38, accel: 4.8, mass: 1080, seats: 4, steer: 0.55, colors: PAL.work,
  b: { L: 4.245, sill: 0.3, fo: 0.8, wb: 2.55, bump: 0.54, fy: 0.64, hd: 0.14, hy: 0.78, cd: 1.0, cy: 0.92, wd: 1.58, roof: 1.52, rd: 0.13, roofR: 1.51, bd: 0.04, by: 0.98, gy1: 1.45, ty: 0.94, tm: 0.62, door: [0.92, -0.04], rearDoor: [-0.07, -0.85] },
  cab: { seatY: 0.4, rows: [[-0.82, 2]] },
  S: { head: { t: 'swept', w: 0.3, h: 0.13, x: 0.14, wrap: 0.14 }, grille: { t: 'slot', w: 0.32 }, bumper: 'black', tail: { t: 'pillar', w: 0.1, h: 0.32, low: 0.12 }, blackMirrors: true, wheels: [1], noVisor: true } });
add('doruka', { brand: 'hoshida', name: 'Doruka', cls: 'high-roof van', fam: 'van', ref: 'cab-over high-roof van used for school runs, staff transport and tours',
  len: 4.69, wid: 1.69, hgt: 2.3, wheelR: 0.32, maxSpeed: 32, accel: 4.0, mass: 1900, seats: 11, steer: 0.5, colors: ['#f4f4f2', '#eeeeea', '#c3c6ca', '#e9e6dc'],
  b: { L: 4.69, sill: 0.34, fo: 0.7, wb: 2.545, bump: 0.56, fy: 0.7, hd: 0.05, hy: 0.98, cd: 0.12, cy: 1.02, wd: 0.55, roof: 1.92, roofPts: [[0.9, 2.22], [1.4, 2.28]], rd: 0.06, roofR: 2.27, bd: 0.03, by: 1.08, gy1: 2.18, ty: 1.02, tm: 0.56, winTop: 1.78, door: [2.05, 1.2], slide: [1.15, 0.05], pB: 1.18 },
  cab: { seatY: 0.74, sz: 1.3, rows: [[0.32, 3], [-0.6, 3], [-1.52, 3]], vanPillars: [-0.15, -1.05] }, tp: [0.03, 0.02, 0.015], tumble: 0.9,
  S: { head: { t: 'rect', w: 0.24, h: 0.16, x: 0.12 }, grille: { t: 'hbars', w: 0.46, chrome: true, n: 4, between: true }, bumper: 'grey', tail: { t: 'pillar', w: 0.09, h: 0.5, low: 0.0 }, wheels: [1, 2], noVisor: true } });
add('haruto', { brand: 'takuma', name: 'Haruto', cls: 'van', fam: 'van', ref: 'semi-bonneted 5th-generation one-box van',
  len: 4.695, wid: 1.695, hgt: 1.99, wheelR: 0.34, maxSpeed: 36, accel: 4.6, mass: 1950, seats: 8, steer: 0.5, colors: ['#f4f4f2', '#c3c6ca', '#1a1b1e', '#e9e6dc'],
  b: { L: 4.695, sill: 0.34, fo: 0.8, wb: 2.555, bump: 0.58, fy: 0.72, hd: 0.08, hy: 0.98, cd: 0.36, cy: 1.04, wd: 0.9, roof: 1.98, rd: 0.05, bd: 0.03, by: 1.1, gy1: 1.92, ty: 1.04, tm: 0.58, door: [1.85, 0.98], slide: [0.95, -0.2], pB: 0.96 },
  cab: { seatY: 0.72, sz: 1.12, rows: [[0.05, 3], [-1.0, 3]], vanPillars: [-0.55, -1.5] }, tp: [0.05, 0.02, 0.015], tumble: 0.88,
  S: { head: { t: 'swept', w: 0.3, h: 0.16, x: 0.13, wrap: 0.16, tilt: 0.05 }, grille: { t: 'hbars', w: 0.45, chrome: true, n: 3 }, bumper: 'grey', tail: { t: 'pillar', w: 0.1, h: 0.46, low: 0.0 }, wheels: [1, 0], noVisor: true } });
add('mova', { brand: 'hoshida', name: 'Mova', cls: 'van', fam: 'van', ref: 'compact semi-cab-over light van used by small businesses',
  len: 4.045, wid: 1.665, hgt: 1.93, wheelR: 0.31, maxSpeed: 32, accel: 4.0, mass: 1300, seats: 5, steer: 0.52, colors: PAL.work,
  b: { L: 4.045, sill: 0.32, fo: 0.55, wb: 2.65, bump: 0.54, fy: 0.66, hd: 0.06, hy: 0.92, cd: 0.28, cy: 1.0, wd: 0.78, roof: 1.92, rd: 0.04, bd: 0.03, by: 1.06, gy1: 1.86, ty: 1.0, tm: 0.56, door: [1.62, 0.85], slide: [0.82, -0.25], pB: 0.83 },
  cab: { seatY: 0.72, sz: 0.98, rows: [[-0.2, 3]] }, tp: [0.04, 0.02, 0.015], tumble: 0.88,
  S: { head: { t: 'rect', w: 0.28, h: 0.17, x: 0.12, tilt: -0.1 }, grille: { t: 'slot', w: 0.36 }, bumper: 'black', tail: { t: 'pillar', w: 0.09, h: 0.44, low: 0.0 }, wheels: [1], noVisor: true } });

// ======================================================================= pickups and trucks
add('taurex', { brand: 'hoshida', name: 'Taurex', cls: 'double cab', fam: 'pickup', ref: '8th-generation double-cab pickup — estates, contractors, politicians',
  len: 5.33, wid: 1.855, hgt: 1.815, wheelR: 0.385, maxSpeed: 42, accel: 5.8, mass: 2100, seats: 5, steer: 0.48, colors: ['#f2f2ee', '#c3c6ca', '#1a1b1e', '#55595e', '#8e1a20'],
  b: { L: 5.33, sill: 0.45, fo: 0.9, wb: 3.085, bump: 0.7, fy: 0.82, hd: 0.14, hy: 1.08, cd: 1.32, cy: 1.15, wd: 1.82, roof: 1.8, rd: 1.72, roofR: 1.79, bd: 1.62, by: 1.16, gy1: 1.7, ty: 1.12, tm: 0.7, door: [1.25, 0.3], rearDoor: [0.27, -0.62], bed: { floor: 0.88 } },
  cab: { seatY: 0.68, sz: 0.48, rows: [[-0.4, 3]] },
  S: { head: { t: 'slim', w: 0.36, h: 0.11, x: 0.16, wrap: 0.22, tilt: 0.08 }, grille: { t: 'trapezoid', w: 0.5, chrome: true, n: 2, hex: true }, lower: { t: 'mesh', w: 0.5, h: 0.1 }, tail: { t: 'bedpost', w: 0.1, h: 0.36 }, step: true, sportsBar: 'v', tailgateWord: true, wheels: [0, 2] } });
add('bhoomimaxi', { brand: 'vardhan', name: 'Bhoomi Maxi', cls: 'pickup', fam: 'pickup', ref: 'Indian single-cab utility pickup carrying produce and goods',
  len: 4.645, wid: 1.69, hgt: 1.86, wheelR: 0.34, maxSpeed: 34, accel: 4.0, mass: 1650, seats: 2, steer: 0.5, colors: ['#f2f2ee', '#c3c6ca', '#eeeeea'],
  b: { L: 4.645, sill: 0.5, fo: 0.62, wb: 2.5, bump: 0.66, fy: 0.8, hd: 0.06, hy: 1.08, cd: 1.08, cy: 1.12, wd: 1.32, roof: 1.84, rd: 2.42, roofR: 1.84, bd: 2.32, by: 1.16, gy1: 1.78, ty: 1.12, tm: 0.72, door: [1.1, 0.24], bed: { floor: 0.84 } },
  cab: { seatY: 0.74, sz: 0.37, rows: [] }, tp: [0.05, 0.02, 0.015], tumble: 0.88,
  S: { head: { t: 'rect', w: 0.28, h: 0.15, x: 0.15, tilt: -0.1 }, grille: { t: 'vslats', w: 0.4, chrome: true }, bumper: 'black', tail: { t: 'bedpost', w: 0.1, h: 0.2 }, flares: true, dropSides: true, wheels: [1], noVisor: true } });
add('tara', { brand: 'vardhan', name: 'Tara', cls: 'mini truck', fam: 'truck', ref: 'Indian 4-wheel mini truck with a drop-side deck',
  len: 3.8, wid: 1.5, hgt: 1.845, wheelR: 0.27, maxSpeed: 26, accel: 3.0, mass: 900, seats: 2, steer: 0.58, colors: ['#f2f2ee', '#2a5a9a', '#e0b52a', '#2f6b43'],
  truck: { cabL: 1.32, floor: 0.55, roof: 1.84, belt: 1.08, wsTop: 1.72, wsRake: 0.3, nose: 0.06, wf: 1.36, wr: -0.74, deck: 'drop', deckY: 0.72, side: 0.32, deckW: 0.745, seatY: 0.8, sx: 0.32, cabW: 0.75, lamps: 'low' },
  sound: 'car', entry: 'bus' });
add('hakobi', { brand: 'daikan', name: 'Hakobi', cls: 'light truck', fam: 'truck', ref: 'Japanese 3-tonne cab-over light truck with aluminium box or drop-side body',
  len: 5.6, wid: 1.9, hgt: 2.6, wheelR: 0.37, maxSpeed: 26, accel: 2.6, mass: 3500, seats: 2, steer: 0.47, colors: ['#f2f2ee', '#2b5c9a', '#2a6b4a', '#a8151d'],
  truck: { cabL: 1.62, floor: 0.88, roof: 2.25, belt: 1.48, wsTop: 2.08, wsRake: 0.18, nose: 0.04, wf: 1.75, wr: -1.6, deck: 'box', deckY: 1.0, side: 1.6, deckW: 0.95, seatY: 1.18, sx: 0.4, cabW: 0.88, lamps: 'bumper', dual: true },
  sound: 'bus', entry: 'bus' });

// ------------------------------------------------------------------------------------------------ assemble
const SOUND = { car: 'car', sedan: 'car', suv: 'van', van: 'van', pickup: 'van', truck: 'bus' };
const ENTRY = { car: 'car', sedan: 'car', suv: 'van', van: 'van', pickup: 'van', truck: 'bus' };
export const CATALOG = {};
for (const [id, o] of M) {
  const t = { len: o.len, wid: o.wid, hgt: o.hgt, wheelR: o.wheelR, maxSpeed: o.maxSpeed, accel: o.accel, mass: o.mass, seats: o.seats, steer: o.steer,
    sound: o.sound || SOUND[o.fam], entry: o.entry || ENTRY[o.fam], colors: o.colors, family: o.fam, make: o.brand, model: o.name, cls: o.cls, ref: o.ref, catalog: true };
  if (o.b) t.body = body(o.b); if (o.cab) t.cab = o.cab; if (o.S) t.style = o.S; if (o.truck) t.truck = o.truck;
  for (const k of ['tp', 'tumble', 'bevel', 'upright']) if (o[k] !== undefined) t[k] = o[k];
  CATALOG[id] = t;
}
export const SUV_IDS = M.filter(([, o]) => o.fam === 'suv').map(([id]) => id);
export const OTHER_IDS = M.filter(([, o]) => o.fam !== 'suv').map(([id]) => id);
export const displayName = (type, T) => (T && T.make ? `${BRANDS[T.make].name} ${T.model}` : type);
export const HEAVY_SOUND = new Set(Object.keys(CATALOG).filter((k) => CATALOG[k].sound === 'bus'));
// big enough to be kept off the narrow lanes (level 3+ streets) like buses and lorries
export const NO_LANES = new Set(Object.keys(CATALOG).filter((k) => CATALOG[k].len > 5.2 || CATALOG[k].hgt > 2.4));
export const isHeavy = (type) => type === 'bus' || type === 'pbus' || type === 'lorry' || HEAVY_SOUND.has(type);
export const vehicleClass = (type) => { const T = CATALOG[type]; return T ? (T.cls === 'classic' ? 'classic car' : T.cls) : null; };

// Traffic weights per district (relative; Traffic.js mixes them with the original generic types). Colombo traffic is
// dominated by tuk-tuks, kei cars and small hybrids, vans and pickups; trucks gather at the port.
export const TRAFFIC_W = {
  default: { tora: 4, nippa: 2.5, sathi: 1, chhoti: 0.4, hopper: 0.6, kargo: 1, pico: 0.8, pixa: 2.5, mizu: 2.5, kobi: 1.6, rizo: 1.2, lumo: 0.6, kecil: 0.8,
    ventra: 2, solace: 1.4, ecora: 1.6, elana: 0.8, arlen: 1, lanzo: 0.8, wren: 0.15, praetor: 0.4, arco: 0.6, workline: 1.4, doruka: 1.6, haruto: 1, mova: 0.8,
    taurex: 1.6, bhoomimaxi: 1.2, tara: 1.6, hakobi: 1.2, bastion: 0.5, kaizan: 0.8, varuna: 0.4, warden: 0.25, ezra: 1.8, kivo: 1, trevan: 0.6, bhoomi: 0.6, kito: 0.3, tarvo: 0.7 },
  port: { tara: 6, hakobi: 9, bhoomimaxi: 5, taurex: 3, mova: 3, kargo: 2, workline: 3, doruka: 2 },
  cinnamon: { praetor: 2, kaizan: 2.5, tarvo: 2, ezra: 3, kivo: 2, trevan: 1.5, varuna: 1, warden: 0.6, solace: 3, ecora: 2.5, elana: 1.5, arco: 1.2, mizu: 2, pixa: 1.5, tora: 2, lumo: 1, kobi: 1.4, taurex: 1.2, ventra: 2 },
};
// parked at the kerb (residential / commercial streets)
export const PARKED_W = { tora: 2, nippa: 1, pixa: 1.2, mizu: 1.2, kobi: 0.8, ventra: 1, solace: 0.6, ecora: 0.8, ezra: 0.9, kaizan: 0.3, tarvo: 0.3, taurex: 0.6, workline: 0.5, doruka: 0.6, arlen: 0.5, sathi: 0.4, tara: 0.6, rizo: 0.5, hopper: 0.3, kecil: 0.4, pico: 0.4, lumo: 0.3, kivo: 0.4, bhoomi: 0.3, lanzo: 0.3, elana: 0.3, wren: 0.08, praetor: 0.2, arco: 0.3, bastion: 0.2, kito: 0.15, warden: 0.1, varuna: 0.2, trevan: 0.3, chhoti: 0.2, kargo: 0.4, mova: 0.4, haruto: 0.4, bhoomimaxi: 0.4, hakobi: 0.3 };
