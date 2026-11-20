// 74th: does walking up to the hospital change the scene's light set (→ shader recompiles)? PORT=5200 node tools/hospital-lightprobe.mjs
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 900000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
try {
  const page = await browser.newPage(); page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'medium', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5200) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const go = (at, inside) => page.evaluate(async (at, inside) => { const g = window.__game, P = g.player, H = g.hospital, R = g.renderer; g.atmos.hour = 11; g.world.warm(at[0], at[1]);
    if (inside) H.placeInside(P, at[0], at[1], 0); else P.teleport(at[0], at[1], Math.PI); await new Promise((r) => setTimeout(r, 4000));
    const L = []; g.scene.traverseVisible((q) => { if (q.isLight) L.push(q.type[0] + (q.parent && q.parent.name ? ':' + q.parent.name : '')); });
    const by = {}; for (const k of L) by[k] = (by[k] || 0) + 1; const st = R.info.programs.length;
    return { lights: L.length, by, programs: st, pool: g.interiors.walkIn.poolOn, wants: H.wantsPool, hqLights: (g.interiors.hq && g.interiors.hq.lights || []).map((l) => l.visible ? 1 : 0).join('') }; }, at, inside);
  for (const [n, at, ins] of [['street', [660, -150]], ['street2', [660, -150]], ['entrance', [655, -176]], ['lobby', [655, -195], 1], ['street3', [660, -150]], ['entrance2', [655, -176]]]) console.log(n, JSON.stringify(await go(at, ins)));
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
