// 98th (FPS) — one shadow depth material per kind of mesh, so three.js stops re-deriving its depth shader on every draw.
//
// Every shadow-casting object without its own customDepthMaterial is drawn into the shadow maps with ONE shared
// THREE.MeshDepthMaterial inside WebGLShadowMap. Its shader differs for plain, instanced (with / without instance colours),
// batched and skinned meshes, and three walks the scene in graph order — so that one material kept switching kind, and each
// switch made WebGLRenderer.setProgram rebuild the material's full program parameters and cache-key string (getProgram) to
// find the variant it already had: ≈ 36 times a frame here, plus the garbage. (The programs themselves were cached; only
// the lookups were wasted.)
//
// Here instanced / batched / skinned shadow casters get a customDepthMaterial shared by every mesh of their kind: an exact
// copy of three's default depth material (new MeshDepthMaterial()), which three fills per draw exactly as it fills its own
// (side, map, alphaTest, clipping, displacement — WebGLShadowMap.getDepthMaterial). Same shaders (the program cache hands
// back the very programs already compiled), same state, same shadow — only the per-draw lookups go. Plain meshes keep three's
// shared material, which now never changes kind. Left alone: objects with their own depth material, material arrays, and any
// material for which three makes a per-material depth variant (alpha-tested maps, displacement, clipping, alpha-to-coverage).
import * as THREE from 'three';

const KINDS = new Map();
export const DEPTH_STATS = { on: true, assigned: 0, kinds: 0 }; // on = false: the next pass takes them all off again (A/B checks)
if (typeof window !== 'undefined') window.__DEPTHK = DEPTH_STATS;
function kindMaterial(key) {
  let m = KINDS.get(key);
  if (!m) { m = new THREE.MeshDepthMaterial(); m.name = 'depth:' + key; m.userData.autoDepth = true; m.dispose = () => {}; /* shared: never released by one owner's cleanup */ KINDS.set(key, m); DEPTH_STATS.kinds = KINDS.size; }
  return m;
}
// three's own test for a per-material depth variant (WebGLShadowMap.getDepthMaterial)
function needsVariant(mat, renderer) {
  return (renderer.localClippingEnabled && mat.clipShadows === true && Array.isArray(mat.clippingPlanes) && mat.clippingPlanes.length !== 0) ||
    (mat.displacementMap && mat.displacementScale !== 0) || (mat.alphaMap && mat.alphaTest > 0) || (mat.map && mat.alphaTest > 0) || mat.alphaToCoverage === true;
}
function keyOf(o) {
  const g = o.geometry, M = g && g.morphAttributes, morph = M && M.position ? M.position.length + (M.normal ? 'n' : '') + (M.color ? 'c' : '') : M && (M.normal || M.color) ? 'x' : 0;
  if (o.isBatchedMesh) return 'batched' + (o._colorsTexture ? 'C' : '') + (morph ? 'm' + morph : '');
  if (o.isInstancedMesh) return 'instanced' + (o.instanceColor ? 'C' : '') + (o.morphTexture ? 'M' : '') + (morph ? 'm' + morph : '');
  if (o.isSkinnedMesh) return 'skinned' + (morph ? 'm' + morph : '');
  return null;
}
// called every couple of seconds over the scene (Game.cullStep's shadow-camera walk): new objects get theirs, objects whose
// material changed to one three makes its own variant for get theirs removed again
export function assignDepthKinds(o, renderer) {
  if (!o.isMesh || !o.castShadow) return;
  const cur = o.customDepthMaterial; if (cur !== undefined && !(cur.userData && cur.userData.autoDepth)) return; // the object's own
  const mat = o.material; const key = !DEPTH_STATS.on || !mat || Array.isArray(mat) || needsVariant(mat, renderer) ? null : keyOf(o);
  if (!key) { if (cur !== undefined) o.customDepthMaterial = undefined; return; }
  const m = kindMaterial(key); if (cur !== m) { o.customDepthMaterial = m; DEPTH_STATS.assigned++; }
}
