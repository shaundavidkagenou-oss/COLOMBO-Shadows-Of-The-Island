// 93rd: multi-core CPU — the worker pool (budget, priorities, cancel, failure → fallback, stats), the geometry workers' output
// against the main-thread build (every buffer of every streamed detail / window mesh, the records written onto buildings, the
// balcony / curtain anchors and counters), live streaming while driving fast with workers / without them (benchmark-style
// main-thread step times), live switching of the thread count, and the CPU diagnostics panel.
//   PORT=5199 node tools/cpu-workers-test.mjs   (needs the vite dev server)   env: STEPS (drive steps per run, 500), CHUNKS (7)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; };
const STEPS = +(process.env.STEPS || 600), NCH = +(process.env.CHUNKS || 7);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 2400000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errs = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errs.push(String(e.message || e)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource/.test(t)) errs.push(t.slice(0, 300)); if (/geometry worker|worker error/.test(t)) console.log('  page:', t.slice(0, 300)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'high', showFps: false, cpuWorkers: 2 })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  // ---------------------------------------------------------------- 1 · pool
  const A = await page.evaluate(async () => {
    const WP = await import('/src/core/WorkerPool.js'); const out = {};
    out.auto = [12, 8, 6, 4, 2, 1].map((h) => WP.autoWorkers(h)); out.hwc = WP.CPU.hwc; out.override = WP.CPU.override;
    const src = `import { workerMain } from '${location.origin}/src/core/WorkerPool.js';
      workerMain({ init(d) { self.tag = d.tag; }, sleep({ ms, v }) { const t = performance.now(); while (performance.now() - t < ms); return v; }, buf({ n }) { const a = new Float32Array(n).fill(2); return { res: a, transfer: [a.buffer] }; }, boom() { throw new Error('boom'); }, tag() { return self.tag; } });`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const P1 = new WP.WorkerPool('test1', () => new Worker(url, { type: 'module' }), { size: 1 }); const order = []; const a = P1.run('sleep', { ms: 150, v: 'a' }); // the one worker busy
    const q = [5, 1, 3].map((pr) => P1.run('sleep', { ms: 5, v: 'q' + pr }, { prio: pr }).then((v) => order.push(v)));
    const c = P1.run('sleep', { ms: 10, v: 'gone' }, { prio: 0 }); P1.cancel((d) => d && d.v === 'gone'); let cancelled = false; try { await c; } catch (e) { cancelled = !!e.cancelled; }
    await Promise.all([a, ...q]); out.order = order; out.cancelled = cancelled; P1.dispose();
    const P = new WP.WorkerPool('test', () => new Worker(url, { type: 'module' }), { size: 2, init: { tag: 'T1' } }); out.size = P.size;
    await Promise.all([P.run('sleep', { ms: 30, v: 1 }), P.run('sleep', { ms: 30, v: 2 }), P.run('sleep', { ms: 30, v: 3 }), P.run('sleep', { ms: 30, v: 4 })]);
    const r = await P.run('buf', { n: 1000 }); out.buf = [r.constructor.name, r.length, r[999]]; out.tag = await P.run('tag', {});
    let boom = null; try { await P.run('boom', {}); } catch (e) { boom = String(e.message).split('\n')[0]; } out.boom = boom;
    const s = P.stats(); out.stats = { done: s.done, failed: s.failed, cancelled: s.cancelled, per: s.per.length, busyOk: s.per.every((w) => w.busy >= 0 && w.busy <= 1), avg: Math.round(s.avgMs) };
    P.dispose(); let closed = null; try { await P.run('tag', {}); } catch (e) { closed = e.message; } out.closed = closed; out.left = WP.poolStats().map((p) => p.name);
    return out; });
  ok(JSON.stringify(A.auto) === '[4,4,3,1,0,0]', `adaptive budget for 12/8/6/4/2/1 hardware threads: ${A.auto} (this browser reports ${A.hwc}; setting override ${A.override})`);
  ok(A.size === 2, `pool spawns its size (${A.size})`);
  ok(JSON.stringify(A.order) === '["q1","q3","q5"]', `queued jobs run by priority: ${A.order}`);
  ok(A.cancelled, 'cancel() drops a queued job (caller sees cancelled)');
  ok(A.buf[0] === 'Float32Array' && A.buf[1] === 1000 && A.buf[2] === 2, `typed array returned by transfer: ${A.buf}`);
  ok(A.tag === 'T1', 'init message reaches each worker before its jobs');
  ok(A.boom === 'Error: boom' || /boom/.test(A.boom || ''), `a job error rejects (caller falls back): ${A.boom}`);
  ok(A.stats.done >= 6 && A.stats.failed === 1 && A.stats.per === 2 && A.stats.busyOk, `stats: ${JSON.stringify(A.stats)}`);
  ok(A.closed && !A.left.includes('test'), `dispose terminates and unregisters (${A.closed})`);
  // ---------------------------------------------------------------- 2 · geometry workers = main-thread build
  const B = await page.evaluate(async (NCH) => {
    const g = window.__game; g.noRender = true; const W = g.world; const { plan } = await import('/src/world/CityPlan.js'); const GJ = await import('/src/world/GeoJobs.js'); const BL = await import('/src/world/BalconyLife.js');
    // the bank's 2K texture workers (BankTex.js, loading time) hold threads of the same budget while they run: the geometry pool
    // is smaller meanwhile and grows back when they are done
    const BT = await import('/src/world/BankTex.js'); const g0 = GJ.geoPool(); const during = g0 ? g0.size : 0; const nTex = await BT.startBankTextures(); await new Promise((r) => setTimeout(r, 50));
    const out = { pool: !!GJ.geoPool(), size: GJ.geoPool() ? GJ.geoPool().size : 0, during, nTex, chunks: [] };
    const h32 = (a) => { let h = 2166136261 >>> 0; const u = a.BYTES_PER_ELEMENT === 2 ? new Uint16Array(a.buffer, a.byteOffset, a.length) : new Uint32Array(a.buffer, a.byteOffset, a.byteLength / 4); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return h.toString(36) + ':' + a.length + a.constructor.name[0]; };
    const hashGroup = (grp) => { const L = []; if (!grp) return L; for (const m of grp.children) { const G = m.geometry; const p = [m.name, m.type, m.material && (m.material.name || m.material.type), m.castShadow, m.receiveShadow, m.renderOrder];
        if (G) { for (const k of Object.keys(G.attributes).sort()) p.push(k + '=' + h32(G.attributes[k].array)); if (G.index) p.push('i=' + h32(G.index.array)); if (G.boundingSphere) p.push('r=' + G.boundingSphere.radius.toFixed(4)); }
        if (m._instanceInfo) p.push('inst=' + m._instanceInfo.length);
        if (m.isBatchedMesh) { const T = window.__THREE, bb = new T.Box3(), sp = new T.Sphere(), n = m._geometryInfo.length, F = new Float64Array(n * 10); // per-building bounds (the worker precomputes them)
          for (let gi = 0; gi < n; gi++) { m.getBoundingBoxAt(gi, bb); m.getBoundingSphereAt(gi, sp); F.set([bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, sp.center.x, sp.center.y, sp.center.z, sp.radius], gi * 10); }
          p.push('gb=' + h32(F)); p.push('gi=' + h32(Int32Array.from(m._geometryInfo.flatMap((q) => [q.vertexStart, q.vertexCount, q.reservedVertexCount, q.indexStart, q.indexCount, q.reservedIndexCount, q.start, q.count, q.active ? 1 : 0]))), 'nx=' + [m._nextVertexStart, m._nextIndexStart, m._maxVertexCount, m._maxIndexCount, m._geometryCount, m.instanceCount].join(',')); if (m.boundingSphere) p.push('bs=' + h32(new Float64Array([m.boundingSphere.radius, m.boundingSphere.center.x, m.boundingSphere.center.y, m.boundingSphere.center.z])));
          const cu = m.userData.cull; if (cu) { if (cu.bid) p.push('bid=' + h32(Int32Array.from(cu.bid))); if (cu.coarse) p.push('co=' + h32(Int32Array.from(cu.coarse, (x) => x ?? -9))); } }
        L.push(p.join('|')); } return L; };
    const recs = (bs) => JSON.stringify(bs.map((b) => [b._balcs, b._roofObs, b._signSpans, b.signIdx]));
    const anchors = (bs) => { const A = BL.takeAnchors(bs.map((b) => b.id)); BL.putAnchors(A); return JSON.stringify(A); };
    const byN = plan.byChunk.map((c, i) => [i, c.buildings.length]).filter((c) => c[1] > 0).sort((a, b) => b[1] - a[1]);
    const fortC = W.chunks.filter((c) => Math.abs(c.cx - (-140)) < 260 && Math.abs(c.cz - (-1000)) < 260).map((c) => c.idx); // Fort / Pettah
    const pick = [...new Set([...byN.slice(0, Math.max(1, NCH - 3)).map((c) => c[0]), ...fortC.slice(0, 1), byN[Math.floor(byN.length / 2)][0], byN[byN.length - 1][0]])].slice(0, NCH);
    for (const ci of pick) { const c = W.chunks.find((q) => q.idx === ci); const bs = plan.byChunk[ci].buildings; const R = { ci, n: bs.length };
      W.geoForget(c); if (c.win) W.disposeWindows(c); if (c.detail) W.disposeDetail(c);
      // detail: main thread, then worker
      let t = performance.now(); W.buildDetailFor(c); R.mainD = Math.round(performance.now() - t); const hm = hashGroup(c.detail), rm = recs(bs); W.disposeDetail(c);
      for (const b of bs) { delete b._balcs; delete b._signSpans; } // the worker must produce them itself
      t = performance.now(); const res = await GJ.submitGeo('detail', bs, () => 0); R.wD = Math.round(performance.now() - t); t = performance.now(); const J = GJ.jobFromWorker(c, 'detail', bs, res); J.sync = true; W.stepJob(J, Infinity); R.mergeD = Math.round(performance.now() - t);
      const hw = hashGroup(c.detail), rw = recs(bs); R.detMeshes = hm.length; R.detSame = JSON.stringify(hm) === JSON.stringify(hw); R.recSame = rm === rw; if (!R.detSame) R.detDiff = hm.filter((x, i) => x !== hw[i]).slice(0, 2).concat(hw.filter((x, i) => x !== hm[i]).slice(0, 2)).map((s) => s.slice(0, 160));
      // windows: main thread, then worker (anchors + counters too)
      let s0 = { ...BL.BALCONY_STATS }; t = performance.now(); W.buildWindowsFor(c); R.mainW = Math.round(performance.now() - t); const wm = hashGroup(c.win), am = anchors(bs); const sm = JSON.stringify(Object.keys(s0).map((k) => BL.BALCONY_STATS[k] - s0[k])); W.disposeWindows(c);
      s0 = { ...BL.BALCONY_STATS }; t = performance.now(); const res2 = await GJ.submitGeo('win', bs, () => 0); R.wW = Math.round(performance.now() - t); t = performance.now(); const J2 = GJ.jobFromWorker(c, 'win', bs, res2); J2.sync = true; W.stepJob(J2, Infinity); R.mergeW = Math.round(performance.now() - t);
      const ww = hashGroup(c.win), aw = anchors(bs), sw = JSON.stringify(Object.keys(s0).map((k) => BL.BALCONY_STATS[k] - s0[k]));
      R.winMeshes = wm.length; R.winSame = JSON.stringify(wm) === JSON.stringify(ww); R.anchSame = am === aw; R.nAnch = JSON.parse(am).reduce((s, e) => s + e[1].length, 0); R.statSame = sm === sw; R.stats = sw;
      if (!R.winSame) R.winDiff = wm.filter((x, i) => x !== ww[i]).slice(0, 2).concat(ww.filter((x, i) => x !== wm[i]).slice(0, 2)).map((s) => s.slice(0, 160));
      out.chunks.push(R); }
    return out; }, NCH);
  ok(B.pool && B.size === 2, `geometry pool up (${B.size} workers, setting 2; ${B.during} while the bank texture workers held their threads; ${B.nTex} bank textures built by the pool)`);
  for (const R of B.chunks) {
    ok(R.detSame && R.recSame, `chunk ${R.ci} (${R.n} bldgs) detail: ${R.detMeshes} meshes identical, building records identical · main ${R.mainD} ms vs worker ${R.wD} ms + merge ${R.mergeD} ms${R.detDiff ? ' DIFF ' + JSON.stringify(R.detDiff) : ''}`);
    ok(R.winSame && R.anchSame && R.statSame, `chunk ${R.ci} windows: ${R.winMeshes} meshes identical, ${R.nAnch} anchors identical, counters ${R.stats} · main ${R.mainW} ms vs worker ${R.wW} ms + merge ${R.mergeW} ms${R.winDiff ? ' DIFF ' + JSON.stringify(R.winDiff) : ''}`);
  }
  // ---------------------------------------------------------------- 3 · live streaming while driving fast: workers vs main thread
  const drive = (workers, steps, sw = null) => page.evaluate(async (workers, steps, sw) => {
    const g = window.__game; g.noRender = true; const W = g.world; const S = (await import('/src/core/Settings.js')).Settings; S.set('cpuWorkers', workers);
    const { buildRoute } = await import('/src/activities/RaceRoutes.js'); const Rt = buildRoute('fort'); const P = g.player;
    for (const c of W.chunks) { W.geoForget(c); if (c.win) W.disposeWindows(c); if (c.detail) W.disposeDetail(c); } W.job = null; W.wjob = null;
    const v = window.__drv || (window.__drv = new window.__Vehicle('vanta', 7, g.scene)); const i0 = Rt.startI; v.place(Rt.cx[i0], Rt.cz[i0], Rt.hd[i0]); if (P.vehicle !== v) { g.traffic.release(v, false); P.teleport(v.x + 2.2, v.z, 0); W.warm(v.x, v.z); P.enterVehicle(v, g.traffic); for (let i = 0; i < 300 && (P.vehicle !== v || P.entry); i++) await g.stepSim(1, 0.05); } else W.warm(v.x, v.z);
    const st0 = { ...(W.geoStats || {}) }; const T = []; let jobMax = 0, jobSum = 0, dispMax = 0, dispSum = 0; const sj = W.stepJob, gd = W.geoDispatch; W.stepJob = function (J, b) { const t = performance.now(); const r = sj.call(this, J, b); const d = performance.now() - t; jobSum += d; if (d > jobMax) jobMax = d; return r; };
    W.geoDispatch = function (...a) { const t = performance.now(); const r = gd.apply(this, a); const d = performance.now() - t; dispSum += d; if (d > dispMax) dispMax = d; return r; };
    const dd = (c) => Math.max(0, Math.hypot(c.cx - v.x, c.cz - v.z) - 200 * 0.7);
    const dt = 1 / 30, sp = 30; let idx = i0; const t0 = performance.now(); let switched = null;
    try { for (let s = 0; s < steps; s++) { if (sw && s === sw[0]) { S.set('cpuWorkers', sw[1]); switched = { at: s, to: sw[1] }; }
        idx = (idx + (sp * dt) / 2) % Rt.N; const i = Math.floor(idx); v.place(Rt.cx[i], Rt.cz[i], Rt.hd[i]); v.speed = sp; const t = performance.now(); g.updatePlay(dt); g.cullStep(dt); T.push(performance.now() - t); await new Promise((r) => setTimeout(r, 0)); }
      // settle at the end of the drive: the last chunks land (bounded)
      const missing = () => W.chunks.filter((c) => (!c.detail && dd(c) < W.detailRadius - 60) || (!c.win && dd(c) < W.windowRadius - 40)).length;
      for (let k = 0; k < 900 && (missing() || (W.geoPend && W.geoPend.size) || (W.geoReady && W.geoReady.detail.length + W.geoReady.win.length) || W.job || W.wjob); k++) { v.speed = 0; g.updatePlay(dt); await new Promise((r) => setTimeout(r, 5)); }
    } finally { W.stepJob = sj; W.geoDispatch = gd; }
    const wall = performance.now() - t0; const so = T.slice().sort((a, b) => a - b), q = (p) => so[Math.min(so.length - 1, Math.floor(so.length * p))];
    const missD = W.chunks.filter((c) => !c.detail && dd(c) < W.detailRadius - 60).length; const missW = W.chunks.filter((c) => !c.win && dd(c) < W.windowRadius - 40).length; const wr = W.windowRadius;
    const gs = W.geoStats || {}; const d = {}; for (const k of ['sent', 'merged', 'dropped', 'failed', 'fallback']) d[k] = (gs[k] || 0) - (st0[k] || 0);
    const pool = W.geoInfo().pool; const panel = g.cpuPanel ? null : new (await import('/src/ui/CpuPanel.js')).CpuPanel(g); const txt = (g.cpuPanel || panel).text();
    return { workers, steps, wr, wallS: +(wall / 1000).toFixed(1), mean: +(T.reduce((s, x) => s + x, 0) / T.length).toFixed(2), p50: +q(0.5).toFixed(2), p99: +q(0.99).toFixed(1), max: +so[so.length - 1].toFixed(1), over16: T.filter((x) => x > 16.67).length, over33: T.filter((x) => x > 33.3).length,
      jobMax: +jobMax.toFixed(1), jobMeanPerStep: +(jobSum / T.length).toFixed(2), dispatchMax: +dispMax.toFixed(1), dispatchMean: +(dispSum / T.length).toFixed(2), geo: d, poolSize: pool ? pool.size : 0, poolDone: pool ? pool.done : 0, missD, missW, switched, panelHasPool: /Pool geometry/.test(txt), panelLines: txt.split('\n').length, pend: W.geoPend ? W.geoPend.size : 0 }; }, workers, steps, sw);
  const D0 = await drive(0, STEPS); console.log('  workers 0:', JSON.stringify(D0));
  ok(D0.geo.sent === 0 && D0.poolSize === 0, `cpuWorkers 0: original main-thread streaming (sent ${D0.geo.sent}, pool ${D0.poolSize}; still missing after the drive + settle: detail ${D0.missD}, windows ${D0.missW})`);
  const D1 = await drive(1, STEPS); console.log('  workers 1:', JSON.stringify(D1));
  ok(D1.geo.merged > 3 && D1.geo.failed === 0 && D1.missD === 0 && D1.missW === 0, `driving at 30 m/s with 1 worker: ${D1.geo.sent} chunks sent, ${D1.geo.merged} merged, nothing missing`);
  const D2 = await drive(2, STEPS); console.log('  workers 2:', JSON.stringify(D2));
  ok(D2.geo.merged > 3 && D2.geo.failed === 0 && D2.geo.fallback === 0, `driving at 30 m/s with 2 workers: ${D2.geo.sent} chunks sent, ${D2.geo.merged} merged, ${D2.geo.dropped} dropped, 0 failed`);
  ok(D2.missD === 0 && D2.missW === 0, `nothing missing around the car after the drive (detail ${D2.missD}, windows ${D2.missW})`);
  ok(D2.pend === 0, 'no jobs left pending (no leaks)');
  ok(D2.panelHasPool && D2.panelLines >= 6, `CPU panel shows the geometry pool (${D2.panelLines} lines)`);
  ok(D1.jobMeanPerStep < D0.jobMeanPerStep, `streaming main-thread time per step: ${D0.jobMeanPerStep} ms (main thread) → ${D1.jobMeanPerStep} ms (1 worker) / ${D2.jobMeanPerStep} ms (2 workers); worst streaming slice ${D0.jobMax} → ${D1.jobMax} / ${D2.jobMax} ms`);
  const DS = await drive(2, Math.round(STEPS / 2), [Math.round(STEPS / 4), 0]); console.log('  switch 2→0:', JSON.stringify(DS));
  ok(DS.switched && DS.poolSize === 0 && DS.missD === 0 && DS.missW === 0 && DS.geo.failed === 0, `live switch 2 → 0 workers mid-drive: streaming carries on on the main thread (merged ${DS.geo.merged} from workers before the switch)`);
  ok(!errs.length, `no page errors${errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''}`);
} catch (e) { ok(false, 'test crashed: ' + (e && e.stack || e)); }
finally { await browser.close(); console.log(`\n${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0); }
