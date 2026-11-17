// Global browser: the marine sites (all fictional businesses): a yacht broker (the 5 luxury yachts), a boat dealer (the 10
// boats), a jet ski dealer (the 4 personal watercraft) and Fort Harbour Marina (the berth you need before anything is
// delivered). A boat's page shows its spec; "Buy" goes to a checkout; the order is placed by boats/Boats.js (money, the
// "thanks for your purchase" text, delivery to your berth after you sleep or the next day).
import { BOATS, YACHT_IDS, BOAT_IDS, JETSKI_IDS, boatName } from '../boats/BoatCatalog.js';
import { boatModel } from '../boats/BoatModels.js';
import { MARINA } from '../boats/Marina.js';
import { BOAT_COMPANY } from '../boats/Boats.js';
import { esc } from './GlobalSites.js';

const rs = (n) => `Rs. ${Math.round(n).toLocaleString('en-LK')}`;
const kn = (ms) => Math.round(ms * 1.944);
export const MARINE_SHOPS = {
  yacht: { id: 'yachts', url: 'ceylonblueyachts.lk', name: BOAT_COMPANY.yacht, tag: 'Yacht brokers', col: '#0f2f52', icon: '⛵', ids: YACHT_IDS, sub: 'New-build luxury yachts · delivered to your berth', kw: 'yacht yachts sailing sail catamaran superyacht motor yacht flybridge luxury broker cruiser buy boat' },
  boat: { id: 'boats', url: 'lankamarinemart.lk', name: BOAT_COMPANY.boat, tag: 'Boat dealer', col: '#1d6f8f', icon: '🚤', ids: BOAT_IDS, sub: 'Powerboats, day boats, RIBs and sailing dinghies', kw: 'boat boats speedboat powerboat rib inflatable fishing centre console bowrider wakeboard offshore daysailer trawler oruwa outrigger buy dealer marine' },
  jetski: { id: 'jetskis', url: 'waveriderlanka.lk', name: BOAT_COMPANY.jetski, tag: 'Jet skis', col: '#c4401a', icon: '🌊', ids: JETSKI_IDS, sub: 'Personal watercraft · stand-up and sit-down', kw: 'jet ski jetski jet-ski pwc personal watercraft waverunner wave rider sea scooter buy' },
};
// spec card for one boat
function spec(id) { const d = BOATS[id]; const M = boatModel(id);
  const eng = M.ski ? 'Jet drive' : d.sail ? 'Sails + auxiliary diesel' : ['cc', 'rib', 'offshore', 'bowrider'].includes(d.layout) ? 'Outboard' : 'Inboard diesel';
  return `<div class="ms-card"><div class="ms-k">${esc(d.kind)}</div><h3>${esc(boatName(id))}</h3><div class="ms-price">${rs(d.price)}</div>
    <div class="ms-grid"><span>Length</span><b>${M.len.toFixed(1)} m</b><span>Beam</span><b>${(M.halfBeam * 2).toFixed(1)} m</b><span>Top speed</span><b>${kn(d.max)} kn</b><span>Propulsion</span><b>${eng}</b><span>Hull</span><b>${d.hp} pts</b><span>Delivery</span><b>Next day</b></div>
    <p>${esc(d.blurb || '')}</p></div>`; }
export function marineSites() {
  const shop = (S) => ({ id: S.id, url: S.url, name: S.name, tag: S.tag, col: S.col, icon: S.icon, kw: S.kw, marine: S,
    page(g) { const B = g.boats; const st = B ? B.state() : { slip: false };
      const head = `<div class="gs-mast" style="--c:${S.col}">${esc(S.name.toUpperCase())}<small>${esc(S.sub)}</small></div>` + (st.slip ? '' : `<p class="gs-p ms-warn">Delivery goes to your berth. You need one first: <b>${esc(MARINA.slipName)}</b> is for sale at ${esc(MARINA.name)} — buy it in person at the berth's For Sale sign on the T-head (or the marina office).</p>`);
      const rows = S.ids.map((id) => { const own = B && B.owns(id); return { t: `${boatName(id)} — ${rs(BOATS[id].price)}${own ? ' · owned' : ''}`, s: `${BOATS[id].kind} · ${kn(BOATS[id].max)} kn`, go: { id: 'mboat', boat: id, site: S.id } }; });
      if (!st.slip) rows.push({ t: `⚓ ${MARINA.name} — berth for sale (buy it at the marina)`, s: 'fortharbourmarina.lk', go: { id: 'site', site: 'marina' } });
      return { html: head, rows }; } });
  const marina = { id: 'marina', url: 'fortharbourmarina.lk', name: MARINA.name, tag: 'Marina', col: '#28507a', icon: '⚓', kw: 'marina berth dock slip mooring harbour harbor pontoon fort boat yacht moor park',
    page(g) { const B = g.boats; const st = B ? B.state() : { slip: false, owned: [], pending: [] };
      const html = `<div class="gs-mast" style="--c:#28507a">FORT HARBOUR MARINA<small>Colombo Port, east basin · 24 h security · shore power & water</small></div>
        <p class="gs-p">Floating pontoons in the sheltered east basin of Colombo harbour, a short walk from Fort. Finger berths to 14 m, alongside berths for motor yachts and the T-head for superyachts to 42 m.</p>
        <div class="gs-list"><div class="gs-item"><b>${esc(MARINA.slipName)} · T-head alongside, up to 42 m</b><span>${st.slip ? 'Yours' : rs(MARINA.berthPrice) + ' · FOR SALE'}</span><small>Freehold berth, sold on site only: walk down to the For Sale sign on the T-head (or the marina office counter) to buy it. Boats bought from our partner dealers are delivered here; switch between your boats at the berth's service pedestal.</small></div></div>
        ${st.slip ? `<p class="gs-p">Your fleet: <b>${st.owned.length}</b> boat${st.owned.length === 1 ? '' : 's'}${st.pending.length ? ` · ${st.pending.length} on order` : ''}.</p>` : ''}`;
      const rows = [];
      if (!st.slip) rows.push({ t: `${MARINA.slipName} is for sale — viewing on site`, s: 'Set the GPS to the For Sale sign on the T-head', act: () => { g.hud.setWaypoint(MARINA.saleSign.x, MARINA.saleSign.z); g.hud.notify('GPS', `Route set: ${MARINA.slipName} (for sale)`, 'info', 3); return { close: true }; } });
      rows.push({ t: '📍 Directions to the marina', s: 'Gangway on the quay, Colombo Port east basin', act: () => { g.hud.setWaypoint(MARINA.gangTop.x, MARINA.gangTop.z); g.hud.notify('GPS', `Route set: ${MARINA.name}`, 'info', 3); return { close: true }; } });
      for (const S of Object.values(MARINE_SHOPS)) rows.push({ t: `${S.icon} ${S.name}`, s: `${S.url} · ${S.tag}`, go: { id: 'site', site: S.id } });
      return { html, rows }; } };
  return [shop(MARINE_SHOPS.yacht), shop(MARINE_SHOPS.boat), shop(MARINE_SHOPS.jetski), marina];
}
// pages below a site: one boat, the checkout, the result (GlobalBrowser.build hands these over)
export function marinePage(br, st) {
  const g = br.g, B = g.boats; const site = br.siteById(st.site) || { url: 'global://', name: 'Global', col: '#333' };
  const head = `<div class="gs-mast" style="--c:${site.col}">${esc(site.name.toUpperCase())}</div>`;
  if (st.id === 'mboat') { const d = BOATS[st.boat]; const own = B && B.owns(st.boat);
    return { url: `${site.url}/${st.boat}`, title: boatName(st.boat), html: head + spec(st.boat),
      rows: [own ? { t: 'You own this boat', s: 'Switch to her at your berth pedestal', act: () => ({ msg: 'Already yours — see your berth.' }) } : { t: `Buy now — ${rs(d.price)}`, s: 'Checkout', go: { id: 'mbuy', boat: st.boat, site: st.site } }, { t: '← All models', act: () => { br.back(); return {}; } }] }; }
  if (st.id === 'mbuy') { const S = g.story.state; const price = st.berth ? MARINA.berthPrice : BOATS[st.boat].price; const left = S.money - price; const what = st.berth ? `${MARINA.slipName}, ${MARINA.name}` : boatName(st.boat);
    return { url: `${site.url}/checkout`, title: 'Checkout', html: head + `<div class="ms-card"><div class="ms-k">Checkout</div><h3>${esc(what)}</h3><p>Price <b>${rs(price)}</b> · balance after <b class="${left < 0 ? 'neg' : ''}">${rs(left)}</b></p>${st.berth ? '' : `<p>Delivered to ${esc(MARINA.slipName)} at ${esc(MARINA.name)} — after you sleep, or the next day. We text you when she is in.</p>`}</div>`,
      rows: [{ t: left < 0 ? 'Insufficient balance' : `Confirm and pay ${rs(price)}`, act: () => { if (!B) return { msg: 'Shop unavailable' }; const r = st.berth ? B.buyBerth() : B.order(st.boat); br.stack.push({ id: 'mresult', ok: r.ok, msg: r.msg, site: st.site }); br.cur = null; br.phone.row = 0; return {}; } }, { t: 'Cancel', act: () => { br.back(); return {}; } }] }; }
  if (st.id === 'mresult') return { url: `${site.url}/order`, title: st.ok ? 'Thank you' : 'Not ordered', html: head + `<div class="ms-card ${st.ok ? 'ok' : 'no'}"><h3>${st.ok ? 'Thank you!' : 'Not ordered'}</h3><p>${esc(st.msg)}</p></div>`,
    rows: [{ t: `Back to ${site.name}`, act: () => { br.stack = br.stack.filter((q) => q.id === 'home' || q.id === 'search' || (q.id === 'site' && q.site === st.site)); br.cur = null; br.phone.row = 0; return {}; } }] };
  return null;
}
