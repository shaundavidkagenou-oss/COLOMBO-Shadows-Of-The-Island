// 83rd request — URBAN BIRDS & ENVIRONMENTAL AMBIENCE: slots on the existing `sounds` board (SoundBank / SoundsWindow — the same
// upload, file name, assigned / empty status, preview, replace, remove and persistence as every other slot). The player supplies
// every recording: nothing is synthesised, downloaded or substituted — an empty slot is silent and shown as empty.
// Played by src/world/BirdAudio.js: calls / wing sounds from the bird that makes them (3D, distance attenuation, varied
// intervals, a per-slot cooldown and a small voice cap so a flock never spams), ambience beds from one shared positional
// source per kind (decorative birds share it instead of each bird playing a loop), faded out when nothing feeds them and
// stopped when the area they come from unloads.
const D = [];
const add = (id, name, cat, o = {}) => { const d = { id, name, cat, lvl: 0.45, fb: 'silent (upload a recording)', ...o }; D.push(d); return d; };

export const BA_GROUP = 'URBAN BIRDS & ENVIRONMENTAL AMBIENCE';
export const BA_CAT = {
  A: BA_GROUP + ' — A · Bird calls',
  B: BA_GROUP + ' — B · Wings & flight',
  C: BA_GROUP + ' — C · Bird ambience beds',
  D: BA_GROUP + ' — D · Balconies & residential ambience',
};
const { A, B, C, D: E } = BA_CAT;
// A · calls (one-shots from the bird that calls; several variations of a slot are picked at random when uploaded)
add('ba.crow.call', 'House Crow Call (harsh "kaaw" from a perched or flying crow)', A, { lvl: 0.5 });
add('ba.crow.call2', 'House Crow Call — variation 2 (a run of calls / two crows answering)', A, { lvl: 0.5 });
add('ba.myna.call', 'Common Myna Call (chattering, whistles and croaks from a perched myna)', A, { lvl: 0.45 });
add('ba.myna.call2', 'Common Myna Call — variation 2 (pair chattering on a wire / balcony rail)', A, { lvl: 0.45 });
add('ba.pigeon.coo', 'Rock Pigeon Cooing (soft coo from pigeons on ledges and roofs)', A, { lvl: 0.4 });
add('ba.kite.call', 'Black Kite Call (thin whistling whinny from a kite soaring overhead)', A, { lvl: 0.5 });
add('ba.distant', 'Distant Bird Calls (single calls far off — mixed species, used for birds out of sight)', A, { lvl: 0.3 });
// B · wings
add('ba.pigeon.flutter', 'Pigeon Wing Flutter (clattering take-off of one or a few pigeons)', B, { lvl: 0.5 });
add('ba.wing.move', 'Bird Wing Movement (short wing shuffle / settling on a perch)', B, { lvl: 0.35 });
add('ba.flight', 'Bird Flight Pass (wingbeats of a crow or flock flying close past)', B, { lvl: 0.4 });
add('ba.flock.takeoff', 'Flock Take-off (many birds scattering at once — after a gunshot or a loud event)', B, { lvl: 0.55 });
// C · bird ambience beds (loops — one shared positional source per bed)
add('ba.amb.morning', 'Morning Birds Ambience (loop · dawn chorus: crows, mynas, koel — about 5:30–9:00)', C, { kind: 'loop', lvl: 0.4 });
add('ba.amb.day', 'Daytime Birds Ambience (loop · scattered calls over the city by day)', C, { kind: 'loop', lvl: 0.35 });
add('ba.amb.rooftop', 'Rooftop Birds Ambience (loop · pigeons and crows on the roofs around you, when you are up high)', C, { kind: 'loop', lvl: 0.4 });
add('ba.amb.tree', 'Tree Birds Ambience (loop · birds in nearby trees: mynas, sparrows, bulbuls)', C, { kind: 'loop', lvl: 0.4 });
// D · balconies & residential
add('ba.curtain.wind', 'Balcony Curtain Wind (loop · cloth curtain flapping in an open window / balcony screen)', E, { kind: 'loop', lvl: 0.3 });
add('ba.laundry', 'Laundry Fabric Movement (loop · washing on a line moving in the wind)', E, { kind: 'loop', lvl: 0.3 });
add('ba.amb.residential', 'Distant Residential Ambience (loop · far-off household sounds, radio, voices, a pressure cooker)', E, { kind: 'loop', lvl: 0.35 });
add('ba.amb.city', 'Outdoor City Ambience (loop · open-air city bed between the buildings)', E, { kind: 'loop', lvl: 0.35 });
add('ba.amb.roof', 'Rooftop Ambience (loop · wind and the city below, on a roof)', E, { kind: 'loop', lvl: 0.35 });

export const BA_SOUND_DEFS = D;
export const BA_CAT_INFO = {
  [A]: 'Calls from the bird that makes them: crows, mynas and pigeons perched near you, a black kite circling over the coast and open ground. Each slot has a cooldown and at most a few calls play at once; birds out of sight use the distant-calls slot.',
  [B]: 'Wing sounds: pigeons clattering off a ledge, a bird settling on a perch, wingbeats when a bird flies close past, a whole flock scattering after a gunshot.',
  [C]: 'Beds that follow where the birds are: the dawn chorus in the morning, scattered calls by day, roof birds when you are high up, tree birds near big trees. One shared source per bed (the decorative birds feed it), faded in and out — never a loop per bird.',
  [D]: 'Around homes: curtains in open windows and washing on the balconies moving with the wind (only near them, louder in a strong wind; the washing goes quiet when it is taken in from the rain), distant household life in residential streets, the open-air city bed and the roof-top bed.',
};
