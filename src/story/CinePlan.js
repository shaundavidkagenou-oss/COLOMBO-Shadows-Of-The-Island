// OFFICIAL CINEMATIC TRAILER (the second trailer) — the edit, as pure data and maths (no three.js, no DOM), exactly 2:26.
// Same principles as the original trailer (TrailerPlan.js, whose path / rig / camera maths this reuses): every camera, every
// vehicle and every actor is an analytic function of time, so the trailer is deterministic and seekable, and the node test
// (tools/trailer2-test.mjs) checks every on-screen frame against the real city plan (no camera or car inside a building,
// tree, pole or another car). Everything shown is the game itself: its streets and landmarks, its day / night and weather,
// its live traffic and pedestrians, its vehicles, characters, robbable jewellery store and keeper, its police and the Air
// Wing helicopter, its train. 96 bpm: a beat is 0.625 s, a bar 2.5 s — the act boundaries (25 / 55 / 85 / 115 s) land on
// bar lines; every cut lands on a beat.
// Axes as in the game: +z forward, +x left (seen facing +z), yaw = atan2(x, z); traffic keeps left.
import { curve, Path, vehicleRig, pedRig, _util } from './TrailerPlan.js';
const { clamp, lerp, sm, smr, L3, flat, dolly, rigCam, fwdRight } = _util;

export const LENGTH = 146; // 2:26
export const BPM = 96; export const BEAT = 60 / BPM; export const BAR = BEAT * 4;
// act boundaries (seconds)
export const ACTS = [['THE CITY', 0], ['LIFE', 25], ['UNDERWORLD', 55], ['THE CITY STRIKES BACK', 85], ['FINALE', 115], ['REVEAL', 136]];

// ---------------------------------------------------------------- camera moves (all eased: no camera starts or stops dead)
const ease3 = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }; // in-out cubic
const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
const glide = (a, b, fov0 = 45, fov1 = fov0, e = ease3) => dolly(a, b, fov0, fov1, e);
// a fixed camera that pans with a subject (rig / actor id), optionally drifting from p0 to p1
const follow = (p0, p1, id, lookUp = 0.9, fov = 40, lead = 0, hand = 0.35) => (t, P, u) => { const v = P[id]; const p = p1 ? L3(p0, p1, sm(u)) : p0; const F = fwdRight(v.hdg ?? v.yaw ?? 0); return { p, l: [v.x + F.fx * lead, (v.y || 0) + lookUp, v.z + F.fz * lead], fov, hand }; };
// orbit / crane around a point: angle, radius and height eased between keys
const orbit = (c, a0, a1, r0, r1, h0, h1, lookY, fov = 45, e = ease3) => (t, P, u) => { const k = e(u); const a = lerp(a0, a1, k), r = lerp(r0, r1, k); return { p: [c[0] + Math.sin(a) * r, lerp(h0, h1, k), c[1] + Math.cos(a) * r], l: [c[0], typeof lookY === 'function' ? lookY(k) : lookY, c[1]], fov, hand: 0.15 }; };

// ---------------------------------------------------------------- the trailer
export function buildPlan() {
  // ======== ACT II rigs ========
  // Pettah main street (z −900, level 1): a tuk-tuk eastbound (keeps left: the north lane) and a bus westbound
  const PET_E = -901.5, PET_W = -898.5;
  const rigsP = {
    tuk: vehicleRig({ type: 'tuktuk', seed: 5, path: new Path([[-300, PET_E], [-40, PET_E]]), s: (t) => 125 + 8.5 * t, driver: 'civ', lights: () => false }),
    bus: vehicleRig({ type: 'bus', seed: 3, path: new Path([[-40, PET_W], [-300, PET_W]]), s: (t) => 62 + 7.5 * t, driver: 'civ', lights: () => false }),
  };
  const pedsP = {
    fathima: pedRig({ who: 'fathima', segs: [{ t1: 99, walk: [[-71.5, -893.0], [-90, -893.0]], t0: 6.0, v: 1.15, act: 'phone' }] }),
    selvaraj: pedRig({ who: 'selvaraj', segs: [{ t1: 99, x: -82.6, z: -892.55, yaw: Math.PI * 0.92, act: 'paper' }] }),
  };
  // Galle Road (x −400): a bus in the kerb lane, southbound
  const rigsG = { bus: vehicleRig({ type: 'bus', seed: 2, path: new Path([[-395.2, -520], [-395.2, -200]]), s: (t) => 160 + 11 * t, driver: 'civ', lights: () => false }) };
  // Street Customs: a sports car comes down x −280 (south, the kerb lane) and turns left into the forecourt
  const arcC = [];
  for (let a = 0; a <= 90; a += 10) { const r = 9.8, q = (a * Math.PI) / 180; arcC.push([-278.2 + r - r * Math.cos(q), 275.2 + r * Math.sin(q)]); }
  const CUP = new Path([[-278.2, 205], [-278.2, 240], [-278.2, 268], [-278.2, 275.2], ...arcC.slice(1), [-262, 285], [-256.5, 285]]);
  const cuS = curve([[0, 0], [2.4, 32], [4.2, 56], [5.6, CUP.length - 7], [7.0, CUP.length - 1.2], [9, CUP.length - 1.2]]);
  const rigsCU = { car: vehicleRig({ type: 'raiden', seed: 3, path: CUP, s: (t) => cuS.at(t), share: 'kz' /* the same car plays the chase behind Dineth (GT) */, driver: 'civ', lights: () => false }) };

  // ======== ACT III: the jewellery store (rob_jewel, Fort) ========
  // the real walk-in store: door (53.03, −745.8), facing north into the shop; the room's local frame → world: (53.03 + lx, −747.1 + lz)
  const JX = 53.03, JZ = -747.1, J = (lx, lz) => [JX + lx, JZ + lz];
  const LANE_J = -742.25; // eastbound lane of the shop street (z −740, level 2)
  const arcJ = []; for (let a = 0; a <= 90; a += 10) { const r = 14.2, q = (a * Math.PI) / 180; arcJ.push([227.3 + r * Math.sin(q), LANE_J + r - r * Math.cos(q)]); }
  const HJ = new Path([[-60, LANE_J], [0, LANE_J], [58, LANE_J], [120, LANE_J], [200, LANE_J], [227.3, LANE_J], ...arcJ.slice(1), [241.5, -700], [241.5, -600]]);
  const STOP = HJ.project(58, LANE_J), TURN0 = HJ.project(227.3, LANE_J), TURN1 = HJ.project(241.5, -728);
  // the robbery runs RD seconds longer than the 48th cut (ceiling shots, the demand, the case from under the counter): the getaway
  // keys after the stop are shifted by it
  const RD = 5.9;
  const jS = curve([[0, STOP - 60], [2.2, STOP - 21], [4.3, STOP - 0.6], [4.6, STOP], [19.5 + RD, STOP], [20.6 + RD, STOP + 3.5], [22.0 + RD, STOP + 18], [24.5 + RD, STOP + 66], [27.0 + RD, TURN0 - 2], [28.6 + RD, TURN1], [30.0 + RD, TURN1 + 30], [33.5 + RD, TURN1 + 105]]);
  const KEEP = J(2.72, -1.92); // the keeper behind the counter (he faces −x, towards the customers)
  const rigsC = {
    crew: vehicleRig({ type: 'praetor', seed: 4, path: HJ, s: (t) => jS.at(t), share: 'crew', lights: () => true,
      slip: flat([[27.0 + RD, 0], [27.5 + RD, 0.1], [28.0 + RD, 0.42], [28.5 + RD, 0.5], [29.1 + RD, 0.3], [29.8 + RD, 0.05], [30.2 + RD, 0]]),
      smoke: (t) => (t >= 19.5 + RD && t < 20.4 + RD ? 1 : t >= 20.4 + RD && t < 21.0 + RD ? 1 - (t - 20.4 - RD) / 0.6 : 0) }),
  };
  // turning on the spot: yaw eased from a to b (the short way round) between t0 and t1
  const turn = (t0, t1, a, b) => (t) => { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * sm((t - t0) / (t1 - t0)); };
  // the store (room frame = J): the door leaf at lz −0.07 (1.1 m wide), the counter top lx 1.67 … 2.41 at 1.0 m, lz −0.52 … −3.12
  // Shashika: in first, three rounds into the ceiling, then covers the keeper from beside the door (his line of fire stays clear
  // of David at the counter), out last. David: in behind him with his line, straight to the counter, takes the case, out.
  const SH_IN = [[57.2, -744.0], [53.2, -745.0], J(0.1, 0.6), J(0.0, -0.5), J(-0.35, -1.15)];
  const SH_POST = J(-0.35, -1.15), SH_IN_YAW = Math.atan2(-0.35, -0.65), SH_KEEP_YAW = Math.atan2(KEEP[0] - SH_POST[0], KEEP[1] - SH_POST[1]);
  const SH_OUT = [SH_POST, J(0.05, -0.4), J(0.1, 0.6), [55.0, -745.0], [57.2, -744.2]], SH_OUT_YAW = Math.atan2(0.4, 0.75);
  // David comes in round Shashika's back (never through his line of fire onto the keeper) and strides up to the counter
  const DV_IN = [[55.6, -744.1], [53.15, -745.0], J(0.1, 0.6)], DV_IN2 = [J(0.1, 0.6), J(0.05, -0.2), J(-0.85, -0.55), J(-0.95, -1.6), J(0.5, -2.12), J(1.42, -2.12)];
  const DV_POST = J(1.42, -2.12), DV_OUT = [DV_POST, J(0.9, -1.55), J(0.3, -0.75), J(0.12, -0.2), J(0.1, 0.6), [55.6, -744.6]], DV_OUT_YAW = Math.atan2(-0.52, 0.57);
  const outside = (x, z) => ({ x, z });
  const pedsC = {
    dineth: pedRig({ who: 'dineth', segs: [{ t1: 99, seat: 'crew' }] }),
    shashika: pedRig({ who: 'shashika', segs: [
      { t1: 4.9, hidden: true },
      { t1: 9.75, walk: SH_IN, t0: 5.0, v: 1.56, rifle: { gun: 'pistol', aim: (t) => (t > 9.15 ? 1 : 0.35), target: 'shTgt' } }, // pushes the door open at 8.5 – 9.2
      { t1: 21.2, ...outside(...SH_POST), yaw: (t) => (t < 20.6 ? turn(10.6, 11.4, SH_IN_YAW, SH_KEEP_YAW)(t) : turn(20.6, 21.2, SH_KEEP_YAW, SH_OUT_YAW)(t)), rifle: { gun: 'pistol', aim: (t) => (t < 20.3 ? 1 : 0.5) /* muzzle down as David crosses to the door */, target: 'shTgt' } },
      { t1: 25.05, walk: SH_OUT, t0: 21.2, v: 1.8, rifle: { gun: 'pistol', aim: () => 0.5 } },
      { t1: 99, hidden: true }] }),
    david: pedRig({ who: 'david', segs: [
      { t1: 5.3, hidden: true },
      { t1: 9.77, walk: DV_IN, t0: 5.4, v: 0.94 },
      { t1: 14.15, walk: DV_IN2, t0: 9.77, v: 1.25 }, // through the door at 10.25, talking; at the counter by 14.1
      { t1: 20.35, ...outside(...DV_POST), yaw: (t) => turn(19.75, 20.35, Math.PI / 2, DV_OUT_YAW)(t), act: (t) => (t > 14.15 && t < 15.9 ? 'point' : t > 19.75 ? 'suitcase' : null) }, // square to the counter; points at the keeper on the demand
      { t1: 23.95, walk: DV_OUT, t0: 20.35, v: 1.75, act: () => 'suitcase' },
      { t1: 99, hidden: true }] }),
    // passers-by on the street (the store's neighbours): one ducks, one calls it in
    anjali: pedRig({ who: 'anjali', segs: [{ t1: 15.6 + RD, walk: [[72, -744.9], [63.5, -744.9]], t0: 11.5 + RD, v: 1.3 }, { t1: 99, x: 63.5, z: -744.9, yaw: -Math.PI / 2 + 0.6, act: 'cower' }] }),
    nalin: pedRig({ who: 'nalin', segs: [{ t1: 16.2 + RD, x: 68.0, z: -735.0, yaw: Math.PI, act: null }, { t1: 99, x: 68.0, z: -735.0, yaw: Math.PI + 0.35, act: 'phone' }] }),
  };
  // Shashika's aim point: the ceiling ahead of him for the three shots, then down onto the keeper's chest
  const CEIL = [...J(-1.15, -4.5), 3.25]; // far enough into the room that the rifle rises ~30°, still shouldered
  const shAim = (t) => { const k = sm((t - 10.6) / 0.75); return { x: lerp(CEIL[0], KEEP[0], k), z: lerp(CEIL[1], KEEP[1], k), cy: lerp(CEIL[2], 1.3, k), cyMax: 3.27, spread: 0.3, vis: true, y: 0 }; };
  const fireC = [{ who: 'shashika', a: 9.85, b: 10.5, rof: 1 / 0.3, target: 'shTgt' }]; // 9.85, 10.15, 10.45
  // the case: under the counter (on the floor at the keeper's side) → his hand → the counter top → slid to David → David's hand.
  // JL: room frame [lx, height above the floor, lz]; `grip` = the handle (where the palm closes). The runtime moves the prop and
  // puts the hands on it (A.reach: waist bend + knee bend + arm IK); between the keys it follows whichever hand holds it.
  const CASE = {
    rest: [2.66, 0.355, -2.24], restRy: -Math.PI, counterRy: -Math.PI, // on the floor under the counter edge at his right hand, running fore-and-aft (as it is carried)
    keeperYaw: [[16.15, -Math.PI / 2]], // he stays square to the counter: the case is at his right side, no turn with it in hand
    keeperKnee: [[16.25, 0], [16.75, 1], [17.15, 1], [17.65, 0]],
    keeperW: [[16.3, 0], [16.85, 1], [18.85, 1], [19.05, 0]], // lets go once it has slid across, before David's hand arrives (never two hands on the handle)
    // a one-handed lift at his right side, fingers hooked down round the handle, palm in (the case runs fore-and-aft, like a bag
    // carried at the side): straight up beside the body, elbow out above the hand — so neither the forearm nor his hip goes
    // through it — then swung forward over the counter top; it stays clear of the counter front (lx 2.41) until its base is above
    // the top (h 1.0)
    keeperGrip: [[16.3, [2.7, 0.9, -2.22]], [16.9, [2.66, 0.355, -2.24]], [17.05, [2.66, 0.355, -2.24]], [17.4, [2.68, 0.62, -2.25]], [17.6, [2.7, 0.9, -2.26]], [17.82, [2.7, 1.2, -2.25]], [17.98, [2.66, 1.39, -2.25]], [18.14, [2.39, 1.385, -2.22]], [18.28, [2.17, 1.375, -1.96]], [18.35, [2.12, 1.355, -1.93]], [18.45, [2.12, 1.355, -1.93]], [18.85, [1.95, 1.355, -1.93]]],
    keeperHold: [17.05, 18.3], // the case rides in his hand
    onCounter: [18.35, 19.12], // resting on the counter top (he sets it down at 18.35, slides it across by 18.85)
    slide: [[18.35, [2.12, 1.355, -1.93]], [18.45, [2.12, 1.355, -1.93]], [18.85, [1.95, 1.355, -1.93]]],
    davidW: [[18.75, 0], [19.1, 1], [19.7, 1], [20.05, 0]],
    davidGrip: [[18.75, [1.95, 1.355, -1.93]], [19.12, [1.95, 1.355, -1.93]], [19.4, [1.9, 1.46, -1.9]], [19.75, [1.62, 1.2, -1.8]]] /* lifted, then lowered to his right side (clear of his chest) as the carry takes over */,
    davidHold: 19.12, // from here on it rides in David's right hand (lifted off the counter, then carried out at his side)
  };
  const sceneC = { rob: { site: 'rob_jewel', door: [[8.5, 0], [8.95, 1.35], [9.2, 1.42], [10.9, 1.4], [11.6, 0], [21.2, 0], [21.6, -1.35], [22.6, -1.42], [23.2, 0]] /* + swings into the shop (pushed from the street), − out onto the pavement */,
    keeper: [[0, 'idle'], [9.87, 'flinch'], [10.2, 'cower'], [11.3, 'handsup'], [16.2, 'idle'], [19.0, 'handsup'], [22.6, 'cower']], alarm: [[21.6, [55, -744], 45]], aim: shAim, case: CASE } };

  // ======== ACT III night drive: Olcott Mawatha → the Lotus Tower ========
  const arcD = []; for (let a = 0; a <= 90; a += 10) { const r = 8.5, q = (a * Math.PI) / 180; arcD.push([241.5 + r - r * Math.cos(q), -570.75 + r * Math.sin(q)]); }
  const HD = new Path([[241.5, -700], [241.5, -640], [241.5, -600], [241.5, -570.75], ...arcD.slice(1), [270, -562.25], [330, -562.25], [420, -562.25], [470, -562.25]]);
  const dS = curve([[0, 0], [4, 92], [6.6, HD.project(241.5, -572) - 2], [8.4, HD.project(252, -562.25)], [11, HD.project(300, -562.25)], [16, HD.project(420, -562.25)]]);
  const rigsD = { crew: vehicleRig({ type: 'praetor', seed: 4, path: HD, s: (t) => dS.at(t), share: 'crew', lights: () => true,
    slip: flat([[6.4, 0], [6.9, 0.18], [7.5, 0.34], [8.1, 0.12], [8.6, 0]]) }) };
  const pedsD = { dineth: pedRig({ who: 'dineth', segs: [{ t1: 99, seat: 'crew' }] }) };

  // ======== ACT IV: Police HQ — the pursuit and the Air Wing helicopter ========
  // the crew comes north up x −60, turns right onto z −240 (east, the north lane) and runs east past the Police HQ;
  // two patrol cars waiting at the north kerb join, and the helicopter lifts off the HQ roof pad behind them
  const LANE_E = -241.8, KERB = -245.2;
  const arcE = []; for (let a = 0; a <= 90; a += 10) { const r = 10.4, q = (a * Math.PI) / 180; arcE.push([-62.25 + r - r * Math.cos(q), LANE_E + r - r * Math.sin(q)]); }

  const HE = new Path([[-62.25, -150], [-62.25, -200], [-62.25, -231.4], ...arcE.slice(1), [-30, LANE_E], [100, LANE_E], [300, LANE_E], [500, LANE_E], [640, LANE_E]]);
  const eTurn = HE.project(-62.25, -232), eX0 = HE.project(-10, LANE_E);
  const eS = curve([[0, 30], [2.0, 60], [3.6, eTurn - 3], [4.9, eTurn + 15], [6.0, eX0], [7.2, eX0 + 36], [10, eX0 + 125], [14, eX0 + 255], [18, eX0 + 380], [22, eX0 + 500]]);
  const QE1 = new Path([[40, KERB], [52, KERB], [62, -243.4], [74, LANE_E - 0.1], [120, LANE_E], [300, LANE_E], [500, LANE_E], [700, LANE_E]]);
  const QE2 = new Path([[28, KERB], [52, KERB], [62, -243.4], [74, LANE_E - 0.1], [120, LANE_E], [300, LANE_E], [500, LANE_E], [700, LANE_E]]);
  // the patrol cars move off once the crew is past (car 1 at 6.6 s, car 2 at 7.3 s) and settle 14 / 28 m behind it
  const p1K = [[0, 0], [6.6, 0], [7.4, 2.5], [8.4, 11]]; for (let t = 9; t <= 22; t += 0.5) p1K.push([t, Math.max(11 + (t - 8.4) * 6, QE1.project(eS.at(t) - eX0 - 10, LANE_E) - 16)]);
  const p1S = curve(p1K.map(([t, s], i, a) => [t, i ? Math.max(s, a[i - 1][1] + 0.05 * (t - a[i - 1][0])) : s]));
  const p2K = [[0, 0], [7.3, 0], [8.1, 2.5], [9.1, 11]]; for (let t = 9.5; t <= 22; t += 0.5) p2K.push([t, Math.max(11 + (t - 9.1) * 6, p1S.at(t) + (QE1.project(52, KERB) - QE2.project(52, KERB)) - 13)]);
  const p2S = curve(p2K.map(([t, s], i, a) => [t, i ? Math.max(s, a[i - 1][1] + 0.05 * (t - a[i - 1][0])) : s]));
  const rigsE = {
    crew: vehicleRig({ type: 'praetor', seed: 4, path: HE, s: (t) => eS.at(t), share: 'crew', lights: () => true,
      slip: flat([[3.4, 0], [3.8, 0.2], [4.3, 0.45], [4.8, 0.3], [5.4, 0.05], [5.8, 0]]) }),
    pol1: vehicleRig({ type: 'police', seed: 5, path: QE1, s: (t) => p1S.at(t), driver: 'officer', lights: () => true, beacons: () => true }),
    pol2: vehicleRig({ type: 'police', seed: 6, path: QE2, s: (t) => p2S.at(t), driver: 'officer', lights: () => true, beacons: () => true }),
  };
  const pedsE = {
    dineth: pedRig({ who: 'dineth', segs: [{ t1: 99, seat: 'crew' }] }),
    off1: pedRig({ who: 'officer', seed: 51, segs: [{ t1: 99, x: -21.5, z: -229.6, yaw: Math.PI * 0.62, rifle: { aim: (t) => (t > 6.3 ? 1 : 0.4), target: 'crew' } }] }),
    off2: pedRig({ who: 'officer', seed: 52, segs: [{ t1: 99, x: -16.4, z: -229.9, yaw: Math.PI * 0.7, rifle: { aim: (t) => (t > 6.5 ? 1 : 0.4), target: 'crew' } }] }),
  };
  const bursts = (who, list, rof, target) => list.map(([a, b]) => ({ who, a, b, rof, target }));
  const fireE = [...bursts('off1', [[6.9, 7.25], [7.5, 7.8]], 8, 'crew'), ...bursts('off2', [[7.05, 7.4]], 8, 'crew')];
  // the helicopter (the game's own PoliceHelicopter, flown on this path): spool-up on the pad, lift, pirouette to the
  // east, nose down and chase. y is the skid height; the runtime keeps it clear of everything below (the heli's AirMap).
  const PAD = [-9, 16.56, -194];
  const heliE = {
    rpm: flat([[0, 0.72], [2.6, 1]]),
    x: flat([[0, PAD[0]], [4.6, PAD[0]], [6.0, PAD[0] + 2], [8.0, 20], [10, 62], [13, 140], [18, 270], [22, 375]]),
    z: flat([[0, PAD[2]], [4.6, PAD[2]], [6.0, PAD[2] - 4], [8.0, -222], [10, -236], [13, -241], [22, -241]]),
    y: flat([[0, PAD[1]], [4.2, PAD[1]], [5.4, PAD[1] + 4], [6.6, PAD[1] + 11], [8.4, 38], [11, 46], [22, 48]]),
    yaw: flat([[0, -Math.PI / 2], [4.3, -Math.PI / 2], [5.7, -Math.PI * 1.1], [7.2, -Math.PI * 1.2], [8.4, -Math.PI * 1.42], [10, -Math.PI * 1.5], [22, -Math.PI * 1.5]]), /* the pirouette turns the short way round (through south) into the direction it then flies, east */
    light: flat([[0, 0], [7.4, 0], [8.4, 1]]), target: 'crew',
  };

  // ======== ACT IV: Galle Face — the chase at full speed (x −400, southbound, the green on the west) ========
  const HG = new Path([[-398.2, -760], [-398.2, -600], [-398.2, -400], [-398.2, -250]]);
  const gS = (t) => 26 + 31 * t; const gp1 = curve([[0, 0], [2, 52], [14, 52 + 30.6 * 12]]); const gp2 = curve([[0, 0], [2, 40], [14, 40 + 30.2 * 12]]);
  const rigsGF = {
    crew: vehicleRig({ type: 'praetor', seed: 4, path: HG, s: gS, share: 'crew', lights: () => true }),
    pol1: vehicleRig({ type: 'police', seed: 5, path: HG, s: (t) => gp1.at(t) - 2, share: 'gp1' /* also the chase behind Dineth (GT) */, lat: flat([[0, 0], [4, 0], [5.5, -3.2], [8, -3.2], [9.5, 0]]), driver: 'officer', lights: () => true, beacons: () => true }),
    pol2: vehicleRig({ type: 'police', seed: 6, path: HG, s: (t) => gp2.at(t) - 12, share: 'gp2', lat: flat([[0, -3.2], [14, -3.2]]), driver: 'officer', lights: () => true, beacons: () => true }),
  };
  const pedsGF = { dineth: pedRig({ who: 'dineth', segs: [{ t1: 99, seat: 'crew' }] }) };
  // the helicopter low over the green, the searchlight on the crew; it holds 34 m west of the road and slightly behind
  const heliGF = { rpm: () => 1, x: (t) => -432 + Math.sin(t * 0.35) * 3, z: (t) => HG.at(gS(t)).z - 26 + Math.sin(t * 0.5) * 4, y: (t) => 30 + Math.sin(t * 0.4) * 1.5,
    yaw: () => 0.04, pitch: () => 0.12, roll: () => -0.05, light: () => 1, target: 'crew' }; /* nose south, the way it flies (it used to point north: tail first) */

  // ======== ACT IV: Police HQ, the Officer-in-Charge's office (first floor; HQInterior.js: world x = −11 − u, z = −204.85 + v) ========
  // an officer sprints up the corridor, bursts through the OIC's door (the one real door in the building) and shouts the news;
  // the OIC, at his desk, gets up: "WHAT?!"
  const HQF = 4.67; // first-floor level (HQ ground 1.07 + one 3.6 m storey)
  const RUN = [[-26.0, -196.55], [-23.6, -196.55], [-23.6, -198.5], [-24.0, -199.3], [-24.0, -199.6]]; // sprint (5.54 m at 3.8 m/s), then two braking steps
  const pedsO = {
    runner: pedRig({ who: 'officer', seed: 23, segs: [{ t1: 1.708, walk: RUN, t0: 0.25, v: 3.8, y: HQF }, { t1: 2.3, walk: [[-24.0, -199.6], [-24.0, -200.45]], t0: 1.708, v: 1.6, y: HQF }, { t1: 99, x: -24.0, z: -200.45, yaw: Math.PI, y: HQF, act: (t) => (t < 5.1 ? 'argue' : null) }] }),
    oic: pedRig({ who: 'officer', seed: 31, role: 'supervisor', look: { cap: null, band: 'mature' }, segs: [{ t1: 99, x: -24.0, z: -203.35, yaw: 0, y: HQF, act: (t) => (t < 4.85 ? 'sit' : t < 6.1 ? 'rise' : null) }] }), // standing up: a real take (anim/Mocap.js 'rise', 1.25 s)
  };
  const oicDoor = [[0, 0], [0.62, 0], [0.86, 1], [1.15, 0.9], [1.5, 0.94]]; // flung open by the runner, it bounces off the stop

  // ======== FINALE: the crew at Galle Face, night; the helicopter passing the Lotus Tower ========
  const pedsGT = {
    // on the open line of sight to the Lotus Tower (no tower block in between). The chase tears north up Galle Face Centre Road
    // behind him: he turns his head after it (act 'track': the runtime aims his head at the police cars), then turns back, sighs
    // and asks what the hell they are doing
    dineth: pedRig({ who: 'dineth', segs: [{ t1: 99, x: -505.0, z: -474.0, yaw: (t) => dinethYaw(t), act: (t) => (t > 3.55 && t < 4.4 ? 'sigh' : t > 4.75 && t < 6.0 ? 'shrug' : null) }] }),
    // the others join him later (the closing shot)
    shashika: pedRig({ who: 'shashika', segs: [{ t1: 10, hidden: true }, { t1: 99, x: -506.4, z: -449.9, yaw: Math.PI * 1.5 + 0.12, act: 'crossarms' }] }),
    david: pedRig({ who: 'david', segs: [{ t1: 10, hidden: true }, { t1: 99, x: -505.8, z: -454.2, yaw: Math.PI * 1.5 - 0.22, act: 'hips' }] }),
  };
  // the chase behind Dineth: a sports car flat out down Galle Face Centre Road (x −398.2, the southbound lane, +z), two patrol
  // cars 0.45 / 0.85 s behind it (the second one lane over), the Air Wing helicopter low over the green just behind them with
  // its searchlight on the car. 38 m/s (137 km/h); the car passes Dineth's line (z −474) at t 1.5.
  const CH = new Path([[-398.2, -900], [-398.2, -150]]); const chZ = (t) => -474 + 38 * (t - 1.5); const chS = (t, lag) => chZ(t - lag) + 900;
  const chVis = (t) => t < 9;
  const rigsGT = {
    chase: vehicleRig({ type: 'raiden', seed: 3, path: CH, s: (t) => chS(t, 0), share: 'kz', driver: 'civ', lights: () => true, vis: chVis }),
    gpol1: vehicleRig({ type: 'police', seed: 5, path: CH, s: (t) => chS(t, 0.45), share: 'gp1', driver: 'officer', lights: () => true, beacons: () => true, vis: chVis }),
    gpol2: vehicleRig({ type: 'police', seed: 6, path: CH, s: (t) => chS(t, 0.85), lat: flat([[0, -3.2], [1, -3.2]]), share: 'gp2', driver: 'officer', lights: () => true, beacons: () => true, vis: chVis }),
  };
  const heliGT = { rpm: () => 1, x: (t) => -413 + Math.sin(t * 0.6) * 1.2, z: (t) => chZ(t - 0.6), y: (t) => 26 + Math.sin(t * 0.5) * 0.8, yaw: () => 0, light: () => 1, target: 'chase' };
  // eased keys [[t, v], …] (smoothstep between keys, held outside)
  const smk = (K) => (t) => { if (t <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (t < K[i][0]) return lerp(K[i - 1][1], K[i][1], sm((t - K[i - 1][0]) / (K[i][0] - K[i - 1][0]))); return K[K.length - 1][1]; };
  // Dineth: hears the sirens, turns round to the road (through −z, where they come from), watches them tear past and away
  // south, turns back, sighs; then the line. Yaw unwrapped: 4.61 (facing the camera, west) → π (south-west) → east → back.
  const DY0 = Math.PI * 1.5 - 0.1;
  const dinethYaw = smk([[0, DY0], [0.75, 3.35], [1.6, 1.75], [2.55, 1.05], [2.95, 0.95], [3.75, DY0 - 2 * Math.PI]]);
  const heliL = { rpm: () => 1, x: (t) => 360 - 14 * t, z: (t) => -548 + 1.5 * t, y: () => 92, yaw: () => -Math.PI / 2 - 0.1, pitch: () => 0.1, roll: () => 0.04, light: () => 1, aim: (t) => [300 - 9 * t, 0, -566] };

  // ---------------------------------------------------------------- scenes
  const NIGHT = { hour: 21.4, weather: 'clear', wet: 0 };
  const scenes = {
    S1: { env: { hour: 6.86, weather: 'clear', wet: 0, toHour: 7.0 }, focus: [-440, -400], traffic: true },
    S2: { env: { hour: 7.6, weather: 'clear', wet: 0 }, focus: [380, -560], traffic: true },
    S3: { env: { hour: 8.2, weather: 'clear', wet: 0 }, focus: [-405, -400], traffic: true },
    S4: { env: { hour: 9.4, weather: 'clear', wet: 0 }, focus: [-80, -430], traffic: true },
    P: { env: { hour: 10.8, weather: 'clear', wet: 0 }, focus: [-110, -898], traffic: true, rigs: rigsP, peds: pedsP, reserved: [[-310, -30, -903.2, -896.8], [-95, -65, -895.5, -891.5]] },
    G: { env: { hour: 12.4, weather: 'clear', wet: 0 }, focus: [-398, -330], traffic: true, rigs: rigsG, reserved: [[-397.2, -390, -560, -180]] },
    CU: { env: { hour: 15.4, weather: 'clear', wet: 0 }, focus: [-275, 285], traffic: true, rigs: rigsCU, reserved: [[-281, -250, 200, 292]] },
    TR: { env: { hour: 16.6, weather: 'clear', wet: 0 }, focus: [-505, 150], traffic: true, train: { s0: 1139, v: 12.5, dir: 1 } /* the front passes the camera (s 1285) at the end of the shot */ },
    PK: { env: { hour: 17.1, weather: 'clear', wet: 0 }, focus: [172, -30], traffic: true },
    GF0: { env: { hour: 17.9, weather: 'clear', wet: 0 }, focus: [-495, -445], traffic: true },
    DK: { env: { hour: 18.5, weather: 'clear', wet: 0, toHour: 18.95 }, focus: [-120, -430], traffic: true },
    C: { env: NIGHT, rigs: rigsC, peds: pedsC, fire: fireC, traffic: false, hideRoadPeds: true, rob: sceneC.rob, reserved: [[-70, 260, -746, -734], [226, 250, -746, -560]] },
    D: { env: { hour: 21.5, weather: 'clear', wet: 0 }, rigs: rigsD, peds: pedsD, traffic: false, hideRoadPeds: true, reserved: [[236, 247, -760, -555], [236, 480, -567, -557]] },
    E: { env: { hour: 21.6, weather: 'clear', wet: 0 }, rigs: rigsE, peds: pedsE, fire: fireE, traffic: false, hideRoadPeds: true, heli: heliE, reserved: [[-68, -56, -260, -140], [-68, 660, -250, -232]] },
    O: { env: { hour: 21.6, weather: 'clear', wet: 0 }, peds: pedsO, traffic: false, focus: [-24, -201], hq: { door: oicDoor } },
    GF: { env: { hour: 21.7, weather: 'clear', wet: 0 }, rigs: rigsGF, peds: pedsGF, traffic: false, hideRoadPeds: true, heli: heliGF, reserved: [[-410, -390, -780, -220]] },
    N1: { env: { hour: 21.8, weather: 'clear', wet: 0 }, focus: [330, -520], traffic: true, heli: heliL },
    N2: { env: { hour: 21.8, weather: 'clear', wet: 0 }, focus: [-150, -895], traffic: true },
    GT: { env: { hour: 21.9, weather: 'clear', wet: 0 }, focus: [-500, -474], peds: pedsGT, rigs: rigsGT, heli: heliGT, traffic: true, sirenFrom: 0, noPeds: [[-505, -474, 6]], reserved: [[-411, -386, -950, -100]] },
  };
  for (const [id, s] of Object.entries(scenes)) { s.id = id; s.rigs ||= {}; s.peds ||= {}; s.fire ||= []; s.events ||= []; }
  for (const id of ['C', 'D', 'E', 'GF']) scenes[id].reservedSet = true;

  // ---------------------------------------------------------------- the edit
  // o: t0 (sim start), rate (slow motion), focus (streaming / street life), name, key (night key light), dof, blur
  const S = (scene, start, dur, cam, o = {}) => ({ scene, start, dur, cam, t0: o.t0 ?? 0, rate: o.rate ?? 1, focus: o.focus || null, name: o.name || '', key: o.key || null, dof: o.dof || null, blur: o.blur ?? 0.5, act: 0 });
  const JW = (lx, ly, lz) => [JX + lx, ly, JZ + lz];
  const shots = [
    // ===== ACT I — THE CITY (0 – 25): black, the city wakes; aerial Colombo, the Lotus Tower, the traffic, the skyline
    S('S1', 0.0, 9.375, glide({ p: [-830, 34, -486], l: [-380, 44, -560] }, { p: [-690, 64, -438], l: [-380, 54, -556] }, 50, 46), { name: 'sea dawn', blur: 0.3 }),
    S('S2', 9.375, 5.0, glide({ p: [462, 34, -632], l: [305, 118, -480] }, { p: [450, 86, -618], l: [305, 210, -480] }, 52, 50), { name: 'lotus crane', blur: 0.3 }),
    S('S3', 14.375, 4.375, glide({ p: [-437, 44, -322], l: [-400, 0, -412] }, { p: [-432, 40, -366], l: [-400, 0, -458] }, 50, 48), { name: 'galle road traffic', blur: 0.35 }),
    S('S4', 18.75, 6.25, glide({ p: [150, 20, -382], l: [-430, 52, -470] }, { p: [112, 31, -358], l: [-430, 60, -470] }, 50, 47), { name: 'lake skyline', blur: 0.3 }),
    // ===== ACT II — LIFE (25 – 55): streets, people, traffic, shops, a garage, the train, the park, the sea front
    S('P', 25.0, 3.75, glide({ p: [-126.5, 1.55, -892.6], l: [-60, 2.4, -903] }, { p: [-121.5, 1.6, -892.7], l: [-60, 2.5, -904] }, 50, 48), { t0: 0, name: 'pettah street', focus: [-110, -898] }),
    S('P', 28.75, 2.5, rigCam('tuk', [-1.55, 0.42, 3.1], [0, 0.95, -1.5], 44, { hand: 0.55 }), { t0: 3.75, name: 'tuk low', focus: [-130, -900] }),
    S('P', 31.25, 3.75, glide({ p: [-402, 2.0, -866.4], l: [-386, 13, -912] }, { p: [-398.5, 2.3, -867.6], l: [-386, 16, -912] }, 50, 47), { t0: 6.25, name: 'clock tower', focus: [-390, -895] }),
    S('P', 35.0, 2.5, (t, P, u) => { const f = P.fathima; return { p: [f.x - 2.5 + 0.2 * u, 1.58, -892.35], l: [f.x, 1.5, f.z], fov: 34, hand: 0.5 }; }, { t0: 10.0, name: 'close-up phone', focus: [-80, -893], dof: { on: 'fathima', k: 9 } }),
    S('G', 37.5, 2.5, follow([-390.8, 0.42, -330.5], [-390.8, 0.45, -331.2], 'bus', 1.9, 46, 3.5, 0.3), { t0: 1.5, name: 'bus low', focus: [-398, -340] }),
    S('CU', 40.0, 3.75, (t, P, u) => { const v = P.car; return { p: L3([-289.4, 1.25, 270.5], [-289.0, 1.5, 274.2], sm(u)), l: [lerp(v.x, -255, 0.3), 1.6, lerp(v.z, 285, 0.3)], fov: 47, hand: 0.3 }; }, { t0: 2.6, name: 'street customs', focus: [-272, 285] }),
    S('TR', 43.75, 3.75, glide({ p: [-494.5, 3.4, 114], l: [-503.5, 2.2, 196] }, { p: [-494.8, 3.2, 117.5], l: [-503.5, 2.4, 190] }, 46, 44), { t0: 0, name: 'train', focus: [-505, 150] }),
    S('PK', 47.5, 2.5, glide({ p: [188.5, 1.9, -21.5], l: [168, 6, -30] }, { p: [186.2, 2.0, -23.2], l: [168, 6.3, -30] }, 48, 47), { name: 'golden buddha', focus: [172, -30] }),
    S('GF0', 50.0, 2.5, glide({ p: [-506.5, 1.15, -482], l: [-492, 1.6, -420] }, { p: [-506.0, 1.25, -476.5], l: [-492, 1.7, -414] }, 48, 47), { name: 'promenade sunset', focus: [-500, -450] }),
    S('DK', 52.5, 2.5, glide({ p: [62, 30, -332], l: [-420, 60, -520] }, { p: [50, 33, -346], l: [-420, 64, -522] }, 50, 48), { name: 'dusk', blur: 0.3 }),
    // ===== ACT III — THE UNDERWORLD (55 – 85): night; the jewellery store robbery, the getaway, night driving
    S('C', 55.0, 2.5, follow([72.0, 0.48, -745.0], [71.2, 0.5, -745.0], 'crew', 0.7, 40, 1.0, 0.3), { t0: 1.8, name: 'arrival', focus: [55, -742] }),
    S('C', 57.5, 2.5, (t, P, u) => { const s = P.shashika; return { p: [51.5 - 0.15 * u, 1.62, -745.25], l: [s.vis ? s.x : 56, 1.45, s.vis ? s.z : -744], fov: 36, hand: 0.5 }; }, { t0: 5.0, name: 'shashika', key: ['shashika'], focus: [54, -744], dof: { on: 'shashika', k: 8 } }),
    S('C', 60.0, 2.5, glide({ p: [45.5, 1.7, -734.6], l: [53.3, 2.1, -746] }, { p: [46.5, 1.72, -734.7], l: [53.3, 2.15, -746] }, 44, 42), { t0: 7.3, name: 'store front', focus: [53, -742] }),
    S('C', 62.5, 1.25, glide({ p: JW(1.15, 0.95, -2.9), l: JW(-0.45, 2.05, -1.05) }, { p: JW(1.1, 0.92, -2.85), l: JW(-0.5, 2.2, -1.1) }, 46, 44), { t0: 9.75, name: 'warning shots', focus: [53, -748] }) /* low by the counter: Shashika puts three rounds into the ceiling */,
    S('C', 63.75, 3.75, glide({ p: JW(-2.15, 1.58, -6.4), l: JW(2.6, 1.35, -1.9) }, { p: JW(-1.95, 1.6, -5.9), l: JW(2.6, 1.4, -1.9) }, 44, 42), { t0: 11.0, name: 'inside', key: null, focus: [53, -748], dof: { on: 'keeperPt', k: 5 } }),
    S('C', 67.5, 2.5, glide({ p: JW(-0.95, 1.72, -3.45), l: JW(2.72, 1.3, -1.92) }, { p: JW(-0.8, 1.7, -3.3), l: JW(2.72, 1.32, -1.92) }, 40, 37), { t0: 14.75, name: 'keeper demand', focus: [53, -748], dof: { on: 'keeperPt', k: 7 } }),
    S('C', 70.0, 2.5, glide({ p: JW(1.8, 1.6, -4.05), l: JW(2.15, 1.22, -1.95) }, { p: JW(1.72, 1.64, -3.95), l: JW(1.95, 1.3, -1.95) }, 42, 40), { t0: 17.25, name: 'the case', focus: [53, -748], dof: { on: 'keeperPt', k: 5 } }) /* down the counter from its far end: the keeper comes up with the case, sets it down, slides it across; David takes it */,
    S('C', 72.5, 3.75, follow([49.6, 0.36, -741.4], null, 'crew', 0.6, 44, 0, 0.45), { t0: 25.1, name: 'burnout', focus: [70, -742] }),
    S('C', 76.25, 2.5, rigCam('crew', [2.7, 0.75, 0.6], [0, 0.6, 1.3], 40, { hand: 0.7 }), { t0: 28.9, name: 'side track', blur: 0.6 }),
    S('C', 78.75, 2.5, follow([244.6, 0.7, -727.0], null, 'crew', 0.6, 46, 2, 0.35), { t0: 32.2, name: 'corner', focus: [236, -735] }) /* low in the outer lane of Darley Road: the car slides round the corner and blasts past (the old kerb spot had a signal pole across the lens) */,
    S('D', 81.25, 3.75, rigCam('crew', [5, 22, -20], [0, 0, 22], 50, { hand: 0.25 }), { t0: 2.2, name: 'aerial to lotus', blur: 0.4 }),
    // ===== ACT IV — THE CITY STRIKES BACK (85 – 115): Police HQ, the Air Wing, the pursuit
    S('E', 85.0, 2.5, glide({ p: [-25.5, 17.6, -199.8], l: [-9, 18.6, -194] }, { p: [-25.0, 17.5, -200.6], l: [-9, 18.8, -194] }, 40, 38), { t0: 0.2, name: 'heli on the pad', focus: [-9, -200] }),
    S('E', 87.5, 2.5, (t, P, u) => { const c = P.crew, h = P.heli, k = smr(0.42, 1, u); return { p: [-40, 0.45, -251.6], l: [lerp(c.x, h.x, k), lerp(0.8, h.y + 1, k), lerp(c.z, h.z, k)], fov: lerp(46, 40, k), hand: 0.4 }; }, { t0: 4.2, name: 'past the HQ', focus: [-20, -225] }), /* low on the kerb: the crew car tears past, the camera tilts up to the helicopter leaving the Police HQ roof */
    S('E', 90.0, 1.25, rigCam('pol1', [-1.3, 0.55, 3.4], [0, 1.1, 0], 40, { hand: 0.7 }), { t0: 7.0, name: 'beacons', focus: [70, -243] }),
    S('O', 91.25, 3.75, glide({ p: [-25.45, 6.02, -204.3], l: [-23.55, 5.85, -197.85] }, { p: [-25.3, 6.0, -204.15], l: [-23.7, 5.82, -199.0] }, 46, 44), { t0: 0.25, name: 'oic office', key: ['runner'], focus: [-24, -201] }) /* behind the OIC's desk: the door flies open, an officer sprints in */,
    S('O', 95.0, 2.5, (t, P, u) => ({ p: [-23.32, 6.3, -199.8], l: [-24.05, lerp(5.86, 6.22, smr(0.3, 0.75, u)), -203.25], fov: 40, hand: 0.4 }), { t0: 4.0, name: 'oic rises', key: ['oic'], focus: [-24, -201], dof: { on: 'oic', k: 6 } }) /* over the runner's shoulder: the OIC gets up — "WHAT?!" */,
    S('E', 97.5, 3.75, (t, P, u) => ({ p: L3([-27.0, 17.3, -184.8], [-26.0, 17.6, -186.0], sm(u)), l: [P.heli.x, P.heli.y + 1.6, P.heli.z], fov: lerp(48, 40, sm(u)), hand: 0.4 }), { t0: 3.6, rate: (u) => (u < 0.7 ? 0.92 : lerp(0.92, 1, smr(0.7, 1, u))), name: 'liftoff', focus: [-9, -200], blur: 0.35 }),
    S('E', 101.25, 2.5, (t, P, u) => { const h = P.heli; return { p: [h.x - 22 + 6 * u, h.y + 4, h.z - 13], l: [h.x, h.y + 1, h.z], fov: 44, hand: 0.3 }; }, { t0: 9.0, name: 'heli alongside', focus: [100, -240], blur: 0.4 }),
    S('E', 103.75, 2.5, (t, P, u) => { const c = P.crew, h = P.heli; return { p: [c.x + 14 - 2 * u, 1.1, c.z - 2.6], l: [c.x - 30, 12, lerp(c.z, h.z, 0.5)], fov: 52, hand: 0.5 }; }, { t0: 12.2, name: 'searchlight', /* tracking ahead of the crew car, looking back: the helicopter's beam comes down the road onto it */ focus: [170, -240], blur: 0.4 }),
    S('GF', 106.25, 1.25, rigCam('crew', [-2.9, 0.62, 5.6], [0, 0.65, -2], 40, { hand: 0.7 }), { t0: 1.0, name: 'pursuit front', blur: 0.6 }),
    S('GF', 107.5, 1.25, rigCam('pol1', [2.4, 0.75, 3.2], [-0.2, 0.8, 0.2], 44, { hand: 0.8 }), { t0: 4.0, name: 'police alongside', blur: 0.6 }),
    S('GF', 108.75, 1.25, (t, P) => { const c = P.crew; return { p: [-406.6, 0.55, c.z + 30], l: [P.heli.x, P.heli.y + 1, P.heli.z], fov: 54, hand: 0.4 }; }, { t0: 5.3, name: 'heli overhead', focus: [-405, -560] }),
    S('GF', 110.0, 5.0, (t, P, u) => { const c = P.crew, h = P.heli; return { p: [-470 + 10 * u, 58 - 10 * sm(u), c.z - 70 + 20 * sm(u)], l: [lerp(c.x, h.x, 0.35), 4, c.z + 10], fov: 46, hand: 0.25 }; }, { t0: 6.6, rate: (u) => (u < 0.25 ? 1 : u < 0.4 ? lerp(1, 0.45, smr(0.25, 0.4, u)) : 0.45), name: 'galle face wide', blur: 0.35 }),
    // ===== ACT V — FINALE (115 – 136): eight shots
    S('N1', 115.0, 2.5, glide({ p: [402, 30, -604], l: [305, 150, -480] }, { p: [396, 40, -598], l: [305, 172, -480] }, 52, 48), { t0: 0, name: 'lotus night', focus: [330, -540] }) /* a rising drone: the lit bud with the helicopter crossing in front of it */,
    S('D', 117.5, 2.5, rigCam('crew', [-2.35, 0.5, 4.4], [0, 0.8, -1.5], 42, { hand: 0.6 }), { t0: 10.0, name: 'moving vehicle', blur: 0.6 }),
    S('N1', 120.0, 1.25, glide({ p: [120, 26, -380], l: [-430, 58, -470] }, { p: [108, 28, -372], l: [-430, 60, -470] }, 50, 49), { t0: 3, name: 'skyline night', focus: [-80, -430], blur: 0.3 }),
    S('GT', 121.25, 2.5, glide({ p: [-512.5, 1.35, -476.8], l: [-470, 3.0, -472.5] }, { p: [-512.3, 1.38, -476.4], l: [-470, 3.2, -471.0] }, 24, 23), { t0: 0.2, name: 'dineth chase', key: ['dineth'], focus: [-470, -474] }) /* the chase tears down Centre Road behind Dineth */,
    S('GT', 123.75, 3.75, glide({ p: [-507.6, 1.62, -475.0], l: [-505.0, 1.62, -474.0] }, { p: [-507.4, 1.62, -474.7], l: [-505.0, 1.63, -474.0] }, 32, 30), { t0: 2.7, name: 'dineth', key: ['dineth'], focus: [-500, -474], dof: { on: 'dineth', k: 10 } }) /* he watches them go, turns back, sighs: "What the hell are they doing?" */,
    S('N1', 127.5, 2.5, (t, P, u) => ({ p: [P.heli.x + 12 - 8 * u, 50 + 5 * u, P.heli.z - 40], l: [lerp(P.heli.x, 305, 0.22), lerp(P.heli.y, 215, 0.3), lerp(P.heli.z, -480, 0.22)], fov: 46, hand: 0.25 }), { t0: 4.5, name: 'heli and lotus', focus: [300, -560] }) /* a drone just below and behind the helicopter: the aircraft large in the foreground, the lit bud behind it */,
    S('N2', 130.0, 2.5, glide({ p: [480, 140, -380], l: [-300, 30, -500] }, { p: [462, 136, -392], l: [-300, 30, -505] }, 55, 53), { t0: 3, name: 'living city', blur: 0.25 }),
    S('GT', 132.5, 3.5, (t, P, u) => { const k = ease3(u); return { p: [lerp(-510.6, -513.6, k), lerp(1.1, 2.7, k), lerp(-472.4, -476.0, k)], l: [lerp(-505, -420, k), lerp(1.7, 12.5, k), lerp(-474, -478, k)], fov: 48, hand: 0.15 }; }, { t0: 12, name: 'best shot', focus: [-490, -476], blur: 0.3 }) /* low on Dineth, then up and back over his shoulder to the night skyline and the Lotus Tower */,
    // ===== ACT VI — REVEAL (136 – 146): black, the title, the studio, the sound logo (no picture: the last shot holds under black)
  ];
  // the vehicle-tracking shots stream the city around the car
  for (const s of shots) if (!s.focus) { const sc = scenes[s.scene]; if (sc.rigs.crew) s.focusRig = 'crew'; }
  for (const s of shots) { s.act = ACTS.reduce((a, [, t], i) => (s.start >= t - 1e-6 ? i : a), 0); }
  for (const s of shots) {
    const N = 240, tab = new Float64Array(N + 1); let acc = 0; tab[0] = 0; const R = typeof s.rate === 'function' ? s.rate : () => s.rate;
    for (let i = 1; i <= N; i++) { const u0 = (i - 1) / N, u1 = i / N; acc += ((R(u0) + R(u1)) / 2) * (s.dur / N); tab[i] = acc; }
    s.simTab = tab; s.simLen = acc;
    s.simAt = (e) => { const u = clamp(e / s.dur, 0, 1) * N, i = Math.min(N - 1, Math.floor(u)); return s.t0 + lerp(tab[i], tab[i + 1], u - i); };
    s.rateAt = (e) => R(clamp(e / s.dur, 0, 1));
  }

  // ---------------------------------------------------------------- picture & words
  // black: [from, fullAt, holdTo, clearAt]
  const black = [[-1, -1, 1.2, 3.6], [24.6, 24.95, 25.0, 25.25], [54.55, 54.95, 55.0, 55.35], [84.7, 84.98, 85.0, 85.2], [135.55, 135.98, 147, 147]];
  const texts = [
    { kind: 'cityTitle', a: 4.4, b: 8.4, text: 'COLOMBO', fi: 1.2, fo: 0.9 },
    { kind: 'tagline', a: 19.6, b: 24.1, text: 'A CITY WITH A THOUSAND STORIES', fi: 0.9, fo: 0.6 },
    { kind: 'title', a: 137.0, b: 141.4, fi: 0.5, fo: 0.5 },
    { kind: 'studio', a: 142.1, b: 145.25, text: 'SHAUN DAVID STUDIOS', fi: 0.45, fo: 0.55 },
  ];
  // ---------------------------------------------------------------- dialogue (49th): recorded lines (public/assets/voice/t2,
  // played on the dialogue bus by CineScore), timed in the scene's own time so they stay on the actors' lips through the cuts;
  // the subtitle (kind 'vo', key = the speaking actor) drives the lip movement and reads at the bottom of the frame
  const edAt = (sc, t) => { for (const q of shots) if (q.scene === sc && t >= q.t0 - 1e-6 && t <= q.t0 + q.simLen + 1e-6) return q.start + (t - q.t0) / (typeof q.rate === 'number' ? q.rate : 1); return null; };
  const LINES = [
    ['C', 10.5, 'david', 'David', 'Let’s finish this shit up and leave.', 'david_finish', 2.81],
    ['C', 13.75, 'david', 'David', 'The money. All of it. In the case, now!', 'david_demand', 3.89],
    ['O', 0.85, 'runner', 'Officer', 'Sir! They are back! They robbed a jewellery store!', 'officer_back', 4.3],
    ['O', 5.2, 'oic', 'OIC', 'WHAT?!', 'oic_what', 1.25],
    ['GT', 4.0, 'dineth', 'Dineth', 'What the hell are they doing?', 'dineth_what', 2.42],
  ];
  const voices = [];
  for (const [sc, t, key, who, text, file, dur] of LINES) { const a = edAt(sc, t); if (a == null) continue; texts.push({ kind: 'vo', a, b: a + dur, who, text, key }); voices.push({ e: a, file, dur, scene: sc, t }); }
  const sighs = [edAt('GT', 3.6)].filter((x) => x != null); // Dineth's sigh before his line (a breath, synthesised)
  const flashes = [85.0, 115.0];
  // rob scene helpers for the runtime / test
  const robWorld = (lx, lz) => J(lx, lz);
  return { LENGTH, BPM, BEAT, BAR, ACTS, scenes, shots, texts, black, flashes, voices, sighs, KEEP, robWorld, HJ, HE, HG, HD, STOP };
}

// [[t, [x, y, z]], …] → out at t: a monotone cubic (Fritsch–Carlson) per component, so a multi-key path (the case lifted over
// the counter) moves continuously through its keys — no ease-to-a-stop at every key — and never overshoots between two keys
// (a held key, two equal values, stays perfectly still)
export function pathAt(keys, t, out) {
  const n = keys.length; if (t <= keys[0][0] || n === 1) { const v = keys[0][1]; out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; return out; }
  if (t >= keys[n - 1][0]) { const v = keys[n - 1][1]; out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; return out; }
  let i = 1; while (keys[i][0] <= t) i++; const t0 = keys[i - 1][0], t1 = keys[i][0], h = t1 - t0, u = (t - t0) / h;
  const h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
  for (let c = 0; c < 3; c++) {
    const p0 = keys[i - 1][1][c], p1 = keys[i][1][c], d = (p1 - p0) / h;
    const tan = (k) => { if (k <= 0 || k >= n - 1) return 0; const da = (keys[k][1][c] - keys[k - 1][1][c]) / (keys[k][0] - keys[k - 1][0]), db = (keys[k + 1][1][c] - keys[k][1][c]) / (keys[k + 1][0] - keys[k][0]); return da * db <= 0 ? 0 : (2 * da * db) / (da + db); }; // harmonic mean of the neighbouring slopes (0 at a turn or a hold)
    let m0 = tan(i - 1), m1 = tan(i); if (d === 0) { m0 = 0; m1 = 0; } else { const a = m0 / d, b = m1 / d, r = a * a + b * b; if (r > 9) { const s3 = 3 / Math.sqrt(r); m0 = s3 * a * d; m1 = s3 * b * d; } }
    out[c] = h00 * p0 + h10 * h * m0 + h01 * p1 + h11 * h * m1;
  }
  return out;
}
export function shotAt(plan, e) { let cur = plan.shots[0]; for (const s of plan.shots) if (e >= s.start) cur = s; return cur; }
export function blackAt(plan, e) {
  for (const [a, b, c, d] of plan.black) { if (e < a || e > d) continue; if (e < b) return sm((e - a) / Math.max(1e-3, b - a)); if (e <= c) return 1; return 1 - sm((e - c) / Math.max(1e-3, d - c)); }
  return 0;
}
// a scene's poses at sim time t: vehicles, people, plus the helicopter (heli) and the store keeper's point (keeperPt)
export function posesAt(scene, t) {
  const P = {}; for (const [id, r] of Object.entries(scene.rigs)) P[id] = r.pose(t); for (const [id, r] of Object.entries(scene.peds)) P[id] = r.pose(t);
  const H = scene.heli; if (H) P.heli = heliPose(H, t);
  if (scene.rob) P.keeperPt = { x: 55.75, z: -749.02, vis: true, y: 0, cy: 1.3 }; // the store keeper's chest (aim / focus point)
  if (scene.rob && scene.rob.aim) P.shTgt = scene.rob.aim(t); // Shashika's aim point (the ceiling, then the keeper)
  return P;
}
export function heliPose(H, t) {
  const at = (f) => (typeof f === 'function' ? f(t) : f.at(t)); const x = at(H.x), z = at(H.z), y = at(H.y); let yaw = at(H.yaw);
  // a helicopter in forward flight points its nose where it is going: above ~4 m/s the scripted heading hands over to the
  // direction of travel (velocity averaged over ±0.4 s), so no track can fly it sideways or tail first; hovering keeps the script
  { const d = 0.4; const vx = (at2(H.x, t + d) - at2(H.x, t - d)) / (2 * d), vz = (at2(H.z, t + d) - at2(H.z, t - d)) / (2 * d), vh = Math.hypot(vx, vz);
    const k = clamp((vh - 4) / 8, 0, 1); if (k > 0) { const vy = Math.atan2(vx, vz); const dA = Math.atan2(Math.sin(vy - yaw), Math.cos(vy - yaw)); yaw += dA * k * k * (3 - 2 * k); } }
  // attitude from the path itself: nose down into acceleration, bank into the turn (a real helicopter tilts its thrust)
  let pitch = H.pitch ? H.pitch(t) : 0, roll = H.roll ? H.roll(t) : 0;
  if (!H.pitch) { // accelerations averaged over ±0.7 s (a pilot flies smoothly), scaled to a police helicopter's gentle attitudes
    let ax = 0, az = 0, sp = 0; const e = 0.35; for (const o of [-0.35, 0, 0.35]) { const tt = t + o; const v0x = (at2(H.x, tt) - at2(H.x, tt - e)) / e, v0z = (at2(H.z, tt) - at2(H.z, tt - e)) / e, v1x = (at2(H.x, tt + e) - at2(H.x, tt)) / e, v1z = (at2(H.z, tt + e) - at2(H.z, tt)) / e; ax += (v1x - v0x) / e / 3; az += (v1z - v0z) / e / 3; sp += Math.hypot(v1x + v0x, v1z + v0z) / 6; }
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    pitch = clamp(Math.atan2(ax * fx + az * fz, 9.81) * 0.45 + sp * 0.002, -0.09, 0.15); roll = clamp(Math.atan2(ax * rx + az * rz, 9.81) * 0.4, -0.15, 0.15); }
  return { x, y, z, yaw, pitch, roll, rpm: at(H.rpm), light: at(H.light ?? (() => 0)), vis: true, aim: H.aim ? H.aim(t) : null, target: H.target || null };
}
const at2 = (f, t) => (typeof f === 'function' ? f(t) : f.at(t));
export function simRange(shot) { return [shot.t0, shot.t0 + shot.simLen]; }
export function editTimeOf(plan, scene, t) {
  for (const s of plan.shots) { if (s.scene !== scene || t < s.t0 || t > s.t0 + s.simLen) continue; let lo = 0, hi = s.dur; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (s.simAt(m) < t) lo = m; else hi = m; } return s.start + (lo + hi) / 2; }
  return null;
}
export const _cine = { ease3, easeOut, glide, follow, orbit };
