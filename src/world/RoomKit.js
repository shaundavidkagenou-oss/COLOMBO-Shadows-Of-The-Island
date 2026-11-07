// Room kit: a tiny modelling toolkit for the detailed hero rooms (HeroRooms.js).
// Every prop is built from real geometry (lathes, rounded boxes, tubes, tori…) under a transform stack, then merged into
// ONE mesh per material, so a room full of small objects costs a couple of dozen draw calls.
// Box UVs are scaled to metres so wood grain, tiles and fabric print keep a consistent real-world size.
// Textures are drawn on canvases at build time (original artwork, plain English print only).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// ------------------------------------------------------------------ canvas textures
const TEXC = new Map();
export function canvasTex(key, w, h, draw, { repeat = null, srgb = true } = {}) {
  if (key && TEXC.has(key)) return TEXC.get(key);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const a = cv.getContext('2d'); draw(a, w, h);
  const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; if (Array.isArray(repeat)) t.repeat.set(repeat[0], repeat[1]); }
  if (key) TEXC.set(key, t); return t;
}
export function speckle(a, w, h, amt, seed = 7) { // per-pixel grain so no surface is a flat colour
  const r = rnd(seed); const img = a.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  a.putImageData(img, 0, 0);
}
export function blotches(a, w, h, n, col, rmin, rmax, seed = 3) {
  const r = rnd(seed); for (let i = 0; i < n; i++) { const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin); const g = a.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = g; a.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
}
// wood: long grain lines with gentle waviness + a few knots. `size` metres per texture tile.
export function woodTex(key, base, dark, { light = null, planks = 0, seed = 5 } = {}) {
  return canvasTex('wood:' + key, 512, 512, (a, w, h) => {
    const r = rnd(seed); a.fillStyle = base; a.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) { const y0 = r() * h, amp = 2 + r() * 6, fr = 0.004 + r() * 0.01, ph = r() * 6; a.strokeStyle = r() < 0.5 ? dark : (light || dark); a.globalAlpha = 0.05 + r() * 0.18; a.lineWidth = 0.6 + r() * 2.2; a.beginPath(); for (let x = 0; x <= w; x += 8) { const y = y0 + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 3.1) * amp * 0.25; x ? a.lineTo(x, y) : a.moveTo(x, y); } a.stroke(); }
    a.globalAlpha = 1; for (let k = 0; k < 3; k++) { const x = r() * w, y = r() * h; for (let j = 6; j > 0; j--) { a.strokeStyle = dark; a.globalAlpha = 0.12; a.lineWidth = 1.2; a.beginPath(); a.ellipse(x, y, j * 4.5, j * 1.6, 0, 0, Math.PI * 2); a.stroke(); } }
    a.globalAlpha = 1; if (planks) { a.strokeStyle = 'rgba(0,0,0,0.45)'; a.lineWidth = 2; for (let i = 1; i < planks; i++) { a.beginPath(); a.moveTo(0, i * h / planks); a.lineTo(w, i * h / planks); a.stroke(); } }
    speckle(a, w, h, 10, seed + 1);
  }, { repeat: true });
}
export function plasterTex(key, base, { damp = 0.35, peel = 0, seed = 11, stain = 'rgba(90,70,40,0.14)' } = {}) {
  return canvasTex('plaster:' + key, 512, 256, (a, w, h) => {
    a.fillStyle = base; a.fillRect(0, 0, w, h); blotches(a, w, h, 30, 'rgba(255,255,255,0.05)', 20, 90, seed); blotches(a, w, h, 22, 'rgba(0,0,0,0.035)', 20, 80, seed + 1);
    if (damp) { const g = a.createLinearGradient(0, h, 0, h * 0.78); g.addColorStop(0, `rgba(70,60,40,${damp * 0.5})`); g.addColorStop(1, 'rgba(70,60,40,0)'); a.fillStyle = g; a.fillRect(0, 0, w, h); blotches(a, w, h * 0.25, 8, stain, 10, 40, seed + 2); }
    const r = rnd(seed + 3); for (let i = 0; i < peel; i++) { const x = r() * w, y = h * (0.15 + r() * 0.7), s = 3 + r() * 8; a.fillStyle = 'rgba(205,205,190,0.6)'; a.beginPath(); for (let k = 0; k < 9; k++) { const an = k / 9 * Math.PI * 2, rr = s * (0.5 + r() * 0.6); a.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr * 0.7); } a.fill(); a.strokeStyle = 'rgba(0,0,0,0.12)'; a.stroke(); }
    a.strokeStyle = 'rgba(0,0,0,0.07)'; a.lineWidth = 0.8; for (let i = 0; i < 4; i++) { let x = r() * w, y = r() * h * 0.5; a.beginPath(); a.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 14; y += 6 + r() * 8; a.lineTo(x, y); } a.stroke(); } // hairline cracks
    speckle(a, w, h, 9, seed + 4);
  });
}
export function floorTex(kind) {
  if (kind === 'redoxide') return canvasTex('floor:redoxide', 512, 512, (a, w, h) => { // polished red cement, the classic old Colombo floor
    a.fillStyle = '#8a3428'; a.fillRect(0, 0, w, h); blotches(a, w, h, 40, 'rgba(60,16,8,0.07)', 25, 90, 21); blotches(a, w, h, 40, 'rgba(200,110,90,0.08)', 15, 70, 22);
    const r = rnd(23); a.strokeStyle = 'rgba(30,6,2,0.35)'; a.lineWidth = 0.9; for (let i = 0; i < 7; i++) { let x = r() * w, y = r() * h; a.beginPath(); a.moveTo(x, y); for (let k = 0; k < 10; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; a.lineTo(x, y); } a.stroke(); }
    a.strokeStyle = 'rgba(20,4,2,0.5)'; a.lineWidth = 2; a.strokeRect(1, 1, w - 2, h - 2); // laid in 1 m bays
    speckle(a, w, h, 12, 24);
  }, { repeat: true });
  if (kind === 'tiles') return canvasTex('floor:tiles', 512, 512, (a, w, h) => {
    const r = rnd(31); const n = 2, s = w / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 228 - r() * 14; a.fillStyle = `rgb(${v},${v - 8},${v - 22})`; a.fillRect(i * s, j * s, s, s); a.save(); a.translate(i * s, j * s); blotches(a, s, s, 10, 'rgba(160,140,110,0.10)', 10, 50, 32 + i * 3 + j); a.restore(); }
    a.strokeStyle = '#9d9483'; a.lineWidth = 5; for (let i = 0; i <= n; i++) { a.beginPath(); a.moveTo(i * s, 0); a.lineTo(i * s, h); a.stroke(); a.beginPath(); a.moveTo(0, i * s); a.lineTo(w, i * s); a.stroke(); }
    speckle(a, w, h, 6, 33);
  }, { repeat: true });
  return canvasTex('floor:terrazzo', 512, 512, (a, w, h) => {
    a.fillStyle = '#c9c1b3'; a.fillRect(0, 0, w, h); const r = rnd(41); const cols = ['#7a7266', '#efe9dc', '#8c5a3c', '#3f3a35', '#a49a88', '#5d6b62'];
    for (let i = 0; i < 2600; i++) { a.fillStyle = cols[Math.floor(r() * cols.length)]; const x = r() * w, y = r() * h, s = 1 + r() * 4.5; a.beginPath(); for (let k = 0; k < 5; k++) { const an = k / 5 * Math.PI * 2 + r(); a.lineTo(x + Math.cos(an) * s, y + Math.sin(an) * s); } a.fill(); }
    a.strokeStyle = '#8a8274'; a.lineWidth = 3; a.strokeRect(0, 0, w, h); speckle(a, w, h, 8, 42);
  }, { repeat: true });
}
export function fabricTex(kind, c1, c2, c3) {
  return canvasTex(`fab:${kind}:${c1}:${c2}:${c3}`, 256, 256, (a, w, h) => {
    a.fillStyle = c1; a.fillRect(0, 0, w, h); const r = rnd(c1.length * 13 + kind.length);
    if (kind === 'batik') { // original wax-print motif: leaves, crackle veins and dots
      a.strokeStyle = c3; a.globalAlpha = 0.35; a.lineWidth = 0.7; for (let i = 0; i < 40; i++) { let x = r() * w, y = r() * h; a.beginPath(); a.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 18; y += (r() - 0.5) * 18; a.lineTo(x, y); } a.stroke(); } a.globalAlpha = 1;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = i * 64 + 32 + (j % 2) * 32, y = j * 64 + 32; a.save(); a.translate(x % w, y); a.rotate((i + j) * 0.8); a.fillStyle = c2; a.beginPath(); a.ellipse(0, 0, 22, 9, 0, 0, Math.PI * 2); a.fill(); a.strokeStyle = c3; a.lineWidth = 1.5; a.beginPath(); a.moveTo(-20, 0); a.lineTo(20, 0); for (let k = -15; k <= 15; k += 6) { a.moveTo(k, 0); a.lineTo(k + 5, -7); a.moveTo(k, 0); a.lineTo(k + 5, 7); } a.stroke(); a.restore(); }
      a.fillStyle = c3; for (let i = 0; i < 70; i++) { a.beginPath(); a.arc(r() * w, r() * h, 1.6, 0, 7); a.fill(); }
    } else if (kind === 'check') { a.globalAlpha = 0.55; a.fillStyle = c2; for (let i = 0; i < 8; i++) { a.fillRect(i * 32, 0, 12, h); a.fillRect(0, i * 32, w, 12); } a.fillStyle = c3; a.globalAlpha = 0.5; for (let i = 0; i < 8; i++) { a.fillRect(i * 32 + 20, 0, 3, h); a.fillRect(0, i * 32 + 20, w, 3); } a.globalAlpha = 1; }
    else if (kind === 'stripe') { a.fillStyle = c2; for (let i = 0; i < 8; i++) a.fillRect(0, i * 32, w, 10); a.fillStyle = c3; for (let i = 0; i < 8; i++) a.fillRect(0, i * 32 + 14, w, 2); }
    // weave: fine crossing threads
    a.globalAlpha = 0.08; a.strokeStyle = '#000'; for (let i = 0; i < w; i += 2) { a.beginPath(); a.moveTo(i, 0); a.lineTo(i, h); a.stroke(); } a.strokeStyle = '#fff'; for (let i = 0; i < h; i += 2) { a.beginPath(); a.moveTo(0, i); a.lineTo(w, i); a.stroke(); } a.globalAlpha = 1;
    speckle(a, w, h, 8, 51);
  }, { repeat: true });
}
export function paintedMetalTex(key, base) {
  return canvasTex('metal:' + key, 256, 256, (a, w, h) => {
    a.fillStyle = base; a.fillRect(0, 0, w, h); blotches(a, w, h, 14, 'rgba(255,255,255,0.05)', 10, 50, 61); const r = rnd(62);
    a.strokeStyle = 'rgba(210,210,200,0.35)'; a.lineWidth = 0.6; for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, l = 4 + r() * 22, an = r() * 3; a.beginPath(); a.moveTo(x, y); a.lineTo(x + Math.cos(an) * l, y + Math.sin(an) * l); a.stroke(); }
    blotches(a, w, h, 5, 'rgba(110,60,20,0.18)', 3, 9, 63); speckle(a, w, h, 7, 64);
  }, { repeat: true });
}

// ------------------------------------------------------------------ geometry helpers
function boxUV(w, h, d, sc = 1) { // BoxGeometry with UVs in metres (sc = texture tiles per metre)
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * sc, uv.getY(i) * dims[f][1] * sc); }
  return g;
}
export class Kit {
  constructor() { this.parts = new Map(); this.stack = [new THREE.Matrix4()]; this.mats = new Map(); this.obs = []; }
  def(key, mat) { if (!this.mats.has(key)) this.mats.set(key, mat); return key; }
  get M() { return this.stack[this.stack.length - 1]; }
  push(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sc = 1) { const m = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sc, sc, sc)); this.stack.push(this.M.clone().multiply(m)); return this; }
  pop() { this.stack.pop(); return this; }
  at(x, y, z, ry, fn) { this.push(x, y, z, ry); fn(); this.pop(); }
  // footprint for the player's indoor collision, given in the CURRENT frame (converted to room-local axis-aligned bounds)
  block(x, z, w, d) { const pts = [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2]].map(([px, pz]) => new THREE.Vector3(px, 0, pz).applyMatrix4(this.M)); this.obs.push({ x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)) }); }
  local(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(this.M); }
  geo(key, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    let gg = g.index ? g.toNonIndexed() : g; if (gg === g) gg = g.clone(); g.dispose();
    for (const n of Object.keys(gg.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') gg.deleteAttribute(n);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    if (!gg.attributes.normal) gg.computeVertexNormals();
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), _s.set(sx, sy, sz)); gg.applyMatrix4(this.M.clone().multiply(_m));
    if (!this.parts.has(key)) this.parts.set(key, []); this.parts.get(key).push(gg); return this;
  }
  box(key, w, h, d, x, y, z, o = {}) { const g = o.r ? new RoundedBoxGeometry(w, h, d, o.seg || 2, Math.min(o.r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)) : boxUV(w, h, d, o.uv ?? 1); return this.geo(key, g, x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx || 1, o.sy || 1, o.sz || 1); }
  cyl(key, rt, rb, h, x, y, z, o = {}) { return this.geo(key, new THREE.CylinderGeometry(rt, rb, h, o.seg || 16, o.hs || 1, !!o.open, o.t0 || 0, o.tl || Math.PI * 2), x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx || 1, o.sy || 1, o.sz || 1); }
  sph(key, r, x, y, z, o = {}) { return this.geo(key, new THREE.SphereGeometry(r, o.ws || 16, o.hs || 12, 0, Math.PI * 2, o.t0 || 0, o.tl || Math.PI), x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx || 1, o.sy || 1, o.sz || 1); }
  lathe(key, pts, x, y, z, o = {}) { return this.geo(key, new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), o.seg || 24), x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx || 1, o.sy || 1, o.sz || 1); }
  tube(key, pts, r, o = {}) { return this.geo(key, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), o.n || 24, r, o.rs || 6, !!o.closed)); }
  torus(key, R, r, x, y, z, o = {}) { return this.geo(key, new THREE.TorusGeometry(R, r, o.rs || 8, o.ts || 24, o.arc || Math.PI * 2), x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx || 1, o.sy || 1, o.sz || 1); }
  plane(key, w, h, x, y, z, o = {}) { return this.geo(key, new THREE.PlaneGeometry(w, h, o.ws || 1, o.hs || 1), x, y, z, o.rx || 0, o.ry || 0, o.rz || 0); }
  build(group, { cast = true, receive = true } = {}) {
    for (const [k, list] of this.parts) { const mat = this.mats.get(k); if (!mat) { console.warn('RoomKit: no material', k); continue; } const g = mergeGeometries(list, false); g.computeBoundingSphere(); const mesh = new THREE.Mesh(g, mat); mesh.castShadow = cast && !mat.transparent; mesh.receiveShadow = receive; mesh.name = 'kit:' + k; group.add(mesh); }
    this.parts.clear();
  }
}
// soft contact shadow under furniture (cheap stand-in for indoor ambient occlusion)
let AO_TEX = null;
export function aoBlob(group, x, y, z, w, d, k = 0.55, ry = 0) {
  if (!AO_TEX) AO_TEX = canvasTex(null, 128, 128, (a, w_, h_) => { const g = a.createRadialGradient(64, 64, 8, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = g; a.fillRect(0, 0, w_, h_); }, { srgb: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: AO_TEX, transparent: true, opacity: k, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.set(-Math.PI / 2, 0, ry); m.position.set(x, y + 0.004, z); m.renderOrder = 1; group.add(m); return m;
}
