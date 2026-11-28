// Headless crash / breakaway / recoverable ragdoll regression suite.
import './node-dom-stub.mjs';
import './chaos-env.mjs';
import * as THREE from 'three';
import { RNG } from '../src/core/rng.js';
import { Vehicle, VEH_HOOKS } from '../src/vehicles/Vehicle.js';
import { VTYPES } from '../src/vehicles/VehicleModels.js';
import { PropBreak } from '../src/world/PropBreak.js';
import { GEO, buildPropGeometries } from '../src/world/Props.js';
import { MAT } from '../src/gfx/Materials.js';
import { Character } from '../src/actors/Character.js';
import { makeAppearance } from '../src/actors/Appearance.js';
import { Crowd } from '../src/actors/Crowd.js';
import { RagdollWorld } from '../src/actors/Ragdoll.js';
let count = 0;
function ok(cond, why) { if (!cond) throw Error(why); count++; }
for (const k of ['paint', 'bench', 'pedRailing']) MAT[k] ??= new THREE.MeshStandardMaterial({ vertexColors: true });
buildPropGeometries();
const col = { query: () => [], resolveCircle: (x, z) => ({ x, z, hit: false }), groundAt: () => 0 };
function car(speed) {
  const v = Object.create(Vehicle.prototype); Object.assign(v, { T: VTYPES.car, id: 2, x: 0, y: 0, z: 0, yaw: 0, speed, steer: 0, lat: 0, radius: VTYPES.car.wid * 0.55, half: VTYPES.car.len / 2, spin: 0, pv: 0, rv: 0, vy: 0, tPitch: 0, tRoll: 0, sus: { hv: 0 }, power: 1, sync() {} }); return v;
}
const fast = car(25), slow = car(5); fast.crashLaunch(18, { nx: 0, nz: -1, t: 2 }); slow.crashLaunch(5, { nx: 0, nz: -1, t: 2 });
ok(fast.air && fast.vy > 2 && Math.abs(fast.pv) > 1 && Math.abs(fast.rv) > 1, 'big crash launches and spins the chassis');
ok(!slow.air && slow.speed === 5, 'normal driving is untouched');
// Wall impulse through the actual drive loop (not just the standalone crashLaunch helper).
{ const v = car(26); v.x = -300; v.z = -122; v.damage = 0;
  const wall = { query: () => [], resolveCircle: (x, z) => z > -120 ? { x, z: -120, hit: true } : { x, z, hit: false } };
  v.drive(1 / 30, { throttle: 0, steer: 0, handbrake: false }, wall, []);
  ok(v.air && v.lastImpact?.v > 14 && v.vy > 0, 'high-speed wall impulse launches the vehicle in the real driving loop');
}
// Use the same hook called by the player's swept vehicle path.
const game = { scene: new THREE.Scene(), world: { chunks: [], propPools: [], propDirty: false, collision: col }, explosions: null };
const B = new PropBreak(game); const types = ['woodFence', 'chainFence', 'railing', 'hydrant', 'cone', 'bollard'];
for (const type of types) {
  const p = { type, x: -300, z: -120, rot: 0 }, c = { brk: p, h: 1.5, x0: -301.5, x1: -298.5, z0: -120.1, z1: -119.9 };
  const tooSlow = B.hit(car(0.1), c, { vx: 0, vz: 0.1, side: 1 }); ok(tooSlow === 0 && c.h === 1.5, type + ' stays anchored below shear force');
  const keep = VEH_HOOKS.breakProp(car(25), c, { vx: 0, vz: 25, side: 1 }); ok(keep === 1 && c.h === 0 && p._down, type + ' breaks without robbing vehicle velocity');
  ok(B.debris.at(-1).pieces.length >= (type.includes('Fence') || type === 'railing' ? 7 : 3), type + ' fragments are separate bodies');
}
// Exercise the real swept collision hook, not just PropBreak.hit in isolation.
{ const p = { type: 'cone', x: -300, z: -120, rot: 0 }, c = { brk: p, x0: -300.2, x1: -299.8, z0: -120.2, z1: -119.8, h: 0.6 }, v = car(18);
  v.x = -300; v.z = -122.2; v.damage = 0;
  const world = { query: () => [c], resolveCircle: (x, z) => ({ x, z, hit: false }) };
  v.drive(1 / 30, { throttle: 0, steer: 0, handbrake: false }, world, []);
  ok(p._down && c.h === 0 && v.speed > 17, 'swept vehicle collision breaks a cone without robbing speed');
}
// Existing long pedestrian-rail runs stay intact until one individual panel breaks.
{ const run = { h: 1.05, parts: [] }, a = { type: 'railing', x: -300, z: -120, rot: 0, run }, b = { type: 'railing', x: -297, z: -120, rot: 0, run };
  const ca = a.col = { brk: a, h: 0 }, cb = b.col = { brk: b, h: 0 }; run.parts.push(a, b);
  ok(B.hit(car(20), ca, { vx: 0, vz: 20, side: 1 }) === 1 && run.h === 0 && cb.h === 1.05, 'a broken run exposes solid colliders only on the remaining panels');
  B.repairDebris(B.debris.pop()); ok(run.h === 1.05 && ca.h === 0 && cb.h === 0, 'full rail run returns on repair');
}
for (let i = 0; i < 90; i++) B.update(1 / 60, { x: -300, z: -120 });
ok(B.debris.every((d) => d.pieces.every((b) => Number.isFinite(b.obj.position.y) && b.obj.position.y >= -0.1)), 'all debris bounces above ground');
ok(B.water.visible && B.waterGeo.drawRange.count > 0, 'broken hydrant emits water geyser');
B.update(0.05, { x: 1000, z: 1000 }); // repair once the street is distant and cleared
for (let i = 0; i < 400; i++) B.update(0.05, { x: 1000, z: 1000 });
ok(B.debris.length === 0 && B.stats.repaired === types.length + 2, 'broken street furniture repairs out of view');
// Actual Verlet skeleton, not an animation placeholder: launch, rest and scripted get-up.
const scene = new THREE.Scene(), ch = new Character(makeAppearance(37)); scene.add(ch.root); ch.root.updateMatrixWorld(true);
const W = new RagdollWorld(col), C = Object.create(Crowd.prototype);
Object.assign(C, { ragdolls: W, collision: col, rng: new RNG(44), focus: { x: 0, z: 0 }, events: { emit() {} }, minds: { playerAct() {} }, react(p, state) { p.state = state; }, speak() {}, alarm() {}, kill() { throw Error('ordinary high-speed impact must recover'); } });
const p = { x: 0, z: 0, y: 0, yaw: 0, ch, state: 'walk' };
C.knock(p, 0, 1, 16, 0.3); ok(!!ch.rag && p.koRag?.car && p.koRag.lim === 0, 'impact instantly disables animator and enters ragdoll');
ok(ch.rag.part('head').y > 0 && p.koRag.spin !== 0, 'impact applies vertical and rotational torque');
let restAt = 0, riseAt = 0;
for (let i = 0; i < 1000 && p.koRag; i++) { W.update(1 / 60); if (ch.rag?.asleep && !restAt) restAt = i / 60; if (p.koRag && p.koRag.ph && !riseAt) riseAt = i / 60; if (p.koRag) C.koRagPed(p, 1 / 60, 0); }
ok(restAt > 0 && riseAt - restAt >= 1.9 && riseAt - restAt <= 3.2, `get-up starts after 2–3 seconds at rest (${(riseAt - restAt).toFixed(2)})`);
ok(!p.koRag && !ch.rag && p.state === 'down', 'get-up returns body to animator without leaving it ragdolled');
console.log(`chaos-physics: ${count} checks passed`);
