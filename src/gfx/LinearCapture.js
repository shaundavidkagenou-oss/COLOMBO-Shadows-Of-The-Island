// Scene captures (pause-map satellite tiles, the busted cinematic's stills) rendered the way the game's main pass renders.
//
// A material's shader program depends on where it is drawn: into a render target (the game's main pass draws into the
// composer's half-float target — linear output, tone mapping left to the OutputPass) or straight to the canvas (sRGB output,
// tone mapping inside every material shader). Rendering the scene to the canvas therefore compiles a SECOND program for every
// material in view: measured 83 new programs on the first map open (a multi-second freeze on a real GPU while the driver compiles
// them; the same at the first busted shot). Here the scene is drawn into a linear half-float target with the game's programs, then
// tone-mapped and encoded to the canvas by an OutputPass (the composer's own, already compiled program). The pixels are the same
// tone-mapped sRGB image as before.
import * as THREE from 'three';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

let rt = null, out = null;
// draw `scene` from `cam` into the canvas rectangle (x, y, w, h) in CSS pixels, bottom-left origin like setViewport
export function captureToCanvas(R, scene, cam, x, y, w, h) {
  const pr = R.getPixelRatio(); const pw = Math.max(1, Math.round(w * pr)), ph = Math.max(1, Math.round(h * pr));
  if (!rt) rt = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, samples: 0, depthTexture: new THREE.DepthTexture(pw, ph, THREE.FloatType) }); // same formats as the composer's target
  else if (rt.width !== pw || rt.height !== ph) rt.setSize(pw, ph);
  R.setRenderTarget(rt); R.setScissorTest(false); R.clear(); R.render(scene, cam);
  if (!out) { out = new OutputPass(); out.renderToScreen = true; }
  R.setRenderTarget(null); R.setViewport(x, y, w, h); R.setScissor(x, y, w, h); R.setScissorTest(true);
  out.render(R, null, rt);
}
// a fog that changes no pixel but keeps the fog code in the programs (removing scene.fog would select other programs)
export function neutralFog(scene) {
  const f = scene.fog; if (!f) return () => {};
  const keep = { near: f.near, far: f.far, density: f.density };
  if (f.isFog) { f.near = 1e7; f.far = 1e7 + 1; } else if (f.isFogExp2) f.density = 0;
  return () => { if (f.isFog) { f.near = keep.near; f.far = keep.far; } else if (f.isFogExp2) f.density = keep.density; };
}
