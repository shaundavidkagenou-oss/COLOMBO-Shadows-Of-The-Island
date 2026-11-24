// Debug menu (Numpad2) + console smoke test in the real game (headless Chromium + SwiftShader, served build).
//   PORT=5199 node tools/debug-menu-test.mjs        (serve a production build first — see render-probe.mjs)
// Walks the whole menu tree: every submenu opens, every value readout evaluates, and every action runs (spawn lists: the
// first two and the last entry each, to keep SwiftShader time sane), except the ones that leave free play (benchmark,
// editors, reload / quit, story / cinematic jumps). A thrown error, an error-class console line or a page error fails it.
// Then the new console commands: `vehicle info|repair|upright|open|close` on a spawned real-model car and `room`.
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const PORT = process.env.PORT || 5199;
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=800,450'], defaultViewport: { width: 800, height: 450 } });
const errors = []; let failed = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto(`http://localhost:${PORT}/?test&quick=play`, { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 1500000, polling: 2000 });
  console.log('in free play');
  const res = await page.evaluate(async () => {
    const g = window.__game, dc = g.debugCon, out = { menus: 0, vals: 0, acts: 0, skipped: [], fails: [], labels: {} };
    const SKIP = /bench|editor|reload|quit|exit|save|load|new game|trailer|cinematic|mission|story|opening|ending|player model|teleport/i;
    const errLog = () => dc.log.filter(([, c]) => c === 'err').length;
    g.debug.menuEnabled = true; dc.toggleMenu(true);
    const tick = () => new Promise((r) => setTimeout(r, 30));
    const walk = async (menu, path, depth) => {
      out.menus++; out.labels[path] = menu.items.map((i) => i.label);
      const spawnList = /^Spawn /.test(menu.title || '') && menu.items.length > 3;
      for (let k = 0; k < menu.items.length; k++) {
        const it = menu.items[k], p = path + ' > ' + it.label;
        try { if (it.val) { it.val(); out.vals++; } } catch (e) { out.fails.push(p + ' [val] ' + e.message); }
        if (it.sub) { if (depth > 5) continue; let m; try { m = it.sub(); } catch (e) { out.fails.push(p + ' [sub] ' + e.message); continue; }
          dc.stack.push(m); dc.sel = 0; try { dc.renderMenu(); } catch (e) { out.fails.push(p + ' [render] ' + e.message); }
          await walk(m, p, depth + 1); dc.stack.pop(); continue; }
        if (!it.act) continue;
        if (SKIP.test(it.label) || SKIP.test(path)) { out.skipped.push(p); continue; }
        if (spawnList && k >= 2 && k !== menu.items.length - 1) continue;
        if (/^Debug > Vehicle/.test(path)) continue; // driven below, against a known car
        const e0 = errLog();
        try { await it.act(); out.acts++; } catch (e) { out.fails.push(p + ' [act] ' + e.message); }
        if (/Hero rooms/.test(path)) { // enter is async: wait for the room, then walk back out before the next one
          const I = g.interiors; for (let w = 0; w < 400 && !I.current; w++) await tick();
          if (!I.current) out.fails.push(p + ' [room] never entered'); else { out.rooms = (out.rooms || 0) + 1; await I.exit(); for (let w = 0; w < 400 && I.current; w++) await tick(); }
          if (!dc.menuOpen) { dc.toggleMenu(true); dc.stack = [dc.root()]; } }
        if (errLog() > e0) out.fails.push(p + ' [console err] ' + dc.log.filter(([, c]) => c === 'err').slice(-1)[0][0]);
        await tick();
      }
    };
    await walk(dc.root(), 'Debug', 0);
    // console: vehicle commands on a fresh real-model car next to the player (and with the player in it)
    const cmds = []; const run = (line) => { const e0 = errLog(); dc.exec(line); const last = dc.log.slice(-1)[0]; cmds.push(line + ' → ' + (last ? last[0] : '')); if (errLog() > e0) out.fails.push('console `' + line + '`: ' + last[0]); };
    run('spawn car vanta'); await tick();
    const v = dc.vehTarget(); out.target = v && v.type;
    for (const op of ['info', 'repair', 'upright', 'open', 'close']) run('vehicle ' + op);
    const vm = dc.root().items.find((i) => i.label === 'Vehicle').sub(); // the menu's Vehicle submenu on the same car
    // Vehicle > Damage (a submenu): every entry on the same car, except the explosion, which runs last (it throws the doors off)
    let boom = null; for (const it of vm.items) { if (!it.sub) continue; const sm = it.sub(); out.labels['Debug > Vehicle > ' + it.label] = sm.items.map((i) => i.label);
      for (const si of sm.items) { if (/explode/i.test(si.label)) { boom = si; continue; } const e0 = errLog(); try { await si.act(); out.acts++; } catch (e) { out.fails.push('Debug > Vehicle > ' + it.label + ' > ' + si.label + ' [act] ' + e.message); } if (errLog() > e0) out.fails.push('Debug > Vehicle > ' + it.label + ' > ' + si.label + ' [console err] ' + dc.log.filter(([, c]) => c === 'err').slice(-1)[0][0]); await tick(); } }
    out.dmgBefore = g.vdamage ? JSON.stringify(g.vdamage.stats) : 'no vdamage';
    run('vehicle repair'); // back to a clean car for the door checks
    for (const it of vm.items) { if (it.sub) continue; const e0 = errLog(); try { await it.act(); out.acts++; } catch (e) { out.fails.push('Debug > Vehicle > ' + it.label + ' [act] ' + e.message); } if (errLog() > e0) out.fails.push('Debug > Vehicle > ' + it.label + ' [console err]'); }
    const doors = v.mesh.userData.doors || []; await new Promise((r) => setTimeout(r, 6000)); run('vehicle open'); await new Promise((r) => setTimeout(r, 4000)); out.doorOpen = doors.map((d) => +(d.ang ?? 0).toFixed(2));
    // the door spring runs in game time (~1 s); SwiftShader with ~100 spawned vehicles crawls, so poll (up to 90 s of wall time)
    const t0 = Date.now(); while (Date.now() - t0 < 90000 && !doors.every((d) => d.ang > 0.6)) await new Promise((r) => setTimeout(r, 1000));
    out.doorOpen2 = doors.map((d) => +(d.ang ?? 0).toFixed(2)); out.frames = ((Date.now() - t0) / 1000 + 4).toFixed(0) + ' s';
    if (!out.doorOpen2.every((a) => a > 0.6)) out.fails.push('vehicle open: doors at ' + out.doorOpen2.join(',') + ' after 94 s');
    run('room dineth'); for (let w = 0; w < 400 && !g.interiors.current; w++) await tick(); out.roomCmd = !!g.interiors.current; if (g.interiors.current) await g.interiors.exit();
    run('help');
    // the explosion last: the wreck, the fire and the thrown pieces then run in the live game loop for a while (page errors fail)
    if (boom) { const vt = dc.vehTarget(); out.boomType = vt && vt.type; const e0 = errLog(); try { await boom.act(); out.acts++; } catch (e) { out.fails.push('Debug > Vehicle > Damage > ' + boom.label + ' [act] ' + e.message); } if (errLog() > e0) out.fails.push('Debug > Vehicle > Damage > Explode [console err]');
      const t1 = Date.now(); while (Date.now() - t1 < 20000) await new Promise((r) => setTimeout(r, 500)); out.wrecked = !!(vt && vt.wrecked); out.dmgAfter = JSON.stringify(g.vdamage.stats);
      if (!out.wrecked) out.fails.push('Explode now: the target ' + out.boomType + ' is not wrecked'); } else out.fails.push('Debug > Vehicle > Damage: no Explode entry');
    out.cmds = cmds; dc.toggleMenu(false); return out;
  });
  await wait(4000); // let a few frames run with everything spawned / toggled
  console.log(`menus ${res.menus}, value readouts ${res.vals}, actions run ${res.acts}, skipped ${res.skipped.length}`);
  for (const [k, v] of Object.entries(res.labels)) if (k.split(' > ').length <= 3) console.log('  ' + k + ': ' + v.slice(0, 14).join(' | ') + (v.length > 14 ? ` … (+${v.length - 14})` : ''));
  for (const c of res.cmds) console.log('  $ ' + c.slice(0, 200));
  console.log(`  vehicle target ${res.target}; doors after 'vehicle open' ${JSON.stringify(res.doorOpen)} (4 s) ${JSON.stringify(res.doorOpen2)} (after ${res.frames}); hero rooms entered/left ${res.rooms}; 'room dineth' entered ${res.roomCmd}`);
  if (!res.target) { console.log('FAIL spawn car vanta: no vehicle next to the player'); failed++; }
  if (res.rooms !== 3 || !res.roomCmd) { console.log('FAIL hero rooms'); failed++; }
  console.log(`  damage menu: before repair ${res.dmgBefore}; after the explosion (20 s live) ${res.boomType} wrecked ${res.wrecked} ${res.dmgAfter}`);
  if (process.env.V) for (const s of res.skipped) console.log('  skip ' + s);
  for (const f of res.fails) { console.log('FAIL ' + f); failed++; }
  for (const e of errors) { console.log('FAIL ' + e); failed++; }
} finally { await browser.close(); }
console.log(`debug-menu: ${failed} failed`); process.exit(failed ? 1 : 0);
