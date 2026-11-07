// Viharamahadevi Park features (static meshes; the layout data lives in Parks.js so colliders, paths, grass and trees
// agree): the great seated golden Buddha on its stepped white plinth facing the Town Hall, with flower altars and brass
// oil lamps; the lily ponds (stone rims, water lilies and pads) and their little arched bridges; the fenced children's
// play area with the displayed Jet Provost trainer; the Cenotaph war memorial at the western end; the iron railing round
// the park, and the paintings the artists hang on it along the pavement by day.
import * as THREE from 'three';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { LAND_Y } from './Layout.js';
import { PARK, PONDS, POND_WATER_Y, POND_RIM_Y, BUDDHA, PLAY, PLAY_ITEMS, CENOTAPH, RAILINGS, ALTARS, JET_LIFT, JET_BASES, bridgeY, inPoly, polyDist } from './Parks.js';
import { buddhaGeometry, lotusThroneGeometry, BUDDHA_SEAT_H } from './BuddhaStatue.js';
import BUDDHA_DATA from './buddhaData.js';
import { labelMaterial } from './Landmarks.js';
import { RNG } from '../core/rng.js';

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), P3 = new THREE.Vector3(), EU = new THREE.Euler();
const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => M4.compose(P3.set(x, y, z), Q.setFromEuler(EU.set(rx, ry, rz, 'YXZ')), S3.set(sx, sy, sz)).clone();
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10), SPH = new THREE.SphereGeometry(1, 12, 8), TOR = new THREE.TorusGeometry(1, 0.08, 6, 20);
// a rod from a to b (radius r) into builder b
function rod(b, a, c, r, col, geo = CYL) { const d = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]); const l = d.length(); Q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  b.geometry(geo, M4.compose(P3.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2), Q, S3.set(r, l, r)).clone(), col); }
// local → world for objects with a position and yaw
const place = (x0, z0, yaw) => (lx, lz) => [x0 + lx * Math.cos(yaw) + lz * Math.sin(yaw), z0 - lx * Math.sin(yaw) + lz * Math.cos(yaw)];

export function buildParkFeatures(MAT) {
  const group = new THREE.Group(); group.name = 'parkFeatures';
  const mb = new MultiBuilder(); const anim = {};
  const W = [0.93, 0.92, 0.89], GRANITE = [0.74, 0.73, 0.7];

  // ------------------------------------------------------------------ the golden Buddha (east end, facing the Town Hall)
  {
    const { x, z, steps, rise, ped } = BUDDHA; const top = LAND_Y + steps.length * rise;
    steps.forEach((e, i) => mb.get('concrete').box(x, LAND_Y + (i + 1) * rise / 2, z, e * 2, (i + 1) * rise, e * 2, { col: i % 3 === 2 ? [0.95, 0.94, 0.91] : W, uvScale: 2 }));
    const c = mb.get('concrete');
    c.box(x, top + 0.1, z, ped * 2 + 0.2, 0.2, ped * 2 + 0.2, { col: W, uvScale: 2 });                              // base moulding
    c.box(x, top + 0.8, z, ped * 2, 1.4, ped * 2, { col: [0.97, 0.96, 0.93], uvScale: 2 });                          // die
    c.box(x, top + 1.53, z, ped * 2 + 0.24, 0.14, ped * 2 + 0.24, { col: W, uvScale: 2 });                           // cornice
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { // recessed panels with a lotus-band frieze on each face
      const px = x + nx * (ped + 0.005), pz = z + nz * (ped + 0.005); mb.get('paint').box(px, top + 0.82, pz, nz ? ped * 1.5 : 0.02, 0.9, nx ? ped * 1.5 : 0.02, { col: [0.86, 0.85, 0.8] });
      for (let k = -5; k <= 5; k++) { const o = k * ped * 0.13; mb.get('paint').geometry(SPH, mat4(px + nx * 0.01 + (nz ? o : 0), top + 1.36, pz + nz * 0.01 + (nx ? o : 0), 0, 0, 0, nz ? 0.12 : 0.04, 0.08, nx ? 0.12 : 0.04), [0.82, 0.7, 0.42]); } }
    // gold: metal reflecting the sky by day; by night the floodlights in front light the faces turned toward them
    const gold = new THREE.MeshStandardMaterial({ color: 0xe2ae4a, metalness: 1, roughness: 0.3 });
    const flood = { uFlood: { value: 0 }, uFloodDirV: { value: new THREE.Vector3(0, 1, 0) } };
    gold.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, flood);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFlood; uniform vec3 uFloodDirV;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.95, 0.56, 0.14) * uFlood * pow(max(dot(normal, uFloodDirV), 0.0), 1.4);'); };
    gold.customProgramCacheKey = () => 'buddhaGold';
    const statue = new THREE.Group(); statue.position.set(x, top + 1.6, z); statue.rotation.y = Math.PI / 2; // faces +x: the Town Hall
    const throne = new THREE.Mesh(lotusThroneGeometry(), gold); throne.castShadow = true; throne.receiveShadow = true; statue.add(throne);
    const lod = new THREE.LOD();
    for (const [lv, d] of [['hi', 0], ['lo', 70]]) { const m = new THREE.Mesh(buddhaGeometry(BUDDHA_DATA, lv), gold); m.position.y = BUDDHA_SEAT_H; m.castShadow = true; m.receiveShadow = true; lod.addLevel(m, d); }
    statue.add(lod); group.add(statue); anim.statue = statue; anim.statueLod = lod;
    const flDir = new THREE.Vector3(0.85, 0.42, 0).normalize(); // floodlights stand on the lawn in front, aimed up at the image
    anim.flood = (camera, night) => { flood.uFlood.value = night * 0.55; flood.uFloodDirV.value.copy(flDir).transformDirection(camera.matrixWorldInverse); };
    for (const dz of [-4.5, 4.5]) { mb.get('metal').box(x + 8.2, LAND_Y + 0.25, z + dz, 0.4, 0.5, 0.5, { col: [0.25, 0.26, 0.27] }); } // floodlight housings
    // flower altars (mal asana) with white frangipani, pink lotus and jasmine, and a brass oil lamp (pahana) on each
    const rng = new RNG(1958); anim.flames = [];
    for (const a of ALTARS) { const y0 = LAND_Y + 3 * rise;
      c.box(a.x, y0 + a.h - 0.04, a.z, a.hx * 2 + 0.06, 0.08, a.hz * 2 + 0.06, { col: [0.62, 0.6, 0.58] }); c.box(a.x, y0 + (a.h - 0.08) / 2, a.z, a.hx * 2 - 0.1, a.h - 0.08, a.hz * 2 - 0.2, { col: [0.55, 0.53, 0.5] });
      for (let k = 0; k < 26; k++) { const fx = a.x + rng.range(-a.hx + 0.06, a.hx - 0.06), fz = a.z + rng.range(-a.hz + 0.1, a.hz - 0.35), t = rng.next();
        mb.get('paint').geometry(SPH, mat4(fx, y0 + a.h + 0.02, fz, 0, 0, 0, 0.045, 0.02, 0.045), t < 0.55 ? [0.97, 0.95, 0.86] : t < 0.8 ? [0.96, 0.62, 0.72] : [1, 1, 0.97]);
        if (t < 0.55) mb.get('paint').geometry(SPH, mat4(fx, y0 + a.h + 0.035, fz, 0, 0, 0, 0.014, 0.008, 0.014), [0.98, 0.8, 0.25]); }
      const lx = a.x, lz = a.z + a.hz - 0.18, ly = y0 + a.h; // brass lamp: foot, stem, bowl
      mb.get('metal').cylinder(lx, ly, lz, 0.07, 0.04, 0.05, 12, { col: [0.85, 0.62, 0.28] }); mb.get('metal').cylinder(lx, ly + 0.05, lz, 0.02, 0.02, 0.12, 8, { col: [0.85, 0.62, 0.28] });
      mb.get('metal').cylinder(lx, ly + 0.17, lz, 0.03, 0.08, 0.04, 12, { col: [0.85, 0.62, 0.28] });
      anim.flames.push([lx, ly + 0.235, lz]); }
    // footwear notice at the foot of the steps (English / Sinhala / Tamil)
    const sx = x + 8.3, sz = z + 3.1; for (const o of [-0.45, 0.45]) mb.get('metal').cylinder(sx, LAND_Y, sz + o, 0.03, 0.03, 1.1, 8, { col: [0.2, 0.2, 0.2] });
    const sm = labelMaterial([{ text: 'PLEASE REMOVE FOOTWEAR', font: '700 54px "Barlow Condensed", sans-serif', color: '#2a2a2a' }, { text: 'පාවහන් ගලවන්න', font: '600 52px "Noto Sans Sinhala", sans-serif', color: '#2a2a2a' }, { text: 'காலணிகளை கழற்றவும்', font: '600 46px "Noto Sans Tamil", sans-serif', color: '#2a2a2a' }], { w: 640, h: 300, bg: '#f4efe2', border: '#7a5a20', glow: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.52), sm); sign.position.set(sx + 0.035, LAND_Y + 1.25, sz); sign.rotation.y = Math.PI / 2; group.add(sign);
    mb.get('paint').box(sx, LAND_Y + 1.25, sz, 0.05, 0.58, 1.16, { col: [0.45, 0.33, 0.15] });
  }

  // ------------------------------------------------------------------ lily ponds and their arched bridges
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x24402f, roughness: 0.07, metalness: 0.0, envMapIntensity: 1.3 });
  const padGeo = new THREE.CircleGeometry(1, 22, 0.3, Math.PI * 2 - 0.6); padGeo.rotateX(-Math.PI / 2);
  const petal = new THREE.SphereGeometry(1, 8, 6); const flowerParts = [];
  for (const [n, tilt, r0, sc] of [[8, 0.75, 0.07, 1], [8, 1.05, 0.04, 0.8]]) for (let k = 0; k < n; k++) { const a = (k + (tilt > 0.9 ? 0.5 : 0)) / n * Math.PI * 2; const g = petal.clone();
    g.scale(0.032 * sc, 0.012, 0.1 * sc); g.translate(0, 0, 0.09 * sc); g.rotateX(-tilt * 0.6); g.translate(0, 0, r0 * 0.3); g.rotateY(a); flowerParts.push(g); }
  const flowerGeo = mergeSimple(flowerParts); const centreGeo = new THREE.CylinderGeometry(0.03, 0.035, 0.05, 10);
  const pads = [], flowers = [], rng = new RNG(4410);
  for (const pd of PONDS) {
    const poly = pd.poly, n = poly.length, b = pd.bridge, cx = pd.cx, cz = pd.cz;
    const inner = poly.map(([px, pz]) => { const dx = px - cx, dz = pz - cz, l = Math.hypot(dx, dz); return [px - dx / l * 0.42, pz - dz / l * 0.42]; });
    const nearBridge = (px, pz) => Math.abs(px - b.x) < b.hw + 0.25 && pz > b.z0 && pz < b.z1;
    const c = mb.get('concrete'), RIM = [0.8, 0.78, 0.74];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; const [ax, az] = poly[i], [bx, bz] = poly[j], [ix, iz] = inner[i], [jx, jz] = inner[j];
      if (nearBridge((ax + bx) / 2, (az + bz) / 2)) continue; // the rim stops where the bridge abutments take over
      const out = ((ax + bx) / 2 - cx) * (bz - az) - ((az + bz) / 2 - cz) * (bx - ax) > 0; // outward normal side for this winding
      const q = (p0, p1, y0, y1, flip) => (flip ? c.quad([p1[0], y0, p1[1]], [p0[0], y0, p0[1]], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]], [0, 0, 1, 0.3], RIM) : c.quad([p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], [0, 0, 1, 0.3], RIM));
      q([ax, az], [bx, bz], LAND_Y - 0.02, POND_RIM_Y, !out); q([ix, iz], [jx, jz], POND_WATER_Y - 0.1, POND_RIM_Y, out);
      const T = (p, yy) => [p[0], yy, p[1]]; if (out) c.quad(T([ax, az], POND_RIM_Y), T([ix, iz], POND_RIM_Y), T([jx, jz], POND_RIM_Y), T([bx, bz], POND_RIM_Y), [0, 0, 1, 0.3], [0.86, 0.84, 0.8]);
      else c.quad(T([bx, bz], POND_RIM_Y), T([jx, jz], POND_RIM_Y), T([ix, iz], POND_RIM_Y), T([ax, az], POND_RIM_Y), [0, 0, 1, 0.3], [0.86, 0.84, 0.8]); }
    { const shape = new THREE.Shape(inner.map(([px, pz]) => new THREE.Vector2(px, -pz))); const g = new THREE.ShapeGeometry(shape, 1); g.rotateX(-Math.PI / 2); g.translate(0, POND_WATER_Y, 0);
      const w = new THREE.Mesh(g, waterMat); w.receiveShadow = true; w.name = 'pondWater'; group.add(w); }
    // water lilies: pads in drifting clusters, blue nil manel (Sri Lanka's national flower), pink and white blooms
    const area = Math.abs(inner.reduce((s, p, i) => { const q2 = inner[(i + 1) % n]; return s + p[0] * q2[1] - q2[0] * p[1]; }, 0) / 2);
    const clusters = Math.round(area / 22);
    for (let k = 0; k < clusters; k++) { let ux, uz, tries = 0; do { ux = cx + rng.range(-1, 1) * 14; uz = cz + rng.range(-1, 1) * 9; tries++; } while (tries < 40 && (!inPoly(ux, uz, inner) || polyDist(ux, uz, inner) < 0.6 || Math.abs(ux - b.x) < b.hw + 1.2 || pd.jets.some(([jx, jz]) => Math.hypot(ux - jx, uz - jz) < 2.8)));
      if (tries >= 40) continue; const m = 4 + rng.int(0, 7);
      for (let e = 0; e < m; e++) { const px = ux + rng.range(-1.4, 1.4), pz = uz + rng.range(-1.1, 1.1); if (!inPoly(px, pz, inner) || polyDist(px, pz, inner) < 0.35 || Math.abs(px - b.x) < b.hw + 0.6) continue;
        const s = rng.range(0.18, 0.42); pads.push([px, POND_WATER_Y + 0.006 + rng.range(0, 0.004), pz, rng.range(0, 6.28), s, rng.range(0.8, 1.15)]);
        if (rng.next() < 0.2) { const t = rng.next(); flowers.push([px + rng.range(-0.15, 0.15), POND_WATER_Y + 0.02, pz + rng.range(-0.15, 0.15), rng.range(0, 6.28), rng.range(0.85, 1.25), t < 0.5 ? [0.52, 0.55, 0.98] : t < 0.78 ? [1, 0.62, 0.78] : [0.98, 0.97, 0.94]]); } } }
    // the arched bridge: deck following bridgeY, fascia, soffit, low parapets with end posts
    const N = 28, hw = b.hw, dk = mb.get('concrete'), BR = [0.9, 0.89, 0.86];
    for (let i = 0; i < N; i++) { const z0 = b.z0 + (b.z1 - b.z0) * i / N, z1 = b.z0 + (b.z1 - b.z0) * (i + 1) / N, y0 = bridgeY(b, z0), y1 = bridgeY(b, z1);
      mb.get('walkGrey').quad([b.x - hw, y0, z0], [b.x - hw, y1, z1], [b.x + hw, y1, z1], [b.x + hw, y0, z0], [0, z0 / 2, 1.2, z1 / 2]);
      dk.quad([b.x + hw + 0.16, y0 - 0.3, z0], [b.x + hw + 0.16, y1 - 0.3, z1], [b.x - hw - 0.16, y1 - 0.3, z1], [b.x - hw - 0.16, y0 - 0.3, z0], [0, 0, 1, 1], [0.78, 0.77, 0.74]); // soffit
      for (const sd of [-1, 1]) { const xi = b.x + sd * hw, xe = b.x + sd * (hw + 0.16), ht = 0.82; // parapet: outer face (down over the fascia), inner face, coping
        const two = (A, B2, C, D, cc) => { dk.quad(A, B2, C, D, [0, 0, 1, 1], cc); dk.quad(D, C, B2, A, [0, 0, 1, 1], cc); };
        two([xe, y0 - 0.3, z0], [xe, y1 - 0.3, z1], [xe, y1 + ht, z1], [xe, y0 + ht, z0], BR);
        two([xi, y0, z0], [xi, y1, z1], [xi, y1 + ht, z1], [xi, y0 + ht, z0], BR);
        two([xi, y0 + ht, z0], [xi, y1 + ht, z1], [xe, y1 + ht, z1], [xe, y0 + ht, z0], [0.95, 0.94, 0.91]); } }
    for (const zz of [b.z0, b.z1]) for (const sd of [-1, 1]) dk.box(b.x + sd * (hw + 0.08), LAND_Y + 0.5, zz, 0.32, 1.0, 0.32, { col: [0.95, 0.94, 0.91] });
    for (const [jx, jz] of pd.jets) mb.get('metal').cylinder(jx, POND_WATER_Y - 0.02, jz, 0.18, 0.12, 0.06, 12, { col: [0.2, 0.22, 0.2] }); // floating fountain nozzles
  }
  {
    const pm = new THREE.InstancedMesh(padGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide }), pads.length); const col = new THREE.Color();
    pads.forEach(([px, py, pz, r, s, v], i) => { pm.setMatrixAt(i, mat4(px, py, pz, 0, r, 0, s, 1, s)); col.setRGB(0.22 * v, 0.42 * v, 0.16 * v); pm.setColorAt(i, col); });
    pm.receiveShadow = true; pm.name = 'lilyPads'; group.add(pm);
    const fm = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), flowers.length);
    const cm = new THREE.InstancedMesh(centreGeo, new THREE.MeshStandardMaterial({ color: 0xf2c440, roughness: 0.7 }), flowers.length);
    flowers.forEach(([px, py, pz, r, s, c3], i) => { const m = mat4(px, py, pz, 0, r, 0, s, s, s); fm.setMatrixAt(i, m); cm.setMatrixAt(i, mat4(px, py + 0.02 * s, pz, 0, r, 0, s, s, s)); col.setRGB(c3[0], c3[1], c3[2]); fm.setColorAt(i, col); });
    fm.name = 'waterLilies'; group.add(fm, cm);
  }

  // ------------------------------------------------------------------ children's play area and the Jet Provost
  {
    const P = PLAY, y = LAND_Y + 0.04;
    mb.get('paint').hrect(P.x0, P.z0, P.x1, P.z1, y, 1, [0.6, 0.3, 0.24]);                                   // poured rubber safety surface
    for (const [k, x, z] of PLAY_ITEMS) if (k !== 'bench') mb.get('paint').hrect(x - 2.6, z - 2.2, x + 2.6, z + 2.2, y + 0.004, 1, [0.27, 0.46, 0.3]);
    const f = mb.get('metal'), G = [0.13, 0.34, 0.2];
    const fenceRun = (ax, az, bx, bz) => { const l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(l / 2));
      for (let i = 0; i <= n; i++) { const t = i / n; f.cylinder(ax + (bx - ax) * t, LAND_Y, az + (bz - az) * t, 0.04, 0.04, 1.0, 8, { col: G }); }
      for (const hh of [0.2, 0.95]) rod(f, [ax, LAND_Y + hh, az], [bx, LAND_Y + hh, bz], 0.025, G);
      for (let d = 0.12; d < l; d += 0.12) { const t = d / l; rod(f, [ax + (bx - ax) * t, LAND_Y + 0.2, az + (bz - az) * t], [ax + (bx - ax) * t, LAND_Y + 0.95, az + (bz - az) * t], 0.008, G); } };
    fenceRun(P.x0, P.z0, P.x1, P.z0); fenceRun(P.x0, P.z1, P.x1, P.z1); fenceRun(P.x0, P.z0, P.x0, P.z1); fenceRun(P.x1, P.z0, P.x1, P.gate - 1.6); fenceRun(P.x1, P.gate + 1.6, P.x1, P.z1);
    const R = [0.78, 0.16, 0.12], Yl = [0.95, 0.72, 0.1], B = [0.14, 0.32, 0.66], K = [0.08, 0.08, 0.08];
    for (const [kind, x, z, yaw] of PLAY_ITEMS) { const L = place(x, z, yaw), Y = LAND_Y;
      const V = (lx, ly, lz) => { const [wx, wz] = L(lx, lz); return [wx, Y + ly, wz]; };
      if (kind === 'swings') { for (const sx of [-1.7, 1.7]) { rod(f, V(sx, 0, -0.8), V(sx, 2.3, 0), 0.05, R); rod(f, V(sx, 0, 0.8), V(sx, 2.3, 0), 0.05, R); }
        rod(f, V(-1.75, 2.3, 0), V(1.75, 2.3, 0), 0.055, Yl);
        for (const sx of [-0.75, 0.75]) { for (const o of [-0.2, 0.2]) rod(f, V(sx + o, 2.28, 0), V(sx + o, 0.52, 0), 0.008, [0.6, 0.6, 0.6]); mb.get('paint').box(...V(sx, 0.5, 0), 0.46, 0.04, 0.18, { col: K, rotY: yaw }); } }
      else if (kind === 'slide') { for (const [px, pz] of [[-1.6, -0.45], [-1.6, 0.45], [-0.7, -0.45], [-0.7, 0.45]]) rod(f, V(px, 0, pz), V(px, 1.5, pz), 0.045, B);
        mb.get('paint').box(...V(-1.15, 1.5, 0), 0.9, 0.06, 0.9, { col: Yl, rotY: yaw });
        for (const pz of [-0.45, 0.45]) { rod(f, V(-1.6, 1.5, pz), V(-1.6, 2.4, pz), 0.035, B); rod(f, V(-0.7, 1.5, pz), V(-0.7, 2.4, pz), 0.035, B); rod(f, V(-1.6, 2.4, pz), V(-0.7, 2.4, pz), 0.03, B); }
        for (const pz of [-0.3, 0.3]) rod(f, V(-2.3, 0, pz), V(-1.6, 1.5, pz), 0.03, R); for (let k = 1; k < 6; k++) { const t = k / 6; rod(f, V(-2.3 + 0.7 * t, 1.5 * t, -0.3), V(-2.3 + 0.7 * t, 1.5 * t, 0.3), 0.022, R); }
        const ch = mb.get('paint'); for (let k = 0; k < 10; k++) { const t0 = k / 10, t1 = (k + 1) / 10, h0 = 1.5 * (1 - t0) ** 1.3, h1 = 1.5 * (1 - t1) ** 1.3, x0 = -0.7 + 2.9 * t0, x1 = -0.7 + 2.9 * t1;
          const a = V(x0, h0 + 0.04, -0.3), b2 = V(x1, h1 + 0.04, -0.3), c2 = V(x1, h1 + 0.04, 0.3), d = V(x0, h0 + 0.04, 0.3); ch.quad(d, c2, b2, a, [0, 0, 1, 1], Yl); ch.quad(a, b2, c2, d, [0, 0, 1, 1], [0.8, 0.6, 0.08]);
          for (const sd of [-0.32, 0.32]) rod(f, V(x0, h0 + 0.12, sd), V(x1, h1 + 0.12, sd), 0.03, Yl); } }
      else if (kind === 'seesaw') { rod(f, V(0, 0, -0.3), V(0, 0.45, 0), 0.04, B); rod(f, V(0, 0, 0.3), V(0, 0.45, 0), 0.04, B);
        mb.get('paint').box(...V(0, 0.5, 0), 3.6, 0.06, 0.25, { col: R, rotY: yaw });
        for (const sx of [-1.45, 1.45]) { rod(f, V(sx, 0.53, -0.1), V(sx, 0.85, -0.1), 0.02, Yl); rod(f, V(sx, 0.53, 0.1), V(sx, 0.85, 0.1), 0.02, Yl); rod(f, V(sx, 0.85, -0.12), V(sx, 0.85, 0.12), 0.02, Yl); } }
      else if (kind === 'roundabout') { mb.get('metal').cylinder(...V(0, 0.28, 0), 0.8, 0.8, 0.07, 24, { col: Yl }); rod(f, V(0, 0, 0), V(0, 0.28, 0), 0.1, [0.3, 0.3, 0.3]);
        for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; rod(f, V(Math.cos(a) * 0.7, 0.35, Math.sin(a) * 0.7), V(Math.cos(a) * 0.2, 0.95, Math.sin(a) * 0.2), 0.025, R); }
        mb.get('metal').cylinder(...V(0, 0.9, 0), 0.22, 0.22, 0.08, 12, { col: R, caps: true }); }
      else if (kind === 'climber') { const s = 0.66; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const lx = -1 + i * s, lz = -1 + j * s; rod(f, V(lx, 0, lz), V(lx, 2.0, lz), 0.025, (i + j) % 2 ? B : R); }
        for (let lv = 1; lv <= 3; lv++) for (let i = 0; i < 4; i++) { const yy = lv * s; rod(f, V(-1, yy, -1 + i * s), V(1, yy, -1 + i * s), 0.02, Yl); rod(f, V(-1 + i * s, yy, -1), V(-1 + i * s, yy, 1), 0.02, Yl); } }
    }
    // the BAC Jet Provost trainer displayed on its plinth (generic trainer finish, no national insignia)
    const j = P.jet, L = place(j.x, j.z, j.yaw);
    for (const [lx, lz, hx, hz] of JET_BASES) { const [wx, wz] = L(lx, lz); mb.get('concrete').box(wx, LAND_Y + (JET_LIFT - 0.05) / 2, wz, hx * 2, JET_LIFT - 0.05, hz * 2, { col: W, rotY: j.yaw, uvScale: 2 }); }
    const jet = buildJetProvost(); jet.position.set(j.x, LAND_Y + JET_LIFT - 0.05, j.z); jet.rotation.y = j.yaw; group.add(jet);
  }

  // ------------------------------------------------------------------ the Cenotaph war memorial (western end)
  {
    const { x, z, half } = CENOTAPH, y0 = LAND_Y + 0.06; const c = mb.get('concrete');
    mb.get('walk').hrect(x - half, z - half, x + half, z + half, y0, 2);
    [[2.4, 0.3], [2.0, 0.3], [1.6, 0.3]].forEach(([hs, hh], i) => c.box(x, y0 + hh * (i + 0.5), z, hs * 2, hh, hs * 2, { col: GRANITE, uvScale: 2 }));
    const yd = y0 + 0.9; c.box(x, yd + 1.0, z, 2.2, 2.0, 2.2, { col: [0.8, 0.79, 0.76], uvScale: 2 }); c.box(x, yd + 2.08, z, 2.4, 0.16, 2.4, { col: GRANITE, uvScale: 2 });
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) mb.get('metal').box(x + nx * 1.11, yd + 1.05, z + nz * 1.11, nz ? 1.3 : 0.03, 1.0, nx ? 1.3 : 0.03, { col: [0.36, 0.27, 0.16] }); // bronze tablets
    const ys = yd + 2.16, H = 9.0; const sh = new THREE.CylinderGeometry(0.45 * Math.SQRT2, 0.75 * Math.SQRT2, H, 4, 1, true); sh.rotateY(Math.PI / 4); // tapering square shaft
    c.geometry(sh, mat4(x, ys + H / 2, z), [0.84, 0.83, 0.8]);
    const py = new THREE.ConeGeometry(0.45 * Math.SQRT2, 0.9, 4); py.rotateY(Math.PI / 4); c.geometry(py, mat4(x, ys + H + 0.45, z), [0.84, 0.83, 0.8]);
    // a wreath of red poppies on the steps facing the park, posts and chain around
    mb.get('paint').geometry(TOR, mat4(x + 1.25, y0 + 1.2, z, 0, Math.PI / 2, 0, 0.32, 0.32, 0.6), [0.16, 0.3, 0.14]);
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; mb.get('paint').geometry(SPH, mat4(x + 1.29, y0 + 1.2 + Math.sin(a) * 0.32, z + Math.cos(a) * 0.32, 0, 0, 0, 0.05, 0.05, 0.03), [0.78, 0.08, 0.08]); }
    const r = 3.6, posts = []; for (let k = 0; k < 12; k++) { const t = k / 12 * 4, side = Math.floor(t), u = t - side; const pp = [[-1 + 2 * u, -1], [1, -1 + 2 * u], [1 - 2 * u, 1], [-1, 1 - 2 * u]][side]; posts.push([x + pp[0] * r, z + pp[1] * r]); }
    posts.forEach(([px, pz], k) => { c.cylinder(px, y0, pz, 0.08, 0.07, 0.6, 8, { col: GRANITE }); const [qx, qz] = posts[(k + 1) % posts.length];
      for (let s = 0; s < 6; s++) { const t0 = s / 6, t1 = (s + 1) / 6, sag = (t) => -0.12 * Math.sin(Math.PI * t); rod(mb.get('metal'), [px + (qx - px) * t0, y0 + 0.5 + sag(t0), pz + (qz - pz) * t0], [px + (qx - px) * t1, y0 + 0.5 + sag(t1), pz + (qz - pz) * t1], 0.012, [0.15, 0.15, 0.15]); } });
  }

  // ------------------------------------------------------------------ iron railing round the park, paintings along it
  {
    const tex = railingTexture(); const rm = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, color: 0x1d2220, metalness: 0.55, roughness: 0.5 });
    const rb = new MultiBuilder(); const c = mb.get('concrete'), CREAM = [0.9, 0.87, 0.78];
    for (const [ax, az, bx, bz] of RAILINGS) { const l = Math.hypot(bx - ax, bz - az), ry = -Math.atan2(bz - az, bx - ax);
      c.box((ax + bx) / 2, LAND_Y + 0.15, (az + bz) / 2, l, 0.3, 0.3, { col: CREAM, rotY: ry, uvScale: 2 });
      const n = Math.max(1, Math.round(l / 3)); for (let i = 0; i <= n; i++) { const t = i / n; c.box(ax + (bx - ax) * t, LAND_Y + 0.75, az + (bz - az) * t, 0.3, 1.5, 0.3, { col: CREAM, rotY: ry }); c.box(ax + (bx - ax) * t, LAND_Y + 1.53, az + (bz - az) * t, 0.36, 0.06, 0.36, { col: CREAM, rotY: ry }); }
      rb.get('rail').quad([ax, LAND_Y + 0.3, az], [bx, LAND_Y + 0.3, bz], [bx, LAND_Y + 1.42, bz], [ax, LAND_Y + 1.42, az], [0, 0, l / 0.6, 1]); }
    for (const m of rb.toMeshes({ rail: rm }, { cast: true, receive: false })) group.add(m);
    // artists' paintings hung on the railing along the Green Path pavement (west side), taken down at dusk
    const west = RAILINGS.filter(([ax, , bx]) => ax === bx && ax < PARK.cx); const atlas = paintingAtlas();
    if (atlas) { const pg = new THREE.Group(); pg.name = 'parkPaintings'; const pmat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.8 }); const pb = new MultiBuilder(); const prng = new RNG(1993);
      for (const [ax, az, , bz] of west) { const z0 = Math.min(az, bz) + 3, z1 = Math.max(az, bz) - 3; let zz = z0;
        while (zz < z1) { const run = prng.int(3, 7); for (let k = 0; k < run && zz < z1; k++) { const w = prng.range(0.55, 1.0), h = w * prng.range(0.62, 0.8), cell = prng.int(0, 7), yc = LAND_Y + prng.range(0.85, 1.05);
            const xf = ax - 0.2; const u0 = (cell % 4) / 4, v0 = cell < 4 ? 0.5 : 0; const du = 0.25 * Math.min(1, w / h * 0.8), dv = 0.5 * Math.min(1, h / w * 1.25);
            pb.get('canvas').quad([xf - 0.03, yc - h / 2, zz + w], [xf - 0.03, yc - h / 2, zz], [xf - 0.03, yc + h / 2, zz], [xf - 0.03, yc + h / 2, zz + w], [u0, v0, u0 + du, v0 + dv]);
            pb.get('frame').box(xf - 0.01, yc, zz + w / 2, 0.035, h + 0.08, w + 0.08, { col: prng.next() < 0.5 ? [0.36, 0.22, 0.1] : [0.75, 0.58, 0.26] });
            zz += w + prng.range(0.15, 0.35); } zz += prng.range(4, 12); } }
      for (const m of pb.toMeshes({ canvas: pmat, frame: MAT.paint }, { cast: false, receive: true })) pg.add(m); group.add(pg); anim.paintings = pg; }
  }

  for (const m of mb.toMeshes(MAT, { cast: true, receive: true })) group.add(m);
  return { group, anim };
}

function mergeSimple(list) { const pos = [], nor = [], idx = []; for (const g of list) { const o = pos.length / 3; pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); for (const i of g.index.array) idx.push(i + o); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g; }

// --- the Jet Provost: lofted fuselage, straight tapered wings with a little dihedral, wing-root intakes, side-by-side
// canopy, swept fin with the tailplane, tall tricycle undercarriage. Nose = +z, wheels on y = 0.
export function buildJetProvost() {
  const mb = new MultiBuilder(), SIL = [0.78, 0.8, 0.82], OR = [1.0, 0.36, 0.1], DK = [0.1, 0.1, 0.11];
  const rings = [[5.15, 1.5, 0.04, 0.04], [5.0, 1.5, 0.22, 0.2], [4.7, 1.5, 0.42, 0.38], [4.2, 1.53, 0.6, 0.55], [3.5, 1.57, 0.72, 0.68], [2.5, 1.58, 0.76, 0.74], [1.2, 1.58, 0.74, 0.76], [-0.3, 1.62, 0.62, 0.68], [-2.2, 1.7, 0.45, 0.52], [-3.9, 1.8, 0.29, 0.34], [-4.85, 1.84, 0.23, 0.25]];
  const seg = 20; const g = new THREE.BufferGeometry(); const pos = [], col = [], idx = [];
  rings.forEach(([z, cy, rx, ry]) => { for (let k = 0; k <= seg; k++) { const a = k / seg * Math.PI * 2; pos.push(Math.cos(a) * rx, cy + Math.sin(a) * ry, z); const c = z > 4.25 ? OR : (z > 3.2 && Math.sin(a) > 0.55 && z < 3.6 ? DK : SIL); col.push(...c); } });
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  mb.get('metal').geometry(g, new THREE.Matrix4());
  const m = mb.get('metal');
  // tapered slab from a root chord to a tip chord (each [x, y, zLead, zTrail, thickness])
  const slab = (r, t, cR, cT) => { const P = (s, lead, top) => { const [x, y, zl, zt, th] = s; return [x, y + (top ? th / 2 : -th / 2), lead ? zl : zt]; };
    const R = [P(r, 1, 1), P(r, 0, 1), P(r, 0, 0), P(r, 1, 0)], T = [P(t, 1, 1), P(t, 0, 1), P(t, 0, 0), P(t, 1, 0)];
    const q = (a, b, c, d, cc) => { m.quad(a, b, c, d, [0, 0, 1, 1], cc); m.quad(d, c, b, a, [0, 0, 1, 1], cc); };
    q(R[0], T[0], T[1], R[1], cR); q(R[3], R[2], T[2], T[3], cR); q(R[0], R[3], T[3], T[0], cR); q(R[1], T[1], T[2], R[2], cR); q(T[0], T[3], T[2], T[1], cT); };
  for (const s of [-1, 1]) { const tipY = 1.15 + 5.0 * Math.tan(0.1); slab([s * 0.6, 1.15, 1.75, -0.75, 0.32], [s * 4.6, tipY - 0.05, 0.85, -0.35, 0.13], SIL, SIL); slab([s * 4.6, tipY - 0.05, 0.85, -0.35, 0.13], [s * 5.4, tipY, 0.75, -0.3, 0.1], OR, OR);
    slab([s * 0.25, 1.95, -3.25, -4.4, 0.1], [s * 2.2, 1.98, -3.8, -4.45, 0.06], SIL, SIL); // tailplane
    m.geometry(new THREE.CylinderGeometry(0.15, 0.17, 0.3, 14, 1, true).rotateX(Math.PI / 2).scale(1, 1.25, 1), mat4(s * 0.6, 1.27, 1.85), DK); } // intake mouths in the wing roots
  slab([0, 2.05, -2.5, -4.7, 0.14], [0, 3.35, -3.9, -4.75, 0.07], SIL, OR); // fin
  m.geometry(new THREE.CylinderGeometry(0.22, 0.2, 0.2, 14, 1, true).rotateX(Math.PI / 2), mat4(0, 1.84, -4.95), DK); // jet pipe
  // undercarriage: nose leg and the two main legs, tyres
  const leg = (x, z, h, r) => { rod(m, [x, h, z], [x, r, z], 0.06, [0.6, 0.62, 0.64]); m.geometry(new THREE.CylinderGeometry(r, r, 0.18, 16).rotateZ(Math.PI / 2), mat4(x, r, z), DK); };
  leg(0, 3.85, 1.1, 0.24); leg(-1.6, 0.15, 1.05, 0.3); leg(1.6, 0.15, 1.05, 0.3);
  const grp = new THREE.Group(); for (const me of mb.toMeshes({ metal: getJetMetal() }, { cast: true, receive: true })) grp.add(me);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f8a96, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.75 }));
  canopy.scale.set(0.62, 0.55, 1.35); canopy.position.set(0, 2.15, 2.35); grp.add(canopy);
  return grp;
}
let jetMetal = null; const getJetMetal = () => jetMetal || (jetMetal = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.35 }));

function railingTexture() { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const c = cv.getContext('2d'); if (!c) return null;
  c.clearRect(0, 0, 128, 128); c.fillStyle = '#fff'; c.fillRect(0, 6, 128, 7); c.fillRect(0, 112, 128, 8); // rails
  for (let k = 0; k < 4; k++) { const x = 16 + k * 32; c.fillRect(x - 3, 0, 6, 128); c.beginPath(); c.moveTo(x - 6, 6); c.lineTo(x, -6); c.lineTo(x + 6, 6); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// eight original paintings in a 4 x 2 atlas: the kind of landscapes sold along the park railings
function paintingAtlas() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const c = cv.getContext('2d'); if (!c) return null; const R = new RNG(77);
  const grad = (x, y, w, h, stops) => { const g = c.createLinearGradient(x, y, x, y + h); stops.forEach(([o, s]) => g.addColorStop(o, s)); return g; };
  const cell = (i, fn) => { const x = (i % 4) * 256, y = i < 4 ? 0 : 256; c.save(); c.beginPath(); c.rect(x, y, 256, 256); c.clip(); c.translate(x, y); fn(); c.restore(); };
  const hills = (base, amp, col, seed) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, 256); for (let x = 0; x <= 256; x += 8) c.lineTo(x, base - amp * (Math.sin(x * 0.02 + seed) * 0.6 + Math.sin(x * 0.051 + seed * 2) * 0.4)); c.lineTo(256, 256); c.fill(); };
  cell(0, () => { c.fillStyle = grad(0, 0, 0, 160, [[0, '#2b2a5a'], [0.45, '#d8603a'], [1, '#f7c56a']]); c.fillRect(0, 0, 256, 160); c.fillStyle = '#f9e3a0'; c.beginPath(); c.arc(128, 150, 26, 0, Math.PI * 2); c.fill();
    c.fillStyle = grad(0, 160, 0, 96, [[0, '#c0613d'], [1, '#30304e']]); c.fillRect(0, 160, 256, 96); c.fillStyle = '#1b1414'; // outrigger canoe (oruwa) and fisherman
    c.beginPath(); c.moveTo(70, 190); c.quadraticCurveTo(110, 200, 160, 190); c.lineTo(150, 198); c.lineTo(80, 198); c.fill(); c.fillRect(112, 158, 3, 34); c.beginPath(); c.moveTo(115, 160); c.lineTo(150, 172); c.lineTo(115, 186); c.fill(); c.fillRect(84, 203, 70, 2); });
  cell(1, () => { c.fillStyle = grad(0, 0, 0, 256, [[0, '#9fd0e8'], [1, '#d9efe0']]); c.fillRect(0, 0, 256, 256); hills(150, 30, '#5b8a5a', 1); hills(185, 22, '#3f6e3c', 4);
    c.fillStyle = '#4b4846'; c.beginPath(); c.ellipse(130, 190, 52, 30, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(80, 175, 22, 26, 0.2, 0, Math.PI * 2); c.fill(); // elephant
    c.fillRect(95, 205, 12, 30); c.fillRect(150, 205, 12, 30); c.fillRect(115, 208, 10, 28); c.fillRect(165, 205, 10, 28); c.beginPath(); c.moveTo(66, 185); c.quadraticCurveTo(56, 215, 64, 236); c.lineTo(70, 236); c.quadraticCurveTo(66, 215, 74, 192); c.fill();
    c.fillStyle = '#2f5a2c'; c.fillRect(0, 232, 256, 24); });
  cell(2, () => { c.fillStyle = grad(0, 0, 0, 120, [[0, '#bfe0f2'], [1, '#eef6f0']]); c.fillRect(0, 0, 256, 256); hills(95, 25, '#6f9fb3', 2); hills(120, 18, '#4f8a6a', 3); // paddy terraces
    for (let k = 0; k < 9; k++) { c.fillStyle = k % 2 ? '#8fc24a' : '#b8d65e'; c.beginPath(); c.moveTo(0, 125 + k * 15); for (let x = 0; x <= 256; x += 16) c.lineTo(x, 125 + k * 15 + Math.sin(x * 0.03 + k) * 5); c.lineTo(256, 256); c.lineTo(0, 256); c.fill(); } });
  cell(3, () => { c.fillStyle = grad(0, 0, 0, 256, [[0, '#f4a25a'], [0.6, '#f6d38a'], [1, '#e9c27a']]); c.fillRect(0, 0, 256, 256); hills(200, 15, '#5a7a3c', 5); // a great rock fortress at dusk
    c.fillStyle = '#7a4b33'; c.beginPath(); c.moveTo(70, 200); c.lineTo(84, 92); c.quadraticCurveTo(128, 70, 172, 96); c.lineTo(190, 200); c.fill(); c.fillStyle = '#3e5a2a'; for (let k = 0; k < 30; k++) { c.beginPath(); c.arc(R.range(0, 256), R.range(196, 236), R.range(6, 14), 0, Math.PI * 2); c.fill(); } });
  cell(4, () => { const cols = ['#c0392b', '#e67e22', '#f1c40f', '#16a085', '#2c3e50', '#8e44ad', '#ecf0f1']; for (let k = 0; k < 16; k++) { c.fillStyle = cols[k % cols.length]; c.globalAlpha = 0.85; c.fillRect(R.range(-30, 220), R.range(-30, 220), R.range(40, 120), R.range(30, 110)); } c.globalAlpha = 1; });
  cell(5, () => { c.fillStyle = grad(0, 0, 0, 256, [[0, '#f2b45a'], [0.55, '#f4dc9a'], [0.56, '#7aa6b4'], [1, '#2f5f74']]); c.fillRect(0, 0, 256, 256); c.strokeStyle = '#201a18'; c.fillStyle = '#201a18'; // stilt fishermen
    for (const [x, s] of [[60, 1], [130, 0.85], [200, 0.7]]) { c.lineWidth = 3; c.beginPath(); c.moveTo(x, 250); c.lineTo(x, 150 * s + 40); c.stroke(); c.beginPath(); c.moveTo(x - 12 * s, 170 * s + 40); c.lineTo(x + 12 * s, 170 * s + 40); c.stroke();
      c.beginPath(); c.arc(x, 120 * s + 40, 6 * s, 0, Math.PI * 2); c.fill(); c.fillRect(x - 4 * s, 126 * s + 40, 8 * s, 30 * s); c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + 4 * s, 135 * s + 40); c.lineTo(x + 40 * s, 120 * s + 40); c.lineTo(x + 40 * s, 230); c.stroke(); } });
  cell(6, () => { c.fillStyle = grad(0, 0, 0, 120, [[0, '#cfe6f5'], [1, '#f2f6ee']]); c.fillRect(0, 0, 256, 256); hills(110, 30, '#4d8a4a', 6); hills(150, 25, '#3d7a3a', 7); // tea estate rows
    c.strokeStyle = '#2e5e2c'; c.lineWidth = 4; for (let k = 0; k < 10; k++) { c.beginPath(); for (let x = 0; x <= 256; x += 8) { const y = 150 + k * 12 + Math.sin(x * 0.025 + k * 0.4) * 10; if (x === 0) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); } });
  cell(7, () => { c.fillStyle = '#152a26'; c.fillRect(0, 0, 256, 256); // lotuses
    for (const [x, y, s] of [[80, 120, 1], [175, 95, 0.8], [150, 190, 0.9]]) { for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.32; c.fillStyle = k % 2 ? '#f29bb8' : '#f7c2d2'; c.beginPath(); c.ellipse(x + Math.cos(a) * 22 * s, y + Math.sin(a) * 22 * s, 10 * s, 28 * s, a + Math.PI / 2, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#2f6a3a'; c.beginPath(); c.ellipse(x, y + 34 * s, 40 * s, 10 * s, 0, 0, Math.PI * 2); c.fill(); } });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
