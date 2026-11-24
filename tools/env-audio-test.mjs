// 76th: environmental audio — headless Chromium against the real game with the audio context RUNNING (autoplay allowed) and
// tiny generated recordings in a set of the new slots, so both paths (recording / synthesised fallback) are exercised:
//   footsteps by surface / gait / wetness on real foot contacts, foley, object impacts (cooldown), traffic near the player,
//   vehicle start / indicators (+ lamp uniform) / gears / stop / cooling ticks, the car radio (stations, streamed song,
//   muffled outside, stops on wreck), and the sounds window (category blocks, badges, fallback text, file checks).
//   PORT=5199 node tools/env-audio-test.mjs   (needs the vite dev server: it imports the game's audio modules)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errs = []; const T0 = Date.now(); const lap = (m) => console.log(`  [${((Date.now() - T0) / 1000).toFixed(0)} s] ${m}`);
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errs.push(String(e.stack || e.message || e).slice(0, 500)));
  page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || /InvalidState|\[radio\]/.test(t)) && !/favicon|404|GPU stall|WebGL-|swiftshader/i.test(t)) errs.push(t.slice(0, 300)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  lap('game ready');
  await page.evaluate(async () => {
    const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 11; g.atmos.wet = 0;
    const { Audio } = await import('/src/audio/Audio.js'); const { SoundBank: SB } = await import('/src/audio/SoundBank.js');
    if (!Audio.ready) Audio.init(); await Audio.ctx.resume(); const c = Audio.ctx;
    const tone = (sec, f) => { const b = c.createBuffer(1, Math.round(c.sampleRate * sec), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / c.sampleRate * f * 6.283) * 0.2; return b; };
    // recordings in some slots (the rest stay empty → fallbacks)
    const ids = []; for (const s of ['concrete', 'asphalt', 'gravel', 'grass', 'mud', 'wet', 'tile', 'wood']) for (const gt of ['walk', 'jog', 'run']) ids.push(`step.${s}.${gt}`);
    ids.push('foley.cloth.walk', 'foley.cloth.run', 'obj.trash', 'obj.metal', 'mech.indL', 'mech.indR', 'mech.start.car', 'mech.gear', 'radio.tune');
    for (const id of ids) { SB.buf.set(id, tone(0.12, 300 + ids.indexOf(id) * 20)); SB.raw.set(id, { name: id + '.wav', vol: 1, src: 'test' }); }
    // a streamed song: a real 4 s WAV file in the slot (CarRadio plays it through an <audio> element)
    const wav = (sec, f) => { const sr = 22050, n = sr * sec, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf); const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.sin(i / sr * f * 6.283) * 6000, true); return buf; };
    SB.raw.set('radio.breeze.1', { name: 'song.wav', vol: 1, src: 'test', type: 'wav', data: wav(4, 440) });
    window.__plays = []; const fp = SB.play.bind(SB); SB.play = (id, ...a) => { const r = fp(id, ...a); window.__plays.push([id, r]); return r; };
    window.__A = Audio; window.__SB = SB;
  });

  // ---------------------------------------------------------------- 1 · footsteps: surface, gait, wetness, real contacts
  const fs = await page.evaluate(async () => { const g = window.__game, P = g.player, F = window.__footsteps; const r = {};
    const { surfaceAt } = await import('/src/audio/Surface.js');
    // a straight road: the first traffic vehicle's lane
    const v0 = g.traffic.vehicles[0]; const x = v0 ? v0.x + 8 : 0, z = v0 ? v0.z + 8 : 0; g.world.warm(x, z); P.teleport(x, z, 0); await g.stepSim(4, 0.05);
    r.surf = surfaceAt(P.x, P.z, P.y, g.collision, P.indoor);
    const run = async (keys, n) => { window.__plays.length = 0; const s0 = F.stats.player; await g.stepSim(n, 0.05, keys); const ids = window.__plays.map((p) => p[0]); return { steps: F.stats.player - s0, step: [...new Set(ids.filter((i) => i.startsWith('step.')))], foley: [...new Set(ids.filter((i) => i.startsWith('foley.')))], dist: 0 }; };
    P.control = true; r.walk = await run(['KeyW'], 60); window.__Input.down.clear();
    r.run = await run(['KeyW', 'ShiftLeft'], 60); window.__Input.down.clear();
    g.atmos.wet = 1; r.wet = await run(['KeyW'], 40); window.__Input.down.clear(); g.atmos.wet = 0;
    r.npc = F.stats.npc; r.surfStats = F.stats.surf; return r; });
  console.log('   ', JSON.stringify(fs));
  ok(fs.walk.steps >= 4 && fs.walk.steps <= 14, `1 walking 3 s: ${fs.walk.steps} steps on real contacts (no overlap / machine-gun) · ${fs.walk.step}`);
  ok(fs.walk.step.some((i) => /\.walk$/.test(i)) && fs.run.step.some((i) => /\.(run|jog)$/.test(i)), `1 gait follows speed: walk ${fs.walk.step} → run ${fs.run.step}`);
  ok(fs.walk.step.some((i) => i.includes('.' + fs.surf + '.')), `1 surface under the feet (${fs.surf}) picks the slot`);
  ok(fs.wet.step.some((i) => /step\.(wet|mud|puddle)/.test(i)), `1 rain turns it wet/mud: ${fs.wet.step}`);
  ok(fs.walk.foley.length > 0 || fs.run.foley.length > 0, `2 clothing foley with the steps: ${[...fs.walk.foley, ...fs.run.foley]}`);

  // ---------------------------------------------------------------- 3 · object impacts: one per contact, cooldown
  const oa = await page.evaluate(async () => { const O = window.__objAudio, P = window.__game.player; const s0 = { ...O.stats }; window.__plays.length = 0;
    const src = {}; O.hit('trash', P.x + 3, P.z, 1, src); O.hit('trash', P.x + 3, P.z, 1, src); O.hit('trash', P.x + 3, P.z, 1, src); await window.__game.stepSim(10, 0.05); O.hit('trash', P.x + 3, P.z, 1, src);
    return { hits: O.stats.hits - s0.hits, skipped: O.stats.skipped - s0.skipped, plays: window.__plays.filter((p) => p[0].startsWith('obj.')).map((p) => p[0] + ':' + p[1]) }; });
  ok(oa.hits === 2 && oa.skipped === 2, `3 same bin hit 3× in one frame → 1 sound, again after 0.5 s → 2 (hits ${oa.hits}, skipped ${oa.skipped}) ${oa.plays}`);

  // ---------------------------------------------------------------- 4 · traffic near the player
  const tr = await page.evaluate(async () => { const g = window.__game, P = g.player, T = window.__trafficAudio; const s0 = { ...T.stats };
    let best = null, bd = 1e9; for (const v of g.traffic.vehicles) { const d = Math.abs(v.speed || 0) > 6 ? 0 : 1; if (d < bd) { bd = d; best = v; } }
    if (best) { const [fx, fz] = best.forward(), f = { x: fx, z: fz }; const x = best.x + f.x * 40 + f.z * 5, z = best.z + f.z * 40 - f.x * 5; P.teleport(x, z, 0); }
    window.__plays.length = 0; await g.stepSim(300, 0.05); const near = []; for (const v of g.traffic.vehicles) { const d = Math.hypot(v.x - P.x, v.z - P.z); if (d < 70) near.push(+d.toFixed(0)); }
    const dops = g.traffic.vehicles.filter((v) => v._dop && Math.abs(v._dop - 1) > 0.01).length;
    return { d: { near: T.stats.near, passes: T.stats.passes - s0.passes, approaches: T.stats.approaches - s0.approaches, screeches: T.stats.screeches - s0.screeches }, nearV: near.length, dops, ids: [...new Set(window.__plays.map((p) => p[0]).filter((i) => i.startsWith('traffic.')))] }; });
  console.log('   ', JSON.stringify(tr));
  ok(tr.nearV === 0 || tr.d.near > 0, `4 traffic audio tracks the vehicles near the player (${tr.nearV} within 70 m, tracked ${tr.d.near})`);
  ok(tr.d.passes + tr.d.approaches > 0 || tr.nearV === 0, `4 approach / pass-by events in 15 s: ${JSON.stringify(tr.d)} · Doppler-shifted ${tr.dops}`);

  // ---------------------------------------------------------------- 5 · vehicle mechanical
  const vm = await page.evaluate(async () => { const g = window.__game, P = g.player, V = window.__vehAudio, I = window.__Input; const r = {}; const s0 = { ...V.stats };
    const x = P.x, z = P.z; const v = new window.__Vehicle('ventra', 7, g.scene); v.place(x + 6, z, 0); g.traffic.release(v, false); window.__v = v;
    P.teleport(v.x + 2.2, v.z, 0); P.enterVehicle(v, g.traffic); for (let i = 0; i < 500 && (P.vehicle !== v || P.entry); i++) await g.stepSim(1, 0.05); await g.stepSim(1, 0.05);
    r.inCar = P.vehicle === v; r.starts = V.stats.starts - s0.starts; r.startRec = window.__plays.some((p) => p[0] === 'mech.start.car' && p[1]); r.engineOn = v.engineOn; r.k0 = v.engineK; await g.stepSim(20, 0.05); r.k1 = v.engineK;
    const um = v.mesh.userData.indMat; r.hasLampUniform = !!(um && um.userData.side);
    const c0 = V.stats.clicks; I.pressed.add(I.code('indL')); await g.stepSim(1, 0.05); r.ind = v.ind; const lamp = []; for (let i = 0; i < 8; i++) { await g.stepSim(4, 0.05); lamp.push(um && um.userData.side ? um.userData.side.value : null); }
    r.clicks = V.stats.clicks - c0; r.lamp = lamp; I.pressed.add(I.code('indL')); await g.stepSim(2, 0.05); r.indOff = v.ind;
    const gr0 = V.stats.gears; await g.stepSim(120, 0.05, ['KeyW']); I.down.clear(); r.speed = +Math.abs(v.speed).toFixed(1); r.gears = V.stats.gears - gr0;
    await g.stepSim(80, 0.05, ['KeyS']); I.down.clear(); r.stopSpeed = +Math.abs(v.speed).toFixed(1);
    return r; });
  console.log('   ', JSON.stringify(vm));
  ok(vm.inCar && vm.starts === 1 && vm.startRec && vm.engineOn, `5 getting in as driver: one engine start (the recording) · engine on`);
  ok(vm.k0 < 0.5 && vm.k1 === 1, `5 the engine voice comes in when the starter catches (engineK ${vm.k0} → ${vm.k1})`);
  ok(vm.ind === -1 && vm.clicks >= 3 && vm.hasLampUniform && vm.lamp.includes(1) && vm.lamp.includes(0), `5 left indicator: ${vm.clicks} clicks in 1.6 s, lamp uniform ${vm.lamp} (flashing)`);
  ok(vm.indOff === 0, '5 pressing it again cancels the indicator');
  ok(vm.gears > 0, `5 gear changes while accelerating to ${vm.speed} m/s: ${vm.gears}`);

  // ---------------------------------------------------------------- 6 · radio
  const ra = await page.evaluate(async () => { const g = window.__game, P = g.player, R = window.__radio, I = window.__Input, A = window.__A, v = window.__v; const r = {}; const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    v.speed = 0; I.pressed.add(I.code('radio')); await g.stepSim(1, 0.05); r.st1 = v.radio; r.hud = R.hudText(v); r.tune = window.__plays.some((p) => p[0] === 'radio.tune');
    for (let i = 0; i < 30; i++) { await g.stepSim(1, 0.05); await wait(40); } r.cur = R.cur; r.el = !!R.el && R.el.src.startsWith('blob:'); r.playing = !!R.el && !R.el.paused; r.musicMode = A.musicMode; r.inCar = R.inCar;
    r.outIn = +R.out.gain.value.toFixed(2);
    I.pressed.add(I.code('radio')); await g.stepSim(1, 0.05); r.st2 = v.radio; I.pressed.add(I.code('radioPrev')); await g.stepSim(1, 0.05); r.st3 = v.radio;
    // get out: the radio plays on from the car, muffled
    for (let i = 0; i < 6; i++) { await g.stepSim(1, 0.05); await wait(50); }
    P.exitVehicle(g.traffic); for (let i = 0; i < 160 && P.vehicle; i++) await g.stepSim(1, 0.05); for (let i = 0; i < 10; i++) { await g.stepSim(1, 0.05); await wait(40); }
    r.out = !P.vehicle; r.lpOut = Math.round(A.radioLP.frequency.value); r.outOut = +R.out.gain.value.toFixed(2); r.stillOn = v.radio; r.elOut = R.el && !R.el.paused;
    r.stops = window.__vehAudio.stats.stops; r.engineOff = !v.engineOn; r.coolQ = window.__vehAudio.cool.length; const tk0 = window.__vehAudio.stats.ticks; await g.stepSim(160, 0.05); r.ticks = window.__vehAudio.stats.ticks - tk0;
    // walk 60 m away: quiet + paused; back: resumes
    const px = P.x, pz = P.z; P.teleport(px + 60, pz, 0); for (let i = 0; i < 12; i++) { await g.stepSim(1, 0.05); await wait(40); } r.farGain = +R.out.gain.value.toFixed(3); r.farPaused = R.cur === -1;
    P.teleport(px, pz, 0); for (let i = 0; i < 12; i++) { await g.stepSim(1, 0.05); await wait(40); } r.backCur = R.cur;
    // wreck: the radio dies with the car
    v.wrecked = true; v.health = 0; await g.stepSim(4, 0.05); r.afterWreck = v.radio; r.elPaused = !R.el || R.el.paused; r.curW = R.cur;
    return r; });
  console.log('   ', JSON.stringify(ra));
  ok(ra.st1 === 0 && /Breeze/.test(ra.hud) && ra.tune, `6 radio key → ${ra.hud}, tuning sound`);
  ok(ra.cur === 0 && ra.el && ra.playing && ra.inCar, `6 the station's uploaded song streams through the radio (<audio> blob, playing) · in the car`);
  ok(ra.st2 === 1 && ra.st3 === 0, `6 next / previous station (${ra.st1} → ${ra.st2} → ${ra.st3})`);
  ok(ra.out && ra.stillOn === 0 && ra.lpOut < 8000 && ra.outOut < ra.outIn, `6 outside: plays on from the car, muffled (low-pass ${ra.lpOut} Hz, gain ${ra.outIn} → ${ra.outOut})`);
  ok(ra.farPaused && ra.farGain < 0.05 && ra.backCur === 0, `6 60 m away: silent and paused (gain ${ra.farGain}); back: resumes`);
  ok(ra.afterWreck === -1 && ra.elPaused && ra.curW === -1, '6 wrecked: the radio stops for good');
  ok(ra.stops === 1 && ra.engineOff, '5 getting out: one engine shutdown');
  ok(ra.coolQ === 1 && ra.ticks >= 2, `5 cooling ticks after the drive: ${ra.ticks} in 8 s`);
  ok(ra.musicMode === 'none', `6 the score steps aside in the car with the radio on (music mode ${ra.musicMode})`);

  // ---------------------------------------------------------------- 7 · sounds window
  const sw = await page.evaluate(async () => { const g = window.__game; const M = await import('/src/ui/SoundsWindow.js'); const w = await M.open(g); const b = w.body; await new Promise((r) => setTimeout(r, 300));
    const cats = [...b.querySelectorAll('.snd-cat')].map((e) => e.textContent); const intros = b.querySelectorAll('.snd-intro').length; const miss = b.querySelectorAll('.st.miss').length; const cus = b.querySelectorAll('.st.cus').length;
    const rows = b.querySelectorAll('.snd-row').length; const varTxt = [...b.querySelectorAll('.snd-row .nm small')].map((e) => e.textContent).find((t) => t.startsWith('step.gravel.walk ')) || '';
    w.close(); return { cats: cats.filter((c) => /Footsteps|foley|Interactive|Traffic|radio|mechanical/.test(c)), intros, miss, cus, rows, varTxt }; });
  console.log('   ', JSON.stringify(sw));
  ok(sw.cats.length === 6 && sw.intros === 6, `7 six new category blocks with intros in the existing window: ${sw.cats.join(' | ')}`);
  ok(sw.miss > 50 && sw.cus >= 30, `7 status per slot: ${sw.cus} uploaded · ${sw.miss} empty showing their fallback`);
  ok(/variation slots? below — filled ones are picked at random/.test(sw.varTxt), `7 variation text: ${sw.varTxt}`);

  // ---------------------------------------------------------------- 8 · budget / leaks
  const bu = await page.evaluate(async () => { const g = window.__game; await g.stepSim(40, 0.05); const SB = window.__SB; return { voices: SB.voices ? [...SB.voices.values()].reduce((a, s) => a + (s.size ?? s.length ?? 0), 0) : -1 }; });
  ok(bu.voices >= 0 && bu.voices < 64, `8 voices alive after the run: ${bu.voices}`);
  ok(errs.length === 0, `no page errors (${errs.length}) ${errs.slice(0, 4).join(' | ')}`);
} catch (e) { console.log('FATAL', e && e.stack || e); fails++; }
console.log(`\n${passes} passed, ${fails} failed`); await browser.close(); process.exit(fails ? 1 : 0);
