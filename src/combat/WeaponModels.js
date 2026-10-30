// Original procedural weapon models (no real-world brand geometry). Every model is built around the right-hand GRIP point:
// origin = grip, +z = barrel direction, +y = up. userData exposes the hold points the IK uses (grip / support), the muzzle,
// and the moving parts used by animations (magazine, slide or bolt).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let MATS = null;
export function weaponMaterials() {
  if (MATS) return MATS;
  const S = (c, r, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  MATS = {
    metal: S('#2b2d31', 0.38, 0.75), steel: S('#5d6168', 0.3, 0.85), poly: S('#1b1c1e', 0.72), polyTan: S('#9c8763', 0.68), polyOlive: S('#4a4d36', 0.7),
    wood: S('#6a4123', 0.55), woodDark: S('#4a2c17', 0.6), rubber: S('#121212', 0.9), brass: S('#b48a3c', 0.35, 0.9),
    lens: new THREE.MeshStandardMaterial({ color: '#0d1a26', roughness: 0.05, metalness: 0.6, emissive: '#06121c' }),
    dot: new THREE.MeshBasicMaterial({ color: '#ff3b2f' }),
  };
  return MATS;
}

// tiny geometry helpers -----------------------------------------------------------------------------------------------
const E = new THREE.Euler(); const Q = new THREE.Quaternion(); const M = new THREE.Matrix4(); const V = new THREE.Vector3(); const ONE = new THREE.Vector3(1, 1, 1);
function place(g, x, y, z, rx = 0, ry = 0, rz = 0) { M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), ONE); g.applyMatrix4(M); return g; }
const box = (w, h, d, x, y, z, rx, ry, rz) => place(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
const cylZ = (r, len, x, y, z, seg = 14, r2 = r) => place(new THREE.CylinderGeometry(r2, r, len, seg), x, y, z, Math.PI / 2, 0, 0); // axis along +z, r at -z end, r2 at +z end
const cylX = (r, len, x, y, z, seg = 10) => place(new THREE.CylinderGeometry(r, r, len, seg), x, y, z, 0, 0, Math.PI / 2);
const cylY = (r, len, x, y, z, seg = 10) => place(new THREE.CylinderGeometry(r, r, len, seg), x, y, z);
const sph = (r, x, y, z) => place(new THREE.SphereGeometry(r, 8, 6), x, y, z);

class Parts { // collects geometry per material, merges into one mesh per material
  constructor() { this.by = new Map(); }
  add(mat, ...gs) { if (!this.by.has(mat)) this.by.set(mat, []); for (const g of gs) { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); this.by.get(mat).push(n); } return this; }
  build(group) { for (const [mat, gs] of this.by) { const m = new THREE.Mesh(mergeGeometries(gs), mat); m.castShadow = true; group.add(m); } return group; }
}

// ---------------------------------------------------------------------------------------------------------------------
function trigger(P, m, z = 0.03, y = 0.02) { // trigger + guard
  P.add(m.metal, box(0.005, 0.004, 0.05, 0, y - 0.012, z + 0.006), box(0.005, 0.026, 0.005, 0, y, z + 0.03));
  P.add(m.steel, box(0.004, 0.016, 0.004, 0, y - 0.002, z + 0.004, -0.25));
}

function pistol(def) {
  const m = weaponMaterials(); const g = new THREE.Group(); const P = new Parts(); const k = def.size; // compact 0.86 · service 1 · heavy 1.12
  const L = 0.185 * k, bore = 0.062 * k, front = L - 0.048;
  // frame + dust cover + grip (angled), checkering panels, beavertail
  P.add(m.poly, box(0.028 * k, 0.024 * k, L * 0.82, 0, 0.034 * k, front - L * 0.41 - 0.01), box(0.03 * k, 0.108 * k, 0.046 * k, 0, -0.012, -0.012, -0.27), box(0.026, 0.012, 0.03, 0, 0.046 * k, -0.045 * k, -0.6));
  P.add(m.rubber, box(0.031 * k, 0.07 * k, 0.03 * k, 0, -0.016, -0.014, -0.27));
  trigger(P, m, 0.012, 0.022 * k);
  if (def.id === 'heavy') P.add(m.steel, box(0.008, 0.014, 0.01, 0, 0.07 * k, -0.06, 0.5)); // exposed hammer
  P.build(g);
  // slide (moves on recoil / rack): body, serrations, sights, ejection port, barrel crown
  const slide = new THREE.Group(); const S = new Parts();
  S.add(def.id === 'compact' ? m.metal : m.steel, box(0.03 * k, 0.03 * k, L, 0, bore, front - L / 2));
  S.add(m.metal, ...[0, 1, 2, 3, 4].map((i) => box(0.031 * k, 0.022 * k, 0.003, 0, bore, front - L + 0.012 + i * 0.007)));
  S.add(m.poly, box(0.004, 0.007, 0.006, 0, bore + 0.018 * k, front - 0.01), box(0.014, 0.007, 0.006, 0, bore + 0.018 * k, front - L + 0.012));
  S.add(m.metal, box(0.031 * k, 0.012, 0.035 * k, 0.001, bore + 0.006, front - L * 0.45));
  S.add(m.rubber, cylZ(0.0065 * k, 0.004, 0, bore, front + 0.001, 10));
  S.build(slide); g.add(slide);
  // magazine (drops out of the grip on reload)
  const mag = new THREE.Group(); const Mg = new Parts(); Mg.add(m.metal, box(0.022 * k, 0.095 * k, 0.034 * k, 0, -0.012, -0.01, -0.27)); Mg.add(m.poly, box(0.032 * k, 0.01, 0.05 * k, 0, -0.064 * k, -0.025 * k, -0.27)); Mg.build(mag); g.add(mag);
  g.userData = { muzzle: new THREE.Vector3(0, bore, front + 0.006), support: new THREE.Vector3(0.024, -0.03, 0.004), magWell: new THREE.Vector3(0, -0.075, -0.03), rack: new THREE.Vector3(0, bore + 0.02, front - L + 0.02), mag, slide, eject: new THREE.Vector3(-0.02, bore + 0.01, front - L * 0.45), stockZ: 0, sight: new THREE.Vector3(0, bore + 0.018 * k + 0.0045, front - L + 0.012) }; // sight: top of the rear notch, on the line to the front post
  return g;
}

function rifle(def) {
  const m = weaponMaterials(); const g = new THREE.Group(); const P = new Parts(); const id = def.id;
  const furn = id === 'assault' ? m.wood : id === 'battle' ? m.polyOlive : m.poly; const bore = 0.072;
  const hgLen = id === 'carbine' ? 0.25 : id === 'assault' ? 0.24 : 0.3, bLen = id === 'carbine' ? 0.3 : id === 'assault' ? 0.36 : 0.42;
  const rx0 = -0.07, rx1 = 0.22; // receiver span
  // receiver (upper + lower), ejection port, rail, charging handle, dust cover ribs
  P.add(m.metal, box(0.048, 0.042, rx1 - rx0, 0, bore + 0.002, (rx0 + rx1) / 2), box(0.042, 0.04, rx1 - rx0 - 0.04, 0, bore - 0.036, (rx0 + rx1) / 2 + 0.01));
  P.add(m.poly, box(0.03, 0.009, rx1 - rx0 - 0.01, 0, bore + 0.027, (rx0 + rx1) / 2), ...Array.from({ length: 9 }, (_, i) => box(0.032, 0.004, 0.01, 0, bore + 0.033, rx0 + 0.02 + i * 0.03)));
  P.add(m.steel, box(0.002, 0.016, 0.05, -0.0245, bore + 0.004, 0.09));
  // handguard: octagon (carbine), wood slab (assault), long vented (battle)
  if (id === 'assault') P.add(furn, box(0.05, 0.048, hgLen, 0, bore - 0.004, rx1 + hgLen / 2), box(0.042, 0.02, hgLen * 0.8, 0, bore + 0.03, rx1 + hgLen * 0.45));
  else { P.add(furn, cylZ(0.029, hgLen, 0, bore, rx1 + hgLen / 2, 8)); P.add(m.metal, ...Array.from({ length: 5 }, (_, i) => box(0.06, 0.012, 0.022, 0, bore, rx1 + 0.03 + i * (hgLen - 0.06) / 4))); }
  // barrel, gas block, muzzle device (flash hider / brake)
  P.add(m.metal, cylZ(0.0095, bLen, 0, bore, rx1 + bLen / 2, 12), box(0.024, 0.03, 0.03, 0, bore + 0.006, rx1 + hgLen + 0.02));
  P.add(m.steel, cylZ(0.014, 0.055, 0, bore, rx1 + bLen + 0.025, 8));
  if (id === 'battle') P.add(m.steel, box(0.04, 0.016, 0.05, 0, bore, rx1 + bLen + 0.03));
  // pistol grip + trigger
  P.add(m.poly, box(0.03, 0.095, 0.042, 0, -0.008, -0.004, -0.36)); trigger(P, m, 0.02, 0.03);
  // stock
  if (id === 'carbine') { P.add(m.metal, cylZ(0.013, 0.2, 0, bore - 0.004, rx0 - 0.1, 10)); P.add(m.poly, box(0.04, 0.05, 0.16, 0, bore - 0.018, rx0 - 0.15), box(0.042, 0.12, 0.028, 0, bore - 0.03, rx0 - 0.22)); P.add(m.rubber, box(0.044, 0.124, 0.01, 0, bore - 0.03, rx0 - 0.238)); }
  else if (id === 'assault') { P.add(furn, box(0.04, 0.05, 0.12, 0, bore - 0.01, rx0 - 0.06, 0.06), box(0.042, 0.1, 0.13, 0, bore - 0.03, rx0 - 0.18, 0.16)); P.add(m.rubber, box(0.044, 0.11, 0.012, 0, bore - 0.04, rx0 - 0.25, 0.16)); }
  else { P.add(furn, box(0.046, 0.06, 0.16, 0, bore - 0.01, rx0 - 0.08), box(0.048, 0.125, 0.12, 0, bore - 0.03, rx0 - 0.2), box(0.03, 0.03, 0.12, 0, bore + 0.03, rx0 - 0.17)); P.add(m.rubber, box(0.05, 0.13, 0.014, 0, bore - 0.032, rx0 - 0.266)); }
  // sights / optic
  if (id === 'carbine') { P.add(m.metal, box(0.03, 0.03, 0.05, 0, bore + 0.045, 0.06), cylZ(0.017, 0.05, 0, bore + 0.062, 0.06, 12)); P.add(m.lens, cylZ(0.0145, 0.052, 0, bore + 0.062, 0.06, 12)); }
  else if (id === 'assault') { P.add(m.metal, box(0.006, 0.035, 0.01, 0, bore + 0.03, rx1 + hgLen + 0.02), box(0.02, 0.018, 0.03, 0, bore + 0.035, 0.0)); }
  else { P.add(m.metal, box(0.026, 0.026, 0.09, 0, bore + 0.045, 0.06), cylZ(0.016, 0.1, 0, bore + 0.066, 0.06, 12)); P.add(m.lens, cylZ(0.0135, 0.102, 0, bore + 0.066, 0.06, 12)); P.add(m.metal, box(0.006, 0.03, 0.01, 0, bore + 0.03, rx1 + hgLen - 0.01)); }
  // sling swivels
  P.add(m.steel, box(0.004, 0.012, 0.02, -0.022, bore - 0.03, rx0 - 0.05), box(0.004, 0.012, 0.02, 0, bore - 0.03, rx1 + hgLen - 0.04));
  P.build(g);
  // magazine: curved stack for carbine/assault, straight box for battle
  const mag = new THREE.Group(); const Mg = new Parts(); const mz = 0.075;
  if (id === 'battle') Mg.add(m.metal, box(0.03, 0.11, 0.07, 0, -0.03, mz + 0.01, 0.05));
  else Mg.add(id === 'assault' ? m.polyTan : m.metal, box(0.026, 0.06, 0.062, 0, -0.01, mz, 0.08), box(0.026, 0.06, 0.06, 0, -0.064, mz + 0.012, 0.28), box(0.028, 0.012, 0.064, 0, -0.096, mz + 0.026, 0.28));
  Mg.build(mag); g.add(mag);
  const bolt = new THREE.Group(); const B = new Parts(); B.add(m.steel, box(0.008, 0.012, 0.02, -0.03, bore + 0.004, 0.03)); B.build(bolt); g.add(bolt);
  const muzZ = rx1 + bLen + 0.055;
  g.userData = { muzzle: new THREE.Vector3(0, bore, muzZ), support: new THREE.Vector3(0.0, bore - 0.04, rx1 + hgLen * 0.55), magWell: new THREE.Vector3(0, -0.05, mz), rack: new THREE.Vector3(-0.035, bore + 0.01, 0.03), mag, slide: bolt, eject: new THREE.Vector3(-0.028, bore + 0.005, 0.09), stockZ: id === 'carbine' ? rx0 - 0.243 : id === 'assault' ? rx0 - 0.256 : rx0 - 0.273, sight: new THREE.Vector3(0, bore + 0.062, 0.02) };
  return g;
}

function scope(P, m, len, r, y, z) { // tube, bells, turrets, rings, lenses
  P.add(m.metal, cylZ(r, len, 0, y, z, 16), cylZ(r * 1.25, 0.05, 0, y, z + len / 2 + 0.02, 16, r * 1.65), cylZ(r * 1.45, 0.06, 0, y, z - len / 2 - 0.02, 16, r * 1.2), cylY(r * 0.75, 0.03, 0, y + r + 0.012, z), cylX(r * 0.75, 0.03, r + 0.012, y, z));
  P.add(m.poly, box(0.024, 0.026, 0.022, 0, y - r - 0.006, z - len * 0.28), box(0.024, 0.026, 0.022, 0, y - r - 0.006, z + len * 0.28));
  P.add(m.lens, cylZ(r * 1.55, 0.004, 0, y, z + len / 2 + 0.047, 16), cylZ(r * 1.15, 0.004, 0, y, z - len / 2 - 0.052, 16));
}

function sniper(def) {
  const m = weaponMaterials(); const g = new THREE.Group(); const P = new Parts(); const id = def.id; const bore = 0.07;
  let support, stockZ, muzZ, mag = new THREE.Group(), bolt = new THREE.Group(); const Mg = new Parts(), B = new Parts();
  if (id === 'bolt') { // classic wooden stock bolt-action
    P.add(m.wood, box(0.05, 0.05, 0.44, 0, bore - 0.028, 0.12), box(0.042, 0.035, 0.18, 0, bore - 0.034, 0.42), box(0.046, 0.12, 0.2, 0, bore - 0.05, -0.2, 0.12), box(0.04, 0.06, 0.12, 0, bore - 0.03, -0.06, 0.25));
    P.add(m.woodDark, box(0.031, 0.08, 0.046, 0, -0.012, -0.005, -0.32)); P.add(m.rubber, box(0.048, 0.125, 0.016, 0, bore - 0.06, -0.305, 0.12));
    P.add(m.metal, cylZ(0.018, 0.22, 0, bore, 0.08, 14), cylZ(0.011, 0.6, 0, bore, 0.48, 12, 0.0085)); trigger(P, m, 0.025, 0.028);
    scope(P, m, 0.3, 0.015, bore + 0.06, 0.07); muzZ = 0.78; support = new THREE.Vector3(0, bore - 0.055, 0.32); stockZ = -0.31;
    Mg.add(m.steel, box(0.03, 0.012, 0.07, 0, bore - 0.056, 0.08)); B.add(m.steel, cylX(0.005, 0.06, -0.035, bore + 0.006, -0.0), sph(0.011, -0.065, bore + 0.006, 0.0));
  } else if (id === 'semi') { // gas-operated marksman rifle on a modern receiver
    P.add(m.metal, box(0.05, 0.044, 0.32, 0, bore + 0.002, 0.08), box(0.044, 0.042, 0.26, 0, bore - 0.036, 0.09));
    P.add(m.poly, cylZ(0.031, 0.36, 0, bore, 0.42, 8), box(0.03, 0.009, 0.66, 0, bore + 0.028, 0.25)); P.add(m.metal, cylZ(0.0105, 0.5, 0, bore, 0.55, 12)); P.add(m.steel, cylZ(0.015, 0.06, 0, bore, 0.82, 8));
    P.add(m.poly, box(0.03, 0.095, 0.042, 0, -0.008, -0.004, -0.36), box(0.046, 0.06, 0.16, 0, bore - 0.012, -0.15), box(0.048, 0.13, 0.11, 0, bore - 0.032, -0.25), box(0.03, 0.03, 0.12, 0, bore + 0.03, -0.2)); P.add(m.rubber, box(0.05, 0.135, 0.014, 0, bore - 0.034, -0.31)); trigger(P, m, 0.02, 0.03);
    P.add(m.metal, box(0.008, 0.008, 0.16, 0.012, bore - 0.03, 0.5), box(0.008, 0.008, 0.16, -0.012, bore - 0.03, 0.5)); // folded bipod legs
    scope(P, m, 0.3, 0.016, bore + 0.064, 0.08); muzZ = 0.85; support = new THREE.Vector3(0, bore - 0.035, 0.36); stockZ = -0.317;
    Mg.add(m.metal, box(0.03, 0.09, 0.075, 0, -0.03, 0.09, 0.04)); B.add(m.steel, box(0.008, 0.012, 0.02, -0.03, bore + 0.004, 0.02));
  } else { // precision rifle: tan chassis, fluted heavy barrel, big optic, skeleton stock, deployed-ready bipod
    P.add(m.polyTan, box(0.056, 0.06, 0.5, 0, bore - 0.02, 0.18), box(0.04, 0.02, 0.3, 0, bore - 0.055, 0.35));
    P.add(m.metal, box(0.04, 0.04, 0.24, 0, bore + 0.01, 0.06), box(0.03, 0.009, 0.7, 0, bore + 0.034, 0.24)); P.add(m.metal, cylZ(0.0135, 0.62, 0, bore, 0.62, 10)); P.add(m.steel, box(0.04, 0.026, 0.07, 0, bore, 0.95), ...[0, 1, 2].map((i) => box(0.042, 0.006, 0.008, 0, bore, 0.93 + i * 0.02)));
    P.add(m.polyTan, box(0.032, 0.095, 0.045, 0, -0.008, -0.004, -0.3)); P.add(m.metal, box(0.012, 0.02, 0.26, 0, bore - 0.01, -0.16), box(0.012, 0.02, 0.24, 0, bore - 0.09, -0.17), box(0.03, 0.03, 0.12, 0, bore + 0.03, -0.18)); P.add(m.rubber, box(0.05, 0.14, 0.018, 0, bore - 0.05, -0.3)); trigger(P, m, 0.02, 0.03);
    P.add(m.metal, box(0.009, 0.009, 0.2, 0.014, bore - 0.07, 0.48), box(0.009, 0.009, 0.2, -0.014, bore - 0.07, 0.48));
    scope(P, m, 0.36, 0.018, bore + 0.07, 0.07); muzZ = 0.99; support = new THREE.Vector3(0, bore - 0.06, 0.3); stockZ = -0.31;
    Mg.add(m.metal, box(0.032, 0.07, 0.08, 0, -0.022, 0.09)); B.add(m.steel, cylX(0.005, 0.06, -0.035, bore + 0.01, -0.02), sph(0.012, -0.065, bore + 0.01, -0.02));
  }
  P.build(g); Mg.build(mag); B.build(bolt); g.add(mag); g.add(bolt);
  g.userData = { muzzle: new THREE.Vector3(0, bore, muzZ), support, magWell: new THREE.Vector3(0, -0.05, 0.09), rack: new THREE.Vector3(-0.06, bore + 0.006, -0.01), mag, slide: bolt, bolt, eject: new THREE.Vector3(-0.03, bore + 0.01, 0.06), stockZ, sight: new THREE.Vector3(0, bore + 0.064, 0) };
  return g;
}

export function buildWeaponModel(def) { const g = def.cls === 'pistol' ? pistol(def) : def.cls === 'rifle' ? rifle(def) : sniper(def); g.name = 'weapon-' + def.id; return g; }
