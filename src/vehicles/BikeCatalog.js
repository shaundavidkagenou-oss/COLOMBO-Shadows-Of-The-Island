// Motorcycles and scooters on Colombo's roads: twenty kinds, from the 100 cc commuters and 110 cc scooters that fill the streets to
// five 900 / 1000 cc race-bred superbikes. Real proportions (wheelbase, seat height, rake, tyre sizes, weights, power) — FICTIONAL
// makes and model names; no real manufacturer, model name or logo is used.
//
// Pure data (no three.js) so Traffic / Audio / tests can read it cheaply. The geometry is built by BikeModels.js from `style` and the
// per-bike overrides; every kind is registered in VTYPES with entry 'bike', so boarding, the kick-stand, riding physics, fuel
// stations and parking treat them all as two-wheelers.

export const BIKE_MAKES = {
  soraki: { name: 'SORAKI', origin: 'Japan' },
  takami: { name: 'TAKAMI', origin: 'Japan' },
  veera: { name: 'VEERA', origin: 'India' },
  brennhart: { name: 'BRENNHART', origin: 'Germany' },
  orvano: { name: 'ORVANO', origin: 'Italy' },
  harroway: { name: 'HARROWAY', origin: 'UK' },
  roycroft: { name: 'ROYCROFT', origin: 'UK / India' },
};

// style → builder layout (BikeModels.js). engine: single (air-cooled), singleLC, twin, i3, i4, v2, cvt (scooter). wheels: 1 laced,
// 0 cast commuter, 2 sport cast with floating discs + radial calipers. frame: cradle, trellis, spar (aluminium twin-spar), underbone.
const B = (o) => o;
const LIST = [
  // ---- commuters: the island's workhorses
  ['veera_saathi', B({ make: 'veera', model: 'Saathi 100', cc: 102, hp: 7.7, style: 'commuter', engine: 'single', frame: 'cradle', wheel: 1, mass: 112, maxSpeed: 24, accel: 4.4,
    colors: ['#141414', '#8a1c1c', '#1d3f8a', '#2f2f33'], accent: '#c9c9c9', R: 0.3 })],
  ['takami_daylite', B({ make: 'takami', model: 'Daylite 100', cc: 97, hp: 8.0, style: 'commuter', engine: 'single', frame: 'cradle', wheel: 0, mass: 116, maxSpeed: 24.5, accel: 4.6,
    colors: ['#151515', '#5a1414', '#123a6a', '#55585c'], accent: '#d6d6d0', R: 0.3 })],
  ['takami_tenro', B({ make: 'takami', model: 'Tenro 125', cc: 124, hp: 10.6, style: 'commuter', engine: 'single', frame: 'cradle', wheel: 0, mass: 123, maxSpeed: 27, accel: 5.2,
    colors: ['#1b1b1d', '#7c1212', '#0f2f5c', '#3d4a3a', '#6b6e72'], accent: '#b8b8b8', R: 0.3, tankK: 1.05 })],
  ['veera_strider', B({ make: 'veera', model: 'Strider 150', cc: 149, hp: 14, style: 'street', engine: 'single', frame: 'cradle', wheel: 0, mass: 144, maxSpeed: 32, accel: 6.2,
    colors: ['#111113', '#8f1414', '#1a3f7a', '#4a4d52'], accent: '#d02020', R: 0.3 })],
  ['soraki_kiri', B({ make: 'soraki', model: 'Kiri 160', cc: 160, hp: 15.4, style: 'naked', engine: 'single', frame: 'cradle', wheel: 0, mass: 140, maxSpeed: 33, accel: 6.6,
    colors: ['#16181c', '#1e3d8c', '#5c5f63', '#a01818'], accent: '#c8c8c8', R: 0.3, small: true })],
  // ---- scooters
  ['takami_breeze', B({ make: 'takami', model: 'Breeze 110', cc: 110, hp: 7.8, style: 'scooter', engine: 'cvt', frame: 'underbone', wheel: 0, mass: 105, maxSpeed: 24, accel: 4.8,
    colors: ['#e8e8e4', '#8a1c22', '#1e4a8a', '#151515', '#c9a227'], accent: '#d0d0d0', R: 0.235 })],
  ['veera_torro', B({ make: 'veera', model: 'Torro 125', cc: 124.8, hp: 9.4, style: 'scooterSport', engine: 'cvt', frame: 'underbone', wheel: 0, mass: 116, maxSpeed: 27, accel: 5.5,
    colors: ['#202224', '#8c8f92', '#a5141c', '#14213d'], accent: '#e2a400', R: 0.245 })],
  ['takami_belle', B({ make: 'takami', model: 'Belle 110', cc: 110, hp: 7.5, style: 'retroScooter', engine: 'cvt', frame: 'underbone', wheel: 0, mass: 108, maxSpeed: 23, accel: 4.6,
    colors: ['#9fc7c0', '#e8dcc0', '#b22a2a', '#2b3b55'], accent: '#f2f0ea', R: 0.235 })],
  // ---- quarter-litre and up
  ['veera_talon', B({ make: 'veera', model: 'Talon 200', cc: 199.5, hp: 25, style: 'naked', engine: 'singleLC', frame: 'trellis', wheel: 0, mass: 150, maxSpeed: 37, accel: 7.8,
    colors: ['#e86a10', '#f2f2f0', '#141414'], accent: '#141414', R: 0.3, frameCol: '#e86a10' })],
  ['brennhart_ryzer', B({ make: 'brennhart', model: 'Ryzer 390', cc: 373, hp: 43, style: 'naked', engine: 'singleLC', frame: 'trellis', wheel: 2, mass: 163, maxSpeed: 46, accel: 9.2,
    colors: ['#f0f0ee', '#1a1a1c', '#c8102e'], accent: '#ff6a00', R: 0.3, frameCol: '#ff6a00' })],
  ['soraki_tsubasa155', B({ make: 'soraki', model: 'Tsubasa 155', cc: 155, hp: 18.4, style: 'sport', engine: 'singleLC', frame: 'spar', wheel: 0, mass: 141, maxSpeed: 39, accel: 7.5,
    colors: ['#1d3fa0', '#141416', '#d8d8d4'], accent: '#d4d8de', R: 0.295, small: true })],
  ['soraki_tsubasa300', B({ make: 'soraki', model: 'Tsubasa 300', cc: 321, hp: 42, style: 'sport', engine: 'twin', frame: 'spar', wheel: 2, mass: 169, maxSpeed: 47, accel: 8.6,
    colors: ['#1d3fa0', '#141416', '#3a6e2a', '#b8141c'], accent: '#f2f2f0', R: 0.3 })],
  ['roycroft_heritage', B({ make: 'roycroft', model: 'Heritage 350', cc: 349, hp: 20.2, style: 'classic', engine: 'single', frame: 'cradle', wheel: 1, mass: 195, maxSpeed: 33, accel: 5.6,
    colors: ['#141414', '#5c1a14', '#2c3a2a', '#1b2c4a', '#7a6a4a'], accent: '#c9a227', R: 0.32 })],
  ['veera_ridgeline', B({ make: 'veera', model: 'Ridgeline 410', cc: 411, hp: 24.3, style: 'adv', engine: 'single', frame: 'cradle', wheel: 1, mass: 199, maxSpeed: 37, accel: 6.2,
    colors: ['#3d4a3a', '#d8d4c8', '#1a1a1c', '#8a5a2a'], accent: '#202020', R: 0.33 })],
  ['takami_ascent', B({ make: 'takami', model: 'Ascent 250', cc: 249, hp: 22, style: 'trail', engine: 'singleLC', frame: 'cradle', wheel: 1, mass: 136, maxSpeed: 36, accel: 7.2,
    colors: ['#f2f2f0', '#c8102e', '#1a3fa0', '#2a8a2a'], accent: '#141414', R: 0.33 })],
  // ---- the five: 900 / 1000 cc race-bred superbikes (carbon, titanium, Brembo-style radial brakes, quickshifters, TFT dash)
  ['soraki_rr1000', B({ make: 'soraki', model: 'Tsubasa RR-1000', cc: 998, hp: 208, style: 'super', engine: 'i4', frame: 'spar', wheel: 2, mass: 201, maxSpeed: 74, accel: 12.5,
    colors: ['#1d3fa0', '#141416', '#f2f2f0'], accent: '#d01f2a', R: 0.305, racer: true, livery: 'tricolour' })],
  ['brennhart_blitz', B({ make: 'brennhart', model: 'Blitz 1000 RR', cc: 999, hp: 210, style: 'super', engine: 'i4', frame: 'spar', wheel: 2, mass: 197, maxSpeed: 74, accel: 12.6,
    colors: ['#f2f2f0', '#141416', '#2a2f38'], accent: '#1f5fd0', R: 0.305, racer: true, livery: 'motorsport' })],
  ['takami_raijin', B({ make: 'takami', model: 'Raijin 1000', cc: 998, hp: 203, style: 'super', engine: 'i4', frame: 'spar', wheel: 2, mass: 207, maxSpeed: 73, accel: 12.2,
    colors: ['#3fae2a', '#141416', '#c8102e'], accent: '#141416', R: 0.305, racer: true, livery: 'split' })],
  ['orvano_corsa', B({ make: 'orvano', model: 'Corsa V955', cc: 955, hp: 155, style: 'super', engine: 'v2', frame: 'trellis', wheel: 2, mass: 200, maxSpeed: 70, accel: 11.8,
    colors: ['#c8102e', '#141416', '#f2f2f0'], accent: '#f2f2f0', R: 0.305, racer: true, livery: 'stripe', frameCol: '#c8102e', ssa: true })],
  ['harroway_strike', B({ make: 'harroway', model: 'Strike 900 Triple', cc: 900, hp: 140, style: 'super', engine: 'i3', frame: 'spar', wheel: 2, mass: 195, maxSpeed: 67, accel: 11.4,
    colors: ['#141416', '#c9c9c4', '#b5121b', '#e8b400'], accent: '#e8b400', R: 0.305, racer: true, livery: 'stripe' })],
];

// overall envelope per style (len, wid = bar / mirror width, hgt = mirror / screen top) and steering lock
const ENV = { commuter: [1.98, 0.74, 1.1, 0.72], street: [2.02, 0.76, 1.1, 0.7], naked: [2.0, 0.8, 1.08, 0.66], scooter: [1.84, 0.7, 1.15, 0.78],
  scooterSport: [1.86, 0.72, 1.16, 0.76], retroScooter: [1.84, 0.7, 1.15, 0.78], sport: [2.02, 0.72, 1.1, 0.6], super: [2.07, 0.72, 1.13, 0.55],
  classic: [2.12, 0.8, 1.12, 0.68], adv: [2.2, 0.86, 1.32, 0.66], trail: [2.12, 0.82, 1.2, 0.72] };

export const BIKES = {};
for (const [id, o] of LIST) {
  const [len, wid, hgt, steer] = ENV[o.style];
  BIKES[id] = { len, wid, hgt, wheelR: o.R, maxSpeed: o.maxSpeed, accel: o.accel, mass: o.mass, seats: 2, steer, sound: 'bike', entry: 'bike', base: 'bike',
    colors: o.colors, family: 'bike', make: o.make, model: o.model, cc: o.cc, hp: o.hp, cls: o.racer ? 'superbike' : o.style.startsWith('scooter') || o.style === 'retroScooter' ? 'scooter' : 'motorcycle', bike: o };
}
export const BIKE_IDS = Object.keys(BIKES);
export const SUPERBIKE_IDS = BIKE_IDS.filter((k) => BIKES[k].bike.racer);
export const bikeName = (id) => { const T = BIKES[id]; return T ? `${BIKE_MAKES[T.make].name} ${T.model}` : null; };

// how often each kind turns up (relative, inside the two-wheeler share of traffic): commuters and scooters dominate; the big bikes
// are rare (a few on the Galle Road at night, more in Cinnamon Gardens)
export const BIKE_W = {
  default: { veera_saathi: 5, takami_daylite: 5, takami_tenro: 4, veera_strider: 3, soraki_kiri: 2.5, takami_breeze: 4, veera_torro: 2.5, takami_belle: 1.5, veera_talon: 1.2,
    brennhart_ryzer: 0.6, soraki_tsubasa155: 1.2, soraki_tsubasa300: 0.5, roycroft_heritage: 1.5, veera_ridgeline: 0.6, takami_ascent: 0.6,
    soraki_rr1000: 0.12, brennhart_blitz: 0.1, takami_raijin: 0.1, orvano_corsa: 0.08, harroway_strike: 0.08, bike: 2 },
  port: { veera_saathi: 6, takami_daylite: 5, takami_tenro: 4, veera_strider: 2, takami_breeze: 2, roycroft_heritage: 1, veera_ridgeline: 0.5, bike: 3 },
  cinnamon: { takami_breeze: 4, veera_torro: 3, takami_belle: 2.5, soraki_kiri: 2, veera_talon: 1.5, brennhart_ryzer: 1, soraki_tsubasa155: 1.5, soraki_tsubasa300: 1, roycroft_heritage: 2,
    veera_ridgeline: 1, takami_tenro: 2, veera_saathi: 1.5, soraki_rr1000: 0.35, brennhart_blitz: 0.3, takami_raijin: 0.3, orvano_corsa: 0.25, harroway_strike: 0.25, bike: 1 },
};
export const BIKE_LISTS = Object.fromEntries(Object.entries(BIKE_W).map(([d, w]) => [d, Object.entries(w)]));
// parked at the kerb: same mix, superbikes a little more common (people ride them in to the shops)
export const BIKE_PARKED = Object.entries({ ...BIKE_W.default, soraki_rr1000: 0.25, brennhart_blitz: 0.2, takami_raijin: 0.2, orvano_corsa: 0.15, harroway_strike: 0.15 });
