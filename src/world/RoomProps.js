// Detailed furniture and small objects for the hero rooms (built with RoomKit). Each builder models the object around its
// own origin (floor / surface contact at y = 0, front facing +z) under the kit's current transform.
import * as THREE from 'three';
import { canvasTex, woodTex, fabricTex, paintedMetalTex, rnd, speckle, blotches } from './RoomKit.js';

const std = (o) => new THREE.MeshStandardMaterial(o);
// common materials (registered per kit; one merged mesh per key)
export function baseMats(k) {
  k.def('teak', std({ map: woodTex('teak', '#5a3720', '#2e1a0e', { light: '#7a5030' }), roughness: 0.55 }));
  k.def('pine', std({ map: woodTex('pine', '#b98b57', '#7a5430', { light: '#d6a974', seed: 9 }), roughness: 0.6 }));
  k.def('ply', std({ map: woodTex('ply', '#a07850', '#5e3f22', { seed: 13 }), roughness: 0.7 }));
  k.def('chrome', std({ color: 0xd8dadc, metalness: 1, roughness: 0.18 }));
  k.def('steel', std({ color: 0x8d9297, metalness: 0.85, roughness: 0.4 }));
  k.def('brass', std({ color: 0xc8a050, metalness: 1, roughness: 0.3 }));
  k.def('blackP', std({ color: 0x141414, roughness: 0.45 }));
  k.def('greyP', std({ color: 0x5b5e62, roughness: 0.5 }));
  k.def('whiteP', std({ color: 0xeeeeea, roughness: 0.42 }));
  k.def('rubber', std({ color: 0x1b1b1b, roughness: 0.9 }));
  k.def('paper', std({ color: 0xf1ede2, roughness: 0.9 }));
  k.def('glass', std({ color: 0xcfe6ea, transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0, depthWrite: false }));
  k.def('mirror', std({ color: 0xc9d4d8, metalness: 0.85, roughness: 0.1, emissive: 0x1a2024 }));
  k.def('cable', std({ color: 0x202020, roughness: 0.6 }));
  k.def('cableW', std({ color: 0xe6e4dd, roughness: 0.55 }));
}
const labelMats = new Map();
export function label(k, key, tex, w, h, x, y, z, o = {}) { k.def('lab:' + key, std({ map: tex, roughness: o.rough ?? 0.75, metalness: 0, emissive: o.glow ? 0xffffff : 0x000000, emissiveMap: o.glow ? tex : null, emissiveIntensity: o.glow || 0, transparent: !!o.alpha, alphaTest: o.alpha ? 0.4 : 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide })); k.plane('lab:' + key, w, h, x, y, z, o); void labelMats; }

// cloth sheet draped over a box top: flat in the middle, folds falling over the edges, gentle rumples
export function drapeGeo(w, l, { over = 0.12, bump = 0.012, seed = 1, sx = 28, sz = 28, overW = null, overL = null } = {}) {
  const ow = overW ?? over, ol = overL ?? over; const g = new THREE.PlaneGeometry(w + ow * 2, l + ol * 2, sx, sz); g.rotateX(-Math.PI / 2); const p = g.attributes.position; const r = rnd(seed); const ph = [r() * 6, r() * 6, r() * 6];
  for (let i = 0; i < p.count; i++) { let x = p.getX(i), z = p.getZ(i); const ex = Math.max(0, Math.abs(x) - w / 2), ez = Math.max(0, Math.abs(z) - l / 2); let y = Math.sin(x * 9 + ph[0]) * Math.sin(z * 7 + ph[1]) * bump + Math.sin(x * 23 + z * 17 + ph[2]) * bump * 0.3;
    if (ex > 0 || ez > 0) { const e = Math.max(ex, ez); y -= e * 1.0; const fold = Math.sin((ex > ez ? z : x) * 26 + ph[0]) * 0.012 * Math.min(1, e * 8); if (ex > ez) x = Math.sign(x) * (w / 2 + ex * 0.12) + fold; else z = Math.sign(z) * (l / 2 + ez * 0.12) + fold; }
    p.setXYZ(i, x, y, z); }
  g.computeVertexNormals(); return g;
}
// a thin shape (shirt, sole…) extruded with a soft bevel
function extrude(shape, depth, bevel = 0.004) { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 }); g.translate(0, 0, -depth / 2); return g; }

// ------------------------------------------------------------------ beds
export function bed(k, { w = 0.95, l = 1.95, frame = 'wood', sheet, sheetKey = 'sheet', pillow = '#f2efe8', blanket = null, rumpled = false, headH = 0.95, seed = 1 } = {}) {
  k.def(sheetKey, std({ map: sheet, roughness: 0.92, side: THREE.DoubleSide }));
  k.def('mattress', std({ map: fabricTex('stripe', '#e9e4d8', '#9fb6c9', '#c7cfd6'), roughness: 0.95 }));
  k.def('pillowcase', std({ color: pillow, roughness: 0.95, map: fabricTex('plain', '#ffffff', '#fff', '#fff') }));
  const top = 0.4, mt = 0.17;
  if (frame === 'wood') {
    for (const [sx, sz, h] of [[-1, -1, headH], [1, -1, headH], [-1, 1, 0.62], [1, 1, 0.62]]) { const x = sx * (w / 2 + 0.03), z = sz * (l / 2 + 0.03); k.box('teak', 0.06, h, 0.06, x, h / 2, z, { r: 0.008 }); k.lathe('teak', [[0, 0], [0.032, 0], [0.036, 0.02], [0.022, 0.04], [0.03, 0.065], [0, 0.09]], x, h, z, { seg: 12 }); }
    for (const sz of [-1, 1]) k.box('teak', w + 0.06, 0.12, 0.03, 0, top - 0.06, sz * (l / 2 + 0.03), { r: 0.006 });
    for (const sx of [-1, 1]) k.box('teak', 0.03, 0.14, l, sx * (w / 2 + 0.03), top - 0.07, 0, { r: 0.006 });
    k.box('teak', w, headH - 0.5, 0.022, 0, 0.47 + (headH - 0.5) / 2, -l / 2 - 0.03); // headboard panel
    k.box('teak', w + 0.1, 0.05, 0.05, 0, headH - 0.06, -l / 2 - 0.03, { r: 0.012 }); // top rail
    for (let i = 0; i < 5; i++) k.box('teak', 0.04, headH - 0.62, 0.03, -w / 2 + (i + 0.5) * w / 5, 0.5 + (headH - 0.62) / 2, -l / 2 - 0.015, { r: 0.006 }); // spindles in front of the panel
    k.box('teak', w, 0.16, 0.022, 0, 0.47, l / 2 + 0.03); // footboard
  } else { // steel tube frame (powder coated)
    k.def('frameS', std({ color: 0x2b3440, metalness: 0.6, roughness: 0.42 }));
    for (const [sx, sz, h] of [[-1, -1, headH], [1, -1, headH], [-1, 1, 0.55], [1, 1, 0.55]]) { k.cyl('frameS', 0.019, 0.019, h, sx * w / 2, h / 2, sz * l / 2, { seg: 10 }); k.cyl('rubber', 0.022, 0.024, 0.02, sx * w / 2, 0.01, sz * l / 2, { seg: 10 }); }
    k.tube('frameS', [[-w / 2, headH, -l / 2], [-w / 4, headH + 0.07, -l / 2], [w / 4, headH + 0.07, -l / 2], [w / 2, headH, -l / 2]], 0.017, { n: 16 });
    for (let i = 1; i < 6; i++) k.cyl('frameS', 0.009, 0.009, headH - 0.5, -w / 2 + i * w / 6, 0.47 + (headH - 0.5) / 2, -l / 2, { seg: 8 });
    for (const sz of [-1, 1]) for (const y of [top - 0.04, sz < 0 ? 0.62 : 0.5]) k.cyl('frameS', 0.015, 0.015, w, 0, y, sz * l / 2, { rz: Math.PI / 2, seg: 10 });
    for (const sx of [-1, 1]) k.box('frameS', 0.03, 0.05, l, sx * w / 2, top - 0.05, 0);
  }
  k.box('ply', w - 0.02, 0.02, l - 0.02, 0, top - 0.01, 0); // base boards
  k.box('mattress', w - 0.03, mt, l - 0.03, 0, top + mt / 2, 0, { r: 0.045, seg: 3 });
  // fitted sheet: covers the top and wraps down the sides
  k.box(sheetKey, w - 0.01, mt * 0.55, l - 0.01, 0, top + mt - mt * 0.55 / 2 + 0.006, 0, { r: 0.04, seg: 3 });
  // pillows: soft flattened ellipsoids in cases
  const pw = w > 1.1 ? 2 : 1; for (let i = 0; i < pw; i++) { const px = pw === 1 ? 0 : (i - 0.5) * (w / 2); k.sph('pillowcase', 1, px, top + mt + 0.065, -l / 2 + 0.26, { sx: Math.min(0.3, w / (2 * pw) - 0.02), sy: 0.07, sz: 0.19, ry: (i - 0.5) * 0.08, ws: 20, hs: 12 }); }
  if (blanket) { k.def('blanket', std({ map: blanket, roughness: 0.95, side: THREE.DoubleSide }));
    if (rumpled) k.geo('blanket', drapeGeo(w - 0.04, l * 0.5, { overW: 0.24, overL: 0.02, bump: 0.02, seed }), 0, top + mt + 0.034, l * 0.18, 0, 0.1);
    else { k.geo('blanket', drapeGeo(w - 0.03, 0.5, { overW: 0.22, overL: 0.01, bump: 0.006, seed }), 0, top + mt + 0.012, l / 2 - 0.3); k.box('blanket', w * 0.6, 0.07, 0.34, 0, top + mt + 0.05, l / 2 - 0.3, { r: 0.03 }); } }
  k.block(0, 0, w + 0.12, l + 0.12);
}

// steel almirah (the grey-green Sri Lankan cupboard) with a mirror on the right door
export function almirah(k, { w = 0.9, h = 1.85, d = 0.5, color = '#6f8173', mirror = true } = {}) {
  k.def('almirah', std({ map: paintedMetalTex('alm' + color, color), metalness: 0.25, roughness: 0.5 }));
  k.box('almirah', w, h - 0.08, d, 0, 0.08 + (h - 0.08) / 2, 0, { r: 0.012 });
  k.box('almirah', w + 0.03, 0.04, d + 0.03, 0, h + 0.01, 0, { r: 0.01 }); // top lip
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box('almirah', 0.05, 0.08, 0.05, sx * (w / 2 - 0.04), 0.04, sz * (d / 2 - 0.04));
  k.box('blackP', 0.006, h - 0.2, 0.005, 0, 0.1 + (h - 0.2) / 2, d / 2 + 0.001); // door split
  for (const sx of [-1, 1]) { const cx = sx * w / 4; k.box('almirah', w / 2 - 0.08, h - 0.36, 0.008, cx, 0.2 + (h - 0.36) / 2, d / 2 + 0.004, { r: 0.003 }); // pressed door panels
    k.box('almirah', w / 2 - 0.08, 0.06, 0.01, cx, 0.15, d / 2 + 0.006); }
  k.cyl('chrome', 0.008, 0.008, 0.2, -0.03, 1.05, d / 2 + 0.03, { seg: 10 }); k.cyl('chrome', 0.008, 0.008, 0.2, 0.03, 1.05, d / 2 + 0.03, { seg: 10 });
  for (const sx of [-1, 1]) for (const y of [0.97, 1.13]) k.box('chrome', 0.012, 0.012, 0.025, sx * 0.03, y, d / 2 + 0.014);
  k.cyl('brass', 0.011, 0.011, 0.01, 0.06, 1.0, d / 2 + 0.006, { rx: Math.PI / 2, seg: 12 }); k.box('blackP', 0.003, 0.009, 0.002, 0.06, 1.0, d / 2 + 0.012);
  if (mirror) { k.box('mirror', w / 2 - 0.14, h - 0.62, 0.006, w / 4, 0.34 + (h - 0.62) / 2, d / 2 + 0.011); k.box('chrome', w / 2 - 0.12, 0.012, 0.012, w / 4, 0.33, d / 2 + 0.012); k.box('chrome', w / 2 - 0.12, 0.012, 0.012, w / 4, h - 0.27, d / 2 + 0.012); }
  for (const y of [0.4, h - 0.4]) for (const sx of [-1, 1]) k.cyl('steel', 0.007, 0.007, 0.06, sx * (w / 2 + 0.003), y, d / 2 - 0.01, { seg: 8 }); // hinges
  k.block(0, 0, w, d);
}
// monobloc plastic chair
export function plasticChair(k, color = '#b3261e', key = 'chairP') {
  k.def(key, std({ color, roughness: 0.38 }));
  k.box(key, 0.44, 0.03, 0.42, 0, 0.44, 0.02, { r: 0.012, rx: -0.05 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(key, 0.02, 0.026, 0.45, sx * 0.2, 0.22, sz * 0.18 + 0.02, { rz: -sx * 0.07, rx: sz * 0.07, seg: 10 });
  k.def(key + 'D', std({ color, roughness: 0.38, side: THREE.DoubleSide })); k.cyl(key + 'D', 0.42, 0.42, 0.34, 0, 0.67, 0.2, { open: true, seg: 20, t0: Math.PI - 0.58, tl: 1.16, rx: -0.12 }); /* moulded back */ for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.2; k.box('blackP', 0.016, 0.2, 0.004, Math.sin(a) * 0.4, 0.68, 0.2 - Math.cos(a) * 0.4 + 0.004, { ry: -a, rx: -0.12 }); } /* vent slots */
  k.box(key, 0.46, 0.05, 0.03, 0, 0.86, -0.22, { rx: 0.16, r: 0.012 });
  k.box(key, 0.44, 0.05, 0.025, 0, 0.5, -0.17, { rx: 0.16, r: 0.01 });
  for (const sx of [-1, 1]) k.tube(key, [[sx * 0.23, 0.7, -0.17], [sx * 0.245, 0.66, 0.02], [sx * 0.235, 0.62, 0.17], [sx * 0.21, 0.44, 0.2]], 0.016, { n: 14 });
  k.block(0, 0.02, 0.5, 0.5);
}
export function table(k, { w = 0.9, d = 0.6, h = 0.75, wood = 'teak', cloth = null, clothKey = 'tcloth' } = {}) {
  k.box(wood, w, 0.028, d, 0, h - 0.014, 0, { r: 0.006 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl(wood, 0.022, 0.016, h - 0.03, sx * (w / 2 - 0.05), (h - 0.03) / 2, sz * (d / 2 - 0.05), { seg: 8 });
  k.box(wood, w - 0.1, 0.07, 0.018, 0, h - 0.065, d / 2 - 0.05); k.box(wood, w - 0.1, 0.07, 0.018, 0, h - 0.065, -d / 2 + 0.05); k.box(wood, 0.018, 0.07, d - 0.1, w / 2 - 0.05, h - 0.065, 0); k.box(wood, 0.018, 0.07, d - 0.1, -w / 2 + 0.05, h - 0.065, 0);
  if (cloth) { k.def(clothKey, std({ map: cloth, roughness: 0.35, side: THREE.DoubleSide })); k.geo(clothKey, drapeGeo(w, d, { over: 0.13, bump: 0.0015, seed: 4 }), 0, h + 0.002, 0); }
  k.block(0, 0, w, d);
}
// ------------------------------------------------------------------ TVs (the screen itself is a separate mesh: HeroRooms.TV)
export function crtTV(k, { doily = true } = {}) { // ~21" tube set: deep bulging back, buttons under the screen
  k.def('crt', std({ color: 0x2c2c2e, roughness: 0.5 }));
  k.box('crt', 0.6, 0.48, 0.07, 0, 0.24, 0.0, { r: 0.022 }); // front bezel
  k.box('crt', 0.52, 0.42, 0.18, 0, 0.235, -0.12, { r: 0.04 }); k.box('crt', 0.34, 0.3, 0.16, 0, 0.23, -0.28, { r: 0.05 }); // tube housing
  for (let i = 0; i < 9; i++) k.box('blackP', 0.2, 0.006, 0.004, 0, 0.13 + i * 0.022, -0.36); // vents
  k.box('blackP', 0.5, 0.385, 0.012, 0, 0.27, 0.031, { r: 0.02 }); // screen surround
  for (let i = 0; i < 4; i++) k.box('greyP', 0.028, 0.012, 0.01, 0.12 + i * 0.04, 0.035, 0.037, { r: 0.003 });
  k.cyl('greyP', 0.012, 0.012, 0.012, -0.22, 0.035, 0.037, { rx: Math.PI / 2, seg: 12 });
  for (let i = 0; i < 6; i++) k.box('blackP', 0.002, 0.025, 0.004, -0.06 + i * 0.012, 0.036, 0.036); // speaker slots
  k.cyl('rubber', 0.02, 0.02, 0.01, -0.22, -0.005, 0.0, { seg: 8 }); k.cyl('rubber', 0.02, 0.02, 0.01, 0.22, -0.005, 0.0, { seg: 8 });
  if (doily) { k.def('lace', std({ map: laceTex(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.95 })); k.geo('lace', drapeGeo(0.42, 0.3, { over: 0.07, bump: 0.002, sx: 18, sz: 14, seed: 6 }), 0, 0.482, -0.16); }
  return { screen: { w: 0.46, h: 0.35, x: 0, y: 0.27, z: 0.04, curve: 0.02 }, led: [0.21, 0.035, 0.038] };
}
export function flatTV(k, { w = 0.74, h = 0.44, stand = true } = {}) {
  k.box('blackP', w, h, 0.03, 0, h / 2 + (stand ? 0.07 : 0), 0, { r: 0.006 }); k.box('greyP', w * 0.5, h * 0.55, 0.035, 0, h / 2 + (stand ? 0.07 : 0), -0.025, { r: 0.01 });
  if (stand) { for (const sx of [-1, 1]) { k.box('greyP', 0.03, 0.012, 0.18, sx * w * 0.38, 0.006, 0, { r: 0.004 }); k.box('greyP', 0.02, 0.07, 0.015, sx * w * 0.38, 0.04, -0.005, { rz: sx * 0.15 }); } }
  return { screen: { w: w - 0.02, h: h - 0.03, x: 0, y: h / 2 + (stand ? 0.07 : 0) + 0.006, z: 0.0162, curve: 0 }, led: [w * 0.4, (stand ? 0.07 : 0) + 0.008, 0.016] };
}
function laceTex() { return canvasTex('lace', 256, 256, (a, w, h) => { a.clearRect(0, 0, w, h); a.strokeStyle = '#f8f6ef'; a.lineWidth = 3; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { a.beginPath(); a.arc(i * 32 + 16, j * 32 + 16, 11, 0, 7); a.stroke(); a.beginPath(); a.arc(i * 32 + 16, j * 32 + 16, 4, 0, 7); a.stroke(); a.beginPath(); a.moveTo(i * 32, j * 32); a.lineTo(i * 32 + 32, j * 32 + 32); a.moveTo(i * 32 + 32, j * 32); a.lineTo(i * 32, j * 32 + 32); a.stroke(); } a.lineWidth = 6; a.strokeRect(3, 3, w - 6, h - 6); }, { repeat: true }); }

// ------------------------------------------------------------------ fixtures
export function ceilingFan(k) { // built into its own kit/group so it can spin; origin at the canopy
  k.def('fanP', std({ color: 0xece9e0, roughness: 0.42, metalness: 0.1 }));
  k.lathe('fanP', [[0, 0], [0.07, 0], [0.075, -0.02], [0.03, -0.07], [0, -0.07]], 0, 0, 0, { seg: 20 });
  k.cyl('fanP', 0.012, 0.012, 0.32, 0, -0.22, 0, { seg: 10 });
  k.lathe('fanP', [[0, 0], [0.05, -0.005], [0.105, -0.03], [0.11, -0.07], [0.09, -0.1], [0.04, -0.115], [0, -0.115]], 0, -0.36, 0, { seg: 24 });
  return (b) => { // blades (rotating group)
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; b.push(0, -0.42, 0, a); b.box('fanP', 0.2, 0.012, 0.035, 0.18, 0.0, 0, { r: 0.004 }); b.box('fanP', 0.62, 0.008, 0.115, 0.56, -0.005, 0, { rx: 0.12, r: 0.003 }); b.pop(); }
  };
}
export function tubeLight(k) { k.box('whiteP', 1.24, 0.045, 0.06, 0, 0, 0, { r: 0.008 }); for (const sx of [-1, 1]) k.box('whiteP', 0.03, 0.05, 0.05, sx * 0.6, -0.04, 0.02); return { len: 1.18, y: -0.045, z: 0.025 }; }
export function switchboard(k, n = 4, socket = true) { // surface wiring board with rocker switches + 3-pin socket
  const w = 0.07 * n + 0.04; k.box('whiteP', w, 0.12, 0.03, 0, 0, 0, { r: 0.006 });
  for (let i = 0; i < n; i++) { const x = -w / 2 + 0.055 + i * 0.07; k.box('whiteP', 0.03, 0.05, 0.012, x, 0.0, 0.019, { rx: i % 2 ? 0.14 : -0.14, r: 0.004 }); k.box('blackP', 0.006, 0.003, 0.002, x, 0.032, 0.0155); }
  if (socket) { k.box('whiteP', 0.09, 0.09, 0.025, w / 2 + 0.07, -0.01, 0, { r: 0.006 }); for (const [dx, dy, ww, hh] of [[0, 0.02, 0.008, 0.016], [-0.02, -0.015, 0.016, 0.006], [0.02, -0.015, 0.016, 0.006]]) k.box('blackP', ww, hh, 0.002, w / 2 + 0.07 + dx, -0.01 + dy, 0.013); }
}
export function conduit(k, pts) { for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]]; const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const L = Math.hypot(dx, dy, dz); k.box('cableW', Math.abs(dx) > 1e-3 ? L + 0.025 : 0.025, Math.abs(dy) > 1e-3 ? L + 0.025 : 0.016, Math.abs(dz) > 1e-3 ? L + 0.025 : 0.025, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); } }

// window in a wall (built facing +z into the room, origin at sill centre on the wall plane): frame, glazing, grille, curtains
export function windowUnit(k, { w = 1.1, h = 1.2, curtain, curtainKey = 'curtain', grille = '#3a4248' } = {}) {
  k.def('grille', std({ color: grille, metalness: 0.5, roughness: 0.5 })); k.def(curtainKey, std({ map: curtain, roughness: 0.95, side: THREE.DoubleSide }));
  const fw = 0.06; for (const sx of [-1, 1]) k.box('teak', fw, h + fw * 2, 0.12, sx * (w / 2 + fw / 2), h / 2, -0.03);
  k.box('teak', w + fw * 2, fw, 0.12, 0, h + fw / 2, -0.03); k.box('teak', w + 0.24, 0.035, 0.2, 0, -0.018, 0.04, { r: 0.008 }); // sill
  k.box('teak', 0.04, h, 0.05, 0, h / 2, -0.06); k.box('teak', w, 0.04, 0.05, 0, h * 0.7, -0.06); // mullion + transom
  k.box('glass', w, h, 0.006, 0, h / 2, -0.07);
  for (let i = 1; i < 7; i++) k.cyl('grille', 0.008, 0.008, h, -w / 2 + i * w / 7, h / 2, 0.0, { seg: 8 }); // security grille
  for (const y of [0.25, h - 0.25]) k.box('grille', w, 0.03, 0.006, 0, y, 0.0); k.torus('grille', 0.09, 0.005, 0, h / 2, 0.0, { ts: 24 });
  // curtain rod + two gathered panels
  k.cyl('chrome', 0.011, 0.011, w + 0.5, 0, h + 0.17, 0.19, { rz: Math.PI / 2, seg: 10 }); for (const sx of [-1, 1]) { k.sph('chrome', 0.02, sx * (w / 2 + 0.26), h + 0.17, 0.19, { ws: 10, hs: 8 }); k.cyl('chrome', 0.006, 0.006, 0.19, sx * (w / 2 + 0.2), h + 0.17, 0.095, { rx: Math.PI / 2, seg: 6 }); } /* rod brackets back to the wall */
  for (const sx of [-1, 1]) { const g = new THREE.PlaneGeometry(0.46, h + 0.55, 48, 6); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const v = (y + (h + 0.55) / 2) / (h + 0.55); const gather = 0.82 + 0.18 * v; p.setXYZ(i, x * gather, y, (Math.sin((x + 0.23) * 27) * 0.022 + Math.sin((x + 0.23) * 61) * 0.004) * (0.7 + 0.3 * v) + 0.035); } g.computeVertexNormals(); k.geo(curtainKey, g, sx * (w / 2 + 0.1), h + 0.15 - (h + 0.55) / 2, 0.17); for (let i = 0; i < 6; i++) k.torus('chrome', 0.016, 0.003, sx * (w / 2 + 0.1) - 0.18 + i * 0.07, h + 0.17, 0.19, { ts: 10 }); }
}
// panel door with frame, lever handle, tower bolt and hinges (front faces +z, origin bottom centre)
export function door(k, { w = 0.9, h = 2.1, wood = 'teak' } = {}) {
  k.box(wood, w, h, 0.04, 0, h / 2, 0); for (const [x, y, ww, hh] of [[-w / 4.4, h * 0.72, w * 0.36, h * 0.38], [w / 4.4, h * 0.72, w * 0.36, h * 0.38], [-w / 4.4, h * 0.26, w * 0.36, h * 0.34], [w / 4.4, h * 0.26, w * 0.36, h * 0.34]]) k.box(wood, ww, hh, 0.012, x, y, 0.024, { r: 0.006 });
  for (const sx of [-1, 1]) k.box(wood, 0.07, h + 0.07, 0.03, sx * (w / 2 + 0.035), (h + 0.07) / 2, 0.02); k.box(wood, w + 0.14, 0.07, 0.03, 0, h + 0.035, 0.02);
  k.box('brass', 0.035, 0.15, 0.008, w / 2 - 0.08, 1.0, 0.026, { r: 0.003 }); k.cyl('brass', 0.008, 0.008, 0.05, w / 2 - 0.08, 1.04, 0.05, { rx: Math.PI / 2, seg: 10 }); k.box('brass', 0.12, 0.016, 0.016, w / 2 - 0.12, 1.04, 0.075, { r: 0.006 });
  k.box('brass', 0.03, 0.1, 0.008, w / 2 - 0.08, 1.45, 0.026); k.cyl('brass', 0.006, 0.006, 0.12, w / 2 - 0.08, 1.45, 0.036, { rz: Math.PI / 2, seg: 8 }); // tower bolt
  for (const y of [0.25, h - 0.25]) k.cyl('steel', 0.008, 0.008, 0.09, -w / 2 + 0.004, y, 0.02, { seg: 8 });
}
// ------------------------------------------------------------------ wall decor
export function calendar(k, key = 'cal') { // printed wall calendar: picture + November 2026 grid with the Il Full Moon Poya day in red
  const tex = canvasTex('calendar', 256, 384, (a, w, h) => {
    a.fillStyle = '#fbfaf5'; a.fillRect(0, 0, w, h); const g = a.createLinearGradient(0, 0, 0, 170); g.addColorStop(0, '#f6b35b'); g.addColorStop(1, '#f7e1a9'); a.fillStyle = g; a.fillRect(12, 12, w - 24, 160);
    a.fillStyle = '#3f7a3a'; for (let r = 0; r < 4; r++) { a.beginPath(); a.moveTo(12, 120 + r * 14); for (let x = 12; x <= w - 12; x += 8) a.lineTo(x, 110 + r * 14 + Math.sin(x * 0.05 + r) * 10); a.lineTo(w - 12, 172); a.lineTo(12, 172); a.fill(); a.fillStyle = ['#4f8a42', '#2f6a30', '#5d9a4a'][r % 3]; }
    a.fillStyle = '#fff3c0'; a.beginPath(); a.arc(190, 70, 18, 0, 7); a.fill();
    a.fillStyle = '#222'; a.font = 'bold 14px sans-serif'; a.textAlign = 'center'; a.fillText('CEYLON TEA TRADERS', w / 2, 192); a.fillStyle = '#b11'; a.font = 'bold 18px sans-serif'; a.fillText('NOVEMBER 2026', w / 2, 214);
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; a.font = 'bold 11px sans-serif'; for (let i = 0; i < 7; i++) { a.fillStyle = i === 0 ? '#c11' : '#333'; a.fillText(days[i], 26 + i * 34, 234); }
    a.font = '13px sans-serif'; for (let d = 1; d <= 30; d++) { const c = (d - 1) % 7, r = Math.floor((d - 1) / 7); a.fillStyle = c === 0 || d === 24 ? '#c11' : '#222'; a.fillText(String(d), 26 + c * 34, 256 + r * 24); if (d === 24) { a.strokeStyle = '#c11'; a.beginPath(); a.arc(26 + c * 34, 252 + r * 24, 10, 0, 7); a.stroke(); } }
    a.fillStyle = '#c11'; a.font = '9px sans-serif'; a.fillText('24 · Il Full Moon Poya Day', w / 2, 374);
  });
  k.box('steel', 0.004, 0.004, 0.02, 0, 0.29, 0.01); label(k, key, tex, 0.3, 0.45, 0, 0.06, 0.006); k.box('chrome', 0.3, 0.012, 0.006, 0, 0.285, 0.008);
}
export function frame(k, key, tex, w, h, { wood = 'teak' } = {}) { k.box(wood, w + 0.05, h + 0.05, 0.02, 0, 0, 0, { r: 0.004 }); label(k, key, tex, w, h, 0, 0, 0.0105, { rough: 0.3 }); k.box('glass', w, h, 0.002, 0, 0, 0.013); }
export function photoTex(seed, people = 3, bg = '#7fa0b8') { return canvasTex('photo' + seed, 192, 144, (a, w, h) => { const g = a.createLinearGradient(0, 0, 0, h); g.addColorStop(0, bg); g.addColorStop(1, '#d9c9a8'); a.fillStyle = g; a.fillRect(0, 0, w, h); const r = rnd(seed); for (let i = 0; i < people; i++) { const x = w * (i + 0.5) / people + (r() - 0.5) * 10, s = 0.8 + r() * 0.35; a.fillStyle = ['#f2efe6', '#2c4f9e', '#b0233a', '#e07b1a', '#0f7a4a'][Math.floor(r() * 5)]; a.beginPath(); a.ellipse(x, h * 0.95, 26 * s, 50 * s, 0, Math.PI, 0); a.fill(); a.fillStyle = '#6b4a35'; a.beginPath(); a.arc(x, h * 0.95 - 58 * s, 13 * s, 0, 7); a.fill(); a.fillStyle = '#151210'; a.beginPath(); a.arc(x, h * 0.95 - 62 * s, 13 * s, Math.PI, 0); a.fill(); } a.fillStyle = 'rgba(255,240,210,0.12)'; a.fillRect(0, 0, w, h); speckle(a, w, h, 14, seed); }); }
// shirt on a wire hanger (hook at the origin)
export function hangingShirt(k, key, tex) {
  k.def(key, std({ map: tex, roughness: 0.92, side: THREE.DoubleSide }));
  const s = new THREE.Shape(); s.moveTo(-0.07, 0); s.lineTo(-0.2, -0.03); s.lineTo(-0.26, -0.22); s.lineTo(-0.2, -0.25); s.lineTo(-0.18, -0.14); s.lineTo(-0.19, -0.7); s.lineTo(0.19, -0.7); s.lineTo(0.18, -0.14); s.lineTo(0.2, -0.25); s.lineTo(0.26, -0.22); s.lineTo(0.2, -0.03); s.lineTo(0.07, 0); s.quadraticCurveTo(0, -0.06, -0.07, 0);
  const g = extrude(s, 0.03, 0.01); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.5, uv.getY(i) * 2.5); k.geo(key, g, 0, -0.06, 0);
  for (let i = 0; i < 5; i++) k.cyl('whiteP', 0.006, 0.006, 0.004, 0, -0.14 - i * 0.12, 0.022, { rx: Math.PI / 2, seg: 8 }); // buttons
  k.box(key, 0.012, 0.6, 0.004, 0.018, -0.4, 0.021); // placket
  k.tube('steel', [[-0.2, -0.06, 0], [0, 0.0, 0], [0.2, -0.06, 0]], 0.003, { n: 8 }); k.box('steel', 0.4, 0.004, 0.004, 0, -0.065, 0); k.tube('steel', [[0, 0, 0], [0, 0.05, 0], [0.025, 0.07, 0], [0.04, 0.05, 0]], 0.003, { n: 8 });
}
export function slippers(k, color = '#2952a3') { // rubber flip-flops
  k.def('slipper' + color, std({ color, roughness: 0.75 }));
  for (const sx of [-1, 1]) { k.push(sx * 0.07, 0, 0, sx * 0.1); const s = new THREE.Shape(); s.moveTo(0, -0.13); s.bezierCurveTo(0.05, -0.13, 0.045, 0.02, 0.05, 0.08); s.bezierCurveTo(0.05, 0.14, -0.05, 0.14, -0.045, 0.08); s.bezierCurveTo(-0.045, 0.02, -0.05, -0.13, 0, -0.13); const g = extrude(s, 0.016, 0.003); g.rotateX(-Math.PI / 2); k.geo('rubber', g, 0, 0.011, 0); k.geo('slipper' + color, extrude(s, 0.004, 0.001).rotateX(-Math.PI / 2), 0, 0.022, 0);
    k.tube('slipper' + color, [[-0.045, 0.024, -0.02], [-0.02, 0.05, 0.05], [0, 0.03, 0.085]], 0.007, { n: 10 }); k.tube('slipper' + color, [[0.045, 0.024, -0.02], [0.02, 0.05, 0.05], [0, 0.03, 0.085]], 0.007, { n: 10 }); k.pop(); }
}
export function umbrella(k) { k.def('umbr', std({ color: 0x151515, roughness: 0.7 })); k.cyl('umbr', 0.012, 0.045, 0.66, 0, 0.42, 0, { seg: 8 }); k.cyl('steel', 0.004, 0.002, 0.08, 0, 0.04, 0, { seg: 6 }); k.cyl('chrome', 0.006, 0.006, 0.08, 0, 0.79, 0); k.tube('teak', [[0, 0.82, 0], [0, 0.9, 0], [0.02, 0.95, 0], [0.055, 0.94, 0], [0.06, 0.9, 0]], 0.012, { n: 12 }); k.torus('umbr', 0.03, 0.004, 0, 0.5, 0, { rx: Math.PI / 2 }); }
// small shrine shelf: seated Buddha statue (plain, respectful), clay oil lamp, araliya flowers on a tray
export function shrineShelf(k) {
  k.def('statue', std({ color: 0xf1ead8, roughness: 0.35 })); k.def('clay', std({ color: 0x9a4a2a, roughness: 0.85 })); k.def('petal', std({ color: 0xfbf7ee, roughness: 0.6, side: THREE.DoubleSide })); k.def('pYel', std({ color: 0xf2c230, roughness: 0.6 }));
  k.box('teak', 0.6, 0.025, 0.22, 0, 0, 0, { r: 0.005 }); for (const sx of [-1, 1]) k.tube('teak', [[sx * 0.24, -0.012, -0.1], [sx * 0.24, -0.1, -0.1], [sx * 0.24, -0.012, 0.0]], 0.008, { n: 6 });
  k.push(0, 0.012, -0.02); k.lathe('statue', [[0, 0], [0.07, 0], [0.075, 0.012], [0.06, 0.02], [0.068, 0.03], [0, 0.03]], 0, 0, 0, { seg: 20 }); k.sph('statue', 1, 0, 0.05, 0, { sx: 0.065, sy: 0.024, sz: 0.042 });
  k.lathe('statue', [[0, 0], [0.036, 0], [0.04, 0.03], [0.03, 0.075], [0.016, 0.09], [0, 0.092]], 0, 0.05, 0, { seg: 16 }); k.sph('statue', 1, 0, 0.07, 0.022, { sx: 0.03, sy: 0.012, sz: 0.018 });
  k.sph('statue', 0.026, 0, 0.165, 0, { ws: 16, hs: 12 }); k.sph('statue', 0.012, 0, 0.192, -0.002, { ws: 10, hs: 8 }); k.pop();
  k.lathe('clay', [[0, 0], [0.025, 0], [0.03, 0.012], [0.028, 0.02], [0, 0.018]], 0.16, 0.012, 0.02, { seg: 14 }); k.cyl('pYel', 0.002, 0.002, 0.02, 0.16 + 0.018, 0.035, 0.02, { seg: 5, rz: -0.5 });
  k.box('brass', 0.14, 0.008, 0.09, -0.17, 0.016, 0.03, { r: 0.003 });
  for (let i = 0; i < 4; i++) { const fx = -0.2 + (i % 2) * 0.06, fz = 0.01 + Math.floor(i / 2) * 0.04; for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2 + i; k.sph('petal', 1, fx + Math.cos(a) * 0.012, 0.024, fz + Math.sin(a) * 0.012, { sx: 0.013, sy: 0.003, sz: 0.007, ry: -a, ws: 8, hs: 4 }); } k.sph('pYel', 0.005, fx, 0.026, fz, { ws: 6, hs: 4 }); }
  return { flame: [0.178, 0.05, 0.02] };
}
// ------------------------------------------------------------------ small objects
export function books(k, n, { seed = 2, h0 = 0.2, lean = false } = {}) { // a row of books standing on a shelf, spines facing +z
  const r = rnd(seed); const cols = ['#7a1f1f', '#1f3f6a', '#2f5a2a', '#c9a227', '#5a3a22', '#e8e2d0', '#333', '#8a3a6a', '#3a6a7a']; let x = 0;
  for (let i = 0; i < n; i++) { const t = 0.022 + r() * 0.03, h = h0 * (0.75 + r() * 0.3), d = 0.14 + r() * 0.06; const key = 'book' + (i % cols.length); k.def(key, std({ color: cols[Math.floor(r() * cols.length)], roughness: 0.75 })); const tilt = lean && i === n - 1 ? 0.25 : 0; k.box(key, t, h, d, x + t / 2, h / 2, 0, { rz: tilt }); k.box('paper', t - 0.004, h - 0.008, 0.004, x + t / 2, h / 2, -d / 2 + 0.001); k.box('brass', t - 0.006, 0.004, 0.002, x + t / 2, h * 0.8, d / 2 + 0.001); x += t + 0.002; }
  return x;
}
export function bottle(opts = {}) { // vodka bottle (fictional brand) — its own group: glass, liquid (scaled by fill), cap, wrap-around label
  const g = new THREE.Group(); g.name = 'vodka';
  const glassM = new THREE.MeshStandardMaterial({ color: 0xe8f2f4, transparent: true, opacity: 0.28, roughness: 0.03, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const prof = [[0, 0.002], [0.036, 0], [0.04, 0.006], [0.04, 0.2], [0.036, 0.225], [0.02, 0.25], [0.014, 0.265], [0.0135, 0.3], [0.0155, 0.302], [0.0155, 0.31]].map((p) => new THREE.Vector2(p[0], p[1]));
  const gl = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), glassM); gl.renderOrder = 3; g.add(gl);
  const liqM = new THREE.MeshStandardMaterial({ color: 0xdfeef2, transparent: true, opacity: 0.35, roughness: 0.02, depthWrite: false });
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.0365, 0.0365, 1, 24), liqM); liq.renderOrder = 2; g.add(liq);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.03, 20), new THREE.MeshStandardMaterial({ color: 0xb7141c, metalness: 0.6, roughness: 0.35 })); cap.position.y = 0.318; g.add(cap);
  const lt = canvasTex('vodkaLabel', 512, 256, (a, w, h) => { a.fillStyle = '#f5f3ee'; a.fillRect(0, 0, w, h); a.fillStyle = '#0f2c5c'; a.fillRect(0, 0, w, 34); a.fillRect(0, h - 30, w, 30); a.fillStyle = '#c9a227'; a.fillRect(0, 34, w, 4); a.fillRect(0, h - 34, w, 4); a.fillStyle = '#0f2c5c'; a.textAlign = 'center'; a.font = 'bold 50px Georgia, serif'; a.fillText('LANKA CRYSTAL', w * 0.25, 112); a.font = 'italic 26px Georgia, serif'; a.fillStyle = '#b7141c'; a.fillText('Premium Vodka', w * 0.25, 150); a.fillStyle = '#333'; a.font = '18px sans-serif'; a.fillText('Triple distilled · 40% vol · 750 ml', w * 0.25, 190); a.fillStyle = '#f5f3ee'; a.font = 'bold 16px sans-serif'; a.fillText('DRINK RESPONSIBLY', w * 0.25, h - 9); a.fillStyle = '#555'; a.font = '13px sans-serif'; a.textAlign = 'left'; ['Ingredients: water, neutral grain spirit.', 'Not for sale to persons under 21.', 'Bottled in Sri Lanka.', 'Store in a cool place.'].forEach((s, i) => a.fillText(s, w * 0.56, 90 + i * 22)); a.fillStyle = '#000'; for (let i = 0; i < 30; i++) a.fillRect(w * 0.6 + i * 4, 190, i % 3 ? 2 : 1, 34); });
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0408, 0.0408, 0.1, 28, 1, true), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.6 })); lab.position.y = 0.11; g.add(lab);
  g.userData = { liq, glassM, setFill(f) { const H = 0.19 * Math.max(0.001, f); liq.scale.set(1, H, 1); liq.position.y = 0.006 + H / 2; liq.visible = f > 0.003; }, mouth: new THREE.Vector3(0, 0.31, 0) };
  g.userData.setFill(opts.fill ?? 1); return g;
}
export function shotGlass() { // heavy-based shot glass with its own liquid
  const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color: 0xeef6f7, transparent: true, opacity: 0.3, roughness: 0.02, depthWrite: false, side: THREE.DoubleSide });
  const outer = [[0, 0], [0.022, 0], [0.024, 0.004], [0.027, 0.062], [0.025, 0.062], [0.021, 0.016], [0, 0.015]].map((p) => new THREE.Vector2(p[0], p[1]));
  const gl = new THREE.Mesh(new THREE.LatheGeometry(outer, 24), m); gl.renderOrder = 3; g.add(gl);
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.0232, 0.0212, 1, 20), new THREE.MeshStandardMaterial({ color: 0xe6f2f4, transparent: true, opacity: 0.45, roughness: 0.02, depthWrite: false })); liq.renderOrder = 2; g.add(liq);
  g.userData = { liq, setFill(f) { const H = 0.042 * Math.max(0.001, f); liq.scale.set(1 + f * 0.08, H, 1 + f * 0.08); liq.position.y = 0.016 + H / 2; liq.visible = f > 0.01; }, rim: new THREE.Vector3(0, 0.062, 0) };
  g.userData.setFill(0); return g;
}
export function newspaper(k, key = 'news') {
  const tex = canvasTex('newspaper', 256, 320, (a, w, h) => { a.fillStyle = '#ebe6d6'; a.fillRect(0, 0, w, h); a.fillStyle = '#111'; a.textAlign = 'center'; a.font = 'bold 26px Georgia, serif'; a.fillText('Daily Lanka Chronicle', w / 2, 32); a.fillRect(10, 40, w - 20, 2); a.font = 'bold 18px Georgia, serif'; a.fillText('Monsoon rains lash the west coast', w / 2, 68); a.fillStyle = '#9a9488'; a.fillRect(14, 80, 110, 80); for (let c = 0; c < 2; c++) for (let i = 0; i < 18; i++) a.fillRect(c === 0 ? 14 : 134, (c === 0 ? 170 : 84) + i * 8, 108 - (i % 5 === 4 ? 40 : 0), 3); for (let i = 0; i < 9; i++) a.fillRect(14, 245 + i * 8, w - 28, 3); speckle(a, w, h, 10, 71); });
  label(k, key, tex, 0.28, 0.36, 0, 0.006, 0, { rx: -Math.PI / 2, rz: 0.2 }); k.box('paper', 0.285, 0.004, 0.365, 0, 0.002, 0, { ry: 0.2 });
}
export function keys(k) { k.torus('steel', 0.014, 0.0018, 0, 0.002, 0, { rx: Math.PI / 2, ts: 18 }); k.box('brass', 0.012, 0.002, 0.05, 0.012, 0.002, 0.03, { ry: 0.4 }); k.box('steel', 0.011, 0.002, 0.045, -0.015, 0.002, 0.026, { ry: -0.5 }); k.def('tag', std({ color: 0x1a5a9a, roughness: 0.5 })); k.box('tag', 0.03, 0.004, 0.022, -0.03, 0.003, -0.012, { r: 0.002 }); }
export function toolbox(k) { k.def('tbRed', std({ map: paintedMetalTex('tb', '#a3201b'), metalness: 0.4, roughness: 0.45 })); k.box('tbRed', 0.48, 0.2, 0.22, 0, 0.1, 0, { r: 0.008 }); k.box('tbRed', 0.49, 0.03, 0.23, 0, 0.215, 0, { r: 0.006 }); k.box('blackP', 0.48, 0.004, 0.222, 0, 0.198, 0); for (const sx of [-1, 1]) { k.box('chrome', 0.03, 0.04, 0.01, sx * 0.15, 0.19, 0.115); k.cyl('steel', 0.008, 0.008, 0.03, sx * 0.08, 0.25, 0, { seg: 8 }); } k.cyl('blackP', 0.012, 0.012, 0.18, 0, 0.27, 0, { rz: Math.PI / 2, seg: 10 }); }
export function helmet(k, color = '#d9d9d9') { k.def('helm', std({ color, roughness: 0.25, metalness: 0.1 })); k.def('visor', std({ color: 0x101418, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.85 })); k.sph('helm', 0.14, 0, 0.13, 0, { sx: 1, sy: 1.05, sz: 1.15, t0: 0, tl: Math.PI * 0.62, ws: 24, hs: 14 }); k.cyl('helm', 0.13, 0.12, 0.08, 0, 0.06, 0.01, { sz: 1.12, seg: 24 }); k.sph('visor', 0.147, 0, 0.12, 0.004, { sz: 1.12, t0: Math.PI * 0.35, tl: Math.PI * 0.25, ws: 20, hs: 6, ry: 0, rx: -0.5 }); k.box('rubber', 0.2, 0.02, 0.2, 0, 0.02, 0, { r: 0.008 }); }
export function dumbbell(k) { k.cyl('chrome', 0.014, 0.014, 0.3, 0, 0.06, 0, { rz: Math.PI / 2, seg: 10 }); for (const sx of [-1, 1]) for (const o of [0.08, 0.11]) k.cyl('rubber', 0.06, 0.06, 0.03, sx * o, 0.06, 0, { rz: Math.PI / 2, seg: 6 }); }
export function cricketBat(k) { k.def('willow', std({ map: woodTex('willow', '#e3c993', '#b8955c', { seed: 17 }), roughness: 0.55 })); k.def('grip', std({ color: 0x1f5fa8, roughness: 0.85 })); k.box('willow', 0.108, 0.56, 0.03, 0, 0.28, 0, { r: 0.012 }); k.box('willow', 0.06, 0.4, 0.03, 0, 0.26, -0.02, { r: 0.012 }); k.cyl('willow', 0.016, 0.016, 0.08, 0, 0.6, 0, { seg: 10 }); k.cyl('grip', 0.019, 0.018, 0.24, 0, 0.75, 0, { seg: 12 }); k.sph('grip', 0.019, 0, 0.87, 0, { ws: 10, hs: 6 }); }
export function cricketBall(k) { k.def('ballR', std({ color: 0x8e1414, roughness: 0.4 })); k.sph('ballR', 0.036, 0, 0.036, 0, { ws: 18, hs: 12 }); k.torus('paper', 0.036, 0.0015, 0, 0.036, 0, { ts: 32 }); }
export function miniFridge(k) { k.def('fridge', std({ color: 0xf0efea, roughness: 0.3, metalness: 0.15 })); k.box('fridge', 0.48, 0.84, 0.5, 0, 0.44, 0, { r: 0.02 }); k.box('blackP', 0.46, 0.005, 0.005, 0, 0.64, 0.251); k.box('greyP', 0.02, 0.3, 0.025, 0.2, 0.45, 0.258, { r: 0.008 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.cyl('rubber', 0.02, 0.02, 0.02, sx * 0.2, 0.01, sz * 0.2, { seg: 8 }); for (const [x, y, c] of [[-0.12, 0.72, '#e33'], [-0.05, 0.55, '#36c'], [0.04, 0.78, '#fc3']]) { k.def('mag' + c, std({ color: c, roughness: 0.4 })); k.box('mag' + c, 0.04, 0.03, 0.01, x, y, 0.256, { r: 0.004 }); } k.block(0, 0, 0.48, 0.5); }
export function deskLamp(k, key = 'lampG') { k.def(key, std({ color: 0x1d4a3a, metalness: 0.5, roughness: 0.35 })); k.cyl(key, 0.07, 0.075, 0.02, 0, 0.01, 0, { seg: 20 }); k.tube('chrome', [[0, 0.02, 0], [0, 0.18, -0.03], [0.02, 0.32, 0.02], [0.05, 0.35, 0.09]], 0.007, { n: 16 }); k.cyl(key, 0.03, 0.075, 0.12, 0.06, 0.32, 0.12, { open: true, seg: 20, rx: 0.6 }); return [0.06, 0.29, 0.13]; }
export function laptop(k, tex) { k.def('alu', std({ color: 0x9a9ea3, metalness: 0.75, roughness: 0.35 })); k.box('alu', 0.33, 0.016, 0.23, 0, 0.008, 0, { r: 0.006 }); const kb = canvasTex('keyboard', 256, 128, (a, w, h) => { a.fillStyle = '#9a9ea3'; a.fillRect(0, 0, w, h); a.fillStyle = '#1c1c1e'; for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) a.fillRect(8 + c * 17.4, 6 + r * 16, 15, 14); a.fillRect(70, 86, 110, 14); a.fillStyle = '#8a8e93'; a.fillRect(90, 104, 76, 22); }); label(k, 'kb', kb, 0.3, 0.15, 0, 0.0165, 0.02, { rx: -Math.PI / 2 }); k.push(0, 0.016, -0.115, 0, -0.3); k.box('alu', 0.33, 0.22, 0.008, 0, 0.11, 0, { r: 0.005 }); label(k, 'lscreen', tex, 0.3, 0.19, 0, 0.115, 0.0045, { glow: 0.9, rough: 0.2 }); k.pop(); }
export function multimeter(k) { k.def('mmY', std({ color: 0xe8b51a, roughness: 0.6 })); k.box('mmY', 0.09, 0.03, 0.18, 0, 0.015, 0, { r: 0.012 }); k.box('blackP', 0.075, 0.02, 0.15, 0, 0.022, 0, { r: 0.006 }); const t = canvasTex('mmLCD', 128, 64, (a, w, h) => { a.fillStyle = '#b8c4a0'; a.fillRect(0, 0, w, h); a.fillStyle = '#1e241a'; a.font = 'bold 34px monospace'; a.fillText('12.06', 8, 44); a.font = '12px monospace'; a.fillText('V DC', 90, 58); }); label(k, 'mmlcd', t, 0.06, 0.03, 0, 0.0325, -0.04, { rx: -Math.PI / 2 }); k.cyl('greyP', 0.022, 0.022, 0.008, 0, 0.034, 0.02, { seg: 18 }); k.box('chrome', 0.004, 0.003, 0.03, 0, 0.039, 0.02); k.tube('cable', [[0.02, 0.03, 0.09], [0.05, 0.01, 0.15], [0.15, 0.006, 0.12], [0.2, 0.01, 0.03]], 0.003); k.def('cableR', std({ color: 0xb01818, roughness: 0.5 })); k.tube('cableR', [[-0.02, 0.03, 0.09], [-0.03, 0.01, 0.16], [0.08, 0.006, 0.2], [0.18, 0.012, 0.08]], 0.003); }
export function pcb(k) { k.def('pcbG', std({ color: 0x1f5a2c, roughness: 0.45 })); k.box('pcbG', 0.16, 0.003, 0.11, 0, 0.0015, 0); const r = rnd(81); for (let i = 0; i < 7; i++) k.box('blackP', 0.012 + r() * 0.02, 0.004, 0.01 + r() * 0.012, -0.06 + r() * 0.12, 0.005, -0.04 + r() * 0.08); for (let i = 0; i < 5; i++) { k.def('capB', std({ color: 0x1d2c6a, roughness: 0.4 })); k.cyl('capB', 0.005, 0.005, 0.014, -0.06 + r() * 0.12, 0.01, -0.04 + r() * 0.08, { seg: 10 }); } }
export function solderStation(k) { k.box('blackP', 0.12, 0.08, 0.14, 0, 0.04, 0, { r: 0.008 }); k.def('led7', std({ color: 0x220000, emissive: 0xff2a10, emissiveIntensity: 1.4 })); k.box('led7', 0.05, 0.016, 0.002, 0, 0.055, 0.071); k.cyl('greyP', 0.012, 0.012, 0.01, 0.03, 0.03, 0.074, { rx: Math.PI / 2, seg: 12 }); const pts = []; for (let i = 0; i < 26; i++) { const a = i * 0.9; pts.push([0.13 + Math.cos(a) * 0.022, 0.03 + i * 0.004, Math.sin(a) * 0.022]); } k.tube('chrome', pts, 0.0018, { n: 80, rs: 4 }); k.cyl('blackP', 0.03, 0.035, 0.02, 0.13, 0.01, 0, { seg: 14 }); k.cyl('blackP', 0.008, 0.01, 0.12, 0.13, 0.13, 0.0, { rz: 0.5, seg: 10 }); k.cyl('chrome', 0.0025, 0.0012, 0.05, 0.1, 0.2, 0, { rz: 0.5, seg: 6 }); k.tube('cable', [[0.0, 0.05, -0.07], [0.05, 0.02, -0.1], [0.16, 0.05, -0.05], [0.17, 0.08, 0.0]], 0.003); }
export function partsDrawers(k) { k.def('drawerB', std({ color: 0x2c4a7a, roughness: 0.5 })); k.def('drawerT', std({ color: 0xd8e4ee, roughness: 0.2, transparent: true, opacity: 0.6 })); k.box('drawerB', 0.3, 0.26, 0.16, 0, 0.13, 0, { r: 0.004 }); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x = -0.105 + c * 0.07, y = 0.035 + r * 0.06; k.box('drawerT', 0.062, 0.052, 0.01, x, y, 0.081); k.box('blackP', 0.016, 0.004, 0.006, x, y - 0.012, 0.088); } }
export function wallClockBody(k) { k.def('clockRim', std({ color: 0x2a2a2a, roughness: 0.35 })); k.lathe('clockRim', [[0, 0], [0.16, 0], [0.17, 0.02], [0.165, 0.04], [0.15, 0.04]], 0, 0, 0, { rx: Math.PI / 2, seg: 36 }); const t = canvasTex('clockface', 256, 256, (a, w, h) => { a.fillStyle = '#f8f6f0'; a.beginPath(); a.arc(128, 128, 126, 0, 7); a.fill(); a.fillStyle = '#222'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.font = 'bold 26px sans-serif'; for (let i = 1; i <= 12; i++) { const an = i / 12 * Math.PI * 2; a.fillText(String(i), 128 + Math.sin(an) * 96, 128 - Math.cos(an) * 96); } for (let i = 0; i < 60; i++) { const an = i / 60 * Math.PI * 2, r0 = i % 5 ? 114 : 108; a.fillRect(128 + Math.sin(an) * r0 - 1, 128 - Math.cos(an) * r0 - 1, 2, 2); a.beginPath(); a.moveTo(128 + Math.sin(an) * r0, 128 - Math.cos(an) * r0); a.lineTo(128 + Math.sin(an) * 120, 128 - Math.cos(an) * 120); a.stroke(); } a.font = '11px sans-serif'; a.fillText('QUARTZ', 128, 170); }); label(k, 'clockface', t, 0.31, 0.31, 0, 0, 0.012); k.box('glass', 0.3, 0.3, 0.002, 0, 0, 0.032); }
export function blotchTexFor(key, base) { return canvasTex(key, 64, 64, (a, w, h) => { a.fillStyle = base; a.fillRect(0, 0, w, h); blotches(a, w, h, 6, 'rgba(0,0,0,0.08)', 4, 16, 9); }); }
