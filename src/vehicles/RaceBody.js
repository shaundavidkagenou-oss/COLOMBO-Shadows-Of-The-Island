// Superbike bodywork as real sculpted surfaces, plus race livery stickers.
// Every panel (nose cowl, screen, side fairings + belly, tank, seat, knife-edge tail, undertray) is a smooth Catmull-Rom
// surface through a hand-authored 3D control net (rows run front → back, columns bottom → top on the bike's left, +x),
// mirrored to the right side, given a real wall thickness (inner skin + edge strips) so a panel edge reads as moulded
// plastic, not a paper sheet. Stickers are patches cut from the same surfaces (lifted 1 mm, mapped into one shared canvas
// atlas), so they wrap the curves exactly like vinyl on a fairing: swooshes, the maker's name, a race number roundel and
// fictional sponsors. Coordinates: +z forward, +x = the bike's left, y up from the ground, metres (same as BikeModels.js).
import * as THREE from 'three';

const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
// point on the net at continuous (u = row index, v = column index)
function evalNet(net, u, v) {
  const R = net.length, Cn = net[0].length; const i = Math.min(R - 2, Math.max(0, Math.floor(u))), j = Math.min(Cn - 2, Math.max(0, Math.floor(v))); const tu = u - i, tv = v - j;
  const row = (r) => { const a = net[Math.max(0, Math.min(R - 1, r))]; const p = (c) => a[Math.max(0, Math.min(Cn - 1, c))]; const out = [0, 0, 0]; for (let k = 0; k < 3; k++) out[k] = cr(p(j - 1)[k], p(j)[k], p(j + 1)[k], p(j + 2)[k], tv); return out; };
  const r0 = row(i - 1), r1 = row(i), r2 = row(i + 1), r3 = row(i + 2); return [cr(r0[0], r1[0], r2[0], r3[0], tu), cr(r0[1], r1[1], r2[1], r3[1], tu), cr(r0[2], r1[2], r2[2], r3[2], tu)];
}
function normalNet(net, u, v) {
  const h = 1e-3, R = net.length - 1, Cn = net[0].length - 1;
  const ua = Math.max(0, u - h), ub = Math.min(R, u + h), va = Math.max(0, v - h), vb = Math.min(Cn, v + h);
  const a = evalNet(net, ua, v), b = evalNet(net, ub, v), c = evalNet(net, u, va), d = evalNet(net, u, vb);
  const du = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dv = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
  const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]]; const l = Math.hypot(...n) || 1; return [n[0] / l, n[1] / l, n[2] / l];
}
// sample a (u, v) rectangle of the net into a grid of points + normals (for side s = ±1: x mirrored)
function grid(net, u0, u1, v0, v1, nu, nv, s, lift = 0) {
  const G = []; for (let i = 0; i <= nu; i++) { const row = []; const u = u0 + (u1 - u0) * i / nu;
    for (let j = 0; j <= nv; j++) { const v = v0 + (v1 - v0) * j / nv; const p = evalNet(net, u, v), n = normalNet(net, u, v);
      row.push({ p: [s * (p[0] + n[0] * lift), p[1] + n[1] * lift, p[2] + n[2] * lift], n: [s * n[0], n[1], n[2]], s: i / nu, t: j / nv }); } G.push(row); }
  return G;
}
function emit(b, G, s, col, uvf = null, flip = false) {
  const base = b.vcount; const nu = G.length - 1, nv = G[0].length - 1;
  for (const row of G) for (const q of row) { const [u, v] = uvf ? uvf(q.s, q.t) : [q.s, q.t]; b.vert(q.p[0], q.p[1], q.p[2], q.n[0], q.n[1], q.n[2], u, v, col); }
  const rev = (s < 0) !== flip; // mirrored side (or an inner skin) winds the other way so its face still points out
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = base + i * (nv + 1) + j, bb = a + nv + 1, c = a + 1, d = bb + 1;
    if (!rev) b.idx.push(a, bb, c, bb, d, c); else b.idx.push(a, c, bb, bb, c, d); }
}
// a body panel: both sides, outer + inner skin + edge strips (skipped on an edge that lies on the centre line)
export function panel(b, net, col, o = {}) {
  const R = net.length - 1, Cn = net[0].length - 1; const nu = o.nu || R * 6, nv = o.nv || Cn * 5, t = o.thick ?? 0.004;
  const onCentre = (pts) => pts.every((p) => Math.abs(p[0]) < 1e-4);
  const edges = [[(i) => [0, i / nv * Cn], net.map((r) => r[0]).length && !onCentre(net[0]) ? nv : 0], [(i) => [R, i / nv * Cn], !onCentre(net[R]) ? nv : 0],
    [(i) => [i / nu * R, 0], !onCentre(net.map((r) => r[0])) ? nu : 0], [(i) => [i / nu * R, Cn], !onCentre(net.map((r) => r[Cn])) ? nu : 0]];
  for (const s of [1, -1]) {
    emit(b, grid(net, 0, R, 0, Cn, nu, nv, s), s, col);
    if (t <= 0) continue;
    const inner = grid(net, 0, R, 0, Cn, nu, nv, s, -t); for (const row of inner) for (const q of row) q.n = q.n.map((x) => -x); emit(b, inner, s, col, null, true);
    for (const [f, n] of edges) { if (!n) continue; for (let i = 0; i < n; i++) { const [ua, va] = f(i), [ub, vb] = f(i + 1);
      const A = evalNet(net, ua, va), B = evalNet(net, ub, vb), nA = normalNet(net, ua, va), nB = normalNet(net, ub, vb);
      const P = (p, nn, k) => [s * (p[0] - nn[0] * k), p[1] - nn[1] * k, p[2] - nn[2] * k];
      const q = [P(A, nA, 0), P(B, nB, 0), P(B, nB, t), P(A, nA, t)];
      // the strip faces away from the panel: orient it with the outward edge direction (towards the edge from the middle)
      const mid = evalNet(net, R / 2, Cn / 2); const e = [(A[0] + B[0]) / 2 - mid[0], (A[1] + B[1]) / 2 - mid[1], (A[2] + B[2]) / 2 - mid[2]];
      const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], uz = q[1][2] - q[0][2], vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1], vz = q[3][2] - q[0][2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * s * e[0] + ny * e[1] + nz * e[2] < 0) b.quad(q[1], q[0], q[3], q[2], [0, 0, 1, 1], col); else b.quad(q[0], q[1], q[2], q[3], [0, 0, 1, 1], col); } }
  }
}
// a sticker / lamp / vent cut from a panel: (u0..u1, v0..v1) of the net, lifted off the paint; uv rect [u0, v0, u1, v1] in
// the atlas, laid so the artwork reads left → right on both sides (front of the bike on the left of the left-side view)
export function patch(b, net, u0, u1, v0, v1, col, rect = [0, 0, 1, 1], o = {}) {
  const nu = o.nu || Math.max(4, Math.ceil((u1 - u0) * 8)), nv = o.nv || Math.max(3, Math.ceil((v1 - v0) * 6)), lift = o.lift ?? 0.0012;
  for (const s of o.sides || [1, -1]) { const G = grid(net, u0, u1, v0, v1, nu, nv, s, lift);
    const uvf = (S, T) => { const x = s > 0 ? S : 1 - S; return [rect[0] + (rect[2] - rect[0]) * (o.flipX ? 1 - x : x), rect[1] + (rect[3] - rect[1]) * (o.flipY ? 1 - T : T)]; };
    emit(b, G, s, col, uvf); }
}
// close the open end of a panel (row r) with a fan, e.g. the tail-light face at the tip of the tail
export function capRow(b, net, r, col, back = true) {
  const Cn = net[0].length - 1, n = Cn * 5; const pts = []; for (let i = 0; i <= n; i++) pts.push(evalNet(net, r, i / n * Cn));
  const ring = [...pts.map((p) => [p[0], p[1], p[2]]), ...pts.slice().reverse().map((p) => [-p[0], p[1], p[2]])]; const c = ring.reduce((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length, a[2] + p[2] / ring.length], [0, 0, 0]);
  const nz = back ? -1 : 1; const base = b.vcount; b.vert(c[0], c[1], c[2], 0, 0, nz, 0.5, 0.5, col); for (const p of ring) b.vert(p[0], p[1], p[2], 0, 0, nz, 0.5, 0.5, col);
  for (let i = 0; i < ring.length - 1; i++) { if (back) b.idx.push(base, base + 2 + i, base + 1 + i); else b.idx.push(base, base + 1 + i, base + 2 + i); }
}

// ------------------------------------------------------------------------------------------------- livery atlas
// one 2048² canvas for all five racers: per bike a 640 × 1024 slot holding the side-fairing artwork (512²), the nose cowl
// (384 × 256), the tail (640 × 128) and the tank badge (192 × 128). Names are fictional (makers from BikeCatalog, made-up sponsors).
const SLOT = { soraki: 0, brennhart: 1, takami: 2, orvano: 3, harroway: 4, street: 5 }; // street = stock road graphics for the 155/300 sport bikes
const NUM = { soraki: '17', brennhart: '54', takami: '8', orvano: '61', harroway: '33', street: '' };
const AREAS = { side: [0, 0, 512, 512], cowl: [0, 512, 384, 256], tail: [0, 768, 640, 128], tank: [0, 896, 192, 128], num: [384, 512, 256, 256], strip: [196, 896, 444, 128] };
export function liveryRect(make, area) {
  const k = SLOT[make] ?? 0; const ox = (k % 3) * 680, oy = Math.floor(k / 3) * 1024; const [x, y, w, h] = AREAS[area]; const X = ox + x, Y = oy + y;
  return [X / 2048, 1 - (Y + h) / 2048, (X + w) / 2048, 1 - Y / 2048];
}
const SPONSORS = ['VELORA OIL', 'ARKANO BRAKES', 'NOVEXA CHAINS', 'MONSOON RACING', 'TAPROBANE ENERGY', 'KESTREL VISORS', 'GALEWAY TYRES'];
let liveryTex = null;
function drawLivery() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 2048; const g = c.getContext('2d'); g.clearRect(0, 0, 2048, 2048);
  const BK = { soraki: ['SORAKI', '#d01f2a', '#ffffff', 'tricolour'], brennhart: ['BRENNHART', '#1f5fd0', '#ffffff', 'motorsport'], takami: ['TAKAMI', '#141416', '#3fae2a', 'split'], orvano: ['ORVANO', '#f2f2f0', '#141416', 'stripe'], harroway: ['HARROWAY', '#e8b400', '#141416', 'stripe'] , street: ['TSUBASA', '#141416', '#c8ccd0', 'street'] };
  const txt = (s, x, y, size, col, o = {}) => { g.save(); g.translate(x, y); g.transform(1, 0, o.slant ?? -0.22, 1, 0, 0); g.font = `${o.weight || 800} ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`; g.textAlign = o.align || 'left'; g.textBaseline = 'middle';
    if (o.stroke) { g.lineWidth = o.stroke; g.strokeStyle = o.strokeCol || '#111'; g.lineJoin = 'round'; g.strokeText(s, 0, 0, o.max || 4000); } g.fillStyle = col; g.fillText(s, 0, 0, o.max || 4000); g.restore(); };
  for (const make of Object.keys(SLOT)) {
    const [name, acc, acc2, style] = BK[make]; const k = SLOT[make]; const ox = (k % 3) * 680, oy = Math.floor(k / 3) * 1024; const A = (a) => { const r = AREAS[a]; return [ox + r[0], oy + r[1], r[2], r[3]]; };
    // ---- side fairing: a big swoosh sweeping up from the front-low corner, pinstripe, maker's name, number roundel, sponsors
    { const [x, y, w, h] = A('side'); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      const sw = (y0, y1, col, cut = 0) => { g.beginPath(); g.moveTo(x - 10, y + h * y0); g.bezierCurveTo(x + w * 0.35, y + h * (y0 - 0.02), x + w * 0.6, y + h * (y0 - 0.3), x + w + 10, y + h * (y0 - 0.42 + cut));
        g.lineTo(x + w + 10, y + h * (y1 - 0.42 + cut)); g.bezierCurveTo(x + w * 0.62, y + h * (y1 - 0.3), x + w * 0.35, y + h * (y1 - 0.02), x - 10, y + h * y1); g.closePath(); g.fillStyle = col; g.fill(); };
      if (style === 'split') { g.fillStyle = acc; g.beginPath(); g.moveTo(x - 10, y + h * 0.72); g.lineTo(x + w + 10, y + h * 0.5); g.lineTo(x + w + 10, y + h + 10); g.lineTo(x - 10, y + h + 10); g.fill(); sw(0.62, 0.68, acc2); }
      else if (style === 'motorsport') { sw(0.78, 0.98, acc); sw(0.7, 0.76, '#c8102e'); sw(0.66, 0.685, '#ffffff'); }
      else if (style === 'street') { sw(0.84, 0.96, acc); sw(0.78, 0.81, acc2); }
      else if (style === 'tricolour') { sw(0.8, 0.98, '#1d3fa0'); sw(0.745, 0.79, '#ffffff'); sw(0.98, 1.2, acc); sw(0.7, 0.725, acc); }
      else { sw(0.78, 0.92, acc); sw(0.72, 0.75, acc2); }
      txt(name, x + 20, y + h * 0.6, 92, style === 'tricolour' ? acc : '#ffffff', { stroke: 10, strokeCol: '#111', max: w * 0.8 });
      if (style !== 'street') { // number roundel (white oval, black number) up near the top of the panel
      g.save(); g.translate(x + w * 0.57, y + h * 0.22); g.transform(1, 0, -0.18, 1, 0, 0); g.fillStyle = '#ffffff'; g.strokeStyle = '#111'; g.lineWidth = 8; g.beginPath(); g.ellipse(0, 0, 112, 92, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.restore();
      txt(NUM[make], x + w * 0.57, y + h * 0.22 + 4, 150, '#111', { align: 'center', weight: 900, slant: -0.18 });
      txt(SPONSORS[(k + 1) % SPONSORS.length], x + 22, y + h * 0.465, 40, '#ffffff', { stroke: 6, max: w * 0.5 }); txt(SPONSORS[(k + 3) % SPONSORS.length], x + 26, y + h * 0.73, 32, '#ffffff', { stroke: 5, max: w * 0.6 }); }
      else { txt('SORAKI', x + 24, y + h * 0.44, 46, '#111', { stroke: 6, strokeCol: '#ffffff', max: w * 0.5 }); txt('FUEL INJECTION  LIQUID COOLED', x + 26, y + h * 0.73, 26, '#ffffff', { stroke: 5, max: w * 0.7 }); }
      g.restore(); }
    // ---- nose cowl: accent arrow towards the beak + sponsor
    { const [x, y, w, h] = A('cowl'); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.fillStyle = style === 'tricolour' ? '#ffffff' : acc; g.beginPath(); g.moveTo(x - 5, y + h * 0.55); g.lineTo(x + w * 0.55, y + h * 0.25); g.lineTo(x + w + 5, y + h * 0.2); g.lineTo(x + w + 5, y + h * 0.42); g.lineTo(x + w * 0.55, y + h * 0.48); g.lineTo(x - 5, y + h * 0.8); g.closePath(); g.fill();
      g.fillStyle = style === 'tricolour' ? acc : acc2; g.beginPath(); g.moveTo(x - 5, y + h * 0.84); g.lineTo(x + w * 0.55, y + h * 0.53); g.lineTo(x + w + 5, y + h * 0.48); g.lineTo(x + w + 5, y + h * 0.56); g.lineTo(x + w * 0.55, y + h * 0.6); g.lineTo(x - 5, y + h * 0.94); g.closePath(); g.fill();
      if (style !== 'street') txt(SPONSORS[(k + 2) % SPONSORS.length], x + w * 0.5, y + h * 0.72, 34, '#ffffff', { stroke: 6, max: w * 0.55, align: 'center' }); g.restore(); }
    // ---- tail: number + racing stripe + sponsor
    { const [x, y, w, h] = A('tail'); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = acc; g.beginPath(); g.moveTo(x, y + h * 0.78); g.lineTo(x + w, y + h * 0.18); g.lineTo(x + w, y + h * 0.36); g.lineTo(x, y + h * 0.96); g.fill();
      if (style === 'street') txt('SORAKI', x + w * 0.42, y + h * 0.5, 56, '#ffffff', { stroke: 6, align: 'center' });
      else txt(NUM[make], x + w * 0.22, y + h * 0.45, 96, '#ffffff', { stroke: 8, weight: 900, align: 'center' }); if (style !== 'street') txt(SPONSORS[(k + 4) % SPONSORS.length], x + w * 0.62, y + h * 0.62, 34, '#ffffff', { stroke: 5, max: w * 0.4, align: 'center' }); g.restore(); }
    // ---- tank badge: maker's name in a chrome-edged plate
    { const [x, y, w, h] = A('tank'); const badge = style === 'street' ? 'SORAKI' : name; g.fillStyle = '#111'; g.fillRect(x + 4, y + 30, w - 8, h - 60); g.strokeStyle = '#c8ccd0'; g.lineWidth = 5; g.strokeRect(x + 6, y + 32, w - 12, h - 64); txt(badge, x + w / 2, y + h / 2, 48, '#ffffff', { align: 'center', max: w - 30, slant: -0.15 }); }
    // ---- belly sponsor strip: a black-edged bar with a sponsor name and a small accent block
    { const [x, y, w, h] = A('strip'); g.fillStyle = '#111'; g.fillRect(x + 4, y + 30, w - 8, h - 60); g.fillStyle = acc; g.fillRect(x + 4, y + 30, 46, h - 60);
      txt(SPONSORS[(k + 5) % SPONSORS.length], x + 60 + (w - 70) / 2, y + h / 2, 44, '#ffffff', { align: 'center', max: w - 90 }); }
    // ---- front number plate (white oval, black number) for the nose
    { const [x, y, w, h] = A('num'); g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2 - 6, h / 2 - 6, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 8; g.stroke(); txt(NUM[make], x + w / 2, y + h / 2 + 6, 170, '#111', { align: 'center', weight: 900, slant: -0.15 }); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; return t;
}
let liveryMat = null;
// vinyl under the clear coat: alpha-tested artwork, same gloss as the paint, pulled towards the camera so it never fights it
export function liveryMaterial() {
  if (liveryMat) return liveryMat; liveryTex = liveryTex || drawLivery();
  return (liveryMat = new THREE.MeshPhysicalMaterial({ map: liveryTex, alphaTest: 0.5, roughness: 0.32, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.07, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
}

// ------------------------------------------------------------------------------------------------- the body
// K: { mb, dm, col (paint), blk, seatC, carbon colour, make }. Returns the points other parts hang from.
export function raceBody(mb, K) {
  const P = mb.get('paint'), IN = mb.get('interior'), GL = mb.get('glass'), HL = mb.get('vlight'), TL = mb.get('vtail'), CF = mb.get('carbon'), LV = mb.get('livery'), RB = mb.get('rubber');
  const { col, blk, seatC, cf, make } = K; const W = [1, 1, 1]; const street = make === 'street';
  const N = (net) => (K.xf ? net.map((r) => r.map(K.xf)) : net); // optional per-model reshape of every control net (the smaller sport bikes)
  // nose cowl: pointed beak over the front wheel, flanks sweeping back to the screen edge (columns: lower edge → top edge)
  const cowl = N([
    [[0.03, 0.735, 0.9], [0.036, 0.75, 0.905], [0.03, 0.768, 0.908], [0.0, 0.776, 0.905]],
    [[0.1, 0.69, 0.8], [0.122, 0.735, 0.822], [0.108, 0.8, 0.83], [0.0, 0.84, 0.82]],
    [[0.168, 0.645, 0.67], [0.198, 0.715, 0.695], [0.19, 0.81, 0.71], [0.11, 0.875, 0.705]],
    [[0.212, 0.615, 0.54], [0.238, 0.7, 0.56], [0.228, 0.82, 0.575], [0.145, 0.915, 0.58]],
    [[0.228, 0.61, 0.43], [0.246, 0.7, 0.445], [0.236, 0.83, 0.46], [0.158, 0.94, 0.47]],
    [[0.226, 0.61, 0.35], [0.238, 0.7, 0.36], [0.222, 0.84, 0.37], [0.17, 0.95, 0.375]]]); // last row tucks over the tank front so no gap shows
  panel(P, cowl, col);
  // screen: a bubble between the cowl's top edges, rising to the rear
  const scr = cowl.slice(0, 5).map((r, i) => { const e = r[3]; const rise = [0.004, 0.022, 0.07, 0.12, 0.165][i]; return [[e[0], e[1] + 0.002, e[2]], [e[0] * 0.55, e[1] + rise * 0.82, e[2] - 0.005], [0, e[1] + rise, e[2] - 0.008]]; });
  scr.push(scr[4].map((p) => [p[0] * 0.97, p[1] + 0.012, p[2] - 0.035]));
  patch(GL, scr, 0, 5, 0, 2, W, [0, 0, 1, 1], { lift: 0, nu: 30, nv: 10 });
  // side fairings with the belly pan in one skin (columns: belly centre → top edge under the tank); the front edge
  // stays behind the front tyre's travel and the rear edge slants back down to the belly
  const side = N([
    [[0, 0.175, 0.3], [0.12, 0.2, 0.32], [0.2, 0.3, 0.37], [0.232, 0.48, 0.42], [0.232, 0.63, 0.445], [0.21, 0.72, 0.44]],
    [[0, 0.155, 0.2], [0.14, 0.18, 0.2], [0.222, 0.3, 0.22], [0.252, 0.5, 0.24], [0.242, 0.67, 0.25], [0.2, 0.752, 0.25]],
    [[0, 0.16, 0.0], [0.14, 0.19, 0.0], [0.214, 0.3, 0.01], [0.232, 0.49, 0.04], [0.214, 0.645, 0.08], [0.182, 0.736, 0.11]],
    [[0, 0.205, -0.2], [0.13, 0.235, -0.19], [0.198, 0.33, -0.14], [0.205, 0.47, -0.05], [0.185, 0.6, 0.02], [0.162, 0.7, 0.06]]]);
  panel(P, side, col);
  // tank: tall, scalloped for the knees, sloping into the seat
  const tank = N([
    [[0.08, 0.84, 0.45], [0.075, 0.9, 0.452], [0.055, 0.945, 0.453], [0.028, 0.962, 0.453], [0, 0.965, 0.453]],
    [[0.172, 0.79, 0.42], [0.165, 0.88, 0.43], [0.125, 0.955, 0.44], [0.062, 0.99, 0.44], [0, 0.995, 0.44]],
    [[0.2, 0.76, 0.25], [0.2, 0.875, 0.25], [0.162, 0.985, 0.25], [0.085, 1.035, 0.25], [0, 1.045, 0.25]],
    [[0.172, 0.76, 0.05], [0.168, 0.86, 0.05], [0.14, 0.955, 0.04], [0.075, 0.995, 0.04], [0, 1.003, 0.04]],
    [[0.1, 0.78, -0.1], [0.1, 0.84, -0.1], [0.085, 0.88, -0.11], [0.045, 0.9, -0.11], [0, 0.905, -0.11]]]);
  panel(P, tank, col, { thick: 0 });
  // seat (thin, firm) and the tail it sits in
  const seat = N([
    [[0.06, 0.85, -0.045], [0.06, 0.865, -0.05], [0.04, 0.873, -0.052], [0, 0.875, -0.052]],
    [[0.104, 0.79, -0.07], [0.104, 0.848, -0.07], [0.072, 0.868, -0.075], [0, 0.873, -0.075]],
    [[0.11, 0.8, -0.25], [0.108, 0.86, -0.25], [0.075, 0.877, -0.25], [0, 0.881, -0.25]],
    [[0.1, 0.84, -0.42], [0.1, 0.886, -0.42], [0.065, 0.9, -0.42], [0, 0.905, -0.42]],
    [[0.05, 0.87, -0.445], [0.05, 0.895, -0.445], [0.03, 0.905, -0.445], [0, 0.908, -0.445]]]);
  panel(IN, seat, seatC, { thick: 0 });
  const tail = N([ // slim wedge sweeping up from under the seat to a high, sharp tip; the rear wheel shows under it
    [[0.14, 0.6, -0.06], [0.15, 0.69, -0.06], [0.138, 0.77, -0.06], [0.112, 0.8, -0.06], [0.06, 0.8, -0.06], [0, 0.8, -0.06]],
    [[0.124, 0.72, -0.3], [0.134, 0.778, -0.3], [0.128, 0.826, -0.3], [0.108, 0.852, -0.3], [0.055, 0.857, -0.3], [0, 0.857, -0.3]],
    [[0.104, 0.82, -0.52], [0.118, 0.862, -0.52], [0.116, 0.9, -0.52], [0.094, 0.928, -0.52], [0.048, 0.942, -0.52], [0, 0.946, -0.52]],
    [[0.06, 0.925, -0.74], [0.068, 0.955, -0.74], [0.064, 0.985, -0.74], [0.047, 1.006, -0.74], [0.024, 1.016, -0.74], [0, 1.018, -0.74]],
    [[0.022, 0.99, -0.9], [0.026, 1.006, -0.9], [0.024, 1.024, -0.9], [0.016, 1.036, -0.9], [0.008, 1.041, -0.9], [0, 1.042, -0.9]]]);
  panel(P, tail, col);
  capRow(TL, tail, 4, W, true); // LED tail light filling the tip
  // undertray (black) from the tail's lower edge in to the centre line
  const under = tail.slice(0, 5).map((r) => [[0, r[0][1] - 0.012, r[0][2]], [r[0][0] * 0.98, r[0][1] - 0.002, r[0][2]]]);
  panel(RB, under, blk, { thick: 0 });
  // carbon pillion cowl on the tail top, behind the rider's seat
  patch(street ? IN : CF, tail, 2.05, 3.6, 3.2, 5, street ? seatC : cf, [0, 0, 1, 1], { lift: 0.003, nu: 12, nv: 8 }); // carbon cowl (racers) / pillion pad (road)
  // lamps, intake and vents cut into the panels
  patch(HL, cowl, 0.55, 1.45, 1.05, 1.55, W, [0, 0, 1, 1], { lift: 0.0015 }); patch(HL, cowl, 0.9, 1.75, 1.75, 2.05, W, [0, 0, 1, 1], { lift: 0.0015 }); // twin LED slits per side
  patch(IN, cowl, 0, 0.6, 0, 0.9, blk, [0, 0, 1, 1], { lift: 0.0015 }); // ram-air intake mouth at the beak
  patch(IN, side, 1.3, 2.3, 0.1, 0.7, blk, [0, 0, 1, 1], { lift: 0.0012 }); // belly-pan vent
  // stickers
  patch(LV, side, 0.15, 2.85, 1.7, 4.85, W, liveryRect(make, 'side'), { nu: 22, nv: 20 });
  patch(LV, cowl, 1.15, 3.9, 0.15, 2.75, W, liveryRect(make, 'cowl'), { nu: 18, nv: 12, lift: 0.0018 });
  patch(LV, tail, 1.15, 3.4, 0.35, 2.7, W, liveryRect(make, 'tail'), { nu: 18, nv: 8 });
  patch(LV, tank, 2.2, 2.85, 1.6, 2.4, W, liveryRect(make, 'tank'), { nu: 6, nv: 6, flipY: false });
  if (!street) patch(LV, side, 0.9, 2.5, 0.85, 1.55, W, liveryRect(make, 'strip'), { nu: 12, nv: 6, lift: 0.0016 }); // belly sponsor
  return { cowl, side, tank, tail, evalNet };
}
export { evalNet };
