// 85th (hitch): ONE heavy object build per simulated frame across the whole city — a pedestrian (Character), a moving car or a
// parked car (Vehicle). Each system already limited itself to about one build a frame, but on the same frame the crowd, the
// traffic and the parked cars could each build one (3–4 × 10–30 ms on a mid-range CPU = a visible hitch). Game.updatePlay
// opens each frame (begin); a system asks can() before trying and spend()s only when it really builds, so a spawn attempt
// that finds no place never blocks the others. Fills behind a loading screen / fade (teleport, load) pass `fresh` and are
// not limited, as before.
export const BUILDS = {
  left: 1, frames: 0, deferred: 0,
  begin() { this.left = 1; this.frames++; },
  can(fresh = false) { if (fresh || this.left > 0) return true; this.deferred++; return false; },
  spend() { this.left--; },
};
if (typeof window !== 'undefined') window.__BUILDS = BUILDS; // (dev / tests)
