// The rest of Colombo (every district except the Fort benchmark, which has FortStyle.js): the vernacular relief that turns
// painted boxes into Colombo buildings — slab-edge bands at every floor, parapet copings, pilasters and heavy cornices on the
// old shophouses, sun-shade ledges / vertical fins on offices, and the rebar-crowned roof columns left for "the next floor"
// on so many shophouses and walk-ups. Window hoods are added per opening in BuildingGen.dressFacade.
// Called from BuildingGen.buildDetail (streamed detail LOD). All geometry goes into the shared merged builders
// (no new materials, no per-building draw calls).
import { LAND_Y, roadAt, DISTRICTS } from './Layout.js';
import { FLOOR_H, GROUND_H } from './CityPlan.js';
import { RNG } from '../core/rng.js';

const BAY = 3.2, TW = 4 * BAY;
const URBAN = new Set(['dense', 'market', 'commercial']); // district styles where unfinished upper floors are common
function facesRoad(s) { const mx = (s.a[0] + s.b[0]) / 2, mz = (s.a[1] + s.b[1]) / 2; for (const d of [4, 7, 10]) if (roadAt(mx + s.n[0] * d, mz + s.n[1] * d)) return true; return false; }

export function dressDistrict(b, multi, { sd, front, paint, fk }) {
  const rng = new RNG(9100 + (b.id || 0) * 37); const y0 = LAND_Y, yTop = y0 + b.h; const conc = multi.get('concrete'), met = multi.get('metal');
  const along = (s, d) => [s.a[0] + (s.b[0] - s.a[0]) * (d / s.len), s.a[1] + (s.b[1] - s.a[1]) * (d / s.len)];
  const rotOf = (s) => Math.atan2(s.n[0], s.n[1]);
  const tone = (k) => paint.map((v) => Math.min(1, v * k));
  const street = sd.filter((s) => s.len >= 4 && (s === front || facesRoad(s)));
  const flat = b.roof === 'flat' || !b.roof; const upper0 = y0 + (b.groundRow != null ? GROUND_H : 0);
  const dstyle = (DISTRICTS[b.district] || {}).style;

  // ---- parapet coping: a slightly wider, darker cap on the parapet (crisp roof line instead of a bare wall top)
  if (flat && b.style !== 'villa' && !b.tower) { const ph = 0.9, c = tone(0.8), w = 0.36, y = yTop + ph + 0.03;
    conc.box((b.x0 + b.x1) / 2, y, b.z0 + 0.125, b.x1 - b.x0 + 0.1, 0.07, w, { col: c, uvScale: 3, bottom: true });
    conc.box((b.x0 + b.x1) / 2, y, b.z1 - 0.125, b.x1 - b.x0 + 0.1, 0.07, w, { col: c, uvScale: 3, bottom: true });
    conc.box(b.x0 + 0.125, y, (b.z0 + b.z1) / 2, w, 0.07, b.z1 - b.z0 - 0.62, { col: c, uvScale: 3, bottom: true });
    conc.box(b.x1 - 0.125, y, (b.z0 + b.z1) / 2, w, 0.07, b.z1 - b.z0 - 0.62, { col: c, uvScale: 3, bottom: true }); }

  // ---- slab-edge bands at every floor line on the street faces (shophouses and walk-ups)
  if (/^(shop|shop2|apartment|apartment2)$/.test(fk) && b.floors >= 2) {
    const c = tone(0.9);
    for (const s of street) { const r = rotOf(s), mid = along(s, s.len / 2);
      for (let yy = upper0 + FLOOR_H; yy < yTop - 0.8; yy += FLOOR_H) conc.box(mid[0] + s.n[0] * 0.05, yy - 0.06, mid[1] + s.n[1] * 0.05, s.len + 0.06, 0.14, 0.1, { col: c, rotY: r, uvScale: 3, bottom: true }); } }

  // ---- old Pettah / Slave Island shophouse: pilasters on the bay lines, a moulded band at each floor and a heavy cornice
  if (fk === 'shop3') {
    const trim = tone(0.88), light = tone(1.0); const uOff = b.uOff || 0;
    for (const s of street) { const r = rotOf(s);
      for (let m = Math.ceil(uOff * 4); ; m++) { const d = m * BAY - uOff * TW; if (d > s.len - 0.3) break; if (d < 0.3) continue;
        const p = along(s, d); conc.box(p[0] + s.n[0] * 0.06, (upper0 + yTop - 0.7) / 2, p[1] + s.n[1] * 0.06, 0.36, yTop - 0.7 - upper0, 0.12, { col: light, rotY: r, uvScale: 3 });
        conc.box(p[0] + s.n[0] * 0.08, yTop - 0.85, p[1] + s.n[1] * 0.08, 0.48, 0.26, 0.16, { col: trim, rotY: r, uvScale: 3, bottom: true }); }
      const mid = along(s, s.len / 2);
      for (let yy = upper0 + FLOOR_H; yy < yTop - 1.2; yy += FLOOR_H) conc.box(mid[0] + s.n[0] * 0.08, yy - 0.08, mid[1] + s.n[1] * 0.08, s.len + 0.04, 0.18, 0.15, { col: trim, rotY: r, uvScale: 3, bottom: true });
      conc.box(mid[0] + s.n[0] * 0.14, yTop - 0.45, mid[1] + s.n[1] * 0.14, s.len + 0.2, 0.3, 0.28, { col: trim, rotY: r, uvScale: 3, bottom: true }); // cornice
      conc.box(mid[0] + s.n[0] * 0.2, yTop - 0.25, mid[1] + s.n[1] * 0.2, s.len + 0.3, 0.1, 0.4, { col: tone(0.82), rotY: r, uvScale: 3, bottom: true }); } // drip
  }

  // ---- offices outside the Fort: 1970s sun-shade ledges (plain office) or deep vertical fins on the bay lines (office2)
  if (fk === 'office' && b.floors >= 5) { const lc = [0.84, 0.84, 0.82];
    for (const s of street) { if (s.len < 6) continue; const r = rotOf(s), mid = along(s, s.len / 2);
      for (let yy = upper0 + FLOOR_H; yy < yTop - 0.6; yy += FLOOR_H) conc.box(mid[0] + s.n[0] * 0.36, yy - 0.12, mid[1] + s.n[1] * 0.36, s.len + 0.3, 0.1, 0.72, { col: lc, rotY: r, uvScale: 3, bottom: true }); } }
  if (fk === 'office2' && b.floors >= 3) { const fc = [0.86, 0.82, 0.74]; const uOff = b.uOff || 0;
    for (const s of street) { const r = rotOf(s);
      for (let m = Math.ceil(uOff * 4); ; m++) { const d = m * BAY - uOff * TW; if (d > s.len - 0.2) break; if (d < 0.2) continue;
        const p = along(s, d); conc.box(p[0] + s.n[0] * 0.3, (upper0 + yTop) / 2, p[1] + s.n[1] * 0.3, 0.16, yTop - upper0 - 0.2, 0.6, { col: fc, rotY: r, uvScale: 3, bottom: true }); } } }

  // ---- rebar-crowned roof columns: the stubs left for a future floor (very common on urban shophouses and walk-ups)
  if (flat && !b.tower && URBAN.has(dstyle) && /^(shop|shop2|shop3|apartment)$/.test(fk) && b.floors <= 5 && rng.chance(0.35)) {
    const rust = [0.36, 0.2, 0.12], cc = [0.62, 0.61, 0.58];
    const xs = [b.x0 + 0.35, b.x1 - 0.35], zs = [b.z0 + 0.35, b.z1 - 0.35]; if (b.x1 - b.x0 > 9) xs.splice(1, 0, (b.x0 + b.x1) / 2); if (b.z1 - b.z0 > 9) zs.splice(1, 0, (b.z0 + b.z1) / 2);
    for (const x of xs) for (const z of zs) { const hh = rng.range(0.25, 0.7); conc.box(x, yTop + hh / 2, z, 0.3, hh, 0.3, { col: cc, uvScale: 2 });
      for (const [ox, oz] of [[-0.09, -0.09], [0.09, 0.09]]) { const lh = rng.range(0.6, 1.1); met.box(x + ox, yTop + hh + lh / 2, z + oz, 0.02, lh, 0.02, { col: rust, top: false, bottom: false }); } }
  }
}
