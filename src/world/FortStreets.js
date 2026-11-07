// Colombo Fort benchmark district — street dressing: trilingual (Sinhala / Tamil / English) municipal street-name boards at
// the junctions, original Sri Lankan rooftop billboards (lit at night by their flood lamps), manhole covers, kerb gully
// grates and municipal litter bins. Text is real Sinhala and Tamil, drawn with the bundled Noto fonts (preloaded by Game).
// Static, merged geometry; one canvas atlas for the street names and one for the billboards.
import * as THREE from 'three';
import * as L from './Layout.js';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { RNG } from '../core/rng.js';

const FORT = [-600, -160, -1000, -640];
const inFort = (x, z) => x >= FORT[0] && x < FORT[1] && z >= FORT[2] && z < FORT[3];
// Only names whose Sinhala and Tamil forms are certain; other streets get no board rather than a guessed transliteration.
const NAMES = {
  'Chatham Street': ['චැතම් වීදිය', 'சத்தம் வீதி'],
  'York Street': ['යෝක් වීදිය', 'யோர்க் வீதி'],
  'Janadhipathi Mawatha': ['ජනාධිපති මාවත', 'ஜனாதிபதி மாவத்தை'],
  'Bank of Ceylon Mawatha': ['ලංකා බැංකු මාවත', 'இலங்கை வங்கி மாவத்தை'],
  'Lotus Road': ['ලෝටස් පාර', 'லோட்டஸ் வீதி'],
  'Chaithya Road': ['චෛත්‍ය පාර', 'சைத்திய வீதி'],
  'Prince Street': ['ප්‍රින්ස් වීදිය', 'பிரின்ஸ் வீதி'],
  'Front Street': ['ෆ්‍රන්ට් වීදිය', 'ஃப்ரண்ட் வீதி'],
  'Lighthouse Street': ['ලයිට්හවුස් වීදිය', 'லைட்ஹவுஸ் வீதி'],
};
const SI = (px) => `600 ${px}px "Noto Sans Sinhala", sans-serif`, TA = (px) => `600 ${px}px "Noto Sans Tamil", sans-serif`, EN = (px) => `700 ${px}px "Barlow Condensed", "Manrope", sans-serif`;
function fit(g, text, font, max) { g.font = font(100); const w = g.measureText(text).width; return font(Math.min(100, Math.floor(100 * max / Math.max(1, w)))); }

function nameAtlas(list) { // 512×208 per cell, 2 columns
  const CW = 512, CH = 208, cols = 2, rows = Math.ceil(list.length / cols); const c = document.createElement('canvas'); c.width = CW * cols; c.height = CH * rows; const g = c.getContext('2d');
  list.forEach((en, i) => { const x = (i % cols) * CW, y = Math.floor(i / cols) * CH; const [si, ta] = NAMES[en];
    g.fillStyle = '#16478c'; g.fillRect(x, y, CW, CH); g.strokeStyle = '#f4f6f8'; g.lineWidth = 7; g.strokeRect(x + 9, y + 9, CW - 18, CH - 18);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = fit(g, si, SI, CW - 60); g.font = g.font.replace(/\d+px/, (m) => Math.min(parseInt(m), 50) + 'px'); g.fillText(si, x + CW / 2, y + 50);
    g.font = fit(g, ta, TA, CW - 60); g.font = g.font.replace(/\d+px/, (m) => Math.min(parseInt(m), 40) + 'px'); g.fillText(ta, x + CW / 2, y + 100);
    g.font = fit(g, en.toUpperCase(), EN, CW - 60); g.font = g.font.replace(/\d+px/, (m) => Math.min(parseInt(m), 46) + 'px'); g.fillText(en.toUpperCase(), x + CW / 2, y + 146);
    g.font = '600 22px "Barlow Condensed", "Noto Sans Sinhala", "Noto Sans Tamil", sans-serif'; g.fillStyle = '#cfe0f5'; g.fillText('COLOMBO 01  ·  කොළඹ 01  ·  கொழும்பு 01', x + CW / 2, y + 184); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return { tex: t, cols, rows };
}
// original billboards (fictional brands), 1024×342 each, stacked
const BOARDS = [
  (g, W, H) => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#bfe3f2'); gr.addColorStop(0.45, '#7cc2a0'); gr.addColorStop(1, '#2f7a45'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 9; k++) { g.strokeStyle = `rgba(20,70,35,${0.25 + k * 0.05})`; g.lineWidth = 6; g.beginPath(); for (let x = 0; x <= W; x += 16) g.lineTo(x, H * 0.48 + k * 22 + Math.sin(x / 90 + k) * 14); g.stroke(); }
    g.fillStyle = '#fff8e6'; g.textAlign = 'left'; g.font = EN(78); g.fillText('CEYLON HIGHLANDS TEA', 40, 96); g.font = SI(52); g.fillText('ලංකා තේ', 44, 176); g.font = TA(40); g.fillText('இலங்கைத் தேநீர்', 260, 172);
    g.font = EN(36); g.fillStyle = '#ffe9a8'; g.fillText('PURE HILL-COUNTRY LEAF  ·  SINCE 1921', 44, 300); },
  (g, W, H) => { const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#2a0f4a'); gr.addColorStop(1, '#c2187a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 5; k++) { g.strokeStyle = `rgba(255,255,255,${0.08 + k * 0.03})`; g.lineWidth = 5; g.beginPath(); g.arc(W * 0.86, H * 0.62, 40 + k * 46, -Math.PI * 0.85, -Math.PI * 0.15); g.stroke(); }
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.font = EN(110); g.fillText('LANKALINK 5G', 40, 128); g.font = SI(56); g.fillText('දිවයින පුරා 5G', 44, 214); g.font = TA(40); g.fillText('தீவு முழுவதும் 5G', 44, 286); },
  (g, W, H) => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1e2d5a'); gr.addColorStop(0.45, '#e2734a'); gr.addColorStop(0.62, '#ffc070'); gr.addColorStop(0.64, '#2c4f6e'); gr.addColorStop(1, '#16304a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffe2a0'; g.beginPath(); g.arc(W * 0.7, H * 0.6, 46, Math.PI, 0); g.fill(); g.fillStyle = '#10141c'; // palm silhouettes
    for (const [px, sc] of [[W * 0.84, 1], [W * 0.92, 0.8]]) { g.fillRect(px, H * 0.2 * sc + H * 0.2, 7, H); for (let k = 0; k < 7; k++) { const a = -Math.PI + k * 0.5; g.beginPath(); g.ellipse(px + Math.cos(a) * 34 * sc, H * 0.22 + H * 0.2 * sc + Math.sin(a) * 14, 40 * sc, 7, a, 0, Math.PI * 2); g.fill(); } }
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.font = EN(118); g.fillText('SRI LANKA', 40, 130); g.font = SI(52); g.fillText('ශ්‍රී ලංකා', 44, 206); g.font = TA(44); g.fillText('இலங்கை', 300, 204); g.font = EN(38); g.fillStyle = '#ffe2b0'; g.fillText('EXPLORE THE ISLAND', 44, 300); },
  (g, W, H) => { g.fillStyle = '#0f2346'; g.fillRect(0, 0, W, H); g.fillStyle = '#c9a24a'; g.fillRect(0, H - 26, W, 26); g.fillRect(W - 300, 0, 8, H);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.font = EN(74); g.fillText('SERENDIB SAVINGS BANK', 40, 100); g.font = SI(50); g.fillText('ඔබේ අනාගතය සඳහා', 44, 182); g.font = TA(38); g.fillText('உங்கள் எதிர்காலத்திற்காக', 44, 252);
    g.fillStyle = '#c9a24a'; g.font = EN(64); g.textAlign = 'center'; g.fillText('SSB', W - 150, 190); },
];

export function buildFortStreets(plan) {
  const group = new THREE.Group(); group.name = 'fort-streets'; const colliders = []; const mb = new MultiBuilder(); const rng = new RNG(1958);
  const metal = mb.get('metal'), paint = mb.get('paint'), lamp = mb.get('lampHead');
  // ---------------- street-name boards
  const signs = []; // [x, z, rotY, name]
  for (const n of L.nodes) {
    if (!inFort(n.x, n.z) || n.segs.length < 3) continue;
    const v = n.up || n.down, h = n.left || n.right; if (!v || !h) continue;
    for (const [sx, sz] of [[1, 1], [-1, -1]]) { // two diagonal corners, each with a board for both streets
      const x = n.x + sx * (n.hwV + 0.6), z = n.z + sz * (n.hwH + 3.2); if (L.isWater(x, z) || L.roadAt(x, z) || L.zoneAt(x, z, 0.5)) continue;
      const names = [[h.name, 0], [v.name, Math.PI / 2]].filter(([nm]) => NAMES[nm]); if (!names.length) continue;
      metal.cylinder(x, L.LAND_Y, z, 0.045, 0.045, 3.15, 8, { col: [0.62, 0.64, 0.66] });
      for (let k = 0; k < 6; k++) paint.cylinder(x, L.LAND_Y + k * 0.2, z, 0.05, 0.05, 0.1, 8, { col: [0.05, 0.05, 0.05], caps: false }); // black/white banded foot
      names.forEach(([nm, rot], k) => signs.push([x, z, rot, nm, L.LAND_Y + 2.62 - k * 0.66]));
      colliders.push({ x0: x - 0.08, x1: x + 0.08, z0: z - 0.08, z1: z + 0.08, h: 3.2, kind: 'pole' });
    }
  }
  const used = [...new Set(signs.map((s) => s[3]))];
  if (used.length) {
    const { tex, cols, rows } = nameAtlas(used); const sb = new MultiBuilder().get('s'); const W = 1.36, H = 0.55;
    for (const [x, z, rot, nm, y] of signs) { const i = used.indexOf(nm); const u0 = (i % cols) / cols, u1 = u0 + 1 / cols, v1 = 1 - Math.floor(i / cols) / rows, v0 = v1 - 1 / rows;
      const c = Math.cos(rot), s = Math.sin(rot); const P = (a, yy, o) => [x + a * c + o * s, yy, z - a * s + o * c];
      const ox = W / 2 + 0.06; // board hangs off the post on the side of its own street
      sb.quad(P(ox - W / 2, y - H / 2, 0.012), P(ox + W / 2, y - H / 2, 0.012), P(ox + W / 2, y + H / 2, 0.012), P(ox - W / 2, y + H / 2, 0.012), [u0, v0, u1, v1]);
      sb.quad(P(ox + W / 2, y - H / 2, -0.012), P(ox - W / 2, y - H / 2, -0.012), P(ox - W / 2, y + H / 2, -0.012), P(ox + W / 2, y + H / 2, -0.012), [u0, v0, u1, v1]);
      const ctr = P(ox, y, 0); metal.box(ctr[0], ctr[1], ctr[2], W + 0.04, H + 0.04, 0.02, { col: [0.75, 0.77, 0.8], rotY: rot });
      const br = P(0.06, y + 0.2, 0); metal.box(br[0], br[1], br[2], 0.12, 0.05, 0.05, { col: [0.6, 0.6, 0.62], rotY: rot }); }
    const m = new THREE.Mesh(sb.build(), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.05 })); m.castShadow = true; m.receiveShadow = true; m.name = 'fort-street-names'; group.add(m);
  }
  // ---------------- manholes, gully grates, litter bins along Fort streets
  for (const seg of L.segments) {
    const mx = (seg.x0 + seg.x1) / 2, mz = (seg.z0 + seg.z1) / 2; if (!inFort(mx, mz) || seg.bridge) continue;
    const horiz = seg.dir === 'h', len = horiz ? seg.x1 - seg.x0 : seg.z1 - seg.z0; const P = (t, o) => horiz ? [seg.x0 + t, seg.z0 + o] : [seg.x0 + o, seg.z0 + t];
    for (let t = 14; t < len - 14; t += 26 + rng.next() * 8) { const [x, z] = P(t, (rng.chance(0.5) ? 1 : -1) * seg.hw * 0.45); if (!L.roadAt(x, z)) continue;
      metal.cylinder(x, L.ROAD_Y - 0.002, z, 0.34, 0.34, 0.016, 16, { col: [0.2, 0.19, 0.18] }); metal.cylinder(x, L.ROAD_Y + 0.008, z, 0.27, 0.27, 0.008, 16, { col: [0.13, 0.125, 0.12] }); }
    for (const side of [-1, 1]) for (let t = 10; t < len - 10; t += 18) { const [x, z] = P(t, side * (seg.hw - 0.25)); if (!L.roadAt(x, z)) continue;
      metal.box(x, L.ROAD_Y + 0.004, z, horiz ? 0.8 : 0.36, 0.012, horiz ? 0.36 : 0.8, { col: [0.1, 0.1, 0.1] });
      for (let k = -3; k <= 3; k++) metal.box(x + (horiz ? k * 0.1 : 0), L.ROAD_Y + 0.011, z + (horiz ? 0 : k * 0.1), horiz ? 0.03 : 0.34, 0.006, horiz ? 0.34 : 0.03, { col: [0.22, 0.22, 0.21] }); }
    if (seg.level <= 2) for (let t = 30; t < len - 20; t += 55 + rng.next() * 20) { const side = rng.chance(0.5) ? 1 : -1; const [x, z] = P(t, side * (seg.hw + seg.walk - 0.45)); if (L.roadAt(x, z) || L.zoneAt(x, z) || L.isWater(x, z)) continue;
      if (plan.colliders.some((c) => x > c.x0 - 0.5 && x < c.x1 + 0.5 && z > c.z0 - 0.5 && z < c.z1 + 0.5)) continue;
      paint.cylinder(x, L.LAND_Y, z, 0.26, 0.29, 0.86, 12, { col: [0.13, 0.36, 0.2] }); paint.cylinder(x, L.LAND_Y + 0.86, z, 0.31, 0.31, 0.06, 12, { col: [0.09, 0.25, 0.14] });
      colliders.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3, h: 0.95, kind: 'prop' }); }
  }
  // ---------------- rooftop billboards on Fort blocks facing the main roads
  const BW = 1024, BH = 342; const bc = document.createElement('canvas'); bc.width = BW; bc.height = BH * BOARDS.length; const bg = bc.getContext('2d');
  BOARDS.forEach((f, i) => { bg.save(); bg.translate(0, i * BH); bg.beginPath(); bg.rect(0, 0, BW, BH); bg.clip(); f(bg, BW, BH); bg.restore(); });
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace; btex.anisotropy = 8;
  const bmat = new THREE.MeshStandardMaterial({ map: btex, emissiveMap: btex, emissive: 0xffffff, emissiveIntensity: 0.0, roughness: 0.55 });
  const bb = new MultiBuilder().get('b'); const picked = [], boards = [];
  const cand = plan.buildings.filter((b) => b.district === 'fort' && !b.tower && (b.roof === 'flat' || !b.roof) && b.floors >= 3 && b.floors <= 6 && Math.min(b.x1 - b.x0, b.z1 - b.z0) > 10);
  for (const b of cand.sort((a, c) => (a.id * 7919 % 101) - (c.id * 7919 % 101))) {
    if (picked.length >= BOARDS.length) break; const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    if (picked.some((p) => Math.hypot(p[0] - cx, p[1] - cz) < 110)) continue;
    const n = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[b.front]; if (!n) continue; const seg = L.roadAt(cx + n[0] * ((b.x1 - b.x0) / 2 + 8), cz + n[1] * ((b.z1 - b.z0) / 2 + 8)); if (!seg) continue;
    const i = picked.length; picked.push([cx, cz]); boards.push({ x: cx + n[0] * ((b.x1 - b.x0) / 2), z: cz + n[1] * ((b.z1 - b.z0) / 2), y: L.LAND_Y + b.h + 6.1, n }); const yTop = L.LAND_Y + b.h; const rot = Math.atan2(n[0], n[1]);
    const W = 9, H = 3, LIFT = 4.6, y = yTop + LIFT + H / 2; const fx = cx + n[0] * ((b.x1 - b.x0) / 2 - 3.0), fz = cz + n[1] * ((b.z1 - b.z0) / 2 - 3.0); /* clears the heritage pediment + balustrade */
    const c = Math.cos(rot), s = Math.sin(rot); const P = (a, yy, o) => [fx + a * c + o * s, yy, fz - a * s + o * c]; const v1 = 1 - i / BOARDS.length, v0 = v1 - 1 / BOARDS.length;
    bb.quad(P(-W / 2, y - H / 2, 0.06), P(W / 2, y - H / 2, 0.06), P(W / 2, y + H / 2, 0.06), P(-W / 2, y + H / 2, 0.06), [0, v0, 1, v1]);
    const ctr = P(0, y, -0.02); metal.box(ctr[0], ctr[1], ctr[2], W + 0.3, H + 0.3, 0.12, { col: [0.16, 0.16, 0.17], rotY: rot }); // frame + back
    for (const a of [-W / 3, 0, W / 3]) { const p = P(a, yTop + LIFT / 2, -0.4); metal.box(p[0], p[1], p[2], 0.16, LIFT, 0.16, { col: [0.3, 0.3, 0.32], rotY: rot }); const q = P(a, yTop + LIFT / 2, -1.8); metal.box(q[0], yTop + LIFT / 2 + 0.3, q[2], 0.1, LIFT + 0.6, 0.1, { col: [0.3, 0.3, 0.32], rotY: rot }); }
    const cat = P(0, y - H / 2 - 0.12, 0.45); metal.box(cat[0], cat[1], cat[2], W, 0.06, 0.8, { col: [0.25, 0.25, 0.26], rotY: rot, bottom: true }); // service catwalk
    for (const a of [-W * 0.33, 0, W * 0.33]) { const p = P(a, y - H / 2 - 0.05, 0.75); lamp.box(p[0], p[1], p[2], 0.42, 0.12, 0.2, { rotY: rot, bottom: true }); } // flood lamps
  }
  if (picked.length) { const m = new THREE.Mesh(bb.build(), bmat); m.name = 'fort-billboards'; m.castShadow = true; group.add(m); }
  for (const m of mb.toMeshes(MAT)) group.add(m);
  group.updateMatrixWorld(true);
  return { group, colliders, boards, signs: signs.map(([x, z, rot, nm, y]) => ({ x, z, y, rot, name: nm })), update: (night) => { bmat.emissiveIntensity = 0.04 + night * 0.85; } };
}
