// Police-arrival soak test in the real game (headless Chromium): raises the wanted level 1★ → 5★, gets the player spotted,
// and lets units dispatch, arrive, dismount, chase, shoot (4★+), set roadblocks and arrest / lose the player — on foot and in a
// car — with both the simulation (stepSim) and real rendered frames, recording every page error (with stack), the slowest
// simulation steps (hitches), JS heap growth and the police log.
//   node tools/police-soak.mjs [simSecondsPerStar=20]      PORT env = game server port (default 5199)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const SEC = +(process.argv[2] || 20); const T0 = Date.now(); const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--window-size=960,540'], defaultViewport: { width: 960, height: 540 } });
const errors = []; let failed = 0; let phasesOnly = null;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.stack || e.message || e).split('\n').slice(0, 6).join(' | ')));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|404/.test(t)) errors.push('console: ' + t.slice(0, 400)); if (t.startsWith('[soak]')) console.log(t); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'medium', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  log('in play mode, heap after gc ' + await page.evaluate(() => { window.gc && window.gc(); const g = window.__game; return Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB, geos ' + g.renderer.info.memory.geometries + ', tex ' + g.renderer.info.memory.textures; }));
  if (process.env.PHASES) phasesOnly = process.env.PHASES.split(',');
  await page.evaluate(() => { const g = window.__game; const S = (window.__soak = { worst: [], steps: 0, err: [], ph: {} });
    const up = g.updatePlay; g.updatePlay = function (dt) { const t = performance.now(); try { return up.call(this, dt); } catch (e) { S.err.push(String(e.stack || e).split('\n').slice(0, 6).join(' | ')); throw e; } finally { const ms = performance.now() - t; S.steps++; (S.ph[S.phase] ||= []).push(ms);
      if (S.worst.length < 12 || ms > S.worst[S.worst.length - 1].ms) { S.worst.push({ ms: +ms.toFixed(1), at: S.phase, stars: g.police.stars(), state: g.police.state, units: g.police.units.length }); S.worst.sort((a, b) => b.ms - a.ms); S.worst.length = Math.min(12, S.worst.length); } } }; });
  const phases = [];
  for (const drive of [false, true]) for (let star = 0; star <= 5; star++) phases.push({ drive, star });
  let lastDrive = null;
  for (const ph of phases) {
    if (phasesOnly && !phasesOnly.includes((ph.drive ? 'car' : 'foot') + ph.star)) continue;
    const name = `${ph.drive ? 'car' : 'foot'}-${ph.star}★`;
    let cdp = null; if (process.env.PROF === name.replace('-', '').replace('★', '')) { cdp = await page.target().createCDPSession(); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
    const r = await page.evaluate(async (ph, name, SEC, newRun) => { const g = window.__game, P = g.police, S = window.__soak; S.phase = name; const out = { name }; const progs0 = g.renderer.info.programs.length;
      try {
        if (newRun) { // fresh start for this run: clear wanted, place the player on Galle Road
          P.restore(0); await g.stepSim(40, 0.05); g.player.teleport(-392, 700, 0); g.world.warm(-392, 700); await g.stepSim(40, 0.05);
          if (ph.drive) { g.debugCon.exec('spawn car car'); let v = null, bd = 12; for (const q of g.traffic.parked) { const d = Math.hypot(q.x - g.player.x, q.z - g.player.z); if (d < bd) { bd = d; v = q; } } out.carFound = !!v; if (v) g.player.enterVehicle(v, g.traffic); for (let i = 0; i < 30 && g.player.entry; i++) await g.stepSim(5, 0.05); await g.stepSim(10, 0.05); out.inCar = !!g.player.vehicle; } }
        if (ph.star === 0) { g.debugCon.exec('nowanted on'); } else if (g.debugCon) g.debugCon.exec('nowanted off');
        if (ph.star > 0) { P.level = Math.max(P.level, ph.star - 0.2); P.addHeat(0.2, 'soak test'); if (P.state === 'patrol' || P.state === 'return') { P.incident = { x: g.player.x, z: g.player.z, t: P.t }; P.dispatch && P.dispatch(); } }
        const keys = ph.drive ? ['KeyW'] : ['KeyW', 'ShiftLeft'];
        for (let i = 0; i < SEC * 20; i += 20) { await g.stepSim(20, 0.05, i % 200 < 140 ? keys : []); if (ph.star >= 2 && i % 100 === 0 && P.units.some((u) => u.v && Math.hypot(u.v.x - g.player.x, u.v.z - g.player.z) < 120)) P.spotted(); if (ph.star > 0 && P.level < ph.star - 0.5) P.level = ph.star - 0.2; }
        const offs = P.units.reduce((a, u) => a + (u.officers ? u.officers.length : 0), 0);
        const A = (S.ph[name] || [0]).slice().sort((a, b) => a - b); out.stepMs = { avg: +(A.reduce((a, b) => a + b, 0) / A.length).toFixed(1), p95: +A[Math.floor(A.length * 0.95)].toFixed(1), max: +A[A.length - 1].toFixed(1) };
        out.newProgs = g.renderer.info.programs.length - progs0; Object.assign(out, { stars: P.stars(), state: P.state, units: P.units.length, officers: offs, busted: !!(g.busted || g.player.busted || g.mode !== 'play'), mode: g.mode, dead: !!g.player.dead, heap: (window.gc && window.gc(), Math.round(performance.memory.usedJSHeapSize / 1048576)), geos: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures, sceneObjs: (() => { let n = 0; g.scene.traverse(() => n++); return n; })(), log: P.log.slice(-2) });
      } catch (e) { out.threw = String(e.stack || e).split('\n').slice(0, 8).join(' | '); }
      return out; }, ph, name, SEC, ph.drive !== lastDrive);
    lastDrive = ph.drive;
    if (cdp) { const { profile } = await cdp.send('Profiler.stop'); const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map(), incl = new Map(); let tot = 0; const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const key = (n) => { const cf = n.callFrame; return `${cf.functionName || '(anon)'} ${(cf.url.split('/').pop() || '').replace(/-[A-Za-z0-9_]{8}\.js/, '.js')}:${cf.lineNumber + 1}`; };
      profile.samples.forEach((sid, i) => { const d = profile.timeDeltas[i] || 0; tot += d; const n = byId.get(sid); self.set(key(n), (self.get(key(n)) || 0) + d); const seen = new Set(); let q = sid; while (q != null) { const k = key(byId.get(q)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + d); } q = parent.get(q); } });
      console.log('PROFILE self top (' + (tot / 1e6).toFixed(1) + ' s)'); [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, t]) => console.log('  ' + (100 * t / tot).toFixed(1).padStart(5) + '%  ' + k));
      console.log('PROFILE inclusive top'); [...incl].sort((a, b) => b[1] - a[1]).slice(0, 45).forEach(([k, t]) => console.log('  ' + (100 * t / tot).toFixed(1).padStart(5) + '%  ' + k)); }
    log(JSON.stringify(r));
    if (r.threw) failed++;
    // a few real rendered frames with the police on screen (render-side errors, shader compiles of officers / units)
    const f0 = await page.evaluate(() => window.__game.frame || 0); const t = Date.now(); await new Promise((res) => setTimeout(res, 3000));
    const fr = await page.evaluate(() => ({ frame: window.__game.frame || 0, mode: window.__game.mode }));
    if (fr.mode !== 'play' && fr.mode !== 'busted' && fr.mode !== 'wasted') { log('mode changed to ' + fr.mode); }
    void f0; void t;
    // if busted / wasted, let the respawn run
    await page.evaluate(async () => { const g = window.__game; for (let i = 0; i < 12 && g.mode !== 'play'; i++) await new Promise((r) => setTimeout(r, 1000)); });
  }
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('NAVIGATED', f.url()); });
  for (const kind of (process.env.ARREST || '').split(',').filter(Boolean)) {
    let cdp = null; if (process.env.PROF === 'arrest') { cdp = await page.target().createCDPSession(); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
    const r = await page.evaluate(async (kind) => { const g = window.__game, P = g.police, S = window.__soak; S.phase = 'arrest-' + kind; const out = { kind };
      try { g.debugCon.exec('nowanted off'); P.level = Math.max(P.level, 2.8); P.addHeat(0.2, 'soak');
        let o = null; for (let i = 0; i < 400 && !o; i++) { await g.stepSim(5, 0.05); P.spotted(); o = P.foot.find((q) => q.mode === 'foot'); if (!o && i % 20 === 0) for (const u of P.units) if (u.v && u.task !== 'leave') { u.v.x = g.player.x + 8; u.v.z = g.player.z + 3; P.dismount && P.dismount(u, 'chase'); } }
        out.officer = !!o; const R = g.renderer; const progs = R.info.programs; const before = new Map(progs.map((pr) => [pr.name, pr.cacheKey])); const n0 = progs.length; window.__newProgs = [];
        const push0 = progs.push; progs.push = function (...a) { for (const pr of a) window.__newProgs.push(pr); return push0.apply(this, a); };
        const t0 = performance.now(); const pr = P.arrest(o, kind); out.syncMs = +(performance.now() - t0).toFixed(1); progs.push = push0; out.newPrograms = window.__newProgs.length;
        const diff = (a, b) => { if (!b) return 'no prior program of this name'; const A = a.split(','), B = b.split(','); const d = []; for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) d.push(i + ':' + A[i] + '≠' + B[i]); return d.slice(0, 8).join(' '); };
        out.progDiffs = window.__newProgs.slice(0, 14).map((pr) => pr.name + ' → ' + diff(pr.cacheKey, before.get(pr.name)));
        if (P.cine && P.cine.mugReady) { const tm = performance.now(); out.mug = await Promise.race([P.cine.mugReady, new Promise((r) => setTimeout(() => r('timeout'), 30000))]); out.mugMs = +(performance.now() - tm).toFixed(0); out.mugMean = P.cine.mugMean;
          const cv = P.cine.mug; if (cv && cv.getContext) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let op = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) op++; out.mugOpaque = +(op / (d.length / 4)).toFixed(3); window.__mugURL = cv.toDataURL('image/png'); } }
        const steps = []; for (let i = 0; i < 600 && P.busy; i++) { const t = performance.now(); await g.stepSim(1, 0.05); steps.push(performance.now() - t); }
        out.busyAfter = P.busy; out.seqSteps = steps.length; out.seqMax = +Math.max(0, ...steps).toFixed(1); out.seqAvg = +(steps.reduce((a, b) => a + b, 0) / Math.max(1, steps.length)).toFixed(1); out.mode = g.mode; out.log = P.log.slice(-3); void pr;
        out.heap = (window.gc && window.gc(), Math.round(performance.memory.usedJSHeapSize / 1048576));
      } catch (e) { out.threw = String(e.stack || e).split('\n').slice(0, 8).join(' | '); }
      return out; }, kind);
    log(JSON.stringify(r)); if (r.threw) failed++;
    if (process.env.MUGOUT) { const u = await page.evaluate(() => window.__mugURL || ''); if (u) { (await import('fs')).writeFileSync(process.env.MUGOUT, Buffer.from(u.split(',')[1], 'base64')); log('mugshot → ' + process.env.MUGOUT); } }
    if (cdp) { const { profile } = await cdp.send('Profiler.stop'); const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map(), incl = new Map(); let tot = 0; const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const key = (n) => { const cf = n.callFrame; return `${cf.functionName || '(anon)'} ${(cf.url.split('/').pop() || '').replace(/-[A-Za-z0-9_]{8}\.js/, '.js')}:${cf.lineNumber + 1}`; };
      profile.samples.forEach((sid, i) => { const d = profile.timeDeltas[i] || 0; tot += d; const n = byId.get(sid); self.set(key(n), (self.get(key(n)) || 0) + d); const seen = new Set(); let q = sid; while (q != null) { const k = key(byId.get(q)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + d); } q = parent.get(q); } });
      console.log('PROFILE self top (' + (tot / 1e6).toFixed(1) + ' s)'); [...self].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, t]) => console.log('  ' + (100 * t / tot).toFixed(1).padStart(5) + '%  ' + k));
      console.log('PROFILE inclusive top'); [...incl].sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, t]) => console.log('  ' + (100 * t / tot).toFixed(1).padStart(5) + '%  ' + k)); }
  }
  const S = await page.evaluate(() => ({ worst: window.__soak.worst, steps: window.__soak.steps, err: window.__soak.err, mode: window.__game.mode }));
  log(`sim steps ${S.steps}, final mode ${S.mode}`); console.log('slowest steps:', JSON.stringify(S.worst));
  for (const e of S.err) { console.log('SIM ERROR', e); failed++; }
} catch (e) { console.log('SOAK CRASH', String(e.stack || e).slice(0, 800)); failed++; }
const uniq = [...new Set(errors)]; for (const e of uniq.slice(0, 30)) console.log('ERROR', e); failed += uniq.length;
console.log(`police-soak: ${failed ? 'FAILED' : 'ok'} (${uniq.length} distinct page errors)`);
await browser.close(); process.exit(failed ? 1 : 0);
