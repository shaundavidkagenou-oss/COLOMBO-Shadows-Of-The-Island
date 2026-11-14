// Vehicle smoke: tyre smoke and exhaust, as GPU billboards in ONE draw call with a fixed pool allocated at load.
//   tyre smoke — thick, pale grey-white rubber smoke rolling off the tyre contact patches: hard launches (wheelspin), handbrake
//                slides and burnouts, cars sliding sideways (drifts, PIT spins, crashes shoving a car across the road), locked
//                fronts under very hard braking. It is born at the contact patch with a share of the car's velocity, brakes hard
//                in the air, swells, rises slowly, drifts downwind and lingers for a few seconds. Wet roads (rain) barely smoke.
//   exhaust    — from each model's real tail pipe (VehicleDetail.js sets userData.exhaust): buses and lorries puff sooty grey-black
//                diesel clouds when they pull away and a thin grey haze at idle; three-wheelers a bluish-grey haze; motorcycles a
//                light wisp; petrol cars only a faint whitish wisp under hard acceleration (more visible in rain / humid air);
//                damaged vehicles smoke darker, and a badly damaged one smokes from under the bonnet.
// Cost: one instanced draw (fixed pool, nothing allocated per frame), partial buffer uploads of only the slots written this frame,
// CPU work only for vehicles within ~70 m of the camera, a per-frame emission budget, and slower emission for far vehicles.
// The shading reuses the explosions' sun / ambient / wind uniforms and their pre-baked noise texture (no new textures, no lights).
import * as THREE from 'three';
import { LIVE_VEHICLES } from '../vehicles/Vehicle.js';
import { SkidMarks } from './SkidMarks.js';

export const SMOKE_POOL = 1152;
export const KIND = { TYRE: 0, EXHAUST: 1, DIESEL: 2, TWO_STROKE: 3, ENGINE: 4, TYRE_HAZE: 5 };
const R_FAR = 70, R_NEAR = 30;

// Street Customs: a tyre-smoke colour packed into the per-puff grey value (≥ 2 = RGB565 code; plain smoke stays 0..1)
const smokeCodes = new Map();
function smokeCode(hex) { let c = smokeCodes.get(hex); if (c !== undefined) return c; const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; c = 2 + (((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)) / 65536; smokeCodes.set(hex, c); return c; }
const VS = `
attribute vec3 aP0; attribute vec3 aV; attribute vec4 aT; attribute vec4 aR; attribute vec3 aC;
uniform float uTime; uniform vec3 uWind;
varying vec2 vUv; varying float vK; varying float vSeed; varying float vKind; varying float vFade; varying float vAge; varying vec2 vGA; varying vec2 vUp;
void main() {
  float age = uTime - aT.x; float k = age / aT.y;
  vUv = uv; vK = k; vSeed = aR.x; vKind = aR.y; vAge = age; vGA = aC.xy;
  if (k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float drag = aR.w; float dk = drag > 0.0 ? (1.0 - exp(-drag * age)) / drag : age;
  vec3 p = aP0 + aV * dk;                                                   // born with a share of the car's / gas velocity, braked by the air
  p.y += aR.z * age * age * 0.5 / (1.0 + age * 0.9);                        // warm smoke rises, easing off as it cools
  p += uWind * (0.32 * age * min(1.0, age * 0.8));                          // then drifts downwind
  float sw = aR.x * 40.0; p.x += sin(age * 1.3 + sw) * 0.14 * age; p.z += cos(age * 1.1 + sw * 0.7) * 0.14 * age;   // turbulence
  float sz = mix(aT.z, aT.w, 1.0 - pow(1.0 - k, 2.2));
  bool haze = aR.y > 4.5;                                                   // tyre haze: a low, wide bank of rubber smoke pooling on the road
  vec2 asp = haze ? vec2(1.75, 0.7) : vec2(1.0);
  p.y = max(p.y, aC.z + sz * asp.y * 0.36);                                 // rolls along the road, never through it
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float ang = haze ? (aR.x - 0.5) * 0.5 : aR.x * 6.2831 + age * (aR.x - 0.5) * 0.7;
  vec2 c = position.xy * asp; c = vec2(c.x * cos(ang) - c.y * sin(ang), c.x * sin(ang) + c.y * cos(ang));
  vUp = vec2(sin(ang), cos(ang));                                           // world-up in the puff's (rotated) uv frame: lit tops, shadowed bellies
  mv.xy += c * sz;
  vFade = clamp((-mv.z - 0.3) / 1.8, 0.0, 1.0);                            // thins out as it reaches the camera (no hard clip)
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D uNoise; uniform vec3 uSunV; uniform vec3 uSunC; uniform vec3 uAmb;
varying vec2 vUv; varying float vK; varying float vSeed; varying float vKind; varying float vFade; varying float vAge; varying vec2 vGA; varying vec2 vUp;
void main() {
  vec2 c = vUv - 0.5; float r = length(c) * 2.0;
  float n1 = texture2D(uNoise, vUv * 0.45 + vec2(vSeed * 5.3, vSeed * 7.9 - vAge * 0.07)).r;
  float n2 = texture2D(uNoise, vUv * 1.15 + vec2(vSeed * 8.7 + vAge * 0.04, vSeed * 2.3)).r;
  float n = n1 * 0.6 + n2 * 0.4;
  float shape = smoothstep(1.0, 0.22, r + (n - 0.5) * 1.1);
  if (shape < 0.004) discard;
  vec3 nrm = normalize(vec3(c * 2.0 + (vec2(n1, n2) - 0.5) * 0.85, 0.6));
  float lit = clamp(dot(nrm, uSunV) * 0.55 + 0.5, 0.0, 1.0);
  float scat = pow(max(0.0, -uSunV.z), 3.0) * (1.0 - n) * 0.45;            // thin smoke glows against the sun (forward scattering)
  vec3 base = vec3(vGA.x);
  if (vGA.x >= 2.0) { float pk = floor((vGA.x - 2.0) * 65536.0 + 0.5); base = pow(vec3(floor(pk / 2048.0) / 31.0, mod(floor(pk / 32.0), 64.0) / 63.0, mod(pk, 32.0) / 31.0), vec3(2.2)) * 0.95; } // Street Customs coloured tyre smoke (RGB565 in the grey slot)
  if (vKind > 2.5 && vKind < 3.5) base *= vec3(0.9, 0.97, 1.13);            // two-stroke oil haze is bluish
  vec3 col = base * (uAmb + uSunC * (lit + scat)) * (0.8 + 0.4 * n);
  if (vKind < 0.5 || vKind > 4.5) {                                         // rubber smoke is thick: self-shadowed belly + dense core, bright rim
    float up = dot(c, vUp) * 2.0;                                           // -1 bottom .. +1 top of the puff
    float dens = shape * vGA.y * (1.0 - vK * 0.6);
    col *= mix(1.0, 0.62 + 0.38 * smoothstep(-1.0, 0.8, up), clamp(dens * 1.6, 0.0, 1.0));
    col *= 1.0 - 0.22 * smoothstep(0.35, 0.0, r) * dens;                   // light dies inside the dense middle
    col += uSunC * base * 0.18 * smoothstep(0.55, 1.0, r) * (1.0 - n) * max(0.0, dot(nrm, uSunV)); // silver lining where it thins
  }
  float a = shape * vGA.y * (0.75 + 0.35 * n) * smoothstep(0.0, 0.07, vK) * pow(1.0 - vK, 1.5) * vFade;
  gl_FragColor = vec4(col * a, a);
}`;

// exhaust character per fuel: emission rate (idle, full load) per second, grey level (idle, load), opacity (idle, load), size
// (start, end) at idle and at load, life, buoyancy, gas speed out of the pipe
const FUEL = {
  petrol:      { kind: KIND.EXHAUST, rate: [0, 9], grey: [0.86, 0.8], alpha: [0, 0.12], s0: 0.08, s1: [0.35, 0.75], life: [1.0, 1.6], buoy: 0.35, gas: 1.6 },
  dieselLight: { kind: KIND.DIESEL, rate: [1.5, 12], grey: [0.55, 0.32], alpha: [0.06, 0.26], s0: 0.1, s1: [0.45, 1.0], life: [1.4, 2.2], buoy: 0.3, gas: 1.8 },
  diesel:      { kind: KIND.DIESEL, rate: [3, 18], grey: [0.42, 0.17], alpha: [0.12, 0.55], s0: 0.16, s1: [0.7, 1.9], life: [2.0, 3.2], buoy: 0.28, gas: 2.4 },
  tuk:         { kind: KIND.TWO_STROKE, rate: [4, 13], grey: [0.62, 0.52], alpha: [0.1, 0.3], s0: 0.08, s1: [0.4, 0.95], life: [1.6, 2.4], buoy: 0.25, gas: 1.5 },
  bike:        { kind: KIND.EXHAUST, rate: [1.2, 8], grey: [0.78, 0.7], alpha: [0.03, 0.12], s0: 0.06, s1: [0.3, 0.6], life: [1.0, 1.5], buoy: 0.3, gas: 1.4 },
};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class VehicleSmoke {
  // game: needs .scene, .camera, .explosions (its uniforms + noise texture), optional .atmos
  constructor(game, quality = 'high') {
    this.g = game; this.t = 0; this.tyreLoad = 0; this.st = new WeakMap(); this.stats = { emitted: 0, tyre: 0, haze: 0, exhaust: 0, engine: 0, dropped: 0, uploads: 0, near: 0 };
    this.setQuality(quality);
    const ex = game.explosions; const EU = ex ? ex.U : null;
    this.U = { uTime: { value: 0 }, uNoise: EU ? EU.uNoise : { value: null }, uWind: EU ? EU.uWind : { value: new THREE.Vector3(0.5, 0, 0.3) },
      uSunV: EU ? EU.uSunV : { value: new THREE.Vector3(0, 1, 0) }, uSunC: EU ? EU.uSunC : { value: new THREE.Color(1, 1, 1) }, uAmb: EU ? EU.uAmb : { value: new THREE.Color(0.4, 0.4, 0.4) } };
    const base = new THREE.PlaneGeometry(1, 1); const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
    this.A = {}; for (const [name, size] of [['aP0', 3], ['aV', 3], ['aT', 4], ['aR', 4], ['aC', 3]]) { const a = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE_POOL * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); this.A[name] = a; }
    for (let i = 0; i < SMOKE_POOL; i++) this.A.aT.setXYZW(i, -1e4, 1, 0, 0); for (const a of Object.values(this.A)) a.needsUpdate = true;
    geo.instanceCount = SMOKE_POOL; this.geo = geo; this.i = 0; this.w0 = -1; this.wn = 0;
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.U, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, premultipliedAlpha: true });
    // always 'visible' (dead puffs collapse off-screen in the vertex shader): compiled with the scene at load, never a first-use hitch
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 19; this.mesh.userData.fx = true; this.mesh.name = 'vehicleSmoke';
    if (game.scene) game.scene.add(this.mesh);
    this.skid = new SkidMarks(game.scene, this.U.uNoise, this.U.uTime); this.skid.setQuality(quality); // rubber laid by the same slipping tyres (one more draw call)
  }
  setQuality(q) { if (this.skid) this.skid.setQuality(q); this.budget = q === 'low' ? 18 : q === 'medium' ? 30 : q === 'ultra' ? 56 : 42; this.rateK = q === 'low' ? 0.55 : q === 'medium' ? 0.8 : 1; }
  // ------------------------------------------------------------------ one puff into the ring (slots written this frame are uploaded once)
  emit(px, py, pz, vx, vy, vz, born, life, s0, s1, kind, buoy, drag, grey, alpha, gy) {
    const i = this.i; this.i = (i + 1) % SMOKE_POOL; const A = this.A;
    A.aP0.setXYZ(i, px, py, pz); A.aV.setXYZ(i, vx, vy, vz); A.aT.setXYZW(i, born, life, s0, s1); A.aR.setXYZW(i, Math.random(), kind, buoy, drag); A.aC.setXYZ(i, grey, alpha, gy);
    if (this.w0 < 0) this.w0 = i; this.wn++; this.stats.emitted++; return i;
  }
  flush() {
    if (this.wn <= 0) return; const n = Math.min(this.wn, SMOKE_POOL), s = this.w0;
    for (const a of Object.values(this.A)) { a.clearUpdateRanges(); const k = a.itemSize;
      if (s + n <= SMOKE_POOL) a.addUpdateRange(s * k, n * k); else { a.addUpdateRange(s * k, (SMOKE_POOL - s) * k); a.addUpdateRange(0, (n - (SMOKE_POOL - s)) * k); }
      a.needsUpdate = true; }
    this.stats.uploads++; this.w0 = -1; this.wn = 0;
  }
  // per-vehicle cached geometry: exhaust spec + tyre contact points (vehicle-local, +z forward, +x left)
  info(v) {
    const ud = v.mesh.userData, T = v.T || {}; const wid = T.wid || 1.7, len = T.len || 4.2;
    let ex = ud.exhaust; const heavy = (T.mass || 0) > 3200;
    if (!ex) ex = { p: [-(wid / 2 - 0.3), heavy ? 0.4 : 0.3, -len / 2 - 0.04], d: [0, 0, -1], fuel: heavy ? 'diesel' : (T.mass || 0) > 1700 || T.fam === 'truck' ? 'dieselLight' : 'petrol' };
    const front = [], rear = []; for (const w of ud.wheels || []) { const p = w.position; (w.userData.front ? front : rear).push([p.x, p.z]); }
    if (!rear.length) rear.push([wid * 0.42, -len * 0.33], [-wid * 0.42, -len * 0.33]); if (!front.length) front.push([wid * 0.42, len * 0.33], [-wid * 0.42, len * 0.33]);
    const bike = T.entry === 'bike'; return { pedal: !!T.pedal, ex, F: T.pedal ? null : FUEL[ex.fuel] || FUEL.petrol, /* a bicycle has no exhaust */ front, rear, bike, heavy, wid, len, scale: bike ? 0.55 : heavy ? 1.25 : 1 };
  }
  update(dt) {
    if (!(dt > 0)) return; dt = Math.min(dt, 0.1); this.t += dt; this.U.uTime.value = this.t;
    const g = this.g, cam = g.camera; if (!cam) return; if (g.indoor) { this.flush(); this.skid.flush(); return; }
    const cx = cam.position.x, cz = cam.position.z; const A = g.atmos, rain = A && A.w ? A.w.rain || 0 : 0;
    let budget = this.budget; this.stats.near = 0; this.tyreLoad *= Math.exp(-dt / 3.2); // ≈ live tyre puffs: caps the fill-rate cost of a long burnout
    for (const v of LIVE_VEHICLES) {
      if (!v.mesh || !v.mesh.parent || (v.T && v.T.rail)) continue;
      const d2 = (v.x - cx) ** 2 + (v.z - cz) ** 2; let s = this.st.get(v);
      if (d2 > R_FAR * R_FAR) { if (s) s.ok = false; continue; }
      if (!s) { s = { ok: false, px: 0, pz: 0, pyaw: 0, pf: 0, acc: 0, ex: 0, tr: 0, tf: 0, en: 0, info: null, pe: [0, 0, 0], pw: null }; this.st.set(v, s); }
      if (!s.info || v.smokeDirty) { s.info = this.info(v); v.smokeDirty = false; } // smokeDirty: Street Customs fitted a new exhaust tip
      const yaw = v.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx; // forward, left
      if (!s.ok) { s.ok = true; s.px = v.x; s.pz = v.z; s.pyaw = yaw; s.pf = v.speed || 0; s.acc = 0; s.pw = null; this.exPoint(v, s, s.pe); continue; }
      const mvx = (v.x - s.px) / dt, mvz = (v.z - s.pz) / dt; if (mvx * mvx + mvz * mvz > 90 * 90) { s.ok = false; continue; } // teleported / respawned
      const fwdS = mvx * fx + mvz * fz, latS = mvx * rx + mvz * rz; let dy = yaw - s.pyaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); const yr = dy / dt;
      const a = (fwdS - s.pf) / dt; s.acc += (Math.max(-30, Math.min(30, a)) - s.acc) * Math.min(1, dt * 6); s.pf = fwdS;
      s.px = v.x; s.pz = v.z; s.pyaw = yaw; this.stats.near++;
      const far = d2 > R_NEAR * R_NEAR ? 0.5 : 1, I = s.info, sp = Math.abs(fwdS), gy = v.groundY ?? v.y ?? 0;
      // ---------------- tyre smoke
      let tr = 0, tf = 0, spin = 0; const ts = v.tireSmoke;
      if (ts) { tr = ts.r || 0; tf = ts.f || 0; spin = ts.spin || 0; ts.r = 0; ts.f = 0; ts.spin = 0; } // set by Vehicle.drive (launch wheelspin, burnout, handbrake, hard braking)
      if (sp > 2.5 || Math.abs(latS) > 2.5) { const sl = clamp01((Math.abs(latS) - 1.4) / 4.5); tr = Math.max(tr, sl); tf = Math.max(tf, sl * 0.7); } // sliding sideways
      if (Math.abs(yr) > 1.3 && (sp > 3 || Math.abs(latS) > 2)) { const k = clamp01((Math.abs(yr) - 1.3) / 2); tr = Math.max(tr, k); tf = Math.max(tf, k * 0.8); } // spinning
      if (v.free && Math.hypot(v.free.vx, v.free.vz) > 3) { tr = Math.max(tr, 0.5); tf = Math.max(tf, 0.5); } // shoved across the road by a crash
      const wet = 1 - 0.75 * clamp01(rain * 1.5); tr *= wet; tf *= wet; if (I.pedal) { tr = 0; tf = 0; } /* a bicycle's tyres don't smoke */
      if (tr > 0.05 || tf > 0.05 || s.pw) budget = this.tyres(v, s, I, tr, tf, fx, fz, rx, rz, mvx, mvz, gy, far, dt, budget, spin);
      // ---------------- badly damaged: smoke from under the bonnet (grey → black as it gets worse)
      if ((v.damage || 0) > 0.7 && budget > 0) { s.en += (4 + 10 * clamp01((v.damage - 0.7) / 0.3)) * this.rateK * far * dt;
        while (s.en >= 1 && budget > 0) { s.en -= 1; budget--; const lz = I.len * 0.36, ly = I.heavy ? 1.4 : 0.95; const px = v.x + fx * lz + rx * (Math.random() - 0.5) * I.wid * 0.5, pz = v.z + fz * lz + rz * (Math.random() - 0.5) * I.wid * 0.5;
          const grey = 0.5 - 0.35 * clamp01((v.damage - 0.7) / 0.3); this.emit(px, (v.y || 0) + ly, pz, mvx * 0.5, 0.8, mvz * 0.5, this.t - Math.random() * dt, 2.2 + Math.random(), 0.25, 1.4 + Math.random() * 0.6, KIND.ENGINE, 0.9, 1.2, grey, 0.45, gy); this.stats.engine++; }
        if (budget <= 0) this.stats.dropped++; }
      // ---------------- exhaust (engine running: driven, or an AI / mission car with a driver)
      const running = !v.parked || v.player || v.driver; if (!running || !I.F) { s.ex = 0; this.exPoint(v, s, s.pe); continue; }
      let load; if (v.throttleFresh) { load = clamp01(v.throttle); v.throttleFresh = false; } // the driver's pedal (Vehicle.drive)
      else load = clamp01(s.acc / ((v.T && v.T.accel) || 4) * 1.4);
      if (sp > 0.5 && load > 0) load = Math.min(1, load * (1.1 - 0.5 * clamp01(sp / 25))); // most visible when pulling away
      const dmg = clamp01(((v.damage || 0) - 0.3) / 0.6); const F = I.F;
      const humid = 1 + 0.8 * clamp01(rain * 2); let alpha = (F.alpha[0] + (F.alpha[1] - F.alpha[0]) * load) * humid + dmg * 0.25; const rate = (F.rate[0] + (F.rate[1] - F.rate[0]) * load + dmg * 6) * this.rateK * far;
      budget = this.exhaust(v, s, I, F, rate, load, alpha, dmg, fx, fz, rx, rz, mvx, mvz, gy, dt, budget);
    }
    this.flush(); this.skid.flush();
  }
  // exhaust tip in world space (ignores the small pitch / roll of the body)
  exPoint(v, s, out) { const p = s.info ? s.info.ex.p : [0, 0.3, -2], yaw = v.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw); out[0] = v.x + p[0] * fz + p[2] * fx; out[1] = (v.y || 0) + p[1]; out[2] = v.z - p[0] * fx + p[2] * fz; return out; }
  exhaust(v, s, I, F, rate, load, alpha, dmg, fx, fz, rx, rz, mvx, mvz, gy, dt, budget) {
    const ox = s.pe[0], oy = s.pe[1], oz = s.pe[2]; const e = this.exPoint(v, s, s.pe); if (alpha < 0.012 || rate <= 0) { s.ex = 0; return budget; }
    s.ex += rate * dt; let n = Math.floor(s.ex); if (n <= 0) return budget; s.ex -= n; if (n > 6) n = 6;
    const d = I.ex.d, dwx = d[0] * fz + d[2] * fx, dwz = -d[0] * fx + d[2] * fz, dwy = d[1]; const gas = F.gas * (0.6 + 0.6 * load);
    const grey = Math.max(0.08, F.grey[0] + (F.grey[1] - F.grey[0]) * load - dmg * 0.25), s1 = (F.s1[0] + (F.s1[1] - F.s1[0]) * load) * (1 + dmg * 0.5);
    for (let k = 0; k < n && budget > 0; k++, budget--) { const u = (k + 1) / n; // spread along the path the pipe travelled this frame (no gaps behind fast cars)
      const life = F.life[0] + (F.life[1] - F.life[0]) * load + Math.random() * 0.4;
      this.emit(ox + (e[0] - ox) * u, oy + (e[1] - oy) * u, oz + (e[2] - oz) * u, mvx * 0.35 + dwx * gas + (Math.random() - 0.5) * 0.3, dwy * gas + 0.15, mvz * 0.35 + dwz * gas + (Math.random() - 0.5) * 0.3,
        this.t - (1 - u) * dt, life, F.s0 * I.scale, s1 * I.scale * (0.85 + Math.random() * 0.3), F.kind, F.buoy, 1.6, grey, Math.min(0.8, alpha), gy); this.stats.exhaust++; }
    if (budget <= 0) this.stats.dropped++; return budget;
  }
  // Rubber smoke in two layers, as it really builds up: a dense bright CORE boiling off each slipping contact patch (a spinning tread
  // flings it backwards out from behind the tyre at up to ~4 m/s, the air stops it within a metre or so and it balloons; a locked or
  // sliding tyre just lays it where it slid), and a long-lived low HAZE bank that pools along the road, spreads wide and hangs for
  // 6–10 s, so a long burnout or drift fills the street with a cloud instead of a trail of separate balls.
  tyres(v, s, I, tr, tf, fx, fz, rx, rz, mvx, mvz, gy, far, dt, budget, spin = 0) {
    const ws = I.bike ? [I.rear[0]] : I.rear, wf = I.bike ? [I.front[0]] : I.front; const all = ws.concat(wf); const cur = all.map(([lx, lz]) => [v.x + lx * rx + lz * fx, v.z + lx * rz + lz * fz]);
    const prev = s.pw && s.pw.length === cur.length ? s.pw : cur; s.pw = tr > 0.05 || tf > 0.05 ? cur : null; if (!s.pw) { s.tr = s.tf = 0; return budget; }
    if (this.skid) for (let i = 0; i < all.length; i++) { const inten = i < ws.length ? tr : tf; if (inten > 0.12) this.skid.mark(v, i, prev[i][0], prev[i][1], cur[i][0], cur[i][1], gy, inten, I.bike ? 0.13 : I.heavy ? 0.3 : 0.21); }
    const cap = clamp01(1 - (this.tyreLoad - 140) / 120); tr *= cap; tf *= cap;
    const rateR = 16 * tr * this.rateK * far * (I.bike ? 0.6 : 1), rateF = 16 * tf * this.rateK * far * (I.bike ? 0.6 : 1);
    const sp = Math.hypot(mvx, mvz), slow = clamp01(1 - sp / 14);
    const one = (i, k, nk, inten, rearW) => { const P = prev[i], C = cur[i], u = (k + 1) / nk; const px = P[0] + (C[0] - P[0]) * u, pz = P[1] + (C[1] - P[1]) * u;
      const out = (all[i][0] >= 0 ? 1 : -1) * 0.5; // a little outward from under the wheel arch
      const ej = rearW ? spin * slow * (1.4 + 2.8 * inten) * (0.75 + Math.random() * 0.5) : 0; // tread-thrown, out the back of the tyre
      const born = this.t - (1 - u) * dt, grey = v.tune && v.tune.smoke ? smokeCode(v.tune.smoke) : 0.88 + Math.random() * 0.08;
      this.emit(px + rx * out * 0.3 - fx * 0.25 * (ej > 0), gy + 0.16 + Math.random() * 0.1, pz + rz * out * 0.3 - fz * 0.25 * (ej > 0),
        mvx * 0.3 + rx * out - fx * ej + (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.35 + ej * 0.12, mvz * 0.3 + rz * out - fz * ej + (Math.random() - 0.5) * 0.8,
        born, 1.5 + Math.random() * 1.2 * (0.5 + inten), 0.3 * I.scale, (1.4 + 1.3 * inten) * I.scale * (0.8 + Math.random() * 0.4), KIND.TYRE, 0.32, 3.2, grey, 0.46 + 0.38 * inten, gy);
      this.stats.tyre++; this.tyreLoad++;
      if (budget > 1 && Math.random() < 0.18 + 0.4 * inten) { budget--; const sx = (Math.random() - 0.5) * 1.6, ang = Math.random() * 6.2832; // the bank it feeds
        this.emit(px - fx * ej * 0.3 + rx * out * 0.8, gy + 0.25, pz - fz * ej * 0.3 + rz * out * 0.8, mvx * 0.18 - fx * ej * 0.3 + rx * out * 1.2 + Math.cos(ang) * 0.6 + sx * rx, 0.12, mvz * 0.18 - fz * ej * 0.3 + rz * out * 1.2 + Math.sin(ang) * 0.6 + sx * rz,
          born, 6 + Math.random() * 4 * (0.4 + inten), 0.8 * I.scale, (3.6 + 3.2 * inten) * I.scale * (0.8 + Math.random() * 0.4), KIND.TYRE_HAZE, 0.05, 1.3, 0.84 + Math.random() * 0.06, 0.11 + 0.13 * inten, gy);
        this.stats.haze++; this.tyreLoad += 2; } };
    s.tr += rateR * dt; s.tf += rateF * dt; let nr = Math.min(4, Math.floor(s.tr)), nf = Math.min(3, Math.floor(s.tf)); s.tr -= Math.floor(s.tr); s.tf -= Math.floor(s.tf);
    for (let k = 0; k < nr; k++) for (let i = 0; i < ws.length && budget > 0; i++, budget--) one(i, k, nr, tr, true);
    for (let k = 0; k < nf; k++) for (let i = 0; i < wf.length && budget > 0; i++, budget--) one(ws.length + i, k, nf, tf, false);
    if (budget <= 0) this.stats.dropped++; return budget;
  }
}
