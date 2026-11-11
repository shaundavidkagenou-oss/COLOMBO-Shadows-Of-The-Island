// VehicleDamage — GTA-style damage for every road vehicle, built on the systems that already exist (Weapons / Firefight traces,
// Explosions for the blast, fire and smoke particles and its one light, Vehicle springs, Traffic for the people inside).
//
//   bullets   exact ray test against the vehicle's own triangles (per-type proxy built from the LOD1 / body geometry, binned in a
//             coarse grid). What it hits decides what happens:
//               glass  — tempered side / rear windows burst into cubes on the first hit; the laminated windscreen takes a
//                        spider-web crack + hole per hit and falls out after ~8. Cracks / holes / missing panes are drawn by the
//                        vehicle's own glass material (one shared shader program: a per-vehicle uniform block).
//               lamps  — smashed (that lamp stays dark), lens shards.
//               tyre   — bursts: the corner drops onto the rim (Vehicle.dropFit tilts the body), less grip / power.
//               body   — a bullet hole (bare steel ring, dark centre); the engine bay costs much more than a door, a hit low at
//                        the rear may hole the tank and start a fuel fire.
//             Bullets go through: glass barely slows them, sheet metal takes most of a pistol round's energy, an engine block
//             stops anything. The exit point is the last surface along the ray; occupants within reach of the path are hit
//             (AI killed or wounded, the player hurt) and whatever lies beyond the car is traced with the energy that is left.
//   health    100 → smoke from ~40 (VehicleSmoke reads v.damage), the engine loses power below 15, at 0 the engine catches fire:
//             the occupants bail out and run, flames and smoke pour from the bay for 6-9 s, then the tank goes up.
//   explosion Explosions.blast at the car (fireball, shock, everyone nearby), the shell is thrown up and spins, lands and
//             bounces, settles on its wheels, side or roof; paint chars, glass and tyres are gone, it sits on its rims and
//             smoulders. Doors, a wheel or two, the bonnet, the boot lid, metal fragments and glass cubes fly everywhere and
//             come to rest on the street (real bodies with bounce, friction and the walls).
//   dents     every collision pushes the panels in where it hit (copy-on-write vertex buffers per damaged vehicle; normals
//             follow the crease), grinding along a wall scrapes the paint to bare metal, hard hits crack glass / smash lamps.
//
// Nothing is allocated for a vehicle until it is first damaged (buffers, materials, hole decals); repair() restores the
// originals and dispose frees everything.
import * as THREE from 'three';
import { Audio } from '../audio/Audio.js';
import { VEH_HOOKS } from './Vehicle.js';
import { vehicleMaterials } from './VehicleModels.js';
import { setDoorLive, poseDoor, DOOR_HOOKS, doorHeld, freeDoorNow, vehicleVelocity } from './DoorRig.js';
import * as L from '../world/Layout.js';

const MAX_PANES = 16, MAX_CRACKS = 8, HOLES = 28, SHARDS = 360, FRAGS = 120, BODIES = 44;
const DEFORM = new Set(['paint', 'livery', 'police', 'amb', 'route', 'chrome', 'vlight', 'vtail', 'vind', 'vrev', 'lens', 'vrefl', 'plate', 'badge', 'rubber', 'canvas', 'carbon', 'mirror', 'glass']);
const PROXY_SKIP = new Set(['interior', 'dash', 'contactShadow', 'headPool']);
const LAMP_F = new Set(['vlight']), LAMP_R = new Set(['vtail', 'vrev', 'vind']);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const hash1 = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const heavyType = (v) => (v.T.mass || 0) > 3000 || v.type === 'bus' || v.type === 'pbus' || v.type === 'lorry';
const isBike = (v) => v.T.entry === 'bike';
// how much a hit takes out of the vehicle: buses / lorries are big and heavy-built, vans a bit tougher, a bike's tank is exposed
const armour = (v) => (heavyType(v) ? 0.55 : isBike(v) ? 1.5 : v.T.family === 'van' || v.type === 'van' || v.T.family === 'suv' ? 0.85 : 1);
const rearEngine = (v) => v.type === 'tuktuk' || v.T.base === 'tuktuk'; // Sri Lankan buses (Ashok Leyland / Tata) are front-engined beside the driver; the tuk-tuk's engine is under the rear seat

// ------------------------------------------------------------------------------------------------ exact hit proxy (per look)
// triangles in vehicle-local space (doors shut), tag 0 body / 1 glass / 2 front lamp / 3 rear lamp, glass pane per triangle
class Proxy {
  constructor(tris, tags, splits = null) {
    this.tris = tris; this.tags = tags; this.splits = splits; const n = tags.length; this.n = n;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < tris.length; i += 3) for (let k = 0; k < 3; k++) { const a = tris[i + k]; if (a < mn[k]) mn[k] = a; if (a > mx[k]) mx[k] = a; }
    this.mn = mn; this.mx = mx; const G = this.G = [6, 4, 14]; const cs = this.cs = [0, 1, 2].map((k) => (mx[k] - mn[k]) / G[k] || 1);
    const cells = this.cells = new Array(G[0] * G[1] * G[2]); for (let c = 0; c < cells.length; c++) cells[c] = [];
    for (let t = 0; t < n; t++) { const b = t * 9; const lo = [0, 0, 0], hi = [0, 0, 0];
      for (let k = 0; k < 3; k++) { const a = Math.min(tris[b + k], tris[b + 3 + k], tris[b + 6 + k]), z = Math.max(tris[b + k], tris[b + 3 + k], tris[b + 6 + k]); lo[k] = Math.max(0, Math.min(G[k] - 1, Math.floor((a - mn[k]) / cs[k]))); hi[k] = Math.max(0, Math.min(G[k] - 1, Math.floor((z - mn[k]) / cs[k]))); }
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) cells[(x * G[1] + y) * G[2] + z].push(t); }
    this.stamp = new Uint32Array(n); this.sN = 1; this.pane = new Int8Array(n).fill(-1); this.panes = []; this.glassPanes(); this.bodyBox();
  }
  bodyBox() { this.box = { mn: this.mn.slice(), mx: this.mx.slice() }; }
  // all surfaces along the ray (sorted), local o / d, d unit
  ray(o, d, tMax, out) {
    out.length = 0; const T = this.tris, G = this.G, cs = this.cs, mn = this.mn; if (++this.sN > 4e9) { this.stamp.fill(0); this.sN = 1; } const s = this.sN;
    if (!slab(o, d, mn, this.mx, tMax)) return out;
    for (let x = 0; x < G[0]; x++) for (let y = 0; y < G[1]; y++) for (let z = 0; z < G[2]; z++) { const L0 = this.cells[(x * G[1] + y) * G[2] + z]; if (!L0.length) continue;
      const a = [mn[0] + x * cs[0], mn[1] + y * cs[1], mn[2] + z * cs[2]], b = [a[0] + cs[0], a[1] + cs[1], a[2] + cs[2]]; if (!slab(o, d, a, b, tMax)) continue;
      for (const t of L0) { if (this.stamp[t] === s) continue; this.stamp[t] = s; const i = t * 9;
        const e1x = T[i + 3] - T[i], e1y = T[i + 4] - T[i + 1], e1z = T[i + 5] - T[i + 2], e2x = T[i + 6] - T[i], e2y = T[i + 7] - T[i + 1], e2z = T[i + 8] - T[i + 2];
        const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x; const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-9) continue; const inv = 1 / det;
        const sx = o.x - T[i], sy = o.y - T[i + 1], sz = o.z - T[i + 2]; const u = (sx * px + sy * py + sz * pz) * inv; if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x; const w = (d.x * qx + d.y * qy + d.z * qz) * inv; if (w < 0 || u + w > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv; if (tt < 0 || tt > tMax) continue;
        let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; if (nx * d.x + ny * d.y + nz * d.z > 0) { nx = -nx; ny = -ny; nz = -nz; }
        out.push({ t: tt, tri: t, tag: this.tags[t], n: [nx, ny, nz] }); } }
    out.sort((p, q) => p.t - q.t); return out;
  }
  // glass panes: windscreen, rear screen, roof glass, then each side window (contiguous along z, split at the pillars)
  glassPanes() {
    const T = this.tris, P = this.pane; const g = []; let cz = 0, cn = 0;
    for (let t = 0; t < this.n; t++) if (this.tags[t] === 1) { const i = t * 9; const c = [(T[i] + T[i + 3] + T[i + 6]) / 3, (T[i + 1] + T[i + 4] + T[i + 7]) / 3, (T[i + 2] + T[i + 5] + T[i + 8]) / 3];
      const e1 = [T[i + 3] - T[i], T[i + 4] - T[i + 1], T[i + 5] - T[i + 2]], e2 = [T[i + 6] - T[i], T[i + 7] - T[i + 1], T[i + 8] - T[i + 2]]; let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
      g.push({ t, c, n, z0: Math.min(T[i + 2], T[i + 5], T[i + 8]), z1: Math.max(T[i + 2], T[i + 5], T[i + 8]) }); cz += c[2]; cn++; }
    if (!cn) return; cz /= cn; const panes = this.panes; const add = (kind, list) => { if (!list.length || panes.length >= MAX_PANES) return; const id = panes.length; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (const q of list) { P[q.t] = id; const i = q.t * 9; for (let k = 0; k < 9; k++) { const a = T[i + k], j = k % 3; if (a < mn[j]) mn[j] = a; if (a > mx[j]) mx[j] = a; } }
      for (let j = 0; j < 3; j++) { mn[j] -= 0.03; mx[j] += 0.03; } let nx = 0, ny = 0, nz = 0; for (const q of list) { const s = Math.sign(q.n[0] * (q.c[0]) + q.n[1] * (q.c[1] - 1) + q.n[2] * (q.c[2] - cz)) || 1; nx += q.n[0] * s; ny += q.n[1] * s; nz += q.n[2] * s; } const nl = Math.hypot(nx, ny, nz) || 1;
      panes.push({ kind, mn, mx, n: [nx / nl, ny / nl, nz / nl], tris: list.length, c: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2] }); };
    const ws = [], rs = [], roof = [], side = { 1: [], '-1': [] }; let topY = -Infinity; for (const q of g) topY = Math.max(topY, q.c[1]);
    for (const q of g) { if (Math.abs(q.n[0]) > 0.5) side[q.c[0] > 0 ? 1 : -1].push(q); else if (Math.abs(q.n[1]) > 0.97 && q.c[1] > topY - 0.06) roof.push(q); else (q.c[2] > cz ? ws : rs).push(q); }
    add(0, ws); add(0, rs); if (roof.length > 2) add(2, roof); else { for (const q of roof) (q.c[2] > cz ? ws : rs).push(q); }
    for (const sd of [1, -1]) { const L0 = side[sd].sort((a, b) => a.z0 - b.z0); let groups = []; let cur = null, end = -Infinity;
      const S = this.splits && this.splits[sd]; if (S && S.length) { // doors on this side: a window per door, the quarter glass behind / ahead
        const by = new Map(); for (const q of L0) { let k = 0; while (k < S.length && q.c[2] > S[k]) k++; if (!by.has(k)) by.set(k, []); by.get(k).push(q); } groups = [...by.keys()].sort((a, b) => a - b).map((k) => by.get(k)); }
      else for (const q of L0) { if (!cur || q.z0 > end + 0.035) { cur = []; groups.push(cur); end = q.z1; } else end = Math.max(end, q.z1); cur.push(q); }
      while (groups.length > 7) { let bi = 0, bs = Infinity; for (let k = 0; k < groups.length - 1; k++) { const s = groups[k].length + groups[k + 1].length; if (s < bs) { bs = s; bi = k; } } groups.splice(bi, 2, groups[bi].concat(groups[bi + 1])); }
      for (const gr of groups) add(1, gr); }
    // long side strips (bus / van windows in one piece): window-sized sections, each breaks on its own (looked up by the hit point)
    for (let i = panes.length - 1; i >= 0; i--) { const p = panes[i]; const len = p.mx[2] - p.mn[2]; if (p.kind !== 1 || len < 1.8) continue; const n = Math.min(6, Math.round(len / 1.15), MAX_PANES - panes.length + 1); if (n < 2) continue;
      const parts = []; for (let k = 0; k < n; k++) { const z0 = p.mn[2] + len * k / n, z1 = p.mn[2] + len * (k + 1) / n; parts.push({ ...p, grp: i + 1, mn: [p.mn[0], p.mn[1], z0], mx: [p.mx[0], p.mx[1], z1], c: [p.c[0], p.c[1], (z0 + z1) / 2], tris: Math.round(p.tris / n) }); }
      panes.splice(i, 1, ...parts); for (let t = 0; t < this.n; t++) { if (P[t] < 0) continue; if (P[t] > i) P[t] += n - 1; else if (P[t] === i) { const z = (T[t * 9 + 2] + T[t * 9 + 5] + T[t * 9 + 8]) / 3; P[t] = i + Math.max(0, Math.min(n - 1, Math.floor((z - p.mn[2]) / len * n))); } } }
  }
  // the pane under a point on the glass: its box (sections of a long strip), else the triangle's pane
  paneAt(p, tri) { const pi = tri >= 0 ? this.pane[tri] : -1; const q0 = this.panes[pi]; if (!q0 || !q0.grp) return pi; for (let i = 0; i < this.panes.length; i++) { const q = this.panes[i]; if (q.grp === q0.grp && p.z >= q.mn[2] && p.z <= q.mx[2]) return i; } return pi; }
}
function slab(o, d, a, b, tMax) { let t0 = 0, t1 = tMax; for (const k of ['x', 'y', 'z']) { const j = k === 'x' ? 0 : k === 'y' ? 1 : 2; const dk = d[k]; if (Math.abs(dk) < 1e-9) { if (o[k] < a[j] || o[k] > b[j]) return false; continue; } let u = (a[j] - o[k]) / dk, w = (b[j] - o[k]) / dk; if (u > w) { const s = u; u = w; w = s; } t0 = Math.max(t0, u); t1 = Math.min(t1, w); if (t0 > t1) return false; } return true; }
const proxies = new Map();
function proxyOf(v) {
  const ud = v.mesh.userData; const B = ud.bake; const key = v.type + '|' + (ud.real ? 'real' : ((B ? B.shared.paint : null) || (v.mesh.getObjectByName('paint') || {}).geometry || {}).uuid);
  let P = proxies.get(key); if (P) return P;
  const src = []; if (ud.real) for (const m of ud.real.mid.children) src.push([m.name, m.geometry]);
  else if (B) for (const name in B.shared) src.push([name, B.shared[name]]); else for (const c of v.mesh.children) if (c.isMesh && c.name) src.push([c.name, c.geometry]);
  const tris = [], tags = [], nm = [], names = []; for (const [name, geo] of src) { const ni = names.length; names.push(name); if (PROXY_SKIP.has(name) || !geo || !geo.attributes || !geo.attributes.position) continue; const p = geo.attributes.position, I = geo.index; const n = I ? I.count : p.count; const tag = name === 'glass' ? 1 : LAMP_F.has(name) ? 2 : LAMP_R.has(name) ? 3 : 0;
    for (let k = 0; k + 2 < n; k += 3) { for (let j = 0; j < 3; j++) { const vi = I ? I.getX(k + j) : k + j; tris.push(p.getX(vi), p.getY(vi), p.getZ(vi)); } tags.push(tag); nm.push(ni); } }
  // side windows split at the door edges (hinged doors: front edge = hinge, rear edge = hinge - length)
  let splits = null; const D = (ud.doors || []).filter((d) => !d.leaf); if (D.length) { splits = { 1: [], '-1': [] }; for (const d of D) { const sd = (d.hx || 0) > 0 ? 1 : -1; for (const z of [d.hz, d.hz - (d.len || 1)]) if (!splits[sd].some((q) => Math.abs(q - z) < 0.06)) splits[sd].push(z); } splits[1].sort((a, b) => a - b); splits[-1].sort((a, b) => a - b); }
  P = tags.length > 8 ? new Proxy(new Float32Array(tris), Uint8Array.from(tags), splits) : null; if (P) { P.nameOf = Uint8Array.from(nm); P.names = names; } proxies.set(key, P); return P; // nameOf: which mesh each triangle came from (tools)
}

// ------------------------------------------------------------------------------------------------ shared materials / textures
let SH = null;
function shared() {
  if (SH) return SH; const M = vehicleMaterials().mats;
  // bullet hole: dark puncture, a ring of bare steel where the paint flaked off, a soft dirty halo
  const hc = document.createElement('canvas'); hc.width = hc.height = 64; const x = hc.getContext('2d'); x.clearRect(0, 0, 64, 64);
  let gr = x.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(40,36,32,0.55)'); gr.addColorStop(1, 'rgba(40,36,32,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  x.beginPath(); for (let i = 0; i <= 18; i++) { const a = i / 18 * Math.PI * 2, r = 10 + Math.random() * 4; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } x.fillStyle = 'rgba(178,176,170,1)'; x.fill();
  gr = x.createRadialGradient(32, 32, 1, 32, 32, 7); gr.addColorStop(0, 'rgba(4,4,4,1)'); gr.addColorStop(0.7, 'rgba(14,13,12,1)'); gr.addColorStop(1, 'rgba(60,58,55,1)'); x.fillStyle = gr; x.beginPath(); x.arc(32, 32, 7, 0, Math.PI * 2); x.fill();
  const holeTex = new THREE.CanvasTexture(hc); holeTex.colorSpace = THREE.SRGBColorSpace;
  const holeMat = new THREE.MeshStandardMaterial({ map: holeTex, transparent: true, depthWrite: false, roughness: 0.45, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const holeGeo = new THREE.PlaneGeometry(0.07, 0.07);
  // charred bodywork: soot black, burnt-oxide brown and pale ash in blotches (object-space noise: bodies have no UVs)
  const charPaint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.35 });
  charPaint.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vChP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvChP = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vChP; float chH(vec3 p) { return fract(sin(dot(p, vec3(17.1, 113.7, 41.3))) * 43758.5); }
float chN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(chH(i), chH(i + vec3(1,0,0)), f.x), mix(chH(i + vec3(0,1,0)), chH(i + vec3(1,1,0)), f.x), f.y), mix(mix(chH(i + vec3(0,0,1)), chH(i + vec3(1,0,1)), f.x), mix(chH(i + vec3(0,1,1)), chH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float n = chN(vChP * 3.1) * 0.6 + chN(vChP * 9.7) * 0.3 + chN(vChP * 31.0) * 0.1; float m = chN(vChP * 0.9 + 7.0); vec3 soot = mix(vec3(0.018, 0.017, 0.016), vec3(0.055, 0.052, 0.048), m * m), oxide = vec3(0.09, 0.052, 0.032), ash = vec3(0.24, 0.23, 0.215);
  // charcoal soot (patchy, greyer where the heat burnt it off), dull iron-oxide where the bare steel shows, pale ash in streaks
  diffuseColor.rgb = mix(soot, oxide, smoothstep(0.56, 0.76, n) * 0.85); diffuseColor.rgb = mix(diffuseColor.rgb, ash, smoothstep(0.8, 0.92, n) * 0.5); }`);
  };
  charPaint.customProgramCacheKey = () => 'vd-char';
  const charMetal = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.75, metalness: 0.7 });
  const charSoft = new THREE.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 1, metalness: 0 });
  const charMetal2 = new THREE.MeshStandardMaterial({ color: 0x5d5853, roughness: 0.9, metalness: 0.3, side: THREE.DoubleSide }); /* burnt alloy goes a dull ash grey */ // a thrown wheel tumbles: its rim (modelled from the outside only) is seen from behind too
  const invis = new THREE.MeshBasicMaterial({ visible: false });
  // tempered-glass cubes and metal fragments (instanced, one draw each)
  const shardMat = new THREE.MeshStandardMaterial({ color: 0xb9cfd0, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.75, envMapIntensity: 1.4, side: THREE.DoubleSide });
  const shardGeo = new THREE.BufferGeometry(); shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.4, 0.55, 0, -0.3, 0.05, 0, 0.6, -0.5, 0.25, -0.4, 0.55, 0.25, -0.3, 0.05, 0.25, 0.6], 3)); shardGeo.setIndex([0, 1, 2, 3, 5, 4, 0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5, 2, 5, 0, 0, 5, 3]); shardGeo.computeVertexNormals();
  const fragGeo = new THREE.BoxGeometry(1, 0.12, 0.7, 2, 1, 2); { const p = fragGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.7 + 0.6 * hash1(i)), p.getY(i) + (hash1(i + 9) - 0.5) * 0.1, p.getZ(i) * (0.6 + 0.8 * hash1(i + 3))); fragGeo.computeVertexNormals(); }
  const fragMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.55 });
  SH = { M, holeMat, holeGeo, charPaint, charMetal, charMetal2, charSoft, invis, shardMat, shardGeo, fragGeo, fragMat, glassProto: M.vglass };
  return SH;
}
// The damaged-glass material: a copy of the vehicle glass whose shader discards the missing panes and draws the cracks.
// One program for every damaged vehicle (customProgramCacheKey); each vehicle owns its uniform block, each mesh its offset.
function glassMaterial(U, off) {
  const S = shared(); const m = new THREE.MeshPhysicalMaterial(); m.copy(S.glassProto); const uOff = { value: new THREE.Vector3().copy(off) };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uVdMin: U.min, uVdMax: U.max, uVdCr: U.cr, uVdCrN: U.crn, uVdOff: uOff });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform vec3 uVdOff; varying vec3 vVdP; varying vec3 vVdN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvVdP = position + uVdOff; vVdN = objectNormal;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
uniform vec4 uVdMin[${MAX_PANES}]; uniform vec4 uVdMax[${MAX_PANES}]; uniform vec4 uVdCr[${MAX_CRACKS}]; uniform vec4 uVdCrN[${MAX_CRACKS}]; varying vec3 vVdP; varying vec3 vVdN;
float vdH(float x) { return fract(sin(x * 91.7) * 43758.5453); }
// one bullet strike on laminated glass: crushed core with the hole, radial cracks (some long, some short) and broken rings
vec2 vdCrack(vec3 p, vec4 c, vec4 cn, float aa) {
  vec3 d = p - c.xyz; float r = length(d); if (r > c.w) return vec2(0.0);
  vec3 n = normalize(cn.xyz); vec3 u = normalize(abs(n.y) < 0.9 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0))); vec3 w = cross(n, u);
  vec2 q = vec2(dot(d, u), dot(d, w)); float rn = r / c.w; float sd = cn.w * 37.0;
  if (r < 0.0042) return vec2(1.0, 1.0);
  // crushed core: a frosted disc of pulverised glass round the hole with chipped specks at its edge
  float core = 1.0 - smoothstep(0.007, 0.02, r); float chips = step(0.78, vdH(dot(floor(q * 420.0), vec2(1.0, 57.0)) + sd)) * (1.0 - smoothstep(0.016, 0.042, r)) * smoothstep(0.008, 0.016, r);
  // radial cracks: 9-14 per strike, wandering, of different lengths, thinning and fading toward their tips, each its own brightness
  float sp = 9.0 + floor(vdH(sd) * 6.0); float a = (atan(q.y, q.x) + 3.14159) / 6.28318 * sp + vdH(sd + 2.0) * 4.0; float id = floor(a);
  float jit = (vdH(id + sd) - 0.5) * 0.45 + sin(r * 55.0 + id * 2.3) * 0.07 + sin(r * 190.0 + id * 5.1) * 0.025; float dist = abs(fract(a) - 0.5 - jit) * 6.28318 / sp * r;
  float len = 0.3 + 0.7 * vdH(id * 3.7 + sd); float wd = max(0.00045, aa * 0.7) * (1.35 - rn * 0.9);
  float spoke = (1.0 - smoothstep(wd * 0.4, wd * 1.4, dist)) * (1.0 - smoothstep(len * 0.55, len, rn)) * (0.5 + 0.5 * vdH(id * 1.9 + sd));
  // ring fractures between neighbouring spokes: short broken arcs on 2-3 radii
  float rg = rn * 4.0 + vdH(id + sd * 1.3) * 0.6; float ri = floor(rg); float dr = abs(fract(rg) - 0.5) * c.w * 0.25;
  float ring = (1.0 - smoothstep(wd * 0.4, wd * 1.3, abs(dr - c.w * 0.125))) * step(0.5, vdH(id * 5.1 + ri * 1.7 + sd)) * step(ri, 2.0) * 0.65;
  return vec2(clamp(max(max(spoke, ring) * (1.0 - rn * 0.35), max(core * 0.82, chips * 0.6)), 0.0, 1.0), 0.0);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ vec3 nn = normalize(vVdN);
  for (int i = 0; i < ${MAX_PANES}; i++) { vec4 a = uVdMin[i], b = uVdMax[i]; if (a.w < 0.5) continue; if (any(lessThan(vVdP, a.xyz)) || any(greaterThan(vVdP, b.xyz))) continue;
    float k = b.w; bool fits = k < 0.5 ? abs(nn.x) < 0.6 && abs(nn.y) < 0.86 : k < 1.5 ? abs(nn.x) > 0.4 : abs(nn.y) > 0.8; if (fits) discard; }
  float aa = length(fwidth(vVdP)) * 0.8; float crack = 0.0;
  for (int i = 0; i < ${MAX_CRACKS}; i++) { if (uVdCr[i].w <= 0.0) continue; vec2 c = vdCrack(vVdP, uVdCr[i], uVdCrN[i], aa); if (c.y > 0.5) discard; crack = max(crack, c.x); }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.84, 0.84), crack * 0.78); diffuseColor.a = max(diffuseColor.a, crack * 0.85); }`);
  };
  m.customProgramCacheKey = () => 'vd-glass'; m.userData.vdOff = uOff; return m;
}
// ------------------------------------------------------------------------------------------------ the system
export class VehicleDamage {
  constructor(game) {
    this.g = game; this.burning = new Set(); this.wrecks = new Set(); this.bodies = []; this.hits = [];
    this.stats = { shots: 0, glass: 0, shattered: 0, tyres: 0, holes: 0, dents: 0, scrapes: 0, fires: 0, explosions: 0, occupants: 0, debris: 0 };
    VEH_HOOKS.impact = (v, s, c) => this.onImpact(v, s, c); VEH_HOOKS.dispose = (v) => this.onDispose(v);
    // free-swinging doors (DoorRig): what the free edge can hit, and tearing a door off its hinges
    DOOR_HOOKS.detach = (v, d, w) => this.detachDoor(v, d, w);
    DOOR_HOOKS.blocked = (x, z, y) => { const C = this.g.collision; if (!C || !C.query) return false; const r = 0.06;
      for (const c of C.query(x - r, z - r, x + r, z + r)) { if (c.kind === 'deck' || c.kind === 'platform' || c.h < 0.5 || c.walkUnder) continue; const y0 = c.y0 || 0; if (y0 > y + 1.1 || y0 + c.h < y + 0.35) continue;
        if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true; } return false; };
    this.pools = null; this._e = new THREE.Euler();
  }
  // ---- per-vehicle state (lazy)
  st(v) {
    if (v.vd) return v.vd; v.vd = { own: new Map(), owned: [], glass: null, holes: null, nHole: 0, zones: new Float32Array(10), fire: null, dentT: 0, scrapeT: 0, smoulder: 0, flats: 0, lampsF: 0, lampsR: 0 };
    if (!(v.health > 0)) v.health = 100; return v.vd;
  }
  // ---- rays: vehicle-local
  toLocal(v, o, d) { const m = v.mesh; m.updateMatrixWorld(true); tmpM.copy(m.matrixWorld).invert(); return { o: o.clone().applyMatrix4(tmpM), d: d.clone().transformDirection(tmpM) }; }
  toWorld(v, p) { return p.clone().applyMatrix4(v.mesh.matrixWorld); }
  // Fallback test for vehicles without a proxy (bikes, odd bodies): the body box
  boxRay(v, o, d, tMax) { const T = v.T, hw = T.wid / 2, hl = T.len / 2; const a = [-hw, 0.15, -hl], b = [hw, T.hgt || 1.4, hl]; let t0 = 0, t1 = tMax, n0 = null;
    for (let j = 0; j < 3; j++) { const k = 'xyz'[j], dk = d[k]; if (Math.abs(dk) < 1e-9) { if (o[k] < a[j] || o[k] > b[j]) return null; continue; } let u = (a[j] - o[k]) / dk, w = (b[j] - o[k]) / dk; if (u > w) { const q = u; u = w; w = q; } if (u > t0) { t0 = u; n0 = [0, 0, 0]; n0[j] = dk > 0 ? -1 : 1; } t1 = Math.min(t1, w); if (t0 > t1) return null; }
    return [{ t: t0, tag: 0, tri: -1, n: n0 || [0, 1, 0] }, { t: t1, tag: 0, tri: -1, n: [0, 1, 0] }]; }
  // ================================================================ BULLETS
  // v, world ray (o, d unit), def { cls, dmg }, opts { by: 'player'|'police'|..., tMax }. Returns null when the shot misses the body
  // (passed over a bonnet / between the circles) or { point, normal, kind, pass, exit, occupant }.
  bullet(v, o, d, def = { cls: 'pistol', dmg: 0.75 }, opts = {}) {
    if (!v || v.disposed || v.isTrain || v.T.rail) return null; this.stats.shots++; const st = this.st(v);
    const { o: lo, d: ld } = this.toLocal(v, o, d); const tMax = opts.tMax ?? 400; const P = isBike(v) ? null : proxyOf(v);
    const hits = (P ? P.ray(lo, ld, tMax, this.hits) : this.boxRay(v, lo, ld, tMax)) || [];
    let first = hits[0] || { t: Infinity, tag: -1, n: [0, 1, 0] }; let kind = first.tag === 1 ? 'glass' : first.tag === 2 ? 'lampF' : first.tag === 3 ? 'lampR' : 'body';
    // tyres stick out of the body: a sphere test per wheel
    for (const w of v.mesh.userData.wheels || []) { if (!w.visible) continue; const c = w.position, R = v.T.wheelR * 0.98; const ox = lo.x - c.x, oy = lo.y - c.y, oz = lo.z - c.z; const b = ox * ld.x + oy * ld.y + oz * ld.z, cc = ox * ox + oy * oy + oz * oz - R * R; const disc = b * b - cc; if (disc < 0) continue; const t = -b - Math.sqrt(disc); if (t > 0 && t < first.t + (isBike(v) ? 0.7 : 0.05)) { first = { t, tag: 9, wheel: w, n: [ox + ld.x * t, oy + ld.y * t, oz + ld.z * t].map((q) => q / R) }; kind = 'tyre'; } }
    if (!Number.isFinite(first.t)) return null;
    const pl = lo.clone().addScaledVector(ld, first.t); const nl = new THREE.Vector3(...first.n); const T = v.T, hl = T.len / 2, H = T.hgt || 1.4;
    const cls = def.cls || 'pistol', dmg = def.dmg || 0.75; let pass = 0, zone = 'body', hpLoss = 0;
    if (v.wrecked) { pass = kind === 'glass' ? 1 : 0.3; if (kind !== 'glass') this.hole(v, pl, nl, 0.8); }
    else if (kind === 'glass') { pass = 0.9; this.glassHit(v, P, first.tri, pl, nl, 'bullet'); }
    else if (kind === 'lampF' || kind === 'lampR') { pass = 0.4; this.lamp(v, kind === 'lampF', pl); hpLoss = dmg * 1.2; }
    else if (kind === 'tyre') { pass = 0; this.burst(v, first.wheel); }
    else { const fr = rearEngine(v) ? -pl.z : pl.z; zone = fr > hl * 0.42 && pl.y < H * 0.72 ? 'engine' : (fr < -hl * 0.45 && pl.y < 0.75) ? 'tank' : 'body';
      pass = zone === 'engine' ? 0.08 : cls === 'sniper' ? 0.88 : cls === 'rifle' ? 0.66 : 0.48; hpLoss = dmg * (zone === 'engine' ? 7 : zone === 'tank' ? 4 : 2.2); this.hole(v, pl, nl, 1);
      Audio.bulletMetal && Audio.bulletMetal(v.x, v.z, zone === 'engine');
      if (zone === 'tank' && !st.fire && v.health < 75 && Math.random() < 0.12 + (cls === 'sniper' ? 0.1 : 0)) this.ignite(v, rnd(3, 4.5), opts.by, 'tank'); }
    if (hpLoss) this.hurt(v, hpLoss, opts.by);
    // the bullet's path inside: exit at the far surface, occupants in between
    let exitL = null, occupant = null;
    if (pass > 0.05 && hits.length > 1) { const last = hits[hits.length - 1]; if (last.t > first.t + 0.12) { exitL = lo.clone().addScaledVector(ld, last.t);
      if (!v.wrecked) { if (last.tag === 1) this.glassHit(v, P, last.tri, exitL, new THREE.Vector3(...last.n).negate(), 'exit'); else if (last.tag === 0) this.hole(v, exitL, new THREE.Vector3(...last.n).negate(), 0.75); }
      pass *= last.tag === 1 ? 0.92 : cls === 'pistol' ? 0.55 : 0.75; } }
    if (!opts.noOccupants && !v.wrecked) occupant = this.occupantHit(v, o, d, first.t, exitL ? lo.distanceTo(exitL) : first.t + T.wid, dmg * Math.max(0.35, pass), opts.by, opts);
    const R = { point: this.toWorld(v, pl), normal: nl.clone().transformDirection(v.mesh.matrixWorld), kind, zone, pass: exitL ? pass : 0, exit: exitL ? this.toWorld(v, exitL) : null, occupant };
    if (v.ai && !v.wrecked) { v.ai.bumped = 2.5; if (v.health < 55 && Math.random() < 0.25) this.g.traffic?.abandon?.(v, opts.by === 'player' && this.g.player ? { x: this.g.player.x, z: this.g.player.z } : null, true); }
    return R;
  }
  // people in the seats: chest / head points against the bullet's path inside the car
  occupantHit(v, o, d, t0, t1, dmg, by, opts = {}) {
    const list = []; const P = this.g.player; if (P && P.vehicle === v && P.ch) list.push({ ch: P.ch, player: true }); if (v.driverChar && !v.driverChar.vdDead) list.push({ ch: v.driverChar }); for (const ch of v.pax || []) if (!ch.vdDead) list.push({ ch });
    let best = null, bd = Infinity;
    for (const q of list) { q.ch.root.getWorldPosition(tmpV); for (const [dy, r, head] of [[0.42, 0.24, false], [0.74, 0.14, true]]) { tmpV2.set(tmpV.x, tmpV.y + dy, tmpV.z).sub(o); const t = tmpV2.dot(d); if (t < t0 - 0.3 || t > t1 + 0.3) continue; const dist = Math.sqrt(Math.max(0, tmpV2.lengthSq() - t * t)); if (dist < r && dist < bd) { bd = dist; best = { ...q, head, t, at: o.clone().addScaledVector(d, t) }; } } }
    if (!best) return null; this.stats.occupants++; const g = this.g; const k = best.head ? 3 : 1;
    if (best.player) { if (g.health) g.health.damage((opts.playerHp ? opts.playerHp * Math.min(1, dmg / 0.75) : 22 * dmg) * (best.head ? 2 : 1), opts.by === 'police' ? 'shot by police' : 'shot through the car'); return 'player'; }
    const ch = best.ch; if (g.blood) { g.blood.wound(ch, best.at, d, dmg * k); g.blood.spray(best.at, d, dmg); }
    if (dmg * k >= 0.55 || best.head) { ch.vdDead = true; ch.root.rotation.x += 0.32; ch.root.rotation.z += (ch.root.position.x > 0 ? 1 : -1) * 0.28; if (ch.anim) { ch.anim.set?.(null); ch.anim.duck = 0.6; }
      if (v.driverChar === ch) g.traffic?.abandon?.(v, null, true); else g.traffic?.abandon?.(v, g.player ? { x: g.player.x, z: g.player.z } : null, true); }
    else g.traffic?.abandon?.(v, g.player ? { x: g.player.x, z: g.player.z } : null, true);
    if (by === 'player' && g.police && g.police.addHeat && !g.debug?.noWanted) g.police.addHeat(1, 'shooting a driver', 'Shots fired at a vehicle.');
    return ch;
  }
  hurt(v, n, by) {
    if (v.wrecked) return; const st = this.st(v); v.health = Math.max(0, v.health - n * armour(v) * (v.tune ? v.tune.armour : 1)); /* Street Customs armour */
    const h = v.health; v.damage = Math.max(v.damage || 0, h < 40 ? 0.72 + (40 - h) / 40 * 0.28 : h < 70 ? 0.35 + (70 - h) / 30 * 0.3 : v.damage || 0);
    this.setPower(v);
    if (h <= 0 && !st.fire) this.ignite(v, rnd(6, 9), by, 'engine');
  }
  // engine output: a dying engine below 15 %, each flat tyre drags (Vehicle.drive scales acceleration and top speed by it)
  setPower(v) { const h = v.health, st = this.st(v); v.power = (h <= 0 ? 0.1 : h < 15 ? 0.35 + h / 15 * 0.3 : 1) * Math.pow(0.82, st.flats); }
  // ================================================================ GLASS
  glassState(v, P) {
    const st = this.st(v); if (st.glass) return st.glass; const panes = (P && P.panes) || []; const S = shared(); const ud = v.mesh.userData;
    const U = { min: { value: Array.from({ length: MAX_PANES }, () => new THREE.Vector4()) }, max: { value: Array.from({ length: MAX_PANES }, () => new THREE.Vector4()) }, cr: { value: Array.from({ length: MAX_CRACKS }, () => new THREE.Vector4()) }, crn: { value: Array.from({ length: MAX_CRACKS }, () => new THREE.Vector4()) } };
    panes.forEach((p, i) => { U.min.value[i].set(p.mn[0], p.mn[1], p.mn[2], 0); U.max.value[i].set(p.mx[0], p.mx[1], p.mx[2], p.kind); });
    const G = st.glass = { U, panes, hits: new Int16Array(MAX_PANES), broken: new Uint8Array(MAX_PANES), nCr: 0, mats: [] };
    const body = glassMaterial(U, new THREE.Vector3()); G.body = body; G.mats.push(body);
    const set = (mesh, m) => { if (!mesh) return; mesh.material = Array.isArray(mesh.material) ? [m] : m; };
    if (ud.bake) { G.orig = ud.bake.mats.glass; ud.bake.mats.glass = body; set(ud.bake.meshes.glass, body); } else for (const c of v.mesh.children) if (c.isMesh && c.name === 'glass') { G.orig = c.material; set(c, body); }
    for (const grp of [ud.detail, ud.real && ud.real.mid, ud.real && ud.real.low]) if (grp) for (const c of grp.children) if (c.name === 'glass') { G.origD = G.origD || c.material; set(c, body); }
    for (const d of ud.doors || []) { const ms = this.pivotMeshes(v, d); const gm = ms && ms.find((m) => m.name === 'glass'); if (gm) { const m = glassMaterial(U, d.pivot.position.clone().set(d.hx, 0, d.hz)); G.mats.push(m); gm.material = m; } }
    void S; return G;
  }
  // door meshes on their pivot (created here when the door has never been opened, exactly as DoorRig would)
  pivotMeshes(v, d) {
    const B = v.mesh.userData.bake; if (!B) return null;
    if (!d.pivot.children.length) for (const [name, geo] of B.pivotGeos(d.i)) { const m = new THREE.Mesh(geo, B.mats[name]); m.name = name; m.castShadow = name === 'paint'; m.receiveShadow = name === 'paint'; if (name === 'glass') m.renderOrder = 2; d.pivot.add(m); }
    return d.pivot.children;
  }
  glassHit(v, P, tri, pl, nl, why) {
    const G = this.glassState(v, P); let pi = P ? P.paneAt(pl, tri) : -1; if (pi < 0) { let bd = Infinity; G.panes.forEach((p, i) => { const d = Math.hypot(p.c[0] - pl.x, p.c[1] - pl.y, p.c[2] - pl.z); if (d < bd) { bd = d; pi = i; } }); } if (pi < 0 || G.broken[pi]) return;
    const pane = G.panes[pi]; G.hits[pi]++; this.stats.glass++; const wp = this.toWorld(v, pl);
    if (pane.kind === 0 && pi === 0) { // laminated windscreen: holds together, a crack star per strike; after ~8 it sags out of the frame
      this.crack(v, G, pl, nl, why === 'crash' ? 0.32 : rnd(0.12, 0.2)); Audio.glassCrack && Audio.glassCrack(wp.x, wp.z);
      if (G.hits[pi] >= 8 || (why === 'crash' && G.hits[pi] >= 3)) this.shatter(v, G, pi, true); }
    else this.shatter(v, G, pi, false);
  }
  crack(v, G, pl, nl, size) { const i = G.nCr % MAX_CRACKS; G.nCr++; G.U.cr.value[i].set(pl.x, pl.y, pl.z, size); G.U.crn.value[i].set(nl.x, nl.y, nl.z, Math.random()); }
  shatter(v, G, pi, laminated) {
    if (G.broken[pi]) return; G.broken[pi] = 1; G.U.min.value[pi].w = 1; this.stats.shattered++; const p = G.panes[pi]; const n = laminated ? 10 : Math.round(Math.min(70, 14 + p.tris * 0.15));
    const c = this.toWorld(v, tmpV.set(p.c[0], p.c[1], p.c[2])); Audio.glassShatter && Audio.glassShatter(c.x, c.z, laminated ? 0.6 : 1);
    // remove crack stars that sat on this pane
    for (let i = 0; i < MAX_CRACKS; i++) { const q = G.U.cr.value[i]; if (q.w > 0 && q.x > p.mn[0] && q.x < p.mx[0] && q.y > p.mn[1] && q.y < p.mx[1] && q.z > p.mn[2] && q.z < p.mx[2]) q.w = 0; }
    const out = tmpV2.set(p.n[0], p.n[1], p.n[2]).transformDirection(v.mesh.matrixWorld).clone();
    for (let i = 0; i < n; i++) { const lp = new THREE.Vector3(rnd(p.mn[0], p.mx[0]), rnd(p.mn[1], p.mx[1]), rnd(p.mn[2], p.mx[2])); const wp = this.toWorld(v, lp); const s = Math.random() < 0.5 ? 1 : -0.6; this.shard(wp, out.x * s * rnd(0.5, 2) + rnd(-0.6, 0.6), rnd(-0.2, 1.4), out.z * s * rnd(0.5, 2) + rnd(-0.6, 0.6), laminated ? rnd(0.04, 0.09) : rnd(0.012, 0.024)); }
  }
  lamp(v, front, pl) { const st = this.st(v); if (front) { st.lampsF++; if (st.lampsF >= 2 || Math.random() < 0.6) v.headOut = true; } else { st.lampsR++; if (st.lampsR >= 2 || Math.random() < 0.6) v.tailOut = true; } const wp = this.toWorld(v, pl); Audio.glassShatter && Audio.glassShatter(wp.x, wp.z, 0.35); for (let i = 0; i < 8; i++) this.shard(wp, rnd(-1, 1), rnd(0, 1.2), rnd(-1, 1), rnd(0.008, 0.02), front ? 0xf0f0ea : 0xb01010); }
  // ================================================================ TYRES
  burst(v, w) {
    const u = w.userData; if (u.flat) return; const K = v.tune; if (K && (K.runflat || (K.burstResist && Math.random() < K.burstResist))) return false; /* Customs run-flats / tough sidewalls */ u.flat = true; u.drop = v.T.wheelR * (isBike(v) ? 0.18 : 0.3); const st = this.st(v); st.flats++; this.stats.tyres++; this.setPower(v);
    w.updateWorldMatrix(true, false); const p = w.getWorldPosition(new THREE.Vector3()); Audio.tyreBurst && Audio.tyreBurst(p.x, p.z); const E = this.g.explosions;
    if (E) for (let i = 0; i < 6; i++) E.emit(E.smoke, 2, p.clone().add(tmpV.set(rnd(-0.2, 0.2), -0.2, rnd(-0.2, 0.2))), tmpV2.set(rnd(-2, 2), rnd(0.2, 1), rnd(-2, 2)), rnd(0.8, 1.4), 0.15, 0.7, 2, 0.1, 2.5, [0.55, 0.4, L.groundY(p.x, p.z)]);
    this.fitDrops(v); if (v.ai) v.ai.bumped = 3;
  }
  fitDrops(v) { const W = v.mesh.userData.wheels || []; let sd = 0, zd = 0, zz = 0, xd = 0, xx = 0; for (const w of W) { const d = w.userData.drop || 0, x = w.position.x, z = w.position.z; sd += d; zd += z * d; zz += z * z; xd += x * d; xx += x * x; }
    if (!sd) { v.dropFit = null; return; } v.dropFit = { h: sd / W.length, p: zz > 1e-6 ? zd / zz : 0, r: xx > 1e-6 ? -xd / xx : 0 }; }
  // ================================================================ BULLET HOLES
  hole(v, pl, nl, s = 1) {
    const st = this.st(v); const S = shared(); if (!st.holes) { const im = new THREE.InstancedMesh(S.holeGeo, S.holeMat, HOLES); im.count = 0; im.frustumCulled = false; im.castShadow = im.receiveShadow = false; im.renderOrder = 1; v.mesh.add(im); st.holes = im; }
    const im = st.holes; const i = st.nHole % HOLES; st.nHole++; im.count = Math.min(HOLES, st.nHole); this.stats.holes++;
    tmpQ.setFromUnitVectors(tmpV.set(0, 0, 1), tmpV2.copy(nl).normalize()); tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(tmpV.set(0, 0, 1), Math.random() * 6.28)); const sc = s * rnd(0.8, 1.15);
    tmpM.compose(tmpV.copy(pl).addScaledVector(nl, 0.004), tmpQ, tmpV2.set(sc, sc, sc)); im.setMatrixAt(i, tmpM); im.instanceMatrix.needsUpdate = true;
    const wp = this.toWorld(v, pl); this.sparkAt(wp, 5);
  }
  sparkAt(p, n) { const E = this.g.explosions; if (!E) return; const gy = L.groundY(p.x, p.z); for (let i = 0; i < n; i++) E.sparkEmit(p, tmpV2.set(rnd(-3, 3), rnd(0.5, 4), rnd(-3, 3)), rnd(0.15, 0.4), 0.012, gy + 0.02); E.flush(E.spark); }
  // ================================================================ COLLISIONS: dents, scrapes, glass, lamps
  onImpact(v, speed, c) {
    if (!v || v.disposed || v.wrecked || v.isTrain || (v.T && v.T.rail)) return; const st = this.st(v); const T = v.T, hw = T.wid / 2, hl = T.len / 2, H = T.hgt || 1.4;
    if (c && c.blast) { // a blast nearby: dents on the side facing it, glass blown in, health — a car next to an exploding car can go up too
      const f = c.blast, pw = c.pow || 1; const dir = this.localDir(v, c.nx, c.nz); this.dentFrom(v, dir, Math.min(0.16, 0.05 + 0.12 * f) * pw, 0.75, 0.55);
      if (f > 0.25 && !isBike(v)) { const G = this.glassState(v, proxyOf(v)); G.panes.forEach((p, i) => { const facing = -(p.n[0] * dir.x + p.n[2] * dir.z); if (facing > -0.2 && Math.random() < f * 1.3) { if (i === 0) { this.crack(v, G, tmpV.set(p.c[0] + rnd(-0.3, 0.3), p.c[1], p.c[2]), tmpV2.set(...p.n), 0.35); if (f > 0.6) this.shatter(v, G, i, true); } else this.shatter(v, G, i, false); } }); }
      this.hurt(v, 55 * f * f * pw + 6 * f, c.source); if (!v.wrecked && f > 0.62 * (heavyType(v) ? 1.3 : 1) && !st.fire && !isBike(v)) this.ignite(v, rnd(0.9, 2.6), c.source, 'blast'); else if (isBike(v) && f > 0.5) this.ignite(v, rnd(0.4, 1.2), c.source, 'blast'); return; }
    if (!c) return; if (c.land) { this.hurt(v, Math.max(0, speed - 8) * 0.6); return; }
    const dir = this.localDir(v, c.nx, c.nz); const now = performance.now();
    if (c.scrapeOnly || (c.slide || 0) > 3) { if (now - st.scrapeT > 100) { st.scrapeT = now; this.scrape(v, dir, c.t || 0, Math.min(1, (c.slide || 3) / 12)); } if (c.scrapeOnly) return; }
    if (speed < 3.2) return;
    this.hurt(v, Math.max(0, speed - 6) * (heavyType(v) ? 0.7 : 1.5));
    if (now - st.dentT < 90 && speed < 12) return; st.dentT = now;
    const D = Math.min(0.17, Math.max(0, (speed - 3) * 0.012)), R = Math.min(0.75, 0.26 + 0.022 * speed);
    if (!isBike(v)) { this.dentFrom(v, dir, D, R, null, c.t); this.impactDoors(v, dir, speed, c.t); }
    // what else breaks: lamps on the face that was hit, glass at the impact, the windscreen in a hard head-on
    const front = dir.z < -0.6, rear = dir.z > 0.6; if (D > 0.05) { if (front && Math.random() < D * 9) v.headOut = true; if (rear && Math.random() < D * 9) v.tailOut = true; }
    if (speed > 9 && !isBike(v)) { const P = proxyOf(v); const G = this.glassState(v, P); const hx = -Math.sign(dir.x) * hw, hz = front ? hl : rear ? -hl : (c.t || 0);
      G.panes.forEach((p, i) => { if (G.broken[i]) return; const d = Math.hypot(p.c[0] - hx * (Math.abs(dir.x) > 0.5 ? 1 : 0), p.c[2] - hz); const ch = (speed - 9) * 0.06 * Math.max(0, 1.6 - d); if (Math.random() < ch) { if (i === 0) this.glassHit(v, P, -1, tmpV.set(p.c[0] + rnd(-0.4, 0.4), p.c[1] + rnd(-0.1, 0.15), p.c[2]), tmpV2.set(...p.n), 'crash'); else this.shatter(v, G, i, false); } }); }
    void H;
  }
  // a crash and the doors: an open door on the side that was hit (or swung into a head-on) is torn off; a hard hit on a shut
  // door's side can spring its latch and it swings open (then the free-door physics has it). Not a door someone is using.
  impactDoors(v, dir, speed, t) {
    const ud = v.mesh.userData, D = ud.doors; if (!D || !D.length || !ud.bake) return;
    const sideHit = Math.abs(dir.x) > Math.abs(dir.z) * 0.8 ? -Math.sign(dir.x) : 0; // obstacle came from -dir: that side of the body
    for (const d of D) { if (d.gone || d.leaf || d.slide || doorHeld(d)) continue; const ds = Math.sign(d.hx) || d.side || 1; const open = (d.ang || 0) > 0.04;
      const inZ = t == null || (t <= d.hz + 0.3 && t >= d.hz - (d.len || 1) - 0.3);
      if (open) { const ch = sideHit === ds ? (inZ ? 0.45 + speed * 0.05 : 0.15 + speed * 0.03) : dir.z < -0.6 ? speed * 0.035 : 0;
        if (speed > 5 && Math.random() < ch && this.detachDoor(v, d, speed)) continue;
        if (sideHit === ds) d.vel = -Math.abs(d.vel || 0) - speed * 0.08; } // knocked toward the body
      else if (sideHit === ds && inZ && speed > 11 && !(v.player && d === ud.door) && Math.random() < (speed - 11) * 0.06) { d.ang = 0.03; d.vel = 0.5 + Math.random() * 0.7; freeDoorNow(v, d); } }
  }
  // tear a door off its hinges: the real door (its paint, glass, trim and any dents) becomes a rigid body that tumbles away with
  // the car's momentum and lies on the road; the opening stays open (the body view keeps the door's triangles out).
  detachDoor(v, d, w = 0) {
    const ud = v.mesh.userData; if (!d || d.gone || d.leaf || d.slide || !ud.bake || v.disposed) return false; const ms = this.pivotMeshes(v, d); if (!ms || !ms.length) return false;
    v.mesh.updateMatrixWorld(true); d.pivot.updateMatrixWorld(true); const S = shared();
    const bb = new THREE.Box3(); for (const m of ms) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox); } const ctr = bb.getCenter(new THREE.Vector3()), hs = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const holder = new THREE.Group(); holder.name = 'doorDebris'; for (const m of ms) { const mat = Array.isArray(m.material) ? m.material[0] : m.material; const mm = new THREE.Mesh(m.geometry, mat === S.invis ? S.charPaint : mat); mm.name = m.name; if (m.name === 'glass') mm.renderOrder = 2; mm.position.copy(ctr).negate(); holder.add(mm); }
    d.pivot.matrixWorld.decompose(holder.position, holder.quaternion, holder.scale); holder.position.copy(ctr.clone().applyMatrix4(d.pivot.matrixWorld)); holder.scale.set(1, 1, 1); this.g.scene.add(holder);
    d.gone = true; d.vel = 0; setDoorLive(ud, d, true); d.pivot.visible = false; v.mesh.remove(d.pivot);
    const [vx, vz] = vehicleVelocity(v); const side = Math.sign(d.hx) || d.side || 1; const o = tmpV2.set(side, 0, 0).transformDirection(v.mesh.matrixWorld);
    const out = rnd(1.2, 2.6) + Math.min(4, w * 0.15); const vel = new THREE.Vector3(vx * 0.8 + o.x * out, rnd(1.2, 2.8), vz * 0.8 + o.z * out);
    this.addBody(holder, vel, new THREE.Vector3(rnd(-5, 5), rnd(-7, 7), rnd(-5, 5)), [Math.max(0.04, hs.x), Math.max(0.2, hs.y), Math.max(0.2, hs.z)]);
    this.stats.doors = (this.stats.doors || 0) + 1; if (Audio.debrisHit) Audio.debrisHit(holder.position.x, holder.position.z, 1); if (v.slam) v.slam(1.4);
    return true;
  }
  // world contact normal (pushes the car away from the obstacle) → the inward dent direction in vehicle-local space
  localDir(v, nx, nz) { const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); return new THREE.Vector3(nx * fz - nz * fx, 0, nx * fx + nz * fz).normalize(); }
  // dent where an obstacle coming from -dir (local) meets the body; t: body offset along z of the contact (circle chain)
  dentFrom(v, dir, D, R, yC = null, t = null) {
    if (D <= 0.004) return; const T = v.T, hw = T.wid / 2, hl = T.len / 2; const p = new THREE.Vector3();
    if (Math.abs(dir.x) > Math.abs(dir.z)) p.set(-Math.sign(dir.x) * hw, 0, Math.max(-hl, Math.min(hl, t ?? rnd(-hl, hl) * 0.6))); else p.set(rnd(-hw, hw) * 0.45, 0, -Math.sign(dir.z) * hl);
    p.y = yC ?? (heavyType(v) ? 0.85 : 0.52) + rnd(-0.08, 0.08); this.dent(v, p, dir, D, R);
  }
  zoneOf(v, p) { const T = v.T; const ax = Math.abs(p.x) / (T.wid / 2), az = Math.abs(p.z) / (T.len / 2); return (ax > az ? (p.x > 0 ? 0 : 1) : (p.z > 0 ? 2 : 3)) + (p.y > (T.hgt || 1.4) * 0.6 ? 4 : 0); }
  // deformable meshes of this vehicle: [mesh, name, sourceGeometry, space] — body (bake or plain children), near-detail group
  deformables(v) {
    const ud = v.mesh.userData, B = ud.bake, out = [];
    if (B) { for (const name in B.meshes) if (DEFORM.has(name)) out.push({ mesh: B.meshes[name], name, kind: 'bake' }); }
    else for (const c of v.mesh.children) if (c.isMesh && DEFORM.has(c.name)) out.push({ mesh: c, name: c.name, kind: 'plain' });
    if (ud.detail) for (const c of ud.detail.children) if (c.isMesh && DEFORM.has(c.name)) out.push({ mesh: c, name: c.name, kind: 'plain' });
    return out;
  }
  // a private copy of a mesh's position / normal / colour (index, uv shared); baked bodies swap it into the bake so door
  // toggling (DoorRig.setDoorLive) keeps using it
  own(v, e) {
    const st = this.st(v), ud = v.mesh.userData, B = ud.bake; const src = e.kind === 'bake' ? B.shared[e.name] : e.mesh.geometry; if (src.userData.vdOwner === v) return src;
    const o = new THREE.BufferGeometry(); for (const k in src.attributes) o.setAttribute(k, (k === 'position' || k === 'normal' || k === 'color' || k === 'pmask') ? src.attributes[k].clone() : src.attributes[k]); /* pmask: Street Customs paint mask (scrapes take paint off) */ o.setIndex(src.index); for (const gr of src.groups) o.addGroup(gr.start, gr.count, gr.materialIndex);
    if (!src.boundingSphere) src.computeBoundingSphere(); o.boundingSphere = src.boundingSphere.clone(); o.boundingSphere.radius += 0.2; o.boundingBox = src.boundingBox; o.userData.vdOwner = v;
    st.owned.push({ o, src, mesh: e.mesh, name: e.name, kind: e.kind });
    if (e.kind === 'bake') { B.shared[e.name] = o; delete e.mesh.userData.view; const live = (ud.doors || []).find((d) => d.live); if (live) setDoorLive(ud, live, true); else e.mesh.geometry = o; }
    else e.mesh.geometry = o; ud.dmgHi = true; return o;
  }
  dent(v, p, dir, D, R) {
    const st = this.st(v); const zi = this.zoneOf(v, p); const cap = 0.36 - st.zones[zi]; if (cap <= 0.004) return; D = Math.min(D, cap); st.zones[zi] += D; this.stats.dents++;
    const R2 = R * R; const B = v.mesh.userData.bake; const touched = new Set();
    for (const e of this.deformables(v)) { const src = e.kind === 'bake' ? B.shared[e.name] : e.mesh.geometry; if (!src || !src.attributes.position) continue; if (!src.boundingSphere) src.computeBoundingSphere(); const bs = src.boundingSphere; if (bs.center.distanceTo(p) > bs.radius + R) continue;
      // quick reject without copying: any vertex in reach?
      const P0 = src.attributes.position; let any = false; for (let i = 0; i < P0.count; i += 7) { const dx = P0.getX(i) - p.x, dy = P0.getY(i) - p.y, dz = P0.getZ(i) - p.z; if (dx * dx + dy * dy + dz * dz < R2) { any = true; break; } } if (!any) continue;
      const o = this.own(v, e); const pos = o.attributes.position, nrm = o.attributes.normal, col = e.name === 'paint' ? o.attributes.color : null; const pa = pos.array, na = nrm ? nrm.array : null; let ch = false;
      for (let i = 0, j = 0; i < pos.count; i++, j += 3) { const dx = pa[j] - p.x, dy = pa[j + 1] - p.y, dz = pa[j + 2] - p.z; const d2 = dx * dx + dy * dy + dz * dz; if (d2 >= R2) continue; const q = 1 - d2 / R2, k = q * q, nz = 0.8 + 0.4 * hash1(i); const disp = D * k * nz;
        pa[j] += dir.x * disp; pa[j + 1] += dir.y * disp; pa[j + 2] += dir.z * disp; ch = true;
        if (na) { const gk = -4 * D * nz * q / R2; let gx = gk * dx, gy = gk * dy, gz = gk * dz; let nx = na[j], ny = na[j + 1], nzz = na[j + 2]; const gn = gx * nx + gy * ny + gz * nzz; gx -= gn * nx; gy -= gn * ny; gz -= gn * nzz; nx += gx; ny += gy; nzz += gz; const l = Math.hypot(nx, ny, nzz) || 1; na[j] = nx / l; na[j + 1] = ny / l; na[j + 2] = nzz / l; }
        if (col && disp > 0.02) { const f = 1 - 0.28 * Math.min(1, disp / 0.09); col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f); } }
      if (ch) { pos.needsUpdate = true; if (nrm) nrm.needsUpdate = true; if (col) col.needsUpdate = true; if (e.kind === 'bake') touched.add(e.name); } }
    if (touched.size) this.syncPivots(v, touched);
  }
  // door meshes on the pivots follow the dented body: their vertex block is a translated copy of the body's door range
  syncPivots(v, names) {
    const ud = v.mesh.userData, B = ud.bake; if (!B) return;
    for (const d of ud.doors || []) { if (d.gone) continue; let made = false;
      for (const name of names) { const R = B.ranges[name], r = R && R.doors.find((q) => q.door === d.i); if (!r) continue; if (!made) { this.pivotMeshes(v, d); made = true; } const m = d.pivot.children.find((c) => c.name === name); if (!m) continue;
        let g = m.geometry; if (g.userData.vdOwner !== v) { const o = new THREE.BufferGeometry(); for (const k in g.attributes) o.setAttribute(k, (k === 'position' || k === 'normal' || k === 'color' || k === 'pmask') ? g.attributes[k].clone() : g.attributes[k]); o.setIndex(g.index); o.boundingSphere = g.boundingSphere && g.boundingSphere.clone(); o.userData.vdOwner = v; o.userData.vdSrc = g; this.st(v).owned.push({ o, src: g, mesh: m, name, kind: 'pivot' }); m.geometry = g = o; }
        const S = B.shared[name]; for (const k of ['position', 'normal', 'color', 'pmask']) { const a = S.attributes[k], b = g.attributes[k]; if (!a || !b) continue; const n = a.itemSize; b.array.set(a.array.subarray(r.v0 * n, r.v1 * n)); if (k === 'position') for (let j = 0; j < b.array.length; j += 3) { b.array[j] -= d.hx; b.array[j + 2] -= d.hz; } b.needsUpdate = true; } } }
  }
  // paint scraped to bare metal along the contact (grinding a wall / another car): streaky, along the body
  scrape(v, dir, t, k) {
    if (isBike(v)) return; const T = v.T, hw = T.wid / 2, hl = T.len / 2; const side = Math.abs(dir.x) > Math.abs(dir.z); const y0 = heavyType(v) ? 0.75 : 0.5 + rnd(-0.1, 0.12), band = 0.07 + 0.05 * k;
    this.stats.scrapes++; const B = v.mesh.userData.bake;
    for (const e of this.deformables(v)) { if (e.name !== 'paint' && e.name !== 'livery' && e.name !== 'police' && e.name !== 'amb') continue; const src = e.kind === 'bake' ? B.shared[e.name] : e.mesh.geometry; if (!src.attributes.color) continue;
      const o = this.own(v, e); const pos = o.attributes.position, nrm = o.attributes.normal, col = o.attributes.color, pm = o.attributes.pmask || null; let ch = false;
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); if (Math.abs(y - y0) > band) continue;
        if (side) { if (Math.sign(x) !== -Math.sign(dir.x) || Math.abs(x) < hw * 0.75 || Math.abs(z - t) > 0.55 + k * 0.6) continue; if (nrm && nrm.getX(i) * -Math.sign(dir.x) < 0.3) continue; }
        else { if (Math.sign(z) !== -Math.sign(dir.z) || Math.abs(z) < hl * 0.8) continue; if (nrm && nrm.getZ(i) * -Math.sign(dir.z) < 0.3) continue; }
        const streak = 0.5 + 0.5 * Math.sin(y * 260 + hash1(Math.floor(y * 90)) * 6); const edge = 1 - Math.abs(y - y0) / band; const m = Math.min(1, (0.35 + 0.65 * k) * edge * (0.6 + 0.4 * streak));
        const g = 0.42 + 0.22 * streak; col.setXYZ(i, col.getX(i) + (g - col.getX(i)) * m, col.getY(i) + (g - col.getY(i)) * m, col.getZ(i) + (g * 0.97 - col.getZ(i)) * m); if (pm) pm.setX(i, pm.getX(i) * (1 - m)); ch = true; }
      if (ch) { col.needsUpdate = true; if (pm) pm.needsUpdate = true; if (e.kind === 'bake') this.syncPivots(v, new Set([e.name])); } }
  }
  // ================================================================ FIRE → EXPLOSION
  ignite(v, fuse, by, why) {
    const st = this.st(v); if (st.fire || v.wrecked) return; st.fire = { t: 0, T: fuse, by, why, snd: 0 }; v.burning = true; this.burning.add(v); this.stats.fires++; v.damage = 1;
    const g = this.g; if (v.player && g.hud) g.hud.notify('Vehicle on fire', 'Get out — the tank is about to go.', 'warn', 3.5);
    if (!v.player) g.traffic?.abandon?.(v, { x: v.x, z: v.z }, true); g.crowd?.alarm?.(v.x, v.z, 30, 2, null, 'fire', true);
  }
  firePoint(v, out) { const T = v.T, f = rearEngine(v) ? -1 : 1; const st = v.vd; const tank = st && st.fire && st.fire.why === 'tank'; out.set(tank ? T.wid * 0.3 : 0, tank ? 0.35 : (T.hgt || 1.4) * 0.55, (tank ? -0.36 : 0.36) * T.len * (tank ? 1 : f)); return out.applyMatrix4(v.mesh.matrixWorld); }
  explode(v, by = null) {
    if (v.wrecked || v.disposed) return; const g = this.g, st = this.st(v), T = v.T, ud = v.mesh.userData; this.stats.explosions++;
    v.wrecked = true; v.burning = false; this.burning.delete(v); st.fire = null; v.health = 0; v.power = 0; v.damage = 1; v.lights = false; v.headOut = v.tailOut = true; v.beaconsOn = false; v.speed = 0; v.free = null; v.air = false; v.immovable = true; v.pv = v.rv = 0;
    // occupants: nobody survives inside (the player is handled by the blast damage → Health)
    const Tr = g.traffic; if (v.driverChar && !v.squad) { v.driverChar.root.parent?.remove(v.driverChar.root); v.driverChar.dispose(); v.driverChar = null; }
    if (v.pax && v.pax.length && Tr) Tr.dropPax(v); for (const ch of v.deadOcc || []) { ch.root.parent?.remove(ch.root); ch.dispose(); } v.deadOcc = null;
    if (Tr) { const i = Tr.vehicles.indexOf(v); if (i >= 0) Tr.vehicles.splice(i, 1); v.ai = null; if (!v.player) Tr.release(v, true); }
    const pow = isBike(v) ? 0.75 : heavyType(v) ? 1.6 : 1.25; const c = new THREE.Vector3(v.x, v.y + 0.55, v.z);
    // the shell: thrown up and spun, harder for a light car
    const up = isBike(v) ? rnd(4, 5.5) : heavyType(v) ? rnd(2.2, 3.2) : rnd(6, 8.2); const a = Math.random() * 6.28;
    v.wreck = { vy: up, vx: Math.cos(a) * rnd(0.6, 2.2), vz: Math.sin(a) * rnd(0.6, 2.2), wp: rnd(-1, 1), wr: rnd(-1.5, 1.5) * (heavyType(v) ? 0.3 : 1), wy: rnd(-1.5, 1.5), rest: false, t: 0 };
    { const bb = new THREE.Box3(), tb = new THREE.Box3(), inv = new THREE.Matrix4(), rel = new THREE.Matrix4(); v.mesh.updateMatrixWorld(true); inv.copy(v.mesh.matrixWorld).invert(); const wset = new Set(ud.wheels || []);
      const walk = (o) => { if (!o.visible || wset.has(o)) return; if (o.isMesh && o.geometry && !/contactShadow|headPool|interior|shadow/i.test(o.name)) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tb.copy(o.geometry.boundingBox).applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)); bb.union(tb); } for (const c of o.children) walk(c); };
      for (const c of v.mesh.children) walk(c); if (bb.isEmpty()) bb.set(new THREE.Vector3(-T.wid / 2, 0.1, -T.len / 2), new THREE.Vector3(T.wid / 2, T.hgt || 1.2, T.len / 2));
      const onHubs = (ud.wheels || []).filter((w) => w.visible).length; if (!isBike(v) && onHubs >= 3) bb.min.y = Math.min(bb.min.y, T.wheelR * 0.3); // still on (most of) its burnt rims
      bb.min.y = Math.max(bb.min.y, 0.05); v.wreck.box = bb; } // the shell's own extent: what it lands / rests on
    this.wrecks.add(v); st.smoulder = 40;
    this.charShell(v); this.fling(v, c);
    // glass blows out
    if (!isBike(v)) { const G = this.glassState(v, proxyOf(v)); G.panes.forEach((p, i) => { if (!G.broken[i]) { G.broken[i] = 1; G.U.min.value[i].w = 1; } }); for (let i = 0; i < 70; i++) { const d = tmpV.set(rnd(-1, 1), rnd(0.1, 1), rnd(-1, 1)).normalize(); this.shard(c.clone().addScaledVector(d, 0.6).add(tmpV2.set(0, 0.5, 0)), d.x * rnd(3, 11), d.y * rnd(3, 9), d.z * rnd(3, 11), rnd(0.012, 0.03)); } }
    // tyres burn away, it sits on its rims
    for (const w of ud.wheels || []) w.userData.drop = T.wheelR * 0.32; this.fitDrops(v);
    if (g.explosions) g.explosions.blast(c, { power: pow, source: by || 'vehicle', cause: 'vehicle' });
  }
  // every material on the vehicle → charred / gone (shared materials: no per-vehicle programs)
  charShell(v) {
    const S = shared(), ud = v.mesh.userData; const map = (name, mat) => { if (!mat) return mat; if (/^(glass|lens|vlight|vtail|vind|vrev|lbBlue|lbRed|mirror)$/.test(name)) return S.invis; if (/^(chrome|vrefl|alloy|engine)$/.test(name)) return S.charMetal; if (/^(rubber|interior|dash|canvas)$/.test(name)) return S.charSoft; return S.charPaint; };
    const swap = (m) => { if (!m.isMesh) return; const nm = m.name; if (nm === 'contactShadow' || nm === 'headPool') return; const cur = m.material; m.material = Array.isArray(cur) ? cur.map(() => map(nm, cur[0])) : map(nm, cur); };
    if (ud.bake) for (const n in ud.bake.mats) ud.bake.mats[n] = map(n, ud.bake.mats[n]);
    for (const c of v.mesh.children) { if (c.isMesh) swap(c); else if (c.name && c.name.startsWith('door')) c.traverse(swap); }
    if (ud.bake) for (const n in ud.bake.meshes) swap(ud.bake.meshes[n]);
    for (const grp of [ud.detail, ud.real && ud.real.mid, ud.real && ud.real.low]) if (grp) grp.traverse(swap);
    for (const w of ud.wheels || []) { const u = w.userData; for (const grp of [u.lo, u.hi, u.cal]) if (grp) grp.traverse((o) => { if (!o.isMesh) return; o.material = o.material && o.material.userData && o.material.userData.tyre ? S.invis : o.material === vehicleMaterials().mats.vtyre ? S.invis : S.charMetal; }); }
    if (ud.headPool) ud.headPool.visible = false; ud.dmgHi = true;
  }
  // ---- the pieces: doors, wheels, bonnet, boot lid, fragments
  fling(v, c) {
    const ud = v.mesh.userData, T = v.T, S = shared(); const P = isBike(v) ? null : proxyOf(v); v.mesh.updateMatrixWorld(true);
    const launch = (obj, dirX, dirZ, upv, spd, he, w) => { const d = tmpV.set(dirX, 0, dirZ); if (d.lengthSq() < 1e-6) d.set(rnd(-1, 1), 0, rnd(-1, 1)); d.normalize(); this.addBody(obj, new THREE.Vector3(d.x * spd, upv, d.z * spd), w || new THREE.Vector3(rnd(-9, 9), rnd(-6, 6), rnd(-9, 9)), he); };
    const local = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(v.mesh.matrixWorld); const out = (lx, lz) => tmpV2.set(lx, 0, lz).transformDirection(v.mesh.matrixWorld).clone();
    // doors: most of them come off
    const B = ud.bake; for (const d of ud.doors || []) { if (d.leaf || d.gone || !B || Math.random() > 0.6) continue; const ms = this.pivotMeshes(v, d); if (!ms || !ms.length) continue; d.pivot.updateMatrixWorld(true);
      // the body of the piece is centred on the door's own bounding box (its pivot is the hinge line)
      const bb = new THREE.Box3(); for (const m of ms) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox); } const ctr = bb.getCenter(new THREE.Vector3()), hs = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      const holder = new THREE.Group(); for (const m of ms) { const mm = new THREE.Mesh(m.geometry, m.name === 'glass' ? S.invis : /^(chrome|vrefl)$/.test(m.name) ? S.charMetal : /^(rubber|interior|dash|canvas)$/.test(m.name) ? S.charSoft : S.charPaint); mm.position.copy(ctr).negate(); holder.add(mm); }
      d.pivot.matrixWorld.decompose(holder.position, holder.quaternion, holder.scale); holder.position.copy(ctr.clone().applyMatrix4(d.pivot.matrixWorld)); holder.scale.set(1, 1, 1); this.g.scene.add(holder);
      d.gone = true; d.ang = 0.002; setDoorLive(ud, d, true); d.pivot.visible = false; v.mesh.remove(d.pivot);
      const o = out(Math.sign(d.hx) || (d.side < 0 ? 1 : -1), 0); launch(holder, o.x, o.z, rnd(4, 8), rnd(4, 9), [Math.max(0.04, hs.x), Math.max(0.2, hs.y), Math.max(0.2, hs.z)]); }
    // wheels: one or two leave the hubs, rolling and bouncing
    const W = (ud.wheels || []).slice().sort(() => Math.random() - 0.5); const nW = isBike(v) ? 1 : Math.random() < 0.5 ? 1 : 2;
    for (let k = 0; k < Math.min(nW, W.length); k++) { const w = W[k], u = w.userData; const src = u.hi || u.lo; if (!src) continue; w.updateMatrixWorld(true);
      const grp = new THREE.Group(); src.traverse((o) => { if (o.isMesh) { const mm = new THREE.Mesh(o.geometry, o.material === S.invis ? S.charSoft : o.material && o.material.userData && o.material.userData.tyre ? o.material : S.charMetal2); mm.matrixAutoUpdate = true; o.updateMatrix(); mm.applyMatrix4(o.matrix); grp.add(mm); } }); if (src.rotation.y) grp.rotation.y = src.rotation.y;
      const holder = new THREE.Group(); holder.add(grp); w.matrixWorld.decompose(holder.position, holder.quaternion, holder.scale); this.g.scene.add(holder); w.visible = false;
      const o = out(Math.sign(w.position.x) || 1, Math.sign(w.position.z) * 0.4); launch(holder, o.x, o.z, rnd(5, 9), rnd(5, 11), [0.12, T.wheelR, T.wheelR], new THREE.Vector3(rnd(-20, 20), rnd(-4, 4), rnd(-4, 4))); }
    // bonnet and boot lid (cars / vans): a crumpled panel the size of the car's own, launched end over end
    if (P && !heavyType(v)) for (const [z0, upv, lenK] of [[T.len * 0.34, rnd(8, 12), 0.27], [-T.len * 0.38, rnd(5, 8), 0.2]]) { if (z0 < 0 && Math.random() < 0.35) continue;
      const hits = P.ray(new THREE.Vector3(0, 6, z0), new THREE.Vector3(0, -1, 0), 8, []); if (!hits.length) continue; const y = 6 - hits[0].t;
      const pg = panelGeo(T.wid * 0.84, T.len * lenK); const m = new THREE.Mesh(pg, S.charPaint); m.castShadow = true; const holder = new THREE.Group(); holder.add(m); holder.position.copy(local(0, y + 0.03, z0)); holder.quaternion.copy(v.mesh.getWorldQuaternion(new THREE.Quaternion())); this.g.scene.add(holder);
      const o = out(rnd(-0.3, 0.3), Math.sign(z0)); launch(holder, o.x, o.z, upv, rnd(2, 5), [T.wid * 0.42, 0.04, T.len * lenK / 2], new THREE.Vector3(rnd(-11, 11) * (z0 > 0 ? 1 : -1), rnd(-3, 3), rnd(-3, 3))); }
    // metal fragments in the body colour + black trim
    const col = ud.color ? new THREE.Color(ud.color[0], ud.color[1], ud.color[2]).multiplyScalar(0.55) : new THREE.Color(0x333333); const n = isBike(v) ? 10 : heavyType(v) ? 28 : 20;
    for (let i = 0; i < n; i++) { const d = tmpV.set(rnd(-1, 1), rnd(0.15, 1), rnd(-1, 1)).normalize(); this.frag(c.clone().addScaledVector(d, 0.5), d.x * rnd(4, 14), d.y * rnd(4, 12), d.z * rnd(4, 14), rnd(0.06, 0.2), Math.random() < 0.7 ? col : new THREE.Color(0x111111)); }
  }
  // ================================================================ PARTICLE POOLS + RIGID DEBRIS
  pool() {
    if (this.pools) return this.pools; const S = shared(); const sc = this.g.scene;
    const mk = (geo, mat, N) => { const im = new THREE.InstancedMesh(geo, mat, N); im.count = N; im.frustumCulled = false; const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < N; i++) im.setMatrixAt(i, z); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sc.add(im); return im; };
    const shards = mk(S.shardGeo, S.shardMat, SHARDS); const frags = mk(S.fragGeo, S.fragMat, FRAGS); for (let i = 0; i < FRAGS; i++) frags.setColorAt(i, new THREE.Color(0x333333)); frags.castShadow = true;
    const P = (N) => ({ p: new Float32Array(N * 3), v: new Float32Array(N * 3), r: new Float32Array(N * 3), w: new Float32Array(N * 3), s: new Float32Array(N), t: new Float32Array(N).fill(-1), life: new Float32Array(N), rest: new Uint8Array(N), i: 0, any: false });
    this.pools = { shards, frags, SP: P(SHARDS), FP: P(FRAGS) }; return this.pools;
  }
  spawnP(A, N, p, vx, vy, vz, s, life) { const i = A.i; A.i = (A.i + 1) % N; A.p[i * 3] = p.x; A.p[i * 3 + 1] = p.y; A.p[i * 3 + 2] = p.z; A.v[i * 3] = vx; A.v[i * 3 + 1] = vy; A.v[i * 3 + 2] = vz; A.r[i * 3] = Math.random() * 6; A.r[i * 3 + 1] = Math.random() * 6; A.r[i * 3 + 2] = Math.random() * 6; A.w[i * 3] = rnd(-20, 20); A.w[i * 3 + 1] = rnd(-20, 20); A.w[i * 3 + 2] = rnd(-20, 20); A.s[i] = s; A.t[i] = 0; A.life[i] = life; A.rest[i] = 0; A.any = true; return i; }
  shard(p, vx, vy, vz, s, color) { const Q = this.pool(); this.spawnP(Q.SP, SHARDS, p, vx, vy, vz, s, rnd(18, 30)); void color; }
  frag(p, vx, vy, vz, s, color) { const Q = this.pool(); const i = this.spawnP(Q.FP, FRAGS, p, vx, vy, vz, s, rnd(60, 90)); Q.frags.setColorAt(i, color); Q.frags.instanceColor.needsUpdate = true; this.stats.debris++; }
  stepP(A, N, im, dt, flat) {
    if (!A.any) return; let any = false; const m = tmpM, q = tmpQ, e = this._e, col = this.g.collision;
    for (let i = 0; i < N; i++) { if (A.t[i] < 0) continue; A.t[i] += dt; any = true; const j = i * 3;
      if (A.t[i] > A.life[i]) { A.t[i] = -1; im.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
      if (!A.rest[i]) { A.v[j + 1] -= 9.81 * dt; A.p[j] += A.v[j] * dt; A.p[j + 1] += A.v[j + 1] * dt; A.p[j + 2] += A.v[j + 2] * dt; A.r[j] += A.w[j] * dt; A.r[j + 1] += A.w[j + 1] * dt; A.r[j + 2] += A.w[j + 2] * dt;
        const gy = col ? col.groundAt(A.p[j], A.p[j + 2], A.p[j + 1] + 0.3, 0.4) : L.groundY(A.p[j], A.p[j + 2]); const hs = A.s[i] * (flat ? 0.12 : 0.1);
        if (A.p[j + 1] < gy + hs) { A.p[j + 1] = gy + hs; if (Math.abs(A.v[j + 1]) < 1.1) { A.rest[i] = 1; A.r[j] = flat ? 0 : Math.round(A.r[j] / Math.PI) * Math.PI; A.r[j + 2] = flat ? 0 : Math.round(A.r[j + 2] / Math.PI) * Math.PI; } A.v[j + 1] = -A.v[j + 1] * 0.3; A.v[j] *= 0.5; A.v[j + 2] *= 0.5; A.w[j] *= 0.5; A.w[j + 1] *= 0.5; A.w[j + 2] *= 0.5; } }
      const fade = A.t[i] > A.life[i] - 2 ? (A.life[i] - A.t[i]) / 2 : 1; const s = A.s[i] * fade; q.setFromEuler(e.set(A.r[j], A.r[j + 1], A.r[j + 2])); m.compose(tmpV.set(A.p[j], A.p[j + 1], A.p[j + 2]), q, tmpV2.set(s, s, s)); im.setMatrixAt(i, m); }
    im.instanceMatrix.needsUpdate = true; A.any = any;
  }
  addBody(obj, vel, w, he) { obj.traverse((o) => { if (o.isMesh) o.castShadow = true; }); const b = { obj, v: vel, w, he: new THREE.Vector3(...he), rest: false, t: 0, life: 150, slow: 0 }; this.bodies.push(b); this.stats.debris++; while (this.bodies.length > BODIES) { const o = this.bodies.shift(); o.obj.parent?.remove(o.obj); } }
  stepBodies(dt) {
    const col = this.g.collision; const R = new THREE.Matrix3();
    for (let i = this.bodies.length - 1; i >= 0; i--) { const b = this.bodies[i], o = b.obj; b.t += dt;
      if (b.t > b.life) { const k = Math.max(0, 1 - (b.t - b.life) / 3); o.scale.setScalar(k); if (k <= 0) { o.parent?.remove(o); this.bodies.splice(i, 1); } continue; }
      if (b.rest) continue; const n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
      for (let s = 0; s < n; s++) { b.v.y -= 9.81 * h; o.position.addScaledVector(b.v, h); const wl = b.w.length(); if (wl > 1e-4) { tmpQ.setFromAxisAngle(tmpV.copy(b.w).divideScalar(wl), wl * h); o.quaternion.premultiply(tmpQ); }
        // half-height of the oriented box along world up
        R.setFromMatrix4(tmpM.makeRotationFromQuaternion(o.quaternion)); const e = R.elements; const hy = Math.abs(e[1]) * b.he.x + Math.abs(e[4]) * b.he.y + Math.abs(e[7]) * b.he.z;
        const gy = col ? col.groundAt(o.position.x, o.position.z, o.position.y + 0.5, 0.6) : L.groundY(o.position.x, o.position.z);
        if (o.position.y - hy < gy) { o.position.y = gy + hy; if (b.v.y < 0) { const imp = -b.v.y; b.v.y = imp > 1.5 ? imp * 0.32 : 0; b.v.x *= 0.72; b.v.z *= 0.72; b.w.multiplyScalar(0.62); if (imp > 3 && b.t > 0.2) Audio.debrisHit && Audio.debrisHit(o.position.x, o.position.z, Math.min(1, imp / 10)); }
          // lying down: the thinnest axis turns toward up
          const ax = [new THREE.Vector3(e[0], e[1], e[2]), new THREE.Vector3(e[3], e[4], e[5]), new THREE.Vector3(e[6], e[7], e[8])]; const he = [b.he.x, b.he.y, b.he.z]; let thin = 0; for (let k = 1; k < 3; k++) if (he[k] < he[thin]) thin = k;
          const a = ax[thin], tgt = a.y >= 0 ? UP : tmpV2.set(0, -1, 0); tmpQ.setFromUnitVectors(a, tgt); const fr = Math.min(1, h * 5); o.quaternion.premultiply(new THREE.Quaternion().slerp(tmpQ, fr)); b.v.x *= 1 - Math.min(1, h * 1.8); b.v.z *= 1 - Math.min(1, h * 1.8); b.w.multiplyScalar(1 - Math.min(1, h * 3)); }
        if (col) { const r = col.resolveCircle(o.position.x, o.position.z, Math.max(b.he.x, b.he.z) * 0.6, o.position.y - hy, 0.25, 1, {}); if (r.hit) { const dx = r.x - o.position.x, dz = r.z - o.position.z, dl = Math.hypot(dx, dz) || 1; o.position.x = r.x; o.position.z = r.z; const vn = (b.v.x * dx + b.v.z * dz) / dl; if (vn < 0) { b.v.x -= dx / dl * vn * 1.4; b.v.z -= dz / dl * vn * 1.4; } } } }
      const sp = b.v.length() + b.w.length() * 0.2; if (sp < 0.25) { b.slow += dt; if (b.slow > 0.6) b.rest = true; } else b.slow = 0; }
  }
  // ================================================================ per frame
  update(dt) {
    const g = this.g, E = g.explosions, cam = g.camera; if (!(dt > 0)) return; const fp = tmpV;
    for (const v of this.burning) { const st = v.vd, F = st && st.fire; if (!F || v.disposed) { this.burning.delete(v); continue; } F.t += dt; const k = Math.min(1, 0.35 + F.t / F.T);
      this.firePoint(v, fp); const near = !cam || cam.position.distanceToSquared(fp) < 170 * 170; const gy = L.groundY(fp.x, fp.z);
      if (near && E) { E.burn(fp, k, gy, dt); E.burners.push({ x: fp.x, y: fp.y + 0.6, z: fp.z, pow: 0.6 + 0.6 * k }); }
      if ((F.snd -= dt) <= 0) { F.snd = rnd(0.08, 0.25); Audio.fireCrackle && Audio.fireCrackle(fp.x, fp.z, k); }
      if (v.player && F.t > 1.5 && g.health && Math.random() < dt * 2) g.health.damage(3, 'burning vehicle');
      if (F.t >= F.T) this.explode(v, F.by); }
    for (const v of this.wrecks) { if (v.disposed) { this.wrecks.delete(v); continue; } const st = v.vd; if (v.wreck && !v.wreck.rest) this.stepWreck(v, dt);
      if (st && st.smoulder > 0) { st.smoulder -= dt; this.firePoint(v, fp); fp.y = v.y + (v.T.hgt || 1.4) * 0.45 + (v.wreckLift || 0); const near = !cam || cam.position.distanceToSquared(fp) < 150 * 150; const k = Math.max(0.12, Math.min(0.75, st.smoulder / 40));
        if (near && E) { E.burn(fp, k * 0.8, L.groundY(fp.x, fp.z), dt); if (st.smoulder > 8) E.burners.push({ x: fp.x, y: fp.y + 0.5, z: fp.z, pow: k }); } if ((st.sndT = (st.sndT || 0) - dt) <= 0 && st.smoulder > 6) { st.sndT = rnd(0.12, 0.4); Audio.fireCrackle && Audio.fireCrackle(fp.x, fp.z, k * 0.6); } } }
    if (this.bodies.length) this.stepBodies(dt);
    if (this.pools) { const Q = this.pools; this.stepP(Q.SP, SHARDS, Q.shards, dt, true); this.stepP(Q.FP, FRAGS, Q.frags, dt, false); }
  }
  // the burnt shell in the air: gravity, spin, bounces on its lowest corner, rolls onto wheels / side / roof and stays
  stepWreck(v, dt) {
    const W = v.wreck, bx = W.box; W.t += dt; const H = bx.max.y; const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
    const sink = () => (v.sus ? v.sus.h : 0) + (v.dropFit ? v.dropFit.h : 0); // sync() lowers the mesh by the spring / flat-tyre offsets: count them so the shell sits on the road, not in it
    const lowY = () => { const cp = Math.cos(v.pitch), sp = Math.sin(v.pitch), cr = Math.cos(v.roll), sr = Math.sin(v.roll); let mn = Infinity; for (const x of [bx.min.x, bx.max.x]) for (const y of [bx.min.y, bx.max.y]) for (const z of [bx.min.z, bx.max.z]) { const y1 = x * sr + y * cr; const yy = y1 * cp - z * sp; if (yy < mn) mn = yy; } return mn - sink(); };
    // where it settles: back on its wheels unless tipped past the point where the centre of mass is outside the track (~55-60°),
    // on its side, or on its roof once past the side's own tipping angle
    const tipW = Math.atan2((bx.max.x - bx.min.x) / 2, H * 0.45), tipS = Math.PI / 2 + Math.atan2(H * 0.55, (bx.max.x - bx.min.x) / 2);
    const settleRoll = (r) => { const a = Math.abs(r), s = Math.sign(r) || 1; return a < tipW && !isBike(v) ? 0 : a < tipS ? s * Math.PI / 2 : s * Math.PI; };
    for (let s = 0; s < n; s++) { W.vy -= 9.81 * h; v.wreckLift += W.vy * h; v.x += W.vx * h; v.z += W.vz * h; v.yaw += W.wy * h; v.pitch += W.wp * h; v.roll += W.wr * h;
      const ly = lowY(); if (v.wreckLift + ly <= 0) { v.wreckLift = -ly; if (W.vy < -1.5) { const imp = -W.vy; W.vy = imp * 0.25; W.vx *= 0.6; W.vz *= 0.6; W.wp *= 0.5; W.wr *= 0.55; W.wy *= 0.6; if (imp > 3) { Audio.crash(Math.min(30, imp * 3)); if (Math.abs(v.roll) > 1.2) this.dent(v, new THREE.Vector3(0, H, 0), new THREE.Vector3(0, -1, 0), Math.min(0.14, imp * 0.02), 1.1); } } else W.vy = Math.max(0, W.vy);
        // settle: toward the nearest stable roll (wheels / side / roof), pitch flat
        const tr = settleRoll(v.roll); W.wr += ((tr - v.roll) * 30 - W.wr * 4) * h; W.wp += ((0 - v.pitch) * 30 - W.wp * 4) * h; const f = Math.max(0, 1 - 3 * h); W.vx *= f; W.vz *= f; W.wy *= f; } }
    v.y = L.groundY(v.x, v.z); const col = this.g.collision; if (col) for (const [cx, cz] of v.circles()) { const r = col.resolveCircle(cx, cz, v.radius, v.y, 0.25, 2, { vehicle: true }); if (r.hit) { const dx = r.x - cx, dz = r.z - cz, dl = Math.hypot(dx, dz) || 1; v.x += dx; v.z += dz; const vn = (W.vx * dx + W.vz * dz) / dl; if (vn < 0) { W.vx -= dx / dl * vn * 1.3; W.vz -= dz / dl * vn * 1.3; } } }
    const cs = W.cs !== undefined ? W.cs : (W.cs = v.mesh.getObjectByName('contactShadow') || null); if (cs) cs.visible = Math.abs(v.roll) < 0.25 && Math.abs(v.pitch) < 0.25 && v.wreckLift < 0.25; // the flat ground shadow only while the shell is upright and down
    const tr = settleRoll(v.roll);
    if (W.t > 1 && Math.abs(W.vy) < 0.4 && Math.hypot(W.vx, W.vz) < 0.3 && Math.abs(v.roll - tr) < 0.03 && Math.abs(v.pitch) < 0.03 && v.wreckLift + lowY() < 0.02) { W.rest = true; v.roll = tr; v.pitch = 0; v.wreckLift = -lowY(); v.immovable = Math.abs(tr) > 0.1; }
    v.sync(dt);
  }
  // ================================================================ repair / dispose / tools
  repair(v) {
    if (!v || v.wrecked) return false; const st = v.vd; v.health = 100; v.power = 1; v.damage = 0; v.headOut = v.tailOut = false; v.dropFit = null; for (const w of v.mesh.userData.wheels || []) { w.userData.flat = false; w.userData.drop = 0; }
    for (const d of v.mesh.userData.doors || []) if (d.gone) { d.gone = false; d.ang = 0; d.vel = 0; d.strapW = 0; if (!d.pivot.parent) v.mesh.add(d.pivot); poseDoor(d); setDoorLive(v.mesh.userData, d, false); } // torn-off doors refitted
    if (!st) return true; const ud = v.mesh.userData, B = ud.bake;
    for (const e of st.owned) { if (e.kind === 'bake') { B.shared[e.name] = e.src; delete e.mesh.userData.view; } else e.mesh.geometry = e.src; }
    if (B) { for (const n in B.meshes) { const m = B.meshes[n]; m.geometry = B.shared[n]; } for (const d of ud.doors || []) if (d.live) setDoorLive(ud, d, true); }
    for (const e of st.owned) e.o.dispose();
    if (st.glass) { const G = st.glass; if (B) { B.mats.glass = G.orig; if (B.meshes.glass) B.meshes.glass.material = Array.isArray(B.meshes.glass.material) ? [G.orig] : G.orig; } else for (const c of v.mesh.children) if (c.name === 'glass') c.material = G.orig;
      for (const grp of [ud.detail, ud.real && ud.real.mid, ud.real && ud.real.low]) if (grp) for (const c of grp.children) if (c.name === 'glass') c.material = G.origD || G.orig;
      for (const d of ud.doors || []) for (const c of d.pivot.children) if (c.name === 'glass') c.material = G.orig; for (const m of G.mats) m.dispose(); }
    if (st.holes) { v.mesh.remove(st.holes); st.holes.dispose(); } if (st.fire) { this.burning.delete(v); v.burning = false; }
    ud.dmgHi = false; v.vd = null; return true;
  }
  onDispose(v) {
    this.burning.delete(v); this.wrecks.delete(v); const st = v.vd; if (!st) return; for (const e of st.owned) e.o.dispose(); if (st.glass) for (const m of st.glass.mats) m.dispose(); if (st.holes) st.holes.dispose();
    for (const ch of v.deadOcc || []) { ch.root.parent?.remove(ch.root); ch.dispose(); } v.deadOcc = null; v.vd = null;
  }
  smashAll(v) { if (isBike(v)) return false; const G = this.glassState(v, proxyOf(v)); if (!G.panes.length) return false; G.panes.forEach((p, i) => this.shatter(v, G, i, i === 0)); return true; }
  // debug: everything at once on one vehicle
  // debug: n rifle rounds from 6 m off the vehicle's right side into random points on its body (retries a point that would pass
  // through an open side / over a low bonnet, so a tuk-tuk or a bike is really hit)
  shootDemo(v, n = 6) { v.mesh.updateMatrixWorld(true); const M = v.mesh.matrixWorld, inv = new THREE.Matrix4().copy(M).invert(), T = v.T, H = T.hgt || 1.4, P = isBike(v) ? null : proxyOf(v);
    for (let i = 0; i < n; i++) { let o = null, d = null; for (let k = 0; k < 8; k++) { const y = rnd(0.35, H * 0.85), z = rnd(-0.42, 0.42) * T.len; const lo = new THREE.Vector3(-(T.wid / 2 + 6), y + rnd(-0.2, 0.3), z + rnd(-0.6, 0.6)), lt = new THREE.Vector3(rnd(-0.2, 0.2), y, z);
        o = lo.clone().applyMatrix4(M); d = lt.clone().applyMatrix4(M).sub(o).normalize(); const ld = d.clone().transformDirection(inv); const L = P ? P.ray(lo, ld, 20, []) : this.boxRay(v, lo, ld, 20); if (L && L.length) break; }
      this.bullet(v, o, d, { cls: 'rifle', dmg: 0.75 }, { by: 'debug' }); } }
  // shader warm-up group (Game.shaderWarmSet): the damage materials compiled with the scene, not on the first hit
  warmGroup() {
    const S = shared(), g = new THREE.Group(); const box = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const U = { min: { value: Array.from({ length: MAX_PANES }, () => new THREE.Vector4()) }, max: { value: Array.from({ length: MAX_PANES }, () => new THREE.Vector4()) }, cr: { value: Array.from({ length: MAX_CRACKS }, () => new THREE.Vector4()) }, crn: { value: Array.from({ length: MAX_CRACKS }, () => new THREE.Vector4()) } };
    for (const m of [glassMaterial(U, new THREE.Vector3()), S.charPaint, S.charMetal, S.charSoft, S.holeMat, S.shardMat, S.charMetal2]) g.add(new THREE.Mesh(box, m));
    const fm = new THREE.InstancedMesh(S.fragGeo, S.fragMat, 1); fm.setColorAt(0, new THREE.Color(0x777777)); g.add(fm); this.pool(); return g;
  }
}
// a bonnet / boot lid: a thin plate bowed across and crumpled
const panelCache = new Map();
function panelGeo(w, l) { const k = Math.round(w * 20) + ':' + Math.round(l * 20); let g = panelCache.get(k); if (g) return g; g = new THREE.BoxGeometry(w, 0.025, l, 8, 1, 8); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, p.getY(i) - (x / w) ** 2 * 0.09 + Math.sin(x * 9 + z * 5) * 0.012 + (hash1(i) - 0.5) * 0.01); } g.computeVertexNormals(); panelCache.set(k, g); return g; }
export const _vdTesting = { Proxy, proxyOf, panelGeo, rearEngine, heavyType };
