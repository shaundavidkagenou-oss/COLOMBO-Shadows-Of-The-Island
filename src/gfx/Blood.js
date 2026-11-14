// Blood effects (Settings → Graphics → Blood effects, on by default; no dismemberment, ever):
//   spray(point, dir, amount) — a bullet / blast impact: a forward spatter of droplets out along the shot (more, bigger) and a finer back
//                spatter toward the shooter, plus a brief red mist at the wound. Droplets are lit, glossy, motion-stretched streaks
//                that fall under gravity and drag; where one lands it leaves a splat shaped by how it hit (round when it falls
//                straight down, an elongated drop with a tail and satellites in its direction of travel when it hits at a shallow
//                angle — what real spatter looks like). Spatter reaching a wall behind the victim (≤ 2.5 m) stains the wall and runs.
//   wound(ch, point, dir, size) — the stain on the body itself (BloodStain.js: glued to skin / clothing in bind space, soaks
//                outward and trickles down), and the wound keeps dripping for a while — a walking or fleeing casualty leaves a
//                trail of drops.
//   pool(x, z)  — a pool spreading slowly under a body (glossy, darker and thicker at the centre, irregular edge).
//   splat(x, z, size) — a single ground splat.
// Everything dries: fresh blood is glossy crimson; over a few minutes it darkens to a matte brown-maroon crust (pools from the edge in).
// Cheap: droplets one instanced draw, mist one, ground splats 6 instanced meshes (4 round + 2 directional shapes), pools one, wall
// stains one; fixed pools allocated at load, oldest marks recycled first.
import * as THREE from 'three';
import { Settings } from '../core/Settings.js';
import { BLOOD_T, addBloodStain, bloodClone, bindPoint, writeWound, isBloodPatched } from './BloodStain.js';

const MAXP = 512, MIST = 32, SPLATS = 48, POOLS = 14, WALLS = 24, ROUND = 4, DIRN = 2, BLEED = 16;
const rnd = (a, b) => a + Math.random() * (b - a);

function blobPath(g, cx, cy, r0, k, seed) { const a = seed * 3.1, b = seed * 1.7, c = seed * 5.3; g.beginPath(); for (let i = 0; i <= 48; i++) { const t = (i / 48) * Math.PI * 2; const r = r0 * (1 + k * (0.55 * Math.sin(3 * t + a) + 0.3 * Math.sin(7 * t + b) + 0.15 * Math.sin(13 * t + c))); const x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); }
const rng = (seed) => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
// thick centre, a slightly darker rim where it beads at the edge, satellite drops and spines
function splatTexture(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 128, 128); const R = rng(seed);
  const gr = g.createRadialGradient(60, 62, 3, 64, 64, 34); gr.addColorStop(0, '#3e0303'); gr.addColorStop(0.75, '#5c0606'); gr.addColorStop(1, '#3a0303');
  g.fillStyle = gr; blobPath(g, 64, 64, 22 + (seed % 3) * 3, 0.32, seed); g.fill();
  g.fillStyle = '#4c0505';
  for (let i = 0; i < 18; i++) { const a = R() * Math.PI * 2, d = 30 + R() * 30, rr = 1.2 + R() * 3.6; g.beginPath(); g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rr * (1 + R() * 1.8), rr, a, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 6; i++) { const a = R() * Math.PI * 2; g.save(); g.translate(64, 64); g.rotate(a); g.beginPath(); g.ellipse(28, 0, 10 + R() * 10, 2 + R() * 2, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  return tex(c);
}
// a drop that hit at a shallow angle, travelling toward +u: elongated body, scalloped leading edge, a tail and a satellite ahead
function dirTexture(seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.clearRect(0, 0, 256, 64); const R = rng(seed + 11);
  const gr = g.createLinearGradient(30, 0, 200, 0); gr.addColorStop(0, '#3a0303'); gr.addColorStop(0.5, '#560505'); gr.addColorStop(1, '#480404'); g.fillStyle = gr;
  g.beginPath(); g.ellipse(84, 32, 56, 19, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(130, 22); g.quadraticCurveTo(178, 30, 206, 32); g.quadraticCurveTo(178, 34, 130, 42); g.closePath(); g.fill(); // tail
  for (let i = 0; i < 5; i++) { const y = 18 + R() * 28; g.beginPath(); g.ellipse(140 + R() * 30, y, 6 + R() * 6, 1.5 + R() * 1.5, (y - 32) * 0.02, 0, Math.PI * 2); g.fill(); } // scallops / spines forward
  g.beginPath(); g.ellipse(226 + R() * 10, 32 + (R() - 0.5) * 8, 6, 4, 0, 0, Math.PI * 2); g.fill(); // satellite drop
  return tex(c);
}
function poolTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256);
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 110); gr.addColorStop(0, '#220101'); gr.addColorStop(0.65, '#3c0303'); gr.addColorStop(0.92, '#520606'); gr.addColorStop(1, '#360303');
  g.fillStyle = gr; blobPath(g, 128, 128, 92, 0.16, 2.3); g.fill(); g.fillStyle = '#3a0404'; for (const [x, y, r] of [[40, 150, 14], [210, 96, 11], [176, 210, 9]]) { blobPath(g, x, y, r, 0.2, r); g.fill(); }
  return tex(c);
}
// a wall stain: the spatter where it struck, with runs dribbling down from the heaviest drops (v = 0 top … 1 bottom)
function wallTexture(seed) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 128, 256); const R = rng(seed + 31);
  g.fillStyle = '#4a0505'; blobPath(g, 64, 64, 20, 0.35, seed + 3); g.fill();
  for (let i = 0; i < 26; i++) { const a = R() * Math.PI * 2, d = 22 + R() * 36, rr = 1 + R() * 3.4; g.beginPath(); g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d * 0.9, rr * (1 + R()), rr, a, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 4 + (seed % 3); i++) { const x = 46 + R() * 36, w = 1.6 + R() * 2.2, L = 70 + R() * 110; const gr = g.createLinearGradient(0, 64, 0, 64 + L); gr.addColorStop(0, '#4a0505'); gr.addColorStop(1, '#3c0404');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x - w, 64); g.lineTo(x + w, 64); g.lineTo(x + w * 0.7, 64 + L); g.arc(x, 64 + L, w * 1.15, 0, Math.PI); g.closePath(); g.fill(); } // each run ends in a bead
  return tex(c);
}
// drying: fresh glossy crimson → matte brown-maroon crust; pools dry from the edge in
function dryPatch(mat, pool) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDry; varying float vDry;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDry = aDry;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDry;')
      .replace('#include <lights_physical_fragment>', `float dk = vDry;${pool ? ' dk = clamp(vDry * 1.7 - (1.0 - length(vMapUv - 0.5) * 2.0) * 0.9, 0.0, 1.0);' : ''}
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.62, 0.42, 0.36), dk); roughnessFactor = mix(roughnessFactor, 0.8, dk);
#include <lights_physical_fragment>`);
  };
  mat.customProgramCacheKey = () => 'bloodDry' + (pool ? 'P' : ''); return mat;
}
const DROP_VS = `
attribute vec3 iP; attribute vec3 iV; attribute vec2 iS;
varying vec2 vUv; varying float vA;
void main() {
  vUv = uv; vA = iS.y; if (iS.x <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 mv = modelViewMatrix * vec4(iP, 1.0); vec2 d = (modelViewMatrix * vec4(iV, 0.0)).xy; float sp = length(d);
  vec2 ax = sp > 1e-3 ? d / sp : vec2(0.0, 1.0), ay = vec2(-ax.y, ax.x);
  float len = iS.x + min(sp * 0.014, iS.x * 7.0);                            // stretched by its motion over ~1 frame: reads as a flying streak
  mv.xy += ax * position.y * len + ay * position.x * iS.x;
  gl_Position = projectionMatrix * mv;
}`;
const DROP_FS = `
uniform vec3 uSunV; uniform vec3 uSunC; uniform vec3 uAmb;
varying vec2 vUv; varying float vA;
void main() {
  vec2 c = (vUv - 0.5) * 2.0; float r2 = dot(c, c); if (r2 > 1.0) discard;
  vec3 n = normalize(vec3(c.x, c.y * 0.6, sqrt(1.0 - r2)));                 // a glossy liquid bead
  vec3 base = vec3(0.26, 0.01, 0.012);
  float dif = max(0.0, dot(n, uSunV)) * 0.8 + 0.2; float spec = pow(max(0.0, dot(reflect(-uSunV, n), vec3(0.0, 0.0, 1.0))), 36.0);
  vec3 col = base * (uAmb + uSunC * dif) + uSunC * spec * 0.55 + uAmb * 0.06 * pow(1.0 - n.z, 3.0);
  gl_FragColor = vec4(col, 1.0);
}`;
const MIST_VS = `
attribute vec3 iP; attribute vec4 iT; attribute vec2 iD;
uniform float uTime; varying vec2 vUv; varying float vK; varying float vSeed;
void main() {
  float age = uTime - iT.x; float k = age / iT.y; vUv = uv; vK = k; vSeed = iD.x;
  if (k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 p = iP + vec3(0.0, -0.25 * age * age, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); float sz = mix(iT.z, iT.w, 1.0 - pow(1.0 - k, 2.5));
  mv.xy += position.xy * sz; gl_Position = projectionMatrix * mv;
}`;
const MIST_FS = `
uniform sampler2D uNoise; uniform vec3 uSunC; uniform vec3 uAmb;
varying vec2 vUv; varying float vK; varying float vSeed;
void main() {
  vec2 c = vUv - 0.5; float n = texture2D(uNoise, vUv * 0.7 + vSeed * 3.7).r; float shape = smoothstep(0.5, 0.1, length(c) + (n - 0.5) * 0.35);
  float a = shape * 0.42 * pow(1.0 - vK, 1.6) * smoothstep(0.0, 0.08, vK); if (a < 0.004) discard;
  vec3 col = vec3(0.42, 0.05, 0.05) * (uAmb + uSunC * 0.7) * (0.8 + 0.4 * n);
  gl_FragColor = vec4(col * a, a);
}`;

export class Blood {
  constructor(scene, collision, fxU = null) {
    this.scene = scene; this.col = collision; this.stats = { sprays: 0, splats: 0, dirSplats: 0, pools: 0, wall: 0, wounds: 0, drips: 0, mist: 0 }; this.t = 0;
    const U = fxU || {}; this.U = { uSunV: U.uSunV || { value: new THREE.Vector3(0, 1, 0) }, uSunC: U.uSunC || { value: new THREE.Color(1, 1, 1) }, uAmb: U.uAmb || { value: new THREE.Color(0.45, 0.45, 0.45) }, uNoise: U.uNoise || { value: null }, uTime: { value: 0 } };
    // droplets: CPU-simulated, drawn as instanced lit streaks
    this.pos = new Float32Array(MAXP * 3); this.vel = new Float32Array(MAXP * 3); this.life = new Float32Array(MAXP); this.size = new Float32Array(MAXP); this.head = 0; this.alive = 0;
    const quad = new THREE.PlaneGeometry(1, 1); const ig = (attrs, n) => { const g = new THREE.InstancedBufferGeometry(); g.index = quad.index; g.setAttribute('position', quad.attributes.position); g.setAttribute('uv', quad.attributes.uv);
      const A = {}; for (const [k, s] of attrs) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * s), s); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); A[k] = a; } g.instanceCount = n; return [g, A]; };
    [this.dropGeo, this.DA] = ig([['iP', 3], ['iV', 3], ['iS', 2]], MAXP); this.DA.iP.array = this.pos; this.DA.iV.array = this.vel;
    this.points = new THREE.Mesh(this.dropGeo, new THREE.ShaderMaterial({ vertexShader: DROP_VS, fragmentShader: DROP_FS, uniforms: this.U }));
    this.points.frustumCulled = false; this.points.name = 'bloodDrops'; this.points.userData.fx = true; scene.add(this.points);
    for (let i = 0; i < MAXP; i++) this.pos[i * 3 + 1] = -1e4;
    [this.mistGeo, this.MA] = ig([['iP', 3], ['iT', 4], ['iD', 2]], MIST); for (let i = 0; i < MIST; i++) this.MA.iT.setXYZW(i, -1e4, 1, 0, 0); this.mi = 0;
    this.mist = new THREE.Mesh(this.mistGeo, new THREE.ShaderMaterial({ vertexShader: MIST_VS, fragmentShader: MIST_FS, uniforms: this.U, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true }));
    this.mist.frustumCulled = false; this.mist.renderOrder = 18; this.mist.name = 'bloodMist'; this.mist.userData.fx = true; scene.add(this.mist);
    // ground marks (flat), wall stains (upright) — each instanced mesh has its own geometry for its per-instance dryness
    const flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2); const up = new THREE.PlaneGeometry(1, 2);
    const mk = (geo, map, rough, n, name, pool = false) => { const g = geo.clone(); const a = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aDry', a);
      const m = new THREE.InstancedMesh(g, dryPatch(new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), pool), n);
      m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.name = name; scene.add(m); return m; };
    this.splatMesh = []; this.splatList = [];
    for (let v = 0; v < ROUND + DIRN; v++) { this.splatMesh.push(mk(flat, v < ROUND ? splatTexture(v + 1) : dirTexture(v), 0.3, SPLATS, 'bloodSplats')); this.splatList.push([]); }
    this.poolMesh = mk(flat, poolTexture(), 0.12, POOLS, 'bloodPools', true); this.pools = [];
    this.wallMesh = mk(up, wallTexture(1), 0.34, WALLS, 'bloodWall'); this.walls = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._y = new THREE.Vector3(0, 1, 0); this._e = new THREE.Euler();
    this.bleeders = []; this.visible = true; this.n = 0; this.nd = 0; this.dryT = 0; this.dirty = new Set();
  }
  get on() { return Settings.get('blood') !== false; }
  ground(x, z, y = 0) { return this.col ? this.col.groundAt(x, z, y + 0.3) : 0; }
  drop(x, y, z, vx, vy, vz, size, life = 2.5) { const i = this.head; this.head = (this.head + 1) % MAXP; const j = i * 3;
    this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z; this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz; this.life[i] = life; this.size[i] = size; this.alive = Math.min(MAXP, this.alive + 1); return i; }
  puff(x, y, z, s0, s1, life) { const i = this.mi; this.mi = (i + 1) % MIST; this.MA.iP.setXYZ(i, x, y, z); this.MA.iT.setXYZW(i, this.t, life, s0, s1); this.MA.iD.setXY(i, Math.random(), 0);
    this.MA.iP.needsUpdate = this.MA.iT.needsUpdate = this.MA.iD.needsUpdate = true; this.stats.mist++; }
  // ------------------------------------------------------------ impacts
  spray(point, dir, amount = 1) {
    if (!this.on) return false; this.stats.sprays++; const dl = Math.hypot(dir.x, dir.z) || 1; const dx = dir.x / dl, dz = dir.z / dl;
    const nF = Math.round(12 * amount + 6), nB = Math.round(5 * amount + 3);
    for (let k = 0; k < nF + nB; k++) { const fwd = k < nF; const sp = fwd ? rnd(1.6, 4.2) : -rnd(0.8, 2.2); const cone = fwd ? 0.9 : 0.6;
      this.drop(point.x + rnd(-0.03, 0.03), point.y + rnd(-0.04, 0.04), point.z + rnd(-0.03, 0.03), dx * sp + rnd(-cone, cone), rnd(-0.3, 1.5), dz * sp + rnd(-cone, cone), fwd ? rnd(0.008, 0.026) : rnd(0.005, 0.012)); }
    this.puff(point.x + dx * 0.12, point.y, point.z + dz * 0.12, 0.08, 0.45 + 0.15 * amount, 0.42); this.puff(point.x - dx * 0.05, point.y, point.z - dz * 0.05, 0.05, 0.25, 0.3); // forward + back mist
    if (point.y - this.ground(point.x, point.z, point.y) < 2.2) { const d = rnd(0.5, 1.4); this.splat(point.x + dx * d, point.z + dz * d, rnd(0.35, 0.6) * Math.min(1.3, 0.7 + amount * 0.3), point.y); }
    this.wallHit(point, dx, dz, amount);
    return true;
  }
  // forward spatter reaching a solid wall (a building face or a compound wall) behind the victim stains it
  wallHit(p, dx, dz, amount) {
    const C = this.col; if (!C || !C.raycast || !C.query) return false; const R = 2.5;
    const t = C.raycast(p.x, p.y, p.z, p.x + dx * R, p.y, p.z + dz * R, 0, true); if (!(t < 1)) return false;
    const hx = p.x + dx * R * t, hz = p.z + dz * R * t; let box = null;
    for (const c of C.query(hx - 0.05, hz - 0.05, hx + 0.05, hz + 0.05)) { if (!(c.kind === 'building' || (c.kind === 'wall' && c.id !== 'boundary' && Math.min(c.x1 - c.x0, c.z1 - c.z0) < 0.7))) continue;
      if (hx >= c.x0 - 0.02 && hx <= c.x1 + 0.02 && hz >= c.z0 - 0.02 && hz <= c.z1 + 0.02 && p.y > (c.y0 || 0) + 0.25 && p.y < (c.y0 || 0) + c.h - 0.2) { box = c; break; } }
    if (!box) return false;
    const fd = [[hx - box.x0, -1, 0], [box.x1 - hx, 1, 0], [hz - box.z0, 0, -1], [box.z1 - hz, 0, 1]].sort((a, b) => a[0] - b[0])[0]; const nx = fd[1], nz = fd[2];
    if (nx * dx + nz * dz > -0.2) return false; // must face back toward the victim
    if (this.walls.length >= WALLS) this.walls.shift(); const s = rnd(0.32, 0.55) * Math.min(1.4, 0.75 + amount * 0.25) * (1 - t * 0.3);
    this.walls.push({ x: hx + nx * 0.012, y: p.y - s * 0.55, z: hz + nz * 0.012, yaw: Math.atan2(nx, nz), roll: rnd(-0.12, 0.12), s, born: this.t }); this.stats.wall++; this.wallDirty = true; return true;
  }
  // the stain on the body + a slow drip from the wound. ch: Character; size ~ weapon damage (1 pistol … 2.5 shotgun)
  wound(ch, point, dir, size = 1, opts = {}) {
    if (!this.on || !ch || !ch.mesh || ch.dancer || ch.disposed) return false;
    const head = ch.root ? ch.root.getObjectByName('npcHead') : null; let target = ch.mesh, slots = null;
    if (head && head.visible !== false) { head.updateWorldMatrix(true, false); const c = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld); if (point.distanceTo(c) < 0.17) target = head; }
    if (target === ch.mesh && ch.head && ch.head.name === 'heroHead') { const hb = ch.bones && ch.bones.head; if (hb) { const c = new THREE.Vector3().setFromMatrixPosition(hb.matrixWorld); if (point.distanceTo(c) < 0.16) target = ch.head; } }
    const bp = bindPoint(target, point, dir); if (!bp) return false;
    // materials that will show it: the crowd's shared body material is swapped for this person's own copy (same program)
    const mats = Array.isArray(target.material) ? target.material : [target.material];
    if (target === ch.mesh && !ch.bloodMat) { const sh = mats.find((m) => isBloodPatched(m) && !m.userData.bloodOwn && !(ch.heroMats || []).includes(m));
      if (sh) { ch.bloodMat = bloodClone(sh); const arr = mats.map((m) => (m === sh ? ch.bloodMat : m)); target.material = Array.isArray(target.material) ? arr : arr[0]; } }
    slots = (Array.isArray(target.material) ? target.material : [target.material]).filter((m) => isBloodPatched(m) && (m.userData.bloodOwn || (ch.heroMats || []).includes(m) || (ch.headMats || []).includes(m) || target !== ch.mesh));
    const uniq = [...new Set(slots)]; if (!uniq.length) return false;
    const r = opts.r ?? Math.min(0.11, 0.04 + 0.028 * size), run = opts.run ?? Math.min(0.32, 0.1 + 0.08 * size);
    for (const m of uniq) writeWound(m, bp.p, bp.n, r, run);
    this.stats.wounds++;
    // keep dripping from that spot for a while (follows the bone it sits on)
    const bone = target.isSkinnedMesh ? nearestBone(target, point) : target; if (bone) { const local = bone.worldToLocal(point.clone());
      if (this.bleeders.length >= BLEED) this.bleeders.shift(); this.bleeders.push({ ch, bone, local, until: this.t + (opts.bleed ?? (8 + 10 * size)), next: this.t + rnd(0.2, 0.6), rate: opts.rate ?? 1 }); }
    return true;
  }
  useFx(U) { if (!U) return; for (const k of ['uSunV', 'uSunC', 'uAmb', 'uNoise']) if (U[k]) this.U[k] = U[k]; } // the explosions' sun / ambient / noise (made after Blood)
  forget(ch) { this.bleeders = this.bleeders.filter((b) => b.ch !== ch); }
  splat(x, z, size, yHint = 0, heading = null, elong = 1) {
    if (!this.on) return; let v; if (heading != null && elong > 1.1) { v = ROUND + (this.nd++ % DIRN); this.stats.dirSplats++; } else v = this.n++ % ROUND;
    const L = this.splatList[v]; const y = this.ground(x, z, yHint) + 0.012 + (this.n % 7) * 0.0006;
    if (L.length >= SPLATS) L.shift();
    if (v >= ROUND) L.push({ x, y, z, r: Math.atan2(-heading[1], heading[0]), sx: size * 1.36 * Math.min(3.2, elong), sz: size, born: this.t }); // texture +u = direction of travel; body length/width = 1/sin(impact angle)
    else L.push({ x, y, z, r: Math.random() * Math.PI * 2, sx: size, sz: size, born: this.t });
    this.stats.splats++; this.dirty.add(v);
  }
  pool(x, z, max = 1.0, yHint = 0, delay = 0) {
    if (!this.on) return null; if (this.pools.length >= POOLS) this.pools.shift(); const P = { x, z, y: this.ground(x, z, yHint) + 0.01, r: Math.random() * Math.PI * 2, max, t: -delay, k: 0, born: this.t + delay }; this.pools.push(P); this.stats.pools++; return P;
  }
  clear() { for (const L of this.splatList) L.length = 0; this.pools.length = 0; this.walls.length = 0; this.bleeders.length = 0; this.wallDirty = true; for (let v = 0; v < ROUND + DIRN; v++) this.dirty.add(v);
    for (let i = 0; i < MAXP; i++) { this.life[i] = 0; this.size[i] = 0; this.pos[i * 3 + 1] = -1e4; } this.alive = 0; this.writeDrops(); for (let i = 0; i < MIST; i++) this.MA.iT.setXYZW(i, -1e4, 1, 0, 0); this.MA.iT.needsUpdate = true; }
  writeDrops() { const S = this.DA.iS; for (let i = 0; i < MAXP; i++) S.setXY(i, this.life[i] > 0 ? this.size[i] : 0, 1); S.needsUpdate = this.DA.iP.needsUpdate = this.DA.iV.needsUpdate = true; }
  dry(born) { return Math.max(0, Math.min(1, (this.t - born - 45) / 210)); } // starts after ~45 s, a dark crust by ~4 min
  // ------------------------------------------------------------ per frame
  update(dt) {
    const on = this.on; if (on !== this.visible) { this.visible = on; for (const m of [this.points, this.mist, this.poolMesh, this.wallMesh, ...this.splatMesh]) m.visible = on; }
    if (!on || !(dt > 0)) return; dt = Math.min(dt, 0.1); this.t += dt; BLOOD_T.value = this.t; this.U.uTime.value = this.t;
    // wounds still dripping
    if (this.bleeders.length) { for (let k = this.bleeders.length - 1; k >= 0; k--) { const b = this.bleeders[k]; if (this.t > b.until || b.ch.disposed) { this.bleeders.splice(k, 1); continue; }
      if (this.t < b.next) continue; const left = (b.until - this.t) / 12; b.next = this.t + rnd(0.25, 0.7) / Math.max(0.3, Math.min(1, left)) / b.rate;
      const w = b.bone.localToWorld(this._p.copy(b.local)); this.drop(w.x, w.y - 0.02, w.z, rnd(-0.08, 0.08), -0.2, rnd(-0.08, 0.08), rnd(0.007, 0.013), 3); this.stats.drips++; } }
    if (this.alive > 0) { let live = 0;
      for (let i = 0; i < MAXP; i++) { if (this.life[i] <= 0) continue; live++; this.life[i] -= dt; const j = i * 3;
        const drag = Math.exp(-dt * 0.9); this.vel[j] *= drag; this.vel[j + 2] *= drag; this.vel[j + 1] -= 9.81 * dt;
        this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
        if (this.vel[j + 1] < 0) { const gy = this.ground(this.pos[j], this.pos[j + 2], this.pos[j + 1]); if (this.pos[j + 1] <= gy + 0.01 || this.life[i] <= 0) {
          if (this.pos[j + 1] <= gy + 0.03 && Math.random() < 0.38) { const vh = Math.hypot(this.vel[j], this.vel[j + 2]), vy = -this.vel[j + 1]; const sinA = vy / Math.max(1e-3, Math.hypot(vh, vy)); // impact angle → shape
            const sz = this.size[i] * rnd(4, 7); this.splat(this.pos[j], this.pos[j + 2], Math.min(0.2, Math.max(0.05, sz)), gy, vh > 0.4 ? [this.vel[j] / vh, this.vel[j + 2] / vh] : null, 1 / Math.max(0.3, sinA)); }
          this.life[i] = 0; this.pos[j + 1] = -1e4; } } }
      this.alive = live; this.writeDrops(); }
    // splat matrices (+ dryness every ~2 s)
    this.dryT -= dt; const redry = this.dryT <= 0; if (redry) this.dryT = 2;
    for (let v = 0; v < ROUND + DIRN; v++) { if (!this.dirty.has(v) && !redry) continue; const m = this.splatMesh[v], L = this.splatList[v], D = m.geometry.attributes.aDry;
      if (this.dirty.has(v)) { L.forEach((s, i) => { this._q.setFromAxisAngle(this._y, s.r); m.setMatrixAt(i, this._m.compose(this._p.set(s.x, s.y, s.z), this._q, this._s.set(s.sx, 1, s.sz))); }); m.count = L.length; m.instanceMatrix.needsUpdate = true; }
      L.forEach((s, i) => D.setX(i, this.dry(s.born))); D.needsUpdate = true; }
    this.dirty.clear();
    if (this.wallDirty || redry) { const m = this.wallMesh, D = m.geometry.attributes.aDry;
      this.walls.forEach((w, i) => { this._q.setFromEuler(this._e.set(0, w.yaw, w.roll)); m.setMatrixAt(i, this._m.compose(this._p.set(w.x, w.y, w.z), this._q, this._s.set(w.s, w.s, 1))); D.setX(i, this.dry(w.born)); });
      m.count = this.walls.length; m.instanceMatrix.needsUpdate = true; D.needsUpdate = true; this.wallDirty = false; }
    let grow = false; for (const P of this.pools) { if (P.k >= 0.999 && P.t > 0) continue; P.t += dt; if (P.t <= 0) continue; P.k = 1 - Math.exp(-P.t / 7); grow = true; }
    if (grow || redry || this.pools.length !== this.poolMesh.count) { const D = this.poolMesh.geometry.attributes.aDry;
      this.pools.forEach((P, i) => { const s = Math.max(0.001, P.max * Math.max(0, P.k)); this._q.setFromAxisAngle(this._y, P.r); this.poolMesh.setMatrixAt(i, this._m.compose(this._p.set(P.x, P.y, P.z), this._q, this._s.set(s, 1, s))); D.setX(i, this.dry(P.born + 30)); });
      this.poolMesh.count = this.pools.length; this.poolMesh.instanceMatrix.needsUpdate = true; D.needsUpdate = true; }
  }
}
// the bone whose segment the point is closest to (the wound drips from where it sits on that limb)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
function nearestBone(mesh, p) { let best = null, bd = 1e9; for (const b of mesh.skeleton.bones) { const kid = b.children.find((c) => c.isBone); _a.setFromMatrixPosition(b.matrixWorld);
  let d; if (kid) { _b.setFromMatrixPosition(kid.matrixWorld).sub(_a); const L = _b.lengthSq(); const t = L > 1e-9 ? Math.max(0, Math.min(1, _c.subVectors(p, _a).dot(_b) / L)) : 0; d = p.distanceTo(_c.copy(_a).addScaledVector(_b, t)); } else d = p.distanceTo(_a);
  if (d < bd) { bd = d; best = b; } } return best; }
export { addBloodStain };
