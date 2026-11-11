// Phase 2 (cinematic grade / sun / light shafts) before-and-after captures of the actual game: production build, headless Chromium.
//   node tools/cine-ref.mjs [outDir=dev/ref] [tag=before] [quality=medium] [shots]       PORT, W, H, WAIT, CINE env
// shots: comma list of  pose@time  (one Chromium session for the whole list — keep lists short, SwiftShader is memory hungry)
//   poses  street  — Galle Road at the start area, eye height, looking north up the road (a parked car on the kerb)
//          fort    — the Fort street nearest the Clock Tower, raised camera, looking east at the facades (sun behind at 17:00)
//          palms   — a Galle Face / Kollupitiya coconut palm between the camera and the evening sun (looking west)
//          skyline — Galle Face Green looking east over the city towers and the Lotus Tower (sun behind)
//          wide    — the longest straight east–west road found near the coast, looking west down it into the low sun
//          sunup   — Galle Face Green facing the sun in open sky over the sea (sun disc / lens flare check)
//   times  morning 7.25 · midday 12.5 · golden 17.0 · night 21.5 · monsoon 15.0 + rain
// Poses are derived from the city plan at run time (deterministic), so every build is captured from the same camera.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'fs';
const [outDir = 'dev/ref', tag = 'before', Q = 'medium', SHOTS = 'street@golden'] = process.argv.slice(2);
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
fs.mkdirSync(outDir, { recursive: true });
const TIMES = { morning: [7.25, 'clear'], midday: [12.5, 'clear'], golden: [17.0, 'clear'], night: [21.5, 'clear'], monsoon: [15.0, 'rain'], dusk: [18.2, 'clear'] };
const errors = [];
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning' || m.type() === 'warn') && !/favicon|404|GPU stall|ReadPixels|WebGL-|swiftshader/i.test(m.text())) errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.noRender = true; g.hud.root.style.display = 'none'; g.story.state.wanted = 0; });
  // CINE=2|3: the High / Ultra cinematic level on top of the Medium preset (the full High preset does not fit SwiftShader's memory here)
  if (process.env.CINE) await page.evaluate((c) => { const g = window.__game; if (g.post.cine) { g.post.build({ bloom: true, ao: false, cine: c }); g.resize(); } }, +process.env.CINE);
  for (const shot of SHOTS.split(',')) {
    const [pose, time] = shot.split('@'); const [hour, weather] = TIMES[time] || TIMES.golden;
    const info = await page.evaluate(async (pose, hour, weather) => {
      const g = window.__game, L = window.__L, plan = g.world.plan; const road = (x, z) => !!L.roadAt(x, z);
      const sunAt = (h) => { const th = ((h - 6.15) / (18.3 - 6.15)) * Math.PI; const v = [Math.cos(th), Math.sin(th) * 0.97, 0.22]; const l = Math.hypot(...v); return v.map((c) => c / l); };
      let cam, look, at, car = null;
      const galle = () => { const z = 700; let x = -392; if (!road(x, z)) for (let k = 1; k < 40 && !road(x, z); k++) x += 1; let x0 = x, x1 = x; while (road(x0 - 0.5, z) && x0 > x - 40) x0 -= 0.5; while (road(x1 + 0.5, z) && x1 < x + 40) x1 += 0.5; return { x0, x1, z }; };
      if (pose === 'street' || pose === 'sunup') {
        const { x0, x1, z } = galle(), xc = (x0 + x1) / 2; cam = [xc - 1.5, 1.75, z + 18]; look = [xc + 1, 2.6, z - 60]; at = [x1 + 2.5, z + 22]; car = [x1 - 2.2, z - 2, 0];
        if (pose === 'sunup') { const t = (plan.trees || []).filter((t) => t.type === 'palm' && t.x < -400 && Math.abs(t.z + 500) < 3)[0]; const s = sunAt(hour), hl = Math.hypot(s[0], s[2]);
          cam = [t.x + 13, 1.7, t.z - 9]; look = [cam[0] + s[0] / hl * 40, cam[1] + 40 * Math.tan(Math.asin(Math.max(0, s[1]))) * 0.8, cam[2] + s[2] / hl * 40]; at = [cam[0] + 4, cam[2] - 3]; car = null; } // Galle Face: the sun in open sky over the sea
      } else if (pose === 'fort') {
        const cx = -385, cz = -880; let best = null; for (let dx = -60; dx <= 60; dx += 2) for (let dz = -60; dz <= 60; dz += 2) { const x = cx + dx, z = cz + dz; if (!road(x, z) || !road(x + 30, z) || L.zoneAt(x, z, 2)) continue; const d = dx * dx + dz * dz; if (!best || d < best.d) best = { x, z, d }; }
        if (!best) return { skip: 'no fort road' }; cam = [best.x - 6, 4.2, best.z + 3]; look = [best.x + 40, 7, best.z - 6]; at = [best.x - 6, best.z + 6];
      } else if (pose === 'palms' || pose === 'wide') {
        if (pose === 'palms') { // the Galle Face promenade palm row (coast side): a palm crown between the camera and the evening sun
          const t = (plan.trees || []).filter((t) => t.type === 'palm' && t.x < -400 && Math.abs(t.z + 500) < 3)[0] || (plan.trees || []).find((t) => t.type === 'palm' && t.x < -400); if (!t) return { skip: 'no palm' };
          const s = sunAt(17), hl = Math.hypot(s[0], s[2]); cam = [t.x - s[0] / hl * 24 - s[2] / hl * 2.2, 1.7, t.z - s[2] / hl * 24 + s[0] / hl * 2.2]; look = [t.x - 1.2, 8.2, t.z + 0.6]; /* sun just beside the crown */ at = [cam[0] + 4, cam[2] - 3]; }
        else { let best = null; for (let z = -600; z < 600; z += 2) { let run = 0, xs = -250; for (let x = -250; x > -560; x -= 2) { if (road(x, z) && road(x, z - 4) && road(x, z + 4)) run++; else break; xs = x; } if (!best || run > best.run) best = { z, run, xs }; }
          cam = [-252, 2.0, best.z]; look = [-312, 10.5, best.z + 7]; at = [-250, best.z + 6]; }
      } else if (pose === 'skyline') { cam = [-500, 3.2, -470]; look = [-200, 40, -520]; at = [-500, -462]; }
      else return { skip: 'unknown pose ' + pose };
      g.world.warm(cam[0], cam[2]); g.player.teleport(at[0], at[1], 0);
      g.atmos.hour = hour; g.atmos.forceWeather && g.atmos.forceWeather(weather); g.atmos.setWeather(weather, true); g.atmos.wet = weather === 'rain' ? 1 : 0; g.atmos.envTimer = 0;
      if (car && !window.__cineCar) { const V = window.__Vehicle; const v = new V('sedan', 4, g.scene); v.place(car[0], car[1], car[2]); g.traffic.release(v, false); v.speed = 0; window.__cineCar = v; }
      await g.stepSim(8, 0.05);
      g.player.camOverride = true; g.camera.position.set(...cam); g.camera.lookAt(...look); g.camera.updateMatrixWorld(); if (g.post) g.post.gradeSnap = true; g.noRender = false;
      const A = g.atmos; return { cam: cam.map((v) => +v.toFixed(1)), look: look.map((v) => +v.toFixed(1)), hour, weather, night: +A.night.toFixed(2), golden: +A.golden.toFixed(2), exp: +g.renderer.toneMappingExposure.toFixed(3), grade: g.post && g.post.gradeW ? g.post.gradeW.map((v) => +v.toFixed(2)) : null };
    }, pose, hour, weather);
    if (info.skip) { console.log('skip', shot, info.skip); continue; }
    await new Promise((r) => setTimeout(r, +(process.env.WAIT || 7000)));
    const extra = await page.evaluate(() => { const g = window.__game, p = g.post; let vis = null; try { if (p && p.cine && p.cine.visRT) { const b = new Uint16Array(4); g.renderer.readRenderTargetPixels(p.cine.visRT, 0, 0, 1, 1, b); vis = [...b].slice(0, 3).map((h) => +window.__THREE.DataUtils.fromHalfFloat(h).toFixed(3)); } } catch (e) { vis = String(e.message || e).slice(0, 60); }
      return p && p.cine ? { grade: p.gradeW && p.gradeW.map((v) => +v.toFixed(2)), sun: p.cine.sunInfo ? p.cine.sunInfo() : null, vis /* [visible·clear, depth-visible, cloud-clear] */ } : null; });
    if (process.env.DEBUG) console.log('probe', JSON.stringify(await page.evaluate(() => { // depth at the sun and down the centre column (debug)
      const g = window.__game, T = window.__THREE, C = g.post.cine, R = g.renderer; if (!C || !C.depthTex) return { depthTex: !!(C && C.depthTex) };
      const rt = new T.WebGLRenderTarget(8, 1, { type: T.FloatType, depthBuffer: false }); const sun = C.uniforms.uSun.value;
      const m = new T.ShaderMaterial({ uniforms: { tD: { value: C.depthTex }, uS: { value: new T.Vector2(sun.x, sun.y) } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D tD; uniform vec2 uS; varying vec2 vUv; void main(){ float i = floor(vUv.x * 8.0); vec2 uv = i < 1.0 ? uS : vec2(0.5, 1.0 - (i - 1.0) / 7.0 * 0.98 - 0.01); gl_FragColor = vec4(texture2D(tD, uv).x, uv, 1.0); }' });
      const q = new T.Mesh(new T.PlaneGeometry(2, 2), m); const sc = new T.Scene(); sc.add(q); const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const probe = () => { m.uniforms.tD.value = C.depthTex; const prev = R.getRenderTarget(), ac = R.autoClear; R.autoClear = true; R.setRenderTarget(rt); R.render(sc, cam); R.setRenderTarget(prev); R.autoClear = ac;
        const b = new Float32Array(32); R.readRenderTargetPixels(rt, 0, 0, 8, 1, b); const out = []; for (let i = 0; i < 8; i++) out.push([+b[i * 4].toExponential(3), +b[i * 4 + 1].toFixed(2), +b[i * 4 + 2].toFixed(2)]); return out; };
      const after = probe(); let during = null; let hdr = null; const cm = new T.ShaderMaterial({ uniforms: { tC: { value: null }, uS: { value: new T.Vector2(sun.x, sun.y) }, uR: { value: C.discR || 0.006 } }, vertexShader: m.vertexShader,
        fragmentShader: 'uniform sampler2D tC; uniform vec2 uS; uniform float uR; varying vec2 vUv; void main(){ float i = floor(vUv.x * 8.0); vec2 uv = clamp(uS + vec2(0.0, i * 0.06), 0.0, 1.0); gl_FragColor = vec4(texture2D(tC, uv).rgb, uv.y); }' }); const cq = new T.Mesh(new T.PlaneGeometry(2, 2), cm); const cs = new T.Scene(); cs.add(cq);
      const orig = C.render; C.render = function (...a) { if (!during) { during = probe(); cm.uniforms.tC.value = a[2].texture; const prev = R.getRenderTarget(); R.setRenderTarget(rt); R.render(cs, cam); R.setRenderTarget(prev); const b = new Float32Array(32); R.readRenderTargetPixels(rt, 0, 0, 8, 1, b); hdr = []; for (let i = 0; i < 8; i++) hdr.push([b[i * 4], b[i * 4 + 1], b[i * 4 + 2]].map((v) => +v.toFixed(2))); } return orig.apply(this, a); };
      return new Promise((res) => setTimeout(() => { C.render = orig; res({ hdrAtSunUpwards: hdr, skyPatched: g.atmos.sky.material.fragmentShader.includes('uDiscMode > 0.5'), disc: [g.atmos.sky.material.uniforms.uDiscMode?.value, g.atmos.sky.material.uniforms.uSunRad?.value, g.atmos.sky.material.uniforms.showSunDisc?.value, g.atmos.sky.material.uniforms.uSkyGain.value], rev: C.rev, reversed: R.state.buffers.depth.getReversed(), afterFrame: after, insidePass: during, dtType: C.depthTex.type, passes: g.post.composer.passes.map((p) => p.constructor.name + (p.enabled ? '' : '(off)')) }); }, 6000)); })));
    const name = `${tag}-${time}-${pose}`; await page.screenshot({ path: `${outDir}/${name}.png` });
    if (process.env.PERF) console.log('perf', name, JSON.stringify(await page.evaluate((N) => { // per-pass time of the composer, GPU queue drained around each pass (SwiftShader: a CPU-raster proxy for relative cost)
      const g = window.__game, R = g.renderer, gl = R.getContext(), C = g.post.composer; g.noRender = true; const acc = new Map(), orig = [];
      const label = (p, i) => { const u = p.uniforms || (p.material && p.material.uniforms) || (p.fsQuad && p.fsQuad.material && p.fsQuad.material.uniforms) || {}; const k = Object.keys(u); return i + ':' + (p.scene ? 'render' : u.tLUT ? 'cine' : u.tDiffuse && k.length <= 2 ? 'output' : k.slice(0, 2).join('/') || (p.cine !== undefined ? 'depthtap' : 'pass')); };
      C.passes.forEach((p, i) => { const f = p.render, l = label(p, i); orig.push([p, f]); p.render = function (...a) { gl.finish(); const s = performance.now(); const r = f.apply(this, a); gl.finish(); acc.set(l, (acc.get(l) || 0) + performance.now() - s); return r; }; });
      const tot = []; for (let i = 0; i < N + 2; i++) { if (i === 2) acc.clear(); gl.finish(); const s = performance.now(); g.post.render(1 / 60); gl.finish(); if (i >= 2) tot.push(performance.now() - s); }
      orig.forEach(([p, f]) => { p.render = f; }); tot.sort((a, b) => a - b);
      const out = { frames: N, postAvg: +(tot.reduce((a, b) => a + b, 0) / N).toFixed(1), postMed: +tot[N >> 1].toFixed(1), passes: {} }; for (const [k, v] of acc) if (C.passes[+k.split(':')[0]].enabled) out.passes[k] = +(v / N).toFixed(2);
      const c = g.post.cine; out.cine = c ? { level: c.level, vis: c.sunVis, rays: c.sunRays } : null; return out; }, +process.env.PERF)));
    await page.evaluate(() => { const g = window.__game; g.noRender = true; g.player.camOverride = false; });
    console.log('shot', name, JSON.stringify(info), extra ? JSON.stringify(extra) : '');
  }
} catch (e) { console.log('ERR', (e.stack || e.message).split('\n').slice(0, 3).join(' / ')); }
finally { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]); try { browser.process() && browser.process().kill('SIGKILL'); } catch (e) { /* gone */ } }
console.log('console errors / warnings:', errors.length ? errors.slice(0, 10).join(' | ') : 'none');
