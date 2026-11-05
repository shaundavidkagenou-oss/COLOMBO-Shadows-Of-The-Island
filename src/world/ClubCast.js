// The people of The Velvet Monsoon (world/Club.js): four featured dancers, staff and customers. All adults (ages set
// explicitly, 24–31 for the dancers); fictional characters with stage names. Dancers wear club dancewear (sleeveless crop
// top or leotard, high-cut shorts, platform heels) — covered, nothing explicit. Kept free of browser-only imports so the
// Node tests can build them.
import { makeAppearance } from '../actors/Appearance.js';

export const DANCERS = [
  { name: 'Ruby', seed: 7101, age: 26, height: 1.69, build: 0.96, hair: 'long', hairColor: '#120c08', style: 'crop', top: '#b0122c', bottom: '#14080c', shoes: '#b0122c', necklace: true },
  { name: 'Jade', seed: 7102, age: 29, height: 1.66, build: 0.98, hair: 'ponytail', hairColor: '#1a120c', style: 'crop', top: '#0d7356', bottom: '#0d7356', shoes: '#101010' },
  { name: 'Opal', seed: 7103, age: 24, height: 1.71, build: 0.94, hair: 'bob', hairColor: '#0e0a08', style: 'leotard', top: '#d9d4e6', bottom: '#d9d4e6', shoes: '#d9d4e6' },
  { name: 'Saffron', seed: 7104, age: 31, height: 1.64, build: 1.0, hair: 'shoulder', hairColor: '#2a1a10', style: 'leotard', top: '#d9861a', bottom: '#d9861a', shoes: '#1a1210', necklace: true },
];
export function dancerSpec(d) {
  const crop = d.style === 'crop';
  return makeAppearance(d.seed, {
    preset: 'f_student', outfit: 'dancewear', label: `Dancer (${d.name})`, ageYears: d.age, height: d.height, build: d.build, belly: 0,
    hair: d.hair, hairColor: d.hairColor, top: d.top, bottom: d.bottom, sleeveless: true, longSleeve: false, collar: false,
    shorts: true, shortsY: crop ? 0.8 : 0.85, midriff: crop, cropY: 1.2, waistY: 0.975,
    heels: true, shoes: d.shoes, sole: '#0b0b0d', sandals: false, earrings: true, necklace: !!d.necklace,
    bag: undefined, crossbody: undefined, lanyard: undefined, glasses: false, sunglasses: false, watch: undefined, cap: undefined, skirt: undefined,
  });
}
// staff: bartender, two door supervisors, cashier; customers: a mixed adult crowd in evening clothes
export const STAFF = {
  bartender: { seed: 7201, sex: 'm', preset: 'm_office_young', outfit: 'shirt', top: '#111214', bottom: '#151515', collar: true, longSleeve: false, ageYears: 33 },
  bouncerA: { seed: 7202, preset: 'm_security', outfit: 'tee', top: '#0d0d0f', bottom: '#151518', ageYears: 38, build: 1.24, height: 1.86 },
  bouncerB: { seed: 7203, preset: 'm_security', outfit: 'tee', top: '#0d0d0f', bottom: '#151518', ageYears: 35, build: 1.2, height: 1.83 },
  cashier: { seed: 7204, preset: 'f_office_young', outfit: 'blouse_trousers', top: '#121212', bottom: '#151515', ageYears: 28 },
};
export const PATRON_SEEDS = [7301, 7302, 7303, 7304, 7305, 7306, 7307, 7308, 7309];
export function patronSpec(seed, i) {
  const f = i % 4 === 3; // mostly men, some women
  return makeAppearance(seed, { preset: f ? 'f_office_young' : ['m_office_young', 'm_creative', 'm_polo', 'm_it_dev', 'm_executive', 'm_office_mid'][i % 6], bag: undefined, crossbody: undefined, lanyard: undefined, backpack: undefined });
}

// ---------------------------------------------------------------- floor plan (room-local metres; entrance wall at +z)
// Shared by world/Club.js (builds it) and tools/club-test.mjs (checks the dancers, seats and poles against it).
export const CLUB = {
  W: 20, D: 24, H: 4.6,
  stageY: 0.8, podY: 0.6,
  poles: { stageL: { x: -2.3, z: -9.6, y0: 0.8 }, stageR: { x: 2.3, z: -9.6, y0: 0.8 }, round: { x: 0, z: -1.6, y0: 0.8 }, podium: { x: 5.6, z: 3.0, y0: 0.6 } },
  stage: { x0: -4.5, x1: 4.5, z0: -12, z1: -7.6 }, runway: { x0: -0.9, x1: 0.9, z0: -7.6, z1: -3.05 }, roundR: 1.5, podR: 1.15,
  // who dances where, and the spot she plays to
  dancerPole: ['stageL', 'stageR', 'round', 'podium'], audience: [[-2.3, -5.5], [2.3, -5.5], [0, 2.5], [2.4, 3.0]],
  drinkSpot: { x: -7.62, z: 0, yaw: -Math.PI / 2 },
  spawn: [0, 24 / 2 - 0.85],
};
const ringPhis = [-1.9, -1.425, -0.95, -0.475, 0.475, 0.95, 1.425, 1.9];
// every chair: [x, z, yaw]; yaw faces the show (forward = +z rotated by yaw)
export const CLUB_CHAIRS = [
  ...ringPhis.map((p) => [Math.sin(p) * 2.3, -1.6 + Math.cos(p) * 2.3, p + Math.PI]), // round the centre platform
  ...[-3.6, -1.6, 1.6, 3.6].map((x) => [x, -6.75, Math.PI]), // stage front (a gap at ±2.6 to walk up and tip)
  [1.75, -5.0, -Math.PI / 2], [1.75, -3.95, -Math.PI / 2], [-1.75, -5.0, Math.PI / 2], [-1.75, -3.95, Math.PI / 2], // runway sides
  ...[-2.5, -1.85, -0.75].map((p) => [5.6 + Math.sin(p) * 1.75, 3.0 + Math.cos(p) * 1.75, p + Math.PI]), // podium (a gap at the front-left to walk up and tip)
];
export const CLUB_BOOTHS = [-4.6, -1.2, 2.2]; // booth centres (z) along the right wall; bench seat x 9.35–10
// customers: seat (index into CLUB_CHAIRS, 'booth:i', or a standing spot [x, z, yaw])
export const PATRON_SPOTS = [{ chair: 2 }, { chair: 4 }, { chair: 6 }, { chair: 9 }, { chair: 11 }, { booth: 1 }, { booth: 2 }, { stand: [-7.35, -2.7, -Math.PI / 2 + 0.35] }, { stand: [-7.3, 2.75, -Math.PI / 2 - 0.5] }];
export const STAFF_SPOTS = { bartender: [-9.1, 0.9, Math.PI / 2], bouncerA: [1.55, 10.3, -Math.PI / 2 + 0.25], bouncerB: [-1.9, 7.85, 2.95], cashier: [3.25, 10.3, -Math.PI / 2], dj: [-8.0, -10.65, 0.15] };
// seated customers: the chair is built to fit the person (hips rest at hipY − 0.45 in the seated pose, Character.js);
// SEAT_OFF is the measured skin depth under the hip joint when seated (tools/club-test.mjs checks it)
export const SEAT_OFF = 0.112; // hip joint → underside of the buttocks (0.117 measured) less ~5 mm of cushion give
export const seatTopFor = (ch) => ch.hipY - 0.45 - SEAT_OFF;
