// "Enter game" loading screen — Shaun David Studios.
// A full-screen animated sequence shown between the main menu and gameplay while REAL work runs (district streaming,
// shader compilation, warming the simulation around the spawn point). The official logo is shown exactly as supplied:
// fixed aspect ratio (432:443), never stretched, recoloured or redrawn — light only falls on the paper around the
// line-art via multiply blending, the same treatment as the studio intro. Everything around it (rings, particles,
// light sweeps, typography) is original procedural motion graphics.
const LOGO = `${import.meta.env.BASE_URL}assets/brand/sds-logo.jpg`;
const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const LOADING_TIPS = [
  'Traffic in Sri Lanka keeps LEFT. Overtake on the right, and expect buses to pull in to every halt.',
  'Tuk-tuks are the quickest way through Pettah\'s narrow streets. Walk up to one and press the vehicle key to take it.',
  'Witnesses report crimes to 119. Get out of sight and the police search will eventually stand down.',
  'At one star an officer may stop you and issue an on-the-spot fine of Rs. 2,500 instead of an arrest.',
  'Plain tea and a rotti at Lucky Tea Kade costs Rs. 150.',
  'When the monsoon breaks, the streets empty fast and umbrellas come out — drive carefully in the rain.',
  'The coastal line stops at Wellawatte, Bambalapitiya, Kollupitiya, Kompanna Veediya, Colombo Fort and Maradana.',
  'Open the map to see districts, landmarks and shops, and set a waypoint to get a route along the road network.',
  'Temples, kovils, mosques and churches are part of everyday Colombo life — treat them with respect.',
  'Lotus Tower lights up after dark. It is the tallest structure in South Asia and easy to navigate by.',
];

// stages: [{ label, run(progress) }] — each run receives a 0..1 progress callback and may be async
export async function enterGameLoading(root, stages, { minMs = 6200, title = 'COLOMBO', subtitle = 'SHADOWS OF THE ISLAND', onTick = null, onFlash = null } = {}) {
  const s = el('div', 'screen enterload', root);
  const fx = el('canvas', 'el-fx', s);
  el('div', 'el-vignette', s); el('div', 'el-grain', s);
  const stage = el('div', 'el-stage', s);
  // rotating rings (SVG, original geometry: octagon + compass ticks) around the emblem
  const ticks = Array.from({ length: 72 }, (_, i) => { const a = (i / 72) * Math.PI * 2, r0 = i % 9 === 0 ? 41 : 44, r1 = 46; return `<line x1="${50 + Math.cos(a) * r0}" y1="${50 + Math.sin(a) * r0}" x2="${50 + Math.cos(a) * r1}" y2="${50 + Math.sin(a) * r1}"/>`; }).join('');
  const oct = (r, rot = Math.PI / 8) => Array.from({ length: 8 }, (_, i) => { const a = rot + (i / 8) * Math.PI * 2; return `${(50 + Math.cos(a) * r).toFixed(2)},${(50 + Math.sin(a) * r).toFixed(2)}`; }).join(' ');
  el('div', 'el-rings', stage, `<svg viewBox="0 0 100 100" aria-hidden="true">
    <g class="r1"><circle cx="50" cy="50" r="48.5"/><g class="ticks">${ticks}</g></g>
    <g class="r2"><polygon points="${oct(39.5)}"/><polygon points="${oct(37.6, 0)}" class="thin"/></g>
    <g class="r3"><circle cx="50" cy="50" r="35.6" class="dash"/></g>
    <circle cx="50" cy="50" r="28.35" class="medal"/><circle cx="50" cy="50" r="29.6" class="medal2"/>
    <g class="r4"><path d="M50 1.5 L51.2 6 L50 5 L48.8 6Z M98.5 50 L94 51.2 L95 50 L94 48.8Z M50 98.5 L48.8 94 L50 95 L51.2 94Z M1.5 50 L6 48.8 L5 50 L6 51.2Z"/></g>
  </svg>`);
  const emb = el('div', 'el-emblem', stage); const img = el('img', 'el-logo', emb); img.src = LOGO; img.alt = 'Shaun David Studios'; img.draggable = false;
  el('div', 'el-shine', emb);
  const name = el('div', 'el-name', s, 'SHAUN DAVID STUDIOS'.split('').map((c, i) => `<span style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span>`).join(''));
  const sub = el('div', 'el-sub', s, `<b>${title}</b><i></i><span>${subtitle}</span>`);
  const foot = el('div', 'el-foot', s, `<div class="el-tip"><small>TIP</small><p></p></div><div class="el-prog"><div class="el-bar"><i></i><em></em></div><div class="el-row"><span class="el-label">Preparing</span><span class="el-pct">0%</span></div></div>`);
  const spin = el('div', 'el-spin', s, '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16"/></svg><span>LOADING</span>');
  const fill = foot.querySelector('.el-bar i'), lab = foot.querySelector('.el-label'), pct = foot.querySelector('.el-pct'), tipP = foot.querySelector('.el-tip p');
  const flash = el('div', 'el-flash', s);

  // particles: embers drifting up + orbiting motes around the emblem; light beams sweeping
  const ctx = fx.getContext('2d'); let alive = true; const t0 = performance.now();
  const P = Array.from({ length: 170 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, v: 0.00012 + Math.random() * 0.0004, ph: Math.random() * 6.28 }));
  const O = Array.from({ length: 60 }, () => ({ a: Math.random() * 6.28, r: 0.24 + Math.random() * 0.12, v: (0.08 + Math.random() * 0.18) * (Math.random() < 0.5 ? -1 : 1), s: 0.6 + Math.random() * 1.6 }));
  const draw = () => {
    if (!alive) return; const w = (fx.width = innerWidth * Math.min(devicePixelRatio, 1.5)), h = (fx.height = innerHeight * Math.min(devicePixelRatio, 1.5)); const t = (performance.now() - t0) / 1000; const m = Math.min(w, h); const cx = w / 2, cy = h * 0.42;
    ctx.clearRect(0, 0, w, h);
    // god-rays behind the emblem
    ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 7; k++) { const a = t * 0.06 + (k / 7) * Math.PI * 2; const g = ctx.createLinearGradient(0, 0, Math.cos(a) * m, Math.sin(a) * m); g.addColorStop(0, 'rgba(255,206,140,0.06)'); g.addColorStop(1, 'rgba(255,206,140,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, m, a - 0.07, a + 0.07); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of P) { p.y -= p.v * p.z * 1.6; p.x += Math.sin(t * 0.6 + p.ph) * 0.00015; if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); } const a = (0.25 + 0.5 * p.z) * (0.6 + 0.4 * Math.sin(t * 2 + p.ph)); ctx.fillStyle = `rgba(255,${180 + 40 * p.z | 0},120,${a.toFixed(3)})`; const r = 0.6 + p.z * 1.6; ctx.beginPath(); ctx.arc(p.x * w, p.y * h, r, 0, 6.28); ctx.fill(); }
    for (const o of O) { o.a += o.v * 0.016; const x = cx + Math.cos(o.a) * o.r * m, y = cy + Math.sin(o.a) * o.r * m * 0.98; const g = ctx.createRadialGradient(x, y, 0, x, y, o.s * 4); g.addColorStop(0, 'rgba(255,226,170,0.9)'); g.addColorStop(1, 'rgba(255,190,110,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, o.s * 4, 0, 6.28); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
    if (onTick) onTick(t);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  requestAnimationFrame(() => s.classList.add('in'));
  // rotating tips
  let tipI = Math.floor(Math.random() * LOADING_TIPS.length); const showTip = () => { tipP.classList.remove('show'); setTimeout(() => { tipP.textContent = LOADING_TIPS[tipI++ % LOADING_TIPS.length]; tipP.classList.add('show'); }, 350); };
  showTip(); const tipTimer = setInterval(showTip, 4200);

  // real work, with an eased display value so the bar never jumps backwards
  let shown = 0, target = 0; const bar = setInterval(() => { shown += (target - shown) * 0.18; fill.style.width = `${(shown * 100).toFixed(1)}%`; pct.textContent = `${Math.round(shown * 100)}%`; }, 33);
  const n = stages.length; await wait(900);
  for (let i = 0; i < n; i++) { const st = stages[i]; lab.textContent = st.label; target = i / n; await new Promise((r) => requestAnimationFrame(r)); try { await st.run((p) => { target = (i + Math.min(1, Math.max(0, p))) / n; }); } catch (e) { console.warn('loading stage', st.label, e); } target = (i + 1) / n; }
  lab.textContent = 'Ready'; target = 1; spin.querySelector('span').textContent = 'READY';
  const remain = minMs - (performance.now() - t0); if (remain > 0) await wait(remain);
  await wait(450); if (onFlash) onFlash(); s.classList.add('done'); await wait(700); // flash + sweep out
  s.classList.add('out'); await wait(900);
  alive = false; clearInterval(tipTimer); clearInterval(bar); s.remove(); void name; void sub; void spin; void flash; void img;
}
