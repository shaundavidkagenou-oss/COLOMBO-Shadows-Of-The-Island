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
import { BankSound } from '../audio/BankAudio.js';
import { BANK_RULES, rs } from '../story/Bank.js';
import { CMB, drawLogo, hasCanvas } from '../world/BankBrand.js';
import { damp } from '../core/math.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FAST_W = [1000, 2000, 5000, 10000, 20000];
const FAST_D = [1000, 5000, 10000, 20000];

export class ATMUI {
  constructor(game, parent) {
    this.g = game; this.open = false; this.page = 'welcome'; this.sel = 0; this.entry = ''; this.busyT = 0; this.after = null; this.req = null; this.result = null; this.msg = null;
    const root = this.root = document.createElement('div'); root.id = 'atm'; root.className = 'atm hidden'; (parent || document.body).appendChild(root);
    root.innerHTML = `<div class="atm-bezel"><div class="atm-keys atm-keys-l"></div><div class="atm-glass"><div class="atm-head"><canvas class="atm-logo" width="64" height="64"></canvas><div class="atm-brand"><b>${esc(CMB.name)}</b><span>${esc(CMB.branch)} · ATM 02</span></div><div class="atm-clock"></div></div><div class="atm-body"></div><div class="atm-foot"></div></div><div class="atm-keys atm-keys-r"></div></div><div class="atm-help"></div>`;
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
    this.page = 'welcome'; this.sel = 0; this.entry = ''; this.result = null; this.msg = null; this.req = null; this.busyT = 0.95; this.after = 'menu';
    this.open = true; this.root.classList.remove('hidden'); g.hud.root.classList.add('in-store'); g.hud.subs?.classList.add('in-store'); Input.releaseLock(); this.snapCam = true;
    P.ch.anim.play && P.ch.anim.play('interact', 0.6); BankSound.card(false); this.render();
    return true;
  }
  place() { const P = this.g.player, A = P.ch.anim; const w = this.pose.world; P.posed = w; P.x = w.x; P.z = w.z; P.y = w.y; P.yaw = w.yaw; P.speed = 0; if (A.set) A.set(null); A.standUp(); P.sync && P.sync(); }
  close(silent = false) {
    const g = this.g, P = g.player; if (!this.open) return; this.open = false; this.root.classList.add('hidden'); g.hud.root.classList.remove('in-store'); g.hud.subs?.classList.remove('in-store');
    P.posed = null; P.camOverride = false; P.control = this.prevControl ?? true; P.camMode = this.prevCam ?? 0; P.camYaw = P.yaw + Math.PI; P.snapCamera && P.snapCamera();
    if (this.atm) { this.atm.player = false; this.atm.paint(null); }
    Input.mousePressed.clear(); Input.mouseButtons.clear(); Input.wheel = 0; g.ignoreUnlock = true; Input.requestLock(g.canvas); setTimeout(() => (g.ignoreUnlock = false), 300); if (!silent) Audio.ui('click');
    this.room = null; this.atm = null; this.req = null; this.page = 'welcome'; this.entry = ''; // nothing of the screen state survives
  }

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
  go(page) { this.page = page; this.sel = 0; this.msg = null; if (page !== 'other') this.entry = ''; Audio.ui('click'); this.render(); }
  choose() {
    if (this.busyT > 0) return; const o = this.opts[this.sel]; if (!o) return; BankSound.beep(0.8); const P = this.g.player; P.ch.anim.play && P.ch.anim.play('interact', 0.4); const a = o.act;
    if (a === 'exit') { this.page = 'bye'; this.busyT = 1.3; this.after = 'close'; BankSound.card(true); this.render(); return; }
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
    const r = this.bank.transact(req); this.result = r; this.page = 'processing'; this.sel = 0; this.busyT = r.ok ? 1.6 : 0.6; this.after = 'result'; if (r.ok) BankSound.cash(req.kind === 'deposit'); this.render();
    if (r.ok && this.g.autosave) this.g.autosave(); }

  // ---- per frame (Game.update while open)
  update(dt) {
    if (!this.open) return; const g = this.g, P = g.player;
    if (!this.room || P.indoor !== this.room.proxy || (g.police?.level || 0) > 0 || P.ch.dead || P.dead) { this.close(true); return; }
    P.posed = this.pose.world; // held at the machine
    if (this.msg && (this.msg.T -= dt) <= 0) { this.msg = null; this.render(); }
    if (this.busyT > 0) { this.busyT -= dt; if (this.busyT <= 0) { this.busyT = 0; const n = this.after; this.after = null; if (n === 'close') { this.close(); return; } if (n === 'result') Audio.ui(this.result && this.result.ok ? 'success' : 'fail'); this.page = n || 'menu'; this.sel = 0; this.render(); } }
    else { const k = (c) => Input.keyPressed(c);
      if (k('Escape')) { this.back(); }
      else if (k('Backspace')) { if (this.page === 'other' && this.entry) { this.entry = this.entry.slice(0, -1); BankSound.beep(0.6); this.render(); } else this.back(); }
      else { if (k('ArrowUp') || k('KeyW')) this.step(-1); if (k('ArrowDown') || k('KeyS')) this.step(1); if (k('Enter') || k('NumpadEnter') || k('Space')) this.choose();
        if (this.page === 'other') for (let d = 0; d <= 9; d++) if ((k('Digit' + d) || k('Numpad' + d)) && this.entry.length < 7 && !(this.entry === '' && d === 0)) { this.entry += d; BankSound.beep(0.6); this.render(); } } }
    if (this.clockEl) { const A = g.atmos; const t = A ? A.timeString : ''; if (t !== this.clockT) { this.clockT = t; this.clockEl.textContent = t; } }
    this.camera(dt);
  }
  back() { if (this.busyT > 0) return; const p = this.page; if (p === 'menu' || p === 'result' || p === 'balance' || p === 'statement' || p === 'details') { if (p === 'menu') { this.page = 'bye'; this.busyT = 1.3; this.after = 'close'; BankSound.card(true); this.render(); return; } }
    if (p === 'other') { this.go(this.kind); return; } if (p === 'confirm') { this.req = null; this.go(this.kind); return; } this.go('menu'); }
  step(d) { const n = this.opts.length; if (!n) return; this.sel = (this.sel + n + d) % n; Audio.ui('hover'); this.render(); }

  // ---- camera: steady, over the right shoulder onto the screen (the ATM faces +x in the room frame)
  camera(dt) {
    const g = this.g, cam = g.camera, s = this.site, W = this.W, m = this.atm; if (!m) return; const y0 = s.y0;
    const [tx, tz] = W.world(s, m.stand[0] - 0.55, m.z); const tgt = this._t.set(tx, y0 + 1.3, tz);
    const [cx, cz] = W.world(s, m.stand[0] + 0.62, m.z + 0.42); const want = this._v.set(cx, y0 + 1.72, cz);
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
    if (this.atm) { const order = [...left.sort((a, b) => rowOf(a) - rowOf(b)), ...right.sort((a, b) => rowOf(a) - rowOf(b))]; const sel = order.indexOf(this.opts[this.sel]);
      const ln = (v.lines || []).slice(0, this.opts.length ? 2 : 5).map((x) => (x.length > 1 ? [x[0], x[1]] : [x[0]])); this.atm.paint({ title: v.title, lines: v.statement && v.statement.length ? [[`${v.statement.length} recent transactions`]] : ln, left: left.map((o) => o.label), right: right.map((o) => o.label), sel, tone: v.tone, note: CMB.name }); }
  }
}
