// Sun-shadow stability check in the real game (production build): node tools/shadow-stability.mjs [quality=medium]   (PORT env, default 5199)
// The world is frozen (no sim step); the camera stays put while the shadow box is refitted for a focus that drifts in sub-texel
// steps (walking / driving) and for a camera that turns a little (box pushed ahead of the view). Every refit is rendered and
// compared with the previous frame: with texel snapping the shadow map's grid never moves relative to the world, so
// consecutive frames must be pixel-identical; without it (snap off, for reference) shadow edges crawl. Also checks
// coverage: the player and a parked car next to him must be inside the box at every sun elevation / for the moon.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [Q = 'medium'] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'], defaultViewport: { width: 960, height: 540 } });
const errors = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const res = await page.evaluate(async () => {
    const g = window.__game, A = g.atmos, L = window.__L; g.hud.root.style.display = 'none'; g.story.state.wanted = 0;
    let x = -392, z = 700; for (let k = 1; k < 40 && !L.roadAt(x, z); k++) x += 1; let xe = x; while (L.roadAt(xe + 0.5, z) && xe < x + 40) xe += 0.5;
    g.world.warm(xe - 4, z); g.player.teleport(xe - 4.1, z + 4.6, 0); A.hour = 10; A.setWeather('clear', true); A.wet = 0;
    const V = window.__Vehicle; const v = new V('sedan', 4, g.scene); v.place(xe - 2.2, z + 2, 0); g.traffic.release(v, false); v.speed = 0;
    await g.stepSim(8, 0.05); g.noRender = true; g.player.camOverride = true;
    const cam = g.camera; cam.position.set(xe - 7.4, 1.55, z - 2.6); cam.lookAt(xe - 2.2, 0.55, z + 2.4); cam.updateMatrixWorld();
    const T = cam.position.constructor; const focus0 = new T(g.player.x, g.player.y || 0, g.player.z); const Ldir = A.sunDir.clone();
    const cv = g.renderer.domElement, W = 480, H = 270, off = document.createElement('canvas'); off.width = W; off.height = H; const ox = off.getContext('2d');
    const grab = () => { g.renderer.render(g.scene, cam); ox.drawImage(cv, 0, 0, W, H); return ox.getImageData(0, 0, W, H).data; };
    const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) n++; return n; };
    const out = {};
    for (const snap of [true, false]) {
      A.shadowCfg.snap = snap; const walk = [], turn = [];
      let prev = null; for (let k = 0; k < 8; k++) { A.fitSunShadow(focus0.clone().add(new T(0.013 * k, 0, 0.021 * k)), cam, Ldir); const f = grab(); if (prev) walk.push(diff(prev, f)); prev = f; }
      prev = null; const q0 = cam.quaternion.clone(); for (let k = 0; k < 6; k++) { cam.quaternion.copy(q0); cam.rotateY(0.004 * k); cam.updateMatrixWorld(); A.fitSunShadow(focus0, cam, Ldir); cam.quaternion.copy(q0); cam.updateMatrixWorld(); const f = grab(); if (prev) turn.push(diff(prev, f)); prev = f; }
      out[snap ? 'snapOn' : 'snapOff'] = { walk, turn };
    }
    A.shadowCfg.snap = true;
    // coverage: light-space position of the player / car must be inside the box (with the edge fade zone excluded)
    const cover = []; const sc = A.sun.shadow.camera;
    for (const [name, dir] of [['noon', null], ['sun 30°', 30], ['sun 12°', 12], ['sun 5°', 5], ['moon', 'moon']]) {
      let Ld; if (dir === null) Ld = A.sunDir.clone(); else if (dir === 'moon') Ld = new T(-0.4, 0.8, -0.3).normalize(); else { const e = dir * Math.PI / 180; Ld = new T(Math.cos(e) * 0.97, Math.sin(e), 0.22).normalize(); }
      A.fitSunShadow(focus0, cam, Ld); A.sun.updateMatrixWorld(); sc.position.copy(A.sun.position); sc.lookAt(A.sun.target.position); sc.updateMatrixWorld();
      const pts = { feet: new T(g.player.x, 0.05, g.player.z), tyre: new T(xe - 2.2 + 0.8, 0.05, z + 2 + 1.3), wall6m: new T(xe - 9, 6, z + 4) };
      const r = { name, w: +(sc.right - sc.left).toFixed(1), h: +(sc.top - sc.bottom).toFixed(1), nb: +A.sun.shadow.normalBias.toFixed(3), r: A.sun.shadow.radius };
      for (const [k, p] of Object.entries(pts)) { const q = p.clone().applyMatrix4(sc.matrixWorldInverse); const u = (q.x - sc.left) / (sc.right - sc.left), w = (q.y - sc.bottom) / (sc.top - sc.bottom); r[k] = u > 0.07 && u < 0.93 && w > 0.07 && w < 0.93 ? 'in' : `OUT(${u.toFixed(2)},${w.toFixed(2)})`; }
      cover.push(r);
    }
    return { out, cover, rev: g.renderer.state.buffers.depth.getReversed(), map: A.sun.shadow.mapSize.x };
  });
  console.log(JSON.stringify(res, null, 1));
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
console.log('errors:', errors.slice(0, 6).join(' | ') || 'none');
