// In-game HUD: minimap, full map, objectives, notifications, prompts, subtitles, choices, timers, vehicle info, fades.
import * as L from '../world/Layout.js';
import { Settings } from '../core/Settings.js';
import { Audio } from '../audio/Audio.js';
import { keyLabel } from '../core/Input.js';
import { plan } from '../world/CityPlan.js';
import { Gps, MapView, drawIcon, BLIP_STYLE } from './MapView.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const MAP_SCALE = 1.0; // px per metre in the base map canvas
const fmtDist = (d) => (d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d / 10) * 10} m`);
export class HUD {
  constructor(root) {
    this.root = el('div', 'hud hidden', root);
    this.mini = el('div', 'minimap', this.root); this.miniC = el('canvas', '', this.mini); this.miniC.width = this.miniC.height = 220;
    this.district = el('div', 'district', this.mini); this.street = el('div', 'street', this.root);
    this.info = el('div', 'hud-info', this.root); this.clock = el('div', 'clock', this.info); this.money = el('div', 'money', this.info);
    this.obj = el('div', 'objective', this.root); this.objTitle = el('div', 'obj-title', this.obj); this.objText = el('div', 'obj-text', this.obj); this.objDist = el('div', 'obj-dist', this.obj);
    this.notes = el('div', 'notes', this.root); this.promptEl = el('div', 'prompt', this.root);
    this.subs = el('div', 'subtitles', root); this.choiceEl = el('div', 'choices hidden', root);
    this.timerEl = el('div', 'mtimer hidden', this.root); this.veh = el('div', 'vehicle-info hidden', this.root); this.vehSpeed = el('div', 'veh-speed', this.veh); this.vehName = el('div', 'veh-name', this.veh); this.radioEl = el('div', 'veh-radio', this.veh);
    this.vitals = el('div', 'vitals', this.root); this.hp = el('div', 'vit hp', this.vitals); this.hpBar = el('i', '', this.hp); this.hpGhost = el('b', '', this.hp);
    this.stamina = el('div', 'vit st', this.vitals); this.staminaBar = el('i', '', this.stamina);
    this.hurtEl = el('div', 'hurt-fx', root); this._hpShown = 100;
    this.marker = el('div', 'world-marker hidden', this.root, '<div class="wm-dot"></div><div class="wm-d"></div>');
    this.fadeEl = el('div', 'fade', root); this.cine = el('div', 'cine-bars hidden', root, '<div></div><div></div>');
    this.title = el('div', 'title-card hidden', root); this.photoUI = el('div', 'photo-ui hidden', root, '<div class="pf"></div><div class="ph-hint">Click to take a photo · Esc/P to close</div>');
    this.bigMap = el('div', 'bigmap hidden', root); this.bigC = el('canvas', '', this.bigMap);
    this.bmTitle = el('div', 'bm-title', this.bigMap, '<div class="bm-city">COLOMBO</div><div class="bm-sub">කොළඹ · கொழும்பு</div><div class="bm-where"></div>');
    this.bmLegend = el('div', 'bm-legend', this.bigMap); this.bmWay = el('div', 'bm-way', this.bigMap); this.bmTip = el('div', 'bm-tip hidden', this.bigMap);
    el('div', 'bigmap-help', this.bigMap, '<kbd>Right-click</kbd>/<kbd>Double-click</kbd> set waypoint · <kbd>Enter</kbd> waypoint at centre · <kbd>Backspace</kbd> clear · <kbd>C</kbd> centre on me · drag / <kbd>WASD</kbd> pan · wheel / <kbd>+</kbd><kbd>−</kbd> zoom · <kbd>M</kbd>/<kbd>Esc</kbd> close');
    this.gps = new Gps(); this.mapView = new MapView(); this.gpsEl = el('div', 'gps-info', this.root); this.waypoint = null;
    this.fps = el('div', 'fps hidden', root);
    this.blips = []; this.objective = null; this.subQueue = []; this.subTimer = 0;
    this.buildBaseMap(); this.setupBigMap(); this.buildLegend();
  }
  show(v) { this.root.classList.toggle('hidden', !v); }
  // ---------- base map canvas from the real layout
  buildBaseMap() {
    const B = L.BOUNDS, pad = 300; this.mx0 = B.minX - pad; this.mz0 = B.minZ - pad; const W = Math.ceil((B.maxX - B.minX + pad * 2) * MAP_SCALE), H = Math.ceil((B.maxZ - B.minZ + pad * 2) * MAP_SCALE);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); this.base = c;
    const X = (x) => (x - this.mx0) * MAP_SCALE, Z = (z) => (z - this.mz0) * MAP_SCALE;
    g.fillStyle = '#1d4a5c'; g.fillRect(0, 0, W, H);
    // land
    g.fillStyle = '#2b3236'; g.beginPath(); g.moveTo(X(L.coastX(this.mz0)), Z(this.mz0)); for (let z = this.mz0; z <= this.mz0 + H; z += 10) g.lineTo(X(L.coastX(z)), Z(z)); g.lineTo(W, H); g.lineTo(W, 0); g.closePath(); g.fill();
    g.fillStyle = '#1d4a5c'; g.fillRect(0, 0, X(230), Z(-1180)); // harbour
    // parks / green / landmark grounds
    const acc = {};
    for (const c of L.cells) { if (c.water) continue; (acc[c.district] ||= [0, 0, 0]); acc[c.district][0] += c.cx; acc[c.district][1] += c.cz; acc[c.district][2]++; if (c.district === 'gfgreen') { g.fillStyle = '#3a5a34'; g.fillRect(X(c.x0), Z(c.z0), (c.x1 - c.x0) * MAP_SCALE, (c.z1 - c.z0) * MAP_SCALE); } }
    for (const zn of L.ZONES) { const [x0, x1, z0, z1] = zn.rect; g.fillStyle = zn.kind === 'park' ? '#2f4a32' : zn.kind === 'port' ? '#343c42' : '#3a3530'; g.fillRect(X(x0), Z(z0), (x1 - x0) * MAP_SCALE, (z1 - z0) * MAP_SCALE); }
    this.districtLabels = Object.entries(acc).map(([id, a]) => [id, a[0] / a[2], a[1] / a[2]]);
    // lake + canals
    g.fillStyle = '#1d4a5c'; for (const [cx, cz, rx, rz] of L.LAKE) { g.beginPath(); g.ellipse(X(cx), Z(cz), rx * MAP_SCALE, rz * MAP_SCALE, 0, 0, Math.PI * 2); g.fill(); }
    for (const cn of L.CANALS) g.fillRect(X(L.coastX((cn.z0 + cn.z1) / 2) - 50), Z(cn.z0), W, (cn.z1 - cn.z0) * MAP_SCALE);
    // rail
    g.strokeStyle = '#6b5a48'; g.lineWidth = 3; g.setLineDash([6, 4]); g.beginPath(); L.RAIL.forEach((p, i) => (i ? g.lineTo(X(p[0]), Z(p[1])) : g.moveTo(X(p[0]), Z(p[1])))); g.stroke(); g.setLineDash([]);
    // roads
    const cols = ['#e8c35a', '#d8d4c8', '#a8a49a', '#7d7a72'];
    for (const lvl of [3, 2, 1, 0]) { g.strokeStyle = '#17191b'; for (const s of L.segments) { if (s.level !== lvl) continue; g.lineWidth = Math.max(2, s.w * MAP_SCALE * 0.8) + 2; g.beginPath(); g.moveTo(X(s.x0), Z(s.z0)); g.lineTo(X(s.x1), Z(s.z1)); g.stroke(); } }
    for (const lvl of [3, 2, 1, 0]) { g.strokeStyle = cols[lvl]; for (const s of L.segments) { if (s.level !== lvl) continue; g.lineWidth = Math.max(2, s.w * MAP_SCALE * 0.8); g.beginPath(); g.moveTo(X(s.x0), Z(s.z0)); g.lineTo(X(s.x1), Z(s.z1)); g.stroke(); } }
    // building footprints + tree canopy (minimap reads like the street around you)
    for (const b of plan.buildings) { const hh = Math.min(1, b.h / 60); const k = Math.round(54 + hh * 40); g.fillStyle = `rgb(${k},${k + 3},${k + 7})`; g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * MAP_SCALE, (b.z1 - b.z0) * MAP_SCALE); }
    g.fillStyle = 'rgba(54,96,48,0.8)'; for (const t of plan.trees) { g.beginPath(); g.arc(X(t.x), Z(t.z), 2 * t.s, 0, 7); g.fill(); }
    this.baseHasBuildings = plan.buildings.length > 0;
    // landmarks labels
    g.font = '600 13px "Barlow Condensed", sans-serif'; g.textAlign = 'center';
    const lbl = (x, z, t, col = '#f4efe6') => { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(t, X(x) + 1, Z(z) + 1); g.fillStyle = col; g.fillText(t, X(x), Z(z)); };
    for (const [id, x, z] of this.districtLabels) lbl(x, z, L.DISTRICTS[id].name.split(' · ')[0].toUpperCase(), '#c9d4dc');
    for (const k of ['lotus', 'mosque', 'gfHotel', 'fortStation', 'museum', 'townhall', 'seema', 'clockTower', 'stlucia', 'port', 'hospital', 'johns']) { const p = L.PLACES[k]; g.fillStyle = '#e07b39'; g.beginPath(); g.arc(X(p.x), Z(p.z), 3, 0, 7); g.fill(); }
    this.X = X; this.Z = Z;
  }
  addBlip(id, x, z, kind = 'objective', label = '') { this.removeBlip(id); const b = { id, x, z, kind, label }; this.blips.push(b); return b; }
  removeBlip(id) { this.blips = this.blips.filter((b) => b.id !== id); }
  clearBlips(prefix) { this.blips = this.blips.filter((b) => !b.id.startsWith(prefix)); }
  drawMini(px, pz, yaw, extras = []) {
    const c = this.miniC, g = c.getContext('2d'), S = c.width, zoom = this.miniZoom || 1.1;
    g.save(); g.clearRect(0, 0, S, S); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.clip();
    g.translate(S / 2, S / 2); g.rotate(yaw + Math.PI); g.scale(zoom, zoom); g.translate(-this.X(px), -this.Z(pz)); g.drawImage(this.base, 0, 0);
    const rt = this.gps.route; if (rt && rt.pts) { // GPS line under the blips
      g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); rt.pts.forEach((p, i) => (i ? g.lineTo(this.X(p[0]), this.Z(p[1])) : g.moveTo(this.X(p[0]), this.Z(p[1]))));
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 9 / zoom; g.stroke(); g.strokeStyle = this.gps.target && this.gps.target.kind === 'objective' ? '#ffb020' : '#33d4c0'; g.lineWidth = 5.5 / zoom; g.stroke(); }
    g.restore();
    const toMini = (x, z) => { const dx = (x - px) * MAP_SCALE * zoom, dz = (z - pz) * MAP_SCALE * zoom; const a = yaw + Math.PI; const rx = dx * Math.cos(a) - dz * Math.sin(a), rz = dx * Math.sin(a) + dz * Math.cos(a); return [S / 2 + rx, S / 2 + rz]; };
    const pol = this.police; if (pol) { // search area (pulsing ring) and police units (flashing red/blue while responding)
      const now = performance.now() / 1000;
      if (pol.search) { const [x, y] = toMini(pol.search.x, pol.search.z); const r = pol.search.r * MAP_SCALE * zoom; g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.clip(); g.fillStyle = `rgba(70,130,255,${0.13 + 0.06 * Math.sin(now * 3)})`; g.strokeStyle = 'rgba(120,170,255,0.85)'; g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); g.setLineDash([]); g.restore(); }
      for (const u of pol.units) { if (this.canSeeUnit && !this.canSeeUnit(u)) continue; let [x, y] = toMini(u.x, u.z); const dx = x - S / 2, dy = y - S / 2, d = Math.hypot(dx, dy), R = S / 2 - 9; if (d > R) { if (!u.lights) continue; x = S / 2 + dx / d * R; y = S / 2 + dy / d * R; }
        g.fillStyle = u.lights ? ((now * 3) % 1 < 0.5 ? '#ff3b3b' : '#3b7bff') : '#a9c8ff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.rect(x - 4, y - 4, 8, 8); g.fill(); g.stroke(); }
    }
    for (const e of extras) { const [x, y] = toMini(e.x, e.z); if ((x - S / 2) ** 2 + (y - S / 2) ** 2 > (S / 2 - 8) ** 2) continue; g.fillStyle = e.color; g.beginPath(); g.arc(x, y, e.r || 2.5, 0, 7); g.fill(); }
    for (const b of this.blips) {
      let [x, y] = toMini(b.x, b.z); const dx = x - S / 2, dy = y - S / 2, d = Math.hypot(dx, dy), R = S / 2 - 10; let edge = false; if (d > R) { x = S / 2 + dx / d * R; y = S / 2 + dy / d * R; edge = true; }
      if (b.kind === 'waypoint') { drawIcon(g, 'waypoint', x, y, edge ? 5 : 6.5); continue; }
      g.fillStyle = { objective: '#ffb020', mission: '#f4efe6', side: '#5ac8a8', stamp: '#d8a0ff', photo: '#7ab8ff', shop: '#9ad06a', enemy: '#ff4a3a' }[b.kind] || '#fff';
      g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath();
      if (b.kind === 'objective') { g.moveTo(x, y - 7); g.lineTo(x + 6, y); g.lineTo(x, y + 7); g.lineTo(x - 6, y); g.closePath(); } else g.arc(x, y, edge ? 3 : 4.5, 0, 7);
      g.stroke(); g.fill(); if (b.label && !edge && b.kind === 'mission') { g.font = 'bold 10px Manrope, sans-serif'; g.fillStyle = '#000'; g.fillText(b.label, x + 6, y + 4); g.fillStyle = '#fff'; g.fillText(b.label, x + 5, y + 3); }
    }
    // player arrow
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(S / 2, S / 2 - 8); g.lineTo(S / 2 + 6, S / 2 + 6); g.lineTo(S / 2, S / 2 + 3); g.lineTo(S / 2 - 6, S / 2 + 6); g.closePath(); g.stroke(); g.fill();
    // north marker
    const [nx, ny] = (() => { const a = yaw + Math.PI; const dx = 0, dz = -1; const rx = dx * Math.cos(a) - dz * Math.sin(a), rz = dx * Math.sin(a) + dz * Math.cos(a); return [S / 2 + rx * (S / 2 - 12), S / 2 + rz * (S / 2 - 12)]; })();
    g.fillStyle = '#ffb020'; g.font = 'bold 12px Barlow Condensed, sans-serif'; g.textAlign = 'center'; g.fillText('N', nx, ny + 4);
  }
  // ---------- big map (see MapView.js)
  setupBigMap() {
    const V = this.mapView; let drag = null, moved = 0; this.mapView.districtLabels = this.districtLabels;
    const open = () => !this.bigMap.classList.contains('hidden');
    let lastMv = 0;
    this.bigC.addEventListener('mousedown', (e) => { if (e.button === 0) { drag = [e.clientX, e.clientY]; moved = 0; V.dragging = true; V.vel = [0, 0]; V.anchor = null; lastMv = performance.now(); this.bigC.style.cursor = 'grabbing'; } });
    addEventListener('mouseup', () => { if (drag) { if (performance.now() - lastMv > 90) V.vel = [0, 0]; } drag = null; V.dragging = false; this.bigC.style.cursor = ''; });
    addEventListener('mousemove', (e) => {
      if (!open()) return;
      if (drag) { const dx = (e.clientX - drag[0]) / V.zoom, dz = (e.clientY - drag[1]) / V.zoom; V.cx -= dx; V.cz -= dz; const now = performance.now(), dtm = Math.max(8, now - lastMv) / 1000; lastMv = now;
        V.vel = [V.vel[0] * 0.6 + (-dx / dtm) * 0.4, V.vel[1] * 0.6 + (-dz / dtm) * 0.4]; moved += Math.abs(e.clientX - drag[0]) + Math.abs(e.clientY - drag[1]); drag = [e.clientX, e.clientY]; }
      this.mouse = [e.clientX, e.clientY]; this.updateMapHover();
    });
    this.bigC.addEventListener('wheel', (e) => { const r = this.bigC.getBoundingClientRect(); V.zoomTo(V.tZoom * (e.deltaY > 0 ? 0.8 : 1.25), e.clientX - r.left, e.clientY - r.top); }, { passive: true });
    const setAt = (e) => { const r = this.bigC.getBoundingClientRect(); this.setWaypoint(V.wx(e.clientX - r.left), V.wz(e.clientY - r.top)); };
    this.bigC.addEventListener('contextmenu', (e) => { e.preventDefault(); setAt(e); });
    this.bigC.addEventListener('dblclick', (e) => setAt(e));
    addEventListener('keydown', (e) => {
      if (!open()) return; const step = 60 / V.zoom;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') V.vel[1] = -step * 4.5; else if (e.code === 'KeyS' || e.code === 'ArrowDown') V.vel[1] = step * 4.5;
      else if (e.code === 'KeyA' || e.code === 'ArrowLeft') V.vel[0] = -step * 4.5; else if (e.code === 'KeyD' || e.code === 'ArrowRight') V.vel[0] = step * 4.5;
      else if (e.code === 'Equal' || e.code === 'NumpadAdd') V.zoomTo(V.tZoom * 1.3); else if (e.code === 'Minus' || e.code === 'NumpadSubtract') V.zoomTo(V.tZoom / 1.3);
      else if (e.code === 'KeyV') this.setMapStyle(V.style === 'satellite' ? 'atlas' : 'satellite');
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.setWaypoint(V.cx, V.cz);
      else if (e.code === 'Backspace' || e.code === 'Delete') this.clearWaypoint(true);
      else if (e.code === 'KeyC' && this.player) { V.anchor = null; V.vel = [(this.player[0] - V.cx) * 4.5, (this.player[1] - V.cz) * 4.5]; } // glide back to the player
      else return; e.preventDefault();
    });
  }
  buildLegend() {
    const cats = [['missions', 'Missions & waypoint', 'mission'], ['activities', 'Side activities', 'side'], ['services', 'Shops, police, hospital', 'shop'], ['landmarks', 'Landmarks & worship', 'landmark'], ['transit', 'Railway stations', 'station'], ['collect', 'Stamps & photo spots', 'stamp']];
    this.bmLegend.innerHTML = '<div class="bm-lh">LEGEND</div>';
    for (const [k, label, icon] of cats) {
      const row = el('label', 'bm-row', this.bmLegend); const cv = el('canvas', '', row); cv.width = cv.height = 26; drawIcon(cv.getContext('2d'), icon, 13, 13, 8);
      const cb = el('input', '', row); cb.type = 'checkbox'; cb.checked = true; cb.addEventListener('change', () => (this.mapView.filters[k] = cb.checked)); el('span', '', row, label);
    }
    const sw = el('div', 'bm-style', this.bmLegend); this.styleBtns = {};
    for (const [k, label] of [['satellite', 'Satellite'], ['atlas', 'Atlas']]) { const b = el('button', 'bm-sbtn', sw, label); b.addEventListener('click', () => this.setMapStyle(k)); this.styleBtns[k] = b; }
    this.setMapStyle(this.mapView.style);
    el('div', 'bm-roads', this.bmLegend, '<i style="background:#efc75e"></i>Main road <i style="background:#e6e1d4"></i>Road <i style="background:#8e8a80"></i>Lane <i class="rail"></i>Railway');
  }
  setMapStyle(k) { this.mapView.style = k; for (const [n, b] of Object.entries(this.styleBtns || {})) b.classList.toggle('on', n === k); }
  setWaypoint(x, z) {
    this.waypoint = { x, z }; this.addBlip('waypoint', x, z, 'waypoint', 'Waypoint'); this.gps.set(x, z, 'waypoint'); Audio.ui('click');
    const r = this.gps.route || null; this.notify('Waypoint set', L.roadNameAt(x, z) || L.districtAt(x, z)?.name.split(' · ')[0] || '', 'info', 2.5); return r;
  }
  clearWaypoint(sound) { if (!this.waypoint) return; this.waypoint = null; this.removeBlip('waypoint'); this.gps.clear(); if (sound) Audio.ui('click'); }
  updateMapHover() {
    if (!this.mouse) return; const V = this.mapView; const r = this.bigC.getBoundingClientRect(); const mx = this.mouse[0] - r.left, my = this.mouse[1] - r.top; const x = V.wx(mx), z = V.wz(my);
    const d = L.districtAt(x, z), road = L.roadNameAt(x, z), zn = L.zoneAt(x, z);
    this.bmTitle.querySelector('.bm-where').innerHTML = L.isWater(x, z) ? (L.inLake(x, z) ? 'Beira Lake' : 'Indian Ocean') : `${zn ? `<b>${zn.name}</b> · ` : ''}${road ? road + ' · ' : ''}${d ? d.name.split(' · ')[0] : ''}`;
    const h = V.hover(mx, my); if (h) { const sty = BLIP_STYLE[h.kind]; this.bmTip.classList.remove('hidden'); this.bmTip.innerHTML = `<b>${h.label || (sty ? sty.name : h.kind)}</b><span>${sty ? sty.name : ''}${this.player ? ` · ${(Math.hypot(h.x - this.player[0], h.z - this.player[1]) / 1000).toFixed(2)} km` : ''}</span>`; this.bmTip.style.transform = `translate(${this.mouse[0] + 16}px, ${this.mouse[1] + 12}px)`; } else this.bmTip.classList.add('hidden');
  }
  toggleBigMap(v, px, pz) {
    const show = v ?? this.bigMap.classList.contains('hidden'); this.bigMap.classList.toggle('hidden', !show);
    if (show) { this.mapView.t = performance.now() / 1000; this.mapView.open(px, pz); this.player = [px, pz]; this.bigMap.classList.remove('opening'); void this.bigMap.offsetWidth; this.bigMap.classList.add('opening');
      let last = performance.now(); const loop = () => { if (this.bigMap.classList.contains('hidden')) return; const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now; this.mapView.t = now / 1000; this.mapView.step(dt);
        if (this.satellite && this.mapView.style === 'satellite') this.satellite.pump(this.mapView.satReady < 1 ? 22 : 10); this.drawBig(); requestAnimationFrame(loop); }; loop(); }
    return show;
  }
  drawBig() {
    const c = this.bigC; if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; } const g = c.getContext('2d');
    this.mapView.sat = this.satellite || null;
    this.mapView.draw(g, c.width, c.height, { seeUnit: this.canSeeUnit, extras: this.mapExtras ? this.mapExtras() : [], police: this.police, route: this.gps.route, routeColor: this.gps.target && this.gps.target.kind === 'objective' ? '#ffb020' : '#33d4c0', blips: this.blips, player: this.player ? [this.player[0], this.player[1], this.playerYaw || 0] : null });
    const sr = this.mapView.satReady ?? 1; if (this.mapView.style === 'satellite' && sr < 1) { const w = 220, x = c.width / 2 - w / 2, y = 74; g.fillStyle = 'rgba(8,10,14,0.75)'; g.fillRect(x - 10, y - 18, w + 20, 34); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x, y + 6, w, 3); g.fillStyle = '#e8a33a'; g.fillRect(x, y + 6, w * sr, 3); g.fillStyle = '#e8e4da'; g.font = '600 12px "Barlow Condensed", sans-serif'; g.textAlign = 'center'; g.fillText(`UPDATING SATELLITE IMAGERY ${Math.round(sr * 100)}%`, c.width / 2, y - 2); }
    const t = this.gps.target; if (t && this.player) { const d = this.gps.remaining(this.player[0], this.player[1]); this.bmWay.classList.add('show'); this.bmWay.innerHTML = `<b>${t.kind === 'objective' ? 'OBJECTIVE ROUTE' : 'WAYPOINT'}</b><span>${fmtDist(d)} by road · ~${Math.max(1, Math.round(d / 1000 / 28 * 60))} min drive · ${Math.max(1, Math.round(d / 1000 / 4.8 * 60))} min walk</span><span class="bm-to">${L.roadNameAt(t.x, t.z) || L.districtAt(t.x, t.z)?.name.split(' · ')[0] || ''}</span>`; } else { this.bmWay.classList.remove('show'); this.bmWay.innerHTML = ''; }
    if (this.mouse) this.updateMapHover();
  }
  // ---------- objective / notes / prompts
  setObjective(title, text, target) { this.objective = target || null; this.obj.classList.toggle('show', !!text); this.objTitle.textContent = title || ''; this.objText.textContent = text || ''; if (target) this.addBlip('obj', target.x, target.z, 'objective'); else this.removeBlip('obj'); }
  notify(title, body = '', kind = 'info', dur = 5) { const n = el('div', 'note ' + kind, this.notes, `<b>${title}</b>${body ? `<span>${body}</span>` : ''}`); Audio.ui(kind === 'success' ? 'success' : kind === 'collect' ? 'collect' : 'notify'); setTimeout(() => n.classList.add('out'), dur * 1000); setTimeout(() => n.remove(), dur * 1000 + 600); while (this.notes.children.length > 4) this.notes.firstChild.remove(); }
  prompt(text) { if (this._prompt === text) return; this._prompt = text; this.promptEl.innerHTML = text || ''; this.promptEl.classList.toggle('show', !!text); }
  key(action) { return `<kbd>${keyLabel(Settings.get('bindings')[action])}</kbd>`; }
  // ---------- subtitles: {who, text, tr, lang, dur}
  subtitle(who, text, tr = '', dur = 3.5, lang = 'en') {
    if (!Settings.get('subtitles') && who !== 'system') { this.subs.innerHTML = ''; return; }
    const s = Settings.get('subtitleSize'); this.subs.style.fontSize = `${18 * s}px`;
    this.subs.innerHTML = `<div class="sub ${lang}">${who ? `<span class="who">${who}</span>` : ''}<span class="t">${text}</span>${tr ? `<span class="tr">${tr}</span>` : ''}</div>`;
    this.subUntil = performance.now() + dur * 1000; this.subWho = who;
    clearTimeout(this._subT); this._subT = setTimeout(() => (this.subs.innerHTML = ''), dur * 1000);
  }
  clearSubtitle() { this.subs.innerHTML = ''; this.subUntil = 0; }
  choice(options, title = '') {
    return new Promise((res) => {
      this.choiceEl.innerHTML = (title ? `<div class="ch-title">${title}</div>` : '') + options.map((o, i) => `<button data-i="${i}"><kbd>${i + 1}</kbd> ${o}</button>`).join(''); this.choiceEl.classList.remove('hidden');
      const done = (i) => { this.choiceEl.classList.add('hidden'); removeEventListener('keydown', kh); Audio.ui('click'); res(i); };
      const kh = (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= options.length) done(n - 1); };
      addEventListener('keydown', kh); this.choiceEl.querySelectorAll('button').forEach((b) => (b.onclick = () => done(+b.dataset.i)));
    });
  }
  setTimer(sec) { if (sec === null || sec === undefined) { this.timerEl.classList.add('hidden'); return; } this.timerEl.classList.remove('hidden'); const m = Math.floor(sec / 60), s = Math.floor(sec % 60); this.timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`; this.timerEl.classList.toggle('urgent', sec < 15); }
  fade(to, dur = 0.8) { return new Promise((r) => { this.fadeEl.style.transition = `opacity ${dur}s ease`; requestAnimationFrame(() => (this.fadeEl.style.opacity = to)); setTimeout(r, dur * 1000 + 30); }); }
  bars(on) { this.cine.classList.toggle('hidden', !on); }
  titleCard(html, dur = 4) { return new Promise((r) => { this.title.innerHTML = html; this.title.classList.remove('hidden'); this.title.classList.add('show'); setTimeout(() => { this.title.classList.remove('show'); setTimeout(() => { this.title.classList.add('hidden'); r(); }, 900); }, dur * 1000); }); }
  missionBanner(top, title, sub = '') { return this.titleCard(`<div class="mb-top">${top}</div><div class="mb-title">${title}</div>${sub ? `<div class="mb-sub">${sub}</div>` : ''}`, 3.2); }
  // non-graphic damage feedback: a short red flash at the screen edges (strength k 0..1)
  hurt(k = 0.5) { const e = this.hurtEl; e.style.setProperty('--k', (0.35 + k * 0.65).toFixed(2)); e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); }
  // ---------- per-frame
  update(st) {
    this.clock.textContent = st.time; this.money.textContent = `Rs. ${st.money.toLocaleString('en-LK')}`;
    this.district.textContent = st.district || ''; this.street.textContent = st.street || ''; this.street.classList.toggle('show', !!st.street);
    this.police = st.police || null; this.player = [st.x, st.z]; this.playerYaw = -(st.camYaw - Math.PI) + Math.PI;
    if (!this.baseHasBuildings && plan.buildings.length) this.buildBaseMap();
    { // GPS: player waypoint first, otherwise the mission objective
      const now = performance.now(), dt = Math.min(0.5, (now - (this._gpsT || now)) / 1000); this._gpsT = now;
      if (this.waypoint) { if (Math.hypot(this.waypoint.x - st.x, this.waypoint.z - st.z) < 18) { this.clearWaypoint(); this.notify('Waypoint reached', '', 'success', 2.5); } }
      if (!this.waypoint) { const o = this.objective; if (o && Math.hypot(o.x - st.x, o.z - st.z) > 45 && !st.indoor) { const t = this.gps.target; if (!t || t.kind !== 'objective' || Math.hypot(t.x - o.x, t.z - o.z) > 25) this.gps.set(o.x, o.z, 'objective'); } else if (this.gps.target) this.gps.clear(); }
      if (st.indoor) this.gps.route = null; else this.gps.update(dt, st.x, st.z);
      const t = this.gps.target; if (t && this.gps.route) { this.gpsEl.className = 'gps-info show' + (t.kind === 'objective' ? ' obj' : ''); this.gpsEl.innerHTML = `<b>${t.kind === 'objective' ? 'GPS · OBJECTIVE' : 'GPS · WAYPOINT'}</b> ${fmtDist(this.gps.remaining(st.x, st.z))}`; } else this.gpsEl.className = 'gps-info';
    }
    this.drawMini(st.x, st.z, st.camYaw - Math.PI, st.extras);
    this.stamina.style.opacity = st.stamina < 0.98 && !st.vehicle ? 1 : 0.35; this.staminaBar.style.width = `${st.stamina * 100}%`;
    if (st.health != null) { const hp = st.health; this.hpBar.style.width = `${hp}%`; this._hpShown += (hp - this._hpShown) * (hp < this._hpShown ? 0.04 : 1); this.hpGhost.style.width = `${this._hpShown}%`; this.hp.classList.toggle('low', hp < 30); this.hurtEl.classList.toggle('low', hp < 25 && !st.healthBusy); }
    if (st.vehicle) { this.veh.classList.remove('hidden'); this.vehSpeed.innerHTML = `${Math.round(Math.abs(st.vehicle.speed) * 3.6)}<small>km/h</small>`; this.vehName.textContent = st.vehicleName; this.radioEl.textContent = st.radio || ''; } else this.veh.classList.add('hidden');
    if (this.objective) { const d = Math.hypot(this.objective.x - st.x, this.objective.z - st.z); this.objDist.textContent = d > 30 ? `${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}` : ''; } else this.objDist.textContent = '';
    // world-space objective marker
    const mk = this.objective || (this.waypoint && { x: this.waypoint.x, z: this.waypoint.z, y: L.groundY(this.waypoint.x, this.waypoint.z) });
    if (mk && st.camera) {
      const v = st.projector(mk.x, (mk.y ?? 0) + 2.2, mk.z);
      const d = Math.hypot(mk.x - st.x, mk.z - st.z);
      if (v && d > 4) { this.marker.classList.remove('hidden'); this.marker.style.transform = `translate(${v[0]}px, ${v[1]}px)`; this.marker.querySelector('.wm-d').textContent = `${Math.round(d)} m`; } else this.marker.classList.add('hidden');
    } else this.marker.classList.add('hidden');
    if (Settings.get('showFps')) { this.fps.classList.remove('hidden'); this.fps.textContent = `${st.fps.toFixed(0)} fps · ${st.draws} draws`; } else this.fps.classList.add('hidden');
  }
}
