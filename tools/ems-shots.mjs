// 75th: visual review of the ambulance crew at work (real renders of the game in headless SwiftShader): the response bag +
// AED and the bag-valve-mask during CPR, the cot sliding out of the interior-mapped compartment with its legs unfolding,
// the sheet being spread and lowered, the covered patient carried and loaded. Frames are rendered on demand inside the page
// (the sim is stepped headless between shots) and read back from the canvas.
//   PORT=5204 node tools/ems-shots.mjs [outDir=dev/tmp/ems] [quality=medium]
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'node:fs';
const [OUT = 'dev/tmp/ems', Q = 'medium'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'], defaultViewport: { width: 960, height: 540 } });
const errors = [];
// shot: when (phase test on u.e), cam relative to the body (b) or the van (v): [right, up, back] offsets in that frame
const SHOTS = [
  { name: '75-ems-assess-kit', when: 'e.ph === "assess" && e.t > 2', frame: 'b', cam: [2.2, 1.5, -1.6], look: [0, 0.2, 0] },
  { name: '75-ems-cpr-bvm', when: 'e.ph === "cpr" && e.t > 3', frame: 'b', cam: [1.4, 1.2, 1.5], look: [0, 0.25, 0.2] },
  { name: '75-ems-doors-interior', when: 'e.ph === "fetch" && e.rear > 0.95 && e.slide < 0', frame: 'v', cam: [0.35, 1.6, -4.3], look: [0, 1.05, -1.0] },
  { name: '75-ems-cot-out', when: 'e.ph === "fetch" && e.slide > 0.55 && e.slide < 0.8', frame: 'v', cam: [2.8, 1.4, -5.6], look: [0, 0.7, -3.2] },
  { name: '75-ems-cover-spread', when: 'e.ph === "cover" && e.cov > 0.3 && e.cov < 0.45', frame: 's', cam: [2.2, 1.6, 0.4], look: [0, 0.6, 0] },
  { name: '75-ems-cover-down', when: 'e.ph === "liftUp" && e.t < 1.2', frame: 's', cam: [1.9, 1.3, 0.9], look: [0, 0.45, 0] },
  { name: '75-ems-carry', when: 'e.ph === "carry" && e.t > 2', frame: 's', cam: [2.6, 1.5, 0.6], look: [0, 0.7, 0] },
  { name: '75-ems-load', when: 'e.ph === "load" && e.slide > 0.4', frame: 'v', cam: [1.8, 1.6, -5.4], look: [0, 0.9, -2.6] },
  // the body holding room (frame 'w': hospital plan coordinates [u, y, v]); these follow the ambulance to the hospital
  { name: '75-br-wheel-in', when: 'e.bp === \"room\" && e.wi === 1', frame: 'w', cam: [27.6, 1.7, 7.6], look: [25.3, 1.0, 11.5], br: true },
  { name: '75-br-round-van', when: 'e.bp === \"room\" && e.wi === 1 && e.S && Math.abs(e.S.z - (-190 - 4)) < 1.5', frame: 'w', cam: [21.9, 1.8, -1.0], look: [24.5, 0.8, 4.5], br: true },
  { name: '75-br-transfer', when: 'e.bp === \"transfer\" && e.t > 1.6', frame: 'w', cam: [25.3, 1.65, 10.2], look: [25.7, 0.8, 13.6], br: true },
  { name: '75-br-restow', when: 'e.bp === \"restow\" && e.t > 1.2', frame: 'w', cam: [22.4, 1.7, -4.5], look: [26.2, 0.9, -0.5], br: true },
  { name: '75-br-attendant', when: 'BR.att.state === \"push\" && BR.att.t > 2.6', frame: 'w', cam: [27.7, 1.65, 11.6], look: [25.4, 0.9, 15.0], br: true },
  { name: '75-br-outside', when: 'BR.att.state === \"walk\" && BR.att.next === \"gone\" && BR.att.pi >= 3', frame: 'w', cam: [29.0, 1.7, 6.6], look: [25.3, 1.4, 11.5], br: true },
];
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 300))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5204) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const setup = await page.evaluate(async () => { const g = window.__game, P = g.player, C = g.crowd, E = g.police.ems; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.atmos.hour = 10.5;
    g.atmos.setWeather && g.atmos.setWeather('clear', true); g.atmos.wet = 0; g.hud.show(false);
    P.teleport(666, -168, Math.PI); g.world.warm(666, -168); await g.stepSim(20, 0.1);
    const p = C.peds.filter((q) => q.state !== 'down' && !q.dead && q.ch.root.parent).sort((a, b) => Math.hypot(a.x - 676, a.z + 166) - Math.hypot(b.x - 676, b.z + 166))[0]; if (!p) return { err: 'no ped' };
    p.x = 672; p.z = -173.6; p.ch.root.position.set(p.x, p.ch.root.position.y, p.z); C.kill(p); p.deadT = 400; window.__emsP = p; return { ok: true }; });
  console.log('setup', JSON.stringify(setup));
  for (const s of SHOTS) {
    const t0 = Date.now();
    const r = await page.evaluate(async (s) => { const g = window.__game, P = g.player, E = g.police.ems, p = window.__emsP; const test = new Function('e', 'BR', 'return ' + s.when); const BR = g.hospital && g.hospital.bodyRoom;
      for (let i = 0; i < 2500; i++) { const u = s.br ? E.units[0] : E.units.find((q) => q.e && (q.e.p === p || q.e.cargo)); if ((u || s.br) && test(u ? u.e : {}, BR)) break; await g.stepSim(1, 0.1); if (p.deadT < 400) p.deadT = 400; if (s.br) { P.x = 700; P.z = -186; } else { P.x = 666; P.z = -168; } }
      const u = s.br ? E.units[0] : E.units.find((q) => q.e && (q.e.p === p || q.e.cargo)); if (!u && !s.br) return { err: 'no unit' }; const e = u ? u.e : {}, v = u ? u.v : null;
      let o, yaw; if (s.frame === 'w') { const H = g.hospital; const [cx, cz] = H.toWorld(s.cam[0], s.cam[2]), [lx, lz] = H.toWorld(s.look[0], s.look[2]); o = { x: 0, y: H.FLOOR_Y[0], z: 0 }; yaw = 0; s = { ...s, cam: [cx, s.cam[1], cz], look: [lx, s.look[1], lz] }; } else if (s.frame === 'v') { o = { x: v.x, y: v.y, z: v.z }; yaw = v.yaw; } else if (s.frame === 's' && e.S) { o = { x: e.S.x, y: e.S.y - 0.42, z: e.S.z }; yaw = e.S.yaw; } else { const r = p.ch.rag; const c = r ? r.part('chest') : { x: p.x, y: 0.2, z: p.z }; o = { x: c.x, y: g.collision.groundAt(c.x, c.z, c.y + 0.3), z: c.z }; const h = r ? r.part('head') : c; yaw = Math.atan2(h.x - c.x, h.z - c.z); }
      const W = (a) => { const c = Math.cos(yaw), sn = Math.sin(yaw); return [o.x + a[0] * c + a[2] * sn, o.y + a[1], o.z - a[0] * sn + a[2] * c]; };
      P.camOverride = true; g.camera.position.set(...W(s.cam)); g.camera.lookAt(...W(s.look)); g.camera.updateMatrixWorld();
      g.noRender = false; for (let k = 0; k < 3; k++) { g.scene.updateMatrixWorld(); if (g.post) g.post.render(1 / 60); else g.renderer.render(g.scene, g.camera); }
      const url = g.renderer.domElement.toDataURL('image/png'); const BR2 = g.hospital && g.hospital.bodyRoom; g.noRender = true; P.camOverride = false;
      return { url, ph: e.ph, t: e.t != null ? +e.t.toFixed(1) : null, bp: e.bp, att: BR2 ? BR2.att.state + '/' + BR2.att.t.toFixed(1) + '/' + BR2.stats.stored : null, cov: e.cov, slide: e.slide, legs: e.st && e.st.userData.cot ? e.st.userData.cot.ext.map((x) => +x.toFixed(2)) : null, uCot: v && v.mesh.userData.rear ? v.mesh.userData.rear.cav.material.uniforms.uCot.value : null };
    }, s);
    if (r.url) { if (!ONLY.length || ONLY.includes(s.name)) fs.writeFileSync(`${OUT}/${s.name}.png`, Buffer.from(r.url.split(',')[1], 'base64')); delete r.url; }
    console.log('shot', s.name, JSON.stringify(r), ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
} catch (e) { console.log('ERR', (e.stack || e.message).split('\n').slice(0, 4).join(' / ')); } finally { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]); try { browser.process() && browser.process().kill('SIGKILL'); } catch (e) { /* gone */ } }
console.log('errors:', errors.slice(0, 6).join(' | ') || 'none');
