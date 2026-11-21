// 75th request — sound-board blocks for places (pure data: SoundBank.js imports this file; PlaceAudio.js and Audio.roomDoor
// play the entries). Every slot has a synthesised placeholder until a recording is supplied in the `sounds` window.
//   Hospital garden      — the planted grounds in front of / beside the National Hospital
//   Viharamahadevi Park  — the big fountain on the central plaza, the lily-pond jets, trees, birds, people
//   Doors                — hinged doors of every walk-in shop, the bank and the hospital (4 opening variations + closing)
export const PLACE_SOUND_DEFS = [
  // ---- Hospital garden
  { id: 'garden.fountain', name: 'Hospital garden — small fountain splashing (positional loop)', cat: 'Hospital garden', kind: 'loop', lvl: 0.45 },
  { id: 'garden.birds', name: 'Hospital garden — garden birds in the trees: bulbuls, magpie-robin, sunbirds (loop · daytime)', cat: 'Hospital garden', kind: 'loop', lvl: 0.35 },
  { id: 'garden.breeze', name: 'Hospital garden — breeze in the leaves (loop)', cat: 'Hospital garden', kind: 'loop', lvl: 0.35 },
  { id: 'garden.chatter', name: 'Hospital garden — patients and visitors talking quietly on the benches (positional loop)', cat: 'Hospital garden', kind: 'loop', lvl: 0.3 },
  { id: 'garden.bench', name: 'Hospital garden — sitting down on / getting up from a wooden bench', cat: 'Hospital garden', lvl: 0.35 },
  { id: 'garden.crickets', name: 'Hospital garden — crickets and frogs (loop · night)', cat: 'Hospital garden', kind: 'loop', lvl: 0.3 },
  // ---- Viharamahadevi Park
  { id: 'park.fountain', name: 'Viharamahadevi Park — the big central fountain (positional loop)', cat: 'Viharamahadevi Park', kind: 'loop', lvl: 0.6 },
  { id: 'park.jets', name: 'Viharamahadevi Park — lily-pond fountain jets (positional loop)', cat: 'Viharamahadevi Park', kind: 'loop', lvl: 0.4 },
  { id: 'park.birds', name: 'Viharamahadevi Park — birdsong in the big trees: mynas, bulbuls, barbets (loop · daytime)', cat: 'Viharamahadevi Park', kind: 'loop', lvl: 0.4 },
  { id: 'park.breeze', name: 'Viharamahadevi Park — wind through the rain trees and palms (loop)', cat: 'Viharamahadevi Park', kind: 'loop', lvl: 0.35 },
  { id: 'park.people', name: 'Viharamahadevi Park — people strolling and talking, distant children playing (loop · daytime)', cat: 'Viharamahadevi Park', kind: 'loop', lvl: 0.35 },
  { id: 'park.night', name: 'Viharamahadevi Park — crickets, frogs at the ponds (loop · night)', cat: 'Viharamahadevi Park', kind: 'loop', lvl: 0.35 },
  { id: 'park.koel', name: 'Viharamahadevi Park — Asian koel calling (one call now and then)', cat: 'Viharamahadevi Park', lvl: 0.35 },
  { id: 'park.crow', name: 'Viharamahadevi Park — house crows squabbling (now and then)', cat: 'Viharamahadevi Park', lvl: 0.35 },
  { id: 'park.squirrel', name: 'Viharamahadevi Park — palm squirrel chirping (now and then)', cat: 'Viharamahadevi Park', lvl: 0.3 },
  { id: 'park.vendor', name: 'Viharamahadevi Park — ice-cream / snack vendor’s bell (now and then · daytime)', cat: 'Viharamahadevi Park', lvl: 0.35 },
  { id: 'park.ducks', name: 'Viharamahadevi Park — ducks on the lily ponds (now and then)', cat: 'Viharamahadevi Park', lvl: 0.3 },
  // ---- Doors (every hinged door: walk-in shops, bank, hospital rooms)
  ...[1, 2, 3, 4].map((n) => ({ id: 'door.open' + n, name: `Door opening — variation ${n} (all shop / room doors)`, cat: 'Doors', lvl: 0.45 })),
  { id: 'door.close', name: 'Door closing — closer + latch (all shop / room doors)', cat: 'Doors', lvl: 0.45 },
];
