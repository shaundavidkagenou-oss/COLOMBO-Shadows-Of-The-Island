// Before / after reference captures of the actual game (production build, headless Chromium) for visual upgrades.
//   node tools/visual-ref.mjs [outDir=dev/ref] [tag=before] [quality=high] [sets=day,sunset,night]     PORT env (default 5199)
// Subjects are found from the city plan at run time (deterministic: same poses for every build), so before / after images match:
//   road     — asphalt + kerb + pavement at a Galle Road edge, low camera (close range)
//   brick    — a brick-style Fort building's street facade, oblique
//   plaster  — a colonial (plastered) facade, oblique
//   tiles    — a Calicut-tile hip roof from above;  sheet — a corrugated roof from above
//   sand     — temple-ground sand (Gangaramaya)
//   shadow   — a parked car + the player standing beside it (tyre / feet contact shadows)
// Each set renders only some subjects (one Chromium session per set keeps SwiftShader inside the sandbox's memory).
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
import fs from 'fs';
const [outDir = 'dev/ref', tag = 'before', Q = 'high', SETS = 'day,sunset,night'] = process.argv.slice(2);
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
fs.mkdirSync(outDir, { recursive: true });
const SET = { // hour + the subjects rendered in that light
  day: { hour: 10, subjects: (process.env.DAY || 'road,brick,plaster,tiles,sheet,sand,shadow').split(',') },
  sunset: { hour: 17.7, subjects: (process.env.SUNSET || 'road,brick,shadow').split(',') },
  night: { hour: 21.5, subjects: (process.env.NIGHT || 'road,brick').split(',') },
};
const errors = [];
for (const setName of SETS.split(',')) {
  const set = SET[setName]; if (!set) continue;
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
    args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`], defaultViewport: { width: W, height: H } });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(`[${setName}] ` + String(e.message || e))); page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/favicon|404|GPU stall|ReadPixels|WebGL-|swiftshader/i.test(m.text())) errors.push(`[${setName}] ${m.type()}: ${m.text().slice(0, 200)}`); });
    await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
    await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
    await page.evaluate(() => { const g = window.__game; g.noRender = true; g.hud.root.style.display = 'none'; g.story.state.wanted = 0; });
    for (const subj of set.subjects) {
      const info = await page.evaluate(async (subj, hour) => {
        const g = window.__game, L = window.__L, P = window.__game.world.plan; const B = P.buildings.filter((b) => !b.tower && b.h < 20);
        const road = (x, z) => !!L.roadAt(x, z);
        // the side of a building that faces a road: [outward normal, facade mid point, half length]
        const front = (b) => { const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2; const sides = [[[0, -1], [cx, b.z0], (b.x1 - b.x0) / 2], [[0, 1], [cx, b.z1], (b.x1 - b.x0) / 2], [[-1, 0], [b.x0, cz], (b.z1 - b.z0) / 2], [[1, 0], [b.x1, cz], (b.z1 - b.z0) / 2]];
          return sides.find(([n, p]) => road(p[0] + n[0] * 9, p[1] + n[1] * 9) || road(p[0] + n[0] * 13, p[1] + n[1] * 13)) || null; };
        const pick = (f) => B.filter(f).map((b) => [b, front(b)]).filter((q) => q[1]).sort((a, b) => String(a[0].id).localeCompare(String(b[0].id)))[0];
        let cam, look, at;
        if (subj === 'brick' || subj === 'plaster') {
          const q = pick((b) => b.style === (subj === 'brick' ? 'brick' : 'colonial') && b.h > 7); if (!q) return { skip: 'no ' + subj };
          const [, [n, p, hl]] = q; const t = [-n[1], n[0]]; const a = Math.min(hl * 0.6, 6);
          cam = [p[0] + n[0] * 6.5 + t[0] * a, 1.7, p[1] + n[1] * 6.5 + t[1] * a]; look = [p[0] - t[0] * 1.5, 3.4, p[1] - t[1] * 1.5]; at = [cam[0] + n[0] * 3, cam[2] + n[1] * 3];
        } else if (subj === 'tiles' || subj === 'sheet') {
          const b = B.filter((b) => b.roof === (subj === 'tiles' ? 'tile' : 'corrugated') && b.h < 12).sort((a, c) => String(a.id).localeCompare(String(c.id)))[0]; if (!b) return { skip: 'no ' + subj };
          const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, y = 0.3 + b.h; cam = [cx + 7, y + 6.5, cz + 7]; look = [cx, y + 0.8, cz]; at = [cx, cz];
        } else if (subj === 'road' || subj === 'shadow') {
          let x = -392, z = 700; if (!road(x, z)) for (let k = 1; k < 40 && !road(x, z); k++) x += 1; let xe = x; while (road(xe + 0.5, z) && xe < x + 40) xe += 0.5; // road edge (kerb) east of the centre
          if (subj === 'road') { cam = [xe - 2.6, 1.25, z - 2]; look = [xe + 0.8, 0.1, z + 3.2]; at = [xe - 6, z - 6]; }
          else { const V = window.__Vehicle; const v = new V('sedan', 4, g.scene); v.place(xe - 2.2, z + 2, 0); g.traffic.release(v, false); v.speed = 0;
            cam = [xe - 7.4, 1.55, z - 2.6]; look = [xe - 2.2, 0.55, z + 2.4]; at = [xe - 4.1, z + 4.6]; }
        } else if (subj === 'sand') { const Z = L.ZONES.find((q) => q.id === 'gangaramaya'); const [x0, , z0] = Z.rect; cam = [x0 + 6, 1.5, z0 + 5]; look = [x0 + 10, 0, z0 + 10]; at = [x0 + 3, z0 + 3]; }
        else return { skip: 'unknown ' + subj };
        g.world.warm(cam[0], cam[2]); g.player.teleport(at[0], at[1], 0);
        g.atmos.hour = hour; g.atmos.forceWeather && g.atmos.forceWeather('clear'); g.atmos.setWeather('clear', true); g.atmos.wet = 0; g.atmos.envTimer = 0;
        await g.stepSim(8, 0.05); if (subj === 'shadow') { g.player.teleport(cam[0] + 4.3, cam[2] + 2.7, 2.3); await g.stepSim(4, 0.05); } // the player stands between the camera and the car
        g.player.camOverride = true; g.camera.position.set(...cam); g.camera.lookAt(...look); g.camera.updateMatrixWorld(); g.noRender = false;
        const sh = g.atmos.sun.shadow, sc = sh.camera; const shadow = { rev: g.renderer.state.buffers.depth.getReversed(), map: sh.mapSize.x, w: +(sc.right - sc.left).toFixed(1), h: +(sc.top - sc.bottom).toFixed(1), far: sc.far, bias: +sh.bias.toFixed(6), nb: +sh.normalBias.toFixed(3), r: sh.radius };
        return { cam: cam.map((v) => +v.toFixed(1)), look: look.map((v) => +v.toFixed(1)), night: +g.atmos.night.toFixed(2), shadow };
      }, subj, set.hour);
      if (info.skip) { console.log('skip', subj, info.skip); continue; }
      await new Promise((r) => setTimeout(r, +(process.env.WAIT || 7000)));
      const name = `${tag}-${setName}-${subj}`; await page.screenshot({ path: `${outDir}/${name}.png` });
      await page.evaluate(() => { const g = window.__game; g.noRender = true; g.player.camOverride = false; });
      console.log('shot', name, JSON.stringify(info));
    }
  } catch (e) { console.log('ERR', setName, (e.stack || e.message).split('\n').slice(0, 3).join(' / ')); }
  finally { await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 10000))]); try { browser.process() && browser.process().kill('SIGKILL'); } catch (e) { /* gone */ } }
}
console.log('console errors / warnings:', errors.length ? errors.slice(0, 10).join(' | ') : 'none');
