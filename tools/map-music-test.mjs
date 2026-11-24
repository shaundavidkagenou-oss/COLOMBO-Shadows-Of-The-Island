// 91st: the map-screen music loops whatever its length. A small file (≤ 2.5 MB) is decoded and looped seamlessly (as before);
// a bigger one streams through a looping <audio> element (no 2-minute cap, never decoded whole). Both run past the end of the
// track while the map stays open, fade out when it closes, and carry on from where they were when it opens again.
//   PORT=5199 node tools/map-music-test.mjs   (needs the vite dev server; the browser runs with audio enabled)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errs = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errs.push(String(e.message || e)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource/.test(t)) errs.push(t.slice(0, 300)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const R = await page.evaluate(async () => {
    const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null;
    const { Audio } = await import('/src/audio/Audio.js'); const { SoundBank: SB, SOUND_BY_ID } = await import('/src/audio/SoundBank.js'); const { Settings } = await import('/src/core/Settings.js');
    if (!Audio.ready) Audio.init(); await Audio.ctx.resume(); const c = Audio.ctx; const out = { state: c.state, stream: !!(SOUND_BY_ID['music.map1'].stream && SOUND_BY_ID['music.map2'].stream), explore: !SOUND_BY_ID['music.explore'].stream };
    // a 16-bit PCM WAV of a 330 Hz tone: sec seconds at sr Hz (a high rate makes a short file big enough to stream)
    const wav = (sec, sr, ch = 2) => { const n = Math.round(sec * sr), B = new ArrayBuffer(44 + n * ch * 2), v = new DataView(B); const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
      s(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * ch * 2, true);
      for (let i = 0; i < n; i++) { const x = Math.round(Math.sin(i / sr * 330 * 6.283) * 9000); for (let k = 0; k < ch; k++) v.setInt16(44 + (i * ch + k) * 2, x, true); } return B; };
    const an = c.createAnalyser(); an.fftSize = 2048; const arr = new Float32Array(2048); let hooked = false;
    const rms = () => { an.getFloatTimeDomainData(arr); let s = 0; for (const x of arr) s += x * x; return Math.sqrt(s / arr.length); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // the real frame (Game.frameStep: with the map open it calls Audio.updateMusic) at most once a second — a software-rendered
    // frame can block the page for seconds — and the map branch's own Audio.updateMusic between them, so samples keep coming
    let lastFrame = 0; const run = async (sec) => { const S = []; const t0 = performance.now(); while (performance.now() - t0 < sec * 1000) { await sleep(150); if (performance.now() - lastFrame > 1000) { g.frameStep(0.15); lastFrame = performance.now(); } else Audio.updateMusic(0.15, {}); if (!hooked && Audio.musicGain) { Audio.musicGain.connect(an); hooked = true; } S.push([+((performance.now() - t0) / 1000).toFixed(1), +rms().toFixed(3), Audio.musicMode]); } return S; };
    const MR = () => Audio.musicRec || {};
    const trial = async (id, data, sec) => {
      SB.raw.set(id, { data, name: id + '.wav', vol: 1, src: 'test', type: 'wav' }); SB.buf.delete(id); Settings.set('mapMusic', id.endsWith('1') ? 'track1' : 'track2');
      g.toggleMap(true); const S = await run(sec); const smp = MR().smp; const r = { bytes: data.byteLength, kind: smp ? (smp.el ? 'stream' : 'decoded') : 'none', loop: smp ? (smp.el ? smp.el.loop : smp.src.loop) : null,
        elDur: smp && smp.el ? +smp.el.duration.toFixed(2) : null, elT: smp && smp.el ? +smp.el.currentTime.toFixed(2) : null, mapOpen: g.hud.bigMapOpen, S };
      g.toggleMap(false); r.close = await run(2.2); r.pos = +(((MR().pos || {})[id]) || 0).toFixed(2); r.after = MR().smp ? 'playing' : 'stopped';
      g.toggleMap(true); await run(1.2); const s2 = MR().smp; r.resumeT = s2 && s2.el ? +s2.el.currentTime.toFixed(2) : s2 ? +((s2.off + c.currentTime - s2.t0) % s2.len).toFixed(2) : null; r.resumeOff = s2 && !s2.el ? +s2.off.toFixed(2) : null;
      g.toggleMap(false); await run(2); return r; };
    out.small = await trial('music.map1', wav(2.5, 44100), 7); // 441 KB, 2.5 s: loops ~3 times
    out.big = await trial('music.map2', wav(5, 192000), 13); // 5 s × 192 kHz × 2 ch × 2 B = 3.84 MB (> 2.5 MB): streamed, loops twice
    return out; });
  console.log(JSON.stringify({ ...R, small: { ...R.small, S: R.small.S.map((x) => x[1]).join(' ') }, big: { ...R.big, S: R.big.S.map((x) => x[1]).join(' ') } }));
  // audible from the first sample above the floor to the last one, for more than one full length of the track (it wrapped)
  const span = (S) => { const i = S.findIndex((x) => x[1] > 0.05); if (i < 0) return { len: 0, gaps: 1 }; const tail = S.slice(i); return { len: tail[tail.length - 1][0] - S[i][0], gaps: tail.filter((x) => x[1] < 0.05).length }; };
  ok(R.state === 'running', 'audio context running');
  ok(R.stream && R.explore, 'map tracks are streamed slots (no 2-minute cap in the sounds window); the other music slots are unchanged');
  const a = span(R.small.S); ok(R.small.kind === 'decoded' && R.small.loop, `small file (${(R.small.bytes / 1024).toFixed(0)} KB) is decoded and looped seamlessly`);
  ok(a.len > 2.5 * 1.5 && a.gaps === 0, `small 2.5 s track keeps playing past its end while the map is open (${a.len.toFixed(1)} s without a gap)`);
  const b = span(R.big.S); ok(R.big.kind === 'stream' && R.big.loop && Math.abs(R.big.elDur - 5) < 0.1, `big file (${(R.big.bytes / 1048576).toFixed(1)} MB) streams through a looping element (duration ${R.big.elDur} s)`);
  ok(b.len > 5 * 1.2 && b.gaps === 0, `big 5 s track keeps playing past its end (${b.len.toFixed(1)} s without a gap)`);
  ok(R.small.after === 'stopped' && R.big.after === 'stopped' && R.small.close.every((x) => x[2] !== 'map1') && R.big.close.every((x) => x[2] !== 'map2'), 'closing the map fades the track out and stops it (game music back)');
  ok(R.small.pos > 0.1 && Math.abs(R.small.resumeOff - R.small.pos) < 0.05, `small track resumes where it stopped (${R.small.pos} → ${R.small.resumeOff})`);
  ok(R.big.pos > 0.1 && R.big.resumeT > 0.1, `big track resumes where it stopped (${R.big.pos} → now ${R.big.resumeT})`);
  ok(errs.length === 0, 'no page errors');
} catch (e) { console.log('ERR', e); fails++; }
finally { await browser.close(); }
console.log('page errors: ' + (errs.length ? errs.join(' | ') : 'none'));
console.log(`map-music-test: ${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
