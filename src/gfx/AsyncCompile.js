import * as THREE from 'three';
// Non-blocking shader compile during play (the three.js patch: tools/vite/threeAsyncCompile.mjs). While renderer.deferCompile is
// true a scene draw whose program is still compiling (KHR_parallel_shader_compile) is skipped for the frame instead of stalling
// it. One-shot renders that must be complete the moment they are taken (environment / probe captures, map and mugshot captures,
// texture bakes, UI previews) run through withoutDefer.
export function withoutDefer(R, fn) { if (!R) return fn(); const d = R.deferCompile; R.deferCompile = false; try { return fn(); } finally { R.deferCompile = d; } }

// 85th (shop-entry hitch): draw `root` once, alone, into a 4 × 4 target — uploads every vertex / index buffer (and any texture
// that is still pending) while the loading screen is up, instead of on the frame a shop door opens. Same scene, lights and
// fog as play (the room's programs were just compiled for exactly this state), the rest of the scene hidden, frustum culling
// off for the pass, no shadow pass. Everything is put back as it was.
let _pdRT = null;
export function predraw(R, scene, camera, root) {
  if (!R || !scene || !camera || !root) return;
  const vis = [], fc = []; const show = (o) => { vis.push([o, o.visible]); o.visible = true; };
  const added = !root.parent; if (added) scene.add(root);
  // root and its ancestors drawn; every sibling along that chain (and so the rest of the scene) hidden — lights stay
  for (let o = root; o && o !== scene; o = o.parent) { show(o); const par = o.parent; if (par) for (const c of par.children) if (c !== o && !c.isLight && c.visible) { vis.push([c, true]); c.visible = false; } }
  root.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine) && o.frustumCulled) { o.frustumCulled = false; fc.push(o); } });
  const prev = R.getRenderTarget(), sm = R.shadowMap.autoUpdate; _pdRT = _pdRT || new THREE.WebGLRenderTarget(4, 4);
  try { root.updateMatrixWorld(true); R.shadowMap.autoUpdate = false; R.setRenderTarget(_pdRT); withoutDefer(R, () => R.render(scene, camera)); }
  catch (e) { console.warn('predraw', e); }
  finally { R.setRenderTarget(prev); R.shadowMap.autoUpdate = sm; for (const o of fc) o.frustumCulled = true; for (let i = vis.length - 1; i >= 0; i--) vis[i][0].visible = vis[i][1]; if (added) scene.remove(root); }
}
