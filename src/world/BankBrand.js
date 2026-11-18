// Ceylon Meridian Bank (CMB) — the bank's identity, drawn with canvas text (bundled Fontsource fonts, loaded on the boot
// screen) so it is never a placeholder image and the spelling is the source string below. One place for every use: the
// street fascia and ATM sign (BankFront.js), the banking hall signs / posters / leaflets (BankInterior.js), the ATM screen
// (ui/ATMUI.js) and the map blip.
//   Logo: a navy tile with a fine muted-gold keyline; a white "M" drawn as two shoulders that meet a vertical gold
//   meridian bar, a small gold lozenge above it (the meridian's "noon"). Original geometric mark, no coat of arms, no
//   globe, no animal, no letterform borrowed from any real bank.
//   Type: Cormorant Garamond (serif, the name) + Manrope / Barlow Condensed (sans, service text).
import * as THREE from 'three';

export const CMB = Object.freeze({
  name: 'CEYLON MERIDIAN BANK', short: 'CMB', lines: ['CEYLON MERIDIAN', 'BANK'], branch: 'Kollupitiya Branch', address: 'Galle Road, Kollupitiya, Colombo 03',
  navy: '#13284a', navyDeep: '#0b1a33', gold: '#b39a5e', goldLight: '#cdb57a', white: '#f6f4ee', ink: '#1a2233',
});
const SERIF = '"Cormorant Garamond", "Times New Roman", serif', SANS = '"Manrope", "Segoe UI", Arial, sans-serif', COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
export const FONTS = { SERIF, SANS, COND };
export const hasCanvas = () => typeof document !== 'undefined' && !!document.createElement && (() => { try { const c = document.createElement('canvas'); return !!(c.getContext && c.getContext('2d') && c.getContext('2d').fillText); } catch (e) { return false; } })();

// text with tracking (letter-spacing) drawn glyph by glyph, centred on x (works in every browser, no ctx.letterSpacing)
export function tracked(a, text, x, y, track, align = 'center') {
  const ws = [...text].map((ch) => a.measureText(ch).width); const W = ws.reduce((s, w) => s + w, 0) + track * (text.length - 1);
  let cx = align === 'center' ? x - W / 2 : align === 'right' ? x - W : x; const keep = a.textAlign; a.textAlign = 'left';
  [...text].forEach((ch, i) => { a.fillText(ch, cx, y); cx += ws[i] + track; }); a.textAlign = keep; return W;
}
// fit a font size so `text` (tracked) spans at most maxW
export function fitFont(a, text, weight, family, size, maxW, track = 0, min = 8) {
  let s = size; for (; s > min; s -= 1) { a.font = `${weight} ${s}px ${family}`; const w = a.measureText(text).width + track * (text.length - 1); if (w <= maxW) break; } return s;
}

// the mark, in a square S at (x, y)
export function drawLogo(a, x, y, S, { tile = true, keyline = true } = {}) {
  a.save(); a.translate(x, y);
  if (tile) { const r = S * 0.12; a.fillStyle = CMB.navy; a.beginPath(); a.moveTo(r, 0); a.lineTo(S - r, 0); a.quadraticCurveTo(S, 0, S, r); a.lineTo(S, S - r); a.quadraticCurveTo(S, S, S - r, S); a.lineTo(r, S); a.quadraticCurveTo(0, S, 0, S - r); a.lineTo(0, r); a.quadraticCurveTo(0, 0, r, 0); a.closePath(); a.fill(); }
  if (keyline) { a.strokeStyle = CMB.gold; a.lineWidth = Math.max(1, S * 0.022); const i = S * 0.07, r = S * 0.08; a.beginPath(); a.moveTo(i + r, i); a.lineTo(S - i - r, i); a.quadraticCurveTo(S - i, i, S - i, i + r); a.lineTo(S - i, S - i - r); a.quadraticCurveTo(S - i, S - i, S - i - r, S - i); a.lineTo(i + r, S - i); a.quadraticCurveTo(i, S - i, i, S - i - r); a.lineTo(i, i + r); a.quadraticCurveTo(i, i, i + r, i); a.closePath(); a.stroke(); }
  // the "M": two shoulders (left stem + diagonal, right stem + diagonal) — square ends, mitred corners
  a.strokeStyle = CMB.white; a.lineWidth = S * 0.095; a.lineJoin = 'miter'; a.lineCap = 'butt'; a.miterLimit = 6;
  a.beginPath(); a.moveTo(S * 0.25, S * 0.78); a.lineTo(S * 0.25, S * 0.3); a.lineTo(S * 0.455, S * 0.56); a.stroke();
  a.beginPath(); a.moveTo(S * 0.75, S * 0.78); a.lineTo(S * 0.75, S * 0.3); a.lineTo(S * 0.545, S * 0.56); a.stroke();
  // the meridian: a gold bar through the middle of the M, a lozenge above it
  a.fillStyle = CMB.gold; a.fillRect(S * 0.468, S * 0.38, S * 0.064, S * 0.4);
  a.beginPath(); a.moveTo(S * 0.5, S * 0.17); a.lineTo(S * 0.56, S * 0.25); a.lineTo(S * 0.5, S * 0.33); a.lineTo(S * 0.44, S * 0.25); a.closePath(); a.fill();
  a.restore();
}
// stacked wordmark (CEYLON MERIDIAN / gold rule / B A N K) centred in a box
export function drawWordmark(a, x, y, w, h, { color = CMB.white, accent = CMB.gold } = {}) {
  a.save(); a.textBaseline = 'alphabetic'; a.fillStyle = color;
  const s1 = fitFont(a, CMB.lines[0], 700, SERIF, Math.round(h * 0.5), w * 0.94, h * 0.03); a.font = `700 ${s1}px ${SERIF}`; tracked(a, CMB.lines[0], x + w / 2, y + h * 0.5, h * 0.03);
  a.fillStyle = accent; a.fillRect(x + w * 0.18, y + h * 0.6, w * 0.64, Math.max(1, h * 0.018));
  const s2 = Math.round(h * 0.26); a.font = `600 ${s2}px ${SANS}`; a.fillStyle = accent; tracked(a, CMB.lines[1], x + w / 2, y + h * 0.92, s2 * 0.9);
  a.restore();
}

// ---- the street atlas (one 512² texture for every exterior sign → one draw call)
// regions in UV (u0, v0, u1, v1), v up (three.js), matching the canvas layout below
export const ATLAS = {
  wordmark: [0, 1 - 192 / 512, 1, 1], logo: [0, 1 - 384 / 512, 192 / 512, 1 - 192 / 512], atm: [192 / 512, 1 - 288 / 512, 1, 1 - 192 / 512],
  plaque: [192 / 512, 1 - 384 / 512, 1, 1 - 288 / 512], hours: [0, 0, 256 / 512, 128 / 512], blade: [256 / 512, 0, 1, 128 / 512],
};
let atlasTex;
export function brandAtlas() {
  if (atlasTex !== undefined) return atlasTex; if (!hasCanvas()) { atlasTex = null; return null; }
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const a = cv.getContext('2d');
  a.fillStyle = CMB.navy; a.fillRect(0, 0, 512, 512);
  drawWordmark(a, 8, 8, 496, 176); // wordmark
  drawLogo(a, 8, 200, 176); // logo tile
  // ATM sign: gold keyline, "ATM" + "24 HOURS · CASH DEPOSIT"
  a.strokeStyle = CMB.gold; a.lineWidth = 3; a.strokeRect(198, 198, 308, 84); a.fillStyle = CMB.white; a.textAlign = 'center'; a.textBaseline = 'alphabetic';
  a.font = `800 50px ${SANS}`; tracked(a, 'ATM', 290, 258, 6); a.fillStyle = CMB.goldLight; a.font = `600 17px ${SANS}`; tracked(a, '24 HOURS', 430, 236, 2); tracked(a, 'CASH DEPOSIT', 430, 262, 1.5);
  drawLogo(a, 206, 206, 30, { keyline: false });
  // branch plaque (light): navy text
  a.fillStyle = '#ecebe6'; a.fillRect(192, 288, 320, 96); a.fillStyle = CMB.navy; a.fillRect(192, 288, 6, 96); drawLogo(a, 206, 300, 72);
  a.textAlign = 'left'; a.fillStyle = CMB.navy; a.font = `700 22px ${SERIF}`; a.fillText(CMB.name, 288, 322); a.fillStyle = '#3a4252'; a.font = `600 15px ${SANS}`; a.fillText(CMB.branch, 288, 345); a.fillText(CMB.address, 288, 366);
  // opening hours (navy)
  a.fillStyle = CMB.navyDeep; a.fillRect(0, 384, 256, 128); a.strokeStyle = CMB.gold; a.lineWidth = 2; a.strokeRect(6, 390, 244, 116); a.fillStyle = CMB.goldLight; a.textAlign = 'center';
  a.font = `700 18px ${SANS}`; tracked(a, 'BANKING HOURS', 128, 416, 2); a.fillStyle = CMB.white; a.font = `600 16px ${SANS}`; a.fillText('Mon – Fri   9.00 – 15.00', 128, 444); a.fillText('Saturday   9.00 – 12.30', 128, 466); a.fillStyle = '#c9cdd6'; a.font = `500 13px ${SANS}`; a.fillText('ATM & cash deposit open 24 hours', 128, 492);
  // blade sign: logo + "CMB"
  a.fillStyle = CMB.navy; a.fillRect(256, 384, 256, 128); drawLogo(a, 266, 398, 100, { keyline: false }); a.fillStyle = CMB.white; a.textAlign = 'left'; a.font = `700 64px ${SERIF}`; tracked(a, 'CMB', 380, 472, 4, 'left');
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; atlasTex = t; return t;
}
// a soft impression of the lit banking hall behind the street glass (ceiling panels, counter line, blinds half down):
// the facade wall is solid behind the frontage (BuildingGen), so the glass gets a backdrop instead of the shopfront texture
let hallTex;
export function hallBackdrop() {
  if (hallTex !== undefined) return hallTex; if (!hasCanvas()) { hallTex = null; return null; }
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const a = cv.getContext('2d');
  const g = a.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#d9d6cc'); g.addColorStop(0.45, '#b9b4a8'); g.addColorStop(0.62, '#8c8375'); g.addColorStop(1, '#5e574d'); a.fillStyle = g; a.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 6; i++) { const x = 20 + i * 86; const rg = a.createRadialGradient(x + 30, 18, 2, x + 30, 18, 60); rg.addColorStop(0, 'rgba(255,250,236,0.95)'); rg.addColorStop(1, 'rgba(255,250,236,0)'); a.fillStyle = rg; a.fillRect(x - 40, 0, 140, 90); a.fillStyle = 'rgba(255,253,245,0.9)'; a.fillRect(x, 10, 60, 10); }
  a.fillStyle = 'rgba(19,40,74,0.75)'; a.fillRect(0, 128, 512, 34); a.fillStyle = 'rgba(179,154,94,0.8)'; a.fillRect(0, 126, 512, 3); // counter run
  a.fillStyle = 'rgba(40,36,30,0.35)'; for (let i = 0; i < 9; i++) a.fillRect(30 + i * 56, 100 + (i % 3) * 3, 14, 30); // people / chairs, out of focus
  // vertical blinds, half closed
  for (let x = 0; x < 512; x += 16) { const sh = a.createLinearGradient(x, 0, x + 16, 0); sh.addColorStop(0, 'rgba(236,234,228,0.55)'); sh.addColorStop(0.7, 'rgba(206,204,198,0.4)'); sh.addColorStop(1, 'rgba(150,148,142,0.45)'); a.fillStyle = sh; a.fillRect(x, 0, 13, 108); }
  a.fillStyle = 'rgba(0,0,0,0.12)'; a.fillRect(0, 106, 512, 3);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = true; hallTex = t; return t;
}
// frosted manifestation band on the glass (a repeating CMB logo strip): alpha texture, white
let bandTex;
export function frostBand() {
  if (bandTex !== undefined) return bandTex; if (!hasCanvas()) { bandTex = null; return null; }
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const a = cv.getContext('2d'); a.clearRect(0, 0, 256, 64);
  a.fillStyle = 'rgba(255,255,255,0.78)'; a.fillRect(0, 8, 256, 48); a.globalCompositeOperation = 'destination-out'; drawLogo(a, 104, 10, 44, { tile: false, keyline: false }); a.globalCompositeOperation = 'source-over';
  a.fillStyle = 'rgba(255,255,255,0.9)'; a.fillRect(0, 4, 256, 2); a.fillRect(0, 58, 256, 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = true; bandTex = t; return t;
}

// ---- the ATM screen as painted on the machine itself (256 × 192 canvas on each ATM's screen mesh). The same view model as
// the on-screen ATM interface (ui/ATMUI.js) so the machine shows the page being used: { title, lines: [[label, value?]],
// left: [labels], right: [labels], sel: option index (left first, then right), note, tone: 'ok' | 'bad' | null }
export function drawATMScreen(a, w, h, v) {
  a.save(); a.textBaseline = 'alphabetic'; a.textAlign = 'left';
  const g = a.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#16325c'); g.addColorStop(1, '#0b1a33'); a.fillStyle = g; a.fillRect(0, 0, w, h);
  a.fillStyle = 'rgba(255,255,255,0.05)'; for (let y = 0; y < h; y += 3) a.fillRect(0, y, w, 1); // the panel's pixel rows
  a.fillStyle = CMB.navyDeep; a.fillRect(0, 0, w, 28); a.fillStyle = CMB.gold; a.fillRect(0, 28, w, 1.5); drawLogo(a, 6, 4, 20, { keyline: false });
  a.fillStyle = CMB.white; a.font = `700 11px ${SERIF}`; tracked(a, CMB.name, 32, 19, 0.6, 'left');
  if (v.title) { a.fillStyle = CMB.white; const s = fitFont(a, v.title, 700, SANS, 17, w - 24); a.font = `700 ${s}px ${SANS}`; a.textAlign = 'center'; a.fillText(v.title, w / 2, 54); a.textAlign = 'left'; }
  let y = 76; for (const ln of v.lines || []) { const [k, val] = Array.isArray(ln) ? ln : [ln];
    if (val !== undefined) { a.fillStyle = '#b9c4d6'; a.font = `600 10px ${SANS}`; a.fillText(k, 22, y); a.fillStyle = CMB.white; a.font = `700 12px ${SANS}`; a.textAlign = 'right'; a.fillText(String(val), w - 22, y); a.textAlign = 'left'; }
    else { a.fillStyle = v.tone === 'bad' ? '#ffb4a8' : v.tone === 'ok' ? '#bfe8c4' : '#dfe6f0'; const s = fitFont(a, k, 600, SANS, 11, w - 40); a.font = `600 ${s}px ${SANS}`; a.textAlign = 'center'; a.fillText(k, w / 2, y); a.textAlign = 'left'; }
    y += 15; }
  const opt = (label, i, right) => { const oy = 104 + i * 21; const sel = v.sel === (right ? (v.left || []).length + i : i);
    a.fillStyle = sel ? CMB.gold : 'rgba(255,255,255,0.12)'; const bw = 104; const x = right ? w - bw - 4 : 4; a.fillRect(x, oy - 13, bw, 18);
    a.fillStyle = sel ? CMB.navyDeep : CMB.white; const s = fitFont(a, label, 700, SANS, 10, bw - 16); a.font = `700 ${s}px ${SANS}`; a.textAlign = right ? 'right' : 'left'; a.fillText(label, right ? w - 12 : 12, oy); a.textAlign = 'left';
    a.fillStyle = CMB.goldLight; a.beginPath(); if (right) { a.moveTo(w - 1, oy - 4); a.lineTo(w - 4, oy - 7); a.lineTo(w - 4, oy - 1); } else { a.moveTo(1, oy - 4); a.lineTo(4, oy - 7); a.lineTo(4, oy - 1); } a.fill(); };
  (v.left || []).forEach((l, i) => opt(l, i, false)); (v.right || []).forEach((l, i) => opt(l, i, true));
  if (v.note) { a.fillStyle = '#9fb0c8'; const s = fitFont(a, v.note, 500, SANS, 9, w - 16); a.font = `500 ${s}px ${SANS}`; a.textAlign = 'center'; a.fillText(v.note, w / 2, h - 7); }
  a.restore();
}
export const ATM_IDLE_VIEW = { title: 'Welcome', lines: ['Please insert your card', '', 'Cash withdrawal · Cash deposit', 'Balance · Mini statement'], note: 'Shield the keypad when entering your PIN' };
