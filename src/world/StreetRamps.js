// Street ramps (45th request): speed humps outside the school, the National Hospital and the markets, six car stunt jumps
// and eleven bicycle ramps (kickers, a quarter-pipe, fun-boxes, long launch ramps).
//
// Everything here is a ground SURFACE, not a collider: Layout.groundY() asks rampGroundY() first, so vehicles (per-wheel
// contact in Vehicle.contact), walkers (Collision.groundAt → surfaceY) and AI cars (v.y = groundY) all ride the same shape
// the mesh shows. Lookups go through a 32 m hash grid, so the hot groundY path costs one Map lookup where there is nothing.
//
// Draw cost: all ramps + humps share seven merged meshes (one per material) for the whole city; two 512² canvas textures
// (plywood, steel tread plate) are the only new textures.
import * as THREE from 'three';
import * as L from './Layout.js';
import { MultiBuilder, meshFor } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';

const CELL = 32; const GRID = new Map(); const key = (ix, iz) => ix * 4096 + iz;
const reg = (o) => { for (let ix = Math.floor(o.bb[0] / CELL); ix <= Math.floor(o.bb[1] / CELL); ix++) for (let iz = Math.floor(o.bb[2] / CELL); iz <= Math.floor(o.bb[3] / CELL); iz++) { const k = key(ix, iz); let a = GRID.get(k); if (!a) GRID.set(k, (a = [])); a.push(o); } };

// ---------------------------------------------------------------- profiles: height above the base at distance u along the axis
// (null = off the ramp). Shapes after real build guides: kickers are circular-ish transitions steepening to the lip, the
// quarter-pipe a true arc to near-vertical with a deck, fun-boxes straight 27° banks either side of a flat top.
const PROFILES = {
  kicker: (r) => { r.len = r.L; r.prof = (u) => r.H * (u / r.L) ** 2; r.lip = r.L; r.slopeAt = (u) => 2 * r.H * u / (r.L * r.L); },
  launch: (r) => { r.len = r.L; r.prof = (u) => r.H * (0.35 * (u / r.L) + 0.65 * (u / r.L) ** 2); r.lip = r.L; r.slopeAt = (u) => r.H * (0.35 + 1.3 * u / r.L) / r.L; },
  landing: (r) => { r.len = r.L; r.prof = (u) => r.H * (1 - u / r.L) ** 1.15; r.lip = null; },
  funbox: (r) => { const a = r.H / Math.tan(0.47); r.bank = a; r.len = 2 * a + r.top; r.prof = (u) => (u < a ? r.H * u / a : u < a + r.top ? r.H : r.H * (r.len - u) / a); r.lip = a; },
  qp: (r) => { const R = r.R; const ua = Math.sqrt(R * R - (R - r.H) ** 2); r.arc = ua; r.len = ua + r.deck; r.prof = (u) => (u < ua ? R - Math.sqrt(Math.max(0, R * R - u * u)) : r.H); r.lip = ua; },
  dirt: (r) => { r.len = r.L + r.back; r.prof = (u) => (u <= r.L ? r.H * (u / r.L) ** 1.7 : r.H * Math.max(0, 1 - (u - r.L) / r.back)); r.lip = r.L; },
};

// ---------------------------------------------------------------- the six car jumps and eleven bicycle ramps
// (x, z) = start of the ramp's profile on its centre line, (dx, dz) = travel direction. Sites were picked from aerial
// scans of open lots / lawns / plazas, and a dev probe checks each ramp's footprint and run-out for colliders, water and
// road. clear = metres past the lip to count as cleared (car jumps with a landing ramp: reaching the landing's crest —
// a sedan with a ~60 m run-up leaves the lip at ~21 m/s and flies ~25 m).
const CAR_JUMPS = [
  { id: 'gfgreen', name: 'Galle Face Green', x: -422, z: -303, dx: 0, dz: -1, shape: 'launch', L: 11, H: 1.75, w: 4.4, mat: 'steel', land: { gap: 21, L: 12, H: 1.25 }, clear: 21 },
  { id: 'port', name: 'Port Access Yard', x: -480, z: -1063, dx: 0, dz: -1, shape: 'launch', L: 10, H: 1.6, w: 4.6, mat: 'ply', clear: 20 },
  { id: 'kotahena', name: 'Kotahena Lot', x: 308, z: -1139, dx: 0, dz: -1, shape: 'launch', L: 11, H: 1.8, w: 4.4, mat: 'steel', land: { gap: 22, L: 12, H: 1.3 }, clear: 22 },
  { id: 'maradana', name: 'Maradana Yard', x: 342, z: -461, dx: 0, dz: -1, shape: 'launch', L: 10, H: 1.5, w: 4.2, mat: 'concrete', clear: 18 },
  { id: 'havelock', name: 'Havelock Dirt Lot', x: 359, z: 1032, dx: -1, dz: 0, shape: 'dirt', L: 10, back: 4, H: 1.6, w: 4.6, side: 1.0, mat: 'dirt', land: { gap: 19, L: 13, H: 1.2, dirt: true }, clear: 19 },
  { id: 'wellawatte', name: 'Wellawatte Lot', x: -101, z: 1032, dx: 1, dz: 0, shape: 'launch', L: 11, H: 1.7, w: 4.4, mat: 'steel', clear: 20 },
];
const BIKE_RAMPS = [
  { id: 'b_gf_kick', name: 'Galle Face kicker', x: -418, z: -522, dx: -1, dz: 0, shape: 'kicker', L: 2.4, H: 0.7, w: 1.8, mat: 'ply', clear: 4 },
  { id: 'b_gf_qp', name: 'Galle Face quarter-pipe', x: -432, z: -370, dx: -1, dz: 0, shape: 'qp', R: 2.4, H: 1.9, deck: 1.4, w: 3.6, mat: 'ply', clear: 0 },
  { id: 'b_beira_box', name: 'Beira lawn fun-box', x: 56, z: -634, dx: 1, dz: 0, shape: 'funbox', H: 0.85, top: 2.4, w: 2.4, mat: 'ply', clear: 3.5 },
  { id: 'b_hav_launch', name: 'Havelock long launch', x: 100, z: 958, dx: 1, dz: 0, shape: 'launch', L: 7.5, H: 1.25, w: 2, mat: 'ply', clear: 4.6 },
  { id: 'b_hav_kick', name: 'Havelock dirt kicker', x: 256, z: 958, dx: 1, dz: 0, shape: 'dirt', L: 3.2, back: 2, H: 0.9, w: 1.8, side: 1.2, mat: 'dirt', clear: 4 },
  { id: 'b_well_kick', name: 'Wellawatte kicker', x: -262, z: 1102, dx: 1, dz: 0, shape: 'kicker', L: 2.2, H: 0.6, w: 1.6, mat: 'steel', clear: 3.5 },
  { id: 'b_cin_box', name: 'Cinnamon Gardens fun-box', x: -144, z: 250, dx: 1, dz: 0, shape: 'funbox', H: 0.7, top: 2.0, w: 2.2, mat: 'concrete', clear: 3 },
  { id: 'b_port_kick', name: 'Port kicker', x: 140, z: -1018, dx: 0, dz: -1, shape: 'kicker', L: 2.6, H: 0.8, w: 1.8, mat: 'steel', clear: 4.5 },
  { id: 'b_kol_kick', name: 'Kollupitiya kicker', x: -328, z: -22, dx: 1, dz: 0, shape: 'kicker', L: 2.0, H: 0.5, w: 1.6, mat: 'ply', clear: 3 },
  { id: 'b_mar_launch', name: 'Maradana long launch', x: 348, z: -518, dx: -1, dz: 0, shape: 'launch', L: 7, H: 1.1, w: 2, mat: 'steel', clear: 4.3 },
  { id: 'b_bor_kick', name: 'Borella kicker', x: 612, z: 358, dx: 1, dz: 0, shape: 'kicker', L: 2.4, H: 0.75, w: 1.8, mat: 'concrete', clear: 4 },
];

export const RAMPS = []; // every ramp surface (car jumps carry their landing ramp as a second entry)
export const STUNTS = []; // {id, name, kind: 'car'|'bike', ramp, landing, clear, lipPt}
function addRamp(d, kind, base = L.LAND_Y) {
  const r = { ...d, kind, base, side: d.side || 0 }; PROFILES[d.shape](r); r.lx = r.dz; r.lz = -r.dx; // left axis
  const hw = r.w / 2 + r.side; const ex = r.x + r.dx * r.len, ez = r.z + r.dz * r.len;
  r.bb = [Math.min(r.x, ex) - hw - 0.1, Math.max(r.x, ex) + hw + 0.1, Math.min(r.z, ez) - hw - 0.1, Math.max(r.z, ez) + hw + 0.1]; reg(r); RAMPS.push(r); return r;
}
for (const d of CAR_JUMPS) {
  const ramp = addRamp(d, 'car'); let landing = null;
  if (d.land) { const s = ramp.len + d.land.gap; landing = addRamp({ id: d.id + '_land', shape: d.land.dirt ? 'dirt' : 'landing', x: d.x + d.dx * s, z: d.z + d.dz * s, dx: d.dx, dz: d.dz, L: d.land.L, back: 0.01, H: d.land.H, w: d.land.dirt ? d.w : d.w + 1.2, side: d.side || 0, mat: d.mat, landing: true }, 'car');
    if (d.land.dirt) { landing.prof = (u) => (u < 2.6 ? d.land.H * (u / 2.6) ** 0.6 : d.land.H * (1 - (u - 2.6) / (d.land.L - 2.6)) ** 1.15); landing.len = d.land.L; } } // dirt landing: a mound with a short front bank
  STUNTS.push({ id: d.id, name: d.name, kind: 'car', ramp, landing, clear: d.clear });
}
for (const d of BIKE_RAMPS) { const ramp = addRamp(d, 'bike'); STUNTS.push({ id: d.id, name: d.name, kind: 'bike', ramp, landing: null, clear: d.clear, qp: d.shape === 'qp' }); }

// height of a ramp's surface at (x, z), or null when not on it; lateral falloff for dirt mounds
function rampH(r, x, z) {
  const px = x - r.x, pz = z - r.z; const u = px * r.dx + pz * r.dz; if (u < 0 || u > r.len) return null;
  const v = Math.abs(px * r.lx + pz * r.lz), hw = r.w / 2; if (v > hw + r.side) return null;
  const h = r.prof(u); if (h == null) return null; return r.base + (v <= hw ? h : h * (1 - (v - hw) / r.side));
}
export function rampAt(x, z) { const a = GRID.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!a) return null; for (const o of a) if (o.prof && x >= o.bb[0] && x <= o.bb[1] && z >= o.bb[2] && z <= o.bb[3] && rampH(o, x, z) != null) return o; return null; }

// ---------------------------------------------------------------- speed humps
// Placed on the street segments nearest each target (school gate, hospital frontage, market streets), at least 16 m
// from a junction, across the full carriageway. Profile: 3.7 m long, 75 mm high, cos² (the round-top shape used on
// Colombo municipal roads) — a car at 20 km/h rolls over, at 50 km/h the springs bottom out.
export const HUMPS = []; const HUMP_L = 3.7, HUMP_H = 0.075;
function planHumps() {
  const segs = L.segments.filter((s) => !s.crossing && !s.bridge && Math.hypot(s.x1 - s.x0, s.z1 - s.z0) > 40);
  const onSeg = (s, tx, tz) => { const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0), ux = (s.x1 - s.x0) / len, uz = (s.z1 - s.z0) / len; const t = Math.max(16, Math.min(len - 16, (tx - s.x0) * ux + (tz - s.z0) * uz)); return { s, x: s.x0 + ux * t, z: s.z0 + uz * t, ux, uz, d: Math.hypot(s.x0 + ux * t - tx, s.z0 + uz * t - tz) }; };
  const add = (c, why) => { if (HUMPS.some((h) => Math.hypot(h.x - c.x, h.z - c.z) < 50)) return; const h = { x: c.x, z: c.z, ux: c.ux, uz: c.uz, hw: c.s.hw, why, seg: c.s }; h.bb = [h.x - (Math.abs(h.ux) * HUMP_L / 2 + Math.abs(h.uz) * h.hw) - 0.1, h.x + (Math.abs(h.ux) * HUMP_L / 2 + Math.abs(h.uz) * h.hw) + 0.1, h.z - (Math.abs(h.uz) * HUMP_L / 2 + Math.abs(h.ux) * h.hw) - 0.1, h.z + (Math.abs(h.uz) * HUMP_L / 2 + Math.abs(h.ux) * h.hw) + 0.1]; h.hump = true; HUMPS.push(h); reg(h); };
  const nearRect = (rect, n, why) => { const [x0, x1, z0, z1] = rect; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; const c = segs.map((s) => onSeg(s, cx, cz)).filter((c) => c.x > x0 - 30 && c.x < x1 + 30 && c.z > z0 - 30 && c.z < z1 + 30).sort((a, b) => a.d - b.d); for (const q of c.slice(0, n)) add(q, why); };
  const Z = (id) => L.zoneById(id); if (Z('johns')) nearRect(Z('johns').rect, 2, 'school'); if (Z('hospital')) nearRect(Z('hospital').rect, 2, 'hospital'); if (Z('mall')) nearRect(Z('mall').rect, 1, 'market');
  const pet = segs.filter((s) => s.level >= 2 && L.districtIdAt((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2) === 'pettah').map((s) => onSeg(s, 35, -820)).sort((a, b) => a.d - b.d);
  let n = 0; for (const c of pet) { if (n >= 3) break; const k = HUMPS.length; add(c, 'market'); if (HUMPS.length > k) n++; }
}
planHumps();
function humpH(h, x, z) { const dx = x - h.x, dz = z - h.z; const t = dx * h.ux + dz * h.uz; if (Math.abs(t) > HUMP_L / 2) return null; if (Math.abs(dx * h.uz - dz * h.ux) > h.hw) return null; const c = Math.cos(Math.PI * t / HUMP_L); return L.ROAD_Y + HUMP_H * c * c; }
// distance along (fx, fz) to the next hump the vehicle's lane crosses (AI braking), Infinity if none within `range`
export function humpAhead(x, z, fx, fz, range = 36) { let best = Infinity; for (const h of HUMPS) { const dx = h.x - x, dz = h.z - z; if (Math.abs(dx) > range + h.hw || Math.abs(dz) > range + h.hw) continue; const along = dx * fx + dz * fz; if (along < -2 || along > range) continue; if (Math.abs(fx * h.ux + fz * h.uz) < 0.7) continue; if (Math.abs(dx * h.uz - dz * h.ux) > h.hw + 1) continue; if (along < best) best = along; } return best; }

// ---------------------------------------------------------------- the ground hook (Layout.groundY asks this first)
export function rampGroundY(x, z) {
  const a = GRID.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!a) return null; let best = null;
  for (let i = 0; i < a.length; i++) { const o = a[i]; if (x < o.bb[0] || x > o.bb[1] || z < o.bb[2] || z > o.bb[3]) continue; const h = o.hump ? humpH(o, x, z) : rampH(o, x, z); if (h != null && (best === null || h > best)) best = h; }
  return best;
}
L.setRampHook(rampGroundY);

// ---------------------------------------------------------------- textures (512², generated once)
function plywoodTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#b48d5e'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1400; i++) { const y = Math.random() * 512, x = Math.random() * 512, l = 30 + Math.random() * 140; g.strokeStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 25},${30 + Math.random() * 15},${0.08 + Math.random() * 0.14})`; g.lineWidth = 0.6 + Math.random() * 1.6; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + l * 0.3, y + (Math.random() - 0.5) * 6, x + l * 0.7, y + (Math.random() - 0.5) * 6, x + l, y + (Math.random() - 0.5) * 4); g.stroke(); }
  for (let i = 0; i < 9; i++) { const x = Math.random() * 512, y = Math.random() * 512; const r = g.createRadialGradient(x, y, 1, x, y, 10 + Math.random() * 10); r.addColorStop(0, 'rgba(70,42,20,0.55)'); r.addColorStop(1, 'rgba(70,42,20,0)'); g.fillStyle = r; g.fillRect(x - 22, y - 22, 44, 44); } // knots
  for (let i = 0; i < 26; i++) { const x = Math.random() * 512, y = Math.random() * 512, w = 60 + Math.random() * 180; const r = g.createRadialGradient(x, y, 2, x, y, w); r.addColorStop(0, 'rgba(40,32,26,0.22)'); r.addColorStop(1, 'rgba(40,32,26,0)'); g.fillStyle = r; g.fillRect(x - w, y - w, w * 2, w * 2); } // weathering / dirt
  g.strokeStyle = 'rgba(25,18,12,0.85)'; g.lineWidth = 2; for (const p of [0, 256]) { g.beginPath(); g.moveTo(0, p + 1); g.lineTo(512, p + 1); g.stroke(); g.beginPath(); g.moveTo(p + 1, 0); g.lineTo(p + 1, 512); g.stroke(); } // sheet joints (1.22 m)
  g.fillStyle = '#3b3530'; for (const p of [6, 250, 262, 506]) for (let k = 8; k < 512; k += 32) { g.beginPath(); g.arc(k, p, 2.2, 0, 7); g.fill(); g.beginPath(); g.arc(p, k, 2.2, 0, 7); g.fill(); } // screw lines
  for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(20,20,20,0.18)'; g.lineWidth = 14 + Math.random() * 10; const x = 120 + Math.random() * 280; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 40, 512); g.stroke(); } // tyre rubber
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function steelTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#9a9ea0'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 40; i++) { const x = Math.random() * 512, y = Math.random() * 512, w = 40 + Math.random() * 120; const r = g.createRadialGradient(x, y, 2, x, y, w); const rust = Math.random() < 0.35; r.addColorStop(0, rust ? 'rgba(120,64,30,0.35)' : 'rgba(30,30,30,0.25)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(x - w, y - w, w * 2, w * 2); }
  for (let y = 0; y < 512; y += 16) for (let x = 0; x < 512; x += 16) { const o = (y / 16) % 2 ? 8 : 0; const cx = x + o, cy = y + 8; g.save(); g.translate(cx, cy); g.rotate(((x + y) / 16) % 2 ? 0.785 : -0.785); g.fillStyle = 'rgba(190,195,200,0.55)'; g.fillRect(-6, -1.4, 12, 2.8); g.fillStyle = 'rgba(20,20,22,0.5)'; g.fillRect(-6, 1.4, 12, 1.2); g.restore(); } // raised diamond tread
  g.strokeStyle = 'rgba(15,15,15,0.7)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, 509, 509);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------------------------------------------------------------- geometry
const HAZ_Y = [0.95, 0.75, 0.1], HAZ_K = [0.06, 0.06, 0.06];
function buildRamp(mb, r) {
  const top = r.mat === 'steel' ? 'rSteel' : r.mat === 'ply' ? 'rPly' : r.mat === 'concrete' ? 'concrete' : 'laterite';
  const sideM = r.mat === 'steel' ? 'rSteel' : r.mat === 'ply' ? 'rPly' : top; const T = mb.get(top), S = mb.get(sideM);
  const curved = r.shape !== 'funbox'; const N = curved ? Math.max(6, Math.ceil(r.len / (r.shape === 'qp' ? 0.18 : 0.5))) : 0;
  const us = curved ? Array.from({ length: N + 1 }, (_, i) => (i / N) * r.len) : [0, r.bank, r.bank + r.top, r.len];
  if (r.shape === 'qp') { us.length = 0; const n = 16; for (let i = 0; i <= n; i++) us.push(r.arc * Math.sin((i / n) * Math.PI / 2)); us.push(r.len); }
  if (r.shape === 'dirt' || (r.landing && r.mat === 'dirt')) { const n = 14; us.length = 0; for (let i = 0; i <= n; i++) us.push((i / n) * r.len); }
  const W = (u, v, h) => [r.x + r.dx * u - r.lx * v, r.base + h, r.z + r.dz * u - r.lz * v]; /* v = to the RIGHT of travel (quads below are wound for that frame) */ const hw = r.w / 2; const uvS = r.mat === 'steel' ? 2.44 : r.mat === 'ply' ? 2.44 : 3;
  const dirt = r.mat === 'dirt';
  if (dirt) { // earth mound: top + sloped flanks (no vertical faces)
    const sd = r.side || 1.5; let acc = 0;
    for (let i = 0; i < us.length - 1; i++) { const a = us[i], b = us[i + 1], ha = r.prof(a), hb = r.prof(b); const sl = Math.hypot(b - a, hb - ha);
      T.quad(W(a, -hw, ha), W(a, hw, ha), W(b, hw, hb), W(b, -hw, hb), [acc / uvS, 0, (acc + sl) / uvS, r.w / uvS]);
      for (const sg of [1, -1]) { const p = [W(a, sg * hw, ha), W(a, sg * (hw + sd), 0), W(b, sg * (hw + sd), 0), W(b, sg * hw, hb)]; if (sg > 0) T.quad(p[0], p[1], p[2], p[3], [acc / uvS, 0, (acc + sl) / uvS, sd / uvS]); else T.quad(p[3], p[2], p[1], p[0], [acc / uvS, 0, (acc + sl) / uvS, sd / uvS]); }
      acc += sl; }
    return;
  }
  // deck (world-length UVs so plywood sheets / tread plate keep their size on the curve)
  let acc = 0; for (let i = 0; i < us.length - 1; i++) { const a = us[i], b = us[i + 1], ha = r.prof(Math.min(a, r.len - 1e-6)), hb = r.prof(Math.min(b, r.len - 1e-6)); const sl = Math.hypot(b - a, hb - ha); T.quad(W(a, -hw, ha), W(a, hw, ha), W(b, hw, hb), W(b, -hw, hb), [acc / uvS, -hw / uvS, (acc + sl) / uvS, hw / uvS]); acc += sl; }
  // side walls (fan of quads down to the ground)
  for (let i = 0; i < us.length - 1; i++) { const a = us[i], b = us[i + 1], ha = r.prof(Math.min(a, r.len - 1e-6)), hb = r.prof(Math.min(b, r.len - 1e-6)); if (ha < 1e-4 && hb < 1e-4) continue;
    S.quad(W(b, hw, 0), W(a, hw, 0), W(a, hw, ha), W(b, hw, hb), [b / uvS, 0, a / uvS, Math.max(ha, hb) / uvS]); S.quad(W(a, -hw, 0), W(b, -hw, 0), W(b, -hw, hb), W(a, -hw, ha), [a / uvS, 0, b / uvS, Math.max(ha, hb) / uvS]); }
  const hEnd = r.prof(r.len - 1e-6), h0 = r.prof(0);
  if (hEnd > 0.02) S.quad(W(r.len, hw, 0), W(r.len, -hw, 0), W(r.len, -hw, hEnd), W(r.len, hw, hEnd), [0, 0, r.w / uvS, hEnd / uvS]); // back panel
  if (h0 > 0.02) S.quad(W(0, -hw, 0), W(0, hw, 0), W(0, hw, h0), W(0, -hw, h0), [0, 0, r.w / uvS, h0 / uvS]); // landing ramp: front panel
  const P = mb.get('paint'), M = mb.get('metal');
  if (r.lip != null && r.mat !== 'concrete') { // painted hazard chevrons on the lip face + a steel lip / coping
    const hl = r.prof(Math.min(r.lip, r.len - 1e-6)); const n = Math.max(4, Math.round(r.w / 0.3)); const bh = Math.min(0.12, hl * 0.25);
    if (r.lip >= r.len - 1e-3) for (let k = 0; k < n; k++) { const v0 = -hw + (k / n) * r.w, v1 = -hw + ((k + 1) / n) * r.w; const c = k % 2 ? HAZ_K : HAZ_Y; P.quad(W(r.len + 0.004, v1, hl - bh), W(r.len + 0.004, v0, hl - bh), W(r.len + 0.004, v0, hl), W(r.len + 0.004, v1, hl), [0, 0, 1, 1], c); }
    if (r.shape === 'qp' || r.shape === 'funbox') { const u = r.lip;
      const a = W(u, -hw, hl + 0.025), b = W(u, hw, hl + 0.025); const steps = 8; for (let s = 0; s < steps; s++) { const q0 = s / steps, q1 = (s + 1) / steps; const p0 = [a[0] + (b[0] - a[0]) * q0, a[1], a[2] + (b[2] - a[2]) * q0], p1 = [a[0] + (b[0] - a[0]) * q1, a[1], a[2] + (b[2] - a[2]) * q1]; const dd = 0.03;
        M.quad([p0[0], p0[1] + dd, p0[2]], [p1[0], p1[1] + dd, p1[2]], [p1[0] + r.dx * dd, p1[1], p1[2] + r.dz * dd], [p0[0] + r.dx * dd, p0[1], p0[2] + r.dz * dd], [0, 0, 1, 1], [0.7, 0.72, 0.74]);
        M.quad([p0[0] - r.dx * dd, p0[1], p0[2] - r.dz * dd], [p1[0] - r.dx * dd, p1[1], p1[2] - r.dz * dd], [p1[0], p1[1] + dd, p1[2]], [p0[0], p0[1] + dd, p0[2]], [0, 0, 1, 1], [0.7, 0.72, 0.74]); } } // coping pipe (diamond section)
    if (r.kind === 'car') for (const sg of [-1, 1]) for (let u = 0.6; u < r.len; u += 2.2) { const hu = r.prof(u); if (hu < 0.25) continue; M.box(...W(u, sg * (hw + 0.04), hu / 2), 0.08, hu, 0.08, { col: [0.32, 0.33, 0.34], rotY: Math.atan2(r.dx, r.dz) }); } // side frame posts
  }
  if (r.kind === 'car') { // yellow/black edge bands along both deck edges
    for (const sg of [-1, 1]) for (let i = 0; i < us.length - 1; i++) { const a = us[i], b = us[i + 1], ha = r.prof(Math.min(a, r.len - 1e-6)), hb = r.prof(Math.min(b, r.len - 1e-6)); const c = Math.floor((a + 0.001) / 0.6) % 2 ? HAZ_K : HAZ_Y; const v0 = sg * hw, v1 = sg * (hw - 0.14);
      if (sg > 0) P.quad(W(a, v1, ha + 0.006), W(a, v0, ha + 0.006), W(b, v0, hb + 0.006), W(b, v1, hb + 0.006), [0, 0, 1, 1], c); else P.quad(W(a, v0, ha + 0.006), W(a, v1, ha + 0.006), W(b, v1, hb + 0.006), W(b, v0, hb + 0.006), [0, 0, 1, 1], c); }
  }
}
function buildHump(mb, h) {
  const R = mb.get('road'), K = mb.get('marking'); const n = 10; const px = h.uz, pz = -h.ux; /* across the road, toward the LEFT of +u travel (sign s>0 on the left kerb for +u traffic) */
  const P = (t, s, dy = 0) => { const c = Math.cos(Math.PI * t / HUMP_L); return [h.x + h.ux * t + px * s, L.ROAD_Y + HUMP_H * c * c + 0.004 + dy, h.z + h.uz * t + pz * s]; };
  for (let i = 0; i < n; i++) { const t0 = -HUMP_L / 2 + (i / n) * HUMP_L, t1 = -HUMP_L / 2 + ((i + 1) / n) * HUMP_L; R.quad(P(t0, h.hw), P(t0, -h.hw), P(t1, -h.hw), P(t1, h.hw), [(h.x + h.ux * t0) / 4, -h.hw / 4, (h.x + h.ux * t1) / 4, h.hw / 4]); }
  const W = 0.45; for (let s = -h.hw + 0.2; s + W < h.hw - 0.1; s += W * 2) for (let i = 1; i < n - 1; i++) { const t0 = -HUMP_L / 2 + (i / n) * HUMP_L, t1 = -HUMP_L / 2 + ((i + 1) / n) * HUMP_L; const sk = (i - n / 2) * 0.06; K.quad(P(t0, s + W + sk, 0.003), P(t0, s + sk, 0.003), P(t1, s + sk + 0.06, 0.003), P(t1, s + W + sk + 0.06, 0.003), [0, 0, 1, 1], [0.93, 0.93, 0.9]); } // painted diagonal bars
  // warning sign on the kerb each approach: triangular, red border, white field, black hump symbol
  const M = mb.get('metal'), S = mb.get('paint');
  for (const sg of [1, -1]) { const t = -sg * 14, s = sg * (h.hw + 0.6); const bx = h.x + h.ux * t + px * s, bz = h.z + h.uz * t + pz * s, by = L.LAND_Y;
    M.cylinder(bx, by, bz, 0.035, 0.035, 2.35, 6, { col: [0.55, 0.57, 0.58] });
    const fx = -sg * h.ux, fz = -sg * h.uz; const ax = -fz, az = fx; const cy = by + 2.05; const tri = (rad, off, col) => { const pts = [0, 1, 2].map((k) => { const a = Math.PI / 2 + k * 2 * Math.PI / 3; return [bx + fx * off + ax * Math.cos(a) * rad, cy + Math.sin(a) * rad, bz + fz * off + az * Math.cos(a) * rad]; }); S.quad(pts[0], pts[2], pts[1], pts[1], [0, 0, 1, 1], col); S.quad(pts[0], pts[1], pts[2], pts[2], [0, 0, 1, 1], [0.35, 0.36, 0.37]); };
    tri(0.42, 0.045, [0.72, 0.06, 0.05]); tri(0.31, 0.05, [0.95, 0.95, 0.93]);
    const hump = []; for (let k = 0; k <= 6; k++) { const q = k / 6; hump.push([(q - 0.5) * 0.34, Math.sin(q * Math.PI) * 0.07 - 0.1]); }
    for (let k = 0; k < 6; k++) { const [u0, v0] = hump[k], [u1, v1] = hump[k + 1]; const q = (u, v) => [bx + fx * 0.056 + ax * u, cy + v, bz + fz * 0.056 + az * u]; S.quad(q(u0, -0.12), q(u1, -0.12), q(u1, v1), q(u0, v0), [0, 0, 1, 1], [0.05, 0.05, 0.05]); }
  }
}
export function buildStreetRamps() {
  const mats = { ...MAT, rPly: new THREE.MeshStandardMaterial({ map: plywoodTex(), roughness: 0.85 }), rSteel: new THREE.MeshStandardMaterial({ map: steelTex(), roughness: 0.6, metalness: 0.15 }) /* galvanised tread plate: no env map in the city, so a high metalness renders near-black */ };
  for (const k of ['rPly', 'rSteel']) mats[k].map.repeat.set(1, 1);
  const mb = new MultiBuilder(); for (const r of RAMPS) buildRamp(mb, r); for (const h of HUMPS) buildHump(mb, h);
  const group = new THREE.Group(); group.name = 'streetRamps'; for (const m of mb.toMeshes(mats, { cast: true, receive: true })) { if (m.name === 'road' || m.name === 'marking') m.castShadow = false; group.add(m); }
  return { group, ramps: RAMPS, humps: HUMPS, stunts: STUNTS };
}
