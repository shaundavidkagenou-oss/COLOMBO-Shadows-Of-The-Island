// COLOMBO CUSTOMS — wheels, tyres, calipers.
//
// Rims are real geometry built per design (spokes, barrel, lip, hub, nuts, cap, brake disc), in the same hub space as the stock
// wheels (axle = x, outer face toward +x; VehicleModels mirrors the left-side holders). They replace the geometry of the meshes
// already in each wheel (lo holder [tyre, rim], hi group [tyre, rim]) — no extra meshes or draw calls. Geometry is cached per
// design + size and shared by every vehicle that wears it.
// Colour: vertices baked in the pure-white KEY colour are the paintable wheel face; one material per customised vehicle
// ('cw-rim' program, shared) gives them the chosen colour and finish (painted, chrome, brushed with a machined lathe sheen,
// matte); discs, nuts, caps and valve stems keep their own colours. Calipers use the same program with their own colour.
// Tyres: the same lathe profile family as the stock tyres (VehicleDetail.hiWheelParts), with the sidewall height following the
// rim size (+1 / +2 inch = a taller rim inside the SAME rolling radius, so ride height and physics radius never change), and
// the tread pattern chosen by kind (road / sport / semi-slick / all-terrain / mud-terrain); mud-terrains add moulded lugs.
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { tyreMaterial } from '../vehicles/TyreMaterial.js';

const V2 = (x, y) => new THREE.Vector2(x, y); const KEY = [1, 1, 1];
const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const unitBox = new THREE.BoxGeometry(1, 1, 1); const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 10);
const discX = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 24); g.rotateZ(Math.PI / 2); return g; })();
const discXlo = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 12); g.rotateZ(Math.PI / 2); return g; })();
const hexX = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 6); g.rotateZ(Math.PI / 2); return g; })();
const ringXg = (seg) => { const g = new THREE.TorusGeometry(1, 0.12, 6, seg); g.rotateY(Math.PI / 2); return g; };
const ringX = ringXg(32), ringXlo = ringXg(16);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function part(mb, geo, pos, rot, scale, col) { _m.compose(_v.set(...pos), _q.setFromEuler(new THREE.Euler(...rot)), _s.set(...scale)); mb.geometry(geo, _m, col); }
function beam(mb, a, b, tx, tz, col, geo = unitBox) { _v.set(...a); _w.set(...b); const len = _v.distanceTo(_w); const dir = _w.clone().sub(_v).normalize(); _q.setFromUnitVectors(_up, dir); _m.compose(_v.clone().add(_w).multiplyScalar(0.5), _q, _s.set(tx, len, tz)); mb.geometry(geo, _m, col); }
const lathe = (mb, pts, seg, col) => { const g = new THREE.LatheGeometry(pts, seg); g.rotateZ(-Math.PI / 2); mb.geometry(g, new THREE.Matrix4(), col); g.dispose(); };
const pol = (r, a, x) => [x, Math.sin(a) * r, Math.cos(a) * r];

const cache = new Map();
// rim geometry: design id, wheel radius R, width w, rim fraction ri (rim radius / R), kind 'car' | 'heavy' | 'bike', front (bikes:
// disc vs sprocket side), hi (detail level)
export function rimGeometry(design, R, w, ri, kind, front, hi) {
  const key = [design, R.toFixed(3), w.toFixed(3), ri, kind, kind === 'bike' ? +front : '', +hi].join(':'); let g = cache.get(key); if (g) return g;
  const mb = new MeshBuilder(); const h = w / 2, rr = R * ri; const seg = hi ? 40 : 18; const disc = hi ? discX : discXlo, ring = hi ? ringX : ringXlo;
  const dk = C('#2a2c2f'), nut = C('#c9ccd0'), steel = C('#6e7276');
  // barrel (inside), outer lip; the face sits at x ≈ 0.55 h
  lathe(mb, [V2(rr * 0.96, h * 0.86), V2(rr, h * 0.8), V2(rr * 0.97, h * 0.52), V2(rr * 0.9, h * 0.25), V2(rr * 0.9, -h * 0.62), V2(rr, -h * 0.82)], seg, KEY);
  part(mb, ring, [h * 0.84, 0, 0], [0, 0, 0], [0.15, rr * 0.99, rr * 0.99], KEY);
  if (kind === 'bike') {
    const hub = (r0, wd) => part(mb, disc, [0, 0, 0], [0, 0, 0], [wd, r0, r0], KEY);
    const spokes = (n, pair, x0, x1, wd, dp) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; for (const o of pair) beam(mb, pol(R * 0.13, a, x0), pol(rr * 0.94, a + o, x1), dp, wd, KEY); } };
    if (design === 'laced') { hub(R * 0.16, h * 1.1); for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2, s = i % 2 ? 1 : -1; beam(mb, pol(R * 0.14, a, s * h * 0.45), pol(rr * 0.9, a + 0.25 * s, 0), 0.004, 0.004, C('#d0d4d8'), unitCyl); } }
    else if (design === 'cast3') { hub(R * 0.13, h * 1.4); spokes(3, [-0.2, 0.2], 0, 0, R * 0.045, h * 0.42); }
    else if (design === 'cast5') { hub(R * 0.14, h * 1.3); spokes(5, [-0.14, 0.14], 0, 0, R * 0.04, h * 0.45); }
    else { hub(R * 0.12, h * 1.4); for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; const m = pol(rr * 0.55, a, 0); beam(mb, pol(R * 0.11, a, 0), m, h * 0.36, R * 0.04, KEY); for (const o of [-0.12, 0.12]) beam(mb, m, pol(rr * 0.94, a + o, 0), h * 0.3, R * 0.028, KEY); } } // forged Y
    // brakes / drive: front twin (sport) or single disc, rear disc + sprocket
    const discs = (x, rd) => { part(mb, disc, [x, 0, 0], [0, 0, 0], [0.005, rd, rd], C('#9a9ea4')); part(mb, disc, [x, 0, 0], [0, 0, 0], [0.007, rd * 0.62, rd * 0.62], dk); if (hi) for (let i = 0; i < 8; i++) part(mb, disc, pol(rd * 0.63, (i / 8) * Math.PI * 2, x), [0, 0, 0], [0.01, rd * 0.045, rd * 0.045], nut); };
    if (front) { if (design === 'forged7' || design === 'cast3') { discs(h + 0.008, rr * 0.68); discs(-(h + 0.008), rr * 0.68); } else discs(h + 0.006, rr * 0.62); }
    else { discs(-(h + 0.006), rr * 0.46); const sg = new THREE.CylinderGeometry(1, 1, 1, hi ? 80 : 30, 1); sg.rotateZ(Math.PI / 2); part(mb, sg, [h + 0.01, 0, 0], [0, 0, 0], [0.006, 0.105, 0.105], C('#55585c')); sg.dispose(); part(mb, disc, [h + 0.012, 0, 0], [0, 0, 0], [0.004, 0.06, 0.06], dk); }
  } else {
    const heavy = kind === 'heavy'; const fx = h * 0.56; const hubR = R * 0.17; const nl = heavy ? 10 : 5;
    const spoke = (a0, a1, r0, r1, x0, x1, wd, dp, col = KEY) => beam(mb, pol(r0, a0, x0), pol(r1, a1, x1), dp, wd, col);
    const face = (pts) => lathe(mb, pts, seg, KEY); let capX = fx + h * 0.04;
    switch (design) {
      case 'split5': for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; for (const o of [-0.1, 0.1]) spoke(a, a + o, hubR, rr * 0.93, fx, fx - h * 0.06, R * 0.05, h * 0.16); } break;
      case 'mesh': for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; spoke(a, a + 0.32, hubR, rr * 0.93, fx, fx - h * 0.04, R * 0.028, h * 0.12); spoke(a, a - 0.32, hubR, rr * 0.93, fx - h * 0.02, fx - h * 0.06, R * 0.028, h * 0.12); }
        if (hi) for (let i = 0; i < 24; i++) part(mb, hexX, pol(rr * 0.95, (i / 24) * Math.PI * 2, h * 0.86), [0, 0, 0], [0.01, R * 0.012, R * 0.012], nut); break; // two-piece rim bolts
      case 'multi10': for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; spoke(a, a, hubR, rr * 0.93, fx, fx - h * 0.05, R * 0.042, h * 0.15); } break;
      case 'dish': { const fx2 = h * 0.08; lathe(mb, [V2(rr * 0.99, h * 0.84), V2(rr * 0.8, h * 0.8), V2(rr * 0.76, h * 0.55), V2(rr * 0.74, fx2)], seg, KEY); // deep polished lip stepping down to the face
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; spoke(a, a, hubR, rr * 0.76, fx2 + h * 0.06, fx2, R * 0.1, h * 0.14); } capX = fx2 + h * 0.1;
        if (hi) for (let i = 0; i < 18; i++) part(mb, hexX, pol(rr * 0.9, (i / 18) * Math.PI * 2, h * 0.83), [0, 0, 0], [0.01, R * 0.012, R * 0.012], nut); break; }
      case 'turbine': for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; let pr = hubR, pa = a; for (let k = 1; k <= 3; k++) { const r = hubR + (rr * 0.93 - hubR) * k / 3, an = a + 0.16 * k * k / 3; spoke(pa, an, pr, r, fx - h * 0.02 * (k - 1), fx - h * 0.02 * k, R * 0.05, h * 0.12); pr = r; pa = an; } } break;
      case 'y6': for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; spoke(a, a, hubR, rr * 0.55, fx, fx - h * 0.03, R * 0.07, h * 0.16); for (const o of [-0.2, 0.2]) spoke(a, a + o, rr * 0.55, rr * 0.93, fx - h * 0.03, fx - h * 0.07, R * 0.045, h * 0.14); } break;
      case 'mono7': for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; for (const o of [-0.045, 0.045]) spoke(a + o * 0.6, a + o * 2.2, hubR, rr * 0.93, fx + h * 0.06, fx - h * 0.16, R * 0.045, h * 0.13); } break; // concave forged
      case 'beadlock': face([V2(hubR, fx), V2(rr * 0.5, fx - h * 0.04), V2(rr * 0.88, fx - h * 0.1)]);
        for (let i = 0; i < 8; i++) { const a = (i / 8 + 1 / 16) * Math.PI * 2; part(mb, disc, pol(rr * 0.62, a, fx - h * 0.02), [0, 0, 0], [h * 0.2, R * 0.075, R * 0.075], dk); }
        part(mb, ring, [h * 0.9, 0, 0], [0, 0, 0], [0.13, rr * 0.97, rr * 0.97], KEY); if (hi) for (let i = 0; i < 24; i++) part(mb, hexX, pol(rr * 0.97, (i / 24) * Math.PI * 2, h * 0.98), [0, 0, 0], [0.012, R * 0.014, R * 0.014], nut); break;
      case 'steelie': case 'trucker': { const holes = design === 'trucker' ? 10 : 8; face([V2(0.001, fx), V2(hubR * 1.3, fx + h * 0.02), V2(hubR * 1.6, fx - h * 0.12), V2(rr * 0.78, fx - h * 0.06), V2(rr * 0.92, fx - h * 0.3)]);
        for (let i = 0; i < holes; i++) { const a = (i / holes) * Math.PI * 2; part(mb, unitBox, pol(rr * 0.6, a, fx - h * 0.04), [-a, 0, 0], [h * 0.1, R * 0.07, R * 0.12], dk); } capX = fx + h * 0.06; break; }
      default: for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; spoke(a, a, hubR, rr * 0.93, fx, fx - h * 0.05, R * 0.08, h * 0.16); }
    }
    part(mb, disc, [fx - h * 0.02, 0, 0], [0, 0, 0], [h * 0.12, hubR * 1.1, hubR * 1.1], KEY); // hub face
    for (let i = 0; i < nl; i++) { const a = (i / nl) * Math.PI * 2 + Math.PI / nl; part(mb, hexX, pol(R * (heavy ? 0.15 : 0.11), a, capX), [a, 0, 0], [0.022, R * 0.022, R * 0.022], nut); }
    part(mb, disc, [capX + 0.004, 0, 0], [0, 0, 0], [0.012, R * 0.07, R * 0.07], C('#1c1e22')); if (hi) part(mb, disc, [capX + 0.01, 0, 0], [0, 0, 0], [0.004, R * 0.048, R * 0.048], nut); // centre cap
    if (hi) beam(mb, [h * 0.5, rr * 0.86, 0.04], [h * 0.64, rr * 0.86, 0.04], 0.008, 0.008, C('#222'), unitCyl); // valve stem
    part(mb, disc, [-h * 0.05, 0, 0], [0, 0, 0], [0.025, rr * 0.84, rr * 0.84], steel); part(mb, ring, [-h * 0.05, 0, 0], [0, 0, 0], [0.2, rr * 0.5, rr * 0.5], dk); // brake disc + hat
  }
  g = mb.build(); g.computeBoundingSphere(); cache.set(key, g); return g;
}

// tyre geometry: radius R, width w, rim fraction ri, tread kind, bike, hi
export function tyreGeometry(R, w, ri, kind, bike, hi) {
  const key = ['ty', R.toFixed(3), w.toFixed(3), ri, kind, +bike, +hi].join(':'); let g = cache.get(key); if (g) return g;
  const h = w / 2, gd = R * 0.012; const sw = (f) => R * (ri + (1 - ri) * f); let prof;
  if (bike) prof = [V2(sw(0), h * 0.9), V2(sw(0.5), h * 1.05), V2(sw(0.85), h * 0.85), V2(R, h * 0.4), V2(R, -h * 0.4), V2(sw(0.85), -h * 0.85), V2(sw(0.5), -h * 1.05), V2(sw(0), -h * 0.9)];
  else { const sq = kind === 'at' || kind === 'mt'; prof = [V2(sw(0), h * 0.92), V2(sw(0.41), h * 1.02), V2(sw(0.7), h * 1.0), V2(sw(sq ? 0.93 : 0.9), h * (sq ? 0.97 : 0.88)), V2(R - gd, h * (sq ? 0.8 : 0.66))];
    const grooves = hi ? (kind === 'semi' ? [0.3, -0.3] : sq ? [] : [0.36, 0, -0.36]) : [];
    for (const gq of grooves) { const y = gq * h; prof.push(V2(R - gd, y + h * 0.07), V2(R - gd * (kind === 'semi' ? 2 : 3.5), y + h * 0.05), V2(R - gd * (kind === 'semi' ? 2 : 3.5), y - h * 0.05), V2(R - gd, y - h * 0.07)); }
    prof.push(V2(R - gd, -h * (sq ? 0.8 : 0.66)), V2(sw(sq ? 0.93 : 0.9), -h * (sq ? 0.97 : 0.88)), V2(sw(0.7), -h * 1.0), V2(sw(0.41), -h * 1.02), V2(sw(0), -h * 0.92)); }
  const tl = new THREE.LatheGeometry(prof, hi ? (bike ? 40 : 56) : 28); tl.rotateZ(-Math.PI / 2); const tb = new MeshBuilder(); tb.geometry(tl, new THREE.Matrix4(), [1, 1, 1]); tl.dispose();
  if (hi && !bike && (kind === 'mt' || kind === 'at')) { const nb = kind === 'mt' ? 22 : 30; const bw = (2 * Math.PI * R) / nb * (kind === 'mt' ? 0.5 : 0.45); const dp = kind === 'mt' ? gd * 4 : gd * 2.6; // moulded lugs, staggered, wrapping onto the shoulders
    for (let i = 0; i < nb; i++) { const a = (i / nb) * Math.PI * 2; for (const s of [-1, 1]) { const ia = a + (s > 0 ? 0 : Math.PI / nb); const off = s * h * 0.5; part(tb, unitBox, [off, Math.sin(ia) * (R - gd * 0.2), Math.cos(ia) * (R - gd * 0.2)], [Math.PI / 2 - ia, 0, 0], [h * 0.5, dp, bw], [1, 1, 1]);
      if (kind === 'mt') part(tb, unitBox, [s * h * 0.98, Math.sin(ia) * (R - gd * 2.5), Math.cos(ia) * (R - gd * 2.5)], [Math.PI / 2 - ia, 0, 0], [h * 0.14, dp * 1.4, bw * 0.8], [1, 1, 1]); } } }
  else if (hi && !bike && kind !== 'semi') { const nb = 36; const bw = (2 * Math.PI * R) / nb * 0.55; for (let i = 0; i < nb; i++) { const a = (i / nb) * Math.PI * 2; for (const s of [-1, 1]) { const ia = a + (s > 0 ? 0 : Math.PI / nb); part(tb, unitBox, [s * h * 0.55, Math.sin(ia) * (R - gd * 0.4), Math.cos(ia) * (R - gd * 0.4)], [Math.PI / 2 - ia, 0, 0], [h * 0.42, gd * 2.2, bw], [1, 1, 1]); } } }
  g = tb.build(); g.computeBoundingBox(); g.computeBoundingSphere(); cache.set(key, g); return g;
}
export const TREAD = { stock: 0, sport: 0, semi: 3, at: 1, mt: 2 };
export function tyreMat(geo, kind) { return tyreMaterial(geo, TREAD[kind] || 0); }

// caliper (does not spin): a performance caliper sized by the brake level, KEY coloured, mounted at the trailing top of the disc
export function caliperGeometry(R, w, ri, level, kind) {
  const key = ['cal', R.toFixed(3), w.toFixed(3), ri, level, kind].join(':'); let g = cache.get(key); if (g) return g; const h = w / 2, rr = R * ri; const mb = new MeshBuilder();
  const s = [1, 1, 1.12, 1.25, 1.35][level] || 1; const y = rr * 0.6, z = -rr * 0.33, t = 0.5;
  part(mb, unitBox, [-h * 0.02, y, z], [t, 0, 0], [0.075 * s, R * 0.15 * s, R * 0.36 * s], KEY);
  part(mb, unitBox, [h * 0.035, y + 0.004, z], [t, 0, 0], [0.008, R * 0.05, R * 0.2 * s], C('#f2f2f0')); // the white bridge plate a painted caliper carries (no lettering)
  g = mb.build(); g.computeBoundingSphere(); cache.set(key, g); return g;
}

// per-vehicle wheel material ('cw-rim' program): KEY vertices take uniform colour + finish
export const RIM_FINISH = { paint: [0.35, 0.32, 0], chrome: [1.0, 0.05, 0], brushed: [0.95, 0.26, 1], matte: [0.25, 0.78, 0] };
export function makeRimMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35, envMapIntensity: 1.15, side: THREE.DoubleSide });
  const U = { cwC: { value: new THREE.Color(0xc9ccd0) }, cwF: { value: new THREE.Vector4(0.35, 0.32, 0, 0) } }; m.userData.cw = U;
  m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCwP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCwP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCwP; uniform vec3 cwC; uniform vec4 cwF;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat cwKey = step(0.985, min(vColor.r, min(vColor.g, vColor.b))); float cwR = length(vCwP.yz); float cwL = (0.5 + 0.5 * sin(cwR * 1400.0)) * (1.0 - smoothstep(0.6, 2.5, fwidth(cwR) * 1400.0)) * cwF.z;\ndiffuseColor.rgb = mix(diffuseColor.rgb, cwC * (0.94 + 0.06 * cwL), cwKey);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.42, cwF.y + 0.08 * cwL, cwKey);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(0.7, cwF.x, cwKey);'); };
  m.customProgramCacheKey = () => 'cw-rim'; m.name = 'cw-rim'; return m;
}
export function setRimMaterial(m, hex, finish) { const U = m.userData.cw; U.cwC.value.set(hex || '#c9ccd0'); const f = RIM_FINISH[finish] || RIM_FINISH.paint; U.cwF.value.set(f[0], f[1], f[2], 0); if (finish === 'chrome') U.cwC.value.lerp(new THREE.Color(1, 1, 1), 0.55); }
export function wheelsWarmMesh() { const g = new THREE.BoxGeometry(0.1, 0.1, 0.1); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3)); const m = new THREE.Mesh(g, makeRimMaterial()); m.name = 'cw-warm'; return m; }
