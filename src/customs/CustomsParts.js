// STREET CUSTOMS — bolt-on body parts, built ON the scanned body (BodyScan.js) of the vehicle that wears them.
//
// Every part is fitted from the vehicle's own surfaces: a splitter follows the real front face line at the real bumper bottom, a
// carbon bonnet / roof is a skin sampled from the real panel 5 mm above it, skirts follow the real sill between the real wheel
// openings, flares ring the real wheel positions, a wing's stands stand on the real boot lid, exhaust tips sit at the real tail
// pipe. Nothing is a generic mesh stretched over a different car. Parts are grouped by material (body paint, carbon, black trim,
// chrome, glass, lamp) into one geometry per material per vehicle look, cached and shared — a fully kitted car adds at most a
// handful of draw calls, never one per part. Paint parts carry pmask = 1 so the vehicle's paint shader colours them with the body.
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const WHITE = [1, 1, 1], CARBON = C('#232427'), BLACK = C('#141416'), TEXT = C('#232427'), CHROME = C('#d4d8dc'), RED = C('#b81c1c'), LENS = [1, 1, 1], DARKG = C('#2c2e31');
const unitBox = new THREE.BoxGeometry(1, 1, 1); const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 14); const unitSph = new THREE.SphereGeometry(1, 12, 8);
const cylZ = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 18); g.rotateX(Math.PI / 2); return g; })();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function part(mb, geo, pos, rot, scale, col) { _m.compose(_v.set(...pos), _q.setFromEuler(new THREE.Euler(...rot)), _s.set(...scale)); mb.geometry(geo, _m, col); }
function tube(mb, a, b, r, col) { _v.set(...a); _w.set(...b); const len = _v.distanceTo(_w); if (len < 1e-4) return; const dir = _w.clone().sub(_v).normalize(); _q.setFromUnitVectors(_up, dir); _m.compose(_v.clone().add(_w).multiplyScalar(0.5), _q, _s.set(r, len, r)); mb.geometry(unitCyl, _m, col); }
function slab(mb, a, b, tx, tz, col) { _v.set(...a); _w.set(...b); const len = _v.distanceTo(_w); if (len < 1e-4) return; const dir = _w.clone().sub(_v).normalize(); _q.setFromUnitVectors(_up, dir); _m.compose(_v.clone().add(_w).multiplyScalar(0.5), _q, _s.set(tx, len, tz)); mb.geometry(unitBox, _m, col); }
const polyline = (mb, pts, r, col) => { for (let i = 1; i < pts.length; i++) tube(mb, pts[i - 1], pts[i], r, col); for (let i = 1; i < pts.length - 1; i++) part(mb, unitSph, pts[i], [0, 0, 0], [r, r, r], col); };

// an indexed grid surface P(i, j) with smooth normals, wound so its normals agree with out(p) (a rough outward direction)
function grid(mb, nu, nv, P, out, col, closedU = false) {
  const pos = []; for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) pos.push(...P(i, j)); const W = nu + 1; const idx = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W; idx.push(a, b, c, a, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const N = g.attributes.normal, Pp = g.attributes.position; let s = 0; const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let k = 0; k < Pp.count; k++) { p.fromBufferAttribute(Pp, k); n.fromBufferAttribute(N, k); s += n.dot(out(p)); }
  if (s < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  mb.geometry(g, new THREE.Matrix4(), col); g.dispose();
}
// a closed loft through sections (each an array of [x, y, z], same length) with end caps; outward = away from each section's centroid
function loft(mb, secs, col, caps = true) {
  const n = secs[0].length, cen = secs.map((s) => s.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n, a[2] + p[2] / n], [0, 0, 0]));
  const ring = secs.map((s) => [...s, s[0]]); // repeat the first point to close the loop
  grid(mb, n, secs.length - 1, (i, j) => ring[j][i], (p) => { let best = 0, bd = 1e9; for (let k = 0; k < cen.length; k++) { const d = Math.abs(cen[k][2] - p.z) + Math.abs(cen[k][0] - p.x) * 0.01; if (d < bd) { bd = d; best = k; } } const c = cen[best]; return new THREE.Vector3(p.x - c[0], p.y - c[1], p.z - c[2]); }, col);
  if (caps) for (const [k, sgn] of [[0, -1], [secs.length - 1, 1]]) { const s = secs[k], c = cen[k]; const ax = new THREE.Vector3(...cen[Math.min(secs.length - 1, k + (sgn < 0 ? 1 : 0))]).sub(new THREE.Vector3(...cen[Math.max(0, k - (sgn > 0 ? 1 : 0))])).normalize().multiplyScalar(sgn);
    grid(mb, n, 1, (i, j) => (j === 0 ? c : s[i % n]), () => ax, col); }
}
const finishPaint = (g) => { if (!g) return g; const n = g.attributes.position.count; g.setAttribute('pmask', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1)); return g; };

// ------------------------------------------------------------------------------------------------ parts
const B = { paint: null, carbon: null, black: null, chrome: null, glass: null, lamp: null };
function frontBumper(S, id, M) {
  const F = S.front; if (!F) return; const y0 = F.y; const w = F.w - 0.04; const n = 16; const xs = Array.from({ length: n + 1 }, (_, i) => -w + (2 * w * i) / n);
  if (id === 'lip' || id === 'race') { const out = id === 'race' ? 0.075 : 0.04, inn = 0.14, t = id === 'race' ? 0.022 : 0.016; const mb = id === 'race' ? M.carbon : M.black;
    const edge = xs.map((x) => F.faceAt(x, y0 + 0.03) - Math.pow(Math.abs(x) / w, 6) * 0.03);
    grid(mb, n, 1, (i, j) => [xs[i], y0 - 0.004 + t * 0, j ? edge[i] + out : edge[i] - inn], () => new THREE.Vector3(0, -1, 0), mb === M.carbon ? CARBON : BLACK); // underside
    grid(mb, n, 1, (i, j) => [xs[i], y0 - 0.004 + t, j ? edge[i] + out : edge[i] - inn], () => new THREE.Vector3(0, 1, 0), mb === M.carbon ? CARBON : BLACK); // top
    grid(mb, n, 1, (i, j) => [xs[i], y0 - 0.004 + t * j, edge[i] + out], () => new THREE.Vector3(0, 0, 1), mb === M.carbon ? CARBON : BLACK); // leading edge
    for (const sx of [-1, 1]) grid(mb, 1, 1, (i, j) => [sx * w, y0 - 0.004 + t * j, i ? edge[sx < 0 ? 0 : n] + out : edge[sx < 0 ? 0 : n] - inn], () => new THREE.Vector3(sx, 0, 0), mb === M.carbon ? CARBON : BLACK);
    if (id === 'race') for (const sx of [-1, 1]) for (const k of [0, 1]) { const x = sx * (w - 0.05 - k * 0.02), y = y0 + 0.1 + k * 0.08; const z = F.faceAt(x, y) + 0.005; part(M.carbon, unitBox, [x, y, z + 0.03], [0.18 - k * 0.1, sx * 0.35, sx * -0.22], [0.12, 0.008, 0.08], CARBON); }
  } else if (id === 'bullbar') { const zf = F.z + 0.12, yt = Math.min(F.top + 0.12, S.hood ? S.hood.y + 0.02 : F.top + 0.12), xb = Math.min(0.42, w * 0.5), r = 0.028;
    polyline(M.black, [[-xb, y0 + 0.12, zf - 0.02], [-xb, yt - 0.06, zf], [-xb + 0.06, yt, zf], [xb - 0.06, yt, zf], [xb, yt - 0.06, zf], [xb, y0 + 0.12, zf - 0.02]], r, BLACK);
    tube(M.black, [-xb, y0 + 0.24, zf - 0.01], [xb, y0 + 0.24, zf - 0.01], r * 0.8, BLACK); for (const sx of [-1, 1]) { tube(M.black, [sx * xb, y0 + 0.14, zf - 0.02], [sx * xb, y0 + 0.14, F.faceAt(sx * xb, y0 + 0.14) - 0.03], r, BLACK); part(M.black, unitBox, [sx * xb, y0 + 0.14, F.faceAt(sx * xb, y0 + 0.14) - 0.01], [0, 0, 0], [0.08, 0.1, 0.03], BLACK); }
  } else if (id === 'steel') { const zf = F.faceAt(0, y0 + 0.1), d0 = zf - 0.05, d1 = zf + 0.13, h0 = y0 - 0.02, h1 = y0 + 0.24, x1 = F.w + 0.03;
    part(M.black, unitBox, [0, (h0 + h1) / 2, (d0 + d1) / 2], [0, 0, 0], [2 * x1, h1 - h0, d1 - d0], TEXT);
    for (const sx of [-1, 1]) part(M.black, unitBox, [sx * (x1 - 0.06), h1 - 0.02, d1 - 0.05], [0, sx * 0.5, 0], [0.16, 0.04, 0.12], TEXT); // chamfered wings
    part(M.chrome, cylZ, [0, y0 + 0.11, d1 + 0.005], [0, 0, Math.PI / 2], [0.07, 0.07, 0.26], DARKG); part(M.chrome, unitBox, [0, y0 + 0.11, d1 + 0.03], [0, 0, 0], [0.34, 0.12, 0.03], DARKG); // winch drum + fairlead plate
    for (const sx of [-1, 1]) { const tg = new THREE.TorusGeometry(0.035, 0.012, 8, 16); part(M.chrome, tg, [sx * 0.42, y0 + 0.06, d1 + 0.02], [0, 0, 0], [1, 1, 1], RED); tg.dispose(); }
  }
}
function rearBumper(S, id, M) {
  const F = S.rear; if (!F) return; const y0 = F.y; const w = F.w - 0.06; const n = 12; const xs = Array.from({ length: n + 1 }, (_, i) => -w + (2 * w * i) / n);
  if (id === 'diffuser' || id === 'racediff') { const race = id === 'racediff'; const mb = race ? M.carbon : M.black, col = race ? CARBON : BLACK; const edge = xs.map((x) => F.faceAt(x, y0 + 0.03)); const dep = 0.3;
    grid(mb, n, 1, (i, j) => [xs[i], y0 - 0.006, j ? edge[i] - 0.02 : edge[i] + dep], () => new THREE.Vector3(0, -1, 0), col); grid(mb, n, 1, (i, j) => [xs[i], y0 + 0.006, j ? edge[i] - 0.02 : edge[i] + dep], () => new THREE.Vector3(0, 1, 0), col);
    const nf = race ? 5 : 4, fh = race ? 0.13 : 0.08; for (let k = 0; k < nf; k++) { const x = -w * 0.7 + (1.4 * w * k) / (nf - 1); const ze = F.faceAt(x, y0 + 0.03); part(mb, unitBox, [x, y0 - fh / 2 + 0.01, ze + 0.1], [0, 0, 0], [0.008, fh, 0.24], col); } }
  else if (id === 'towbar') { const ze = F.faceAt(0, y0 + 0.02); tube(M.black, [0, y0 + 0.04, ze + 0.12], [0, y0 + 0.04, ze - 0.16], 0.03, BLACK); part(M.black, unitBox, [0, y0 + 0.04, ze + 0.12], [0, 0, 0], [0.5, 0.05, 0.05], BLACK);
    tube(M.chrome, [0, y0 + 0.04, ze - 0.15], [0, y0 + 0.1, ze - 0.15], 0.012, CHROME); part(M.chrome, unitSph, [0, y0 + 0.125, ze - 0.15], [0, 0, 0], [0.025, 0.025, 0.025], CHROME); }
  else if (id === 'steel') { const zf = F.faceAt(0, y0 + 0.1), d0 = zf - 0.13, d1 = zf + 0.05, h0 = y0 - 0.02, h1 = y0 + 0.22, x1 = F.w + 0.03; part(M.black, unitBox, [0, (h0 + h1) / 2, (d0 + d1) / 2], [0, 0, 0], [2 * x1, h1 - h0, d1 - d0], TEXT);
    for (const sx of [-1, 1]) { const tg = new THREE.TorusGeometry(0.035, 0.012, 8, 16); part(M.chrome, tg, [sx * 0.42, y0 + 0.06, d0 - 0.02], [0, 0, 0], [1, 1, 1], RED); tg.dispose(); } }
}
function skirts(S, id, M) {
  const Sl = S.sill; if (!Sl) return; const R = S.wheelR; const z0 = S.axles.wr + R * 1.12, z1 = S.axles.wf - R * 1.12; if (z1 - z0 < 0.5) return; const n = 10; const zs = Array.from({ length: n + 1 }, (_, i) => z0 + ((z1 - z0) * i) / n);
  for (const sx of [-1, 1]) {
    if (id === 'street' || id === 'race') { const race = id === 'race'; const mb = race ? M.carbon : M.paint, col = race ? CARBON : WHITE; const yb = Sl.y - (race ? 0.045 : 0.035), yt = Sl.y + (race ? 0.04 : 0.075), out = race ? 0.045 : 0.032;
      const secs = zs.map((z) => { const x = Sl.xAt(z); const xi = x - 0.03; return [[sx * xi, yt, z], [sx * (x + out * 0.4), yt, z], [sx * (x + out), yb + 0.02, z], [sx * (x + out * 0.8), yb, z], [sx * xi, yb, z]]; });
      loft(mb, secs, col); if (race) { const x = Sl.xAt(z0 + 0.05); part(M.carbon, unitBox, [sx * (x + 0.02), Sl.y + 0.06, z0 + 0.04], [0, 0, 0], [0.05, 0.14, 0.012], CARBON); } }
    else if (id === 'tubes') { const x = Math.max(...zs.map((z) => Sl.xAt(z))) + 0.075, y = Sl.y - 0.02; tube(M.chrome, [sx * x, y, z0 + 0.04], [sx * x, y, z1 - 0.04], 0.032, CHROME); for (const z of [z0 + 0.04, z1 - 0.04]) part(M.chrome, unitSph, [sx * x, y, z], [0, 0, 0], [0.032, 0.032, 0.032], CHROME);
      for (const t of [0.15, 0.5, 0.85]) { const z = z0 + (z1 - z0) * t; slab(M.black, [sx * (Sl.xAt(z) - 0.06), y + 0.03, z], [sx * x, y, z], 0.03, 0.05, BLACK); part(M.black, unitBox, [sx * x, y + 0.03, z], [0, 0, 0], [0.07, 0.012, 0.16], TEXT); } }
    else if (id === 'boards') { const xi = Math.max(...zs.map((z) => Sl.xAt(z))) - 0.02, xo = xi + 0.19, y = Sl.y - 0.04; part(M.black, unitBox, [sx * (xi + xo) / 2, y, (z0 + z1) / 2], [0, 0, 0], [xo - xi, 0.03, z1 - z0], TEXT);
      for (let k = 0; k < 6; k++) part(M.black, unitBox, [sx * (xi + xo) / 2, y + 0.017, z0 + 0.1 + ((z1 - z0 - 0.2) * k) / 5], [0, 0, 0], [xo - xi - 0.03, 0.006, 0.05], BLACK);
      for (const t of [0.15, 0.5, 0.85]) { const z = z0 + (z1 - z0) * t; slab(M.black, [sx * (Sl.xAt(z) - 0.08), Sl.y + 0.02, z], [sx * (xi + 0.04), y, z], 0.03, 0.05, BLACK); } }
  }
}
function spoiler(S, id, M) {
  const T = S.tail; if (!T) return; const w = T.w; const n = 14; const xs = Array.from({ length: n + 1 }, (_, i) => -w + (2 * w * i) / n);
  if (!T.roof && (id === 'lip' || id === 'ducktail')) { const L = id === 'ducktail' ? 0.26 : 0.12, H = id === 'ducktail' ? 0.075 : 0.035; const z0 = T.z + 0.02 - L * 0.3; // wedge rising toward the trailing edge, sitting on the lid
    const zE = Math.max(S.zR + 0.035, z0 - L * 0.7); const ys = xs.map((x) => { const v = S.topAt(x, z0); return v > 0 ? v : T.y; }), ye = xs.map((x, i) => { const v = S.topAt(x, zE); return v > 0 ? v : ys[i]; }); // the trailing edge stays on the lid
    const secs = xs.map((x, i) => [[x, ys[i] - 0.01, z0 + L * 0.3], [x, ye[i] + H, zE - 0.015], [x, ye[i] + H * 0.6, zE - 0.03], [x, ye[i] - 0.01, zE]]);
    const tsecs = secs[0].map((_, k) => secs.map((s) => s[k])); void tsecs; loftX(M.paint, secs, WHITE); }
  else if (!T.roof && id === 'wing') { const zc = T.z + 0.02, yb = T.at(0), yw = yb + 0.3, ch = 0.27, sp = Math.min(w + 0.05, S.hw - 0.04);
    const af = [[0, 0], [0.25, 0.028], [0.6, 0.022], [1, 0]]; const secs = [-sp, -sp * 0.5, 0, sp * 0.5, sp].map((x) => [...af.map(([u, t]) => [x, yw + t + u * 0.035, zc + 0.06 - u * ch]), ...af.slice(1, -1).reverse().map(([u, t]) => [x, yw - t * 0.25 + u * 0.035, zc + 0.06 - u * ch])]);
    loftX(M.carbon, secs, CARBON); for (const sx of [-1, 1]) { part(M.carbon, unitBox, [sx * (sp + 0.004), yw + 0.01, zc - 0.07], [0, 0, 0], [0.008, 0.13, 0.33], CARBON); // endplates
      const xs2 = sx * Math.min(0.42, w * 0.55); const yd = S.topAt(xs2, zc - 0.04); slab(M.carbon, [xs2, yd - 0.005, zc - 0.02], [xs2, yw - 0.005, zc - 0.07], 0.012, 0.07, CARBON); part(M.carbon, unitBox, [xs2, yd + 0.004, zc - 0.03], [0, 0, 0], [0.04, 0.012, 0.1], CARBON); } }
  else if (T.roof && (id === 'rooflip' || id === 'roofwing')) { const big = id === 'roofwing'; const z0 = T.z + 0.06, L = big ? 0.3 : 0.16, mb = big ? M.carbon : M.paint, col = big ? CARBON : WHITE;
    const secs = xs.map((x) => { const y = S.topAt(x, z0); return [[x, y - 0.006, z0], [x, y + (big ? 0.03 : 0.012), z0 - L * 0.5], [x, y - 0.01, z0 - L], [x, y - 0.028, z0 - L + 0.02], [x, y - 0.03, z0 - 0.04]]; }); loftX(mb, secs, col);
    if (big) for (const sx of [-1, 1]) { const x = sx * (w - 0.004), y = S.topAt(x, z0); part(M.carbon, unitBox, [x, y - 0.03, z0 - L * 0.55], [0, 0, 0], [0.008, 0.08, L * 0.9], CARBON); } }
}
// a loft across x: sections listed left→right, each a closed polygon in the (y, z) plane; normals away from the section centroid
function loftX(mb, secs, col) { loft(mb, secs, col, true); }
function hood(S, id, M) {
  const H = S.hood; if (!H) return; const zc = H.zc;
  if (id === 'carbon') { const nx = 22, nz = 16, x0 = -H.w, x1 = H.w, z0 = H.z0 + 0.03, z1 = H.z1 - 0.02; grid(M.carbon, nx, nz, (i, j) => { const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz; return [x, S.topAt(x, z) + 0.006, z]; }, () => new THREE.Vector3(0, 1, 0), CARBON); }
  else if (id === 'scoop') { const L = Math.min(0.48, (H.z1 - H.z0) * 0.5), W = Math.min(0.24, H.w * 0.35), z0 = zc - L / 2, z1 = zc + L / 2; const n = 8; const secs = [];
    for (let j = 0; j <= n; j++) { const z = z0 + ((z1 - z0) * j) / n, t = j / n, ht = 0.075 * Math.min(1, t * 1.6) * (t < 0.95 ? 1 : 0.6); const yb = S.topAt(0, z) - 0.005; secs.push([[-W - 0.04, yb, z], [-W, yb + ht * 0.9, z], [0, yb + ht, z], [W, yb + ht * 0.9, z], [W + 0.04, yb, z]]); }
    loftAlongZ(M.paint, secs, WHITE); const yb = S.topAt(0, z1); part(M.black, unitBox, [0, yb + 0.035, z1 + 0.002], [0, 0, 0], [W * 1.85, 0.05, 0.006], BLACK); } // dark mouth
  else if (id === 'vents') { for (const sx of [-1, 1]) { const x = sx * H.w * 0.48, z = zc + 0.05, a = 0.13, b = 0.12; const y = S.topAt(x, z); const slopeZ = (S.topAt(x, z + 0.1) - S.topAt(x, z - 0.1)) / 0.2, slopeX = (S.topAt(x + 0.1, z) - S.topAt(x - 0.1, z)) / 0.2;
    const rot = [-Math.atan(slopeZ), 0, Math.atan(slopeX)]; part(M.black, unitBox, [x, y + 0.004, z], rot, [a * 2, 0.012, b * 2], BLACK); for (let k = 0; k < 5; k++) part(M.black, unitBox, [x, y + 0.013, z - b + 0.03 + k * 0.045], [rot[0] - 0.5, 0, rot[2]], [a * 1.7, 0.004, 0.03], TEXT); } }
}
function loftAlongZ(mb, secs, col) { loft(mb, secs, col, true); }
function fenders(S, id, M) {
  if (!S.arches) return; const wide = id === 'wide'; const mb = wide ? M.paint : M.black, col = wide ? WHITE : TEXT;
  for (const A of S.arches) { const sx = Math.sign(A.x) || 1; const R = A.R, r0 = R + 0.035, r1 = R + (wide ? 0.11 : id === 'flares' ? 0.1 : 0.08), out = wide ? 0.075 : id === 'flares' ? 0.06 : 0.05; const xs = A.side - 0.01;
    const n = 14, a0 = -1.25, a1 = 1.25; const secs = []; for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; const s = Math.sin(a), c = Math.cos(a); const y = A.y, z = A.z; const P = (r, x) => [sx * x, y + c * r, z + s * r];
      secs.push([P(r0, xs - 0.005), P(r0, xs + out), P(r1 - 0.02, xs + out * 0.92), P(r1, xs + 0.005)]); }
    for (const s of secs) for (const p of s) p[1] = Math.max(p[1], (S.sill ? S.sill.y : 0.2) + 0.01);
    loftRing(mb, secs, col); if (!wide && M.chrome) for (let k = 1; k < n; k += 2) { const a = a0 + ((a1 - a0) * k) / n; const rr = (r0 + r1) / 2; part(M.chrome, unitCyl, [sx * (xs + out * 0.96 + 0.003), A.y + Math.cos(a) * rr, A.z + Math.sin(a) * rr], [0, 0, Math.PI / 2], [0.008, 0.006, 0.008], CHROME); } }
}
function loftRing(mb, secs, col) { loft(mb, secs, col, true); }
function roof(S, id, M, P) {
  if (P.kind === 'tuk') { const y = S.H + 0.02, z0 = -0.5, z1 = 0.5, x = 0.42; for (const sx of [-1, 1]) { tube(M.chrome, [sx * x, y + 0.08, z0], [sx * x, y + 0.08, z1], 0.012, CHROME); for (const z of [z0 + 0.05, z1 - 0.05]) tube(M.chrome, [sx * x, y - 0.02, z], [sx * x, y + 0.08, z], 0.01, CHROME); } for (let k = 0; k < 4; k++) tube(M.chrome, [-x, y + 0.08, z0 + (k * (z1 - z0)) / 3], [x, y + 0.08, z0 + (k * (z1 - z0)) / 3], 0.01, CHROME); return; }
  const Rf = S.roof; if (!Rf) return; const rails = (h = 0.05) => { const x = Math.max(0.3, Rf.w - 0.07); for (const sx of [-1, 1]) { const za = Rf.z0 + 0.08, zb = Rf.z1 - 0.08; const ya = Rf.at(sx * x, za), yb = Rf.at(sx * x, zb); tube(M.black, [sx * x, ya + h, za], [sx * x, yb + h, zb], 0.014, BLACK); for (const t of [0, 1]) { const z = t ? zb : za, y = t ? yb : ya; part(M.black, unitBox, [sx * x, y + h / 2, z], [0, 0, 0], [0.03, h + 0.01, 0.06], BLACK); } } return x; };
  if (id === 'carbon') { const nx = 16, nz = 16, x0 = -(Rf.w - 0.05), x1 = Rf.w - 0.05, z0 = Rf.z0 + 0.06, z1 = Rf.z1 - 0.06; grid(M.carbon, nx, nz, (i, j) => { const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz; return [x, Rf.at(x, z) + 0.005, z]; }, () => new THREE.Vector3(0, 1, 0), CARBON); }
  else if (id === 'rack' && P.klass !== 'van') rails();
  else if (id === 'box') { const x = rails(); const za = Rf.z0 + 0.15, zb = Math.min(Rf.z1 - 0.1, za + 1.5); const yb = Math.max(Rf.at(0, za), Rf.at(0, zb)) + 0.065; const L = zb - za;
    for (const t of [0.25, 0.75]) tube(M.black, [-x, yb - 0.01, za + L * t], [x, yb - 0.01, za + L * t], 0.012, BLACK);
    const secs = []; const n = 10; for (let j = 0; j <= n; j++) { const t = j / n, z = za + L * t, sh = Math.sin(Math.PI * Math.min(1, Math.max(0, t * 1.15 - 0.05))) ** 0.35, hw = 0.36 * (0.75 + 0.25 * sh), hh = 0.3 * (0.35 + 0.65 * sh); secs.push([[-hw, yb, z], [-hw, yb + hh * 0.7, z], [-hw * 0.7, yb + hh, z], [hw * 0.7, yb + hh, z], [hw, yb + hh * 0.7, z], [hw, yb, z]]); }
    loftAlongZ(M.black, secs, DARKG); }
  else if (id === 'rack' || id === 'ladder') { const x = Math.max(0.3, Rf.w - 0.05), za = Rf.z0 + 0.06, zb = Rf.z1 - 0.06, yr = Math.max(Rf.at(0, za), Rf.at(0, zb)) + 0.09; for (const sx of [-1, 1]) { tube(M.black, [sx * x, yr, za], [sx * x, yr, zb], 0.016, BLACK); for (let k = 0; k <= 3; k++) { const z = za + ((zb - za) * k) / 3; tube(M.black, [sx * x, Rf.at(sx * x, z), z], [sx * x, yr, z], 0.014, BLACK); } }
    for (let k = 0; k <= 6; k++) { const z = za + ((zb - za) * k) / 6; tube(M.black, [-x, yr, z], [x, yr, z], 0.012, BLACK); } if (id === 'ladder') for (const z of [za + 0.1, zb - 0.1]) part(M.black, cylZ, [0, yr + 0.04, z], [0, Math.PI / 2, 0], [0.035, 0.035, x * 1.6], TEXT); }
  else if (id === 'rollbar' && S.bed) { const zb = S.bed.z0 - 0.18, yr = S.bed.rail, x = S.hw - 0.12, top = yr + 0.42; polyline(M.chrome, [[-x, yr, zb], [-x, top - 0.08, zb], [-x + 0.1, top, zb], [x - 0.1, top, zb], [x, top - 0.08, zb], [x, yr, zb]], 0.03, CHROME); for (const sx of [-1, 1]) tube(M.chrome, [sx * x, top - 0.12, zb], [sx * x, yr, zb - 0.45], 0.026, CHROME); }
  else if (id === 'deflector') { const za = Rf.z0 + 0.05, zb = Rf.z1 - 0.05, x = Rf.w - 0.04; const secs = []; const n = 6; for (let j = 0; j <= n; j++) { const t = j / n, z = zb - (zb - za) * t, y = Rf.at(0, z), h = 0.02 + 0.42 * t * t; secs.push([[-x, y, z], [-x * 0.96, y + h, z], [x * 0.96, y + h, z], [x, y, z]]); } loftAlongZ(M.paint, secs, WHITE); }
}
function mudflaps(S, M, P) {
  const wheels = P.kind === 'tuk' ? S.wheels.filter((w) => !w.front) : S.wheels; for (const w of wheels) { const sx = Math.sign(w.x) || 1; const R = S.wheelR; const hw = (P.kind === 'tuk' ? 0.08 : 0.12); const z = w.z - R - 0.06; const yt = w.y + R * 0.45, yb = Math.max(0.09, w.y - R * 0.55);
    part(M.black, unitBox, [w.x, (yt + yb) / 2, z], [0.04, 0, 0], [hw * 2 + 0.03, yt - yb, 0.012], TEXT); }
}
function bike(S, slot, id, M) {
  if (slot === 'screen' && S.screen) { const s = S.screen; const tall = id === 'tall'; const w = (s.x1 - s.x0) / 2 + (tall ? 0.01 : 0.02); const n = 8; const y0 = s.y0 + (tall ? (s.y1 - s.y0) * 0.55 : 0), y1 = s.y1 + (tall ? 0.15 : 0.035); const zb = s.z0, zt = s.z1;
    grid(M.glass, n, 6, (i, j) => { const u = i / n * 2 - 1, v = j / 6; const y = y0 + (y1 - y0) * v; const zz = (tall ? zt + 0.008 : zt + 0.012) - (zt - zb) * (v * (tall ? 0.8 : 1)) + 0.03 * (1 - u * u) - (tall ? 0 : 0.02 * Math.sin(Math.PI * v) * (1 - Math.abs(u))); return [u * w * (1 - 0.2 * v), y + (tall ? 0 : 0.012 * Math.sin(Math.PI * Math.abs(u)) * v), zz]; }, () => new THREE.Vector3(0, 0.4, 1), WHITE); }
  else if (slot === 'cowl' && S.pillion) { const p = S.pillion; const z0 = p.z - 0.17, z1 = p.z + 0.15, yb = p.top - 0.01; const n = 8; const secs = []; for (let j = 0; j <= n; j++) { const t = j / n, z = z0 + (z1 - z0) * t, h = 0.11 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.6 + 0.01, hw = 0.11 + 0.03 * Math.sin(Math.PI * t); secs.push([[-hw, yb, z], [-hw * 0.9, yb + h * 0.7, z], [0, yb + h, z], [hw * 0.9, yb + h * 0.7, z], [hw, yb, z]]); } loftAlongZ(M.paint, secs, WHITE); }
  else if (slot === 'sliders' && S.engine) { const e = S.engine; for (const sx of [-1, 1]) { const x = sx * (Math.max(Math.abs(e.x0), Math.abs(e.x1)) + 0.03); part(M.black, unitCyl, [x, e.y1 - 0.06, e.z1 - 0.08], [0, 0, Math.PI / 2], [0.028, 0.06, 0.028], BLACK); part(M.chrome, unitCyl, [x - sx * 0.04, e.y1 - 0.06, e.z1 - 0.08], [0, 0, Math.PI / 2], [0.008, 0.04, 0.008], CHROME); } }
  else if (slot === 'crashbars' && S.engine) { const e = S.engine; const xo = Math.max(Math.abs(e.x0), Math.abs(e.x1)) + 0.07; for (const sx of [-1, 1]) polyline(M.black, [[sx * (xo - 0.06), e.y1 + 0.02, e.z1 - 0.02], [sx * xo, e.y1 - 0.02, e.z1 + 0.04], [sx * xo, e.y0 + 0.08, e.z1 + 0.05], [sx * (xo - 0.05), e.y0 + 0.02, e.z1 - 0.04], [sx * (xo - 0.07), e.y0 + 0.02, (e.z0 + e.z1) / 2]], 0.013, BLACK); }
  else if (slot === 'aux' && S.engine) { const e = S.engine; for (const sx of [-1, 1]) { const p = [sx * 0.15, e.y1 - 0.02, e.z1 + 0.1]; part(M.black, cylZ, p, [0, 0, 0], [0.032, 0.032, 0.06], BLACK); part(M.lamp, cylZ, [p[0], p[1], p[2] + 0.031], [0, 0, 0], [0.027, 0.027, 0.004], LENS); } }
}
function exhaust(S, id, M, P) {
  const E = S.exhaust; if (!E || id === 'stock') return null; const [ex, ey, ez] = E.p; const ti = (x, y, z, r, len, col, mb = M.chrome, dir = [0, 0, -1]) => { const d = new THREE.Vector3(...dir).normalize(); const a = [x - d.x * len, y - d.y * len, z - d.z * len]; tube(mb, a, [x, y, z], r, col); tube(M.black, [x - d.x * 0.003, y - d.y * 0.003, z - d.z * 0.003], [x + d.x * 0.001, y + d.y * 0.001, z + d.z * 0.001], r * 0.82, BLACK); };
  const burnt = (k) => [C('#c9a46a'), C('#6a5ab8'), C('#3a6ac8')][k % 3];
  if (P.kind === 'bike') { const d = new THREE.Vector3(...E.d).normalize(); const len = id === 'full' ? 0.26 : 0.36, r = id === 'full' ? 0.048 : 0.055; const tip = [ex + d.x * 0.02, ey + d.y * 0.02, ez + d.z * 0.02]; const a = [tip[0] - d.x * len, tip[1] - d.y * len, tip[2] - d.z * len];
    const mb = id === 'carbon' ? M.carbon : M.chrome, col = id === 'carbon' ? CARBON : id === 'titanium' || id === 'full' ? C('#9aa0b0') : CHROME; tube(mb, a, tip, r, col); part(M.chrome, unitSph, a, [0, 0, 0], [r * 0.9, r * 0.9, r * 0.9], col); tube(M.black, tip, [tip[0] + d.x * 0.004, tip[1] + d.y * 0.004, tip[2] + d.z * 0.004], r * 0.6, BLACK);
    if (id === 'titanium' || id === 'full') tube(M.chrome, [tip[0] - d.x * 0.06, tip[1] - d.y * 0.06, tip[2] - d.z * 0.06], tip, r * 1.03, burnt(1)); return tip; }
  const y = ey, z = ez - 0.01; const sx = Math.sign(ex) || 1, xx = Math.abs(ex);
  switch (id) {
    case 'sport': ti(ex, y, z, 0.05, 0.16, CHROME); break;
    case 'twin': ti(sx * (xx - 0.06), y, z, 0.038, 0.16, CHROME); ti(sx * (xx + 0.04), y, z, 0.038, 0.16, CHROME); break;
    case 'quad': for (const s of [-1, 1]) { ti(s * (xx - 0.05), y, z, 0.036, 0.16, CHROME); ti(s * (xx + 0.04), y, z, 0.036, 0.16, CHROME); } break;
    case 'titanium': for (const k of [0, 1]) { const x = sx * (xx - 0.05 + k * 0.1); ti(x, y, z, 0.04, 0.17, burnt(k + 1)); tube(M.chrome, [x, y, z - 0.03], [x, y, z], 0.0412, burnt(k)); } break;
    case 'straight': for (const s of [-1, 1]) { ti(s * 0.12, y + 0.01, z, 0.055, 0.2, C('#a8acb4')); } break;
    case 'stack': { tube(M.chrome, [ex, y, z + 0.1], [ex, y, z - 0.04], 0.04, CHROME); part(M.chrome, unitSph, [ex, y, z - 0.04], [0, 0, 0], [0.04, 0.04, 0.04], CHROME); ti(ex, y + 0.08, z - 0.06, 0.04, 0.09, CHROME, M.chrome, [0, 1, -0.4]); return [ex, y + 0.08, z - 0.06]; }
    default: ti(ex, y, z, 0.045, 0.15, CHROME);
  }
  return id === 'straight' ? [0.12, y + 0.01, z] : [ex, y, z];
}
function aux(S, id, M) {
  if (id === 'bar' && S.roof) { const Rf = S.roof, z = Rf.z1 - 0.12, w = Math.min(0.55, Rf.w - 0.08), y = Rf.at(0, z) + 0.09; part(M.black, unitBox, [0, y, z], [0, 0, 0], [w * 2, 0.07, 0.08], BLACK); part(M.lamp, unitBox, [0, y, z + 0.041], [0, 0, 0], [w * 2 - 0.03, 0.045, 0.004], LENS);
    for (const sx of [-1, 1]) slab(M.black, [sx * (w - 0.08), Rf.at(sx * (w - 0.08), z) - 0.005, z], [sx * (w - 0.08), y - 0.03, z], 0.025, 0.04, BLACK); }
  else if (id === 'spots' && S.front) { const F = S.front; for (const sx of [-1, 1]) { const x = sx * Math.min(0.5, F.w * 0.62), y = F.top + 0.06, z = F.faceAt(x, F.top) + 0.07; part(M.black, cylZ, [x, y, z], [0, 0, 0], [0.075, 0.075, 0.09], BLACK); part(M.lamp, cylZ, [x, y, z + 0.046], [0, 0, 0], [0.066, 0.066, 0.004], LENS); slab(M.black, [x, F.top - 0.005, z - 0.04], [x, y - 0.06, z - 0.01], 0.03, 0.03, BLACK); } }
}
function guard(S, M) { const F = S.front; const z = (F ? F.z : S.zF) + 0.08, y0 = 0.3, y1 = 0.62, x = 0.22; polyline(M.chrome, [[-x, y0, z - 0.05], [-x, y1, z], [x, y1, z], [x, y0, z - 0.05]], 0.016, CHROME); tube(M.chrome, [-x, (y0 + y1) / 2, z - 0.02], [x, (y0 + y1) / 2, z - 0.02], 0.014, CHROME); }
function bedcover(S, M) { const b = S.bed; if (!b) return; const z0 = Math.max(b.z0, b.z1), z1 = Math.min(b.z0, b.z1), x = S.hw - 0.09; part(M.black, unitBox, [0, b.rail + 0.012, (z0 + z1) / 2], [0, 0, 0], [x * 2, 0.022, Math.abs(z0 - z1) - 0.03], TEXT); }

// ------------------------------------------------------------------------------------------------ build
const EXT = ['frontBumper', 'rearBumper', 'skirts', 'spoiler', 'hood', 'fenders', 'roof', 'mudflaps', 'screen', 'cowl', 'sliders', 'crashbars', 'guard', 'exhaust', 'aux', 'bedcover'];
const cache = new Map();
// geometry per material for this look + these parts (cached; the same kit on two cars of the same look shares the buffers)
export function buildParts(S, P, mods) {
  const sel = EXT.map((k) => (mods[k] && mods[k] !== 'stock' && mods[k] !== 'none' ? k + '=' + mods[k] : '')).filter(Boolean).join('|'); const key = S.key + '#' + sel; if (cache.has(key)) return cache.get(key);
  const M = { paint: new MeshBuilder(), carbon: new MeshBuilder(), black: new MeshBuilder(), chrome: new MeshBuilder(), glass: new MeshBuilder(), lamp: new MeshBuilder() };
  const m = (k) => mods[k] && mods[k] !== 'stock' && mods[k] !== 'none' ? mods[k] : null; let tip = null;
  if (P.kind === 'bike') { for (const k of ['screen', 'cowl', 'sliders', 'crashbars', 'aux']) if (m(k)) bike(S, k, m(k), M); }
  else {
    if (m('frontBumper')) frontBumper(S, m('frontBumper'), M); if (m('rearBumper')) rearBumper(S, m('rearBumper'), M); if (m('skirts')) skirts(S, m('skirts'), M);
    if (m('spoiler')) spoiler(S, m('spoiler'), M); if (m('hood')) hood(S, m('hood'), M); if (m('fenders')) fenders(S, m('fenders'), M); if (m('roof')) roof(S, m('roof'), M, P);
    if (m('mudflaps')) mudflaps(S, M, P); if (m('guard')) guard(S, M); if (m('aux')) aux(S, m('aux'), M); if (m('bedcover')) bedcover(S, M);
  }
  if (m('exhaust')) tip = exhaust(S, m('exhaust'), M, P);
  const out = { tip }; for (const k in M) { const g = M[k].build(); out[k] = k === 'paint' ? finishPaint(g) : g; }
  cache.set(key, out); return out;
}
export function partsCacheSize() { return cache.size; }
