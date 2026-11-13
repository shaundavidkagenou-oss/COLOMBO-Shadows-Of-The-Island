// Interiors of the 43rd-request walk-in shops (WalkIn.js builds them in place, inside each shop's own building, the first
// time the player comes within range of the door). Local frame: facade at z = 0, street +z, door centred at x = 0; the
// room runs from the inner face of the front wall (z = −REVEAL) back to z = −REVEAL − d, and is sized to fit the building.
//   barber    Razor & Co. Barbers — checkerboard floor, oak wainscot, three hydraulic chairs facing a mirror wall
//   tattoo    Black Lotus Tattoo — exposed brick, polished concrete, a tattoo bed under an LED ring lamp, flash-art walls
//   tattoo2   Serendib Ink — a lighter studio: white tile, timber, plants, two stations
//   gunshop2  Lanka Shooting Supplies — pegboard walls, a glass pistol counter, a long-gun rack behind it
//   clothing  Marine Drive Clothing Co. — hat wall, shirt and trouser bays, shoe wall, sunglasses tower, mannequins, fitting rooms
//   luxury    Maison Serendib — marble, walnut panelling with brass, lit coat niches, shoes on marble plinths, velvet sofa
// Every room returns { g, bounds, obstacles (local AABBs), lights (≤ 6 for the shared pool), H, keeper, update, interact }.
import * as THREE from 'three';
import { modelFloor } from './FloorKit.js';
import { Kit, C, imagePlane, lathe, garment } from './ShopKit.js';
import { REVEAL, DOOR_W } from './WalkIn.js';
import { Character, randomSpec } from '../actors/Character.js';
import { drawTattooDesign, TATTOO_DESIGNS } from '../actors/TattooArt.js';
import { WEAPONS } from '../combat/WeaponDefs.js';
import { buildWeaponModel } from '../combat/WeaponModels.js';

export const SHOP_DEFS = {
  barber: { name: 'Razor & Co. Barbers', door: 'black', w: 7, d: 10, H: 3.2, kind: 'barber', keeper: { seed: 5101, sex: 'm', age: 'adult', outfit: 'shirt', top: '#1d1d1f', bottom: '#2a2a2c', hair: 'short', beard: true }, line: 'Take a seat in the first chair, machan. Fade, trim, shave — tell me what you want.' },
  tattoo: { name: 'Black Lotus Tattoo', door: 'black', w: 6.5, d: 9.5, H: 3.2, kind: 'tattoo', keeper: { seed: 5207, sex: 'm', age: 'adult', outfit: 'tee_jeans', top: '#111111', bottom: '#1f2a3a', hair: 'short', beard: true }, line: 'Pick something from the flash or tell me your idea. Clean needles, every time.' },
  tattoo2: { name: 'Serendib Ink', door: 'timberGlass', w: 6.5, d: 9.5, H: 3.2, kind: 'tattoo', light: true, keeper: { seed: 5311, sex: 'f', age: 'adult', outfit: 'tee_jeans', top: '#e8e2d6', bottom: '#2a3140', hair: 'bun' }, line: 'Welcome to Serendib Ink. Arm, chest, back — have a look at the books.' },
  gunshop2: { name: 'Lanka Shooting Supplies', door: 'steel', w: 7, d: 10, H: 3.3, kind: 'gun', keeper: { seed: 5419, sex: 'm', age: 'adult', outfit: 'shirt', top: '#4b5240', bottom: '#2d2f33', hair: 'short', moustache: true }, line: 'Licence on the counter, please. Then we can talk.' },
  clothing: { name: 'Marine Drive Clothing Co.', door: 'alu', w: 10, d: 12, H: 3.4, kind: 'clothing', keeper: { seed: 5521, sex: 'f', age: 'adult', outfit: 'office', top: '#f2efe8', bottom: '#1e2430', hair: 'long' }, line: 'Hi! Hats on the left wall, shoes at the back. Fitting rooms are free.' },
  luxury: { name: 'Maison Serendib', door: 'bronze', w: 9, d: 11, H: 3.6, kind: 'luxury', keeper: { seed: 5623, sex: 'm', age: 'adult', outfit: 'office', top: '#f4f2ee', bottom: '#15171c', hair: 'short', collar: true }, line: 'Good evening, sir. Our coats are hand-finished. Please, take your time.' },
};

// fit the room into the building behind the facade
function fit(def, site) {
  const b = site.b; let w = def.w, d = def.d; if (b) { const ns = Math.abs(Math.cos(site.yaw)) > 0.7; const bw = ns ? b.x1 - b.x0 : b.z1 - b.z0, bd = ns ? b.z1 - b.z0 : b.x1 - b.x0; w = Math.min(w, bw - 0.5); d = Math.min(d, bd - 0.6); }
  return { w: Math.max(5, w), d: Math.max(7, d) };
}
// shell: floor, ceiling, four inward walls (doorway in the front one), skirting + cornice; returns the frame helpers
function shell(k, g, W, D, H, o) {
  const x0 = -W / 2, x1 = W / 2, zf = -REVEAL, z0 = zf - D; const hw = DOOR_W / 2 + 0.01, DH = 2.31;
  g.add(modelFloor(o.floor, x0, z0, x1, zf, 0));
  const wm = k.get(o.wall || 'plaster'); const wc = C(o.wallCol || '#ffffff'); const U = (len, h) => [0, 0, len / 1.6, h / 1.6];
  wm.wall(x0, z0, x1, z0, 0, H, U(W, H), wc); wm.wall(x0, zf, x0, z0, 0, H, U(D, H), wc); wm.wall(x1, z0, x1, zf, 0, H, U(D, H), wc);
  const fw = k.get(o.frontWall || o.wall || 'plaster'); fw.wall(x1, zf, hw, zf, 0, H, U(x1 - hw, H), wc); fw.wall(-hw, zf, x0, zf, 0, H, U(x1 - hw, H), wc); fw.wall(hw, zf, -hw, zf, DH, H, U(2 * hw, H - DH), wc);
  const ceil = k.get('paint'); ceil.hrect(x0, z0, x1, zf, H, 1, C(o.ceil || '#f1eee8'), true);
  const sk = k.get(o.skirt || 'paint'), skc = C(o.skirtCol || '#2a2522');
  sk.box(0, 0.05, z0 + 0.008, W, 0.1, 0.016, { col: skc }); sk.box(x0 + 0.008, 0.05, (z0 + zf) / 2, 0.016, 0.1, D, { col: skc }); sk.box(x1 - 0.008, 0.05, (z0 + zf) / 2, 0.016, 0.1, D, { col: skc });
  for (const sg of [-1, 1]) sk.box(sg * (hw + (W / 2 - hw) / 2), 0.05, zf - 0.008, W / 2 - hw, 0.1, 0.016, { col: skc });
  const cn = k.get('paint'), cc = C(o.cornice || '#f6f3ec'); cn.box(0, H - 0.04, z0 + 0.03, W, 0.08, 0.06, { col: cc }); cn.box(x0 + 0.03, H - 0.04, (z0 + zf) / 2, 0.06, 0.08, D, { col: cc }); cn.box(x1 - 0.03, H - 0.04, (z0 + zf) / 2, 0.06, 0.08, D, { col: cc }); cn.box(0, H - 0.04, zf - 0.03, W, 0.08, 0.06, { col: cc });
  return { x0, x1, z0, zf, hw };
}
const ob = (list, x, z, w, d) => list.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
function keeperAt(g, spec, x, z, yaw) { const ch = new Character(randomSpec(spec.seed, spec)); ch.root.position.set(x, 0, z); ch.root.rotation.y = yaw; g.add(ch.root); ch.anim.update(0.016, 0); return ch; }
// pendant lamp: cord, shade, bulb (emissive) — the light itself comes from the pool
function pendant(k, x, y, z, H, shade = '#151515', r0 = 0.16) { const m = k.get('metal'); m.cylinder(x, y + 0.2, z, 0.006, 0.006, H - y - 0.2, 6, { col: C('#111') }); lathe(m, x, y, z, [[r0, 0], [r0 * 0.92, 0.04], [r0 * 0.45, 0.17], [0.03, 0.2]], 18, C(shade)); k.get('emissive').cylinder(x, y + 0.02, z, 0.045, 0.045, 0.06, 10, { col: [1, 0.86, 0.62] }); }
// framed picture on a wall (wall normal +z in the frame given by rotY at x, y, z)
function frame(g, k, key, x, y, z, rotY, w, h, draw, frameCol = '#1b1612') {
  const c = Math.cos(rotY), s = Math.sin(rotY); k.get('paint').box(x, y, z, w + 0.05, h + 0.05, 0.025, { col: C(frameCol), rotY });
  const p = imagePlane(key, w, h, Math.round(256 * Math.min(2, w / h)), Math.round(256 * Math.min(2, h / w)), draw, { rough: 0.5 }); if (p) { p.position.set(x + s * 0.014, y, z + c * 0.014); p.rotation.y = rotY; g.add(p); }
}
// bottles / jars on a shelf
function bottles(k, x0, x1, y, z, rng, cols, alongZ = false) { const m = k.get('paint'); for (let x = x0; x < x1; x += 0.07 + rng() * 0.05) { const h = 0.12 + rng() * 0.12, r = 0.022 + rng() * 0.018; lathe(m, alongZ ? z : x, y, alongZ ? x : z, [[r, 0], [r, h * 0.7], [r * 0.45, h * 0.82], [r * 0.4, h], [0.001, h]], 10, C(cols[Math.floor(rng() * cols.length)])); } }
const rngOf = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

// ------------------------------------------------------------------------------------------------ barber
function buildBarber(game, def, site) {
  const { w: W, d: D } = fit(def, site); const H = def.H; const g = new THREE.Group(); const k = new Kit(); const obs = []; const rng = rngOf(51);
  const S = shell(k, g, W, D, H, { floor: { kind: 'checker', size: 0.3, seed: 51 }, wall: 'plaster', wallCol: '#2f4a3e', ceil: '#ece8e0', skirtCol: '#1a1512' });
  const { x0, x1, z0, zf } = S;
  // oak wainscot + dado rail on all walls
  const oak = k.get('oak'); const wsH = 1.15; oak.box(0, wsH / 2, z0 + 0.02, W, wsH, 0.035, { col: [1, 1, 1] }); oak.box(x0 + 0.02, wsH / 2, (z0 + zf) / 2, 0.035, wsH, D, { col: [1, 1, 1] }); oak.box(x1 - 0.02, wsH / 2, (z0 + zf) / 2, 0.035, wsH, D, { col: [1, 1, 1] });
  for (const sg of [-1, 1]) oak.box(sg * (S.hw + (W / 2 - S.hw) / 2), wsH / 2, zf - 0.02, W / 2 - S.hw, wsH, 0.035, { col: [1, 1, 1] });
  const wal = k.get('walnut'); wal.box(0, wsH + 0.02, z0 + 0.04, W, 0.05, 0.06, { col: [1, 1, 1] }); wal.box(x0 + 0.04, wsH + 0.02, (z0 + zf) / 2, 0.06, 0.05, D, { col: [1, 1, 1] }); wal.box(x1 - 0.04, wsH + 0.02, (z0 + zf) / 2, 0.06, 0.05, D, { col: [1, 1, 1] });
  // mirror wall (left): three stations — mirror in an oak frame, a marble-topped console with products, chair in front
  const chairs = []; const nSt = Math.max(2, Math.min(3, Math.floor((D - 3) / 2.1)));
  for (let i = 0; i < nSt; i++) { const z = zf - 2.2 - i * 2.1; const mx = x0 + 0.06;
    oak.box(mx + 0.02, 1.75, z, 0.05, 1.3, 1.05, { col: [1, 1, 1] }); k.get('mirror').box(mx + 0.05, 1.75, z, 0.012, 1.18, 0.93, { col: [0.92, 0.94, 0.95] });
    k.get('marble').box(x0 + 0.27, 0.92, z, 0.48, 0.05, 1.1, { col: [1, 1, 1] }); wal.box(x0 + 0.25, 0.46, z, 0.44, 0.86, 1.04, { col: [0.9, 0.9, 0.9] }); ob(obs, x0 + 0.25, z, 0.5, 1.1);
    for (const dz of [-0.36, 0.0, 0.36]) k.get('metal').box(x0 + 0.47, 0.46 + (dz ? 0 : 0.25), z + dz, 0.012, 0.012, 0.08, { col: C('#c9a54e') }); // drawer pulls
    bottles(k, z - 0.45, z - 0.05, 0.945, x0 + 0.2, rng, ['#2e5d8a', '#c9b48d', '#8a2a2a', '#e8e4da', '#1d1d1d'], true); // product bottles along the console
    // clipper + comb + blue disinfectant jar on the console
    k.get('paint').box(x0 + 0.32, 0.965, z + 0.25, 0.05, 0.035, 0.16, { col: C('#1b1b1b') }); k.get('paint').box(x0 + 0.38, 0.952, z + 0.05, 0.03, 0.006, 0.17, { col: C('#202020') });
    lathe(k.get('glass'), x0 + 0.24, 0.945, z + 0.4, [[0.05, 0], [0.05, 0.2], [0.055, 0.21], [0.001, 0.215]], 14); lathe(k.get('paint'), x0 + 0.24, 0.95, z + 0.4, [[0.046, 0], [0.046, 0.15], [0.001, 0.15]], 14, C('#2d6fb3'));
    // hydraulic barber chair: chrome base + column, leather seat / back / headrest, armrests, footrest
    const cx = x0 + 1.25; const ch = k.get('chrome'), lb = k.get('leatherBlk');
    ch.cylinder(cx, 0, z, 0.3, 0.3, 0.04, 24, { col: [0.85, 0.86, 0.88] }); ch.cylinder(cx, 0.04, z, 0.075, 0.06, 0.34, 16, { col: [0.85, 0.86, 0.88] }); ch.cylinder(cx, 0.36, z, 0.17, 0.17, 0.05, 18, { col: [0.6, 0.6, 0.62] });
    lb.box(cx, 0.48, z, 0.52, 0.12, 0.5, { col: [1, 1, 1] }); lb.box(cx + 0.27, 0.86, z, 0.1, 0.78, 0.5, { col: [1, 1, 1], rotY: 0 }); lb.box(cx + 0.29, 1.34, z, 0.08, 0.2, 0.28, { col: [1, 1, 1] }); ch.box(cx + 0.29, 1.2, z, 0.03, 0.12, 0.04, { col: [0.85, 0.86, 0.88] });
    for (const sg of [-1, 1]) { ch.box(cx, 0.66, z + sg * 0.28, 0.46, 0.035, 0.05, { col: [0.85, 0.86, 0.88] }); lb.box(cx - 0.02, 0.69, z + sg * 0.28, 0.4, 0.04, 0.07, { col: [1, 1, 1] }); ch.box(cx + 0.19, 0.57, z + sg * 0.28, 0.03, 0.18, 0.03, { col: [0.85, 0.86, 0.88] }); }
    ch.box(cx - 0.42, 0.22, z, 0.06, 0.03, 0.36, { col: [0.85, 0.86, 0.88] }); ch.box(cx - 0.3, 0.3, z, 0.26, 0.025, 0.04, { col: [0.85, 0.86, 0.88] });
    ob(obs, cx, z, 0.62, 0.62); chairs.push({ x: cx, z, yaw: -Math.PI / 2 }); // seated facing the mirror (−x)
  }
  // wash station at the back: ceramic basin on a walnut cabinet, mixer tap, towel stacks on open shelves
  { const z = z0 + 0.32, x = x1 - 1.0; wal.box(x, 0.43, z, 0.9, 0.86, 0.55, { col: [1, 1, 1] }); k.get('paint').box(x, 0.88, z, 0.92, 0.04, 0.57, { col: C('#ebe7e0') }); lathe(k.get('paint'), x, 0.82, z, [[0.2, 0.08], [0.18, 0.02], [0.08, 0.0]], 18, C('#f4f2ee'));
    k.get('chrome').cylinder(x, 0.9, z - 0.22, 0.015, 0.015, 0.22, 8, { col: [0.85, 0.86, 0.88] }); k.get('chrome').box(x, 1.11, z - 0.15, 0.025, 0.025, 0.16, { col: [0.85, 0.86, 0.88] }); ob(obs, x, z, 0.95, 0.6);
    for (let s = 0; s < 3; s++) { oak.box(x1 - 2.25, 1.0 + s * 0.42, z0 + 0.18, 0.9, 0.03, 0.3, { col: [1, 1, 1] }); for (let t = 0; t < 4; t++) k.get('paint').box(x1 - 2.6 + t * 0.22, 1.06 + s * 0.42 + 0.0, z0 + 0.18, 0.2, 0.09, 0.26, { col: C(['#f2efe8', '#e8e4da', '#2b2b2b', '#f2efe8'][t]) }); } }
  // waiting area (right wall): leather bench, low table with magazines, coat stand, framed style photos
  { const x = x1 - 0.32; const z = zf - 2.8; const lb = k.get('leather'); wal.box(x, 0.22, z, 0.5, 0.44, 2.2, { col: [1, 1, 1] }); lb.box(x, 0.49, z, 0.5, 0.1, 2.2, { col: [1, 1, 1] }); lb.box(x1 - 0.08, 0.8, z, 0.12, 0.55, 2.2, { col: [1, 1, 1] });
    for (let i = 0; i < 4; i++) k.get('paint').box(x - 0.05, 0.85, z - 0.82 + i * 0.55, 0.13, 0.18, 0.012, { col: C('#3a1e14') }); // button tufts line
    ob(obs, x - 0.05, z, 0.62, 2.25);
    const tx = x - 0.9; oak.box(tx, 0.42, z, 0.5, 0.04, 0.9, { col: [1, 1, 1] }); for (const [a, b] of [[-0.2, -0.38], [0.2, -0.38], [-0.2, 0.38], [0.2, 0.38]]) k.get('metal').box(tx + a, 0.2, z + b, 0.03, 0.4, 0.03, { col: C('#1a1a1a') }); ob(obs, tx, z, 0.55, 0.95);
    for (let i = 0; i < 3; i++) k.get('paint').box(tx - 0.08 + i * 0.07, 0.448 + i * 0.006, z - 0.2 + i * 0.16, 0.21, 0.006, 0.28, { col: C(['#b8322a', '#e8e2d2', '#1d4f8a'][i]), rotY: i * 0.3 });
    const cs = k.get('metal'); cs.cylinder(x1 - 0.4, 0, zf - 0.9, 0.18, 0.02, 0.03, 12, { col: C('#141414') }); cs.cylinder(x1 - 0.4, 0, zf - 0.9, 0.018, 0.018, 1.75, 8, { col: C('#141414') }); for (let a = 0; a < 4; a++) cs.box(x1 - 0.4 + Math.cos(a * 1.57) * 0.12, 1.66, zf - 0.9 + Math.sin(a * 1.57) * 0.12, 0.18, 0.015, 0.015, { col: C('#141414'), rotY: -a * 1.57 }); ob(obs, x1 - 0.4, zf - 0.9, 0.4, 0.4);
    const styles = ['Skin fade', 'Classic side part', 'Textured crop', 'Pompadour'];
    for (let i = 0; i < 4; i++) frame(g, k, 'barberStyle' + i, x1 - 0.03, 1.75, z - 0.9 + i * 0.6, -Math.PI / 2, 0.42, 0.55, (a, w, h) => { a.fillStyle = '#ece6d8'; a.fillRect(0, 0, w, h); // head silhouette in profile with the cut
      a.fillStyle = '#6b4a36'; a.beginPath(); a.ellipse(w * 0.5, h * 0.45, w * 0.24, h * 0.24, 0, 0, 7); a.fill(); a.fillRect(w * 0.42, h * 0.62, w * 0.16, h * 0.2);
      a.fillStyle = '#16100c'; const t = i; a.beginPath(); a.ellipse(w * 0.5, h * (0.3 - (t === 3 ? 0.04 : 0)), w * (0.25 + (t === 3 ? 0.02 : 0)), h * (t === 0 ? 0.1 : t === 3 ? 0.16 : 0.13), 0, Math.PI, 0); a.fill(); if (t === 0) { a.fillStyle = 'rgba(22,16,12,0.35)'; a.fillRect(w * 0.26, h * 0.3, w * 0.48, h * 0.1); }
      a.fillStyle = '#1c1c1c'; a.font = `600 ${Math.round(h * 0.07)}px "Barlow Condensed", sans-serif`; a.textAlign = 'center'; a.fillText(styles[i].toUpperCase(), w / 2, h * 0.93); });
  }
  // reception counter by the door with a till, a ceiling fan, pendants over the stations, barber-pole stripe on the back wall
  { const x = x1 - 0.9, z = zf - 0.75; wal.box(x, 0.5, z, 1.2, 1.0, 0.5, { col: [1, 1, 1] }); k.get('marbleDark').box(x, 1.02, z, 1.26, 0.04, 0.56, { col: [1, 1, 1] }); k.get('paint').box(x + 0.2, 1.12, z, 0.3, 0.16, 0.22, { col: C('#222') }); ob(obs, x, z, 1.25, 0.55); }
  for (let i = 0; i < nSt; i++) pendant(k, x0 + 1.25, H - 0.75, zf - 2.2 - i * 2.1, H, '#0f0f0f');
  const pole = imagePlane('barberMural', 1.4, 0.9, 512, 330, (a, w, h) => { a.fillStyle = '#f0ebe0'; a.fillRect(0, 0, w, h); a.strokeStyle = '#1a1a1a'; a.lineWidth = 8; a.strokeRect(14, 14, w - 28, h - 28); a.fillStyle = '#1a1a1a'; a.textAlign = 'center';
    a.font = '700 64px "Barlow Condensed", sans-serif'; a.fillText('RAZOR & CO.', w / 2, h * 0.42); a.font = '500 26px "Manrope", sans-serif'; a.fillText('GENTLEMEN\'S BARBERS · COLOMBO 03', w / 2, h * 0.6); a.font = '600 22px "Manrope", sans-serif'; a.fillText('HAIRCUT · FADE · BEARD · HOT TOWEL SHAVE', w / 2, h * 0.76); });
  if (pole) { pole.position.set(0, 1.95, z0 + 0.045); g.add(pole); }
  k.into(g);
  const lights = [{ p: [x0 + 1.25, H - 0.85, zf - 2.2], color: 0xffe2bc, i: 9, d: 6, decay: 1.4 }, { p: [x0 + 1.25, H - 0.85, zf - 4.3], color: 0xffe2bc, i: 9, d: 6, decay: 1.4 }, { p: [x1 - 1.3, H - 0.5, (z0 + zf) / 2], color: 0xfff1dc, i: 11, d: 9, decay: 1.4 }, { p: [0, H - 0.4, zf - 0.8], color: 0xfff1dc, i: 6, d: 6, decay: 1.5 }, { p: [x1 - 1.0, H - 0.6, z0 + 0.8], color: 0xfff4e6, i: 5, d: 5, decay: 1.5 }];
  const room = base(game, def, g, { x0, x1, z0, z1: zf - 0.02 }, obs, lights, H);
  room.chairs = chairs; room.keeper = keeperAt(g, def.keeper, chairs[0].x + 0.75, chairs[0].z + 0.55, Math.PI / 2); room.keeperPos = [chairs[0].x + 0.75, chairs[0].z + 0.55]; room.keeperHome = room.keeperPos.slice();
  room.spot = { x: chairs[0].x + 0.55, z: chairs[0].z, r: 0.9, label: 'Sit in the barber chair' };
  return room;
}

// ------------------------------------------------------------------------------------------------ tattoo studios
function buildTattoo(game, def, site) {
  const { w: W, d: D } = fit(def, site); const H = def.H; const g = new THREE.Group(); const k = new Kit(); const obs = []; const rng = rngOf(def.light ? 63 : 52); const lightV = !!def.light;
  const S = shell(k, g, W, D, H, lightV ? { floor: { kind: 'wood', seed: 63 }, wall: 'plaster', wallCol: '#f3f0ea', ceil: '#f6f4ef', skirtCol: '#c8b89a' } : { floor: { kind: 'concrete', size: 1.2, colors: ['#5a5854', '#56544f'], grout: '#2a2928', rough: 0.35, seed: 52 }, wall: 'brick', frontWall: 'brick', wallCol: '#ffffff', ceil: '#1c1c1d', skirtCol: '#111' });
  const { x0, x1, z0, zf } = S;
  if (!lightV) { const pl = k.get('paint'); pl.box(0, H - 0.5, z0 + 0.02, W, 1.0, 0.02, { col: C('#141414') }); pl.box(x0 + 0.012, H - 0.5, (z0 + zf) / 2, 0.02, 1.0, D, { col: C('#141414') }); pl.box(x1 - 0.012, H - 0.5, (z0 + zf) / 2, 0.02, 1.0, D, { col: C('#141414') }); }
  else { const t = k.get('paint'); for (let y = 0.1; y < 1.3; y += 0.075) for (let z = zf - 0.08; z > z0; z -= 0.15) t.box(x1 - 0.006, y + 0.035, z - 0.075, 0.012, 0.07, 0.145, { col: C(((y * 100 + z * 10) | 0) % 3 ? '#f6f6f2' : '#eeeeea') }); } // subway tile on the station wall
  const stations = []; const nSt = lightV ? 2 : 1;
  for (let i = 0; i < nSt; i++) { const z = zf - 3.0 - i * 2.8, x = x0 + 1.35; const lb = k.get('leatherBlk'), ch = k.get('chrome');
    // tattoo bed: hydraulic base, padded seat that tilts into a back rest, arm rests
    ch.cylinder(x, 0, z, 0.32, 0.32, 0.04, 20, { col: [0.25, 0.25, 0.27] }); ch.cylinder(x, 0.04, z, 0.08, 0.07, 0.4, 14, { col: [0.8, 0.8, 0.82] });
    lb.box(x, 0.56, z + 0.15, 0.62, 0.12, 0.9, { col: [1, 1, 1] }); lb.box(x, 0.84, z - 0.52, 0.62, 0.11, 0.62, { col: [1, 1, 1], rotY: 0 }); lb.box(x, 0.48, z + 0.82, 0.55, 0.1, 0.45, { col: [1, 1, 1] });
    for (const sg of [-1, 1]) { lb.box(x + sg * 0.48, 0.74, z - 0.1, 0.16, 0.06, 0.6, { col: [1, 1, 1] }); ch.box(x + sg * 0.48, 0.66, z - 0.1, 0.03, 0.12, 0.03, { col: [0.8, 0.8, 0.82] }); }
    ob(obs, x, z + 0.1, 1.15, 1.9);
    // artist's stool + rolling tray (machine, ink caps, gloves box, wrapped grips), LED ring lamp on an arm
    const sx = x + 0.95, sz = z - 0.1; ch.cylinder(sx, 0, sz, 0.24, 0.24, 0.03, 14, { col: [0.2, 0.2, 0.2] }); ch.cylinder(sx, 0.03, sz, 0.03, 0.03, 0.42, 8, { col: [0.8, 0.8, 0.82] }); lb.cylinder(sx, 0.45, sz, 0.2, 0.2, 0.07, 18, { col: [1, 1, 1] }); ob(obs, sx, sz, 0.45, 0.45);
    const tx = x + 0.9, tz = z + 0.75; ch.cylinder(tx, 0, tz, 0.2, 0.2, 0.025, 12, { col: [0.2, 0.2, 0.2] }); ch.cylinder(tx, 0.025, tz, 0.02, 0.02, 0.85, 8, { col: [0.8, 0.8, 0.82] }); k.get('metal').box(tx, 0.88, tz, 0.5, 0.02, 0.36, { col: C('#b8bcbe') }); ob(obs, tx, tz, 0.5, 0.4);
    for (let j = 0; j < 10; j++) lathe(k.get('paint'), tx - 0.18 + (j % 5) * 0.035, 0.89, tz - 0.12 + Math.floor(j / 5) * 0.035, [[0.012, 0], [0.012, 0.018], [0.001, 0.018]], 8, C(['#0d0d0d', '#b51f1f', '#1d4f8a', '#2a7a3a', '#d4a12a'][j % 5]));
    k.get('paint').box(tx + 0.1, 0.92, tz + 0.05, 0.12, 0.05, 0.035, { col: C('#202022') }); k.get('paint').box(tx + 0.16, 0.92, tz - 0.09, 0.2, 0.07, 0.1, { col: C('#3a6fb8') });
    const lx = x - 0.65, lz = z - 0.95; ch.cylinder(lx, 0, lz, 0.22, 0.22, 0.03, 14, { col: [0.15, 0.15, 0.15] }); ch.cylinder(lx, 0.03, lz, 0.018, 0.018, 1.65, 8, { col: [0.15, 0.15, 0.15] }); ch.box(lx + 0.3, 1.66, lz + 0.25, 0.7, 0.02, 0.02, { col: [0.15, 0.15, 0.15], rotY: -0.7 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); ring.position.set(lx + 0.56, 1.58, lz + 0.5); ring.rotation.set(-1.0, 0.4, 0); g.add(ring); ob(obs, lx, lz, 0.4, 0.4);
    stations.push({ x, z: z + 0.15, yaw: Math.PI });
  }
  // flash-art wall: framed sheets of designs (the same art the tattoo menu applies to the skin)
  { const per = Math.max(3, Math.floor((D - 2.5) / 0.75)); for (let i = 0; i < per; i++) { const id = TATTOO_DESIGNS[(i * 3 + (lightV ? 5 : 0)) % TATTOO_DESIGNS.length].id;
      frame(g, k, 'flash' + id + (lightV ? 'L' : 'D'), x1 - 0.03, 1.72 + (i % 2) * 0.62 - 0.31, zf - 1.3 - Math.floor(i / 2) * 0.75 - (i % 2) * 0.0, -Math.PI / 2, 0.5, 0.56, (a, w, h) => { a.fillStyle = lightV ? '#fbf8f1' : '#ece4d2'; a.fillRect(0, 0, w, h); drawTattooDesign(a, id, w * 0.08, h * 0.06, w * 0.84, h * 0.84, { ink: '#141414', color: true }); }, lightV ? '#b89a6a' : '#0e0e0e'); } }
  // reception: counter with portfolio books, a glass jewellery case, sofa, plant, neon sign
  { const x = x1 - 1.1, z = zf - 0.8; const top = lightV ? k.get('oak') : k.get('marbleDark'); (lightV ? k.get('paint') : k.get('ebony')).box(x, 0.5, z, 1.5, 1.0, 0.55, { col: lightV ? C('#f0ece4') : [1, 1, 1] }); top.box(x, 1.02, z, 1.56, 0.04, 0.6, { col: [1, 1, 1] }); ob(obs, x, z, 1.55, 0.6);
    for (let i = 0; i < 3; i++) k.get('paint').box(x - 0.45 + i * 0.32, 1.06, z + 0.05, 0.24, 0.03, 0.32, { col: C(['#141414', '#5a1d1d', '#1a2a3a'][i]) });
    k.get('glass').box(x + 0.4, 1.14, z, 0.6, 0.2, 0.4); for (let i = 0; i < 6; i++) lathe(k.get('brass'), x + 0.18 + i * 0.08, 1.045, z, [[0.012, 0], [0.012, 0.004], [0.001, 0.004]], 10);
    const sofa = lightV ? k.get('fabric') : k.get('leather'); const sx = x0 + 0.5, sz = zf - 0.95; sofa.box(sx, 0.22, sz, 0.8, 0.44, 1.6, { col: lightV ? C('#7a8a6a') : [1, 1, 1] }); sofa.box(sx - 0.32, 0.6, sz, 0.18, 0.5, 1.6, { col: lightV ? C('#6d7c5e') : [0.85, 0.85, 0.85] }); ob(obs, sx, sz, 0.85, 1.65);
    lathe(k.get('paint'), x0 + 0.45, 0, z0 + 0.45, [[0.16, 0], [0.2, 0.36], [0.21, 0.38], [0.001, 0.38]], 14, C(lightV ? '#e9e4da' : '#2a2a2a')); for (let l = 0; l < 9; l++) k.get('paint').box(x0 + 0.45 + Math.cos(l) * 0.12, 0.65 + (l % 3) * 0.12, z0 + 0.45 + Math.sin(l) * 0.12, 0.05, 0.42, 0.012, { col: C(l % 2 ? '#2f6b34' : '#3f8a3e'), rotY: l * 0.7 }); ob(obs, x0 + 0.45, z0 + 0.45, 0.45, 0.45);
    const neon = imagePlane('neon' + (lightV ? 'L' : 'D'), 1.3, 0.62, 512, 244, (a, w, h) => { a.clearRect(0, 0, w, h); a.lineCap = 'round'; a.lineJoin = 'round'; a.shadowColor = lightV ? '#ffb24a' : '#ff3d8b'; a.shadowBlur = 16; a.strokeStyle = lightV ? '#ffd9a0' : '#ff7ab8'; a.lineWidth = 7;
      a.font = '700 86px "Barlow Condensed", sans-serif'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.strokeText(lightV ? 'SERENDIB INK' : 'BLACK LOTUS', w / 2, h * 0.36); a.lineWidth = 5; a.font = '600 44px "Barlow Condensed", sans-serif'; a.strokeText('TATTOO STUDIO', w / 2, h * 0.76); }, { emissive: 2.2, transparent: true });
    if (neon) { neon.position.set(0, 2.25, z0 + 0.06); g.add(neon); } }
  k.into(g);
  const lights = [{ p: [x0 + 1.35, H - 0.6, zf - 3.0], color: 0xfff4ea, i: 10, d: 6, decay: 1.4 }, { p: [x1 - 1.1, H - 0.7, zf - 0.9], color: lightV ? 0xffe2bc : 0xffd0e0, i: 6, d: 6, decay: 1.5 }, { p: [0, H - 0.5, (z0 + zf) / 2], color: lightV ? 0xfff1dc : 0xffe6cc, i: lightV ? 10 : 6, d: 9, decay: 1.4 }, { p: [0, 2.2, z0 + 0.5], color: lightV ? 0xffb860 : 0xff4f9a, i: 3, d: 4, decay: 1.6 }];
  if (nSt > 1) lights.push({ p: [x0 + 1.35, H - 0.6, zf - 5.8], color: 0xfff4ea, i: 10, d: 6, decay: 1.4 });
  const k2 = new Kit(); for (let i = 0; i < nSt; i++) pendant(k2, x0 + 1.35, H - 0.65, zf - 3.0 - i * 2.8, H, lightV ? '#e8e4da' : '#0f0f0f'); k2.into(g);
  const room = base(game, def, g, { x0, x1, z0, z1: zf - 0.02 }, obs, lights, H);
  room.chairs = stations; room.keeper = keeperAt(g, def.keeper, stations[0].x + 0.95, stations[0].z - 0.25, -Math.PI / 2); room.keeperPos = [stations[0].x + 0.95, stations[0].z - 0.25];
  room.spot = { x: x1 - 1.1, z: zf - 1.45, r: 1.0, label: 'Look through the tattoo books' };
  return room;
}

// ------------------------------------------------------------------------------------------------ second gun shop
function buildGun(game, def, site) {
  const { w: W, d: D } = fit(def, site); const H = def.H; const g = new THREE.Group(); const k = new Kit(); const obs = []; const rng = rngOf(54);
  const S = shell(k, g, W, D, H, { floor: { kind: 'concrete', size: 1.0, colors: ['#8a8780', '#86837c'], grout: '#4a4844', rough: 0.55, seed: 54 }, wall: 'concreteW', wallCol: '#d9d6cf', ceil: '#2a2b2c', skirtCol: '#1d1e1f' });
  const { x0, x1, z0, zf } = S;
  // pegboard on the side walls (accessories), slat wall + long-gun rack on the back wall behind the counter
  const pg = k.get('pegboard'); pg.box(x0 + 0.02, 1.55, (z0 + zf) / 2 + 0.6, 0.02, 1.7, D - 2.6, { col: [1, 1, 1] }); pg.box(x1 - 0.02, 1.55, (z0 + zf) / 2 + 0.6, 0.02, 1.7, D - 2.6, { col: [1, 1, 1] });
  const m = k.get('metal'); const ccz = z0 + 2.2; // counter line
  for (let i = 0; i < 9; i++) m.box(0, 1.0 + i * 0.22, z0 + 0.03, W - 0.4, 0.035, 0.05, { col: C('#2c2e30') });
  const longs = ['carbine', 'assault', 'battle', 'bolt', 'semi', 'precision']; longs.forEach((id, i) => { const w = WEAPONS.find((q) => q.id === id); if (!w) return; const gm = buildWeaponModel(w);
    gm.rotation.set(0, -Math.PI / 2, 0); gm.scale.setScalar(1.1); gm.position.set(-W / 2 + 1.0 + (i % 3) * (W - 2) / 2.5, 2.35 - Math.floor(i / 3) * 0.8, z0 + 0.12); g.add(gm);
    for (const s of [-0.32, 0.3]) m.box(gm.position.x + s, gm.position.y - 0.1, z0 + 0.1, 0.03, 0.1, 0.1, { col: C('#8a8d90') }); });
  // glass pistol counter: steel frame, glass top + front, felt bed with three pistols, magazines and ammo
  const cw = W - 1.8, cx = -0.2; m.box(cx, 0.45, ccz, cw, 0.9, 0.62, { col: C('#2b2e31') }); k.get('glass').box(cx, 0.95, ccz, cw - 0.04, 0.012, 0.6); k.get('glass').box(cx, 0.68, ccz + 0.31, cw - 0.04, 0.52, 0.012);
  k.get('velvet').box(cx, 0.6, ccz, cw - 0.1, 0.02, 0.54, { col: [0.25, 0.28, 0.25] }); ob(obs, cx, ccz, cw + 0.02, 0.66);
  for (const z of [-0.29, 0.29]) m.box(cx, 0.952, ccz + z, cw, 0.02, 0.02, { col: C('#9a9da0') });
  ['compact', 'service', 'heavy'].forEach((id, i) => { const w = WEAPONS.find((q) => q.id === id); if (!w) return; const gm = buildWeaponModel(w); gm.rotation.set(-Math.PI / 2, Math.PI / 2, 0, 'XYZ'); gm.position.set(cx - cw / 2 + 0.7 + i * (cw - 1.2) / 2, 0.64, ccz); g.add(gm); });
  for (let i = 0; i < 6; i++) k.get('paint').box(cx - cw / 2 + 0.4 + i * 0.25, 0.64, ccz + 0.18, 0.18, 0.06, 0.1, { col: C(['#b8892c', '#6b7d3a', '#8a2a1e', '#2d4f6b', '#b8892c', '#3a3a3a'][i]) });
  // accessory pegs: holsters, slings, ear defenders, targets, cleaning kits
  for (const sx of [-1, 1]) { const x = sx > 0 ? x1 - 0.06 : x0 + 0.06; for (let r = 0; r < 3; r++) for (let c = 0; c < Math.floor((D - 3) / 0.45); c++) { const z = zf - 1.4 - c * 0.45, y = 1.05 + r * 0.5; const kind = (r * 7 + c * 3 + (sx > 0 ? 1 : 0)) % 5;
      m.box(x, y + 0.14, z, 0.12, 0.012, 0.012, { col: C('#888') });
      if (kind === 0) k.get('leatherBlk').box(x + sx * -0.06, y, z, 0.04, 0.2, 0.12, { col: [1, 1, 1] });
      else if (kind === 1) { k.get('paint').box(x + sx * -0.06, y, z, 0.05, 0.13, 0.16, { col: C('#3a4a2a') }); }
      else if (kind === 2) { k.get('paint').cylinder(x + sx * -0.07, y - 0.04, z - 0.05, 0.04, 0.04, 0.05, 10, { col: C('#d4a12a') }); k.get('paint').cylinder(x + sx * -0.07, y - 0.04, z + 0.05, 0.04, 0.04, 0.05, 10, { col: C('#d4a12a') }); k.get('paint').box(x + sx * -0.07, y + 0.04, z, 0.015, 0.012, 0.11, { col: C('#111') }); }
      else if (kind === 3) k.get('paint').box(x + sx * -0.02, y, z, 0.01, 0.34, 0.24, { col: C('#ece6d6') });
      else k.get('paint').box(x + sx * -0.06, y, z, 0.07, 0.16, 0.22, { col: C('#1f2a3a') }); } }
  // targets on the pegboard (printed silhouettes) and licence notice
  for (let i = 0; i < 2; i++) frame(g, k, 'target' + i, x0 + 0.04, 1.85, zf - 1.6 - i * 1.6, Math.PI / 2, 0.42, 0.6, (a, w, h) => { a.fillStyle = '#efe9da'; a.fillRect(0, 0, w, h); a.fillStyle = '#1b1b1b'; a.beginPath(); a.ellipse(w / 2, h * 0.24, w * 0.13, h * 0.1, 0, 0, 7); a.fill(); a.beginPath(); a.moveTo(w * 0.18, h * 0.95); a.quadraticCurveTo(w * 0.2, h * 0.38, w / 2, h * 0.36); a.quadraticCurveTo(w * 0.8, h * 0.38, w * 0.82, h * 0.95); a.fill();
    a.strokeStyle = '#efe9da'; a.lineWidth = 3; for (let r = 1; r <= 4; r++) { a.beginPath(); a.ellipse(w / 2, h * 0.62, w * 0.07 * r, h * 0.05 * r, 0, 0, 7); a.stroke(); } a.fillStyle = '#c0281c'; a.beginPath(); a.arc(w / 2, h * 0.62, w * 0.035, 0, 7); a.fill(); }, '#c9c3b4');
  frame(g, k, 'gun2notice', x1 - 0.04, 2.1, zf - 0.9, -Math.PI / 2, 0.5, 0.36, (a, w, h) => { a.fillStyle = '#f4efe2'; a.fillRect(0, 0, w, h); a.fillStyle = '#7a1c14'; a.textAlign = 'center'; a.font = `700 ${Math.round(h * 0.14)}px "Barlow Condensed", sans-serif`; a.fillText('LICENCE REQUIRED', w / 2, h * 0.26); a.fillStyle = '#1b1b1b'; a.font = `500 ${Math.round(h * 0.085)}px "Manrope", sans-serif`;
    ['Firearms are sold only to holders of a', 'valid licence issued under the', 'Firearms Ordinance. No loaded weapons', 'inside the premises.'].forEach((t, i) => a.fillText(t, w / 2, h * (0.46 + i * 0.13))); });
  // back office door (closed), CCTV dome, fluorescent battens
  k.get('metal').box(x1 - 0.7, 1.05, z0 + 0.02, 0.9, 2.1, 0.04, { col: C('#4a4d50') }); k.get('chrome').box(x1 - 0.35, 1.05, z0 + 0.05, 0.12, 0.02, 0.03, { col: [0.8, 0.8, 0.8] });
  lathe(k.get('paint'), x1 - 0.5, H - 0.12, zf - 0.6, [[0.07, 0.12], [0.075, 0.1], [0.06, 0.03], [0.001, 0]], 14, C('#1a1a1a'));
  for (const z of [zf - 1.6, (z0 + zf) / 2, z0 + 1.4]) { k.get('metal').box(0, H - 0.04, z, 1.25, 0.06, 0.14, { col: C('#d8d8d6') }); k.get('emissive').box(0, H - 0.075, z, 1.18, 0.012, 0.08, { col: [1, 0.98, 0.94] }); }
  k.into(g);
  const lights = [{ p: [0, H - 0.5, zf - 1.6], color: 0xf4f6ff, i: 9, d: 7, decay: 1.4 }, { p: [0, H - 0.5, (z0 + zf) / 2], color: 0xf4f6ff, i: 11, d: 8, decay: 1.4 }, { p: [0, 2.4, z0 + 0.9], color: 0xffe8cc, i: 8, d: 6, decay: 1.5 }];
  const room = base(game, def, g, { x0, x1, z0, z1: zf - 0.02 }, obs, lights, H);
  room.keeper = keeperAt(g, def.keeper, cx - 0.4, ccz - 0.75, 0); room.keeperPos = [cx - 0.4, ccz - 0.75];
  room.spot = { x: cx, z: ccz + 0.95, r: 1.2, label: 'Browse the counter — buy weapons & ammunition' };
  room.gun = true; return room;
}

// ------------------------------------------------------------------------------------------------ clothing store
// simple shop-display models (hats, folded shirts, shoes, sunglasses) — geometry only, merged into the room's material buckets
function hatModel(k, kind, x, y, z, col, rotY = 0) { const m = k.get(kind === 'straw' ? 'oak' : 'fabric'); const c = C(col);
  if (kind === 'cap' || kind === 'snap') { lathe(m, x, y, z, [[0.095, 0], [0.093, 0.04], [0.075, 0.085], [0.001, 0.1]], 16, c); m.box(x + Math.sin(rotY) * 0.1, y + 0.008, z + Math.cos(rotY) * 0.1, 0.17, 0.01, 0.09, { col: c.map((v) => v * 0.85), rotY }); }
  else if (kind === 'beanie') lathe(m, x, y, z, [[0.092, 0], [0.094, 0.04], [0.085, 0.09], [0.05, 0.13], [0.001, 0.14]], 14, c);
  else if (kind === 'bucket') { lathe(m, x, y, z, [[0.15, -0.025], [0.1, 0.005], [0.095, 0.05], [0.085, 0.09], [0.001, 0.095]], 16, c); }
  else { const br = kind === 'panama' || kind === 'straw' ? 0.17 : kind === 'flat' ? 0.105 : 0.15; lathe(m, x, y, z, [[br, 0], [br * 0.98, 0.01], [0.09, 0.012], [0.088, 0.09], [0.07, 0.11], [0.001, 0.1]], 18, c); k.get('paint').cylinder(x, y + 0.012, z, 0.0905, 0.0905, 0.025, 18, { col: C('#1a1410'), caps: false }); }
}
function shoeModel(k, x, y, z, col, sole, rotY = 0, boot = false) { const m = k.get('leather'); const c = C(col); const cs = Math.cos(rotY), sn = Math.sin(rotY);
  m.box(x, y + 0.045, z, 0.1, 0.07, 0.27, { col: c, rotY }); m.box(x + sn * 0.07, y + 0.035, z + cs * 0.07, 0.095, 0.05, 0.12, { col: c.map((v) => v * 0.95), rotY }); if (boot) m.box(x - sn * 0.07, y + 0.13, z - cs * 0.07, 0.095, 0.14, 0.11, { col: c, rotY });
  k.get('paint').box(x, y + 0.008, z, 0.105, 0.016, 0.28, { col: C(sole), rotY }); }
function shadesModel(k, x, y, z, frameCol, lens, rotY = 0) { const cs = Math.cos(rotY), sn = Math.sin(rotY); const f = k.get('paint');
  for (const sx of [-1, 1]) { const px = x + cs * sx * 0.035, pz = z - sn * sx * 0.035; f.box(px, y, pz, 0.052, 0.036, 0.006, { col: C(frameCol), rotY }); k.get('glass').box(px + sn * 0.004, y, pz + cs * 0.004, 0.046, 0.03, 0.004, { col: C(lens), rotY }); }
  f.box(x, y + 0.01, z, 0.02, 0.005, 0.005, { col: C(frameCol), rotY }); }
function folded(k, x, y, z, col, n = 4, w = 0.3, d = 0.24) { const m = k.get('fabric'); for (let i = 0; i < n; i++) { const c = C(col).map((v) => v * (0.94 + (i % 2) * 0.06)); m.box(x + (i % 2 ? 0.006 : -0.004), y + 0.025 + i * 0.045, z, w, 0.042, d, { col: c }); m.box(x, y + 0.046 + i * 0.045, z + d / 2 - 0.02, w * 0.6, 0.004, 0.03, { col: c.map((v) => v * 0.85) }); } }
function mannequin(k, x, z, rotY, top, bottom, coat) { const m = k.get('paint'), fc = C('#e9e6e0');
  k.get('chrome').cylinder(x, 0, z, 0.18, 0.18, 0.02, 16, { col: [0.75, 0.75, 0.76] }); k.get('chrome').cylinder(x, 0.02, z, 0.012, 0.012, 0.86, 8, { col: [0.75, 0.75, 0.76] });
  lathe(k.get('fabric'), x, 0.86, z, [[0.13, 0], [0.155, 0.12], [0.16, 0.2], [0.145, 0.3], [0.001, 0.3]], 16, C(bottom)); // hips
  for (const sx of [-1, 1]) { const lx = x + Math.cos(rotY) * sx * 0.085, lz = z - Math.sin(rotY) * sx * 0.085; lathe(k.get('fabric'), lx, 0.1, lz, [[0.06, 0], [0.065, 0.4], [0.08, 0.76], [0.001, 0.77]], 10, C(bottom)); }
  lathe(k.get('fabric'), x, 1.16, z, [[0.145, 0], [0.16, 0.14], [0.175, 0.26], [0.19, 0.33], [0.06, 0.38], [0.001, 0.38]], 18, C(coat || top)); // torso (in the garment colour)
  lathe(m, x, 1.54, z, [[0.045, 0], [0.042, 0.06], [0.001, 0.07]], 10, fc); lathe(m, x, 1.6, z, [[0.001, 0], [0.07, 0.04], [0.085, 0.12], [0.07, 0.2], [0.001, 0.23]], 14, fc); // neck + head form
  if (coat) for (const sx of [-1, 1]) { const ax = x + Math.cos(rotY) * sx * 0.2, az = z - Math.sin(rotY) * sx * 0.2; k.get('fabric').cylinder(ax, 0.98, az, 0.045, 0.055, 0.5, 10, { col: C(coat) }); } }
function buildClothing(game, def, site) {
  const { w: W, d: D } = fit(def, site); const H = def.H; const g = new THREE.Group(); const k = new Kit(); const obs = []; const rng = rngOf(55);
  const S = shell(k, g, W, D, H, { floor: { kind: 'wood', seed: 55, colors: ['#b9a184', '#a98e70', '#c2ab8e', '#9d8264'] }, wall: 'plaster', wallCol: '#f1eee8', ceil: '#f7f5f1', skirtCol: '#2a2622' });
  const { x0, x1, z0, zf } = S; const oak = k.get('oak'); const blk = k.get('metal');
  // brick feature wall at the back (shoes), black steel shelving
  k.get('brick').wall(x0 + 0.01, z0 + 0.012, x1 - 0.01, z0 + 0.012, 0, H, [0, 0, W / 1.4, H / 1.4], [1, 1, 1]);
  // LEFT WALL — hat wall: 5 rows of black steel shelves with hats
  const hatKinds = ['cap', 'snap', 'beanie', 'bucket', 'fedora', 'trilby', 'panama', 'flat']; const hatCols = ['#1a1a1a', '#1f2a44', '#7a2a22', '#c8bfa8', '#3a4a2a', '#e8e4da', '#6b4a2a', '#2a3a4a', '#b8a888', '#4a1f2a'];
  const hzA = zf - 1.0, hzB = zf - Math.min(5.6, D * 0.5); for (let r = 0; r < 5; r++) { const y = 0.75 + r * 0.38; blk.box(x0 + 0.17, y, (hzA + hzB) / 2, 0.3, 0.025, hzA - hzB, { col: C('#1b1b1c') });
    let i = 0; for (let z = hzA - 0.2; z > hzB + 0.15; z -= 0.34, i++) hatModel(k, hatKinds[(r * 3 + i) % hatKinds.length], x0 + 0.17, y + 0.013, z, hatCols[(r * 5 + i * 3) % hatCols.length], Math.PI / 2); }
  for (const z of [hzA, hzB]) blk.box(x0 + 0.17, 1.35, z, 0.3, 2.7, 0.03, { col: C('#1b1b1c') }); ob(obs, x0 + 0.17, (hzA + hzB) / 2, 0.36, hzA - hzB);
  // LEFT WALL (back half) — sunglasses: a lit white column of small shelves
  { const z = hzB - 0.9; k.get('paint').box(x0 + 0.2, 1.0, z, 0.36, 2.0, 0.9, { col: C('#f4f2ee') }); for (let r = 0; r < 7; r++) { k.get('glass').box(x0 + 0.24, 0.6 + r * 0.2, z, 0.3, 0.008, 0.84); for (let c = 0; c < 5; c++) shadesModel(k, x0 + 0.3, 0.63 + r * 0.2, z - 0.32 + c * 0.16, ['#111', '#5a3a1a', '#c9a54e', '#9a9da0', '#1a2a4a'][(r + c) % 5], ['#1c1f22', '#3a2a18', '#22382a', '#2a3242', '#5a3a12'][(r * 2 + c) % 5], Math.PI / 2); }
    k.get('emissive').box(x0 + 0.38, 1.98, z, 0.02, 0.02, 0.86, { col: [1, 0.97, 0.9] }); ob(obs, x0 + 0.2, z, 0.4, 0.95); }
  // RIGHT WALL — hanging rails: tops (front half) and coats/jackets, trousers below on a lower rail
  const topCols = ['#f2efe8', '#1a1a1a', '#2f4f6b', '#7b2d26', '#3c4536', '#c9b48d', '#5a6b8a', '#8a6a4a', '#e8d8c8', '#2a2a3a', '#a03a2a', '#4a5a3a'];
  { const za = zf - 1.0, zb = z0 + 1.6; blk.cylinder(x1 - 0.35, 1.72, (za + zb) / 2, 0.012, 0.012, 0.01, 6, { col: C('#111') });
    blk.box(x1 - 0.35, 1.75, (za + zb) / 2, 0.025, 0.025, za - zb, { col: C('#151515') }); blk.box(x1 - 0.35, 0.95, (za + zb) / 2, 0.025, 0.025, za - zb, { col: C('#151515') });
    for (const z of [za, zb, (za + zb) / 2]) blk.box(x1 - 0.18, 1.35, z, 0.36, 0.025, 0.025, { col: C('#151515') });
    let i = 0; for (let z = za - 0.12; z > zb + 0.1; z -= 0.085, i++) { const cHex = topCols[(i * 5) % topCols.length]; k.get('chrome').box(x1 - 0.35, 1.72, z, 0.36, 0.008, 0.008, { col: [0.7, 0.7, 0.7] }); garment(k.get('fabric'), x1 - 0.35, 1.72, z, Math.PI / 2, C(cHex), { w: 0.42, len: 0.66, sleeve: i % 3 ? 0.5 : 0.22 });
      if (i % 2 === 0) { const pc = ['#28303d', '#1f2a3a', '#6b5a3a', '#2d2f33', '#c8b89a', '#3a3f4a'][(i / 2) % 6]; k.get('fabric').box(x1 - 0.35, 0.67, z, 0.36, 0.52, 0.02, { col: C(pc), rotY: Math.PI / 2 }); } }
    ob(obs, x1 - 0.35, (za + zb) / 2, 0.55, za - zb); }
  // centre: two oak display tables with folded tees / shirts / jeans, a long low plinth with mannequins
  const tz = [zf - 2.3, zf - 2.3 - Math.min(2.6, D * 0.25)]; const tx = -0.1;
  tz.forEach((z, j) => { oak.box(tx, 0.78, z, 1.6, 0.05, 0.9, { col: [1, 1, 1] }); for (const [a, b] of [[-0.74, -0.4], [0.74, -0.4], [-0.74, 0.4], [0.74, 0.4]]) blk.box(tx + a, 0.38, z + b, 0.04, 0.76, 0.04, { col: C('#151515') }); oak.box(tx, 0.18, z, 1.5, 0.03, 0.8, { col: [1, 1, 1] });
    for (let c = 0; c < 4; c++) for (let r = 0; r < 2; r++) folded(k, tx - 0.56 + c * 0.37, 0.805, z - 0.2 + r * 0.4, (j ? ['#1f2a3a', '#3a5a7a', '#2a2a2a', '#c8b89a'] : topCols)[(c * 2 + r + j) % (j ? 4 : topCols.length)], 3 + ((c + r) % 3), 0.3, 0.24);
    for (let c = 0; c < 3; c++) folded(k, tx - 0.45 + c * 0.45, 0.2, z, ['#1f2a3a', '#2d3a55', '#3a3f4a'][c], 2, 0.34, 0.26);
    ob(obs, tx, z, 1.65, 0.95); });
  { const z = z0 + 0.9 + 0.6; const pl = k.get('paint'); pl.box(0.2, 0.06, z, 2.4, 0.12, 0.7, { col: C('#d8d4cc') }); ob(obs, 0.2, z, 2.45, 0.75);
    mannequin(k, -0.6, z, 0, '#f2efe8', '#1f2a3a', null); mannequin(k, 0.2, z, 0, '#2f4f6b', '#c8b89a', null); mannequin(k, 1.0, z, 0, '#1a1a1a', '#28303d', '#5a3a28'); }
  // BACK WALL — shoe wall: floating oak shelves with pairs
  { const nR = 5, nC = Math.floor((W - 3.2) / 0.36); const sx0 = -W / 2 + 1.0; for (let r = 0; r < nR; r++) { const y = 0.45 + r * 0.36; oak.box(sx0 + nC * 0.18, y, z0 + 0.16, nC * 0.36 + 0.1, 0.035, 0.3, { col: [1, 1, 1] });
      for (let c = 0; c < nC; c++) { const boot = (r + c) % 7 === 0; const col = ['#e8e8e4', '#1a1a1a', '#5a3a22', '#3b1c12', '#c8b08a', '#2a3242', '#8a2a1e'][(r * 3 + c) % 7]; const sole = ['#e8e8e4', '#d8d4ca', '#2a2522'][(r + c * 2) % 3];
        for (const dx of [-0.055, 0.055]) shoeModel(k, sx0 + c * 0.36 + 0.18 + dx, y + 0.018, z0 + 0.17, col, sole, Math.PI / 2 * 0 + 0.0, boot); } }
    ob(obs, sx0 + nC * 0.18, z0 + 0.16, nC * 0.36 + 0.1, 0.34);
    // fitting rooms: two cubicles in the back-right corner with curtains and mirrors
    const fx = x1 - 0.85; for (let i = 0; i < 2; i++) { const z = z0 + 0.6 + i * 1.15; k.get('paint').box(fx - 0.5, 1.15, z + 0.575, 0.04, 2.3, 0.02, { col: C('#ece8e0') }); k.get('velvet').box(fx - 0.5, 1.1, z, 0.02, 2.05, 1.05, { col: [0.55, 0.5, 0.45] }); k.get('chrome').box(fx - 0.5, 2.18, z, 0.03, 0.02, 1.1, { col: [0.8, 0.8, 0.8] }); }
    ob(obs, fx, z0 + 1.2, 1.7, 2.4); }
  // cash desk by the door (white lacquer + oak top), tissue-wrapped bags, card machine
  { const x = -W / 2 + 1.45, z = zf - 0.9; k.get('paint').box(x, 0.5, z, 1.4, 1.0, 0.6, { col: C('#f4f2ee') }); oak.box(x, 1.02, z, 1.46, 0.04, 0.66, { col: [1, 1, 1] }); k.get('paint').box(x + 0.35, 1.13, z, 0.36, 0.2, 0.26, { col: C('#1a1a1a') }); k.get('paint').box(x - 0.3, 1.09, z + 0.1, 0.07, 0.1, 0.14, { col: C('#202020') });
    for (let i = 0; i < 3; i++) k.get('paint').box(x - 0.55 + i * 0.12, 0.25, z - 0.25, 0.1, 0.42, 0.28, { col: C('#d8cfbf') }); ob(obs, x, z, 1.48, 0.7); }
  // track lights (housings) along two rails
  for (const xx of [-W / 4, W / 4]) { k.get('metal').box(xx, H - 0.02, (z0 + zf) / 2, 0.04, 0.03, D - 1.2, { col: C('#151515') }); for (let z = zf - 1; z > z0 + 0.6; z -= 1.4) { k.get('metal').cylinder(xx + (xx < 0 ? -0.12 : 0.12), H - 0.24, z, 0.04, 0.05, 0.18, 10, { col: C('#151515') }); k.get('emissive').cylinder(xx + (xx < 0 ? -0.12 : 0.12), H - 0.245, z, 0.035, 0.035, 0.006, 10, { col: [1, 0.95, 0.86] }); } }
  k.into(g);
  const lights = [{ p: [-W / 4, H - 0.4, zf - 2], color: 0xfff0dc, i: 12, d: 8, decay: 1.4 }, { p: [W / 4, H - 0.4, zf - 2], color: 0xfff0dc, i: 12, d: 8, decay: 1.4 }, { p: [-W / 4, H - 0.4, z0 + 2], color: 0xfff0dc, i: 12, d: 8, decay: 1.4 }, { p: [W / 4, H - 0.4, z0 + 2], color: 0xfff0dc, i: 12, d: 8, decay: 1.4 }, { p: [0, 1.6, z0 + 0.8], color: 0xffe4c4, i: 6, d: 5, decay: 1.6 }];
  const room = base(game, def, g, { x0, x1, z0, z1: zf - 0.02 }, obs, lights, H);
  room.keeper = keeperAt(g, def.keeper, -W / 2 + 1.45, zf - 1.5, 0); room.keeperPos = [-W / 2 + 1.45, zf - 1.5];
  room.spots = [{ x: x0 + 0.85, z: (hzA + hzB) / 2, r: 1.3, label: 'Browse hats', cat: 'hats' }, { x: x0 + 0.95, z: hzB - 0.9, r: 1.0, label: 'Try on sunglasses', cat: 'glasses' }, { x: x1 - 1.05, z: zf - 2.5, r: 1.4, label: 'Browse tops', cat: 'tops' }, { x: x1 - 1.05, z: z0 + 2.6, r: 1.3, label: 'Browse trousers', cat: 'pants' }, { x: -0.6, z: z0 + 0.95 + 0.4, r: 1.2, label: 'Browse shoes', cat: 'shoes' }, { x: tx, z: tz[0] + 0.85, r: 1.0, label: 'Browse tops', cat: 'tops' }, { x: tx, z: tz[1] + 0.85, r: 1.0, label: 'Browse trousers', cat: 'pants' }];
  return room;
}

// ------------------------------------------------------------------------------------------------ luxury boutique
function buildLuxury(game, def, site) {
  const { w: W, d: D } = fit(def, site); const H = def.H; const g = new THREE.Group(); const k = new Kit(); const obs = [];
  const S = shell(k, g, W, D, H, { floor: { kind: 'granite', size: 0.8, colors: ['#e8e4dc', '#e2ded6'], grout: '#b8b2a6', rough: 0.1, seed: 56 }, wall: 'plaster', wallCol: '#ebe6dc', ceil: '#f4f1ea', skirt: 'marbleDark', skirtCol: '#ffffff', cornice: '#efe9dc' });
  const { x0, x1, z0, zf } = S; const wal = k.get('walnut'), br = k.get('brass');
  // walnut panelling with brass reveals on both side walls, lit coat niches set into it
  const nN = Math.max(4, Math.floor((D - 2.4) / 1.25)); const nz0 = zf - 1.2;
  for (const sx of [-1, 1]) { const x = sx > 0 ? x1 - 0.05 : x0 + 0.05; wal.box(x, H / 2 - 0.1, (z0 + zf) / 2 - 0.1, 0.1, H - 0.4, D - 0.4, { col: [1, 1, 1] });
    for (let i = 0; i < nN; i++) { const z = nz0 - i * 1.25 - 0.55; const nx = x - sx * 0.07;
      k.get('ebony').box(nx - sx * 0.005, 1.45, z, 0.02, 2.1, 1.0, { col: [1, 1, 1] }); // niche back
      br.box(nx - sx * 0.02, 1.45, z - 0.52, 0.04, 2.14, 0.02, { col: C('#c9a54e') }); br.box(nx - sx * 0.02, 1.45, z + 0.52, 0.04, 2.14, 0.02, { col: C('#c9a54e') }); br.box(nx - sx * 0.02, 2.52, z, 0.04, 0.02, 1.06, { col: C('#c9a54e') });
      k.get('emissive').box(nx - sx * 0.04, 2.48, z, 0.02, 0.01, 0.9, { col: [1, 0.9, 0.72] });
      br.box(nx - sx * 0.2, 2.0, z, 0.012, 0.012, 0.8, { col: C('#c9a54e') }); // brass rail
      const coatCols = ['#1d1f24', '#5a3a28', '#2b2f3a', '#7a6a58', '#3a2a22', '#1a1a1a', '#4a3b30', '#2f3a33'];
      for (let j = 0; j < 3; j++) { const cz = z - 0.25 + j * 0.25; garment(k.get('fabric'), nx - sx * 0.2, 2.0, cz, sx > 0 ? -Math.PI / 2 : Math.PI / 2, C(coatCols[(i * 3 + j + (sx > 0 ? 4 : 0)) % coatCols.length]), { w: 0.46, len: 0.92, sleeve: 0.6, coat: true }); }
      ob(obs, nx - sx * 0.2, z, 0.5, 1.0); } }
  // centre: three marble plinths with shoes under glass cubes, a velvet chesterfield sofa, a long walnut counter at the back
  const pcols = [['#3b1c12', '#2a2522'], ['#1a1a1a', '#1a1a1a'], ['#6b3a1e', '#3a2a1c']];
  for (let i = 0; i < 3; i++) { const z = zf - 2.0 - i * Math.min(1.7, (D - 4.5) / 3); const x = 0; k.get('marble').box(x, 0.45, z, 0.55, 0.9, 0.55, { col: [1, 1, 1] }); br.box(x, 0.905, z, 0.57, 0.01, 0.57, { col: C('#c9a54e') });
    for (const dx of [-0.06, 0.06]) shoeModel(k, x + dx, 0.91, z, pcols[i][0], pcols[i][1], 0, i === 2); k.get('glass').box(x, 1.13, z, 0.5, 0.44, 0.5); ob(obs, x, z, 0.6, 0.6); }
  { const z = z0 + 2.3, x = x0 + 1.2; const v = k.get('velvet'); v.box(x, 0.22, z, 0.85, 0.44, 1.9, { col: [1, 1, 1] }); v.box(x - 0.36, 0.62, z, 0.16, 0.42, 1.9, { col: [0.9, 0.9, 0.9] }); for (const sz of [-1, 1]) v.box(x, 0.56, z + sz * 0.95, 0.85, 0.3, 0.16, { col: [0.95, 0.95, 0.95] });
    for (const [a, b] of [[-0.35, -0.85], [0.35, -0.85], [-0.35, 0.85], [0.35, 0.85]]) br.cylinder(x + a, 0, z + b, 0.025, 0.02, 0.08, 8, { col: C('#c9a54e') }); ob(obs, x, z, 0.9, 2.05);
    k.get('marbleDark').cylinder(x + 1.0, 0.42, z, 0.32, 0.32, 0.03, 24, { col: [1, 1, 1] }); br.cylinder(x + 1.0, 0, z, 0.04, 0.04, 0.42, 10, { col: C('#c9a54e') }); br.cylinder(x + 1.0, 0, z, 0.2, 0.2, 0.02, 18, { col: C('#c9a54e') }); ob(obs, x + 1.0, z, 0.66, 0.66);
    lathe(k.get('paint'), x + 1.0, 0.45, z, [[0.05, 0], [0.07, 0.08], [0.04, 0.2], [0.05, 0.26], [0.001, 0.26]], 16, C('#f2efe8')); for (let l = 0; l < 6; l++) k.get('paint').box(x + 1.0 + Math.cos(l) * 0.05, 0.82, z + Math.sin(l) * 0.05, 0.01, 0.3, 0.06, { col: C('#e8e2d4'), rotY: l }); }
  { const z = z0 + 0.7, x = x1 - 2.0; wal.box(x, 0.5, z, 2.2, 1.0, 0.6, { col: [1, 1, 1] }); k.get('marbleDark').box(x, 1.02, z, 2.26, 0.04, 0.66, { col: [1, 1, 1] }); br.box(x, 0.06, z + 0.3, 2.2, 0.03, 0.01, { col: C('#c9a54e') });
    k.get('paint').box(x + 0.6, 1.07, z, 0.36, 0.05, 0.26, { col: C('#14161a') }); k.get('leather').box(x - 0.5, 1.08, z, 0.42, 0.08, 0.3, { col: [0.9, 0.9, 0.9] }); ob(obs, x, z, 2.3, 0.7);
    // full-length mirror in a brass frame + an orchid on the counter
    br.box(x1 - 0.12, 1.15, z0 + 1.9, 0.04, 1.95, 0.75, { col: C('#c9a54e') }); k.get('mirror').box(x1 - 0.145, 1.15, z0 + 1.9, 0.01, 1.85, 0.66, { col: [0.93, 0.94, 0.95] }); }
  // brass chandelier (two tiers), cove lighting strip
  { const cx = 0, cz = (z0 + zf) / 2; br.cylinder(cx, H - 0.6, cz, 0.008, 0.008, 0.6, 6, { col: C('#c9a54e') }); lathe(br, cx, H - 0.95, cz, [[0.001, 0], [0.38, 0.05], [0.4, 0.07], [0.02, 0.1]], 24, C('#c9a54e'));
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.get('emissive').cylinder(cx + Math.cos(a) * 0.36, H - 0.93, cz + Math.sin(a) * 0.36, 0.012, 0.012, 0.09, 6, { col: [1, 0.86, 0.6] }); }
    for (const z of [z0 + 0.2, zf - 0.2]) k.get('emissive').box(0, H - 0.12, z, W - 0.6, 0.012, 0.02, { col: [1, 0.88, 0.7] }); }
  const sign = imagePlane('luxsign', 1.6, 0.4, 512, 128, (a, w, h) => { a.fillStyle = '#16120e'; a.fillRect(0, 0, w, h); a.fillStyle = '#c9a54e'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.font = '500 66px "Playfair Display", Georgia, serif'; a.fillText('MAISON SERENDIB', w / 2, h * 0.52); }, { rough: 0.4 });
  if (sign) { sign.position.set(x1 - 2.0, 1.95, z0 + 0.03); g.add(sign); }
  k.into(g);
  const lights = [{ p: [0, H - 1.2, (z0 + zf) / 2], color: 0xffdcb0, i: 14, d: 9, decay: 1.4 }, { p: [x0 + 0.8, 2.3, zf - 2.5], color: 0xffe0b8, i: 5, d: 4.5, decay: 1.6 }, { p: [x1 - 0.8, 2.3, zf - 2.5], color: 0xffe0b8, i: 5, d: 4.5, decay: 1.6 }, { p: [x0 + 0.8, 2.3, z0 + 2.4], color: 0xffe0b8, i: 5, d: 4.5, decay: 1.6 }, { p: [x1 - 0.8, 2.3, z0 + 2.4], color: 0xffe0b8, i: 5, d: 4.5, decay: 1.6 }, { p: [0, 2.6, zf - 1.0], color: 0xfff0dc, i: 6, d: 6, decay: 1.5 }];
  const room = base(game, def, g, { x0, x1, z0, z1: zf - 0.02 }, obs, lights, H);
  room.keeper = keeperAt(g, def.keeper, x1 - 2.0, z0 + 0.15 + 0.05, 0); room.keeperPos = [x1 - 2.0, z0 + 0.2];
  room.spots = [{ x: x0 + 0.95, z: (z0 + zf) / 2, r: 1.4, label: 'Browse coats', cat: 'coats' }, { x: x1 - 0.95, z: (z0 + zf) / 2, r: 1.4, label: 'Browse coats', cat: 'coats' }, { x: 0.65, z: zf - 2.6, r: 1.4, label: 'Browse shoes', cat: 'luxshoes' }];
  return room;
}

// common room object
function base(game, def, g, bounds, obstacles, lights, H) {
  const room = { id: def.kind, name: def.name, def, g, bounds, obstacles, lights, H, prompt: null };
  room.greet = () => game.hud && game.hud.subtitle(def.name, def.line, '', 3.8);
  room.update = (dt, pl) => { const kp = room.keeper; if (kp && room.keeperPos && !room.keeperBusy) { const want = Math.atan2(pl.x - room.keeperPos[0], pl.z - room.keeperPos[1]); const cur = kp.root.rotation.y; let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; kp.root.rotation.y = cur + d * Math.min(1, dt * 3); }
    if (kp) kp.anim.update(dt, 0);
    let sp = null; for (const q of room.spots || (room.spot ? [room.spot] : [])) if (pl.inside && Math.hypot(pl.x - q.x, pl.z - q.z) < q.r) { sp = q; break; } room.near = sp; room.prompt = sp && !room.busy ? `${game.hud.key('interact')} ${sp.label}` : null;
    if (room.tick) room.tick(dt, pl); };
  return room;
}

export function buildShopInterior(game, id, site) {
  const def = SHOP_DEFS[id]; if (!def) throw new Error('no shop ' + id);
  const r = def.kind === 'barber' ? buildBarber(game, def, site) : def.kind === 'tattoo' ? buildTattoo(game, def, site) : def.kind === 'gun' ? buildGun(game, def, site) : def.kind === 'clothing' ? buildClothing(game, def, site) : buildLuxury(game, def, site);
  r.shop = id; return r;
}
