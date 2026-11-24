// Sound replacement bank (console command `sounds`, src/ui/SoundsWindow.js).
// Every sound in the game is procedural WebAudio (Audio.js and a few call sites). Each one has a stable id in SOUND_DEFS; when
// the player has given that id a recording (.mp3 / .wav / .ogg), the call site plays the decoded recording instead of the
// synthesised sound — one-shots through play(), continuous sounds (engines, sirens, rotor, ambience, music) through syncLoop().
// Where the recordings come from, lowest priority first:
//   1. the sound pack built into the game: `sounds/` in the project folder → `custom-sounds/` in the build (and so in the .exe),
//      written by tools/vite/customSounds.mjs (dev server: live from the folder; `vite build`: copied into dist)
//   2. recordings saved in the `sounds` window on this machine (IndexedDB of the browser / of the desktop app)
// Nothing is fetched or decoded unless a pack or a saved recording exists (one fetch of a small manifest at start-up).
import { savedFlags, setSavedFlag, storeGet, storeSet, storeDel } from '../debug/boot.js';
import { voiceDefs } from './VoiceDefs.js';
import { HOSPITAL_SOUND_DEFS } from './HospitalSoundDefs.js';
import { PLACE_SOUND_DEFS } from './PlaceSoundDefs.js';
import { ENV_SOUND_DEFS } from './EnvSoundDefs.js';
import { ROADSIDE_SOUND_DEFS } from './RoadsideSoundDefs.js';
import { BA_SOUND_DEFS } from './BirdAmbSoundDefs.js';
import { CE_SOUND_DEFS } from './CityEventSoundDefs.js';

// id, label, category, kind ('shot' one-shot | 'loop' continuous), lvl = playback gain of a full-scale recording (matches the
// loudness of the synthesised sound it replaces)
const W = (id, name, lvl = 0.55) => ({ id: 'gun.' + id, name: name + ' — gunshot', cat: 'Weapons', lvl });
export const SOUND_DEFS = [
  // one slot per weapon (58th: 27 guns). The first nine are also their TYPE's slot: a weapon whose own slot is empty plays its type's recording
  W('compact', 'PM (compact pistols — also used for PSM / M11 when theirs are empty)', 0.45), W('service', 'M9 (service pistols — also M17 / Type 54)', 0.5), W('heavy', 'M1911A1 (heavy pistols — also Mk 23 / M45A1)', 0.6),
  W('carbine', 'M4A1 (carbines — also Mk 18 / AKS-74U)'), W('assault', 'AK-47 (assault rifles — also Type 56 / AK-74M)'), W('battle', 'M14 (battle rifles — also L1A1 / G3A3)', 0.62),
  W('bolt', 'M24 (bolt-action — also M40A5 / M91/30)', 0.7), W('semi', 'SVD (semi-auto sniper — also M110 / Mk 14)', 0.65), W('precision', 'M2010 (precision — also L115A3 / M107)', 0.7),
  W('psm', 'PSM', 0.42), W('m11', 'M11', 0.45), W('m17', 'M17', 0.5), W('type54', 'Type 54', 0.52), W('mk23', 'Mk 23 Mod 0', 0.6), W('m45a1', 'M45A1', 0.6),
  W('mk18', 'Mk 18 Mod 0'), W('aks74u', 'AKS-74U'), W('type56', 'Type 56'), W('ak74m', 'AK-74M'), W('l1a1', 'L1A1', 0.62), W('g3a3', 'G3A3', 0.62),
  W('m40a5', 'M40A5', 0.7), W('m9130', 'M91/30', 0.7), W('m110', 'M110', 0.65), W('mk14', 'Mk 14 EBR', 0.65), W('l115a3', 'L115A3', 0.72), W('m107', 'M107 (.50)', 0.8),
  W('t56', 'Police T-56 rifle', 0.55),
  { id: 'reload.pistol', name: 'Reload — pistol', cat: 'Weapons', lvl: 0.35 }, { id: 'reload.rifle', name: 'Reload — rifle', cat: 'Weapons', lvl: 0.35 }, { id: 'reload.sniper', name: 'Reload — sniper rifle', cat: 'Weapons', lvl: 0.35 },
  { id: 'gun.cycle', name: 'Bolt / slide cycling', cat: 'Weapons', lvl: 0.3 }, { id: 'gun.dry', name: 'Dry fire (empty click)', cat: 'Weapons', lvl: 0.25 },
  { id: 'gun.scope', name: 'Scope / aim in', cat: 'Weapons', lvl: 0.2 }, { id: 'gun.shell', name: 'Shell casing on the ground', cat: 'Weapons', lvl: 0.2 }, { id: 'gun.hitmarker', name: 'Hit marker', cat: 'Weapons', lvl: 0.2 },
  { id: 'gun.ricochet', name: 'Bullet ricochet', cat: 'Weapons', lvl: 0.25 }, { id: 'impact.metal', name: 'Bullet hitting metal', cat: 'Weapons', lvl: 0.4 },
  { id: 'door.breach', name: 'Door kicked in — latch bursts, leaf slams the stop', cat: 'Fighting', lvl: 0.75 }, { id: 'gun.shotgun', name: 'Bank guard — 12-gauge pump shotgun shot (indoors)', cat: 'Bank', lvl: 0.9 }, { id: 'gun.pump', name: 'Bank guard — shotgun pump (rack back and forward)', cat: 'Bank', lvl: 0.5 }, { id: 'gun.sgLoad', name: 'Bank guard — shell pushed into the magazine', cat: 'Bank', lvl: 0.35 }, { id: 'door.kickHold', name: 'Door kicked — it holds (heavy thud, frame rattle)', cat: 'Fighting', lvl: 0.6 },
  { id: 'punch.swing', name: 'Punch — swing', cat: 'Fighting', lvl: 0.25 }, { id: 'punch.hit', name: 'Punch — landed', cat: 'Fighting', lvl: 0.5 }, { id: 'punch.taken', name: 'Punch — taken / blocked', cat: 'Fighting', lvl: 0.45 },
  { id: 'grenade.pin', name: 'Grenade — pin pulled', cat: 'Explosives', lvl: 0.3 }, { id: 'grenade.throw', name: 'Grenade — throw', cat: 'Explosives', lvl: 0.25 }, { id: 'grenade.bounce', name: 'Grenade — bounce', cat: 'Explosives', lvl: 0.3 },
  { id: 'explosion', name: 'Explosion', cat: 'Explosives', lvl: 1 },
  { id: 'engine.car', name: 'Engine — petrol car (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.5 }, { id: 'engine.diesel', name: 'Engine — diesel SUV / van / jeep (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.55 },
  { id: 'engine.heavy', name: 'Engine — bus / lorry (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.6 }, { id: 'engine.boat', name: 'Engine — inboard boat / yacht diesel (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.6 }, { id: 'engine.outboard', name: 'Engine — outboard motor (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.55 }, { id: 'engine.jetski', name: 'Engine — jet ski (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.55 }, { id: 'engine.tuktuk', name: 'Engine — three-wheeler (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.55 },
  { id: 'engine.bike', name: 'Engine — small motorcycle / scooter (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.5 }, { id: 'engine.bike250', name: 'Engine — 250–750 cc motorcycle (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.55 },
  { id: 'engine.superbike', name: 'Engine — superbike (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.55 }, { id: 'turbo.bov', name: 'Turbo blow-off', cat: 'Vehicles', lvl: 0.35 },
  { id: 'horn.car', name: 'Horn — car', cat: 'Vehicles', lvl: 0.35 }, { id: 'horn.small', name: 'Horn — three-wheeler / motorcycle', cat: 'Vehicles', lvl: 0.3 }, { id: 'horn.heavy', name: 'Horn — bus / lorry', cat: 'Vehicles', lvl: 0.45 },
  { id: 'horn.dual', name: 'Horn — Customs dual tone', cat: 'Vehicles', lvl: 0.35 }, { id: 'horn.sport', name: 'Horn — Customs sport', cat: 'Vehicles', lvl: 0.35 }, { id: 'horn.air', name: 'Horn — Customs air horn', cat: 'Vehicles', lvl: 0.45 }, { id: 'horn.tune', name: 'Horn — Customs musical', cat: 'Vehicles', lvl: 0.35 },
  { id: 'veh.crash', name: 'Vehicle crash', cat: 'Vehicles', lvl: 0.7 }, { id: 'veh.glass', name: 'Window shattering', cat: 'Vehicles', lvl: 0.5 }, { id: 'veh.glassCrack', name: 'Window cracking', cat: 'Vehicles', lvl: 0.35 },
  { id: 'veh.tyreBurst', name: 'Tyre burst', cat: 'Vehicles', lvl: 0.6 }, { id: 'veh.doorOpen', name: 'Car door — open', cat: 'Vehicles', lvl: 0.3 }, { id: 'veh.doorSlam', name: 'Car door — slam', cat: 'Vehicles', lvl: 0.45 },
  { id: 'siren.police', name: 'Police siren (loop)', cat: 'Emergency', kind: 'loop', lvl: 0.45 }, { id: 'siren.ambulance', name: 'Ambulance siren (loop · plays while an ambulance has its sirens on)', cat: 'Hospitals', kind: 'loop', lvl: 0.45 },
  { id: 'heli.rotor', name: 'Police helicopter — rotor & turbines (loop)', cat: 'Emergency', kind: 'loop', lvl: 0.7 }, { id: 'police.radio', name: 'Police radio squelch', cat: 'Emergency', lvl: 0.3 },
  { id: 'station.announce1', name: 'Fort station announcement 1 — train approaching platform 1', cat: 'Station announcements', lvl: 0.85 }, { id: 'station.announce2', name: 'Fort station announcement 2 — train arrived at platform 1', cat: 'Station announcements', lvl: 0.85 },
  { id: 'station.announce3', name: 'Fort station announcement 3 — train about to depart', cat: 'Station announcements', lvl: 0.85 }, { id: 'station.announce4', name: 'Fort station announcement 4 — general (e.g. unattended luggage)', cat: 'Station announcements', lvl: 0.85 },
  { id: 'station.announce5', name: 'Fort station announcement 5 — general (e.g. tickets / information)', cat: 'Station announcements', lvl: 0.85 }, // 54th: the announcer's voice — heard directly in her room, through the PA speakers everywhere else (world/StationLife.js)
  { id: 'train.horn', name: 'Train horn', cat: 'Trains', lvl: 0.5 }, { id: 'train.bell', name: 'Level-crossing bell', cat: 'Trains', lvl: 0.3 }, { id: 'train.clack', name: 'Wheels over rail joints', cat: 'Trains', lvl: 0.3 },
  { id: 'train.run', name: 'Train moving — running sound (loop; follows the speed)', cat: 'Trains', kind: 'loop', lvl: 0.6 }, // 57th: a continuous running sound (a recording longer than ~1.5 s in "Wheels over rail joints" is played this way too)
  { id: 'amb.city', name: 'City traffic hum (loop)', cat: 'Ambience', kind: 'loop', lvl: 0.6 }, { id: 'amb.rain', name: 'Rain (loop)', cat: 'Ambience', kind: 'loop', lvl: 0.6 }, { id: 'amb.sea', name: 'Sea waves (loop)', cat: 'Ambience', kind: 'loop', lvl: 0.6 },
  { id: 'amb.wind', name: 'Wind (loop)', cat: 'Ambience', kind: 'loop', lvl: 0.6 }, { id: 'thunder', name: 'Thunder', cat: 'Ambience', lvl: 0.8 },
  { id: 'bird.song', name: 'Songbird', cat: 'Ambience', lvl: 0.12 }, { id: 'cricket', name: 'Crickets (night)', cat: 'Ambience', lvl: 0.1 }, { id: 'fire', name: 'Fire crackling', cat: 'Ambience', lvl: 0.4 },
  { id: 'debris', name: 'Debris landing', cat: 'Ambience', lvl: 0.4 }, { id: 'bread.tuk', name: 'Bakery three-wheeler chime', cat: 'Ambience', lvl: 0.3 },
  // 67th: Ceylon Meridian Bank (BankAudio.js)
  { id: 'bank.ambience', name: 'Bank — banking hall room tone (loop)', cat: 'Bank', kind: 'loop', lvl: 0.45 }, { id: 'bank.chime', name: 'Bank — queue number chime', cat: 'Bank', lvl: 0.3 },
  { id: 'atm.beep', name: 'ATM — key beep (other customers at the machines)', cat: 'Bank', lvl: 0.25 }, { id: 'atm.card', name: 'ATM — card inserted', cat: 'Bank', lvl: 0.3 }, { id: 'atm.cash', name: 'ATM — counting cash (5 s · deposit and withdrawal)', cat: 'Bank', lvl: 0.4 },
  // 71st: the bank as a real place (BankAudio.js). Lengths are held exactly in code (a longer file is cut there with a short
  // fade); the two loops are made seamless when they are loaded (encoder padding trimmed, the seam cross-faded: loopBuffer)
  { id: 'atm.open', name: 'ATM — screen opens (1 s)', cat: 'Bank', lvl: 0.35 }, { id: 'atm.button', name: 'ATM — button press (1 s)', cat: 'Bank', lvl: 0.35 },
  { id: 'atm.card.machine', name: 'ATM — card return mechanism (2.3 s, before the card comes out)', cat: 'Bank', lvl: 0.4 }, { id: 'atm.card.out', name: 'ATM — card comes out of the slot (0.3 s)', cat: 'Bank', lvl: 0.4 },
  { id: 'bank.ac', name: 'Bank — wall air conditioner running (loop · seamless)', cat: 'Bank', kind: 'loop', lvl: 0.5 },
  { id: 'bank.office', name: 'Bank — office staff: mouse clicks & keyboard typing (loop · seamless)', cat: 'Bank', kind: 'loop', lvl: 0.45 },
  { id: 'bank.phone.ring', name: 'Bank — office landline ringing (31 s)', cat: 'Bank', lvl: 0.45 },
  ...[1, 2].map((n) => ({ id: 'bank.phone.pickup' + n, name: `Bank — landline handset picked up ${n} (1 s)`, cat: 'Bank', lvl: 0.4 })),
  ...[1, 2].map((n) => ({ id: 'bank.phone.hangup' + n, name: `Bank — landline handset put down ${n} (1 s)`, cat: 'Bank', lvl: 0.4 })),
  ...[1, 2, 3].map((n) => ({ id: 'bank.chair.up' + n, name: `Bank — office chair: getting up, variation ${n} (2 s)`, cat: 'Bank', lvl: 0.4 })),
  ...[1, 2, 3].map((n) => ({ id: 'bank.chair.down' + n, name: `Bank — office chair: sitting down, variation ${n} (2 s · seated at ${n === 1 ? '1.3' : '1.0'} s)`, cat: 'Bank', lvl: 0.4 })),
  // 73rd: drinking (bars, club, the heroes' rooms — HeroRooms.Drink): the pour plays while the liquor runs (cut with a short fade when
  // the bottle tips back up), the bottle's put-down when its base meets the counter; one of the two variations at random each time
  ...[1, 2].map((n) => ({ id: 'drink.pour' + n, name: `Drinking — pouring a shot, variation ${n}`, cat: 'Drinking', lvl: 0.45 })),
  ...[1, 2].map((n) => ({ id: 'drink.bottle.down' + n, name: `Drinking — glass bottle put down, variation ${n}`, cat: 'Drinking', lvl: 0.45 })),
  ...HOSPITAL_SOUND_DEFS, // 74th: the National Hospital (HospitalAudio.js)
  ...PLACE_SOUND_DEFS, // 75th: hospital garden, Viharamahadevi Park, doors of every shop (PlaceAudio.js, Audio.roomDoor)
  ...CE_SOUND_DEFS, // 81st: DYNAMIC CITY EVENTS — ambience, stage, crowd, infrastructure, cultural & sporting, safety (CityEvents.js; silent until uploaded)
  ...BA_SOUND_DEFS, // 83rd: URBAN BIRDS & ENVIRONMENTAL AMBIENCE — calls, wings, bird beds, balconies & residential (BirdAudio.js; silent until uploaded)
  ...ROADSIDE_SOUND_DEFS, // 80th: ROADSIDE ASSISTANCE — recovery vehicles, mechanics, roadside, breakdown events (Roadside.js; silent until uploaded)
  ...ENV_SOUND_DEFS, // 76th: footsteps & surfaces, character foley, interactive objects, traffic, vehicle radio, vehicle mechanical (EnvSoundDefs.js)
  { id: 'footstep', name: 'Footstep', cat: 'Player', lvl: 0.25 }, { id: 'phone.ring', name: 'Phone ringing', cat: 'Player', lvl: 0.3 },
  { id: 'ui.click', name: 'Menu click', cat: 'Interface', lvl: 0.25 }, { id: 'ui.hover', name: 'Menu hover', cat: 'Interface', lvl: 0.15 }, { id: 'ui.notify', name: 'Notification', cat: 'Interface', lvl: 0.3 },
  { id: 'ui.wheel.open', name: 'Weapon wheel — opens', cat: 'Interface', lvl: 0.35 }, { id: 'ui.wheel.switch', name: 'Weapon wheel — switching weapon', cat: 'Interface', lvl: 0.3 },
  { id: 'ui.success', name: 'Success', cat: 'Interface', lvl: 0.3 }, { id: 'ui.fail', name: 'Failure', cat: 'Interface', lvl: 0.3 }, { id: 'ui.collect', name: 'Pick-up', cat: 'Interface', lvl: 0.3 }, { id: 'loot.cash', name: 'Loot — cash picked up', cat: 'Interface', lvl: 0.25 }, { id: 'loot.item', name: 'Loot — wallet / phone / bag picked up', cat: 'Interface', lvl: 0.25 }, { id: 'loot.weapon', name: 'Loot — weapon picked up', cat: 'Interface', lvl: 0.3 }, { id: 'loot.fail', name: 'Loot — can\'t take it', cat: 'Interface', lvl: 0.25 }, { id: 'ui.camera', name: 'Camera shutter', cat: 'Interface', lvl: 0.3 },
  ...[['explore', 'Free roam (day)'], ['night', 'Free roam (night)'], ['tension', 'Wanted'], ['chase', 'Police chase'], ['menu', 'Main menu'], ['intro', 'Intro'], ['radio1', 'Car radio — station 1'], ['radio2', 'Car radio — station 2'], ['club', 'Night club PA']]
    .map(([m, n]) => ({ id: 'music.' + m, name: 'Music — ' + n + ' (loop)', cat: 'Music', kind: 'loop', lvl: 0.7 })),
  // 57th: background music while the pause map is open — two slots; which one plays is picked in the sounds window (Music)
  // 91st: any length — streamed like the club songs (a long song is never decoded whole); loops until the map closes (musicLoop)
  { id: 'music.map1', name: 'Music — Map screen, track 1 (loop · any length)', cat: 'Music', kind: 'loop', stream: true, lvl: 0.7 }, { id: 'music.map2', name: 'Music — Map screen, track 2 (loop · any length)', cat: 'Music', kind: 'loop', stream: true, lvl: 0.7 },
  // 71st: while the weapon wheel is held open — fades in over 1 s, out over 1 s on release, loops while held
  { id: 'music.wheel', name: 'Music — Weapon wheel (loop · fades in / out over 1 s)', cat: 'Music', kind: 'loop', lvl: 0.7 },
  // 58th: the club DJ's set — seven song slots played by the DJ through the club's PA speakers (ClubSound.js), one after the
  // other with a DJ cross-fade. Songs are long, so they are STREAMED from the saved file (never decoded whole into memory).
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: 'music.club' + n, name: `Club DJ — song ${n} (through the club speakers)`, cat: 'Music', kind: 'song', stream: true, lvl: 0.9 })),
];
// variations (52nd): a few sounds that repeat a lot get three more slots. Every filled slot of the sound (its own recording and
// any variation) is used, in a shuffled order that never repeats the last one; empty variations simply aren't used, so with
// only the main recording nothing changes.
export const VARIED = ['veh.crash', 'veh.glass', 'veh.glassCrack', 'gun.dry', 'door.breach', 'door.kickHold', 'gun.shotgun', 'gun.pump'];
for (const base of VARIED) { const i = SOUND_DEFS.findIndex((d) => d.id === base); const b = SOUND_DEFS[i]; b.vars = [];
  const vs = [1, 2, 3].map((n) => { const id = `${base}.var${n}`; b.vars.push(id); return { id, name: `${b.name} — variation ${n}`, cat: b.cat, lvl: b.lvl, kind: b.kind, varOf: base }; });
  SOUND_DEFS.splice(i + 1, 0, ...vs); }
// NPC voices (console: dialogs) — see VoiceDefs.js; listed in their own window, not in `sounds`
SOUND_DEFS.push(...voiceDefs());
for (const d of SOUND_DEFS) d.kind ||= 'shot';
export const SOUND_BY_ID = Object.fromEntries(SOUND_DEFS.map((d) => [d.id, d]));
// 91st: duplicate slots removed — each of these was a second slot for a sound another slot already covers (same moment, same
// place). A recording saved in an old slot (this machine, or a file named after it in sounds/) is moved into its replacement
// when that slot is still empty (all: into every listed slot — one recording had served both moments); if the replacement
// already has its own recording, the old one is left untouched in storage and simply no longer used.
export const MERGED_SLOTS = {
  'gun.equip': { to: ['foley.draw', 'foley.holster'], all: true }, // Weapons 'Weapon drawn / holstered' = Character foley draw + holster
  'hosp.door.open': { to: ['door.open1', 'door.open2', 'door.open3', 'door.open4'] }, // hospital room doors play the Doors block (Audio.roomDoor) — this slot was never played
  'hosp.door.close': { to: ['door.close'] }, // (same)
  'ui.door': { to: ['door.open1', 'door.open2', 'door.open3', 'door.open4'] }, // 'Door (building)' — never played; building doors use the Doors block
  'bank.step.tile': { to: ['step.tile.walk'] }, // bank NPC steps = Footsteps 'Indoor tile (… bank …) — walking'
  'bird.crow': { to: ['ba.crow.call', 'ba.crow.call2'] }, // Ambience 'House crow' = URBAN BIRDS 'House Crow Call'
};
const mergedInto = (id, filled) => { const M = MERGED_SLOTS[id]; if (!M) return []; const free = M.to.filter((k) => SOUND_BY_ID[k] && !filled(k)); return M.all ? free : free.slice(0, 1); };
// 71st: a recording looped without a gap or a click. Decoded MP3 / AAC files carry encoder padding (a few ms of digital
// silence at either end) that a plain looping source plays as a dropout every pass; it is trimmed (at most 0.25 s per end,
// so a loop that is meant to start quietly keeps its quiet part), then the last 40 ms are cross-faded (equal power) into the
// first 40 ms, so the end flows into the start sample-continuously. Made once per decoded buffer.
const LOOPED = new WeakMap();
export function loopBuffer(ctx, b) {
  if (!b || !ctx || !ctx.createBuffer) return b; const hit = LOOPED.get(b); if (hit) return hit; let out = b;
  try {
    const n = b.length, nc = b.numberOfChannels, sr = b.sampleRate; const ch = []; for (let c = 0; c < nc; c++) ch.push(b.getChannelData(c));
    let peak = 0; for (const d of ch) for (let i = 0; i < n; i += 5) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
    const th = Math.max(1e-4, peak * 0.002); const loud = (i) => ch.some((d) => Math.abs(d[i]) > th);
    const cap = Math.floor(sr * 0.25); let s = 0; while (s < cap && s < n - 1 && !loud(s)) s++; let e = n - 1; while (e > n - 1 - cap && e > s && !loud(e)) e--;
    const len = e - s + 1, F = Math.min(Math.floor(sr * 0.04), Math.floor(len / 4));
    if (len > sr * 0.3 && F > 32) { const L = len - F; out = ctx.createBuffer(nc, L, sr);
      for (let c = 0; c < nc; c++) { const src = ch[c], dst = out.getChannelData(c); dst.set(src.subarray(s, s + L));
        for (let i = 0; i < F; i++) { const x = (i + 0.5) / F; dst[i] = src[s + i] * Math.sin(x * Math.PI / 2) + src[s + L + i] * Math.cos(x * Math.PI / 2); } } }
  } catch { out = b; }
  LOOPED.set(b, out); return out;
}
export const SOUND_EXT = /\.(mp3|wav|ogg)$/i;
const MAX_VOICES = 8; // overlapping copies of one recording (an automatic rifle with a 2 s recording)
const MUSIC_DECODE_MAX = 2.5 * 1024 * 1024; // 91st: musicLoop — a streamed music file up to this size is decoded and looped seamlessly
const MAX_TOTAL = 56; // 76th: recordings playing at once across the whole game — past this a new one-shot is dropped (a far / quiet one first: see play())
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

class Bank {
  constructor() { this.raw = new Map(); this.buf = new Map(); this.ctx = null; this.audio = null; this.bypass = false; this.voices = new Map(); this.listeners = new Set(); this.loaded = null; this.pack = new Map(); this.bags = new Map(); this.turn = new Map(); this.lastPick = new Map(); this.lastDur = 0; this.live = 0; this.dropped = 0; }
  has(id) { if (this.bypass) return false; if (this.buf.has(id)) return true; const d = SOUND_BY_ID[id]; if (d && d.stream) return this.raw.has(id); return !!(d && d.vars && d.vars.some((k) => this.buf.has(k))); }
  // which recording of id plays now: id itself, or one of its filled variations (shuffle bag: each filled slot once per round,
  // never the same twice in a row across rounds)
  pick(id) {
    const d = SOUND_BY_ID[id]; if (!d || !d.vars) return id;
    // sound variations (window crack, glass, dry fire, crash): strictly in turn — original → 1 → 2 → 3 → original …; an empty
    // variation slot plays the original custom sound in its turn
    if (!d.dlg && !d.rnd) { const n = ((this.turn.get(id) ?? -1) + 1) % (d.vars.length + 1); this.turn.set(id, n); const k = n ? d.vars[n - 1] : id; return this.buf.has(k) ? k : id; }
    const pool = [id, ...d.vars].filter((k) => this.buf.has(k)); if (pool.length <= 1) return pool[0] || id;
    let bag = this.bags.get(id); if (!bag || !bag.length || bag.some((k) => !this.buf.has(k))) { bag = shuffle(pool.slice()); if (bag[0] === this.lastPick.get(id)) bag.push(bag.shift()); this.bags.set(id, bag); }
    const k = bag.shift(); this.lastPick.set(id, k); return k;
  }
  // duration (s) of what id would play (its main recording, else the first filled variation) — 0 without a recording
  duration(id) { const d = SOUND_BY_ID[id]; const k = this.buf.has(id) ? id : d && d.vars ? d.vars.find((v) => this.buf.has(v)) : null; const b = k && this.buf.get(k); return b ? b.duration : 0; }
  level(id) { const r = this.raw.get(id); return (SOUND_BY_ID[id] ? SOUND_BY_ID[id].lvl : 0.4) * (r && r.vol != null ? r.vol : 1); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(id) { this.bags.clear(); for (const fn of this.listeners) try { fn(id); } catch (e) { console.warn('[sounds]', e); } }
  // ---- start-up: the built-in pack, then this machine's saved recordings (they win)
  load() {
    if (this.loaded) return this.loaded;
    return (this.loaded = (async () => {
      try { if (typeof fetch === 'function' && typeof location !== 'undefined') { const r = await fetch('custom-sounds/manifest.json', { cache: 'no-cache' });
        if (r.ok && (r.headers.get('content-type') || '').includes('json')) { const m = await r.json(); const all = Object.entries((m && m.sounds) || {});
          // current slots first, then files named after a removed duplicate slot (91st) into their replacement if it has no file of its own
          for (const [id, e] of [...all.filter(([k]) => SOUND_BY_ID[k]), ...all.filter(([k]) => !SOUND_BY_ID[k] && MERGED_SLOTS[k])]) { if (!e || !e.file) continue;
            const ids = SOUND_BY_ID[id] ? [id] : mergedInto(id, (k) => this.pack.has(k)); if (!ids.length) continue;
            try { const f = await fetch('custom-sounds/' + encodeURIComponent(e.file)); if (f.ok) { const P = { data: await f.arrayBuffer(), name: e.name || e.file, vol: e.vol ?? 1, src: 'pack' }; for (const k of ids) { this.pack.set(k, P); this.raw.set(k, P); } } } catch { /* missing file */ } } } } } catch { /* no pack */ }
      if (savedFlags().sounds) { const ids = (await storeGet('sound:index')) || []; const old = [];
        for (const id of Array.isArray(ids) ? ids : []) { const e = await storeGet('sound:' + id); if (!e || !e.data) continue; if (SOUND_BY_ID[id]) this.raw.set(id, { ...e, src: 'user' }); else if (MERGED_SLOTS[id]) old.push([id, e]); }
        // 91st: recordings saved in a removed duplicate slot move to its replacement (only into a slot with no recording yet)
        let moved = 0; for (const [id, e] of old) { try { const to = mergedInto(id, (k) => this.raw.has(k)); if (!to.length) { console.info(`[sounds] ${id} was merged into ${MERGED_SLOTS[id].to.join(' / ')}, which already ${MERGED_SLOTS[id].to.length > 1 ? 'have' : 'has'} a recording — the old one is kept in storage, unused`); continue; }
          for (const k of to) { this.raw.set(k, { ...e, src: 'user' }); await storeSet('sound:' + k, e); } await storeDel('sound:' + id); moved++; console.info(`[sounds] moved the recording of the removed duplicate slot ${id} → ${to.join(', ')}`); } catch (err) { console.warn('[sounds] could not move', id, err); } }
        if (moved) await this.saveIndex(); }
      if (this.ctx) await this.decodeAll();
      return this.raw.size;
    })());
  }
  attach(ctx, audio) { this.ctx = ctx; this.audio = audio; if (this.raw.size) this.decodeAll(); }
  async decodeAll() { await Promise.all([...this.raw.keys()].filter((id) => !(SOUND_BY_ID[id] && SOUND_BY_ID[id].stream)).map((id) => this.decode(id))); }
  // streamed songs (club DJ): a blob URL of the saved file for an <audio> element — the browser decodes it as it plays
  url(id) { const r = this.bypass ? null : this.raw.get(id); if (!r || !r.data) return null; if (!r.url) { const ty = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' }[r.type || (r.name.match(SOUND_EXT) || ['', 'mp3'])[1].toLowerCase()] || 'audio/mpeg'; r.url = URL.createObjectURL(new Blob([r.data], { type: ty })); } return r.url; }
  async decode(id) {
    const r = this.raw.get(id); if (!r || !this.ctx) return null;
    try { const b = await this.ctx.decodeAudioData(r.data.slice(0)); if (this.raw.get(id) === r) { this.buf.set(id, b); this.emit(id); } return b; } catch (e) { console.warn('[sounds] could not decode', id, r.name, e); return null; }
  }
  // ---- playback
  // one-shot: returns true when a recording replaced the synthesised sound (the caller then skips its own synthesis)
  //   dur: hard length in s (faded over the last 40 ms) · lp: low-pass cut-off in Hz (distance: air + buildings eat the highs)
  //   wet: reverb send level when verb (far sounds are mostly reflections) · track: object that receives { g, p, end } so the
  //   caller can keep the gain / pan following a moving source (horns) · voice key: shares the MAX_VOICES pool (default id)
  play(id, k = 1, pan = 0, when = 0, { out = 'sfx', rate = 1, verb = false, mono = false, dur = 0, lp = 0, hp = 0, wet = 1, track = null, key = null } = {}) {
    if (this.bypass) return false; const pid = this.pick(id); const b = this.buf.get(pid); if (!b) return false; const A = this.audio; this.lastDur = dur > 0 ? Math.min(dur, b.duration / rate) : b.duration / rate; if (!A || !A.live) return true; id = key || id;
    let V = this.voices.get(id); if (!V) this.voices.set(id, (V = []));
    const c = this.ctx, now = c.currentTime; for (let i = V.length - 1; i >= 0; i--) if (V[i].end <= now) V.splice(i, 1);
    if (mono && V.length) return true; // continuous texture (fire): let the playing copy finish
    if (this.live >= MAX_TOTAL && (k < 0.6 || this.live >= MAX_TOTAL + 8)) { this.dropped++; return true; } // 76th: shared voice budget — quiet / far sounds are the first to go
    if (V.length >= MAX_VOICES) { const o = V.shift(); try { o.g.gain.setTargetAtTime(0, now, 0.02); o.src.stop(now + 0.1); } catch { /* already stopped */ } }
    const t = now + Math.max(0, when); const src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = rate; const g = c.createGain(); const lvl = Math.max(0, k) * this.level(pid); g.gain.value = lvl;
    const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); let head = src;
    if (lp > 0 && lp < 19000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.5; src.connect(f); head = f; }
    if (hp > 0) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; f.Q.value = 0.6; head.connect(f); head = f; } // a PA horn speaker has no bass (station announcements)
    head.connect(g); g.connect(p); p.connect(A.bus[out] || A.bus.sfx);
    if (verb && A.verb) { if (wet === 1) p.connect(A.verb); else { const s = c.createGain(); s.gain.value = Math.max(0, wet); p.connect(s); s.connect(A.verb); } }
    let end = t + b.duration / rate;
    src.start(t); // 72nd: start before any stop() — stop() on a source that was never started throws (InvalidStateError), which made every
    // recording a little longer than its hard length (an mp3 of "exactly 1 s" decodes to ~1.03 s: encoder padding) throw out of the caller
    if (dur > 0 && dur < b.duration / rate) { end = t + dur; g.gain.setTargetAtTime(0.0001, Math.max(t, end - 0.045), 0.012); src.stop(end + 0.01); /* from whatever gain it has then (a horn's follows its car) */ } const vo = { src, g, p, end, lvl }; V.push(vo); if (track) track.voice = vo; this.live++; src.onended = () => { this.live = Math.max(0, this.live - 1); try { p.disconnect(); } catch { /* gone */ } };
    return true;
  }
  // continuous: keeps holder.smp = a looping source of id's recording feeding dest (null when id has no recording). The caller
  // sets dest's gain (distance, state) and smp.src.playbackRate (engine revs, rotor speed) every frame.
  syncLoop(h, id, dest, at = null) { // at: start offset in s (default: a random point — beds that should not phase together)
    const b = this.bypass ? null : this.buf.get(id) || null;
    if (h.smp && (h.smp.el || h.smp.b !== b || h.smp.id !== id || h.smp.dest !== dest)) this.endLoop(h, true);
    if (!b || !dest || !this.ctx) return null;
    if (!h.smp) { const c = this.ctx; const lb = loopBuffer(c, b); const src = c.createBufferSource(); src.buffer = lb; src.loop = true; const g = c.createGain(); g.gain.value = this.level(id); src.connect(g); g.connect(dest);
      const off = (at ?? Math.random() * b.duration) % Math.max(1e-3, lb.duration); src.start(c.currentTime, off); h.smp = { src, g, b, id, dest, t0: c.currentTime, off, len: lb.duration }; }
    else h.smp.g.gain.value = this.level(id);
    return h.smp;
  }
  stopLoop(h) { this.endLoop(h, false); }
  // stops the holder's loop (a decoded one, or a streamed one: musicLoop); fade: a 50 ms fade instead of a hard stop. Holders
  // with a pos map (musicLoop) remember where each recording was, so the next start carries on from there.
  endLoop(h, fade) {
    if (!h || !h.smp) return; const s = h.smp; h.smp = null; const c = this.ctx;
    if (s.el) { try { if (h.pos) h.pos[s.id] = s.el.currentTime || 0; s.el.pause(); } catch { /* not loaded */ } return; } // the element and its source node are kept for reuse
    if (h.pos && c && s.len) h.pos[s.id] = (s.off + (c.currentTime - s.t0)) % s.len;
    try { if (fade && c) { s.g.gain.setTargetAtTime(0, c.currentTime, 0.05); s.src.stop(c.currentTime + 0.3); } else s.src.stop(); } catch { /* stopped */ }
  }
  // 91st: a looping music slot of ANY length (the map tracks). Streamed slots: a file up to MUSIC_DECODE_MAX bytes (about two
  // minutes of mp3 / ogg) is decoded once and looped seamlessly exactly like syncLoop; a bigger one plays through one looping
  // <audio> element per holder (decoded as it plays, so a 10-minute song costs no memory up front). Either way it starts from
  // the top the first time and carries on from where it stopped afterwards. Non-streamed slots go straight to syncLoop.
  musicLoop(h, id, dest) {
    const d = SOUND_BY_ID[id]; h.pos ||= {};
    if (!d || !d.stream) return this.syncLoop(h, id, dest); // (the other music slots: unchanged — decoded, from a random point)
    const r = this.bypass ? null : this.raw.get(id);
    if (!r || !r.data || !dest || !this.ctx) { this.endLoop(h, true); return null; }
    if (r.data.byteLength <= MUSIC_DECODE_MAX) {
      if (this.buf.has(id)) return this.syncLoop(h, id, dest, h.pos[id] || 0);
      if (h.smp && h.smp.id !== id) this.endLoop(h, true);
      if (!r.decoding) r.decoding = this.decode(id).then((b) => { if (!b) r.tooBig = true; }); // (a few ms; nothing plays meanwhile)
      if (!r.tooBig) return null;
    }
    if (h.smp && (!h.smp.el || h.smp.id !== id || h.smp.dest !== dest)) this.endLoop(h, true);
    if (!h.smp) {
      const c = this.ctx; const url = this.url(id); if (!url) return null;
      if (!h.el) { try { const el = new window.Audio(); el.preload = 'auto'; el.loop = true; const src = c.createMediaElementSource(el); const g = c.createGain(); src.connect(g); h.el = el; h.elG = g; } catch (e) { console.warn('[sounds] music stream', e); return null; } }
      const el = h.el, g = h.elG; try { g.disconnect(); } catch { /* not connected */ } g.connect(dest); g.gain.value = this.level(id); el.loop = true;
      if (el.src !== url) el.src = url; const at = h.pos[id] || 0;
      const seek = () => { try { el.currentTime = Number.isFinite(el.duration) && el.duration > 0 ? at % el.duration : at; } catch { /* not seekable yet */ } };
      if (el.readyState >= 1) seek(); else el.addEventListener('loadedmetadata', seek, { once: true });
      const p = el.play(); if (p && p.catch) p.catch(() => { /* resumes with the audio context */ });
      h.smp = { el, g, id, dest };
    } else { h.smp.g.gain.value = this.level(id); if (h.smp.el.paused && this.ctx.state === 'running') { const p = h.smp.el.play(); if (p && p.catch) p.catch(() => {}); } }
    return h.smp;
  }
  // ---- editing (SoundsWindow): set / volume / remove, persisted per machine (and to the project folder on the dev server)
  async set(id, data, name, vol = 1) {
    if (!SOUND_BY_ID[id]) throw new Error('unknown sound ' + id);
    const e = { data, name, vol, type: (name.match(SOUND_EXT) || ['', 'mp3'])[1].toLowerCase(), t: Date.now() };
    this.buf.delete(id);
    const old = this.raw.get(id); if (old && old.url) URL.revokeObjectURL(old.url);
    if (SOUND_BY_ID[id].stream) { this.raw.set(id, { ...e, src: 'user' }); if (this.ctx) { try { await this.ctx.decodeAudioData(data.slice(0)); } catch { this.raw.delete(id); throw new Error(`"${name}" could not be decoded as audio`); } } this.emit(id); } // checked once, then streamed
    else { this.raw.set(id, { ...e, src: 'user' }); if (this.ctx) { const b = await this.decode(id); if (!b) { this.raw.delete(id); throw new Error(`"${name}" could not be decoded as audio`); } } }
    await storeSet('sound:' + id, e); await this.saveIndex(); return true;
  }
  async setVolume(id, vol) { const r = this.raw.get(id); if (!r) return; r.vol = vol; if (r.src === 'user') { const e = await storeGet('sound:' + id); if (e) { e.vol = vol; await storeSet('sound:' + id, e); } } }
  async remove(id) { const r = this.raw.get(id); if (r && r.url) { URL.revokeObjectURL(r.url); r.url = null; } this.raw.delete(id); this.buf.delete(id); if (r && r.src === 'user') { await storeDel('sound:' + id); await this.saveIndex(); }
    const P = this.pack.get(id); if (P && r !== P) { this.raw.set(id, P); if (!SOUND_BY_ID[id].stream) await this.decode(id); } this.emit(id); } // a saved recording removed: the built-in pack's (if any) is used again
  async saveIndex() { const ids = [...this.raw.entries()].filter(([, r]) => r.src === 'user').map(([k]) => k); await storeSet('sound:index', ids); setSavedFlag('sounds', ids.length > 0); }
  info(id) { const r = this.raw.get(id); return r ? { name: r.name, vol: r.vol ?? 1, src: r.src, ok: this.buf.has(id) || !!(SOUND_BY_ID[id] && SOUND_BY_ID[id].stream), bytes: r.data ? r.data.byteLength : 0, pack: this.pack.has(id) } : null; }
}
export const SoundBank = new Bank();
if (typeof window !== 'undefined') window.__sounds = SoundBank;
