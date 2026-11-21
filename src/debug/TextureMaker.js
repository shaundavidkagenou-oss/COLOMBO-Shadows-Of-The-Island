// Texture maker (68th): create a new texture from scratch — generators (solid, gradient, noise, stripes, checks, plaid, denim,
// knit, leather, camo, bricks, tiles, planks, metal, carbon fibre, text …), layered on each other, plus freehand painting
// (brush / eraser / fill / line, opacity, soft edge) and an imported image as a base. Sizes 64–512 px (the game's texture
// budget). Seamless: every generator tiles. Save hands a PNG File to the caller (model tools → model-pack/,
// Texture Studio → texture-pack/).
import { h, Win, num, color, select, check, text, btn, section, toast } from './ui.js';

const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0) / 4294967296; };
const hex = (c) => { const n = parseInt(String(c).replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
// periodic value noise (tiles over the canvas)
function noiseField(W, H, cells, seed) { const r = rnd(seed); const g = new Float32Array(cells * cells).map(() => r()); const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const fx = (x / W) * cells, fy = (y / H) * cells; const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0; const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v = (i, j) => g[((j % cells) + cells) % cells * cells + ((i % cells) + cells) % cells]; const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx, b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx; out[y * W + x] = a + (b - a) * sy; }
  return out; }
function fbm(W, H, base, oct, seed) { const out = new Float32Array(W * H); let amp = 0.5, tot = 0; for (let o = 0; o < oct; o++) { const n = noiseField(W, H, base << o, seed + o * 101); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; tot += amp; amp *= 0.5; } for (let i = 0; i < out.length; i++) out[i] /= tot; return out; }

export const GENERATORS = {
  solid: { label: 'Solid colour', p: { a: '#808080' }, draw(cx, W, H, p) { cx.fillStyle = p.a; cx.fillRect(0, 0, W, H); } },
  gradient: { label: 'Gradient', p: { a: '#202020', b: '#d0d0d0', angle: 90 }, draw(cx, W, H, p) { const r = (p.angle * Math.PI) / 180; const dx = Math.cos(r) * W / 2, dy = Math.sin(r) * H / 2; const g = cx.createLinearGradient(W / 2 - dx, H / 2 - dy, W / 2 + dx, H / 2 + dy); g.addColorStop(0, p.a); g.addColorStop(1, p.b); cx.fillStyle = g; cx.fillRect(0, 0, W, H); } },
  noise: { label: 'Noise / grunge', p: { a: '#3a3a3a', b: '#9a9a9a', scale: 8, detail: 4, seed: 1, contrast: 1 }, pix(W, H, p) { const n = fbm(W, H, Math.max(1, p.scale | 0), Math.max(1, Math.min(7, p.detail | 0)), p.seed | 0); const A = hex(p.a), B = hex(p.b); return (i) => { const t = Math.min(1, Math.max(0, (n[i] - 0.5) * p.contrast + 0.5)); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; }; } },
  stripes: { label: 'Stripes', p: { a: '#1d2840', b: '#e8e6df', count: 8, width: 0.35, angle: 0 }, draw(cx, W, H, p) { cx.fillStyle = p.a; cx.fillRect(0, 0, W, H); cx.save(); cx.fillStyle = p.b; const n = Math.max(1, p.count | 0); const vert = Math.abs(p.angle % 180) === 90; for (let i = 0; i < n; i++) { const s = vert ? W : H; const y = (i / n) * s, w = (s / n) * p.width; if (vert) cx.fillRect(y, 0, w, H); else cx.fillRect(0, y, W, w); } cx.restore(); } },
  checks: { label: 'Checks / gingham', p: { a: '#ffffff', b: '#c03030', count: 8, mix: 0.5 }, draw(cx, W, H, p) { const n = Math.max(1, p.count | 0), sx = W / n, sy = H / n; cx.fillStyle = p.a; cx.fillRect(0, 0, W, H); cx.globalAlpha = p.mix; cx.fillStyle = p.b; for (let i = 0; i < n; i += 2) { cx.fillRect(i * sx, 0, sx, H); cx.fillRect(0, i * sy, W, sy); } cx.globalAlpha = 1; } },
  plaid: { label: 'Plaid / tartan (fabric)', p: { a: '#2a3a5a', b: '#8a2020', c: '#d8c89a', count: 4 }, draw(cx, W, H, p) { cx.fillStyle = p.a; cx.fillRect(0, 0, W, H); const n = Math.max(1, p.count | 0), s = W / n; for (let i = 0; i < n; i++) { for (const [off, w, col, al] of [[0.1, 0.3, p.b, 0.55], [0.55, 0.06, p.c, 0.7], [0.75, 0.04, p.c, 0.5]]) { cx.globalAlpha = al; cx.fillStyle = col; cx.fillRect(i * s + off * s, 0, w * s, H); cx.fillRect(0, i * (H / n) + off * (H / n), W, w * (H / n)); } } cx.globalAlpha = 1; } },
  denim: { label: 'Denim twill (fabric)', p: { a: '#2c4466', b: '#c8d0dc', density: 64, seed: 3 }, pix(W, H, p) { const A = hex(p.a), B = hex(p.b); const n = fbm(W, H, 16, 3, p.seed | 0); const d = Math.max(8, p.density | 0); return (i, x, y) => { const tw = ((x + y) * d / W) % 1 < 0.5 ? 1 : 0; const t = 0.12 * tw + 0.18 * (n[i] - 0.5) + (Math.sin((y / H) * d * Math.PI * 2) > 0.92 ? 0.15 : 0); return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; }; } },
  knit: { label: 'Knit / jersey (fabric)', p: { a: '#6a6c70', rows: 48, depth: 0.25 }, pix(W, H, p) { const A = hex(p.a); const r = Math.max(4, p.rows | 0); return (i, x, y) => { const u = (x / W) * r * 2, v = (y / H) * r; const k = Math.abs(Math.sin((u + (Math.floor(v) % 2) * 0.5) * Math.PI)) * Math.abs(Math.sin(v * Math.PI)); const t = 1 - p.depth + p.depth * k; return [A[0] * t, A[1] * t, A[2] * t]; }; } },
  leather: { label: 'Leather grain', p: { a: '#3c2618', scale: 24, depth: 0.25, seed: 5 }, pix(W, H, p) { const A = hex(p.a); const n = noiseField(W, H, Math.max(2, p.scale | 0), p.seed | 0); const m = fbm(W, H, 4, 3, (p.seed | 0) + 7); return (i) => { const cell = Math.pow(Math.abs(n[i] - 0.5) * 2, 0.6); const t = 1 - p.depth * (1 - cell) + 0.15 * (m[i] - 0.5); return [A[0] * t, A[1] * t, A[2] * t]; }; } },
  camo: { label: 'Camouflage', p: { a: '#4f5636', b: '#2b2e1f', c: '#8a7a52', scale: 4, seed: 9 }, pix(W, H, p) { const n1 = fbm(W, H, Math.max(1, p.scale | 0), 3, p.seed | 0), n2 = fbm(W, H, Math.max(1, p.scale | 0), 3, (p.seed | 0) + 50); const A = hex(p.a), B = hex(p.b), C = hex(p.c); return (i) => (n1[i] > 0.56 ? B : n2[i] > 0.58 ? C : A); } },
  bricks: { label: 'Bricks', p: { a: '#8a4a32', b: '#c8c0b0', rows: 8, cols: 4, mortar: 0.06, seed: 2 }, draw(cx, W, H, p) { const r = rnd(p.seed | 0); cx.fillStyle = p.b; cx.fillRect(0, 0, W, H); const R = Math.max(1, p.rows | 0), C = Math.max(1, p.cols | 0), bh = H / R, bw = W / C, m = p.mortar * bh; const A = hex(p.a);
    for (let j = 0; j < R; j++) for (let i = -1; i < C + 1; i++) { const x = i * bw + (j % 2 ? bw / 2 : 0); const k = 0.82 + r() * 0.3; cx.fillStyle = `rgb(${A[0] * k | 0},${A[1] * k | 0},${A[2] * k | 0})`; cx.fillRect(x + m / 2, j * bh + m / 2, bw - m, bh - m); } } },
  tiles: { label: 'Tiles', p: { a: '#e8e4da', b: '#7a7670', count: 4, grout: 0.04 }, draw(cx, W, H, p) { cx.fillStyle = p.b; cx.fillRect(0, 0, W, H); const n = Math.max(1, p.count | 0), s = W / n, g = p.grout * s; cx.fillStyle = p.a; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) cx.fillRect(i * s + g / 2, j * (H / n) + g / 2, s - g, H / n - g); } },
  planks: { label: 'Wood planks', p: { a: '#7a5232', b: '#4a301c', count: 5, seed: 4 }, pix(W, H, p) { const A = hex(p.a), B = hex(p.b); const n = fbm(W, H, 4, 4, p.seed | 0); const c = Math.max(1, p.count | 0); return (i, x, y) => { const pl = Math.floor((x / W) * c); const grain = Math.sin((y / H) * 40 + n[i] * 12 + pl * 3) * 0.5 + 0.5; const edge = ((x / W) * c) % 1 < 0.02 ? 0.5 : 1; const t = grain * 0.6; return [(A[0] + (B[0] - A[0]) * t) * edge, (A[1] + (B[1] - A[1]) * t) * edge, (A[2] + (B[2] - A[2]) * t) * edge]; }; } },
  metal: { label: 'Brushed metal', p: { a: '#9aa0a6', streak: 0.12, seed: 6 }, pix(W, H, p) { const A = hex(p.a); const r = rnd(p.seed | 0); const rows = new Float32Array(H).map(() => r()); return (i, x, y) => { const t = 1 + (rows[y] - 0.5) * p.streak * 2; return [A[0] * t, A[1] * t, A[2] * t]; }; } },
  carbon: { label: 'Carbon fibre', p: { a: '#1a1a1c', b: '#3a3c40', count: 16 }, pix(W, H, p) { const A = hex(p.a), B = hex(p.b); const c = Math.max(2, p.count | 0); return (i, x, y) => { const u = (x / W) * c, v = (y / H) * c; const cell = (Math.floor(u) + Math.floor(v)) % 2; const f = cell ? Math.sin((u % 1) * Math.PI) : Math.sin((v % 1) * Math.PI); return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f]; }; } },
  dots: { label: 'Polka dots', p: { a: '#f0e8d8', b: '#1d2840', count: 6, size: 0.25 }, draw(cx, W, H, p) { cx.fillStyle = p.a; cx.fillRect(0, 0, W, H); cx.fillStyle = p.b; const n = Math.max(1, p.count | 0), s = W / n; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { cx.beginPath(); cx.arc((i + 0.5 + (j % 2) * 0.5) * s % W, (j + 0.5) * (H / n), s * p.size, 0, Math.PI * 2); cx.fill(); } } },
  text: { label: 'Text / label', p: { a: '#ffffff', text: 'COLOMBO', size: 64, x: 0.5, y: 0.5, font: 'bold sans-serif' }, draw(cx, W, H, p) { cx.fillStyle = p.a; cx.font = `${p.font.includes('bold') ? 'bold ' : ''}${p.size}px ${p.font.replace('bold ', '')}`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(p.text, p.x * W, p.y * H); } },
};
export function renderLayer(cx, W, H, L) {
  const G = GENERATORS[L.gen]; if (!G) return; cx.save(); cx.globalAlpha = L.opacity ?? 1; cx.globalCompositeOperation = L.blend || 'source-over';
  if (G.draw) G.draw(cx, W, H, L.p); else { const f = G.pix(W, H, L.p); const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const tc = tmp.getContext('2d'); const id = tc.createImageData(W, H); const d = id.data;
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) { const c = f(i, x, y); d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; } tc.putImageData(id, 0, 0); cx.drawImage(tmp, 0, 0); }
  cx.restore();
}

// opts: { size, name, base (image / canvas), onSave(File, {name, canvas}) }
export function openTextureMaker(opts = {}) {
  const W0 = Math.min(512, opts.size || 512); const st = { W: W0, H: W0, layers: [{ gen: 'solid', p: { ...GENERATORS.solid.p }, opacity: 1, blend: 'source-over' }], paint: null, tool: 'brush', brush: { col: '#ffffff', size: 16, op: 1, soft: 0.3 }, name: opts.name || 'new texture', tile: false };
  const win = new Win('Create texture', { x: Math.max(10, innerWidth / 2 - 430), y: 40, w: 860, h: Math.min(innerHeight - 60, 680) });
  const cv = h('canvas', { width: st.W, height: st.H, style: { width: '100%', imageRendering: 'pixelated', background: '#000', cursor: 'crosshair', border: '1px solid #3a4250' } });
  const paint = document.createElement('canvas'); const pc = paint.getContext('2d'); const base = { im: opts.base || null };
  const resize = () => { const keep = document.createElement('canvas'); keep.width = paint.width; keep.height = paint.height; keep.getContext('2d').drawImage(paint, 0, 0); paint.width = cv.width = st.W; paint.height = cv.height = st.H; pc.drawImage(keep, 0, 0, st.W, st.H); render(); };
  const comp = document.createElement('canvas');
  function render() {
    comp.width = st.W; comp.height = st.H; const cx = comp.getContext('2d'); cx.clearRect(0, 0, st.W, st.H);
    if (base.im) cx.drawImage(base.im, 0, 0, st.W, st.H); for (const L of st.layers) if (!L.off) renderLayer(cx, st.W, st.H, L); cx.drawImage(paint, 0, 0);
    const o = cv.getContext('2d'); o.clearRect(0, 0, cv.width, cv.height);
    if (st.tile) { o.save(); o.scale(0.5, 0.5); for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) o.drawImage(comp, i * st.W, j * st.H); o.restore(); } else o.drawImage(comp, 0, 0);
  }
  // painting
  let down = null; const at = (e) => { const r = cv.getBoundingClientRect(); let x = ((e.clientX - r.left) / r.width) * st.W, y = ((e.clientY - r.top) / r.height) * st.H; if (st.tile) { x = (x * 2) % st.W; y = (y * 2) % st.H; } return [x, y]; };
  const dab = (x, y) => { const b = st.brush; pc.save(); pc.globalAlpha = b.op; if (st.tool === 'eraser') pc.globalCompositeOperation = 'destination-out'; const r = b.size / 2; const g = pc.createRadialGradient(x, y, r * (1 - b.soft), x, y, r); g.addColorStop(0, b.col); g.addColorStop(1, b.col + '00'); pc.fillStyle = b.soft > 0 ? g : b.col;
    for (const [ox, oy] of [[0, 0], [st.W, 0], [-st.W, 0], [0, st.H], [0, -st.H]]) { pc.beginPath(); pc.arc(x + ox, y + oy, r, 0, Math.PI * 2); pc.fill(); } pc.restore(); }; // wraps around the edges (seamless)
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); const p = at(e); down = p; if (st.tool === 'fill') { pc.fillStyle = st.brush.col; pc.globalAlpha = st.brush.op; pc.fillRect(0, 0, st.W, st.H); pc.globalAlpha = 1; render(); down = null; return; } if (st.tool !== 'line') { dab(...p); render(); } });
  cv.addEventListener('pointermove', (e) => { if (!down || st.tool === 'line') return; const p = at(e); const d = Math.hypot(p[0] - down[0], p[1] - down[1]); const n = Math.max(1, Math.ceil(d / Math.max(1, st.brush.size / 4))); for (let i = 1; i <= n; i++) dab(down[0] + (p[0] - down[0]) * (i / n), down[1] + (p[1] - down[1]) * (i / n)); down = p; render(); });
  cv.addEventListener('pointerup', (e) => { if (down && st.tool === 'line') { const p = at(e); pc.save(); pc.strokeStyle = st.brush.col; pc.globalAlpha = st.brush.op; pc.lineWidth = st.brush.size; pc.lineCap = 'round'; pc.beginPath(); pc.moveTo(...down); pc.lineTo(...p); pc.stroke(); pc.restore(); render(); } down = null; });
  // UI
  const layersEl = h('div'); const left = h('div', { cls: 'ed-col', style: { flex: '0 0 330px', overflow: 'auto' } }); const right = h('div', { cls: 'ed-col', style: { flex: 1, minWidth: 0 } }, cv);
  function layerUI() {
    layersEl.replaceChildren(); st.layers.forEach((L, i) => {
      const G = GENERATORS[L.gen]; const s = section(`Layer ${i + 1}: ${G.label}`, i === st.layers.length - 1);
      s.b.append(select('Pattern', Object.entries(GENERATORS).map(([k, g]) => [k, g.label]), L.gen, (v) => { L.gen = v; L.p = { ...GENERATORS[v].p }; layerUI(); render(); }));
      for (const [k, v] of Object.entries(L.p)) { const set = (x) => { L.p[k] = x; render(); };
        if (typeof v === 'string' && v.startsWith('#')) s.b.append(color(k === 'a' ? 'Colour 1' : k === 'b' ? 'Colour 2' : k === 'c' ? 'Colour 3' : k, v, set));
        else if (typeof v === 'string') s.b.append(text(k, v, set));
        else { const R = { count: [1, 64, 1], rows: [1, 128, 1], cols: [1, 32, 1], scale: [1, 64, 1], detail: [1, 7, 1], seed: [0, 999, 1], angle: [0, 180, 1], size: [0.02, 200, 0.01], width: [0.02, 1, 0.01], mix: [0, 1, 0.01], contrast: [0.1, 4, 0.05], depth: [0, 1, 0.01], mortar: [0, 0.3, 0.005], grout: [0, 0.3, 0.005], streak: [0, 1, 0.01], density: [8, 256, 1], x: [0, 1, 0.01], y: [0, 1, 0.01] }[k] || [0, 100, 1]; s.b.append(num(k, v, { min: R[0], max: R[1], step: R[2] }, set)); } }
      s.b.append(num('Opacity', L.opacity ?? 1, { min: 0, max: 1, step: 0.01 }, (v) => { L.opacity = v; render(); }), select('Blend', ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'soft-light', 'hard-light', 'difference', 'color', 'luminosity'], L.blend || 'source-over', (v) => { L.blend = v; render(); }),
        h('div', { cls: 'ed-tabs' }, check('Hidden', !!L.off, (v) => { L.off = v; render(); }), i > 0 ? btn('▲', () => { st.layers.splice(i - 1, 0, st.layers.splice(i, 1)[0]); layerUI(); render(); }) : null, st.layers.length > 1 ? btn('Delete layer', () => { st.layers.splice(i, 1); layerUI(); render(); }, { cls: 'warn' }) : null));
      layersEl.append(s);
    });
  }
  const tools = h('div', { cls: 'ed-tabs' }); const setTool = (t) => { st.tool = t; for (const b of tools.children) b.classList.toggle('on', b.dataset.t === t); };
  for (const [t, lab] of [['brush', '🖌 Brush'], ['eraser', 'Eraser'], ['line', 'Line'], ['fill', 'Fill']]) { const b = btn(lab, () => setTool(t)); b.dataset.t = t; tools.append(b); } setTool('brush');
  left.append(
    section('Texture', true, text('Name', st.name, (v) => { st.name = v || 'new texture'; }), select('Size', [64, 128, 256, 512].map((n) => [n, n + ' × ' + n + ' px']), st.W, (v) => { st.W = st.H = +v; resize(); }), check('Preview tiled (2 × 2)', false, (v) => { st.tile = v; render(); }),
      h('div', { cls: 'ed-tabs' }, btn('Base image…', async () => { const f = await new Promise((res) => { const i = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } }); i.onchange = () => res(i.files[0] || null); document.body.append(i); i.click(); setTimeout(() => i.remove(), 60000); }); if (!f) return; const im = new Image(); im.onload = () => { base.im = im; render(); }; im.src = URL.createObjectURL(f); }), btn('No base', () => { base.im = null; render(); }))),
    section('Pattern layers (bottom → top)', true, layersEl, btn('+ Add layer', () => { st.layers.push({ gen: 'noise', p: { ...GENERATORS.noise.p }, opacity: 0.35, blend: 'multiply' }); layerUI(); render(); })),
    section('Paint', true, tools, color('Colour', st.brush.col, (v) => { st.brush.col = v; }), num('Size', st.brush.size, { min: 1, max: 256, step: 1 }, (v) => { st.brush.size = v; }), num('Opacity', st.brush.op, { min: 0.02, max: 1, step: 0.01 }, (v) => { st.brush.op = v; }), num('Softness', st.brush.soft, { min: 0, max: 1, step: 0.01 }, (v) => { st.brush.soft = v; }),
      h('div', { cls: 'ed-hint' }, 'Strokes wrap around the edges, so the texture stays seamless.'), btn('Clear paint', () => { pc.clearRect(0, 0, st.W, st.H); render(); }, { cls: 'warn' })),
    h('div', { cls: 'ed-tabs', style: { marginTop: '8px' } }, btn('💾 Save texture', async () => { const blob = await new Promise((r) => comp.toBlob(r, 'image/png')); const file = new File([blob], st.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.png', { type: 'image/png' }); try { await opts.onSave?.(file, { name: st.name, canvas: comp }); toast('Texture saved: ' + st.name); win.close(); } catch (e) { toast('Not saved: ' + (e.message || e), 4000); } }),
      btn('Download PNG', () => comp.toBlob((b) => { const a = h('a', { href: URL.createObjectURL(b), download: st.name + '.png' }); document.body.append(a); a.click(); a.remove(); }, 'image/png')), btn('Cancel', () => win.close())));
  win.body.append(h('div', { cls: 'ed-cols' }, left, right)); paint.width = st.W; paint.height = st.H; layerUI(); render();
  return win;
}
