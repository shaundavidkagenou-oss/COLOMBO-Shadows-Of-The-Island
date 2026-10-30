// City map system: GPS routing over the real road graph + the full-screen interactive map.
//
// Gps     — Dijkstra over Layout's road segments/intersections (main roads slightly preferred, like a driver would), from
//           the point on the nearest road to the player to the point on the nearest road to the target. Re-plans when
//           the player leaves the line. Used for the player waypoint and, when no waypoint is set, the mission objective.
// MapView — original vector map (not a raster scaled up): water with depth shading and shoreline, district tint, every
//           building footprint from the city plan shaded by height, parks with their real paths and tree canopy,
//           railway with stations, cased roads by class with street names along them, landmark/shop/mission/police/
//           collectible icons with a filterable legend, hover read-out (district, street, blip name), scale bar and
//           compass, smooth zoom at the cursor, keyboard/mouse pan, and waypoint placement with the route drawn on it.
import { SAT } from './Satellite.js';
import * as L from '../world/Layout.js';
import { plan } from '../world/CityPlan.js';
import { PATH_SEGS, PATH_RINGS, PLAZAS, BEDS, HEDGES } from '../world/Parks.js';

// ----------------------------------------------------------------------------- GPS
class Heap { constructor() { this.a = []; } push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; } get size() { return this.a.length; } }
const COST = [0.86, 0.93, 1.0, 1.18]; // per road class: arterials are quicker
export function segEnds(s) { return s.dir === 'v' ? [L.nodeAt(s.i, s.j), L.nodeAt(s.i, s.j + 1)] : [L.nodeAt(s.i, s.j), L.nodeAt(s.i + 1, s.j)]; }
export function nearestOnRoad(x, z) {
  let best = null, bd = Infinity;
  for (const s of L.segments) { const dx = s.x1 - s.x0, dz = s.z1 - s.z0, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - s.x0) * dx + (z - s.z0) * dz) / l2)); const px = s.x0 + dx * t, pz = s.z0 + dz * t; const d = Math.hypot(x - px, z - pz); if (d < bd) { bd = d; best = { s, t, x: px, z: pz, d }; } }
  return best;
}
export function gpsRoute(x0, z0, x1, z1) {
  const A = nearestOnRoad(x0, z0), Bt = nearestOnRoad(x1, z1); if (!A || !Bt) return null;
  if (A.s === Bt.s) { const pts = [[x0, z0], [A.x, A.z], [Bt.x, Bt.z], [x1, z1]]; return { pts: dedupe(pts), len: Math.hypot(Bt.x - A.x, Bt.z - A.z) }; }
  const dist = new Map(), prev = new Map(), h = new Heap();
  const [a0, a1] = segEnds(A.s); const la = Math.hypot(A.s.x1 - A.s.x0, A.s.z1 - A.s.z0);
  const c0 = la * A.t * COST[A.s.level], c1 = la * (1 - A.t) * COST[A.s.level];
  if (a0) { dist.set(a0, c0); h.push(c0, a0); } if (a1) { dist.set(a1, Math.min(dist.get(a1) ?? Infinity, c1)); h.push(c1, a1); }
  const [b0, b1] = segEnds(Bt.s); const lb = Math.hypot(Bt.s.x1 - Bt.s.x0, Bt.s.z1 - Bt.s.z0);
  while (h.size) {
    const [d, n] = h.pop(); if (d > (dist.get(n) ?? Infinity)) continue; if ((n === b0 || n === b1) && dist.has(b0) && dist.has(b1) && d > Math.max(dist.get(b0), dist.get(b1))) break;
    for (const s of n.segs) { const [p, q] = segEnds(s); const o = p === n ? q : p; if (!o) continue; const nd = d + Math.hypot(s.x1 - s.x0, s.z1 - s.z0) * COST[s.level]; if (nd < (dist.get(o) ?? Infinity)) { dist.set(o, nd); prev.set(o, n); h.push(nd, o); } }
  }
  const e0 = (dist.get(b0) ?? Infinity) + lb * Bt.t * COST[Bt.s.level], e1 = (dist.get(b1) ?? Infinity) + lb * (1 - Bt.t) * COST[Bt.s.level];
  if (!isFinite(e0) && !isFinite(e1)) return null;
  let n = e0 <= e1 ? b0 : b1; const chain = []; while (n) { chain.push(n); n = prev.get(n); } chain.reverse();
  const pts = [[x0, z0], [A.x, A.z], ...chain.map((k) => [k.x, k.z]), [Bt.x, Bt.z], [x1, z1]];
  let len = 0; for (let i = 1; i < pts.length - 1; i++) len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return { pts: dedupe(pts), len };
}
function dedupe(p) { const o = [p[0]]; for (let i = 1; i < p.length; i++) if (Math.hypot(p[i][0] - o[o.length - 1][0], p[i][1] - o[o.length - 1][1]) > 0.05 || i === p.length - 1) o.push(p[i]); return o; }
export class Gps {
  constructor() { this.target = null; this.route = null; this.t = 0; this.from = null; }
  set(x, z, kind = 'waypoint') { this.target = { x, z, kind }; this.route = this.last ? gpsRoute(this.last[0], this.last[1], x, z) : null; this.from = this.last; this.t = 0; }
  clear() { this.target = null; this.route = null; }
  update(dt, px, pz) {
    this.last = [px, pz]; if (!this.target) return; this.t += dt;
    const off = this.route ? distToPolyline(px, pz, this.route.pts) : Infinity;
    if (!this.route || (this.t > 1.2 && (off > 14 || Math.hypot(px - this.from[0], pz - this.from[1]) > 40))) { this.route = gpsRoute(px, pz, this.target.x, this.target.z); this.t = 0; this.from = [px, pz]; }
    else if (this.route) { this.route.pts[0] = [px, pz]; }
  }
  remaining(px, pz) { if (!this.route) return this.target ? Math.hypot(this.target.x - px, this.target.z - pz) : 0; const p = this.route.pts; let best = 1, bd = Infinity; for (let i = 1; i < p.length - 1; i++) { const d = segDist(px, pz, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]); if (d < bd) { bd = d; best = i; } } let len = Math.hypot(p[best + 1][0] - px, p[best + 1][1] - pz); for (let i = best + 1; i < p.length - 1; i++) len += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); return len; }
}
function segDist(x, z, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); return Math.hypot(x - ax - dx * t, z - az - dz * t); }
function distToPolyline(x, z, p) { let d = Infinity; for (let i = 1; i < p.length - 1; i++) d = Math.min(d, segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])); return d; }

// ----------------------------------------------------------------------------- icons (original glyphs)
export const BLIP_STYLE = {
  objective: { col: '#ffb020', cat: 'missions', name: 'Objective' }, mission: { col: '#f4efe6', cat: 'missions', name: 'Story mission' },
  side: { col: '#5ac8a8', cat: 'activities', name: 'Side activity' }, shop: { col: '#9ad06a', cat: 'services', name: 'Shop / service' },
  stamp: { col: '#d8a0ff', cat: 'collect', name: 'Heritage stamp' }, photo: { col: '#7ab8ff', cat: 'collect', name: 'Photo spot' },
  enemy: { col: '#ff4a3a', cat: 'missions', name: 'Target' }, waypoint: { col: '#33d4c0', cat: 'missions', name: 'Waypoint' },
  landmark: { col: '#e8a33a', cat: 'landmarks', name: 'Landmark' }, police: { col: '#5b8cff', cat: 'services', name: 'Police' },
  hospital: { col: '#ff5a5a', cat: 'services', name: 'Hospital' }, station: { col: '#d9c7a0', cat: 'transit', name: 'Railway station' },
  worship: { col: '#f2d27a', cat: 'landmarks', name: 'Place of worship' }, school: { col: '#9fd3a8', cat: 'landmarks', name: 'School' }, home: { col: '#7fd6ff', cat: 'services', name: 'Safehouse' },
};
export function drawIcon(g, kind, x, y, r = 9) {
  const st = BLIP_STYLE[kind] || { col: '#fff' }; g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(8,10,14,0.85)'; g.beginPath(); g.arc(0, 0, r + 2.5, 0, 7); g.fill();
  g.strokeStyle = st.col; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
  g.fillStyle = st.col; g.strokeStyle = st.col; g.lineWidth = 1.6; const k = r / 9;
  g.beginPath();
  switch (kind) {
    case 'objective': g.moveTo(0, -5 * k); g.lineTo(5 * k, 0); g.lineTo(0, 5 * k); g.lineTo(-5 * k, 0); g.closePath(); g.fill(); break;
    case 'mission': g.font = `bold ${11 * k}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', 0, 0.5); break;
    case 'side': g.moveTo(-4 * k, 4 * k); g.lineTo(0, -5 * k); g.lineTo(4 * k, 4 * k); g.stroke(); g.beginPath(); g.moveTo(-2.4 * k, 1 * k); g.lineTo(2.4 * k, 1 * k); g.stroke(); break;
    case 'shop': g.rect(-4 * k, -1.5 * k, 8 * k, 6 * k); g.fill(); g.beginPath(); g.arc(0, -1.5 * k, 2.6 * k, Math.PI, 0); g.stroke(); break;
    case 'stamp': for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5, b = a + Math.PI / 5; g.lineTo(Math.cos(a) * 5 * k, Math.sin(a) * 5 * k); g.lineTo(Math.cos(b) * 2.2 * k, Math.sin(b) * 2.2 * k); } g.closePath(); g.fill(); break;
    case 'photo': g.rect(-5 * k, -3 * k, 10 * k, 7 * k); g.fill(); g.fillStyle = 'rgba(8,10,14,0.9)'; g.beginPath(); g.arc(0, 0.5 * k, 2.2 * k, 0, 7); g.fill(); break;
    case 'enemy': g.arc(0, 0, 4 * k, 0, 7); g.fill(); break;
    case 'waypoint': g.moveTo(-3 * k, 5 * k); g.lineTo(-3 * k, -5 * k); g.stroke(); g.beginPath(); g.moveTo(-3 * k, -5 * k); g.lineTo(5 * k, -2.5 * k); g.lineTo(-3 * k, 0); g.closePath(); g.fill(); break;
    case 'landmark': g.arc(0, -1.2 * k, 3.2 * k, 0, 7); g.fill(); g.beginPath(); g.moveTo(-2.6 * k, 0); g.lineTo(0, 5 * k); g.lineTo(2.6 * k, 0); g.fill(); break;
    case 'police': g.moveTo(0, -5 * k); g.lineTo(4.5 * k, -3 * k); g.lineTo(3.5 * k, 2 * k); g.lineTo(0, 5 * k); g.lineTo(-3.5 * k, 2 * k); g.lineTo(-4.5 * k, -3 * k); g.closePath(); g.fill(); break;
    case 'school': g.moveTo(-5.5 * k, -1 * k); g.lineTo(0, -4.5 * k); g.lineTo(5.5 * k, -1 * k); g.lineTo(0, 2.5 * k); g.closePath(); g.fill(); g.beginPath(); g.moveTo(-3 * k, 0.6 * k); g.lineTo(-3 * k, 3.6 * k); g.quadraticCurveTo(0, 5.6 * k, 3 * k, 3.6 * k); g.lineTo(3 * k, 0.6 * k); g.lineTo(0, 2.5 * k); g.closePath(); g.fill(); break; /* mortarboard */
    case 'hospital': g.rect(-1.5 * k, -5 * k, 3 * k, 10 * k); g.rect(-5 * k, -1.5 * k, 10 * k, 3 * k); g.fill(); break;
    case 'station': g.rect(-4 * k, -4.5 * k, 8 * k, 7 * k); g.fill(); g.fillStyle = 'rgba(8,10,14,0.9)'; g.fillRect(-2.8 * k, -3.2 * k, 5.6 * k, 2.4 * k); g.fillStyle = st.col; g.beginPath(); g.moveTo(-3 * k, 3 * k); g.lineTo(-4.5 * k, 5.5 * k); g.moveTo(3 * k, 3 * k); g.lineTo(4.5 * k, 5.5 * k); g.stroke(); break;
    case 'worship': g.moveTo(-4.5 * k, 4 * k); g.lineTo(4.5 * k, 4 * k); g.lineTo(4.5 * k, 1 * k); g.quadraticCurveTo(0, -7 * k, -4.5 * k, 1 * k); g.closePath(); g.fill(); break;
    case 'home': g.moveTo(-5 * k, 0); g.lineTo(0, -5 * k); g.lineTo(5 * k, 0); g.lineTo(3.5 * k, 0); g.lineTo(3.5 * k, 4.5 * k); g.lineTo(-3.5 * k, 4.5 * k); g.lineTo(-3.5 * k, 0); g.closePath(); g.fill(); break;
    default: g.arc(0, 0, 3.5 * k, 0, 7); g.fill();
  }
  g.restore();
}
// fixed map points of interest (always shown, filterable)
export const MAP_POI = [
  ['lotus', 'landmark'], ['gfHotel', 'landmark'], ['museum', 'landmark'], ['townhall', 'landmark'], ['vmpark', 'landmark'], ['clockTower', 'landmark'], ['seema', 'worship'],
  ['mosque', 'worship'], ['stlucia', 'worship'], ['port', 'landmark'], ['hospital', 'hospital'], ['police', 'police'], ['policeHQ2', 'police'], ['slaveFlat', 'home'], ['johns', 'school'],
].map(([k, kind]) => ({ x: L.PLACES[k].x, z: L.PLACES[k].z, kind, label: L.PLACES[k].name }));

// ----------------------------------------------------------------------------- map renderer
const ROAD_FILL = ['#efc75e', '#e6e1d4', '#b9b4a8', '#8e8a80'], ROAD_CASE = ['#4a3a14', '#2a2a28', '#24241f', '#20201c'];
export class MapView {
  constructor() { this.cx = 0; this.cz = -300; this.zoom = 0.5; this.tZoom = 0.5; this.vel = [0, 0]; this.anchor = null; this.style = 'satellite'; this.sat = null; this.hoverB = null; this.lastT = 0; this.openT = -9; this.filters = { missions: true, services: true, landmarks: true, collect: true, activities: true, transit: true }; this.t = 0; this._icons = []; }
  // world → screen
  sx(x) { return (x - this.cx) * this.zoom + this.W / 2; } sy(z) { return (z - this.cz) * this.zoom + this.H / 2; }
  wx(px) { return (px - this.W / 2) / this.zoom + this.cx; } wz(py) { return (py - this.H / 2) / this.zoom + this.cz; }
  // eased zoom (anchored under the cursor), drag inertia
  zoomTo(z, mx, my) { this.tZoom = Math.min(4, Math.max(0.18, z)); this.anchor = mx === undefined ? null : { mx, my, wx: this.wx(mx), wz: this.wz(my) }; }
  open(px, pz) { this.cx = px; this.cz = pz; if (this.tZoom < 0.35) this.tZoom = 0.6; this.zoom = this.tZoom * 2.4; this.anchor = null; this.vel = [0, 0]; this.openT = this.t; }
  step(dt) {
    const k = 1 - Math.exp(-dt * 11); const z0 = this.zoom; this.zoom += (this.tZoom - this.zoom) * k; if (Math.abs(this.zoom - this.tZoom) < 1e-4) this.zoom = this.tZoom;
    if (this.anchor && z0 !== this.zoom) { const a = this.anchor; this.cx = a.wx - (a.mx - this.W / 2) / this.zoom; this.cz = a.wz - (a.my - this.H / 2) / this.zoom; }
    if (!this.dragging) { this.cx += this.vel[0] * dt; this.cz += this.vel[1] * dt; const f = Math.exp(-dt * 4.5); this.vel[0] *= f; this.vel[1] *= f; if (Math.hypot(...this.vel) < 2) this.vel = [0, 0]; }
  }
  // satellite tiles for the view; returns fraction ready
  drawSatellite(g, x0, x1, z0, z1) {
    const S = this.sat; if (!S) return 1; S.beginFrame(); const z = this.zoom; let need = 0, have = 0; const now = performance.now();
    const levels = z > 1.15 ? [0, 1] : [0];
    for (const l of levels) {
      const size = SAT.sizes[l]; const i0 = Math.max(0, Math.floor((x0 - SAT.x0) / size)), i1 = Math.min(S.cols(l) - 1, Math.floor((x1 - SAT.x0) / size));
      const j0 = Math.max(0, Math.floor((z0 - SAT.z0) / size)), j1 = Math.min(S.rows(l) - 1, Math.floor((z1 - SAT.z0) / size));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const tx = SAT.x0 + (i + 0.5) * size, tz = SAT.z0 + (j + 0.5) * size; const t = S.get(l, i, j, Math.hypot(tx - this.cx, tz - this.cz)); need++;
        if (!t) continue; have++; g.globalAlpha = Math.min(1, (now - t.born) / 380); g.drawImage(t.c, this.sx(t.x0), this.sy(t.z0), size * z + 0.75, size * z + 0.75);
      }
    }
    g.globalAlpha = 1; return need ? have / need : 1;
  }
  // moving cloud shadows and sea glints over the imagery (subtle: the map should feel alive, not busy)
  drawAtmos(g, W, H) {
    const z = this.zoom, t = this.t;
    if (!this._cloud) { const c = document.createElement('canvas'); c.width = c.height = 512; const q = c.getContext('2d'); let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let n = 0; n < 26; n++) { const x = rnd() * 512, y = rnd() * 512, r = 30 + rnd() * 90; for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) { const gr = q.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); q.fillStyle = gr; q.fillRect(x + ox - r, y + oy - r, r * 2, r * 2); } }
      this._cloud = c;
      const w = document.createElement('canvas'); w.width = w.height = 256; const wq = w.getContext('2d'); for (let n = 0; n < 140; n++) { const x = rnd() * 256, y = rnd() * 256, l = 3 + rnd() * 9; wq.strokeStyle = `rgba(255,255,255,${0.25 + rnd() * 0.5})`; wq.lineWidth = 1; wq.beginPath(); wq.moveTo(x, y); wq.lineTo(x + l, y + l * 0.15); wq.stroke(); }
      this._glint = w; }
    // sea glints: clipped to the ocean west of the coast, drifting with the swell
    const zs = this.wz(-40), ze = this.wz(H + 40); g.save(); g.beginPath(); g.moveTo(-10, -40); for (let q = zs; q <= ze; q += Math.max(6, 8 / z)) g.lineTo(this.sx(L.coastX(q)) - 6 * z, this.sy(q)); g.lineTo(-10, H + 40); g.closePath(); g.clip();
    g.globalAlpha = 0.16 + 0.06 * Math.sin(t * 1.3); const S = 256 * Math.max(0.6, Math.min(2, z)); const ox = ((-this.cx * z - t * 9) % S + S) % S, oy = ((-this.cz * z + t * 4) % S + S) % S;
    for (let x = ox - S; x < W; x += S) for (let y = oy - S; y < H; y += S) g.drawImage(this._glint, x, y, S, S); g.restore();
    // cloud shadows (world-anchored, drifting north-east with the monsoon wind)
    const CS = 1400 * z; const cx = (((-this.cx - t * 7) * z) % CS + CS) % CS, cy = (((-this.cz + t * 3) * z) % CS + CS) % CS; g.globalAlpha = 0.22;
    for (let x = cx - CS; x < W; x += CS) for (let y = cy - CS; y < H; y += CS) g.drawImage(this._cloud, x, y, CS, CS); g.globalAlpha = 1;
  }
  draw(g, W, H, st) {
    this.W = W; this.H = H; const z = this.zoom; const X = (x) => this.sx(x), Y = (v) => this.sy(v);
    const x0 = this.wx(0) - 20, x1 = this.wx(W) + 20, z0 = this.wz(0) - 20, z1 = this.wz(H) + 20;
    const vis = (a0, a1, b0, b1) => a1 > x0 && a0 < x1 && b1 > z0 && b0 < z1;
    // sea: deep → shallow towards the coast
    const sea = g.createLinearGradient(X(-1400), 0, X(-500), 0); sea.addColorStop(0, '#0b2735'); sea.addColorStop(1, '#14445a');
    g.fillStyle = sea; g.fillRect(0, 0, W, H);
    // land
    g.fillStyle = '#262c30'; g.beginPath(); const zs = Math.max(L.BOUNDS.minZ - 400, z0), ze = Math.min(L.BOUNDS.maxZ + 400, z1);
    g.moveTo(X(L.coastX(zs)), Y(zs)); for (let q = zs; q <= ze; q += Math.max(4, 6 / z)) g.lineTo(X(L.coastX(q)), Y(q)); g.lineTo(X(x1 + 3000), Y(ze)); g.lineTo(X(x1 + 3000), Y(zs)); g.closePath(); g.fill();
    // shoreline glow
    g.strokeStyle = 'rgba(120,200,220,0.35)'; g.lineWidth = Math.max(1, 3 * z); g.beginPath(); for (let q = zs; q <= ze; q += Math.max(4, 6 / z)) { const px = X(L.coastX(q)), py = Y(q); q === zs ? g.moveTo(px, py) : g.lineTo(px, py); } g.stroke();
    g.fillStyle = '#14445a'; g.fillRect(X(-3000), Y(-4000), X(230) - X(-3000), Y(-1180) - Y(-4000)); // harbour basin
    // district tint
    for (const c of L.cells) { if (c.water || !vis(c.x0, c.x1, c.z0, c.z1)) continue; const d = L.DISTRICTS[c.district]; if (!d) continue;
      g.fillStyle = d.style === 'green' ? '#2f4a2f' : d.style === 'villa' ? '#2a3230' : d.style === 'port' ? '#2c3136' : d.style === 'lake' ? '#283331' : '#2a2f33'; g.fillRect(X(c.x0), Y(c.z0), (c.x1 - c.x0) * z + 0.5, (c.z1 - c.z0) * z + 0.5); }
    for (const zn of L.ZONES) { const [a0, a1, b0, b1] = zn.rect; if (!vis(a0, a1, b0, b1)) continue; g.fillStyle = zn.kind === 'park' ? '#2f4f31' : '#30302c'; g.fillRect(X(a0), Y(b0), (a1 - a0) * z, (b1 - b0) * z); }
    // lake / canals
    g.fillStyle = '#16465c'; for (const [cx, cz, rx, rz] of L.LAKE) { g.beginPath(); g.ellipse(X(cx), Y(cz), rx * z, rz * z, 0, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(120,200,220,0.3)'; g.lineWidth = Math.max(1, 2 * z); for (const [cx, cz, rx, rz] of L.LAKE) { g.beginPath(); g.ellipse(X(cx), Y(cz), rx * z, rz * z, 0, 0, 7); g.stroke(); }
    g.fillStyle = '#16465c'; for (const cn of L.CANALS) g.fillRect(X(L.coastX((cn.z0 + cn.z1) / 2) - 50), Y(cn.z0), W * 4, (cn.z1 - cn.z0) * z);
    // park paths, beds, hedges
    if (z > 0.35) {
      g.strokeStyle = '#8f8a7c'; g.lineCap = 'round'; for (const [ax, az, bx, bz, w] of PATH_SEGS) { g.lineWidth = Math.max(1, w * z); g.beginPath(); g.moveTo(X(ax), Y(az)); g.lineTo(X(bx), Y(bz)); g.stroke(); }
      for (const [cx, cz, r, w] of PATH_RINGS) { g.lineWidth = Math.max(1, w * z); g.beginPath(); g.arc(X(cx), Y(cz), r * z, 0, 7); g.stroke(); }
      g.fillStyle = '#9a9486'; for (const [cx, cz, r] of PLAZAS) { g.beginPath(); g.arc(X(cx), Y(cz), r * z, 0, 7); g.fill(); }
      g.fillStyle = '#b0566a'; for (const [cx, cz, r] of BEDS) { g.beginPath(); g.arc(X(cx), Y(cz), Math.max(1, r * z), 0, 7); g.fill(); }
      g.strokeStyle = '#1f3a1f'; for (const [ax, az, bx, bz] of HEDGES) { g.lineWidth = Math.max(1, 1 * z); g.beginPath(); g.moveTo(X(ax), Y(az)); g.lineTo(X(bx), Y(bz)); g.stroke(); }
      g.lineCap = 'butt';
    }
    // railway
    g.strokeStyle = '#55493d'; g.lineWidth = Math.max(2, 4 * z); g.beginPath(); L.RAIL.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.stroke();
    g.strokeStyle = '#a89070'; g.lineWidth = Math.max(1, 1.2 * z); g.setLineDash([Math.max(3, 5 * z), Math.max(3, 5 * z)]); g.stroke(); g.setLineDash([]);
    // roads: casing pass then fill pass, minor → major
    for (const pass of [0, 1]) for (const lvl of [3, 2, 1, 0]) {
      if (lvl === 3 && z < 0.3) continue;
      g.strokeStyle = pass ? ROAD_FILL[lvl] : ROAD_CASE[lvl]; g.lineCap = 'round';
      const w = Math.max(lvl <= 1 ? 2 : 1, L.ROAD_W[lvl] * z * 0.9) + (pass ? 0 : Math.max(1.5, 2.2 * z));
      g.lineWidth = w; g.beginPath();
      for (const s of L.segments) { if (s.level !== lvl || !vis(Math.min(s.x0, s.x1), Math.max(s.x0, s.x1), Math.min(s.z0, s.z1), Math.max(s.z0, s.z1))) continue; g.moveTo(X(s.x0), Y(s.z0)); g.lineTo(X(s.x1), Y(s.z1)); }
      g.stroke();
    }
    g.lineCap = 'butt';
    // buildings (footprints shaded by height) and tree canopy, at street zoom
    if (z > 0.55) {
      for (const b of plan.buildings) { if (!vis(b.x0, b.x1, b.z0, b.z1)) continue; const hh = Math.min(1, (b.h + (b.tower ? b.tower.floors * 3.3 : 0)) / 90); const c = Math.round(58 + hh * 55);
        g.fillStyle = `rgb(${c},${c + 3},${c + 8})`; g.fillRect(X(b.x0), Y(b.z0), (b.x1 - b.x0) * z, (b.z1 - b.z0) * z);
        if (z > 1.1) { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1; g.strokeRect(X(b.x0) + 0.5, Y(b.z0) + 0.5, (b.x1 - b.x0) * z - 1, (b.z1 - b.z0) * z - 1); } }
      g.fillStyle = 'rgba(54,96,48,0.85)'; for (const t of plan.trees) { if (t.x < x0 || t.x > x1 || t.z < z0 || t.z > z1) continue; g.beginPath(); g.arc(X(t.x), Y(t.z), Math.max(1.2, 2.6 * t.s * z), 0, 7); g.fill(); }
    }
    // satellite imagery over the vector base (the vector map shows through until tiles stream in)
    if (this.style === 'satellite' && this.sat) { this.satReady = this.drawSatellite(g, x0, x1, z0, z1); this.drawAtmos(g, W, H); g.fillStyle = 'rgba(6,10,16,0.10)'; g.fillRect(0, 0, W, H); } else this.satReady = 1;
    // stations
    for (const stn of L.STATIONS || []) if (this.filters.transit) { this._icons.push({ x: stn.x, z: stn.z, kind: 'station', label: `${stn.name} station` }); }
    // street names
    if (z > 0.9) {
      g.font = `600 ${Math.min(14, 10 + z * 1.5)}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; const seen = new Set();
      for (const s of L.segments) { if (!s.name || s.level === 3 && z < 1.6) continue; const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2; if (mx < x0 || mx > x1 || mz < z0 || mz > z1) continue;
        const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0) * z; const key = s.name + '|' + Math.round(mx / (560 / z)) + '|' + Math.round(mz / (560 / z)); if (len < g.measureText(s.name).width + 16 || seen.has(key)) continue; seen.add(key);
        g.save(); g.translate(X(mx), Y(mz)); if (s.dir === 'v') g.rotate(-Math.PI / 2); g.lineWidth = 3; g.strokeStyle = 'rgba(10,12,14,0.85)'; g.strokeText(s.name, 0, 0); g.fillStyle = s.level === 0 ? '#ffe7a8' : '#e8e4da'; g.fillText(s.name, 0, 0); g.restore(); }
    }
    // district names
    if (z < 1.4) { g.font = `700 ${Math.round(12 + z * 6)}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const done = []; for (const [id, x, q] of this.districtLabels || []) { if (x < x0 || x > x1 || q < z0 || q > z1) continue; const t = L.DISTRICTS[id].name.split(' · ')[0].toUpperCase(); const tw = g.measureText(t).width; if (done.some(([a, b, n, w]) => n === t || (Math.abs(a - X(x)) < (w + tw) / 2 + 12 && Math.abs(b - Y(q)) < 26))) continue; done.push([X(x), Y(q), t, tw]); g.lineWidth = 4; g.strokeStyle = 'rgba(8,10,12,0.8)'; g.strokeText(t, X(x), Y(q)); g.fillStyle = 'rgba(205,216,224,0.92)'; g.fillText(t, X(x), Y(q)); } }
    // police search area + units
    const pol = st.police; if (pol) {
      if (pol.search) { g.fillStyle = 'rgba(70,130,255,0.16)'; g.strokeStyle = 'rgba(120,170,255,0.9)'; g.lineWidth = 2; g.setLineDash([8, 5]); g.beginPath(); g.arc(X(pol.search.x), Y(pol.search.z), pol.search.r * z, 0, 7); g.fill(); g.stroke(); g.setLineDash([]); }
      for (const u of pol.units) { if (st.seeUnit && !st.seeUnit(u)) continue; g.fillStyle = u.lights ? ((this.t * 3) % 1 < 0.5 ? '#ff3b3b' : '#3b7bff') : '#a9c8ff'; g.fillRect(X(u.x) - 5, Y(u.z) - 5, 10, 10); } // only units in sight (or responding within earshot)
      for (const e of st.extras || []) { g.fillStyle = e.color; g.beginPath(); g.arc(X(e.x), Y(e.z), Math.max(1.2, (e.r || 2) * 0.8), 0, 7); g.fill(); } // tiny marks: people / vehicles the player can see
    }
    // GPS route
    const r = st.route; if (r && r.pts) {
      g.lineJoin = 'round'; g.lineCap = 'round';
      const path = () => { g.beginPath(); r.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); };
      path(); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 9; g.stroke();
      path(); g.strokeStyle = st.routeColor || '#33d4c0'; g.lineWidth = 5; g.stroke();
      path(); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.5; g.setLineDash([6, 14]); g.lineDashOffset = -this.t * 30; g.stroke(); g.setLineDash([]);
      g.lineJoin = 'miter'; g.lineCap = 'butt';
    }
    // icons (blips + POI + stations), filtered
    const icons = [...MAP_POI, ...this._icons.splice(0), ...st.blips]; this.hoverables = [];
    for (const b of icons) { const sty = BLIP_STYLE[b.kind]; if (sty && !this.filters[sty.cat]) continue; const px = X(b.x), py = Y(b.z); if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue; const big = b.kind === 'waypoint' || b.kind === 'objective' || b.kind === 'mission'; let bob = 0;
      if (big) { const ph = (this.t * 0.8 + Math.abs(b.x * 0.013 + b.z * 0.007)) % 1; const col = b.kind === 'objective' ? '255,176,32' : b.kind === 'waypoint' ? '200,120,255' : '255,255,255'; g.strokeStyle = `rgba(${col},${(1 - ph) * 0.85})`; g.lineWidth = 2.5 * (1 - ph) + 0.5; g.beginPath(); g.arc(px, py, 11 + ph * 24, 0, 7); g.stroke(); if (b.kind === 'waypoint') bob = -Math.abs(Math.sin(this.t * 3.2)) * 4; }
      const hov = this.hoverB === b; drawIcon(g, b.kind, px, py + bob, (big ? 10 : 8.5) * (hov ? 1.3 : 1) * (0.85 + 0.15 * Math.min(1, (this.t - this.openT) / 0.5))); this.hoverables.push({ px, py, b }); if (b.label && (z > 0.8 || b.kind === 'mission')) { g.font = '600 12px Manrope, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(8,10,12,0.85)'; g.strokeText(b.label, px + 14, py); g.fillStyle = '#f2eee6'; g.fillText(b.label, px + 14, py); } }
    // player
    if (st.player) { const [px, pz, yaw] = st.player; g.save(); g.translate(X(px), Y(pz)); g.rotate(yaw); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath(); g.stroke(); g.fill(); g.restore();
      g.strokeStyle = `rgba(255,255,255,${0.5 - (this.t % 1.5) / 3})`; g.lineWidth = 2; g.beginPath(); g.arc(X(px), Y(pz), 12 + (this.t % 1.5) * 14, 0, 7); g.stroke(); }
    // scale bar + compass
    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000]; const m = nice.find((v) => v * z > 90) || 2000; const bx = 30, by = H - 78;
    g.fillStyle = 'rgba(8,10,14,0.7)'; g.fillRect(bx - 8, by - 22, m * z + 16, 32); g.strokeStyle = '#f2eee6'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx, by - 4); g.lineTo(bx, by); g.lineTo(bx + m * z, by); g.lineTo(bx + m * z, by - 4); g.stroke();
    g.fillStyle = '#f2eee6'; g.font = '600 12px "Barlow Condensed", sans-serif'; g.textAlign = 'left'; g.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, bx, by - 12);
    g.save(); g.translate(W - 60, H - 64); g.fillStyle = 'rgba(8,10,14,0.7)'; g.beginPath(); g.arc(0, 0, 24, 0, 7); g.fill(); g.fillStyle = '#e8a33a'; g.beginPath(); g.moveTo(0, -18); g.lineTo(6, 0); g.lineTo(-6, 0); g.fill(); g.fillStyle = '#c9d4dc'; g.beginPath(); g.moveTo(0, 18); g.lineTo(6, 0); g.lineTo(-6, 0); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 11px "Barlow Condensed"'; g.textAlign = 'center'; g.fillText('N', 0, -26 + 2); g.restore();
  }
  hover(px, py) { let best = null, bd = 16; for (const h of this.hoverables || []) { const d = Math.hypot(h.px - px, h.py - py); if (d < bd) { bd = d; best = h.b; } } this.hoverB = best; return best; }
}
