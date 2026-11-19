// Ceylon Meridian Bank ATM (67th request, Phase 1B). Opened only by the interact key at one of the two ATMs in the bank's
// lobby (world/BankInterior.js). While it is open the player stands at the machine (no movement, weapons holstered), the
// camera holds a steady view over his shoulder onto the machine, every other input (phone, map, pause, interact) is held off
// by Game's `busy` gate, and the mouse is free for the screen. The panel is drawn as the machine's own display — steel
// bezel, the function keys either side of the glass lined up with the options, CMB branding — and the same page is painted
// on the 3D screen of the machine in use (BankBrand.drawATMScreen), so the world shows what the player is doing.
// Pages: welcome (card read) → main menu → withdraw / deposit (fast amounts or another amount on the keypad) → confirm →
// processing → result; balance enquiry; mini statement; account details; card returned → closed.
// Money: every confirmation gets a fresh request reference and calls BankService.transact() exactly once (the service
// refuses a reference it has already seen, and one transaction at a time); the page is locked while it runs. Nothing on
// this screen is saved — closing or reloading always starts at the welcome page.
// Keys: ↑/↓ (W/S) option · Enter / Space choose · 0-9 + Backspace amount · Esc back / cancel / return card · mouse click.
import * as THREE from 'three';
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { BankSound, CASH_LEN, CARD_OUT_AT, CARD_OUT_LEN } from '../audio/BankAudio.js';
import { bankCard, CARD } from '../world/BankProps.js';
import { BANK_RULES, rs } from '../story/Bank.js';
import { CMB, drawLogo, hasCanvas } from '../world/BankBrand.js';
import { damp } from '../core/math.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// 72nd: a sound that fails (a bad recording, an audio-context error) must never stop the machine mid-step
const snd = (f) => { try { f(); } catch (e) { console.warn('[atm] sound failed', e); } };
const FAST_W = [1000, 2000, 5000, 10000, 20000];
const FAST_D = [1000, 5000, 10000, 20000];
// 71st: the card in the right hand — held at its trailing end between thumb (on top) and index, palm to the left, fingers
// forward: the card's frame in the hand bone's frame (hand −Y = fingers, +X = palm normal), and its inverse
const ss = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const CARD_IN_HAND = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)).setPosition(0.022, -0.118, 0.012);
const HAND_OF_CARD = CARD_IN_HAND.clone().invert();
// timeline (s): reach and line up · push into the throat · the reader takes it · the screen wakes (with its 1 s sound)
const IN = { lift: 0.55, push: 0.85, take: 1.2, screen: 1.35, done: 1.6 };
// card return: transport motor 2.3 s, the card slides out over the remaining 0.7 s (3 s in all), taken and pocketed
const OUT = { emerge: CARD_OUT_AT, out: CARD_OUT_AT + CARD_OUT_LEN, grab: CARD_OUT_AT + CARD_OUT_LEN + 0.3, pull: CARD_OUT_AT + CARD_OUT_LEN + 0.8, done: CARD_OUT_AT + CARD_OUT_LEN + 1.05 };

export class ATMUI {
  constructor(game, parent) {
    this.g = game; this.open = false; this.page = 'welcome'; this.sel = 0; this.entry = ''; this.busyT = 0; this.after = null; this.req = null; this.result = null; this.msg = null;
    const root = this.root = document.createElement('div'); root.id = 'atm'; root.className = 'atm hidden'; (parent || document.body).appendChild(root);
    root.innerHTML = `<div class="atm-bezel"><div class="atm-keys atm-keys-l"></div><div class="atm-glass"><div class="atm-head"><canvas class="atm-logo" width="64" height="64"></canvas><div class="atm-brand"><b>${esc(CMB.name)}</b><span class="atm-no">${esc(CMB.branch)} · ATM 01</span></div><div class="atm-clock"></div></div><div class="atm-body"></div><div class="atm-foot"></div></div><div class="atm-keys atm-keys-r"></div></div><div class="atm-help"></div>`;
    this.$ = (s) => root.querySelector(s); this.body = this.$('.atm-body'); this.foot = this.$('.atm-foot'); this.keysL = this.$('.atm-keys-l'); this.keysR = this.$('.atm-keys-r'); this.clockEl = this.$('.atm-clock'); this.help = this.$('.atm-help');
    for (const side of [this.keysL, this.keysR]) for (let i = 0; i < 4; i++) { const b = document.createElement('div'); b.className = 'atm-fk'; b.dataset.k = (side === this.keysL ? 'L' : 'R') + i; side.appendChild(b); }
    if (hasCanvas()) { const lc = this.$('.atm-logo').getContext('2d'); drawLogo(lc, 2, 2, 60, { keyline: false }); }
    root.addEventListener('click', (e) => { if (!this.open) return; const t = e.target.closest('[data-o]'); const k = e.target.closest('[data-k]');
      let idx = -1; if (t) idx = +t.dataset.o; else if (k) { const o = this.opts.findIndex((q) => q.key === k.dataset.k); idx = o; } if (idx < 0 || !this.opts[idx]) return; this.sel = idx; this.choose(); });
    this.camPos = new THREE.Vector3(); this.camTgt = new THREE.Vector3(); this._v = new THREE.Vector3(); this._t = new THREE.Vector3();
  }
  get bank() { return this.g.bank; }

  // ---- open at an ATM of the bank room (BankInterior room object, ATM record)
  openAt(room, atm) {
    const g = this.g, P = g.player; if (this.open || !room || !room.site || !atm || !this.bank) return false;
    if ((g.police?.level || 0) > 0) { g.hud.subtitle(CMB.name, 'The machine shows "Temporarily out of service". Lose the police first.', '', 3); return false; }
    if (atm.user) return false;
    if (g.weapons && g.weapons.drawn) g.weapons.forceHolster();
    this.room = room; this.atm = atm; this.site = room.site; this.W = g.interiors.walkIn; atm.player = true;
    const pose = room.atmPose(atm).local; const [wx, wz] = this.W.world(this.site, pose.x, pose.z); this.pose = { local: pose, world: { x: wx, z: wz, y: this.site.y0, yaw: this.site.yaw + pose.yaw } };
    this.prevCam = P.camMode; P.camMode = 0; this.prevControl = P.control; P.control = false; P.camOverride = true; this.place();
    this.page = 'welcome'; this.sel = 0; this.entry = ''; this.result = null; this.msg = null; this.req = null; this.busyT = 1e9; this.after = 'menu'; { const no = this.$('.atm-no'); if (no) no.textContent = `${CMB.branch} · ATM ${String((atm.i || 0) + 1).padStart(2, '0')}`; }
    this.open = true; g.hud.root.classList.add('in-store'); g.hud.subs?.classList.add('in-store'); Input.releaseLock(); this.snapCam = true;
    this.cardAnim = { kind: 'in', t: 0, sound: false, shown: false }; this.cardMesh(); this.render();
    return true;
  }
  place() { const P = this.g.player, A = P.ch.anim; const w = this.pose.world; P.posed = w; P.x = w.x; P.z = w.z; P.y = w.y; P.yaw = w.yaw; P.speed = 0; if (A.set) A.set(null); A.standUp(); P.sync && P.sync(); }
  close(silent = false) {
    const g = this.g, P = g.player; if (!this.open) return; this.open = false; this.root.classList.add('hidden'); g.hud.root.classList.remove('in-store'); g.hud.subs?.classList.remove('in-store');
    P.posed = null; P.camOverride = false; P.control = this.prevControl ?? true; P.camMode = this.prevCam ?? 0; P.camYaw = P.yaw + Math.PI; P.snapCamera && P.snapCamera();
    this.cardAnim = null; if (this.card) this.card.visible = false; if (P.ch.anim.reach && P.ch.anim.reach.atmCard) P.ch.anim.reach = null;
    if (this.atm) { this.atm.player = false; this.atm.paint(null); }
    Input.mousePressed.clear(); Input.mouseButtons.clear(); Input.wheel = 0; g.ignoreUnlock = true; Input.requestLock(g.canvas); setTimeout(() => (g.ignoreUnlock = false), 300); if (!silent) Audio.ui('click');
    this.room = null; this.atm = null; this.req = null; this.page = 'welcome'; this.entry = ''; // nothing of the screen state survives
  }

  // nothing of the screen survives a load / new game: closed, back to the card-read page, no pending request
  reset() { if (this.open) this.close(true); this.page = 'welcome'; this.sel = 0; this.entry = ''; this.req = null; this.result = null; this.msg = null; this.busyT = 0; this.after = null; }
  // ---- pages: { title, lines, opts: [{ label, act, key }] , entry? }
  view() {
    const B = this.bank, a = B.account, cash = this.g.story.state.money, p = this.page; const L = (label, act, key) => ({ label, act, key });
    if (p === 'welcome') return { title: 'Welcome', lines: [['Reading your card…']], opts: [] };
    if (p === 'menu') return { title: 'Please select a service', lines: [['Account', a.acct]], opts: [L('Cash withdrawal', 'withdraw', 'L0'), L('Cash deposit', 'deposit', 'L1'), L('Balance enquiry', 'balance', 'L2'), L('Mini statement', 'statement', 'R0'), L('Account details', 'details', 'R1'), L('Return card', 'exit', 'R3')] };
    if (p === 'withdraw') { const o = FAST_W.map((n, i) => L(rs(n), 'amt:' + n, i < 3 ? 'L' + i : 'R' + (i - 3))); o.push(L('Other amount', 'other', 'R2'), L('Back', 'menu', 'R3')); return { title: 'Cash withdrawal', lines: [['Available balance', rs(a.balance)], ['Left today (ATM limit)', rs(B.limitLeft())]], opts: o }; }
    if (p === 'deposit') { const o = FAST_D.map((n, i) => L(rs(n), 'amt:' + n, 'L' + i)); const all = Math.floor(cash / BANK_RULES.deposit.step) * BANK_RULES.deposit.step; if (all >= BANK_RULES.deposit.min) o.push(L(`All cash (${rs(Math.min(all, BANK_RULES.deposit.max))})`, 'amt:' + Math.min(all, BANK_RULES.deposit.max), 'R1')); o.push(L('Other amount', 'other', 'R2'), L('Back', 'menu', 'R3')); return { title: 'Cash deposit', lines: [['Cash with you', rs(cash)], ['Notes accepted', `multiples of ${rs(BANK_RULES.deposit.step)}`]], opts: o }; }
    if (p === 'other') { const R = BANK_RULES[this.kind]; return { title: this.kind === 'withdraw' ? 'Enter withdrawal amount' : 'Enter deposit amount', entry: true, lines: [['Amount', 'Rs. ' + (this.entry ? (+this.entry).toLocaleString('en-LK') : '0')], ['Allowed', `${rs(R.min)} – ${rs(R.max)}, multiples of ${rs(R.step)}`]], opts: [L('Continue', 'enter', 'R2'), L('Back', this.kind, 'R3')] }; }
    if (p === 'confirm') { const after = this.kind === 'withdraw' ? a.balance - this.amount : a.balance + this.amount; return { title: 'Please confirm', lines: [[this.kind === 'withdraw' ? 'Withdraw' : 'Deposit', rs(this.amount)], ['Balance now', rs(a.balance)], ['Balance after', rs(Math.max(0, after))], ['From account', a.acct]], opts: [L('Confirm', 'confirm', 'R2'), L('Cancel', 'menu', 'R3')] }; }
    if (p === 'processing') return { title: this.kind === 'withdraw' ? 'Counting your cash' : 'Counting your notes', lines: [['Please wait…']], opts: [] };
    if (p === 'result') { const r = this.result || {}; return { title: r.ok ? (this.kind === 'withdraw' ? 'Please take your cash' : 'Deposit credited') : 'Transaction declined', tone: r.ok ? 'ok' : 'bad', lines: [[r.msg || ''], ...(r.ok ? [[this.kind === 'withdraw' ? 'Dispensed' : 'Credited', rs(r.entry.amount)]] : []), ['Account balance', rs(a.balance)], ['Cash with you', rs(cash)], ...(r.entry ? [['Reference', `CMB-${String(r.entry.id).padStart(6, '0')}`]] : [])], opts: [L('Another service', 'menu', 'R2'), L('Return card', 'exit', 'R3')] }; }
    if (p === 'balance') return { title: 'Balance enquiry', lines: [['Available balance', rs(a.balance)], ['Cash with you', rs(cash)], ['ATM withdrawals left today', rs(B.limitLeft())]], opts: [L('Another service', 'menu', 'R2'), L('Return card', 'exit', 'R3')] };
    if (p === 'statement') { const H = a.history.slice(0, 7); return { title: 'Mini statement', statement: H, lines: H.length ? [] : [['No transactions yet.']], opts: [L('Another service', 'menu', 'R2'), L('Return card', 'exit', 'R3')] }; }
    if (p === 'details') return { title: 'Account details', lines: [['Account holder', this.g.squad?.activeMember?.def?.name || 'Account holder'], ['Account', a.acct], ['Type', 'Meridian Savings'], ['Branch', CMB.branch], ['Daily ATM limit', rs(BANK_RULES.dailyWithdraw)]], opts: [L('Another service', 'menu', 'R2'), L('Return card', 'exit', 'R3')] };
    if (p === 'bye') return { title: 'Thank you', lines: [['Please take your card.'], ['Thank you for banking with us.']], opts: [] };
    return { title: '', lines: [], opts: [] };
  }

  // ---- input
  go(page) { this.page = page; this.sel = 0; this.msg = null; if (page !== 'other') this.entry = ''; this.render(); } // (the key that got here already sounded: BankSound.button)
  choose() {
    if (this.busyT > 0) return; const o = this.opts[this.sel]; if (!o) return; snd(() => BankSound.button(0.8)); const P = this.g.player; P.ch.anim.play && P.ch.anim.play('interact', 0.4); const a = o.act;
    if (a === 'exit') { this.returnCard(); return; }
    if (a === 'withdraw' || a === 'deposit') { this.kind = a; this.go(a); return; }
    if (a === 'balance' || a === 'statement' || a === 'details' || a === 'menu') { this.go(a); return; }
    if (a === 'other') { this.entry = ''; this.go('other'); return; }
    if (a === 'enter') { this.submit(+this.entry || 0); return; }
    if (a.startsWith('amt:')) { this.submit(+a.slice(4)); return; }
    if (a === 'confirm') { this.execute(); return; }
  }
  // validate an amount before the confirm page (the service validates again inside the transaction)
  submit(n) { const bad = this.bank.check(this.kind, n); if (bad) { this.msg = { t: bad.msg, bad: true, T: 3 }; Audio.ui('fail'); this.render(); return; }
    this.amount = n; this.req = { kind: this.kind, amount: n, ref: this.bank.newRef(), channel: 'ATM' }; this.go('confirm'); }
  // the one call that moves money. The request (and its reference) was made when the confirm page opened; it is consumed
  // here, so a second Enter / click on the same page — or any key held down — cannot reach transact() again
  execute() { const req = this.req; this.req = null; if (!req || this.page !== 'confirm') return;
    const r = this.bank.transact(req); this.result = r; this.page = 'processing'; this.sel = 0; this.busyT = r.ok ? (req.kind === 'withdraw' || req.kind === 'deposit' ? CASH_LEN : 1.6) : 0.6; this.after = 'result'; if (r.ok) snd(() => BankSound.cash(req.kind === 'deposit')); this.render();
    if (r.ok && this.g.autosave) this.g.autosave(); }

  // ---- per frame (Game.update while open)
  update(dt) {
    if (!this.open) return; const g = this.g, P = g.player;
    if (!this.room || P.indoor !== this.room.proxy || (g.police?.level || 0) > 0 || P.ch.dead || P.dead) { this.close(true); return; }
    P.posed = this.pose.world; // held at the machine
    if (this.cardAnim) { this.stepCard(dt); if (!this.open) return; }
    if (this.msg && (this.msg.T -= dt) <= 0) { this.msg = null; this.render(); }
    if (this.busyT > 0) { this.busyT -= dt; if (this.busyT <= 0) { this.busyT = 0; const n = this.after; this.after = null; if (n === 'close') { this.close(); return; } if (n === 'result') Audio.ui(this.result && this.result.ok ? 'success' : 'fail'); this.page = n || 'menu'; this.sel = 0; this.render(); } }
    else { const k = (c) => Input.keyPressed(c);
      if (k('Escape')) { this.back(); }
      else if (k('Backspace')) { if (this.page === 'other' && this.entry) { this.entry = this.entry.slice(0, -1); snd(() => BankSound.button(0.6)); this.render(); } else this.back(); }
      else { if (k('ArrowUp') || k('KeyW')) this.step(-1); if (k('ArrowDown') || k('KeyS')) this.step(1); if (k('Enter') || k('NumpadEnter') || k('Space')) this.choose();
        if (this.page === 'other') for (let d = 0; d <= 9; d++) if ((k('Digit' + d) || k('Numpad' + d)) && this.entry.length < 7 && !(this.entry === '' && d === 0)) { this.entry += d; snd(() => BankSound.button(0.6)); this.render(); } } }
    if (this.clockEl) { const A = g.atmos; const t = A ? A.timeString : ''; if (t !== this.clockT) { this.clockT = t; this.clockEl.textContent = t; } }
    this.camera(dt);
  }
  // ---- 71st: the bank card — the player takes it out, lines it up with the reader and pushes it into the throat (his right hand
  // on it the whole way: arm IK onto the card's grip), the reader draws it in, the screen wakes; leaving, the machine returns it
  cardMesh() { if (!this.card) { this.card = bankCard(); this.card.frustumCulled = false; } if (this.card.parent !== this.g.scene) this.g.scene.add(this.card); this.card.visible = false; return this.card; }
  returnCard() { this.page = 'bye'; this.sel = 0; this.busyT = 1e9; this.after = null; this.cardAnim = { kind: 'out', t: 0, sound: false, shown: true }; snd(() => BankSound.cardReturn()); this.render(); }
  // the card's world matrix with its centre `depth` m into the slot (negative: still outside), lifted / offset for the approach
  cardAt(depth, off = null) { const m = this.atm, S = m.slot; const rg = this.room.g; rg.updateWorldMatrix(true, false);
    const v = this._v.set(S[0] + CARD.w / 2 - depth, S[1], S[2]); if (off) v.add(off); const M = new THREE.Matrix4().makeTranslation(v.x, v.y, v.z); return M.premultiply(rg.matrixWorld); }
  handOn(Mc, w) { const A = this.g.player.ch.anim; const H = Mc.clone().multiply(HAND_OF_CARD); const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); H.decompose(p, q, sc);
    const R = A.reach && A.reach.atmCard ? A.reach : (A.reach = { S: 'R', atmCard: true, lean: 0, maxLean: 0.25, pose: 'pinch' }); R.p = p; R.q = q; R.w = w; A._rLean = A._rLean ?? 0; }
  // the card glued in the hand: the hand bone's actual transform (IK result) times the grip
  cardInHand() { const hb = this.g.player.ch.bones.handR; hb.updateWorldMatrix(true, false); const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); hb.matrixWorld.decompose(p, q, sc);
    return new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)).multiply(CARD_IN_HAND); }
  showCard(M) { const c = this.card; c.matrix.copy(M); c.matrixWorld.copy(M); c.visible = true; }
  // after the player's animation this frame (Game.updatePlay): the card follows the hand bone where the arm IK has put it now
  lateUpdate() { if (this._glue && this.card && this.open) this.showCard(this.cardInHand()); }
  stepCard(dt) { this._glue = false; const C0 = this.cardAnim, t = (C0.t += dt), g = this.g; const LIFT = new THREE.Vector3(0.2, -0.13, 0.08), ZERO = new THREE.Vector3();
    const A = g.player.ch.anim;
    if (C0.kind === 'in') {
      if (t < IN.push) { // hand comes up with the card (rest → in front of the reader), lined up 3 cm short of the slot, then pushes in
        const u = ss((t - 0.12) / (IN.lift - 0.12)); const off = LIFT.clone().multiplyScalar(1 - u); const depth = t < IN.lift ? -0.03 : -0.03 + 0.065 * ss((t - IN.lift) / (IN.push - IN.lift));
        this.handOn(this.cardAt(depth, off), ss(t / 0.42)); this._glue = true;
      }
      else { // the reader's rollers take the card the rest of the way; the fingers open and the hand drops away
        const depth = 0.035 + 0.075 * ss((t - IN.push) / (IN.take - IN.push)); this.showCard(this.cardAt(depth)); if (depth >= CARD.w - 0.002 || t >= IN.take) this.card.visible = false;
        this.handOn(this.cardAt(0.035), 1 - ss((t - IN.push) / (IN.done - IN.push))); }
      if (!C0.sound && t >= IN.lift + 0.12) { C0.sound = true; snd(() => BankSound.card(false)); } // the card meets the reader's throat
      if (!C0.shown && t >= IN.screen) { C0.shown = true; this.root.classList.remove('hidden'); snd(() => BankSound.open()); this.busyT = 1.0; this.render(); } // "reading your card" → menu
      if (t >= IN.done) { this.cardAnim = null; if (A.reach && A.reach.atmCard) A.reach = null; this.card.visible = false; }
      return; }
    // out: hidden in the machine while the motor runs, slides out with the card-out sound, then the hand takes it and pockets it
    if (t < OUT.emerge) { this.card.visible = false; }
    else if (t < OUT.grab) { const depth = 0.11 - 0.075 * ss((t - OUT.emerge) / (OUT.out - OUT.emerge)); this.showCard(this.cardAt(depth)); if (t > OUT.out - 0.35) this.handOn(this.cardAt(depth), ss((t - (OUT.out - 0.35)) / 0.65)); }
    else { const u = ss((t - OUT.grab) / (OUT.pull - OUT.grab)); const off = LIFT.clone().multiplyScalar(ss((t - OUT.grab - 0.2) / (OUT.done - OUT.grab - 0.2)));
      this.handOn(this.cardAt(0.035 - 0.07 * u, off.equals(ZERO) ? null : off), 1 - ss((t - OUT.pull) / (OUT.done - OUT.pull))); this._glue = true; }
    if (C0.shown && t >= OUT.out) { C0.shown = false; this.root.classList.add('hidden'); }
    if (t >= OUT.done) { this.cardAnim = null; if (A.reach && A.reach.atmCard) A.reach = null; this.card.visible = false; this.close(); } }
  back() { if (this.busyT > 0) return; snd(() => BankSound.button(0.8)); const p = this.page; if (p === 'menu' || p === 'result' || p === 'balance' || p === 'statement' || p === 'details') { if (p === 'menu') { this.returnCard(); return; } }
    if (p === 'other') { this.go(this.kind); return; } if (p === 'confirm') { this.req = null; this.go(this.kind); return; } this.go('menu'); }
  step(d) { const n = this.opts.length; if (!n) return; this.sel = (this.sel + n + d) % n; snd(() => BankSound.button(0.6)); this.render(); } // 72nd: every key on the machine is its own button sound

  // ---- camera: steady, over the right shoulder onto the screen (the ATM faces +x in the room frame)
  camera(dt) {
    const g = this.g, cam = g.camera, s = this.site, W = this.W, m = this.atm; if (!m) return; const y0 = s.y0;
    const [tx, tz] = W.world(s, m.stand[0] - 0.55, m.z); const tgt = this._t.set(tx, y0 + 1.3, tz);
    const [cx, cz] = W.world(s, m.stand[0] + 1.0, m.z + 0.58); const want = this._v.set(cx, y0 + 1.84, cz); // far enough back that his head does not fill the view
    W.clampCam(s, tgt, want);
    if (this.snapCam) { this.camPos.copy(want); this.camTgt.copy(tgt); this.snapCam = false; }
    const k = 1 - Math.exp(-dt * 5); this.camPos.lerp(want, k); this.camTgt.lerp(tgt, k);
    cam.position.copy(this.camPos); cam.lookAt(this.camTgt); if (cam.fov !== 50) { cam.fov = damp(cam.fov, 50, 8, dt); cam.updateProjectionMatrix(); }
  }

  // ---- panel + the machine's own screen
  render() {
    if (!this.open) return; const v = this.view(); this.opts = v.opts || []; if (this.sel >= this.opts.length) this.sel = 0;
    const left = this.opts.filter((o) => o.key && o.key[0] === 'L'), right = this.opts.filter((o) => o.key && o.key[0] === 'R');
    const rowOf = (o) => +o.key.slice(1);
    const optHtml = (o) => { const i = this.opts.indexOf(o); return `<div class="atm-opt ${o.key[0] === 'R' ? 'r' : 'l'}${i === this.sel ? ' sel' : ''}" data-o="${i}" style="grid-row:${rowOf(o) + 1}">${esc(o.label)}</div>`; };
    let lines = (v.lines || []).map((ln) => (ln.length > 1 ? `<div class="atm-ln"><span>${esc(ln[0])}</span><b>${esc(ln[1])}</b></div>` : `<div class="atm-ln c${v.tone ? ' ' + v.tone : ''}">${esc(ln[0])}</div>`)).join('');
    if (v.statement && v.statement.length) lines += `<table class="atm-st"><tr><th>Day</th><th>Time</th><th>Type</th><th>Amount</th><th>Result</th></tr>${v.statement.map((e) => `<tr class="${e.result === 'completed' ? '' : 'no'}"><td>${esc(e.day ?? '')}</td><td>${esc(e.time || '')}</td><td>${e.type === 'withdraw' ? 'Withdrawal' : 'Deposit'}</td><td>${e.type === 'withdraw' ? '−' : '+'}${esc(rs(e.amount))}</td><td>${e.result === 'completed' ? 'Completed' : 'Declined'}</td></tr>`).join('')}</table>`;
    const busy = this.busyT > 0 ? '<div class="atm-spin"><i></i><i></i><i></i></div>' : '';
    this.body.innerHTML = `<div class="atm-title">${esc(v.title)}</div><div class="atm-lines">${lines}${busy}</div>${this.msg ? `<div class="atm-msg${this.msg.bad ? ' bad' : ''}">${esc(this.msg.t)}</div>` : ''}<div class="atm-grid">${left.map(optHtml).join('')}${right.map(optHtml).join('')}</div>`;
    for (const b of this.root.querySelectorAll('.atm-fk')) { const o = this.opts.find((q) => q.key === b.dataset.k); b.classList.toggle('on', !!o); b.classList.toggle('sel', !!o && this.opts.indexOf(o) === this.sel); }
    this.foot.textContent = this.page === 'other' ? 'Type the amount on the keypad · Backspace corrects · Enter continues' : 'Shield the keypad · Never share your PIN · CMB staff will never ask for it';
    this.help.innerHTML = this.busyT > 0 ? '' : `<kbd>↑</kbd><kbd>↓</kbd> select · <kbd>Enter</kbd> choose${this.page === 'other' ? ' · <kbd>0–9</kbd> amount' : ''} · <kbd>Esc</kbd> ${this.page === 'menu' ? 'return card' : 'back'}`;
    // the machine's own screen shows the same page (left options first, then right, as the function keys)
    if (this.atm && this.cardAnim && this.cardAnim.kind === 'in' && !this.cardAnim.shown) this.atm.paint(null); // card still going in: the machine still says "Please insert your card"
    else if (this.atm) { const order = [...left.sort((a, b) => rowOf(a) - rowOf(b)), ...right.sort((a, b) => rowOf(a) - rowOf(b))]; const sel = order.indexOf(this.opts[this.sel]);
      const ln = (v.lines || []).slice(0, this.opts.length ? 2 : 5).map((x) => (x.length > 1 ? [x[0], x[1]] : [x[0]])); this.atm.paint({ title: v.title, lines: v.statement && v.statement.length ? [[`${v.statement.length} recent transactions`]] : ln, left: left.map((o) => o.label), right: right.map((o) => o.label), sel, tone: v.tone, note: CMB.name }); }
  }
}
