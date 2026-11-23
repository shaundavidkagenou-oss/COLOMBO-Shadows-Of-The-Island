// 89th — the engine bay under a roadside mechanic's raised bonnet, modelled.
//
// Before: one flat quad painted with a picture of an engine (RearCompartment atlas cell 'bay') over the closed bonnet, under a
// plain flat panel. Now a real (if compact) transverse inline-four bay as geometry, shared by every car and built once:
//   · engine: cylinder block + head (cast aluminium), crinkle-black rocker cover with ribs and lettering, four coil packs on
//     their loom, oil filler cap, dipstick loop; intake plenum with four curved runners and the throttle body; the exhaust
//     manifold's ribbed heat shield; alternator, pulleys and the ribbed accessory belt; an engine mount
//   · air box with clips and its corrugated intake hose to the throttle body, the snorkel to the front
//   · battery (case, label, terminals with their red / black covers and cables, hold-down bar and J-bolts)
//   · radiator top tank, cap, upper hose to the thermostat housing, fan shroud; coolant expansion tank (translucent, pink
//     coolant at its level marks), washer-bottle neck and blue cap, brake booster, master cylinder and its fluid reservoir
//   · fuse / relay box, wiring looms, heater hoses, A/C lines, strut towers (body colour, three studs and the top nut),
//     cowl louvres, slam panel with the latch, the inner wing lips (body colour), the dark bay floor between it all
//   · the bonnet: the outer skin with the inner frame (body colour, perimeter + cross ribs), the insulation pad, the latch
//     striker, and a prop rod that swings up from the slam panel into its slot as the bonnet reaches the top.
// Materials: ONE textured standard material (1024² colour atlas + 1024² roughness / metalness atlas, drawn once on the loading
// screen) for everything that is not body colour, plus the vehicles' own paint material (vpaint: already compiled — the parts in
// body colour carry the car's colour as vertex colour, a small per-colour geometry copy). 5 draw calls with the bonnet up, 0
// otherwise. Everything here is compiled + uploaded on the loading screen (bayWarmGroup → UnitPool.warmGroup): opening a bonnet
// creates no program and uploads no texture.
// Layout space: x across the car, z from the hinge (firewall, 0) to the slam panel (L0), y up from the closed bonnet's surface
// (the bonnet's slope is the group's rotation). W0 × L0 is the nominal bay; each car's bay is that scaled to its bonnet.
// Height rule: nothing at distance s from the hinge stands taller than 0.24·s — the bay shows from a third open (bonnetStep),
// when the rising panel already clears that line, so no part ever pokes through the panel.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vehicleMaterials } from '../vehicles/VehicleModels.js';

export const W0 = 1.3, L0 = 1.1;
export const BAY_SHOW = 0.34; // bonnet k from which the bay is drawn (see the height rule)
// ---------------------------------------------------------------- the atlas (8 × 8 cells of 128 px)
const N = 1024, CELL = 128; const RG = {}; // name → [u0, v0, u1, v1]
let MAP = null, ORM = null;
function rgn(name, cx, cy, cw, ch) { const pad = 2 / N; RG[name] = [cx / 8 + pad, 1 - (cy + ch) / 8 + pad, (cx + cw) / 8 - pad, 1 - cy / 8 - pad]; return [cx * CELL, cy * CELL, cw * CELL, ch * CELL]; }
const LAYOUT = { alu: [0, 0, 2, 2], rocker: [2, 0, 4, 2], plastic: [6, 0, 2, 2], floor: [0, 2, 2, 2], pad: [2, 2, 2, 2], battery: [4, 2, 2, 2], fuse: [6, 2, 2, 1], label: [6, 3, 2, 1],
  rubber: [0, 4, 1, 1], corr: [1, 4, 1, 1], radiator: [2, 4, 1, 1], shield: [3, 4, 1, 1], metal: [4, 4, 1, 1], cap: [5, 4, 1, 1], belt: [6, 4, 1, 1], plain: [7, 4, 1, 1],
  resCool: [0, 5, 1, 1], resBrake: [1, 5, 1, 1], cowl: [2, 5, 2, 1], iron: [4, 5, 1, 1], coil: [5, 5, 1, 1], terminal: [6, 5, 1, 1], foil: [7, 5, 1, 1] };
function makeAtlas() {
  if (MAP) return; const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d');
  const o = document.createElement('canvas'); o.width = o.height = N; const q = o.getContext('2d'); // G = roughness, B = metalness
  q.fillStyle = 'rgb(255,200,0)'; q.fillRect(0, 0, N, N);
  let seed = 1234567; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const speck = (x, y, w, h, n, a, light = false, s = 1.5) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${rnd() * a})`; g.fillRect(x + rnd() * w, y + rnd() * h, s * (0.5 + rnd()), s * (0.5 + rnd())); } };
  const rough = (x, y, w, h, r, m, vary = 0.06) => { q.fillStyle = `rgb(0,${Math.round(r * 255)},${Math.round(m * 255)})`; q.fillRect(x, y, w, h); for (let i = 0; i < w * h / 60; i++) { const d = (rnd() - 0.5) * vary * 2; q.fillStyle = `rgb(0,${Math.round(Math.min(1, Math.max(0.03, r + d)) * 255)},${Math.round(m * 255)})`; q.fillRect(x + rnd() * w, y + rnd() * h, 2, 2); } };
  const grad = (x, y, w, h, a) => { const G = g.createLinearGradient(0, y, 0, y + h); G.addColorStop(0, `rgba(0,0,0,${a})`); G.addColorStop(0.25, 'rgba(0,0,0,0)'); G.addColorStop(0.75, 'rgba(0,0,0,0)'); G.addColorStop(1, `rgba(0,0,0,${a})`); g.fillStyle = G; g.fillRect(x, y, w, h); };
  const font = (wt, px) => `${wt} ${px}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
  const R = (name, fn) => { const [cx, cy, cw, ch] = LAYOUT[name]; const [x, y, w, h] = rgn(name, cx, cy, cw, ch); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y); q.save(); q.beginPath(); q.rect(x, y, w, h); q.clip(); q.translate(x, y); fn(w, h); g.restore(); q.restore(); };
  // cast aluminium (head, block, plenum, runners, master cylinder): sand-cast grain, oily grime toward the edges
  R('alu', (w, h) => { g.fillStyle = '#9a9c9a'; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 9000, 0.22, false, 1.2); speck(0, 0, w, h, 4000, 0.2, true, 1.2); for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(60,48,30,${0.05 + rnd() * 0.1})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 10 + rnd() * 40, 6 + rnd() * 20, rnd() * 3, 0, 7); g.fill(); } grad(0, 0, w, h, 0.35); rough(0, 0, w, h, 0.58, 0.75, 0.1); });
  // rocker cover: black crinkle paint, raised polished ribs, the cam-cover lettering
  R('rocker', (w, h) => { g.fillStyle = '#16171a'; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 16000, 0.35, true, 1); speck(0, 0, w, h, 8000, 0.4, false, 1);
    rough(0, 0, w, h, 0.62, 0.15, 0.12); for (let i = 0; i < 9; i++) { const x = 34 + i * (w - 68) / 8; g.fillStyle = '#8e9196'; g.fillRect(x - 4, 14, 8, h * 0.28); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x - 4, 14, 2, h * 0.28); q.fillStyle = 'rgb(0,80,230)'; q.fillRect(x - 4, 14, 8, h * 0.28); }
    g.fillStyle = '#c3c6ca'; g.font = font('800', 46); g.textAlign = 'center'; g.fillText('DOHC  16 VALVE', w / 2, h * 0.66); q.fillStyle = 'rgb(0,90,230)'; q.font = font('800', 46); q.textAlign = 'center'; q.fillText('DOHC  16 VALVE', w / 2, h * 0.66);
    g.fillStyle = '#b8231c'; g.fillRect(w * 0.2, h * 0.73, w * 0.6, 6); g.fillStyle = '#d0d3d6'; g.font = font('600', 22); g.fillText('TWIN CAM  ·  EFI  ·  1.5', w / 2, h * 0.88); for (const x of [20, w - 20]) for (const y of [20, h - 20]) { g.fillStyle = '#8a8d90'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.fillStyle = '#3a3c3e'; g.fillRect(x - 5, y - 1, 10, 2); } });
  // black textured plastic (air box, fuse box sides, shroud, tanks, covers)
  R('plastic', (w, h) => { g.fillStyle = '#1b1c1e'; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 12000, 0.25, true, 1); speck(0, 0, w, h, 6000, 0.3, false, 1); g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, h - 20); rough(0, 0, w, h, 0.7, 0, 0.08); });
  // the bay floor / depths: near-black, oil-stained, lighter dust at the centre
  R('floor', (w, h) => { const G = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7); G.addColorStop(0, '#2a2725'); G.addColorStop(1, '#0d0c0b'); g.fillStyle = G; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 9000, 0.3, false, 2); speck(0, 0, w, h, 2500, 0.08, true, 1.5); for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.25})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 8 + rnd() * 30, 5 + rnd() * 14, rnd() * 3, 0, 7); g.fill(); } rough(0, 0, w, h, 0.85, 0.1, 0.1); });
  // bonnet insulation pad: black pressed felt, dimple rows, clip dots
  R('pad', (w, h) => { g.fillStyle = '#1e1e1f'; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 14000, 0.3, true, 1); for (let y = 16; y < h; y += 22) for (let x = 16 + ((y / 22) % 2) * 11; x < w; x += 22) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.arc(x - 1, y - 1, 3, 0, 7); g.fill(); }
    for (const [x, y] of [[24, 24], [w - 24, 24], [24, h - 24], [w - 24, h - 24], [w / 2, 24], [w / 2, h - 24]]) { g.fillStyle = '#3a3a3c'; g.beginPath(); g.arc(x, y, 10, 0, 7); g.fill(); g.fillStyle = '#121212'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } rough(0, 0, w, h, 0.95, 0, 0.04); });
  // battery: dark case, label with the ratings, vent strip, polarity marks
  R('battery', (w, h) => { g.fillStyle = '#222428'; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 6000, 0.2, true, 1); g.fillStyle = '#e8eaec'; g.fillRect(18, 30, w - 36, h * 0.52); g.fillStyle = '#1f5fbf'; g.fillRect(18, 30, w - 36, 40); g.fillStyle = '#ffd31a'; g.fillRect(18, 70, w - 36, 8);
    g.fillStyle = '#fff'; g.font = font('800', 30); g.textAlign = 'left'; g.fillText('LANKA POWER', 30, 62); g.fillStyle = '#1c2a3a'; g.font = font('700', 34); g.fillText('12V  45Ah', 30, 116); g.font = font('600', 22); g.fillText('400 CCA (EN)   MF   NS60L', 30, 146); g.fillText('MAINTENANCE FREE · DO NOT OPEN', 30, 172);
    g.fillStyle = '#2c9a48'; g.beginPath(); g.arc(w - 60, 120, 18, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = font('700', 14); g.textAlign = 'center'; g.fillText('OK', w - 60, 125);
    g.fillStyle = '#121315'; g.fillRect(18, h * 0.76, w - 36, 16); for (let x = 30; x < w - 30; x += 22) { g.fillStyle = '#2d2f33'; g.beginPath(); g.arc(x, h * 0.76 + 8, 5, 0, 7); g.fill(); }
    g.fillStyle = '#d33'; g.font = font('800', 40); g.fillText('+', 40, h - 18); g.fillStyle = '#ddd'; g.fillText('−', w - 40, h - 18); rough(0, 0, w, h, 0.55, 0, 0.06); q.fillStyle = 'rgb(0,110,0)'; q.fillRect(18, 30, w - 36, h * 0.52); });
  // fuse / relay box lid
  R('fuse', (w, h) => { g.fillStyle = '#191a1c'; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 6000, 0.25, true, 1); g.strokeStyle = '#2b2c2f'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16); g.fillStyle = '#34363a'; g.font = font('800', 34); g.textAlign = 'center'; g.fillText('FUSE  ·  RELAY', w * 0.32, 52);
    g.fillStyle = '#d9d9d2'; g.fillRect(w * 0.6, 18, w * 0.34, h - 36); g.strokeStyle = '#555'; g.lineWidth = 1; for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) g.strokeRect(w * 0.62 + j * 20, 26 + i * 15, 17, 12); g.fillStyle = '#e8c414'; g.fillRect(w * 0.1, 76, 60, 30); g.fillStyle = '#222'; g.font = font('700', 18); g.fillText('30A', w * 0.1 + 30, 98); rough(0, 0, w, h, 0.68, 0, 0.06); });
  // stickers: radiator-fan warning + emission / A-C label
  R('label', (w, h) => { g.fillStyle = '#1a1b1d'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2c919'; g.fillRect(10, 12, w * 0.45, h - 24); g.fillStyle = '#111'; g.font = font('800', 20); g.textAlign = 'left'; g.fillText('⚠ CAUTION', 20, 38); g.font = font('600', 14); g.fillText('FAN MAY START AT ANY TIME', 20, 62); g.fillText('EVEN WITH IGNITION OFF', 20, 80); g.beginPath(); g.arc(w * 0.38, 98, 14, 0, 7); g.stroke();
    g.fillStyle = '#ececE6'; g.fillRect(w * 0.52, 12, w * 0.44, h - 24); g.fillStyle = '#222'; g.font = font('700', 14); g.fillText('A/C  R-134a  0.45 kg', w * 0.55, 34); g.font = font('500', 12); for (let i = 0; i < 5; i++) g.fillRect(w * 0.55, 46 + i * 13, w * 0.36 * (0.5 + rnd() * 0.5), 3); rough(0, 0, w, h, 0.45, 0, 0.04); });
  // hoses: black rubber with a moulded seam highlight (u along the hose)
  R('rubber', (w, h) => { g.fillStyle = '#141414'; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 1800, 0.25, true, 1); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, h * 0.45, w, 4); rough(0, 0, w, h, 0.78, 0, 0.05); });
  R('corr', (w, h) => { g.fillStyle = '#141414'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 4, 0, 3, h); } rough(0, 0, w, h, 0.7, 0, 0.05); });
  R('radiator', (w, h) => { g.fillStyle = '#2a2b2b'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 4) { g.fillStyle = '#6b6e70'; g.fillRect(0, y, w, 1); } for (let x = 0; x < w; x += 16) { g.fillStyle = '#121212'; g.fillRect(x, 0, 3, h); } rough(0, 0, w, h, 0.5, 0.6, 0.06); });
  R('shield', (w, h) => { g.fillStyle = '#b8bbbd'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 10) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 5, 0, 3, h); } g.fillStyle = 'rgba(120,70,30,0.25)'; g.fillRect(0, h * 0.6, w, h * 0.4); rough(0, 0, w, h, 0.35, 0.95, 0.06); });
  R('metal', (w, h) => { g.fillStyle = '#8f9396'; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 2500, 0.15, true, 1); speck(0, 0, w, h, 1200, 0.15, false, 1); rough(0, 0, w, h, 0.38, 0.9, 0.06); });
  R('iron', (w, h) => { g.fillStyle = '#3d3b39'; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 3000, 0.3, false, 1.5); speck(0, 0, w, h, 900, 0.1, true, 1); rough(0, 0, w, h, 0.72, 0.6, 0.08); });
  R('cap', (w, h) => { g.fillStyle = '#e3b411'; g.fillRect(0, 0, w, h); g.fillStyle = '#1c1c1c'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.3, 0, 7); g.fill(); g.fillStyle = '#e3b411'; g.font = font('800', 22); g.textAlign = 'center'; g.fillText('OIL', w / 2, h / 2 + 8); rough(0, 0, w, h, 0.45, 0, 0.04); });
  R('belt', (w, h) => { g.fillStyle = '#101010'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 10) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, y, w, 3); } rough(0, 0, w, h, 0.85, 0, 0.04); });
  R('plain', (w, h) => { g.fillStyle = '#d8d8d6'; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 1500, 0.08, false, 1); rough(0, 0, w, h, 0.5, 0, 0.05); });
  const res = (fluid) => (w, h) => { g.fillStyle = '#d9d6cc'; g.fillRect(0, 0, w, h); g.fillStyle = fluid; g.fillRect(0, h * 0.42, w, h * 0.58); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, h * 0.42, w, 3); g.fillStyle = '#333'; g.font = font('700', 13); g.textAlign = 'left'; for (const [y, t] of [[h * 0.3, 'MAX'], [h * 0.62, 'MIN']]) { g.fillRect(8, y, 26, 3); g.fillText(t, 38, y + 5); } speck(0, 0, w, h, 900, 0.1, false, 1); rough(0, 0, w, h, 0.3, 0, 0.04); };
  R('resCool', res('#d97fa0')); R('resBrake', res('#c79a3c'));
  R('cowl', (w, h) => { g.fillStyle = '#151617'; g.fillRect(0, 0, w, h); for (let x = 6; x < w; x += 14) { g.fillStyle = '#050505'; g.fillRect(x, h * 0.2, 8, h * 0.6); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 8, h * 0.2, 2, h * 0.6); } rough(0, 0, w, h, 0.75, 0, 0.05); });
  R('coil', (w, h) => { g.fillStyle = '#202124'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a5d62'; g.fillRect(w * 0.15, h * 0.15, w * 0.7, h * 0.18); g.fillStyle = '#b3b6b9'; g.font = font('700', 16); g.textAlign = 'center'; g.fillText('DENSO', w / 2, h * 0.7); rough(0, 0, w, h, 0.5, 0, 0.05); });
  R('terminal', (w, h) => { g.fillStyle = '#c7a14a'; g.fillRect(0, 0, w, h); speck(0, 0, w, h, 1500, 0.25, false, 1); rough(0, 0, w, h, 0.4, 0.95, 0.06); });
  R('foil', (w, h) => { g.fillStyle = '#c9cbcc'; g.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},0.25)`; g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 24, y + (rnd() - 0.5) * 24); g.stroke(); } rough(0, 0, w, h, 0.3, 1, 0.1); });
  MAP = new THREE.CanvasTexture(c); MAP.colorSpace = THREE.SRGBColorSpace; MAP.anisotropy = 4; MAP.name = 'engineBayMap';
  ORM = new THREE.CanvasTexture(o); ORM.anisotropy = 4; ORM.name = 'engineBayORM';
}
let MAT = null;
export function bayMaterial() { if (!MAT) { makeAtlas(); MAT = new THREE.MeshStandardMaterial({ map: MAP, roughnessMap: ORM, metalnessMap: ORM, roughness: 1, metalness: 1, vertexColors: true, envMapIntensity: 0.8 }); MAT.name = 'engineBay'; } return MAT; }
// ---------------------------------------------------------------- geometry
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3();
const xf = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => M4.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)).clone();
class Parts {
  constructor() { this.list = []; }
  // geo (any three primitive with uv), atlas region, tint (linear rgb multiplier), transform
  add(geo, cell, col = [1, 1, 1], m = null) { const g = geo.index ? geo.toNonIndexed() : geo.clone(); geo.dispose(); if (m) g.applyMatrix4(m); if (!g.attributes.normal) g.computeVertexNormals();
    const uv = g.attributes.uv, n = g.attributes.position.count; const r = cell ? RG[cell] : [0, 0, 0, 0];
    const uvs = new Float32Array(n * 2), cs = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = uv ? uv.getX(i) : 0, v = uv ? uv.getY(i) : 0; uvs[i * 2] = r[0] + Math.min(1, Math.max(0, u)) * (r[2] - r[0]); uvs[i * 2 + 1] = r[1] + Math.min(1, Math.max(0, v)) * (r[3] - r[1]); cs[i * 3] = col[0]; cs[i * 3 + 1] = col[1]; cs[i * 3 + 2] = col[2]; }
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setAttribute('color', new THREE.BufferAttribute(cs, 3)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k); this.list.push(g); return this; }
  box(cell, x, y, z, sx, sy, sz, col, r = 0, rot = [0, 0, 0]) { return this.add(r > 0 ? new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(r, sx / 2, sy / 2, sz / 2)) : new THREE.BoxGeometry(sx, sy, sz), cell, col, xf(x, y, z, ...rot)); }
  cyl(cell, x, y, z, r0, r1, h, col, rot = [0, 0, 0], seg = 14, open = false) { return this.add(new THREE.CylinderGeometry(r0, r1, h, seg, 1, open), cell, col, xf(x, y, z, ...rot)); }
  tube(cell, pts, r, col, seg = 20, rs = 8) { const cv = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))); return this.add(new THREE.TubeGeometry(cv, seg, r, rs, false), cell, col); }
  torus(cell, x, y, z, R, r, col, rot = [0, 0, 0]) { return this.add(new THREE.TorusGeometry(R, r, 6, 18), cell, col, xf(x, y, z, ...rot)); }
  plane(cell, x, y, z, sx, sz, col, rot = [-Math.PI / 2, 0, 0]) { return this.add(new THREE.PlaneGeometry(sx, sz), cell, col, xf(x, y, z, ...rot)); }
  build() { const g = mergeGeometries(this.list, false); for (const p of this.list) p.dispose(); this.list = []; g.computeBoundingSphere(); g.computeBoundingBox(); return g; }
}
const HX = W0 / 2;
const WHITE = [1, 1, 1], RED = [0.55, 0.05, 0.04], BLUE = [0.06, 0.2, 0.62], YEL = [0.9, 0.62, 0.05], ORANGE = [0.85, 0.32, 0.03], CU = [0.75, 0.7, 0.66];
let BAY_GEO = null, BAY_PAINT0 = null, BONNET_IN = null, ROD_GEO = null;
// the bay's textured parts (shared by every car)
function bayGeo() {
  if (BAY_GEO) return BAY_GEO; makeAtlas(); const P = new Parts(), rot = Math.PI / 2;
  // floor + depths, cowl, slam panel, latch, stickers
  P.plane('floor', 0, 0.01, L0 / 2, W0 * 0.985, L0 * 0.99, WHITE);
  P.box('cowl', 0, 0.012, 0.045, W0 * 0.96, 0.024, 0.09, WHITE, 0.008);
  P.box('plastic', 0, 0.0, L0 - 0.035, W0 * 0.92, 0.04, 0.07, WHITE, 0.01); // slam panel upper (radiator support)
  P.box('metal', 0, 0.026, L0 - 0.04, 0.07, 0.016, 0.05, WHITE, 0.004); P.torus('metal', 0, 0.03, L0 - 0.065, 0.016, 0.004, WHITE, [0, 0, 0]); // bonnet latch + its striker loop guide
  P.plane('label', -0.2, 0.0215, L0 - 0.035, 0.22, 0.05, WHITE);
  // radiator: top tank, cap, core strip, fan shroud and hub
  P.box('plastic', 0, 0.01, L0 - 0.1, 0.84, 0.045, 0.05, WHITE, 0.012); P.plane('radiator', 0, 0.002, L0 - 0.068, 0.82, 0.018, WHITE);
  P.cyl('metal', 0.26, 0.04, L0 - 0.1, 0.022, 0.024, 0.016, WHITE); P.cyl('metal', 0.26, 0.034, L0 - 0.1, 0.012, 0.012, 0.012, WHITE);
  P.box('plastic', 0.05, -0.02, L0 - 0.16, 0.7, 0.03, 0.06, [0.8, 0.8, 0.8], 0.01); P.cyl('plastic', 0.05, -0.004, L0 - 0.16, 0.05, 0.05, 0.012, [0.6, 0.6, 0.6], [0, 0, 0], 16);
  // the engine
  P.box('alu', 0.04, -0.03, 0.56, 0.66, 0.16, 0.3, WHITE, 0.02); // head + upper block
  P.box('iron', 0.04, -0.06, 0.56, 0.62, 0.1, 0.32, WHITE, 0.015);
  P.box('rocker', 0.03, 0.075, 0.585, 0.58, 0.05, 0.17, WHITE, 0.018); // rocker cover
  for (let i = 0; i < 4; i++) { const x = -0.14 + i * 0.11; P.box('coil', x, 0.112, 0.585, 0.045, 0.03, 0.052, WHITE, 0.006); P.box('plastic', x, 0.128, 0.6, 0.02, 0.012, 0.02, [0.6, 0.6, 0.6], 0.003); }
  P.tube('corr', [[-0.22, 0.12, 0.62], [-0.14, 0.135, 0.61], [0.05, 0.135, 0.61], [0.2, 0.13, 0.61], [0.3, 0.1, 0.63], [0.36, 0.05, 0.66]], 0.01, WHITE, 26, 6); // coil loom
  P.cyl('cap', -0.2, 0.108, 0.54, 0.026, 0.028, 0.016, WHITE, [0, 0, 0], 16); // oil filler
  P.torus('plain', 0.12, 0.085, 0.73, 0.016, 0.004, YEL, [-rot, 0, 0]); P.tube('metal', [[0.12, 0.07, 0.73], [0.12, 0.02, 0.72], [0.11, -0.06, 0.7]], 0.0035, WHITE, 6, 5); // dipstick
  // intake: plenum, four runners over the head, throttle body
  P.box('alu', 0.04, 0.03, 0.36, 0.44, 0.065, 0.08, WHITE, 0.025);
  for (let i = 0; i < 4; i++) { const x = -0.14 + i * 0.11; P.tube('alu', [[x, 0.04, 0.39], [x, 0.065, 0.43], [x, 0.06, 0.47], [x, 0.03, 0.5]], 0.021, WHITE, 10, 10); }
  P.cyl('alu', -0.22, 0.04, 0.36, 0.036, 0.036, 0.05, WHITE, [0, 0, rot], 16); P.cyl('metal', -0.25, 0.04, 0.36, 0.03, 0.03, 0.012, WHITE, [0, 0, rot], 16);
  // exhaust heat shield (front), alternator, pulleys, belt, engine mount
  P.box('shield', 0.07, 0.01, 0.75, 0.46, 0.05, 0.07, WHITE, 0.012, [-0.35, 0, 0]);
  P.cyl('alu', 0.42, -0.015, 0.66, 0.055, 0.055, 0.11, WHITE, [0, 0, rot], 16); P.cyl('metal', 0.485, -0.015, 0.66, 0.03, 0.03, 0.02, WHITE, [0, 0, rot], 14);
  P.cyl('iron', 0.385, -0.05, 0.5, 0.07, 0.07, 0.02, WHITE, [0, 0, rot], 18); P.cyl('metal', 0.387, 0.0, 0.6, 0.04, 0.04, 0.02, WHITE, [0, 0, rot], 14);
  P.box('belt', 0.39, 0.0, 0.58, 0.018, 0.012, 0.2, WHITE, 0, [0.5, 0, 0]); P.box('belt', 0.39, -0.03, 0.62, 0.018, 0.012, 0.16, WHITE, 0, [-0.9, 0, 0]);
  P.box('iron', 0.45, 0.005, 0.47, 0.08, 0.05, 0.1, WHITE, 0.01); P.cyl('metal', 0.45, 0.033, 0.47, 0.012, 0.012, 0.01, WHITE);
  P.cyl('alu', 0.3, 0.03, 0.71, 0.026, 0.03, 0.04, WHITE, [rot, 0, 0], 12); // thermostat housing
  // air box, intake hose, snorkel
  P.box('plastic', -0.47, 0.03, 0.72, 0.27, 0.15, 0.28, WHITE, 0.03); P.box('plastic', -0.47, 0.098, 0.72, 0.25, 0.016, 0.26, [0.75, 0.75, 0.75], 0.006);
  for (const z of [0.6, 0.84]) P.box('metal', -0.47, 0.085, z, 0.04, 0.03, 0.012, WHITE, 0.003);
  for (const x of [-0.6, -0.34]) P.box('metal', x, 0.085, 0.72, 0.012, 0.03, 0.04, WHITE, 0.003);
  P.tube('corr', [[-0.36, 0.07, 0.62], [-0.32, 0.075, 0.54], [-0.3, 0.065, 0.45], [-0.27, 0.045, 0.38]], 0.034, WHITE, 18, 12);
  P.box('plastic', -0.47, 0.0, 0.93, 0.12, 0.05, 0.12, WHITE, 0.02);
  // battery: case, lid, terminals + covers, cables, hold-down
  P.box('plastic', 0.46, 0.02, 0.83, 0.17, 0.18, 0.24, [0.85, 0.85, 0.85], 0.012); P.plane('battery', 0.46, 0.1105, 0.83, 0.165, 0.235, WHITE, [-Math.PI / 2, 0, -rot]);
  P.cyl('terminal', 0.42, 0.122, 0.73, 0.011, 0.012, 0.022, WHITE); P.cyl('terminal', 0.42, 0.122, 0.93, 0.011, 0.012, 0.022, WHITE);
  P.box('plain', 0.42, 0.128, 0.73, 0.04, 0.026, 0.045, RED, 0.008); P.box('plain', 0.42, 0.126, 0.93, 0.036, 0.02, 0.04, [0.12, 0.12, 0.12], 0.008);
  P.tube('plain', [[0.42, 0.13, 0.72], [0.4, 0.12, 0.66], [0.36, 0.08, 0.62], [0.3, 0.02, 0.6]], 0.009, RED, 12, 6); P.tube('rubber', [[0.42, 0.13, 0.94], [0.36, 0.11, 0.97], [0.26, 0.05, 0.96], [0.2, 0.0, 0.93]], 0.009, WHITE, 12, 6);
  P.box('metal', 0.46, 0.117, 0.83, 0.2, 0.008, 0.025, [0.6, 0.6, 0.62], 0.002); for (const x of [0.36, 0.56]) P.cyl('metal', x, 0.06, 0.83, 0.004, 0.004, 0.12, WHITE, [0, 0, 0], 6);
  // fuse / relay box with its main loom
  P.box('plastic', -0.52, 0.02, 0.47, 0.14, 0.11, 0.15, WHITE, 0.012); P.plane('fuse', -0.52, 0.0755, 0.47, 0.135, 0.145, WHITE, [-Math.PI / 2, 0, -rot]);
  P.tube('corr', [[-0.45, 0.02, 0.47], [-0.36, 0.02, 0.42], [-0.1, 0.02, 0.41], [0.2, 0.02, 0.42], [0.42, 0.0, 0.42]], 0.012, WHITE, 26, 6);
  P.tube('corr', [[-0.52, 0.02, 0.55], [-0.56, 0.02, 0.7], [-0.6, 0.015, 0.88], [-0.4, 0.01, 0.98], [0.1, 0.01, 1.0], [0.36, 0.02, 0.92]], 0.01, WHITE, 30, 6);
  // cooling: expansion tank (+ hose), upper radiator hose, heater hoses
  P.box('resCool', 0.56, 0.035, 0.62, 0.1, 0.13, 0.12, WHITE, 0.02); P.cyl('plain', 0.56, 0.106, 0.6, 0.022, 0.022, 0.018, [0.12, 0.12, 0.12], [0, 0, 0], 14); P.plane('label', 0.56, 0.1155, 0.6, 0.03, 0.03, WHITE);
  P.tube('rubber', [[0.56, 0.04, 0.69], [0.5, 0.03, 0.8], [0.4, 0.035, 0.94], [0.3, 0.04, 0.985]], 0.006, WHITE, 12, 6);
  P.tube('rubber', [[0.3, 0.035, L0 - 0.1], [0.32, 0.06, 0.92], [0.32, 0.062, 0.82], [0.3, 0.035, 0.72]], 0.02, WHITE, 18, 10);
  P.tube('rubber', [[0.22, -0.01, 0.42], [0.24, 0.0, 0.3], [0.22, 0.0, 0.18], [0.2, -0.01, 0.1]], 0.012, WHITE, 12, 8); P.tube('rubber', [[0.28, -0.01, 0.42], [0.3, 0.0, 0.3], [0.29, 0.0, 0.18], [0.27, -0.01, 0.1]], 0.012, WHITE, 12, 8);
  // brake: booster drum, master cylinder, fluid reservoir; A/C lines; washer neck + cap
  P.cyl('plastic', -0.36, -0.07, 0.2, 0.105, 0.105, 0.12, [0.7, 0.7, 0.7], [rot, 0, 0], 22); P.cyl('alu', -0.36, -0.015, 0.31, 0.03, 0.03, 0.1, WHITE, [rot, 0, 0], 12);
  P.box('resBrake', -0.36, 0.035, 0.32, 0.08, 0.06, 0.06, WHITE, 0.012); P.cyl('plain', -0.36, 0.068, 0.32, 0.019, 0.019, 0.012, [0.1, 0.1, 0.1], [0, 0, 0], 12);
  P.tube('metal', [[0.52, 0.0, 0.12], [0.55, 0.02, 0.3], [0.58, 0.02, 0.6], [0.58, 0.015, 0.9], [0.5, 0.01, 1.0]], 0.006, WHITE, 24, 6); P.tube('metal', [[0.49, 0.0, 0.12], [0.52, 0.015, 0.3], [0.53, 0.015, 0.5]], 0.008, WHITE, 12, 6);
  P.cyl('plastic', -0.58, 0.01, 0.97, 0.024, 0.024, 0.06, WHITE, [0, 0, 0], 12); P.cyl('plain', -0.58, 0.044, 0.97, 0.03, 0.03, 0.014, BLUE, [0, 0, 0], 14);
  // strut-top nuts (the towers themselves are body colour: bayPaintGeo)
  for (const sx of [-1, 1]) { const x = sx * 0.53; P.cyl('metal', x, 0.058, 0.27, 0.018, 0.018, 0.016, WHITE, [0, 0, 0], 6); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; P.cyl('metal', x + Math.cos(a) * 0.05, 0.054, 0.27 + Math.sin(a) * 0.05, 0.007, 0.007, 0.014, WHITE, [0, 0, 0], 6); } }
  void ORANGE; void CU;
  BAY_GEO = P.build(); return BAY_GEO;
}
// the bay's body-colour parts (inner wing lips, strut towers, the slam panel's top) — colour added per car
function bayPaint0() {
  if (BAY_PAINT0) return BAY_PAINT0; const P = new Parts();
  for (const sx of [-1, 1]) { P.box(null, sx * (HX - 0.012), -0.04, L0 / 2, 0.024, 0.12, L0 * 0.98, WHITE); P.box(null, sx * (HX - 0.055), 0.004, L0 / 2, 0.07, 0.016, L0 * 0.96, WHITE, 0.006); // the inner wing: vertical lip + its flange
    P.cyl(null, sx * 0.53, 0.0, 0.27, 0.085, 0.1, 0.1, WHITE, [0, 0, 0], 20); P.cyl(null, sx * 0.53, 0.046, 0.27, 0.07, 0.085, 0.012, WHITE, [0, 0, 0], 20); }
  P.box(null, 0, 0.026, L0 - 0.012, W0 * 0.96, 0.012, 0.024, WHITE, 0.004);
  BAY_PAINT0 = P.build(); return BAY_PAINT0;
}
// the bonnet's underside: the insulation pad, the striker (textured; the frame is in the panel's paint geometry)
function bonnetInner() {
  if (BONNET_IN) return BONNET_IN; makeAtlas(); const P = new Parts();
  P.plane('pad', 0, -0.026, L0 * 0.47, W0 * 0.74, L0 * 0.64, WHITE, [Math.PI / 2, 0, 0]);
  P.box('metal', 0, -0.045, L0 - 0.06, 0.05, 0.03, 0.006, WHITE); P.box('metal', 0, -0.05, L0 - 0.06, 0.012, 0.04, 0.012, WHITE);
  for (const sx of [-1, 1]) P.cyl('plastic', sx * (HX - 0.12), -0.034, L0 - 0.05, 0.012, 0.014, 0.022, WHITE, [0, 0, 0], 10); // rubber bump stops
  BONNET_IN = P.build(); return BONNET_IN;
}
// the prop rod: along +y from its pivot, unit length (scaled on y), with a bent tip
function rodGeo() { if (ROD_GEO) return ROD_GEO; makeAtlas(); const P = new Parts(); P.cyl('metal', 0, 0.5, 0, 0.0045, 0.0045, 1, WHITE, [0, 0, 0], 6); P.cyl('plastic', 0, 0.06, 0, 0.008, 0.008, 0.1, WHITE, [0, 0, 0], 8); ROD_GEO = P.build(); return ROD_GEO; }
// the bonnet panel (outer skin + inner frame), nominal size, body colour as vertex colour
function panelGeo0(w, L) {
  const P = new Parts(); const sk = new THREE.BoxGeometry(w, 0.02, L, 8, 1, 6); sk.translate(0, 0, L / 2); const p = sk.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + (1 - (2 * x / w) ** 2) * 0.03); } sk.computeVertexNormals(); P.add(sk, null, WHITE);
  const fr = 0.07, y = -0.018; P.box(null, 0, y, fr / 2, w * 0.98, 0.014, fr, WHITE); P.box(null, 0, y, L - fr / 2, w * 0.98, 0.014, fr, WHITE);
  for (const sx of [-1, 1]) P.box(null, sx * (w / 2 - fr / 2 - 0.005), y, L / 2, fr, 0.014, L * 0.98, WHITE);
  for (const sx of [-1, 1]) P.box(null, sx * w * 0.2, y - 0.004, L * 0.5, 0.05, 0.012, L * 0.86, WHITE, 0, [0, sx * 0.32, 0]); // the X ribs
  P.box(null, 0, y - 0.004, L * 0.55, w * 0.85, 0.012, 0.05, WHITE);
  return P.build();
}
// a body-colour copy (vertex colour = paint × shade); small, cached per colour
const PAINTED = new Map();
function painted(key, base, hex) { const k = key + '|' + hex; let g = PAINTED.get(k); if (g) { PAINTED.delete(k); PAINTED.set(k, g); return g; } const c = new THREE.Color(hex); g = base.clone(); const a = g.attributes.color.array;
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } PAINTED.set(k, g); if (PAINTED.size > 24) { const [k0, g0] = PAINTED.entries().next().value; if (!g0.userData.live) { g0.dispose(); PAINTED.delete(k0); } } return g; }
const PANEL0 = new Map();
// ---------------------------------------------------------------- assembly
// F: bonnetFrame (vehicle space: zf, zh, yf, yh, Lb, w); hex: the car's paint. Returns { hinge, bay, rod, rodPivot, slot } —
// hinge: the panel's group (rotation.x drives it), bay: the engine bay group, rod: the prop rod (posed by poseRod)
export function buildBay(F, hex) {
  const pm = vehicleMaterials().mats.vpaint, bm = bayMaterial(); const sx = F.w / W0, sz = F.Lb / L0;
  const key = `${Math.round(F.w * 50)}:${Math.round(F.Lb * 50)}`; let pg0 = PANEL0.get(key); if (!pg0) { pg0 = panelGeo0(F.w, F.Lb); PANEL0.set(key, pg0); }
  const hinge = new THREE.Group(); hinge.name = 'bonnet'; hinge.position.set(0, F.yh + 0.012, F.zh);
  const panel = new THREE.Mesh(painted('panel' + key, pg0, hex), pm); panel.castShadow = true; panel.receiveShadow = true; panel.name = 'bonnetPanel'; hinge.add(panel);
  const inner = new THREE.Mesh(bonnetInner(), bm); inner.scale.set(sx, 1, sz); inner.receiveShadow = true; inner.name = 'bonnetInner'; hinge.add(inner);
  const slope = Math.atan2(F.yh - F.yf, F.Lb);
  const bay = new THREE.Group(); bay.name = 'engineBay'; bay.position.set(0, F.yh, F.zh); bay.rotation.x = slope; bay.scale.set(sx, 1, sz);
  const parts = new THREE.Mesh(bayGeo(), bm); parts.receiveShadow = true; parts.name = 'bayParts'; bay.add(parts);
  const body = new THREE.Mesh(painted('bay', bayPaint0(), hex), pm); body.receiveShadow = true; body.name = 'bayBody'; bay.add(body);
  // the prop rod lives in an unscaled copy of the bay's frame (a scaled parent would skew it as it turns); pivot on the slam panel
  const rodG = new THREE.Group(); rodG.name = 'propRodFrame'; rodG.position.copy(bay.position); rodG.rotation.x = slope;
  const rod = new THREE.Mesh(rodGeo(), bm); rod.name = 'propRod'; rod.position.set(-0.4 * sx, 0.03, (L0 - 0.05) * sz); rodG.add(rod); bay.userData.rodG = rodG;
  for (const g of [panel.geometry, body.geometry]) g.userData.live = (g.userData.live || 0) + 1;
  bay.visible = false; rodG.visible = false; return { hinge, bay, rodG, rod, slope, panel, body, F };
}
export function releaseBay(B) { for (const m of [B.panel, B.body]) if (m && m.geometry.userData.live) m.geometry.userData.live--; }
// the rod: lies along the slam panel (pointing across the car) until the bonnet is high, then swings up into the slot in the
// bonnet's underside (at 72 % of its length from the hinge) — the tip arrives exactly as the bonnet reaches the top
const _s = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0), _st = new THREE.Vector3(1, 0, 0), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
export function poseRod(B, k, openAngle) {
  const rod = B.rod; if (!rod) return; const rel = openAngle, d = B.F.Lb * 0.72; // the panel's angle to the bay plane at full open; slot distance from the hinge
  _s.set(rod.position.x, 0.012 + Math.sin(rel) * d - Math.cos(rel) * 0.03, Math.cos(rel) * d + Math.sin(rel) * 0.03); // the slot, 3 cm under the skin
  _d.subVectors(_s, rod.position); const len = _d.length(); _d.normalize();
  const t = Math.min(1, Math.max(0, (k - 0.62) / 0.38)); const e = t * t * (3 - 2 * t);
  _qa.setFromUnitVectors(_u, _st); _qb.setFromUnitVectors(_u, _d); _qa.slerp(_qb, e); // stowed: lying across the slam panel → up into the slot
  rod.quaternion.copy(_qa); rod.scale.set(1, len, 1);
}
// the loading screen: one complete bay (bonnet up) in front of the warm camera — every program it needs (both light levels' variants
// via the caller), its textures and geometry uploaded. Returns a group; the caller removes it.
export function bayWarmGroup() {
  const F = { zf: 0, zh: -1.1, yf: 0.9, yh: 0.95, Lb: 1.1, w: 1.3 }; const B = buildBay(F, '#8a8f94'); const g = new THREE.Group(); g.name = 'bayWarm';
  B.bay.visible = true; B.rodG.visible = true; B.hinge.rotation.x = B.slope - 1.15; poseRod(B, 1, 1.15); g.add(B.hinge, B.bay, B.rodG); g.userData.release = () => releaseBay(B); return g;
}
