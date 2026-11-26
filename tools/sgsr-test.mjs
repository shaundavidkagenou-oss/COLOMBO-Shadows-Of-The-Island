// 91st: Snapdragon Game Super Resolution in the game (src/gfx/PostFX.js · SGSR.js · Game.basePR / sgsrK / applyPR · Benchmark.js).
//   • Off: the pipeline is exactly as before (no SGSR pass, composer at canvas size, SMAA last).
//   • SGSR 100 / 90 / 85 / 80 %: the composer's targets and passes run at round(output × k) in width AND height, the SGSR pass is
//     the last pass and draws the canvas at the output size; the canvas, its CSS size and the HUD are unchanged; the renderer's
//     pixel ratio stays the output DPR. 150 %: the existing native supersampling (canvas at 1.5×, no SGSR pass).
//   • live switching (no reload) leaves no extra textures / targets behind; a window resize keeps internal = output × k.
//   • point sprites (three's PointsMaterial / the game's shaders) scale with internal ÷ output.
//   • colour: SGSR 100 % vs native — the same average colour, flat areas identical; SGSR 80 % keeps the average brightness.
//   • a lost + restored WebGL context stops drawing without errors and asks for a reload; the benchmark runs B and E and reports, then restores everything.
//   PORT=5199 node tools/sgsr-test.mjs   (needs the vite dev server; ~5–10 min with software rendering)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errs = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errs.push(String(e.message || e)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource/.test(t)) errs.push(t.slice(0, 300)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'medium', showFps: false, dynamicRes: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const R = await page.evaluate(async () => {
    const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null;
    const { Settings } = await import('/src/core/Settings.js'); const { RenderRes } = await import('/src/gfx/RenderRes.js'); const { GLOW_MAT } = await import('/src/world/Props.js');
    const R = g.renderer, P = g.post, cv = R.domElement, gl = R.getContext(); const out = {};
    const names = () => P.composer.passes.map((p) => p.constructor.name);
    const snap = () => { const C = P.composer; return { mode: Settings.get('upscale'), rt: [C.renderTarget1.width, C.renderTarget1.height], rt2: [C.renderTarget2.width, C.renderTarget2.height], canvas: [cv.width, cv.height], css: [cv.clientWidth, cv.clientHeight], pr: R.getPixelRatio(), last: names().slice(-1)[0], hasSGSR: names().includes('SGSRPass'), smaa: P.smaa ? [P.smaa._edgesRT.width, P.smaa._edgesRT.height] : null, cine: P.cine && P.cine.rtA ? [P.cine.rtA.width, P.cine.rtA.height] : null, k: +RenderRes.k.toFixed(4), glow: +GLOW_MAT.size.toFixed(3), res: P.resolution(), tex: R.info.memory.textures, hud: g.hud.root ? [g.hud.root.clientWidth, g.hud.root.clientHeight] : null }; };
    g.paused = true; const frames = (n) => { for (let i = 0; i < n; i++) g.frameStep(0.016); };
    const read = () => { frames(1); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return { w, h, px }; };
    // a fixed view over a street (trees, buildings, road)
    g.camera.position.set(-404, 7, 140); g.camera.lookAt(-400, 3, 100); g.camera.updateMatrixWorld();
    const hook = g.updatePlay; g.updatePlay = () => {}; // nothing moves the camera
    out.passes0 = names(); out.off0 = snap(); frames(3);
    const nat = read();
    for (const m of ['sgsr80', 'sgsr90', 'sgsr85', 'sgsr100', 'ss150', 'off']) { Settings.set('upscale', m); frames(2); out[m] = snap(); }
    out.passes80 = (Settings.set('upscale', 'sgsr80'), names()); frames(2);
    // live switching leaves nothing behind
    const t0 = R.info.memory.textures; for (let i = 0; i < 3; i++) for (const m of ['off', 'sgsr90', 'sgsr80', 'ss150', 'sgsr85', 'sgsr80']) { Settings.set('upscale', m); frames(1); } out.texCycle = [t0, R.info.memory.textures];
    // colour: SGSR 100 % vs native (same view, nothing moving)
    Settings.set('upscale', 'off'); frames(4); const a = read(); Settings.set('upscale', 'sgsr100'); frames(4); const b = read(); Settings.set('upscale', 'sgsr80'); frames(4); const c = read();
    const cmp = (x, y) => { const n = Math.min(x.px.length, y.px.length); let sx = [0, 0, 0], sy = [0, 0, 0], same = 0, cnt = 0; for (let i = 0; i < n; i += 4) { let mx = 0; for (let k = 0; k < 3; k++) { sx[k] += x.px[i + k]; sy[k] += y.px[i + k]; mx = Math.max(mx, Math.abs(x.px[i + k] - y.px[i + k])); } if (mx <= 2) same++; cnt++; } return { meanDiff: sx.map((v, k) => +((sy[k] - v) / cnt).toFixed(3)), same: +(same / cnt).toFixed(3), meanA: sx.map((v) => +(v / cnt).toFixed(1)) }; };
    out.colour100 = cmp(a, b); out.colour80 = cmp(a, c); out.natRepeat = cmp(nat, a); out.size80 = [c.w, c.h];
    // resize
    Settings.set('upscale', 'sgsr80'); out.beforeResize = snap(); g.updatePlay = hook; return out;
  });
  const S = (o) => JSON.stringify(o);
  console.log('passes off:', R.passes0.join(' > ')); console.log('passes 80:', R.passes80.join(' > '));
  for (const m of ['off0', 'sgsr80', 'sgsr90', 'sgsr85', 'sgsr100', 'ss150']) console.log(m, S(R[m]));
  ok(!R.off0.hasSGSR && R.off0.last === 'SMAAPass' && S(R.off0.rt) === S(R.off0.canvas) && R.off0.k === 1, `off: no SGSR pass, SMAA last, composer at the canvas size ${S(R.off0.rt)}`);
  const exp = { sgsr80: [512, 288], sgsr90: [576, 324], sgsr85: [544, 306], sgsr100: [640, 360] };
  for (const [m, e] of Object.entries(exp)) {
    const s = R[m]; ok(s.hasSGSR && s.last === 'SGSRPass', `${m}: the SGSR pass is the last pass`);
    ok(S(s.rt) === S(e) && S(s.rt2) === S(e) && S(s.smaa) === S(e), `${m}: composer targets and SMAA at ${S(e)} (got ${S(s.rt)} / ${S(s.rt2)} / ${S(s.smaa)})`);
    ok(S(s.canvas) === S(R.off.canvas) && S(s.css) === S(R.off.css) && S(s.hud) === S(R.off.hud) && s.pr === R.off.pr, `${m}: canvas ${S(s.canvas)}, CSS ${S(s.css)}, HUD and pixel ratio ${s.pr} unchanged`);
    ok(Math.abs(s.k - e[0] / 640) < 1e-3 && Math.abs(s.glow - 2.2 * e[0] / 640) < 1e-3, `${m}: point sprites scale by internal ÷ output (${s.k}; glow size ${s.glow})`);
    ok(S(s.res.internal) === S(e) && S(s.res.output) === S(R.off.canvas) && s.res.sgsr, `${m}: reported resolution ${S(s.res.internal)} → ${S(s.res.output)}`);
  }
  ok(!R.ss150.hasSGSR && S(R.ss150.canvas) === S([960, 540]) && S(R.ss150.rt) === S([960, 540]) && R.ss150.pr === 1.5 && R.ss150.k === 1, `150 %: the existing native supersampling (canvas and composer ${S(R.ss150.rt)}, pixel ratio ${R.ss150.pr}, no SGSR pass)`);
  ok(S(R.off.rt) === S(R.off0.rt) && S(R.off.canvas) === S(R.off0.canvas) && R.off.pr === R.off0.pr && !R.off.hasSGSR && R.off.last === 'SMAAPass' && R.off.k === 1, 'back to off: exactly as before');
  ok(R.texCycle[1] <= R.texCycle[0], `18 live switches leave no textures behind (${R.texCycle[0]} → ${R.texCycle[1]})`);
  console.log('colour', S(R.colour100), S(R.colour80), 'native repeat', S(R.natRepeat));
  ok(R.colour100.meanDiff.every((d) => Math.abs(d) < 0.6), `SGSR 100 % vs native: same average colour (Δ ${S(R.colour100.meanDiff)} /255 of ${S(R.colour100.meanA)})`);
  ok(R.colour100.same > 0.6, `SGSR 100 % vs native: ${(R.colour100.same * 100).toFixed(1)} % of pixels within 2/255 (only edges are sharpened)`);
  ok(R.colour80.meanDiff.every((d) => Math.abs(d) < 1.5), `SGSR 80 % vs native: average brightness / colour kept (Δ ${S(R.colour80.meanDiff)} /255)`);
  ok(S(R.size80) === S(R.off.canvas), `SGSR 80 %: the canvas is drawn at the full output size ${S(R.size80)}`);
  // resize the window: internal follows output × k
  await page.setViewport({ width: 800, height: 450 }); await new Promise((r) => setTimeout(r, 1500));
  const RS = await page.evaluate(() => { const g = window.__game; g.frameStep(0.016); const C = g.post.composer, cv = g.renderer.domElement; return { rt: [C.renderTarget1.width, C.renderTarget1.height], canvas: [cv.width, cv.height], res: g.post.resolution() }; });
  ok(S(RS.rt) === S([640, 360]) && S(RS.canvas) === S([800, 450]), `resize to 800 × 450: internal ${S(RS.rt)}, canvas ${S(RS.canvas)}`);
  // the benchmark (short): B and E
  const B = await page.evaluate(async () => {
    const g = window.__game; const { Settings } = await import('/src/core/Settings.js'); const { toCSV } = await import('/src/gfx/Benchmark.js');
    g.paused = false; const A = g.atmos; const before = { hour: A.hour, forced: A.forced, weather: A.weather, wet: A.wet, upscale: Settings.get('upscale'), autoReset: g.renderer.info.autoReset, rt: [g.post.composer.renderTarget1.width, g.post.composer.renderTarget1.height] };
    A.hour = 9.25; before.hour = 9.25; g.noRender = false; const t0 = performance.now();
    const rep = await g.runBenchmark({ seconds: 6, warmup: 2, configs: ['B', 'E'] }); g.noRender = true;
    const after = { hour: A.hour, forced: A.forced, weather: A.weather, wet: A.wet, upscale: Settings.get('upscale'), autoReset: g.renderer.info.autoReset, rt: [g.post.composer.renderTarget1.width, g.post.composer.renderTarget1.height], override: g.renderOverride || null, hook: !!g.benchHook, bench: !!g.bench, timer: !!g.post.timer, hud: g.hud.root ? g.hud.root.style.visibility : '' };
    const modal = [...document.querySelectorAll('.modal h2')].some((h) => h.textContent === 'Benchmark results'); document.querySelectorAll('.modal').forEach((m) => { if (m.querySelector('.bench-tab')) m.remove(); });
    return { rep, csv: rep ? toCSV(rep) : '', before, after, modal, sec: (performance.now() - t0) / 1000 };
  });
  const rr = B.rep ? B.rep.results : []; console.log('benchmark', B.sec.toFixed(0), 's', S(rr.map((r) => ({ id: r.id, int: r.internal, out: r.output, frames: r.frames, fps: r.avgFps, ms: r.avgFrameMs, med: r.medianFrameMs, low1: r.low1Fps, spikes: r.spikes, gpu: r.gpuFrameMs, sgsr: r.sgsrMs, calls: r.drawCalls, tris: r.triangles, note: r.gpuNote }))));
  ok(rr.length === 2 && rr[0].id === 'B' && rr[1].id === 'E', 'benchmark: B and E measured');
  ok(rr.length === 2 && S(rr[0].internal) === S(rr[0].output) && !rr[0].sgsr && S(rr[1].internal) === S([640, 360]) && S(rr[1].output) === S([800, 450]) && rr[1].sgsr, `benchmark: resolutions B ${rr[0] && S(rr[0].internal)} native, E ${rr[1] && S(rr[1].internal)} → ${rr[1] && S(rr[1].output)}`);
  ok(rr.every((r) => r.frames > 0 && r.avgFps > 0 && r.medianFrameMs > 0 && r.drawCalls > 0 && r.triangles > 0), 'benchmark: frame times, draw calls and triangles recorded');
  ok(rr.every((r) => (r.gpuFrameMs != null && r.gpuSamples > 0) || /unavailable|no GPU samples/.test(r.gpuNote || '')), `benchmark: GPU time measured or honestly reported unavailable (${rr[0] && (rr[0].gpuNote || rr[0].gpuFrameMs + ' ms')})`);
  ok(rr.every((r) => r.low1Fps === null ? /not reliable/.test(r.low1Note) : r.low1Fps > 0), 'benchmark: 1% low only when there are enough frames');
  ok(B.csv.split('\n').filter(Boolean).length === 3 && B.csv.startsWith('id,scenario,config,mode,internal,output'), 'benchmark: CSV with a header and one row per configuration');
  ok(B.modal, 'benchmark: the results window opens (JSON / CSV download buttons)');
  const a = B.after, b = B.before; ok(a.hour === b.hour && a.forced === b.forced && a.weather === b.weather && a.wet === b.wet && a.upscale === b.upscale && a.autoReset === b.autoReset && S(a.rt) === S(b.rt) && !a.override && !a.hook && !a.bench && !a.timer && a.hud !== 'hidden', `benchmark: everything restored afterwards (${S(a)})`);
  // context loss + restore (last: the game cannot rebuild its scene afterwards — its geometry's CPU copies are freed after upload —
  // so it stops drawing, autosaves and tells the player to reload; what matters is no exception storm and a clear message)
  const CL = await page.evaluate(async () => {
    const g = window.__game, R = g.renderer, gl = R.getContext(), ext = gl.getExtension('WEBGL_lose_context'); if (!ext) return { skipped: true };
    const notes = []; const nf = g.hud.notify.bind(g.hud); g.hud.notify = (t, ...r) => { notes.push(t); return nf(t, ...r); };
    ext.loseContext(); await new Promise((r) => setTimeout(r, 300)); g.frameStep(0.016); const lostFlag = !!g.ctxLost; ext.restoreContext(); await new Promise((r) => setTimeout(r, 800));
    for (let i = 0; i < 4; i++) g.frameStep(0.016);
    return { lostFlag, dead: !!g.ctxDead, lostNow: gl.isContextLost(), notes };
  });
  console.log('context', S(CL));
  ok(CL.skipped || (CL.lostFlag && CL.dead && !CL.lostNow && CL.notes.includes('Graphics device reset') && CL.notes.includes('Graphics device back')), `a lost + restored WebGL context: drawing stops, the player is told to reload (${CL.skipped ? 'skipped' : S(CL.notes)})`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
} finally { await browser.close(); }
console.log(`sgsr-test: ${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
