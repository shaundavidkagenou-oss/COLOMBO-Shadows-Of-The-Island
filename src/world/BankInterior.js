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
import { Kit, C, lathe } from './ShopKit.js';
import { shell } from './ShopInteriors.js';
import { collectParts, applyLayout } from './BankLayout.js';
import { cloneMaterial } from '../gfx/Materials.js';
import { useBankMaterials, bankMaterials, groutTex, SCREEN_UV } from './BankMaterials.js'; // 74th: the hall's own textured materials + LCD screens
import { bankTex } from './BankTex.js'; // 77th: 2048² surfaces
import * as BM from './BankModels.js'; // 77th: detailed furniture + fittings
import { modelPackNow } from '../debug/boot.js';
import './RobberyShops.js'; // registers the kit's ceiling tile / steel / plastic / gold materials
import { REVEAL, LEAF_Z } from './WalkIn.js';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Character } from '../actors/Character.js';
import { makeAppearance, makeBankStaffAppearance, isAdultSpec } from '../actors/Appearance.js';
import { routine } from '../actors/Routine.js';
import { seatTopFor } from './ClubCast.js';
import { CMB, FONTS, drawLogo, tracked, fitFont, hasCanvas, drawATMScreen, ATM_IDLE_VIEW } from './BankBrand.js';
import { BankSound, CHAIR_SEATED_AT, CHAIR_LEN } from '../audio/BankAudio.js';
import { acUnit, landline, callPhone, rb, HANDSET } from './BankProps.js';
import { makeBankShift, warmStaffCars } from './BankShift.js';
import { BANK_CALL, BANK_TELLERS, bankCallId, bankCounterId, BANK_GUARD, bankGuardId } from '../audio/VoiceDefs.js';
import { makeGuardGun } from './BankGuardGun.js';
import { SoundBank as SB } from '../audio/SoundBank.js';

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
  const cv = document.createElement('canvas'); cv.width = cv.height = 2048; const a = cv.getContext('2d'); a.scale(4, 4); /* 77th: drawn in its 512 layout at 2048² */ a.textBaseline = 'alphabetic'; const S = FONTS.SANS;
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
  const cv = document.createElement('canvas'); cv.width = cv.height = 2048; const a = cv.getContext('2d'); a.scale(4, 4); /* 77th: 2048² */ a.textBaseline = 'alphabetic'; const S = FONTS.SANS, SE = FONTS.SERIF;
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
function officeChair(k, x, z, yaw, top, opts = {}) { BM.officeChair(k, x, z, yaw, top, opts); } // 77th: detailed (BankModels.js); seat top unchanged
// a computer monitor on a stand, its screen facing direction yaw (0 = +z)
function monitor(k, x, y, z, yaw, w = 0.52, scr = SCREEN_UV.teller) {
  BM.monitor(k, x, y, z, yaw, w); // 77th: slim LED monitor (BankModels.js)
  const [sx, sz] = rot(x, z, yaw, 0, 0.0125); k.get('screen').box(sx, y + 0.305, sz, w - 0.03, w * 0.6 - 0.04, 0.002, { col: [1, 1, 1], rotY: yaw, uvRect: scr }); // 74th: a real LCD (BankMaterials screen atlas)
}
function keyboard(k, x, y, z, yaw) { BM.keyboard(k, x, y, z, yaw); } // 77th: 104 keys + mouse on a pad
function deskPhone(k, x, y, z, yaw) { landline(k, x, y, z, yaw); } // 71st: a real corded office phone (BankProps.js) instead of two boxes
function plant(k, x, z, h = 1.2, potCol = '#e9e5dc') { BM.plant(k, x, z, h, potCol); } // 77th: glazed pot, pebbles, a Dracaena clump (BankModels.js)

// ------------------------------------------------------------------------------------------------ the room
// ---- 73rd: ATM display + PIN pad -------------------------------------------------------------------------------------
// The screen content is the same drawing as before (drawATMScreen, the ATM interface's views) at 2× resolution, then finished
// like a backlit TFT behind cover glass: the RGB stripe of the sub-pixels, the backlight's slight fall-off to the corners, a
// faint diagonal sheen. The cover glass is one shared low-roughness material (catches the hall's lights).
function paintATM(ctx, view) { const k = ctx.canvas.width / 512; /* 77th: the canvas is 1024 × 768 now; the 256 × 192 layout is unchanged */ ctx.setTransform(2 * k, 0, 0, 2 * k, 0, 0); drawATMScreen(ctx, 256, 192, view); ctx.setTransform(k, 0, 0, k, 0, 0); lcdFinish(ctx, 512, 384); ctx.setTransform(1, 0, 0, 1, 0, 0); }
function lcdFinish(a, w, h) {
  a.save(); a.globalCompositeOperation = 'multiply'; a.globalAlpha = 0.16; for (let x = 0; x < w; x += 3) { a.fillStyle = '#ff6060'; a.fillRect(x, 0, 1, h); a.fillStyle = '#60ff60'; a.fillRect(x + 1, 0, 1, h); a.fillStyle = '#6060ff'; a.fillRect(x + 2, 0, 1, h); }
  a.globalAlpha = 1; a.globalCompositeOperation = 'source-over';
  const v = a.createRadialGradient(w / 2, h * 0.46, h * 0.25, w / 2, h / 2, w * 0.7); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.32)'); a.fillStyle = v; a.fillRect(0, 0, w, h);
  const sh = a.createLinearGradient(0, 0, w, h); sh.addColorStop(0, 'rgba(255,255,255,0.07)'); sh.addColorStop(0.35, 'rgba(255,255,255,0.0)'); sh.addColorStop(1, 'rgba(255,255,255,0.0)'); a.fillStyle = sh; a.fillRect(0, 0, w, h);
  a.restore();
}
let _atmGlass = null, _atmGlassGeo = null, _legendMat = null;
const ATM_GLASS_GEO = () => (_atmGlassGeo || (_atmGlassGeo = new THREE.PlaneGeometry(0.318, 0.243)));
function atmGlassMat() { return _atmGlass || (_atmGlass = Object.assign(new THREE.MeshStandardMaterial({ color: 0x06080b, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false }), { name: 'CMB · ATM cover glass' })); }
// key legends: a 256² atlas, 4 × 4 cells — digits engraved dark into brushed steel; CANCEL / CLEAR / ENTER white on their colours
const LEG = ['1', '2', '3', 'CANCEL', '4', '5', '6', 'CLEAR', '7', '8', '9', 'ENTER', '', '0', '', ''];
const LEG_BG = { CANCEL: '#b4322a', CLEAR: '#d8b228', ENTER: '#2d8a48' };
function atmLegendMat() {
  if (_legendMat) return _legendMat; const cv = document.createElement('canvas'); cv.width = cv.height = 1024; const a = cv.getContext('2d'); a.scale(4, 4); /* 77th: 1024² (each 3 cm key cap gets 256 px) */
  LEG.forEach((t, i) => { const x = (i % 4) * 64, y = Math.floor(i / 4) * 64; const bg = LEG_BG[t];
    const gr = a.createLinearGradient(x, y, x + 64, y + 64); gr.addColorStop(0, bg || '#d9dcdf'); gr.addColorStop(1, bg ? bg : '#b7bbbf'); a.fillStyle = gr; a.fillRect(x, y, 64, 64);
    if (!bg) { a.globalAlpha = 0.18; a.fillStyle = '#ffffff'; for (let k = 0; k < 64; k += 2) a.fillRect(x, y + k, 64, 1); a.globalAlpha = 1; } // brushed grain
    a.textAlign = 'center'; a.textBaseline = 'middle';
    if (t.length === 1) { a.font = '700 34px "Barlow", "Arial", sans-serif'; a.fillStyle = 'rgba(255,255,255,0.55)'; a.fillText(t, x + 32.8, y + 34.6); a.fillStyle = '#1a1c1f'; a.fillText(t, x + 32, y + 33.5); if (t === '5') { a.beginPath(); a.arc(x + 32, y + 54, 2.6, 0, 7); a.fill(); } } // (the raised dot on 5)
    else if (t) { a.font = '700 13px "Barlow Condensed", "Arial Narrow", sans-serif'; a.fillStyle = '#ffffff'; a.fillText(t, x + 32, y + 33); }
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; _legendMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38, metalness: 0.55, name: 'CMB · ATM key legends' }); return _legendMat;
}
const keyLegends = { mb: new MeshBuilder(), n: 0 };
// the pad in its own tilted frame (rising 11° toward the fascia): a dark recessed plate, a steel surround, 4 × 3 digit keys and
// the function column; each key a rounded steel cap whose top carries its legend quad (atlas cell)
function atmKeypad(metal, pl, x, y, z) {
  const KF = new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationZ(-0.19));
  const put = (b, geo, lx, ly, lz, col) => { b.geometry(geo, new THREE.Matrix4().multiplyMatrices(KF, new THREE.Matrix4().makeTranslation(lx, ly, lz)), col); geo.dispose(); };
  const rbx = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
  put(pl, rbx(0.158, 0.008, 0.232, 0.004), -0.002, -0.003, -0.005, C('#15171a')); // recessed plate
  for (const s2 of [-1, 1]) { put(metal, new THREE.BoxGeometry(0.168, 0.006, 0.006), -0.002, 0.0, -0.005 + s2 * 0.118, C('#c7cbcf')); put(metal, new THREE.BoxGeometry(0.006, 0.006, 0.242), -0.002 + s2 * 0.083, 0.0, -0.005, C('#c7cbcf')); }
  const legend = (lx, lz, hx, hz, cell) => { if (!hasCanvas()) return; const i = cell % 4, j = Math.floor(cell / 4); const u0 = i / 4 + 0.006, u1 = (i + 1) / 4 - 0.006, v0 = 1 - (j + 1) / 4 + 0.006, v1 = 1 - j / 4 - 0.006; const yy = 0.0052;
    const P = (px, pz) => new THREE.Vector3(px, yy, pz).applyMatrix4(KF).toArray(); keyLegends.mb.quad(P(lx + hx, lz + hz), P(lx + hx, lz - hz), P(lx - hx, lz - hz), P(lx - hx, lz + hz), [u0, v0, u1, v1], [1, 1, 1]); keyLegends.n++; };
  for (let r = 0; r < 4; r++) { const lx = -0.054 + r * 0.035; // row 0 farthest from the user (by the fascia)
    for (let c = 0; c < 3; c++) { const lz = 0.07 - c * 0.044; put(metal, rbx(0.029, 0.009, 0.037, 0.0035), lx, 0.0005, lz, C('#d4d8db')); legend(lx, lz, 0.0125, 0.0165, r * 4 + c); }
    const fz = -0.072; const cell = r * 4 + 3; const t = LEG[cell]; put(t ? pl : metal, rbx(0.029, 0.009, 0.05, 0.0035), lx, 0.0005, fz, t ? C(LEG_BG[t]) : C('#d4d8db')); legend(lx, fz, 0.0125, 0.023, cell); }
}

export function buildBankInterior(game, site) {
  keyLegends.mb = new MeshBuilder(); keyLegends.n = 0; // (73rd: this build's PIN-pad legends)
  const B = BANK_ROOM; let W = B.W, D = B.D; const H = B.H;
  if (site && site.b) { const b = site.b, ns = Math.abs(Math.cos(site.yaw)) > 0.7; W = Math.min(W, (ns ? b.x1 - b.x0 : b.z1 - b.z0) - 0.5); D = Math.min(D, (ns ? b.z1 - b.z0 : b.x1 - b.x0) - 0.6); }
  if (W < 13.9 || D < 13.3) console.warn('[bank] building smaller than the design room', W, D);
  const g = new THREE.Group(); g.name = 'bank-hall'; const k = useBankMaterials(new Kit().parts()); const obs = []; // 74th: every surface draws with the bank's OWN material (CMB · …)
  { const f = game && game.world && game.world.bankFront; if (f && f.apply2K) f.apply2K(); } // 77th: the frontage's 2048² surfaces (idempotent; the loading screen normally did it)
  const part = (n) => k.setPart(n); part('Room shell (floor, walls, ceiling)'); // 73rd: named parts (BankLayout.js / console bank-edit)
  const atlas = interiorAtlas(), posters = posterAtlas();
  const signMat = new THREE.MeshStandardMaterial({ name: 'CMB interior signs', map: atlas, color: atlas ? 0xffffff : new THREE.Color(CMB.navy), roughness: 0.5, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: atlas ? 0.32 : 0 });
  const dayMat = new THREE.MeshStandardMaterial({ name: 'CMB frontage glazing (inside)', map: atlas, color: atlas ? 0xffffff : 0xdfe5e8, roughness: 0.6, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: atlas ? 0.9 : 0.4 });
  const printMat = new THREE.MeshStandardMaterial({ name: 'CMB posters', map: posters, color: posters ? 0xffffff : 0xe8e4da, roughness: 0.62 });
  const glassMat = new THREE.MeshStandardMaterial({ name: 'CMB clear glass', color: 0xdfe9ec, roughness: 0.04, metalness: 0.1, envMapIntensity: 1.2, transparent: true, opacity: 0.16, depthWrite: false });
  for (const m of [signMat, dayMat, printMat, glassMat]) m.userData.own = true;
  Object.assign(k.extra, { cmbSign: signMat, cmbDay: dayMat, cmbPrint: printMat, cmbGlass: glassMat });
  const sign = k.get('cmbSign'), day = k.get('cmbDay'), prints = k.get('cmbPrint'), cglass = k.get('cmbGlass');
  const S = shell(k, g, W, D, H, { floor: { kind: 'granite', size: 0.6, colors: ['#dcd7cc', '#d4cec2', '#d9d3c7'], grout: '#a9a296', rough: 0.12, seed: 67 }, wall: 'plaster', wallCol: '#efeae1', ceil: '#f2f0ea', skirt: 'marbleDark', skirtCol: '#ffffff', cornice: '#f4f1ea' });
  { let fi = 0; for (const fg of g.children) if (fg.name === 'modelledFloor') fg.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) { o.material = cloneMaterial(o.material, o.material.map ? 'CMB · Granite floor tiles ' + ++fi : 'CMB · Floor grout (sanded cement)'); if (!o.material.map) { o.material.map = groutTex(); o.material.needsUpdate = true; } else { const gt = bankTex('cmbGranite'); if (gt) o.material.map = gt; /* 77th: the bank's own 2048² granite */ } } }); } // 74th: the bank's own floor materials
  const { x0, x1, z0, zf } = S; const xR = x1, xL = x0;
  const ob = (ax0, ax1, d0, d1) => obs.push({ x0: Math.min(ax0, ax1), x1: Math.max(ax0, ax1), z0: Z(Math.max(d0, d1)), z1: Z(Math.min(d0, d1)), part: k.part });
  const navy = C(CMB.navy), gold = C(CMB.gold), bronze = C('#2e2a26'), steelC = C('#b9bdc1');
  const paint = k.get('paint'), metal = k.get('steel'), glass = cglass, emis = k.get('emissive'), wal = k.get('walnut'), mrbD = k.get('marbleDark'), mrb = k.get('marble'), pl = k.get('plastic'), chrome = k.get('chrome'), brass = k.get('gold');

  // ---- ceiling: tiles + LED panels; ATM soffit; counter bulkhead
  part('Ceiling tiles'); k.get('ceilTile').hrect(x0, z0, x1, zf, H - 0.004, 0.6, WHITE, true);
  part('LED ceiling panels'); const led = (x, d) => { emis.box(x, H - 0.012, Z(d), 0.56, 0.012, 0.56, { col: [1, 0.98, 0.94] }); paint.box(x, H - 0.01, Z(d), 0.6, 0.008, 0.6, { col: C('#d8d8d4') }); };
  for (const x of [-1.6, 1.6, 4.8]) led(x, 2.0); for (const x of [-4.8, -1.6, 1.6, 4.8]) { led(x, 5.6); led(x, 7.4); led(x, 11.4); }
  part('Aircon diffusers'); for (const [x, d] of [[-2.4, 1.0], [3.2, 6.4]]) { paint.box(x, H - 0.01, Z(d), 1.2, 0.008, 0.1, { col: C('#cfcfca') }); paint.box(x, H - 0.012, Z(d), 1.12, 0.006, 0.04, { col: C('#3a3c3f') }); } // linear aircon diffusers
  part('CCTV domes'); for (const [x, d] of [[-2.6, 1.3], [3.6, 7.6]]) { lathe(pl, x, H - 0.09, Z(d), [[0.001, 0], [0.05, 0.004], [0.075, 0.03], [0.08, 0.06], [0.09, 0.09], [0.001, 0.09]], 16, C('#ecebe8')); } // CCTV domes
  part('ATM soffit'); { const sx0 = xL, sx1 = -3.8, sd0 = 0, sd1 = 4.4, sy = H - 0.28; paint.box((sx0 + sx1) / 2, sy + 0.14, Z((sd0 + sd1) / 2), sx1 - sx0, 0.28, sd1 - sd0, { col: C('#f2f0ea'), top: false, bottom: true });
    paint.box(sx1 - 0.01, sy + 0.14, Z((sd0 + sd1) / 2), 0.03, 0.28, sd1 - sd0, { col: navy }); paint.box((sx0 + sx1) / 2, sy + 0.14, Z(sd1) - 0.01, sx1 - sx0, 0.28, 0.03, { col: navy });
    for (const d of B.atmD) for (const dx of [-5.65, -4.6]) { emis.cylinder(dx, sy - 0.004, Z(d), 0.06, 0.06, 0.006, 14, { col: [0.95, 0.97, 1] }); chrome.cylinder(dx, sy - 0.002, Z(d), 0.08, 0.08, 0.004, 14, { col: WHITE }); }
    // hanging ATM sign under the soffit edge (both faces)
    part('Hanging ATM sign');
    const hx = (sx0 + sx1) / 2 + 0.6; for (const sx of [-0.4, 0.4]) metal.box(hx + sx, sy - 0.12, Z(sd1) - 0.06, 0.01, 0.24, 0.01, { col: steelC });
    paint.box(hx, sy - 0.42, Z(sd1) - 0.06, 1.12, 0.32, 0.03, { col: navy }); face(sign, hx, sy - 0.42, Z(sd1) - 0.06 - 0.016, 1.08, 0.28, IN_UV.atmHang, '-z'); face(sign, hx, sy - 0.42, Z(sd1) - 0.06 + 0.016, 1.08, 0.28, IN_UV.atmHang, '+z'); }
  part('Counter bulkhead'); const bulkY = H - 0.4; { paint.box(0, bulkY + 0.2, Z(9.0), W, 0.4, 0.8, { col: C('#f2f0ea'), top: false, bottom: true }); paint.box(0, bulkY + 0.2, Z(8.6) + 0.012, W, 0.4, 0.025, { col: navy }); metal.box(0, bulkY + 0.012, Z(8.6) + 0.026, W, 0.012, 0.006, { col: gold }); }

  // ---- inner face of the glazed frontage: daylight through vertical blinds, bronze mullions
  part('Frontage blinds and mullions');
  for (const sgn of [-1, 1]) { const a = sgn * 1.3, b = sgn * 6.4, cx = (a + b) / 2, w = Math.abs(b - a); const z = zf - 0.006;
    face(day, cx, 1.75, z, w, 2.5, [IN_UV.blinds[0], IN_UV.blinds[1], IN_UV.blinds[0] + (IN_UV.blinds[2] - IN_UV.blinds[0]) * (w / 6), IN_UV.blinds[3]], '-z');
    paint.box(cx, 0.48, z - 0.03, w + 0.08, 0.06, 0.07, { col: bronze }); paint.box(cx, 3.02, z - 0.03, w + 0.08, 0.06, 0.07, { col: bronze });
    const n = Math.round(w / 1.27); for (let i = 0; i <= n; i++) paint.box(a + (b - a) * i / n, 1.75, z - 0.03, 0.06, 2.5, 0.07, { col: bronze });
    mrb.box(cx, 0.46, z - 0.08, w + 0.1, 0.03, 0.14, { col: WHITE }); }
  paint.box(0, 2.42, zf - 0.03, 1.5, 0.08, 0.06, { col: bronze }); // door head trim inside

  // ---- ATM lobby: navy surround with two through-the-wall ATMs, glass privacy fin, bin
  part('ATM lobby surround'); const AX = B.atmFace; { const d0 = 0.7, d1 = 4.1; paint.box((xL + AX) / 2, 1.25, Z((d0 + d1) / 2), AX - xL, 2.5, d1 - d0, { col: navy }); metal.box((xL + AX) / 2 + 0.01, 2.51, Z((d0 + d1) / 2), AX - xL + 0.02, 0.02, d1 - d0 + 0.02, { col: gold });
    paint.box(AX + 0.012, 0.05, Z((d0 + d1) / 2), 0.025, 0.1, d1 - d0, { col: C('#0b1528') }); ob(xL, AX + 0.3, d0, d1); }
  const atms = B.atmD.map((d, i) => { const z = Z(d); part('ATM ' + (i + 1));
    face(sign, AX + 0.004, 2.18, z, 0.78, 0.2, IN_UV.atmHead, '+x');
    metal.box(AX + 0.035, 1.25, z, 0.07, 1.4, 0.72, { col: C('#c3c7cb') }); paint.box(AX + 0.075, 0.28, z, 0.15, 0.56, 0.76, { col: C('#1a2c4c') }); // fascia · kick panel
    pl.box(AX + 0.09, 1.38, z, 0.04, 0.42, 0.46, { col: C('#121315') }); // screen bezel
    // 73rd: the display sits recessed in a moulded lip (the screen 6 mm behind its front edge), under a cover glass (ATM_GLASS)
    for (const s2 of [-1, 1]) { pl.box(AX + 0.1145, 1.385 + s2 * 0.1205, z, 0.007, 0.016, 0.33, { col: C('#0b0c0e') }); pl.box(AX + 0.1145, 1.385, z + s2 * 0.1585, 0.007, 0.257, 0.013, { col: C('#0b0c0e') }); }
    for (const s2 of [-1, 1]) chrome.box(AX + 0.1182, 1.385 + s2 * 0.1285, z, 0.0012, 0.0015, 0.344, { col: C('#5d6166') }); // a thin bright edge round the lip
    pl.box(AX + 0.16, 1.605, z, 0.14, 0.015, 0.47, { col: C('#1b1c1f') }); for (const s of [-1, 1]) pl.box(AX + 0.15, 1.39, z + s * 0.228, 0.12, 0.43, 0.012, { col: C('#1b1c1f') }); // privacy hood
    for (let j = 0; j < 4; j++) for (const s of [-1, 1]) { rb(metal, AX + 0.1135, 1.27 + j * 0.068, z + s * 0.198, 0.011, 0.026, 0.036, 0.004, C('#d9dcdf')); pl.box(AX + 0.1192, 1.27 + j * 0.068, z + s * 0.198, 0.0008, 0.003, 0.014, { col: C('#3a3d42') }); pl.box(AX + 0.1123, 1.27 + j * 0.068, z + s * 0.175, 0.0015, 0.004, 0.012, { col: C('#9aa0a6') }); } // side function keys (each with its engraved bar, a tick pointing at the screen)
    metal.box(AX + 0.18, 1.04, z, 0.22, 0.04, 0.6, { col: C('#aeb2b6') }); // keypad shelf
    atmKeypad(metal, pl, AX + 0.19, 1.077, z + 0.012); // 73rd: the encrypting PIN pad (steel keys with engraved legends, the function column)
    for (const [dz, dw] of [[0.155, 0.01], [-0.115, 0.01]]) metal.box(AX + 0.2, 1.115, z + dz, 0.14, 0.09, dw, { col: C('#7d8287') }); // keypad privacy shield: brushed-steel side wings (open toward the user, as on real machines)
    // 71st: card reader as on a real machine — rounded housing standing out of the fascia, the slot (70 mm wide) in a lit green
    // anti-skimming surround, a card pictogram over it; contactless pad below; status light; headphone jack; lit hood edges
    rb(pl, AX + 0.088, 1.3, z - 0.3, 0.07, 0.088, 0.12, 0.014, C('#1c1e22')); rb(chrome, AX + 0.118, 1.3, z - 0.3, 0.012, 0.04, 0.094, 0.006, C('#c9ccd0'));
    pl.box(AX + 0.1245, 1.3, z - 0.3, 0.003, 0.0035, 0.07, { col: C('#050506') }); for (const dy of [-0.0095, 0.0095]) emis.box(AX + 0.1245, 1.3 + dy, z - 0.3, 0.002, 0.003, 0.08, { col: [0.25, 1, 0.42] }); for (const dz of [-0.0405, 0.0405]) emis.box(AX + 0.1245, 1.3, z - 0.3 + dz, 0.002, 0.022, 0.003, { col: [0.25, 1, 0.42] });
    emis.box(AX + 0.1235, 1.332, z - 0.3, 0.002, 0.011, 0.018, { col: [0.85, 0.9, 0.95] }); emis.box(AX + 0.1245, 1.332, z - 0.3 - 0.004, 0.0015, 0.004, 0.004, { col: [1, 0.8, 0.3] }); // card pictogram (chip end in)
    rb(pl, AX + 0.078, 1.17, z - 0.3, 0.014, 0.075, 0.075, 0.01, C('#16181b')); for (const [dz, hh] of [[-0.012, 0.014], [0, 0.024], [0.012, 0.034]]) emis.box(AX + 0.0855, 1.17, z - 0.3 + dz, 0.0015, hh, 0.0025, { col: [0.75, 0.85, 1] }); // contactless )))
    pl.cylinder(AX + 0.112, 1.075, z + 0.25, 0.006, 0.006, 0.01, 10, { col: C('#0c0c0d') }); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pl.box(AX + 0.113, 1.11 + i * 0.012, z + 0.235 + j * 0.012, 0.004, 0.005, 0.005, { col: C('#202226') }); // headphone jack · speaker
    for (const s2 of [-1, 1]) emis.box(AX + 0.218, 1.39, z + s2 * 0.235, 0.004, 0.42, 0.004, { col: [0.35, 0.6, 1] }); rb(chrome, AX + 0.066, 0.9, z, 0.014, 0.13, 0.44, 0.012, C('#b4b8bc')); // lit hood edges · cash-slot bezel
    pl.box(AX + 0.075, 1.46, z - 0.3, 0.012, 0.012, 0.09, { col: C('#0c0c0d') }); // receipt slot
    pl.box(AX + 0.074, 0.9, z, 0.012, 0.08, 0.36, { col: C('#0c0c0d') }); for (const [dy, h] of [[0.945, 0.01], [0.855, 0.01]]) chrome.box(AX + 0.075, dy, z, 0.016, h, 0.38, { col: WHITE }); emis.box(AX + 0.076, 0.965, z, 0.002, 0.008, 0.3, { col: [0.3, 1, 0.45] }); // cash slot
    pl.box(AX + 0.074, 0.72, z + 0.05, 0.012, 0.02, 0.3, { col: C('#0c0c0d') }); // deposit slot
    pl.box(AX + 0.11, 1.645, z, 0.01, 0.014, 0.014, { col: C('#050505') }); // camera
    face(sign, AX + 0.072, 1.78, z, 0.14, 0.14, IN_UV.logo, '+x');
    // the screen: its own mesh (canvas, repainted by the ATM interface)
    // 73rd: drawn at twice the resolution (the same layout, scaled) and finished like a real backlit LCD (lcdFinish)
    let screen = null; if (hasCanvas()) { const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 768; const ctx = cv.getContext('2d'); paintATM(ctx, ATM_IDLE_VIEW); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const mat = new THREE.MeshBasicMaterial({ map: tex }); mat.userData.own = true; mat.name = 'CMB · ATM screen ' + (i + 1); // 74th: named (Texture Studio) const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.225), mat); mesh.position.set(AX + 0.1112, 1.385, z); mesh.rotation.y = Math.PI / 2; mesh.name = 'atm-screen-' + i; g.add(mesh); screen = { cv, ctx, tex, mesh };
      const gl = new THREE.Mesh(ATM_GLASS_GEO(), atmGlassMat()); gl.position.set(AX + 0.1168, 1.385, z); gl.rotation.y = Math.PI / 2; gl.name = 'atm-glass-' + i; gl.renderOrder = 2; g.add(gl); }
    return { i, d, z, stand: [B.atmStandX, z], slot: [AX + 0.1245, 1.3, z - 0.3], user: null, player: false, screen, paint(view) { if (!this.screen) return; paintATM(this.screen.ctx, view || ATM_IDLE_VIEW); this.screen.tex.needsUpdate = true; } }; });
  if (hasCanvas() && keyLegends.n) { const lm = new THREE.Mesh(keyLegends.mb.build(), atmLegendMat()); lm.name = 'atm-key-legends'; g.add(lm); } // both pads' engraved legends: one mesh
  part('ATM privacy screen'); { const fz = Z((B.atmD[0] + B.atmD[1]) / 2); glass.box(AX + 0.32, 1.5, fz, 0.6, 1.2, 0.02); metal.box(AX + 0.62, 1.5, fz, 0.02, 1.22, 0.03, { col: steelC }); ob(AX, AX + 0.64, (B.atmD[0] + B.atmD[1]) / 2 - 0.03, (B.atmD[0] + B.atmD[1]) / 2 + 0.03); }
  part('Litter bin'); BM.litterBin(k, -6.72, Z(4.45)); // 77th: beaded stainless body, domed lid with swing flap ob(-6.9, -6.54, 4.27, 4.63);
  part('Queue floor line'); paint.box(-4.9, 0.002, Z(4.35), 2.6, 0.003, 0.06, { col: C('#d9b42a') }); // "please wait behind the line" floor stripe

  // ---- queue-ticket kiosk
  part('Queue-ticket kiosk');
  { const x = -1.5, z = Z(2.22); BM.ticketKiosk(k, x, z, navy); // 77th: rounded body, bezel, printer with a ticket, navy cap + brass line
    face(k.get('screen'), x, 1.08, z + 0.153, 0.32, 0.16, SCREEN_UV.kiosk, '+z'); face(sign, x, 1.32, z + 0.162, 0.1, 0.05, IN_UV.logo, '+z'); ob(x - 0.22, x + 0.22, 2.06, 2.38); }

  // ---- reception / enquiries desk
  part('Reception desk'); const REC = { x: 2.3, d: 3.0 }; { const x = REC.x, cz = Z(3.05), w = 2.2;
    wal.box(x, 0.55, cz, w, 1.1, 0.2, { col: WHITE }); mrb.box(x, 1.12, cz, w + 0.06, 0.04, 0.26, { col: WHITE }); paint.box(x, 0.9, Z(2.95) + 0.004, w, 0.1, 0.006, { col: navy }); metal.box(x, 0.84, Z(2.95) + 0.005, w, 0.008, 0.004, { col: gold });
    face(sign, x, 0.52, Z(2.95) + 0.006, 0.34, 0.34, IN_UV.logo, '+z'); paint.box(x, 0.04, Z(2.97), w - 0.04, 0.08, 0.04, { col: C('#1b1d21') });
    paint.box(x, 0.735, Z(3.42), w, 0.03, 0.56, { col: C('#ebe7df') }); for (const sx of [-1, 1]) wal.box(x + sx * (w / 2 - 0.02), 0.36, Z(3.42), 0.04, 0.72, 0.56, { col: WHITE });
    monitor(k, x + 0.35, 0.75, Z(3.3), Math.PI, 0.46, SCREEN_UV.office); keyboard(k, x + 0.25, 0.75, Z(3.55), Math.PI); deskPhone(k, x - 0.55, 0.75, Z(3.4), Math.PI);
    pl.box(x - 0.75, 1.15, cz, 0.1, 0.03, 0.07, { col: C('#d8d6d0') }); face(prints, x - 0.2, 1.215, Z(3.08), 0.08, 0.12, POSTER_UV.brochure(0), '+z'); metal.box(x - 0.2, 1.17, Z(3.1), 0.09, 0.1, 0.04, { col: steelC }); // card holder · leaflet stand
    lathe(k.get('glaze'), x + 0.85, 1.14, cz, [[0.05, 0], [0.06, 0.1], [0.001, 0.1]], 12, C('#f4f2ee')); for (let i = 0; i < 4; i++) paint.box(x + 0.85 + (i - 1.5) * 0.02, 1.38, cz, 0.012, 0.36, 0.01, { col: C('#4c7a3f') }); for (let i = 0; i < 5; i++) paint.box(x + 0.83 + i * 0.012, 1.5 + i * 0.03, cz + 0.02, 0.05, 0.035, 0.012, { col: C(i % 2 ? '#e9e4f0' : '#d8c8e8') }); // orchid
    part('Enquiries sign'); for (const sx of [-0.45, 0.45]) metal.box(x + sx, 3.1, Z(3.2), 0.01, 0.55 + (H - 3.6), 0.01, { col: steelC }); paint.box(x, 2.72, Z(3.2), 1.04, 0.52, 0.03, { col: navy });
    face(sign, x, 2.72, Z(3.2) + 0.016, 1.0, 0.48, IN_UV.enquiries, '+z'); face(sign, x, 2.72, Z(3.2) - 0.016, 1.0, 0.48, IN_UV.enquiries, '-z');
    part('Reception desk'); ob(x - w / 2 - 0.05, x + w / 2 + 0.05, 2.9, 4.6); }

  // ---- right wall: plant, posters, brochure rack · left wall: water dispenser, notice, clock, plant
  part('Hall air conditioner'); const acs = []; acs.push(acUnit(k, xR, 2.93, Z(2.7), -Math.PI / 2, H)); // 71st: the hall's wall split air conditioner (its sound: BankSound loops)
  part('Plant by the door'); plant(k, 6.55, Z(0.6), 1.3); ob(6.3, 6.8, 0.35, 0.85);
  part('Poster: fixed deposits'); paint.box(xR - 0.012, 1.6, Z(1.5), 0.02, 0.94, 0.64, { col: C('#c9b27a') }); face(prints, xR - 0.024, 1.6, Z(1.5), 0.6, 0.9, POSTER_UV.fd, '-x');
  part('Poster: home loans'); paint.box(xR - 0.012, 1.6, Z(3.9), 0.02, 0.94, 0.64, { col: C('#c9b27a') }); face(prints, xR - 0.024, 1.6, Z(3.9), 0.6, 0.9, POSTER_UV.home, '-x');
  part('Brochure rack'); { const z = Z(2.7); metal.box(xR - 0.11, 1.25, z, 0.2, 0.9, 0.62, { col: C('#c8cbce'), top: true }); for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const zz = z - 0.22 + c * 0.145, yy = 1.1 + r * 0.38; glass.box(xR - 0.2, yy, zz, 0.012, 0.16, 0.13); face(prints, xR - 0.17, yy + 0.06, zz, 0.12, 0.16, POSTER_UV.brochure(r * 4 + c), '-x'); } ob(xR - 0.24, xR, 2.36, 3.04); }
  part('Water dispenser'); { const x = -6.72, z = Z(5.6); BM.waterDispenser(k, x, z, 0); // 77th: cabinet, taps, drip grille, ribbed 19 l bottle with its water, cup holder
    ob(x - 0.2, x + 0.2, 5.4, 5.8); }
  part('Notice: charges and limits'); paint.box(xL + 0.012, 1.6, Z(6.7), 0.02, 0.44, 0.84, { col: C('#c9b27a') }); face(prints, xL + 0.024, 1.6, Z(6.7), 0.8, 0.4, POSTER_UV.notice, '+x');
  part('Wall clock'); face(sign, xL + 0.01, 2.7, Z(6.7), 0.42, 0.42, IN_UV.clock, '+x');
  part('Plant by the counter'); plant(k, -6.5, Z(7.95), 1.5); ob(-6.78, -6.22, 7.67, 8.23);

  // ---- waiting area: pedestal chairs; the seat + back is one instanced top raised / lowered to each sitter (gas lift)
  const seats = []; { const ROWS = [5.3, 6.6]; const XS = [-5.3, -4.64, -3.98, -3.32, 1.4, 2.06, 2.72, 3.38];
    for (const d of ROWS) for (const x of XS) seats.push({ x, d, z: Z(d), yaw: Math.PI, top: 0.42, occ: null, lane: d === ROWS[0] ? 5.95 : 7.25 });
    const tb = new MeshBuilder(); BM.waitingChairTop(tb); // 77th: contoured cushion + back on a moulded shell, T-arms (seat top still at 0)
    const geo = tb.build(); const im = new THREE.InstancedMesh(geo, bankMaterials().fabric, seats.length); im.name = 'bank-waiting-chairs'; im.receiveShadow = true; im.castShadow = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const setTop = (i, top) => { const s = seats[i]; s.top = top; im.setMatrixAt(i, m4.compose(v.set(s.x, top, s.z), q, one)); im.instanceMatrix.needsUpdate = true; };
    part('Waiting chair bases'); seats.forEach((s, i) => { setTop(i, s.top); BM.waitingChairBase(chrome, pl, s.x, s.z); });
    g.add(im); seats.setTop = setTop; seats.mesh = im;
    for (const d of ROWS) { ob(-5.62, -3.0, d - 0.3, d + 0.28); ob(1.08, 3.7, d - 0.3, d + 0.28); }
    }

  // ---- manager's office (glass partition, open doorway on the hall side); counter 4's queue space in front of it stays open
  part("Manager's office partition"); const OF = { x0: 4.6, x1: xR, d0: 4.8, d1: 7.3, door: [6.35, 7.22] }; {
    const band = (cx, cz, w, d) => { for (const s2 of [-1, 1]) paint.box(cx + (d > w ? s2 * 0.012 : 0), 1.25, cz + (w >= d ? s2 * 0.012 : 0), Math.max(w, 0.004), 0.32, Math.max(d, 0.004), { col: C('#f4f4f2') }); }; // frosted manifestation band
    const gx = (zz, xa, xb) => { const cx = (xa + xb) / 2, w = xb - xa; cglass.box(cx, H / 2, zz, w, H - 0.02, 0.02); paint.box(cx, 0.04, zz, w, 0.08, 0.06, { col: bronze }); paint.box(cx, H - 0.03, zz, w, 0.06, 0.06, { col: bronze }); band(cx, zz, w, 0.004); };
    const gz = (xx, da, db) => { const cz = Z((da + db) / 2), d = db - da; cglass.box(xx, H / 2, cz, 0.02, H - 0.02, d); paint.box(xx, 0.04, cz, 0.06, 0.08, d, { col: bronze }); paint.box(xx, H - 0.03, cz, 0.06, 0.06, d, { col: bronze }); band(xx, cz, 0.004, d); };
    gx(Z(OF.d0), OF.x0, OF.x1); gx(Z(OF.d1), OF.x0, OF.x1); gz(OF.x0, OF.d0, OF.door[0]); gz(OF.x0, OF.door[1], OF.d1);
    for (const [px, d] of [[OF.x0, OF.d0], [OF.x0, OF.door[0]], [OF.x0, OF.door[1]], [OF.x0, OF.d1]]) paint.box(px, H / 2, Z(d), 0.07, H, 0.07, { col: bronze });
    paint.box(OF.x0, 2.3 + (H - 2.3) / 2, Z((OF.door[0] + OF.door[1]) / 2), 0.08, H - 2.3, OF.door[1] - OF.door[0], { col: C('#efeae1') }); // transom over the doorway
    paint.box(OF.x0 - 0.045, 2.55, Z((OF.door[0] + OF.door[1]) / 2), 0.012, 0.3, 0.92, { col: C('#d8d4ca') }); face(sign, OF.x0 - 0.052, 2.55, Z((OF.door[0] + OF.door[1]) / 2), 0.88, 0.22, IN_UV.office, '-x');
    // furniture: walnut desk, executive chair (built to the manager, below), two visitor chairs, credenza, plant, framed logo
    part("Manager's desk"); const dx = 6.1, dz = Z(5.95); wal.box(dx, 0.73, dz, 1.2, 0.04, 0.66, { col: WHITE }); for (const sx of [-1, 1]) wal.box(dx + sx * 0.58, 0.36, dz, 0.04, 0.72, 0.64, { col: WHITE }); wal.box(dx, 0.45, dz - 0.3, 1.12, 0.5, 0.02, { col: WHITE });
    monitor(k, dx + 0.28, 0.75, Z(6.1), 0, 0.46, SCREEN_UV.office); keyboard(k, dx + 0.1, 0.75, Z(5.78), 0); deskPhone(k, dx - 0.42, 0.75, Z(5.85), 0); paint.box(dx - 0.12, 0.755, Z(6.05), 0.21, 0.01, 0.3, { col: C('#f6f4ee') }); brass.cylinder(dx - 0.3, 0.75, Z(6.15), 0.015, 0.015, 0.12, 8, { col: WHITE });
    [5.75, 6.45].forEach((vx, i) => { part("Manager's visitor chair " + (i + 1)); officeChair(k, vx, Z(6.68), 0, 0.45, { col: '#1f3556' }); });
    part("Manager's credenza"); metal.box(xR - 0.16, 0.38, Z(5.15), 0.3, 0.76, 0.62, { col: C('#d7d5cf') }); wal.box(xR - 0.16, 0.77, Z(5.15), 0.32, 0.02, 0.64, { col: WHITE }); part("Plant in the manager's office"); plant(k, 4.95, Z(5.15), 1.1);
    part("Framed logo (manager's office)"); paint.box(xR - 0.012, 1.75, Z(5.15), 0.02, 0.56, 0.56, { col: C('#1b1612') }); face(sign, xR - 0.024, 1.75, Z(5.15), 0.5, 0.5, IN_UV.logo, '-x');
    part("Manager's office partition"); ob(OF.x0, OF.x1, OF.d0 - 0.04, OF.d0 + 0.04); ob(OF.x0, OF.x1, OF.d1 - 0.04, OF.d1 + 0.04); ob(OF.x0 - 0.04, OF.x0 + 0.04, OF.d0, OF.door[0]); ob(OF.x0 - 0.04, OF.x0 + 0.04, OF.door[1], OF.d1);
    part("Manager's desk"); ob(5.48, 6.72, 5.62, 6.28); part("Manager's desk"); ob(5.78, 6.42, 4.84, 5.6); part("Manager's visitor chair 1"); ob(5.45, 6.1, 6.36, 6.98); part("Manager's visitor chair 2"); ob(6.1, 6.75, 6.36, 6.98); part("Manager's credenza"); ob(xR - 0.32, xR, 4.84, 5.46); part("Plant in the manager's office"); ob(4.7, 5.2, 4.9, 5.4); }

  // ---- teller counter, security glass, staff door
  let staffDoorLeaf = null; // 73rd
  part('Teller counter'); const WINX = B.windows, cE = 6.15; { const cx = (xL + cE) / 2, cw = cE - xL;
    wal.box(cx, 0.5, Z(9.01), cw, 1.0, 0.78, { col: WHITE }); paint.box(cx, 0.05, Z(8.6) + 0.004, cw, 0.1, 0.012, { col: C('#14161a') }); metal.box(cx, 0.92, Z(8.6) + 0.006, cw, 0.012, 0.006, { col: gold });
    mrbD.box(cx, 1.02, Z(8.98), cw, 0.04, 0.86, { col: WHITE });
    for (let i = 0; i < 4; i++) { const wx = WINX[i]; paint.box(wx, 0.62, Z(8.6) + 0.008, 0.9, 0.36, 0.006, { col: navy }); face(sign, wx, 0.62, Z(8.6) + 0.012, 0.34, 0.17, IN_UV.counter(i), '+z'); }
    // glass to the bulkhead, steel posts at the fins, speech grilles, cash trays, card terminals, pens on chains
    part('Counter security glass'); glass.box(cx, (1.04 + bulkY) / 2, Z(9.0), cw, bulkY - 1.04, 0.025); metal.box(cx, 1.05, Z(9.0), cw, 0.02, 0.05, { col: steelC });
    for (const fx of [xL + 0.03, -3.3, 0, 3.3, cE]) metal.box(fx, (1.04 + bulkY) / 2, Z(9.0), 0.05, bulkY - 1.04, 0.05, { col: steelC });
    part('Counter privacy fins'); for (const fx of [-3.3, 0, 3.3]) { paint.box(fx, 1.58, Z(8.6), 0.05, 1.08, 0.8, { col: navy }); metal.box(fx, 2.13, Z(8.6), 0.06, 0.02, 0.82, { col: gold }); ob(fx - 0.04, fx + 0.04, 8.2, 8.6); }
    for (let i = 0; i < 4; i++) { part('Counter ' + (i + 1) + ' fittings'); const wx = WINX[i]; chrome.box(wx, 1.45, Z(9.0) + 0.014, 0.18, 0.14, 0.004, { col: C('#d0d3d6') }); for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) pl.box(wx - 0.06 + c * 0.03, 1.405 + r * 0.03, Z(9.0) + 0.017, 0.012, 0.012, 0.002, { col: C('#2a2c30') });
      metal.box(wx, 1.045, Z(9.0), 0.4, 0.012, 0.32, { col: C('#9ea2a6') }); metal.box(wx, 1.06, Z(8.86), 0.4, 0.03, 0.01, { col: C('#9ea2a6') });
      pl.box(wx + 0.38, 1.07, Z(8.74), 0.09, 0.05, 0.17, { col: C('#202226') }); emis.box(wx + 0.38, 1.096, Z(8.7), 0.06, 0.002, 0.05, { col: [0.45, 0.6, 0.55] });
      pl.box(wx - 0.4, 1.045, Z(8.72), 0.03, 0.01, 0.03, { col: C('#202226') }); pl.box(wx - 0.38, 1.047, Z(8.7), 0.012, 0.012, 0.14, { col: C('#1d3b7a'), rotY: 0.4 });
      face(sign, wx, H - 0.2, Z(8.6) + 0.03, 0.68, 0.34, IN_UV.counter(i), '+z'); }
    part('Now-serving display'); face(k.get('screen'), 0, H - 0.2, Z(8.6) + 0.03, 0.9, 0.22, SCREEN_UV.serving, '+z');
    part('Counter closed sign'); face(sign, WINX[3], 1.32, Z(9.0) - 0.016, 0.4, 0.2, IN_UV.closed, '+z'); paint.box(WINX[3], 1.32, Z(9.0) - 0.022, 0.42, 0.22, 0.008, { col: C('#f4f2ec') }); metal.box(WINX[3], 1.13, Z(9.04), 0.18, 0.16, 0.02, { col: steelC }); // closed plate on its stand
    // staff door (glazed partition above)
    part('Staff door frame');
    const dx0 = cE, dx1 = xR, dcx = (dx0 + dx1) / 2; paint.box(dx0 + 0.03, 1.05, Z(9.0), 0.06, 2.1, 0.12, { col: bronze }); paint.box(dx1 - 0.03, 1.05, Z(9.0), 0.06, 2.1, 0.12, { col: bronze }); paint.box(dcx, 2.13, Z(9.0), dx1 - dx0, 0.06, 0.12, { col: bronze });
    // 73rd: the leaf is its own small mesh group hinged on the right jamb, so staff going off / coming on shift open it (BankShift)
    { const dk = useBankMaterials(new Kit()); Object.assign(dk.extra, { cmbSign: signMat }); const hx = dx1 - 0.07, lw = dx1 - dx0 - 0.14, L0 = (x) => x - hx;
      dk.get('walnut').box(-lw / 2, 1.04, 0, lw, 2.04, 0.045, { col: WHITE }); face(dk.get('cmbSign'), -lw / 2, 1.55, 0.024, 0.32, 0.16, IN_UV.staff, '+z');
      for (const s2 of [1, -1]) { dk.get('gold').box(L0(dx0 + 0.16), 1.05, s2 * 0.04, 0.02, 0.02, 0.04, { col: WHITE }); dk.get('gold').box(L0(dx0 + 0.16) + 0.05, 1.05, s2 * 0.075, 0.12, 0.02, 0.02, { col: WHITE }); } // lever handles both sides
      const leaf = dk.into(new THREE.Group(), { cast: false, receive: true }); leaf.name = 'bank-staff-door'; leaf.position.set(hx, 0, Z(9.0)); g.add(leaf); staffDoorLeaf = { leaf, ang: 0, x: dcx, z: Z(9.0) }; }
    pl.box(dx1 - 0.16, 1.3, Z(9.0) + 0.03, 0.07, 0.11, 0.02, { col: C('#202226') }); emis.box(dx1 - 0.16, 1.33, Z(9.0) + 0.041, 0.012, 0.012, 0.002, { col: [1, 0.2, 0.15] }); // card-access reader
    glass.box(dcx, (2.16 + bulkY) / 2, Z(9.0), dx1 - dx0 - 0.02, bulkY - 2.16, 0.025);
    part('Teller counter'); ob(xL, xR, 8.6, D); }

  // ---- staff side: work surface, pedestals, workstations, teller chairs (built to the tellers), back wall
  const stand = { tellers: [], recep: null, mgr: null, sup: null, guard: null };
  const PHONE = { x: -3.3 }; let callPh = null; // 71st: the back-office phone (filled in with the back wall)
  const staffSpecs = [makeBankStaffAppearance(6701, { sex: 'f' }), makeBankStaffAppearance(6702, { sex: 'm' }), makeBankStaffAppearance(6703, { sex: 'f' })];
  part('Staff work surface'); { const cx = (xL + cE) / 2, cw = cE - xL; paint.box(cx, 0.735, Z(9.7), cw, 0.03, 0.6, { col: C('#ebe7df') });
    for (const px of [xL + 0.3, -3.3, 0, 3.3, cE - 0.3]) metal.box(px, 0.36, Z(9.68), 0.44, 0.72, 0.52, { col: C('#c9ccd0') });
    for (let i = 0; i < 4; i++) { part('Teller workstation ' + (i + 1)); const wx = WINX[i]; monitor(k, wx - 0.28, 0.75, Z(9.55), Math.PI, 0.52, B.staffed.includes(i) ? SCREEN_UV.teller : SCREEN_UV.desktop); keyboard(k, wx - 0.05, 0.75, Z(9.86), Math.PI);
      pl.box(wx + 0.42, 0.85, Z(9.62), 0.26, 0.2, 0.24, { col: C('#9a9ea4') }); pl.box(wx + 0.42, 0.96, Z(9.66), 0.18, 0.02, 0.1, { col: C('#202226') }); // note counter
      pl.box(wx + 0.75, 0.81, Z(9.6), 0.16, 0.12, 0.2, { col: C('#dcdcd8') }); deskPhone(k, wx - 0.75, 0.75, Z(9.65), Math.PI); pl.box(wx + 0.5, 0.66, Z(9.75), 0.4, 0.1, 0.4, { col: C('#2a2c30') }); // printer · phone · cash drawer
      paint.box(wx + 1.05, 0.76, Z(9.75), 0.24, 0.02, 0.32, { col: C('#f6f4ee') }); }
    staffSpecs.forEach((sp, i) => { const ch = new Character(sp); const top = Math.max(0.3, Math.min(0.55, seatTopFor(ch))); const wx = WINX[B.staffed[i]];
      const ck = useBankMaterials(new Kit()); officeChair(ck, 0, 0, 0, top); const chair = ck.into(new THREE.Group(), { cast: false, receive: true }); chair.name = 'bank-teller-chair-' + i; chair.position.set(wx, 0, Z(10.35)); g.add(chair); // 71st: its own group, so it can roll
      ch.root.position.set(wx, 0, Z(10.35) - 0.04); ch.root.rotation.y = 0; g.add(ch.root); ch.anim.seated = true;
      stand.tellers.push({ ch, win: B.staffed[i], x: wx, rnd: rngOf(6710 + i), serving: null, act: null, actT: 0, chair, chairZ: Z(10.35) }); });
    part('Empty teller chair (counter 4)'); for (const wx of [WINX[3]]) officeChair(k, wx, Z(10.45), 0.3, 0.45);
    // back wall: lit feature band, vault door, filing cabinets, copier
    part('Back wall feature band');
    // centred behind counter 2, between the privacy fins at x 0 and 3.3: seen from the hall the fins (4.4 m in front of this
    // wall) fall either side of the wordmark instead of across it
    { const bx = 1.65; paint.box(bx, 2.1, z0 + 0.025, 3.4, 1.8, 0.05, { col: navy }); for (const [y, h] of [[1.2, 0.012], [3.0, 0.012]]) metal.box(bx, y, z0 + 0.052, 3.4, h, 0.006, { col: gold }); face(sign, bx, 2.25, z0 + 0.054, 3.2, 0.8, IN_UV.wordmark, '+z');
      emis.box(bx, 3.06, z0 + 0.07, 3.2, 0.01, 0.02, { col: [1, 0.92, 0.78] }); }
    part('Vault door'); BM.vaultDoor(k, -5.1, 1.12, z0); // 77th: stepped round door, bolts, hinge, 5-spoke wheel, combination dial (BankModels.js)
    part('Filing cabinets'); for (let i = 0; i < 4; i++) { const fx = 3.75 + i * 0.52; metal.box(fx, 0.66, z0 + 0.32, 0.5, 1.32, 0.6, { col: C('#8f949a') }); for (let j = 0; j < 4; j++) { paint.box(fx, 0.2 + j * 0.31, z0 + 0.622, 0.46, 0.006, 0.006, { col: C('#5e6268') }); metal.box(fx, 0.3 + j * 0.31, z0 + 0.63, 0.12, 0.02, 0.02, { col: C('#d4d7da') }); } }
    // 71st: back-office landline on a walnut credenza (the phone the officers get up to answer), the wall split AC above it
    part('Back-office credenza and phone'); { const cx = PHONE.x, cz = z0 + 0.235; wal.box(cx, 0.375, cz, 1.0, 0.75, 0.44, { col: WHITE }); paint.box(cx, 0.755, cz, 1.02, 0.012, 0.46, { col: C('#ebe7df') }); paint.box(cx, 0.06, cz + 0.2, 0.96, 0.08, 0.04, { col: C('#1b1d21') });
      for (const dx of [-0.25, 0.25]) { paint.box(cx + dx, 0.4, cz + 0.221, 0.004, 0.62, 0.003, { col: C('#3a2a1e') }); metal.box(cx + dx + (dx < 0 ? 0.2 : -0.2), 0.52, cz + 0.232, 0.012, 0.12, 0.014, { col: steelC }); } paint.box(cx, 0.4, cz + 0.221, 0.003, 0.62, 0.003, { col: C('#3a2a1e') });
      pl.box(cx - 0.3, 0.775, cz + 0.02, 0.26, 0.03, 0.33, { col: C('#2a2c30') }); paint.box(cx - 0.3, 0.792, cz + 0.02, 0.22, 0.004, 0.3, { col: C('#f6f4ee') }); // document tray
      paint.box(cx + 0.36, 0.764, cz + 0.06, 0.15, 0.006, 0.2, { col: C('#f3eedc') }); pl.cylinder(cx + 0.36, 0.77, cz - 0.1, 0.035, 0.035, 0.1, 12, { col: C('#202226') }); for (const [dx, col] of [[-0.01, '#1d3b7a'], [0.012, '#b8352c']]) pl.cylinder(cx + 0.36 + dx, 0.84, cz - 0.1, 0.004, 0.004, 0.12, 6, { col: C(col) }); // notepad, pen pot
      callPh = callPhone(k, g, PHONE.x + 0.1, 0.761, cz + 0.02, 0); }
    part('Back-office air conditioner'); acs.push(acUnit(k, PHONE.x, 2.8, z0, 0, H));
    part('Photocopier'); { const cx2 = 6.5; pl.box(cx2, 0.5, z0 + 0.4, 0.6, 1.0, 0.62, { col: C('#e4e4e0') }); pl.box(cx2, 1.02, z0 + 0.4, 0.6, 0.04, 0.62, { col: C('#2a2c30') }); pl.box(cx2, 0.92, z0 + 0.72, 0.4, 0.06, 0.02, { col: C('#3a3c40') }); }
  }

  // ---- reception, manager, supervisor, guard
  { const sp = makeBankStaffAppearance(6704, { sex: 'f' }); const ch = new Character(sp); const top = Math.max(0.3, Math.min(0.55, seatTopFor(ch))); part('Reception chair'); officeChair(k, REC.x, Z(4.15), 0, top); ch.root.position.set(REC.x, 0, Z(4.15) - 0.04); g.add(ch.root); ch.anim.seated = true; stand.recep = { ch, rnd: rngOf(6720) }; }
  { const sp = makeBankStaffAppearance(6705, { sex: 'm', role: 'manager' }); const ch = new Character(sp); const top = Math.max(0.3, Math.min(0.55, seatTopFor(ch))); part("Manager's chair"); officeChair(k, 6.1, Z(5.22), Math.PI, top, { high: true, col: '#1b1c20' }); ch.root.position.set(6.1, 0, Z(5.22) + 0.04); ch.root.rotation.y = Math.PI; g.add(ch.root); ch.anim.seated = true; stand.mgr = { ch, rnd: rngOf(6730) }; }
  { const sp = makeBankStaffAppearance(6706, { sex: 'm' }); const ch = new Character(sp); ch.root.position.set(4.7, 0, Z(11.9)); ch.root.rotation.y = -0.3; g.add(ch.root); stand.sup = { ch, rnd: rngOf(6740) }; }
  { const sp = makeBankStaffAppearance(6707, { sex: 'm', role: 'guard' }); const ch = new Character(sp); const gx = 2.05, gd = 1.05; ch.root.position.set(gx, 0, Z(gd)); ch.root.rotation.y = Math.atan2(-1.6 - gx, Z(5.0) - Z(gd)); g.add(ch.root); stand.guard = { ch, rnd: rngOf(6750), x: gx, z: Z(gd), yaw0: ch.root.rotation.y }; ob(gx - 0.25, gx + 0.25, gd - 0.25, gd + 0.25); }
  for (const p of [...stand.tellers, stand.recep, stand.mgr, stand.sup, stand.guard]) for (let i = 0; i < 20; i++) p.ch.anim.update(0.05, 0);

  part(null); const kitMeshes = k.meshes({ cast: false, receive: true }); for (const m of kitMeshes) g.add(m);
  const parts = collectParts(kitMeshes, obs); { const pk = modelPackNow(); if (pk && pk.bank) try { applyLayout(parts, pk.bank); } catch (e) { console.warn('[bank] layout not applied', e); } } // 73rd: the saved bank layout (bank-edit)
  const lights = [{ p: [-4.2, H - 0.35, Z(6.0)], color: 0xfff4e6, i: 8, d: 9, decay: 1.4 }, { p: [2.4, H - 0.35, Z(6.0)], color: 0xfff4e6, i: 8, d: 9, decay: 1.4 }, { p: [0, H - 0.5, Z(8.0)], color: 0xfff6ea, i: 9, d: 10, decay: 1.3 },
    { p: [-5.5, 3.0, Z(2.4)], color: 0xeef4ff, i: 5.5, d: 5.5, decay: 1.6 }, { p: [1.4, H - 0.35, Z(2.2)], color: 0xfff4e6, i: 7, d: 8, decay: 1.4 }, { p: [0, H - 0.35, Z(11.3)], color: 0xfff8f0, i: 7, d: 9, decay: 1.4 }];

  // ================================================================================== the room object + its people
  const nStatic = obs.length;
  for (const p of [...stand.tellers, stand.recep, stand.mgr, stand.sup, stand.guard]) if (p && p.ch) p.ch.bankOwned = true; // 73rd: the room's own people (room.ext skips them)
  const room = { parts, id: 'bank', bank: true, name: B.name, def: { kind: 'bank', name: B.name }, g, bounds: { x0, x1, z0, z1: zf - 0.02 }, obstacles: obs, lights, H, prompt: null, atms, seats, stand, customers: [], stats: { spawned: 0, left: 0, handed: 0, atmUses: 0, tellerVisits: 0, sat: 0 } };
  // 73rd: the security officer's pump shotgun (slung until the player comes in wanted: BankGuardGun.js)
  const guardGun = makeGuardGun({ game, g, gd: stand.guard, B: { xL, xR, z0, zF: zf, H }, obs, nObs: nStatic, rng: rngOf(6909),
    bodies: () => { const out = []; for (const c of pool) if (c.on && c.ch.root.visible) out.push({ x: c.x, z: c.z }); for (const p of [...stand.tellers, stand.recep, stand.mgr, stand.sup]) if (p && p.ch.root.visible && !p.away) out.push({ x: p.ch.root.position.x, z: p.ch.root.position.z }); return out; },
    say: (i) => say(stand.guard, bankGuardId(i + 1), BANK_GUARD[i], stand.guard.x, stand.guard.z, 'Security officer', 30),
    fright: () => fright(6, 10) });
  room.guardGun = guardGun;
  room.greet = () => { if (game.hud && staffOn()) game.hud.subtitle('Security officer', 'Good day. Welcome to Ceylon Meridian Bank — the ATMs are on your left.', '', 3.6); };
  room.onEnter = () => { BankSound.ambience(true); };
  room.onExit = () => { BankSound.ambience(false); };
  const hour = () => (game.atmos ? game.atmos.hour : 12);
  const staffOn = () => { const h = hour(); return h >= B.open[0] && h < B.open[1]; };
  room.staffOn = staffOn;

  // ---- customers: lanes and spots (x, d) → local (x, z)
  const P2 = (x, d) => [x, Z(d)]; const HUB = P2(-0.95, 4.6), DOOR_IN = P2(0, 0.9), DOOR_OUT = [0, 1.0], STREET = [2.6, 1.7];
  // 73rd: two lanes on the pavement so a crowded door never has people walking through each other — arrivals come up on the right
  // (and wait just outside the door zone while someone is in the doorway), leavers go out to the left; APPROACH is where a
  // passer-by from the street crowd who has decided to bank becomes one of the room's customers
  const STREET_OUT = [-1.75, 1.85], WALK_ON = [-7, 1.9], APPROACH = [1.3, 1.75];
  // where each side waits for the doorway (one person wide) — off the other side's line: arrivals to the right of the door outside,
  // leavers to the left of it inside; the doorway itself is a token (room.doorBy) handed to one person at a time
  const ARR_WAIT = [0.55, 1.45], LEAVE_WAIT = P2(-0.6, 1.35);
  // 73rd: real lines for the doorway (several people leaving / arriving at once used to crowd round one waiting point, in each
  // other's way, and could lock solid): leavers line up along the inside of the front wall to the left of the door, arrivals along
  // the shop front to the right of it, both clear of the corridor through the door; you join at the back (nobody passes anyone),
  // the line moves up, and only the one at the front asks for the doorway token. Customers and staff (BankShift) use the same lines.
  const mkLine = (spots, side, over) => { const n = spots.length; spots.push(...over); return { spots, by: spots.map(() => null), side, real: n }; }; // (+ overflow places: a second row / further along)
  const LINES = { out: mkLine([[-0.95, -0.8], [-1.65, -0.8], [-2.35, -0.8], [-3.05, -0.8], [-3.75, -0.8], [-4.45, -0.8], [-5.15, -0.8]], -0.7, [[-5.85, -0.8]]),
    staff: mkLine([[2.95, -1.32], [3.65, -1.32], [4.35, -1.32], [5.05, -1.32], [5.75, -1.32], [6.45, -1.32]], -0.7, []), // (staff going home: their own line along the front window, right of the door)
    in: mkLine([[0.9, 1.4], [1.6, 1.4], [2.3, 1.4], [3.0, 1.4], [3.7, 1.4], [4.4, 1.4], [5.1, 1.4]], 0.7, [[5.8, 1.4], [6.5, 1.4], [7.2, 1.4]]) };
  const plOnSpot = (q) => { const P0 = room.pl; return !!(P0 && (P0.inside === q[1] < 0 || Math.abs(P0.z) < 2.6) && Math.hypot(P0.x - q[0], P0.z - q[1]) < 0.7); };
  const lineOcc = (Q, i, c) => { const o = Q.by[i]; if (!o || o === c) return false; if (!o.on || o.qQ !== Q || o.qI !== i) { Q.by[i] = null; return false; }
    if (o.qOut && Math.hypot(o.x - Q.spots[i][0], o.z - Q.spots[i][1]) > 0.55) { Q.by[i] = null; o.qQ = null; return false; } return true; }; // (the one leaving the front spot holds it until he is clear of it)
  const lineJoin = (Q, c) => { let k = 0; for (let i = 0; i < Q.spots.length; i++) if (lineOcc(Q, i, c)) k = i + 1; while (k < Q.spots.length && plOnSpot(Q.spots[k])) k++;
    if (k >= Q.spots.length) { k = Q.spots.length - 1; while (k > 0 && lineOcc(Q, k, c)) k--; } // (a full line: any free place — never two on one)
    Q.by[k] = c; c.qQ = Q; c.qI = k; c.qOut = false; return Q.spots[k]; };
  // the next place up the line: the player standing in the line is simply stepped past (the place beyond him)
  const nextUp = (Q, i, c) => { let j = i - 1; while (j >= 0 && plOnSpot(Q.spots[j])) j--; return j >= 0 && !lineOcc(Q, j, c) ? j : -1; };
  const lineFn = (Q) => (c, dt, m) => { const A = c.ch.anim; if (c.qQ !== Q) return true; let dx2 = 0, dz2 = 1;
    const i = c.qI, j = i > 0 && !m.mv ? nextUp(Q, i, c) : -1; if (j >= 0) { if (Q.by[i] === c) Q.by[i] = null; c.qI = j; Q.by[j] = c; m.mv = true; if (A.action) act(c, null); } // the line moves up
    const [tx, tz] = Q.spots[c.qI]; const dx = tx - c.x, dz = tz - c.z, dd = Math.hypot(dx, dz);
    if (dd > 0.04) { const st = Math.min(dd, 0.9 * dt); let ux = dx / dd, uz = dz / dd;
      // round the player if he is in the way (a step out to the open side of the line), else straight on
      const P0 = room.pl; if (P0 && (P0.inside === tz < 0 || Math.abs(P0.z) < 2.6)) { const px = P0.x - c.x, pz = P0.z - c.z, pd = Math.hypot(px, pz), fw = px * ux + pz * uz; if (pd < 1.1 && fw > 0 && fw < dd + 0.4 && Math.abs(px * uz - pz * ux) < 0.6) { const sx = 0, sz = Q.side; const k = Math.max(0, 1 - Math.abs(px * uz - pz * ux) / 0.6); ux = ux * (1 - k) + sx * k; uz = uz * (1 - k) + sz * k; const L = Math.hypot(ux, uz) || 1; ux /= L; uz /= L; } }
      if (!lineBlocked(c, c.x + ux * st, c.z + uz * st)) { c.x += ux * st; c.z += uz * st; c.speed = st / Math.max(dt, 1e-4); } else c.speed = 0; dx2 = ux; dz2 = uz; c.yaw = turn(c.yaw, Math.atan2(dx2, dz2), dt * 7); A.update(dt, c.speed); place(c); return false; }
    m.mv = false; c.speed = 0; c.yaw = turn(c.yaw, c.qI === 0 ? Math.atan2(-tx, (tz < 0 ? 0.3 : -0.3)) : Math.atan2(-tx, 0), dt * 3); /* facing up the line, the front one toward the door */ A.update(dt, 0); place(c);
    if (c.qI === 0 && m.t > 0.2) { c.qOut = true; room.stats.lineWaits = (room.stats.lineWaits || 0) + 1; return true; } return false; };
  const lineBlocked = (c, x, z) => { for (const o of pool) if (o !== c && o.on && Math.hypot(o.x - x, o.z - z) < 0.45 && Math.hypot(o.x - c.x, o.z - c.z) > Math.hypot(o.x - x, o.z - z)) return true; if (shift) for (const o of shift.crew) if (o !== c && o.on && Math.hypot(o.x - x, o.z - z) < 0.45 && Math.hypot(o.x - c.x, o.z - c.z) > Math.hypot(o.x - x, o.z - z)) return true; return false; };
  // queue up: the walk to the back of the line (pathTo(spot) → the waypoints there), then the line itself
  // (the walk ends just off the line, on its open side: the last step in is the line's own, so a place that frees up meanwhile is taken
  // straight away and nobody is left walking at a crowded spot)
  function* lineGen(c, dir, pathTo) { const Q = LINES[dir]; const spot = lineJoin(Q, c); yield { walk: pathTo([spot[0], spot[1] + Q.side]) }; yield { fn: lineFn(Q) }; }
  room.lineRoom = (dir, n = 2) => { const Q = LINES[dir]; let free = 0; for (let i = 0; i < Q.real; i++) if (!lineOcc(Q, i, null)) free++; return free >= n; };
  room.lineGen = lineGen; room.lines = LINES;
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
  let shift = null; // 73rd (set below)
  const POOL = 6; let seedN = 6800; const pool = room.customers;
  const newCustomer = () => { let sp = null; for (let t = 0; t < 6 && !(sp && isAdultSpec(sp)); t++) sp = makeAppearance(seedN++ * 13 + 5, { band: ['young', 'adult', 'adult', 'mature'][seedN % 4] }); const ch = new Character(sp); ch.bankOwned = true; ch.root.visible = false; g.add(ch.root); const c = { ch, on: false, x: 0, z: 0, yaw: 0, speed: 0, gen: null, cmd: null, rnd: rngOf(seedN * 7 + 1), loc: 'door', blockT: 0, seat: -1, atm: -1, win: -1 }; pool.push(c); return c; };
  for (let i = 0; i < POOL; i++) newCustomer();
  const act = (c, a) => { const A = c.ch.anim; if (A.action !== a) A.set(a); if (c.ch.face) c.ch.face.talking = a === 'talk' || a === 'phone'; };
  const others = (c) => { const o = pool.filter((q) => q !== c && q.on); if (shift) for (const q of shift.crew) if (q !== c && q.on) o.push(q); return o; }; // (73rd: staff changing shift are bodies too)
  const playerNearAtm = (m) => { const pl = room.pl; return m.player || (pl && pl.inside && Math.hypot(pl.x - m.stand[0], pl.z - m.stand[1]) < 1.3); };
  const freeAtm = () => atms.find((m) => !m.user && !playerNearAtm(m)) || null;
  const openWins = () => (staffOn() ? B.staffed : []);
  const freeWin = () => { for (const w of openWins()) if (!pool.some((o) => o.on && o.win === w)) return w; return -1; };
  const freeSeat = (ch) => { const top = seatTopFor(ch); if (top < 0.3 || top > 0.5) return -1; const list = seats.map((s, i) => i).filter((i) => !seats[i].occ); if (!list.length) return -1; return list[Math.floor(Math.random() * list.length)]; };

  // ---- generator scripts (one per visit); commands: walk / idle / sit / seated / rise / gone
  function* go(c, to) { const path = route(c.loc, to); yield { walk: path }; c.loc = to; }
  function* leave(c) { if (c.seat >= 0) { yield { rise: true }; } if (c.atm >= 0) { atms[c.atm].user = null; atms[c.atm].paint(null); c.atm = -1; } c.win = -1; { const pth = route(c.loc, 'door'); pth.pop(); yield* lineGen(c, 'out', (spot) => [...pth, spot]); c.loc = 'door'; } yield { walk: [DOOR_OUT, STREET_OUT] }; if (pool.length <= 3) { yield { walk: [WALK_ON] }; c.keepInPool = true; } yield { gone: true }; } // (a small pool keeps its people: they walk on along the pavement and out of the scene)
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
  const hide = (c) => { c.on = false; c.stunT = 0; c.stunA = 0; c.ch.root.visible = false; if (c.ch.root.parent !== g) g.add(c.ch.root); c.keepInPool = false; c.gen = null; c.cmd = null; if (c.seat >= 0) { seats[c.seat].occ = null; c.seat = -1; } if (c.atm >= 0) { if (atms[c.atm].user === c) { atms[c.atm].user = null; atms[c.atm].paint(null); } c.atm = -1; } c.win = -1; c.ch.anim.seated = null; c.ch.anim.set(null); };
  // 73rd: past the facade (on the pavement) a customer's body belongs to the street: parented to the scene in world space, so it is
  // drawn with the door shut, and it is a solid body for the street crowd and the player (Bodies.gatherBodies) — passers-by
  // step round people queuing at the door instead of walking through them. Back through the doorway it returns to the room.
  const walkInOf = () => game.interiors && game.interiors.walkIn;
  const place = (c) => { const W2 = walkInOf(); const out = c.z > 0.05 && W2 && game.scene; const par = out ? game.scene : g; if (c.ch.root.parent !== par) par.add(c.ch.root);
    if (out) { const [wx, wz] = W2.world(site, c.x, c.z); c.ch.root.position.set(wx, site.y0, wz); c.ch.root.rotation.y = site.yaw + c.yaw; } else { c.ch.root.position.set(c.x, 0, c.z); c.ch.root.rotation.y = c.yaw; } };
  // spawn: from the street (the player inside, the door shut: they walk in through it) or straight into a state (reseed)
  const spawn = (c, plan, fromStreet = true) => { c.on = true; c.ch.root.visible = true; c.speed = 0; c.blockT = 0; c.seat = c.atm = c.win = -1; c.ch.anim.seated = null; c.ch.anim.set(null);
    if (fromStreet) { [c.x, c.z] = STREET; c.yaw = -Math.PI / 2; c.loc = 'door'; c.gen = (function* () { yield* lineGen(c, 'in', (spot) => [spot]); yield { walk: [DOOR_IN] }; yield* visit(c, plan); })(); }
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
  // 73rd: the room keeps running while the player is outside (WalkIn calls update(dt, pl, true) for an always-simulated room that is
  // not on screen). Then nobody's skeleton is posed every frame: animation time is banked per body (animUp) and paid out round-robin,
  // one body a frame, only while the player is close enough to open the door — the bodies on the pavement (in the world) always animate
  let bgMode = false;
  const animUp = (ch, dt, sp = 0, tr) => { if (!bgMode || ch.root.parent === game.scene) { ch._bgAcc = 0; return ch.anim.update(dt, sp, tr); } ch._bgAcc = (ch._bgAcc || 0) + dt; ch._bgSp = sp; };
  const animOf = (c) => { if (!bgMode) return c.ch.anim; return c._shim || (c._shim = new Proxy(c.ch.anim, { get: (t, k) => (k === 'update' ? (dt, sp, tr) => animUp(c.ch, dt, sp, tr) : t[k]), set: (t, k, v) => { t[k] = v; return true; } })); };
  // everyone a customer must not walk through: the other customers, plus the people on the pavement by the door (room.ext, local frame)
  room.ext = []; const blockers = (c) => { const o = others(c); if (c.z > -1.6) for (const e of room.ext) o.push(e); return o; };
  const clearAt = (x, z) => { if (z > 0.1) { const W2 = walkInOf(); if (W2 && game.collision && game.collision.blocked) { const [wx, wz] = W2.world(site, x, z); if (game.collision.blocked(wx, wz, 0.22)) return false; } }
    if (z < ZF && (x < xL + 0.3 || x > xR - 0.3 || z < z0 + 0.3)) return false; if (z > ZF - 0.05 && z < 0.1 && Math.abs(x) > 0.3) return false; for (let i = 0; i < nStatic; i++) { const o = obs[i]; if (x > o.x0 - 0.25 && x < o.x1 + 0.25 && z > o.z0 - 0.25 && z < o.z1 + 0.25) return false; } return true; };
  const nearPlayer = (ax, az, bx, bz) => { const P = room.pl; if (!P || !(P.inside || Math.abs(P.z) < 2.5)) return false; const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((P.x - ax) * vx + (P.z - az) * vz) / L2)); return Math.hypot(ax + vx * t - P.x, az + vz * t - P.z) < 0.65; };
  const clearLine = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az); for (let t = 0; t <= L; t += 0.1) if (!clearAt(ax + (bx - ax) * t / L, az + (bz - az) * t / L)) return false; return true; };
  // 73rd: the front door kicked in (WalkIn.breach → room.breach): everyone jumps at the bang, then freezes — customers on their
  // feet duck down and cower, seated ones and the staff stay put, frightened (hands up if he has a gun out); the guard turns to
  // the door. A few seconds later they pick up where they were. (Scripted shift-change walkers are left to their script.)
  const stunStep = (p, ch, dt, standing) => { if (!(p.stunT > 0)) return false; if ((p.stunD -= dt) > 0) return false; const A = ch.anim;
    if (!p.stunA) { p.stunA = 1; p.stunT0 = p.stunT; A.play('flinch', 0.5); ch.face && ch.face.set && ch.face.set('surprise', 1.2); }
    else if (p.stunA === 1 && p.stunT0 - p.stunT > 0.45) { p.stunA = 2; const armed = !!(game.weapons && game.weapons.drawn); if (!A.action || A.action === 'flinch') A.set(armed && !standing ? 'handsup' : standing ? 'cower' : null); ch.face && ch.face.set && ch.face.set('fear', p.stunT + 1); }
    p.stunT -= dt; if (p.stunT <= 0) { p.stunA = 0; p.stunT = 0; if (A.action === 'cower' || A.action === 'flinch' || A.action === 'handsup') A.set(null); p._rtn = null; } return true; };
  // everyone in the hall jumps / ducks (a door kicked in: 3–6 s; 73rd: the guard's shotgun going off: longer, and he doesn't flinch)
  const fright = (a = 3, b = 6, guardToo = true) => { const R2 = () => Math.random();
    for (const c of pool) if (c.on && !(c.cmd && c.cmd.fn)) { c.stunD = 0.1 + R2() * 0.35; c.stunT = a + R2() * (b - a); c.stunA = 0; }
    for (const p of [...stand.tellers, stand.recep, stand.mgr, stand.sup, guardToo ? stand.guard : null]) if (p && (p.duty === undefined || p.duty === 'on') && !p.away) { p.stunD = 0.08 + R2() * 0.3; p.stunT = (a - 0.5) + R2() * (b - a - 0.5); p.stunA = 0; } };
  room.breach = () => { room.stats.breaches = (room.stats.breaches || 0) + 1; fright(3, 6, !(guardGun.alert || guardGun.draw > 0)); };
  const stepCustomer = (c, dt, pl) => {
    if (c.stunT > 0 && !c.staff) { const seated = c.seat >= 0 && c.ch.anim.seated; if (stunStep(c, c.ch, dt, !seated)) { c.speed = 0; animOf(c).update(dt, 0); place(c); return; } }
    if (!c.cmd) { const r = c.gen ? c.gen.next() : { done: true }; if (r.done) { hide(c); return; } c.cmd = Object.assign({ t: 0 }, r.value); if (c.cmd.walk) { c.cmd.path = c.cmd.walk; c.cmd.pi = 0; } }
    const m = c.cmd; m.t += dt; const A = animOf(c);
    if (m.fn) { if (m.fn(c, dt, m)) c.cmd = null; return; } // 73rd: a one-off scripted step (BankShift: rise, goodbye, boarding a vehicle…)
    if (m.gone) { const W2 = game.interiors && game.interiors.walkIn; const P = game.player;
      if (!c.keepInPool && game.crowd && game.crowd.adopt && P && W2 && Math.hypot(P.x - site.F.x, P.z - site.F.z) < 40) { try { const [wx, wz] = W2.world(site, c.x, c.z); const ch = c.ch; ch.bankOwned = false; c.on = false; pool.splice(pool.indexOf(c), 1); game.crowd.adopt(ch, wx, wz, site.yaw + c.yaw, 'calm'); room.stats.handed++; room.stats.left++; return; } catch (e) { console.warn('[bank] crowd hand-off', e); } }
      hide(c); room.stats.left++; return; }
    if (m.walk) {
      // string-pulling (4×/s): a corner is skipped when the point after it is in clear view (natural lines, and a corner
      // someone is standing on never holds a crowd up)
      if ((c.pullT = (c.pullT || 0) - dt) <= 0) { c.pullT = 0.25; while (m.pi + 1 < m.path.length && !m.path[m.pi][2] && clearLine(c.x, c.z, m.path[m.pi + 1][0], m.path[m.pi + 1][1]) && !nearPlayer(c.x, c.z, m.path[m.pi + 1][0], m.path[m.pi + 1][1])) m.pi++; }
      const tgt = m.path[m.pi]; if (!tgt) { c.cmd = null; return; }
      const dx = tgt[0] - c.x, dz = tgt[1] - c.z, dd = Math.hypot(dx, dz);
      if (tgt[2] === 1 && m.pi + 1 < m.path.length && blockers(c).some((o) => !(o.speed > 0.2) && Math.hypot(o.x - tgt[0], o.z - tgt[1]) < 0.45)) { m.pi++; m.detoured = false; c.blockT = 0; return; } // a step-round point someone has since stopped on is dropped
      if (c.pauseT > 0) { c.pauseT -= dt; c.speed = 0; c.blockBy = null; A.update(dt, 0); place(c); return; } // stood aside for someone (below)
      if (dd < 0.07) { if (tgt[2] === 2) c.pauseT = 1.3; m.pi++; m.detoured = false; if (m.pi >= m.path.length) { c.cmd = null; c.speed = 0; } A.update(dt, c.speed); return; }
      const want = Math.atan2(dx, dz); c.yaw = turn(c.yaw, want, dt * 7); const fx = Math.sin(want), fz = Math.cos(want);
      // the door: ask it open (WalkIn pushes it like the player does), hold at arm's length until it has swung clear
      let hold = false; const D = door(); const cross = (c.z - LEAF_Z) * (tgt[1] - LEAF_Z) < 0;
      // the doorway is one person wide: one customer at a time (a token); the next waits just outside the door zone
      const inDZ = (x, z) => Math.abs(x) < 1.0 && z > -1.55 && z < 1.3; const nowIn = inDZ(c.x, c.z), nextIn = inDZ(c.x + fx * 0.12, c.z + fz * 0.12);
      // 73rd: the token covers everyone about to cross the leaf, from either side, within 1.3 m of it: one person in the doorway at a time
      // (before, someone already inside the door zone never waited — two people met head-on in the doorway and walked through each other)
      { const T0 = room.doorBy; if (T0 && (!T0.on || !T0.cmd || !T0.cmd.walk || (T0 !== c && Math.abs(T0.z - LEAF_Z) > 1.45))) room.doorBy = null; }
      const gate = Math.abs(c.x) < 1.6 && Math.abs(c.z - LEAF_Z) < 1.3;
      if (cross && gate) { if (!room.doorBy) room.doorBy = c; if (room.doorBy !== c) hold = true; }
      else if (room.doorBy === c && !cross && Math.abs(c.z - LEAF_Z) > 0.9) room.doorBy = null; // through: the next one may go
      if (!hold && D && cross && Math.abs(c.x) < 0.9 && c.z > ZF - 1.4 && c.z < 1.4) { const side = c.z > LEAF_Z ? 1 : -1; site.npcDoor = { side, f: game.interiors.walkIn.frame }; if (Math.abs(D.ang) < 1.15 && Math.abs(c.z - LEAF_Z) < 0.62) hold = true;
        // the player has the door: wait for him — unless this customer is ahead of him on his side (between him and the leaf,
        // so he cannot reach it): then the customer pushes it (WalkIn honours a same-side NPC push while he is engaged)
        if (D.engaged) { const P0 = room.pl; const ahead = P0 && D.side === side && Math.abs(P0.z - LEAF_Z) > Math.abs(c.z - LEAF_Z) + 0.1; if (!ahead) hold = true; } }
      // the player is solid: stop for him; someone standing still in the way: the same; after a moment, step round (below)
      let by = null; const P = room.pl; if (!hold && P && (P.inside || Math.abs(P.z) < 2.5)) { const ox = P.x - c.x, oz = P.z - c.z, od = Math.hypot(ox, oz); if (od < 0.7 && ox * fx + oz * fz > od * 0.3) { hold = true; by = P; } }
      // in the doorway (one person wide) and the player wants through: turn round and step back out of the door zone for him
      if (!by && hold && room.doorBy && room.doorBy !== c && nowIn && Math.hypot(room.doorBy.x - c.x, room.doorBy.z - c.z) < 1.3) by = room.doorBy; // the one with the token has right of way: out of the doorway for him too
      if ((by === P || (by && by === room.doorBy)) && nowIn) { c.yieldT = (c.yieldT || 0) + dt; if (c.yieldT > 0.5) { const bw = Math.atan2(-fx, -fz); c.yaw = turn(c.yaw, bw, dt * 8); const bx = c.x - fx * 0.9 * dt, bz = c.z - fz * 0.9 * dt;
        if (bz > 0.05 || inDZ(bx, bz) || clearAt(bx, bz)) { c.x = bx; c.z = bz; } if (room.doorBy === c) room.doorBy = null; c.speed = 0; A.update(dt, 0.9); place(c); return; } } else c.yieldT = 0;
      let sx = 0, sz = 0; const BL = c.ghostT > 0 ? [] : blockers(c); /* 73rd: a staff walker jammed for long (BankShift) slips past for a moment */ if (!hold) for (const o of BL) { const ox = o.x - c.x, oz = o.z - c.z, od = Math.hypot(ox, oz); if (od > 0.6 || od < 1e-3) continue; const ahead = ox * fx + oz * fz;
        const moving = o.ext ? o.speed > 0.2 : o.cmd && o.cmd.walk && o.speed > 0.2; if (!moving && ahead > od * 0.4 && od < 0.55) { hold = true; by = o; break; } /* 73rd: the one in the doorway stops too (it used to walk through) */
        if (moving && ahead > -0.1) { const lat = ox * -fz + oz * fx; const k = (0.6 - od) / 0.6; const sgn = lat > 0 ? -1 : 1; sx += -fz * sgn * k; sz += fx * sgn * k; } } // two people walking: each eases to the side and passes
      if (by) { c.blockT += dt; if (c.blockT > 1.2 && !m.detoured && (m.nDet || 0) < 6) { const lat = (by.x - c.x) * -fz + (by.z - c.z) * fx; const first = lat > 0 ? -1 : 1; for (const sg of [first, -first]) { const px = by.x - fz * sg * 0.75 + fx * 0.15, pz = by.z + fx * sg * 0.75 + fz * 0.15; if (clearAt(px, pz) && clearLine(c.x, c.z, px, pz) && clearLine(px, pz, tgt[0], tgt[1])) { m.path = m.path.slice(); m.path.splice(m.pi, 0, [px, pz, 1]); const nx2 = m.path[m.pi + 1]; if (nx2 && m.pi + 2 < m.path.length && Math.hypot(nx2[0] - by.x, nx2[1] - by.z) < 0.8) m.path.splice(m.pi + 1, 1); /* a corner the blocker stands on is cut */ m.detoured = true; m.nDet = (m.nDet || 0) + 1; c.blockT = 0; break; } } }
        // 73rd: two people stopped nose to nose (or a chain of them) with nowhere left to detour — the one with the lower priority steps
        // aside out of the line, waits a moment there, then carries on (before, both held for ever: the crowded-door deadlock)
        const prio = (o) => o.prio ?? (o.prio = (o.staff ? 0.5 : 0) + Math.random() * 0.5);
        if (c.blockT > 2.5 && !by.ext && by !== P && !(by.speed > 0.1) && (by.blockBy === c || (by.blockT || 0) > 2.5) && prio(c) < prio(by)) {
          const others = blockers(c); let aside = null; for (const [lt, bk] of [[0.75, 0.1], [-0.75, 0.1], [0.75, -0.45], [-0.75, -0.45], [1.1, 0], [-1.1, 0]]) { const px = c.x - fz * lt - fx * bk, pz = c.z + fx * lt - fz * bk;
            if (!clearAt(px, pz) || !clearLine(c.x, c.z, px, pz) || (P && Math.hypot(P.x - px, P.z - pz) < 0.6) || others.some((o) => Math.hypot(o.x - px, o.z - pz) < 0.6)) continue; aside = [px, pz]; break; }
          if (aside) { m.path = m.path.slice(); m.path.splice(m.pi, 0, [aside[0], aside[1], 2]); m.detoured = true; c.blockT = 0; room.stats.asides = (room.stats.asides || 0) + 1; } }
        if (c.blockT > 6) { c.blockT = 0; m.detoured = false; m.nDet = 0; } } else c.blockT = Math.max(0, c.blockT - dt * 2);
      c.blockBy = by;
      c.speed = hold ? Math.max(0, c.speed - dt * 5) : Math.min(sx || sz ? 0.8 : 1.2, c.speed + dt * 2.2); const st = Math.min(dd, c.speed * dt); let nx = c.x + fx * st, nz = c.z + fz * st;
      if ((sx || sz) && !hold && !nowIn) { const ex = nx + sx * 0.7 * dt, ez = nz + sz * 0.7 * dt; if (clearAt(ex, ez)) { nx = ex; nz = ez; } }
      // 73rd: bodies are solid — under the yielding above, a hard limit: never closer than two body radii to another customer or to
      // anyone on the pavement (the mover gives way; never into a wall / jamb)
      for (const o of BL) { if (o.cmd && (o.cmd.seated !== undefined || o.cmd.sit !== undefined || o.cmd.rise)) continue; const mn = o.ext ? 0.52 : 0.5; const ox = nx - o.x, oz = nz - o.z, d2 = ox * ox + oz * oz;
        if (d2 < mn * mn) { const d = Math.sqrt(d2) || 1e-3, ux = d2 > 1e-8 ? ox / d : -fz, uz = d2 > 1e-8 ? oz / d : fx; const px = nx + ux * (mn - d), pz = nz + uz * (mn - d); if (clearAt(px, pz)) { nx = px; nz = pz; } else if (Math.hypot(c.x - o.x, c.z - o.z) >= d) { nx = c.x; nz = c.z; } } }
      c.speed = Math.min(c.speed, Math.hypot(nx - c.x, nz - c.z) / Math.max(dt, 1e-4)); c.x = nx; c.z = nz; A.update(dt, c.speed); place(c); return;
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

  // ================================================================================== 71st: the back-office phone call
  // The landline rings now and then — at random, and not on every visit; a free counter officer gets up from the office chair
  // (the chair's "getting up" recording and the body's rise run on one clock), walks round the chair to the credenza, takes the
  // handset off the cradle (pickup sound; the ring stops that instant), brings it to the ear (the hand holds it all the way:
  // arm IK onto the handset's grip), takes the call — the nine lines in order over about a minute, the caller's side as pauses —
  // turns back, puts it down (hang-up sound as it lands), walks back and sits down: the "sitting down" recording is started so
  // that its seated moment (1.3 s into variation 1, 1.0 s into 2 and 3) is the frame the hips land on the seat.
  const SEAT_D = 10.35, STAND_D = 10.2, RISE_AT = 0.25, CHAIR_BACK = 0.2, V3 = THREE.Vector3;
  const ss = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
  const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  const seatOf = (t) => [t.x, Z(SEAT_D) - 0.04], standOf = (t) => [t.x, Z(STAND_D)];
  const sideOf = (t) => [t.x + (PHONE.x >= t.x ? 1 : -1) * 0.66, Z(STAND_D)];
  const callSpot = () => [PHONE.x - 0.02, z0 + 0.66];
  const phoneAt = () => [PHONE.x + 0.1, z0 + 0.255];
  // the right hand on the handset, in the handset's frame (long axis +z to the earpiece, cups towards −y): palm on its back,
  // fingers across it — forward-left lifting it off the cradle, forward-up round it at the ear (the wrist turns on the way)
  const handQ = (n, f) => { const X = n.clone().normalize(), Y = f.clone().normalize().negate(); const Zv = new V3().crossVectors(X, Y).normalize(); X.crossVectors(Y, Zv).normalize(); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Zv)); };
  const GRIP = { cradle: { q: handQ(new V3(0, -1, 0), new V3(0.8, 0, 0.6)), p: new V3(0, 0.034, 0).addScaledVector(new V3(0.8, 0, 0.6), -0.072) },
    ear: { q: handQ(new V3(0, -1, 0), new V3(-0.75, 0, 0.66)), p: new V3(0, 0.034, -0.012).addScaledVector(new V3(-0.75, 0, 0.66).normalize(), -0.072) } };
  // the handset at the right ear, in the head bone's frame: the earpiece on the ear (head-local x −0.08), the mouthpiece by the mouth
  const EAR = (() => { const E = new V3(-0.081, 0.058, 0.006), Mi = new V3(-0.05, -0.042, 0.088); const zh = E.clone().sub(Mi).normalize(); const yh = new V3(-1, 0, 0).addScaledVector(zh, zh.x).normalize();
    const xh = new V3().crossVectors(yh, zh).normalize(); yh.crossVectors(zh, xh).normalize(); return new THREE.Matrix4().makeBasis(xh, yh, zh).setPosition(E.clone().addScaledVector(yh, 0.024).addScaledVector(zh, -HANDSET.ear.z)); })();
  const _hp = new V3(), _hq = new THREE.Quaternion(), _hs = new V3(), _gi = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _p1 = new V3(), _p2 = new V3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const earLocal = (ch) => { const hb = ch.bones.head; hb.updateWorldMatrix(true, false); hb.matrixWorld.decompose(_hp, _hq, _hs); const e = EAR.clone(); e.elements[12] *= _hs.x; e.elements[13] *= _hs.y; e.elements[14] *= _hs.z;
    _m1.compose(_hp, _hq, ONE3).multiply(e); g.updateWorldMatrix(true, false); _gi.copy(g.matrixWorld).invert(); return new THREE.Matrix4().multiplyMatrices(_gi, _m1); };
  const ONE3 = new V3(1, 1, 1);
  const blendM = (A, B, u, lift = 0) => { A.decompose(_p1, _q1, _hs); B.decompose(_p2, _q2, _hs); _p1.lerp(_p2, u); _p1.y += Math.sin(Math.PI * u) * lift; _q1.slerp(_q2, u); return new THREE.Matrix4().compose(_p1, _q1, ONE3); };
  // hand target (world) from the handset's matrix in the room frame and a grip blend (0 cradle grip … 1 ear grip)
  const holdAt = (ch, M, gu, w) => { g.updateWorldMatrix(true, false); _m2.multiplyMatrices(g.matrixWorld, M); _m2.decompose(_p1, _q1, _hs);
    const p = GRIP.cradle.p.clone().lerp(GRIP.ear.p, gu).applyQuaternion(_q1).add(_p1); const q = _q1.clone().multiply(GRIP.cradle.q.clone().slerp(GRIP.ear.q, gu));
    const R = ch.anim.reach && ch.anim.reach.bankPhone ? ch.anim.reach : (ch.anim.reach = { S: 'R', p, q, w, lean: 0, maxLean: 0.55, pose: 'phone', bankPhone: true }); R.p = p; R.q = q; R.w = w; };
  const call = room.call = { st: 'idle', T: 20 + Math.random() * 70, t: 0, who: null, path: null, pi: 0, sp: 0, lean: 0, line: 0, next: 0, gapK: 1, n: 0, ts: 1, hung: false, yaw0: Math.PI, calls: 0 };
  const GAPS = [2.6, 4.6, 6.2, 4.2, 5.0, 5.2, 4.4, 3.4];
  const lineLen = (i) => SB.duration(bankCallId(i + 1)) || 0.7 + BANK_CALL[i].split(' ').length / 2.6;
  const leanPose = (b) => { const l = call.lean; if (l) { b.spine.rotation.x += l * 0.6; b.chest.rotation.x += l * 0.4; } if (call.cush) b.hips.position.y -= call.cush; };
  const startCall = (who) => { call.who = who; who.called = true; call.st = 'ring'; call.t = 0; call.react = 2.4 + Math.random() * 4.5; const [x, z] = phoneAt(); BankSound.ring(x, z); call.calls++; };
  const endCall = (abort) => { const who = call.who; call.who = null; call.st = 'idle'; call.T = 70 + Math.random() * 130; BankSound.ringStop(); if (callPh) callPh.home();
    if (who) { const A = who.ch.anim; who.away = false; who.called = false; who.act = null; who._rtn = null; A.sitW = null; A.postPose = null; A.reach = null; A.seated = true; if (who.ch.face) who.ch.face.talking = false;
      who.chair.position.z = who.chairZ; who.chair.rotation.y = 0;
      if (abort) { const [sx, sz] = seatOf(who); who.ch.root.position.set(sx, 0, sz); who.ch.root.rotation.y = 0; A.set(null); } } };
  room.ringNow = (w = null) => { if (call.st !== 'idle') return false; const free = stand.tellers.filter((t) => !t.away && !pool.some((o) => o.on && o.win === t.win)); const who = w || free.sort((a, b) => Math.abs(a.x - PHONE.x) - Math.abs(b.x - PHONE.x))[0]; if (!who) return false; startCall(who); return true; }; // tests / dev
  // walk along call.path (room frame); returns true on arrival
  const walk = (ch, dt) => { const r = ch.root.position, P = call.path[call.pi]; const dx = P[0] - r.x, dz = P[1] - r.z, d = Math.hypot(dx, dz); const last = call.pi === call.path.length - 1;
    const want = Math.atan2(dx, dz), y0 = ch.root.rotation.y, ny = d > 0.06 ? turn(y0, want, dt * 6) : y0; ch.root.rotation.y = ny; const off = Math.abs(wrap(want - ny));
    const target = off > 1.1 ? 0.12 : last ? Math.min(1.05, 0.25 + d * 2.0) : 1.05; call.sp += Math.max(-dt * 3, Math.min(dt * 2.2, target - call.sp));
    const st = Math.min(d, call.sp * dt); if (d > 1e-4) { r.x += dx / d * st; r.z += dz / d * st; } ch.anim.update(dt, call.sp, wrap(ny - y0) / Math.max(dt, 1e-3));
    if (d < (last ? 0.03 : 0.12)) { call.pi++; if (call.pi >= call.path.length) { call.sp = 0; return true; } } return false; };
  const say = (who, id, text, x, z, whoName, near = 9) => { const d = BankSound.say(id, x, z); const est = 0.7 + text.split(' ').length / 2.6; const pl = room.pl;
    if (game.hud && pl && pl.inside && Math.hypot(pl.x - x, pl.z - z) < near) game.hud.subtitle(whoName, text, '', Math.max(d, est) + 0.3); return d || est; };
  const stepCall = (dt, pl) => {
    if (!callPh) return; const C0 = call;
    if (C0.st === 'idle') { if (!staffOn() || !pl || !pl.inside) return; if ((C0.T -= dt) > 0) return; C0.T = 40 + Math.random() * 80; if (Math.random() > 0.55) return; // random, and not every time
      const free = stand.tellers.filter((t) => t.ch.root.visible && !t.away && !(t.speakT > 0) && !pool.some((o) => o.on && o.win === t.win)); if (!free.length) { C0.T = 15; return; }
      free.sort((a, b) => Math.abs(a.x - PHONE.x) - Math.abs(b.x - PHONE.x)); startCall(Math.random() < 0.75 || free.length < 2 ? free[0] : free[1]); return; }
    const who = C0.who; if (!who || !staffOn()) { endCall(true); return; } const ch = who.ch, A = ch.anim, r = ch.root.position; C0.t += dt; const t = C0.t;
    const [px, pz] = phoneAt();
    switch (C0.st) {
      case 'ring': if (t >= C0.react) { who.away = true; who.act = null; C0.st = 'rise'; C0.t = 0; A.set('sit'); A.sitW = 1; A.postPose = leanPose; C0.lean = 0; const [sx, sz] = seatOf(who); r.set(sx, 0, sz); ch.root.rotation.y = 0; BankSound.chair('up', sx, sz); } break; // hands off the keyboard to the lap as the chair creaks
      case 'rise': { // getting up, on the chair recording's clock: from RISE_AT the trunk leans forward over the feet (weight onto them),
        // the right hand pushes off the knee ('rise'), the seat weight runs out over 0.9 s while the body comes up and forward
        // (root from the seat to the standing spot, the feet under the hips), the chair rolls back from under her, the trunk straightens
        const k0 = t - RISE_AT; if (k0 >= 0 && A.seated) { A.seated = null; A.set('rise'); A.prevAction = null; /* the procedural rise: not the generic standing-up take */ }
        A.sitW = 1 - ss((k0 - 0.15) / 0.9); const [sx, sz] = seatOf(who), [tx, tz] = standOf(who); const u = ss((k0 - 0.1) / 1.0); r.set(sx + (tx - sx) * u, 0, sz + (tz - sz) * u);
        C0.lean = k0 < 0.55 ? 0.42 * ss(k0 / 0.5) : 0.42 * (1 - ss((k0 - 0.55) / 0.75));
        who.chair.position.z = who.chairZ - CHAIR_BACK * ss((k0 - 0.35) / 0.8); who.chair.rotation.y = 0.14 * ss((k0 - 0.35) / 0.8);
        if (k0 >= 1.25 && A.action === 'rise') A.set(null); A.update(dt, 0);
        if (k0 >= 1.35) { A.sitW = null; A.postPose = null; C0.lean = 0; C0.path = [sideOf(who), callSpot()]; C0.pi = 0; C0.sp = 0; C0.st = 'walk'; C0.t = 0; } break; }
      case 'walk': if (walk(ch, dt)) { C0.st = 'face'; C0.t = 0; } break;
      case 'face': { const y0 = ch.root.rotation.y; ch.root.rotation.y = turn(y0, Math.PI, dt * 5); A.update(dt, 0, wrap(ch.root.rotation.y - y0) / Math.max(dt, 1e-3)); if (Math.abs(wrap(ch.root.rotation.y - Math.PI)) < 0.05 || t > 1) { C0.st = 'reach'; C0.t = 0; A._rLean = undefined; } break; }
      case 'reach': holdAt(ch, callPh.cradle, 0, ss(t / 0.55)); A.update(dt, 0); if (t >= 0.55) { BankSound.ringStop(); BankSound.handset(true, px, pz); C0.st = 'lift'; C0.t = 0; A.set('phone'); callPh.off = true; } break;
      case 'lift': { A.update(dt, 0); const u = ss(t / 0.9); const M = blendM(callPh.cradle, earLocal(ch), u, 0.07); callPh.set(M); holdAt(ch, M, u, 1); if (t >= 0.9) { C0.st = 'call'; C0.t = 0; C0.line = 0; C0.next = 0.35;
        let S = 0; for (let i = 0; i < BANK_CALL.length; i++) S += lineLen(i); const G = GAPS.reduce((a, b) => a + b, 0); C0.gapK = Math.max(0.4, Math.min(2, (58 - S) / G)); C0.yaw0 = ch.root.rotation.y; } break; }
      case 'call': { const y0 = ch.root.rotation.y; ch.root.rotation.y = C0.yaw0 + (Math.PI - 0.85 - C0.yaw0) * ss((t - 1.5) / 3.5); A.update(dt, 0, wrap(ch.root.rotation.y - y0) / Math.max(dt, 1e-3)); const M = earLocal(ch); callPh.set(M); holdAt(ch, M, 1, 1);
        if (C0.line < BANK_CALL.length && t >= C0.next) { const i = C0.line++; const [wx2, wz2] = [r.x, r.z]; const d = say(who, bankCallId(i + 1), BANK_CALL[i], wx2, wz2, 'Bank officer (on the phone)', 14); C0.talkUntil = t + d; C0.next = t + d + (GAPS[i] ?? 1) * C0.gapK; }
        if (ch.face) ch.face.talking = t < (C0.talkUntil || 0); if (C0.line >= BANK_CALL.length && t >= (C0.talkUntil || 0) + 1.2) { C0.st = 'turnBack'; C0.t = 0; } break; }
      case 'turnBack': { const y0 = ch.root.rotation.y; ch.root.rotation.y = turn(y0, Math.PI, dt * 4); A.update(dt, 0, wrap(ch.root.rotation.y - y0) / Math.max(dt, 1e-3)); const M = earLocal(ch); callPh.set(M); holdAt(ch, M, 1, 1); if (ch.face) ch.face.talking = false; if (t >= 0.8) { C0.st = 'lower'; C0.t = 0; C0.hung = false; C0.earM = M; } break; }
      case 'lower': { A.update(dt, 0); const u = ss(t / 0.85); const M = blendM(earLocal(ch), callPh.cradle, u, 0.06); callPh.set(M); holdAt(ch, M, 1 - u, 1);
        if (!C0.hung && t >= 0.78) { C0.hung = true; BankSound.handset(false, px, pz); } if (t >= 0.85) { callPh.home(); A.set(null); C0.st = 'release'; C0.t = 0; } break; }
      case 'release': holdAt(ch, callPh.cradle, 0, 1 - ss(t / 0.4)); A.update(dt, 0); if (t >= 0.4) { A.reach = null; C0.path = [sideOf(who), standOf(who)]; C0.pi = 0; C0.sp = 0; C0.st = 'walkBack'; C0.t = 0; } break;
      case 'walkBack': if (walk(ch, dt)) { C0.st = 'faceDesk'; C0.t = 0; } break;
      case 'faceDesk': { const y0 = ch.root.rotation.y; ch.root.rotation.y = turn(y0, 0, dt * 4.5); A.update(dt, 0, wrap(ch.root.rotation.y - y0) / Math.max(dt, 1e-3)); if (Math.abs(wrap(ch.root.rotation.y)) < 0.04 || t > 1.2) { ch.root.rotation.y = 0; const [tx, tz] = standOf(who); C0.n = BankSound.chair('down', tx, tz); C0.ts = CHAIR_SEATED_AT[C0.n] || 1; C0.st = 'sit'; C0.t = 0; C0.cush = 0; C0.from = r.z; A.postPose = leanPose; A.sitW = 0; } break; }
      case 'sit': { // she reaches back for the chair and draws it in as she lowers herself: the descent (0.85 s, trunk leaning forward
        // to balance) ends exactly on the recording's seated moment (1.3 s into variation 1, 1.0 s into 2 and 3), then settles back
        const [sx, sz] = seatOf(who); const d0 = Math.max(0.12, C0.ts - 0.85); const u = (t - d0) / (C0.ts - d0); if (t >= d0 && A.action !== 'sit') A.set('sit');
        const e = u <= 0 ? 0 : u >= 1 ? 1 : (1 - Math.cos(Math.PI * 0.8 * u)) / (1 - Math.cos(Math.PI * 0.8)); A.sitW = e; // eases in, lands with a little speed left (the seated thump)
        C0.cush = t > C0.ts ? 0.014 * Math.sin(Math.PI * Math.min(1, (t - C0.ts) / 0.32)) : 0; /* the seat cushion gives under her, then settles */ r.set(sx, 0, C0.from + (sz - C0.from) * e); C0.lean = u <= 0 ? 0 : u < 1 ? 0.34 * Math.sin(Math.PI * Math.min(1, u * 1.15)) + 0.06 * u : 0.06 * (1 - ss((t - C0.ts) / 0.6));
        const cu = ss((t - (d0 - 0.25)) / (C0.ts - d0 + 0.25)); who.chair.position.z = who.chairZ - CHAIR_BACK * (1 - cu); who.chair.rotation.y = 0.14 * (1 - cu);
        if (u >= 1 && !A.seated) A.seated = true; A.update(dt, 0); if (t >= CHAIR_LEN) { endCall(false); who.ch.anim.set('type'); } break; }
    }
  };

  // ---- staff, one frame
  const stepStaff = (dt, pl) => { const near = pl && pl.inside; const k2 = near ? 1 : 0.5; // 73rd: who is at work is BankShift's call (p.duty)
    for (const t of stand.tellers) { if (t.duty !== 'on' || t.away) continue; if (stunStep(t, t.ch, dt, false)) { animUp(t.ch, dt * k2, 0); continue; } if (t.speakT > 0) t.speakT -= dt; const cust = pool.find((o) => o.on && o.win === t.win && o.cmd && o.cmd.win === t.win);
      if (cust) { t.actT -= dt; if (t.actT <= 0 || !t.act) { t.act = t.rnd() < 0.5 ? 'talk' : t.rnd() < 0.6 ? 'type' : 'listen'; t.actT = 2 + t.rnd() * 3; t.ch.anim.set(t.act); t.ch.anim.seated = true; } }
      else { if (t.act) { t.act = null; t._rtn = null; } routine(t, t.ch, dt, 'desk', t.rnd); }
      animUp(t.ch, dt * k2, 0); }
    for (const [p, kind] of [[stand.recep, 'desk'], [stand.mgr, 'desk'], [stand.sup, 'phone']]) { if (p.duty !== 'on' || (p.waveT > 0)) continue; if (stunStep(p, p.ch, dt, false)) { animUp(p.ch, dt * k2, 0); continue; } const busy = p === stand.recep && pool.some((o) => o.on && o.cmd && o.cmd.staff === 'recep');
      if (busy) { if (p.ch.anim.action !== 'talk') p.ch.anim.set('talk'); p.ch.anim.seated = true; p.busy = true; } else { if (p.busy) { p.busy = false; p._rtn = null; } routine(p, p.ch, dt, kind, p.rnd); } animUp(p.ch, dt * k2, 0); }
    { const gd = stand.guard; if (guardGun.step(dt, pl, gd.ch.root.visible)) { animUp(gd.ch, dt, 0); return; } if (shift && shift.guardStep(gd, dt)) { animUp(gd.ch, dt, 0); return; } if (gd.stunT > 0 && gd.stunD <= dt) { gd.ch.root.rotation.y = turn(gd.ch.root.rotation.y, Math.atan2(-gd.x, 0.4 - gd.z), dt * 5); } if (stunStep(gd, gd.ch, dt, false)) { animUp(gd.ch, dt, 0); return; } routine(gd, gd.ch, dt, 'guard', gd.rnd); let want = gd.yaw0; if (pl && pl.inside && Math.hypot(pl.x - gd.x, pl.z - gd.z) < 3) want = Math.atan2(pl.x - gd.x, pl.z - gd.z); gd.ch.root.rotation.y = turn(gd.ch.root.rotation.y, want, dt * 2.5); animUp(gd.ch, dt, 0); }
  };

  // ---- 71st: the room's sound sources (BankSound.tick reads room.audio; Game passes the active room's list)
  room.audio = [];
  const AC_SRC = [{ key: 'ac.hall', id: 'bank.ac', x: xR - 0.25, z: Z(2.7), ref: 5, lvl: 0.9, synth: (c, d) => BankSound.acSynth(c, d) },
    { key: 'ac.back', id: 'bank.ac', x: PHONE.x, z: z0 + 0.3, ref: 5, lvl: 0.75, synth: (c, d) => BankSound.acSynth(c, d) }];
  const OFFICE_SRC = [{ key: 'office.counter', id: 'bank.office', seg: [WINX[0] - 0.6, WINX[2] + 0.6], z: Z(9.8), ref: 4, lvl: 0.8 },
    { key: 'office.mgr', id: 'bank.office', x: 6.1, z: Z(5.95), ref: 3, lvl: 0.55 }];
  // the counter glass (with the staff door) between the hall and the staff side: muffles what is on the other side
  BankSound.occ = (x, z) => ((z < Z(9.0)) !== (BankSound.L.z < Z(9.0)) ? 0.55 : 0);
  // a footfall of a walking body (Character's gait sets anim.stepped on each heel strike)
  const stepSound = (ch) => { const A = ch.anim; if (!A.stepped) return; A.stepped = false; const p = ch.root.position; BankSound.step(p.x, p.z, 0.85); };
  // ---- per frame (WalkIn: while the room is drawn or holds the player)
  room.lastT = -1e9;
  // 73rd: the end / start of banking hours, when someone is there to see it (BankShift.js)
  const hallClear = (x, z) => { if (x < xL + 0.28 || x > xR - 0.28) return false; for (let i = 0; i < nStatic; i++) { const o = obs[i]; if (x > o.x0 - 0.14 && x < o.x1 + 0.14 && z > o.z0 - 0.14 && z < o.z1 + 0.14) return false; } return true; };
  shift = makeBankShift({ game, site, g, room, stand, B, Z, xL, xR, staffDoor: staffDoorLeaf, P: { DOOR_IN, DOOR_OUT, LEAVE_WAIT, STREET_OUT, ARR_WAIT, WALK_ON }, seatOf, standOf, CHAIR_BACK, REC, stepCustomer, hide, place, walkInOf, hallClear, rng: rngOf(6801) });
  room.shift = shift; warmStaffCars();
  room.alwaysSim = true; // 73rd: WalkIn keeps this room running with the player outside (other shops keep their old on-approach system)
  for (const a of acs) g.add(a.group); room.acs = acs; // 73rd: the split ACs' swinging flap + vanes
  room.update = (dt, pl, bg = false) => {
    bgMode = !!bg; room.pl = pl; if (!bg && room.visible) { const ta = game.clock ?? performance.now() / 1000; for (const a of acs) a.tick(ta); } const now = game.clock ?? performance.now() / 1000; const gap = now - room.lastT; room.lastT = now; const D2 = door();
    if (gap > 20 && !pl.inside && (!D2 || Math.abs(D2.ang) < 0.5)) room.reseed();
    const plD = Math.hypot(pl.x, pl.z); room.ext.length = 0; // people on the pavement by the door (not the room's own), in the local frame
    if (plD < 90 && game.bodies && walkInOf()) { const W2 = walkInOf(); for (const b of game.bodies) { if (b.ch.bankOwned || (game.player && b.ch === game.player.ch) || Math.abs(b.x - site.F.x) > 6 || Math.abs(b.z - site.F.z) > 6) continue; const [lx, lz] = W2.local(site, b.x, b.z); if (lz < -0.3) continue; room.ext.push({ x: lx, z: lz, speed: b.ped ? b.ped.speed || 0 : 0, ext: true }); } }
    // daylight through the frontage glazing, signage glow
    if (game.atmos) { const n = game.atmos.night ?? 0; dayMat.emissiveIntensity = atlas ? 0.08 + 0.85 * (1 - n) : 0.3; }
    stepStaff(dt, pl); shift.step(dt, pl, plD, stepCustomer); if (bg) { if (call.st !== 'idle') endCall(true); } else stepCall(dt, pl);
    if (bg) { for (const c of pool.slice()) if (c.on) stepCustomer(c, dt, pl); else if (c.ch.root.visible) c.ch.root.visible = false; bgTraffic(dt, pl, plD);
      if (plD < 30) { const L = room.rr || (room.rr = { i: 0 }); const list = [...stand.tellers, stand.recep, stand.mgr, stand.sup, stand.guard, ...pool.filter((c) => c.on).map((c) => c.ch)].map((x) => (x && x.ch ? x.ch : x)).filter(Boolean);
        const ch = list[L.i++ % list.length]; if (ch && ch._bgAcc > 0) { ch.anim.update(Math.min(ch._bgAcc, 0.3), ch._bgSp || 0, 0); ch._bgAcc = 0; } } // one body a frame keeps its pose current
      dynObs(); room.nearAtm = -1; room.nearWin = -1; room.prompt = null; return; }
    // 71st: the room's sound — the listener, the counter glass between the hall and the staff side, the two air conditioners and
    // the office (keyboards and mice along the counter desks, the manager's desk), heels on the granite
    BankSound.listen(pl.x, pl.z, pl.yaw ?? 0); room.audio.length = 0; const on = staffOn();
    room.audio.push(AC_SRC[0], AC_SRC[1]); OFFICE_SRC[0].on = on; OFFICE_SRC[1].on = on && !!stand.mgr.ch.root.visible; room.audio.push(OFFICE_SRC[0], OFFICE_SRC[1]);
    if (pl.inside) { for (const t of stand.tellers) stepSound(t.ch); stepSound(stand.guard.ch); for (const c of pool) if (c.on && c.ch.root.visible) stepSound(c.ch); }
    for (const c of pool.slice()) if (c.on) stepCustomer(c, dt, pl); else if (c.ch.root.visible) c.ch.root.visible = false;
    bgTraffic(dt, pl, plD); dynObs();
    // prompts: ATM / teller window
    room.nearAtm = -1; room.nearWin = -1; room.prompt = null; const key = (a) => (game.hud && game.hud.key ? game.hud.key(a) : '[E]');
    if (pl.inside && !(game.atm && game.atm.open)) {
      const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
      for (const m of atms) { const dx = pl.x - m.stand[0], dz = pl.z - m.stand[1]; if (Math.abs(dz) < 0.45 && dx > -0.2 && dx < 0.95 && -fx > 0.3) { room.nearAtm = m.i; room.prompt = m.user ? 'ATM in use — please wait' : `${key('interact')} Use ATM`; break; } }
      if (room.nearAtm < 0) for (let i = 0; i < 4; i++) { const p = LOC['win' + i].at; if (Math.abs(pl.x - p[0]) < 0.6 && pl.z < p[1] + 0.85 && pl.z > p[1] - 0.3 && -fz > 0.3) { if (pool.some((o) => o.on && o.win === i)) { room.prompt = `Counter ${i + 1} · serving a customer`; break; } room.nearWin = i; break; } }
      counterTalk(room.nearWin, pl);
    }
  };
  // dynamic obstacles: the customers' bodies (the player is pushed off them; they stop for him)
  const dynObs = () => { obs.length = nStatic; for (const c of shift ? pool.concat(shift.crew) : pool) if (c.on && c.z < ZF) { const sx = c.cmd && c.cmd.seated !== undefined ? Math.sin(c.yaw) * 0.25 : 0, sz = c.cmd && c.cmd.seated !== undefined ? Math.cos(c.yaw) * 0.25 : 0; obs.push({ x0: c.x + sx - 0.2, x1: c.x + sx + 0.2, z0: c.z + sz - 0.2, z1: c.z + sz + 0.2, npc: true }); } };
  // ---- 73rd: who comes to the bank, inside or out, never more than the hour's quota (target(): 1–4 customers in the hall)
  //  • the player inside, or far away (nothing of the pavement in his view): a pooled customer walks in from the street lane
  //  • the player outside and near: a real passer-by from the street crowd (no new character is built mid-play) turns off the
  //    pavement, walks up to the door and becomes a customer — and leavers are handed back to the crowd as before
  // Characters are never created here (100–300 ms each): only the pool built on the loading screen, and passers-by.
  room.recT = 6; room.recruit = null; room.stats.recruited = 0;
  const bgTraffic = (dt, pl, plD) => {
    const active = pool.filter((c) => c.on).length + (room.recruit ? 1 : 0); const quota = target(); const D2 = door();
    if (room.recruit) recruitStep(); // a passer-by on the way to the door
    if (pl.inside || plD > 70) { room.spawnT -= dt; if (room.spawnT <= 0) { room.spawnT = 9 + Math.random() * 14; const free = pool.find((c) => !c.on);
      if (free && active < quota && D2 && Math.abs(D2.ang) < 0.05 && !room.doorBy && room.lineRoom('in') && Math.hypot(pl.x - STREET[0], pl.z - STREET[1]) > 2.5) spawn(free, pickPlan(Math.random), true); } return; }
    room.recT -= dt; if (room.recT > 0 || room.recruit || !room.lineRoom('in') || active >= quota || pool.length >= POOL + 2 || !game.crowd) return; room.recT = 7 + Math.random() * 12;
    const W2 = walkInOf(); if (!W2) return; const [ax, az] = W2.world(site, APPROACH[0], APPROACH[1]); let best = null, bd = 1e9;
    for (const p of game.crowd.peds) { if (p.job || p.keep || p.scene || p.partner || p.dead || p.vanish || p.crossing || p.homeCar || p.sit || p.drunk || p.umbrella || (p.state !== 'walk' && p.state !== 'toPoi')) continue;
      const d = Math.hypot(p.x - ax, p.z - az); if (d < 2.5 || d > 18 || d >= bd || Math.abs((p.y ?? site.y0) - site.y0) > 0.6 || (p.ch.spec && !isAdultSpec(p.ch.spec))) continue; best = p; bd = d; }
    if (!best) return; const p = best; const R = room.recruit = { p, t: 0, ax, az, plan: pickPlan(Math.random), arrived: false };
    p.job = { step: (q, dt2) => { R.t += dt2; const dx = ax - q.x, dz = az - q.z, d = Math.hypot(dx, dz); if (d < 0.35) { R.arrived = true; return { desired: 0 }; } return { desired: Math.min(q.pace || 1.3, 0.35 + d * 0.9), tx: ax, tz: az, avoid: d > 1.0, accel: 3 }; },
      interrupt: (q) => { R.lost = true; q.job = null; q.keep = false; }, resume: () => {}, post: () => {} };
    p.keep = true; p.state = 'job'; p.routine = null; p.ch.anim.set(null);
  };
  const recruitStep = () => { const R = room.recruit, p = R.p; const C = game.crowd;
    if (R.lost || p.dead || !C.peds.includes(p) || R.t > 45) { if (p.job && !R.lost) { p.job = null; p.keep = false; if (C.peds.includes(p) && !p.dead) { p.state = 'walk'; C.returnToGraph(p); } } room.recruit = null; return; }
    if (!R.arrived) return; const W2 = walkInOf(); room.recruit = null; if (!W2) return;
    C.release(p); p.job = null; p.keep = false; const ch = p.ch; ch.bankOwned = true; ch.anim.set(null); ch.anim.look = 0;
    const [lx, lz] = W2.local(site, p.x, p.z); const c = { ch, on: true, x: lx, z: lz, yaw: (p.yaw ?? 0) - site.yaw, speed: Math.min(1, Math.hypot(p.vx || 0, p.vz || 0)), gen: null, cmd: null, rnd: rngOf((seedN++) * 7 + 3), loc: 'door', blockT: 0, seat: -1, atm: -1, win: -1, recruit: true };
    pool.push(c); room.ext = room.ext.filter((e) => Math.hypot(e.x - lx, e.z - lz) > 0.15); /* (his own body as a street pedestrian, gathered this frame) */ c.gen = (function* () { yield* lineGen(c, 'in', (spot) => [spot]); yield { walk: [DOOR_IN] }; yield* visit(c, R.plan); })(); place(c); room.stats.recruited++; room.stats.spawned++; };
  room.leaveGen = (c) => leave(c); // tests: send a customer home now
  room.recruitNow = () => { room.recT = 0; room.recruit = null; return true; }; // tests: the next update looks for a passer-by straight away
  // 71st: stepping up to a counter window, the officer behind it speaks by herself (no key): one of her three lines, in turn, once
  // per approach (and not again for a while if the player hovers); a styled HUD card points to the ATMs at the same time
  const COUNTER_NAME = ['Counter 1 officer', 'Counter 2 officer', 'Counter 3 officer'];
  const counterTalk = (i, pl) => { const was = room.atWin; room.atWin = i; if (i < 0 || i === was) return; const now = game.clock ?? performance.now() / 1000;
    const open = staffOn() && B.staffed.includes(i); const n = B.staffed.indexOf(i), t = open ? stand.tellers[n] : null;
    if (t && (t.away || (call.who === t && call.st !== 'idle' && call.st !== 'ring'))) { if (game.hud) game.hud.subtitle(B.name, 'This officer is on the phone — the ATMs by the entrance handle cash.', '', 3); atmNote(); return; }
    if (t && now - (t.saidAt ?? -1e9) > 12) { const T = BANK_TELLERS[n]; const li = (t.said = ((t.said ?? -1) + 1) % T.lines.length); t.saidAt = now;
      if (call.who !== t) { t.act = 'talk'; t.actT = 4; t.ch.anim.set('talk'); t.ch.anim.seated = true; }
      const d = say(t, bankCounterId(T.id, li + 1), T.lines[li], t.x, Z(10.3), COUNTER_NAME[n], 4); t.speakT = d; if (t.ch.face) { t.ch.face.talking = true; setTimeout(() => { if (t.ch.face) t.ch.face.talking = false; }, d * 1000); } }
    else if (!t && game.hud) game.hud.subtitle(B.name, i === 3 ? 'Counter 4 is closed today. Please use counters 1 to 3 or the ATMs.' : 'The counters are closed after banking hours. The ATMs are open 24 hours.', '', 3.5);
    atmNote(); };
  const atmNote = () => { const now = game.clock ?? performance.now() / 1000; if (now - (room.noteAt ?? -1e9) < 25 || !game.hud || !game.hud.notify) return; room.noteAt = now;
    game.hud.notify('Use the ATM', 'Cash withdrawals and deposits are at the CMB ATMs by the entrance — 24 hours, no queue.', 'bank', 6); };
  room.interact = () => {
    if (room.nearAtm >= 0) { const m = atms[room.nearAtm]; if (m.user) { if (game.hud) game.hud.subtitle(B.name, 'This ATM is in use. Please wait or use the other machine.', '', 2.5); return; } if (game.atm) game.atm.openAt(room, m); return; }
    if (room.nearWin >= 0 && game.hud) { room.atWin = -1; const n0 = B.staffed.indexOf(room.nearWin); if (n0 >= 0 && stand.tellers[n0]) stand.tellers[n0].saidAt = -1e9; counterTalk(room.nearWin, room.pl); return; }
    if (room.nearWin >= 0 && game.hud) { const i = room.nearWin; const open = staffOn() && B.staffed.includes(i);
      game.hud.subtitle(open ? 'Bank officer' : B.name, open ? 'Good day! Cash withdrawals and deposits are quickest at our ATMs by the entrance — no queue, and they update your account at once.' : i === 3 ? 'Counter 4 is closed today. Please use counters 1 to 3 or the ATMs.' : 'The counters are closed after banking hours. The ATMs are open 24 hours.', '', 4); }
  };
  // send a customer in from the street on a given visit (tests / dev tools; the normal flow is the spawn timer in update)
  room.spawnVisit = (plan) => { if (!room.lineRoom('in')) return null; const free = pool.find((c) => !c.on) || (pool.length < POOL ? newCustomer() : null); if (!free) return null; spawn(free, plan, true); return free; };
  room.atmPose = (m) => ({ local: { x: m.stand[0], z: m.stand[1], yaw: -Math.PI / 2 } });
  // freed by WalkIn when the player is far away: staff and the customers still in the pool (customers handed to the street crowd
  // left the pool and belong to the crowd now), the ATM screen textures; the room tone is stopped outright
  room.dispose = () => { BankSound.stopNow(); guardGun.dispose(); for (const p of [...stand.tellers, stand.recep, stand.mgr, stand.sup, stand.guard]) if (p && p.ch && p.ch.dispose) p.ch.dispose(); for (const c of pool) if (c.ch && c.ch.dispose) c.ch.dispose(); pool.length = 0; for (const m of atms) if (m.screen && m.screen.tex) m.screen.tex.dispose(); };
  room.reseed();
  return room;
}
function rngOf(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
