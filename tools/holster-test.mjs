// 82nd: player holster + sling (src/combat/CarryGear.js, hooked into Weapons.js) in the real game (headless). Scenarios: pistol seated in
// a fitted holster on every hero, long guns slung per category (compact / standard / large → different hangs), state (draw → empty
// holster, put away → back, quick switching, nothing duplicated, dropped / sold weapon leaves the body), animation (idle, walk, run,
// sprint, crouch, jump + land, turning: body vertices inside the holster / rifle volumes), squad switch (gear re-fitted per body),
// vehicles (car: rifle laid aside while seated; bike: kept), drive-by, and per-frame cost of the late() hook.
//   PORT=5199 node tools/holster-test.mjs           (SCEN=fit,state,anim,squad,vehicle,perf to run a subset)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
const errors = []; let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else fail++; console.log('  ', c ? 'ok ' : 'NO ', m); };
const SCEN = (process.env.SCEN || 'fit,state,anim,squad,vehicle,perf').split(',');
const HELP = () => {
  const g = window.__game, THREE = window.__THREE; const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
  // local box of an object's meshes (in obj's own frame), optionally only meshes passing `keep`
  const boxOf = (obj, keep) => { obj.updateWorldMatrix(true, true); const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(); const b = new THREE.Box3();
    obj.traverse((o) => { if (!o.isMesh || !o.geometry || (keep && !keep(o))) return; o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld))); }); return b; };
  window.__hg = {
    boxOf,
    setup(own, sel) { const W = g.weapons, P = g.player; W.forceHolster(); for (const it of W.inv) it.owned = false; for (const i of own) W.inv[i].owned = true; W.sel = sel; W.showHolstered(); P.ch.root.updateMatrixWorld(true); },
    // body vertices (bind position within r of the hips) that end up inside `obj`'s box (shrunk by s), current pose
    bodyIn(obj, s = 0.004, keep) { const ch = g.player.ch, mesh = ch.mesh; ch.root.updateMatrixWorld(true); mesh.skeleton.update(); const b = boxOf(obj, keep); if (b.isEmpty()) return { n: -1 }; b.expandByScalar(-s);
      const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert(); _m.multiplyMatrices(inv, mesh.matrixWorld); const pos = mesh.geometry.attributes.position; let n = 0, tot = 0;
      for (let i = 0; i < pos.count; i += 2) { mesh.getVertexPosition(i, _v); _v.applyMatrix4(_m); tot++; if (b.containsPoint(_v)) n++; } return { n, tot }; },
    // body vertices inside a carried gun's own silhouette (CarryGear's 5 mm z-slab profile: y and x extent per slab, shrunk by s)
    bodyInGun(md, s = 0.004) { const pr = md.userData.carryProf; if (!pr) return { n: -1 }; const ch = g.player.ch, mesh = ch.mesh; ch.root.updateMatrixWorld(true); md.updateWorldMatrix(true, false);
      _m.multiplyMatrices(new THREE.Matrix4().copy(md.matrixWorld).invert(), mesh.matrixWorld); const pos = mesh.geometry.attributes.position; let n = 0;
      for (let i = 0; i < pos.count; i += 2) { mesh.getVertexPosition(i, _v); _v.applyMatrix4(_m); const k = Math.floor((_v.z - pr.z0) / pr.bin); if (k < 0 || k >= pr.n) continue;
        if (_v.y > pr.y0[k] + s && _v.y < pr.y1[k] - s && _v.x > pr.x0[k] + s && _v.x < pr.x1[k] - s) n++; } return { n }; },
    visibleWeapons() { const W = g.weapons, root = g.player.ch.root; return W.built.filter((i) => { let o = W.models[i], v = true; while (o && o !== root) { /* up to the body: the camera hides the whole character when it gets too close in tight spots */ if (!o.visible) v = false; o = o.parent; } return v && W.models[i].parent; }); },
    where(i) { const W = g.weapons, m = W.models[i]; return m.parent === W.holsterP ? 'holster' : m.parent === W.holsterR ? 'sling' : m.parent === W.inHand ? 'hand' : (m.parent ? m.parent.name || m.parent.type : 'none'); },
  };
};
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.stack || e.message || e).slice(0, 600))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 400)); if (/sling build/.test(m.text())) errors.push(m.text().slice(0, 400)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  await page.evaluate(() => { const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; g.hud.show(false); g.player.teleport(-140, -891.8, 0); g.squad.unlock(false); });
  await page.evaluate(HELP);
  const E = (fn, ...a) => page.evaluate(fn, ...a);

  if (SCEN.includes('fit')) { console.log('fit (every hero × pistols, long guns per category)');
    const r = await E(async () => { const g = window.__game, W = g.weapons, S = g.squad, G = W.gear, H = window.__hg, THREE = window.__THREE; const out = [];
      for (let h = 0; h < 3; h++) { S.switchInstant(h, true); await g.stepSim(4, 1 / 30);
        for (const pi of [0, 1, 2, 13]) { H.setup([pi], pi); await g.stepSim(3, 1 / 30); const f = G.cur.P; const shell = f && f.h && f.h.group;
          const md = W.models[pi], ud = md.userData; const tip = new THREE.Vector3(0, 0.05, ud.muzzle ? ud.muzzle.z : 0.15); md.localToWorld(tip); let tipIn = false, gripOut = false;
          if (shell) { const b = H.boxOf(shell).expandByScalar(0.004); shell.worldToLocal(tip); tipIn = b.containsPoint(tip); const gp = new THREE.Vector3(0, -0.06, -0.03); md.localToWorld(gp); shell.worldToLocal(gp); gripOut = !b.containsPoint(gp); }
          const body = shell ? H.bodyIn(shell, 0.004) : { n: -1 };
          out.push({ h, pi, fit: !!(f && f.F), tilt: f && f.F ? +f.F.tilt.toFixed(2) : null, where: H.where(pi), tipIn, gripOut, bodyIn: body.n, gear: G.gP.visible && G.gP.parent === g.player.ch.bones.hips, verts: (() => { let n = 0; shell && shell.traverse((o) => { if (o.isMesh) n += o.geometry.attributes.position.count; }); return n; })(), uv: (() => { let u = true; shell && shell.traverse((o) => { if (o.isMesh && !o.geometry.attributes.uv) u = false; }); return u; })() }); }
        for (const li of [3, 15, 4, 5, 6, 7, 26]) { H.setup([li], li); await g.stepSim(3, 1 / 30); const f = G.cur.L; const md = W.models[li];
          const body = H.bodyInGun(md, 0.004); const R = W.holsterR; R.updateWorldMatrix(true, false); const m = R.matrix.elements;
          out.push({ h, li, cat: f && f.F && f.F.cat, fit: !!(f && f.F), strap: !!(f && f.strap && f.strap.visible && f.strap.parent === g.player.ch.mesh), where: H.where(li), bodyIn: body.n, dir: [m[8], m[9], m[10]].map((x) => +x.toFixed(2)), pos: [m[12], m[13], m[14]].map((x) => +x.toFixed(3)) }); } }
      return out; });
    for (const x of r) { if (x.pi !== undefined) ok(x.fit && x.where === 'holster' && x.gear && x.tipIn && x.gripOut && x.bodyIn <= 6 && x.uv && x.verts > 2000, `hero ${x.h} pistol ${x.pi}: fitted (tilt ${x.tilt}), muzzle inside shell ${x.tipIn}, grip proud ${x.gripOut}, body verts inside shell ${x.bodyIn}, ${x.verts} verts, uv ${x.uv}`);
      else ok(x.fit && x.strap && x.where === 'sling' && x.bodyIn <= 6, `hero ${x.h} long ${x.li} (${x.cat}): slung, strap on body ${x.strap}, body verts inside gun silhouette ${x.bodyIn}, bore ${x.dir} @ ${x.pos}`); }
    const perHero = (h) => new Set(r.filter((x) => x.h === h && x.li !== undefined).map((x) => x.dir.join(','))).size; ok(perHero(0) >= 3, `long guns not all in one position (hero 0: ${perHero(0)} distinct bore directions)`);
    const posD = (li) => r.filter((x) => x.li === li).map((x) => x.pos.join(',')); ok(new Set(posD(3)).size === 3, `same rifle sits differently on each body: ${posD(3).join(' | ')}`);
  }
  if (SCEN.includes('state')) { console.log('state');
    const r = await E(async () => { const g = window.__game, W = g.weapons, S = g.squad, G = W.gear, H = window.__hg; S.switchInstant(0, true); await g.stepSim(4, 1 / 30); const o = {};
      H.setup([1, 3, 26], 1); await g.stepSim(3, 1 / 30); o.idle = { vis: H.visibleWeapons(), p: H.where(1), l: H.where(3), carry: [G.carryP, G.carryL] };
      W.select(1); await g.stepSim(40, 1 / 30); o.drawn = { state: W.state, cur: W.cur, p: H.where(1), vis: H.visibleWeapons(), holsterShown: G.gP.visible, strapOpen: G.strapOpen, seated: G.seated, l: H.where(3) };
      W.holster(); await g.stepSim(40, 1 / 30); o.back = { state: W.state, p: H.where(1), vis: H.visibleWeapons(), seated: G.seated };
      W.select(3); await g.stepSim(45, 1 / 30); o.long = { cur: W.cur, l: H.where(3), slung: G.slung, p: H.where(1), vis: H.visibleWeapons(), strap: !!(G.cur.L && G.cur.L.strap && G.cur.L.strap.visible) };
      // quick switching: change mind every couple of frames
      const seq = [1, 26, 3, 1, 26, 1, 3]; for (const i of seq) { W.select(i); await g.stepSim(2, 1 / 30); } await g.stepSim(60, 1 / 30);
      const vis = H.visibleWeapons(); o.quick = { cur: W.cur, state: W.state, vis, inHand: vis.filter((i) => H.where(i) === 'hand'), holstered: vis.filter((i) => H.where(i) === 'holster'), slung: vis.filter((i) => H.where(i) === 'sling') };
      W.forceHolster(); W.sel = 3; W.showHolstered(); await g.stepSim(3, 1 / 30); W.inv[3].owned = false; await g.stepSim(3, 1 / 30); o.drop = { vis: H.visibleWeapons(), carryL: G.carryL, l: H.where(3), strap: !!(G.cur.L && G.cur.L.strap && G.cur.L.strap.visible), v3: W.models[3].visible };
      W.inv[1].owned = false; await g.stepSim(3, 1 / 30); o.dropP = { vis: H.visibleWeapons(), carryP: G.carryP, gear: G.gP.visible, v1: W.models[1].visible };
      H.setup([], -1); await g.stepSim(3, 1 / 30); o.none = { vis: H.visibleWeapons(), gear: G.gP.visible, strap: !!(G.cur.L && G.cur.L.strap && G.cur.L.strap.visible) };
      return o; });
    ok(r.idle.p === 'holster' && r.idle.l === 'sling' && r.idle.vis.length === 2, `stowed: pistol in holster, rifle ${r.idle.carry[1]} on sling, ${r.idle.vis.length} on body (26 not shown: one long gun at a time)`);
    ok(r.drawn.cur === 1 && r.drawn.p === 'hand' && r.drawn.holsterShown && r.drawn.strapOpen && !r.drawn.seated && r.drawn.l === 'sling', `drawn: pistol in hand, empty holster stays (retention strap open), rifle still slung — visible ${r.drawn.vis}`);
    ok(r.back.state === 'none' && r.back.p === 'holster' && r.back.seated, `put away: pistol back in the holster (${r.back.vis})`);
    ok(r.long.cur === 3 && r.long.l === 'hand' && !r.long.slung && !r.long.strap && r.long.p === 'holster', `rifle drawn: off the sling, sling hidden, pistol stays holstered (${r.long.vis})`);
    ok(r.quick.inHand.length <= 1 && r.quick.holstered.length <= 1 && r.quick.slung.length <= 1 && new Set(r.quick.vis).size === r.quick.vis.length && (r.quick.cur < 0 || r.quick.inHand[0] === r.quick.cur), `quick switching settles: cur ${r.quick.cur} (${r.quick.state}), hand ${r.quick.inHand}, holster ${r.quick.holstered}, sling ${r.quick.slung}`);
    ok(!r.drop.v3 && r.drop.carryL !== 3 && !r.drop.vis.includes(3), `rifle removed from inventory: off the body (carry ${r.drop.carryL}, visible ${r.drop.vis})`);
    ok(!r.dropP.v1 && r.dropP.carryP === -1 && !r.dropP.gear, `pistol removed: holster and gun gone (visible ${r.dropP.vis})`);
    ok(r.none.vis.length === 0 && !r.none.gear && !r.none.strap, 'nothing owned: no weapon, holster or sling on the body');
  }
  if (SCEN.includes('anim')) { console.log('animation (body inside gear volumes, worst frame)');
    const r = await E(async () => { const g = window.__game, W = g.weapons, P = g.player, G = W.gear, H = window.__hg, I = window.__Input; g.squad.switchInstant(0, true); await g.stepSim(4, 1 / 30); const out = {};
      const runs = { idle: [[]], move: [['forward']], run: [['forward']], sprint: [['forward', 'sprint']], crouch: [['crouch'], ['crouch', 'forward']], jump: [['forward', 'jump'], ['forward']], turn: [['left'], ['right'], ['forward', 'left']] };
      for (const [li, pi] of [[3, 1], [26, 13]]) { H.setup([pi, li], pi); await g.stepSim(3, 1 / 30);
        for (const [name, phases] of Object.entries(runs)) { P.teleport(-140, -891.8, 0); await g.stepSim(4, 1 / 30); let wP = 0, wL = 0, swing = 0, n = 0;
          for (const ks of phases) for (let s = 0; s < 6; s++) { const codes = ks.map((k) => I.code(k)); await g.stepSim(4, 1 / 30, codes); n++;
            const sh = G.cur.P && G.cur.P.h.group; if (sh) wP = Math.max(wP, H.bodyIn(sh, 0.004).n); wL = Math.max(wL, H.bodyInGun(W.models[li], 0.004).n); swing = Math.max(swing, G.swing); }
          out[`${name}/${li}`] = { wP, wL, swing: +swing.toFixed(2), n, vis: H.visibleWeapons().join(','), crouch: P.crouching }; } }
      return out; });
    for (const [k, x] of Object.entries(r)) ok(x.wP <= 10 && x.wL <= 8, `${k}: worst body verts inside holster ${x.wP}, inside rifle ${x.wL}, holster thigh swing ≤ ${x.swing} rad, on body [${x.vis}]`);
  }
  if (SCEN.includes('squad')) { console.log('squad switch');
    const r = await E(async () => { const g = window.__game, W = g.weapons, S = g.squad, G = W.gear, H = window.__hg; const o = [];
      for (const h of [1, 2, 0, 2]) { S.switchInstant(h, true); await g.stepSim(6, 1 / 30); H.setup([2, 4], 2); await g.stepSim(3, 1 / 30); const ch = g.player.ch;
        const others = S.members.filter((m) => m.ch && m.ch !== ch).map((m) => { let n = 0; m.ch.root.traverse((x) => { if (x === G.gP || x === W.holsterR || x === W.holsterP) n++; }); return n; });
        o.push({ h, gearOn: G.gP.parent === ch.bones.hips, slingOn: W.holsterR.parent === ch.bones.chest, strapOn: !!(G.cur.L && G.cur.L.strap && G.cur.L.strap.parent === ch.mesh), others, vis: H.visibleWeapons().join(',') }); }
      return { o, fits: G.fits.size, holsters: G.holsters.size }; });
    for (const x of r.o) ok(x.gearOn && x.slingOn && x.strapOn && x.others.every((n) => n === 0), `hero ${x.h}: holster + sling on the active body, none left on the others ${JSON.stringify(x.others)}, on body [${x.vis}]`);
    ok(r.fits <= 15 && r.holsters <= 6, `fit cache bounded (${r.fits} fits, ${r.holsters} holster builds)`);
  }
  if (SCEN.includes('vehicle')) { console.log('vehicles + drive-by');
    const r = await E(async () => { const g = window.__game, W = g.weapons, P = g.player, G = W.gear, H = window.__hg; g.squad.switchInstant(0, true); await g.stepSim(4, 1 / 30); const o = {};
      const ride = async (type, tag) => { P.teleport(-140, -891.8, 0); await g.stepSim(3, 1 / 30); H.setup([1, 3], 1); const v = new window.__Vehicle(type, 3, g.scene); v.place(P.x + (tag === 'bike' ? -2.5 : 2.5), P.z, P.yaw); v.mesh.updateMatrixWorld(true);
        P.enterVehicle(v, { takeOver: () => false, release() {} }); const seen = []; for (let i = 0; i < 80 && !P.vehicle; i++) { await g.stepSim(2, 1 / 30); seen.push(G.hideLong ? 'h' : W.models[3].visible ? 'v' : '-'); }
        await g.stepSim(10, 1 / 30); const sat = { inVeh: !!P.vehicle, l: H.where(3), lVis: H.visibleWeapons().includes(3), strap: !!(G.cur.L && G.cur.L.strap && G.cur.L.strap.visible), p: H.where(1), pVis: H.visibleWeapons().includes(1), hideLong: G.hideLong };
        if (tag === 'car') { const I = window.__Input; I.mouseButtons.add(2); await g.stepSim(40, 1 / 30); sat.db = { cur: W.cur, vis: H.visibleWeapons().join(',') }; I.mouseButtons.delete(2); await g.stepSim(40, 1 / 30); sat.dbOff = { cur: W.cur, vis: H.visibleWeapons().join(','), p: H.where(1) }; }
        P.exitVehicle({ takeOver: () => false, release() {} }); for (let i = 0; i < 80 && (P.vehicle || P.exiting); i++) await g.stepSim(2, 1 / 30); await g.stepSim(6, 1 / 30);
        const out = { inVeh: !!P.vehicle, l: H.where(3), lVis: H.visibleWeapons().includes(3), strap: !!(G.cur.L && G.cur.L.strap && G.cur.L.strap.visible), p: H.where(1), vis: H.visibleWeapons().join(',') }; v.dispose ? v.dispose() : g.scene.remove(v.mesh); return { sat, out, seen: seen.join('') }; };
      o.car = await ride('sedan', 'car'); o.bike = await ride('policebike', 'bike'); return o; });
    ok(r.car.sat.inVeh && !r.car.sat.lVis && !r.car.sat.strap && r.car.sat.pVis, `car seated: rifle + sling laid aside, pistol stays holstered (enter: ${r.car.seen})`);
    ok(!r.car.out.inVeh && r.car.out.l === 'sling' && r.car.out.lVis && r.car.out.strap && r.car.out.p === 'holster', `car exit: rifle back on the sling, pistol holstered [${r.car.out.vis}]`);
    ok(r.car.sat.db.cur === 1 && !r.car.sat.db.vis.split(',').includes('3') && r.car.sat.dbOff.p === 'holster', `drive-by: pistol out of the holster into the hand (cur ${r.car.sat.db.cur}, [${r.car.sat.db.vis}]), back in the holster after [${r.car.sat.dbOff.vis}]`);
    ok(r.bike.sat.inVeh && r.bike.sat.lVis && r.bike.sat.strap, `bike: rifle stays slung while riding`);
    ok(!r.bike.out.inVeh && r.bike.out.lVis && r.bike.out.p === 'holster', `bike exit: gear intact [${r.bike.out.vis}]`);
  }
  if (SCEN.includes('perf')) { console.log('perf');
    const r = await E(async () => { const g = window.__game, W = g.weapons, G = W.gear, H = window.__hg; H.setup([1, 3], 1); await g.stepSim(5, 1 / 30); const t0 = performance.now(); for (let i = 0; i < 2000; i++) G.late(1 / 60); const ms = (performance.now() - t0) / 2000;
      let geo = 0; const seen = new Set(); g.player.ch.root.traverse((o) => { if (o.isMesh && o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); } }); geo = seen.size; return { ms, geo, stats: G.stats }; });
    ok(r.ms < 0.15, `late() ${(r.ms * 1000).toFixed(1)} µs / frame (SwiftShader box)`); console.log(`   builds ${r.stats.builds}, total build+fit ${r.stats.fitMs.toFixed(0)} ms (one-off, cached), geometries on the hero ${r.geo}`);
  }
  ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
} catch (e) { console.log('FATAL', e.stack || e); fail++; }
console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
