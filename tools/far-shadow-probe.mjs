// Far sun-shadow map probe (production build):  node tools/far-shadow-probe.mjs [quality=medium] [x z hour]   (PORT env, default 5199)
// Reports: the far map's size / box, the draw calls of ONE far-map redraw (and what they are), how many far redraws happen
// during 20 s of normal play (sim stepped at 60 fps with the clock running), the near map's per-frame calls, the
// texture-unit count of the busiest program against the GPU limit (each shadow map takes one), and console errors.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [Q = 'medium', X = '-140', Z = '-740', HOUR = '11'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=800,450'], defaultViewport: { width: 800, height: 450 } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', async (m) => { if ((m.type() === 'error' || /shadow chunk|far shadow/.test(m.text())) && !/favicon|404/.test(m.text())) { let t = m.text(); try { t = (await Promise.all(m.args().map((a) => a.jsonValue()))).join(' '); } catch (e) { /* keep text */ } errors.push(t.slice(0, 600)); } });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const res = await page.evaluate(async (x, z, hour) => {
    const g = window.__game, A = g.atmos, R = g.renderer; g.player.teleport(x, z, 0); g.world.warm(x, z); A.hour = hour; A.setWeather('clear', true);
    await g.stepSim(40, 0.033); for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    const far = A.sunFar, near = A.sun; const cnt = { far: 0, near: 0 }, by = {}; const orig = R.renderBufferDirect;
    R.renderBufferDirect = function (cam, scene, geo, mat, obj) { const rt = R.getRenderTarget(); if (rt && far.shadow.map === rt) { cnt.far++; let p = obj, n = ''; while (p && !n) { n = p.name; p = p.parent; } const k = (obj.isBatchedMesh ? 'batch ' : obj.isInstancedMesh ? 'inst ' : '') + (n || obj.type); by[k] = (by[k] || 0) + 1; } else if (rt && near.shadow.map === rt) cnt.near++; return orig.apply(this, arguments); };
    // one forced far redraw
    A.far.dirty = true; const r0 = A.far.renders; await new Promise((r) => requestAnimationFrame(r)); await new Promise((r) => requestAnimationFrame(r));
    const oneFar = cnt.far, farRedraws = A.far.renders - r0, nearPerFrame = cnt.near / 2;
    // 20 s of play: count far redraws (stepSim advances the clock like the game loop)
    const t0 = A.far.renders, h0 = A.hour; cnt.far = 0; await g.stepSim(1200, 1 / 60); const in20 = A.far.renders - t0, calls20 = cnt.far, h1 = A.hour;
    R.renderBufferDirect = orig;
    // texture units per program
    const gl = R.getContext(), maxTU = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS); const ST = new Set([0x8B5E, 0x8B5F, 0x8B60, 0x8B62, 0x8DC1, 0x8DC4, 0x8DCA, 0x8DCF, 0x8DD2, 0x8DD7, 0x8B63, 0x8B64, 0x8DC5]);
    let worst = 0, worstName = '', progs = 0; const top = []; for (const p of R.info.programs || []) { progs++; let n = 0; try { for (const u of p.getUniforms().seq) { if (u.seq) continue; if (ST.has(u.type)) n += u.size || 1; } } catch (e) { /* not linked */ } if (n > worst) { worst = n; worstName = p.name; } if (n >= 15) { const names = []; try { for (const u of p.getUniforms().seq) if (!u.seq && ST.has(u.type)) names.push(u.id + (u.size > 1 ? 'x' + u.size : '')); } catch (e) { /* */ } top.push(n + ' ' + names.join(',')); } }
    const sc = far.shadow.camera;
    return { quality: g.settings ? undefined : undefined, nearMap: near.shadow.mapSize.x, farMap: far.shadow.mapSize.x, farVisible: far.visible, farBox: [+(sc.right - sc.left).toFixed(1), +(sc.top - sc.bottom).toFixed(1)], farNormalBias: +far.shadow.normalBias.toFixed(3),
      oneFarRedrawCalls: oneFar, farRedrawsInThoseFrames: farRedraws, nearCallsPerFrame: nearPerFrame, farRedrawsIn20s: in20, farCallsIn20s: calls20, gameHours: [+h0.toFixed(3), +h1.toFixed(3)],
      farTop: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, n]) => `${n} ${k}`), maxTextureUnits: maxTU, busiestProgramUnits: worst, busiestProgram: worstName, programs: progs, over13: top.slice(0, 20) };
  }, +X, +Z, +HOUR);
  console.log(JSON.stringify(res, null, 1));
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
console.log('errors:', errors.slice(0, 8).join(' | ') || 'none');
