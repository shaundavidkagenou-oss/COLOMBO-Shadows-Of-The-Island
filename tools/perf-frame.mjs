// Browser frame profile of the real game (headless Chromium): where each frame's main-thread time goes and what it submits.
//   node tools/perf-frame.mjs [quality] [frames] [scenario...]      PORT env = game dev-server port (default 5199)
//   scenario = name:x:z:hour[:drive]   e.g. galle:-392:700:11  fort:-300:-700:21  drive:-392:600:11:drive
// Per frame: sim (updatePlay), water reflection pass, sun/lamp shadow passes, main RenderPass, post passes, and the draw calls
// and triangles each pass submits; scene object counts; shader programs compiled while running (first-use hitches).
// SwiftShader rasterises on the CPU, so GPU time is NOT measured: before each frame the GPU queue is drained (gl.finish, timed
// separately) so the phase timings are the main thread's own work (three.js traversal/culling/sorting/uniforms + the sim).
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [Q = 'high', NF = '40', ...SC] = process.argv.slice(2);
const scen = (SC.length ? SC : ['galle:-392:700:11', 'galle-night:-392:700:21']).map((s) => { const [name, x, z, hour, drive] = s.split(':'); return { name, x: +x, z: +z, hour: +hour, drive: drive === 'drive' }; });
const W = +(process.env.W || 1280), H = +(process.env.H || 720); const T0 = Date.now(); const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, dumpio: !!process.env.DUMPIO,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errors.push(t); if (t.startsWith('[perf]')) console.log(t); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play' + (process.env.WARM ? '&warm=1' : ''), { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  log('game in play mode, JS heap ' + await page.evaluate(() => (performance.memory.usedJSHeapSize / 1048576).toFixed(0)) + ' MB');
  if (process.env.WRAPM) await page.evaluate(() => { window.__WRAPM = 1; });
  await page.evaluate(() => { // instrument once
    const g = window.__game, R = g.renderer, gl = R.getContext(); R.info.autoReset = false; const P = (window.__perf = { on: false, cur: null, frames: [] });
    const timeIt = (obj, name, key) => { const f = obj[name]; obj[name] = function (...a) { if (!P.on || !P.cur) return f.apply(this, a); const c0 = R.info.render.calls, t0 = R.info.render.triangles, s = performance.now(); try { return f.apply(this, a); } finally { const F = P.cur; F[key] = (F[key] || 0) + performance.now() - s; F[key + 'Calls'] = (F[key + 'Calls'] || 0) + R.info.render.calls - c0; F[key + 'Tris'] = (F[key + 'Tris'] || 0) + R.info.render.triangles - t0; } }; };
    timeIt(g, 'updatePlay', 'sim'); if (g.world.waterRefl) timeIt(g.world.waterRefl, 'update', 'refl'); timeIt(R.shadowMap, 'render', 'shadow'); timeIt(g.post, 'render', 'post');
    const rp = g.post.composer.passes[0]; timeIt(rp, 'render', 'main');
    P.subs = []; for (const k of Object.keys(g)) { const o = g[k]; if (!o || typeof o !== 'object' || o === g.renderer || o === g.scene) continue; for (const m of ['update', 'updateSeamless']) if (typeof o[m] === 'function') { timeIt(o, m, 'u.' + k + (m === 'update' ? '' : '.' + m)); P.subs.push('u.' + k + (m === 'update' ? '' : '.' + m)); } }
    for (const m of ['update', 'step']) if (g.player && typeof g.player[m] === 'function' && !P.subs.includes('u.player')) { timeIt(g.player, m, 'u.player'); P.subs.push('u.player'); }
    P.meth = {}; if (window.__WRAPM) for (const [tag, o] of [['T', g.traffic], ['C', g.crowd], ['W', g.world]]) { const proto = Object.getPrototypeOf(o); for (const n of Object.getOwnPropertyNames(proto)) { if (n === 'constructor' || n === 'update') continue; const d = Object.getOwnPropertyDescriptor(proto, n); if (!d || typeof d.value !== 'function') continue; const f = d.value; o[n] = function (...a) { if (!P.on) return f.apply(this, a); const s = performance.now(); try { return f.apply(this, a); } finally { const e = P.meth[tag + '.' + n] || (P.meth[tag + '.' + n] = { n: 0, t: 0, max: 0 }); const dt = performance.now() - s; e.n++; e.t += dt; if (dt > e.max) e.max = dt; } }; } }
    P.newProgs = []; const progs = R.info.programs; const push0 = progs.push.bind(progs); progs.push = function (...a) { if (P.on) for (const pr of a) P.newProgs.push(pr.name + ' ' + String(pr.cacheKey)); return push0(...a); };
    const loop0 = g.loop; g.loop = function () { if (!P.on) return loop0.call(this); const w = performance.now(); gl.finish(); const wait = performance.now() - w; const progs0 = R.info.programs.length;
      P.cur = { wait }; R.info.reset(); const s = performance.now(); loop0.call(this); P.cur.total = performance.now() - s; P.cur.progs = R.info.programs.length - progs0; P.frames.push(P.cur); P.cur = null; };
  });
  for (const S of scen) {
    await page.evaluate(async (S) => { const g = window.__game; g.world.warm(S.x, S.z); g.player.teleport(S.x, S.z, 0); g.atmos.hour = S.hour; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.atmos.wet = 0;
      if (S.drive) { g.debugCon.exec('spawn car sedan'); const v = g.traffic.parked[g.traffic.parked.length - 1]; if (v && g.player.enterVehicle) { try { g.player.enterVehicle(v, true); } catch (e) { console.log('[perf] enter failed', e.message); } } }
      await g.stepSim(60, 0.05); }, S);
    log(`${S.name}: placed`);
    await new Promise((r) => setTimeout(r, 4000)); // let the real loop warm (shader compiles of this view)
    let cdp = null; if (process.env.PROF) { cdp = await page.target().createCDPSession(); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
    if (process.env.GEOLOG) await page.evaluate(() => { // which geometries are new during the measured frames, and the bytes bufferData uploads
      const g = window.__game, gl = g.renderer.getContext(); const ids = new Set(); g.scene.traverse((o) => { if (o.geometry) ids.add(o.geometry.id); }); window.__geo0 = ids;
      const B = (window.__buf = { n: 0, bytes: 0, big: [] }); const bd = gl.bufferData.bind(gl); gl.bufferData = function (t, d, u) { if (window.__perf.on) { B.n++; const b = d && d.byteLength ? d.byteLength : (typeof d === 'number' ? d : 0); B.bytes += b; if (b > 200000 && B.big.length < 12) B.big.push([b, (new Error().stack || '').split('\n').slice(2, 9).map((l) => l.trim().replace(/\(.*\//, '(').slice(0, 70)).join(' < ')]); } return bd(t, d, u); }; });
    await page.evaluate(() => { window.__perf.frames = []; window.__perf.on = true; });
    const t0 = Date.now(); await page.waitForFunction((n) => window.__perf.frames.length >= n, { timeout: 1500000, polling: 500 }, +NF);
    if (process.env.GEOLOG) console.log('GEOLOG', JSON.stringify(await page.evaluate(() => { const g = window.__game, ids = window.__geo0; const fresh = {}; let nv = 0;
      g.scene.traverse((o) => { if (!o.geometry || ids.has(o.geometry.id)) return; const path = []; let q = o; while (q && q !== g.scene && path.length < 4) { path.push(q.name || q.type); q = q.parent; } const k = path.reverse().join('/'); const c = o.geometry.attributes.position ? o.geometry.attributes.position.count : 0; nv += c; fresh[k] = fresh[k] || [0, 0]; fresh[k][0]++; fresh[k][1] += c; });
      return { buf: window.__buf, newGeoms: Object.entries(fresh).sort((a, b) => b[1][1] - a[1][1]).slice(0, 25), newVerts: nv, frames: window.__perf.frames.length }; })));
    if (cdp) { // main-thread JS self time (the renderer's JavaScript runs on the user's CPU whatever the GPU)
      const { profile } = await cdp.send('Profiler.stop'); globalThis.__P = profile; const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map(); let tot = 0;
      profile.samples.forEach((sid, i) => { const d = profile.timeDeltas[i] || 0; const cf = byId.get(sid).callFrame; const k = `${cf.functionName || '(anon)'} ${(cf.url.split('/').pop() || '').replace(/-[A-Za-z0-9_]{8}\.js/, '.js')}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + d); tot += d; });
      console.log('PROFILE top self (% of sampled main-thread time, ' + (tot / 1e6).toFixed(1) + ' s):'); [...self].sort((a, b) => b[1] - a[1]).slice(0, +process.env.PROF > 1 ? +process.env.PROF : 40).forEach(([k, t]) => console.log('  ' + (100 * t / tot).toFixed(1).padStart(5) + '%  ' + k)); }
      if (cdp) { const byId = new Map(globalThis.__P.nodes.map((n) => [n.id, n])), tot = globalThis.__P.timeDeltas.reduce((x, y) => x + y, 0); const par = new Map(); for (const n of byId.values()) for (const c of n.children || []) par.set(c, n.id); const key = (n) => { const cf = n.callFrame; return `${cf.functionName || '(anon)'} ${(cf.url.split('/').pop() || '').replace(/-[A-Za-z0-9_]{8}\\.js/, '.js')}:${cf.lineNumber + 1}`; }; const inc = new Map();
        globalThis.__P.samples.forEach((sid, i) => { const d = globalThis.__P.timeDeltas[i] || 0; const seen = new Set(); let q = sid; while (q != null) { const k = key(byId.get(q)); if (!seen.has(k)) { seen.add(k); inc.set(k, (inc.get(k) || 0) + d); } q = par.get(q); } });
        console.log('PROFILE inclusive top'); [...inc].sort((a, b) => b[1] - a[1]).slice(0, +process.env.PROFI || 60).forEach(([k, t]) => console.log('  ' + (100 * t / tot).toFixed(1).padStart(5) + '%  ' + k)); }
    const out = await page.evaluate((S) => { const g = window.__game, P = window.__perf; P.on = false; const F = P.frames.splice(0);
      const keys = ['total', 'sim', 'refl', 'shadow', 'main', 'post', 'wait', ...P.subs]; const st = {};
      for (const k of keys) { const v = F.map((f) => f[k] || 0).sort((a, b) => a - b); if (k.startsWith('u.') && v[v.length - 1] < 0.5) continue; st[k] = { avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2), p95: +v[Math.floor(v.length * 0.95)].toFixed(2), max: +v[v.length - 1].toFixed(2) }; }
      const calls = {}; for (const k of ['refl', 'shadow', 'main', 'post']) { calls[k] = Math.round(F.reduce((a, f) => a + (f[k + 'Calls'] || 0), 0) / F.length); calls[k + 'Tris'] = Math.round(F.reduce((a, f) => a + (f[k + 'Tris'] || 0), 0) / F.length / 1000) + 'k'; }
      // the shadow pass runs inside main/refl: report main minus its shadow share separately
      let objs = 0, meshes = 0, vis = 0, skinned = 0, inst = 0, batched = 0, lights = 0, shLights = 0, autoMat = 0; g.scene.traverse((o) => { objs++; if (o.matrixAutoUpdate) autoMat++; if (o.isMesh) { meshes++; if (o.isSkinnedMesh) skinned++; if (o.isInstancedMesh) inst++; if (o.isBatchedMesh) batched++; } if (o.isLight) { lights++; if (o.castShadow && o.intensity > 0) shLights++; } });
      g.scene.traverseVisible((o) => { if (o.isMesh) vis++; });
      const cat = {}; const RL = g.renderer.renderLists.get(g.scene, 0); const owner = (o) => { let top = o, path = []; while (top.parent && top.parent !== g.scene) { path.push(top.name); top = top.parent; } if (o.isSkinnedMesh || (top.children && top.children.some((m) => m.isSkinnedMesh))) return 'person'; if (top.userData && (top.userData.vehicle || top.userData.lod || top.userData.wheels)) return 'vehicle:' + (o.name || '?'); return (top.name || top.type) + ':' + (o.isInstancedMesh ? 'inst' : o.isBatchedMesh ? 'batch' : (o.name || '?')); };
      for (const k of ['opaque', 'transmissive', 'transparent']) for (const it of RL[k] || []) { const c = owner(it.object); cat[c] = (cat[c] || 0) + 1; }
      const catTop = {}; for (const [c, n] of Object.entries(cat)) { const t = c.split(':')[0]; catTop[t] = (catTop[t] || 0) + n; }
      const meth = Object.entries(P.meth).sort((a, b) => b[1].t - a[1].t).slice(0, 25).map(([k, e]) => `${k} n${e.n} tot${e.t.toFixed(0)} max${e.max.toFixed(1)}`); P.meth = {};
      const R = g.renderer; return { meth, catTop, catDetail: Object.entries(cat).sort((a, b) => b[1] - a[1]).slice(0, 40), heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(0), scen: S.name, frames: F.length, st, calls, progsNew: F.reduce((a, f) => a + f.progs, 0), newProgs: P.newProgs.splice(0), programs: R.info.programs.length, geometries: R.info.memory.geometries, textures: R.info.memory.textures, scene: { objs, autoMat, meshes, visMeshes: vis, skinned, inst, batched, lights, shLights } }; }, S);
    const np = out.newProgs; out.newProgs = np.map((k) => k.slice(0, 60)); if (process.env.PROGS) (await import('fs')).writeFileSync(`${process.env.PROGS}-${S.name}.json`, JSON.stringify(np, null, 1));
    console.log(JSON.stringify(out)); console.log('  wall', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
} catch (e) { console.log('ERR', (e.stack || e.message).split('\n').slice(0, 4).join(' / ')); } finally { console.log('errors:', errors.length ? errors.slice(0, 6).join(' | ') : 'none'); await browser.close(); }
