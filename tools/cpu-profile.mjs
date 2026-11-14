// CPU profile of the simulation (no rendering): N stepSim frames at a busy spot, self time per function (Chrome CDP profiler).
//   node tools/cpu-profile.mjs [x=-390] [z=700] [frames=150] [quality=high]    PORT env
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [X = -390, Z = 700, N = 150, Q = 'high'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], defaultViewport: { width: 800, height: 450 } });
try {
  const p = await b.newPage();
  await p.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await p.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play&simwarm=' + (process.env.WARM || 200), { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await p.evaluate(async (x, z) => { const g = window.__game; g.atmos.hour = 17; g.world.warm(x, z); g.player.teleport(x, z, 0); g.noRender = true; await g.stepSim(+(new URLSearchParams(location.search).get('simwarm') || 200), 0.033); }, +X, +Z);
  const s = await p.target().createCDPSession(); await s.send('Profiler.enable'); await s.send('Profiler.setSamplingInterval', { interval: 200 }); await s.send('Profiler.start'); if (process.env.HEAP) { await s.send('HeapProfiler.enable'); await s.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
  const t = await p.evaluate(async (n) => { const g = window.__game; const t0 = performance.now(); await g.stepSim(n, 0.033); return (performance.now() - t0) / n; }, +N);
  const { profile } = await s.send('Profiler.stop');
  if (process.env.HEAP) { const { profile: hp } = await s.send('HeapProfiler.stopSampling'); const m = new Map(); let tot = 0; const walk = (n) => { const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop()}:${cf.lineNumber + 1}`; m.set(k, (m.get(k) || 0) + n.selfSize); tot += n.selfSize; for (const c of n.children) walk(c); }; walk(hp.head);
    console.log(`alloc KB/frame: ${(tot / 1024 / N).toFixed(1)}`); for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(((v / tot) * 100).toFixed(1).padStart(5) + '%  ' + (v / 1024 / N).toFixed(1) + ' KB/f  ' + k); }
  const dt = []; for (let i = 0; i < profile.samples.length; i++) dt[i] = profile.timeDeltas[i] || 0;
  const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  for (let i = 0; i < profile.samples.length; i++) { const n = byId.get(profile.samples[i]); const cf = n.callFrame; const k = `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop()}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i + 1] || 0)); }
  const tot = [...self.values()].reduce((a, v) => a + v, 0);
  console.log(`sim ms/frame (stepSim, incl. test overhead): ${t.toFixed(2)}`);
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(((v / tot) * 100).toFixed(1).padStart(5) + '%  ' + (v / 1000 / N).toFixed(3) + ' ms/f  ' + k);
} finally { await b.close(); }
