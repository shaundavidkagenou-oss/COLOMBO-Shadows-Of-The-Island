// Roadside filling stations (sites: Layout.FUEL_SITES). Modelled on Colombo forecourts: a deep flat canopy with a white
// fascia and a coloured brand stripe, thick round white columns on narrow raised islands with yellow/black crash guards,
// tall double-sided dispensers (three nozzles a side, LCD amount / litres / price read-outs, keypad), a monolith price
// pylon at the entrance, a mini-mart + office + toilets block with a covered walkway, an open service / wash bay, air &
// nitrogen pedestal, underground-tank fill points and vent pipes, sand buckets, extinguishers and trilingual safety
// signs. Brands and logos are fictional. Built once at load (World.build); no browser-only imports (Node tests build it).
// Station frame: u along the road (near-lane direction of travel), w into the lot from the property line. The group's
// local axes are x = u, z = −w (a proper rotation of the world for both road sides).
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import * as L from './Layout.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const S = L.FUEL_SLAB;
export const FS = {
  islands: [7.6, 13.4], isHalfLen: 4.4, isHalfWid: 0.65, isH: 0.2,
  disp: [-2.4, 2.4], dispW: 0.95, dispD: 0.52, cols: [-3.75, 3.75], colR: 0.24,
  canopy: { u0: -9, u1: 9, w0: 3.4, w1: 17.6, y0: S + 4.85, y1: S + 6.1 },
  lanes: { A: 4.9, B: 10.5, C: 16.1 },
  shop: { u0: -20.5, u1: 5.5, w0: 21.5, w1: 29.4, h: 3.9 },
  shed: { u0: 8.5, u1: 21.6, w0: 21.5, w1: 29.4 },
  planter: { u0: -16.4, u1: 16.4, w0: 0.1, w1: 1.5 },
  pylon: { u: -13.2, w: 1.05 },
  air: { u: 10.5, w: 19.7 },
};
export const YI = S + FS.isH; // island top
// grades sold (Rs per litre, fuel price revision effective 2 Nov 2026) and the colour coding of the nozzle boots
export const GRADES = {
  p92: { en: 'PETROL 92', oct: '92 OCTANE', si: 'පෙට්‍රල් 92', ta: 'பெட்ரோல் 92', price: 424, col: '#1f9a4a' },
  p95: { en: 'PETROL 95', oct: '95 OCTANE', si: 'පෙට්‍රල් 95', ta: 'பெட்ரோல் 95', price: 475, col: '#2a5fc8' },
  ad: { en: 'AUTO DIESEL', oct: '', si: 'ඩීසල්', ta: 'டீசல்', price: 397, col: '#202020' },
  sd: { en: 'SUPER DIESEL', oct: '', si: 'සුපර් ඩීසල්', ta: 'சூப்பர் டீசல்', price: 543, col: '#e0b400' },
  ke: { en: 'KEROSENE', oct: '', si: 'භූමිතෙල්', ta: 'மண்ணெண்ணெய்', price: 285, col: '#c8541a' },
};
export const ISLAND_GRADES = [['p92', 'p95', 'ad'], ['p92', 'ad', 'sd']];
const DEALERS = { ratna: 'M/s. Perera & Sons', samudra: 'M/s. Fernando Brothers', araliya: 'M/s. Jayasinghe Enterprises', nila: 'M/s. Rahman & Co.' };

// ---------------------------------------------------------------- nozzle (local: +z spout forward, +y up, origin = grip)
export const SPOUT_TIP = new THREE.Vector3(0, -0.06, 0.258), HOSE_PT = new THREE.Vector3(0, -0.006, -0.17);
let _hoseGeo = null; const _nozzleGeo = new Map();
// guard === undefined: steel body only (instanced; the grade-coloured guard is a separate instanced mesh so the instance
// colour never tints the steel); guard === null: the guard alone (white, tinted per instance); guard = '#rrggbb': complete
// nozzle with a coloured guard (the live nozzle in an attendant's hand)
export function nozzleGeometry(guard) {
  const key = guard === undefined ? 'body' : guard === null ? 'guard' : guard; if (_nozzleGeo.has(key)) return _nozzleGeo.get(key);
  const mb = new MultiBuilder(); const m = mb.get('x'); const steel = C('#b9bcbf'), dark = C('#26282a');
  if (guard !== undefined) m.box(0, 0.024, 0.045, 0.056, 0.036, 0.095, { col: guard === null ? [1, 1, 1] : C(guard), bottom: true }); // rubber scuff guard
  if (guard === null) { const gg = m.build(); _nozzleGeo.set(key, gg); return gg; }
  m.box(0, 0.0, -0.005, 0.048, 0.058, 0.19, { col: steel, bottom: true }); // cast body
  m.box(0, -0.043, 0.0, 0.012, 0.012, 0.13, { col: dark, bottom: true }); // lever
  m.box(0, -0.075, -0.0, 0.01, 0.008, 0.15, { col: steel, bottom: true }); // guard bar
  m.box(0, -0.052, 0.072, 0.01, 0.05, 0.008, { col: steel }); m.box(0, -0.052, -0.072, 0.01, 0.05, 0.008, { col: steel });
  const sp = new THREE.CylinderGeometry(0.0105, 0.0115, 0.18, 10, 1, false); sp.rotateX(Math.PI / 2); sp.translate(0, 0, 0.09); sp.rotateX(0.38); sp.translate(0, 0.004, 0.09);
  m.geometry(sp, new THREE.Matrix4(), steel);
  const sw = new THREE.CylinderGeometry(0.019, 0.019, 0.07, 12); sw.rotateX(Math.PI / 2); m.geometry(sw, new THREE.Matrix4().makeTranslation(0, -0.006, -0.13), dark);
  const ring = new THREE.TorusGeometry(0.016, 0.004, 6, 12); m.geometry(ring, new THREE.Matrix4().makeTranslation(0, -0.006, -0.098), steel);
  const g = m.build(); _nozzleGeo.set(key, g); return g;
}
// tube with a fixed vertex layout whose centre line can be rewritten every frame (the live hose)
export class HoseTube {
  constructor(n = 28, r = 0.019, seg = 7) {
    this.n = n; this.r = r; this.seg = seg; const g = new THREE.BufferGeometry(); const nv = n * (seg + 1);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    const idx = []; for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    g.setIndex(idx); this.geo = g; this.pts = Array.from({ length: n }, () => new THREE.Vector3());
  }
  update() { // parallel-transported ring frames along this.pts
    const P = this.pts, n = this.n, seg = this.seg, pos = this.geo.attributes.position.array, nor = this.geo.attributes.normal.array;
    const t = new THREE.Vector3(), nrm = new THREE.Vector3(1, 0, 0), b = new THREE.Vector3(), tp = new THREE.Vector3(); let k = 0;
    for (let i = 0; i < n; i++) {
      t.subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize(); if (!isFinite(t.x) || t.lengthSq() < 0.5) t.set(0, -1, 0);
      if (i === 0) { nrm.set(0, 1, 0); if (Math.abs(t.y) > 0.9) nrm.set(1, 0, 0); nrm.addScaledVector(t, -nrm.dot(t)).normalize(); }
      else { nrm.addScaledVector(t, -nrm.dot(t)); if (nrm.lengthSq() < 1e-6) nrm.set(t.y, -t.x, 0); nrm.normalize(); }
      b.crossVectors(t, nrm);
      for (let j = 0; j <= seg; j++) { const a = (j / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); tp.copy(nrm).multiplyScalar(c).addScaledVector(b, s);
        pos[k] = P[i].x + tp.x * this.r; pos[k + 1] = P[i].y + tp.y * this.r; pos[k + 2] = P[i].z + tp.z * this.r; nor[k] = tp.x; nor[k + 1] = tp.y; nor[k + 2] = tp.z; k += 3; }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; this.geo.computeBoundingSphere();
  }
}
// holster: the nozzle hangs in its boot, spout pointing down into the dispenser face (face frame: x along, y up from the
// island top, z out of the face)
const HOLSTER_TILT = 0.36;
export const HOLSTER = (() => {
  const f = new THREE.Vector3(0, -Math.sin(HOLSTER_TILT), -Math.cos(HOLSTER_TILT)), up = new THREE.Vector3(0, Math.cos(HOLSTER_TILT), -Math.sin(HOLSTER_TILT)); const x = new THREE.Vector3().crossVectors(up, f);
  const R = new THREE.Matrix4().makeBasis(x, up, f); const q = new THREE.Quaternion().setFromRotationMatrix(R); return { q };
})();
export const BOOT_X = [-0.3, 0, 0.3], BOOT_Y = 1.0, BOOT_Z = 0.035, OUTLET_Y = 1.22;
export function holsterLocal(bx) { // nozzle matrix in the face frame
  const p = new THREE.Vector3(bx, BOOT_Y, BOOT_Z).sub(SPOUT_TIP.clone().applyQuaternion(HOLSTER.q)); return new THREE.Matrix4().compose(p, HOLSTER.q, new THREE.Vector3(1, 1, 1));
}
let _nozzleMat = null;
export function nozzleMaterial() { return _nozzleMat || (_nozzleMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.38 })); }
function hoseGeometry() { // the static hanging loop (face frame, boot at x = 0)
  if (_hoseGeo) return _hoseGeo; const H = new THREE.Vector3().copy(HOSE_PT).applyMatrix4(holsterLocal(0));
  const pts = [new THREE.Vector3(0, OUTLET_Y, 0.0), new THREE.Vector3(0, OUTLET_Y - 0.08, 0.03), new THREE.Vector3(0, 0.72, 0.13), new THREE.Vector3(0, 0.34, 0.27), new THREE.Vector3(0, 0.3, 0.42), new THREE.Vector3(0, 0.5, H.z + 0.07), new THREE.Vector3(0, H.y - 0.12, H.z + 0.04), H];
  _hoseGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 40, 0.019, 7, false); return _hoseGeo;
}

// ---------------------------------------------------------------- textures
const AT = 1024; // brand atlas size; regions in px [x, y, w, h]
export const R = {
  fascia: [0, 0, 1024, 160], fasciaSide: [0, 160, 320, 160], shop: [0, 320, 576, 96], shed: [0, 416, 576, 96], dispHead: [0, 512, 288, 96],
  label0: [288, 512, 288, 48], label1: [288, 560, 288, 48], keypad: [0, 608, 96, 128], fire: [96, 608, 96, 48], isBoard: [192, 608, 192, 256], air: [384, 608, 192, 96],
  office: [384, 704, 192, 64], toilet: [384, 768, 192, 64], dealer: [384, 832, 192, 96], inSign: [0, 736, 192, 96], outSign: [0, 832, 192, 96], kero: [96, 656, 96, 80],
  pylon: [576, 160, 256, 640], noPhone: [832, 160, 192, 192], engine: [832, 352, 192, 192], noSmoke: [832, 544, 192, 192],
  tank: [576, 800, 256, 64], lube: [576, 864, 256, 64], shelf: [832, 736, 192, 288], atm: [0, 928, 192, 96], hours: [192, 928, 192, 96], clock: [384, 928, 96, 96],
};
const uvOf = (r, W = AT, H = AT) => [r[0] / W, 1 - (r[1] + r[3]) / H, (r[0] + r[2]) / W, 1 - r[1] / H];
const SI = '"Noto Sans Sinhala", sans-serif', TA = '"Noto Sans Tamil", sans-serif', BC = '"Barlow Condensed", "Arial Narrow", sans-serif', MN = '"Manrope", Arial, sans-serif';
function fitText(a, txt, x, y, maxW, font, size) { a.font = `${font.replace('$', size)}`; let w = a.measureText(txt).width; if (w > maxW) { a.save(); a.translate(x, y); a.scale(maxW / w, 1); a.fillText(txt, 0, 0); a.restore(); } else a.fillText(txt, x, y); }
export function drawLogo(a, kind, cx, cy, r, B) { // original geometric marks
  a.save(); a.translate(cx, cy);
  if (kind === 'gem') { // faceted gem in a ring
    a.fillStyle = B.main; a.beginPath(); a.arc(0, 0, r, 0, Math.PI * 2); a.fill(); a.fillStyle = '#fff'; a.beginPath(); a.arc(0, 0, r * 0.84, 0, Math.PI * 2); a.fill();
    const t = r * 0.62; const P = [[-t, -t * 0.28], [-t * 0.5, -t * 0.72], [t * 0.5, -t * 0.72], [t, -t * 0.28], [0, t * 0.92]];
    a.fillStyle = B.main; a.beginPath(); P.forEach(([x, y], i) => (i ? a.lineTo(x, y) : a.moveTo(x, y))); a.closePath(); a.fill();
    a.strokeStyle = '#fff'; a.lineWidth = Math.max(1.5, r * 0.06); a.beginPath(); a.moveTo(-t, -t * 0.28); a.lineTo(t, -t * 0.28); a.moveTo(-t * 0.5, -t * 0.72); a.lineTo(-t * 0.22, -t * 0.28); a.lineTo(0, t * 0.92); a.lineTo(t * 0.22, -t * 0.28); a.lineTo(t * 0.5, -t * 0.72); a.moveTo(-t * 0.22, -t * 0.28); a.lineTo(0, -t * 0.72); a.lineTo(t * 0.22, -t * 0.28); a.stroke();
  } else if (kind === 'wave') { // sea wave in a circle
    a.fillStyle = B.main; a.beginPath(); a.arc(0, 0, r, 0, Math.PI * 2); a.fill(); a.save(); a.beginPath(); a.arc(0, 0, r * 0.86, 0, Math.PI * 2); a.clip(); a.fillStyle = '#fff'; a.fillRect(-r, -r, r * 2, r * 2);
    a.fillStyle = B.accent; a.beginPath(); a.arc(0, -r * 0.28, r * 0.3, 0, Math.PI * 2); a.fill();
    for (const [dy, col] of [[0.12, B.main], [0.45, B.dark]]) { a.fillStyle = col; a.beginPath(); a.moveTo(-r, r); a.lineTo(-r, r * dy); for (let x = -r; x <= r; x += r / 12) a.lineTo(x, r * dy - Math.sin((x / r) * Math.PI * 1.6 + dy * 4) * r * 0.12); a.lineTo(r, r); a.closePath(); a.fill(); }
    a.restore();
  } else if (kind === 'flower') { // five-petal frangipani (araliya)
    a.fillStyle = B.main; a.beginPath(); a.arc(0, 0, r, 0, Math.PI * 2); a.fill();
    for (let k = 0; k < 5; k++) { a.save(); a.rotate((k / 5) * Math.PI * 2 + 0.3); a.fillStyle = '#fff'; a.beginPath(); a.ellipse(r * 0.08, -r * 0.42, r * 0.26, r * 0.44, 0.45, 0, Math.PI * 2); a.fill(); a.restore(); }
    const g = a.createRadialGradient(0, 0, 0, 0, 0, r * 0.38); g.addColorStop(0, B.accent); g.addColorStop(1, 'rgba(255,255,255,0)'); a.fillStyle = g; a.beginPath(); a.arc(0, 0, r * 0.38, 0, Math.PI * 2); a.fill();
  } else { // fuel drop in a ring
    a.fillStyle = B.main; a.beginPath(); a.arc(0, 0, r, 0, Math.PI * 2); a.fill(); a.fillStyle = '#fff'; a.beginPath(); a.arc(0, 0, r * 0.84, 0, Math.PI * 2); a.fill();
    a.fillStyle = B.main; a.beginPath(); a.moveTo(0, -r * 0.66); a.bezierCurveTo(r * 0.18, -r * 0.36, r * 0.48, -r * 0.02, r * 0.46, r * 0.22); a.arc(0, r * 0.2, r * 0.46, 0.05, Math.PI - 0.05); a.bezierCurveTo(-r * 0.48, -r * 0.02, -r * 0.18, -r * 0.36, 0, -r * 0.66); a.fill();
    a.fillStyle = B.accent; a.beginPath(); a.ellipse(-r * 0.16, r * 0.22, r * 0.09, r * 0.17, 0.4, 0, Math.PI * 2); a.fill();
  }
  a.restore();
}
function canvas(w, h) { if (typeof document === 'undefined') return null; const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const a = cv.getContext && cv.getContext('2d'); if (!a || !a.fillText) return null; return { cv, a }; }
function ledDigits(a, txt, x, y, w, h, col) { // seven-segment style price digits
  a.save(); a.fillStyle = '#0b0b0c'; a.fillRect(x, y, w, h); a.fillStyle = col; a.shadowColor = col; a.shadowBlur = h * 0.12; a.textAlign = 'right'; a.textBaseline = 'middle';
  a.font = `700 ${Math.round(h * 0.86)}px ${BC}`; a.fillText(txt, x + w - h * 0.12, y + h * 0.54); a.restore();
}
function sign(a, r, draw) { a.save(); a.translate(r[0], r[1]); a.beginPath(); a.rect(0, 0, r[2], r[3]); a.clip(); draw(r[2], r[3]); a.restore(); }
function prohibition(a, W, H, glyph, lines) { // white plate, red ring + bar, three languages
  a.fillStyle = '#f7f6f2'; a.fillRect(0, 0, W, H); a.strokeStyle = '#1b1b1b'; a.lineWidth = 3; a.strokeRect(4, 4, W - 8, H - 8);
  const cx = W / 2, cy = H * 0.34, r = H * 0.22; glyph(cx, cy, r); a.strokeStyle = '#d0121b'; a.lineWidth = r * 0.2; a.beginPath(); a.arc(cx, cy, r, 0, Math.PI * 2); a.stroke(); a.beginPath(); a.moveTo(cx - r * 0.7, cy - r * 0.7); a.lineTo(cx + r * 0.7, cy + r * 0.7); a.stroke();
  a.fillStyle = '#141414'; a.textAlign = 'center'; a.textBaseline = 'alphabetic';
  fitText(a, lines[0], cx, H * 0.7, W - 16, `600 $px ${SI}`, Math.round(H * 0.085)); fitText(a, lines[1], cx, H * 0.81, W - 16, `600 $px ${TA}`, Math.round(H * 0.07)); fitText(a, lines[2], cx, H * 0.93, W - 16, `700 $px ${BC}`, Math.round(H * 0.095));
}
export function brandAtlas(site) {
  const B = L.FUEL_BRANDS[site.brand]; const c = canvas(AT, AT); if (!c) return null; const a = c.a;
  a.fillStyle = '#f4f4f0'; a.fillRect(0, 0, AT, AT);
  // fascia (long sides): white, brand stripe along the bottom, logo + name
  sign(a, R.fascia, (W, H) => { a.fillStyle = '#fbfbf8'; a.fillRect(0, 0, W, H); a.fillStyle = B.main; a.fillRect(0, H - 34, W, 34); a.fillStyle = B.accent; a.fillRect(0, H - 40, W, 6); a.fillStyle = B.main; a.fillRect(0, 0, W, 6);
    drawLogo(a, B.logo, 92, (H - 40) / 2 + 3, 50, B); a.fillStyle = B.dark; a.textBaseline = 'middle'; a.textAlign = 'left'; fitText(a, B.name, 162, (H - 40) / 2 + 6, 600, `700 $px ${BC}`, 84);
    a.fillStyle = B.main; a.textAlign = 'right'; fitText(a, B.si, W - 30, (H - 40) / 2 - 2, 220, `700 $px ${SI}`, 52); a.fillStyle = '#fff'; a.textAlign = 'center'; a.font = `600 20px ${MN}`; a.fillText('FILLING STATION  •  ඉන්ධන පිරවුම්හල  •  எரிபொருள் நிரப்பு நிலையம்', W / 2, H - 16); });
  sign(a, R.fasciaSide, (W, H) => { a.fillStyle = '#fbfbf8'; a.fillRect(0, 0, W, H); a.fillStyle = B.main; a.fillRect(0, H - 34, W, 34); a.fillStyle = B.accent; a.fillRect(0, H - 40, W, 6); drawLogo(a, B.logo, W / 2, (H - 40) / 2 + 2, 52, B); });
  // pylon face: brand panel, four price rows (LED), trilingual footer
  sign(a, R.pylon, (W, H) => { a.fillStyle = B.main; a.fillRect(0, 0, W, H); a.fillStyle = '#fbfbf8'; a.fillRect(10, 10, W - 20, 206); drawLogo(a, B.logo, W / 2, 86, 62, B); a.fillStyle = B.dark; a.textAlign = 'center'; a.textBaseline = 'middle'; fitText(a, B.name, W / 2, 178, W - 36, `700 $px ${BC}`, 40);
    a.fillStyle = B.accent; a.fillRect(10, 216, W - 20, 6);
    const rows = ['p92', 'p95', 'ad', 'sd']; rows.forEach((k, i) => { const y = 236 + i * 84, G = GRADES[k]; a.fillStyle = '#111316'; a.fillRect(10, y, W - 20, 76); a.fillStyle = G.col === '#202020' ? '#5a5f66' : G.col; a.fillRect(10, y, 10, 76);
      a.fillStyle = '#f2f2ee'; a.textAlign = 'left'; a.textBaseline = 'alphabetic'; fitText(a, G.en, 28, y + 26, 112, `700 $px ${BC}`, 24); fitText(a, G.si, 28, y + 50, 112, `600 $px ${SI}`, 18); fitText(a, G.ta, 28, y + 69, 112, `600 $px ${TA}`, 13);
      ledDigits(a, G.price.toFixed(2), 142, y + 12, 98, 52, k === 'sd' || k === 'p95' ? '#ffb224' : '#ff3b2e'); });
    a.fillStyle = '#fbfbf8'; a.fillRect(10, 576, W - 20, 54); a.fillStyle = '#1b1b1b'; a.textAlign = 'center'; a.textBaseline = 'alphabetic'; fitText(a, 'ඉන්ධන පිරවුම්හල', W / 2, 597, W - 30, `600 $px ${SI}`, 19); fitText(a, 'எரிபொருள் நிரப்பு நிலையம்', W / 2, 622, W - 30, `600 $px ${TA}`, 14); });
  sign(a, R.shop, (W, H) => { a.fillStyle = B.main; a.fillRect(0, 0, W, H); a.fillStyle = '#fbfbf8'; a.fillRect(0, 8, W, H - 24); drawLogo(a, B.logo, 50, H / 2 - 4, 30, B); a.fillStyle = B.dark; a.textAlign = 'left'; a.textBaseline = 'middle'; fitText(a, 'MINI MART', 94, H / 2 - 2, 250, `700 $px ${BC}`, 54);
    a.fillStyle = '#333'; fitText(a, 'Snacks  •  Drinks  •  Lubricants  •  Phone reload', 330, H / 2 - 2, 236, `600 $px ${MN}`, 15); });
  sign(a, R.shed, (W, H) => { a.fillStyle = '#f2c230'; a.fillRect(0, 0, W, H); a.fillStyle = '#1a1a1a'; a.fillRect(0, H - 10, W, 10); a.textAlign = 'center'; a.textBaseline = 'middle'; fitText(a, 'SERVICE CENTRE  •  WASH & LUBE', W / 2, 34, W - 30, `700 $px ${BC}`, 44); fitText(a, 'සේවා මධ්‍යස්ථානය  •  වාහන සේදීම', W / 2, 70, W - 30, `600 $px ${SI}`, 22); });
  sign(a, R.dispHead, (W, H) => { a.fillStyle = B.main; a.fillRect(0, 0, W, H); a.fillStyle = B.accent; a.fillRect(0, H - 8, W, 8); drawLogo(a, B.logo, 46, H / 2 - 3, 32, B); a.fillStyle = '#fff'; a.textAlign = 'left'; a.textBaseline = 'middle'; fitText(a, B.short, 88, H / 2 - 2, 186, `700 $px ${BC}`, 50); });
  for (const [r, list] of [[R.label0, ISLAND_GRADES[0]], [R.label1, ISLAND_GRADES[1]]]) sign(a, r, (W, H) => { const cw = W / 3; list.forEach((k, i) => { const G = GRADES[k]; a.fillStyle = G.col; a.fillRect(i * cw + 2, 2, cw - 4, H - 4); a.fillStyle = k === 'sd' ? '#111' : '#fff'; a.textAlign = 'center'; a.textBaseline = 'middle'; fitText(a, G.en, i * cw + cw / 2, H * 0.36, cw - 10, `700 $px ${BC}`, 19); fitText(a, G.si, i * cw + cw / 2, H * 0.76, cw - 10, `600 $px ${SI}`, 13); }); });
  sign(a, R.keypad, (W, H) => { a.fillStyle = '#2a2d31'; a.fillRect(0, 0, W, H); const k = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Rs', '0', 'L']; k.forEach((t, i) => { const x = 8 + (i % 3) * 28, y = 8 + Math.floor(i / 3) * 29; a.fillStyle = '#c9ccd0'; a.fillRect(x, y, 24, 24); a.fillStyle = '#16181a'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.font = `700 ${t.length > 1 ? 12 : 16}px ${BC}`; a.fillText(t, x + 12, y + 13); }); });
  sign(a, R.fire, (W, H) => { a.fillStyle = '#c8141b'; a.fillRect(0, 0, W, H); a.fillStyle = '#fff'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.font = `700 34px ${BC}`; a.fillText('FIRE', W / 2, H / 2 + 2); });
  sign(a, R.kero, (W, H) => { a.fillStyle = GRADES.ke.col; a.fillRect(0, 0, W, H); a.fillStyle = '#fff'; a.textAlign = 'center'; a.textBaseline = 'middle'; fitText(a, 'KEROSENE', W / 2, 20, W - 8, `700 $px ${BC}`, 22); fitText(a, 'භූමිතෙල්', W / 2, 44, W - 8, `600 $px ${SI}`, 15); fitText(a, 'மண்ணெண்ணெய்', W / 2, 64, W - 8, `600 $px ${TA}`, 11); });
  sign(a, R.isBoard, (W, H) => { a.fillStyle = '#fbfbf8'; a.fillRect(0, 0, W, H); a.fillStyle = B.main; a.fillRect(0, 0, W, 46); drawLogo(a, B.logo, 30, 23, 17, B); a.fillStyle = '#fff'; a.textAlign = 'left'; a.textBaseline = 'middle'; fitText(a, 'TODAY\'S PRICES', 54, 24, W - 62, `700 $px ${BC}`, 26);
    ['p92', 'p95', 'ad', 'sd', 'ke'].forEach((k, i) => { const G = GRADES[k], y = 56 + i * 38; a.fillStyle = G.col; a.fillRect(8, y, 8, 30); a.fillStyle = '#151515'; a.textAlign = 'left'; fitText(a, G.en, 22, y + 15, 92, `700 $px ${BC}`, 21); a.textAlign = 'right'; fitText(a, 'Rs ' + G.price.toFixed(2), W - 8, y + 15, 72, `700 $px ${BC}`, 21); });
    a.fillStyle = '#555'; a.textAlign = 'center'; a.font = `600 11px ${MN}`; a.fillText('Price per litre, revised 02.11.2026', W / 2, H - 10); });
  sign(a, R.air, (W, H) => { a.fillStyle = '#1f6fbf'; a.fillRect(0, 0, W / 2, H); a.fillStyle = '#1d8a4a'; a.fillRect(W / 2, 0, W / 2, H); a.fillStyle = '#fff'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.font = `700 40px ${BC}`; a.fillText('AIR', W / 4, H * 0.42); a.fillText('N₂', W * 0.75, H * 0.42); a.font = `600 13px ${MN}`; a.fillText('FREE', W / 4, H * 0.8); a.fillText('NITROGEN', W * 0.75, H * 0.8); });
  sign(a, R.office, (W, H) => { a.fillStyle = '#1e2124'; a.fillRect(0, 0, W, H); a.fillStyle = '#f2f2ee'; a.textAlign = 'center'; a.textBaseline = 'middle'; fitText(a, 'OFFICE', W / 2, 22, W - 16, `700 $px ${BC}`, 30); fitText(a, 'කාර්යාලය  •  அலுவலகம்', W / 2, 48, W - 16, `600 $px ${SI}`, 15); });
  sign(a, R.toilet, (W, H) => { a.fillStyle = '#1f5f9a'; a.fillRect(0, 0, W, H); a.fillStyle = '#fff'; a.textAlign = 'center'; a.textBaseline = 'middle'; fitText(a, 'TOILETS', W / 2, 22, W - 16, `700 $px ${BC}`, 30); fitText(a, 'වැසිකිළි  •  கழிப்பறை', W / 2, 48, W - 16, `600 $px ${SI}`, 15); });
  sign(a, R.dealer, (W, H) => { a.fillStyle = '#f7f6f2'; a.fillRect(0, 0, W, H); a.strokeStyle = B.main; a.lineWidth = 4; a.strokeRect(3, 3, W - 6, H - 6); a.fillStyle = '#222'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.font = `600 12px ${MN}`; a.fillText('AUTHORISED DEALER', W / 2, 20); fitText(a, DEALERS[site.brand], W / 2, 46, W - 16, `700 $px ${BC}`, 24); a.font = `600 11px ${MN}`; a.fillText(`Dealer No. ${site.brand.slice(0, 2).toUpperCase()}/${(site.zc * 7 + 4000 | 0) % 9000 + 1000}  •  ${site.area}`, W / 2, 72); });
  for (const [r, en, si, flip] of [[R.inSign, 'IN', 'ඇතුල්වීම', false], [R.outSign, 'OUT', 'පිටවීම', true]]) sign(a, r, (W, H) => { a.fillStyle = flip ? '#b3121b' : '#1d7a3a'; a.fillRect(0, 0, W, H); a.fillStyle = '#fff'; a.textAlign = 'left'; a.textBaseline = 'middle'; a.font = `700 44px ${BC}`; a.fillText(en, 14, 34); fitText(a, si, 14, 74, 110, `600 $px ${SI}`, 20);
    a.save(); a.translate(W - 44, H / 2); a.beginPath(); a.moveTo(-26, -8); a.lineTo(4, -8); a.lineTo(4, -22); a.lineTo(30, 0); a.lineTo(4, 22); a.lineTo(4, 8); a.lineTo(-26, 8); a.closePath(); a.fill(); a.restore(); });
  sign(a, R.noSmoke, (W, H) => prohibition(a, W, H, (cx, cy, r) => { a.fillStyle = '#1b1b1b'; a.fillRect(cx - r * 0.6, cy - r * 0.08, r * 1.0, r * 0.18); a.fillStyle = '#e06a1a'; a.fillRect(cx + r * 0.4, cy - r * 0.08, r * 0.18, r * 0.18); a.strokeStyle = '#777'; a.lineWidth = 2; a.beginPath(); a.moveTo(cx + r * 0.5, cy - r * 0.14); a.quadraticCurveTo(cx + r * 0.3, cy - r * 0.4, cx + r * 0.5, cy - r * 0.6); a.stroke(); }, ['දුම් පානය තහනම්', 'புகைபிடித்தல் தடைசெய்யப்பட்டுள்ளது', 'NO SMOKING']));
  sign(a, R.noPhone, (W, H) => prohibition(a, W, H, (cx, cy, r) => { a.fillStyle = '#1b1b1b'; a.fillRect(cx - r * 0.24, cy - r * 0.48, r * 0.48, r * 0.96); a.fillStyle = '#9ab'; a.fillRect(cx - r * 0.18, cy - r * 0.38, r * 0.36, r * 0.62); }, ['ජංගම දුරකථන භාවිතය තහනම්', 'கைத்தொலைபேசி பாவனை தடை', 'NO MOBILE PHONES']));
  sign(a, R.engine, (W, H) => { a.fillStyle = '#f7f6f2'; a.fillRect(0, 0, W, H); a.strokeStyle = '#1b1b1b'; a.lineWidth = 3; a.strokeRect(4, 4, W - 8, H - 8); const cx = W / 2, cy = H * 0.34, r = H * 0.22; a.fillStyle = '#1d4fa0'; a.beginPath(); a.arc(cx, cy, r, 0, Math.PI * 2); a.fill();
    a.strokeStyle = '#fff'; a.lineWidth = r * 0.16; a.beginPath(); a.arc(cx, cy + r * 0.05, r * 0.52, -Math.PI * 0.32, Math.PI * 1.32); a.stroke(); a.beginPath(); a.moveTo(cx, cy - r * 0.62); a.lineTo(cx, cy - r * 0.05); a.stroke();
    a.fillStyle = '#141414'; a.textAlign = 'center'; fitText(a, 'එන්ජිම නිවා දමන්න', cx, H * 0.7, W - 16, `600 $px ${SI}`, Math.round(H * 0.085)); fitText(a, 'இயந்திரத்தை நிறுத்தவும்', cx, H * 0.81, W - 16, `600 $px ${TA}`, Math.round(H * 0.07)); fitText(a, 'SWITCH OFF ENGINE', cx, H * 0.93, W - 16, `700 $px ${BC}`, Math.round(H * 0.095)); });
  sign(a, R.tank, (W, H) => { ['p92', 'p95', 'ad', 'sd'].forEach((k, i) => { const G = GRADES[k]; a.fillStyle = G.col; a.fillRect(i * 64 + 2, 2, 60, H - 4); a.fillStyle = k === 'sd' ? '#111' : '#fff'; a.textAlign = 'center'; a.textBaseline = 'middle'; fitText(a, G.en.replace('PETROL ', 'P'), i * 64 + 32, H / 2, 56, `700 $px ${BC}`, 22); }); });
  sign(a, R.lube, (W, H) => { a.fillStyle = '#1b1d20'; a.fillRect(0, 0, W, H); a.fillStyle = '#f2c230'; a.textAlign = 'center'; a.textBaseline = 'middle'; fitText(a, 'LUBRICANTS & ENGINE OIL', W / 2, 24, W - 16, `700 $px ${BC}`, 26); a.fillStyle = '#ddd'; fitText(a, 'ලිහිසි තෙල්  •  20W-50  •  2T  •  ATF', W / 2, 48, W - 16, `600 $px ${SI}`, 14); });
  sign(a, R.atm, (W, H) => { a.fillStyle = '#20262c'; a.fillRect(0, 0, W, H); a.fillStyle = '#3fc1ff'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.font = `700 50px ${BC}`; a.fillText('ATM', W / 2, 40); a.fillStyle = '#ddd'; a.font = `600 13px ${MN}`; a.fillText('24 HOUR CASH', W / 2, 78); });
  sign(a, R.hours, (W, H) => { a.fillStyle = '#fbfbf8'; a.fillRect(0, 0, W, H); a.fillStyle = B.main; a.fillRect(0, 0, W, 10); a.fillStyle = '#1a1a1a'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.font = `700 28px ${BC}`; a.fillText('OPEN 24 HOURS', W / 2, 38); fitText(a, 'පැය 24 පුරා විවෘතයි', W / 2, 70, W - 16, `600 $px ${SI}`, 17); });
  sign(a, R.clock, (W, H) => { a.fillStyle = '#fbfbf8'; a.beginPath(); a.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2); a.fill(); a.strokeStyle = B.main; a.lineWidth = 5; a.stroke(); a.fillStyle = '#222'; for (let k = 0; k < 12; k++) { const t = (k / 12) * Math.PI * 2; a.fillRect(W / 2 + Math.sin(t) * 38 - 2, H / 2 - Math.cos(t) * 38 - 2, 4, 4); } drawLogo(a, B.logo, W / 2, H / 2 + 20, 9, B); });
  sign(a, R.shelf, (W, H) => { a.fillStyle = '#e9e6dd'; a.fillRect(0, 0, W, H); const cols = ['#d23a2a', '#f2b81e', '#2a7ad2', '#3aa65a', '#f27a1e', '#7a3ab2', '#e8e8e2', '#1a1a1a'];
    for (let r = 0; r < 5; r++) { const y = 18 + r * 54; a.fillStyle = '#9aa0a6'; a.fillRect(4, y + 40, W - 8, 5); for (let x = 8; x < W - 14;) { const w = 9 + ((x * 7 + r * 13) % 13), h = 18 + ((x * 3 + r * 11) % 20); a.fillStyle = cols[(x + r * 3) % cols.length]; a.fillRect(x, y + 40 - h, w, h); x += w + 2; } }
    a.fillStyle = 'rgba(255,255,255,0.18)'; a.fillRect(0, 0, W, H); });
  const tex = new THREE.CanvasTexture(c.cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; return tex;
}

// ---------------------------------------------------------------- geometry helpers (station frame → group frame x = u, z = −w)
function B(mb, u0, u1, y0, y1, w0, w1, col, o = {}) { mb.box((u0 + u1) / 2, (y0 + y1) / 2, -(w0 + w1) / 2, Math.abs(u1 - u0), Math.abs(y1 - y0), Math.abs(w1 - w0), Object.assign({ col }, o)); }
function face(mb, dir, a0, a1, y0, y1, at, uv, col) { // textured plane on a vertical face; dir = which way it faces
  let P; if (dir === '-w') P = [[a0, y0, -at], [a1, y0, -at], [a1, y1, -at], [a0, y1, -at]]; else if (dir === '+w') P = [[a1, y0, -at], [a0, y0, -at], [a0, y1, -at], [a1, y1, -at]];
  else if (dir === '-u') P = [[at, y0, -a1], [at, y0, -a0], [at, y1, -a0], [at, y1, -a1]]; else P = [[at, y0, -a0], [at, y0, -a1], [at, y1, -a1], [at, y1, -a0]];
  mb.quad(P[0], P[1], P[2], P[3], uv, col);
}
function cyl(mb, u, w, y0, h, r0, r1, seg, col, caps = true) { mb.cylinder(u, y0, -w, r0, r1, h, seg, { col, caps }); }
function tube(mb, pts, r, col, seg = 32, bands = null) {
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], -p[2])), false, 'centripetal', 0.5), seg, r, 8, false);
  if (bands) { const n = g.attributes.position.count, cols = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const t = Math.floor(i / 9) / seg; const c = Math.floor(t * bands.n) % 2 ? bands.b : bands.a; cols.set(c, i * 3); } g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); mb.geometry(g, new THREE.Matrix4(), [1, 1, 1]); }
  else mb.geometry(g, new THREE.Matrix4(), col); g.dispose();
}
function aoBlob(mb, u, w, ru, rw, k, y = S + 0.004) { // multiply-blend soft dark patch (contact shadow / oil stain)
  const base = mb.vcount, n = 18, dark = [k, k * 0.99, k * 0.97]; mb.vert(u, y, -w, 0, 1, 0, 0, 0, dark);
  for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI * 2; mb.vert(u + Math.cos(t) * ru, y, -(w + Math.sin(t) * rw), 0, 1, 0, 0, 0, [1, 1, 1]); }
  for (let i = 0; i < n; i++) mb.idx.push(base, base + 1 + i, base + 2 + i); // up-facing
}
function aoRect(mb, u0, u1, w0, w1, pad, k, y = S + 0.004) { // dark rectangle fading out over `pad`
  const dark = [k, k, k], white = [1, 1, 1]; const base = mb.vcount; const I = [[u0, w0], [u1, w0], [u1, w1], [u0, w1]], O = [[u0 - pad, w0 - pad], [u1 + pad, w0 - pad], [u1 + pad, w1 + pad], [u0 - pad, w1 + pad]];
  for (const [u, w] of I) mb.vert(u, y, -w, 0, 1, 0, 0, 0, dark); for (const [u, w] of O) mb.vert(u, y, -w, 0, 1, 0, 0, 0, white);
  mb.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; mb.idx.push(base + i, base + 4 + i, base + 4 + j, base + i, base + 4 + j, base + j); } // up-facing
}

// ---------------------------------------------------------------- the station
export function buildFuelStation(site) {
  const Bd = L.FUEL_BRANDS[site.brand]; const main = C(Bd.main), dark = C(Bd.dark), accent = C(Bd.accent);
  const g = new THREE.Group(); g.name = 'fuel-' + site.id; g.position.set(site.O[0], 0, site.O[1]); g.rotation.y = site.rotY; g.updateMatrixWorld(true);
  const mb = new MultiBuilder(); const paint = mb.get('paint'), metal = mb.get('metal'), conc = mb.get('concrete'), mark = mb.get('marking'), glass = mb.get('glass'), ao = mb.get('ao'), hedge = mb.get('hedge'), corr = mb.get('corrugated'), roof = mb.get('roofFlat');
  const signs = new MultiBuilder(), sLit = signs.get('lit'), sFlat = signs.get('flat'), ledB = new MultiBuilder().get('led'), poolB = new MultiBuilder().get('pool'), dispB = new MultiBuilder().get('disp');
  const white = C('#f4f4f1'), offW = C('#e6e4de'), steel = C('#b8bcc0'), darkS = C('#3a3d41'), black = C('#151515'), yellow = C('#f2c21b'), red = C('#c8141b'), cream = C('#e9e1cf'), grey = C('#8c8f92');
  const colliders = [], crown = []; const W2 = L.FUEL_W / 2, D = L.FUEL_D;
  const col = (u0, u1, w0, w1, h, kind = 'prop', y0) => { const r = site.box(u0, u1, w0, w1); const c = { x0: r[0], x1: r[1], z0: r[2], z1: r[3], h, kind, fuel: site.id }; if (y0 !== undefined) c.y0 = y0; colliders.push(c); return c; };
  // ---- ground: forecourt slab, driveway crossings, gutter ramps, joints, drainage channels, markings, stains
  conc.hrect(-W2, -D, W2, 0, S, 3.2, C('#cfccc4'));
  for (const sg of [-1, 1]) { const c0 = sg * L.FUEL_DRIVE - L.FUEL_DRIVE_HW, c1 = sg * L.FUEL_DRIVE + L.FUEL_DRIVE_HW;
    conc.hrect(c0, 0, c1, site.walk, S, 3.2, C('#c9c6be')); // crossing over the pavement (slightly darker, newer concrete)
    const yR = L.ROAD_Y + 0.004, wr = site.walk + L.FUEL_RAMP; conc.quad([c0, yR, wr], [c1, yR, wr], [c1, S, site.walk], [c0, S, site.walk], [c0 / 3.2, 0, c1 / 3.2, 0.3], C('#bdb9b0'));
    for (const e of [c0, c1]) { const s = e === c0 ? -1 : 1; const P = s < 0 ? [[e, yR, wr], [e, S, site.walk], [e, L.ROAD_Y, site.walk]] : [[e, yR, wr], [e, L.ROAD_Y, site.walk], [e, S, site.walk]]; conc.quad(P[0], P[1], P[2], P[2], [0, 0, 0.3, 0.1], C('#b5b1a8')); } // ramp cheeks
    for (const e of [c0, c1]) B(paint, e - 0.06, e + 0.06, S - 0.02, S + 0.012, -site.walk, 0, C('#e8e4da')); // white-painted kerb edges of the crossing
    for (let x = c0 + 0.2; x < c1 - 0.1; x += 0.25) B(paint, x, x + 0.04, S - 0.004, S + 0.003, 0.4, 0.75, darkS); B(paint, c0, c1, S - 0.01, S + 0.001, 0.38, 0.77, black); // drainage grate across the driveway
  }
  for (let u = -W2 + 6; u < W2; u += 6) B(mark, u - 0.012, u + 0.012, S, S + 0.002, 0.2, D - 0.2, C('#8d8a84')); // saw-cut joints
  for (let w = 6; w < D; w += 6) B(mark, -W2 + 0.2, W2 - 0.2, S, S + 0.002, w - 0.012, w + 0.012, C('#8d8a84'));
  for (const w of [FS.canopy.w0 - 0.5, FS.canopy.w1 + 0.6]) { B(paint, -10, 10, S - 0.006, S + 0.002, w - 0.16, w + 0.16, black); for (let u = -9.9; u < 10; u += 0.22) B(paint, u, u + 0.035, S - 0.004, S + 0.003, w - 0.15, w + 0.15, darkS); }
  const arrow = (u, w, dir) => { const s = dir; mark.quad([u - 1.6 * s, S + 0.002, -(w - 0.16)], [u + 0.2 * s, S + 0.002, -(w - 0.16)], [u + 0.2 * s, S + 0.002, -(w + 0.16)], [u - 1.6 * s, S + 0.002, -(w + 0.16)], [0, 0, 1, 1], white);
    const a = [u + 0.2 * s, S + 0.002, -(w - 0.5)], b = [u + 1.1 * s, S + 0.002, -w], c = [u + 0.2 * s, S + 0.002, -(w + 0.5)]; if (s > 0) mark.quad(a, b, b, c, [0, 0, 1, 1], white); else mark.quad(c, b, b, a, [0, 0, 1, 1], white); };
  arrow(-17.5, 6.5, 1); arrow(-17.5, 13, 1); arrow(17.5, 6.5, 1); arrow(17.5, 13, 1);
  for (const w of [FS.lanes.A, FS.lanes.B, FS.lanes.C]) for (const u of [-1.6, 3.6]) aoBlob(ao, u + Math.sin(w * 3 + u) * 0.4, w + Math.cos(u * 2 + w) * 0.25, 0.9 + ((w * 7 + u) % 0.5), 0.55, 0.8); // drips under the parked engines / tanks
  for (const u of [-6, 0, 6]) aoBlob(ao, u * 1.7 + 3, 19.2 + (u % 2), 0.7, 0.45, 0.86);
  // ---- boundary walls (side + rear) with brand coping band
  const wallH = S + 2.0;
  for (const s of [-1, 1]) { const u0 = s * W2 - (s > 0 ? 0.2 : 0), u1 = u0 + 0.2; B(paint, u0, u1, S, wallH, 1.6, D, cream); B(paint, u0 - 0.03, u1 + 0.03, wallH, wallH + 0.08, 1.6, D, offW); B(paint, u0 - 0.005, u1 + 0.005, wallH - 0.34, wallH - 0.12, 1.6, D, main); col(u0, u1, 1.6, D, wallH + 0.08, 'wall');
    for (let w = 4; w < D; w += 3.2) B(paint, u0 - 0.06, u1 + 0.06, S, wallH + 0.12, w - 0.16, w + 0.16, offW); }
  B(paint, -W2, W2, S, wallH, D - 0.2, D, cream); B(paint, -W2, W2, wallH, wallH + 0.08, D - 0.23, D + 0.03, offW); col(-W2, W2, D - 0.2, D, wallH + 0.08, 'wall');
  // ---- front planter with hedge, the pylon in it
  { const P = FS.planter; for (const [a0, a1, b0, b1] of [[P.u0, P.u1, P.w0, P.w0 + 0.14], [P.u0, P.u1, P.w1 - 0.14, P.w1], [P.u0, P.u0 + 0.14, P.w0, P.w1], [P.u1 - 0.14, P.u1, P.w0, P.w1]]) B(conc, a0, a1, S, S + 0.42, b0, b1, C('#d9d6cf'));
    B(paint, P.u0, P.u0 + 0.14, S + 0.02, S + 0.4, P.w0 - 0.002, P.w1 + 0.002, yellow); B(paint, P.u1 - 0.14, P.u1, S + 0.02, S + 0.4, P.w0 - 0.002, P.w1 + 0.002, yellow); // ends painted for the drivers
    B(mb.get('soil'), P.u0 + 0.14, P.u1 - 0.14, S, S + 0.34, P.w0 + 0.14, P.w1 - 0.14, null);
    for (let u = P.u0 + 0.4; u < P.u1 - 0.4; u += 2.1) { if (Math.abs(u - FS.pylon.u) < 1.2) continue; B(hedge, u, Math.min(u + 1.9, P.u1 - 0.3), S + 0.34, S + 0.95 + Math.sin(u) * 0.06, P.w0 + 0.22, P.w1 - 0.22, C('#7f9a62')); }
    col(P.u0, P.u1, P.w0, P.w1, S + 0.9, 'prop'); }
  { const p = FS.pylon, w0 = p.w - 1.0, w1 = p.w + 1.0, top = S + 7.2, u0 = p.u - 0.24, u1 = p.u + 0.24; // monolith price pylon facing up and down the road
    B(conc, u0 - 0.14, u1 + 0.14, S, S + 0.45, w0 - 0.12, w1 + 0.12, C('#bcb8b0')); B(paint, u0, u1, S + 0.45, top, w0, w1, main); B(paint, u0 - 0.02, u1 + 0.02, top - 0.02, top + 0.14, w0 - 0.04, w1 + 0.04, accent);
    for (const s of [-1, 1]) face(sLit, s < 0 ? '-u' : '+u', w0 + 0.06, w1 - 0.06, S + 2.15, top - 0.08, s < 0 ? u0 - 0.004 : u1 + 0.004, uvOf(R.pylon));
    for (const s of [-1, 1]) face(sFlat, s < 0 ? '-u' : '+u', w0 + 0.25, w1 - 0.25, S + 0.85, S + 1.6, s < 0 ? u0 - 0.004 : u1 + 0.004, uvOf(R.hours));
    face(sFlat, '-w', p.u - 0.22, p.u + 0.22, S + 4.2, S + 4.64, w0 - 0.004, uvOf(R.clock)); col(u0 - 0.14, u1 + 0.14, w0 - 0.12, w1 + 0.12, top, 'pole'); }
  // IN / OUT signs on short posts at the driveway corners
  for (const [u, r] of [[-L.FUEL_DRIVE + L.FUEL_DRIVE_HW + 0.5, R.inSign], [L.FUEL_DRIVE - L.FUEL_DRIVE_HW - 0.5, R.outSign]]) { cyl(metal, u, 0.8, S, 1.75, 0.04, 0.04, 8, steel); B(paint, u - 0.03, u + 0.03, S + 1.2, S + 1.86, 0.33, 1.27, darkS); face(sFlat, '-u', 0.35, 1.25, S + 1.22, S + 1.84, u - 0.032, uvOf(r)); face(sFlat, '+u', 0.35, 1.25, S + 1.22, S + 1.84, u + 0.032, uvOf(r)); col(u - 0.08, u + 0.08, 0.72, 0.88, S + 1.9, 'pole'); }
  // ---- islands, columns, dispensers, crash guards
  const faces = []; const IH = FS.isHalfLen - FS.isHalfWid;
  FS.islands.forEach((wi, ii) => {
    const hw = FS.isHalfWid;
    B(conc, -IH, IH, S, YI, wi - hw, wi + hw, C('#d8d5ce')); for (const s of [-1, 1]) { cyl(paint, s * IH, wi, S, FS.isH - 0.004, hw, hw, 20, yellow, false); conc.hpoly(Array.from({ length: 20 }, (_, k) => { const t = (k / 20) * Math.PI * 2; return [s * IH + Math.cos(t) * hw, -(wi + Math.sin(t) * hw)]; }), YI, 2, C('#d8d5ce')); }
    for (let u = -IH; u < IH - 0.01; u += 0.5) { const c = Math.round((u + IH) / 0.5) % 2 ? black : yellow; for (const s of [-1, 1]) B(paint, u, Math.min(u + 0.5, IH), S + 0.01, YI - 0.004, wi + s * hw - 0.008, wi + s * hw + 0.008, c); }
    col(-FS.isHalfLen, FS.isHalfLen, wi - hw, wi + hw, YI, 'prop'); aoRect(ao, -FS.isHalfLen, FS.isHalfLen, wi - hw, wi + hw, 0.35, 0.72);
    for (const cu of FS.cols) { // round white column, stainless skirt, collar
      cyl(metal, cu, wi, YI, 1.05, FS.colR + 0.02, FS.colR + 0.02, 24, steel); cyl(paint, cu, wi, YI + 1.05, FS.canopy.y0 - YI - 1.05, FS.colR, FS.colR, 24, white, false); cyl(metal, cu, wi, YI + 1.03, 0.04, FS.colR + 0.035, FS.colR + 0.035, 24, C('#9a9ea2'));
      cyl(paint, cu, wi, FS.canopy.y0 - 0.25, 0.25, FS.colR, FS.colR + 0.12, 24, white, false); col(cu - FS.colR - 0.03, cu + FS.colR + 0.03, wi - FS.colR - 0.03, wi + FS.colR + 0.03, FS.canopy.y0, 'pole');
      const s = cu < 0 ? -1 : 1; face(sFlat, s < 0 ? '-u' : '+u', wi - 0.24, wi + 0.24, YI + 1.75, YI + 2.23, cu + s * (FS.colR + 0.012), uvOf(cu < 0 ? (ii ? R.noPhone : R.noSmoke) : (ii ? R.noSmoke : R.engine)));
      B(paint, cu + s * (FS.colR - 0.01), cu + s * (FS.colR + 0.008), YI + 1.72, YI + 2.26, wi - 0.26, wi + 0.26, darkS); }
    for (const s of [-1, 1]) { const u = s * (FS.isHalfLen - 0.22); const k = Math.sqrt(Math.max(0, hw * hw - (FS.isHalfLen - 0.22 - IH) ** 2)) - 0.1; // U-shaped steel crash guard on each island nose
      tube(paint, [[u, YI - 0.02, wi - k], [u, YI + 0.55, wi - k], [u, YI + 0.8, wi - k * 0.7], [u, YI + 0.87, wi], [u, YI + 0.8, wi + k * 0.7], [u, YI + 0.55, wi + k], [u, YI - 0.02, wi + k]], 0.048, null, 40, { n: 9, a: yellow, b: black });
      col(u - 0.08, u + 0.08, wi - k - 0.06, wi + k + 0.06, YI + 0.9, 'pole'); }
    // extinguisher (red, black hose, gauge) and a squeegee bucket on each island
    { const u = -1.2 + ii * 2.4, w = wi + (ii ? -0.3 : 0.3); cyl(paint, u, w, YI, 0.5, 0.085, 0.085, 14, red); cyl(paint, u, w, YI + 0.5, 0.06, 0.085, 0.05, 14, red); cyl(metal, u, w, YI + 0.56, 0.06, 0.025, 0.025, 8, darkS); B(metal, u - 0.06, u + 0.02, YI + 0.6, YI + 0.63, w - 0.012, w + 0.012, black); cyl(metal, u + 0.05, w, YI + 0.5, 0.03, 0.026, 0.026, 10, steel);
      tube(paint, [[u - 0.06, YI + 0.56, w], [u - 0.11, YI + 0.4, w + 0.03], [u - 0.1, YI + 0.18, w + 0.04]], 0.012, black, 10); B(paint, u - 0.086, u + 0.086, YI + 0.2, YI + 0.34, w - 0.08, w - 0.075, C('#f2f2ee'));
      const ub = -u, wb = wi - (ii ? -0.3 : 0.3); cyl(paint, ub, wb, YI, 0.3, 0.13, 0.16, 16, C('#2a74c8'), false); cyl(paint, ub, wb, YI + 0.28, 0.006, 0.15, 0.15, 16, C('#5d8fc0')); tube(metal, [[ub, YI + 0.1, wb], [ub + 0.05, YI + 0.8, wb + 0.02]], 0.012, darkS, 6); B(paint, ub - 0.02, ub + 0.12, YI + 0.78, YI + 0.86, wb - 0.14, wb + 0.16, black); }
    // price board on the island centre
    { const u = 0, w = wi; cyl(metal, u, w, YI, 1.0, 0.03, 0.03, 8, steel); B(paint, u - 0.31, u + 0.31, YI + 0.98, YI + 1.82, w - 0.03, w + 0.03, darkS); face(sFlat, '-w', u - 0.29, u + 0.29, YI + 1.0, YI + 1.8, w - 0.032, uvOf(R.isBoard)); face(sFlat, '+w', u - 0.29, u + 0.29, YI + 1.0, YI + 1.8, w + 0.032, uvOf(R.isBoard)); }
    FS.disp.forEach((du, di) => { // dispenser
      const hw2 = FS.dispW / 2, d2 = FS.dispD / 2, y1 = YI + 0.12, y2 = YI + 1.25, y3 = YI + 2.15, y4 = YI + 2.45;
      B(metal, du - 0.53, du + 0.53, YI, y1, wi - 0.31, wi + 0.31, steel); B(paint, du - hw2, du + hw2, y1, y2, wi - d2, wi + d2, main); // plinth, cabinet
      for (const s of [-1, 1]) { B(metal, du - hw2 - 0.006, du + hw2 + 0.006, y1, y1 + 0.05, wi + s * d2 - 0.006, wi + s * d2 + s * 0.004, steel); B(metal, du - hw2 + 0.06, du + hw2 - 0.06, y1 + 0.15, y1 + 0.55, wi + s * (d2 + 0.004) - 0.003, wi + s * (d2 + 0.004) + 0.003, C('#cfd2d4'));
        for (let k = 0; k < 6; k++) B(metal, du - hw2 + 0.1, du + hw2 - 0.1, y1 + 0.19 + k * 0.06, y1 + 0.21 + k * 0.06, wi + s * (d2 + 0.008) - 0.004, wi + s * (d2 + 0.008) + 0.004, darkS); } // louvred service panels
      for (const s of [-1, 1]) { B(metal, du + s * (hw2 + 0.003) - 0.003, du + s * (hw2 + 0.003) + 0.003, y1, y2, wi - d2, wi + d2, steel); }
      B(paint, du - hw2, du + hw2, y2, y3, wi - 0.22, wi + 0.22, white); B(paint, du - hw2 - 0.01, du + hw2 + 0.01, y2 - 0.02, y2 + 0.03, wi - d2 - 0.01, wi + d2 + 0.01, dark); // head
      B(paint, du - 0.5, du + 0.5, y3, y4, wi - 0.25, wi + 0.25, main); B(paint, du - 0.51, du + 0.51, y4, y4 + 0.03, wi - 0.26, wi + 0.26, accent); // brand cap
      col(du - 0.53, du + 0.53, wi - 0.31, wi + 0.31, y4 + 0.03, 'pole'); aoRect(ao, du - 0.53, du + 0.53, wi - 0.31, wi + 0.31, 0.12, 0.6, YI + 0.003);
      for (const s of [-1, 1]) { const fw = wi + s * 0.22, dir = s < 0 ? '-w' : '+w', fo = s * 0.004;
        face(sLit, dir, du - 0.49, du + 0.49, y3 + 0.02, y4 - 0.02, wi + s * 0.252, uvOf(R.dispHead));
        B(paint, du - 0.36, du + 0.36, y2 + 0.28, y2 + 0.74, fw - 0.012, fw + 0.012, C('#1b1d20')); // display bezel
        const f = ii * 4 + di * 2 + (s > 0 ? 1 : 0); const cxr = (f % 4) * 128, cyr = Math.floor(f / 4) * 128; face(dispB, dir, du - 0.32, du + 0.32, y2 + 0.32, y2 + 0.7, fw + s * 0.014, [cxr / 512, 1 - (cyr + 128) / 256, (cxr + 128) / 512, 1 - cyr / 256]);
        face(sFlat, dir, du - 0.4, du + 0.4, y2 + 0.12, y2 + 0.24, fw + fo, uvOf(ii ? R.label1 : R.label0));
        { const k0 = s < 0 ? du - 0.47 : du + 0.37; face(sFlat, dir, k0, k0 + 0.1, y2 + 0.3, y2 + 0.43, fw + fo, uvOf(R.keypad)); } // keypad: on the attendant's LEFT on both faces (pressed with the left hand while the right takes the nozzle) — face-frame x = KEYPAD[0]
        // boots on the cabinet face, colour-coded by grade
        const grades = ISLAND_GRADES[ii]; const xs = BOOT_X.map((bx) => (s < 0 ? du + bx : du - bx));
        xs.forEach((bu, k) => { const fwc = wi + s * d2; B(paint, bu - 0.055, bu + 0.055, YI + BOOT_Y - 0.08, YI + BOOT_Y + 0.07, fwc, fwc + s * 0.075, C(GRADES[grades[k]].col)); B(metal, bu - 0.04, bu + 0.04, YI + OUTLET_Y - 0.03, YI + OUTLET_Y + 0.03, fwc, fwc + s * 0.03, darkS); });
        const fr = new THREE.Matrix4().compose(new THREE.Vector3(du, YI, -(wi + s * d2)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s < 0 ? 0 : Math.PI), new THREE.Vector3(1, 1, 1));
        faces.push({ f, island: ii, disp: di, side: s, du, wi, grades, frame: fr, displayPx: [cxr, cyr] }); }
    });
  });
  // ---- canopy: deep flat deck, white fascia with the brand band, recessed LED panels, roof
  { const c = FS.canopy; B(paint, c.u0, c.u1, c.y0, c.y1, c.w0, c.w1, white, { bottom: true });
    roof.hrect(c.u0 + 0.15, -(c.w1 - 0.15), c.u1 - 0.15, -(c.w0 + 0.15), c.y1 + 0.02, 4, C('#9a9894'));
    B(paint, c.u0 - 0.03, c.u1 + 0.03, c.y0 - 0.06, c.y0, c.w0 - 0.03, c.w1 + 0.03, main); // thin brand band under the fascia edge
    for (const [dir, at] of [['-w', c.w0 - 0.035], ['+w', c.w1 + 0.035]]) face(sLit, dir, c.u0, c.u1, c.y0 + 0.02, c.y1 - 0.02, at, uvOf(R.fascia));
    for (const [dir, at] of [['-u', c.u0 - 0.035], ['+u', c.u1 + 0.035]]) face(sLit, dir, c.w0, c.w1, c.y0 + 0.02, c.y1 - 0.02, at, uvOf(R.fasciaSide));
    for (let u = c.u0 + 1.5; u < c.u1 - 0.5; u += 1.5) B(paint, u - 0.01, u + 0.01, c.y0 - 0.008, c.y0, c.w0 + 0.1, c.w1 - 0.1, offW); // panel seams
    for (const w of [5.2, 10.5, 15.8]) for (const u of [-7.2, -3.6, 0, 3.6, 7.2]) { const yy = c.y0 - 0.012; ledB.quad([u - 0.6, yy, -(w + 0.3)], [u + 0.6, yy, -(w + 0.3)], [u + 0.6, yy, -(w - 0.3)], [u - 0.6, yy, -(w - 0.3)], [0, 0, 1, 1]); B(metal, u - 0.64, u + 0.64, c.y0 - 0.014, c.y0 - 0.002, w - 0.34, w + 0.34, C('#c9ccd0')); }
    // gutter downpipes inside two columns' line, CCTV on a column top
    B(metal, c.u1 - 0.6, c.u1 - 0.4, c.y0 + 0.2, c.y0 + 0.5, c.w1 - 0.1, c.w1 + 0.05, darkS);
    { const u = FS.cols[0], w = FS.islands[0]; B(metal, u - 0.04, u + 0.04, c.y0 - 0.3, c.y0, w - 0.04, w + 0.04, C('#d8d8d4')); B(paint, u - 0.07, u + 0.07, c.y0 - 0.42, c.y0 - 0.3, w - 0.24, w + 0.02, C('#ececea')); B(paint, u - 0.05, u + 0.05, c.y0 - 0.4, c.y0 - 0.32, w - 0.26, w - 0.24, black); }
    col(c.u0, c.u1, c.w0, c.w1, c.y1 - c.y0, 'landmark', c.y0); const r = site.box(c.u0, c.u1, c.w0, c.w1); crown.push([r[0] - 1.2, r[1] + 1.2, r[2] - 1.2, r[3] + 1.2, c.y1 + 0.8]);
    for (const w of [6.2, 11.5, 16.4]) for (const u of [-6, 0, 6]) poolB.quad([u - 4.4, S + 0.012, -(w - 3.4)], [u + 4.4, S + 0.012, -(w - 3.4)], [u + 4.4, S + 0.012, -(w + 3.4)], [u - 4.4, S + 0.012, -(w + 3.4)], [0, 0, 1, 1]); }
  // ---- mini-mart / office / toilets block with a covered walkway
  { const P = FS.shop, top = S + P.h, par = top + 0.75, gu0 = -20.2, gu1 = -8.4, gd = 1.6, gt = S + 3.0; // gu0..gu1: glazed shopfront with a 1.6 m deep lit interior behind it
    B(paint, P.u0, P.u1, S, top, P.w0 + gd, P.w1, cream); B(paint, P.u0, gu0, S, top, P.w0, P.w0 + gd, cream); B(paint, gu1, P.u1, S, top, P.w0, P.w0 + gd, cream); B(paint, gu0, gu1, gt, top, P.w0, P.w0 + gd, cream);
    paint.hrect(gu0, -(P.w0 + gd), gu1, -P.w0, S + 0.165, 1, C('#e4e0d6')); paint.hrect(gu0, -(P.w0 + gd), gu1, -P.w0, gt - 0.002, 1, C('#f4f4f0'), true);
    for (let u = gu0 + 0.6; u < gu1; u += 1.6) ledB.quad([u - 0.5, gt - 0.006, -(P.w0 + 0.9)], [u + 0.5, gt - 0.006, -(P.w0 + 0.9)], [u + 0.5, gt - 0.006, -(P.w0 + 0.7)], [u - 0.5, gt - 0.006, -(P.w0 + 0.7)], [0, 0, 1, 1]);
    face(paint, '+u', P.w0, P.w0 + gd, S + 0.16, gt, gu0, [0, 0, 1, 1], C('#ece9e2')); face(paint, '-u', P.w0, P.w0 + gd, S + 0.16, gt, gu1, [0, 0, 1, 1], C('#ece9e2'));
    B(paint, P.u0 - 0.05, P.u1 + 0.05, top, par, P.w0 - 0.05, P.w1 + 0.05, offW); B(paint, P.u0 - 0.06, P.u1 + 0.06, par - 0.22, par - 0.08, P.w0 - 0.06, P.w1 + 0.06, main);
    roof.hrect(P.u0 + 0.25, -(P.w1 - 0.25), P.u1 - 0.25, -(P.w0 + 0.25), par + 0.004, 4, C('#a09d96'));
    { const tu = -2, tw = P.w1 - 1.6; for (const [du, dw] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) B(metal, tu + du - 0.03, tu + du + 0.03, par, par + 0.6, tw + dw - 0.03, tw + dw + 0.03, darkS); B(metal, tu - 0.65, tu + 0.65, par + 0.6, par + 0.66, tw - 0.65, tw + 0.65, darkS); cyl(paint, tu, tw, par + 0.66, 1.15, 0.58, 0.58, 20, C('#1c1c1c')); cyl(paint, tu, tw, par + 1.81, 0.12, 0.58, 0.3, 20, C('#1c1c1c')); } // black water tank on a steel stand
    for (const u of [-16, -11, 2.5]) { B(paint, u - 0.42, u + 0.42, par, par + 0.62, P.w1 - 0.9, P.w1 - 0.6, C('#e8e8e4')); B(metal, u - 0.34, u + 0.1, par + 0.1, par + 0.52, P.w1 - 0.905, P.w1 - 0.9, darkS); } // split-AC outdoor units
    col(P.u0, P.u1, P.w0, P.w1, par, 'landmark'); { const r = site.box(P.u0, P.u1, P.w0, P.w1); crown.push([r[0] - 1.2, r[1] + 1.2, r[2] - 1.2, r[3] + 1.2, par + 1.6]); }
    B(conc, P.u0, P.u1, S, S + 0.16, P.w0 - 1.6, P.w0, C('#d4d1ca')); B(paint, P.u0, P.u1, S + 0.005, S + 0.165, P.w0 - 1.62, P.w0 - 1.58, yellow); col(P.u0, P.u1, P.w0 - 1.6, P.w0, S + 0.16, 'prop');
    B(paint, P.u0, P.u1, S + 3.0, S + 3.12, P.w0 - 1.75, P.w0, white, { bottom: true }); B(paint, P.u0, P.u1, S + 2.98, S + 3.28, P.w0 - 1.8, P.w0 - 1.7, main); // walkway canopy + fascia
    for (let u = P.u0 + 1.2; u < P.u1; u += 2.4) { const yy = S + 2.988; ledB.quad([u - 0.16, yy, -(P.w0 - 0.7)], [u + 0.16, yy, -(P.w0 - 0.7)], [u + 0.16, yy, -(P.w0 - 1.02)], [u - 0.16, yy, -(P.w0 - 1.02)], [0, 0, 1, 1]); }
    for (const u of [P.u0 + 0.2, -8.2, P.u1 - 0.2]) { cyl(metal, u, P.w0 - 1.6, S + 0.16, 2.84, 0.05, 0.05, 10, steel); col(u - 0.06, u + 0.06, P.w0 - 1.66, P.w0 - 1.54, S + 3.0, 'pole'); }
    face(sLit, '-w', -20.2, -8.6, top + 0.06, par - 0.24, P.w0 - 0.056, uvOf(R.shop));
    // shopfront glazing (aluminium mullions), sliding doors, the lit interior behind
    const fw = P.w0 + 0.02; face(sLit, '-w', gu0, gu1, S + 0.25, gt - 0.05, P.w0 + gd - 0.006, uvOf(R.shelf)); B(paint, -18, -15.2, S + 0.16, S + 1.05, P.w0 + 0.3, P.w0 + 0.8, C('#5a4636')); B(paint, -18, -15.2, S + 1.05, S + 1.1, P.w0 + 0.28, P.w0 + 0.82, C('#d8d0c0'));
    glass.box(-14.3, S + 1.55, -fw, 11.8, 2.75, 0.02); for (let u = -20.2; u <= -8.39; u += 1.475) B(metal, u - 0.03, u + 0.03, S + 0.16, S + 2.95, fw - 0.03, fw + 0.03, C('#c8cace')); B(metal, -20.2, -8.4, S + 2.9, S + 3.0, fw - 0.04, fw + 0.04, C('#c8cace')); B(metal, -20.2, -8.4, S + 0.16, S + 0.3, fw - 0.04, fw + 0.04, C('#c8cace'));
    B(metal, -15.0, -13.6, S + 1.0, S + 1.05, fw - 0.06, fw - 0.03, darkS); face(sFlat, '-w', -12.7, -11.4, S + 2.35, S + 2.75, fw - 0.045, uvOf(R.hours));
    // office: door + window, sign; dealer plaque; toilets
    B(paint, -7.6, -6.5, S + 0.16, S + 2.3, P.w0 - 0.03, P.w0 + 0.02, C('#5b3a26')); B(metal, -6.68, -6.62, S + 1.0, S + 1.12, P.w0 - 0.06, P.w0 - 0.03, steel); face(sFlat, '-w', -7.9, -6.2, S + 2.42, S + 2.82, P.w0 - 0.035, uvOf(R.office));
    B(paint, -5.5, -2.9, S + 0.9, S + 2.2, P.w0 - 0.006, P.w0, C('#2b2f33')); glass.box(-4.2, S + 1.55, -(P.w0 - 0.01), 2.6, 1.3, 0.02); B(paint, -5.55, -2.85, S + 0.85, S + 0.9, P.w0 - 0.12, P.w0, offW); for (let u = -5.5; u < -2.8; u += 0.22) B(metal, u, u + 0.015, S + 0.9, S + 2.2, P.w0 - 0.06, P.w0 - 0.04, darkS);
    face(sFlat, '-w', -2.4, -1.1, S + 1.3, S + 1.95, P.w0 - 0.035, uvOf(R.dealer));
    for (const u of [0.3, 1.9, 3.7]) B(paint, u, u + 1.0, S + 0.16, S + 2.2, P.w0 - 0.03, P.w0 + 0.02, u > 3 ? C('#7d7f80') : C('#e8e4d8')); face(sFlat, '-w', 0.4, 2.8, S + 2.3, S + 2.7, P.w0 - 0.035, uvOf(R.toilet));
    // ATM kiosk at the end of the walkway, lubricants rack, bench, bins, sand buckets
    B(paint, -20.3, -19.3, S + 0.16, S + 2.2, P.w0 - 0.75, P.w0, C('#2d3640')); face(sLit, '-w', -20.2, -19.4, S + 1.8, S + 2.15, P.w0 - 0.756, uvOf(R.atm)); B(paint, -20.05, -19.55, S + 1.0, S + 1.5, P.w0 - 0.77, P.w0 - 0.75, C('#101418')); col(-20.3, -19.3, P.w0 - 0.75, P.w0, S + 2.2, 'prop');
    { const u0 = -7.6, u1 = -5.9, w = P.w0 - 0.95; for (const k of [0, 1, 2]) { B(metal, u0, u1, S + 0.25 + k * 0.42, S + 0.28 + k * 0.42, w - 0.2, w + 0.2, darkS); for (let u = u0 + 0.06; u < u1 - 0.08; u += 0.16) { const cc = C(['#f2c230', '#1a1a1a', '#c8141b', '#2a5fc8'][(Math.round(u * 10) + k) % 4]); B(paint, u, u + 0.12, S + 0.28 + k * 0.42, S + 0.53 + k * 0.42, w - 0.08, w + 0.08, cc); } }
      for (const u of [u0, u1]) B(metal, u - 0.02, u + 0.02, S + 0.16, S + 1.45, w - 0.2, w + 0.2, darkS); face(sFlat, '-w', u0, u1, S + 1.48, S + 1.86, w - 0.2, uvOf(R.lube)); B(paint, u0, u1, S + 1.46, S + 1.88, w - 0.19, w - 0.18, darkS); col(u0, u1, w - 0.2, w + 0.2, S + 1.9, 'prop'); }
    { const u0 = -3.3, w = P.w0 - 0.45; B(paint, u0, u0 + 1.8, S + 0.58, S + 0.62, w - 0.2, w + 0.2, C('#6b4a32')); for (const u of [u0 + 0.1, u0 + 1.7]) B(metal, u - 0.03, u + 0.03, S + 0.16, S + 0.58, w - 0.18, w + 0.18, darkS); B(paint, u0, u0 + 1.8, S + 0.62, S + 1.0, w + 0.17, w + 0.2, C('#6b4a32')); }
    cyl(paint, 6.4, 19.9, S, 0.85, 0.24, 0.27, 14, C('#2f7a3a')); cyl(paint, 6.4, 19.9, S + 0.85, 0.06, 0.29, 0.29, 14, C('#255f2e')); col(6.15, 6.65, 19.65, 20.15, S + 0.9, 'prop');
    const buckets = (u, w) => { B(metal, u - 0.62, u + 0.62, S + 0.95, S + 1.0, w - 0.03, w + 0.03, red); for (const s of [-1, 1]) B(metal, u + s * 0.6 - 0.02, u + s * 0.6 + 0.02, S, S + 1.0, w - 0.03, w + 0.03, red);
      for (let k = 0; k < 4; k++) { const bu = u - 0.45 + k * 0.3; cyl(paint, bu, w + 0.12, S + 0.6, 0.3, 0.1, 0.13, 14, red, false); cyl(paint, bu, w + 0.12, S + 0.62, 0.24, 0.11, 0.11, 14, C('#c9b48a')); face(sFlat, '-w', bu - 0.09, bu + 0.09, S + 0.72, S + 0.82, w + 0.12 - 0.122, uvOf(R.fire)); }
      col(u - 0.65, u + 0.65, w - 0.05, w + 0.28, S + 1.0, 'prop'); };
    buckets(-20.3 + 1.6, P.w0 - 2.15 + 0.4); buckets(-16.5, 19.0 + 0.5); }
  // ---- service / wash bay: steel posts, mono-pitch corrugated roof, hoist, washer, tyres, drums
  { const P = FS.shed, yF = S + 4.4, yB = S + 3.9; B(paint, P.u0, P.u0 + 0.2, S, yB, P.w0, P.w1, cream); B(paint, P.u1 - 0.2, P.u1, S, yB, P.w0, P.w1, cream); B(paint, P.u0, P.u1, S, yB, P.w1 - 0.2, P.w1, cream);
    col(P.u0, P.u0 + 0.2, P.w0, P.w1, yB, 'landmark'); col(P.u1 - 0.2, P.u1, P.w0, P.w1, yB, 'landmark'); col(P.u0, P.u1, P.w1 - 0.2, P.w1, yB, 'landmark');
    for (const u of [P.u0 + 0.1, (P.u0 + P.u1) / 2, P.u1 - 0.1]) { B(metal, u - 0.1, u + 0.1, S, yF, P.w0 - 0.1, P.w0 + 0.1, C('#4a5056')); }
    col((P.u0 + P.u1) / 2 - 0.12, (P.u0 + P.u1) / 2 + 0.12, P.w0 - 0.12, P.w0 + 0.12, yF, 'pole');
    B(metal, P.u0, P.u1, yF - 0.35, yF, P.w0 - 0.12, P.w0 + 0.12, C('#4a5056')); face(sLit, '-w', P.u0 + 0.6, P.u1 - 0.6, yF - 1.25, yF - 0.05, P.w0 - 0.15, uvOf(R.shed)); B(paint, P.u0 + 0.5, P.u1 - 0.5, yF - 1.3, yF, P.w0 - 0.14, P.w0 - 0.1, C('#f2c230'));
    corr.quad([P.u0 - 0.2, yF + 0.02, -(P.w0 - 0.5)], [P.u1 + 0.2, yF + 0.02, -(P.w0 - 0.5)], [P.u1 + 0.2, yB + 0.02, -(P.w1 + 0.15)], [P.u0 - 0.2, yB + 0.02, -(P.w1 + 0.15)], [0, 0, 6, 3], C('#9aa3a8'));
    { const r = site.box(P.u0, P.u1, P.w0, P.w1); crown.push([r[0] - 1.2, r[1] + 1.2, r[2] - 1.2, r[3] + 1.2, yF + 1.0]); }
    const hu = P.u0 + 3.6; for (const s of [-1, 1]) { B(paint, hu - 0.16, hu + 0.16, S, S + 3.0, 25.4 + s * 1.7 - 0.16, 25.4 + s * 1.7 + 0.16, yellow); col(hu - 0.18, hu + 0.18, 25.4 + s * 1.7 - 0.18, 25.4 + s * 1.7 + 0.18, S + 3.0, 'pole'); B(metal, hu - 0.06, hu + 1.3, S + 0.42, S + 0.5, 25.4 + s * 1.7 - 0.05, 25.4 + s * 1.7 + 0.05, darkS); } // two-post hoist
    B(paint, hu - 0.2, hu + 0.2, S + 2.95, S + 3.1, 23.5, 27.3, yellow); B(metal, hu - 0.5, hu + 0.5, S, S + 0.05, 23.7, 24.3, darkS); B(metal, hu - 0.5, hu + 0.5, S, S + 0.05, 26.5, 27.1, darkS);
    B(paint, P.u1 - 1.6, P.u1 - 0.9, S, S + 0.9, 28.2, 28.9, C('#c8141b')); tube(paint, [[P.u1 - 1.25, S + 0.85, 28.2], [P.u1 - 1.6, S + 0.6, 27.6], [P.u1 - 2.4, S + 0.03, 27.4], [P.u1 - 3.6, S + 0.03, 26.8]], 0.02, C('#1d1d1d'), 20); col(P.u1 - 1.6, P.u1 - 0.9, 28.2, 28.9, S + 0.9, 'prop'); // pressure washer
    B(paint, P.u0 + 0.3, P.u0 + 1.1, S, S + 1.6, 28.4, 29.1, C('#b3121b')); for (let k = 0; k < 5; k++) B(metal, P.u0 + 0.32, P.u0 + 1.08, S + 0.2 + k * 0.28, S + 0.22 + k * 0.28, 28.38, 28.4, darkS); col(P.u0 + 0.3, P.u0 + 1.1, 28.4, 29.1, S + 1.6, 'prop'); // tool cabinet
    for (let k = 0; k < 4; k++) { const u = P.u0 + 1.6 + k * 0.62; cyl(paint, u, 28.75, S, 0.88, 0.29, 0.29, 16, k % 2 ? C('#1f5aa8') : C('#2f7a3a')); cyl(metal, u, 28.75, S + 0.88, 0.01, 0.27, 0.27, 16, darkS); } col(P.u0 + 1.3, P.u0 + 4.2, 28.45, 29.05, S + 0.9, 'prop'); // oil drums
    for (let k = 0; k < 5; k++) { const g2 = new THREE.TorusGeometry(0.29, 0.1, 8, 18); g2.rotateX(Math.PI / 2); paint.geometry(g2, new THREE.Matrix4().makeTranslation(P.u1 - 0.7, S + 0.1 + k * 0.2, -(26.2)), C('#1a1a1a')); g2.dispose(); } col(P.u1 - 1.1, P.u1 - 0.3, 25.8, 26.6, S + 1.1, 'prop'); }
  // ---- air / nitrogen pedestal, water tap, kerosene pump, tank fill points, vent pipes
  { const a = FS.air; for (const [du, cc] of [[-0.3, C('#1f6fbf')], [0.3, C('#1d8a4a')]]) { B(paint, a.u + du - 0.2, a.u + du + 0.2, S, S + 1.15, a.w - 0.15, a.w + 0.15, cc); B(paint, a.u + du - 0.23, a.u + du + 0.23, S + 1.15, S + 1.6, a.w - 0.19, a.w + 0.19, C('#e8e8e4')); B(paint, a.u + du - 0.16, a.u + du + 0.16, S + 1.28, S + 1.4, a.w - 0.195, a.w - 0.19, C('#0d1a12'));
      tube(paint, [[a.u + du + 0.2, S + 1.2, a.w - 0.05], [a.u + du + 0.4, S + 0.9, a.w - 0.1], [a.u + du + 0.32, S + 0.5, a.w - 0.12], [a.u + du + 0.22, S + 0.95, a.w - 0.16]], 0.012, black, 16); }
    face(sLit, '-w', a.u - 0.5, a.u + 0.5, S + 1.62, S + 2.12, a.w - 0.02, uvOf(R.air)); B(paint, a.u - 0.52, a.u + 0.52, S + 1.6, S + 2.14, a.w - 0.015, a.w + 0.05, C('#e8e8e4')); col(a.u - 0.55, a.u + 0.55, a.w - 0.22, a.w + 0.22, S + 2.14, 'prop');
    cyl(metal, a.u + 1.4, a.w, S, 0.8, 0.03, 0.03, 8, grey); B(metal, a.u + 1.36, a.u + 1.5, S + 0.75, S + 0.8, a.w - 0.02, a.w + 0.02, red); cyl(paint, a.u + 1.4, a.w - 0.3, S, 0.32, 0.15, 0.17, 14, C('#2a74c8'), false); col(a.u + 1.2, a.u + 1.6, a.w - 0.5, a.w + 0.1, S + 0.8, 'prop'); }
  { const u = 6.6, w = 23.4 - 2.6; B(metal, u - 0.3, u + 0.3, S, S + 0.1, w - 0.22, w + 0.22, steel); B(paint, u - 0.25, u + 0.25, S + 0.1, S + 1.35, w - 0.18, w + 0.18, C(GRADES.ke.col)); B(paint, u - 0.26, u + 0.26, S + 1.35, S + 1.62, w - 0.2, w + 0.2, white);
    face(sFlat, '-w', u - 0.22, u + 0.22, S + 0.95, S + 1.32, w - 0.185, uvOf(R.kero)); B(paint, u - 0.18, u + 0.18, S + 1.4, S + 1.56, w - 0.205, w - 0.2, C('#1b1d20')); col(u - 0.32, u + 0.32, w - 0.24, w + 0.24, S + 1.62, 'prop'); }
  { const w = 19.4; B(paint, -15.9, -8.1, S, S + 0.004, w - 0.9, w + 0.9, yellow); B(paint, -15.7, -8.3, S + 0.004, S + 0.006, w - 0.7, w + 0.7, C('#bdbab3'));
    for (let k = 0; k < 4; k++) { const u = -14.6 + k * 1.9; B(paint, u - 0.38, u + 0.38, S, S + 0.014, w - 0.38, w + 0.38, C('#5b5e61')); cyl(paint, u, w, S + 0.014, 0.02, 0.16, 0.16, 16, C(GRADES[['p92', 'p95', 'ad', 'sd'][k]].col)); }
    face(sFlat, '+u', 18.9, 19.9, S + 0.5, S + 0.75, -16.0, [R.tank[0] / AT, 1 - (R.tank[1] + R.tank[3]) / AT, (R.tank[0] + R.tank[2]) / AT, 1 - R.tank[1] / AT]); B(paint, -16.06, -16.0, S, S + 0.8, 19.3, 19.5, darkS); }
  for (let k = 0; k < 4; k++) { const w = 26.6 + k * 0.32, u = W2 - 0.38; cyl(metal, u, w, S, 4.4, 0.04, 0.04, 8, C('#c4c7ca')); cyl(metal, u, w, S + 4.4, 0.1, 0.07, 0.05, 8, darkS); } col(W2 - 0.5, W2 - 0.25, 26.4, 27.8, S + 4.5, 'pole');
  // ---- meshes
  for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) { if (m.name === 'ao') { m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1; } if (m.name === 'marking' || m.name === 'concrete') m.castShadow = m.name !== 'marking'; g.add(m); }
  const atlas = brandAtlas(site); const signLit = new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.45, color: atlas ? 0xffffff : main ? new THREE.Color(Bd.main) : 0xffffff, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const signFlat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.55, color: atlas ? 0xffffff : 0xdddddd, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const sm = signs.toMeshes({ lit: signLit, flat: signFlat }, { cast: false, receive: true }); for (const m of sm) g.add(m);
  const led = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, emissive: 0xf4f8ff, emissiveIntensity: 0.25, roughness: 0.3 }); const ledG = ledB.build(); if (ledG) { const m = new THREE.Mesh(ledG, led); m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); m.name = 'canopyLED'; g.add(m); }
  const basePool = MAT.pool && MAT.pool.isMaterial ? MAT.pool : null; const pool = basePool ? basePool.clone() : new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }); pool.color = new THREE.Color(0xdfe9ff); pool.opacity = 0;
  const poolG = poolB.build(); if (poolG) { const m = new THREE.Mesh(poolG, pool); m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); m.renderOrder = 2; m.name = 'canopyPool'; g.add(m); }
  // pump read-outs: one canvas per station, 8 faces × 128 px
  const dc = canvas(512, 256); let dTex = null; if (dc) { dTex = new THREE.CanvasTexture(dc.cv); dTex.colorSpace = THREE.SRGBColorSpace; }
  const dispMat = new THREE.MeshStandardMaterial({ map: dTex, emissiveMap: dTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.25, color: dTex ? 0xffffff : 0x9ab08a });
  const dG = dispB.build(); if (dG) { const m = new THREE.Mesh(dG, dispMat); m.castShadow = false; m.matrixAutoUpdate = false; m.updateMatrix(); m.name = 'pumpDisplays'; g.add(m); }
  const drawDisplay = (f, amount, litres, price, active) => { if (!dc) return; const fc = faces.find((q) => q.f === f); if (!fc) return; const [x, y] = fc.displayPx; const a = dc.a;
    a.fillStyle = '#1d2a1e'; a.fillRect(x, y, 128, 128); a.fillStyle = active ? '#b9f0a8' : '#9cc994'; a.fillRect(x + 4, y + 4, 120, 120); a.fillStyle = '#10190f'; a.textBaseline = 'alphabetic';
    a.font = `600 10px ${MN}`; a.textAlign = 'left'; a.fillText('AMOUNT  Rs', x + 8, y + 17); a.fillText('LITRES', x + 8, y + 59); a.fillText('PRICE  Rs/L', x + 8, y + 99);
    a.textAlign = 'right'; a.font = `700 30px ${BC}`; a.fillText(amount.toFixed(2), x + 120, y + 47); a.font = `700 26px ${BC}`; a.fillText(litres.toFixed(2), x + 120, y + 86); a.font = `700 20px ${BC}`; a.fillText(price.toFixed(2), x + 120, y + 121);
    dTex.needsUpdate = true; };
  for (const fc of faces) drawDisplay(fc.f, 0, 0, GRADES[fc.grades[0]].price, false);
  // nozzles + hanging hoses (instanced: 24 of each per station); a nozzle in use is lifted out of its instance slot
  const nGeo = nozzleGeometry(), gGeo = nozzleGeometry(null), hGeo = hoseGeometry(); const nMat = nozzleMaterial(), gMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  const hMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });
  const nozzles = new THREE.InstancedMesh(nGeo, nMat, faces.length * 3), guards = new THREE.InstancedMesh(gGeo, gMat, faces.length * 3), hoses = new THREE.InstancedMesh(hGeo, hMat, faces.length * 3); nozzles.name = 'nozzles'; guards.name = 'nozzle-guards'; hoses.name = 'hoses';
  const slots = []; const _m = new THREE.Matrix4(), _c = new THREE.Color();
  for (const fc of faces) BOOT_X.forEach((bx, k) => { const i = slots.length; const hm = new THREE.Matrix4().multiplyMatrices(fc.frame, holsterLocal(bx)); nozzles.setMatrixAt(i, hm); guards.setMatrixAt(i, hm); guards.setColorAt(i, _c.set(GRADES[fc.grades[k]].col === '#202020' ? '#2a2a2a' : GRADES[fc.grades[k]].col));
    const hs = new THREE.Matrix4().multiplyMatrices(fc.frame, _m.makeTranslation(bx, 0, 0)); hoses.setMatrixAt(i, hs); slots.push({ i, face: fc, k, grade: fc.grades[k], holster: hm.clone(), hose: hs.clone(), outlet: new THREE.Vector3(bx, OUTLET_Y, 0.01).applyMatrix4(fc.frame) }); });
  nozzles.instanceMatrix.needsUpdate = true; guards.instanceMatrix.needsUpdate = true; if (guards.instanceColor) guards.instanceColor.needsUpdate = true; nozzles.castShadow = true; hoses.castShadow = true; g.add(nozzles); g.add(guards); g.add(hoses);
  const hideSlot = (i, hide) => { const s = slots[i]; if (!s) return; nozzles.setMatrixAt(i, hide ? _m.makeScale(0, 0, 0) : s.holster); guards.setMatrixAt(i, hide ? _m.makeScale(0, 0, 0) : s.holster); hoses.setMatrixAt(i, hide ? _m.makeScale(0, 0, 0) : s.hose); nozzles.instanceMatrix.needsUpdate = true; guards.instanceMatrix.needsUpdate = true; hoses.instanceMatrix.needsUpdate = true; };
  g.updateMatrixWorld(true);
  return { site, group: g, colliders, crownBoxes: crown, faces, slots, nozzleMat: nMat, hoseMat: hMat, hideSlot, drawDisplay, mats: { led, pool, signLit, dispMat },
    update(night) { led.emissiveIntensity = 0.25 + night * 2.6; pool.opacity = night * 0.62; signLit.emissiveIntensity = night * 0.85; dispMat.emissiveIntensity = 0.45 + night * 0.35; } };
}
