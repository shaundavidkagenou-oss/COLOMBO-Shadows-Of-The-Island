// Walk-in shop doors (WalkIn.js), headless Chromium on the production build: for every walk-in site the player walks up
// to the door with W held — no button — and must: open the door by hand (leaf angle, palm IK on the push plate), be handed
// to the room model, get the room's lights from the shared pool, walk back out and see the door close behind him.
//   node tools/walkin-test.mjs        (PORT env; ONLY=id,id to test a subset)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const errors = []; let fails = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'], defaultViewport: { width: 640, height: 360 } });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/favicon|404|GPU stall|ReadPixels|WebGL-|swiftshader|willReadFrequently|KHR_parallel/i.test(t)) errors.push(t.slice(0, 300)); });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: 'low', showFps: false })); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const ids = await page.evaluate(() => { const g = window.__game; g.noRender = true; g.story.cancelAll(); g.story.running = null; /* no mission actors standing in shop doorways */ return g.interiors.walkIn.sites.map((s) => s.id); });
  console.log('walk-in sites:', ids.join(', '));
  ok(ids.length >= 12, `${ids.length} walk-in sites (story shops but the club + 6 new shops)`);
  ok(!ids.includes('club'), 'the club keeps its old door (not a walk-in site)');
  const clubDoor = await page.evaluate(() => window.__game.interiors.doors.some((d) => d.id === 'club'));
  ok(clubDoor, 'club still has its prompt door (old door system)');
  const only = (process.env.ONLY || '').split(',').filter(Boolean);
  for (const id of ids) {
    if (only.length && !only.includes(id)) continue;
    const r = await page.evaluate(async (id) => {
      const g = window.__game, W = g.interiors.walkIn, s = W.siteById(id), P = g.player; const out = { id };
      const builtBefore = !!s.room;
      const [sx, sz] = W.world(s, 0, 3.2); g.world.warm(sx, sz); P.teleport(sx, sz, s.door.faceIn); await g.stepSim(2, 0.05);
      out.preBuilt = builtBefore; out.builtFar = !!s.room; // must not exist before the player comes near
      let maxAng = 0, maxReach = 0, enteredAt = -1, slow = 1, hand = null;
      for (let i = 0; i < 90; i++) { await g.stepSim(1, 0.05, ['KeyW']); maxAng = Math.max(maxAng, Math.abs(s.doorObj.ang)); const A = P.ch.anim; if (A.reach && A.reach.door) { if (A.reach.w > maxReach) { maxReach = A.reach.w; hand = A.reach.S; } }
        slow = Math.min(slow, P.doorSlow ?? 1); if (enteredAt < 0 && P.indoor && P.indoor.walkIn && P.indoor.site === s) enteredAt = i; if (enteredAt >= 0 && i > enteredAt + 25) break; }
      const [lx, lz] = W.local(s, P.x, P.z); out.lz = +lz.toFixed(2); out.lx = +lx.toFixed(2);
      out.maxAng = +maxAng.toFixed(2); out.maxReach = +maxReach.toFixed(2); out.hand = hand; out.enteredAt = enteredAt; out.slow = slow;
      out.inside = !!(P.indoor && P.indoor.site === s); out.roomVisible = !!(s.room && s.room.og.visible); out.poolOn = W.poolOn && W.active === s.room;
      out.lights = s.room ? s.room.lights.length : 0; out.k = +W.k.toFixed(2); out.prompt = s.room ? s.room.prompt : null;
      out.bounds = s.room ? s.room.bounds : null; out.H = s.room ? s.room.H : 0; out.reachCleared = !(P.ch.anim.reach && P.ch.anim.reach.door);
      // walk the room: 3 s in a few directions, must stay inside the room model (collision), never NaN
      let nanOrOut = false; for (const yawOff of [0.9, -1.8, 3.1]) { P.yaw += yawOff; P.camYaw = P.yaw + Math.PI; await g.stepSim(20, 0.05, ['KeyW']); const [qx, qz] = W.local(s, P.x, P.z); if (!Number.isFinite(qx) || !(P.indoor && P.indoor.site === s)) nanOrOut = true; if (s.room && (qx < s.room.bounds.x0 - 0.05 || qx > s.room.bounds.x1 + 0.05 || qz < s.room.bounds.z0 - 0.05)) nanOrOut = true; }
      out.stayedIn = !nanOrOut;
      // out again: face the door and walk until released, then wait for the closer
      { const [ix, iz] = W.world(s, 0, -1.6); P.x = ix; P.z = iz; P.yaw = s.yaw; P.camYaw = s.yaw + Math.PI; P.sync && P.sync(); }
      let left = -1; for (let i = 0; i < 80; i++) { await g.stepSim(1, 0.05, ['KeyW']); if (left < 0 && !P.indoor) left = i; if (left >= 0 && i > left + 12) break; }
      out.leftAt = left; await g.stepSim(60, 0.05); out.closedAng = +Math.abs(s.doorObj.ang).toFixed(3); out.roomHiddenAfter = !(s.room && s.room.og.visible);
      { const [fx, fz] = W.world(s, 0, 40); P.teleport(fx, fz, 0); await g.stepSim(4, 0.05); } out.poolOffFar = !W.poolOn;
      return out; }, id);
    console.log(' ', JSON.stringify(r));
    ok(!r.preBuilt, `${id}: interior not built before the player came near`);
    ok(r.maxAng > 1.0, `${id}: door pushed open by walking into it (max ${r.maxAng} rad), no button`);
    ok(r.maxReach > 0.5, `${id}: palm on the door (reach ${r.maxReach}, hand ${r.hand})`);
    ok(r.slow < 1, `${id}: walking pace while pushing (doorSlow ${r.slow})`);
    ok(r.enteredAt >= 0 && r.inside, `${id}: handed to the room model (entered at step ${r.enteredAt}, lz ${r.lz})`);
    ok(r.roomVisible && r.poolOn && r.lights > 0, `${id}: room drawn + lit from the pool (${r.lights} lights, k ${r.k})`);
    ok(r.stayedIn, `${id}: walking around stays inside the room bounds`);
    ok(r.reachCleared, `${id}: hand IK released after the door`);
    ok(r.leftAt >= 0, `${id}: walked back out (released at step ${r.leftAt})`);
    ok(r.closedAng < 0.02, `${id}: door closed behind him (${r.closedAng} rad)`);
    ok(r.roomHiddenAfter && r.poolOffFar, `${id}: interior hidden again + light pool off once away`);
  }
} catch (e) { console.log('ERR', (e.stack || e.message).split('\n').slice(0, 5).join(' / ')); fails++; }
finally { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]); try { browser.process() && browser.process().kill('SIGKILL'); } catch (e) { /* gone */ } }
console.log('console errors / warnings:', errors.length ? errors.slice(0, 12).join(' | ') : 'none');
console.log(fails ? `FAILED ${fails}` : 'ALL OK');
process.exit(fails ? 1 : 0);
