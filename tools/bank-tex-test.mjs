// 74th: the Ceylon Meridian Bank hall's own textures + LCD screens + per-item own materials (Texture Studio "Bank item").
//   PORT=5199 node tools/bank-tex-test.mjs
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'], defaultViewport: { width: 1280, height: 720 } });
const errors = []; let passes = 0, fails = 0; const ok = (c, m) => { if (c) passes++; else fails++; console.log((c ? 'ok   ' : 'not ok ') + m); };
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text().slice(0, 200)); if (m.type() === 'warning' && /bank|texture|material/i.test(m.text())) console.log('  warn:', m.text().slice(0, 200)); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const r = await page.evaluate(async () => {
    const g = window.__game, W = g.interiors.walkIn, site = W.siteById('bank'); g.story.cancelAll(); g.story.running = null; const room = site.room || W.buildRoom(site); const out = {};
    const hall = room.g || (room.parts && room.parts.recs[0] && room.parts.recs[0].m.parent);
    const meshes = []; hall.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) { let p = o, ch = false; for (; p; p = p.parent) if (p.userData && p.userData.character) ch = true; if (!ch) meshes.push(o); } });
    const names = new Map(); for (const m of meshes) { const mm = Array.isArray(m.material) ? m.material : [m.material]; for (const x of mm) names.set(x.name || '(unnamed ' + x.type + ')', (names.get(x.name || '(unnamed ' + x.type + ')') || 0) + 1); }
    out.meshes = meshes.length; out.mats = [...names.entries()].sort((a, b) => b[1] - a[1]);
    out.notOwn = out.mats.filter(([n]) => !/^CMB/.test(n)).map(([n, c]) => n + '×' + c);
    const own = out.mats.filter(([n]) => /^CMB · /.test(n)); out.ownCount = own.length;
    // textured: every CMB material that draws a surface has a map
    const untextured = new Set(); for (const m of meshes) { const x = m.material; if (x && /^CMB · /.test(x.name) && !x.map && !x.transparent) untextured.add(x.name); } out.untextured = [...untextured];
    const scr = meshes.find((m) => m.material && /Digital screens/.test(m.material.name)); out.screen = scr ? { basic: scr.material.isMeshBasicMaterial, toneMapped: scr.material.toneMapped, map: !!scr.material.map, w: scr.material.map && scr.material.map.image.width, tris: scr.geometry.index.count / 3 } : null;
    // per-item own materials (what the Texture Studio "Own textures for this item" button does)
    const { applyLayout, partAtFace } = await import('/src/world/BankLayout.js'); const P = room.parts; out.parts = P.names.length;
    const rec = P.recs.find((x) => /Plastics/.test(x.m.material.name)); const i0 = rec.m.geometry.index.count; const draws0 = meshes.filter((m) => m.visible).length;
    let face = -1; const cur = rec.R; for (const [nm, , , a] of cur) if (nm === 'Teller workstation 2') { face = Math.floor(a / 3); break; } out.faceHit = partAtFace(P, rec.m, face);
    applyLayout(P, { v: 1, parts: { 'Teller workstation 2': { own: true } } });
    const subs = []; for (const x of P.recs) for (const s of x.subs) subs.push(s.material.name); out.subs = subs; out.idxAfter = [i0, rec.m.geometry.index.count];
    const m2 = []; hall.traverse((o) => { if (o.isMesh && o.visible) m2.push(o); }); out.drawsOwn = [draws0, m2.length];
    applyLayout(P, { v: 1, parts: {} }); out.idxBack = rec.m.geometry.index.count; out.subsBack = P.recs.reduce((n, x) => n + x.subs.length, 0);
    return out; });
  console.log('   ', JSON.stringify(r));
  ok(r.notOwn.filter((n) => !/atm-|ATM|legend|glass|Guard|gun|shotgun|floor|Floor/i.test(n)).length === 0, `every hall surface draws with a bank-own "CMB · …" material (others: ${r.notOwn.join(', ') || 'none'})`);
  ok(r.untextured.length === 0, `every bank material has its own texture (${r.ownCount} materials; untextured: ${r.untextured.join(', ') || 'none'})`);
  ok(r.screen && r.screen.basic && r.screen.toneMapped === false && r.screen.map && r.screen.w === 512, `screens: unlit LCD atlas ${JSON.stringify(r.screen)}`);
  ok(r.faceHit === 'Teller workstation 2' && r.subs.length >= 2 && r.subs.every((n) => /^CMB · Teller workstation 2 · /.test(n)) && r.idxAfter[1] < r.idxAfter[0], `an item gets its own materials: ${r.subs.join(', ')} (${r.idxAfter.join(' → ')} indices left in the shared draw)`);
  ok(r.idxBack === r.idxAfter[0] && r.subsBack === 0, 'and back to the shared bank materials (nothing left over)');
} catch (e) { errors.push('test: ' + (e.stack || e)); }
console.log('errors:', errors.length ? errors.slice(0, 8).join('\n  ') : 'none'); ok(errors.length === 0, 'no page errors');
console.log(`${passes} passed, ${fails} failed`); await browser.close(); process.exit(fails ? 1 : 0);
