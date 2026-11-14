// Checks for the Phase 2 grade (no browser): node tools/cine-lut-check.mjs
//  1. identity profile → the LUT reproduces its input exactly (indexing, slice layout, colour-space round trip)
//  2. per profile: black floor (not crushed / not milky), white level, monotonic grey ramp, grey cast at shadows / mids / highlights
//  3. profile weights over a whole day (clear and rain): always sum to 1, largest change per game minute (smooth transitions)
//  4. LUT build time
import { gradeColor, buildLUTData, PROFILES, PROFILE_ORDER, IDENTITY_PROFILE, profileWeights, LUT_N } from '../src/gfx/Cinematic.js';
const N = LUT_N;
// 1
{ const d = buildLUTData([IDENTITY_PROFILE]); let worst = 0;
  for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) { const i = (b * N * N + g * N + r) * 4; worst = Math.max(worst, Math.abs(d[i] - r / (N - 1)), Math.abs(d[i + 1] - g / (N - 1)), Math.abs(d[i + 2] - b / (N - 1))); }
  console.log(`identity LUT max error ${worst.toExponential(2)} ${worst < 1e-6 ? 'OK' : 'FAIL'}`); }
// 2
const f = (v) => v.map((x) => (x * 255).toFixed(1)).join('/');
for (const k of PROFILE_ORDER) {
  const P = PROFILES[k]; const blk = gradeColor(P, 0, 0, 0), wht = gradeColor(P, 1, 1, 1), lo = gradeColor(P, 0.02, 0.02, 0.02);
  let mono = true, prev = -1; for (let i = 0; i <= 255; i++) { const o = gradeColor(P, i / 255, i / 255, i / 255); const y = 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2]; if (y < prev - 1e-6) mono = false; prev = y; }
  const g20 = gradeColor(P, 0.2, 0.2, 0.2), g50 = gradeColor(P, 0.5, 0.5, 0.5), g85 = gradeColor(P, 0.85, 0.85, 0.85);
  const slope = (lo[1] - blk[1]) / 0.02;
  console.log(`${k.padEnd(8)} black ${f(blk)}  2%→ slope ${slope.toFixed(2)}  white ${f(wht)}  grey20 ${f(g20)}  grey50 ${f(g50)}  grey85 ${f(g85)}  monotonic ${mono ? 'yes' : 'NO'}`);
}
// 3
for (const dark of [0, 0.75]) {
  let maxStep = 0, at = 0, sumErr = 0; let prev = null;
  for (let m = 0; m < 24 * 60; m++) { const h = m / 60, th = ((h - 6.15) / (18.3 - 6.15)) * Math.PI; const v = [Math.cos(th), Math.sin(th) * 0.97, 0.22]; const y = v[1] / Math.hypot(...v);
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }; const night = 1 - ss(-0.12, 0.06, y);
    const w = profileWeights(y, h, night, dark); sumErr = Math.max(sumErr, Math.abs(w.reduce((a, b) => a + b, 0) - 1));
    if (prev) { const st = Math.max(...w.map((x, i) => Math.abs(x - prev[i]))); if (st > maxStep) { maxStep = st; at = h; } } prev = w; }
  const show = (h) => { const th = ((h - 6.15) / (18.3 - 6.15)) * Math.PI; const v = [Math.cos(th), Math.sin(th) * 0.97, 0.22]; const y = v[1] / Math.hypot(...v); const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }; return profileWeights(y, h, 1 - ss(-0.12, 0.06, y), dark).map((x) => x.toFixed(2)).join(' '); };
  console.log(`weights (dark ${dark}): sum error ${sumErr.toExponential(1)}, largest change per game minute ${maxStep.toFixed(4)} at ${at.toFixed(2)} h`);
  for (const h of [5.5, 6.5, 7.25, 8.5, 10, 12.5, 15.5, 16.25, 17, 18, 18.5, 19, 21.5]) console.log(`   ${String(h).padStart(5)} h  [morning midday golden night monsoon] ${show(h)}`);
}
// 4
{ const t = performance.now(); buildLUTData(); console.log(`LUT build (5 × 32³): ${(performance.now() - t).toFixed(0)} ms`); }
