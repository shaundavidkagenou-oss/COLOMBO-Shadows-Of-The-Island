// Modelled small-scale ground detail near the camera: the textures alone (pavers, ballast, kerbs) read as flat paint up
// close, so within a radius of the camera the ground is dressed with real geometry, GPU-instanced per 8 m tile:
//
//   • footpath bricks — every interlocking "unipave" brick of the paver texture rebuilt as a bevelled solid (notched
//     outline, chamfered top) at EXACTLY the texture brick's place, sampling the texture through the same world-space
//     UVs, so each modelled brick carries its own tone / grime and the recessed joints between them are the texture's
//     sand joints. At the edge of the radius the bricks sink into the surface they match (no pop-in ring);
//   • kerb stones — individual 0.5 m (1 m painted) blocks with a rounded road-side nose and joints, in the kerb's colours;
//   • railway ballast — loose angular granite stones on the bed and its shoulders between the sleepers;
//   • rail fastenings — rubber pad and two spring clips with their cast shoulders on every sleeper, both rails.
//
// Placement comes from the ground builder itself (GroundBuilder registers every footpath rect / rounded corner / kerb
// line it lays) and from the railway's own sleeper loop, so the detail always matches the ground under it.
// Quality: off on 'low'; radius / ballast density grow with the setting.
import * as THREE from 'three';
import * as L from './Layout.js';
import { MAT } from '../gfx/Materials.js';
import { TEX } from '../gfx/Textures.js';
import * as RW from './Railway.js';

const T = 8; // tile size (m)
const RY = L.ROAD_Y, LY = L.LAND_Y;
const REG = { walk: new Map(), kerb: new Map() };
const key = (i, j) => (i + 2000) * 4096 + (j + 2000);
function addTo(map, x0, z0, x1, z1, item) {
  for (let i = Math.floor(x0 / T); i <= Math.floor(x1 / T); i++) for (let j = Math.floor(z0 / T); j <= Math.floor(z1 / T); j++) { const k = key(i, j); let a = map.get(k); if (!a) map.set(k, (a = [])); a.push(item); }
}
export function resetGroundDetail() { REG.walk.clear(); REG.kerb.clear(); }
export function regWalkRect(x0, z0, x1, z1, grey) { if (x1 - x0 > 0.2 && z1 - z0 > 0.2) addTo(REG.walk, x0, z0, x1, z1, { t: 0, x0, z0, x1, z1, grey }); }
// quarter disc of radius r centred (cx, cz), the quadrant towards (−sx, −sz) (GroundBuilder's rounded corner paving)
export function regWalkCorner(cx, cz, r, sx, sz, grey) { if (r > 0.2) addTo(REG.walk, cx - r, cz - r, cx + r, cz + r, { t: 1, cx, cz, r, sx, sz, grey }); }
export function regKerb(x0, z0, x1, z1, col) { addTo(REG.kerb, Math.min(x0, x1) - 0.3, Math.min(z0, z1) - 0.3, Math.max(x0, x1) + 0.3, Math.max(z0, z1) + 0.3, { x0, z0, x1, z1, col }); }
const inWalk = (it, x, z) => (it.t === 0 ? x >= it.x0 && x <= it.x1 && z >= it.z0 && z <= it.z1 : Math.hypot(x - it.cx, z - it.cz) <= it.r && (x - it.cx) * -it.sx >= -1e-4 && (z - it.cz) * -it.sz >= -1e-4);
const walkAt = (list, x, z) => { for (const it of list) if (inWalk(it, x, z)) return it; return null; };
function segDist(px, pz, s) { const dx = s.x1 - s.x0, dz = s.z1 - s.z0; const l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - s.x0) * dx + (pz - s.z0) * dz) / l2)); return Math.hypot(px - s.x0 - dx * t, pz - s.z0 - dz * t); }

// ---------------------------------------------------------------- geometry
// make every triangle's winding agree with its vertex normals (front faces outward)
function orient(g) { const P = g.attributes.position, Nn = g.attributes.normal; if (!g.index) return g; const ix = g.index.array; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < ix.length; t += 3) { a.fromBufferAttribute(P, ix[t]); b.fromBufferAttribute(P, ix[t + 1]); c.fromBufferAttribute(P, ix[t + 2]); n.fromBufferAttribute(Nn, ix[t]); b.sub(a); c.sub(a); if (b.cross(c).dot(n) < 0) { const k = ix[t + 1]; ix[t + 1] = ix[t + 2]; ix[t + 2] = k; } }
  g.index.needsUpdate = true; return g; }
// the paver texture's brick (Textures.pavers): 8 × 16 bricks per 2 m tile (0.25 × 0.125 m pitch, 3 px = 1.2 cm joints),
// running bond, a chevron notch (0.18 of the height) at the middle of both long edges
const PX = 2 / 512, BW = 64 * PX - 3 * PX, BH = 32 * PX - 3 * PX, NOTCH = 32 * 0.18 * PX, B0 = 1.5 * PX;
function brickGeometry() {
  const w = BW, h = BH, n = NOTCH;
  const out = [[0, 0], [w * 0.33, 0], [w * 0.5, n], [w * 0.66, 0], [w, 0], [w, h], [w * 0.66, h], [w * 0.5, h + n], [w * 0.33, h], [0, h]]; // (x, z) — z grows with canvas y
  // inset outline for the chamfered top (offset every edge inward and intersect neighbours)
  const N = out.length; let area = 0; for (let i = 0; i < N; i++) { const a = out[i], b = out[(i + 1) % N]; area += a[0] * b[1] - b[0] * a[1]; } const sg = Math.sign(area);
  const inset = (d) => out.map((p, i) => { const a = out[(i + N - 1) % N], b = out[(i + 1) % N];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]]; const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
    const n1 = [-e1[1] / l1 * sg, e1[0] / l1 * sg], n2 = [-e2[1] / l2 * sg, e2[0] / l2 * sg]; // inward normals
    const m = [n1[0] + n2[0], n1[1] + n2[1]]; const ml = Math.hypot(...m) || 1; const k = d / Math.max(0.35, (m[0] * n1[0] + m[1] * n1[1]) / ml); return [p[0] + m[0] / ml * k, p[1] + m[1] / ml * k]; });
  const top = inset(0.0055); const yT = 0.0075, yB = -0.0015; // top 7.5 mm above the paved surface, outline just under it
  const pos = [], nor = [], uv = [], idx = [];
  const tri = THREE.ShapeUtils.triangulateShape(top.map((p) => new THREE.Vector2(p[0], p[1])), []);
  for (const p of top) { pos.push(p[0], yT, p[1]); nor.push(0, 1, 0); uv.push(0, 0); }
  for (const t of tri) { const [a, b, c] = t; const ax = top[b][0] - top[a][0], az = top[b][1] - top[a][1], bx = top[c][0] - top[a][0], bz = top[c][1] - top[a][1]; if (ax * bz - az * bx < 0) idx.push(a, b, c); else idx.push(a, c, b); }
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; const A = top[i], Bt = top[j], C = out[j], D = out[i]; const b = pos.length / 3;
    const ux = Bt[0] - A[0], uz = Bt[1] - A[1]; let nx = uz * sg, nz = -ux * sg; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl; // outward
    const ny = 0.75; const l = Math.hypot(nx, ny, nz);
    for (const [p, y] of [[A, yT], [Bt, yT], [C, yB], [D, yB]]) { pos.push(p[0], y, p[1]); nor.push(nx / l, ny / l, nz / l); uv.push(0, 0); }
    // wind so the face points outward/up
    const e1 = [Bt[0] - A[0], 0, Bt[1] - A[1]], e2 = [D[0] - A[0], yB - yT, D[1] - A[1]]; const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * nx + cy * ny + cz * nz > 0) idx.push(b, b + 1, b + 2, b, b + 2, b + 3); else idx.push(b, b + 2, b + 1, b, b + 3, b + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return orient(g);
}
// kerb stone, unit length along x (scaled per block), profile in (z inward from the kerb line, y above the footpath)
function kerbGeometry() {
  const yb = RY - LY - 0.025; const P = [[-0.004, yb], [-0.004, -0.004], [-0.0015, 0.0065], [0.007, 0.012], [0.144, 0.012], [0.15, 0.007], [0.15, -0.012]];
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; const tz = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tz, ty); const nz = -ty / l, ny = tz / l; // outward for a profile running road-face → top → back
    const base = pos.length / 3; for (const [x, p] of [[-0.5, a], [0.5, a], [0.5, b], [-0.5, b]]) { pos.push(x, p[1], p[0]); nor.push(0, ny, nz); uv.push(x + 0.5, (p[0] + p[1]) * 4); }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2); }
  for (const x of [-0.5, 0.5]) { const base = pos.length / 3; for (const p of P) { pos.push(x, p[1], p[0]); nor.push(Math.sign(x), 0, 0); uv.push(p[0] * 4, p[1] * 4); }
    for (let i = 1; i < P.length - 1; i++) { if (x > 0) idx.push(base, base + i, base + i + 1); else idx.push(base, base + i + 1, base + i); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return orient(g);
}
// angular crushed-granite stone: a jittered, slightly flattened icosahedron (flat-shaded facets)
function stoneGeometry(seed) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const ico = new THREE.IcosahedronGeometry(0.5, 0); const p = ico.attributes.position; const map = new Map();
  for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!map.has(k)) map.set(k, 0.72 + rnd() * 0.5); const f = map.get(k); p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.72, p.getZ(i) * f); }
  ico.computeVertexNormals(); return ico; // non-indexed: flat-shaded facets
}
// rail fastening: rubber pad under the foot, and per side a cast shoulder with a spring clip bearing on the foot
function fasteningGeometry() {
  const parts = []; const box = (cx, cy, cz, sx, sy, sz) => { const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(cx, cy, cz); parts.push(b.index ? b.toNonIndexed() : b); b.dispose(); };
  box(0, 0.006, 0, 0.17, 0.012, 0.2); // pad (x across the track, z along)
  for (const sd of [-1, 1]) { box(sd * 0.115, 0.022, 0, 0.04, 0.044, 0.07); // shoulder casting
    // spring clip: a bent round bar from the shoulder over onto the rail foot (5 straight pieces)
    const pts = [[0.13, 0.035, -0.03], [0.11, 0.05, -0.034], [0.085, 0.034, -0.02], [0.075, 0.03, 0.012], [0.1, 0.047, 0.03], [0.13, 0.04, 0.026]];
    for (let i = 0; i < pts.length - 1; i++) { const a = new THREE.Vector3(sd * pts[i][0], pts[i][1], pts[i][2]), b = new THREE.Vector3(sd * pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]); const l = a.distanceTo(b);
      const c = new THREE.CylinderGeometry(0.0085, 0.0085, l + 0.006, 5, 1, true); c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())); c.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); parts.push(c.toNonIndexed()); c.dispose(); } }
  const pos = [], nor = [], col = []; for (const g of parts) { const P = g.attributes.position, Nn = g.attributes.normal; const isPad = parts.indexOf(g) === 0; const isCast = !isPad && P.count === 36; const cc = isPad ? [0.12, 0.12, 0.12] : isCast ? [0.36, 0.35, 0.33] : [0.2, 0.19, 0.18];
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); col.push(...cc); } g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g;
}

// ---------------------------------------------------------------- materials
const DET_R = { value: 13 };
function patchDetail(m, { uvScale = 0, sink = 0, tag }) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDetR = DET_R;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uDetR;').replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec4 ip = modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ); float dd = distance( ip.xz, cameraPosition.xz );
    transformed.y -= ${sink.toFixed(4)} * smoothstep( uDetR - 3.0, uDetR, dd );
    ${uvScale ? `vec4 wq = modelMatrix * instanceMatrix * vec4( transformed, 1.0 ); vMapUv = vec2( wq.x, -wq.z ) / ${uvScale.toFixed(3)};` : ''} }`);
  };
  m.customProgramCacheKey = () => 'gdet-' + tag;
  return m;
}

// ---------------------------------------------------------------- the field
export class GroundDetail {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'groundDetail'; this.tiles = new Map(); this.R = 13; if (typeof window !== 'undefined') window.__groundDetail = this; // debug / test handle this.ballastK = 1; this.ready = false;
  }
  init() {
    if (this.ready) return; this.ready = true;
    this.geo = { brick: brickGeometry(), kerb: kerbGeometry(), stones: [stoneGeometry(11), stoneGeometry(29), stoneGeometry(47)], fast: fasteningGeometry() };
    const std = (o) => new THREE.MeshStandardMaterial(o);
    this.mat = {
      walk: patchDetail(std({ map: TEX.pavers, roughness: 0.9 }), { uvScale: 2, sink: 0.012, tag: 'walk' }),
      walkGrey: patchDetail(std({ map: TEX.paversGrey, roughness: 0.9 }), { uvScale: 2, sink: 0.012, tag: 'walkG' }),
      kerb: patchDetail(std({ map: TEX.concrete, roughness: 0.85 }), { sink: 0.016, tag: 'kerb' }),
      stone: patchDetail(std({ color: 0x8d8a85, roughness: 0.93, flatShading: true }), { sink: 0.07, tag: 'stone' }), // plain granite tones per stone (the bed texture's dark joints made the stones read as specks)
      fast: patchDetail(std({ vertexColors: true, roughness: 0.6, metalness: 0.35 }), { sink: 0.07, tag: 'fast' }),
    };
  }
  setQuality(q) {
    this.R = q === 'low' ? 0 : q === 'medium' ? 10 : q === 'ultra' ? 17 : 13; this.ballastK = q === 'medium' ? 0.55 : q === 'ultra' ? 1.25 : 1;
    DET_R.value = this.R; for (const t of this.tiles.values()) this.dropTile(t); this.tiles.clear(); this.group.visible = this.R > 0;
  }
  dropTile(t) { for (const m of t.meshes) { this.group.remove(m); m.dispose(); } }
  update(camera) {
    if (!this.R || !camera) return; if (!TEX.pavers || !MAT.walk) return; this.init();
    // follow the ground materials' wet / time-of-day state (Materials.updateMaterials drives MAT.walk / kerb)
    for (const [d, s] of [[this.mat.walk, MAT.walk], [this.mat.walkGrey, MAT.walkGrey], [this.mat.kerb, MAT.kerb]]) { d.roughness = s.roughness; d.color.copy(s.color); d.envMapIntensity = s.envMapIntensity; if (s.envMap) d.envMap = s.envMap; }
    const cx = camera.position.x, cz = camera.position.z; const high = camera.position.y - LY > 25; // aerial views: nothing at this scale is visible
    const need = new Set(); const R = high ? 0 : this.R + 2;
    if (R) for (let i = Math.floor((cx - R) / T); i <= Math.floor((cx + R) / T); i++) for (let j = Math.floor((cz - R) / T); j <= Math.floor((cz + R) / T); j++) {
      const qx = Math.max(i * T, Math.min(cx, i * T + T)), qz = Math.max(j * T, Math.min(cz, j * T + T)); if (Math.hypot(qx - cx, qz - cz) < R) need.add(key(i, j)); }
    for (const [k, t] of this.tiles) if (!need.has(k)) { this.dropTile(t); this.tiles.delete(k); }
    let budget = 1; // tiles built per frame (no hitch when a whole ring comes into range at once)
    const order = [...need].filter((k) => !this.tiles.has(k)); order.sort((a, b) => this.tileDist(a, cx, cz) - this.tileDist(b, cx, cz));
    for (const k of order) { if (budget-- <= 0) break; this.tiles.set(k, this.buildTile(k)); }
  }
  stats() { const o = { tiles: this.tiles.size }; for (const t of this.tiles.values()) for (const m of t.meshes) { const k = m.material === this.mat.kerb ? 'kerb' : m.material === this.mat.stone ? 'stone' : m.material === this.mat.fast ? 'fast' : 'brick'; o[k] = (o[k] || 0) + m.count; } return o; }
  tileDist(k, cx, cz) { const i = Math.floor(k / 4096) - 2000, j = (k % 4096) - 2000; return Math.hypot(i * T + T / 2 - cx, j * T + T / 2 - cz); }
  inst(geo, mat, list, colors = null) { // list: Float32Array-able array of 16-float matrices
    const n = list.length / 16; if (!n) return null; const m = new THREE.InstancedMesh(geo, mat, n); m.instanceMatrix.array.set(list); m.instanceMatrix.needsUpdate = true;
    if (colors) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(colors), 3); }
    m.computeBoundingSphere(); m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); this.group.add(m); return m;
  }
  buildTile(k) {
    const i = Math.floor(k / 4096) - 2000, j = (k % 4096) - 2000; const x0 = i * T, z0 = j * T, x1 = x0 + T, z1 = z0 + T; const meshes = [];
    const walks = REG.walk.get(k) || [], kerbs = REG.kerb.get(k) || [];
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    // footpath bricks at the texture's own brick positions (global rows of 0.125 m; odd rows offset half a brick)
    if (walks.length) { const red = [], grey = [];
      for (let R = Math.floor(z0 / 0.125); R * 0.125 < z1; R++) { const bz = R * 0.125 + B0; const off = (R & 1) * 0.125;
        for (let c = Math.floor((x0 - off) / 0.25); c * 0.25 + off < x1; c++) { const bx = c * 0.25 + off + B0; const mx = bx + BW / 2, mz = bz + BH / 2;
          if (mx < x0 || mx >= x1 || mz < z0 || mz >= z1) continue; const it = walkAt(walks, mx, mz); if (!it) continue;
          let ok = true; for (const [ex, ez] of [[bx - 0.004, bz - 0.004], [bx + BW + 0.004, bz - 0.004], [bx - 0.004, bz + BH + NOTCH + 0.004], [bx + BW + 0.004, bz + BH + NOTCH + 0.004]]) if (!walkAt(walks, ex, ez)) { ok = false; break; }
          if (!ok) continue; for (const s of kerbs) { for (const [ex, ez] of [[bx, bz], [bx + BW, bz], [bx, bz + BH + NOTCH], [bx + BW, bz + BH + NOTCH]]) if (segDist(ex, ez, s) < 0.158) { ok = false; break; } if (!ok) break; } if (!ok) continue; // clear of the kerb stones
          M.makeTranslation(bx, LY, bz); (it.grey ? grey : red).push(...M.elements); } }
      const a = this.inst(this.geo.brick, this.mat.walk, red), b = this.inst(this.geo.brick, this.mat.walkGrey, grey); if (a) meshes.push(a); if (b) meshes.push(b); }
    // kerb stones (blocks whose centre is in this tile)
    if (kerbs.length) { const mats = [], cols = [];
      for (const s of kerbs) { const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0); if (len < 0.05) continue; let dx = (s.x1 - s.x0) / len, dz = (s.z1 - s.z0) / len;
        // inward (footpath side) = the side where the footpath is
        const mx = (s.x0 + s.x1) / 2, mz = (s.z0 + s.z1) / 2; let nx = -dz, nz = dx; const all = REG.walk.get(key(Math.floor((mx + nx * 0.3) / T), Math.floor((mz + nz * 0.3) / T))) || [];
        if (!walkAt(all, mx + nx * 0.3, mz + nz * 0.3)) { nx = -nx; nz = -nz; } if (-dz * nx + dx * nz < 0) { dx = -dx; dz = -dz; } // basis (d, up, n) right-handed
        const nb = Math.max(1, Math.round(len / 0.5)), bl = len / nb;
        for (let b = 0; b < nb; b++) { const t = (b + 0.5) / nb; const bx = s.x0 + (s.x1 - s.x0) * t, bz = s.z0 + (s.z1 - s.z0) * t; if (bx < x0 || bx >= x1 || bz < z0 || bz >= z1) continue;
          M.makeBasis(new THREE.Vector3(dx, 0, dz), up, new THREE.Vector3(nx, 0, nz)); q.setFromRotationMatrix(M); p.set(bx, LY, bz); sc.set(bl - 0.005, 1, 1); M.compose(p, q, sc); mats.push(...M.elements); cols.push(...s.col); } }
      const m = this.inst(this.geo.kerb, this.mat.kerb, mats, cols); if (m) meshes.push(m); }
    // railway: ballast stones + fastenings along the track segments crossing this tile
    if (this.ballastK > 0) this.trackDetail(x0, z0, x1, z1, meshes, i * 7919 + j * 104729);
    return { meshes };
  }
  trackDetail(x0, z0, x1, z1, meshes, seed) {
    const P = RW.PATH, n = P.xs.length; const STEP = 2; const deckAt = (s) => RW.CROSSINGS.some((c) => Math.abs(s - c.s) <= c.half);
    let s0 = seed >>> 0 || 1; const rnd = () => ((s0 = (s0 * 16807) % 2147483647) / 2147483647);
    const stones = [[], [], []], stoneCol = [[], [], []], fast = []; const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (let k = 0; k < n - 1; k++) {
      const ax = P.xs[k], az = P.zs[k], bx = P.xs[k + 1], bz = P.zs[k + 1]; if (Math.max(ax, bx) < x0 - 3.2 || Math.min(ax, bx) > x1 + 3.2 || Math.max(az, bz) < z0 - 3.2 || Math.min(az, bz) > z1 + 3.2) continue;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2; if (L.isWater(mx, mz)) continue; if (deckAt((k + 0.5) * STEP)) continue;
      const l = Math.hypot(bx - ax, bz - az) || 1; const dx = (bx - ax) / l, dz = (bz - az) / l, nx = -dz, nz = dx; const yaw = Math.atan2(dx, dz);
      // fastenings on every sleeper (GroundBuilder/Railway lay sleepers every 0.65 m from each segment's start)
      for (let s = 0; s < l; s += 0.65) { const sx = ax + dx * s, sz = az + dz * s; for (const sd of [-1, 1]) { const fx = sx + nx * sd * RW.RAIL_OFF, fz = sz + nz * sd * RW.RAIL_OFF; if (fx < x0 || fx >= x1 || fz < z0 || fz >= z1) continue;
        q.setFromEuler(e.set(0, yaw, 0)); p.set(fx, RW.SLEEPER_TOP, fz); /* local x → across the track */ sc.set(1, 1, 1); M.compose(p, q, sc); fast.push(...M.elements); } }
      // loose stones: jittered grid over the bed (±1.9 m) and its shoulders (to ±3.1 m)
      const dens = 80 * this.ballastK, cell = 1 / Math.sqrt(dens);
      for (let s = cell / 2; s < l; s += cell) for (let w = -2.85; w <= 2.85; w += cell) {
        const ss = s + (rnd() - 0.5) * cell, ww = w + (rnd() - 0.5) * cell; const x = ax + dx * ss + nx * ww, z = az + dz * ss + nz * ww; if (x < x0 || x >= x1 || z < z0 || z >= z1) continue;
        const aw = Math.abs(ww); const sl = ((ss % 0.65) + 0.65) % 0.65; const onSleeper = aw < 1.34 && (sl < 0.15 || sl > 0.5); if (onSleeper) continue;
        const nearRail = Math.abs(aw - RW.RAIL_OFF) < 0.1; const r = (0.03 + rnd() * 0.03) * (nearRail ? 0.7 : 1);
        const gy = aw <= 1.9 ? RW.BALLAST_Y : RW.BALLAST_Y + (L.LAND_Y - 0.03 - RW.BALLAST_Y) * Math.min(1, (aw - 1.9) / 1.2); if (aw > 2.85) continue;
        const v = (rnd() * 3) | 0; q.setFromEuler(e.set((rnd() - 0.5) * 0.7, rnd() * 6.28, (rnd() - 0.5) * 0.7)); p.set(x, gy - r * 0.12, z); /* lying flat-ish, bedded in */ sc.set(2 * r * (0.9 + rnd() * 0.4), 2 * r * (0.8 + rnd() * 0.4), 2 * r * (0.9 + rnd() * 0.4)); /* unit icosahedron has radius 0.5 */ M.compose(p, q, sc); stones[v].push(...M.elements);
        const t = 0.5 + rnd() * 0.5, warm = (rnd() - 0.5) * 0.12; /* grey granite, a few rust-stained/dark pieces */ stoneCol[v].push(t + warm, t, t - warm); }
    }
    for (let v = 0; v < 3; v++) { const m = this.inst(this.geo.stones[v], this.mat.stone, stones[v], stoneCol[v]); if (m) meshes.push(m); }
    const f = this.inst(this.geo.fast, this.mat.fast, fast); if (f) meshes.push(f);
  }
}
