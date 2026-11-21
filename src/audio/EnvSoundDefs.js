// 76th: the environmental audio expansion — six new blocks on the existing `sounds` board (SoundBank / SoundsWindow).
// Every slot here is played by a real game event (see the file named in each block); an empty slot falls back to a cheap
// synthesised sound (or, where noted, to an older slot), so nothing goes silent while recordings are still missing.
//
//   nv  = extra variation slots under the main one (all filled ones are used in a shuffled order that never repeats the last
//         pick — 'rnd'), so footsteps / impacts don't machine-gun the same file
//   fb  = what is heard while the slot (and all its variations) is empty — shown in the sounds window
//   stream = long songs / talk segments: streamed from the saved file (never decoded whole into memory)

// ---- 1. Footsteps & surface audio (Footsteps.js): picked by the surface under the foot, the gait (walk < 2.4 m/s ≤ jog <
// 5 m/s ≤ run) and the wetness; played on the real foot contacts of the gait (Player A.stepped → 'footstep' event)
export const STEP_SURFACES = [
  ['concrete', 'Concrete (pavements, plazas, forecourts, car parks)'],
  ['asphalt', 'Asphalt (roads)'],
  ['gravel', 'Gravel (railway ballast, laterite lots, temple sand)'],
  ['grass', 'Grass (parks, lawns, gardens)'],
  ['mud', 'Mud (grass / earth after rain)'],
  ['wet', 'Wet hard ground (concrete / asphalt / paving in and after rain)'],
  ['tile', 'Indoor tile (hospital, bank, shops, police station)'],
  ['wood', 'Wooden floor (wooden interiors, marina decks)'],
  ['metalStair', 'Metal stairs (aluminium gangway / steel treads)'],
  ['grate', 'Metal grates (drain gratings, manhole covers)'],
];
export const GAITS = [['walk', 'walking'], ['jog', 'jogging'], ['run', 'running / sprinting']];

const D = [];
const add = (id, name, cat, o = {}) => { const d = { id, name, cat, lvl: 0.4, ...o }; D.push(d); return d; };
// a slot with nv variation slots (shuffled, never the same twice in a row)
const varied = (id, name, cat, nv, o = {}) => { const b = add(id, name, cat, { ...o, rnd: true }); b.vars = [];
  for (let n = 1; n <= nv; n++) { const vid = `${id}.var${n}`; b.vars.push(vid); D.push({ id: vid, name: `${name} — variation ${n}`, cat, lvl: b.lvl, kind: b.kind, varOf: id, rnd: true, fb: b.fb }); }
  return b; };

const FS = 'Footsteps & surfaces';
for (const [s, sn] of STEP_SURFACES) for (const [g, gn] of GAITS)
  varied(`step.${s}.${g}`, `${sn} — ${gn}`, FS, 2, { lvl: g === 'run' ? 0.42 : g === 'jog' ? 0.36 : 0.3, fb: 'synthesised ' + s + ' step (or the generic Player → Footstep recording)' });
varied('step.puddle', 'Puddle splash (layered on a step through standing water in the rain)', FS, 2, { lvl: 0.35, fb: 'synthesised splash' });

// ---- 2. Character foley (Footsteps.js / Weapons.js)
const CF = 'Character foley';
varied('foley.cloth.walk', 'Clothing rustle — walking (one per step)', CF, 2, { lvl: 0.18, fb: 'soft synthesised rustle' });
varied('foley.cloth.run', 'Clothing rustle — jogging (one per step)', CF, 2, { lvl: 0.22, fb: 'synthesised rustle' });
varied('foley.cloth.sprint', 'Clothing rustle — sprinting (one per step)', CF, 2, { lvl: 0.26, fb: 'synthesised rustle' });
add('foley.breath.light', 'Breathing — light (loop · after a jog / some stamina used)', CF, { kind: 'loop', lvl: 0.3, fb: 'synthesised breaths' });
add('foley.breath.heavy', 'Breathing — heavy (loop · stamina low / out of breath)', CF, { kind: 'loop', lvl: 0.4, fb: 'synthesised breaths' });
varied('foley.holster', 'Weapon holstered (the moment it seats in the holster / sling)', CF, 1, { lvl: 0.3, fb: 'Weapons → Weapon drawn / holstered' });
varied('foley.draw', 'Weapon drawn (the moment it leaves the holster / sling)', CF, 1, { lvl: 0.3, fb: 'Weapons → Weapon drawn / holstered' });
varied('foley.switch', 'Weapon switching (swap straight from one weapon to another)', CF, 1, { lvl: 0.3, fb: 'Weapons → Weapon drawn / holstered, at the new weapon\'s draw' });
varied('foley.gear', 'Equipment movement (slung rifle / holster rattle, one per step while armed)', CF, 2, { lvl: 0.16, fb: 'faint synthesised rattle' });

// ---- 3. Interactive object audio (ObjectAudio.js): vehicles hitting / scraping things, bullets striking them, knocked-down
// poles falling, police caps / loot dropping; one sound per real contact (cooldown per object — never every physics frame)
const IO = 'Interactive objects';
varied('obj.trash', 'Trash can impacts (litter bins hit by a vehicle or a bullet)', IO, 2, { lvl: 0.45, fb: 'synthesised hollow clang' });
varied('obj.metal', 'Metal object rattles (poles, signals, shelters, containers, barriers — hit by a vehicle or a bullet, a pole knocked down)', IO, 2, { lvl: 0.45, fb: 'synthesised metal clang' });
varied('obj.glass', 'Glass breaking (lamp / signal heads smashing when a pole is knocked down)', IO, 2, { lvl: 0.5, fb: 'synthesised shatter' });
varied('obj.fence', 'Fence rattling (railings, fences hit by a vehicle or a bullet)', IO, 2, { lvl: 0.45, fb: 'synthesised chain-link rattle' });
varied('obj.wood', 'Wooden object impacts (benches, stalls hit by a vehicle or a bullet)', IO, 2, { lvl: 0.45, fb: 'synthesised wooden knock' });
varied('obj.fall', 'Object falling (a knocked-down pole hitting the ground, a knocked-off cap landing)', IO, 2, { lvl: 0.45, fb: 'synthesised thud' });
varied('obj.collision', 'Object collision (a vehicle hitting a wall, building or other solid object)', IO, 2, { lvl: 0.4, fb: 'synthesised bump' });
add('obj.drag', 'Object dragging / scraping (loop · a car grinding along a wall or barrier)', IO, { kind: 'loop', lvl: 0.45, fb: 'synthesised scrape' });

// ---- 4. Traffic audio (TrafficAudio.js + Audio.updateEngines): the traffic simulation's own vehicles, positioned in stereo,
// attenuated with distance, Doppler-shifted as they pass; nothing for vehicles that aren't loaded near the player
const TR = 'Traffic';
varied('traffic.approach', 'Approaching vehicle engine (a fast car closing in on you)', TR, 2, { lvl: 0.4, fb: 'the engine voice swelling (synthesised)' });
varied('traffic.whoosh', 'Passing vehicle whoosh (the moment it goes by)', TR, 2, { lvl: 0.5, fb: 'synthesised air whoosh' });
varied('traffic.away', 'Vehicle passing away (the tail after it has gone by)', TR, 2, { lvl: 0.35, fb: 'synthesised fading rush' });
add('traffic.tyres', 'Car tyre sounds (loop · tyre roar of nearby traffic, follows speed)', TR, { kind: 'loop', lvl: 0.4, fb: 'synthesised tyre noise' });
add('traffic.motorcycle', 'Motorcycle engine — traffic (loop · NPC motorcycles; empty = Vehicles → motorcycle engines)', TR, { kind: 'loop', lvl: 0.5, fb: 'Vehicles → Engine — motorcycle slots' });
add('traffic.bus', 'Bus engine — traffic (loop · NPC buses / lorries; empty = Vehicles → bus / lorry engine)', TR, { kind: 'loop', lvl: 0.6, fb: 'Vehicles → Engine — bus / lorry' });
add('traffic.tuktuk', 'Tuk-tuk engine — traffic (loop · NPC three-wheelers; empty = Vehicles → three-wheeler engine)', TR, { kind: 'loop', lvl: 0.5, fb: 'Vehicles → Engine — three-wheeler' });
varied('traffic.horn', 'Vehicle horns — traffic (NPC drivers; empty = Vehicles → horn slots)', TR, 3, { lvl: 0.35, fb: 'Vehicles → Horn slots' });
varied('traffic.screech', 'Tyre screech — traffic (an NPC driver braking hard / swerving)', TR, 3, { lvl: 0.45, fb: 'synthesised screech' });

// ---- 5. Vehicle radio (CarRadio.js): three stations, live (each keeps running while you listen to another); songs and talk
// segments are streamed. The station plays from the car's speakers: full inside, muffled by the body outside
const RA = 'Vehicle radio';
export const RADIO_STATIONS = [
  { key: 'breeze', name: 'Radio Lanka Breeze 98.4', freq: 98.4, kind: 'music', mode: 'radio1', bed: 'music.radio1' },
  { key: 'pulse', name: 'Island Pulse 104.2', freq: 104.2, kind: 'music', mode: 'radio2', bed: 'music.radio2' },
  { key: 'talk', name: 'Colombo Talk 91.6', freq: 91.6, kind: 'talk', mode: null, bed: null },
];
for (const [k, n] of [['breeze', 'Radio Lanka Breeze 98.4'], ['pulse', 'Island Pulse 104.2']]) for (let i = 1; i <= 4; i++)
  add(`radio.${k}.${i}`, `Radio station music — ${n}, song ${i}`, RA, { kind: 'song', stream: true, lvl: 0.8, fb: 'the station\'s Music slot, else its synthesised groove' });
for (let i = 1; i <= 4; i++) add(`radio.talk.${i}`, `Talk radio segment ${i} (Colombo Talk 91.6 · also the DJ breaks between songs)`, RA, { kind: 'song', stream: true, lvl: 0.85, fb: 'synthesised studio chatter' });
varied('radio.tune', 'Radio tuning (the dial / button when you change station)', RA, 1, { lvl: 0.35, fb: 'synthesised tuning sweep' });
add('radio.static', 'Static interference (loop · between stations while tuning, weak signal)', RA, { kind: 'loop', lvl: 0.3, fb: 'synthesised static' });
varied('radio.transition', 'Station transition (jingle / sting between songs and segments)', RA, 2, { lvl: 0.55, fb: 'synthesised chime' });

// ---- 6. Vehicle mechanical audio (VehicleAudio.js): the player's vehicle — engine start / idle / shutdown per vehicle class,
// cooling ticks after parking, indicators, gears, brakes, tyres. Classes: car (petrol), diesel (SUV / van / jeep), heavy (bus /
// lorry), bike (motorcycle / scooter), tuktuk (three-wheeler)
const VM = 'Vehicle mechanical';
export const VEH_CLASSES = [['car', 'petrol car'], ['diesel', 'diesel SUV / van / jeep'], ['heavy', 'bus / lorry'], ['bike', 'motorcycle / scooter'], ['tuktuk', 'three-wheeler']];
add('mech.indL', 'Left indicator (one click — played on every flash on / off)', VM, { lvl: 0.3, fb: 'synthesised relay click' });
add('mech.indR', 'Right indicator (one click — played on every flash on / off)', VM, { lvl: 0.3, fb: 'synthesised relay click' });
for (const [c, cn] of VEH_CLASSES) add(`mech.idle.${c}`, `Engine idle — ${cn} (loop · standing still, engine running)`, VM, { kind: 'loop', lvl: 0.5, fb: 'the running engine loop / synthesised engine' });
for (const [c, cn] of VEH_CLASSES) add(`mech.start.${c}`, `Engine startup — ${cn} (getting in as the driver)`, VM, { lvl: 0.55, fb: 'synthesised starter + catch' + (c !== 'car' ? ' (or the petrol car startup)' : '') });
for (const [c, cn] of VEH_CLASSES) add(`mech.stop.${c}`, `Engine shutdown — ${cn} (getting out / engine off)`, VM, { lvl: 0.5, fb: 'synthesised run-down' + (c !== 'car' ? ' (or the petrol car shutdown)' : '') });
varied('mech.tick', 'Cooling engine ticks (after a drive, once the engine is off)', VM, 2, { lvl: 0.3, fb: 'synthesised metal ticks' });
add('mech.tyreRoll', 'Tyre rolling (loop · your vehicle, follows speed and surface)', VM, { kind: 'loop', lvl: 0.4, fb: 'synthesised tyre noise' });
add('mech.screech', 'Tyre screech (loop · your vehicle sliding, locking up, spinning the wheels)', VM, { kind: 'loop', lvl: 0.5, fb: 'synthesised screech' });
varied('mech.gear', 'Gear change (each shift of your vehicle)', VM, 2, { lvl: 0.3, fb: 'synthesised clunk' });
varied('mech.brake', 'Brake squeal (coming to a stop)', VM, 1, { lvl: 0.35, fb: 'synthesised squeal' });
add('mech.brake.air', 'Air brake hiss (bus / lorry stopping)', VM, { lvl: 0.5, fb: 'synthesised air hiss' });

export const ENV_SOUND_DEFS = D;
// short intros shown under each block's heading in the sounds window
export const ENV_CAT_INFO = {
  [FS]: 'Chosen by the ground under your feet (roads, pavements, lawns, ballast, lots, interiors, decks, drain grates), by speed (walk / jog / run) and by wetness (rain turns hard ground "wet" and earth into "mud"; puddles add a splash). Played on the real foot contacts of the walk cycle — also for NPCs near you. Each gait has 2 extra variation slots; any empty slot falls back to the next best one.',
  [CF]: 'Clothing rustle on each step (by gait), breathing that follows your stamina, holster / draw / switch at the exact moment of the animation, gear rattle while armed.',
  [IO]: 'Played when something is really hit: a vehicle into a bin, railing, pole, shelter, bench or wall, a bullet striking them, a pole knocked down and landing, a knocked-off cap landing, a vehicle grinding along a wall. One sound per contact (per-object cooldown), positioned in the world.',
  [TR]: 'Nearby traffic only (the simulation\'s own vehicles): approach swell, pass-by whoosh and tail with Doppler pitch, tyre roar, NPC engines per class, NPC horns and hard-braking screeches. Stereo-positioned, distance-attenuated; distant vehicles make no sound.',
  [RA]: 'Three live stations in every motor vehicle: R = next station, [ = previous (Settings → Controls). Songs and talk segments are streamed. Inside you hear the car speakers; get out with the radio on and it plays on from the car, muffled by the body, louder with a door open or windows broken; it stops when the car is wrecked or unloaded.',
  [VM]: 'Your vehicle: startup when you get in as the driver, idle at a standstill, shutdown when you get out, cooling ticks after a drive, indicators (, and . keys) clicking with the flashing lamps, gear changes, brake squeal / air brakes, tyre roll and screech. Separate start / idle / stop slots per vehicle class.',
};
