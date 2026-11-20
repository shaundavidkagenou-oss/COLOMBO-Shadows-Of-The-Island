// 74th: where the hospital's draw calls go, per view (static count: one render of the main camera per toggle)
// usage: PORT=5200 node tools/hospital-drawprobe.mjs
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const V = [
  { name: 'lobby', at: [655, -195], f: 0, cam: [652, 1.65, -192], look: [660, 1.4, -205] },
  { name: 'ward', at: [652, -194], f: 1, cam: [647, 5.5, -191], look: [660, 4.9, -197] },
  { name: 'ed', at: [668, -196], f: 0, cam: [667, 1.75, -197.5], look: [677, 0.9, -191.5] },
  { name: 'private', at: [668, -203], f: 1, cam: [668, 5.6, -203], look: [672, 4.6, -210] },
  { name: 'entrance', out: true, at: [655, -176], cam: [655, 1.7, -176], look: [655, 1.6, -200] },
  { name: 'street', out: true, at: [660, -158], cam: [660, 1.7, -150], look: [660, 8, -250] },
];
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 900000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'], defaultViewport: { width: 960, height: 540 } });
try {
  const page = await browser.newPage(); page.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'medium', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5200) + '/?test&quick=play' + (process.env.WARM ? '&warm=1' : ''), { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  if (process.env.PRECOMP) console.log('precompile', await page.evaluate(async () => { const g = window.__game, R = g.renderer; g.world.warm(660, -158); g.player.teleport(660, -158, Math.PI); await g.stepSim(1, 0.05); const p0 = R.info.programs.length;
    const t = performance.now(); await g.hospital.precompile((root) => g.compileForGame(root, 4000)); return { before: p0, after: R.info.programs.length, ms: Math.round(performance.now() - t) }; }));
  console.log('in play, programs', await page.evaluate(() => window.__game.renderer.info.programs.length));
  for (const v of V) {
    v.detail = !!process.env.DETAIL;
    const r = await page.evaluate(async (v) => { const g = window.__game, P = g.player, H = g.hospital, R = g.renderer, hb = H.hb; g.atmos.hour = 11; P.camOverride = false; g.world.warm(v.at[0], v.at[1]);
      if (v.out) P.teleport(v.at[0], v.at[1], Math.PI); else H.placeInside(P, v.at[0], v.at[1], v.f); await g.stepSim(3, 0.05);
      P.camOverride = true; g.camera.position.set(...v.cam); g.camera.lookAt(...v.look); g.camera.updateMatrixWorld(); await g.stepSim(0.2, 0.05);
      const count = () => { R.info.autoReset = false; R.info.reset(); R.render(g.scene, g.camera); const c = R.info.render.calls; R.info.autoReset = true; return c; };
      const prog0 = R.info.programs.length; const o = { room: H.curRoom && H.curRoom.id, rooms: H.visibleRooms().join(','), all: count() };
      const ppl = H.people.filter((p) => p.ch.root.visible); o.peopleShown = ppl.length;
      ppl.forEach((p) => (p.ch.root.visible = false)); o.noPeople = count(); ppl.forEach((p) => (p.ch.root.visible = true));
      let pm = 0; if (ppl[0]) ppl[0].ch.root.traverse((q) => { if (q.isMesh && q.visible) pm++; }); o.meshesPerPerson = pm;
      const iv = hb.interior.visible; hb.interior.visible = false; o.noInterior = count(); hb.interior.visible = iv;
      const ev = hb.ext.visible; hb.ext.visible = false; o.noExt = count(); hb.ext.visible = ev;
      hb.root.visible = false; o.noHospital = count(); hb.root.visible = true;
      for (const [id, rm] of H.rooms) if (rm.group.visible) { rm.group.visible = false; o['room_' + id] = o.all - count(); rm.group.visible = true; }
      if (v.detail) { // 75th (DETAIL=1): per scene child, per hospital root child, per child of each visible room
        const nm = (q, i) => (q.name || q.type) + '#' + i; const top = (list, pre) => { list.forEach((q, i) => { if (!q.visible) return; q.visible = false; const d = o.all - count(); q.visible = true; if (d >= 3) o[pre + nm(q, i)] = d; }); };
        top(hb.root.children, 'hosp:'); top(hb.interior.children, 'int:');
        for (const [id, rm] of H.rooms) if (rm.group.visible) top(rm.group.children, id + ':');
      }
      o.programs = prog0 + '→' + R.info.programs.length; return o; }, v);
    console.log(v.name, JSON.stringify(r));
  }
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
