// "Global" — the phone's web browser. A start page with twenty everyday sites (ui/GlobalSites.js) plus one private
// site: Black Orchid, which books Nila, the contractor in actors/Assassin.js (long-range contract with a satellite
// target picker, bodyguard for a day, a private evening). Keyboard: ↑↓ choose, Enter open, Backspace back; on the
// target picker the map is also clickable when the pointer is free.
import { SITES, esc } from './GlobalSites.js';
import { ORCHID } from '../actors/Assassin.js';
import { SAT } from './Satellite.js';

const rs = (n) => `Rs. ${Math.round(n).toLocaleString('en-LK')}`;
const ORCHID_URL = 'blackorchid.lk';

export class GlobalBrowser {
  constructor(phone, game) { this.phone = phone; this.g = game; this.reset(); }
  reset() { this.stack = [{ id: 'home' }]; this.cur = null; this.tg = []; this.tgT = 0; this.sel = null; this.frame = 0; }
  get top() { return this.stack[this.stack.length - 1]; }
  go(st) { this.stack.push(st); this.cur = null; this.phone.row = 0; if (st.id === 'orchid-map') { this.refreshTargets(true); } }
  back() { if (this.stack.length <= 1) return false; this.stack.pop(); this.cur = null; this.phone.row = this.top.row0 || 0; return true; }
  orchid() { return this.g.orchid; }
  // ---------------------------------------------------------------- pages
  build() {
    const g = this.g, st = this.top, S = g.story.state;
    if (st.id === 'home') {
      const rows = [{ t: '🌸 Black Orchid', s: 'Private services · 18+', go: { id: 'orchid' }, cls: 'orchid' }, ...SITES.map((s) => ({ t: `${s.name}`, s: `${s.url} · ${s.tag}`, go: { id: 'site', site: s.id }, ico: s.icon, col: s.col }))];
      return { url: 'global://start', title: 'Global', html: `<div class="gb-logo"><b>Global</b><small>Your island, one tap away</small></div><div class="gb-sec">Bookmarks</div>`, rows };
    }
    if (st.id === 'site') { const s = SITES.find((q) => q.id === st.site); const p = s.page(g); return { url: s.url, title: s.name, html: p.html, rows: p.rows.map((r) => (r.page ? { ...r, go: { id: 'article', site: s.id, article: r.page.article } } : r)) }; }
    if (st.id === 'article') { const s = SITES.find((q) => q.id === st.site); const a = st.article; return { url: `${s ? s.url : ''}/${a.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28)}`, title: a.title, html: `<div class="gb-article"><h3>${esc(a.title)}</h3>${a.html}</div>`, rows: [] }; }
    // ---- Black Orchid
    const O = this.orchid(); const F = ORCHID.fees;
    const head = `<div class="bo-head"><b>BLACK ORCHID</b><small>Discreet professional services · Colombo</small></div>`;
    if (st.id === 'orchid') {
      if (!(S.flags && S.flags.orchid18)) return { url: ORCHID_URL, title: 'Black Orchid', html: head + `<div class="bo-gate"><b>18+</b><p>This site offers services for adults only. By entering you confirm you are 18 or older.</p></div>`,
        rows: [{ t: 'I am 18 or older — enter', act: () => { (S.flags || (S.flags = {})).orchid18 = true; this.cur = null; this.phone.row = 0; return {}; } }, { t: 'Leave', act: () => { this.back(); return {}; } }] };
      const rows = [];
      rows.push({ t: `🎯 Long-range contract — ${rs(F.contract)}`, s: 'Pick a person near you on the satellite view. She takes the shot from a rooftop.', go: { id: 'orchid-map' } });
      if (O.guard) rows.push({ t: `🛡 Bodyguard — on duty, ${Math.ceil(O.guardLeft())} h left`, s: 'End her shift early (no refund)', go: { id: 'orchid-end' } });
      else rows.push({ t: `🛡 Bodyguard for a day — ${rs(F.guard)}`, s: `${ORCHID.guardHours} in-game hours at your shoulder; she waits outside the club, your home, any door.`, go: { id: 'orchid-confirm', kind: 'guard' } });
      if (O.evening) rows.push({ t: '🌙 Private evening — booked', s: 'She is waiting at your door. Tap to set the GPS again.', act: () => { const d = O.evening.door; g.hud.setWaypoint(d.x, d.z); return { close: true }; } });
      else rows.push({ t: `🌙 Private evening (18+) — ${rs(F.evening)}`, s: 'An evening at your place. Fade to black — nothing explicit is shown.', go: { id: 'orchid-confirm', kind: 'evening' } });
      rows.push({ t: 'About Nila', s: 'Profile', go: { id: 'orchid-about' } });
      return { url: ORCHID_URL, title: 'Black Orchid', html: head + `<div class="bo-bal">Your balance <b>${rs(S.money)}</b></div>`, rows };
    }
    if (st.id === 'orchid-about') return { url: ORCHID_URL + '/nila', title: 'Nila', html: head + `<div class="bo-card"><div class="bo-ph">N</div><b>Nila, 27</b><p>Former competitive rifle shooter. Calm, punctual, invisible when she needs to be. Works alone, takes payment up front, never discusses a client.</p><p><b>Long-range contracts</b> are taken from an elevated position with a clean line — if there is none, you are not charged.</p><p><b>Bodyguard</b> bookings last one day. Outside venues and homes she stays at the door.</p><p><b>Private evenings</b> are for consenting adults and happen behind closed doors.</p></div>`, rows: [] };
    if (st.id === 'orchid-end') return { url: ORCHID_URL + '/account', title: 'Black Orchid', html: head + `<p class="gs-p">End Nila’s shift now? The booking is not refunded.</p>`, rows: [{ t: 'End the shift', act: () => { O.dismissGuard(); this.stack.pop(); this.cur = null; this.phone.row = 0; return {}; } }, { t: 'Keep her on duty', act: () => { this.back(); return {}; } }] };
    if (st.id === 'orchid-confirm') {
      const fee = st.kind === 'contract' ? F.contract : st.kind === 'guard' ? F.guard : F.evening; const left = S.money - fee;
      let what = ''; if (st.kind === 'contract') { const p = st.p; what = `<b>Long-range contract</b><p>Target: ${esc(O.describe(p))}, ${Math.round(Math.hypot(p.x - g.player.x, p.z - g.player.z))} m from you.</p>`; }
      else if (st.kind === 'guard') what = `<b>Bodyguard for a day</b><p>${ORCHID.guardHours} in-game hours. She follows you on foot, by car when you drive, and stands guard outside when you go indoors.</p>`;
      else what = `<b>Private evening (18+)</b><p>She meets you at ${esc(O.homeName())}. The scene fades to black.</p>`;
      return { url: ORCHID_URL + '/checkout', title: 'Checkout', html: head + `<div class="bo-card">${what}<p>Fee <b>${rs(fee)}</b> · balance after <b class="${left < 0 ? 'neg' : ''}">${rs(left)}</b></p></div>`,
        rows: [{ t: left < 0 ? 'Insufficient balance' : `Confirm and pay ${rs(fee)}`, act: () => this.checkout(st) }, { t: 'Cancel', act: () => { this.back(); return {}; } }] };
    }
    if (st.id === 'orchid-result') return { url: ORCHID_URL + '/checkout', title: 'Black Orchid', html: head + `<div class="bo-card ${st.ok ? 'ok' : 'no'}"><b>${st.ok ? 'Confirmed' : 'Not booked'}</b><p>${esc(st.msg)}</p></div>`, rows: [{ t: 'Back to Black Orchid', act: () => { this.stack = this.stack.filter((q) => q.id === 'home' || q.id === 'orchid'); this.cur = null; this.phone.row = 0; return {}; } }] };
    if (st.id === 'orchid-map') {
      const n = this.tg.length; const rows = this.tg.slice(0, 12).map((q, i) => ({ t: `${i + 1}. ${O.describe(q.p)}`, s: `${Math.round(q.d)} m`, p: q.p, act: () => { if (q.p.dead || !g.crowd.peds.includes(q.p)) { this.refreshTargets(true); return {}; } this.go({ id: 'orchid-confirm', kind: 'contract', p: q.p }); return {}; } }));
      return { url: ORCHID_URL + '/contract', title: 'Choose target', html: head + `<canvas class="bo-map" width="480" height="360"></canvas><div class="bo-sub">${n ? `${n} people within ${ORCHID.radius} m · ↑↓ or tap a dot · Enter to choose` : g.indoor ? 'You need to be outside.' : 'Nobody near you right now.'}</div>`, rows };
    }
    return { url: 'global://error', title: 'Not found', html: '<p class="gs-p">Page not found.</p>', rows: [] };
  }
  checkout(st) {
    const O = this.orchid(); let r;
    if (st.kind === 'contract') r = O.contract(st.p); else if (st.kind === 'guard') r = O.hireGuard(); else r = O.bookEvening();
    if (r.ok && st.kind === 'contract') return { close: true };
    this.stack.push({ id: 'orchid-result', ok: r.ok, msg: r.msg }); this.cur = null; this.phone.row = 0; return {};
  }
  page() { if (!this.cur) this.cur = this.build(); return this.cur; }
  rows() { return this.page().rows; }
  activate(i) {
    const r = this.rows()[i]; if (!r) return {}; this.top.row0 = i;
    if (r.go) { this.go(r.go); return {}; }
    if (r.act) { const out = r.act() || {}; if (out.msg) this.g.hud.notify('Global', out.msg, 'warn', 3); this.cur = null; return out; }
    return {};
  }
  // ---------------------------------------------------------------- html
  html(row) {
    const p = this.page(); const secure = p.url.startsWith('global') ? '◍' : '🔒';
    const rows = p.rows.map((r, i) => `<div class="ph-row gb-row${r.cls ? ' ' + r.cls : ''}${i === row ? ' sel' : ''}" data-i="${i}">${r.ico ? `<i style="background:${r.col}">${r.ico}</i>` : ''}<div><b>${esc(r.t)}</b>${r.s ? `<p>${esc(r.s)}</p>` : ''}</div></div>`).join('');
    return `<div class="gb-chrome"><span class="gb-tab">${esc(p.title).slice(0, 28)}</span><div class="gb-url">${secure} ${esc(p.url)}</div></div><div class="ph-list gb-page">${p.html}${rows}</div><div class="ph-hint">↑↓ select · Enter open · Backspace back</div>`;
  }
  // ---------------------------------------------------------------- satellite target picker
  refreshTargets(force = false) {
    const now = performance.now(); if (!force && now - this.tgT < 1500) return false; this.tgT = now; const O = this.orchid(); if (!O) return false;
    const keep = this.sel; this.tg = O.targets().slice(0, 12); this.cur = null;
    if (keep) { const i = this.tg.findIndex((q) => q.p === keep); this.phone.row = i >= 0 ? i : Math.min(this.phone.row, Math.max(0, this.tg.length - 1)); }
    return true;
  }
  after(screen) {
    const cv = screen.querySelector('canvas.bo-map'); if (!cv) return; this.cv = cv;
    cv.onclick = (e) => { const b = cv.getBoundingClientRect(); const x = ((e.clientX - b.left) / b.width) * cv.width, y = ((e.clientY - b.top) / b.height) * cv.height; let best = -1, bd = 26 * 26;
      this.tg.forEach((q, i) => { const s = this.toScreen(q.p.x, q.p.z); const d = (s[0] - x) ** 2 + (s[1] - y) ** 2; if (d < bd) { bd = d; best = i; } });
      if (best >= 0) { if (best === this.phone.row) this.phone.activate(); else { this.phone.row = best; this.phone.render(); } } };
    this.draw();
  }
  toScreen(x, z) { const W = this.cv.width, H = this.cv.height, P = this.g.player, s = this.scale; return [W / 2 + (x - P.x) * s, H / 2 + (z - P.z) * s]; }
  draw() {
    const cv = this.cv; if (!cv || !cv.isConnected) return; const g = this.g, P = g.player, c = cv.getContext('2d'); const W = cv.width, H = cv.height; const R = ORCHID.radius + 6; this.scale = Math.min(W, H) / 2 / R; const s = this.scale;
    c.fillStyle = '#1b1f1c'; c.fillRect(0, 0, W, H);
    // building footprints first (always there), satellite imagery over them where it has been captured
    c.fillStyle = '#3a3e3a'; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; const vx0 = P.x - W / 2 / s, vx1 = P.x + W / 2 / s, vz0 = P.z - H / 2 / s, vz1 = P.z + H / 2 / s;
    for (const k of g.collision.query(vx0, vz0, vx1, vz1)) { if (k.kind !== 'building') continue; const a = this.toScreen(k.x0, k.z0), b = this.toScreen(k.x1, k.z1); c.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); c.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
    const S = g.hud && g.hud.satellite; let missing = 0;
    if (S) { const l = 1, size = SAT.sizes[l]; const i0 = Math.max(0, Math.floor((vx0 - SAT.x0) / size)), i1 = Math.min(S.cols(l) - 1, Math.floor((vx1 - SAT.x0) / size)), j0 = Math.max(0, Math.floor((vz0 - SAT.z0) / size)), j1 = Math.min(S.rows(l) - 1, Math.floor((vz1 - SAT.z0) / size));
      if (this.frame % 30 === 0) S.beginFrame();
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const tx = SAT.x0 + i * size, tz = SAT.z0 + j * size; const t = S.get(l, i, j, Math.hypot(tx + size / 2 - P.x, tz + size / 2 - P.z)); if (!t) { missing++; continue; } const a = this.toScreen(tx, tz); c.drawImage(t.c, a[0], a[1], size * s + 0.8, size * s + 0.8); } }
    this.missing = missing;
    c.fillStyle = 'rgba(8,12,10,0.18)'; c.fillRect(0, 0, W, H);
    // range rings
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.setLineDash([4, 5]); for (const r of [25, 50, 75]) { c.beginPath(); c.arc(W / 2, H / 2, r * s, 0, Math.PI * 2); c.stroke(); } c.setLineDash([]);
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = '600 14px Manrope, sans-serif'; c.fillText('N', W - 22, 22); c.beginPath(); c.moveTo(W - 17, 28); c.lineTo(W - 22, 40); c.lineTo(W - 12, 40); c.fill();
    // people (live positions), the selected one ringed
    const sel = this.tg[this.phone.row]; this.sel = sel ? sel.p : null;
    this.tg.forEach((q, i) => { const p = q.p; if (p.dead) return; const [x, y] = this.toScreen(p.x, p.z); const on = q === sel;
      c.beginPath(); c.arc(x, y, on ? 7 : 5, 0, Math.PI * 2); c.fillStyle = on ? '#e2453c' : '#f2efe8'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#111'; c.stroke();
      c.fillStyle = on ? '#fff' : 'rgba(255,255,255,0.85)'; c.font = '700 13px Manrope, sans-serif'; c.fillText(String(i + 1), x + 8, y - 6);
      if (on) { c.strokeStyle = '#e2453c'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 15, 0, Math.PI * 2); c.moveTo(x - 22, y); c.lineTo(x - 10, y); c.moveTo(x + 10, y); c.lineTo(x + 22, y); c.moveTo(x, y - 22); c.lineTo(x, y - 10); c.moveTo(x, y + 10); c.lineTo(x, y + 22); c.stroke(); } });
    // you
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw); c.save(); c.translate(W / 2, H / 2); c.rotate(Math.atan2(fx, -fz)); c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.fillStyle = '#e8a33a'; c.fill(); c.strokeStyle = '#111'; c.lineWidth = 2; c.stroke(); c.restore();
  }
  update() {
    this.frame++; if (this.top.id !== 'orchid-map') return false;
    const changed = this.refreshTargets(); if (changed) return true; // rows re-rendered by the phone
    if (this.frame % 4 === 0) this.draw();
    if (this.missing && this.g.hud.satellite && this.frame % 3 === 0) { try { this.g.hud.satellite.pump(4); } catch (e) { /* capture unavailable */ } }
    return false;
  }
}
