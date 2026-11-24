// Draw-call census of real rendered frames (headless Chromium): every renderBufferDirect call tallied by render pass (main /
// each shadow-casting light / water reflection / post) and by what drew it (object category, material, geometry group,
// empty groups), so draw-call savings can be targeted without changing what is drawn.
//   node tools/draw-census.mjs [quality=medium] [scenario=galle:-392:700:11]   PORT env (default 5199), W/H env viewport
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
const [Q = 'medium', SC = 'galle:-392:700:11'] = process.argv.slice(2); const [name, x, z, hour] = SC.split(':');
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 1800000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--window-size=${W},${H}`] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: W, height: H });
  page.on('pageerror', (e) => console.log('pageerror', String(e.stack || e).slice(0, 300)));
  await page.evaluateOnNewDocument((Q) => { localStorage.setItem('colombo.settings.v1', JSON.stringify({ quality: Q, showFps: false })); }, Q);
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/?test&quick=play', { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__game && window.__game.mode === 'play', { timeout: 900000, polling: 1000 });
  const r = await page.evaluate(async (x, z, hour) => {
    const g = window.__game, R = g.renderer; g.player.teleport(x, z, 0); g.world.warm(x, z); if (g.atmos) g.atmos.hour = hour; await g.stepSim(60, 0.033);
    for (let i = 0; i < 6; i++) await new Promise((res) => requestAnimationFrame(res)); // compile / settle
    const rtName = new Map(); g.scene.traverse((o) => { if (o.isLight && o.shadow && o.castShadow) rtName.set(o, o.name || o.type); });
    const passOf = () => { const rt = R.getRenderTarget(); if (!rt) return 'screen'; for (const [l, n] of rtName) if (l.shadow.map === rt) return 'shadow:' + n; if (g.world && g.world.waterRefl && rt === g.world.waterRefl.rt) return 'refl'; return rt.isWebGLRenderTarget && rt.texture && rt.texture.type === 1016 ? 'main' : 'rt' + (rt.width + 'x' + rt.height); };
    const cat = (o) => { let p = o, path = []; while (p && path.length < 6) { if (p.name) path.push(p.name); p = p.parent; } if (o.isInstancedMesh) path.unshift('inst'); if (o.isBatchedMesh) path.unshift('batch'); if (o.isSkinnedMesh) path.unshift('skinned'); if (!o.name) { let q = o.parent, tp = []; while (q && tp.length < 9) { tp.push(q.name || (q.userData && q.userData.vType ? 'V:' + q.userData.vType : '') || (q.userData && Object.keys(q.userData).slice(0, 3).join('/')) || q.type); q = q.parent; } const pos = o.geometry && o.geometry.attributes.position; path.unshift('[' + tp.join('<') + ' v' + (pos ? pos.count : 0) + ']'); } return path.slice(0, 3).join('<') || o.type; };
    const T = {}; let on = false; const THREE = window.__THREE; const F = new THREE.Frustum(), PM = new THREE.Matrix4(), BB = new THREE.Box3();
    const boxOut = (cam, obj, geo) => { if (!geo.boundingSphere) geo.computeBoundingSphere(); const rad = geo.boundingSphere.radius * obj.matrixWorld.getMaxScaleOnAxis(); if (rad < (+window.__RMIN || 8)) return false; if (!geo.boundingBox) geo.computeBoundingBox(); PM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); F.setFromProjectionMatrix(PM); BB.copy(geo.boundingBox).applyMatrix4(obj.matrixWorld); return !F.intersectsBox(BB); }; const orig = R.renderBufferDirect;
    R.renderBufferDirect = function (cam, scene, geo, mat, obj, group) { if (on) { const p = passOf(); const t = (T[p] ||= { calls: 0, empty: 0, by: {} }); t.calls++; if (!obj.isInstancedMesh && !obj.isBatchedMesh && !obj.isSkinnedMesh && THREE && boxOut(cam, obj, geo)) { t.boxOut = (t.boxOut || 0) + 1; const bk = 'BOXOUT ' + cat(obj); t.by[bk] = (t.by[bk] || 0) + 1; }
      const idx = geo.index; const cnt = group ? group.count : (idx ? idx.count : geo.attributes.position ? geo.attributes.position.count : 0); const dr = geo.drawRange; const c2 = Math.min(cnt, dr.count); if (c2 === 0) t.empty++;
      const k = cat(obj) + ' | ' + (mat.name || mat.type) + (group ? ' g' + (group.materialIndex ?? '') : '') + (c2 === 0 ? ' EMPTY' : ''); t.by[k] = (t.by[k] || 0) + 1; }
      return orig.apply(this, arguments); };
    // shadow maps that only update on demand: count them as they would render when due
    on = true; await new Promise((res) => requestAnimationFrame(res)); await new Promise((res) => requestAnimationFrame(res)); on = false; R.renderBufferDirect = orig;
    const out = {}; for (const [p, t] of Object.entries(T)) out[p] = { calls: t.calls / 2, empty: t.empty / 2, boxOut: (t.boxOut || 0) / 2, top: Object.entries(t.by).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `${(n / 2).toString().padStart(4)}  ${k}`) };
    return out;
  }, +x, +z, +hour);
  for (const [p, t] of Object.entries(r)) { console.log(`== ${p}: ${t.calls} calls/frame (${t.empty} empty, ${t.boxOut} outside by box test)`); for (const l of t.top) console.log('   ' + l); }
} finally { await browser.close(); }
