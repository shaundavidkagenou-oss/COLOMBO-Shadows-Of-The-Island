// 80th request — ROADSIDE ASSISTANCE: 32 slots on the existing `sounds` board (SoundBank / SoundsWindow — same upload, preview,
// replace, remove and persistence as every other slot). The player supplies every recording: nothing is synthesised or
// substituted for these — an empty slot is simply silent. Each one is played by its real event in src/police/Roadside.js,
// positioned in the world with distance attenuation (PlaceSound.shot / PlaceSound.want); loops only run while their event does.
const D = [];
const add = (id, name, cat, o = {}) => { const d = { id, name, cat, lvl: 0.5, fb: 'silent (upload a recording)', ...o }; D.push(d); return d; };

export const RS_CAT = {
  A: 'ROADSIDE ASSISTANCE — A · Recovery vehicles',
  B: 'ROADSIDE ASSISTANCE — B · Mechanic activities',
  C: 'ROADSIDE ASSISTANCE — C · Roadside environment',
  D: 'ROADSIDE ASSISTANCE — D · Breakdown events',
};
const { A, B, C, D: E } = RS_CAT;
// A · recovery vehicles (9)
add('rs.truck.idle', 'Recovery Truck Engine Idle (loop · flatbed standing at the scene / the garage with its engine running)', A, { kind: 'loop', lvl: 0.5 });
add('rs.truck.accel', 'Recovery Truck Engine Acceleration (pulling away from the scene or a stop)', A, { lvl: 0.55 });
add('rs.truck.pass', 'Recovery Truck Engine Passing (loop · flatbed driving past you)', A, { kind: 'loop', lvl: 0.55 });
add('rs.truck.hydraulic', 'Recovery Truck Hydraulic Equipment (loop · deck tilting / sliding)', A, { kind: 'loop', lvl: 0.5 });
add('rs.truck.winch', 'Recovery Truck Winch (loop · winching a vehicle on / letting it off the deck)', A, { kind: 'loop', lvl: 0.5 });
add('rs.truck.beeper', 'Recovery Truck Warning Beeper (loop · reversing up to the vehicle)', A, { kind: 'loop', lvl: 0.45 });
add('rs.truck.airbrake', 'Recovery Truck Air Brakes (hiss as it stops at the scene / the garage)', A, { lvl: 0.55 });
add('rs.van.engine', 'Mechanic Service Van Engine (loop · van driving near you / idling at the scene)', A, { kind: 'loop', lvl: 0.45 });
add('rs.van.door', 'Mechanic Van Door (cab doors and the twin rear doors opening / shutting)', A, { lvl: 0.45 });
// B · mechanic activities (12)
add('rs.toolbox.open', 'Toolbox Opening', B, { lvl: 0.4 });
add('rs.toolbox.close', 'Toolbox Closing', B, { lvl: 0.4 });
add('rs.tools', 'Tools Being Handled (picking tools from the box / the van racks)', B, { lvl: 0.35 });
add('rs.ratchet', 'Ratchet Tool (engine work)', B, { lvl: 0.4 });
add('rs.spanner', 'Spanner Tool (engine work, battery terminals)', B, { lvl: 0.4 });
add('rs.inspect', 'Mechanical Inspection (looking over the engine bay / under the car)', B, { lvl: 0.35 });
add('rs.bonnet.open', 'Vehicle Bonnet Opening', B, { lvl: 0.45 });
add('rs.bonnet.close', 'Vehicle Bonnet Closing', B, { lvl: 0.5 });
add('rs.tyre', 'Spare Tyre Handling (wheel off / spare on)', B, { lvl: 0.45 });
add('rs.wheelnut', 'Wheel Nut Tool (wheel brace / impact gun on the nuts)', B, { lvl: 0.45 });
add('rs.battery', 'Portable Battery Equipment (jump pack connected / clamps)', B, { lvl: 0.4 });
add('rs.ambience', 'Mechanic Working Ambience (loop · while a repair is in progress)', B, { kind: 'loop', lvl: 0.35 });
// C · roadside environment (6)
add('rs.triangle', 'Warning Triangle Placement', C, { lvl: 0.4 });
add('rs.cone', 'Safety Cone Placement', C, { lvl: 0.4 });
add('rs.hazard', 'Hazard Light Clicking (loop · from a broken-down car with its hazards on, heard close by)', C, { kind: 'loop', lvl: 0.3 });
add('rs.beeper', 'Roadside Warning Beeper (loop · service van parked at a scene with its beacons on)', C, { kind: 'loop', lvl: 0.35 });
add('rs.connect', 'Vehicle Recovery Connection (winch hook / straps attached to the vehicle)', C, { lvl: 0.45 });
add('rs.equipment', 'Recovery Equipment Movement (deck locking, chains, strap ratchets)', C, { lvl: 0.45 });
// D · breakdown events (5)
add('rs.starter.fail', 'Vehicle Starter Failure (click, nothing — dead battery)', E, { lvl: 0.45 });
add('rs.start.struggle', 'Engine Struggling to Start (cranks, will not catch)', E, { lvl: 0.5 });
add('rs.overheat', 'Engine Overheating Warning (hiss / warning when the engine overheats)', E, { lvl: 0.45 });
add('rs.shutdown', 'Vehicle Breakdown Shutdown (engine dies on the road)', E, { lvl: 0.5 });
add('rs.restart', 'Vehicle Restart (engine starts again after the repair)', E, { lvl: 0.5 });

export const ROADSIDE_SOUND_DEFS = D;
export const RS_CAT_INFO = {
  [A]: 'Street Customs breakdown service: the flatbed car carrier and the mechanic service van. Engine idle / passing / van engine loop only while that vehicle is near you; hydraulics, winch and the reversing beeper loop only while the deck, winch or reverse is moving.',
  [B]: 'The mechanics at work: toolbox, tools, ratchet, spanner, bonnet, spare tyre, wheel nuts, the jump pack — each one played at the moment the mechanic does it, from where they are. The ambience loop runs only while a repair is in progress.',
  [C]: 'At the scene: warning triangle and cones as they are put down, hazard lights of a broken-down car (close by only), the van\'s warning beeper while it is parked with beacons on, hooking up and moving recovery gear.',
  [E]: 'The breakdown itself: starter failure, struggling to start, overheating, the engine dying on the road, and the restart once fixed.',
};
