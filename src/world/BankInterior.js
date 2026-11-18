// Ceylon Meridian Bank, Kollupitiya branch — the banking hall (67th request, Phase 1B). A walk-in room like every other
// shop (WalkIn.js builds it in place behind the facade of building 251 on Galle Road, preloads it on the loading screen,
// hands the player to its collision model and lights it with the shared six-light pool). Local frame: facade z = 0,
// street +z, door at x = 0; "d" below is the depth from the inner face of the front wall (z = −REVEAL − d).
//
//   front (d 0–4.6)     ATM lobby on the left (two through-the-wall ATMs in a navy surround, a glass privacy fin, header
//                       signs, a lower soffit with downlights), the security officer by the door, a queue-ticket kiosk,
//                       the reception / enquiries desk (receptionist, PC, phone, orchid), brochure rack + posters right
//   middle (d 4.6–8.6)  waiting area — two blocks of pedestal chairs (the seat height adjusts to whoever sits, like a gas
//                       lift, so nobody hovers over or sinks into a seat), water dispenser, plants, clock, notice board;
//                       the branch manager's glass office on the right
//   counter (d 8.6–9.4) four teller windows behind security glass up to the bulkhead (speech grilles, cash trays, card
//                       terminals, privacy fins between windows), counter numbers + a "now serving" display on the
//                       bulkhead, a glazed staff door at the right end (closed — staff only)
//   staff (d 9.4–13.4)  teller workstations (monitor, keyboard, note counter, receipt printer, phone, cash drawer) with
//                       office chairs built to each teller, the lit CMB feature wall, the vault door, filing cabinets,
//                       copier, the operations supervisor
// People (room-local, like the HQ and the club): staff at their posts on the existing idle routines (desk / guard / stand);
// customers come in through the real door (they push it — WalkIn s.npcDoor), take a number, sit, wait for a free teller,
// use an ATM, ask at reception, and leave through the door again (handed to the street crowd when the player is outside).
// They follow fixed lanes laid out between the furniture, stop for the player and for each other, and never pick the ATM
// the player is using. After banking hours (19:30–07:30) the counters close: only the guard and ATM customers remain.
import * as THREE from 'three';
import { Kit, KIT, C, lathe, kitMaterial } from './ShopKit.js';
import { shell } from './ShopInteriors.js';
import './RobberyShops.js'; // registers the kit's ceiling tile / steel / plastic / gold materials
import { REVEAL, LEAF_Z } from './WalkIn.js';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { Character } from '../actors/Character.js';
import { makeAppearance, makeBankStaffAppearance, isAdultSpec } from '../actors/Appearance.js';
import { routine } from '../actors/Routine.js';
import { seatTopFor } from './ClubCast.js';
import { CMB, FONTS, drawLogo, tracked, fitFont, hasCanvas, drawATMScreen, ATM_IDLE_VIEW } from './BankBrand.js';
import { BankSound } from '../audio/BankAudio.js';

export const BANK_ROOM = Object.freeze({ name: 'Ceylon Meridian Bank', W: 14, D: 13.4, H: 3.6, windows: [-4.95, -1.65, 1.65, 4.95], staffed: [0, 1, 2], atmD: [1.6, 3.2], atmFace: -6.45, atmStandX: -5.84, open: [7.5, 19.5] });
const ZF = -REVEAL; const Z = (d) => ZF - d;
const WHITE = [1, 1, 1];
const R5 = (x0, y0, x1, y1) => [x0 / 512, 1 - y1 / 512, x1 / 512, 1 - y0 / 512];
export const IN_UV = { wordmark: R5(0, 0, 512, 128), counter: (i) => R5(i * 128, 128, (i + 1) * 128, 192), serving: R5(0, 192, 256, 256), atmHead: R5(256, 192, 512, 256), staff: R5(0, 256, 128, 320), closed: R5(128, 256, 256, 320),
  kiosk: R5(256, 256, 384, 320), enquiries: R5(384, 256, 512, 320), clock: R5(0, 320, 128, 448), logo: R5(128, 320, 256, 448), office: R5(256, 320, 512, 384), atmHang: R5(256, 384, 512, 448), blinds: R5(0, 448, 512, 512) };
export const POSTER_UV = { fd: R5(0, 0, 256, 384), home: R5(256, 0, 512, 384), notice: R5(0, 384, 256, 512), brochure: (i) => R5(256 + (i % 4) * 64, 384 + Math.floor(i / 4) * 64, 256 + (i % 4 + 1) * 64, 384 + (Math.floor(i / 4) + 1) * 64) };

// ------------------------------------------------------------------------------------------------ canvas art (2 × 512²)
let inTex, poTex;
function interiorAtlas() {
  if (inTex !== undefined) return inTex; if (!hasCanvas()) return (inTex = null);
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const a = cv.getContext('2d'); a.textBaseline = 'alphabetic'; const S = FONTS.SANS;
  const ctr = (t, x, y) => { a.textAlign = 'center'; a.fillText(t, x, y); a.textAlign = 'left'; };
  // feature wall band: logo + name + branch
  a.fillStyle = CMB.navy; a.fillRect(0, 0, 512, 128); drawLogo(a, 12, 12, 104);
  a.fillStyle = CMB.white; const s1 = fitFont(a, CMB.name, 700, FONTS.SERIF, 40, 360, 2); a.font = `700 ${s1}px ${FONTS.SERIF}`; tracked(a, CMB.name, 318, 68, 2);
  a.fillStyle = CMB.gold; a.fillRect(146, 82, 344, 2); a.fillStyle = CMB.goldLight; a.font = `600 16px ${S}`; tracked(a, 'KOLLUPITIYA BRANCH', 318, 108, 3);
  // counter numbers 1–4
  const LBL = [['CASH', 'WITHDRAWALS'], ['CASH &', 'DEPOSITS'], ['ACCOUNTS', '& ENQUIRIES'], ['FOREIGN', 'CURRENCY']];
  for (let i = 0; i < 4; i++) { const x = i * 128, y = 128; a.fillStyle = CMB.navy; a.fillRect(x, y, 128, 64); a.fillStyle = CMB.gold; a.fillRect(x + 5, y + 6, 44, 52); a.fillStyle = CMB.navy; a.font = `800 42px ${S}`; ctr(String(i + 1), x + 27, y + 48);
    a.fillStyle = CMB.goldLight; a.font = `700 9px ${S}`; a.fillText('COUNTER', x + 56, y + 17); a.fillStyle = CMB.white; for (let j = 0; j < 2; j++) { const fs = fitFont(a, LBL[i][j], 700, S, 13, 66, 0, 7); a.font = `700 ${fs}px ${S}`; a.fillText(LBL[i][j], x + 56, y + 35 + j * 16); } }
  // "now serving" LED display
  a.fillStyle = '#0a0c0f'; a.fillRect(0, 192, 256, 64); a.fillStyle = '#15181d'; a.fillRect(3, 195, 250, 58); a.fillStyle = '#ffb347'; a.font = `700 12px ${S}`; a.fillText('NOW SERVING', 10, 209); a.textAlign = 'right'; a.fillText('COUNTER', 246, 209); a.textAlign = 'left';
  a.fillStyle = '#ff6a3a'; a.font = `700 20px ${FONTS.COND}`; a.fillText('A 027', 12, 231); a.fillText('B 014', 12, 251); a.textAlign = 'right'; a.fillText('2', 236, 231); a.fillText('3', 236, 251); a.textAlign = 'left';
  a.fillStyle = 'rgba(255,120,60,0.5)'; a.font = `700 16px ${FONTS.COND}`; a.fillText('→', 120, 230); a.fillText('→', 120, 250);
  // ATM header
  a.fillStyle = CMB.navy; a.fillRect(256, 192, 256, 64); drawLogo(a, 262, 198, 52, { keyline: false }); a.fillStyle = CMB.white; a.font = `800 34px ${S}`; a.fillText('ATM', 322, 237);
  a.fillStyle = CMB.goldLight; a.font = `600 11px ${S}`; a.fillText('CASH WITHDRAWAL', 398, 220); a.fillText('& DEPOSIT · 24H', 398, 238);
  // STAFF ONLY · COUNTER CLOSED · kiosk screen · ENQUIRIES
  a.fillStyle = '#ecebe6'; a.fillRect(0, 256, 128, 64); a.fillStyle = CMB.navy; a.fillRect(0, 256, 6, 64); a.font = `800 19px ${S}`; ctr('STAFF', 67, 284); ctr('ONLY', 67, 307);
  a.fillStyle = '#f4f2ec'; a.fillRect(128, 256, 128, 64); a.strokeStyle = CMB.navy; a.lineWidth = 3; a.strokeRect(131, 259, 122, 58); a.fillStyle = CMB.navy; a.font = `700 15px ${S}`; ctr('COUNTER', 192, 283); a.fillStyle = '#8c1c2c'; a.font = `800 18px ${S}`; ctr('CLOSED', 192, 306);
  a.fillStyle = '#0e2340'; a.fillRect(256, 256, 128, 64); a.fillStyle = CMB.white; a.font = `700 11px ${S}`; ctr('PLEASE TAKE A NUMBER', 320, 272);
  [['Cash & deposits', 'A'], ['Accounts', 'B'], ['Other services', 'C']].forEach(([t, k], i) => { const y = 278 + i * 13; a.fillStyle = CMB.gold; a.fillRect(262, y, 116, 11); a.fillStyle = CMB.navyDeep; a.font = `700 8px ${S}`; a.fillText(k + '  ' + t, 266, y + 8.5); });
  a.fillStyle = CMB.navy; a.fillRect(384, 256, 128, 64); a.fillStyle = CMB.gold; a.fillRect(392, 264, 112, 2); a.fillStyle = CMB.white; a.font = `700 15px ${S}`; ctr('ENQUIRIES', 448, 290); a.fillStyle = CMB.goldLight; a.font = `600 11px ${S}`; ctr('RECEPTION', 448, 307);
  // wall clock (10:10), on the wall colour
  a.fillStyle = '#efeae1'; a.fillRect(0, 320, 128, 128); a.fillStyle = '#2b2f36'; a.beginPath(); a.arc(64, 384, 60, 0, 7); a.fill(); a.fillStyle = '#fbfaf6'; a.beginPath(); a.arc(64, 384, 54, 0, 7); a.fill();
  a.strokeStyle = CMB.navy; for (let i = 0; i < 60; i++) { const an = i / 60 * Math.PI * 2, r0 = i % 5 ? 49 : 44; a.lineWidth = i % 5 ? 1 : 3; a.beginPath(); a.moveTo(64 + Math.sin(an) * r0, 384 - Math.cos(an) * r0); a.lineTo(64 + Math.sin(an) * 52, 384 - Math.cos(an) * 52); a.stroke(); }
  drawLogo(a, 56, 352, 16, { keyline: false }); a.lineCap = 'round'; a.strokeStyle = '#1a1d22'; a.lineWidth = 4; a.beginPath(); a.moveTo(64, 384); a.lineTo(64 + Math.sin(-1.08) * 28, 384 - Math.cos(-1.08) * 28); a.stroke(); a.lineWidth = 3; a.beginPath(); a.moveTo(64, 384); a.lineTo(64 + Math.sin(1.05) * 42, 384 - Math.cos(1.05) * 42); a.stroke();
  a.strokeStyle = '#b0322a'; a.lineWidth = 1.2; a.beginPath(); a.moveTo(64, 384); a.lineTo(64 + Math.sin(3.6) * 46, 384 - Math.cos(3.6) * 46); a.stroke(); a.fillStyle = '#1a1d22'; a.beginPath(); a.arc(64, 384, 3, 0, 7); a.fill(); a.lineCap = 'butt';
  drawLogo(a, 128, 320, 128); // logo tile
  // manager's office sign
  a.fillStyle = '#ecebe6'; a.fillRect(256, 320, 256, 64); a.fillStyle = CMB.navy; a.fillRect(256, 320, 6, 64); drawLogo(a, 270, 330, 44, { keyline: false }); a.fillStyle = CMB.navy; a.font = `700 16px ${S}`; a.fillText('CUSTOMER SERVICE', 324, 349); a.fillStyle = '#3a4252'; a.font = `600 13px ${S}`; a.fillText('Branch Manager', 324, 369);
  // hanging ATM sign
  a.fillStyle = CMB.navy; a.fillRect(256, 384, 256, 64); a.fillStyle = CMB.gold; a.fillRect(256, 384, 256, 3); a.fillRect(256, 445, 256, 3); drawLogo(a, 266, 392, 48, { keyline: false });
  a.fillStyle = CMB.white; a.font = `800 30px ${S}`; a.fillText('ATM', 326, 427); a.fillStyle = CMB.goldLight; a.font = `600 12px ${S}`; a.fillText('CASH WITHDRAWAL', 400, 412); a.fillText('CASH DEPOSIT', 400, 430);
  // daylight through the frontage's vertical blinds (seen from inside)
  const gb = a.createLinearGradient(0, 448, 0, 512); gb.addColorStop(0, '#f2f6f8'); gb.addColorStop(1, '#d6dde1'); a.fillStyle = gb; a.fillRect(0, 448, 512, 64);
  for (let x = 0; x < 512; x += 16) { const sh = a.createLinearGradient(x, 0, x + 16, 0); sh.addColorStop(0, 'rgba(250,250,247,0.9)'); sh.addColorStop(0.75, 'rgba(226,226,222,0.85)'); sh.addColorStop(1, 'rgba(170,172,170,0.8)'); a.fillStyle = sh; a.fillRect(x, 448, 13, 64); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; return (inTex = t);
}
function posterAtlas() {
  if (poTex !== undefined) return poTex; if (!hasCanvas()) return (poTex = null);
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const a = cv.getContext('2d'); a.textBaseline = 'alphabetic'; const S = FONTS.SANS, SE = FONTS.SERIF;
  const ctr = (t, x, y) => { a.textAlign = 'center'; a.fillText(t, x, y); a.textAlign = 'left'; };
  // poster 1: fixed deposits (navy, gold meridian arcs)
  a.fillStyle = CMB.navy; a.fillRect(0, 0, 256, 384); a.strokeStyle = 'rgba(179,154,94,0.55)'; a.lineWidth = 2; for (let i = 0; i < 7; i++) { a.beginPath(); a.ellipse(128, 250, 30 + i * 16, 110, 0, 0, Math.PI * 2); a.stroke(); }
  a.fillStyle = CMB.gold; a.fillRect(124, 120, 8, 230); a.fillStyle = CMB.navy; a.fillRect(0, 300, 256, 84); a.fillStyle = CMB.white; a.font = `700 30px ${SE}`; ctr('Grow your', 128, 52); ctr('savings', 128, 84);
  a.fillStyle = CMB.goldLight; a.font = `700 13px ${S}`; ctr('FIXED DEPOSITS FROM 3 MONTHS', 128, 108); a.fillStyle = CMB.white; a.font = `800 30px ${S}`; ctr('9.25% p.a.*', 128, 334); a.fillStyle = '#b9c4d6'; a.font = `500 9px ${S}`; ctr('* Indicative rate for 12 months. Terms apply.', 128, 352);
  drawLogo(a, 98, 356, 22, { keyline: false }); a.fillStyle = CMB.white; a.font = `700 9px ${SE}`; a.fillText(CMB.name, 124, 371);
  // poster 2: home loans (cream, gold house line drawing)
  a.fillStyle = '#f3efe4'; a.fillRect(256, 0, 256, 384); a.strokeStyle = CMB.gold; a.lineWidth = 5; a.lineJoin = 'round'; a.beginPath(); a.moveTo(316, 230); a.lineTo(384, 170); a.lineTo(452, 230); a.moveTo(330, 222); a.lineTo(330, 290); a.lineTo(438, 290); a.lineTo(438, 222); a.stroke();
  a.strokeStyle = CMB.navy; a.lineWidth = 4; a.strokeRect(370, 248, 28, 42); a.fillStyle = CMB.navy; a.font = `700 28px ${SE}`; ctr('A home of', 384, 56); ctr('your own', 384, 88); a.fillStyle = '#6b5a33'; a.font = `700 12px ${S}`; ctr('HOUSING LOANS · UP TO 25 YEARS', 384, 116);
  a.fillStyle = CMB.navy; a.fillRect(256, 314, 256, 70); drawLogo(a, 268, 326, 46, { keyline: false }); a.fillStyle = CMB.white; a.font = `700 12px ${SE}`; a.fillText(CMB.name, 322, 346); a.fillStyle = CMB.goldLight; a.font = `600 10px ${S}`; a.fillText('Ask at Counter 3 or Customer Service', 322, 364);
  // notice: charges and limits (the same rules the ATM applies — Bank.js BANK_RULES)
  a.fillStyle = '#fbfaf6'; a.fillRect(0, 384, 256, 128); a.fillStyle = CMB.navy; a.fillRect(0, 384, 256, 22); a.fillStyle = CMB.white; a.font = `700 11px ${S}`; a.fillText('SERVICE CHARGES & LIMITS', 10, 399);
  [['CMB ATM cash withdrawal', 'Free'], ['Cash deposit (ATM / counter)', 'Free'], ['ATM withdrawal per transaction', 'Rs. 100,000'], ['Daily ATM withdrawal limit', 'Rs. 200,000'], ['Notes dispensed', 'Rs. 500 multiples']].forEach(([k, v], i) => { const y = 422 + i * 17; a.fillStyle = '#2a3140'; a.font = `600 10px ${S}`; a.fillText(k, 10, y); a.textAlign = 'right'; a.fillStyle = CMB.navy; a.font = `700 10px ${S}`; a.fillText(v, 246, y); a.textAlign = 'left'; a.fillStyle = '#d8d4ca'; a.fillRect(10, y + 4, 236, 1); });
  // brochure covers (8)
  const BR = [['Savings', CMB.navy, CMB.white], ['Home Loans', '#f3efe4', CMB.navy], ['Cards', CMB.gold, CMB.navyDeep], ['Leasing', '#2a4a6a', CMB.white], ['Gold Loans', '#e8dcc0', '#5a4520'], ['Remittance', CMB.navyDeep, CMB.goldLight], ['Pensions', '#f6f4ee', CMB.navy], ['Fixed Deposits', '#1d3461', CMB.white]];
  BR.forEach(([t, bg, fg], i) => { const x = 256 + (i % 4) * 64, y = 384 + Math.floor(i / 4) * 64; a.fillStyle = bg; a.fillRect(x + 1, y + 1, 62, 62); drawLogo(a, x + 22, y + 8, 20, { keyline: false }); a.fillStyle = fg; const fs = fitFont(a, t, 700, S, 10, 56, 0, 6); a.font = `700 ${fs}px ${S}`; ctr(t, x + 32, y + 46); a.fillStyle = CMB.gold; a.fillRect(x + 12, y + 52, 40, 1.5); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; return (poTex = t);
}

// ------------------------------------------------------------------------------------------------ geometry helpers
// a textured rectangle facing one of the four room directions
function face(b, cx, cy, cz, w, h, uv, dir) {
  const y0 = cy - h / 2, y1 = cy + h / 2, hw = w / 2;
  if (dir === '+z') b.quad([cx - hw, y0, cz], [cx + hw, y0, cz], [cx + hw, y1, cz], [cx - hw, y1, cz], uv);
  else if (dir === '-z') b.quad([cx + hw, y0, cz], [cx - hw, y0, cz], [cx - hw, y1, cz], [cx + hw, y1, cz], uv);
  else if (dir === '+x') b.quad([cx, y0, cz + hw], [cx, y0, cz - hw], [cx, y1, cz - hw], [cx, y1, cz + hw], uv);
  else b.quad([cx, y0, cz - hw], [cx, y0, cz + hw], [cx, y1, cz + hw], [cx, y1, cz - hw], uv);
}
const rot = (x, z, yaw, dx, dz) => [x + dx * Math.cos(yaw) + dz * Math.sin(yaw), z - dx * Math.sin(yaw) + dz * Math.cos(yaw)];
// office chair (five-star base, gas lift, upholstered seat + back, arms) built to its sitter: seat top at `top`
function officeChair(k, x, z, yaw, top, { high = false, col = '#2b2e34' } = {}) {
  const st = k.get('steel'), pl = k.get('plastic'), fb = k.get('fabric'); const cc = C(col), blk = C('#18191b');
  for (let i = 0; i < 5; i++) { const an = yaw + i * Math.PI * 2 / 5; const [lx, lz] = [x + Math.sin(an) * 0.15, z + Math.cos(an) * 0.15]; pl.box(lx, 0.075, lz, 0.045, 0.03, 0.3, { col: blk, rotY: an }); const [cx, cz] = [x + Math.sin(an) * 0.29, z + Math.cos(an) * 0.29]; pl.cylinder(cx, 0, cz, 0.024, 0.024, 0.05, 8, { col: blk }); }
  st.cylinder(x, 0.08, z, 0.024, 0.024, Math.max(0.05, top - 0.2), 10, { col: C('#9a9ea3') }); pl.cylinder(x, top - 0.16, z, 0.04, 0.04, 0.06, 10, { col: blk });
  const P = (dx, dz) => rot(x, z, yaw, dx, dz);
  { const [a, b] = P(0, 0); pl.box(a, top - 0.105, b, 0.36, 0.03, 0.34, { col: blk, rotY: yaw }); fb.box(a, top - 0.04, b, 0.5, 0.08, 0.48, { col: cc, rotY: yaw }); }
  { const bh = high ? 0.72 : 0.5; const [a, b] = P(0, -0.26); fb.box(a, top + 0.06 + bh / 2, b, 0.46, bh, 0.065, { col: cc, rotY: yaw }); const [c, d] = P(0, -0.29); pl.box(c, top + 0.03, d, 0.07, 0.2, 0.03, { col: blk, rotY: yaw }); }
  for (const sx of [-1, 1]) { const [a, b] = P(sx * 0.27, -0.03); pl.box(a, top + 0.08, b, 0.03, 0.18, 0.04, { col: blk, rotY: yaw }); pl.box(a, top + 0.185, b, 0.06, 0.03, 0.26, { col: blk, rotY: yaw }); }
}
// a computer monitor on a stand, its screen facing direction yaw (0 = +z)
function monitor(k, x, y, z, yaw, w = 0.52) {
  const pl = k.get('plastic'), blk = C('#141518'); const P = (dx, dz) => rot(x, z, yaw, dx, dz);
  { const [a, b] = P(0, -0.05); pl.box(a, y + 0.006, b, 0.22, 0.012, 0.17, { col: blk, rotY: yaw }); pl.box(a, y + 0.14, b, 0.04, 0.26, 0.025, { col: blk, rotY: yaw }); }
  pl.box(x, y + 0.3, z, w, w * 0.6, 0.024, { col: blk, rotY: yaw });
  const [sx, sz] = P(0, 0.0125); const g = k.get('emissive'); g.box(sx, y + 0.305, sz, w - 0.03, w * 0.6 - 0.04, 0.002, { col: [0.5, 0.58, 0.68], rotY: yaw });
}
function keyboard(k, x, y, z, yaw) { k.get('plastic').box(x, y + 0.012, z, 0.43, 0.02, 0.14, { col: C('#1d1f23'), rotY: yaw }); const [mx, mz] = rot(x, z, yaw, 0.32, 0.0); k.get('plastic').box(mx, y + 0.012, mz, 0.06, 0.022, 0.1, { col: C('#1d1f23'), rotY: yaw }); }
function deskPhone(k, x, y, z, yaw) { const pl = k.get('plastic'), c = C('#26282c'); pl.box(x, y + 0.03, z, 0.2, 0.06, 0.18, { col: c, rotY: yaw }); const [hx, hz] = rot(x, z, yaw, -0.05, 0); pl.box(hx, y + 0.075, hz, 0.06, 0.04, 0.2, { col: c, rotY: yaw }); }
function plant(k, x, z, h = 1.2, potCol = '#e9e5dc') { // potted plant: glazed pot + a clump of leaves
  lathe(k.get('glaze'), x, 0, z, [[0.16, 0], [0.2, 0.36], [0.215, 0.4], [0.001, 0.4]], 18, C(potCol));
  const lf = k.get('paint'); for (let i = 0; i < 9; i++) { const an = i * 2.4, r = 0.06 + (i % 3) * 0.05; const ly = 0.45 + (h - 0.45) * (0.35 + (i % 4) * 0.18); lf.box(x + Math.sin(an) * r, ly, z + Math.cos(an) * r, 0.05, h * 0.45, 0.16, { col: C(i % 2 ? '#3e6b3a' : '#4d7d45'), rotY: an }); }
}

// ------------------------------------------------------------------------------------------------ the room
export function buildBankInterior(game, site) {
  const B = BANK_ROOM; let W = B.W, D = B.D; const H = B.H;
  if (site && site.b) { const b = site.b, ns = Math.abs(Math.cos(site.yaw)) > 0.7; W = Math.min(W, (ns ? b.x1 - b.x0 : b.z1 - b.z0) - 0.5); D = Math.min(D, (ns ? b.z1 - b.z0 : b.x1 - b.x0) - 0.6); }
  if (W < 13.9 || D < 13.3) console.warn('[bank] building smaller than the design room', W, D);
  const g = new THREE.Group(); g.name = 'bank-hall'; const k = new Kit(); const obs = [];
  const atlas = interiorAtlas(), posters = posterAtlas();
  const signMat = new THREE.MeshStandardMaterial({ name: 'CMB interior signs', map: atlas, color: atlas ? 0xffffff : new THREE.Color(CMB.navy), roughness: 0.5, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: atlas ? 0.32 : 0 });
  const dayMat = new THREE.MeshStandardMaterial({ name: 'CMB frontage glazing (inside)', map: atlas, color: atlas ? 0xffffff : 0xdfe5e8, roughness: 0.6, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: atlas ? 0.9 : 0.4 });
  const printMat = new THREE.MeshStandardMaterial({ name: 'CMB posters', map: posters, color: posters ? 0xffffff : 0xe8e4da, roughness: 0.62 });
  const glassMat = new THREE.MeshStandardMaterial({ name: 'CMB clear glass', color: 0xdfe9ec, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.2, transparent: true, opacity: 0.16, depthWrite: false });
  for (const m of [signMat, dayMat, printMat, glassMat]) m.userData.own = true;
  Object.assign(k.extra, { cmbSign: signMat, cmbDay: dayMat, cmbPrint: printMat, cmbGlass: glassMat });
  const sign = k.get('cmbSign'), day = k.get('cmbDay'), prints = k.get('cmbPrint'), cglass = k.get('cmbGlass');
  const S = shell(k, g, W, D, H, { floor: { kind: 'granite', size: 0.6, colors: ['#dcd7cc', '#d4cec2', '#d9d3c7'], grout: '#a9a296', rough: 0.12, seed: 67 }, wall: 'plaster', wallCol: '#efeae1', ceil: '#f2f0ea', skirt: 'marbleDark', skirtCol: '#ffffff', cornice: '#f4f1ea' });
  const { x0, x1, z0, zf } = S; const xR = x1, xL = x0;
  const ob = (ax0, ax1, d0, d1) => obs.push({ x0: Math.min(ax0, ax1), x1: Math.max(ax0, ax1), z0: Z(Math.max(d0, d1)), z1: Z(Math.min(d0, d1)) });
  const navy = C(CMB.navy), gold = C(CMB.gold), bronze = C('#2e2a26'), steelC = C('#b9bdc1');
  const paint = k.get('paint'), metal = k.get('steel'), glass = cglass, emis = k.get('emissive'), wal = k.get('walnut'), mrbD = k.get('marbleDark'), mrb = k.get('marble'), pl = k.get('plastic'), chrome = k.get('chrome'), brass = k.get('gold');

  // ---- ceiling: tiles + LED panels; ATM soffit; counter bulkhead
  k.get('ceilTile').hrect(x0, z0, x1, zf, H - 0.004, 0.6, WHITE, true);
  const led = (x, d) => { emis.box(x, H - 0.012, Z(d), 0.56, 0.012, 0.56, { col: [1, 0.98, 0.94] }); paint.box(x, H - 0.01, Z(d), 0.6, 0.008, 0.6, { col: C('#d8d8d4') }); };
  for (const x of [-1.6, 1.6, 4.8]) led(x, 2.0); for (const x of [-4.8, -1.6, 1.6, 4.8]) { led(x, 5.6); led(x, 7.4); led(x, 11.4); }
  for (const [x, d] of [[-2.4, 1.0], [3.2, 6.4]]) { paint.box(x, H - 0.01, Z(d), 1.2, 0.008, 0.1, { col: C('#cfcfca') }); paint.box(x, H - 0.012, Z(d), 1.12, 0.006, 0.04, { col: C('#3a3c3f') }); } // linear aircon diffusers
  for (const [x, d] of [[-2.6, 1.3], [3.6, 7.6]]) { lathe(pl, x, H - 0.09, Z(d), [[0.001, 0], [0.05, 0.004], [0.075, 0.03], [0.08, 0.06], [0.09, 0.09], [0.001, 0.09]], 16, C('#ecebe8')); } // CCTV domes
  { const sx0 = xL, sx1 = -3.8, sd0 = 0, sd1 = 4.4, sy = H - 0.28; paint.box((sx0 + sx1) / 2, sy + 0.14, Z((sd0 + sd1) / 2), sx1 - sx0, 0.28, sd1 - sd0, { col: C('#f2f0ea'), top: false, bottom: true });
    paint.box(sx1 - 0.01, sy + 0.14, Z((sd0 + sd1) / 2), 0.03, 0.28, sd1 - sd0, { col: navy }); paint.box((sx0 + sx1) / 2, sy + 0.14, Z(sd1) - 0.01, sx1 - sx0, 0.28, 0.03, { col: navy });
    for (const d of B.atmD) for (const dx of [-5.65, -4.6]) { emis.cylinder(dx, sy - 0.004, Z(d), 0.06, 0.06, 0.006, 14, { col: [0.95, 0.97, 1] }); chrome.cylinder(dx, sy - 0.002, Z(d), 0.08, 0.08, 0.004, 14, { col: WHITE }); }
    // hanging ATM sign under the soffit edge (both faces)
    const hx = (sx0 + sx1) / 2 + 0.6; for (const sx of [-0.4, 0.4]) metal.box(hx + sx, sy - 0.12, Z(sd1) - 0.06, 0.01, 0.24, 0.01, { col: steelC });
    paint.box(hx, sy - 0.42, Z(sd1) - 0.06, 1.12, 0.32, 0.03, { col: navy }); face(sign, hx, sy - 0.42, Z(sd1) - 0.06 - 0.016, 1.08, 0.28, IN_UV.atmHang, '-z'); face(sign, hx, sy - 0.42, Z(sd1) - 0.06 + 0.016, 1.08, 0.28, IN_UV.atmHang, '+z'); }
  const bulkY = H - 0.4; { paint.box(0, bulkY + 0.2, Z(9.0), W, 0.4, 0.8, { col: C('#f2f0ea'), top: false, bottom: true }); paint.box(0, bulkY + 0.2, Z(8.6) + 0.012, W, 0.4, 0.025, { col: navy }); metal.box(0, bulkY + 0.012, Z(8.6) + 0.026, W, 0.012, 0.006, { col: gold }); }

  // ---- inner face of the glazed frontage: daylight through vertical blinds, bronze mullions
  for (const sgn of [-1, 1]) { const a = sgn * 1.3, b = sgn * 6.4, cx = (a + b) / 2, w = Math.abs(b - a); const z = zf - 0.006;
    face(day, cx, 1.75, z, w, 2.5, [IN_UV.blinds[0], IN_UV.blinds[1], IN_UV.blinds[0] + (IN_UV.blinds[2] - IN_UV.blinds[0]) * (w / 6), IN_UV.blinds[3]], '-z');
    paint.box(cx, 0.48, z - 0.03, w + 0.08, 0.06, 0.07, { col: bronze }); paint.box(cx, 3.02, z - 0.03, w + 0.08, 0.06, 0.07, { col: bronze });
    const n = Math.round(w / 1.27); for (let i = 0; i <= n; i++) paint.box(a + (b - a) * i / n, 1.75, z - 0.03, 0.06, 2.5, 0.07, { col: bronze });
    mrb.box(cx, 0.46, z - 0.08, w + 0.1, 0.03, 0.14, { col: WHITE }); }
  paint.box(0, 2.42, zf - 0.03, 1.5, 0.08, 0.06, { col: bronze }); // door head trim inside

  // ---- ATM lobby: navy surround with two through-the-wall ATMs, glass privacy fin, bin
  const AX = B.atmFace; { const d0 = 0.7, d1 = 4.1; paint.box((xL + AX) / 2, 1.25, Z((d0 + d1) / 2), AX - xL, 2.5, d1 - d0, { col: navy }); metal.box((xL + AX) / 2 + 0.01, 2.51, Z((d0 + d1) / 2), AX - xL + 0.02, 0.02, d1 - d0 + 0.02, { col: gold });
    paint.box(AX + 0.012, 0.05, Z((d0 + d1) / 2), 0.025, 0.1, d1 - d0, { col: C('#0b1528') }); ob(xL, AX + 0.3, d0, d1); }
  const atms = B.atmD.map((d, i) => { const z = Z(d);
    face(sign, AX + 0.004, 2.18, z, 0.78, 0.2, IN_UV.atmHead, '+x');
    metal.box(AX + 0.035, 1.25, z, 0.07, 1.4, 0.72, { col: C('#c3c7cb') }); paint.box(AX + 0.075, 0.28, z, 0.15, 0.56, 0.76, { col: C('#1a2c4c') }); // fascia · kick panel
    pl.box(AX + 0.09, 1.38, z, 0.04, 0.42, 0.46, { col: C('#121315') }); // screen bezel
    pl.box(AX + 0.16, 1.605, z, 0.14, 0.015, 0.47, { col: C('#1b1c1f') }); for (const s of [-1, 1]) pl.box(AX + 0.15, 1.39, z + s * 0.228, 0.12, 0.43, 0.012, { col: C('#1b1c1f') }); // privacy hood
    for (let j = 0; j < 4; j++) for (const s of [-1, 1]) metal.box(AX + 0.113, 1.25 + j * 0.08, z + s * 0.195, 0.012, 0.024, 0.036, { col: C('#d9dcdf') }); // side function keys
    metal.box(AX + 0.18, 1.04, z, 0.22, 0.04, 0.6, { col: C('#aeb2b6') }); // keypad shelf
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) metal.box(AX + 0.14 + r * 0.035, 1.066, z + 0.1 - c * 0.045, 0.026, 0.012, 0.036, { col: C('#e4e6e8') });
    [['#b8352c', 0], ['#d9b42a', 1], ['#2f8a4a', 2]].forEach(([col, r]) => pl.box(AX + 0.14 + r * 0.045, 1.066, z - 0.06, 0.034, 0.012, 0.05, { col: C(col) })); // cancel · clear · enter
    for (const [dz, dw] of [[0.155, 0.01], [-0.115, 0.01]]) pl.box(AX + 0.19, 1.11, z + dz, 0.16, 0.09, dw, { col: C('#1b1c1f') }); pl.box(AX + 0.27, 1.11, z + 0.02, 0.01, 0.09, 0.28, { col: C('#1b1c1f') }); // keypad privacy shield
    pl.box(AX + 0.09, 1.3, z - 0.3, 0.05, 0.06, 0.1, { col: C('#202226') }); emis.box(AX + 0.116, 1.3, z - 0.3, 0.002, 0.012, 0.07, { col: [0.3, 1, 0.45] }); // card reader, lit throat
    pl.box(AX + 0.075, 1.46, z - 0.3, 0.012, 0.012, 0.09, { col: C('#0c0c0d') }); // receipt slot
    pl.box(AX + 0.074, 0.9, z, 0.012, 0.08, 0.36, { col: C('#0c0c0d') }); for (const [dy, h] of [[0.945, 0.01], [0.855, 0.01]]) chrome.box(AX + 0.075, dy, z, 0.016, h, 0.38, { col: WHITE }); emis.box(AX + 0.076, 0.965, z, 0.002, 0.008, 0.3, { col: [0.3, 1, 0.45] }); // cash slot
    pl.box(AX + 0.074, 0.72, z + 0.05, 0.012, 0.02, 0.3, { col: C('#0c0c0d') }); // deposit slot
    pl.box(AX + 0.11, 1.645, z, 0.01, 0.014, 0.014, { col: C('#050505') }); // camera
    face(sign, AX + 0.072, 1.78, z, 0.14, 0.14, IN_UV.logo, '+x');
    // the screen: its own mesh (canvas, repainted by the ATM interface)
    let screen = null; if (hasCanvas()) { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 192; const ctx = cv.getContext('2d'); drawATMScreen(ctx, 256, 192, ATM_IDLE_VIEW); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex }); mat.userData.own = true; const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.225), mat); mesh.position.set(AX + 0.111, 1.385, z); mesh.rotation.y = Math.PI / 2; mesh.name = 'atm-screen-' + i; g.add(mesh); screen = { cv, ctx, tex, mesh }; }
    return { i, d, z, stand: [B.atmStandX, z], user: null, player: false, screen, paint(view) { if (!this.screen) return; drawATMScreen(this.screen.ctx, 256, 192, view || ATM_IDLE_VIEW); this.screen.tex.needsUpdate = true; } }; });
  { const fz = Z((B.atmD[0] + B.atmD[1]) / 2); glass.box(AX + 0.32, 1.5, fz, 0.6, 1.2, 0.02); metal.box(AX + 0.62, 1.5, fz, 0.02, 1.22, 0.03, { col: steelC }); ob(AX, AX + 0.64, (B.atmD[0] + B.atmD[1]) / 2 - 0.03, (B.atmD[0] + B.atmD[1]) / 2 + 0.03); }
  metal.cylinder(-6.72, 0, Z(4.45), 0.16, 0.15, 0.62, 16, { col: C('#9fa3a7') }); pl.cylinder(-6.72, 0.62, Z(4.45), 0.165, 0.165, 0.02, 16, { col: C('#202124') }); ob(-6.9, -6.54, 4.27, 4.63);
  paint.box(-4.9, 0.002, Z(4.35), 2.6, 0.003, 0.06, { col: C('#d9b42a') }); // "please wait behind the line" floor stripe

  // ---- queue-ticket kiosk
  { const x = -1.5, z = Z(2.22); metal.box(x, 0.65, z, 0.4, 1.3, 0.3, { col: C('#d7d9db') }); paint.box(x, 0.02, z, 0.46, 0.04, 0.36, { col: C('#2a2c30') }); paint.box(x, 1.32, z, 0.42, 0.06, 0.32, { col: navy });
    face(sign, x, 1.08, z + 0.152, 0.32, 0.16, IN_UV.kiosk, '+z'); pl.box(x, 0.84, z + 0.152, 0.14, 0.012, 0.01, { col: C('#0c0c0d') }); face(sign, x, 1.32, z + 0.162, 0.1, 0.05, IN_UV.logo, '+z'); ob(x - 0.22, x + 0.22, 2.06, 2.38); }

  // ---- reception / enquiries desk
  const REC = { x: 2.3, d: 3.0 }; { const x = REC.x, cz = Z(3.05), w = 2.2;
    wal.box(x, 0.55, cz, w, 1.1, 0.2, { col: WHITE }); mrb.box(x, 1.12, cz, w + 0.06, 0.04, 0.26, { col: WHITE }); paint.box(x, 0.9, Z(2.95) + 0.004, w, 0.1, 0.006, { col: navy }); metal.box(x, 0.84, Z(2.95) + 0.005, w, 0.008, 0.004, { col: gold });
    face(sign, x, 0.52, Z(2.95) + 0.006, 0.34, 0.34, IN_UV.logo, '+z'); paint.box(x, 0.04, Z(2.97), w - 0.04, 0.08, 0.04, { col: C('#1b1d21') });
    paint.box(x, 0.735, Z(3.42), w, 0.03, 0.56, { col: C('#ebe7df') }); for (const sx of [-1, 1]) wal.box(x + sx * (w / 2 - 0.02), 0.36, Z(3.42), 0.04, 0.72, 0.56, { col: WHITE });
    monitor(k, x + 0.35, 0.75, Z(3.3), Math.PI, 0.46); keyboard(k, x + 0.25, 0.75, Z(3.55), Math.PI); deskPhone(k, x - 0.55, 0.75, Z(3.4), Math.PI);
    pl.box(x - 0.75, 1.15, cz, 0.1, 0.03, 0.07, { col: C('#d8d6d0') }); face(prints, x - 0.2, 1.215, Z(3.08), 0.08, 0.12, POSTER_UV.brochure(0), '+z'); metal.box(x - 0.2, 1.17, Z(3.1), 0.09, 0.1, 0.04, { col: steelC }); // card holder · leaflet stand
    lathe(k.get('glaze'), x + 0.85, 1.14, cz, [[0.05, 0], [0.06, 0.1], [0.001, 0.1]], 12, C('#f4f2ee')); for (let i = 0; i < 4; i++) paint.box(x + 0.85 + (i - 1.5) * 0.02, 1.38, cz, 0.012, 0.36, 0.01, { col: C('#4c7a3f') }); for (let i = 0; i < 5; i++) paint.box(x + 0.83 + i * 0.012, 1.5 + i * 0.03, cz + 0.02, 0.05, 0.035, 0.012, { col: C(i % 2 ? '#e9e4f0' : '#d8c8e8') }); // orchid
    for (const sx of [-0.45, 0.45]) metal.box(x + sx, 3.1, Z(3.2), 0.01, 0.55 + (H - 3.6), 0.01, { col: steelC }); paint.box(x, 2.72, Z(3.2), 1.04, 0.52, 0.03, { col: navy });
    face(sign, x, 2.72, Z(3.2) + 0.016, 1.0, 0.48, IN_UV.enquiries, '+z'); face(sign, x, 2.72, Z(3.2) - 0.016, 1.0, 0.48, IN_UV.enquiries, '-z');
    ob(x - w / 2 - 0.05, x + w / 2 + 0.05, 2.9, 4.6); }

  // ---- right wall: plant, posters, brochure rack · left wall: water dispenser, notice, clock, plant
  plant(k, 6.55, Z(0.6), 1.3); ob(6.3, 6.8, 0.35, 0.85);
  paint.box(xR - 0.012, 1.6, Z(1.5), 0.02, 0.94, 0.64, { col: C('#c9b27a') }); face(prints, xR - 0.024, 1.6, Z(1.5), 0.6, 0.9, POSTER_UV.fd, '-x');
  paint.box(xR - 0.012, 1.6, Z(3.9), 0.02, 0.94, 0.64, { col: C('#c9b27a') }); face(prints, xR - 0.024, 1.6, Z(3.9), 0.6, 0.9, POSTER_UV.home, '-x');
  { const z = Z(2.7); metal.box(xR - 0.11, 1.25, z, 0.2, 0.9, 0.62, { col: C('#c8cbce'), top: true }); for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const zz = z - 0.22 + c * 0.145, yy = 1.1 + r * 0.38; glass.box(xR - 0.2, yy, zz, 0.012, 0.16, 0.13); face(prints, xR - 0.17, yy + 0.06, zz, 0.12, 0.16, POSTER_UV.brochure(r * 4 + c), '-x'); } ob(xR - 0.24, xR, 2.36, 3.04); }
  { const x = -6.72, z = Z(5.6); paint.box(x, 0.52, z, 0.32, 1.04, 0.32, { col: C('#ecebe7') }); pl.box(x, 0.82, z + 0.162, 0.2, 0.08, 0.01, { col: C('#2c2e32') }); for (const [dx, col] of [[-0.05, '#2f6fb0'], [0.05, '#b0322a']]) pl.box(x + dx, 0.8, z + 0.17, 0.03, 0.04, 0.03, { col: C(col) });
    glass.box(x, 1.25, z, 0.26, 0.42, 0.26); pl.box(x, 1.04, z, 0.3, 0.02, 0.3, { col: C('#d8d8d4') }); ob(x - 0.2, x + 0.2, 5.4, 5.8); }
  paint.box(xL + 0.012, 1.6, Z(6.7), 0.02, 0.44, 0.84, { col: C('#c9b27a') }); face(prints, xL + 0.024, 1.6, Z(6.7), 0.8, 0.4, POSTER_UV.notice, '+x');
  face(sign, xL + 0.01, 2.7, Z(6.7), 0.42, 0.42, IN_UV.clock, '+x');
  plant(k, -6.5, Z(7.95), 1.5); ob(-6.78, -6.22, 7.67, 8.23);

  // ---- waiting area: pedestal chairs; the seat + back is one instanced top raised / lowered to each sitter (gas lift)
  const seats = []; { const ROWS = [5.3, 6.6]; const XS = [-5.3, -4.64, -3.98, -3.32, 1.4, 2.06, 2.72, 3.38];
    for (const d of ROWS) for (const x of XS) seats.push({ x, d, z: Z(d), yaw: Math.PI, top: 0.42, occ: null, lane: d === ROWS[0] ? 5.95 : 7.25 });
    const tb = new MeshBuilder(); tb.box(0, -0.04, 0, 0.5, 0.08, 0.48, { col: C('#1f3556') }); tb.box(0, 0.25, -0.23, 0.48, 0.44, 0.06, { col: C('#1f3556') }); tb.box(0, -0.095, 0, 0.44, 0.03, 0.42, { col: C('#232427') }); tb.box(0, 0.25, -0.265, 0.44, 0.4, 0.012, { col: C('#232427') });
    tb.cylinder(0, -0.36, 0, 0.028, 0.028, 0.25, 10, { col: C('#9ea2a6') }); for (const sx of [-1, 1]) { tb.box(sx * 0.27, 0.1, -0.02, 0.035, 0.22, 0.04, { col: C('#232427') }); tb.box(sx * 0.27, 0.215, 0.0, 0.06, 0.03, 0.34, { col: C('#232427') }); }
    const geo = tb.build(); const im = new THREE.InstancedMesh(geo, kitMaterial('fabric', KIT.fabric), seats.length); im.name = 'bank-waiting-chairs'; im.receiveShadow = true; im.castShadow = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const setTop = (i, top) => { const s = seats[i]; s.top = top; im.setMatrixAt(i, m4.compose(v.set(s.x, top, s.z), q, one)); im.instanceMatrix.needsUpdate = true; };
    seats.forEach((s, i) => { setTop(i, s.top); chrome.cylinder(s.x, 0.02, s.z, 0.035, 0.035, 0.24, 10, { col: WHITE }); pl.cylinder(s.x, 0, s.z, 0.22, 0.24, 0.02, 18, { col: C('#202124') }); });
    g.add(im); seats.setTop = setTop; seats.mesh = im;
    for (const d of ROWS) { ob(-5.62, -3.0, d - 0.3, d + 0.28); ob(1.08, 3.7, d - 0.3, d + 0.28); }
    }

  // ---- manager's office (glass partition, open doorway on the hall side); counter 4's queue space in front of it stays open
  const OF = { x0: 4.6, x1: xR, d0: 4.8, d1: 7.3, door: [6.35, 7.22] }; {
    const band = (cx, cz, w, d) => { for (const s2 of [-1, 1]) paint.box(cx + (d > w ? s2 * 0.012 : 0), 1.25, cz + (w >= d ? s2 * 0.012 : 0), Math.max(w, 0.004), 0.32, Math.max(d, 0.004), { col: C('#f4f4f2') }); }; // frosted manifestation band
    const gx = (zz, xa, xb) => { const cx = (xa + xb) / 2, w = xb - xa; cglass.box(cx, H / 2, zz, w, H - 0.02, 0.02); paint.box(cx, 0.04, zz, w, 0.08, 0.06, { col: bronze }); paint.box(cx, H - 0.03, zz, w, 0.06, 0.06, { col: bronze }); band(cx, zz, w, 0.004); };
    const gz = (xx, da, db) => { const cz = Z((da + db) / 2), d = db - da; cglass.box(xx, H / 2, cz, 0.02, H - 0.02, d); paint.box(xx, 0.04, cz, 0.06, 0.08, d, { col: bronze }); paint.box(xx, H - 0.03, cz, 0.06, 0.06, d, { col: bronze }); band(xx, cz, 0.004, d); };
    gx(Z(OF.d0), OF.x0, OF.x1); gx(Z(OF.d1), OF.x0, OF.x1); gz(OF.x0, OF.d0, OF.door[0]); gz(OF.x0, OF.door[1], OF.d1);
    for (const [px, d] of [[OF.x0, OF.d0], [OF.x0, OF.door[0]], [OF.x0, OF.door[1]], [OF.x0, OF.d1]]) paint.box(px, H / 2, Z(d), 0.07, H, 0.07, { col: bronze });
    paint.box(OF.x0, 2.3 + (H - 2.3) / 2, Z((OF.door[0] + OF.door[1]) / 2), 0.08, H - 2.3, OF.door[1] - OF.door[0], { col: C('#efeae1') }); // transom over the doorway
    paint.box(OF.x0 - 0.045, 2.55, Z((OF.door[0] + OF.door[1]) / 2), 0.012, 0.3, 0.92, { col: C('#d8d4ca') }); face(sign, OF.x0 - 0.052, 2.55, Z((OF.door[0] + OF.door[1]) / 2), 0.88, 0.22, IN_UV.office, '-x');
    // furniture: walnut desk, executive chair (built to the manager, below), two visitor chairs, credenza, plant, framed logo
    const dx = 6.1, dz = Z(5.95); wal.box(dx, 0.73, dz, 1.2, 0.04, 0.66, { col: WHITE }); for (const sx of [-1, 1]) wal.box(dx + sx * 0.58, 0.36, dz, 0.04, 0.72, 0.64, { col: WHITE }); wal.box(dx, 0.45, dz - 0.3, 1.12, 0.5, 0.02, { col: WHITE });
    monitor(k, dx + 0.28, 0.75, Z(6.1), 0, 0.46); keyboard(k, dx + 0.1, 0.75, Z(5.78), 0); deskPhone(k, dx - 0.42, 0.75, Z(5.85), 0); paint.box(dx - 0.12, 0.755, Z(6.05), 0.21, 0.01, 0.3, { col: C('#f6f4ee') }); brass.cylinder(dx - 0.3, 0.75, Z(6.15), 0.015, 0.015, 0.12, 8, { col: WHITE });
    for (const vx of [5.75, 6.45]) officeChair(k, vx, Z(6.68), 0, 0.45, { col: '#1f3556' });
    metal.box(xR - 0.16, 0.38, Z(5.15), 0.3, 0.76, 0.62, { col: C('#d7d5cf') }); wal.box(xR - 0.16, 0.77, Z(5.15), 0.32, 0.02, 0.64, { col: WHITE }); plant(k, 4.95, Z(5.15), 1.1);
    paint.box(xR - 0.012, 1.75, Z(5.15), 0.02, 0.56, 0.56, { col: C('#1b1612') }); face(sign, xR - 0.024, 1.75, Z(5.15), 0.5, 0.5, IN_UV.logo, '-x');
    ob(OF.x0, OF.x1, OF.d0 - 0.04, OF.d0 + 0.04); ob(OF.x0, OF.x1, OF.d1 - 0.04, OF.d1 + 0.04); ob(OF.x0 - 0.04, OF.x0 + 0.04, OF.d0, OF.door[0]); ob(OF.x0 - 0.04, OF.x0 + 0.04, OF.door[1], OF.d1);
    ob(5.48, 6.72, 5.62, 6.28); ob(5.78, 6.42, 4.84, 5.6); ob(5.45, 6.75, 6.36, 6.98); ob(xR - 0.32, xR, 4.84, 5.46); ob(4.7, 5.2, 4.9, 5.4); }

  // ---- teller counter, security glass, staff door
  const WINX = B.windows, cE = 6.15; { const cx = (xL + cE) / 2, cw = cE - xL;
    wal.box(cx, 0.5, Z(9.01), cw, 1.0, 0.78, { col: WHITE }); paint.box(cx, 0.05, Z(8.6) + 0.004, cw, 0.1, 0.012, { col: C('#14161a') }); metal.box(cx, 0.92, Z(8.6) + 0.006, cw, 0.012, 0.006, { col: gold });
    mrbD.box(cx, 1.02, Z(8.98), cw, 0.04, 0.86, { col: WHITE });
    for (let i = 0; i < 4; i++) { const wx = WINX[i]; paint.box(wx, 0.62, Z(8.6) + 0.008, 0.9, 0.36, 0.006, { col: navy }); face(sign, wx, 0.62, Z(8.6) + 0.012, 0.34, 0.17, IN_UV.counter(i), '+z'); }
    // glass to the bulkhead, steel posts at the fins, speech grilles, cash trays, card terminals, pens on chains
    glass.box(cx, (1.04 + bulkY) / 2, Z(9.0), cw, bulkY - 1.04, 0.025); metal.box(cx, 1.05, Z(9.0), cw, 0.02, 0.05, { col: steelC });
    for (const fx of [xL + 0.03, -3.3, 0, 3.3, cE]) metal.box(fx, (1.04 + bulkY) / 2, Z(9.0), 0.05, bulkY - 1.04, 0.05, { col: steelC });
    for (const fx of [-3.3, 0, 3.3]) { paint.box(fx, 1.58, Z(8.6), 0.05, 1.08, 0.8, { col: navy }); metal.box(fx, 2.13, Z(8.6), 0.06, 0.02, 0.82, { col: gold }); ob(fx - 0.04, fx + 0.04, 8.2, 8.6); }
    for (let i = 0; i < 4; i++) { const wx = WINX[i]; chrome.box(wx, 1.45, Z(9.0) + 0.014, 0.18, 0.14, 0.004, { col: C('#d0d3d6') }); for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) pl.box(wx - 0.06 + c * 0.03, 1.405 + r * 0.03, Z(9.0) + 0.017, 0.012, 0.012, 0.002, { col: C('#2a2c30') });
      metal.box(wx, 1.045, Z(9.0), 0.4, 0.012, 0.32, { col: C('#9ea2a6') }); metal.box(wx, 1.06, Z(8.86), 0.4, 0.03, 0.01, { col: C('#9ea2a6') });
      pl.box(wx + 0.38, 1.07, Z(8.74), 0.09, 0.05, 0.17, { col: C('#202226') }); emis.box(wx + 0.38, 1.096, Z(8.7), 0.06, 0.002, 0.05, { col: [0.45, 0.6, 0.55] });
      pl.box(wx - 0.4, 1.045, Z(8.72), 0.03, 0.01, 0.03, { col: C('#202226') }); pl.box(wx - 0.38, 1.047, Z(8.7), 0.012, 0.012, 0.14, { col: C('#1d3b7a'), rotY: 0.4 });
      face(sign, wx, H - 0.2, Z(8.6) + 0.03, 0.68, 0.34, IN_UV.counter(i), '+z'); }
    face(sign, 0, H - 0.2, Z(8.6) + 0.03, 0.9, 0.22, IN_UV.serving, '+z');
    face(sign, WINX[3], 1.32, Z(9.0) - 0.016, 0.4, 0.2, IN_UV.closed, '+z'); paint.box(WINX[3], 1.32, Z(9.0) - 0.022, 0.42, 0.22, 0.008, { col: C('#f4f2ec') }); metal.box(WINX[3], 1.13, Z(9.04), 0.18, 0.16, 0.02, { col: steelC }); // closed plate on its stand
    // staff door (glazed partition above)
    const dx0 = cE, dx1 = xR, dcx = (dx0 + dx1) / 2; paint.box(dx0 + 0.03, 1.05, Z(9.0), 0.06, 2.1, 0.12, { col: bronze }); paint.box(dx1 - 0.03, 1.05, Z(9.0), 0.06, 2.1, 0.12, { col: bronze }); paint.box(dcx, 2.13, Z(9.0), dx1 - dx0, 0.06, 0.12, { col: bronze });
    wal.box(dcx, 1.04, Z(9.0), dx1 - dx0 - 0.14, 2.04, 0.045, { col: WHITE }); face(sign, dcx, 1.55, Z(9.0) + 0.024, 0.32, 0.16, IN_UV.staff, '+z'); brass.box(dx0 + 0.16, 1.05, Z(9.0) + 0.04, 0.02, 0.02, 0.12, { col: WHITE }); brass.box(dx0 + 0.16, 1.05, Z(9.0) + 0.1, 0.12, 0.02, 0.02, { col: WHITE });
    pl.box(dx1 - 0.16, 1.3, Z(9.0) + 0.03, 0.07, 0.11, 0.02, { col: C('#202226') }); emis.box(dx1 - 0.16, 1.33, Z(9.0) + 0.041, 0.012, 0.012, 0.002, { col: [1, 0.2, 0.15] }); // card-access reader
    glass.box(dcx, (2.16 + bulkY) / 2, Z(9.0), dx1 - dx0 - 0.02, bulkY - 2.16, 0.025);
    ob(xL, xR, 8.6, D); }

  // ---- staff side: work surface, pedestals, workstations, teller chairs (built to the tellers), back wall
  const stand = { tellers: [], recep: null, mgr: null, sup: null, guard: null };
  const staffSpecs = [makeBankStaffAppearance(6701, { sex: 'f' }), makeBankStaffAppearance(6702, { sex: 'm' }), makeBankStaffAppearance(6703, { sex: 'f' })];
  { const cx = (xL + cE) / 2, cw = cE - xL; paint.box(cx, 0.735, Z(9.7), cw, 0.03, 0.6, { col: C('#ebe7df') });
    for (const px of [xL + 0.3, -3.3, 0, 3.3, cE - 0.3]) metal.box(px, 0.36, Z(9.68), 0.44, 0.72, 0.52, { col: C('#c9ccd0') });
    for (let i = 0; i < 4; i++) { const wx = WINX[i]; monitor(k, wx - 0.28, 0.75, Z(9.55), Math.PI); keyboard(k, wx - 0.05, 0.75, Z(9.86), Math.PI);
      pl.box(wx + 0.42, 0.85, Z(9.62), 0.26, 0.2, 0.24, { col: C('#9a9ea4') }); pl.box(wx + 0.42, 0.96, Z(9.66), 0.18, 0.02, 0.1, { col: C('#202226') }); // note counter
      pl.box(wx + 0.75, 0.81, Z(9.6), 0.16, 0.12, 0.2, { col: C('#dcdcd8') }); deskPhone(k, wx - 0.75, 0.75, Z(9.65), Math.PI); pl.box(wx + 0.5, 0.66, Z(9.75), 0.4, 0.1, 0.4, { col: C('#2a2c30') }); // printer · phone · cash drawer
      paint.box(wx + 1.05, 0.76, Z(9.75), 0.24, 0.02, 0.32, { col: C('#f6f4ee') }); }
    staffSpecs.forEach((sp, i) => { const ch = new Character(sp); const top = Math.max(0.3, Math.min(0.55, seatTopFor(ch))); const wx = WINX[B.staffed[i]];
      officeChair(k, wx, Z(10.35), 0, top); ch.root.position.set(wx, 0, Z(10.35) - 0.04); ch.root.rotation.y = 0; g.add(ch.root); ch.anim.seated = true;
      stand.tellers.push({ ch, win: B.staffed[i], x: wx, rnd: rngOf(6710 + i), serving: null, act: null, actT: 0 }); });
    for (const wx of [WINX[3]]) officeChair(k, wx, Z(10.45), 0.3, 0.45);
    // back wall: lit feature band, vault door, filing cabinets, copier
    paint.box(0, 2.1, z0 + 0.025, 6.4, 1.8, 0.05, { col: navy }); for (const [y, h] of [[1.2, 0.012], [3.0, 0.012]]) metal.box(0, y, z0 + 0.052, 6.4, h, 0.006, { col: gold }); face(sign, 0, 2.1, z0 + 0.054, 4.8, 1.2, IN_UV.wordmark, '+z');
    emis.box(0, 3.06, z0 + 0.07, 6.2, 0.01, 0.02, { col: [1, 0.92, 0.78] });
    { const vx = -5.1, vy = 1.12, vz = z0 + 0.08; metal.box(vx, vy, z0 + 0.04, 1.8, 2.2, 0.08, { col: C('#7d8287') }); const st = k.get('steel'), M = new THREE.Matrix4(), Q = new THREE.Quaternion();
      const disc = (r, h, zoff, col, seg = 36) => { const geo = new THREE.CylinderGeometry(r, r, h, seg); st.geometry(geo, M.compose(new THREE.Vector3(vx, vy, vz + zoff), Q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1)), C(col)); geo.dispose(); };
      disc(0.86, 0.06, 0.0, '#9aa0a6'); disc(0.78, 0.12, 0.06, '#b8bdc2'); disc(0.12, 0.08, 0.15, '#d4d7da', 18);
      for (let i = 0; i < 3; i++) { const geo = new THREE.BoxGeometry(0.9, 0.05, 0.04); st.geometry(geo, M.compose(new THREE.Vector3(vx, vy, vz + 0.2), Q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), i * Math.PI / 3), new THREE.Vector3(1, 1, 1)), C('#d4d7da')); geo.dispose(); }
      for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2; st.box(vx + Math.cos(an) * 0.7, vy + Math.sin(an) * 0.7, vz + 0.125, 0.04, 0.04, 0.02, { col: C('#8d9297') }); } }
    for (let i = 0; i < 4; i++) { const fx = 3.75 + i * 0.52; metal.box(fx, 0.66, z0 + 0.32, 0.5, 1.32, 0.6, { col: C('#8f949a') }); for (let j = 0; j < 4; j++) { paint.box(fx, 0.2 + j * 0.31, z0 + 0.622, 0.46, 0.006, 0.006, { col: C('#5e6268') }); metal.box(fx, 0.3 + j * 0.31, z0 + 0.63, 0.12, 0.02, 0.02, { col: C('#d4d7da') }); } }
    { const cx2 = 6.5; pl.box(cx2, 0.5, z0 + 0.4, 0.6, 1.0, 0.62, { col: C('#e4e4e0') }); pl.box(cx2, 1.02, z0 + 0.4, 0.6, 0.04, 0.62, { col: C('#2a2c30') }); pl.box(cx2, 0.92, z0 + 0.72, 0.4, 0.06, 0.02, { col: C('#3a3c40') }); }
  }

  // ---- reception, manager, supervisor, guard
  { const sp = makeBankStaffAppearance(6704, { sex: 'f' }); const ch = new Character(sp); const top = Math.max(0.3, Math.min(0.55, seatTopFor(ch))); officeChair(k, REC.x, Z(4.15), 0, top); ch.root.position.set(REC.x, 0, Z(4.15) - 0.04); g.add(ch.root); ch.anim.seated = true; stand.recep = { ch, rnd: rngOf(6720) }; }
  { const sp = makeBankStaffAppearance(6705, { sex: 'm', role: 'manager' }); const ch = new Character(sp); const top = Math.max(0.3, Math.min(0.55, seatTopFor(ch))); officeChair(k, 6.1, Z(5.22), Math.PI, top, { high: true, col: '#1b1c20' }); ch.root.position.set(6.1, 0, Z(5.22) + 0.04); ch.root.rotation.y = Math.PI; g.add(ch.root); ch.anim.seated = true; stand.mgr = { ch, rnd: rngOf(6730) }; }
  { const sp = makeBankStaffAppearance(6706, { sex: 'm' }); const ch = new Character(sp); ch.root.position.set(4.7, 0, Z(11.9)); ch.root.rotation.y = -0.3; g.add(ch.root); stand.sup = { ch, rnd: rngOf(6740) }; }
  { const sp = makeBankStaffAppearance(6707, { sex: 'm', role: 'guard' }); const ch = new Character(sp); const gx = 2.05, gd = 1.05; ch.root.position.set(gx, 0, Z(gd)); ch.root.rotation.y = Math.atan2(-1.6 - gx, Z(5.0) - Z(gd)); g.add(ch.root); stand.guard = { ch, rnd: rngOf(6750), x: gx, z: Z(gd), yaw0: ch.root.rotation.y }; ob(gx - 0.25, gx + 0.25, gd - 0.25, gd + 0.25); }
  for (const p of [...stand.tellers, stand.recep, stand.mgr, stand.sup, stand.guard]) for (let i = 0; i < 20; i++) p.ch.anim.update(0.05, 0);

  k.into(g, { cast: false, receive: true });
  const lights = [{ p: [-4.2, H - 0.35, Z(6.0)], color: 0xfff4e6, i: 8, d: 9, decay: 1.4 }, { p: [2.4, H - 0.35, Z(6.0)], color: 0xfff4e6, i: 8, d: 9, decay: 1.4 }, { p: [0, H - 0.5, Z(8.0)], color: 0xfff6ea, i: 9, d: 10, decay: 1.3 },
    { p: [-5.5, 3.0, Z(2.4)], color: 0xeef4ff, i: 5.5, d: 5.5, decay: 1.6 }, { p: [1.4, H - 0.35, Z(2.2)], color: 0xfff4e6, i: 7, d: 8, decay: 1.4 }, { p: [0, H - 0.35, Z(11.3)], color: 0xfff8f0, i: 7, d: 9, decay: 1.4 }];

  // ================================================================================== the room object + its people
  const nStatic = obs.length;
  const room = { id: 'bank', bank: true, name: B.name, def: { kind: 'bank', name: B.name }, g, bounds: { x0, x1, z0, z1: zf - 0.02 }, obstacles: obs, lights, H, prompt: null, atms, seats, stand, customers: [], stats: { spawned: 0, left: 0, handed: 0, atmUses: 0, tellerVisits: 0, sat: 0 } };
  room.greet = () => { if (game.hud && staffOn()) game.hud.subtitle('Security officer', 'Good day. Welcome to Ceylon Meridian Bank — the ATMs are on your left.', '', 3.6); };
  room.onEnter = () => { BankSound.ambience(true); };
  room.onExit = () => { BankSound.ambience(false); };
  const hour = () => (game.atmos ? game.atmos.hour : 12);
  const staffOn = () => { const h = hour(); return h >= B.open[0] && h < B.open[1]; };
  room.staffOn = staffOn;

  // ---- customers: lanes and spots (x, d) → local (x, z)
  const P2 = (x, d) => [x, Z(d)]; const HUB = P2(-0.95, 4.6), DOOR_IN = P2(0, 0.9), DOOR_OUT = [0, 1.0], STREET = [2.6, 1.7];
  const LOC = {
    door: { chain: [DOOR_IN, P2(0, 2.3)] },
    kiosk: { chain: [P2(-1.5, 1.65), P2(-0.85, 1.8)], direct: true, at: P2(-1.5, 1.65), yaw: Math.PI },
    reception: { chain: [P2(REC.x, 2.5), P2(0.5, 2.15)], direct: true, at: P2(REC.x, 2.5), yaw: Math.PI },
    atmQ1: { chain: [P2(-4.3, 2.75), P2(-3.0, 1.4)], direct: true, at: P2(-4.3, 2.75), yaw: -Math.PI / 2 },
    atmQ2: { chain: [P2(-3.5, 2.75), P2(-3.0, 1.4)], direct: true, at: P2(-3.5, 2.75), yaw: -Math.PI / 2 },
    wait: { chain: [P2(0.45, 5.95), P2(-0.95, 5.95)], at: P2(0.45, 5.95), yaw: Math.PI },
  };
  atms.forEach((m) => { LOC['atm' + m.i] = { chain: [m.stand, P2(-4.3, m.d), P2(-3.0, 1.4)], direct: true, at: m.stand, yaw: -Math.PI / 2 }; });
  seats.forEach((s, i) => { LOC['seat' + i] = { chain: [[s.x, Z(s.lane)], [-0.95, Z(s.lane)]], at: [s.x, Z(s.lane)], yaw: Math.PI }; });
  WINX.forEach((wx, i) => { LOC['win' + i] = { chain: [P2(wx, 8.12), P2(wx, 7.78), P2(-0.95, 7.78)], at: P2(wx, 8.12), yaw: Math.PI }; });
  room.LOC = LOC;
  const route = (from, to) => { const A = LOC[from], Bq = LOC[to]; if (from === to) return [Bq.at || Bq.chain[0]];
    if (from === 'door' && Bq.direct) return [DOOR_IN, ...Bq.chain.slice().reverse()];
    if (to === 'door' && A.direct) return [...A.chain, DOOR_IN];
    if (A.direct && Bq.direct && (from.startsWith('atm') && to.startsWith('atm'))) return [A.chain[0], P2(-4.3, 2.4), Bq.chain[0]];
    return [...A.chain, HUB, ...Bq.chain.slice().reverse()]; };
  room.route = route;

  // the customer pool (built here, on the loading screen; reused — a customer handed to the street crowd is replaced at the next reseed)
  const POOL = 6; let seedN = 6800; const pool = room.customers;
  const newCustomer = () => { let sp = null; for (let t = 0; t < 6 && !(sp && isAdultSpec(sp)); t++) sp = makeAppearance(seedN++ * 13 + 5, { band: ['young', 'adult', 'adult', 'mature'][seedN % 4] }); const ch = new Character(sp); ch.root.visible = false; g.add(ch.root); const c = { ch, on: false, x: 0, z: 0, yaw: 0, speed: 0, gen: null, cmd: null, rnd: rngOf(seedN * 7 + 1), loc: 'door', blockT: 0, seat: -1, atm: -1, win: -1 }; pool.push(c); return c; };
  for (let i = 0; i < POOL; i++) newCustomer();
  const act = (c, a) => { const A = c.ch.anim; if (A.action !== a) A.set(a); if (c.ch.face) c.ch.face.talking = a === 'talk' || a === 'phone'; };
  const others = (c) => pool.filter((o) => o !== c && o.on);
  const playerNearAtm = (m) => { const pl = room.pl; return m.player || (pl && pl.inside && Math.hypot(pl.x - m.stand[0], pl.z - m.stand[1]) < 1.3); };
  const freeAtm = () => atms.find((m) => !m.user && !playerNearAtm(m)) || null;
  const openWins = () => (staffOn() ? B.staffed : []);
  const freeWin = () => { for (const w of openWins()) if (!pool.some((o) => o.on && o.win === w)) return w; return -1; };
  const freeSeat = (ch) => { const top = seatTopFor(ch); if (top < 0.3 || top > 0.5) return -1; const list = seats.map((s, i) => i).filter((i) => !seats[i].occ); if (!list.length) return -1; return list[Math.floor(Math.random() * list.length)]; };

  // ---- generator scripts (one per visit); commands: walk / idle / sit / seated / rise / gone
  function* go(c, to) { const path = route(c.loc, to); yield { walk: path }; c.loc = to; }
  function* leave(c) { if (c.seat >= 0) { yield { rise: true }; } if (c.atm >= 0) { atms[c.atm].user = null; atms[c.atm].paint(null); c.atm = -1; } c.win = -1; yield* go(c, 'door'); yield { walk: [DOOR_OUT, STREET] }; yield { gone: true }; }
  function* visit(c, plan) {
    for (const step of plan) {
      if (step === 'kiosk') { yield* go(c, 'kiosk'); yield { idle: 2.2 + c.rnd() * 1.2, act: 'interact', yaw: LOC.kiosk.yaw }; }
      else if (step === 'reception') { if (!staffOn()) continue; yield* go(c, 'reception'); yield { idle: 6 + c.rnd() * 5, act: 'talk', yaw: LOC.reception.yaw, staff: 'recep' }; }
      else if (step === 'atm') {
        let m = freeAtm(); let waited = 0;
        if (!m) { const q = pool.some((o) => o.on && o.loc === 'atmQ1') ? 'atmQ2' : 'atmQ1'; if (pool.some((o) => o.on && o.loc === q)) continue; yield* go(c, q);
          while (!(m = freeAtm()) && waited < 25) { yield { idle: 0.6, act: c.rnd() < 0.5 ? 'phone' : null, yaw: LOC[q].yaw }; waited += 0.6; } if (!m) continue; }
        m.user = c; c.atm = m.i; yield* go(c, 'atm' + m.i); if (!m || m.user !== c) continue;
        m.paint({ title: 'Please wait', lines: ['Transaction in progress'], note: CMB.name }); const n = 8 + c.rnd() * 6; let t = 0; while (t < n) { const dt = 1.1 + c.rnd() * 0.8; yield { idle: dt, act: 'interact', yaw: LOC['atm' + m.i].yaw, beeps: true }; t += dt; }
        m.user = null; m.paint(null); c.atm = -1; room.stats.atmUses++;
      }
      else if (step === 'seat') { const si = freeSeat(c.ch); if (si < 0) { yield* go(c, 'wait'); yield { idle: 6 + c.rnd() * 6, act: c.rnd() < 0.6 ? 'phone' : 'look', yaw: LOC.wait.yaw, until: () => freeWin() >= 0 && plan.includes('teller') }; continue; }
        seats[si].occ = c; c.seat = si; yield* go(c, 'seat' + si); yield { sit: si }; room.stats.sat++;
        yield { seated: 8 + c.rnd() * 14, until: () => plan.includes('teller') && freeWin() >= 0 && c.cmd && c.cmd.t > 5 }; yield { rise: true }; }
      else if (step === 'teller') { let w = freeWin(), waited = 0;
        if (w < 0) { if (!openWins().length) continue; yield* go(c, 'wait'); while ((w = freeWin()) < 0 && waited < 40) { yield { idle: 0.8, act: c.rnd() < 0.5 ? 'phone' : 'look', yaw: LOC.wait.yaw }; waited += 0.8; } if (w < 0) continue; }
        c.win = w; yield* go(c, 'win' + w); const n = 10 + c.rnd() * 8; let t = 0; while (t < n) { const dt = 2 + c.rnd() * 2.5; yield { idle: dt, act: c.rnd() < 0.55 ? 'talk' : c.rnd() < 0.5 ? 'listen' : 'interact', yaw: LOC['win' + w].yaw, win: w }; t += dt; }
        c.win = -1; room.stats.tellerVisits++; }
    }
    yield* leave(c);
  }
  const PLANS_DAY = [[['atm'], 3], [['seat', 'teller'], 3], [['kiosk', 'seat', 'teller'], 2.5], [['reception'], 1], [['reception', 'seat', 'teller'], 1], [['kiosk', 'teller'], 1.2]];
  const pickPlan = (rnd) => { if (!staffOn()) return ['atm']; let tot = 0; for (const [, w] of PLANS_DAY) tot += w; let r = rnd() * tot; for (const [p, w] of PLANS_DAY) if ((r -= w) <= 0) return p; return PLANS_DAY[0][0]; };
  const target = () => { const h = hour(); if (h >= 9 && h < 15) return 4; if ((h >= 8 && h < 9) || (h >= 15 && h < 18)) return 3; if (h >= 18 && h < 21) return 2; return 1; };
  const hide = (c) => { c.on = false; c.ch.root.visible = false; c.gen = null; c.cmd = null; if (c.seat >= 0) { seats[c.seat].occ = null; c.seat = -1; } if (c.atm >= 0) { if (atms[c.atm].user === c) { atms[c.atm].user = null; atms[c.atm].paint(null); } c.atm = -1; } c.win = -1; c.ch.anim.seated = null; c.ch.anim.set(null); };
  const place = (c) => { c.ch.root.position.set(c.x, 0, c.z); c.ch.root.rotation.y = c.yaw; };
  // spawn: from the street (the player inside, the door shut: they walk in through it) or straight into a state (reseed)
  const spawn = (c, plan, fromStreet = true) => { c.on = true; c.ch.root.visible = true; c.speed = 0; c.blockT = 0; c.seat = c.atm = c.win = -1; c.ch.anim.seated = null; c.ch.anim.set(null);
    if (fromStreet) { [c.x, c.z] = STREET; c.yaw = -Math.PI / 2; c.loc = 'door'; c.gen = (function* () { yield { walk: [DOOR_OUT, DOOR_IN] }; yield* visit(c, plan); })(); }
    else c.gen = visit(c, plan);
    c.cmd = null; place(c); room.stats.spawned++; };
  // reseed: the player was away — put a plausible crowd for the hour straight into the hall (the room is hidden: door shut)
  room.reseed = () => { for (const c of pool) if (c.on) hide(c); while (pool.length < POOL) newCustomer(); const n = Math.min(POOL, target()); const shuffled = pool.slice(0, n);
    shuffled.forEach((c, i) => { c.on = true; c.ch.root.visible = true; c.speed = 0; c.ch.anim.seated = null; c.ch.anim.set(null); const r = c.rnd();
      if (staffOn() && i < 3 && r < 0.5) { const si = freeSeat(c.ch); if (si >= 0) { const s = seats[si]; s.occ = c; c.seat = si; c.loc = 'seat' + si; seats.setTop(si, seatTopFor(c.ch)); c.x = s.x; c.z = s.z + 0.04; c.yaw = Math.PI; c.ch.anim.set('sit'); c.ch.anim.seated = true; place(c);
        c.gen = (function* () { yield { seated: 4 + c.rnd() * 12, until: () => freeWin() >= 0 && c.cmd && c.cmd.t > 4 }; yield { rise: true }; yield* visit(c, ['teller']); })(); c.cmd = null; return; } }
      if (staffOn() && r < 0.8) { const w = freeWin(); if (w >= 0) { c.win = w; c.loc = 'win' + w; [c.x, c.z] = LOC['win' + w].at; c.yaw = Math.PI; place(c); c.gen = (function* () { const n = 4 + c.rnd() * 10; let t = 0; while (t < n) { const dt = 2 + c.rnd() * 2; yield { idle: dt, act: c.rnd() < 0.6 ? 'talk' : 'listen', yaw: Math.PI, win: w }; t += dt; } c.win = -1; yield* leave(c); })(); c.cmd = null; return; } }
      const m = freeAtm(); if (m) { m.user = c; c.atm = m.i; c.loc = 'atm' + m.i; [c.x, c.z] = m.stand; c.yaw = -Math.PI / 2; place(c); m.paint({ title: 'Please wait', lines: ['Transaction in progress'], note: CMB.name });
        c.gen = (function* () { const n = 3 + c.rnd() * 8; let t = 0; while (t < n) { yield { idle: 1.2, act: 'interact', yaw: -Math.PI / 2, beeps: true }; t += 1.2; } m.user = null; m.paint(null); c.atm = -1; yield* leave(c); })(); c.cmd = null; return; }
      hide(c); });
    room.spawnT = 6 + Math.random() * 8; };
  room.spawnT = 4;

  // ---- one customer, one frame
  const turn = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * Math.min(1, k); };
  const door = () => site && site.doorObj;
  const clearAt = (x, z) => { if (z < ZF && (x < xL + 0.3 || x > xR - 0.3 || z < z0 + 0.3)) return false; if (z > ZF - 0.05 && z < 0.1 && Math.abs(x) > 0.3) return false; for (let i = 0; i < nStatic; i++) { const o = obs[i]; if (x > o.x0 - 0.25 && x < o.x1 + 0.25 && z > o.z0 - 0.25 && z < o.z1 + 0.25) return false; } return true; };
  const nearPlayer = (ax, az, bx, bz) => { const P = room.pl; if (!P || !(P.inside || Math.abs(P.z) < 2.5)) return false; const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((P.x - ax) * vx + (P.z - az) * vz) / L2)); return Math.hypot(ax + vx * t - P.x, az + vz * t - P.z) < 0.65; };
  const clearLine = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az); for (let t = 0; t <= L; t += 0.1) if (!clearAt(ax + (bx - ax) * t / L, az + (bz - az) * t / L)) return false; return true; };
  const stepCustomer = (c, dt, pl) => {
    if (!c.cmd) { const r = c.gen ? c.gen.next() : { done: true }; if (r.done) { hide(c); return; } c.cmd = Object.assign({ t: 0 }, r.value); if (c.cmd.walk) { c.cmd.path = c.cmd.walk; c.cmd.pi = 0; } }
    const m = c.cmd; m.t += dt; const A = c.ch.anim;
    if (m.gone) { const W2 = game.interiors && game.interiors.walkIn; const P = game.player;
      if (game.crowd && game.crowd.adopt && P && W2 && Math.hypot(P.x - site.F.x, P.z - site.F.z) < 40) { try { const [wx, wz] = W2.world(site, c.x, c.z); const ch = c.ch; pool.splice(pool.indexOf(c), 1); game.crowd.adopt(ch, wx, wz, site.yaw + c.yaw, 'calm'); room.stats.handed++; room.stats.left++; return; } catch (e) { console.warn('[bank] crowd hand-off', e); } }
      hide(c); room.stats.left++; return; }
    if (m.walk) {
      // string-pulling (4×/s): a corner is skipped when the point after it is in clear view (natural lines, and a corner
      // someone is standing on never holds a crowd up)
      if ((c.pullT = (c.pullT || 0) - dt) <= 0) { c.pullT = 0.25; while (m.pi + 1 < m.path.length && !m.path[m.pi][2] && clearLine(c.x, c.z, m.path[m.pi + 1][0], m.path[m.pi + 1][1]) && !nearPlayer(c.x, c.z, m.path[m.pi + 1][0], m.path[m.pi + 1][1])) m.pi++; }
      const tgt = m.path[m.pi]; if (!tgt) { c.cmd = null; return; }
      const dx = tgt[0] - c.x, dz = tgt[1] - c.z, dd = Math.hypot(dx, dz);
      if (dd < 0.07) { m.pi++; m.detoured = false; if (m.pi >= m.path.length) { c.cmd = null; c.speed = 0; } A.update(dt, c.speed); return; }
      const want = Math.atan2(dx, dz); c.yaw = turn(c.yaw, want, dt * 7); const fx = Math.sin(want), fz = Math.cos(want);
      // the door: ask it open (WalkIn pushes it like the player does), hold at arm's length until it has swung clear
      let hold = false; const D = door(); const cross = (c.z - LEAF_Z) * (tgt[1] - LEAF_Z) < 0;
      // the doorway is one person wide: one customer at a time (a token); the next waits just outside the door zone
      const inDZ = (x, z) => Math.abs(x) < 1.0 && z > -1.55 && z < 1.3; const nowIn = inDZ(c.x, c.z), nextIn = inDZ(c.x + fx * 0.12, c.z + fz * 0.12);
      if (room.doorBy && (!room.doorBy.on || !inDZ(room.doorBy.x, room.doorBy.z))) room.doorBy = null;
      if (nextIn && !nowIn && room.doorBy && room.doorBy !== c) hold = true; else if (nowIn || nextIn) { if (!room.doorBy) room.doorBy = c; }
      if (!hold && D && cross && Math.abs(c.x) < 0.9 && c.z > ZF - 1.4 && c.z < 1.4) { const side = c.z > LEAF_Z ? 1 : -1; site.npcDoor = { side, f: game.interiors.walkIn.frame }; if (Math.abs(D.ang) < 1.15 && Math.abs(c.z - LEAF_Z) < 0.62) hold = true;
        // the player has the door: wait for him — unless this customer is ahead of him on his side (between him and the leaf,
        // so he cannot reach it): then the customer pushes it (WalkIn honours a same-side NPC push while he is engaged)
        if (D.engaged) { const P0 = room.pl; const ahead = P0 && D.side === side && Math.abs(P0.z - LEAF_Z) > Math.abs(c.z - LEAF_Z) + 0.1; if (!ahead) hold = true; } }
      // the player is solid: stop for him; someone standing still in the way: the same; after a moment, step round (below)
      let by = null; const P = room.pl; if (!hold && P && (P.inside || Math.abs(P.z) < 2.5)) { const ox = P.x - c.x, oz = P.z - c.z, od = Math.hypot(ox, oz); if (od < 0.7 && ox * fx + oz * fz > od * 0.3) { hold = true; by = P; } }
      // in the doorway (one person wide) and the player wants through: turn round and step back out of the door zone for him
      if (by === P && nowIn) { c.yieldT = (c.yieldT || 0) + dt; if (c.yieldT > 0.5) { const bw = Math.atan2(-fx, -fz); c.yaw = turn(c.yaw, bw, dt * 8); const bx = c.x - fx * 0.9 * dt, bz = c.z - fz * 0.9 * dt;
        if (bz > 0.05 || inDZ(bx, bz) || clearAt(bx, bz)) { c.x = bx; c.z = bz; } if (room.doorBy === c) room.doorBy = null; c.speed = 0; A.update(dt, 0.9); place(c); return; } } else c.yieldT = 0;
      let sx = 0, sz = 0; if (!hold) for (const o of others(c)) { const ox = o.x - c.x, oz = o.z - c.z, od = Math.hypot(ox, oz); if (od > 0.6 || od < 1e-3) continue; const ahead = ox * fx + oz * fz;
        const moving = o.cmd && o.cmd.walk && o.speed > 0.2; if (!moving && ahead > od * 0.4 && od < 0.55 && !(nowIn && room.doorBy === c)) { hold = true; by = o; break; }
        if (moving && ahead > -0.1) { const lat = ox * -fz + oz * fx; const k = (0.6 - od) / 0.6; const sgn = lat > 0 ? -1 : 1; sx += -fz * sgn * k; sz += fx * sgn * k; } } // two people walking: each eases to the side and passes
      if (by) { c.blockT += dt; if (c.blockT > 1.2 && !m.detoured && (m.nDet || 0) < 6) { const lat = (by.x - c.x) * -fz + (by.z - c.z) * fx; const first = lat > 0 ? -1 : 1; for (const sg of [first, -first]) { const px = by.x - fz * sg * 0.75 + fx * 0.15, pz = by.z + fx * sg * 0.75 + fz * 0.15; if (clearAt(px, pz) && clearLine(c.x, c.z, px, pz) && clearLine(px, pz, tgt[0], tgt[1])) { m.path = m.path.slice(); m.path.splice(m.pi, 0, [px, pz, 1]); const nx2 = m.path[m.pi + 1]; if (nx2 && m.pi + 2 < m.path.length && Math.hypot(nx2[0] - by.x, nx2[1] - by.z) < 0.8) m.path.splice(m.pi + 1, 1); /* a corner the blocker stands on is cut */ m.detoured = true; m.nDet = (m.nDet || 0) + 1; c.blockT = 0; break; } } }
        if (c.blockT > 6) { c.blockT = 0; m.detoured = false; } } else c.blockT = Math.max(0, c.blockT - dt * 2);
      c.speed = hold ? Math.max(0, c.speed - dt * 5) : Math.min(sx || sz ? 0.8 : 1.2, c.speed + dt * 2.2); const st = Math.min(dd, c.speed * dt); let nx = c.x + fx * st, nz = c.z + fz * st;
      if ((sx || sz) && !hold && !nowIn) { const ex = nx + sx * 0.7 * dt, ez = nz + sz * 0.7 * dt; if (clearAt(ex, ez)) { nx = ex; nz = ez; } }
      c.x = nx; c.z = nz; A.update(dt, c.speed); place(c); return;
    }
    if (m.idle !== undefined) { c.speed = 0; c.yaw = turn(c.yaw, m.yaw ?? c.yaw, dt * 5); act(c, m.act || null); if (m.beeps && pl && pl.inside && Math.random() < dt * 1.6) BankSound.beep(0.35);
      A.update(dt, 0); place(c); if (m.t >= m.idle || (m.until && m.until())) { act(c, null); c.cmd = null; } return; }
    if (m.sit !== undefined) { const s = seats[m.sit]; if (m.t < dt * 1.5) { seats.setTop(m.sit, Math.max(0.3, Math.min(0.5, seatTopFor(c.ch)))); m.from = [c.x, c.z]; act(c, 'sit'); }
      c.yaw = turn(c.yaw, Math.PI, dt * 8); const u = Math.min(1, m.t / 0.8), e = u * u * (3 - 2 * u); c.x = m.from[0] + (s.x - m.from[0]) * e; c.z = m.from[1] + (s.z + 0.04 - m.from[1]) * e; A.update(dt, 0); place(c);
      if (m.t >= 0.9) { A.seated = true; c.cmd = null; } return; }
    if (m.seated !== undefined) { if (!m.nextAct || m.t > m.nextAct) { const r = c.rnd(); const a = r < 0.35 ? 'phone' : r < 0.55 ? 'text' : r < 0.75 ? 'look' : 'sit'; act(c, a); m.nextAct = m.t + 3 + c.rnd() * 5; }
      A.update(dt, 0); if (m.t >= m.seated || (m.until && m.until())) { c.cmd = null; } return; }
    if (m.rise) { const s = seats[c.seat]; if (m.t < dt * 1.5) { A.seated = null; act(c, 'rise'); m.from = [c.x, c.z]; }
      const to = s ? [s.x, Z(s.lane)] : [c.x, c.z]; const u = Math.min(1, m.t / 0.7), e = u * u * (3 - 2 * u); c.x = m.from[0] + (to[0] - m.from[0]) * e; c.z = m.from[1] + (to[1] - m.from[1]) * e; A.update(dt, 0); place(c);
      if (m.t >= 0.75) { act(c, null); if (c.seat >= 0) { seats[c.seat].occ = null; c.seat = -1; } c.cmd = null; } return; }
    c.cmd = null;
  };

  // ---- staff, one frame
  const stepStaff = (dt, pl) => { const on = staffOn(); const near = pl && pl.inside; const k2 = near ? 1 : 0.5;
    for (const t of stand.tellers) { t.ch.root.visible = on; if (!on) continue; const cust = pool.find((o) => o.on && o.win === t.win && o.cmd && o.cmd.win === t.win);
      if (cust) { t.actT -= dt; if (t.actT <= 0 || !t.act) { t.act = t.rnd() < 0.5 ? 'talk' : t.rnd() < 0.6 ? 'type' : 'listen'; t.actT = 2 + t.rnd() * 3; t.ch.anim.set(t.act); t.ch.anim.seated = true; } }
      else { if (t.act) { t.act = null; t._rtn = null; } routine(t, t.ch, dt, 'desk', t.rnd); }
      t.ch.anim.update(dt * k2, 0); }
    for (const [p, kind] of [[stand.recep, 'desk'], [stand.mgr, 'desk'], [stand.sup, 'phone']]) { p.ch.root.visible = on; if (!on) continue; const busy = p === stand.recep && pool.some((o) => o.on && o.cmd && o.cmd.staff === 'recep');
      if (busy) { if (p.ch.anim.action !== 'talk') p.ch.anim.set('talk'); p.ch.anim.seated = true; p.busy = true; } else { if (p.busy) { p.busy = false; p._rtn = null; } routine(p, p.ch, dt, kind, p.rnd); } p.ch.anim.update(dt * k2, 0); }
    { const gd = stand.guard; routine(gd, gd.ch, dt, 'guard', gd.rnd); let want = gd.yaw0; if (pl && pl.inside && Math.hypot(pl.x - gd.x, pl.z - gd.z) < 3) want = Math.atan2(pl.x - gd.x, pl.z - gd.z); gd.ch.root.rotation.y = turn(gd.ch.root.rotation.y, want, dt * 2.5); gd.ch.anim.update(dt, 0); }
  };

  // ---- per frame (WalkIn: while the room is drawn or holds the player)
  room.lastT = -1e9;
  room.update = (dt, pl) => {
    room.pl = pl; const now = game.clock ?? performance.now() / 1000; const gap = now - room.lastT; room.lastT = now; const D2 = door();
    if (gap > 20 && !pl.inside && (!D2 || Math.abs(D2.ang) < 0.5)) room.reseed();
    // daylight through the frontage glazing, signage glow
    if (game.atmos) { const n = game.atmos.night ?? 0; dayMat.emissiveIntensity = atlas ? 0.08 + 0.85 * (1 - n) : 0.3; }
    stepStaff(dt, pl);
    for (const c of pool.slice()) if (c.on) stepCustomer(c, dt, pl); else if (c.ch.root.visible) c.ch.root.visible = false;
    // new customers walk in from the street while the player is inside (door shut, so nobody appears in view)
    if (pl.inside) { room.spawnT -= dt; const active = pool.filter((c) => c.on).length;
      if (room.spawnT <= 0) { room.spawnT = 9 + Math.random() * 14; const free = pool.find((c) => !c.on) || (pool.length < POOL && active < target() ? newCustomer() : null); if (free && active < target() && D2 && Math.abs(D2.ang) < 0.05 && Math.hypot(pl.x - STREET[0], pl.z - STREET[1]) > 2.5) spawn(free, pickPlan(Math.random), true); } } // the visit varies from session to session (the customer's own seed keeps his look)
    // dynamic obstacles: the customers' bodies (the player is pushed off them; they stop for him)
    obs.length = nStatic; for (const c of pool) if (c.on && c.z < ZF) { const sx = c.cmd && c.cmd.seated !== undefined ? Math.sin(c.yaw) * 0.25 : 0, sz = c.cmd && c.cmd.seated !== undefined ? Math.cos(c.yaw) * 0.25 : 0; obs.push({ x0: c.x + sx - 0.2, x1: c.x + sx + 0.2, z0: c.z + sz - 0.2, z1: c.z + sz + 0.2, npc: true }); }
    // prompts: ATM / teller window
    room.nearAtm = -1; room.nearWin = -1; room.prompt = null; const key = (a) => (game.hud && game.hud.key ? game.hud.key(a) : '[E]');
    if (pl.inside && !(game.atm && game.atm.open)) {
      const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
      for (const m of atms) { const dx = pl.x - m.stand[0], dz = pl.z - m.stand[1]; if (Math.abs(dz) < 0.45 && dx > -0.2 && dx < 0.95 && -fx > 0.3) { room.nearAtm = m.i; room.prompt = m.user ? 'ATM in use — please wait' : `${key('interact')} Use ATM`; break; } }
      if (room.nearAtm < 0) for (let i = 0; i < 4; i++) { const p = LOC['win' + i].at; if (Math.abs(pl.x - p[0]) < 0.6 && pl.z < p[1] + 0.5 && pl.z > p[1] - 0.3 && -fz > 0.3) { if (pool.some((o) => o.on && o.win === i)) { room.prompt = `Counter ${i + 1} · serving a customer`; break; } room.nearWin = i; room.prompt = `${key('interact')} Speak to counter ${i + 1}`; break; } }
    }
  };
  room.interact = () => {
    if (room.nearAtm >= 0) { const m = atms[room.nearAtm]; if (m.user) { if (game.hud) game.hud.subtitle(B.name, 'This ATM is in use. Please wait or use the other machine.', '', 2.5); return; } if (game.atm) game.atm.openAt(room, m); return; }
    if (room.nearWin >= 0 && game.hud) { const i = room.nearWin; const open = staffOn() && B.staffed.includes(i);
      game.hud.subtitle(open ? 'Bank officer' : B.name, open ? 'Good day! Cash withdrawals and deposits are quickest at our ATMs by the entrance — no queue, and they update your account at once.' : i === 3 ? 'Counter 4 is closed today. Please use counters 1 to 3 or the ATMs.' : 'The counters are closed after banking hours. The ATMs are open 24 hours.', '', 4); }
  };
  // send a customer in from the street on a given visit (tests / dev tools; the normal flow is the spawn timer in update)
  room.spawnVisit = (plan) => { const free = pool.find((c) => !c.on) || (pool.length < POOL ? newCustomer() : null); if (!free) return null; spawn(free, plan, true); return free; };
  room.atmPose = (m) => ({ local: { x: m.stand[0], z: m.stand[1], yaw: -Math.PI / 2 } });
  // freed by WalkIn when the player is far away: staff and the customers still in the pool (customers handed to the street crowd
  // left the pool and belong to the crowd now), the ATM screen textures; the room tone is stopped outright
  room.dispose = () => { BankSound.stopNow(); for (const p of [...stand.tellers, stand.recep, stand.mgr, stand.sup, stand.guard]) if (p && p.ch && p.ch.dispose) p.ch.dispose(); for (const c of pool) if (c.ch && c.ch.dispose) c.ch.dispose(); pool.length = 0; for (const m of atms) if (m.screen && m.screen.tex) m.screen.tex.dispose(); };
  room.reseed();
  return room;
}
function rngOf(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
