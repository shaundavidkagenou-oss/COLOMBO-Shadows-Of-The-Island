// STREET CUSTOMS — shop interface. The 3D view stays live behind it: every choice is previewed ON the real vehicle standing on the
// turntable (CustomsApply.applyMods with { preview: true }); nothing is charged until Buy, and leaving / backing out restores the
// installed configuration for free. Only the categories, slots and options that fit THIS vehicle are listed (CustomsCatalog +
// the body scan); police / emergency vehicles never get here (CustomsService.entryCheck).
// Layout (35th request: plain, readable, no cartoon styling): one menu column on the left — a banner with the shop name, a
// sub-header (menu title + position counter), flat rows (selected row inverted), a description box and the stat bars under it;
// the balance top-right and a strip of key hints bottom-right. No icons, no rounded cards, no glow.
// Keyboard: ↑/↓ move · Enter / → open or buy · Backspace / ← back · Esc back / leave · 1–7 camera views · R rev the engine.
// Mouse: click anything · drag the empty area to orbit · wheel to zoom.
// Robustness: every action runs through guard() (an exception can never leave the menu half-drawn and dead), the pointer is kept
// unlocked while the menu is open, and the game's own hot-keys (map, phone, pause, radio) are held off by Game while the shop runs.
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { SHOP_NAME, MAX_OWNED, slotsFor, categoriesFor, priceOf, optionOf, statsOf, tuneOf, profileOf, slotLocked, NEEDS_TEXT, plateText, effective } from '../customs/CustomsCatalog.js';
import { applyMods, installMods, restoreInstalled, setPreviewLights, lookScan } from '../customs/CustomsApply.js';
import { REPAIR_PRICE, VIEWS } from '../customs/CustomsService.js';

const rs = (n) => 'Rs. ' + Math.round(n).toLocaleString('en-LK');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const STAT_NAMES = [['speed', 'Top speed'], ['accel', 'Acceleration'], ['braking', 'Braking'], ['handling', 'Handling'], ['armour', 'Armour']];
const VIEW_LIST = [['overall', 'Overall'], ['front', 'Front'], ['rear', 'Rear'], ['side', 'Side'], ['wheel', 'Wheels'], ['top', 'Top'], ['cabin', 'Cabin']];

export class CustomsUI {
  constructor(game, svc, parent) {
    this.g = game; this.svc = svc; this.open = false; this.v = null; this.level = 'cats'; this.ci = 0; this.si = 0; this.oi = 0; this.flash = null; this.colour = null;
    const root = this.root = document.createElement('div'); root.id = 'customs'; root.className = 'cc hidden'; (parent || document.body).appendChild(root);
    root.innerHTML = `<div class="cc-stage" data-stage="1"></div><aside class="cc-col"><div class="cc-left"></div><section class="cc-card"></section></aside><div class="cc-cash"></div><footer class="cc-bar"></footer>`;
    this.left = root.querySelector('.cc-left'); this.card = root.querySelector('.cc-card'); this.bar = root.querySelector('.cc-bar'); this.cash = root.querySelector('.cc-cash'); this.stage = root.querySelector('.cc-stage');
    root.addEventListener('click', (e) => this.guard(() => this.onClick(e))); root.addEventListener('input', (e) => this.guard(() => this.onInput(e)));
    // buttons never keep keyboard focus (a focused button would ALSO fire on Enter / Space next to the menu's own key handling)
    root.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
    root.addEventListener('mouseover', (e) => { const t = e.target.closest('[data-act]'); if (t && t !== this._hov) { this._hov = t; if (t.dataset.act !== 'stage') Audio.ui('hover'); } });
    // orbit / zoom on the empty stage
    let drag = null; this.stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; this.stage.setPointerCapture(e.pointerId); });
    this.stage.addEventListener('pointermove', (e) => { if (!drag) return; this.svc.orbitDrag(e.clientX - drag.x, e.clientY - drag.y); drag = { x: e.clientX, y: e.clientY }; });
    const up = () => { drag = null; }; this.stage.addEventListener('pointerup', up); this.stage.addEventListener('pointercancel', up);
    root.addEventListener('wheel', (e) => { if (e.target.closest('.cc-col')) return; e.preventDefault(); this.svc.orbitZoom(e.deltaY); }, { passive: false });
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
  get noun() { const P = profileOf(this.v.type) || {}; return P.kind === 'bike' ? 'bike' : P.kind === 'tuk' ? 'three-wheeler' : P.klass === 'truck' ? 'truck' : P.klass === 'van' ? 'van' : 'car'; }
  vName() { return this.g.vehicleName ? this.g.vehicleName(this.v.type) : this.v.type; }
  // ------------------------------------------------------------------------------------------------ open / close
  show(v) {
    this.v = v; this.scan = lookScan(v); this.open = true; this.root.classList.remove('hidden'); this.level = this.svc.needsRepair(v) ? 'repair' : 'cats'; this.ci = 0; this.si = 0; this.oi = 0; this.ri = 0; this.flash = null; this.pv = null;
    Input.releaseLock(); this.g.hud.root.classList.add('cc-mode'); /* the game HUD steps back (styles.css .hud.cc-mode) */ this.render();
  }
  hide() { if (!this.open) return; this.open = false; this.root.classList.add('hidden'); this.g.hud.root.classList.remove('cc-mode'); this.endPreview(); const g = this.g; Input.mousePressed.clear(); Input.mouseButtons.clear(); Input.wheel = 0; g.ignoreUnlock = true; Input.requestLock(g.canvas); setTimeout(() => (g.ignoreUnlock = false), 300); }
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
    Audio.ui('success'); this.svc.startWork(this.catId, sl.id, `Fitting · ${sl.name}`); g.hud.notify(SHOP_NAME, `${sl.name}: ${name}${price ? ' · ' + rs(price) : ''}`, 'success', 2.5); if (g.autosave) g.autosave(); this.render();
  }
  // the fitting job's progress bar (CustomsService.workStep): width only, no full re-render per frame
  workTick(done = false) { if (!this.card) return; const el = this.card.querySelector('.cc-work i'); if (done || (!el && this.svc.workLabel)) { this.render(); return; } if (el) el.style.width = `${Math.round(this.svc.workK * 100)}%`; }
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
  // any UI action: an exception is logged and the menu is re-drawn from a safe level instead of freezing half-way
  guard(fn) {
    try { return fn(); } catch (e) {
      console.error('[customs ui]', e); this.errors = (this.errors || 0) + 1;
      try { this.endPreview(); } catch (e2) { /* vehicle gone */ }
      if (this.v && !this.v.disposed) { this.level = this.svc.needsRepair(this.v) ? 'repair' : 'cats'; this.ci = Math.min(this.ci, Math.max(0, this.cats.length - 1)); this.si = 0; this.oi = 0; this.flash = { bad: true, msg: 'That option could not be shown on this vehicle.' }; }
      try { this.render(); } catch (e3) { console.error('[customs ui] render', e3); }
    }
  }
  update(dt) { if (!this.open) return; if (Input.locked) Input.releaseLock(); /* the menu needs the cursor: anything that re-locked it is undone */ this.guard(() => this.keys(dt)); }
  keys() {
    const k = (c) => Input.keyPressed(c); const typing = document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type === 'text';
    if (k('Escape')) { if (typing) document.activeElement.blur(); else this.back(); return; }
    if (typing) return;
    for (let n = 1; n <= VIEW_LIST.length; n++) if (k('Digit' + n)) { this.svc.setView(VIEW_LIST[n - 1][0]); this.render(); }
    if (k('KeyR')) this.svc.rev(1, 2.2);
    if (this.level === 'repair') { if (k('ArrowUp') || k('KeyW') || k('ArrowDown') || k('KeyS')) { this.ri = (this.ri || 0) ? 0 : 1; Audio.ui('hover'); this.render(); } if (k('Enter') || k('NumpadEnter')) { if (this.ri) this.svc.leave(); else this.repair(); } if (k('Backspace')) this.svc.leave(); return; }
    const up = k('ArrowUp') || k('KeyW'), dn = k('ArrowDown') || k('KeyS'), fwd = k('Enter') || k('NumpadEnter') || k('ArrowRight') || k('KeyD'), bk = k('Backspace') || k('ArrowLeft') || k('KeyA');
    if (this.level === 'cats') { const n = this.cats.length; if (up) { this.ci = (this.ci + n - 1) % n; Audio.ui('hover'); this.render(); } if (dn) { this.ci = (this.ci + 1) % n; Audio.ui('hover'); this.render(); } if (fwd) this.setCat(this.ci); if (bk) this.svc.leave(); }
    else if (this.level === 'slots') { const n = this.slots.length; if (up) { this.si = (this.si + n - 1) % n; Audio.ui('hover'); this.render(); } if (dn) { this.si = (this.si + 1) % n; Audio.ui('hover'); this.render(); } if (fwd) this.setSlot(this.si); if (bk) this.back(); }
    else if (this.level === 'opts') { const n = this.options().length; if (up) { this.customColour = false; this.setOpt((this.oi + n - 1) % n); } if (dn) { this.customColour = false; this.setOpt((this.oi + 1) % n); } if (k('Enter') || k('NumpadEnter')) this.buy(); if (bk) this.back(); }
  }
  // ------------------------------------------------------------------------------------------------ render
  render() { if (!this.open) return; this.renderLeft(); this.renderCard(); this.renderBar(); }
  // the rows of the current level: [{ act, i, name, right, cls }]
  rows() {
    if (this.level === 'repair') return [{ act: 'repair', i: 0, name: 'Repair vehicle', right: rs(REPAIR_PRICE), cls: '' }, { act: 'leave', i: 1, name: 'Leave', right: '', cls: '' }];
    if (this.level === 'cats') return this.cats.map((c, i) => { const n = this.slotsOf(c.id).filter((s) => this.isModded(s)).length; return { act: 'cat', i, name: c.name, right: n ? `<span class="cc-n">${n}</span>` : '', cls: 'cc-more' }; });
    if (this.level === 'slots') return this.slots.map((s, i) => { const lock = slotLocked(s.id, this.installed); const cv = this.curVal(s); const o = s.kind === 'colour' ? null : s.options.find((q) => q.id === cv);
      const cur = lock ? `<em>${esc(NEEDS_TEXT[s.id] || 'Locked')}</em>` : s.kind === 'colour' ? (cv ? `<i class="cc-dot" style="background:${cv}"></i>Custom` : 'Factory') : esc(o ? o.name : 'Stock');
      return { act: 'slot', i, name: s.name, right: cur, cls: 'cc-more' + (lock ? ' dim' : '') }; });
    const sl = this.slot, cv = this.curVal(sl);
    return this.options(sl).map((o, i) => { const inst = (o.id ?? null) === (cv ?? null); const p = this.price(sl, o.id);
      return { act: 'opt', i, name: (o.swatch ? `<i class="cc-dot" style="background:${o.swatch}"></i>` : '') + esc(o.name), right: inst ? '<span class="cc-tick" title="Installed"></span>' : p ? rs(p) : 'Free', cls: inst ? 'inst' : '', raw: true }; });
  }
  get sel() { return this.level === 'cats' ? this.ci : this.level === 'slots' ? this.si : this.level === 'opts' ? (this.customColour ? -1 : this.oi) : this.ri || 0; }
  get title() { return this.level === 'repair' ? 'Inspection' : this.level === 'cats' ? 'Categories' : this.level === 'slots' ? (this.cats[this.ci] || {}).name || '' : (this.slot || {}).name || ''; }
  renderLeft() {
    const rows = this.rows(), sel = this.sel;
    const head = `<div class="cc-banner"><span>STREET</span>&nbsp;CUSTOMS</div><div class="cc-sub"><b>${esc(this.title)}</b><span>${sel >= 0 && rows.length ? `${sel + 1} / ${rows.length}` : ''}</span></div>`;
    let body = `<div class="cc-list">${rows.map((r) => `<button class="cc-row ${r.cls}${r.i === sel ? ' on' : ''}" data-act="${r.act}" data-i="${r.i}"><span class="cc-nm">${r.raw ? r.name : esc(r.name)}</span><span class="cc-cur">${r.right}</span></button>`).join('')}</div>`;
    if (this.level === 'opts') { const sl = this.slot;
      if (sl.kind === 'colour') { const h = this.colour || '#888888'; const rgb = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
        body += `<div class="cc-picker"><div class="cc-swatch-big" style="background:${h}"></div><div class="cc-sliders">${['R', 'G', 'B'].map((c, k) => `<label><span>${c}</span><input type="range" min="0" max="255" value="${rgb[k]}" data-rgb="${k}" tabindex="-1"><b>${rgb[k]}</b></label>`).join('')}</div><input class="cc-hex" type="color" value="${h}" data-hex="1" tabindex="-1"></div>`; }
      if (sl.id === 'plate' && (this.options(sl)[this.oi] || {}).id === 'vanity') body += `<label class="cc-plate"><span>Plate lettering</span><input type="text" maxlength="7" value="${esc(this.plateText || '')}" data-plate="1" spellcheck="false" autocomplete="off"></label>`; }
    // keep typing in the plate field across re-draws
    const ae = document.activeElement, typingPlate = ae && ae.dataset && ae.dataset.plate !== undefined && this.left.contains(ae); const caret = typingPlate ? ae.selectionStart : 0;
    this.left.innerHTML = head + body;
    if (typingPlate) { const inp = this.left.querySelector('[data-plate]'); if (inp) { inp.focus(); inp.setSelectionRange(caret, caret); } }
    const on = this.left.querySelector('.cc-row.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }
  slotsOf(cat) { return slotsFor(this.v.type, this.scan).filter((s) => s.cat === cat); }
  isModded(s) { const cv = this.curVal(s); return s.kind === 'colour' ? !!cv : cv !== s.options[0].id; }
  renderCard() {
    const v = this.v; if (!v) return; let desc = '', extra = '';
    const inst = this.installed, prevMods = this.pv ? this.pv.mods : inst; const sA = statsOf(v.type, inst), sB = statsOf(v.type, prevMods);
    if (this.level === 'opts') { const sl = this.slot, o = this.options(sl)[this.oi] || this.options(sl)[0]; const cv = this.curVal(sl); let val = o ? o.id : null; if (sl.kind === 'colour' && this.customColour) val = this.colour;
      const instd = (val ?? null) === (cv ?? null) && !(sl.id === 'plate' && val === 'vanity' && plateText(this.plateText) !== (inst.plateText || '')); const p = val === null ? 0 : this.price(sl, val);
      const name = sl.kind === 'colour' && this.customColour ? `Custom ${String(val).toUpperCase()}` : o ? o.name : '';
      desc = (sl.kind === 'colour' ? sl.desc : (o && o.desc) || '') + (o && o.stat ? `<span class="cc-statline">${esc(o.stat)}</span>` : '');
      extra = `<div class="cc-buyline"><span>${esc(name)}</span><b>${instd ? 'Installed' : p ? rs(p) : 'Free'}</b></div>` + (instd ? '' : `<button class="cc-btn" data-act="buy">${p ? 'Purchase' : 'Fit'} <kbd>Enter</kbd></button>`);
    } else if (this.level === 'slots') { const sl = this.slot; desc = sl ? (slotLocked(sl.id, inst) ? NEEDS_TEXT[sl.id] : `${this.options(sl).length - 1} option${this.options(sl).length > 2 ? 's' : ''} for this ${this.noun}. Every option is shown on the ${this.noun} before you pay.`) : ''; }
    else if (this.level === 'cats') { const c = this.cats[this.ci]; desc = c ? `${this.slotsOf(c.id).length} upgrade slot${this.slotsOf(c.id).length === 1 ? '' : 's'} for this ${esc((profileOf(v.type) || {}).label || 'vehicle').toLowerCase()}.` : ''; }
    else desc = `The mechanics found damage. Body, glass, lamps and mechanicals have to be repaired (${rs(REPAIR_PRICE)}) before any work can be fitted.`;
    const rec = this.garage.recordOf(v); const nMods = Object.keys(effective(inst)).filter((k) => k !== 'plateText').length;
    const own = rec ? `Registered to you · ${nMods} mod${nMods === 1 ? '' : 's'}` : `Not registered · first purchase registers it (${this.garage.count}/${MAX_OWNED})`;
    const bars = STAT_NAMES.map(([k, n]) => { const a = sA[k], b = sB[k]; const lo = Math.min(a, b), hi = Math.max(a, b); return `<div class="cc-stat"><span>${n}</span><i><b style="width:${lo * 100}%"></b>${hi > lo + 0.002 ? `<u class="${b > a ? 'up' : 'dn'}" style="left:${lo * 100}%;width:${(hi - lo) * 100}%"></u>` : ''}</i></div>`; }).join('');
    const fl = this.flash ? `<div class="cc-flash ${this.flash.bad ? 'bad' : 'ok'}">${esc(this.flash.msg)}</div>` : '';
    const work = this.svc.workLabel ? `<div class="cc-work"><i style="width:${Math.round((this.svc.workK || 0) * 100)}%"></i><span>${esc(this.svc.workLabel)}</span></div>` : '';
    this.card.innerHTML = `<div class="cc-veh"><b>${esc(this.vName())}</b><small>${esc(own)}</small></div><p class="cc-desc">${desc || ''}</p>${extra}${fl}${work}<div class="cc-stats">${bars}</div>`;
  }
  renderBar() {
    const g = this.g; const sl = this.level === 'opts' ? this.slot : null; const revable = this.catId === 'engine' || this.catId === 'turbo' || this.catId === 'exhaust' || this.catId === 'transmission';
    this.cash.innerHTML = rs(g.story.state.money);
    const view = VIEW_LIST.find(([id]) => id === this.svc.orbit.view) || VIEW_LIST[0];
    this.bar.innerHTML = `<button class="cc-k" data-act="leave"><kbd>Esc</kbd>${this.level === 'cats' || this.level === 'repair' ? 'Leave' : 'Back'}</button>`
      + `<span class="cc-k"><kbd>Enter</kbd>${sl ? 'Purchase' : 'Select'}</span><span class="cc-k"><kbd>↑</kbd><kbd>↓</kbd>Browse</span>`
      + `<button class="cc-k" data-act="view" data-v="${VIEW_LIST[(VIEW_LIST.indexOf(view) + 1) % VIEW_LIST.length][0]}"><kbd>1-7</kbd>Camera: ${view[1]}</button>`
      + (this.svc.orbit.view === 'wheel' ? '<button class="cc-k" data-act="side"><kbd>⇄</kbd>Other side</button>' : '')
      + (revable ? '<button class="cc-k" data-act="rev"><kbd>R</kbd>Rev engine</button>' : '') + '<span class="cc-k dim">Drag to orbit · wheel to zoom</span>';
    void VIEWS;
  }
}
