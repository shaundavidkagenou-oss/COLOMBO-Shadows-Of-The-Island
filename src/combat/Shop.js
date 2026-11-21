// Gun shop catalogue and purchase rules (pure: no DOM, no three.js — unit-tested in tools/shop-test.mjs).
// Prices are in Sri Lankan rupees on the game's own economy scale (mission rewards Rs. 1,000–50,000), not real-world prices.
// A purchase writes into the ACTIVE character's inventory (each protagonist owns his own weapons); money is the shared purse.
import { WEAPONS, WEAPON_TYPES, WEAPONS_OF_TYPE } from './WeaponDefs.js';

export const SHOP_NAME = 'Ceylon Arms Co.';
export const CATEGORIES = [
  { id: 'pistol', label: 'Handguns' },
  { id: 'rifle', label: 'Rifles' },
  { id: 'sniper', label: 'Marksman' },
  { id: 'ammo', label: 'Ammunition' },
  { id: 'explosive', label: 'Explosives' },
];
// hand grenades: not a weapon slot — a separate throwable (key B), counted per character (Squad member .grenades)
export const GRENADE = { id: 'frag', name: 'Fragmentation grenade', cls: 'explosive', fuse: 4 };
export const GRENADE_CAP = 6;
// weapon price, short shop-counter description (original copy), and the price of one magazine's worth of rounds
export const STOCK = {
  // compact pistols
  compact:   { price: 4500,  ammo: 380,  blurb: 'Soviet-pattern 9×18 mm double-action pistol. Eight rounds, simple and dependable — a sensible first purchase.' },
  psm:       { price: 5200,  ammo: 360,  blurb: 'Very flat 5.45 mm pistol made to be carried unseen. Eight small, fast rounds; mild recoil.' },
  m11:       { price: 7400,  ammo: 420,  blurb: 'Compact 9 mm issued to aircrew and investigators. Thirteen rounds in a short, easy-to-hide frame.' },
  // service pistols
  service:   { price: 6500,  ammo: 450,  blurb: 'Full-size 9 mm duty pistol with the open-top slide. Fifteen rounds, steady and forgiving.' },
  m17:       { price: 8200,  ammo: 470,  blurb: 'Modular striker-fired 9 mm service pistol in coyote finish. Seventeen rounds, crisp trigger.' },
  type54:    { price: 5800,  ammo: 420,  blurb: 'Old-pattern 7.62×25 mm pistol. Only eight rounds, but they are fast and hit hard; sharp recoil.' },
  // heavy pistols
  heavy:     { price: 11000, ammo: 600,  blurb: 'The classic .45 ACP single-action pistol. Seven rounds, heavy recoil, one-shot stopping power.' },
  mk23:      { price: 15500, ammo: 680,  blurb: 'Big special-operations .45 pistol. Twelve rounds, very accurate, a lot of gun to carry.' },
  m45a1:     { price: 13800, ammo: 640,  blurb: 'Modern close-quarters .45 on the classic frame, with a rail and night sights. Seven rounds.' },
  // carbines
  carbine:   { price: 26000, ammo: 1100, blurb: 'Standard 5.56 mm carbine with carry handle and collapsible stock. Fast-handling and easy to control.' },
  mk18:      { price: 31000, ammo: 1120, blurb: 'Short-barrelled 5.56 mm close-quarters carbine with a quad rail and holographic sight. Very high rate of fire.' },
  aks74u:    { price: 24000, ammo: 1050, blurb: 'Tiny 5.45 mm carbine with a folding stock. Loud and lively, made for vehicles and tight rooms.' },
  // assault rifles
  assault:   { price: 32000, ammo: 1150, blurb: 'The wood-stocked 7.62×39 mm automatic rifle. Reliable in any weather, hits hard, climbs a little.' },
  type56:    { price: 30000, ammo: 1150, blurb: 'Type 56 7.62×39 mm rifle — the pattern carried across the island. Wooden furniture, rugged, automatic.' },
  ak74m:     { price: 36000, ammo: 1100, blurb: 'Modern 5.45 mm assault rifle with black polymer furniture, side-folding stock and an effective muzzle brake. Flat-shooting.' },
  // battle rifles
  battle:    { price: 41000, ammo: 1400, blurb: 'Full-power 7.62×51 mm rifle with a walnut stock. Twenty rounds, long reach, punishing recoil on automatic.' },
  l1a1:      { price: 39000, ammo: 1400, blurb: '7.62×51 mm self-loading rifle, semi-automatic only. Accurate, powerful and deliberate.' },
  g3a3:      { price: 43000, ammo: 1450, blurb: 'Roller-delayed 7.62×51 mm battle rifle. Twenty rounds, slim handguard, very hard-hitting.' },
  // bolt-action sniper rifles
  bolt:      { price: 30000, ammo: 1500, blurb: 'Bolt-action 7.62×51 mm sniper rifle with a fixed 10× scope. One deliberate shot at a time.' },
  m40a5:     { price: 36000, ammo: 1550, blurb: 'Precision bolt-action 7.62×51 mm rifle in a fibreglass stock, detachable magazine, adjustable cheek piece.' },
  m9130:     { price: 22000, ammo: 1300, blurb: 'Historic 7.62×54R mm sniper rifle with a short side-mounted scope. Long, heavy and surprisingly accurate.' },
  // semi-automatic sniper rifles
  semi:      { price: 47000, ammo: 1800, blurb: 'Self-loading 7.62×54R mm marksman rifle with a 4× scope and skeleton stock. Ten rounds, quick follow-up shots.' },
  m110:      { price: 56000, ammo: 1850, blurb: 'Semi-automatic 7.62×51 mm sniper system with a free-float rail, bipod and a twenty-round magazine.' },
  mk14:      { price: 52000, ammo: 1800, blurb: 'Battle-rifle action in an aluminium chassis with rails, bipod and scope. Twenty rounds, fast on target.' },
  // precision / anti-materiel rifles
  precision: { price: 62000, ammo: 2200, blurb: 'Long-range .300 Win Mag precision rifle with suppressor, folding stock and a large scope. Very stable.' },
  l115a3:    { price: 74000, ammo: 2600, blurb: '.338 long-range rifle with a folding thumbhole stock and 8× optic. Reaches further than anything else in the shop.' },
  m107:      { price: 98000, ammo: 3400, blurb: '.50 calibre semi-automatic anti-materiel rifle. Ten enormous rounds — stops vehicles, deafens everyone.' },
};
export const reserveCap = (w) => w.reserve * 2; // spare rounds a character can carry for one weapon

export function catalogue() {
  const out = [];
  const order = WEAPON_TYPES.flatMap((t) => WEAPONS_OF_TYPE[t.id]); // grouped by type: the three of each kind side by side
  order.forEach((i) => { const w = WEAPONS[i]; out.push({ key: 'w:' + w.id, kind: 'weapon', cat: w.cls, slot: i, w, name: w.name, price: STOCK[w.id].price, blurb: STOCK[w.id].blurb }); });
  order.forEach((i) => { const w = WEAPONS[i]; out.push({ key: 'a:' + w.id, kind: 'ammo', cat: 'ammo', slot: i, w, name: `${w.name} rounds`, qty: w.mag, price: STOCK[w.id].ammo, blurb: `One magazine's worth (${w.mag} rounds) for the ${w.name}. You can carry up to ${reserveCap(w)} spare rounds.` }); });
  out.push({ key: 'g:frag', kind: 'grenade', cat: 'explosive', slot: null, w: GRENADE, name: 'Fragmentation grenade', qty: 1, price: 3500, blurb: `Hand grenade with a ${GRENADE.fuse}-second fuze. Pull the pin, throw, take cover: lethal within a few metres, dangerous well beyond. Carry up to ${GRENADE_CAP}.` });
  out.push({ key: 'g:frag3', kind: 'grenade', cat: 'explosive', slot: null, w: GRENADE, name: 'Fragmentation grenades ×3', qty: 3, price: 9900, blurb: `Three grenades in a canvas pouch, a little cheaper than buying them one by one. Tops you up if you are already carrying some (up to ${GRENADE_CAP}).` });
  return out;
}
// 0..1 bars for the stat panel
export function stats(w) {
  const c = (v) => Math.max(0.04, Math.min(1, v));
  return [['Damage', c(w.dmg / 3)], ['Fire rate', c(w.rof / 11)], ['Range', c(w.range / 800)], ['Accuracy', c(1 - w.spread / 0.013)], ['Control', c(1 - w.recoil / 0.075)]];
}
// what the buy button would do, without doing it
export function quote(item, inv, money, opts = {}) {
  if (opts.wanted) return { ok: false, why: 'The shop will not serve anyone the police are looking for.' };
  if (item.kind === 'grenade') { // opts.grenades = how many the active character carries
    const room = GRENADE_CAP - (opts.grenades | 0); if (room <= 0) return { ok: false, full: true, why: 'Carrying the maximum' };
    const n = Math.min(item.qty, room), cost = Math.round(item.price * n / item.qty); if (money < cost) return { ok: false, why: 'Not enough money' };
    return { ok: true, cost, count: n };
  }
  const slot = inv[item.slot];
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
  if (item.kind === 'grenade') { const total = (opts.grenades | 0) + q.count; return { ok: true, cost: q.cost, grenades: total, msg: `+${q.count} grenade${q.count > 1 ? 's' : ''} — carrying ${total}` }; } // caller stores the count
  const slot = inv[item.slot];
  if (item.kind === 'weapon') { slot.owned = true; slot.mag = item.w.mag; slot.reserve = item.w.mag * 2; return { ok: true, cost: q.cost, msg: `${item.w.name} bought — comes with ${item.w.mag * 2} spare rounds`, weapon: true }; }
  slot.reserve += q.rounds; return { ok: true, cost: q.cost, msg: `+${q.rounds} rounds for the ${item.w.name}` };
}
