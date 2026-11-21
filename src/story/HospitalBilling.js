// 74th request — the National Hospital's bill after a recovery. No second banking system: the bill is charged to the
// player's Ceylon Meridian Bank account through BankService.transact() (kind 'medical' — the one atomic transaction,
// recorded in the account history with the invoice number), and the invoice itself is kept in the story state
// (Story.state.hospital, saved with the rest of the story — SaveSystem).
//   • one invoice per recovery: admit() opens an admission id, billRecovery(rid) issues its invoice once — calling it
//     again for the same admission returns the same invoice and charges nothing (and the invoice number is also the bank
//     request reference, which BankService refuses to process twice)
//   • unaffordable bills: HOSPITAL_BILLING.debtPolicy
//       'debt'  — the account pays what it can, the rest is outstanding medical debt (account.debt), settled automatically
//                 from the player's next deposit (BankService.onDeposit → settleDebt)
//       'cash'  — the rest is taken from cash in hand at the cashier (Story.pay), anything still unpaid becomes debt
//       'waive' — the rest is written off by the hospital (shown on the invoice)
import { rs } from './Bank.js';

export const HOSPITAL_BILLING = {
  hospital: 'National Hospital Colombo', short: 'NH', address: 'Malay Street, Colombo',
  treatment: 3500, // emergency treatment + observation
  medicines: 1500, // pharmacy: discharge medicines
  ambulance: 0, // 1990 Suwa Seriya — free service (kept as a line on the invoice)
  debtPolicy: 'debt', // 'debt' | 'cash' | 'waive'
  invoicesKept: 12,
};

export function hospitalState(S) {
  let h = S.hospital;
  if (!h || typeof h !== 'object' || h.v !== 1) h = S.hospital = { v: 1, seq: 0, open: null, invoices: [], admissions: 0, lastLine: -1 };
  if (!Array.isArray(h.invoices)) h.invoices = []; if (!Number.isFinite(h.seq)) h.seq = 0; if (!Number.isFinite(h.lastLine)) h.lastLine = -1;
  return h;
}
// open an admission (death / collapse / ambulance). Returns its id — the key the invoice is issued against.
export function admit(S) { const h = hospitalState(S); h.seq++; h.admissions = (h.admissions | 0) + 1; h.open = 'A' + h.seq; return h.open; }

const pad = (n, k) => String(Math.max(0, n | 0)).padStart(k, '0');
// issue (once) and charge the invoice for admission rid. opts: { ambulance, cause, config }
export function billRecovery(game, rid, opts = {}) {
  const S = game.story.state, h = hospitalState(S), C = Object.assign({}, HOSPITAL_BILLING, opts.config || {});
  const had = h.invoices.find((i) => i.rid === rid); if (had) return { invoice: had, duplicate: true }; // never a second invoice / charge
  const A = game.atmos; const day = A && Number.isFinite(A.day) ? A.day : 1, time = A && A.timeString ? A.timeString : '';
  const no = `${C.short}-${pad(day, 3)}-${pad(h.seq * 7919 % 100000 || h.seq, 5)}`;
  const items = [['Emergency treatment & observation', C.treatment], ['Medicines (pharmacy)', C.medicines]];
  if (opts.ambulance) items.push(['Ambulance — 1990 Suwa Seriya', C.ambulance]);
  const total = items.reduce((a, [, n]) => a + Math.max(0, Math.round(n)), 0);
  const inv = { no, rid, hospital: C.hospital, address: C.address, day, time, cause: opts.cause || '', ambulance: !!opts.ambulance, items: items.map(([label, amount]) => ({ label, amount: Math.max(0, Math.round(amount)) })), total, paidBank: 0, paidCash: 0, waived: 0, outstanding: 0, status: 'Paid' };
  h.invoices.unshift(inv); if (h.invoices.length > C.invoicesKept) h.invoices.length = C.invoicesKept; if (h.open === rid) h.open = null;
  const bank = game.bank; let left = total;
  if (bank && left > 0) {
    const bal = bank.account.balance; const take = Math.min(left, bal);
    if (take > 0) { const r = bank.transact({ kind: 'medical', amount: take, ref: no, channel: 'Hospital', invoice: no, memo: `${C.hospital} — invoice ${no}` }); if (r.ok) { inv.paidBank = take; left -= take; } }
  }
  if (left > 0 && C.debtPolicy === 'cash') { const cash = Math.max(0, Math.floor(S.money)); const take = Math.min(left, cash); if (take > 0) { game.story.pay(-take, `${C.hospital} — cashier, invoice ${no}`, { quiet: true }); inv.paidCash = take; left -= take; } }
  if (left > 0 && C.debtPolicy === 'waive') { inv.waived = left; left = 0; }
  if (left > 0) {
    inv.outstanding = left;
    if (bank) { const a = bank.account; a.debt = Math.min((a.debt | 0) + left, 999999999); const { day: d, time: t } = bank.clock(); bank.record({ id: ++a.seq, type: 'medical', amount: left, result: 'outstanding', reason: 'Insufficient funds — outstanding medical bill', day: d, time: t, balance: a.balance, channel: 'Hospital', invoice: no, memo: `${C.hospital} — ${no} (unpaid)` }); }
  }
  inv.status = inv.outstanding ? (inv.paidBank || inv.paidCash ? 'Part paid — balance outstanding' : 'Outstanding (medical debt)') : inv.waived ? (inv.paidBank || inv.paidCash ? 'Part paid — balance waived' : 'Waived') : 'Paid';
  return { invoice: inv, duplicate: false };
}
// an outstanding bill is paid from the account as soon as money is there (called after a deposit — BankService.onDeposit)
export function settleDebt(game) {
  const bank = game.bank; if (!bank) return 0; const a = bank.account; const h = hospitalState(game.story.state);
  const amt = Math.min(a.debt | 0, a.balance); if (amt <= 0) return 0;
  const ref = `${HOSPITAL_BILLING.short}-SETTLE-${h.seq}-${a.seq + 1}`;
  const r = bank.apply({ kind: 'medical', amount: amt, ref, channel: 'Hospital', invoice: ref, memo: `${HOSPITAL_BILLING.hospital} — outstanding bill settled` });
  if (!r.ok) return 0; a.debt -= amt; let rest = amt;
  for (let i = h.invoices.length - 1; i >= 0 && rest > 0; i--) { const inv = h.invoices[i]; if (!inv.outstanding) continue; const k = Math.min(rest, inv.outstanding); inv.outstanding -= k; inv.paidBank += k; rest -= k; if (!inv.outstanding) inv.status = 'Paid (settled later)'; }
  return amt;
}
export function invoiceText(inv) {
  const L = [`${inv.hospital} — Invoice ${inv.no}`, `Day ${inv.day}${inv.time ? ' · ' + inv.time : ''}`];
  for (const it of inv.items) L.push(`${it.label}: ${it.amount ? rs(it.amount) : 'free'}`);
  L.push(`Total: ${rs(inv.total)}`);
  if (inv.paidBank) L.push(`Charged to your Ceylon Meridian Bank account: ${rs(inv.paidBank)}`);
  if (inv.paidCash) L.push(`Paid in cash at the cashier: ${rs(inv.paidCash)}`);
  if (inv.waived) L.push(`Waived by the hospital: ${rs(inv.waived)}`);
  if (inv.outstanding) L.push(`Outstanding (paid from your next deposit): ${rs(inv.outstanding)}`);
  L.push(`Status: ${inv.status}`); return L.join('\n');
}
