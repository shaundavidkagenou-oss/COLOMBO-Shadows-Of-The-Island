// Real-car bodies. tools/cars/build.mjs converts CC BY car models (credits: public/assets/vehicles/CREDITS.md) into
// game-native GLBs — logos / badges / plates removed, the source cabin removed (the game keeps its own fitted interior),
// geometry in the game's shared vehicle materials (paint / glass / chrome / rubber / lamps ...) with baked vertex colours,
// doors cut out on their seams with hinge-space leaves + sampled skin specs, LOD0 / LOD1 / LOD2 and a wheel template.
// They are loaded once on the loading screen (preloadRealModels) before any vehicle is built; a type whose file is missing or
// fails to load simply keeps its procedural body (VehicleModels.shapeOf falls back), so the game never depends on them.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// catalogue types with a real body (fictional names stay: the catalogue never uses a real make or model name)
export const REAL_TYPES = ['ventra', 'raiden', 'vanta'];
const assets = new Map();
export const realAsset = (type) => assets.get(type) || null;
export const realTypesLoaded = () => [...assets.keys()];

const baseUrl = () => { try { return import.meta.env.BASE_URL; } catch { return './'; } };
const fetchBuf = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); };

// read(type) → ArrayBuffer (default: fetch from public/assets/vehicles); onType(type, ok) for the loading screen
export async function preloadRealModels(read = (t) => fetchBuf(`${baseUrl()}assets/vehicles/${t}.glb`), onType = null) {
  await MeshoptDecoder.ready; const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  await Promise.all(REAL_TYPES.map(async (type) => {
    if (assets.has(type)) return; let ok = false;
    try { const buf = await read(type); const gltf = await loader.parseAsync(buf, ''); const a = unpack(gltf); if (a && a.meta.type === type) { assets.set(type, a); ok = true; } }
    catch (e) { console.warn('[vehicles] real body for', type, 'not loaded — procedural body kept:', e && e.message); }
    if (onType) onType(type, ok);
  }));
  return realTypesLoaded();
}

// geometry → plain float attributes in model space (quantized positions carry their dequantization in the node matrix)
function toFloat(src, M) {
  const P = src.attributes.position, N = src.attributes.normal, Cc = src.attributes.color, n = P.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(M);
  for (let i = 0; i < n; i++) { v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(M); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    if (N) { v.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize(); nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z; }
    if (Cc) { col[i * 3] = Cc.getX(i); col[i * 3 + 1] = Cc.getY(i); col[i * 3 + 2] = Cc.getZ(i); } else { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 1; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const I = src.index.array; g.setIndex(new THREE.BufferAttribute(n > 65535 ? Uint32Array.from(I) : Uint16Array.from(I), 1)); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
}
function unpack(gltf) {
  const meta = gltf.asset && gltf.asset.extras; if (!meta || meta.colombo !== 1) return null; gltf.scene.updateMatrixWorld(true);
  const a = { meta, lod0: { body: [], doors: meta.doors.map(() => []) }, lod1: [], lod2: [], w0: [], w1: [] };
  gltf.scene.traverse((o) => { if (!o.isMesh) return; const [L, piece, cat] = o.name.split('|'); if (!cat) return; const g = toFloat(o.geometry, o.matrixWorld); g.name = o.name;
    if (L === 'lod0') { if (piece === 'body') a.lod0.body.push([cat, g]); else if (piece.startsWith('door')) a.lod0.doors[+piece.slice(4)].push([cat, g]); }
    else if (L === 'lod1' || L === 'lod2') a[L].push([cat, g]); else if (L === 'w0' || L === 'w1') a[L].push([piece === 'cal' ? 'cal' : cat, g]); });
  pullTyreWalls(a); return a;
}
// Some source models (the Ventra's) have the outer tyre sidewall in a body rubber material that the offline wheel split did not
// take: it was baked into the static body — it did not spin, steer, ride the suspension or leave with a wheel thrown by an
// explosion, and it had no tyre material. Here those triangles (rubber, wholly inside a wheel's tyre band) leave the body; the
// ones round wheel 0 (the wheel the template was cut from) join the shared tyre template in hub space.
function pullTyreWalls(a) {
  const W = a.meta.wheels; const T0 = a.w0.find((q) => q[0] === 'tyre'); if (!W || !W.length || !T0) return;
  T0[1].computeBoundingBox(); const bb = T0[1].boundingBox; const R = Math.max(bb.max.y, -bb.min.y, bb.max.z, -bb.min.z); const inWheel = (x, y, z) => { for (let i = 0; i < W.length; i++) { const w = W[i]; const r = Math.hypot(y - w[1], z - w[2]); const lx = (x - w[0]) * (Math.sign(w[0]) || 1); if (lx > bb.min.x - 0.02 && lx < bb.max.x + 0.045 && r < R * 1.03 && r > R * 0.5) return i; } /* across the tyre's own width (hub space, mirrored for the far side): not the arch liner inboard */ return -1; };
  const take = (g, keepW0) => { const P = g.attributes.position, I = g.index.array, keep = [], got = []; for (let f = 0; f < I.length; f += 3) { let wi = -2; for (let j = 0; j < 3 && wi !== -1; j++) { const k = I[f + j]; const q = inWheel(P.getX(k), P.getY(k), P.getZ(k)); wi = wi === -2 ? q : wi === q ? q : -1; } if (wi < 0) keep.push(I[f], I[f + 1], I[f + 2]); else if (wi === 0 && keepW0) got.push(I[f], I[f + 1], I[f + 2]); }
    if (keep.length === I.length) return null; g.setIndex(new THREE.BufferAttribute(P.count > 65535 ? Uint32Array.from(keep) : Uint16Array.from(keep), 1)); return got; };
  const join = (tpl, g, idx) => { if (!idx || !idx.length) return; const c = W[0]; const t = tpl[1]; const n0 = t.attributes.position.count; const used = [...new Set(idx)]; const map = new Map(used.map((k, i) => [k, n0 + i])); const out = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'color']) { const A = t.attributes[name], B = g.attributes[name]; if (!A || !B) continue; const sz = A.itemSize; const arr = new Float32Array((n0 + used.length) * sz); arr.set(A.array.subarray(0, n0 * sz)); used.forEach((k, i) => { for (let e = 0; e < sz; e++) arr[(n0 + i) * sz + e] = B.array[k * sz + e] - (name === 'position' ? c[e] : 0); }); out.setAttribute(name, new THREE.BufferAttribute(arr, sz)); }
    const I = [...t.index.array, ...idx.map((k) => map.get(k))]; out.setIndex(new THREE.BufferAttribute(n0 + used.length > 65535 ? Uint32Array.from(I) : Uint16Array.from(I), 1)); out.computeBoundingBox(); out.computeBoundingSphere(); out.name = t.name; tpl[1] = out; };
  for (const [list, wl] of [[a.lod0.body, a.w0], [a.lod1, a.w1], [a.lod2, null]]) { const tpl = wl && wl.find((q) => q[0] === 'tyre'); for (const q of list) { if (q[0] !== 'rubber') continue; const got = take(q[1], !!tpl); if (got && tpl) join(tpl, q[1], got); } }
}
