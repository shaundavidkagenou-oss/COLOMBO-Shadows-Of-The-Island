// Street frontage of The Velvet Monsoon (the Kollupitiya night club, interior in world/Club.js): black polished-stone
// cladding over the ground floor of its shophouse, a lit canopy over a pair of padded leather doors with brass pulls, a
// magenta neon name sign, smoked windows outlined in neon, wall lanterns, a red carpet runner between brass posts and
// velvet ropes, an "over 18s" house-rules plaque and a CCTV dome. Original design (no real club's name or branding).
// Built once at load (World.build); returns the group plus colliders. No browser-only imports (the smoke test builds the
// world in Node; the canvas signs are skipped there).
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import * as L from './Layout.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
function canvasPlane(w, h, draw, pw, ph, glow = 0) {
  if (typeof document === 'undefined') return null; const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const a = cv.getContext && cv.getContext('2d'); if (!a || !a.fillText) return null; draw(a, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, transparent: glow > 0, emissive: glow ? 0xffffff : 0x000000, emissiveMap: glow ? t : null, emissiveIntensity: glow });
  return new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), m);
}
// neon lettering: a soft halo pass then the bright tube line on a transparent board
function neonText(a, text, x, y, size, col, font = 'italic 700') {
  a.font = `${font} ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; a.textAlign = 'center'; a.textBaseline = 'middle';
  a.save(); a.shadowColor = col; a.shadowBlur = size * 0.45; a.lineWidth = size * 0.11; a.strokeStyle = col; a.globalAlpha = 0.55; a.strokeText(text, x, y); a.restore();
  a.lineWidth = size * 0.06; a.strokeStyle = '#ffe6f4'; a.strokeText(text, x, y);
}

export function buildClubFront(shop, building) {
  const th = shop.faceIn, dx = Math.sin(th), dz = Math.cos(th); // into the club
  const fx = shop.x + dx * 1.3, fz = shop.z + dz * 1.3; // facade point (the door point sits 1.3 m out on the pavement)
  let w = 9; if (building) w = Math.abs(dz) > 0.7 ? building.x1 - building.x0 : building.z1 - building.z0; w = Math.max(6, Math.min(w - 0.4, 10.4));
  const y0 = (L.groundY ? L.groundY(shop.x, shop.z) : L.LAND_Y);
  const mb = new MultiBuilder(); const paint = mb.get('paint'), metal = mb.get('metal'), glass = mb.get('glass'), emis = mb.get('emissive');
  const g = new THREE.Group(); g.name = 'club-front';
  // local frame: facade at z = 0, street towards +z, x along the frontage
  const H = 3.7, half = w / 2, doorW = 1.5, doorH = 2.4;
  const stone = C('#121214'), stoneJ = C('#232327'), brass = C('#b8913e'), pink = [1.0, 0.16, 0.55], violet = [0.55, 0.25, 1.0];
  paint.box(0, H / 2, 0.04, w, H, 0.08, { col: stone }); // black stone cladding
  for (let x = -half + 1.2; x < half - 0.1; x += 1.2) paint.box(x, H / 2, 0.082, 0.012, H, 0.004, { col: stoneJ }); // panel joints
  for (const y of [1.2, 2.4]) paint.box(0, y, 0.082, w, 0.012, 0.004, { col: stoneJ });
  paint.box(0, H + 0.06, 0.12, w + 0.1, 0.12, 0.24, { col: C('#1c1c20') }); paint.box(0, H - 0.02, 0.25, w + 0.1, 0.03, 0.02, { col: brass }); // cornice with a brass line
  paint.box(0, 0.08, 0.14, w, 0.16, 0.12, { col: C('#2a2a2e') }); // plinth
  // doorway: brass-framed reveal, two padded black leather leaves with vertical brass pulls and a diamond quilting pattern
  for (const s of [-1, 1]) paint.box(s * (doorW / 2 + 0.06), doorH / 2, 0.14, 0.12, doorH, 0.2, { col: brass });
  paint.box(0, doorH + 0.06, 0.14, doorW + 0.24, 0.12, 0.2, { col: brass });
  for (const s of [-1, 1]) {
    const cx = s * doorW / 4; paint.box(cx, doorH / 2, 0.1, doorW / 2 - 0.02, doorH - 0.02, 0.06, { col: C('#151013') });
    for (let i = 0; i < 4; i++) for (let j = 0; j < 9; j++) metal.box(cx - doorW / 4 + 0.12 + i * ((doorW / 2 - 0.24) / 3), 0.25 + j * 0.24, 0.135, 0.016, 0.016, 0.012, { col: brass }); // buttons
    metal.box(s * 0.09, 1.1, 0.19, 0.03, 0.75, 0.03, { col: brass }); metal.box(s * 0.09, 0.76, 0.16, 0.025, 0.025, 0.06, { col: brass }); metal.box(s * 0.09, 1.44, 0.16, 0.025, 0.025, 0.06, { col: brass });
  }
  paint.box(0, 0.05, 0.6, doorW + 0.6, 0.1, 1.0, { col: C('#3a3a3e') }); // granite threshold step
  // canopy over the door: dark box with a brass edge and recessed downlights
  const cw = 3.2, cd = 1.5, cy = 2.95;
  paint.box(0, cy + 0.11, cd / 2, cw, 0.22, cd, { col: C('#141416') }); paint.box(0, cy + 0.11, cd + 0.005, cw + 0.02, 0.22, 0.02, { col: brass });
  for (const s of [-1, 1]) paint.box(s * (cw / 2 + 0.005), cy + 0.11, cd / 2, 0.02, 0.22, cd, { col: brass });
  for (let i = 0; i < 4; i++) for (const zz of [0.45, 1.1]) emis.cylinder(-1.2 + i * 0.8, cy - 0.005, zz, 0.05, 0.05, 0.01, 12, { col: [1, 0.86, 0.7] });
  emis.box(0, cy + 0.235, cd - 0.05, cw - 0.2, 0.02, 0.02, { col: pink }); // LED edge on the canopy top
  for (const s of [-1, 1]) metal.box(s * (cw / 2 - 0.1), cy + 0.6, cd * 0.55, 0.03, 0.03, cd * 1.1, { col: C('#1a1a1a') }); // tie rods
  // smoked windows each side, outlined in neon
  const colliders = [];
  for (const s of [-1, 1]) {
    const a = doorW / 2 + 0.6, b = half - 0.45; if (b - a < 0.8) continue; const cx = s * (a + b) / 2, ww = b - a;
    paint.box(cx, 0.35, 0.12, ww + 0.1, 0.7, 0.14, { col: C('#1d1d21') }); glass.box(cx, 1.55, 0.1, ww, 1.7, 0.02); paint.box(cx, 1.55, 0.085, ww, 1.7, 0.01, { col: C('#07070a') });
    for (const y of [0.7, 2.4]) emis.box(cx, y, 0.13, ww, 0.025, 0.025, { col: s < 0 ? pink : violet }); for (const e of [a, b]) emis.box(s * e, 1.55, 0.13, 0.025, 1.7, 0.025, { col: s < 0 ? pink : violet });
    // wall lantern between the window and the door
    const lx = s * (doorW / 2 + 0.33); metal.box(lx, 2.15, 0.14, 0.12, 0.42, 0.12, { col: brass }); emis.box(lx, 2.15, 0.21, 0.08, 0.34, 0.02, { col: [1, 0.78, 0.5] });
  }
  // red carpet runner + brass posts with sagging velvet ropes (a queue lane each side of the carpet)
  paint.box(0, 0.012, 1.25, 1.3, 0.016, 1.5, { col: C('#7a0d1c') }); for (const s of [-1, 1]) paint.box(s * 0.66, 0.014, 1.25, 0.03, 0.018, 1.5, { col: brass });
  for (const s of [-1, 1]) {
    const px = s * 1.05, zs = [0.55, 1.25, 1.95];
    for (const pz of zs) { metal.cylinder(px, 0.015, pz, 0.14, 0.14, 0.03, 16, { col: brass }); metal.cylinder(px, 0.5, pz, 0.025, 0.025, 0.95, 10, { col: brass }); metal.cylinder(px, 0.99, pz, 0.045, 0.035, 0.06, 12, { col: brass }); }
    for (let k = 0; k < zs.length - 1; k++) for (let i = 0; i < 10; i++) { const u = (i + 0.5) / 10, z = zs[k] + (zs[k + 1] - zs[k]) * u, y = 0.93 - 0.12 * 4 * u * (1 - u); paint.box(px, y, z, 0.035, 0.035, 0.075, { col: C('#8c0f22') }); }
    colliders.push([px, 1.25, 0.12, 1.5]);
  }
  // CCTV dome
  metal.cylinder(half - 0.6, H - 0.12, 0.16, 0.08, 0.08, 0.04, 14, { col: C('#e8e8e6') }); paint.cylinder(half - 0.6, H - 0.19, 0.16, 0.065, 0.05, 0.09, 14, { col: C('#111114') });
  for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) g.add(m);
  // name sign above the canopy: neon lettering with a rain-cloud motif (original artwork)
  for (const s of [-1, 1]) { const bm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.34), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.6, roughness: 0.4 })); bm.position.set(s * 1.4, H + 0.62, 0.17); g.add(bm); } // sign brackets
  const sign = canvasPlane(1024, 256, (a, W, Hh) => {
    a.clearRect(0, 0, W, Hh); neonText(a, 'THE VELVET MONSOON', W / 2 + 50, Hh / 2 + 6, 104, '#ff2c8c');
    a.save(); a.translate(96, Hh / 2 - 10); a.strokeStyle = '#7f6bff'; a.shadowColor = '#7f6bff'; a.shadowBlur = 18; a.lineWidth = 7; a.beginPath(); a.arc(-18, 6, 26, Math.PI * 0.9, Math.PI * 1.9); a.arc(18, -4, 34, Math.PI * 1.1, Math.PI * 2.05); a.lineTo(-44, 22); a.closePath(); a.stroke();
    for (let i = 0; i < 4; i++) { a.beginPath(); a.moveTo(-34 + i * 20, 42); a.lineTo(-42 + i * 20, 72); a.stroke(); } a.restore();
  }, 3.6, 0.9, 2.2);
  if (sign) { sign.position.set(0, H + 0.62, 0.34); sign.renderOrder = 2; g.add(sign); } // on brackets clear of the cornice, so neither it nor the canopy hides the lettering
  const rules = canvasPlane(256, 340, (a, W, Hh) => {
    a.fillStyle = '#100c10'; a.fillRect(0, 0, W, Hh); a.strokeStyle = '#c9a54e'; a.lineWidth = 6; a.strokeRect(8, 8, W - 16, Hh - 16); a.textAlign = 'center';
    a.fillStyle = '#ff5aa8'; a.font = 'italic 700 30px "Barlow Condensed", sans-serif'; a.fillText('THE VELVET MONSOON', W / 2, 54);
    a.fillStyle = '#e8e2d2'; a.font = '600 20px "Manrope", sans-serif'; a.fillText('Live dance shows', W / 2, 98); a.fillText('Cocktail bar · Lounge', W / 2, 126);
    a.font = '700 26px "Barlow Condensed", sans-serif'; a.fillText('OPEN DAILY', W / 2, 176); a.font = '600 21px "Manrope", sans-serif'; a.fillText('Shows all day, till late', W / 2, 206);
    a.fillStyle = '#ffd36a'; a.font = '700 30px "Barlow Condensed", sans-serif'; a.fillText('OVER 18s ONLY', W / 2, 258); a.fillStyle = '#bdb6a6'; a.font = '500 17px "Manrope", sans-serif'; a.fillText('Smart casual · ID required', W / 2, 292);
  }, 0.36, 0.48, 0.25);
  if (rules) { rules.position.set(doorW / 2 + 0.33, 1.45, 0.205); g.add(rules); }
  g.position.set(fx, y0, fz); g.rotation.y = th + Math.PI; g.updateMatrixWorld(true);
  const cols = colliders.map(([cx, cz, sx, sz]) => { const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => new THREE.Vector3(cx + u * sx / 2, 0, cz + v * sz / 2).applyMatrix4(g.matrixWorld));
    return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)), h: y0 + 1.0, kind: 'wall' }; });
  return { group: g, colliders: cols };
}
