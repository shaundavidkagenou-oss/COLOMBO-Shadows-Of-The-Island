// Street entrance of each protagonist's home (Dineth — Slave Island, Shashika — Maradana, David — Pettah). Their rooms are
// interiors (HeroRooms.js) reached through a door spot on a real building wall; until now that spot was a bare stretch of
// the generic facade with a prompt. This builds a proper Colombo house-front around the door, on the wall itself:
//   a painted plaster frontage panel with a darker dado band and a moulded string course, a panelled timber door in its
//   architrave (brass handle, letter slot), a cast-concrete sunshade hood on brackets (the typical Colombo door canopy),
//   a tiled threshold step and coir door mat, a barred window with its own hood, a wall lantern (lit at night through the
//   shared lamp material — no extra light, so no shader recompiles), an electricity meter box with conduit, a ceramic
//   house-number plaque, and potted plants (an areca palm and a croton) either side of the step.
// Each home has its own colour scheme. Node-safe (the plaque is skipped without a canvas). Returns { group, colliders }.
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import * as L from './Layout.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const THEME = {
  room: { wall: '#d9c79a', dado: '#8e7c56', door: '#2f5d50', trim: '#f1ece0', no: '27/3', plaqueBg: '#f4efe2', plaqueInk: '#1d4f8a' }, // Dineth: ochre house, green door
  room_shashika: { wall: '#c9d3cf', dado: '#6f7d79', door: '#6e2a24', trim: '#f2f0ea', no: '114/B', plaqueBg: '#fbf7ec', plaqueInk: '#7a1f1a' }, // Shashika: pale sea-green, maroon door
  room_david: { wall: '#e6d9c9', dado: '#8b7360', door: '#24456b', trim: '#f6f2ea', no: '62', plaqueBg: '#eef3f8', plaqueInk: '#24456b' }, // David: cream, blue door
};
function plaque(text, T) {
  if (typeof document === 'undefined') return null; const cv = document.createElement('canvas'); cv.width = 128; cv.height = 96; const a = cv.getContext && cv.getContext('2d'); if (!a || !a.fillText) return null;
  a.fillStyle = T.plaqueBg; a.fillRect(0, 0, 128, 96); a.strokeStyle = T.plaqueInk; a.lineWidth = 5; a.strokeRect(6, 6, 116, 84); a.lineWidth = 1.5; a.strokeRect(13, 13, 102, 70);
  a.fillStyle = T.plaqueInk; a.textAlign = 'center'; a.textBaseline = 'middle'; a.font = `700 ${text.length > 4 ? 34 : 44}px "Barlow Condensed", sans-serif`; a.fillText(text, 64, 50);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 }));
}

// find the wall the door belongs to: along faceIn first, otherwise the nearest wall in 16 directions (≤ 2.6 m)
export function entranceWall(collision, door) {
  const try1 = (th) => { const f = collision.raycast(door.x, 1.0, door.z, door.x + Math.sin(th) * 2.6, 1.0, door.z + Math.cos(th) * 2.6, 0.05); return f < 1 && f * 2.6 > 0.2 ? f * 2.6 : Infinity; }; if (collision.blocked(door.x, door.z, 0.15)) return null; // standing inside something: no wall in front
  let th = door.faceIn ?? 0, d = try1(th);
  if (!(d < 2.6)) { for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, dd = try1(a); if (dd < d) { d = dd; th = a; } } }
  if (!(d < 2.6)) return null;
  // square up to the wall: probe two points either side and take the wall's direction
  const probe = (off) => { const sx = Math.cos(th), sz = -Math.sin(th); const x = door.x + sx * off, z = door.z + sz * off; const f = collision.raycast(x, 1.0, z, x + Math.sin(th) * 3.2, 1.0, z + Math.cos(th) * 3.2, 0.05); return f < 1 ? f * 3.2 : null; };
  for (let it = 0; it < 2; it++) { const a = probe(-0.6), b = probe(0.6); if (a !== null && b !== null && Math.abs(a - b) < 1.3) { const dl = -Math.atan2(b - a, 1.2); th += dl; d = (a + b) / 2 * Math.cos(dl); } } // up to 45° off (door spots are searched in 45° steps)
  // how far the wall runs flat either side of the door (a corner / recess ends the frontage panel)
  const ux = Math.cos(th), uz = -Math.sin(th); const flat = (off) => { const x = door.x + ux * off, z = door.z + uz * off; const f = collision.raycast(x, 1.0, z, x + Math.sin(th) * (d + 0.6), 1.0, z + Math.cos(th) * (d + 0.6), 0.05); return f < 1 && Math.abs(f * (d + 0.6) - d) < 0.12; };
  let ext = [0, 0]; for (const [i, sgn] of [[0, -1], [1, 1]]) { let o = 0; while (o < 2.7 && flat(sgn * (o + 0.15))) o += 0.15; ext[i] = o; }
  return { th, d, left: ext[1], right: ext[0] }; // local +x (left/right as seen from the street) — see buildHeroEntrance
}

export function buildHeroEntrance(id, door, collision) {
  const T = THEME[id]; if (!T || !collision) return null; const W = entranceWall(collision, door); if (!W) return null;
  const th = W.th, dx = Math.sin(th), dz = Math.cos(th); // into the building
  const fx = door.x + dx * (W.d - 0.02), fz = door.z + dz * (W.d - 0.02); // on the facade, 2 cm proud of it
  const y0 = L.groundY ? L.groundY(door.x, door.z) : 0;
  const mb = new MultiBuilder(); const paint = mb.get('paint'), conc = mb.get('concrete'), glass = mb.get('glass'), lamp = mb.get('lampHead'), leaf = mb.get('hedge');
  const g = new THREE.Group(); g.name = 'hero-entrance-' + id;
  // local frame: facade at z = 0, street towards +z, x along the wall; the door is at x = 0
  // fit to the flat wall: local +x extent = W.right, −x = W.left (see entranceWall). The window goes where there is room.
  const ER = Math.max(0.55, W.right), EL = Math.max(0.55, W.left); const ws = ER >= 2.1 ? 1 : EL >= 2.1 ? -1 : 0; const ls = ws ? -ws : (EL >= ER ? -1 : 1);
  const x0 = -Math.min(EL, ws < 0 ? 2.15 : 1.3), x1 = Math.min(ER, ws > 0 ? 2.15 : 1.3); const PW = x1 - x0, PH = 3.15, px = (x0 + x1) / 2; // frontage panel
  const wall = C(T.wall), dado = C(T.dado), trim = C(T.trim), dc = C(T.door), dk = dc.map((v) => v * 0.72);
  paint.box(px, PH / 2, 0.02, PW, PH, 0.04, { col: wall }); // plaster panel
  paint.box(px, 0.45, 0.05, PW, 0.9, 0.03, { col: dado }); // dado band (splash-proof lower wall)
  paint.box(px, 0.92, 0.06, PW, 0.04, 0.03, { col: trim }); // dado capping
  paint.box(px, PH - 0.08, 0.07, PW + 0.08, 0.1, 0.07, { col: trim }); paint.box(px, PH - 0.15, 0.06, PW + 0.04, 0.04, 0.05, { col: trim }); // moulded string course
  for (const s of [-1, 1]) paint.box(px + s * (PW / 2 - 0.05), PH / 2, 0.06, 0.1, PH, 0.05, { col: trim }); // quoins
  // door: architrave, recessed panelled leaf, handle, letter slot, threshold
  const DW = 0.92, DH = 2.12;
  paint.box(0, DH / 2, 0.035, DW + 0.04, DH, 0.02, { col: C('#1c1712') }); // shadowed reveal behind the leaf
  for (const s of [-1, 1]) paint.box(s * (DW / 2 + 0.05), (DH + 0.1) / 2, 0.08, 0.1, DH + 0.1, 0.05, { col: trim });
  paint.box(0, DH + 0.06, 0.08, DW + 0.2, 0.1, 0.05, { col: trim });
  paint.box(0, DH / 2, 0.05, DW, DH, 0.04, { col: dc });
  for (const [cy, hh] of [[0.45, 0.62], [1.18, 0.62], [1.8, 0.44]]) for (const s of [-1, 1]) { paint.box(s * 0.215, cy, 0.074, 0.33, hh, 0.012, { col: dk }); paint.box(s * 0.215, cy, 0.08, 0.27, hh - 0.06, 0.01, { col: dc }); } // raised-and-fielded panels
  paint.box(0.36, 1.02, 0.085, 0.035, 0.16, 0.015, { col: C('#b58f3e') }); paint.box(0.36, 1.06, 0.11, 0.11, 0.022, 0.022, { col: C('#d1a84c') }); paint.box(0.36, 0.97, 0.09, 0.018, 0.024, 0.01, { col: C('#2a2018') }); // brass handle + keyhole
  paint.box(0, 1.46, 0.082, 0.26, 0.05, 0.012, { col: C('#b58f3e') }); // letter slot
  conc.box(0, 0.06, 0.24, DW + 0.5, 0.12, 0.48, { col: C('#a39d93') }); paint.box(0, 0.125, 0.24, DW + 0.44, 0.012, 0.42, { col: C('#8c4a32') }); // step, terracotta tiles
  paint.box(0, 0.137, 0.3, 0.72, 0.012, 0.42, { col: C('#8a6a3c') }); for (let k = 0; k < 6; k++) paint.box(0, 0.144, 0.13 + k * 0.068, 0.7, 0.004, 0.012, { col: C('#6a4f2c') }); // coir door mat
  // cast-concrete sunshade hood over the door, on two brackets, with a drip edge
  conc.box(0, DH + 0.36, 0.33, DW + 0.9, 0.07, 0.66, { col: C('#d8d3c8') }); conc.box(0, DH + 0.33, 0.645, DW + 0.9, 0.17, 0.05, { col: C('#e2ddd2') }); conc.box(0, DH + 0.405, 0.33, DW + 0.86, 0.02, 0.6, { col: C('#bdb7ab') }); /* deep drip-edge fascia (reads as a solid hood from the street, not a plank) + weathered top */
  for (const s of [-1, 1]) { conc.box(s * (DW / 2 + 0.3), DH + 0.24, 0.17, 0.08, 0.16, 0.34, { col: C('#cfc9bd') }); conc.box(s * (DW / 2 + 0.3), DH + 0.14, 0.07, 0.08, 0.1, 0.14, { col: C('#cfc9bd') }); }
  // barred window to the right of the door, with its own hood and sill
  const wx = 1.55 * ws, ww = 0.95, wy0 = 1.0, wh = 1.15; if (ws) {
  paint.box(wx, wy0 + wh / 2, 0.035, ww, wh, 0.02, { col: C('#202528') }); glass.box(wx, wy0 + wh / 2, 0.05, ww - 0.06, wh - 0.06, 0.012);
  for (const s of [-1, 1]) paint.box(wx + s * (ww / 2 + 0.035), wy0 + wh / 2, 0.075, 0.07, wh + 0.07, 0.05, { col: trim });
  paint.box(wx, wy0 + wh + 0.035, 0.075, ww + 0.14, 0.07, 0.05, { col: trim }); conc.box(wx, wy0 - 0.03, 0.1, ww + 0.2, 0.06, 0.2, { col: C('#d8d3c8') }); // head + sill
  paint.box(wx, wy0 + wh / 2, 0.062, 0.035, wh - 0.04, 0.025, { col: dc }); paint.box(wx, wy0 + wh * 0.55, 0.062, ww - 0.04, 0.035, 0.025, { col: dc }); // casement frames
  for (let k = 0; k < 6; k++) paint.box(wx - ww / 2 + 0.1 + k * ((ww - 0.2) / 5), wy0 + wh / 2, 0.1, 0.016, wh - 0.02, 0.016, { col: C('#2c2f31') }); // grille bars
  for (const y of [wy0 + 0.12, wy0 + wh - 0.12]) paint.box(wx, y, 0.1, ww - 0.02, 0.02, 0.02, { col: C('#2c2f31') });
  conc.box(wx, wy0 + wh + 0.2, 0.25, ww + 0.4, 0.06, 0.5, { col: C('#d8d3c8') }); conc.box(wx, wy0 + wh + 0.185, 0.495, ww + 0.4, 0.13, 0.04, { col: C('#e2ddd2') }); }
  // wall lantern on the left of the door (lit at night: MAT.lampHead follows the night factor)
  const lx = ls * (DW / 2 + 0.36), ly = 2.0;
  paint.box(lx, ly - 0.05, 0.05, 0.1, 0.16, 0.03, { col: C('#202020') }); paint.box(lx, ly + 0.05, 0.13, 0.025, 0.025, 0.16, { col: C('#202020') });
  lamp.box(lx, ly - 0.03, 0.2, 0.1, 0.15, 0.1, { col: [1, 0.86, 0.6] }); paint.box(lx, ly + 0.06, 0.2, 0.14, 0.03, 0.14, { col: C('#1d1d1d') }); paint.box(lx, ly - 0.115, 0.2, 0.11, 0.02, 0.11, { col: C('#1d1d1d') });
  // electricity meter box with a conduit up to the eaves
  if ((ls < 0 ? EL : ER) >= 1.25) { const mx = ls * 1.05; paint.box(mx, 1.6, 0.07, 0.3, 0.4, 0.1, { col: C('#9ea3a6') }); glass.box(mx, 1.66, 0.125, 0.14, 0.1, 0.01); paint.box(mx, 1.66, 0.121, 0.16, 0.12, 0.004, { col: C('#151a1d') });
    paint.cylinder(mx, 1.8, 0.06, 0.015, 0.015, PH - 1.95, 6, { col: C('#d4d4d0') }); }
  // potted plants either side of the step: terracotta pots, an areca palm (left) and a croton (right)
  const cols = [];
  for (const [s, kind] of [[-1, 'areca'], [1, 'croton']]) { if ((s < 0 ? EL : ER) < 1.2) continue; const ox = s * (DW / 2 + 0.55), oz = 0.32;
    conc.cylinder(ox, 0, oz, 0.13, 0.17, 0.4, 12, { col: C('#a2532f') }); conc.cylinder(ox, 0.38, oz, 0.18, 0.18, 0.05, 12, { col: C('#8f4728') }); paint.cylinder(ox, 0.39, oz, 0.155, 0.155, 0.02, 12, { col: C('#3b2a1c') }); /* cylinder y = base */
    if (kind === 'areca') { for (let k = 0; k < 5; k++) { const a = k * 1.3, hgt = 0.8 + (k % 3) * 0.18; paint.cylinder(ox + Math.cos(a) * 0.03, 0.4, oz + Math.sin(a) * 0.03, 0.012, 0.009, hgt, 5, { col: C('#7a8a3a') });
        for (let j = 0; j < 7; j++) { const t = 0.35 + j * 0.1, r = 0.08 + j * 0.035; const qx = ox + Math.cos(a) * (0.03 + r), qz = oz + Math.sin(a) * (0.03 + r); leaf.box(qx, 0.4 + hgt * t + 0.05, qz, 0.24 - j * 0.02, 0.012, 0.05, { col: C(j % 2 ? '#3f7a2c' : '#4c8a34'), rotY: -a }); } } }
    else { for (let k = 0; k < 14; k++) { const a = k * 2.4, r = 0.06 + (k % 4) * 0.04, h = 0.5 + (k % 5) * 0.07; const cc = ['#9b2f1e', '#c9a12a', '#3f6a2a', '#b5461c', '#6a7a24'][k % 5]; leaf.box(ox + Math.cos(a) * r, h, oz + Math.sin(a) * r, 0.1, 0.012, 0.2, { col: C(cc), rotY: a }); } }
    cols.push([ox, oz, 0.38, 0.38]); }
  for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) g.add(m);
  const pq = plaque(T.no, T); if (pq) { pq.position.set(-ls * (DW / 2 + 0.22), 1.72, 0.085); g.add(pq); }
  g.position.set(fx, y0, fz); g.rotation.y = th + Math.PI; g.updateMatrixWorld(true);
  const colliders = cols.map(([cx, cz, sx, sz]) => { const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => new THREE.Vector3(cx + u * sx / 2, 0, cz + v * sz / 2).applyMatrix4(g.matrixWorld));
    return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)), h: y0 + 0.7, kind: 'prop' }; });
  door.faceIn = th; // the exit yaw faces straight out of this door
  return { group: g, colliders, wall: W };
}
