// Ceylon Arms Co. buy menu. Opened at the shop counter (GunShop.js room → Game.updateInteractions).
// Categories (Handguns / Rifles / Marksman / Ammunition) · item list · detail panel with a rendered preview of the actual
// weapon model, stat bars, magazine and carry capacity, price in LKR and ownership for the character who is buying.
// Every purchase goes through combat/Shop.js (rules) and Story.pay (shared purse + bank ledger entry), and is written into
// the ACTIVE protagonist's own inventory. Keyboard: ←/→ category · ↑/↓ item · Enter buy · Esc / Backspace leave.
import * as THREE from 'three';
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { WEAPONS } from '../combat/WeaponDefs.js';
import { buildWeaponModel } from '../combat/WeaponModels.js';
import { CATEGORIES, SHOP_NAME, catalogue, stats, quote, purchase, reserveCap } from '../combat/Shop.js';

const rs = (n) => 'Rs. ' + Math.round(n).toLocaleString('en-LK');
const CLS = { pistol: 'Handgun', rifle: 'Rifle', sniper: 'Marksman rifle' };

export class GunShopUI {
  constructor(game, parent) {
    this.g = game; this.open = false; this.cat = 0; this.row = 0; this.items = catalogue(); this.previews = null; this.flash = null;
    const root = this.root = document.createElement('div'); root.id = 'gunshop'; root.className = 'gs hidden'; (parent || document.body).appendChild(root);
    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]'); if (!t) return; const a = t.dataset.act;
      if (a === 'cat') { this.cat = +t.dataset.i; this.row = 0; Audio.ui('click'); this.render(); }
      else if (a === 'item') { const i = +t.dataset.i, now = performance.now(); const dbl = this._lastPick && this._lastPick.i === i && this._lastPick.cat === this.cat && now - this._lastPick.t < 450; this._lastPick = dbl ? null : { i, cat: this.cat, t: now };
        if (dbl) { this.row = i; this.buy(); } else { this.row = i; Audio.ui('click'); this.render(); } } /* click selects, double-click buys */
      else if (a === 'buy') this.buy();
      else if (a === 'close') this.toggle(false);
    });
  }
  get list() { const c = CATEGORIES[this.cat].id; return this.items.filter((it) => it.cat === c); }
  get member() { return this.g.squad?.activeMember?.def?.name || 'You'; }
  ctx() { const g = this.g; return { inv: g.weapons.inv, money: g.story.state.money, opts: { wanted: (g.police?.level || 0) > 0 } }; }
  toggle(v = !this.open) {
    const g = this.g, P = g.player; if (v === this.open) return; this.open = v; this.root.classList.toggle('hidden', !v);
    if (v) { this.prevControl = P.control; P.control = false; Input.releaseLock(); this.flash = null; if (!this.previews) this.makePreviews(); this.render(); Audio.ui('click');
      if ((g.police?.level || 0) > 0) g.hud.subtitle(SHOP_NAME, 'Not today. Come back when the police are not looking for you.', '', 3.5); }
    else { P.control = this.prevControl ?? true; Audio.ui('click'); Input.mousePressed.clear(); Input.mouseButtons.clear(); Input.wheel = 0; g.ignoreUnlock = true; Input.requestLock(g.canvas); setTimeout(() => (g.ignoreUnlock = false), 300); } /* the click that closed the shop must not become a punch/shot */
  }
  update() {
    if (!this.open) return; const k = (c) => Input.keyPressed(c); const n = this.list.length;
    if (k('Escape') || k('Backspace')) { this.toggle(false); return; }
    if (k('ArrowLeft') || k('KeyA')) { this.cat = (this.cat + CATEGORIES.length - 1) % CATEGORIES.length; this.row = 0; Audio.ui('click'); this.render(); }
    if (k('ArrowRight') || k('KeyD')) { this.cat = (this.cat + 1) % CATEGORIES.length; this.row = 0; Audio.ui('click'); this.render(); }
    if (k('ArrowUp') || k('KeyW')) { this.row = (this.row + n - 1) % n; Audio.ui('click'); this.render(); }
    if (k('ArrowDown') || k('KeyS')) { this.row = (this.row + 1) % n; Audio.ui('click'); this.render(); }
    if (k('Enter') || k('NumpadEnter') || k('Space')) this.buy();
  }
  buy() {
    const g = this.g; const it = this.list[this.row]; if (!it) return; const c = this.ctx();
    const r = purchase(it, c.inv, c.money, c.opts);
    if (!r.ok) { this.flash = { bad: true, msg: r.msg }; Audio.ui('fail'); this.render(); return; }
    g.story.pay(-r.cost, `${SHOP_NAME}: ${it.kind === 'weapon' ? it.w.name : it.name} (${this.member})`);
    if (r.weapon && (g.weapons.sel < 0 || !c.inv[g.weapons.sel]?.owned) && !g.weapons.drawn) { g.weapons.sel = it.slot; g.weapons.showHolstered(); } // first gun: carried holstered, ready to draw
    this.flash = { bad: false, msg: r.msg }; Audio.ui('success'); g.hud.notify(SHOP_NAME, `${r.msg} · ${rs(r.cost)}`, 'info', 3); this.render();
    if (g.autosave) g.autosave(); // the purchase (money + loadout) is on disk straight away
  }
  // one-off previews of the real weapon models (offscreen render through the game renderer, read back to data URLs)
  makePreviews() {
    this.previews = {}; const R = this.g.renderer; if (!R || !R.readRenderTargetPixels) return;
    try {
      const W = 360, H = 180; const rt = new THREE.WebGLRenderTarget(W, H, { samples: 0 }); rt.texture.colorSpace = THREE.SRGBColorSpace;
      const sc = new THREE.Scene(); sc.environment = this.g.scene.environment; sc.environmentIntensity = 0.55;
      sc.add(new THREE.HemisphereLight(0xfff4e6, 0x3a3430, 1.6)); const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(2, 3, 4); sc.add(key); const rim = new THREE.DirectionalLight(0xc8dcff, 1.4); rim.position.set(-3, 1, -2); sc.add(rim);
      const cam = new THREE.PerspectiveCamera(24, W / H, 0.05, 20); cam._reversedDepth = !!R.state?.buffers?.depth?.getReversed?.(); cam.updateProjectionMatrix(); /* the game renders reversed-Z: without this every preview clipped to nothing */ const px = new Uint8Array(W * H * 4);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const a = cv.getContext('2d'); const img = a.createImageData(W, H);
      const prevRT = R.getRenderTarget(), prevTM = R.toneMapping, prevCol = new THREE.Color(); R.getClearColor(prevCol); const prevA = R.getClearAlpha();
      R.toneMapping = THREE.NoToneMapping; R.setClearColor(0x000000, 0);
      for (const w of WEAPONS) {
        const m = buildWeaponModel(w); m.rotation.y = -Math.PI / 2; sc.add(m); m.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(m), ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
        const fit = Math.max(sz.x / (2 * Math.tan(THREE.MathUtils.degToRad(12)) * (W / H)), sz.y / (2 * Math.tan(THREE.MathUtils.degToRad(12)))) * 1.18;
        cam.position.set(ctr.x + fit * 0.08, ctr.y + fit * 0.12, ctr.z + fit); cam.lookAt(ctr); cam.updateMatrixWorld();
        R.setRenderTarget(rt); R.clear(); R.render(sc, cam); R.readRenderTargetPixels(rt, 0, 0, W, H, px); let any = false; for (let i = 3; i < px.length; i += 28) if (px[i] > 8) { any = true; break; } if (!any) { sc.remove(m); continue; } /* empty render: keep the vector icon */
        for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // flip rows
        a.putImageData(img, 0, 0); this.previews[w.id] = cv.toDataURL('image/png'); sc.remove(m);
      }
      R.setRenderTarget(prevRT); R.toneMapping = prevTM; R.setClearColor(prevCol, prevA); rt.dispose();
    } catch (e) { console.warn('gun shop previews unavailable', e); this.previews = {}; }
  }
  render() {
    const g = this.g; const c = this.ctx(); const list = this.list; this.row = Math.min(this.row, list.length - 1); const it = list[this.row];
    const tabs = CATEGORIES.map((ct, i) => `<button class="gs-tab${i === this.cat ? ' on' : ''}" data-act="cat" data-i="${i}">${ct.label}</button>`).join('');
    const rows = list.map((x, i) => { const q = quote(x, c.inv, c.money, c.opts); const s = c.inv[x.slot];
      const st = x.kind === 'weapon' ? (s.owned ? '<span class="gs-own">OWNED</span>' : '') : (s.owned ? `<span class="gs-cnt">${s.reserve} / ${reserveCap(x.w)}</span>` : '<span class="gs-lock">NO WEAPON</span>');
      return `<button class="gs-row${i === this.row ? ' on' : ''}${q.ok ? '' : ' dim'}" data-act="item" data-i="${i}"><span class="gs-ico">${this.previews?.[x.w.id] ? `<img src="${this.previews[x.w.id]}" alt="">` : g.weapons.icon(x.w)}</span><span class="gs-nm">${x.name}</span>${st}<span class="gs-pr">${rs(x.price)}</span></button>`; }).join('');
    let det = '';
    if (it) { const q = quote(it, c.inv, c.money, c.opts); const s = c.inv[it.slot]; const w = it.w; const pv = this.previews?.[w.id];
      const bars = stats(w).map(([n, v]) => `<div class="gs-stat"><span>${n}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`).join('');
      const facts = it.kind === 'weapon'
        ? `<div class="gs-facts"><div><small>Magazine</small>${w.mag} rds</div><div><small>Fire mode</small>${w.auto ? 'Automatic' : w.cycle ? 'Bolt / manual' : 'Semi-auto'}</div><div><small>Optic</small>${w.zoom ? w.zoom + '× scope' : 'Iron sights'}</div><div><small>Comes with</small>${w.mag * 2} spare rds</div></div>`
        : `<div class="gs-facts"><div><small>Pack</small>${it.qty} rds</div><div><small>Carrying</small>${s.owned ? s.reserve : 0} rds</div><div><small>Max spare</small>${reserveCap(w)} rds</div><div><small>For</small>${w.name}</div></div>`;
      const status = q.ok ? (it.kind === 'ammo' && q.rounds < it.qty ? `Tops up ${q.rounds} rounds for ${rs(q.cost)}` : 'Available') : q.why;
      det = `<div class="gs-pv">${pv ? `<img src="${pv}" alt="">` : `<div class="gs-pvi">${g.weapons.icon(w)}</div>`}${it.kind === 'ammo' ? '<div class="gs-ammo-tag">AMMUNITION</div>' : ''}</div>
        <div class="gs-dh"><div><div class="gs-cls">${it.kind === 'weapon' ? CLS[w.cls] : 'Ammunition · ' + CLS[w.cls]}</div><h2>${it.name}</h2></div><div class="gs-price">${rs(q.ok ? q.cost : it.price)}</div></div>
        <p class="gs-blurb">${it.blurb}</p>${it.kind === 'weapon' ? `<div class="gs-stats">${bars}</div>` : ''}${facts}
        <div class="gs-buyrow"><div class="gs-status${q.ok ? ' ok' : ''}">${status}</div><button class="gs-buy" data-act="buy" ${q.ok ? '' : 'disabled'}>${it.kind === 'weapon' ? (s.owned ? 'Owned' : 'Buy weapon') : 'Buy rounds'}</button></div>
        ${this.flash ? `<div class="gs-flash${this.flash.bad ? ' bad' : ''}">${this.flash.msg}</div>` : ''}`; }
    const oldList = this.root.querySelector('.gs-list'), oldDet = this.root.querySelector('.gs-det'); const keep = { list: oldList ? oldList.scrollTop : 0, det: oldDet && this._detKey === `${this.cat}:${this.row}` ? oldDet.scrollTop : 0 }; this._detKey = `${this.cat}:${this.row}`;
    this.root.innerHTML = `<div class="gs-panel">
      <header class="gs-head"><div class="gs-brand"><div class="gs-logo">CA</div><div><h1>${SHOP_NAME}</h1><div class="gs-sub">Licensed firearms dealer · Maradana, Colombo 10</div></div></div>
        <div class="gs-who"><div><small>Buying for</small><b>${this.member}</b></div><div><small>Cash</small><b class="gs-cash">${rs(c.money)}</b></div><button class="gs-x" data-act="close" title="Leave">✕</button></div></header>
      <nav class="gs-tabs">${tabs}</nav>
      <div class="gs-body"><div class="gs-list">${rows}</div><section class="gs-det">${det}</section></div>
      <footer class="gs-foot"><span><kbd>←</kbd><kbd>→</kbd> Category</span><span><kbd>↑</kbd><kbd>↓</kbd> Item</span><span><kbd>Enter</kbd> Buy</span><span><kbd>Esc</kbd> Leave</span><span><kbd>Click</kbd> Select · <kbd>Double-click</kbd> Buy</span><span class="gs-note">Weapons belong to the character who buys them. Purchases appear in the phone's bank ledger.</span></footer></div>`;
    // the menu is rebuilt on every change: keep the list where it was, keep the selected row in view, and show an in-theme
    // edge fade (instead of the browser's scrollbar, which is hidden in styles.css) wherever there is more to scroll to
    const lst = this.root.querySelector('.gs-list'), dt = this.root.querySelector('.gs-det');
    if (lst) { lst.scrollTop = keep.list; const on = lst.querySelector('.gs-row.on'); if (on) { const top = on.offsetTop - lst.offsetTop, bot = top + on.offsetHeight; if (top < lst.scrollTop + 8) lst.scrollTop = top - 8; else if (bot > lst.scrollTop + lst.clientHeight - 8) lst.scrollTop = bot - lst.clientHeight + 8; } }
    if (dt) dt.scrollTop = keep.det;
    for (const el of [lst, dt]) { if (!el) continue; const fade = () => { el.classList.toggle('fade-top', el.scrollTop > 2); el.classList.toggle('fade-bot', el.scrollTop + el.clientHeight < el.scrollHeight - 2); }; el.addEventListener('scroll', fade, { passive: true }); fade(); }
  }
}
