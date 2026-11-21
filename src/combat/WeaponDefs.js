// The 27 weapons (pure data, no browser dependencies): shared by the combat system, the gun shops and the debug menu.
// Nine TYPES (compact / service / heavy pistol, carbine / assault / battle rifle, bolt / semi / precision marksman rifle),
// three real-world weapons of each, named by their military designation (no maker names). The first nine entries keep the
// ids they always had (saves index inventories by position: new weapons are only ever APPENDED). `type` groups a weapon
// with its class-mates (weapon wheel slice, number key, gunshot sound slot); `model` picks its drawing in GunPistols /
// GunRifles / GunLong.
const T = {
  compact:   { cls: 'pistol', size: 0.86, mag: 8,  reserve: 56,  rof: 5.5, auto: false, dmg: 0.6,  spread: 0.012, bloom: 0.012, recoil: 0.018, reload: 1.25, range: 60,  equip: 0.42, loud: 45,  snd: { crack: 3200, body: 170, dur: 0.1, vol: 0.4, tail: 0.25 } },
  service:   { cls: 'pistol', size: 1.0,  mag: 15, reserve: 90,  rof: 4.5, auto: false, dmg: 0.75, spread: 0.009, bloom: 0.011, recoil: 0.024, reload: 1.4,  range: 70,  equip: 0.45, loud: 55,  snd: { crack: 2700, body: 140, dur: 0.12, vol: 0.48, tail: 0.3 } },
  heavy:     { cls: 'pistol', size: 1.12, mag: 7,  reserve: 49,  rof: 2.6, auto: false, dmg: 1.2,  spread: 0.008, bloom: 0.02,  recoil: 0.055, reload: 1.7,  range: 80,  equip: 0.5,  loud: 70,  snd: { crack: 1900, body: 95, dur: 0.18, vol: 0.62, tail: 0.45 } },
  carbine:   { cls: 'rifle',  mag: 30, reserve: 180, rof: 11,  auto: true,  dmg: 0.6,  spread: 0.006, bloom: 0.004, recoil: 0.012, reload: 2.1, range: 160, equip: 0.7,  loud: 90,  snd: { crack: 2300, body: 110, dur: 0.14, vol: 0.55, tail: 0.5 } },
  assault:   { cls: 'rifle',  mag: 30, reserve: 180, rof: 9.5, auto: true,  dmg: 0.75, spread: 0.008, bloom: 0.006, recoil: 0.017, reload: 2.4, range: 150, equip: 0.75, loud: 95,  snd: { crack: 1800, body: 90, dur: 0.16, vol: 0.6, tail: 0.55 } },
  battle:    { cls: 'rifle',  mag: 20, reserve: 120, rof: 6,   auto: true,  dmg: 1.05, spread: 0.005, bloom: 0.009, recoil: 0.03,  reload: 2.6, range: 200, equip: 0.8,  loud: 110, snd: { crack: 1500, body: 75, dur: 0.2, vol: 0.7, tail: 0.7 } },
  bolt:      { cls: 'sniper', mag: 5,  reserve: 30,  rof: 0.75, auto: false, dmg: 3,   spread: 0.0008, bloom: 0,    recoil: 0.07,  reload: 2.9, range: 600, equip: 0.9,  loud: 140, zoom: 5, sway: 1, cycle: 0.95, snd: { crack: 1200, body: 55, dur: 0.32, vol: 0.85, tail: 1.3 } },
  semi:      { cls: 'sniper', mag: 10, reserve: 50,  rof: 2.4, auto: false, dmg: 1.6,  spread: 0.0015, bloom: 0.003, recoil: 0.05, reload: 2.6, range: 500, equip: 0.85, loud: 130, zoom: 4, sway: 1.2, snd: { crack: 1400, body: 65, dur: 0.26, vol: 0.78, tail: 1.0 } },
  precision: { cls: 'sniper', mag: 7,  reserve: 35,  rof: 1.1, auto: false, dmg: 2.5,  spread: 0.0005, bloom: 0,    recoil: 0.06,  reload: 3.0, range: 800, equip: 0.95, loud: 140, zoom: 7, sway: 0.55, cycle: 0.7, snd: { crack: 1100, body: 50, dur: 0.36, vol: 0.9, tail: 1.5 } },
};
export const WEAPON_TYPES = [
  { id: 'compact', label: 'Compact pistols' }, { id: 'service', label: 'Service pistols' }, { id: 'heavy', label: 'Heavy pistols' },
  { id: 'carbine', label: 'Carbines' }, { id: 'assault', label: 'Assault rifles' }, { id: 'battle', label: 'Battle rifles' },
  { id: 'bolt', label: 'Bolt-action sniper rifles' }, { id: 'semi', label: 'Semi-automatic sniper rifles' }, { id: 'precision', label: 'Precision / anti-materiel rifles' },
];
const w = (id, type, name, full, o = {}) => { const b = T[type]; return { ...b, ...o, snd: { ...b.snd, ...(o.snd || {}) }, id, type, model: id, name, full }; };
export const WEAPONS = [
  // the original nine (ids and order unchanged)
  w('compact', 'compact', 'PM', 'PM 9×18 mm pistol'),
  w('service', 'service', 'M9', 'M9 9×19 mm service pistol'),
  w('heavy', 'heavy', 'M1911A1', 'M1911A1 .45 ACP pistol'),
  w('carbine', 'carbine', 'M4A1', 'M4A1 5.56 mm carbine'),
  w('assault', 'assault', 'AK-47', 'AK-47 7.62×39 mm assault rifle'),
  w('battle', 'battle', 'M14', 'M14 7.62×51 mm rifle'),
  w('bolt', 'bolt', 'M24', 'M24 sniper weapon system, 7.62×51 mm'),
  w('semi', 'semi', 'SVD', 'SVD 7.62×54R mm marksman rifle'),
  w('precision', 'precision', 'M2010', 'M2010 enhanced sniper rifle, .300 Win Mag'),
  // compact pistols
  w('psm', 'compact', 'PSM', 'PSM 5.45×18 mm pistol', { mag: 8, dmg: 0.52, rof: 6, recoil: 0.014, spread: 0.011, snd: { crack: 3600, body: 190, vol: 0.36 } }),
  w('m11', 'compact', 'M11', 'M11 9×19 mm compact pistol', { mag: 13, reserve: 78, dmg: 0.66, rof: 5, recoil: 0.021, spread: 0.0105, snd: { crack: 3000, body: 155 } }),
  // service pistols
  w('m17', 'service', 'M17', 'M17 9×19 mm modular handgun', { mag: 17, reserve: 102, rof: 4.8, recoil: 0.021, spread: 0.0085, snd: { crack: 2800 } }),
  w('type54', 'service', 'Type 54', 'Type 54 7.62×25 mm pistol', { mag: 8, reserve: 64, dmg: 0.86, rof: 4.2, recoil: 0.03, spread: 0.0095, snd: { crack: 3100, body: 120, vol: 0.52 } }),
  // heavy pistols
  w('mk23', 'heavy', 'Mk 23 Mod 0', 'Mk 23 Mod 0 .45 ACP pistol', { mag: 12, reserve: 72, dmg: 1.12, rof: 2.8, recoil: 0.048, spread: 0.007 }),
  w('m45a1', 'heavy', 'M45A1', 'M45A1 .45 ACP close-quarters pistol', { mag: 7, dmg: 1.18, rof: 2.8, recoil: 0.05, spread: 0.0065 }),
  // carbines
  w('mk18', 'carbine', 'Mk 18 Mod 0', 'Mk 18 Mod 0 5.56 mm close-quarters carbine', { rof: 12, dmg: 0.57, spread: 0.0068, recoil: 0.013, range: 130, snd: { crack: 2200, body: 115, vol: 0.58 } }),
  w('aks74u', 'carbine', 'AKS-74U', 'AKS-74U 5.45×39 mm carbine', { rof: 11.5, dmg: 0.56, spread: 0.0075, recoil: 0.015, range: 120, snd: { crack: 2100, body: 105, vol: 0.6 } }),
  // assault rifles
  w('type56', 'assault', 'Type 56', 'Type 56 7.62×39 mm assault rifle', { rof: 9.8, dmg: 0.76, spread: 0.0082, recoil: 0.0175 }),
  w('ak74m', 'assault', 'AK-74M', 'AK-74M 5.45×39 mm assault rifle', { rof: 10, dmg: 0.68, spread: 0.007, recoil: 0.013, snd: { crack: 2000, body: 95 } }),
  // battle rifles
  w('l1a1', 'battle', 'L1A1', 'L1A1 7.62×51 mm self-loading rifle', { auto: false, rof: 4.5, dmg: 1.08, spread: 0.0045, recoil: 0.028 }),
  w('g3a3', 'battle', 'G3A3', 'G3A3 7.62×51 mm battle rifle', { rof: 8.3, dmg: 1.0, spread: 0.0052, recoil: 0.031 }),
  // bolt-action sniper rifles
  w('m40a5', 'bolt', 'M40A5', 'M40A5 7.62×51 mm sniper rifle', { mag: 5, zoom: 5.5, sway: 0.9, spread: 0.0007, cycle: 0.9 }),
  w('m9130', 'bolt', 'M91/30', 'M91/30 7.62×54R mm sniper rifle', { mag: 5, zoom: 3.5, sway: 1.15, dmg: 2.8, spread: 0.0011, cycle: 1.05, reload: 3.4, snd: { crack: 1250, body: 58 } }),
  // semi-automatic sniper rifles
  w('m110', 'semi', 'M110', 'M110 7.62×51 mm semi-automatic sniper system', { mag: 20, reserve: 80, dmg: 1.5, rof: 2.6, zoom: 4.5, sway: 1.05, spread: 0.0013 }),
  w('mk14', 'semi', 'Mk 14 EBR', 'Mk 14 Mod 0 enhanced battle rifle', { mag: 20, reserve: 80, dmg: 1.45, rof: 3, zoom: 3.5, sway: 1.25, spread: 0.0017, recoil: 0.046 }),
  // precision / anti-materiel rifles
  w('l115a3', 'precision', 'L115A3', 'L115A3 .338 long-range rifle', { mag: 5, reserve: 30, dmg: 2.8, zoom: 8, sway: 0.5, cycle: 0.75, range: 900 }),
  w('m107', 'precision', 'M107', 'M107 .50 BMG anti-materiel rifle', { mag: 10, reserve: 40, dmg: 3.2, rof: 1.4, cycle: 0, recoil: 0.085, zoom: 6, sway: 0.7, range: 1000, loud: 160, reload: 3.4, snd: { crack: 900, body: 42, dur: 0.42, vol: 0.95, tail: 1.8 } }),
];
for (const d of WEAPONS) if (!d.cycle) delete d.cycle; // semi-automatic: no manual cycling
export const typeOf = (d) => (d && (d.type || d.id)) || null;
export const WEAPONS_OF_TYPE = Object.fromEntries(WEAPON_TYPES.map((t) => [t.id, WEAPONS.map((d, i) => (d.type === t.id ? i : -1)).filter((i) => i >= 0)]));
// Police-only: the T-56 service rifle carried by Sri Lanka Police response officers (Firefight.js). Not sold to the player.
export const POLICE_T56 = { id: 't56', name: 'T-56 service rifle', cls: 'rifle', mag: 30, rof: 10, auto: true, burst: [2, 4], dmg: 16, range: 160, loud: 100, reload: 2.6, snd: { crack: 1500, body: 82, dur: 0.17, vol: 0.62, tail: 0.6 } };
