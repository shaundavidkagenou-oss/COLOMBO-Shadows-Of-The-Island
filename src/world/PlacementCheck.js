// Placement audit: does anything solid stand on a road?
// Tests building footprints, market stalls, garden walls and landmark / special-structure colliders against the carriageway
// (Layout.roadAt — the same strips and junction squares GroundBuilder lays as asphalt) and, for buildings, the pavement
// (cell land minus cell lot). Used by the regression test (tools/placement-test.mjs) and by the developer console
// (`roadcheck`), which runs it on the live plan — including everything moved or added in the map editor.
import * as L from './Layout.js';

// on the pavement strip of a block (between the kerb and the property line), not on the road
export function onPavement(x, z) {
  const c = L.cellAt(x, z); if (!c || L.roadAt(x, z)) return false;
  const [a, b, cc, d] = c.land, [e, f, g, h] = c.lot;
  return x >= a && x <= b && z >= cc && z <= d && !(x > e && x < f && z > g && z < h);
}

// samples a rectangle: the perimeter densely (roads are long strips — any partial overlap crosses the outline) and the
// interior coarsely (a footprint big enough to swallow a whole junction square)
function sampleRect(x0, x1, z0, z1, fn) {
  const e = 0.03; x0 += e; x1 -= e; z0 += e; z1 -= e; if (x1 <= x0 || z1 <= z0) return;
  const st = 0.25;
  for (let x = x0; x <= x1 + 1e-6; x += st) { fn(x, z0); fn(x, z1); }
  for (let z = z0; z <= z1 + 1e-6; z += st) { fn(x0, z); fn(x1, z); }
  for (let x = x0 + 2; x < x1; x += 2) for (let z = z0 + 2; z < z1; z += 2) fn(x, z);
}

function check(kind, ref, r, withPavement) {
  let road = 0, pave = 0, n = 0, at = null;
  sampleRect(r[0], r[1], r[2], r[3], (x, z) => { n++; if (L.roadAt(x, z)) { road++; at ||= [x, z]; } else if (withPavement && onPavement(x, z)) { pave++; at ||= [x, z]; } });
  if (!road && !pave) return null;
  return { kind, ref, rect: r.map((v) => +v.toFixed(2)), road, pave, n, x: +at[0].toFixed(1), z: +at[1].toFixed(1) };
}

// plan: CityPlan.plan (or the editor's live copy); colliders: extra solids to test (World collision list: landmarks,
// fuel stations, Street Customs, gun-shop / club frontages …). Returns a list of problems (empty = clean).
export function auditPlacement(plan, colliders = []) {
  const out = []; const push = (p) => { if (p) out.push(p); };
  for (const b of plan.buildings) push(check('building', { id: b.id, style: b.style, district: b.district, eid: b._eid, added: !!b.uid }, [b.x0, b.x1, b.z0, b.z1], true));
  for (const p of plan.props) if (p.type === 'stall' && p.col) push(check('stall', { seed: p.seed }, [p.col.x0, p.col.x1, p.col.z0, p.col.z1], false));
  for (const w of plan.walls || []) push(check('wall', { h: w.h }, [w.x0, w.x1, w.z0, w.z1], false));
  for (const c of colliders) {
    if (c.kind === 'building' || c.kind === 'stall' || c.kind === 'wall' || c.kind === 'tree' || c.kind === 'pole' || c.kind === 'vehicle') continue;
    if (c.kind !== 'landmark' && !c.fuel && !c.customs) continue;
    if ((c.h || 0) - (c.y0 || 0) < 0.6 || (c.y0 || 0) > 2.2) continue; // kerbs / ramps / slabs you drive over, canopies you drive under
    push(check('landmark', { h: c.h }, [c.x0, c.x1, c.z0, c.z1], false));
  }
  return out;
}

// one map-editor object (building 'b', wall 'w', stall prop 'p'): the problem record, or null when it is clear of the roads
export function checkObject(o, k) {
  if (k === 'b') return check('building', { id: o.id, style: o.style }, [o.x0, o.x1, o.z0, o.z1], true);
  if (k === 'w') return check('wall', { h: o.h }, [o.x0, o.x1, o.z0, o.z1], false);
  if (k === 'p' && o.type === 'stall') { const r = o.col ? [o.col.x0, o.col.x1, o.col.z0, o.col.z1] : [o.x - 1.1, o.x + 1.1, o.z - 1.1, o.z + 1.1]; return check('stall', {}, r, false); }
  return null;
}
// the street a problem point is on (for messages)
export function roadName(x, z) { const r = L.roadAt(x, z); if (!r) return 'the pavement'; if (r.segs) return 'a junction'; return r.name || 'a road'; }
