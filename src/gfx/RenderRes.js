// 91st — internal ÷ output resolution of the frame being drawn (1 when native). Point sprites are sized in drawing-buffer pixels from
// the canvas's pixel ratio / height; while SGSR renders at a lower internal size they scale by this so they stay the same size
// on screen (BoatLamps, Atmosphere stars, ParkLife, Props GLOW_MAT). sub(fn) calls fn(k) now and on every change.
export const RenderRes = {
  k: 1, subs: new Set(),
  set(k) { k = Number.isFinite(k) && k > 0 ? k : 1; if (k === this.k) return; this.k = k; for (const f of this.subs) { try { f(k); } catch (e) { console.warn(e); } } },
  sub(fn) { this.subs.add(fn); fn(this.k); return () => this.subs.delete(fn); },
};
