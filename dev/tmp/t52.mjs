// 52nd: browser checks — breakaway lamp / signal crash, lake junction views, customs real-car bonnet/roof skins + turntable oil.
// node dev/tmp/t52.mjs outDir phases(p=poles,l=lake,c=customs)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'fs';
const [outDir = '/tmp/t52', PH = 'plc'] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1700000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540', '--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 960, height: 540 } });
const errors = []; let page; const ev = (fn, ...a) => page.evaluate(fn, ...a);
const shot = async (name, wait = 4000) => { await new Promise((r) => setTimeout(r, wait)); await page.screenshot({ path: `${outDir}/${name}.png` }); console.log('shot', name); };
try {
  page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'medium', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  console.log('loaded');
  await ev(() => { const g = window.__game; g.atmos.hour = 11; g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.story.state.money = 400000;
    window.__t = {
      async seat(type, x, z, yaw) { const g = window.__game, P = g.player; if (P.vehicle) { const v = P.vehicle; v.speed = 0; v.mesh.remove(P.ch.root); g.scene.add(P.ch.root); v.player = false; P.vehicle = null; P.ch.anim.standUp(); g.traffic.release(v); P.respawnReset(); }
        g.world.warm(x, z); P.teleport(x - 3, z + 3, 0); const v = new window.__Vehicle(type, 7, g.scene); v.place(x, z, yaw); g.traffic.release(v, false);
        P.teleport(v.x + Math.cos(yaw) * 2.2, v.z - Math.sin(yaw) * 2.2, yaw); P.enterVehicle(v, g.traffic); for (let i = 0; i < 80 && P.entry; i++) await g.stepSim(5, 0.05);
        v.place(x, z, yaw); v.speed = 0; await g.stepSim(4, 0.05); return v; },
      async crash(kind, sp, nth = 0) { const g = window.__game, W = g.world; const cols = W.collision.list.filter((c) => c.brk && c.brk.type === kind && c.h > 0 && !c.brk._down);
        let found = 0;
        for (const c of cols) { const p = c.brk; const ax = Math.sin(p.rot), az = Math.cos(p.rot), dx = Math.cos(p.rot), dz = -Math.sin(p.rot);
          for (const sgn of [1, -1]) { const ddx = dx * sgn, ddz = dz * sgn; const ox = p.x + ax * 0.6, oz = p.z + az * 0.6; const sx = ox - ddx * 11, sz = oz - ddz * 11;
            // the run must be clear: nothing solid in the car's band except the target, flat ground
            let clear = true; for (let t = 0; t <= 14; t += 0.5) { const qx = sx + ddx * t, qz = sz + ddz * t; for (const o of W.collision.query(qx - 1.3, qz - 1.3, qx + 1.3, qz + 1.3)) { if (o === c || !(o.h > 0.4)) continue; if (o.x1 > qx - 1.2 && o.x0 < qx + 1.2 && o.z1 > qz - 1.2 && o.z0 < qz + 1.2) { clear = false; break; } } if (!clear) break; if (window.__L.isWater(qx, qz)) { clear = false; break; } }
            if (!clear) continue; if (found++ < nth) continue;
            const yaw = Math.atan2(ddx, ddz); const v = await this.seat('car', sx, sz, yaw); const out = { pole: [+p.x.toFixed(1), +p.z.toFixed(1)], type: p.type, sp0: sp, track: [] };
            for (let f = 0; f < 50; f++) { if (f < 30 && !p._down) v.speed = sp; await g.stepSim(1, 1 / 30); if (f % 5 === 0) out.track.push([+v.speed.toFixed(2), p._down ? 1 : 0]); }
            out.broken = !!p._down; out.colH = c.h; out.speedAfter = +v.speed.toFixed(2); out.damage = +(v.damage || 0).toFixed(3);
            for (let f = 0; f < 120; f++) await g.stepSim(1, 1 / 30);
            out.info = g.propBreak.info(); const d = g.propBreak.down[g.propBreak.down.length - 1];
            if (d) { const box = { min: 1e9 }; d.root.updateMatrixWorld(true); d.root.traverse((o) => { if (o.isMesh) { const P2 = o.geometry.attributes.position; const v3 = o.position.clone(); for (let i = 0; i < P2.count; i += 3) { v3.fromBufferAttribute(P2, i).applyMatrix4(o.matrixWorld); const gy = window.__L.surfaceY(v3.x, v3.z); box.min = Math.min(box.min, v3.y - gy); } } }); out.drop = d.S && d.S._drop; out.lowestAboveGround = +box.min.toFixed(3); out.cam = [d.x + d.dz * 5 - d.dx * 2, 2.6, d.z - d.dx * 5 - d.dz * 2]; out.look = [d.x + d.dx * 3, 0.4, d.z + d.dz * 3]; }
            g.player.camOverride = true; if (out.cam) { g.camera.position.set(...out.cam); g.camera.lookAt(...out.look); g.camera.updateMatrixWorld(); }
            return out; } }
        return { none: true, n: cols.length }; },
    }; });
  if (PH.includes('p')) {
    for (const [kind, sp, nth] of [['lamp', 15, 0], ['signal', 12, 0], ['lamp', 4, 1]]) {
      const r = await ev(async (k, s, n) => window.__t.crash(k, s, n), kind, sp, nth); console.log('crash', kind, sp, JSON.stringify(r)); await shot(`pole-${kind}-${sp}`);
      await ev(() => { window.__game.player.camOverride = false; });
    }
  }
  if (PH.includes('l')) {
    for (const [name, cam, look] of [['lake-junction-ne', [114, 3.2, -398], [100, -0.2, -424]], ['lake-junction-s', [34, 3.2, -523], [27, -0.2, -500]], ['lake-east-tip', [262, 3.5, -455], [238, -0.2, -472]]]) {
      await ev(async (cam, look) => { const g = window.__game; g.world.warm(cam[0], cam[2]); g.player.teleport(cam[0], cam[2], 0); await g.stepSim(6, 0.05); g.player.camOverride = true; g.camera.position.set(...cam); g.camera.lookAt(...look); g.camera.updateMatrixWorld(); }, cam, look);
      await shot(name);
    }
    await ev(() => { window.__game.player.camOverride = false; });
  }
  if (PH.includes('c')) {
    const r = await ev(async () => { const g = window.__game, L = window.__L, S = L.CUSTOMS_SITE; const [px, pz] = S.toWorld(0, 1.0); const v = await window.__t.seat('raiden', px, pz, S.yawOf(0));
      await g.stepSim(4, 0.05); const I = window.__Input; I.pressed.add(I.code('interact')); await g.stepSim(1, 0.05);
      for (let t = 0; t < 40 && g.customs.state !== 'shop'; t += 0.1) await g.stepSim(2, 0.05);
      const u = g.customs.ui; if (u.level === 'repair') u.repair(); await g.stepSim(2, 0.05);
      const ci = u.cats.findIndex((c) => c.id === 'exterior'); u.setCat(ci); const out = { state: g.customs.state, cats: u.cats.map((c) => c.id).join(','), slots: u.slots.map((s) => s.id).join(',') };
      for (const [slot, opt] of [['hood', 'carbon'], ['roof', 'carbon']]) { const si = u.slots.findIndex((s) => s.id === slot); if (si < 0) { out[slot] = 'no slot'; continue; } u.setSlot(si); const oi = u.options(u.slot).findIndex((o) => o.id === opt); u.setOpt(oi, true); u.buy(); await g.stepSim(4, 0.05); out[slot] = u.flash && u.flash.msg; u.back(); }
      for (let i = 0; i < 60; i++) await g.stepSim(2, 0.05);
      return out; });
    console.log('customs', JSON.stringify(r));
    await ev(async () => { const g = window.__game; g.customs.setView('overall', true); await g.stepSim(6, 0.05); }); await shot('customs-raiden-overall', 5000);
    await ev(async () => { const g = window.__game, v = g.customs.v; g.customs.orbit.tYaw = 2.4; g.customs.orbit.tPitch = 0.55; g.customs.orbit.tDist = 5.2; g.customs.orbit.idle = 0; for (let i = 0; i < 20; i++) await g.stepSim(1, 0.05); void v; }); await shot('customs-raiden-front', 5000);
    // turntable oil: top-down at 0 and at 1.3 rad
    for (const a of [0, 1.3]) { await ev(async (a) => { const g = window.__game, cs = g.customs; const tt = cs.geo.turntable; tt.rotation.y = a; const p = tt.getWorldPosition(tt.position.clone()); cs.v.mesh.visible = false; cs.state_ = cs.state; cs.state = 'freeze'; g.player.camOverride = true; g.camera.position.set(p.x + 0.01, p.y + 9.5, p.z); g.camera.lookAt(p.x, p.y, p.z); g.camera.updateMatrixWorld(); await g.stepSim(1, 0.05); }, a); await shot(`customs-turntable-${a}`, 4000); }
    await ev(() => { const g = window.__game, cs = g.customs; cs.state = cs.state_; cs.v.mesh.visible = true; g.player.camOverride = false; });
  }
  if (PH.includes('d')) { // 53rd: dialogs window + NPC voices + horn gate + distant grenade, in the real build
    const r = await ev(async () => {
      const g = window.__game, SB = window.__sounds, V = window.__voices, A = window.__audio; const out = {};
      A.init(); if (A.ctx.state === 'suspended') await A.ctx.resume(); out.ctx = A.ctx.state;
      const wav = (sec, f) => { const sr = 22050, n = Math.round(sr * sec), b = new ArrayBuffer(44 + n * 2), v = new DataView(b); const W = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
        W(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); W(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); W(36, 'data'); v.setUint32(40, n * 2, true);
        for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / sr * f * 6.283) * 8000 * Math.min(1, (n - i) / 400), true); return b; };
      g.debugCon.exec('dialogs'); for (let i = 0; i < 100 && !(globalThis.__dialogsWin && globalThis.__dialogsWin.save); i++) await new Promise((r) => setTimeout(r, 100));
      const W = globalThis.__dialogsWin; out.win = !!W; if (!W) return out;
      W.setGroup('woman'); W.pend.set('dlg.woman.scream', { op: 'set', data: wav(1.2, 660), name: 'test-scream.wav', vol: 1 }); W.pend.set('dlg.any.scream.var1', { op: 'set', data: wav(0.8, 440), name: 'any.wav', vol: 1 }); W.render(); await W.save();
      out.has = [SB.has('dlg.woman.scream'), SB.has('dlg.any.scream'), SB.has('dlg.man.scream')];
      out.findWoman = V.find({ sex: 'f', age: 'adult' }, 'scream'); out.findMan = V.find({ sex: 'm', age: 'adult' }, 'scream'); out.findUncleTalk = V.find({ sex: 'm', age: 'elder' }, 'talk');
      const P = g.player; const who = { x: P.x + 4, z: P.z }; out.dur = V.say({ sex: 'f', age: 'adult' }, 'scream', who.x, who.z, who); out.busy = V.say({ sex: 'f', age: 'adult' }, 'scream', who.x, who.z, who); out.stats = { ...V.stats };
      // a real crowd ped reacting
      const peds = g.crowd ? g.crowd.peds.filter((p) => !p.dead && Math.hypot(p.x - P.x, p.z - P.z) < 35) : []; out.peds = peds.length;
      if (peds[0]) { const p0 = peds[0]; p0.sp.sex = 'f'; const before = V.stats.played; for (let k = 0; k < 6 && V.stats.played === before; k++) { p0._voiceT = 0; V.lastSit.clear(); g.crowd.voiceReact(p0, 'cower', 3); } out.pedVoiced = V.stats.played > before; }
      // horns: hammer the player's horn 10× in 1 s → one horn
      let n = 0; const v = { x: P.x, z: P.z }; for (let i = 0; i < 10; i++) { if (A.hornFree(v, true)) n++; await new Promise((r) => setTimeout(r, 100)); } out.playerHorns = n;
      let m = 0; for (let i = 0; i < 8; i++) if (A.hornFree({ x: 0, z: 0 })) m++; out.npcHornsAtOnce = m;
      const near = A.at(P.x + 5, P.z), far = A.at(P.x + 150, P.z); out.near = { g: +near.g.toFixed(3), delay: +near.delay.toFixed(3), lp: Math.round(near.lp) }; out.far = { g: +far.g.toFixed(3), delay: +far.delay.toFixed(3), lp: Math.round(far.lp) };
      A.grenadeBounce(P.x + 40, P.z, 1); A.explosion && A.explosion(P.x + 120, P.z, 1);
      // remove the test clips again
      W.pend.set('dlg.woman.scream', { op: 'remove' }); W.pend.set('dlg.any.scream.var1', { op: 'remove' }); await W.save(); out.removed = !SB.has('dlg.woman.scream') && !SB.has('dlg.any.scream');
      W.pend.set('dlg.woman.scream', { op: 'set', data: wav(1.2, 660), name: 'test-scream.wav', vol: 1 }); W.render(); return out; });
    console.log('dialogs', JSON.stringify(r)); await shot('dialogs-window', 1500);
  }
} catch (e) { console.log('ERR', e.message); } finally { await browser.close(); }
console.log('errors:', errors.slice(0, 8).join(' | ') || 'none');
