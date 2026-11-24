// Environment editor scenery renderer (console `paint`; the game runtime for a compiled scene): every placed and painted
// instance drawn the way the city's own vegetation is (src/world/Forest.js) — no draw call per object or per blade:
//   • ONE THREE.BatchedMesh per (asset, material slot); a thousand grass clumps of one asset = one multi-draw per pass;
//   • instances filed in 50 m cells (Forest.CELL); before each render pass (main camera, sun shadow, water mirror …) a batch
//     rebuilds its multi-draw list from the cells THAT camera sees — sphere tests per cell, plain array writes, no allocation;
//   • per-asset draw distance, near / far LOD (the far mesh is a prefix of the same index buffer: PaintAssets.addLods), far
//     ground cover thinned out smoothly per instance (stable hash: the same clumps stay), a ragged draw-distance edge (no
//     square cell borders popping), shadows only within the asset's shadow distance and never in the street-lamp shadow maps,
//     the city's occlusion culler (BatchCull.CULL.occ) skipping cells hidden behind buildings for the main camera;
//   • hidden layers are left out of the cell lists (not processed at all); assets that fail to load draw a placeholder box;
//   • solid assets get box colliders in the world's Collision (batched per frame).
import * as THREE from 'three';
import { loadModel, buildMaterial, applyMaterial, disposeMaterial, materialFromModel, PLACEHOLDER_MAT } from './PaintAssets.js';
import { CULL } from '../gfx/BatchCull.js';

export const CELL = 50;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _t = new THREE.Color();
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(), _v = new THREE.Vector3();
const QUAL = { low: 0.7, medium: 0.85, high: 1, ultra: 1.25 };
export const hash01 = (u) => (Math.imul((u >>> 0) ^ 0x9e3779b9, 2654435761) >>> 0) / 4294967296;
const ckey = (i, j) => (i + 30000) * 60001 + (j + 30000);
export function objMatrix(o, out = _m) { _p.set(o.p[0], o.p[1], o.p[2]); _q.setFromEuler(_e.set(o.r[0], o.r[1], o.r[2], 'YXZ')); _s.set(o.s[0], o.s[1], o.s[2]); return out.compose(_p, _q, _s); }

export class PaintField {
  constructor({ collision = null, quality = 'high' } = {}) {
    this.group = new THREE.Group(); this.group.name = 'paint'; this.group.matrixAutoUpdate = false;
    this.assets = new Map(); this.objs = new Map(); this.cells = new Map(); this.cellList = []; this.dirty = new Set(); this.hidden = new Set();
    this.collision = collision; this.colAdd = []; this.colDel = []; this.frame = 0; this.cache = new Map(); this.active = []; this.fx = 1e9; this.fz = 1e9; this.activeDirty = true;
    this.qs = QUAL[quality] || 1; this.camPos = new THREE.Vector3(); this.stats = { instances: 0, drawn: 0, batches: 0, cells: 0, visibleCells: 0 }; this.maxDraw = 100;
    this._pickMesh = new THREE.Mesh(); this._rc = [];
  }
  setQuality(q) { this.qs = QUAL[q] || 1; this.activeDirty = true; }
  // ---------------------------------------------------------------- assets
  // def is the project's asset object (kept by reference: render settings edited in place apply live)
  async setAsset(def) {
    let A = this.assets.get(def.id); const key = def.file.main + '|' + JSON.stringify(def.import) + '|' + def.render.lodRatio;
    if (A && A.key === key) { A.def = def; this.refreshAsset(def.id); return A; }
    if (A) this.dropBatches(A, true); else { A = { def, key, model: null, batches: [], ready: null, error: null }; this.assets.set(def.id, A); }
    A.def = def; A.key = key; const v = (A.v = (A.v || 0) + 1);
    A.ready = loadModel(def).then((model) => { if (A.v !== v || !this.assets.has(def.id)) return A; A.model = model; A.error = model.error; this.buildBatches(A); return A; });
    return A.ready;
  }
  buildBatches(A) {
    const M = A.model, def = A.def, self = this; const objs = []; for (const o of this.objs.values()) if (o.a === def.id) objs.push(o);
    const cap = Math.max(64, Math.ceil(objs.length * 1.25) + 32);
    A.batches = M.parts.map((part, bi) => {
      const cfg = def.materials[part.slot] || materialFromModel(M.slots[part.slot] && M.slots[part.slot].src, part.name);
      const mat = M.placeholder ? PLACEHOLDER_MAT : buildMaterial(cfg, M.slots[part.slot] && M.slots[part.slot].src, M, { wind: def.render.wind });
      const bm = new THREE.BatchedMesh(cap, part.geo.attributes.position.count, part.geo.index.count, mat); const gid = bm.addGeometry(part.geo);
      bm.name = 'paint:' + def.id + ':' + bi; bm.frustumCulled = false; bm.perObjectFrustumCulled = false; bm.sortObjects = false; bm.castShadow = !!def.render.shadow; bm.receiveShadow = true; bm.matrixAutoUpdate = false;
      bm.userData.paint = { A, bi, part, gid };
      bm.onBeforeRender = function (r, sc, cam) { self.fill(this, cam, cam === CULL.camera ? 'main' : 'other'); };
      bm.onBeforeShadow = function (r, ob, cam, shadowCam) { self.fill(this, shadowCam, 'shadow'); };
      this.group.add(bm); return { bm, part, mat, gid };
    });
    for (const o of objs) { o._ids = null; this.instantiate(o, A); this.syncCollider(o); this.markCell(o); }
    this.updateMaxDraw(); this.stats.batches = this.group.children.length;
  }
  dropBatches(A, keepObjs) {
    for (const b of A.batches) { this.group.remove(b.bm); b.bm.dispose(); if (b.mat !== PLACEHOLDER_MAT) disposeMaterial(b.mat); } A.batches = [];
    if (keepObjs) for (const o of this.objs.values()) if (o.a === A.def.id) { o._ids = null; this.syncCollider(o); this.markCell(o); }
    this.stats.batches = this.group.children.length;
  }
  removeAsset(id) { const A = this.assets.get(id); if (!A) return; for (const o of [...this.objs.values()]) if (o.a === id) this.remove(o); this.dropBatches(A, false); A.v++; this.assets.delete(id); this.updateMaxDraw(); }
  // render settings / materials changed (no reload): shadows, wind, materials, colliders
  refreshAsset(id, slot = null) {
    const A = this.assets.get(id); if (!A || !A.model) return; const def = A.def, M = A.model;
    for (const b of A.batches) { b.bm.castShadow = !!def.render.shadow; if (b.mat === PLACEHOLDER_MAT || (slot != null && b.part.slot !== slot)) continue;
      const cfg = def.materials[b.part.slot] || materialFromModel(M.slots[b.part.slot] && M.slots[b.part.slot].src, b.part.name); applyMaterial(b.mat, cfg, M.slots[b.part.slot] && M.slots[b.part.slot].src, M, { wind: def.render.wind }); }
    if (slot == null) for (const o of this.objs.values()) if (o.a === id) this.syncCollider(o);
    this.updateMaxDraw();
  }
  updateMaxDraw() { let m = 50; for (const A of this.assets.values()) m = Math.max(m, A.def.render.draw); if (m !== this.maxDraw) { this.maxDraw = m; this.activeDirty = true; } }
  // ---------------------------------------------------------------- instances
  instantiate(o, A) {
    if (!A || !A.batches.length) return; objMatrix(o); this.colorOf(o, _c); const ids = new Int32Array(A.batches.length);
    A.batches.forEach((b, i) => { const bm = b.bm; if (bm.instanceCount >= bm.maxInstanceCount) bm.setInstanceCount(Math.ceil(bm.maxInstanceCount * 1.5) + 64); const id = bm.addInstance(b.gid); bm.setMatrixAt(id, _m); bm.setColorAt(id, _c); ids[i] = id; });
    o._ids = ids; o._aid = A.def.id;
  }
  colorOf(o, out) { if (o.t) out.set(o.t); else out.setRGB(1, 1, 1); const c = o.c || 0; const k = 1 + 0.14 * c; out.r *= k * (1 + 0.05 * c); out.g *= k; out.b *= k * (1 - 0.06 * c); return out; }
  add(o) {
    if (this.objs.has(o.u)) this.remove(this.objs.get(o.u)); this.objs.set(o.u, o); o._ids = null; o._cell = null; o._col = null;
    const A = this.assets.get(o.a); if (A && A.batches.length) this.instantiate(o, A); this.fileCell(o); this.syncCollider(o); this.stats.instances = this.objs.size;
  }
  addMany(list) { // capacity grown once per batch, then plain adds
    const per = new Map(); for (const o of list) per.set(o.a, (per.get(o.a) || 0) + 1);
    for (const [id, n] of per) { const A = this.assets.get(id); if (!A) continue; for (const b of A.batches) { const need = b.bm.instanceCount + n; if (need > b.bm.maxInstanceCount) b.bm.setInstanceCount(Math.ceil(need * 1.25) + 64); } }
    for (const o of list) this.add(o);
  }
  // transform / tint / layer / asset changed (one instance)
  updateObj(o) {
    const A = this.assets.get(o.a); if (o._ids && (!A || o._ids.length !== A.batches.length || o._aid !== o.a)) { this.freeIds(o); }
    if (!o._ids && A && A.batches.length) this.instantiate(o, A);
    else if (o._ids) { objMatrix(o); this.colorOf(o, _c); A.batches.forEach((b, i) => { b.bm.setMatrixAt(o._ids[i], _m); b.bm.setColorAt(o._ids[i], _c); }); }
    o._aid = o.a; const k = this.cellKey(o); if (o._cell && o._cell.key !== k) { o._cell.objs.delete(o); this.dirty.add(o._cell); o._cell = null; } if (!o._cell) this.fileCell(o); else this.dirty.add(o._cell);
    this.syncCollider(o);
  }
  remove(o) {
    const cur = this.objs.get(o.u); if (cur !== o) return; this.freeIds(o); if (o._cell) { o._cell.objs.delete(o); this.dirty.add(o._cell); o._cell = null; }
    if (o._col) { o._col._live = false; this.colDel.push(o._col); o._col = null; } this.objs.delete(o.u); this.stats.instances = this.objs.size;
  }
  freeIds(o) { if (!o._ids) return; const A = this.assets.get(o._aid || o.a); if (A && A.batches.length === o._ids.length) A.batches.forEach((b, i) => { try { b.bm.deleteInstance(o._ids[i]); } catch { /* already gone */ } }); o._ids = null; }
  clear() { for (const o of [...this.objs.values()]) this.remove(o); }
  // ---------------------------------------------------------------- layers
  setLayerHidden(id, hidden) { if (hidden === this.hidden.has(id)) return; if (hidden) this.hidden.add(id); else this.hidden.delete(id); for (const o of this.objs.values()) if (o.l === id) { this.syncCollider(o); if (o._cell) this.dirty.add(o._cell); } }
  // ---------------------------------------------------------------- cells
  cellKey(o) { return ckey(Math.floor(o.p[0] / CELL), Math.floor(o.p[2] / CELL)); }
  fileCell(o) { const i = Math.floor(o.p[0] / CELL), j = Math.floor(o.p[2] / CELL), k = ckey(i, j); let c = this.cells.get(k);
    if (!c) { c = { key: k, i, j, x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, objs: new Set(), by: new Map(), bot: 0, top: 1 }; this.cells.set(k, c); this.cellList.push(c); this.activeDirty = true; }
    c.objs.add(o); o._cell = c; this.dirty.add(c); }
  markCell(o) { if (o._cell) this.dirty.add(o._cell); }
  rebuildCell(c) {
    const groups = new Map(); let bot = Infinity, top = -Infinity;
    for (const o of c.objs) { if (this.hidden.has(o.l) || !o._ids) continue; const A = this.assets.get(o.a); if (!A || !A.model) continue; let g = groups.get(A); if (!g) groups.set(A, (g = [])); g.push(o);
      const sy = Math.abs(o.s[1]), r = A.model.radius * Math.max(Math.abs(o.s[0]), sy, Math.abs(o.s[2])); bot = Math.min(bot, o.p[1] - r); top = Math.max(top, o.p[1] + r); }
    c.by.clear();
    for (const [A, L] of groups) { // stable random order (hash of the uid): thinning keeps the same clumps at every distance
      L.sort((a, b) => hash01(a.u) - hash01(b.u)); const nb = A.batches.length; const ids = []; for (let i = 0; i < nb; i++) ids.push(new Int32Array(L.length)); const xzh = new Float32Array(L.length * 3);
      L.forEach((o, k) => { for (let i = 0; i < nb; i++) ids[i][k] = o._ids[i]; xzh[k * 3] = o.p[0]; xzh[k * 3 + 1] = o.p[2]; xzh[k * 3 + 2] = hash01(o.u); });
      c.by.set(A, { n: L.length, ids, xzh }); }
    c.bot = Number.isFinite(bot) ? bot : 0; c.top = Number.isFinite(top) ? top : 1;
    if (!c.objs.size) { this.cells.delete(c.key); const i = this.cellList.indexOf(c); if (i >= 0) this.cellList.splice(i, 1); this.activeDirty = true; }
  }
  flushColliders() { const C = this.collision; if (!C) { this.colAdd.length = 0; this.colDel.length = 0; return; } if (this.colDel.length) { C.removeList(this.colDel); this.colDel.length = 0; } if (this.colAdd.length) { for (const c of this.colAdd) if (c._live) C.add(c); this.colAdd.length = 0; } }
  syncCollider(o) {
    const A = this.assets.get(o.a); const want = !!(A && A.model && !A.model.placeholder && A.def.render.solid && !this.hidden.has(o.l) && this.objs.get(o.u) === o);
    if (o._col) { o._col._live = false; this.colDel.push(o._col); o._col = null; } if (!want) return;
    const b = A.model.box, k = A.def.render.colScale || 1; const hx = Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) * Math.abs(o.s[0]) * k, hz = Math.max(Math.abs(b.min.z), Math.abs(b.max.z)) * Math.abs(o.s[2]) * k;
    const cy = Math.abs(Math.cos(o.r[1])), sy = Math.abs(Math.sin(o.r[1])); const ex = hx * cy + hz * sy, ez = hx * sy + hz * cy; if (ex < 0.05 || ez < 0.05) return;
    const c = { x0: o.p[0] - ex, x1: o.p[0] + ex, z0: o.p[2] - ez, z1: o.p[2] + ez, y0: o.p[1] + b.min.y * o.s[1], h: o.p[1] + b.max.y * o.s[1], kind: 'prop', paint: o.u, _live: true };
    o._col = c; this.colAdd.push(c);
  }
  // ---------------------------------------------------------------- per frame
  update(focus, camera) {
    this.frame++; this.cache.clear(); if (this.dirty.size) { for (const c of this.dirty) this.rebuildCell(c); this.dirty.clear(); }
    if (this.colAdd.length || this.colDel.length) this.flushColliders();
    const fx = focus.x, fz = focus.z;
    if (this.activeDirty || Math.hypot(fx - this.fx, fz - this.fz) > 4) { this.activeDirty = false; this.fx = fx; this.fz = fz; const R = this.maxDraw * this.qs + CELL; const A = this.active; A.length = 0;
      for (const c of this.cellList) { const dx = c.x - fx, dz = c.z - fz; if (dx * dx + dz * dz < R * R) A.push(c); } }
    if (camera) this.camPos.copy(camera.position); this.stats.cells = this.active.length; this.stats.drawn = this._drawn || 0; this._drawn = 0; // (last frame's main-pass instances)
  }
  visible(cam, pass) {
    const key = cam.id * 3 + (pass === 'main' ? 0 : pass === 'shadow' ? 1 : 2); let v = this.cache.get(key); if (v) return v; v = []; this.cache.set(key, v);
    cam.updateMatrixWorld(); _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm, cam.coordinateSystem, cam.reversedDepth);
    const occ = pass === 'main' && CULL.occOn ? CULL.occ : null;
    for (const c of this.active) { const h = (c.top - c.bot) / 2; _sph.center.set(c.x, (c.top + c.bot) / 2, c.z); _sph.radius = CELL * 0.71 + h; if (!_fr.intersectsSphere(_sph)) continue;
      if (occ && occ.boxHidden(c.x - CELL / 2, c.x + CELL / 2, c.z - CELL / 2, c.z + CELL / 2, c.top)) continue; v.push(c); }
    if (pass === 'main') this.stats.visibleCells = v.length; return v;
  }
  fill(bm, cam, pass) {
    const U = bm.userData.paint, A = U.A, R = A.def.render, bi = U.bi; const shadow = pass === 'shadow';
    if (shadow && (!R.shadow || cam.userData.noFoliage)) { bm._multiDrawCount = 0; return; }
    const qs = this.qs, D = R.draw * qs, L = Math.min(R.lod * qs, D), lim = shadow ? Math.min(D, R.shadowDist * qs) : D; const thin = R.thin && !shadow; const t0 = lim * 0.4, tR = lim - t0;
    const E = shadow ? this.camPos : cam.position, ex = E.x, ez = E.z; const cells = this.visible(cam, pass);
    const starts = bm._multiDrawStarts, counts = bm._multiDrawCounts, ind = bm._indirectTexture.image.data, gi = bm._geometryInfo[U.gid]; const idx = bm.geometry.getIndex(); const bpe = idx ? idx.array.BYTES_PER_ELEMENT : 1;
    const loS = (gi.start + U.part.lo[0]) * bpe, loC = U.part.lo[1], hiS = (gi.start + U.part.hi[0]) * bpe, hiC = U.part.hi[1]; const L2 = L * L; let n = 0; const cap = starts.length;
    for (const c of cells) {
      const e = c.by.get(A); if (!e) continue; const dc = Math.hypot(c.x - ex, c.z - ez), dmin = Math.max(0, dc - CELL * 0.71), dmax = dc + CELL * 0.71; if (dmin > lim) continue;
      const ids = e.ids[bi], xzh = e.xzh, m = e.n; if (n + m > cap) break;
      if (!thin && dmax < lim * 0.85 && (shadow || dmax < L || dmin > L)) { const lo = shadow || dmin > L; const S = lo ? loS : hiS, C = lo ? loC : hiC; for (let k = 0; k < m; k++) { starts[n] = S; counts[n] = C; ind[n] = ids[k]; n++; } continue; }
      for (let k = 0, q = 0; k < m; k++, q += 3) { const dx = xzh[q] - ex, dz = xzh[q + 1] - ez, d2 = dx * dx + dz * dz, h = xzh[q + 2]; const lm = lim * (0.85 + 0.15 * h); if (d2 > lm * lm) continue;
        if (thin) { const d = Math.sqrt(d2); if (d > t0 && h > 1 - 0.85 * Math.min(1, (d - t0) / tR)) continue; }
        const lo = shadow || d2 > L2; starts[n] = lo ? loS : hiS; counts[n] = lo ? loC : hiC; ind[n] = ids[k]; n++; }
    }
    bm._multiDrawCount = n; bm._multiDrawBytesPerElement = bpe; bm._indirectTexture.needsUpdate = true; bm._visibilityChanged = false; if (pass === 'main') this._drawn = (this._drawn || 0) + n;
  }
  // ---------------------------------------------------------------- queries (editor)
  // objects within r of (x, z) (2D), optional filter
  queryCircle(x, z, r, fn) {
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL); const r2 = r * r;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = this.cells.get(ckey(i, j)); if (!c) continue; for (const o of c.objs) { const dx = o.p[0] - x, dz = o.p[2] - z; if (dx * dx + dz * dz <= r2) fn(o); } }
  }
  // nearest object under a ray (bounding spheres, then the real triangles of the closest candidates)
  pick(raycaster, accept = null, maxDist = 2000) {
    const ray = raycaster.ray; const cand = this._rc; cand.length = 0;
    for (const c of this.cellList) { const h = (c.top - c.bot) / 2; _sph.center.set(c.x, (c.top + c.bot) / 2, c.z); _sph.radius = CELL * 0.71 + h; if (!ray.intersectsSphere(_sph)) continue;
      for (const o of c.objs) { if (this.hidden.has(o.l) || (accept && !accept(o))) continue; const A = this.assets.get(o.a); if (!A || !A.model) continue;
        const s = Math.max(Math.abs(o.s[0]), Math.abs(o.s[1]), Math.abs(o.s[2])); _sph.center.set(o.p[0], o.p[1] + A.model.height * 0.5 * o.s[1], o.p[2]); _sph.radius = A.model.radius * s;
        if (!ray.intersectsSphere(_sph)) continue; const d = ray.origin.distanceTo(_sph.center); if (d - _sph.radius > maxDist) continue; cand.push([d - _sph.radius, o]); } }
    cand.sort((a, b) => a[0] - b[0]); let best = null; const hits = []; const pm = this._pickMesh;
    for (let k = 0; k < Math.min(cand.length, 24); k++) { const o = cand[k][1]; if (best && cand[k][0] > best.distance) break; const A = this.assets.get(o.a); objMatrix(o, pm.matrixWorld);
      for (const part of A.model.parts) { pm.geometry = part.geo; pm.material = PLACEHOLDER_MAT; const dr = part.geo.drawRange; dr.start = part.hi[0]; dr.count = part.hi[1]; hits.length = 0; try { pm.raycast(raycaster, hits); } catch { /* degenerate */ } dr.start = 0; dr.count = Infinity;
        for (const h of hits) if (!best || h.distance < best.distance) best = { o, distance: h.distance, point: h.point.clone() }; } }
    return best;
  }
  // world-space bounding box of an object (selection outlines, focus)
  boxOf(o, out = new THREE.Box3()) { const A = this.assets.get(o.a); const b = A && A.model ? A.model.box : null; if (!b) return out.setFromCenterAndSize(_v.set(o.p[0], o.p[1] + 0.5, o.p[2]), _s.set(1, 1, 1)); out.copy(b).applyMatrix4(objMatrix(o)); return out; }
  dispose() { for (const A of this.assets.values()) { this.dropBatches(A, false); A.v = (A.v || 0) + 1; } this.assets.clear(); for (const o of this.objs.values()) if (o._col) { o._col._live = false; this.colDel.push(o._col); } this.flushColliders(); this.objs.clear(); this.cells.clear(); this.cellList.length = 0; if (this.group.parent) this.group.parent.remove(this.group); }
}
void _t;
