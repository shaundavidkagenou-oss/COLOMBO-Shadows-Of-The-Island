// Hand-built landmark architecture for Colombo. All geometry is procedural.
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { TEX } from '../gfx/Textures.js';
import { LAND_Y, LAKE, STATIONS, roadAt } from './Layout.js';
import { RNG } from '../core/rng.js';
import { buildPoliceHQ } from './PoliceHQ.js';
import { buildJohnsSchool } from './JohnsSchool.js';

const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const M4 = new THREE.Matrix4();
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function texOf(c, repeat = false) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }

// Large painted label (station names, hotel names, police...). Lines: [{text, font, color}]
function labelMaterial(lines, { w = 1024, h = 256, bg = null, border = null, glow = true } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); } else ctx.clearRect(0, 0, w, h);
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = h * 0.04; ctx.strokeRect(h * 0.04, h * 0.04, w - h * 0.08, h - h * 0.08); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((l, i) => { ctx.fillStyle = l.color || '#fff'; ctx.font = l.font; ctx.fillText(l.text, w / 2, (h * (i + 0.5)) / n, w * 0.94); });
  const t = texOf(c);
  return new THREE.MeshStandardMaterial({ map: t, transparent: !bg, alphaTest: bg ? 0 : 0.3, emissiveMap: glow ? t : null, emissive: glow ? 0xffffff : 0x000000, emissiveIntensity: 0, roughness: 0.6, side: THREE.DoubleSide });
}
function labelMesh(mat, x, y, z, w, h, rotY) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = rotY; return m; }

function mosqueTexture() {
  const W = 512, H = 256, c = canvas(W, H), a = c.getContext('2d'); const e = canvas(W, H), ea = e.getContext('2d');
  ea.fillStyle = '#000'; ea.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 12) { a.fillStyle = (y / 12) % 2 ? '#f3eee4' : '#b0221b'; a.fillRect(0, y, W, 12); }
  for (let fl = 0; fl < 2; fl++) for (let k = 0; k < 4; k++) {
    const x = k * 128 + 34, y = fl * 128 + 22, w = 60, h = 86;
    // voussoir arch alternating red/white
    for (let s = 0; s < 12; s++) { a.fillStyle = s % 2 ? '#f3eee4' : '#b0221b'; a.beginPath(); a.moveTo(x + w / 2, y + w / 2); a.arc(x + w / 2, y + w / 2, w / 2 + 12, Math.PI + (s / 12) * Math.PI, Math.PI + ((s + 1) / 12) * Math.PI); a.fill(); }
    a.fillStyle = '#f3eee4'; a.fillRect(x - 8, y + w / 2, w + 16, h - w / 2 + 6);
    a.fillStyle = '#1e3b2c'; a.beginPath(); a.moveTo(x, y + h); a.lineTo(x, y + w / 2); a.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); a.lineTo(x + w, y + h); a.fill();
    a.strokeStyle = '#d8cfa8'; a.lineWidth = 2; for (let gx = x + 8; gx < x + w; gx += 9) { a.beginPath(); a.moveTo(gx, y + 8); a.lineTo(gx, y + h); a.stroke(); }
    ea.fillStyle = '#ffd890'; ea.globalAlpha = (k + fl) % 3 === 0 ? 0.0 : 0.8; ea.beginPath(); ea.moveTo(x, y + h); ea.lineTo(x, y + w / 2); ea.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ea.lineTo(x + w, y + h); ea.fill(); ea.globalAlpha = 1;
  }
  return { map: texOf(c, true), emis: texOf(e, true) };
}
function stripeTexture(a0 = '#b3261e', a1 = '#f4efe6', vertical = true) {
  const c = canvas(256, 256), a = c.getContext('2d');
  for (let i = 0; i < 16; i++) { a.fillStyle = i % 2 ? a1 : a0; if (vertical) a.fillRect(i * 16, 0, 16, 256); else a.fillRect(0, i * 16, 256, 16); }
  return texOf(c, true);
}
function gopuramTexture() { // colourful tiers of sculpted figures (abstracted)
  const c = canvas(512, 512), a = c.getContext('2d'), rng = new RNG(808);
  a.fillStyle = '#e8d6b0'; a.fillRect(0, 0, 512, 512);
  for (let row = 0; row < 8; row++) {
    const y = row * 64; a.fillStyle = '#c0392b'; a.fillRect(0, y + 56, 512, 8); a.fillStyle = '#f1c40f'; a.fillRect(0, y + 52, 512, 4);
    for (let k = 0; k < 10; k++) {
      const x = k * 51 + 8; const hue = rng.pick(['#2e86c1', '#28b463', '#e67e22', '#c0392b', '#8e44ad', '#f4d03f', '#1abc9c', '#ec7063']);
      a.fillStyle = hue; a.beginPath(); a.ellipse(x + 17, y + 18, 8, 9, 0, 0, 7); a.fill(); a.fillRect(x + 8, y + 26, 18, 24);
      a.fillStyle = '#f5cba7'; a.beginPath(); a.arc(x + 17, y + 16, 5, 0, 7); a.fill();
      a.fillStyle = '#f9e79f'; a.beginPath(); a.moveTo(x + 10, y + 10); a.lineTo(x + 17, y + 1); a.lineTo(x + 24, y + 10); a.fill();
    }
  }
  return texOf(c, true);
}

const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
export function buildLandmarks() {
  const group = new THREE.Group(); group.name = 'landmarks';
  const mb = new MultiBuilder(); const colliders = []; const anim = {};
  const conc = mb.get('concrete'), paint = mb.get('paint'), metal = mb.get('metal');
  const box = (b, cx, cy, cz, sx, sy, sz, col, o = {}) => b.box(cx, cy, cz, sx, sy, sz, { col: C(col), uvScale: o.uv || 3, bottom: true, ...o }); // closed boxes: canopies, lintels and slabs stay solid when seen from below
  const coll = (x0, x1, z0, z1, h, extra = {}) => colliders.push({ x0, x1, z0, z1, h, kind: 'landmark', ...extra });
  const lathe = (b, pts, seg, x, y, z, col, phiStart = 0, phiLen = Math.PI * 2) => { const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg, phiStart, phiLen); M4.makeTranslation(x, y, z); b.geometry(g, M4, C(col)); g.dispose(); };
  const facade = (style, x0, x1, z0, z1, y0, y1, col, uOff = 0) => {
    const f = mb.get('f_' + style); const c = C(col); const BAY = 3.2, FH = 3.3;
    const S = [[x0, z1, x1, z1], [x1, z1, x1, z0], [x1, z0, x0, z0], [x0, z0, x0, z1]];
    for (const [ax, az, bx, bz] of S) { const len = Math.hypot(bx - ax, bz - az); f.wall(ax, az, bx, bz, y0, y1, [uOff, 0, uOff + len / (4 * BAY), (y1 - y0) / (2 * FH)], c); }
    mb.get('roofFlat').hrect(x0, z0, x1, z1, y1, 6, [0.75, 0.73, 0.7]);
  };
  const columns = (x0, z0, x1, z1, n, y0, h, r, col) => { for (let k = 0; k < n; k++) { const t = n === 1 ? 0.5 : k / (n - 1); conc.cylinder(x0 + (x1 - x0) * t, y0, z0 + (z1 - z0) * t, r, r * 0.88, h, 12, { col: C(col), caps: false }); conc.box(x0 + (x1 - x0) * t, y0 + h + 0.2, z0 + (z1 - z0) * t, r * 2.6, 0.4, r * 2.6, { col: C(col) }); conc.box(x0 + (x1 - x0) * t, y0 + 0.2, z0 + (z1 - z0) * t, r * 2.6, 0.4, r * 2.6, { col: C(col) }); } };
  const pediment = (b, cx, y, cz, w, h, depth, rotY, col) => { // triangular gable facing local +z
    const c = Math.cos(rotY), s = Math.sin(rotY); const P = (x, yy, z) => [cx + x * c + z * s, yy, cz - x * s + z * c];
    const tri = (a1, b1, c1) => { const i = b.vcount; const ux = b1[0] - a1[0], uy = b1[1] - a1[1], uz = b1[2] - a1[2], vx = c1[0] - a1[0], vy = c1[1] - a1[1], vz = c1[2] - a1[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; b.vert(...a1, nx / l, ny / l, nz / l, 0, 0, C(col)); b.vert(...b1, nx / l, ny / l, nz / l, 1, 0, C(col)); b.vert(...c1, nx / l, ny / l, nz / l, 0.5, 1, C(col)); b.idx.push(i, i + 1, i + 2); };
    tri(P(-w / 2, y, depth / 2), P(w / 2, y, depth / 2), P(0, y + h, depth / 2));
    tri(P(w / 2, y, -depth / 2), P(-w / 2, y, -depth / 2), P(0, y + h, -depth / 2));
    b.quad(P(w / 2, y, depth / 2), P(w / 2, y, -depth / 2), P(0, y + h, -depth / 2), P(0, y + h, depth / 2), [0, 0, 1, 1], C(col));
    b.quad(P(-w / 2, y, -depth / 2), P(-w / 2, y, depth / 2), P(0, y + h, depth / 2), P(0, y + h, -depth / 2), [0, 0, 1, 1], C(col));
  };
  const hip = (x0, x1, z0, z1, y, rise, col = '#ffffff', mat = 'roofTiles') => {
    const b = mb.get(mat); const ov = 0.8; x0 -= ov; x1 += ov; z0 -= ov; z1 += ov; const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const rh = Math.abs(w - d) / 2; const c = C(col);
    const r0 = w >= d ? [cx - rh, y + rise, cz] : [cx, y + rise, cz - rh], r1 = w >= d ? [cx + rh, y + rise, cz] : [cx, y + rise, cz + rh];
    const A = [x0, y, z1], B = [x1, y, z1], Cc = [x1, y, z0], D = [x0, y, z0];
    const T = (p, q, r) => { const i = b.vcount; const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; b.vert(...p, nx / l, ny / l, nz / l, 0, 0, c); b.vert(...q, nx / l, ny / l, nz / l, Math.hypot(ux, uz) / 4, 0, c); b.vert(...r, nx / l, ny / l, nz / l, 0.5, rise / 2, c); b.idx.push(i, i + 1, i + 2); };
    if (w >= d) { b.quad(A, B, r1, r0, [0, 0, w / 4, d / 6], c); b.quad(Cc, D, r0, r1, [0, 0, w / 4, d / 6], c); T(B, Cc, r1); T(D, A, r0); }
    else { b.quad(B, Cc, r0, r1, [0, 0, d / 4, w / 6], c); b.quad(D, A, r1, r0, [0, 0, d / 4, w / 6], c); T(A, B, r1); T(Cc, D, r0); }
  };
  const labels = [];
  const label = (lines, x, y, z, w, h, rotY, o) => { const m = labelMesh(labelMaterial(lines, o), x, y, z, w, h, rotY); group.add(m); labels.push(m.material); return m; };
  const EN = (px) => `700 ${px}px "Cormorant Garamond", serif`, SANS = (px) => `700 ${px}px "Barlow Condensed", sans-serif`, SI = (px) => `700 ${px}px "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif`, TA = (px) => `700 ${px}px "Noto Sans Tamil", sans-serif`;

  // ------------------------------------------------------------ LOTUS TOWER (Nelum Kuluna)
  {
    const x = 305, z = -480; const y0 = LAND_Y;
    // podium: stepped exhibition halls
    box(conc, x, y0 + 4, z, 64, 8, 64, '#e8e4dc'); box(conc, x, y0 + 11, z, 46, 6, 46, '#dcd6cc');
    mb.get('f_glass2').box(x, y0 + 4, z, 64.2, 4, 64.2, { col: [1, 1, 1], uvScale: 12.8, top: false });
    mb.get('f_glass2').box(x, y0 + 11, z, 46.2, 3.2, 46.2, { col: [0.82, 0.86, 0.9], uvScale: 9.2, top: false }); // upper exhibition hall glazing (4-storey podium)
    for (let k = -3; k <= 3; k++) for (const sgn of [-1, 1]) { metal.box(x + k * 9, y0 + 4, z + sgn * 32.15, 0.35, 4.2, 0.35, { col: C('#bdb9b0') }); metal.box(x + sgn * 32.15, y0 + 4, z + k * 9, 0.35, 4.2, 0.35, { col: C('#bdb9b0') }); }
    // ---- stem: 200 m reinforced-concrete shaft (real tower: ~350 m overall — 4-storey podium, ~200 m shaft, 8-floor bud, mast).
    // Vivid green, flared where it meets the podium, eight shallow vertical flutes, a horizontal panel joint every 4.5 m.
    const SH = 200, sy = y0 + 14; // stem lands ON the upper podium roof (y0 + 8 + 6): it used to start at +17, leaving a 3 m see-through gap
    const R = (h) => { let r = 11 - 4.6 * Math.pow(h / SH, 0.85); if (h < 22) r += 5.5 * Math.pow(1 - h / 22, 2); if (h > 188) r -= 0.7 * smooth01((h - 188) / 12); return r; };
    {
      const rows = []; for (let j = 0; j <= SH; j += 9) { if (j > 0) rows.push([j - 0.1, 1]); rows.push([j, 0]); if (j < SH) rows.push([j + 0.1, 1]); for (const f of [1.5, 3, 4.5, 6, 7.5]) if (j + f < SH - 0.2) rows.push([j + f, 0]); } rows.push([SH, 0]); rows.sort((a, b) => a[0] - b[0]);
      const COLS = 96; const pos = [], col = [], idx = []; const green = new THREE.Color('#3f9a52'), joint = new THREE.Color('#368a48'), lit = new THREE.Color('#4fb262');
      rows.forEach(([h, kind], ri) => { const r0 = R(h); for (let c = 0; c <= COLS; c++) { const a = (c / COLS) * Math.PI * 2; let g = 0; for (let k = 0; k < 8; k++) { let d = a - (k / 8) * Math.PI * 2 - Math.PI / 8; d = Math.atan2(Math.sin(d), Math.cos(d)); g = Math.max(g, Math.exp(-(d * d) / (0.045 * 0.045))); } const r = r0 * (1 - 0.055 * g); pos.push(x + Math.cos(a) * r, sy + h, z + Math.sin(a) * r); const cc = kind ? joint : green.clone().lerp(lit, 0.25 * (1 - g)).lerp(joint, 0.35 * g); col.push(cc.r, cc.g, cc.b); }
        if (ri > 0) { const b0 = (ri - 1) * (COLS + 1), b1 = ri * (COLS + 1); for (let c = 0; c < COLS; c++) idx.push(b0 + c, b1 + c, b0 + c + 1, b0 + c + 1, b1 + c, b1 + c + 1); } });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      const stem = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.05 })); stem.castShadow = true; stem.receiveShadow = true; stem.name = 'lotus-stem'; group.add(stem);
      // glazed lift-core window slots on two faces, every 3.3 m (the lifts and stairs run up the shaft)
      const glass = mb.get('glass'); for (const side of [0, Math.PI]) for (let h = 26; h < SH - 6; h += 3.3) { const r = R(h) * 0.995; const cx = x + Math.cos(side) * r, cz = z + Math.sin(side) * r; glass.box(cx, sy + h, cz, side === 0 ? 0.25 : 0.25, 1.5, 1.3, { col: C('#203038'), uvScale: 2 }); }
      // podium crown where the stem lands: maintenance ring
      lathe(conc, [[17.5, 0], [17.5, 1.2], [16.2, 1.6]], 32, x, sy - 0.2, z, '#d8d2c6');
    }
    // ---- bud (tower house: observation deck, revolving restaurant) with green sepals cupping its base
    const by = sy + SH;
    lathe(paint, [[5.6, -1], [6.4, 0], [13, 5], [19, 13], [21.5, 22], [19, 32], [12, 41], [4.5, 48], [1.6, 52]], 24, x, by, z, '#8b2f78');
    // shell(): a petal/sepal with real thickness — outer skin + inward-facing inner skin (reversed profile) + a rim strip, so no edge or gap is ever see-through
    const shell = (pts, seg, col, colIn, ph, len, t) => { lathe(paint, pts, seg, x, by, z, col, ph, len); const inner = pts.map(([r, h]) => [Math.max(0.2, r - t), h]).reverse(); lathe(paint, inner, seg, x, by, z, colIn, ph, len); const [r1, h1] = pts[pts.length - 1]; lathe(paint, [[r1, h1], [Math.max(0.2, r1 - t), h1]], seg, x, by, z, colIn, ph, len);
      for (const a of [ph, ph + len]) { const ca = Math.sin(a), sa = -Math.cos(a); /* LatheGeometry: x = r·sinφ, z = r·cosφ */ for (let i = 0; i < pts.length - 1; i++) { const [ra, ha] = pts[i], [rb, hb] = pts[i + 1]; const P0 = [x + ca * ra, by + ha, z - sa * ra], P1 = [x + ca * rb, by + hb, z - sa * rb], P2 = [x + ca * (rb - t), by + hb, z - sa * (rb - t)], P3 = [x + ca * (ra - t), by + ha, z - sa * (ra - t)]; paint.quad(P0, P1, P2, P3, [0, 0, 1, 1], C(colIn)); paint.quad(P3, P2, P1, P0, [0, 0, 1, 1], C(colIn)); } } };
    for (let k = 0; k < 6; k++) { const ph = (k / 6) * Math.PI * 2; shell([[5.5, -4], [7.2, -1.6], [8.5, 0], [11, 2.2], [13.6, 4.6], [15.8, 7], [17.6, 9.5], [18.7, 11.2], [19.4, 12.9]], 9, k % 2 ? '#3a8a4b' : '#44a056', '#2f7a40', ph, (Math.PI * 2 / 6) * 0.9, 0.45); }
    for (let layer = 0; layer < 2; layer++) for (let k = 0; k < 8; k++) {
      const ph = (k + layer * 0.5) / 8 * Math.PI * 2; const sc = layer ? 0.92 : 1;
      shell([[7, 1], [11.2, 2.7], [15, 5], [19.2, 8.6], [22.5, 13], [24, 17], [24.5, 21], [23.6, 25.6], [21.5, 30], [18.6, 33.8], [15, 37], [13.4, 38.3]].map(([r, h]) => [r * sc, h + layer * 4]), 10, layer ? '#b44d97' : '#c96aa9', '#7a2a66', ph, Math.PI * 2 / 8 * 0.86, 0.5);
    }
    // observation deck band
    lathe(mb.get('glass'), [[21.8, 0], [22, 5.5]], 48, x, by + 19, z, '#ffffff');
    // deck mullions every 7.5° and the slab edges of the observation deck + revolving-restaurant floors (seen through the petal gaps)
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; metal.box(x + Math.cos(a) * 22.05, by + 21.75, z + Math.sin(a) * 22.05, 0.18, 5.5, 0.18, { col: C('#cfcac0') }); }
    lathe(conc, [[22.4, 0], [22.4, 0.6], [21.6, 0.6]], 48, x, by + 18.4, z, '#e4dfd6'); lathe(conc, [[22.4, 0], [22.4, 0.6], [21.6, 0.6]], 48, x, by + 24.5, z, '#e4dfd6');
    lathe(mb.get('glass'), [[20.6, 0], [19.6, 4.2]], 48, x, by + 25.1, z, '#ffffff'); lathe(conc, [[20.9, 0], [20.9, 0.5], [19.4, 0.5]], 48, x, by + 29.3, z, '#e4dfd6');
    // ---- mast: equipment housing, two service platforms, tapering antenna (~80 m) → top ≈ 350 m above the lake
    const my = by + 50; metal.cylinder(x, my, z, 2.6, 2.0, 7, 16, { col: C('#e6e3dc') });
    metal.cylinder(x, my + 7, z, 1.55, 1.15, 30, 12, { col: C('#d9d6cf') }); metal.cylinder(x, my + 36, z, 3.2, 3.2, 0.6, 16, { col: C('#bdb9b0') });
    metal.cylinder(x, my + 37, z, 0.95, 0.55, 24, 10, { col: C('#d9d6cf') }); metal.cylinder(x, my + 60, z, 1.9, 1.9, 0.45, 12, { col: C('#bdb9b0') });
    metal.cylinder(x, my + 61, z, 0.38, 0.1, 18, 8, { col: C('#cfcbc2') });
    const avMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }); const avGeo = new THREE.SphereGeometry(0.45, 8, 6);
    for (const [hy, rr] of [[36.8, 3.2], [60.6, 1.9]]) for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const m = new THREE.Mesh(avGeo, avMat); m.position.set(x + Math.cos(a) * rr, my + hy, z + Math.sin(a) * rr); group.add(m); }
    { const m = new THREE.Mesh(avGeo, avMat); m.position.set(x, my + 79.3, z); group.add(m); anim.lotusBeacon = m; }
    coll(x - 32, x + 32, z - 32, z + 32, 14); coll(x - 16, x + 16, z - 16, z + 16, 270);
    // night LED lighting (≈20,000 LEDs on the real bud and stem; animated colours)
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff40c0, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const ledGeo = new THREE.LatheGeometry([[7.4, 1], [15.8, 5], [23.4, 13], [25.5, 21], [22.6, 30], [16.4, 38], [9, 45], [2.2, 52]].map(([r, h]) => new THREE.Vector2(r, h)), 48); // just outside the petals so the whole bloom glows
    const led = new THREE.Mesh(ledGeo, ledMat); led.position.set(x, by, z); group.add(led);
    const stripPts = []; for (let h = 0; h <= SH; h += 5) stripPts.push(new THREE.Vector2(R(h) + 0.12, h));
    const lc = document.createElement('canvas'); lc.width = 64; lc.height = 4; const lx = lc.getContext('2d'); lx.fillStyle = '#000'; lx.fillRect(0, 0, 64, 4); lx.fillStyle = '#fff'; lx.fillRect(25, 0, 14, 4); const lt = new THREE.CanvasTexture(lc); lt.wrapS = THREE.RepeatWrapping; lt.repeat.set(48, 1);
    const stemLed = ledMat.clone(); stemLed.map = lt; const strip = new THREE.Mesh(new THREE.LatheGeometry(stripPts, 96), stemLed); strip.position.set(x, sy, z); group.add(strip); anim.lotusStem = stemLed; // vertical LED lines up the stem
    anim.lotus = ledMat;
    label([{ text: 'COLOMBO LOTUS TOWER', font: SANS(90), color: '#f1e3c2' }, { text: 'කොළඹ නෙළුම් කුළුණ  ·  கொழும்பு தாமரைக் கோபுரம்', font: SI(54), color: '#f1e3c2' }], x - 32.4, y0 + 10.5, z, 34, 6, -Math.PI / 2, { h: 256, w: 1400, bg: null });
  }

  // ------------------------------------------------------------ JAMI UL-ALFAR MOSQUE (Pettah)
  {
    const mt = mosqueTexture();
    const mosqueMat = new THREE.MeshStandardMaterial({ map: mt.map, emissiveMap: mt.emis, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.75 });
    const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTexture('#b0221b', '#f3eee4', false), roughness: 0.7, vertexColors: true });
    const mosq = mb.get('mosque'), str = mb.get('stripes');
    const x0 = -3.5, x1 = 29.5, z0 = -889.5, z1 = -865.5, y0 = LAND_Y, H = 13;
    const S = [[x0, z1, x1, z1], [x1, z1, x1, z0], [x1, z0, x0, z0], [x0, z0, x0, z1]];
    for (const [ax, az, bx, bz] of S) { const len = Math.hypot(bx - ax, bz - az); mosq.wall(ax, az, bx, bz, y0, y0 + H, [0, 0, len / 9, 2], [1, 1, 1]); }
    mb.get('roofFlat').hrect(x0, z0, x1, z1, y0 + H, 6, [0.8, 0.76, 0.72]);
    // crenellated striped parapet
    for (const [ax, az, bx, bz] of S) { const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 1.6); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; str.box(ax + (bx - ax) * t, y0 + H + 0.5, az + (bz - az) * t, 0.9, 1.0, 0.9, { col: [1, 1, 1], uvScale: 5.3 }); /* 16 bands per 5.3 m tile = 33 cm bands like the real façade */ } }
    // pinnacles all along the roofline
    const pinn = (px, pz, h, r) => { str.cylinder(px, y0 + H, pz, r, r * 0.85, h, 10, { col: [1, 1, 1], uvScale: 5.3 }); lathe(paint, [[r * 1.4, 0], [r * 1.6, r * 1.2], [r, r * 2.6], [0.05, r * 4]], 10, px, y0 + H + h, pz, '#f3eee4'); };
    for (const [ax, az, bx, bz] of S) { const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 3.2); for (let k = 0; k <= n; k++) { const t = k / n; pinn(ax + (bx - ax) * t, az + (bz - az) * t, k === 0 || k === n ? 7 : 3, k === 0 || k === n ? 0.7 : 0.35); } }
    // central clock tower facing 2nd Cross Street (west)
    const tx = 2.5, tz = -877.5;
    for (const [ax, az, bx, bz] of [[tx - 4, tz + 4, tx + 4, tz + 4], [tx + 4, tz + 4, tx + 4, tz - 4], [tx + 4, tz - 4, tx - 4, tz - 4], [tx - 4, tz - 4, tx - 4, tz + 4]]) mosq.wall(ax, az, bx, bz, y0 + H, y0 + H + 9, [0, 0, 0.9, 1], [1, 1, 1]);
    lathe(paint, [[4.6, 0], [5.2, 1.5], [5, 4], [3.2, 7], [0.4, 9.5], [0.1, 11]], 16, tx, y0 + H + 9.5, tz, '#f3eee4');
    box(str, tx, y0 + H + 9.2, tz, 9, 0.7, 9, '#ffffff', { uv: 5.3 });
    const clock = label([{ text: '◷', font: '400 200px serif', color: '#1a1a1a' }], tx - 4.05, y0 + H + 5.5, tz, 3.6, 3.6, -Math.PI / 2, { w: 256, h: 256, bg: '#f7f2e6', glow: false });
    void clock;
    // grand entrance arch on the west front
    box(str, x0 - 0.6, y0 + 5.5, tz, 1.2, 11, 10, '#ffffff', { uv: 5.3 });
    box(paint, x0 - 1.25, y0 + 3.4, tz, 0.1, 6.5, 5.5, '#1c2a22');
    for (const dz of [-6, 6]) pinn(x0 - 0.6, tz + dz, 9, 0.75);
    group.userData.mosqueMat = mosqueMat;
    mosqueMat.userData.key = 'mosque'; stripeMat.userData.key = 'stripes';
    MAT.mosque = mosqueMat; MAT.stripes = stripeMat; for (const t of [mt.map, mt.emis, stripeMat.map]) { t.anisotropy = 8; t.needsUpdate = true; } // no shimmer at grazing angles
    coll(x0 - 1.4, x1, z0, z1, H + 3);
  }

  // ------------------------------------------------------------ OLD PARLIAMENT (Presidential Secretariat)
  {
    const x0 = -468, x1 = -416, z0 = -734, z1 = -674, y0 = LAND_Y + 1.5;
    box(conc, (x0 + x1) / 2 - 2, LAND_Y + 0.75, (z0 + z1) / 2, x1 - x0 + 10, 1.5, z1 - z0 + 4, '#cdbb92');
    facade('colonial', x0, x1, z0, z1, y0, y0 + 16, '#e2cfa2');
    columns(x0 - 3, z0 + 8, x0 - 3, z1 - 8, 12, y0, 13, 0.75, '#e8d8b0');
    box(conc, x0 - 3, y0 + 13.8, (z0 + z1) / 2, 4.5, 1.6, z1 - z0 - 12, '#e2cfa2');
    pediment(conc, x0 - 3, y0 + 14.6, (z0 + z1) / 2, 22, 5, 4, -Math.PI / 2, '#e8d8b0');
    columns(x0 + 10, z1 + 3, x1 - 10, z1 + 3, 8, y0, 13, 0.7, '#e8d8b0');
    box(conc, (x0 + x1) / 2, y0 + 13.8, z1 + 3, x1 - x0 - 16, 1.6, 4.5, '#e2cfa2');
    box(conc, (x0 + x1) / 2, y0 + 16.6, (z0 + z1) / 2, x1 - x0 + 1, 1.2, z1 - z0 + 1, '#d6c398');
    coll(x0 - 5, x1, z0, z1 + 5, 18);
  }

  // ------------------------------------------------------------ GALLE FACE HOTEL
  {
    const x0 = -465, x1 = -414, z0 = -240, z1 = -205, y0 = LAND_Y; // south wing stops short of the coastal railway curve (track reserve ±7.5 m at z ≈ -190…-196)
    facade('colonial', x0, x1, z0, z1, y0, y0 + 15, '#f7f3ea');
    hip(x0, x1, z0, z1, y0 + 15, 7);
    columns(x0 - 2.5, z0 + 3, x0 - 2.5, z1 - 3, 14, y0, 4, 0.35, '#ffffff');
    box(conc, x0 - 2.5, y0 + 4.3, (z0 + z1) / 2, 4, 0.5, z1 - z0 - 4, '#f2eee4');
    label([{ text: 'GALLE FACE HOTEL', font: EN(150), color: '#2a3b2e' }], x0 - 0.15, y0 + 12.5, (z0 + z1) / 2, 26, 3.2, -Math.PI / 2, { h: 220, w: 1600 });
    label([{ text: 'GALLE FACE HOTEL', font: EN(150), color: '#2a3b2e' }], (x0 + x1) / 2, y0 + 12.5, z0 - 0.15, 26, 3.2, Math.PI, { h: 220, w: 1600 });
    coll(x0 - 4, x1, z0, z1, 22);
  }

  // ------------------------------------------------------------ FORT CLOCK TOWER (old lighthouse)
  {
    const x = -385, z = -915, y0 = LAND_Y;
    box(conc, x, y0 + 3, z, 5.5, 6, 5.5, '#efe6d0');
    lathe(conc, [[2.6, 0], [2.4, 10], [2.2, 20], [2.4, 20.5], [2.4, 21.5]], 12, x, y0 + 6, z, '#f4ecd8');
    box(conc, x, y0 + 28.3, z, 5.8, 0.6, 5.8, '#e2d6bc');
    box(conc, x, y0 + 30.5, z, 4, 4, 4, '#f4ecd8');
    for (const [dx, dz, r] of [[0, 2.05, 0], [2.05, 0, Math.PI / 2], [0, -2.05, Math.PI], [-2.05, 0, -Math.PI / 2]]) label([{ text: '◷', font: '400 200px serif', color: '#111' }], x + dx, y0 + 30.5, z + dz, 2.8, 2.8, r, { w: 256, h: 256, bg: '#fbf6e8', glow: false });
    lathe(paint, [[2.4, 0], [2.6, 0.6], [1.6, 2.6], [0.2, 4.2]], 12, x, y0 + 32.5, z, '#5a5f55');
    coll(x - 2.8, x + 2.8, z - 2.8, z + 2.8, 34);
  }

  // ------------------------------------------------------------ TWIN TOWERS (WTC)
  {
    const y0 = LAND_Y;
    facade('office', -334, -286, -990, -912, y0, y0 + 16, '#ece9e2');
    for (const tz of [-968, -934]) {
      facade('glass', -322, -298, tz - 12, tz + 12, y0 + 16, y0 + 152, '#ffffff');
      box(conc, -310, y0 + 154, tz, 22, 4, 22, '#c8ccd0');
      metal.cylinder(-310, y0 + 156, tz, 0.4, 0.1, 14, 6, { col: [0.7, 0.7, 0.7] });
    }
    coll(-334, -286, -990, -912, 160);
  }

  // ------------------------------------------------------------ DUTCH HOSPITAL (courtyard, tiled roofs, verandas)
  {
    const y0 = LAND_Y, X0 = -384, X1 = -350, Z0 = -888, Z1 = -833, wd = 9;
    const wings = [[X0, X1, Z0, Z0 + wd], [X0, X1, Z1 - wd, Z1], [X0, X0 + wd, Z0 + wd, Z1 - wd], [X1 - wd, X1, Z0 + wd, Z1 - wd]];
    for (const [a, b, c, d] of wings) { facade('villa', a, b, c, d, y0, y0 + 5.2, '#f3eee2'); hip(a, b, c, d, y0 + 5.2, 3.2); coll(a, b, c, d, 9); }
    columns(X0 - 2, Z0 + 2, X0 - 2, Z1 - 2, 12, y0, 3.6, 0.22, '#f8f5ee');
    box(conc, X0 - 2, y0 + 3.8, (Z0 + Z1) / 2, 3.2, 0.25, Z1 - Z0, '#efe9dc');
    label([{ text: 'THE DUTCH HOSPITAL', font: EN(120), color: '#3a2a1a' }, { text: 'ලන්දේසි රෝහල  ·  ஒல்லாந்தர் மருத்துவமனை', font: SI(70), color: '#3a2a1a' }], X0 - 0.1, y0 + 4.7, (Z0 + Z1) / 2, 14, 1.6, -Math.PI / 2, { w: 1400, h: 260, bg: '#f3eee2', glow: false });
  }

  // ------------------------------------------------------------ CARGILLS (red brick, York Street)
  {
    const y0 = LAND_Y, x0 = -268, x1 = -230, z0 = -888, z1 = -843;
    facade('brick', x0, x1, z0, z1, y0, y0 + 16, '#ffffff');
    for (const tz of [z0 + 2.5, z1 - 2.5]) { mb.get('f_brick').box(x0 + 2.5, y0 + 10, tz, 5.6, 20, 5.6, { col: [1, 1, 1], uvScale: 12.8, top: false }); lathe(paint, [[3.2, 0], [3.4, 1], [2.4, 3.8], [0.3, 6.5]], 12, x0 + 2.5, y0 + 20, tz, '#6f7a6a'); }
    label([{ text: 'CARGILLS', font: EN(170), color: '#f8f2e4' }], x0 - 0.15, y0 + 14, (z0 + z1) / 2, 18, 2.6, -Math.PI / 2, { w: 1200, h: 200 });
    coll(x0, x1, z0, z1, 24);
  }

  // ------------------------------------------------------------ RAILWAY STATIONS
  // night light pool on a floor (same fading ground-glow material as the street lamps, MAT.pool)
  const lightPool = (x, z, y, size) => { const h = size / 2; mb.get('pool').hrect(x - h, z - h, x + h, z + h, y, size, null, false, [-(x - h) / size, (z + h) / size]); };
  const station = (x0, x1, z0, z1, towerH, name, si, ta) => {
    const y0 = LAND_Y; facade('colonial', x0, x1, z0, z1, y0, y0 + 8, '#efe0c0'); hip(x0, x1, z0, z1, y0 + 8, 3.5);
    const cx = (x0 + x1) / 2; facade('colonial', cx - 6, cx + 6, z0 - 1, z1 - 4, y0, y0 + towerH, '#f3e6c8'); hip(cx - 6, cx + 6, z0 - 1, z1 - 4, y0 + towerH, 3);
    label([{ text: name, font: SANS(120), color: '#1b2b3a' }, { text: `${si}  ·  ${ta}`, font: SI(74), color: '#1b2b3a' }], cx, y0 + towerH - 2.5, z0 - 1.12, 11, 2.6, Math.PI, { w: 1100, h: 260, bg: '#f8f2de', glow: true });
    for (const [dx, dz] of [[0, -1.15]]) label([{ text: '◷', font: '400 200px serif', color: '#111' }], cx + dx, y0 + towerH - 6, z0 + dz, 2.6, 2.6, Math.PI, { w: 256, h: 256, bg: '#fbf6e8', glow: false });
    // platform + canopy toward the tracks (south)
    // platform face 1.65 m from the track centre (z −612), running back to the station building; yellow safety line
    const pz0 = -612 - 1.65, pz1 = z1, pzc = (pz0 + pz1) / 2, pd = pz0 - pz1, PH = 1.0;
    // platform extent: up to 20 m past the building, clipped 1.5 m short of any road that crosses the line here
    let qa = x0 - 20, qb = x1 + 20; for (let x = cx; x >= x0 - 20; x -= 0.5) if (roadAt(x, -618) || roadAt(x, -628)) { qa = x + 2.0; break; } for (let x = cx; x <= x1 + 20; x += 0.5) if (roadAt(x, -618) || roadAt(x, -628)) { qb = x - 2.0; break; }
    qa += 2.25; qb -= 2.25; const qc = (qa + qb) / 2, qw = qb - qa; // leave room for the end steps
    box(conc, qc, LAND_Y + PH / 2, pzc, qw, PH, pd, '#a9a49a'); box(paint, qc, LAND_Y + PH + 0.006, pz0 - 0.55, qw, 0.012, 0.12, '#e8c020');
    for (let x = qa + 2; x <= qb - 2; x += 8) metal.box(x, LAND_Y + PH + 2.1, pz0 - 4.2, 0.2, 4.2, 0.2, { col: C('#2f3b33') });
    mb.get('corrugated').box(qc, LAND_Y + PH + 4.3, pz0 - 4.6, qw, 0.12, 8.6, { col: [0.8, 0.85, 0.8], uvScale: 4 });
    for (let x = qa + 6; x <= qb - 6; x += 8) { mb.get('emissive').box(x, LAND_Y + PH + 4.18, pz0 - 2.2, 1.2, 0.06, 0.1, { col: [1, 0.97, 0.9] }); lightPool(x, pz0 - 2.4, LAND_Y + PH + 0.02, 6); } // fluorescent tubes + their light on the platform at night
    coll(x0, x1, z0, z1, 12); colliders.push({ x0: qa, x1: qb, z0: pz1, z1: pz0, h: PH, kind: 'platform' });
    for (const ex of [-1, 1]) for (let k = 0; k < 5; k++) { const sx = ex < 0 ? qa - 0.45 * (k + 0.5) : qb + 0.45 * (k + 0.5), h = PH * (1 - (k + 1) / 6); box(conc, sx, LAND_Y + h / 2, pzc - 3, 0.45, h, pd - 6, '#9f9a90'); colliders.push({ x0: sx - 0.225, x1: sx + 0.225, z0: pzc - 3 - (pd - 6) / 2, z1: pzc - 3 + (pd - 6) / 2, h, kind: 'deck' }); } // steps at both ends
  };
  station(-100, 30, -650, -630, 15, 'COLOMBO FORT', 'කොටුව', 'கோட்டை');
  station(432, 528, -650, -630, 22, 'MARADANA', 'මරදාන', 'மருதானை');
  for (const st of STATIONS.slice(2)) { // small halts
    const alongZ = st.along === 'z'; const off = 1.65 + 3; const px = alongZ ? st.x + off : st.x, pz = alongZ ? st.z : st.z - off; // face 1.65 m from the track centre
    box(conc, px, LAND_Y + 0.5, pz, alongZ ? 6 : 110, 1.0, alongZ ? 110 : 6, '#a9a49a'); box(paint, px - (alongZ ? 2.45 : 0), LAND_Y + 1.006, pz + (alongZ ? 0 : 2.45), alongZ ? 0.12 : 110, 0.012, alongZ ? 110 : 0.12, '#e8c020');
    for (const e of [-1, 1]) for (let k = 0; k < 5; k++) { const d = 55 + 0.45 * (k + 0.5), h = 1.0 * (1 - (k + 1) / 6); const sx = alongZ ? px : px + e * d, sz = alongZ ? pz + e * d : pz; box(conc, sx, LAND_Y + h / 2, sz, alongZ ? 6 : 0.45, h, alongZ ? 0.45 : 6, '#9f9a90'); colliders.push({ x0: sx - (alongZ ? 3 : 0.225), x1: sx + (alongZ ? 3 : 0.225), z0: sz - (alongZ ? 0.225 : 3), z1: sz + (alongZ ? 0.225 : 3), h, kind: 'deck' }); }
    mb.get('corrugated').box(px + (alongZ ? 0.7 : 0), LAND_Y + 4.1, pz - (alongZ ? 0 : 0.7), alongZ ? 4.6 : 40, 0.12, alongZ ? 40 : 4.6, { col: [0.85, 0.75, 0.7], uvScale: 4 }); // kept clear of the train's loading gauge
    for (let k = -3; k <= 3; k++) { mb.get('emissive').box(px + (alongZ ? 0.2 : k * 6 + 3), LAND_Y + 3.98, pz + (alongZ ? k * 6 + 3 : -0.2), alongZ ? 0.1 : 1.2, 0.06, alongZ ? 1.2 : 0.1, { col: [1, 0.97, 0.9] }); lightPool(px + (alongZ ? 0 : k * 6 + 3), pz + (alongZ ? k * 6 + 3 : 0), LAND_Y + 1.02, 5.5); } // canopy tubes + light pools
    for (let k = -3; k <= 3; k++) metal.box(px + (alongZ ? 1.8 : k * 6), LAND_Y + 2.55, pz + (alongZ ? k * 6 : -1.8), 0.18, 3.1, 0.18, { col: C('#3a3a3a') });
    label([{ text: st.name.toUpperCase(), font: SANS(110), color: '#111' }, { text: `${st.si}  ·  ${st.ta}`, font: SI(70), color: '#111' }], px + (alongZ ? 2.9 : 0), LAND_Y + 2.7, pz + (alongZ ? 0 : -2.9), 6, 1.4, alongZ ? -Math.PI / 2 : 0, { w: 1000, h: 240, bg: '#f2c94c', glow: false });
    colliders.push({ x0: px - (alongZ ? 3 : 55), x1: px + (alongZ ? 3 : 55), z0: pz - (alongZ ? 55 : 3), z1: pz + (alongZ ? 55 : 3), h: 1.0, kind: 'platform' });
  }

  // ------------------------------------------------------------ TOWN HALL (white dome facing the park)
  {
    const y0 = LAND_Y, x0 = 206, x1 = 286, z0 = -72, z1 = 12;
    box(conc, (x0 + x1) / 2, y0 + 0.6, (z0 + z1) / 2, x1 - x0 + 8, 1.2, z1 - z0 + 8, '#e6e2d8');
    facade('colonial', x0, x1, z0, z1, y0 + 1.2, y0 + 17, '#fbfaf6');
    const cx = 246, cz = -30;
    lathe(conc, [[15, 0], [15, 9], [16, 9.5], [16, 10.5]], 24, cx, y0 + 17, cz, '#ffffff');
    columns(cx + 14, cz, cx + 14, cz, 1, y0 + 17, 9, 0.5, '#ffffff');
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; conc.cylinder(cx + Math.cos(a) * 15.6, y0 + 17, cz + Math.sin(a) * 15.6, 0.55, 0.5, 9, 8, { col: C('#ffffff'), caps: false }); }
    lathe(conc, [[15, 0], [14.5, 4], [12.5, 8.5], [8.5, 12.5], [3, 14.8], [0.1, 15.2]], 24, cx, y0 + 27.5, cz, '#fdfcf8');
    lathe(conc, [[2.2, 0], [2.2, 3], [2.6, 3.4], [0.2, 5.6]], 12, cx, y0 + 42.4, cz, '#ffffff');
    columns(x0 - 4, cz - 14, x0 - 4, cz + 14, 8, y0 + 1.2, 12, 0.7, '#ffffff');
    box(conc, x0 - 4, y0 + 14, cz, 5, 1.6, 32, '#fbfaf6'); pediment(conc, x0 - 4, y0 + 14.8, cz, 32, 5.5, 5, -Math.PI / 2, '#ffffff');
    label([{ text: 'COLOMBO MUNICIPAL COUNCIL', font: EN(100), color: '#2c2c2c' }], x0 - 6.6, y0 + 14, cz, 22, 1.4, -Math.PI / 2, { w: 1600, h: 120 });
    coll(x0 - 7, x1, z0, z1, 45);
  }

  // ------------------------------------------------------------ NATIONAL MUSEUM
  {
    const y0 = LAND_Y, x0 = 14, x1 = 166, z0 = 96, z1 = 134;
    box(conc, 90, y0 + 0.5, 115, 160, 1, 44, '#e6e2d8');
    facade('colonial', x0, x1, z0, z1, y0 + 1, y0 + 14, '#fbf8f0');
    box(conc, 90, y0 + 14.6, 115, x1 - x0 + 1, 1.2, z1 - z0 + 1, '#efeadf');
    columns(76, z0 - 4, 104, z0 - 4, 8, y0 + 1, 11, 0.6, '#ffffff');
    box(conc, 90, y0 + 12.6, z0 - 4, 32, 1.4, 5, '#fbf8f0'); pediment(conc, 90, y0 + 13.3, z0 - 4, 32, 5, 5, Math.PI, '#ffffff');
    label([{ text: 'NATIONAL MUSEUM', font: EN(140), color: '#2c2c2c' }, { text: 'ජාතික කෞතුකාගාරය  ·  தேசிய நூதனசாலை', font: SI(70), color: '#2c2c2c' }], 90, y0 + 12.6, z0 - 6.6, 18, 2.4, Math.PI, { w: 1400, h: 260 });
    coll(x0, x1, z0 - 7, z1, 18);
  }

  // ------------------------------------------------------------ VIHARAMAHADEVI PARK: fountain + paths
  {
    const cx = 90, cz = -60, y0 = LAND_Y;
    lathe(conc, [[11, 0], [11.4, 0.7], [10.6, 0.8], [10.6, 0.3]], 32, cx, y0, cz, '#d8d4ca');
    lathe(conc, [[1.6, 0], [1.4, 2.5], [3.5, 2.8], [3.3, 3.1], [0.6, 3.1], [0.5, 4.5], [1.6, 4.7], [0.2, 5]], 16, cx, y0, cz, '#e6e2d8');
    const fw = new THREE.Mesh(new THREE.CircleGeometry(10.6, 40), new THREE.MeshStandardMaterial({ color: 0x3f6f7a, roughness: 0.05, metalness: 0.3 }));
    fw.rotation.x = -Math.PI / 2; fw.position.set(cx, y0 + 0.5, cz); group.add(fw);
    coll(cx - 11, cx + 11, cz - 11, cz + 11, 0.8);
  }

  // ------------------------------------------------------------ GANGARAMAYA & SEEMA MALAKA
  const stupa = (x, z, r, y0, col = '#fbfbf6') => {
    lathe(conc, [[r * 1.35, 0], [r * 1.35, r * 0.2], [r * 1.22, r * 0.2], [r * 1.22, r * 0.38], [r * 1.1, r * 0.38], [r * 1.1, r * 0.5]], 24, x, y0, z, col);
    lathe(conc, [[r * 1.05, 0], [r * 1.0, r * 0.35], [r * 0.85, r * 0.75], [r * 0.55, r * 1.0], [r * 0.3, r * 1.08], [0.01, r * 1.1]], 24, x, y0 + r * 0.5, z, col);
    box(conc, x, y0 + r * 1.6, z, r * 0.55, r * 0.35, r * 0.55, col);
    lathe(metal, [[r * 0.2, 0], [r * 0.16, r * 0.4], [r * 0.05, r * 1.2], [0.01, r * 1.4]], 12, x, y0 + r * 1.78, z, '#d4af37');
  };
  {
    stupa(-15, -292, 7, LAND_Y); coll(-25, -5, -302, -282, 12);
    facade('villa', -46, -26, -268, -248, LAND_Y, LAND_Y + 6, '#f7f1e3'); hip(-46, -26, -268, -248, LAND_Y + 6, 4); coll(-46, -26, -268, -248, 10);
    label([{ text: 'GANGARAMAYA', font: EN(110), color: '#5a2a0a' }], -36, LAND_Y + 5, -268.2, 10, 1.2, Math.PI, { w: 1000, h: 120 });
    // Seema Malaka: three platforms on the lake with blue-roofed pavilions
    const pads = [[-112, -300, 18], [-112, -323, 12], [-135, -300, 12]];
    const deckY = 0.45;
    for (const [px, pz, s] of pads) {
      box(conc, px, deckY - 0.9, pz, s, 1.8, s, '#cfc8b8');
      for (let k = 0; k < Math.floor(s / 1.2); k++) { const t = -s / 2 + k * 1.2 + 0.6; for (const [dx, dz] of [[t, -s / 2], [t, s / 2], [-s / 2, t], [s / 2, t]]) metal.box(px + dx, deckY + 0.5, pz + dz, 0.12, 1, 0.12, { col: C('#5a3a22') }); }
      const ps = s * 0.62; facade('villa', px - ps / 2, px + ps / 2, pz - ps / 2, pz + ps / 2, deckY, deckY + 3.6, '#f6f2e8');
      hip(px - ps / 2, px + ps / 2, pz - ps / 2, pz + ps / 2, deckY + 3.6, ps * 0.45, '#4f6f80', 'paint');
      if (s > 15) stupa(px, pz, 1.2, deckY + 3.6 + ps * 0.45 - 0.3, '#f2f0e8');
      colliders.push({ x0: px - s / 2, x1: px + s / 2, z0: pz - s / 2, z1: pz + s / 2, h: deckY, kind: 'deck' });
      colliders.push({ x0: px - ps / 2, x1: px + ps / 2, z0: pz - ps / 2, z1: pz + ps / 2, h: 4, kind: 'landmark' });
    }
    // walkways
    const walk = (x0, x1, z0, z1) => { box(conc, (x0 + x1) / 2, deckY - 0.15, (z0 + z1) / 2, x1 - x0, 0.3, z1 - z0, '#bdb4a2'); colliders.push({ x0, x1, z0, z1, h: deckY, kind: 'deck' }); };
    walk(-103, -64, -301.6, -298.4); walk(-113.6, -110.4, -317, -309); walk(-129, -121, -301.6, -298.4);
    anim.seema = true;
  }

  // ------------------------------------------------------------ ST. LUCIA'S CATHEDRAL (Kotahena)
  {
    const y0 = LAND_Y, col = '#efe4c4';
    facade('colonial', 338, 382, -1182, -1112, y0, y0 + 20, col);
    facade('colonial', 322, 398, -1162, -1140, y0, y0 + 18, col);
    lathe(conc, [[10, 0], [10, 7], [10.6, 7.4]], 24, 360, y0 + 20, -1151, col);
    lathe(conc, [[10, 0], [9.4, 4], [7, 8], [3, 10.4], [0.1, 11]], 24, 360, y0 + 27.4, -1151, '#d9d2bf');
    lathe(conc, [[1.6, 0], [1.6, 3], [0.2, 5]], 10, 360, y0 + 38.2, -1151, col);
    columns(344, -1108, 376, -1108, 6, y0 + 1, 14, 0.75, '#f6efdc');
    box(conc, 360, y0 + 16, -1108, 36, 2, 5, col); pediment(conc, 360, y0 + 17, -1108, 36, 6, 5, 0, '#f6efdc');
    for (const tx of [340, 380]) { facade('colonial', tx - 4, tx + 4, -1116, -1108, y0, y0 + 30, col); lathe(paint, [[4, 0], [3, 3], [0.2, 7]], 8, tx, y0 + 30, -1112, '#8a8f88'); }
    metal.box(360, y0 + 44, -1151, 0.3, 3, 0.3, { col: C('#d4af37') }); metal.box(360, y0 + 44.6, -1151, 1.6, 0.3, 0.3, { col: C('#d4af37') });
    coll(322, 398, -1182, -1106, 40);
  }

  // ------------------------------------------------------------ NATIONAL HOSPITAL
  {
    const y0 = LAND_Y;
    facade('office', 610, 700, -290, -250, y0, y0 + 26, '#f4f4f0'); facade('apartment', 610, 650, -250, -180, y0, y0 + 13, '#f2f2ee');
    label([{ text: '✚ NATIONAL HOSPITAL', font: SANS(120), color: '#b71c1c' }, { text: 'ජාතික රෝහල  ·  தேசிய வைத்தியசாலை', font: SI(70), color: '#b71c1c' }], 655, y0 + 23, -249.85, 30, 4, 0, { w: 1400, h: 260, bg: '#ffffff' });
    coll(610, 700, -290, -250, 28); coll(610, 650, -250, -180, 15);
  }

  // ------------------------------------------------------------ SRI MURUGAN KOVIL (gopuram)
  {
    const gMat = new THREE.MeshStandardMaterial({ map: gopuramTexture(), roughness: 0.8, vertexColors: true }); MAT.gopuram = gMat;
    const kv = mb.get('gopuram'); const y0 = LAND_Y; const cx = -190, cz = 568;
    let w = 18, d = 9, y = y0;
    box(conc, cx, y0 + 3.5, cz, w, 7, d, '#f2e8d0'); y += 7;
    for (let t = 0; t < 7; t++) { const h = 2.6; kv.box(cx, y + h / 2, cz, w, h, d, { col: [1, 1, 1], uvScale: 4 }); conc.box(cx, y + h, cz, w + 0.6, 0.35, d + 0.6, { col: C('#c0392b') }); y += h; w *= 0.88; d *= 0.86; }
    conc.cylinder(cx - w / 2, y, cz, d * 0.5, d * 0.5, 0.01, 6, { col: C('#d4a017') });
    kv.box(cx, y + 1.4, cz, w, 2.8, d * 0.8, { col: [1, 0.9, 0.6], uvScale: 4 });
    for (let k = 0; k < 5; k++) metal.cylinder(cx - w / 2 + (k + 0.5) * w / 5, y + 2.8, cz, 0.3, 0.05, 1.4, 6, { col: C('#d4af37') });
    const stMat = new THREE.MeshStandardMaterial({ map: stripeTexture('#b3261e', '#f4efe6', true), roughness: 0.8, vertexColors: true }); MAT.kovilWall = stMat;
    const kw = mb.get('kovilWall');
    for (const [ax, az, bx, bz] of [[-214, 606, -166, 606], [-166, 606, -166, 576], [-166, 576, -214, 576], [-214, 576, -214, 606]]) kw.wall(ax, az, bx, bz, y0, y0 + 6, [0, 0, Math.hypot(bx - ax, bz - az) / 4, 1], [1, 1, 1]);
    hip(-214, -166, 576, 606, y0 + 6, 3, '#ffffff');
    coll(cx - 9, cx + 9, cz - 4.5, cz + 4.5, 30); coll(-214, -166, 576, 606, 9);
  }

  // ------------------------------------------------------------ BORELLA VIHARA (dagoba)
  {
    box(conc, 755, LAND_Y + 0.6, 215, 48, 1.2, 48, '#d6d0c2'); stupa(755, 215, 11, LAND_Y + 1.2);
    for (let k = 0; k < 40; k++) { const t = k / 40 * 4; const s = Math.floor(t), f = t - s; const p = [[-24, -24], [24, -24], [24, 24], [-24, 24], [-24, -24]]; const x = 755 + p[s][0] + (p[s + 1][0] - p[s][0]) * f, z = 215 + p[s][1] + (p[s + 1][1] - p[s][1]) * f; metal.box(x, LAND_Y + 1.7, z, 0.15, 1, 0.15, { col: C('#f2f0e8') }); }
    coll(731, 779, 191, 239, 1.2, { kind: 'deck' }); coll(740, 770, 200, 230, 30);
  }

  // ------------------------------------------------------------ MAJESTIC ARCADE (mall) + POLICE
  {
    const y0 = LAND_Y; facade('glass2', -384, -350, 620, 670, y0, y0 + 24, '#ffffff');
    label([{ text: 'MAJESTIC ARCADE', font: SANS(140), color: '#ffffff' }], -384.2, y0 + 20, 645, 24, 3.2, -Math.PI / 2, { w: 1400, h: 180, bg: '#8b1a1a' });
    coll(-384, -350, 620, 670, 25);
    facade('colonial', -330, -294, -16, 20, y0, y0 + 8, '#f1ead6');
    label([{ text: 'POLICE STATION', font: SANS(120), color: '#ffffff' }, { text: 'පොලිස් ස්ථානය  ·  பொலிஸ் நிலையம்', font: SI(68), color: '#ffffff' }], -312, y0 + 6.5, 20.15, 12, 2.2, 0, { w: 1200, h: 220, bg: '#1d3a7a' });
    coll(-330, -294, -16, 20, 9);
  }

  // ------------------------------------------------------------ COLOMBO LIGHTHOUSE (Fort seafront)
  {
    const x = -500, z = -765, y0 = LAND_Y; box(conc, x, y0 + 1.5, z, 18, 3, 18, '#dcd6c8');
    lathe(conc, [[3.2, 0], [2.6, 24], [3.4, 24.4], [3.4, 25]], 12, x, y0 + 3, z, '#f8f8f4');
    metal.cylinder(x, y0 + 28, z, 1.8, 1.8, 2.6, 12, { col: C('#e8f0f0') }); lathe(paint, [[2.2, 0], [1.2, 1.6], [0.1, 2.6]], 12, x, y0 + 30.6, z, '#b22222');
    coll(x - 9, x + 9, z - 9, z + 9, 3, { kind: 'deck' }); coll(x - 3.3, x + 3.3, z - 3.3, z + 3.3, 32);
    anim.lighthouse = { x, y: y0 + 29.3, z };
  }

  // ------------------------------------------------------------ PORT: gantry cranes and container ships
  {
    const rng = new RNG(919);
    for (let k = 0; k < 7; k++) {
      const x = -430 + k * 92, z = -1186, y0 = LAND_Y, c = k % 2 ? '#c0392b' : '#2e6da4';
      for (const [dx, dz] of [[-7, 4], [7, 4], [-7, -10], [7, -10]]) metal.box(x + dx, y0 + 18, z + dz, 1.2, 36, 1.2, { col: C(c) });
      metal.box(x, y0 + 36, z - 3, 16, 2.2, 1.6, { col: C(c) }); metal.box(x, y0 + 40, z - 22, 3, 2, 70, { col: C(c) });
      metal.box(x, y0 + 38.5, z + 2, 6, 4, 6, { col: C('#e8e8e8') });
      for (const dz of [-30, -50]) metal.box(x, y0 + 30, z + dz, 1, 18, 1, { col: [0.2, 0.2, 0.2] });
      coll(x - 8, x + 8, z - 11, z + 5, 2, { kind: 'pole' });
    }
    for (const [sx, len] of [[-260, 160], [40, 130]]) {
      const z = -1222, y0 = -1.1;
      box(paint, sx, y0 + 4, z, len, 8, 26, '#1f2a36'); box(paint, sx, y0 + 0.6, z, len + 0.2, 1.4, 26.2, '#8b1f1f');
      box(paint, sx + len / 2 - 10, y0 + 15, z, 12, 14, 22, '#f2f2f0'); box(mb.get('glass'), sx + len / 2 - 16.1, y0 + 19, z, 0.2, 2, 20, '#fff');
      for (let i = -len / 2 + 8; i < len / 2 - 22; i += 6.2) for (let r = -2; r <= 2; r++) { const tiers = rng.int(1, 4); for (let t = 0; t < tiers; t++) box(paint, sx + i, y0 + 9.3 + t * 2.6, z + r * 4.2, 6, 2.5, 4, rng.pick(['#b03a2e', '#2471a3', '#1e8449', '#d4ac0d', '#7d3c98', '#ca6f1e', '#5d6d7e'])); }
    }
  }

  // ------------------------------------------------------------ SRI LANKA POLICE HEADQUARTERS (Kompannaveediya)
  buildPoliceHQ({ mb, box, coll, label, group, LAND_Y, SANS, SI, TA, columns, anim, C });
  buildJohnsSchool({ mb, box, coll, label, group, LAND_Y, SANS, SI, TA, EN, hip, anim, C });

  // ------------------------------------------------------------ finalize
  const mats = { ...MAT };
  for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) { if (m.name === 'pool' || m.name === 'emissive' || m.name === 'lampHead') { m.castShadow = false; if (m.name === 'pool') m.receiveShadow = false; } group.add(m); }
  return { group, colliders, anim, labels };
}
