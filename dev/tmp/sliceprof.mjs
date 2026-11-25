import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const WK = +(process.env.WK ?? 1), STEPS = +(process.env.STEPS || 400);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
try { const page = await browser.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.evaluateOnNewDocument((wk) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'high', showFps: false, cpuWorkers: wk })); }, WK);
  await page.goto('http://localhost:5199/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const R = await page.evaluate(async (STEPS) => { const g = window.__game; g.noRender = true; const W = g.world; const THREE = window.__THREE;
    const CB = await import('/src/gfx/CellBatch.js'); const MB = await import('/src/gfx/MeshBuilder.js');
    const T = {}; const wrap = (obj, name, tag) => { const f = obj[name]; obj[name] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { T[tag] = (T[tag] || 0) + performance.now() - t; } }; };
    wrap(CB.RangeBatch.prototype, 'step', 'rangeStep'); wrap(MB.SliceBuild.prototype, 'step', 'sliceStep'); wrap(MB.SliceBuild.prototype, 'geometry', 'sliceGeo'); wrap(W, 'rangeBatch', 'rbCtor'); wrap(W, 'finishWindows', 'finishW'); wrap(W, 'finishDetail', 'finishD'); wrap(W, 'batchPlan', 'batchPlan'); wrap(W, 'markJob', 'markJob');
    wrap(THREE.BatchedMesh.prototype, 'computeBoundingBox', 'bmBox'); wrap(THREE.BatchedMesh.prototype, 'computeBoundingSphere', 'bmSph'); wrap(THREE.BatchedMesh.prototype, 'addGeometry', 'addGeo');
    const { buildRoute } = await import('/src/activities/RaceRoutes.js'); const Rt = buildRoute('fort'); const P = g.player;
    const v = new window.__Vehicle('vanta', 7, g.scene); const i0 = Rt.startI; v.place(Rt.cx[i0], Rt.cz[i0], Rt.hd[i0]); g.traffic.release(v, false); P.teleport(v.x + 2.2, v.z, 0); W.warm(v.x, v.z); P.enterVehicle(v, g.traffic); for (let i = 0; i < 300 && (P.vehicle !== v || P.entry); i++) await g.stepSim(1, 0.05);
    const slow = []; const sj = W.stepJob; W.stepJob = function (J, b) { for (const k in T) delete T[k]; const ph = J.q ? (J.rb ? 'rb' : J.sb ? 'sb' : 'q') : 'gen'; const t = performance.now(); const r = sj.call(this, J, b); const d = performance.now() - t; if (d > 15) slow.push({ d: Math.round(d), kind: J.kind, w: !!J.worker, ph, done: r, sn: J.sn, ...Object.fromEntries(Object.entries(T).map(([k, x]) => [k, Math.round(x)])) }); return r; };
    const dt = 1 / 30, sp = 30; let idx = i0; for (let s = 0; s < STEPS; s++) { idx = (idx + (sp * dt) / 2) % Rt.N; const i = Math.floor(idx); v.place(Rt.cx[i], Rt.cz[i], Rt.hd[i]); v.speed = sp; g.updatePlay(dt); await new Promise((r) => setTimeout(r, 0)); }
    return slow.sort((a, b) => b.d - a.d).slice(0, 14); }, STEPS);
  for (const r of R) console.log(JSON.stringify(r));
} finally { await browser.close(); }
