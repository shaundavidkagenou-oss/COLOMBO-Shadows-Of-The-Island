// National Hospital (74th request) — headless Chromium against the real game: the building, entering / leaving through the
// sliding doors, room visibility, stairs + lift, the staff routines and their LOD, collisions against furniture, the
// interactions, and the death → bed → wake-up → bedside line → invoice flow (one invoice, one charge, no repeated line).
//   PORT=5199 node tools/hospital-test.mjs [stage]   (needs the dev server or `vite preview` of a build)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const errors = []; let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; };
const EXE = await chromium.executablePath();
const browser = await puppeteer.launch({ executablePath: EXE, headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const T0 = Date.now(); const lap = (m) => console.log(`  [${((Date.now() - T0) / 1000).toFixed(0)} s] ${m}`);
const STAGE = process.argv[2] || process.env.STAGE || 'all'; const want = (s) => STAGE === 'all' || STAGE.split(',').includes(s);
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e).slice(0, 600)));
  page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/favicon|404|GPU stall|ReadPixels|WebGL-|swiftshader|willReadFrequently|KHR_parallel|localStorage|AudioContext/i.test(t)) errors.push('console: ' + t.slice(0, 400)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 11; });
  lap('game ready');

  // ---------------------------------------------------------------- 1 · it exists, at the old site, built from the plan
  const base = await page.evaluate(() => { const g = window.__game, H = g.hospital; if (!H) return null; const hb = g.world.hospitalBuild;
    return { rooms: H.rooms.size, people: H.people.length, roles: H.people.map((p) => p.key), doors: hb.doors.length, ext: !!hb.ext, lod: !!hb.lod, intVis: hb.interior.visible, k: H.k }; });
  ok(!!base, '1 g.hospital exists');
  if (!base) throw new Error('no hospital');
  ok(base.rooms === 16 && base.doors === 21, `1 16 rooms / 21 doors (${base.rooms} / ${base.doors})`);
  ok(base.people >= 4 && base.people <= 6, `1 4–6 staff/patients: ${base.roles.join(', ')}`);

  // ---------------------------------------------------------------- 2 · outside: interior hidden, LOD at distance
  if (want('vis')) {
    const out = await page.evaluate(async () => { const g = window.__game, P = g.player, H = g.hospital, hb = g.world.hospitalBuild; const r = {};
      P.teleport(660, -160, Math.PI); g.world.warm(660, -160); await g.stepSim(3, 0.05); r.near = { int: hb.interior.visible, rooms: H.visibleRooms(), lod: hb.lod.visible, ext: hb.ext.visible, tiers: H.npcTiers() };
      P.teleport(660, 30, Math.PI); g.world.warm(660, 30); await g.stepSim(3, 0.05); r.far = { int: hb.interior.visible, rooms: H.visibleRooms(), lod: hb.lod.visible, ext: hb.ext.visible, tiers: H.npcTiers() };
      return r; });
    ok(out.near.ext && !out.near.lod, `2 near: full exterior, no LOD (${JSON.stringify(out.near)})`);
    ok(!out.far.int && out.far.lod && !out.far.ext && out.far.rooms.length === 0, `2 far (190 m): LOD only, no interior, no rooms (${JSON.stringify(out.far)})`);
    ok(out.far.tiers.off === base.people, `2 far: every NPC frozen (no AI) ${JSON.stringify(out.far.tiers)}`);
  }

  // ---------------------------------------------------------------- 3 · walk in through the main sliding doors
  if (want('enter')) {
    const en = await page.evaluate(async () => { const g = window.__game, P = g.player, H = g.hospital, I = window.__Input || null; const r = { path: [] };
      P.teleport(654, -184, Math.PI); g.world.warm(654, -184); await g.stepSim(2, 0.05); // in front of the canopy, facing the doors (−z)
      P.control = true; const fw = I.code('forward'); I.down.add(fw); const t0 = performance.now(); let n = 0;
      while (n++ < 150) { P.camYaw = 0; await g.stepSim(1, 0.05); if (n % 10 === 0) r.path.push([+P.x.toFixed(2), +P.z.toFixed(2), P.indoor === H.room ? 'in' : 'out', H.curRoom ? H.curRoom.id : '-']); }
      I.down.delete(fw);
      r.ms = performance.now() - t0; r.indoor = P.indoor === H.room; r.room = H.curRoom && H.curRoom.id; r.vis = H.visibleRooms(); r.tiers = H.npcTiers(); r.slider = H.sliders ? H.sliders.map((s) => +s.k.toFixed(2)) : null; return r; });
    console.log('   path', JSON.stringify(en.path));
    ok(en.indoor && en.room === 'lobby', `3 walked in through the sliding doors → room ${en.room}; visible ${en.vis}`);
    ok(en.vis.length > 0 && en.vis.length < 16 && !en.vis.some((v) => /ward|private|consult|nurses|store|corr1/.test(v)), `3 in the lobby only ground-floor rooms are drawn: ${en.vis}`);
  }

  // ---------------------------------------------------------------- 4 · lobby: prompts at the counter, a seat, the hatch
  if (want('lobby')) {
    const lb = await page.evaluate(async () => { const g = window.__game, P = g.player, H = g.hospital, I = window.__Input; const r = {}; const SP = H.plan.SPOTS;
      const at = async (u, v, f = 0) => { const [x, z] = H.toWorld(u, v); H.placeInside(P, x, z, f); await g.stepSim(2, 0.05); return H.interact(P, () => 'E'); };
      const press = async () => { I.pressed.add(I.code('interact')); const t = H.interact(P, () => 'E'); I.pressed.clear(); await g.stepSim(4, 0.05); return t; };
      r.counter = await at(SP.recCounter[1], SP.recCounter[2]);
      const subs = []; const o = g.hud.subtitle; g.hud.subtitle = function (w, t, ...a) { subs.push(w + ': ' + t); return o.call(this, w, t, ...a); };
      await press(); r.subs = subs.slice(); g.hud.subtitle = o;
      const s = H.seats.seatA; r.seatPrompt = await at(s.app[1], s.app[2]); await press(); r.sat = !!H.seat; r.seatTop = +H.seat?.top.toFixed(3); r.posed = !!P.posed; r.standPrompt = H.interact(P, () => 'E'); await press(); r.stood = !H.seat && !P.posed;
      r.hatch = await at(SP.lobbyHatch[1], SP.lobbyHatch[2]);
      return r; });
    ok(/receptionist/i.test(lb.counter || '') && lb.subs.length === 1 && /^Receptionist:/.test(lb.subs[0]), `4 reception counter prompt "${lb.counter}" → ${lb.subs[0]}`);
    ok(/Sit/.test(lb.seatPrompt || '') && lb.sat && lb.posed && lb.seatTop >= 0.25 && lb.seatTop <= 0.6 && /Stand/.test(lb.standPrompt || '') && lb.stood, `4 waiting seat: "${lb.seatPrompt}" → seated (shell at ${lb.seatTop} m) → "${lb.standPrompt}" → up`);
    ok(/Pharmacy/.test(lb.hatch || ''), `4 pharmacy hatch prompt "${lb.hatch}"`);
  }

  // ---------------------------------------------------------------- 5 · up the stairs on foot; the lift back down
  if (want('floors')) {
    const fl = await page.evaluate(async () => { const g = window.__game, P = g.player, H = g.hospital, I = window.__Input; const r = { path: [] }; const ST = H.plan.STAIR;
      const [x0, z0] = H.toWorld((ST.u0 + ST.u1) / 2, ST.v0 - 1.0); H.placeInside(P, x0, z0, 0); await g.stepSim(2, 0.05);
      // walk "up" the flight (+v local = −z world): camera behind, W held
      const fw = I.code('forward'); I.down.add(fw); P.control = true; let n = 0;
      while (n++ < 200) { P.camYaw = 0; await g.stepSim(1, 0.05); if (n % 20 === 0) r.path.push([+P.y.toFixed(2), H.curRoom && H.curRoom.id]); if (P.y > H.FLOOR_Y[1] - 0.01 && n > 40) { const [u, v] = H.toLocal(P.x, P.z); if (v > ST.v1 + 1.2) break; } }
      I.down.delete(fw); r.yTop = +P.y.toFixed(2); r.room = H.curRoom && H.curRoom.id; r.f1 = H.FLOOR_Y[1]; r.vis = H.visibleRooms();
      // the lift: call it, ride it down
      const LF = H.plan.LIFT; const [lx, lz] = H.toWorld((LF.u0 + LF.u1) / 2, (LF.v0 + LF.v1) / 2); H.placeInside(P, lx, lz, 1); P.y = H.FLOOR_Y[1]; H.lift.floor = 1; H.lift.state = 'open'; H.lift.t = 0; await g.stepSim(3, 0.05);
      r.liftPrompt = H.interact(P, () => 'E'); I.pressed.add(I.code('interact')); H.interact(P, () => 'E'); I.pressed.clear();
      for (let i = 0; i < 160 && H.lift.state !== 'open'; i++) await g.stepSim(1, 0.05); await g.stepSim(4, 0.05);
      r.liftFloor = H.lift.floor; r.yLift = +P.y.toFixed(2); r.f0 = H.FLOOR_Y[0]; r.roomAfter = H.curRoom && H.curRoom.id; return r; });
    console.log('   stairs', JSON.stringify(fl.path));
    ok(Math.abs(fl.yTop - fl.f1) < 0.05 && /corr1|stairs/.test(fl.room || ''), `5 walked up the stairs: y ${fl.yTop} (floor 1 = ${fl.f1}), room ${fl.room}, drawn ${fl.vis}`);
    ok(/Lift/.test(fl.liftPrompt || '') && fl.liftFloor === 0 && Math.abs(fl.yLift - fl.f0) < 0.05, `5 lift: "${fl.liftPrompt}" → floor ${fl.liftFloor}, y ${fl.yLift}`);
  }

  // ---------------------------------------------------------------- 6 · staff routines (2 game-minutes in the ward, then the lobby)
  if (want('npc')) {
    const np = await page.evaluate(async () => { const g = window.__game, P = g.player, H = g.hospital; const r = { moves: {}, inObs: [], tiers: [] };
      const [x, z] = H.toWorld(0, 4); H.placeInside(P, x, z, 1); P.y = H.FLOOR_Y[1]; await g.stepSim(2, 0.05);
      const start = Object.fromEntries(H.people.map((p) => [p.key, [p.u, p.v, p.f]])); const seen = Object.fromEntries(H.people.map((p) => [p.key, new Set()]));
      for (let i = 0; i < 600; i++) { await g.stepSim(1, 0.2); for (const p of H.people) { seen[p.key].add(p.phase + (p.ch.anim.action ? ':' + p.ch.anim.action : ''));
          if (p.phase === 'walk') { const [wx, wz] = H.toWorld(p.u, p.v); for (const o of H.obs[p.f]) { if (o.x0 > 1e8 || o.tag === 'door' || o.tag === 'slide') continue; if (wx > o.x0 + 0.05 && wx < o.x1 - 0.05 && wz > o.z0 + 0.05 && wz < o.z1 - 0.05) { r.inObs.push(p.key + '@' + (o.tag || '?') + ' ' + p.u.toFixed(1) + ',' + p.v.toFixed(1)); break; } } } }
        if (i % 100 === 0) r.tiers.push(JSON.stringify(H.npcTiers())); }
      for (const p of H.people) r.moves[p.key] = { from: start[p.key].map((n) => +n.toFixed(1)), to: [+p.u.toFixed(1), +p.v.toFixed(1), p.f], phases: [...seen[p.key]].slice(0, 10) };
      r.inObs = [...new Set(r.inObs)].slice(0, 12); r.ms = +H.stats.ms.toFixed(3); return r; });
    for (const [k, m] of Object.entries(np.moves)) console.log(`   ${k}: ${JSON.stringify(m)}`);
    console.log('   tiers', np.tiers.join(' '));
    ok(np.moves.nurse.phases.some((q) => /walk/.test(q)) && np.moves.nurse.phases.some((q) => /seated/.test(q)), '6 ward nurse: sits at the station and walks the rounds');
    ok(np.moves.doctor.phases.some((q) => /seated/.test(q)), '6 doctor works at the consultation desk');
    ok(np.moves.rec.phases.some((q) => /seated/.test(q)), '6 receptionist at her desk');
    ok(np.inObs.length === 0, `6 nobody walks through furniture / walls: ${np.inObs.join('; ') || 'none'}`);
  }

  // ---------------------------------------------------------------- 7 · death → bed → wake → bedside line → invoice (twice)
  if (want('recover')) {
    let rc = await page.evaluate(async () => { const g = window.__game, P = g.player, H = g.hospital, S = g.story; const out = [];
      P.teleport(700, -150, 0); g.world.warm(700, -150); await g.stepSim(2, 0.05); g.bank.account.balance = 20000; S.state.money = 100;
      const subs = []; const o = g.hud.subtitle; g.hud.subtitle = function (w, t, ...a) { subs.push({ w, t }); return o.call(this, w, t, ...a); };
      for (let k = 0; k < 2; k++) { subs.length = 0; const bal0 = g.bank.account.balance; const nInv = (S.state.hospital ? S.state.hospital.invoices.length : 0);
        g.health.damage(500, 'test'); const r = { snaps: [] }; const t0 = performance.now();
        while (g.health.busy && performance.now() - t0 < 90000) { await g.stepSim(1, 0.05); await new Promise((q) => setTimeout(q, 5));
          if (H.recovering && H.lying && !r.onBed) { const fr = H.bedFrame(H.lying.bed); r.onBed = { d: +Math.hypot(P.ch.root.position.x - (fr.cx + fr.fx * 0.8), P.ch.root.position.z - (fr.cz + fr.fz * 0.8)).toFixed(2), y: +(P.ch.root.position.y - fr.top).toFixed(2), rotX: +P.ch.root.rotation.x.toFixed(2), control: P.control, indoor: P.indoor === H.room }; }
          if (subs.length && !r.speaker) { const who = /Doctor/.test(subs[0].w) ? H.doctor : H.nurse; const [wx, wz] = H.toWorld(who.u, who.v); const fr = H.bedFrame(H.recBed); r.speaker = { who: subs[0].w, distBed: +Math.hypot(wx - fr.cx, wz - fr.cz).toFixed(2), standing: !who.ch.anim.seated, visible: who.ch.root.visible, playerUp: !H.lying }; } }
        r.ms = Math.round(performance.now() - t0); r.busy = g.health.busy; r.control = P.control; r.cinematic = P.cinematic; r.hp = g.health.hp; r.subs = subs.map((q) => q.w + ': ' + q.t); r.line = g.health.last && g.health.last.line;
        r.invoices = S.state.hospital.invoices.length - nInv; r.inv = S.state.hospital.invoices[0]; r.charged = bal0 - g.bank.account.balance; r.hist = g.bank.account.history.filter((h) => h.type === 'medical').length; r.indoor = P.indoor === H.room; r.room = H.curRoom && H.curRoom.id; r.posed = !!P.posed;
        out.push(r); await g.stepSim(10, 0.05); }
      g.hud.subtitle = o;
      // afterwards the speaker walks back to work — through the doors, not the furniture
      const bad = new Set(), ph = new Set(); for (let i = 0; i < 400; i++) { await g.stepSim(1, 0.2); for (const p of [H.doctor, H.nurse]) { ph.add(p.key + ':' + p.phase); if (p.phase !== 'walk') continue; const [wx, wz] = H.toWorld(p.u, p.v); for (const ob of H.obs[p.f]) { if (ob.x0 > 1e8 || ob.tag === 'door' || ob.tag === 'slide') continue; if (wx > ob.x0 + 0.05 && wx < ob.x1 - 0.05 && wz > ob.z0 + 0.05 && wz < ob.z1 - 0.05) { bad.add(p.key + '@' + (ob.tag || '?') + ' ' + p.u.toFixed(1) + ',' + p.v.toFixed(1)); break; } } } }
      return { list: out, after: { bad: [...bad].slice(0, 10), phases: [...ph], docSeat: H.doctor.phase, nurseSeat: H.nurse.phase } }; });
    const rcAfter = rc.after; rc = rc.list;
    rc.forEach((r, i) => console.log(`   recovery ${i + 1}: ${JSON.stringify({ ...r, inv: r.inv && { no: r.inv.no, total: r.inv.total, paidBank: r.inv.paidBank, status: r.inv.status } })}`));
    for (const [i, r] of rc.entries()) {
      ok(!r.busy && r.control && !r.cinematic && r.hp === 100 && !r.posed, `7.${i + 1} control back after ${r.ms} ms, hp ${r.hp}`);
      ok(r.onBed && r.onBed.indoor && !r.onBed.control && Math.abs(r.onBed.rotX + 1.57) < 0.05, `7.${i + 1} lying on the bed during the cinematic ${JSON.stringify(r.onBed)}`);
      ok(r.subs.length === 1 && r.speaker && r.speaker.standing && r.speaker.distBed < 1.6, `7.${i + 1} one line by a standing ${r.speaker && r.speaker.who} beside the bed: ${r.subs[0]} (${JSON.stringify(r.speaker)})`);
      ok(r.invoices === 1 && r.charged === r.inv.total && r.inv.paidBank === r.inv.total, `7.${i + 1} one invoice ${r.inv && r.inv.no}, Rs ${r.charged} charged to the bank`);
    }
    console.log('   after', JSON.stringify(rcAfter));
    ok(rcAfter.bad.length === 0, `7 the speaker walks back to work without crossing furniture/walls: ${rcAfter.bad.join('; ') || 'ok'}`);
    ok(rc.length === 2 && rc[0].line !== rc[1].line && rc[0].inv.no !== rc[1].inv.no, `7 no repeated line (${rc.map((r) => r.line)}) and distinct invoices`);
  }

  // ---------------------------------------------------------------- 8 · a civilian down near the hospital: bystander call → ambulance → hospital bay
  if (want('ems')) {
    const em = await page.evaluate(async () => { const g = window.__game, P = g.player, H = g.hospital, C = g.crowd, E = g.police.ems; const r = { log: [], jumps: [], phases: [] };
      P.teleport(697, -186, -Math.PI * 0.6); g.world.warm(697, -186); await g.stepSim(20, 0.1); // inside the compound, off the ED drive (watching the street and the bay)
      let p = C.peds.filter((q) => q.state !== 'down' && !q.dead && q.ch.root.parent).sort((a, b) => Math.hypot(a.x - 676, a.z + 166) - Math.hypot(b.x - 676, b.z + 166))[0]; if (!p) return { err: 'no ped' };
      p.x = 672; p.z = -173.6; p.ch.root.position.set(p.x, p.ch.root.position.y, p.z); C.kill(p); p.deadT = 400; // long gone: CPR will not bring them back → the stretcher → the hospital
      let u = null, last = null, t = 0; const seen = new Set();
      for (let i = 0; i < 9000; i++) { await g.stepSim(1, 0.1); t += 0.1; if (p.deadT < 400 && !u) p.deadT = 400;
        if (!u && E.units.length) { u = E.units[0]; r.dispatchT = +t.toFixed(1); r.incidentsBefore = E.stats.incidents; const v = u.v; r.spawnD = +Math.hypot(v.x - p.x, v.z - p.z).toFixed(0); r.spawnSeen = g.police.inView(v); }
        if (u) { const v = u.v; if (!v) { r.removed = +t.toFixed(1); break; } const ph = u.e.ph + (u.e.toBay ? ':' + u.e.toBay : '') + (u.e.bp ? ':' + u.e.bp : ''); if (!seen.has(ph)) { seen.add(ph); r.phases.push(ph + '@' + t.toFixed(0)); }
          if (last) { const d = Math.hypot(v.x - last.x, v.z - last.z); if (d > Math.max(3, last.sp * 0.1 * 3 + 1)) r.jumps.push(+d.toFixed(1) + '@' + t.toFixed(0)); } last = { x: v.x, z: v.z, sp: Math.max(v.speed, 1) };
          if (i % 100 === 0) r.log.push([+t.toFixed(0), u.e.ph, +v.x.toFixed(0), +v.z.toFixed(0), +v.speed.toFixed(1), u.e.dbg ? u.e.dbg.join('/') : '', u.e.replans || 0]);
          if (u.e.ph === 'parked' && !r.parkedAt) { r.parkedAt = +t.toFixed(1); const B = H.emsBay; r.bayErr = +Math.hypot(v.x - B.x, v.z - B.z).toFixed(2); r.bayYawErr = +Math.abs(Math.atan2(Math.sin(v.yaw - B.yaw), Math.cos(v.yaw - B.yaw))).toFixed(2); r.cargoLeft = (u.e.cargo || []).length + (u.e.st ? 1 : 0); r.units = E.units.length; break; } }
        if (E.units.length > 1) r.dup = true; }
      r.stats = { ...E.stats }; r.incidents = E.incidents.size; r.pAwait = !!p.awaitMedic; r.pInCrowd = C.peds.includes(p);
      // a second body at once: still one unit on the road; it is queued, not doubled
      return r; });
    console.log('   ems', JSON.stringify(em));
    ok(!em.err && em.dispatchT > 8 && em.spawnD > 60, `8 bystander call: ambulance dispatched after ${em.dispatchT} s, spawned ${em.spawnD} m away${em.spawnSeen ? ' (in view!)' : ''}`);
    ok(em.jumps && em.jumps.length === 0, `8 the ambulance drove (no jumps): ${em.jumps && em.jumps.join(', ')}`);
    ok(em.phases && em.phases.some((q) => /^leave:road/.test(q)) && em.phases.some((q) => /^leave:in/.test(q)) && em.parkedAt, `8 transport → gate → bay: ${em.phases && em.phases.join(' ')}`);
    ok(em.bayErr < 1.0 && em.bayYawErr < 0.2, `8 stopped in the bay (${em.bayErr} m, yaw err ${em.bayYawErr})`);
    ok(em.stats && em.stats.delivered === 1 && em.cargoLeft === 0 && !em.dup, `8 handed over at the emergency entrance, props cleaned up, never two units (${JSON.stringify(em.stats)})`);
  }
  if (want('ems2')) { // two bodies at once (one unit on the road, the second queued, never doubled); then a run whose route fails
    const e2 = await page.evaluate(async () => { const g = window.__game, P = g.player, C = g.crowd, E = g.police.ems; const r = { maxActive: 0, maxUnits: 0, sentAt: [], perPed: {} };
      for (const u of [...E.units]) E.removeUnit(u); E.incidents.clear(); const s0 = { ...E.stats };
      P.teleport(697, -186, -Math.PI * 0.6); g.world.warm(697, -186); await g.stepSim(20, 0.1);
      const peds = C.peds.filter((q) => q.state !== 'down' && !q.dead && q.ch.root.parent).sort((a, b) => Math.hypot(a.x - 670, a.z + 172) - Math.hypot(b.x - 670, b.z + 172)).slice(0, 2); if (peds.length < 2) return { err: 'peds' };
      const spots = [[672, -173.6], [662, -173.4]]; peds.forEach((p, i) => { p.x = spots[i][0]; p.z = spots[i][1]; p.ch.root.position.set(p.x, p.ch.root.position.y, p.z); C.kill(p); p.deadT = 400; p.__tid = i; });
      const sent = new Map(); let t = 0;
      for (let i = 0; i < 12000; i++) { await g.stepSim(1, 0.1); t += 0.1; for (const p of peds) if (p.deadT < 400) p.deadT = 400;
        r.maxActive = Math.max(r.maxActive, E.active()); r.maxUnits = Math.max(r.maxUnits, E.units.length);
        for (const u of E.units) if (u.e && u.e.p && u.e.p.__tid != null && !sent.has(u)) { sent.set(u, u.e.p.__tid); r.sentAt.push(u.e.p.__tid + '@' + t.toFixed(0)); r.perPed[u.e.p.__tid] = (r.perPed[u.e.p.__tid] || 0) + 1; }
        if (r.sentAt.length >= 2 && E.active() === 0) break; }
      r.t1 = +t.toFixed(0); r.stats = Object.fromEntries(Object.keys(E.stats).map((k) => [k, E.stats[k] - (s0[k] || 0)]));
      // navigation failure: the route to the hospital cannot be planned → no freeze, the unit drives on and is recycled, props cleaned
      for (const u of [...E.units]) E.removeUnit(u); E.incidents.clear(); const s1 = { ...E.stats }; const keep = E.planBay; E.planBay = () => false;
      const q = C.peds.filter((x) => x.state !== 'down' && !x.dead && x.ch.root.parent).sort((a, b) => Math.hypot(a.x - 670, a.z + 172) - Math.hypot(b.x - 670, b.z + 172))[0];
      q.x = 668; q.z = -173.5; q.ch.root.position.set(q.x, q.ch.root.position.y, q.z); C.kill(q); q.deadT = 400; let u = null; t = 0; const f0 = performance.now(); let worst = 0;
      for (let i = 0; i < 6000; i++) { const a = performance.now(); await g.stepSim(1, 0.1); worst = Math.max(worst, performance.now() - a); t += 0.1; if (q.deadT < 400) q.deadT = 400; if (!u && E.units.length) u = E.units[0];
        if (u && !E.units.includes(u)) break; if (u && u.e && u.e.ph === 'leave' && !u.__far) { u.__far = true; } if (u && u.__far && t > 0) { const v = u.v; if (v && Math.hypot(v.x - P.x, v.z - P.z) < 1e9 && u.e.ph === 'leave' && !u.e.toBay && !u.e.transport) { P.teleport(400, -400, 0); g.world.warm(400, -400); } } }
      E.planBay = keep; r.fail = { t: +t.toFixed(0), removed: !!u && !E.units.includes(u), stats: Object.fromEntries(Object.keys(E.stats).map((k) => [k, E.stats[k] - (s1[k] || 0)])), cargo: u && u.e ? (u.e.cargo || []).length : 0, worstStep: +worst.toFixed(0), wall: +((performance.now() - f0) / 1000).toFixed(0) };
      return r; });
    console.log('   ems2', JSON.stringify(e2));
    ok(!e2.err && e2.sentAt.length === 2 && e2.maxActive === 1 && e2.maxUnits <= 2 && e2.perPed[0] === 1 && e2.perPed[1] === 1, `8b two bodies: one unit at a time, the second queued and answered, nobody twice (${e2.sentAt && e2.sentAt.join(', ')}; max active ${e2.maxActive}, vehicles ${e2.maxUnits})`);
    ok(e2.fail && e2.fail.removed && e2.fail.stats.bayFail >= 1 && e2.fail.cargo === 0, `8c route failure: no freeze, the unit drives on and is recycled, props cleaned (${JSON.stringify(e2.fail)})`);
  }
} catch (e) { errors.push('test: ' + (e.stack || e)); }
console.log('errors:', errors.length ? errors.slice(0, 12).join('\n  ') : 'none');
ok(errors.length === 0, 'no page errors');
console.log(`${passes} passed, ${fails} failed`);
await browser.close(); process.exit(fails ? 1 : 0);
