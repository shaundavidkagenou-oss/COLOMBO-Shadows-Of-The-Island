// In-game smartphone (P). Every app does something real in the game:
//   Camera  -> photo mode (photo spots, crowd reactions)      Map      -> full map
//   Wallet  -> balance + every transaction with its reason     Messages -> mission briefings received
//   Jobs    -> live list of paid work, sets a GPS waypoint     Health   -> health/stamina, 1990 Suwa Seriya ambulance
//   Weather -> current conditions and in-game time/day
// Keyboard: arrows to move, Enter (or E) to open/confirm, Backspace to go back, P or Esc to put the phone away.
// Mouse works too when the pointer is not locked. The phone never pauses the world.
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { plan } from '../world/CityPlan.js';
import * as L from '../world/Layout.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rs = (n) => `Rs. ${Math.abs(Math.round(n)).toLocaleString('en-LK')}`;
const APPS = [
  { id: 'camera', name: 'Camera', icon: '◉', col: '#3a3f4a' },
  { id: 'map', name: 'Map', icon: '⌖', col: '#2f7d5b' },
  { id: 'wallet', name: 'Wallet', icon: 'රු', col: '#b8862b' },
  { id: 'msgs', name: 'Messages', icon: '✉', col: '#2f6fa8' },
  { id: 'jobs', name: 'Jobs', icon: '⚑', col: '#c0562f' },
  { id: 'health', name: 'Health', icon: '✚', col: '#b83a4a' },
  { id: 'weather', name: 'Weather', icon: '☂', col: '#4f6fa0' },
];
const WEATHER = { clear: 'Clear and sunny', cloudy: 'Cloudy', overcast: 'Overcast', rain: 'Rain', storm: 'Monsoon thunderstorm', drizzle: 'Drizzle' };

export class Phone {
  constructor(game, parent) {
    this.g = game; this.open = false; this.app = null; this.sel = 0; this.row = 0; this.confirm = false;
    this.root = el('div', 'phone hidden', parent); const body = el('div', 'phone-body', this.root);
    this.bar = el('div', 'phone-bar', body); this.screen = el('div', 'phone-screen', body); el('div', 'phone-home', body);
    this.root.addEventListener('click', (e) => { const t = e.target.closest('[data-i]'); if (!t) return; if (!this.app) { this.sel = +t.dataset.i; this.launch(APPS[this.sel].id); } else { this.row = +t.dataset.i; this.activate(); } });
    this.root.addEventListener('contextmenu', (e) => { e.preventDefault(); this.back(); });
  }
  toggle(v = !this.open) {
    const g = this.g; if (v && (g.photo || g.hud.bigMapOpen || g.director.active)) return;
    this.open = v; this.root.classList.toggle('hidden', !v); this.app = null; this.row = 0; this.confirm = false; Audio.ui('click');
    if (v) { g.weapons?.forceHolster?.(); this.render(); }
  }
  back() { if (this.confirm) { this.confirm = false; this.render(); return; } if (this.app) { this.app = null; this.row = 0; this.render(); Audio.ui('click'); } else this.toggle(false); }
  launch(id) {
    const g = this.g; Audio.ui('click');
    if (id === 'camera') { this.toggle(false); g.togglePhoto(true); return; }
    if (id === 'map') { this.toggle(false); g.toggleMap(true); return; }
    this.app = id; this.row = 0; this.confirm = false; this.render();
  }
  jobs() {
    const g = this.g, P = g.player, S = plan.missionShops || {}; const out = [];
    let tuk = null, td = 1e9; for (const v of g.traffic.parked || []) { if (v.type !== 'tuktuk') continue; const d = Math.hypot(v.x - P.x, v.z - P.z); if (d < td) { td = d; tuk = v; } }
    out.push({ t: 'Tuk-tuk taxi', d: `Drive fares across the city. Fare ≈ Rs. 150 flag + Rs. 16 per 100 m, 30% tip if on time. Get into any three-wheeler and press ${g.hud.key('more')}.${tuk ? ` Nearest parked tuk-tuk: ${Math.round(td)} m.` : ''}`, at: tuk ? { x: tuk.x, z: tuk.z } : null, done: g.story.state.stats.taxi });
    if (S.kade) out.push({ t: 'Short-eats delivery', d: `Lucky Tea Kade pays Rs. 600 + a speed bonus per parcel delivered before it gets cold. Ask Siri (${g.hud.key('more')}) at the kade.`, at: S.kade, done: g.story.state.stats.deliveries });
    if (S.garage) out.push({ t: 'Garage (spend)', d: 'Vehicle repairs Rs. 800.', at: S.garage });
    if (S.kade) out.push({ t: 'Tea & rotti (spend)', d: 'Rs. 150 — restores stamina and some health.', at: S.kade });
    if (S.tailor) out.push({ t: 'Ceylon Threads tailor (spend)', d: 'New jacket colour Rs. 2,000.', at: S.tailor });
    out.push({ t: 'National Hospital', d: 'Free treatment at the state hospital.', at: { x: L.PLACES.hospital.x, z: L.PLACES.hospital.z } });
    return out;
  }
  rows() { // selectable rows of the current app
    if (this.app === 'jobs') return this.jobs();
    if (this.app === 'health') return [{ t: 'Call 1990 Suwa Seriya' }, { t: 'GPS to National Hospital' }];
    return [];
  }
  activate() {
    const g = this.g;
    if (this.app === 'jobs') { const j = this.jobs()[this.row]; if (j && j.at) { g.hud.setWaypoint(j.at.x, j.at.z); this.toggle(false); } return; }
    if (this.app === 'health') {
      if (this.row === 1) { g.hud.setWaypoint(L.PLACES.hospital.x, L.PLACES.hospital.z); this.toggle(false); return; }
      if (!this.confirm) { this.confirm = true; this.render(); return; }
      this.toggle(false); if (g.health.hp >= 100) { g.hud.notify('1990 Suwa Seriya', 'The dispatcher checks on you: you are not injured, so no ambulance is sent.', 'info', 5); return; }
      g.health.hospitalise('called an ambulance', true);
    }
  }
  update() {
    if (!this.open) return; const k = (c) => Input.keyPressed(c); const n = this.app ? this.rows().length : APPS.length;
    if (k('Backspace')) { this.back(); return; }
    if (k('Enter') || Input.wasPressed('interact')) { if (!this.app) this.launch(APPS[this.sel].id); else this.activate(); return; }
    let moved = false;
    if (!this.app) { if (k('ArrowRight')) { this.sel = (this.sel + 1) % n; moved = true; } if (k('ArrowLeft')) { this.sel = (this.sel + n - 1) % n; moved = true; } if (k('ArrowDown')) { this.sel = Math.min(n - 1, this.sel + 3); moved = true; } if (k('ArrowUp')) { this.sel = Math.max(0, this.sel - 3); moved = true; } }
    else if (n) { if (k('ArrowDown')) { this.row = (this.row + 1) % n; this.confirm = false; moved = true; } if (k('ArrowUp')) { this.row = (this.row + n - 1) % n; this.confirm = false; moved = true; } }
    else if (k('ArrowDown') || k('ArrowUp')) { const sc = this.screen.querySelector('.ph-list'); if (sc) sc.scrollTop += k('ArrowDown') ? 60 : -60; }
    if (moved) { Audio.ui('hover'); this.render(); }
    this.tick = (this.tick || 0) + 1; if (this.tick % 30 === 0) this.renderBar(); // clock in the status bar
  }
  renderBar() { const A = this.g.atmos; this.bar.innerHTML = `<span>${A.timeString}</span><span class="ph-sig">LK 4G ▮▮▮▯ ▭</span>`; }
  render() {
    const g = this.g, S = g.story.state; this.renderBar(); let h = '';
    if (!this.app) {
      h = `<div class="ph-wall"><div class="ph-time">${g.atmos.timeString}</div><div class="ph-date">Day ${g.atmos.day} · Colombo</div></div><div class="ph-grid">` +
        APPS.map((a, i) => `<div class="ph-app${i === this.sel ? ' sel' : ''}" data-i="${i}"><b style="background:${a.col}">${a.icon}</b><span>${a.name}</span></div>`).join('') + '</div>' +
        `<div class="ph-hint">↑↓←→ select · Enter open · ${g.hud.key('phone')} close</div>`;
    } else if (this.app === 'wallet') {
      const led = S.ledger || [];
      h = `<div class="ph-head">Wallet</div><div class="ph-bal"><small>Balance</small>${rs(S.money)}</div><div class="ph-sub">Every rupee in or out, newest first</div><div class="ph-list">` +
        (led.length ? led.map((e) => `<div class="ph-tx"><span class="${e.n > 0 ? 'in' : 'out'}">${e.n > 0 ? '+' : '−'} ${rs(e.n)}</span><p>${esc(e.why)}</p><small>${esc(e.when)} · bal ${rs(e.bal)}</small></div>`).join('') : '<div class="ph-empty">No transactions yet this save.</div>') + '</div>';
    } else if (this.app === 'msgs') {
      const m = S.msgs || [];
      h = `<div class="ph-head">Messages</div><div class="ph-list">` + (m.length ? m.map((e) => `<div class="ph-msg"><b>${esc(e.from)}</b><small>${esc(e.when)}</small><p>${esc(e.text)}</p></div>`).join('') : '<div class="ph-empty">No messages.</div>') + '</div>';
    } else if (this.app === 'jobs') {
      h = `<div class="ph-head">Jobs & places</div><div class="ph-sub">Enter: set GPS waypoint</div><div class="ph-list">` + this.jobs().map((j, i) => `<div class="ph-row${i === this.row ? ' sel' : ''}" data-i="${i}"><b>${esc(j.t)}${j.done != null ? ` <small>· ${j.done} done</small>` : ''}</b><p>${j.d}</p></div>`).join('') + '</div>';
    } else if (this.app === 'health') {
      const hp = Math.round(g.health.hp), st = Math.round(g.player.stamina * 100);
      h = `<div class="ph-head">Health</div><div class="ph-meter"><span>Health</span><i><em style="width:${hp}%;background:${hp < 30 ? 'var(--red)' : '#5fbf6a'}"></em></i><b>${hp}%</b></div><div class="ph-meter"><span>Stamina</span><i><em style="width:${st}%;background:var(--teal)"></em></i><b>${st}%</b></div>` +
        `<div class="ph-sub">Rests to 60% on its own; tea & rotti +25; the hospital restores fully.</div>` +
        this.rows().map((r, i) => `<div class="ph-row${i === this.row ? ' sel' : ''}" data-i="${i}"><b>${r.t}</b>${i === 0 ? `<p>${this.confirm ? '<em class="ph-warn">Press Enter again to call. An ambulance will take you to the National Hospital (free service; medicines Rs. 900). An active mission or job will be abandoned.</em>' : 'Free national ambulance service.'}</p>` : ''}</div>`).join('');
    } else if (this.app === 'weather') {
      const A = g.atmos; const w = A.w || {}; const kind = A.weather || A.w?.kind || (w.rain > 0.5 ? 'rain' : w.cloud > 0.6 ? 'cloudy' : 'clear');
      h = `<div class="ph-head">Weather · Colombo</div><div class="ph-wx"><b>${WEATHER[kind] || kind}</b><p>${Math.round(28 + 3 * Math.sin(((A.hour - 9) / 24) * Math.PI * 2) - (w.rain || 0) * 3)}°C · humidity ${Math.round(72 + (w.rain || 0) * 20)}%</p><p>Rain ${Math.round((w.rain || 0) * 100)}% · wind ${Math.round((w.wind || 0) * 30)} km/h</p><small>Day ${A.day} · ${A.timeString}</small></div>`;
    }
    this.screen.innerHTML = h;
    const s = this.screen.querySelector('.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
  }
}
