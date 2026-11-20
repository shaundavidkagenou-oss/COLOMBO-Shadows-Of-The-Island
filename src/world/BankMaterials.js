// 74th request: "everything inside the bank must have its own textures and be editable through the texture editor; make the
// digital screens look like digital screens".
//
// The Ceylon Meridian Bank hall used to draw with the shop kit's shared materials (the same walnut, steel, plastic … as every
// robbable shop and the barber), so a Texture Studio edit in the bank changed the whole city — and most of them had no texture
// at all (flat vertex colour). Here the hall gets a material set of its OWN, each with its own small generated texture
// (256² canvas, mipmapped — no image files, nothing large in the repo):
//   * every material is named "CMB · …", so the Texture Studio saves its edits under that name and they apply to the bank only;
//   * the merged draws stay exactly as before (one mesh per material for the whole hall — no extra draw calls);
//   * a single item (the ATM, a teller workstation, the vault door …) can still get materials of its own: Texture Studio →
//     "Bank item" → "Own textures for this item" (BankLayout `own`, saved into the model pack like the bank-edit layout);
//   * the screens (teller monitors, the now-serving board, the ticket kiosk) draw from an LCD atlas: real UI content, sub-pixel
//     stripes, a soft vignette and glass sheen, unlit and not tone-mapped like a backlit panel — readable by night as by day.
import * as THREE from 'three';
import { canvasTex } from './ShopKit.js';
import { CMB, FONTS, drawLogo, hasCanvas } from './BankBrand.js';

export const BANK_MAT_PREFIX = 'CMB · ';
// kit slot → { label, texture, surface }
const SPEC = {
  paint: { label: 'Painted fittings (eggshell)', tex: () => tx('cmbPaint', eggshell('#f6f6f4')), rough: 0.72 },
  plaster: { label: 'Wall plaster (emulsion)', tex: () => tx('cmbPlaster', plaster), rough: 0.9 },
  plastic: { label: 'Plastics (satin, fine grain)', tex: () => tx('cmbPlastic', grainy), rough: 0.42 },
  steel: { label: 'Brushed stainless steel', tex: () => tx('cmbSteel', brushed('#d9dcdf', 0.26)), rough: 0.33, metal: 1 },
  chrome: { label: 'Polished chrome', tex: () => tx('cmbChrome', polished), rough: 0.12, metal: 1 },
  gold: { label: 'Brushed brass trim', tex: () => tx('cmbBrass', brushed('#ffffff', 0.18)), rough: 0.24, metal: 1, env: 1.4 },
  walnut: { label: 'Walnut veneer', tex: () => tx('cmbWalnut', walnut), rough: 0.4 },
  marble: { label: 'White marble', tex: () => tx('cmbMarble', marble('#ebe8e2', 'rgba(120,118,112,', 'rgba(170,166,158,')), rough: 0.12, env: 1.2 },
  marbleDark: { label: 'Black marble (Nero)', tex: () => tx('cmbMarbleDark', marble('#26272a', 'rgba(210,208,200,', 'rgba(120,120,118,')), rough: 0.14, env: 1.2 },
  fabric: { label: 'Upholstery fabric (woven)', tex: () => tx('cmbFabric', weave), rough: 0.95 },
  glaze: { label: 'Glazed ceramic', tex: () => tx('cmbGlaze', ceramic), rough: 0.3, env: 1.2 },
  ceilTile: { label: 'Ceiling tiles (mineral fibre)', tex: () => tx('cmbCeil', ceilTile), rough: 0.95 },
  emissive: { label: 'Light panels and indicator LEDs', tex: () => tx('cmbDiffuser', diffuser), basic: true },
  screen: { label: 'Digital screens (LCD)', tex: () => screenAtlas(), basic: true, screen: true },
};
const tx = (key, draw) => canvasTex(key, 256, 256, draw);

let SET = null;
// the hall's materials (made once; shared by every bank build in this session — the hall is built once anyway)
export function bankMaterials() {
  if (SET) return SET; SET = {};
  for (const [slot, s] of Object.entries(SPEC)) {
    const t = s.tex();
    const m = s.basic
      ? new THREE.MeshBasicMaterial({ map: t || null, vertexColors: true, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map: t || null, vertexColors: true, roughness: s.rough ?? 0.6, metalness: s.metal ?? 0, envMapIntensity: s.env ?? 1 });
    if (s.screen && !t) m.color.setRGB(0.32, 0.4, 0.52);
    m.name = BANK_MAT_PREFIX + s.label; m.userData.own = true; m.userData.bankSlot = slot; SET[slot] = m;
  }
  return SET;
}
// give a Kit the hall's materials (k.get('steel') → "CMB · Brushed stainless steel" …). Kit.meshes() lets `extra` win over MAT.
export function useBankMaterials(k) { Object.assign(k.extra, bankMaterials()); return k; }

// ------------------------------------------------------------------------------------------------ surface textures
// (base colours stay near white wherever the builder tints by vertex colour, so the hall keeps its designed colours)
function eggshell(base) { return (a, w, h, r) => { a.fillStyle = base; a.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) { const g = r() < 0.5 ? 0 : 255; a.fillStyle = `rgba(${g},${g},${g},${0.025 + r() * 0.035})`; const s = 1 + r() * 2.5; a.fillRect(r() * w, r() * h, s, s); }
  for (let i = 0; i < 26; i++) { const y = r() * h; a.fillStyle = `rgba(0,0,0,${0.012 + r() * 0.012})`; a.fillRect(0, y, w, 3 + r() * 10); } }; } // faint roller laps
function plaster(a, w, h, r) { a.fillStyle = '#f7f6f3'; a.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, rr = 6 + r() * 26; const gr = a.createRadialGradient(x, y, 0, x, y, rr); const d = r() < 0.5; gr.addColorStop(0, d ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = gr; a.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  for (let i = 0; i < 6000; i++) { a.fillStyle = `rgba(90,86,80,${0.03 + r() * 0.04})`; a.fillRect(r() * w, r() * h, 1, 1); } }
function grainy(a, w, h, r) { a.fillStyle = '#efefef'; a.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) { const v = 232 + ((r() * 22) | 0); a.fillStyle = `rgb(${v},${v},${v})`; a.fillRect(x, y, 2, 2); } // moulded micro-texture
  for (let i = 0; i < 40; i++) { a.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`; a.lineWidth = 0.6; a.beginPath(); const x = r() * w, y = r() * h; a.moveTo(x, y); a.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 12); a.stroke(); } } // light scuffs
function brushed(base, amt) { return (a, w, h, r) => { a.fillStyle = base; a.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) { const y = r() * h, l = 20 + r() * 220, x = r() * w; const g = r() < 0.5 ? 255 : 70; a.fillStyle = `rgba(${g},${g},${g},${amt * (0.15 + r() * 0.6)})`; a.fillRect(x, y, l, 0.6 + r() * 0.9); a.fillRect(x - w, y, l, 0.6 + r() * 0.9); }
  for (let i = 0; i < 14; i++) { const x = r() * w, y = r() * h, rr = 10 + r() * 30; const gr = a.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(120,110,100,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = gr; a.fillRect(x - rr, y - rr, rr * 2, rr * 2); } }; } // fingerprints
function polished(a, w, h, r) { a.fillStyle = '#f4f4f4'; a.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) { const x = r() * w, y = r() * h, rr = 8 + r() * 26; const gr = a.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(150,150,150,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = gr; a.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  for (let i = 0; i < 90; i++) { a.strokeStyle = `rgba(255,255,255,${0.1 + r() * 0.2})`; a.lineWidth = 0.5; a.beginPath(); const x = r() * w, y = r() * h, an = r() * 6.3, l = 4 + r() * 20; a.moveTo(x, y); a.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); a.stroke(); } }
function walnut(a, w, h, r) { a.fillStyle = '#ffffff'; a.fillRect(0, 0, w, h); // vertex white on the bank's walnut: the veneer itself carries the colour
  const g = a.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#6a432c'); g.addColorStop(0.5, '#734a31'); g.addColorStop(1, '#68412a'); a.fillStyle = g; a.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { const x0 = r() * w, amp = 2 + r() * 7, f = 0.01 + r() * 0.03, ph = r() * 9; a.strokeStyle = r() < 0.7 ? `rgba(40,22,12,${0.18 + r() * 0.3})` : `rgba(150,105,70,${0.15 + r() * 0.2})`; a.lineWidth = 0.6 + r() * 2;
    a.beginPath(); for (let y = 0; y <= h; y += 4) { const x = x0 + Math.sin(y * f + ph) * amp + Math.sin(y * f * 3.1 + ph) * amp * 0.25; if (y === 0) a.moveTo(x, y); else a.lineTo(x, y); } a.stroke();
    a.save(); a.translate(-w, 0); a.stroke(); a.translate(2 * w, 0); a.stroke(); a.restore(); }
  for (let i = 0; i < 2600; i++) { a.fillStyle = `rgba(30,16,8,${0.08 + r() * 0.12})`; a.fillRect(r() * w, r() * h, 1, 2 + r() * 4); } } // pores
function marble(base, vein, soft) { return (a, w, h, r) => { a.fillStyle = base; a.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, rr = 8 + r() * 30; const gr = a.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, soft + (0.05 + r() * 0.06) + ')'); gr.addColorStop(1, soft + '0)'); a.fillStyle = gr; a.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  for (let v = 0; v < 9; v++) { let x = r() * w, y = 0; const dx = (r() - 0.5) * 1.6; a.strokeStyle = vein + (0.25 + r() * 0.35) + ')'; a.lineWidth = 0.5 + r() * 1.6; a.beginPath(); a.moveTo(x, y);
    while (y < h) { y += 3 + r() * 6; x += dx * 4 + (r() - 0.5) * 7; a.lineTo(x, y); } a.stroke(); a.save(); a.translate(x > w ? -w : x < 0 ? w : 0, 0); a.stroke(); a.restore(); } }; }
function weave(a, w, h, r) { a.fillStyle = '#e9e9e9'; a.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const over = ((x >> 2) + (y >> 2)) & 1; const v = (over ? 246 : 214) + ((r() * 12) | 0); a.fillStyle = `rgb(${v},${v},${v})`; if (over) a.fillRect(x, y + 0.5, 4, 3); else a.fillRect(x + 0.5, y, 3, 4); }
  for (let i = 0; i < 900; i++) { a.fillStyle = `rgba(255,255,255,${0.08 + r() * 0.1})`; a.fillRect(r() * w, r() * h, 1, 1); } } // lint
function ceramic(a, w, h, r) { a.fillStyle = '#fbfbfa'; a.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i++) { a.fillStyle = `rgba(80,70,60,${0.05 + r() * 0.12})`; a.fillRect(r() * w, r() * h, 1, 1); }
  for (let i = 0; i < 40; i++) { a.strokeStyle = 'rgba(120,110,100,0.06)'; a.lineWidth = 0.5; a.beginPath(); let x = r() * w, y = r() * h; a.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; a.lineTo(x, y); } a.stroke(); } } // crazing
function ceilTile(a, w, h, r) { a.fillStyle = '#ecebe6'; a.fillRect(0, 0, w, h); // one 600 mm tile per texture (the ceiling's uv scale)
  for (let i = 0; i < 2200; i++) { a.fillStyle = `rgba(70,66,60,${0.12 + r() * 0.2})`; const s = r() < 0.15 ? 2 : 1; a.fillRect(r() * w, r() * h, s, s); } // pinholes
  for (let i = 0; i < 160; i++) { a.strokeStyle = `rgba(90,86,78,${0.12 + r() * 0.12})`; a.lineWidth = 0.7; a.beginPath(); const x = r() * w, y = r() * h; a.moveTo(x, y); a.quadraticCurveTo(x + (r() - 0.5) * 10, y + (r() - 0.5) * 10, x + (r() - 0.5) * 14, y + (r() - 0.5) * 14); a.stroke(); } // fissures
  a.fillStyle = '#b9b7b0'; a.fillRect(0, 0, w, 3); a.fillRect(0, 0, 3, h); a.fillStyle = 'rgba(255,255,255,0.7)'; a.fillRect(3, 3, w - 3, 1); a.fillRect(3, 3, 1, h - 3); // the grid tee + bevel
  a.fillStyle = 'rgba(0,0,0,0.08)'; a.fillRect(w - 2, 3, 2, h - 3); a.fillRect(3, h - 2, w - 3, 2); }
function diffuser(a, w, h, r) { a.fillStyle = '#ffffff'; a.fillRect(0, 0, w, h); // opal diffuser: a soft micro-prism dot field, faintly brighter in the middle
  for (let y = 2; y < h; y += 4) for (let x = (y % 8) ? 2 : 4; x < w; x += 4) { a.fillStyle = `rgba(225,228,232,${0.35 + r() * 0.2})`; a.fillRect(x, y, 1, 1); } }

// ------------------------------------------------------------------------------------------------ the LCD atlas (512 × 256)
const R = (x0, y0, x1, y1) => [x0 / 512, 1 - y1 / 256, x1 / 512, 1 - y0 / 256];
export const SCREEN_UV = { teller: R(0, 0, 256, 154), office: R(256, 0, 512, 154), serving: R(0, 160, 256, 224), kiosk: R(256, 160, 384, 224), desktop: R(384, 160, 512, 237) };
let scrTex;
export function screenAtlas() {
  if (scrTex !== undefined) return scrTex; if (!hasCanvas()) return (scrTex = null);
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const a = cv.getContext('2d'); const S = FONTS.SANS, M = 'ui-monospace, Menlo, Consolas, monospace';
  a.fillStyle = '#05070a'; a.fillRect(0, 0, 512, 256);
  tellerApp(a, 0, 0, 256, 154, S, M); officeApp(a, 256, 0, 256, 154, S, M); ledBoard(a, 0, 160, 256, 64); kiosk(a, 256, 160, 128, 64, S); desktop(a, 384, 160, 128, 77, S);
  for (const [x, y, w, h] of [[0, 0, 256, 154], [256, 0, 256, 154], [256, 160, 128, 64], [384, 160, 128, 77]]) lcd(a, x, y, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return (scrTex = t);
}
// sub-pixel stripes + vignette + a little glass sheen (the same finish as the ATM's screen)
function lcd(a, x, y, w, h) {
  a.save(); a.beginPath(); a.rect(x, y, w, h); a.clip(); a.globalCompositeOperation = 'multiply'; a.globalAlpha = 0.14;
  for (let i = x; i < x + w; i += 3) { a.fillStyle = '#ff6a6a'; a.fillRect(i, y, 1, h); a.fillStyle = '#6aff6a'; a.fillRect(i + 1, y, 1, h); a.fillStyle = '#6a6aff'; a.fillRect(i + 2, y, 1, h); }
  a.globalAlpha = 0.1; a.fillStyle = '#000'; for (let j = y; j < y + h; j += 2) a.fillRect(x, j, w, 1);
  a.globalAlpha = 1; a.globalCompositeOperation = 'source-over';
  const v = a.createRadialGradient(x + w / 2, y + h * 0.45, h * 0.3, x + w / 2, y + h / 2, w * 0.72); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.3)'); a.fillStyle = v; a.fillRect(x, y, w, h);
  const s = a.createLinearGradient(x, y, x + w, y + h); s.addColorStop(0, 'rgba(255,255,255,0.08)'); s.addColorStop(0.4, 'rgba(255,255,255,0)'); a.fillStyle = s; a.fillRect(x, y, w, h); a.restore();
}
function winBar(a, x, y, w, title, S) { a.fillStyle = CMB.navy; a.fillRect(x, y, w, 12); a.fillStyle = '#ffffff'; a.font = `700 7px ${S}`; a.textAlign = 'left'; a.fillText(title, x + 14, y + 9); drawLogo(a, x + 2, y + 1, 10, { keyline: false });
  a.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 3; i++) a.fillRect(x + w - 9 - i * 8, y + 4, 5, 4); }
// the teller's core-banking screen: customer, account, transaction entry, recent entries, status bar
function tellerApp(a, x, y, w, h, S, M) {
  a.fillStyle = '#eef1f5'; a.fillRect(x, y, w, h); winBar(a, x, y, w, 'MERIDIAN CORE · TELLER  ·  BR 041 KOLLUPITIYA', S);
  a.fillStyle = '#dde3ea'; a.fillRect(x, y + 12, 44, h - 24); a.font = `600 6px ${S}`; ['Cash in', 'Cash out', 'Transfer', 'Enquiry', 'Cheques', 'FX', 'Close till'].forEach((t, i) => { a.fillStyle = i === 1 ? CMB.gold : 'transparent'; a.fillRect(x + 2, y + 16 + i * 11, 40, 10); a.fillStyle = i === 1 ? CMB.navyDeep : '#33404f'; a.fillText(t, x + 5, y + 23 + i * 11); });
  const fx = x + 50; a.fillStyle = '#33404f'; a.font = `700 7px ${S}`; a.fillText('CASH WITHDRAWAL', fx, y + 23);
  const field = (lab, val, fy, wide = 92) => { a.fillStyle = '#5c6a7a'; a.font = `600 5.5px ${S}`; a.fillText(lab, fx, fy); a.fillStyle = '#ffffff'; a.fillRect(fx, fy + 2, wide, 9); a.strokeStyle = '#b8c2cd'; a.lineWidth = 0.6; a.strokeRect(fx + 0.3, fy + 2.3, wide - 0.6, 8.4); a.fillStyle = '#16202b'; a.font = `500 6.5px ${M}`; a.fillText(val, fx + 3, fy + 9); };
  field('Account no.', '0041-2207-118-3', y + 33); field('Customer', 'A. PERERA (verified)', y + 53); field('Amount (LKR)', '25,000.00', y + 73, 60);
  a.fillStyle = '#1f8a4c'; a.fillRect(fx + 64, y + 75, 28, 9); a.fillStyle = '#fff'; a.font = `700 6px ${S}`; a.fillText('POST', fx + 70, y + 82);
  const tx0 = x + 150; a.fillStyle = '#ffffff'; a.fillRect(tx0, y + 17, w - 154, 98); a.fillStyle = '#c9d2dc'; a.fillRect(tx0, y + 17, w - 154, 9); a.fillStyle = '#33404f'; a.font = `700 5.5px ${S}`; a.fillText('TIME   TYPE     AMOUNT', tx0 + 3, y + 23.5);
  const rows = [['09:42', 'DEP', '12,500.00'], ['09:57', 'WDL', '4,000.00'], ['10:13', 'DEP', '80,250.00'], ['10:21', 'TRF', '15,000.00'], ['10:34', 'WDL', '2,500.00'], ['10:48', 'DEP', '6,300.00'], ['11:02', 'WDL', '20,000.00'], ['11:15', 'ENQ', '—']];
  a.font = `500 5.5px ${M}`; rows.forEach((r, i) => { if (i % 2) { a.fillStyle = '#f1f4f7'; a.fillRect(tx0, y + 27 + i * 11, w - 154, 11); } a.fillStyle = r[1] === 'WDL' ? '#a8322a' : '#16202b'; a.fillText(r[0] + '  ' + r[1] + '  ' + r[2].padStart(9), tx0 + 3, y + 35 + i * 11); });
  a.fillStyle = '#e4e9ef'; a.fillRect(x + 50, y + 92, 94, 26); a.fillStyle = '#33404f'; a.font = `600 5.5px ${S}`; a.fillText('Till balance', x + 54, y + 101); a.font = `700 8px ${M}`; a.fillText('LKR 1,284,600', x + 54, y + 113);
  a.fillStyle = '#26323f'; a.fillRect(x, y + h - 12, w, 12); a.fillStyle = '#4ade80'; a.beginPath(); a.arc(x + 7, y + h - 6, 2.5, 0, 7); a.fill(); a.fillStyle = '#d6dde5'; a.font = `600 5.5px ${S}`; a.fillText('ONLINE · Teller T2 · Session 3h 12m', x + 13, y + h - 4); a.textAlign = 'right'; a.fillText('11:18', x + w - 5, y + h - 4); a.textAlign = 'left';
}
// back office: a customer list + a little chart
function officeApp(a, x, y, w, h, S, M) {
  a.fillStyle = '#f4f6f8'; a.fillRect(x, y, w, h); winBar(a, x, y, w, 'MERIDIAN CORE · BRANCH OPERATIONS', S);
  a.fillStyle = '#ffffff'; a.fillRect(x + 6, y + 18, 140, 118); a.fillStyle = CMB.navy; a.fillRect(x + 6, y + 18, 140, 10); a.fillStyle = '#fff'; a.font = `700 5.5px ${S}`; a.fillText('PENDING APPROVALS', x + 9, y + 25);
  const L = [['FD renewal', '1,500,000'], ['Cheque book', '—'], ['Limit change', '250,000'], ['Address update', '—'], ['Standing order', '18,000'], ['Card replacement', '—'], ['Loan disbursal', '3,200,000'], ['KYC review', '—'], ['Overdraft', '100,000']];
  a.font = `500 5.5px ${M}`; L.forEach((r, i) => { if (i % 2) { a.fillStyle = '#eef2f6'; a.fillRect(x + 6, y + 29 + i * 11.5, 140, 11.5); } a.fillStyle = '#1b2733'; a.fillText(r[0], x + 9, y + 37 + i * 11.5); a.textAlign = 'right'; a.fillText(r[1], x + 143, y + 37 + i * 11.5); a.textAlign = 'left'; });
  a.fillStyle = '#ffffff'; a.fillRect(x + 152, y + 18, 98, 70); a.fillStyle = '#33404f'; a.font = `700 5.5px ${S}`; a.fillText('DEPOSITS · THIS WEEK', x + 156, y + 26);
  [34, 48, 41, 57, 63, 52].forEach((v, i) => { a.fillStyle = i === 5 ? CMB.gold : CMB.navy; a.fillRect(x + 158 + i * 15, y + 84 - v, 10, v); });
  a.fillStyle = '#ffffff'; a.fillRect(x + 152, y + 92, 98, 44); a.fillStyle = '#33404f'; a.fillText('BRANCH CASH POSITION', x + 156, y + 100); a.font = `700 9px ${M}`; a.fillStyle = '#1f8a4c'; a.fillText('LKR 6.84 M', x + 156, y + 116); a.font = `500 5.5px ${S}`; a.fillStyle = '#5c6a7a'; a.fillText('within vault limit', x + 156, y + 127);
  a.fillStyle = '#26323f'; a.fillRect(x, y + h - 12, w, 12); a.fillStyle = '#d6dde5'; a.font = `600 5.5px ${S}`; a.fillText('Connected · BR 041 · Officer O-07', x + 6, y + h - 4); a.textAlign = 'right'; a.fillText('11:18', x + w - 5, y + h - 4); a.textAlign = 'left';
}
// now-serving board: amber LED dot matrix (characters drawn small, then sampled into round dots)
function ledBoard(a, x, y, w, h) {
  a.fillStyle = '#07080a'; a.fillRect(x, y, w, h);
  const cw = 128, ch = 32; const c = document.createElement('canvas'); c.width = cw; c.height = ch; const b = c.getContext('2d'); b.fillStyle = '#000'; b.fillRect(0, 0, cw, ch); b.fillStyle = '#fff'; b.textBaseline = 'alphabetic';
  b.font = '700 7px monospace'; b.fillText('NOW SERVING', 2, 7); b.fillText('CTR', 104, 7); b.font = '700 11px monospace'; b.fillText('A027', 2, 19); b.fillText('2', 112, 19); b.fillText('B014', 2, 31); b.fillText('3', 112, 31);
  b.fillRect(58, 14, 18, 1.5); b.fillRect(58, 26, 18, 1.5); b.beginPath(); b.moveTo(80, 14.7); b.lineTo(75, 11.5); b.lineTo(75, 18); b.fill(); b.beginPath(); b.moveTo(80, 26.7); b.lineTo(75, 23.5); b.lineTo(75, 30); b.fill();
  const px = b.getImageData(0, 0, cw, ch).data; const sx = w / cw, sy = h / ch;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const on = px[(j * cw + i) * 4] > 90; const hd = j < 9; a.fillStyle = on ? (hd ? '#ffb347' : '#ff6a2a') : 'rgba(255,90,40,0.07)'; a.beginPath(); a.arc(x + (i + 0.5) * sx, y + (j + 0.5) * sy, Math.min(sx, sy) * 0.42, 0, 7); a.fill(); }
  const gl = a.createLinearGradient(x, y, x, y + h); gl.addColorStop(0, 'rgba(255,255,255,0.05)'); gl.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = gl; a.fillRect(x, y, w, h);
}
function kiosk(a, x, y, w, h, S) {
  const g = a.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#12305a'); g.addColorStop(1, '#0b1f3b'); a.fillStyle = g; a.fillRect(x, y, w, h); drawLogo(a, x + 4, y + 3, 12, { keyline: false });
  a.fillStyle = '#ffffff'; a.font = `700 7px ${S}`; a.textAlign = 'left'; a.fillText('Please take a number', x + 20, y + 11);
  [['A', 'Cash & deposits'], ['B', 'Accounts'], ['C', 'Other services']].forEach(([k, t], i) => { const by = y + 17 + i * 15; a.fillStyle = CMB.gold; a.beginPath(); a.roundRect ? a.roundRect(x + 6, by, w - 12, 12, 3) : a.rect(x + 6, by, w - 12, 12); a.fill(); a.fillStyle = CMB.navyDeep; a.font = `800 7px ${S}`; a.fillText(k, x + 11, by + 9); a.font = `600 6.5px ${S}`; a.fillText(t, x + 22, by + 9); });
  a.fillStyle = 'rgba(255,255,255,0.6)'; a.font = `500 5px ${S}`; a.fillText('Touch to select', x + 6, y + h - 3);
}
function desktop(a, x, y, w, h, S) {
  const g = a.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#0d2a52'); g.addColorStop(1, '#1d4a7a'); a.fillStyle = g; a.fillRect(x, y, w, h); drawLogo(a, x + w / 2 - 14, y + 16, 28, { keyline: false });
  a.fillStyle = '#ffffff'; a.font = `700 6px ${S}`; a.textAlign = 'center'; a.fillText('CEYLON MERIDIAN BANK', x + w / 2, y + 54); a.font = `500 5px ${S}`; a.fillStyle = 'rgba(255,255,255,0.7)'; a.fillText('Locked · press Ctrl+Alt+Del', x + w / 2, y + 63); a.textAlign = 'left';
  a.fillStyle = 'rgba(0,0,0,0.45)'; a.fillRect(x, y + h - 8, w, 8); a.fillStyle = '#fff'; a.font = `500 5px ${S}`; a.textAlign = 'right'; a.fillText('11:18', x + w - 3, y + h - 2); a.textAlign = 'left';
}
