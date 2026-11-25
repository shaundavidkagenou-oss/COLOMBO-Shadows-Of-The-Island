// 92nd: night activities — the ActivityManager (schedule, lifecycle, save, phone, blips, prompts), a fight night (venue,
// people built one per frame, bouts with hits / hit-stop / results, predictions with free points, the borrowed light pool,
// scatter on gunfire) and a street race (meet, join, grid, countdown, rival AI on the player's physics, checkpoints, laps,
// results, hand-back to traffic). The player's car is moved along the racing line by the test (it checks the race logic,
// not anyone's driving); the rivals drive themselves.
//   PORT=5199 node tools/activities-test.mjs   (needs the vite dev server)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 2400000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errs = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errs.push(String(e.message || e)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource/.test(t)) errs.push(t.slice(0, 300)); if (/\[activities\]/.test(t)) console.log('  page:', t.slice(0, 200)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  // ---------------------------------------------------------------- 1 · manager, schedule, phone
  const A = await page.evaluate(async () => {
    const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; const M = g.activities; const out = { has: !!M };
    if (!M) return out; g.atmos.hour = 22; g.atmos.setWeather?.('clear', true);
    out.sched = M.schedule(g.atmos.day).map((e) => [e.type, e.start % 24, e.end % 24]); out.sched2 = JSON.stringify(M.schedule(5)) === JSON.stringify(M.schedule(5));
    g.phone.toggle(true); g.phone.launch('afterdark'); await g.stepSim(1, 0.05); out.phoneRows = g.phone.rows().length; out.phoneHtml = /After Dark/.test(g.phone.screen.innerHTML); g.phone.toggle(false);
    await g.stepSim(2, 0.05); out.blips = g.hud.blips.filter((b) => b.kind === 'fight' || b.kind === 'race').map((b) => b.kind);
    out.routesCached = true; return out; });
  ok(A.has, 'ActivityManager exists on the game');
  ok(A.sched && A.sched.length === 2 && A.sched[0][0] === 'fight' && A.sched[1][0] === 'race', `nightly schedule: ${JSON.stringify(A.sched)}`);
  ok(A.sched2, 'the schedule is deterministic per day');
  ok(A.phoneRows >= 2 && A.phoneHtml, `After Dark app lists tonight (${A.phoneRows} rows)`);
  ok(A.blips && A.blips.includes('fight') && A.blips.includes('race'), `map blips for tonight: ${A.blips}`);
  // ---------------------------------------------------------------- 2 · fight night
  const F = await page.evaluate(async () => {
    const g = window.__game, M = g.activities, P = g.player, B = window.__BUILDS; const out = {};
    M.roundT = 16; const ev = M.force('fight', { venue: 'garage' }); const s = M.siteOf(ev); out.site = [s.x, s.z, !!s.unchecked];
    P.teleport(s.x + 10, s.z, -Math.PI / 2); g.world.warm(s.x, s.z); await g.stepSim(2, 0.05);
    let n = 0, maxPer = 0; let prev = 0; while ((!M.inst || !M.inst.ready) && n < 300) { await g.stepSim(1, 0.05); n++; const b = M.inst ? M.inst.stats.built : 0; maxPer = Math.max(maxPer, b - prev); prev = b; }
    const I = M.inst; out.readyFrames = n; out.maxBuiltPerFrame = maxPer; out.people = I ? I.people.length : 0; out.fans = I ? I.fans().length : 0; out.crowdWanted = M.crowdSize(); out.buildMs = I ? +I.stats.buildMs.toFixed(1) : 0;
    while (I && !I.bout && n < 600) { await g.stepSim(1, 0.05); n++; }
    out.intro = I.predictOpen(); const p0 = M.save.points; const pr0 = M.save.predictions || 0; await g.stepSim(3, 0.05); I.stats.stepMaxMs = 0; let slow = 0; const fms = []; const upd = I.update.bind(I); I.update = (dt) => { upd(dt); fms.push(I.stats.lastMs); }; P.teleport(s.x + 7, s.z, -Math.PI / 2); await g.stepSim(1, 0.05);
    const key = (a) => g.hud.key(a); out.prompt = M.interact(P, key) || ''; I.cyclePick(); out.pick = I.pick; out.staked = I.staked; out.pointsAfterStake = M.save.points; out.p0 = p0;
    // the bout to the end (watching min animK = hit-stop, the light pool)
    let minK = 1, pool = false, steps = 0, hsOthers = true; while (I.bout && I.bout.phase !== 'over' && steps < 9000) { await g.stepSim(5, 0.05); steps += 5; const Bt = I.bout; if (!Bt) break; minK = Math.min(minK, Bt.a.animK, Bt.b.animK); if (I.stats.lastMs > 30) slow++; if (Bt.a.animK < 1 && I.ref && (I.ref.animK ?? 1) < 1) hsOthers = false; pool = pool || !!g.interiors.walkIn.poolOn; }
    const R = I.bout && I.bout.result; out.result = R ? { winner: R.winner ? R.winner.f.name : null, how: R.how, round: R.round, cards: R.cards } : null; out.steps = steps; out.hits = I.stats.hits; out.downs = I.stats.downs; out.minAnimK = minK; out.hitStopLocal = hsOthers; out.pool = pool;
    await g.stepSim(2, 0.05); out.pointsAfter = M.save.points; out.predSettled = (M.save.predictions || 0) - pr0; fms.sort((a, b) => a - b); out.frames = fms.length; out.p50 = +fms[Math.floor(fms.length * 0.5)].toFixed(2); out.p99 = +fms[Math.floor(fms.length * 0.99)].toFixed(2); out.slowFrames = fms.filter((x) => x > 30).length; out.hitStops = I.bout.hitStops || 0; out.records = JSON.parse(JSON.stringify(M.save.fighters)); out.stepMax = +I.stats.stepMaxMs.toFixed(2); out.mgrMax = +M.stats.maxMs.toFixed(2); out.log = I.log.slice(-6);
    out.lights = g.scene.children.filter((o) => o.isLight).length; // never changes (the pool is lent, not added)
    // camera: T cycles ringside → overhead → off
    I.bout && (I.bout.phase === 'over') && (I.cardT = 99); await g.stepSim(3, 0.05); const c0 = g.camera.position.clone(); M.cycleCam(); await g.stepSim(10, 0.05); out.camOverride = P.camOverride; out.camMoved = +g.camera.position.distanceTo(c0).toFixed(2); M.cycleCam(); M.cycleCam(); await g.stepSim(1, 0.05); out.camBack = !P.camOverride;
    // save round trip
    const ser = M.serialize(); M.restore(ser); out.saveRT = JSON.stringify(M.serialize()) === JSON.stringify(ser);
    // gunfire nearby: the crowd scatters, the night is dropped
    const peds0 = g.crowd.peds.length; const ppl = M.inst ? M.inst.people.length : 0; if (!M.inst) { M.forced = []; M.force('fight', { venue: 'garage' }); for (let i = 0; i < 200 && (!M.inst || !M.inst.ready); i++) await g.stepSim(1, 0.05); }
    const ppl2 = M.inst ? M.inst.people.length : 0; g.crowd.alarm(s.x + 3, s.z, 40, 2); await g.stepSim(2, 0.05); out.scattered = !!(M.inst && M.inst.scattered) || !M.inst; out.adopted = g.crowd.peds.length - peds0; out.pplBefore = ppl2 || ppl;
    P.teleport(s.x + 400, s.z, 0); await g.stepSim(4, 0.05); out.dropped = !M.inst; M.forced = []; return out; });
  console.log('  fight:', JSON.stringify({ ...F, log: undefined }));
  console.log('  log:', (F.log || []).join(' | '));
  ok(!F.site[2], `venue found by the clear-yard search at ${F.site[0]}, ${F.site[1]}`);
  ok(F.maxBuiltPerFrame <= 1, `people built at most one per frame (max ${F.maxBuiltPerFrame}, ${F.readyFrames} frames, ${F.buildMs} ms total)`);
  ok(F.fans === F.crowdWanted && F.people >= F.fans + 3, `spectators ${F.fans}/${F.crowdWanted}, people ${F.people}`);
  ok(F.intro && /Predict/.test(F.prompt), `predictions open at the intro: "${F.prompt.slice(0, 90)}"`);
  ok(F.pick === 1 && F.staked === 10 && F.pointsAfterStake === F.p0 - 10, `prediction staked (${F.p0} → ${F.pointsAfterStake})`);
  ok(F.result && F.result.how, `bout finished: ${JSON.stringify(F.result)}`);
  ok(F.hits > 3, `clean hits landed (${F.hits}, downs ${F.downs})`);
  ok(F.hitStops > 0 && F.hitStopLocal, `localised hit-stop on heavy hits (${F.hitStops}; referee and crowd unaffected)`);
  ok(F.predSettled === 1 && (F.result.winner ? F.result.how !== 'Draw' : F.pointsAfter === F.p0), `prediction settled (${F.pointsAfter} points; a winner needs two cards)`);
  ok(Object.keys(F.records).length >= 2, `fighter records saved (${Object.keys(F.records).join(', ')})`);
  ok(F.pool, 'venue lamps lit through the borrowed WalkIn light pool');
  ok(F.camOverride && F.camMoved > 0.5 && F.camBack, `ringside camera (moved ${F.camMoved} m) and back to the player's`);
  ok(F.saveRT, 'activities save round trip');
  ok(F.scattered && F.adopted > 0, `gunfire scatters the crowd (${F.adopted} handed to the street crowd)`);
  ok(F.dropped, 'night cleaned up when the player leaves');
  ok(F.p99 < 15 && F.slowFrames <= 3, `ring frame time during the bout: p50 ${F.p50} / p99 ${F.p99} ms over ${F.frames} frames, ${F.slowFrames} over 30 ms (GC), max ${F.stepMax} ms (manager max ${F.mgrMax} ms incl. the one-per-frame builds; SwiftShader CPU — relative only)`);
  // ---------------------------------------------------------------- 3 · street race
  const S = await page.evaluate(async () => {
    const g = window.__game, M = g.activities, P = g.player; const out = {}; M.instant = true;
    const ev = M.force('race', { route: 'marine', diff: 'normal' }); const s = M.siteOf(ev); g.world.warm(s.x, s.z); P.teleport(s.x + 6, s.z, 0); await g.stepSim(2, 0.05);
    const v = new window.__Vehicle('praetor', 77, g.scene); v.place(s.x + 4, s.z, s.yaw); g.traffic.release(v, false); P.teleport(v.x + 2.2, v.z, 0); P.enterVehicle(v, g.traffic); for (let i = 0; i < 400 && (P.vehicle !== v || P.entry); i++) await g.stepSim(1, 0.05);
    out.inCar = P.vehicle === v; let n = 0; while ((!M.inst || !M.inst.ready) && n < 300) { await g.stepSim(1, 0.05); n++; } const I = M.inst; out.ready = !!(I && I.ready); out.rivals = I ? I.cars.length : 0;
    const k = I.kerb[Math.floor(I.kerb.length / 2)]; v.place(k.x - Math.sin(k.yaw) * 2, k.z - Math.cos(k.yaw) * 2, k.yaw); v.speed = 0; await g.stepSim(1, 0.05);
    const key = (a) => g.hud.key(a); out.prompt = M.interact(P, key) || ''; I.cycleDiff(); I.cycleDiff(); I.cycleDiff(); I.cycleDiff(); out.diff = I.diff; // a full turn: back to normal
    await I.join(); out.state = I.state; out.guests = g.traffic.guests.length; await g.stepSim(10, 0.05); out.heldCountdown = I.cars.every((c) => Math.abs(c.v.speed) < 0.5);
    for (let i = 0; i < 120 && I.state === 'countdown'; i++) await g.stepSim(1, 0.05); out.go = I.state === 'race';
    // the player's car follows the racing line at ~31 m/s (test driver); rivals drive on their own physics
    const R = I.R; let idx = I.me.idx; let steps = 0, cpSeen = 0; const sp = 31, dt = 0.05; let posMin = 99;
    while (I.state === 'race' && steps < 6000) { const adv = (sp * dt) / 2; idx = (idx + adv) % R.N; const i0 = Math.floor(idx), i1 = (i0 + 1) % R.N, f = idx - i0; const off = R.off[i0] * 0.8;
      const x = (R.cx[i0] + R.nx[i0] * off) * (1 - f) + (R.cx[i1] + R.nx[i1] * off) * f, z = (R.cz[i0] + R.nz[i0] * off) * (1 - f) + (R.cz[i1] + R.nz[i1] * off) * f; v.place(x, z, R.hd[i0]); v.speed = sp; if ((v.health ?? 1) < 0.5 && !out.lowHp) out.lowHp = { step: steps, health: v.health, burning: !!v.burning }; v.health = Math.max(v.health ?? 1, 0.9); // the test driver teleports along the line, so its knocks are not the race's business
      await g.stepSim(1, dt); if (P.vehicle !== v && !out.exited) out.exited = { step: steps, wrecked: !!v.wrecked, burning: !!v.burning, health: v.health }; steps++; cpSeen = Math.max(cpSeen, I.me.cp); if (I.pos) posMin = Math.min(posMin, I.pos); }
    out.steps = steps; out.cp = cpSeen; out.cpTotal = R.cps.length * R.laps; out.result = I.result; out.rivalStats = I.cars.map((c) => ({ t: c.v.type, prog: c.d ? +(c.d.prog / R.N).toFixed(2) : null, ...(c.d ? c.d.stats : {}) })); out.aiMs = +I.stats.aiMs.toFixed(2); out.stepMax = +I.stats.stepMaxMs.toFixed(2);
    out.rec = JSON.parse(JSON.stringify(M.save.races)); for (let i = 0; i < 200 && I.state === 'results'; i++) await g.stepSim(1, 0.05); out.after = I.state; out.guestsAfter = g.traffic.guests.length; out.adopted = g.traffic.vehicles.filter((x) => x.raceDriver === null).length;
    out.log = I.log.slice(-8); M.forced = []; M.instant = false; return out; });
  console.log('  race:', JSON.stringify({ ...S, log: undefined }));
  console.log('  log:', (S.log || []).join(' | '));
  ok(S.inCar && S.ready && S.rivals === 5, `meet ready with rivals (${S.rivals})`);
  ok(/Join/.test(S.prompt) && S.diff === 'normal', `join prompt at the meet: "${S.prompt.slice(0, 90)}"`);
  ok(S.guests >= S.rivals && S.heldCountdown && S.go, `grid, rivals held through the countdown, GO (${S.guests} guests)`);
  ok(S.cp === S.cpTotal, `checkpoints in order ${S.cp}/${S.cpTotal}`);
  ok(S.result && S.result.pos >= 1, `finished: P${S.result && S.result.pos} of ${S.result && S.result.field} in ${S.result && S.result.time && S.result.time.toFixed(1)} s`);
  ok(S.rivalStats.every((r) => r.prog === null || r.prog > 0.5), `rivals raced on their own physics: ${JSON.stringify(S.rivalStats.map((r) => [r.t, r.prog, r.recoveries]))}`);
  ok(S.rec['marine:normal'] && S.rec['marine:normal'].starts === 1, `race record saved ${JSON.stringify(S.rec)}`);
  ok(S.after === 'done' && S.guestsAfter === 0, `rivals handed back to traffic (guests ${S.guestsAfter})`);
  // ---------------------------------------------------------------- 4 · benchmark scenarios F and R (real activity code)
  for (const sc of ['fight', 'race']) {
    const BR = await page.evaluate(async (sc) => { const g = window.__game, P = g.player; if (P.vehicle) { const v = P.vehicle; v.speed = 0; v.mesh.remove(P.ch.root); g.scene.add(P.ch.root); v.player = false; P.vehicle = null; P.ch.anim.standUp(); g.traffic.release(v); P.respawnReset(); }
      const p0 = [P.x, P.z]; g.noRender = false; const t0 = performance.now(); const rep = await g.runBenchmark({ seconds: 5, warmup: 1, configs: ['B'], scene: sc }); g.noRender = true;
      return { ms: Math.round(performance.now() - t0), ok: !!rep, scene: rep && rep.scene, res: rep && rep.results.map((r) => ({ id: r.id, scenario: r.scenario, frames: r.frames, avgFps: r.avgFps, p99: r.p99FrameMs, calls: r.drawCalls, tris: r.triangles, gpu: r.gpuFrameMs, gpuNote: r.gpuNote })), back: Math.hypot(P.x - p0[0], P.z - p0[1]) < 1, visible: P.ch.root.visible, inst: !!g.activities.inst, forced: g.activities.forced.length, guests: g.traffic.guests.length, bench: !!g.bench }; }, sc);
    console.log(`  bench ${sc}:`, JSON.stringify(BR));
    ok(BR.ok && BR.res && BR.res[0] && BR.res[0].frames > 0 && BR.res[0].scenario === (sc === 'fight' ? 'F' : 'R'), `benchmark scenario ${sc === 'fight' ? 'F' : 'R'} ran (${BR.res && BR.res[0] && BR.res[0].frames} frames, ${BR.ms} ms; SwiftShader — relative only)`);
    ok(sc === 'fight' ? BR.scene.people > 5 : BR.scene.rivals >= 5 && BR.scene.rivalProgress.some((x) => x > 0.01), `scenario ${sc} measured the live activity: ${JSON.stringify(BR.scene)}`);
    ok(BR.back && BR.visible && !BR.inst && !BR.forced && !BR.guests && !BR.bench, `after scenario ${sc}: player back and visible, activity cleaned up (guests ${BR.guests})`);
  }
  ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(' | ')})`);
} catch (e) { console.error(e); fails++; } finally { await browser.close(); }
console.log(`\n${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
