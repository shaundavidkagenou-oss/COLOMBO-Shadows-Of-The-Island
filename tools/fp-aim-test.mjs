// 95th: first-person aim steadiness + slung-rifle motion (headless Chromium, the real game, sim stepped at 40 fps).
//   PORT=5199 node tools/fp-aim-test.mjs
// 1. FP aim: a pistol and a rifle aimed down the sights while walking, turning (mouse) and firing. Every frame the sight point
//    is taken into camera space: its offset from the view line (mm) and the frame-to-frame jerk of that offset. Run with the
//    re-alignment (Weapons.fpRealign, the fix) and without it (the old one-frame-late placement) on the same input script.
// 2. The slung rifle while running: the hang's rotation (chest space) per frame → angular speed and its frame-to-frame change
//    (jerk), with the pendulum hang (CarryGear.hangStep) and with the old rigid hang.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const PORT = process.env.PORT || 5199;
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail++; };
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await page.evaluateOnNewDocument(() => localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })));
  await page.goto(`http://localhost:${PORT}/?test&quick=play`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const R = await page.evaluate(async () => {
    const g = window.__game, P = g.player, W = g.weapons, I = window.__Input, T = window.__THREE; g.noRender = true; g.story.cancelAll?.(); g.story.running = null; g.atmos.hour = 11;
    W.inv.forEach((v) => { v.owned = true; }); /* the test owns every weapon */ const DT = 1 / 40; const WEAP = (await import('/src/combat/WeaponDefs.js')).WEAPONS;
    const idx = (cls) => WEAP.findIndex((d, i) => d.cls === cls && W.inv[i] && W.inv[i].owned);
    const settle = async (n) => { for (let i = 0; i < n; i++) await g.stepSim(1, DT); };
    const draw = async (i) => { if (W.cur !== i || !W.drawn) W.select(i); for (let k = 0; k < 120 && !(W.state === 'ready' && W.cur === i); k++) await g.stepSim(1, DT); return W.state === 'ready'; };
    const out = {};
    // ---------------------------------------------------------------- 1. FP aim
    const aimRun = async (cls, realign) => {
      const orig = W.fpRealign; if (!realign) W.fpRealign = () => {};
      P.camMode = 2; await draw(idx(cls)); W.inv.forEach((v, i) => { v.mag = WEAP[i].mag; v.reserve = Math.max(v.reserve, 200); }); /* same ammo every run: no reload mid-measure */ P.camPitch = 0.05; await settle(10);
      const cam = g.camera, v = new T.Vector3(), q = new T.Quaternion(); const offs = []; let t = 0;
      for (let f = 0; f < 160; f++) { t += DT;
        I.mouseButtons.add(2); // aim (ADS) held
        I.mouseDX = Math.sin(t * 2.6) * 9 + (f > 80 && f < 100 ? 22 : 0); I.mouseDY = Math.cos(t * 1.7) * 2.5; // turning + a quick flick
        const fire = f > 40 && f % 9 === 0; if (fire) { I.mousePressed.add(0); I.mouseButtons.add(0); }
        await g.stepSim(1, DT, ['KeyW']); I.mouseButtons.delete(0); I.mousePressed.delete(0);
        if (f < 30 || W.state !== 'ready') continue; // into ADS (and only the aimed, shooting frames: a reload lowers the gun on purpose)
        const m = W.models[W.cur]; const ud = m.userData; if (!ud.sight) continue; m.updateWorldMatrix(true, false); cam.updateMatrixWorld();
        v.copy(ud.sight).applyMatrix4(m.matrixWorld).sub(cam.position).applyQuaternion(q.copy(cam.quaternion).invert()); // camera space (−z forward)
        offs.push([v.x * 1000, v.y * 1000, f, W.state, +v.z.toFixed(2)]); }
      I.mouseButtons.clear(); I.mousePressed.clear(); I.mouseDX = 0; I.mouseDY = 0; W.fpRealign = orig; /* nothing left held (a stale press re-draws the gun) */
      const shotNear = (f) => f > 40 && (f % 9) < 5; /* the 4 frames after a shot: the recoil kick is meant to move the gun */ let jerk = 0, mean = 0, jq = 0, nq = 0; for (let i = 0; i < offs.length; i++) { mean += Math.hypot(offs[i][0], offs[i][1]); if (i >= 2 && offs[i][2] - offs[i - 2][2] === 2 && !shotNear(offs[i][2]) && !shotNear(offs[i - 1][2]) && !shotNear(offs[i - 2][2])) { const jx = offs[i][0] - 2 * offs[i - 1][0] + offs[i - 2][0], jy = offs[i][1] - 2 * offs[i - 1][1] + offs[i - 2][1]; jq += jx * jx + jy * jy; nq++; } if (i >= 2) { const jx = offs[i][0] - 2 * offs[i - 1][0] + offs[i - 2][0], jy = offs[i][1] - 2 * offs[i - 1][1] + offs[i - 2][1]; jerk += jx * jx + jy * jy; } }
      const worst = offs.map((o) => [+Math.hypot(o[0], o[1]).toFixed(1), o[2], o[3], o[4]]).sort((x, y) => y[0] - x[0]).slice(0, 6); return { worst, n: offs.length, meanOffMm: +(mean / offs.length).toFixed(2), jerkRmsMm: +Math.sqrt(jerk / Math.max(1, offs.length - 2)).toFixed(2), jerkQuietMm: +Math.sqrt(jq / Math.max(1, nq)).toFixed(2), nq };
    };
    for (const cls of ['pistol', 'rifle']) { if (idx(cls) < 0) continue; out['fp-' + cls + '-fix'] = await aimRun(cls, true); out['fp-' + cls + '-old'] = await aimRun(cls, false); }
    // ---------------------------------------------------------------- 2. slung rifle while running (third person)
    P.camMode = 0; await draw(idx('rifle')); W.holster(); for (let k = 0; k < 120 && W.drawn; k++) await g.stepSim(1, DT); await settle(10);
    const G = W.gear; out.slung = !!G.slung; { const lm = G.carryL >= 0 ? W.models[G.carryL] : null; out.slungDbg = { st: W.state, drawn: W.drawn, cur: W.cur, carryL: G.carryL, par: lm && lm.parent && (lm.parent === W.holsterR ? 'holsterR' : lm.parent === W.inHand ? 'inHand' : lm.parent.name || lm.parent.type), vis: lm && lm.visible, hide: G.hideLong, hasF: !!(G.cur.L && G.cur.L.F) }; }
    const hangRun = async (pend) => {
      const orig = G.hangStep; if (!pend) G.hangStep = function () { if (this._hang) this._hang.ok = false; };
      const Q = new T.Quaternion(), prevQ = new T.Quaternion(), M = new T.Matrix4(), S = new T.Vector3(), pos = new T.Vector3(); const w = []; let has = false;
      for (let f = 0; f < 140; f++) { await g.stepSim(1, DT, f % 50 < 38 ? ['KeyW', 'ShiftLeft'] : ['KeyW']); M.copy(W.holsterR.matrix); M.decompose(pos, Q, S);
        if (has) w.push(2 * Math.acos(Math.min(1, Math.abs(prevQ.dot(Q)))) / DT); prevQ.copy(Q); has = true; }
      G.hangStep = orig; let jerk = 0, peak = 0, mean = 0; for (let i = 0; i < w.length; i++) { mean += w[i]; peak = Math.max(peak, w[i]); if (i) jerk += (w[i] - w[i - 1]) ** 2; }
      return { meanRadS: +(mean / w.length).toFixed(3), peakRadS: +peak.toFixed(3), jerkRms: +Math.sqrt(jerk / (w.length - 1)).toFixed(3) };
    };
    out['hang-pendulum'] = await hangRun(true); out['hang-old'] = await hangRun(false);
    return out;
  });
  console.log(JSON.stringify(R, null, 1));
  for (const cls of ['pistol', 'rifle']) { const a = R['fp-' + cls + '-fix'], b = R['fp-' + cls + '-old']; if (!a) continue;
    ok(a.jerkRmsMm <= b.jerkRmsMm + 0.05, `${cls}: sight jitter vs the view ${a.jerkRmsMm} mm (old ${b.jerkRmsMm} mm)`);
    ok(a.jerkQuietMm <= b.jerkQuietMm * 0.8 + 0.05, `${cls}: jitter between shots (walking + turning) ${a.jerkQuietMm} mm (old ${b.jerkQuietMm} mm)`);
    ok(a.meanOffMm <= 12, /* absolute: the designed turn-lag / recoil sway is a few mm at the sight; this guards against the gun drifting off the view line */ `${cls}: sight offset from the view line ${a.meanOffMm} mm (old ${b.meanOffMm} mm)`); }
  ok(R.slung, 'rifle slung on the back');
  ok(R['hang-pendulum'].jerkRms < R['hang-old'].jerkRms, `slung rifle jerk ${R['hang-pendulum'].jerkRms} (old ${R['hang-old'].jerkRms}) · peak ${R['hang-pendulum'].peakRadS} rad/s (old ${R['hang-old'].peakRadS})`);
} catch (e) { console.log('ERR', e); fail++; }
ok(!errors.length, 'page errors: ' + (errors.join(' | ').slice(0, 400) || 'none'));
await browser.close(); console.log(fail ? `fp-aim: ${fail} FAILED` : 'fp-aim: all passed'); process.exit(fail ? 1 : 0);
