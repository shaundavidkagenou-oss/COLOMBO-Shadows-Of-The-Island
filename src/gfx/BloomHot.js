// Something bright enough to bloom by day (muzzle flash, flashing beacons) keeps the bloom pass on for a moment — see PostFX.
let hotUntil = 0;
export function bloomHot(sec = 0.4) { hotUntil = Math.max(hotUntil, performance.now() + sec * 1000); }
export function bloomIsHot() { return performance.now() < hotUntil; }
