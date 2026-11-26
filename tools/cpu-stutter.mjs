// 93rd — stutter scenarios, original (0 CPU workers) vs upgraded (N workers): CPU frame times of the real game loop's simulation
// (Game.updatePlay, rendering off — headless SwiftShader cannot show GPU cost, and its GPU time would swamp the comparison).
// Each worker setting gets a fresh browser (same boot, same seeds, nothing streamed in advance). Worker answers arrive between
// steps (a macrotask turn per step), as they would between real frames. Numbers from this sandbox (2 CPU threads) are relative
// only: on a 6-core / 12-thread CPU the workers run on cores of their own.
//   WORKERS="0,2" STEPS=600 SC="drive,unloaded,busy,camera,veg,fight,race" PORT=5199 node tools/cpu-stutter.mjs
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const WORKERS = (process.env.WORKERS || '0,2').split(',').map(Number), STEPS = +(process.env.STEPS || 600), SCS = (process.env.SC || 'drive,unloaded,busy,camera,veg,fight,race').split(','), PORT = process.env.PORT || 5199, PROF = +(process.env.PROF || 0), MEM = !!process.env.MEM;
const out = {};
for (const wk of WORKERS) {
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 3600000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=640,360', ...(MEM ? ['--js-flags=--expose-gc'] : []), ...(process.env.TRACEGC ? ['--js-flags=--trace-gc'] : [])], dumpio: !!process.env.TRACEGC, defaultViewport: { width: 640, height: 360 } });
  try {
    const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    if (MEM) { const fs = await import('node:fs'); const pid = browser.process().pid; page.on('console', (m) => { const t = m.text(); if (!t.startsWith('memstep')) return; let rss = null; try { rss = Math.round(+fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1] / 1024); } catch (e) {} console.log(t, 'rssMB', rss); }); }
    await page.evaluateOnNewDocument((w) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'high', showFps: false, cpuWorkers: w })); }, wk);
    await page.goto(`http://localhost:${PORT}/?test&quick=play`, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
    // the loading-time bank texture workers hold threads of the same budget: let them finish first (both settings start equal)
    // and the loading screen's vehicle model warm-up (?test&quick=play skips the loading screen; a real game always runs it)
    await page.evaluate(async () => { const g = window.__game; await (await import('/src/world/BankTex.js')).startBankTextures(); await g.traffic.warmModels([[g.player.x, g.player.z]]); await g.stepSim(30, 1 / 30); });
    out[wk] = {};
    for (const sc of SCS) {
      const r = await page.evaluate(async (sc, STEPS, PROF, MEM) => {
        const g = window.__game, P = g.player, W = g.world; g.noRender = true; g.story.cancelAll?.(); g.story.running = null; const dt = 1 / 30;
        const tick = () => new Promise((res) => setTimeout(res, 0));
        const { buildRoute } = await import('/src/activities/RaceRoutes.js'); const { Settings } = await import('/src/core/Settings.js');
        const car = () => { if (P.vehicle) return P.vehicle; const v = new window.__Vehicle('vanta', 7, g.scene); v.place(P.x + 3, P.z, 0); g.traffic.release(v, false); P.enterVehicle(v, g.traffic); return v; };
        const settle = async () => { for (let i = 0; i < 200 && (P.entry || P.exitT); i++) { g.updatePlay(dt); await tick(); } };
        const onFoot = async () => { if (P.vehicle) { P.exitVehicle(g.traffic); for (let i = 0; i < 120 && P.vehicle; i++) { g.updatePlay(dt); await tick(); } } };
        const ft = []; let route = null, idx = 0, v = null, setup = null, spin = 0, walk = null, SC = null;
        if (sc === 'drive' || sc === 'unloaded' || sc === 'camera') { route = buildRoute(sc === 'unloaded' ? 'marine' : 'fort'); idx = route.startI;
          if (P.vehicle) v = P.vehicle; else { await onFoot(); P.teleport(route.cx[idx] + 3, route.cz[idx], 0); W.warm(route.cx[idx], route.cz[idx]); v = car(); await settle(); }
          if (sc === 'unloaded') { W.dropStreaming(); } // every sector unloaded: the drive streams all of it
          spin = sc === 'camera' ? 1 : 0; }
        // busy: on foot along the Fort & Pettah streets (the circuit's pavements) with crowd and traffic density at 150 %; veg: the
        // Viharamahadevi Park lawns around the fountain (rain trees, palms, bo trees, grass)
        if (sc === 'busy' || sc === 'veg') { await onFoot(); if (sc === 'busy') { route = buildRoute('fort'); idx = route.startI + 40; walk = 'route'; } else walk = 'park';
          const at = sc === 'busy' ? [route.cx[idx] + route.nx[idx] * (route.hw[idx] + 1.5), route.cz[idx] + route.nz[idx] * (route.hw[idx] + 1.5)] : [90 + 26, -60]; P.teleport(at[0], at[1], 0); W.warm(at[0], at[1]);
          if (sc === 'busy') { Settings.set('crowdDensity', 1.5); Settings.set('trafficDensity', 1.5); } for (let i = 0; i < 90; i++) { g.updatePlay(dt); await tick(); } spin = 1; }
        if (sc === 'fight' || sc === 'race') { await onFoot(); const B = await import('/src/gfx/BenchScenes.js'); SC = sc === 'fight' ? new B.FightScene(g) : new B.RaceScene(g, 'expert');
          await SC.setup(async () => { g.updatePlay(dt); await tick(); return dt; }, { set() {} }); await SC.reset(); }
        // PROF=1: what the slowest steps spent their time in (system updates of Game.updatePlay)
        const T = {}, T0 = {}; const unw = []; if (PROF) { const wrap = (o, k, tag) => { if (!o || !o[k]) return; const f = o[k]; o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { T[tag] = (T[tag] || 0) + performance.now() - t; } }; unw.push(() => { o[k] = f; }); };
          wrap(W, 'update', 'world'); wrap(W, 'stepJob', 'world.stepJob'); wrap(g.traffic, 'update', 'traffic'); wrap(g.traffic, 'updateParked', 'traffic.parked'); wrap(g.traffic, 'spawn', 'traffic.spawn'); wrap(g.crowd, 'update', 'crowd'); wrap(g.crowd, 'spawn', 'crowd.spawn'); wrap(g.atmos, 'update', 'atmos'); wrap(g.player, 'update', 'player'); wrap(g.activities, 'update', 'activities'); wrap(g, 'cullStep', 'cull'); wrap(g.hud, 'update', 'hud');
          const CB = await import('/src/gfx/CellBatch.js'), MB = await import('/src/gfx/MeshBuilder.js'), THREE = window.__THREE; wrap(CB.RangeBatch.prototype, 'step', ' rb.step'); wrap(CB.RangeBatch.prototype, 'adopt', ' rb.adopt'); wrap(MB.SliceBuild.prototype, 'step', ' slice.step'); wrap(W, 'rangeBatch', ' rb.new'); wrap(W, 'batchPlan', ' batchPlan'); wrap(W, 'markJob', ' markJob'); if (THREE) wrap(THREE.BatchedMesh.prototype, 'addGeometry', ' addGeometry'); wrap(W, 'revealStep', ' reveal'); wrap(W, 'finishDetail', ' finishD'); wrap(W, 'finishWindows', ' finishW');
          if (PROF > 1) for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(W))) if (typeof W[k] === 'function' && !['constructor', 'update', 'stepJob', 'rangeBatch', 'batchPlan', 'markJob', 'revealStep', 'finishDetail', 'finishWindows'].includes(k)) wrap(W, k, ' W.' + k);
          if (PROF > 1) { const t = performance.now(); for (let i = 0; i < 20; i++) new THREE.BatchedMesh(245, 300000, 600000, new THREE.MeshBasicMaterial()); T0.bmNew = +((performance.now() - t) / 20).toFixed(2); } }
        const slow = [];
        const pc0 = performance.now(); let peds = 0, cars = 0;
        for (let s = 0; s < STEPS; s++) {
          if (route && !walk) { const sp = 30; idx = (idx + (sp * dt) / 2) % route.N; const i = Math.floor(idx); v.place(route.cx[i], route.cz[i], route.hd[i]); v.speed = sp; }
          if (walk === 'route') { idx = (idx + (1.6 * dt) / 2) % route.N; const i = Math.floor(idx), o = route.hw[i] + 1.5; P.x = route.cx[i] + route.nx[i] * o; P.z = route.cz[i] + route.nz[i] * o; }
          if (walk === 'park') { const a = s * 0.0025; P.x = 90 + Math.cos(a) * 26; P.z = -60 + Math.sin(a) * 26; }
          if (spin) P.camYaw += 0.35; // rapid camera: ~600°/s
          if (SC && SC.id === 'R') { const I = g.activities.inst; if (I && I.cars.length) { let lead = I.cars[0]; for (const c of I.cars) if (c.d && lead.d && c.d.prog > lead.d.prog) lead = c; P.x = lead.v.x; P.z = lead.v.z; } }
          if (MEM && s % 50 === 0) { const i = W.geoInfo(); let det = 0, win = 0; for (const c of W.chunks) { if (c.detail) det++; if (c.win) win++; } console.log('memstep', sc, s, JSON.stringify({ sent: i.sent, merged: i.merged, pend: i.pending, ready: i.ready, merging: i.merging, det, win, job: W.job ? W.job.c.idx + (W.job.worker ? 'w' : 'm') : null, wjob: W.wjob ? W.wjob.c.idx + (W.wjob.worker ? 'w' : 'm') : null })); }
          for (const k in T) delete T[k]; const t = performance.now(); g.updatePlay(dt); const d = performance.now() - t; ft.push(d); if (PROF && d > 50) slow.push([Math.round(d), Object.entries(T).filter((e) => e[1] > 3).map(([k, x]) => k + ' ' + Math.round(x)).join(', ')]); await tick(); peds = Math.max(peds, g.crowd.peds.length); cars = Math.max(cars, g.traffic.vehicles.length);
        }
        for (const u of unw) u(); const wall = performance.now() - pc0; if (SC) { const info = SC.info(); SC.teardown(); SC.info_ = info; } if (sc === 'busy') { Settings.set('crowdDensity', 1); Settings.set('trafficDensity', 1); }
        const s = ft.slice().sort((a, b) => a - b), n = s.length, sum = ft.reduce((a, b) => a + b, 0), k = Math.max(1, Math.floor(n * 0.01)); let worst = 0; for (let i = n - k; i < n; i++) worst += s[i];
        const gi = W.geoInfo ? W.geoInfo() : {}; let mem;
        if (MEM) { for (let i = 0; i < 3; i++) { window.gc?.(); await new Promise((r) => setTimeout(r, 200)); } const pm = performance.memory || {}; let det = 0, win = 0; for (const c of W.chunks) { if (c.detail) det++; if (c.win) win++; }
          mem = { heapMB: Math.round((pm.usedJSHeapSize || 0) / 1048576), totalMB: Math.round((pm.totalJSHeapSize || 0) / 1048576), det, win, ready: gi.ready, pend: gi.pending, reveal: W.revealQ.length, peds: g.crowd.peds.length, cars: g.traffic.vehicles.length, parked: g.traffic.parked.length, scene: g.scene.children.length }; }
        return { sc, steps: n, meanMs: +(sum / n).toFixed(2), p50: +s[Math.floor(n * 0.5)].toFixed(1), p99: +s[Math.floor(n * 0.99)].toFixed(1), max: +s[n - 1].toFixed(1),
          over16: ft.filter((x) => x > 16.67).length, over33: ft.filter((x) => x > 33.4).length, simFps: +(1000 / (sum / n)).toFixed(1), low1Fps: +(1000 / (worst / k)).toFixed(1), wallS: +(wall / 1000).toFixed(1),
          peds, cars, rivals: SC && SC.info_ ? SC.info_.rivals ?? SC.info_.people : undefined, geo: { sent: gi.sent || 0, merged: gi.merged || 0, failed: gi.failed || 0, pool: gi.pool ? gi.pool.size : 0 }, ...(MEM ? { mem } : {}), ...(PROF ? { T0, slowest: slow.sort((a, b) => b[0] - a[0]).slice(0, 10) } : {}) };
      }, sc, STEPS, PROF, MEM);
      if (MEM) { try { const fs = await import('node:fs'); const pid = browser.process().pid; const st = fs.readFileSync(`/proc/${pid}/status`, 'utf8'); r.mem.rssMB = Math.round(+st.match(/VmRSS:\s+(\d+)/)[1] / 1024); } catch (e) { r.mem.rssMB = null; } }
      out[wk][sc] = r; console.log(`workers ${wk} · ${JSON.stringify(r)}`);
    }
    console.log(`workers ${wk} · page errors: ${errs.length}${errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''}`);
  } finally { await browser.close(); }
}
// side-by-side
console.log('\nscenario     workers  mean ms   p50   p99    max  >16.7  >33.3  sim fps  1% low  streamed');
for (const sc of SCS) for (const wk of WORKERS) { const r = out[wk] && out[wk][sc]; if (!r) continue;
  console.log(`${sc.padEnd(12)} ${String(wk).padStart(7)} ${String(r.meanMs).padStart(8)} ${String(r.p50).padStart(5)} ${String(r.p99).padStart(5)} ${String(r.max).padStart(6)} ${String(r.over16).padStart(6)} ${String(r.over33).padStart(6)} ${String(r.simFps).padStart(8)} ${String(r.low1Fps).padStart(7)}  ${r.geo.merged}/${r.geo.sent}`); }
