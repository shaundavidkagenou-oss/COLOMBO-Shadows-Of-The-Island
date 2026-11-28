// Forest: every tree, palm, banana clump, shrub, fern and weed in the city drawn with a handful of BatchedMeshes — one per
// material (bark, palm trunk, leaves, bright leaves, small leaves, palm fronds, banana blades, flowers / fruit), split into
// "trees" (cast shadows) and "ground plants" (receive only). That is ~12 draw calls for all vegetation instead of two per
// species per 200 m chunk (~340 for the trees alone before), so the city can carry far more plants for less CPU.
//
// Culling + LOD are done here on a 50 m cell grid, not per object by three.js:
//   • update() keeps the list of cells within range of the player (trees ~640 m, ground plants ~160 m);
//   • before each render pass (main camera, sun shadow, water reflection …) each BatchedMesh rebuilds its multi-draw list
//     from the cells whose bounds intersect THAT camera's frustum — a few hundred sphere tests and plain array writes,
//     no per-instance matrix maths; the street-lamp shadow cameras skip foliage entirely (as before);
//   • near cells draw the detailed geometry (clumped crowns with twigs, V-folded fronds, flowers / fruit), far cells the light
//     LOD (same silhouette, fewer bigger cards, no flowers), chosen per tree in the cells the LOD distance passes through.
// Instance matrices / tints are written once at load; nothing is allocated per frame.
import * as THREE from 'three';
import { MAT } from '../gfx/Materials.js';
import { treeShapes, plantShapes } from './TreeShapes.js';
import { LAND_Y } from './Layout.js';
import { RNG } from '../core/rng.js';
import { leafDepthMaterial } from './Vegetation.js';
import { leafMeshDepth } from './LeafMesh.js';
import { beginIndirect, commitIndirect } from '../gfx/IndirectCache.js';

export const CELL = 50;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
const FOLIAGE = new Set(['leaves', 'leavesBright', 'leavesSmall', 'palm', 'banana', 'bloom']);
// 88th: the three leaf materials are one (MAT.leaves — the photographic leaf sheet, per-card styles), so every tree's and
// every plant's leaf cards share one batch: 2 draws instead of 6 per pass
const LEAF_KEYS = new Set(['leaves', 'leavesBright', 'leavesSmall']);
const batchKey = (mk) => (LEAF_KEYS.has(mk) && MAT[mk] === MAT.leaves ? 'leaves' : mk);

export class Forest {
  // trees: plan.trees ({type, x, z, s, yaw, sy, sq}); plants: plan.plants ({type, x, z, s, yaw})
  constructor(trees, plants, quality = 'high') {
    this.group = new THREE.Group(); this.group.name = 'forest'; this.frame = 0; this.cache = new Map(); this.forced = new Set();
    this.setQuality(quality); this.stats = { instances: 0, draws: 0, cells: 0 };
    const TS = treeShapes(), PS = plantShapes();
    // ---- geometry registry: one BatchedMesh per (category, material)
    const groups = new Map(); const G = (cat, mk) => { const k = cat + ':' + mk; if (!groups.has(k)) groups.set(k, { key: k, cat, mk, geos: [], ids: new Map(), inst: 0 }); return groups.get(k); };
    const shapeParts = new Map(); // `${cat}:${type}` → [{ grp, hi, lo }]
    const partsOf = (cat, type) => { const k = cat + ':' + type; if (shapeParts.has(k)) return shapeParts.get(k); const d = cat === 'tree' ? TS[type] || TS.mara : PS[type] || PS.shrub;
      // 95th: 4 LODs per part (near, medium, far, very far). Two-level parts (bark, flowers, the cards build) draw their detailed
      // geometry in the first two bands and their light one in the last two — exactly the old hi / lo split at LOD[1].
      const out = d.parts.map((p) => { const grp = G(cat, batchKey(p.mat)); const reg = (g) => { if (!g) return -1; if (!grp.ids.has(g)) { grp.ids.set(g, grp.geos.length); grp.geos.push(g); } return grp.ids.get(g); };
        return { grp, g: p.lods ? p.lods.map(reg) : [reg(p.hi), reg(p.hi), reg(p.lo), reg(p.lo)] }; });
      shapeParts.set(k, out); return out; };
    const all = []; for (const t of trees) all.push(['tree', t]); for (const p of plants || []) all.push(['plant', p]);
    for (const [cat, t] of all) for (const pt of partsOf(cat, t.type)) pt.grp.inst++;
    // ---- the batched meshes (sized exactly; geometries added once)
    this.meshes = [];
    for (const grp of groups.values()) {
      let nv = 0, ni = 0; for (const g of grp.geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      const mat = MAT[grp.mk] || MAT.leaves; const bm = new THREE.BatchedMesh(Math.max(1, grp.inst), Math.max(3, nv), Math.max(3, ni), mat);
      bm.name = 'forest:' + grp.key; bm.frustumCulled = false; bm.perObjectFrustumCulled = false; bm.sortObjects = false;
      // 88th: flowers / fruit / nuts cast no shadow (sub-texel in the sun map) and cull with near ground-plant band (ci=1)
      bm.userData.ci = grp.cat === 'tree' && grp.mk !== 'bloom' ? 0 : 1; bm.castShadow = grp.cat === 'tree' && grp.mk !== 'bloom'; bm.receiveShadow = true;
      // shadow LOD: the leaf-mesh crowns cast their medium LOD on Ultra while near (band ≤ 1: leaf-sized dapples under the tree),
      // and the light crown LOD (band 2, ~4× fewer triangles, full silhouette) on High/Medium/Low and beyond
      const leafMesh = grp.mk === 'leaves' && MAT.leaves.userData.leafMesh; bm.userData.leafMesh = !!leafMesh; bm.userData.shNear = leafMesh && quality === 'ultra' ? 1 : 2;
      if (leafMesh) bm.customDepthMaterial = leafMeshDepth();
      else if (grp.mk === 'leaves' && MAT.leaves.map && MAT.leaves.map === MAT.leavesSmall.map) bm.customDepthMaterial = leafDepthMaterial();
      grp.gid = grp.geos.map((g) => bm.addGeometry(g)); grp.bm = bm; grp.n = this.meshes.length; this.meshes.push(bm); this.group.add(bm);
      const self = this, foliage = FOLIAGE.has(grp.mk);
      bm.onBeforeRender = function (r, sc, cam) { self.fill(this, cam); };
      bm.onBeforeShadow = function (r, ob, cam, shadowCam) { if (foliage && shadowCam.userData.noFoliage) { this._multiDrawCount = 0; return; } self.fill(this, shadowCam, true); };
    }
    // ---- instances, filed into cells
    this.cells = new Map(); const cellOf = (x, z) => { const i = Math.floor(x / CELL), j = Math.floor(z / CELL), k = i * 4099 + j; let c = this.cells.get(k);
      if (!c) { c = { i, j, x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, lists: [[], []], xz: [[], []], arr: null, pos: null, lod: [1, 1], far: [true, true] }; this.cells.set(k, c); } return c; };
    const rng = new RNG(5151); const HT = new Map();
    const heightOf = (cat, type) => { const k = cat + type; let h = HT.get(k); if (h != null) return h; const d = cat === 'tree' ? TS[type] || TS.mara : PS[type] || PS.shrub;
      if (d.h) h = d.h; else { h = 1; for (const p of d.parts) { const g = p.hi || (p.lods && p.lods[0]); if (g) { g.computeBoundingBox(); h = Math.max(h, g.boundingBox.max.y); } } }
      HT.set(k, h); return h; };
    for (const [cat, t] of all) {
      const parts = partsOf(cat, t.type), ci = cat === 'tree' ? 0 : 1; const cell = cellOf(t.x, t.z);
      const ry = t.yaw ?? rng.next() * Math.PI * 2, rs = rng.range(0.9, 1.1), sq = t.sq || 1, s = t.s || 1;
      _p.set(t.x, (t.y ?? LAND_Y) - 0.05, t.z); _q.setFromEuler(_e.set(0, ry, 0)); _s.set(s * sq, s * (t.sy ?? rs), s * sq); _m.compose(_p, _q, _s);
      const hue = rng.range(-0.025, 0.03), lit = rng.range(0.9, 1.1); // each plant a slightly different green
      const H = heightOf(cat, t.type) * s * (t.sy ?? rs); // the plant's own height → wind stiffness / frequency (Vegetation.js), in the batch colour's alpha
      for (const pt of parts) { const bm = pt.grp.bm, pCi = bm.userData.ci; const g0 = pt.g.find((q) => q >= 0); if (g0 === undefined) continue; const id = bm.addInstance(pt.grp.gid[g0]); bm.setMatrixAt(id, _m);
        if (FOLIAGE.has(pt.grp.mk) && pt.grp.mk !== 'bloom') _c.setRGB(lit * (1 + hue), lit, lit * (1 - hue)); else _c.setRGB(lit, lit, lit); bm.setColorAt(id, _c); bm._colorsTexture.image.data[id * 4 + 3] = H;
        cell.lists[pCi].push(pt.grp.n, id, ...pt.g.map((q) => (q >= 0 ? pt.grp.gid[q] : -1))); cell.xz[pCi].push(pt.grp.n, t.x, t.z); this.stats.instances++; }
      cell.top = Math.max(cell.top || 0, ci === 0 ? 16 * s : 2);
    }
    // per cell, per category: entries grouped by mesh → typed arrays [mesh][inst, hi, lo, …]
    // entries: [inst, g0, g1, g2, g3] (stride 5; g = geometry id of the LOD band, −1 = not drawn in that band)
    for (const c of this.cells.values()) { c.arr = c.lists.map((L) => { const by = []; for (let k = 0; k < L.length; k += 6) { (by[L[k]] ||= []).push(L[k + 1], L[k + 2], L[k + 3], L[k + 4], L[k + 5]); } return by.map((a) => (a ? Int32Array.from(a) : null)); });
      c.pos = c.xz.map((L) => { const by = []; for (let k = 0; k < L.length; k += 3) (by[L[k]] ||= []).push(L[k + 1], L[k + 2]); return by.map((a) => (a ? Float32Array.from(a) : null)); }); c.lists = null; c.xz = null; }
    this.cellList = [...this.cells.values()]; this.active = [[], []]; this.fx = 1e9; this.fz = 1e9;
    this.chunkCells = new Map();
  }
  // LOD bands per category (trees, ground plants): [near → medium, medium → far, far → very far] metres. The middle value is
  // the old single hi / lo distance (LOD[ci]), so two-level parts switch exactly where they did.
  setQuality(q) { this.R = q === 'low' ? [520, 90] : q === 'medium' ? [600, 130] : q === 'ultra' ? [760, 200] : [660, 150]; this.LOD = q === 'low' ? [80, 30] : q === 'ultra' ? [150, 60] : [100, 42];
    this.LB = q === 'low' ? [[22, 80, 200], [10, 30, 60]] : q === 'medium' ? [[35, 110, 250], [14, 45, 90]] : q === 'ultra' ? [[60, 150, 380], [24, 60, 130]] : [[40, 100, 240], [16, 42, 95]];
    this.LB2 = this.LB.map((b) => b.map((d) => d * d)); this.fx = 1e9;
    if (this.meshes) for (const bm of this.meshes) if (bm.userData.leafMesh) bm.userData.shNear = q === 'ultra' ? 1 : 2; }
  // the cells of one 200 m world chunk (Satellite tiles render chunks the player is nowhere near)
  chunkHandle(x0, z0, size) { const self = this; const list = this.cellList.filter((c) => c.x >= x0 && c.x < x0 + size && c.z >= z0 && c.z < z0 + size); let on = false;
    return { get visible() { return on; }, set visible(v) { on = !!v; for (const c of list) { if (on) self.forced.add(c); else self.forced.delete(c); } self.cache.clear(); } }; }
  // per frame: the cells in range of the focus (re-scanned when it has moved a few metres) and their LOD from the camera
  update(focus, camera) {
    this.frame++; this.cache.clear(); this.stats.draws = 0; const fx = focus.x, fz = focus.z;
    if (Math.hypot(fx - this.fx, fz - this.fz) > 4) { this.fx = fx; this.fz = fz; for (let ci = 0; ci < 2; ci++) { const R = this.R[ci] + CELL, A = this.active[ci]; A.length = 0;
        for (const c of this.cellList) { if (!c.arr[ci] || !c.arr[ci].length) continue; const dx = c.x - fx, dz = c.z - fz; if (dx * dx + dz * dz < R * R) A.push(c); } } }
    const cp = camera ? camera.position : focus; let n = 0;
    // LOD per tree, not per 50 m cell: a cell wholly inside / beyond the LOD distance draws all detailed / all light; a cell
    // the LOD circle passes through decides per tree from its own distance, so trees change one by one as you move instead
    // of a whole block of them switching in the same frame (the visible "pop" when driving). Shadow passes reuse it.
    this.cpx = cp.x; this.cpz = cp.z;
    // band of a cell: 0..3 when the whole cell lies in one band, −1 when a band edge passes through it (decided per tree)
    for (let ci = 0; ci < 2; ci++) { const B = this.LB[ci]; const band = (d) => (d < B[0] ? 0 : d < B[1] ? 1 : d < B[2] ? 2 : 3);
      for (const c of this.active[ci]) { const dc = Math.hypot(c.x - cp.x, c.z - cp.z), R = CELL * 0.72; const b0 = band(Math.max(0, dc - R)), b1 = band(dc + R);
        c.lod[ci] = b0 === b1 ? b0 : -1; c.far[ci] = Math.max(0, dc - CELL * 0.6) > this.R[ci]; n++; } }
    this.stats.cells = n;
  }
  // cells visible to one camera (cached per camera per frame: shared by all the batched meshes)
  visible(cam, ci) {
    const key = cam.id * 2 + ci; let v = this.cache.get(key); if (v) return v; v = [];
    cam.updateMatrixWorld(); _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm, cam.coordinateSystem, cam.reversedDepth);
    const r = CELL * 0.72 + (ci === 0 ? 14 : 2);
    for (const c of this.active[ci]) { if (c.far[ci]) continue; _sph.center.set(c.x, LAND_Y + (ci === 0 ? 8 : 1), c.z); _sph.radius = r; if (_fr.intersectsSphere(_sph)) v.push(c); }
    for (const c of this.forced) { if (!c.arr[ci] || v.includes(c)) continue; v.push(c); }
    this.cache.set(key, v); return v;
  }
  // rebuild one batched mesh's multi-draw list for this camera
  // shadow passes draw the light LOD of every tree (same crown clumps and silhouette, ~4 × fewer triangles; 88th)
  fill(bm, cam, shadow = false) {
    const ci = bm.userData.ci; const isRefl = cam && cam.name === 'waterRefl';
    if (isRefl && ci === 1) { bm._multiDrawCount = 0; commitIndirect(bm, cam, 0); bm._visibilityChanged = false; return; } // ground shrubs/weeds are invisible in water reflections
    const n0 = this.meshes.indexOf(bm); const cells = this.visible(cam, ci);
    const starts = bm._multiDrawStarts, counts = bm._multiDrawCounts, ind = beginIndirect(bm), GI = bm._geometryInfo; const idx = bm.geometry.getIndex(); const bpe = idx ? idx.array.BYTES_PER_ELEMENT : 1;
    let n = 0; const forcedLo = this.forced.size > 0;
    const B2 = this.LB2[ci], px = this.cpx, pz = this.cpz; const shN = bm.userData.shNear || 2;
    for (const c of cells) { const a = c.arr[ci][n0]; if (!a) continue; const forcedL = isRefl || (forcedLo && this.forced.has(c)); const mode = forcedL ? 3 : c.lod[ci]; const xz = mode < 0 ? c.pos[ci][n0] : null;
      for (let k = 0, q = 0; k < a.length; k += 5, q += 2) {
        let b = mode; if (xz) { const dx = xz[q] - px, dz = xz[q + 1] - pz, d2 = dx * dx + dz * dz; b = d2 < B2[0] ? 0 : d2 < B2[1] ? 1 : d2 < B2[2] ? 2 : 3; }
        let g; if (shadow) { const s = b <= 1 ? shN : 2; g = a[k + 1 + s]; if (g < 0 && s === 2) g = a[k + 2]; } // shadow: its LOD, else the medium one (flowers), never the near-only twigs
        else g = a[k + 1 + b];
        if (g < 0) continue; const gi = GI[g]; starts[n] = gi.start * bpe; counts[n] = gi.count; ind[n] = a[k]; n++; } }
    bm._multiDrawCount = n; bm._multiDrawBytesPerElement = bpe; commitIndirect(bm, cam, n); /* 98th: uploaded only when this camera's list changed */ bm._visibilityChanged = false;
    if (!shadow) this.stats.draws += n;
  }
}
