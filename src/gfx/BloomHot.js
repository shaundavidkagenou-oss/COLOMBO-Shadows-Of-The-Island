// Something bright enough to bloom by day (muzzle flash, flashing beacons) keeps the bloom pass on for a moment — see PostFX.
let hotUntil = 0; let view = null; const RANGE2 = 110 * 110;
export function bloomHot(sec = 0.4) { hotUntil = Math.max(hotUntil, performance.now() + sec * 1000); }
export function bloomIsHot() { return performance.now() < hotUntil; }
// the camera the bloom is for (Game sets it once)
export function setBloomView(cam) { view = cam; }
// a hot source at a world position: only one near the camera and not behind it can put a bloomed pixel on screen (by day
// the bloom runs at strength 0.03 / threshold 7 — a beacon 300 m away or round the block adds nothing visible, yet it kept
// the ~13 half-res bloom passes running for every police chase: 40th request, "the police system lags when it's working")
export function bloomHotAt(x, y, z, sec = 0.4) {
  if (view) { const p = view.position, dx = x - p.x, dy = y - p.y, dz = z - p.z, d2 = dx * dx + dy * dy + dz * dz; if (d2 > RANGE2) return;
    if (d2 > 64) { const e = view.matrixWorld.elements; const fx = -e[8], fy = -e[9], fz = -e[10]; if (dx * fx + dy * fy + dz * fz < -0.2 * Math.sqrt(d2)) return; } }
  bloomHot(sec);
}
