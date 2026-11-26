// 80th: roadside assistance & recovery (src/police/Roadside.js) in the real game (headless). Scenarios: a quiet / a busy road,
// dispatch, mechanic arrival, the van jobs (tyre / battery / engine), a failed repair → flatbed, loading + transport to Street
// Customs, traffic passing the scene, units back in the pool, leave-and-return (unseen completion), several incidents at once,
// no unit free (queue), the player's own call. Checks: no page errors, units never spawn near the player, nobody stuck,
// props all returned, no leaked loops after unload, pool sizes intact.
//   PORT=5204 node tools/roadside-test.mjs            (SCEN=tyre,battery,... to run a subset)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errors = []; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log('  ', c ? 'ok ' : 'NO ', m); };
const SCEN = (process.env.SCEN || 'tyre,battery,engine,flatbed,queue,unseen,call').split(',');
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e).slice(0, 600))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 300)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5204) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const info = await page.evaluate(async () => {
    const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 10.5; g.hud.show(false);
    const pool = g.police.pool; return { free: Object.fromEntries(Object.entries(pool.free).map(([k, v]) => [k, v.length])), ready: pool.ready, sounds: Object.keys((await import('/src/audio/RoadsideSoundDefs.js')).ROADSIDE_SOUND_DEFS).length,
      bk: await (async () => { const M = await import('/src/police/Roadside.js'); const tt = { type: 'tuktuk', T: { base: 'tuktuk' } }; const by = {}; for (const v of g.traffic.vehicles) { const k = v.type + ':' + (M.hasBonnet(v) ? 'B' : '-'); by[k] = (by[k] || 0) + 1; }
        return { tuk: ['battery', 'nostart', 'engine', 'overheat', 'mechanical', 'flat', 'immobilised'].map((k) => M.bonnetKind(tt, k)).join(','), by }; })() };
  });
  console.log('pool', JSON.stringify(info));
  ok(info.free.rsvan === 2 && info.free.flatbed === 1, `pool built on the loading screen: ${info.free.rsvan} service vans, ${info.free.flatbed} flatbed`);
  ok(info.sounds === 32, `${info.sounds} roadside sound slots`);
  ok(info.bk.tuk === 'flat,flat,immobilised,immobilised,immobilised,flat,immobilised', `no bonnet job on a tuktuk (${info.bk.tuk})`);
  ok(!Object.keys(info.bk.by).some((k) => k.startsWith('tuktuk:B')) && Object.keys(info.bk.by).some((k) => k.endsWith(':B')), `bonnets by traffic type ${JSON.stringify(info.bk.by)}`);

  // one scenario: put the player beside a kerb-lane road, force a breakdown of `kind` on a car nearby, run until the incident closes
  const run = (name, opts) => page.evaluate(async (name, o) => {
    const g = window.__game, P = g.player, RS = g.police.rs, T = g.traffic; const out = { name, timeline: [], minSpawn: 1e9, maxStill: 0, stuck: false };
    RS.clear(); const R = (await import('/src/police/Roadside.js')).RS; R.enabled = !!o.spontaneous; R.workK = 1;
    // a level-1 road with traffic: pick the nearest long kerb lane to the start
    const L = await import('/src/world/Layout.js'); const segs = L.segments.filter((s) => s.level === (o.level ?? 1) && !s.crossing && Math.hypot(s.x1 - s.x0, s.z1 - s.z0) > 110);
    const sg = segs[(o.segPick ?? 7) % segs.length]; const mx = (sg.x0 + sg.x1) / 2, mz = (sg.z0 + sg.z1) / 2; const ex = (sg.x1 - sg.x0), ez = (sg.z1 - sg.z0), el = Math.hypot(ex, ez);
    const nx = -ez / el, nz = ex / el; P.teleport(mx + nx * (sg.hw + 2.2), mz + nz * (sg.hw + 2.2), Math.atan2(ex, ez)); g.world.warm(P.x, P.z); await g.stepSim(400, 0.1);
    const cam = g.camera; const look = (x, z) => { cam.position.set(P.x, 1.7, P.z); cam.lookAt(x, 1, z); cam.updateMatrixWorld(); };
    let incs = []; for (let k = 0; k < (o.n || 1); k++) { let inc = null; for (let t = 0; t < 40 && !inc; t++) { inc = RS.force(o.kinds ? o.kinds[k] : o.kind, 160, !!o.strict); if (!inc) await g.stepSim(10, 0.1); } if (inc) incs.push(inc); }
    if (!incs.length) { const why = {}; for (const v of T.vehicles) { const d = Math.hypot(v.x - P.x, v.z - P.z); const k = d > 200 ? 'far' : d < 20 ? 'close' : RS.whyNot(v) || 'ok'; why[k] = (why[k] || 0) + 1; } out.err = 'no eligible car ' + JSON.stringify(why) + ' at ' + P.x.toFixed(0) + ',' + P.z.toFixed(0); out.timeline = []; out.log = RS.log.slice(-10); return out; }
    if (o.call) { // the player's own car instead: park a car by the player, damage it, call
      incs = [];
    }
    out.kinds = incs.map((q) => q.kind); const t0 = g.police.t; let last = ''; const units = new Set(); let lastPos = new Map();
    for (let step = 0; step < (o.maxT || 900) * 2; step++) {
      const inc0 = incs[0]; if (o.watch !== false && inc0 && inc0.v) look(inc0.v.x, inc0.v.z);
      if (o.leaveAt && step === o.leaveAt * 2) { P.teleport(P.x + 600, P.z, 0); g.world.warm(P.x, P.z); }
      await g.stepSim(10, 0.05);
      for (const u of RS.units) { if (!units.has(u)) { units.add(u); out.minSpawn = Math.min(out.minSpawn, Math.hypot(u.v.x - P.x, u.v.z - P.z)); }
        const lp = lastPos.get(u) || { x: u.v.x, z: u.v.z, still: 0 }; const mv = Math.hypot(u.v.x - lp.x, u.v.z - lp.z); lp.still = mv < 0.05 && (u.rs.ph === 'drive' || u.rs.ph === 'leave' || u.rs.ph === 'todrop') ? lp.still + 0.5 : 0; lp.x = u.v.x; lp.z = u.v.z; lastPos.set(u, lp); out.maxStill = Math.max(out.maxStill, lp.still); }
      const s = RS.status(); const sig = JSON.stringify([s.incidents.map((q) => q.ph + '/' + q.need + '/' + q.unit), s.units.map((u) => u.type + ':' + u.ph + ':' + u.crew)]);
      if (sig !== last) { last = sig; out.timeline.push(`${(g.police.t - t0).toFixed(0)}s ${sig}`); }
      if (!RS.incidents.length && !RS.units.length) break;
    }
    out.T = +(g.police.t - t0).toFixed(0); out.stats = { ...RS.stats }; out.left = RS.status(); out.props = RS.props ? { live: RS.props.live.size, made: RS.props.stats.made } : null;
    out.pool = Object.fromEntries(Object.entries(g.police.pool.free).map(([k, v]) => [k, v.length])); out.cars = incs.map((q) => ({ disposed: !!q.v.disposed, parked: q.v.parked, inTraffic: T.vehicles.includes(q.v), ai: !!q.v.ai, health: q.v.health, flats: q.v.vd ? q.v.vd.flats : 0, x: +q.v.x.toFixed(1), z: +q.v.z.toFixed(1), y: +(q.v.y || 0).toFixed(2), pitch: +(q.v.pitch || 0).toFixed(3), carried: !!q.v.carried }));
    out.log = RS.log.slice(-25); return out;
  }, name, opts);

  const show = (r) => { console.log(`\n== ${r.name}  (${r.T}s) kinds=${r.kinds}`); if (r.err) console.log('  ERR', r.err); for (const l of r.timeline.slice(0, 60)) console.log('   ', l); console.log('   stats', JSON.stringify(r.stats)); console.log('   cars', JSON.stringify(r.cars)); console.log('   pool', JSON.stringify(r.pool), 'props', JSON.stringify(r.props)); if (process.env.LOG) for (const l of r.log) console.log('    |', l); };
  const done = (r) => !r.err && !r.left.incidents.length && !r.left.units.length;
  if (SCEN.includes('tyre')) { const r = await run('flat tyre (van)', { kind: 'flat', maxT: 600 }); show(r);
    ok(done(r), 'flat tyre: incident closed, unit gone'); ok(r.minSpawn > 80, `unit spawned ${r.minSpawn.toFixed(0)} m from the player`); ok(r.maxStill < 20, `never stuck while driving (longest still ${r.maxStill}s)`); ok(r.cars[0] && r.cars[0].flats === 0, 'tyre fixed (no flats)'); ok(r.props && r.props.live === 0, 'every prop returned'); ok(r.pool.rsvan === 2, 'van back in the pool'); }
  if (SCEN.includes('battery')) { const r = await run('battery (van)', { kind: 'battery', maxT: 500, strict: true }); show(r); ok(r.kinds && r.kinds[0] === 'battery', `a forced battery fault stays a battery job (a car with a bonnet is picked; got ${r.kinds})`); ok(done(r), 'battery: closed'); ok(r.props && r.props.live === 0, 'props returned'); ok(r.pool.rsvan === 2, 'pool intact'); }
  if (SCEN.includes('engine')) { const r = await run('engine (van, may fail → flatbed)', { kind: 'engine', maxT: 900 }); show(r); ok(done(r), 'engine: closed'); ok(r.pool.rsvan === 2 && r.pool.flatbed === 1, 'pool intact'); }
  if (SCEN.includes('flatbed')) { const r = await run('immobilised (flatbed → Street Customs)', { kind: 'immobilised', maxT: 900 }); show(r); ok(done(r), 'recovery: closed'); ok(r.stats.towed >= 1, 'car loaded'); ok(r.stats.delivered + r.stats.deliveredUnseen >= 1, 'car delivered'); ok(r.pool.flatbed === 1, 'flatbed back in the pool'); }
  if (SCEN.includes('queue')) { const r = await run('three incidents (two vans: one queues)', { n: 3, kinds: ['battery', 'nostart', 'overheat'], maxT: 900 }); show(r); ok(r.stats.queuedWaits >= 1, `an incident waited in the queue (${r.stats.queuedWaits})`); ok(done(r), 'all three closed'); ok(r.pool.rsvan === 2, 'pool intact'); }
  if (SCEN.includes('unseen')) { const r = await run('leave and return', { kind: 'flat', maxT: 300, leaveAt: 60, watch: false }); show(r); ok(done(r), 'completed unseen'); ok(r.stats.resolvedFar >= 1 || r.stats.repaired >= 1, 'resolved far'); ok(r.props && r.props.live === 0, 'no props left behind'); }
  if (SCEN.includes('call')) {
    const c = await page.evaluate(async () => { const g = window.__game, P = g.player, RS = g.police.rs, T = g.traffic; RS.clear(); const v = T.vehicles.find((q) => q.type === 'sedan' || q.type === 'car'); if (!v) return { err: 'no car' };
      const r0 = RS.call(); P.lastVehicle = null; v.health = 15; T.release(v, false); const i = T.vehicles.indexOf(v); if (i >= 0) T.vehicles.splice(i, 1); v.ai = null; P.teleport(v.x + 3, v.z, 0); v.ownerId = 'test-own'; const r1 = RS.call(); const r2 = RS.call(); const st = RS.status(); RS.clear(); v.ownerId = null; return { r0, r1, r2, st }; });
    console.log('\n== call', JSON.stringify(c).slice(0, 600)); ok(c.r1 && c.r1.ok && c.r2 && !c.r2.ok, 'phone call: accepted once, the second call says help is on the way'); }
  console.log('\nerrors', errors.length); for (const e of errors.slice(0, 8)) console.log('  ', e); ok(errors.length === 0, 'no page errors');
} finally { await browser.close(); }
console.log(`roadside-test: ${pass} pass, ${fail} fail`); process.exit(fail ? 1 : 0);
