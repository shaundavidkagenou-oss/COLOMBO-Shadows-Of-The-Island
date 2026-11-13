// Protagonist wardrobe: the clothing store / luxury boutique catalogues, the barber's cuts and the tattoo choices, and
// applyLook() — which turns a saved look into a Character spec. Every item maps onto garment / accessory builders that are
// fitted to the hero body (HeroBody shells for tops, trousers and coats; head-fitted hats and sunglasses in HeroHead), so a
// look is built around the body instead of being a mesh dropped on top of it — nothing can sink into the skin or poke
// through another layer:
//   • a hat swaps the hair for its flattened under-hat version, and the crown is fitted to that head + hair surface;
//   • a coat drops the protagonist's own over-layers (open-shirt tails, tactical vest + straps, belt) and its shell is grown
//     over the outermost layer under it;
//   • tops replace the kit's top layer, keeping only what fits under them.
// Saved per protagonist in story.state.outfits[id]: the older format (a jacket colour string from the tailor) still works.
import { COATS as COAT_KINDS } from './HeroBody.js';
const T = (id, name, price, p) => ({ id, name, price, ...p });
const col = (list, kind, pre, price, extra = {}) => list.map(([n, c, more], i) => T(`${kind}-${i}`, `${n} ${pre}`.trim(), typeof price === 'function' ? price(i) : price, { kind, col: c, ...extra, ...(more || {}) }));

// ---- hats (50): 8 shapes
const HATS = [
  ...col([['Black', '#161616'], ['Navy', '#1c2740'], ['Olive', '#4a5233'], ['Stone', '#b9b09a'], ['White', '#ecebe6'], ['Maroon', '#5e1d22'], ['Charcoal', '#33363b'], ['Sand', '#c8b08a'], ['Forest', '#24402e'], ['Royal blue', '#2a4a9a']], 'cap', 'cotton baseball cap', 2900),
  ...col([['Black', '#121212'], ['Heather grey', '#7d8084'], ['Red', '#9a1e1e'], ['Teal', '#1f5f63'], ['Mustard', '#b8902a'], ['Cream', '#e6dcc4']], 'snap', 'flat-brim snapback', 3400),
  ...col([['Black', '#151515'], ['Charcoal', '#3a3c40'], ['Navy', '#1d2840'], ['Oatmeal', '#c9bca4'], ['Burgundy', '#5a1a24'], ['Moss', '#4d5536']], 'beanie', 'rib-knit beanie', 2400),
  ...col([['Khaki', '#a8996e'], ['Black', '#161616'], ['Denim', '#3a5578'], ['White', '#e8e6df'], ['Olive', '#4f5636'], ['Tan', '#a07a4e']], 'bucket', 'cotton bucket hat', 3200),
  ...col([['Black', '#141414'], ['Charcoal', '#34363a'], ['Chocolate', '#3c2618'], ['Camel', '#a37a4c'], ['Navy', '#1c2436'], ['Dove grey', '#8e8c88']], 'fedora', 'wool-felt fedora', 9500, { band: '#121212' }),
  ...col([['Grey', '#6e6c68'], ['Brown', '#5a3e28'], ['Black', '#151515'], ['Olive', '#4a4c34'], ['Navy', '#20283a']], 'trilby', 'felt trilby', 8500, { band: '#151515' }),
  ...col([['Natural / black band', '#d8c69c', { band: '#151515' }], ['Natural / navy band', '#d8c69c', { band: '#1d2740' }], ['Natural / brown band', '#d8c69c', { band: '#4a2e1c' }], ['Bleached / black band', '#ece4cc', { band: '#151515' }], ['Toast / tan band', '#b89a68', { band: '#7a5532' }], ['Natural / striped band', '#d8c69c', { band: '#7a1e22' }]], 'panama', 'straw Panama', 12500),
  ...col([['Brown tweed', '#5a4632'], ['Grey herringbone', '#6a6a66'], ['Navy wool', '#202a3c'], ['Olive tweed', '#4e5038'], ['Black wool', '#161616']], 'flat', 'flat cap', 6500),
];
// ---- tops (50): tee / long-sleeve tee / polo / short-sleeve shirt / dress shirt / open shirt over a tee
const TOPS = [
  ...col([['White', '#ecebe6'], ['Black', '#161616'], ['Heather grey', '#8a8c90'], ['Navy', '#1d2840'], ['Olive', '#4a5233'], ['Maroon', '#5e1d22'], ['Sky', '#8fb0d0'], ['Mustard', '#c49a2c'], ['Forest', '#24402e'], ['Sand', '#c8b08a'], ['Rust', '#9a4a26'], ['Teal', '#1f5f63']], 'tee', 'crew-neck tee', 3200),
  ...col([['White', '#ecebe6'], ['Black', '#161616'], ['Grey marl', '#7d8084'], ['Navy', '#1d2840'], ['Olive', '#4a5233'], ['Burgundy', '#5a1a24']], 'longtee', 'long-sleeve tee', 3900),
  ...col([['White', '#f0efea'], ['Navy', '#1c2740'], ['Black', '#151515'], ['Racing green', '#1f3d2a'], ['Red', '#9a1e1e'], ['Sky', '#9ab8d8'], ['Pale yellow', '#e6d79a'], ['Charcoal', '#34363a']], 'polo', 'piqué polo', 4900),
  ...col([['White linen', '#efece4'], ['Sky linen', '#a8c0d8'], ['Sage', '#8a9a7a'], ['Navy', '#22304a'], ['Rust', '#9a4a26'], ['Blue stripe', '#e8eef4', { stripe: '#4a6a9a' }], ['Red stripe', '#f0ece6', { stripe: '#9a2a2a' }], ['Green stripe', '#eef0e8', { stripe: '#3a6a44' }]], 'shirt', 'short-sleeve shirt', 5500),
  ...col([['White poplin', '#f2f1ec'], ['Pale blue', '#c8d8e8'], ['Pink', '#e8c8c8'], ['Lavender', '#cfc6e0'], ['Charcoal', '#3a3c40'], ['Black', '#151515'], ['Bengal stripe', '#e4ecf4', { stripe: '#3a5a8a' }], ['Grey stripe', '#eeeeec', { stripe: '#6a6c70' }], ['Mint', '#cfe4d6'], ['Cream', '#ece4d0']], 'dress', 'dress shirt', 7500),
  ...col([['Maroon over white', '#7b2d26', { inner: '#ece7dc' }], ['Denim over white', '#4a6a8e', { inner: '#ece7dc' }], ['Olive over black', '#4f5636', { inner: '#1a1a1a' }], ['Black over grey', '#1a1a1a', { inner: '#8a8c90' }], ['Mustard over white', '#b8902a', { inner: '#ece7dc' }], ['Navy over white', '#22304a', { inner: '#ece7dc' }]], 'open', 'open shirt & tee', 6900),
];
// ---- trousers (50): jeans / chinos / tailored trousers / cargo
const PANTS = [
  ...col([['Raw indigo', '#1f2a44'], ['Mid blue', '#3a5578'], ['Light blue', '#7d98b8'], ['Black', '#18191c'], ['Grey', '#55585e'], ['Stone wash', '#6a84a4'], ['Dark indigo', '#1a2238'], ['Faded', '#8aa0bc'], ['Charcoal', '#2e3034'], ['Blue-black', '#1b2030'], ['Ice', '#a8bcd0'], ['Vintage', '#4d6a8c']], 'jeans', 'jeans', (i) => 5900 + (i % 3) * 600, { denim: true }),
  ...col([['Khaki', '#a8996e'], ['Stone', '#bdb29a'], ['Navy', '#22304a'], ['Olive', '#4f5636'], ['Black', '#18191c'], ['Tan', '#a07a4e'], ['Sand', '#c8b590'], ['Burgundy', '#5a1f26'], ['Grey', '#6e7074'], ['Cream', '#e0d6bf'], ['Rust', '#8a4426'], ['Forest', '#28402e'], ['Brown', '#5a4030'], ['Slate', '#4a5560']], 'chino', 'chinos', 5200),
  ...col([['Charcoal', '#33363b'], ['Navy', '#1c2436'], ['Black', '#141518'], ['Light grey', '#8a8c90'], ['Mid grey', '#5e6064'], ['Brown', '#4a3628'], ['Tan', '#9a7a52'], ['Cream linen', '#e2d9c4'], ['Bottle green', '#22382c'], ['Oxblood', '#4a1c1e'], ['Slate', '#4a525c'], ['Taupe', '#7a6e60']], 'suit', 'tailored trousers', 8900, { crease: true }),
  ...col([['Olive', '#4f5636'], ['Khaki', '#a8996e'], ['Black', '#18191c'], ['Sand', '#c4b08a'], ['Grey', '#6a6c70'], ['Brown', '#5a4030'], ['Navy', '#22304a'], ['Stone', '#b4aa94'], ['Forest', '#28402e'], ['Charcoal', '#33363b'], ['Tan', '#a07a4e'], ['Coyote', '#7d6a4a']], 'cargo', 'cargo trousers', 6200, { cargo: true }),
];
// ---- sunglasses (50): 7 frame shapes, frame colour / metal, lens tint
const G = (list, style, pre, price) => list.map(([n, frame, lens, metal, op], i) => T(`${style}-${i}`, `${n} ${pre}`, price, { style, frame, lens, metal: !!metal, op: op ?? 0.82 }));
const GLASSES = [
  ...G([['Gold / G-15 green', '#c9a54e', '#2c3a2a', 1], ['Gold / brown', '#c9a54e', '#4a3220', 1], ['Silver / grey', '#c0c2c4', '#2a2c30', 1], ['Silver / blue mirror', '#c0c2c4', '#2a4a7a', 1, 0.9], ['Black / grey', '#1a1a1a', '#26282c', 1], ['Gunmetal / grey', '#55585c', '#2a2c30', 1], ['Gold / gradient', '#c9a54e', '#5a4a3a', 1, 0.6], ['Rose gold / brown', '#c8907a', '#4a3024', 1]], 'aviator', 'aviators', 14500),
  ...G([['Black / grey', '#121212', '#24262a'], ['Tortoise / brown', '#5a3418', '#3a2618'], ['Black / green', '#121212', '#28362a'], ['Matte black', '#1d1d1d', '#202226'], ['Navy / grey', '#1c2740', '#2a2c30'], ['Red / grey', '#7a1c1c', '#2a2c30'], ['Crystal / grey', '#c8ccd0', '#2a2c30'], ['White / grey', '#e8e8e4', '#2a2c30']], 'wayfarer', 'wayfarers', 11500),
  ...G([['Gold / green', '#c9a54e', '#2c3a2a', 1], ['Black / grey', '#121212', '#24262a'], ['Tortoise / brown', '#5a3418', '#3a2618'], ['Silver / blue', '#c0c2c4', '#2a3a5a', 1], ['Gold / amber', '#c9a54e', '#8a5a1e', 1, 0.6], ['Black metal / grey', '#1a1a1a', '#26282c', 1], ['Crystal / rose', '#d8d4d0', '#8a5a5a', 0, 0.55]], 'round', 'round frames', 9500),
  ...G([['Black / grey', '#121212', '#24262a'], ['Tortoise / green', '#5a3418', '#28362a'], ['Gunmetal / grey', '#55585c', '#2a2c30', 1], ['Matte navy / grey', '#1c2740', '#26282c'], ['Silver / grey', '#c0c2c4', '#2a2c30', 1], ['Olive / brown', '#4a5233', '#3a2618'], ['Black / yellow', '#121212', '#a08a2a', 0, 0.5]], 'rect', 'rectangular frames', 8500),
  ...G([['Black & gold / green', '#121212', '#28362a', 1], ['Tortoise & gold / brown', '#5a3418', '#3a2618', 1], ['Black & silver / grey', '#121212', '#26282c', 1], ['Havana & gold / green', '#6a3a1c', '#2c3a2a', 1], ['Wine & gold / brown', '#5a1a24', '#3a2618', 1], ['Navy & silver / grey', '#1c2740', '#2a2c30', 1]], 'club', 'browline frames', 13500),
  ...G([['Black / fire mirror', '#151515', '#8a3a1a', 0, 0.9], ['White / ice mirror', '#e8e8e4', '#4a6a8a', 0, 0.9], ['Grey / grey', '#4a4c50', '#24262a'], ['Black / green mirror', '#151515', '#2a5a3a', 0, 0.9], ['Navy / blue mirror', '#1c2740', '#2a4a8a', 0, 0.9], ['Red / grey', '#8a1c1c', '#26282c'], ['Black / gold mirror', '#151515', '#8a6a2a', 0, 0.9]], 'sport', 'sport wraps', 10500),
  ...G([['Black / grey', '#121212', '#202226'], ['Tortoise / brown', '#5a3418', '#3a2618'], ['Ivory / grey', '#e6e0d0', '#2a2c30'], ['Black / green', '#121212', '#28362a'], ['Brown / gradient', '#4a3020', '#5a4a3a', 0, 0.6], ['Grey / blue', '#5a5c60', '#2a3a5a'], ['Black / gold', '#121212', '#5a4a2a', 1]], 'square', 'oversized squares', 12500),
];
// ---- shoes (50): trainers / oxfords & derbies / boots
const S = (list, kind, pre, price) => list.map(([n, c, sole, more], i) => T(`${kind}-${i}`, `${n} ${pre}`, price, { kind, col: c, sole, ...(more || {}) }));
const SHOES = [
  ...S([['White', '#ecebe6', '#e8e6df'], ['Black', '#161616', '#e8e6df'], ['Black / black', '#161616', '#1c1c1c'], ['Grey', '#8a8c90', '#e8e6df'], ['Navy', '#1d2840', '#e8e6df'], ['Cream', '#e6dcc4', '#d8cdb4'], ['Red', '#9a1e1e', '#e8e6df'], ['Forest', '#24402e', '#e8e6df'], ['Tan suede', '#a87e52', '#e0d8c8'], ['Olive', '#4a5233', '#d8cdb4'], ['White / gum', '#ecebe6', '#9a6a3a'], ['Grey / gum', '#8a8c90', '#9a6a3a'], ['Sky', '#9ab8d8', '#e8e6df'], ['Burgundy', '#5a1a24', '#e8e6df'], ['Charcoal', '#34363a', '#e8e6df'], ['Sand', '#c8b08a', '#e8e6df'], ['Teal', '#1f5f63', '#e8e6df'], ['Mustard', '#c49a2c', '#e8e6df'], ['Off-white / navy', '#e8e4da', '#1d2840'], ['Triple white', '#f2f2ee', '#f2f2ee']], 'sneaker', 'trainers', 8900),
  ...S([['Black', '#121212', '#1a1714'], ['Dark brown', '#3a2416', '#1a1714'], ['Oxblood', '#3b1c12', '#1a1714'], ['Tan', '#8a5a32', '#2a2016'], ['Chestnut', '#6a3a1c', '#2a2016'], ['Cognac', '#9a5a26', '#2a2016'], ['Burgundy', '#4a1a1c', '#1a1714'], ['Walnut', '#5a3a22', '#1a1714'], ['Black suede', '#1d1d1d', '#1a1714'], ['Brown suede', '#5a4030', '#2a2016'], ['Navy suede', '#1d2436', '#1a1714'], ['Grey suede', '#6a6a66', '#1a1714'], ['Two-tone black / white', '#151515', '#1a1714', { toe: '#ecebe6' }], ['Mahogany', '#4a2216', '#1a1714'], ['Espresso', '#2a1a10', '#1a1714']], 'oxford', 'leather shoes', 12900),
  ...S([['Black chelsea', '#141414', '#1a1714'], ['Brown chelsea', '#4a2e1a', '#1a1714'], ['Tan suede chelsea', '#9a7048', '#2a2016'], ['Black combat', '#161616', '#1c1c1c'], ['Brown work', '#5a3a1e', '#2a1e14'], ['Wheat work', '#b8884a', '#3a2a1c'], ['Olive desert', '#5a5a3a', '#c8b08a'], ['Sand desert', '#b8a07a', '#9a6a3a'], ['Oxblood', '#3b1c12', '#1a1714'], ['Grey suede', '#6a6a66', '#1a1714'], ['Black lace-up', '#121212', '#1a1714'], ['Cognac lace-up', '#8a4a20', '#2a2016'], ['Charcoal', '#33363b', '#1a1714'], ['Navy suede', '#1d2436', '#1a1714'], ['Chocolate', '#3a2416', '#1a1714']], 'boot', 'boots', 15900),
];
// ---- luxury boutique: coats (20) + shoes (20)
const COATS = [
  ...col([['Charcoal wool', '#2e3035'], ['Midnight navy', '#1a2134'], ['Camel', '#a37c50'], ['Cream linen', '#ddd3bc'], ['Olive cashmere', '#4a4c34'], ['Black barathea', '#141518']], 'blazer', 'blazer', (i) => 145000 + i * 15000),
  ...col([['Camel cashmere', '#a87e52'], ['Charcoal melton', '#34363a'], ['Navy melton', '#1c2436'], ['Black wool', '#151517']], 'car', 'car coat', (i) => 265000 + i * 20000),
  ...col([['Black lambskin', '#121212'], ['Dark brown calf', '#3a2416'], ['Oxblood', '#3b1a14'], ['Tobacco suede', '#7a5232']], 'leather', 'leather jacket', (i) => 320000 + i * 30000),
  ...col([['Black nylon', '#16171a'], ['Olive', '#3e4430'], ['Navy', '#1c2436']], 'bomber', 'bomber', 98000),
  ...col([['Khaki', '#9a8a62'], ['Olive', '#4a4e36'], ['Stone', '#b4a88e']], 'field', 'field jacket', 118000),
];
const LUXSHOES = [
  ...S([['Black calf', '#0f0f0f', '#14110e'], ['Dark brown calf', '#2e1c10', '#14110e'], ['Oxblood calf', '#3a1810', '#14110e'], ['Cognac museum calf', '#8a4818', '#1e1610'], ['Burgundy', '#401416', '#14110e'], ['Chestnut patina', '#5e3016', '#1e1610'], ['Black patent', '#080808', '#0e0e0e'], ['Navy calf', '#161e30', '#14110e']], 'oxford', 'Oxfords — hand-welted', 85000),
  ...S([['Black', '#101010', '#14110e'], ['Snuff suede', '#7a5a3a', '#1e1610'], ['Dark brown', '#2e1c10', '#14110e'], ['Grey suede', '#5e5c58', '#14110e'], ['Tobacco', '#6a4224', '#1e1610'], ['Navy suede', '#1a2234', '#14110e']], 'boot', 'Chelsea boots', 98000, { lux: true }),
  ...S([['Tan brogue', '#9a6232', '#1e1610'], ['Black brogue', '#101010', '#14110e'], ['Walnut wingtip', '#4e2e18', '#14110e'], ['Two-tone spectator', '#5a3418', '#14110e', { toe: '#ece6d6' }], ['Mahogany derby', '#4a2014', '#14110e'], ['Espresso derby', '#24160c', '#14110e']], 'oxford', 'brogues & derbies', 78000),
].map((it, i) => ({ ...it, id: 'lux-' + i }));

export const CATALOGUE = { hats: HATS, tops: TOPS, pants: PANTS, glasses: GLASSES, shoes: SHOES, coats: COATS, luxshoes: LUXSHOES };
export const CATEGORY_NAMES = { hats: 'Hats', tops: 'Tops', pants: 'Trousers', glasses: 'Sunglasses', shoes: 'Shoes', coats: 'Coats & jackets', luxshoes: 'Shoes' };
export const STORE_CATS = { clothing: ['hats', 'tops', 'pants', 'glasses', 'shoes'], luxury: ['coats', 'luxshoes'] };
// the slot each category fills in a look (luxury shoes are shoes)
export const SLOT = { hats: 'hat', tops: 'top', pants: 'pants', glasses: 'glasses', shoes: 'shoes', coats: 'coat', luxshoes: 'shoes' };
export function itemById(id) { if (!id) return null; for (const list of Object.values(CATALOGUE)) { const it = list.find((q) => q.id === id); if (it) return it; } return null; }

// ---- barber (HeroHead STYLES)
export const HAIRCUTS = [
  { id: 'crew', name: 'Crew cut', price: 1500 }, { id: 'buzz', name: 'Buzz cut', price: 1200 }, { id: 'fade', name: 'Skin fade', price: 2500 }, { id: 'crop', name: 'Textured crop', price: 2500 },
  { id: 'sidepart', name: 'Classic side part', price: 2000 }, { id: 'quiff', name: 'Quiff', price: 2500 }, { id: 'pomp', name: 'Pompadour', price: 3500 }, { id: 'slick', name: 'Slicked back', price: 2500 },
  { id: 'undercut', name: 'Disconnected undercut', price: 3000 }, { id: 'curly', name: 'Curly top', price: 3000 }, { id: 'hawk', name: 'Faux hawk', price: 3000 }, { id: 'afro', name: 'Afro', price: 3500 }, { id: 'bald', name: 'Clean shave (head)', price: 1500 },
];
export const HAIR_COLORS = [
  { id: 'jet', name: 'Jet black', col: '#0c0908', price: 0 }, { id: 'black', name: 'Natural black', col: '#15100c', price: 0 }, { id: 'darkbrown', name: 'Dark brown', col: '#2a1a10', price: 3500 },
  { id: 'chestnut', name: 'Chestnut', col: '#4a2a16', price: 4500 }, { id: 'saltpepper', name: 'Salt & pepper', col: '#5c5a56', price: 4500 }, { id: 'ash', name: 'Ash blonde', col: '#8a7a5a', price: 6500 },
  { id: 'burgundy', name: 'Burgundy', col: '#3e1418', price: 6500 }, { id: 'platinum', name: 'Platinum', col: '#c8c2b0', price: 8500 },
];
export const BEARDS = [
  { id: 'clean', name: 'Clean shaven', price: 800, p: { beard: false, beardShort: false, moustache: false, goatee: false, stubble: 0.12 } },
  { id: 'stubble', name: 'Stubble', price: 600, p: { beard: false, beardShort: false, moustache: false, goatee: false, stubble: 0.55 } },
  { id: 'moustache', name: 'Moustache', price: 900, p: { beard: false, beardShort: false, moustache: true, goatee: false, stubble: 0.3 } },
  { id: 'goatee', name: 'Goatee', price: 1200, p: { beard: true, beardShort: true, moustache: true, goatee: true, stubble: 0.3 } },
  { id: 'short', name: 'Short boxed beard', price: 1500, p: { beard: true, beardShort: true, moustache: true, goatee: false, stubble: 0 } },
  { id: 'full', name: 'Full beard', price: 1800, p: { beard: true, beardShort: false, moustache: true, goatee: false, stubble: 0 } },
];

// ---- look → spec
const KIT_EXTRAS = ['vest', 'strap', 'heroTie', 'vestBack', 'waist', 'stripe', 'inner', 'zip'];
export function applyLook(base, look) {
  const sp = { ...base }; if (!look) return sp;
  if (typeof look === 'string') { sp.top = look; return sp; } // tailor jacket colour (older saves)
  if (look.topColor) sp.top = look.topColor;
  if (sp.denim === undefined) sp.denim = base.kit === 'openShirt'; if (sp.crease === undefined) sp.crease = base.kit === 'waistcoat'; // the protagonists' own trouser fabrics survive a kit change
  const top = itemById(look.top);
  if (top) { for (const k of KIT_EXTRAS) delete sp[k]; delete sp.tacGloves; sp.kit = top.kind === 'open' ? 'openShirt' : null; sp.top = top.col; if (top.stripe) sp.stripe = top.stripe; if (top.inner) sp.inner = top.inner;
    sp.longSleeve = top.kind === 'longtee' || top.kind === 'dress'; sp.collar = top.kind === 'polo' || top.kind === 'shirt' || top.kind === 'dress' || top.kind === 'open'; sp.outfit = sp.collar ? 'shirt' : 'tee'; }
  const pants = itemById(look.pants);
  if (pants) { sp.bottom = pants.col; sp.denim = !!pants.denim; sp.crease = !!pants.crease; sp.cargo = !!pants.cargo; }
  const shoes = itemById(look.shoes);
  if (shoes) { sp.shoes = shoes.col; sp.sole = shoes.sole; sp.shoeKind = shoes.kind; sp.boots = shoes.kind === 'boot' && !shoes.lux && !/chelsea|suede|lace-up|oxblood|charcoal|chocolate/i.test(shoes.name); sp.sandals = false; /* work / combat / desert boots: trousers tucked into the shaft; dress boots sit under the trouser hem */ if (shoes.toe) sp.shoeToe = shoes.toe; else delete sp.shoeToe; }
  const gl = itemById(look.glasses);
  if (gl) { sp.glasses = false; sp.shades = { style: gl.style, frame: gl.frame, lens: gl.lens, metal: gl.metal, op: gl.op }; }
  const hat = itemById(look.hat);
  if (hat) sp.hat = { kind: hat.kind, col: hat.col, band: hat.band || null };
  const coat = itemById(look.coat);
  if (coat) { sp.coat = { kind: coat.kind, col: coat.col }; sp.kit = null; for (const k of ['vest', 'strap', 'zip', 'waist', 'vestBack', 'tacGloves', 'inner']) delete sp[k]; sp.collar = false; if (!(COAT_KINDS[coat.kind] || {}).v) delete sp.heroTie; } // everything worn over the shirt comes off under a coat; a closed jacket also covers the tie
  if (look.hair) sp.hair = look.hair; if (look.hairColor) { const hc = HAIR_COLORS.find((h) => h.id === look.hairColor); if (hc) sp.hairColor = hc.col; }
  if (look.beard) { const b = BEARDS.find((q) => q.id === look.beard); if (b) Object.assign(sp, b.p); }
  if (look.tattoos && Object.keys(look.tattoos).some((k) => look.tattoos[k])) sp.tattoos = { ...look.tattoos };
  return sp;
}
// a look object from whatever is saved (string → { topColor }); never shared with the save until committed
export function lookOf(saved) { if (!saved) return {}; if (typeof saved === 'string') return { topColor: saved }; return JSON.parse(JSON.stringify(saved)); }
