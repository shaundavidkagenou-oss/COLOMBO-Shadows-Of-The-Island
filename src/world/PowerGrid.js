// 79th request — the city's electricity: a lightweight, event-driven model (no electrical engineering).
//
//   substations (3) ─ feeders ─ districts (Layout's 15 district rectangles = supply zones) ─ consumers
//   consumers: street lamps (World's pooled spot lights + every lamp head / ground pool / halo through the shader), traffic
//   signals (Props.updateSignals, Traffic, Crowd, filling stations), illuminated signs, shop fronts, facade / room lights
//   (InteriorMapping), and emergency facilities on backup generators (the National Hospital, the police headquarters).
//
// State lives in one small array: the supply level (0…1) of each zone, smoothed only while something is changing. A fault
// (an explosion beside a pole transformer, a lightning strike in a storm, a substation trip, a scheduled load-shedding slot,
// or the dev console) sets a zone's TARGET; update() moves the levels toward their targets — dropping in a few frames, coming
// back with a staggered, flickering restart — and touches nothing at all while every zone is steady (no per-frame work over
// lamps, signs or buildings). The levels are uploaded as one uniform array (POWER_U) read by the powered materials per pixel
// through a 4 m district lookup texture, so a whole district's lamps, signs and windows go dark at once without the CPU
// visiting a single object; CPU consumers (the ~dozen pooled lamp lights, signals, traffic AI) ask levelAt(x, z).
import * as THREE from 'three';
import { BOUNDS, ZONES } from './Layout.js';

// district rectangles: the same first-match list as Layout.districtIdAt (kept in sync by the test)
export const POWER_RECTS = [
  ['port', -600, 230, -1400, -1000], ['kotahena', 230, 1000, -1400, -960], ['gfgreen', -600, -409, -660, -240], ['fort', -600, -160, -1000, -640],
  ['pettah', -160, 230, -1000, -640], ['maradana', 230, 1000, -960, -300], ['gftowers', -409, -250, -660, -240], ['beira', -250, 230, -640, -240],
  ['slave', -250, 0, -240, 40], ['kollupitiya', -600, -250, -240, 400], ['cinnamon', 0, 600, -300, 700], ['cinnamon', -250, 0, 40, 700],
  ['borella', 600, 1000, -300, 700], ['bambalapitiya', -600, -250, 400, 950], ['wellawatte', -600, 100, 950, 1500], ['havelock', -250, 1000, 700, 1500],
];
export const ZONE_IDS = [...new Set(POWER_RECTS.map((r) => r[0]))]; // 15 supply zones
// emergency sites on their own backup generators: [zone slot name, Layout zone id]
export const BACKUP_SITES = [['hospital', 'hospital'], ['policeHQ', 'slpHQ']];
export const SLOTS = ZONE_IDS.concat(BACKUP_SITES.map((b) => b[0])); // uniform slots: 15 zones + 2 backup sites
const NSLOT = 20; // (uniform array size, ≥ SLOTS.length)
// substations → the zones they feed (a substation trip takes several districts out together)
export const SUBSTATIONS = {
  north: { name: 'North grid substation', zones: ['port', 'kotahena', 'fort', 'pettah', 'maradana'] },
  central: { name: 'Central grid substation', zones: ['gfgreen', 'gftowers', 'beira', 'slave', 'kollupitiya', 'cinnamon'] },
  south: { name: 'South grid substation', zones: ['borella', 'bambalapitiya', 'wellawatte', 'havelock'] },
};
export const POWER_CFG = { dropRate: 6, restoreRate: 0.9, restoreStagger: 1.6, flicker: true, genDelay: 9, genLevel: 0.85, blastRadius: 7, blastOutage: [90, 180],
  stormFaultPerMin: 0.05, stormOutage: [60, 150], shedChancePerNight: 0.3, shedLen: 1.0, shedStart: [19.0, 22.5] };

// ------------------------------------------------------------------------------------------------ GPU side (uniforms + LUT)
const CELL = 4, X0 = BOUNDS.minX - 40, Z0 = BOUNDS.minZ - 40, NX = Math.ceil((BOUNDS.maxX + 40 - X0) / CELL), NZ = Math.ceil((BOUNDS.maxZ + 40 - Z0) / CELL);
const LUT = new Uint8Array(NX * NZ);
function slotAt(x, z) {
  for (const [site, zid] of BACKUP_SITES) { const zn = ZONES.find((q) => q.id === zid); if (zn) { const [a, b, c, d] = zn.rect; if (x >= a && x < b && z >= c && z < d) return SLOTS.indexOf(site); } }
  for (const [id, x0, x1, z0, z1] of POWER_RECTS) if (x >= x0 && x < x1 && z >= z0 && z < z1) return ZONE_IDS.indexOf(id);
  return ZONE_IDS.indexOf('havelock');
}
for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) LUT[k * NX + i] = slotAt(X0 + (i + 0.5) * CELL, Z0 + (k + 0.5) * CELL);
export const powerLUT = new THREE.DataTexture(LUT, NX, NZ, THREE.RedFormat, THREE.UnsignedByteType);
powerLUT.magFilter = THREE.NearestFilter; powerLUT.minFilter = THREE.NearestFilter; powerLUT.generateMipmaps = false; powerLUT.colorSpace = THREE.NoColorSpace; powerLUT.needsUpdate = true; powerLUT.name = 'powerLUT';
// shared by reference into every material's cloned uniforms (typed arrays are not deep-copied by three)
export const POWER_LVL = new Float32Array(NSLOT).fill(1);
export const POWER_P = new Float32Array([0, 0, 0, 0]); // [night (how much electric light matters), -, -, -]
const POWER_O = new Float32Array([X0, Z0, 1 / CELL, 0]), POWER_S = new Float32Array([NX, NZ, 0, 0]);
{ const S = THREE.ShaderChunk, L = THREE.ShaderLib;
  // declarations in <common> (vertex + fragment), only compiled into the powered materials (defines)
  const DECL = `
#if defined( POWERED ) || defined( POWERED_BASIC )
uniform sampler2D uPwLUT; uniform float uPwLvl[ ${NSLOT} ]; uniform vec4 uPwP, uPwO, uPwS;
float pwAt( vec3 w ) { ivec2 c = clamp( ivec2( floor( ( w.xz - uPwO.xy ) * uPwO.z ) ), ivec2( 0 ), ivec2( uPwS.xy ) - 1 ); int s = int( texelFetch( uPwLUT, c, 0 ).r * 255.0 + 0.5 );
  return mix( 1.0, uPwLvl[ s ], uPwP.x ); }
#endif
#ifdef POWERED_BASIC
varying vec3 vPwW;
#endif
`;
  if (!S.common.includes('pwAt(')) S.common = S.common + DECL;
  // lit materials (standard / lambert / phong): the emissive light, after every emissive patch (InteriorMapping's rooms etc.)
  if (!S.lights_fragment_end.includes('pwW')) S.lights_fragment_end = S.lights_fragment_end + `
#ifdef POWERED
{ vec3 pwW = cameraPosition + ( vec4( -vViewPosition, 0.0 ) * viewMatrix ).xyz; totalEmissiveRadiance *= pwAt( pwW ); }
#endif
`;
  // unlit additive glows (MeshBasic ground pools / halos, PointsMaterial lamp glows): a world-position varying + the fade
  if (!S.project_vertex.includes('vPwW')) S.project_vertex = S.project_vertex + `
#ifdef POWERED_BASIC
{ vec4 pw4 = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  pw4 = batchingMatrix * pw4;
#endif
#ifdef USE_INSTANCING
  pw4 = instanceMatrix * pw4;
#endif
  vPwW = ( modelMatrix * pw4 ).xyz; }
#endif
`;
  if (!S.opaque_fragment.includes('pwk')) S.opaque_fragment = `
#ifdef POWERED_BASIC
{ float pwk = pwAt( vPwW ); outgoingLight *= pwk; diffuseColor.a *= pwk; }
#endif
` + S.opaque_fragment;
  const U = { uPwLUT: { value: powerLUT }, uPwLvl: { value: POWER_LVL }, uPwP: { value: POWER_P }, uPwO: { value: POWER_O }, uPwS: { value: POWER_S } };
  for (const k of ['standard', 'physical', 'lambert', 'phong', 'toon', 'basic', 'points']) if (L[k]) Object.assign(L[k].uniforms, U);
}
// mark a material as grid-powered (its emission / glow follows the supply of the district it is drawn in)
export function powerMaterial(m, basic = false) {
  if (!m || (m.defines && ('POWERED' in m.defines || 'POWERED_BASIC' in m.defines))) return m; m.defines = { ...(m.defines || {}), [basic ? 'POWERED_BASIC' : 'POWERED']: '' }; m.userData.powered = true; m.needsUpdate = true; return m;
}

// ------------------------------------------------------------------------------------------------------------- the model
export class PowerGrid {
  constructor(game = null) {
    this.g = game; this.n = SLOTS.length; this.level = POWER_LVL; this.target = new Float32Array(this.n).fill(1); this.cause = new Array(this.n).fill(null);
    this.raw = new Float32Array(this.n).fill(1); this.until = new Float64Array(this.n); this.delay = new Float32Array(this.n); this.flick = new Float32Array(this.n); this.gen = new Float32Array(this.n); // restore stagger, flicker phase, generator timer
    this.active = false; this.t = 0; this.clock = 0; this.events = []; this.listeners = new Set(); this.lastNight = -1; this.shed = null; this.shedDay = -1; this.stats = { outages: 0, restores: 0, updates: 0 };
    this.rng = 12345; this.strikes = 0;
  }
  rand() { this.rng = (this.rng * 16807) % 2147483647; return this.rng / 2147483647; }
  slot(id) { return SLOTS.indexOf(id); }
  zoneAt(x, z) { return SLOTS[this.slotAt(x, z)]; }
  slotAt(x, z) { const i = Math.floor((x - X0) / CELL), k = Math.floor((z - Z0) / CELL); if (i < 0 || k < 0 || i >= NX || k >= NZ) return ZONE_IDS.indexOf('havelock'); return LUT[k * NX + i]; }
  get dim() { if (this.active) return true; for (let s = 0; s < this.n; s++) if (this.level[s] < 1) return true; return false; } // anything not at full supply (consumers skip all lookups otherwise)
  levelAt(x, z) { return this.level[this.slotAt(x, z)]; }
  isOn(x, z) { return this.level[this.slotAt(x, z)] > 0.5; }
  powered(id) { const s = this.slot(id); return s < 0 ? true : this.level[s] > 0.5; }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { this.events.push(ev); if (this.events.length > 40) this.events.shift(); for (const fn of this.listeners) { try { fn(ev); } catch (e) { console.warn('power listener', e); } } }
  // ---- faults (the events that drive everything)
  cut(id, seconds = 120, cause = 'fault') { const s = this.slot(id); if (s < 0 || s >= ZONE_IDS.length) return false;
    const was = this.target[s] > 0.5; this.target[s] = 0; this.cause[s] = cause; this.until[s] = this.clock + seconds; this.active = true;
    for (const [site, zid] of BACKUP_SITES) { const b = this.slot(site); if (ZONE_IDS[s] === this.siteZone(zid)) { this.target[b] = 0; this.gen[b] = POWER_CFG.genDelay; this.cause[b] = cause; } } // the site's mains drop with its district; its generator starts after genDelay
    if (was) { this.stats.outages++; this.emit({ type: 'outage', zone: id, cause, seconds }); } return true; }
  restore(id) { const s = this.slot(id); if (s < 0) return false; if (this.target[s] > 0.5 && this.level[s] > 0.99) return false; this.target[s] = 1; this.until[s] = 0; this.delay[s] = this.rand() * POWER_CFG.restoreStagger; this.flick[s] = 0; this.active = true;
    for (const [site, zid] of BACKUP_SITES) { const b = this.slot(site); if (ZONE_IDS[s] === this.siteZone(zid)) { this.target[b] = 1; this.gen[b] = 0; } }
    this.stats.restores++; this.emit({ type: 'restore', zone: id, cause: this.cause[s] }); this.cause[s] = null; return true; }
  tripSubstation(key, seconds = 150) { const S = SUBSTATIONS[key]; if (!S) return false; for (const z of S.zones) this.cut(z, seconds * (0.85 + 0.3 * this.rand()), 'substation'); this.emit({ type: 'substation', name: S.name, seconds }); return true; }
  settle() { for (let s = 0; s < this.n; s++) { if (this.gen[s] > 0) { this.gen[s] = 0; this.target[s] = POWER_CFG.genLevel; } this.raw[s] = this.level[s] = this.target[s]; this.delay[s] = 0; } this.active = false; if (this.onSettled) this.onSettled(); }
  zones() { return ZONE_IDS.slice(); }
  restoreAll() { for (const id of ZONE_IDS) this.restore(id); }
  siteZone(zid) { const zn = ZONES.find((q) => q.id === zid); if (!zn) return null; const [a, b, c, d] = zn.rect; const x = (a + b) / 2, z = (c + d) / 2; for (const [id, x0, x1, z0, z1] of POWER_RECTS) if (x >= x0 && x < x1 && z >= z0 && z < z1) return id; return 'havelock'; }
  // an explosion next to a pole transformer takes its district down (the transformers are the poles' own plan flag)
  onBlast(x, z, poles) { const R = POWER_CFG.blastRadius; let hit = null; for (const p of poles || []) { if (!p.transformer) continue; if (Math.abs(p.x - x) < R && Math.abs(p.z - z) < R && Math.hypot(p.x - x, p.z - z) < R) { hit = p; break; } }
    if (!hit) return false; const id = this.zoneAt(hit.x, hit.z); const [a, b] = POWER_CFG.blastOutage; return this.cut(id, a + (b - a) * this.rand(), 'transformer'); }
  // ---- per frame: cheap scheduling checks (twice a second) + level smoothing only while a transition runs
  update(dt, { night = 0, hour = 12, day = 1, storm = 0, strikes = 0 } = {}) {
    this.clock += dt; this.t += dt; const C = POWER_CFG;
    if (Math.abs(night - this.lastNight) > 0.004) { this.lastNight = night; POWER_P[0] = Math.min(1, night * 1.6); } // electric light only matters as it gets dark (by day the shaders skip it)
    if (this.t >= 0.5) { const step = this.t; this.t = 0;
      for (let s = 0; s < ZONE_IDS.length; s++) if (this.target[s] < 0.5 && this.until[s] > 0 && this.clock >= this.until[s]) this.restore(ZONE_IDS[s]);
      const lightning = strikes > this.strikes; this.strikes = strikes; // (a new strike since the last check: Atmosphere counts them)
      if (storm > 0.85 && lightning && this.rand() < 0.25) { const id = ZONE_IDS[Math.floor(this.rand() * ZONE_IDS.length)]; const [a, b] = C.stormOutage; if (this.target[this.slot(id)] > 0.5) this.cut(id, a + (b - a) * this.rand(), 'lightning'); }
      else if (storm > 0.85 && this.rand() < C.stormFaultPerMin * step / 60) { const id = ZONE_IDS[Math.floor(this.rand() * ZONE_IDS.length)]; const [a, b] = C.stormOutage; this.cut(id, a + (b - a) * this.rand(), 'storm'); }
      this.loadShedding(hour, day); }
    if (!this.active) return false;
    let busy = false; const L = this.level, R = this.raw;
    for (let s = 0; s < this.n; s++) { const tg = this.target[s];
      if (this.gen[s] > 0) { this.gen[s] -= dt; busy = true; if (this.gen[s] <= 0) { this.gen[s] = 0; this.target[s] = C.genLevel; this.delay[s] = 0; this.flick[s] = 0; this.emit({ type: 'generator', site: SLOTS[s] }); } }
      if (R[s] === tg && L[s] === tg) continue; busy = true;
      if (tg < R[s]) { R[s] = Math.max(tg, R[s] - C.dropRate * dt); L[s] = R[s]; continue; } // drops at once (a fraction of a second)
      if (this.delay[s] > 0) { this.delay[s] -= dt; L[s] = R[s]; continue; } // staggered restart: districts / sites do not all come back in the same frame
      this.flick[s] += dt; R[s] = Math.min(tg, R[s] + C.restoreRate * dt);
      const f = C.flicker && this.flick[s] < 0.9 ? (Math.sin(this.flick[s] * 37 + s) > 0.15 ? 1 : 0.3) : 1; // a moment of flicker as the supply comes back, then the ramp
      L[s] = R[s] * f; if (R[s] === tg && f === 1) L[s] = tg; }
    this.stats.updates++; if (!busy) { this.active = false; if (this.onSettled) this.onSettled(); } return true;
  }
  // a scheduled load-shedding slot some evenings (one district, an hour) — announced on the phone / HUD through onChange
  loadShedding(hour, day) {
    const C = POWER_CFG; if (this.shedDay !== day) { this.shedDay = day; this.shed = this.rand() < C.shedChancePerNight ? { zone: ZONE_IDS[Math.floor(this.rand() * ZONE_IDS.length)], start: C.shedStart[0] + this.rand() * (C.shedStart[1] - C.shedStart[0]), done: false } : null; }
    const sh = this.shed; if (!sh || sh.done) return; if (hour >= sh.start && hour < sh.start + C.shedLen) { const s = this.slot(sh.zone); if (this.target[s] > 0.5) this.cut(sh.zone, 1e6, 'loadshedding'); }
    else if (hour >= sh.start + C.shedLen || (hour < sh.start - 12)) { const s = this.slot(sh.zone); if (this.cause[s] === 'loadshedding') this.restore(sh.zone); if (hour >= sh.start + C.shedLen) sh.done = true; }
  }
  outages() { const out = []; for (let s = 0; s < ZONE_IDS.length; s++) if (this.target[s] < 0.5) out.push({ zone: ZONE_IDS[s], cause: this.cause[s], left: this.until[s] > 1e5 ? null : Math.max(0, this.until[s] - this.clock) }); return out; }
  serialize() { return { out: this.outages().filter((o) => o.cause !== 'loadshedding').map((o) => [o.zone, o.left ?? 60, o.cause]) }; }
  restoreState(s) { if (!s || !Array.isArray(s.out)) return; for (const [z, left, cause] of s.out) { this.cut(z, left, cause || 'fault'); const k = this.slot(z); this.level[k] = 0; this.raw[k] = 0; } }
}
// the grid of the running game (Game sets it); CPU consumers use these helpers so they work when no grid exists (tests, tools)
export const GRID = { cur: null };
export function powerAt(x, z) { const g = GRID.cur; return g ? g.levelAt(x, z) : 1; }
export function signalPowered(node) { const g = GRID.cur; return !g || g.levelAt(node.x, node.z) > 0.5; }
// main-road junctions carry a battery backup: in an outage they flash amber; the rest go dark (both are all-way stops)
export function signalBackup(node) { return !!node.segs && node.segs.some((s) => s.level === 0); }
