// STREET CUSTOMS — reads a vehicle's actual body so bolt-on parts sit ON it (not floating, not buried).
//
// Every customisable vehicle (procedural or real GLB body) is scanned once per type + body variant from its own baked geometry, in
// vehicle space (origin on the ground under the centre, +z forward, +x = the vehicle's left). Triangles are splatted into four
// height fields — like a z-buffer seen from above, from the side, from the front and from behind:
//   top(x, z)   highest body / glass point            → bonnet and roof skins, scoops, racks, spoilers
//   side(z, y)  widest |x|                             → skirts, steps, arch flares, side decals
//   front(x, y) furthest forward z, rear(x, y) furthest back z → splitters, bull bars, diffusers, tow bars
// From the fields it derives the features a part needs (bumper bottoms, sills between the wheels, the windscreen base, the roof
// panel, a boot lid or a tailgate, wheel arches). A feature it cannot find is simply absent and the parts that need it are not
// offered for that vehicle (CustomsCatalog slot rules read `features`). Two-wheelers report their screen, pillion seat, engine
// block and exhaust can instead.
import * as THREE from 'three';
import { VTYPES, ensureCustomModel } from '../vehicles/VehicleModels.js';

const CELL = 0.035; const cache = new Map();
const TOPS = new Set(['paint', 'glass', 'chrome', 'rubber', 'canvas', 'carbon', 'livery', 'police', 'amb']);
const SIDES = new Set(['paint', 'chrome', 'rubber', 'canvas', 'carbon', 'livery']);
const ENDS = new Set(['paint', 'chrome', 'rubber', 'vlight', 'vtail', 'plate', 'carbon', 'livery', 'lens']);

class Field { // a 2-D max field over (a, b) with cell CELL
  constructor(a0, a1, b0, b1, fill) { this.a0 = a0; this.b0 = b0; this.na = Math.max(2, Math.ceil((a1 - a0) / CELL) + 1); this.nb = Math.max(2, Math.ceil((b1 - b0) / CELL) + 1); this.v = new Float32Array(this.na * this.nb).fill(fill); this.fill = fill; }
  idx(a, b) { const i = Math.round((a - this.a0) / CELL), j = Math.round((b - this.b0) / CELL); return i < 0 || j < 0 || i >= this.na || j >= this.nb ? -1 : j * this.na + i; }
  max(a, b, val) { const k = this.idx(a, b); if (k >= 0 && val > this.v[k]) this.v[k] = val; }
  min(a, b, val) { const k = this.idx(a, b); if (k >= 0 && val < this.v[k]) this.v[k] = val; }
  // sample with a small neighbourhood (cells the splat missed between sparse vertices of big flat triangles)
  get(a, b, r = 1, op = Math.max) { const i0 = Math.round((a - this.a0) / CELL), j0 = Math.round((b - this.b0) / CELL); let out = this.fill;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= this.na || j >= this.nb) continue; const v = this.v[j * this.na + i]; if (v !== this.fill) out = out === this.fill ? v : op(out, v); } return out; }
}
// splat every triangle at ~cell spacing (barycentric grid): big flat panels are covered, not just their corners
function splat(geo, visit) {
  const P = geo.attributes.position; if (!P) return; const I = geo.index ? geo.index.array : null; const n = I ? I.length : P.count; const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(); const pa = P.array;
  for (let t = 0; t < n; t += 3) { const ia = I ? I[t] : t, ib = I ? I[t + 1] : t + 1, ic = I ? I[t + 2] : t + 2; A.set(pa[ia * 3], pa[ia * 3 + 1], pa[ia * 3 + 2]); B.set(pa[ib * 3], pa[ib * 3 + 1], pa[ib * 3 + 2]); Cc.set(pa[ic * 3], pa[ic * 3 + 1], pa[ic * 3 + 2]);
    const L = Math.max(A.distanceTo(B), B.distanceTo(Cc), Cc.distanceTo(A)); const s = Math.min(60, Math.max(1, Math.ceil(L / CELL)));
    for (let i = 0; i <= s; i++) for (let j = 0; j <= s - i; j++) { const u = i / s, v = j / s, w = 1 - u - v; visit(A.x * w + B.x * u + Cc.x * v, A.y * w + B.y * u + Cc.y * v, A.z * w + B.z * u + Cc.z * v); } }
}
const bboxOf = (geo) => { if (!geo) return null; if (!geo.boundingBox) geo.computeBoundingBox(); return geo.boundingBox; };

export function scanVehicle(mesh) {
  const ud = mesh.userData; const key = ud.type + '|' + (ud.variant ?? 0); if (cache.has(key)) return cache.get(key);
  // the look's pristine cached buffers (never the live meshes: a dented panel, an open door or a shot-out window must not end up in
  // the cached scan); same names as ud.bodyMeshes / ud.detail
  const T = VTYPES[ud.type] || null; const K = ensureCustomModel(ud.type, ud.variant ?? 0); const geos = [...K.geos, ...K.dgeos];
  const body = {}; for (const [n, g] of K.geos) if (!body[n]) body[n] = { geometry: g }; const dnames = new Set(K.dgeos.map(([n]) => n));
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [n, g] of geos) { if (!TOPS.has(n) && !ENDS.has(n)) continue; const bb = bboxOf(g); if (!bb || bb.isEmpty()) continue; x0 = Math.min(x0, bb.min.x); x1 = Math.max(x1, bb.max.x); y1 = Math.max(y1, bb.max.y); z0 = Math.min(z0, bb.min.z); z1 = Math.max(z1, bb.max.z); }
  const hw = Math.max(-x0, x1); const top = new Field(-hw, hw, z0, z1, -1), side = new Field(z0, z1, 0, y1, -1), front = new Field(-hw, hw, 0, y1, -99), rear = new Field(-hw, hw, 0, y1, 99), bot = new Field(-hw, hw, z0, z1, 99);
  for (const [n, g] of geos) { const t = TOPS.has(n), s = SIDES.has(n), e = ENDS.has(n); if (!t && !s && !e) continue;
    splat(g, (x, y, z) => { if (t) top.max(x, z, y); if (s) { side.max(z, y, Math.abs(x)); if (n === 'paint') bot.min(x, z, y); } if (e) { front.max(x, y, z); rear.min(x, y, z); } }); }
  rear.get = function (a, b, r = 1) { const i0 = Math.round((a - this.a0) / CELL), j0 = Math.round((b - this.b0) / CELL); let out = null; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= this.na || j >= this.nb) continue; const v = this.v[j * this.na + i]; if (v !== 99) out = out === null ? v : Math.min(out, v); } return out === null ? 99 : out; };
  bot.get = function (a, b, r = 1) { const i0 = Math.round((a - this.a0) / CELL), j0 = Math.round((b - this.b0) / CELL); let out = 99; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= this.na || j >= this.nb) continue; out = Math.min(out, this.v[j * this.na + i]); } return out; };
  const S = { key, type: ud.type, hw, zF: z1, zR: z0, H: y1, topAt: (x, z) => { let v = top.get(x, z, 2); for (let k = 1; v < 0 && k <= 12; k++) v = top.get(x * (1 - k / 12), z, 2); return v; }, /* off the panel edge: walk in toward the centreline */ sideAt: (z, y) => side.get(z, y, 2), frontAt: (x, y) => front.get(x, y, 2), rearAt: (x, y) => rear.get(x, y, 2), botAt: (x, z) => bot.get(x, z, 2) };
  const bike = !!(T && T.entry === 'bike');
  const wheels = (ud.wheels || []).map((w) => ({ x: w.position.x, y: w.userData.baseY ?? w.position.y, z: w.position.z, front: w.userData.front }));
  S.wheels = wheels; const R = wheels.length ? Math.max(...wheels.map((w) => w.y)) : 0.3; S.wheelR = R;
  S.glass = !!body.glass; S.chrome = !!(body.chrome && body.chrome.geometry.attributes.position.count > 12); S.dash = !!body.dash || dnames.has('dash'); S.cabin = !!body.interior; S.plates = !!body.plate; S.tails = !!body.vtail;
  const fz = wheels.filter((w) => w.front).map((w) => w.z), rz = wheels.filter((w) => !w.front).map((w) => w.z); const wf = fz.length ? Math.max(...fz) : z1 * 0.6, wr = rz.length ? Math.min(...rz) : z0 * 0.6;
  S.axles = { wf, wr };
  if (bike) { // two-wheelers: screen, pillion, engine block, exhaust can
    const gb = body.glass ? bboxOf(body.glass.geometry) : null; S.screen = gb && !gb.isEmpty() && gb.max.z > 0.2 ? { x0: gb.min.x, x1: gb.max.x, y0: gb.min.y, y1: gb.max.y, z0: gb.min.z, z1: gb.max.z } : null;
    const seats = ud.seats || []; S.pillion = seats.length > 1 ? { x: seats[1].x || 0, y: seats[1].y, z: seats[1].z } : null; if (S.pillion) S.pillion.top = S.topAt(0, S.pillion.z);
    let eb = null; for (const [n, g] of geos) if (n === 'engine') { const bb = bboxOf(g); if (bb && !bb.isEmpty()) eb = eb ? eb.clone().union(bb) : bb.clone(); }
    S.engine = eb ? { x0: eb.min.x, x1: eb.max.x, y0: eb.min.y, y1: eb.max.y, z0: eb.min.z, z1: eb.max.z } : null;
    S.exhaust = ud.exhaust ? { p: ud.exhaust.p.slice(), d: ud.exhaust.d.slice() } : null; S.bike = true;
    cache.set(key, S); return S;
  }
  // ---- cars / vans / trucks / three-wheelers
  // sill: the lowest painted underside between the axles, and the body's half-width just above it
  { const zm0 = wr + R * 1.2, zm1 = wf - R * 1.2; if (zm1 - zm0 > 0.6) { let yb = 99; for (let z = zm0; z <= zm1; z += 0.1) yb = Math.min(yb, S.botAt(hw * 0.85, z), S.botAt(-hw * 0.85, z));
      if (yb < 99 && yb < R * 2.2) { const xs = []; for (let z = zm0; z <= zm1; z += 0.1) { const x = S.sideAt(z, yb + 0.07); if (x > 0) xs.push(x); } if (xs.length > 3) S.sill = { y: yb, x: xs.reduce((a, b) => a + b, 0) / xs.length, xAt: (z) => Math.max(0.3, S.sideAt(z, yb + 0.07)), z0: zm0, z1: zm1 }; } } }
  // bumpers: the bottom of the front / rear faces and the face line at that height
  const endFace = (front) => { const at = front ? S.frontAt : S.rearAt; const lim = front ? z1 - 0.3 : z0 + 0.3; let yb = null;
    for (let y = 0.05; y < Math.min(1.4, y1); y += CELL) { let hit = 0; for (let x = -hw * 0.6; x <= hw * 0.6; x += 0.1) { const z = at(x, y); if (front ? z > lim : z < lim) hit++; } if (hit >= 5) { yb = y; break; } }
    if (yb == null) return null; const yf = yb + 0.04; const xs = []; let w = 0; for (let x = 0; x <= hw; x += 0.03) { const z = at(x, yf); if (front ? z > lim - 0.15 : z < lim + 0.15) w = x; }
    if (w < 0.4) return null; const faceAt = (x, y = yf) => { const z = at(Math.max(-w, Math.min(w, x)), y); return Math.abs(z) > 50 ? (front ? z1 : z0) : z; };
    let ytop = yf; for (let y = yf; y < Math.min(y1, yf + 0.9); y += CELL) { const z = at(0, y); if (front ? z > lim - 0.1 : z < lim + 0.1) ytop = y; else break; }
    const zc = faceAt(0); if (front ? zc < z1 - 0.5 : zc > z0 + 0.5) return null; // a face mid-body (flatbed cab back) is not a bumper
    return { y: yb, w, z: faceAt(0), faceAt, top: ytop };
  };
  S.front = endFace(true); S.rear = endFace(false);
  // glass: windscreen base (front-most glass low point) and the rear screen
  let ws = null; if (body.glass) { const P = body.glass.geometry.attributes.position; let zmax = -9, ymin = 9; for (let i = 0; i < P.count; i++) { const z = P.getZ(i), y = P.getY(i); if (Math.abs(P.getX(i)) < hw * 0.4 && z > zmax - 0.05 && y > R * 1.4) { if (z > zmax) { zmax = z; ymin = y; } else ymin = Math.min(ymin, y); } } if (zmax > -9) ws = { z: zmax, y: ymin }; }
  // belt line: bottom of the side windows (two-tone split for a contrast roof / upper half)
  if (body.glass) { const P = body.glass.geometry.attributes.position; let yb = 9; for (let i = 0; i < P.count; i++) if (Math.abs(P.getX(i)) > hw * 0.7 && P.getY(i) > R * 1.3) yb = Math.min(yb, P.getY(i)); if (yb < 9) S.belt = yb; }
  // roof: the flat top panel above the glass
  { let ymax = -1, zA = null, zB = null; for (let z = z0; z <= z1; z += CELL) { const y = S.topAt(0, z); if (y > ymax) ymax = y; }
    for (let z = z0; z <= z1; z += CELL) { const y = S.topAt(0, z); if (y > ymax - 0.07) { if (zA === null) zA = z; zB = z; } }
    if (zA !== null && zB - zA > 0.5 && ymax > R * 2.4) { let w = 0; const zc = (zA + zB) / 2; for (let x = 0; x <= hw; x += 0.02) if (S.topAt(x, zc) > ymax - 0.08) w = x; S.roof = { y: ymax, z0: zA, z1: zB, w, zc, at: (x, z) => S.topAt(x, z) }; } }
  // bonnet: from the windscreen base forward, above the lamps; a cab-over (van / truck) has none worth a part
  if (ws && S.front && S.roof) { const zA = S.front.z - 0.1, zB = ws.z - 0.06; if (zA - zB > 0.55) { let w = 0; const zc = (zA + zB) / 2, yc = S.topAt(0, zc); for (let x = 0; x <= hw; x += 0.02) if (S.topAt(x, zc) > yc - 0.12) w = x; if (w > 0.35 && yc < S.roof.y - 0.3) S.hood = { z0: zB, z1: zA, w: w - 0.04, zc, y: yc, at: (x, z) => S.topAt(x, z) }; } }
  // tail: a boot lid (deck spoiler) or a tall tailgate (roof spoiler)
  if (S.roof && S.rear) { const zt = z0 + 0.18, yt = S.topAt(0, zt); if (yt > 0 && yt < S.roof.y - 0.3 && S.roof.z0 - z0 > 0.6) { let w = 0; for (let x = 0; x <= hw; x += 0.02) if (S.topAt(x, zt) > yt - 0.07) w = x; S.tail = { roof: false, z: zt, y: yt, w: Math.max(0.4, w - 0.05), at: (x) => S.topAt(x, zt) }; }
    else S.tail = { roof: true, z: S.roof.z0 + 0.04, y: S.roof.y, w: Math.max(0.4, S.roof.w - 0.04) }; }
  // wheel arches: body side just above each wheel (what a flare sits against)
  if (wheels.length >= 3) S.arches = wheels.map((w) => ({ ...w, R: (T && T.wheelR) || R, side: Math.max(Math.abs(w.x) + 0.05, S.sideAt(w.z, w.y + R * 0.95) > 0 ? S.sideAt(w.z, w.y + R * 0.95) : Math.abs(w.x) + 0.08) }));
  S.exhaust = ud.exhaust ? { p: ud.exhaust.p.slice(), d: ud.exhaust.d.slice() } : null;
  if (T && T.body && T.body.bed) S.bed = { ...T.body.bed };
  cache.set(key, S); return S;
}
export function scanCacheSize() { return cache.size; }
