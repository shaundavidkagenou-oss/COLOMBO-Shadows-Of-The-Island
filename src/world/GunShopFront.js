// Street frontage of Ceylon Arms Co. (the gun shop): a dark framed shopfront over the ground floor of its shophouse —
// steel-framed glass door, two projecting display windows (the game's own rifle models on felt behind security grilles),
// roller-shutter box, warm display lighting, CCTV camera, opening-hours plaque. Built once at load (World.build); returns
// the group plus colliders for the window bays. No browser-only imports (the smoke test builds the world in Node).
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { WEAPONS } from '../combat/WeaponDefs.js';
import { buildWeaponModel } from '../combat/WeaponModels.js';
import * as L from './Layout.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
function plaque(w, h, draw, pw, ph) {
  if (typeof document === 'undefined') return null; const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const a = cv.getContext && cv.getContext('2d'); if (!a || !a.fillText) return null; draw(a, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
}

export function buildGunShopFront(shop, building) {
  const th = shop.faceIn, dx = Math.sin(th), dz = Math.cos(th); // into the shop
  const fx = shop.x + dx * 1.3, fz = shop.z + dz * 1.3; // facade point (the door point sits 1.3 m out on the pavement)
  let w = 7; if (building) w = Math.abs(dz) > 0.7 ? building.x1 - building.x0 : building.z1 - building.z0; w = Math.max(5, Math.min(w - 0.4, 9));
  const y0 = (L.groundY ? L.groundY(shop.x, shop.z) : L.LAND_Y) + 0.0;
  const mb = new MultiBuilder(); const paint = mb.get('paint'), metal = mb.get('metal'), glass = mb.get('glass'), emis = mb.get('emissive');
  const g = new THREE.Group(); g.name = 'gunshop-front';
  // local frame: facade at z = 0, street towards +z, x along the frontage
  const H = 2.95, P = 0.36, half = w / 2, doorW = 1.25, bay = 0.34, sill = 0.42, top = 2.55;
  const frame = C('#1b1c1e'), trim = C('#b08a3a');
  paint.box(-half + P / 2, H / 2, 0.07, P, H, 0.14, { col: frame }); paint.box(half - P / 2, H / 2, 0.07, P, H, 0.14, { col: frame }); // pilasters
  metal.box(0, top + (H - top) / 2 + 0.02, 0.12, w, H - top + 0.04, 0.24, { col: C('#2a2d30') }); // roller-shutter box
  for (let k = 0; k < 6; k++) metal.box(0, top + 0.06 + k * 0.06, 0.245, w - 0.04, 0.012, 0.01, { col: C('#3a3e42') });
  paint.box(0, top - 0.02, 0.15, w, 0.03, 0.3, { col: trim }); // brass line under the box
  // door: steel frame, glass, push bar, threshold step
  for (const s of [-1, 1]) paint.box(s * (doorW / 2 + 0.04), top / 2, 0.06, 0.08, top, 0.12, { col: frame });
  paint.box(0, top / 2, 0.006, doorW, top, 0.012, { col: C('#141516') }); // dark lobby behind the door glass (hides the generic shopfront texture of the facade)
  glass.box(0, top / 2 + 0.02, 0.03, doorW, top - 0.08, 0.02); metal.box(0, 1.05, 0.06, doorW * 0.7, 0.04, 0.05, { col: C('#c8c8c4') });
  paint.box(0, 0.06, 0.25, doorW + 0.3, 0.12, 0.5, { col: C('#555652') });
  // display windows (one each side of the door) projecting `bay` from the wall
  const colliders = []; const models = [['carbine', 'bolt'], ['assault', 'semi']];
  for (const s of [-1, 1]) {
    const a = doorW / 2 + 0.08, b = half - P, cx = s * (a + b) / 2, ww = b - a;
    paint.box(cx, sill / 2, bay / 2 + 0.02, ww, sill, bay, { col: frame }); // stall riser
    paint.box(cx, sill + 0.01, bay / 2 + 0.02, ww, 0.02, bay, { col: C('#5a1d1d') }); // felt bed
    paint.box(cx, (sill + top) / 2, 0.015, ww, top - sill, 0.02, { col: C('#2b2422') }); // dark backing
    for (const e of [a, b]) paint.box(s * e, (sill + top) / 2, bay / 2 + 0.02, 0.05, top - sill, bay, { col: frame });
    glass.box(cx, (sill + top) / 2, bay + 0.02, ww - 0.04, top - sill - 0.04, 0.02);
    emis.box(cx, top - 0.06, bay * 0.6, ww - 0.12, 0.015, 0.03, { col: [1.0, 0.92, 0.78] }); // display strip light
    for (let x = cx - ww / 2 + 0.12; x < cx + ww / 2 - 0.06; x += 0.24) metal.box(x, (sill + top) / 2, bay + 0.09, 0.022, top - sill, 0.022, { col: C('#3c3f42') }); // grille
    for (const y of [sill + 0.05, top - 0.05, (sill + top) / 2]) metal.box(cx, y, bay + 0.09, ww, 0.03, 0.03, { col: C('#3c3f42') });
    models[s < 0 ? 0 : 1].forEach((id, k) => { const def = WEAPONS.find((q) => q.id === id); if (!def) return; const m = buildWeaponModel(def); m.rotation.set(0, -Math.PI / 2, 0); m.scale.setScalar(1.05); m.position.set(cx + 0.15, top - 0.5 - k * 0.72, 0.1); g.add(m);
      metal.box(cx - 0.25, top - 0.6 - k * 0.72, 0.05, 0.03, 0.08, 0.08, { col: C('#8a8d90') }); metal.box(cx + 0.45, top - 0.6 - k * 0.72, 0.05, 0.03, 0.08, 0.08, { col: C('#8a8d90') }); });
    for (let k = 0; k < 4; k++) paint.box(cx - ww / 2 + 0.3 + k * 0.24, sill + 0.06, bay * 0.55, 0.18, 0.1, 0.12, { col: C(['#b8892c', '#6b7d3a', '#8a2a1e', '#2d4f6b'][k]) }); // ammunition boxes on the bed
    colliders.push([cx, bay / 2 + 0.06, ww + 0.1, bay + 0.18]);
  }
  // CCTV camera on a bracket at the top corner
  metal.box(half - 0.5, top + 0.55, 0.25, 0.05, 0.05, 0.5, { col: C('#d8d8d4') }); metal.box(half - 0.5, top + 0.47, 0.5, 0.12, 0.12, 0.26, { col: C('#ececea') }); paint.box(half - 0.5, top + 0.47, 0.64, 0.08, 0.08, 0.02, { col: C('#111') });
  for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) g.add(m);
  const hours = plaque(256, 320, (a, W, Hh) => { a.fillStyle = '#16120c'; a.fillRect(0, 0, W, Hh); a.strokeStyle = '#c9a54e'; a.lineWidth = 6; a.strokeRect(8, 8, W - 16, Hh - 16); a.fillStyle = '#e8c76a'; a.textAlign = 'center';
    a.font = '700 34px "Barlow Condensed", sans-serif'; a.fillText('CEYLON ARMS CO.', W / 2, 58); a.fillStyle = '#e8e2d2'; a.font = '600 20px "Manrope", sans-serif'; a.fillText('Licensed firearms dealer', W / 2, 96);
    a.font = '700 26px "Barlow Condensed", sans-serif'; a.fillText('OPEN', W / 2, 152); a.font = '600 22px "Manrope", sans-serif'; a.fillText('Mon – Sat  9.00 – 18.00', W / 2, 186); a.fillText('Sunday  closed', W / 2, 216);
    a.font = '500 17px "Manrope", sans-serif'; a.fillStyle = '#bdb6a6'; a.fillText('Firearm licence required', W / 2, 266); a.fillText('for every purchase', W / 2, 290); }, 0.34, 0.425);
  if (hours) { hours.position.set(-(half - P / 2), 1.55, 0.145); g.add(hours); } // on the left pilaster, at eye height
  g.position.set(fx, y0, fz); g.rotation.y = th + Math.PI; g.updateMatrixWorld(true);
  // colliders (axis-aligned bounds of the rotated window bays)
  const cols = colliders.map(([cx, cz, sx, sz]) => { const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => new THREE.Vector3(cx + u * sx / 2, 0, cz + v * sz / 2).applyMatrix4(g.matrixWorld));
    return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)), h: y0 + 1.0, kind: 'wall' }; });
  return { group: g, colliders: cols };
}
