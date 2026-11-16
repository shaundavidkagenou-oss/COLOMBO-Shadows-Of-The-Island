// The boats of the Colombo waterfront: 5 luxury yachts, 10 boats, 4 personal watercraft and the police patrol boat.
// Every make and model is fictional (invented names, no real builder's styling marks or badges); the TYPES of boat are the
// real ones you see in Sri Lankan waters and marinas. Prices in Sri Lankan rupees.
//   layout: which builder in BoatModels.js draws it · max: top speed (m/s) · acc: thrust (m/s²) · turn: rate (rad/s)
//   plane: speed at which the hull gets on the plane (0 = displacement hull) · sail: carries sails (they can be shot through)
//   hp: hull strength (a service-pistol hit on the hull costs 1.65, like a car body; engine hits ×1.6) · seats: people aboard when an owner takes it out
export const BOATS = {
  // ------------------------------------------------------------------------------------------------ luxury yachts
  mirissa46: { cat: 'yacht', make: 'Mirissa Yachts', model: '46 Sloop', kind: 'Sailing yacht · 14.0 m', price: 185000000, layout: 'sloop', len: 14.0, beam: 4.3,
    col: { hull: '#f4f3ef', boot: '#173a63', anti: '#1b2232', sheer: '#173a63' }, max: 4.8, acc: 0.7, turn: 0.32, plane: 0, sail: true, hp: 260,
    blurb: 'A blue-water cruising sloop: teak cockpit, twin wheels, three cabins, in-mast furling main and self-tacking jib. Built for the Bay of Bengal crossing, at home off Galle Face.' },
  trinco44: { cat: 'yacht', make: 'Trinco Catamarans', model: '44 Cat', kind: 'Sailing catamaran · 13.4 m', price: 240000000, layout: 'cat', len: 13.4, beam: 7.3,
    col: { hull: '#f6f6f3', boot: '#2b2f36', anti: '#222428' }, max: 5.0, acc: 0.65, turn: 0.28, plane: 0, sail: true, hp: 280,
    blurb: 'Four cabins in two hulls, a panoramic saloon and a trampoline forward. Stable at anchor in Trincomalee bay, quick on a reach.' },
  halcyon52: { cat: 'yacht', make: 'Halcyon', model: '52 GT', kind: 'Sport cruiser · 16.2 m', price: 390000000, layout: 'sport', len: 16.2, beam: 4.6,
    col: { hull: '#ecebe7', boot: '#2a2c30', anti: '#1d1e21', sheer: '#3b3f46' }, max: 17, acc: 2.4, turn: 0.55, plane: 7, sail: false, hp: 300,
    blurb: 'An open express cruiser with a carbon radar arch, teak swim platform and a 34-knot top end on twin shaft-drive diesels.' },
  meridian72: { cat: 'yacht', make: 'Meridian Ocean', model: '72 Flybridge', kind: 'Flybridge motor yacht · 22.0 m', price: 720000000, layout: 'fly', len: 22.0, beam: 5.6,
    col: { hull: '#f2f2ef', boot: '#262a31', anti: '#1c1d20', sheer: '#9aa3ad' }, max: 15, acc: 1.6, turn: 0.4, plane: 8, sail: false, hp: 380,
    blurb: 'Full-beam owner\u2019s suite, a saloon wrapped in glass and a flybridge with a second helm, wet bar and sunpads. Crew cabin aft.' },
  serendib128: { cat: 'yacht', make: 'Serendib Shipyards', model: '128 Tri-Deck', kind: 'Superyacht · 39.0 m', price: 4800000000, layout: 'super', len: 39.0, beam: 8.0,
    col: { hull: '#1f2a3a', boot: '#d9dadc', anti: '#2a1b1d', sheer: '#1f2a3a' }, max: 8.5, acc: 0.55, turn: 0.18, plane: 0, sail: false, hp: 700,
    blurb: 'A displacement superyacht on three decks plus a sun deck: five guest suites, a beach club at the stern, tender garage and underwater lights. The island\u2019s finest.' },
  // ------------------------------------------------------------------------------------------------ boats
  dondra26: { cat: 'boat', make: 'Dondra Marine', model: '26 CC', kind: 'Centre-console · 8.0 m', price: 18500000, layout: 'cc', len: 8.0, beam: 2.6,
    col: { hull: '#f3f3f0', boot: '#f3f3f0', anti: '#f3f3f0', sheer: '#27507a' }, max: 21, acc: 3.6, turn: 0.95, plane: 6, sail: false, hp: 120,
    blurb: 'Twin 250 hp outboards, a T-top with rod holders, leaning post and live well. The fishing boat of choice off Negombo.' },
  kalpitiya21: { cat: 'boat', make: 'Kalpitiya Boatworks', model: '21 Bowrider', kind: 'Bowrider · 6.5 m', price: 9800000, layout: 'bowrider', len: 6.5, beam: 2.45,
    col: { hull: '#f2f2ee', boot: '#b8322c', anti: '#f2f2ee', sheer: '#b8322c' }, max: 18, acc: 3.0, turn: 1.0, plane: 5.5, sail: false, hp: 90,
    blurb: 'A family day boat: walk-through windscreen, wraparound bow seating, sterndrive and a fold-down swim ladder.' },
  galle58: { cat: 'boat', make: 'Galle Inflatables', model: 'Rib 580', kind: 'Rigid inflatable · 5.8 m', price: 6200000, layout: 'rib', len: 5.8, beam: 2.35,
    col: { hull: '#ecebe6', boot: '#ecebe6', anti: '#ecebe6', tube: '#2b2e33' }, max: 15, acc: 3.2, turn: 1.15, plane: 4.5, sail: false, hp: 70,
    blurb: 'Hypalon tubes on a deep-V GRP hull, jockey seat console and a 115 hp outboard. The yacht tender that can do a day trip.' },
  ruhunu39: { cat: 'boat', make: 'Ruhunu Performance', model: '39 Offshore', kind: 'Offshore powerboat · 12.0 m', price: 68000000, layout: 'offshore', len: 12.0, beam: 2.7,
    col: { hull: '#101215', boot: '#c9a033', anti: '#101215', sheer: '#c9a033' }, max: 28, acc: 4.2, turn: 0.62, plane: 8, sail: false, hp: 140,
    blurb: 'A stepped-hull go-fast with a tinted cuddy canopy, bolster seats and quad 400 hp outboards. 54 knots and a sound to match.' },
  negombo23: { cat: 'boat', make: 'Negombo Wake', model: '23 Surf', kind: 'Wakeboard boat · 7.0 m', price: 22000000, layout: 'wake', len: 7.0, beam: 2.55,
    col: { hull: '#f2f2ef', boot: '#1d6f8f', anti: '#f2f2ef', sheer: '#1d6f8f' }, max: 17, acc: 3.0, turn: 0.95, plane: 5.5, sail: false, hp: 95,
    blurb: 'Inboard V-drive, a folding wake tower with speaker pods and a ballast-shaped surf wake. Bow lounge seats six.' },
  unawatuna24: { cat: 'boat', make: 'Unawatuna Sail', model: '24 Daysailer', kind: 'Daysailer · 7.3 m', price: 12500000, layout: 'daysailer', len: 7.3, beam: 2.5,
    col: { hull: '#2f5d4a', boot: '#f1efe6', anti: '#20262b', sheer: '#2f5d4a' }, max: 3.6, acc: 0.6, turn: 0.55, plane: 0, sail: true, hp: 75,
    blurb: 'A classic-lined day sailer with a teak-trimmed cockpit, tiller steering, a small cuddy and an electric outboard well.' },
  beruwala23: { cat: 'boat', make: 'Beruwala FRP', model: '23 Day Boat', kind: 'Fibreglass fishing boat · 7.0 m', price: 2400000, layout: 'frp', len: 7.0, beam: 1.9,
    col: { hull: '#2a74b8', boot: '#e7e3d6', anti: '#2a74b8', sheer: '#d9a531', inner: '#ece7d8' }, max: 12, acc: 2.4, turn: 0.9, plane: 5, sail: false, hp: 60,
    blurb: 'The workhorse of the south coast: a 23-foot fibreglass day boat with a 25 hp outboard, timber thwarts and a high flared bow.' },
  oruwa: { cat: 'boat', make: 'Southern Coast', model: 'Oruwa', kind: 'Outrigger sailing canoe · 8.2 m', price: 950000, layout: 'oruwa', len: 8.2, beam: 0.75,
    col: { hull: '#5a3f2b', boot: '#5a3f2b', anti: '#3d2c1f', sheer: '#7a5a3e' }, max: 3.2, acc: 0.6, turn: 0.6, plane: 0, sail: true, hp: 50,
    blurb: 'The island\u2019s traditional outrigger canoe: a narrow hull with sewn washstrakes, a log float on two curved booms and a tall square sail.' },
  hikkaduwa30: { cat: 'boat', make: 'Hikkaduwa Craft', model: '30 Walkaround', kind: 'Cabin cruiser · 9.2 m', price: 34000000, layout: 'cruiser', len: 9.2, beam: 3.0,
    col: { hull: '#f1f1ed', boot: '#3a3e45', anti: '#2a2b2e', sheer: '#6d7a86' }, max: 14, acc: 2.4, turn: 0.75, plane: 6, sail: false, hp: 130,
    blurb: 'A hardtop walkaround with a cabin forward (vee berth, head, galley), a cockpit for four and a twin-outboard bracket.' },
  weligama40: { cat: 'boat', make: 'Weligama Sportfish', model: '40 Convertible', kind: 'Sport-fishing yacht · 12.5 m', price: 145000000, layout: 'sportfish', len: 12.5, beam: 4.2,
    col: { hull: '#f3f3f0', boot: '#13304f', anti: '#1b1f27', sheer: '#13304f' }, max: 17, acc: 2.2, turn: 0.6, plane: 7, sail: false, hp: 200,
    blurb: 'Flybridge, tuna tower and outriggers over a big cockpit with a fighting chair. Built to run 60 miles out to the blue marlin grounds.' },
  // ------------------------------------------------------------------------------------------------ personal watercraft
  wjspark: { cat: 'jetski', make: 'WaveJet', model: 'Spark 2', kind: 'Personal watercraft · 2 seats', price: 1450000, layout: 'jetski', len: 3.0, beam: 1.18, ski: 0,
    col: { hull: '#f2f2ee', deck: '#e8572b', seat: '#22252a', trim: '#2b2d31' }, max: 20, acc: 5, turn: 1.9, plane: 4, sail: false, hp: 35,
    blurb: 'Light, nimble and cheap to run: the easiest way onto the water.' },
  wjgti: { cat: 'jetski', make: 'WaveJet', model: 'GTI 170', kind: 'Personal watercraft · 3 seats', price: 2350000, layout: 'jetski', len: 3.3, beam: 1.22, ski: 1,
    col: { hull: '#e9ebee', deck: '#1d4f9c', seat: '#1f2226', trim: '#a9b0b7' }, max: 22, acc: 5, turn: 1.75, plane: 4, sail: false, hp: 40,
    blurb: 'A three-seat all-rounder with a stable hull, reverse and cruise control.' },
  wjrxt: { cat: 'jetski', make: 'WaveJet', model: 'RXT-X 300', kind: 'Performance watercraft · 3 seats', price: 4900000, layout: 'jetski', len: 3.45, beam: 1.27, ski: 2,
    col: { hull: '#16181b', deck: '#d8d02c', seat: '#121314', trim: '#3a3d42' }, max: 30, acc: 6.8, turn: 1.7, plane: 4.5, sail: false, hp: 45,
    blurb: 'Supercharged 300 hp, a deep-V rough-water hull and race-tuned ergonomics. 58 knots.' },
  wjcruise: { cat: 'jetski', make: 'WaveJet', model: 'Cruise LTD', kind: 'Luxury touring watercraft · 3 seats', price: 6300000, layout: 'jetski', len: 3.6, beam: 1.27, ski: 3,
    col: { hull: '#3a2f2a', deck: '#c7b9a3', seat: '#5a3b2a', trim: '#b9a585' }, max: 27, acc: 5.6, turn: 1.6, plane: 4.5, sail: false, hp: 50,
    blurb: 'Touring seat with backrest, audio, a big glovebox and a swim platform — the long-range lounge of the water.' },
  // ------------------------------------------------------------------------------------------------ police (not for sale)
  police36: { cat: 'police', make: 'Sri Lanka Police', model: 'Marine Patrol', kind: 'Police patrol boat · 11.0 m', price: 0, layout: 'police', len: 11.0, beam: 3.2,
    col: { hull: '#f2f3f4', boot: '#123a7a', anti: '#2a2d33', sheer: '#123a7a' }, max: 20, acc: 3.0, turn: 0.75, plane: 6.5, sail: false, hp: 220 },
};
export const YACHT_IDS = Object.keys(BOATS).filter((k) => BOATS[k].cat === 'yacht');
export const BOAT_IDS = Object.keys(BOATS).filter((k) => BOATS[k].cat === 'boat');
export const JETSKI_IDS = Object.keys(BOATS).filter((k) => BOATS[k].cat === 'jetski');
export const SALE_IDS = [...YACHT_IDS, ...BOAT_IDS, ...JETSKI_IDS];
export const boatName = (id) => { const b = BOATS[id]; return b ? `${b.make} ${b.model}` : id; };
export const rsBoat = (n) => `Rs. ${Math.round(n).toLocaleString('en-LK')}`;
