// 44th request: eight robbable stores (walk-in, WalkIn.js — no button, the interior is built only near the door). Each has
// its own fully furnished room, a counter with a cash register and a shopkeeper behind it.
//   Point a gun at the keeper: his hands go up and he empties the register onto the counter (Rs 100,000 – 500,000, usually
//   around Rs 2 lakh). Walk up to the counter to take it. Sometimes he only pretends to give in — after a moment he pulls a
//   pistol from under the counter and opens fire. He can be shot (he goes down; the till can then be emptied at the counter).
//   Robbing a store sets off the silent alarm (★★); the register stays empty until it is restocked (10 minutes).
// Everything a store shows is modelled: shelves, packets, tins, bottles, fridges, glass cases, racks — the packaging is one
// shared 1024² canvas atlas (64 fictional products, 128 px each) on one material, so a whole store is ~12 draw calls and
// uses the shared 6-light pool. Node-safe: textures are skipped without a canvas.
//   rob_mart      Lak Mini Mart              gondola aisles, drinks fridge, ice-cream chest, rice sacks
//   rob_pharmacy  Lanka Care Pharmacy        white dispensary, medicine wall, green cross, consulting scale
//   rob_jewel     Ratnapura Gems & Gold      walnut + glass cases, gold chains / bangles / rings, busts, a safe
//   rob_phone     CellCity Mobile            lit phone wall, accessory pegboard, demo table, repair bench
//   rob_liquor    Galle Road Wine Stores     counter behind a steel grille, arrack shelves, beer crates
//   rob_bakery    Golden Crust Bakery        tiled walls, short-eats cabinets, bread racks, cake fridge, tea urn
//   rob_hardware  Sena Hardware              steel racking, paint tins, cement bags, pipes, tool wall
//   rob_books     Saraswathi Book Depot      wall-to-wall book shelves, new-release tables, stationery
import * as THREE from 'three';
import { Kit, KIT, C, canvasTex, lathe } from './ShopKit.js';
import { fit, shell, ob, keeperAt, pendant, frame, rngOf, base } from './ShopInteriors.js';
import { DOOR_W } from './WalkIn.js';
import { WEAPONS } from '../combat/WeaponDefs.js';
import { buildWeaponModel } from '../combat/WeaponModels.js';
import { holdFor } from '../combat/GripSolver.js';
import { Audio } from '../audio/Audio.js';
import { bloomHotAt } from '../gfx/BloomHot.js';
import { MultiBuilder } from '../gfx/MeshBuilder.js';

const K = (seed, o) => ({ seed, age: 'adult', ...o });
export const ROB_DEFS = {
  rob_mart: { name: 'Lak Mini Mart', type: 'mart', door: 'alu', w: 7, d: 10, H: 3.2, keeper: K(6101, { sex: 'm', outfit: 'shirt', top: '#2e5a8a', bottom: '#2a2a2c', hair: 'short', moustache: true }), line: 'Ayubowan! Bread came in this morning. Anything else, just ask.', sign: ['#c8102e', '#ffffff', 'LAK MINI MART', 'GROCERY · DRINKS · DAILY NEEDS'] },
  rob_pharmacy: { name: 'Lanka Care Pharmacy', type: 'pharmacy', door: 'alu', w: 7, d: 9.5, H: 3.2, keeper: K(6203, { sex: 'f', outfit: 'office', top: '#f4f6f6', bottom: '#2a3140', hair: 'bun' }), line: 'Good day. Prescription, or something over the counter?', sign: ['#0f7a4a', '#ffffff', 'LANKA CARE PHARMACY', 'DISPENSING CHEMIST · OPEN 7 DAYS'] },
  rob_jewel: { name: 'Ratnapura Gems & Gold', type: 'jewel', door: 'bronze', w: 7, d: 9.5, H: 3.3, keeper: K(6307, { sex: 'm', outfit: 'office', top: '#f2efe6', bottom: '#1d1f24', hair: 'short', collar: true }), line: 'Welcome, sir. 22-carat, hallmarked. Sapphires from Ratnapura itself.', sign: ['#1c1a17', '#e2c27a', 'RATNAPURA GEMS & GOLD', 'JEWELLERS · 22 CT · GEMS'] },
  rob_phone: { name: 'CellCity Mobile', type: 'phone', door: 'alu', w: 6.5, d: 9, H: 3.2, keeper: K(6409, { sex: 'm', outfit: 'tee_jeans', top: '#151a22', bottom: '#2b3445', hair: 'short' }), line: 'Phones, covers, chargers, repairs — screen in one hour.', sign: ['#0d1b2a', '#3fd0ff', 'CELLCITY MOBILE', 'PHONES · ACCESSORIES · REPAIRS'] },
  rob_liquor: { name: 'Galle Road Wine Stores', type: 'liquor', door: 'steel', w: 6.5, d: 9, H: 3.2, keeper: K(6511, { sex: 'm', outfit: 'shirt', top: '#6b6f5a', bottom: '#2d2f33', hair: 'short', beard: true }), line: 'Arrack, beer, what will it be? Cash only, machan.', sign: ['#2a1a10', '#f0c060', 'GALLE ROAD WINE STORES', 'ARRACK · BEER · WINE'] },
  rob_bakery: { name: 'Golden Crust Bakery', type: 'bakery', door: 'timberGlass', w: 7, d: 9.5, H: 3.2, keeper: K(6613, { sex: 'f', outfit: 'office', top: '#f3ead8', bottom: '#3a2a20', hair: 'bun' }), line: 'Fish buns are hot, the bread is fresh. Tea?', sign: ['#f3e6c8', '#7a3b12', 'GOLDEN CRUST BAKERY', 'BREAD · SHORT EATS · CAKES'] },
  rob_hardware: { name: 'Sena Hardware', type: 'hardware', door: 'wicket', w: 7, d: 10, H: 3.4, keeper: K(6717, { sex: 'm', outfit: 'worker', top: '#7a5a2a', bottom: '#2d2f33', hair: 'short', moustache: true }), line: 'Paint, pipes, cement — tell me the job, I will tell you what you need.', sign: ['#f2c200', '#1a1a1a', 'SENA HARDWARE', 'PAINT · PLUMBING · TOOLS · CEMENT'] },
  rob_books: { name: 'Saraswathi Book Depot', type: 'books', door: 'timber', w: 7, d: 10, H: 3.3, keeper: K(6819, { sex: 'm', outfit: 'shirt', top: '#e8e2d2', bottom: '#2a2a2c', hair: 'short', glasses: true }), line: 'Novels at the back, school books on the left. Browse as long as you like.', sign: ['#20304a', '#f4ead2', 'SARASWATHI BOOK DEPOT', 'BOOKS · STATIONERY · SCHOOL'] },
};

// ------------------------------------------------------------------------------------------------ product atlas
// 8 × 8 cells, 128 px. Fictional brands only.
const CELLS = [
  // groceries
  ['box', '#c8202a', '#f6c431', 'KANDY', 'CRISP', 'biscuits'], ['box', '#1f6b3a', '#d9b14a', 'NUWARA', 'TEA', 'pure ceylon'], ['bag', '#e86a1c', '#ffe08a', 'RASA', 'NOODLES', 'curry'], ['tin', '#1d4f9a', '#ffffff', 'KIRI', 'MILK', 'full cream'],
  ['box', '#f3d6e2', '#c2185b', 'SUDU', 'SOAP', 'sandal'], ['box', '#1565c0', '#ffffff', 'BLU', 'WASH', 'detergent'], ['bag', '#efe4c8', '#b3261e', 'SAMBA', 'RICE', '5 kg'], ['box', '#8e1b10', '#f7c948', 'CURRY', 'POWDER', 'roasted'],
  // drinks / tins
  ['can', '#c4161c', '#ffffff', 'FIZZ', 'COLA', '330 ml'], ['can', '#1b7a3a', '#f2d16b', 'GINGER', 'KICK', 'ginger beer'], ['bottle', '#bfe3f2', '#0d5c8a', 'PURE', 'SPRING', 'water 1 L'], ['box', '#ffcc22', '#e2541b', 'MANGO', 'JOY', 'juice'],
  ['tin', '#0f3d6e', '#c9d3dc', 'SEAKING', 'MACKEREL', '425 g'], ['tin', '#ffffff', '#1d4f9a', 'SWEET', 'KIRI', 'condensed'], ['box', '#f2c12e', '#b5281c', 'MORNING', 'FLAKES', 'corn'], ['box', '#4a2a17', '#e8c48a', 'HILL', 'COFFEE', 'roast'],
  // pharmacy
  ['med', '#ffffff', '#1f5fae', 'PARACETAMOL', '500 mg', '20 tablets'], ['med', '#ffffff', '#f08a1c', 'VITAMIN C', '1000 mg', 'effervescent'], ['med', '#ffffff', '#6a3fa0', 'COUGH', 'SYRUP', '100 ml'], ['med', '#ffffff', '#2e9a4a', 'ORAL', 'REHYDRATION', 'salts'],
  ['med', '#ffffff', '#138a8a', 'ANTACID', 'tablets', 'mint'], ['med', '#ffffff', '#d32f2f', '+ BANDAGE', 'sterile', '10 pcs'], ['tin', '#b71c1c', '#f5c542', 'HERBAL', 'BALM', 'pain relief'], ['med', '#ffffff', '#20a4c8', 'HAND', 'SANITISER', '70% alcohol'],
  // electronics
  ['dark', '#0e0f12', '#ffffff', 'NOVA', 'X5', '128 GB'], ['box', '#f4f4f2', '#222222', 'AURA', '12', '256 GB'], ['dark', '#16181d', '#3fd0ff', 'PULSE', 'BUDS', 'wireless'], ['box', '#ffffff', '#ff6a00', 'FAST', 'CHARGE', '33 W'],
  ['dark', '#1e2a38', '#9bd1ff', 'ARMOR', 'CASE', 'shockproof'], ['dark', '#20242b', '#7fff9a', 'POWER', '20000', 'mAh'], ['box', '#e9eef2', '#1565c0', 'USB-C', 'CABLE', '1 m'], ['dark', '#101114', '#ff4f7a', 'FIT', 'BAND', 'smartwatch'],
  // liquor labels
  ['label', '#13234a', '#e5c06a', 'POL', 'ARRACK', 'distilled'], ['label', '#111111', '#d4af37', 'OLD', 'RESERVE', 'aged 5 yrs'], ['label', '#f4f1e6', '#1f6b3a', 'COCONUT', 'ARRACK', 'premium'], ['label', '#9a1b1b', '#f6e7c1', 'SPECIAL', 'ARRACK', 'blend'],
  ['label', '#5a3418', '#f1dfb8', 'HIGHLAND', 'WHISKY', 'blended'], ['label', '#1d6b2e', '#ffffff', 'ISLAND', 'LAGER', '625 ml'], ['label', '#121212', '#e9d8a6', 'DARK', 'STOUT', '8.8%'], ['label', '#e5b52a', '#5a3418', 'PALM', 'TODDY', 'bottled'],
  // bakery surfaces
  ['crust'], ['bun'], ['icing', '#fbf3f4', '#e57aa0'], ['icing', '#4a2412', '#7a3f1f'], ['crumb'], ['bag', '#fbf7ee', '#a0521d', 'GOLDEN', 'CRUST', 'sandwich bread'], ['tin', '#1f4f8a', '#f2d16b', 'BUTTER', 'COOKIES', 'assorted'], ['box', '#f6e3c4', '#8a3b12', 'LOVE', 'CAKE', 'traditional'],
  // hardware
  ['paint', '#f4f4f0', '#1c3f8a', 'DURAPAINT', 'WHITE', 'emulsion 4 L'], ['paint', '#2a62b8', '#ffffff', 'DURAPAINT', 'OCEAN', 'enamel 4 L'], ['paint', '#c62828', '#ffffff', 'DURAPAINT', 'RED', 'enamel 4 L'], ['bag', '#9a9b98', '#c62828', 'CEMENT', '50 kg', 'portland'],
  ['bag', '#efefea', '#2e7d32', 'WALL', 'PUTTY', '20 kg'], ['box', '#3a4a5a', '#f2c200', 'NAILS', '2 inch', '1 kg'], ['tin', '#1565c0', '#ffffff', 'PVC', 'GLUE', '250 ml'], ['box', '#b71c1c', '#ffd54f', 'TOOL', 'BOX', 'steel'],
  // books
  ['spines', 0], ['spines', 1], ['spines', 2], ['cover', '#2f6db0', '#ffffff', 'EXERCISE', 'BOOK', '80 pages · ruled'],
  ['cover', '#1f3b2c', '#f2d16b', 'MONSOON', 'ROAD', 'a novel'], ['cover', '#8a1c1c', '#f4ead2', 'SINHALA', 'ENGLISH', 'dictionary'], ['cover', '#f2efe6', '#20304a', 'COLOMBO', 'STREET ATLAS', '2026 edition'], ['cover', '#f6c431', '#7a2a12', 'RICE &', 'CURRY', 'home cookery'],
];
export const CELL = Object.fromEntries(['biscuit', 'tea', 'noodles', 'milk', 'soap', 'wash', 'rice', 'curry', 'cola', 'ginger', 'water', 'mango', 'mackerel', 'kiri', 'flakes', 'coffee',
  'para', 'vitc', 'cough', 'ors', 'antacid', 'bandage', 'balm', 'sanit', 'nova', 'aura', 'buds', 'charger', 'case', 'power', 'cable', 'band',
  'polArrack', 'oldRes', 'cocoArrack', 'specArrack', 'whisky', 'lager', 'stout', 'toddy', 'crust', 'bun', 'icingW', 'icingC', 'crumb', 'breadBag', 'cookies', 'loveCake',
  'paintW', 'paintB', 'paintR', 'cement', 'putty', 'nails', 'glue', 'toolbox', 'spinesA', 'spinesB', 'spinesC', 'exercise', 'novel', 'dict', 'atlas', 'cookery'].map((n, i) => [n, i]));
export function cellUV(i, inset = 0.004) { const c = i % 8, r = Math.floor(i / 8); return [c / 8 + inset, 1 - (r + 1) / 8 + inset, (c + 1) / 8 - inset, 1 - r / 8 - inset]; }

function drawCell(a, spec, x, y, S, r) {
  const [kind, bg, fg, t1, t2, t3] = spec; const F = (w, px) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const txt = (s, cx, cy, px, col, w = 700, maxW = S - 12) => { a.fillStyle = col; a.font = F(w, px); a.textAlign = 'center'; a.textBaseline = 'middle'; let p = px; while (a.measureText(s).width > maxW && p > 8) { p -= 1; a.font = F(w, p); } a.fillText(s, cx, cy); };
  const noise = (n, al) => { for (let i = 0; i < n; i++) { a.fillStyle = r() < 0.5 ? `rgba(0,0,0,${al})` : `rgba(255,255,255,${al})`; a.fillRect(x + r() * S, y + r() * S, 1 + r() * 2, 1 + r() * 2); } };
  a.save(); a.beginPath(); a.rect(x, y, S, S); a.clip();
  if (kind === 'crust' || kind === 'bun' || kind === 'crumb') { // baked surfaces: golden-brown gradient, blistered, flour dust / crumbs
    const g = a.createLinearGradient(x, y, x, y + S); const tone = kind === 'crust' ? ['#8a4a1c', '#b8732e', '#d9a15c'] : kind === 'bun' ? ['#a05a1e', '#cf8a3a', '#e8b46a'] : ['#c88a3a', '#e2b064', '#f0cf8e'];
    g.addColorStop(0, tone[0]); g.addColorStop(0.5, tone[1]); g.addColorStop(1, tone[2]); a.fillStyle = g; a.fillRect(x, y, S, S);
    for (let i = 0; i < 160; i++) { a.fillStyle = `rgba(${r() < 0.5 ? '70,30,8' : '255,225,170'},${0.08 + r() * 0.16})`; a.beginPath(); a.ellipse(x + r() * S, y + r() * S, 1 + r() * 5, 1 + r() * 3, r() * 3, 0, 7); a.fill(); }
    if (kind === 'crust') for (let i = 0; i < 4; i++) { a.strokeStyle = 'rgba(240,210,160,0.55)'; a.lineWidth = 3; a.beginPath(); const yy = y + 20 + i * 28; a.moveTo(x + 10, yy + 8); a.quadraticCurveTo(x + S / 2, yy - 6, x + S - 10, yy + 8); a.stroke(); }
    if (kind === 'bun') for (let i = 0; i < 40; i++) { a.fillStyle = 'rgba(250,240,220,0.7)'; a.fillRect(x + r() * S, y + r() * S, 2, 1); } // sesame
    noise(400, 0.05); a.restore(); return; }
  if (kind === 'icing') { a.fillStyle = bg; a.fillRect(x, y, S, S); for (let i = 0; i < 9; i++) { a.fillStyle = fg; a.globalAlpha = 0.85; a.beginPath(); a.arc(x + 14 + (i % 3) * 50, y + 18 + Math.floor(i / 3) * 46, 9, 0, 7); a.fill(); } a.globalAlpha = 1;
    a.strokeStyle = fg; a.lineWidth = 4; a.beginPath(); for (let xx = 0; xx <= S; xx += 8) a.lineTo(x + xx, y + S - 12 + Math.sin(xx * 0.4) * 4); a.stroke(); noise(300, 0.03); a.restore(); return; }
  if (kind === 'spines') { // a run of book spines (each book picks a sub-range of u)
    let xx = x; const pal = [['#7a1c1c', '#e8d6a8'], ['#1f3b6b', '#f0e6cc'], ['#244a2c', '#e9dcb0'], ['#e8e2d2', '#20304a'], ['#3a2a20', '#d9b878'], ['#f2c12e', '#2a1a10'], ['#5a2a6b', '#f2e6ff'], ['#0f0f10', '#d4af37'], ['#b8501c', '#fff2dc'], ['#2f6db0', '#ffffff'], ['#c9c3b4', '#3a1c10'], ['#8a6a2a', '#1a1208']];
    for (let i = 0; i < 16; i++) { const w = S / 16; const [b, f] = pal[(i * 5 + t1 * 7 + Math.floor(r() * 3)) % pal.length]; a.fillStyle = b; a.fillRect(xx, y, w, S); a.fillStyle = f; a.fillRect(xx + 1, y + 10, w - 2, 2); a.fillRect(xx + 1, y + S - 14, w - 2, 2);
      for (let k = 0; k < 4; k++) a.fillRect(xx + w * 0.3, y + 26 + k * 16 + r() * 6, w * 0.4, 6 + r() * 6); // title blocks (too small to read on a spine at shelf distance)
      a.fillStyle = 'rgba(0,0,0,0.25)'; a.fillRect(xx + w - 1, y, 1, S); xx += w; }
    noise(300, 0.04); a.restore(); return; }
  if (kind === 'cover') { a.fillStyle = bg; a.fillRect(x, y, S, S); a.fillStyle = fg; a.fillRect(x, y + 6, S, 3); a.fillRect(x, y + S - 9, S, 3); txt(t1, x + S / 2, y + 36, 26, fg); txt(t2, x + S / 2, y + 64, 22, fg); a.globalAlpha = 0.85; txt(t3, x + S / 2, y + 98, 13, fg, 500); a.globalAlpha = 1; noise(500, 0.04); a.restore(); return; }
  // packaging
  a.fillStyle = bg; a.fillRect(x, y, S, S);
  if (kind === 'label' || kind === 'paint' || kind === 'tin' || kind === 'can' || kind === 'bottle') { // wrap-around labels: design repeats at ±¼ so the front reads from any angle
    a.fillStyle = fg; a.fillRect(x, y + 8, S, 4); a.fillRect(x, y + S - 12, S, 4);
    if (kind === 'label') { a.strokeStyle = fg; a.lineWidth = 2; a.strokeRect(x + 30, y + 22, S - 60, S - 44); }
    txt(t1, x + S / 2, y + 40, 24, fg, 700, S - 40); txt(t2, x + S / 2, y + 66, 26, fg, 700, S - 40); txt(t3, x + S / 2, y + 94, 13, fg, 500, S - 40);
    if (kind === 'paint') { a.fillStyle = bg === '#f4f4f0' ? '#d8d8d2' : 'rgba(255,255,255,0.25)'; a.beginPath(); a.moveTo(x, y + S - 30); a.quadraticCurveTo(x + S / 2, y + S - 50, x + S, y + S - 30); a.lineTo(x + S, y + S - 16); a.lineTo(x, y + S - 16); a.fill(); }
  } else if (kind === 'med') { a.fillStyle = fg; a.fillRect(x, y, S, 26); a.fillRect(x, y + S - 10, S, 10); a.fillStyle = '#fff'; a.font = F(700, 16); txt(t1, x + S / 2, y + 13, 18, '#ffffff', 700, S - 10); txt(t2, x + S / 2, y + 56, 24, fg); txt(t3, x + S / 2, y + 84, 14, '#333', 500); a.fillStyle = '#555'; for (let i = 0; i < 4; i++) a.fillRect(x + 14, y + 98 + i * 4, 60 + r() * 30, 1.5); }
  else if (kind === 'dark') { const g = a.createLinearGradient(x, y, x + S, y + S); g.addColorStop(0, bg); g.addColorStop(1, '#2a2e36'); a.fillStyle = g; a.fillRect(x, y, S, S); a.strokeStyle = fg; a.globalAlpha = 0.6; a.lineWidth = 2; a.beginPath(); a.roundRect ? a.roundRect(x + 38, y + 18, 52, 76, 8) : a.rect(x + 38, y + 18, 52, 76); a.stroke(); a.globalAlpha = 1; txt(t1, x + S / 2, y + 50, 22, fg); txt(t2, x + S / 2, y + 74, 20, '#ffffff'); txt(t3, x + S / 2, y + 108, 12, '#c8ccd4', 500); }
  else { // box / bag: brand panel, product window / illustration, net weight
    a.fillStyle = fg; a.beginPath(); a.ellipse(x + S / 2, y + 48, S * 0.42, 30, 0, 0, 7); a.fill(); txt(t1, x + S / 2, y + 38, 24, bg); txt(t2, x + S / 2, y + 60, 20, bg);
    a.fillStyle = 'rgba(255,255,255,0.18)'; a.fillRect(x + 10, y + 86, S - 20, 22); txt(t3, x + S / 2, y + 97, 14, fg === '#ffffff' ? '#ffffff' : fg, 600);
    if (kind === 'bag') { a.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 6; i++) a.fillRect(x, y + 3 + i * 3, S, 1); }
  }
  const sh = a.createLinearGradient(x, y, x + S, y); sh.addColorStop(0, 'rgba(0,0,0,0.12)'); sh.addColorStop(0.5, 'rgba(255,255,255,0.06)'); sh.addColorStop(1, 'rgba(0,0,0,0.14)'); a.fillStyle = sh; a.fillRect(x, y, S, S); noise(260, 0.035);
  a.restore();
}
const productsTex = () => canvasTex('robProducts', 1024, 1024, (a, w, h, r) => { const S = 128; CELLS.forEach((c, i) => drawCell(a, c[0] === 'spines' ? ['spines', 0, 0, c[1]] : c, (i % 8) * S, Math.floor(i / 8) * S, S, r)); }, { repeat: false });
const tileTex = (tone, grout, key, sx = 4, sy = 6) => () => canvasTex(key, 256, 256, (a, w, h, r) => { a.fillStyle = grout; a.fillRect(0, 0, w, h); const tw = w / sx, th = h / sy;
  for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) { const t = 0.96 + r() * 0.06; const c = new THREE.Color(tone); a.fillStyle = `rgb(${Math.round(c.r * 255 * t)},${Math.round(c.g * 255 * t)},${Math.round(c.b * 255 * t)})`; a.fillRect(i * tw + 1.5, j * th + 1.5, tw - 3, th - 3);
    const g = a.createLinearGradient(i * tw, j * th, i * tw + tw, j * th + th); g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.05)'); a.fillStyle = g; a.fillRect(i * tw + 1.5, j * th + 1.5, tw - 3, th - 3); } });
const ceilTex = () => canvasTex('ceilTile', 256, 256, (a, w, h, r) => { a.fillStyle = '#e9e7e1'; a.fillRect(0, 0, w, h); for (let i = 0; i < 5000; i++) { a.fillStyle = `rgba(90,88,80,${0.05 + r() * 0.1})`; a.fillRect(r() * w, r() * h, 1 + r(), 1 + r()); } a.fillStyle = '#c9c6bd'; a.fillRect(0, 0, w, 4); a.fillRect(0, 0, 4, h); a.fillStyle = 'rgba(255,255,255,0.6)'; a.fillRect(4, 4, w - 4, 1); });
Object.assign(KIT, {
  products: { tex: productsTex, rough: 0.48 }, tileW: { tex: tileTex('#f3f1ea', '#bdb7aa', 'tileW'), rough: 0.12, env: 1.1 }, tileG: { tex: tileTex('#dfe9e2', '#a9b5ad', 'tileG', 6, 6), rough: 0.14, env: 1.1 },
  ceilTile: { tex: ceilTex, rough: 0.95 }, gold: { rough: 0.22, metal: 1, color: 0xffffff, env: 1.4 }, bottle: { rough: 0.06, metal: 0.1, env: 1.6 }, steel: { rough: 0.35, metal: 1, color: 0xffffff },
  plastic: { rough: 0.4 }, glaze: { rough: 0.3, env: 1.2 },
});

// ------------------------------------------------------------------------------------------------ fixtures
const WHITE = [1, 1, 1];
// a cylinder whose side shows one atlas cell (cans, tins, paint tins, bottle labels); the label's centre faces angle `face`
function labelCyl(mb, x, y, z, rad, h, cell, face = 0, seg = 14, col = WHITE) {
  const [u0, v0, u1, v1] = cellUV(cell); const b = mb.vcount; const rot = face - Math.PI;
  for (let i = 0; i <= seg; i++) { const t = i / seg, a = rot + t * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), u = u0 + (u1 - u0) * t; mb.vert(x + ca * rad, y, z + sa * rad, ca, 0, sa, u, v0, col); mb.vert(x + ca * rad, y + h, z + sa * rad, ca, 0, sa, u, v1, col); }
  for (let i = 0; i < seg; i++) { const a = b + i * 2; mb.idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
}
// fill a shelf run with packets: along x (front facing ±z) or along z (front facing ±x)
function fillShelf(k, a0, a1, y, c, depth, cells, rng, o = {}) {
  const P = k.get('products'); const { alongZ = false, h = [0.14, 0.3], w = [0.07, 0.16], gap = 0.06, deep = 2 } = o; let a = a0 + 0.02;
  while (a < a1 - 0.05) { const cell = cells[Math.floor(rng() * cells.length)]; const pw = w[0] + rng() * (w[1] - w[0]), ph = h[0] + rng() * (h[1] - h[0]); const n = 1 + Math.floor(rng() * 4); // a facing of 1-4 identical packs
    for (let j = 0; j < n && a + pw < a1; j++) { if (rng() > gap) { const pd = Math.min(depth * 0.45, pw * 0.75 + 0.03); for (let d = 0; d < deep; d++) { const off = (depth / 2 - pd / 2 - 0.02) - d * (pd + 0.01); const cx = alongZ ? c + off * (o.face || 1) : a + pw / 2, cz = alongZ ? a + pw / 2 : c + off * (o.face || 1);
        P.box(cx, y + ph / 2, cz, alongZ ? pd : pw, ph, alongZ ? pw : pd, { uvRect: cellUV(cell), col: WHITE }); } } a += pw + 0.006; }
    a += 0.01; }
}
// cans / tins / bottles standing in rows on a shelf
function fillCans(k, a0, a1, y, c, cell, rng, o = {}) { const P = k.get('products'), M = k.get(o.capMat || 'metal'); const { alongZ = false, r = 0.033, h = 0.12, face = 0, rows = 2, cap = '#c9ccd0' } = o;
  for (let a = a0 + r + 0.01; a < a1 - r; a += r * 2 + 0.006) for (let j = 0; j < rows; j++) { const off = (j - (rows - 1) / 2) * (r * 2 + 0.004); const x = alongZ ? c + off : a, z = alongZ ? a : c + off;
    if (rng() < 0.05) continue; labelCyl(P, x, y, z, r, h, typeof cell === 'function' ? cell() : cell, face, 12); M.cylinder(x, y + h, z, r * 0.98, r * 0.86, 0.008, 12, { col: C(cap) }); }
}
// bottles: glass body (lathe) + wrap-around label band + cap
function bottle(k, x, y, z, cell, glass, face, s = 1, cap = '#c9a54e', seg = 9) { // seg 6: stock seen only from across a counter / grille
  const r = 0.038 * s, h = 0.3 * s;
  lathe(k.get('bottle'), x, y, z, [[r, 0], [r, h * 0.62], [r * 0.9, h * 0.7], [r * 0.38, h * 0.8], [r * 0.34, h * 0.97], [0.001, h]], seg, C(glass)); // 9 sides: smooth-shaded, reads round at shelf distance
  labelCyl(k.get('products'), x, y + h * 0.18, z, r * 1.015, h * 0.36, cell, face, seg); k.get('gold').cylinder(x, y + h * 0.95, z, r * 0.37, r * 0.36, h * 0.07, 6, { col: C(cap) }); }
// shelving bay: uprights + shelves (+ back panel); along x (back to the wall at z = zb, facing +z) or along z (wall at x = xb facing ±x)
function shelving(k, a0, a1, wallC, depth, levels, H, o = {}) { const { alongZ = false, face = 1, mat = 'metal', col = '#d9dadb', back = 'paint', backCol = '#e9e6de', y0 = 0.12 } = o; const M = k.get(mat), Bk = k.get(back); const len = a1 - a0, mid = (a0 + a1) / 2; const c = wallC + face * depth / 2; const ys = [];
  const B = (a, y, cc, la, h, d, m = M, cl = C(col)) => m.box(alongZ ? cc : a, y, alongZ ? a : cc, alongZ ? d : la, h, alongZ ? la : d, { col: cl });
  B(mid, H / 2, wallC + face * 0.012, len, H, 0.02, Bk, C(backCol)); B(mid, y0 / 2, c, len, y0, depth - 0.02, M, C(o.plinth || '#3a3c3f'));
  const nUp = Math.max(2, Math.round(len / 1.0) + 1); for (let i = 0; i < nUp; i++) { const a = a0 + 0.02 + i * (len - 0.04) / (nUp - 1); B(a, H / 2, c, 0.035, H, depth, M); }
  for (let l = 0; l < levels; l++) { const y = y0 + l * (H - y0 - 0.15) / Math.max(1, levels - 1) * (levels > 1 ? 1 : 0) + (levels === 1 ? 0.75 : 0); ys.push(y); B(mid, y - 0.012, c, len, 0.024, depth, M); if (o.edge) B(mid, y + 0.012, c + face * (depth / 2 - 0.005), len, 0.04, 0.012, k.get('paint'), C(o.edge)); }
  return { ys, c };
}
// double-sided gondola (aisle unit) along z at x = cx
function gondola(k, cx, z0, z1, H, cells, rng, endCell) { const M = k.get('metal'); const len = z1 - z0, zm = (z0 + z1) / 2, D = 0.9;
  M.box(cx, 0.06, zm, D, 0.12, len, { col: C('#33363a') }); k.get('pegboard').box(cx, H / 2 + 0.06, zm, 0.03, H - 0.12, len - 0.04, { col: C('#d8d8d6') });
  for (const zz of [z0 + 0.02, z1 - 0.02]) M.box(cx, H / 2, zz, D, H, 0.04, { col: C('#d6d8da') });
  for (let l = 0; l < 4; l++) { const y = 0.14 + l * (H - 0.4) / 3; for (const sx of [-1, 1]) { M.box(cx + sx * D / 4, y - 0.012, zm, D / 2 - 0.03, 0.022, len - 0.08, { col: C('#e4e5e6') }); k.get('paint').box(cx + sx * (D / 2 - 0.01), y + 0.02, zm, 0.012, 0.045, len - 0.08, { col: C(l % 2 ? '#f6d12a' : '#ffffff') }); // price rail
      fillShelf(k, z0 + 0.06, z1 - 0.06, y, cx + sx * D / 4, D / 2 - 0.06, cells, rng, { alongZ: true, face: sx, h: l === 3 ? [0.12, 0.22] : [0.14, 0.32] }); } }
  for (const [zz, f] of [[z0 + 0.02, -1], [z1 - 0.02, 1]]) { // end panels: short shelves of stock on each end + a printed price header
    for (let l = 0; l < 3; l++) { const y = 0.62 + l * 0.38; M.box(cx, y - 0.01, zz + f * 0.13, D - 0.1, 0.02, 0.24, { col: C('#e4e5e6') }); fillShelf(k, cx - D / 2 + 0.07, cx + D / 2 - 0.07, y, zz + f * 0.13, 0.22, cells, rng, { face: f, h: [0.12, 0.24], deep: 1 }); }
    k.get('paint').box(cx, H + 0.13, zz, D + 0.04, 0.24, 0.03, { col: C('#c8102e') }); k.get('paint').box(cx, H + 0.13, zz + f * 0.017, D - 0.1, 0.05, 0.004, { col: C('#ffffff') }); }
  if (endCell !== undefined) for (const [zz, f] of [[z0 - 0.03, -1], [z1 + 0.03, 1]]) { // end caps: a promo stack in front of each end
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) k.get('products').box(cx - 0.2 + i * 0.2, 0.14 + j * 0.2, zz + f * 0.14, 0.18, 0.19, 0.2, { uvRect: cellUV(endCell), col: WHITE }); M.box(cx, 0.06, zz + f * 0.14, 0.66, 0.06, 0.26, { col: C('#33363a') }); }
}
// upright drinks fridge with glass doors (lit inside); against a wall at x = xw facing +x / −x (face) or z = zw facing +z
function fridge(k, x, z, w, H, face, rng, cells, alongWallZ) { const M = k.get('metal'), E = k.get('emissive'); const D = 0.7; const dx = alongWallZ ? face : 0, dz = alongWallZ ? 0 : face;
  const B = (m, a, y, d, la, h, dd, col) => m.box(alongWallZ ? x + d * face : x + a, y, alongWallZ ? z + a : z + d * face, alongWallZ ? dd : la, h, alongWallZ ? la : dd, { col });
  B(M, 0, H / 2, D / 2, w, H, D, C('#e9eaeb')); B(k.get('paint'), 0, H - 0.17, D + 0.005, w - 0.02, 0.24, 0.01, C('#c4161c')); // header panel
  B(k.get('paint'), 0, (H - 0.32) / 2 + 0.08, D - 0.04, w - 0.1, H - 0.4, 0.02, C('#1d1f22')); // dark interior back
  const nD = Math.max(1, Math.round(w / 0.7)); for (let i = 0; i < nD; i++) { const a = -w / 2 + (i + 0.5) * w / nD; B(M, a - w / nD / 2 + 0.02, (H - 0.3) / 2 + 0.06, D + 0.01, 0.03, H - 0.42, 0.03, C('#cfd2d4')); B(M, a + w / nD / 2 - 0.08, (H - 0.3) / 2 + 0.06, D + 0.04, 0.025, 0.5, 0.025, C('#b8bcc0')); }
  B(E, 0, H - 0.33, D - 0.06, w - 0.12, 0.02, 0.03, [0.92, 0.97, 1]);
  for (let l = 0; l < 5; l++) { const y = 0.16 + l * (H - 0.6) / 4; B(M, 0, y - 0.01, D / 2, w - 0.1, 0.012, D - 0.12, C('#bfc3c6'));
    const cell = cells[l % cells.length]; for (let a = -w / 2 + 0.1; a < w / 2 - 0.08; a += 0.075) for (let d = 0; d < 3; d++) { const px = alongWallZ ? x + (D / 2 + 0.15 - d * 0.1) * face : x + a, pz = alongWallZ ? z + a : z + (D / 2 + 0.15 - d * 0.1) * face;
      if (CELLS[cell][0] === 'bottle') { lathe(k.get('bottle'), px, y, pz, [[0.03, 0], [0.03, 0.17], [0.012, 0.23], [0.011, 0.25], [0.001, 0.25]], 10, C('#bfe3f2')); labelCyl(k.get('products'), px, y + 0.06, pz, 0.0305, 0.07, cell, Math.atan2(dz, dx), 10); }
      else { labelCyl(k.get('products'), px, y, pz, 0.032, 0.12, cell, Math.atan2(dz, dx), 10); M.cylinder(px, y + 0.12, pz, 0.031, 0.026, 0.008, 10, { col: C('#c9ccd0') }); } } }
  k.get('glass').box(alongWallZ ? x + (D + 0.02) * face : x, (H - 0.3) / 2 + 0.06, alongWallZ ? z : z + (D + 0.02) * face, alongWallZ ? 0.01 : w - 0.06, H - 0.42, alongWallZ ? w - 0.06 : 0.01);
}
// the counter with its till: along z at x = cx (customer on the −x side), from z = za (front) to zb (back)
function counter(k, cx, za, zb, o = {}) { const top = o.top || 'marbleDark', body = o.body || 'walnut'; const zm = (za + zb) / 2, len = Math.abs(za - zb); const D = 0.66, Hc = 0.98;
  k.get(body).box(cx, Hc / 2, zm, D, Hc - 0.04, len, { col: o.bodyCol || WHITE }); k.get(top).box(cx - 0.02, Hc - 0.02, zm, D + 0.06, 0.04, len + 0.04, { col: o.topCol || WHITE });
  k.get('paint').box(cx - D / 2 - 0.002, 0.06, zm, 0.01, 0.12, len, { col: C('#1a1a1a') }); // kick plate
  if (o.glass) { k.get('glass').box(cx - D / 2 + 0.01, Hc * 0.62, zm, 0.012, Hc * 0.56, len - 0.06); k.get('paint').box(cx, Hc * 0.33, zm, D - 0.06, 0.02, len - 0.06, { col: C('#2a2420') }); }
  return { cx, zm, top: Hc };
}
// cash register (drawer opens toward +x — the keeper's side); returns the drawer mesh group for animation
function register(g, k, x, y, z) { const M = k.get('paint'), E = k.get('emissive');
  M.box(x + 0.02, y + 0.05, z, 0.34, 0.1, 0.36, { col: C('#2a2c30') }); M.box(x - 0.04, y + 0.15, z, 0.2, 0.08, 0.32, { col: C('#33363b') }); // base + keypad block
  for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) M.box(x - 0.1 + i * 0.04, y + 0.195, z - 0.1 + j * 0.05, 0.03, 0.01, 0.035, { col: C(j === 0 ? '#c8402a' : '#d8d8d4') });
  M.box(x + 0.06, y + 0.3, z, 0.04, 0.18, 0.28, { col: C('#202226') }); E.box(x + 0.035, y + 0.31, z, 0.006, 0.1, 0.22, { col: [0.25, 0.85, 0.55] }); // customer display (facing −x) + operator screen
  E.box(x + 0.085, y + 0.31, z, 0.006, 0.12, 0.24, { col: [0.55, 0.75, 0.95] }); k.get('paint').box(x - 0.14, y + 0.09, z + 0.21, 0.08, 0.08, 0.08, { col: C('#e8e6df') }); // receipt printer
  const dr = new THREE.Group(); dr.position.set(x + 0.02, y + 0.035, z); const dg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.34), new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.5, metalness: 0.4 }));
  dg.material.userData.own = true; dr.add(dg); const notes = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.28), new THREE.MeshStandardMaterial({ color: 0xb98a4a, roughness: 0.8 })); notes.material.userData.own = true; notes.position.y = 0.035; dr.add(notes); dr.userData.notes = notes; g.add(dr); return dr;
}
// fluorescent batten
const batten = (k, x, y, z, len, alongZ = false) => { k.get('metal').box(x, y, z, alongZ ? 0.14 : len, 0.05, alongZ ? len : 0.14, { col: C('#e2e2df') }); k.get('emissive').box(x, y - 0.03, z, alongZ ? 0.08 : len - 0.06, 0.012, alongZ ? len - 0.06 : 0.08, { col: [1, 0.98, 0.94] }); };
const spot = (k, x, y, z) => { k.get('metal').cylinder(x, y - 0.08, z, 0.045, 0.05, 0.08, 10, { col: C('#1b1b1b') }); k.get('emissive').cylinder(x, y - 0.085, z, 0.032, 0.032, 0.006, 10, { col: [1, 0.93, 0.8] }); };
const cctv = (k, x, y, z) => lathe(k.get('paint'), x, y - 0.12, z, [[0.06, 0.12], [0.065, 0.1], [0.055, 0.03], [0.001, 0]], 12, C('#e8e8e4'));
const poster = (g, k, key, x, y, z, rotY, w, h, lines, bg, fg, frameCol) => frame(g, k, key, x, y, z, rotY, w, h, (a, W, Hh) => { a.fillStyle = bg; a.fillRect(0, 0, W, Hh); a.fillStyle = fg; a.textAlign = 'center'; a.textBaseline = 'middle'; lines.forEach(([t, px, wt], i) => { a.font = `${wt || 700} ${Math.round(Hh * px)}px "Barlow Condensed", sans-serif`; a.fillText(t, W / 2, Hh * (0.2 + i * (0.65 / Math.max(1, lines.length - 1)))); }); }, frameCol);

// ------------------------------------------------------------------------------------------------ the eight rooms
// each returns { lights, keeper: [x, z, yaw], till: { x, y, z }, counter: { cx, za, zb }, prompt? }; the common part adds the
// counter + register on the right-hand side by the door (customers on the −x side), the keeper behind it.
const STYLE = {
  mart: { floor: { kind: 'ceramic', size: 0.6, colors: ['#ecebe6', '#e6e4dd'], grout: '#a8a296', seed: 61 }, wall: 'plaster', wallCol: '#f1efe8', skirtCol: '#4a4c50', ceilTiles: true },
  pharmacy: { floor: { kind: 'ceramic', size: 0.6, colors: ['#f4f4f2'], grout: '#b9b6ae', seed: 62 }, wall: 'plaster', wallCol: '#eef3f0', skirtCol: '#0f7a4a', ceilTiles: true },
  jewel: { floor: { kind: 'granite', size: 0.8, colors: ['#d8cebd', '#cdc2af'], grout: '#8c8372', seed: 63 }, wall: 'plaster', wallCol: '#e9dcc4', skirtCol: '#2a1a10', ceil: '#f3ead8' },
  phone: { floor: { kind: 'concrete', size: 1.2, colors: ['#9a9893', '#94928c'], grout: '#55534f', rough: 0.4, seed: 64 }, wall: 'plaster', wallCol: '#f4f5f6', skirtCol: '#222', ceil: '#1d1f22' },
  liquor: { floor: { kind: 'redoxide', size: 1.0, seed: 65 }, wall: 'plaster', wallCol: '#d8cfba', skirtCol: '#3a2a1a', ceil: '#e9e4d6' },
  bakery: { floor: { kind: 'terrazzo', size: 1.2, seed: 66 }, wall: 'plaster', wallCol: '#f4ead6', skirtCol: '#7a3b12', ceil: '#f6f0e4' },
  hardware: { floor: { kind: 'concrete', size: 1.5, colors: ['#8d8a83', '#86837c'], grout: '#4a4844', seed: 67 }, wall: 'concreteW', wallCol: '#d6d2c8', skirtCol: '#2a2b2c', ceil: '#cfcbc0' },
  books: { floor: { kind: 'wood', size: 0.13, seed: 68, along: 'z' }, wall: 'plaster', wallCol: '#e7dcc6', skirtCol: '#3a2618', ceil: '#f2ece0' },
};
const BUILD = {
  mart(c) { const { k, g, x0, x1, z0, zf, H, rng, W, D } = c; const L = CELL; // two gondola aisles, wall shelving, fridge, freezer chest, rice sacks, newspaper rack
    const s1 = shelving(k, zf - 1.2, z0 + 0.1, x0, 0.45, 5, 2.1, { alongZ: true, face: 1, edge: '#f6d12a' }); s1.ys.forEach((y, i) => fillShelf(k, z0 + 0.15, zf - 1.25, y, s1.c, 0.4, [[L.biscuit, L.tea, L.coffee], [L.noodles, L.flakes, L.milk], [L.soap, L.wash], [L.curry, L.tea, L.biscuit], [L.rice, L.wash]][i % 5], rng, { alongZ: true, face: 1 })); c.ob(x0 + 0.25, (zf - 1.2 + z0) / 2, 0.5, Math.abs(z0 - zf) - 1.2);
    const gx = [x0 + 1.65, x0 + 1.65 + 1.75].filter((x) => x < x1 - 2.3); for (const x of gx) { gondola(k, x, z0 + 1.6, zf - 2.1, 1.65, [L.biscuit, L.noodles, L.tea, L.milk, L.soap, L.wash, L.curry, L.mackerel, L.kiri, L.flakes, L.coffee, L.mango], rng, L.cola); c.ob(x, (z0 + 1.6 + zf - 2.1) / 2, 0.95, Math.abs(zf - 2.1 - z0 - 1.6) + 0.6); }
    fridge(k, (x0 + x1) / 2 - 0.6, z0, Math.min(2.8, W - 3.2), 2.05, 1, rng, [L.cola, L.ginger, L.water, L.cola, L.ginger], false); c.ob((x0 + x1) / 2 - 0.6, z0 + 0.4, Math.min(2.8, W - 3.2), 0.8);
    { const fx = x1 - 0.55, fz = z0 + 1.3; const M = k.get('metal'); M.box(fx, 0.42, fz, 0.8, 0.84, 1.3, { col: C('#f2f2f0') }); k.get('glass').box(fx, 0.86, fz, 0.72, 0.02, 1.2); k.get('paint').box(fx, 0.6, fz - 0.66, 0.6, 0.24, 0.01, { col: C('#1f5fae') }); // ice-cream chest
      for (let i = 0; i < 10; i++) k.get('products').box(fx - 0.25 + (i % 4) * 0.17, 0.76, fz - 0.45 + Math.floor(i / 4) * 0.4, 0.15, 0.08, 0.2, { uvRect: cellUV([L.mango, L.kiri, L.milk][i % 3]), col: WHITE }); c.ob(fx, fz, 0.85, 1.35); }
    for (let i = 0; i < 4; i++) { const sx = x0 + 0.55 + (i % 2) * 0.52, sz = zf - 0.55 - Math.floor(i / 2) * 0.5; labelCyl(k.get('products'), sx, 0, sz, 0.22, 0.5, L.rice, 0, 14); lathe(k.get('fabric'), sx, 0.5, sz, [[0.22, 0], [0.17, 0.08], [0.06, 0.13], [0.001, 0.14]], 14, C('#e9dfc6')); } // rice sacks, tied at the top
    c.ob(x0 + 0.8, zf - 0.8, 1.05, 1.0);
    { const nx = x0 + 0.3, nz = zf - 1.05; k.get('metal').box(nx + 0.2, 0.6, nz, 0.04, 1.2, 0.04, { col: C('#555') }); for (let i = 0; i < 3; i++) k.get('paint').box(nx + 0.36, 0.5 + i * 0.22, nz, 0.3, 0.004, 0.4, { col: C(['#e9e6dc', '#efe9d6', '#e2dccb'][i]) }); }
    for (let i = 0; i < 3; i++) batten(k, (x0 + x1) / 2, H - 0.02, zf - 1.5 - i * (D - 2.2) / 2, 1.25);
    poster(c.g, k, 'martPromo', x0 + 0.03, 2.45, z0 + 1.2, Math.PI / 2, 0.7, 0.45, [['FRESH BREAD', 0.2], ['every morning', 0.12, 500], ['Rs 160', 0.24]], '#c8102e', '#fff', '#eee');
    return { lights: [[0, H - 0.4, zf - 1.6, 0xf4f6ff, 8, 7], [0, H - 0.4, (z0 + zf) / 2, 0xf4f6ff, 10, 8], [0, H - 0.4, z0 + 1.3, 0xf4f6ff, 8, 7], [(x0 + x1) / 2 - 0.6, 1.8, z0 + 0.9, 0xe8f2ff, 3, 3]], behind: [L.biscuit, L.cola, L.tea, L.milk] }; },

  pharmacy(c) { const { k, g, x0, x1, z0, zf, H, rng } = c; const L = CELL; // dispensary wall across the back, medicine wall left, consulting corner
    k.get('tileG').box(0, 0.6, z0 + 0.012, x1 - x0, 1.2, 0.02, { col: WHITE }); k.get('tileG').box(x0 + 0.012, 0.6, (z0 + zf) / 2, 0.02, 1.2, zf - z0, { col: WHITE });
    const sb = shelving(k, x0 + 0.3, x1 - 0.3, z0, 0.36, 6, 2.4, { mat: 'paint', col: '#f6f6f4', backCol: '#ffffff', edge: '#0f7a4a' }); sb.ys.forEach((y) => fillShelf(k, x0 + 0.34, x1 - 0.34, y, sb.c, 0.32, [L.para, L.vitc, L.ors, L.antacid, L.bandage, L.sanit], rng, { h: [0.08, 0.16], w: [0.05, 0.11] }));
    k.get('paint').box(0, 0.5, z0 + 1.2, x1 - x0 - 1.6, 1.0, 0.6, { col: C('#fbfbfa') }); k.get('marble').box(0, 1.02, z0 + 1.2, x1 - x0 - 1.5, 0.04, 0.66, { col: WHITE }); c.ob(0, z0 + 1.2, x1 - x0 - 1.5, 0.66); // dispensing bench (staff only)
    for (let i = 0; i < 4; i++) { lathe(k.get('plastic'), -1 + i * 0.5, 1.04, z0 + 1.15, [[0.05, 0], [0.05, 0.16], [0.03, 0.18], [0.03, 0.2], [0.001, 0.2]], 10, C(['#e7e2d6', '#c96b2c', '#ffffff', '#e7e2d6'][i])); }
    const sl = shelving(k, zf - 1.3, z0 + 2.0, x0, 0.32, 5, 1.9, { alongZ: true, face: 1, mat: 'paint', col: '#f6f6f4', backCol: '#ffffff', edge: '#0f7a4a' }); sl.ys.forEach((y) => fillShelf(k, z0 + 2.05, zf - 1.35, y, sl.c, 0.28, [L.vitc, L.balm, L.sanit, L.soap, L.cough, L.bandage], rng, { alongZ: true, face: 1, h: [0.08, 0.2], w: [0.05, 0.12] })); c.ob(x0 + 0.18, (zf - 1.3 + z0 + 2) / 2, 0.36, Math.abs(zf - 1.3 - z0 - 2));
    { const cx = x0 + 1.9, cz = (z0 + zf) / 2 + 0.3; k.get('paint').box(cx, 0.06, cz, 0.42, 0.12, 0.42, { col: C('#2a2c30') }); k.get('chrome').box(cx, 0.6, cz - 0.15, 0.05, 1.0, 0.05, { col: WHITE }); k.get('paint').cylinder(cx, 1.15, cz - 0.15, 0.13, 0.13, 0.05, 18, { col: C('#f4f4f2') }); k.get('paint').cylinder(cx, 1.17, cz - 0.17, 0.1, 0.1, 0.012, 18, { col: C('#1f2a3a') }); c.ob(cx, cz, 0.45, 0.45); } // weighing scale
    { const bx = x0 + 0.6, bz = zf - 0.7; k.get('chrome').box(bx, 0.42, bz, 0.9, 0.04, 0.4, { col: WHITE }); for (const s of [-0.38, 0.38]) k.get('chrome').box(bx + s, 0.21, bz, 0.03, 0.42, 0.36, { col: WHITE }); k.get('leatherBlk').box(bx, 0.46, bz, 0.88, 0.05, 0.38, { col: WHITE }); c.ob(bx, bz, 0.92, 0.42); } // waiting bench
    { const E = k.get('emissive'); E.box(0, 2.62, z0 + 0.05, 0.42, 0.13, 0.03, { col: [0.15, 0.95, 0.45] }); E.box(0, 2.62, z0 + 0.05, 0.13, 0.42, 0.03, { col: [0.15, 0.95, 0.45] }); } // green cross
    poster(c.g, k, 'pharmNotice', x0 + 0.03, 2.25, zf - 2.2, Math.PI / 2, 0.55, 0.42, [['PRESCRIPTION', 0.15], ['MEDICINES', 0.15], ['are dispensed only on a', 0.08, 500], ["registered doctor's prescription", 0.08, 500]], '#ffffff', '#0f5a38', '#0f7a4a');
    for (let i = 0; i < 3; i++) batten(k, 0, H - 0.02, zf - 1.4 - i * 2.3, 1.25); cctv(k, x1 - 0.4, H, zf - 0.5);
    return { lights: [[0, H - 0.4, zf - 1.5, 0xf6f8ff, 9, 7], [0, H - 0.4, (z0 + zf) / 2, 0xf6f8ff, 10, 8], [0, 2.4, z0 + 0.8, 0xf6fbff, 6, 5]], behind: [L.para, L.cough, L.vitc, L.balm] }; },

  jewel(c) { const { k, g, x0, x1, z0, zf, H, rng } = c; // walnut panelling, glass display cases with gold on velvet, busts, safe, spots
    const wal = k.get('walnut'); wal.box(0, 1.1, z0 + 0.02, x1 - x0, 2.2, 0.03, { col: WHITE }); wal.box(x0 + 0.02, 1.1, (z0 + zf) / 2, 0.03, 2.2, zf - z0, { col: WHITE }); k.get('brass').box(0, 2.22, z0 + 0.04, x1 - x0, 0.03, 0.03, { col: C('#d4af37') }); k.get('brass').box(x0 + 0.04, 2.22, (z0 + zf) / 2, 0.03, 0.03, zf - z0, { col: C('#d4af37') });
    const gold = k.get('gold'), G = C('#f0c45a'), G2 = C('#e8b040'), S = C('#d9dde2');
    const tor = (x, y, z, R, r, rx, ry, col, sx = 1, seg = 20) => { const t = new THREE.TorusGeometry(R, r, 5, seg); gold.geometry(t, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(sx, 1, 1)), col); t.dispose(); };
    const caseAt = (cx, cz, len, alongZ) => { const D = 0.6, Hc = 1.0; wal.box(cx, 0.4, cz, alongZ ? D : len, 0.8, alongZ ? len : D, { col: WHITE }); k.get('velvet').box(cx, 0.82, cz, alongZ ? D - 0.04 : len - 0.04, 0.03, alongZ ? len - 0.04 : D - 0.04, { col: C('#3a1020') });
      k.get('glass').box(cx, Hc - 0.09, cz, alongZ ? D - 0.02 : len - 0.02, 0.2, alongZ ? len - 0.02 : D - 0.02); k.get('brass').box(cx, Hc + 0.01, cz, alongZ ? D : len, 0.012, alongZ ? len : D, { col: C('#d4af37') });
      const n = Math.floor(len / 0.32); for (let i = 0; i < n; i++) { const a = -len / 2 + 0.16 + i * (len - 0.32) / Math.max(1, n - 1); const px = alongZ ? cx : cx + a, pz = alongZ ? cz + a : cz; const kind = (i + Math.floor(cx * 3)) % 4;
        if (kind === 0) { tor(px, 0.845, pz, 0.09, 0.006, Math.PI / 2, 0, G, 1.0, 28); for (let j = 0; j < 7; j++) tor(px + Math.cos(j) * 0.09, 0.845, pz + Math.sin(j) * 0.09 * 0.9, 0.012, 0.004, rng() * 3, rng() * 3, G2, 1, 8); } // necklace
        else if (kind === 1) for (let j = 0; j < 3; j++) tor(px - 0.06 + j * 0.06, 0.9, pz, 0.04, 0.005, 0, alongZ ? Math.PI / 2 : 0, G, 1, 18); // bangles on edge
        else if (kind === 2) { k.get('velvet').box(px, 0.86, pz, 0.16, 0.05, 0.1, { col: C('#141414') }); for (let j = 0; j < 4; j++) { tor(px - 0.05 + j * 0.035, 0.895, pz, 0.011, 0.003, 0, alongZ ? Math.PI / 2 : 0, j % 2 ? S : G, 1, 10); k.get('glass').box(px - 0.05 + j * 0.035, 0.91, pz, 0.008, 0.008, 0.008); } } // ring tray
        else { tor(px, 0.845, pz, 0.06, 0.004, Math.PI / 2, 0, G2, 1.3, 24); k.get('emissive').box(px, 0.85, pz + 0.06, 0.012, 0.012, 0.012, { col: [0.2, 0.35, 1] }); } } }; // pendant with a sapphire
    caseAt(-0.6, z0 + 1.6, Math.min(2.6, x1 - x0 - 2.4), false); c.ob(-0.6, z0 + 1.6, Math.min(2.6, x1 - x0 - 2.4) + 0.04, 0.64);
    caseAt(x0 + 0.55, (z0 + zf) / 2 - 0.3, Math.min(3.2, zf - z0 - 3.4), true); c.ob(x0 + 0.55, (z0 + zf) / 2 - 0.3, 0.64, Math.min(3.2, zf - z0 - 3.4) + 0.04);
    for (let i = 0; i < 3; i++) { const bx = -1.4 + i * 0.8, bz = z0 + 0.32; wal.box(bx, 0.55, bz, 0.4, 1.1, 0.36, { col: WHITE }); lathe(k.get('velvet'), bx, 1.1, bz, [[0.11, 0], [0.12, 0.08], [0.1, 0.22], [0.045, 0.3], [0.04, 0.42], [0.001, 0.43]], 16, C('#151515')); tor(bx, 1.26, bz + 0.03, 0.06, 0.005, Math.PI / 2 - 0.5, 0, G, 1.2, 26); tor(bx, 1.22, bz + 0.05, 0.075, 0.006, Math.PI / 2 - 0.6, 0, G2, 1.25, 30); spot(k, bx, H, bz + 0.5); } // busts
    { const sx = x1 - 0.55, sz = z0 + 0.45; k.get('metal').box(sx, 0.6, sz, 0.7, 1.2, 0.65, { col: C('#3b3f44') }); k.get('chrome').cylinder(sx, 0.7, sz + 0.33, 0.08, 0.08, 0.03, 18, { col: WHITE }); k.get('brass').box(sx + 0.2, 0.5, sz + 0.335, 0.02, 0.18, 0.02, { col: C('#d4af37') }); c.ob(sx, sz, 0.72, 0.68); } // safe
    k.get('mirror').box(x0 + 0.05, 1.5, zf - 1.2, 0.012, 1.0, 0.6, { col: [0.95, 0.95, 0.95] }); k.get('brass').box(x0 + 0.045, 1.5, zf - 1.2, 0.01, 1.04, 0.64, { col: C('#d4af37') });
    for (let i = 0; i < 6; i++) spot(k, -1.6 + (i % 3) * 1.6, H, zf - 1.4 - Math.floor(i / 3) * 2.4); pendant(k, 0, H - 0.6, (z0 + zf) / 2, H, '#d4af37', 0.22); cctv(k, x1 - 0.4, H, zf - 0.5); cctv(k, x0 + 0.4, H, z0 + 0.4);
    poster(c.g, k, 'jewelCert', x0 + 0.04, 2.6, (z0 + zf) / 2 + 1, Math.PI / 2, 0.5, 0.36, [['HALLMARKED', 0.16], ['22 CT GOLD', 0.2], ['certified gems', 0.1, 500]], '#f6efe0', '#5a3a12', '#d4af37');
    return { lights: [[0, H - 0.5, zf - 1.5, 0xffe4bc, 11, 8], [-0.6, 2.2, z0 + 1.6, 0xfff0d8, 8, 4], [x0 + 0.8, 2.2, (z0 + zf) / 2, 0xfff0d8, 6, 4], [0, 2.3, z0 + 0.6, 0xffe8c8, 5, 3.5]], counter: { glass: true, top: 'marbleDark', body: 'walnut' }, behind: null, gold: true }; },

  phone(c) { const { k, g, x0, x1, z0, zf, H, rng } = c; const L = CELL; // lit phone wall (left), accessory pegboard (back), demo table, repair bench
    const E = k.get('emissive'), P = k.get('paint'); const len = zf - z0 - 1.6; const wz0 = z0 + 0.3, wz1 = zf - 1.3;
    P.box(x0 + 0.04, 1.4, (wz0 + wz1) / 2, 0.06, 2.0, wz1 - wz0, { col: C('#f7f7f7') }); E.box(x0 + 0.075, 2.42, (wz0 + wz1) / 2, 0.01, 0.03, wz1 - wz0 - 0.1, { col: [0.75, 0.9, 1] });
    for (let r = 0; r < 4; r++) for (let i = 0; i < Math.floor((wz1 - wz0) / 0.36); i++) { const z = wz0 + 0.2 + i * 0.36, y = 0.85 + r * 0.42; P.box(x0 + 0.1, y - 0.12, z, 0.1, 0.012, 0.16, { col: C('#d8dadc') }); P.box(x0 + 0.1, y, z, 0.01, 0.16, 0.08, { col: C('#0d0e10') });
      const sc = [[0.2, 0.45, 0.95], [0.85, 0.35, 0.55], [0.25, 0.8, 0.7], [0.95, 0.7, 0.3], [0.5, 0.4, 0.9]][(r + i) % 5]; E.box(x0 + 0.106, y, z, 0.002, 0.145, 0.07, { col: sc.map((q) => q * 0.8) }); k.get('paint').box(x0 + 0.1, y - 0.135, z, 0.06, 0.015, 0.1, { col: C('#f0f0ee') }); } // price tags
    void len; const pg = k.get('pegboard'); pg.box(0.4, 1.4, z0 + 0.015, x1 - x0 - 1.6, 1.8, 0.02, { col: C('#ffffff') });
    for (let r = 0; r < 4; r++) for (let i = 0; i < Math.floor((x1 - x0 - 1.8) / 0.26); i++) { const x = x0 + 1.15 + i * 0.26, y = 0.8 + r * 0.42; k.get('chrome').box(x, y + 0.13, z0 + 0.09, 0.006, 0.006, 0.15, { col: WHITE }); k.get('products').box(x, y, z0 + 0.12, 0.13 + (r % 2) * 0.03, 0.2, 0.025, { uvRect: cellUV([L.buds, L.charger, L.case, L.power, L.cable, L.band][(r * 3 + i) % 6]), col: WHITE }); }
    { const tx = x0 + 2.0, tz = (z0 + zf) / 2; k.get('oak').box(tx, 0.88, tz, 0.9, 0.05, 1.8, { col: WHITE }); P.box(tx, 0.43, tz, 0.7, 0.86, 1.5, { col: C('#f2f2f2') }); c.ob(tx, tz, 0.92, 1.82); // demo table
      for (let i = 0; i < 6; i++) { const z = tz - 0.7 + i * 0.28; k.get('chrome').box(tx - 0.2 + (i % 2) * 0.4, 0.95, z, 0.03, 0.09, 0.03, { col: WHITE }); P.box(tx - 0.2 + (i % 2) * 0.4, 1.02, z, 0.08, 0.16, 0.01, { col: C('#0e0f12') }); E.box(tx - 0.2 + (i % 2) * 0.4, 1.02, z + 0.006, 0.07, 0.145, 0.002, { col: [[0.2, 0.45, 0.95], [0.85, 0.35, 0.55], [0.25, 0.8, 0.7]][i % 3] }); }
      P.box(tx, 0.94, tz + 0.72, 0.36, 0.012, 0.26, { col: C('#121316') }); E.box(tx, 0.947, tz + 0.72, 0.33, 0.002, 0.23, { col: [0.18, 0.3, 0.55] }); } // tablet
    P.box(-0.2, 2.75, z0 + 0.04, 2.2, 0.36, 0.03, { col: C('#0d1b2a') }); E.box(-0.2, 2.75, z0 + 0.06, 1.9, 0.06, 0.01, { col: [0.25, 0.82, 1] });
    for (let i = 0; i < 3; i++) batten(k, 0.2, H - 0.02, zf - 1.4 - i * 2.2, 1.6); cctv(k, x1 - 0.4, H, zf - 0.5);
    poster(c.g, k, 'phoneRepair', x1 - 0.04, 2.3, z0 + 1.0, -Math.PI / 2, 0.6, 0.42, [['SCREEN REPAIR', 0.16], ['in 1 hour', 0.13, 500], ['from Rs 4,500', 0.16]], '#0d1b2a', '#3fd0ff', '#222');
    return { lights: [[0, H - 0.4, zf - 1.5, 0xf2f6ff, 9, 7], [0, H - 0.4, (z0 + zf) / 2, 0xf2f6ff, 9, 7], [x0 + 0.8, 2.2, (z0 + zf) / 2, 0xe8f0ff, 4, 4]], counter: { glass: true, top: 'marble', body: 'paint', bodyCol: C('#f2f2f2') }, behind: [L.nova, L.aura, L.buds, L.power], phones: true }; },

  liquor(c) { const { k, g, x0, x1, z0, zf, H, rng } = c; const L = CELL; // Sri Lankan wine store: customers on a strip of floor, everything behind the grille
    const glassCols = ['#2f4a2a', '#5a3a14', '#e8eef0', '#20301e', '#3a2410']; const lab = [L.polArrack, L.oldRes, L.cocoArrack, L.specArrack, L.whisky];
    const sb = shelving(k, x0 + 0.2, x1 - 0.2, z0, 0.32, 6, 2.6, { mat: 'oak', col: '#ffffff', back: 'oak', backCol: '#d8c8a8' });
    sb.ys.forEach((y, l) => { for (let x = x0 + 0.3; x < x1 - 0.3; x += 0.09) { const i = Math.floor((x - x0) / 0.55 + l) % lab.length; if (rng() < 0.04) continue; bottle(k, x, y, sb.c + 0.02, lab[i], glassCols[i], Math.PI / 2, l === 5 ? 0.9 : 1, undefined, 6); } });
    const sl = shelving(k, z0 + 0.6, zf - 3.4, x0, 0.32, 5, 2.4, { alongZ: true, face: 1, mat: 'oak', col: '#ffffff', back: 'oak', backCol: '#d8c8a8' });
    sl.ys.forEach((y, l) => { for (let z = z0 + 0.7; z < zf - 3.5; z += 0.09) { const i = (Math.floor((z - z0) / 0.5) + l) % 3; bottle(k, sl.c + 0.02, y, z, [L.lager, L.stout, L.toddy][i], ['#1d4a1d', '#121212', '#5a3a14'][i], 0, 1.08, '#c9ccd0', 6); } });
    for (let i = 0; i < 6; i++) { const cx = x1 - 0.5 - (i % 2) * 0.5, cz = z0 + 1.5 + Math.floor(i / 2) * 0.0, cy = 0.17 + Math.floor(i / 2) * 0.33; k.get('plastic').box(cx, cy, cz, 0.44, 0.32, 0.36, { col: C(i % 3 ? '#1f6b2e' : '#b71c1c') }); for (let j = 0; j < 12; j++) k.get('bottle').cylinder(cx - 0.17 + (j % 4) * 0.11, cy + 0.16, cz - 0.12 + Math.floor(j / 4) * 0.12, 0.014, 0.012, 0.05, 6, { col: C('#1d4a1d') }); } // beer crates
    // the grille: counter across the room with steel bars to the ceiling, a serving hatch above the counter top
    const gz = zf - 3.0; const M = k.get('steel'); k.get('oak').box((x0 + x1) / 2, 0.5, gz, x1 - x0, 1.0, 0.5, { col: WHITE }); k.get('marbleDark').box((x0 + x1) / 2, 1.02, gz - 0.02, x1 - x0, 0.04, 0.56, { col: WHITE });
    for (let x = x0 + 0.08; x < x1 - 0.05; x += 0.12) { const hatch = Math.abs(x - (x1 - 1.6)) < 0.45; M.cylinder(x, hatch ? 1.55 : 1.04, gz + 0.22, 0.009, 0.009, hatch ? H - 1.55 : H - 1.04, 6, { col: C('#9aa0a6'), caps: false }); }
    for (const y of [1.55, 2.2, H - 0.06]) M.box((x0 + x1) / 2, y, gz + 0.22, x1 - x0, 0.03, 0.03, { col: C('#9aa0a6') });
    c.obAbs(x0, x1, gz - 0.3, gz + 0.3); c.customerZ = gz + 0.65; c.keeperZ = gz - 0.6;
    for (let i = 0; i < 2; i++) batten(k, 0, H - 0.02, gz - 0.9 - i * 1.8, 1.25); batten(k, 0, H - 0.02, zf - 1.2, 1.25); cctv(k, x0 + 0.4, H, zf - 0.6);
    poster(c.g, k, 'liqNotice', x0 + 0.04, 1.9, zf - 1.4, Math.PI / 2, 0.6, 0.4, [['NO SALE', 0.2], ['to persons under 21', 0.11, 500], ['Excise licence displayed', 0.09, 500]], '#fff6e0', '#7a1c14', '#3a2a1a');
    return { lights: [[0, H - 0.4, zf - 1.3, 0xffe2b8, 7, 6], [0, H - 0.4, gz - 1.1, 0xfff0d8, 9, 6], [0, 2.4, z0 + 0.7, 0xffe8c8, 6, 5]], grille: true, behind: null }; },

  bakery(c) { const { k, g, x0, x1, z0, zf, H, rng } = c; const L = CELL; // white tile walls, short-eats cabinets, bread racks, cake fridge, tea urn, two tables
    const T = k.get('tileW'); T.box(0, 0.9, z0 + 0.012, x1 - x0, 1.8, 0.02, { col: WHITE }); T.box(x0 + 0.012, 0.9, (z0 + zf) / 2, 0.02, 1.8, zf - z0, { col: WHITE }); k.get('paint').box(0, 1.81, z0 + 0.02, x1 - x0, 0.03, 0.03, { col: C('#7a3b12') });
    const P = k.get('products'); const bread = (x, y, z, l = 0.26) => { P.box(x, y + 0.05, z, l, 0.1, 0.12, { uvRect: cellUV(L.crust), col: WHITE }); lathe(P, x, y + 0.1, z, [[0.06, 0], [0.055, 0.025], [0.035, 0.045], [0.001, 0.05]], 8, WHITE); };
    const rack = shelving(k, x0 + 0.2, x1 - 0.2, z0, 0.42, 5, 2.0, { mat: 'chrome', col: '#ffffff', back: 'tileW', backCol: '#ffffff' });
    rack.ys.forEach((y, l) => { for (let x = x0 + 0.35; x < x1 - 0.35; x += 0.3) { if (l === 4) { lathe(P, x, y, rack.c, [[0.12, 0], [0.12, 0.06], [0.11, 0.07], [0.001, 0.075]], 16, WHITE); continue; } if (l % 2) { P.box(x, y + 0.07, rack.c, 0.22, 0.14, 0.14, { uvRect: cellUV(L.breadBag), col: WHITE }); } else bread(x, y, rack.c); } });
    const cab = (cx, cz, len) => { const D = 0.62; k.get('paint').box(cx, 0.45, cz, len, 0.9, D, { col: C('#f6efe0') }); k.get('oak').box(cx, 0.92, cz, len + 0.04, 0.04, D + 0.04, { col: WHITE }); k.get('glass').box(cx, 1.17, cz - D / 2 + 0.05, len - 0.04, 0.46, 0.01); k.get('glass').box(cx, 1.4, cz, len - 0.04, 0.01, D - 0.06);
      for (let tr = 0; tr < 2; tr++) { const ty = 0.95 + tr * 0.22; k.get('chrome').box(cx, ty, cz, len - 0.08, 0.012, D - 0.12, { col: WHITE }); for (let i = 0; i < Math.floor((len - 0.1) / 0.11); i++) for (let j = 0; j < 3; j++) { const px = cx - len / 2 + 0.1 + i * 0.11, pz = cz - 0.17 + j * 0.15; const kind = (i + j + tr) % 4;
        if (kind === 0) lathe(P, px, ty + 0.006, pz, [[0.045, 0], [0.047, 0.012], [0.04, 0.035], [0.02, 0.05], [0.001, 0.053]], 10, WHITE); // fish bun
        else if (kind === 1) P.box(px, ty + 0.025, pz, 0.09, 0.04, 0.05, { uvRect: cellUV(L.crumb), col: WHITE }); // roll
        else if (kind === 2) { lathe(P, px, ty + 0.006, pz, [[0.04, 0], [0.04, 0.02], [0.03, 0.03], [0.001, 0.032]], 10, WHITE); }
        else P.box(px, ty + 0.02, pz, 0.08, 0.035, 0.08, { uvRect: cellUV([L.icingW, L.icingC][j % 2]), col: WHITE }); } } // cake squares
      E2(k, cx, 1.39, cz, len); };
    const E2 = (kk, cx, y, cz, len) => kk.get('emissive').box(cx, y, cz + 0.2, len - 0.1, 0.008, 0.02, { col: [1, 0.94, 0.82] });
    const cl = Math.min(2.2, x1 - x0 - 3.2); cab(x0 + 0.35 + cl / 2, zf - 2.6, cl); c.ob(x0 + 0.35 + cl / 2, zf - 2.6, cl + 0.04, 0.66);
    { const fx = x0 + 0.45, fz = (z0 + zf) / 2 - 0.4; k.get('paint').box(fx, 0.5, fz, 0.66, 1.0, 1.1, { col: C('#f2f2f0') }); k.get('glass').box(fx + 0.02, 1.45, fz, 0.6, 0.9, 1.04); k.get('emissive').box(fx, 1.88, fz, 0.5, 0.01, 0.9, { col: [1, 0.96, 0.9] }); // cake fridge
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const cz2 = fz - 0.25 + i * 0.5, cy = 1.04 + j * 0.42; k.get('chrome').box(fx, cy - 0.01, cz2, 0.56, 0.01, 0.46, { col: WHITE }); lathe(P, fx, cy, cz2, [[0.14, 0], [0.14, 0.1], [0.13, 0.11], [0.001, 0.115]], 20, WHITE); k.get('paint').cylinder(fx, cy + 0.115, cz2, 0.12, 0.12, 0.012, 16, { col: C(['#e57aa0', '#7a3f1f', '#f6e3c4', '#3fa04a'][i + j * 2]) }); }
      c.ob(fx, fz, 0.7, 1.14); }
    { const ux = x0 + 0.4, uz = zf - 1.3; k.get('steel').box(ux, 0.45, uz, 0.5, 0.9, 0.5, { col: C('#9a9da0') }); lathe(k.get('steel'), ux, 0.9, uz, [[0.17, 0], [0.18, 0.05], [0.18, 0.45], [0.15, 0.5], [0.05, 0.53], [0.02, 0.6], [0.001, 0.6]], 16, C('#e0e2e4')); k.get('paint').box(ux + 0.19, 1.0, uz, 0.06, 0.05, 0.04, { col: C('#1b1b1b') }); c.ob(ux, uz, 0.52, 0.52); } // tea urn
    poster(c.g, k, 'bakeMenu', x0 + 0.04, 2.35, (z0 + zf) / 2 + 0.6, Math.PI / 2, 0.8, 0.6, [['SHORT EATS', 0.13], ['Fish bun  Rs 120', 0.1, 500], ['Vegetable roll  Rs 100', 0.1, 500], ['Egg bun  Rs 130', 0.1, 500], ['Plain tea  Rs 60', 0.1, 500]], '#2a1a10', '#f6e3c4', '#7a3b12');
    for (let i = 0; i < 3; i++) pendant(k, -0.6 + (i % 2) * 1.2, H - 0.75, zf - 1.5 - i * 2.2, H, '#7a3b12', 0.18);
    return { lights: [[0, H - 0.8, zf - 1.5, 0xffd9a8, 8, 7], [0, H - 0.8, (z0 + zf) / 2, 0xffe2b8, 9, 7], [0, 2.4, z0 + 0.8, 0xfff0dc, 6, 5]], counter: { glass: false, top: 'oak', body: 'tileW' }, behind: [L.cookies, L.loveCake, L.breadBag] }; },

  hardware(c) { const { k, g, x0, x1, z0, zf, H, rng } = c; const L = CELL; // steel racking, paint, cement, pipes, tool wall, ladder, hoses, buckets
    const rb = shelving(k, x0 + 0.2, x1 - 0.2, z0, 0.6, 4, 2.6, { mat: 'metal', col: '#2a5fa8', back: 'concreteW', backCol: '#d6d2c8', plinth: '#f2a31a', edge: '#f2a31a' });
    rb.ys.forEach((y, l) => { if (l === 0) { for (let x = x0 + 0.4; x < x1 - 0.4; x += 0.62) for (let j = 0; j < 3; j++) k.get('products').box(x, y + 0.08 + j * 0.15, rb.c, 0.56, 0.14, 0.38, { uvRect: cellUV(j % 2 ? L.putty : L.cement), col: WHITE }); return; } // cement / putty bags
      for (let x = x0 + 0.35; x < x1 - 0.3; x += 0.22) { const cell = [L.paintW, L.paintB, L.paintR, L.glue][Math.floor((x - x0) / 0.66 + l) % 4]; const big = cell !== L.glue; for (let d = 0; d < 2; d++) { const r = big ? 0.095 : 0.045; labelCyl(k.get('products'), x, y, rb.c + 0.12 - d * 0.22, r, big ? 0.2 : 0.11, cell, Math.PI / 2, 14); k.get('metal').cylinder(x, y + (big ? 0.2 : 0.11), rb.c + 0.12 - d * 0.22, r, r * 0.95, 0.01, 14, { col: C('#b8bcc0') }); } } });
    const pg = k.get('pegboard'); const tz0 = z0 + 1.0, tz1 = zf - 1.4; pg.box(x0 + 0.02, 1.45, (tz0 + tz1) / 2, 0.02, 1.9, tz1 - tz0, { col: WHITE });
    for (let r = 0; r < 4; r++) for (let z = tz0 + 0.15; z < tz1 - 0.1; z += 0.24) { const x = x0 + 0.06, y = 0.75 + r * 0.45; const kind = (r * 5 + Math.round(z * 4)) % 5; k.get('chrome').box(x + 0.06, y + 0.15, z, 0.12, 0.006, 0.006, { col: WHITE });
      if (kind === 0) { k.get('oak').box(x + 0.08, y - 0.04, z, 0.03, 0.3, 0.03, { col: WHITE }); k.get('steel').box(x + 0.08, y + 0.12, z, 0.04, 0.04, 0.12, { col: C('#3a3c40') }); } // hammer
      else if (kind === 1) for (let j = 0; j < 3; j++) k.get('steel').box(x + 0.06 + j * 0.0, y - 0.02 - j * 0.0, z - 0.05 + j * 0.05, 0.01, 0.2 + j * 0.03, 0.025, { col: C('#c8ccd0') }); // spanners
      else if (kind === 2) { k.get('steel').box(x + 0.07, y - 0.05, z, 0.004, 0.14, 0.32, { col: C('#d0d4d8') }); k.get('plastic').box(x + 0.07, y + 0.07, z + 0.12, 0.03, 0.08, 0.1, { col: C('#c62828') }); } // saw
      else if (kind === 3) { k.get('plastic').box(x + 0.07, y - 0.02, z, 0.03, 0.12, 0.03, { col: C('#f2c200') }); k.get('steel').box(x + 0.07, y - 0.15, z, 0.008, 0.14, 0.008, { col: C('#c8ccd0') }); } // screwdriver
      else k.get('products').box(x + 0.06, y - 0.03, z, 0.04, 0.16, 0.16, { uvRect: cellUV(L.nails), col: WHITE }); }
    { const px = x0 + 1.6, pz = (z0 + zf) / 2; k.get('metal').box(px, 0.04, pz, 0.6, 0.08, 2.4, { col: C('#2a5fa8') }); for (let i = 0; i < 18; i++) { const r = 0.02 + (i % 3) * 0.012; const t = new THREE.CylinderGeometry(r, r, 2.3, 10); k.get('plastic').geometry(t, new THREE.Matrix4().compose(new THREE.Vector3(px - 0.24 + (i % 6) * 0.095, 0.12 + Math.floor(i / 6) * 0.09, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1)), C(i % 4 === 3 ? '#e8e6df' : '#9aa0a6')); t.dispose(); } c.ob(px, pz, 0.62, 2.42); } // PVC pipe stack
    { const lx = x1 - 0.25, lz = z0 + 2.2; for (const s of [-0.2, 0.2]) k.get('steel').box(lx, 1.1, lz + s, 0.04, 2.2, 0.05, { col: C('#c8ccd0') }); for (let i = 0; i < 7; i++) k.get('steel').box(lx, 0.2 + i * 0.3, lz, 0.035, 0.03, 0.4, { col: C('#c8ccd0') }); } // ladder leaning on the wall
    for (let i = 0; i < 3; i++) { const t = new THREE.TorusGeometry(0.22, 0.018, 6, 22); k.get('plastic').geometry(t, new THREE.Matrix4().compose(new THREE.Vector3(x1 - 0.08, 1.6 - i * 0.5, z0 + 3.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1)), C(['#2e7d32', '#f2a31a', '#1565c0'][i])); t.dispose(); } // hose coils
    for (let i = 0; i < 4; i++) lathe(k.get('plastic'), x0 + 0.4, 0 + i * 0.05, zf - 0.8, [[0.13, 0], [0.16, 0.26], [0.17, 0.28], [0.155, 0.28], [0.12, 0.02]], 14, C(['#c62828', '#1565c0', '#2e7d32', '#f2a31a'][i])); c.ob(x0 + 0.4, zf - 0.8, 0.36, 0.36); // stacked buckets
    for (let i = 0; i < 3; i++) batten(k, 0, H - 0.02, zf - 1.4 - i * 2.4, 1.4); cctv(k, x1 - 0.4, H, zf - 0.5);
    poster(c.g, k, 'hwSale', x1 - 0.03, 2.5, (z0 + zf) / 2 + 1.2, -Math.PI / 2, 0.7, 0.45, [['CEMENT', 0.18], ['50 kg  Rs 2,450', 0.14], ['delivery available', 0.1, 500]], '#f2c200', '#1a1a1a', '#1a1a1a');
    return { lights: [[0, H - 0.4, zf - 1.5, 0xf4f6ff, 9, 7], [0, H - 0.4, (z0 + zf) / 2, 0xf4f6ff, 10, 8], [0, H - 0.4, z0 + 1.2, 0xf4f6ff, 8, 7]], counter: { glass: false, top: 'oak', body: 'concreteW' }, behind: [L.nails, L.glue, L.toolbox, L.paintW] }; },

  books(c) { const { k, g, x0, x1, z0, zf, H, rng } = c; const L = CELL; // oak shelving on the back + left walls, books one by one, tables of new releases
    const books = (s, a0, a1, alongZ, face) => s.ys.forEach((y, l) => { if (l === s.ys.length - 1) return; let a = a0 + 0.02; while (a < a1 - 0.04) { const bw = 0.025 + rng() * 0.035, bh = 0.2 + rng() * 0.12, bd = 0.15 + rng() * 0.06; const cell = [L.spinesA, L.spinesB, L.spinesC][Math.floor(rng() * 3)]; const [u0, v0, u1, v1] = cellUV(cell); const su = u0 + Math.floor(rng() * 16) * (u1 - u0) / 16;
      if (rng() < 0.04) { a += 0.06; continue; } const lean = rng() < 0.03; const cx = alongZ ? s.c + face * (0.13 - bd / 2) : a + bw / 2, cz = alongZ ? a + bw / 2 : s.c + face * (0.13 - bd / 2);
      k.get('products').box(cx, y + bh / 2, cz, alongZ ? bd : bw, bh, alongZ ? bw : bd, { uvRect: [su, v0, su + (u1 - u0) / 16 * 0.9, v1], col: WHITE, rotY: lean ? 0.12 : 0 }); a += bw + 0.002; } });
    const sb = shelving(k, x0 + 0.2, x1 - 0.2, z0, 0.32, 6, 2.5, { mat: 'oak', col: '#ffffff', back: 'oak', backCol: '#b89a74', plinth: '#3a2618' }); books(sb, x0 + 0.24, x1 - 0.24, false, 1);
    const sl = shelving(k, z0 + 0.5, zf - 1.3, x0, 0.32, 6, 2.5, { alongZ: true, face: 1, mat: 'oak', col: '#ffffff', back: 'oak', backCol: '#b89a74', plinth: '#3a2618' }); books(sl, z0 + 0.54, zf - 1.34, true, 1); c.ob(x0 + 0.18, (z0 + 0.5 + zf - 1.3) / 2, 0.36, zf - 1.3 - z0 - 0.5);
    const table = (tx, tz, cells) => { k.get('walnut').box(tx, 0.76, tz, 1.2, 0.05, 0.8, { col: WHITE }); for (const [sx, sz] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) k.get('walnut').box(tx + sx, 0.37, tz + sz, 0.05, 0.74, 0.05, { col: WHITE });
      for (let i = 0; i < 6; i++) { const px = tx - 0.4 + (i % 3) * 0.4, pz = tz - 0.18 + Math.floor(i / 3) * 0.36; const n = 3 + Math.floor(rng() * 4); for (let j = 0; j < n; j++) k.get('products').box(px, 0.785 + j * 0.03 + 0.014, pz, 0.24, 0.028, 0.17, { uvRect: cellUV(cells[i % cells.length]), col: WHITE, rotY: (rng() - 0.5) * 0.1 }); }
      c.ob(tx, tz, 1.22, 0.82); };
    table(x0 + 1.9, (z0 + zf) / 2 - 0.8, [L.novel, L.cookery, L.atlas]); table(x0 + 1.9, (z0 + zf) / 2 + 1.0, [L.exercise, L.dict, L.exercise]);
    { const sx = x1 - 0.5, sz = z0 + 1.6; k.get('steel').cylinder(sx, 0, sz, 0.2, 0.2, 0.03, 16, { col: C('#3a3c40') }); k.get('steel').box(sx, 0.75, sz, 0.03, 1.5, 0.03, { col: C('#3a3c40') }); for (let i = 0; i < 4; i++) { lathe(k.get('plastic'), sx + Math.cos(i * 1.57) * 0.16, 0.95, sz + Math.sin(i * 1.57) * 0.16, [[0.04, 0], [0.04, 0.1], [0.001, 0.1]], 10, C(['#1565c0', '#c62828', '#2e7d32', '#222'][i])); for (let j = 0; j < 6; j++) k.get('plastic').cylinder(sx + Math.cos(i * 1.57) * 0.16 + (j % 3 - 1) * 0.015, 1.0, sz + Math.sin(i * 1.57) * 0.16 + (Math.floor(j / 3) - 0.5) * 0.015, 0.004, 0.004, 0.16, 6, { col: C(['#1565c0', '#c62828', '#222'][j % 3]) }); } c.ob(sx, sz, 0.45, 0.45); } // pen stand
    { const ax = x1 - 0.6, az = z0 + 2.8; k.get('leather').box(ax, 0.25, az, 0.7, 0.4, 0.7, { col: WHITE }); k.get('leather').box(ax + 0.3, 0.6, az, 0.12, 0.5, 0.7, { col: WHITE }); for (const s of [-0.3, 0.3]) k.get('leather').box(ax, 0.48, az + s, 0.66, 0.18, 0.12, { col: WHITE }); c.ob(ax, az, 0.75, 0.75); } // reading chair
    for (let i = 0; i < 3; i++) pendant(k, -0.4 + (i % 2) * 0.8, H - 0.7, zf - 1.5 - i * 2.4, H, '#20304a', 0.2);
    poster(c.g, k, 'bookSign', x1 - 0.04, 2.4, (z0 + zf) / 2 + 1.2, -Math.PI / 2, 0.6, 0.44, [['SCHOOL BOOKS', 0.15], ['Grade 1 – A/L', 0.12, 500], ['exercise books · pens', 0.1, 500]], '#20304a', '#f4ead2', '#3a2618');
    return { lights: [[0, H - 0.8, zf - 1.5, 0xffe0b8, 8, 7], [0, H - 0.8, (z0 + zf) / 2, 0xffe4c0, 9, 7], [0, H - 0.8, z0 + 1.2, 0xffe0b8, 8, 7], [x0 + 0.8, 2.3, (z0 + zf) / 2, 0xffe8cc, 4, 4]], counter: { glass: false, top: 'oak', body: 'walnut' }, behind: [L.exercise, L.novel, L.dict, L.atlas] }; },
};

// ------------------------------------------------------------------------------------------------ robbery state (per store, survives rebuilding the room)
export const ROB_STATE = {}; const RESTOCK = 600; // seconds until a robbed till is full again
// takings: Rs 100,000 – 500,000, weighted toward ~Rs 2 lakh (median ≈ 1.9 lakh, mean ≈ 2.25 lakh), to the nearest Rs 50
export function takings(r = Math.random()) { return Math.round((100000 + 400000 * Math.pow(r, 2.2)) / 50) * 50; }
const SURPRISE = 0.3; // chance the keeper only pretends and pulls a gun
const lakh = (n) => 'Rs ' + n.toLocaleString('en-IN');
let FLASH = null; const flashMesh = () => { if (!FLASH) { const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null; let map = null; if (cv && cv.getContext) { cv.width = cv.height = 64; const x = cv.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.3, 'rgba(255,190,80,0.85)'); gr.addColorStop(1, 'rgba(255,120,20,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); map = new THREE.CanvasTexture(cv); }
  FLASH = { geo: new THREE.PlaneGeometry(1, 1), mat: new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }) }; }
  const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const q = new THREE.Mesh(FLASH.geo, FLASH.mat); if (i < 2) { q.scale.set(0.07, 0.24, 1); q.position.z = 0.09; q.rotation.x = Math.PI / 2; q.rotation.y = i * Math.PI / 2; } else q.scale.set(0.13, 0.13, 1); g.add(q); } g.visible = false; return g; };
const qE = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
const Q_GRIP = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.8, 0, 0)), Q_SUP_P = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.3, -Math.PI / 2));
const sm = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------ build
export function buildRobberyShop(game, id, site) {
  const def = ROB_DEFS[id]; const { w: W, d: D } = fit(def, site); const H = def.H; const g = new THREE.Group(); const k = new Kit(); const obs = []; const rng = rngOf(7000 + Object.keys(ROB_DEFS).indexOf(id) * 13);
  const st = STYLE[def.type]; const S = shell(k, g, W, D, H, st); const { x0, x1, z0, zf } = S;
  if (st.ceilTiles) k.get('ceilTile').hrect(x0, z0, x1, zf, H - 0.004, 0.6, WHITE, true);
  const c = { k, g, x0, x1, z0, zf, H, W, D, rng, ob: (x, z, w, d) => ob(obs, x, z, w, d), obAbs: (a0, a1, b0, b1) => obs.push({ x0: a0, x1: a1, z0: b0, z1: b1, h: 1.05 }) };
  const R = BUILD[def.type](c);
  // ---- counter + till by the door on the right; the keeper behind it (enclosed: the counter runs to the front wall, a flap closes the back)
  let kx, kz, till, cust, cash; const cz0 = zf - 0.3, cz1 = zf - 2.9;
  if (R.grille) { const gz = c.keeperZ + 0.6; till = { x: x1 - 1.05, y: 1.04, z: gz - 0.08 }; kx = x1 - 0.75; kz = gz - 0.62; cust = { x: x1 - 1.6, z: c.customerZ }; cash = { x: x1 - 1.6, z: gz + 0.1 }; } // (serving hatch at x1 − 1.6)
  else { const cx = x1 - 1.45; counter(k, cx, cz0, cz1, R.counter || {}); obs.push({ x0: cx - 0.36, x1: cx + 0.36, z0: cz1, z1: cz0 + 0.31, h: 1.0 }); obs.push({ x0: cx, x1: x1, z0: cz1 - 0.08, z1: cz1 + 0.08, h: 1.0 }); // counter + back flap
    k.get(R.counter?.body || 'walnut').box((cx + x1) / 2, 0.5, cz1, x1 - cx - 0.02, 1.0, 0.06, { col: R.counter?.bodyCol || WHITE });
    kx = x1 - 0.78; kz = (cz0 + cz1) / 2 - 0.1; till = { x: cx, y: 0.98, z: kz + 0.45 }; cust = { x: cx - 0.85, z: kz }; cash = { x: cx - 0.2, z: kz - 0.05 };
    // behind the keeper: a wall shelf of the store's own goods, cigarettes-free (lottery / phone cards / sweets)
    if (R.behind) { const sb = shelving(k, cz1 + 0.1, cz0 - 0.1, x1, 0.3, 4, 2.2, { alongZ: true, face: -1, mat: 'paint', col: '#ece9e2', backCol: '#f4f2ec', edge: '#c9a54e', y0: 1.1 }); sb.ys.forEach((y) => fillShelf(k, cz1 + 0.12, cz0 - 0.12, y, sb.c, 0.26, R.behind, rng, { alongZ: true, face: -1, h: [0.08, 0.2], w: [0.05, 0.12], deep: 1 })); }
    if (R.phones) for (let i = 0; i < 5; i++) { k.get('paint').box(cx - 0.05, 0.62, cz1 + 0.4 + i * 0.4, 0.07, 0.006, 0.15, { col: C('#0e0f12') }); k.get('emissive').box(cx - 0.05, 0.624, cz1 + 0.4 + i * 0.4, 0.06, 0.002, 0.13, { col: [0.25, 0.5, 0.9] }); }
    if (R.gold) for (let i = 0; i < 6; i++) { const t = new THREE.TorusGeometry(0.05, 0.004, 5, 18); k.get('gold').geometry(t, new THREE.Matrix4().compose(new THREE.Vector3(cx - 0.05, 0.62, cz1 + 0.35 + i * 0.35), qE(Math.PI / 2, 0, 0), new THREE.Vector3(1, 1, 1)), C('#f0c45a')); t.dispose(); }
    // counter-top bits: a card machine, a bowl of toffees, a bell
    k.get('paint').box(cx - 0.12, 1.02, kz - 0.35, 0.08, 0.03, 0.16, { col: C('#1d1f22') }); k.get('emissive').box(cx - 0.12, 1.037, kz - 0.37, 0.05, 0.002, 0.05, { col: [0.3, 0.6, 0.9] });
    lathe(k.get('glass'), cx - 0.15, 1.0, kz - 0.75, [[0.05, 0], [0.08, 0.06], [0.08, 0.08], [0.001, 0.08]], 12); k.get('chrome').cylinder(cx - 0.18, 1.0, kz + 0.8, 0.035, 0.03, 0.035, 12, { col: WHITE });
  }
  const drawer = register(g, k, till.x, till.y, till.z); k.into(g);
  const lights = (R.lights || []).slice(0, 6).map(([x, y, z, color, i, d]) => ({ p: [x, y, z], color, i, d, decay: 1.5 }));
  const room = base(game, def, g, { x0, x1, z0, z1: zf - 0.02 }, obs, lights, H);
  room.keeper = keeperAt(g, def.keeper, kx, kz, -Math.PI / 2); room.keeperPos = [kx, kz];
  room.rob = robLogic(game, room, id, def, { kx, kz, till, cust, cash, drawer, grille: !!R.grille, x0, x1, z0, zf, H });
  return room;
}

// ------------------------------------------------------------------------------------------------ robbery logic
function robLogic(game, room, id, def, o) {
  const S = ROB_STATE[id] || (ROB_STATE[id] = { until: 0, robs: 0 }); const kp = room.keeper; const A = kp.anim;
  const pistolDef = WEAPONS.find((w) => w.id === 'compact') || WEAPONS[0]; let gun = null, flash = null; let hp = 1.25;
  const R = { state: 'idle', t: 0, amount: 0, cash: null, alarm: 0, shots: 0, cd: 0, drawK: 0, surprise: false, seenGun: 0, store: S };
  const clock = () => game.clock || performance.now() / 1000;
  const toWorld = (x, y, z, out = new THREE.Vector3()) => { out.set(x, y, z); return room.og ? room.og.localToWorld(out) : out; };
  const keeperYaw = (want, dt, rate = 6) => { const cur = kp.root.rotation.y; let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; kp.root.rotation.y = cur + d * Math.min(1, dt * rate); return Math.abs(d); };
  const say = (line, dur = 3) => game.hud && game.hud.subtitle && game.hud.subtitle(def.name, line, '', dur);
  // ---- ray tests in the room's frame (Weapons.trace while the player is inside)
  const toLocalRay = (oW, dW) => { const og = room.og; if (!og) return null; const inv = new THREE.Matrix4().copy(og.matrixWorld).invert(); const lo = oW.clone().applyMatrix4(inv); const ld = dW.clone().transformDirection(inv); return { lo, ld }; };
  R.rayRoom = (oW, dW, range) => { const L = toLocalRay(oW, dW); if (!L) return range; const { lo, ld } = L; let t = range; const hw = DOOR_W / 2; R.exitT = null;
    const planes = [['x', o.x0, -1], ['x', o.x1, 1], ['z', o.z0, -1], ['y', 0, -1], ['y', o.H, 1], ['z', o.zf, 1]];
    for (const [ax, v, sgn] of planes) { const dv = ld[ax]; if (Math.abs(dv) < 1e-6 || Math.sign(dv) !== sgn) continue; const tt = (v - lo[ax]) / dv; if (tt <= 0 || tt >= t) continue; const p = lo.clone().addScaledVector(ld, tt);
      if (ax === 'z' && sgn === 1 && Math.abs(p.x) < hw && p.y < 2.3) { R.exitT = tt; continue; } // out through the doorway (Weapons.trace carries on in the street from here)
      t = tt; }
    for (const b of room.obstacles) { if (!b.h) continue; // solid furniture (counters) stops a bullet below its top
      const tx0 = (b.x0 - lo.x) / ld.x, tx1 = (b.x1 - lo.x) / ld.x, tz0 = (b.z0 - lo.z) / ld.z, tz1 = (b.z1 - lo.z) / ld.z, ty0 = (0 - lo.y) / ld.y, ty1 = (b.h - lo.y) / ld.y;
      const tn = Math.max(Math.min(tx0, tx1), Math.min(tz0, tz1), Math.min(ty0, ty1)), tf = Math.min(Math.max(tx0, tx1), Math.max(tz0, tz1), Math.max(ty0, ty1)); if (tn > 0.05 && tn <= tf && tn < t) t = tn; }
    if (R.exitT !== null && R.exitT >= t) R.exitT = null; return t; };
  R.rayKeeper = (oW, dW, maxT, skip = 0) => { const p = kp.root.getWorldPosition(_v); const down = R.state === 'dead'; const rad = down ? 0.5 : 0.3, top = down ? 0.45 : (kp.spec.height || 1.7) + 0.05;
    const rx = p.x - oW.x, rz = p.z - oW.z; const dh2 = dW.x * dW.x + dW.z * dW.z || 1e-6; const t = (rx * dW.x + rz * dW.z) / dh2; if (t < skip || t > maxT) return null; const cx = oW.x + dW.x * t - p.x, cz = oW.z + dW.z * t - p.z; if (cx * cx + cz * cz > rad * rad) return null;
    const y = oW.y + dW.y * t - p.y; if (y < 0.05 || y > top) return null; return { t, y }; };
  // ---- hit by the player
  R.shot = (hit, dir, dmg) => { if (R.state === 'dead') { if (game.blood) game.blood.spray(hit.point, dir, 0.5); return; }
    if (game.blood) { game.blood.wound && game.blood.wound(kp, hit.point, dir, dmg); game.blood.spray(hit.point, dir, dmg); }
    hp -= dmg * (hit.y > 1.42 ? 3 : 1); if (hp > 0) { A.set('flinch'); setTimeout(() => { if (R.state !== 'dead') A.set(R.state === 'shoot' || R.state === 'draw' ? null : 'handsup'); }, 380); if (R.state === 'idle') begin(); return; }
    die(dir); };
  const die = (dir) => { R.state = 'dead'; room.keeperBusy = true; A.ik = null; A.aim = null; A.reach = null; A.set('down'); kp.root.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI; // falls back, away from the shot
    if (gun) { const p = gun.getWorldPosition(new THREE.Vector3()); gun.parent.remove(gun); gun.matrixAutoUpdate = true; room.g.add(gun); room.og.worldToLocal(p); gun.position.set(p.x + 0.3, 0.02, p.z); gun.rotation.set(Math.PI / 2, 0, Math.random() * 3); if (flash) flash.visible = false; }
    const w = kp.root.getWorldPosition(new THREE.Vector3()); if (game.blood && game.blood.pool) game.blood.pool(w.x, w.z, 0.9, w.y, 1.2);
    if (game.police) game.police.addHeat(1, 'shooting a shopkeeper', null); room.spots = [{ x: o.cust.x, z: o.cust.z, r: 1.3, label: S.until > clock() ? 'The till is empty' : 'Take the cash from the register', till: true }]; };
  // ---- the till (after the keeper went down): E at the counter
  room.interact = () => { const sp = room.near; if (!sp || !sp.till || S.until > clock()) return false; const amt = takings(); S.until = clock() + RESTOCK; S.robs++; o.drawer.position.x = o.till.x + 0.24; o.drawer.userData.notes.visible = false; game.story && game.story.pay(amt, 'Store robbery · ' + def.name); game.hud.notify('Register emptied', `${lakh(amt)} taken from ${def.name}.`, 'success', 4); alarmOn(); sp.label = 'The till is empty'; return true; };
  const alarmOn = () => { if (R.alarm > 0) return; R.alarm = 14; const P = game.player; if (game.police && game.police.addHeat) { const need = Math.max(1, 2 - (game.police.level || 0)); game.police.addHeat(need, 'armed robbery', 'The silent alarm went off at ' + def.name + '.'); if (game.police.incident !== undefined) game.police.incident = { x: P.x, z: P.z, t: game.police.t }; } };
  const begin = () => { if (R.state !== 'idle') return; R.t = 0; const empty = S.until > clock(); R.surprise = !empty && Math.random() < SURPRISE; R.state = 'scared'; room.keeperBusy = false; A.set('handsup'); kp.face && kp.face.set && kp.face.set('fear', 6);
    if (empty) { say('Please! It is empty — they robbed us a few minutes ago! Look, nothing!', 3.5); R.state = 'empty'; } else say(['Okay, okay! Don\'t shoot! Take it!', 'Aiyo — please, no! I will give, I will give!', 'Calm down, calm down… the money is here.'][Math.floor(Math.random() * 3)], 2.6); };
  const handIK = (local, w) => { kp.bones.chest.updateWorldMatrix(true, false); const p = toWorld(local.x, local.y, local.z, _w); kp.bones.chest.worldToLocal(p); A.ik = { R: p.clone(), qR: null, wR: w, L: null }; };
  const ensureGun = () => { if (gun) return gun; gun = buildWeaponModel(pistolDef); gun.matrixAutoUpdate = false; gun.traverse((q) => { if (q.isMesh) q.castShadow = false; }); flash = flashMesh(); if (gun.userData.muzzle) flash.position.copy(gun.userData.muzzle); gun.add(flash); kp.bones.chest.add(gun); return gun; };
  const gunPose = (k, pitch) => { const m = ensureGun(); const ud = m.userData; const low = new THREE.Vector3(-0.12, -0.5, 0.2), aim = new THREE.Vector3(-0.03, 0.2, 0.44); const pos = low.clone().lerp(aim, sm(k)); const q = qE(lerpN(1.3, 0, sm(k)) - (R.kick || 0) * 0.12, 0, 0);
    const body = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)); const chestM = new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeRotationY(0.12), body); m.matrix.copy(chestM); m.matrixWorldNeedsUpdate = true; m.visible = k > 0.08;
    const H = holdFor(kp, m); const wQ = new THREE.Quaternion().setFromRotationMatrix(chestM); const grip = (H ? H.R.wrist.clone() : new THREE.Vector3()).applyMatrix4(chestM); const sup = (H ? H.L.wrist.clone() : (ud.support || new THREE.Vector3(0, -0.02, 0.05)).clone()).applyMatrix4(chestM);
    A.aim = { pitch: pitch * sm(k), twist: 0.12 * sm(k), w: sm(k), headDown: 0 }; A.ik = { R: grip, qR: wQ.clone().multiply(H ? H.R.q : Q_GRIP), wR: sm(Math.min(1, k * 1.6)), L: k > 0.6 ? sup : null, qL: wQ.clone().multiply(H ? H.L.q : Q_SUP_P), wL: sm((k - 0.6) / 0.4) };
    if (kp.rig) { kp.rig.hand('R', H ? H.R.trigger : 'trigger', 1); if (k > 0.6) kp.rig.hand('L', H ? H.L.pose : 'support', 1); } };
  const lerpN = (a, b, t) => a + (b - a) * t;
  const fireAtPlayer = () => { const P = game.player, W = game.weapons; const m = gun; if (!m) return; m.updateWorldMatrix(true, true); const mz = (m.userData.muzzle ? m.userData.muzzle.clone() : new THREE.Vector3(0, 0.03, 0.18)).applyMatrix4(m.matrixWorld);
    const tgt = new THREE.Vector3(P.x, (P.y || 0) + (P.crouching ? 0.9 : 1.3), P.z); const dist = mz.distanceTo(tgt); const sigma = 0.12 + dist * 0.035 + (P.speed > 1 ? 0.15 : 0) + (R.shots === 0 ? 0.1 : 0);
    const dir = tgt.clone().sub(mz).normalize(); const right = new THREE.Vector3(dir.z, 0, -dir.x).normalize(), up = new THREE.Vector3().crossVectors(right, dir); const g1 = (Math.random() + Math.random() + Math.random() - 1.5) * 1.2, g2 = (Math.random() + Math.random() + Math.random() - 1.5) * 1.2;
    const aimP = tgt.clone().addScaledVector(right, g1 * sigma).addScaledVector(up, g2 * sigma * 0.8); const d2 = aimP.sub(mz).normalize(); const tWall = R.rayRoom(mz, d2, 40);
    // the player: a 0.3 m cylinder
    const rx = P.x - mz.x, rz = P.z - mz.z; const dh2 = d2.x * d2.x + d2.z * d2.z || 1e-6; const tp = (rx * d2.x + rz * d2.z) / dh2; const qx = mz.x + d2.x * tp - P.x, qz = mz.z + d2.z * tp - P.z, qy = mz.y + d2.y * tp - (P.y || 0);
    const hitP = tp > 0 && tp < tWall && qx * qx + qz * qz < 0.09 && qy > 0.05 && qy < (P.crouching ? 1.2 : 1.8); const end = mz.clone().addScaledVector(d2, hitP ? tp : tWall);
    R.shots++; R.kick = 1; if (flash) { flash.visible = true; flash.rotation.z = Math.random() * 3; R.flashT = 0.05; } bloomHotAt && bloomHotAt(mz.x, mz.y, mz.z);
    if (W && W.fx) { W.tracer(mz, end, pistolDef); if (!hitP) { W.puff(end, 0xb5ab9a, 4); W.decal && W.decal(end, d2, 'world'); } else if (!(game.blood && game.blood.spray(end, d2, 0.6))) W.puff(end, 0x8a8478, 2); }
    if (W && W.gunSound) W.gunSound(pistolDef, mz.x, mz.z); else Audio.noise && Audio.noise(0.12, { f: 1800, q: 0.6, vol: 0.4, type: 'lowpass' });
    if (game.crowd && game.crowd.alarm && R.shots % 3 === 1) game.crowd.alarm(mz.x, mz.z, 40, 2, null, 'gunshot');
    if (hitP && game.health) game.health.damage(10 + Math.random() * 7, 'shot by a shopkeeper');
    else if (Audio.noise) { const nd = Math.hypot(qx, qz); if (nd < 1.4) Audio.noise(0.07, { f: 3200, q: 1.2, vol: 0.12 * (1 - nd / 1.4), attack: 0.002 }); } };
  const aimedAt = () => { const W = game.weapons; if (!W || !W.drawn || W.cur < 0 || W.aimW < 0.6) return false; const { o: ro, d } = W.aimRay(0); const p = kp.bones.chest.getWorldPosition(_v); const v = p.clone().sub(ro); const t = v.dot(d); if (t < 0.3 || t > 25) return false;
    const off = v.addScaledVector(d, -t).length(); return off < 0.65 && R.rayRoom(ro, d, t + 1) >= t - 0.2; };
  const placeCash = () => { const grp = new THREE.Group(); const mat = new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 0.85 }); mat.userData.own = true; const band = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.7 }); band.userData.own = true;
    const bricks = 2 + Math.min(4, Math.floor(R.amount / 100000)); for (let i = 0; i < bricks; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.075), mat); b.position.set((i % 2) * 0.02, 0.018 + Math.floor(i / 2) * 0.036, (i % 2) * 0.08 - 0.04); b.rotation.y = (Math.random() - 0.5) * 0.3; const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.037, 0.077), band); b.add(s); grp.add(b); }
    grp.position.set(o.cash.x, o.grille ? 1.04 : 1.0, o.cash.z); room.g.add(grp); R.cash = grp; R.cashAt = [o.cash.x, o.cash.z]; };
  // ---- per frame (room local frame; pl = player in local coordinates)
  room.tick = (dt, pl) => { R.t += dt; const W = game.weapons; if (R.flashT > 0) { R.flashT -= dt; if (R.flashT <= 0 && flash) flash.visible = false; } R.kick = Math.max(0, (R.kick || 0) - dt * 12);
    if (R.alarm > 0) { R.alarm -= dt; R.bell = (R.bell || 0) - dt; if (R.bell <= 0 && Audio.tone) { R.bell = 0.24; Audio.tone(2350, 0.11, { type: 'square', vol: 0.03 * Math.max(0, Math.min(1, R.alarm / 4)) }); } }
    if (R.cash && pl.inside && Math.hypot(pl.x - R.cashAt[0], pl.z - R.cashAt[1]) < 1.35) { room.g.remove(R.cash); R.cash.traverse((q) => { if (q.geometry) q.geometry.dispose(); }); R.cash = null; S.until = clock() + RESTOCK; S.robs++; game.story && game.story.pay(R.amount, 'Store robbery · ' + def.name); game.hud.notify('Store robbed', `${lakh(R.amount)} taken from ${def.name}. The silent alarm has been tripped.`, 'success', 4.5); alarmOn(); }
    const ka = aimedAt(); if (ka) R.seenGun = 0.6; else R.seenGun -= dt; const shot = W && W.lastShot && performance.now() - W.lastShot.t < 300 && pl.inside;
    switch (R.state) {
      case 'idle': if (pl.inside && (ka || shot)) begin(); break;
      case 'empty': room.keeperBusy = false; if (R.t > 6 && R.seenGun < -3) { A.set('cower'); } break;
      case 'scared': { room.keeperBusy = false; if (R.surprise && R.t > 1.1 + Math.random() * 0.02 + (R.delay ?? (R.delay = Math.random() * 0.8))) { R.state = 'draw'; R.t = 0; A.set(null); say(['You think you can rob me?!', 'Not today!', 'Get out of my shop!'][Math.floor(Math.random() * 3)], 2); break; }
        if (!R.surprise && R.t > 0.9) { R.state = 'turn'; R.t = 0; room.keeperBusy = true; A.set(null); } break; }
      case 'turn': { const want = Math.atan2(o.till.x - o.kx, o.till.z - o.kz); if (keeperYaw(want, dt, 7) < 0.08 || R.t > 0.7) { R.state = 'grab'; R.t = 0; } break; }
      case 'grab': { const u = R.t / 1.1; o.drawer.position.x = o.till.x + 0.02 + 0.22 * sm(u / 0.3); handIK({ x: o.till.x + 0.24, y: o.till.y + 0.12 - 0.06 * Math.sin(Math.min(1, u) * Math.PI), z: o.till.z }, sm(u / 0.35) * (1 - sm((u - 0.8) / 0.2)));
        if (u > 0.55) o.drawer.userData.notes.visible = false; if (u >= 1) { R.state = 'give'; R.t = 0; R.amount = takings(); A.ik = null; } break; }
      case 'give': { const want = Math.atan2(pl.x - o.kx, pl.z - o.kz); keeperYaw(want, dt, 7); const u = R.t / 0.9; handIK({ x: o.cash.x + 0.05, y: 1.1, z: o.cash.z }, sm(u / 0.5) * (1 - sm((u - 0.75) / 0.25)));
        if (u >= 0.65 && !R.cash && !R.placed) { placeCash(); R.placed = true; say('Here — take it, take it, just go!', 2.2); } if (u >= 1) { A.ik = null; R.state = 'done'; R.t = 0; A.set('handsup'); room.keeperBusy = false; } break; }
      case 'done': room.keeperBusy = false; if (R.t > 3 && R.seenGun < -2) A.set('cower'); break;
      case 'draw': { room.keeperBusy = false; R.drawK = Math.min(1, R.drawK + dt / 0.4); const P = game.player; const kpW = kp.root.getWorldPosition(_v); const pitch = Math.atan2((P.y || 0) + 1.2 - (kpW.y + 1.45), Math.max(0.5, Math.hypot(P.x - kpW.x, P.z - kpW.z))); gunPose(R.drawK, pitch);
        if (R.drawK >= 1) { R.state = 'shoot'; R.t = 0; R.cd = 0.15 + Math.random() * 0.2; alarmOn(); } break; }
      case 'shoot': { room.keeperBusy = false; const P = game.player; const kpW = kp.root.getWorldPosition(_v); const pitch = Math.atan2((P.y || 0) + 1.2 - (kpW.y + 1.45), Math.max(0.5, Math.hypot(P.x - kpW.x, P.z - kpW.z))); gunPose(1, pitch);
        R.cd -= dt; if (R.cd <= 0 && pl.inside && !(game.health && game.health.busy)) { fireAtPlayer(); R.cd = R.shots % 6 === 0 ? 1.4 : 0.42 + Math.random() * 0.3; } break; }
      case 'dead': break;
    }
  };
  return R;
}

// ------------------------------------------------------------------------------------------------ street signs (all eight in ONE mesh)
// A lit box sign over each door: dark frame + printed face from one 1024 × 512 atlas (two columns × four rows of 512 × 128).
export function buildRobSigns(sites) {
  const list = sites.filter((s) => ROB_DEFS[s.id]); if (!list.length) return null; const ids = Object.keys(ROB_DEFS);
  const tex = canvasTex('robSigns', 1024, 512, (a) => { ids.forEach((id, i) => { const [bg, fg, t1, t2] = ROB_DEFS[id].sign; const x = (i % 2) * 512, y = Math.floor(i / 2) * 128; a.fillStyle = bg; a.fillRect(x, y, 512, 128); a.fillStyle = fg; a.fillRect(x + 10, y + 10, 492, 3); a.fillRect(x + 10, y + 115, 492, 3);
    a.textAlign = 'center'; a.textBaseline = 'middle'; let p = 54; a.font = `700 ${p}px "Barlow Condensed", "Arial Narrow", sans-serif`; while (a.measureText(t1).width > 470 && p > 20) { p -= 2; a.font = `700 ${p}px "Barlow Condensed", "Arial Narrow", sans-serif`; } a.fillText(t1, x + 256, y + 52);
    a.font = `600 22px "Barlow Condensed", "Arial Narrow", sans-serif`; a.globalAlpha = 0.9; a.fillText(t2, x + 256, y + 95); a.globalAlpha = 1; }); }, { repeat: false });
  const mb = new MultiBuilder(); const face = mb.get('face'), box = mb.get('box');
  for (const s of list) { const i = ids.indexOf(s.id); const u0 = (i % 2) * 0.5, v1 = 1 - Math.floor(i / 2) * 0.25, v0 = v1 - 0.25; const W = 2.7, Hs = 0.68, y = 2.95, zf = 0.075;
    const P = (lx, ly, lz) => [s.F.x + lx * s.cs + lz * s.sn, s.y0 + ly, s.F.z - lx * s.sn + lz * s.cs];
    face.quad(P(-W / 2, y - Hs / 2, zf + 0.002), P(W / 2, y - Hs / 2, zf + 0.002), P(W / 2, y + Hs / 2, zf + 0.002), P(-W / 2, y + Hs / 2, zf + 0.002), [u0 + 0.002, v0 + 0.004, u0 + 0.498, v1 - 0.004]);
    const fr = (ax, ay, az, bx, by, bz) => { const c = [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]; const w = bx - ax, h = by - ay, d = bz - az; const p = P(c[0], c[1], c[2]); box.box(p[0], p[1], p[2], w, h, d, { col: C('#1b1c1e'), rotY: s.yaw }); };
    fr(-W / 2 - 0.05, y - Hs / 2 - 0.05, 0.0, W / 2 + 0.05, y + Hs / 2 + 0.05, zf); }
  const g = new THREE.Group(); g.name = 'rob-signs';
  const fm = new THREE.MeshStandardMaterial({ map: tex || null, color: tex ? 0xffffff : 0x888888, roughness: 0.45, emissive: 0xffffff, emissiveMap: tex || null, emissiveIntensity: tex ? 0.32 : 0 });
  const bm = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.6, metalness: 0.3 });
  for (const m of mb.toMeshes({ face: fm, box: bm }, { cast: false, receive: true })) g.add(m); return g;
}
