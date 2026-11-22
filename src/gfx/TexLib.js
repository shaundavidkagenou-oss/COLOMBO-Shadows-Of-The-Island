// 83rd request: the shared 2048² texture library for the new close-up assets (balcony fabric + household atlas, feathers,
// vehicle cabin detail, road grime, rain on glass — generators in Tex2K.js, built offline by tools/tex2k-build.mjs).
//
//  • KTX2 / Basis Universal at run time: three's KTX2Loader detects what the GPU can sample (BC7 / BC3 / BC1 on desktop GPUs
//    such as the GTX 1660, ETC2 / ASTC on mobile, uncompressed RGBA only as the last resort) and transcodes to it in a worker.
//    Full mip chains come from the file (no runtime mip generation), so distant cloth / paint reads the small mips (cheap).
//  • One texture per key, shared by every material that uses it (no duplicates); materials ask with use(key, cb) and get the
//    texture when it arrives. Until then they draw with a 1×1 neutral stand-in of the same kind (no shader recompile when the
//    real texture is swapped in: same sampler, same defines).
//  • If KTX2 cannot be used (no renderer yet, worker / wasm blocked, file missing) the same generator runs at 256² in slices
//    on the main thread, so the look degrades but nothing breaks.
//  • release(key) disposes a texture nobody uses any more (refcounted).
import * as THREE from 'three';
import { TEX2K } from './Tex2K.js';

const S = { renderer: null, loader: null, tex: new Map(), wait: new Map(), refs: new Map(), stats: { ktx2: 0, fallback: 0, failed: 0, bytes: 0, format: '' } };
const NEUTRAL = { srgb: [255, 255, 255, 255], nrm: [128, 128, 200, 255] }; // white / flat normal (z up, B as roughness ~0.78)
const stand = new Map();
export function standIn(key) { let t = stand.get(key); if (t) return t; const spec = TEX2K[key]; const px = new Uint8Array(spec && spec.srgb ? NEUTRAL.srgb : (key === 'grime' || key === 'rainNrm') ? [0, 0, 0, 0] : NEUTRAL.nrm);
  t = new THREE.DataTexture(px, 1, 1, THREE.RGBAFormat); t.colorSpace = spec && spec.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; stand.set(key, t); return t; }
function base() { try { return import.meta.env.BASE_URL || './'; } catch { return './'; } }
export const TexLib = {
  stats: S.stats,
  init(renderer) { S.renderer = renderer; },
  has(key) { return S.tex.has(key); },
  get(key) { return S.tex.get(key) || null; },
  // cb(texture) once it is loaded (immediately if it already is); returns the stand-in to use until then
  use(key, cb) { S.refs.set(key, (S.refs.get(key) || 0) + 1); const t = S.tex.get(key); if (t) { cb(t); return t; } let w = S.wait.get(key); if (!w) { S.wait.set(key, (w = [])); this.load(key); } w.push(cb); return standIn(key); },
  release(key) { const n = (S.refs.get(key) || 1) - 1; S.refs.set(key, n); if (n > 0) return; const t = S.tex.get(key); if (t) { t.dispose(); S.tex.delete(key); } },
  async load(key) {
    const spec = TEX2K[key]; if (!spec) return; let tex = null;
    if (typeof document !== 'undefined' && S.renderer) {
      try {
        const L = await ktx2Loader(S.renderer);
        tex = await Promise.race([L.loadAsync(base() + 'assets/tex2k/' + key + '.ktx2'), new Promise((r, j) => setTimeout(() => j(new Error('timed out')), 25000))]);
        tex.colorSpace = spec.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; S.stats.ktx2++; S.stats.format = String(tex.format);
        const im = tex.mipmaps && tex.mipmaps[0]; if (im && im.data) for (const m of tex.mipmaps) S.stats.bytes += m.data.byteLength;
      } catch (e) { console.warn('[TexLib] KTX2 failed for', key, '- using the 256² fallback', e && e.message); tex = null; }
    }
    if (!tex) tex = await fallback(key, spec);
    if (!tex) { S.stats.failed++; return; }
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = Math.min(8, S.renderer && S.renderer.capabilities ? S.renderer.capabilities.getMaxAnisotropy() : 4); tex.name = 'tex2k:' + key; tex.needsUpdate = true;
    S.tex.set(key, tex); const w = S.wait.get(key) || []; S.wait.delete(key); for (const cb of w) { try { cb(tex); } catch (e) { console.warn('[TexLib]', e); } }
  },
};
// one KTX2Loader for the whole game (TexRuntime shares it): Basis transcoder from public/basis/ (copied from three's
// examples/jsm/libs/basis — the loader fetches basis_transcoder.js / .wasm by those exact names)
let LOADER = null;
export function ktx2Loader(renderer) {
  if (!LOADER) LOADER = import('three/examples/jsm/loaders/KTX2Loader.js').then(({ KTX2Loader }) => { const L = new KTX2Loader(); L.setTranscoderPath(base() + 'basis/'); L.setWorkerLimit(2); L.detectSupport(renderer); return L; });
  return LOADER;
}
// reduced-size build of the same generator (main thread, after a frame so loading never stalls on it)
async function fallback(key, spec) {
  await new Promise((r) => setTimeout(r, 30));
  try { const s = spec.gen(256); const t = new THREE.DataTexture(s.rgba, s.w, s.h, THREE.RGBAFormat); t.colorSpace = spec.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; S.stats.fallback++; return t; }
  catch (e) { console.warn('[TexLib] fallback failed', key, e); return null; }
}
