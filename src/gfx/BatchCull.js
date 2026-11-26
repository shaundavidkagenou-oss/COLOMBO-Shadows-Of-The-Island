// 65th request — per-instance culling, level of detail and occlusion for the city's batched meshes, and the occlusion hide of
// ordinary objects (people, vehicles, landmarks), for the main camera only.
//
// BATCHED MESHES (building detail + window joinery per building, ground detail per 32 m cell, street dressing per 50 m cell):
// three.js frustum-culls each instance of a THREE.BatchedMesh in its onBeforeRender / onBeforeShadow hooks and writes the list
// of index ranges the one multi-draw call will draw. installCull() replaces those two hooks on a batch with cullDraw(), which
// does the same job from a flat array of world-space bounding spheres and additionally, per instance:
//   · OCCLUSION (main camera colour pass only, never shadow maps): skips an instance whose building (or ground cell) the
//     OcclusionCuller found hidden behind other buildings;
//   · LOD (building detail): every building's detail triangles are ordered coarse-first when it is batched (RangeBatch:
//     balconies, cornices, ledges, parapets, roof tanks — every triangle ≥ LOD.fineEdge across and not thinner than LOD.thin)
//     and fine-last (AC units, pipes, grilles, railing bars, shutters, window trim, door handles…). Near the camera the whole
//     range is drawn; past LOD.detailFull only the coarse prefix; past the chunk's detail radius nothing (the block shell
//     with its painted facade remains). Same vertices, same draw call — only the index count of the range changes;
//   · DRAW DISTANCE: window joinery past LOD.winMax, tiny ground details (drain-grate bars) past LOD.tiny are skipped.
// Shadow passes use the same LOD from the player's camera (near sun map: full detail within LOD.detailFullShadow; the far
// static-shadow map: coarse only) and never occlusion.
//
// ORDINARY OBJECTS (people, vehicles, trains, landmarks, street name boards…): hidden from the main camera by moving them to
// HIDE_LAYER for the duration of the frame's render only (beginHide / endHide around it); every shadow camera and the water
// mirror camera also see HIDE_LAYER, so their shadows and reflections are untouched, and game code never sees a change.
import * as THREE from 'three';
import { beginIndirect, commitIndirect } from './IndirectCache.js';

export const HIDE_LAYER = 30;
export const CSLOTS = 9; // occlusion cells per batched instance (3 × 3)
export const LOD = {
  enabled: true,
  detailFull: 90,        // building detail: full within this distance of the camera (m), coarse beyond
  detailFullShadow: 52,  // near sun shadow map: full detail within this distance of the camera (its crisp reach ≈ 50 m)
  fineEdge: 1.0,         // triangle classed fine when its longest edge is shorter than this (m)…
  thin: 0.06,            // …or when it is thinner than this (m)
  winMax: 100,           // window joinery drawn within this distance (m) — buildings are low-poly blocks beyond 50–100 m
  tiny: 55,              // tiny ground detail (drain-grate bars, road studs) drawn within this distance (m)
  small: 110,            // small street furniture (litter bins, manhole covers, drain sumps, sign-post bands) within this distance
};
// quality presets (Settings → World.setQuality); the block switch stays inside the requested 50–100 m on every preset
export const LOD_PRESETS = {
  low: { detailFull: 60, detailFullShadow: 52, winMax: 0 /* no joinery is built on low (World.windowRadius 0) */, tiny: 35, small: 70 },
  medium: { detailFull: 75, detailFullShadow: 52, winMax: 85, tiny: 45, small: 90 },
  high: { detailFull: 90, detailFullShadow: 52, winMax: 100, tiny: 55, small: 110 },
  ultra: { detailFull: 100, detailFullShadow: 62, winMax: 100, tiny: 80, small: 160 },
};
export function setLodQuality(q) { Object.assign(LOD, LOD_PRESETS[q] || LOD_PRESETS.high); }
export const CULL = { occ: null, camera: null, farCamera: null, sunCamera: null, propNear: true, occOn: false, eye: new THREE.Vector3(), stats: { drawn: 0, occluded: 0, lodCoarse: 0, distCut: 0 } };
const BATCHES = new Set();
export function liveBatches() { return BATCHES; }

// classify triangle t of (pos, idx) as fine (small or thin)
function fineTri(P, a, b, c) {
  const e1 = Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]), e2 = Math.hypot(P[b] - P[c], P[b + 1] - P[c + 1], P[b + 2] - P[c + 2]), e3 = Math.hypot(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]);
  const mx = Math.max(e1, e2, e3); if (mx < LOD.fineEdge) return true;
  const s = (e1 + e2 + e3) / 2; const area = Math.sqrt(Math.max(0, s * (s - e1) * (s - e2) * (s - e3))); return 2 * area / mx < LOD.thin;
}
// reorder the triangles of a local index array coarse-first (stable); returns the coarse index count
export function coarseFirst(ix, P) {
  const n = ix.length; const out = new ix.constructor(n); let w = 0; const fine = [];
  for (let t = 0; t < n; t += 3) { const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3; if (fineTri(P, a, b, c)) fine.push(t); else { out[w++] = ix[t]; out[w++] = ix[t + 1]; out[w++] = ix[t + 2]; } }
  const coarse = w; for (const t of fine) { out[w++] = ix[t]; out[w++] = ix[t + 1]; out[w++] = ix[t + 2]; } ix.set(out); return coarse;
}

// spec: { kind: 'detail' | 'win' | 'cell' | 'tiny', bid?: Int32Array (instance → building id), cells?: Int32Array (instance → CSLOTS cell
//         indices, −1 = unused), cellKind?: 'ground' | 'prop', coarse?: number[] (geometry → coarse index count),
//         grp?: Int32Array (instance-run boundaries [0, …, n]: runs tested as a whole first) }
export function installCull(B, spec) {
  B.userData.cull = spec; spec.sph = null; B.onBeforeRender = cullRender; B.onBeforeShadow = cullShadow; BATCHES.add(B);
  const dispose = B.dispose.bind(B); B.dispose = () => { BATCHES.delete(B); return dispose(); };
  return B;
}
export function uninstallCull(B) { BATCHES.delete(B); }
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4(), _s = new THREE.Sphere(), _f = new THREE.Frustum(), _fwd = new THREE.Vector3();
function spheres(B, S) {
  const II = B._instanceInfo, n = II.length; const sph = new Float32Array(n * 4); B.updateMatrixWorld(); const mw = B.matrixWorld;
  for (let i = 0; i < n; i++) { const inf = II[i]; if (!inf || !inf.active) { sph[i * 4 + 3] = -1; continue; } B.getBoundingSphereAt(inf.geometryIndex, _s); B.getMatrixAt(i, _mi); _s.applyMatrix4(_mi).applyMatrix4(mw); sph.set([_s.center.x, _s.center.y, _s.center.z, _s.radius], i * 4); }
  S.sph = sph; S.sphN = n;
  // groups (contiguous instance runs, e.g. one chunk's pieces): a bounding sphere each, tested before their instances
  const G = S.grp; if (G) { const ng = G.length - 1; const gs = new Float32Array(ng * 4); const bx = new THREE.Box3(), sp = new THREE.Sphere(), v = new THREE.Vector3();
    for (let g = 0; g < ng; g++) { bx.makeEmpty(); for (let i = G[g]; i < G[g + 1]; i++) { const r = sph[i * 4 + 3]; if (r < 0) continue; v.set(sph[i * 4], sph[i * 4 + 1], sph[i * 4 + 2]); bx.expandByPoint(v); } 
      if (bx.isEmpty()) { gs[g * 4 + 3] = -1; continue; } bx.getCenter(sp.center); let R = 0; for (let i = G[g]; i < G[g + 1]; i++) { const r = sph[i * 4 + 3]; if (r < 0) continue; R = Math.max(R, Math.hypot(sph[i * 4] - sp.center.x, sph[i * 4 + 1] - sp.center.y, sph[i * 4 + 2] - sp.center.z) + r); }
      gs.set([sp.center.x, sp.center.y, sp.center.z, R], g * 4); }
    S.gsph = gs; }
}
function cullRender(renderer, scene, camera, geometry, material) { cullDraw(this, camera, geometry, material, camera === CULL.camera ? 'main' : 'other'); }
function cullShadow(renderer, object, camera, shadowCamera, geometry, depthMaterial) { cullDraw(this, shadowCamera, geometry, depthMaterial, shadowCamera === CULL.farCamera ? 'far' : 'shadow'); }
let _S = new Float64Array(1024), _C = new Float64Array(1024), _Z = new Float64Array(1024), _I = new Int32Array(1024); const _ord = []; const _byZ = (a, b) => _Z[a] - _Z[b];
function grow(n) { if (_S.length >= n) return; const m = Math.max(n, _S.length * 2); _S = new Float64Array(m); _C = new Float64Array(m); _Z = new Float64Array(m); _I = new Int32Array(m); }
function cullDraw(B, camera, geometry, material, pass) {
  const S = B.userData.cull, II = B._instanceInfo, GI = B._geometryInfo;
  if (!S.sph || S.sphN !== II.length) spheres(B, S);
  const sph = S.sph, starts = B._multiDrawStarts, counts = B._multiDrawCounts, ind = beginIndirect(B); /* 98th: this camera's list → its own indirect texture (IndirectCache.js) */
  const index = geometry.getIndex(); const bpe = index === null ? 1 : index.array.BYTES_PER_ELEMENT;
  _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _f.setFromProjectionMatrix(_m, camera.coordinateSystem, camera.reversedDepth); const pl = _f.planes;
  const shadow = pass === 'shadow' || pass === 'far'; const E = shadow ? CULL.eye : camera.position; const ex = E.x, ey = E.y, ez = E.z;
  const lod = LOD.enabled; const kind = S.kind;
  const occ = pass === 'main' && CULL.occOn ? CULL.occ : null; const hB = occ ? occ.hiddenB : null, hC = occ ? (S.cellKind === 'prop' ? occ.hiddenProp : occ.hiddenCell) : null;
  const fullR = pass === 'far' ? -1 : shadow ? LOD.detailFullShadow : LOD.detailFull; const maxD = kind === 'win' && !shadow ? LOD.winMax : kind === 'tiny' ? LOD.tiny : kind === 'small' ? LOD.small : Infinity;
  let sort = pass === 'main' || pass === 'other'; const back = material.transparent; if (sort) camera.getWorldDirection(_fwd); // three's order: opaque front-to-back, transparent back-to-front
  const st = CULL.stats; let k = 0, q = 0; if (sort) grow(II.length);
  const G = S.grp, gs = S.gsph, ng = G ? G.length - 1 : 1; let gOrd = null;
  if (G && sort) { // grouped batches are ordered by group (the chunk granularity three.js sorted at before), not per piece
    gOrd = S.gOrd || (S.gOrd = []); gOrd.length = 0; const gz = S.gz || (S.gz = new Float64Array(ng)); const sg = back ? -1 : 1;
    for (let g = 0; g < ng; g++) { gz[g] = ((gs[g * 4] - ex) * _fwd.x + (gs[g * 4 + 1] - ey) * _fwd.y + (gs[g * 4 + 2] - ez) * _fwd.z) * sg; gOrd.push(g); }
    gOrd.sort(S.gCmp || (S.gCmp = (a, b) => gz[a] - gz[b])); sort = false; }
  for (let gg = 0; gg < ng; gg++) { const g = gOrd ? gOrd[gg] : gg; let i0 = 0, i1 = II.length, inside = false;
   if (G) { i0 = G[g]; i1 = G[g + 1]; const o = g * 4, cx = gs[o], cy = gs[o + 1], cz = gs[o + 2], r = gs[o + 3]; if (r < 0) continue;
     let out = false, all = true; for (let p = 0; p < 6; p++) { const P = pl[p]; const d = P.normal.x * cx + P.normal.y * cy + P.normal.z * cz + P.constant; if (d < -r) { out = true; break; } if (d < r) all = false; } if (out) continue;
     inside = all; /* 98th: the group's sphere wholly inside the frustum holds every instance sphere of the group (it bounds them): none can fail the plane test */
     if (lod && maxD < Infinity && Math.hypot(cx - ex, cy - ey, cz - ez) - r > maxD) { st.distCut += i1 - i0; continue; } }
  for (let i = i0; i < i1; i++) {
    const inf = II[i]; if (!inf.active || !inf.visible) continue;
    const o = i * 4, cx = sph[o], cy = sph[o + 1], cz = sph[o + 2], r = sph[o + 3]; if (r < 0) continue;
    if (!inside) { let out = false; for (let p = 0; p < 6; p++) { const P = pl[p]; if (P.normal.x * cx + P.normal.y * cy + P.normal.z * cz + P.constant < -r) { out = true; break; } } if (out) continue; }
    const dx = cx - ex, dy = cy - ey, dz = cz - ez; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
    if (lod && d > maxD) { st.distCut++; continue; }
    if (occ) { const id = S.bid ? S.bid[i] : -1; if (id >= 0) { if (hB[id] === 1) { st.occluded++; continue; } } else if (S.cells) { const cq = i * CSLOTS; const c0 = S.cells[cq]; if (c0 >= 0 && hC[c0] === 1) { let all = true; for (let j = 1; j < CSLOTS; j++) { const c = S.cells[cq + j]; if (c < 0) break; if (hC[c] !== 1) { all = false; break; } } if (all) { st.occluded++; continue; } } } }
    const gi = GI[inf.geometryIndex]; let cnt = gi.count;
    if (lod && S.coarse && d > fullR) { const c = S.coarse[inf.geometryIndex]; if (c !== undefined && c < cnt) { cnt = c; st.lodCoarse++; } if (cnt === 0) continue; }
    if (sort) { _S[q] = gi.start; _C[q] = cnt; _Z[q] = (dx * _fwd.x + dy * _fwd.y + dz * _fwd.z) * (back ? -1 : 1); _I[q] = i; q++; }
    else { starts[k] = gi.start * bpe; counts[k] = cnt; ind[k] = i; k++; }
  } }
  if (sort && q) { _ord.length = q; for (let j = 0; j < q; j++) _ord[j] = j; if (q > 1) _ord.sort(_byZ); for (let j = 0; j < q; j++) { const u = _ord[j]; starts[k] = _S[u] * bpe; counts[k] = _C[u]; ind[k] = _I[u]; k++; } }
  st.drawn += k; commitIndirect(B, camera, k); B._multiDrawCount = k; B._visibilityChanged = false;
}

// ---------------------------------------------------------------- ordinary objects: hidden from the main camera for one frame
const HIDDEN = []; const MASK = 1 << HIDE_LAYER;
function hideTree(o) { o.traverse((m) => { if ((m.isMesh || m.isPoints || m.isLine || m.isSprite) && (m.layers.mask & 1)) { HIDDEN.push(m, m.layers.mask); m.layers.mask = (m.layers.mask & ~1) | MASK; } }); }
// objects: [{ obj, box: [x0, x1, z0, z1, top] }] tested against the horizon (caller has checked CULL.occOn)
export function beginHide(list, count = list.length) { const occ = CULL.occ; let n = 0; if (!CULL.occOn || !occ) return 0; for (let i = 0; i < count; i++) { const it = list[i]; const o = it.obj; if (!o || !o.visible) continue; const b = it.box; if (occ.boxHidden(b[0], b[1], b[2], b[3], b[4])) { hideTree(o); n++; } } return n; }
export function hideObject(o) { hideTree(o); }
export function endHide() { for (let i = HIDDEN.length - 2; i >= 0; i -= 2) HIDDEN[i].layers.mask = HIDDEN[i + 1]; HIDDEN.length = 0; }
// cameras that must still see hidden objects (shadow cameras of every light, the water mirror)
export function seeHidden(cam) { if (cam && cam.layers) cam.layers.enable(HIDE_LAYER); }
