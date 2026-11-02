// Viharamahadevi Park life: fireflies over the lawns, hedges, tree roots and pond banks at night; the fountains' water
// (the central fountain's top jet, its two overflow curtains and the ring of arcing jets, and the plumes in the lily
// ponds) lit in slowly changing colours after dark; the colony of fruit bats (flying foxes) hanging in the giant rain
// trees by day, streaming out at dusk, flapping over the park at night and coming home at dawn; and the flickering
// flames of the oil lamps on the shrine's flower altars. Every system is one draw call; the fireflies and the water
// are animated entirely on the GPU, the bats from a few dozen CPU-steered fliers.
import * as THREE from 'three';
import { LAND_Y } from './Layout.js';
import { PARK, PONDS, POND_WATER_Y, HEDGES, BAT_TREES, onParkFeature, inPoly } from './Parks.js';
import { RNG } from '../core/rng.js';

const FIREFLIES = { low: 320, medium: 560, high: 800, ultra: 1060 };
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class ParkLife {
  constructor(world, features, quality = 'high') {
    this.world = world; this.group = new THREE.Group(); this.group.name = 'parkLife'; this.t = 0; this.scale = { value: 600 };
    this.quality = quality; this.anim = features ? features.anim : {};
    this.buildFireflies(); this.buildFountains(); this.buildBats(); this.buildFlames();
  }
  // ------------------------------------------------------------------------------------------------ fireflies
  buildFireflies() {
    const rng = new RNG(2026), N = FIREFLIES.ultra; const base = new Float32Array(N * 3), seed = new Float32Array(N * 4);
    const trees = (this.world.plan ? this.world.plan.trees : []).filter((t) => t.x > PARK.x0 && t.x < PARK.x1 && t.z > PARK.z0 && t.z < PARK.z1);
    const lawnOk = (x, z) => x > PARK.x0 + 1 && x < PARK.x1 - 1 && z > PARK.z0 + 1 && z < PARK.z1 - 1 && !onParkFeature(x, z, 0.2);
    let i = 0;
    const put = (x, z, y) => { if (i >= N) return; base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z;
      seed[i * 4] = rng.next(); seed[i * 4 + 1] = rng.range(2.2, 6.5); seed[i * 4 + 2] = rng.range(0.12, 0.35); seed[i * 4 + 3] = rng.range(0.5, 1.6); i++; };
    let guard = 0;
    while (i < N && guard++ < N * 40) { const r = rng.next(); let x, z, y;
      if (r < 0.3) { const h = HEDGES[rng.int(0, HEDGES.length - 1)]; const t = rng.next(), side = rng.next() < 0.5 ? -1 : 1; const dx = h[2] - h[0], dz = h[3] - h[1], l = Math.hypot(dx, dz) || 1;
        x = h[0] + dx * t - dz / l * side * rng.range(0.8, 1.8); z = h[1] + dz * t + dx / l * side * rng.range(0.8, 1.8); y = LAND_Y + rng.range(0.3, 1.5); if (!lawnOk(x, z)) continue; }
      else if (r < 0.55 && trees.length) { const tr = trees[rng.int(0, trees.length - 1)]; const a = rng.range(0, 6.28), d = rng.range(1, 4.5); x = tr.x + Math.cos(a) * d; z = tr.z + Math.sin(a) * d; y = LAND_Y + rng.range(0.4, 3.6); if (!lawnOk(x, z)) continue; }
      else if (r < 0.75) { const pd = PONDS[rng.int(0, PONDS.length - 1)]; const p = pd.poly[rng.int(0, pd.poly.length - 1)]; const dx = p[0] - pd.cx, dz = p[1] - pd.cz, l = Math.hypot(dx, dz); const o = rng.range(-1.2, 2.2);
        x = p[0] + dx / l * o; z = p[1] + dz / l * o; y = (inPoly(x, z, pd.poly) ? POND_WATER_Y + 0.25 : LAND_Y) + rng.range(0.2, 1.3); if (Math.abs(x - pd.bridge.x) < 2) continue; }
      else { x = rng.range(PARK.x0 + 4, PARK.x1 - 4); z = rng.range(PARK.z0 + 4, PARK.z1 - 4); y = LAND_Y + rng.range(0.3, 2.2); if (!lawnOk(x, z)) continue; }
      put(x, z, y); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(base, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(PARK.cx, 3, PARK.cz), 160);
    this.ffU = { uTime: { value: 0 }, uOn: { value: 0 }, uScale: this.scale };
    const m = new THREE.ShaderMaterial({ uniforms: this.ffU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec4 aSeed; uniform float uTime, uOn, uScale; varying float vGlow, vCore;
        void main() {
          float t = uTime, f = aSeed.z, a = aSeed.w; vec3 p = position;
          p.x += sin(t * f + aSeed.x * 6.283) * a + sin(t * f * 0.37 + aSeed.x * 17.0) * a * 0.7;
          p.z += cos(t * f * 0.83 + aSeed.x * 11.0) * a + sin(t * f * 0.29 + aSeed.x * 23.0) * a * 0.7;
          p.y += sin(t * f * 1.7 + aSeed.x * 31.0) * 0.22 + sin(t * 0.19 + aSeed.x * 7.0) * 0.18;
          float ph = fract(t / aSeed.y + aSeed.x * 7.13);
          float flash = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.08, 0.26, ph));                     // a quick rise, a softer fade
          float dbl = step(0.62, fract(aSeed.x * 3.7)) * smoothstep(0.2, 0.24, ph) * (1.0 - smoothstep(0.24, 0.31, ph)); // some flash twice
          float fl = max(flash, dbl);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float dist = max(0.5, -mv.z);
          vGlow = (0.22 + 0.78 * fl) * uOn * (1.0 - smoothstep(70.0, 150.0, dist)); vCore = fl;
          gl_PointSize = clamp(uScale * (0.34 + 0.3 * fl) / dist, 4.0, 40.0);   // the sprite carries the glow halo round the tiny lantern
        }`,
      fragmentShader: `varying float vGlow, vCore;
        void main() { vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d) * 4.0; if (r2 > 1.0) discard;
          float core = exp(-r2 * 10.0), halo = exp(-r2 * 3.0) * (1.0 - r2) * 0.6;
          vec3 c = mix(vec3(0.55, 0.95, 0.18), vec3(0.92, 1.0, 0.5), core * vCore);
          gl_FragColor = vec4(c * (core * 7.0 + halo * 1.8), clamp((core + halo) * vGlow, 0.0, 1.0)); }`, toneMapped: false });
    const pts = new THREE.Points(g, m); pts.frustumCulled = true; pts.name = 'fireflies'; pts.renderOrder = 5; this.fireflies = pts; this.group.add(pts);
    this.setQuality(this.quality);
  }
  setQuality(q) { this.quality = q; if (this.fireflies) this.fireflies.geometry.setDrawRange(0, FIREFLIES[q] || FIREFLIES.high); }
  // ------------------------------------------------------------------------------------------------ fountains
  buildFountains() {
    const rng = new RNG(3301), P = [], V = [], S = []; const cx = 90, cz = -60, y0 = LAND_Y;
    const add = (o, v, life, size, floorY) => { P.push(...o); V.push(...v); S.push(rng.next(), life, size, floorY); }; // floorY: the water it falls into
    for (let k = 0; k < 260; k++) { const a = rng.range(0, 6.28), sp = rng.range(0, 0.28); const vy = rng.range(6.0, 6.7); add([cx, y0 + 5.0, cz], [Math.cos(a) * sp, vy, Math.sin(a) * sp], 2 * vy / 9.8 + 0.1, rng.range(0.06, 0.12), y0 + 4.62); } // top jet, into the upper bowl
    for (let k = 0; k < 220; k++) { const a = k / 220 * 6.283 + rng.range(-0.01, 0.01), r = 1.62, v = rng.range(0.35, 0.6); add([cx + Math.cos(a) * r, y0 + 4.72, cz + Math.sin(a) * r], [Math.cos(a) * v, rng.range(-0.1, 0.05), Math.sin(a) * v], 0.6, rng.range(0.05, 0.09), y0 + 3.0); } // upper overflow, into the lower bowl
    for (let k = 0; k < 420; k++) { const a = k / 420 * 6.283 + rng.range(-0.005, 0.005), r = 3.52, v = rng.range(0.45, 0.75); add([cx + Math.cos(a) * r, y0 + 3.1, cz + Math.sin(a) * r], [Math.cos(a) * v, rng.range(-0.1, 0.05), Math.sin(a) * v], 0.74, rng.range(0.05, 0.1), y0 + 0.5); } // lower overflow, into the basin
    for (let j = 0; j < 16; j++) { const a = j / 16 * 6.283; for (let k = 0; k < 72; k++) { const vy = 6.2 + rng.range(-0.15, 0.15), vh = 3.8 + rng.range(-0.12, 0.12), jt = rng.range(-0.03, 0.03);
      add([cx + Math.cos(a) * 9.6, y0 + 0.55, cz + Math.sin(a) * 9.6], [-Math.cos(a + jt) * vh, vy, -Math.sin(a + jt) * vh], 2 * vy / 9.8 + 0.02, rng.range(0.06, 0.11), y0 + 0.5); } } // ring of arcing jets
    for (const pd of PONDS) for (const [jx, jz] of pd.jets) for (let k = 0; k < 170; k++) { const a = rng.range(0, 6.28), sp = rng.range(0.1, 0.55), vy = rng.range(4.6, 5.6); add([jx, POND_WATER_Y + 0.05, jz], [Math.cos(a) * sp, vy, Math.sin(a) * sp], 2 * vy / 9.8, rng.range(0.07, 0.13), POND_WATER_Y); } // pond plumes
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aVel', new THREE.Float32BufferAttribute(V, 3)); g.setAttribute('aSeed', new THREE.Float32BufferAttribute(S, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(115, 3, -60), 75);
    this.wU = { uTime: { value: 0 }, uScale: this.scale, uDay: { value: 1 }, uLight: { value: new THREE.Color(1, 1, 1) }, uLit: { value: 0 } };
    const m = new THREE.ShaderMaterial({ uniforms: this.wU, transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 aVel; attribute vec4 aSeed; uniform float uTime, uScale; varying float vA;
        void main() {
          float life = aSeed.y, age = fract(uTime / life + aSeed.x) * life; vec3 p = position + aVel * age; p.y -= 4.9 * age * age;
          vA = (1.0 - smoothstep(0.8, 1.0, age / life)) * step(aSeed.w, p.y) * 0.7;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float dist = max(0.5, -mv.z);
          gl_PointSize = clamp(uScale * aSeed.z * (1.0 + age * 0.8) / dist, 1.0, 40.0); vA *= 1.0 - smoothstep(90.0, 160.0, dist);
        }`,
      fragmentShader: `uniform float uDay, uLit; uniform vec3 uLight; varying float vA;
        void main() { vec2 d = gl_PointCoord - 0.5; float r2 = dot(d, d) * 4.0; if (r2 > 1.0) discard; float a = (1.0 - r2) * (1.0 - r2) * vA;
          vec3 c = vec3(0.86, 0.92, 0.97) * uDay + uLight * uLit; gl_FragColor = vec4(c, a * 0.75); }` });
    const pts = new THREE.Points(g, m); pts.name = 'fountainWater'; pts.renderOrder = 4; this.water = pts; this.group.add(pts);
  }
  // ------------------------------------------------------------------------------------------------ fruit bats
  buildBats() {
    const rng = new RNG(1858); const col = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
    const merge = (list) => { const pos = [], nor = [], cc = [], wing = [], idx = []; for (const g of list) { const o = pos.length / 3; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); cc.push(...g.attributes.color.array);
      const w = g.userData.wing || 0; for (let i = 0; i < g.attributes.position.count; i++) wing.push(w ? g.attributes.position.array[i * 3] : 0); if (g.index) for (const i of g.index.array) idx.push(i + o); else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + o); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1)); g.setIndex(idx); return g; };
    const DARK = [0.09, 0.07, 0.06], MANTLE = [0.42, 0.24, 0.1], BODY = [0.16, 0.11, 0.08];
    // hanging: wings wrapped round the body like a cloak, head down, the rufous mantle at the shoulders, feet gripping above
    const cloak = col(new THREE.SphereGeometry(1, 10, 8).scale(0.085, 0.16, 0.075).translate(0, -0.16, 0), DARK);
    const mantle = col(new THREE.SphereGeometry(1, 8, 6).scale(0.06, 0.05, 0.06).translate(0, -0.3, 0.005), MANTLE);
    const head = col(new THREE.ConeGeometry(0.035, 0.09, 8).rotateX(Math.PI).translate(0, -0.37, 0.012), MANTLE);
    const ears = [-1, 1].map((s) => col(new THREE.ConeGeometry(0.012, 0.03, 5).translate(s * 0.022, -0.325, 0.0).rotateZ(s * 0.3), DARK));
    const feet = col(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 4).translate(0, -0.015, 0), DARK);
    const hang = merge([cloak, mantle, head, ...ears, feet]);
    const roost = [];
    for (const [tx, tz, s] of BAT_TREES) { const H = 13 * s; for (let k = 0; k < 46; k++) { const a = rng.range(0, 6.28), d = rng.range(1.6, 5.8) * s; roost.push([tx + Math.cos(a) * d, LAND_Y + H * rng.range(0.56, 0.68) - d * 0.12, tz + Math.sin(a) * d, rng.range(0, 6.28), rng.range(1.0, 1.25)]); } }
    for (let i = roost.length - 1; i > 0; i--) { const j = rng.int(0, i); [roost[i], roost[j]] = [roost[j], roost[i]]; } // random order: the colony leaves in no particular order
    const hm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); this.batU = { uTime: { value: 0 } };
    hm.onBeforeCompile = (sh) => { sh.uniforms.uTime = this.batU.uTime; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ph = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.283;
          float sw = sin(uTime * 1.3 + ph) * 0.07 + sin(uTime * 0.37 + ph * 2.0) * 0.05; float c = cos(sw), s = sin(sw);
          transformed.xy = vec2(transformed.x * c - transformed.y * s, transformed.x * s + transformed.y * c); }`); };
    hm.customProgramCacheKey = () => 'batHang';
    const im = new THREE.InstancedMesh(hang, hm, roost.length); const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    roost.forEach(([x, y, z, r, s], i) => im.setMatrixAt(i, mm.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, r, 0)), new THREE.Vector3(s, s, s))));
    im.castShadow = true; im.name = 'batsHanging'; this.hanging = im; this.roost = roost; this.group.add(im);
    // flying: body, head and two membrane wings (aWing = span coordinate, folded in the vertex shader). Wingspan ~1.3 m
    const body = col(new THREE.SphereGeometry(1, 8, 6).scale(0.06, 0.055, 0.15), BODY);
    const fh = col(new THREE.ConeGeometry(0.035, 0.1, 8).rotateX(Math.PI / 2).translate(0, 0.01, 0.17), MANTLE);
    const wingG = (s) => { const pts = [[0, 0.08], [0.25, 0.1], [0.45, 0.06], [0.65, 0.02], [0.62, -0.06], [0.48, -0.03], [0.36, -0.1], [0.22, -0.05], [0.1, -0.12], [0, -0.1]];
      const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x * s, z))); const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2); if (s < 0) g.scale(1, -1, 1);
      const g2 = g.toNonIndexed(); col(g2, DARK); g2.computeVertexNormals(); g2.userData.wing = 1; return g2; };
    const fly = merge([body, fh, wingG(1), wingG(-1)]);
    const fm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    fm.onBeforeCompile = (sh) => { sh.uniforms.uTime = this.batU.uTime; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aWing;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ph = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453) * 6.283; float st = sin(uTime * 15.0 + ph);   // slow deep wingbeats (~2.4 Hz)
          float sp = abs(aWing); if (sp > 0.0) { float ang = (st * 0.75 + 0.1) * smoothstep(0.0, 0.08, sp); float c = cos(ang), s = sin(ang);
            transformed.x = sign(aWing) * (sp * c); transformed.y += sp * s - (sp > 0.3 ? (sp - 0.3) * st * 0.25 : 0.0); } }`); };
    fm.customProgramCacheKey = () => 'batFly';
    const NF = 40; const fi = new THREE.InstancedMesh(fly, fm, NF); fi.count = 0; fi.name = 'batsFlying'; fi.frustumCulled = false; this.flying = fi; this.group.add(fi);
    this.fliers = []; for (let k = 0; k < NF; k++) this.fliers.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mode: '', t: 0, tx: 0, ty: 0, tz: 0, seed: rng.next() });
    this.batRng = rng;
  }
  // ------------------------------------------------------------------------------------------------ oil-lamp flames
  buildFlames() {
    const list = this.anim.flames || []; if (!list.length) return;
    const g = new THREE.SphereGeometry(1, 8, 6); g.scale(0.012, 0.035, 0.012); g.translate(0, 0.02, 0);
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.7, 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.flames = list.map(([x, y, z]) => { const f = new THREE.Mesh(g, m); f.position.set(x, y, z); this.group.add(f); return f; });
  }
  // ------------------------------------------------------------------------------------------------ per frame
  update(dt, atmos, camera) {
    this.t += dt; const t = this.t, night = atmos.night, hour = atmos.hour ?? 12;
    const cp = camera.position; const far = Math.hypot(cp.x - PARK.cx, cp.z - PARK.cz) > 420 || cp.y < -10; this.group.visible = !far;
    const an = this.anim;
    if (an.paintings) an.paintings.visible = !far && hour > 7.0 && hour < 18.25;   // the artists pack up at dusk
    if (an.flood) an.flood(camera, night);
    if (far) return;
    if (!this._sc || (this._sct = (this._sct || 0) + dt) > 1) { this._sct = 0; const cv = typeof document !== 'undefined' ? (document.querySelector('canvas.game-canvas') || document.querySelector('canvas')) : null; const h = cv ? cv.height : 720; this.scale.value = h * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov || 60) / 2); this._sc = true; }
    // fireflies: from dusk, fewer in rain and in the small hours
    const late = hour > 1.5 && hour < 5 ? 0.5 : 1; const ffOn = smooth(0.55, 0.95, night) * late * (1 - 0.85 * Math.min(1, atmos.w ? atmos.w.rain : 0));
    this.ffU.uTime.value = t; this.ffU.uOn.value = ffOn; this.fireflies.visible = ffOn > 0.01;
    // fountain water, lit in slowly shifting colours after dark
    this.wU.uTime.value = t; this.wU.uDay.value = 0.25 + 0.75 * (1 - night); this.wU.uLit.value = night * 1.1; this.wU.uLight.value.setHSL((t * 0.012) % 1, 0.55, 0.62);
    if (this.flames) { const on = night > 0.25 || (hour > 17.5 && hour < 22); for (const [i, f] of this.flames.entries()) { f.visible = on; const k = 0.85 + Math.sin(t * 13 + i * 2.1) * 0.08 + Math.sin(t * 29 + i) * 0.06; f.scale.set(1, k, 1); } }
    this.updateBats(dt, hour);
  }
  // fraction of the colony at the roost by the hour (all day; out from about 18:00, home again from about 04:45)
  static roosting(hour) { if (hour >= 6.5 && hour < 18) return 1; if (hour >= 18 && hour < 19.3) return 1 - 0.92 * smooth(18, 19.3, hour); if (hour >= 4.75 && hour < 6.5) return 0.08 + 0.92 * smooth(4.75, 6.5, hour); return 0.08; }
  updateBats(dt, hour) {
    const N = this.roost.length, home = ParkLife.roosting(hour); this.hanging.count = Math.round(N * home); this.batU.uTime.value = this.t;
    const exodus = hour >= 18 && hour < 19.6, dawn = hour >= 4.6 && hour < 6.6, night = hour >= 19.6 || hour < 4.6;
    const want = exodus ? 32 : dawn ? 26 : night ? 10 : 3; const R = this.batRng; const trees = BAT_TREES;
    const spawn = (f) => { const [tx, tz, s] = trees[R.int(0, trees.length - 1)]; f.on = true; f.t = 0;
      if (exodus) { f.mode = 'out'; f.x = tx + R.range(-4, 4); f.y = LAND_Y + 13 * s * 0.75; f.z = tz + R.range(-4, 4); const a = 0.35 + R.range(-0.25, 0.25); f.vx = Math.cos(a) * 8; f.vz = -Math.sin(a) * 8; f.vy = 2.2; } // up out of the crowns and away inland (east)
      else if (dawn) { f.mode = 'home'; const a = 0.35 + R.range(-0.4, 0.4); f.x = tx + Math.cos(a) * 380; f.z = tz - Math.sin(a) * 380; f.y = LAND_Y + R.range(45, 70); f.tx = tx + R.range(-3, 3); f.tz = tz + R.range(-3, 3); f.ty = LAND_Y + 13 * s * 0.7; f.vx = 0; f.vy = 0; f.vz = 0; }
      else { f.mode = 'roam'; f.x = tx + R.range(-6, 6); f.y = LAND_Y + R.range(12, 22); f.z = tz + R.range(-6, 6); f.vx = R.range(-5, 5); f.vy = 0; f.vz = R.range(-5, 5); f.tx = PARK.cx + R.range(-90, 90); f.tz = PARK.cz + R.range(-90, 90); f.ty = LAND_Y + R.range(18, 34); } };
    let active = 0; for (const f of this.fliers) if (f.on) active++;
    for (const f of this.fliers) if (!f.on && active < want && R.next() < dt * 1.5) { spawn(f); active++; }
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(); let n = 0;
    for (const f of this.fliers) { if (!f.on) continue; f.t += dt;
      if (f.mode === 'out') { f.vy = Math.max(0.2, f.vy - dt * 0.4); if (Math.hypot(f.x - PARK.cx, f.z - PARK.cz) > 480) f.on = false; }
      else if (f.mode === 'home') { const dx = f.tx - f.x, dy = f.ty - f.y, dz = f.tz - f.z, d = Math.hypot(dx, dy, dz); const sp = Math.min(9, 2 + d * 0.2);
        f.vx += (dx / d * sp - f.vx) * Math.min(1, dt * 1.2); f.vy += (dy / d * sp - f.vy) * Math.min(1, dt * 1.2); f.vz += (dz / d * sp - f.vz) * Math.min(1, dt * 1.2); if (d < 2.5) f.on = false; } // into the crown: it becomes one of the hanging bats
      else { const dx = f.tx - f.x, dy = f.ty - f.y, dz = f.tz - f.z, d = Math.hypot(dx, dz) + 0.01; const sp = 6.5;
        f.vx += (dx / d * sp - f.vx) * Math.min(1, dt * 0.6); f.vz += (dz / d * sp - f.vz) * Math.min(1, dt * 0.6); f.vy += (dy * 0.3 - f.vy) * Math.min(1, dt);
        if (d < 8) { f.tx = PARK.cx + R.range(-95, 95); f.tz = PARK.cz + R.range(-95, 95); f.ty = LAND_Y + R.range(16, 34); }
        if (f.t > 40 + f.seed * 50 && !night) f.on = false; if (exodus || dawn) f.on = f.t < 25; }
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; if (!f.on) continue;
      const yaw = Math.atan2(f.vx, f.vz), hs = Math.hypot(f.vx, f.vz), pitch = -Math.atan2(f.vy, hs + 0.01) * 0.6; const bank = THREE.MathUtils.clamp(((f.pyaw ?? yaw) - yaw) * 8, -0.6, 0.6); f.pyaw = yaw;
      this.flying.setMatrixAt(n++, mm.compose(pv.set(f.x, f.y, f.z), q.setFromEuler(e.set(pitch, yaw, bank, 'YXZ')), one)); }
    this.flying.count = n; this.flying.instanceMatrix.needsUpdate = true;
  }
}
