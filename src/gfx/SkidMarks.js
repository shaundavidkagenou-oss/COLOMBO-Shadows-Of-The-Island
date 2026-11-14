// Skid marks: dark rubber laid on the road by slipping tyres (burnouts, launches, handbrake slides, drifts, locked-wheel stops,
// crash shoves). Driven by VehicleSmoke.tyres() — the same contact points and slip intensity that make the tyre smoke.
//   • one instanced draw call, a fixed ring pool allocated at load, partial uploads of only the slots written this frame;
//   • each slipping wheel keeps an OPEN segment it stretches every frame; once it is 0.6 m long it is committed and a new one starts
//     from its end, so a slide leaves a continuous stripe. A wheel spinning on the spot keeps rewriting one tyre-sized patch that
//     darkens the longer it spins (a burnout patch), it does not fill the pool;
//   • the mark is darker the harder the slip, streaked along its length by the tread grooves, broken up by the road grain, and fades
//     out over ~2.5 minutes (oldest slots are reused first). No lighting: rubber only darkens what is under it, day or night.
import * as THREE from 'three';

export const SKID_POOL = 1536;
export const SKID_LIFE = 150; // s
export const SKID_LIFE_Q = { low: 75, medium: 110, high: 150, ultra: 200 };
const SEG = 0.6, PATCH = 0.26, STALE = 0.25;

const VS = `
attribute vec3 aA; attribute vec3 aB; attribute vec4 aW;
uniform float uTime; uniform float uLife;
varying vec2 vQ; varying float vA; varying vec2 vW;
void main() {
  float age = uTime - aW.z;
  if (age < 0.0 || age > uLife || aW.y <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 d = aB.xz - aA.xz; float L = max(length(d), 1e-4); d /= L; vec2 n = vec2(-d.y, d.x);
  float t = position.y + 0.5;                                     // 0 at A .. 1 at B
  vec3 p = mix(aA, aB, t); p.xz += n * position.x * aW.x; p.y += 0.018;
  vQ = vec2(position.x * 2.0, t * L); vW = p.xz;
  vA = aW.y * (1.0 - smoothstep(uLife * 0.45, uLife, age));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FS = `
uniform sampler2D uNoise;
varying vec2 vQ; varying float vA; varying vec2 vW;
void main() {
  float edge = smoothstep(1.0, 0.55, abs(vQ.x));                  // soft tyre-shoulder edges
  float groove = 0.72 + 0.28 * smoothstep(0.25, 0.75, abs(sin(vQ.x * 7.0)));   // tread grooves leave lighter lines
  float grain = texture2D(uNoise, vW * 0.9).r, blot = texture2D(uNoise, vW * 0.13 + 0.37).r;
  float a = vA * edge * groove * (0.55 + 0.6 * grain) * (0.7 + 0.5 * blot);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vec3(0.018, 0.018, 0.02) * a, a);
}`;

export class SkidMarks {
  constructor(scene, noiseUniform, timeUniform) {
    this.U = { uTime: timeUniform || { value: 0 }, uNoise: noiseUniform || { value: null }, uLife: { value: SKID_LIFE } };
    const base = new THREE.PlaneGeometry(1, 1); const geo = new THREE.InstancedBufferGeometry(); geo.index = base.index; geo.setAttribute('position', base.attributes.position);
    this.A = {}; for (const [name, size] of [['aA', 3], ['aB', 3], ['aW', 4]]) { const a = new THREE.InstancedBufferAttribute(new Float32Array(SKID_POOL * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); this.A[name] = a; }
    for (let i = 0; i < SKID_POOL; i++) this.A.aW.setXYZW(i, 0, 0, -1e4, 0);
    geo.instanceCount = SKID_POOL; this.geo = geo; this.i = 0; this.dirty = new Set(); this.open = new WeakMap(); this.stats = { segs: 0, patches: 0, writes: 0 };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.U, transparent: true, depthWrite: false, depthTest: true,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation, premultipliedAlpha: true });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 2; this.mesh.userData.fx = true; this.mesh.name = 'skidMarks';
    if (scene) scene.add(this.mesh);
    this.flushAll();
  }
  get t() { return this.U.uTime.value; }
  // graphics quality: how long laid rubber stays on the road before fading (high = the original 150 s; one draw call either way)
  setQuality(q) { this.U.uLife.value = SKID_LIFE_Q[q] || SKID_LIFE; }
  // one slipping wheel this frame: contact moved (x0,z0) → (x1,z1); inten 0..1; w = tyre width (m)
  mark(v, wheel, x0, z0, x1, z1, gy, inten, w) {
    let per = this.open.get(v); if (!per) { per = []; this.open.set(v, per); }
    const t = this.t; let o = per[wheel];
    if (!o || t - o.t > STALE) { o = per[wheel] = { slot: this.next(), ax: x0, az: z0, ay: gy, a: 0, t, born: t }; this.stats.segs++; }
    o.t = t; o.a = Math.min(0.85, Math.max(o.a, 0.28 + 0.5 * inten) + 0.004 * inten); // spinning on the spot keeps darkening it
    let ax = o.ax, az = o.az, bx = x1, bz = z1; const L = Math.hypot(bx - ax, bz - az);
    if (L < PATCH) { const fx = Math.sin(v.yaw || 0), fz = Math.cos(v.yaw || 0), mx = (ax + bx) / 2, mz = (az + bz) / 2; // a tyre-sized burnout patch
      ax = mx - fx * PATCH / 2; az = mz - fz * PATCH / 2; bx = mx + fx * PATCH / 2; bz = mz + fz * PATCH / 2; }
    this.write(o.slot, ax, o.ay, az, bx, gy, bz, w, o.a, o.born);
    if (L >= SEG) { const slot = this.next(); per[wheel] = { slot, ax: x1, az: z1, ay: gy, a: o.a * 0.9, t, born: t }; this.stats.segs++; } // commit, start the next
    else if (L < PATCH) this.stats.patches++;
  }
  next() { const i = this.i; this.i = (i + 1) % SKID_POOL; return i; }
  write(i, ax, ay, az, bx, by, bz, w, a, born) {
    const A = this.A; A.aA.setXYZ(i, ax, ay, az); A.aB.setXYZ(i, bx, by, bz);
    A.aW.setXYZW(i, w, a, born, 0);
    this.dirty.add(i); this.stats.writes++;
  }
  flushAll() { for (const a of Object.values(this.A)) { a.clearUpdateRanges(); a.needsUpdate = true; } }
  // upload only the slots written this frame (they are near each other in the ring: one range, two when it wraps)
  flush() {
    if (!this.dirty.size) return; let lo = SKID_POOL, hi = -1; const head = this.i;
    for (const i of this.dirty) { const r = (i - head + SKID_POOL) % SKID_POOL; if (r < lo) lo = r; if (r > hi) hi = r; }
    const s = (lo + head) % SKID_POOL, n = hi - lo + 1, wrap = s + n > SKID_POOL;
    for (const a of Object.values(this.A)) { a.clearUpdateRanges(); const k = a.itemSize;
      if (!wrap) a.addUpdateRange(s * k, n * k); else { a.addUpdateRange(s * k, (SKID_POOL - s) * k); a.addUpdateRange(0, (n - (SKID_POOL - s)) * k); }
      a.needsUpdate = true; }
    this.dirty.clear();
  }
  clear() { for (let i = 0; i < SKID_POOL; i++) this.A.aW.setXYZW(i, 0, 0, -1e4, 0); this.open = new WeakMap(); this.dirty.clear(); this.flushAll(); }
}
