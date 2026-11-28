// In-game smartphone (P). Every app does something real in the game:
//   Camera  -> photo mode (photo spots, crowd reactions)      Map      -> full map
//   Wallet  -> balance + every transaction with its reason     Messages -> mission briefings received
//   Jobs    -> live list of paid work, sets a GPS waypoint     Health   -> health/stamina, 1990 Suwa Seriya ambulance
//   Weather -> current conditions and in-game time/day      Contacts -> 119 emergency: police or ambulance
//   Global  -> web browser: twenty sites + the Black Orchid contractor (ui/GlobalBrowser.js)
// Keyboard: arrows to move, Enter (or E) to open/confirm, Backspace to go back, P or Esc to put the phone away.
// Mouse works too when the pointer is not locked. The phone never pauses the world.
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { SoundBank } from '../audio/SoundBank.js';
import { plan } from '../world/CityPlan.js';
import * as L from '../world/Layout.js';
import { callOptions, lines as friendLines } from '../actors/SquadCall.js';
import { GlobalBrowser } from './GlobalBrowser.js';
import { PALETTES } from '../world/events/CityEventCatalog.js';
import { heroArt } from '../world/events/EventArt.js'; // 81st: City Events app artwork colours

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
  { id: 'contacts', name: 'Contacts', icon: '☎', col: '#3d8b5a' },
  { id: 'global', name: 'Global', icon: '◍', col: '#1d63c9' },
  { id: 'events', name: 'City Events', icon: '✺', col: '#c9952b' },
  { id: 'afterdark', name: 'After Dark', icon: '☾', col: '#5a2f7d' }, // 92nd: tonight's fight nights and race meets (activities/ActivityManager.js) // 81st: live list from the event manager (world/CityEvents.js)
  { id: 'live', name: 'ColomboLive', icon: '▶', col: '#d93654' },
];
const LIVE_HANDLES = ['@colombo_eyewitness', '@fort_commuter_lk', '@galle_rd_pulse', '@pettah_insider', '@lanka_streetcam', '@marine_dr_live', '@cmb_watch_247'];
const LIVE_AMBIENT = [
  { u: '@galleface_vibes', t: 'Isso wade & sea breeze hitting different on Galle Face Green tonight 🌊🦐 #Colombo #LK', d: 'Galle Face Green', v: 3420, l: 612, at: { x: -490, z: 40 } },
  { u: '@pettah_tuk_king', t: 'Main Street traffic is madness as usual machan 😂 Horn symphony in full swing! #Pettah #TukLife', d: 'Pettah', v: 1890, l: 284, at: { x: -80, z: -260 } },
  { u: '@cinnamon_gardens_lk', t: 'Spotted a clean metallic Raiden cruising past Viharamahadevi Park 🔥 Whose ride is this?', d: 'Cinnamon Gardens', v: 5120, l: 940, at: { x: 180, z: 260 } },
];
const EV_TABS = [['now', 'Now'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['recent', 'Recent']];
const CONTACTS = [{ n: '119', t: 'Police Emergency', d: 'Sri Lanka Police emergency line — police or ambulance' },
  { n: 'Street Customs', t: 'Roadside Assistance', d: 'Breakdown & recovery (Cinnamon Gardens). Stand by your broken-down vehicle and call: a mechanic van, or a flatbed to the garage.', rs: true }]; // 80th: Roadside.call
const WEATHER = { clear: 'Clear and sunny', cloudy: 'Cloudy', overcast: 'Overcast', rain: 'Rain', storm: 'Monsoon thunderstorm', drizzle: 'Drizzle' };

export class Phone {
  constructor(game, parent) {
    this.g = game; this.open = false; this.app = null; this.sel = 0; this.row = 0; this.confirm = false;
    this.root = el('div', 'phone hidden', parent); const body = el('div', 'phone-body', this.root);
    this.bar = el('div', 'phone-bar', body); this.screen = el('div', 'phone-screen', body); el('div', 'phone-home', body);
    this.root.addEventListener('click', (e) => { const tb = e.target.closest('[data-tab]'); if (tb && this.app === 'events') { this.evTab = +tb.dataset.tab; this.evOpen = null; this.row = 0; Audio.ui('hover'); this.render(); return; } const t = e.target.closest('[data-i]'); if (!t) return; if (!this.app) { this.sel = +t.dataset.i; this.launch(APPS[this.sel].id); } else { this.row = +t.dataset.i; this.activate(); } });
    this.root.addEventListener('contextmenu', (e) => { e.preventDefault(); this.back(); });
    this.browser = new GlobalBrowser(this, game);
    this.liveFeed = [];
  }
  pushLivePost(ev) {
    const g = this.g, A = g.atmos;
    const dName = (L.DISTRICTS && L.DISTRICTS[ev.district] && L.DISTRICTS[ev.district].name) || ev.district || 'Colombo';
    const u = LIVE_HANDLES[Math.floor(Math.random() * LIVE_HANDLES.length)];
    const k = ev.kind || 'fight';
    const cap = k === 'holdup' ? `Broad-daylight hold-up caught on camera in ${dName}! Stay alert everyone 😱📹 #ColomboLive #119`
      : k === 'gunshot' ? `Shots heard near ${dName}!! People running for cover — stay clear of that junction! 🚨`
      : k === 'crash' || k === 'accident' ? `Heavy smash on the road in ${dName}! Traffic backing up fast 💥🚗`
      : k === 'brawl' || k === 'assault' ? `Street brawl breaking out right in front of us in ${dName}! Whole crowd watching 😳👊`
      : `Wild confrontation on the pavement in ${dName} — caught the whole thing on clip! 📱👀`;
    const post = {
      u, t: cap, d: dName, when: `Day ${A ? A.day : 1} · ${A ? A.timeString : '12:00'}`,
      viral: !!ev.playerInvolved, t0: g.crowd ? g.crowd.t : 0,
      v: ev.playerInvolved ? 1200 + Math.floor(Math.random() * 900) : 340 + Math.floor(Math.random() * 500),
      l: 95 + Math.floor(Math.random() * 180),
      at: { x: ev.x, z: ev.z },
    };
    this.liveFeed.unshift(post);
    if (this.liveFeed.length > 18) this.liveFeed.length = 18;
    if (this.open && this.app === 'live') this.render();
    return post;
  }
  liveRows() {
    const nowT = this.g.crowd ? this.g.crowd.t : 0;
    const dyn = this.liveFeed.map((p) => {
      const age = Math.max(0, nowT - (p.t0 || 0));
      const mult = p.viral ? 1 + Math.min(12, age * 0.08) : 1 + Math.min(4, age * 0.025);
      return { ...p, views: Math.round(p.v * mult), likes: Math.round(p.l * mult) };
    });
    return [...dyn, ...LIVE_AMBIENT.map((p) => ({ ...p, when: 'Trending · Colombo', views: p.v, likes: p.l, viral: false }))];
  }
  toggle(v = !this.open) {
    const g = this.g; if (v && (g.photo || g.hud.bigMapOpen || g.director.active)) return;
    if (!v && this.browser) this.browser.releaseTyping(); /* the Global search bar had the keyboard */
    this.open = v; this.root.classList.toggle('hidden', !v); this.app = null; this.row = 0; this.confirm = false; this.call = null; Audio.ui('click');
    if (v) { g.weapons?.forceHolster?.(); this.render(); }
  }
  back() { if (this.call) { this.hangUp(); return; } if (this.app === 'global' && this.browser.back()) { Audio.ui('click'); this.render(); return; } if (this.confirm) { this.confirm = false; this.render(); return; } if (this.app === 'events' && this.evOpen) { this.evOpen = null; this.row = this.evRowBack || 0; this.render(); Audio.ui('click'); return; } if (this.app) { this.app = null; this.row = 0; this.render(); Audio.ui('click'); } else this.toggle(false); }
  launch(id) {
    const g = this.g; Audio.ui('click');
    if (id === 'camera') { this.toggle(false); g.togglePhoto(true); return; }
    if (id === 'map') { this.toggle(false); g.toggleMap(true); return; }
    if (id === 'global') this.browser.reset();
    if (id === 'events') { this.evOpen = null; const S = this.evSections(); this.evTab = S && S.now.length ? 0 : S && S.today.length ? 1 : 2; }
    this.app = id; this.row = 0; this.confirm = false; this.render();
  }
  jobs() {
    const g = this.g, P = g.player, S = plan.missionShops || {}; const out = [];
    let tuk = null, td = 1e9; for (const v of g.traffic.parked || []) { if (v.type !== 'tuktuk') continue; const d = Math.hypot(v.x - P.x, v.z - P.z); if (d < td) { td = d; tuk = v; } }
    out.push({ t: 'Tuk-tuk taxi', d: `Drive fares across the city. Fare ≈ Rs. 150 flag + Rs. 16 per 100 m, 30% tip if on time. Get into any three-wheeler and press ${g.hud.key('more')}.${tuk ? ` Nearest parked tuk-tuk: ${Math.round(td)} m.` : ''}`, at: tuk ? { x: tuk.x, z: tuk.z } : null, done: g.story.state.stats.taxi });
    if (S.kade) out.push({ t: 'Short-eats delivery', d: `Lucky Tea Kade pays Rs. 600 + a speed bonus per parcel delivered before it gets cold. Ask Siri (${g.hud.key('more')}) at the kade.`, at: S.kade, done: g.story.state.stats.deliveries });
    if (S.garage) out.push({ t: 'Garage (spend)', d: 'Vehicle repairs Rs. 800.', at: S.garage });
    if (S.club) out.push({ t: 'The Velvet Monsoon (spend)', d: 'Club on Galle Road, Kollupitiya: live pole-dance shows, bar and lounge (18+). Tip a dancer Rs. 500, make it rain Rs. 5,000, a shot at the bar Rs. 1,200.', at: S.club });
    if (S.kade) out.push({ t: 'Tea & rotti (spend)', d: 'Rs. 150 — restores stamina and some health.', at: S.kade });
    if (S.tailor) out.push({ t: 'Ceylon Threads tailor (spend)', d: 'New jacket colour Rs. 2,000.', at: S.tailor });
    out.push({ t: 'National Hospital', d: 'Free treatment at the state hospital.', at: { x: L.PLACES.hospital.x, z: L.PLACES.hospital.z } });
    return out;
  }
  rows() { // selectable rows of the current app
    if (this.app === 'jobs') return this.jobs();
    if (this.app === 'global') return this.browser.rows();
    if (this.app === 'events') { if (this.evOpen) return [{ t: 'Navigate' }, { t: 'Back to the list' }]; const S = this.evSections(); return S ? S[EV_TABS[this.evTab || 0][0]] : []; }
    if (this.app === 'afterdark') return this.g.activities ? this.g.activities.phoneRows() : [];
    if (this.app === 'live') return this.liveRows();
    if (this.app === 'health') return [{ t: 'Call 1990 Suwa Seriya' }, { t: 'GPS to National Hospital' }];
    if (this.app === 'contacts') { if (!this.call) return this.contacts(); if (this.call.stage === 'ask') return this.call.friend ? callOptions(this.friend(this.call.friend)) : [{ t: 'Police' }, { t: 'Ambulance' }, { t: 'Hang up' }]; return []; }
    return [];
  }
  activate() {
    const g = this.g;
    if (this.app === 'global') { Audio.ui('click'); const r = this.browser.activate(this.row); if (r && r.close) { if (this.open) this.toggle(false); } else if (this.open) this.render(); return; }
    if (this.app === 'contacts') {
      if (!this.call) { const c = this.contacts()[this.row]; if (!c) return; this.call = { n: c.n, friend: c.friend || null, rs: !!c.rs, stage: 'ring', t: 0 }; this.row = 0; this.ring(); this.render(); return; }
      if (this.call.stage !== 'ask') return;
      if (this.call.friend) { const m = this.friend(this.call.friend); const o = m && callOptions(m)[this.row]; if (!o || o.id === 'hang') { this.hangUp(); return; } const r = this.friendAnswer(m, o.id); this.call = { n: this.call.n, friend: this.call.friend, stage: 'done', res: r }; Audio.ui(r.ok ? 'notify' : 'click'); this.render(); return; }
      if (this.row === 2) { this.hangUp(); return; }
      const kind = this.row === 0 ? 'police' : 'ambulance'; const r = g.police && g.police.emergencyCall ? g.police.emergencyCall(kind) : { ok: false, title: '119', msg: 'No answer.' };
      this.call = { n: this.call.n, stage: 'done', kind, res: r }; Audio.ui(r.ok ? 'notify' : 'click'); this.render(); return;
    }
    if (this.app === 'events') { const M = g.cityEvents; if (!M) return; Audio.ui('click');
      if (!this.evOpen) { const ev = this.rows()[this.row]; if (!ev) return; this.evOpen = ev.id; this.evRowBack = this.row; this.row = 0; this.render(); return; }
      if (this.row === 0) { const ev = M.byId.get(this.evOpen); if (ev) { const v = M.view(ev); g.hud.setWaypoint(v.at.x, v.at.z); g.hud.notify('GPS set', `${v.title} — ${v.venueShort}`, 'info', 3); this.toggle(false); } return; }
      this.back(); return; }
    if (this.app === 'jobs') { const j = this.jobs()[this.row]; if (j && j.at) { g.hud.setWaypoint(j.at.x, j.at.z); this.toggle(false); } return; }
    if (this.app === 'afterdark') { const r = this.rows()[this.row]; if (r && r.at) { g.hud.setWaypoint(r.at.x, r.at.z); g.hud.notify('GPS set', r.t, 'info', 3); this.toggle(false); } return; }
    if (this.app === 'live') { const r = this.rows()[this.row]; if (r && r.at) { g.hud.setWaypoint(r.at.x, r.at.z); g.hud.notify('ColomboLive GPS', `Pinned clip location in ${r.d}`, 'info', 3); this.toggle(false); } return; }
    if (this.app === 'health') {
      if (this.row === 1) { g.hud.setWaypoint(L.PLACES.hospital.x, L.PLACES.hospital.z); this.toggle(false); return; }
      if (!this.confirm) { this.confirm = true; this.render(); return; }
      this.toggle(false); if (g.health.hp >= 100) { g.hud.notify('1990 Suwa Seriya', 'The dispatcher checks on you: you are not injured, so no ambulance is sent.', 'info', 5); return; }
      g.health.hospitalise('called an ambulance', true);
    }
  }
  // squad-mates you are not playing: call one to ask him along (he names a pickup spot), ask where he is, or send him off
  friend(id) { const sq = this.g.squad; return sq && sq.memberById(id); }
  contacts() {
    const sq = this.g.squad; if (!sq || !sq.unlocked) return CONTACTS;
    const fr = sq.followers.map((m) => ({ n: m.def.name, friend: m.def.id, t: m.crew === 'with' ? 'With you' : m.crew === 'pickup' ? 'Waiting for a lift' : 'Friend', d: m.crew === 'with' ? 'Riding / walking with you. Call to send him off.' : m.crew === 'pickup' && m.call ? `Waiting ${m.call.label}.` : 'Call and ask him to come along — you pick him up by car.' }));
    return [...fr, ...CONTACTS];
  }
  friendAnswer(m, id) {
    const g = this.g, sq = g.squad, Ln = friendLines(m.def.id), t = m.def.name;
    if (id === 'come') { if (g.police && g.police.level > 0) return { ok: false, title: t, msg: Ln.wanted }; const c = sq.arrangePickup(m); return { ok: true, title: t, msg: Ln.yes(c.label) }; }
    if (id === 'where') { if (m.call) g.hud.setWaypoint(m.call.x, m.call.z); return { ok: true, title: t, msg: Ln.where(m.call ? m.call.label : 'by the road') }; }
    if (id === 'cancel') { sq.cancelPickup(m); return { ok: true, title: t, msg: Ln.cancel }; }
    if (id === 'bye') { sq.dismiss(m); return { ok: true, title: t, msg: Ln.bye }; }
    return { ok: false, title: t, msg: 'No answer.' };
  }
  ring() { if (SoundBank.play('phone.ring')) return; if (Audio.tone) { Audio.tone(425, 0.9, { type: 'sine', vol: 0.05, attack: 0.02 }); } }
  hangUp() { const c = this.call; this.call = null; this.row = 0; if (c && c.stage === 'done' && c.res) this.g.hud.notify(c.res.title || '119', c.res.msg, c.res.ok ? 'info' : 'warn', 6); this.toggle(false); }
  update() {
    if (!this.open) return;
    if (this.call) { const c = this.call; const now = performance.now() / 1000; if (c.t0 === undefined) { c.t0 = now; c.rung = now; } c.t = now - c.t0; // real time: the phone never pauses the world
      if (c.stage === 'ring' && c.t > 2.2 && c.rs) { const R = this.g.police && this.g.police.rs; c.res = R ? R.call() : { ok: false, title: 'Street Customs Roadside', msg: 'No answer.' }; c.stage = 'done'; c.t0 = now; c.t = 0; Audio.ui(c.res.ok ? 'notify' : 'click'); this.render(); } // 80th: the breakdown desk answers straight away
      else if (c.stage === 'ring' && c.t > 2.2) { c.stage = 'ask'; c.t0 = now; c.t = 0; this.row = 0; this.render(); Audio.ui('notify'); }
      else if (c.stage === 'ring' && now - c.rung > 1.1) { c.rung = now; this.ring(); }
      else if (c.stage === 'done' && c.t > 4.5) { this.hangUp(); return; } } const k = (c) => Input.keyPressed(c); const n = this.app ? this.rows().length : APPS.length;
    if (k('Backspace')) { this.back(); return; }
    if (k('Enter') || Input.wasPressed('interact')) { if (!this.app) this.launch(APPS[this.sel].id); else this.activate(); return; }
    let moved = false;
    if (!this.app) { if (k('ArrowRight')) { this.sel = (this.sel + 1) % n; moved = true; } if (k('ArrowLeft')) { this.sel = (this.sel + n - 1) % n; moved = true; } if (k('ArrowDown')) { this.sel = Math.min(n - 1, this.sel + 3); moved = true; } if (k('ArrowUp')) { this.sel = Math.max(0, this.sel - 3); moved = true; } }
    else if (this.app === 'events' && this.evOpen) { if (k('ArrowLeft') || k('ArrowRight')) { this.row = 1 - (this.row || 0); moved = true; } else if (k('ArrowDown') || k('ArrowUp')) { const sc = this.screen.querySelector('.ph-list'); if (sc) sc.scrollTop += k('ArrowDown') ? 60 : -60; } } // details: ←→ Navigate / Back, ↑↓ scroll
    else if (this.app === 'events' && !this.evOpen && (k('ArrowLeft') || k('ArrowRight'))) { this.evTab = ((this.evTab || 0) + (k('ArrowRight') ? 1 : 3)) % 4; this.row = 0; moved = true; }
    else if (n) { if (k('ArrowDown')) { this.row = (this.row + 1) % n; this.confirm = false; moved = true; } if (k('ArrowUp')) { this.row = (this.row + n - 1) % n; this.confirm = false; moved = true; } }
    else if (k('ArrowDown') || k('ArrowUp')) { const sc = this.screen.querySelector('.ph-list'); if (sc) sc.scrollTop += k('ArrowDown') ? 60 : -60; }
    if (moved) { Audio.ui('hover'); this.render(); }
    else if (this.app === 'global' && this.browser.update()) this.render(); // target picker: live positions
    this.tick = (this.tick || 0) + 1; if (this.tick % 30 === 0) this.renderBar(); // clock in the status bar
    if ((this.app === 'events' || this.app === 'live') && this.tick % 45 === 0) this.render(); // live: states, attendance, notes, ColomboLive viral timer & views
  }
  // ---- 81st: City Events (data: Game.cityEvents — the live instances of the event manager; nothing here is made up)
  evSections() { const M = this.g.cityEvents; return M && M.ready ? M.sections() : null; }
  evArt(v, big = false) { const P = PALETTES[v.pal] || { a: v.col, b: '#f2c14e', c: '#333' }; const M = this.g.cityEvents; const ev = M && M.byId.get(v.id); const url = ev ? heroArt(ev) : null; const grad = big ? `linear-gradient(180deg, rgba(0,0,0,0.05) 25%, rgba(10,12,18,0.88) 100%)` : `linear-gradient(135deg, ${P.a} 0%, ${P.c} 100%)`; return url ? `background:${big ? grad + ', ' : ''}url(${url}) center/cover, ${P.a};` : `background:linear-gradient(135deg, ${P.a} 0%, ${P.a} 45%, ${P.c} 100%);`; }
  evPill(v) { const st = v.state === 'cleanup' && /Cancel/.test(v.status) ? 'cancelled' : v.state; return `<em class="ph-ev-st st-${st}">${esc(v.status)}</em>`; }
  evHtml() {
    const M = this.g.cityEvents; if (!M || !M.ready) return '<div class="ph-head">City Events</div><div class="ph-empty">The event calendar is not available.</div>';
    if (this.evOpen) { const ev = M.byId.get(this.evOpen); if (!ev) { this.evOpen = null; return this.evHtml(); } const v = M.view(ev); const P = PALETTES[v.pal] || {};
      return `<div class="ph-ev-hero" style="${this.evArt(v, true)}"><span class="ph-ev-cat" style="background:${v.col}">${esc(v.cat)}</span><h3>${esc(v.title)}</h3>${this.evPill(v)}</div>` +
        `<div class="ph-ev-act">${this.rows().map((r, i) => `<div class="ph-row${i === this.row ? ' sel' : ''}" data-i="${i}"><b>${i === 0 ? 'Navigate' : 'Back'}</b><p>${i === 0 ? 'GPS to the entrance' : 'All events'}</p></div>`).join('')}</div>` +
        `<div class="ph-list ph-ev-det"><div class="ph-ev-kv"><span>When</span><b>${esc(v.date)}<br>${esc(v.start)} – ${esc(v.end)}</b></div><div class="ph-ev-kv"><span>Where</span><b>${esc(v.venue)}</b></div>` +
        `<div class="ph-ev-kv"><span>Status</span><b>${esc(v.status)}${v.reason ? `<small>${esc(v.reason)}</small>` : ''}</b></div><div class="ph-ev-kv"><span>Crowd</span><b>${esc(v.crowd)}<small>expected peak ≈ ${v.peak.toLocaleString('en-LK')}</small></b></div>` +
        `<p class="ph-ev-desc">${esc(v.desc)}</p><div class="ph-ev-h">Activities</div><ul class="ph-ev-ul">${(v.acts || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul><div class="ph-ev-h">Public information</div><p class="ph-ev-desc">${esc(v.info)}</p>` +
        (v.notes.length ? `<div class="ph-ev-h">Updates</div><ul class="ph-ev-ul ph-ev-notes">${v.notes.slice().reverse().map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '') +
''+ '</div>';
    }
    const S = M.sections(); const tab = this.evTab || 0; const list = S[EV_TABS[tab][0]];
    const empty = ['Nothing is on right now.', 'No more events scheduled for today.', 'No events scheduled for the coming days.', 'No recent events.'][tab];
    return `<div class="ph-head">City Events <small class="ph-ev-day">Day ${this.g.atmos.day}</small></div><div class="ph-ev-tabs">${EV_TABS.map(([k, n], i) => `<span class="${i === tab ? 'on' : ''}" data-tab="${i}">${n}<i>${S[k].length}</i></span>`).join('')}</div>` +
      `<div class="ph-list">${list.length ? list.map((ev, i) => { const v = M.view(ev); return `<div class="ph-row ph-ev-row${i === this.row ? ' sel' : ''}" data-i="${i}"><i class="ph-ev-art" style="${this.evArt(v)}"></i><div><b>${esc(v.title)}</b><p>${esc(v.cat)} · ${esc(v.venueShort)}</p><small>${esc(v.dateShort)} · ${esc(v.start)} – ${esc(v.end)}</small>${this.evPill(v)}${tab === 0 && v.attendance ? `<small class="ph-ev-n">${esc(v.crowd)}</small>` : ''}</div></div>`; }).join('') : `<div class="ph-empty">${empty}</div>`}</div>` +
      '<div class="ph-hint">←→ lists · ↑↓ select · Enter details · Backspace back</div>';
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
    } else if (this.app === 'contacts') {
      const c = this.call;
      if (!c) h = `<div class="ph-head">Contacts</div><div class="ph-list">` + this.contacts().map((k, i) => `<div class="ph-row${i === this.row ? ' sel' : ''}" data-i="${i}"><b>${k.friend ? '👤' : '☎'} ${k.n} · ${k.t}</b><p>${esc(k.d)}</p></div>`).join('') + '</div><div class="ph-hint">Enter: call</div>';
      else if (c.stage === 'ring') h = `<div class="ph-call"><div class="ph-call-n">${c.n}</div><div class="ph-call-s">Calling…</div><div class="ph-call-ring">☎</div></div>`;
      else if (c.stage === 'ask' && c.friend) h = `<div class="ph-call"><div class="ph-call-n">${c.n}</div><div class="ph-call-q">“${esc(friendLines(c.friend).hi)}”</div></div>` + this.rows().map((r, i) => `<div class="ph-row${i === this.row ? ' sel' : ''}" data-i="${i}"><b>${esc(r.t)}</b></div>`).join('') + '<div class="ph-hint">↑↓ choose · Enter answer · Backspace hang up</div>';
      else if (c.stage === 'done' && c.friend) h = `<div class="ph-call"><div class="ph-call-n">${c.n}</div><div class="ph-call-q ${c.res.ok ? 'ok' : 'no'}">“${esc(c.res.msg)}”</div><div class="ph-call-s">Call ended</div></div>`;
      else if (c.stage === 'ask') h = `<div class="ph-call"><div class="ph-call-n">${c.n} · Emergency</div><div class="ph-call-q">“119 Emergency. Police or ambulance?”</div></div>` + this.rows().map((r, i) => `<div class="ph-row${i === this.row ? ' sel' : ''}" data-i="${i}"><b>${r.t}</b></div>`).join('') + '<div class="ph-hint">↑↓ choose · Enter answer · Backspace hang up</div>';
      else if (c.stage === 'done' && c.rs) h = `<div class="ph-call"><div class="ph-call-n">${c.n} · Roadside Assistance</div><div class="ph-call-q ${c.res.ok ? 'ok' : 'no'}">${esc(c.res.msg)}</div><div class="ph-call-s">Call ended</div></div>`;
      else h = `<div class="ph-call"><div class="ph-call-n">${c.n} · ${c.kind === 'police' ? 'Police' : 'Ambulance (1990 Suwa Seriya)'}</div><div class="ph-call-q ${c.res.ok ? 'ok' : 'no'}">${esc(c.res.msg)}</div><div class="ph-call-s">Call ended</div></div>`;
    } else if (this.app === 'global') {
      h = this.browser.html(this.row);
    } else if (this.app === 'afterdark') {
      const M = g.activities; const rows = this.rows();
      h = `<div class="ph-head">After Dark</div><div class="ph-sub">${M ? esc(M.summary()) : ''} · Enter: GPS</div><div class="ph-list">` + (rows.length ? rows.map((r, i) => `<div class="ph-row${i === this.row ? ' sel' : ''}" data-i="${i}"><b>${esc(r.t)}</b><p>${esc(r.d)}</p><small>${esc(r.sub || '')}</small></div>`).join('') : '<div class="ph-empty">Nothing on tonight.</div>') + '</div>' +
        '<div class="ph-hint">Fight nights 21:30–01:30 · race meets 22:30–02:30. Predictions use free points, never money.</div>';
    } else if (this.app === 'live') {
      const C = g.crowd; const viralLeft = C && C.viralUntil > C.t ? Math.ceil(C.viralUntil - C.t) : 0;
      const vDist = viralLeft ? ((L.DISTRICTS && L.DISTRICTS[C.viralDistrict] && L.DISTRICTS[C.viralDistrict].name) || C.viralDistrict || 'Colombo') : '';
      const rows = this.liveRows();
      const banner = viralLeft
        ? `<div class="ph-sub" style="color:#ff6b7a;font-weight:600">● VIRAL IN ${esc(vDist.toUpperCase())} (${viralLeft}s) — Locals recognize you! Change outfit at Ceylon Threads or switch hero to clear.</div>`
        : `<div class="ph-sub">● LIVE · Witness clips & street pulse across Colombo · Enter: GPS</div>`;
      h = `<div class="ph-head">ColomboLive</div>` + banner + `<div class="ph-list">` +
        rows.map((r, i) => `<div class="ph-row${i === this.row ? ' sel' : ''}" data-i="${i}"><b>${r.viral ? '<span style="color:#ff5268">[VIRAL]</span> ' : ''}${esc(r.u)} <small>· ${esc(r.d)}</small></b><p>${esc(r.t)}</p><small>${esc(r.when)} · 👁 ${r.views.toLocaleString('en-LK')} · ♥ ${r.likes.toLocaleString('en-LK')}</small></div>`).join('') +
        `</div><div class="ph-hint">Witnesses filming upload in 5s unless warned off or interrupted.</div>`;
    } else if (this.app === 'events') {
      h = this.evHtml();
    } else if (this.app === 'weather') {
      const A = g.atmos; const w = A.w || {}; const kind = A.weather || A.w?.kind || (w.rain > 0.5 ? 'rain' : w.cloud > 0.6 ? 'cloudy' : 'clear');
      h = `<div class="ph-head">Weather · Colombo</div><div class="ph-wx"><b>${WEATHER[kind] || kind}</b><p>${Math.round(28 + 3 * Math.sin(((A.hour - 9) / 24) * Math.PI * 2) - (w.rain || 0) * 3)}°C · humidity ${Math.round(72 + (w.rain || 0) * 20)}%</p><p>Rain ${Math.round((w.rain || 0) * 100)}% · wind ${Math.round((w.wind || 0) * 30)} km/h</p><small>Day ${A.day} · ${A.timeString}</small></div>`;
    }
    const keep = this.app === 'events' && this.evOpen && this.evShown === this.evOpen ? (this.screen.querySelector('.ph-list') || {}).scrollTop || 0 : 0; this.evShown = this.app === 'events' ? this.evOpen : null; // the live refresh keeps the details where they were scrolled
    this.screen.innerHTML = h; if (this.app === 'global') this.browser.after(this.screen);
    const s = this.screen.querySelector('.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' }); if (keep) { const sc = this.screen.querySelector('.ph-list'); if (sc) sc.scrollTop = keep; }
  }
}
