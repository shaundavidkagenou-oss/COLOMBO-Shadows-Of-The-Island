// LightSets check in the real game (headless Chromium): by day the dark night-light pool is out of the shaders and the frame
// is pixel-identical to the frame with the pool in; at dusk the pool comes back without compiling any shader program.
//   node tools/lightsets-check.mjs [quality=medium]     PORT env (default 5199)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'fs';
const Q = process.argv[2] || 'medium'; const W = 960, H = 540;
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`] });
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
try {
  const page = await browser.newPage(); await page.setViewport({ width: W, height: H });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.stack || e).slice(0, 300)));
  if (process.env.NODUSK) await page.evaluateOnNewDocument(() => { window.__noDusk = true; });
  await page.evaluateOnNewDocument((Q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: Q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play' + (process.env.NOWARM ? '' : '&warm=1'), { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const r = await page.evaluate(async () => {
    const g = window.__game, R = g.renderer, LS = window.__lightSets; const raf = () => new Promise((res) => requestAnimationFrame(res));
    g.player.teleport(-392, 700, 0); g.world.warm(-392, 700); g.atmos.hour = 11; await g.stepSim(40, 0.033);
    const pw0 = R.info.programs.length; const tw = performance.now(); for (let i = 0; i < 400 && performance.now() - tw < 240000; i++) await raf(); // real frames: new programs appear, the background warm (LightSets.maintainWarm) compiles their other light state
    await new Promise((res) => setTimeout(res, 20000)); for (let i = 0; i < 20; i++) await raf();
    // what the loading screen does (Game.enterLoading 'Waking the city'): every light level compiled is covered by the background
    // warm here (quick path); the spot shadow-depth programs by a warm frame with the dark spots aimed from the camera
    for (let i = 0; i < 4; i++) { g.camera.rotation.y += Math.PI / 2; g.camera.updateMatrixWorld(); g.warmLevelFrames(); }
    const lightsIn = () => { let n = 0, sp = 0; g.scene.traverseVisible((o) => { if (o.isLight) { n++; if (o.isSpotLight) sp++; } }); return { n, sp }; };
    const out = { auto: LS.nightSetOn(), countAuto: lightsIn(), warmProgs: R.info.programs.length - pw0 };
    g.paused = true; // freeze the simulation: two renders of the same world state
    const shot = () => { g.post.render(0); return R.domElement.toDataURL('image/png'); };
    LS.forceNightSet(false); await raf(); await raf(); out.dayLights = lightsIn(); const p0 = R.info.programs.length; const a = shot();
    const names0 = new Set(R.info.programs.map((q) => q.cacheKey)); LS.forceNightSet(true); await raf(); await raf(); out.nightLights = lightsIn(); const b = shot(); out.newProgsDayToFull = R.info.programs.length - p0; out.newProgNames = R.info.programs.filter((q) => !names0.has(q.cacheKey)).map((q) => q.name + ' :: ' + q.cacheKey.slice(0, 220));
    LS.forceNightSet(false); await raf(); const a2 = shot();
    out.a = a; out.b = b; out.a2 = a2;
    { const tr = () => { const t = performance.now(); g.post.render(0); R.getContext().finish(); return +(performance.now() - t).toFixed(1); }; const T = {}; // switch cost (CPU + SwiftShader raster), 2nd cycle
      for (let c = 0; c < 2; c++) { LS.forceNightSet(false); T.dayFirst = tr(); T.day = tr(); T.day2 = tr(); LS.forceNightSet(true); T.fullFirst = tr(); T.full = tr(); T.full2 = tr(); }
      LS.forceNightSet(false); out.switchMs = T; out.progsAfterCycles = R.info.programs.length - p0; }
    { const gl = R.getContext(), px = new Uint8Array(4); const fr = () => { const t = performance.now(); g.post.render(0); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t; };
      const avg = (on) => { LS.forceNightSet(on); fr(); fr(); let s = 0; const N = 6; for (let i = 0; i < N; i++) s += fr(); return +(s / N).toFixed(1); };
      out.rasterMs = { day: avg(false), full: avg(true), day2: avg(false), full2: avg(true) }; LS.forceNightSet(false); }
    // dusk: hand control back to the lights, run to 20:00 on real frames, watch for program compiles at the switch
    if (window.__noDusk) return out;
    LS.forceNightSet(null); g.paused = false; g.atmos.hour = 17.5; for (let i = 0; i < 30; i++) await raf(); // the hold expires on real frames
    const t0 = performance.now(); let tWait = 0; while (LS.nightSetOn() && performance.now() - t0 < 60000) { await raf(); tWait++; } out.daySwitchFrames = tWait; out.stateBeforeDusk = LS.nightSetOn();
    const nm1 = new Set(R.info.programs.map((q) => q.cacheKey));
    const p1 = R.info.programs.length; let worst = 0, sw = null, last = performance.now();
    for (let i = 0; i < 400 && !LS.nightSetOn(); i++) { g.atmos.hour += 0.02; await raf(); const now = performance.now(); if (LS.nightSetOn()) sw = { hour: +g.atmos.hour.toFixed(2), ms: +(now - last).toFixed(1) }; worst = Math.max(worst, now - last); last = now; }
    for (let i = 0; i < 20; i++) { await raf(); const now = performance.now(); worst = Math.max(worst, now - last); last = now; }
    out.duskNames = R.info.programs.filter((q) => !nm1.has(q.cacheKey)).map((q) => q.name + ' :: ' + q.cacheKey.slice(0, 260));
    out.dusk = { switched: LS.nightSetOn(), level: LS.lightLevel(), at: sw, newProgs: R.info.programs.length - p1, worstFrameMs: +worst.toFixed(1), lights: lightsIn() };
    return out;
  });
  const sharp = (await import('sharp')).default;
  const px = async (u) => (await sharp(Buffer.from(u.split(',')[1], 'base64')).raw().toBuffer());
  const A = await px(r.a), B = await px(r.b), A2 = await px(r.a2); let dAB = 0, mAB = 0, dAA = 0; for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - B[i]); dAB += d; if (d > mAB) mAB = d; dAA += Math.abs(A[i] - A2[i]); }
  fs.writeFileSync('/tmp/ls_day.png', Buffer.from(r.a.split(',')[1], 'base64'));
  console.log('NEW PROGRAMS at the forced switch:', JSON.stringify(r.newProgNames, null, 1)); console.log('NEW PROGRAMS at dusk:', JSON.stringify(r.duskNames, null, 1)); console.log(JSON.stringify({ rasterMs: r.rasterMs, switchMs: r.switchMs, progsAfterCycles: r.progsAfterCycles, warmProgs: r.warmProgs, auto: r.auto, countAuto: r.countAuto, day: r.dayLights, full: r.nightLights, newProgsDayToFull: r.newProgsDayToFull, dusk: r.dusk, stateBeforeDusk: r.stateBeforeDusk }));
  ok(r.dayLights.sp < r.nightLights.sp, `by day the dark pool is out of the shaders: ${r.nightLights.n} → ${r.dayLights.n} lights (${r.nightLights.sp} → ${r.dayLights.sp} spots)`);
  ok(mAB === 0, `day frame identical with / without the dark pool (sum |Δ| ${dAB}, max ${mAB}; same-state re-render sum |Δ| ${dAA})`);
  ok(r.newProgsDayToFull <= 2, `switching light state compiles at most a straggler program (${r.newProgsDayToFull} new; the background warm keys on materials, a material reused by a new object kind can slip through once)`);
  if (!process.env.NODUSK) {
  ok(r.stateBeforeDusk === false, 'after the hold, by day the pool is out on its own');
  ok(r.dusk.switched, `at dusk the pool comes back on its own (hour ${r.dusk.at && r.dusk.at.hour}, switch frame ${r.dusk.at && r.dusk.at.ms} ms)`);
  ok(r.dusk.level === 1 && r.dusk.lights.sp < r.nightLights.sp, `by night with no torch lit only the lamps + headlights are in (level ${r.dusk.level}, ${r.dusk.lights.sp} of ${r.nightLights.sp} spots)`);
  ok(r.dusk.newProgs === 0, `dusk switch compiles no program (${r.dusk.newProgs} new); worst frame ${r.dusk.worstFrameMs} ms`);
  }
  ok(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' | '));
} finally { await browser.close(); }
console.log(`lightsets-check: ${fail ? fail + ' FAILED' : 'all passed'}`); process.exit(fail ? 1 : 0);
