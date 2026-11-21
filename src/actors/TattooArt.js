// Tattoo designs: procedural line work drawn on a canvas (original art — no reproductions). The same drawing is used for
// the framed flash sheets in the two tattoo studios and for the ink on the protagonists' skin (HeroBody tattoo shell:
// body triangles of a zone, lifted 0.4 mm, with a projected UV into a per-character 1024 × 512 atlas — one material,
// one extra draw for the player only, no shadow pass).
// Each design: { id, name, price (LKR), band? } — bands wrap round a limb, pieces sit on one face of it.
export const TATTOO_DESIGNS = [
  { id: 'lotus', name: 'Lotus', price: 6500 }, { id: 'koi', name: 'Koi', price: 9500 }, { id: 'tribal', name: 'Tribal band', price: 5500, band: true },
  { id: 'rose', name: 'Rose', price: 6000 }, { id: 'dagger', name: 'Dagger & rose', price: 8000 }, { id: 'compass', name: 'Compass', price: 7000 },
  { id: 'mandala', name: 'Mandala', price: 9000 }, { id: 'swallow', name: 'Swallows', price: 5000 }, { id: 'lion', name: 'Lion', price: 12000 },
  { id: 'elephant', name: 'Elephant', price: 11000 }, { id: 'wave', name: 'Wave', price: 8500 }, { id: 'sunmoon', name: 'Sun & moon', price: 7500 },
  { id: 'script', name: 'Script — “Ceylon”', price: 4500 }, { id: 'geo', name: 'Geometric', price: 6500 }, { id: 'feather', name: 'Peacock feather', price: 7000 },
  { id: 'skull', name: 'Skull', price: 8000 }, { id: 'anchor', name: 'Anchor', price: 5000 }, { id: 'clock', name: 'Clock & rose', price: 10000 },
  { id: 'stripes', name: 'Tiger stripes', price: 6000, band: true }, { id: 'dots', name: 'Dotwork band', price: 5000, band: true },
];
// zones (hero body): which bone owns it, the limb axis range (0 = proximal joint, 1 = distal) and the face the piece sits on
export const TATTOO_ZONES = [
  { id: 'foreL', name: 'Left forearm', price: 1 }, { id: 'foreR', name: 'Right forearm', price: 1 }, { id: 'upperL', name: 'Left upper arm', price: 1 },
  { id: 'upperR', name: 'Right upper arm', price: 1 }, { id: 'chest', name: 'Chest', price: 1.4 }, { id: 'back', name: 'Upper back', price: 1.6 },
];
export const designById = (id) => TATTOO_DESIGNS.find((d) => d.id === id) || null;

// ---- drawing helpers (all in a w × h box at x, y; ink colour; `color` adds a little red / green / blue shading)
const P = (a, x, y) => a.lineTo(x, y);
function petal(a, cx, cy, ang, len, wid) { a.save(); a.translate(cx, cy); a.rotate(ang); a.beginPath(); a.moveTo(0, 0); a.bezierCurveTo(wid, -len * 0.3, wid * 0.7, -len * 0.85, 0, -len); a.bezierCurveTo(-wid * 0.7, -len * 0.85, -wid, -len * 0.3, 0, 0); a.restore(); }
function stroke(a, w) { a.lineWidth = w; a.lineCap = 'round'; a.lineJoin = 'round'; a.stroke(); }
function rose(a, cx, cy, r, ink, col) {
  if (col) { a.fillStyle = 'rgba(150,20,28,0.55)'; a.beginPath(); a.arc(cx, cy, r * 0.95, 0, 7); a.fill(); }
  a.strokeStyle = ink; for (let i = 0; i < 4; i++) { const rr = r * (0.25 + i * 0.22); a.beginPath(); a.arc(cx + (i % 2 ? 1 : -1) * r * 0.04, cy, rr, Math.PI * (0.1 + i * 0.37), Math.PI * (1.45 + i * 0.37)); stroke(a, Math.max(1.5, r * 0.06)); }
  for (let i = 0; i < 5; i++) { const an = i / 5 * Math.PI * 2 + 0.3; a.beginPath(); a.arc(cx + Math.cos(an) * r * 0.62, cy + Math.sin(an) * r * 0.62, r * 0.42, an + 0.9, an + 2.3); stroke(a, Math.max(1.5, r * 0.06)); }
}
function leaf(a, x, y, ang, len, ink, col) { petal(a, x, y, ang, len, len * 0.38); if (col) { a.fillStyle = 'rgba(30,90,40,0.5)'; a.fill(); } a.strokeStyle = ink; stroke(a, Math.max(1.4, len * 0.06)); a.save(); a.translate(x, y); a.rotate(ang); a.beginPath(); a.moveTo(0, 0); a.lineTo(0, -len * 0.9); stroke(a, Math.max(1, len * 0.03)); a.restore(); }

export function drawTattooDesign(a, id, x, y, w, h, { ink = '#121212', color = false } = {}) {
  a.save(); a.translate(x, y); const s = Math.min(w, h); const cx = w / 2, cy = h / 2; a.strokeStyle = ink; a.fillStyle = ink;
  const L = (lw) => stroke(a, lw * s / 200);
  switch (id) {
    case 'lotus': { const base = cy + s * 0.22; for (const [ang, len, wid] of [[0, 0.5, 0.17], [-0.42, 0.44, 0.15], [0.42, 0.44, 0.15], [-0.85, 0.36, 0.13], [0.85, 0.36, 0.13], [-1.2, 0.26, 0.1], [1.2, 0.26, 0.1]]) { petal(a, cx, base, ang, len * s, wid * s); if (color) { a.fillStyle = 'rgba(200,70,120,0.35)'; a.fill(); } L(5); }
      a.beginPath(); a.moveTo(cx - s * 0.42, base + s * 0.06); a.quadraticCurveTo(cx, base + s * 0.16, cx + s * 0.42, base + s * 0.06); L(4); for (let i = -3; i <= 3; i++) { a.beginPath(); a.arc(cx + i * s * 0.11, base + s * 0.2, s * 0.012, 0, 7); a.fillStyle = ink; a.fill(); } break; }
    case 'koi': { a.beginPath(); a.moveTo(cx - s * 0.05, cy - s * 0.42); a.bezierCurveTo(cx + s * 0.28, cy - s * 0.3, cx + s * 0.25, cy + s * 0.1, cx - s * 0.02, cy + s * 0.26); a.bezierCurveTo(cx - s * 0.2, cy + s * 0.05, cx - s * 0.25, cy - s * 0.3, cx - s * 0.05, cy - s * 0.42); if (color) { a.fillStyle = 'rgba(220,90,30,0.5)'; a.fill(); } L(5);
      a.beginPath(); a.moveTo(cx - s * 0.02, cy + s * 0.26); a.bezierCurveTo(cx + s * 0.2, cy + s * 0.32, cx + s * 0.18, cy + s * 0.46, cx + s * 0.05, cy + s * 0.48); a.bezierCurveTo(cx, cy + s * 0.4, cx - s * 0.12, cy + s * 0.46, cx - s * 0.2, cy + s * 0.44); a.closePath(); L(4);
      for (let r = 0; r < 5; r++) for (let c = -1; c <= 1; c++) { a.beginPath(); a.arc(cx + c * s * 0.07 + (r % 2) * s * 0.035, cy - s * 0.2 + r * s * 0.08, s * 0.04, 0.2, Math.PI - 0.2); L(2.5); }
      a.beginPath(); a.arc(cx + s * 0.02, cy - s * 0.33, s * 0.018, 0, 7); a.fill(); for (const sx of [-1, 1]) { a.beginPath(); a.moveTo(cx + sx * s * 0.12, cy - s * 0.1); a.quadraticCurveTo(cx + sx * s * 0.3, cy - s * 0.05, cx + sx * s * 0.22, cy + s * 0.06); L(3); }
      for (let i = 0; i < 4; i++) { a.beginPath(); a.arc(cx - s * 0.32 + i * s * 0.2, cy + s * 0.36 + (i % 2) * s * 0.04, s * 0.08, Math.PI * 1.1, Math.PI * 1.9); L(3); } break; }
    case 'tribal': { for (let i = 0; i < 4; i++) { const x0 = i * w / 4; a.beginPath(); a.moveTo(x0, cy); a.bezierCurveTo(x0 + w * 0.08, cy - h * 0.42, x0 + w * 0.18, cy - h * 0.1, x0 + w * 0.25, cy - h * 0.3); a.bezierCurveTo(x0 + w * 0.2, cy + h * 0.05, x0 + w * 0.1, cy - h * 0.05, x0 + w * 0.06, cy + h * 0.32); a.closePath(); a.fill(); }
      a.fillRect(0, cy - h * 0.05, w, h * 0.06); break; }
    case 'rose': rose(a, cx, cy - s * 0.08, s * 0.26, ink, color); leaf(a, cx - s * 0.18, cy + s * 0.2, -0.9, s * 0.2, ink, color); leaf(a, cx + s * 0.18, cy + s * 0.22, 0.9, s * 0.18, ink, color); a.beginPath(); a.moveTo(cx, cy + s * 0.16); a.quadraticCurveTo(cx + s * 0.04, cy + s * 0.32, cx - s * 0.02, cy + s * 0.46); L(5); break;
    case 'dagger': { a.beginPath(); a.moveTo(cx, cy + s * 0.48); P(a, cx - s * 0.05, cy - s * 0.05); P(a, cx + s * 0.05, cy - s * 0.05); a.closePath(); if (color) { a.fillStyle = 'rgba(160,170,180,0.5)'; a.fill(); } L(4); a.beginPath(); a.moveTo(cx, cy + s * 0.44); a.lineTo(cx, cy - s * 0.05); L(2);
      a.fillStyle = ink; a.fillRect(cx - s * 0.16, cy - s * 0.09, s * 0.32, s * 0.04); a.fillRect(cx - s * 0.025, cy - s * 0.3, s * 0.05, s * 0.21); a.beginPath(); a.arc(cx, cy - s * 0.33, s * 0.04, 0, 7); a.fill(); rose(a, cx + s * 0.02, cy - s * 0.12, s * 0.15, ink, color); leaf(a, cx - s * 0.15, cy, -1.2, s * 0.14, ink, color); break; }
    case 'compass': { a.beginPath(); a.arc(cx, cy, s * 0.4, 0, 7); L(5); a.beginPath(); a.arc(cx, cy, s * 0.33, 0, 7); L(2); for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2; const r0 = s * (i % 4 ? 0.3 : 0.27); a.beginPath(); a.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0); a.lineTo(cx + Math.cos(an) * s * 0.33, cy + Math.sin(an) * s * 0.33); L(2); }
      for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 - Math.PI / 2; a.beginPath(); a.moveTo(cx + Math.cos(an) * s * 0.3, cy + Math.sin(an) * s * 0.3); a.lineTo(cx + Math.cos(an + Math.PI / 2) * s * 0.05, cy + Math.sin(an + Math.PI / 2) * s * 0.05); a.lineTo(cx, cy); a.closePath(); if (i === 0) a.fill(); else L(3); }
      a.font = `700 ${Math.round(s * 0.09)}px Georgia, serif`; a.textAlign = 'center'; a.textBaseline = 'middle'; a.fillText('N', cx, cy - s * 0.46); break; }
    case 'mandala': { for (let ring = 0; ring < 4; ring++) { const n = 8 + ring * 4, r = s * (0.1 + ring * 0.1); for (let i = 0; i < n; i++) { petal(a, cx, cy, i / n * Math.PI * 2, r + s * 0.05, s * (0.025 + ring * 0.008)); L(2); } a.beginPath(); a.arc(cx, cy, r, 0, 7); L(1.5); }
      for (let i = 0; i < 24; i++) { const an = i / 24 * Math.PI * 2; a.beginPath(); a.arc(cx + Math.cos(an) * s * 0.47, cy + Math.sin(an) * s * 0.47, s * 0.012, 0, 7); a.fill(); } break; }
    case 'swallow': for (const [ox, oy, sc, fl] of [[-0.12, -0.08, 1, 1], [0.16, 0.16, 0.75, -1]]) { const bx = cx + ox * s, by = cy + oy * s, k = s * sc; a.save(); a.translate(bx, by); a.scale(fl, 1);
      a.beginPath(); a.moveTo(-k * 0.2, 0); a.quadraticCurveTo(0, -k * 0.08, k * 0.18, -k * 0.02); a.quadraticCurveTo(k * 0.05, k * 0.06, -k * 0.2, 0); if (color) { a.fillStyle = 'rgba(30,60,140,0.5)'; a.fill(); } L(4);
      a.beginPath(); a.moveTo(-k * 0.05, -k * 0.03); a.quadraticCurveTo(k * 0.05, -k * 0.3, k * 0.25, -k * 0.32); a.quadraticCurveTo(k * 0.1, -k * 0.15, k * 0.06, -k * 0.03); L(4); a.beginPath(); a.moveTo(-k * 0.2, 0); a.lineTo(-k * 0.34, -k * 0.08); a.moveTo(-k * 0.2, 0); a.lineTo(-k * 0.34, k * 0.06); L(4); a.restore(); } break;
    case 'lion': { a.beginPath(); for (let i = 0; i <= 28; i++) { const an = i / 28 * Math.PI * 2; const r = s * (0.36 + (i % 2 ? 0.06 : 0)); P(a, cx + Math.cos(an) * r, cy + Math.sin(an) * r * 1.05); } a.closePath(); if (color) { a.fillStyle = 'rgba(190,130,40,0.4)'; a.fill(); } L(4);
      a.beginPath(); a.ellipse(cx, cy + s * 0.02, s * 0.2, s * 0.25, 0, 0, 7); L(4); for (const sx of [-1, 1]) { a.beginPath(); a.ellipse(cx + sx * s * 0.08, cy - s * 0.05, s * 0.04, s * 0.022, sx * 0.25, 0, 7); a.fill(); }
      a.beginPath(); a.moveTo(cx - s * 0.05, cy + s * 0.08); a.lineTo(cx, cy + s * 0.14); a.lineTo(cx + s * 0.05, cy + s * 0.08); a.closePath(); a.fill(); a.beginPath(); a.moveTo(cx, cy + s * 0.14); a.lineTo(cx, cy + s * 0.18); a.moveTo(cx - s * 0.07, cy + s * 0.2); a.quadraticCurveTo(cx, cy + s * 0.23, cx + s * 0.07, cy + s * 0.2); L(3);
      for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; a.beginPath(); a.moveTo(cx + Math.cos(an) * s * 0.24, cy + Math.sin(an) * s * 0.28); a.quadraticCurveTo(cx + Math.cos(an + 0.2) * s * 0.32, cy + Math.sin(an + 0.2) * s * 0.36, cx + Math.cos(an) * s * 0.36, cy + Math.sin(an) * s * 0.4); L(2.5); } break; }
    case 'elephant': { a.beginPath(); a.moveTo(cx - s * 0.35, cy + s * 0.3); a.lineTo(cx - s * 0.33, cy - s * 0.02); a.bezierCurveTo(cx - s * 0.3, cy - s * 0.3, cx + s * 0.15, cy - s * 0.32, cx + s * 0.22, cy - s * 0.12); a.bezierCurveTo(cx + s * 0.34, cy - s * 0.1, cx + s * 0.36, cy + s * 0.15, cx + s * 0.42, cy + s * 0.3);
      a.lineTo(cx + s * 0.36, cy + s * 0.31); a.bezierCurveTo(cx + s * 0.3, cy + s * 0.14, cx + s * 0.26, cy + s * 0.05, cx + s * 0.2, cy + s * 0.08); a.lineTo(cx + s * 0.18, cy + s * 0.3); a.lineTo(cx + s * 0.08, cy + s * 0.3); a.lineTo(cx + s * 0.08, cy + s * 0.12); a.lineTo(cx - s * 0.18, cy + s * 0.12); a.lineTo(cx - s * 0.18, cy + s * 0.3); a.closePath();
      if (color) { a.fillStyle = 'rgba(90,90,100,0.35)'; a.fill(); } L(4); a.beginPath(); a.ellipse(cx + s * 0.06, cy - s * 0.08, s * 0.1, s * 0.13, -0.2, 0, 7); L(3); a.beginPath(); a.arc(cx + s * 0.2, cy - s * 0.14, s * 0.014, 0, 7); a.fill();
      a.beginPath(); a.moveTo(cx - s * 0.28, cy - s * 0.24); a.quadraticCurveTo(cx - s * 0.05, cy - s * 0.42, cx + s * 0.16, cy - s * 0.26); L(3); for (let i = 0; i < 5; i++) { a.beginPath(); a.arc(cx - s * 0.2 + i * s * 0.08, cy - s * 0.3 - Math.sin(i / 4 * Math.PI) * s * 0.06, s * 0.018, 0, 7); L(2); } break; }
    case 'wave': { for (let r = 0; r < 4; r++) { a.beginPath(); a.arc(cx - s * 0.05, cy + s * 0.05, s * (0.38 - r * 0.08), Math.PI * 0.9, Math.PI * 2.05); if (r === 0 && color) { a.fillStyle = 'rgba(30,80,150,0.4)'; a.fill(); } L(5 - r); }
      for (let i = 0; i < 7; i++) { const an = Math.PI * (1.15 + i * 0.12); const px = cx - s * 0.05 + Math.cos(an) * s * 0.4, py = cy + s * 0.05 + Math.sin(an) * s * 0.4; a.beginPath(); a.arc(px, py, s * 0.04, an, an + Math.PI); L(3); }
      a.beginPath(); a.moveTo(cx - s * 0.45, cy + s * 0.35); for (let i = 0; i <= 8; i++) a.quadraticCurveTo(cx - s * 0.45 + (i + 0.5) * s * 0.11, cy + s * (i % 2 ? 0.3 : 0.4), cx - s * 0.45 + (i + 1) * s * 0.11, cy + s * 0.35); L(4); break; }
    case 'sunmoon': { a.beginPath(); a.arc(cx, cy, s * 0.24, 0, 7); L(4); for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2; a.beginPath(); a.moveTo(cx + Math.cos(an) * s * 0.28, cy + Math.sin(an) * s * 0.28); a.quadraticCurveTo(cx + Math.cos(an + 0.15) * s * 0.36, cy + Math.sin(an + 0.15) * s * 0.36, cx + Math.cos(an) * s * (i % 2 ? 0.4 : 0.46), cy + Math.sin(an) * s * (i % 2 ? 0.4 : 0.46)); L(3); }
      a.save(); a.beginPath(); a.arc(cx, cy, s * 0.235, 0, 7); a.clip(); a.beginPath(); a.arc(cx + s * 0.1, cy, s * 0.24, 0, 7); if (color) { a.fillStyle = 'rgba(30,30,60,0.6)'; } a.fill(); a.restore(); for (const sx of [-1, 1]) { a.beginPath(); a.arc(cx + sx * s * 0.08 - s * 0.04, cy - s * 0.04, s * 0.02, 0, 7); a.fill(); } break; }
    case 'script': { a.font = `italic 700 ${Math.round(s * 0.28)}px "Brush Script MT", "Segoe Script", Georgia, serif`; a.textAlign = 'center'; a.textBaseline = 'middle'; a.fillText('Ceylon', cx, cy); a.beginPath(); a.moveTo(cx - s * 0.4, cy + s * 0.16); a.quadraticCurveTo(cx, cy + s * 0.26, cx + s * 0.42, cy + s * 0.12); L(2.5); break; }
    case 'geo': { const tri = (r, rot) => { a.beginPath(); for (let i = 0; i < 3; i++) { const an = rot + i / 3 * Math.PI * 2 - Math.PI / 2; P(a, cx + Math.cos(an) * r, cy + Math.sin(an) * r); } a.closePath(); L(3); };
      tri(s * 0.42, 0); tri(s * 0.42, Math.PI); a.beginPath(); a.arc(cx, cy, s * 0.21, 0, 7); L(3); a.beginPath(); a.arc(cx, cy, s * 0.06, 0, 7); a.fill(); for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; a.beginPath(); a.moveTo(cx + Math.cos(an) * s * 0.21, cy + Math.sin(an) * s * 0.21); a.lineTo(cx + Math.cos(an) * s * 0.08, cy + Math.sin(an) * s * 0.08); L(1.5); } break; }
    case 'feather': { a.beginPath(); a.moveTo(cx - s * 0.02, cy + s * 0.48); a.quadraticCurveTo(cx + s * 0.04, cy, cx, cy - s * 0.46); L(3); for (let i = 0; i < 18; i++) { const t = i / 18, py = cy + s * 0.4 - t * s * 0.8, wv = s * (0.06 + 0.16 * Math.sin(t * Math.PI)); for (const sx of [-1, 1]) { a.beginPath(); a.moveTo(cx, py); a.quadraticCurveTo(cx + sx * wv * 0.7, py - s * 0.02, cx + sx * wv, py - s * 0.06); L(1.6); } }
      a.beginPath(); a.ellipse(cx, cy - s * 0.2, s * 0.1, s * 0.13, 0, 0, 7); if (color) { a.fillStyle = 'rgba(20,90,120,0.55)'; a.fill(); } L(3); a.beginPath(); a.ellipse(cx, cy - s * 0.19, s * 0.05, s * 0.07, 0, 0, 7); a.fill(); break; }
    case 'skull': { a.beginPath(); a.moveTo(cx - s * 0.26, cy + s * 0.02); a.bezierCurveTo(cx - s * 0.3, cy - s * 0.42, cx + s * 0.3, cy - s * 0.42, cx + s * 0.26, cy + s * 0.02); a.lineTo(cx + s * 0.18, cy + s * 0.14); a.lineTo(cx + s * 0.16, cy + s * 0.3); a.lineTo(cx - s * 0.16, cy + s * 0.3); a.lineTo(cx - s * 0.18, cy + s * 0.14); a.closePath(); L(5);
      for (const sx of [-1, 1]) { a.beginPath(); a.ellipse(cx + sx * s * 0.11, cy - s * 0.04, s * 0.08, s * 0.07, 0, 0, 7); a.fill(); } a.beginPath(); a.moveTo(cx, cy + s * 0.04); a.lineTo(cx - s * 0.04, cy + s * 0.12); a.lineTo(cx + s * 0.04, cy + s * 0.12); a.closePath(); a.fill(); for (let i = -2; i <= 2; i++) { a.beginPath(); a.moveTo(cx + i * s * 0.05, cy + s * 0.2); a.lineTo(cx + i * s * 0.05, cy + s * 0.3); L(2); } break; }
    case 'anchor': { a.beginPath(); a.arc(cx, cy - s * 0.36, s * 0.06, 0, 7); L(4); a.beginPath(); a.moveTo(cx, cy - s * 0.3); a.lineTo(cx, cy + s * 0.38); L(6); a.beginPath(); a.moveTo(cx - s * 0.17, cy - s * 0.2); a.lineTo(cx + s * 0.17, cy - s * 0.2); L(5); a.beginPath(); a.arc(cx, cy + s * 0.08, s * 0.3, Math.PI * 0.15, Math.PI * 0.85); L(6);
      for (const sx of [-1, 1]) { a.beginPath(); const ex = cx + sx * Math.cos(Math.PI * 0.15) * s * 0.3, ey = cy + s * 0.08 + Math.sin(Math.PI * 0.15) * s * 0.3; a.moveTo(ex, ey); a.lineTo(ex + sx * s * 0.04, ey - s * 0.09); a.lineTo(ex - sx * s * 0.06, ey - s * 0.02); a.closePath(); a.fill(); }
      a.beginPath(); a.moveTo(cx + s * 0.06, cy - s * 0.38); a.bezierCurveTo(cx + s * 0.35, cy - s * 0.2, cx - s * 0.35, cy + s * 0.05, cx + s * 0.2, cy + s * 0.25); L(2.5); break; }
    case 'clock': { a.beginPath(); a.arc(cx + s * 0.06, cy - s * 0.06, s * 0.28, 0, 7); L(5); a.beginPath(); a.arc(cx + s * 0.06, cy - s * 0.06, s * 0.24, 0, 7); L(1.5); a.font = `600 ${Math.round(s * 0.06)}px Georgia, serif`; a.textAlign = 'center'; a.textBaseline = 'middle';
      ['XII', 'III', 'VI', 'IX'].forEach((t, i) => { const an = i * Math.PI / 2 - Math.PI / 2; a.fillText(t, cx + s * 0.06 + Math.cos(an) * s * 0.19, cy - s * 0.06 + Math.sin(an) * s * 0.19); });
      a.beginPath(); a.moveTo(cx + s * 0.06, cy - s * 0.06); a.lineTo(cx + s * 0.06 + s * 0.1, cy - s * 0.06 - s * 0.08); a.moveTo(cx + s * 0.06, cy - s * 0.06); a.lineTo(cx + s * 0.06 - s * 0.03, cy - s * 0.06 + s * 0.15); L(3); rose(a, cx - s * 0.2, cy + s * 0.24, s * 0.15, ink, color); leaf(a, cx - s * 0.02, cy + s * 0.34, 1.4, s * 0.12, ink, color); break; }
    case 'stripes': { for (let i = 0; i < 9; i++) { const x0 = (i + 0.2) * w / 9; a.beginPath(); a.moveTo(x0, 0); a.quadraticCurveTo(x0 + w * 0.05, h * 0.3, x0 - w * 0.01, h * 0.55); a.quadraticCurveTo(x0 + w * 0.03, h * 0.7, x0 + w * 0.01, h); a.lineTo(x0 + w * 0.035, h); a.quadraticCurveTo(x0 + w * 0.055, h * 0.6, x0 + w * 0.025, h * 0.45); a.quadraticCurveTo(x0 + w * 0.07, h * 0.25, x0 + w * 0.03, 0); a.closePath(); a.fill(); } break; }
    case 'dots': { for (let r = 0; r < 5; r++) for (let i = 0; i < 40; i++) { const px = (i + (r % 2) * 0.5) * w / 40, py = h * (0.3 + r * 0.1); a.beginPath(); a.arc(px, py, s * (0.006 + 0.004 * Math.sin((i + r) * 0.8) ** 2) * (r === 2 ? 1.6 : 1), 0, 7); a.fill(); }
      a.fillRect(0, h * 0.22, w, h * 0.015); a.fillRect(0, h * 0.76, w, h * 0.015); break; }
    default: a.beginPath(); a.arc(cx, cy, s * 0.3, 0, 7); L(4);
  }
  a.restore();
}

// per-character atlas: 4 × 2 cells (one per zone, in TATTOO_ZONES order); transparent background, ink in faded blue-black
const ATLAS = new Map();
export function tattooAtlas(THREE, tattoos) {
  const key = JSON.stringify(tattoos); if (ATLAS.has(key)) return ATLAS.get(key);
  if (typeof document === 'undefined') return null; const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const a = cv.getContext('2d'); if (!a) return null;
  a.clearRect(0, 0, 1024, 512);
  TATTOO_ZONES.forEach((z, i) => { const id = tattoos[z.id]; if (!id) return; const cx = (i % 4) * 256, cy = Math.floor(i / 4) * 256; const d = designById(id);
    a.save(); a.beginPath(); a.rect(cx + 2, cy + 2, 252, 252); a.clip(); drawTattooDesign(a, id, cx + (d && d.band ? 0 : 20), cy + (d && d.band ? 40 : 20), d && d.band ? 256 : 216, d && d.band ? 176 : 216, { ink: 'rgba(22,26,34,0.9)', color: true }); a.restore(); });
  // healed ink, not a sticker: colour washes muted and slightly see-through (skin tone shows under them), lines a touch
  // soft where the ink has settled into the skin (a blurred copy under the crisp one)
  try { const im = a.getImageData(0, 0, 1024, 512), d = im.data;
    for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; for (let k = 0; k < 3; k++) d[i + k] = (d[i + k] + (l - d[i + k]) * 0.38) * 0.9; d[i + 3] *= 0.86; }
    a.putImageData(im, 0, 0);
    if ('filter' in a) { const c2 = document.createElement('canvas'); c2.width = 1024; c2.height = 512; const b = c2.getContext('2d'); b.filter = 'blur(1.2px)'; b.drawImage(cv, 0, 0); b.filter = 'none'; b.globalAlpha = 0.8; b.drawImage(cv, 0, 0); a.clearRect(0, 0, 1024, 512); a.drawImage(c2, 0, 0); } } catch (e) { /* tainted / no 2D readback: keep the crisp art */ }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; ATLAS.set(key, t); if (ATLAS.size > 6) { const k0 = ATLAS.keys().next().value; if (k0 !== key) { ATLAS.get(k0).dispose(); ATLAS.delete(k0); } }
  return t;
}
