// Colombo Fort benchmark district: the architectural relief that makes Fort's colonial-era commercial blocks read as real
// buildings rather than painted boxes (cf. the arcaded, balustraded, corner-domed Edwardian blocks around York Street,
// Chatham Street and Janadhipathi Mawatha), plus sun-shading and lit crowns on Fort's modern offices and towers.
// Called from BuildingGen.buildDetail (streamed detail LOD) for buildings with district === 'fort'.
// All geometry goes into the shared merged builders (no new materials, no per-building draw calls).
import * as THREE from 'three';
import { LAND_Y, roadAt } from './Layout.js';
import { FLOOR_H, GROUND_H } from './CityPlan.js';
import { RNG } from '../core/rng.js';

const BAY = 3.2, TW = 4 * BAY;
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3(1, 1, 1);
let URN = null, BALUSTER = null;
function urnGeo() { return URN || (URN = new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.2, 0.08], [0.09, 0.14], [0.11, 0.24], [0.2, 0.36], [0.22, 0.46], [0.16, 0.56], [0.06, 0.6], [0.07, 0.68], [0.0, 0.76]].map(([r, h]) => new THREE.Vector2(r, h)), 8)); }
function balusterGeo() { return BALUSTER || (BALUSTER = new THREE.LatheGeometry([[0, 0], [0.075, 0], [0.075, 0.06], [0.045, 0.1], [0.085, 0.3], [0.04, 0.5], [0.06, 0.56], [0.06, 0.62], [0, 0.62]].map(([r, h]) => new THREE.Vector2(r, h)), 6)); }
const place = (mb, g, x, y, z, rot, col, s = 1) => { Q.setFromAxisAngle(V1.set(0, 1, 0), rot); M4.compose(V1.set(x, y, z), Q, V2.set(s, s, s)); mb.geometry(g, M4, col); };

// roads around a side? (sample a few metres beyond its outer face)
function facesRoad(s) { const mx = (s.a[0] + s.b[0]) / 2, mz = (s.a[1] + s.b[1]) / 2; for (const d of [4, 7, 10]) if (roadAt(mx + s.n[0] * d, mz + s.n[1] * d)) return true; return false; }

export function fortHeritage(b) { return b.district === 'fort' && (b.style === 'colonial' || b.style === 'brick'); }

export function dressFort(b, multi, { sd, front, paint }) {
  const rng = new RNG(7700 + (b.id || 0) * 31); const y0 = LAND_Y, yTop = y0 + b.h; const conc = multi.get('concrete'), pm = multi.get('paint');
  const along = (s, d) => [s.a[0] + (s.b[0] - s.a[0]) * (d / s.len), s.a[1] + (s.b[1] - s.a[1]) * (d / s.len)];
  const rotOf = (s) => Math.atan2(s.n[0], s.n[1]);
  const tone = (k) => paint.map((v) => Math.min(1, v * k));
  if (fortHeritage(b)) {
    const trim = b.style === 'brick' ? [0.93, 0.9, 0.84] : tone(0.93), light = b.style === 'brick' ? [0.96, 0.94, 0.89] : tone(1.02);
    const upper0 = y0 + (b.groundRow != null ? GROUND_H : 0);
    // ---- pilasters on the bay lines + string course at every floor, on each street-facing side (and always the front)
    for (const s of sd) {
      if (s.len < 4 || (s !== front && !facesRoad(s))) continue; const r = rotOf(s); const uOff = b.uOff || 0;
      for (let m = Math.ceil(uOff * 4); ; m++) { const d = m * BAY - uOff * TW; if (d > s.len - 0.3) break; if (d < 0.3) continue;
        const p = along(s, d); conc.box(p[0] + s.n[0] * 0.07, (upper0 + yTop - 0.75) / 2, p[1] + s.n[1] * 0.07, 0.44, yTop - 0.75 - upper0, 0.14, { col: light, rotY: r, uvScale: 3 });
        conc.box(p[0] + s.n[0] * 0.09, upper0 + 0.25, p[1] + s.n[1] * 0.09, 0.56, 0.5, 0.18, { col: trim, rotY: r, uvScale: 3 }); // pilaster base
        conc.box(p[0] + s.n[0] * 0.1, yTop - 0.95, p[1] + s.n[1] * 0.1, 0.58, 0.32, 0.2, { col: trim, rotY: r, uvScale: 3, bottom: true }); } // capital
      const mid = along(s, s.len / 2);
      for (let yy = upper0 + FLOOR_H; yy < yTop - 1.2; yy += FLOOR_H) conc.box(mid[0] + s.n[0] * 0.08, yy - 0.08, mid[1] + s.n[1] * 0.08, s.len + 0.02, 0.2, 0.16, { col: trim, rotY: r, uvScale: 3, bottom: true });
      // entablature: frieze band, dentil course, projecting cornice
      conc.box(mid[0] + s.n[0] * 0.1, yTop - 0.62, mid[1] + s.n[1] * 0.1, s.len + 0.1, 0.34, 0.2, { col: trim, rotY: r, uvScale: 3, bottom: true });
      const tx = -s.n[1], tz = s.n[0];
      for (let d = 0.25; d < s.len - 0.2; d += 0.36) { const p = along(s, d); conc.box(p[0] + s.n[0] * 0.27, yTop - 0.6, p[1] + s.n[1] * 0.27, 0.15, 0.13, 0.16, { col: trim, rotY: r, bottom: true }); }
      void tx; void tz;
    }
    // ---- arcaded verandah: segmental arches between the colonnade columns (front only), with keystones
    if (b.colonnade) {
      const s = front, n = Math.max(2, Math.floor(s.len / 4)), span = s.len / n, r = rotOf(s), off = 0.6, dep = 0.5;
      const top = y0 + GROUND_H, spring = y0 + 3.05, rise = Math.min(0.85, span * 0.22);
      for (let k = 0; k < n; k++) {
        const d0 = k * span + 0.34, d1 = (k + 1) * span - 0.34, w = d1 - d0, N = 8;
        for (let i = 0; i < N; i++) { const t0 = i / N, t1 = (i + 1) / N; const ya = spring + rise * Math.sin(Math.PI * t0), yb = spring + rise * Math.sin(Math.PI * t1);
          const A = along(s, d0 + w * t0), B = along(s, d0 + w * t1);
          for (const sg of [1, -1]) { const o = off + sg * dep / 2; const a = [A[0] + s.n[0] * o, A[1] + s.n[1] * o], bq = [B[0] + s.n[0] * o, B[1] + s.n[1] * o];
            if (sg > 0) conc.quad([a[0], ya, a[1]], [bq[0], yb, bq[1]], [bq[0], top, bq[1]], [a[0], top, a[1]], [0, 0, w / N / 3, (top - ya) / 3], light); // outer spandrel
            else conc.quad([bq[0], yb, bq[1]], [a[0], ya, a[1]], [a[0], top, a[1]], [bq[0], top, bq[1]], [0, 0, w / N / 3, (top - ya) / 3], trim); } // inner face
          const ao = [A[0] + s.n[0] * (off + dep / 2), A[1] + s.n[1] * (off + dep / 2)], ai = [A[0] + s.n[0] * (off - dep / 2), A[1] + s.n[1] * (off - dep / 2)];
          const bo = [B[0] + s.n[0] * (off + dep / 2), B[1] + s.n[1] * (off + dep / 2)], bi = [B[0] + s.n[0] * (off - dep / 2), B[1] + s.n[1] * (off - dep / 2)];
          conc.quad([ai[0], ya, ai[1]], [bi[0], yb, bi[1]], [bo[0], yb, bo[1]], [ao[0], ya, ao[1]], [0, 0, 1, 1], trim); } // soffit
        const km = along(s, (d0 + d1) / 2); conc.box(km[0] + s.n[0] * (off + 0.03), spring + rise + 0.12, km[1] + s.n[1] * (off + 0.03), 0.34, 0.42, dep + 0.08, { col: trim, rotY: r, bottom: true }); // keystone
      }
      // pier blocks (square plinths + capitals) around each round column
      for (let k = 0; k <= n; k++) { const p = along(s, k * span); const cx = p[0] + s.n[0] * off, cz = p[1] + s.n[1] * off;
        conc.box(cx, y0 + 0.3, cz, 0.84, 0.6, 0.84, { col: trim, rotY: r, uvScale: 2 }); conc.box(cx, spring - 0.12, cz, 0.8, 0.24, 0.8, { col: trim, rotY: r, uvScale: 2, bottom: true }); }
    }
    // ---- roof balustrade along the front (pedestals on the bay lines, turned balusters, urns), centre pediment
    if (b.roof === 'flat' || !b.roof) {
      const s = front, r = rotOf(s), bal = balusterGeo(), urn = urnGeo(), base = yTop + 0.02, uOff = b.uOff || 0;
      const mid = along(s, s.len / 2);
      conc.box(mid[0] - s.n[0] * 0.14, base + 0.1, mid[1] - s.n[1] * 0.14, s.len, 0.2, 0.3, { col: trim, rotY: r, uvScale: 3 }); // plinth
      conc.box(mid[0] - s.n[0] * 0.14, base + 0.9, mid[1] - s.n[1] * 0.14, s.len, 0.12, 0.34, { col: trim, rotY: r, uvScale: 3, bottom: true }); // rail
      const peds = [0.2, s.len - 0.2]; for (let m = Math.ceil(uOff * 4); ; m++) { const d = m * BAY - uOff * TW; if (d > s.len - 1) break; if (d > 1) peds.push(d); }
      for (const d of peds) { const p = along(s, d); conc.box(p[0] - s.n[0] * 0.14, base + 0.5, p[1] - s.n[1] * 0.14, 0.42, 1.0, 0.42, { col: light, rotY: r, uvScale: 2 }); }
      for (let d = 0.5; d < s.len - 0.4; d += 0.3) { if (peds.some((q) => Math.abs(q - d) < 0.3)) continue; const p = along(s, d); place(conc, bal, p[0] - s.n[0] * 0.14, base + 0.2, p[1] - s.n[1] * 0.14, r, light, 1.0); }
      for (const d of [peds[0], peds[1]]) { const p = along(s, d); place(conc, urn, p[0] - s.n[0] * 0.14, base + 1.0, p[1] - s.n[1] * 0.14, r, light, 1.1); }
      if (s.len > 12) { // triangular pediment with tympanum roundel over the central bays
        const w = Math.min(10, s.len * 0.38), h = w * 0.22, c = mid, py = base + 1.0; const tx = -s.n[1], tz = s.n[0];
        const P = (u, y, o) => [c[0] + tx * u + s.n[0] * o, y, c[1] + tz * u + s.n[1] * o];
        conc.box(c[0] - s.n[0] * 0.05, py + 0.1, c[1] - s.n[1] * 0.05, w + 0.4, 0.2, 0.55, { col: trim, rotY: r, bottom: true });
        conc.quad(P(-w / 2, py + 0.2, 0.2), P(w / 2, py + 0.2, 0.2), P(0, py + 0.2 + h, 0.2), P(0, py + 0.2 + h, 0.2), [0, 0, 1, 1], light); // face
        conc.quad(P(w / 2, py + 0.2, -0.3), P(-w / 2, py + 0.2, -0.3), P(0, py + 0.2 + h, -0.3), P(0, py + 0.2 + h, -0.3), [0, 0, 1, 1], trim); // back
        conc.quad(P(w / 2 + 0.25, py + 0.15, 0.3), P(w / 2 + 0.25, py + 0.15, -0.35), P(0, py + 0.35 + h, -0.35), P(0, py + 0.35 + h, 0.3), [0, 0, 1, 1], trim); // raking cornices
        conc.quad(P(-w / 2 - 0.25, py + 0.15, -0.35), P(-w / 2 - 0.25, py + 0.15, 0.3), P(0, py + 0.35 + h, 0.3), P(0, py + 0.35 + h, -0.35), [0, 0, 1, 1], trim);
        const rc = P(0, py + 0.2 + h * 0.42, 0.22); pm.cylinder(rc[0], rc[1], rc[2], 0.42, 0.42, 0.06, 14, { col: [0.78, 0.64, 0.36] }); // roundel
        place(conc, urn, ...P(0, py + 0.32 + h, -0.02), r, light, 1.2);
      }
    }
    // ---- domed cupola on street corners (the front meets another street-facing side)
    const iF = sd.indexOf(front); const nb = [sd[(iF + 1) % 4], sd[(iF + 3) % 4]].find((q) => q.len > 6 && facesRoad(q));
    if (nb && b.floors >= 3 && rng.chance(0.75)) {
      const cn = nb === sd[(iF + 1) % 4] ? front.b : front.a; const cx = cn[0] - (front.n[0] + nb.n[0]) * 1.9, cz = cn[1] - (front.n[1] + nb.n[1]) * 1.9, cy = yTop;
      const dome = rng.chance(0.5) ? [0.52, 0.62, 0.58] : [0.62, 0.36, 0.3]; // verdigris copper or red tile
      conc.box(cx, cy + 0.6, cz, 3.4, 1.2, 3.4, { col: trim, uvScale: 2 });
      conc.cylinder(cx, cy + 1.2, cz, 1.55, 1.55, 2.3, 8, { col: light, caps: false });
      for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2; pm.box(cx + Math.cos(a) * 1.5, cy + 2.35, cz + Math.sin(a) * 1.5, 0.5, 1.3, 0.06, { col: [0.1, 0.1, 0.11], rotY: -a + Math.PI / 2 }); } // openings
      conc.cylinder(cx, cy + 3.5, cz, 1.85, 1.85, 0.25, 12, { col: trim });
      const g = new THREE.LatheGeometry([[1.7, 0], [1.68, 0.35], [1.5, 0.95], [1.12, 1.5], [0.6, 1.9], [0.0, 2.05]].map(([r2, h2]) => new THREE.Vector2(r2, h2)), 12); M4.makeTranslation(cx, cy + 3.75, cz); pm.geometry(g, M4, dome); g.dispose();
      pm.cylinder(cx, cy + 5.75, cz, 0.08, 0.03, 1.1, 6, { col: [0.75, 0.62, 0.3] }); // finial
    }
  } else if (b.style === 'office' && b.floors >= 5) {
    // ---- 1960s–80s Colombo office: deep horizontal sun-shade ledges at every floor line on street faces, entrance canopy
    const v0 = y0 + (b.groundRow != null ? GROUND_H : 0); const lc = [0.86, 0.86, 0.84];
    for (const s of sd) { if (s.len < 6 || (s !== front && !facesRoad(s))) continue; const r = rotOf(s), mid = along(s, s.len / 2);
      for (let yy = v0 + FLOOR_H; yy < yTop - 0.6; yy += FLOOR_H) conc.box(mid[0] + s.n[0] * 0.38, yy - 0.12, mid[1] + s.n[1] * 0.38, s.len + 0.3, 0.1, 0.76, { col: lc, rotY: r, uvScale: 3, bottom: true }); }
    if (front.len > 8) { const m = along(front, front.len / 2), r = rotOf(front); conc.box(m[0] + front.n[0] * 1.6, y0 + 3.6, m[1] + front.n[1] * 1.6, Math.min(9, front.len * 0.5), 0.25, 3.2, { col: [0.32, 0.33, 0.35], rotY: r, bottom: true });
      multi.get('lampHead').box(m[0] + front.n[0] * 1.6, y0 + 3.46, m[1] + front.n[1] * 1.6, Math.min(8.4, front.len * 0.46), 0.04, 2.8, { rotY: r, bottom: true, top: false }); } // canopy downlight panel (lit at night)
  }
}

// lit crowns on Fort's towers (skyline at night; base LOD so they show from across the city)
export function fortCrown(b, multi) {
  if (b.district !== 'fort' || !b.tower) return; const yTop = LAND_Y + b.h; { const t = b.tower, i = t.inset; const tx0 = b.x0 + i, tx1 = b.x1 - i, tz0 = b.z0 + i, tz1 = b.z1 - i; const ty = yTop + t.floors * FLOOR_H + (t.crown ? 4.0 : 1.1); const lh = multi.get('lampHead'); const cx = (tx0 + tx1) / 2, cz = (tz0 + tz1) / 2;
    lh.box(cx, ty + 0.06, tz0 - 0.03, tx1 - tx0, 0.12, 0.06); lh.box(cx, ty + 0.06, tz1 + 0.03, tx1 - tx0, 0.12, 0.06); lh.box(tx0 - 0.03, ty + 0.06, cz, 0.06, 0.12, tz1 - tz0); lh.box(tx1 + 0.03, ty + 0.06, cz, 0.06, 0.12, tz1 - tz0); }
}
