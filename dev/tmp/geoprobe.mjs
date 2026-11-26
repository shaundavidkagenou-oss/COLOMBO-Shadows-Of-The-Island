import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
try { const page = await browser.newPage(); page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'high', showFps: false })); });
  await page.goto('http://localhost:5199/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const R = await page.evaluate(async () => { const g = window.__game; g.noRender = true;
    const BG = await import('/src/world/BuildingGen.js'); const MB = await import('/src/gfx/MeshBuilder.js'); const { plan } = await import('/src/world/CityPlan.js');
    const hashArr = (a) => { let h = 2166136261 >>> 0; const u = new Uint32Array(a.buffer, a.byteOffset, a.length); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return h + ':' + a.length; };
    const w = new Worker('/dev/tmp/geo-worker-probe.js', { type: 'module' }); const call = (m) => new Promise((res) => { w.onmessage = (e) => res(e.data); w.postMessage(m); });
    const ini = await call({ init: true, origin: location.origin, split: [] }); if (ini.error) return { initErr: ini.error };
    const chunks = plan.byChunk.map((c, i) => [i, c.buildings.length]).sort((a, b) => b[1] - a[1]); const pick = [...chunks.slice(0, 6), ...chunks.filter((c) => c[1] > 0).slice(-3), chunks[Math.floor(chunks.length / 3)], chunks[Math.floor(chunks.length / 2)]];
    const res = []; let cloneErr = null;
    for (const [ci, n] of pick) for (const kind of ['detail', 'win']) { const bs = plan.byChunk[ci].buildings; let bsC; try { bsC = structuredClone(bs); } catch (e) { cloneErr = String(e.message); continue; }
      const t0 = performance.now(); const mb = new MB.MultiBuilder(null, {}), mb2 = new MB.MultiBuilder(null, {}); const saved = bs.map((b) => b._balcs);
      if (kind === 'detail') for (const b of bs) BG.buildDetail(b, mb); else for (const b of bs) { BG.beginWindows && 0; const ts = BG.windowTasks(b, mb, mb2); for (const t of ts) t(); }
      const ms = performance.now() - t0; const out = {}; for (const [M, tag] of [[mb, 'a'], [mb2, 'b']]) for (const [k, b] of M.b) out[tag + ':' + k] = [hashArr(new Float32Array(b.pos)), hashArr(new Float32Array(b.nor)), hashArr(new Float32Array(b.uv)), hashArr(new Float32Array(b.col)), hashArr(new Uint32Array(b.idx))].join('|');
      const W = await call({ kind, bs: bsC }); if (W.error) { res.push({ ci, kind, err: W.error.slice(0, 400) }); continue; }
      const keys = new Set([...Object.keys(out), ...Object.keys(W.out)]); let diff = 0; const dk = []; for (const k of keys) if (out[k] !== W.out[k]) { diff++; if (dk.length < 4) dk.push(k + ' main=' + (out[k] || '-').slice(0, 40) + ' wk=' + (W.out[k] || '-').slice(0, 40)); }
      res.push({ ci, n, kind, keys: keys.size, diff, dk, mainMs: +ms.toFixed(1), wMs: +W.ms.toFixed(1), balcMain: bs.map((b) => (b._balcs ? b._balcs.length : -1)).join(','), balcW: W.balcs.join(',') }); }
    w.terminate(); return { res, cloneErr }; });
  console.log(JSON.stringify(R, null, 1).slice(0, 8000));
} finally { await browser.close(); }
