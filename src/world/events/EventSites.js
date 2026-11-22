// 81st request — DYNAMIC CITY EVENTS: where an event can be set up. Each venue is a search area in a real open space of the
// map (Galle Face Green, Viharamahadevi Park, the Town Hall lawns, the Museum grounds, the Beira Lake front). At first use the
// finder looks for a level rectangle of the template's size that is free of roads, water, buildings, colliders, trees, plants,
// street props and walk-graph paths (so no pedestrian route is cut by the event fence), with a walk-graph node close to the
// front edge for the entrance. The site's front edge (entrance, local −z) is turned toward that node; the stage / back is +z.
// Results are cached per venue+template; a venue with no room for a template is simply not used for it.
import * as L from '../Layout.js';
import { plan } from '../CityPlan.js';

export const VENUES = {
  gfgN: { name: 'Galle Face Green (north lawn)', short: 'Galle Face Green', area: [-596, -420, -650, -520], pref: [-505, -585] },
  gfgS: { name: 'Galle Face Green (south lawn)', short: 'Galle Face Green', area: [-596, -420, -400, -250], pref: [-505, -320] },
  vmp: { name: 'Viharamahadevi Park', short: 'Viharamahadevi Park', area: [0, 185, -165, 35], pref: [100, -40] },
  townhall: { name: 'Town Hall lawn', short: 'Town Hall, Cinnamon Gardens', area: [190, 300, -100, 40], pref: [245, -60] },
  museum: { name: 'National Museum grounds', short: 'National Museum', area: [-8, 188, 42, 178], pref: [90, 70] },
  beira: { name: 'Beira Lake promenade (Seema Malaka)', short: 'Beira Lake, Seema Malaka', area: [-170, -40, -360, -250], pref: [-112, -300] },
};
let IDX = null;
function index() { // trees / plants / props in 16 m buckets (built once)
  if (IDX) return IDX; const S = 16, m = new Map(); const add = (o, r) => { const k = Math.floor(o.x / S) * 4096 + Math.floor(o.z / S); let a = m.get(k); if (!a) m.set(k, (a = [])); a.push([o.x, o.z, r]); };
  for (const t of plan.trees) add(t, 3.2 * (t.s || 1)); for (const p of plan.plants || []) add(p, 1.2); for (const p of plan.props) add(p, 0.9); IDX = { S, m }; return IDX;
}
function thingsNear(x0, z0, x1, z1) { const I = index(); for (let i = Math.floor((x0 - 4) / I.S); i <= Math.floor((x1 + 4) / I.S); i++) for (let j = Math.floor((z0 - 4) / I.S); j <= Math.floor((z1 + 4) / I.S); j++) { const a = I.m.get(i * 4096 + j); if (!a) continue; for (const [x, z, r] of a) if (x + r > x0 && x - r < x1 && z + r > z0 && z - r < z1) return true; } return false; }
let EDGE = null;
function edgesIndex() { if (EDGE) return EDGE; const S = 20, m = new Map(); for (const e of L.pedEdges) { const a = L.pedNodes[e.a], b = L.pedNodes[e.b]; if (!a || !b) continue; const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  for (let i = Math.floor(x0 / S); i <= Math.floor(x1 / S); i++) for (let j = Math.floor(z0 / S); j <= Math.floor(z1 / S); j++) { const k = i * 4096 + j; let L2 = m.get(k); if (!L2) m.set(k, (L2 = [])); L2.push(e); } } EDGE = { S, m }; return EDGE; }
function segHitsRect(ax, az, bx, bz, x0, z0, x1, z1) { // Liang–Barsky
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az; const p = [-dx, dx, -dz, dz], q = [ax - x0, x1 - ax, az - z0, z1 - az];
  for (let i = 0; i < 4; i++) { if (p[i] === 0) { if (q[i] < 0) return false; continue; } const r = q[i] / p[i]; if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } } return true; }
function edgesCross(x0, z0, x1, z1) { const E = edgesIndex(); const seen = new Set(); for (let i = Math.floor(x0 / E.S); i <= Math.floor(x1 / E.S); i++) for (let j = Math.floor(z0 / E.S); j <= Math.floor(z1 / E.S); j++) { const a = E.m.get(i * 4096 + j); if (!a) continue;
  for (const e of a) { if (seen.has(e)) continue; seen.add(e); const A = L.pedNodes[e.a], B = L.pedNodes[e.b]; if (segHitsRect(A.x, A.z, B.x, B.z, x0, z0, x1, z1)) return true; } } return false; }
// is the rectangle clear for an event site?
export function rectClear(col, x0, z0, x1, z1, opts = {}) {
  const m = 0.6; for (const c of col.query(x0 - m, z0 - m, x1 + m, z1 + m)) { if (c.event) continue; const top = (c.y0 || 0) + c.h; if (top < 0.25 && c.kind !== 'building') continue; if (c.x1 > x0 - m && c.x0 < x1 + m && c.z1 > z0 - m && c.z0 < z1 + m) return false; }
  if (thingsNear(x0 - 1.5, z0 - 1.5, x1 + 1.5, z1 + 1.5)) return false; if (!opts.allowEdges && edgesCross(x0 - 1, z0 - 1, x1 + 1, z1 + 1)) return false;
  let lo = 1e9, hi = -1e9; for (let x = x0; x <= x1 + 0.01; x += 2) for (let z = z0; z <= z1 + 0.01; z += 2) { if (L.isWater(x, z) || L.roadAt(x, z)) return false; const g = col.groundAt(x, z, 2); if (g < lo) lo = g; if (g > hi) hi = g; }
  if (hi - lo > (opts.slope ?? 0.7)) return false; return { lo, hi };
}
// local (site) → world: yaw ∈ {0, π/2, π, 3π/2}; local +z (back) maps to (sin yaw, cos yaw)
export function toWorld(site, lx, lz) { const c = Math.cos(site.yaw), s = Math.sin(site.yaw); return { x: site.x + lx * c + lz * s, z: site.z - lx * s + lz * c }; }
export function toLocal(site, x, z) { const c = Math.cos(site.yaw), s = Math.sin(site.yaw); const dx = x - site.x, dz = z - site.z; return { x: dx * c - dz * s, z: dx * s + dz * c }; }
export function worldRect(site, x0, z0, x1, z1) { const a = toWorld(site, x0, z0), b = toWorld(site, x1, z1); return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) }; }
const CACHE = new Map();
// find a W × D site for venue v. Returns { x, z, yaw, W, D, base, entry: {x, z}, node } or null
export function findSite(col, venueId, W, D, nodeOk = null) {
  const key = `${venueId}|${W}x${D}`; if (CACHE.has(key)) return CACHE.get(key); const v = VENUES[venueId]; if (!v) return null;
  const [ax0, ax1, az0, az1] = v.area; let best = null;
  for (const rot of [0, 1]) { const ww = rot ? D : W, dd = rot ? W : D;
    for (let z = az0 + dd / 2 + 1; z <= az1 - dd / 2 - 1; z += 3) for (let x = ax0 + ww / 2 + 1; x <= ax1 - ww / 2 - 1; x += 3) {
      const sc = Math.hypot(x - v.pref[0], z - v.pref[1]); if (best && sc >= best.sc) continue;
      const r = rectClear(col, x - ww / 2, z - dd / 2, x + ww / 2, z + dd / 2); if (!r) continue;
      // entrance: the front edge facing the nearest walk node that can be reached in a straight, clear line
      let pick = null; for (let k = 0; k < 2; k++) { const yaw = (rot ? Math.PI / 2 : 0) + k * Math.PI; const s = { x, z, yaw }; const e = toWorld(s, 0, -D / 2 - 1.2);
        for (const n of L.pedNodes) { const d = Math.hypot(n.x - e.x, n.z - e.z); if (d > 28 || (pick && d >= pick.d)) continue; if (nodeOk && !nodeOk(n)) continue; if (L.roadAt(n.x, n.z)) continue; if (!lineFree(col, e.x, e.z, n.x, n.z)) continue; pick = { d, yaw, e, n }; } }
      if (!pick) continue; best = { sc, x, z, yaw: pick.yaw, W, D, base: r.lo, entry: pick.e, node: pick.n.id, venue: venueId };
    } }
  CACHE.set(key, best); return best;
}
export function lineFree(col, ax, az, bx, bz, r = 0.3) { const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.5)); for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (col.blocked(x, z, r) || L.isWater(x, z)) return false; } return true; }
export function clearSiteCache() { CACHE.clear(); }
