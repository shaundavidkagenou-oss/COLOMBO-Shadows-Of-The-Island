// 81st: Dynamic City Events (src/world/CityEvents.js + src/world/events/*) in the real game (headless). Scenarios: the calendar
// and the phone app's sections, a site built unseen and staged in pieces, people arriving / pre-placed out of view, personal
// space and colliders, a minor disturbance (pause → resume), a serious one (suspend, police called), repeated incidents
// (cancel + evacuation), a storm forecast at set-up time (postponed to the next day), the whole wind-down (tiers removed only
// while unseen, then completed), leave and return (site dropped / rebuilt, nothing leaked), save → load round trip, the City
// Events phone app (list, details, Navigate → GPS waypoint), the 46 sound slots (all silent until a recording is uploaded),
// traffic slow zones on and off, and a frame-time / draw-call comparison street vs. event.
//   PORT=5199 node tools/city-events-test.mjs            (SCEN=calendar,build,... to run a subset)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errors = []; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log('  ', c ? 'ok ' : 'NO ', m); };
const SCEN = (process.env.SCEN || 'calendar,build,people,traffic,board,minor,serious,cancel,storm,winddown,return,save,phone,sounds,perf').split(',');
const HELP = () => {
  const g = window.__game; window.__ev = {
    async approach(id, hour, from = 300, step = 30, every = 30) { const M = g.cityEvents; g.atmos.hour = hour; await g.stepSim(2, 1 / 30); const ev = M.byId.get(id); const v = M.view(ev); const s0 = ev.site;
      const dx = v.at.x - s0.x, dz = v.at.z - s0.z, L0 = Math.hypot(dx, dz) || 1, ux = dx / L0, uz = dz / L0; let maxMs = 0; let popped = 0;
      for (let d = from; d >= 0; d -= step) { const x = v.at.x + ux * d, z = v.at.z + uz * d; g.player.teleport(x, z, Math.atan2(-ux, -uz)); if (d === from) g.world.warm(x, z);
        for (let i = 0; i < every; i++) { const s = M.sites.get(id); const before = s ? s.shown : 0; const seen = s ? M.seenSite(s) : false; g.updatePlay(1 / 30); const s2 = M.sites.get(id); if (s2 && seen && s2.shown !== before && Math.hypot(g.player.x - s2.cx, g.player.z - s2.cz) < 300) popped++; maxMs = Math.max(maxMs, M.stats.lastMs || 0); if (i % 4 === 3) await null; } }
      return { maxMs, popped }; },
    overlap(site) { const A = site.allAgents().filter((a) => a.alive() && !a.seat); let close = 0, inCol = 0; const bad = []; for (let i = 0; i < A.length; i++) { const p = A[i].p; if (g.collision.blocked(p.x, p.z, 0.15, p.y)) { inCol++; const cs = [...g.collision.query(p.x - 0.15, p.z - 0.15, p.x + 0.15, p.z + 0.15)].filter((c) => p.x + 0.15 > c.x0 && p.x - 0.15 < c.x1 && p.z + 0.15 > c.z0 && p.z - 0.15 < c.z1).slice(0, 3).map((c) => Object.entries(c).filter(([, v]) => typeof v !== 'object' || v === null).map(([k, v]) => k + '=' + (typeof v === 'number' ? +v.toFixed(2) : v)).join(' ')); bad.push(`${A[i].constructor.name}/${A[i].phase}/${A[i].post?.kind || A[i].spec?.role || A[i].role || ''} water=${g.collision.walkableWater ? 'chk' : ''} @${p.x.toFixed(2)},${p.z.toFixed(2)},${p.y.toFixed(2)} in [${cs.join(' | ')}]`); } for (let j = i + 1; j < A.length; j++) { const q = A[j].p; if (Math.hypot(p.x - q.x, p.z - q.z) < 0.45) close++; } } return { n: A.length, close, inCol, bad }; },
  };
};
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e).slice(0, 600))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 400)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.hud.show(false); });
  await page.evaluate(HELP);
  const E = (fn, ...a) => page.evaluate(fn, ...a);

  if (SCEN.includes('calendar')) { console.log('calendar');
    const r = await E(async () => { const g = window.__game, M = g.cityEvents; g.atmos.hour = 16.8; await g.stepSim(3, 1 / 30); const S = M.sections(); return { n: M.list.length, prewarm: M.prewarmMs, now: S.now.map((e) => e.id), up: S.upcoming.length, recent: S.recent.length, ids: new Set(M.list.map((e) => e.id)).size, venues: M.list.every((e) => e.site && e.site.W > 0) }; });
    ok(r.n >= 8 && r.ids === r.n, `${r.n} events in the −3…+7 day window, unique ids`); ok(r.venues, 'every event has a measured site'); ok(r.now.length >= 1, `happening now: ${r.now.join(', ')}`); ok(r.up >= 3, `${r.up} upcoming`); console.log('   prewarm', Math.round(r.prewarm), 'ms');
  }
  if (SCEN.includes('build') || SCEN.includes('people')) { console.log('build + people');
    const r = await E(async () => { const g = window.__game, M = g.cityEvents; const a = await window.__ev.approach('cricketScreen-d1', 15.2, 470, 25, 30); await g.stepSim(120, 1 / 30); const s = M.sites.get('cricketScreen-d1');
      return { ...a, built: !!s, shown: s && s.shown, vis: s && s.visitors.length, staff: s && s.staff.length, ov: s && window.__ev.overlap(s), stats: s && s.stats, maxBuild: M.stats.maxBuildMs, spikes: M.stats.spikes || [] }; });
    ok(r.built && r.shown === 3, 'site built and all three tiers up'); ok(r.popped === 0, `no tier appeared/disappeared in view (${r.popped})`); ok(r.vis >= 3 && r.staff >= 6, `${r.vis} visitors, ${r.staff} staff`);
    ok(r.ov.close === 0, `nobody closer than 0.45 m to another standing person (${r.ov.n} checked)`); ok(r.ov.inCol === 0, `nobody standing inside a collider (${r.ov.inCol})`); console.log('   slowest event-manager frame on approach', r.maxMs.toFixed(1), 'ms (SwiftShader) · site build', r.maxBuild.toFixed(1), 'ms'); console.log('   event-manager frames over 25 ms:', r.spikes.map((q) => `${q.ms} ms [${q.what}]`).join('; ') || 'none');
  }
  if (SCEN.includes('traffic')) { console.log('traffic');
    const r = await E(async () => { const g = window.__game; await g.stepSim(40, 1 / 30); return (g.traffic.slowZones || []).map((z) => `${z.id} r${z.r} ${z.v} m/s`); });
    ok(r.length >= 1, `slow zones while events are on: ${r.join(', ')}`);
  }
  if (SCEN.includes('board')) { console.log('info board');
    const r = await E(async () => { const g = window.__game, M = g.cityEvents; const s = M.sites.get('cricketScreen-d1'); if (!s || !s.info) return { none: true }; const P = g.player; const x0 = P.x, z0 = P.z; P.teleport(s.info.x, s.info.z, Math.PI); const t = g.updateInteractions(); P.teleport(x0, z0, 0); return { t: String(t || '') }; });
    ok(!r.none && /Event info/.test(r.t), `standing at the info board offers: "${r.t || '-'}"`);
  }
  if (SCEN.includes('minor')) { console.log('minor disturbance');
    const r = await E(async () => { const g = window.__game, M = g.cityEvents; const ev = M.byId.get('folkEvening-d1'); await window.__ev.approach(ev.id, 17.1, 200, 40, 30); const s = M.sites.get(ev.id); const a = ev.state; const ov = window.__ev.overlap(s); const techs = s.staff.filter((q) => q.p && q.post && q.post.role === 'tech').map((q) => +Math.hypot(q.p.x - q.post.x, q.p.z - q.post.z).toFixed(2));
      g.crowd.alarm(s.cx, s.cz, 12, 1, null, 'scuffle', true); const b = ev.state; g.atmos.hour = (ev.pauseUntil % 24) + 0.02; await g.stepSim(30, 1 / 30); return { a, b, c: ev.state, ov, techs }; });
    ok(r.a === 'active' && r.b === 'paused' && r.c === 'active', `active → paused → resumed (${r.a}/${r.b}/${r.c})`); ok(r.ov.close === 0 && r.ov.inCol === 0, `folk evening: ${r.ov.n} people, ${r.ov.close} too close, ${r.ov.inCol} inside a collider`); if (r.ov.bad.length) console.log('     ', r.ov.bad.join('\n       ')); ok(r.techs.length >= 1 && r.techs.every((d) => d < 0.6), `FOH technicians reached their desk inside the barrier ring (${r.techs.join(', ')} m from post)`);
  }
  if (SCEN.includes('serious') || SCEN.includes('cancel')) { console.log('serious + repeated');
    const r = await E(async () => { const g = window.__game, M = g.cityEvents; const ev = M.byId.get('folkEvening-d1'); const s = M.sites.get(ev.id); const rep0 = g.police.stats.reports;
      g.crowd.alarm(s.cx, s.cz, 60, 2, null, 'gunfire', true); await g.stepSim(20, 1 / 30); const a = ev.state; const reported = g.police.stats.reports > rep0;
      g.crowd.alarm(s.cx, s.cz, 60, 2, null, 'gunfire', true); await g.stepSim(20, 1 / 30); g.crowd.alarm(s.cx, s.cz, 60, 2, null, "gunfire", true); await g.stepSim(1000, 1 / 30);
      return { a, reported, b: ev.state, cancelled: ev.cancelled, left: s.stats.left, leaving: s.visitors.filter((q) => q.phase === 'leave').length, status: M.view(ev).status }; });
    ok(r.a === 'suspended' && r.reported, 'serious incident → suspended, organisers phoned the police'); ok(r.cancelled && r.status.startsWith('Cancelled'), `repeated incidents → cancelled ("${r.status}")`); ok(r.left >= 1, `${r.left} people left through the exit (${r.leaving} still leaving)`);
  }
  if (SCEN.includes('storm')) { console.log('storm at set-up time');
    const r = await E(async () => { const g = window.__game, M = g.cityEvents, A = g.atmos; const sc = M.list.find((e) => e.state === 'scheduled' && e.day >= 2 && !e.id.endsWith('r')); const wt = A.target, ww = A.weather; A.target = 'storm'; A.weather = 'storm';
      M.startNow(sc, sc.prep * 0.5); await g.stepSim(10, 1 / 30); A.target = wt; A.weather = ww; return { st: sc.state, re: sc.resched || null, reState: sc.resched ? M.byId.get(sc.resched).state : null }; });
    ok(r.st === 'postponed' && r.re && r.reState === 'scheduled', `postponed, rescheduled as ${r.re}`);
  }
  if (SCEN.includes('winddown')) { console.log('wind-down');
    const r = await E(async () => { const g = window.__game, M = g.cityEvents; const ev = M.byId.get('cricketScreen-d1'); const S = ev.site; const rows = [];
      for (const h of [18.9, 19.3, 19.7, 20.0, 20.3, 20.6]) { g.atmos.hour = h; g.player.teleport(S.x + 140, S.z, Math.PI / 2); await g.stepSim(60, 1 / 30); const s = M.sites.get(ev.id); rows.push(`${h} ${ev.state} ${s ? s.shown : '-'}`); }
      return { rows, state: ev.state, zones: (g.traffic.slowZones || []).filter((z) => z.id === ev.id).length }; });
    console.log('   ', r.rows.join(' | ')); ok(r.state === 'completed', `completed (${r.state})`); ok(r.zones === 0, 'its traffic slow zone removed');
  }
  if (SCEN.includes('return')) { console.log('leave and return');
    const r = await E(async () => { const g = window.__game, M = g.cityEvents; const ev = M.list.find((e) => e.state === 'active') || M.byId.get('cricketScreen-d1'); g.player.teleport(-140, -891.8, 0); g.world.warm(-140, -892); await g.stepSim(90, 1 / 30);
      const { PlaceSound } = await import('/src/audio/PlaceAudio.js'); const loops = [...PlaceSound.loops.keys()].filter((k) => M.byId.has(k.split(':')[0])).length; return { sites: M.sites.size, extra: g.crowd.extraEv, loops, kept: g.crowd.peds.filter((p) => p.evRole).length }; });
    ok(r.sites === 0, 'far away: no event site built'); ok(r.extra === 0 && r.kept === 0, `no event people left behind (${r.kept}), crowd budget restored`); ok(r.loops === 0, 'no event sound loops left');
  }
  if (SCEN.includes('save')) { console.log('save → load');
    const r = await E(async () => { const g = window.__game, M = g.cityEvents; const d = JSON.parse(JSON.stringify(M.serialize())); M.reset(9); M.restore(d); const e = M.serialize(); const diff = []; if (d.list.length !== e.list.length) diff.push(`count ${d.list.length}→${e.list.length}`); d.list.forEach((a, i) => { const b = JSON.parse(JSON.stringify(e.list[i] || {})); for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff.push(`${a.id}.${k}: ${JSON.stringify(a[k])} → ${JSON.stringify(b[k])}`.slice(0, 160)); }); return { same: JSON.stringify(d.list) === JSON.stringify(e.list), n: d.list.length, diff: diff.slice(0, 6) }; });
    ok(r.same, `${r.n} events restored exactly (states, notes, reschedules)${r.diff.length ? ' — differs: ' + r.diff.join(', ') : ''}`);
  }
  if (SCEN.includes('phone')) { console.log('phone app');
    const r = await E(async () => { const g = window.__game, M = g.cityEvents; g.hud.show(true); g.phone.toggle(true); g.phone.launch('events'); g.phone.render(); const list = g.phone.screen.innerHTML;
      const rows = g.phone.rows().length; g.phone.row = 0; g.phone.activate(); g.phone.render(); const det = g.phone.screen.innerHTML; const id = g.phone.evOpen; g.phone.row = 0; g.phone.activate(); const wp = g.hud.waypoint || g.hud.wp || null; g.phone.toggle(false); g.hud.show(false);
      return { tabs: (list.match(/data-tab=/g) || []).length, rows, det: /When/.test(det) && /Activities/.test(det) && /Public information/.test(det), id, real: M.byId.has(id), wp: !!wp }; });
    ok(r.tabs === 4 && r.rows >= 1, `list: 4 tabs, ${r.rows} rows`); ok(r.det && r.real, `details of ${r.id} (a live manager event)`); ok(r.wp, 'Navigate set the GPS waypoint');
  }
  if (SCEN.includes('sounds')) { console.log('sound slots');
    const r = await E(async () => { const { CE_SOUND_DEFS } = await import('/src/audio/CityEventSoundDefs.js'); const { SoundBank } = await import('/src/audio/SoundBank.js'); return { n: CE_SOUND_DEFS.length, has: CE_SOUND_DEFS.filter((d) => SoundBank.has(d.id)).map((d) => d.id), cats: new Set(CE_SOUND_DEFS.map((d) => d.cat)).size }; });
    ok(r.n === 46 && r.cats === 6, `${r.n} slots in ${r.cats} categories`); console.log('   uploaded:', r.has.length ? r.has.join(', ') : 'none (all silent — nothing generated or substituted)');
  }
  if (SCEN.includes('perf')) { console.log('perf (SwiftShader: relative numbers only)');
    const r = await E(async () => { const g = window.__game, M = g.cityEvents; const met = async () => { const t = []; for (let i = 0; i < 240; i++) { const t0 = performance.now(); g.updatePlay(1 / 30); t.push(performance.now() - t0); if (i % 4 === 3) await null; } t.sort((a, b) => a - b); return { mean: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(2), p95: +t[Math.floor(t.length * 0.95)].toFixed(1), peds: g.crowd.peds.length }; };
      g.atmos.hour = 14.6; g.player.teleport(-140, -891.8, Math.PI / 2); g.world.warm(-140, -892); await g.stepSim(150, 1 / 30); const street = await met();
      await window.__ev.approach('cricketScreen-d1', 15.4, 200, 50, 30); const event = await met(); return { street, event, evMax: M.stats.maxMs }; });
    console.log('   street', JSON.stringify(r.street), '· event', JSON.stringify(r.event)); ok(r.event.mean < r.street.mean * 2 + 4, 'event sim cost within budget of the street');
  }
} catch (e) { console.log('FATAL', e.stack || e); fail++; }
if (errors.length) { console.log('page errors:\n' + errors.slice(0, 8).join('\n')); }
ok(!errors.length, 'no page errors');
console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
