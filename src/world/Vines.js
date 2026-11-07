// Creepers: ivy-like vines climbing compound walls, the side / back walls of low houses and shophouses and the odd
// electricity pole, and bougainvillea spilling over compound-wall copings in magenta / orange. Static, built once per 200 m
// chunk into ONE merged leaf mesh + ONE bract mesh (2 draws per chunk, only chunks near the player are shown, no shadow
// casting), so they cost nothing on the CPU per frame. Leaves are alpha-tested sprig cards (the same small-leaf texture as
// the shrubs) laid flat on the masonry with a little depth; their vertex colour darkens towards the ground (dirt, shade).
import * as THREE from 'three';
import { MAT } from '../gfx/Materials.js';
import { RNG } from '../core/rng.js';
import * as L from './Layout.js';

let vineMat = null;
function material() { // the shrubs' leaf material without the wind sway (vines are pinned to the masonry)
  if (vineMat) return vineMat; const src = MAT.leavesSmall || MAT.leaves; vineMat = src.clone(); vineMat.onBeforeCompile = () => {}; vineMat.customProgramCacheKey = () => 'vine'; vineMat.name = 'vine'; return vineMat; }

class Buf { constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.v = 0; }
  // a card centred at c, spanned by unit vectors a, b (half sizes ha, hb), facing n
  card(c, a, b, n, ha, hb, col, flip) { const v = this.v; for (const [sa, sb, uu, vv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      this.p.push(c[0] + a[0] * sa * ha + b[0] * sb * hb, c[1] + a[1] * sa * ha + b[1] * sb * hb, c[2] + a[2] * sa * ha + b[2] * sb * hb); this.n.push(n[0], n[1], n[2]); this.u.push(flip ? 1 - uu : uu, vv); this.c.push(col[0], col[1], col[2]); }
    this.i.push(v, v + 1, v + 2, v, v + 2, v + 3); this.v += 4; }
  // a 4-point bract (kite) at c in the plane (a, b)
  kite(c, a, b, n, s, col) { const v = this.v; for (const [sa, sb] of [[0, -1.2], [0.8, 0], [0, 1.2], [-0.8, 0]]) { this.p.push(c[0] + (a[0] * sa + b[0] * sb) * s, c[1] + (a[1] * sa + b[1] * sb) * s, c[2] + (a[2] * sa + b[2] * sb) * s); this.n.push(n[0], n[1], n[2]); this.u.push(0.5, 0.5); this.c.push(col[0], col[1], col[2]); }
    this.i.push(v, v + 1, v + 2, v, v + 2, v + 3); this.v += 4; }
  mesh(mat, name) { if (!this.v) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); for (const at of [...Object.values(g.attributes), g.index]) at.onUpload(function () { this.array = null; }); // static: the CPU copy is freed once it is on the GPU
    const m = new THREE.Mesh(g, mat); m.name = name; m.castShadow = false; m.receiveShadow = true; m.matrixAutoUpdate = false; return m; } }

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const LEAF = [0.62, 0.78, 0.55];
const BRACT = [[0.86, 0.1, 0.5], [0.8, 0.12, 0.42], [0.95, 0.45, 0.14], [0.92, 0.82, 0.86]];

// a creeper patch on a vertical face: origin o (ground level, start of the patch), along t (unit, horizontal), out n, width w,
// max height h. Columns grow to ragged heights, thicker at the root, with a few runners reaching higher.
function patch(B, rng, o, t, n, w, h, dens = 1) {
  const cols = Math.max(2, Math.round(w / 0.42)); const top = []; let hv = h * rng.range(0.45, 0.9);
  for (let k = 0; k < cols; k++) { const edge = Math.min(k, cols - 1 - k) / Math.max(1, cols / 2); hv = Math.min(h, Math.max(0.4, hv + rng.range(-0.35, 0.35))); top.push(hv * (0.45 + 0.55 * Math.min(1, edge * 1.6)) * (rng.chance(0.12) ? 1.35 : 1)); }
  for (let k = 0; k < cols; k++) { const H = Math.min(h, top[k]); for (let y = 0.05; y < H; y += 0.36 / dens) { if (!rng.chance(0.86)) continue;
      const u = (k + rng.range(-0.3, 1.3)) * (w / cols), yy = y + rng.range(-0.1, 0.12), s = rng.range(0.26, 0.42) * (yy > H - 0.4 ? 0.75 : 1), off = 0.035 + rng.range(0, 0.1);
      const c = [o[0] + t[0] * u + n[0] * off, o[1] + yy, o[2] + t[2] * u + n[2] * off]; const ang = rng.next() * 6.283, ca = Math.cos(ang), sa = Math.sin(ang);
      const tilt = rng.range(-0.35, 0.35); const nn = norm([n[0] + t[0] * tilt, rng.range(-0.15, 0.4), n[2] + t[2] * tilt]); // leaves turn up / sideways to the light
      const a = [t[0] * ca, sa, t[2] * ca], b = [-t[0] * sa, ca, -t[2] * sa]; const shade = 0.55 + 0.45 * Math.min(1, yy / 1.6), g = rng.range(0.85, 1.12);
      B.card(c, a, b, nn, s, s, [LEAF[0] * shade * g, LEAF[1] * shade * g, LEAF[2] * shade * g], rng.chance(0.5)); } }
}
// bougainvillea arching over a wall coping (top at height y) and hanging down both faces
function drape(L0, Bl, rng, o, t, n, w, y, th) {
  for (let u = 0; u < w; u += 0.3) { const hang = rng.range(0.5, 1.4), lift = rng.range(0.25, 0.55);
    for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 4; k++) { const f = k / 3; const yy = y + lift * (1 - f * f) - hang * f * f * (k === 3 ? 1 : 0.7), off = th * 0.5 + 0.06 + f * 0.25 + rng.range(0, 0.12); const uu = u + rng.range(-0.15, 0.15);
      const nn = norm([n[0] * s * (0.3 + f), 1 - f, n[2] * s * (0.3 + f)]); const c = [o[0] + t[0] * uu + n[0] * s * off, o[1] + yy, o[2] + t[2] * uu + n[2] * s * off];
      const ang = rng.next() * 6.283, a = norm([t[0] * Math.cos(ang) + n[0] * s * 0.3, Math.sin(ang), t[2] * Math.cos(ang) + n[2] * s * 0.3]); const b = norm([nn[1] * a[2] - nn[2] * a[1], nn[2] * a[0] - nn[0] * a[2], nn[0] * a[1] - nn[1] * a[0]]);
      const g = rng.range(0.8, 1.1); L0.card(c, a, b, nn, rng.range(0.24, 0.36), rng.range(0.24, 0.36), [LEAF[0] * g, LEAF[1] * g, LEAF[2] * g], rng.chance(0.5));
      if (rng.chance(0.85)) { const col = BRACT[rng.chance(0.7) ? rng.int(0, 1) : rng.int(2, 3)]; const j = rng.range(0.85, 1.1); for (let q = 0; q < 2; q++) Bl.kite([c[0] + nn[0] * 0.05 + rng.range(-0.18, 0.18), c[1] + nn[1] * 0.05 + rng.range(-0.15, 0.15), c[2] + nn[2] * 0.05 + rng.range(-0.18, 0.18)], a, b, nn, rng.range(0.07, 0.1), col.map((v) => v * j)); } } }
}

export function buildVines(plan, chunks) {
  const t0 = performance.now(); const mat = material(), bmat = MAT.bloom || mat; const st = { walls: 0, drapes: 0, houses: 0, poles: 0, verts: 0 };
  for (const c of chunks) { const ch = plan.byChunk[c.idx]; if (!ch) continue; const rng = new RNG(5000 + c.idx * 7); const B = new Buf(), Bl = new Buf();
    for (const w of ch.walls || []) { if (!rng.chance(0.42)) continue; const alongX = w.x1 - w.x0 >= w.z1 - w.z0; const len = alongX ? w.x1 - w.x0 : w.z1 - w.z0, th = alongX ? w.z1 - w.z0 : w.x1 - w.x0; if (len < 1.5) continue;
      const t = alongX ? [1, 0, 0] : [0, 0, 1], n = alongX ? [0, 0, 1] : [1, 0, 0]; const gy = L.groundY((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2);
      const pw = Math.min(len, rng.range(1.4, 5.5)), u0 = rng.range(0, len - pw); const o = [w.x0 + t[0] * u0, gy, w.z0 + t[2] * u0];
      if (rng.chance(0.4)) { drape(B, Bl, rng, [o[0] + n[0] * th / 2, gy, o[2] + n[2] * th / 2], t, n, pw, w.h, th); st.drapes++; continue; }
      for (const s of [-1, 1]) { if (s === 1 && rng.chance(0.5)) continue; const nn = [n[0] * s, 0, n[2] * s]; const face = [o[0] + (s > 0 ? n[0] * th : 0), gy, o[2] + (s > 0 ? n[2] * th : 0)]; patch(B, rng, face, t, nn, pw, w.h + 0.05); }
      st.walls++; }
    for (const b of ch.buildings || []) { const garden = b.style === 'villa' || b.style === 'colonial'; if ((b.totalH || b.h) > 14 || !['villa', 'colonial', 'shop', 'shop2', 'apartment', 'brick'].includes(b.style)) continue; if (!rng.chance(garden ? 0.3 : 0.1)) continue;
      const sides = ['N', 'E', 'S', 'W'].filter((s) => s !== b.front); const side = rng.pick(sides); const gy = L.groundY((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2); const H = Math.min(b.totalH || b.h, rng.range(3, 9));
      let o, t, n, len; if (side === 'N') { o = [b.x0, gy, b.z0]; t = [1, 0, 0]; n = [0, 0, -1]; len = b.x1 - b.x0; } else if (side === 'S') { o = [b.x0, gy, b.z1]; t = [1, 0, 0]; n = [0, 0, 1]; len = b.x1 - b.x0; }
      else if (side === 'W') { o = [b.x0, gy, b.z0]; t = [0, 0, 1]; n = [-1, 0, 0]; len = b.z1 - b.z0; } else { o = [b.x1, gy, b.z0]; t = [0, 0, 1]; n = [1, 0, 0]; len = b.z1 - b.z0; }
      const pw = Math.min(len - 0.4, rng.range(2, 6)); if (pw < 1.2) continue; const u0 = rng.range(0.2, len - pw - 0.2); const mid = [o[0] + t[0] * (u0 + pw / 2) + n[0] * 0.8, o[2] + t[2] * (u0 + pw / 2) + n[2] * 0.8];
      if (L.roadAt(mid[0], mid[1])) continue; // that face is on the pavement: owners keep it clear
      patch(B, rng, [o[0] + t[0] * u0, gy, o[2] + t[2] * u0], t, n, pw, H, 0.9); st.houses++; }
    for (const p of ch.props || []) { if (p.type !== 'pole' || !rng.chance(0.12)) continue; const gy = L.groundY(p.x, p.z), H = rng.range(2.2, 4.8);
      for (let y = 0.1; y < H; y += 0.16) { const a = y * 2.4 + rng.range(-0.6, 0.6), r = 0.16 + rng.range(0, 0.06); const n = [Math.cos(a), rng.range(-0.1, 0.3), Math.sin(a)], t = [-Math.sin(a), 0, Math.cos(a)];
        const g = rng.range(0.8, 1.1) * (0.6 + 0.4 * Math.min(1, y / 1.5)), s = rng.range(0.2, 0.32) * (y > H - 0.5 ? 0.7 : 1); B.card([p.x + n[0] * r, gy + y, p.z + n[2] * r], t, [0, 1, 0], norm(n), s, s, [LEAF[0] * g, LEAF[1] * g, LEAF[2] * g], rng.chance(0.5)); }
      st.poles++; }
    const g = new THREE.Group(); g.name = 'vines'; const m1 = B.mesh(mat, 'vineLeaves'), m2 = Bl.mesh(bmat, 'vineBracts'); if (m1) g.add(m1); if (m2) g.add(m2); st.verts += B.v + Bl.v;
    if (g.children.length) { g.visible = false; g.matrixAutoUpdate = false; c.group.add(g); c.vines = g; } }
  // the vine material is its own shader program: keep one empty draw of it always in the scene so the loading screen's
  // shader compile includes it (otherwise the first vine-covered chunk to come into range would compile it mid-game)
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3)); for (const [k, n] of [['normal', 3], ['uv', 2], ['color', 3]]) g.setAttribute(k, new THREE.Float32BufferAttribute(new Array(3 * n).fill(0), n));
    g.setDrawRange(0, 0); const m = new THREE.Mesh(g, mat); m.name = 'vineWarm'; m.frustumCulled = false; m.castShadow = false; st.warm = m; }
  st.ms = Math.round(performance.now() - t0); return st;
}
