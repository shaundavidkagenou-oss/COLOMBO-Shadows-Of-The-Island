// The Velvet Monsoon's sound system and back bar (58th) — club-local geometry drawn with the RoomKit (merged per material,
// so all of this adds only a handful of draw calls):
//   paStack     ground stack either side of the stage: a double-18" sub (port slots, handles, steel corners, perforated
//               grille with the cones' surrounds showing through) under a two-way top on a speaker pole (15" + horn)
//   lineArray   flown array: rigging frame on two chain hoists, four splayed cabinets in a J curve, side rigging links
//   fillSpeaker small two-way box on a U-yoke wall/ceiling bracket, aimed down at its part of the room
//   djBooth     the DJ's console: two media players (jog wheel with centre display, screen, play / cue, tempo fader), a
//               four-channel mixer (gain / EQ knobs, line faders, crossfader, level meters), laptop on a stand, headphones,
//               booth monitors on stands either side, cable loom
//   bottles     back-bar spirits in real bottle shapes (lathe profiles: whisky, arrack, rum, vodka, gin, liqueur, wine,
//               sparkling, tequila…), tinted glass with the drink inside, wrap-around labels (fictional names, one atlas),
//               screw caps / corks / foil
// Positions match ClubSound's CLUB_PA (the sound comes out of these boxes).
import * as THREE from 'three';
import { canvasTex, rnd } from './RoomKit.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
let MATS = null;
export function paMats(k) {
  if (!MATS) {
    const perf = canvasTex('paPerf', 64, 64, (a, w, h) => { a.fillStyle = '#2a2a2c'; a.fillRect(0, 0, w, h); a.fillStyle = '#050505'; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { a.beginPath(); a.arc(x * 8 + 4 + (y % 2) * 4 - 2, y * 8 + 4, 2.6, 0, 6.29); a.fill(); } }, { repeat: true });
    perf.repeat.set(1, 1);
    const atlas = canvasTex('btlLabels', 512, 512, drawLabels);
    MATS = {
      paCab: std({ color: 0x141416, roughness: 0.82, metalness: 0.0 }), // textured (polyurea) birch cabinets
      paGrille: std({ color: 0x3a3a3e, map: perf, roughness: 0.55, metalness: 0.6 }),
      paSteel: std({ color: 0x1c1c1e, roughness: 0.45, metalness: 0.7 }),
      paCone: std({ color: 0x0c0c0d, roughness: 0.95 }),
      paHorn: std({ color: 0x0a0a0b, roughness: 0.35, metalness: 0.2 }),
      paChain: std({ color: 0x9a9ca0, roughness: 0.35, metalness: 0.9 }),
      djTop: std({ color: 0x1a1b1e, roughness: 0.4, metalness: 0.35 }), djJog: std({ color: 0x0e0e10, roughness: 0.25, metalness: 0.6 }),
      djScreen: std({ color: 0x02060c, emissive: 0x4aa8ff, emissiveIntensity: 0.9, roughness: 0.2 }),
      djBtnG: std({ color: 0x021004, emissive: 0x3aff70, emissiveIntensity: 1.2 }), djBtnO: std({ color: 0x100600, emissive: 0xff9a2a, emissiveIntensity: 1.2 }),
      djKnob: std({ color: 0x2c2c30, roughness: 0.5 }), djCap: std({ color: 0xd8d8dc, roughness: 0.4 }),
      // bottles: tinted glass (seen through) over the drink, labels from one atlas
      glAmber: std({ color: 0xb87a2a, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.42, envMapIntensity: 1.3 }),
      glGreen: std({ color: 0x2f6a34, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.6, envMapIntensity: 1.3 }),
      glClear: std({ color: 0xdfeef0, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.26, envMapIntensity: 1.4 }),
      glBlue: std({ color: 0x2a4ea8, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.55, envMapIntensity: 1.3 }),
      glDark: std({ color: 0x1a1410, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.85, envMapIntensity: 1.2 }),
      liqWhisky: std({ color: 0x8a4a10, roughness: 0.15, emissive: 0x2a1000, emissiveIntensity: 0.4 }), liqRum: std({ color: 0x4a1c06, roughness: 0.15 }),
      liqClear: std({ color: 0xb8c8cc, roughness: 0.1, transparent: true, opacity: 0.35 }), liqGreen: std({ color: 0x2a5a18, roughness: 0.15 }),
      liqCream: std({ color: 0xc8a878, roughness: 0.4 }), liqRed: std({ color: 0x3a0610, roughness: 0.15 }), liqBlue: std({ color: 0x1a60c0, roughness: 0.15, emissive: 0x05204a, emissiveIntensity: 0.5 }),
      label: std({ map: atlas, roughness: 0.7 }), cork: std({ color: 0x8a6a44, roughness: 0.9 }), foil: std({ color: 0xc8a050, roughness: 0.3, metalness: 0.9 }),
      capBlack: std({ color: 0x0e0e0e, roughness: 0.4, metalness: 0.3 }), capGold: std({ color: 0xb08a3a, roughness: 0.3, metalness: 0.85 }), capRed: std({ color: 0x8a1018, roughness: 0.35, metalness: 0.5 }),
    };
  }
  for (const [n, m] of Object.entries(MATS)) k.def(n, m);
}

// ------------------------------------------------------------------ labels (original, fictional names)
const LABELS = [
  ['OLD KANDY', 'RESERVE WHISKY', '#efe4c8', '#5a1a10', '#b08a3a'], ['CEYLON PALM', 'COCONUT ARRACK', '#f4efe2', '#1d4a2a', '#c8a050'], ['KELANI GOLD', 'DARK RUM', '#1a120c', '#e0b050', '#e0b050'], ['NORTH STAR', 'VODKA', '#f6f6f8', '#123c7a', '#9aa6b8'],
  ['MONSOON', 'DRY GIN', '#e8f1ec', '#1c5a50', '#2a8a7a'], ['SILVER REEF', 'BLANCO', '#f2f2ee', '#3a3a3a', '#a0a0a0'], ['KOPI', 'COFFEE LIQUEUR', '#2a1a10', '#f0dcb0', '#c89a50'], ['RED ESTATE', 'SHIRAZ 2023', '#f2ead8', '#6a0a18', '#6a0a18'],
  ['CUVÉE BLANCHE', 'BRUT', '#101010', '#d8b060', '#d8b060'], ['HILL COUNTRY', 'SINGLE MALT', '#e8dcc0', '#2a2018', '#8a6a3a'], ['GALLE FORT', 'SPICED RUM', '#f0e2c0', '#7a2a10', '#a03a18'], ['LAGOON', 'BLUE CURAÇAO', '#e8f4fa', '#0a4aa0', '#0a4aa0'],
  ['WHITE SANDS', 'COCONUT RUM', '#ffffff', '#2a7a5a', '#e0c070'], ['ADAM\'S PEAK', 'BLENDED WHISKY', '#1a1a1a', '#d0b070', '#d0b070'], ['TRINCO', 'TRIPLE SEC', '#fbf2e0', '#c05a10', '#c05a10'], ['EMERALD', 'MINT LIQUEUR', '#e6f2e2', '#1a6a2a', '#1a6a2a'],
  ['NUWARA', 'CREAM LIQUEUR', '#2a1814', '#e8d0a8', '#c8a060'], ['SIGIRIYA', 'XO BRANDY', '#14100c', '#c89a40', '#c89a40'], ['PEARL BAY', 'LONDON GIN', '#f4f8fa', '#2a3a6a', '#7a8ab0'], ['MATARA', 'AGED ARRACK', '#efe0b8', '#3a1a0a', '#8a5a20'],
];
function drawLabels(a, w, h) {
  const cw = 128, ch = 64; a.fillStyle = '#ddd'; a.fillRect(0, 0, w, h);
  LABELS.forEach(([t1, t2, bg, fg, ac], i) => { const x = (i % 4) * cw, y = Math.floor(i / 4) * ch; a.fillStyle = bg; a.fillRect(x, y, cw, ch);
    a.strokeStyle = ac; a.lineWidth = 2; a.strokeRect(x + 20, y + 5, cw - 40, ch - 10); a.lineWidth = 1; a.strokeRect(x + 23, y + 8, cw - 46, ch - 16);
    a.fillStyle = fg; a.textAlign = 'center'; a.font = '700 13px Georgia, serif'; a.fillText(t1, x + cw / 2, y + 28, cw - 50); a.fillStyle = ac === fg ? fg : ac; a.font = '600 8px "Arial Narrow", Arial, sans-serif'; a.fillText(t2, x + cw / 2, y + 41, cw - 50);
    a.fillStyle = fg; a.globalAlpha = 0.6; a.font = '6px Arial, sans-serif'; a.fillText('700 ml · 40% vol', x + cw / 2, y + 51); a.globalAlpha = 1; });
}
function labelBand(k, cell, r, y0, y1, x, z) { // wrap-around label on the front ~200° of a round bottle, cell = atlas index
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, 20, 1, true, -1.75, 3.5); const uv = g.attributes.uv; const u0 = (cell % 4) / 4, v0 = 1 - (Math.floor(cell / 4) + 1) / 8;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.25, v0 + uv.getY(i) * 0.125);
  k.geo('label', g, x, (y0 + y1) / 2, z);
}
// bottle shapes: outer profile [r, y] from the base up, body radius, label band, cap / closure, glass, drink and fill height
const SHAPES = {
  whisky: { p: [[0, 0.003], [0.036, 0], [0.04, 0.006], [0.04, 0.165], [0.037, 0.186], [0.022, 0.208], [0.0145, 0.222], [0.0145, 0.262], [0.0162, 0.265]], r: 0.04, lab: [0.05, 0.14], cap: ['capBlack', 0.017, 0.032], gl: 'glAmber', liq: 'liqWhisky', fill: 0.15, labs: [0, 9, 13] },
  arrack: { p: [[0, 0.003], [0.034, 0], [0.037, 0.006], [0.037, 0.19], [0.032, 0.215], [0.017, 0.245], [0.0135, 0.26], [0.0135, 0.29], [0.015, 0.293]], r: 0.037, lab: [0.05, 0.15], cap: ['capGold', 0.0155, 0.028], gl: 'glClear', liq: 'liqWhisky', fill: 0.17, labs: [1, 19] },
  rum: { p: [[0, 0.003], [0.037, 0], [0.041, 0.008], [0.041, 0.16], [0.036, 0.182], [0.02, 0.205], [0.016, 0.215], [0.016, 0.25], [0.0178, 0.253]], r: 0.041, lab: [0.045, 0.135], cap: ['capBlack', 0.0185, 0.03], gl: 'glDark', liq: 'liqRum', fill: 0.14, labs: [2, 10] },
  vodka: { p: [[0, 0.003], [0.033, 0], [0.036, 0.006], [0.036, 0.225], [0.03, 0.245], [0.016, 0.268], [0.0125, 0.278], [0.0125, 0.31], [0.0142, 0.313]], r: 0.036, lab: [0.07, 0.17], cap: ['capRed', 0.0145, 0.03], gl: 'glClear', liq: 'liqClear', fill: 0.2, labs: [3, 5] },
  gin: { p: [[0, 0.003], [0.042, 0], [0.046, 0.008], [0.046, 0.14], [0.042, 0.158], [0.024, 0.175], [0.018, 0.182], [0.018, 0.212], [0.02, 0.215]], r: 0.046, lab: [0.035, 0.12], cap: ['capGold', 0.021, 0.03], gl: 'glGreen', liq: 'liqClear', fill: 0.125, labs: [4, 18] },
  liqueur: { p: [[0, 0.003], [0.03, 0], [0.045, 0.02], [0.05, 0.07], [0.046, 0.12], [0.03, 0.155], [0.0135, 0.175], [0.0135, 0.215], [0.015, 0.218]], r: 0.05, lab: [0.045, 0.1], cap: ['capBlack', 0.016, 0.028], gl: 'glDark', liq: 'liqCream', fill: 0.11, labs: [6, 16], bulb: true },
  wine: { p: [[0, 0.012], [0.03, 0.002], [0.037, 0], [0.037, 0.19], [0.034, 0.215], [0.017, 0.245], [0.0135, 0.258], [0.0135, 0.3], [0.0148, 0.302]], r: 0.037, lab: [0.05, 0.13], cap: ['foil', 0.0152, 0.05], gl: 'glGreen', liq: 'liqRed', fill: 0.2, labs: [7] },
  sparkling: { p: [[0, 0.02], [0.036, 0.004], [0.044, 0], [0.044, 0.16], [0.04, 0.2], [0.022, 0.248], [0.0145, 0.27], [0.0145, 0.3], [0.017, 0.304]], r: 0.044, lab: [0.05, 0.12], cap: ['foil', 0.0175, 0.07], gl: 'glGreen', liq: 'liqGreen', fill: 0.18, labs: [8] },
  tequila: { p: [[0, 0.003], [0.034, 0], [0.039, 0.008], [0.036, 0.15], [0.03, 0.17], [0.017, 0.188], [0.017, 0.215], [0.023, 0.218]], r: 0.038, lab: [0.04, 0.12], cap: ['cork', 0.021, 0.03], gl: 'glClear', liq: 'liqClear', fill: 0.14, labs: [5, 14] },
  curacao: { p: [[0, 0.003], [0.033, 0], [0.036, 0.006], [0.036, 0.2], [0.03, 0.222], [0.015, 0.25], [0.0125, 0.262], [0.0125, 0.29], [0.014, 0.292]], r: 0.036, lab: [0.06, 0.15], cap: ['capBlack', 0.0145, 0.026], gl: 'glClear', liq: 'liqBlue', fill: 0.19, labs: [11, 15, 12] },
};
const ORDER = Object.keys(SHAPES);
export function bottle(k, type, x, y, z, cell = -1, fill = 1) {
  const S = SHAPES[type]; const top = S.p[S.p.length - 1][1];
  k.lathe(S.gl, S.p, x, y, z, { seg: 20 });
  const fh = S.fill * fill; if (fh > 0.01) { if (S.bulb) k.lathe(S.liq, [[0, 0.006], [0.027, 0.006], [0.041, 0.022], [0.045, 0.07], [0.042, Math.min(fh, 0.11)], [0, Math.min(fh, 0.11)]], x, y, z, { seg: 16 }); else k.cyl(S.liq, S.r * 0.9, S.r * 0.9, fh - 0.006, x, y + 0.006 + (fh - 0.006) / 2, z, { seg: 16 }); }
  const lab = cell >= 0 ? cell : S.labs[0]; labelBand(k, lab, S.r + 0.0009, y + S.lab[0], y + S.lab[1], x, z);
  const [ck, cr, chh] = S.cap; if (ck === 'cork') { k.cyl('cork', cr, cr, chh, x, y + top + chh / 2 - 0.004, z, { seg: 14 }); k.cyl('capBlack', cr + 0.004, cr + 0.004, 0.008, x, y + top + chh - 0.002, z, { seg: 16 }); }
  else if (ck === 'foil') k.cyl('foil', cr, cr * 1.12, chh, x, y + top - chh / 2 + 0.004, z, { seg: 14 });
  else { k.cyl(ck, cr, cr, chh, x, y + top + chh / 2 - 0.006, z, { seg: 14 }); k.torus(ck, cr, 0.0015, x, y + top - 0.004, z, { rx: Math.PI / 2, ts: 16, rs: 4 }); }
  return S.r;
}
// a back-bar shelf of bottles along local x (labels face local +z), varied types, the odd gap and a few part-empty bottles
export function bottleShelf(k, x0, x1, y, z, seed) {
  const r = rnd(seed); let x = x0;
  while (x < x1) { const type = ORDER[Math.floor(r() * ORDER.length)]; const S = SHAPES[type]; if (x + S.r * 2 > x1) break; const cell = S.labs[Math.floor(r() * S.labs.length)];
    bottle(k, type, x + S.r, y, z + (r() - 0.5) * 0.03, cell, r() < 0.25 ? 0.3 + r() * 0.5 : 1); x += S.r * 2 + 0.012 + r() * 0.02; if (r() < 0.06) x += 0.08; }
}

// ------------------------------------------------------------------ speakers
// ground stack: origin on the floor at the stack's centre, front = local +z
export function paStack(k) {
  // double-18 sub 1.1 w × 0.6 h × 0.75 d
  k.box('paCab', 1.1, 0.6, 0.75, 0, 0.3, 0, { r: 0.012 }); k.box('paGrille', 1.04, 0.5, 0.012, 0, 0.33, 0.37);
  for (const s of [-1, 1]) { k.torus('paCone', 0.2, 0.018, s * 0.26, 0.33, 0.355, { ts: 28, rs: 6 }); k.cyl('paCone', 0.19, 0.06, 0.06, s * 0.26, 0.33, 0.33, { rx: Math.PI / 2, seg: 24, open: true }); }
  for (const s of [-1, 1]) { k.box('paHorn', 0.42, 0.03, 0.02, s * 0.27, 0.05, 0.37); k.box('paSteel', 0.14, 0.03, 0.06, s * 0.555, 0.42, 0.05); k.box('paSteel', 0.02, 0.07, 0.14, s * 0.56, 0.42, 0.05); } // port slots, side handles
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) k.box('paSteel', 0.05, 0.05, 0.05, sx * 0.53, sy * 0.56 + 0.02, sz * 0.355, { r: 0.01 }); // steel corners
  // pole socket + pole + two-way top (15" + 1.4" horn) 0.48 w × 0.78 h × 0.44 d
  k.cyl('paSteel', 0.03, 0.03, 0.03, 0, 0.615, 0, { seg: 14 }); k.cyl('chrome', 0.0175, 0.0175, 0.62, 0, 0.92, 0, { seg: 12 });
  k.push(0, 1.6, 0.02, 0, -0.06);
  k.box('paCab', 0.48, 0.78, 0.44, 0, 0, 0, { r: 0.015 }); k.box('paGrille', 0.44, 0.74, 0.012, 0, 0, 0.222);
  k.torus('paCone', 0.17, 0.014, 0, -0.13, 0.21, { ts: 26, rs: 6 }); k.cyl('paCone', 0.16, 0.05, 0.05, 0, -0.13, 0.19, { rx: Math.PI / 2, seg: 22, open: true });
  k.box('paHorn', 0.34, 0.16, 0.02, 0, 0.24, 0.205); k.box('paCone', 0.3, 0.12, 0.01, 0, 0.24, 0.198); // waveguide
  for (const s of [-1, 1]) k.box('paSteel', 0.02, 0.05, 0.12, s * 0.245, 0.1, 0);
  k.pop();
  k.block(0, 0, 1.15, 0.8);
}
// flown line array: frame top at local y 0 (hung below the hoist chains), cabinets below; front = +z, splay grows downwards
export function lineArray(k, chainLen = 0.6) {
  for (const s of [-1, 1]) { k.cyl('paChain', 0.008, 0.008, chainLen, s * 0.3, chainLen / 2, 0, { seg: 6 }); k.box('paSteel', 0.12, 0.16, 0.12, s * 0.3, chainLen + 0.08, 0, { r: 0.01 }); } // chains + hoist motors
  k.box('paSteel', 0.8, 0.05, 0.5, 0, -0.025, 0); k.box('paSteel', 0.04, 0.05, 0.62, 0, -0.025, 0.03); // grid
  let y = -0.05, z = 0, a = 0;
  for (let i = 0; i < 4; i++) { a += [0.02, 0.05, 0.09, 0.14][i]; const h = 0.23; k.push(0, y - h / 2 * Math.cos(a), z + h / 2 * Math.sin(a), 0, a);
    k.box('paCab', 0.72, h - 0.008, 0.46, 0, 0, 0, { r: 0.01 }); k.box('paGrille', 0.7, h - 0.03, 0.01, 0, 0, 0.231);
    for (const s of [-1, 1]) { k.box('paSteel', 0.012, h, 0.14, s * 0.365, 0, -0.14); k.cyl('paSteel', 0.006, 0.006, 0.02, s * 0.372, h * 0.38, -0.18, { rz: Math.PI / 2, seg: 6 }); } // rigging plates + pins
    k.pop(); y -= h * Math.cos(a); z += h * Math.sin(a); }
}
// fill: small two-way box on a U-yoke; origin at the bracket's wall/ceiling plate, box aimed by tilt (down) about local x
export function fillSpeaker(k, tilt = 0.35, ceiling = false) {
  if (ceiling) { k.cyl('paSteel', 0.05, 0.05, 0.01, 0, 0, 0, { seg: 14 }); k.cyl('paSteel', 0.012, 0.012, 0.2, 0, -0.1, 0, { seg: 8 }); k.push(0, -0.33, 0, 0, tilt); }
  else { k.box('paSteel', 0.12, 0.16, 0.012, 0, 0, 0.006); k.box('paSteel', 0.03, 0.03, 0.2, 0, 0, 0.1); k.push(0, -0.05, 0.3, 0, tilt); }
  k.box('paSteel', 0.36, 0.02, 0.03, 0, 0.12, 0); for (const s of [-1, 1]) k.box('paSteel', 0.015, 0.2, 0.03, s * 0.175, 0.02, 0); // yoke
  k.box('paCab', 0.3, 0.46, 0.27, 0, -0.06, 0.02, { r: 0.012 }); k.box('paGrille', 0.28, 0.44, 0.01, 0, -0.06, 0.156);
  k.pop();
}

// ------------------------------------------------------------------ DJ console top (origin: centre of the console top, front edge = +z towards the room; the DJ stands at −z)
export function djConsole(k) {
  const player = (x) => { k.push(x, 0, 0, Math.PI, -0.06);
    k.box('djTop', 0.32, 0.1, 0.41, 0, 0.05, 0, { r: 0.012 }); const ty = 0.1;
    k.cyl('djJog', 0.105, 0.105, 0.025, 0, ty + 0.012, 0.03, { seg: 36 }); k.torus('chrome', 0.105, 0.004, 0, ty + 0.025, 0.03, { rx: Math.PI / 2, ts: 36, rs: 4 }); k.cyl('djScreen', 0.035, 0.035, 0.003, 0, ty + 0.026, 0.03, { seg: 24 }); // jog wheel + centre display
    for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; k.box('djKnob', 0.004, 0.003, 0.012, Math.sin(a) * 0.09, ty + 0.0255, 0.03 + Math.cos(a) * 0.09, { ry: a }); } // grip dimples
    k.box('djScreen', 0.2, 0.004, 0.09, 0, ty + 0.002, -0.14); k.box('djTop', 0.22, 0.02, 0.11, 0, ty - 0.004, -0.14);
    k.cyl('djBtnG', 0.018, 0.018, 0.008, -0.12, ty + 0.004, 0.16, { seg: 16 }); k.cyl('djBtnO', 0.018, 0.018, 0.008, -0.12, ty + 0.004, 0.11, { seg: 16 }); // play / cue
    k.box('paCone', 0.012, 0.004, 0.16, 0.13, ty + 0.001, 0.05); k.box('djCap', 0.03, 0.012, 0.016, 0.13, ty + 0.008, 0.06); // tempo fader
    for (let i = 0; i < 4; i++) k.box('djKnob', 0.03, 0.006, 0.018, -0.09 + i * 0.06, ty + 0.003, -0.075); // hot-cue pads
    k.pop(); };
  player(-0.42); player(0.42);
  k.push(0, 0, 0, Math.PI); // mixer
  k.box('djTop', 0.33, 0.09, 0.41, 0, 0.045, 0, { r: 0.01 }); const ty = 0.09;
  for (let c = 0; c < 4; c++) { const x = -0.12 + c * 0.08;
    for (let r = 0; r < 5; r++) { k.cyl('djKnob', 0.011, 0.012, 0.016, x, ty + 0.008, -0.16 + r * 0.045, { seg: 12 }); k.box('djCap', 0.002, 0.004, 0.008, x, ty + 0.017, -0.163 + r * 0.045); } // gain / EQ / filter
    k.box('paCone', 0.006, 0.003, 0.09, x, ty + 0.001, 0.115); k.box('djCap', 0.022, 0.014, 0.012, x, ty + 0.008, 0.1 + (c % 2) * 0.02); // line fader
    for (let m = 0; m < 6; m++) k.box(m > 3 ? 'djBtnO' : 'djBtnG', 0.008, 0.003, 0.006, x + 0.03, ty + 0.002, 0.15 - m * 0.012); } // meters
  k.box('paCone', 0.12, 0.003, 0.008, 0, ty + 0.001, 0.185); k.box('djCap', 0.014, 0.014, 0.024, 0.02, ty + 0.008, 0.185); // crossfader
  k.pop();
  // laptop on a stand to the right, headphones on the console
  k.push(0.86, 0, -0.05, Math.PI + 0.2); k.box('paSteel', 0.012, 0.12, 0.012, -0.1, 0.06, 0.08); k.box('paSteel', 0.012, 0.12, 0.012, 0.1, 0.06, 0.08); k.box('paSteel', 0.26, 0.012, 0.22, 0, 0.12, 0.02, { rx: 0.25 });
  k.box('djTop', 0.32, 0.012, 0.22, 0, 0.135, 0.02, { rx: 0.25 }); k.push(0, 0.16, -0.08, 0, 1.75); k.box('djTop', 0.32, 0.21, 0.008, 0, 0.105, 0); k.box('djScreen', 0.29, 0.18, 0.002, 0, 0.105, -0.005); k.pop(); k.pop();
  k.push(-0.2, 0.1, 0.17, 0.3); k.torus('blackP', 0.085, 0.009, 0, 0.05, 0, { arc: Math.PI, ts: 18, rs: 6 }); for (const s of [-1, 1]) k.cyl('blackP', 0.04, 0.04, 0.03, s * 0.085, 0.015, 0, { rz: Math.PI / 2, seg: 16 }); k.pop();
}
// booth monitor on a short stand, origin on the riser, faces local +z
export function boothMonitor(k) {
  k.cyl('paSteel', 0.12, 0.13, 0.02, 0, 0.01, 0, { seg: 16 }); k.cyl('paSteel', 0.018, 0.018, 0.86, 0, 0.44, 0, { seg: 10 });
  k.push(0, 1.05, 0, 0, -0.1); k.box('paCab', 0.3, 0.42, 0.28, 0, 0, 0, { r: 0.012 }); k.box('paGrille', 0.28, 0.4, 0.01, 0, 0, 0.142); k.pop();
}
