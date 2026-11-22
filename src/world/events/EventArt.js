// 81st request — DYNAMIC CITY EVENTS: the printed graphics of a site, drawn once per built site into one 2048 × 1024 canvas
// (the regions of EventLayouts.ATLAS): the header banner with the event's name, the LED screen picture, the programme poster,
// the kolam (rice-flour pattern) for Deepavali / Thai Pongal, two vertical banners, the gate header, FIRST AID / REGISTRATION /
// TOILETS / EXIT signs and the stall name boards. Everything is drawn from the event instance (title, date, times, venue,
// activities, public information) — the same data the phone app shows.
import * as THREE from 'three';
import { ATLAS } from './EventLayouts.js';
import { PALETTES, CATEGORIES, dateLabel, hourLabel } from './CityEventCatalog.js';

const STALL_NAMES = {
  food: ['Kottu Corner', 'Hopper Hut', 'Isso Vadai', 'King Coconut', 'Wade & Short Eats', 'Faluda Bar', 'Lamprais', 'Kavum & Kokis'],
  art: ['Batik Studio', 'Clay & Kiln', 'Wood Carvings', 'Handloom', 'Paintings', 'Masks', 'Brassware', 'Lacquer Work'],
  books: ['Sarasavi Books', 'Second-hand', 'Children\'s Corner', 'Tamil Titles', 'Poetry & Prose', 'Comics', 'Textbooks', 'Handicrafts'],
  avurudu: ['Kavum & Kokis', 'Kiribath', 'Aluwa', 'Mung Kavum', 'Raban Toys', 'Avurudu Games', 'Sweets', 'Betel & Flowers'],
  lanterns: ['Vesak Kudu', 'Lantern Makers', 'Paper Lanterns', 'Pandal Art', 'Dansal Tea', 'Bhakti Gee', 'Lotus Lamps', 'Youth Society'],
  default: ['Snacks', 'Drinks', 'Information', 'Merchandise', 'Tea', 'Ice Cream', 'Water', 'Souvenirs'],
};
export function stallNames(type) { return STALL_NAMES[type.stalls] || STALL_NAMES.default; }

function fit(c, text, maxW, size, weight = '700', fam = 'Barlow Condensed, Arial Narrow, Arial, sans-serif') { let s = size; do { c.font = `${weight} ${s}px ${fam}`; s -= 2; } while (c.measureText(text).width > maxW && s > 10); }
function rect(c, r, fill) { c.fillStyle = fill; c.fillRect(r[0], r[1], r[2], r[3]); }
function wrap(c, text, x, y, maxW, lh) { const words = String(text).split(' '); let line = '', yy = y; for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { c.fillText(line, x, yy); line = w; yy += lh; } else line = t; } if (line) c.fillText(line, x, yy); return yy + lh; }
function grain(c, r, k = 0.04) { const [x0, y0, w, h] = r; for (let i = 0; i < w * h / 90; i++) { c.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${k})` : `rgba(0,0,0,${k})`; c.fillRect(x0 + Math.random() * w, y0 + Math.random() * h, 2, 2); } }

function banner(c, r, ev, P) {
  const [x, y, w, h] = r; const g = c.createLinearGradient(x, y, x + w, y); g.addColorStop(0, P.a); g.addColorStop(1, shade(P.a, -0.25)); rect(c, r, '#000'); c.fillStyle = g; c.fillRect(x, y, w, h);
  c.fillStyle = P.b; c.fillRect(x, y + h - 18, w, 18); c.fillRect(x, y, w, 8); // trims
  for (let i = 0; i < 26; i++) { c.fillStyle = i % 2 ? P.c : P.b; c.globalAlpha = 0.18; c.beginPath(); c.arc(x + 40 + i * 60, y + h / 2, 70, 0, Math.PI * 2); c.fill(); } c.globalAlpha = 1;
  c.fillStyle = P.text; c.textAlign = 'center'; c.textBaseline = 'middle'; fit(c, ev.T.title.toUpperCase(), w - 120, 104); c.fillText(ev.T.title.toUpperCase(), x + w / 2, y + h * 0.42);
  c.font = '600 34px Manrope, Arial, sans-serif'; c.fillText(`${dateLabel(ev.day, true)}  ·  ${hourLabel(ev.start)} – ${hourLabel(ev.start + ev.dur)}  ·  ${ev.venueShort}`, x + w / 2, y + h * 0.8); grain(c, r, 0.03);
}
function screen(c, r, ev, P) {
  const [x, y, w, h] = r; rect(c, r, '#0a0d12');
  if (ev.T.cat === 'sport') { // a broadcast frame: the green, the pitch, a batter's crease and the score strip
    const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#2f7a3a'); g.addColorStop(1, '#1d5a2a'); c.fillStyle = g; c.fillRect(x, y, w, h);
    for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'; c.fillRect(x, y + i * h / 12, w, h / 12); }
    c.fillStyle = '#c9b48a'; c.beginPath(); c.moveTo(x + w * 0.44, y + h * 0.18); c.lineTo(x + w * 0.56, y + h * 0.18); c.lineTo(x + w * 0.62, y + h * 0.86); c.lineTo(x + w * 0.38, y + h * 0.86); c.closePath(); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 4; c.beginPath(); c.moveTo(x + w * 0.395, y + h * 0.74); c.lineTo(x + w * 0.605, y + h * 0.74); c.stroke(); for (const sx of [0.49, 0.5, 0.51]) { c.fillStyle = '#e8dcc0'; c.fillRect(x + w * sx - 2, y + h * 0.66, 5, h * 0.08); }
    rect(c, [x, y + h - 92, w, 92], 'rgba(10,20,40,0.92)'); c.fillStyle = '#f2c230'; c.fillRect(x, y + h - 92, 12, 92);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = '700 44px Barlow Condensed, Arial, sans-serif'; c.fillText('SRI LANKA  187/4', x + 36, y + h - 46); c.font = '600 30px Manrope, Arial, sans-serif'; c.fillStyle = '#cfd8e6'; c.fillText('OVERS 32.3   ·   RR 5.75   ·   v TOURING XI', x + 380, y + h - 46);
    c.textAlign = 'right'; c.fillStyle = '#ff4d4d'; c.font = '700 30px Manrope, Arial, sans-serif'; c.fillText('● LIVE', x + w - 30, y + 40); return; }
  const g = c.createRadialGradient(x + w / 2, y + h * 0.55, 30, x + w / 2, y + h * 0.55, w * 0.7); g.addColorStop(0, shade(P.c, 0.15)); g.addColorStop(1, '#05060a'); c.fillStyle = g; c.fillRect(x, y, w, h);
  for (let i = 0; i < 9; i++) { c.strokeStyle = i % 2 ? P.b : P.text; c.globalAlpha = 0.25; c.lineWidth = 6; c.beginPath(); c.moveTo(x + w / 2, y + h); c.lineTo(x + i * w / 8, y); c.stroke(); } c.globalAlpha = 1;
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; fit(c, ev.T.title.toUpperCase(), w - 80, 84); c.fillText(ev.T.title.toUpperCase(), x + w / 2, y + h * 0.45); c.font = '600 32px Manrope, Arial, sans-serif'; c.fillStyle = P.b; c.fillText((ev.T.acts && ev.T.acts[0]) || '', x + w / 2, y + h * 0.62);
}
function poster(c, r, ev, P) {
  const [x, y, w, h] = r; rect(c, r, '#fbf8f1'); rect(c, [x, y, w, 170], P.a); rect(c, [x, y + 166, w, 8], P.b);
  c.fillStyle = P.text; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.font = '700 44px Barlow Condensed, Arial, sans-serif'; wrap(c, ev.T.title.toUpperCase(), x + w / 2, y + 66, w - 40, 46);
  c.fillStyle = '#222'; c.font = '700 26px Manrope, Arial, sans-serif'; c.fillText(dateLabel(ev.day, true), x + w / 2, y + 220); c.font = '600 24px Manrope, Arial, sans-serif'; c.fillText(`${hourLabel(ev.start)} – ${hourLabel(ev.start + ev.dur)}`, x + w / 2, y + 254);
  c.textAlign = 'left'; c.font = '700 22px Manrope, Arial, sans-serif'; c.fillStyle = P.a; c.fillText('PROGRAMME', x + 34, y + 310); c.fillStyle = '#333'; c.font = '500 21px Manrope, Arial, sans-serif'; let yy = y + 344;
  for (const a of ev.T.acts || []) { c.fillStyle = P.b; c.fillRect(x + 34, yy - 12, 10, 10); c.fillStyle = '#333'; yy = wrap(c, a, x + 54, yy, w - 90, 27) + 4; }
  c.fillStyle = P.a; c.font = '700 22px Manrope, Arial, sans-serif'; c.fillText('PUBLIC INFORMATION', x + 34, yy + 18); c.fillStyle = '#333'; c.font = '500 20px Manrope, Arial, sans-serif'; wrap(c, ev.T.info || '', x + 34, yy + 50, w - 68, 26);
  rect(c, [x, y + h - 54, w, 54], P.a); c.fillStyle = P.text; c.textAlign = 'center'; c.font = '600 20px Manrope, Arial, sans-serif'; c.fillText(ev.venueShort, x + w / 2, y + h - 20); grain(c, r, 0.025);
}
function kolam(c, r) { // dots and the lines looped around them (a simple pulli kolam), white rice flour with coloured fill
  const [x, y, w, h] = r; c.clearRect(x, y, w, h); c.fillStyle = 'rgba(0,0,0,0)'; const n = 7, s = w / (n + 1);
  const cols = ['#e2462e', '#f4a51c', '#2e7d32', '#7a1c4b']; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const cx = x + s * (i + 1), cy = y + s * (j + 1); if (Math.abs(i - 3) + Math.abs(j - 3) > 4) continue; c.fillStyle = cols[(i + j) % 4]; c.globalAlpha = 0.85; c.beginPath(); c.moveTo(cx, cy - s * 0.48); c.lineTo(cx + s * 0.48, cy); c.lineTo(cx, cy + s * 0.48); c.lineTo(cx - s * 0.48, cy); c.closePath(); c.fill(); c.globalAlpha = 1; }
  c.strokeStyle = '#f7f3ea'; c.lineWidth = 7; c.lineCap = 'round'; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { if (Math.abs(i - 3) + Math.abs(j - 3) > 4) continue; const cx = x + s * (i + 1), cy = y + s * (j + 1); c.beginPath(); c.arc(cx, cy, s * 0.36, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#f7f3ea'; c.beginPath(); c.arc(cx, cy, 6, 0, Math.PI * 2); c.fill(); }
  c.beginPath(); c.arc(x + w / 2, y + h / 2, w * 0.46, 0, Math.PI * 2); c.stroke();
}
function vban(c, r, ev, P, k) {
  const [x, y, w, h] = r; const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, k ? P.c : P.a); g.addColorStop(1, shade(k ? P.c : P.a, -0.3)); c.fillStyle = g; c.fillRect(x, y, w, h);
  c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(-Math.PI / 2); c.fillStyle = P.text; c.textAlign = 'center'; c.textBaseline = 'middle'; const t = (CATEGORIES[ev.T.cat] || {}).name || ''; fit(c, k ? 'COLOMBO' : t.toUpperCase(), h - 60, 76); c.fillText(k ? 'COLOMBO' : t.toUpperCase(), 0, 0); c.restore();
  c.fillStyle = P.b; c.fillRect(x, y + 10, w, 10); c.fillRect(x, y + h - 20, w, 10);
}
function sign(c, r, bg, fg, text, icon = null) {
  const [x, y, w, h] = r; rect(c, r, bg); c.strokeStyle = fg; c.lineWidth = 5; c.strokeRect(x + 6, y + 6, w - 12, h - 12);
  let tx = x + w / 2; if (icon === 'cross') { c.fillStyle = '#d42020'; const cx = x + 46, cy = y + h / 2; c.fillRect(cx - 9, cy - 28, 18, 56); c.fillRect(cx - 28, cy - 9, 56, 18); tx = x + w / 2 + 28; }
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; fit(c, text, w - (icon ? 110 : 40), 58); c.fillText(text, tx, y + h / 2 + 2);
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k))); return `rgb(${f(r)},${f(g)},${f(b)})`; }

// one atlas per built site; returns a THREE.CanvasTexture (or null without a canvas: tools / node)
// the site's print atlas (banners, screen, poster, kolam, signs). Drawn in small steps — one region per call — so a site coming into range never
// spends one long frame on 2D canvas work (81st: a one-shot draw measured 26–166 ms under SwiftShader). drawAtlas() runs all steps at once.
export function atlasJob(ev) {
  if (typeof document === 'undefined') return { done: true, tex: null, step() { return true; } };
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1024; const c = cv.getContext('2d'); const P = PALETTES[ev.T.pal] || PALETTES.warm;
  const steps = !c ? [] : [
    () => { c.fillStyle = '#808080'; c.fillRect(0, 0, 2048, 1024); banner(c, ATLAS.banner, ev, P); },
    () => screen(c, ATLAS.screen, ev, P), () => poster(c, ATLAS.poster, ev, P), () => kolam(c, ATLAS.kolam),
    () => { vban(c, ATLAS.vbanA, ev, P, 0); vban(c, ATLAS.vbanB, ev, P, 1); },
    () => { sign(c, ATLAS.gate, P.a, P.text, ev.T.ticket ? 'ENTRANCE · REGISTRATION' : 'WELCOME · ENTRANCE'); sign(c, ATLAS.aid, '#ffffff', '#c41a1a', 'FIRST AID', 'cross'); sign(c, ATLAS.reg, P.b, '#1a1a1a', 'REGISTRATION'); },
    () => { const names = stallNames(ev.T); for (let i = 0; i < 4; i++) sign(c, ATLAS['stall' + i], i % 2 ? P.a : P.c, '#ffffff', names[(i + (ev.seedK || 0)) % names.length].toUpperCase());
      sign(c, ATLAS.wc, '#1f4fa0', '#ffffff', 'TOILETS'); sign(c, ATLAS.exit, '#1f7a3c', '#ffffff', 'EXIT →'); },
  ];
  const job = { done: false, tex: null, k: 0,
    step() { if (this.done) return true; if (this.k < steps.length) { steps[this.k++](); return false; }
      if (c) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
        t.onUpdate = () => { t.onUpdate = null; t.image = { width: 2048, height: 1024 }; }; this.tex = t; } // the 8 MB canvas is let go after the upload
      this.done = true; return true; } };
  return job;
}
export function drawAtlas(ev) { const j = atlasJob(ev); while (!j.step()); return j.tex; }

// the City Events phone app's artwork: the event's own LED-screen artwork (the same drawing the site's screen shows), drawn
// at half size once per event and kept as a small JPEG data URL (≈ 20 KB) — real event data, nothing generic
const HERO = new Map();
export function heroArt(ev) {
  if (typeof document === 'undefined') return null; const k = ev.id; if (HERO.has(k)) return HERO.get(k);
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 576; const c = cv.getContext('2d'); if (!c) return null; const P = PALETTES[ev.T.pal] || PALETTES.warm;
  screen(c, [0, 0, 1024, 576], ev, P); const out = document.createElement('canvas'); out.width = 480; out.height = 270; out.getContext('2d').drawImage(cv, 0, 0, 480, 270);
  const url = out.toDataURL('image/jpeg', 0.82); if (HERO.size > 40) HERO.delete(HERO.keys().next().value); HERO.set(k, url); return url;
}
