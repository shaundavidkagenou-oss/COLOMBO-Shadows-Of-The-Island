// 98th (FPS) — per-camera indirect textures for THREE.BatchedMesh: no re-upload of an unchanged draw list.
//
// A batched mesh draws its visible instances in one multi-draw call. The shader finds each draw's instance through a small
// integer texture (BatchedMesh._indirectTexture: draw index → instance index), which the culling hooks (BatchCull.cullDraw,
// Forest.fill) rewrite for every camera that renders the mesh: the main view, the sun's near shadow map, headlight shadows, the
// water mirror. All those cameras shared ONE texture, so it was re-uploaded for every pass of every batch, every frame — ≈ 130
// full texture uploads a frame (each through three's whole uploadTexture path: bind, pixel-store state, 4–5 texParameteri,
// texSubImage2D), even when the camera and the list had not changed at all.
//
// Now each camera keeps its own copy of that texture. A pass writes its list into a scratch array (begin), and commit() compares
// it with what that camera's texture already holds: only a changed list is copied and uploaded. three reads
// object._indirectTexture when it draws (setProgram), right after the culling hook, so pointing it at the camera's texture
// there is all it takes. The image is identical — the same instances in the same order are drawn; only redundant uploads go.
// The draw ranges (starts / counts) are plain CPU arrays passed to every draw call and are rewritten as before.
import * as THREE from 'three';

const MAXCAM = 6; // cameras remembered per batch (main, near sun, mirror, a few headlight shadows); the oldest is reused beyond
export const INDIRECT_STATS = { on: true, uploads: 0, skipped: 0 }; // on = false: the old behaviour (A/B checks)
if (typeof window !== "undefined") window.__INDIRECT = INDIRECT_STATS;

function state(B) {
  const cur = B._indirectTexture; let C = B.userData._ind;
  // first use, or three replaced the texture (BatchedMesh.setInstanceCount reallocates it): start over from that one
  if (!C || (cur !== C.base && !C.own.has(cur))) {
    if (C) for (const e of C.cams.values()) if (e.tex !== cur && e.tex !== C.base) e.tex.dispose();
    C = B.userData._ind = { base: cur, size: cur.image.width, cams: new Map(), own: new Set([cur]), scratch: new Uint32Array(cur.image.data.length), tick: 0 };
    if (!B.userData._indDispose) { const dispose = B.dispose.bind(B); B.userData._indDispose = true; B.dispose = () => { const c = B.userData._ind; if (c) for (const t of c.own) if (t !== B._indirectTexture) t.dispose(); B.userData._ind = null; return dispose(); }; }
  }
  return C;
}
// the array this pass writes its draw → instance list into (ind[k] = instance index, k < count)
export function beginIndirect(B) { return state(B).scratch; }
// point the batch at this camera's texture, uploading it only when the list (first `count` entries) changed
export function commitIndirect(B, camera, count) {
  const C = state(B);
  if (!INDIRECT_STATS.on) { const b = C.base; b.image.data.set(count < C.scratch.length ? C.scratch.subarray(0, count) : C.scratch); b.needsUpdate = true; B._indirectTexture = b; INDIRECT_STATS.uploads++; return; }
  let e = C.cams.get(camera); C.tick++;
  if (!e) {
    let tex;
    if (C.cams.size === 0) tex = C.base; // the batch's own texture serves the first camera
    else if (C.cams.size < MAXCAM) { const b = C.base; tex = new THREE.DataTexture(new Uint32Array(b.image.data.length), b.image.width, b.image.height, b.format, b.type); C.own.add(tex); }
    else { let old = null; for (const [k, v] of C.cams) if (!old || v.t < old[1].t) old = [k, v]; C.cams.delete(old[0]); tex = old[1].tex; } // least recently used
    e = { tex, n: -1, t: 0 }; C.cams.set(camera, e);
  }
  e.t = C.tick; const S = C.scratch, D = e.tex.image.data; let same = e.n >= 0 && count <= e.n;
  if (same) for (let i = 0; i < count; i++) if (S[i] !== D[i]) { same = false; break; }
  if (same) INDIRECT_STATS.skipped++;
  else { D.set(count < S.length ? S.subarray(0, count) : S); e.n = count; e.tex.needsUpdate = true; INDIRECT_STATS.uploads++; }
  B._indirectTexture = e.tex;
}
