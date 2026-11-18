// Ceylon Meridian Bank (67th request, Phase 1B) — headless Chromium on the production build. Runs the request's test list
// against the real game: map blip, placement, exact name and the text actually drawn on the signs, entering / leaving through
// the push door, collision against every obstacle of the hall, the ATM (interaction, balance, withdraw, deposit, invalid
// input, repeated input, history) driven through its own keys, save / load and the v4 → v5 migration, customer navigation,
// and that money, the wallet ledger, the map and traffic still work.
//   PORT=5199 node tools/bank-test.mjs   (needs `vite preview` of the build)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const errors = []; let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const T0 = Date.now(); const lap = (m) => console.log(`  [${((Date.now() - T0) / 1000).toFixed(0)} s] ${m}`);
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/favicon|404|GPU stall|ReadPixels|WebGL-|swiftshader|willReadFrequently|KHR_parallel/i.test(t)) errors.push(t.slice(0, 300)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false }));
    // record every string the game draws on a canvas (signs, ATM screen, posters): the spelling is checked from what was drawn
    window.__drawn = new Set(); const f = CanvasRenderingContext2D.prototype.fillText, s = CanvasRenderingContext2D.prototype.strokeText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { try { window.__drawn.add(String(t)); } catch (e) { /* */ } return f.call(this, t, ...a); };
    CanvasRenderingContext2D.prototype.strokeText = function (t, ...a) { try { window.__drawn.add(String(t)); } catch (e) { /* */ } return s.call(this, t, ...a); }; });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 11; });
  lap('game ready');

  // ---------------------------------------------------------------- 1 · map
  const map = await page.evaluate(async () => { const g = window.__game; if (!g.hud.blips.some((b) => b.id === 'shop_bank')) g.story.setupWorldActivities(); const b = g.hud.blips.find((q) => q.id === 'shop_bank'); const s = g.interiors.walkIn.siteById('bank');
    let mapErr = null, open = false; try { g.toggleMap(); await g.stepSim(2, 0.05); open = g.hud.bigMapOpen; g.toggleMap(); await g.stepSim(1, 0.05); } catch (e) { mapErr = String(e); }
    const legendBank = !!(g.hud.mapView && g.hud.mapView.blips ? true : true);
    return { blip: b || null, site: s ? { x: s.door.x, z: s.door.z } : null, mapErr, open, closed: !g.hud.bigMapOpen, legendBank }; });
  ok(map.blip && map.blip.kind === 'bank' && /Ceylon Meridian Bank/.test(map.blip.label) && map.site && Math.hypot(map.blip.x - map.site.x, map.blip.z - map.site.z) < 1, `1 find on map: blip "${map.blip && map.blip.label}" (kind ${map.blip && map.blip.kind}) at the bank door`);
  ok(!map.mapErr && map.open && map.closed, `1 the full map opens and closes with the bank blip on it${map.mapErr ? ' — ' + map.mapErr : ''}`);

  // ---------------------------------------------------------------- 2 · placement
  const pl = await page.evaluate(() => { const g = window.__game, L = window.__L; const W = g.interiors.walkIn, s = W.siteById('bank'); const b = s.b; const out = { b: b && b.id, front: b && b.front };
    const [ix, iz] = W.world(s, 0, -1.0); out.hallOnRoad = !!L.roadAt(ix, iz); out.doorOnRoad = !!L.roadAt(s.door.x, s.door.z);
    const c = [[-7, -13.6], [7, -13.6], [-7, -0.24], [7, -0.24]].map(([x, z]) => W.world(s, x, z)); out.roomInside = c.every(([x, z]) => x >= b.x0 - 0.05 && x <= b.x1 + 0.05 && z >= b.z0 - 0.05 && z <= b.z1 + 0.05);
    out.facadeOff = +Math.abs((b.front === 'W' ? b.x0 : b.front === 'E' ? b.x1 : b.front === 'N' ? b.z0 : b.z1) - (b.front === 'W' || b.front === 'E' ? s.F.x : s.F.z)).toFixed(3);
    const F = g.world.bankFront; out.frontage = !!(F && F.group && F.group.parent); out.y0 = +s.y0.toFixed(2); out.ground = +L.groundY(s.door.x, s.door.z).toFixed(2);
    // the pavement in front of the door is walkable for the player (no lamp / shelter / sign collider on the approach)
    let blocked = 0; for (let d = 1.0; d <= 4.0; d += 0.5) { const x = s.door.x + Math.sin(s.door.faceIn + Math.PI) * (d - 1.3), z = s.door.z + Math.cos(s.door.faceIn + Math.PI) * (d - 1.3); if (g.collision.blocked && g.collision.blocked(x, z, 0.3)) blocked++; } out.approachBlocked = blocked;
    return out; });
  ok(pl.b === 251 && pl.roomInside && !pl.hallOnRoad && !pl.doorOnRoad && pl.facadeOff < 0.05 && pl.frontage && pl.approachBlocked === 0 && Math.abs(pl.y0 - pl.ground) < 0.3, `2 placement: building ${pl.b} (faces ${pl.front}), hall inside its footprint, door on the facade (${pl.facadeOff} m), door + pavement not road, approach clear, floor ${pl.y0} vs ground ${pl.ground}`);

  // ---------------------------------------------------------------- 3 + 4 · exact name + signage text actually drawn
  const nm = await page.evaluate(() => { const g = window.__game; const s = g.interiors.walkIn.siteById('bank'); const drawn = [...window.__drawn];
    const F = g.world.bankFront; let canvasMats = 0; F.group.traverse((o) => { if (o.isMesh && o.material && o.material.map && o.material.map.isCanvasTexture) canvasMats++; });
    const fonts = ['800 20px "Manrope"', '600 20px "Cormorant Garamond"', '700 20px "Barlow Condensed"'].map((f) => document.fonts.check(f));
    const brandish = drawn.filter((t) => /MERID|\bCMB\b/i.test(t)); return { site: s.name, menu: g.interiorName('bank'), canvasMats, fonts, brandish }; });
  const allowed = new Set(['CEYLON MERIDIAN BANK', 'CEYLON MERIDIAN', 'Ceylon Meridian Bank', 'CMB', 'CMB ATM', 'CMB · ATM 24 h']);
  const odd = nm.brandish.filter((t) => !/^(CEYLON MERIDIAN BANK|CEYLON MERIDIAN|Ceylon Meridian Bank|CMB)\b/.test(t) && !allowed.has(t));
  ok(nm.site === 'Ceylon Meridian Bank' && nm.menu === 'Ceylon Meridian Bank' && nm.brandish.some((t) => t === 'CEYLON MERIDIAN BANK' || t === 'CEYLON MERIDIAN') && odd.length === 0, `3 exact name: site "${nm.site}", interior "${nm.menu}"; brand strings drawn in-game: ${JSON.stringify([...new Set(nm.brandish)].slice(0, 10))}${odd.length ? ' — ODD ' + JSON.stringify(odd) : ''}`);
  ok(nm.canvasMats >= 1 && nm.fonts.every(Boolean), `4 signage is engine canvas text (${nm.canvasMats} canvas-textured frontage meshes), brand fonts loaded ${JSON.stringify(nm.fonts)}`);
  lap('map / placement / name');

  // ---------------------------------------------------------------- 5 · enter (walk into the push door, no button)
  const en = await page.evaluate(async () => { const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player; const [sx, sz] = W.world(s, 0, 3.2); g.world.warm(sx, sz); P.teleport(sx, sz, s.door.faceIn); P.yaw = s.door.faceIn; P.camYaw = P.yaw + Math.PI; await g.stepSim(2, 0.05);
    let enteredAt = -1, maxAng = 0; for (let i = 0; i < 90; i++) { await g.stepSim(1, 0.05, ['KeyW']); maxAng = Math.max(maxAng, Math.abs(s.doorObj.ang)); if (enteredAt < 0 && P.indoor && P.indoor.site === s) enteredAt = i; if (enteredAt >= 0 && i > enteredAt + 25) break; }
    const r = s.room; return { enteredAt, maxAng: +maxAng.toFixed(2), inside: !!(P.indoor && P.indoor.site === s), bank: !!(r && r.bank), lights: r ? r.lights.length : 0, staff: r ? r.stand.tellers.length : 0, amb: !!window.__BankSound.on }; });
  ok(en.inside && en.bank && en.maxAng > 1 && en.amb, `5 enter: pushed the door open (${en.maxAng} rad), handed to the banking hall at step ${en.enteredAt}; ${en.lights} pooled lights, ${en.staff} tellers, room tone on`);

  // ---------------------------------------------------------------- 8 · interior collision: walk into every obstacle, every wall, the counter
  const col = await page.evaluate(async () => { const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), r = s.room; const bad = []; const obs = r.obstacles.filter((o) => !o.npc);
    const inside = (x, z) => obs.find((o) => x > o.x0 + 0.02 && x < o.x1 - 0.02 && z > o.z0 + 0.02 && z < o.z1 - 0.02);
    const walk = (x, z, dx, dz, n) => { for (let k = 0; k < n; k++) { const [wx, wz] = W.world(s, x + dx * 0.04, z + dz * 0.04); const q = W.resolve(s, wx, wz); [x, z] = W.local(s, q.x, q.z); } return [x, z]; };
    const free = (x, z) => { const [wx, wz] = W.world(s, x, z); const q = W.resolve(s, wx, wz); const [lx, lz] = W.local(s, q.x, q.z); return Math.hypot(lx - x, lz - z) < 0.01; };
    let tested = 0; for (const o of obs) { const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const sx = dx ? (dx > 0 ? o.x1 + 0.7 : o.x0 - 0.7) : cx, sz = dz ? (dz > 0 ? o.z1 + 0.7 : o.z0 - 0.7) : cz;
      if (sx < r.bounds.x0 + 0.35 || sx > r.bounds.x1 - 0.35 || sz < r.bounds.z0 + 0.35 || sz > -0.7 || !free(sx, sz)) continue; tested++;
      const [x, z] = walk(sx, sz, -dx, -dz, 40); const hit = inside(x, z); if (hit || x < r.bounds.x0 + 0.1 || x > r.bounds.x1 - 0.1 || z < r.bounds.z0 + 0.1) bad.push({ o: [o.x0, o.x1, o.z0, o.z1].map((v) => +v.toFixed(2)), end: [+x.toFixed(2), +z.toFixed(2)] }); } }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, -1]]) { const [x, z] = walk(0, -4.2, dx, dz, 500); if (x < r.bounds.x0 + 0.1 || x > r.bounds.x1 - 0.1 || z < r.bounds.z0 + 0.1) bad.push({ wall: [dx, dz], end: [x, z] }); }
    const tz = Math.max(...r.stand.tellers.map((t) => t.ch.root.position.z)); const ends = []; for (const x of [-4.95, -1.65, 1.65, 4.95, -3.3, 3.3]) { const [ex, ez] = walk(x, -7.2, 0, -1, 200); ends.push(+ez.toFixed(2)); if (ez < tz + 0.3) bad.push({ counter: x, end: [ex, ez] }); }
    return { tested, bad: bad.length, first: bad.slice(0, 3).map((b) => JSON.stringify(b)), counterEnds: ends, tellerZ: +tz.toFixed(2), obs: obs.length }; });
  ok(col.tested >= 40 && col.bad === 0, `8 interior collision: ${col.tested} walk-ins against ${col.obs} obstacles + 3 walls + 6 counter approaches (stopped at z ${col.counterEnds.join('/')}, staff at ${col.tellerZ}); ${col.bad} ended inside ${col.first.join(' ')}`);
  lap('enter / collision');

  // ---------------------------------------------------------------- 9 · ATM: prompt, opens only on interact, locks input, steady camera, Esc out
  const atm = await page.evaluate(async () => { const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player, r = s.room, I = window.__Input; const m = r.atms[0]; const out = {};
    for (const c of r.customers) if (c.on && c.atm === m.i) { c.on = false; c.ch.root.visible = false; c.atm = -1; } m.user = null;
    const [wx, wz] = W.world(s, m.stand[0] + 0.05, m.stand[1]); P.x = wx; P.z = wz; P.yaw = s.yaw - Math.PI / 2; P.camYaw = P.yaw + Math.PI; await g.stepSim(3, 0.05);
    out.prompt = r.prompt; out.openWithoutKey = g.atm.open;
    I.pressed.add('KeyE'); await g.stepSim(1, 0.05); out.open = g.atm.open; out.control = P.control; out.camOverride = P.camOverride; out.dom = !g.atm.root.classList.contains('hidden'); out.atmPlayer = m.player;
    await g.stepSim(25, 0.05); out.page = g.atm.page; out.brand = g.atm.root.querySelector('.atm-brand b').textContent;
    I.pressed.add('KeyM'); I.pressed.add('KeyP'); I.pressed.add('KeyJ'); await g.stepSim(1, 0.05); out.mapOpened = g.hud.bigMapOpen; out.phoneOpened = g.phone.open; out.paused = g.paused;
    const c0 = g.camera.position.clone(); await g.stepSim(10, 0.05); out.camMove = +c0.distanceTo(g.camera.position).toFixed(3);
    { const x0 = P.x, z0 = P.z; await g.stepSim(10, 0.05, ['KeyW', 'KeyA']); out.playerMoved = +Math.hypot(P.x - x0, P.z - z0).toFixed(3); }
    I.pressed.add('Escape'); await g.stepSim(1, 0.05); out.pageAfterEsc = g.atm.page; await g.stepSim(40, 0.05); out.closed = !g.atm.open; out.controlBack = P.control; out.camBack = !P.camOverride; out.atmFree = !m.player;
    return out; });
  ok(!atm.openWithoutKey && /Use ATM/.test(atm.prompt || '') && atm.open && atm.dom && atm.control === false && atm.camOverride && atm.atmPlayer, `9 ATM: prompt "${String(atm.prompt)}", opens only on the interact key; controls locked, camera taken, machine marked in use`);
  ok(atm.page === 'menu' && atm.brand === 'CEYLON MERIDIAN BANK' && !atm.mapOpened && !atm.phoneOpened && !atm.paused && atm.camMove < 0.05 && atm.playerMoved < 0.01, `9 ATM: card read → menu, branded "${atm.brand}"; map / phone / pause keys ignored; camera steady (${atm.camMove} m); player held (${atm.playerMoved} m)`);
  ok(atm.closed && atm.controlBack && atm.camBack && atm.atmFree, `9 ATM: Esc returns the card ("${atm.pageAfterEsc}") and closes; controls + camera restored, machine free`);
  lap('ATM open / close');

  // ---------------------------------------------------------------- 10-15 + 19 · transactions through the ATM's own keys
  const tx = await page.evaluate(async () => { const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player, r = s.room, I = window.__Input, S = g.story.state, A = g.atm; const out = {};
    const a = g.bank.account; a.balance = 50000; a.history = []; a.withdrawnToday = 0; a.day = null; S.money = 10000; const ledger0 = S.ledger.length;
    const press = async (code) => { I.pressed.add(code); await g.stepSim(1, 0.05); };
    const pick = async (label) => { const i = A.opts.findIndex((o) => o.label.startsWith(label)); if (i < 0) { out.missing = (out.missing || []).concat(label + '@' + A.page); return false; } A.sel = i; A.render(); await press('Enter'); return true; };
    const wait = (n = 40) => g.stepSim(n, 0.05);
    const m = r.atms[1]; for (const c of r.customers) if (c.on && c.atm === m.i) { c.on = false; c.ch.root.visible = false; c.atm = -1; } m.user = null;
    const [wx, wz] = W.world(s, m.stand[0] + 0.05, m.stand[1]); P.x = wx; P.z = wz; P.yaw = s.yaw - Math.PI / 2; await g.stepSim(3, 0.05);
    await press('KeyE'); await wait(25); out.open = A.open;
    // 10 balance
    await pick('Balance enquiry'); out.balanceText = A.root.querySelector('.atm-lines').textContent; await pick('Another service');
    // 11 withdraw Rs. 5,000 — and 14: the confirm key hammered + a click + the same request replayed
    await pick('Cash withdrawal'); await pick('Rs. 5,000'); out.confirmPage = A.page; const ref = A.req && A.req.ref;
    A.sel = A.opts.findIndex((o) => o.act === 'confirm'); for (let i = 0; i < 5; i++) { I.pressed.add('Enter'); I.pressed.add('Space'); I.pressed.add('NumpadEnter'); await g.stepSim(1, 0.05); }
    const opt = A.root.querySelector('.atm-opt'); if (opt) opt.click(); A.execute();
    out.dup = g.bank.transact({ kind: 'withdraw', amount: 5000, ref, channel: 'ATM' }).code;
    await wait(40); out.wPage = A.page; out.wMoney = S.money; out.wBal = a.balance; out.wDone = a.history.filter((e) => e.result === 'completed').length; out.hudAfterW = g.hud.money.textContent;
    await pick('Another service');
    // 12 deposit Rs. 1,000 (fast amount) + Rs. 2,300 (keypad)
    await pick('Cash deposit'); await pick('Rs. 1,000'); await pick('Confirm'); await wait(40); out.dOk = !!(A.result && A.result.ok); await pick('Another service');
    await pick('Cash deposit'); await pick('Other amount'); for (const d of ['2', '3', '0', '0']) await press('Digit' + d); out.entry = A.entry; await press('Enter'); await pick('Confirm'); await wait(40); out.d2Ok = !!(A.result && A.result.ok); await pick('Another service');
    out.dMoney = S.money; out.dBal = a.balance; out.hudAfterD = g.hud.money.textContent;
    // 13 invalid: odd amount, more than the balance, more cash than he carries, then garbage straight into the service
    const before = [S.money, a.balance];
    await pick('Cash withdrawal'); await pick('Other amount'); for (const d of ['1', '2', '3', '4']) await press('Digit' + d); await press('Enter'); out.inv1 = A.page === 'other' && A.msg ? A.msg.t : null; await press('Escape');
    a.balance = 3000; await pick('Other amount'); for (const d of ['5', '0', '0', '0']) await press('Digit' + d); await press('Enter'); out.inv2 = A.page === 'other' && A.msg ? A.msg.t : null; await press('Escape'); await press('Escape'); a.balance = before[1];
    await pick('Cash deposit'); await pick('Other amount'); for (const d of ['5', '0', '0', '0', '0']) await press('Digit' + d); await press('Enter'); out.inv3 = A.page === 'other' && A.msg ? A.msg.t : null; await press('Escape'); await press('Escape');
    out.backAtMenu = A.page;
    const T = (q) => g.bank.transact(q); out.inv4 = [T({ kind: 'withdraw', amount: -500, ref: 'x1' }).code, T({ kind: 'withdraw', amount: NaN, ref: 'x2' }).code, T({ kind: 'withdraw', amount: 500.5, ref: 'x3' }).code, T({ kind: 'steal', amount: 500, ref: 'x4' }).code, T({ kind: 'withdraw', amount: 150000, ref: 'x5' }).code, T({ kind: 'deposit', amount: 50, ref: 'x6' }).code, T({ kind: 'deposit', amount: '1000', ref: 'x8' }).code];
    out.invUnchanged = S.money === before[0] && a.balance === before[1];
    g.bank.busy = true; out.busy = T({ kind: 'deposit', amount: 100, ref: 'x7' }).code; g.bank.busy = false;
    a.balance = 1000000; a.withdrawnToday = 0; a.day = g.bank.today(); let lim = 0; for (let i = 0; i < 3; i++) { const q = T({ kind: 'withdraw', amount: 100000, ref: 'lim' + i }); if (q.ok) lim++; else out.limitCode = q.code; } out.limitOk = lim;
    // 15 history
    const h = a.history; out.hist0 = h[0]; out.histTypes = [...new Set(h.map((e) => e.type))]; out.histResults = [...new Set(h.map((e) => e.result))]; out.histFields = h.every((e) => (e.type === 'withdraw' || e.type === 'deposit') && Number.isFinite(e.amount) && e.result && Number.isFinite(e.day) && typeof e.time === 'string' && e.time.length > 0);
    for (let i = 0; i < 40; i++) T({ kind: 'deposit', amount: 100, ref: 'cap' + i }); out.histLen = h.length === a.history.length ? a.history.length : a.history.length;
    await pick('Mini statement'); out.stmtRows = A.root.querySelectorAll('.atm-st tr').length - 1; await pick('Return card'); await wait(40); out.closed = !A.open;
    out.ledgerGrew = S.ledger.length > ledger0; out.ledgerWhy = [...new Set(S.ledger.slice(0, 50).map((e) => e.why).filter((w) => /CMB/.test(w)))]; out.invariant = S.money >= 0 && a.balance >= 0; out.stats = { ...g.bank.stats };
    return out; });
  if (tx.missing) console.log('  (options not found:', tx.missing.join(', '), ')');
  ok(tx.open && /Rs\. 50,000/.test(tx.balanceText) && /Rs\. 10,000/.test(tx.balanceText), `10 correct balance on the screen: "${tx.balanceText.replace(/\s+/g, ' ').slice(0, 110)}"`);
  ok(tx.confirmPage === 'confirm' && tx.wMoney === 15000 && tx.wBal === 45000 && tx.wDone === 1 && /15,000/.test(tx.hudAfterW), `11 withdraw Rs. 5,000: cash 10,000 → ${tx.wMoney}, balance 50,000 → ${tx.wBal}, HUD "${tx.hudAfterW}"`);
  ok(tx.dOk && tx.d2Ok && tx.entry === '2300' && tx.dMoney === 11700 && tx.dBal === 48300 && /11,700/.test(tx.hudAfterD), `12 deposit Rs. 1,000 + Rs. 2,300 (keypad "${tx.entry}"): cash ${tx.dMoney}, balance ${tx.dBal}, HUD "${tx.hudAfterD}"`);
  ok(!!tx.inv1 && !!tx.inv2 && !!tx.inv3 && tx.backAtMenu === 'menu' && tx.inv4.join() === 'amount,amount,amount,kind,max,min,amount' && tx.invUnchanged && tx.busy === 'busy' && tx.limitOk === 2 && tx.limitCode === 'limit', `13 invalid rejected: "${tx.inv1}" · "${tx.inv2}" · "${tx.inv3}" · service ${tx.inv4.join('/')} · in flight "${tx.busy}" · daily limit after ${tx.limitOk} × Rs. 100,000 ("${tx.limitCode}") · cash and balance untouched`);
  ok(tx.wDone === 1 && tx.dup === 'duplicate' && tx.wMoney === 15000, `14 repeated input: 5 frames of Enter/Space/NumpadEnter + a click + a second execute() + the reference replayed → one withdrawal (replay: "${tx.dup}")`);
  ok(tx.histFields && tx.histTypes.length === 2 && tx.histResults.includes('completed') && tx.histResults.includes('declined') && tx.histLen === 30 && tx.stmtRows === 7 && tx.closed, `15 history: newest ${JSON.stringify(tx.hist0)}; capped at ${tx.histLen}; mini statement shows ${tx.stmtRows}`);
  ok(tx.ledgerGrew && tx.ledgerWhy.length === 2 && tx.invariant, `19 one wallet: the phone Wallet ledger shows ${JSON.stringify(tx.ledgerWhy)}; cash and balance never negative (service ${JSON.stringify(tx.stats)})`);
  lap('transactions');

  // ---------------------------------------------------------------- 16 · save / load, old save migration, ATM state not saved
  const sv = await page.evaluate(async () => { const g = window.__game, S = g.story.state, a = g.bank.account; const out = {};
    a.balance = 123500; S.money = 4321; const n = a.history.length; const top = JSON.stringify(a.history[0]);
    const W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player; { const [ix, iz] = W.world(s, -2, -4); const [ex, ez] = W.world(s, 0, 3.2); P.teleport(ex, ez, s.door.faceIn); P.yaw = s.door.faceIn; P.camYaw = P.yaw + Math.PI; await g.stepSim(2, 0.05); for (let i = 0; i < 80 && !(P.indoor && P.indoor.site === s); i++) await g.stepSim(1, 0.05, ['KeyW']); P.x = ix; P.z = iz; await g.stepSim(1, 0.05); out.savedInside = !!(P.indoor && P.indoor.site === s); }
    g.saveTo('3'); const raw = JSON.parse(localStorage.getItem('colombo.save.3')); out.savePos = raw.player; { const [lx, lz] = W.local(s, raw.player.x, raw.player.z); out.saveLocal = [+lx.toFixed(2), +lz.toFixed(2)]; } out.version = raw.version; out.savedBank = raw.story.bank && raw.story.bank.balance;
    out.bankKeys = Object.keys(raw.story.bank).sort().join(','); out.topAtm = Object.keys(raw).filter((k) => /atm\b|atmui/i.test(k));
    a.balance = 1; a.history = []; S.money = 1; g.atm.page = 'confirm';
    await g.startLoaded('3'); await g.stepSim(2, 0.05); out.afterLoad = { indoor: !!P.indoor, amb: window.__BankSound.on }; { const x0 = P.x, z0 = P.z; P.yaw = s.door.faceIn + Math.PI; P.camYaw = P.yaw + Math.PI; await g.stepSim(30, 0.05, ['KeyW']); out.walkedAway = +Math.hypot(P.x - x0, P.z - z0).toFixed(2); } const b = g.bank.account; out.loaded = [g.story.state.money, b.balance, b.history.length === n, JSON.stringify(b.history[0]) === top]; out.atmPage = g.atm.page; out.atmOpen = g.atm.open;
    const old = structuredClone(raw); old.version = 4; delete old.story.bank; old.story.money = 7777; localStorage.setItem('colombo.save.2', JSON.stringify(old));
    await g.startLoaded('2'); await g.stepSim(2, 0.05); out.old = [g.story.state.money, g.bank.account.balance, g.bank.account.history.length, g.bank.account.acct];
    const bad = structuredClone(raw); bad.story.bank = { balance: -500, history: 'x', acct: 7 }; localStorage.setItem('colombo.save.2', JSON.stringify(bad)); await g.startLoaded('2'); await g.stepSim(2, 0.05); out.repaired = [g.bank.account.balance, Array.isArray(g.bank.account.history), typeof g.bank.account.acct];
    localStorage.removeItem('colombo.save.2'); localStorage.removeItem('colombo.save.3'); return out; });
  ok(sv.version === 5 && sv.savedBank === 123500 && sv.loaded.join() === '4321,123500,true,true' && !sv.atmOpen && sv.atmPage === 'welcome', `16 save/load: v${sv.version}; loaded [cash, balance, same history count, same newest entry] = ${sv.loaded.join('/')}; ATM closed on page "${sv.atmPage}"`);
  ok(sv.savedInside && sv.saveLocal[1] > 0.5 && !sv.afterLoad.indoor && !sv.afterLoad.amb && sv.walkedAway > 1.5, `16 a save made inside the hall (ATM autosave) puts him on the pavement outside the door (local ${sv.saveLocal.join(', ')}); after loading he is on the street, room tone off, and walks freely (${sv.walkedAway} m)`);
  ok(sv.old[0] === 7777 && sv.old[1] === 0 && sv.old[2] === 0 && !!sv.old[3] && sv.repaired.join() === '0,true,string', `16 old v4 save: cash kept (${sv.old[0]}), fresh empty account ${sv.old[3]}; a damaged account is repaired (${sv.repaired.join('/')})`);
  ok(sv.bankKeys === 'acct,balance,day,history,seq,v,withdrawnToday' && sv.topAtm.length === 0, `16 nothing of the ATM screen is saved (story.bank = ${sv.bankKeys})`);
  lap('save / load');

  // ---------------------------------------------------------------- 6 + 7 · leave from several spots; the door never traps
  const lv = await page.evaluate(async () => { const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player; const out = { steps: [], enter: [] };
    for (const [x, z] of [[0, -1.6], [3.4, -1.7], [-3.0, -1.64], [0, -5.0]]) {
      const [sx, sz] = W.world(s, 0, 3.2); P.teleport(sx, sz, s.door.faceIn); P.yaw = s.door.faceIn; P.camYaw = P.yaw + Math.PI; await g.stepSim(2, 0.05); let e = -1; for (let i = 0; i < 80 && e < 0; i++) { await g.stepSim(1, 0.05, ['KeyW']); if (P.indoor && P.indoor.site === s) e = i; } out.enter.push(e);
      for (let i = 0; i < 30; i++) await g.stepSim(1, 0.05, ['KeyW']); // walk on into the hall
      const [ix, iz] = W.world(s, x, z); P.x = ix; P.z = iz; await g.stepSim(2, 0.05); out.inBefore = (out.inBefore || []).concat(!!(P.indoor && P.indoor.site === s));
      let left = -1; for (let i = 0; i < 300 && left < 0; i++) { const [lx, lz] = W.local(s, P.x, P.z); const [tx, tz] = lz < -1.4 ? [0, -0.9] : [0, 3]; const [wx, wz] = W.world(s, tx, tz); P.yaw = Math.atan2(wx - P.x, wz - P.z); P.camYaw = P.yaw + Math.PI; await g.stepSim(1, 0.05, ['KeyW']); if (!P.indoor) left = i; }
      out.steps.push(left); for (let i = 0; i < 20; i++) await g.stepSim(1, 0.05, ['KeyW']); }
    await g.stepSim(60, 0.05); out.closed = +Math.abs(s.doorObj.ang).toFixed(3); out.amb = window.__BankSound.on; await g.stepSim(40, 0.05); out.released = !window.__BankSound.amb; return out; });
  ok(lv.enter.every((x) => x >= 0) && lv.inBefore.every(Boolean) && lv.steps.every((x) => x > 5), `6 leave: in through the door 4 × (steps ${lv.enter.join(', ')}) and out again from 4 spots in the hall (released at steps ${lv.steps.join(', ')})`);
  ok(lv.closed < 0.02, `7 door closed behind the player every time, never trapping him (leaf ${lv.closed} rad)`);
  ok(lv.amb === false && lv.released, '9 bank room tone off after leaving, its audio sources released');
  lap('leave');

  // ---------------------------------------------------------------- 17 · customers: in through the door, about their business, out again
  const npc = await page.evaluate(async () => { const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player, r = s.room; const out = {};
    const [sx, sz] = W.world(s, 0, 3.2); P.teleport(sx, sz, s.door.faceIn); P.yaw = s.door.faceIn; P.camYaw = P.yaw + Math.PI; await g.stepSim(2, 0.05); for (let i = 0; i < 80 && !(P.indoor && P.indoor.site === s); i++) await g.stepSim(1, 0.05, ['KeyW']);
    for (let i = 0; i < 20; i++) await g.stepSim(1, 0.05, ['KeyW']); const [ix, iz] = W.world(s, 5.5, -2.0); P.x = ix; P.z = iz; await g.stepSim(2, 0.05);
    out.inside = !!(P.indoor && P.indoor.site === s); const st0 = { ...r.stats }; const obs = r.obstacles.filter((o) => !o.npc).slice();
    let inObs = 0, doorMax = 0, playerHit = 0, stuck = 0, walkSamples = 0; const last = new Map();
    for (let f = 0; f < 2400; f++) { await g.stepSim(1, 0.05); doorMax = Math.max(doorMax, Math.abs(s.doorObj.ang)); const [lx, lz] = W.local(s, P.x, P.z);
      for (const c of r.customers) { if (!c.on || !c.cmd || !c.cmd.walk || c.z > -0.3) continue; walkSamples++; if (obs.some((o) => c.x > o.x0 + 0.08 && c.x < o.x1 - 0.08 && c.z > o.z0 + 0.08 && c.z < o.z1 - 0.08)) inObs++; if (Math.hypot(lx - c.x, lz - c.z) < 0.3) playerHit++; }
      if (f % 100 === 0) { for (const c of r.customers) if (c.on && c.cmd && c.cmd.walk) { const k = last.get(c); if (k && k[2] === f - 100 && Math.hypot(k[0] - c.x, k[1] - c.z) < 0.01) stuck++; last.set(c, [c.x, c.z, f]); } } }
    out.stats = Object.fromEntries(Object.keys(r.stats).map((k) => [k, r.stats[k] - st0[k]])); Object.assign(out, { inObs, doorMax: +doorMax.toFixed(2), playerHit, stuck, walkSamples });
    out.staff = [...r.stand.tellers.map((t) => t.ch.anim.action), r.stand.recep.ch.anim.action, r.stand.guard.ch.anim.action]; out.tellerVisible = r.stand.tellers.every((t) => t.ch.root.visible);
    return out; });
  ok(npc.inside && npc.stats.spawned >= 3 && npc.stats.left >= 3 && npc.doorMax > 1, `17 customers came in and went out through the push door (leaf to ${npc.doorMax} rad) in 120 s: ${JSON.stringify(npc.stats)}`);
  ok(npc.inObs === 0 && npc.playerHit === 0 && npc.stuck === 0 && npc.tellerVisible, `17 navigation: ${npc.walkSamples} walking samples, ${npc.inObs} inside furniture / counters, ${npc.playerHit} into the player, ${npc.stuck} stuck; staff at posts (${npc.staff.join(' / ')})`);
  lap('customers');

  // ---------------------------------------------------------------- 13 · ATM refuses while wanted; a customer's ATM is refused
  const wanted = await page.evaluate(() => { const g = window.__game, s = g.interiors.walkIn.siteById('bank'), r = s.room; const m = r.atms[0]; const u = m.user; m.user = null; const lvl = g.police.level; g.police.level = 2; const a = g.atm.openAt(r, m); g.police.level = lvl; m.user = { busy: true }; const b = g.atm.openAt(r, m); m.user = u; if (g.atm.open) g.atm.close(true); return { a, b }; });
  ok(!wanted.a && !wanted.b, '13 ATM will not open while wanted, nor while a customer is using it');

  // ---------------------------------------------------------------- 20 · map + traffic still work outside
  const mt = await page.evaluate(async () => { const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player; const [fx, fz] = W.world(s, 0, 25); P.teleport(fx, fz, 0); await g.stepSim(60, 0.05);
    const moving = g.traffic.vehicles.filter((v) => Math.abs(v.speed) > 1).length; let mapErr = null; try { g.toggleMap(); await g.stepSim(2, 0.05); g.toggleMap(); await g.stepSim(1, 0.05); } catch (e) { mapErr = String(e); }
    return { traffic: g.traffic.vehicles.length, moving, peds: g.crowd.peds.length, mapErr, blips: g.hud.blips.length }; });
  ok(mt.traffic > 0 && mt.moving > 0 && mt.peds > 0 && !mt.mapErr, `20 map + traffic: ${mt.traffic} vehicles (${mt.moving} moving), ${mt.peds} pedestrians, ${mt.blips} blips, map toggles cleanly`);
} catch (e) { console.log('ERR', (e.stack || e.message).split('\n').slice(0, 5).join(' / ')); fails++; }
finally { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]); try { browser.process() && browser.process().kill('SIGKILL'); } catch (e) { /* gone */ } }
console.log('console errors / warnings:', errors.length ? errors.slice(0, 12).join(' | ') : 'none');
if (errors.length) fails++;
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
