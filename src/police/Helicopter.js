// Police Air Wing helicopter: based on the helipad on the Police Headquarters roof (Kompannaveediya), launched at 4★+ while
// the police are chasing / searching for the player, recovered to the pad when the chase is over.
//
// Flight model (not scripted paths): a rigid body that can only accelerate the way a real helicopter does — by tilting its
// rotor thrust. The pilot logic asks for a velocity; the needed acceleration (plus the drag it must overcome) becomes a pitch /
// roll attitude, the attitude follows with a realistic lag and rate limit, and only the tilted thrust then accelerates the
// body. So it noses down to speed up, flares nose-up to stop, banks into turns, sinks / balloons with collective lag, and
// wobbles slightly in turbulence and in ground effect. Heading: into the airflow at speed; in a slow orbit the observer's
// (right) side faces the suspect so the searchlight and camera see them.
//
// Obstacles: an "air map" of 6 m cells holding the highest solid top in each cell (every building / wall / landmark collider,
// the HQ roof plant and mast, the Lotus Tower's full 356 m). The pilot looks ahead along the flight path (and toward the
// goal) and climbs over anything inside the rotor's reach plus a safety margin, slowing down if the climb can't be made in
// time; a hard floor under the whole rotor disc means the airframe can never enter a building or object.
//
// Downwash: the rotor column bends trees / palms / grass / flowers (Wind.heliWash → foliage vertex shaders), raises dust or
// spray rings on the ground (VehicleSmoke puffs), pushes and scatters people under it (Crowd), and buffets the camera.
// Sound: synthesised blade slap + turbine whine + rotor rumble, spatialised; replaced by the player's recording when one is set
// for 'heli.rotor' (Sounds window).
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { HQ } from '../world/PoliceHQ.js';
import { buildHeliModel, HELI } from '../vehicles/HeliModel.js';
import { nightLight } from '../gfx/LightSets.js';
import { heliWash } from '../world/Wind.js';
import { bloomHotAt } from '../gfx/BloomHot.js';
import { Audio } from '../audio/Audio.js';
import { SoundBank } from '../audio/SoundBank.js';

const G = 9.81, CELL = 6;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const HQ_ROOF = L.LAND_Y + HQ.storeys * 3.3;
// helipad: the clear part of the HQ roof (AC plant, water tank and radio mast all > 13 m from the centre); nose into the sea
// breeze (west), tail toward the clear east half of the roof
export const HELIPAD = { x: -9, z: -194, y: HQ_ROOF + 0.06, yaw: -Math.PI / 2, r: 7.6 };
const VMAX = 46;        // m/s (~165 km/h) cruise
const A_H = 3.6;        // m/s² horizontal manoeuvre limit (≈ 20° bank)
const CD = 0.00095;     // drag: at 46 m/s needs ~11° nose-down
const CLEAR = 18;       // m above the highest obstacle within reach of the flight path
const ORBIT_R = 62, ORBIT_AGL = 58, CRUISE_AGL = 80;

// ------------------------------------------------------------------ obstacle heights (cells of max solid top)
export class AirMap {
  constructor(collision) { this.c = collision; this.cells = new Map(); this.extra = []; }
  addBox(x0, x1, z0, z1, top) { this.extra.push({ x0, x1, z0, z1, top }); this.cells.clear(); }
  addCylinder(x, z, r, top) { this.addBox(x - r, x + r, z - r, z + r, top); }
  cell(i, j) {
    const k = i * 100003 + j; let t = this.cells.get(k); if (t !== undefined) return t;
    const x0 = i * CELL, z0 = j * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
    t = Math.max(L.LAND_Y, L.surfaceY(x0 + CELL / 2, z0 + CELL / 2));
    if (this.c) for (const c of this.c.query(x0, z0, x1, z1)) { if (!(c.h > 0) || c.x1 < x0 || c.x0 > x1 || c.z1 < z0 || c.z0 > z1) continue; const top = (c.y0 || 0) + c.h; if (top > t) t = top; }
    for (const e of this.extra) if (e.x1 >= x0 && e.x0 <= x1 && e.z1 >= z0 && e.z0 <= z1 && e.top > t) t = e.top;
    if (this.cells.size > 60000) this.cells.clear(); this.cells.set(k, t); return t;
  }
  // highest solid top within a square of half-size r around (x, z)
  top(x, z, r = 0) { let t = -10; const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = this.cell(i, j); if (c > t) t = c; } return t; }
}

let BEAM_GEO = null;
function beamMaterial() {
  return new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color(0xf2f6ff) }, opacity: { value: 0 } }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main() { float l = 0.25 + 0.75 * vUv.y * vUv.y; float e = abs(dot(normalize(vN), normalize(vV))); float a = l * pow(e, 1.6) * opacity; gl_FragColor = vec4(color, a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' });
}

export class PoliceHelicopter {
  constructor(game) {
    this.g = game; const scene = game.scene; this.air = new AirMap(game.collision);
    // things the colliders don't describe fully: the HQ roof itself (the building's colliders are its shell walls), its roof
    // plant / tank / radio mast, and the Lotus Tower above its 14 m base collider
    const [bx0, bx1, bz0, bz1] = HQ.building; this.air.addBox(bx0, bx1, bz0, bz1, HQ_ROOF);
    for (const [x, z] of [[-30, -195], [-24, -191], [6, -195]]) this.air.addBox(x - 1.1, x + 1.1, z - 0.7, z + 0.7, HQ_ROOF + 1.4);
    this.air.addBox(-37.5, -33.5, -200.8, -197.2, HQ_ROOF + 2.96); this.air.addBox(HELIPAD.x + 12, HELIPAD.x + 13, HELIPAD.z + 4.5, HELIPAD.z + 5.5, HQ_ROOF + 4.4); // roof stair hut, windsock
    this.air.addCylinder(10, -188, 1.2, HQ_ROOF + 2.2); this.air.addCylinder(12, -199, 0.6, HQ_ROOF + 16.8);
    this.air.addBox(bx0, bx1, bz0, bz0 + 0.3, HQ_ROOF + 0.9); this.air.addBox(bx0, bx1, bz1 - 0.3, bz1, HQ_ROOF + 0.9); // parapets
    this.air.addCylinder(305, -480, 13, 216); this.air.addCylinder(305, -480, 30, 360); // Lotus Tower: stem, then the bud / mast
    const M = buildHeliModel({ reg: '4R-SLP' }); this.M = M; M.group.rotation.order = 'YXZ'; scene.add(M.group);
    this.p = new THREE.Vector3(HELIPAD.x, HELIPAD.y, HELIPAD.z); this.v = new THREE.Vector3(); this.yaw = HELIPAD.yaw; this.pitch = 0; this.roll = 0; this.yawRate = 0;
    this.ay = 0; this.rpm = 0; this.state = 'parked'; this.mission = null; this.t = 0; this.wantT = 0; this.calmT = 0; this.orbA = 0; this.forced = false; this.light = 0;
    this.aim = new THREE.Vector3(HELIPAD.x, 0, HELIPAD.z - 30); this.stats = { launches: 0, landings: 0, floorHits: 0, minClear: Infinity };
    // searchlight: one spot light, created now (before the loading screen compiles the shaders) and kept forever — only its
    // intensity changes (a light added or removed mid-play recompiles every material). Tier 2 of LightSets: out of the
    // shaders except while it (or a torch) is actually lit.
    const s = new THREE.SpotLight(0xf2f5ff, 0, 240, 0.085, 0.45, 2); s.name = 'heliSearchlight'; s.castShadow = false; s.position.set(0, -500, 0); s.target.position.set(0, -501, 0);
    scene.add(nightLight(s, 2)); scene.add(s.target); this.spot = s;
    if (!BEAM_GEO) { BEAM_GEO = new THREE.ConeGeometry(1, 1, 24, 1, true); BEAM_GEO.rotateX(-Math.PI / 2); BEAM_GEO.translate(0, 0, 0.5); }
    this.beamMat = beamMaterial(); this.beam = new THREE.Mesh(BEAM_GEO, this.beamMat); this.beam.visible = false; this.beam.frustumCulled = false; this.beam.renderOrder = 3; scene.add(this.beam);
    this._v = new THREE.Vector3(); this._q = new THREE.Vector3(); this._lens = new THREE.Vector3(); this._m = new THREE.Matrix4();
    this.place(); this.pose(0);
  }
  // ------------------------------------------------------------------ public (police / console)
  get active() { return this.state !== 'parked'; }
  call(forced = true) { // launch (or re-task) for the chase
    if (forced) this.forced = true; this.mission = 'chase'; this.calmT = 0;
    if (this.state === 'parked' || this.state === 'shutdown') { this.state = 'startup'; this.stats.launches++; this.g.police?.note?.('Air Wing helicopter launching from Police HQ'); }
    else if (this.state === 'land') this.state = 'fly';
  }
  home() { this.forced = false; if (this.state === 'parked' || this.state === 'shutdown') return; this.mission = 'home'; if (this.state === 'startup') { this.state = 'shutdown'; return; } if (this.state !== 'land') this.state = 'fly'; }
  info() { const agl = this.p.y - this.air.top(this.p.x, this.p.z, 0); return `heli ${this.state}${this.mission ? ' (' + this.mission + ')' : ''} · rotor ${(this.rpm * 100).toFixed(0)}% · ${this.p.x.toFixed(0)}, ${this.p.y.toFixed(1)}, ${this.p.z.toFixed(0)} · ${agl.toFixed(1)} m AGL · ${(Math.hypot(this.v.x, this.v.z) * 3.6).toFixed(0)} km/h · light ${this.light > 0.01 ? 'on' : 'off'} · floor contacts ${this.stats.floorHits}`; }
  hudMark() { if (this.state === 'parked') return null; return { x: this.p.x, z: this.p.z, lights: this.mission === 'chase', heli: true }; }
  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (!(dt > 0)) return; dt = Math.min(dt, 0.05); this.t += dt; const g = this.g, P = g.police;
    // dispatch: 4★+ while the police are chasing or searching (and the player is outdoors); back to base after 20 s of calm
    const stars = P && P.stars ? P.stars() : 0; const chase = P && (P.state === 'pursuing' || P.state === 'searching' || P.state === 'detected');
    const want = (stars >= 4 && chase && !g.indoor) || this.forced;
    this.wantT = want ? this.wantT + dt : 0;
    if (want && this.wantT > 1.5 && this.mission !== 'chase') this.call(false);
    if (!want && this.mission === 'chase') { this.calmT += dt; if (this.calmT > 20 || (P && P.state === 'patrol' && this.calmT > 6)) this.home(); } else this.calmT = 0;
    // engine / rotor
    const spin = this.state === 'startup' || this.state === 'lift' || this.state === 'fly' || this.state === 'land';
    this.rpm = clamp(this.rpm + (spin ? dt / 13 : -dt / 24), 0, 1); // turbine light-off → rotor at flight rpm in ~13 s; run-down ~24 s
    if (this.state === 'startup' && this.rpm >= 1) this.state = 'lift';
    if (this.state === 'shutdown' && this.rpm <= 0) this.state = 'parked';
    if (this.state === 'shutdown' && this.mission === 'chase') this.state = 'startup';
    if (this.state === 'lift' || this.state === 'fly' || this.state === 'land') this.fly(dt);
    this.pose(dt); this.lights(dt); this.downwash(dt); this.sound(dt); this.spotPolice(dt);
  }
  // ------------------------------------------------------------------ pilot + flight dynamics
  target() { const P = this.g.player; const v = P.vehicle; return v ? { x: v.x, z: v.z, vx: Math.sin(v.yaw) * v.speed, vz: Math.cos(v.yaw) * v.speed, y: v.y || 0 } : { x: P.x, z: P.z, vx: Math.sin(P.yaw || 0) * (P.speed || 0), vz: Math.cos(P.yaw || 0) * (P.speed || 0), y: P.y || 0 }; }
  fly(dt) {
    const p = this.p, v = this.v, air = this.air; const vd = this._v.set(0, 0, 0); let yawD = this.yaw, faceK = 0; let gx = p.x, gz = p.z, alt = p.y, stopR = 0;
    const vh = Math.hypot(v.x, v.z);
    if (this.state === 'lift') { // straight up off the pad to a 10 m hover, then away
      gx = HELIPAD.x; gz = HELIPAD.z; alt = HELIPAD.y + 11; yawD = HELIPAD.yaw; if (p.y > HELIPAD.y + 9.5) this.state = 'fly';
    } else if (this.state === 'land') { // over the pad: square up, then a slow vertical descent, slowest in the last metres (ground cushion)
      gx = HELIPAD.x; gz = HELIPAD.z; yawD = HELIPAD.yaw; const hp = p.y - HELIPAD.y, off = Math.hypot(p.x - gx, p.z - gz);
      const vdn = hp > 14 ? -3.2 : hp > 4 ? -1.4 : -0.45; alt = null; vd.y = off < 2.5 && Math.abs(wrapA(this.yaw - yawD)) < 0.15 ? vdn : Math.min(0, (HELIPAD.y + Math.max(6, hp) - p.y) * 0.5);
      if (hp <= 0.03 && vd.y < 0) { p.y = HELIPAD.y; v.set(0, 0, 0); this.ay = 0; this.state = 'shutdown'; this.mission = null; this.stats.landings++; this.g.police?.note?.('Air Wing helicopter landed at Police HQ'); return; }
    } else if (this.mission === 'chase') {
      const T = this.target(); const ts = Math.hypot(T.vx, T.vz); const ground = air.top(T.x, T.z, 30);
      if (ts > 9) { // fast target (a car chase): trail it above and slightly behind, matching its speed
        const d = Math.hypot(T.vx, T.vz) || 1; gx = T.x - (T.vx / d) * 30 + T.vx * 1.5; gz = T.z - (T.vz / d) * 30 + T.vz * 1.5; vd.x = T.vx; vd.z = T.vz;
      } else { // orbit with the suspect on the right (observer / searchlight side), ~11 m/s round the circle
        const dT = Math.hypot(p.x - T.x, p.z - T.z); if (dT > ORBIT_R * 2.5) this.orbA = Math.atan2(p.x - T.x, p.z - T.z); else this.orbA -= (11 / ORBIT_R) * dt;
        gx = T.x + Math.sin(this.orbA) * ORBIT_R; gz = T.z + Math.cos(this.orbA) * ORBIT_R; const onRing = dT < ORBIT_R * 1.6 ? 1 : 0; vd.x = T.vx - 11 * Math.cos(this.orbA) * onRing; vd.z = T.vz + 11 * Math.sin(this.orbA) * onRing; // + the orbit point's own motion
        faceK = clamp(1 - (dT - ORBIT_R * 1.4) / (ORBIT_R * 1.5), 0, 1); yawD = Math.atan2(T.x - p.x, T.z - p.z) + Math.PI / 2;
      }
      alt = Math.max(ground + ORBIT_AGL, T.y + ORBIT_AGL);
    } else { // home: cruise to a point 35 m above the pad, then hand over to the landing
      gx = HELIPAD.x; gz = HELIPAD.z; const dP = Math.hypot(p.x - gx, p.z - gz); alt = dP > 250 ? Math.max(air.top(p.x, p.z, 40) + CRUISE_AGL * 0.6, HELIPAD.y + 45) : HELIPAD.y + 35; stopR = 0;
      if (dP < 80) yawD = HELIPAD.yaw;
      if (dP < 4 && vh < 1.5 && p.y < HELIPAD.y + 40) this.state = 'land';
    }
    // horizontal: brake to stop at the goal (v² = 2·a·d), capped at cruise speed
    { const dx = gx - p.x, dz = gz - p.z, d = Math.hypot(dx, dz); const vmax = Math.min(VMAX, Math.sqrt(2 * 1.9 * Math.max(0, d - stopR))); if (d > 0.05) { vd.x += (dx / d) * Math.min(vmax, d * 0.6); vd.z += (dz / d) * Math.min(vmax, d * 0.6); } }
    { const s = Math.hypot(vd.x, vd.z); if (s > VMAX) { vd.x *= VMAX / s; vd.z *= VMAX / s; } }
    // obstacle look-ahead: along the current velocity and the wanted one, over the rotor's reach + margin
    let req = -10; const R = HELI.rotorR + 4;
    for (const t of [0, 1, 2, 3.5, 5, 7]) { const sx = p.x + v.x * t, sz = p.z + v.z * t; req = Math.max(req, air.top(sx, sz, R)); }
    { const s = Math.hypot(vd.x, vd.z); if (s > 1) for (const d of [25, 50, 90]) req = Math.max(req, air.top(p.x + (vd.x / s) * d, p.z + (vd.z / s) * d, R)); }
    if (this.state === 'land' || this.state === 'lift') req = -10; // the pad and the air above it are known clear (the hard floor still applies)
    const safe = req + CLEAR; if (alt !== null) alt = Math.max(alt, safe);
    if (alt !== null) vd.y = clamp((alt - p.y) * 0.45, -5, 7);
    // too low for what is ahead: slow down until the climb is made (never fly into a face)
    if (alt !== null && safe - p.y > 4) { const k = clamp(1 - (safe - p.y - 4) / 26, 0.08, 1); vd.x *= k; vd.z *= k; }
    // heading: into the airflow at speed, the suspect on the right in a slow orbit, square to the pad when recovering
    const velYaw = vh > 3 ? Math.atan2(v.x, v.z) : this.yaw; const kv = clamp((vh - 9) / 12, 0, 1) * (1 - faceK * 0.85);
    const want = this.state === 'land' || this.state === 'lift' || (this.mission === 'home' && Math.hypot(p.x - HELIPAD.x, p.z - HELIPAD.z) < 80) ? yawD : faceK > 0 ? wrapA(yawD + wrapA(velYaw - yawD) * kv) : (vh > 3 ? velYaw : this.yaw);
    const err = wrapA(want - this.yaw); this.yawRate += clamp(err * 1.8 - this.yawRate * 1.9, -1.2, 1.2) * dt; this.yawRate = clamp(this.yawRate, -0.55, 0.55); this.yaw = wrapA(this.yaw + this.yawRate * dt);
    // wanted acceleration → attitude (thrust tilt), including the drag the thrust has to overcome
    let ax = (vd.x - v.x) / 1.7, az = (vd.z - v.z) / 1.7; const al = Math.hypot(ax, az); if (al > A_H) { ax *= A_H / al; az *= A_H / al; }
    const dgx = CD * vh * v.x, dgz = CD * vh * v.z; const hx = ax + dgx, hz = az + dgz;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw); // forward, right (model +x is left)
    const ayCmd = clamp((vd.y - v.y) / 0.9, -3, 3.5);
    const lift = G + this.ay; const pD = clamp(Math.atan2(hx * fx + hz * fz, lift), -0.33, 0.36), rD = clamp(Math.atan2(hx * rx + hz * rz, lift), -0.42, 0.42);
    const kA = 1 - Math.exp(-dt / 0.55), mr = 0.5 * dt; this.pitch += clamp((pD - this.pitch) * kA, -mr, mr); this.roll += clamp((rD - this.roll) * kA, -mr * 1.3, mr * 1.3);
    this.ay += (ayCmd - this.ay) * (1 - Math.exp(-dt / 0.35)); // collective → vertical acceleration lag
    // integrate: only the tilted thrust accelerates the airframe
    const tA = (G + this.ay), aF = tA * Math.tan(this.pitch), aR = tA * Math.tan(this.roll);
    const turb = (0.25 + 0.6 * clamp(1 - (p.y - air.top(p.x, p.z, 4)) / 14, 0, 1)) * (0.6 + ((this.g.atmos && this.g.atmos.w && this.g.atmos.w.wind) || 0.3)); // gusts; ground-effect wobble near the surface
    const nx = (Math.sin(this.t * 1.31) + Math.sin(this.t * 2.77 + 1.2) * 0.6) * turb * 0.35, nz = (Math.sin(this.t * 1.13 + 2.1) + Math.sin(this.t * 3.1) * 0.5) * turb * 0.35, ny = Math.sin(this.t * 1.9 + 0.7) * turb * 0.25;
    v.x += (aF * fx + aR * rx - dgx + nx) * dt; v.z += (aF * fz + aR * rz - dgz + nz) * dt; v.y += (this.ay + ny - v.y * 0.08) * dt;
    p.addScaledVector(v, dt);
    // hard floor: nothing under the rotor disc may be above the skids (the airframe can't enter buildings / objects)
    const floor = air.top(p.x, p.z, HELI.rotorR + 0.3) + (this.state === 'land' ? 0 : 0.25); const isPad = Math.hypot(p.x - HELIPAD.x, p.z - HELIPAD.z) < 2.5;
    const fl = isPad ? HELIPAD.y : floor; // on the pad itself the deck is the floor (its 7.6 m circle is clear of every roof fixture)
    if (p.y < fl) { p.y = fl; if (v.y < 0) v.y = 0; if (!isPad || this.state !== 'land') this.stats.floorHits++; }
    if (this.state === 'fly') this.stats.minClear = Math.min(this.stats.minClear, p.y - floor);
  }
  place() { const G0 = this.M.group; G0.position.copy(this.p); G0.rotation.set(this.pitch, this.yaw, this.roll); G0.updateMatrixWorld(true); }
  // ------------------------------------------------------------------ visuals
  pose(dt) {
    const M = this.M; this.place();
    const om = this.rpm * 2 * Math.PI * 6.1; M.rotor.rotation.y -= om * dt; M.tailBlades.rotation.x += om * 5.2 * dt; // main rotor ~366 rpm, tail ~5.2×
    const cone = -0.03 + 0.085 * this.rpm * this.rpm * (this.state === 'fly' || this.state === 'lift' || this.state === 'land' ? 1 + this.ay / 20 : 0.6); for (const b of M.blades) b.rotation.z = cone; // blades droop at rest, cone up under thrust
    const blur = clamp((this.rpm - 0.3) / 0.5, 0, 1); M.disc.visible = blur > 0.02; M.discMat.opacity = 0.16 * blur; const td = M.tail.userData.disc; td.visible = blur > 0.02; M.tailBlades.visible = this.rpm < 0.55;
    M.crew.visible = this.state !== 'parked' || this.rpm > 0;
  }
  lights(dt) {
    const L_ = this.M.lamps, A = this.g.atmos, night = A ? A.night : 0, on = this.state !== 'parked' || this.rpm > 0.02;
    const t = this.t; const flash = (hz, ph = 0, w = 0.08) => ((t * hz + ph) % 1) < w;
    L_.navR.material.emissiveIntensity = on ? 1.2 + 2 * night : 0; L_.navG.material.emissiveIntensity = on ? 1.2 + 2 * night : 0; L_.tail.material.emissiveIntensity = on ? 0.8 + 2 * night : 0;
    L_.beacon.material.emissiveIntensity = on && flash(1.0) ? 9 : on ? 0.1 : 0; L_.belly.material.emissiveIntensity = on && flash(1.0, 0.5) ? 8 : on ? 0.1 : 0;
    if (on) bloomHotAt(this.p.x, this.p.y + 1.5, this.p.z, 0.3); // the beacon / strobes bloom like the cars' (only when near and in view)
    const blue = on && this.mission === 'chase'; L_.strobe.material.emissiveIntensity = blue && (flash(1.6, 0, 0.06) || flash(1.6, 0.12, 0.06)) ? 10 : blue ? 0.2 : 0;
    // searchlight: night + 5★ chase (or a console call at night) — on the suspect, with the operator's slight hand wobble
    const stars = this.g.police && this.g.police.stars ? this.g.police.stars() : 0;
    const want = this.mission === 'chase' && (this.state === 'fly') && night > 0.4 && (stars >= 5 || this.forced) ? 1 : 0;
    this.light += clamp(want - this.light, -dt * 2, dt * 0.7);
    const T = this.target(); const wob = 0.6; const tx = T.x + T.vx * 0.35 + Math.sin(t * 0.9) * wob, tz = T.z + T.vz * 0.35 + Math.cos(t * 0.7) * wob, ty = (T.y || 0) + 0.6;
    this.aim.x += (tx - this.aim.x) * Math.min(1, dt * 3.5); this.aim.z += (tz - this.aim.z) * Math.min(1, dt * 3.5); this.aim.y = ty;
    const M = this.M; const lens = M.light.userData.lens; const lp = lens.getWorldPosition(this._lens);
    // gimbal: yaw then pitch in the airframe's frame toward the aim point
    if (this.light > 0.001 || this.state === 'fly') {
      this._m.copy(M.group.matrixWorld).invert(); const q = this._q.copy(this.aim).applyMatrix4(this._m); const lx = q.x - M.light.position.x, ly = q.y - M.light.position.y, lz = q.z - M.light.position.z;
      const yawL = Math.atan2(lx, lz), pitL = Math.atan2(-ly, Math.hypot(lx, lz)); M.light.rotation.y = clamp(yawL, -2.4, 2.4); M.lightPitch.rotation.x = clamp(pitL, -0.2, 1.45);
    } else { M.light.rotation.y *= 0.95; M.lightPitch.rotation.x *= 0.95; }
    lens.material.emissiveIntensity = 0.2 + this.light * 14;
    const s = this.spot; const k = this.light;
    if (k > 0.002) {
      const dx = this.aim.x - lp.x, dy = this.aim.y - lp.y, dz = this.aim.z - lp.z, d = Math.hypot(dx, dy, dz) || 1;
      s.position.copy(lp); s.target.position.copy(this.aim); s.target.updateMatrixWorld(); s.distance = d + 60; s.intensity = k * 3.4 * d * d; s.angle = 0.075 + 0.02 * Math.sin(t * 0.21) ** 2;
      const b = this.beam; b.visible = true; b.position.copy(lp); b.lookAt(this.aim); const r = Math.tan(s.angle * 0.8) * d; b.scale.set(r, r, d + 1);
      const rain = A && A.w ? A.w.rain : 0; this.beamMat.uniforms.opacity.value = k * (0.05 + 0.1 * rain) * night;
    } else { if (s.intensity !== 0) s.intensity = 0; this.beam.visible = false; }
  }
  // ------------------------------------------------------------------ downwash on the world
  downwash(dt) {
    const g = this.g, p = this.p, rpmK = this.rpm * this.rpm; const flying = this.state === 'lift' || this.state === 'fly' || this.state === 'land';
    const thrust = flying ? rpmK * clamp(1 + this.ay / G, 0.6, 1.4) : rpmK * 0.25; // idling on the pad: a fraction (flat pitch)
    const ground = this.air.top(p.x, p.z, 0); const agl = p.y - ground; const cam = g.camera ? g.camera.position : p;
    const near = Math.hypot(cam.x - p.x, cam.z - p.z) < 260 && agl < 48;
    const hub = this.M.rotor.getWorldPosition(this._q); heliWash.value[0] = hub.x; heliWash.value[1] = hub.y; heliWash.value[2] = hub.z; heliWash.value[3] = this.washW = near ? thrust : 0;
    if (!near || thrust < 0.05) return;
    const k = thrust * clamp(1 - agl / 30, 0, 1); if (k < 0.02) return;
    // dust / spray ring rolling out from under the rotor (ground level under the helicopter: the street, a lawn, a roof, water)
    const vs = g.vsmoke; if (vs && vs.emit) { this.dustAcc = (this.dustAcc || 0) + dt * 26 * k; const water = L.isWater(p.x, p.z) && agl < 25;
      while (this.dustAcc >= 1) { this.dustAcc -= 1; const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * (4 + agl * 0.35); const x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r; const gy = Math.max(this.air.top(x, z, 0), L.surfaceY(x, z));
        if (gy > p.y - 1) continue; const out = (5 + Math.random() * 6) * (0.4 + 0.6 * k);
        vs.emit(x, gy + 0.25, z, Math.sin(a) * out, 0.3 + Math.random() * 0.5, Math.cos(a) * out, vs.t, 2.2 + Math.random() * 1.6, 0.9, 3.2 + Math.random() * 1.5, 5, 0.05, 0.9, water ? 0.86 : 0.62 + Math.random() * 0.08, (water ? 0.22 : 0.3) * k, gy); }
      vs.stats && (vs.stats.heli = (vs.stats.heli || 0) + 1); }
    // people under it: pushed outward by the blast, they shield their faces / back off; a low hover makes a crowd scatter
    this.pedT = (this.pedT || 0) - dt; const C = g.crowd;
    if (C && C.peds && this.pedT <= 0) { this.pedT = 0.12; const R = 7 + agl * 0.45; const r2 = R * R;
      for (const q of C.peds) { if (q.dead || q.state === 'down') continue; const dx = q.x - p.x, dz = q.z - p.z, d2 = dx * dx + dz * dz; if (d2 > r2) continue; const d = Math.sqrt(d2) || 0.1; const f = k * (1 - d / R);
        q.vx = (q.vx || 0) + (dx / d) * f * 2.6; q.vz = (q.vz || 0) + (dz / d) * f * 2.6; // staggered by the blast
        if (f > 0.15 && q.state !== 'cower' && q.state !== 'flee' && C.react && !(this.t < (q.heliT || 0))) { q.heliT = this.t + 8; const cower = Math.random() < 0.45 && f > 0.3; C.react(q, cower ? 'cower' : 'flee', cower ? 1.5 + Math.random() * 1.5 : 3 + Math.random() * 2, cower ? {} : { fleeDir: [dx / d, dz / d], fleeSp: 3.2 + Math.random() }); }
      } }
    // the player: buffeted on foot right under a low hover
    const P = g.player; if (P && !P.vehicle && !g.indoor) { const dx = P.x - p.x, dz = P.z - p.z, d = Math.hypot(dx, dz); const R = 6 + agl * 0.4; if (d < R && agl < 22 && g.collision) { const f = k * (1 - d / R) * 1.4 * dt; const r = g.collision.resolveCircle(P.x + (dx / (d || 1)) * f, P.z + (dz / (d || 1)) * f, 0.35, P.y || 0); if (r) { P.x = r.x; P.z = r.z; } } }
  }
  // ------------------------------------------------------------------ air support: the crew keeps eyes on the suspect
  spotPolice(dt) {
    const P = this.g.police; if (!P || this.mission !== 'chase' || this.state !== 'fly' || this.g.indoor) return; this.seeT = (this.seeT || 0) - dt; if (this.seeT > 0) return; this.seeT = 0.25;
    const T = this.target(); const d = Math.hypot(T.x - this.p.x, T.z - this.p.z); const night = this.g.atmos ? this.g.atmos.night : 0;
    const range = night > 0.5 ? (this.light > 0.5 ? 200 : 70) : 210; if (d > range || !(P.level > 0)) return;
    const c = this.g.collision; const t = c ? c.raycast(this.p.x, this.p.y + 0.6, this.p.z, T.x, (T.y || 0) + 1.2, T.z, 0.05, false, 2.2) : 1;
    if (t >= 0.999 && P.spotted) { P.spotted(); this.stats.sightings = (this.stats.sightings || 0) + 1; }
  }
  // ------------------------------------------------------------------ sound
  sound() {
    if (!Audio.ready || !Audio.ctx) return; const c = Audio.ctx; let S = this.snd;
    if (!S) { const bus = (Audio.bus && Audio.bus.sfx) || c.destination;
      const src = c.createBufferSource(); src.buffer = Audio.noiseBuf; src.loop = true; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260; bp.Q.value = 0.7; // blade slap: noise chopped at the blade-passage rate
      const slap = c.createGain(); slap.gain.value = 0.25; const lfo = c.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 0; const sh = c.createWaveShaper(); const cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 255; cv[i] = Math.pow(x, 6) * 1.6; } sh.curve = cv; const lg = c.createGain(); lg.gain.value = 1;
      lfo.connect(sh); sh.connect(lg); lg.connect(slap.gain); src.connect(bp); bp.connect(slap);
      const rum = c.createBufferSource(); rum.buffer = Audio.brownBuf || Audio.noiseBuf; rum.loop = true; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; const rg = c.createGain(); rg.gain.value = 0.5; rum.connect(lp); lp.connect(rg);
      const tur = c.createOscillator(); tur.type = 'sawtooth'; tur.frequency.value = 0; const tb = c.createBiquadFilter(); tb.type = 'bandpass'; tb.frequency.value = 3200; tb.Q.value = 9; const tg = c.createGain(); tg.gain.value = 0.035; tur.connect(tb); tb.connect(tg);
      const og = c.createGain(); og.gain.value = 1; slap.connect(og); rg.connect(og); tg.connect(og);
      const dist = c.createBiquadFilter(); dist.type = 'lowpass'; dist.frequency.value = 6000; const gn = c.createGain(); gn.gain.value = 0; const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      og.connect(dist); dist.connect(gn); if (pan) { gn.connect(pan); pan.connect(bus); } else gn.connect(bus);
      src.start(); rum.start(); lfo.start(); tur.start(); S = this.snd = { lfo, tur, tb, dist, gn, og, pan, rec: false };
    }
    const now = c.currentTime; const [gg, pp] = Audio.spatial(this.p.x, this.p.z, 320); const d = Math.hypot(this.p.x - (Audio.listener ? Audio.listener.x : this.p.x), this.p.z - (Audio.listener ? Audio.listener.z : this.p.z));
    const gain = this.rpm < 0.01 ? 0 : 0.55 * gg * Math.min(1, this.rpm * 1.4) * (this.g.indoor ? 0.35 : 1);
    S.lfo.frequency.setTargetAtTime(this.rpm * 4 * 6.1 * (1 + this.ay * 0.01), now, 0.1); S.tur.frequency.setTargetAtTime(500 + this.rpm * 1150, now, 0.2); S.tb.frequency.setTargetAtTime(1800 + this.rpm * 2600, now, 0.2);
    S.dist.frequency.setTargetAtTime(Math.max(700, 9000 / (1 + d / 60)), now, 0.2); S.gn.gain.setTargetAtTime(gain, now, 0.15); if (S.pan) S.pan.pan.setTargetAtTime(pp, now, 0.1);
    const smp = SoundBank.syncLoop(S, 'heli.rotor', S.gn); const rec = !!smp; if (smp && smp.src && smp.src.playbackRate) smp.src.playbackRate.setTargetAtTime(Math.max(0.3, this.rpm), now, 0.2);
    if (rec !== S.rec) { S.rec = rec; S.og.gain.setTargetAtTime(rec ? 0 : 1, now, 0.05); } // the player's recording replaces the synthesised rotor
  }
}
