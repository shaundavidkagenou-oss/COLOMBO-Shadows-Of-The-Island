// Ceylon Arms Co. — walk-in interior of the licensed gun shop (fictional business). Built like the other story interiors
// beneath the street and entered through a fade (Interiors.enter). Everything on display is the game's own weapon model
// (WeaponModels.buildWeaponModel), so what is on the wall is exactly what the buy menu sells.
// Layout, door at the front (z1): customer floor → glass display counter across the room → staff area with the long-gun
// slat wall behind the counter. Ammunition shelving on the left wall, a locked glass long-gun cabinet on the right wall.
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { RNG } from '../core/rng.js';
import { WEAPONS } from '../combat/WeaponDefs.js';
import { buildWeaponModel } from '../combat/WeaponModels.js';
import { STOCK, SHOP_NAME } from '../combat/Shop.js';

const Y = -40; const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const GUNSHOP_DEF = { name: SHOP_NAME, w: 9, d: 12, keeper: { seed: 9181, sex: 'm', age: 'elder', outfit: 'shirt', top: '#e9e6dc', hair: 'short' }, line: 'Licence on file? Good. Look all you like — ask before you touch.' };
const rs = (n) => 'Rs. ' + n.toLocaleString('en-LK');

// small canvas label (signage, price tags, certificate) — plain English print, no pseudo-text
function labelTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const a = cv.getContext('2d'); draw(a, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function plane(tex, w, h, { emissive = 0, rough = 0.7 } = {}) {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: rough, metalness: 0, emissive: emissive ? 0xffffff : 0x000000, emissiveMap: emissive ? tex : null, emissiveIntensity: emissive });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

export function buildGunShopInterior(game, door) {
  const D = GUNSHOP_DEF; const mb = new MultiBuilder(); const rng = new RNG(1847);
  const cx = door.x, cz = door.z - 200; const x0 = cx - D.w / 2, x1 = cx + D.w / 2, z0 = cz - D.d, z1 = cz; const H = 3.4;
  const paint = mb.get('paint'), conc = mb.get('concrete'), metal = mb.get('metal'), glass = mb.get('glass'), emis = mb.get('emissive');
  const obstacles = []; const ob = (bx, bz, w, d) => obstacles.push({ x0: bx - w / 2, x1: bx + w / 2, z0: bz - d / 2, z1: bz + d / 2 });
  const g = new THREE.Group();

  // ---- shell: polished dark tile floor, timber wainscot under charcoal-green walls, panel ceiling
  conc.hrect(x0, z0, x1, z1, Y, 0.8, C('#3b3d3f'));
  for (let x = x0 + 0.6; x < x1; x += 0.6) paint.box(x, Y + 0.002, cz - D.d / 2, 0.012, 0.004, D.d, { col: C('#2a2b2c') }); // tile joints
  for (let z = z0 + 0.6; z < z1; z += 0.6) paint.box(cx, Y + 0.002, z, D.w, 0.004, 0.012, { col: C('#2a2b2c') });
  paint.hrect(x0, z0, x1, z1, Y + H, 1, C('#e8e6e0'), true);
  const wallC = C('#33413a'), woodC = C('#4a2f1e');
  paint.wall(x0, z0, x1, z0, Y, Y + H, [0, 0, 1, 1], wallC); paint.wall(x0, z1, x0, z0, Y, Y + H, [0, 0, 1, 1], wallC); paint.wall(x1, z1, x0, z1, Y, Y + H, [0, 0, 1, 1], wallC); paint.wall(x1, z0, x1, z1, Y, Y + H, [0, 0, 1, 1], wallC);
  // wainscot + dado rail on the customer-side walls
  paint.box(x0 + 0.02, Y + 0.55, cz - D.d / 2, 0.04, 1.1, D.d, { col: woodC }); paint.box(x1 - 0.02, Y + 0.55, cz - D.d / 2, 0.04, 1.1, D.d, { col: woodC });
  paint.box(cx, Y + 0.55, z1 - 0.02, D.w, 1.1, 0.04, { col: woodC });
  for (const [x, z, w, d] of [[x0 + 0.05, cz - D.d / 2, 0.05, D.d], [x1 - 0.05, cz - D.d / 2, 0.05, D.d], [cx, z1 - 0.05, D.w, 0.05]]) paint.box(x, Y + 1.12, z, w, 0.05, d, { col: C('#2e1c10') });
  for (const [x, z, w, d] of [[x0 + 0.04, cz - D.d / 2, 0.06, D.d], [x1 - 0.04, cz - D.d / 2, 0.06, D.d], [cx, z0 + 0.04, D.w, 0.06]]) paint.box(x, Y + H - 0.06, z, w, 0.12, d, { col: C('#d8d4ca') }); // cornice
  // entrance: steel-framed glass door behind a folding security grille
  paint.box(cx, Y + 1.15, z1 - 0.05, 1.5, 2.3, 0.06, { col: C('#202326') }); glass.box(cx, Y + 1.2, z1 - 0.09, 1.2, 1.9, 0.02);
  for (let i = 0; i < 9; i++) metal.box(cx - 0.72 + i * 0.18, Y + 1.15, z1 - 0.12, 0.025, 2.25, 0.025, { col: C('#6b6e70') });
  paint.box(cx, Y + 0.008, z1 - 0.8, 1.6, 0.016, 1.0, { col: C('#1d1f1c') }); // door mat
  { const t = labelTex(512, 128, (a, w, h) => { a.fillStyle = '#16100a'; a.fillRect(0, 0, w, h); a.fillStyle = '#e8c76a'; a.font = '700 64px "Barlow Condensed", sans-serif'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.fillText('EXIT', w / 2, h / 2 + 2); });
    const m = plane(t, 0.5, 0.125, { emissive: 0.9 }); m.position.set(cx, Y + 2.48, z1 - 0.07); m.rotation.y = Math.PI; g.add(m); }

  // ---- display counter: dark timber base, glass case top with pistols and ammo boxes on felt, LED strip
  const cz0 = z0 + 3.4, cxa = x0 + 1.4, cxb = x1 - 0.5, cw = cxb - cxa, ccx = (cxa + cxb) / 2;
  paint.box(ccx, Y + 0.45, cz0, cw, 0.9, 0.7, { col: C('#3a2416') });
  paint.box(ccx, Y + 0.06, cz0 + 0.33, cw, 0.12, 0.06, { col: C('#151515') }); // kick plate
  for (let x = cxa + 0.5; x < cxb - 0.2; x += 1.0) paint.box(x, Y + 0.48, cz0 + 0.352, 0.82, 0.6, 0.012, { col: C('#4a3020') }); // raised panels
  paint.box(ccx, Y + 0.905, cz0, cw, 0.03, 0.7, { col: C('#5a1d1d') }); // felt bed
  glass.box(ccx, Y + 1.1, cz0, cw - 0.02, 0.38, 0.68); metal.box(ccx, Y + 1.29, cz0, cw, 0.02, 0.72, { col: C('#9a9c9e') });
  for (const x of [cxa, cxb]) metal.box(x, Y + 1.1, cz0, 0.03, 0.4, 0.72, { col: C('#9a9c9e') });
  emis.box(ccx, Y + 1.275, cz0, cw - 0.1, 0.012, 0.03, { col: [1.0, 0.94, 0.84] });
  ob(ccx, cz0, cw, 0.72);
  // flip-up counter flap on the left closes the staff gap
  paint.box(x0 + 0.7, Y + 0.97, cz0, 1.36, 0.05, 0.7, { col: C('#3a2416') }); paint.box(x0 + 0.7, Y + 0.45, cz0 + 0.3, 1.3, 0.9, 0.05, { col: C('#3a2416') }); ob(x0 + 0.7, cz0, 1.4, 0.72);
  // till, card machine, licence register on the counter
  paint.box(cxb - 0.55, Y + 1.36, cz0 - 0.1, 0.36, 0.12, 0.3, { col: C('#202224') }); emis.box(cxb - 0.55, Y + 1.47, cz0 - 0.16, 0.24, 0.12, 0.012, { col: [0.25, 0.55, 0.45] });
  paint.box(cxb - 1.05, Y + 1.32, cz0 + 0.12, 0.08, 0.04, 0.15, { col: C('#151515') });
  paint.box(cxa + 0.7, Y + 1.32, cz0 + 0.05, 0.42, 0.035, 0.3, { col: C('#1d3a5a') }); paint.box(cxa + 0.7, Y + 1.34, cz0 + 0.05, 0.38, 0.01, 0.27, { col: C('#f2efe6') });

  // ---- shopkeeper's side: slat wall with long guns, pistol board, safe
  const slatZ = z0 + 0.06; paint.box(cx, Y + 1.75, slatZ, D.w - 0.6, 2.5, 0.06, { col: C('#262a2c') });
  for (let y = Y + 0.6; y < Y + 3.0; y += 0.15) metal.box(cx, y, slatZ + 0.04, D.w - 0.7, 0.02, 0.02, { col: C('#4a4f52') });
  { const t = labelTex(1024, 128, (a, w, h) => { a.fillStyle = '#121212'; a.fillRect(0, 0, w, h); a.strokeStyle = '#c9a54e'; a.lineWidth = 4; a.strokeRect(8, 8, w - 16, h - 16);
      a.fillStyle = '#e8c76a'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.font = '700 70px "Barlow Condensed", sans-serif'; a.fillText('CEYLON ARMS CO.', w / 2 - 120, h / 2 + 3);
      a.font = '600 30px "Manrope", sans-serif'; a.fillStyle = '#d8d2c2'; a.fillText('LICENSED FIREARMS DEALER', w / 2 + 300, h / 2 + 2); });
    const m = plane(t, 4.2, 0.52, { emissive: 0.55 }); m.position.set(cx, Y + 3.08, slatZ + 0.06); g.add(m); }
  // racked long guns: two rows of three, barrels pointing left, each with a price tag
  const longs = ['carbine', 'assault', 'battle', 'bolt', 'semi', 'precision'];
  longs.forEach((id, k) => {
    const w = WEAPONS.find((q) => q.id === id); const m = buildWeaponModel(w); const row = Math.floor(k / 3), col = k % 3;
    m.rotation.set(0, -Math.PI / 2, 0); m.scale.setScalar(1.15); m.position.set(cx - 2.6 + col * 2.6 + 0.3, Y + 2.35 - row * 0.85, slatZ + 0.12); g.add(m);
    for (const s of [-0.35, 0.3]) metal.box(m.position.x + s, m.position.y - 0.1, slatZ + 0.1, 0.03, 0.1, 0.1, { col: C('#8a8d90') }); // rack hooks
    const t = labelTex(256, 96, (a, W, Hh) => { a.fillStyle = '#f4efe2'; a.fillRect(0, 0, W, Hh); a.fillStyle = '#1a1a1a'; a.textAlign = 'center'; a.font = '700 30px "Barlow Condensed", sans-serif'; a.fillText(w.name.toUpperCase(), W / 2, 36); a.fillStyle = '#8a1c1c'; a.font = '700 34px "Barlow Condensed", sans-serif'; a.fillText(rs(STOCK[id].price), W / 2, 76); });
    const tag = plane(t, 0.34, 0.13); tag.position.set(m.position.x + 0.05, m.position.y - 0.28, slatZ + 0.1); g.add(tag);
  });
  // pistols and magazines laid on the felt inside the case
  ['compact', 'service', 'heavy'].forEach((id, k) => {
    const w = WEAPONS.find((q) => q.id === id); const m = buildWeaponModel(w); m.rotation.set(-Math.PI / 2, Math.PI / 2, 0, 'XYZ');
    m.position.set(cxa + 1.6 + k * 1.15, Y + 0.95, cz0 - 0.05); g.add(m);
    const t = labelTex(192, 72, (a, W, Hh) => { a.fillStyle = '#f4efe2'; a.fillRect(0, 0, W, Hh); a.fillStyle = '#1a1a1a'; a.textAlign = 'center'; a.font = '700 24px "Barlow Condensed", sans-serif'; a.fillText(w.name.toUpperCase(), W / 2, 28); a.fillStyle = '#8a1c1c'; a.font = '700 26px "Barlow Condensed", sans-serif'; a.fillText(rs(STOCK[id].price), W / 2, 58); });
    const tag = plane(t, 0.2, 0.075); tag.rotation.x = -Math.PI / 2 + 0.35; tag.position.set(m.position.x, Y + 0.94, cz0 + 0.24); g.add(tag);
    for (let j = 0; j < 2; j++) metal.box(m.position.x + 0.28 + j * 0.06, Y + 0.93, cz0 - 0.12, 0.035, 0.02, 0.13, { col: C('#2a2c2e') });
  });
  for (let k = 0; k < 4; k++) paint.box(cxb - 1.9 + k * 0.22, Y + 0.96, cz0 + 0.12, 0.18, 0.08, 0.12, { col: C(['#b8892c', '#6b7d3a', '#8a2a1e', '#2d4f6b'][k]) }); // ammo boxes on show
  // safe and staff stool behind the counter
  metal.box(x1 - 0.6, Y + 0.65, z0 + 1.0, 0.8, 1.3, 0.7, { col: C('#2c3135') }); metal.cylinder(x1 - 0.6, Y + 0.6, z0 + 1.36, 0.08, 0.08, 0.04, 12, { col: C('#b0b2b4') }); ob(x1 - 0.6, z0 + 1.0, 0.8, 0.7);
  metal.cylinder(cx + 1.6, Y, z0 + 2.4, 0.03, 0.03, 0.7, 6, { col: C('#555') }); paint.cylinder(cx + 1.6, Y + 0.7, z0 + 2.4, 0.2, 0.2, 0.06, 12, { col: C('#202020') });

  // ---- left wall: ammunition shelving (three bays) — boxes colour-coded by class, labelled per row
  const shX = x0 + 0.3, shZ0 = z0 + 4.6, shZ1 = z1 - 2.0, shL = shZ1 - shZ0, shC = (shZ0 + shZ1) / 2;
  metal.box(shX, Y + 1.1, shC, 0.5, 2.2, shL, { col: C('#30353a') }); ob(shX, shC, 0.55, shL);
  const rowCols = [['#b8892c', '#c9a040'], ['#6b7d3a', '#57693a'], ['#8a2a1e', '#a0402a'], ['#2d4f6b', '#3a6080']];
  for (let r = 0; r < 4; r++) { const y = Y + 0.3 + r * 0.5; metal.box(shX + 0.02, y - 0.02, shC, 0.5, 0.03, shL, { col: C('#5a5f64') });
    for (let z = shZ0 + 0.14; z < shZ1 - 0.1; z += 0.2) { const n = rng.int(1, 3); for (let s = 0; s < n; s++) paint.box(shX + 0.12 - s * 0.03, y + 0.06 + s * 0.12, z, 0.24, 0.11, 0.16, { col: C(rng.pick(rowCols[r])) }); } }
  { const names = ['HANDGUN ROUNDS', 'RIFLE ROUNDS', 'MARKSMAN ROUNDS', 'MAGAZINES & CARE']; names.forEach((nm, r) => {
      const t = labelTex(512, 64, (a, w, h) => { a.fillStyle = '#e8e2d2'; a.fillRect(0, 0, w, h); a.fillStyle = '#1a1a1a'; a.font = '700 40px "Barlow Condensed", sans-serif'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.fillText(nm, w / 2, h / 2 + 2); });
      const m = plane(t, 0.8, 0.1); m.rotation.y = Math.PI / 2; m.position.set(shX + 0.27, Y + 0.3 + r * 0.5 - 0.075, shC); g.add(m); }); }

  // ---- right wall: locked glass long-gun cabinet, guns standing muzzle-up
  const cbX = x1 - 0.32, cbZ0 = z0 + 4.8, cbZ1 = z1 - 2.6, cbC = (cbZ0 + cbZ1) / 2, cbL = cbZ1 - cbZ0;
  paint.box(cbX + 0.05, Y + 1.15, cbC, 0.5, 2.3, cbL + 0.1, { col: C('#2e1c10') }); paint.box(cbX - 0.02, Y + 1.2, cbC, 0.4, 2.0, cbL - 0.1, { col: C('#5a1d1d') });
  ['carbine', 'assault', 'battle', 'bolt', 'semi'].forEach((id, k) => { const w = WEAPONS.find((q) => q.id === id); const m = buildWeaponModel(w);
    m.rotation.set(-Math.PI / 2, 0, 0); m.position.set(cbX - 0.12, Y + 0.6, cbZ0 + 0.35 + k * (cbL - 0.6) / 4); g.add(m); });
  glass.box(cbX - 0.25, Y + 1.2, cbC, 0.02, 2.0, cbL - 0.06); for (const z of [cbZ0, cbC, cbZ1]) metal.box(cbX - 0.25, Y + 1.2, z, 0.04, 2.02, 0.04, { col: C('#9a9c9e') });
  metal.box(cbX - 0.27, Y + 1.25, cbC + 0.12, 0.03, 0.1, 0.05, { col: C('#d0b060') }); // lock
  ob(cbX, cbC, 0.6, cbL);

  // ---- customer area details: bench, fire extinguisher, notices, certificate, clock, CCTV
  paint.box(cx + 1.2, Y + 0.44, z1 - 0.45, 1.8, 0.06, 0.42, { col: C('#4a2f1e') }); for (const s of [-0.75, 0.75]) metal.box(cx + 1.2 + s, Y + 0.21, z1 - 0.45, 0.05, 0.42, 0.36, { col: C('#2a2a2a') }); ob(cx + 1.2, z1 - 0.45, 1.8, 0.45);
  paint.cylinder(x1 - 0.25, Y + 0.05, z1 - 1.2, 0.09, 0.09, 0.5, 12, { col: C('#b01818') }); metal.box(x1 - 0.12, Y + 0.6, z1 - 1.2, 0.04, 0.12, 0.06, { col: C('#222') });
  const notice = (txt, sub, x, z, ry, w = 0.62) => { const t = labelTex(512, 360, (a, W, Hh) => { a.fillStyle = '#f6f2e6'; a.fillRect(0, 0, W, Hh); a.fillStyle = '#8a1c1c'; a.fillRect(0, 0, W, 70); a.fillStyle = '#fff'; a.font = '700 44px "Barlow Condensed", sans-serif'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.fillText('NOTICE', W / 2, 37);
      a.fillStyle = '#1a1a1a'; a.font = '700 46px "Barlow Condensed", sans-serif'; txt.forEach((l, i) => a.fillText(l, W / 2, 135 + i * 56)); a.font = '500 24px "Manrope", sans-serif'; a.fillStyle = '#444'; a.fillText(sub, W / 2, Hh - 34); });
    const m = plane(t, w, w * 0.7); m.position.set(x, Y + 1.7, z); m.rotation.y = ry; g.add(m); };
  notice(['FIREARM LICENCE', 'REQUIRED FOR', 'EVERY PURCHASE'], 'Ask at the counter', x1 - 0.03, z1 - 3.2, -Math.PI / 2);
  notice(['NO LOADED', 'WEAPONS INSIDE', 'THE SHOP'], 'Thank you', x0 + 0.03, z1 - 1.0, Math.PI / 2, 0.5);
  { const t = labelTex(400, 300, (a, W, Hh) => { a.fillStyle = '#5a3a20'; a.fillRect(0, 0, W, Hh); a.fillStyle = '#f7f1df'; a.fillRect(18, 18, W - 36, Hh - 36); a.strokeStyle = '#b08a3a'; a.lineWidth = 3; a.strokeRect(30, 30, W - 60, Hh - 60);
      a.fillStyle = '#2a2a2a'; a.textAlign = 'center'; a.font = '700 26px "Barlow Condensed", sans-serif'; a.fillText('DEALER LICENCE', W / 2, 78); a.font = '500 17px "Manrope", sans-serif'; a.fillText('Ceylon Arms Co. — Colombo 10', W / 2, 116); a.fillText('Sale and repair of firearms', W / 2, 142); a.fillText('and ammunition', W / 2, 164);
      a.fillStyle = '#9a2020'; a.beginPath(); a.arc(W / 2, 222, 26, 0, Math.PI * 2); a.fill(); });
    const m = plane(t, 0.5, 0.375); m.position.set(x0 + 1.0, Y + 1.6, slatZ + 0.07); g.add(m); }
  { const t = labelTex(128, 128, (a, W) => { a.fillStyle = '#fafafa'; a.beginPath(); a.arc(64, 64, 60, 0, Math.PI * 2); a.fill(); a.strokeStyle = '#222'; a.lineWidth = 6; a.stroke(); for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; a.fillStyle = '#222'; a.fillRect(64 + Math.sin(an) * 48 - 2, 64 - Math.cos(an) * 48 - 2, 4, 4); } a.lineWidth = 5; a.beginPath(); a.moveTo(64, 64); a.lineTo(64, 30); a.moveTo(64, 64); a.lineTo(88, 72); a.stroke(); });
    const m = plane(t, 0.32, 0.32); m.position.set(cx, Y + 2.75, z1 - 0.06); m.rotation.y = Math.PI; g.add(m); }
  for (const [x, z] of [[x0 + 0.4, z1 - 0.4], [x1 - 0.4, z0 + 3.9]]) { metal.cylinder(x, Y + H - 0.12, z, 0.07, 0.05, 0.12, 10, { col: C('#e8e8e8') }); paint.cylinder(x, Y + H - 0.2, z, 0.06, 0.06, 0.08, 10, { col: C('#111') }); }

  // ---- lighting: recessed panels + track spots over the counter and the gun wall
  for (const z of [z1 - 2.2, cz - D.d / 2 + 0.5]) emis.box(cx, Y + H - 0.01, z, 1.2, 0.012, 0.6, { col: [1.0, 0.98, 0.94] });
  metal.box(cx, Y + H - 0.03, z0 + 1.6, D.w - 1.6, 0.04, 0.05, { col: C('#202020') });
  for (let i = 0; i < 6; i++) { const x = x0 + 1.3 + i * (D.w - 2.6) / 5; metal.cylinder(x, Y + H - 0.28, z0 + 1.6, 0.05, 0.06, 0.24, 10, { col: C('#1a1a1a') }); emis.box(x, Y + H - 0.285, z0 + 1.55, 0.07, 0.01, 0.07, { col: [1.0, 0.92, 0.78] }); }

  for (const m of mb.toMeshes(MAT, { cast: false, receive: true })) g.add(m);
  const main = new THREE.PointLight(0xfff3e2, 20, 16, 1.4); main.position.set(cx, Y + H - 0.5, cz - D.d / 2 + 1); g.add(main);
  const wallL = new THREE.PointLight(0xffe2b8, 9, 7, 1.6); wallL.position.set(cx, Y + 2.6, z0 + 1.5); g.add(wallL);
  const doorL = new THREE.PointLight(0xffe8cc, 6, 9, 1.5); doorL.position.set(cx, Y + 2.2, z1 - 1.6); g.add(doorL);
  g.visible = false; game.scene.add(g);

  const counterSpot = { x: ccx - 0.4, z: cz0 + 0.95 };
  const room = { id: 'gunshop', D, g, fan: null, H, bounds: { x0: x0 + 0.3, x1: x1 - 0.3, z0: cz0 + 0.45, z1: z1 - 0.3 }, obstacles, spawn: [cx, z1 - 1.2], keeperPos: [cx - 0.2, z0 + 2.5], y: Y, door, counter: counterSpot, prompt: null,
    nearCounter: false,
    update(dt, P) { // the buy prompt at the counter (Game.updateInteractions shows room.prompt and opens the menu on interact)
      room.nearCounter = Math.abs(P.x - counterSpot.x) < cw / 2 + 0.2 && P.z < cz0 + 1.6; const shop = game.gunShop;
      room.prompt = room.nearCounter && shop && !shop.open ? `${game.hud.key('interact')} Browse the counter — buy weapons & ammunition` : null;
    } };
  return room;
}
