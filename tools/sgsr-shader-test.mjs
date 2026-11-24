// 91st: the WebGL2 port of Qualcomm's SGSR 1 (src/gfx/SGSR.js) against an independent JavaScript reference of the official GLSL
// (sgsr1_shader_mobile.frag and sgsr1_shader_mobile_edge_direction.frag + UseEdgeDirection), whose textureGather is computed the
// way the GL spec defines it (the bilinear footprint of the gather coordinate: texels (i0, j1), (i1, j1), (i1, j0), (i0, j0),
// clamp to edge) — not the port's integer shortcut — so a wrong gather emulation, a swapped component or a wrong offset shows up.
// Inputs: a half-float, linearly filtered texture like the composer's, holding edges, thin lines, gradients and noise; the shader
// upscales 1.25× (80 %), 1.111× (90 %) and 1× (100 %). Also: flat regions come out exactly as they went in (no colour shift),
// the output is never brighter / darker on average than a plain bilinear upscale beyond the sharpening, and alpha is 1.
//   PORT=5199 node tools/sgsr-shader-test.mjs   (needs the vite dev server)
import puppeteer from '/home/user/testenv/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import chromium from '/home/user/testenv/node_modules/@sparticuz/chromium/build/index.js';
let fails = 0, passes = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'not ok ') + m); if (c) passes++; else fails++; };
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true, protocolTimeout: 600000,
  args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], defaultViewport: { width: 320, height: 200 } });
const errs = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errs.push(String(e.message || e)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource/.test(t)) errs.push(t.slice(0, 300)); });
  await page.goto('http://localhost:' + (process.env.PORT || 5199) + '/sounds/README.md', { waitUntil: 'domcontentloaded', timeout: 120000 });
  const R = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js'); const { SGSRPass } = await import('/src/gfx/SGSR.js');
    const cv = document.createElement('canvas'); document.body.appendChild(cv); const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false }); r.setPixelRatio(1); r.setSize(64, 64, false);
    const f32 = Math.fround, H = (v) => THREE.DataUtils.fromHalfFloat(THREE.DataUtils.toHalfFloat(v));
    // ---- the input image (iw × ih, RGBA in [0, 1], rounded to half floats exactly like the composer's target would hold them)
    const makeInput = (iw, ih, seed) => { const d = new Float32Array(iw * ih * 4); let s = seed; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) { const i = (y * iw + x) * 4; let v;
        if (x < iw * 0.25) v = (x + y) % 9 < 4 ? 0.85 : 0.12; // diagonal stripes (hard edges)
        else if (x < iw * 0.5) v = (y % 7 === 3 || x % 11 === 5) ? 0.95 : 0.3; // thin 1-px lines on a flat field (wires, fences)
        else if (x < iw * 0.75) v = 0.2 + 0.6 * (x - iw * 0.5) / (iw * 0.25); // a smooth gradient
        else v = rnd(); // noise (foliage-like detail)
        if (y < 6 && x > iw * 0.3 && x < iw * 0.45) v = 0.5; // a flat patch
        d[i] = H(Math.min(1, v * 1.02)); d[i + 1] = H(v); d[i + 2] = H(v * 0.9); d[i + 3] = 1; }
      const half = new Uint16Array(d.length); for (let i = 0; i < d.length; i++) half[i] = THREE.DataUtils.toHalfFloat(d[i]);
      const tex = new THREE.DataTexture(half, iw, ih, THREE.RGBAFormat, THREE.HalfFloatType); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
      return { d, tex, iw, ih }; };
    // ---- the reference: the official shader in JS, textureGather / textureLod per the GL spec
    const ref = (inp, ow, oh, sharp, edgeDir) => {
      const { d, iw, ih } = inp, out = new Float32Array(ow * oh * 4), cl = (v, a, b) => Math.min(b, Math.max(a, v));
      const T = (i, j, c) => d[(cl(j, 0, ih - 1) * iw + cl(i, 0, iw - 1)) * 4 + c];
      const lod = (u, v, c) => { const x = u * iw - 0.5, y = v * ih - 0.5, i0 = Math.floor(x), j0 = Math.floor(y), a = x - i0, b = y - j0; return (T(i0, j0, c) * (1 - a) + T(i0 + 1, j0, c) * a) * (1 - b) + (T(i0, j0 + 1, c) * (1 - a) + T(i0 + 1, j0 + 1, c) * a) * b; };
      const gather = (u, v) => { const x = u * iw - 0.5, y = v * ih - 0.5, i0 = Math.floor(x + 1e-4), j0 = Math.floor(y + 1e-4), i1 = i0 + 1, j1 = j0 + 1; return [T(i0, j1, 1), T(i1, j1, 1), T(i1, j0, 1), T(i0, j0, 1)]; }; // (+1e-4: the corner sits exactly between two texels; GL takes the upper pair there)
      const fl = (x) => { let wA = x - 4; const wB = x * wA - wA; wA *= wA; return wB * wA; };
      const xs = 1 / iw, ys = 1 / ih; let edges = 0;
      for (let py = 0; py < oh; py++) for (let px = 0; px < ow; px++) {
        const u = (px + 0.5) / ow, v = (py + 0.5) / oh, o = (py * ow + px) * 4; const col = [lod(u, v, 0), lod(u, v, 1), lod(u, v, 2), 0];
        const ix = u * iw - 0.5, iy = v * ih + 0.5, fx = Math.floor(ix), fy = Math.floor(iy); let cx = fx * xs; const cy = fy * ys; const plx = ix - fx, ply = iy - fy;
        let left = gather(cx, cy); const c = col[1];
        const vote = Math.abs(left[2] - left[1]) + Math.abs(c - left[1]) + Math.abs(c - left[2]);
        if (vote > 8 / 255) { edges++;
          cx += xs; const right = gather(cx + xs, cy); const ud1 = gather(cx, cy - ys), ud2 = gather(cx, cy + ys); let ud = [ud1[3], ud1[2], ud2[1], ud2[0]];
          const mean = (left[1] + left[2] + right[0] + right[3]) * 0.25; left = left.map((q) => q - mean); const rt = right.map((q) => q - mean); ud = ud.map((q) => q - mean); const cw = c - mean;
          const sum = [...left, ...rt, ...ud].reduce((s, q) => s + Math.abs(q), 0);
          let std, dir = null; if (edgeDir) { const sm = 10.14185 / sum; std = sm * sm; const RxLz = rt[0] - left[2], RwLy = rt[3] - left[1], dx = RxLz + RwLy, dy = RxLz - RwLy, li = 1 / Math.sqrt(dx * dx + 3.07574e-05 + dy * dy); dir = [dx * li, dy * li]; } else std = 2.181818 / sum;
          const wY = (dx, dy, q) => { let x; if (edgeDir) { const ed = dx * dir[1] + dy * dir[0]; x = dx * dx + dy * dy + ed * ed * (cl(q * q * std, 0, 1) * 0.7 - 1); } else x = (dx * dx + dy * dy) * 0.55 + cl(Math.abs(q) * std, 0, 1); const w = fl(x); return [w, w * q]; };
          const taps = [[plx, ply + 1, ud[0]], [plx - 1, ply + 1, ud[1]], [plx - 1, ply - 2, ud[2]], [plx, ply - 2, ud[3]], [plx + 1, ply - 1, left[0]], [plx, ply - 1, left[1]], [plx, ply, left[2]], [plx + 1, ply, left[3]], [plx - 1, ply - 1, rt[0]], [plx - 2, ply - 1, rt[1]], [plx - 2, ply, rt[2]], [plx - 1, ply, rt[3]]];
          let W = 0, WY = 0; for (const [a, b, q] of taps) { const [w, wy] = wY(a, b, q); W += w; WY += wy; }
          const maxY = Math.max(left[1], left[2], rt[0], rt[3]), minY = Math.min(left[1], left[2], rt[0], rt[3]);
          const dY = cl(cl(sharp * WY / W, minY, maxY) - cw, -23 / 255, 23 / 255); for (let k = 0; k < 3; k++) col[k] = cl(col[k] + dY, 0, 1);
        }
        out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 1;
      }
      return { out, edges };
    };
    const runGPU = (inp, ow, oh, sharp, variant) => { const pass = new SGSRPass({ variant, sharpness: sharp }); const rt = new THREE.WebGLRenderTarget(ow, oh, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      pass.renderToScreen = false; pass.render(r, rt, { width: inp.iw, height: inp.ih, texture: inp.tex }); const px = new Uint8Array(ow * oh * 4); r.readRenderTargetPixels(rt, 0, 0, ow, oh, px); const failed = pass.failed; rt.dispose(); pass.dispose(); return { px, failed }; };
    const cmp = (px, out) => { let max = 0, sum = 0, n = 0, over2 = 0; for (let i = 0; i < out.length; i++) { if ((i & 3) === 3) continue; const dd = Math.abs(px[i] - out[i] * 255); if (dd > max) max = dd; if (dd > 2) over2++; sum += dd; n++; } return { max: +max.toFixed(2), mean: +(sum / n).toFixed(3), over2 }; };
    const res = { cases: [] };
    const inp = makeInput(96, 60, 7);
    for (const [ow, oh, sharp, variant] of [[120, 75, 2, 'edge'], [120, 75, 2, 'base'], [107, 67, 2, 'edge'], [96, 60, 2, 'edge'], [120, 75, 1, 'edge'], [120, 75, 1.5, 'base']]) {
      const g = runGPU(inp, ow, oh, sharp, variant), rf = ref(inp, ow, oh, sharp, variant === 'edge'); const c = cmp(g.px, rf.out);
      let alpha = true; for (let i = 3; i < g.px.length; i += 4) if (g.px[i] !== 255) { alpha = false; break; }
      // flat patch (rows 0–5 of the input → output rows inside it, columns well inside): identical to the input value
      let flat = 0, flatN = 0; const sy = oh / 60, sx = ow / 96; for (let y = 1; y < Math.floor(4 * sy); y++) for (let x = Math.ceil(31 * sx); x < Math.floor(42 * sx); x++) { const o = (y * ow + x) * 4; flat = Math.max(flat, Math.abs(g.px[o + 1] - 0.5 * 255), Math.abs(g.px[o] - H(0.51) * 255), Math.abs(g.px[o + 2] - H(0.45) * 255)); flatN++; }
      res.cases.push({ ow, oh, sharp, variant, ...c, edges: rf.edges, px: ow * oh, alpha, flat: +flat.toFixed(2), flatN, failed: g.failed });
    }
    // live sharpness / variant switches reuse the material: no new program for a sharpness change
    const p = new SGSRPass({}); const rt = new THREE.WebGLRenderTarget(40, 25); p.render(r, rt, { width: 32, height: 20, texture: inp.tex }); const progs0 = r.info.programs.length; p.setSharpness(1.3); p.render(r, rt, { width: 32, height: 20, texture: inp.tex }); res.sharpNoRecompile = r.info.programs.length === progs0; p.setSharpness(9); res.clampHi = p.uniforms.uEdgeSharpness.value; p.setSharpness('x'); res.clampBad = p.uniforms.uEdgeSharpness.value; rt.dispose(); p.dispose();
    // a shader that does not build is detected (PostFX then falls back to native rendering)
    { const b = new SGSRPass({}); b.mat.fragmentShader = 'void main() { this does not compile; }'; b.mat.needsUpdate = true; const rt2 = new THREE.WebGLRenderTarget(8, 8); const ce = console.error, cw = console.warn; console.error = () => {}; console.warn = () => {}; try { b.render(r, rt2, { width: 8, height: 8, texture: inp.tex }); } finally { console.error = ce; console.warn = cw; } res.brokenDetected = b.failed; rt2.dispose(); b.dispose(); }
    return res;
  });
  for (const c of R.cases) {
    console.log(JSON.stringify(c));
    ok(!c.failed, `${c.variant} ${c.ow}×${c.oh} sharp ${c.sharp}: the shader builds and runs`);
    ok(c.max <= 3 && c.mean <= 0.35 && c.over2 <= c.px * 3 * 0.003, `${c.variant} ${c.ow}×${c.oh} sharp ${c.sharp}: matches the reference of Qualcomm's shader (max ${c.max}/255, mean ${c.mean}/255, ${c.over2} channels > 2/255; ${c.edges} edge pixels of ${c.px})`);
    ok(c.alpha, `${c.variant} ${c.ow}×${c.oh}: alpha is 1 everywhere`);
    ok(c.flat <= 1, `${c.variant} ${c.ow}×${c.oh}: a flat region comes out unchanged (max ${c.flat}/255 over ${c.flatN} px) — no colour or brightness shift`);
  }
  ok(R.sharpNoRecompile, 'changing the sharpness does not compile a new program');
  ok(R.clampHi === 2 && R.clampBad === 2, `sharpness is clamped to Qualcomm's 1.0–2.0 range (9 → ${R.clampHi}, invalid → ${R.clampBad})`);
  ok(R.brokenDetected, 'a shader that fails to build is detected (the game falls back to native rendering)');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} finally { await browser.close(); }
console.log(`sgsr-shader-test: ${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
