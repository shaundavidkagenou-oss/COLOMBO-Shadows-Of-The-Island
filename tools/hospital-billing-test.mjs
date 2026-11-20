// 74th: hospital billing through the existing bank API (node, no browser).
//   node tools/hospital-billing-test.mjs
import { BankService, normalizeAccount } from '../src/story/Bank.js';
import { HOSPITAL_BILLING, hospitalState, admit, billRecovery, settleDebt, invoiceText } from '../src/story/HospitalBilling.js';
import { RECOVERY_LINES, HOSPITAL_SOUND_DEFS } from '../src/audio/HospitalSoundDefs.js';

let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function mkGame(money, balance) {
  const g = { atmos: { day: 12, timeString: '10:42' }, skills: null };
  g.story = { state: { money, bank: null, ledger: [] }, pay(n, why) { this.state.money += n; this.state.ledger.unshift({ n, why }); } };
  g.bank = new BankService(g); g.bank.account.balance = balance; g.bank.onDeposit = () => settleDebt(g); return g;
}
const TOTAL = HOSPITAL_BILLING.treatment + HOSPITAL_BILLING.medicines;
{ // 1. affordable: charged once to the account, recorded with the invoice number, cash untouched
  const g = mkGame(800, 20000); const rid = admit(g.story.state); const r = billRecovery(g, rid, { cause: 'shot' });
  const inv = r.invoice; const a = g.bank.account;
  ok(inv.total === TOTAL && inv.status === 'Paid' && inv.paidBank === TOTAL, 'paid in full ' + JSON.stringify(inv));
  ok(a.balance === 20000 - TOTAL && g.story.state.money === 800, 'balance debited, cash untouched');
  ok(a.history[0].type === 'medical' && a.history[0].invoice === inv.no && a.history[0].result === 'completed', 'history entry');
  ok(/^NH-012-\d{5}$/.test(inv.no), 'invoice number format ' + inv.no);
  const r2 = billRecovery(g, rid, {}); ok(r2.duplicate && r2.invoice === inv && a.balance === 20000 - TOTAL && a.history.length === 1, 'no duplicate charge for the same admission');
  ok(hospitalState(g.story.state).invoices.length === 1, 'one invoice');
  // replay of the bank request itself (same reference) is refused
  const rr = g.bank.transact({ kind: 'medical', amount: TOTAL, ref: inv.no, channel: 'Hospital' }); ok(!rr.ok && rr.code === 'duplicate', 'bank refuses a replayed invoice ref');
  const rid2 = admit(g.story.state); const r3 = billRecovery(g, rid2, { ambulance: true }); ok(r3.invoice.no !== inv.no && r3.invoice.items.length === 3, 'second admission → its own invoice');
  ok(invoiceText(inv).includes(inv.no) && invoiceText(inv).includes('Total'), 'invoice text');
  // survives a save round trip
  const back = normalizeAccount(JSON.parse(JSON.stringify(a))); ok(back.history.filter((e) => e.type === 'medical').length === 2, 'medical entries survive normalizeAccount');
}
{ // 2. unaffordable, policy debt: partial charge + outstanding debt, settled by the next deposit
  const g = mkGame(9000, 1200); const rid = admit(g.story.state); const inv = billRecovery(g, rid, {}).invoice; const a = g.bank.account;
  ok(inv.paidBank === 1200 && inv.outstanding === TOTAL - 1200 && a.balance === 0 && a.debt === TOTAL - 1200, 'partial + debt ' + JSON.stringify(inv));
  ok(a.history[0].result === 'outstanding' && a.history[1].result === 'completed', 'debt recorded in history');
  ok(normalizeAccount(JSON.parse(JSON.stringify(a))).debt === a.debt, 'debt persists');
  const d = g.bank.transact({ kind: 'deposit', amount: 8000, ref: 'dep1', channel: 'ATM' }); ok(d.ok, 'deposit ok');
  ok(a.debt === 0 && a.balance === 8000 - (TOTAL - 1200) && g.story.state.money === 1000, 'debt settled from the deposit ' + a.balance);
  ok(inv.outstanding === 0 && /settled/.test(inv.status), 'invoice marked settled');
  ok(g.story.state.money + a.balance === 9000 + 1200 - TOTAL, 'money conserved');
}
{ // 3. policy cash / waive
  const g = mkGame(3000, 1000); const inv = billRecovery(g, admit(g.story.state), { config: { debtPolicy: 'cash' } }).invoice;
  ok(inv.paidBank === 1000 && inv.paidCash === 3000 && inv.outstanding === TOTAL - 4000 && g.story.state.money === 0, 'cash policy ' + JSON.stringify(inv));
  const g2 = mkGame(3000, 0); const inv2 = billRecovery(g2, admit(g2.story.state), { config: { debtPolicy: 'waive' } }).invoice;
  ok(inv2.waived === TOTAL && inv2.status === 'Waived' && g2.bank.account.debt === 0 && g2.story.state.money === 3000, 'waive policy');
}
{ // 4. data
  ok(RECOVERY_LINES.length === 4 && RECOVERY_LINES[0].text === "Easy... you're at the hospital. Take your time getting up." && RECOVERY_LINES[3].text === "Welcome back. Your treatment is complete. We've processed your hospital bill.", 'the four lines');
  const ids = HOSPITAL_SOUND_DEFS.map((d) => d.id); ok(new Set(ids).size === ids.length && ids.every((i) => i.startsWith('hosp.')) && HOSPITAL_SOUND_DEFS.every((d) => d.cat === 'Hospital'), 'hospital sound defs');
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
