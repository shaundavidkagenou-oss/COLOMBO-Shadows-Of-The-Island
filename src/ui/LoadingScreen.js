// "Enter game" intro — COLOMBO: SHADOWS OF THE ISLAND.
// A short, loud title sequence shown between the main menu and gameplay while REAL work runs (district streaming,
// shader compilation, warming the simulation around the spawn point): a monsoon night over a procedural Colombo
// skyline (Lotus Tower, Fort towers, Galle Face), a lightning strike, the title slamming in, then a letterboxed
// progress bar with tips. Original procedural motion graphics only. (The studio logo card is NOT shown here — the
// official Shaun David Studios logo appears once, in the boot-time studio intro.)
import { Audio } from '../audio/Audio.js';
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
  const s = el('div', 'screen egi', root);
  const fx = el('canvas', 'egi-fx', s); el('div', 'egi-vig', s); el('div', 'egi-grain', s);
  const bars = el('div', 'egi-bars', s, '<i></i><i></i>');
  const tw = el('div', 'egi-title', s, `<div class="egi-native">කොළඹ <em>·</em> கொழும்பு</div>
    <div class="egi-main" data-t="${title}"><span>${title}</span></div>
    <div class="egi-sub"><i></i><span>${subtitle}</span><i></i></div>`);
  const coords = el('div', 'egi-coords', s, '6.9271° N &nbsp;·&nbsp; 79.8612° E &nbsp;·&nbsp; WESTERN PROVINCE, SRI LANKA');
  const foot = el('div', 'egi-foot', s, `<div class="egi-tip"><small>TIP</small><p></p></div><div class="egi-prog"><div class="egi-row"><span class="egi-label">Preparing</span><span class="egi-pct">0%</span></div><div class="egi-bar"><i></i></div></div>`);
  const flash = el('div', 'egi-flash', s);
  const fill = foot.querySelector('.egi-bar i'), lab = foot.querySelector('.egi-label'), pct = foot.querySelector('.egi-pct'), tipP = foot.querySelector('.egi-tip p');

  // ---- procedural skyline (seeded, so it is the same city every time)
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const towers = []; for (let x = 0; x < 1; ) { const w = 0.012 + rnd() * 0.03; const tall = Math.abs(x - 0.45) < 0.09 ? 0.5 + rnd() * 0.3 : Math.abs(x - 0.62) < 0.05 ? 0.1 + rnd() * 0.12 : 0.1 + rnd() * 0.36; /* Fort high-rises left of the tower, low Slave Island around its base */ towers.push({ x, w, h: tall * (0.6 + 0.4 * Math.sin(x * 9) ** 2), win: rnd() }); x += w + rnd() * 0.006; }
  const palms = Array.from({ length: 26 }, (_, i) => ({ x: i / 26 + rnd() * 0.02, h: 0.05 + rnd() * 0.04, lean: (rnd() - 0.5) * 0.4 }));
  const drops = Array.from({ length: 420 }, () => ({ x: rnd(), y: rnd(), l: 0.02 + rnd() * 0.05, v: 0.9 + rnd() * 0.8 }));
  const ctx = fx.getContext('2d'); let alive = true; const t0 = performance.now(); let strike = -9, shake = 0; const bolts = [];
  const lightning = (big) => { strike = (performance.now() - t0) / 1000; const pts = []; let x = 0.25 + Math.random() * 0.5, y = 0; while (y < 0.62) { pts.push([x, y]); x += (Math.random() - 0.5) * 0.06; y += 0.03 + Math.random() * 0.05; } bolts.push({ pts, t: strike, big }); if (big) shake = 1; };
  const draw = () => {
    if (!alive) return; const W = (fx.width = innerWidth * Math.min(devicePixelRatio, 1.5)), H = (fx.height = innerHeight * Math.min(devicePixelRatio, 1.5)); const t = (performance.now() - t0) / 1000;
    const fl = Math.max(0, 1 - (t - strike) * 3.2) * (Math.random() > 0.25 ? 1 : 0.4); shake *= 0.9;
    ctx.save(); if (shake > 0.01) ctx.translate((Math.random() - 0.5) * 18 * shake, (Math.random() - 0.5) * 12 * shake);
    const push = 1 + Math.min(t, 12) * 0.008; ctx.translate(W / 2, H * 0.72); ctx.scale(push, push); ctx.translate(-W / 2, -H * 0.72);
    // storm sky + city glow on the clouds
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, `rgb(${6 + fl * 120},${8 + fl * 125},${14 + fl * 150})`); sky.addColorStop(0.62, `rgb(${34 + fl * 90},${22 + fl * 80},${22 + fl * 90})`); sky.addColorStop(0.78, '#2a1308'); sky.addColorStop(1, '#050403');
    ctx.fillStyle = sky; ctx.fillRect(-40, -40, W + 80, H + 80);
    for (let k = 0; k < 5; k++) { const cx = ((k * 0.27 + t * 0.006 * (k + 1)) % 1.3 - 0.15) * W, cy = H * (0.12 + 0.08 * k); const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.35); g.addColorStop(0, `rgba(${60 + fl * 160},${55 + fl * 160},${70 + fl * 170},0.35)`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    // bolts
    for (const b of bolts) { const a = 1 - (t - b.t) * 4; if (a <= 0) continue; ctx.strokeStyle = `rgba(230,236,255,${a})`; ctx.lineWidth = b.big ? 3 : 1.5; ctx.shadowColor = '#bcd0ff'; ctx.shadowBlur = 24; ctx.beginPath(); b.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H))); ctx.stroke(); ctx.shadowBlur = 0; }
    // searchlights sweeping from the Fort
    ctx.globalCompositeOperation = 'lighter'; for (let k = 0; k < 2; k++) { const a = -Math.PI / 2 + Math.sin(t * 0.35 + k * 2.1) * 0.5; const bx = W * (0.55 + k * 0.12), by = H * 0.6; const g = ctx.createLinearGradient(bx, by, bx + Math.cos(a) * H, by + Math.sin(a) * H); g.addColorStop(0, 'rgba(255,220,170,0.16)'); g.addColorStop(1, 'rgba(255,220,170,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a - 0.05) * H * 1.4, by + Math.sin(a - 0.05) * H * 1.4); ctx.lineTo(bx + Math.cos(a + 0.05) * H * 1.4, by + Math.sin(a + 0.05) * H * 1.4); ctx.closePath(); ctx.fill(); } ctx.globalCompositeOperation = 'source-over';
    // skyline
    const base = H * 0.72; const sil = `rgb(${8 + fl * 40},${8 + fl * 42},${12 + fl * 52})`; ctx.fillStyle = sil;
    for (const tw_ of towers) { const x = tw_.x * W, w = tw_.w * W, h = tw_.h * H * 0.5; ctx.fillRect(x, base - h, w, h + 2);
      if (tw_.win > 0.35) { ctx.fillStyle = 'rgba(255,196,120,0.55)'; for (let yy = base - h + 6; yy < base - 4; yy += 7) for (let xx = x + 3; xx < x + w - 3; xx += 5) if (((xx * 13 + yy * 7) | 0) % 11 < 3) ctx.fillRect(xx, yy, 2, 3); ctx.fillStyle = sil; } }
    // Lotus Tower: tapering stem, bud, mast; its LEDs breathe magenta
    { const lx = W * 0.62, top = base - H * 0.44; const led = 0.5 + 0.5 * Math.sin(t * 1.4); ctx.fillStyle = sil; ctx.beginPath(); ctx.moveTo(lx - W * 0.011, base); ctx.lineTo(lx - W * 0.004, top + H * 0.09); ctx.lineTo(lx + W * 0.004, top + H * 0.09); ctx.lineTo(lx + W * 0.011, base); ctx.fill();
      ctx.beginPath(); ctx.ellipse(lx, top + H * 0.06, W * 0.017, H * 0.042, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(lx - 1.5, top - H * 0.07, 3, H * 0.1);
      ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(lx, top + H * 0.06, 0, lx, top + H * 0.06, W * 0.06); g.addColorStop(0, `rgba(255,60,190,${0.35 + 0.25 * led})`); g.addColorStop(1, 'rgba(255,60,190,0)'); ctx.fillStyle = g; ctx.fillRect(lx - W * 0.07, top - H * 0.05, W * 0.14, H * 0.24);
      ctx.fillStyle = `rgba(255,${40 + 160 * fl},60,${0.6 + 0.4 * Math.sin(t * 6)})`; ctx.beginPath(); ctx.arc(lx, top - H * 0.07, 2.2, 0, 6.28); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    // Galle Face palms on the seafront + the sea catching the city glow
    ctx.strokeStyle = sil; ctx.lineWidth = 2; for (const pm of palms) { const x = pm.x * W, h = pm.h * H; ctx.beginPath(); ctx.moveTo(x, base + 6); ctx.quadraticCurveTo(x + pm.lean * h, base - h * 0.5, x + pm.lean * h * 1.4, base - h); ctx.stroke(); for (let f = 0; f < 5; f++) { const a = -Math.PI / 2 + (f - 2) * 0.7 + Math.sin(t * 2 + pm.x * 9) * 0.1; ctx.beginPath(); ctx.moveTo(x + pm.lean * h * 1.4, base - h); ctx.quadraticCurveTo(x + pm.lean * h * 1.4 + Math.cos(a) * 14, base - h + Math.sin(a) * 6 - 4, x + pm.lean * h * 1.4 + Math.cos(a) * 24, base - h + Math.sin(a) * 10 + 8); ctx.stroke(); } }
    const sea = ctx.createLinearGradient(0, base, 0, H); sea.addColorStop(0, `rgba(${70 + fl * 120},${40 + fl * 120},${30 + fl * 140},0.9)`); sea.addColorStop(1, '#030303'); ctx.fillStyle = sea; ctx.fillRect(-40, base + 6, W + 80, H);
    for (let k = 0; k < 40; k++) { const y = base + 10 + k * k * 0.18; ctx.fillStyle = `rgba(255,190,120,${0.05 * (1 - k / 40)})`; ctx.fillRect(W * 0.5 + Math.sin(k * 3.1 + t * 1.5) * W * 0.2 - W * 0.15, y, W * 0.3, 1.2); }
    // police light bar pulsing far down a Fort street
    { const ph = (t * 2.4) % 1, on = (t * 9.6) % 1 < 0.5; ctx.globalCompositeOperation = 'lighter'; const px = W * 0.34, py = base - 3; const col = ph < 0.5 ? '40,90,255' : '255,40,40'; if (on && t > 3) { const g = ctx.createRadialGradient(px, py, 0, px, py, 40); g.addColorStop(0, `rgba(${col},0.7)`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(px - 40, py - 40, 80, 80); } ctx.globalCompositeOperation = 'source-over'; }
    // monsoon rain, slanted
    ctx.strokeStyle = `rgba(190,205,225,${0.18 + fl * 0.3})`; ctx.lineWidth = 1; ctx.beginPath(); for (const d of drops) { d.y += d.v * 0.016 * 1.6; if (d.y > 1.05) { d.y = -0.05; d.x = Math.random() * 1.2 - 0.1; } const x = (d.x - d.y * 0.18) * W, y = d.y * H; ctx.moveTo(x, y); ctx.lineTo(x - d.l * W * 0.18, y + d.l * H); } ctx.stroke();
    ctx.restore();
    if (onTick) onTick(t);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  requestAnimationFrame(() => s.classList.add('in'));
  // ---- the cut: black → strike → native script → title SLAM → subtitle wipe (CSS classes drive the type)
  const seq = (async () => {
    await wait(650); lightning(true); Audio.thunder(0.15); s.classList.add('s1');
    await wait(700); s.classList.add('s2');
    await wait(650); s.classList.add('s3'); shake = 1.4; Audio.boom(); flash.classList.add('hit'); setTimeout(() => flash.classList.remove('hit'), 380);
    await wait(900); s.classList.add('s4');
    await wait(600); s.classList.add('s5');
    for (;;) { await wait(2600 + Math.random() * 3200); if (!alive) break; lightning(Math.random() < 0.4); }
  })(); void seq;
  // rotating tips
  let tipI = Math.floor(Math.random() * LOADING_TIPS.length); const showTip = () => { tipP.classList.remove('show'); setTimeout(() => { tipP.textContent = LOADING_TIPS[tipI++ % LOADING_TIPS.length]; tipP.classList.add('show'); }, 350); };
  setTimeout(showTip, 3400); const tipTimer = setInterval(showTip, 4600);

  // real work, with an eased display value so the bar never jumps backwards
  let shown = 0, target = 0; const bar = setInterval(() => { shown += (target - shown) * 0.18; fill.style.width = `${(shown * 100).toFixed(1)}%`; pct.textContent = `${Math.round(shown * 100)}%`; }, 33);
  const n = stages.length; await wait(900);
  for (let i = 0; i < n; i++) { const st = stages[i]; lab.textContent = st.label; target = i / n; await new Promise((r) => requestAnimationFrame(r)); try { await st.run((p) => { target = (i + Math.min(1, Math.max(0, p))) / n; }); } catch (e) { console.warn('loading stage', st.label, e); } target = (i + 1) / n; }
  lab.textContent = 'Ready'; target = 1;
  const remain = Math.max(minMs, 5200) - (performance.now() - t0); if (remain > 0) await wait(remain);
  await wait(300); lightning(true); if (onFlash) onFlash(); s.classList.add('done'); await wait(650); // white-out strike, title punches through the lens
  s.classList.add('out'); await wait(800);
  alive = false; clearInterval(tipTimer); clearInterval(bar); s.remove(); void bars; void tw; void coords;
}
