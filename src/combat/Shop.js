// Gun shop catalogue and purchase rules (pure: no DOM, no three.js — unit-tested in tools/shop-test.mjs).
// Prices are in Sri Lankan rupees on the game's own economy scale (mission rewards Rs. 1,000–50,000), not real-world prices.
// A purchase writes into the ACTIVE character's inventory (each protagonist owns his own weapons); money is the shared purse.
import { WEAPONS } from './WeaponDefs.js';

export const SHOP_NAME = 'Ceylon Arms Co.';
export const CATEGORIES = [
  { id: 'pistol', label: 'Handguns' },
  { id: 'rifle', label: 'Rifles' },
  { id: 'sniper', label: 'Marksman' },
  { id: 'ammo', label: 'Ammunition' },
];
// weapon price, short shop-counter description (original copy), and the price of one magazine's worth of rounds
export const STOCK = {
  compact:   { price: 4500,  ammo: 380,  blurb: 'Small, light and easy to carry. Ten rounds, quick to draw — a sensible first purchase.' },
  service:   { price: 6500,  ammo: 450,  blurb: 'Full-size duty pistol. Fifteen-round magazine, steady and forgiving.' },
  heavy:     { price: 11000, ammo: 600,  blurb: 'Hard-hitting large-frame pistol. Eight rounds, heavy recoil.' },
  carbine:   { price: 26000, ammo: 1100, blurb: 'Short, fast-handling rifle. High rate of fire, easy to control in close quarters.' },
  assault:   { price: 32000, ammo: 1150, blurb: 'Standard-length automatic rifle. A balance of reach, power and control.' },
  battle:    { price: 41000, ammo: 1400, blurb: 'Full-power rifle cartridge. Twenty rounds, long reach, punishing recoil.' },
  bolt:      { price: 30000, ammo: 1500, blurb: 'Bolt-action marksman rifle with a 5× scope. One deliberate shot at a time.' },
  semi:      { price: 47000, ammo: 1800, blurb: 'Self-loading marksman rifle, 4× scope. Ten rounds, quick follow-up shots.' },
  precision: { price: 62000, ammo: 2200, blurb: 'Long-range precision rifle with a 7× scope. Very stable, slow to cycle.' },
};
export const reserveCap = (w) => w.reserve * 2; // spare rounds a character can carry for one weapon

export function catalogue() {
  const out = [];
  WEAPONS.forEach((w, i) => out.push({ key: 'w:' + w.id, kind: 'weapon', cat: w.cls, slot: i, w, name: w.name, price: STOCK[w.id].price, blurb: STOCK[w.id].blurb }));
  WEAPONS.forEach((w, i) => out.push({ key: 'a:' + w.id, kind: 'ammo', cat: 'ammo', slot: i, w, name: `${w.name} rounds`, qty: w.mag, price: STOCK[w.id].ammo, blurb: `One magazine's worth (${w.mag} rounds) for the ${w.name}. You can carry up to ${reserveCap(w)} spare rounds.` }));
  return out;
}
// 0..1 bars for the stat panel
export function stats(w) {
  const c = (v) => Math.max(0.04, Math.min(1, v));
  return [['Damage', c(w.dmg / 3)], ['Fire rate', c(w.rof / 11)], ['Range', c(w.range / 800)], ['Accuracy', c(1 - w.spread / 0.013)], ['Control', c(1 - w.recoil / 0.075)]];
}
// what the buy button would do, without doing it
export function quote(item, inv, money, opts = {}) {
  const slot = inv[item.slot];
  if (opts.wanted) return { ok: false, why: 'The shop will not serve anyone the police are looking for.' };
  if (item.kind === 'weapon') {
    if (slot.owned) return { ok: false, owned: true, why: 'Already owned' };
    if (money < item.price) return { ok: false, why: 'Not enough money' };
    return { ok: true, cost: item.price };
  }
  if (!slot.owned) return { ok: false, why: `Buy the ${item.w.name} first` };
  const room = reserveCap(item.w) - slot.reserve; if (room <= 0) return { ok: false, full: true, why: 'Carrying the maximum' };
  const n = Math.min(item.qty, room), cost = Math.round(item.price * n / item.qty);
  if (money < cost) return { ok: false, why: 'Not enough money' };
  return { ok: true, cost, rounds: n };
}
// apply a purchase: mutates the inventory slot, returns { ok, cost, msg }. The caller takes the money (Story.pay(-cost)).
export function purchase(item, inv, money, opts = {}) {
  const q = quote(item, inv, money, opts); if (!q.ok) return { ok: false, cost: 0, msg: q.why };
  const slot = inv[item.slot];
  if (item.kind === 'weapon') { slot.owned = true; slot.mag = item.w.mag; slot.reserve = item.w.mag * 2; return { ok: true, cost: q.cost, msg: `${item.w.name} bought — comes with ${item.w.mag * 2} spare rounds`, weapon: true }; }
  slot.reserve += q.rounds; return { ok: true, cost: q.cost, msg: `+${q.rounds} rounds for the ${item.w.name}` };
}
