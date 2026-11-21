// 77th: builds one of the bank's 2048² surfaces off the main thread (see BankTex.js). The pixel code is BankTex2K.js.
// 78th: `size` — the graphics-quality size of this surface (it is shrunk here, so only the final pixels cross threads).
import { BANK_SURFACES, normalMap, fitSize } from './BankTex2K.js';
self.onmessage = (e) => {
  const { key, id, size = 2048 } = e.data; try {
    const g = BANK_SURFACES[key](); const n0 = g.height ? normalMap(g.height, g.w, g.h, g.nScale || 1) : null;
    const s = fitSize({ w: g.w, h: g.h, rgba: g.rgba, n: n0, linear: g.linear }, size); const n = s.n;
    const msg = { id, key, w: s.w, h: s.h, rgba: s.rgba, linear: !!s.linear, n: n ? { w: n.w, h: n.h, rgba: n.rgba } : null };
    self.postMessage(msg, n ? [s.rgba.buffer, n.rgba.buffer] : [s.rgba.buffer]);
  } catch (err) { self.postMessage({ id, key, error: String(err && err.message || err) }); }
};
