// Adult appearance system: named presets + a seeded generator.
//
// Every generated person is an ADULT (18+). There is no child / teen / school path anywhere: requests for those ages are
// coerced to adult, and tests (tools/appearance-test.mjs) assert it for every spawn route.
//
// A preset fixes the "who" (sex, age band, profile/role, outfit family, hairstyle, facial hair, accessories, footwear,
// posture) and the generator varies everything that should differ between two people of the same type: skin tone,
// height, build, belly, head width/height/depth, jaw, chin, cheekbones, nose, ears, hairline, face texture variant
// (eye shape/spacing, iris, brows, lips, age lines, stubble), clothing colours/patterns and gait.
import { RNG } from '../core/rng.js';

export const AGE_BANDS = { young: [18, 29], adult: [30, 49], mature: [50, 64], senior: [65, 79] };

// Face-texture variants (one shared atlas each, so memory is bounded). eyeW/eyeH/eyeSp: eye width, height, spacing;
// browW/browArch: brow thickness and arch; lipW/lipFull: mouth width and fullness; noseW: nostril shading width;
// lines: age lines (0..1); stubble: shaved-beard shadow (0..1); pottu: forehead dot.
export const FACE_VARIANTS = [
  // women 0..8
  { sex: 'f', eyeW: 1.05, eyeH: 1.05, eyeSp: 1.0, iris: '#3e2414', browW: 0.9, browArch: 1.2, lipW: 0.95, lipFull: 1.15, lips: '#8a3a3a', noseW: 0.95, lines: 0, pottu: true },
  { sex: 'f', eyeW: 0.95, eyeH: 0.9, eyeSp: 1.06, iris: '#2a180c', browW: 0.8, browArch: 0.9, lipW: 1.05, lipFull: 1.0, lips: '#7a3a34', noseW: 1.05, lines: 0 },
  { sex: 'f', eyeW: 1.1, eyeH: 1.12, eyeSp: 0.96, iris: '#4f3018', browW: 1.1, browArch: 1.35, lipW: 0.9, lipFull: 1.25, lips: '#93404a', noseW: 0.9, lines: 0 },
  { sex: 'f', eyeW: 0.92, eyeH: 0.85, eyeSp: 1.02, iris: '#33200f', browW: 0.75, browArch: 1.0, lipW: 1.0, lipFull: 0.9, lips: '#80463c', noseW: 1.1, lines: 0.15 },
  { sex: 'f', eyeW: 1.0, eyeH: 0.95, eyeSp: 1.04, iris: '#3a2615', browW: 0.95, browArch: 1.1, lipW: 1.08, lipFull: 1.05, lips: '#7c3036', noseW: 1.0, lines: 0.55, pottu: true },
  { sex: 'f', eyeW: 0.96, eyeH: 0.92, eyeSp: 1.0, iris: '#2e1d10', browW: 0.85, browArch: 0.95, lipW: 0.98, lipFull: 0.9, lips: '#74443c', noseW: 1.05, lines: 0.9 },
  { sex: 'f', eyeW: 0.9, eyeH: 0.78, eyeSp: 1.0, iris: '#2a1a10', browW: 0.85, browArch: 1.05, lipW: 0.95, lipFull: 0.95, lips: '#a0524c', noseW: 0.9, lines: 0 }, // tourist (East Asian)
  { sex: 'f', eyeW: 1.0, eyeH: 1.0, eyeSp: 1.02, iris: '#4a6a7a', browW: 0.8, browArch: 1.0, lipW: 1.0, lipFull: 0.95, lips: '#b0605c', noseW: 0.9, lines: 0.1 }, // tourist (European)
  { sex: 'f', eyeW: 1.02, eyeH: 1.0, eyeSp: 0.98, iris: '#3a2210', browW: 1.0, browArch: 1.15, lipW: 1.0, lipFull: 1.1, lips: '#86393f', noseW: 1.0, lines: 0.3 },
  // men 9..19
  { sex: 'm', eyeW: 1.0, eyeH: 1.0, eyeSp: 1.0, iris: '#3e2414', browW: 1.05, browArch: 0.9, lipW: 1.0, lipFull: 1.0, lips: '#7a4a40', noseW: 1.0, lines: 0, stubble: 0.12 },
  { sex: 'm', eyeW: 0.94, eyeH: 0.9, eyeSp: 1.05, iris: '#2a180c', browW: 1.25, browArch: 0.75, lipW: 1.06, lipFull: 1.1, lips: '#6e4038', noseW: 1.15, lines: 0, stubble: 0.3 },
  { sex: 'm', eyeW: 1.08, eyeH: 1.08, eyeSp: 0.97, iris: '#4a2c18', browW: 0.9, browArch: 1.05, lipW: 0.95, lipFull: 0.95, lips: '#7e4c42', noseW: 0.95, lines: 0, stubble: 0.55 },
  { sex: 'm', eyeW: 0.98, eyeH: 0.92, eyeSp: 1.02, iris: '#33200f', browW: 1.15, browArch: 0.95, lipW: 1.0, lipFull: 0.9, lips: '#704238', noseW: 1.1, lines: 0.2, stubble: 0.9 },
  { sex: 'm', eyeW: 1.0, eyeH: 0.96, eyeSp: 1.0, iris: '#3a2615', browW: 1.1, browArch: 0.85, lipW: 1.04, lipFull: 1.0, lips: '#74443a', noseW: 1.05, lines: 0.5, stubble: 0.2 },
  { sex: 'm', eyeW: 0.95, eyeH: 0.9, eyeSp: 1.04, iris: '#2e1d10', browW: 1.2, browArch: 0.8, lipW: 1.0, lipFull: 0.9, lips: '#6a4038', noseW: 1.12, lines: 0.6, stubble: 0.9 },
  { sex: 'm', eyeW: 0.97, eyeH: 0.92, eyeSp: 1.0, iris: '#2e1d10', browW: 1.0, browArch: 0.9, lipW: 0.98, lipFull: 0.88, lips: '#6c463c', noseW: 1.0, lines: 0.95, stubble: 0.15 },
  { sex: 'm', eyeW: 0.92, eyeH: 0.8, eyeSp: 1.0, iris: '#2a1a10', browW: 1.0, browArch: 0.9, lipW: 1.0, lipFull: 0.95, lips: '#8a5048', noseW: 0.92, lines: 0.05, stubble: 0.1 }, // tourist (East Asian)
  { sex: 'm', eyeW: 1.0, eyeH: 0.98, eyeSp: 1.02, iris: '#4d6b4a', browW: 0.95, browArch: 0.95, lipW: 1.0, lipFull: 0.9, lips: '#a05a52', noseW: 0.95, lines: 0.25, stubble: 0.45 }, // tourist (European)
  { sex: 'm', eyeW: 1.04, eyeH: 1.02, eyeSp: 0.98, iris: '#3a2210', browW: 1.3, browArch: 1.0, lipW: 1.02, lipFull: 1.05, lips: '#764638', noseW: 1.05, lines: 0.1, stubble: 0.9 },
  { sex: 'm', eyeW: 0.98, eyeH: 0.94, eyeSp: 1.03, iris: '#3e2414', browW: 1.1, browArch: 0.9, lipW: 1.02, lipFull: 1.0, lips: '#724438', noseW: 1.08, lines: 0.75, stubble: 0.55 },
];

const SKIN_LK = ['#8d5a3b', '#9b6644', '#7a4a2e', '#a8734f', '#6b4128', '#b07c56', '#82543a', '#5e3a24', '#93603f', '#714530', '#a06a48', '#4f3020'];
const SKIN_EU = ['#e8c4a8', '#dcb08e', '#f0d0b8', '#d2a07c'];
const SKIN_EA = ['#e0b890', '#d8ac84', '#cfa078'];
const HAIR_DARK = ['#120d0a', '#1c140e', '#0b0908', '#2a1c12', '#16100c'];
const HAIR_PEPPER = ['#3a3632', '#4a4642', '#2e2a26'];
const HAIR_GREY = ['#8a8a86', '#c8c6c0', '#5a5650', '#a8a6a0'];
const HAIR_EU = ['#6b4a2a', '#a07a4a', '#3a2a1c', '#c8a870'];

const P = {
  shirtLight: ['#f2f2ee', '#dfe8f2', '#e8eef4', '#f0e6d8', '#e6f0e6', '#f4e8ec'],
  shirt: ['#f2f2ee', '#dfe8f2', '#3b5f8c', '#7c2f2f', '#2f6b4f', '#c9a227', '#555b66', '#e4d3b5', '#8a5aa8', '#d96c3b', '#1f2a3a', '#b8c4a8', '#5a8ab0', '#a33a3a'],
  tee: ['#1d1d22', '#f2f2ee', '#3b5f8c', '#7c2f2f', '#2f6b4f', '#c9a227', '#6b6b72', '#d96c3b', '#2c8a8a', '#8a5aa8', '#e0c040', '#a8c0d8', '#d84a5a'],
  polo: ['#1f2a5a', '#f2f2ee', '#2f6b4f', '#7c2f2f', '#c9a227', '#3a7ab0', '#555b66', '#e07040'],
  trousers: ['#2b2e36', '#3a3f4a', '#4a4036', '#1e2430', '#6b6355', '#384a63', '#2a2a2a', '#8a7a5a'],
  chinos: ['#b8a07a', '#8a7a5a', '#4a5a3a', '#384a63', '#6b6355', '#c8b896'],
  jeans: ['#2c3e5c', '#35486b', '#1f2a3a', '#4a5f80', '#22262e'],
  shorts: ['#b8a07a', '#4a5a3a', '#384a63', '#2c3e5c', '#6b6355'],
  sarong: ['#3b5f8c', '#7c2f2f', '#2f6b4f', '#4a3f6b', '#6b5a3a', '#1f3a5a', '#5a2a2a'],
  saree: ['#b0233a', '#e07b1a', '#1b6b6b', '#6a2a7a', '#c72f6c', '#2c4f9e', '#d4a12a', '#0f7a4a', '#8c1c2c', '#e65a8a', '#3a6a9a', '#8a6a2a'],
  sareeOffice: ['#2c4f9e', '#6a2a7a', '#1b6b6b', '#8c1c2c', '#3a5a7a', '#5a3a6a'],
  dress: ['#c72f6c', '#2c4f9e', '#e07b1a', '#1b6b6b', '#f2d0a0', '#6a2a7a', '#d84a5a', '#3a8a5a', '#e8e0d0'],
  blouse: ['#f2f2ee', '#e8d8e8', '#d8e4f0', '#f4e4d4', '#e0ecdc', '#f0d8d8'],
  scarf: ['#1d1d24', '#2a3a5a', '#5a2a3a', '#3a4a3a', '#6a4a6a', '#8a7a6a', '#2c4f6e', '#e8e0d6'],
  abaya: ['#141418', '#1d1d24', '#222838', '#2a2226'],
  worker: ['#d96c3b', '#c9a227', '#5a6b3a', '#7a7a72', '#e8a020'],
  shoes: ['#2a2420', '#3b2a1e', '#151515', '#6b5440'],
  sneaker: ['#e8e8e4', '#1d1d22', '#3a5a8a', '#8a2a2a', '#5a5a62'],
  slipper: ['#1f3a7a', '#151515', '#2a6a4a', '#8a1d2a', '#3a3a42'],
  cap: ['#1f2a3a', '#7c2f2f', '#eeeeea', '#2f6b4f', '#c9a227'],
  bag: ['#2a2420', '#5a3a2a', '#1d1d22', '#3a4a5a', '#6b2a3a', '#8a6a4a'],
};

// skin group, hair group, preset table. w = relative frequency in the street crowd.
// Fields: o = outfit (geometry family), hair, fh = facial hair, acc = accessories, ft = footwear,
// belly/stoop ranges, h = height range override, b = build range, gait = multipliers.
export const PRESETS = [
  // ---------------- men
  { id: 'm_office_young', label: 'Young office worker', sex: 'm', band: 'young', profile: 'office', w: 4, o: 'office', hair: ['crew', 'quiff', 'sidepart'], fh: ['none', 'stubble'], acc: { lanyard: 0.7, watch: 0.8, tie: 0.3 }, ft: 'formal' },
  { id: 'm_office_mid', label: 'Office worker', sex: 'm', band: 'adult', profile: 'office', w: 4, o: 'office', hair: ['sidepart', 'short'], fh: ['moustache', 'none'], acc: { glasses: 0.45, watch: 0.9, tie: 0.35, bag: 0.2 }, ft: 'formal', belly: [0, 0.4] },
  { id: 'm_banker', label: 'Bank officer', sex: 'm', band: 'adult', profile: 'office', w: 2, o: 'office', hair: ['quiff', 'sidepart'], fh: ['trim', 'none'], acc: { watch: 1, tie: 0.9, lanyard: 0.5 }, ft: 'formal' },
  { id: 'm_manager', label: 'Senior manager', sex: 'm', band: 'mature', profile: 'office', w: 2, o: 'office', hair: ['receding', 'sidepart'], fh: ['moustache', 'none'], acc: { glasses: 0.8, watch: 1, tie: 0.4 }, ft: 'formal', belly: [0.3, 0.8], hairCol: 'pepper' },
  { id: 'm_student', label: 'University student', sex: 'm', band: 'young', profile: 'student', w: 3, o: 'tee', bottom: 'jeans', hair: ['curly', 'quiff', 'crew'], fh: ['none', 'stubble'], acc: { backpack: 0.9, watch: 0.3 }, ft: 'sneaker', gait: { stride: 1.05, swagger: 0.5 } },
  { id: 'm_creative', label: 'Designer / creative', sex: 'm', band: 'young', profile: 'office', w: 2, o: 'tee', bottom: 'jeans', hair: ['quiff', 'curly'], fh: ['goatee', 'trim'], acc: { crossbody: 0.8, sunglasses: 0.3, watch: 0.5 }, ft: 'sneaker' },
  { id: 'm_polo', label: 'Casual weekender', sex: 'm', band: 'adult', profile: 'shopper', w: 3, o: 'polo', bottom: 'chinos', hair: ['crew', 'short'], fh: ['none', 'moustache', 'stubble'], acc: { watch: 0.8, sunglasses: 0.2 }, ft: 'sneaker', belly: [0, 0.5] },
  { id: 'm_shopkeeper', label: 'Shopkeeper', sex: 'm', band: 'adult', profile: 'shopkeeper', w: 3, o: 'shirt', hair: ['short', 'receding'], fh: ['moustache'], acc: { watch: 0.6 }, ft: 'slipper', belly: [0.3, 0.8] },
  { id: 'm_trader_kurta', label: 'Pettah trader', sex: 'm', band: 'adult', profile: 'shopkeeper', w: 2, o: 'kurta', hair: ['short', 'crew'], fh: ['trim', 'full'], acc: { prayerCap: 0.6, watch: 0.5 }, ft: 'sandal', topPal: 'shirtLight' },
  { id: 'm_vendor_sarong', label: 'Street vendor', sex: 'm', band: 'mature', profile: 'vendor', w: 3, o: 'sarong', sleeveless: true, topPal: 'shirtLight', hair: ['balding', 'short'], fh: ['moustache', 'stubble'], ft: 'slipper', belly: [0.2, 0.7], hairCol: 'pepper' },
  { id: 'm_vendor_young', label: 'Market porter', sex: 'm', band: 'young', profile: 'vendor', w: 2, o: 'sarong', topPal: 'tee', hair: ['crew', 'short'], fh: ['none', 'stubble'], ft: 'slipper', b: [0.98, 1.14] },
  { id: 'm_tuk_driver', label: 'Three-wheeler driver', sex: 'm', band: 'adult', profile: 'driver', w: 3, o: 'shirt', hair: ['short', 'sidepart'], fh: ['moustache', 'stubble'], acc: { watch: 0.6 }, ft: 'slipper' },
  { id: 'm_conductor', label: 'Bus conductor', sex: 'm', band: 'adult', profile: 'driver', w: 2, o: 'shirt', hair: ['crew', 'short'], fh: ['stubble', 'moustache'], acc: { crossbody: 1 }, ft: 'sandal' },
  { id: 'm_labourer', label: 'Labourer', sex: 'm', band: 'adult', profile: 'worker', w: 2, o: 'worker', hair: ['crew', 'short'], fh: ['stubble', 'moustache'], acc: { cap: 0.4 }, ft: 'slipper', b: [1.0, 1.15] },
  { id: 'm_construction', label: 'Construction worker', sex: 'm', band: 'young', profile: 'worker', w: 2, o: 'worker', sleeveless: 0.5, hair: ['crew'], fh: ['none', 'stubble'], acc: { cap: 0.7 }, ft: 'sneaker', b: [1.0, 1.15] },
  { id: 'm_security', label: 'Private security guard', sex: 'm', band: 'adult', profile: 'security', w: 2, o: 'security', hair: ['crew', 'short'], fh: ['moustache', 'none'], acc: { cap: 1, watch: 0.5 }, ft: 'formal', gait: { stride: 0.95, arm: 0.8 } },
  { id: 'm_courier', label: 'Delivery rider', sex: 'm', band: 'young', profile: 'courier', w: 2, o: 'polo', bottom: 'jeans', hair: ['crew', 'quiff'], fh: ['none', 'stubble'], acc: { backpack: 1, watch: 0.4 }, ft: 'sneaker', gait: { stride: 1.06 } },
  { id: 'm_retiree_national', label: 'Retired gentleman (national dress)', sex: 'm', band: 'senior', profile: 'retiree', w: 1.5, o: 'national', hair: ['bald', 'grey'], fh: ['none', 'moustache'], acc: { glasses: 0.8 }, ft: 'sandal' },
  { id: 'm_retiree', label: 'Retiree', sex: 'm', band: 'senior', profile: 'retiree', w: 2, o: 'shirt', hair: ['grey', 'receding'], fh: ['moustache', 'none'], acc: { glasses: 0.6, watch: 0.5 }, ft: 'sandal', belly: [0, 0.5] },
  { id: 'm_uncle_sarong', label: 'Neighbourhood uncle', sex: 'm', band: 'senior', profile: 'resident', w: 1.5, o: 'sarong', topPal: 'shirt', hair: ['grey', 'balding'], fh: ['moustache', 'trim'], ft: 'slipper' },
  { id: 'm_tourist_eu', label: 'Tourist (Europe)', sex: 'm', band: 'adult', profile: 'tourist', w: 0.8, skinSet: 'eu', o: 'tee', shorts: true, hair: ['short', 'receding', 'crew'], fh: ['stubble', 'none', 'trim'], acc: { backpack: 0.6, sunglasses: 0.7, cap: 0.4, watch: 0.5 }, ft: 'sneaker', hairCol: 'eu', faceV: [18] },
  { id: 'm_tourist_ea', label: 'Tourist (East Asia)', sex: 'm', band: 'young', profile: 'tourist', w: 0.6, skinSet: 'ea', o: 'polo', shorts: true, hair: ['crew', 'quiff'], fh: ['none'], acc: { crossbody: 0.8, sunglasses: 0.5, cap: 0.3 }, ft: 'sneaker', faceV: [17] },
  { id: 'm_professional_kurta', label: 'Lawyer / professional', sex: 'm', band: 'mature', profile: 'office', w: 1.5, o: 'kurta', topPal: 'shirtLight', hair: ['sidepart', 'receding'], fh: ['trim', 'full'], acc: { glasses: 0.7, watch: 0.8 }, ft: 'formal', hairCol: 'pepper' },
  { id: 'm_fitness', label: 'Morning jogger', sex: 'm', band: 'young', profile: 'fitness', w: 1, o: 'tee', bottom: 'track', hair: ['crew', 'quiff'], fh: ['none', 'stubble'], acc: { watch: 0.9 }, ft: 'sneaker', b: [0.95, 1.06], gait: { stride: 1.08, bounce: 1.2, arm: 1.2 } },
  { id: 'm_executive', label: 'Executive (blazer)', sex: 'm', band: 'adult', profile: 'office', w: 1.5, o: 'jacket', hair: ['sidepart', 'quiff'], fh: ['none', 'trim'], acc: { watch: 1, glasses: 0.3 }, ft: 'formal' },
  // ---------------- women
  { id: 'f_office_young', label: 'Young office worker', sex: 'f', band: 'young', profile: 'office', w: 4, o: 'blouse_trousers', hair: ['ponytail', 'shoulder', 'long'], acc: { lanyard: 0.7, watch: 0.7, earrings: 0.7 }, ft: 'formal' },
  { id: 'f_office_skirt', label: 'Office worker (skirt)', sex: 'f', band: 'adult', profile: 'office', w: 3, o: 'office_f', hair: ['bun', 'bob', 'ponytail'], acc: { glasses: 0.35, crossbody: 0.6, earrings: 0.6 }, ft: 'formal' },
  { id: 'f_bank_saree', label: 'Bank officer (saree)', sex: 'f', band: 'adult', profile: 'office', w: 2.5, o: 'saree', sareePal: 'sareeOffice', hair: ['bun'], acc: { earrings: 0.9, watch: 0.8, necklace: 0.5 }, ft: 'formal' },
  { id: 'f_teacher', label: 'Teacher', sex: 'f', band: 'mature', profile: 'office', w: 2, o: 'saree', hair: ['bun'], acc: { glasses: 0.7, crossbody: 0.6, earrings: 0.6, watch: 0.7 }, ft: 'sandal', hairCol: 'pepper' },
  { id: 'f_student', label: 'University student', sex: 'f', band: 'young', profile: 'student', w: 3, o: 'tee_jeans', hair: ['long', 'ponytail', 'shoulder'], acc: { backpack: 0.85, earrings: 0.5 }, ft: 'sneaker' },
  { id: 'f_kurti', label: 'Young professional (kurti)', sex: 'f', band: 'young', profile: 'office', w: 3, o: 'kurti', hair: ['braid', 'long'], acc: { earrings: 0.8, crossbody: 0.7, bangles: 0.4 }, ft: 'sandal' },
  { id: 'f_salwar', label: 'Shopper (salwar)', sex: 'f', band: 'adult', profile: 'shopper', w: 3, o: 'salwar', hair: ['long', 'bun', 'braid'], acc: { bangles: 0.6, earrings: 0.7 }, ft: 'sandal' },
  { id: 'f_hijab_modern', label: 'Student (hijab)', sex: 'f', band: 'young', profile: 'student', w: 2, o: 'kurti', hair: ['hijab'], acc: { crossbody: 0.7, watch: 0.5 }, ft: 'sneaker' },
  { id: 'f_abaya', label: 'Shopper (abaya)', sex: 'f', band: 'adult', profile: 'shopper', w: 1.5, o: 'abaya', hair: ['hijab'], acc: { crossbody: 0.6 }, ft: 'sandal' },
  { id: 'f_frock', label: 'Casual (dress)', sex: 'f', band: 'adult', profile: 'shopper', w: 2.5, o: 'frock', hair: ['shoulder', 'long', 'bob'], acc: { earrings: 0.8, crossbody: 0.5, bangles: 0.3 }, ft: 'sandal' },
  { id: 'f_skirt_top', label: 'Young casual (skirt and top)', sex: 'f', band: 'young', profile: 'shopper', w: 2, o: 'skirt_top', hair: ['bob', 'ponytail', 'short_f'], acc: { sunglasses: 0.35, crossbody: 0.7, earrings: 0.6 }, ft: 'sneaker' },
  { id: 'f_shopkeeper', label: 'Shopkeeper', sex: 'f', band: 'mature', profile: 'shopkeeper', w: 2, o: 'frock', long: true, hair: ['bun'], acc: { bangles: 0.8, necklace: 0.4 }, ft: 'slipper', belly: [0.2, 0.6], hairCol: 'pepper' },
  { id: 'f_vendor', label: 'Market vendor', sex: 'f', band: 'mature', profile: 'vendor', w: 2, o: 'saree', hair: ['bun'], acc: { bangles: 0.6 }, ft: 'slipper', belly: [0.1, 0.5] },
  { id: 'f_aunty', label: 'Aunty (saree)', sex: 'f', band: 'senior', profile: 'retiree', w: 2, o: 'saree', hair: ['bun'], acc: { glasses: 0.7, earrings: 0.7 }, ft: 'sandal', hairCol: 'grey' },
  { id: 'f_grandmother', label: 'Grandmother (house dress)', sex: 'f', band: 'senior', profile: 'resident', w: 1.5, o: 'frock', long: true, hair: ['short_f', 'bun'], acc: { glasses: 0.5 }, ft: 'slipper', hairCol: 'grey' },
  { id: 'f_tourist_eu', label: 'Tourist (Europe)', sex: 'f', band: 'adult', profile: 'tourist', w: 0.8, skinSet: 'eu', o: 'tee_jeans', shorts: true, hair: ['ponytail', 'long', 'bob'], acc: { backpack: 0.6, sunglasses: 0.8, watch: 0.4 }, ft: 'sneaker', hairCol: 'eu', faceV: [7] },
  { id: 'f_tourist_ea', label: 'Tourist (East Asia)', sex: 'f', band: 'young', profile: 'tourist', w: 0.6, skinSet: 'ea', o: 'skirt_top', hair: ['bob', 'long'], acc: { crossbody: 0.8, sunglasses: 0.6 }, ft: 'sneaker', faceV: [6] },
  { id: 'f_nurse', label: 'Nurse (off duty, uniform)', sex: 'f', band: 'adult', profile: 'medical', w: 1, o: 'frock', uniform: '#f4f4f2', hair: ['bun'], acc: { watch: 1, nurseCap: 1 }, ft: 'formal' },
  { id: 'f_security', label: 'Private security officer', sex: 'f', band: 'adult', profile: 'security', w: 1, o: 'security', hair: ['bun'], acc: { cap: 1, watch: 0.6 }, ft: 'formal' },
  { id: 'f_professional', label: 'Senior professional', sex: 'f', band: 'mature', profile: 'office', w: 1.5, o: 'blouse_trousers', hair: ['bob', 'short_f'], acc: { glasses: 0.8, watch: 0.9, necklace: 0.6, crossbody: 0.5 }, ft: 'formal', hairCol: 'pepper' },
  { id: 'f_fitness', label: 'Morning walker', sex: 'f', band: 'young', profile: 'fitness', w: 1, o: 'tee_jeans', bottom: 'track', hair: ['ponytail'], acc: { watch: 0.9 }, ft: 'sneaker', gait: { stride: 1.06, bounce: 1.15 } },
  { id: 'f_garment', label: 'Garment worker', sex: 'f', band: 'young', profile: 'worker', w: 2, o: 'frock', hair: ['braid', 'long'], acc: { crossbody: 0.6, earrings: 0.5 }, ft: 'slipper' },
];
export const PRESET_IDS = PRESETS.map((p) => p.id);
const byId = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

const TRACK = ['#1d1d22', '#2a2e3a', '#3a3a42', '#1f2a4a'];
const AGE_TO_BAND = { adult: ['young', 'adult', 'mature'], elder: ['senior'] };

function chance(r, v) { return v === true ? true : v ? r.chance(v) : false; }
function pickBand(r, opts) {
  if (opts.band && AGE_BANDS[opts.band]) return opts.band;
  if (opts.age === 'elder') return 'senior';
  return null; // any adult band ('child' / 'teen' requests are treated as adult — there are no minors in the game)
}

// Pick a preset for the request: explicit id → outfit/sex/band match → weighted random.
export function choosePreset(r, opts = {}) {
  if (opts.preset && byId[opts.preset]) return byId[opts.preset];
  const band = pickBand(r, opts);
  let pool = PRESETS.filter((p) => (!opts.sex || p.sex === opts.sex) && (!band ? (opts.age === 'adult' ? p.band !== 'senior' : true) : p.band === band) && (!opts.profile || p.profile === opts.profile));
  if (opts.outfit) { const m = pool.filter((p) => p.o === opts.outfit); if (m.length) pool = m; }
  if (opts.exclude) { const m = pool.filter((p) => !opts.exclude.includes(p.id)); if (m.length) pool = m; }
  if (!pool.length) pool = PRESETS.filter((p) => !opts.sex || p.sex === opts.sex);
  return r.weighted(pool.map((p) => [p, p.w]));
}

// Full spec for Character(). opts may override any field (story NPCs, shop keepers, police later).
export function makeAppearance(seed, opts = {}) {
  const r = new RNG(seed * 7919 + 101); const pr = choosePreset(r, opts); const f = pr.sex === 'f';
  const [a0, a1] = AGE_BANDS[pr.band]; const years = Math.round(r.range(a0, a1));
  const skinSet = pr.skinSet === 'eu' ? SKIN_EU : pr.skinSet === 'ea' ? SKIN_EA : SKIN_LK;
  const hairCol = pr.band === 'senior' || pr.hairCol === 'grey' ? r.pick(HAIR_GREY) : pr.hairCol === 'eu' ? r.pick(HAIR_EU) : pr.hairCol === 'pepper' && r.chance(0.7) ? r.pick(HAIR_PEPPER) : r.pick(HAIR_DARK);
  const fh = f ? 'none' : r.pick(pr.fh || ['none']); const hairPick = r.pick(pr.hair);
  const stubClass = fh === 'full' || fh === 'trim' || fh === 'goatee' ? 0.9 : fh === 'stubble' ? 0.55 : null;
  const faces = FACE_VARIANTS.map((v, i) => [v, i]).filter(([v, i]) => v.sex === pr.sex && (pr.faceV ? pr.faceV.includes(i) : ![6, 7, 17, 18].includes(i)) && (stubClass == null ? !f ? v.stubble <= 0.35 : true : Math.abs(v.stubble - stubClass) < 0.2) && !(hairPick === 'hijab' && v.pottu) && (pr.band === 'young' ? v.lines < 0.3 : pr.band === 'senior' ? v.lines >= 0.5 : pr.band === 'mature' ? v.lines >= 0.15 : v.lines < 0.7));
  const faceV = (faces.length ? r.pick(faces) : [null, f ? 0 : 9])[1];
  const sp = {
    seed, preset: pr.id, profile: pr.profile, label: pr.label, sex: pr.sex, band: pr.band, ageYears: years, age: pr.band === 'senior' ? 'elder' : 'adult',
    skin: r.pick(skinSet),
    height: pr.h ? r.range(pr.h[0], pr.h[1]) : f ? r.range(1.5, 1.68) - (pr.band === 'senior' ? 0.03 : 0) : r.range(1.6, 1.84) - (pr.band === 'senior' ? 0.03 : 0),
    build: pr.b ? r.range(pr.b[0], pr.b[1]) : r.range(0.92, 1.12),
    belly: pr.belly ? r.range(pr.belly[0], pr.belly[1]) : r.chance(0.2) && pr.band !== 'young' ? r.range(0.1, 0.4) : 0,
    head: { w: r.range(0.94, 1.06), h: r.range(0.95, 1.05), d: r.range(0.96, 1.04), jaw: f ? r.range(0.9, 1.04) : r.range(0.94, 1.14), chin: r.range(-0.5, 0.7), cheek: r.range(-0.5, 1), nose: f ? [r.range(0.78, 1.05), r.range(0.82, 1.02), r.range(0.78, 1.0)] : [r.range(0.85, 1.25), r.range(0.9, 1.15), r.range(0.85, 1.15)], ear: r.range(0.9, 1.15) },
    hairColor: hairCol, hair: hairPick, hairline: r.range(-0.04, 0.06) + (pr.band === 'mature' ? 0.04 : pr.band === 'senior' ? 0.07 : 0),
    facial: fh, beard: fh === 'full' || fh === 'trim', beardShort: fh === 'trim', goatee: fh === 'goatee', moustache: fh === 'moustache' || fh === 'goatee',
    faceV, shoes: r.pick(P.shoes), sandals: false,
    gait: Object.assign({ stoop: pr.band === 'senior' ? r.range(0.04, 0.12) : pr.band === 'mature' ? r.range(0, 0.05) : 0 }, pr.gait || {}),
  };
  // ---- outfit
  const o = pr.o; const top = (pal) => r.pick(P[pal || pr.topPal || 'shirt']);
  const lower = () => (pr.bottom === 'jeans' ? r.pick(P.jeans) : pr.bottom === 'chinos' ? r.pick(P.chinos) : pr.bottom === 'track' ? r.pick(TRACK) : pr.shorts ? r.pick(P.shorts) : r.pick(P.trousers));
  if (o === 'office') Object.assign(sp, { outfit: 'office', top: top('shirtLight'), bottom: r.pick(P.trousers), longSleeve: r.chance(0.75), collar: true, tie: chance(r, pr.acc?.tie) ? r.pick(['#7c2f2f', '#1f2a5a', '#2f4f3f', '#5a3a6a', '#8a6a2a']) : null });
  else if (o === 'tee') Object.assign(sp, { outfit: 'tee', top: top('tee'), bottom: lower(), shorts: !!pr.shorts });
  else if (o === 'polo') Object.assign(sp, { outfit: 'polo', top: top('polo'), bottom: lower(), collar: true, shorts: !!pr.shorts });
  else if (o === 'shirt') Object.assign(sp, { outfit: 'shirt', top: top('shirt'), bottom: r.pick(P.trousers), collar: true, longSleeve: r.chance(0.3) });
  else if (o === 'kurta') { const c = top('shirtLight'); Object.assign(sp, { outfit: 'kurta', top: c, bottom: r.chance(0.5) ? c : r.pick(P.trousers), skirt: 'knee', skirtCol: c, longSleeve: true, collar: true }); }
  else if (o === 'sarong') Object.assign(sp, { outfit: 'sarong', top: top(), skirt: 'ankle', skirtCol: r.pick(P.sarong), pattern: r.chance(0.6) ? 3 : 2, bottom: '#333', sleeveless: pr.sleeveless === true ? true : false, collar: !pr.sleeveless && r.chance(0.6) });
  else if (o === 'worker') Object.assign(sp, { outfit: 'worker', top: r.pick(P.worker), bottom: r.pick(P.trousers), sleeveless: chance(r, pr.sleeveless) });
  else if (o === 'security') Object.assign(sp, { outfit: 'security', top: r.pick(['#a8bcd4', '#c8d4e4', '#9aaabb']), bottom: '#1f2a44', longSleeve: false, collar: true, cap: '#1f2a44', epaulettes: true });
  else if (o === 'national') Object.assign(sp, { outfit: 'national', top: '#f6f4ee', bottom: '#f6f4ee', skirt: 'ankle', skirtCol: '#f4f2ea', longSleeve: true, collar: true });
  else if (o === 'jacket') Object.assign(sp, { outfit: 'jacket', top: r.pick(['#2b2e36', '#1e2430', '#3a3f4a', '#4a4036']), inner: top('shirtLight'), bottom: r.pick(P.trousers), longSleeve: true, collar: true });
  else if (o === 'blouse_trousers') Object.assign(sp, { outfit: 'blouse_trousers', top: top('blouse'), bottom: r.pick(['#2b2e36', '#1e2430', '#3a3f4a', '#4a4036', '#6b6355']), longSleeve: r.chance(0.4), collar: r.chance(0.5) });
  else if (o === 'office_f') Object.assign(sp, { outfit: 'office_f', top: top('blouse'), bottom: '#2b2e36', skirt: 'mid', skirtCol: r.pick(['#2b2e36', '#3a2f2a', '#1e2430', '#4a3a4a']), longSleeve: r.chance(0.5) });
  else if (o === 'saree') { const sc = r.pick(P[pr.sareePal || 'saree']); Object.assign(sp, { outfit: 'saree', top: r.chance(0.5) ? sc : r.pick(P.saree), skirt: 'ankle', skirtCol: sc, pattern: r.chance(0.7) ? 1 : 2, bottom: sc, belly: Math.min(sp.belly, 0.25) }); }
  else if (o === 'salwar') { const sc = r.pick(P.saree); Object.assign(sp, { outfit: 'salwar', top: sc, skirt: 'knee', skirtCol: sc, bottom: r.pick(['#f2efe6', '#1d1d24', sc]), pattern: r.chance(0.5) ? 2 : 0, longSleeve: r.chance(0.5) }); }
  else if (o === 'kurti') { const sc = r.pick(P.dress); Object.assign(sp, { outfit: 'kurti', top: sc, skirt: 'knee', skirtCol: sc, bottom: r.pick(['#1d1d24', '#f2efe6', '#2c3e5c', '#4a3a3a']), pattern: r.chance(0.4) ? 2 : 0, longSleeve: r.chance(0.6) }); }
  else if (o === 'abaya') { const c = r.pick(P.abaya); Object.assign(sp, { outfit: 'abaya', top: c, bottom: c, skirt: 'ankle', skirtCol: c, longSleeve: true }); }
  else if (o === 'frock') { const c = pr.uniform || r.pick(P.dress); Object.assign(sp, { outfit: 'frock', top: c, skirt: pr.long ? 'ankle' : r.chance(0.5) ? 'mid' : 'knee', skirtCol: c, bottom: sp.skin, pattern: pr.uniform ? 0 : r.chance(0.5) ? 2 : 0, collar: !!pr.uniform }); if (pr.uniform) sp.skirt = 'mid'; }
  else if (o === 'skirt_top') Object.assign(sp, { outfit: 'skirt_top', top: top('tee'), skirt: r.chance(0.5) ? 'knee' : 'mid', skirtCol: r.pick(['#2c3e5c', '#1d1d24', '#c8b896', '#8a2a3a', '#3a6a5a']), bottom: sp.skin, pattern: 0 });
  else if (o === 'tee_jeans') Object.assign(sp, { outfit: 'tee_jeans', top: top('tee'), bottom: pr.bottom === 'track' ? r.pick(TRACK) : pr.shorts ? r.pick(P.shorts) : r.pick(P.jeans), shorts: !!pr.shorts });
  if (sp.hair === 'hijab') sp.scarf = o === 'abaya' ? r.pick(P.abaya.concat(P.scarf.slice(0, 3))) : r.pick(P.scarf);
  // ---- footwear
  if (pr.ft === 'sneaker') { sp.shoes = r.pick(P.sneaker); sp.sole = '#e6e6e2'; }
  else if (pr.ft === 'formal') { sp.shoes = r.pick(['#151515', '#2a1c14', '#3b2a1e']); sp.sole = '#121010'; }
  else if (pr.ft === 'slipper') { sp.sandals = true; sp.shoes = r.pick(P.slipper); sp.sole = r.chance(0.5) ? '#e6e2da' : sp.shoes; }
  else if (pr.ft === 'sandal') { sp.sandals = true; sp.shoes = r.pick(['#3b2a1e', '#2a2420', '#6b5440', '#151515']); }
  // ---- accessories
  const A = pr.acc || {};
  if (chance(r, A.glasses)) sp.glasses = true;
  if (!sp.glasses && chance(r, A.sunglasses)) sp.sunglasses = true;
  if (chance(r, A.watch) && !sp.longSleeve) sp.watch = r.pick(['#1a1a1a', '#c8c8c4', '#b8902a', '#5a3a2a']);
  if (chance(r, A.earrings) && f && sp.hair !== 'hijab') sp.earrings = true;
  if (chance(r, A.necklace)) sp.necklace = true;
  if (chance(r, A.bangles) && f) sp.bangles = true;
  if (chance(r, A.lanyard)) sp.lanyard = r.pick(['#1f3a7a', '#8a1d2a', '#14532d', '#1d1d22']);
  if (chance(r, A.backpack)) sp.bag = r.pick(P.bag); else if (chance(r, A.bag)) sp.bag = r.pick(P.bag);
  if (!sp.bag && chance(r, A.crossbody)) sp.crossbody = r.pick(P.bag);
  if (chance(r, A.cap) && !sp.cap && sp.hair !== 'hijab') sp.cap = r.pick(P.cap);
  if (chance(r, A.prayerCap)) sp.cap = '#f2f2ee', sp.capStyle = 'skull';
  if (chance(r, A.nurseCap)) sp.cap = '#ffffff', sp.capStyle = 'nurse';
  // ---- overrides (story NPCs, keepers, drivers). If the outfit is forced to a different family, drop fields that
  // belonged to the preset's outfit so they cannot leak (e.g. a skirt under a forced shirt).
  const o2 = Object.assign({}, opts); delete o2.preset; delete o2.profile; delete o2.exclude; delete o2.band;
  if (o2.age === 'child' || o2.age === 'teen') o2.age = 'adult';
  if (o2.outfit && o2.outfit !== sp.outfit) { for (const k of ['skirt', 'skirtCol', 'pattern', 'shorts', 'sleeveless', 'tie', 'inner', 'epaulettes', 'scarf', 'collar', 'longSleeve']) delete sp[k]; if (sp.hair === 'hijab') sp.hair = f ? 'bun' : 'short'; }
  Object.assign(sp, o2);
  if (sp.age === 'elder' && sp.band !== 'senior') { sp.band = 'senior'; sp.ageYears = Math.max(sp.ageYears, 65); }
  if (!(sp.ageYears >= 18)) sp.ageYears = 18 + (Math.abs(seed) % 30);
  return sp;
}

// How likely someone of this profile is to be out walking at this hour (0..1). Drives crowd composition through the day.
export function profileActivity(profile, h) {
  const night = h < 5.5 || h > 22.5, rush = (h > 7 && h < 9.5) || (h > 16.5 && h < 19);
  switch (profile) {
    case 'office': return night ? 0.08 : rush ? 1 : h > 9.5 && h < 16.5 ? 0.55 : 0.3;
    case 'student': return night ? 0.05 : h > 7 && h < 18.5 ? 0.85 : 0.4;
    case 'tourist': return night ? 0.03 : h > 8.5 && h < 18.5 ? 0.9 : h < 22 ? 0.5 : 0.1;
    case 'fitness': return (h > 5.3 && h < 8) || (h > 16.8 && h < 19.2) ? 1 : 0.06;
    case 'vendor': case 'shopkeeper': return h > 6 && h < 21 ? 1 : 0.15;
    case 'worker': return h > 6.5 && h < 18.5 ? 1 : 0.25;
    case 'driver': case 'courier': return night ? 0.45 : 0.85;
    case 'retiree': case 'resident': return night ? 0.06 : (h > 6 && h < 11) || (h > 15 && h < 19.5) ? 0.9 : 0.45;
    case 'shopper': return night ? 0.08 : h > 9.5 && h < 20.5 ? 1 : 0.45;
    default: return night ? 0.4 : 0.7; // security, medical
  }
}

// A cheap "looks the same" key: two people with the same key standing next to each other read as clones.
export function lookKey(sp) { return `${sp.preset}|${sp.top}|${sp.skirtCol || sp.bottom}|${sp.hair}`; }

// Spec is an adult and carries none of the removed child/school content.
export function isAdultSpec(sp) {
  return sp && sp.age !== 'child' && sp.age !== 'teen' && sp.ageYears >= 18 && sp.height >= 1.45 && !/school/.test(sp.outfit || '') && sp.hair !== 'plaits';
}
