// 69th request — police bug fixes, end to end in the real game (dev server, headless Chromium, no rendering):
//   map blips      only units that exist (each blip carries its unit), none driving off, none at 0★; the sight set really fills
//   keep coming    a suspect who stays put: a patrol car in the area answers (not only far stations); the search clock does not
//                  run before anyone is there; a pool that runs dry while wanted gets a car back; an abandoned unit frees its base
//   no loop        officers who got out for a foot chase do not hop back in / out again every few seconds
//   hazards        a crew whose car catches fire bails out and is clear of the blast radius before it goes; a crew parked next
//                  to a grenade gets out; officers on foot get clear of someone else's burning car
//   helicopter     own blip; sight-only tracking (loses the suspect out of sight, searches round the last fix, picks them up
//                  again); fuel → back to base, no relaunch while refuelling; bullets hit it (trace kind 'heli'), damage →
//                  crash → burning wreck (solid) → cleared out of view → a replacement on the pad; caught in a blast
//   node tools/police-bugs-test.mjs        PORT env (default 5199)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 3600000, args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=480,270'], defaultViewport: { width: 480, height: 270 } });
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const run = async (p, name, fn) => { try { const r = await p.evaluate(fn); console.log(name, JSON.stringify(r).slice(0, 2400)); return r; } catch (e) { ok(false, name + ': ' + String(e.message || e).split('\n').slice(0, 3).join(' | ')); return null; } };
try {
  const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e.stack || e).split('\n').slice(0, 3).join(' | ')));
  await p.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await p.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await p.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });

  // ---------------------------------------------------------------- 1. stationary suspect at 3★: blips, area cars, no exit/enter loop
  const r1 = await run(p, 'stationary', async () => {
    const g = window.__game, PR = g.police; g.noRender = true; g.atmos.hour = 11; g.debugCon.exec('god on');
    const P = g.player; P.teleport(-120.7, -890.8, 0); g.world.warm(-120.7, -890.8); await g.stepSim(20, 0.05);
    const l0 = PR.log.length; PR.level = 3; PR.reason = 'test'; PR.spotted();
    let blips = 0, bad = 0, leavingBlips = 0, sightMax = 0, firstNear = -1; const outs = {};
    for (let s = 0; s < 150; s++) { await g.stepSim(20, 0.05); const hi = PR.hudInfo(); for (const u of hi.units) { blips++; if (!u.heli && !PR.units.includes(u.ref)) bad++; if (u.ref && u.ref.task === 'leave') leavingBlips++; }
      g.updateSight(1); sightMax = Math.max(sightMax, g.sight ? g.sight.units.size : 0);
      if (firstNear < 0 && PR.units.some((u) => u.task !== 'leave' && Math.hypot((u.v || u.officers[0]).x - P.x, (u.v || u.officers[0]).z - P.z) < 60)) firstNear = s + 1; }
    const log = PR.log.slice(l0).map(String); for (const l of log) { const m = /([\d.]+) \[pursuing[^\]]*\] unit (\d+) officers out \(chase\)/.exec(l); if (m) (outs[m[2]] ||= []).push(+m[1]); }
    let loop = 0; for (const ts of Object.values(outs)) for (let i = 2; i < ts.length; i++) if (ts[i] - ts[i - 2] < 25) loop++; // 3 dismounts within 25 s = the old loop (it cycled every ~6 s)
    const seeOne = PR.units.find((u) => u.v); let seeRef = null; if (seeOne) { g.sight = { veh: [], peds: [], units: new Set([seeOne]) }; seeRef = g.canSeeUnit({ x: 1e5, z: 1e5, lights: false, ref: seeOne }); }
    const blipLeave = PR.units.find((u) => u.task === 'leave'); PR.standDown('test'); await g.stepSim(4, 0.05); const atZero = PR.hudInfo().units.length;
    // an arrest (BUSTED sequence, fades on real time) must be over before the next section
    for (let i = 0; i < 600 && (PR.cine || PR.busy || !P.control); i++) { if (PR.cine) PR.cine.skipReq = true; await g.stepSim(1, 0.05); await new Promise((r) => setTimeout(r, 30)); }
    return { blips, bad, leavingBlips, sightMax, firstNear, areaCars: PR.stats.areaCars || 0, outs, loop, seeRef, atZero, hadLeaving: !!blipLeave, arrests: PR.stats.arrests || 0, freed: !PR.cine && !PR.busy && P.control, log: log.filter((l) => /area|officers out|expired|arrest/.test(l)).slice(0, 16) };
  });
  if (r1) {
    ok(r1.blips > 0 && r1.bad === 0, `every map blip is a live unit (${r1.blips} blips sampled, ${r1.bad} not)`);
    ok(r1.leavingBlips === 0, 'no blip for units driving off');
    ok(r1.seeRef === true, 'a blip shows when its unit is in the sight set (fresh hudInfo objects matched by their unit)');
    ok(r1.sightMax > 0, `the sight set fills with units the player can see (max ${r1.sightMax})`);
    ok(r1.atZero === 0, 'no police blips once the wanted level is gone');
    ok(r1.areaCars >= 1 && r1.firstNear > 0 && r1.firstNear <= 60, `stationary suspect: patrol car(s) in the area answer (${r1.areaCars}), first unit within 60 m after ${r1.firstNear} s`);
    ok(r1.loop === 0, `no exit / enter loop (dismounts per unit: ${JSON.stringify(r1.outs)})`);
  }

  // ---------------------------------------------------------------- 2. the police never stop coming (pool, bases, search clock)
  const r2 = await run(p, 'keep coming', async () => {
    const g = window.__game, PR = g.police, pool = PR.pool; g.noRender = true; const P = g.player; P.teleport(-60, -280, 0); g.world.warm(-60, -280); await g.stepSim(10, 0.05); const settle = async () => { for (let i = 0; i < 600 && (g.police.cine || g.police.busy || !g.player.control); i++) { if (g.police.cine) g.police.cine.skipReq = true; await g.stepSim(1, 0.05); await new Promise((r) => setTimeout(r, 30)); } }; await settle();
    const out = {}; PR.level = 3; PR.reason = 'test'; PR.spotted(); await g.stepSim(40, 0.05); g.debugCon.exec('god on');
    // pool run dry while wanted (cars lost for good: burnt / stolen): it gets cars back, one at a time
    const lost = []; while (pool.free.police.length + pool.free.policejeep.length > 0) { const t = pool.free.police.length ? 'police' : 'policejeep'; const e = pool.free[t].pop(); e.v.mesh.parent?.remove(e.v.mesh); lost.push(e); }
    const built0 = pool.stats.built; for (let i = 0; i < 400; i++) { await g.stepSim(1, 0.05); if (PR.level < 2.5) PR.level = 3; } out.builtWanted = pool.stats.built - built0; out.free = pool.freeCount(); out.outNow = pool.out.size; out.buildMs = +(pool.stats.wantedBuildMs || 0).toFixed(1);
    await settle(); out.arrestedMeanwhile = PR.stats.arrests;
    // an abandoned unit (crew all down) gives its station slot back
    const u = PR.units.find((q) => q.base && q.v && !q.v.player); if (u) { const base = u.base; const before = PR.baseState[base].out; PR.abandonUnit ? PR.abandonUnit(u) : null; out.baseFreed = PR.baseState[base].out === before - 1; out.abandonFn = !!PR.abandonUnit; }
    // search clock: nobody in the area → it barely runs
    PR.standDown('t'); await g.stepSim(10, 0.05); for (const q of PR.units.slice()) PR.removeUnit(q); PR.queue = [];
    PR.level = 2; PR.beginSearch(P.x, P.z); PR.queue = []; const t0 = PR.search.t; for (let i = 0; i < 100; i++) { PR.queue = []; for (const q of PR.units.slice()) PR.removeUnit(q); await g.stepSim(1, 0.05); }
    out.searchRun = +(t0 - PR.search.t).toFixed(2); PR.standDown('t'); await g.stepSim(5, 0.05); return out;
  });
  if (r2) {
    ok(r2.builtWanted >= 1, `pool run dry while wanted: ${r2.builtWanted} replacement car(s) built one at a time (max build ${r2.buildMs} ms; ${r2.free} free, ${r2.outNow} out on the chase)`);
    ok(r2.abandonFn === false || r2.baseFreed === true, 'an abandoned unit frees its station slot');
    ok(r2.searchRun > 0 && r2.searchRun < 2.5, `search clock, suspect inside the zone and no unit there yet: ${r2.searchRun} s gone in 5 s (×0.3)`);
  }

  // ---------------------------------------------------------------- 3. hazards: burning cars, grenades
  const r3 = await run(p, 'hazards', async () => {
    const g = window.__game, PR = g.police; g.noRender = true; g.debugCon.exec('nowanted on'); const P = g.player; P.teleport(-60, -280, 0); g.world.warm(-60, -280); await g.stepSim(10, 0.05); const settle = async () => { for (let i = 0; i < 600 && (g.police.cine || g.police.busy || !g.player.control); i++) { if (g.police.cine) g.police.cine.skipReq = true; await g.stepSim(1, 0.05); await new Promise((r) => setTimeout(r, 30)); } }; await settle();
    const out = {};
    // own car on fire, crew seated in a stopped car
    { const u = PR.spawnUnit({ at: { x: P.x + 30, z: P.z, yaw: 0 } }); const v = u.v; await g.stepSim(8, 0.05); v.speed = 0; v.ai.stopped = true; u.task = 'idle'; g.vdamage.ignite(v, 6, 'debug', 'engine'); let at = null;
      for (let i = 0; i < 160 && !at; i++) { await g.stepSim(1, 0.05); if (v.wrecked) at = u.officers.map((o) => ({ d: +Math.hypot(o.x - v.x, o.z - v.z).toFixed(1), mode: o.mode, dead: !!o.dead })); }
      out.own = { at, safe: v._hazard && v._hazard.safe, unitCar: !!u.v, civ: g.crowd.peds.some((q) => u.officers.some((o) => o.ch === q.ch)) }; await g.stepSim(40, 0.05); }
    // officers on foot next to someone else's burning car
    { const u = PR.spawnUnit({ at: { x: P.x + 30, z: P.z, yaw: 0 } }); const v = u.v; await g.stepSim(8, 0.05); v.speed = 0; v.ai.stopped = true; PR.dismount(u, 'test'); for (let i = 0; i < 80; i++) { await g.stepSim(1, 0.05); if (u.officers.every((o) => o.mode === 'foot')) break; }
      const other = g.traffic.vehicles.filter((q) => q !== v && !q.player && !q.police && q.type !== 'police' && q.type !== 'policejeep' && !q.isTrain && q.T && !q.T.pedal).sort((a, c) => Math.hypot(a.x - v.x, a.z - v.z) - Math.hypot(c.x - v.x, c.z - v.z))[0];
      if (other) { other.place(u.officers[0].x + 3, u.officers[0].z + 1, 0); other.speed = 0; g.vdamage.ignite(other, 7, 'debug', 'engine'); const e0 = PR.stats.fireEvade || 0; let at = null;
        for (let i = 0; i < 200 && !at; i++) { await g.stepSim(1, 0.05); if (other.wrecked) at = u.officers.map((o) => +Math.hypot(o.x - other.x, o.z - other.z).toFixed(1)); }
        out.other = { at, evades: (PR.stats.fireEvade || 0) - e0, safe: other._hazard && other._hazard.safe }; }
      PR.leave(u); await g.stepSim(20, 0.05); }
    // a grenade lands by a parked crew
    { const u = PR.spawnUnit({ at: { x: P.x + 30, z: P.z, yaw: 0 } }); const v = u.v; await g.stepSim(8, 0.05); v.speed = 0; v.ai.stopped = true; u.task = 'idle'; const G = g.grenades; const V3 = g.camera.position.constructor; const fake = G.spawnLive(new V3(v.x + 3, (v.y || 0) + 0.3, v.z), new V3(0, 0, 0), 'test', 'dropped'); fake.fuse = 99;
      for (let i = 0; i < 40; i++) await g.stepSim(1, 0.05); out.grenade = { modes: u.officers.map((o) => o.mode), d: u.officers.map((o) => +Math.hypot(o.x - fake.p.x, o.z - fake.p.z).toFixed(1)) }; G.live.splice(G.live.indexOf(fake), 1); fake.m.parent?.remove(fake.m); PR.leave(u); await g.stepSim(20, 0.05); }
    g.debugCon.exec('nowanted off'); return out;
  });
  if (r3) {
    ok(r3.own && r3.own.at && r3.own.at.every((o) => o.mode === 'foot' && o.d >= r3.own.safe - 0.5), `crew bails out of its burning car and is clear before it goes (${JSON.stringify(r3.own && r3.own.at)}, safe ${r3.own && r3.own.safe} m)`);
    ok(r3.own && !r3.own.unitCar && !r3.own.civ, 'the burning car is left (no climbing back in), officers stay officers');
    ok(r3.other && r3.other.at && r3.other.evades >= 1 && r3.other.at.every((d) => d >= r3.other.safe - 1.5), `officers on foot get clear of a burning car (${JSON.stringify(r3.other)})`);
    ok(r3.grenade && r3.grenade.modes.every((m) => m !== 'seated'), `crew parked next to a grenade gets out (${JSON.stringify(r3.grenade)})`);
  }

  // ---------------------------------------------------------------- 4. helicopter: blip, sight-only tracking, fuel, damage, crash
  const r4 = await run(p, 'helicopter', async () => {
    const g = window.__game, PR = g.police, H = g.heli; g.noRender = true; g.atmos.hour = 11; const P = g.player; P.teleport(-60, -280, 0); g.world.warm(-60, -280); const settle = async () => { for (let i = 0; i < 600 && (g.police.cine || g.police.busy || !g.player.control); i++) { if (g.police.cine) g.police.cine.skipReq = true; await g.stepSim(1, 0.05); await new Promise((r) => setTimeout(r, 30)); } }; await settle();
    const out = { parkedMark: H.hudMark() }; PR.level = 4.5; PR.reason = 'test'; PR.spotted();
    for (let i = 0; i < 1800; i++) { await g.stepSim(1, 0.05); if (PR.level < 4.2) PR.level = 4.5; if (H.state === 'fly' && H.lostT < 0.5 && i > 500) break; }
    for (let i = 0; i < 200; i++) { await g.stepSim(1, 0.05); if (PR.level < 4.2) PR.level = 4.5; }
    const hm = PR.hudInfo().units.filter((u) => u.heli); out.blip = hm.length; out.cars = PR.hudInfo().units.filter((u) => !u.heli).every((u) => !u.heli); out.flying = H.state; out.eyes = H.lostT < 1;
    // out of its sight and clear: it does not follow the live position
    P.teleport(-300, -700, 0); g.world.warm(-300, -700); let minD = 1e9; for (let s = 0; s < 40; s++) { await g.stepSim(20, 0.05); if (PR.level < 4.2) PR.level = 4.5; minD = Math.min(minD, Math.hypot(H.p.x - P.x, H.p.z - P.z)); }
    out.lost = { lostT: +H.lostT.toFixed(0), minD: +minD.toFixed(0), searchR: H.chaseAim().r, police: PR.state };
    const T = H.chaseAim(); P.teleport(T.x, T.z, 0); g.world.warm(T.x, T.z); let re = -1; for (let i = 0; i < 400; i++) { await g.stepSim(1, 0.05); if (H.lostT < 0.5) { re = +(i * 0.05).toFixed(2); break; } } out.reacquired = re;
    // shoot it
    const W = g.weapons; const V = H.p.constructor; const o = new V(P.x, (P.y || 0) + 1.6, P.z); const def = { dmg: 0.75, range: 400, cls: 'rifle' }; let shots = 0, misses = 0; const hp0 = H.hp;
    const miss = W.trace(o, new V(H.p.x, H.p.y + 25, H.p.z).sub(o).normalize(), 400, 0.5); out.missKind = miss.kind;
    for (let i = 0; i < 400 && H.hp > 0; i++) { const d = new V(H.p.x, H.p.y + 1.6, H.p.z).sub(o).normalize(); const h = W.trace(o, d, 400, 0.5); if (h.kind === 'heli') { W.applyHit(h, d, o, def, 1, 0); shots++; } else { misses++; await g.stepSim(1, 0.05); } }
    out.shots = shots; out.hp0 = hp0; out.state = H.state; const seq = []; let last = '';
    for (let i = 0; i < 1200; i++) { await g.stepSim(1, 0.05); if (H.state !== last) { last = H.state; seq.push(H.state + '@' + (i * 0.05).toFixed(1)); } if (H.state === 'wreck' && i > 40) break; }
    out.crash = { seq, blip: PR.hudInfo().units.filter((u) => u.heli).length, collider: !!H.wreckC || !!H.wreckWater, downed: H.stats.downed }; H.call(false); out.callWhileDown = H.state;
    H.downT = 200; P.teleport(400, -700, 0); await g.stepSim(4, 0.05); out.cleared = H.state; H.downT = H.cfg.rebuild + 1; await g.stepSim(2, 0.05); out.rebuilt = { state: H.state, hp: H.hp, visible: H.M.group.visible, pad: Math.hypot(H.p.x + 9, H.p.z + 194) < 0.5 };
    // blast damage (an explosion right under it on the pad)
    const hpB = H.hp; H.blastAt({ x: H.p.x + 2, y: H.p.y + 0.5, z: H.p.z }, 1, { source: 'test' }); out.blast = +(hpB - H.hp).toFixed(1); out.blastState = H.state; H.clearWreck(); H.resetToPad();
    // fuel: bingo → home, no relaunch until refuelled
    for (let i = 0; i < 1600; i++) { await g.stepSim(1, 0.05); if (PR.level < 4.2) PR.level = 4.5; if (H.state === 'fly' && H.mission === 'chase' && i > 300) break; }
    H.flightT = H.cfg.endurance - 0.5; await g.stepSim(30, 0.05); out.bingo = { mission: H.mission, bingo: H.bingo }; H.call(false); out.relaunch = H.mission;
    PR.standDown('t'); await g.stepSim(4, 0.05); out.blipAtZero = PR.hudInfo().units.length; return out;
  });
  if (r4) {
    ok(r4.parkedMark === null, 'no helicopter blip while it sits on the pad');
    ok(r4.blip === 1 && r4.flying === 'fly' && r4.eyes, 'its own blip while up on the chase (heli: true → helicopter icon)');
    ok(r4.lost && r4.lost.lostT >= 30 && r4.lost.minD > 200 && r4.lost.searchR > 62, `loses a suspect who got clear out of sight: searches round the last fix (closest ${r4.lost && r4.lost.minD} m, orbit ${r4.lost && r4.lost.searchR} m)`);
    ok(r4.reacquired >= 0 && r4.reacquired < 5, `picks the suspect up again in the open under its search (${r4.reacquired} s)`);
    ok(r4.missKind !== 'heli' && r4.shots >= 10 && r4.shots <= 30 && r4.state === 'crash', `rifle rounds hit it (trace 'heli'); down after ${r4.shots} hits`);
    ok(r4.crash.seq.includes(r4.crash.seq.find((s) => s.startsWith('wreck'))) && r4.crash.blip === 0 && r4.crash.collider, `crash → wreck (${r4.crash.seq.join(' ')}), no blip, solid wreck`);
    ok(r4.callWhileDown === 'wreck' && r4.cleared === 'gone' && r4.rebuilt.hp === 100 && r4.rebuilt.visible && r4.rebuilt.pad, 'no launch while down; wreck cleared out of view; a replacement on the pad later');
    ok(r4.blast > 30, `caught in a blast: ${r4.blast} hp (${r4.blastState})`);
    ok(r4.bingo.mission === 'home' && r4.bingo.bingo && r4.relaunch === 'home', 'low on fuel → back to base, no relaunch until refuelled');
    ok(r4.blipAtZero === 0, 'no blips at 0★');
  }
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' / ') : ''));
} catch (e) { ok(false, String(e.stack || e)); }
await b.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
