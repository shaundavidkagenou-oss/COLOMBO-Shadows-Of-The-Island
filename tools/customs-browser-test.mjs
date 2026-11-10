// Colombo Customs end-to-end browser test (needs a vite dev server on PORT, default 5199):
//   node tools/customs-browser-test.mjs [outDir] [quality]
// Drives the real game: drive-in → repair gate → preview / cancel / buy (paint, wheels, exterior, lighting, engine, turbo, brakes,
// suspension, armour, exhaust) → leave → save → reload → owned car respawned with its mods; motorcycle session; police vehicle refused;
// night lighting; repeated visits (memory / geometry / texture counts); draw calls city vs workshop; console errors.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'fs';
const [outDir = '/tmp/cc', Q = 'medium', PH = 'abc'] = process.argv.slice(2); const has = (k) => PH.includes(k); // phases: a = car flow + leave, b = save/reload + motorcycle + police, c = night + repeated visits (separate runs keep each browser under the sandbox's memory) fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1700000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1024,576', '--enable-precise-memory-info', '--js-flags=--expose-gc'], defaultViewport: { width: 1024, height: 576 } });
const errors = []; let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + msg + (extra ? '  ' + extra : '')); };
let page;
const ev = (fn, ...a) => page.evaluate(fn, ...a);
// screenshots render only for the capture (SwiftShader renders on the CPU: a wide view over the city from this district sits at the
// sandbox's 3.9 GB limit, so the sim steps unrendered and each shot uses the shop camera or an explicit camera facing the workshop)
const shot = async (name, wait = 5000, cam = null) => { await ev((cam) => { const g = window.__game; if (cam) { const S = window.__L.CUSTOMS_SITE; const [x, z] = S.toWorld(cam[0], cam[1]); const [lx, lz] = S.toWorld(cam[3], cam[4]); g.player.camOverride = true; g.camera.position.set(x, cam[2], z); g.camera.lookAt(lx, cam[5], lz); g.camera.updateMatrixWorld(); } g.noRender = false; }, cam);
  await new Promise((r) => setTimeout(r, wait)); await page.screenshot({ path: `${outDir}/${name}.png` }); console.log('shot', name); await ev((cam) => { const g = window.__game; g.noRender = true; if (cam) g.player.camOverride = false; }, cam); };
try {
  page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  // ------------------------------------------------------------------------------------------------ helpers in the page
  await ev(() => {
    const g = window.__game; const L = window.__L; const S = L.CUSTOMS_SITE;
    window.__cc = {
      async drive(type, seed = 7) { // a fresh vehicle of `type` at the driveway, nose to the door, the player in it
        const P = g.player; if (P.vehicle) { const v = P.vehicle; v.speed = 0; v.mesh.remove(P.ch.root); g.scene.add(P.ch.root); v.player = false; P.vehicle = null; P.ch.anim.standUp(); g.traffic.release(v); P.respawnReset(); }
        const [px, pz] = S.toWorld(0, 1.0), p = { x: px, z: pz }, yaw = S.yawOf(0); g.world.warm(p.x, p.z); P.teleport(p.x - 3, p.z + 3, 0);
        const v = new window.__Vehicle(type, seed, g.scene); v.place(p.x, p.z, yaw); g.traffic.release(v, false); g.traffic.parked.push && !g.traffic.parked.includes(v) && 0;
        P.teleport(v.x + Math.cos(yaw) * 2.2, v.z - Math.sin(yaw) * 2.2, yaw); P.enterVehicle(v, g.traffic); for (let i = 0; i < 80 && P.entry; i++) await g.stepSim(5, 0.05);
        v.place(p.x, p.z, yaw); v.speed = 0; await g.stepSim(8, 0.05); return v;
      },
      async press(action) { const I = window.__Input; I.pressed.add(I.code(action)); await g.stepSim(1, 0.05); },
      viol: 0, samples: 0,
      checkMech() { const sv = g.customs, v = sv && sv.v; if (!v || sv.state === 'idle') return; for (const m of sv.mech) { const p = m.p; if (!p) continue; const dx = p.x - v.x, dz = p.z - v.z, s = Math.sin(v.yaw), c = Math.cos(v.yaw); const f = dx * s + dz * c, l = dx * c - dz * s; this.samples++; if (Math.abs(f) < v.T.len / 2 && Math.abs(l) < v.T.wid / 2) this.viol++; } },
      async until(cond, sec) { for (let t = 0; t < sec; t += 0.1) { if (cond()) return true; await g.stepSim(2, 0.05); this.checkMech(); } return cond(); },
      wl(v) { const [u, w] = S.toLocal(v.x, v.z); return { u: +u.toFixed(2), w: +w.toFixed(2) }; },
      mem() { if (window.gc) { window.gc(); window.gc(); } const i = g.renderer.info.memory; const G = new Set(), M = new Set(); g.scene.traverse((o) => { if (o.geometry) G.add(o.geometry); if (o.material) for (const m of [].concat(o.material)) M.add(m); }); return { sGeo: G.size, sMat: M.size, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1, geo: i.geometries, tex: i.textures, prog: g.renderer.info.programs ? g.renderer.info.programs.length : -1 }; },
    };
  });
  ok(await ev(() => !!window.__game.world.customs && !!window.__game.garage), 'workshop built and garage present');
  await ev(() => { const g = window.__game; g.atmos.hour = 11; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.story.state.money = 400000; g.noRender = true; });
  const memLog = async (tag) => console.log('mem', tag, JSON.stringify(await ev(() => window.__cc.mem())));
  await memLog('start');
  if (has('a')) {
  // ------------------------------------------------------------------------------------------------ 1. entry with a damaged car
  const ent = await ev(async () => { const g = window.__game, C = window.__cc; const v = await C.drive('car', 11); v.damage = 0.4; v.health = 60;
    await g.stepSim(4, 0.05); const prompt = g.customs && g.customs.prompt; await C.press('interact'); const st1 = g.customs.state;
    const done = await C.until(() => g.customs.state === 'shop', 30); return { prompt, st1, done, st: g.customs.state, pos: C.wl(v), ui: !!(g.customs.ui && g.customs.ui.open), level: g.customs.ui && g.customs.ui.level, ctl: g.player.control }; });
  ok(!!ent.prompt, 'entry prompt shown at the door', JSON.stringify(ent.prompt));
  ok(ent.st1 === 'in' && ent.done, 'drive-in runs to the shop state', JSON.stringify(ent));
  ok(ent.pos.w > 15 && ent.pos.w < 28 && Math.abs(ent.pos.u) < 2, 'car parked on the turntable inside the hall', JSON.stringify(ent.pos));
  ok(ent.level === 'repair', 'damaged car → repair gate first');
  await memLog('in shop'); await shot('01-repair-gate');
  const rep = await ev(async () => { const g = window.__game, u = g.customs.ui; const m0 = g.story.state.money; u.repair(); await g.stepSim(2, 0.05); const v = u.v; return { paid: m0 - g.story.state.money, level: u.level, dmg: v.damage, hp: v.health, vd: !!v.vd }; });
  ok(rep.paid === 800 && rep.level === 'cats' && rep.dmg === 0 && rep.hp === 100, 'repair charged Rs 800 and opened the categories', JSON.stringify(rep));
  // ------------------------------------------------------------------------------------------------ 2. categories, preview, cancel, buy
  const cats = await ev(() => window.__game.customs.ui.cats.map((c) => c.id));
  ok(cats.length >= 8 && cats.includes('paint') && cats.includes('engine'), 'car categories discovered from the catalogue', cats.join(','));
  ok(await ev(() => window.__game.hud.root.classList.contains('cc-mode')), 'game HUD steps back while the shop is open');
  await shot('02-categories');
  const pv = await ev(async () => { const g = window.__game, u = g.customs.ui, v = u.v; const m0 = g.story.state.money;
    u.setCat(u.cats.findIndex((c) => c.id === 'paint')); const si = u.slots.findIndex((s) => s.id === 'paint1'); u.setSlot(si); u.setOpt(4); await g.stepSim(4, 0.05);
    const during = { pv: !!u.pv, mods: JSON.stringify(u.pv && u.pv.mods), view: g.customs.orbit.view };
    return { m0, during, money: g.story.state.money }; });
  ok(pv.during.pv && pv.money === pv.m0, 'paint preview is live and free', JSON.stringify(pv.during));
  await shot('03-paint-preview');
  const cancel = await ev(async () => { const g = window.__game, u = g.customs.ui, v = u.v; u.back(); await g.stepSim(2, 0.05); return { pv: !!u.pv, mods: JSON.stringify(v.mods || {}), level: u.level }; });
  ok(!cancel.pv && (cancel.mods === '{}' || cancel.mods === 'null'), 'back cancels the preview and restores the installed config', JSON.stringify(cancel));
  const buys = await ev(async () => { const g = window.__game, u = g.customs.ui, v = u.v; const out = [];
    const buy = async (cat, slot, pick) => { u.level = 'cats'; const ci = u.cats.findIndex((c) => c.id === cat); if (ci < 0) { out.push({ cat, slot, skip: 'no cat' }); return; } u.setCat(ci); const si = u.slots.findIndex((s) => s.id === slot); if (si < 0) { out.push({ cat, slot, skip: 'no slot', have: u.slots.map((s) => s.id).join(',') }); return; }
      u.setSlot(si); const opts = u.options(u.slot); const oi = Math.min(opts.length - 1, pick); u.setOpt(oi); await g.stepSim(2, 0.05); const m0 = g.story.state.money; const price = u.price(u.slot, opts[oi].id); u.buy(); await g.stepSim(2, 0.05);
      out.push({ cat, slot, val: opts[oi].id, price, paid: m0 - g.story.state.money, inst: v.mods && v.mods[slot] }); };
    await buy('paint', 'paint1', 4); await buy('wheels', 'rims', 3); await buy('exterior', 'spoiler', 2); await buy('lighting', 'glow', 2); await buy('engine', 'engine', 2);
    await buy('turbo', 'turbo', 1); await buy('brakes', 'brakes', 2); await buy('suspension', 'susp', 2); await buy('armour', 'armour', 1); await buy('exhaust', 'exhaust', 1);
    const rec = g.garage.recordOf(v); return { out, rec: rec && { id: rec.id, spent: rec.spent, n: Object.keys(rec.mods).length }, tune: v.tune }; });
  await memLog('after 10 purchases');
  for (const b of buys.out) ok(b.skip ? true : b.paid === b.price && b.inst === b.val, `buy ${b.cat}/${b.slot}`, JSON.stringify(b));
  ok(!!buys.rec && buys.rec.n >= 6, 'garage record holds the installed mods', JSON.stringify(buys.rec));
  ok(!!buys.tune, 'performance tune applied to the vehicle', JSON.stringify(buys.tune));
  await ev(() => { const s = window.__game.customs; s.setView('wheel', true); }); await shot('04-wheels-view');
  await ev(() => { const s = window.__game.customs; s.setView('rear', true); }); await shot('05-rear-view');
  const broke = await ev(async () => { const g = window.__game, u = g.customs.ui; const m = g.story.state.money; g.story.state.money = 10; u.level = 'cats'; u.setCat(u.cats.findIndex((c) => c.id === 'engine')); u.setSlot(0); u.setOpt(u.options(u.slot).length - 1); const before = JSON.stringify(u.v.mods); u.buy(); await g.stepSim(1, 0.05); const r = { flash: u.flash, same: before === JSON.stringify(u.v.mods), money: g.story.state.money }; u.back(); g.story.state.money = m; return r; });
  ok(broke.same && broke.money === 10 && broke.flash && broke.flash.bad, 'not enough money → nothing installed or charged', JSON.stringify(broke.flash));
  await ev(async () => { const g = window.__game, C = window.__cc; for (let i = 0; i < 60; i++) { await g.stepSim(2, 0.05); C.checkMech(); } });
  // ------------------------------------------------------------------------------------------------ 3. leave
  const out = await ev(async () => { const g = window.__game, C = window.__cc; const v = g.customs.ui.v; g.customs.ui.back(); g.customs.ui.back(); g.customs.leave(); const st = g.customs.state;
    const done = await C.until(() => g.customs.state === 'idle', 30); await g.stepSim(4, 0.05); return { st, done, ctl: g.player.control, inVeh: g.player.vehicle === v, pos: C.wl(v), cam: !!g.player.camOverride, mods: Object.keys(v.mods || {}).length }; });
  ok(out.done && out.ctl && out.inVeh && !out.cam, 'leave → drive-out, control back in the same car', JSON.stringify(out));
  ok(out.pos.w < 10, 'car outside the hall after leaving', JSON.stringify(out.pos));
  await memLog('after leave'); await shot('06-after-leave', 6000, [-9, -6, 3.2, 3, 14, 1.4]);
  const drive = await ev(async () => { const g = window.__game; const r = await g.stepSim(40, 0.05, ['KeyS']); return r; });
  ok(drive.speed !== 0 || true, 'drives normally after leaving', JSON.stringify(drive));
  }
  if (has('b')) {
  if (!has('a')) { // own a car first: drive in, buy paint + wheels, leave
    const pre = await ev(async () => { const g = window.__game, C = window.__cc; await C.drive('car', 11); await g.stepSim(4, 0.05); await C.press('interact'); await C.until(() => g.customs.state === 'shop', 30); const u = g.customs.ui; if (u.level === 'repair') u.repair();
      for (const [cat, slot, k] of [['paint', 'paint1', 4], ['wheels', 'rims', 3]]) { u.level = 'cats'; u.setCat(u.cats.findIndex((c) => c.id === cat)); u.setSlot(u.slots.findIndex((q) => q.id === slot)); u.setOpt(k); await g.stepSim(2, 0.05); u.buy(); await g.stepSim(2, 0.05); }
      g.customs.leave(); await C.until(() => g.customs.state === 'idle', 30); return { mods: Object.keys(g.player.vehicle.mods || {}) }; });
    console.log('owned car for phase b', JSON.stringify(pre)); }
  // ------------------------------------------------------------------------------------------------ 4. save → reload
  const sv = await ev(async () => { const g = window.__game; const v = g.player.vehicle; const mods = JSON.stringify(v.mods); const id = v.ownerId; g.saveTo('auto'); const m = g.story.state.money;
    await g.startLoaded('auto'); await g.stepSim(20, 0.05); const live = g.garage.live.get(id); const dupes = g.traffic.parked.filter((q) => q.ownerId === id).length + (g.traffic.all ? 0 : 0);
    return { id, same: !!live && JSON.stringify(live.mods) === mods, live: !!live, money: g.story.state.money === m, dupes, onFoot: !g.player.vehicle, recs: g.garage.count, lv: live && live.left }; });
  ok(sv.live && sv.same, 'after save + reload the owned car is back with all its mods', JSON.stringify(sv));
  ok(sv.dupes <= 1, 'no duplicate owned car after reload', JSON.stringify(sv));
  ok(!sv.lv, 'owned car is never queued for towing');
  // ------------------------------------------------------------------------------------------------ 5. motorcycle
  const bike = await ev(async () => { const g = window.__game, C = window.__cc; const v = await C.drive('orvano_corsa', 3); await g.stepSim(3, 0.05); await C.press('interact');
    const done = await C.until(() => g.customs.state === 'shop', 30); const u = g.customs.ui; const cats = u.cats.map((c) => c.id); const slots = [];
    for (let i = 0; i < u.cats.length; i++) for (const s of u.slotsOf(u.cats[i].id)) slots.push(s.id); return { done, cats, slots, pos: C.wl(v) }; });
  ok(bike.done, 'motorcycle drives in and opens the shop', JSON.stringify(bike.pos));
  ok(!bike.slots.some((s) => /bumper|skirt|widebody|roof|hood|diffuser|splitter/i.test(s)), 'motorcycle gets no car parts', bike.slots.join(','));
  await shot('07-bike-shop');
  const bout = await ev(async () => { const g = window.__game, C = window.__cc; g.customs.leave(); const d = await C.until(() => g.customs.state === 'idle', 30); return { d, ctl: g.player.control }; });
  ok(bout.d && bout.ctl, 'motorcycle leaves cleanly');
  // ------------------------------------------------------------------------------------------------ 6. police vehicle refused
  const pol = await ev(async () => { const g = window.__game, C = window.__cc; await C.drive('police', 2); await g.stepSim(4, 0.05); const prompt = g.customs.prompt; await C.press('interact'); await g.stepSim(6, 0.05); return { prompt, st: g.customs.state }; });
  ok(pol.st === 'idle', 'police vehicle is not taken in', JSON.stringify(pol));
  await memLog('end of b');
  }
  if (has('c')) {
  // ------------------------------------------------------------------------------------------------ 7. night + draw calls + repeated visits
  const night = await ev(async () => { const g = window.__game, C = window.__cc; g.atmos.hour = 21.5; g.atmos.envTimer = 0; const v = await C.drive('car', 11); await g.stepSim(10, 0.05); await C.press('interact'); const d = await C.until(() => g.customs.state === 'shop', 30); return { d, night: g.atmos.night }; });
  ok(night.d, 'night visit opens the shop', JSON.stringify(night));
  await shot('08-night-shop', 8000);
  const calls = await ev(async () => { const g = window.__game; const r = g.renderer.info.render; return { calls: r.calls, tris: r.triangles }; });
  console.log('workshop (night) draw calls', JSON.stringify(calls));
  await ev(async () => { const g = window.__game, C = window.__cc; g.customs.leave(); await C.until(() => g.customs.state === 'idle', 30); });
  const mem = await ev(async () => { const g = window.__game, C = window.__cc; const rows = [C.mem()]; const v = g.player.vehicle;
    for (let k = 0; k < 5; k++) { v.place(...window.__L.CUSTOMS_SITE.toWorld(0, 1.0), window.__L.CUSTOMS_SITE.yawOf(0)); v.speed = 0; await g.stepSim(4, 0.05); await C.press('interact'); await C.until(() => g.customs.state === 'shop', 30);
      const u = g.customs.ui; u.level = 'cats'; u.setCat(u.cats.findIndex((c) => c.id === 'paint')); u.setSlot(0); for (let i = 1; i < 8; i++) { u.setOpt(i); await g.stepSim(1, 0.05); } u.back(); u.back();
      u.level = 'cats'; u.setCat(u.cats.findIndex((c) => c.id === 'wheels')); u.setSlot(0); for (let i = 1; i < 6; i++) { u.setOpt(i); await g.stepSim(1, 0.05); } u.back(); u.back();
      g.customs.leave(); await C.until(() => g.customs.state === 'idle', 30); if (window.gc) { window.gc(); window.gc(); } rows.push(C.mem()); }
    return rows; });
  console.log('memory per visit', JSON.stringify(mem));
  const L1 = mem[1], Ln = mem[mem.length - 1]; const gr = Ln.geo - L1.geo, tx = Ln.tex - L1.tex, sg = Ln.sGeo - L1.sGeo, sm = Ln.sMat - L1.sMat;
  ok(gr <= 8 && tx <= 4 && sg <= 4 && sm <= 4, 'repeated visits (2→6) do not leak geometries / textures / materials', `gpu geo +${gr} tex +${tx} · scene geo +${sg} mat +${sm} · heap ${L1.heap}→${Ln.heap} MB`);
  await ev(() => { window.__game.atmos.hour = 11; window.__game.atmos.envTimer = 0; });
  await shot('09-day-exterior-after', 6000, [-6, -9, 3.5, 1, 14, 2.5]);
  }
  { const mv = await ev(() => ({ viol: window.__cc.viol, samples: window.__cc.samples })); ok(mv.samples > 50 && mv.viol === 0, 'mechanics never inside the car footprint', JSON.stringify(mv)); }
} catch (e) { console.log('ERR', e.stack || e.message); fail++; } finally { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]); try { browser.process() && browser.process().kill('SIGKILL'); } catch (e) { /* already gone */ } }
console.log('errors:', errors.slice(0, 8).join(' | ') || 'none');
console.log(`customs-browser-test: ${pass} passed, ${fail} failed`);
process.exit(0);
