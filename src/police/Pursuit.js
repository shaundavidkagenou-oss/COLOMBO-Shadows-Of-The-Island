// Aggressive pursuit driving for Sri Lanka Police units (original system).
//
// Lane following is how units travel to a call. Once a unit has the suspect's vehicle in sight and close, it leaves the
// lane ("intercept mode") and drives at the suspect directly, with one of three roles:
//   tail  — sits on the bumper; from 4★ it rams the rear,
//   pit   — draws level with the rear quarter and turns into it (PIT manoeuvre: the suspect car spins out),
//   block — overtakes, gets ahead on the suspect's line and brakes across it.
// Intercept cars are kinematic like other traffic, but steer with a tyre-grip yaw limit, collide with the static world
// (buildings, walls, poles), shove civilian traffic aside (the normal knock/slide response) and are themselves knocked by
// the player's car (Vehicle.drive impulses → Traffic.stepFree → back into the chase after a short recovery).
// From 4★ the police set roadblocks (two cars across the road ahead of the suspect) and at 5★ a spike strip across the
// gap: driving over it punctures the tyres (Vehicle.flat → less grip, lower top speed, a pulling wobble).
// Non-graphic: nobody is shot at; contact is car against car.
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { clamp, lerp } from '../core/math.js';
import { evalPiece, segNodes, otherEnd } from '../vehicles/Traffic.js';

export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const CHASE_SPEED = [0, 0, 1.05, 1.1, 1.16, 1.22]; // × the suspect's speed headroom (police cars carry more power)

// --------------------------------------------------------------- aim point for one unit (pure; tested)
// P: suspect vehicle {x,z,yaw,speed,half,T:{wid}}, v: police vehicle; returns { x, z, speed, contact }
export function chaseAim(role, P, v, stars, t = 0) {
  const pf = [Math.sin(P.yaw), Math.cos(P.yaw)], pr = [pf[1], -pf[0]]; const ps = Math.max(0, P.speed || 0);
  const rx = v.x - P.x, rz = v.z - P.z; const along = rx * pf[0] + rz * pf[1], lat = rx * pr[0] + rz * pr[1];
  const side = lat >= 0 ? 1 : -1; const wid = (P.T && P.T.wid) || 1.8, vw = (v.T && v.T.wid) || 1.8; const half = P.half || 2.2;
  const lead = clamp(Math.hypot(rx, rz) / Math.max(4, Math.abs((v.speed || 0) - ps) + 4), 0, 1.2); // predict where the suspect will be
  const px = P.x + pf[0] * ps * lead, pz = P.z + pf[1] * ps * lead;
  let ax, az, speed, contact = false;
  if (role === 'pit' && stars >= 3) {
    const level = along > -half * 2.2 && along < half * 0.2 && Math.abs(lat) < wid / 2 + vw / 2 + 1.4; // drawn level with the rear quarter
    const off = level ? wid / 2 + vw / 2 - 0.9 : wid / 2 + vw / 2 + 0.6; // then turn in: aim through the rear corner
    ax = px - pf[0] * half * 0.75 + pr[0] * side * off; az = pz - pf[1] * half * 0.75 + pr[1] * side * off;
    speed = ps + (along < -half * 2 ? 7 : level ? 1.5 : 3); contact = level;
  } else if (role === 'block' && stars >= 3) {
    if (along > half + 9 && Math.abs(lat) < 7) { ax = P.x + pf[0] * (along + 4); az = P.z + pf[1] * (along + 4); speed = Math.max(0, ps * 0.35 - 2); contact = true; } // ahead: brake on the suspect's line
    else { const s2 = side * (wid + 1.2); ax = px + pf[0] * (14 + ps * 0.5) + pr[0] * s2; az = pz + pf[1] * (14 + ps * 0.5) + pr[1] * s2; speed = ps + 9; } // overtake on the outside
  } else { // tail (rams the rear from 4★)
    const surge = stars >= 4 && Math.sin(t * 1.5) > -0.2; const gap = stars >= 4 ? (surge ? -2.5 : 5) : stars >= 3 ? 2.5 : 6; /* 4★+: drop back, then surge into the rear bumper */ ax = px - pf[0] * (half * 2 + gap); az = pz - pf[1] * (half * 2 + gap);
    const behind = -along - half * 2; speed = ps + clamp((behind - gap) * (surge ? 1.6 : 0.9), -6, surge ? 7 : 10); contact = stars >= 4;
  }
  return { x: ax, z: az, speed: Math.max(0, speed), contact, along, lat };
}

// --------------------------------------------------------------- one kinematic step of an intercept car (called from Traffic.step)
export function stepChase(T, v, dt, all) {
  const ai = v.ai, ch = ai.chase; const vT = v.T; const top = (vT.maxSpeed || 40) * 0.9 * (ch.boost || 1);
  let want = Math.atan2(ch.ax - v.x, ch.az - v.z); let dyaw = angDiff(want, v.yaw); const dist = Math.hypot(ch.ax - v.x, ch.az - v.z);
  let target = Math.min(top, ch.speed); if (dist < 3 && !ch.contact) target = Math.min(target, ch.speed * 0.9);
  target = Math.min(target, lerp(top, 5, clamp((Math.abs(dyaw) - 0.25) / 1.6, 0, 1))); // slow for sharp turns
  if (ch.stop) target = 0;
  const acc = clamp((target - v.speed) * 2.2, -9.5, vT.accel * 1.15); v.speed = Math.max(0, v.speed + acc * dt); v.brake = acc < -1.2;
  const wb = vT.len * 0.62; const yrSteer = (Math.max(v.speed, 3) * Math.tan(0.62)) / wb; const yrGrip = 11.5 / Math.max(v.speed, 1);
  const yr = clamp(dyaw * 3.2, -1, 1) * Math.min(yrSteer, yrGrip); v.yaw = Math.atan2(Math.sin(v.yaw + yr * dt), Math.cos(v.yaw + yr * dt)); v.steer = clamp(dyaw * 3, -0.6, 0.6);
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); let nx = v.x + fx * v.speed * dt, nz = v.z + fz * v.speed * dt;
  if (L.isWater(nx, nz) && !L.roadAt(nx, nz) && !L.bridgeWalkAt(nx, nz)) { nx = v.x; nz = v.z; v.speed *= 0.3; ch.blockT += dt * 2; }
  v.x = nx; v.z = nz;
  // static world: push out of buildings / walls / poles; a hard hit scrubs speed
  let hit = false; for (const [cx, cz] of v.circles()) { const r = T.collision.resolveCircle(cx, cz, v.radius, v.y, 0.25, 2, { vehicle: true }); if (r.hit) { const dx = r.x - cx, dz = r.z - cz, dl = Math.hypot(dx, dz) || 1; v.x += dx; v.z += dz; const vn = (fx * dx + fz * dz) / dl; if (vn < -0.2) { if (v.speed > 6) v.impact(v.speed * -vn); v.speed *= 1 + vn * 0.6; } hit = true; } }
  ch.blockT = hit && v.speed < 3 ? ch.blockT + dt : Math.max(0, ch.blockT - dt * 0.5);
  // other traffic (not the player's car: Vehicle.drive resolves that contact from the player's side)
  for (const o of all) {
    if (o === v || o.player || Math.abs(o.x - v.x) > 9 || Math.abs(o.z - v.z) > 9) continue;
    let px = 0, pz = 0, deep = 0; for (const a of v.circles()) for (const b of o.circles()) { const dx = a[0] - b[0], dz = a[1] - b[1], d = Math.hypot(dx, dz), m = v.radius + o.radius; if (d < m && d > 1e-4) { px += dx / d * (m - d); pz += dz / d * (m - d); deep = Math.max(deep, m - d); } }
    if (deep < 0.01) continue; const pl = Math.hypot(px, pz) || 1, nX = px / pl, nZ = pz / pl;
    if (o.police) { v.x += nX * deep * 0.5; v.z += nZ * deep * 0.5; continue; } // units don't take each other out
    const m1 = vT.mass || 1300, m2 = (o.T && o.T.mass) || 1100; v.x += nX * deep * (m2 / (m1 + m2)); v.z += nZ * deep * (m2 / (m1 + m2));
    const ofw = o.forward ? o.forward() : [0, 0]; const Vo = o.free ? [o.free.vx, o.free.vz] : [ofw[0] * (o.speed || 0), ofw[1] * (o.speed || 0)];
    const vn = (fx * v.speed - Vo[0]) * nX + (fz * v.speed - Vo[1]) * nZ; if (vn < 0 && o.shove) { const J = -(1.2 * vn) / (1 / m1 + 1 / m2); o.shove(-nX * J / m2, -nZ * J / m2, clamp((Math.random() - 0.5) * J / m2 * 0.3, -1.5, 1.5)); v.speed = Math.max(0, v.speed + (J / m1) * Math.min(0, nX * fx + nZ * fz)); }
  }
  v.y = L.groundY(v.x, v.z); v.lights = T.night > 0.4; v.sync(dt);
}

// put a unit that was in intercept mode back on the nearest lane (smooth offset easing, see Traffic.step kx/kz/kyaw)
export function rejoinLane(T, v, maxD = 60) {
  const ln = T.laneNear(v.x, v.z, v.yaw, maxD); if (!ln) return false; const ai = v.ai;
  ai.chase = null; ai.pieces = [ln.piece]; ai.s = ln.s; ai.route = null; ai.goal = null; ai.lat = 0; ai.bumped = 0; ai.stuck = 0;
  const [x, z, yaw] = evalPiece(ln.piece, ln.s); ai.kx = v.x - x; ai.kz = v.z - z; ai.kyaw = angDiff(v.yaw, yaw); T.extend(v); return true;
}

// --------------------------------------------------------------- PIT contact: the suspect car's rear is pushed out → it spins
export function applyPit(P, v, side) {
  const sp = Math.max(4, Math.abs(P.speed || 0)); P.spin = clamp((P.spin || 0) + side * (1.5 + sp * 0.035), -2.6, 2.6); P.lat = (P.lat || 0) - side * Math.min(5, 1.5 + sp * 0.12);
  P.speed *= 0.82; P.pitT = 1.3; if (P.impact) P.impact(Math.max(8, Math.abs((v.speed || 0) - sp) * 2 + 6));
}

// --------------------------------------------------------------- roadblock site: follow the road ahead of the suspect
// returns { x, z, yaw (road direction toward the suspect), hw (half road width), seg } 130–230 m ahead, or null
export function roadblockSite(P, nearestRoad, drivable, minD = 130, maxD = 230) {
  const nr = nearestRoad(); if (!nr) return null; const pf = [Math.sin(P.yaw), Math.cos(P.yaw)];
  let [a, b] = segNodes(nr.seg); if ((b.x - a.x) * pf[0] + (b.z - a.z) * pf[1] < 0) [a, b] = [b, a]; // b = the node ahead
  let dist = Math.hypot(b.x - P.x, b.z - P.z), from = a, at = b; const seen = new Set([nr.seg]);
  for (let hop = 0; hop < 12; hop++) {
    let best = null, bc = -2; const dir = [at.x - from.x, at.z - from.z]; const dl = Math.hypot(dir[0], dir[1]) || 1;
    for (const s of at.segs) { if (!drivable.has(s) || seen.has(s) || s.crossing || s.level >= 3) continue; const o = otherEnd(s, at); const c = ((o.x - at.x) * dir[0] + (o.z - at.z) * dir[1]) / (dl * (Math.hypot(o.x - at.x, o.z - at.z) || 1)); if (c > bc) { bc = c; best = s; } }
    if (!best || bc < 0.3) return null; seen.add(best); const o = otherEnd(best, at); const len = Math.hypot(o.x - at.x, o.z - at.z);
    if (dist + len > minD && len > 26) { const k = clamp((minD - dist) / len, 0.3, 0.7); if (dist + len * k <= maxD) { const x = lerp(at.x, o.x, k), z = lerp(at.z, o.z, k); return { x, z, yaw: Math.atan2(at.x - o.x, at.z - o.z), hw: best.hw || 4.5, seg: best }; } }
    dist += len; from = at; at = o; if (dist > maxD) return null;
  }
  return null;
}

// --------------------------------------------------------------- spike strip (yellow-banded steel strip with spikes)
let STRIP = null;
function stripGeometry() {
  if (STRIP) return STRIP; const base = new THREE.BoxGeometry(1, 0.05, 0.42);
  const pos = [], col = [], idx = []; let vi = 0;
  const addGeo = (g, m, c) => { g = g.toNonIndexed(); g.applyMatrix4(m); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); col.push(...c); idx.push(vi++); } };
  for (let i = 0; i < 10; i++) addGeo(base, new THREE.Matrix4().makeScale(0.098, 1, 1).premultiply(new THREE.Matrix4().makeTranslation(-0.45 + i * 0.1, 0.025, 0)), i % 2 ? [0.08, 0.08, 0.09] : [0.82, 0.66, 0.08]);
  const cone = new THREE.ConeGeometry(0.018, 0.07, 5); for (let i = 0; i < 20; i++) for (const zz of [-0.12, 0, 0.12]) addGeo(cone, new THREE.Matrix4().makeTranslation(-0.475 + i * 0.05, 0.085, zz + (i % 2) * 0.03), [0.72, 0.74, 0.76]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  STRIP = { geo: g, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.5 }) }; return STRIP;
}
export function makeSpikeStrip(x, z, yaw, len) {
  const s = stripGeometry(); const m = new THREE.Mesh(s.geo, s.mat); m.scale.set(len, 1, 1); m.position.set(x, L.groundY(x, z) + 0.01, z); m.rotation.y = yaw; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
  return { mesh: m, x, z, yaw, len, depth: 0.42 };
}
// does any wheel of vehicle v sit on the strip? (strip local: across = its length axis)
export function overStrip(strip, v) {
  const ax = Math.cos(strip.yaw), az = -Math.sin(strip.yaw), dx = Math.sin(strip.yaw), dz = Math.cos(strip.yaw); const f = [Math.sin(v.yaw), Math.cos(v.yaw)], r = [f[1], -f[0]];
  const hl = v.T.len * 0.36, hw = v.T.wid * 0.42;
  for (const [a, b] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw]]) { const wx = v.x + f[0] * a + r[0] * b - strip.x, wz = v.z + f[1] * a + r[1] * b - strip.z; if (Math.abs(wx * ax + wz * az) < strip.len / 2 && Math.abs(wx * dx + wz * dz) < strip.depth / 2 + 0.15) return true; }
  return false;
}

// --------------------------------------------------------------- radio
const DIR_EN = ['north', 'east', 'south', 'west'], DIR_SI = ['උතුරු', 'නැගෙනහිර', 'දකුණු', 'බටහිර'];
const VEH = { tuktuk: 'three-wheeler', car: 'hatchback', sedan: 'sedan', taxi: 'taxi', van: 'van', suv: 'SUV', bus: 'bus', pbus: 'private bus', lorry: 'lorry', tow: 'tow truck', bike: 'motorcycle', police: 'stolen police car', policejeep: 'stolen police jeep', policebike: 'stolen police motorcycle' };
// compass heading of a direction (map north = −z, east = +x)
export function compass(yaw) { const fx = Math.sin(yaw), fz = Math.cos(yaw); return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz < 0 ? 0 : 2); }
export function radioLine(kind, ctx) {
  const road = ctx.road || 'the area'; const d = ctx.dir ?? 0; const veh = VEH[ctx.vtype] || 'vehicle'; const n = ctx.unit || 1;
  switch (kind) {
    case 'heading': return ctx.alt ? { si: `සැකකරු ${road} දිගේ ${DIR_SI[d]} දෙසට යනවා.`, tr: `Suspect going ${DIR_EN[d]} on ${road}.` } : { en: `Control to all units — suspect ${veh} heading ${DIR_EN[d]} on ${road}.` };
    case 'pit': return { en: `Unit ${n}, you are clear for a PIT. Take him out.` };
    case 'ram': return { en: `Unit ${n}, box him in. Do not let him get away.` };
    case 'block': return { en: `Unit ${n}, get ahead of him and cut him off.` };
    case 'roadblock': return { en: `Roadblock set on ${road}. All units, push him into it.` };
    case 'spikes': return { en: `Spike strip deployed on ${road}.` };
    case 'spun': return { en: `He's spun out! Move in, move in!` };
    case 'flat': return { en: `Tyres are gone — he won't get far!` };
    case 'lost': return { en: `Lost visual near ${road}. All units, close the area.` };
    default: return { en: '' };
  }
}
