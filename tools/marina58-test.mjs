// 58th request end-to-end (headless Chromium, no rendering): the berth bought in person at its For Sale sign (click prompt,
// purchase, cinematic, map blips, the sign turns into "PRIVATE BERTH"), a swimmer can't pass through a pontoon float (climbs out
// or stays outside it), boarding a big yacht from her finger over the side deck, stealing her (2★ + harbour police boats
// come out), being caught by a police boat once stopped → arrested ashore, the dock crew working, and a drive-by from a car
// (gun up in the right hand, shots fired, the car's own body not hit).
//   node tools/marina58-test.mjs            PORT env (default 5199)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], defaultViewport: { width: 640, height: 360 } });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const ONLY = (process.env.STAGES || '').split(',').filter(Boolean);
const stage = async (p, name, fn, checks) => { if (ONLY.length && !ONLY.includes(name)) return null; let r; try { r = await p.evaluate(fn); console.log(name, JSON.stringify(r)); } catch (e) { ok(false, `${name}: ${String(e.message || e).split('\n').slice(0, 3).join(' | ')}`); return null; } try { checks(r); } catch (e) { ok(false, `${name} checks: ${e.message}`); } return r; };
try {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e.stack || e).split('\n').slice(0, 3).join(' | ')));
  await p.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await p.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });

  await stage(p, 'berth', async () => {
    const g = window.__game, B = g.boats, P = g.player, I = window.__Input; g.noRender = true; g.atmos.hour = 10; g.debugCon.exec('god on'); const out = {};
    const S = g.story.state; S.money = 2e9; S.msgs = [];
    P.teleport(232.5, -1199.5, 0); g.world.warm(190, -1250); await g.stepSim(10, 0.05);
    out.blipSale = !!g.hud.blips.find((q) => q.id === 'marina:sale'); out.orderBefore = B.order('dondra26').ok;
    out.siteRow = true;
    P.teleport(190, -1287.2, 0); await g.stepSim(6, 0.05); out.pos = [+P.x.toFixed(2), +P.y.toFixed(2), +P.z.toFixed(2)]; out.near = B.saleNear(P); out.prompt = String(B.interact(P, (k) => k) || '');
    const punch0 = g.weapons.punchCd || 0; const m0 = S.money; I.mousePressed.add(0); await g.stepSim(1, 0.05);
    out.bought = B.state().slip; out.paid = m0 - S.money; out.cine = !!B.cine; out.camOverride = P.camOverride; out.punched = (g.weapons.punchCd || 0) > punch0 + 0.01;
    await g.stepSim(Math.round(9 * 20), 0.05); out.cineDone = !B.cine && !P.camOverride && P.control;
    out.blipBerth = !!g.hud.blips.find((q) => q.id === 'marina:berth'); out.blipSaleGone = !g.hud.blips.find((q) => q.id === 'marina:sale');
    out.blips = g.hud.blips.filter((q) => /^marina/.test(q.id)).map((q) => q.id);
    out.order = B.order('dondra26').ok; out.msg = (S.msgs || []).some((m) => /Berth T-1/.test(m.text || ''));
    return out;
  }, (r) => {
    ok(r.blipSale, 'map: "berth for sale" blip at the marina before buying'); ok(!r.orderBefore, 'boats cannot be ordered without the berth');
    ok(r.near && /Purchase/.test(r.prompt), `near the For Sale sign: "${r.prompt}"`); ok(r.bought && r.paid === 3500000, `click buys it (paid ${r.paid})`); ok(!r.punched, 'the click did not throw a punch');
    ok(r.cine && r.camOverride, 'purchase cinematic starts'); ok(r.cineDone, 'cinematic ends, control back'); ok(r.blipBerth && r.blipSaleGone, 'map: "Your berth" blip replaces the sale blip'); ok(r.order, 'boats can be ordered after buying'); });

  await stage(p, 'swim', async () => {
    const g = window.__game, P = g.player, I = window.__Input; const out = {};
    P.teleport(179.5, -1228.5, Math.PI / 2); await g.stepSim(40, 0.05); out.swim0 = !!P.swim; out.y0 = +P.y.toFixed(2);
    const isDown = I.isDown.bind(I); I.isDown = (a) => a === 'forward' || isDown(a); P.camYaw = -Math.PI / 2; let inside = 0, minX = 1e9, maxX = -1e9;
    for (let i = 0; i < 160; i++) { await g.stepSim(1, 0.05); if (P.swim && P.x > 183.6 && P.x < 186.4) inside++; maxX = Math.max(maxX, P.x); if (i % 8 === 0) (out.tr || (out.tr = [])).push([+P.x.toFixed(1), +P.y.toFixed(2), P.swim ? 's' : P.climb ? 'c' : 'w']); }
    I.isDown = isDown; out.inside = inside; out.maxX = +maxX.toFixed(2); out.x = +P.x.toFixed(2); out.y = +P.y.toFixed(2); out.swim = !!P.swim; out.climbed = !P.swim && P.y > -0.6; void minX; return out;
  }, (r) => { ok(r.swim0, 'in the water, swimming'); ok(r.inside === 0, `never swims through the spine pontoon (${r.inside} frames inside; ended x ${r.x} y ${r.y})`); });

  await stage(p, 'steal', async () => {
    const g = window.__game, B = g.boats, P = g.player, I = window.__Input; const out = {};
    const M = (await import('/src/boats/Marina.js').catch(() => null)); void M;
    const cand = B.all.filter((q) => q.mode === 'moored' && q.home && (q.home.side === 'W' || q.home.side === 'E') && q.len > 11 && !q.owned && !q.owner && !q.away).sort((a, c) => c.len - a.len)[0];
    if (!cand) return { none: true }; out.id = cand.id; out.len = cand.len;
    const zfs = []; for (let k = 0; k <= 7; k++) zfs.push(-1201 - 11 * k); const zf = zfs.reduce((a, z) => (Math.abs(z - cand.z) < Math.abs(a - cand.z) ? z : a), zfs[1]);
    const side = cand.home.side; const x = side === 'W' ? Math.max(172.6, Math.min(182.8, cand.x)) : Math.max(187.2, Math.min(200, cand.x)); P.teleport(x, zf + Math.sign(cand.z - zf) * 0.35, 0); await g.stepSim(6, 0.05);
    out.onDeck = +P.y.toFixed(2); const nb = B.nearestBoard(P); out.nearest = nb && nb.id; out.prompt = String(B.interact(P, (k) => k) || '');
    I.pressed.add('KeyF'); await g.stepSim(1, 0.05); out.stolen = !!cand.stolen; out.riding = !!B.ride; out.stars = g.police.stars();
    await g.stepSim(60, 0.05); out.stage = B.ride && B.ride.stage; out.seatDy = +(P.ch.root.getWorldPosition(new P.ch.root.position.constructor()).y - cand.y).toFixed(2);
    out.policeOut = B.police.filter((q) => q.active).length; out.chase = !!B.chase;
    // the police boat catches up and comes alongside a stopped boat
    cand.speed = 0; cand.u = 0; const q = B.police.find((pb) => pb.active) || B.police[0]; const [px, pz] = cand.local(cand.model.halfBeam + 4, 0); q.place(px, pz, cand.yaw, true); q.speed = 0;
    let caught = false; const tick = () => new Promise((r) => setTimeout(r, 30)); /* HUD fades run on real timers */ for (let i = 0; i < 160 && !caught; i++) { await g.stepSim(1, 0.05); await tick(); q.place(px, pz, cand.yaw, true); caught = !!(g.police.busy || g.police.cine); }
    const C = B.chase; out.dbg = C ? { near: +C.near.toFixed(2), off: C.off, t: +C.t.toFixed(1), qAct: q.active, qLeave: q.leaving, d: +Math.hypot(q.x - cand.x, q.z - cand.z).toFixed(1), spd: +cand.speed.toFixed(2), ride: !!B.ride } : 'no chase'; out.stars2 = g.police.stars();
    out.caught = caught; for (let i = 0; i < 40 && !g.police.cine; i++) { await g.stepSim(1, 0.05); await tick(); } out.offBoat = !P.boat; out.ashore = Math.hypot(P.x - 232.5, P.z + 1199.5) < 30 || (g.police.lastPenalty && g.police.lastPenalty.kind === 'arrest'); out.backHome = !cand.stolen && cand.mode === 'moored';
    // let the arrest play out
    for (let i = 0; i < 400 && (g.police.busy || g.police.cine); i++) { await g.stepSim(2, 0.05); await tick(); } out.arrested = !!(g.police.lastPenalty && g.police.lastPenalty.kind === 'arrest');
    return out;
  }, (r) => {
    ok(!r.none, 'a moored yacht to steal'); ok(r.nearest === r.id, `from her finger: nearest boat is her (${r.nearest}, ${r.len} m) — side-deck boarding`); ok(/Steal/.test(r.prompt), `prompt: "${r.prompt}"`);
    ok(r.stolen && r.riding && r.stars >= 2, `stolen: boarded, ${r.stars}★`); ok(r.stage === 'ride', 'at the helm after boarding'); ok(r.policeOut >= 1 && r.chase, `harbour police out after her (${r.policeOut})`);
    ok(r.caught, 'police boat alongside a stopped boat → arrest'); ok(r.offBoat && r.backHome, 'player off the boat; the yacht is back at her berth'); ok(r.arrested, 'arrest completed'); });

  await stage(p, 'board', async () => {
    const g = window.__game, B = g.boats, P = g.player, I = window.__Input, V3 = window.__THREE.Vector3; const tick = () => new Promise((r) => setTimeout(r, 30)); const res = [];
    const S = g.story.state; S.money = 2e9; g.police.level = 0; const st = B.state(); if (!st.slip) B.buyBerth(true); for (const id of ['meridian72', 'serendib128']) if (!B.owns(id)) B.order(id, true); B.deliver(true);
    const fz = (z) => { let best = 0, bd = 1e9; for (let k = 1; k <= 7; k++) { const zf = -1201 - 11 * k; if (Math.abs(z - zf) < bd && z > zf) { bd = Math.abs(z - zf); best = zf; } } return best; };
    const tryBoat = async (bt, where) => { const o = { id: bt.id, len: bt.len, where }; await g.stepSim(4, 0.05); P.teleport(where[0], where[1], 0); g.world.warm(where[0], where[1]); await g.stepSim(8, 0.05);
      o.from = [+P.x.toFixed(1), +P.y.toFixed(2), +P.z.toFixed(1)]; o.nearest = B.nearestBoard(P)?.id || null; o.entrySide = !!bt._entry?.side; o.prompt = String(B.interact(P, (k) => k) || '');
      I.pressed.add('KeyF'); await g.stepSim(1, 0.05); for (let i = 0; i < 160 && !(B.ride && B.ride.stage === 'ride'); i++) { await g.stepSim(1, 0.05); await tick(); }
      o.stage = B.ride && B.ride.stage; const sp = bt.root.localToWorld(new V3(bt.model.seat.x, bt.model.seat.y, bt.model.seat.z)); const hp = P.ch.root.getWorldPosition(new V3()); o.seatErr = +Math.hypot(hp.x - sp.x, hp.z - sp.z).toFixed(2); o.seatDy = +(hp.y - sp.y).toFixed(2);
      if (B.ride) B.leave(P); for (let i = 0; i < 160 && (B.ride || P.boat); i++) { await g.stepSim(1, 0.05); await tick(); } await g.stepSim(10, 0.05);
      o.off = !B.ride && !P.boat; o.after = [+P.x.toFixed(1), +P.y.toFixed(2), +P.z.toFixed(1)]; o.swim = !!P.swim; o.ctl = P.control; return o; };
    // finger / quay boats of each kind
    const seen = new Set(); const moored = B.all.filter((q) => q.mode === 'moored' && q.home && !q.owner && !q.away && q.root.visible).sort((a, c) => c.len - a.len);
    for (const bt of moored) { if (seen.has(bt.id) || seen.size >= 4) continue; seen.add(bt.id); bt.free = true; const sd = bt.home.side; let where;
      if (sd === 'Q') where = [230.9, bt.z]; else { const zf = fz(bt.z); where = [sd === 'W' ? 179 : 190, zf + 0.3]; }
      res.push(await tryBoat(bt, where)); bt.free = false; }
    // the player's own yachts on Berth T-1 (south of the T-head)
    for (let n = 0; n < 2; n++) { const bt = B.slipBoat; if (!bt) break; res.push(await tryBoat(bt, [bt.x + (n ? 4 : -3), -1287.6])); B.switchNext(); await g.stepSim(4, 0.05); }
    return res;
  }, (r) => { for (const o of r) { ok(o.nearest === o.id && /Board/.test(o.prompt), `${o.id} (${o.len} m): boardable from where you stand (${o.entrySide ? 'side deck' : 'stern'}) "${o.prompt}"`);
    ok(o.stage === 'ride' && o.seatErr < 0.6 && Math.abs(o.seatDy) < 1.2, `${o.id}: at the helm (seat err ${o.seatErr} m, dy ${o.seatDy})`); ok(o.off && o.ctl && !o.swim && o.after[1] > -0.8, `${o.id}: gets off onto the pontoon/quay, not into the water (${o.after})`); } });

  await stage(p, 'owner', async () => {
    const g = window.__game, B = g.boats, P = g.player; const tick = () => new Promise((r) => setTimeout(r, 5)); const out = { runs: [] }; g.atmos.hour = 10;
    P.teleport(232.5, -1199.5, Math.PI); g.camera.position.set(232, 4, -1199); await g.stepSim(4, 0.05); B.eventT = 1e9;
    const cands = B.berths.filter((q) => q.boat && q.walk && !q.boat.away && !q.boat.owner && q.boat.mode === 'moored');
    for (const Bq of [cands.find((q) => q.side === 'W'), cands.find((q) => q.side === 'E'), B.berths.find((q) => q.side === 'Q' && q.boat && !q.boat.away)].filter(Boolean)) {
      const b = Bq.boat; const o = { id: b.id, side: Bq.side, started: B.startDeparture(Bq) }; if (!o.started) { out.runs.push(o); continue; } const O = b.owner; const x0 = b.x, z0 = b.z; let wet = 0, minY = 9; const stages = [];
      for (let i = 0; i < 2400; i++) { await g.stepSim(1, 0.05); if (i % 10 === 0) await tick(); const s2 = b.owner ? b.owner.stage : 'gone'; if (stages[stages.length - 1] !== s2) stages.push(s2);
        if (b.owner && (O.stage === 'walk')) { minY = Math.min(minY, O.y); if (O.y < -0.6) wet++; } if (Math.hypot(b.x - x0, b.z - z0) > 40 || b.away) break; }
      o.stages = stages; o.wet = wet; o.minY = +minY.toFixed(2); o.moved = +Math.hypot(b.x - x0, b.z - z0).toFixed(1); o.away = !!b.away; o.mode = b.mode; o.wrecked = !!b.wrecked; out.runs.push(o); }
    return out;
  }, (r) => { ok(r.runs.length >= 2, `${r.runs.length} departures tried`); for (const o of r.runs) { ok(o.started && o.stages.includes('board') && o.stages.includes('aboard') && o.stages.includes('outbound'), `${o.id} (${o.side}): owner walks out, boards, casts off — ${(o.stages || []).join('→')}`); ok(o.wet === 0, `${o.id}: owner stays on the pontoons (min y ${o.minY})`); ok(o.moved > 30, `${o.id}: she leaves the berth (${o.moved} m)`); ok(!o.wrecked, `${o.id}: no collision damage`); } });

  await stage(p, 'arrive', async () => {
    const g = window.__game, B = g.boats, P = g.player; const tick = () => new Promise((r) => setTimeout(r, 5)); const out = { runs: [] }; g.atmos.hour = 10;
    P.teleport(232.5, -1199.5, Math.PI); await g.stepSim(4, 0.05); B.eventT = 1e9;
    for (const sd of ['W', 'E']) { const Bq = B.berths.find((q) => q.side === sd && q.boat && !q.boat.away && !q.boat.owner && q.boat.mode === 'moored'); if (!Bq) continue; const b = Bq.boat; const o = { id: b.id, side: sd };
      b.away = true; b.root.visible = false; b.awayT = 0; P.teleport(234, -1199.5, Math.PI / 2); P.camYaw = Math.PI / 2; await g.stepSim(6, 0.05); /* looking inland: she must not pop into view */ o.started = B.startArrival(b); const stages = [];
      for (let i = 0; i < 6000; i++) { await g.stepSim(1, 0.05); if (i % 10 === 0) await tick(); const s2 = b.owner ? b.owner.stage : 'gone'; if (stages[stages.length - 1] !== s2) stages.push(s2); if (s2 === 'walkOut' || s2 === 'gone') break; }
      o.stages = stages; o.dz = +(b.z - Bq.zAt(b.model.halfBeam)).toFixed(2); o.dx = +(b.x - Bq.x(b.len, b.model.halfBeam)).toFixed(2); o.mode = b.mode; o.wrecked = !!b.wrecked; out.runs.push(o); }
    return out;
  }, (r) => { for (const o of r.runs) { ok(o.stages.includes('moor') && o.mode === 'moored', `${o.id} (${o.side}) comes home: ${o.stages.join('→')}`); ok(Math.abs(o.dz) < 0.3 && Math.abs(o.dx) < 0.5, `${o.id}: lies alongside her finger (off by ${o.dx}, ${o.dz} m)`); ok(!o.wrecked, `${o.id}: undamaged`); } });

  await stage(p, 'crew', async () => {
    const g = window.__game, B = g.boats, P = g.player; g.atmos.hour = 11; P.teleport(209, -1199.5, Math.PI); g.camera.position.set(209, 3, -1195); const poses = new Set(); for (let i = 0; i < 180; i++) { await g.stepSim(20, 0.05); for (const c of B.dock.info()) if (c.pose) poses.add(c.job + ':' + c.pose); }
    return { crew: B.dock.info(), poses: [...poses] };
  }, (r) => { ok(r.crew.length === 4 && r.crew.every((c) => c.vis), 'four marina workers on the pontoons by day'); ok(r.poses.some((q) => /lines:medKneel|wash:pump/.test(q)), 'at work: ' + r.poses.join(', ')); ok(r.crew.some((c) => c.walking) || r.crew.some((c) => c.pose), 'they walk / work (' + r.crew.map((c) => c.job + ':' + (c.walking ? 'walk' : c.pose)).join(', ') + ')'); });

  await stage(p, 'driveby', async () => {
    const g = window.__game, P = g.player, I = window.__Input, W = g.weapons; const out = {}; g.debugCon.exec('give all');
    P.teleport(-30, -560, 0); g.world.warm(-30, -560); await g.stepSim(20, 0.05); g.debugCon.exec('spawn car vanta'); const v = g.traffic.parked[g.traffic.parked.length - 1]; out.car = !!v;
    P.enterVehicle(v, g.traffic); for (let i = 0; i < 200 && P.vehicle !== v; i++) await g.stepSim(1, 0.05); out.inCar = P.vehicle === v;
    await g.stepSim(20, 0.05); W.sel = W.inv.findIndex((q, i) => q.owned && window.__game.weapons.dbAllowed(i));
    const md = I.mouseButtons; md.add(2); P.camYaw = v.yaw + Math.PI / 2; /* look out to the right */ await g.stepSim(12, 0.05);
    out.why = { control: P.control, entry: !!P.entry, exiting: !!P.exiting, boat: !!P.boat, indoor: !!g.indoor, sel: W.sel, allowed: W.inv.map((q, i) => W.dbAllowed(i) ? i : -1).filter((i) => i >= 0), cine: !!P.cinematic, hb: g.health.busy, polBusy: g.police.busy }; out.dbW = W.db ? +W.db.w.toFixed(2) : 0; out.cur = W.cur; out.gunVis = W.cur >= 0 && W.models[W.cur].visible; out.armIK = !!P.ch.anim.driveBy;
    const iv = W.inv[W.cur]; const m0 = iv ? iv.mag : 0; const hp0 = v.damage || 0; for (let k = 0; k < 4; k++) { I.mousePressed.add(0); await g.stepSim(8, 0.05); } out.shots = m0 - (iv ? iv.mag : 0); out.ownHp = +((v.damage || 0) - hp0).toFixed(3); I.mousePressed.clear();
    md.delete(2); await g.stepSim(20, 0.05); out.lowered = !W.db || W.db.w < 0.05; out.gunHidden = W.cur < 0 || !W.models[W.cur]?.visible; return out;
  }, (r) => { ok(r.inCar, 'in the car'); ok(r.dbW > 0.9 && r.gunVis && r.armIK, `aim held: gun up in the hand (w ${r.dbW})`); ok(r.shots >= 3, `drive-by shots fired (${r.shots})`); ok(!r.ownHp, 'own car not damaged by own shots'); ok(r.lowered && r.gunHidden, 'aim released: gun away'); });

  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' || '));
} catch (e) { ok(false, String(e)); }
await b.close(); console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
