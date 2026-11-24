// 66th request — police AI work spread over time instead of every frame.
//  THINK: each unit (car + crew) and each officer on foot makes its decisions — route re-plans, intercept role and aim,
//    target tracking, cover / foot-path searches — on its own timer (THINK.unit / THINK.officer s, 4× a second). The
//    timers start at a per-agent phase (golden-ratio spread on the id), so the force's decisions fall on different frames.
//    Movement is still integrated every frame (lane follower, intercept steering, foot steering, animation) toward the
//    latest decision, so nothing visibly steps.
//  SIGHT: line-of-sight checks (rays against the city colliders and vehicle boxes) go through one rotating queue: at most
//    SIGHT.perFrame "lookers" (a car crew or an officer on foot) per frame, the stalest first, each result cached and
//    refreshed no sooner than SIGHT.minAge. With the full 5★ force (8 cars) a crew's view is at most ~4 frames old.
export const THINK = { unit: 0.25, officer: 0.25 };
export const SIGHT = { perFrame: 2, minAge: 0.1 };

// a stable offset in [0, period) for agent id (consecutive ids land far apart)
export function phase(id, period) { const f = ((Number(id) || 0) * 0.6180339887498949) % 1; return (f < 0 ? f + 1 : f) * period; }

// advance agent a's think timer by dt. Returns 0 on frames it does not think, otherwise the time since its last decision
// (> 0: use it as that decision's dt so every timer / accumulator keeps real time). now = the shared clock: an agent's
// decision times are fixed slots of that clock (its phase), so agents created at different moments still spread out.
export function thinkTick(a, dt, period, id = a.id, now = 0) {
  if (a.thinkT === undefined) { a.thinkT = (((phase(id, period) - now) % period) + period) % period || period; a.thinkAcc = 0; }
  a.thinkAcc += dt; a.thinkT -= dt; if (a.thinkT > 0) return 0;
  a.thinkT += period; if (a.thinkT <= 0) a.thinkT = period; // (after a long frame / pause: no burst of catch-up decisions)
  const t = a.thinkAcc; a.thinkAcc = 0; return t || 1e-6;
}
// make agent a think on its next tick (an event that needs a decision now: dismount, arrival, shot at)
export function thinkNow(a) { a.thinkT = 0; }

// pick up to n lookers (with a .lookAt time) whose result is at least minAge old, stalest first — O(n·k), no sort, no garbage
export function pickStalest(list, now, n, minAge, out) {
  out.length = 0;
  for (let k = 0; k < n; k++) { let best = null, bt = Infinity;
    for (const x of list) { const t = x.lookAt ?? -Infinity; if (t < bt && now - t >= minAge && !out.includes(x)) { bt = t; best = x; } }
    if (!best) break; out.push(best); }
  return out;
}
