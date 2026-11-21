// Street frontage of Ceylon Meridian Bank, Kollupitiya branch (67th request, Phase 1B): a modern Colombo bank front
// over the ground floor of its two-storey shophouse on Galle Road —
//   • cream stone-clad piers and a polished dark-granite plinth; five glazed bays in dark bronze anodised aluminium
//     (mullions, transom rail), a frosted CMB manifestation band at eye level, the lit banking hall behind
//   • the entrance bay: the hinged glass door (WalkIn.js) with glazed sidelights and a transom, under a cantilevered
//     canopy (navy edge, gold line, three downlights, stainless tie rods)
//   • a navy composite fascia across the whole front with the CMB logo + stacked wordmark over the door, an "ATM 24
//     HOURS" panel over the ATM-lobby side, a projecting blade sign, LED wash line, roller-shutter boxes + guide channels
//   • plaques (banking hours, branch name), a CCTV dome, two low granite planters with clipped shrubs
// Built once at load (World.build). No browser-only imports: in Node the canvas signs are skipped (plain navy faces).
// Returns { group, colliders (piers, planters), update(night) } — the signs / hall backdrop glow brighter after dark.
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { kitMaterial, KIT } from './ShopKit.js';
import { CMB, ATLAS, brandAtlas, hallBackdrop, frostBand } from './BankBrand.js';
import { bankTex, bankNormal } from './BankTex.js';
import * as L from './Layout.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const BANK_FRONT = { pierW: 0.55, pierD: 0.32, plinth: 0.5, glassTop: 3.07, fasciaY0: 3.25, fasciaY1: 4.15, fasciaD: 0.4, canopyY: 3.1, canopyD: 1.5 };

export function buildBankFront(shop, building) {
  const th = shop.faceIn, dx = Math.sin(th), dz = Math.cos(th); // into the bank
  const fx = shop.x + dx * 1.3, fz = shop.z + dz * 1.3; // facade point (the door point sits 1.3 m out on the pavement)
  let w = 16; if (building) w = Math.abs(dz) > 0.7 ? building.x1 - building.x0 : building.z1 - building.z0; w = Math.max(12, Math.min(w - 0.3, 22));
  const y0 = L.groundY ? L.groundY(shop.x, shop.z) : L.LAND_Y;
  const mb = new MultiBuilder('Ceylon Meridian Bank'); const paint = mb.get('paint'), metal = mb.get('metal'), glass = mb.get('glass'), emis = mb.get('emissive'), stone = mb.get('concrete');
  const sign = mb.get('cmbSign'), hall = mb.get('cmbHall'), frost = mb.get('cmbFrost'), gran = mb.get('cmbGranite'), leaf = mb.get('cmbShrub');
  const g = new THREE.Group(); g.name = 'bank-front';
  const F = BANK_FRONT, half = w / 2, PW = F.pierW, PD = F.pierD;
  const bronze = C('#2e2a26'), navy = C(CMB.navy), gold = C(CMB.gold), cream = C('#e6dfcf'), steel = C('#c9ccce');
  // piers: the ends, the two flanking the entrance bay, and one in each side half → five bays (entrance in the middle)
  const inner = 2.0, mid = (inner + half - PW / 2) / 2; const piers = [-half + PW / 2, -mid, -inner, inner, mid, half - PW / 2];
  const colliders = [];
  for (const px of piers) { stone.box(px, F.fasciaY0 / 2, PD / 2, PW, F.fasciaY0, PD, { col: cream, uvScale: 0.6 }); // limestone-coloured cladding
    for (let y = 0.9; y < F.fasciaY0 - 0.2; y += 0.9) paint.box(px, y, PD + 0.002, PW + 0.004, 0.008, 0.004, { col: C('#bdb4a0') }); // cladding joints
    gran.box(px, F.plinth / 2, PD / 2 + 0.01, PW + 0.04, F.plinth, PD + 0.04, { col: [1, 1, 1] }); colliders.push([px, (PD + 0.05) / 2, PW + 0.06, PD + 0.05]); }
  // the bays between the piers
  const bays = []; for (let i = 0; i < piers.length - 1; i++) bays.push([piers[i] + PW / 2, piers[i + 1] - PW / 2]);
  for (const [a, b] of bays) { const entrance = a < 0 && b > 0; const cx = (a + b) / 2, bw = b - a;
    // shutter box (rolled-up roller shutter) under the fascia + guide channels down both sides
    metal.box(cx, F.glassTop + (F.fasciaY0 - F.glassTop) / 2, 0.11, bw, F.fasciaY0 - F.glassTop, 0.22, { col: C('#6f7376') });
    for (const e of [a + 0.03, b - 0.03]) metal.box(e, F.glassTop / 2, 0.15, 0.05, F.glassTop, 0.06, { col: C('#5d6164') });
    if (entrance) continue;
    gran.box(cx, F.plinth / 2, 0.07, bw, F.plinth, 0.14, { col: [1, 1, 1] }); // granite stall riser
    // hall backdrop on the wall, glass in front, frames + mullions + transom, frosted band
    const u0 = a / 6, u1 = b / 6; hall.quad([a, F.plinth, 0.012], [b, F.plinth, 0.012], [b, F.glassTop, 0.012], [a, F.glassTop, 0.012], [u0, 0, u1, 1]);
    paint.box(cx, F.plinth + 0.03, 0.09, bw, 0.06, 0.1, { col: bronze }); paint.box(cx, F.glassTop - 0.03, 0.09, bw, 0.06, 0.1, { col: bronze }); paint.box(cx, 2.55, 0.1, bw, 0.05, 0.08, { col: bronze }); // sill, head, transom
    const n = Math.max(2, Math.round(bw / 1.25)); for (let k = 1; k < n; k++) paint.box(a + bw * k / n, (F.plinth + F.glassTop) / 2, 0.1, 0.055, F.glassTop - F.plinth, 0.1, { col: bronze });
    glass.box(cx, (F.plinth + F.glassTop) / 2, 0.1, bw - 0.02, F.glassTop - F.plinth - 0.02, 0.012);
    frost.quad([a, 1.0, 0.108], [b, 1.0, 0.108], [b, 1.45, 0.108], [a, 1.45, 0.108], [0, 0, bw / 1.6, 1]);
    // a low granite planter with clipped shrubs in front of the two inner side bays
    if (Math.abs(cx) < mid && Math.abs(cx) > inner) { const pw = Math.min(1.8, bw - 0.6), pz = 0.62; gran.box(cx, 0.24, pz / 2 + 0.16, pw, 0.48, pz, { col: [1, 1, 1] }); paint.box(cx, 0.47, pz / 2 + 0.16, pw - 0.08, 0.02, pz - 0.08, { col: C('#3b2a1e') }); // soil
      for (let k = 0; k < 4; k++) { const sx = cx - pw / 2 + 0.26 + k * (pw - 0.52) / 3; const geo = new THREE.IcosahedronGeometry(0.2 + (k % 2) * 0.04, 1); leaf.geometry(geo, new THREE.Matrix4().compose(new THREE.Vector3(sx, 0.62, pz / 2 + 0.16), new THREE.Quaternion(), new THREE.Vector3(1, 0.8, 1)), C(k % 2 ? '#3f6b35' : '#4b7a3c')); geo.dispose(); }
      colliders.push([cx, pz / 2 + 0.16, pw + 0.04, pz + 0.04]); }
  }
  // entrance bay: the door (WalkIn) at x = 0 fills ±0.6 with its architrave; glazed sidelights + a transom panel around it
  { const a = -inner + PW / 2, b = inner - PW / 2, dh = 2.42;
    for (const s of [-1, 1]) { const x0 = s * 0.68, x1 = s < 0 ? a : b; const cx = (x0 + x1) / 2, ww = Math.abs(x1 - x0);
      hall.quad(s < 0 ? [x1, 0.15, 0.012] : [x0, 0.15, 0.012], s < 0 ? [x0, 0.15, 0.012] : [x1, 0.15, 0.012], s < 0 ? [x0, F.glassTop, 0.012] : [x1, F.glassTop, 0.012], s < 0 ? [x1, F.glassTop, 0.012] : [x0, F.glassTop, 0.012], [0.4, 0, 0.55, 1]);
      paint.box(s * 0.68, F.glassTop / 2, 0.08, 0.07, F.glassTop, 0.12, { col: bronze }); paint.box(cx, 0.08, 0.08, ww, 0.16, 0.12, { col: bronze }); paint.box(cx, dh + 0.04, 0.08, ww, 0.07, 0.12, { col: bronze });
      glass.box(cx, (0.16 + F.glassTop) / 2, 0.08, ww - 0.02, F.glassTop - 0.18, 0.012); frost.quad(s < 0 ? [x1, 1.0, 0.088] : [x0, 1.0, 0.088], s < 0 ? [x0, 1.0, 0.088] : [x1, 1.0, 0.088], s < 0 ? [x0, 1.45, 0.088] : [x1, 1.45, 0.088], s < 0 ? [x1, 1.45, 0.088] : [x0, 1.45, 0.088], [0, 0, ww / 1.6, 1]); }
    hall.quad([-0.68, dh + 0.08, 0.012], [0.68, dh + 0.08, 0.012], [0.68, F.glassTop, 0.012], [-0.68, F.glassTop, 0.012], [0.45, 0.6, 0.5, 1]); // transom over the door
    paint.box(0, dh + 0.04, 0.08, 1.36, 0.07, 0.12, { col: bronze }); glass.box(0, (dh + 0.08 + F.glassTop) / 2, 0.08, 1.34, F.glassTop - dh - 0.1, 0.012);
    gran.box(0, 0.012, 0.75, 2.6, 0.024, 1.4, { col: [1, 1, 1] }); // polished granite apron at the door (flush with the pavement)
    paint.box(0, 0.026, 0.62, 1.5, 0.006, 0.9, { col: C('#262422') }); // entrance mat well
  }
  // fascia: navy composite band, gold coping, LED wash line under it
  paint.box(0, (F.fasciaY0 + F.fasciaY1) / 2, F.fasciaD / 2, w, F.fasciaY1 - F.fasciaY0, F.fasciaD, { col: navy });
  metal.box(0, F.fasciaY1 + 0.02, F.fasciaD / 2 + 0.01, w + 0.02, 0.04, F.fasciaD + 0.04, { col: C('#a89058') }); metal.box(0, F.fasciaY0 + 0.05, F.fasciaD + 0.004, w, 0.012, 0.006, { col: gold });
  emis.box(0, F.fasciaY0 - 0.004, F.fasciaD - 0.06, w - 0.2, 0.008, 0.03, { col: [1.0, 0.93, 0.8] });
  const fq = (x0, x1, y0_, y1_, uv, z = F.fasciaD + 0.006) => sign.quad([x0, y0_, z], [x1, y0_, z], [x1, y1_, z], [x0, y1_, z], uv);
  { const hS = 0.74, yc = (F.fasciaY0 + F.fasciaY1) / 2 + 0.03, wW = hS * (512 / 192), tot = hS + 0.14 + wW; const xL = -tot / 2; // logo + wordmark centred over the door
    fq(xL, xL + hS, yc - hS / 2, yc + hS / 2, ATLAS.logo); fq(xL + hS + 0.14, xL + tot, yc - hS / 2, yc + hS / 2, ATLAS.wordmark);
    const ax = (bays[1][0] + bays[1][1]) / 2; const aw = 1.9, ah = aw * 96 / 320; fq(ax - aw / 2, ax + aw / 2, yc - ah / 2, yc + ah / 2, ATLAS.atm); // ATM panel over the ATM-lobby bay (left of the door from the street)
    // blade sign at the right end pier: double-faced, projecting over the pavement (well above head height)
    const bx = half - PW / 2, by0 = 2.55, by1 = 3.05, bz0 = PD + 0.08, bz1 = PD + 0.08 + 1.0; metal.box(bx, by1 + 0.06, (bz0 + bz1) / 2, 0.04, 0.04, 1.06, { col: steel }); metal.box(bx, (by0 + by1) / 2, bz0 - 0.04, 0.04, by1 - by0 + 0.12, 0.08, { col: steel });
    paint.box(bx, (by0 + by1) / 2, (bz0 + bz1) / 2, 0.08, by1 - by0, bz1 - bz0, { col: navy });
    sign.quad([bx + 0.042, by0, bz0], [bx + 0.042, by0, bz1], [bx + 0.042, by1, bz1], [bx + 0.042, by1, bz0], ATLAS.blade); sign.quad([bx - 0.042, by0, bz1], [bx - 0.042, by0, bz0], [bx - 0.042, by1, bz0], [bx - 0.042, by1, bz1], ATLAS.blade);
    // plaques on the two entrance piers (eye height): banking hours (left from the street) · branch name (right)
    const pl = (px, uv, pw, ph) => sign.quad([px - pw / 2, 1.45 - ph / 2, PD + 0.004], [px + pw / 2, 1.45 - ph / 2, PD + 0.004], [px + pw / 2, 1.45 + ph / 2, PD + 0.004], [px - pw / 2, 1.45 + ph / 2, PD + 0.004], uv);
    pl(-inner, ATLAS.hours, 0.46, 0.23); pl(inner, ATLAS.plaque, 0.5, 0.15);
    for (const px of [-inner, inner]) metal.box(px, 1.45, PD + 0.001, px < 0 ? 0.49 : 0.53, px < 0 ? 0.26 : 0.18, 0.004, { col: C('#9c8a5c') }); // brass plaque frames
  }
  // canopy over the entrance bay: slab, navy edge band + gold line, downlights, tie rods to the fascia
  { const cw = 2 * inner + 0.6, cy = F.canopyY, cd = F.canopyD; paint.box(0, cy + 0.07, cd / 2, cw, 0.14, cd, { col: C('#ecebe6') });
    paint.box(0, cy + 0.07, cd + 0.01, cw + 0.02, 0.16, 0.02, { col: navy }); metal.box(0, cy + 0.07, cd + 0.022, cw, 0.012, 0.004, { col: gold });
    for (const s of [-1, 1]) paint.box(s * (cw / 2 + 0.01), cy + 0.07, cd / 2, 0.02, 0.16, cd + 0.02, { col: navy });
    for (const lx of [-1.2, 0, 1.2]) { emis.cylinder(lx, cy - 0.006, cd * 0.55, 0.08, 0.08, 0.008, 14, { col: [1.0, 0.95, 0.85] }); metal.cylinder(lx, cy - 0.002, cd * 0.55, 0.1, 0.1, 0.006, 14, { col: steel }); }
    for (const s of [-1, 1]) { const ax = s * (cw / 2 - 0.3); const p0 = new THREE.Vector3(ax, cy + 0.14, cd - 0.08), p1 = new THREE.Vector3(ax, F.fasciaY0 + 0.25, F.fasciaD); const len = p0.distanceTo(p1); const geo = new THREE.CylinderGeometry(0.012, 0.012, len, 6);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()); metal.geometry(geo, new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)), steel); geo.dispose(); }
  }
  // CCTV dome under the fascia, right of the canopy
  metal.cylinder(inner + 0.5, F.fasciaY0 - 0.02, 0.3, 0.07, 0.07, 0.04, 12, { col: C('#e8e8e4') }); paint.cylinder(inner + 0.5, F.fasciaY0 - 0.08, 0.3, 0.06, 0.05, 0.06, 12, { col: C('#202224') });
  // materials: the scoped base materials (Studio-editable as "Ceylon Meridian Bank.*") + the bank's own canvas surfaces
  const atlas = brandAtlas(), hallT = hallBackdrop(), band = frostBand();
  const signMat = new THREE.MeshStandardMaterial({ name: 'Ceylon Meridian Bank · signs', map: atlas || null, color: atlas ? 0xffffff : new THREE.Color(CMB.navy), roughness: 0.45, metalness: 0.05, emissive: 0xffffff, emissiveMap: atlas || null, emissiveIntensity: atlas ? 0.25 : 0 });
  const hallMat = new THREE.MeshStandardMaterial({ name: 'Ceylon Meridian Bank · hall seen through the glass', map: hallT || null, color: hallT ? 0xffffff : 0x8a8478, roughness: 0.9, emissive: 0xffffff, emissiveMap: hallT || null, emissiveIntensity: hallT ? 0.18 : 0 });
  const frostMat = new THREE.MeshStandardMaterial({ name: 'Ceylon Meridian Bank · frosted glass band', map: band || null, color: 0xffffff, transparent: true, opacity: band ? 1 : 0.5, alphaTest: 0.02, roughness: 0.6, depthWrite: false });
  const granMat = kitMaterial('marbleDark', KIT.marbleDark).clone(); granMat.name = 'Ceylon Meridian Bank · black granite'; /* 77th: its own (the kit's black marble is shared city-wide) */ const shrubMat = new THREE.MeshStandardMaterial({ name: 'Ceylon Meridian Bank · planter shrubs', vertexColors: true, roughness: 0.85, flatShading: true });
  const mats = Object.assign({}, MAT, { cmbSign: signMat, cmbHall: hallMat, cmbFrost: frostMat, cmbGranite: granMat, cmbShrub: shrubMat });
  for (const m of mb.toMeshes(mats, { cast: true, receive: true })) { if (m.material === frostMat || m.material === signMat || m.material === hallMat) m.castShadow = false; if (m.material === frostMat) m.renderOrder = 2; g.add(m); }
  g.position.set(fx, y0, fz); g.rotation.y = th + Math.PI; g.updateMatrixWorld(true);
  const cols = colliders.map(([cx, cz, sx, sz]) => { const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => new THREE.Vector3(cx + u * sx / 2, 0, cz + v * sz / 2).applyMatrix4(g.matrixWorld));
    return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)), h: y0 + 1.0, kind: 'wall' }; });
  let lastK = -1;
  const update = (night) => { const k = Math.round(Math.max(0, Math.min(1, night)) * 20) / 20; if (k === lastK) return; lastK = k; if (atlas) signMat.emissiveIntensity = 0.25 + 0.75 * k; if (hallT) hallMat.emissiveIntensity = 0.18 + 0.55 * k; };
  // 77th: the 2048² surfaces (BankTex.js) — swapped in on the loading screen once the texture workers have finished (the front
  // is built with the city, before they start). A material whose map a Texture Studio rule has already replaced is left alone.
  const SURF = [[granMat, 'cmbBlackGranite', 0], ['concrete', 'cmbLimestone', 0.5], ['paint', 'cmbPaint', 0], ['metal', 'cmbSteel', 0]];
  const built = SURF.map(([m]) => { const mm = typeof m === 'string' ? MAT['Ceylon Meridian Bank.' + m] : m; return mm && mm !== MAT[m] ? [mm, mm.map] : null; });
  let hi = false; const apply2K = () => { if (hi) return []; hi = true; const out = [];
    SURF.forEach(([, key, nrm], i) => { const b = built[i]; if (!b) return; const [m, was] = b; if (m.map !== was) return; const t = bankTex(key); if (!t) return;
      m.map = t; out.push(t);
      if (nrm) { const n = bankNormal(key); if (n) { m.normalMap = n; m.normalScale.set(nrm, nrm); out.push(n); } } m.needsUpdate = true; });
    return out; };
  return { group: g, colliders: cols, update, width: w, piers, bays, signMat, hallMat, apply2K };
}
