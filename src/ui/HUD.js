// In-game HUD: minimap, full map, objectives, notifications, prompts, subtitles, choices, timers, vehicle info, fades.
import * as L from '../world/Layout.js';
import { Settings } from '../core/Settings.js';
import { Audio } from '../audio/Audio.js';
import { keyLabel } from '../core/Input.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const MAP_SCALE = 1.0; // px per metre in the base map canvas
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
    this.stamina = el('div', 'stamina', this.root); this.staminaBar = el('div', '', this.stamina);
    this.marker = el('div', 'world-marker hidden', this.root, '<div class="wm-dot"></div><div class="wm-d"></div>');
    this.fadeEl = el('div', 'fade', root); this.cine = el('div', 'cine-bars hidden', root, '<div></div><div></div>');
    this.title = el('div', 'title-card hidden', root); this.photoUI = el('div', 'photo-ui hidden', root, '<div class="pf"></div><div class="ph-hint">Click to take a photo · Esc/P to close</div>');
    this.bigMap = el('div', 'bigmap hidden', root); this.bigC = el('canvas', '', this.bigMap); el('div', 'bigmap-help', this.bigMap, 'M / Esc close · drag to pan · wheel to zoom');
    this.fps = el('div', 'fps hidden', root);
    this.blips = []; this.objective = null; this.subQueue = []; this.subTimer = 0;
    this.buildBaseMap(); this.setupBigMap();
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
    for (const lvl of [3, 2, 1, 0]) { g.strokeStyle = cols[lvl]; for (const s of L.segments) { if (s.level !== lvl) continue; g.lineWidth = Math.max(2, s.w * MAP_SCALE * 0.8); g.beginPath(); g.moveTo(X(s.x0), Z(s.z0)); g.lineTo(X(s.x1), Z(s.z1)); g.stroke(); } }
    // landmarks labels
    g.font = '600 13px "Barlow Condensed", sans-serif'; g.textAlign = 'center';
    const lbl = (x, z, t, col = '#f4efe6') => { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(t, X(x) + 1, Z(z) + 1); g.fillStyle = col; g.fillText(t, X(x), Z(z)); };
    for (const [id, x, z] of this.districtLabels) lbl(x, z, L.DISTRICTS[id].name.split(' · ')[0].toUpperCase(), '#c9d4dc');
    for (const k of ['lotus', 'mosque', 'gfHotel', 'fortStation', 'museum', 'townhall', 'seema', 'clockTower', 'stlucia', 'port', 'hospital']) { const p = L.PLACES[k]; g.fillStyle = '#e07b39'; g.beginPath(); g.arc(X(p.x), Z(p.z), 3, 0, 7); g.fill(); }
    this.X = X; this.Z = Z;
  }
  addBlip(id, x, z, kind = 'objective', label = '') { this.removeBlip(id); const b = { id, x, z, kind, label }; this.blips.push(b); return b; }
  removeBlip(id) { this.blips = this.blips.filter((b) => b.id !== id); }
  clearBlips(prefix) { this.blips = this.blips.filter((b) => !b.id.startsWith(prefix)); }
  drawMini(px, pz, yaw, extras = []) {
    const c = this.miniC, g = c.getContext('2d'), S = c.width, zoom = this.miniZoom || 1.1;
    g.save(); g.clearRect(0, 0, S, S); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.clip();
    g.translate(S / 2, S / 2); g.rotate(yaw + Math.PI); g.scale(zoom, zoom); g.translate(-this.X(px), -this.Z(pz)); g.drawImage(this.base, 0, 0); g.restore();
    const toMini = (x, z) => { const dx = (x - px) * MAP_SCALE * zoom, dz = (z - pz) * MAP_SCALE * zoom; const a = yaw + Math.PI; const rx = dx * Math.cos(a) - dz * Math.sin(a), rz = dx * Math.sin(a) + dz * Math.cos(a); return [S / 2 + rx, S / 2 + rz]; };
    const pol = this.police; if (pol) { // search area (pulsing ring) and police units (flashing red/blue while responding)
      const now = performance.now() / 1000;
      if (pol.search) { const [x, y] = toMini(pol.search.x, pol.search.z); const r = pol.search.r * MAP_SCALE * zoom; g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.clip(); g.fillStyle = `rgba(70,130,255,${0.13 + 0.06 * Math.sin(now * 3)})`; g.strokeStyle = 'rgba(120,170,255,0.85)'; g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); g.setLineDash([]); g.restore(); }
      for (const u of pol.units) { let [x, y] = toMini(u.x, u.z); const dx = x - S / 2, dy = y - S / 2, d = Math.hypot(dx, dy), R = S / 2 - 9; if (d > R) { if (!u.lights) continue; x = S / 2 + dx / d * R; y = S / 2 + dy / d * R; }
        g.fillStyle = u.lights ? ((now * 3) % 1 < 0.5 ? '#ff3b3b' : '#3b7bff') : '#a9c8ff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.rect(x - 4, y - 4, 8, 8); g.fill(); g.stroke(); }
    }
    for (const e of extras) { const [x, y] = toMini(e.x, e.z); if ((x - S / 2) ** 2 + (y - S / 2) ** 2 > (S / 2 - 8) ** 2) continue; g.fillStyle = e.color; g.beginPath(); g.arc(x, y, e.r || 2.5, 0, 7); g.fill(); }
    for (const b of this.blips) {
      let [x, y] = toMini(b.x, b.z); const dx = x - S / 2, dy = y - S / 2, d = Math.hypot(dx, dy), R = S / 2 - 10; let edge = false; if (d > R) { x = S / 2 + dx / d * R; y = S / 2 + dy / d * R; edge = true; }
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
  // ---------- big map
  setupBigMap() {
    this.bm = { x: 0, z: -300, zoom: 0.5 }; let drag = null;
    this.bigC.addEventListener('mousedown', (e) => (drag = [e.clientX, e.clientY]));
    addEventListener('mouseup', () => (drag = null));
    addEventListener('mousemove', (e) => { if (!drag || this.bigMap.classList.contains('hidden')) return; this.bm.x -= (e.clientX - drag[0]) / this.bm.zoom; this.bm.z -= (e.clientY - drag[1]) / this.bm.zoom; drag = [e.clientX, e.clientY]; this.drawBig(); });
    this.bigC.addEventListener('wheel', (e) => { this.bm.zoom = Math.min(3, Math.max(0.25, this.bm.zoom * (e.deltaY > 0 ? 0.85 : 1.18))); this.drawBig(); }, { passive: true });
  }
  toggleBigMap(v, px, pz) { const show = v ?? this.bigMap.classList.contains('hidden'); this.bigMap.classList.toggle('hidden', !show); if (show) { this.bm.x = px; this.bm.z = pz; this.player = [px, pz]; this.drawBig(); } return show; }
  drawBig() {
    const c = this.bigC; c.width = innerWidth; c.height = innerHeight; const g = c.getContext('2d'); const z = this.bm.zoom;
    g.fillStyle = '#0d1c24'; g.fillRect(0, 0, c.width, c.height);
    g.save(); g.translate(c.width / 2, c.height / 2); g.scale(z, z); g.translate(-this.X(this.bm.x), -this.Z(this.bm.z)); g.drawImage(this.base, 0, 0);
    for (const b of this.blips) { g.fillStyle = { objective: '#ffb020', mission: '#f4efe6', side: '#5ac8a8', stamp: '#d8a0ff', photo: '#7ab8ff', shop: '#9ad06a' }[b.kind] || '#fff'; g.beginPath(); g.arc(this.X(b.x), this.Z(b.z), 7 / z, 0, 7); g.fill(); if (b.label) { g.font = `${13 / z}px Manrope`; g.fillText(b.label, this.X(b.x) + 9 / z, this.Z(b.z) + 4 / z); } }
    const pol = this.police; if (pol) { // police search area + units on the big map
      if (pol.search) { g.fillStyle = 'rgba(70,130,255,0.16)'; g.strokeStyle = 'rgba(120,170,255,0.9)'; g.lineWidth = 2 / z; g.setLineDash([8 / z, 5 / z]); g.beginPath(); g.arc(this.X(pol.search.x), this.Z(pol.search.z), pol.search.r * MAP_SCALE, 0, 7); g.fill(); g.stroke(); g.setLineDash([]); }
      for (const u of pol.units) { g.fillStyle = u.lights ? '#ff3b3b' : '#a9c8ff'; g.fillRect(this.X(u.x) - 5 / z, this.Z(u.z) - 5 / z, 10 / z, 10 / z); }
    }
    if (this.player) { g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2 / z; g.beginPath(); g.arc(this.X(this.player[0]), this.Z(this.player[1]), 8 / z, 0, 7); g.fill(); g.stroke(); }
    g.restore();
    g.fillStyle = '#f4efe6'; g.font = '600 28px "Cormorant Garamond", serif'; g.fillText('Colombo', 30, 50);
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
  // ---------- per-frame
  update(st) {
    this.clock.textContent = st.time; this.money.textContent = `Rs. ${st.money.toLocaleString('en-LK')}`;
    this.district.textContent = st.district || ''; this.street.textContent = st.street || ''; this.street.classList.toggle('show', !!st.street);
    this.police = st.police || null; this.drawMini(st.x, st.z, st.camYaw - Math.PI, st.extras);
    this.stamina.style.opacity = st.stamina < 0.98 && !st.vehicle ? 1 : 0; this.staminaBar.style.width = `${st.stamina * 100}%`;
    if (st.vehicle) { this.veh.classList.remove('hidden'); this.vehSpeed.innerHTML = `${Math.round(Math.abs(st.vehicle.speed) * 3.6)}<small>km/h</small>`; this.vehName.textContent = st.vehicleName; this.radioEl.textContent = st.radio || ''; } else this.veh.classList.add('hidden');
    if (this.objective) { const d = Math.hypot(this.objective.x - st.x, this.objective.z - st.z); this.objDist.textContent = d > 30 ? `${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}` : ''; } else this.objDist.textContent = '';
    // world-space objective marker
    if (this.objective && st.camera) {
      const v = st.projector(this.objective.x, (this.objective.y ?? 0) + 2.2, this.objective.z);
      const d = Math.hypot(this.objective.x - st.x, this.objective.z - st.z);
      if (v && d > 4) { this.marker.classList.remove('hidden'); this.marker.style.transform = `translate(${v[0]}px, ${v[1]}px)`; this.marker.querySelector('.wm-d').textContent = `${Math.round(d)} m`; } else this.marker.classList.add('hidden');
    } else this.marker.classList.add('hidden');
    if (Settings.get('showFps')) { this.fps.classList.remove('hidden'); this.fps.textContent = `${st.fps.toFixed(0)} fps · ${st.draws} draws`; } else this.fps.classList.add('hidden');
  }
}
