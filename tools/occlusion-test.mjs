// 65th request — occlusion culling, LOD / draw distance and the sky-light bake, checked in Node on the real city plan:
//  1. conservative: everything the OcclusionCuller reports hidden really is hidden — exact segment tests from several eye
//     positions inside the validity sphere to points all over the target box, against the real (unshrunk) building boxes
//  2. time-sliced build = one-shot build (identical hidden sets), and the swap keeps the previous result in use meanwhile
//  3. a building the camera is inside never hides anything (rooms, shops)
//  4. BatchCull on real THREE.BatchedMesh objects: frustum, occlusion only in the main pass (never shadows), coarse-prefix LOD,
//     draw-distance kinds; coarseFirst keeps every triangle exactly once
//  5. SkyBake: an open seafront wall sees more sky than the foot of a lane wall; roofs / AO decals / glass untouched
import './node-dom-stub.mjs';
import * as THREE from 'three';
await import('../src/gfx/Materials.js');
const CP = await import('../src/world/CityPlan.js'); CP.generatePlan();
const L = await import('../src/world/Layout.js');
const { OcclusionCuller, OCC_CFG, OCC_STATS } = await import('../src/gfx/Occlusion.js');
const BC = await import('../src/gfx/BatchCull.js');
const { SkyBake } = await import('../src/gfx/BakeLight.js');
const { MultiBuilder } = await import('../src/gfx/MeshBuilder.js');
const { buildBase } = await import('../src/world/BuildingGen.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok  ' + m); } else { fail++; console.log('FAIL ' + m); } };
const B = CP.plan.buildings, GY = L.LAND_Y;
const oc = new OcclusionCuller(); oc.bake(B, GY, L.BOUNDS);
ok(oc.nO > B.length && oc.nC > 1000, `bake: ${oc.nO} occluder pieces from ${B.length} buildings, ${oc.nC} ground cells`);

// ---------------------------------------------------------------- exact visibility (ground truth)
const boxes = []; for (const b of B) { if (!(b.h > 0)) continue; boxes.push([b.x0, b.x1, b.z0, b.z1, GY + b.h, b.id]); if (b.tower && b.totalH > b.h) { const t = b.tower.inset || 0; boxes.push([b.x0 + t, b.x1 - t, b.z0 + t, b.z1 - t, GY + b.totalH, b.id]); } }
const GC = 16, gx0 = L.BOUNDS.minX - 50, gz0 = L.BOUNDS.minZ - 50, gnx = Math.ceil((L.BOUNDS.maxX - gx0 + 50) / GC), gnz = Math.ceil((L.BOUNDS.maxZ - gz0 + 50) / GC); const grid = Array.from({ length: gnx * gnz }, () => []);
boxes.forEach((b, i) => { for (let k = Math.floor((b[2] - gz0) / GC); k <= Math.floor((b[3] - gz0) / GC); k++) for (let j = Math.floor((b[0] - gx0) / GC); j <= Math.floor((b[1] - gx0) / GC); j++) if (j >= 0 && k >= 0 && j < gnx && k < gnz) grid[k * gnx + j].push(i); });
const stamp = new Int32Array(boxes.length); let sid = 0;
// does segment e→p hit a solid box (other than building `skip`)?
function blocked(ex, ey, ez, px, py, pz, skip) {
  sid++; const dx = px - ex, dy = py - ey, dz = pz - ez; const len = Math.hypot(dx, dz); const n = Math.max(1, Math.ceil(len / (GC * 0.5)));
  for (let s = 0; s <= n; s++) { const t = s / n; const cx = Math.floor((ex + dx * t - gx0) / GC), cz = Math.floor((ez + dz * t - gz0) / GC);
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) { const j = cx + a, k = cz + c; if (j < 0 || k < 0 || j >= gnx || k >= gnz) continue;
      for (const i of grid[k * gnx + j]) { if (stamp[i] === sid) continue; stamp[i] = sid; const b = boxes[i]; if (b[5] === skip) continue;
        // slab test on [0, 1]
        let t0 = 0, t1 = 1; const lo = [b[0], GY - 1, b[2]], hi = [b[1], b[4], b[3]], o = [ex, ey, ez], d = [dx, dy, dz]; let miss = false;
        for (let q = 0; q < 3; q++) { if (Math.abs(d[q]) < 1e-12) { if (o[q] < lo[q] || o[q] > hi[q]) { miss = true; break; } continue; } let u = (lo[q] - o[q]) / d[q], v = (hi[q] - o[q]) / d[q]; if (u > v) { const w = u; u = v; v = w; } if (u > t0) t0 = u; if (v < t1) t1 = v; if (t0 > t1) { miss = true; break; } }
        if (!miss && t1 > t0 + 1e-6) return true; } } }
  return false;
}
const tgtOf = (id) => { const o = id * 6; return [oc.tgt[o], oc.tgt[o + 1], oc.tgt[o + 2], oc.tgt[o + 3], oc.tgt[o + 5]]; };
function surface(x0, x1, z0, z1, top, n = 4) { const P = []; const y0 = GY + 0.05;
  for (let i = 0; i <= n; i++) for (let k = 0; k <= n; k++) { const u = i / n, v = k / n; P.push([x0 + (x1 - x0) * u, top, z0 + (z1 - z0) * v]); // top face
    P.push([x0, y0 + (top - y0) * v, z0 + (z1 - z0) * u], [x1, y0 + (top - y0) * v, z0 + (z1 - z0) * u], [x0 + (x1 - x0) * u, y0 + (top - y0) * v, z0], [x0 + (x1 - x0) * u, y0 + (top - y0) * v, z1]); }
  return P; }
const roadPts = []; for (const s of L.segments) { if (s.bridge || L.isWater((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2)) continue; roadPts.push([(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2]); }
const pick = (i) => roadPts[(i * 7919) % roadPts.length];
let checked = 0, bad = 0, hiddenTot = 0, testedTot = 0; const badList = [];
const eyes = [...[0, 1, 2, 3, 4, 5].map((i) => [...pick(i * 13 + 3), 1.7 + (i % 3) * 1.5]), [...pick(97), 12], [...pick(131), 35]];
for (const [x, z, h] of eyes) {
  const eps = 1.2; oc.compute(x, GY + h, z, eps); hiddenTot += OCC_STATS.hiddenB; testedTot += OCC_STATS.testedB;
  const jit = [[0, 0, 0], [eps * 0.95, 0, 0], [-eps * 0.95, 0, 0], [0, eps * 0.95, 0], [0, -eps * 0.95 * 0.5, 0], [0, 0, eps * 0.95], [0, 0, -eps * 0.95], [0.55, 0.55, 0.55].map((v) => v * eps)];
  for (const b of B) { if (oc.hiddenB[b.id] !== 1) continue; if (Math.hypot((b.x0 + b.x1) / 2 - x, (b.z0 + b.z1) / 2 - z) > 260) continue;
    const T = tgtOf(b.id); const pts = surface(...T); checked++; let vis = false;
    for (const [jx, jy, jz] of jit) { for (const p of pts) if (!blocked(x + jx, GY + h + jy, z + jz, p[0], p[1], p[2], b.id)) { vis = true; break; } if (vis) break; }
    if (vis) { bad++; if (badList.length < 5) badList.push(`#${b.id} from (${x.toFixed(0)},${h},${z.toFixed(0)})`); } }
}
ok(checked > 1500 && bad === 0, `conservative: ${checked} hidden buildings re-checked by exact segment tests (8 eyes in the ε sphere × ${surface(0, 1, 0, 1, 1).length} box points each) — ${bad} visible${badList.length ? ': ' + badList.join(', ') : ''}`);
ok(hiddenTot / testedTot > 0.4, `effective: ${hiddenTot} of ${testedTot} buildings in range hidden over the ${eyes.length} eyes (${(100 * hiddenTot / testedTot).toFixed(0)} %)`);
// ground cells: hidden cells really hidden (cell box up to its top)
{ let cc = 0, cb = 0; const [x, z] = pick(5); oc.compute(x, GY + 1.7, z, 1.0);
  for (let c = 0; c < oc.nC && cc < 400; c++) { if (oc.hiddenCell[c] !== 1) continue; const i = c % oc.ncx, k = Math.floor(c / oc.ncx), cs = oc.cfg.cell; const x0 = oc.cx0 + i * cs, z0 = oc.cz0 + k * cs; if (Math.hypot(x0 + cs / 2 - x, z0 + cs / 2 - z) > 220) continue; cc++;
    if (surface(x0, x0 + cs, z0, z0 + cs, oc.cellTop[c], 3).some((p) => !blocked(x, GY + 1.7, z, p[0], p[1], p[2], -1))) cb++; }
  ok(cc > 50 && cb === 0, `ground cells: ${cc} hidden cells re-checked, ${cb} visible`); }

// ---------------------------------------------------------------- time slicing
{ const [x, z] = pick(11); oc.compute(x, GY + 1.7, z, 1); const ref = [oc.hiddenB.slice(), oc.hiddenCell.slice(), oc.hiddenProp.slice()]; const gen0 = oc.gen;
  const [x2, z2] = pick(12); oc.begin(x2, GY + 1.7, z2, 1); let frames = 0; while (!oc.step(0.25)) { frames++; if (frames === 1) ok(oc.validAt({ x, y: GY + 1.7, z }) && oc.gen === gen0, 'while the next horizon is being built the previous one stays valid where it was made'); if (frames > 5000) break; }
  const sl = [oc.hiddenB.slice(), oc.hiddenCell.slice(), oc.hiddenProp.slice()]; oc.compute(x2, GY + 1.7, z2, 1); const one = [oc.hiddenB, oc.hiddenCell, oc.hiddenProp];
  const same = sl.every((a, i) => a.length === one[i].length && a.every((v, j) => v === one[i][j])); ok(frames >= 2 && same, `sliced build (${frames + 1} slices of 0.25 ms) = one-shot build`);
  ok(!oc.validAt({ x: x2 + 5, y: GY + 1.7, z: z2 }) && oc.validAt({ x: x2 + 0.5, y: GY + 1.7, z: z2 }), 'validity sphere: valid within ε, not beyond'); void ref; }
// update(): a fast camera gets a wider ε, and the next eye is predicted ahead
{ const [x, z] = pick(21); const cam = { position: { x, y: GY + 1.7, z } }; oc.invalidate(); for (let i = 0; i < 40 && !oc.valid; i++) oc.update(cam, 1 / 60, { x: 20, y: 0, z: 0 }, 1);
  ok(oc.valid && oc.eye.eps > 3 && oc.eye.x > x, `moving at 20 m/s: ε ${oc.eye.eps.toFixed(2)} m, horizon built ${(oc.eye.x - x).toFixed(2)} m ahead`); }

// ---------------------------------------------------------------- inside a building
{ const b = B.find((q) => q.x1 - q.x0 > 14 && q.z1 - q.z0 > 14 && q.h > 8); const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2; oc.compute(cx, GY + 1.6, cz, 1);
  ok(oc.boxHiddenRaw(cx + 3, cx + 4, cz + 3, cz + 4, GY + 2) === 0, 'camera inside a building: a person in the same room is not hidden');
  const inside = oc.insideL.includes(Array.from({ length: oc.nFp }, (_, i) => i).find((i) => oc.fp[i * 4] === b.x0 && oc.fp[i * 4 + 2] === b.z0)); ok(inside, 'that building is skipped as an occluder'); }

// ---------------------------------------------------------------- BatchCull on real BatchedMeshes
{ // coarseFirst
  const g = new THREE.BoxGeometry(4, 4, 4, 1, 1, 1); const extra = new THREE.BoxGeometry(0.1, 0.1, 0.4); extra.translate(3, 0, 0); const merged = mergeTwo(g, extra);
  const ix = merged.index.array.slice(); const keys = triKeys(ix, merged.attributes.position.array); const c = BC.coarseFirst(ix, merged.attributes.position.array);
  ok(c === 36 && sameMultiset(keys, triKeys(ix, merged.attributes.position.array)), `coarseFirst: the 12 big box triangles first (coarse ${c / 3} tris), the 12 small ones after, same triangles`);
  // a batch of 3 buildings: 0 near, 1 far (coarse only), 2 hidden
  const mat = new THREE.MeshStandardMaterial(); const Bm = new THREE.BatchedMesh(3, 1000, 3000, mat); const coarse = [];
  for (const x of [0, 200, 400]) { const gg = mergeTwo(new THREE.BoxGeometry(10, 10, 10), (() => { const e = new THREE.BoxGeometry(0.2, 0.2, 0.5); e.translate(5.2, 0, 0); return e; })()); gg.translate(x, 5, -30); const ia = gg.index.array; const cc = BC.coarseFirst(ia, gg.attributes.position.array); gg.index.needsUpdate = true; const gid = Bm.addGeometry(gg); coarse[gid] = cc; Bm.addInstance(gid); }
  const occ = { hiddenB: new Uint8Array([0, 0, 1]), hiddenCell: new Uint8Array(4), hiddenProp: new Uint8Array(4) };
  BC.installCull(Bm, { kind: 'detail', bid: new Int32Array([0, 1, 2]), coarse });
  const cam = new THREE.PerspectiveCamera(170, 1, 0.5, 2000); cam.position.set(0, 2, 0); cam.lookAt(0, 2, -100); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  BC.CULL.camera = cam; BC.CULL.occ = occ; BC.CULL.occOn = true; BC.CULL.eye.copy(cam.position); BC.LOD.enabled = true; Bm.updateMatrixWorld();
  Bm.onBeforeRender(null, null, cam, Bm.geometry, mat); const n1 = Bm._multiDrawCount, cnt = Array.from(Bm._multiDrawCounts.slice(0, n1));
  ok(n1 === 2 && cnt[0] === 72 && cnt[1] === 36, `main pass: near building in full (72 idx), far one coarse (36), hidden one skipped — drawn ${n1}: ${cnt.join(',')}`);
  const sc = new THREE.OrthographicCamera(-600, 600, 600, -600, 1, 2000); sc.position.set(200, 500, -30); sc.lookAt(200, 0, -30); sc.updateMatrixWorld(); sc.updateProjectionMatrix();
  Bm.onBeforeShadow(null, Bm, cam, sc, Bm.geometry, mat); ok(Bm._multiDrawCount === 3, `shadow pass: never occlusion-culled (draws ${Bm._multiDrawCount} of 3)`);
  BC.CULL.occOn = false; Bm.onBeforeRender(null, null, cam, Bm.geometry, mat); ok(Bm._multiDrawCount === 3, 'no valid horizon: nothing occlusion-culled');
  cam.lookAt(0, 2, 100); cam.updateMatrixWorld(); const narrow = new THREE.PerspectiveCamera(60, 1, 0.5, 2000); narrow.position.copy(cam.position); narrow.quaternion.copy(cam.quaternion); narrow.updateMatrixWorld(); BC.CULL.camera = narrow;
  Bm.onBeforeRender(null, null, narrow, Bm.geometry, mat); ok(Bm._multiDrawCount === 0, 'looking away: all three frustum-culled');
  // draw-distance kinds
  const T = new THREE.BatchedMesh(2, 100, 300, mat); for (const x of [0, 120]) { const gg = new THREE.BoxGeometry(0.3, 0.02, 0.3); gg.translate(x, 0, -10); T.addInstance(T.addGeometry(gg)); } BC.installCull(T, { kind: 'tiny' }); T.updateMatrixWorld();
  BC.CULL.camera = cam; cam.lookAt(60, 0, -10); cam.updateMatrixWorld(); T.onBeforeRender(null, null, cam, T.geometry, mat); ok(T._multiDrawCount === 1, `tiny kind: drawn within LOD.tiny (${BC.LOD.tiny} m), skipped at 120 m`);
  BC.LOD.enabled = false; T.onBeforeRender(null, null, cam, T.geometry, mat); ok(T._multiDrawCount === 2, 'LOD off: both drawn'); BC.LOD.enabled = true;
  BC.setLodQuality('low'); const lo = BC.LOD.detailFull; BC.setLodQuality('ultra'); const hi = BC.LOD.detailFull; BC.setLodQuality('high'); ok(lo < BC.LOD.detailFull && BC.LOD.detailFull < hi, `quality presets: full building detail within ${lo} / ${BC.LOD.detailFull} / ${hi} m (low / high / ultra)`);
  // layer hide: main camera only
  const o = new THREE.Mesh(new THREE.BoxGeometry(), mat); const mask0 = o.layers.mask; BC.hideObject(o); const main = new THREE.Camera(), shadow = new THREE.Camera(); BC.seeHidden(shadow);
  ok(!o.layers.test(main.layers) && o.layers.test(shadow.layers), 'hidden object: invisible to the main camera, still seen by shadow / mirror cameras'); BC.endHide(); ok(o.layers.mask === mask0, 'endHide restores the layers');
}

// ---------------------------------------------------------------- sky bake
{ const sb = new SkyBake(B, GY, L.BOUNDS);
  ok(sb.wallSky(L.BOUNDS.minX - 40, GY + 1, 0, -1, 0) > 0.95, `a wall facing open ground sees the whole sky half (${sb.wallSky(L.BOUNDS.minX - 40, GY + 1, 0, -1, 0).toFixed(2)})`);
  let lane = null; for (const a of B) { if (lane) break; for (const b of B) { if (b === a) continue; const gap = b.x0 - a.x1; if (gap > 1.5 && gap < 4 && b.z0 < (a.z0 + a.z1) / 2 && b.z1 > (a.z0 + a.z1) / 2 && a.h > 9 && b.h > 9) { lane = [a, b]; break; } } }
  if (lane) { const [a] = lane, z = (a.z0 + a.z1) / 2; const foot = sb.wallSky(a.x1, GY + 0.5, z, 1, 0), eave = sb.wallSky(a.x1, GY + a.h - 0.2, z, 1, 0); ok(foot < 0.45 && eave > foot + 0.15, `lane ${(lane[1].x0 - a.x1).toFixed(1)} m wide: sky at the foot of the wall ${foot.toFixed(2)}, at the eaves ${eave.toFixed(2)}`); }
  else ok(false, 'no lane found to test');
  const mb = new MultiBuilder(); for (const b of B.slice(0, 200)) buildBase(b, mb); const before = new Map([...mb.b].map(([k, b]) => [k, b.col.slice()])); sb.apply(mb);
  let roofSame = true, aoSame = true, wallDark = 0, wallN = 0, minK = 1;
  for (const [k, b] of mb.b) { const C0 = before.get(k); for (let i = 0; i < b.col.length / 3; i++) { const ny = b.nor[i * 3 + 1]; const r = C0[i * 3] > 1e-4 ? b.col[i * 3] / C0[i * 3] : 1;
    if (k === 'ao' || k.includes('glass')) { if (r !== 1) aoSame = false; continue; } if (ny > 0.5) { if (r !== 1) roofSame = false; continue; } if (Math.abs(ny) < 0.5) { wallN++; if (r < 0.999) wallDark++; minK = Math.min(minK, r); } } }
  ok(roofSame && aoSame, 'roofs, AO decals and glass facades untouched'); ok(wallDark > wallN * 0.3 && minK >= 1 - 0.28 - 1e-6, `walls: ${wallDark} of ${wallN} vertices shaded, darkest ×${minK.toFixed(2)} (limit ×0.72)`); }

console.log(`\nocclusion-test: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);

function mergeTwo(a, b) { const pa = a.attributes.position.array, pb = b.attributes.position.array; const P = new Float32Array(pa.length + pb.length); P.set(pa); P.set(pb, pa.length); const ia = a.index.array, ib = b.index.array, n = pa.length / 3; const I = new Uint16Array(ia.length + ib.length); I.set(ia); for (let i = 0; i < ib.length; i++) I[ia.length + i] = ib[i] + n;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); const N = new Float32Array(P.length); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setIndex(new THREE.BufferAttribute(I, 1)); return g; }
function triKeys(ix, P) { const out = []; for (let t = 0; t < ix.length; t += 3) out.push([ix[t], ix[t + 1], ix[t + 2]].map((v) => `${P[v * 3].toFixed(3)},${P[v * 3 + 1].toFixed(3)},${P[v * 3 + 2].toFixed(3)}`).join('|')); return out; }
function sameMultiset(a, b) { if (a.length !== b.length) return false; const s = [...a].sort(), t = [...b].sort(); return s.every((v, i) => v === t[i]); }
