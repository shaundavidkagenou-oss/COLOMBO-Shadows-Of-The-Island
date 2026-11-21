// 77th: builds one of the bank's 2048² surfaces off the main thread (see BankTex.js). The pixel code is BankTex2K.js.
import { BANK_SURFACES, normalMap } from './BankTex2K.js';
self.onmessage = (e) => {
  const { key, id } = e.data; try {
    const s = BANK_SURFACES[key](); const n = s.height ? normalMap(s.height, s.w, s.h, s.nScale || 1) : null;
    const msg = { id, key, w: s.w, h: s.h, rgba: s.rgba, n: n ? { w: n.w, h: n.h, rgba: n.rgba } : null };
    self.postMessage(msg, n ? [s.rgba.buffer, n.rgba.buffer] : [s.rgba.buffer]);
  } catch (err) { self.postMessage({ id, key, error: String(err && err.message || err) }); }
};
