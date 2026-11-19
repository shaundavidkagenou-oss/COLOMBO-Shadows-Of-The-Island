// 70th request — "building textures all gone / walls see-through" on the GTX 1660S (dev and .exe) but not headless.
// Root cause: GPUs running WebGL through Direct3D 11 (Chrome / Electron on Windows, ANGLE) have 16 texture units per
// fragment shader. The facade program needed 18 (window layer's uWinMap + uWinRM, a separate metalnessMap that is the same
// texture as roughnessMap, plus 2 sun + up to 7 lamp / headlight spot shadow maps), so it failed to link there and every
// building wall was skipped. SwiftShader (headless) has 32 units, so it never showed here — this test COUNTS instead:
//  1. every compiled program of a real session (day + night at Galle Road, plus Fort) uses <= 16 fragment samplers and linked
//  2. untouched facades: no uWinMap / uWinRM / metalnessMap sampler of their own (they reuse map / roughnessMap)
//  3. Texture Studio-style edits of a drawn facade (map, roughness, metalness swapped in at night) recompile automatically
//     (no needsUpdate) and still stay <= 16; restoring the originals returns to the shared program
//  4. the fallback order on a forced worst case (7 spot shadows + all three textures replaced): the window layer gives up
//     its own samplers, the wall never does
//   node tools/texture-units-test.mjs [quality ...]   (default: high ultra medium low)   PORT env (default 5199)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const QS = process.argv.slice(2).length ? process.argv.slice(2) : ['high', 'ultra', 'medium', 'low'];
const T0 = Date.now(); const log = (m) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0)}s] ${m}`);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok  ' + m); } else { fail++; console.log('FAIL ' + m); } };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 3600000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=960,540'], defaultViewport: { width: 960, height: 540 } });
const errors = [];
// in-page helpers (installed once per page)
const HELPERS = () => {
  const g = window.__game, R = g.renderer, gl = R.getContext();
  const ST = new Set([gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_3D, gl.SAMPLER_2D_ARRAY, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_CUBE_SHADOW, gl.SAMPLER_2D_ARRAY_SHADOW, gl.INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_2D, gl.INT_SAMPLER_3D, gl.UNSIGNED_INT_SAMPLER_3D, gl.INT_SAMPLER_CUBE, gl.UNSIGNED_INT_SAMPLER_CUBE, gl.INT_SAMPLER_2D_ARRAY, gl.UNSIGNED_INT_SAMPLER_2D_ARRAY]);
  const fragSrc = (prog) => { const sh = gl.getAttachedShaders(prog) || []; const f = sh.find((s) => gl.getShaderParameter(s, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER); return f ? gl.getShaderSource(f) || '' : ''; };
  // fragment samplers = active sampler uniforms that the fragment shader body references (vertex-only ones such as
  // batchingTexture are not counted against the fragment limit)
  const units = (prog) => { const body = fragSrc(prog).split('\n').filter((l) => !/^\s*uniform\s/.test(l)).join('\n'); const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS); let k = 0; const names = [];
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(prog, i); if (!ST.has(u.type)) continue; const root = u.name.replace(/\[0\].*$/, '').split(/[.[]/)[0]; if (new RegExp('\\b' + root + '\\b').test(body)) { k += u.size; names.push(root + (u.size > 1 ? '×' + u.size : '')); } }
    return { k, names }; };
  const census = () => { let max = 0, over = 0, unlinked = 0, n = 0; let worst = null; const fac = [];
    for (const pi of R.info.programs) { n++; if (!gl.getProgramParameter(pi.program, gl.LINK_STATUS)) unlinked++; const u = units(pi.program); if (u.k > 16) over++; if (u.k > max) { max = u.k; worst = pi.name + ': ' + u.names.join(' '); }
      if (/interior-v\d+-win-mrt/.test(pi.cacheKey)) fac.push(u.names.join(' ')); }
    return { n, max, over, unlinked, worst, fac, cap: R.capabilities.maxTextures }; };
  const frames = async (k) => { for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(r)); };
  const go = async (x, z, hour) => { g.world.warm(x, z); g.player.teleport(x, z, 0); g.atmos.hour = hour; g.atmos.envTimer = 0; await g.stepSim(4, 0.05); await frames(4); };
  window.__TU = { g, R, gl, units, census, frames, go };
};
try {
  for (const Q of QS) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(Q + ': ' + String(e.message || e))); page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || /texture units|VALIDATE_STATUS|Shader Error/i.test(t)) && !/favicon|404/.test(t)) errors.push(Q + ': ' + t.slice(0, 300)); });
    await page.evaluateOnNewDocument((q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: q, showFps: false })); }, Q);
    await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__game && window.__game.stepSim && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
    log(Q + ': in play mode'); await page.evaluate(HELPERS);
    for (const [name, x, z, h] of [['galle-day', -404, 420, 11], ['galle-night', -404, 420, 22], ['fort-night', -300, -700, 22]]) {
      const c = await page.evaluate(async (x, z, h) => { await window.__TU.go(x, z, h); return window.__TU.census(); }, x, z, h);
      ok(c.over === 0 && c.unlinked === 0, `${Q} ${name}: ${c.n} programs, max ${c.max} fragment samplers (limit 16 on D3D11 GPUs; this renderer ${c.cap}), ${c.unlinked} unlinked — worst: ${c.worst}`);
      if (name === 'galle-night') ok(c.fac.length > 0 && c.fac.every((s) => !/\b(uWinMap|uWinRM|metalnessMap)\b/.test(s)), `${Q} ${name}: untouched facades (${c.fac.length} programs) reuse map / roughnessMap — e.g. ${c.fac[0]}`);
    }
    if (Q === QS[0]) { // Texture Studio-style edits on a facade that is really being drawn, at night (most shadow maps)
      const r = await page.evaluate(async () => {
        const T = window.__TU, { g, R } = T; const { facadeWindowLayer } = await import('/src/gfx/Materials.js'); const IM = await import('/src/gfx/InteriorMapping.js');
        const cand = []; g.scene.traverse((o) => { if (o.isMesh && !Array.isArray(o.material) && facadeWindowLayer(o.material)) cand.push(o); });
        const hit = new Set(); for (const o of cand) { const f = o.onBeforeRender; o.__f = f; o.onBeforeRender = function (...a) { hit.add(o); return f.apply(this, a); }; }
        await T.frames(2); for (const o of cand) { o.onBeforeRender = o.__f; delete o.__f; }
        const B = [...hit].find((o) => /colonial/.test(o.material.name)) || [...hit][0]; if (!B) return { err: 'no drawn facade' };
        const m = B.material, W = facadeWindowLayer(m); const o = { map: m.map, rm: m.roughnessMap, mt: m.metalnessMap };
        const st = () => { const p = R.properties.get(m).currentProgram; const u = T.units(p.program); return { key: (p.cacheKey.match(/interior-v\d+-win-\w+/) || [''])[0], k: u.k, names: u.names.join(' ') }; };
        const out = { name: m.name, s0: st() };
        m.map = o.map.clone(); await g.stepSim(1, 0.05); await T.frames(3); out.s1 = st();           // no needsUpdate: the game's frame update re-links
        m.roughnessMap = o.rm.clone(); await g.stepSim(1, 0.05); await T.frames(3); out.s2 = st();
        m.metalnessMap = o.mt.clone(); await g.stepSim(1, 0.05); await T.frames(3); out.s3 = st(); out.c3 = T.census();
        m.map = o.map; m.roughnessMap = o.rm; m.metalnessMap = o.mt; await g.stepSim(1, 0.05); await T.frames(3); out.s4 = st();
        // forced worst case through the material's own compile hook: 2 sun + 7 spot shadow maps, everything replaced
        const fake = (spots) => { const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>\n', fragmentShader: '#include <common>\n#include <map_fragment>\n#include <metalnessmap_pars_fragment>\n#include <metalnessmap_fragment>\n', map: true, emissiveMap: true, normalMap: true, roughnessMap: true, metalnessMap: true, envMap: true, numDirLightShadows: 2, numSpotLightShadows: spots }; m.onBeforeCompile(sh, R); const own = Object.keys(sh.uniforms).filter((k) => /^uWin(Map|RM)$/.test(k)); const ownMetal = !/texture2D\( roughnessMap, vMetalnessMapUv/.test(sh.fragmentShader); const base = IM.fragUnits(sh, { map: false, rm: false, metal: ownMetal }); return { own, units: base + own.length }; };
        out.f0 = fake(7); m.map = o.map.clone(); out.f1 = fake(7); m.roughnessMap = o.rm.clone(); out.f2 = fake(7); m.metalnessMap = o.mt.clone(); out.f3 = fake(7); out.f3low = fake(2);
        m.map = o.map; m.roughnessMap = o.rm; m.metalnessMap = o.mt; await g.stepSim(1, 0.05); await T.frames(2);
        return out; });
      if (r.err) ok(false, 'studio edit: ' + r.err);
      else {
        log('edit sequence ' + JSON.stringify({ s0: r.s0.key, s1: r.s1.key, s2: r.s2.key, s3: r.s3.key, s4: r.s4.key }));
        ok(r.s0.key.endsWith('-mrt') && !/uWin|metalnessMap/.test(r.s0.names), `${r.name}: untouched → shared program (${r.s0.k} samplers: ${r.s0.names})`);
        ok(r.s1.key.endsWith('-Mrt') && /uWinMap/.test(r.s1.names) && r.s1.k <= 16, `replaced wall texture → own window sampler, recompiled without needsUpdate (${r.s1.k} samplers)`);
        ok(r.s2.k <= 16 && r.s3.k <= 16 && r.c3.over === 0 && r.c3.unlinked === 0, `replaced roughness + metalness too → ${r.s2.k} / ${r.s3.k} samplers, whole session max ${r.c3.max}`);
        ok(r.s4.key.endsWith('-mrt') && r.s4.k === r.s0.k, `originals restored → back to the shared program (${r.s4.k})`);
        ok(r.f0.units === 15 && r.f0.own.length === 0, `worst case untouched: 15 samplers with 7 spot shadows (was 18)`);
        ok(r.f1.units <= 16 && r.f1.own.includes('uWinMap'), `worst case, wall texture replaced: ${r.f1.units}, windows keep their original texture (${r.f1.own.join('+') || 'none'})`);
        ok(r.f2.units <= 16 && r.f3.units <= 16, `worst case, roughness / metalness replaced too: ${r.f2.units} / ${r.f3.units} (window layer gave up ${2 - r.f3.own.length} own sampler(s))`);
        ok(r.f3low.own.length === 2 && r.f3low.units <= 16, `fewer shadow maps: the window layer keeps both own samplers (${r.f3low.units})`);
      }
    }
    await page.close();
  }
} catch (e) { fail++; console.log('FAIL exception ' + e.message); } finally { await browser.close(); }
const bad = errors.filter((e) => /texture units|Shader Error|VALIDATE_STATUS|link/i.test(e));
ok(bad.length === 0, 'no shader link / texture unit errors in the console' + (bad.length ? ': ' + bad.slice(0, 3).join(' | ') : ''));
if (errors.length) console.log('other console errors: ' + errors.slice(0, 5).join(' | '));
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(0)}s)`); process.exit(fail ? 1 : 0);
