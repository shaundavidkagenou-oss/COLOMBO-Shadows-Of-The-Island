// 72nd: the ATM and the weapon wheel with recordings loaded and the audio context running (the other browser tests run with no
// audio, where every sound takes the synthesised path). Recordings are made in the page a little LONGER than their hard length
// (an mp3 of "exactly 1 s" decodes to ~1.03 s because of encoder padding): that used to throw out of SoundBank.play (stop()
// before start()) and left the ATM stuck on "Reading your card…" with dead keys and no sound.
//   PORT=5199 node tools/atm-audio-test.mjs   (needs the vite dev server: it imports the game's audio modules)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errs = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errs.push(String(e.message || e)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || /\[atm\]|InvalidState/.test(t)) errs.push(t.slice(0, 300)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const R = await page.evaluate(async () => {
    const g = window.__game, W = g.interiors.walkIn, s = W.siteById('bank'), P = g.player; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 11;
    const { Audio } = await import('/src/audio/Audio.js'); const { SoundBank: SB } = await import('/src/audio/SoundBank.js');
    if (!Audio.ready) Audio.init(); await Audio.ctx.resume(); const c = Audio.ctx; const out = { live: Audio.live, plays: [], thrown: [] };
    const tone = (sec, f) => { const b = c.createBuffer(1, Math.round(c.sampleRate * sec), c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / c.sampleRate * f * 6.283) * 0.2; return b; };
    for (const [id, sec, f] of [['atm.open', 1.03, 900], ['atm.button', 1.026, 1200], ['atm.card', 1.05, 300], ['atm.cash', 5.04, 200], ['atm.card.machine', 2.33, 150], ['atm.card.out', 0.74, 500], ['music.wheel', 6, 220], ['ui.wheel.open', 1, 400], ['ui.wheel.switch', 0.3, 1500]]) { SB.buf.set(id, tone(sec, f)); SB.raw.set(id, { name: id + '.wav', vol: 1, src: 'test' }); }
    const fp = SB.play.bind(SB); SB.play = (id, ...a) => { try { const r = fp(id, ...a); if (/^atm\.|wheel/.test(id)) out.plays.push(id); return r; } catch (e) { out.thrown.push(id + ': ' + e.name); throw e; } };
    const ev = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
    const press = async (code) => { ev('keydown', code); await g.stepSim(1, 0.05); ev('keyup', code); await g.stepSim(1, 0.05); };
    // weapon wheel: open for 1.5 s, close, sample the music's gain in real time
    { const Wp = g.weapons; Wp.wheelUpdate(); await new Promise((r) => setTimeout(r, 1500)); const Wm = Audio.wheelMus; out.wheelOpenGain = Wm.g.gain.value; out.wheelSrc = !!Wm.smp; Wp.wheelClose(true); const smp = [];
      const t0 = performance.now(); for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 200)); smp.push([Math.round(performance.now() - t0), +Wm.g.gain.value.toFixed(3), !!Wm.smp]); } out.wheel = smp; }
    const inside = () => !!(P.indoor && P.indoor.site === s);
    const [sx, sz] = W.world(s, 0, 3.2); g.world.warm(sx, sz); P.teleport(sx, sz, s.door.faceIn); P.yaw = s.door.faceIn; P.camYaw = P.yaw + Math.PI; await g.stepSim(2, 0.05);
    for (let i = 0; i < 90 && !inside(); i++) await g.stepSim(1, 0.05, ['KeyW']); for (let i = 0; i < 12; i++) await g.stepSim(1, 0.05, ['KeyW']);
    const r = s.room, m = r.atms[1]; for (const cu of r.customers) if (cu.on && cu.atm === m.i) { cu.on = false; cu.ch.root.visible = false; cu.atm = -1; } m.user = null;
    const [ax, az] = W.world(s, m.stand[0] + 0.05, m.stand[1]); P.x = ax; P.z = az; P.yaw = s.yaw - Math.PI / 2; await g.stepSim(5, 0.05);
    const A = g.atm; out.plays.length = 0;
    await press('KeyE'); await g.stepSim(60, 0.05); out.page1 = A.page; out.afterOpen = out.plays.slice();
    out.plays.length = 0; await press('ArrowDown'); out.sel = A.sel; await press('Enter'); out.page2 = A.page; await press('Escape'); out.page3 = A.page; out.navPlays = out.plays.slice();
    // withdraw Rs. 1,000 through the keys: the counting screen holds 5 s
    g.story.state.money = 5000; g.bank.account.balance = Math.max(g.bank.account.balance, 50000);
    const pick = async (label) => { const i = A.opts.findIndex((o) => o.label.startsWith(label)); if (i < 0) return false; A.sel = i; A.render(); await press('Enter'); return true; };
    await pick('Cash withdrawal'); await pick('Rs. 1,000'); await pick('Confirm'); out.proc = A.page; await g.stepSim(90, 0.05); out.procAt45 = A.page; await g.stepSim(14, 0.05); out.procAt52 = A.page;
    await pick('Another service'); out.plays.length = 0; await pick('Return card'); await g.stepSim(95, 0.05); /* out at 3 s, taken and pocketed by ~4.1 s */ out.closed = !A.open; out.exitPlays = out.plays.slice();
    return out; });
  console.log(JSON.stringify(R));
  ok(R.live && R.thrown.length === 0, `recordings longer than their hard length play without throwing (audio running: ${R.live}; thrown: ${JSON.stringify(R.thrown)})`);
  ok(R.page1 === 'menu' && R.afterOpen.includes('atm.card') && R.afterOpen.includes('atm.open'), `ATM: card in → screen opens with its sound → menu (page "${R.page1}", sounds ${JSON.stringify(R.afterOpen)})`);
  ok(R.sel === 1 && R.page2 === 'deposit' && R.page3 === 'menu' && R.navPlays.length === 3 && R.navPlays.every((x) => x === 'atm.button'), `ATM keys work and each one is the machine's button sound: ↓ Enter Esc → ${JSON.stringify(R.navPlays)} (pages ${R.page2} → ${R.page3})`);
  ok(R.proc === 'processing' && R.procAt45 === 'processing' && R.procAt52 === 'result', `counting screen holds 5 s (4.5 s: ${R.procAt45}, 5.2 s: ${R.procAt52})`);
  ok(R.closed && R.exitPlays.includes('atm.card.machine') && R.exitPlays.includes('atm.card.out'), `card returned: ${JSON.stringify(R.exitPlays)}, machine closed`);
  const w = R.wheel; ok(R.wheelOpenGain > 0.95 && R.wheelSrc && w[0][1] < 0.6 && w[3][1] < 0.06 && w[5][2] === false, `wheel music: full while held (${R.wheelOpenGain.toFixed(2)}), fading from the release: ${w.map((x) => x[0] + ' ms ' + x[1]).join(' · ')}; stopped by ${w.find((x) => !x[2])?.[0]} ms`);
} catch (e) { console.log('ERR', e.stack); fails++; } finally { await browser.close(); }
console.log('page errors:', errs.slice(0, 6).join(' | ') || 'none');
console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
