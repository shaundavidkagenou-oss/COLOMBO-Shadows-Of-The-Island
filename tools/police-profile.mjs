// Where the police system's CPU time goes (40th request: "the police system kind of lags when it's working").
// Headless Chromium, real game, no rendering (noRender): wanted level held at S stars with the player running along Galle Road
// (or driving), units dispatched / spotted; times every stepSim frame, the police update alone (PoliceResponse.update incl.
// Firefight / Pursuit / EMS / officers) and its sub-systems, and records a CPU profile (self + inclusive top functions).
//   node tools/police-profile.mjs [stars=5] [seconds=30] [foot|car] [quality=low]      PORT env (default 5199)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [STARS = 5, SEC = 30, HOW0 = 'foot', Q = 'low'] = process.argv.slice(2); const HOW = HOW0.replace('+warm', ''); const WARMV = HOW0.endsWith('+warm'); // foot+warm / car+warm: run the enter-game loading's vehicle warm-up first (a real player always gets it)
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=1800'], defaultViewport: { width: 480, height: 270 } });
try {
  const p = await b.newPage(); p.on('pageerror', (e) => console.log('PAGEERROR', String(e.stack || e).split('\n').slice(0, 4).join(' | ')));
  await p.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await p.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  console.log('game up');
  await p.evaluate(async (how, warmV) => {
    const g = window.__game; g.noRender = true; g.atmos.hour = 15; g.player.teleport(-392, 700, 0); g.world.warm(-392, 700); if (warmV) await g.traffic.warmModels([[-392, 700]]); /* the enter-game loading's vehicle stage (a real player gets it) */ await g.stepSim(60, 0.05);
    if (how === 'car') { g.debugCon.exec('spawn car car'); let v = null, bd = 12; for (const q of g.traffic.parked) { const d = Math.hypot(q.x - g.player.x, q.z - g.player.z); if (d < bd) { bd = d; v = q; } } if (v) g.player.enterVehicle(v, g.traffic); for (let i = 0; i < 30 && g.player.entry; i++) await g.stepSim(5, 0.05); }
    // timing hooks: the whole police update and its parts
    const P = g.police; const T = (window.__pt = { pol: [], parts: {} });
    T.max = {}; const wrap = (obj, name, key) => { if (!obj || typeof obj[name] !== 'function') return; const f = obj[name]; obj[name] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { const d = performance.now() - t; T.parts[key] = (T.parts[key] || 0) + d; if (d > (T.max[key] || 0)) T.max[key] = d; } }; };
    const up = P.update; P.update = function (...a) { const t = performance.now(); try { return up.apply(this, a); } finally { T.pol.push(performance.now() - t); } };
    for (const n of Object.getOwnPropertyNames(Object.getPrototypeOf(P))) if (n !== 'constructor' && n !== 'update' && typeof P[n] === 'function') wrap(P, n, n);
    for (const [o, nm] of [[g.traffic, 'traffic'], [g.hud, 'hud'], [g.crowd, 'crowd'], [g.heli, 'heli']]) if (o) for (const n of ['update', 'updateParked', 'drawMini', 'updateMinimap', 'fly', 'downwash', 'lights', 'sound']) wrap(o, n, nm + '.' + n);
    if (P.fire) for (const n of Object.getOwnPropertyNames(Object.getPrototypeOf(P.fire))) if (n !== 'constructor' && typeof P.fire[n] === 'function') wrap(P.fire, n, 'fire.' + n);
    if (P.pursuit) for (const n of Object.getOwnPropertyNames(Object.getPrototypeOf(P.pursuit))) if (n !== 'constructor' && typeof P.pursuit[n] === 'function') wrap(P.pursuit, n, 'pursuit.' + n);
    if (P.ems) wrap(P.ems, 'update', 'ems.update');
    const G = Object.getPrototypeOf(g); for (const n of ['updatePlay']) if (typeof g[n] === 'function') { const f = g[n]; g[n] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { (T.frame ||= []).push(performance.now() - t); } }; } void G;
  }, HOW, WARMV);
  const s = await p.target().createCDPSession(); await s.send('Profiler.enable'); await s.send('Profiler.setSamplingInterval', { interval: 300 });
  const res = await p.evaluate(async (stars, sec, how) => {
    const g = window.__game, P = g.police, T = window.__pt; const keys = how === 'car' ? ['KeyW'] : ['KeyW', 'ShiftLeft'];
    g.debugCon.exec(stars > 0 ? 'nowanted off' : 'nowanted on'); g.debugCon.exec('god on'); if (stars > 0) P.level = stars - 0.2; P.addHeat(0.2, 'profile'); if (stars > 0 && (P.state === 'patrol' || P.state === 'return')) { P.incident = { x: g.player.x, z: g.player.z, t: P.t }; P.dispatch && P.dispatch(); }
    // warm-up: let units arrive before measuring
    for (let i = 0; i < 400; i += 20) { await g.stepSim(20, 0.05, i % 200 < 140 ? keys : []); if (stars > 0 && P.level < stars - 0.5) P.level = stars - 0.2; if (stars > 0 && P.units.some((u) => u.v && Math.hypot(u.v.x - g.player.x, u.v.z - g.player.z) < 120)) P.spotted(); }
    T.pol.length = 0; T.parts = {}; T.frame = []; T.max = {};
    window.__profStart && window.__profStart();
    return { units: P.units.length, foot: P.foot.length, state: P.state };
  }, +STARS, +SEC, HOW);
  console.log('warm', JSON.stringify(res));
  await s.send('Profiler.start');
  const out = await p.evaluate(async (stars, sec, how) => {
    const g = window.__game, P = g.police, T = window.__pt; const keys = how === 'car' ? ['KeyW'] : ['KeyW', 'ShiftLeft']; const n = Math.round(sec * 20);
    let maxU = 0, maxF = 0;
    for (let i = 0; i < n; i += 10) { await g.stepSim(10, 0.05, i % 200 < 140 ? keys : []); if (stars > 0 && P.level < stars - 0.5) P.level = stars - 0.2; if (stars > 0 && i % 60 === 0 && P.units.some((u) => u.v && Math.hypot(u.v.x - g.player.x, u.v.z - g.player.z) < 120)) P.spotted(); maxU = Math.max(maxU, P.units.length); maxF = Math.max(maxF, P.foot.length); if (g.player.dead || g.mode !== 'play') break; }
    const st = (A) => { const a = A.slice().sort((x, y) => x - y); return a.length ? { n: a.length, avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +a[Math.floor(a.length * 0.95)].toFixed(2), max: +a[a.length - 1].toFixed(2) } : null; };
    const N = T.pol.length || 1; const parts = Object.fromEntries(Object.entries(T.parts).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => [k, +(v / N).toFixed(3)]));
    const mx = Object.fromEntries(Object.entries(T.max).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, +v.toFixed(1)]));
    return { police: st(T.pol), frame: st(T.frame || []), partsMsPerFrame: parts, maxSingleCallMs: mx, make: P.stats.make || null, heli: g.heli ? g.heli.info() : null, heliStats: g.heli ? g.heli.stats : null, maxUnits: maxU, maxFoot: maxF, stars: P.stars(), state: P.state, mode: g.mode };
  }, +STARS, +SEC, HOW);
  const { profile } = await s.send('Profiler.stop');
  console.log(JSON.stringify(out, null, 1));
  const byId = new Map(profile.nodes.map((n) => [n.id, n])); const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = (n) => { const cf = n.callFrame; return `${cf.functionName || '(anon)'} ${(cf.url.split('/').pop() || '').replace(/-[A-Za-z0-9_-]{8}\.js/, '.js')}:${cf.lineNumber + 1}`; };
  const self = new Map(), incl = new Map(); let tot = 0;
  profile.samples.forEach((sid, i) => { const d = profile.timeDeltas[i] || 0; tot += d; const k = key(byId.get(sid)); self.set(k, (self.get(k) || 0) + d); const seen = new Set(); let q = sid; while (q != null) { const kk = key(byId.get(q)); if (!seen.has(kk)) { seen.add(kk); incl.set(kk, (incl.get(kk) || 0) + d); } q = parent.get(q); } });
  console.log('PROFILE self top (' + (tot / 1e6).toFixed(1) + ' s)'); [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, t]) => console.log('  ' + (100 * t / tot).toFixed(1).padStart(5) + '%  ' + k));
  console.log('PROFILE inclusive top'); [...incl].sort((a, b) => b[1] - a[1]).slice(0, 50).forEach(([k, t]) => console.log('  ' + (100 * t / tot).toFixed(1).padStart(5) + '%  ' + k));
} finally { await b.close(); }
