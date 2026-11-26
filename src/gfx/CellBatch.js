// FPS (no visual change): a merged static mesh that spans a whole chunk / district (window joinery, street dressing, building
// detail) is culled all-or-nothing — if one window frame is on screen, every frame in that 200 m chunk is transformed and
// rasterised, including the ones behind the camera. cellBatch() cuts the merged geometry into square cells (by triangle
// centroid; nothing is moved, split or re-tessellated) and packs the cells into one THREE.BatchedMesh: still ONE draw call,
// but three.js frustum-culls every cell on its own (main camera and shadow cameras alike) before the multi-draw.
// The instance matrices are identity, so shaders patched with onBeforeCompile see exactly the old vertex positions.
import * as THREE from 'three';
import { installCull, coarseFirst, CSLOTS } from './BatchCull.js';

const OWN_SHADOW = THREE.Object3D.prototype.onBeforeShadow, OWN_RENDER = THREE.Object3D.prototype.onBeforeRender;
export const CELL_STATS = { meshes: 0, cells: 0, tris: 0, skipped: 0 };

// can this mesh be cell-batched without changing how it renders?
export function cellBatchable(m, minTris = 6000) {
  if (!m || !m.isMesh || m.isInstancedMesh || m.isBatchedMesh || m.isSkinnedMesh || !m.geometry || !m.geometry.index) return false;
  const mat = m.material; if (!mat || Array.isArray(mat) || mat.isShaderMaterial || mat.isRawShaderMaterial) return false;
  if (m.onBeforeShadow !== OWN_SHADOW || m.onBeforeRender !== OWN_RENDER || m.customDepthMaterial || m.customDistanceMaterial) return false;
  const g = m.geometry; if (g.morphAttributes && Object.keys(g.morphAttributes).length) return false; if (g.groups && g.groups.length > 1) return false;
  for (const a of Object.values(g.attributes)) if (a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute) return false;
  return g.index.count >= 3 * minTris; // small meshes: nothing to gain (unless they get culled per cell: cellBatch(…, cull))
}

// cut an indexed geometry into square cells by triangle centroid (nothing moved or re-tessellated): [{ geo, box: [x0, x1, z0, z1] }]
// (positions are taken through `matrix` when given — the cell a triangle lands in is decided in world space)
export function splitCells(g, cell, matrix = null) {
  const idx = g.index.array, P = g.attributes.position.array; const names = Object.keys(g.attributes); const e = matrix && !isIdentity(matrix) ? matrix.elements : null;
  const wx = (i) => (e ? e[0] * P[i] + e[4] * P[i + 1] + e[8] * P[i + 2] + e[12] : P[i]), wz = (i) => (e ? e[2] * P[i] + e[6] * P[i + 1] + e[10] * P[i + 2] + e[14] : P[i + 2]);
  const cells = new Map();
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const cx = (wx(a) + wx(b) + wx(c)) / 3, cz = (wz(a) + wz(b) + wz(c)) / 3; const k = Math.floor(cx / cell) * 100003 + Math.floor(cz / cell);
    let L = cells.get(k); if (!L) cells.set(k, (L = [])); L.push(t); }
  const out = [];
  for (const L of cells.values()) { const remap = new Map(); const order = []; const ix = new Uint32Array(L.length * 3); let w = 0;
    for (const t of L) for (let j = 0; j < 3; j++) { const v = idx[t + j]; let r = remap.get(v); if (r === undefined) { r = order.length; remap.set(v, r); order.push(v); } ix[w++] = r; }
    const cg = new THREE.BufferGeometry(); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity;
    for (const v of order) { const X = wx(v * 3), Z = wz(v * 3); if (X < x0) x0 = X; if (X > x1) x1 = X; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z; const Y = e ? e[1] * P[v * 3] + e[5] * P[v * 3 + 1] + e[9] * P[v * 3 + 2] + e[13] : P[v * 3 + 1]; if (Y > y1) y1 = Y; }
    for (const n of names) { const A = g.attributes[n], s = A.itemSize, src = A.array; const o = new src.constructor(order.length * s); for (let i = 0; i < order.length; i++) for (let j = 0; j < s; j++) o[i * s + j] = src[order[i] * s + j]; cg.setAttribute(n, new THREE.BufferAttribute(o, s, A.normalized)); }
    cg.setIndex(new THREE.BufferAttribute(order.length > 65535 ? ix : Uint16Array.from(ix), 1)); out.push({ geo: cg, box: [x0, x1, z0, z1, y1] }); }
  return out;
}
function isIdentity(m) { const e = m.elements; for (let i = 0; i < 16; i++) if (Math.abs(e[i] - (i % 5 === 0 ? 1 : 0)) > 1e-9) return false; return true; }
// 65th: the occlusion cells (OcclusionCuller grid) a world box overlaps, in CSLOTS slots (−1 unused); all −1 = never occlusion-
// culled (more cells than slots, or no culler). top (optional): raises those cells' prop (prop = true) or ground boxes to it
export function cellsOfBox(occ, box, out, o, top = null, prop = true) {
  out.fill(-1, o, o + CSLOTS); if (!occ || !occ.nC) return;
  const cs = occ.cfg.cell; const i0 = Math.floor((box[0] - occ.cx0) / cs), i1 = Math.floor((box[1] - occ.cx0) / cs), k0 = Math.floor((box[2] - occ.cz0) / cs), k1 = Math.floor((box[3] - occ.cz0) / cs);
  if ((i1 - i0 + 1) * (k1 - k0 + 1) > CSLOTS || i0 < 0 || k0 < 0 || i1 >= occ.ncx || k1 >= occ.ncz) return;
  let w = 0; for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) { const c = k * occ.ncx + i; out[o + w++] = c; if (top !== null) { if (prop) occ.raiseProp(c, top); else occ.raiseCell(c, top); } }
}
// returns a BatchedMesh replacing `m` (same name / material / flags / transform), or `m` itself when it isn't worth it
// cull (65th): { kind: 'cell' | 'tiny', occ } → per-cell occlusion (main camera) / draw distance (BatchCull.js)
export function cellBatch(m, cell = 50, cull = null) {
  if (!cellBatchable(m, cull ? 64 : 6000)) { CELL_STATS.skipped++; return m; }
  const g = m.geometry, idx = g.index.array; m.updateMatrix();
  const parts = splitCells(g, cell, m.matrix); if (parts.length < (cull ? 2 : 3)) { for (const p of parts) p.geo.dispose(); CELL_STATS.skipped++; return m; }
  // grouped by 200 m blocks (BatchCull tests a block's bounding sphere before its cells)
  const blk = (p) => Math.floor((p.box[0] + p.box[1]) / 400) * 100003 + Math.floor((p.box[2] + p.box[3]) / 400); parts.sort((a, b) => blk(a) - blk(b));
  const grp = [0]; for (let i = 1; i < parts.length; i++) if (blk(parts[i]) !== blk(parts[i - 1])) grp.push(i); grp.push(parts.length);
  let nv = 0, ni = 0; for (const p of parts) { nv += p.geo.attributes.position.count; ni += p.geo.index.count; }
  const B = new THREE.BatchedMesh(parts.length, nv, ni, m.material); const cells = new Int32Array(parts.length * CSLOTS);
  for (const p of parts) { const gid = B.addGeometry(p.geo); const iid = B.addInstance(gid); p.geo.dispose(); if (cull) { const bx = p.box; if (!isIdentity(m.matrix)) cells.fill(-1, iid * CSLOTS, iid * CSLOTS + CSLOTS); else cellsOfBox(cull.occ, bx, cells, iid * CSLOTS, bx[4]); } }
  if (m.customDepthMaterial) B.customDepthMaterial = m.customDepthMaterial; B.name = m.name; B.castShadow = m.castShadow; B.receiveShadow = m.receiveShadow; B.renderOrder = m.renderOrder; B.layers.mask = m.layers.mask; B.visible = m.visible;
  B.userData = { ...m.userData, cellBatched: true }; B.frustumCulled = m.frustumCulled; B.perObjectFrustumCulled = true;
  B.matrixAutoUpdate = m.matrixAutoUpdate; B.position.copy(m.position); B.quaternion.copy(m.quaternion); B.scale.copy(m.scale); B.matrix.copy(m.matrix);
  B.computeBoundingBox(); B.computeBoundingSphere(); if (cull) installCull(B, { kind: cull.kind || 'cell', cells, cellKind: 'prop', grp: Int32Array.from(grp) });
  CELL_STATS.meshes++; CELL_STATS.cells += parts.length; CELL_STATS.tris += idx.length / 3;
  g.dispose(); return B;
}

// dispose either kind (BatchedMesh also owns its matrix / index textures)
export function disposeMesh(m) { if (m.isBatchedMesh) m.dispose(); else if (m.geometry) m.geometry.dispose(); }

// Streamed chunks (World.stepJob): the merged geometry of a material is built building after building, so each building owns
// a contiguous vertex + index range of it (recorded while generating). RangeBatch turns those ranges into the instances of
// one BatchedMesh — per-building frustum culling, one draw call — a few buildings per call of step() (time-sliced like
// SliceBuild, so streaming stays hitch-free). Same vertices, same triangles; only the culling granularity changes.
// 65th: opts.kind ('detail' | 'win') + opts.ids (range → building id) install the per-instance occlusion / LOD culling
// (BatchCull.js); kind 'detail' also orders every building's triangles coarse-first (BatchCull.coarseFirst) for its LOD.
const ADOPT_OK = THREE.REVISION === '186'; // RangeBatch.adopt fills BatchedMesh internals as r186's addGeometry does (other versions: the copying path)
export class RangeBatch {
  constructor(g, ranges, material, opts = null) {
    this.g = g; this.ranges = ranges; this.i = 0; let nv = 0, ni = 0; for (const r of ranges) { nv += r[1] - r[0]; ni += r[3] - r[2]; }
    this.opts = opts; this.coarse = []; this.bid = new Int32Array(ranges.length).fill(-1);
    this.mesh = new THREE.BatchedMesh(ranges.length, nv, ni, material); this.mesh.perObjectFrustumCulled = true; if (material.leafDepth) this.mesh.customDepthMaterial = material.leafDepth;
    this.IA = nv > 65535 ? Uint32Array : Uint16Array; this.names = Object.keys(g.attributes);
    // 93rd: a geometry worker's precomputed per-building data (rangePre below) — used only if it matches these ranges exactly
    const P = opts && opts.pre; this.pre = P && P.n === ranges.length && P.ni === ni && P.idx instanceof this.IA ? P : null;
    if (this.pre) { this.off = new Int32Array(ranges.length); let o = 0; for (let i = 0; i < ranges.length; i++) { this.off[i] = o; o += ranges[i][3] - ranges[i][2]; } }
  }
  // 93rd: contiguous ranges prepared by a geometry worker: the merged buffers ARE the batch's buffers (vertex order unchanged; the
  // worker wrote the batch index: vertexStart + rebased, coarse-first). The geometry table is filled exactly as addGeometry fills
  // it (three r186 BatchedMesh), without allocating and copying the material a second time (tens of MB a chunk: GC pauses)
  adopt() {
    const g = this.g, B = this.mesh, P = this.pre, R = this.ranges, O = this.opts; if (!ADOPT_OK || !Array.isArray(B._geometryInfo) || B._geometryInitialized || B._geometryCount) return false;
    let nv = 0; for (const r of R) nv += r[1] - r[0];
    for (const n of this.names) { const A = g.attributes[n]; B.geometry.setAttribute(n, new THREE.BufferAttribute(A.array.subarray(0, nv * A.itemSize), A.itemSize, A.normalized)); }
    B.geometry.setIndex(new THREE.BufferAttribute(P.idx, 1)); B._geometryInitialized = true;
    for (let ri = 0; ri < R.length; ri++) { const [v0, v1, i0, i1] = R[ri], b = P.gb, q = P.gs, o = ri * 6, u = ri * 4;
      const gi = { vertexStart: v0, vertexCount: v1 - v0, reservedVertexCount: v1 - v0, indexStart: i0, indexCount: i1 - i0, reservedIndexCount: i1 - i0, start: i0, count: i1 - i0,
        boundingBox: new THREE.Box3(new THREE.Vector3(b[o], b[o + 1], b[o + 2]), new THREE.Vector3(b[o + 3], b[o + 4], b[o + 5])), boundingSphere: new THREE.Sphere(new THREE.Vector3(q[u], q[u + 1], q[u + 2]), q[u + 3]), active: true };
      const gid = B._geometryCount++; B._geometryInfo.push(gi); B._nextVertexStart = v1; B._nextIndexStart = i1; const iid = B.addInstance(gid);
      if (O && O.kind === 'detail') this.coarse[gid] = P.coarse[ri];
      if (O && O.ids) { const id = O.ids[ri] ?? -1; this.bid[iid] = id; if (id >= 0) { const v = P.vbox; if (!(O.occ && O.occ.growTarget(id, v[o], v[o + 3], v[o + 2], v[o + 5], v[o + 4]))) this.bid[iid] = -1; } } }
    B._visibilityChanged = true; this.i = R.length; return true;
  }
  step(t0, budgetMs) {
    const g = this.g, I = g.index.array, B = this.mesh;
    if (this.pre && this.pre.batch && this.i === 0 && !this.triedAdopt) { this.triedAdopt = true; this.adopt(); }
    while (this.i < this.ranges.length) { const [v0, v1, i0, i1] = this.ranges[this.i++]; const cg = new THREE.BufferGeometry();
      for (const n of this.names) { const A = g.attributes[n], s = A.itemSize; cg.setAttribute(n, new THREE.BufferAttribute(A.array.subarray(v0 * s, v1 * s), s, A.normalized)); }
      const Pre = this.pre, ri = this.i - 1, O = this.opts; let ix, coarse;
      if (Pre && Pre.batch) { ix = new this.IA(i1 - i0); const src = Pre.idx, o0 = this.off[ri]; for (let k = 0; k < ix.length; k++) ix[k] = src[o0 + k] - v0; coarse = O && O.kind === 'detail' ? Pre.coarse[ri] : -1; } // (adopt() unavailable)
      else if (Pre) { ix = Pre.idx.subarray(this.off[ri], this.off[ri] + (i1 - i0)); coarse = O && O.kind === 'detail' ? Pre.coarse[ri] : -1; } // rebased + coarse-first ordered in the worker
      else { ix = new this.IA(i1 - i0); for (let k = i0; k < i1; k++) ix[k - i0] = I[k] - v0; coarse = O && O.kind === 'detail' ? coarseFirst(ix, cg.attributes.position.array) : -1; }
      cg.setIndex(new THREE.BufferAttribute(ix, 1));
      const gid = B.addGeometry(cg); const iid = B.addInstance(gid); if (coarse >= 0) this.coarse[gid] = coarse;
      if (Pre && B._geometryInfo && B._geometryInfo[gid]) { const gi = B._geometryInfo[gid], b = Pre.gb, q = Pre.gs, o = ri * 6, u = ri * 4; // the bounds BatchedMesh would compute (getBoundingBoxAt / getBoundingSphereAt), same values
        gi.boundingBox = new THREE.Box3(new THREE.Vector3(b[o], b[o + 1], b[o + 2]), new THREE.Vector3(b[o + 3], b[o + 4], b[o + 5])); gi.boundingSphere = new THREE.Sphere(new THREE.Vector3(q[u], q[u + 1], q[u + 2]), q[u + 3]); }
      if (O && O.ids) { const id = O.ids[ri] ?? -1; this.bid[iid] = id; if (id >= 0) { let x0, x1, z0, z1, y1; if (Pre) { const v = Pre.vbox, o = ri * 6; x0 = v[o]; z0 = v[o + 2]; x1 = v[o + 3]; y1 = v[o + 4]; z1 = v[o + 5]; } else { cg.computeBoundingBox(); const bb = cg.boundingBox; x0 = bb.min.x; x1 = bb.max.x; z0 = bb.min.z; z1 = bb.max.z; y1 = bb.max.y; }
          if (!(O.occ && O.occ.growTarget(id, x0, x1, z0, z1, y1))) this.bid[iid] = -1; } }
      if (performance.now() - t0 > budgetMs) return false; }
    B.computeBoundingBox(); B.computeBoundingSphere(); if (this.opts) installCull(B, { kind: this.opts.kind, bid: this.bid, coarse: this.opts.kind === 'detail' ? this.coarse : null }); CELL_STATS.meshes++; CELL_STATS.cells += this.ranges.length; CELL_STATS.tris += I.length / 3; g.dispose(); return true;
  }
}
// 93rd — what RangeBatch.step computes per building on the main thread, done ahead in a geometry worker (GeoWorker.js) with the
// same arithmetic: the building's indices rebased to its own vertices (detail: coarse triangles first), its vertex bounding box
// (cg.computeBoundingBox, for the occlusion target) and the bounds BatchedMesh derives from the indexed vertices (getBoundingBoxAt
// / getBoundingSphereAt: box, then centre = box centre, radius = farthest indexed vertex). pos / I: the material's merged arrays.
export function rangePre(pos, I, ranges, detail) {
  let nv = 0, ni = 0; for (const r of ranges) { nv += r[1] - r[0]; ni += r[3] - r[2]; } const n = ranges.length;
  const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni), coarse = new Int32Array(n).fill(-1), vbox = new Float64Array(n * 6), gb = new Float64Array(n * 6), gs = new Float64Array(n * 4); let o = 0;
  for (let ri = 0; ri < n; ri++) { const [v0, v1, i0, i1] = ranges[ri]; const ix = idx.subarray(o, o + (i1 - i0)); for (let k = i0; k < i1; k++) ix[k - i0] = I[k] - v0;
    const P = pos.subarray(v0 * 3, v1 * 3); if (detail) coarse[ri] = coarseFirst(ix, P);
    let ax = Infinity, ay = Infinity, az = Infinity, bx = -Infinity, by = -Infinity, bz = -Infinity;
    for (let j = 0; j < P.length; j += 3) { const x = P[j], y = P[j + 1], z = P[j + 2]; ax = Math.min(ax, x); ay = Math.min(ay, y); az = Math.min(az, z); bx = Math.max(bx, x); by = Math.max(by, y); bz = Math.max(bz, z); }
    vbox[ri * 6] = ax; vbox[ri * 6 + 1] = ay; vbox[ri * 6 + 2] = az; vbox[ri * 6 + 3] = bx; vbox[ri * 6 + 4] = by; vbox[ri * 6 + 5] = bz;
    ax = ay = az = Infinity; bx = by = bz = -Infinity;
    for (let k = 0; k < ix.length; k++) { const j = ix[k] * 3, x = P[j], y = P[j + 1], z = P[j + 2]; ax = Math.min(ax, x); ay = Math.min(ay, y); az = Math.min(az, z); bx = Math.max(bx, x); by = Math.max(by, y); bz = Math.max(bz, z); }
    gb[ri * 6] = ax; gb[ri * 6 + 1] = ay; gb[ri * 6 + 2] = az; gb[ri * 6 + 3] = bx; gb[ri * 6 + 4] = by; gb[ri * 6 + 5] = bz;
    const empty = bx < ax || by < ay || bz < az, cx = empty ? 0 : (ax + bx) * 0.5, cy = empty ? 0 : (ay + by) * 0.5, cz = empty ? 0 : (az + bz) * 0.5; let r2 = 0;
    for (let k = 0; k < ix.length; k++) { const j = ix[k] * 3, dx = cx - P[j], dy = cy - P[j + 1], dz = cz - P[j + 2]; r2 = Math.max(r2, dx * dx + dy * dy + dz * dz); }
    gs[ri * 4] = cx; gs[ri * 4 + 1] = cy; gs[ri * 4 + 2] = cz; gs[ri * 4 + 3] = Math.sqrt(r2); o += i1 - i0; }
  // contiguous from the first vertex / index (the usual case): turn the rebased indices into the batch's own (RangeBatch.adopt)
  let batch = ranges[0][0] === 0 && ranges[0][2] === 0; for (let ri = 1; ri < n && batch; ri++) if (ranges[ri][0] !== ranges[ri - 1][1] || ranges[ri][2] !== ranges[ri - 1][3]) batch = false;
  if (batch) for (let ri = 0; ri < n; ri++) { const [v0, , i0, i1] = ranges[ri]; if (v0) for (let k = i0; k < i1; k++) idx[k] += v0; }
  return { n, ni, idx, coarse, vbox, gb, gs, batch };
}
// contiguous per-building ranges of material `name` from the marks taken before each building (and one at the end)
// (65th: element 4 = the index of the building the range belongs to — the mark before it)
export function rangesFor(marks, name) { const out = []; let prev = [0, 0];
  for (let mi = 0; mi < marks.length; mi++) { const e = marks[mi].get(name) || prev; if (e[1] > prev[1]) out.push([prev[0], e[0], prev[1], e[1], mi - 1]); prev = e; } return out; }
