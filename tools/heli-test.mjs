// Police helicopter end-to-end test (production build, headless Chromium, no rendering):
//   parked on the HQ roof pad → 'heli call' start-up → vertical lift-off → transit → orbit over the player → follows the player
//   past the tallest landmarks (Twin Towers, Lotus Tower) → night 5★ searchlight on the suspect → downwash (foliage uniform, dust,
//   people) → 'heli land' → recovery onto the pad → shutdown. Fails on any floor contact in flight (= it would have entered a
//   building / object), on a landing off the pad, or if a stage never completes.
//   node tools/heli-test.mjs            PORT env (default 5199)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=480,270'], defaultViewport: { width: 480, height: 270 } });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
try {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e.stack || e).split('\n').slice(0, 3).join(' | ')));
  await p.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await p.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const r1 = await p.evaluate(async () => {
    const g = window.__game, H = g.heli; g.noRender = true; g.atmos.hour = 10; g.debugCon.exec('god on');
    const out = { has: !!H }; if (!H) return out;
    out.parked = { state: H.state, x: +H.p.x.toFixed(2), y: +H.p.y.toFixed(2), z: +H.p.z.toFixed(2), pad: window.__padY = H.p.y };
    g.player.teleport(-10, -240, 0); g.world.warm(-10, -240); await g.stepSim(10, 0.05);
    g.debugCon.exec('heli call'); const seq = []; let last = '';
    for (let i = 0; i < 1400; i++) { await g.stepSim(1, 0.05); if (H.state !== last) { last = H.state; seq.push(`${H.state}@${(i * 0.05).toFixed(1)}s y${H.p.y.toFixed(1)}`); } if (H.state === 'fly' && i > 600) break; }
    out.seq = seq; out.afterLaunch = H.info();
    // orbit: 40 s over the player at the HQ gate
    let dMin = 1e9, dMax = 0, aglMin = 1e9; for (let i = 0; i < 800; i++) { await g.stepSim(1, 0.05); if (i > 300) { const d = Math.hypot(H.p.x - g.player.x, H.p.z - g.player.z); dMin = Math.min(dMin, d); dMax = Math.max(dMax, d); aglMin = Math.min(aglMin, H.p.y - H.air.top(H.p.x, H.p.z, 0)); } }
    out.orbit = { dMin: +dMin.toFixed(1), dMax: +dMax.toFixed(1), aglMin: +aglMin.toFixed(1), info: H.info() };
    return out;
  });
  console.log(JSON.stringify(r1, null, 1));
  ok(r1.has, 'helicopter exists (g.heli)');
  ok(r1.parked && r1.parked.state === 'parked' && Math.hypot(r1.parked.x + 9, r1.parked.z + 194) < 0.1, 'parked on the HQ roof pad at load');
  ok(r1.seq && r1.seq.some((s) => s.startsWith('startup')) && r1.seq.some((s) => s.startsWith('lift')) && r1.seq.some((s) => s.startsWith('fly')), 'start-up → lift → fly');
  ok(r1.orbit && r1.orbit.dMin > 25 && r1.orbit.dMax < 140, `orbits the player (distance ${r1.orbit && r1.orbit.dMin}..${r1.orbit && r1.orbit.dMax} m)`);
  // follow the player past the tall landmarks (teleports in steps so the helicopter has to transit over the city)
  const r2 = await p.evaluate(async () => {
    const g = window.__game, H = g.heli; const out = { legs: [] };
    for (const [x, z, name] of [[-300, -880, 'Twin Towers'], [300, -440, 'Lotus Tower'], [250, -560, 'Lotus north'], [-140, -740, 'Pettah']]) {
      g.player.teleport(x, z, 0); g.world.warm(x, z); let minC = 1e9; const h0 = H.stats.floorHits;
      for (let i = 0; i < 900; i++) { await g.stepSim(1, 0.05); const top = H.air.top(H.p.x, H.p.z, 7.3); minC = Math.min(minC, H.p.y - top); }
      out.legs.push({ name, minClear: +minC.toFixed(1), floorHits: H.stats.floorHits - h0, d: +Math.hypot(H.p.x - x, H.p.z - z).toFixed(0), y: +H.p.y.toFixed(0) });
    }
    return out;
  });
  console.log(JSON.stringify(r2, null, 1));
  for (const l of r2.legs) ok(l.floorHits === 0 && l.minClear > 2, `${l.name}: clear of every obstacle (min ${l.minClear} m over the highest top under the rotor), reached (${l.d} m from the player)`);
  // night, 5★: searchlight on the suspect; then a low pass for downwash checks
  const r3 = await p.evaluate(async () => {
    const g = window.__game, H = g.heli; const out = {};
    g.atmos.hour = 22.5; g.player.teleport(-60, -280, 0); g.world.warm(-60, -280); g.debugCon.exec('nowanted off'); g.police.level = 4.8; g.police.spotted && g.police.spotted();
    for (let i = 0; i < 700; i++) { await g.stepSim(1, 0.05); if (g.police.level < 4.5) g.police.level = 4.8; }
    const s = H.spot; out.light = { k: +H.light.toFixed(2), intensity: +s.intensity.toFixed(0), beam: H.beam.visible, aimErr: +Math.hypot(H.aim.x - g.player.x, H.aim.z - g.player.z).toFixed(1), stars: g.police.stars(), night: +g.atmos.night.toFixed(2), sightings: H.stats.sightings || 0 };
    // downwash: force a low hover over a park lawn by putting the player there and pinning the orbit altitude low
    H.p.set(g.player.x + 4, H.air.top(g.player.x, g.player.z, 9) + 9, g.player.z + 4); H.v.set(0, 0, 0);
    const d0 = g.vsmoke ? g.vsmoke.stats.emitted : 0; let wMax = 0; for (let i = 0; i < 20; i++) { H.p.y = H.air.top(H.p.x, H.p.z, 9) + 9; H.v.set(0, 0, 0); await g.stepSim(1, 0.05); wMax = Math.max(wMax, H.washW || 0); }
    out.wash = { uniformW: +wMax.toFixed(2), dust: g.vsmoke ? g.vsmoke.stats.emitted - d0 : null, heliDust: g.vsmoke && g.vsmoke.stats.heli || 0 };
    // recovery
    g.debugCon.exec('nowanted on'); g.police.level = 0; g.debugCon.exec('heli land'); const seq = []; let last = '';
    for (let i = 0; i < 4000; i++) { await g.stepSim(1, 0.05); if (H.state !== last) { last = H.state; seq.push(`${H.state}@${(i * 0.05).toFixed(0)}s`); } if (H.state === 'parked') break; }
    out.home = { seq, state: H.state, x: +H.p.x.toFixed(2), y: +H.p.y.toFixed(2), z: +H.p.z.toFixed(2), yaw: +H.yaw.toFixed(3), padY: +window.__padY.toFixed(2), landings: H.stats.landings, floorHits: H.stats.floorHits, info: H.info() };
    return out;
  });
  console.log(JSON.stringify(r3, null, 1));
  ok(r3.light.k > 0.9 && r3.light.intensity > 1000 && r3.light.beam, `night 5★ searchlight on (intensity ${r3.light.intensity}, beam ${r3.light.beam})`);
  ok(r3.light.aimErr < 4, `searchlight on the suspect (aim error ${r3.light.aimErr} m)`);
  ok(r3.wash.heliDust > 0 && r3.wash.uniformW > 0.3, `downwash: foliage wash ${r3.wash.uniformW}, dust (${r3.wash.heliDust} puff batches)`);
  ok(r3.home.state === 'parked' && Math.hypot(r3.home.x + 9, r3.home.z + 194) < 1.5 && Math.abs(r3.home.y - r3.home.padY) < 0.05, `landed back on the HQ pad (${r3.home.x}, ${r3.home.y}, ${r3.home.z})`);
  ok(Math.abs(Math.atan2(Math.sin(r3.home.yaw + Math.PI / 2), Math.cos(r3.home.yaw + Math.PI / 2))) < 0.2, `parked nose-west on the pad (yaw ${r3.home.yaw})`);
  ok(r3.home.floorHits === 0, `no floor contacts in the whole flight (${r3.home.floorHits})`);
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' || ') : ''));
} catch (e) { console.log('FAIL exception', e && e.message); fails++; }
await b.close(); console.log(fails ? `heli-test: ${fails} FAILED` : 'heli-test: all passed'); process.exit(fails ? 1 : 0);
