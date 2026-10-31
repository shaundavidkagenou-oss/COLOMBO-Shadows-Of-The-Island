// Real 3D grass near the camera + anti-tiling lawn shading.
//
// GrassField: GPU-instanced clumps of tapered, curved blades (8 per clump) scattered on a 0.5 m jittered grid around the
// camera. Where grass may grow is taken from the actual ground geometry: the chunk's 'grass'/'lawn' ground triangles are
// rasterised into a 0.5 m mask (with each cell's albedo sampled from the very texture the ground uses, through the
// ground's own UVs), then building/prop colliders and park paths/beds are cut out. Blade colour = the ground colour under
// it (dark at the root, sunlit at the tip), worn/soil patches grow sparse short blades, mowed lawns are short and dense,
// Galle Face Green longer and patchy. Blades sway with the weather's wind in a consistent world direction and shrink
// away at the edge of the field so there is no visible pop-in ring. Disabled on 'low'.
import * as THREE from 'three';
import { CHUNK, NCX, NCZ, chunkCenter } from './CityPlan.js';
import * as L from './Layout.js';
import { onParkFeature } from './Parks.js';
import { TEX } from '../gfx/Textures.js';

const CELL = 0.5, N = CHUNK / CELL;
// materials of hard / non-lawn ground: grass never grows through these where they lie on the lawn
const PAVE = new Set(['road', 'roadTint', 'walk', 'walkGrey', 'kerb', 'concrete', 'ballast', 'laterite', 'sand', 'rocks', 'marking', 'soil', 'paint', 'paintDS', 'metal', 'roofFlat']);
const PROBES = [[0.5, 0.5], [0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95]];
const grassUniforms = { uGTime: { value: 0 }, uGWind: { value: 0.3 } };

function bladeClump() {
  const pos = [], nor = [], col = [], idx = []; let rs = 1;
  const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < 12; b++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.3, ox = Math.cos(a) * r, oz = Math.sin(a) * r;
    const yaw = rnd() * Math.PI * 2, w = 0.022 + rnd() * 0.014, h = 0.65 + rnd() * 0.5, lean = 0.12 + rnd() * 0.25;
    const fx = Math.cos(yaw), fz = Math.sin(yaw), sx = -fz, sz = fx; const base = pos.length / 3;
    const segs = 3;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, ww = w * (1 - t * 0.85), y = h * t, bend = lean * t * t * h;
      for (const sd of [-1, 1]) {
        pos.push(ox + sx * ww * sd + fx * bend, y, oz + sz * ww * sd + fz * bend);
        nor.push(fx * 0.35, 0.9, fz * 0.35); // mostly up: blades shade like the lawn they stand on
        const g = 0.66 + t * 0.4; col.push(g, g, g * (0.97 - t * 0.1));
      }
    }
    for (let k = 0; k < segs; k++) { const i = base + k * 2; idx.push(i, i + 1, i + 3, i, i + 3, i + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5); // instances span the whole field
  return g;
}

function texPixels(t) {
  const img = t && t.image; if (!img || !img.getContext) return null;
  try { const d = img.getContext('2d').getImageData(0, 0, img.width, img.height); return { w: img.width, h: img.height, d: d.data }; } catch { return null; }
}

export class GrassField {
  constructor(world, collision) {
    this.world = world; this.collision = collision; this.masks = new Map(); this.radius = 30; this.max = 16000;
    this.px = { grass: texPixels(TEX.grass), lawn: texPixels(TEX.lawn) };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, grassUniforms);
      // both faces of a blade keep the up-facing normal (default DoubleSide flips it on back faces → black spikes)
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.split('*= faceDirection').join('*= 1.0'));
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uGTime; uniform float uGWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 iw = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float t01 = clamp(position.y / 1.2, 0.0, 1.0); float k = t01 * t01;
          float gust = sin(uGTime * 1.3 + iw.x * 0.11 + iw.z * 0.07) * 0.5 + 0.5;
          float sw = (sin(uGTime * 2.1 + iw.x * 0.6 + iw.z * 0.45) * 0.6 + sin(uGTime * 3.7 + iw.z * 1.3) * 0.25) * (0.25 + uGWind) + gust * uGWind * 1.1;
          mat3 im = mat3(instanceMatrix); vec3 wl = normalize(transpose(im) * vec3(0.8, 0.0, 0.6));
          transformed += wl * sw * k * 0.22;
          transformed.y -= k * abs(sw) * 0.05;
        }`);
    };
    this.mesh = new THREE.InstancedMesh(bladeClump(), mat, this.max); this.mesh.name = 'grassBlades';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.castShadow = false; this.mesh.receiveShadow = true;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.cx = 1e9; this.cz = 1e9; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
    this._up = new THREE.Vector3(0, 1, 0);
  }
  setQuality(q) { this.radius = q === 'low' ? 0 : q === 'medium' ? 20 : q === 'ultra' ? 40 : 30; this.cx = 1e9; this.mesh.visible = this.radius > 0; }
  // 0.5 m mask for one chunk: 0 = no grass, else packed (density, r, g, b)
  mask(idx) {
    let m = this.masks.get(idx); if (m) return m;
    const [ccx, ccz] = chunkCenter(idx), ox = ccx - CHUNK / 2, oz = ccz - CHUNK / 2;
    m = { ox, oz, a: new Uint8Array(N * N), r: new Uint8Array(N * N), g: new Uint8Array(N * N), b: new Uint8Array(N * N), y: new Float32Array(N * N), lawn: new Uint8Array(N * N) };
    const ci0 = idx % NCX, cj0 = Math.floor(idx / NCX); const near = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ci = ci0 + di, cj = cj0 + dj; if (ci >= 0 && cj >= 0 && ci < NCX && cj < NCZ && this.world.chunks[cj * NCX + ci]) near.push(this.world.chunks[cj * NCX + ci]); }
    for (const ch of near) for (const mesh of ch.group.children) {
      if (!mesh.isMesh || (mesh.name !== 'grass' && mesh.name !== 'lawn')) continue;
      const px = this.px[mesh.name]; const lawn = mesh.name === 'lawn' ? 1 : 0;
      const P = mesh.geometry.attributes.position.array, U = mesh.geometry.attributes.uv && mesh.geometry.attributes.uv.array, I = mesh.geometry.index ? mesh.geometry.index.array : null;
      const nt = I ? I.length / 3 : P.length / 9;
      for (let t = 0; t < nt; t++) {
        const i0 = I ? I[t * 3] : t * 3, i1 = I ? I[t * 3 + 1] : t * 3 + 1, i2 = I ? I[t * 3 + 2] : t * 3 + 2;
        const ax = P[i0 * 3], ay = P[i0 * 3 + 1], az = P[i0 * 3 + 2], bx = P[i1 * 3], by = P[i1 * 3 + 1], bz = P[i1 * 3 + 2], cx = P[i2 * 3], cy = P[i2 * 3 + 1], cz = P[i2 * 3 + 2];
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(det) < 1e-6) continue;
        const gx0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - ox) / CELL)), gx1 = Math.min(N - 1, Math.ceil((Math.max(ax, bx, cx) - ox) / CELL));
        const gz0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - oz) / CELL)), gz1 = Math.min(N - 1, Math.ceil((Math.max(az, bz, cz) - oz) / CELL));
        for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
          const x = ox + (gx + 0.5) * CELL, z = oz + (gz + 0.5) * CELL;
          const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
          if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
          const k = gz * N + gx; m.a[k] = 255; m.y[k] = ay * l1 + by * l2 + cy * l3; m.lawn[k] = lawn;
          if (px && U) {
            const u = U[i0 * 2] * l1 + U[i1 * 2] * l2 + U[i2 * 2] * l3, v = U[i0 * 2 + 1] * l1 + U[i1 * 2 + 1] * l2 + U[i2 * 2 + 1] * l3;
            const tx = ((Math.floor((u - Math.floor(u)) * px.w)) + px.w) % px.w, ty = ((Math.floor((1 - (v - Math.floor(v))) * px.h)) + px.h) % px.h; const o = (ty * px.w + tx) * 4;
            m.r[k] = px.d[o]; m.g[k] = px.d[o + 1]; m.b[k] = px.d[o + 2];
          } else { m.r[k] = 70; m.g[k] = 110; m.b[k] = 40; }
        }
      }
    }
    // cut out paved overlays lying on the lawn (courts, drives, plazas, path slabs, markings, soil beds…): any up-facing
    // non-vegetation triangle from the chunk meshes or the landmark meshes just above the lawn surface
    const cutTri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(det) < 1e-6) return;
      const gx0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - ox) / CELL)), gx1 = Math.min(N - 1, Math.floor((Math.max(ax, bx, cx) - ox) / CELL));
      const gz0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - oz) / CELL)), gz1 = Math.min(N - 1, Math.floor((Math.max(az, bz, cz) - oz) / CELL)); if (gx0 > gx1 || gz0 > gz1) return;
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) { const k = gz * N + gx; if (!m.a[k]) continue;
        // test the cell centre and its four corners: a slab edge cuts the whole cell (no blades poking through the border)
        for (const [ex, ez] of PROBES) { const x = ox + (gx + ex) * CELL, z = oz + (gz + ez) * CELL;
          const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
          if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue; const y = ay * l1 + by * l2 + cy * l3; if (y > m.y[k] - 0.08 && y < m.y[k] + 0.6) { m.a[k] = 0; break; } } } };
    const cutMesh = (P, I, x0, z0, x1, z1) => { const nt = I ? I.length / 3 : P.length / 9;
      for (let t = 0; t < nt; t++) { const i0 = I ? I[t * 3] : t * 3, i1 = I ? I[t * 3 + 1] : t * 3 + 1, i2 = I ? I[t * 3 + 2] : t * 3 + 2;
        const ax = P[i0 * 3], ay = P[i0 * 3 + 1], az = P[i0 * 3 + 2], bx = P[i1 * 3], by = P[i1 * 3 + 1], bz = P[i1 * 3 + 2], cx = P[i2 * 3], cy = P[i2 * 3 + 1], cz = P[i2 * 3 + 2];
        if (Math.max(ax, bx, cx) < x0 || Math.min(ax, bx, cx) > x1 || Math.max(az, bz, cz) < z0 || Math.min(az, bz, cz) > z1) continue;
        const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (ny <= 0.85 * Math.hypot(nx, ny, nz)) continue; cutTri(ax, ay, az, bx, by, bz, cx, cy, cz); } };
    for (const ch of near) for (const mesh of ch.group.children) { if (!mesh.isMesh || !PAVE.has(mesh.name)) continue; const ga = mesh.geometry; cutMesh(ga.attributes.position.array, ga.index && ga.index.array, ox, oz, ox + CHUNK, oz + CHUNK); }
    for (const tri of this.landmarkPaving(idx)) cutTri(...tri);
    // cut out buildings, walls, props, trunks, hedges…
    for (const c of this.collision.query(ox, oz, ox + CHUNK, oz + CHUNK)) {
      if (c.kind === 'deck' || c.kind === 'platform' || c.kind === 'water') continue;
      const gx0 = Math.max(0, Math.floor((c.x0 - 0.15 - ox) / CELL)), gx1 = Math.min(N - 1, Math.floor((c.x1 + 0.15 - ox) / CELL));
      const gz0 = Math.max(0, Math.floor((c.z0 - 0.15 - oz) / CELL)), gz1 = Math.min(N - 1, Math.floor((c.z1 + 0.15 - oz) / CELL));
      for (let gz = gz0; gz <= gz1; gz++) m.a.fill(0, gz * N + gx0, gz * N + gx1 + 1);
    }
    for (let k = 0; k < N * N; k++) if (m.a[k]) {
      const x = ox + ((k % N) + 0.5) * CELL, z = oz + (Math.floor(k / N) + 0.5) * CELL;
      if (onParkFeature(x, z, 0.15) || L.isWater(x, z) || L.roadAt(x, z) || L.copingAt(x, z) != null || L.copingAt(x + 0.3, z) != null || L.copingAt(x - 0.3, z) != null) { m.a[k] = 0; continue; }
      // greenness → density (bare soil / worn patches grow little)
      const r = m.r[k], g = m.g[k], b = m.b[k]; const green = (g - Math.max(r, b)) / Math.max(1, g);
      m.a[k] = Math.max(0, Math.min(255, Math.round((green - 0.05) * 1000)));
    }
    if (this.masks.size > 12) this.masks.delete(this.masks.keys().next().value);
    this.masks.set(idx, m); return m;
  }
  // up-facing paving triangles of the (city-wide, merged) landmark meshes, bucketed by chunk once
  landmarkPaving(idx) {
    if (!this.lmPave) { this.lmPave = new Map(); const lm = this.world.landmarks; const root = lm && lm.group;
      if (root) root.traverse((mesh) => { if (!mesh.isMesh || !PAVE.has(mesh.name)) return; const ga = mesh.geometry, P = ga.attributes.position.array, I = ga.index && ga.index.array; const nt = I ? I.length / 3 : P.length / 9;
        for (let t = 0; t < nt; t++) { const i0 = I ? I[t * 3] : t * 3, i1 = I ? I[t * 3 + 1] : t * 3 + 1, i2 = I ? I[t * 3 + 2] : t * 3 + 2;
          const ax = P[i0 * 3], ay = P[i0 * 3 + 1], az = P[i0 * 3 + 2], bx = P[i1 * 3], by = P[i1 * 3 + 1], bz = P[i1 * 3 + 2], cx = P[i2 * 3], cy = P[i2 * 3 + 1], cz = P[i2 * 3 + 2];
          const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          if (ny <= 0.85 * Math.hypot(nx, ny, nz) || Math.max(ay, by, cy) > 30) continue;
          const ci0 = Math.floor((Math.min(ax, bx, cx) - L.BOUNDS.minX) / CHUNK), ci1 = Math.floor((Math.max(ax, bx, cx) - L.BOUNDS.minX) / CHUNK), cj0 = Math.floor((Math.min(az, bz, cz) - L.BOUNDS.minZ) / CHUNK), cj1 = Math.floor((Math.max(az, bz, cz) - L.BOUNDS.minZ) / CHUNK);
          for (let cj = Math.max(0, cj0); cj <= Math.min(NCZ - 1, cj1); cj++) for (let ci = Math.max(0, ci0); ci <= Math.min(NCX - 1, ci1); ci++) { const k = cj * NCX + ci; let a = this.lmPave.get(k); if (!a) this.lmPave.set(k, (a = [])); a.push([ax, ay, az, bx, by, bz, cx, cy, cz]); } } }); }
    return this.lmPave.get(idx) || [];
  }
  sample(x, z) {
    const ci = Math.floor((x - L.BOUNDS.minX) / CHUNK), cj = Math.floor((z - L.BOUNDS.minZ) / CHUNK); if (ci < 0 || cj < 0 || ci >= NCX || cj >= NCZ) return null;
    const m = this.mask(cj * NCX + ci); const gx = Math.floor((x - m.ox) / CELL), gz = Math.floor((z - m.oz) / CELL); const k = gz * N + gx;
    return m.a[k] ? { m, k } : null;
  }
  refill(fx, fz) {
    const R = this.radius, M = this._m, mesh = this.mesh, colA = mesh.instanceColor.array; let n = 0;
    const h = (a, b, s) => { let v = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
    const g0x = Math.floor((fx - R) / CELL), g1x = Math.ceil((fx + R) / CELL), g0z = Math.floor((fz - R) / CELL), g1z = Math.ceil((fz + R) / CELL);
    for (let gz = g0z; gz <= g1z && n < this.max; gz++) for (let gx = g0x; gx <= g1x && n < this.max; gx++) {
      const x = (gx + h(gx, gz, 1)) * CELL, z = (gz + h(gx, gz, 2)) * CELL; const d = Math.hypot(x - fx, z - fz); if (d > R) continue;
      // density thins with distance (but clumps get wider so coverage reads the same)
      const far = d / R; if (h(gx, gz, 3) > 1 - far * 0.55) continue;
      const s = this.sample(x, z); if (!s) continue; const dens = s.m.a[s.k] / 255; if (h(gx, gz, 4) > dens) continue;
      const lawn = s.m.lawn[s.k]; const edge = Math.min(1, (R - d) / 5);
      const height = (lawn ? 0.12 + h(gx, gz, 5) * 0.07 : 0.17 + h(gx, gz, 5) * 0.16) * (0.55 + dens * 0.45) * (0.35 + edge * 0.65);
      const wid = (1 + far * 0.9) * (0.9 + h(gx, gz, 6) * 0.3);
      this._q.setFromAxisAngle(this._up, h(gx, gz, 7) * 6.283); this._s.set(wid, height, wid); this._p.set(x, s.m.y[s.k] - 0.01, z);
      M.compose(this._p, this._q, this._s); M.toArray(mesh.instanceMatrix.array, n * 16);
      const v = 0.9 + h(gx, gz, 8) * 0.22; // per-clump hue/value variation around the ground colour
      this._c.setRGB(s.m.r[s.k] / 255 * v, s.m.g[s.k] / 255 * v * (0.98 + h(gx, gz, 9) * 0.06), s.m.b[s.k] / 255 * v, THREE.SRGBColorSpace);
      colA[n * 3] = this._c.r; colA[n * 3 + 1] = this._c.g; colA[n * 3 + 2] = this._c.b; n++;
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  }
  update(dt, focus, wind) {
    grassUniforms.uGTime.value += dt; grassUniforms.uGWind.value = wind;
    if (!this.radius) { this.mesh.count = 0; return; }
    if (Math.hypot(focus.x - this.cx, focus.z - this.cz) > Math.max(3, this.radius * 0.15)) { this.cx = focus.x; this.cz = focus.z; this.refill(focus.x, focus.z); }
  }
}

// Anti-tiling for the lawn/grass ground: the base texture is blended with a rotated, rescaled second lookup through a
// low-frequency mask, plus large-scale lush/dry colour variation — no 8 m repeat pattern across Galle Face Green or the
// park, at no extra texture cost.
export function upgradeGroundGrass(mat, dryness = 0.5) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDry = { value: dryness };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDry;')
      .replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec2 uvA = vMapUv; vec2 uvB = mat2(0.80, -0.60, 0.60, 0.80) * vMapUv * 0.37 + vec2(0.31, 0.17);
        vec4 tA = texture2D(map, uvA), tB = texture2D(map, uvB);
        float mk = texture2D(map, vMapUv * 0.043 + vec2(0.5)).g; float m2 = texture2D(map, vMapUv * 0.011).g;
        float bl = smoothstep(0.32, 0.5, mk);
        vec4 sampledDiffuseColor = mix(tA, tB, bl);
        float macro = smoothstep(0.25, 0.6, m2);
        sampledDiffuseColor.rgb *= mix(vec3(1.05, 1.0, 0.86) * (1.0 + 0.1 * uDry), vec3(0.86, 0.97, 0.84), macro);
        sampledDiffuseColor.rgb *= 0.9 + 0.2 * mk;
        diffuseColor *= sampledDiffuseColor;
      #endif`);
  };
  mat.needsUpdate = true;
}
