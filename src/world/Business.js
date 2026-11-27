// The working day of the city (features 13/14/15/34/35/47/57/59). Every shop front in the plan is one business: a trade,
// its own opening and closing hour, and a demand curve through the day. The crowd asks this before it chooses an errand, so
// Colombo actually changes shape: the produce market is busy at seven, the offices at nine, the cafes at lunch, the textile
// shops in the evening, the shutters are down and the pavements quiet after ten. Nothing here draws anything — it is the
// arithmetic the street life is built on, which is why it costs almost nothing per frame.
//
//  · hours are deterministic per business (building id + seed), so the same shop keeps the same hours in every session and
//    after a save; a small daily variation (weekday / Poya-Sunday) is derived from the day number, never stored.
//  · a shop that is shut still exists in the world; people simply do not plan an errand to it. A few people peer in at the
//    window instead (the 'look' act), which is what a closed street looks like.
//  · queue geometry: where the line stands for each served counter. Computed once per business, from the pavement around
//    it (never across a carriageway, never through a wall), and cached on the point of interest.
import { RNG } from '../core/rng.js';
import * as L from './Layout.js';

// Hours are in-game clock hours. `peak` windows raise footfall to 1; `base` is the quiet-time level between them.
const TRADES = {
  produce: { open: 5.5, close: 14.5, base: 0.55, peak: [[6, 9.5], [15.5, 18.5]], queue: 4, closed: 0.02 },
  cafe: { open: 6.5, close: 22.5, base: 0.4, peak: [[7, 9.5], [12, 14], [17.5, 21]], queue: 3, closed: 0.02 },
  textile: { open: 9, close: 20, base: 0.35, peak: [[10.5, 13], [16.5, 19.5]], queue: 2, closed: 0.08 },
  electronics: { open: 10, close: 19.5, base: 0.3, peak: [[11, 13.5], [16.5, 19]], queue: 2, closed: 0.06 },
  shutter: { open: 8, close: 18.5, base: 0.35, peak: [[9, 12], [15.5, 18]], queue: 2, closed: 0.15 },
  office: { open: 7.5, close: 17.75, base: 0.5, peak: [[8.25, 10], [16.5, 17.75]], queue: 0, closed: 0.02 },
  lobby: { open: 6.5, close: 20, base: 0.45, peak: [[8, 10], [17, 19]], queue: 0, closed: 0 },
  home: { open: 0, close: 0, base: 0, peak: [], queue: 0, closed: 0 },
};
// pavement vendors keep their own, longer day (they are their own boss)
const VENDOR = { cart: { open: 6, close: 22.5, base: 0.5, peak: [[11, 14.5], [17, 21]], queue: 5 }, stall: { open: 5.5, close: 19, base: 0.55, peak: [[7, 10], [15, 18]], queue: 3 } };

export const TRADE_IDS = Object.keys(TRADES);
export const tradeLabel = (k) => ({ produce: 'market stall', cafe: 'cafe', textile: 'textile shop', electronics: 'electronics shop', shutter: 'shop', office: 'office', lobby: 'lobby', home: 'house' }[k] || 'shop');

const isWeekend = (day) => ((day | 0) % 7) === 0; // day 1 is a Sunday (CityEventCatalog calendar)
const PH = (h) => (h + 24) % 24;

export class BusinessDay {
  constructor(seed = 1) { this.seed = seed | 0; this.cache = new Map(); this.hour = 12; this.day = 1; this.rain = 0; this.stats = { open: 0, shut: 0, planned: 0, queued: 0 }; }
  reset(seed = 1) { this.cache.clear(); this.seed = seed | 0; }
  get weekend() { return isWeekend(this.day); }
  // deterministic hours of one business, cached (a shop keeps its hours for the whole session)
  hours(q) {
    const k = this.seed + '|' + (q.b ?? (Math.round(q.x) + ',' + Math.round(q.z)));
    let h = this.cache.get(k); if (h) return h;
    const r = new RNG(((q.b ?? 0) * 2654435761 + this.seed * 40503) >>> 0);
    const trade = q.type === 'vendor' ? (q.cart ? 'cart' : 'stall') : (q.kind && TRADES[q.kind] ? q.kind : 'shutter');
    const T = q.type === 'vendor' ? VENDOR[q.cart ? 'cart' : 'stall'] : TRADES[trade];
    let open = T.open + (r.next() - 0.5) * 1.4, close = T.close + (r.next() - 0.5) * 1.6;
    open = PH(open); close = PH(close); if (close <= open) close = open + 8;
    const r0 = r.next(); const closedToday = r0 < T.closed; const shuts = r.next() < 0.22 ? open + 5 + r.next() * 3 : null; // a midday closing (traditional shop hours)
    h = { trade, open, close, shuts, closedToday, T, seed: Math.floor(r.next() * 1e6) };
    this.cache.set(k, h); return h;
  }
  // A shop's day for a given date: shops shut on the weekend are the offices and a share of the rest; the market is at its
  // busiest on a Sunday morning. Derived, not stored.
  dayModel(q) { const h = this.hours(q); if (h.closedToday) return { ...h, open: 0, close: -1 }; if (!this.weekend) return h; const office = h.trade === 'office' || h.trade === 'lobby'; if (office) return { ...h, open: 0, close: -1 }; return h; }
  isOpen(q) { const m = this.dayModel(q); const h = this.hour; if (m.open === 0 && m.close === -1) return false; if (m.shuts !== null && h >= m.shuts && h < m.shuts + 0.75) return false; return PH(h) >= m.open && PH(h) < m.close; }
  // 0 (shut) … 1 (as busy as it gets): how much of a magnet this place is at this hour
  footfall(q) {
    if (!this.isOpen(q)) return 0; const m = this.dayModel(q), h = PH(this.hour), T = m.T;
    if (m.shuts !== null && h >= m.shuts - 0.5 && h < m.shuts) return 0.3; // last few customers before the break
    let v = T.base; const edge = Math.min(h - m.open, m.close - h);
    if (edge < 0.75) v = Math.min(v, 0.32 + 0.68 * (edge / 0.75));
    for (const [a, b] of T.peak) if (h >= a && h < b) v = Math.max(v, 1);
    if (this.weekend && m.trade === 'produce') v = Math.max(v, h >= 6 && h < 11 ? 1 : v); // Sunday market rush
    if (this.rain > 0.4) v *= 0.72; // people stay in when it pours
    return v;
  }
  // Weight for "someone decides to go here now". Shut: zero. Open but closing: still some. A queue already at the door
  // dampens it (the crowd spreads out over the street instead of all heading for the same counter).
  weight(q) { const f = this.footfall(q); if (f <= 0) return 0; return f * (0.35 + 0.9 * f); }
  // how many people can stand in this counter's line
  queueCap(q) { if (q.type !== 'shop' && q.type !== 'vendor') return 1; const T = q.type === 'vendor' ? VENDOR[q.cart ? 'cart' : 'stall'] : this.dayModel(q).T; return Math.max(1, T.queue | 0); }
  // the trade's label, for the pause map / debug
  label(q) { return q.type === 'vendor' ? (q.cart ? 'pavement vendor' : 'market stall') : tradeLabel(this.hours(q).trade); }
  // is it the moment a given trade is at its peak (used by the director for traffic / sound)
  peakNow(trade) { const h = PH(this.hour); const T = TRADES[trade]; if (!T) return 0; let v = 0; for (const [a, b] of T.peak) if (h >= a && h < b) v = 1; return v; }
  serialize() { return { v: 1, seed: this.seed, day: this.day | 0 }; }
  restore(d) { if (!d) return; this.seed = d.seed | 0; this.cache.clear(); }
}

// ------------------------------------------------------------------------------------------------ queue geometry
// Where the line stands for a served counter. The front slot is the point of interest itself (the counter); the rest of the
// line runs along the most open pavement direction found around it, one body apart, so a queue never stands in the road,
// inside a wall or across a junction. Cached on the POI; computed once, only for counters people actually queue at.
const _dirs = [];
for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; _dirs.push([Math.sin(a), Math.cos(a)]); }
const clear = (C, x, z) => !(C && C.blocked && C.blocked(x, z, 0.3)) && !(L.roadAt && L.roadAt(x, z));
export function queueSlots(q, C, n) {
  if (q._qs) return q._qs;
  n = Math.max(1, Math.min(6, n | 0)); const gap = 0.78;
  let best = null, bestLen = 0;
  for (const [dx, dz] of _dirs) {
    const pts = [];
    for (let i = 1; i < n; i++) { const x = q.x + dx * (0.9 + (i - 1) * gap), z = q.z + dz * (0.9 + (i - 1) * gap); if (!clear(C, x, z)) break; pts.push({ x, z }); }
    if (pts.length > bestLen) { bestLen = pts.length; best = pts; }
    if (bestLen === n - 1) break;
  }
  // the front of the line is the counter itself, whatever the pavement looks like behind it; the rest of the line is only
  // as long as the pavement actually allows (a stall against a wall serves one at a time, which is also true in Pettah)
  const out = [{ x: q.x, z: q.z }, ...(best || [])];
  q._qs = out; q._qc = out.length; return out;
}
