// Pause-map tabs (45th request). The full map gets a header in the style of a modern open-world pause menu: the active
// character's name, game day and time, cash; underneath a tab strip — MAP · <CHARACTER> · STATS · SQUAD — switched with
// Q / E (or clicked). The character tab is the profile: identity card, cash, health, stamina, location, vehicle, and
// the seven skills as five-segment bars with the selected skill's effect described underneath (W / S or hover).
// STATS lists lifetime numbers (distances, stunt jumps, accuracy, robberies, money); SQUAD compares all three.
// Content is rebuilt only when a tab opens or the selection moves — nothing runs per frame.
import { Audio } from '../audio/Audio.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rs = (n) => `Rs.&nbsp;${Math.round(n || 0).toLocaleString('en-LK')}`;
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m || 0)} m`);
const hms = (s) => { s = Math.floor(s || 0); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`; };
// five segments of 20 %, the last one partly filled (the classic skill bar)
export const segBar = (v, cls = '') => { let h = `<span class="pt-seg ${cls}">`; for (let i = 0; i < 5; i++) { const f = Math.max(0, Math.min(1, (v - i * 20) / 20)); h += `<i><b style="width:${(f * 100).toFixed(1)}%"></b></i>`; } return h + '</span>'; };

export class PauseTabs {
  constructor(bigMap, hud) {
    this.hud = hud; this.tab = 0; this.sel = 0; this.data = null;
    this.head = el('div', 'pt-head', bigMap);
    this.top = el('div', 'pt-top', this.head);
    this.tabsRow = el('div', 'pt-tabs', this.head);
    this.panel = el('div', 'pt-panel hidden', bigMap);
    addEventListener('keydown', (e) => {
      if (bigMap.classList.contains('hidden')) return;
      if (e.code === 'KeyQ' || e.code === 'KeyE') { this.go(this.tab + (e.code === 'KeyE' ? 1 : -1)); e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (this.tab === 0) return; // the map keeps WASD / zoom / waypoint keys
      if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'KeyS' || e.code === 'ArrowDown') { if (this.tabs()[this.tab].id === 'me') { this.sel = (this.sel + (e.code === 'KeyW' || e.code === 'ArrowUp' ? -1 : 1) + 7) % 7; Audio.ui('hover'); this.render(); } e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'KeyV', 'KeyC', 'Enter', 'NumpadEnter', 'Backspace', 'Delete'].includes(e.code)) { e.stopImmediatePropagation(); e.preventDefault(); } // map-only keys do nothing on the other tabs
    }, true);
  }
  tabs() { const d = this.data || {}; return [{ id: 'map', name: 'MAP' }, { id: 'me', name: (d.name || 'PLAYER').toUpperCase() }, { id: 'stats', name: 'STATS' }, { id: 'squad', name: 'SQUAD' }]; }
  open(data) { this.data = data; this.render(); }
  go(i) { const n = this.tabs().length; this.tab = (i + n) % n; Audio.ui('click'); this.render(); }
  render() {
    const d = this.data || {}; const T = this.tabs(); const t = T[this.tab];
    this.top.innerHTML = `<div class="pt-who"><span class="pt-dot" style="background:${esc(d.accent || '#e8a33a')}"></span><b>${esc((d.full || d.name || '').toUpperCase())}</b></div>
      <div class="pt-meta"><span>${esc(d.dayTime || '')}</span><span class="pt-cash">${rs(d.money)}</span></div>`;
    this.tabsRow.innerHTML = `<kbd class="pt-k">Q</kbd>${T.map((q, i) => `<button class="pt-tab${i === this.tab ? ' on' : ''}" data-i="${i}">${esc(q.name)}</button>`).join('')}<kbd class="pt-k">E</kbd>`;
    this.tabsRow.querySelectorAll('.pt-tab').forEach((b) => (b.onclick = () => { this.tab = +b.dataset.i; Audio.ui('click'); this.render(); }));
    const onMap = t.id === 'map'; this.panel.classList.toggle('hidden', onMap); this.hud.bigMap.classList.toggle('pt-dim', !onMap);
    if (onMap) return;
    if (t.id === 'me') this.panel.innerHTML = this.meHTML(d); else if (t.id === 'stats') this.panel.innerHTML = this.statsHTML(d); else this.panel.innerHTML = this.squadHTML(d);
    this.panel.querySelectorAll('.pt-skill').forEach((r) => (r.onmouseenter = () => { const i = +r.dataset.i; if (i !== this.sel) { this.sel = i; Audio.ui('hover'); this.render(); } }));
  }
  meHTML(d) {
    const sk = d.skills || []; const s = sk[this.sel] || sk[0] || {};
    const row = (k, v) => `<div class="pt-row"><span>${k}</span><b>${v}</b></div>`;
    return `<div class="pt-me">
      <div class="pt-card">
        <div class="pt-portrait" style="--acc:${esc(d.accent || '#e8a33a')}"><div class="pt-ini">${esc((d.name || '?').slice(0, 1))}</div><div class="pt-role">${esc(d.role || '')}</div></div>
        <div class="pt-name">${esc(d.full || d.name || '')}</div>
        ${row('Cash', rs(d.money))}${row('Health', `${Math.round(d.health ?? 100)}%`)}
        <div class="pt-row"><span>Stamina</span><b class="pt-mini"><i style="width:${Math.round((d.stamina ?? 1) * 100)}%"></i></b></div>
        ${row('Wanted level', d.wanted ? '★'.repeat(d.wanted) : 'None')}${row('Location', esc(d.where || '—'))}${row('Vehicle', esc(d.vehicle || 'On foot'))}${row('Time played', hms(d.stats && d.stats.play))}
      </div>
      <div class="pt-skills"><div class="pt-h">SKILLS</div>
        ${sk.map((q, i) => `<div class="pt-skill${i === this.sel ? ' on' : ''}" data-i="${i}"><span class="pt-sn">${esc(q.name.toUpperCase())}</span>${segBar(q.v)}<span class="pt-sv">${Math.floor(q.v)}%</span></div>`).join('')}
        <div class="pt-desc"><b>${esc(s.name || '')}</b><p>${esc(s.desc || '')}</p><p class="pt-how">Improve: ${esc(s.how || '')}</p></div>
      </div></div>`;
  }
  statsHTML(d) {
    const s = d.stats || {}; const acc = s.shots ? `${Math.round((100 * s.hits) / s.shots)}%` : '—';
    const L = [
      ['GENERAL', [['Time played', hms(s.play)], ['Missions completed', d.missions ?? 0], ['Hospital visits', d.admissions ?? 0], ['Times busted', d.busted ?? 0], ['Total earned', rs(s.earned)], ['Total spent', rs(s.spent)]]],
      ['TRAVEL', [['Distance on foot', km(s.foot)], ['Distance driven', km(s.drive)], ['Distance cycled', km(s.cycle)], ['Distance swum', km(s.swim)], ['Time underwater', hms(s.under)], ['Top speed', `${Math.round((s.topSpeed || 0) * 3.6)} km/h`]]],
      ['STUNTS', [['Car stunt jumps', `${(s.carJumps || []).length} / ${d.carTotal || 6}`], ['Bicycle ramps', `${(s.bikeRamps || []).length} / ${d.bikeTotal || 11}`], ['Jump attempts', s.stuntsTried || 0]]],
      ['COMBAT & CRIME', [['Shots fired', s.shots || 0], ['Accuracy', acc], ['Punches landed', s.punches || 0], ['Store robberies', s.robberies || 0], ['Taken in robberies', rs(s.robbed)]]],
    ];
    return `<div class="pt-stats">${L.map(([h, rows]) => `<div class="pt-block"><div class="pt-h">${h}</div>${rows.map(([k, v]) => `<div class="pt-row"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`).join('')}</div>`;
  }
  squadHTML(d) {
    return `<div class="pt-squad">${(d.squad || []).map((m) => `<div class="pt-mcard${m.active ? ' on' : ''}" style="--acc:${esc(m.accent)}"><div class="pt-mh"><b>${esc(m.full)}</b><span>${esc(m.role)}${m.active ? ' · PLAYING' : ''}</span></div>
      ${m.skills.map((q) => `<div class="pt-skill sm"><span class="pt-sn">${esc(q.name.toUpperCase())}</span>${segBar(q.v, 'sm')}<span class="pt-sv">${Math.floor(q.v)}</span></div>`).join('')}</div>`).join('')}</div>`;
  }
}
