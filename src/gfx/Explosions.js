// Explosions: cinematic-looking but cheap. Everything is allocated once (no shader compiles, no allocation per blast):
//   fire   — GPU billboards (one draw call): a white-hot core flash and a rolling fireball of noise-shaped flame puffs whose
//            colour runs white → yellow → orange → deep red as they cool; HDR so the bloom pass makes them glow
//   smoke  — GPU billboards (one draw call): the black-grey column that rolls up out of the fireball and drifts off with the
//            wind, lit by the sun (fake sphere normals from the noise) and glowing orange from the fire in its first moments;
//            the ground dust shock ring (fast radial puffs that brake hard) and white water spray use the same buffer
//   sparks — GPU streaks stretched along their velocity (one draw call), falling under gravity onto the ground
//   debris — a handful of instanced dark chunks bouncing on the CPU
//   light  — ONE point light, permanently in the scene at zero intensity (adding a light at blast time would recompile every
//            material in the city = a long freeze); flashes then flickers with the fire
//   scorch — pooled ground decals that fade after a few minutes
// plus the screen-space shock ripple / concussion (PostFX), camera shake and the sound (Audio.explosion, d/343 s late).
// Shapes come from one pre-baked tileable noise texture sampled twice per pixel (no procedural noise in the shaders).
// blast() also applies the gameplay effects (people, police, vehicles, the player) so every explosion source behaves the same.
import * as THREE from 'three';
import { Audio } from '../audio/Audio.js';
import * as L from '../world/Layout.js';

const FIRE_N = 384, SMOKE_N = 448, SPARK_N = 640, DEBRIS_N = 48, SCORCH_N = 14;

// tileable value-noise fBm (R8), 128²
function noiseTexture() {
  const S = 128, data = new Uint8Array(S * S); const lat = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = Math.random(); return a; };
  const oct = [[8, 0.5], [16, 0.27], [32, 0.15], [64, 0.08]].map(([n, w]) => ({ n, w, a: lat(n) }));
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let v = 0;
    for (const o of oct) { const fx = x / S * o.n, fy = y / S * o.n; const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0); const g = (i, j) => o.a[((j % o.n) + o.n) % o.n * o.n + ((i % o.n) + o.n) % o.n];
      v += o.w * ((g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty); }
    data[y * S + x] = Math.max(0, Math.min(255, Math.round((v - 0.1) / 0.85 * 255))); }
  const t = new THREE.DataTexture(data, S, S, THREE.RedFormat, THREE.UnsignedByteType); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
}

const PUFF_VS = `
attribute vec3 aP0; attribute vec3 aV; attribute vec4 aT; attribute vec4 aR; attribute vec3 aC;
uniform float uTime; uniform vec3 uWind;
varying vec2 vUv; varying float vK; varying float vSeed; varying float vKind; varying vec3 vCol; varying float vFade; varying float vAge;
void main() {
  float age = uTime - aT.x; float k = age / aT.y;
  vUv = uv; vK = k; vSeed = aR.x; vKind = aR.y; vCol = aC; vAge = age;
  if (k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float drag = aR.w; float dk = drag > 0.0 ? (1.0 - exp(-drag * age)) / drag : age;
  vec3 p = aP0 + aV * dk;
  p.y += aR.z * age * age * 0.5 / (1.0 + age * 0.45);              // buoyancy (hot gas rises; eases off as it cools)
  p += uWind * age * age * 0.04 * step(0.5, aR.y);                   // smoke / dust drift downwind
  if (aR.y > 2.5) p.y -= 4.9 * age * age;                              // water spray falls back
  p.y = max(p.y, aC.z - 0.15);                                          // never through the ground it started on
  float sz = mix(aT.z, aT.w, 1.0 - pow(1.0 - k, 2.4));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float ang = aR.x * 6.2831 + age * (aR.x - 0.5) * 0.9;
  vec2 c = position.xy; c = vec2(c.x * cos(ang) - c.y * sin(ang), c.x * sin(ang) + c.y * cos(ang));
  mv.xy += c * sz;
  vFade = clamp((-mv.z - 0.35) / 1.4, 0.0, 1.0);                       // fades as it reaches the camera (no hard clip)
  gl_Position = projectionMatrix * mv;
}`;
const FIRE_FS = `
uniform sampler2D uNoise; uniform float uTime;
varying vec2 vUv; varying float vK; varying float vSeed; varying float vKind; varying vec3 vCol; varying float vFade; varying float vAge;
void main() {
  vec2 c = vUv - 0.5; float r = length(c) * 2.0;
  float n1 = texture2D(uNoise, vUv * 0.55 + vec2(vSeed * 7.13, vSeed * 3.31 - vAge * 0.9)).r;
  float n2 = texture2D(uNoise, vUv * 1.35 + vec2(vSeed * 2.71 + vAge * 0.35, vSeed * 5.93)).r;
  float n = n1 * 0.62 + n2 * 0.38;
  float shape = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.95);
  if (shape < 0.003) discard;
  float T = clamp((1.0 - vK * 1.25) * (0.35 + n * 1.0) * (1.25 - r * 1.05) * vCol.g, 0.0, 1.2);   // temperature: hottest in the puff's core, cool red-black rim
  vec3 col = mix(vec3(0.22, 0.03, 0.0), vec3(1.0, 0.3, 0.035), smoothstep(0.08, 0.42, T));
  col = mix(col, vec3(1.0, 0.68, 0.22), smoothstep(0.42, 0.72, T));
  col = mix(col, vec3(1.0, 0.94, 0.82), smoothstep(0.76, 1.05, T));
  float inten = (0.35 + 4.2 * T * T) * vCol.r;
  float a = shape * (1.0 - smoothstep(0.7, 1.0, vK)) * vFade;
  float soot = (1.0 - smoothstep(0.05, 0.35, T)) * 0.55;                // the cooling rim is sooty: it darkens what is behind it
  gl_FragColor = vec4(col * inten * a * smoothstep(0.0, 0.1, T), a * (0.3 + soot));
}`;
const SMOKE_FS = `
uniform sampler2D uNoise; uniform vec3 uSunV; uniform vec3 uSunC; uniform vec3 uAmb;
varying vec2 vUv; varying float vK; varying float vSeed; varying float vKind; varying vec3 vCol; varying float vFade; varying float vAge;
void main() {
  vec2 c = vUv - 0.5; float r = length(c) * 2.0;
  float n1 = texture2D(uNoise, vUv * 0.5 + vec2(vSeed * 4.7, vSeed * 8.3 - vAge * 0.05)).r;
  float n2 = texture2D(uNoise, vUv * 1.2 + vec2(vSeed * 9.1 + vAge * 0.03, vSeed * 1.7)).r;
  float n = n1 * 0.6 + n2 * 0.4;
  float edge = r + (n - 0.5) * 1.05; float shape = smoothstep(1.0, 0.3, edge);
  if (shape < 0.003) discard;
  vec3 nrm = normalize(vec3(c * 2.2 + (vec2(n1, n2) - 0.5) * 0.9, 0.55));
  float lit = clamp(dot(nrm, uSunV) * 0.6 + 0.45, 0.0, 1.0);
  vec3 base = vec3(vCol.x) * mix(vec3(1.0), vec3(1.16, 1.0, 0.8), vCol.y);   // aC = (grey, dust tint 0..1, ground y)
  vec3 col = base * (uAmb + uSunC * lit) * (0.75 + 0.5 * n);
  float young = (1.0 - smoothstep(0.0, 0.045, vK)) * step(0.5, vKind) * step(vKind, 1.5);       // smoke born in the fireball glows
  col += vec3(1.0, 0.36, 0.06) * young * 1.1 * (1.0 - r * 0.8) * n;
  float dens = vKind > 2.5 ? 0.75 : vKind > 1.5 ? 0.55 : 0.9;
  float a = shape * dens * (0.8 - 0.3 * n) * smoothstep(0.0, 0.05, vK) * pow(1.0 - vK, 1.4) * vFade;
  gl_FragColor = vec4(col * a, a);
}`;
const SPARK_VS = `
attribute vec3 aP0; attribute vec3 aV; attribute vec4 aT;
uniform float uTime;
varying float vK; varying vec2 vUv;
vec3 at(float t) { vec3 p = aP0 + aV * t + vec3(0.0, -4.9 * t * t, 0.0); p.y = max(p.y, aT.w); return p; }
void main() {
  float age = uTime - aT.x; float k = age / aT.y; vK = k; vUv = uv;
  if (k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 a = modelViewMatrix * vec4(at(age), 1.0); vec4 b = modelViewMatrix * vec4(at(max(0.0, age - 0.04)), 1.0);
  vec2 d = a.xy - b.xy; float l = length(d); vec2 dir = l > 1e-5 ? d / l : vec2(1.0, 0.0); vec2 nrm = vec2(-dir.y, dir.x);
  vec4 p = mix(b, a, position.x + 0.5); p.xy += nrm * position.y * aT.z * (1.0 - k * 0.5); p.xy += dir * (position.x) * aT.z;
  gl_Position = projectionMatrix * p;
}`;
const SPARK_FS = `
varying float vK; varying vec2 vUv;
void main() { float w = 1.0 - abs(vUv.y - 0.5) * 2.0; w *= w; float e = 1.0 - vK;
  vec3 col = mix(vec3(1.0, 0.32, 0.05), vec3(1.0, 0.86, 0.55), e * e) * (2.5 + 9.0 * e * e);
  float a = w * e; gl_FragColor = vec4(col * a, a); }`;

function instGeo(n, attrs) {
  const base = new THREE.PlaneGeometry(1, 1); const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const out = {}; for (const [name, size] of attrs) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); out[name] = a; }
  g.instanceCount = n; return { g, a: out };
}
// premultiplied-alpha blending: fire adds light (ONE, ONE); smoke covers (ONE, ONE_MINUS_SRC_ALPHA)
function puffMat(fs, uniforms, add) {
  return new THREE.ShaderMaterial({ vertexShader: PUFF_VS, fragmentShader: fs, uniforms, transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: add ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, premultipliedAlpha: true });
}
function scorchTexture() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const a = cv.getContext('2d');
  const gr = a.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(8,6,5,0.92)'); gr.addColorStop(0.45, 'rgba(14,11,9,0.75)'); gr.addColorStop(0.75, 'rgba(24,20,16,0.35)'); gr.addColorStop(1, 'rgba(30,26,22,0)');
  a.fillStyle = gr; a.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) { const ang = Math.random() * Math.PI * 2, r0 = S * 0.18, r1 = S * (0.3 + Math.random() * 0.2); a.strokeStyle = `rgba(10,8,6,${0.15 + Math.random() * 0.3})`; a.lineWidth = 1 + Math.random() * 3; a.beginPath(); a.moveTo(S / 2 + Math.cos(ang) * r0, S / 2 + Math.sin(ang) * r0); a.lineTo(S / 2 + Math.cos(ang) * r1, S / 2 + Math.sin(ang) * r1); a.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Explosions {
  constructor(game) {
    this.g = game; this.t = 0; this.active = 0; this.list = []; this.stats = { blasts: 0, killed: 0, downed: 0, officers: 0, vehicles: 0 };
    const scene = game.scene; this.noise = noiseTexture();
    this.U = { uTime: { value: 0 }, uNoise: { value: this.noise }, uWind: { value: new THREE.Vector3(1, 0, 0.3) }, uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.3, 0.3, 0.3) } };
    const A = [['aP0', 3], ['aV', 3], ['aT', 4], ['aR', 4], ['aC', 3]];
    this.fire = instGeo(FIRE_N, A); this.smoke = instGeo(SMOKE_N, A); this.spark = instGeo(SPARK_N, [['aP0', 3], ['aV', 3], ['aT', 4]]);
    for (const B of [this.fire, this.smoke, this.spark]) { const T = B.a.aT; for (let i = 0; i < T.count; i++) T.setXYZW(i, -1e4, 1, 0, 0); T.needsUpdate = true; B.i = 0; }
    const mk = (B, mat, order) => { const m = new THREE.Mesh(B.g, mat); m.frustumCulled = false; m.renderOrder = order; m.userData.fx = true; scene.add(m); return m; };
    this.smokeMesh = mk(this.smoke, puffMat(SMOKE_FS, this.U, false), 20);
    this.fireMesh = mk(this.fire, puffMat(FIRE_FS, this.U, false), 21); // premultiplied: emits light AND (rim soot) covers
    this.sparkMesh = mk(this.spark, new THREE.ShaderMaterial({ vertexShader: SPARK_VS, fragmentShader: SPARK_FS, uniforms: { uTime: this.U.uTime }, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor }), 22);
    // debris chunks (CPU)
    this.debris = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.9 }), DEBRIS_N); this.debris.frustumCulled = false; this.debris.castShadow = false; this.debris.userData.fx = true;
    this.chunks = []; const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < DEBRIS_N; i++) { this.debris.setMatrixAt(i, z); this.chunks.push(null); } this.debris.count = DEBRIS_N; scene.add(this.debris); this.dI = 0;
    // flash light: always present (constant light count → no shader recompiles); intensity 0 when idle
    this.light = new THREE.PointLight(0xff8a3a, 0, 40, 2); this.light.position.set(0, -500, 0); scene.add(this.light); this.flashes = [];
    // scorch decals
    const st = scorchTexture(); this.scorch = []; for (let i = 0; i < SCORCH_N; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, opacity: 0 })); m.rotation.x = -Math.PI / 2; m.visible = false; m.userData.fx = true; m.renderOrder = 2; scene.add(m); this.scorch.push({ m, t: 0 }); } this.sI = 0; this.scorch[0].m.visible = true; this.scorch[0].m.position.y = -1000; /* compile primer (opacity 0, far below) */
    this.shock = []; // screen ripples
    this._v = new THREE.Vector3(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
  }
  // ---------------------------------------------------------------- particles
  emit(B, k, p, v, life, s0, s1, kind, buoy, drag, col, delay = 0) {
    const i = B.i; B.i = (B.i + 1) % B.a.aT.count; const A = B.a;
    A.aP0.setXYZ(i, p.x, p.y, p.z); A.aV.setXYZ(i, v.x, v.y, v.z); A.aT.setXYZW(i, this.t + delay, life, s0, s1);
    if (A.aR) A.aR.setXYZW(i, Math.random(), kind, buoy, drag); if (A.aC) A.aC.setXYZ(i, col[0], col[1], col[2]);
    B.dirty = true; return i;
  }
  sparkEmit(p, v, life, w, groundY, delay = 0) { const B = this.spark, i = B.i; B.i = (B.i + 1) % SPARK_N; B.a.aP0.setXYZ(i, p.x, p.y, p.z); B.a.aV.setXYZ(i, v.x, v.y, v.z); B.a.aT.setXYZW(i, this.t + delay, life, w, groundY); B.dirty = true; }
  flush(B) { if (!B.dirty) return; for (const a of Object.values(B.a)) a.needsUpdate = true; B.dirty = false; }
  rnd(a, b) { return a + Math.random() * (b - a); }
  dirIn(up = 0.35) { const th = Math.random() * Math.PI * 2, y = up + Math.random() * (1 - up); const r = Math.sqrt(Math.max(0, 1 - y * y)); return this._v.set(Math.cos(th) * r, y, Math.sin(th) * r); }
  // ---------------------------------------------------------------- the blast
  // p: THREE.Vector3 (charge position). opts: { power (1 = hand grenade), source: 'player' | 'npc', cause }
  blast(p, opts = {}) {
    const g = this.g, pow = opts.power ?? 1; this.stats.blasts++;
    const col = g.collision; const gy = col ? col.groundAt(p.x, p.z, p.y + 0.3, 0.6) : L.groundY(p.x, p.z); const water = L.isWater(p.x, p.z) && p.y < gy + 0.5 && !(L.bridgeWalkAt && L.bridgeWalkAt(p.x, p.z));
    const c = new THREE.Vector3(p.x, Math.max(p.y, gy) + 0.25, p.z); const V = new THREE.Vector3(); const P = new THREE.Vector3();
    const R = pow; // scale
    if (!water) {
      // white-hot core flash (very short) + rolling fireball
      for (let i = 0; i < 2; i++) this.emit(this.fire, 0, P.copy(c).add(V.set(this.rnd(-0.2, 0.2), this.rnd(0, 0.3), this.rnd(-0.2, 0.2))), V.set(0, 1, 0), this.rnd(0.09, 0.13), 1.0 * R, 3.6 * R, 0, 0, 0, [1.5, 1.2, gy]);
      for (let i = 0; i < 18; i++) { const d = this.dirIn(0.12), sp = this.rnd(4, 10) * R; this.emit(this.fire, 0, P.copy(c).addScaledVector(d, 0.3), V.copy(d).multiplyScalar(sp), this.rnd(0.35, 0.75), this.rnd(0.6, 1.0) * R, this.rnd(1.8, 2.9) * R, 0, 3.0, 4.6, [1.0, this.rnd(0.8, 1.05), gy], this.rnd(0, 0.05)); }
      // lingering flames licking up for a moment
      for (let i = 0; i < 6; i++) { const d = this.dirIn(0.7); this.emit(this.fire, 0, P.copy(c).addScaledVector(d, 0.6), V.copy(d).multiplyScalar(1.2), this.rnd(0.6, 1.1), 0.5 * R, 1.4 * R, 0, 2.5, 2, [0.7, 0.75, gy], this.rnd(0.15, 0.45)); }
      // the smoke column: dense dark puffs rolling up out of the fireball, then a lighter grey plume
      for (let i = 0; i < 30; i++) { const d = this.dirIn(0.25), dark = this.rnd(0.12, 0.22); const late = i > 18; this.emit(this.smoke, 1, P.copy(c).addScaledVector(d, 0.6), V.copy(d).multiplyScalar(this.rnd(1.5, 5.5) * R).add(this._s.set(0, this.rnd(1, 3), 0)), this.rnd(5, 10) * (late ? 1.2 : 1), this.rnd(1.0, 1.6) * R, this.rnd(4.5, 7.5) * R, 1, this.rnd(0.5, 1.1), 1.4, [dark + (late ? 0.12 : 0), 0.25, gy], this.rnd(0.03, 0.5) + (late ? 0.4 : 0)); }
      // ground dust: the shock front kicks the street dust outward in a ring
      const dc = this.dustColor(p.x, p.z);
      for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2 + Math.random() * 0.3; const sp = this.rnd(9, 15) * R; this.emit(this.smoke, 2, P.set(c.x + Math.cos(a) * 0.5, gy + 0.25, c.z + Math.sin(a) * 0.5), V.set(Math.cos(a) * sp, this.rnd(0.3, 1.2), Math.sin(a) * sp), this.rnd(2.2, 4), this.rnd(0.5, 0.9) * R, this.rnd(2.4, 3.6) * R, 2, 0.15, 3.2, [dc[0], dc[1], gy], this.rnd(0, 0.05)); }
      // sparks / burning fragments
      for (let i = 0; i < 90; i++) { const d = this.dirIn(0.05); const sp = this.rnd(8, 28) * Math.sqrt(R); this.sparkEmit(P.copy(c), V.copy(d).multiplyScalar(sp), this.rnd(0.35, 1.3), this.rnd(0.02, 0.05), gy + 0.02, this.rnd(0, 0.04)); }
      for (let i = 0; i < 10; i++) this.chunk(c, gy);
      this.scorchAt(p.x, gy, p.z, 3.2 * R);
      this.flashes.push({ x: c.x, y: c.y + 0.6, z: c.z, t: 0, pow: R });
    } else {
      // in the water: a white column of spray and a ring of foam, a muffled thump, no fire
      for (let i = 0; i < 34; i++) { const d = this.dirIn(0.75); this.emit(this.smoke, 3, P.set(c.x, gy + 0.1, c.z), V.copy(d).multiplyScalar(this.rnd(6, 13) * R), this.rnd(1.2, 2.2), this.rnd(0.4, 0.8) * R, this.rnd(1.8, 3.2) * R, 3, 0, 0.6, [0.9, 0, gy], this.rnd(0, 0.1)); }
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; this.emit(this.smoke, 2, P.set(c.x, gy + 0.15, c.z), V.set(Math.cos(a) * 7, 0.4, Math.sin(a) * 7), this.rnd(1.5, 2.5), 0.6, 2.6, 2, 0, 3, [0.85, 0, gy]); }
      this.flashes.push({ x: c.x, y: c.y + 0.4, z: c.z, t: 0, pow: 0.15 });
    }
    this.flush(this.fire); this.flush(this.smoke); this.flush(this.spark);
    // sound, screen, camera
    Audio.explosion(p.x, p.z, water ? 0.6 : pow);
    const cam = g.camera, d = cam.position.distanceTo(c);
    const shake = Math.min(1.6, 9 / (2 + d * 0.6)) * pow; if (g.player) g.player.shake = Math.max(g.player.shake || 0, shake);
    if (d < 70 && g.post && g.post.shock) { const s = c.clone().project(cam); if (s.z < 1 && Math.abs(s.x) < 1.4 && Math.abs(s.y) < 1.4) g.post.shock(s.x * 0.5 + 0.5, s.y * 0.5 + 0.5, Math.min(1, 10 / (d + 4)) * pow); }
    const P0 = g.player; const pd = P0 ? Math.hypot(P0.x - p.x, P0.z - p.z, (P0.y + 1) - c.y) : 99;
    if (pd < 16) { const k = Math.min(1, Math.pow(1 - pd / 16, 1.4) * 1.3) * pow; Audio.concuss(k); if (g.post && g.post.concuss) g.post.concuss(k); }
    if (!opts.noDamage) this.effects(c, gy, pow, opts);
    return { water, gy };
  }
  dustColor(x, z) { const road = L.roadAt && L.roadAt(x, z); return road ? [0.4, 0.45] : [0.5, 0.9]; } // [grey, tint]: asphalt grit is grey, earth / paving dust is tan
  chunk(c, gy) { const i = this.dI; this.dI = (this.dI + 1) % DEBRIS_N; const d = this.dirIn(0.3); const sp = this.rnd(5, 13); this.chunks[i] = { x: c.x, y: c.y, z: c.z, vx: d.x * sp, vy: d.y * sp, vz: d.z * sp, rx: Math.random() * 6, ry: Math.random() * 6, wx: this.rnd(-14, 14), wy: this.rnd(-14, 14), s: this.rnd(0.025, 0.07), t: 0, life: this.rnd(5, 9), rest: false }; }
  scorchAt(x, y, z, size) { const S = this.scorch[this.sI]; this.sI = (this.sI + 1) % SCORCH_N; S.m.position.set(x, y + 0.025, z); S.m.rotation.z = Math.random() * Math.PI * 2; S.m.scale.set(size, size, 1); S.m.material.opacity = 0.9; S.m.visible = true; S.t = 0; }
  // ---------------------------------------------------------------- what the blast does to the world
  // inner radius: lethal; middle: knocked down (a chance it is fatal); outer: thrown off balance, panic. Walls shield (line of sight).
  effects(c, gy, pow, opts) {
    const g = this.g, col = g.collision; const R1 = 3.6 * pow, R2 = 7 * pow, R3 = 11 * pow;
    const los = (x, y, z) => !col || col.raycast(c.x, c.y + 0.3, c.z, x, y, z, 0.05) >= 0.98;
    const C = g.crowd;
    if (C) for (const p of C.peds.slice()) {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz, (p.y || 0) + 1 - c.y); if (d > R3) continue; if (!los(p.x, (p.y || 0) + 1.1, p.z)) continue;
      const ux = dx / (Math.hypot(dx, dz) || 1), uz = dz / (Math.hypot(dx, dz) || 1); const f = 1 - d / R3;
      if (p.ch.rag) { p.ch.rag.impulse(ux * 9 * f, 4 * f, uz * 9 * f); continue; } // a body is thrown about
      if (d < R1 || (d < R2 && Math.random() < 0.45 * (1 - (d - R1) / (R2 - R1)))) { // killed: thrown by the blast
        p.vx = ux * (6 + 8 * f); p.vz = uz * (6 + 8 * f); p.airVy = 3 + 5 * f; C.kill(p); if (p.ch.rag) p.ch.rag.impulse(ux * 2, 2.5 * f, uz * 2);
        if (g.blood) { const bp = new THREE.Vector3(p.x - ux * 0.15, (p.y || 0) + 1.0, p.z - uz * 0.15); g.blood.wound(p.ch, bp, { x: ux, y: 0.3, z: uz }, 1.8); g.blood.spray(bp, { x: ux, y: 0.3, z: uz }, 1.4); } this.stats.killed++; C.events?.emit?.('pedHit', p);
      } else if (d < R2) { C.knock(p, ux, uz, 6 + 5 * f, 0); this.stats.downed++; }
      else if (p.state !== 'down') { C.react(p, 'stumble', 0.7, { punched: true }); p.vx = ux * 3 * f; p.vz = uz * 3 * f; }
    }
    if (C) C.alarm(c.x, c.z, 90, 3, null);
    g.birds?.scare(c.x, c.z, 140);
    // police: officers caught in it; anyone setting off explosives in the city is wanted (an officer or a witness reports it)
    const PR = g.police;
    if (PR) { for (const u of PR.units.concat(PR.civil)) for (const o of u.officers.slice()) { if (o.dead || (o.mode !== 'foot' && o.mode !== 'down' && o.mode !== 'return')) continue; const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz); if (d > R2 || !los(o.x, 1.1, o.z)) continue; const ux = dx / (d || 1), uz = dz / (d || 1); this.stats.officers++; if (d < R1 + 1) PR.killOfficer(o, ux * 4, uz * 4); else if (opts.source === 'player') PR.officerHit(o, ux, uz); else { o.x += ux * 0.6; o.z += uz * 0.6; } }
      if (opts.source === 'player' && !g.debug?.noWanted) { PR.reason = 'causing an explosion in a public place'; PR.incident = { x: c.x, z: c.z, t: PR.t }; PR.addHeat(PR.level < 2 ? 2 - PR.level + 0.01 : 1, PR.reason, 'Explosion reported.'); } }
    // vehicles: shoved, rocked on their springs, damaged; drivers floor it away
    const T = g.traffic; if (T) for (const v of T.all()) { const dx = v.x - c.x, dz = v.z - c.z, d = Math.hypot(dx, dz); if (d > R2 + 2) continue; const f = 1 - d / (R2 + 2), ux = dx / (d || 1), uz = dz / (d || 1); this.stats.vehicles++;
      v.impact(10 + 30 * f); v.pitch = (v.pitch || 0) + (Math.random() - 0.5) * 0.12 * f; v.roll = (v.roll || 0) + (Math.random() < 0.5 ? -1 : 1) * 0.14 * f;
      if (!v.player && !v.immovable && v.shove) { v.shove(ux * 4.5 * f, uz * 4.5 * f, (Math.random() - 0.5) * 1.4 * f); if (v.ai) v.ai.bumped = 3; } }
    // the player
    const P = g.player; if (P && g.health) { const d = Math.hypot(P.x - c.x, P.z - c.z, P.y + 1 - c.y); if (d < R3 && los(P.x, P.y + 1.2, P.z)) { const dmg = d < 2.2 * pow ? 140 : Math.max(0, 115 * Math.pow(1 - (d - 2.2 * pow) / (R3 - 2.2 * pow), 1.6)); if (dmg > 0.5) g.health.damage(dmg, 'caught in an explosion'); if (d < R2 && !P.vehicle && P.ch?.anim && g.health.hp > 0) P.ch.anim.play?.('stumble', 0.8); } }
  }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt; this.U.uTime.value = this.t; const g = this.g, A = g.atmos;
    if (A && A.sun) { // sun direction in view space + light levels for the smoke shading
      const cam = g.camera; const sv = this.U.uSunV.value.copy(A.sun.position).sub(A.sun.target.position).normalize().transformDirection(cam.matrixWorldInverse);
      const day = 1 - (A.night || 0); this.U.uSunC.value.copy(A.sun.color).multiplyScalar(Math.min(1.2, A.sun.intensity * 0.32)); this.U.uAmb.value.setRGB(0.12 + 0.38 * day, 0.12 + 0.38 * day, 0.14 + 0.4 * day); if (g.indoor) this.U.uAmb.value.setRGB(0.2, 0.2, 0.2); void sv;
      if (A.w) this.U.uWind.value.set(0.83, 0, 0.55).multiplyScalar(0.6 + (A.w.wind || 0) * 3); // the sea breeze blows inland (west → east)
    }
    // flash light: the brightest live blast
    let best = null, bi = 0; for (const f of this.flashes) { f.t += dt; const fl = f.t < 1.2 ? (900 * Math.exp(-f.t * 16) + 120 * Math.exp(-f.t * 2.6) * (0.75 + 0.25 * Math.sin(f.t * 47) * Math.sin(f.t * 23))) * f.pow : 0; if (fl > bi) { bi = fl; best = f; } }
    this.flashes = this.flashes.filter((f) => f.t < 1.2);
    if (best) { this.light.position.set(best.x, best.y, best.z); this.light.intensity = bi; this.light.distance = 32 + 10 * best.pow; } else if (this.light.intensity) { this.light.intensity = 0; this.light.position.y = -500; }
    // debris
    let any = false; const m = this._m, col = g.collision;
    for (let i = 0; i < DEBRIS_N; i++) { const k = this.chunks[i]; if (!k) continue; any = true; k.t += dt;
      if (k.t > k.life) { this.chunks[i] = null; this.debris.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
      if (!k.rest) { k.vy -= 9.81 * dt; k.x += k.vx * dt; k.y += k.vy * dt; k.z += k.vz * dt; k.rx += k.wx * dt; k.ry += k.wy * dt; const gy = col ? col.groundAt(k.x, k.z, k.y + 0.2, 0.3) : 0;
        if (k.y < gy + k.s) { k.y = gy + k.s; if (Math.abs(k.vy) < 1.2) { k.rest = true; } k.vy = -k.vy * 0.35; k.vx *= 0.55; k.vz *= 0.55; k.wx *= 0.5; k.wy *= 0.5; } }
      const sc = k.s * (k.t > k.life - 1 ? (k.life - k.t) : 1); this.debris.setMatrixAt(i, m.compose(this._s.set(k.x, k.y, k.z), this._q.setFromEuler(this._e.set(k.rx, k.ry, 0)), new THREE.Vector3(sc, sc * 0.7, sc))); }
    if (any || this._debrisWas) this.debris.instanceMatrix.needsUpdate = true; this._debrisWas = any;
    for (const S of this.scorch) if (S.m.visible) { S.t += dt; if (S.t > 150) { S.m.material.opacity = Math.max(0, 0.9 - (S.t - 150) / 30); if (S.m.material.opacity <= 0) { S.m.visible = S === this.scorch[0]; S.m.position.y = -1000; } } }
    // the particle meshes stay 'visible' even when idle (dead particles are collapsed off-screen in the vertex shader: no pixels):
    // that way their shaders are compiled with the rest of the scene at load, not on the first blast (a visible hitch)
  }
}
export const _testing = { FIRE_N, SMOKE_N, SPARK_N };
