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
const keepVP = new THREE.Vector4(), keepSC = new THREE.Vector4();
// draw `scene` from `cam` into the canvas rectangle (x, y, w, h) in CSS pixels, bottom-left origin like setViewport.
// The renderer's render target, viewport, scissor box and scissor test are put back exactly as they were: the capture's
// rectangle must never outlive the call. (It once did: the 2×2 shader-warm capture in the enter-game loading left a 2×2 viewport
// + scissor behind, so every later frame — player camera, trailer — was drawn into a 2-pixel corner and the screen stayed black.)
export function captureToCanvas(R, scene, cam, x, y, w, h) {
  const keepRT = R.getRenderTarget(), keepST = R.getScissorTest(); R.getViewport(keepVP); R.getScissor(keepSC);
  try { drawCapture(R, scene, cam, x, y, w, h); } finally { R.setRenderTarget(keepRT); R.setViewport(keepVP); R.setScissor(keepSC); R.setScissorTest(keepST); }
}
function drawCapture(R, scene, cam, x, y, w, h) {
  const pr = R.getPixelRatio(); const pw = Math.max(1, Math.round(w * pr)), ph = Math.max(1, Math.round(h * pr));
  if (!rt) rt = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, samples: 0, depthTexture: new THREE.DepthTexture(pw, ph, THREE.FloatType) }); // same formats as the composer's target
  else if (rt.width !== pw || rt.height !== ph) rt.setSize(pw, ph);
  R.setRenderTarget(rt); R.setScissorTest(false); R.clear(); R.render(scene, cam);
  if (!out) { out = new OutputPass(); out.renderToScreen = true; }
  R.setRenderTarget(null); R.setViewport(x, y, w, h); R.setScissor(x, y, w, h); R.setScissorTest(true);
  out.render(R, null, rt);
}
// small capture straight into pixels (the busted mugshot): the scene is drawn from `cam` into a w×h linear half-float target with
// the game's programs, tone-mapped / sRGB-encoded by the OutputPass into a w×h 8-bit target, and read back with one small
// readPixels (w·h·4 bytes). No full-canvas readback (drawImage of the WebGL canvas + getImageData / toDataURL stalls the GPU
// pipeline and copies the whole frame), and the frame's shadow maps are reused instead of being re-rendered for this camera.
// Resolves to RGBA rows bottom-up (WebGL order), or null when the renderer can't read back. The render itself happens now (the
// pose / exposure of this moment); only the pixels arrive later.
let srt = null, srt8 = null, sout = null;
export function captureToPixels(R, scene, cam, w, h, clearAlpha = 1) {
  const keepRT = R.getRenderTarget(), keepST = R.getScissorTest(); R.getViewport(keepVP); R.getScissor(keepSC);
  const SM = R.shadowMap, keepAU = SM.autoUpdate, keepNU = SM.needsUpdate; const keepCC = new THREE.Color(); R.getClearColor(keepCC); const keepCA = R.getClearAlpha();
  try {
    if (!srt) { srt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0, depthTexture: new THREE.DepthTexture(w, h, THREE.FloatType) }); srt8 = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false }); sout = new OutputPass(); }
    else if (srt.width !== w || srt.height !== h) { srt.setSize(w, h); srt8.setSize(w, h); }
    SM.autoUpdate = false; SM.needsUpdate = false; R.setClearColor(keepCC, clearAlpha);
    R.setRenderTarget(srt); R.setScissorTest(false); R.setViewport(0, 0, w, h); R.clear(); R.render(scene, cam);
    sout.renderToScreen = false; sout.render(R, srt8, srt);
    const px = new Uint8Array(w * h * 4);
    // asynchronous readback (WebGL2 pixel-pack buffer + fence): the GPU finishes in its own time and the frame never waits on it.
    // A synchronous readPixels stalls the CPU until the whole GPU queue has drained (measured 23 s under a software rasteriser).
    if (R.readRenderTargetPixelsAsync) return R.readRenderTargetPixelsAsync(srt8, 0, 0, w, h, px).then(() => px, () => null);
    R.readRenderTargetPixels(srt8, 0, 0, w, h, px); return Promise.resolve(px);
  } catch (e) { return Promise.resolve(null); } finally { SM.autoUpdate = keepAU; SM.needsUpdate = keepNU; R.setClearColor(keepCC, keepCA); R.setRenderTarget(keepRT); R.setViewport(keepVP); R.setScissor(keepSC); R.setScissorTest(keepST); }
}
// a fog that changes no pixel but keeps the fog code in the programs (removing scene.fog would select other programs)
export function neutralFog(scene) {
  const f = scene.fog; if (!f) return () => {};
  const keep = { near: f.near, far: f.far, density: f.density };
  if (f.isFog) { f.near = 1e7; f.far = 1e7 + 1; } else if (f.isFogExp2) f.density = 0;
  return () => { if (f.isFog) { f.near = keep.near; f.far = keep.far; } else if (f.isFogExp2) f.density = keep.density; };
}
