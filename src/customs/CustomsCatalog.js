// STREET CUSTOMS — the modification catalogue (data + rules, no three.js objects).
//
// Nothing here is a list of vehicle ids. Every vehicle's customisation profile is DISCOVERED from the data the rest of the game
// already uses: VTYPES (VehicleModels.js, filled from VehicleCatalog.js / BikeCatalog.js) gives the builder family, the catalogue
// class text, the dimensions, the drivetrain numbers and the two-wheeler style; the body geometry itself is scanned later
// (BodyScan.js) for the parts that need a real surface to sit on. From those the catalogue decides which mod slots exist for a
// vehicle and which options inside each slot fit it — a superbike never sees a roof rack, a tuk-tuk never sees a turbo, an
// electric hatch has no exhaust, a pickup gets side steps instead of race skirts.
//
// Police, emergency and service vehicles (T.police, T.ambulance, T.tow), route buses and trains have NO profile: they are not
// listed, previewed, priced or modifiable anywhere, and their own behaviour is untouched.
//
// Prices are in Sri Lankan rupees on the game's own economy scale (mission rewards Rs. 1,000–50,000, Ceylon Arms Co. pistols
// Rs. 4,500+), scaled per vehicle by its class and performance — a race-bred coupé costs more to fit out than a kei van.
import { VTYPES } from '../vehicles/VehicleModels.js';

export const SHOP_NAME = 'Street Customs';
export const MAX_OWNED = 12;

// ------------------------------------------------------------------------------------------------ vehicle profiles
const BIKE_CLASS = { super: 'superbike', sport: 'sportbike', naked: 'street', street: 'street', classic: 'classic', adv: 'adventure', trail: 'adventure', commuter: 'commuter', scooter: 'scooter', scooterSport: 'scooter', retroScooter: 'scooter' };
const LABEL = { sports: 'Sports coupé', exec: 'Executive saloon', sedan: 'Saloon', classic: 'Classic saloon', hatch: 'Hatchback / city car', crossover: 'Crossover', suv: 'SUV', offroad: '4x4 off-roader', van: 'Van', pickup: 'Pickup', truck: 'Light truck', tuktuk: 'Three-wheeler',
  superbike: 'Superbike', sportbike: 'Sport bike', street: 'Street / naked bike', classic_b: 'Classic motorcycle', adventure: 'Adventure / trail bike', commuter: 'Commuter motorcycle', scooter: 'Scooter' };
// relative cost of fitting out a vehicle of this class (1 = an everyday hatchback)
const TIER = { sports: 2.4, exec: 1.7, sedan: 1.2, classic: 1.1, hatch: 1.0, crossover: 1.15, suv: 1.5, offroad: 1.45, van: 1.1, pickup: 1.3, truck: 1.3, tuktuk: 0.6, superbike: 1.7, sportbike: 1.05, street: 0.85, classic_b: 0.9, adventure: 0.95, commuter: 0.5, scooter: 0.55 };

// why a vehicle has no profile (shown nowhere in the shop UI — only used by tests / the debug console)
export function exclusionReason(type) {
  const T = VTYPES[type]; if (!T) return 'unknown vehicle';
  if (T.police) return 'police vehicle'; if (T.ambulance) return 'emergency vehicle'; if (T.tow) return 'municipal service vehicle';
  if (T.rail || T.isTrain) return 'train';
  if (T.pedal) return 'bicycle (no engine or bodywork to tune)';
  if (type === 'bus' || type === 'pbus' || T.base === 'bus' || T.entry === 'bus' && !T.family) return 'route bus (does not fit the bay)';
  if ((T.len || 0) > 7.5) return 'too long for the workshop bay';
  return null;
}
export const isCustomizable = (type) => !exclusionReason(type);

const cache = new Map();
export function profileOf(type) {
  if (cache.has(type)) return cache.get(type); let P = null;
  if (isCustomizable(type)) {
    const T = VTYPES[type]; const cls = (T.cls || '').toLowerCase(); const ref = (T.ref || '').toLowerCase(); const fam = T.family || T.base || type;
    let kind = 'car', klass;
    if (T.entry === 'bike') { kind = 'bike'; klass = T.bike ? BIKE_CLASS[T.bike.style] || 'street' : 'commuter'; if (klass === 'classic') klass = 'classic_b'; }
    else if (T.entry === 'tuk' || type === 'tuktuk') { kind = 'tuk'; klass = 'tuktuk'; }
    else if (fam === 'truck' || type === 'lorry' || cls.includes('truck')) klass = 'truck';
    else if (fam === 'pickup' || cls.includes('pickup') || cls.includes('double cab')) klass = 'pickup';
    else if (fam === 'van' || type === 'van' || cls.includes('van')) klass = 'van';
    else if (cls.includes('sports')) klass = 'sports';
    else if (fam === 'suv' || type === 'suv') klass = /4x4|body-on-frame|ladder/.test(cls + ' ' + ref) ? 'offroad' : cls.includes('crossover') ? 'crossover' : 'suv';
    else if (cls.includes('crossover')) klass = 'crossover';
    else if (cls.includes('classic')) klass = 'classic';
    else if (cls.includes('executive')) klass = 'exec';
    else if (fam === 'sedan' || type === 'sedan' || cls.includes('saloon') || cls === 'hybrid') klass = 'sedan';
    else klass = 'hatch';
    const ev = cls.includes('electric'); const diesel = !ev && (klass === 'van' || klass === 'pickup' || klass === 'truck' || klass === 'offroad' || (klass === 'suv' && T.mass > 1900));
    const perf = Math.max(0.75, Math.min(1.6, 0.85 + 0.15 * (T.accel || 5) / 6));
    const f = Math.round((TIER[klass] || 1) * perf * 100) / 100;
    const bikeStyle = kind === 'bike' ? (T.bike ? T.bike.style : 'commuter') : null;
    P = { type, T, kind, klass, label: LABEL[klass] || klass, ev, diesel, f, bikeStyle, racer: !!(T.bike && T.bike.racer), scooter: klass === 'scooter',
      offroad: klass === 'offroad' || klass === 'pickup' || (klass === 'suv' && T.mass > 1900), heavy: klass === 'truck', low: klass === 'sports' || klass === 'sedan' || klass === 'exec' || klass === 'hatch' || klass === 'crossover' || klass === 'classic' };
  }
  cache.set(type, P); return P;
}
export function customizableTypes() { return Object.keys(VTYPES).filter((t) => !!profileOf(t)); }
export function excludedTypes() { return Object.keys(VTYPES).filter((t) => !profileOf(t)); }

// ------------------------------------------------------------------------------------------------ colours
export const PAINT_PRESETS = [
  ['Arctic White', '#f2f2ee'], ['Pearl Ivory', '#ece6d6'], ['Silver Mist', '#c3c7cc'], ['Gunmetal', '#4a4e54'], ['Midnight Black', '#121315'],
  ['Galle Red', '#a3141c'], ['Kandy Maroon', '#5c1220'], ['Sigiriya Orange', '#d4581a'], ['Saffron Gold', '#d6a01e'], ['Lime Rush', '#8cc63e'],
  ['Tea Estate Green', '#1f5a34'], ['Lagoon Teal', '#127a7c'], ['Indian Ocean Blue', '#1b4f9c'], ['Night Navy', '#16234a'], ['Lotus Violet', '#5a2a82'],
  ['Temple Pink', '#d4568e'], ['Cinnamon Brown', '#6b4428'], ['Sand Beige', '#c9b48e'], ['Monsoon Grey', '#7d8288'], ['Racing Yellow', '#f2cc1a'],
];
export const RIM_PRESETS = [['Silver', '#c9ccd0'], ['Gunmetal', '#4a4e54'], ['Gloss Black', '#141416'], ['Bronze', '#8a6a3a'], ['Gold', '#c9a23a'], ['White', '#eeeeea'], ['Red', '#a3141c'], ['Blue', '#1b4f9c']];
export const GLOW_COLOURS = [['Electric Blue', '#2a6bff'], ['Neon Green', '#2aff6a'], ['Hot Red', '#ff2030'], ['Purple', '#a03aff'], ['Pure White', '#e8f0ff'], ['Amber', '#ffa020'], ['Pink', '#ff40b0'], ['Teal', '#20f0e0']];
export const SMOKE_COLOURS = [['White', '#e8e8e4'], ['Black', '#2a2a2a'], ['Red', '#d42a2a'], ['Blue', '#2a5ad4'], ['Yellow', '#e0c020'], ['Green', '#2ab84a'], ['Purple', '#8a3ad4'], ['Orange', '#e07020']];
export const CALIPER_COLOURS = [['Red', '#b81c1c'], ['Yellow', '#e0b414'], ['Blue', '#1c4ab8'], ['Orange', '#e0661c'], ['Green', '#2a8a3a'], ['Black', '#151517'], ['Silver', '#b4b8bc']];

// ------------------------------------------------------------------------------------------------ slots
// cat: UI category. kind: 'choice' (pick one option) | 'colour' (presets + RGB). value: the stored option id / hex colour.
// opts(P, scan): the options that fit this vehicle (first = stock / none). An option: { id, name, desc, base (Rs before the vehicle
// factor), lvl? (performance level), stat? (what it changes, shown in the UI) }. A slot with fewer than two options is not shown.
export const CATEGORIES = [
  { id: 'exterior', name: 'Exterior', icon: 'body' }, { id: 'paint', name: 'Paint', icon: 'spray' }, { id: 'wheels', name: 'Wheels', icon: 'wheel' }, { id: 'lighting', name: 'Lighting', icon: 'bulb' },
  { id: 'engine', name: 'Engine', icon: 'engine' }, { id: 'turbo', name: 'Turbo', icon: 'turbo' }, { id: 'transmission', name: 'Transmission', icon: 'gear' }, { id: 'suspension', name: 'Suspension', icon: 'spring' },
  { id: 'brakes', name: 'Brakes', icon: 'brake' }, { id: 'armour', name: 'Armour', icon: 'shield' }, { id: 'exhaust', name: 'Exhaust', icon: 'pipe' }, { id: 'extras', name: 'Extras', icon: 'star' },
];
const O = (id, name, base, desc, extra = {}) => ({ id, name, base, desc, ...extra });
const STOCK = (desc = 'Factory fitted.') => O('stock', 'Stock', 0, desc);
const lv = (n, names, prices, descs, stat) => names.slice(0, n).map((nm, i) => O(i ? 'l' + i : 'stock', nm, prices[i], descs[i], { lvl: i, stat: stat ? stat(i) : null }));
const car = (P) => P.kind === 'car'; const bike = (P) => P.kind === 'bike'; const tuk = (P) => P.kind === 'tuk';
const lowCar = (P) => car(P) && P.low; const sporty = (P) => car(P) && (P.klass === 'sports' || P.klass === 'sedan' || P.klass === 'exec' || P.klass === 'hatch' || P.klass === 'crossover');
const pct = (x) => (x >= 0 ? '+' : '') + Math.round(x * 100) + ' %';

export const SLOTS = [
  // ---------------------------------------------------------------- exterior
  { id: 'frontBumper', cat: 'exterior', name: 'Front bumper', opts: (P, S) => {
    if (!car(P) || !S || !S.front) return [];
    const o = [STOCK()]; if (sporty(P) || P.klass === 'classic') o.push(O('lip', 'Lip splitter', 2500, 'A slim splitter blade under the front bumper. Sharper look, a little less lift.'), O('race', 'Race splitter + canards', 5500, 'Deep carbon splitter with dive planes on the bumper corners.'));
    if (P.offroad || P.klass === 'suv') o.push(O('bullbar', 'Bull bar', 4500, 'Tubular steel nudge bar in front of the grille.'), O('steel', 'Steel 4x4 bumper', 7000, 'Plated steel bumper with recovery points and a winch.'));
    if (P.klass === 'van' || P.klass === 'truck') o.push(O('bullbar', 'Grille guard', 4500, 'Tubular steel guard over the grille and lamps.'));
    return o; } },
  { id: 'rearBumper', cat: 'exterior', name: 'Rear bumper', opts: (P, S) => {
    if (!car(P) || !S || !S.rear) return [];
    const o = [STOCK()]; if (sporty(P)) o.push(O('diffuser', 'Rear diffuser', 3000, 'Finned diffuser under the rear bumper.'), O('racediff', 'Race diffuser', 6000, 'Tall carbon diffuser with five strakes.'));
    if (P.offroad || P.klass === 'suv' || P.klass === 'van' || P.klass === 'truck') o.push(O('towbar', 'Tow bar', 2500, 'Bolt-on tow bar with a ball hitch.'));
    if (P.offroad) o.push(O('steel', 'Steel rear bumper', 6000, 'Plated steel rear bumper with recovery points.'));
    return o; } },
  { id: 'skirts', cat: 'exterior', name: 'Side skirts', opts: (P, S) => {
    if (!car(P) || !S || !S.sill) return [];
    if (P.offroad || P.klass === 'suv' || P.klass === 'van') return [STOCK(), O('tubes', 'Tube side steps', 3000, 'Polished tube steps along the sills.'), O('boards', 'Running boards', 4000, 'Full-length running boards with rubber treads.')];
    if (P.klass === 'truck') return [];
    return [STOCK(), O('street', 'Street skirts', 2500, 'Body-colour sill extensions.'), O('race', 'Race skirts', 4500, 'Carbon sill blades with a rear flick.')]; } },
  { id: 'spoiler', cat: 'exterior', name: 'Spoiler', opts: (P, S) => {
    if (!car(P) || !S || !S.tail) return []; if (P.klass === 'truck' || P.klass === 'van' || P.klass === 'pickup') return [];
    if (S.tail.roof) return [STOCK(), O('rooflip', 'Roof lip spoiler', 2000, 'Body-colour lip along the top of the tailgate.'), O('roofwing', 'Roof wing', 4500, 'Large carbon wing over the tailgate glass.')];
    return [STOCK(), O('lip', 'Boot lip', 2000, 'A small body-colour lip on the boot lid.'), O('ducktail', 'Ducktail', 3500, 'Raised ducktail kick on the boot lid.'), O('wing', 'GT wing', 7000, 'Carbon wing on swan-neck stands. Real rear downforce at speed.', { stat: 'Rear grip at speed +2 %' })]; } },
  { id: 'hood', cat: 'exterior', name: 'Bonnet', opts: (P, S) => {
    if (!car(P) || !S || !S.hood || P.klass === 'truck') return [];
    const o = [STOCK(), O('scoop', 'Bonnet scoop', 3500, 'Raised air scoop in the centre of the bonnet.'), O('vents', 'Twin vents', 3000, 'Two heat-extractor vents with black louvres.')];
    if (P.klass !== 'van') o.push(O('carbon', 'Carbon bonnet', 6500, 'Clear-lacquered carbon fibre skin over the bonnet.'));
    return o; } },
  { id: 'fenders', cat: 'exterior', name: 'Fenders', opts: (P, S) => {
    if (!car(P) || !S || !S.arches || P.klass === 'truck' || P.klass === 'van') return [];
    if (P.offroad || P.klass === 'suv') return [STOCK(), O('flares', 'Fender flares', 4000, 'Black textured flares over all four arches.')];
    return [STOCK(), O('over', 'Over-fenders', 4000, 'Bolt-on black over-fenders, riveted to the arches.'), O('wide', 'Widebody kit', 12000, 'Body-colour widebody arches with the track widened to fill them.', { stat: 'Track +3 cm' })]; } },
  { id: 'roof', cat: 'exterior', name: 'Roof', opts: (P, S) => {
    if (tuk(P)) return [STOCK(), O('rack', 'Luggage carrier', 1500, 'Chrome roof carrier over the canopy.')];
    if (!car(P) || !S || !S.roof) return [];
    if (P.klass === 'truck') return [STOCK(), O('deflector', 'Cab air deflector', 2500, 'Fibreglass deflector on the cab roof.')];
    if (P.klass === 'pickup') return [STOCK(), O('rack', 'Roof rails', 2500, 'Black aluminium roof rails.'), O('rollbar', 'Sports roll bar', 3500, 'Polished sports bar over the load bed.')];
    if (P.klass === 'van') return [STOCK(), O('rack', 'Roof rack', 2500, 'Full-length roof rack.'), O('ladder', 'Ladder rack', 3000, 'Roof rack with ladder rollers.')];
    const o = [STOCK(), O('carbon', 'Carbon roof', 4500, 'Clear-lacquered carbon fibre roof skin.'), O('rack', 'Roof rails', 2500, 'Black aluminium roof rails.')];
    if (P.klass !== 'sports') o.push(O('box', 'Roof box', 3500, 'Aerodynamic roof box on rails.'));
    return o; } },
  { id: 'mudflaps', cat: 'exterior', name: 'Mud flaps', opts: (P, S) => (car(P) && S && S.arches && (P.offroad || P.klass === 'suv' || P.klass === 'van' || P.klass === 'truck' || P.klass === 'pickup')) || tuk(P) ? [STOCK(), O('flaps', 'Mud flaps', 900, 'Heavy rubber flaps behind every wheel.')] : [] },
  { id: 'trim', cat: 'exterior', name: 'Brightwork', opts: (P, S) => (S && S.chrome && !bike(P)) ? [O('stock', 'Chrome (stock)', 0, 'Factory chrome trim.'), O('satin', 'Satin black', 2500, 'Chrome delete: every bright trim in satin black.'), O('gloss', 'Gloss black', 3000, 'Chrome delete in piano black.')] : [] },
  { id: 'tint', cat: 'exterior', name: 'Window tint', opts: (P, S) => (S && S.glass) ? [O('stock', 'Stock glass', 0, 'Factory tint.'), O('light', 'Light smoke', 1200, 'A light smoke film.'), O('dark', 'Dark smoke', 1800, 'Dark smoke film.'), O('limo', 'Limo', 2500, 'Near-black privacy film.'), O('green', 'Green tint', 1500, 'Green solar film.'), O('blue', 'Blue tint', 1500, 'Blue solar film.')] : [] },
  { id: 'plate', cat: 'exterior', name: 'Number plates', opts: (P, S) => (S && S.plates) ? [O('stock', 'Standard plates', 0, 'Registration plates as issued.'), O('vanity', 'Vanity plates', 2000, 'Your own lettering on both plates (up to 7 characters).')] : [] },
  // motorcycles
  { id: 'screen', cat: 'exterior', name: 'Windscreen', opts: (P, S) => bike(P) && S && S.screen ? [STOCK(), O('tall', 'Touring screen', 2500, 'Taller screen: the wind goes over the helmet.'), O('bubble', 'Double-bubble (smoked)', 3000, 'Race double-bubble screen in dark smoke.')] : [] },
  { id: 'cowl', cat: 'exterior', name: 'Seat cowl', opts: (P, S) => bike(P) && S && S.pillion && !P.scooter && P.klass !== 'commuter' && P.klass !== 'adventure' ? [STOCK(), O('cowl', 'Pillion seat cowl', 2000, 'Body-colour hump over the pillion seat.')] : [] },
  { id: 'sliders', cat: 'exterior', name: 'Frame sliders', opts: (P, S) => bike(P) && S && S.engine && !P.scooter ? [STOCK(), O('sliders', 'Frame sliders', 1500, 'Black nylon crash bobbins on the engine mounts.')] : [] },
  { id: 'crashbars', cat: 'exterior', name: 'Crash bars', opts: (P, S) => bike(P) && S && S.engine && (P.klass === 'adventure' || P.klass === 'classic_b' || P.klass === 'commuter') ? [STOCK(), O('bars', 'Engine crash bars', 3000, 'Steel tube bars round the engine.', { stat: 'Damage taken −8 %' })] : [] },
  { id: 'guard', cat: 'exterior', name: 'Front guard', opts: (P) => tuk(P) ? [STOCK(), O('guard', 'Chrome nudge guard', 1800, 'Chrome guard bars in front of the nose.')] : [] },

  // ---------------------------------------------------------------- paint
  { id: 'paint1', cat: 'paint', kind: 'colour', name: 'Primary colour', base: 2500, presets: PAINT_PRESETS, desc: 'Full respray of the body colour.', opts: (P) => [O('colour', 'Primary colour', 2500, 'Full respray of the body colour.')] },
  { id: 'finish', cat: 'paint', name: 'Paint finish', opts: () => [O('gloss', 'Gloss (stock)', 0, 'Solid colour under a deep clear coat.'), O('metallic', 'Metallic', 1800, 'Aluminium flake in the base coat.'), O('pearl', 'Pearlescent', 2600, 'Colour-shifting pearl: the second colour shows at glancing angles.'), O('satin', 'Satin', 2400, 'Low-sheen satin clear coat.'), O('matte', 'Matte', 3200, 'Flat matte paint, no clear coat.'), O('chrome', 'Chrome', 12000, 'Mirror chrome wrap tinted in the primary colour.')] },
  { id: 'zone', cat: 'paint', name: 'Two-tone', opts: (P) => bike(P) ? [O('none', 'Single colour', 0, 'One colour all over.'), O('lower', 'Lower panels', 1500, 'Second colour on the lower fairing / side panels.')] : [O('none', 'Single colour', 0, 'One colour all over.'), O('roof', 'Contrast roof', 1800, 'Second colour on the roof and pillars.'), O('lower', 'Lower two-tone', 1800, 'Second colour below the side mouldings.'), O('upper', 'Upper half', 2200, 'Second colour above the waistline.')] },
  { id: 'paint2', cat: 'paint', kind: 'colour', name: 'Second colour', base: 1500, presets: PAINT_PRESETS, desc: 'Colour for the two-tone areas, the pearl effect and the livery.', opts: () => [O('colour', 'Second colour', 1500, 'Colour for the two-tone areas, the pearl effect and the livery.')] },
  { id: 'livery', cat: 'paint', name: 'Livery', opts: (P) => {
    const o = [O('none', 'None', 0, 'Plain paint.'), O('stripes', 'Twin racing stripes', 3500, 'Two stripes nose to tail in the second colour.'), O('centre', 'Centre stripe', 3000, 'One wide stripe over the top.'), O('band', 'Side band', 3000, 'A band along each side.'), O('hockey', 'Hockey stick', 3800, 'Side band that kicks up over the rear quarter.'), O('rally', 'Rally sash', 4000, 'Diagonal sash across the sides.'), O('fade', 'Colour fade', 4500, 'Primary fades into the second colour toward the rear.'), O('checker', 'Checker roof', 3500, 'Black and white chequers over the roof.')];
    return bike(P) ? o.filter((q) => q.id !== 'checker' && q.id !== 'hockey') : tuk(P) ? o.filter((q) => q.id !== 'checker') : o; } },
  { id: 'decal', cat: 'paint', name: 'Door decals', opts: (P) => [O('none', 'None', 0, 'Clean flanks.'), O('lotus', 'Lotus emblem', 900, 'Original lotus emblem in white.'), O('n07', 'Race number 07', 1200, 'White roundel with 07.'), O('n27', 'Race number 27', 1200, 'White roundel with 27.'), O('n94', 'Race number 94', 1200, 'White roundel with 94.'), O('cc', 'Street Customs', 900, 'The workshop\'s own sticker.'), O('flame', 'Flame licks', 1800, 'Hand-drawn flames from the front arches.')].filter((q) => !(bike(P) && q.id === 'flame')) },

  // ---------------------------------------------------------------- wheels
  { id: 'rims', cat: 'wheels', name: 'Wheel design', opts: (P) => {
    if (bike(P)) return P.scooter ? [STOCK(), O('cast5', 'Five-spoke cast', 3500, 'Split five-spoke cast alloy.'), O('cast3', 'Three-spoke cast', 3000, 'Three-spoke sport alloy.')] : [STOCK(), O('cast3', 'Three-spoke cast', 4000, 'Split three-spoke sport alloy.'), O('cast5', 'Five-spoke cast', 4000, 'Split five-spoke cast alloy.'), O('forged7', 'Forged seven-spoke', 9000, 'Lightweight forged Y-spokes.', { stat: 'Acceleration +1 %' }), O('laced', 'Laced (spoked)', 4500, 'Classic laced rims, stainless spokes.')];
    if (tuk(P)) return [STOCK(), O('steelie', 'Chrome steel', 2000, 'Polished steel wheels.'), O('split5', 'Five-spoke alloy', 3000, 'Small five-spoke alloys.')];
    if (P.klass === 'truck') return [STOCK(), O('trucker', 'Polished steel', 4500, 'Polished ten-hole steel wheels.'), O('steelie', 'Modular steel', 3500, 'Black modular steel wheels.')];
    const o = [STOCK(), O('split5', 'Split five-spoke', 5000, 'Twin five-spoke sport alloy.'), O('mesh', 'Cross mesh', 7500, 'Two-piece cross-spoke mesh.'), O('multi10', 'Ten-spoke', 6000, 'Ten thin spokes.'), O('dish', 'Deep dish', 6500, 'Six stubby spokes behind a deep polished lip.'), O('turbine', 'Turbine', 7000, 'Curved turbine blades.'), O('y6', 'Six Y-spoke', 8000, 'Premium six Y-spoke alloy.'), O('mono7', 'Forged monoblock', 12000, 'Forged seven-spoke monoblock.', { stat: 'Acceleration +1 %' })];
    if (P.offroad || P.klass === 'suv' || P.klass === 'van' || P.klass === 'pickup') o.push(O('beadlock', 'Off-road beadlock', 6500, 'Eight-window wheel with a bolted beadlock ring.'), O('steelie', 'Modular steel', 3500, 'Black modular steel wheels.'));
    return o; } },
  { id: 'rimCol', cat: 'wheels', kind: 'colour', name: 'Wheel colour', base: 1200, presets: RIM_PRESETS, desc: 'Colour of the wheel faces (with any design except stock).', opts: () => [O('colour', 'Wheel colour', 1200, 'Wheel face colour.')], needs: (m) => m.rims && m.rims !== 'stock' },
  { id: 'rimFin', cat: 'wheels', name: 'Wheel finish', opts: () => [O('paint', 'Painted', 0, 'Painted and lacquered.'), O('chrome', 'Chrome', 3500, 'Triple-plated chrome.'), O('brushed', 'Brushed', 1500, 'Brushed metal under clear lacquer.'), O('matte', 'Matte', 800, 'Flat finish.')], needs: (m) => m.rims && m.rims !== 'stock' },
  { id: 'wsize', cat: 'wheels', name: 'Rim size', opts: (P) => bike(P) || tuk(P) || P.klass === 'truck' ? [] : [O('stock', 'Stock size', 0, 'Factory rim and tyre profile.'), O('p1', '+1 inch', 3000, 'One inch larger rims, lower-profile tyres. Sharper steering.', { stat: 'Steering response +4 %' }), O('p2', '+2 inch', 5500, 'Two inches larger, low-profile tyres.', { stat: 'Steering response +7 %, ride firmer' })], needs: (m) => m.rims && m.rims !== 'stock' },
  { id: 'tyres', cat: 'wheels', name: 'Tyres', opts: (P) => {
    const o = [O('stock', 'Street (stock)', 0, 'Everyday road tyres.'), O('sport', 'Sport', 2500, 'Softer sport compound.', { stat: 'Grip +4 %' }), O('semi', 'Semi-slick', 4500, 'Track compound with a shallow tread. Superb in the dry, nervous in the wet.', { stat: 'Grip +8 % dry, −6 % wet' })];
    if (car(P) && (P.offroad || P.klass === 'suv' || P.klass === 'van' || P.klass === 'truck')) o.push(O('at', 'All-terrain', 3000, 'Chunky blocks, tough sidewalls.', { stat: 'Grip −2 %, 35 % puncture resistance' }), O('mt', 'Mud-terrain', 3500, 'Big knobbly blocks, very thick sidewalls.', { stat: 'Grip −4 %, 50 % puncture resistance' }));
    if (bike(P) && (P.klass === 'adventure')) o.push(O('mt', 'Dual-sport knobbly', 2500, 'Knobbly dual-sport tyres.', { stat: 'Grip −3 %, 40 % puncture resistance' }));
    return tuk(P) ? o.slice(0, 2) : o; } },
  { id: 'bulletproof', cat: 'wheels', name: 'Run-flat tyres', opts: (P) => bike(P) ? [] : [O('stock', 'Standard', 0, 'Standard tyres can be shot out or spiked.'), O('runflat', 'Bullet-resistant run-flats', 9000, 'Reinforced run-flat tyres: bullets and spike strips no longer flatten them.', { stat: 'Immune to punctures' })] },
  { id: 'smoke', cat: 'wheels', kind: 'colour', name: 'Tyre smoke', base: 1500, presets: SMOKE_COLOURS, desc: 'Coloured tyre smoke for burnouts and drifts.', opts: (P) => tuk(P) ? [] : [O('colour', 'Tyre smoke colour', 1500, 'Coloured tyre smoke.')] },

  // ---------------------------------------------------------------- lighting
  { id: 'head', cat: 'lighting', name: 'Headlights', opts: () => [O('stock', 'Halogen (stock)', 0, 'Warm-white halogen.'), O('led', 'LED white', 2500, 'Crisp white LED.'), O('xenon', 'Xenon', 3500, 'Cool blue-white xenon.'), O('yellow', 'Selective yellow', 1500, 'Yellow rally lamps.')] },
  { id: 'tail', cat: 'lighting', name: 'Tail lights', opts: (P, S) => S && S.tails ? [O('stock', 'Stock', 0, 'Factory red lenses.'), O('smoked', 'Smoked', 1200, 'Dark smoked lenses.'), O('bright', 'Clear LED', 1800, 'Bright LED clusters.')] : [] },
  { id: 'glow', cat: 'lighting', name: 'Underglow', opts: () => [O('none', 'None', 0, 'No underglow.'), ...GLOW_COLOURS.map(([n, c]) => O(c, n, 3500, n + ' neon tubes under the sills. Lit when the headlights are on.'))] },
  { id: 'aux', cat: 'lighting', name: 'Auxiliary lights', opts: (P, S) => {
    if (car(P) && (P.offroad || P.klass === 'suv' || P.klass === 'truck' || P.klass === 'pickup') && S && S.roof) return [O('none', 'None', 0, 'No extra lamps.'), O('bar', 'Roof light bar', 6000, 'LED light bar on the roof.'), O('spots', 'Bumper spot lamps', 3000, 'Two round spot lamps on the bumper.')];
    if (bike(P) && P.klass === 'adventure') return [O('none', 'None', 0, 'No extra lamps.'), O('fog', 'LED fog lamps', 2500, 'Two LED fog pods on the crash bars.')];
    return []; } },
  { id: 'cabin', cat: 'lighting', name: 'Cabin lighting', opts: (P, S) => car(P) && S && S.cabin ? [O('stock', 'Stock', 0, 'Factory instrument glow.'), O('#3a7aff', 'Ice blue', 1500, 'Blue ambient lighting.'), O('#ff3030', 'Red', 1500, 'Red ambient lighting.'), O('#ffa030', 'Amber', 1500, 'Amber ambient lighting.'), O('#e8f0ff', 'White', 1500, 'White ambient lighting.')] : [] },

  // ---------------------------------------------------------------- performance
  { id: 'engine', cat: 'engine', name: 'Engine', opts: (P) => P.ev
    ? lv(4, ['Stock', 'Inverter remap', 'Motor stage 2', 'Motor stage 3'], [0, 7000, 14000, 24000], ['Factory motor tune.', 'Inverter software: sharper throttle.', 'Higher-current motor controller.', 'Full motor and battery cooling upgrade.'], (i) => i ? `Acceleration ${pct([0, 0.07, 0.13, 0.19][i])}` : null)
    : lv(tuk(P) ? 3 : 5, tuk(P) ? ['Stock', 'Port and polish', 'Big-bore kit'] : ['Stock', 'ECU tune', 'Stage 2', 'Stage 3', 'Stage 4'], tuk(P) ? [0, 3000, 6000] : [0, 6000, 12000, 20000, 32000],
      tuk(P) ? ['Factory engine.', 'Ported head and a free-flow intake.', 'Larger bore and piston.'] : ['Factory engine.', 'Engine management remap.', 'Intake, cams and remap.', 'Forged internals and high-lift cams.', 'Full race build.'],
      (i) => i ? `Acceleration ${pct([0, 0.07, 0.13, 0.19, 0.25][i])}, top speed ${pct([0, 0.02, 0.04, 0.06, 0.08][i])}` : null) },
  { id: 'turbo', cat: 'turbo', name: 'Turbo', opts: (P) => P.ev || tuk(P) || bike(P) ? [] : lv(4, ['None', 'Street turbo', 'Sport turbo', 'Race turbo'], [0, 15000, 22000, 32000], ['Naturally aspirated / factory boost.', 'Small, quick-spooling turbo.', 'Bigger turbine, more boost.', 'Large race turbo: lag, then a big shove.'], (i) => i ? `Acceleration ${pct([0, 0.08, 0.13, 0.18][i])} on boost, spool ${['', '0.9', '0.7', '0.55'][i]} s` : null) },
  { id: 'trans', cat: 'transmission', name: 'Transmission', opts: (P) => lv(tuk(P) ? 2 : 4, bike(P) ? ['Stock', 'Quickshifter', 'Race quickshifter', 'Race gearbox'] : P.ev ? ['Stock', 'Street reduction', 'Sport reduction', 'Race reduction'] : ['Stock', 'Street', 'Sport', 'Race'], [0, 5000, 9000, 15000],
    bike(P) ? ['Factory gearbox.', 'Clutchless up-shifts.', 'Up and down quickshifter.', 'Close-ratio race gearbox.'] : ['Factory gearbox.', 'Shorter shifts, uprated clutch.', 'Close-ratio gears, sharper shifts.', 'Sequential race gearbox.'],
    (i) => i ? `Mid-range pull ${pct([0, 0.05, 0.09, 0.13][i])}, throttle response ${pct([0, 0.1, 0.2, 0.3][i])}` : null) },
  { id: 'susp', cat: 'suspension', name: 'Suspension', opts: (P) => bike(P)
    ? lv(3, ['Stock', 'Sport springs', 'Race cartridges'], [0, 3500, 7000], ['Factory suspension.', 'Stiffer springs and rebound.', 'Adjustable race fork cartridges and shock.'], (i) => i ? `Cornering grip ${pct([0, 0.03, 0.06][i])}` : null)
    : P.offroad ? lv(3, ['Stock', 'Heavy-duty springs', 'Remote-reservoir shocks'], [0, 4000, 8000], ['Factory suspension.', 'Heavy-duty springs, less body roll.', 'Remote-reservoir off-road shocks.'], (i) => i ? `Body roll ${pct([0, -0.08, -0.15][i])}, grip ${pct([0, 0.02, 0.04][i])}` : null)
      : lv(tuk(P) ? 2 : 5, ['Stock', 'Lowered', 'Street', 'Sport', 'Competition'], [0, 3000, 5000, 8000, 12000], ['Factory suspension.', 'Lowering springs.', 'Street coilovers.', 'Sport coilovers.', 'Competition coilovers.'], (i) => i ? `Ride height ${[0, -2, -3, -4, -5][i]} cm, body roll ${pct([0, -0.1, -0.18, -0.26, -0.34][i])}, grip ${pct([0, 0.02, 0.04, 0.06, 0.08][i])}` : null) },
  { id: 'lift', cat: 'suspension', name: 'Lift kit', opts: (P) => car(P) && P.offroad ? lv(3, ['Stock height', '4 cm lift', '7 cm lift'], [0, 6000, 10000], ['Factory ride height.', 'Spacer lift for bigger tyres.', 'Long-travel lift kit.'], (i) => i ? `Ride height +${[0, 4, 7][i]} cm, body roll ${pct([0, 0.08, 0.15][i])}` : null) : [] },
  { id: 'brakes', cat: 'brakes', name: 'Brakes', opts: (P) => lv(tuk(P) ? 3 : 4, ['Stock', 'Street', 'Sport', 'Race'], [0, 4000, 7500, 12000], ['Factory brakes.', 'Performance pads and braided lines.', 'Larger slotted discs, sport calipers.', 'Race calipers with two-piece discs.'], (i) => i ? `Braking ${pct([0, 0.12, 0.24, 0.36][i])}` : null) },
  { id: 'calCol', cat: 'brakes', kind: 'colour', name: 'Caliper colour', base: 800, presets: CALIPER_COLOURS, desc: 'Paint the brake calipers.', opts: (P) => car(P) ? [O('colour', 'Caliper colour', 800, 'Paint the brake calipers.')] : [], needs: (m) => m.brakes && m.brakes !== 'stock' },
  { id: 'armour', cat: 'armour', name: 'Armour', opts: (P) => bike(P) ? [] : lv(tuk(P) ? 3 : 5, ['None', 'Armour 20 %', 'Armour 40 %', 'Armour 60 %', 'Armour 80 %'], [0, 6000, 11000, 17000, 25000], ['No added protection.', 'Reinforced door beams.', 'Hidden armour plates in the doors.', 'Plated body and firewall.', 'Fully plated body. Heavy.'], (i) => i ? `Damage taken ${pct(-[0, 0.15, 0.28, 0.4, 0.5][i])}, weight ${pct([0, 0.02, 0.04, 0.06, 0.08][i])}` : null) },
  { id: 'exhaust', cat: 'exhaust', name: 'Exhaust', opts: (P, S) => {
    if (P.ev || (S && !S.exhaust)) return []; // no tail-pipe in the model (a cab-over truck's stack is not a separate part): nothing to replace
    if (bike(P)) return [STOCK(), O('carbon', 'Carbon slip-on', 3500, 'Carbon silencer on the stock link pipe.', { stat: 'Power +1.5 %, louder' }), O('titanium', 'Titanium slip-on', 4500, 'Burnt titanium can.', { stat: 'Power +2 %, louder' }), O('full', 'Full race system', 8000, 'Full titanium system with a short can.', { stat: 'Power +3 %, very loud' })];
    if (tuk(P)) return [STOCK(), O('sport', 'Free-flow pipe', 1500, 'Free-flow silencer.', { stat: 'Power +2 %, louder' })];
    const o = [STOCK(), O('sport', 'Sport single', 2500, 'Large single tip.', { stat: 'Power +1 %, deeper' }), O('twin', 'Twin tips', 4000, 'Twin round tips.', { stat: 'Power +1.5 %, deeper' })];
    if (sporty(P) || P.klass === 'exec') o.push(O('quad', 'Quad tips', 6000, 'Four tips, two each side.', { stat: 'Power +2 %, loud' }), O('titanium', 'Titanium twin', 7500, 'Burnt titanium tips.', { stat: 'Power +2 %, raspy' }));
    if (sporty(P)) o.push(O('straight', 'Straight-through', 9000, 'Straight-through race exhaust.', { stat: 'Power +2.5 %, very loud' }));
    if (P.klass === 'truck' || P.offroad) o.push(O('stack', 'Upturned stack', 4500, 'Upturned chrome tip.', { stat: 'Power +1 %, louder' }));
    return o; } },

  // ---------------------------------------------------------------- extras
  { id: 'weight', cat: 'extras', name: 'Weight reduction', opts: (P) => sporty(P) || bike(P) ? lv(3, ['Stock', 'Light', 'Stripped'], [0, 5000, 10000], ['Factory weight.', 'Lightweight battery, seats and panels.', 'Stripped interior trim, carbon panels.'], (i) => i ? `Weight ${pct(-[0, 0.03, 0.06][i])}` : null) : [] },
  { id: 'sprocket', cat: 'extras', name: 'Final drive', opts: (P) => bike(P) ? [O('stock', 'Stock sprockets', 0, 'Factory gearing.'), O('short', 'Short gearing', 1500, 'Bigger rear sprocket: quicker off the line.', { stat: 'Acceleration +6 %, top speed −5 %' }), O('tall', 'Tall gearing', 1500, 'Smaller rear sprocket: higher top speed.', { stat: 'Acceleration −4 %, top speed +5 %' })] : [] },
  { id: 'horn', cat: 'extras', name: 'Horn', opts: (P) => [O('stock', 'Stock horn', 0, 'Factory horn.'), O('dual', 'Dual-tone', 800, 'Two-tone electric horn.'), O('sport', 'Sport', 1200, 'High-pitched twin trumpets.'), ...(car(P) && (P.klass === 'truck' || P.klass === 'van' || P.offroad) ? [O('air', 'Air horn', 2500, 'Deep compressed-air horn.')] : []), O('tune', 'Musical', 1800, 'A short rising four-note chime.')] },
  { id: 'bedcover', cat: 'extras', name: 'Load bed', opts: (P, S) => car(P) && P.klass === 'pickup' && S && S.bed ? [STOCK(), O('cover', 'Tonneau cover', 4000, 'Hard tonneau cover over the bed.')] : [] },
];
export const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

// ------------------------------------------------------------------------------------------------ queries
const optsCache = new Map();
// the slots (with their fitting options) for a vehicle; scan = BodyScan.features (null in pure tests: geometry slots omitted)
export function slotsFor(type, scan = null) {
  const P = profileOf(type); if (!P) return []; const key = type + (scan ? '|s' + scan.key : '');
  if (optsCache.has(key)) return optsCache.get(key);
  const out = []; for (const s of SLOTS) { const opts = s.opts(P, scan); if (s.kind === 'colour' ? opts.length >= 1 : opts.length >= 2) out.push({ ...s, options: opts }); }
  optsCache.set(key, out); return out;
}
export function categoriesFor(type, scan = null) { const sl = slotsFor(type, scan); return CATEGORIES.filter((c) => sl.some((s) => s.cat === c.id)); }
export function defaultValue(slot, P) { if (slot.kind === 'colour') return null; return slot.options ? slot.options[0].id : 'stock'; }
const round50 = (n) => Math.max(50, Math.round(n / 50) * 50);
// price of setting slot → value on this vehicle (0 when it is the stock / current value is not charged here)
export function priceOf(type, slotId, value, scan = null) {
  const P = profileOf(type); if (!P) return Infinity; const sl = slotsFor(type, scan).find((s) => s.id === slotId); if (!sl) return Infinity;
  if (sl.kind === 'colour') return value == null ? 0 : round50(sl.base * P.f);
  const o = sl.options.find((q) => q.id === value); if (!o) return Infinity; return o.base ? round50(o.base * P.f) : 0;
}
// is this value allowed on this vehicle? (compatibility gate: the applier and the save loader both call it)
export function valid(type, slotId, value, scan = null) {
  const sl = slotsFor(type, scan).find((s) => s.id === slotId); if (!sl) return false;
  if (sl.kind === 'colour') return value == null || /^#[0-9a-f]{6}$/i.test(value);
  return sl.options.some((o) => o.id === value);
}
// drop anything that does not fit (an old save, a different scan): returns a clean copy
export function sanitize(type, mods, scan = null) { const out = {}; if (!mods) return out; for (const k in mods) { if (k === 'plateText') { if (typeof mods[k] === 'string') out[k] = plateText(mods[k]); continue; } if (valid(type, k, mods[k], scan)) out[k] = mods[k]; } return out; }
// what a prerequisite-gated slot needs (UI lock text) and the mods as they actually apply: a wheel colour without a custom wheel,
// a +1 inch size on the factory wheel or a caliper colour on stock brakes is kept in the record but has no effect until its
// prerequisite is fitted again (the applier, tuneOf and the price list all read effective())
export const NEEDS_TEXT = { rimCol: 'Fit a custom wheel design first', rimFin: 'Fit a custom wheel design first', wsize: 'Fit a custom wheel design first', calCol: 'Fit uprated brakes first' };
export function slotLocked(slotId, mods) { const s = SLOT[slotId]; return !!(s && s.needs && !s.needs(mods || {})); }
export function effective(mods) { const out = {}; if (!mods) return out; for (const k in mods) if (!slotLocked(k, mods)) out[k] = mods[k]; return out; }
export const plateText = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 7).trim();
export function optionOf(type, slotId, value, scan = null) { const sl = slotsFor(type, scan).find((s) => s.id === slotId); return sl && sl.options.find((o) => o.id === value) || null; }
// performance level of a slot value (0 = stock)
const lvlOf = (v) => (v && v[0] === 'l' ? +v.slice(1) || 0 : 0);

// ------------------------------------------------------------------------------------------------ performance
// Multipliers on the vehicle's OWN numbers (VTYPES), applied per vehicle in Vehicle.drive() / chassis() / VehicleDamage. They
// never touch the shared type table. Capped so every vehicle keeps its character: a tuned kei car is a quick kei car, not a coupé.
export function tuneOf(type, mods = {}) {
  const P = profileOf(type); if (!P) return null; const m = effective(mods);
  const e = lvlOf(m.engine), tb = lvlOf(m.turbo), tr = lvlOf(m.trans), su = lvlOf(m.susp), lf = lvlOf(m.lift), br = lvlOf(m.brakes), ar = lvlOf(m.armour), wt = lvlOf(m.weight);
  const evE = [0, 0.07, 0.13, 0.19], ice = [0, 0.07, 0.13, 0.19, 0.25];
  let accel = 1 + (P.ev ? evE[e] || 0 : ice[e] || 0), top = 1 + [0, 0.02, 0.04, 0.06, 0.08][e];
  const exP = { stock: 0, sport: P.kind === 'tuk' ? 0.02 : 0.01, twin: 0.015, quad: 0.02, titanium: 0.02, straight: 0.025, stack: 0.01, carbon: 0.015, full: 0.03 }[m.exhaust || 'stock'] || 0; accel += exP;
  if (P.kind === 'bike') { if (m.sprocket === 'short') { accel += 0.06; top -= 0.05; } else if (m.sprocket === 'tall') { accel -= 0.04; top += 0.05; } }
  if (m.rims === 'forged7' || m.rims === 'mono7') accel += 0.01;
  const mass = 1 + [0, 0.02, 0.04, 0.06, 0.08][ar] * (P.kind === 'tuk' ? 0.6 : 1) - [0, 0.03, 0.06][wt] + (m.crashbars === 'bars' ? 0.01 : 0);
  accel /= mass;
  const turbo = tb ? { k: [0, 0.08, 0.13, 0.18][tb], spool: [1, 0.9, 0.7, 0.55][tb] } : null; if (tb) top += [0, 0.02, 0.03, 0.04][tb];
  const trans = tr ? { pull: [0, 0.05, 0.09, 0.13][tr], resp: [0, 0.1, 0.2, 0.3][tr] } : null;
  let grip = 1, roll = 1, ride = 0;
  if (P.kind === 'bike') grip *= 1 + [0, 0.03, 0.06][su];
  else if (P.offroad && car(P)) { grip *= 1 + [0, 0.02, 0.04][su]; roll *= 1 - [0, 0.08, 0.15][su]; }
  else { grip *= 1 + [0, 0.02, 0.04, 0.06, 0.08][su]; roll *= 1 - [0, 0.1, 0.18, 0.26, 0.34][su]; ride -= [0, 0.02, 0.03, 0.04, 0.05][su]; }
  if (lf) { ride += [0, 0.04, 0.07][lf]; roll *= 1 + [0, 0.08, 0.15][lf]; grip *= 1 - [0, 0.02, 0.04][lf]; }
  const tyre = m.tyres || 'stock'; const gripT = { stock: 1, sport: 1.04, semi: 1.08, at: 0.98, mt: P.kind === 'bike' ? 0.97 : 0.96 }[tyre] || 1; const wetT = tyre === 'semi' ? 0.94 / 1.08 : 1;
  const burstResist = tyre === 'at' ? 0.35 : tyre === 'mt' ? (P.kind === 'bike' ? 0.4 : 0.5) : 0;
  let steer = 1 + (m.wsize === 'p1' ? 0.04 : m.wsize === 'p2' ? 0.07 : 0); if (trans) steer += 0; const brake = 1 + [0, 0.12, 0.24, 0.36][br];
  const armour = (1 - [0, 0.15, 0.28, 0.4, 0.5][ar] * (P.kind === 'tuk' ? 0.8 : 1)) * (m.crashbars === 'bars' ? 0.92 : 1);
  const wing = m.spoiler === 'wing' ? 0.02 : 0;
  accel = Math.min(accel, 1.55); top = Math.min(top, 1.15);
  const exhaust = m.exhaust && m.exhaust !== 'stock' ? m.exhaust : null;
  return { accel, top, brake, grip: grip * gripT, gripWet: wetT, wing, roll, ride, steer, armour, mass, turbo, trans, runflat: m.bulletproof === 'runflat', burstResist, exhaust, horn: m.horn && m.horn !== 'stock' ? m.horn : null, smoke: m.smoke || null, track: m.fenders === 'wide' ? 0.03 : 0 };
}
// a few headline numbers for the UI stat bars (0..1 across the whole roster so bars compare between vehicles)
export function statsOf(type, mods = {}) {
  const P = profileOf(type); if (!P) return null; const T = P.T; const t = tuneOf(type, mods) || {}; const c01 = (x) => Math.max(0.03, Math.min(1, x));
  const turboK = t.turbo ? t.turbo.k * 0.8 : 0, pull = t.trans ? t.trans.pull * 0.6 : 0;
  return { speed: c01(T.maxSpeed * t.top / 85), accel: c01(T.accel * (t.accel + turboK + pull) / 15), braking: c01((T.entry === 'bike' ? 0.8 : T.mass > 3000 ? 0.62 : 0.72) * t.brake / 1.4), handling: c01((T.entry === 'bike' ? 0.62 : T.mass > 3000 ? 0.4 : 0.7) * t.grip * (2 - t.roll * 0.5) / 1.9 + (T.steer || 0.5) * 0.15 * t.steer), armour: c01((1 - t.armour) / 0.5 * 0.85 + 0.1) };
}
