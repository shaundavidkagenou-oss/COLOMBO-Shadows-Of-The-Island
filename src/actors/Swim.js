// Swimming (45th): the Indian Ocean off the seawall, the harbour, Beira Lake and the canals.
//  * getting in: walk off an open edge, or (railings along the lake / Galle Face promenade) Jump to vault the rail and dive
//  * at the surface: tread water (eggbeater legs, sculling hands) when still, front crawl when moving, faster crawl on Sprint
//    (drains stamina — the Stamina and Swimming skills decide how fast)
//  * Crouch dives under (breaststroke underwater), Jump swims back up; released, the body floats up on its own
//  * breath while the head is under (Lung Capacity skill: 15 – 60 s); out of breath you start to drown (damage pulses)
//  * getting out: swim at a coping / seawall / bank no higher than ~1.85 m above the water and keep pushing (or press
//    Jump): a pull-up onto the ledge and a step over the rail.
// Poses are procedural (Character.bodyPose / applyAct 'swim' · 'dive' · 'pullup'), driven by the fields set below.
import * as L from '../world/Layout.js';
import { SKILL_FX } from '../story/Skills.js';
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { clamp, lerp, damp, dampAngle, wrapAngle } from '../core/math.js';

const BED_PAD = 0.9; // the body never sinks closer than this to the bottom
// water a body can swim in at (x, z): any water cell once you're down in it (canal bridges / piers pass overhead)
export function swimmable(P, x, z) { return L.isWater(x, z) && (P.y < -0.3 || !P.collision.walkableWater(x, z, P.y)); }

function splash(x, z, big) {
  const [g, pan] = Audio.spatial(x, z, 40); if (g < 0.03) return;
  Audio.noise(big ? 0.9 : 0.35, { f: big ? 700 : 1300, q: 0.6, type: 'lowpass', vol: (big ? 0.42 : 0.12) * g, pan, attack: 0.004, verb: big });
  if (big) Audio.noise(1.4, { f: 2600, q: 0.4, type: 'bandpass', vol: 0.08 * g, pan, when: 0.08, attack: 0.05 });
}

export function startSwim(P) {
  const surf = L.waterLevel(P.x, P.z) ?? -0.9; const plunge = clamp(-(P.vy || 0) * 0.2, 0, 1.6);
  P.swim = { breath: P.swimBreath ?? 1, depth: plunge, under: plunge > 0.55, sprint: false, lay: P.speed > 0.8 ? 1 : 0, ph: 0, dive: 0, br: plunge > 0.55 ? 1 : 0, outT: 0, drownT: 0, strokeT: 0, surf };
  P.vy = 0; P.grounded = true; P.aiming = false; P.scoped = null; P.sprinting = false; P.crouching = false; P.diveIn = null;
  if (P.weapons && P.weapons.drawn) P.weapons.holster(); P.events.emit('swimStart'); splash(P.x, P.z, plunge > 0.3);
  P.ch.anim.set('swim'); return P.swim;
}

// blocked at the water's edge (Player.updateFoot): jump the railing / step off and dive in. Returns true when it starts.
export function tryEnterWater(P, dt, moveYaw, mag) {
  const fx = Math.sin(moveYaw), fz = Math.cos(moveYaw); let wd = 0;
  for (let d = 0.4; d <= 8; d += 0.3) { const px = P.x + fx * d, pz = P.z + fz * d; if (L.isWater(px, pz) && !L.bridgeWalkAt(px, pz)) { wd = d; break; } if (L.roadAt(px, pz) || (P.collision.blocked && !L.isWater(px, pz) && P.collision.blocked(px, pz, 0.25))) break; }
  if (!wd || mag < 0.3) { P.edgeT = 0; return false; }
  const rail = L.beyondRailing(P.x + fx * 0.5, P.z + fz * 0.5, 0.2);
  P.edgeT = (P.edgeT || 0) + dt; P.edgeHint = rail ? 'jump' : null;
  if (!(Input.wasPressed('jump') || (!rail && P.edgeT > 0.35))) return false;
  if (wd > 2.2) { // a wide coping / embankment beyond the rail: vault the rail onto it (then walk off the edge, or Jump again to dive)
    const tx = P.x + fx * 1.3, tz = P.z + fz * 1.3; P.climb = { t: 0, dur: 0.75, act: 'vault', x0: P.x, z0: P.z, y0: P.y, x1: tx, z1: tz, y1: P.collision.groundAt(tx, tz, P.y + 1, 2) };
    P.yaw = moveYaw; P.edgeT = 0; P.speed = 0; P.events.emit('jump'); return true; }
  const tx = P.x + fx * (wd + 1.6), tz = P.z + fz * (wd + 1.6); const surf = L.waterLevel(tx, tz) ?? -0.9;
  P.diveIn = { t: 0, dur: rail ? 0.95 : 0.8, x0: P.x, z0: P.z, y0: P.y, x1: tx, z1: tz, y1: surf - 0.35, arc: rail ? 1.05 : 0.55 };
  P.yaw = moveYaw; P.edgeT = 0; P.speed = 0; P.ch.anim.play('dive', 2); P.events.emit('jump'); return true;
}

export function updateDiveIn(P, dt) {
  const D = P.diveIn, A = P.ch.anim; D.t += dt; const k = Math.min(1, D.t / D.dur); const kk = clamp((k - 0.12) / 0.88, 0, 1); // a short crouch, then the flight
  P.x = lerp(D.x0, D.x1, kk * kk * (3 - 2 * kk) * 0.6 + kk * 0.4); P.z = lerp(D.z0, D.z1, kk * kk * (3 - 2 * kk) * 0.6 + kk * 0.4);
  P.y = lerp(D.y0, D.y1, kk * kk) + Math.sin(kk * Math.PI) * D.arc * (1 - kk * 0.4);
  A.diveK = k; A.update(dt, 0, 0); P.sync();
  if (k >= 1) { P.diveIn = null; P.vy = -6.5; P.speed = 1.6; startSwim(P); }
}

export function updateSwim(P, dt, mx, my, mag) {
  const A = P.ch.anim, S = P.swim; const t = performance.now() / 1000;
  const surf = L.waterLevel(P.x, P.z) ?? S.surf; S.surf = surf; const sea = L.isSea(P.x, P.z);
  const bed = L.waterBed(P.x, P.z); const maxDepth = Math.max(0, surf - bed - BED_PAD - 0.6);
  const ctl = P.control;
  const wantSprint = ctl && Input.isDown('sprint') && mag > 0.3 && P.stamina > 0.04;
  const diveDown = ctl && Input.isDown('crouch'), swimUp = ctl && Input.isDown('jump');
  S.sprint = wantSprint && S.depth < 0.3;
  // stamina: sprint-crawl burns it, steady swimming a little, treading water recovers slowly (Swimming + Stamina skills)
  const moving = mag > 0.05;
  P.stamina = clamp(P.stamina + (S.sprint ? -dt * 0.1 * SKILL_FX.swimDrain * SKILL_FX.staminaDrain : moving ? -dt * 0.012 * SKILL_FX.swimDrain : dt * 0.07 * SKILL_FX.staminaRegen), 0, 1);
  const tired = P.stamina < 0.02;
  const target = moving ? (S.sprint ? 2.75 : 1.45) * Math.max(mag, 0.5) * SKILL_FX.swimSpeed * (S.under ? 0.82 : 1) * (tired ? 0.6 : 1) : 0;
  P.speed = damp(P.speed, target, target > P.speed ? 2.0 : 1.3, dt); // water: slow to build speed, a long glide when you stop
  const prevYaw = P.yaw;
  if (moving) { const dirYaw = P.camYaw + Math.PI + Math.atan2(-mx, my); P.yaw = dampAngle(P.yaw, dirYaw, S.under ? 2.4 : 3.2, dt); }
  const turnRate = wrapAngle(P.yaw - prevYaw) / Math.max(dt, 1e-4);
  const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  let nx = P.x + fx * P.speed * dt, nz = P.z + fz * P.speed * dt;
  // the edge: land ahead → pull yourself out if it is low enough, otherwise it is a wall
  if (!swimmable(P, nx + fx * 0.35, nz + fz * 0.35)) {
    let land = null;
    for (let d = 0.4; d <= 3.2; d += 0.15) { const px = P.x + fx * d, pz = P.z + fz * d; if (L.isWater(px, pz)) continue; const tx = px + fx * 0.55, tz = pz + fz * 0.55; if (P.collision.blocked && P.collision.blocked(tx, tz, 0.3)) break; land = { x: tx, z: tz }; break; } // onto the coping / bank (the rail along it is stepped over afterwards)
    const h = land ? P.collision.groundAt(land.x, land.z, surf + 3, 4) : null;
    if (land && h - surf < 1.85 && S.depth < 0.4 && moving) {
      S.outT += dt; P.edgeHint = 'climb';
      if (S.outT > 0.3 || (ctl && Input.wasPressed('jump'))) { // pull-up onto the coping, over the rail
        P.swimBreath = S.breath; P.swim = null; P.speed = 0; const hy = h - surf;
        P.climb = { t: 0, dur: 0.9 + hy * 0.35, act: 'pullup', x0: P.x, z0: P.z, y0: surf - 1.25, x1: land.x, z1: land.z, y1: h };
        A.set('pullup'); splash(P.x, P.z, false); P.events.emit('swimEnd'); return;
      }
    } else S.outT = 0;
    nx = P.x; nz = P.z; P.speed *= 0.5;
  } else S.outT = 0;
  const r = P.collision.resolveCircle(nx, nz, 0.34, P.y, 0.45, 1.75); P.x = r.x; P.z = r.z;
  // vertical: dive, rise, float back up
  const d0 = S.depth;
  if (diveDown && maxDepth > 0.5) S.depth += dt * 1.35;
  else if (swimUp) S.depth -= dt * 1.8;
  else if (S.depth > 0) S.depth -= dt * (S.breath < 0.25 ? 1.1 : 0.42); // buoyancy (hurries when you're out of air)
  S.depth = clamp(S.depth, 0, maxDepth); const dd = (S.depth - d0) / Math.max(dt, 1e-4);
  S.under = S.depth > 0.5;
  S.dive = damp(S.dive, clamp(dd * 0.38, -0.55, 0.6), 4, dt); // nose down while diving, up while rising
  S.lay = damp(S.lay, P.speed > 0.32 || S.depth > 0.1 ? 1 : 0, 2.4, dt);
  S.br = damp(S.br, S.depth > 0.35 ? 1 : 0, 3, dt);
  const bob = (1 - Math.min(1, S.depth * 2)) * (sea ? 0.07 * Math.sin(t * 1.15 + P.x * 0.04) + 0.03 * Math.sin(t * 2.3 + P.z * 0.07) : 0.015 * Math.sin(t * 1.6));
  const yT = surf - lerp(1.32, 0.24, S.lay) - S.depth + bob;
  P.y = damp(P.y, yT, 5, dt);
  // strokes: one arm cycle per 2π (crawl at the surface, breaststroke under); treading has its own rhythm in the pose
  const rate = S.br > 0.5 ? 0.9 + P.speed * 1.0 : 1.1 + P.speed * 1.5 * (S.sprint ? 1.12 : 1);
  S.ph += dt * rate * (moving || S.depth > 0.1 ? 1 : 0.35);
  S.strokeT -= dt; if (S.lay > 0.6 && S.br < 0.5 && S.strokeT <= 0) { S.strokeT = Math.PI / rate; splash(P.x + fx * 0.9, P.z + fz * 0.9, false); }
  // breath
  const headUnder = S.depth > 0.35;
  if (headUnder) { S.breath = Math.max(0, S.breath - dt / SKILL_FX.breath); if (S.breath <= 0) { S.drownT -= dt; if (S.drownT <= 0) { S.drownT = 1; P.events.emit('drown'); } } }
  else { if (S.breath < 0.6 && S.wasUnder) Audio.noise(0.5, { f: 900, q: 0.8, vol: 0.06, attack: 0.02 }); S.breath = Math.min(1, S.breath + dt * 0.35); S.drownT = 0; }
  S.wasUnder = headUnder; P.swimBreath = S.breath;
  // pose fields (Character.js)
  A.swimLay = S.lay; A.swimPh = S.ph; A.swimDive = S.dive; A.swimBr = S.br; A.air = 0;
  if (A.action !== 'swim') A.set('swim');
  A.update(dt, 0, turnRate); P.sync();
}

// leaving the water any other way (teleport, respawn, vehicle) — clears the state
export function endSwim(P) { if (!P.swim && !P.diveIn) return; if (P.swim) P.swimBreath = P.swim.breath; P.swim = null; P.diveIn = null; if (P.ch.anim.action === 'swim') P.ch.anim.set(null); }
