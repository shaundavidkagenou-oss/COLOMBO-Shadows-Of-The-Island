// CPU profile of the main-thread systems while driving fast along a route (noRender: CPU only)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
try { const page = await browser.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false, cpuWorkers: 2 })); }, process.env.Q || 'high');
  await page.goto('http://localhost:5199/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const R = await page.evaluate(async (ROUTE, STEPS) => { const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 17;
    const T = {}; const wrap = (obj, name, label) => { const f = obj[name]; if (!f) return; obj[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); const d = performance.now() - t; const s = T[label] || (T[label] = { n: 0, sum: 0, max: 0 }); s.n++; s.sum += d; if (d > s.max) s.max = d; return r; }; };
    const W = g.world; wrap(W, 'update', 'world.update'); wrap(W, 'stepJob', ' world.stepJob'); wrap(W, 'repackProps', ' world.repackProps'); wrap(W, 'revealStep', ' world.revealStep'); if (W.grass) wrap(W.grass, 'update', ' grass'); if (W.forest) wrap(W.forest, 'update', ' forest'); if (W.grassGPU) wrap(W.grassGPU, 'update', ' grassGPU'); if (W.groundDetail) wrap(W.groundDetail, 'update', ' groundDetail');
    wrap(g.traffic, 'update', 'traffic.update'); wrap(g.crowd, 'update', 'crowd.update'); wrap(g.player, 'update', 'player.update'); wrap(g.atmos, 'update', 'atmos.update'); wrap(g.trains, 'update', 'trains.update'); wrap(g.police, 'update', 'police.update'); if (g.cityEvents) wrap(g.cityEvents, 'update', 'cityEvents.update'); if (g.activities) wrap(g.activities, 'update', 'activities.update');
    wrap(g.hud, 'update', 'hud.update'); wrap(g.story, 'update', 'story.update'); wrap(g, 'updateSight', 'updateSight'); wrap(g.interiors, 'updateSeamless', 'interiors.seamless'); if (g.hospital) wrap(g.hospital, 'update', 'hospital.update'); wrap(g.vdamage, 'update', 'vdamage'); wrap(g.squad, 'update', 'squad');
    wrap(g, 'cullStep', 'cullStep'); 
    // crowd internals
    for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(g.crowd))) if (/route|path|plan|spawn|find|nearest|graph/i.test(k) && typeof g.crowd[k] === 'function') wrap(g.crowd, k, ' crowd.' + k);
    for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(g.traffic))) if (/route|path|plan|spawn|find|nearest|lane|decide|gap|bin/i.test(k) && typeof g.traffic[k] === 'function') wrap(g.traffic, k, ' traffic.' + k);
    for (const k of ['step', 'updateOccupants', 'updateParked', 'updateArrivals', 'stepFree', 'updateDisembark']) wrap(g.traffic, k, ' traffic.' + k);
    { const VP = window.__Vehicle.prototype; for (const k of ['drive', 'update', 'animate', 'updateWheels', 'updateLights']) if (VP[k]) wrap(VP, k, '  Vehicle.' + k); }
    { const pd = g.crowd.peds.find((p) => p.ch && p.ch.anim); if (pd) { const AP = Object.getPrototypeOf(pd.ch.anim); wrap(AP, 'update', '  anim.update(all)'); const CP = Object.getPrototypeOf(pd.ch); for (const k of ['update', 'lod', 'setLOD']) if (CP[k]) wrap(CP, k, '  Character.' + k); } }
    for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(g.crowd))) if (/^(step|stepPed|move|avoid|steer|think|updatePed|walk|lod|separate|collide|cross|look|react)/i.test(k) && typeof g.crowd[k] === 'function') wrap(g.crowd, k, ' crowd.' + k);
    wrap(g, 'updatePlay', 'TOTAL updatePlay');
    const { buildRoute } = await import('/src/activities/RaceRoutes.js'); const Rt = buildRoute(ROUTE);
    const P = g.player; const v = new window.__Vehicle('vanta', 7, g.scene); const i0 = Rt.startI; v.place(Rt.cx[i0], Rt.cz[i0], Rt.hd[i0]); g.traffic.release(v, false); P.teleport(v.x + 2.2, v.z, 0); g.world.warm(v.x, v.z); P.enterVehicle(v, g.traffic); for (let i = 0; i < 300 && (P.vehicle !== v || P.entry); i++) await g.stepSim(1, 0.05);
    await g.stepSim(40, 0.05); for (const k in T) delete T[k];
    const sp = 30, dt = 1 / 30; let idx = i0; const frames = []; 
    for (let s = 0; s < STEPS; s++) { idx = (idx + (sp * dt) / 2) % Rt.N; const i = Math.floor(idx); v.place(Rt.cx[i], Rt.cz[i], Rt.hd[i]); v.speed = sp; const t = performance.now(); g.updatePlay(dt); g.cullStep(dt); frames.push(performance.now() - t); for (let j = 0; j < 4; j++) await null; }
    frames.sort((a, b) => a - b); const q = (p) => +frames[Math.floor(p * (frames.length - 1))].toFixed(2);
    const rows = Object.entries(T).map(([k, s]) => [k, +(s.sum / STEPS).toFixed(3), +s.max.toFixed(1), s.n]).sort((a, b) => b[1] - a[1]);
    return { frame: { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), mean: +(frames.reduce((a, b) => a + b, 0) / frames.length).toFixed(2) }, peds: g.crowd.peds.length, cars: g.traffic.vehicles.length, rows };
  }, process.env.ROUTE || 'fort', +(process.env.STEPS || 900));
  console.log(JSON.stringify(R.frame), 'peds', R.peds, 'cars', R.cars); for (const r of R.rows) console.log(r[0].padEnd(34), String(r[1]).padStart(8), 'ms/frame  max', String(r[2]).padStart(7), ' n', r[3]);
} finally { await browser.close(); }
