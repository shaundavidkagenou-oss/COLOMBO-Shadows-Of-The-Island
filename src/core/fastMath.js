// FPS: a non-allocating Math.hypot for the 2- and 3-argument calls the game makes (~700 call sites: distances every frame for
// every person and vehicle). V8's built-in Math.hypot is variadic and boxes its arguments/result: profiled at ~150 MB of garbage per
// 20 s of simulation (tools/perf-sim.mjs HPROF), which is GC work and GC pauses. Same result for every finite game-scale value
// (the built-in's overflow/underflow scaling only matters near 1e±154); any other arity falls back to the built-in.
const builtin = Math.hypot;
if (!builtin.__colombo) {
  const hypot = function hypot(a, b, c) { const n = arguments.length; if (n === 2) return Math.sqrt(a * a + b * b); if (n === 3) return Math.sqrt(a * a + b * b + c * c); return builtin.apply(Math, arguments); };
  hypot.__colombo = true; Math.hypot = hypot;
}
export {};
