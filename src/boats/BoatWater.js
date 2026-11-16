// Boats and the water: the live sea surface on the CPU (the very Gerstner swell the ocean shader draws, so a hull rides the
// waves you see), and the water's reaction to a moving hull:
//  * wakes — one ribbon per moving boat laid on the surface behind it: the white propeller / jet wash straight behind the
//    transom, the two Kelvin wake arms spreading at 19.5° from the track (the angle is the same for any ship at any speed),
//    faint transverse crests between them, foam broken up by noise; old wake fades out over half a minute in calm water.
//    All boats share ONE dynamic mesh (one draw call), drawn just after the water; it lives in the water group so the
//    planar reflection (which hides that group) never mirrors it;
//  * spray — bow spray / jet-ski rooster tails / slamming spray when a fast hull hits a crest, emitted into the explosion
//    system's existing particle pool (white water kind, no new draw calls).
import * as THREE from 'three';
import * as L from '../world/Layout.js';
import { waterUniforms } from '../world/Water.js';

// ---------------------------------------------------------------------------------------------------- the sea surface
const WAVES = [[1, 0.22, 0.42, 61, 0.55], [0.92, -0.38, 0.26, 33, 0.6], [0.97, 0.55, 0.17, 19, 0.65], [0.6, -0.8, 0.09, 11.5, 0.6], [0.75, 0.66, 0.06, 7.3, 0.55], [0.99, -0.1, 0.035, 4.6, 0.5]]
  .map(([dx, dz, amp, len, q]) => { const l = Math.hypot(dx, dz); const k = (Math.PI * 2) / len; return { dx: dx / l, dz: dz / l, amp, k, c: Math.sqrt(9.81 / k), q }; });
const OCEAN = [-1880, -480, -1500, 1700]; // the swell mesh (Water.js buildWater, uBounds)
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const coastGL = (z) => (z < -660 ? -515 + 3 * Math.sin(z / 40) : -520 + 5 * Math.sin(z / 95) + 3 * Math.sin(z / 31)); // COAST_GLSL
export const HARBOUR_Y = -0.95; // the flat harbour plane (and the marina in it)
function swellAmp(x, z) {
  if (x < OCEAN[0] || x > OCEAN[1] || z < OCEAN[2] || z > OCEAN[3]) return 0;
  const wind = waterUniforms.uWind.value ?? 0.3; const sea = 0.55 + 1.1 * wind; const shore = sstep(2, 40, coastGL(z) - x);
  const edge = Math.min(x - OCEAN[0], OCEAN[1] - x, z - OCEAN[2], OCEAN[3] - z);
  return sea * (0.35 + 0.65 * shore) * sstep(10, 120, edge);
}
const _w = { y: 0, dx: 0, dz: 0, a: 0 };
// height of the water surface at (x, z) now, plus its slope (dx, dz) — one fixed-point step undoes the Gerstner
// horizontal displacement so the height is the one drawn at (x, z), not at the vertex that started there
export function waterAt(x, z, out = _w) {
  const base = L.inLake(x, z) ? -0.55 : L.inCanal(z) && !L.isSea(x, z) ? -1.0 : x < OCEAN[0] ? -1.0 : x <= OCEAN[1] && z >= OCEAN[2] && z <= OCEAN[3] ? -0.9 : HARBOUR_Y;
  const a = swellAmp(x, z); out.a = a;
  if (a <= 1e-4) { out.y = base; out.dx = 0; out.dz = 0; return out; }
  const t = waterUniforms.uTime.value || 0;
  let px = x, pz = z;
  for (let it = 0; it < 2; it++) { let ox = 0, oz = 0; for (const w of WAVES) { const f = w.k * (w.dx * px + w.dz * pz - w.c * t); const qa = w.q * w.amp * a * Math.cos(f); ox += w.dx * qa; oz += w.dz * qa; } px = x - ox; pz = z - oz; }
  let h = 0, gx = 0, gz = 0;
  for (const w of WAVES) { const f = w.k * (w.dx * px + w.dz * pz - w.c * t); const am = w.amp * a; h += am * Math.sin(f); const d = am * w.k * Math.cos(f); gx += w.dx * d; gz += w.dz * d; }
  out.y = base + h; out.dx = gx; out.dz = gz; return out;
}
export const waterY = (x, z) => waterAt(x, z).y;

// ---------------------------------------------------------------------------------------------------- wakes
const MAXTR = 10, MAXP = 56, ACROSS = [-1, -0.62, -0.25, 0, 0.25, 0.62, 1], NA = ACROSS.length, LIFE = 32, SPREAD = Math.tan((19.47 * Math.PI) / 180);
function noiseTex() { // small tiling value noise (R, G octaves) for foam breakup
  const N = 64, d = new Uint8Array(N * N * 4); const r = (i, j, s) => { const h = Math.sin(((i % N) * 127.1 + (j % N) * 311.7 + s * 74.7)) * 43758.5453; return h - Math.floor(h); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const o = (j * N + i) * 4; let a = 0, b = 0;
    for (const [f, w] of [[4, 0.5], [8, 0.3], [16, 0.2]]) { const s = N / f; const x0 = Math.floor(i / s), y0 = Math.floor(j / s), fx = i / s - x0, fy = j / s - y0; const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const v = (q) => { const c00 = r(x0, y0, q), c10 = r((x0 + 1) % f, y0, q), c01 = r(x0, (y0 + 1) % f, q), c11 = r((x0 + 1) % f, (y0 + 1) % f, q); return (c00 * (1 - sx) + c10 * sx) * (1 - sy) + (c01 * (1 - sx) + c11 * sx) * sy; };
      a += v(1 + f) * w; b += v(7 + f) * w; }
    d[o] = a * 255; d[o + 1] = b * 255; d[o + 2] = 0; d[o + 3] = 255; }
  const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
}
const wakeVert = /* glsl */`
  attribute vec4 aW; attribute float aD; varying vec4 vW; varying float vD; varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() { vW = aW; vD = aD; vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const wakeFrag = /* glsl */`
  uniform sampler2D uNoise; uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyTop; uniform float uNight; uniform vec3 uLit;
  varying vec4 vW; varying float vD; varying vec3 vWorld;
  #include <fog_pars_fragment>
  void main() {
    float u = abs(vW.x), age = vW.y, spd = vW.z, ratio = max(vW.w, 1.0);
    float n1 = texture2D(uNoise, vWorld.xz * 0.06 + vec2(uTime * 0.004, 0.0)).r;
    float n2 = texture2D(uNoise, vWorld.xz * 0.23 - vec2(0.0, uTime * 0.01)).g;
    float n3 = texture2D(uNoise, vWorld.xz * 0.9 + vec2(uTime * 0.03)).r;
    float core = 1.0 / ratio;                                                   // the hull's own width within the ribbon
    float band = 1.0 - smoothstep(core * 0.35, core * 1.25 + 0.04, u); float wash = band * exp(-age * 0.3) * smoothstep(0.05, 0.3, spd);
    float aer = (1.0 - smoothstep(core * 0.4, core * 1.7 + 0.06, u)) * exp(-age * 0.085) * smoothstep(0.05, 0.3, spd) * (0.6 + 0.4 * n1);   // aerated water left by the props: paler, not foam
    float washF = wash * smoothstep(0.3, 0.62, n1 * 0.55 + n2 * 0.45 + n3 * 0.25 + wash * 0.35 - age * 0.028);
    float armW = mix(0.05, 0.11, smoothstep(0.0, 12.0, age));                 // each Kelvin arm: a crest line near the ribbon edge
    float arm = exp(-pow((u - 0.86) / armW, 2.0)) * exp(-age * 0.09) * smoothstep(0.08, 0.5, spd);
    float armF = arm * smoothstep(0.38, 0.72, n2 * 0.8 + n3 * 0.35);
    float trans = (0.5 + 0.5 * sin(vD * 1.1)) * (1.0 - smoothstep(0.55, 0.9, u)) * exp(-age * 0.22) * spd;   // transverse crests
    float edge = 1.0 - smoothstep(0.93, 1.0, u);
    float foam = clamp(washF * 0.95 + armF * 0.6 + arm * 0.07 + trans * 0.06, 0.0, 0.94); float a0 = max(foam, aer * 0.2); float a = a0 * edge * (1.0 - smoothstep(${(LIFE * 0.75).toFixed(1)}, ${LIFE.toFixed(1)}, age));
    if (a < 0.004) discard;
    vec3 light = uSkyTop * 0.55 + uSunColor * max(uSunDir.y, 0.0) * 0.9;     // white water lit by sky + sun
    light = light * (1.0 - 0.93 * uNight) + uLit;                             // at night only what the lamps give it
    vec3 col = mix(vec3(0.42, 0.78, 0.80), vec3(0.93, 0.96, 0.97), clamp(foam / max(a0, 1e-3), 0.0, 1.0));   // foam white, aerated water pale turquoise
    gl_FragColor = vec4(col * light, a);
    #include <fog_fragment>
  }`;
export class Wakes {
  constructor(group) {
    const nv = MAXTR * MAXP * NA; this.pos = new Float32Array(nv * 3); this.w = new Float32Array(nv * 4); this.d = new Float32Array(nv);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aW', new THREE.BufferAttribute(this.w, 4).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aD', new THREE.BufferAttribute(this.d, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let t = 0; t < MAXTR; t++) for (let p = 0; p < MAXP - 1; p++) for (let a = 0; a < NA - 1; a++) { const o = (t * MAXP + p) * NA + a; idx.push(o, o + 1, o + NA, o + 1, o + NA + 1, o + NA); } /* counter-clockwise seen from above (the ribbon's +u side is to starboard of the trail), so FrontSide keeps it */
    g.setIndex(idx); g.setDrawRange(0, 0); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5); this.geo = g;
    this.U = { uNoise: { value: noiseTex() }, uTime: waterUniforms.uTime, uSunDir: waterUniforms.uSunDir, uSunColor: waterUniforms.uSunColor, uSkyTop: waterUniforms.uSkyTop, uNight: waterUniforms.uNight, uLit: { value: new THREE.Color(0, 0, 0) } };
    const mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]), vertexShader: wakeVert, fragmentShader: wakeFrag, transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    Object.assign(mat.uniforms, this.U); this.mat = mat;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.name = 'boatWakes'; this.mesh.frustumCulled = false; this.mesh.renderOrder = 11; this.mesh.matrixAutoUpdate = false; group.add(this.mesh);
    this.trails = new Map(); this.t = 0;
  }
  // a boat moved: lay wake behind its transom (stern point + heading + speed); trails age out on their own
  feed(b, sx, sz, yaw, speed, halfBeam, dt) {
    let T = this.trails.get(b); if (!T) { if (Math.abs(speed) < 0.6) return; if (this.trails.size >= MAXTR) { let old = null, ot = 1e9; for (const [k, v] of this.trails) if (v.last < ot) { ot = v.last; old = k; } this.trails.delete(old); } T = { pts: [], dist: 0, last: this.t, hb: halfBeam }; this.trails.set(b, T); }
    T.head = { x: sx, z: sz, yaw, s: Math.abs(speed) }; T.hb = halfBeam;
    const p0 = T.pts[0]; const moved = p0 ? Math.hypot(sx - p0.x, sz - p0.z) : 99;
    if (Math.abs(speed) > 0.6) T.last = this.t;
    if (moved > Math.min(4, 0.9 + Math.abs(speed) * 0.18) && Math.abs(speed) > 0.6) { T.dist += p0 ? moved : 0; T.pts.unshift({ x: sx, z: sz, t: this.t, d: T.dist, s: Math.min(1, Math.abs(speed) / 14), hb: halfBeam }); if (T.pts.length > MAXP - 1) T.pts.length = MAXP - 1; }
  }
  drop(b) { this.trails.delete(b); }
  update(dt, litCol) {
    this.t += dt; if (litCol) this.U.uLit.value.copy(litCol);
    let k = 0; const P = this.pos, W = this.w, D = this.d;
    for (const [b, T] of this.trails) {
      while (T.pts.length && this.t - T.pts[T.pts.length - 1].t > LIFE) T.pts.pop();
      if (!T.pts.length && this.t - T.last > 1) { this.trails.delete(b); continue; }
      const H = T.head; if (!H) continue; const live = H.s > 0.6 && this.t - T.last < 0.5;
      const pts = live ? [{ x: H.x, z: H.z, t: this.t, d: T.dist + (T.pts[0] ? Math.hypot(H.x - T.pts[0].x, H.z - T.pts[0].z) : 0), s: Math.min(1, H.s / 14), hb: T.hb }, ...T.pts] : T.pts;
      if (pts.length < 2 || k >= MAXTR) continue; const dNow = pts[0].d; const base = k * MAXP * NA;
      for (let i = 0; i < MAXP; i++) {
        const p = pts[Math.min(i, pts.length - 1)]; const a = pts[Math.min(pts.length - 1, Math.max(0, i - 1))], c = pts[Math.min(pts.length - 1, i + 1)]; /* past the end: the last point repeated (age LIFE → invisible) */
        let tx = a.x - c.x, tz = a.z - c.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl; if (i === 0 && live) { tx = Math.sin(H.yaw); tz = Math.cos(H.yaw); }
        const nx = tz, nz = -tx; const age = this.t - p.t; const hw = Math.min(46, p.hb + SPREAD * Math.max(0, dNow - p.d) * Math.min(1, 0.35 + p.s * 1.6)); const ratio = hw / Math.max(0.3, p.hb);
        for (let j = 0; j < NA; j++) { const o = base + i * NA + j; const u = ACROSS[j]; const x = p.x + nx * u * hw, z = p.z + nz * u * hw;
          P[o * 3] = x; P[o * 3 + 1] = waterAt(x, z).y + 0.035; P[o * 3 + 2] = z;
          W[o * 4] = u; W[o * 4 + 1] = i >= pts.length ? LIFE : age; W[o * 4 + 2] = p.s; W[o * 4 + 3] = ratio; D[o] = p.d; }
      }
      k++;
    }
    this.geo.setDrawRange(0, k * (MAXP - 1) * (NA - 1) * 6);
    if (k) { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aW.needsUpdate = true; this.geo.attributes.aD.needsUpdate = true; }
    this.mesh.visible = k > 0;
  }
}

// ---------------------------------------------------------------------------------------------------- spray
const _p = new THREE.Vector3(), _v = new THREE.Vector3();
// white water into the explosion system's particle pool (kind 3 = water spray: drifts, falls back, fades)
export function spray(E, x, y, z, vx, vy, vz, n, size = 1, wy = y) {
  if (!E || !E.smoke) return; for (let i = 0; i < n; i++) {
    _p.set(x + (Math.random() - 0.5) * 0.3 * size, y, z + (Math.random() - 0.5) * 0.3 * size); _v.set(vx * (0.7 + Math.random() * 0.6) + (Math.random() - 0.5) * 1.2, vy * (0.6 + Math.random() * 0.7), vz * (0.7 + Math.random() * 0.6) + (Math.random() - 0.5) * 1.2);
    E.emit(E.smoke, 3, _p, _v, 0.5 + Math.random() * 0.7, 0.12 * size, (0.55 + Math.random() * 0.5) * size, 3, 0, 1.1, [0.93, 0, wy]); }
  E.flush(E.smoke);
}
