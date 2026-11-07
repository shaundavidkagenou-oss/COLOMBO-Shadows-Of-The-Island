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
//     LOD (same silhouette, fewer bigger cards, no flowers), with a little hysteresis so trees don't flicker at the boundary.
// Instance matrices / tints are written once at load; nothing is allocated per frame.
import * as THREE from 'three';
import { MAT } from '../gfx/Materials.js';
import { treeShapes, plantShapes } from './TreeShapes.js';
import { LAND_Y } from './Layout.js';
import { RNG } from '../core/rng.js';

export const CELL = 50;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere();
const FOLIAGE = new Set(['leaves', 'leavesBright', 'leavesSmall', 'palm', 'banana', 'bloom']);

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
      const out = d.parts.map((p) => { const grp = G(cat, p.mat); const reg = (g) => { if (!g) return -1; if (!grp.ids.has(g)) { grp.ids.set(g, grp.geos.length); grp.geos.push(g); } return grp.ids.get(g); }; return { grp, hi: reg(p.hi), lo: reg(p.lo) }; });
      shapeParts.set(k, out); return out; };
    const all = []; for (const t of trees) all.push(['tree', t]); for (const p of plants || []) all.push(['plant', p]);
    for (const [cat, t] of all) for (const pt of partsOf(cat, t.type)) pt.grp.inst++;
    // ---- the batched meshes (sized exactly; geometries added once)
    this.meshes = [];
    for (const grp of groups.values()) {
      let nv = 0, ni = 0; for (const g of grp.geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      const mat = MAT[grp.mk] || MAT.leaves; const bm = new THREE.BatchedMesh(Math.max(1, grp.inst), Math.max(3, nv), Math.max(3, ni), mat);
      bm.name = 'forest:' + grp.key; bm.frustumCulled = false; bm.perObjectFrustumCulled = false; bm.sortObjects = false;
      bm.castShadow = grp.cat === 'tree'; bm.receiveShadow = true;
      grp.gid = grp.geos.map((g) => bm.addGeometry(g)); grp.bm = bm; grp.n = this.meshes.length; this.meshes.push(bm); this.group.add(bm);
      const self = this, foliage = FOLIAGE.has(grp.mk);
      bm.onBeforeRender = function (r, sc, cam) { self.fill(this, cam); };
      bm.onBeforeShadow = function (r, ob, cam, shadowCam) { if (foliage && shadowCam.userData.noFoliage) { this._multiDrawCount = 0; return; } self.fill(this, shadowCam, true); };
    }
    // ---- instances, filed into cells
    this.cells = new Map(); const cellOf = (x, z) => { const i = Math.floor(x / CELL), j = Math.floor(z / CELL), k = i * 4099 + j; let c = this.cells.get(k);
      if (!c) { c = { i, j, x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, lists: [[], []], arr: null, lod: [1, 1], far: [true, true] }; this.cells.set(k, c); } return c; };
    const rng = new RNG(5151);
    for (const [cat, t] of all) {
      const parts = partsOf(cat, t.type), ci = cat === 'tree' ? 0 : 1; const cell = cellOf(t.x, t.z);
      const ry = t.yaw ?? rng.next() * Math.PI * 2, rs = rng.range(0.9, 1.1), sq = t.sq || 1, s = t.s || 1;
      _p.set(t.x, (t.y ?? LAND_Y) - 0.05, t.z); _q.setFromEuler(_e.set(0, ry, 0)); _s.set(s * sq, s * (t.sy ?? rs), s * sq); _m.compose(_p, _q, _s);
      const hue = rng.range(-0.025, 0.03), lit = rng.range(0.9, 1.1); // each plant a slightly different green
      for (const pt of parts) { const bm = pt.grp.bm; const id = bm.addInstance(pt.grp.gid[pt.hi >= 0 ? pt.hi : pt.lo]); bm.setMatrixAt(id, _m);
        if (FOLIAGE.has(pt.grp.mk) && pt.grp.mk !== 'bloom') _c.setRGB(lit * (1 + hue), lit, lit * (1 - hue)); else _c.setRGB(lit, lit, lit); bm.setColorAt(id, _c);
        cell.lists[ci].push(pt.grp.n, id, pt.hi >= 0 ? pt.grp.gid[pt.hi] : -1, pt.lo >= 0 ? pt.grp.gid[pt.lo] : -1); this.stats.instances++; }
      cell.top = Math.max(cell.top || 0, ci === 0 ? 16 * s : 2);
    }
    // per cell, per category: entries grouped by mesh → typed arrays [mesh][inst, hi, lo, …]
    for (const c of this.cells.values()) { c.arr = c.lists.map((L) => { const by = []; for (let k = 0; k < L.length; k += 4) { (by[L[k]] ||= []).push(L[k + 1], L[k + 2], L[k + 3]); } return by.map((a) => (a ? Int32Array.from(a) : null)); }); c.lists = null; }
    this.cellList = [...this.cells.values()]; this.active = [[], []]; this.fx = 1e9; this.fz = 1e9;
    this.chunkCells = new Map();
  }
  setQuality(q) { this.R = q === 'low' ? [520, 90] : q === 'medium' ? [600, 130] : q === 'ultra' ? [760, 200] : [660, 160]; this.LOD = q === 'low' ? [80, 30] : q === 'ultra' ? [150, 60] : [110, 45]; this.fx = 1e9; }
  // the cells of one 200 m world chunk (Satellite tiles render chunks the player is nowhere near)
  chunkHandle(x0, z0, size) { const self = this; const list = this.cellList.filter((c) => c.x >= x0 && c.x < x0 + size && c.z >= z0 && c.z < z0 + size); let on = false;
    return { get visible() { return on; }, set visible(v) { on = !!v; for (const c of list) { if (on) self.forced.add(c); else self.forced.delete(c); } self.cache.clear(); } }; }
  // per frame: the cells in range of the focus (re-scanned when it has moved a few metres) and their LOD from the camera
  update(focus, camera) {
    this.frame++; this.cache.clear(); this.stats.draws = 0; const fx = focus.x, fz = focus.z;
    if (Math.hypot(fx - this.fx, fz - this.fz) > 4) { this.fx = fx; this.fz = fz; for (let ci = 0; ci < 2; ci++) { const R = this.R[ci] + CELL, A = this.active[ci]; A.length = 0;
        for (const c of this.cellList) { if (!c.arr[ci] || !c.arr[ci].length) continue; const dx = c.x - fx, dz = c.z - fz; if (dx * dx + dz * dz < R * R) A.push(c); } } }
    const cp = camera ? camera.position : focus; let n = 0;
    for (let ci = 0; ci < 2; ci++) for (const c of this.active[ci]) { const d = Math.max(0, Math.hypot(c.x - cp.x, c.z - cp.z) - CELL * 0.6); const L = this.LOD[ci];
      c.lod[ci] = c.lod[ci] ? (d < L - 8 ? 0 : 1) : (d > L + 8 ? 1 : 0); c.far[ci] = d > this.R[ci]; n++; }
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
  fill(bm, cam, shadow = false) {
    const ci = bm.castShadow ? 0 : 1; const n0 = this.meshes.indexOf(bm); const cells = this.visible(cam, ci);
    const starts = bm._multiDrawStarts, counts = bm._multiDrawCounts, ind = bm._indirectTexture.image.data, GI = bm._geometryInfo; const idx = bm.geometry.getIndex(); const bpe = idx ? idx.array.BYTES_PER_ELEMENT : 1;
    let n = 0; const forcedLo = this.forced.size > 0;
    for (const c of cells) { const a = c.arr[ci][n0]; if (!a) continue; const lo = c.lod[ci] || (forcedLo && this.forced.has(c));
      for (let k = 0; k < a.length; k += 3) { const g = lo ? a[k + 2] : a[k + 1]; if (g < 0) continue; const gi = GI[g]; starts[n] = gi.start * bpe; counts[n] = gi.count; ind[n] = a[k]; n++; } }
    bm._multiDrawCount = n; bm._multiDrawBytesPerElement = bpe; bm._indirectTexture.needsUpdate = true; bm._visibilityChanged = false;
    if (!shadow) this.stats.draws += n;
  }
}
