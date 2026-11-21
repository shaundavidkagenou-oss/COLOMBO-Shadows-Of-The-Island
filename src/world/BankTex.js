// 77th request: "2k texture the whole bank. Use realistic textures … try to keep the size and fps same though."
//
// The Ceylon Meridian Bank's surface textures at 2048 × 2048 (BankTex2K.js draws them, pixel by pixel):
//   * size — still no image files: every texture is generated, so the repo / .exe grow by a few KB of code only;
//   * loading — the generators run in a small pool of Web Workers from the start of the enter-game loading screen (in
//     parallel with district streaming and shader compiling), so the loading screen stays animated; the walk-in preload waits
//     for them before it builds the hall and pre-uploads its textures (WalkIn.preloadAll → initTexture), so nothing is
//     generated or uploaded in the middle of play. Without workers (or before they finish) a texture is generated on the
//     spot, as before;
//   * memory — once a texture has been uploaded to the GPU its 16 MB canvas is released; anything that reads the image again
//     (the Texture Studio's "paint over", a lost WebGL context) gets it regenerated transparently;
//   * frame rate — the same materials, meshes and draw calls as before; mipmapped + anisotropic sampling. A few surfaces whose
//     look is their relief (plaster, moulded plastic, walnut pores, upholstery weave, ceiling-tile fissures, limestone) also
//     get a 1024² normal map derived from the same height field.
import * as THREE from 'three';
import { BANK_SURFACES, normalMap } from './BankTex2K.js';
import { hasCanvas } from './BankBrand.js';

const RAW = new Map(); // key → { w, h, rgba, n } finished by a worker, waiting to be put into a canvas
const TEX = new Map(), NRM = new Map(); let pending = null;
// pixel canvases (a browser / Electron page); Node tests' canvas stub has no ImageData, so they keep the kit's old textures
const can2K = () => hasCanvas() && typeof ImageData !== 'undefined';
export const BANK_TEX_KEYS = Object.keys(BANK_SURFACES);
export const BANK_TEX_SIZE = 2048;

// a canvas texture whose canvas is dropped after its GPU upload and rebuilt on demand (see the header)
function lazyCanvasTexture(make, { srgb = true, aniso = 8 } = {}) {
  let cv = make(); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  const src = t.source; Object.defineProperty(src, 'data', { configurable: true, enumerable: true, get() { if (!cv) cv = make(); return cv; }, set(v) { cv = v; } });
  t.onUpdate = () => { cv = null; }; t.userData.bank2k = true; return t;
}
function toCanvas(w, h, rgba) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0); return cv; }
function generate(key) { const r = RAW.get(key); if (r) { RAW.delete(key); return r; } const s = BANK_SURFACES[key](); const n = s.height ? normalMap(s.height, s.w, s.h, s.nScale || 1) : null; return { w: s.w, h: s.h, rgba: s.rgba, n }; }
function build(key) { let first = generate(key); const nrm = first.n;
  const t = lazyCanvasTexture(() => { const g = first || generate(key); first = null; return toCanvas(g.w, g.h, g.rgba); }); t.name = 'CMB 2K · ' + key; TEX.set(key, t);
  if (nrm) { let nf = nrm; const n = lazyCanvasTexture(() => { const g = nf || generate(key).n; nf = null; return toCanvas(g.w, g.h, g.rgba); }, { srgb: false, aniso: 4 }); n.name = 'CMB 2K normal · ' + key; NRM.set(key, n); }
  return t; }
// the colour texture for a bank surface (null without a canvas — Node tests)
export function bankTex(key) { if (!can2K() || !BANK_SURFACES[key]) return null; return TEX.get(key) || build(key); }
// its normal map, if the surface has one (call after bankTex)
export function bankNormal(key) { if (!can2K()) return null; if (!TEX.has(key)) bankTex(key); return NRM.get(key) || null; }

// start generating every surface in workers (idempotent). With a renderer, each finished surface becomes its texture and is
// uploaded straight away (so its pixels are freed at once — peak memory stays a few textures, not all of them). Resolves when
// all are done (or immediately without workers).
let REND = null;
function upload(key) { if (!REND || !REND.initTexture) return; const t = bankTex(key), n = NRM.get(key); try { if (t) REND.initTexture(t); if (n) REND.initTexture(n); } catch (e) { /* uploads on first draw instead */ } }
export function startBankTextures(renderer = null) { if (renderer) REND = renderer;
  if (pending) return pending; if (!can2K() || typeof Worker === 'undefined') return (pending = Promise.resolve(0));
  const todo = BANK_TEX_KEYS.filter((k) => !TEX.has(k) && !RAW.has(k)); if (!todo.length) return (pending = Promise.resolve(0));
  const nw = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1, todo.length)); /* ≤ 3: each holds ~100 MB of working buffers at its peak */ let done = 0;
  pending = new Promise((resolve) => { const workers = []; let next = 0, live = nw;
    const finish = (w) => { try { w.terminate(); } catch (e) { /* already gone */ } if (--live === 0) resolve(done); };
    const feed = (w) => { if (next >= todo.length) return finish(w); const key = todo[next++]; w.postMessage({ key, id: next }); };
    for (let i = 0; i < nw; i++) { let w; try { w = new Worker(new URL('./BankTexWorker.js', import.meta.url), { type: 'module' }); } catch (e) { console.warn('bank textures: no worker', e); if (--live === 0) resolve(done); continue; }
      workers.push(w); w.onmessage = (e) => { const d = e.data; if (!d.error && !TEX.has(d.key)) { RAW.set(d.key, { w: d.w, h: d.h, rgba: d.rgba, n: d.n }); done++; upload(d.key); } else if (d.error) console.warn('bank texture', d.key, d.error); feed(w); };
      w.onerror = (e) => { console.warn('bank texture worker', e.message || e); e.preventDefault && e.preventDefault(); finish(w); }; feed(w); }
  });
  return pending;
}
// wait for the workers, then turn every result into its texture (in slices, so the loading screen keeps drawing)
export async function prepareBankTextures(pr = () => {}, renderer = null) {
  if (renderer) REND = renderer; await startBankTextures(); let i = 0;
  for (const k of BANK_TEX_KEYS) { const had = TEX.has(k); bankTex(k); if (!had) upload(k); pr(++i / BANK_TEX_KEYS.length); await new Promise((r) => setTimeout(r, 0)); }
  return [...TEX.values(), ...NRM.values()];
}
// every 2K texture made so far (for pre-upload)
export function bankTextures() { return [...TEX.values(), ...NRM.values()]; }
