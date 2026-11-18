// Loot art (64th, Phase 1A): the look of everything a defeated pedestrian / officer can leave on the ground — paper money in
// five piles (one folded note, a few loose notes, a small / medium banded bundle, a large collection of bundles), a wallet,
// a phone and a small shoulder bag. Everything shares ONE 512 × 512 colour atlas + a 128 × 128 roughness atlas drawn here at
// load (no image files, no text from a generator): every item is one geometry of a single BatchedMesh in Loot.js — one draw
// call (one more in the shadow pass) for all the loot in the world, whatever its count.
//
// The currency is an original fictional design for the game, not a copy of any real banknote: issuer "SERENDIB RESERVE",
// rupee values 100 / 1000 / 5000 in the colours people expect of those values, a guilloche field, a moonstone (sandakada
// pahana) medallion of concentric half-rings, a lotus watermark window, a windowed security thread and a serial number.
// Real sizes: a note is 150 × 70 mm (Sri Lankan notes are ~ 128–153 mm long), 0.1 mm paper; a banded bundle of fifty is
// 5 mm thick (bundles are scaled to the note count of the amount they hold).
//
// Atlas layout (pixels, origin top-left; v = 1 − y / 512):
//   rows 0–383: three denominations, 128 px each: note face at x 0–255 (y +0…+111), the same note with a paper band at x 256–511;
//               y +112…+127: the stacked-paper edge seen on the sides of a bundle (band section in the middle)
//   rows 384–511: wallet leather (x 0–127) · phone back (128–191) · phone screen (192–255) · bag flap (256–383) · bag cloth (384–447) · strap webbing (448–511)
import * as THREE from 'three';

export const NOTE = { len: 0.15, wid: 0.07, paper: 0.0004 };
export const DENOMS = [
  { v: 100, row: 0, ink: '#5c3a1c', a: '#c98a4b', b: '#ecc996', words: 'ONE HUNDRED' },
  { v: 1000, row: 1, ink: '#20402c', a: '#5f8f6a', b: '#c3dbb0', words: 'ONE THOUSAND' },
  { v: 5000, row: 2, ink: '#4a2412', a: '#b0703c', b: '#ebc08c', words: 'FIVE THOUSAND' },
];
const S = 512;
// UV rectangles in atlas pixels → [u0, v0, u1, v1]
const R = (x0, y0, x1, y1) => [x0 / S, 1 - y1 / S, x1 / S, 1 - y0 / S];
export const UV = {
  note: (row) => R(4, row * 128 + 2, 252, row * 128 + 110),
  band: (row) => R(260, row * 128 + 2, 508, row * 128 + 110),
  edge: (row) => R(0, row * 128 + 113, 256, row * 128 + 127),
  wallet: R(2, 386, 126, 510), phoneBack: R(130, 386, 190, 510), phoneFace: R(194, 386, 254, 510),
  bagFlap: R(258, 386, 382, 510), bagCloth: R(386, 386, 446, 510), strap: R(450, 386, 510, 510),
  frame: R(132, 500, 136, 504), // phone frame: a few dark pixels at the bottom of the phone back
};

let ART = null;
// the two canvases (null under Node: the meshes still build, untextured)
export function lootAtlas() {
  if (ART) return ART;
  const mk = (n) => { if (typeof document === 'undefined' || !document.createElement) return null; const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext && c.getContext('2d'); return x && x.fillRect ? { c, x } : null; };
  const col = mk(S), rgh = mk(128);
  if (col) paintColour(col.x);
  if (rgh) paintRoughness(rgh.x);
  let map = null, roughnessMap = null;
  if (col) { map = new THREE.CanvasTexture(col.c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; }
  if (rgh) { roughnessMap = new THREE.CanvasTexture(rgh.c); roughnessMap.generateMipmaps = true; }
  ART = { map, roughnessMap }; return ART;
}

// ---------------------------------------------------------------------------------------------- painting
// tiny deterministic noise (paper fibre / leather grain), no Math.random so the atlas is the same every run
function hash(i) { i = (i ^ 61) ^ (i >>> 16); i = (i + (i << 3)) | 0; i ^= i >>> 4; i = Math.imul(i, 0x27d4eb2d); i ^= i >>> 15; return (i >>> 0) / 4294967296; }
function speckle(x, x0, y0, w, h, n, colA, colB, size = 1, seed = 1) { for (let i = 0; i < n; i++) { x.fillStyle = hash(i * 7 + seed) < 0.5 ? colA : colB; x.fillRect(x0 + hash(i * 13 + seed * 3) * w, y0 + hash(i * 17 + seed * 5) * h, size, size); } }
function paintNote(x, D, ox, oy, banded) {
  const W = 256, H = 112; x.save(); x.translate(ox, oy);
  // paper with an unprinted margin, then the printed field (two-colour lithographic gradient)
  x.fillStyle = '#efe8d4'; x.fillRect(0, 0, W, H);
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, D.a); g.addColorStop(0.55, D.b); g.addColorStop(1, D.a); x.fillStyle = g; x.fillRect(5, 4, W - 10, H - 8);
  // guilloche: interlaced sine bands across the whole field
  x.lineWidth = 0.6; x.globalAlpha = 0.32; x.strokeStyle = D.ink;
  for (let k = 0; k < 14; k++) { x.beginPath(); for (let px = 5; px <= W - 5; px += 2) { const y = 10 + k * 7 + Math.sin(px * 0.07 + k * 0.9) * 3.2 + Math.sin(px * 0.021 + k) * 2; px === 5 ? x.moveTo(px, y) : x.lineTo(px, y); } x.stroke(); }
  x.globalAlpha = 0.18; for (let k = 0; k < 10; k++) { x.beginPath(); for (let py = 4; py <= H - 4; py += 2) { const px = 92 + k * 9 + Math.sin(py * 0.11 + k * 1.7) * 4; py === 4 ? x.moveTo(px, py) : x.lineTo(px, py); } x.stroke(); }
  x.globalAlpha = 1;
  // watermark window (left): bare paper with a faint lotus
  x.fillStyle = '#f3eedd'; x.beginPath(); x.ellipse(40, 56, 24, 32, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = D.ink; x.globalAlpha = 0.16; x.lineWidth = 1.2;
  for (let k = -2; k <= 2; k++) { x.beginPath(); x.ellipse(40 + k * 5, 60 - Math.abs(k) * 2, 4, 13 - Math.abs(k) * 2, k * 0.35, 0, Math.PI * 2); x.stroke(); }
  x.beginPath(); x.moveTo(26, 74); x.quadraticCurveTo(40, 80, 54, 74); x.stroke(); x.globalAlpha = 1;
  // moonstone medallion (right of centre): concentric half-rings with bead rows, the flat side down
  const cx = 176, cy = 80; x.strokeStyle = D.ink; x.fillStyle = D.ink;
  for (let r = 40, k = 0; r > 6; r -= 6, k++) { x.globalAlpha = 0.55 - k * 0.04; x.lineWidth = k % 2 ? 0.8 : 1.4; x.beginPath(); x.arc(cx, cy, r, Math.PI, 2 * Math.PI); x.stroke();
    if (k % 2 === 0) { const n = Math.round(r * 0.9); for (let i = 1; i < n; i++) { const a = Math.PI + (i / n) * Math.PI; x.beginPath(); x.arc(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3), 0.9, 0, Math.PI * 2); x.fill(); } } }
  x.globalAlpha = 0.7; x.beginPath(); x.arc(cx, cy, 6, Math.PI, 2 * Math.PI); x.fill(); x.fillRect(cx - 44, cy, 88, 1.2); x.globalAlpha = 1;
  // windowed security thread
  x.fillStyle = '#3a3f44'; for (let y = 6; y < H - 6; y += 9) x.fillRect(124, y, 2.2, 5);
  // lettering: issuer, value in words, value in figures (corner + large), serial number
  x.fillStyle = D.ink; x.textBaseline = 'top';
  x.font = 'bold 10px Georgia, "Times New Roman", serif'; x.fillText('SERENDIB RESERVE', 70, 8);
  x.font = '7px Georgia, "Times New Roman", serif'; x.fillText(`RUPEES ${D.words}`, 70, 21);
  x.font = 'bold 22px Georgia, "Times New Roman", serif'; const big = String(D.v); x.fillText(big, W - 10 - x.measureText(big).width, 8);
  x.font = 'bold 12px Georgia, "Times New Roman", serif'; x.fillText(big, 10, H - 20);
  x.fillStyle = '#7a1f1a'; x.font = '8px "Courier New", monospace'; x.fillText(`SR ${String(184000 + D.v * 7).slice(0, 6)}`, 70, H - 15);
  // handling: a soft crease across the middle and a little grime at the corners
  x.globalAlpha = 0.12; x.fillStyle = '#000'; x.fillRect(W / 2 - 0.5, 4, 1, H - 8); x.globalAlpha = 0.07; x.fillRect(0, 0, 14, 10); x.fillRect(W - 14, H - 10, 14, 10); x.globalAlpha = 1;
  speckle(x, 0, 0, W, H, 260, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.08)', 1, D.v);
  if (banded) { // paper band round a bundle: off-white, two printed rules, the value of the notes inside, a stamp
    x.fillStyle = '#e9e4d6'; x.fillRect(W / 2 - 22, 0, 44, H); x.fillStyle = '#2d4f8a'; x.fillRect(W / 2 - 18, 0, 1.4, H); x.fillRect(W / 2 + 16.6, 0, 1.4, H);
    x.save(); x.translate(W / 2 + 4, H / 2); x.rotate(-Math.PI / 2); x.fillStyle = '#2d4f8a'; x.font = 'bold 9px Georgia, serif'; x.textAlign = 'center'; x.fillText(`RS ${D.v}`, 0, -6); x.restore();
    x.globalAlpha = 0.25; x.strokeStyle = '#8a2a20'; x.lineWidth = 1.2; x.beginPath(); x.arc(W / 2 - 2, H / 2 + 26, 8, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1;
  }
  x.restore();
}
function paintEdge(x, D, oy) { // stacked note edges: fine alternating paper / ink lines, the band section in the middle
  for (let y = 0; y < 16; y++) { x.fillStyle = y % 2 ? '#e8e0c8' : D.a; x.globalAlpha = y % 2 ? 1 : 0.75; x.fillRect(0, oy + y, 256, 1); } x.globalAlpha = 1;
  x.fillStyle = '#e9e4d6'; x.fillRect(106, oy, 44, 16); x.fillStyle = '#2d4f8a'; x.fillRect(110, oy, 1.4, 16); x.fillRect(144.6, oy, 1.4, 16);
}
function paintColour(x) {
  x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
  for (const D of DENOMS) { paintNote(x, D, 0, D.row * 128, false); paintNote(x, D, 256, D.row * 128, true); paintEdge(x, D, D.row * 128 + 112); }
  // wallet: dark brown full-grain leather, stitched rim, the fold down the middle
  x.fillStyle = '#3d2618'; x.fillRect(0, 384, 128, 128); speckle(x, 0, 384, 128, 128, 1600, 'rgba(255,230,200,0.06)', 'rgba(0,0,0,0.18)', 1, 11);
  x.strokeStyle = '#a7835c'; x.lineWidth = 1; x.setLineDash([3, 2]); x.strokeRect(7, 391, 114, 114); x.setLineDash([]);
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(63, 384, 2, 128); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(65, 384, 1, 128);
  x.strokeStyle = 'rgba(0,0,0,0.3)'; x.strokeRect(80, 470, 28, 18); // a blind-embossed maker's panel (no lettering)
  // phone back: graphite glass, camera island, frame pixels at the bottom
  const pb = x.createLinearGradient(128, 384, 192, 512); pb.addColorStop(0, '#2b2e33'); pb.addColorStop(1, '#16181b'); x.fillStyle = pb; x.fillRect(128, 384, 64, 128);
  x.fillStyle = '#0d0e10'; x.beginPath(); x.roundRect ? x.roundRect(134, 392, 24, 30, 5) : x.rect(134, 392, 24, 30); x.fill();
  for (const [cx, cy] of [[142, 400], [142, 413]]) { x.fillStyle = '#26292e'; x.beginPath(); x.arc(cx, cy, 4.6, 0, Math.PI * 2); x.fill(); x.fillStyle = '#05070a'; x.beginPath(); x.arc(cx, cy, 2.8, 0, Math.PI * 2); x.fill(); }
  x.fillStyle = '#d8d2b0'; x.beginPath(); x.arc(152, 400, 1.6, 0, Math.PI * 2); x.fill(); x.fillStyle = '#1f2125'; x.fillRect(128, 496, 64, 16);
  // phone screen: switched-off black glass, thin bezel, a soft sky reflection
  x.fillStyle = '#0b0c0e'; x.fillRect(192, 384, 64, 128); x.fillStyle = '#050608'; x.fillRect(195, 388, 58, 120);
  const rf = x.createLinearGradient(195, 388, 253, 508); rf.addColorStop(0, 'rgba(160,175,190,0.16)'); rf.addColorStop(0.45, 'rgba(160,175,190,0.02)'); rf.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rf; x.fillRect(195, 388, 58, 120);
  x.fillStyle = '#15171a'; x.beginPath(); x.arc(224, 392, 1.8, 0, Math.PI * 2); x.fill();
  // bag flap: tan coated canvas, a curved flap edge with stitching and a dull metal clasp
  x.fillStyle = '#7b5a3b'; x.fillRect(256, 384, 128, 128); speckle(x, 256, 384, 128, 128, 1400, 'rgba(255,240,210,0.07)', 'rgba(0,0,0,0.12)', 1, 23);
  x.fillStyle = '#5e4229'; x.beginPath(); x.moveTo(256, 384); x.lineTo(384, 384); x.lineTo(384, 452); x.quadraticCurveTo(320, 478, 256, 452); x.closePath(); x.fill();
  x.strokeStyle = '#c2a27a'; x.setLineDash([3, 2]); x.beginPath(); x.moveTo(262, 388); x.lineTo(262, 448); x.quadraticCurveTo(320, 472, 378, 448); x.lineTo(378, 388); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#8d8a83'; x.fillRect(314, 458, 12, 10); x.fillStyle = '#5b5955'; x.fillRect(317, 461, 6, 4);
  // bag cloth (sides / back) and strap webbing
  x.fillStyle = '#6e5034'; x.fillRect(384, 384, 64, 128); for (let y = 384; y < 512; y += 2) { x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(384, y, 64, 1); }
  x.fillStyle = '#2f2a24'; x.fillRect(448, 384, 64, 128); for (let xx = 448; xx < 512; xx += 3) { x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(xx, 384, 1, 128); }
}
function paintRoughness(x) { // 128 × 128, same layout at 1/4 scale (grey = roughness)
  const g = (v) => { const c = Math.round(v * 255); return `rgb(${c},${c},${c})`; };
  x.fillStyle = g(0.86); x.fillRect(0, 0, 128, 96); // banknote paper
  x.fillStyle = g(0.6); x.fillRect(0, 96, 32, 32); // leather
  x.fillStyle = g(0.38); x.fillRect(32, 96, 16, 32); x.fillStyle = g(0.2); x.fillRect(48, 96, 16, 32); // phone back glass / screen
  x.fillStyle = g(0.9); x.fillRect(64, 96, 64, 32); x.fillStyle = g(0.4); x.fillRect(78, 114, 3, 3); // canvas bag, clasp
}

// ---------------------------------------------------------------------------------------------- geometry
// every geometry: indexed, position + normal + uv (the BatchedMesh needs the same attribute set in all of them)
class GB {
  constructor() { this.p = []; this.n = []; this.uv = []; this.i = []; }
  // quad a,b,c,d (counter-clockwise seen from the front) with uv rectangle r=[u0,v0,u1,v1] mapped a→(u0,v0) b→(u1,v0) c→(u1,v1) d→(u0,v1)
  quad(a, b, c, d, r, flipU = false) {
    const k = this.p.length / 3; const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const v of [a, b, c, d]) { this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); }
    const [u0, v0, u1, v1] = r; const U0 = flipU ? u1 : u0, U1 = flipU ? u0 : u1; this.uv.push(U0, v0, U1, v0, U1, v1, U0, v1); this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  // axis box centred on (cx, cy, cz): top / bottom / sides each with their own uv rectangle
  box(cx, cy, cz, sx, sy, sz, top, bottom, sideL, sideW) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top); // +y (u along +x, v along −z)
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], bottom);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], sideL); this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], sideL); // long sides (±z)
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], sideW); this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], sideW); // short sides (±x)
  }
  build() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setIndex(this.i); g.computeBoundingBox(); g.computeBoundingSphere(); return g; }
}
const sub = (r, a, b) => [r[0] + (r[2] - r[0]) * a, r[1], r[0] + (r[2] - r[0]) * b, r[3]]; // u sub-range of a rectangle
const subV = (r, a, b) => [r[0], r[1] + (r[3] - r[1]) * a, r[2], r[1] + (r[3] - r[1]) * b];

// a single note lying flat with a soft curl along its length (paper never lies dead flat); both faces printed
function noteGeo(row) {
  const b = new GB(), L = NOTE.len, W = NOTE.wid, n = 6, r = UV.note(row); const curl = (t) => 0.0035 * (2 * t - 1) ** 2 + 0.0004;
  for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, x0 = -L / 2 + L * t0, x1 = -L / 2 + L * t1, y0 = curl(t0), y1 = curl(t1); const ru = sub(r, t0, t1);
    b.quad([x0, y0, W / 2], [x1, y1, W / 2], [x1, y1, -W / 2], [x0, y0, -W / 2], ru); b.quad([x1, y1 - NOTE.paper, W / 2], [x0, y0 - NOTE.paper, W / 2], [x0, y0 - NOTE.paper, -W / 2], [x1, y1 - NOTE.paper, -W / 2], ru, true); }
  return b.build();
}
// one note folded once across the middle: the lower half flat on the ground, the upper half sprung open a few degrees at the fold
function foldGeo(row) {
  const b = new GB(), h = NOTE.len / 2, W = NOTE.wid, r = UV.note(row), a = 0.16, y0 = 0.0005; const yTop = (x) => y0 + 0.0012 + (h / 2 - x) * Math.sin(a) * 0.5; // fold at x = +h/2, opening towards −x
  const lo = sub(r, 0, 0.5), hi = sub(r, 0.5, 1);
  b.quad([-h / 2, y0, W / 2], [h / 2, y0, W / 2], [h / 2, y0, -W / 2], [-h / 2, y0, -W / 2], lo); b.quad([h / 2, y0 - NOTE.paper, W / 2], [-h / 2, y0 - NOTE.paper, W / 2], [-h / 2, y0 - NOTE.paper, -W / 2], [h / 2, y0 - NOTE.paper, -W / 2], lo, true);
  b.quad([-h / 2, yTop(-h / 2), W / 2], [h / 2, yTop(h / 2), W / 2], [h / 2, yTop(h / 2), -W / 2], [-h / 2, yTop(-h / 2), -W / 2], hi, true); b.quad([h / 2, yTop(h / 2) - NOTE.paper, W / 2], [-h / 2, yTop(-h / 2) - NOTE.paper, W / 2], [-h / 2, yTop(-h / 2) - NOTE.paper, -W / 2], [h / 2, yTop(h / 2) - NOTE.paper, -W / 2], hi);
  b.quad([h / 2, y0, -W / 2], [h / 2, yTop(h / 2), -W / 2], [h / 2, yTop(h / 2), W / 2], [h / 2, y0, W / 2], subV(UV.edge(row), 0, 0.2)); // the rounded fold edge
  return b.build();
}
// a banded bundle of notes: base height 10 mm (scaled per instance), banded faces top / bottom, stacked edges round the sides
function bundleGeo(row) { const b = new GB(); const e = UV.edge(row); b.box(0, 0.005, 0, NOTE.len + 0.002, 0.01, NOTE.wid + 0.001, UV.band(row), UV.band(row), e, sub(e, 0, 0.3)); return b.build(); }
function walletGeo() { const b = new GB(); const w = UV.wallet; b.box(0, 0.009, 0, 0.11, 0.018, 0.09, w, w, subV(w, 0.45, 0.55), subV(w, 0.45, 0.55)); b.box(0.051, 0.009, 0, 0.012, 0.0185, 0.088, subV(w, 0.4, 0.6), subV(w, 0.4, 0.6), subV(w, 0.45, 0.55), subV(w, 0.45, 0.55)); return b.build(); } // + the rounded spine
function phoneGeo() { const b = new GB(); b.box(0, 0.0041, 0, 0.0715, 0.0082, 0.147, UV.phoneBack, UV.phoneFace, UV.frame, UV.frame); return b.build(); } // top = back (camera), bottom = screen
function bagGeo() { // a soft shoulder bag lying on its back: a pillowed body (the edges pinched thinner than the middle) and the flap on top
  const g = new THREE.BoxGeometry(0.23, 0.075, 0.16, 6, 1, 4); const P = g.attributes.position, U = g.attributes.uv, N = g.attributes.normal;
  for (let i = 0; i < P.count; i++) { const x = P.getX(i) / 0.115, z = P.getZ(i) / 0.08, y = P.getY(i); const puff = 1 - 0.55 * Math.max(x * x, z * z) ** 2; P.setY(i, (y + 0.0375) * puff); // bottom on y = 0, top pillowed
    const ny = N.getY(i), r = ny > 0.5 ? UV.bagFlap : UV.bagCloth; U.setXY(i, r[0] + (r[2] - r[0]) * U.getX(i), r[1] + (r[3] - r[1]) * U.getY(i)); }
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
function strapGeo() { // the shoulder strap coiled loosely beside the bag: a flattened open loop of webbing
  const b = new GB(), n = 20, R0 = 0.16, w = 0.012, t = 0.003, r = UV.strap;
  for (let i = 0; i < n; i++) { const a0 = 0.35 + (i / n) * 5.6, a1 = 0.35 + ((i + 1) / n) * 5.6, rr0 = R0 * (1 - 0.06 * Math.sin(a0 * 2)), rr1 = R0 * (1 - 0.06 * Math.sin(a1 * 2));
    const p = (a, rr, d) => [Math.cos(a) * (rr + d), t, Math.sin(a) * (rr + d) * 0.62]; const ru = subV(r, i / n, (i + 1) / n);
    b.quad(p(a0, rr0, -w / 2), p(a1, rr1, -w / 2), p(a1, rr1, w / 2), p(a0, rr0, w / 2), ru); }
  return b.build();
}
// every loot geometry, by name (Loot.js adds them to the BatchedMesh once)
export function lootGeometries() {
  const G = {}; for (const D of DENOMS) { G['note' + D.v] = noteGeo(D.row); G['fold' + D.v] = foldGeo(D.row); G['bundle' + D.v] = bundleGeo(D.row); }
  G.wallet = walletGeo(); G.phone = phoneGeo(); G.bag = bagGeo(); G.strap = strapGeo(); return G;
}
