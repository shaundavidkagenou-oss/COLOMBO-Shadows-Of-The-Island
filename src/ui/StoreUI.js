// Walk-in shop menus (barber · tattoo studios · clothing store · luxury boutique) in the style of an open-world shop menu:
// a narrow panel at the top-left (shop banner, category / item list with prices, owned / worn ticks, a counter, a one-line
// description), the player held in place (standing at a display / mirror, sitting in the barber chair or on the edge of the
// tattoo bed) and a shop camera framing whatever the selected category dresses (head for hair, beard, hats and sunglasses,
// torso for tops and coats, legs, feet, or the tattooed zone). Hovering an item previews it on the character for free;
// leaving restores what was worn before, at no cost. Buying charges the shared purse (Story.pay → bank ledger) and saves
// the look per protagonist (story.state.outfits[id]); clothes once bought stay owned (re-wearing is free), haircuts and
// colours are paid each visit, tattoos are permanent until lasered off.
// Keys: ↑/↓ (W/S) item · Enter / Space choose · Backspace / Esc back · ←/→ (A/D) turn the camera · mouse: click / wheel.
import * as THREE from 'three';
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { CATALOGUE, CATEGORY_NAMES, STORE_CATS, SLOT, itemById, HAIRCUTS, HAIR_COLORS, BEARDS, lookOf } from '../actors/Wardrobe.js';
import { TATTOO_DESIGNS, TATTOO_ZONES, drawTattooDesign } from '../actors/TattooArt.js';
import { clamp, damp } from '../core/math.js';
import { HEROES } from '../actors/Character.js';

const rs = (n) => (n ? 'Rs. ' + Math.round(n).toLocaleString('en-LK') : 'FREE');
const ROWS = 10;
// camera framing per category: bone to look at, distance, height offset, side angle (rad, 0 = straight in front)
const FRAME = {
  hats: ['head', 0.95, 0.06, 0.35], glasses: ['head', 0.75, 0.02, 0.25], hair: ['head', 0.78, 0.04, 0.55], color: ['head', 0.78, 0.04, 0.35], beard: ['head', 0.8, -0.02, 0.3],
  tops: ['chest', 1.75, 0.05, 0.25], coats: ['chest', 1.85, 0.0, 0.3], pants: ['hips', 2.0, -0.3, 0.2], shoes: ['footL', 1.75, 0.3, 0.5], luxshoes: ['footL', 1.75, 0.3, 0.5],
  foreL: ['foreL', 0.85, -0.05, 0.9], foreR: ['foreR', 0.85, -0.05, -0.9], upperL: ['armL', 0.85, -0.05, 1.35], upperR: ['armR', 0.85, -0.05, -1.35], chest: ['chest', 0.95, 0.05, 0.1], back: ['chest', 1.0, 0.05, Math.PI],
  all: ['chest', 2.3, -0.15, 0.2],
};

export class StoreUI {
  constructor(game, parent) {
    this.g = game; this.open = false; this.level = 0; this.cat = 0; this.row = 0; this.top = 0; this.orbit = 0; this.busy = 0; this.pending = null;
    const root = this.root = document.createElement('div'); root.id = 'store'; root.className = 'sto hidden'; (parent || document.body).appendChild(root);
    root.addEventListener('click', (e) => { const t = e.target.closest('[data-i]'); if (!t || this.busy) return; const i = +t.dataset.i; if (i === this.row) this.choose(); else { this.row = i; this.moved(); } });
    root.addEventListener('wheel', (e) => { if (this.busy) return; e.preventDefault(); this.step(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this.camPos = new THREE.Vector3(); this.camTgt = new THREE.Vector3();
  }
  get who() { return this.g.squad ? this.g.squad.activeId : 'dineth'; }
  get member() { return this.g.squad?.activeMember?.def?.name || 'You'; }
  get state() { return this.g.story.state; }
  owned() { const o = this.state.owned || (this.state.owned = {}); return o[this.who] || (o[this.who] = []); }

  // ---- what this shop sells: categories → rows { id, name, price, owned?, worn?, apply(look) }
  categories() {
    const k = this.kind, L = this.look;
    if (k === 'barber') return [
      { id: 'hair', name: 'Haircuts', rows: HAIRCUTS.map((h) => ({ id: h.id, name: h.name, price: h.price, worn: (L.hair || this.base.hair) === h.id, apply: (l) => { l.hair = h.id; } })) },
      { id: 'color', name: 'Hair colour', rows: HAIR_COLORS.map((h) => ({ id: h.id, name: h.name, price: h.price, worn: L.hairColor ? L.hairColor === h.id : this.base.hairColor === h.col, apply: (l) => { l.hairColor = h.id; } })) },
      { id: 'beard', name: 'Facial hair', rows: BEARDS.map((b) => ({ id: b.id, name: b.name, price: b.price, worn: L.beard === b.id, apply: (l) => { l.beard = b.id; } })) },
    ];
    if (k === 'tattoo') return TATTOO_ZONES.map((z) => { const cur = (L.tattoos || {})[z.id];
      const rows = TATTOO_DESIGNS.map((d) => ({ id: d.id, name: d.name, price: Math.round(d.price * z.price / 500) * 500, worn: cur === d.id, design: d.id, apply: (l) => { (l.tattoos = { ...(l.tattoos || {}) })[z.id] = d.id; } }));
      if (cur) rows.unshift({ id: 'none', name: 'Laser removal', price: 2500, worn: false, apply: (l) => { l.tattoos = { ...(l.tattoos || {}) }; delete l.tattoos[z.id]; } });
      return { id: z.id, name: z.name, rows }; });
    const own = this.owned(); const cats = STORE_CATS[k] || [];
    return cats.map((c) => { const slot = SLOT[c]; const rows = CATALOGUE[c].map((it) => ({ id: it.id, name: it.name, price: it.price, owned: own.includes(it.id), worn: L[slot] === it.id, apply: (l) => { l[slot] = it.id; } }));
      if (slot === 'hat' || slot === 'glasses' || slot === 'coat') rows.unshift({ id: 'none', name: slot === 'hat' ? 'No hat' : slot === 'glasses' ? 'No sunglasses' : 'No coat', price: 0, owned: true, worn: !L[slot], apply: (l) => { delete l[slot]; } });
      return { id: c, name: CATEGORY_NAMES[c], rows }; });
  }

  // ---- open at a spot of a walk-in room (WalkIn room object + the spot { x, z, cat? })
  openAt(room, spot) {
    const g = this.g, P = g.player; if (this.open || !room || !room.site) return false;
    const kind = room.def.kind; if (!['barber', 'tattoo', 'clothing', 'luxury'].includes(kind)) return false;
    if ((g.police?.level || 0) > 0) { g.hud.subtitle(room.name, 'Not now — the police are outside looking for you.', '', 3); return false; }
    if (P.vehicle || P.weapons?.drawn) { if (g.weapons) g.weapons.forceHolster(); }
    this.room = room; this.kind = kind; this.site = room.site; this.W = g.interiors.walkIn;
    const fits = this.state.outfits || (this.state.outfits = {}); this.saved = fits[this.who]; this.look = lookOf(this.saved); this.base = { ...(HEROES[this.who] || {}) }; this.shownKey = JSON.stringify(this.look);
    this.cats = this.categories(); this.level = 0; this.row = 0; this.top = 0; this.cat = 0; this.orbit = 0;
    if (spot && spot.cat) { const i = this.cats.findIndex((c) => c.id === spot.cat); if (i >= 0) { this.cat = i; this.level = 1; this.row = 0; } }
    // where the player is held: barber chair / tattoo bed / in front of the display
    this.pose = this.holdPose(room, spot); this.prevCam = P.camMode; P.camMode = 0; this.prevControl = P.control; P.control = false; P.posed = this.pose.world; P.camOverride = true;
    room.busy = true; room.keeperBusy = kind === 'barber' || kind === 'tattoo'; this.keeper = room.keeper; this.kpT = 0;
    this.sit(); this.open = true; this.root.classList.remove('hidden'); g.hud.root.classList.add('in-store'); Input.releaseLock(); this.snapCam = true; this.render(); Audio.ui('click');
    const hello = { barber: 'Take a seat. What are we doing today?', tattoo: 'Pick a spot and a design — the stencil goes on first.', clothing: 'Have a look around, try anything on.', luxury: 'Good afternoon. Everything here is made to be worn for years.' }[kind];
    g.hud.subtitle(room.def.keeperName || room.name, hello, '', 3);
    return true;
  }
  holdPose(room, spot) {
    const s = this.site, W = this.W; const loc = (x, z, y, yaw) => { const [wx, wz] = W.world(s, x, z); return { x: wx, z: wz, y: s.y0 + y, yaw: s.yaw + yaw }; };
    if (this.kind === 'barber' && room.chairs && room.chairs[0]) { const c = room.chairs[0]; this.seat = { x: 0, y: 0, z: 0, floor: -0.305, fz: 0.42, fx: 0.12, roof: 9, lean: -0.04, hands: 'lap', kind: 'sit' }; return { local: { x: c.x + 0.03, z: c.z, yaw: c.yaw }, world: loc(c.x + 0.03, c.z, 0.54, c.yaw) }; }
    if (this.kind === 'tattoo' && room.chairs && room.chairs[0]) { const c = room.chairs[0]; this.seat = { x: 0, y: 0, z: 0, floor: -0.62, fz: 0.4, fx: 0.13, roof: 9, lean: 0.02, hands: 'lap', kind: 'sit' }; const x = c.x + 0.14, z = c.z + 0.25; return { local: { x, z, yaw: Math.PI / 2 }, world: loc(x, z, 0.62, Math.PI / 2) }; }
    this.seat = null; const b = room.bounds; const sx = spot ? spot.x : 0, sz = spot ? spot.z : (b.z0 + b.z1) / 2;
    // stand a little off the display, facing the middle of the shop (the camera goes between the player and the room centre)
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2; const yaw = Math.atan2(cx - sx, cz - sz); const x = clamp(sx + Math.sin(yaw) * 0.35, b.x0 + 0.5, b.x1 - 0.5), z = clamp(sz + Math.cos(yaw) * 0.35, b.z0 + 0.5, b.z1 - 0.5);
    return { local: { x, z, yaw }, world: loc(x, z, 0, yaw) };
  }
  sit() { const P = this.g.player, A = P.ch.anim; P.posed = this.pose.world; P.x = P.posed.x; P.z = P.posed.z; P.y = P.posed.y; P.yaw = P.posed.yaw; P.speed = 0; if (A.set) A.set(null);
    if (this.seat) A.sitIn(this.seat, 1); else A.standUp(); P.sync(); A.update(0.001, 0); }

  close() {
    const g = this.g, P = g.player; if (!this.open) return; this.open = false; this.root.classList.add('hidden'); g.hud.root.classList.remove('in-store'); this.pending = null; this.busy = 0;
    // whatever was only previewed comes off again
    if (this.shownKey !== JSON.stringify(lookOf(this.state.outfits[this.who]))) g.rebuildPlayer();
    P.ch.anim.standUp(); P.posed = null; P.camOverride = false; P.control = this.prevControl ?? true; P.camMode = this.prevCam ?? 0;
    if (this.seat) { const [ox, oz] = this.W.world(this.site, this.pose.local.x + Math.sin(this.pose.local.yaw) * 0.55, this.pose.local.z + Math.cos(this.pose.local.yaw) * 0.55); P.x = ox; P.z = oz; P.y = this.site.y0; P.sync(); } // stand up in front of the chair
    P.camYaw = P.yaw + Math.PI; P.snapCamera && P.snapCamera();
    if (this.room) { this.room.busy = false; this.room.keeperBusy = false; if (this.keeper && this.room.keeperHome) this.keeperTo(this.room.keeperHome, 1); }
    if (this.keeper) this.keeper.anim.ik = null;
    Input.mousePressed.clear(); Input.mouseButtons.clear(); Input.wheel = 0; g.ignoreUnlock = true; Input.requestLock(g.canvas); setTimeout(() => (g.ignoreUnlock = false), 300); Audio.ui('click');
    this.shownKey = null; this.room = null;
  }

  // ---- navigation
  get rows() { return this.level === 0 ? this.cats.map((c) => ({ id: c.id, name: c.name, cat: true })) : this.cats[this.cat].rows; }
  step(d) { const n = this.rows.length; this.row = (this.row + n + d) % n; this.moved(); }
  moved() { Audio.ui('hover'); if (this.row < this.top) this.top = this.row; if (this.row >= this.top + ROWS) this.top = this.row - ROWS + 1; this.render(); this.previewSoon(); }
  previewSoon() { const look = this.level === 0 ? this.look : this.withRow(this.rows[this.row]); this.pending = { look, t: 0.14 }; }
  withRow(r) { const l = JSON.parse(JSON.stringify(this.look)); if (r && r.apply) r.apply(l); return l; }
  back() { if (this.busy) return; if (this.level === 1) { this.level = 0; this.row = this.cat; this.top = 0; Audio.ui('click'); this.render(); this.pending = { look: this.look, t: 0 }; } else this.close(); }
  choose() {
    if (this.busy) return; const r = this.rows[this.row]; if (!r) return;
    if (this.level === 0) { this.cat = this.row; this.level = 1; this.row = Math.max(0, this.cats[this.cat].rows.findIndex((q) => q.worn)); this.top = Math.max(0, this.row - 4); Audio.ui('click'); this.render(); this.previewSoon(); return; }
    if (r.worn && r.id !== 'none') { this.flash('Already wearing it.'); return; }
    const free = r.owned || !r.price; const cost = free ? 0 : r.price;
    if (cost > this.state.money) { Audio.ui('fail'); this.flash('Not enough money.', true); return; }
    if (cost) this.g.story.pay(-cost, `${this.room.name}: ${r.name} (${this.member})`);
    const look = this.withRow(r); this.look = look; if (this.kind === 'clothing' || this.kind === 'luxury') { const own = this.owned(); if (!own.includes(r.id) && r.id !== 'none') own.push(r.id); }
    this.state.outfits[this.who] = JSON.parse(JSON.stringify(look)); this.cats = this.categories();
    if (this.kind === 'barber' || this.kind === 'tattoo') { this.busy = this.kind === 'barber' ? 2.6 : 3.4; this.work = { t: 0, total: this.busy, zone: this.cats[this.cat].id, cat: this.cats[this.cat].id }; this.pending = null; this.render(); }
    else { Audio.ui('success'); this.flash(cost ? `Bought · ${rs(cost)}` : 'Wearing it.'); this.pending = { look, t: 0 }; }
    if (this.g.autosave) this.g.autosave();
  }
  flash(msg, bad = false) { this.msg = { msg, bad, t: 2.2 }; this.render(); }

  // ---- per frame (Game.update while open)
  update(dt) {
    if (!this.open) return; const g = this.g, P = g.player;
    if (!this.room || P.indoor !== this.room.proxy || (g.police?.level || 0) > 0 || P.ch.dead) { this.close(); return; }
    if (this.msg && (this.msg.t -= dt) <= 0) { this.msg = null; this.render(); }
    if (!this.busy) { const k = (c) => Input.keyPressed(c);
      if (k('Escape') || k('Backspace')) { this.back(); return; }
      if (k('ArrowUp') || k('KeyW')) this.step(-1); if (k('ArrowDown') || k('KeyS')) this.step(1);
      if (k('Enter') || k('NumpadEnter') || k('Space')) this.choose(); }
    const turn = (Input.down.has('ArrowLeft') || Input.down.has('KeyA') ? 1 : 0) - (Input.down.has('ArrowRight') || Input.down.has('KeyD') ? 1 : 0); this.orbit = clamp(this.orbit + turn * dt * 1.6, -1.25, 1.25);
    if (this.pending && (this.pending.t -= dt) <= 0) { const look = this.pending.look; this.pending = null; this.show(look); }
    if (this.busy) this.doWork(dt);
    this.keeperIdle(dt); this.camera(dt);
  }
  // rebuild the character in a look (preview or bought) and put him back on the chair / spot
  show(look) { const key = JSON.stringify(look); if (key === this.shownKey) return; this.shownKey = key; this.g.rebuildPlayer(look); this.sit(); }

  // barber cutting / artist tattooing after a purchase: the keeper works at the head / zone, then the new look is shown
  doWork(dt) { const w = this.work; w.t += dt; this.busy = Math.max(0, w.total - w.t);
    if (w.t > 0.25 && !w.shownNew) { w.shownNew = true; this.show(this.look); }
    if (Math.floor(w.t * 4) !== Math.floor((w.t - dt) * 4)) Audio.noise && Audio.noise(0.22, this.kind === 'barber' ? { f: 3200, q: 6, vol: 0.035 } : { f: 180, q: 4, vol: 0.05 }); // clippers / coil machine buzz
    if (this.busy <= 0) { this.work = null; if (this.keeper) this.keeper.anim.ik = null; Audio.ui('success'); this.flash(this.kind === 'barber' ? 'Looking sharp, machan.' : 'Keep it wrapped for a day — no sea for a week.'); this.render(); } }
  keeperTo(p, t) { this.kpWalk = { from: [this.keeper.root.position.x, this.keeper.root.position.z], to: p, t: 0, T: t }; }
  keeperIdle(dt) {
    const kp = this.keeper, r = this.room; if (!kp || !r || !r.keeperBusy) return; const s = this.pose.local;
    // barber: behind and to the right of the chair, facing the head · tattoo: on the artist's stool at the arm
    const want = this.kind === 'barber' ? [s.x + 0.55, s.z + 0.42] : [s.x + 0.84, s.z - 0.35]; const dx = want[0] - kp.root.position.x, dz = want[1] - kp.root.position.z; const d = Math.hypot(dx, dz);
    if (d > 0.03) { const v = Math.min(d, dt * 1.2); kp.root.position.x += (dx / d) * v; kp.root.position.z += (dz / d) * v; kp.root.rotation.y = Math.atan2(dx, dz); kp.anim.update(dt, 1.2); }
    else { const face = Math.atan2(s.x - kp.root.position.x, s.z - kp.root.position.z); let a = face - kp.root.rotation.y; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; kp.root.rotation.y += a * Math.min(1, dt * 5); kp.anim.update(dt, 0);
      if (this.work) { const t = this.work.t; const T = this.kind === 'barber' ? new THREE.Vector3(-0.12 + Math.sin(t * 5) * 0.06, 0.28 + Math.sin(t * 3.1) * 0.05, 0.42) : new THREE.Vector3(-0.1 + Math.sin(t * 7) * 0.02, -0.12, 0.42 + Math.sin(t * 2.3) * 0.03); kp.anim.ik = { R: T, qR: null, wR: Math.min(1, t * 3, this.busy * 3), L: null }; } }
  }
  camera(dt) {
    const g = this.g, P = g.player, cam = g.camera; const cid = this.level === 1 ? this.cats[this.cat].id : this.kind === 'barber' ? 'hair' : this.kind === 'tattoo' ? this.cats[this.row]?.id || 'all' : 'all';
    const F = FRAME[cid] || FRAME.all; const bone = P.ch.bones[F[0]] || P.ch.bones.chest; bone.updateWorldMatrix(true, false); const tgt = this._t.setFromMatrixPosition(bone.matrixWorld); tgt.y += F[2];
    const yaw = P.yaw + F[3] + this.orbit; const want = this._v.set(tgt.x + Math.sin(yaw) * F[1], tgt.y + 0.04, tgt.z + Math.cos(yaw) * F[1]);
    this.W.clampCam(this.site, tgt, want);
    if (this.snapCam) { this.camPos.copy(want); this.camTgt.copy(tgt); this.snapCam = false; }
    const k = 1 - Math.exp(-dt * 6); this.camPos.lerp(want, k); this.camTgt.lerp(tgt, k);
    // the menu sits on the left: aim a little left of the subject so he stands right of centre (clear of the panel)
    const fx = this.camTgt.x - this.camPos.x, fz = this.camTgt.z - this.camPos.z, fl = Math.hypot(fx, fz) || 1; const off = Math.hypot(fx, fz, this.camTgt.y - this.camPos.y) * 0.3;
    cam.position.copy(this.camPos); cam.lookAt(this._v.set(this.camTgt.x - (-fz / fl) * off, this.camTgt.y, this.camTgt.z - (fx / fl) * off)); if (cam.fov !== 50) { cam.fov = damp(cam.fov, 50, 8, dt); cam.updateProjectionMatrix(); }
  }

  // ---- panel
  render() {
    if (!this.open) return; const rows = this.rows; const n = rows.length; const vis = rows.slice(this.top, this.top + ROWS);
    const title = this.level === 0 ? (this.kind === 'tattoo' ? 'Choose a placement' : 'Categories') : this.cats[this.cat].name;
    const cur = rows[this.row]; const money = this.state.money;
    let desc = ''; if (this.level === 1 && cur) desc = cur.worn ? 'Currently wearing.' : cur.owned && cur.price ? 'Owned — wear it for free.' : cur.id === 'none' ? (cur.price ? 'Removes the tattoo from this placement.' : 'Take it off.') : this.kind === 'barber' ? 'Preview in the mirror before the cut.' : this.kind === 'tattoo' ? 'Stencil preview — permanent once inked.' : 'Try it on before you buy.';
    if (this.busy) desc = this.kind === 'barber' ? 'Cutting…' : 'Inking…';
    const art = this.level === 1 && this.kind === 'tattoo' && cur && cur.design ? '<canvas class="sto-art" width="120" height="120"></canvas>' : '';
    this.root.innerHTML = `<div class="sto-panel"><div class="sto-banner sto-${this.kind}"><span>${this.room.name}</span></div>
      <div class="sto-sub"><b>${title.toUpperCase()}</b><i>${this.row + 1} / ${n}</i></div>
      <div class="sto-list">${vis.map((r, j) => { const i = this.top + j; return `<div class="sto-row${i === this.row ? ' on' : ''}${r.worn ? ' worn' : ''}" data-i="${i}"><span>${r.name}</span>${r.worn && !r.cat ? '<em class="tk"></em>' : `<em>${r.cat ? '›' : r.owned && r.price ? 'OWNED' : rs(r.price)}</em>`}</div>`; }).join('')}</div>
      ${n > ROWS ? `<div class="sto-more">${this.top > 0 ? '▲' : '&nbsp;'} ${this.top + ROWS < n ? '▼' : '&nbsp;'}</div>` : ''}
      <div class="sto-desc">${art}<span>${this.msg ? `<b class="${this.msg.bad ? 'bad' : ''}">${this.msg.msg}</b>` : desc}</span></div>
      <div class="sto-foot"><span>Rs. ${Math.round(money).toLocaleString('en-LK')}</span><span><kbd>Enter</kbd> ${this.level === 0 ? 'Select' : 'Buy'} · <kbd>Bksp</kbd> Back · <kbd>A</kbd>/<kbd>D</kbd> Turn</span></div></div>`;
    const cv = this.root.querySelector('.sto-art'); if (cv) { const a = cv.getContext('2d'); if (a) { a.fillStyle = '#efe6d6'; a.fillRect(0, 0, 120, 120); drawTattooDesign(a, cur.design, 8, 8, 104, 104, { ink: '#1b1b1f', color: true }); } }
  }
}
