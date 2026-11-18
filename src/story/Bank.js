// Ceylon Meridian Bank — the player's savings account (67th request, Phase 1B). Fictional banking, no real payment
// processing. There is ONE wallet: cash in hand is Story.state.money (the HUD figure, the phone's Wallet app, every shop);
// the account balance lives beside it in Story.state.bank and is saved with the rest of the story state (SaveSystem v5).
//
// Every change goes through BankService.transact() — the single authoritative, atomic transaction:
//   • validated first (integer rupees, min / step / per-transaction max, balance, cash in hand, the daily ATM limit)
//   • idempotent: each ATM confirmation carries a request reference; a reference already used is refused (a held or
//     repeated Enter / double click can never run a withdrawal twice); one transaction at a time (in-flight lock)
//   • applied in one synchronous block with a snapshot: cash and balance move together through Story.pay (so the HUD
//     and the Wallet ledger see it at once), the invariant cash + balance = before is checked, and any failure restores
//     the snapshot — no half-applied transfer, no negative cash or balance
//   • recorded: type, amount, result (completed / declined + reason), in-game day and time, balance after; capped list
// The ATM screen state is UI only (ui/ATMUI.js) and is never saved.
export const BANK_RULES = Object.freeze({
  withdraw: { min: 500, step: 500, max: 100000 }, deposit: { min: 100, step: 100, max: 500000 },
  dailyWithdraw: 200000, historyCap: 30, maxBalance: 999999999, refsKept: 40,
});
export const ACCOUNT_NO = '0412 7731 5260'; // fictional
export function freshAccount() { return { v: 1, acct: ACCOUNT_NO, balance: 0, history: [], seq: 0, day: null, withdrawnToday: 0 }; }
const int = (n, d = 0) => (Number.isFinite(n) ? Math.max(0, Math.floor(n)) : d);
// repair / default whatever a save holds (old saves have no account: SaveSystem v5 adds a fresh one; this also guards
// hand-edited or partial data — negative or non-numeric values never reach the game)
export function normalizeAccount(a) {
  const f = freshAccount(); if (!a || typeof a !== 'object') return f;
  const out = { v: 1, acct: typeof a.acct === 'string' && a.acct ? a.acct : f.acct, balance: Math.min(int(a.balance), BANK_RULES.maxBalance), seq: int(a.seq), day: Number.isFinite(a.day) ? a.day : null, withdrawnToday: int(a.withdrawnToday), history: [] };
  if (Array.isArray(a.history)) out.history = a.history.filter((e) => e && typeof e === 'object' && (e.type === 'withdraw' || e.type === 'deposit') && Number.isFinite(e.amount)).slice(0, BANK_RULES.historyCap);
  return out;
}
export const rs = (n) => 'Rs. ' + Math.round(n).toLocaleString('en-LK');

export class BankService {
  constructor(game) { this.g = game; this.busy = false; this.refs = []; this.nextRef = 1; this.stats = { ok: 0, declined: 0, duplicate: 0, busy: 0, failed: 0 }; }
  get story() { return this.g.story; }
  get account() { const s = this.story.state; if (!s.bank || s.bank.v !== 1 || !Array.isArray(s.bank.history)) s.bank = normalizeAccount(s.bank); return s.bank; }
  get cash() { return this.story.state.money; }
  today() { const A = this.g.atmos; return A && Number.isFinite(A.day) ? A.day : 1; }
  clock() { const A = this.g.atmos; return { day: this.today(), time: A && A.timeString ? A.timeString : '' }; }
  // a fresh request reference for a confirmation screen
  newRef() { return 'r' + (this.nextRef++) + '-' + Date.now().toString(36); }
  limitLeft() { const a = this.account; if (a.day !== this.today()) return BANK_RULES.dailyWithdraw; return Math.max(0, BANK_RULES.dailyWithdraw - a.withdrawnToday); }
  // validation only (no side effects): null when allowed, else { code, msg }
  check(kind, amount) {
    const R = BANK_RULES[kind]; if (!R) return { code: 'kind', msg: 'This service is not available.' };
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return { code: 'amount', msg: 'Please enter a valid amount.' };
    if (amount < R.min) return { code: 'min', msg: `The minimum is ${rs(R.min)}.` };
    if (amount % R.step) return { code: 'step', msg: kind === 'withdraw' ? `This ATM dispenses multiples of ${rs(R.step)}.` : `Deposits are accepted in multiples of ${rs(R.step)}.` };
    if (amount > R.max) return { code: 'max', msg: `The most per transaction is ${rs(R.max)}.` };
    const a = this.account;
    if (kind === 'withdraw') { if (amount > a.balance) return { code: 'funds', msg: 'Insufficient funds in your account.' }; if (amount > this.limitLeft()) return { code: 'limit', msg: `Daily ATM limit reached — ${rs(this.limitLeft())} left today.` }; }
    else { if (amount > this.cash) return { code: 'cash', msg: 'You do not have that much cash with you.' }; if (a.balance + amount > BANK_RULES.maxBalance) return { code: 'cap', msg: 'This deposit would exceed the account limit.' }; }
    return null;
  }
  record(entry) { const a = this.account; a.history.unshift(entry); if (a.history.length > BANK_RULES.historyCap) a.history.length = BANK_RULES.historyCap; }
  // THE transaction. req = { kind: 'withdraw' | 'deposit', amount, ref, channel }. Returns { ok, code, msg, entry? }.
  transact(req) {
    const kind = req && req.kind, amount = req && req.amount, ref = req && req.ref;
    if (this.busy) { this.stats.busy++; return { ok: false, code: 'busy', msg: 'A transaction is already in progress.' }; }
    if (ref && this.refs.includes(ref)) { this.stats.duplicate++; return { ok: false, code: 'duplicate', msg: 'This request has already been processed.' }; }
    this.busy = true; const S = this.story.state;
    try {
      if (ref) { this.refs.push(ref); if (this.refs.length > BANK_RULES.refsKept) this.refs.shift(); }
      const a = this.account; const today = this.today(); if (a.day !== today) { a.day = today; a.withdrawnToday = 0; }
      const { day, time } = this.clock(); const bad = this.check(kind, amount);
      if (bad) { this.stats.declined++; const e = { id: ++a.seq, type: kind === 'deposit' ? 'deposit' : 'withdraw', amount: Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0, result: 'declined', reason: bad.msg, day, time, balance: a.balance, channel: req.channel || 'ATM' };
        if (e.amount > 0 && (kind === 'withdraw' || kind === 'deposit')) this.record(e); return { ok: false, code: bad.code, msg: bad.msg, entry: e }; }
      // snapshot → apply → verify → (restore on any failure)
      const snap = { money: S.money, balance: a.balance, wd: a.withdrawnToday, seq: a.seq, history: a.history.slice(), ledger: Array.isArray(S.ledger) ? S.ledger.slice() : S.ledger };
      try {
        const id = ++a.seq;
        if (kind === 'withdraw') { a.balance -= amount; a.withdrawnToday += amount; this.story.pay(amount, 'CMB ATM — cash withdrawal', { quiet: true, transfer: true }); }
        else { a.balance += amount; this.story.pay(-amount, 'CMB ATM — cash deposit', { quiet: true, transfer: true }); }
        if (!(S.money >= 0 && a.balance >= 0 && S.money + a.balance === snap.money + snap.balance)) throw new Error('bank invariant');
        const e = { id, type: kind, amount, result: 'completed', day, time, balance: a.balance, channel: req.channel || 'ATM' }; this.record(e); this.stats.ok++;
        return { ok: true, code: 'ok', msg: kind === 'withdraw' ? 'Please take your cash.' : 'Your deposit has been credited.', entry: e };
      } catch (err) {
        S.money = snap.money; a.balance = snap.balance; a.withdrawnToday = snap.wd; a.seq = snap.seq; a.history = snap.history; S.ledger = snap.ledger; this.stats.failed++;
        console.warn('[bank] transaction rolled back', err); return { ok: false, code: 'failed', msg: 'The transaction could not be completed. Nothing was charged.' };
      }
    } finally { this.busy = false; }
  }
}
