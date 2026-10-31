// Instanced street furniture, built per chunk so frustum culling works chunk by chunk.
import * as THREE from 'three';
import { MeshBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { TEX } from '../gfx/Textures.js';
import { LAND_Y, ROAD_Y, nodes, signalState } from './Layout.js';
import { RNG } from '../core/rng.js';

const C = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const GEO = {}; // type -> [{geo, mat}]
function part(mb, mat) { return { geo: mb.build(), mat }; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

export function buildPropGeometries() {
  // street lamp: tapered galvanised pole, curved arm, LED head (head is a separate emissive part)
  { const p = new MeshBuilder(); p.cylinder(0, 0, 0, 0.14, 0.08, 8, 8, { col: C('#9aa0a4') }); p.box(0, 8.0, 0.9, 0.08, 0.08, 1.9, { col: C('#9aa0a4') }); p.box(0, 0.4, 0, 0.32, 0.8, 0.32, { col: C('#8a8a86') });
    const h = new MeshBuilder(); h.box(0, 7.92, 1.85, 0.32, 0.12, 0.7, {});
    GEO.lamp = [part(p, MAT.metal), part(h, MAT.lampHead)]; }
  { const p = new MeshBuilder(); p.cylinder(0, 0, 0, 0.2, 0.09, 5.2, 10, { col: C('#1d1f1d') }); p.box(0, 0.35, 0, 0.5, 0.7, 0.5, { col: C('#1d1f1d') }); p.box(0, 5.2, 0, 1.2, 0.1, 0.1, { col: C('#1d1f1d') });
    const h = new MeshBuilder(); for (const s of [-0.55, 0.55]) h.box(s, 4.85, 0, 0.32, 0.5, 0.32, {});
    GEO.lampHeritage = [part(p, MAT.metal), part(h, MAT.lampHead)]; }
  // concrete utility pole with crossarm + insulators
  { const p = new MeshBuilder(); p.box(0, 4.5, 0, 0.26, 9, 0.22, { col: C('#a7a39a'), uvScale: 2 }); p.box(0, 8.4, 0, 1.8, 0.12, 0.12, { col: C('#6a6a66') }); for (const s of [-0.8, 0, 0.8]) p.cylinder(s, 8.46, 0, 0.05, 0.05, 0.16, 6, { col: C('#d8d8d0') });
    p.box(0, 6.6, 0, 1.0, 0.1, 0.1, { col: C('#6a6a66') });
    GEO.pole = [part(p, MAT.concrete)];
    const t = new MeshBuilder(); t.box(0, 6.1, 0.35, 0.7, 0.9, 0.5, { col: C('#7d8580') }); t.cylinder(0, 6.55, 0.35, 0.08, 0.08, 0.3, 6, { col: C('#ddd') });
    GEO.transformer = [part(t, MAT.metal)]; }
  // traffic signal pole (heads are separate dynamic lamps)
  { const p = new MeshBuilder(); p.cylinder(0, 0, 0, 0.1, 0.09, 3.2, 8, { col: C('#2b2d2b') });
    p.box(0, 2.85, 0.18, 0.34, 1.0, 0.24, { col: C('#151515') }); p.box(0.18, 2.85, 0, 0.24, 1.0, 0.34, { col: C('#151515') });
    for (const [x, z] of [[0, 0.3075], [0.3075, 0]]) p.box(x, 2.85, z, x ? 0.015 : 0.4, 1.1, z ? 0.015 : 0.4, { col: C('#e8c21a') }); // backboard face at 0.315: lamps float 1.8 cm in front (no coplanar flicker)
    GEO.signal = [part(p, MAT.metal)]; }
  // bus halt shelter
  { const busSign = canvasTex(512, 160, (a, w, h) => { a.fillStyle = '#0e5e35'; a.fillRect(0, 0, w, h); a.fillStyle = '#fff'; a.textAlign = 'center'; a.textBaseline = 'middle'; a.font = '700 54px "Barlow Condensed", sans-serif'; a.fillText('BUS HALT', w / 2, 40); a.font = '700 34px "Noto Sans Sinhala", sans-serif'; a.fillText('බස් නැවතුම', w * 0.28, 115); a.font = '700 30px "Noto Sans Tamil", sans-serif'; a.fillText('பஸ் தரிப்பு', w * 0.74, 115); });
    MAT.busSign = new THREE.MeshStandardMaterial({ map: busSign, roughness: 0.6, side: THREE.DoubleSide });
    const p = new MeshBuilder(); for (const x of [-2, 2]) for (const z of [-0.6]) p.box(x, 1.25, z, 0.1, 2.5, 0.1, { col: C('#4a4f4c') });
    p.box(0, 2.55, 0, 4.6, 0.1, 1.8, { col: C('#c9cfc9') }); p.box(0, 1.3, -0.65, 4.2, 1.5, 0.05, { col: C('#b8c0bf') }); p.box(0, 0.48, -0.35, 3.4, 0.08, 0.45, { col: C('#5a6a74') }); for (const x of [-1.5, 1.5]) p.box(x, 0.24, -0.35, 0.1, 0.48, 0.4, { col: C('#555') });
    const s = new MeshBuilder(); s.quad([-1.1, 2.62, 0.92], [1.1, 2.62, 0.92], [1.1, 3.3, 0.92], [-1.1, 3.3, 0.92], [0, 0, 1, 1]);
    GEO.busStop = [part(p, MAT.paint), part(s, MAT.busSign)]; }
  // bench
  { const p = new MeshBuilder(); // seat faces local +z: three seat slats centred on the origin (sitters' hips land on z = 0), backrest behind (−z)
    for (let k = 0; k < 3; k++) p.box(0, 0.44, -0.15 + k * 0.15, 1.8, 0.05, 0.12, { col: C('#7a5532'), bottom: true });
    for (const y of [0.62, 0.8]) p.box(0, y, -0.25, 1.8, 0.11, 0.04, { col: C('#7a5532'), bottom: true });
    for (const x of [-0.75, 0.75]) { p.box(x, 0.21, 0, 0.12, 0.42, 0.5, { col: C('#9a958a') }); p.box(x, 0.66, -0.25, 0.08, 0.5, 0.06, { col: C('#9a958a') }); }
    GEO.bench = [part(p, MAT.paint)]; }
  // pedestrian railing (yellow/black)
  { const p = new MeshBuilder(); for (let k = 0; k < 6; k++) p.box(-1.25 + k * 0.5, 0.95, 0, 0.5, 0.08, 0.06, { col: k % 2 ? C('#111') : C('#e8c21a') }); p.box(-1.45, 0.5, 0, 0.07, 1.0, 0.07, { col: C('#222') }); p.box(0, 0.55, 0, 2.9, 0.05, 0.04, { col: C('#d8b818') });
    GEO.railing = [part(p, MAT.paint)]; }
  // gate
  { const p = new MeshBuilder(); p.box(-2.1, 1.1, 0, 0.35, 2.2, 0.35, { col: C('#e8e2d4') }); p.box(2.1, 1.1, 0, 0.35, 2.2, 0.35, { col: C('#e8e2d4') }); for (let k = 0; k < 14; k++) p.box(-1.8 + k * 0.28, 0.95, 0, 0.04, 1.7, 0.04, { col: C('#1d1d1d') }); p.box(0, 1.75, 0, 3.8, 0.08, 0.06, { col: C('#1d1d1d') }); p.box(0, 0.25, 0, 3.8, 0.08, 0.06, { col: C('#1d1d1d') });
    GEO.gate = [part(p, MAT.metal)]; }
  // Pettah pavement stall: table, goods, tarp canopy
  { const p = new MeshBuilder(); const rng = new RNG(5); p.box(0, 0.8, 0, 2.0, 0.08, 1.1, { col: C('#6b4a2e') }); for (const [x, z] of [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]]) p.box(x, 0.4, z, 0.06, 0.8, 0.06, { col: C('#444') });
    for (let k = 0; k < 10; k++) p.box(-0.8 + (k % 5) * 0.4, 0.92 + Math.floor(k / 5) * 0.12, -0.25 + Math.floor(k / 5) * 0.4, 0.34, 0.16, 0.3, { col: C(rng.pick(['#c0392b', '#2471a3', '#f1c40f', '#27ae60', '#e67e22', '#8e44ad', '#ecf0f1'])) });
    for (const [x, z] of [[-1.05, -0.6], [1.05, -0.6], [-1.05, 0.6], [1.05, 0.6]]) p.box(x, 1.2, z, 0.04, 2.4, 0.04, { col: C('#555') });
    const t = new MeshBuilder(); t.quad([-1.2, 2.2, 0.75], [1.2, 2.2, 0.75], [1.2, 2.45, -0.75], [-1.2, 2.45, -0.75], [0, 0, 1, 1], C('#2f6fa8'));
    GEO.stall = [part(p, MAT.paint), part(t, MAT.awning)]; }
  // Galle Face food cart (isso vadai / kadala)
  { const p = new MeshBuilder(); p.box(0, 0.95, 0, 1.4, 0.9, 2.6, { col: C('#d7d2c4') }); p.box(0, 1.45, 0, 1.45, 0.08, 2.65, { col: C('#9b2d20') });
    for (const z of [-0.9, 0.9]) p.cylinder(0.75, 0.35, z, 0.35, 0.35, 0.08, 12, { col: C('#222') });
    p.box(0, 1.75, 0.6, 1.2, 0.5, 1.0, { col: C('#c7d7dc') }); for (const [x, z] of [[-0.65, -1.2], [0.65, -1.2], [-0.65, 1.2], [0.65, 1.2]]) p.box(x, 2.0, z, 0.05, 1.1, 0.05, { col: C('#555') });
    const t = new MeshBuilder(); t.box(0, 2.6, 0, 1.7, 0.06, 2.9, { col: C('#e3b23c') });
    const l = new MeshBuilder(); l.box(0, 2.45, 0, 0.18, 0.18, 0.18, {});
    GEO.foodcart = [part(p, MAT.paint), part(t, MAT.awning), part(l, MAT.lampHead)]; }
  // shipping container (instance-coloured)
  { const p = new MeshBuilder(); p.box(0, 1.3, 0, 12.1, 2.58, 2.44, { col: [1, 1, 1], uvScale: 2.6 }); GEO.containers = [part(p, MAT.corrugated)]; }
  // junction shrine (glass-fronted, golden figure abstracted)
  { const p = new MeshBuilder(); p.box(0, 0.6, 0, 1.4, 1.2, 1.4, { col: C('#f4f1ea') }); p.box(0, 2.6, 0, 1.6, 0.12, 1.6, { col: C('#f4f1ea') }); for (const [x, z] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]]) p.box(x, 1.9, z, 0.08, 1.4, 0.08, { col: C('#e8e2d4') });
    p.cylinder(0, 2.66, 0, 0.9, 0.05, 0.5, 8, { col: C('#e8dcc0') });
    const g = new MeshBuilder(); g.cylinder(0, 1.2, 0, 0.28, 0.12, 0.45, 10, { col: C('#d4af37') }); g.cylinder(0, 1.65, 0, 0.11, 0.06, 0.2, 8, { col: C('#d4af37') });
    GEO.shrine = [part(p, MAT.paint), part(g, MAT.lampHead)]; }
  // signal lamp disc (dynamic colour)
  { const g = new THREE.CircleGeometry(0.11, 12); GEO.signalLamp = g; }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(), _c = new THREE.Color();
export const signalLamps = []; // { mesh, entries:[{node, axis, idx0}] }
const SIG_MAT = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide });

export function buildPropsForChunk(chunk) {
  const group = new THREE.Group(); const byType = new Map();
  for (const p of chunk.props) { if (!GEO[p.type]) continue; if (!byType.has(p.type)) byType.set(p.type, []); byType.get(p.type).push(p); if (p.type === 'pole' && p.transformer) { if (!byType.has('transformer')) byType.set('transformer', []); byType.get('transformer').push(p); } }
  for (const [type, list] of byType) {
    if (type === 'containers') {
      let n = 0; for (const p of list) n += p.tiers;
      const mesh = new THREE.InstancedMesh(GEO.containers[0].geo, GEO.containers[0].mat, n); let i = 0; const rng = new RNG(31);
      for (const p of list) for (let t = 0; t < p.tiers; t++) { _p.set(p.x, LAND_Y + t * 2.6, p.z); _m.compose(_p, _q.identity(), _s.set(1, 1, 1)); mesh.setMatrixAt(i, _m); mesh.setColorAt(i, _c.set(rng.pick(['#b03a2e', '#2471a3', '#1e8449', '#d4ac0d', '#7d3c98', '#ca6f1e', '#5d6d7e', '#e5e7e9', '#a04000']))); i++; }
      mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh); continue;
    }
    for (const prt of GEO[type]) {
      const mesh = new THREE.InstancedMesh(prt.geo, prt.mat, list.length);
      list.forEach((p, i) => { _p.set(p.x, LAND_Y, p.z); _q.setFromEuler(_e.set(0, p.rot || 0, 0)); _m.compose(_p, _q, _s.set(1, 1, 1)); mesh.setMatrixAt(i, _m); });
      mesh.castShadow = type !== 'railing'; mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
    }
  }
  // signal lamps: per signal pole 2 heads × 3 lamps
  const sigs = byType.get('signal');
  if (sigs) {
    const mesh = new THREE.InstancedMesh(GEO.signalLamp, SIG_MAT, sigs.length * 6); const entries = [];
    sigs.forEach((p, i) => {
      // head A faces local +z (axis 'v' traffic), head B faces local +x (axis 'h' traffic)
      for (let h = 0; h < 2; h++) for (let k = 0; k < 3; k++) {
        const local = h === 0 ? new THREE.Vector3(0, 3.18 - k * 0.32, 0.333) : new THREE.Vector3(0.333, 3.18 - k * 0.32, 0);
        local.applyAxisAngle(new THREE.Vector3(0, 1, 0), p.rot); _p.set(p.x + local.x, LAND_Y + local.y, p.z + local.z);
        _q.setFromEuler(_e.set(0, p.rot + (h === 0 ? 0 : Math.PI / 2), 0)); _m.compose(_p, _q, _s.set(1, 1, 1)); mesh.setMatrixAt(i * 6 + h * 3 + k, _m); mesh.setColorAt(i * 6 + h * 3 + k, _c.set(0x111111));
      }
      // which axis does each head serve? head A faces along local +z: world dir = (sin rot, cos rot)
      const dA = [Math.sin(p.rot), Math.cos(p.rot)];
      const axisA = Math.abs(dA[1]) > Math.abs(dA[0]) ? 'v' : 'h';
      entries.push({ node: nodes[p.node], axes: [axisA, axisA === 'v' ? 'h' : 'v'], base: i * 6 });
    });
    mesh.computeBoundingSphere(); group.add(mesh); signalLamps.push({ mesh, entries, group });
  }
  // overhead cables between consecutive utility poles
  const poles = byType.get('pole');
  if (poles) {
    const cb = new MeshBuilder();
    for (const p of poles) if (p.prev) {
      const [ax, az] = p.prev, bx = p.x, bz = p.z; const len = Math.hypot(bx - ax, bz - az); if (len > 45) continue;
      const nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (const [off, h] of [[-0.8, 8.5], [0, 8.5], [0.8, 8.5], [0, 6.65]]) {
        const seg = 8; let prevPt = null;
        for (let k = 0; k <= seg; k++) {
          const t = k / seg; const sag = Math.sin(Math.PI * t) * len * 0.025;
          const pt = [ax + (bx - ax) * t + nx * off * 0, LAND_Y + h - sag, az + (bz - az) * t];
          const rotA = p.rot; const ox = Math.cos(rotA) * off, oz = -Math.sin(rotA) * off; pt[0] += ox; pt[2] += oz;
          if (prevPt) { const w = 0.025; cb.quad([prevPt[0], prevPt[1] - w, prevPt[2]], [pt[0], pt[1] - w, pt[2]], [pt[0], pt[1] + w, pt[2]], [prevPt[0], prevPt[1] + w, prevPt[2]], [0, 0, 1, 1], [0.06, 0.06, 0.06]); }
          prevPt = pt;
        }
      }
    }
    const g = cb.build(); if (g) { const m = new THREE.Mesh(g, MAT.paintDS); group.add(m); }
  }
  // streetlight ground pools + glows (night)
  const lamps = [...(byType.get('lamp') || []), ...(byType.get('lampHeritage') || [])];
  if (lamps.length) {
    const pg = new THREE.PlaneGeometry(9, 9); pg.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(pg, MAT.pool, lamps.length);
    const pos = new Float32Array(lamps.length * 3);
    lamps.forEach((p, i) => {
      const heritage = p.type === 'lampHeritage'; const reach = heritage ? 0 : 1.85;
      const hx = p.x + Math.sin(p.rot) * reach, hz = p.z + Math.cos(p.rot) * reach;
      _p.set(hx, ROAD_Y + 0.03, hz); _m.compose(_p, _q.identity(), _s.set(1, 1, 1)); pools.setMatrixAt(i, _m);
      pos[i * 3] = hx; pos[i * 3 + 1] = LAND_Y + (heritage ? 4.85 : 7.85); pos[i * 3 + 2] = hz;
    });
    pools.computeBoundingSphere(); group.add(pools);
    const pts = new THREE.BufferGeometry(); pts.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const glow = new THREE.Points(pts, GLOW_MAT); group.add(glow);
    group.userData.lamps = lamps.map((p, i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], pools, i]); // [x, y, z, pool decal mesh, instance] — the decal is hidden while a real light is on the lamp
  }
  return group;
}
export const GLOW_MAT = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: true, color: 0xffd7a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
export function initGlowTexture() { GLOW_MAT.map = TEX.glow; GLOW_MAT.needsUpdate = true; }

const RED = new THREE.Color(2.2, 0.15, 0.1), AMB = new THREE.Color(2.2, 1.2, 0.1), GRN = new THREE.Color(0.2, 2.0, 0.6), OFF = new THREE.Color(0.05, 0.05, 0.05);
export function updateSignals(t) {
  for (const s of signalLamps) {
    if (!s.group.visible || !s.group.parent || !s.group.parent.visible) continue;
    for (const e of s.entries) for (let h = 0; h < 2; h++) {
      const st = signalState(e.node, e.axes[h], t);
      s.mesh.setColorAt(e.base + h * 3 + 0, st === 'red' ? RED : OFF);
      s.mesh.setColorAt(e.base + h * 3 + 1, st === 'yellow' ? AMB : OFF);
      s.mesh.setColorAt(e.base + h * 3 + 2, st === 'green' ? GRN : OFF);
    }
    s.mesh.instanceColor.needsUpdate = true;
  }
}
