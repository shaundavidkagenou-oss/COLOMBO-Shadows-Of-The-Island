// 73rd: the Ceylon Meridian Bank's parts. Every piece of the banking hall that is built from the shop kit — counter, glass, ATMs,
// chairs, desks, posters, plants, ceiling panels, air conditioners, the vault door … — is a NAMED PART (ShopKit Kit.setPart):
// the hall is still drawn as one merged mesh per material (no extra draw calls), but each mesh knows which vertex / index range
// belongs to which part. A layout document ({ parts: { '<name>': { p: [dx, dy, dz], r: degrees, s: [sx, sy, sz], hide, own } } })
// moves / turns / scales / hides any part, and `own` gives that part materials of its own ("CMB · <part> · <material>": the
// Texture Studio retextures them without touching the rest of the bank — or any other building using the same material).
// Only parts with `own` cost a draw call each. The walk-around obstacles of a part follow it (or vanish with it).
// The layout is edited with the console command `bank-edit` (src/debug/BankEditor.js, development builds only) and saved in
// model-pack/manifest.json under "bank", which every build — dev, dist and the .exe — applies when the hall is built.
import * as THREE from 'three';
import { cloneMaterial } from '../gfx/Materials.js';

export const PART_PREFIX = 'CMB · ';
const isActive = (e) => !!e && (e.hide || e.own || (e.p && (e.p[0] || e.p[1] || e.p[2])) || e.r || (e.s && (e.s[0] !== 1 || e.s[1] !== 1 || e.s[2] !== 1)));
export const partEdited = isActive;

// the parts of the meshes Kit.meshes() returned (userData.parts) + the obstacles tagged with a part
export function collectParts(meshes, obstacles = []) {
  const recs = [], names = [], seen = new Set(), bounds = new Map();
  for (const m of meshes) {
    const R = m.userData.parts; if (!R || !R.length) continue; recs.push({ m, R, orig: null, subs: [] }); const p = m.geometry.attributes.position.array;
    for (const [nm, v0, v1] of R) { if (!seen.has(nm)) { seen.add(nm); names.push(nm); bounds.set(nm, new THREE.Box3()); } const b = bounds.get(nm);
      for (let v = v0; v < v1; v++) { const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2]; if (x < b.min.x) b.min.x = x; if (y < b.min.y) b.min.y = y; if (z < b.min.z) b.min.z = z; if (x > b.max.x) b.max.x = x; if (y > b.max.y) b.max.y = y; if (z > b.max.z) b.max.z = z; } }
  }
  const obs = obstacles.filter((o) => o.part).map((o) => ({ o, orig: { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1 } }));
  return { recs, names, bounds, obs, mats: new Map(), layout: null };
}

// which part a ray hit (mesh + face index from a THREE raycast) — null if it is not one of the bank's parts
export function partAtFace(P, mesh, face) {
  if (!P || !mesh) return null; if (mesh.userData.bankPart) return mesh.userData.bankPart; const rec = P.recs.find((r) => r.m === mesh); if (!rec || face == null) return null;
  const i = face * 3; const list = rec.cur || rec.R.map((r) => [r[0], r[3], r[4]]); for (const [nm, a, b] of list) if (i >= a && i < b) return nm; return null;
}
// one part as a stand-alone mesh group (its geometry as it is now, original materials) — the editor's .glb download
export function partObject(P, name) {
  const grp = new THREE.Group(); grp.name = name;
  for (const rec of P.recs) { const ranges = rec.R.filter((r) => r[0] === name); if (!ranges.length) continue; const g = rec.m.geometry, I = rec.orig ? rec.orig.i : g.index.array;
    const map = new Map(), pos = [], nor = [], uv = [], col = [], idx = []; const A = g.attributes;
    for (const [, , , i0, i1] of ranges) for (let i = i0; i < i1; i++) { const v = I[i]; let n = map.get(v); if (n === undefined) { n = map.size; map.set(v, n); pos.push(A.position.getX(v), A.position.getY(v), A.position.getZ(v)); nor.push(A.normal.getX(v), A.normal.getY(v), A.normal.getZ(v)); if (A.uv) uv.push(A.uv.getX(v), A.uv.getY(v)); if (A.color) col.push(A.color.getX(v), A.color.getY(v), A.color.getZ(v)); } idx.push(n); }
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ng.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); if (uv.length) ng.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); if (col.length) ng.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); ng.setIndex(idx);
    const m = new THREE.Mesh(ng, rec.m.material); m.name = name + ' · ' + (rec.m.material.name || rec.m.name); grp.add(m); }
  return grp;
}
// a part's transform (room-local): about the centre of its footprint, at its lowest point
export function partMatrix(P, name, e) {
  const b = P.bounds.get(name); if (!b || !e) return null; const c = new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
  const p = e.p || [0, 0, 0], s = e.s || [1, 1, 1], r = ((+e.r || 0) * Math.PI) / 180;
  return new THREE.Matrix4().makeTranslation(c.x + (+p[0] || 0), c.y + (+p[1] || 0), c.z + (+p[2] || 0))
    .multiply(new THREE.Matrix4().makeRotationY(r)).multiply(new THREE.Matrix4().makeScale(Math.max(0.01, +s[0] || 1), Math.max(0.01, +s[1] || 1), Math.max(0.01, +s[2] || 1)))
    .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
}
// where a part is now (for the editor's highlight box)
export function partBox(P, name) { const b = P.bounds.get(name); if (!b) return null; const e = P.layout && P.layout.parts && P.layout.parts[name]; const M = e ? partMatrix(P, name, e) : null; const o = b.clone(); return M ? o.applyMatrix4(M) : o; }

// the material a part draws with when it has materials of its own (one per part + original material, kept across re-applies so
// Texture Studio edits stay on it)
function ownMaterial(P, name, src, meshName) {
  const label = (src.name || meshName || 'material').replace(PART_PREFIX, ''); const key = PART_PREFIX + name + ' · ' + label; let m = P.mats.get(key);
  if (!m) { m = cloneMaterial(src, key); m.userData = Object.assign({}, m.userData, { own: true, bankPart: name }); P.mats.set(key, m); }
  return m;
}

export function applyLayout(P, layout) {
  if (!P) return 0; const L = (layout && layout.parts) || {}; P.layout = { parts: L }; let touched = 0;
  const _v = new THREE.Vector3(), _n = new THREE.Vector3();
  for (const rec of P.recs) {
    const any = rec.R.some((r) => isActive(L[r[0]])); if (!any && !rec.orig) continue; touched++;
    const g = rec.m.geometry, pos = g.attributes.position, nor = g.attributes.normal;
    if (!rec.orig) rec.orig = { p: pos.array.slice(), n: nor.array.slice(), i: g.index.array.slice() };
    pos.array.set(rec.orig.p); nor.array.set(rec.orig.n);
    // move / turn / scale
    for (const [nm, v0, v1] of rec.R) {
      const e = L[nm]; if (!isActive(e) || e.hide) continue; const M = partMatrix(P, nm, e); if (!M) continue; const N = new THREE.Matrix3().getNormalMatrix(M);
      const pa = pos.array, na = nor.array;
      for (let v = v0; v < v1; v++) { _v.fromArray(pa, v * 3).applyMatrix4(M).toArray(pa, v * 3); _n.fromArray(na, v * 3).applyMatrix3(N).normalize().toArray(na, v * 3); }
    }
    pos.needsUpdate = true; nor.needsUpdate = true;
    // hidden parts leave the index; parts with their own materials move into meshes of their own (sharing the vertex buffers)
    for (const s of rec.subs) { if (s.parent) s.parent.remove(s); s.geometry.dispose(); } rec.subs = [];
    const I = rec.orig.i, keep = [], own = new Map();
    for (const [nm, , , i0, i1] of rec.R) { const e = L[nm]; if (e && e.hide) continue; if (e && e.own) { if (!own.has(nm)) own.set(nm, []); own.get(nm).push([i0, i1]); } else keep.push([i0, i1, nm]); }
    const cut = (list, map = null) => { let n = 0; for (const [a, b] of list) n += b - a; const A = new I.constructor(n); let o = 0; for (const [a, b, nm] of list) { A.set(I.subarray(a, b), o); if (map) map.push([nm || null, o, o + b - a]); o += b - a; } return A; };
    // (index ranges not covered by any part — none in the bank, but kept if a builder had geometry before the first part)
    const covered = rec.R.reduce((n, r) => n + (r[4] - r[3]), 0); if (covered < I.length) { let at = 0; const sorted = rec.R.map((r) => [r[3], r[4]]).sort((a, b) => a[0] - b[0]); for (const [a, b] of sorted) { if (a > at) keep.push([at, a]); at = Math.max(at, b); } if (at < I.length) keep.push([at, I.length]); }
    rec.cur = []; g.setIndex(new THREE.BufferAttribute(cut(keep, rec.cur), 1)); g.computeBoundingSphere(); g.computeBoundingBox(); rec.m.visible = keep.length > 0;
    for (const [nm, list] of own) {
      const sg = new THREE.BufferGeometry(); for (const [an, at] of Object.entries(g.attributes)) sg.setAttribute(an, at); sg.setIndex(new THREE.BufferAttribute(cut(list), 1)); sg.computeBoundingSphere(); sg.computeBoundingBox();
      const sm = new THREE.Mesh(sg, ownMaterial(P, nm, rec.m.material, rec.m.name)); sm.name = PART_PREFIX + nm; sm.userData.bankPart = nm; sm.castShadow = rec.m.castShadow; sm.receiveShadow = rec.m.receiveShadow; sm.renderOrder = rec.m.renderOrder;
      sm.matrixAutoUpdate = false; sm.matrix.copy(rec.m.matrix); if (rec.m.parent) rec.m.parent.add(sm); sm.updateMatrixWorld(true); rec.subs.push(sm);
    }
  }
  // the obstacles people and the player walk round
  for (const { o, orig } of P.obs) {
    Object.assign(o, orig); const e = L[o.part]; if (!isActive(e)) continue;
    if (e.hide) { o.x0 = o.x1 = o.z0 = o.z1 = 1e5; continue; }
    const M = partMatrix(P, o.part, e); if (!M) continue; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [x, z] of [[orig.x0, orig.z0], [orig.x1, orig.z0], [orig.x0, orig.z1], [orig.x1, orig.z1]]) { _v.set(x, 0, z).applyMatrix4(M); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); z0 = Math.min(z0, _v.z); z1 = Math.max(z1, _v.z); }
    Object.assign(o, { x0, x1, z0, z1 });
  }
  return touched;
}
