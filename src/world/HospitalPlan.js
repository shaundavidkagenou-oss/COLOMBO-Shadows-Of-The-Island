// 74th request — the National Hospital: the building as DATA (rooms, walls, doors, windows, furniture, NPC routes).
// Pure module (no three.js): the builder (HospitalBuild.js), the runtime (Hospital.js) and the node tests all read it.
//
// Frame: u = x − PX (east +), v = depth behind the street facade (v = 0 is the facade on Baseline Road, the building runs
// towards −z), so x = PX + u, z = FZ − v. Floors: 0 (ground) and 1 (first floor), floor f's walking level is FLOOR_Y[f].
// Every room is a list of axis-aligned rects on one floor (the stair shaft and the lift shaft span both floors). A room
// draws its own inner wall faces, floor and ceiling, so a room that is not drawn leaves nothing behind in the rooms that
// are (see HospitalBuild.roomShell); the outer faces of the building belong to the exterior shell.
//
// Everything that a designer may want to move — a bed, a chair row, a door — is one entry below: edit it here and the
// building, its collision, its lights, its portals and the NPC routes all follow (the builder never hard-codes a position).
import { LAND_Y } from './Layout.js';

export const HOSP = Object.freeze({
  name: 'National Hospital', short: 'NH',
  PX: 660, FZ: -190,               // facade centre on the street side (world x, z)
  W: 42, D: 22,                    // footprint u −21…21, v 0…22
  H: 3.9, SLAB: 0.32, CEIL: 3.25,  // floor-to-floor, slab (+ ceiling void), clear height to the ceiling tiles
  WALL: 0.16, EXT: 0.3,            // partition / outer wall thickness
  DOOR_H: 2.2, WIN_SILL: 0.9, WIN_HEAD: 2.45,
});
export const Y0 = LAND_Y + 0.02;
export const FLOOR_Y = [Y0, Y0 + HOSP.H];
export const toWorld = (u, v) => [HOSP.PX + u, HOSP.FZ - v];
export const toLocal = (x, z) => [x - HOSP.PX, HOSP.FZ - z];

// ---------------------------------------------------------------------------------------------------- rooms
// rects: [u0, u1, v0, v1]. floors: the floors the room spans (shafts: both). floor: floor material key. lights: ceiling
// light points [u, v] (the shared six-light pool picks the nearest ones of the rooms on screen). out: the room is seen
// through glass from the street (drawn when the player is near the front, see Hospital.visibleRooms).
export const ROOMS = [
  // ground floor
  { id: 'lobby', name: 'Reception & Waiting', floors: [0], rects: [[-14, 5, 0, 9]], floor: 'terrazzo', lights: [[-9, 3], [-2, 3], [-9, 7], [1, 6.5]], out: true },
  { id: 'pharmacy', name: 'Pharmacy', floors: [0], rects: [[-21, -14, 0, 9]], floor: 'vinyl', lights: [[-17.5, 4.5]] },
  { id: 'ed', name: 'Emergency Department', floors: [0], rects: [[5, 21, 0, 9], [7, 21, 9, 22]], floor: 'vinylBlue', lights: [[9, 4], [16, 4], [11, 15], [17, 17]], out: true },
  { id: 'corr0', name: 'Main Corridor', floors: [0], rects: [[-21, 7, 9, 11.6]], floor: 'vinyl', lights: [[-16, 10.3], [-7, 10.3], [2, 10.3]] },
  { id: 'wc', name: 'Public Restroom', floors: [0], rects: [[-14, -9, 11.6, 22], [-16.5, -14, 14.4, 22]], floor: 'tileWc', lights: [[-11.5, 15], [-12.5, 20]] },
  { id: 'treat1', name: 'Treatment Room 1', floors: [0], rects: [[-9, -1, 11.6, 22]], floor: 'vinyl', lights: [[-5, 15], [-5, 19.5]] },
  { id: 'treat2', name: 'Treatment Room 2', floors: [0], rects: [[-1, 7, 11.6, 22]], floor: 'vinyl', lights: [[3, 15], [3, 19.5]] },
  // both floors
  { id: 'stairs', name: 'Staircase', floors: [0, 1], rects: [[-21, -16.5, 11.6, 22]], floor: 'terrazzo', lights: [[-18.8, 14], [-18.8, 20]], shaft: true },
  { id: 'lift', name: 'Lift', floors: [0, 1], rects: [[-16.5, -14, 11.6, 14.4]], floor: 'rubber', lights: [[-15.25, 13]], shaft: true, car: true },
  // first floor
  { id: 'ward', name: 'General Ward', floors: [1], rects: [[-14, 4, 0, 9]], floor: 'vinyl', lights: [[-10, 3], [-4, 3], [1.5, 3], [-7, 7]] },
  { id: 'nurses', name: "Nurses' Station", floors: [1], rects: [[4, 10, 0, 9]], floor: 'vinyl', lights: [[7, 5]] },
  { id: 'consult', name: 'Consultation Room', floors: [1], rects: [[10, 16, 0, 9]], floor: 'vinyl', lights: [[13, 4.5]] },
  { id: 'store', name: 'Medical Storage', floors: [1], rects: [[16, 21, 0, 9]], floor: 'vinyl', lights: [[18.5, 4.5]] },
  { id: 'corr1', name: 'First-Floor Corridor', floors: [1], rects: [[-21, 21, 9, 11.6]], floor: 'vinyl', lights: [[-15, 10.3], [-3, 10.3], [9, 10.3], [17, 10.3]] },
  { id: 'private1', name: 'Private Room 1', floors: [1], rects: [[7, 14, 11.6, 22]], floor: 'vinyl', lights: [[10.5, 16.5]] },
  { id: 'private2', name: 'Private Room 2', floors: [1], rects: [[14, 21, 11.6, 22]], floor: 'vinyl', lights: [[17.5, 16.5]] },
];
export const ROOM = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

// ---------------------------------------------------------------------------------------------------- stairs / lift
// a straight flight in lane A (u −20.7…−19.05) rising towards the back; the first-floor slab is open over it. Ground-floor
// people reach the bottom step from lane B, first-floor people walk back along lane B (the landing) to the corridor.
export const STAIR = Object.freeze({ u0: -20.75, u1: -19.05, v0: 12.9, v1: 19.8, rail: -19.05, n: 23 });
export const LIFT = Object.freeze({ u0: -16.3, u1: -14.2, v0: 11.8, v1: 14.25, doorU0: -15.85, doorU1: -14.65, travel: 4.2, doorT: 1.1 });

// ---------------------------------------------------------------------------------------------------- portals / doors
// a = the wall line: axis 'u' = a wall running along u at v = at; axis 'v' = along v at u = at. [s0, s1] = the opening.
// kind: open (doorway / wide opening), slide (automatic glass doors), swing (hinged, interactable), double (pair of swing
// leaves, held open on magnets), hatch (glazed counter window: seen through, not walked through), lift (lift landing door).
// rooms: the two sides ('out' = the street). floor: which floor's wall it is in.
export const DOORS = [
  // ground floor
  { id: 'main', floor: 0, axis: 'u', at: 0, s: [-7.2, -4.8], kind: 'slide', rooms: ['lobby', 'out'], name: 'Main entrance' },
  { id: 'edEntrance', floor: 0, axis: 'v', at: 21, s: [2.6, 5.0], kind: 'slide', rooms: ['ed', 'out'], name: 'Emergency entrance' },
  { id: 'lobbyCorr', floor: 0, axis: 'u', at: 9, s: [-11.6, -8.4], kind: 'open', rooms: ['lobby', 'corr0'] },
  { id: 'recStaff', floor: 0, axis: 'u', at: 9, s: [4.0, 4.9], kind: 'open', rooms: ['lobby', 'corr0'] },
  { id: 'pharmHatch', floor: 0, axis: 'v', at: -14, s: [2.6, 6.4], kind: 'hatch', rooms: ['pharmacy', 'lobby'], name: 'Pharmacy counter' },
  { id: 'pharmDoor', floor: 0, axis: 'u', at: 9, s: [-19.1, -18.0], kind: 'swing', rooms: ['pharmacy', 'corr0'], name: 'Pharmacy (staff)', hinge: -1 },
  { id: 'edDoors', floor: 0, axis: 'v', at: 7, s: [9.15, 11.45], kind: 'double', rooms: ['ed', 'corr0'], name: 'Emergency Department' },
  { id: 'stairs0', floor: 0, axis: 'u', at: 11.6, s: [-18.9, -16.75], kind: 'open', rooms: ['stairs', 'corr0'] },
  { id: 'lift0', floor: 0, axis: 'u', at: 11.6, s: [-15.85, -14.65], kind: 'lift', rooms: ['lift', 'corr0'], name: 'Lift' },
  { id: 'wcDoor', floor: 0, axis: 'u', at: 11.6, s: [-12.6, -11.5], kind: 'swing', rooms: ['wc', 'corr0'], name: 'Restroom', hinge: 1 },
  { id: 't1Door', floor: 0, axis: 'u', at: 11.6, s: [-5.65, -4.45], kind: 'swing', rooms: ['treat1', 'corr0'], name: 'Treatment Room 1', hinge: -1 },
  { id: 't2Door', floor: 0, axis: 'u', at: 11.6, s: [2.35, 3.55], kind: 'swing', rooms: ['treat2', 'corr0'], name: 'Treatment Room 2', hinge: -1 },
  // first floor
  { id: 'stairs1', floor: 1, axis: 'u', at: 11.6, s: [-18.9, -16.75], kind: 'open', rooms: ['stairs', 'corr1'] },
  { id: 'lift1', floor: 1, axis: 'u', at: 11.6, s: [-15.85, -14.65], kind: 'lift', rooms: ['lift', 'corr1'], name: 'Lift' },
  { id: 'wardDoors', floor: 1, axis: 'u', at: 9, s: [-6.2, -3.8], kind: 'double', rooms: ['ward', 'corr1'], name: 'General Ward' },
  { id: 'nursesOpen', floor: 1, axis: 'u', at: 9, s: [4.5, 9.5], kind: 'open', rooms: ['nurses', 'corr1'] },
  { id: 'consultDoor', floor: 1, axis: 'u', at: 9, s: [12.4, 13.6], kind: 'swing', rooms: ['consult', 'corr1'], name: 'Consultation Room', hinge: 1 },
  { id: 'storeDoor', floor: 1, axis: 'u', at: 9, s: [17.9, 19.0], kind: 'swing', rooms: ['store', 'corr1'], name: 'Medical Storage', hinge: 1, staff: true },
  { id: 'p1Door', floor: 1, axis: 'u', at: 11.6, s: [9.4, 10.6], kind: 'swing', rooms: ['private1', 'corr1'], name: 'Private Room 1', hinge: -1 },
  { id: 'p2Door', floor: 1, axis: 'u', at: 11.6, s: [16.4, 17.6], kind: 'swing', rooms: ['private2', 'corr1'], name: 'Private Room 2', hinge: -1 },
  { id: 'nursesWard', floor: 1, axis: 'v', at: 4, s: [6.2, 7.4], kind: 'open', rooms: ['ward', 'nurses'] },
];
export const DOOR = Object.fromEntries(DOORS.map((d) => [d.id, d]));
export const SEE_THROUGH = new Set(['open', 'hatch', 'double']); // portal kinds always open for sight (double: held open)
export const WALK_THROUGH = new Set(['open', 'double']);

// ---------------------------------------------------------------------------------------------------- outer walls
// Outer walls per floor as [axis, at, s0, s1, outward sign]. They follow the stepped massing: the first floor covers the
// front row east of the pharmacy, the corridor, the stair / lift shafts and the private rooms; the pharmacy roof (front
// west) is a planted terrace and the roof over the restroom / treatment rooms is the plant deck.
export const OUTER = [
  // ground floor (full footprint)
  [0, 'u', 0, -21, 21, -1], [0, 'u', 22, -21, 21, 1], [0, 'v', -21, 0, 22, -1], [0, 'v', 21, 0, 22, 1],
  // first floor
  [1, 'u', 0, -14, 21, -1], [1, 'v', -14, 0, 9, -1], [1, 'u', 9, -21, -14, -1], [1, 'v', -21, 9, 22, -1], [1, 'u', 22, -21, -16.5, 1],
  [1, 'v', -16.5, 14.4, 22, 1], [1, 'u', 14.4, -16.5, -14, 1], [1, 'v', -14, 11.6, 14.4, 1], [1, 'u', 11.6, -14, 7, 1], [1, 'v', 7, 11.6, 22, -1], [1, 'u', 22, 7, 21, 1], [1, 'v', 21, 0, 22, 1],
];
// roofs: [floor whose ceiling it is, u0, u1, v0, v1, kind]
export const ROOFS = [
  [0, -21, -14, 0, 9, 'terrace'], [0, -14, 7, 11.6, 22, 'deck'], [0, -16.5, -14, 14.4, 22, 'deck'],
  [1, -21, 21, 9, 11.6, 'roof'], [1, -14, 21, 0, 9, 'roof'], [1, -21, -16.5, 11.6, 22, 'roof'], [1, -16.5, -14, 11.6, 14.4, 'roof'], [1, 7, 21, 11.6, 22, 'roof'],
];
// windows on the outer walls: [floor, axis, at, centre s, width, kind]; kind 'clear' (glazed, see-in: lobby curtain wall),
// 'win' (opaque glazing: reflects outside, bright daylight panel inside), 'frost' (ED / restroom privacy glass)
export const WINDOWS = (() => {
  const W = [];
  for (let u = -12.2; u <= 3.4; u += 2.2) if (u < -7.8 || u > -4.2) W.push([0, 'u', 0, u, 1.9, 'clear']);
  for (const u of [-19.3, -15.8]) W.push([0, 'u', 0, u, 1.6, 'win']);
  for (const u of [7.2, 10.6, 14, 17.4]) W.push([0, 'u', 0, u, 1.6, 'frost']);
  for (const v of [3, 6.5]) W.push([0, 'v', -21, v, 1.6, 'win']);
  for (const v of [14, 17.5, 20.5]) W.push([0, 'v', -21, v, 1.4, 'win']);
  for (const v of [7.5, 13.5, 17, 20.5]) W.push([0, 'v', 21, v, 1.5, 'frost']);
  for (const u of [-12, -5, 3]) W.push([0, 'u', 22, u, 1.4, u === -12 ? 'frost' : 'win']);
  for (const u of [-4.5, -1.5]) W.push([0, 'u', 22, u + 0, 1.4, 'win']);
  for (const u of [10, 13.5, 17]) W.push([0, 'u', 22, u, 1.4, 'frost']);
  // first floor
  for (const u of [-12.3, -9.3, -6.3, -3.3, -0.3, 2.6]) W.push([1, 'u', 0, u, 1.8, 'win']);
  for (const u of [7, 12, 14.2, 18.5]) W.push([1, 'u', 0, u, 1.5, 'win']);
  for (const v of [2.5, 6.5]) W.push([1, 'v', -14, v, 1.6, 'win']);
  W.push([1, 'u', 9, -17.5, 2.4, 'clear']); // corridor end over the terrace
  for (const u of [-10.5, -5, 0.5, 4.8]) W.push([1, 'u', 11.6, u, 1.6, 'win']); // corridor over the plant deck
  for (const v of [3, 6.5]) W.push([1, 'v', 21, v, 1.5, 'win']);
  for (const v of [15, 19.5]) W.push([1, 'v', 21, v, 1.6, 'win']);
  for (const u of [10.5, 17.5]) W.push([1, 'u', 22, u, 1.8, 'win']);
  for (const v of [14, 18.5]) W.push([1, 'v', -21, v, 1.4, 'win']);
  return W;
})();

// ---------------------------------------------------------------------------------------------------- furniture
// [type, floor, u, v, yaw (radians; 0 faces +v = into the building), extra]. Types are built by HospitalKit.
// yaw convention for seats / beds: the direction the user faces (bed: the head end is at −facing).
const Q = Math.PI / 2;
export const FURNITURE = [
  // lobby: registration counter (the public queue on the entrance side, staff behind it), waiting rows, water, plants,
  // notice board, the queue-number screen
  ['counter', 0, -1.5, 6.0, Math.PI, { w: 5.2, name: 'Registration counter' }], ['counterEnd', 0, 1.3, 7.15, 0, { d: 1.6 }],
  ['officeChair', 0, -2.6, 7.05, Math.PI, { npc: 'rec' }], ['officeChair', 0, 0.2, 7.05, Math.PI],
  ['pc', 0, -2.6, 6.2, 0], ['pc', 0, 0.2, 6.2, 0], ['phone', 0, -1.2, 6.15, 0],
  ['cabinet', 0, -3.4, 8.7, Math.PI, { w: 1.2 }], ['cabinet', 0, 2.6, 8.7, Math.PI, { w: 1.2 }],
  // two rows of beam seating facing the counter (modules side by side along v, rows 2 m apart); three front-row modules
  // are adjustable seats (Hospital.js builds their shells at the sitter's height: the waiting visitor + two for the player)
  ...[-11.6, -9.6].flatMap((u) => [1.8, 2.36, 2.92, 3.48, 4.04].map((v) => ['waitChair', 0, u, v, Math.PI / 2, u === -9.6 && v === 2.92 ? { npc: 'visitor' } : u === -9.6 && v === 1.8 ? { npc: 'seatA' } : u === -9.6 && v === 4.04 ? { npc: 'seatB' } : {}])),
  ...[-3.2, -2.6, -2.0, -1.4, -0.8].map((u) => ['waitChair', 0, u, 0.75, 0]),
  ['waterCooler', 0, 4.6, 4.0, -Q], ['plant', 0, -13.4, 0.6, 0], ['plant', 0, 4.4, 0.6, 0],
  ['noticeBoard', 0, -13.9, 7.6, Q, { w: 1.2 }], ['tvScreen', 0, -6.4, 8.86, Math.PI, { screen: 'queue' }],
  ['sanitizer', 0, -4.2, 0.3, 0], ['wheelchair', 0, 3.9, 2.2, -Q],
  // pharmacy: dispensing counter behind the hatch, shelving, fridge, desk
  ['pharmCounter', 0, -14.75, 4.5, Q, { w: 3.9 }], ['shelf', 0, -20.6, 4.5, Q, { w: 6.5 }], ['shelf', 0, -17.5, 0.35, 0, { w: 4.2, h: 0.85 }],
  ['medFridge', 0, -15.0, 8.45, Math.PI], ['desk', 0, -18.6, 7.4, Math.PI, { w: 1.4 }], ['officeChair', 0, -18.6, 6.75, 0], ['pc', 0, -18.6, 7.6, 0],
  // emergency department: triage desk, three curtained bays along the front wall, two observation beds at the back,
  // resus trolley, monitors, IV stands, wheelchair, waiting chairs
  ['nurseDesk', 0, 9.5, 6.0, Math.PI, { w: 3.0 }], ['officeChair', 0, 9.5, 6.9, Math.PI, { npc: 'ed' }], ['pc', 0, 9.0, 5.85, 0],
  ...[11.6, 14.6, 17.6].flatMap((u, i) => [['bed', 0, u, 1.45, 0, { ed: i }], ['bay', 0, u, 1.6, 0, { w: 2.7, d: 3.0 }], ['monitor', 0, u - 0.85, 0.32, 0], ['ivStand', 0, u + 0.85, 0.6, 0]]),
  ['bed', 0, 8.3, 15.0, Q, { ed: 3 }], ['bed', 0, 8.3, 18.6, Q, { ed: 4 }], ['bay', 0, 8.45, 15.0, Q, { w: 2.7, d: 3.0 }], ['bay', 0, 8.45, 18.6, Q, { w: 2.7, d: 3.0 }],
  ['monitor', 0, 7.35, 13.95, Q], ['ivStand', 0, 7.6, 16.6, 0], ['crashCart', 0, 15.2, 8.6, Math.PI], ['wheelchair', 0, 6.0, 7.8, 0], ['sanitizer', 0, 20.8, 6.5, -Q],
  ['cabinet', 0, 20.6, 16.5, -Q, { w: 3.2 }], ['sink', 0, 20.6, 13.2, -Q],
  ...[15.5, 16.1, 16.7].map((u) => ['waitChair', 0, u, 21.4, Math.PI]),
  // corridor
  ['bench', 0, -2.5, 9.35, 0, { w: 2.4 }], ['sanitizer', 0, -8.0, 11.45, Math.PI], ['fireExt', 0, -20.8, 10.3, Q], ['plant', 0, 6.4, 9.5, 0],
  // restroom
  ['wcStalls', 0, -11.5, 19.5, Math.PI, { n: 3 }], ['sinkRow', 0, -16.2, 18.0, Q, { n: 2 }], ['mirror', 0, -16.42, 18.0, Q, { w: 1.8 }],
  // treatment rooms: examination couch, privacy curtain, desk + chairs, trolley, sink, cabinet, monitor, IV
  ...[-9, -1].flatMap((u0) => [
    ['examCouch', 0, u0 + 5.6, 18.6, Math.PI], ['curtain', 0, u0 + 4.0, 18.6, Q, { w: 4.6 }], ['desk', 0, u0 + 2.0, 14.0, -Q, { w: 1.4 }],
    ['officeChair', 0, u0 + 1.4, 14.0, Q], ['visitorChair', 0, u0 + 2.9, 13.6, -Q], ['visitorChair', 0, u0 + 2.9, 14.5, -Q], ['pc', 0, u0 + 1.85, 14.0, Q],
    ['trolley', 0, u0 + 7.2, 16.0, 0], ['sink', 0, u0 + 7.6, 12.3, Math.PI], ['cabinet', 0, u0 + 0.35, 19.5, Q, { w: 2.4 }],
    ['monitor', 0, u0 + 7.5, 20.6, Math.PI], ['ivStand', 0, u0 + 4.6, 20.3, 0], ['sanitizer', 0, u0 + 0.25, 12.6, Q],
  ]),
  ['plant', 1, -17.2, 21.4, 0],
  // first floor — general ward: six beds with bedside lockers, curtain rails, monitors, IV stands, visitor chairs
  ...[-11.8, -6.9, -2.2].flatMap((u, i) => [['bed', 1, u, 1.4, 0, { ward: i }], ['locker', 1, u + 1.05, 0.5, 0], ['curtainRail', 1, u, 1.6, 0, { w: 2.6, d: 2.6 }]]),
  ...[-11.8, -8.4, 0.8].flatMap((u, i) => [['bed', 1, u, 7.6, Math.PI, { ward: i + 3 }], ['locker', 1, u + 1.05, 8.5, Math.PI], ['curtainRail', 1, u, 7.4, 0, { w: 2.6, d: 2.6 }]]),
  ['monitor', 1, -12.75, 0.35, 0], ['ivStand', 1, -12.75, 1.3, 0], ['monitor', 1, -0.25, 8.65, Math.PI], ['ivStand', 1, -0.3, 8.0, 0],
  ['visitorChair', 1, -12.9, 2.6, Q], ['visitorChair', 1, -0.2, 7.0, Q], ['sanitizer', 1, 3.8, 4.2, -Q], ['plant', 1, -13.4, 4.5, 0], ['wheelchair', 1, 3.3, 2.0, -Q],
  // nurses' station: counter facing the corridor, PCs, chairs, medicine trolley, low records shelf, board, bed screen
  ['counter', 1, 7.6, 8.0, 0, { w: 3.4, name: "Nurses' station" }], ['officeChair', 1, 6.8, 7.2, 0, { npc: 'station' }], ['officeChair', 1, 8.6, 7.2, 0],
  ['pc', 1, 6.8, 7.8, Math.PI], ['pc', 1, 8.6, 7.8, Math.PI], ['phone', 1, 7.7, 7.85, Math.PI],
  ['shelf', 1, 7.0, 0.3, 0, { w: 3.2, h: 0.85 }], ['medTrolley', 1, 4.7, 2.6, Q], ['whiteboard', 1, 9.86, 4.0, -Q, { w: 2.2 }], ['tvScreen', 1, 9.86, 6.6, -Q, { screen: 'beds' }],
  // consultation: desk, doctor's chair, two patient chairs, couch behind a curtain, sink, cabinet, x-ray viewer
  ['desk', 1, 13.0, 5.0, Math.PI, { w: 1.7 }], ['officeChair', 1, 13.0, 5.8, Math.PI, { npc: 'doctor' }], ['pc', 1, 12.5, 5.2, 0],
  ['visitorChair', 1, 12.5, 3.9, 0], ['visitorChair', 1, 13.6, 3.9, 0], ['examCouch', 1, 15.0, 1.6, -Q], ['sink', 1, 10.4, 1.0, Q],
  ['cabinet', 1, 10.4, 6.3, Q, { w: 2.0 }], ['viewer', 1, 15.86, 6.4, -Q], ['curtain', 1, 13.9, 1.7, Q, { w: 2.6 }],
  // storage: shelving, linen trolley, oxygen cylinders
  ['shelf', 1, 20.6, 4.0, -Q, { w: 6.4 }], ['shelf', 1, 16.4, 4.0, Q, { w: 5.0 }], ['linenCart', 1, 18.5, 7.5, 0], ['cylinders', 1, 18.6, 0.5, 0],
  // first-floor corridor
  ['bench', 1, 1.5, 11.25, Math.PI, { w: 2.4 }], ['fireExt', 1, 20.8, 10.3, -Q], ['sanitizer', 1, -13.2, 9.15, 0], ['plant', 1, -20.4, 9.6, 0],
  // private rooms: bed, locker, wall monitor, IV, visitor chair, sofa, wardrobe, TV
  ...[7, 14].flatMap((u0, i) => [
    ['bed', 1, u0 + 3.5, 20.7, Math.PI, { priv: i }], ['locker', 1, u0 + 2.25, 21.4, Math.PI], ['monitor', 1, u0 + 2.2, 21.75, Math.PI, { wall: true }], ['ivStand', 1, u0 + 2.3, 20.4, 0],
    ['visitorChair', 1, u0 + 5.6, 19.2, -Q], ['sofa', 1, u0 + 6.45, 15.5, -Q, { w: 1.8 }], ['wardrobe', 1, u0 + 0.4, 13.6, Q, { w: 1.2 }],
    ['tvScreen', 1, u0 + 0.12, 18.6, Q, { screen: 'tv' }], ['sanitizer', 1, u0 + 0.2, 12.4, Q],
  ]),
];

// ---------------------------------------------------------------------------------------------------- beds
// the recovery bed (player wakes up here): private room 1. Bed geometry: centred on (u, v), length along the facing.
export const BED = Object.freeze({ len: 2.08, wid: 0.98, top: 0.62 });
export const RECOVERY_BEDS = [{ floor: 1, room: 'private1', fi: FURNITURE.findIndex((f) => f[0] === 'bed' && f[5] && f[5].priv === 0) },
  { floor: 1, room: 'private2', fi: FURNITURE.findIndex((f) => f[0] === 'bed' && f[5] && f[5].priv === 1) }];

// ---------------------------------------------------------------------------------------------------- outdoors
// forecourt + grounds (world coordinates via toWorld): main drop-off loop off Baseline Road, the ambulance bay at the
// emergency entrance (east side), staff / visitor parking, planters, boundary wall with gates
export const GROUNDS = Object.freeze({
  compound: [-53, 53, -0.5, 108],            // u0, u1, v0 (front, = facade line − 0.5 m: the forecourt is in front of it), v1
  fence: { u0: -53.5, u1: 53.5, front: -12.7, back: 108 }  /* front: the back of the Malay Street pavement (z −177.2) */,
  forecourt: [-53, 53, -12.7, 0],             // paved apron between the facade and the street kerb (v negative = street side)
  dropOff: { u: -6, v: -9.5, w: 15, d: 3.6 },   // drop-off lay-by along the outer edge of the entrance canopy (v −11.3…−7.7)
  canopy: { u0: -10.5, u1: -1.5, v0: -7.6, v1: 0, h: 3.6 },  /* columns on the outer corners only */
  edCanopy: { u0: 21, u1: 31, v0: 1.0, v1: 7.0, h: 4.1 },
  ambulanceBay: { u: 26.2, v: 3.8, yaw: 0, len: 6.2, wid: 3.4 },     // marked bay under the ED canopy (vehicle facing −v: towards the street)
  edDrive: [[26.2, -12.7], [26.2, 3.8]],                               // the drive from Baseline Road down to the bay
  parking: [[-21, -3.4], [-18.4, -3.4], [-15.8, -3.4], [8.4, -3.4], [11.0, -3.4], [13.6, -3.4]], // bay centres (cars nose to the facade, 5 m bays v −5.9…−0.9)
  gates: [{ u: -6, w: 16 }, { u: 26.2, w: 6.5 }],
});
export function groundsWorld() { const c = GROUNDS.compound; const [x0, z0] = toWorld(c[0], c[2]); const [x1, z1] = toWorld(c[1], c[3]); return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) }; }

// ---------------------------------------------------------------------------------------------------- NPC routes
// waypoints [floor, u, v]; a route is walked point to point (doors on the way are opened by whoever walks through)
export const SPOTS = {
  recDesk: [0, -1.2, 7.0], recFile: [0, -3.4, 8.05], recCounter: [0, -1.5, 5.25],
  wardNurseStation: [1, 6.8, 6.9], wardBed0: [1, -10.75, 1.9], wardBed4: [1, -7.4, 6.9], wardBed2: [1, -1.3, 1.9], wardAisleE: [1, 2.5, 4.8], wardAisleW: [1, -10.0, 4.6], nursesGap: [1, 4.6, 6.8], wardGap: [1, 3.3, 6.8],
  nursesCounter: [1, 7.6, 9.6], corr1Ward: [1, -5.0, 10.2], wardIn: [1, -5.0, 7.8], wardMid: [1, -5.0, 4.5],
  consultDesk: [1, 13.0, 5.8], consultDoorIn: [1, 13.0, 8.2], consultDoorOut: [1, 13.0, 10.2],
  edDesk: [0, 9.5, 6.9], edBay0: [0, 12.55, 2.1], edBay1: [0, 15.55, 2.1], edBay2: [0, 18.55, 2.1], edObs: [0, 9.6, 16.8], edMid: [0, 14.0, 5.0],
  lobbySeat: [0, -8.95, 2.92], lobbyHatch: [0, -13.2, 4.5], lobbyQueue: [0, -1.0, 4.6], lobbyDoor: [0, -6.0, 1.2], lobbyMid: [0, -6.0, 4.0],
  edEntranceIn: [0, 19.6, 3.8], edEntranceOut: [0, 24.4, 3.8],
};
// recovery: where the speaker stands beside the recovery bed (relative to the bed: s = side offset, a = along from the head)
export const BEDSIDE = Object.freeze({ side: 0.95, along: 0.55 });

// ---------------------------------------------------------------------------------------------------- queries
export const inRect = (r, u, v, m = 0) => u > r[0] - m && u < r[1] + m && v > r[2] - m && v < r[3] + m;
export function roomAt(u, v, floor) {
  for (const r of ROOMS) { if (!r.floors.includes(floor)) continue; for (const q of r.rects) if (inRect(q, u, v)) return r; }
  return null;
}
export function insideFootprint(u, v, floor) { return !!roomAt(u, v, floor); }
// the floor index a walking height belongs to
export const floorOf = (y) => (y > Y0 + HOSP.H * 0.5 ? 1 : 0);
// stair surface height at (u, v) (null outside lane A)
export function stairY(u, v) {
  if (u < STAIR.u0 - 0.05 || u > STAIR.u1 + 0.05) return null;
  if (v < STAIR.v0) return null; if (v > STAIR.v1) return FLOOR_Y[1];
  const k = (v - STAIR.v0) / (STAIR.v1 - STAIR.v0); const step = Math.floor(k * STAIR.n + 1e-6); return Y0 + Math.min(STAIR.n, Math.max(0, step + (k * STAIR.n - step) * 0.999)) * (HOSP.H / STAIR.n);
}
// room graph: neighbours through portals that are open for sight (doorStates: id → open 0…1)
export function neighbours(id, open = null, sight = true) {
  const out = [];
  for (const d of DOORS) { if (!d.rooms.includes(id)) continue; const o = d.rooms[0] === id ? d.rooms[1] : d.rooms[0];
    const isOpen = (sight ? SEE_THROUGH : WALK_THROUGH).has(d.kind) || (open && open[d.id] > 0.12); if (isOpen) out.push({ room: o, door: d }); }
  return out;
}
// the rooms worth drawing for a viewer in room `id`: the room itself, every room seen through an open portal, and the rooms
// seen through a second open portal when both portals are roughly in line (a corridor seen through a door shows the room
// across it through its open door). From the street ('out'): the glazed front rooms only (when near).
export function visibleRooms(id, open = null, depth = 2) {
  const seen = new Set(); if (!id) return seen; seen.add(id); let front = [{ id, via: null }];
  for (let k = 0; k < depth; k++) { const nx = [];
    for (const f of front) for (const n of neighbours(f.id, open)) { if (n.room === 'out' || seen.has(n.room)) continue;
      if (f.via && !aligned(f.via, n.door)) continue; seen.add(n.room); nx.push({ id: n.room, via: n.door }); }
    front = nx; }
  return seen;
}
// two portals "in line": parallel walls facing each other, or a doorway seen from within ~45° of its normal
function aligned(a, b) { if (a.axis === b.axis) { const ca = (a.s[0] + a.s[1]) / 2, cb = (b.s[0] + b.s[1]) / 2; return Math.abs(ca - cb) < Math.abs(a.at - b.at) + 3; } return true; }
export function doorCentre(d) { const c = (d.s[0] + d.s[1]) / 2; return d.axis === 'u' ? [c, d.at] : [d.at, c]; }
export function furnitureOf(type) { return FURNITURE.map((f, i) => ({ f, i })).filter((q) => q.f[0] === type); }
