// Per-model styling for the catalogue vehicles (VehicleCatalog.js): headlamp and tail-lamp shapes placed on the real
// body surfaces, grilles, bumpers, lower intakes, roof rails / racks, spare wheels, snorkels, flares, side steps,
// pickup load beds, and the FICTIONAL brand emblems + wordmarks. Built into the same MultiBuilder as the base body, so
// the extra parts share the vehicle's materials (lamps use the real lamp materials: headlamp / tail / indicator /
// reverse only — nothing else glows).
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { BRANDS, CATALOG } from './VehicleCatalog.js';

const lerp = (a, b, t) => a + (b - a) * t; const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// ------------------------------------------------------------------------------------------------ badge atlas
// one row per brand wordmark and per model name; rows are drawn centred, the quad width follows the text length
const ROWS = [...Object.keys(BRANDS).map((k) => ['b', k, BRANDS[k].name]), ...Object.keys(CATALOG).map((k) => ['m', k, CATALOG[k].model])];
const ROW_H = 40, ATW = 1024, ATH = 2048;
export const BADGE_ROW = {};
ROWS.forEach(([t, k, s], i) => { BADGE_ROW[`${t}:${k}`] = { i, s, w: Math.min(ATW - 16, Math.round(s.length * ROW_H * (t === 'b' ? 0.62 : 0.5) + 12)), brand: t === 'b' }; });
let badgeMat = null;
export function badgeMaterial() {
  if (badgeMat) return badgeMat;
  const c = document.createElement('canvas'); c.width = ATW; c.height = ATH; const g = c.getContext('2d'); g.clearRect(0, 0, ATW, ATH);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const k in BADGE_ROW) { const r = BADGE_ROW[k]; const y = r.i * ROW_H + ROW_H / 2 + 1;
    g.font = r.brand ? `700 ${Math.round(ROW_H * 0.8)}px "Barlow Condensed", sans-serif` : `italic 600 ${Math.round(ROW_H * 0.78)}px "Barlow Condensed", sans-serif`;
    if (r.brand && 'letterSpacing' in g) g.letterSpacing = '3px'; else if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.fillStyle = '#5c6066'; g.fillText(r.s, ATW / 2 + 1, y + 1, r.w - 8); g.fillStyle = '#eef1f4'; g.fillText(r.s, ATW / 2, y, r.w - 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (badgeMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.35, metalness: 0.7, roughness: 0.28, polygonOffset: true, polygonOffsetFactor: -2 }));
}
// lettering quad centred at (cx, cy, z), height h, facing +z (front) or −z (rear); lean = dz per metre of height
export function badgeText(b, key, cx, cy, z, h, front, lean = 0) {
  const r = BADGE_ROW[key]; if (!r) return 0; const hw = (h * r.w) / ROW_H / 2; const du = r.w / (2 * ATW);
  const v0 = 1 - ((r.i + 1) * ROW_H) / ATH + 0.002, v1 = 1 - (r.i * ROW_H) / ATH - 0.002; const y0 = cy - h / 2, y1 = cy + h / 2, z0 = z - (h / 2) * lean, z1 = z + (h / 2) * lean;
  if (front) b.quad([cx - hw, y0, z0], [cx + hw, y0, z0], [cx + hw, y1, z1], [cx - hw, y1, z1], [0.5 - du, v0, 0.5 + du, v1], [1, 1, 1]);
  else b.quad([cx + hw, y0, z0], [cx - hw, y0, z0], [cx - hw, y1, z1], [cx + hw, y1, z1], [0.5 - du, v0, 0.5 + du, v1], [1, 1, 1]);
  return hw * 2;
}

// ------------------------------------------------------------------------------------------------ emblems
// original geometric marks, unit radius, facing +z, ~0.25 deep; cached per kind
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const G = { box: new THREE.BoxGeometry(1, 1, 1), ring: new THREE.TorusGeometry(1, 0.13, 6, 32), disc: (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 24); g.rotateX(Math.PI / 2); return g; })(), cyl: new THREE.CylinderGeometry(1, 1, 1, 14) };
const put = (b, geo, pos, rot, scl, col) => { _m.compose(_p.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...scl)); b.geometry(geo, _m, col); };
const bar = (b, a, c, t, col, d = 0.22) => { const dx = c[0] - a[0], dy = c[1] - a[1]; put(b, G.box, [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 0], [0, 0, Math.atan2(dy, dx)], [Math.hypot(dx, dy) + t * 0.6, t, d], col); };
const emblemCache = new Map();
function emblemGeo(kind) {
  if (emblemCache.has(kind)) return emblemCache.get(kind);
  const b = new MeshBuilder(); const ch = hex('#d9dde2'), dk = hex('#1a2433');
  const poly = (n, r, t, rot = 0) => { for (let i = 0; i < n; i++) { const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2; bar(b, [Math.cos(a0) * r, Math.sin(a0) * r], [Math.cos(a1) * r, Math.sin(a1) * r], t, ch); } };
  put(b, G.disc, [0, 0, -0.06], [0, 0, 0], kind === 'plaque' ? [0.01, 0.01, 0.01] : [0.96, 0.96, 0.1], dk); // dark backing (enamel)
  switch (kind) {
    case 'peak': put(b, G.ring, [0, 0, 0], [0, 0, 0], [1.3, 0.9, 1], ch); bar(b, [-0.75, -0.42], [0, 0.5], 0.16, ch); bar(b, [0, 0.5], [0.75, -0.42], 0.16, ch); bar(b, [-0.3, 0.08], [0.32, 0.08], 0.1, ch); put(b, G.disc, [0.62, 0.42, 0], [0, 0, 0], [0.09, 0.09, 0.2], ch); break;
    case 'blade': poly(4, 1.12, 0.17, Math.PI / 4); bar(b, [-0.5, -0.55], [0.5, 0.55], 0.2, ch); break;
    case 'orbit': put(b, G.ring, [0, 0, 0], [0, 0, 0], [0.8, 0.8, 1], ch); bar(b, [-1.25, -0.12], [1.25, 0.12], 0.15, ch); break;
    case 'target': put(b, G.ring, [0, 0, 0], [0, 0, 0], [1, 1, 1], ch); put(b, G.ring, [0, 0, 0], [0, 0, 0], [0.55, 0.55, 1], ch); put(b, G.disc, [0, 0, 0], [0, 0, 0], [0.18, 0.18, 0.22], ch); break;
    case 'hex': poly(6, 1.0, 0.16, Math.PI / 6); put(b, G.disc, [0, 0, 0], [0, 0, 0], [0.26, 0.26, 0.24], ch); break;
    case 'bars': poly(4, 1.15, 0.13, Math.PI / 4); for (const [x, h] of [[-0.4, 0.5], [0, 0.85], [0.4, 1.2]]) bar(b, [x, -0.55], [x, -0.55 + h], 0.2, ch); break;
    case 'ellipse': put(b, G.ring, [0, 0, 0], [0, 0, 0], [1, 1, 1], ch); put(b, G.ring, [0, 0, 0.02], [0, 0, 0.55], [0.72, 0.36, 1], ch); break;
    case 'petals': for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 2; put(b, G.disc, [Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0], [0, 0, a], [0.42, 0.3, 0.2], ch); } put(b, G.disc, [0, 0, 0.03], [0, 0, 0], [0.22, 0.22, 0.24], hex('#c9a646')); break;
    case 'compass': put(b, G.ring, [0, 0, 0], [0, 0, 0], [1, 1, 1], ch); bar(b, [0, -0.85], [0, 0.85], 0.14, ch); bar(b, [-0.85, 0], [0.85, 0], 0.14, ch); put(b, G.disc, [0, 0, 0.02], [0, 0, Math.PI / 4], [0.22, 0.22, 0.24], ch); break;
    case 'plaque': put(b, G.box, [0, 0, -0.04], [0, 0, 0], [2.6, 1.0, 0.12], hex('#1d3a6e')); for (const [a, c] of [[[-1.3, -0.5], [1.3, -0.5]], [[-1.3, 0.5], [1.3, 0.5]], [[-1.3, -0.5], [-1.3, 0.5]], [[1.3, -0.5], [1.3, 0.5]]]) bar(b, a, c, 0.12, ch); break;
    default: put(b, G.ring, [0, 0, 0], [0, 0, 0], [1, 1, 1], ch);
  }
  const g = b.build(); emblemCache.set(kind, g); return g;
}
// place an emblem: centre p, radius s, facing +z (dir 1) or −z (dir −1), leaning back by `tilt` radians
export function placeEmblem(X, brand, p, s, dir = 1, tilt = 0) {
  const B = BRANDS[brand]; if (!B) return; const g = emblemGeo(B.emblem);
  _m.compose(_p.set(...p), _q.setFromEuler(_e.set(-tilt * dir, dir < 0 ? Math.PI : 0, 0)), _s.set(s, s, s)); X.mb.get('chrome').geometry(g, _m);
  if (B.emblem === 'plaque') badgeText(X.mb.get('badge'), `b:${brand}`, p[0], p[1], p[2] + dir * 0.02 * s / 0.04, s * 0.62, dir > 0);
}

// ------------------------------------------------------------------------------------------------ styling entry point
export function styleVehicle(X) {
  const { mb, D, W, sill, taper, S } = X; const tp = D.top;
  const paint = mb.get('paint'), rub = mb.get('rubber'), ch = mb.get('chrome'), head = mb.get('vlight'), tail = mb.get('vtail'), ind = mb.get('vind'), rev = mb.get('vrev'), badge = mb.get('badge');
  const chrome = hex('#c9cdd2'), black = hex('#121214'), dark = hex('#1c1d20'), grey = hex('#3a3c40'), col = X.col;
  const bev = X.bev; const bumpY = tp[1][1], fy = tp[2][1], hy = tp[3][1];
  // ---- front face: piecewise surface z(y) over the bumper, lamp line and bonnet edge
  const F = [tp[0], tp[1], tp[2], tp[3]];
  const seg = (P, y) => { for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; if (y >= Math.min(a[1], b[1]) - 1e-6 && y <= Math.max(a[1], b[1]) + 1e-6) return [a, b]; } return y < P[0][1] ? [P[0], P[1]] : [P[P.length - 2], P[P.length - 1]]; };
  const faceZ = (y) => { const [a, b] = seg(F, y); return lerp(a[0], b[0], clamp((y - a[1]) / ((b[1] - a[1]) || 1), 0, 1)); };
  const faceTilt = (y) => { const [a, b] = seg(F, y); return Math.atan2(a[0] - b[0], (b[1] - a[1]) || 1e-3); };
  const xMax = (y) => (W - bev * 0.7) * taper(faceZ(y) - 0.02, y) - 0.01;
  const onF = (x, y, out) => { const t = faceTilt(y); return [[x, y + out * Math.sin(t), faceZ(y) + out * Math.cos(t)], t]; };
  const fbox = (b, x, y, w, h, d, out, col2, rz = 0) => { const [p, t] = onF(x, y, out); put(b, G.box, p, [-t, 0, rz], [w, h, d], col2); };
  // a panel whose half width varies with height, laid on the (bent) front face in thin slices
  const fstrip = (b, hw, y0, y1, out, col2, d = 0.02) => { const n = Math.max(1, Math.ceil((y1 - y0) / 0.035)); for (let i = 0; i < n; i++) { const ya = lerp(y0, y1, i / n), yb = lerp(y0, y1, (i + 1) / n), ym = (ya + yb) / 2; const w = hw(ym); if (w > 0.005) fbox(b, 0, ym, 2 * w, (yb - ya) / Math.cos(faceTilt(ym)) + 0.002, d, out, col2); } };
  // ---- rear face: tail polyline below the belt, rear glass / roof above it
  const gh = X.gh, gL = gh[gh.length - 1], rR = gh[gh.length - 2]; const by = tp[5][1];
  const RP = [tp[8], tp[7], tp[6], tp[5]]; // bottom → belt (y increasing)
  const rearZ = (y) => { if (y <= by) { const [a, b] = seg(RP, y); return lerp(a[0], b[0], clamp((y - a[1]) / ((b[1] - a[1]) || 1), 0, 1)); } if (y <= gL[2]) return gL[0]; return lerp(gL[0], rR[0], clamp((y - gL[2]) / ((rR[2] - gL[2]) || 1), 0, 1)); };
  const rearTilt = (y) => { const e = 0.01; return Math.atan2(rearZ(y + e) - rearZ(y - e), 2 * e); };
  const xRear = (y) => (y <= by ? (W - bev * 0.7) * taper(rearZ(y) + 0.03, y) - 0.01 : lerp(X.gw0, X.gw1, clamp((y - by) / ((rR[2] - by) || 1), 0, 1)) - 0.01);
  const onR = (x, y, out) => { const t = rearTilt(y); return [[x, y + out * Math.sin(t), rearZ(y) - out * Math.cos(t)], t]; };
  const rbox = (b, x, y, w, h, d, out, col2) => { const [p, t] = onR(x, y, out); put(b, G.box, p, [t, 0, 0], [w, h, d], col2); };
  const rstrip = (b, xc, w, y0, y1, out, col2) => { const n = Math.max(1, Math.ceil((y1 - y0) / 0.04)); for (let i = 0; i < n; i++) { const ya = lerp(y0, y1, i / n), yb = lerp(y0, y1, (i + 1) / n), ym = (ya + yb) / 2; rbox(b, xc(ym), ym, w, (yb - ya) / Math.max(0.3, Math.cos(rearTilt(ym))) + 0.003, 0.035, out, col2); } };
  const fz = X.fz, rz = X.rz;

  // =============================================================== HEADLAMPS
  const H = S.head || { t: 'swept', w: 0.32, h: 0.12, x: 0.16 };
  const hyc = H.y ?? (fy + hy) / 2;
  for (const sx of H.fender ? [] : [-1, 1]) { // classic wings carry their own lamps (extras)
    const xo = xMax(hyc); const cx = sx * (xo - (H.x ?? 0.16)); const tilt = sx * (H.tilt || 0);
    if (H.t === 'round') {
      const r = H.r || 0.085; const [p, t] = onF(cx, hyc, 0.018);
      if (S.grille && S.grille.between || H.surround) fbox(rub, cx, hyc, r * 2.5, r * 2.5, 0.02, 0.006, black); // square black surround
      put(ch, G.ring, onF(cx, hyc, 0.026)[0], [-t, 0, 0], [r * 1.05, r * 1.05, 0.12], chrome);
      put(head, G.disc, p, [-t, 0, 0], [r, r, 0.04]);
      if (H.ring) put(ind, G.ring, onF(cx, hyc, 0.03)[0], [-t, 0, 0], [r * 0.7, r * 0.7, 0.08]); // DRL ring
      fbox(ind, sx * (xo - 0.035), hyc - r * 0.6, 0.05, 0.05, 0.03, 0.01);
    } else if (H.t === 'quad') {
      for (const k of [0, 1]) { const x = cx + sx * (k ? 0.5 : -0.5) * (H.w + 0.02); fbox(ch, x, hyc, H.w + 0.02, H.h + 0.02, 0.02, 0.006, grey); fbox(head, x, hyc, H.w, H.h, 0.03, 0.016); }
      fbox(ind, sx * (xo - 0.03), hyc - H.h * 0.25, 0.04, H.h * 0.5, 0.03, 0.012);
    } else { // rect / swept / slim / tall: lens on a dark housing, optional wrap round the corner and fin onto the bonnet
      const w = H.w || 0.3, h = Math.min(H.h || 0.12, (hy - fy) + 0.04);
      fbox(rub, cx, hyc, w + 0.025, h + 0.025, 0.02, 0.005, dark, tilt);
      fbox(head, cx, hyc, w, h, 0.03, 0.016, undefined, tilt);
      if (H.t !== 'rect') fbox(ch, cx - sx * w * 0.18, hyc, w * 0.34, h * 0.55, 0.02, 0.03, chrome, tilt); // projector bezel
      fbox(ind, cx + sx * (w / 2 - 0.035), hyc - h * 0.22, 0.05, h * 0.42, 0.03, 0.03, undefined, tilt); // amber indicator at the outer end
      if (H.amber) fbox(ind, sx * (xo + 0.004), hyc, 0.012, h * 0.95, 0.03, 0.0);
      if (H.wrap) { const zc = faceZ(hyc) - 0.06 - H.wrap / 2; const xs = (W - bev * 0.4) * taper(zc, hyc) + 0.002; const hh = h * 0.8 + Math.abs(H.tilt || 0) * 0.1;
        put(rub, G.box, [sx * (xs - 0.006), hyc + (H.tilt || 0) * 0.06, zc], [0, 0, 0], [0.02, hh + 0.02, H.wrap + 0.02], dark); put(head, G.box, [sx * (xs + 0.002), hyc + (H.tilt || 0) * 0.06, zc], [0, 0, 0], [0.016, hh, H.wrap]); }
      if (H.fin) { const a = tp[3], b = tp[4]; const z0 = a[0] - 0.02, z1 = lerp(a[0], b[0], 0.4); const y0 = a[1], y1 = lerp(a[1], b[1], 0.4); const x = sx * (xMax(hy) - 0.12);
        const dz = z1 - z0, dy = y1 - y0; put(paint, G.box, [x, (y0 + y1) / 2 + 0.025, (z0 + z1) / 2], [Math.atan2(dy, -dz), 0, 0], [0.16, 0.05, Math.hypot(dz, dy)], col);
        put(head, G.box, [x, (y0 + y1) / 2 + 0.03, (z0 + z1) / 2 + 0.01], [Math.atan2(dy, -dz), 0, 0], [0.12, 0.03, Math.hypot(dz, dy) * 0.9]); }
    }
  }
  // =============================================================== GRILLE
  const Gr = S.grille || { t: 'hbars', w: 0.4 };
  let gy0 = Gr.between ? fy + 0.01 : fy - (fy - bumpY) * 0.5, gy1 = hy - 0.025; let emY = (gy0 + gy1) / 2, emOut = 0.035;
  const gw = (Gr.w || 0.4) * xMax((gy0 + gy1) / 2);
  const isChrome = Gr.chrome !== false && Gr.chrome !== undefined ? true : false; const barCol = isChrome ? chrome : dark;
  const frame = (hw, y0, y1, c, t = 0.014) => { fstrip(ch, (y) => hw(y) + t / 2, y1 - t, y1, 0.026, c); fstrip(ch, (y) => hw(y) + t / 2, y0, y0 + t, 0.026, c); const n = Math.ceil((y1 - y0) / 0.035); for (let i = 0; i < n; i++) { const ym = lerp(y0, y1, (i + 0.5) / n); for (const sx of [-1, 1]) fbox(ch, sx * hw(ym), ym, t, (y1 - y0) / n + 0.003, 0.02, 0.026, c); } };
  const hbars = (hw, y0, y1, n, c) => { for (let i = 1; i <= n; i++) { const y = lerp(y0, y1, i / (n + 1)); fbox(ch, 0, y, 2 * hw(y), 0.014, 0.016, 0.022, c); } };
  const vslats = (hw, y0, y1, step, c) => { const n = Math.ceil((y1 - y0) / 0.035); for (let i = 0; i < n; i++) { const ym = lerp(y0, y1, (i + 0.5) / n), w = hw(ym); for (let x = -w + step / 2; x < w - 0.01; x += step) fbox(ch, x, ym, 0.012, (y1 - y0) / n + 0.003, 0.016, 0.02, c); } };
  const meshP = (b, hw, y0, y1, c) => { let row = 0; for (let y = y0 + 0.018; y < y1 - 0.01; y += 0.026, row++) { const w = hw(y); for (let x = -w + 0.025 + (row % 2) * 0.02; x < w - 0.015; x += 0.04) fbox(b, x, y, 0.026, 0.012, 0.012, 0.018, c); } };
  switch (Gr.t) {
    case 'none':
      if (Gr.charge) { const y = hy - 0.07; for (const [a, c] of [[[-0.17, y - 0.06], [0.17, y - 0.06]], [[-0.17, y + 0.06], [0.17, y + 0.06]]]) fbox(rub, 0, a[1], 0.34, 0.005, 0.01, 0.003, black); for (const sx of [-1, 1]) fbox(rub, sx * 0.17, y, 0.005, 0.12, 0.01, 0.003, black); emY = y; emOut = 0.012; }
      else { emY = (fy + hy) / 2 + 0.01; emOut = 0.012; }
      break;
    case 'slot': { gy0 = hy - 0.07; gy1 = hy - 0.025; const hw = () => gw; fstrip(rub, hw, gy0, gy1, 0.01, black); if (isChrome) fstrip(ch, (y) => gw, gy1, gy1 + 0.014, 0.02, chrome); emY = gy0 - 0.045; emOut = 0.014; break; }
    case 'bar': { const t = Gr.thick ? 0.055 : 0.035; const yb = hy - t / 2 - 0.012; fstrip(rub, () => gw * 0.82, fy + 0.005, yb - t / 2, 0.01, black); meshP(mb.get('rubber'), () => gw * 0.78, fy + 0.005, yb - t / 2, grey); fstrip(ch, () => gw, yb - t / 2, yb + t / 2, 0.024, isChrome ? chrome : black); emY = yb; emOut = 0.04; break; }
    case 'tiger': { const ym = (gy0 + gy1) / 2, hh = (gy1 - gy0) / 2; const hw = (y) => gw * (0.72 + 0.28 * Math.abs((y - ym) / hh)); fstrip(rub, hw, gy0, gy1, 0.012, black); meshP(rub, (y) => hw(y) - 0.015, gy0, gy1, grey); frame(hw, gy0, gy1, chrome); break; }
    case 'vmotion': { const hw = (y) => gw * lerp(0.55, 1, (y - gy0) / (gy1 - gy0)); fstrip(rub, hw, gy0, gy1, 0.012, black); meshP(rub, hw, gy0, gy1, grey); const a = onF(gw, gy1, 0.03)[0], c = onF(0, gy0 - 0.03, 0.03)[0], a2 = onF(-gw, gy1, 0.03)[0];
      for (const p of [a, a2]) { const d = new THREE.Vector3(c[0] - p[0], c[1] - p[1], c[2] - p[2]); const L = d.length(); _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); _m.compose(_p.set((p[0] + c[0]) / 2, (p[1] + c[1]) / 2, (p[2] + c[2]) / 2), _q, _s.set(0.035, L, 0.025)); ch.geometry(G.box, _m, chrome); }
      fstrip(ch, () => gw, gy1 - 0.012, gy1 + 0.01, 0.028, chrome); break; }
    case 'classic': { gy0 = bumpY + 0.03; gy1 = hy - 0.03; const ym = (gy0 + gy1) / 2; const hw = (y) => gw * Math.sqrt(Math.max(0.15, 1 - ((y - ym) / ((gy1 - gy0) / 2)) ** 2 * 0.6)); fstrip(rub, hw, gy0, gy1, 0.01, black); hbars(hw, gy0, gy1, 6, chrome); frame(hw, gy0, gy1, chrome, 0.02); emY = gy1 + 0.04; emOut = 0.012; break; }
    case 'slots': { const hw = () => gw; fstrip(rub, hw, gy0, gy1, 0.01, black); const n = Gr.n || 5;
      if (Gr.horiz) for (let i = 1; i < n; i++) { const y = lerp(gy0, gy1, i / n); fbox(paint, 0, y, 2 * gw, 0.03, 0.02, 0.02, col); }
      else for (let i = 1; i < n; i++) { const x = lerp(-gw, gw, i / n); const nn = Math.ceil((gy1 - gy0) / 0.035); for (let k = 0; k < nn; k++) { const ym2 = lerp(gy0, gy1, (k + 0.5) / nn); fbox(paint, x, ym2, 0.035, (gy1 - gy0) / nn + 0.003, 0.02, 0.02, col); } }
      frame(hw, gy0, gy1, col, 0.03); emY = gy1 + 0.035; emOut = 0.014; break; }
    case 'mesh': { const tr = Gr.trap || 1; const hw = (y) => gw * lerp(tr, 1, (y - gy0) / (gy1 - gy0)); fstrip(rub, hw, gy0, gy1, 0.012, black); meshP(rub, hw, gy0, gy1, Gr.chrome ? chrome : grey); if (Gr.chrome) frame(hw, gy0, gy1, chrome); break; }
    case 'vslats': { const tr = Gr.trap || 1; const hw = (y) => gw * lerp(tr, 1, (y - gy0) / (gy1 - gy0)); fstrip(rub, hw, gy0, gy1, 0.012, black); vslats(hw, gy0, gy1, 0.042, barCol); frame(hw, gy0, gy1, barCol, 0.018); break; }
    case 'trapezoid': { gy0 = Math.max(bumpY - 0.04, sill + 0.15); const tr = Gr.trap || 0.78; const hw = (y) => gw * lerp(tr, 1, (y - gy0) / (gy1 - gy0)); fstrip(rub, hw, gy0, gy1, 0.012, black); if (Gr.hex) meshP(rub, hw, gy0, gy1, grey); hbars(hw, gy0, gy1, Gr.n || 2, chrome); frame(hw, gy0, gy1, chrome, 0.02); break; }
    default: { // hbars
      const hw = () => gw; fstrip(rub, hw, gy0, gy1, 0.012, black); hbars(hw, gy0, gy1, Gr.n || 3, barCol); if (Gr.vbar) fstrip(ch, () => 0.012, gy0, gy1, 0.026, chrome); if (isChrome || Gr.frame) frame(hw, gy0, gy1, chrome, 0.016); }
  }
  placeEmblem(X, X.T.make, onF(0, emY, emOut)[0], Gr.emblemBig ? 0.055 : 0.038, 1, faceTilt(emY));
  // ---- lower intake (bumper) + plate
  const Lw = S.lower; const ply = sill + 0.13;
  if (Lw) { const h = Lw.h || 0.1; const yl0 = Math.max(sill + 0.05, Math.min(ply - h / 2, bumpY - 0.03 - h)), yl1 = Math.min(bumpY - 0.02, yl0 + h); const w = (Lw.w || 0.5) * xMax(yl1);
    const hw = Lw.t === 'trapezoid' ? (y) => w * lerp(0.82, 1, (y - yl0) / ((yl1 - yl0) || 1)) : Lw.t === 'smile' ? (y) => w * (0.7 + 0.3 * (y - yl0) / ((yl1 - yl0) || 1)) : () => w;
    fstrip(rub, hw, yl0, yl1, 0.01, black); if (Lw.t === 'mesh' || Lw.mesh) meshP(rub, hw, yl0, yl1, grey); else if (Lw.t !== 'slot' && Lw.t !== 'smile') hbars(hw, yl0, yl1, 1, grey); }
  // ---- bumper finish (unpainted black / grey plastic, or chrome blades on classics)
  const bumperBox = (front) => { const z0 = front ? fz : rz; const yA = sill - 0.01, yB = (front ? bumpY : tp[7][1]) + 0.015; const deep = front ? Math.max(0.12, Math.min(0.32, fz - (X.wf + X.R + 0.12))) : Math.max(0.12, Math.min(0.3, (X.wr - X.R - 0.12) - rz));
    const zc = front ? z0 + 0.03 - deep / 2 : z0 - 0.03 + deep / 2; const hw = (W - bev * 0.3) * taper(zc, (yA + yB) / 2) + 0.012; return { yA, yB, zc, deep, hw }; };
  if (S.bumper === 'black' || S.bumper === 'grey') for (const front of [true, false]) { const b = bumperBox(front); rub.box(0, (b.yA + b.yB) / 2, b.zc, b.hw * 2, b.yB - b.yA, b.deep, { col: S.bumper === 'grey' ? hex('#55585c') : hex('#1b1c1e'), bottom: true }); }
  if (S.bumper === 'chrome') for (const front of [true, false]) { const z = front ? fz + 0.07 : rz - 0.07, y = (front ? bumpY : tp[7][1]) - 0.06, hw = W * 0.92; part3(ch, G.box, [0, y, z], [0, 0, 0], [hw * 2, 0.07, 0.05], chrome); for (const sx of [-1, 1]) { part3(ch, G.box, [sx * hw * 0.42, y + 0.04, z + (front ? 0.02 : -0.02)], [0, 0, 0], [0.05, 0.16, 0.05], chrome); beam3(ch, [sx * hw, y, z], [sx * hw * 0.98, y, z - (front ? 0.22 : -0.22)], 0.05, 0.06, chrome); } }
  { const [p, t] = onF(0, ply, S.bumper === 'black' || S.bumper === 'grey' ? 0.048 : 0.026); put(rub, G.box, [p[0], p[1], p[2] - 0.006], [-t, 0, 0], [0.42, 0.125, 0.01], black); X.plate(0, p[1], p[2] + 0.002, 0.19, 0.05, true); }

  // =============================================================== TAIL LAMPS
  const Tl = S.tail || { t: 'wrap', w: 0.28, h: 0.14 };
  const ty0 = Tl.y ?? ((tp[6][1] + tp[7][1]) / 2 - 0.02);
  const bumpR = S.bumper === 'black' || S.bumper === 'grey';
  for (const sx of [-1, 1]) {
    const t = Tl.t;
    if (t === 'pillar') { const w = Tl.w || 0.1, y0 = by - (Tl.low ?? 0.08), y1 = Math.min(y0 + (Tl.h || 0.4), (rR[2] - 0.08)); const xc = (y) => sx * (xRear(y) - w / 2 + 0.004);
      rstrip(rub, xc, w + 0.02, y0 - 0.01, y1 + 0.01, 0.006, dark); rstrip(tail, xc, w, y0 + (y1 - y0) * 0.3, y1, 0.018); rstrip(ind, xc, w, y0 + (y1 - y0) * 0.12, y0 + (y1 - y0) * 0.3, 0.018); rstrip(rev, xc, w, y0, y0 + (y1 - y0) * 0.12, 0.018); }
    else if (t === 'vertical' || t === 'bedpost') { const w = Tl.w || 0.12, h = Tl.h || 0.3; const y0 = t === 'bedpost' ? tp[7][1] + 0.04 : ty0 - h / 2 + (Tl.up ? 0 : 0), y1 = Math.min(y0 + h, t === 'bedpost' ? tp[6][1] - 0.04 : by - 0.01 + (Tl.up || 0)); const xc = (y) => sx * (xRear(Math.min(y, by - 0.02)) - w / 2 - 0.004);
      rstrip(rub, xc, w + 0.02, y0 - 0.01, y1 + 0.01, 0.006, dark); rstrip(tail, xc, w, y0 + (y1 - y0) * 0.35, y1, 0.018); rstrip(ind, xc, w, y0 + (y1 - y0) * 0.15, y0 + (y1 - y0) * 0.35, 0.018); rstrip(rev, xc, w, y0, y0 + (y1 - y0) * 0.15, 0.018); }
    else if (t === 'small') { const w = Tl.w || 0.1, h = Tl.h || 0.16; const y = Tl.low ? sill + 0.14 : tp[7][1] + h / 2 + 0.05; const x = sx * (xRear(y) - w / 2 - 0.02); const out = Tl.low && bumpR ? 0.045 : 0.012;
      rbox(rub, x, y, w + 0.02, h + 0.02, 0.02, out - 0.008, dark); rbox(tail, x, y + h * 0.18, w, h * 0.6, 0.03, out); rbox(ind, x, y - h * 0.32, w, h * 0.3, 0.03, out); rbox(rev, x - sx * (w + 0.03), y, 0.05, 0.05, 0.03, out); }
    else if (t === 'round') { const r = Tl.r || 0.05, y = ty0; const x = sx * (xRear(y) - r - 0.05); const [p, tt] = onR(x, y, 0.02); put(tail, G.disc, p, [tt, 0, 0], [r, r, 0.03]); put(ch, G.ring, onR(x, y, 0.026)[0], [tt, 0, 0], [r * 1.05, r * 1.05, 0.1], chrome); rbox(ind, x, y - r - 0.04, 0.05, 0.035, 0.03, 0.015); }
    else if (t === 'rect') { const w = Tl.w || 0.2, h = Tl.h || 0.1, y = ty0; const x = sx * (xRear(y) - w / 2 - 0.02); rbox(rub, x, y, w + 0.02, h + 0.02, 0.02, 0.006, dark); rbox(tail, x + sx * w * 0.15, y, w * 0.7, h, 0.03, 0.016); rbox(ind, x - sx * w * 0.38, y, w * 0.24, h, 0.03, 0.016); }
    else if (t === 'bar') { const h = Tl.h || 0.13, y = ty0; const xo = xRear(y); const w = 0.32; const x = sx * (xo - w / 2 - 0.01); rbox(rub, x, y, w + 0.02, h + 0.02, 0.02, 0.006, dark); rbox(tail, x + sx * 0.04, y, w - 0.08, h, 0.03, 0.016); rbox(ind, sx * (xo - 0.03), y, 0.05, h, 0.03, 0.017); rbox(rev, x - sx * (w / 2 - 0.03), y - h * 0.2, 0.06, h * 0.4, 0.03, 0.017);
      if (sx > 0) rbox(rub, 0, y, 2 * (xo - w - 0.02), h * 0.8, 0.02, 0.012, hex('#4a0c0c')); } // unlit red garnish between the lamps
    else { // wrap (default): horizontal cluster at the corner wrapping onto the side, optional upward extension
      const w = Tl.w || 0.28, h = Tl.h || 0.14, y = ty0; const xo = xRear(y); const x = sx * (xo - w / 2 - 0.01);
      rbox(rub, x, y, w + 0.02, h + 0.02, 0.02, 0.006, dark); rbox(tail, x + sx * w * 0.12, y + h * 0.1, w * 0.76, h * 0.8, 0.03, 0.016 + (Tl.proud || 0)); rbox(ind, x - sx * w * 0.38, y + h * 0.15, w * 0.2, h * 0.5, 0.03, 0.017); rbox(rev, x - sx * w * 0.38, y - h * 0.25, w * 0.2, h * 0.36, 0.03, 0.017);
      if (Tl.up) { const xc = (yy) => sx * (xRear(Math.min(yy, by - 0.02)) - 0.04); rstrip(tail, xc, 0.06, y + h / 2, Math.min(by - 0.01, y + h / 2 + Tl.up), 0.016); }
      const zc = rearZ(y) + 0.07; const xs = (W - bev * 0.4) * taper(zc, y) + 0.003; put(tail, G.box, [sx * xs, y + h * 0.1, zc], [0, 0, 0], [0.016, h * 0.7, 0.12]); // side marker / wrap
      if (Tl.garnish && sx > 0) rbox(ch, 0, y - h * 0.55, 2 * (xo - w), 0.025, 0.012, 0.012, chrome); }
  }
  // ---- rear bumper reflectors, plate, badges
  const spare = S.spare; const rpy = spare ? tp[7][1] - 0.1 : Tl.deck ? ty0 - 0.02 : lerp(tp[7][1], ty0, 0.35); const rpyC = clamp(rpy, sill + 0.14, by - 0.1);
  { const [p, t] = onR(0, rpyC, bumpR && rpyC < tp[7][1] + 0.02 ? 0.048 : 0.022); put(rub, G.box, [p[0], p[1], p[2] + 0.006], [t, 0, 0], [0.44, 0.13, 0.01], black); X.plate(0, p[1], p[2] - 0.002, 0.2, 0.055, false); }
  for (const sx of [-1, 1]) rbox(rub, sx * (xRear(sill + 0.14) - 0.08), sill + 0.13, 0.09, 0.025, 0.01, bumpR ? 0.046 : 0.012, hex('#7a0c0c'));
  { const yB = clamp(rpyC + 0.15, rpyC + 0.1, by - 0.04); const xw = xRear(yB);
    if (!spare) placeEmblem(X, X.T.make, onR(0, yB, 0.02)[0], 0.034, -1, rearTilt(yB));
    if (S.tailgateWord) { const yW = (tp[6][1] + tp[7][1]) / 2 + 0.02; const p = onR(0, yW, 0.012)[0]; badgeText(badge, `b:${X.T.make}`, 0, p[1], p[2], 0.075, false, Math.tan(rearTilt(yW))); }
    const yM = clamp(rpyC + 0.03, sill + 0.15, by - 0.05), pm = onR(0, yM, 0.012)[0]; badgeText(badge, `m:${X.type}`, -Math.min(0.5, xw * 0.62), yM, pm[2], 0.034, false, Math.tan(rearTilt(yM)));
    if (!S.tailgateWord) badgeText(badge, `b:${X.T.make}`, Math.min(0.5, xw * 0.62), yM, pm[2], 0.03, false, Math.tan(rearTilt(yM))); }
  if (S.barnDoors) rstrip(rub, () => 0.16, 0.008, tp[7][1] + 0.02, by + 0.62, 0.004, black);
  if (S.splitGlass) { const y = gL[2] - 0.005; put(rub, G.box, [0, y, gL[0] - 0.01], [0, 0, 0], [X.gw0 * 1.9, 0.05, 0.05], black); }

  extras(X, { paint, rub, ch, glass: mb.get('glass'), chrome, black, dark, grey, col, faceZ, onF, onR, rearZ, xMax, xRear, bev });
}

// helpers in world-builder space
function part3(b, geo, pos, rot, scl, col) { put(b, geo, pos, rot, scl, col); }
function beam3(b, a, c, tx, tz, col, geo = G.box) { const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]); const L = d.length(); _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); _m.compose(_p.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2), _q, _s.set(tx, L, tz)); b.geometry(geo, _m, col); }
const arcGeo = (() => { const g = new THREE.TorusGeometry(1, 0.075, 5, 20, Math.PI); g.rotateY(Math.PI / 2); return g; })(); // half ring in the z/y plane
const tyreGeo = (() => { const g = new THREE.TorusGeometry(0.8, 0.22, 8, 24); return g; })();

// ------------------------------------------------------------------------------------------------ extras
function extras(X, K) {
  const { mb, D, W, R, S, gh, gw0, gw1, roofF, roofR, taper, variant, sill } = X; const { paint, rub, ch, glass, chrome, black, dark, col, rearZ, xRear, bev } = K;
  const v = (f) => f === 'v' ? variant % 2 === 1 : !!f; const tp = D.top; const by = tp[5][1];
  const sideX = (z, y) => (W - bev * 0.3) * taper(z, y);
  // roof rails (longitudinal) and roof racks
  if (S.rails) for (const sx of [-1, 1]) { const x = sx * (gw1 - 0.07), y0 = roofF[2] + 0.05, y1 = roofR[2] + 0.05; beam3(ch, [x, y0, roofF[0] - 0.12], [x, y1, roofR[0] + 0.12], 0.035, 0.05, hex('#26282b'));
    for (const z of [roofF[0] - 0.12, roofR[0] + 0.12]) part3(rub, G.box, [x, (z === roofR[0] + 0.12 ? y1 : y0) - 0.025, z], [0, 0, 0], [0.05, 0.05, 0.1], black); }
  if (v(S.rack)) { const y = Math.max(roofF[2], roofR[2]) + 0.1, z0 = roofR[0] + 0.1, z1 = roofF[0] - 0.12, x = gw1 - 0.04;
    for (const sx of [-1, 1]) { beam3(ch, [sx * x, y, z0], [sx * x, y, z1], 0.03, 0.03, black, G.cyl); for (const z of [z0 + 0.1, z1 - 0.1]) beam3(ch, [sx * x, y, z], [sx * x, y - 0.1, z], 0.025, 0.025, black, G.cyl); }
    for (let i = 0; i <= 4; i++) { const z = lerp(z0, z1, i / 4); beam3(ch, [-x, y, z], [x, y, z], 0.025, 0.025, black, G.cyl); } }
  // side steps
  if (S.step) for (const sx of [-1, 1]) { const z0 = X.wr + R + 0.12, z1 = X.wf - R - 0.12; part3(rub, G.box, [sx * (W - 0.06), sill - 0.07, (z0 + z1) / 2], [0, 0, 0], [0.18, 0.035, z1 - z0], dark); part3(ch, G.box, [sx * (W + 0.025), sill - 0.07, (z0 + z1) / 2], [0, 0, 0], [0.012, 0.03, z1 - z0], chrome); }
  // spare wheel on the tailgate (bare tyre or hard cover)
  if (S.spare) { const r = R * 0.98; const y = clamp(tp[7][1] + r * 0.85, sill + r, by + 0.5 - r); const z = rearZ(y) - 0.14;     if (S.spare === 'bare') { const m = new THREE.Matrix4().compose(_p.set(0, y, z), _q.identity(), _s.set(r * 1.0, r * 1.0, r * 1.25)); rub.geometry(tyreGeo, m, hex('#151516')); part3(ch, G.disc, [0, y, z - 0.03], [0, 0, 0], [r * 0.6, r * 0.6, 0.05], hex('#9a9ea4')); }
    else { part3(rub, G.disc, [0, y, z + 0.02], [0, 0, 0], [r, r, 0.22], hex('#151516')); part3(paint, G.disc, [0, y, z - 0.1], [0, 0, 0], [r * 0.96, r * 0.96, 0.04], col); part3(ch, G.ring, [0, y, z - 0.12], [0, 0, 0], [r * 0.96, r * 0.96, 0.25], hex('#3a3c40')); }
    placeEmblem(X, X.T.make, [0, y, z - 0.14], 0.06, -1, 0);
    part3(rub, G.box, [0, y, rearZ(y) - 0.04], [0, 0, 0], [0.16, 0.16, 0.08], black); }
  // snorkel on the right-hand (driver, −x) front wing, up the A-pillar
  if (v(S.snorkel)) { const x = -(W + 0.045), cz = gh[0][0], yb = gh[0][1] - 0.12, yt = roofF[2] - 0.08; beam3(rub, [x, yb, cz + 0.28], [x, yb + 0.03, cz - 0.02], 0.07, 0.07, black, G.cyl); beam3(rub, [x, yb, cz - 0.02], [x, yt, lerp(cz, roofF[0], 0.85)], 0.075, 0.075, black, G.cyl); part3(rub, G.box, [x, yt + 0.04, lerp(cz, roofF[0], 0.85) + 0.05], [0, 0, 0], [0.11, 0.1, 0.17], black); }
  // fender flares / lower cladding
  if (S.flares || S.cladding) { const fl = S.flares === 'body' ? col : black; for (const sx of [-1, 1]) for (const wz of [X.wf, X.wr]) { const x = sx * (sideX(wz, R + 0.2) - 0.004); const m = new THREE.Matrix4().compose(_p.set(x, R, wz), _q.identity(), _s.set(S.cladding && !S.flares ? 0.4 : 0.62, R + 0.1, R + 0.1)); (S.flares === 'body' ? paint : rub).geometry(arcGeo, m, fl); } }
  if (S.cladding) for (const sx of [-1, 1]) part3(rub, G.box, [sx * (sideX(0, sill + 0.06) + 0.008), sill + 0.06, (X.wf + X.wr) / 2], [0, 0, 0], [0.02, 0.1, X.wf - X.wr - 2 * R - 0.25], black);
  if (S.skid) { part3(ch, G.box, [0, sill + 0.03, X.fz + 0.01], [0.3, 0, 0], [0.7, 0.05, 0.06], hex('#a8acb0')); part3(ch, G.box, [0, sill + 0.03, X.rz - 0.01], [-0.3, 0, 0], [0.7, 0.05, 0.06], hex('#a8acb0')); }
  // chrome belt line / D-pillar kink
  if (S.chromeBelt) for (const sx of [-1, 1]) { const a = gh[0], b = gh[gh.length - 1]; const pts = sx > 0 ? [[a[0], b[0]]] : [[a[0], D.door[0]], [D.door[1], b[0]]]; for (const [za, zb] of pts) beam3(ch, [sx * (gw0 + 0.014), lerp(a[1], b[1], (a[0] - za) / (a[0] - b[0])) + 0.006, za], [sx * (gw0 + 0.014), lerp(a[1], b[1], (a[0] - zb) / (a[0] - b[0])) + 0.006, zb], 0.012, 0.02, chrome); }
  if (S.kink) for (const sx of [-1, 1]) { const b = gh[gh.length - 1], rr = gh[gh.length - 2]; beam3(ch, [sx * (gw0 + 0.01), b[1] + 0.01, rr[0] + 0.35], [sx * (gw0 - 0.005), b[1] + 0.13, rr[0] - 0.02], 0.02, 0.03, chrome); }
  // whip antenna on the kerb-side wing
  if (S.antenna) { const z = gh[0][0] + 0.12, x = sideX(z, gh[0][1]) - 0.06; beam3(ch, [x, gh[0][1] - 0.02, z], [x - 0.02, gh[0][1] + 0.8, z - 0.25], 0.006, 0.006, hex('#2a2a2a'), G.cyl); }
  // black side rubbing strips (90s saloons); the driver door keeps its own section free
  if (S.rubStrip) for (const sx of [-1, 1]) { const y = sill + 0.3, za = X.wr + R + 0.1, zb = X.wf - R - 0.1; const segs = sx > 0 ? [[za, zb]] : [[za, D.door[1] - 0.01], [D.door[0] + 0.01, zb]]; for (const [z0, z1] of segs) if (z1 > z0) part3(rub, G.box, [sx * (sideX((z0 + z1) / 2, y) + 0.008), y, (z0 + z1) / 2], [0, 0, 0], [0.02, 0.04, z1 - z0], black); }
  // classic separate wings with the headlamps in their noses
  if (S.fenders) for (const sx of [-1, 1]) {
    const fb = new MeshBuilder(); const yT = tp[3][1] + 0.02; const zf = X.fz - 0.02, zb = X.wf - R - 0.35; const secs = [[zb - 0.1, sill + 0.05, sill + 0.12, 0.05, 0.04, 0.03], [zb, sill + 0.02, R + 0.18, 0.1, 0.08, 0.06], [X.wf, R - 0.02, yT, 0.13, 0.1, 0.09], [zf - 0.12, R - 0.02, yT, 0.12, 0.1, 0.09], [zf, R + 0.02, yT - 0.05, 0.09, 0.07, 0.07]];
    loftLocal(fb, secs, col); const g = fb.build(); const xc = sx * (sideX(X.wf, R + 0.2) - 0.08); paint.geometry(g, new THREE.Matrix4().makeTranslation(xc, 0, 0));
    const rb = new MeshBuilder(); const zr0 = X.wr + R + 0.3, zr1 = X.wr - R - 0.25; loftLocal(rb, [[zr1, sill + 0.02, R + 0.15, 0.08, 0.06, 0.05], [X.wr - 0.2, R - 0.05, R + 0.42, 0.11, 0.09, 0.08], [X.wr + 0.2, R - 0.05, R + 0.42, 0.11, 0.09, 0.08], [zr0, sill + 0.05, R + 0.2, 0.06, 0.05, 0.04]], col); paint.geometry(rb.build(), new THREE.Matrix4().makeTranslation(sx * (sideX(X.wr, R + 0.2) - 0.07), 0, 0));
    const hz = zf + 0.005, hy2 = yT - 0.1; part3(mb.get('vlight'), G.disc, [xc, hy2, hz], [0, 0, 0], [0.075, 0.075, 0.04]); part3(ch, G.ring, [xc, hy2, hz + 0.01], [0, 0, 0], [0.08, 0.08, 0.15], chrome); part3(mb.get('vind'), G.disc, [xc * 0.72, hy2 - 0.14, hz - 0.02], [0, 0, 0], [0.03, 0.03, 0.03]);
  }
  if (S.splitScreen) { const a = gh[0], b = gh[2]; beam3(rub, [0, a[2] - 0.01, a[0] - 0.01], [0, b[2] - 0.01, b[0] + 0.01], 0.03, 0.03, col); }
  // roof-edge alpine lights (small glass panes in the roof sides)
  if (S.alpine) for (const sx of [-1, 1]) for (const z of [roofR[0] + 0.5, roofR[0] + 1.0]) part3(glass, G.box, [sx * (gw1 - 0.1), roofR[2] + 0.028, z], [0, 0, sx * 0.25], [0.18, 0.012, 0.4], hex('#ffffff'));
  // pickup: open load bed (+ drop sides / sports bar)
  if (D.bed) bed(X, K);
}
// small symmetric loft (same ring as VehicleModels.loft) for wings
function loftLocal(b, secs, col) {
  const ring = ([z, y0, y1, w0, w1, r]) => { const h = y1 - y0, rr = Math.min(r, h * 0.45); return [[-w0 + rr * 0.3, y0], [w0 - rr * 0.3, y0], [w0, y0 + rr], [w0 + (w1 - w0) * 0.55, y0 + h * 0.55], [w1, y1 - rr], [w1 - rr, y1], [-w1 + rr, y1], [-w1, y1 - rr], [-(w0 + (w1 - w0) * 0.55), y0 + h * 0.55], [-w0, y0 + rr]].map(([x, y]) => [x, y, z]); };
  const R = secs.map(ring); const n = R[0].length;
  for (let i = 0; i < R.length - 1; i++) for (let k = 0; k < n; k++) { const a = R[i][k], c = R[i][(k + 1) % n], d = R[i + 1][(k + 1) % n], e = R[i + 1][k]; b.quad(a, c, d, e, [0, 0, 1, 1], col); }
  const cap = (r, front) => { const ctr = r.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n, s[2] + p[2] / n], [0, 0, 0]); for (let k = 0; k < n; k++) { const a = r[k], c = r[(k + 1) % n]; if (front) b.quad(ctr, a, c, ctr, [0, 0, 1, 1], col); else b.quad(ctr, c, a, ctr, [0, 0, 1, 1], col); } };
  cap(R[0], false); cap(R[R.length - 1], true);
}
function bed(X, K) {
  const { mb, D, W, S, variant, col } = X; const { paint, rub, ch, black, dark } = K; const I = mb.get('interior'); const B = D.bed; const liner = variant % 2 ? hex('#1a1a1c') : col.map((c) => c * 0.8);
  const xi = W - 0.075, zm = (B.z0 + B.z1) / 2, L = B.z0 - B.z1, h = B.rail - B.floor - 0.012;
  rub.box(0, B.floor, zm, xi * 2, 0.024, L, { col: liner === col ? dark : liner, bottom: true });
  for (let z = B.z1 + 0.12; z < B.z0 - 0.05; z += 0.16) rub.box(0, B.floor + 0.016, z, xi * 2 - 0.1, 0.008, 0.035, { col: hex('#141416') }); // ribbed floor
  const wall = (b, a, c, d, e, cc) => { b.quad(a, c, d, e, [0, 0, 1, 1], cc); b.quad(a, e, d, c, [0, 0, 1, 1], cc); };
  for (const sx of [-1, 1]) { const x = sx * xi; wall(rub, [x, B.floor, B.z1], [x, B.floor, B.z0], [x, B.rail - 0.01, B.z0], [x, B.rail - 0.01, B.z1], liner); paint.box(sx * (W - 0.055), B.rail - 0.004, zm, 0.075, 0.022, L + 0.04, { col }); }
  wall(rub, [-xi, B.floor, B.z0], [xi, B.floor, B.z0], [xi, B.rail - 0.01, B.z0], [-xi, B.rail - 0.01, B.z0], liner); // bulkhead behind the cab
  wall(rub, [xi, B.floor, B.z1], [-xi, B.floor, B.z1], [-xi, B.rail - 0.01, B.z1], [xi, B.rail - 0.01, B.z1], liner); // tailgate inner skin
  paint.box(0, B.rail - 0.004, B.z1 + 0.02, xi * 2, 0.022, 0.06, { col }); paint.box(0, B.rail - 0.004, B.z0 - 0.02, xi * 2, 0.022, 0.06, { col });
  for (const sx of [-1, 1]) { rub.box(sx * (xi - 0.03), B.rail - 0.06, B.z1 + 0.05, 0.03, 0.05, 0.03, { col: black }); rub.box(sx * (xi - 0.03), B.rail - 0.06, B.z0 - 0.06, 0.03, 0.05, 0.03, { col: black }); } // tie-down hooks
  const gL = X.gh[X.gh.length - 1]; I.box(0, (X.floorY + gL[1]) / 2, gL[0] + 0.035, X.gw0 * 2 - 0.1, gL[1] - X.floorY, 0.03, { col: hex('#2c2c2e') }); // cab rear wall seen from inside
  if (S.dropSides) for (const sx of [-1, 1]) { for (const z of [B.z1 + 0.3, zm, B.z0 - 0.3]) rub.box(sx * (W + 0.004), B.rail - 0.08, z, 0.012, 0.06, 0.08, { col: black }); rub.box(sx * (W + 0.004), B.floor + 0.02, zm, 0.012, 0.02, L - 0.1, { col: black }); }
  if (S.sportsBar === 'v' ? variant % 2 === 1 : !!S.sportsBar) { const z = B.z0 - 0.18, yT = gL[2] - 0.04; for (const sx of [-1, 1]) beam3(ch, [sx * (xi - 0.05), B.rail, z - 0.25], [sx * (xi - 0.12), yT, z], 0.05, 0.05, hex('#1f2023'), G.cyl); beam3(ch, [-(xi - 0.12), yT, z], [xi - 0.12, yT, z], 0.05, 0.05, hex('#1f2023'), G.cyl); }
}
