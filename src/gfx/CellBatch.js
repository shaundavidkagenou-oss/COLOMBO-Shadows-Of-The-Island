// FPS (no visual change): a merged static mesh that spans a whole chunk / district (window joinery, street dressing, building
// detail) is culled all-or-nothing — if one window frame is on screen, every frame in that 200 m chunk is transformed and
// rasterised, including the ones behind the camera. cellBatch() cuts the merged geometry into square cells (by triangle
// centroid; nothing is moved, split or re-tessellated) and packs the cells into one THREE.BatchedMesh: still ONE draw call,
// but three.js frustum-culls every cell on its own (main camera and shadow cameras alike) before the multi-draw.
// The instance matrices are identity, so shaders patched with onBeforeCompile see exactly the old vertex positions.
import * as THREE from 'three';

const OWN_SHADOW = THREE.Object3D.prototype.onBeforeShadow, OWN_RENDER = THREE.Object3D.prototype.onBeforeRender;
export const CELL_STATS = { meshes: 0, cells: 0, tris: 0, skipped: 0 };

// can this mesh be cell-batched without changing how it renders?
export function cellBatchable(m) {
  if (!m || !m.isMesh || m.isInstancedMesh || m.isBatchedMesh || m.isSkinnedMesh || !m.geometry || !m.geometry.index) return false;
  const mat = m.material; if (!mat || Array.isArray(mat) || mat.isShaderMaterial || mat.isRawShaderMaterial) return false;
  if (m.onBeforeShadow !== OWN_SHADOW || m.onBeforeRender !== OWN_RENDER || m.customDepthMaterial || m.customDistanceMaterial) return false;
  const g = m.geometry; if (g.morphAttributes && Object.keys(g.morphAttributes).length) return false; if (g.groups && g.groups.length > 1) return false;
  for (const a of Object.values(g.attributes)) if (a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute) return false;
  return g.index.count >= 3 * 6000; // small meshes: nothing to gain
}

// returns a BatchedMesh replacing `m` (same name / material / flags / transform), or `m` itself when it isn't worth it
export function cellBatch(m, cell = 50) {
  if (!cellBatchable(m)) { CELL_STATS.skipped++; return m; }
  const g = m.geometry, idx = g.index.array, P = g.attributes.position.array; const names = Object.keys(g.attributes);
  const cells = new Map();
  for (let t = 0; t < idx.length; t += 3) { const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const cx = (P[a] + P[b] + P[c]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3; const k = Math.floor(cx / cell) * 100003 + Math.floor(cz / cell);
    let L = cells.get(k); if (!L) cells.set(k, (L = [])); L.push(t); }
  if (cells.size < 3) { CELL_STATS.skipped++; return m; }
  // per-cell compact geometries (vertex remap), same attributes as the source
  const geos = []; let nv = 0, ni = 0;
  for (const L of cells.values()) { const remap = new Map(); const order = []; const ix = new Uint32Array(L.length * 3); let w = 0;
    for (const t of L) for (let j = 0; j < 3; j++) { const v = idx[t + j]; let r = remap.get(v); if (r === undefined) { r = order.length; remap.set(v, r); order.push(v); } ix[w++] = r; }
    const cg = new THREE.BufferGeometry();
    for (const n of names) { const A = g.attributes[n], s = A.itemSize, src = A.array; const out = new src.constructor(order.length * s); for (let i = 0; i < order.length; i++) for (let j = 0; j < s; j++) out[i * s + j] = src[order[i] * s + j]; cg.setAttribute(n, new THREE.BufferAttribute(out, s, A.normalized)); }
    cg.setIndex(new THREE.BufferAttribute(order.length > 65535 ? ix : Uint16Array.from(ix), 1)); geos.push(cg); nv += order.length; ni += ix.length; }
  const B = new THREE.BatchedMesh(geos.length, nv, ni, m.material);
  for (const cg of geos) { const gid = B.addGeometry(cg); B.addInstance(gid); cg.dispose(); }
  B.name = m.name; B.castShadow = m.castShadow; B.receiveShadow = m.receiveShadow; B.renderOrder = m.renderOrder; B.layers.mask = m.layers.mask; B.visible = m.visible;
  B.userData = { ...m.userData, cellBatched: true }; B.frustumCulled = m.frustumCulled; B.perObjectFrustumCulled = true;
  m.updateMatrix(); B.matrixAutoUpdate = m.matrixAutoUpdate; B.position.copy(m.position); B.quaternion.copy(m.quaternion); B.scale.copy(m.scale); B.matrix.copy(m.matrix);
  B.computeBoundingBox(); B.computeBoundingSphere();
  CELL_STATS.meshes++; CELL_STATS.cells += geos.length; CELL_STATS.tris += idx.length / 3;
  g.dispose(); return B;
}

// dispose either kind (BatchedMesh also owns its matrix / index textures)
export function disposeMesh(m) { if (m.isBatchedMesh) m.dispose(); else if (m.geometry) m.geometry.dispose(); }

// Streamed chunks (World.stepJob): the merged geometry of a material is built building after building, so each building owns
// a contiguous vertex + index range of it (recorded while generating). RangeBatch turns those ranges into the instances of
// one BatchedMesh — per-building frustum culling, one draw call — a few buildings per call of step() (time-sliced like
// SliceBuild, so streaming stays hitch-free). Same vertices, same triangles; only the culling granularity changes.
export class RangeBatch {
  constructor(g, ranges, material) {
    this.g = g; this.ranges = ranges; this.i = 0; let nv = 0, ni = 0; for (const r of ranges) { nv += r[1] - r[0]; ni += r[3] - r[2]; }
    this.mesh = new THREE.BatchedMesh(ranges.length, nv, ni, material); this.mesh.perObjectFrustumCulled = true;
    this.IA = nv > 65535 ? Uint32Array : Uint16Array; this.names = Object.keys(g.attributes);
  }
  step(t0, budgetMs) {
    const g = this.g, I = g.index.array, B = this.mesh;
    while (this.i < this.ranges.length) { const [v0, v1, i0, i1] = this.ranges[this.i++]; const cg = new THREE.BufferGeometry();
      for (const n of this.names) { const A = g.attributes[n], s = A.itemSize; cg.setAttribute(n, new THREE.BufferAttribute(A.array.subarray(v0 * s, v1 * s), s, A.normalized)); }
      const ix = new this.IA(i1 - i0); for (let k = i0; k < i1; k++) ix[k - i0] = I[k] - v0; cg.setIndex(new THREE.BufferAttribute(ix, 1));
      B.addInstance(B.addGeometry(cg));
      if (performance.now() - t0 > budgetMs) return false; }
    B.computeBoundingBox(); B.computeBoundingSphere(); CELL_STATS.meshes++; CELL_STATS.cells += this.ranges.length; CELL_STATS.tris += I.length / 3; g.dispose(); return true;
  }
}
// contiguous per-building ranges of material `name` from the marks taken before each building (and one at the end)
export function rangesFor(marks, name) { const out = []; let prev = [0, 0];
  for (const m of marks) { const e = m.get(name) || prev; if (e[1] > prev[1]) out.push([prev[0], e[0], prev[1], e[1]]); prev = e; } return out; }
