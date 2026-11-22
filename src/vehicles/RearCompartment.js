// 84th: the rear compartments of the 1990 ambulance and the Street Customs roadside service van as real geometry.
//
// Before: one quad in the door opening whose shader traced the view ray into a box painted from a 512² canvas atlas
// (AmbulanceKit interiorMaterial). It read flat and plasticky up close, could not hold real objects (the stowed cot was a
// shader box — the source of the "second trolley" — and the van's tools were pictures), and nothing inside had parallax.
//
// Now: a modelled compartment per kind — one merged vertex-coloured mesh (panels, cabinets, seats, racking, rails …), one
// decal mesh (labels, screens, drawer fronts, floor pattern, pegboard: a 1024² atlas drawn once) and one unlit LED mesh —
// 3 draw calls, geometry and materials shared by every vehicle of the kind, built once. The group is a child of the van and
// is visible only while the rear doors are open (setAmbRear toggles it, exactly like the old quad), so it costs nothing on
// the road. Real objects (the ambulance's cot, the service van's equipment kit) sit in its slots (COMPARTMENT_SLOTS).
// Lighting: no lights — the compartment's own "LED" level is an emissive lift of the albedo (uLit), so it reads lit by day and
// at night without a shadow-casting lamp; nothing casts or receives shadows in here.
import * as THREE from 'three';
import { MiniBuilder } from './RoadsideKit.js';

export const RC = { x0: -0.8, x1: 0.8, y0: 0.53, y1: 1.96, z0: -2.36, z1: 0.49 };
export const IN_LIGHT = { value: 0.6 };
// slots (van space): where each piece of equipment lives when stowed (base point, yaw; the prop's own origin is its base)
export const COMPARTMENT_SLOTS = {
  rsvan: {
    toolbox: { p: [-0.5, RC.y0, -2.02], yaw: Math.PI / 2 }, battery: { p: [-0.56, RC.y0, -1.58], yaw: Math.PI / 2 }, worklight: { p: [-0.6, RC.y0, -1.2], yaw: 0 },
    jack: { p: [0.42, RC.y0, -1.55], yaw: Math.PI }, tyre: { p: [0.6, RC.y0 + 0.31, -1.05], yaw: 0, rz: 0 }, triangle: { p: [0.74, 0.86, -2.0], yaw: -Math.PI / 2 },
    cone0: { p: [0.36, RC.y0, -2.08], yaw: 0 }, cone1: { p: [0.36, RC.y0 + 0.07, -2.08], yaw: 0.4 }, brace: { p: [-0.5, RC.y0 + 0.08, -2.02], yaw: Math.PI / 2, inBox: true }, spanner: { p: [-0.5, RC.y0 + 0.1, -2.02], yaw: Math.PI / 2, inBox: true },
  },
  amb: { cot: { p: [0, RC.y0, RC.z0 + 1.15], yaw: Math.PI } },
};

function litPatch(m, key) { m.onBeforeCompile = (sh) => { sh.uniforms.uLit = IN_LIGHT; sh.fragmentShader = 'uniform float uLit;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * uLit;'); }; m.customProgramCacheKey = () => key; return m; }
let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = { body: litPatch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08, envMapIntensity: 0.45 }), 'rc-body'),
    decal: litPatch(new THREE.MeshStandardMaterial({ map: atlas(), roughness: 0.55, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, envMapIntensity: 0.4 }), 'rc-decal'),
    led: new THREE.MeshBasicMaterial({ color: 0xf4f8ff }) };
  MATS.decal.map.colorSpace = THREE.SRGBColorSpace; return MATS;
}
// ---------------------------------------------------------------- the decal atlas (1024², 8×8 cells of 128 px; drawn once)
const CELL = 128; const A = {}; // name → [cx, cy, cw, ch] in cells
let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS; const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  const R = (name, cx, cy, cw, ch, fn) => { A[name] = [cx, cy, cw, ch]; g.save(); g.translate(cx * CELL, cy * CELL); g.beginPath(); g.rect(0, 0, cw * CELL, ch * CELL); g.clip(); fn(cw * CELL, ch * CELL); g.restore(); };
  const noise = (w, h, n, a, dark = true) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${dark ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1); } };
  const font = (w, px) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  // anti-slip vinyl (ambulance floor): blue-grey with quartz fleck
  R('vinyl', 0, 0, 2, 2, (w, h) => { g.fillStyle = '#4b5359'; g.fillRect(0, 0, w, h); for (let i = 0; i < 5000; i++) { const k = Math.random(); g.fillStyle = k < 0.5 ? 'rgba(255,255,255,0.10)' : k < 0.8 ? 'rgba(0,0,0,0.18)' : 'rgba(170,190,205,0.18)'; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); } });
  // ribbed rubber mat (service van floor)
  R('rubber', 2, 0, 2, 2, (w, h) => { g.fillStyle = '#26282a'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { g.fillStyle = '#34373a'; g.fillRect(0, y, w, 3); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y + 3, w, 1); } noise(w, h, 2500, 0.15); noise(w, h, 600, 0.05, false); });
  // acrylic-fronted overhead cabinets with supplies behind (ambulance)
  R('cabinets', 4, 0, 4, 1, (w, h) => { g.fillStyle = '#cfd7d4'; g.fillRect(0, 0, w, h); const n = 6, cw = w / n; const cols = ['#2f6fb5', '#e8e8e2', '#d9a03a', '#7bb36a', '#c94a3b', '#f2f2f2'];
    for (let i = 0; i < n; i++) { const x = i * cw + 4; g.fillStyle = '#b8c2bf'; g.fillRect(x, 6, cw - 8, h - 12); for (let k = 0; k < 6; k++) { g.fillStyle = cols[(i * 2 + k) % cols.length]; g.fillRect(x + 6 + k * (cw - 20) / 6, h * 0.35, (cw - 20) / 6 - 3, h * 0.5); }
      g.fillStyle = 'rgba(190,220,230,0.45)'; g.fillRect(x + 2, 8, cw - 12, h - 16); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 6, 12, 6, h - 30); g.fillStyle = '#6d7774'; g.fillRect(x + cw / 2 - 14, h - 22, 22, 4);
      g.fillStyle = '#1f2a33'; g.font = font('600', 15); g.fillText(['AIRWAY', 'DRESSINGS', 'IV', 'OBSTETRIC', 'BURNS', 'PPE'][i], x + 8, 26); } });
  // drawer bank fronts (ambulance counter)
  R('drawers', 4, 1, 2, 1, (w, h) => { g.fillStyle = '#d3dad8'; g.fillRect(0, 0, w, h); for (let i = 0; i < 4; i++) { const y = 4 + i * (h - 8) / 4; g.strokeStyle = '#9aa3a1'; g.lineWidth = 2; g.strokeRect(4, y, w - 8, (h - 8) / 4 - 4); g.fillStyle = '#7d8785'; g.fillRect(w / 2 - 24, y + 10, 48, 5); g.fillStyle = '#20303a'; g.font = font('600', 13); g.fillText(['SYRINGES', 'CANNULAE', 'BANDAGES', 'SPLINTS'][i], 12, y + 20); } });
  // monitor / defibrillator face
  R('monitor', 6, 1, 1, 1, (w, h) => { g.fillStyle = '#26292d'; g.fillRect(0, 0, w, h); g.fillStyle = '#05090a'; g.fillRect(8, 8, w * 0.7, h * 0.62); g.strokeStyle = '#33ee77'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 80; i++) { const x = 10 + i, ph = i % 26; const y = 36 - (ph === 10 ? 14 : ph === 11 ? -8 : ph === 9 ? -2 : 0); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.strokeStyle = '#ffd23a'; g.beginPath(); for (let i = 0; i <= 80; i++) { const y = 62 + Math.sin(i * 0.3) * 5; i ? g.lineTo(10 + i, y) : g.moveTo(10, y); } g.stroke(); g.fillStyle = '#33ee77'; g.font = font('700', 20); g.fillText('72', w * 0.76, 30); g.fillStyle = '#4fc3ff'; g.fillText('98', w * 0.76, 58);
    g.fillStyle = '#e8b41c'; g.beginPath(); g.arc(w * 0.3, h * 0.84, 9, 0, 7); g.fill(); for (let i = 0; i < 4; i++) { g.fillStyle = '#50565c'; g.fillRect(w * 0.48 + i * 14, h * 0.8, 10, 8); } });
  // O2 / air / vacuum outlet panel + suction
  R('outlets', 7, 1, 1, 1, (w, h) => { g.fillStyle = '#dfe5e3'; g.fillRect(0, 0, w, h); const cols = ['#ffffff', '#1d1d1d', '#f0d000']; for (let i = 0; i < 3; i++) { g.fillStyle = '#9aa3a1'; g.beginPath(); g.arc(24 + i * 38, 34, 15, 0, 7); g.fill(); g.fillStyle = cols[i]; g.beginPath(); g.arc(24 + i * 38, 34, 10, 0, 7); g.fill(); }
    g.fillStyle = '#20303a'; g.font = font('700', 13); g.fillText('O2     AIR    VAC', 12, 64); g.fillStyle = 'rgba(160,205,215,0.8)'; g.fillRect(20, 76, 40, 44); g.fillStyle = '#c94a3b'; g.fillRect(20, 76, 40, 6); g.fillStyle = '#5d6b70'; g.fillRect(70, 80, 46, 36); });
  // partition: cab window, sharps bin label, clock, notice
  R('partition', 0, 2, 2, 2, (w, h) => { g.fillStyle = '#e4e9e7'; g.fillRect(0, 0, w, h); noise(w, h, 500, 0.04); g.fillStyle = '#141a1e'; g.fillRect(w * 0.3, h * 0.1, w * 0.4, h * 0.22); g.fillStyle = 'rgba(120,150,170,0.35)'; g.fillRect(w * 0.31, h * 0.11, w * 0.16, h * 0.08);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w * 0.84, h * 0.2, 14, 0, 7); g.fill(); g.strokeStyle = '#333'; g.lineWidth = 2; g.stroke(); g.beginPath(); g.moveTo(w * 0.84, h * 0.2); g.lineTo(w * 0.84, h * 0.2 - 9); g.moveTo(w * 0.84, h * 0.2); g.lineTo(w * 0.84 + 6, h * 0.2 + 2); g.stroke();
    g.fillStyle = '#ffffff'; g.fillRect(w * 0.08, h * 0.42, w * 0.3, h * 0.2); g.fillStyle = '#1f8a3c'; g.fillRect(w * 0.08, h * 0.42, w * 0.3, 14); g.fillStyle = '#222'; g.font = font('600', 11); for (let i = 0; i < 5; i++) g.fillRect(w * 0.1, h * 0.42 + 22 + i * 9, w * 0.24 * (0.6 + 0.4 * ((i * 7) % 3) / 2), 3); });
  // service van: pegboard with hand tools
  R('pegboard', 2, 2, 2, 2, (w, h) => { g.fillStyle = '#b9a07a'; g.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 12) for (let x = 6; x < w; x += 12) { g.fillStyle = 'rgba(40,30,20,0.55)'; g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
    const tool = (x, y, l, col, head) => { g.fillStyle = col; g.fillRect(x - 3, y, 6, l); g.fillStyle = '#9ea4a9'; if (head === 'sp') { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); g.fillStyle = '#b9a07a'; g.fillRect(x - 3, y - 8, 6, 6); } else if (head === 'ham') g.fillRect(x - 12, y - 4, 24, 9); else g.fillRect(x - 2, y - 10, 4, 10); };
    for (let i = 0; i < 6; i++) tool(20 + i * 18, 30, 60 + (i % 3) * 10, '#9ea4a9', 'sp'); tool(150, 40, 70, '#c4161c', 'ham'); tool(180, 40, 66, '#1d4f8a', 'sd'); tool(200, 40, 66, '#d9a514', 'sd'); tool(220, 40, 60, '#1a1a1a', 'sd');
    for (let i = 0; i < 8; i++) { g.fillStyle = ['#c4161c', '#1a1a1a', '#1d4f8a'][i % 3]; g.fillRect(20 + i * 27, 150, 18, 40); g.fillStyle = '#d0d4d8'; g.fillRect(24 + i * 27, 140, 10, 12); } // pliers / cutters
    g.fillStyle = '#1b2a4a'; g.fillRect(0, h - 40, w, 40); g.fillStyle = '#ff6a00'; g.font = font('700', 22); g.fillText('STREET CUSTOMS  ·  ROADSIDE', 12, h - 13); });
  // service van: steel drawer unit fronts with labels
  R('vdrawers', 4, 2, 2, 1, (w, h) => { g.fillStyle = '#3b4146'; g.fillRect(0, 0, w, h); for (let i = 0; i < 5; i++) { const y = 3 + i * (h - 6) / 5; g.fillStyle = '#4a5157'; g.fillRect(4, y, w - 8, (h - 6) / 5 - 3); g.fillStyle = '#9ea4a9'; g.fillRect(w / 2 - 30, y + 6, 60, 4); g.fillStyle = '#f2f2ee'; g.fillRect(14, y + 5, 56, 11); g.fillStyle = '#111'; g.font = font('600', 11); g.fillText(['FUSES', 'BULBS', 'HOSE CLIPS', 'RELAYS', 'TERMINALS'][i], 16, y + 14); } });
  // battery tester / diagnostic case face
  R('tester', 6, 2, 1, 1, (w, h) => { g.fillStyle = '#e8b414'; g.fillRect(0, 0, w, h); g.fillStyle = '#111'; g.fillRect(12, 12, w - 24, h * 0.45); g.fillStyle = '#7cf08a'; g.font = font('700', 26); g.fillText('12.6V', 22, 48); g.fillStyle = '#c4161c'; g.beginPath(); g.arc(30, h - 28, 10, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(w - 30, h - 28, 10, 0, 7); g.fill(); g.font = font('700', 14); g.fillText('BATTERY TEST', 22, h - 50); });
  // tool case lids (colour strips with latches) — repeated along the shelves
  R('cases', 7, 2, 1, 1, (w, h) => { const cols = ['#c4161c', '#1d4f8a', '#1a1a1a', '#d9a514']; for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; g.fillRect(0, i * h / 4, w, h / 4); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(4, i * h / 4 + 4, w - 8, 3); g.fillStyle = '#b8bcc0'; g.fillRect(16, i * h / 4 + 12, 10, 8); g.fillRect(w - 26, i * h / 4 + 12, 10, 8); } });
  // parts bins (front faces with labels)
  R('bins', 4, 3, 2, 1, (w, h) => { g.fillStyle = '#2b2f33'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) { const x = 4 + i * (w - 8) / 8; g.fillStyle = i % 2 ? '#1d5fae' : '#c4241c'; g.beginPath(); g.moveTo(x + 2, 20); g.lineTo(x + (w - 8) / 8 - 2, 20); g.lineTo(x + (w - 8) / 8 - 6, h - 4); g.lineTo(x + 6, h - 4); g.closePath(); g.fill(); g.fillStyle = '#f2f2ee'; g.fillRect(x + 8, 34, (w - 8) / 8 - 16, 14); } });
  // engine bay (the raised bonnet's view: Roadside bonnet kit)
  R('bay', 0, 4, 4, 2, (w, h) => { g.fillStyle = '#17191b'; g.fillRect(0, 0, w, h); noise(w, h, 4000, 0.25, false);
    g.fillStyle = '#4a4e52'; g.fillRect(w * 0.3, h * 0.25, w * 0.4, h * 0.5); for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(w * 0.31, h * 0.28 + i * h * 0.055, w * 0.38, 3); } // engine block + rocker cover ribs
    g.fillStyle = '#d4a514'; g.beginPath(); g.arc(w * 0.5, h * 0.4, 10, 0, 7); g.fill(); // oil filler cap
    g.fillStyle = '#101010'; g.fillRect(w * 0.06, h * 0.1, w * 0.2, h * 0.35); g.fillStyle = '#c4161c'; g.fillRect(w * 0.08, h * 0.12, 16, 10); g.fillStyle = '#222'; g.fillRect(w * 0.2, h * 0.12, 16, 10); // battery
    g.fillStyle = 'rgba(235,235,225,0.85)'; g.fillRect(w * 0.76, h * 0.12, w * 0.14, h * 0.25); g.fillStyle = '#e8c414'; g.beginPath(); g.arc(w * 0.83, h * 0.16, 9, 0, 7); g.fill(); // coolant reservoir
    g.fillStyle = '#202326'; g.fillRect(w * 0.06, h * 0.55, w * 0.2, h * 0.34); g.fillStyle = '#2a2e31'; g.fillRect(w * 0.76, h * 0.55, w * 0.16, h * 0.3); // air box, fuse box
    g.strokeStyle = '#0c0c0c'; g.lineWidth = 9; g.beginPath(); g.moveTo(w * 0.26, h * 0.7); g.bezierCurveTo(w * 0.3, h * 0.9, w * 0.5, h * 0.95, w * 0.62, h * 0.78); g.stroke(); g.beginPath(); g.moveTo(w * 0.7, h * 0.3); g.bezierCurveTo(w * 0.74, h * 0.4, w * 0.8, h * 0.45, w * 0.86, h * 0.4); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h); });
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; ATLAS = t; return t;
}
// a textured quad in the decal mesh: centre (x, y, z), size (w, h), facing n ('+x' | '-x' | '+y' | '-z' | '+z'), atlas cell name
function decal(D, x, y, z, w, h, n, name, rep = [1, 1]) {
  const [cx, cy, cw, ch] = A[name]; const u0 = cx / 8, u1 = (cx + cw) / 8, v1 = 1 - cy / 8, v0 = 1 - (cy + ch) / 8; const uu = (u1 - u0), vv = (v1 - v0);
  const P = []; const hw = w / 2, hh = h / 2;
  const corners = n === '-x' ? [[x, y - hh, z - hw], [x, y - hh, z + hw], [x, y + hh, z + hw], [x, y + hh, z - hw]]
    : n === '+x' ? [[x, y - hh, z + hw], [x, y - hh, z - hw], [x, y + hh, z - hw], [x, y + hh, z + hw]]
      : n === '+y' ? [[x - hw, y, z + hh], [x + hw, y, z + hh], [x + hw, y, z - hh], [x - hw, y, z - hh]]
        : n === '-z' ? [[x + hw, y - hh, z], [x - hw, y - hh, z], [x - hw, y + hh, z], [x + hw, y + hh, z]]
          : [[x - hw, y - hh, z], [x + hw, y - hh, z], [x + hw, y + hh, z], [x - hw, y + hh, z]];
  for (const c of corners) P.push(...c);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const uv = [0, 0, rep[0], 0, rep[0], rep[1], 0, rep[1]]; // repeats are folded into the cell by fract in UV space only for rep 1 (larger surfaces just stretch the noise cells)
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv.map((q, i) => (i % 2 ? v0 + Math.min(1, q) * vv : u0 + Math.min(1, q) * uu)), 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); D.push(g);
}
function mergeDecals(list) { let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index.count; } const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint16Array(ni); let o = 0, oi = 0;
  for (const g of list) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); const I = g.index.array; for (let i = 0; i < I.length; i++) idx[oi + i] = I[i] + o; o += c; oi += I.length; g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere(); return g; }
const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

// shell common to both: floor slab, walls, ceiling, partition, door-frame lips, the step edge
function shell(b, cWall, cFloor, cCeil) {
  const { x0, x1, y0, y1, z0, z1 } = RC; const W = x1 - x0, L = z1 - z0;
  b.box(0, y0 - 0.02, (z0 + z1) / 2, W + 0.04, 0.04, L, cFloor); b.box(0, y1 + 0.015, (z0 + z1) / 2, W + 0.04, 0.03, L, cCeil);
  for (const s of [-1, 1]) b.box(s * (x1 + 0.01), (y0 + y1) / 2, (z0 + z1) / 2, 0.02, y1 - y0, L, cWall);
  b.box(0, (y0 + y1) / 2, z1 + 0.01, W, y1 - y0, 0.02, cWall);
  b.box(0, y0 + 0.003, z0 + 0.03, W, 0.006, 0.06, C('#d9c400')); // yellow step edge
  for (const s of [-1, 1]) b.box(s * (x1 - 0.03), (y0 + y1) / 2, z0 + 0.02, 0.06, y1 - y0, 0.04, C('#9aa1a3')); // door frame lips
  b.box(0, y1 - 0.03, z0 + 0.02, W, 0.06, 0.04, C('#9aa1a3'));
}
let GEO = {};
export function compartmentGeometry(kind) {
  if (GEO[kind]) return GEO[kind]; atlas(); const b = new MiniBuilder(); const D = []; const L = [];
  const { x0, x1, y0, y1, z0, z1 } = RC; const zc = (z0 + z1) / 2, Lz = z1 - z0;
  const led = (x, z, w, l) => { const g = new THREE.BoxGeometry(w, 0.012, l); g.translate(x, y1 - 0.006, z); L.push(g); };
  if (kind === 'amb') {
    const wall = C('#e3e9e7'), panel = C('#d2dad7'), grn = C('#1e6e3a'), grnD = C('#17592f'), alu = C('#b9bfc2'), dark = C('#2a2e31');
    shell(b, wall, C('#454c52'), C('#eef2f1'));
    // left: bench seat (locker base, squab, back cushions, belts), overhead cabinets, grab rail
    b.box(-0.58, y0 + 0.21, -0.85, 0.44, 0.42, 2.0, panel); for (let i = 0; i < 4; i++) b.box(-0.355, y0 + 0.21, -1.75 + i * 0.6, 0.006, 0.36, 0.5, C('#b5bebb')); // locker doors
    b.box(-0.58, y0 + 0.47, -0.85, 0.46, 0.1, 2.0, grn); b.box(-0.36, y0 + 0.47, -0.85, 0.02, 0.1, 2.0, grnD);
    for (let i = 0; i < 3; i++) { b.box(-0.765, y0 + 0.78, -1.5 + i * 0.66, 0.07, 0.42, 0.6, grn); b.box(-0.73, y0 + 0.78, -1.5 + i * 0.66, 0.006, 0.38, 0.56, grnD); }
    for (let i = 0; i < 3; i++) { b.box(-0.73, y0 + 0.72, -1.5 + i * 0.66 + 0.2, 0.012, 0.5, 0.04, dark); b.box(-0.45, y0 + 0.53, -1.5 + i * 0.66 + 0.2, 0.3, 0.012, 0.04, dark); b.box(-0.42, y0 + 0.535, -1.5 + i * 0.66 + 0.2, 0.05, 0.02, 0.06, alu); } // seat belts + buckles
    b.box(-0.63, y1 - 0.2, -0.85, 0.34, 0.38, 2.6, panel); decal(D, -0.459, y1 - 0.2, -0.85, 2.5, 0.34, '+x', 'cabinets');
    // right: counter + drawers, worktop, monitor bracket, outlets, suction, O2 cylinder in its strap, attendant seat at the front
    b.box(0.62, y0 + 0.24, -0.3, 0.36, 0.48, 1.3, panel); decal(D, 0.439, y0 + 0.24, -0.3, 1.25, 0.44, '-x', 'drawers'); b.box(0.61, y0 + 0.49, -0.3, 0.4, 0.025, 1.34, C('#c7cfcc'));
    b.box(0.74, y0 + 0.82, -0.55, 0.1, 0.3, 0.36, dark); decal(D, 0.689, y0 + 0.82, -0.55, 0.34, 0.28, '-x', 'monitor'); b.box(0.785, y0 + 0.62, -0.55, 0.03, 0.12, 0.05, alu);
    decal(D, 0.789, y0 + 0.82, 0.1, 0.32, 0.32, '-x', 'outlets');
    b.cyl(0.66, y0 + 0.45, -1.62, 0.09, 0.9, C('#1e1f21'), false, 14); b.cyl(0.66, y0 + 0.86, -1.62, 0.09, 0.08, C('#f2f2f0'), false, 14); b.cyl(0.66, y0 + 0.93, -1.62, 0.03, 0.06, alu, false, 8);
    for (const y of [0.3, 0.65]) b.box(0.66, y0 + y, -1.62, 0.2, 0.04, 0.2, C('#3c4246')); // O2 straps
    b.box(0.6, y0 + 0.32, 0.25, 0.36, 0.06, 0.34, grn); b.box(0.6, y0 + 0.62, 0.43, 0.36, 0.5, 0.06, grn); b.box(0.6, y0 + 0.15, 0.25, 0.06, 0.3, 0.06, alu); // attendant seat
    b.box(0.63, y1 - 0.2, -1.1, 0.32, 0.38, 2.0, panel); decal(D, 0.469, y1 - 0.2, -1.1, 1.95, 0.34, '-x', 'cabinets');
    // floor: two cot rails + the front lock; ceiling: grab rails, IV hooks; partition
    for (const x of [-0.2, 0.2]) b.box(x, y0 + 0.01, zc - 0.2, 0.04, 0.02, Lz - 0.5, alu); b.box(0, y0 + 0.04, z1 - 0.18, 0.5, 0.08, 0.14, C('#c8b02a'));
    for (const x of [-0.32, 0.32]) { const g = new THREE.CylinderGeometry(0.016, 0.016, Lz - 0.4, 8); g.rotateX(Math.PI / 2); g.translate(x, y1 - 0.08, zc); b.geo(g, alu); g.dispose(); for (const z of [z0 + 0.4, z1 - 0.4]) b.box(x, y1 - 0.04, z, 0.02, 0.08, 0.02, alu); }
    for (let i = 0; i < 3; i++) b.box(0, y1 - 0.03, -1.6 + i * 0.7, 0.02, 0.05, 0.02, alu); // IV hooks
    decal(D, 0, (y0 + y1) / 2, z1 - 0.001, 1.56, y1 - y0, '-z', 'partition'); b.box(-0.55, y0 + 0.75, z1 - 0.07, 0.16, 0.24, 0.12, C('#f2c21a')); b.box(-0.55, y0 + 0.86, z1 - 0.07, 0.16, 0.03, 0.12, C('#c41f1f')); // sharps bin
    decal(D, 0, y0 + 0.002, zc, x1 - x0, Lz, '+y', 'vinyl'); // floor
    b.box(-0.5, y0 + 0.62, -1.9, 0.3, 0.2, 0.42, C('#b8231d')); b.box(-0.5, y0 + 0.62, -1.9, 0.305, 0.03, 0.43, C('#d9dcd6')); // response bag on the bench
    led(-0.05, -1.4, 0.5, 0.3); led(-0.05, -0.2, 0.5, 0.3); // LED panels
  } else {
    const steel = C('#8c9296'), dark = C('#3b4146'), ply = C('#a68c66'), yel = C('#e8c414'), org = C('#ff6a00');
    shell(b, C('#c9cdca'), C('#2a2c2e'), C('#d9dcd9'));
    // left: steel racking (uprights, 3 shelves) over a drawer unit; tool cases, parts bins, battery tester on the shelves
    for (const z of [-2.15, -1.25, -0.35, 0.4]) b.box(-0.45, (y0 + y1) / 2, z, 0.04, y1 - y0 - 0.02, 0.04, steel);
    for (const y of [0.55, 0.92, 1.25]) b.box(-0.62, y0 + y, -0.9, 0.36, 0.025, 2.6, steel);
    b.box(-0.62, y0 + 0.27, -0.0, 0.36, 0.54, 0.75, dark); decal(D, -0.439, y0 + 0.27, 0.0, 0.72, 0.5, '+x', 'vdrawers');
    decal(D, -0.44, y0 + 0.64, -1.0, 1.4, 0.16, '+x', 'cases'); b.box(-0.62, y0 + 0.64, -1.0, 0.34, 0.16, 1.42, C('#2c2f33'));
    decal(D, -0.44, y0 + 1.0, -0.9, 1.6, 0.13, '+x', 'bins'); b.box(-0.63, y0 + 1.0, -0.9, 0.32, 0.13, 1.62, C('#202326'));
    b.box(-0.6, y0 + 1.36, -1.7, 0.3, 0.2, 0.3, C('#e8b414')); decal(D, -0.449, y0 + 1.36, -1.7, 0.28, 0.18, '+x', 'tester'); // battery tester
    b.box(-0.6, y0 + 1.33, -0.6, 0.32, 0.14, 0.6, C('#1d4f8a')); b.box(-0.6, y0 + 1.33, 0.15, 0.32, 0.14, 0.4, C('#c4161c')); // cases on the top shelf
    // right: cone / triangle bay, straps on hooks, air-line reel, ply lining
    b.box(0.785, y0 + 0.4, -0.9, 0.02, 0.8, 2.8, ply);
    for (let i = 0; i < 4; i++) { b.box(0.76, y0 + 1.05, -0.2 + i * 0.12, 0.03, 0.03, 0.03, steel); b.box(0.75, y0 + 0.86, -0.2 + i * 0.12, 0.012, 0.36, 0.05, yel); b.box(0.74, y0 + 0.7, -0.2 + i * 0.12, 0.03, 0.06, 0.07, steel); } // ratchet straps
    { const g = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 20); g.rotateZ(Math.PI / 2); g.translate(0.7, y0 + 1.25, -1.2); b.geo(g, C('#1d4f8a')); g.dispose(); const h = new THREE.CylinderGeometry(0.08, 0.08, 0.13, 12); h.rotateZ(Math.PI / 2); h.translate(0.7, y0 + 1.25, -1.2); b.geo(h, C('#1a1a1a')); h.dispose(); } // air-line reel
    b.box(0.62, y0 + 1.5, -0.6, 0.34, 0.025, 2.2, steel); b.box(0.62, y0 + 1.6, -0.3, 0.3, 0.16, 0.5, C('#3a3d40')); b.box(0.62, y0 + 1.6, 0.25, 0.3, 0.16, 0.4, C('#d9a514')); // top shelf with cases
    b.box(0.56, y0 + 0.012, -1.8, 0.44, 0.024, 0.8, C('#4a3a2a')); // jack board
    // floor rubber, step plate, pegboard partition, tie-down rails
    decal(D, 0, y0 + 0.002, zc, x1 - x0, Lz, '+y', 'rubber'); b.box(0, y0 + 0.004, z0 + 0.12, x1 - x0, 0.008, 0.18, C('#9aa0a4'));
    for (const s of [-1, 1]) b.box(s * 0.77, y0 + 0.08, zc, 0.03, 0.03, Lz - 0.2, steel);
    decal(D, 0, (y0 + y1) / 2 + 0.1, z1 - 0.001, 1.56, y1 - y0 - 0.2, '-z', 'pegboard');
    led(0, -1.5, 0.12, 0.9); led(0, -0.2, 0.12, 0.9); void org;
  }
  const body = b.build(); const dec = mergeDecals(D); let ledG = null; if (L.length) { const lb = new MiniBuilder(); for (const g of L) { lb.geo(g, [1, 1, 1]); g.dispose(); } ledG = lb.build(); }
  GEO[kind] = { body, dec, led: ledG }; return GEO[kind];
}
export function buildCompartment(kind) {
  const G = compartmentGeometry(kind), M = mats(); const grp = new THREE.Group(); grp.name = 'rearCompartment_' + kind;
  for (const [g, m] of [[G.body, M.body], [G.dec, M.decal], [G.led, M.led]]) { if (!g) continue; const mesh = new THREE.Mesh(g, m); mesh.castShadow = false; mesh.receiveShadow = false; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); grp.add(mesh); }
  grp.visible = false; return grp;
}
// the engine-bay texture cell (Roadside's raised-bonnet kit uses the same atlas)
export function bayUV() { atlas(); const [cx, cy, cw, ch] = A.bay; return [cx / 8, 1 - (cy + ch) / 8, (cx + cw) / 8, 1 - cy / 8]; }
export function compartmentMats() { return mats(); }
