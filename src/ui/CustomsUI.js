// COLOMBO CUSTOMS — shop interface. The 3D view stays live behind it: every choice is previewed ON the real vehicle standing on the
// turntable (CustomsApply.applyMods with { preview: true }); nothing is charged until Buy, and leaving / backing out restores the
// installed configuration for free. Only the categories, slots and options that fit THIS vehicle are listed (CustomsCatalog +
// the body scan); police / emergency vehicles never get here (CustomsService.entryCheck).
// Keyboard: ↑/↓ move · Enter / → open or buy · Backspace / ← back · Esc back / leave · 1–7 camera views · R rev the engine.
// Mouse: click anything · drag the empty area to orbit · wheel to zoom.
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { SHOP_NAME, MAX_OWNED, slotsFor, categoriesFor, priceOf, optionOf, statsOf, tuneOf, profileOf, slotLocked, NEEDS_TEXT, plateText, effective } from '../customs/CustomsCatalog.js';
import { applyMods, installMods, restoreInstalled, setPreviewLights, lookScan } from '../customs/CustomsApply.js';
import { REPAIR_PRICE, VIEWS } from '../customs/CustomsService.js';

const rs = (n) => 'Rs. ' + Math.round(n).toLocaleString('en-LK');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const P_ = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICON = {
  body: P_('<path d="M3 15l2-5 3-2h7l3 2 3 1v4"/><path d="M3 15h18"/><circle cx="7" cy="16" r="2"/><circle cx="17" cy="16" r="2"/>'),
  spray: P_('<rect x="7" y="9" width="7" height="12" rx="1.5"/><path d="M9 9V6h3v3"/><path d="M15 5h1M18 3h1M17 7h2M19 5h2"/>'),
  wheel: P_('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M12 14.5V21M3 12h6.5M14.5 12H21M5.6 5.6l4.6 4.6M13.8 13.8l4.6 4.6M18.4 5.6l-4.6 4.6M10.2 13.8l-4.6 4.6"/>'),
  bulb: P_('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  engine: P_('<path d="M4 10h3l2-2h5l2 2h2v3h2v-2h1v6h-1v-2h-2v3h-3l-2 2H9l-2-2H4z"/>'),
  turbo: P_('<circle cx="12" cy="12" r="8"/><path d="M12 4c2 3 2 5 0 8s-2 5 0 8M4 12c3-2 5-2 8 0s5 2 8 0"/>'),
  gear: P_('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'),
  spring: P_('<path d="M7 3h10M7 21h10M8 6l8 2-8 2 8 2-8 2 8 2-8 2"/>'),
  brake: P_('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M17 5.5a9 9 0 0 1 2.8 4.5"/>'),
  shield: P_('<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  pipe: P_('<path d="M3 14h9a4 4 0 0 0 4-4V8h3"/><path d="M3 18h9a8 8 0 0 0 8-8V8"/><path d="M19 6v4M21 6v4"/>'),
  star: P_('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
  gauge: P_('<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="M12 13l4.5-5"/><circle cx="12" cy="13" r="1.6"/><path d="M7 9.5l1 1M12 6v1.4M17 9.5l-1 1"/>'),
  wrench: P_('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.4-.4-2.4z"/>'),
};
const STAT_NAMES = [['speed', 'Top speed'], ['accel', 'Acceleration'], ['braking', 'Braking'], ['handling', 'Handling'], ['armour', 'Armour']];
const VIEW_LIST = [['overall', 'Overall'], ['front', 'Front'], ['rear', 'Rear'], ['side', 'Side'], ['wheel', 'Wheels'], ['top', 'Top'], ['cabin', 'Cabin']];

export class CustomsUI {
  constructor(game, svc, parent) {
    this.g = game; this.svc = svc; this.open = false; this.v = null; this.level = 'cats'; this.ci = 0; this.si = 0; this.oi = 0; this.flash = null; this.colour = null;
    const root = this.root = document.createElement('div'); root.id = 'customs'; root.className = 'cc hidden'; (parent || document.body).appendChild(root);
    root.innerHTML = `<div class="cc-stage" data-stage="1"></div><aside class="cc-left"></aside><section class="cc-card"></section><footer class="cc-bar"></footer><div class="cc-toast"></div>`;
    this.left = root.querySelector('.cc-left'); this.card = root.querySelector('.cc-card'); this.bar = root.querySelector('.cc-bar'); this.toast = root.querySelector('.cc-toast'); this.stage = root.querySelector('.cc-stage');
    root.addEventListener('click', (e) => this.onClick(e)); root.addEventListener('input', (e) => this.onInput(e));
    root.addEventListener('mouseover', (e) => { const t = e.target.closest('[data-act]'); if (t && t !== this._hov) { this._hov = t; if (t.dataset.act !== 'stage') Audio.ui('hover'); } });
    // orbit / zoom on the empty stage
    let drag = null; this.stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; this.stage.setPointerCapture(e.pointerId); });
    this.stage.addEventListener('pointermove', (e) => { if (!drag) return; this.svc.orbitDrag(e.clientX - drag.x, e.clientY - drag.y); drag = { x: e.clientX, y: e.clientY }; });
    const up = () => { drag = null; }; this.stage.addEventListener('pointerup', up); this.stage.addEventListener('pointercancel', up);
    root.addEventListener('wheel', (e) => { if (e.target.closest('.cc-left, .cc-card')) return; e.preventDefault(); this.svc.orbitZoom(e.deltaY); }, { passive: false });
  }
  // ------------------------------------------------------------------------------------------------ data
  get garage() { return this.g.garage; }
  get installed() { return this.v.mods || {}; }
  get cats() { return categoriesFor(this.v.type, this.scan); }
  get catId() { return this.level === 'repair' ? null : (this.cats[this.ci] || {}).id; }
  get slots() { const c = this.catId; return slotsFor(this.v.type, this.scan).filter((s) => s.cat === c); }
  get slot() { return this.slots[this.si] || null; }
  options(sl = this.slot) { if (!sl) return []; if (sl.kind === 'colour') return [{ id: null, name: sl.id === 'paint1' || sl.id === 'paint2' ? 'Factory colour' : 'Stock', base: 0, desc: 'No custom colour.' }, ...sl.presets.map(([n, h]) => ({ id: h.toLowerCase(), name: n, base: sl.base, desc: sl.desc, swatch: h }))]; return sl.options; }
  curVal(sl) { const m = this.installed; return sl.kind === 'colour' ? (m[sl.id] || null) : (m[sl.id] || sl.options[0].id); }
  price(sl, val) { return priceOf(this.v.type, sl.id, val, this.scan); }
  vName() { return this.g.vehicleName ? this.g.vehicleName(this.v.type) : this.v.type; }
  // ------------------------------------------------------------------------------------------------ open / close
  show(v) {
    this.v = v; this.scan = lookScan(v); this.open = true; this.root.classList.remove('hidden'); this.level = this.svc.needsRepair(v) ? 'repair' : 'cats'; this.ci = 0; this.si = 0; this.oi = 0; this.flash = null; this.pv = null;
    Input.releaseLock(); this.render();
  }
  hide() { if (!this.open) return; this.open = false; this.root.classList.add('hidden'); this.endPreview(); const g = this.g; Input.mousePressed.clear(); Input.mouseButtons.clear(); Input.wheel = 0; g.ignoreUnlock = true; Input.requestLock(g.canvas); setTimeout(() => (g.ignoreUnlock = false), 300); }
  // ------------------------------------------------------------------------------------------------ preview
  previewOf(sl, val, text) { const m = { ...this.installed }; if (val === null || val === undefined) delete m[sl.id]; else m[sl.id] = val; if (sl.id === 'plate' && val === 'vanity') m.plateText = plateText(text ?? m.plateText ?? ''); return m; }
  preview(sl, val, text) {
    const v = this.v; const m = this.previewOf(sl, val, text); this.pv = { slot: sl.id, val, mods: m };
    applyMods(v, m, { preview: true }); v.tune = tuneOf(v.type, m); // the tune drives the rev / turbo / exhaust sound of the preview
    if (sl.cat === 'engine' || sl.cat === 'turbo' || sl.cat === 'exhaust') this.svc.rev(sl.cat === 'turbo' ? 1 : 0.85, 1.5);
  }
  endPreview() { if (!this.v) return; if (this.pv) { restoreInstalled(this.v); this.pv = null; } }
  // ------------------------------------------------------------------------------------------------ actions
  setCat(i) { this.endPreview(); this.ci = i; this.si = 0; this.level = 'slots'; const c = this.catId; setPreviewLights(this.v, c === 'lighting'); this.svc.setView(this.svc.viewFor(c)); for (const m of this.svc.mech) m.event('focus'); Audio.ui('click'); this.render(); }
  setSlot(i) { this.endPreview(); this.si = i; const sl = this.slot; if (!sl) return; if (slotLocked(sl.id, this.installed)) { this.flash = { bad: true, msg: NEEDS_TEXT[sl.id] || 'Not available yet' }; Audio.ui('fail'); this.render(); return; }
    this.level = 'opts'; const opts = this.options(sl), cur = this.curVal(sl); this.oi = Math.max(0, opts.findIndex((o) => (o.id ?? null) === (cur ?? null))); if (sl.kind === 'colour') this.colour = cur || (sl.presets[0] && sl.presets[0][1]) || '#888888';
    this.plateText = this.installed.plateText || ''; if (sl.id === 'rims' || sl.id === 'brakes' || sl.id === 'calCol' || sl.id === 'tyres') this.svc.setView('wheel'); Audio.ui('click'); this.render(); }
  setOpt(i, quiet) { const sl = this.slot, o = this.options(sl)[i]; if (!o) return; this.oi = i; if (sl.kind === 'colour' && o.id) this.colour = o.id; this.preview(sl, o.id, this.plateText); if (!quiet) Audio.ui('click'); this.render(); }
  back() {
    if (this.level === 'opts') { this.endPreview(); this.level = 'slots'; Audio.ui('click'); this.render(); return; }
    if (this.level === 'slots') { this.endPreview(); setPreviewLights(this.v, false); this.level = 'cats'; this.svc.setView('overall'); Audio.ui('click'); this.render(); return; }
    this.svc.leave();
  }
  buy() {
    const g = this.g, v = this.v, sl = this.slot; if (this.level !== 'opts' || !sl) return; const o = this.options(sl)[this.oi]; let val = o ? o.id : null; if (sl.kind === 'colour' && this.customColour) val = this.colour;
    const cur = this.curVal(sl), text = plateText(this.plateText); const same = (val ?? null) === (cur ?? null) && !(sl.id === 'plate' && val === 'vanity' && text !== (this.installed.plateText || ''));
    if (same) { this.flash = { bad: false, msg: 'Already installed.' }; this.render(); return; }
    if (sl.id === 'plate' && val === 'vanity' && !text) { this.flash = { bad: true, msg: 'Type the lettering for your plates first.' }; Audio.ui('fail'); this.render(); return; }
    const price = val === null ? 0 : this.price(sl, val) + 0; const owned = this.garage.recordOf(v);
    if (!owned && !this.garage.canOwnMore()) { this.flash = { bad: true, msg: `Your garage is full (${MAX_OWNED} vehicles).` }; Audio.ui('fail'); this.render(); return; }
    if (g.story.state.money < price) { this.flash = { bad: true, msg: `Not enough money — this costs ${rs(price)}.` }; Audio.ui('fail'); this.render(); return; }
    const name = val === null ? (sl.kind === 'colour' ? 'factory colour' : 'stock') : sl.kind === 'colour' ? (o && o.id === val ? o.name : val.toUpperCase()) : o.name;
    if (price > 0) g.story.pay(-price, `${SHOP_NAME}: ${sl.name} — ${name} (${this.vName()})`);
    const rec = this.garage.own(v); const mods = this.previewOf(sl, val, text); this.pv = null; installMods(v, mods); this.garage.commit(v, mods, price);
    this.flash = { bad: false, msg: `${sl.name}: ${name} installed${price ? ' · ' + rs(price) : ''}.` + (!owned && rec ? ' Vehicle registered to you.' : '') };
    Audio.ui('success'); for (const m of this.svc.mech) m.event('nod'); g.hud.notify(SHOP_NAME, `${sl.name}: ${name}${price ? ' · ' + rs(price) : ''}`, 'success', 2.5); if (g.autosave) g.autosave(); this.render();
  }
  repair() { if (this.svc.repair()) { this.flash = { bad: false, msg: `Repaired · ${rs(REPAIR_PRICE)}` }; this.level = 'cats'; } else this.flash = { bad: true, msg: `Repairs cost ${rs(REPAIR_PRICE)}.` }; this.render(); }
  onClick(e) {
    const t = e.target.closest('[data-act]'); if (!t) return; const a = t.dataset.act, i = +t.dataset.i;
    if (a === 'cat') this.setCat(i); else if (a === 'slot') this.setSlot(i); else if (a === 'opt') { this.customColour = false; this.setOpt(i); } else if (a === 'buy') this.buy(); else if (a === 'back') this.back(); else if (a === 'leave') this.svc.leave();
    else if (a === 'view') { this.svc.setView(t.dataset.v); Audio.ui('click'); this.render(); } else if (a === 'rev') this.svc.rev(1, 2.2); else if (a === 'repair') this.repair();
    else if (a === 'side') { this.svc.wheelSide = -(this.svc.wheelSide || 1); this.svc.setView(this.svc.orbit.view); Audio.ui('click'); }
  }
  onInput(e) {
    const t = e.target; const sl = this.slot; if (!sl) return;
    if (t.dataset.rgb !== undefined || t.dataset.hex !== undefined) { let hex; if (t.dataset.hex !== undefined) hex = t.value; else { const r = this.root.querySelectorAll('[data-rgb]'); hex = '#' + [...r].map((x) => (+x.value).toString(16).padStart(2, '0')).join(''); }
      if (!/^#[0-9a-f]{6}$/i.test(hex)) return; this.colour = hex.toLowerCase(); this.customColour = true; this.preview(sl, this.colour); this.renderCard(); this.syncColourInputs(t); }
    if (t.dataset.plate !== undefined) { const s = plateText(t.value); this.plateText = s; if (t.value !== s && t.value.toUpperCase() !== s) t.value = s; const o = this.options(sl)[this.oi]; if (o && o.id === 'vanity') this.preview(sl, 'vanity', s); this.renderCard(); }
  }
  syncColourInputs(src) { const h = this.colour; const r = this.root.querySelectorAll('[data-rgb]'); [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)].forEach((n, k) => { if (r[k] && r[k] !== src) r[k].value = n; if (r[k]) r[k].nextElementSibling.textContent = n; }); const hx = this.root.querySelector('[data-hex]'); if (hx && hx !== src) hx.value = h; const sw = this.root.querySelector('.cc-swatch-big'); if (sw) sw.style.background = h; }
  // ------------------------------------------------------------------------------------------------ per frame
  update() {
    if (!this.open) return; const k = (c) => Input.keyPressed(c); const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type === 'text';
    if (k('Escape')) { if (typing) document.activeElement.blur(); else this.back(); return; }
    if (typing) return;
    for (let n = 1; n <= VIEW_LIST.length; n++) if (k('Digit' + n)) { this.svc.setView(VIEW_LIST[n - 1][0]); this.render(); }
    if (k('KeyR')) this.svc.rev(1, 2.2);
    if (this.level === 'repair') { if (k('Enter') || k('NumpadEnter')) this.repair(); if (k('Backspace')) this.svc.leave(); return; }
    const up = k('ArrowUp') || k('KeyW'), dn = k('ArrowDown') || k('KeyS'), fwd = k('Enter') || k('NumpadEnter') || k('ArrowRight') || k('KeyD'), bk = k('Backspace') || k('ArrowLeft') || k('KeyA');
    if (this.level === 'cats') { const n = this.cats.length; if (up) { this.ci = (this.ci + n - 1) % n; Audio.ui('hover'); this.render(); } if (dn) { this.ci = (this.ci + 1) % n; Audio.ui('hover'); this.render(); } if (fwd) this.setCat(this.ci); if (bk) this.svc.leave(); }
    else if (this.level === 'slots') { const n = this.slots.length; if (up) { this.si = (this.si + n - 1) % n; Audio.ui('hover'); this.render(); } if (dn) { this.si = (this.si + 1) % n; Audio.ui('hover'); this.render(); } if (fwd) this.setSlot(this.si); if (bk) this.back(); }
    else if (this.level === 'opts') { const n = this.options().length; if (up) { this.customColour = false; this.setOpt((this.oi + n - 1) % n); } if (dn) { this.customColour = false; this.setOpt((this.oi + 1) % n); } if (k('Enter') || k('NumpadEnter')) this.buy(); if (bk) this.back(); }
  }
  // ------------------------------------------------------------------------------------------------ render
  render() { if (!this.open) return; this.renderLeft(); this.renderCard(); this.renderBar(); }
  renderLeft() {
    const v = this.v, Pf = profileOf(v.type), rec = this.garage.recordOf(v); const inst = effective(this.installed); const nMods = Object.keys(inst).filter((k) => k !== 'plateText').length;
    const head = `<div class="cc-brand"><div class="cc-logo">${ICON.gauge}</div><div><h1>COLOMBO <span>CUSTOMS</span></h1><div class="cc-tag">Performance · Paint · Wheels · Lighting</div></div></div>
      <div class="cc-veh"><b>${esc(this.vName())}</b><small>${esc(Pf ? Pf.label : '')}</small><div class="cc-own">${rec ? `<i class="ok"></i>Registered to you · ${nMods} mod${nMods === 1 ? '' : 's'} · spent ${rs(rec.spent || 0)}` : `<i></i>Not registered · first purchase registers it (${this.garage.count}/${MAX_OWNED})`}</div></div>`;
    let body = '';
    if (this.level === 'repair') body = `<div class="cc-h">Inspection</div><div class="cc-repair">${ICON.wrench}<p>The mechanics found damage. It has to be repaired before any work can be fitted.</p><button class="cc-btn cc-buy" data-act="repair">Repair · ${rs(REPAIR_PRICE)}</button><button class="cc-btn" data-act="leave">Leave</button></div>`;
    else if (this.level === 'cats') body = `<div class="cc-h">Categories</div><div class="cc-list">${this.cats.map((c, i) => { const n = this.slotsOf(c.id).filter((s) => this.isModded(s)).length; return `<button class="cc-row cc-cat${i === this.ci ? ' on' : ''}" data-act="cat" data-i="${i}"><span class="cc-ico">${ICON[c.icon] || ''}</span><span class="cc-nm">${c.name}</span>${n ? `<span class="cc-badge">${n}</span>` : ''}<span class="cc-chev">›</span></button>`; }).join('')}</div>`;
    else if (this.level === 'slots') body = `<div class="cc-h"><button class="cc-backb" data-act="back">‹</button>${esc(this.cats[this.ci].name)}</div><div class="cc-list">${this.slots.map((s, i) => { const lock = slotLocked(s.id, this.installed); const cv = this.curVal(s); const o = s.kind === 'colour' ? null : s.options.find((q) => q.id === cv);
      const cur = s.kind === 'colour' ? (cv ? `<i class="cc-dot" style="background:${cv}"></i>Custom` : 'Factory') : esc(o ? o.name : 'Stock'); return `<button class="cc-row${i === this.si ? ' on' : ''}${lock ? ' dim' : ''}" data-act="slot" data-i="${i}"><span class="cc-nm">${esc(s.name)}</span><span class="cc-cur">${lock ? `<em>${esc(NEEDS_TEXT[s.id] || 'Locked')}</em>` : cur}</span><span class="cc-chev">›</span></button>`; }).join('')}</div>`;
    else { const sl = this.slot, cv = this.curVal(sl), opts = this.options(sl);
      body = `<div class="cc-h"><button class="cc-backb" data-act="back">‹</button>${esc(sl.name)}</div>`;
      if (sl.kind === 'colour') { const h = this.colour || '#888888'; const rgb = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
        body += `<div class="cc-swatches">${opts.map((o, i) => `<button class="cc-sw${i === this.oi && !this.customColour ? ' on' : ''}${(o.id ?? null) === (cv ?? null) ? ' inst' : ''}" data-act="opt" data-i="${i}" title="${esc(o.name)}" style="${o.swatch ? `background:${o.swatch}` : ''}">${o.swatch ? '' : '<span>F</span>'}</button>`).join('')}</div>
        <div class="cc-picker"><div class="cc-swatch-big" style="background:${h}"></div><div class="cc-sliders">${['R', 'G', 'B'].map((c, k) => `<label><span>${c}</span><input type="range" min="0" max="255" value="${rgb[k]}" data-rgb="${k}"><b>${rgb[k]}</b></label>`).join('')}</div><input class="cc-hex" type="color" value="${h}" data-hex="1"></div>`; }
      else body += `<div class="cc-list">${opts.map((o, i) => { const p = this.price(sl, o.id); const inst = o.id === cv; return `<button class="cc-row cc-opt${i === this.oi ? ' on' : ''}${inst ? ' inst' : ''}" data-act="opt" data-i="${i}">${o.lvl !== undefined && o.lvl > 0 ? `<span class="cc-lv">${'<i></i>'.repeat(o.lvl)}</span>` : ''}<span class="cc-nm">${esc(o.name)}</span><span class="cc-pr">${inst ? '<em>INSTALLED</em>' : p ? rs(p) : 'FREE'}</span></button>`; }).join('')}</div>`;
      if (sl.id === 'plate' && (opts[this.oi] || {}).id === 'vanity') body += `<label class="cc-plate"><span>Plate lettering</span><input type="text" maxlength="7" value="${esc(this.plateText || '')}" data-plate="1" spellcheck="false" autocomplete="off"></label>`;
    }
    const key = this.level + ':' + this.ci + ':' + this.si; this.left.innerHTML = head + body; if (key !== this._lastKey) { this._lastKey = key; const l = this.left.querySelector('.cc-list, .cc-swatches'); if (l) l.classList.add('cc-anim'); }
  }
  slotsOf(cat) { return slotsFor(this.v.type, this.scan).filter((s) => s.cat === cat); }
  isModded(s) { const cv = this.curVal(s); return s.kind === 'colour' ? !!cv : cv !== s.options[0].id; }
  renderCard() {
    const v = this.v; if (!v) return; let title = '', desc = '', priceTxt = '', state = '', buy = '';
    const inst = this.installed, prevMods = this.pv ? this.pv.mods : inst; const sA = statsOf(v.type, inst), sB = statsOf(v.type, prevMods);
    if (this.level === 'opts') { const sl = this.slot, o = this.options(sl)[this.oi]; const cv = this.curVal(sl); let val = o ? o.id : null; if (sl.kind === 'colour' && this.customColour) val = this.colour;
      const instd = (val ?? null) === (cv ?? null) && !(sl.id === 'plate' && val === 'vanity' && plateText(this.plateText) !== (inst.plateText || '')); const p = val === null ? 0 : this.price(sl, val);
      title = sl.kind === 'colour' ? (this.customColour ? `Custom colour ${val.toUpperCase()}` : o.name) : o.name; desc = sl.kind === 'colour' ? sl.desc : o.desc; if (o && o.stat) desc += `<span class="cc-statline">${esc(o.stat)}</span>`;
      const curName = sl.kind === 'colour' ? (cv ? cv.toUpperCase() : 'Factory') : (optionOf(v.type, sl.id, cv, this.scan) || { name: 'Stock' }).name;
      state = `<div class="cc-cmp"><div><small>Installed</small>${esc(curName)}</div><div><small>Previewing</small>${esc(title)}</div></div>`;
      priceTxt = instd ? '<em>Installed</em>' : p ? rs(p) : 'Free'; buy = instd ? '<button class="cc-btn cc-buy" disabled>Installed</button>' : `<button class="cc-btn cc-buy" data-act="buy">${p ? 'Buy · ' + rs(p) : 'Fit (free)'}</button>`;
      if (o && o.lvl !== undefined) state += `<div class="cc-lvl">Level ${o.lvl} of ${sl.options.length - 1}</div>`;
    } else if (this.level === 'slots') { const sl = this.slot; title = sl ? sl.name : ''; desc = sl ? (slotLocked(sl.id, inst) ? NEEDS_TEXT[sl.id] : `${this.options(sl).length - (sl.kind === 'colour' ? 1 : 1)} option${this.options(sl).length > 2 ? 's' : ''} for this vehicle. Open to preview them on the car.`) : ''; }
    else if (this.level === 'cats') { const c = this.cats[this.ci]; title = c ? c.name : ''; desc = c ? `${this.slotsOf(c.id).length} upgrade slot${this.slotsOf(c.id).length === 1 ? '' : 's'} fit this ${esc((profileOf(v.type) || {}).label || 'vehicle').toLowerCase()}. Everything is previewed on the car before you pay.` : ''; }
    else { title = 'Repair required'; desc = 'Body, glass, lamps and mechanicals restored to as-new.'; priceTxt = rs(REPAIR_PRICE); }
    const bars = STAT_NAMES.map(([k, n]) => { const a = sA[k], b = sB[k]; const lo = Math.min(a, b), hi = Math.max(a, b); return `<div class="cc-stat"><span>${n}</span><i><b style="width:${lo * 100}%"></b>${hi > lo + 0.002 ? `<u class="${b > a ? 'up' : 'dn'}" style="left:${lo * 100}%;width:${(hi - lo) * 100}%"></u>` : ''}</i></div>`; }).join('');
    const fl = this.flash ? `<div class="cc-flash ${this.flash.bad ? 'bad' : 'ok'}">${esc(this.flash.msg)}</div>` : '';
    this.card.innerHTML = `<div class="cc-ct">${esc(title)}</div>${priceTxt ? `<div class="cc-price">${priceTxt}</div>` : ''}<p class="cc-desc">${desc || ''}</p>${state}<div class="cc-stats">${bars}</div>${fl}${buy}`;
  }
  renderBar() {
    const g = this.g; const sl = this.level === 'opts' ? this.slot : null; const revable = this.catId === 'engine' || this.catId === 'turbo' || this.catId === 'exhaust' || this.catId === 'transmission';
    this.bar.innerHTML = `<div class="cc-views">${VIEW_LIST.map(([id, n], i) => `<button class="cc-vb${this.svc.orbit.view === id ? ' on' : ''}" data-act="view" data-v="${id}"><kbd>${i + 1}</kbd>${n}</button>`).join('')}${this.svc.orbit.view === 'wheel' ? '<button class="cc-vb" data-act="side">⇄ Side</button>' : ''}</div>
      <div class="cc-keys">${revable ? '<button class="cc-vb" data-act="rev"><kbd>R</kbd>Rev engine</button>' : ''}<span><kbd>↑</kbd><kbd>↓</kbd> Browse</span><span><kbd>Enter</kbd> ${sl ? 'Buy' : 'Open'}</span><span><kbd>Esc</kbd> ${this.level === 'cats' || this.level === 'repair' ? 'Leave' : 'Back'}</span><span>Drag · orbit &nbsp;Wheel · zoom</span></div>
      <div class="cc-money"><small>Balance</small><b>${rs(g.story.state.money)}</b></div><button class="cc-btn cc-leave" data-act="leave">Leave</button>`;
    void VIEWS;
  }
}
