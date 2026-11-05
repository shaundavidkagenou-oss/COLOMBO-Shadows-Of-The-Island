// The Velvet Monsoon — a night club on Galle Road, Kollupitiya (fictional; original design). Entered through its door on
// the street (ClubFront.js) like the other shop interiors: a 20 × 24 m hall with a 4.6 m ceiling under the building.
//   lobby      carpet, cashier window, door supervisors, rope line, bench, palms, house rules, neon name sign
//   main stage black gloss stage with two chrome poles, mirror back wall, velvet drapes, lighting truss with moving heads,
//              a runway out to a round platform with a third pole under the mirror ball; tip ledges round both
//   podium     a small raised pole podium by the booths
//   bar        quilted leather bar with a marble top, brass foot rail, stools, a lit back bar with shelves of bottles
//   seating    leather tub chairs round the stages, lounge sets, high-backed booths, a banquette, poseur tables, VIP corner
//   DJ booth   decks and mixer on a riser, speaker stacks either side of the stage
// Four featured dancers (ClubCast.js / PoleDance.js) dance on the poles; staff and customers keep busy with idle routines.
// The player can watch, tip a dancer (Rs 500), "make it rain" (Rs 5,000 in Rs 100 notes thrown onto the stage), and buy a
// shot at the bar (the same drinking animation and drunk effect as the hero rooms). There are no private or lap dances.
import * as THREE from 'three';
import { Kit, aoBlob, canvasTex, woodTex, speckle, blotches, rnd } from './RoomKit.js';
import * as RP from './RoomProps.js';
import { Drink } from './HeroRooms.js';
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { Character } from '../actors/Character.js';
import { PoleDancer } from '../actors/PoleDance.js';
import { makeAppearance } from '../actors/Appearance.js';
import { routine } from '../actors/Routine.js';
import { DANCERS, dancerSpec, STAFF, PATRON_SEEDS, patronSpec, CLUB, CLUB_CHAIRS, CLUB_BOOTHS, PATRON_SPOTS, STAFF_SPOTS, seatTopFor } from './ClubCast.js';

const Y = -40; // interior level (same as Interiors.js)
const { W, D, H } = CLUB; const SY = CLUB.stageY, PY = CLUB.podY;
const std = (o) => new THREE.MeshStandardMaterial(o);
const TIP = 500, RAIN = 5000, SHOT = 1200;

// ------------------------------------------------------------------ textures (canvas, original)
function texStone() { return canvasTex('club:stone', 512, 512, (a, w, h) => { // dark polished stone tiles, 0.6 m
  const r = rnd(301); for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const v = 22 + r() * 6; a.fillStyle = `rgb(${v},${v - 1},${v + 4})`; a.fillRect(i * w / 2, j * h / 2, w / 2, h / 2); }
  blotches(a, w, h, 26, 'rgba(255,255,255,0.025)', 20, 90, 302); a.strokeStyle = 'rgba(170,160,190,0.1)'; a.lineWidth = 0.8;
  for (let i = 0; i < 14; i++) { let x = r() * w, y = r() * h; a.beginPath(); a.moveTo(x, y); for (let k = 0; k < 12; k++) { x += (r() - 0.3) * 26; y += (r() - 0.5) * 18; a.lineTo(x, y); } a.stroke(); }
  a.strokeStyle = '#08080a'; a.lineWidth = 3; for (let i = 0; i <= 2; i++) { a.beginPath(); a.moveTo(i * w / 2, 0); a.lineTo(i * w / 2, h); a.stroke(); a.beginPath(); a.moveTo(0, i * h / 2); a.lineTo(w, i * h / 2); a.stroke(); }
  speckle(a, w, h, 6, 303); }, { repeat: true }); }
function texVelvet() { return canvasTex('club:velvet', 256, 512, (a, w, h) => { // channel-tufted plum velvet wall panels, 4 channels per 0.6 m
  a.fillStyle = '#3d0d27'; a.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { const x0 = i * w / 4, g = a.createLinearGradient(x0, 0, x0 + w / 4, 0); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.18, 'rgba(0,0,0,0.1)'); g.addColorStop(0.5, 'rgba(255,170,215,0.13)'); g.addColorStop(0.82, 'rgba(0,0,0,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.55)'); a.fillStyle = g; a.fillRect(x0, 0, w / 4, h); }
  blotches(a, w, h, 30, 'rgba(255,120,190,0.04)', 10, 50, 311); speckle(a, w, h, 10, 312); }, { repeat: true }); }
function texQuilt() { return canvasTex('club:quilt', 256, 256, (a, w, h) => { // diamond-quilted black leather with brass buttons
  a.fillStyle = '#1b1114'; a.fillRect(0, 0, w, h); const s = 64;
  for (let i = -1; i <= 4; i++) for (let j = -1; j <= 4; j++) { const cx = i * s + (j % 2 ? s / 2 : 0), cy = j * s / 2; const g = a.createRadialGradient(cx, cy, 2, cx, cy, s * 0.5); g.addColorStop(0, 'rgba(255,220,230,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.3)'); a.fillStyle = g; a.beginPath(); a.moveTo(cx, cy - s / 2); a.lineTo(cx + s / 2, cy); a.lineTo(cx, cy + s / 2); a.lineTo(cx - s / 2, cy); a.closePath(); a.fill(); }
  a.fillStyle = '#c9a050'; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 8; j++) { const x = i * s + (j % 2 ? 0 : s / 2), y = j * s / 2; a.beginPath(); a.arc(x % w, y % h, 3, 0, 7); a.fill(); }
  speckle(a, w, h, 8, 321); }, { repeat: true }); }
function texMarble() { return canvasTex('club:marble', 512, 256, (a, w, h) => { // black marble with gold veins
  a.fillStyle = '#121113'; a.fillRect(0, 0, w, h); blotches(a, w, h, 18, 'rgba(255,255,255,0.03)', 20, 80, 331); const r = rnd(332);
  for (let i = 0; i < 9; i++) { let x = r() * w, y = r() * h; a.strokeStyle = r() < 0.5 ? 'rgba(212,180,110,0.35)' : 'rgba(230,230,230,0.18)'; a.lineWidth = 0.6 + r() * 1.4; a.beginPath(); a.moveTo(x, y); for (let k = 0; k < 16; k++) { x += 10 + r() * 22; y += (r() - 0.5) * 22; a.lineTo(x, y); } a.stroke(); }
  speckle(a, w, h, 5, 333); }, { repeat: true }); }
function texCarpet() { return canvasTex('club:carpet', 256, 256, (a, w, h) => { // deep red lobby carpet, faint gold lattice
  a.fillStyle = '#4a0b17'; a.fillRect(0, 0, w, h); a.strokeStyle = 'rgba(214,170,90,0.22)'; a.lineWidth = 2; const s = 64;
  for (let i = -1; i <= 4; i++) { a.beginPath(); a.moveTo(i * s, 0); a.lineTo(i * s + h, h); a.stroke(); a.beginPath(); a.moveTo(i * s + h, 0); a.lineTo(i * s, h); a.stroke(); }
  a.fillStyle = 'rgba(214,170,90,0.3)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { a.beginPath(); a.arc(i * s + s / 2, j * s + s / 2, 4, 0, 7); a.fill(); }
  a.globalAlpha = 0.1; a.strokeStyle = '#000'; for (let i = 0; i < w; i += 2) { a.beginPath(); a.moveTo(i, 0); a.lineTo(i, h); a.stroke(); } a.globalAlpha = 1; speckle(a, w, h, 14, 341); }, { repeat: true }); }
function texStars() { return canvasTex('club:stars', 512, 512, (a, w, h) => { // fibre-optic star ceiling
  a.fillStyle = '#000'; a.fillRect(0, 0, w, h); const r = rnd(351); for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, s = 0.6 + r() * 1.3, v = 150 + r() * 105; a.fillStyle = `rgb(${v},${v * 0.9},${v})`; a.beginPath(); a.arc(x, y, s, 0, 7); a.fill(); } }, { repeat: true }); }
function texNote(v) { return canvasTex('club:note' + v, 256, 128, (a, w, h) => { // generic rupee banknote (no real note artwork)
  const base = v === 500 ? ['#6b4a8a', '#bfa6d6'] : ['#c4641c', '#f1c48a']; const g = a.createLinearGradient(0, 0, w, h); g.addColorStop(0, base[1]); g.addColorStop(0.5, base[0]); g.addColorStop(1, base[1]); a.fillStyle = g; a.fillRect(0, 0, w, h);
  a.strokeStyle = 'rgba(255,255,255,0.6)'; a.lineWidth = 4; a.strokeRect(6, 6, w - 12, h - 12); a.strokeStyle = 'rgba(0,0,0,0.25)'; a.lineWidth = 1; for (let i = 0; i < 18; i++) { a.beginPath(); a.ellipse(w * 0.7, h / 2, 10 + i * 3, 6 + i * 2, 0, 0, 7); a.stroke(); }
  a.fillStyle = 'rgba(255,255,255,0.85)'; a.font = '700 44px sans-serif'; a.textAlign = 'left'; a.textBaseline = 'middle'; a.fillText(String(v), 16, 42); a.font = '700 16px sans-serif'; a.fillText('RUPEES', 18, 92);
  a.beginPath(); a.arc(w * 0.7, h / 2, 26, 0, 7); a.fillStyle = 'rgba(255,255,255,0.3)'; a.fill(); }); }
const STAGE_TINT = new THREE.Color(0xffd0e0);
function neonPlane(key, w, h, pw, ph, draw) { // glowing sign on its own plane (additive, so only the tubes show)
  const t = canvasTex('club:neon:' + key, w, h, (a, W_, H_) => { a.fillStyle = '#000'; a.fillRect(0, 0, W_, H_); draw(a, W_, H_); });
  return new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
}
function neonText(a, text, x, y, size, col, font = 'italic 700') {
  a.font = `${font} ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; a.textAlign = 'center'; a.textBaseline = 'middle';
  const maxW = a.canvas.width * 0.9, tw = a.measureText(text).width; if (tw > maxW) { size = Math.floor(size * maxW / tw); a.font = `${font} ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; } // a wider fallback font still fits the board
  a.save(); a.shadowColor = col; a.shadowBlur = size * 0.5; a.lineWidth = size * 0.12; a.strokeStyle = col; a.globalAlpha = 0.6; a.strokeText(text, x, y); a.restore();
  a.lineWidth = size * 0.055; a.strokeStyle = '#fff0f8'; a.strokeText(text, x, y);
}

// ------------------------------------------------------------------ furniture
function tubChair(k, sh, key = 'leatherR') { // leather tub chair on a chrome swivel base; seat top at sh; faces +z
  k.cyl('chrome', 0.23, 0.25, 0.02, 0, 0.01, 0, { seg: 24 }); k.cyl('chrome', 0.028, 0.028, sh - 0.14, 0, (sh - 0.14) / 2 + 0.02, 0, { seg: 10 });
  k.cyl('blackP', 0.2, 0.2, 0.03, 0, sh - 0.145, 0, { seg: 20 });
  k.box(key, 0.5, 0.12, 0.48, 0, sh - 0.06, 0.02, { r: 0.05, seg: 3 }); // seat cushion
  k.cyl(key + 'D', 0.3, 0.3, 0.44, 0, sh + 0.085, -0.02, { open: true, seg: 26, t0: Math.PI / 2 - 0.15, tl: Math.PI + 0.3 }); // tub shell (sides + back)
  k.cyl(key + 'D', 0.255, 0.255, 0.36, 0, sh + 0.12, -0.02, { open: true, seg: 26, t0: Math.PI / 2 - 0.12, tl: Math.PI + 0.24 });
  k.torus(key, 0.278, 0.03, 0, sh + 0.305, -0.02, { rz: -0.15, rx: -Math.PI / 2, arc: Math.PI + 0.3, ts: 26, rs: 8 }); // rolled rim
  for (const s of [-1, 1]) k.sph(key, 0.03, s * 0.277 * Math.cos(-0.15), sh + 0.305, -0.02 + 0.277 * Math.sin(0.15), { ws: 10, hs: 8 }); // rim ends
  k.block(0, 0, 0.6, 0.6);
}
function cocktailTable(k, h = 0.58, r = 0.32) {
  k.cyl('chrome', 0.2, 0.22, 0.02, 0, 0.01, 0, { seg: 24 }); k.cyl('chrome', 0.025, 0.025, h - 0.03, 0, h / 2, 0, { seg: 10 });
  k.cyl('marble', r, r, 0.03, 0, h - 0.015, 0, { seg: 32 }); k.torus('brass', r, 0.008, 0, h - 0.015, 0, { rx: Math.PI / 2, ts: 40 });
  k.cyl('glass', 0.035, 0.03, 0.09, 0.1, h + 0.045, -0.06, { seg: 12 }); k.cyl('candle', 0.03, 0.03, 0.05, -0.1, h + 0.025, 0.05, { seg: 12 }); // glass + candle
  k.block(0, 0, r * 2, r * 2);
}
function stool(k) { // bar stool: chrome column + foot ring, round padded seat at 0.76
  k.cyl('chrome', 0.2, 0.21, 0.02, 0, 0.01, 0, { seg: 22 }); k.cyl('chrome', 0.03, 0.03, 0.72, 0, 0.38, 0, { seg: 10 }); k.torus('chrome', 0.17, 0.011, 0, 0.3, 0, { rx: Math.PI / 2, ts: 26 });
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; k.cyl('chrome', 0.008, 0.008, 0.17, Math.sin(a) * 0.085, 0.3, Math.cos(a) * 0.085, { rz: Math.PI / 2, ry: a, seg: 6 }); }
  k.cyl('leatherR', 0.19, 0.18, 0.08, 0, 0.74, 0, { seg: 24 }); k.torus('leatherR', 0.17, 0.025, 0, 0.775, 0, { rx: Math.PI / 2, ts: 28 }); k.cyl('leatherR', 0.17, 0.17, 0.02, 0, 0.79, 0, { seg: 24 });
  k.block(0, 0, 0.38, 0.38);
}
function stanchion(k, x, z) { k.cyl('brass', 0.14, 0.15, 0.03, x, 0.015, z, { seg: 18 }); k.cyl('brass', 0.022, 0.022, 0.92, x, 0.49, z, { seg: 10 }); k.sph('brass', 0.04, x, 0.97, z, { ws: 12, hs: 8 }); }
function rope(k, a, b, h = 0.9, sag = 0.12) { const pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([a[0] + (b[0] - a[0]) * u, h - sag * 4 * u * (1 - u), a[1] + (b[1] - a[1]) * u]); } k.tube('velvetRope', pts, 0.018, { n: 16, rs: 6 }); }
function palm(k, seed) { // potted areca palm: glazed pot, soil, fronds as arched tubes with leaflet strips
  k.lathe('potBlack', [[0, 0], [0.17, 0], [0.22, 0.05], [0.24, 0.42], [0.26, 0.46], [0.22, 0.46], [0.2, 0.08], [0, 0.08]], 0, 0, 0, { seg: 24 }); k.cyl('soil', 0.215, 0.215, 0.01, 0, 0.43, 0, { seg: 20 });
  const r = rnd(seed); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + r() * 0.4, len = 0.9 + r() * 0.5, up = 1.0 + r() * 0.5; const cx = Math.sin(a), cz = Math.cos(a); const pts = [[0, 0.44, 0], [cx * len * 0.25, 0.44 + up * 0.7, cz * len * 0.25], [cx * len * 0.65, 0.44 + up * 0.95, cz * len * 0.65], [cx * len, 0.44 + up * 0.7, cz * len]];
    k.tube('frond', pts, 0.008, { n: 10, rs: 4 });
    for (let j = 1; j < 9; j++) { const u = j / 9, p0 = [cx * len * u, 0.44 + up * (0.7 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 0.25 * u), cz * len * u]; for (const s of [-1, 1]) k.box('leaf', 0.3 * (1 - u * 0.5), 0.004, 0.035, p0[0] + s * cz * 0.12, p0[1] - 0.04, p0[2] - s * cx * 0.12, { ry: a + Math.PI / 2 + s * 0.6, rz: s * 0.5 }); } }
  k.block(0, 0, 0.52, 0.52);
}
function speakerStack(k) { // PA stack: sub + top cabinet with grilles
  k.box('cab', 0.75, 0.75, 0.65, 0, 0.375, 0, { r: 0.015 }); k.box('grille', 0.66, 0.66, 0.01, 0, 0.375, 0.326); k.cyl('blackP', 0.24, 0.24, 0.02, 0, 0.375, 0.33, { rx: Math.PI / 2, seg: 24 });
  k.box('cab', 0.55, 0.9, 0.5, 0, 1.2, 0, { r: 0.015 }); k.box('grille', 0.48, 0.82, 0.01, 0, 1.2, 0.251); for (const y of [0.98, 1.38]) k.cyl('blackP', 0.12, 0.12, 0.02, 0, y, 0.255, { rx: Math.PI / 2, seg: 20 });
  k.block(0, 0, 0.8, 0.7);
}
function bottleRow(k, x0, x1, y, z, seed) { // decorative bottles standing on a back-bar shelf (spirits, liqueurs; plain labels)
  const r = rnd(seed); const keys = ['btlAmber', 'btlGreen', 'btlClear', 'btlBrown', 'btlBlue']; let x = x0;
  while (x < x1) { const kk = keys[Math.floor(r() * keys.length)], h = 0.22 + r() * 0.12, rr = 0.032 + r() * 0.014; k.cyl(kk, rr, rr, h, x, y + h / 2, z, { seg: 12 }); k.cyl(kk, rr * 0.9, rr, 0.03, x, y + h + 0.015, z, { seg: 12 }); k.cyl(kk, 0.013, 0.015, 0.07, x, y + h + 0.065, z, { seg: 8 }); k.cyl(r() < 0.5 ? 'brass' : 'blackP', 0.015, 0.015, 0.02, x, y + h + 0.11, z, { seg: 8 }); k.box('labelP', rr * 1.6, h * 0.35, 0.002, x, y + h * 0.45, z + rr + 0.001); x += rr * 2 + 0.03 + r() * 0.03; }
}

// ------------------------------------------------------------------ build
export function buildClub(game, door) {
  const ox = door.x, oz = door.z - 200 - D / 2; // entrance wall (local z = +D/2) at the shop's door line, offset like the other interiors
  const g = new THREE.Group(); g.name = 'club'; g.position.set(ox, Y, oz); g.visible = false; g.userData.interior = true; game.scene.add(g);
  const room = { id: 'club', D: { name: 'The Velvet Monsoon' }, g, game, hero: true, y: Y, door, items: [], prompt: null, musicMode: 'club', npcs: [], dancers: [] };
  const k = new Kit(); RP.baseMats(k);
  const stoneT = texStone(), velvetT = texVelvet(), quiltT = texQuilt(), marbleT = texMarble(), carpetT = texCarpet();
  k.def('floor', std({ map: stoneT, roughness: 0.5, metalness: 0.05, envMapIntensity: 0.35 })); /* honed stone: a sheen, not mirror-bright light blobs */ k.def('carpet', std({ map: carpetT, roughness: 0.95 }));
  k.def('velvet', std({ map: velvetT, roughness: 0.85 })); k.def('ceil', std({ color: 0x0b0b0d, roughness: 0.95 }));
  k.def('wain', std({ map: woodTex('clubWain', '#24120d', '#0c0605', { light: '#3a1d12', seed: 31 }), roughness: 0.32 }));
  k.def('stageTop', std({ color: 0x050506, roughness: 0.08, metalness: 0.3 })); k.def('stageSide', std({ map: quiltT, roughness: 0.5 }));
  k.def('smokedMirror', std({ color: 0x0d0d11, roughness: 0.22, metalness: 0.3, envMapIntensity: 0.05 })); /* smoked mirror: the daylight environment map must not turn it into a white wall */ k.def('pole', std({ color: 0xe6e8ec, roughness: 0.12, metalness: 0.9 }));
  k.def('leatherR', std({ color: 0x5a0d18, roughness: 0.42 })); k.def('leatherRD', std({ color: 0x5a0d18, roughness: 0.42, side: THREE.DoubleSide }));
  k.def('leatherB', std({ color: 0x141014, roughness: 0.4 })); k.def('leatherBD', std({ color: 0x141014, roughness: 0.4, side: THREE.DoubleSide }));
  k.def('marble', std({ map: marbleT, roughness: 0.12, metalness: 0.05 })); k.def('barFront', std({ map: quiltT, roughness: 0.45 }));
  k.def('curtain', std({ color: 0x4a0716, roughness: 0.8, side: THREE.DoubleSide })); k.def('velvetRope', std({ color: 0x8c0f22, roughness: 0.75 }));
  k.def('cab', std({ color: 0x18181a, roughness: 0.7 })); k.def('grille', std({ color: 0x0a0a0a, roughness: 0.9, metalness: 0.3 }));
  k.def('truss', std({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.8 })); k.def('potBlack', std({ color: 0x101012, roughness: 0.15 })); k.def('soil', std({ color: 0x2a1c12, roughness: 1 }));
  k.def('frond', std({ color: 0x3d6a2a, roughness: 0.6 })); k.def('leaf', std({ color: 0x3f7a2c, roughness: 0.55, side: THREE.DoubleSide }));
  k.def('candle', std({ color: 0x220a00, emissive: 0xffa040, emissiveIntensity: 1.2 })); k.def('labelP', std({ color: 0xe8dcc0, roughness: 0.8 }));
  for (const [kk, c] of [['btlAmber', 0x9a5a14], ['btlGreen', 0x1f5a2a], ['btlClear', 0xcfe6ea], ['btlBrown', 0x4a2410], ['btlBlue', 0x1c3f8a]]) k.def(kk, std({ color: c, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.82 }));
  // glowing strips: separate materials so the room can pulse them to the music
  const LED = { pink: std({ color: 0x100008, emissive: 0xff2a8a, emissiveIntensity: 2 }), blue: std({ color: 0x000610, emissive: 0x3a7aff, emissiveIntensity: 2 }), amber: std({ color: 0x100800, emissive: 0xffa040, emissiveIntensity: 1.6 }), violet: std({ color: 0x08000f, emissive: 0x9a4aff, emissiveIntensity: 2 }) };
  LED.green = std({ color: 0x001000, emissive: 0x20ff60, emissiveIntensity: 1.4 }); for (const [kk, m] of Object.entries(LED)) k.def('led' + kk, m);
  k.def('downlight', std({ color: 0x111111, emissive: 0xffe0c0, emissiveIntensity: 1.4 }));

  // ---- shell: stone floor in the hall, carpet in the lobby, star ceiling, velvet walls over a lacquered wainscot
  const LZ = 8.6; // lobby partition
  k.box('floor', W, 0.02, LZ + D / 2, 0, -0.01, (LZ - D / 2) / 2, { uv: 1 / 1.2 }); k.box('carpet', W, 0.02, D / 2 - LZ, 0, -0.008, (LZ + D / 2) / 2, { uv: 1 / 0.9 });
  k.box('ceil', W, 0.06, D, 0, H + 0.03, 0);
  const stars = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, LZ + D / 2 - 1), new THREE.MeshBasicMaterial({ map: texStars(), toneMapped: false })); stars.material.map.repeat.set(3, 3.4); stars.rotation.x = Math.PI / 2; stars.position.set(0, H - 0.002, (LZ - D / 2) / 2); g.add(stars);
  const wall = (x, z, w, d, h = H, y = 0) => { k.box('velvet', w, h, d, x, y + h / 2, z, { uv: 1 / 0.6 }); k.block(x, z, w, d); };
  wall(0, -D / 2 - 0.05, W + 0.2, 0.1); wall(-W / 2 - 0.05, 0, 0.1, D); wall(W / 2 + 0.05, 0, 0.1, D);
  wall(-(W / 2 + 0.85) / 2 - 0.0, D / 2 + 0.05, W / 2 - 0.85, 0.1); wall((W / 2 + 0.85) / 2, D / 2 + 0.05, W / 2 - 0.85, 0.1); k.box('velvet', 1.7, H - 2.35, 0.1, 0, 2.35 + (H - 2.35) / 2, D / 2 + 0.05); // front wall round the door
  k.at(0, 0, D / 2 - 0.02, Math.PI, () => RP.door(k, { w: 1.6, h: 2.35, wood: 'wain' })); // the inside of the entrance doors
  for (const [x, z, w, d] of [[0, -D / 2 + 0.02, W, 0.04], [-W / 2 + 0.02, 0, 0.04, D], [W / 2 - 0.02, 0, 0.04, D]]) { k.box('wain', w, 1.05, d, x, 0.525, z); k.box('brass', w + (d > w ? 0.012 : 0), 0.03, d + (w > d ? 0.012 : 0), x, 1.06, z); } // wainscot + brass dado
  for (const [x, z, w, d] of [[0, -D / 2 + 0.06, W, 0.04], [-W / 2 + 0.06, 0, 0.04, D], [W / 2 - 0.06, 0, 0.04, D]]) k.box('led' + (d > w ? 'pink' : 'violet'), w, 0.025, d, x, 3.6, z); // neon line round the hall
  // lobby partition: wall either side of a curtained opening, header over it
  for (const s of [-1, 1]) { const x0 = 1.15, w = W / 2 - x0; k.box('velvet', w, H, 0.2, s * (x0 + w / 2), H / 2, LZ, { uv: 1 / 0.6 }); k.block(s * (x0 + w / 2), LZ, w, 0.2); k.box('wain', w, 1.05, 0.24, s * (x0 + w / 2), 0.525, LZ); k.box('brass', w, 0.03, 0.26, s * (x0 + w / 2), 1.06, LZ); }
  k.box('velvet', 2.3, H - 2.6, 0.2, 0, 2.6 + (H - 2.6) / 2, LZ); k.box('brass', 2.36, 0.06, 0.26, 0, 2.6, LZ); for (const s of [-1, 1]) k.box('brass', 0.06, 2.6, 0.26, s * 1.15, 1.3, LZ);
  for (const s of [-1, 1]) { for (let i = 0; i < 6; i++) k.cyl('curtain', 0.06, 0.07, 2.5, s * (1.0 - (i % 3) * 0.04), 1.33, LZ - 0.16 + (i < 3 ? 0 : 0.32) + (i % 2) * 0.03, { seg: 10 }); for (const zz of [LZ - 0.15, LZ + 0.17]) k.torus('brass', 0.1, 0.01, s * 0.97, 1.15, zz, { rx: Math.PI / 2, ts: 18 }); k.block(s * 1.0, LZ, 0.2, 0.55); } // drapes gathered at the sides, brass tie-backs
  k.box('ledblue', 18, 0.025, 0.03, 0, 3.6, LZ - 0.12);

  // ---- lobby: cashier window, rope line, bench, palms, posters, neon name sign
  { const cx = 2.4, cz = (LZ + 0.1 + D / 2) / 2, cl = D / 2 - LZ - 0.1; k.box('barFront', 0.5, 1.05, cl, cx + 0.25, 0.525, cz, { uv: 1 / 0.6 }); k.box('marble', 0.62, 0.04, cl, cx + 0.22, 1.07, cz); k.box('glass', 0.02, 1.0, 2.1, cx + 0.42, 1.6, 10.3); k.box('brass', 0.03, 0.03, 2.2, cx + 0.42, 2.1, 10.3);
    k.block(cx + 0.25, cz, 0.6, cl); k.box('wain', 0.1, H, cl, cx + 2.5, H / 2, cz); k.block(cx + 2.5, cz, 0.12, cl); // cashier booth: counter from the partition to the front wall, panelled back wall
    k.at(cx + 2.44, 0, 10.6, -Math.PI / 2, () => RP.door(k, { w: 0.85, h: 2.1, wood: 'wain' })); k.box('ledgreen', 0.02, 0.1, 0.36, cx + 2.43, 2.3, 10.6); // staff door with a lit exit sign
    k.at(cx + 0.35, 1.09, 10.6, -Math.PI / 2, () => { k.box('blackP', 0.32, 0.2, 0.02, 0, 0.12, 0, { r: 0.005 }); k.box('greyP', 0.2, 0.05, 0.14, 0, 0.025, 0.1); }); // card machine / till screen
  }
  stanchion(k, -1.0, 9.3); stanchion(k, -1.0, 10.35); stanchion(k, -1.0, 11.4); rope(k, [-1.0, 9.3], [-1.0, 10.35]); rope(k, [-1.0, 10.35], [-1.0, 11.4]); k.block(-1.0, 10.35, 0.12, 2.3);
  k.at(-5.2, 0, 11.62, Math.PI, () => { k.box('leatherB', 3.2, 0.42, 0.55, 0, 0.21, 0, { r: 0.04 }); k.box('leatherB', 3.2, 0.5, 0.14, 0, 0.66, -0.22, { r: 0.05, rx: -0.12 }); k.block(0, 0, 3.3, 0.6); }); // waiting bench
  k.at(-8.9, 0, 11.3, 0, () => palm(k, 11)); k.at(-1.7, 0, 11.45, 0, () => palm(k, 12)); k.at(-9.2, 0, 9.25, 0, () => palm(k, 13));
  const poster = canvasTex('club:poster', 384, 576, (a, w, h) => { const gr = a.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1a0614'); gr.addColorStop(1, '#3b0a2a'); a.fillStyle = gr; a.fillRect(0, 0, w, h); a.strokeStyle = '#c9a54e'; a.lineWidth = 6; a.strokeRect(14, 14, w - 28, h - 28); a.lineWidth = 2; a.strokeRect(24, 24, w - 48, h - 48);
    a.textAlign = 'center'; a.fillStyle = '#ff5aa8'; a.font = 'italic 700 46px "Barlow Condensed", sans-serif'; a.fillText('LIVE ON STAGE', w / 2, 92); a.fillStyle = '#e8e2d2'; a.font = '600 22px "Manrope", sans-serif'; a.fillText('every night', w / 2, 126);
    a.fillStyle = '#ffd36a'; a.font = '700 40px "Barlow Condensed", sans-serif'; ['RUBY', 'JADE', 'OPAL', 'SAFFRON'].forEach((n, i) => a.fillText(n, w / 2, 210 + i * 64));
    a.fillStyle = '#e8e2d2'; a.font = '600 20px "Manrope", sans-serif'; a.fillText('Pole dance shows · Cocktail bar', w / 2, 480); a.fillStyle = '#bdb6a6'; a.font = '500 17px "Manrope", sans-serif'; a.fillText('Over 18s only · Please tip responsibly', w / 2, 516); });
  k.at(-W / 2 + 0.06, 1.75, 10.1, Math.PI / 2, () => RP.frame(k, 'clubPoster', poster, 0.8, 1.2, { wood: 'brass' }));
  const rules = canvasTex('club:rules', 384, 448, (a, w, h) => { a.fillStyle = '#100c10'; a.fillRect(0, 0, w, h); a.strokeStyle = '#c9a54e'; a.lineWidth = 5; a.strokeRect(10, 10, w - 20, h - 20); a.textAlign = 'center'; a.fillStyle = '#ffd36a'; a.font = '700 38px "Barlow Condensed", sans-serif'; a.fillText('HOUSE RULES', w / 2, 66);
    a.fillStyle = '#e8e2d2'; a.font = '600 21px "Manrope", sans-serif'; ['Over 18s only — ID required', 'Look, don\'t touch', 'No photos or video', 'Tip at the stage only', 'Respect the dancers and staff', 'No weapons beyond this point'].forEach((t, i) => a.fillText(t, w / 2, 130 + i * 48));
    a.fillStyle = '#bdb6a6'; a.font = '500 16px "Manrope", sans-serif'; a.fillText('The management reserves the right of admission', w / 2, 425); });
  k.at(-2.6, 1.7, 11.94, Math.PI, () => RP.frame(k, 'clubRules', rules, 0.55, 0.64, { wood: 'brass' }));
  { const sign = neonPlane('name', 1024, 256, 3.4, 0.85, (a, w, h) => { neonText(a, 'THE VELVET MONSOON', w / 2, h / 2 + 4, 108, '#ff2c8c'); }); sign.position.set(0, 3.25, LZ + 0.105); g.add(sign); }

  // ---- main stage: gloss top on a quilted skirt, brass nosing, LED lip, mirror back wall, drapes, steps up from backstage
  const S = CLUB.stage, sw = S.x1 - S.x0, sd = S.z1 - S.z0, scz = (S.z0 + S.z1) / 2;
  k.box('stageSide', sw, SY - 0.02, sd, 0, (SY - 0.02) / 2, scz, { uv: 1 / 0.6 }); k.box('stageTop', sw, 0.02, sd, 0, SY - 0.01, scz);
  k.box('brass', sw + 0.02, 0.03, 0.04, 0, SY - 0.015, S.z1); k.box('ledpink', sw, 0.02, 0.02, 0, SY - 0.08, S.z1 + 0.012);
  for (const s of [-1, 1]) { k.box('brass', 0.04, 0.03, sd, s * (sw / 2), SY - 0.015, scz); }
  const R_ = CLUB.runway, rw = R_.x1 - R_.x0, rd = R_.z1 - R_.z0 + 0.3, rcz = (R_.z0 + R_.z1) / 2 - 0.15;
  k.box('stageSide', rw, SY - 0.02, rd, 0, (SY - 0.02) / 2, rcz, { uv: 1 / 0.6 }); k.box('stageTop', rw, 0.02, rd, 0, SY - 0.01, rcz);
  for (const s of [-1, 1]) { k.box('brass', 0.04, 0.03, rd - 0.3, s * rw / 2, SY - 0.015, rcz + 0.15); k.box('ledpink', 0.02, 0.02, rd - 0.3, s * (rw / 2 + 0.012), SY - 0.08, rcz + 0.15); }
  k.block(0, scz + 0.15, sw, sd + 0.3); k.block(0, rcz, rw + 0.64, rd);
  // tip ledges: along the stage front (each side of the runway) and down both sides of the runway
  for (const s of [-1, 1]) { k.box('marble', 3.5, 0.04, 0.3, s * 2.7, 0.76, S.z1 + 0.15); k.box('brass', 3.5, 0.012, 0.012, s * 2.7, 0.745, S.z1 + 0.3); k.box('marble', 0.3, 0.04, rd - 0.6, s * (rw / 2 + 0.15), 0.76, rcz + 0.15); }
  const RC = CLUB.poles.round, RR = CLUB.roundR;
  k.cyl('stageSide', RR, RR, SY - 0.02, RC.x, (SY - 0.02) / 2, RC.z, { seg: 48 }); k.cyl('stageTop', RR, RR, 0.02, RC.x, SY - 0.01, RC.z, { seg: 48 });
  k.torus('brass', RR, 0.018, RC.x, SY - 0.015, RC.z, { rx: Math.PI / 2, ts: 64 }); k.torus('ledblue', RR + 0.01, 0.01, RC.x, SY - 0.08, RC.z, { rx: Math.PI / 2, ts: 64 });
  { const gap = 0.66; k.geo('marble', new THREE.LatheGeometry([[RR + 0.02, 0.74], [RR + 0.34, 0.74], [RR + 0.34, 0.78], [RR + 0.02, 0.78], [RR + 0.02, 0.74]].map((p) => new THREE.Vector2(p[0], p[1])), 48, Math.PI + gap, Math.PI * 2 - 2 * gap), RC.x, 0, RC.z); } // ring ledge (open towards the runway)
  k.block(RC.x, RC.z, (RR + 0.36) * 2, (RR + 0.36) * 2);
  const PD = CLUB.poles.podium, PR = CLUB.podR;
  k.cyl('stageSide', PR, PR + 0.04, PY - 0.02, PD.x, (PY - 0.02) / 2, PD.z, { seg: 40 }); k.cyl('stageTop', PR, PR, 0.02, PD.x, PY - 0.01, PD.z, { seg: 40 });
  k.torus('brass', PR, 0.016, PD.x, PY - 0.015, PD.z, { rx: Math.PI / 2, ts: 56 }); k.torus('ledviolet', PR + 0.03, 0.01, PD.x, 0.08, PD.z, { rx: Math.PI / 2, ts: 56 });
  k.geo('marble', new THREE.LatheGeometry([[PR + 0.05, 0.72], [PR + 0.3, 0.72], [PR + 0.3, 0.76], [PR + 0.05, 0.76], [PR + 0.05, 0.72]].map((p) => new THREE.Vector2(p[0], p[1])), 40, Math.PI * 0.15, Math.PI * 1.7), PD.x, 0, PD.z);
  for (let i = 0; i < 4; i++) { const a = Math.PI * 0.15 + (i + 0.5) / 4 * Math.PI * 1.7; k.cyl('chrome', 0.012, 0.012, 0.72 - PY, PD.x + Math.sin(a) * (PR + 0.2), PY + (0.72 - PY) / 2, PD.z + Math.cos(a) * (PR + 0.2), { seg: 8 }); }
  k.block(PD.x, PD.z, (PR + 0.32) * 2, (PR + 0.32) * 2);
  // poles: 45 mm chrome, floor flange to ceiling flange
  for (const p of Object.values(CLUB.poles)) { const h = H - p.y0; k.cyl('pole', 0.0225, 0.0225, h, p.x, p.y0 + h / 2, p.z, { seg: 20 }); k.cyl('pole', 0.07, 0.08, 0.025, p.x, p.y0 + 0.0125, p.z, { seg: 20 }); k.cyl('pole', 0.08, 0.07, 0.03, p.x, H - 0.015, p.z, { seg: 20 }); }
  // mirror back wall behind the stage, framed in brass; velvet drapes at the sides
  k.box('smokedMirror', 7.2, 3.0, 0.02, 0, SY + 0.2 + 1.5, -D / 2 + 0.07); k.box('brass', 7.3, 0.04, 0.04, 0, SY + 0.2, -D / 2 + 0.08); k.box('brass', 7.3, 0.04, 0.04, 0, SY + 3.2, -D / 2 + 0.08);
  for (let i = 0; i < 5; i++) k.box('brass', 0.03, 3.0, 0.03, -3.6 + i * 1.8, SY + 1.7, -D / 2 + 0.085);
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) k.cyl('curtain', 0.08, 0.1, H - SY, s * (3.85 + i * 0.1), SY + (H - SY) / 2, -D / 2 + 0.25 + (i % 2) * 0.09, { seg: 10 });
  // lighting truss over the stage: box truss (4 chords + lacing), hung on chain hoists
  const tY = H - 0.45, tx0 = -4.3, tx1 = 4.3, tz0 = -11.5, tz1 = -7.9;
  const chord = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L_ = Math.hypot(dx, dy, dz); const m = new THREE.CylinderGeometry(0.022, 0.022, L_, 8); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L_, dy / L_, dz / L_)); m.applyQuaternion(q); k.geo('truss', m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); };
  const truss = (a, b) => { const L_ = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.round(L_ / 0.4), ux = (b[0] - a[0]) / L_, uz = (b[2] - a[2]) / L_, px = -uz * 0.15, pz = ux * 0.15;
    for (const [sx, sy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) chord([a[0] + px * sx, a[1] - 0.3 * sy, a[2] + pz * sx], [b[0] + px * sx, b[1] - 0.3 * sy, b[2] + pz * sx]);
    for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 1) / n; const p0 = [a[0] + (b[0] - a[0]) * u0, a[1], a[2] + (b[2] - a[2]) * u0], p1 = [a[0] + (b[0] - a[0]) * u1, a[1], a[2] + (b[2] - a[2]) * u1];
      for (const sx of [-1, 1]) chord([p0[0] + px * sx, p0[1], p0[2] + pz * sx], [p1[0] + px * sx, p1[1] - 0.3, p1[2] + pz * sx]); chord([p0[0] - px, p0[1] - 0.3 * (i % 2), p0[2] - pz], [p0[0] + px, p0[1] - 0.3 * ((i + 1) % 2), p0[2] + pz]); } };
  truss([tx0, tY, tz1], [tx1, tY, tz1]); truss([tx0, tY, tz0], [tx1, tY, tz0]); truss([tx0, tY, tz0], [tx0, tY, tz1]); truss([tx1, tY, tz0], [tx1, tY, tz1]);
  for (const [x, z] of [[tx0, tz0], [tx1, tz0], [tx0, tz1], [tx1, tz1]]) { k.cyl('truss', 0.006, 0.006, H - tY, x, tY + (H - tY) / 2, z, { seg: 6 }); k.box('blackP', 0.18, 0.22, 0.14, x, tY + 0.25, z); }
  // speaker stacks either side of the stage, DJ riser with console, decks and mixer
  k.at(-5.25, 0, -11.2, 0.25, () => speakerStack(k)); k.at(5.25, 0, -11.2, -0.25, () => speakerStack(k));
  { const dx = -8.0, dz = -10.6; k.box('stageSide', 3.4, 0.35, 2.4, dx + 0.1, 0.175, dz - 0.1, { uv: 1 / 0.6 }); k.box('stageTop', 3.4, 0.02, 2.4, dx + 0.1, 0.36, dz - 0.1); k.box('ledamber', 3.4, 0.02, 0.02, dx + 0.1, 0.3, dz + 1.11); k.block(dx + 0.1, dz - 0.1, 3.4, 2.4);
    k.at(dx, 0.36, dz + 0.62, 0, () => { k.box('barFront', 1.9, 0.98, 0.55, 0, 0.49, 0, { uv: 1 / 0.6 }); k.box('marble', 2.0, 0.04, 0.62, 0, 1.0, -0.02); k.box('ledpink', 1.9, 0.02, 0.02, 0, 0.1, 0.285);
      for (const s of [-1, 1]) { k.box('blackP', 0.46, 0.08, 0.36, s * 0.58, 1.06, -0.05, { r: 0.01 }); k.cyl('rubber', 0.15, 0.15, 0.012, s * 0.58, 1.106, -0.05, { seg: 28 }); k.cyl('chrome', 0.03, 0.03, 0.006, s * 0.58, 1.115, -0.05, { seg: 12 }); k.box('chrome', 0.015, 0.01, 0.2, s * 0.58 + s * 0.17, 1.11, -0.02, { ry: s * 0.4 }); }
      k.box('greyP', 0.32, 0.07, 0.36, 0, 1.055, -0.05, { r: 0.008 }); for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) k.cyl('whiteP', 0.012, 0.012, 0.02, -0.11 + i * 0.075, 1.1, -0.15 + j * 0.08, { seg: 8 });
      k.box('blackP', 0.36, 0.24, 0.02, 0.7, 1.24, -0.22, { rx: -0.25 }); k.box('ledblue', 0.32, 0.2, 0.004, 0.7, 1.245, -0.208, { rx: -0.25 }); }); }
  // VIP corner: raised carpet, L-shaped sofa, low table with an ice bucket, rope line with brass posts
  { const x0 = 6.4, z1 = -8.6; k.box('carpet', W / 2 - x0, 0.12, D / 2 + z1, (x0 + W / 2) / 2, 0.06, (z1 - D / 2) / 2, { uv: 1 / 0.9 }); k.box('brass', W / 2 - x0, 0.02, 0.02, (x0 + W / 2) / 2, 0.12, z1); k.box('brass', 0.02, 0.02, D / 2 + z1, x0, 0.12, (z1 - D / 2) / 2);
    k.box('leatherB', 3.3, 0.44, 0.75, 8.3, 0.34, -11.55, { r: 0.04 }); k.box('leatherB', 3.3, 0.6, 0.18, 8.3, 0.72, -11.88, { r: 0.05 }); k.box('leatherB', 0.75, 0.44, 2.4, 9.55, 0.34, -10.0, { r: 0.04 }); k.box('leatherB', 0.18, 0.6, 2.4, 9.88, 0.72, -10.0, { r: 0.05 });
    for (let i = 0; i < 6; i++) k.sph('brass', 0.012, 6.9 + i * 0.55, 0.85, -11.78, { ws: 8, hs: 6 });
    k.box('marble', 1.2, 0.05, 0.7, 8.1, 0.5, -10.2); k.box('blackP', 1.0, 0.36, 0.5, 8.1, 0.3, -10.2); k.cyl('chrome', 0.1, 0.085, 0.2, 8.0, 0.625, -10.2, { seg: 18 }); k.cyl('btlGreen', 0.04, 0.04, 0.3, 8.0, 0.72, -10.2, { seg: 12, rz: 0.25 }); k.cyl('glass', 0.035, 0.03, 0.1, 8.35, 0.575, -10.05, { seg: 12 }); k.cyl('glass', 0.035, 0.03, 0.1, 8.42, 0.575, -10.32, { seg: 12 });
    const posts = [[x0, -11.6], [x0, -10.1], [x0, z1], [8.2, z1], [W / 2 - 0.2, z1]]; for (const [x, z] of posts) stanchion(k, x, z); for (let i = 0; i < posts.length - 1; i++) rope(k, posts[i], posts[i + 1]);
    k.block((x0 + W / 2) / 2, (z1 - D / 2) / 2, W / 2 - x0 + 0.1, D / 2 + z1 + 0.1);
    const vip = neonPlane('vip', 256, 128, 0.8, 0.4, (a, w, h) => neonText(a, 'VIP', w / 2, h / 2, 90, '#b07bff')); vip.position.set(W / 2 - 0.08, 2.6, -10.2); vip.rotation.y = -Math.PI / 2; g.add(vip); }

  // ---- bar: quilted front, marble top, brass foot rail, LED under-glow; back bar with mirror, glass shelves and bottles
  { const bx = -8.3; k.box('barFront', 0.55, 1.05, 10.4, bx, 0.525, 0, { uv: 1 / 0.6 }); k.box('marble', 0.8, 0.05, 10.6, bx + 0.05, 1.075, 0); k.box('brass', 0.03, 0.03, 10.6, bx + 0.455, 1.06, 0);
    k.box('ledamber', 0.02, 0.02, 10.4, bx + 0.29, 0.98, 0); k.box('ledamber', 0.02, 0.02, 10.4, bx + 0.29, 0.06, 0);
    k.cyl('brass', 0.022, 0.022, 10.2, bx + 0.42, 0.2, 0, { rx: Math.PI / 2, seg: 10 }); for (let z = -4.8; z <= 4.81; z += 1.2) k.box('brass', 0.12, 0.03, 0.03, bx + 0.36, 0.2, z);
    for (const s of [-1, 1]) { k.box('barFront', 0.55, 1.05, 0.5, bx, 0.525, s * 5.45); k.box('wain', 1.35, 1.05, 0.06, -9.3, 0.525, s * 5.45); k.block(-9.3, s * 5.45, 1.5, 0.2); } // bar ends + hinged flaps closing the service side
    k.block(bx + 0.05, 0, 0.75, 10.9);
    // back bar
    k.box('wain', 0.45, 0.95, 9.0, -9.78, 0.475, 0); k.box('marble', 0.5, 0.04, 9.1, -9.76, 0.97, 0); k.block(-9.78, 0, 0.45, 9.0);
    k.box('smokedMirror', 0.02, 1.7, 8.8, -9.97, 1.85, 0); k.box('ledamber', 0.02, 0.02, 8.8, -9.95, 2.72, 0);
    for (const y of [1.3, 1.75, 2.2]) { k.box('glass', 0.3, 0.015, 8.8, -9.84, y, 0); k.at(-9.84, 0, 0, Math.PI / 2, () => bottleRow(k, -4.3, 4.3, y + 0.008, 0, Math.round(y * 100))); } // shelves run along the wall; labels face the room
    for (let i = 0; i < 8; i++) k.at(-9.7, 0.99, -3.5 + i * 0.4, 0, () => k.cyl('glass', 0.04, 0.035, 0.1, 0, 0.05, 0, { seg: 12 })); // glasses on the back counter
    // sign over the back bar
    const bs = neonPlane('bar', 512, 128, 2.2, 0.55, (a, w, h) => neonText(a, 'COCKTAILS · ARRACK · SHOTS', w / 2, h / 2, 52, '#ffb050', '700')); bs.position.set(-W / 2 + 0.09, 3.1, 0); bs.rotation.y = Math.PI / 2; g.add(bs); }
  for (let i = 0; i < 9; i++) { const z = -4.4 + i * 1.1; if (Math.abs(z) < 0.5) continue; k.at(-7.45, 0, z, 0, () => stool(k)); }
  const drinkProps = (() => { const b = RP.bottle(); b.position.set(-8.04, 1.1, 0.09); b.rotation.y = 0.6; g.add(b); const gl = RP.shotGlass(); gl.position.set(-8.0, 1.1, -0.08); g.add(gl); return { bottle: b, glass: gl }; })();

  // ---- people: dancers (pole dance), staff (routines), customers (seated / standing routines)
  const people = []; const dancers = [];
  DANCERS.forEach((d, i) => { const pk = CLUB.dancerPole[i], p = CLUB.poles[pk]; const ch = new Character(dancerSpec(d)); g.add(ch.root);
    const pd = new PoleDancer(ch, { x: p.x, z: p.z, y0: p.y0, y1: H - 0.05 }, { seed: d.seed, audience: CLUB.audience[i].slice(), name: d.name }); pd.home = CLUB.audience[i].slice(); dancers.push(pd); });
  const addNPC = (spec, x, z, yaw, kind, y = 0) => { const ch = new Character(spec); ch.root.position.set(x, y, z); ch.root.rotation.y = yaw; g.add(ch.root); const p = { ch, kind, x, z, yaw, rnd: rnd(spec.seed || 7) }; people.push(p); return p; };
  for (const [id, spec] of Object.entries(STAFF)) { const [x, z, yaw] = STAFF_SPOTS[id]; addNPC(makeAppearance(spec.seed, spec), x, z, yaw, id === 'bartender' || id === 'cashier' ? 'vendor' : 'guard'); }
  addNPC(makeAppearance(7205, { preset: 'm_creative', top: '#151517', bottom: '#1a1a1c', ageYears: 30, cap: undefined, bag: undefined, crossbody: undefined, backpack: undefined }), ...STAFF_SPOTS.dj, 'dj', 0.36);
  const seatTops = new Map(), boothTops = new Map(); // chair / booth → seat height that fits whoever sits there
  PATRON_SPOTS.forEach((sp, i) => { const spec = patronSpec(PATRON_SEEDS[i], i);
    if (sp.stand) { addNPC(spec, sp.stand[0], sp.stand[1], sp.stand[2], 'barfly'); return; }
    const ch = new Character(spec); const top = seatTopFor(ch);
    let x, z, yaw; if (sp.chair !== undefined) { [x, z, yaw] = CLUB_CHAIRS[sp.chair]; seatTops.set(sp.chair, top); } else { x = 9.62; z = CLUB_BOOTHS[sp.booth] + (i % 2 ? 0.55 : -0.5); yaw = -Math.PI / 2; boothTops.set(sp.booth, top); }
    const bx = x - Math.sin(yaw) * 0.04, bz = z - Math.cos(yaw) * 0.04; // hips a little behind the seat centre
    ch.root.position.set(bx, 0, bz); ch.root.rotation.y = yaw; g.add(ch.root); ch.anim.seated = true; // feet on the floor; the seat is built to the person
    people.push({ ch, kind: 'patron', x: bx, z: bz, yaw, rnd: rnd(spec.seed || 9) }); });
  // ---- booths along the right wall: high tufted backs, dividers with frosted glass, marble tables with lamps
  CLUB_BOOTHS.forEach((zc, bi) => { const st = boothTops.get(bi) ?? 0.46;
    k.box('leatherB', 0.62, st - 0.08, 3.0, 9.66, (st - 0.08) / 2, zc, { r: 0.03 }); k.box('leatherR', 0.6, 0.08, 2.96, 9.65, st - 0.04, zc, { r: 0.035 });
    k.box('leatherR', 0.2, 0.85, 3.0, 9.88, 0.88, zc, { r: 0.06, rz: 0.08 }); for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) k.sph('brass', 0.012, 9.77, 0.72 + j * 0.3, zc - 1.25 + i * 0.5, { ws: 8, hs: 6 });
    for (const s of [-1, 1]) { k.box('wain', 0.75, 1.45, 0.08, 9.62, 0.725, zc + s * 1.55); k.box('brass', 0.77, 0.03, 0.1, 9.62, 1.46, zc + s * 1.55); k.box('glass', 0.7, 0.6, 0.02, 9.62, 1.78, zc + s * 1.55); }
    k.at(8.55, 0, zc, 0, () => { k.box('marble', 0.7, 0.04, 1.5, 0, 0.72, 0, { r: 0.01 }); k.cyl('chrome', 0.03, 0.03, 0.68, 0, 0.36, -0.4, { seg: 10 }); k.cyl('chrome', 0.03, 0.03, 0.68, 0, 0.36, 0.4, { seg: 10 }); k.box('chrome', 0.5, 0.02, 1.0, 0, 0.01, 0);
      k.cyl('brass', 0.05, 0.06, 0.02, 0.1, 0.75, 0.45, { seg: 14 }); k.cyl('brass', 0.008, 0.008, 0.24, 0.1, 0.87, 0.45, { seg: 6 }); k.cyl('ledamber', 0.06, 0.09, 0.1, 0.1, 1.02, 0.45, { seg: 16, open: false });
      k.cyl('glass', 0.035, 0.03, 0.1, -0.1, 0.79, -0.2, { seg: 12 }); k.cyl('candle', 0.03, 0.03, 0.05, 0.05, 0.765, -0.1, { seg: 12 }); });
    k.block(9.1, zc, 1.8, 3.1);
  });
  // banquette along the partition (hall side) with small tables; poseur tables on the right
  k.box('leatherB', 6.8, 0.42, 0.55, -5.9, 0.21, LZ - 0.4, { r: 0.04 }); k.box('leatherR', 6.8, 0.6, 0.16, -5.9, 0.75, LZ - 0.2, { r: 0.05 }); k.block(-5.9, LZ - 0.35, 6.9, 0.6);
  for (const x of [-8.1, -5.9, -3.7]) k.at(x, 0, LZ - 1.2, 0, () => cocktailTable(k, 0.55, 0.3));
  for (const [x, z] of [[3.2, 7.2], [5.6, 6.6], [7.9, 6.8]]) k.at(x, 0, z, 0, () => { k.cyl('chrome', 0.24, 0.26, 0.02, 0, 0.01, 0, { seg: 24 }); k.cyl('chrome', 0.03, 0.03, 1.05, 0, 0.54, 0, { seg: 10 }); k.cyl('marble', 0.3, 0.3, 0.03, 0, 1.08, 0, { seg: 28 }); k.cyl('glass', 0.035, 0.03, 0.1, 0.08, 1.145, 0, { seg: 12 }); k.block(0, 0, 0.6, 0.6); });
  // lounge sets between the stages and the bar / booths
  for (const [x, z] of [[-4.7, -4.4], [-4.7, -0.4], [-4.7, 3.6], [4.5, -4.8], [4.5, -1.0]]) {
    k.at(x, 0, z, 0, () => cocktailTable(k)); const face = Math.atan2(RC.x - x, RC.z - z);
    for (const s of [-1, 1]) { const cx = x + Math.cos(face) * 0.72 * s, cz = z - Math.sin(face) * 0.72 * s; k.at(cx, 0, cz, face, () => tubChair(k, 0.46)); }
  }

  CLUB_CHAIRS.forEach(([x, z, yaw], i) => k.at(x, 0, z, yaw, () => tubChair(k, seatTops.get(i) ?? 0.46)));
  CLUB_CHAIRS.forEach(([x, z, yaw], i) => k.at(x, 0, z, yaw, () => tubChair(k, seatTops.get(i) ?? 0.46)));
  for (const p of people) if (p.kind !== 'patron') k.obs.push({ x0: p.x - 0.28, x1: p.x + 0.28, z0: p.z - 0.28, z1: p.z + 0.28 }); // standing people are solid
  room.npcs = people; room.dancers = dancers;

  // ---- fixtures that move: moving-head lights on the truss, mirror ball over the round platform
  const heads = []; const yokeM = std({ color: 0x151517, roughness: 0.45, metalness: 0.5 });
  for (const [x, z] of [[-3.4, -7.9], [-1.1, -7.9], [1.1, -7.9], [3.4, -7.9], [-3.4, -11.5], [3.4, -11.5]]) {
    const grp = new THREE.Group(); grp.position.set(x, tY - 0.32, z); g.add(grp);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.26), yokeM); base.position.y = -0.03; grp.add(base);
    const pan = new THREE.Group(); grp.add(pan); for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.24, 0.08), yokeM); arm.position.set(s * 0.13, -0.18, 0); pan.add(arm); }
    const tilt = new THREE.Group(); tilt.position.y = -0.24; pan.add(tilt); const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.26, 16), yokeM); tilt.add(hd);
    const lensM = new THREE.MeshBasicMaterial({ color: 0xff3a9a, toneMapped: false }); const lens = new THREE.Mesh(new THREE.CircleGeometry(0.075, 18), lensM); lens.rotation.x = Math.PI / 2; lens.position.y = -0.131; tilt.add(lens);
    const beamM = new THREE.MeshBasicMaterial({ color: 0xff3a9a, vertexColors: true, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const bg = new THREE.CylinderGeometry(0.07, 0.55, 4.2, 18, 1, true); bg.translate(0, -2.1 - 0.13, 0);
    { const py = bg.attributes.position, col = new Float32Array(py.count * 3); for (let i = 0; i < py.count; i++) { const f = Math.pow(Math.max(0, 1 + (py.getY(i) + 0.13) / 4.2), 1.6); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f; } bg.setAttribute('color', new THREE.BufferAttribute(col, 3)); } // haze beam fades out along its length (no hard disc where it meets the floor)
    const beam = new THREE.Mesh(bg, beamM); beam.renderOrder = 3; tilt.add(beam);
    heads.push({ pan, tilt, lensM, beamM, ph: heads.length * 1.3 });
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 28, 18), new THREE.MeshStandardMaterial({ color: 0xd0d0d4, metalness: 0.6, roughness: 0.18, flatShading: true })); ball.position.set(RC.x, H - 0.7, RC.z); g.add(ball);
  k.cyl('chrome', 0.006, 0.006, 0.38, RC.x, H - 0.19, RC.z, { seg: 6 });
  // downlights over the bar, booths and lobby (decorative discs; the light comes from the few point lights below)
  for (let z = -4; z <= 4; z += 2) k.cyl('downlight', 0.06, 0.06, 0.012, -8.3, H - 0.006, z, { seg: 14 });
  for (const zc of CLUB_BOOTHS) k.cyl('downlight', 0.06, 0.06, 0.012, 8.6, H - 0.006, zc, { seg: 14 });
  for (const x of [-6, -3, 0, 3, 6]) k.cyl('downlight', 0.06, 0.06, 0.012, x, H - 0.006, 10.3, { seg: 14 });

  // ---- lights: six point lights (matches Game.warmLightSets, so entering compiles nothing new)
  const L6 = { stage: new THREE.PointLight(0xff5aa0, 26, 13, 1.3), round: new THREE.PointLight(0xffb8d8, 14, 8, 1.3), pod: new THREE.PointLight(0xff7ab8, 11, 6, 1.4), bar: new THREE.PointLight(0xffb46a, 12, 10, 1.3), lobby: new THREE.PointLight(0xffd6a0, 9, 9, 1.3), fill: new THREE.PointLight(0xc070ff, 11, 12, 1.2) };
  L6.stage.position.set(0, 3.7, -8.4); L6.round.position.set(RC.x, 3.3, RC.z + 0.4); L6.pod.position.set(PD.x - 0.6, 3.2, PD.z); L6.bar.position.set(-8.0, 3.4, 0); L6.lobby.position.set(0, 3.2, 10.3); L6.fill.position.set(7.4, 3.1, -1.2); /* over the booths */
  for (const l of Object.values(L6)) { l.castShadow = false; g.add(l); }
  room.lights = L6;
  // soft contact shadows under the big pieces
  aoBlob(g, 0, 0, scz + 0.1, sw + 0.6, sd + 0.6, 0.5); aoBlob(g, RC.x, 0, RC.z, (RR + 0.6) * 2, (RR + 0.6) * 2, 0.5); aoBlob(g, PD.x, 0, PD.z, (PR + 0.5) * 2, (PR + 0.5) * 2, 0.45); aoBlob(g, -8.3, 0, 0, 1.3, 11.2, 0.45);
  for (const [x, z] of CLUB_CHAIRS) aoBlob(g, x, 0, z, 0.8, 0.8, 0.4);
  k.build(g);

  // ---- banknotes: two instanced pools (Rs 100 for "make it rain", Rs 500 tips) — thrown, flutter down, lie on the stage
  const notes = { list: [], pools: {} }; const noteGeo = new THREE.PlaneGeometry(0.13, 0.065);
  for (const v of [100, 500]) { const im = new THREE.InstancedMesh(noteGeo, new THREE.MeshStandardMaterial({ map: texNote(v), roughness: 0.75, side: THREE.DoubleSide }), 120); im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; g.add(im); notes.pools[v] = { im, next: 0, used: 0 }; }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _h = new THREE.Vector3();
  const throwNote = (v, from, d) => { const pool = notes.pools[v]; const slot = pool.next; pool.next = (pool.next + 1) % 120; pool.used = Math.min(120, pool.used + 1); pool.im.count = pool.used;
    const old = notes.list.findIndex((n) => n.pool === pool && n.slot === slot); if (old >= 0) notes.list.splice(old, 1);
    const p = d.pole, rr = 0.3 + Math.random() * 0.75, a = Math.atan2(from.x - p.x, from.z - p.z) + (Math.random() - 0.5) * 2.0; const to = { x: p.x + Math.sin(a) * rr, z: p.z + Math.cos(a) * rr, y: p.y0 + 0.003 + Math.random() * 0.004 };
    notes.list.push({ pool, slot, t: 0, dur: 0.75 + Math.random() * 0.35, from: { ...from }, to, spin: (Math.random() - 0.5) * 18, yaw: Math.random() * Math.PI * 2, age: 0 }); };
  const updateNotes = (dt) => { const dirty = new Set();
    for (let i = notes.list.length - 1; i >= 0; i--) { const n = notes.list[i]; n.age += dt; let x, y, z, rx, ry, rz, sc = 1;
      if (n.t < 1) { n.t = Math.min(1, n.t + dt / n.dur); const u = n.t, e = 1 - (1 - u) * (1 - u) * 0.6; x = n.from.x + (n.to.x - n.from.x) * e; z = n.from.z + (n.to.z - n.from.z) * e; y = n.from.y + (n.to.y - n.from.y) * u + 0.55 * 4 * u * (1 - u) + Math.sin(u * 9 + n.spin) * 0.03 * (1 - u);
        rx = -Math.PI / 2 + Math.sin(u * 7 + n.spin) * 1.2 * (1 - u); ry = n.yaw + n.spin * u * 0.4; rz = Math.cos(u * 5 + n.spin) * 0.8 * (1 - u); dirty.add(n.pool); }
      else if (n.age < 45) { if (n.settled) continue; n.settled = true; x = n.to.x; y = n.to.y; z = n.to.z; rx = -Math.PI / 2; ry = 0; rz = n.yaw; dirty.add(n.pool); }
      else { sc = Math.max(0, 1 - (n.age - 45) / 1.2); x = n.to.x; y = n.to.y; z = n.to.z; rx = -Math.PI / 2; ry = 0; rz = n.yaw; dirty.add(n.pool); if (sc <= 0) { notes.list.splice(i, 1); } } // collected off the stage after a while
      _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.setScalar(sc); _m.compose(_p.set(x, y, z), _q, _s); n.pool.im.setMatrixAt(n.slot, _m); }
    for (const pool of dirty) pool.im.instanceMatrix.needsUpdate = true; };

  // ---- drinks at the bar (HeroRooms.Drink: pour, drink, drunk effect)
  const drink = new Drink(room, drinkProps.bottle, drinkProps.glass, CLUB.drinkSpot); drinkProps.bottle.userData.setFill(1); drink.note = () => 'Rs. 1,200 on your tab — the bartender tops the bottle up.';
  room.drink = drink;

  // ---- per frame
  let rain = null; const keyOf = (a) => game.hud.key(a);
  room.obstacles = k.obs.map((o) => ({ x0: o.x0 + ox, x1: o.x1 + ox, z0: o.z0 + oz, z1: o.z1 + oz }));
  room.bounds = { x0: ox - W / 2 + 0.05, x1: ox + W / 2 - 0.05, z0: oz - D / 2 + 0.05, z1: oz + D / 2 - 0.05 };
  room.spawn = [ox + CLUB.spawn[0], oz + CLUB.spawn[1]]; room.ceilAt = () => Y + H - 0.25;
  room.onEnter = () => { Audio.speaker(false); room.musicMode = 'club'; drink.shots = 14; drinkProps.bottle.userData.setFill(1); };
  room.onExit = () => { drink.abort(); rain = null; game.player.indoorBusy = false; };
  const money = () => game.story?.state?.money ?? 0;
  const pay = (n, why) => { if (money() < n) { game.hud.notify('Not enough money', `You need Rs. ${n.toLocaleString('en-US')}.`, 'warn', 2); return false; } game.story.pay(-n, why); return true; };
  const handPos = (P) => { const b = P.ch.bones?.handR || P.ch.bones?.chest; if (!b) return { x: P.x - ox, y: 1.2, z: P.z - oz }; b.getWorldPosition(_h); return { x: _h.x - ox, y: _h.y - Y, z: _h.z - oz }; };
  room.tick = (dt, P) => {
    const t = (room.t = (room.t || 0) + dt); const beat = t * 100 / 60, ph = beat % 1, pulse = Math.exp(-ph * 5), bar8 = Math.floor(beat / 8);
    LED.pink.emissiveIntensity = 1.4 + 1.2 * pulse; LED.blue.emissiveIntensity = 1.3 + 0.9 * Math.exp(-((beat + 0.5) % 1) * 5); LED.violet.emissiveIntensity = 1.5 + 0.8 * pulse;
    const pal = [0xff3a9a, 0x7a5aff, 0xff9a3a, 0x3ab0ff, 0xff3a5a]; heads.forEach((h, i) => { h.pan.rotation.y = Math.sin(t * 0.37 + h.ph) * 1.1; h.tilt.rotation.x = 0.35 + Math.sin(t * 0.53 + h.ph * 1.7) * 0.35; h.tilt.rotation.z = Math.sin(t * 0.29 + h.ph) * 0.25; const c = pal[(bar8 + i) % pal.length]; h.lensM.color.setHex(c); h.beamM.color.setHex(c); h.beamM.opacity = 0.05 + 0.03 * pulse; });
    ball.rotation.y += dt * 0.6; L6.stage.color.setHex(pal[bar8 % pal.length]).lerp(STAGE_TINT, 0.55); L6.stage.intensity = 22 + 5 * pulse;
    // the round-platform dancer plays to the player when he is close
    const lx = P.x - ox, lz = P.z - oz; const dr = dancers[2]; if (dr) { const dd = Math.hypot(lx - RC.x, lz - RC.z); dr.audience = dd < 6 ? [lx, lz] : dr.home; }
    for (const d of dancers) d.update(dt);
    for (const p of people) { routine(p, p.ch, dt, p.kind, p.rnd); p.ch.anim.update(dt, 0); }
    if (rain) { rain.t += dt; rain.acc += dt; while (rain.acc > 0.05 && rain.left > 0) { rain.acc -= 0.05; rain.left--; throwNote(100, handPos(P), rain.d); if (rain.left % 8 === 0) P.ch.anim.play('interact', 0.45); if (Audio.ready) Audio.noise(0.05, { f: 2500 + Math.random() * 1500, q: 2, vol: 0.02 }); }
      if (rain.left <= 0) { rain.d.tipped(lx, lz, RAIN); rain = null; P.indoorBusy = false; } }
    updateNotes(dt); drink.update(dt);
  };
  room.update = (dt, P) => {
    room.prompt = null; if (drink.active || rain || P.vehicle) return;
    const lx = P.x - ox, lz = P.z - oz, fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    const ds = CLUB.drinkSpot; if (Math.hypot(lx - ds.x, lz - ds.z) < 0.9) { room.prompt = `${keyOf('interact')} Buy a shot (Rs. 1,200)`; if (Input.wasPressed('interact') && pay(SHOT, 'Drink at The Velvet Monsoon')) { drink.shots = 14; drinkProps.bottle.userData.setFill(1); drink.start(P); } return; }
    let best = null, bs = 0.55; for (const d of dancers) { const rx = d.ch.root.position.x - lx, rz = d.ch.root.position.z - lz, dist = Math.hypot(rx, rz); if (dist > 3.9 || dist < 0.3) continue; const c = (rx * fx + rz * fz) / dist; if (c > bs) { bs = c; best = d; } }
    if (!best) return;
    room.prompt = `${keyOf('interact')} Tip ${best.name} (Rs. 500) · ${keyOf('more')} Make it rain (Rs. 5,000)`;
    if (Input.wasPressed('interact') && pay(TIP, `Tip for ${best.name}`)) { P.ch.anim.play('interact', 0.9); throwNote(500, handPos(P), best); best.tipped(lx, lz, TIP); game.hud.notify(best.name, ['blows you a kiss.', 'smiles at you.', 'dances your way.'][Math.floor(Math.random() * 3)], 'info', 1.8); }
    else if (Input.wasPressed('more') && pay(RAIN, `Made it rain for ${best.name}`)) { rain = { d: best, t: 0, acc: 0.05, left: RAIN / 100 }; P.indoorBusy = true; P.ch.anim.play('interact', 0.45); game.hud.notify('Making it rain', `Rs. 5,000 in hundreds for ${best.name}.`, 'info', 2.2); }
  };
  return room;
}
