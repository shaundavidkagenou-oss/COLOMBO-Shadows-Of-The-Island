// Blood effects (Settings → Graphics → Blood effects, on by default):
//   spray(point, dir)  — an impact: droplets burst out along / against the shot, fall under gravity and leave small splats
//                        where they land, plus a splatter on the ground behind the body
//   pool(x, z)         — a pool spreading slowly under a body (glossy, darker at the centre, irregular edge)
//   splat(x, z, size)  — a single ground splat
// Everything is cheap: droplets are one Points draw call, splats are 4 instanced meshes (one per shape), pools one
// instanced mesh; old marks are recycled (oldest first) so the counts stay bounded.
import * as THREE from 'three';
import { Settings } from '../core/Settings.js';

const MAXP = 384, SPLATS = 48, POOLS = 14, VARIANTS = 4;
const rnd = (a, b) => a + Math.random() * (b - a);

function blobPath(g, cx, cy, r0, k, seed) { const a = seed * 3.1, b = seed * 1.7, c = seed * 5.3; g.beginPath(); for (let i = 0; i <= 48; i++) { const t = (i / 48) * Math.PI * 2; const r = r0 * (1 + k * (0.55 * Math.sin(3 * t + a) + 0.3 * Math.sin(7 * t + b) + 0.15 * Math.sin(13 * t + c))); const x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); }
function splatTexture(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.clearRect(0, 0, 128, 128);
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 40); gr.addColorStop(0, '#4a0404'); gr.addColorStop(1, '#740a0a');
  g.fillStyle = gr; blobPath(g, 64, 64, 24 + (seed % 3) * 3, 0.35, seed); g.fill();
  let s = seed * 9301 + 49297; const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#6a0808';
  for (let i = 0; i < 16; i++) { const a = R() * Math.PI * 2, d = 30 + R() * 30, rr = 1.5 + R() * 4; g.beginPath(); g.ellipse(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rr * (1 + R() * 1.8), rr, a, 0, Math.PI * 2); g.fill(); } // satellite drops / streaks
  for (let i = 0; i < 5; i++) { const a = R() * Math.PI * 2; g.save(); g.translate(64, 64); g.rotate(a); g.beginPath(); g.ellipse(30, 0, 12 + R() * 10, 2.5 + R() * 2, 0, 0, Math.PI * 2); g.fill(); g.restore(); } // spines
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function poolTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 256, 256);
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 110); gr.addColorStop(0, '#2c0202'); gr.addColorStop(0.7, '#470404'); gr.addColorStop(1, '#5e0707');
  g.fillStyle = gr; blobPath(g, 128, 128, 92, 0.16, 2.3); g.fill(); g.fillStyle = '#4a0505'; for (const [x, y, r] of [[40, 150, 14], [210, 96, 11], [176, 210, 9]]) { blobPath(g, x, y, r, 0.2, r); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function dropTexture() { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.clearRect(0, 0, 32, 32); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(16, 16, 13, 0, Math.PI * 2); g.fill(); return new THREE.CanvasTexture(c); }

export class Blood {
  constructor(scene, collision) {
    this.scene = scene; this.col = collision; this.stats = { sprays: 0, splats: 0, pools: 0 };
    // droplets
    this.pos = new Float32Array(MAXP * 3); this.vel = new Float32Array(MAXP * 3); this.life = new Float32Array(MAXP); this.head = 0; this.alive = 0;
    const pg = new THREE.BufferGeometry(); this.posAttr = new THREE.BufferAttribute(this.pos, 3); this.posAttr.setUsage(THREE.DynamicDrawUsage); pg.setAttribute('position', this.posAttr); pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.points = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x5e0707, size: 0.035, map: dropTexture(), alphaTest: 0.4, transparent: false, sizeAttenuation: true }));
    this.points.frustumCulled = false; this.points.name = 'bloodDrops'; scene.add(this.points);
    for (let i = 0; i < MAXP; i++) this.pos[i * 3 + 1] = -1e4;
    // ground marks
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mat = (map, rough) => new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.splatMesh = []; this.splatList = [];
    for (let v = 0; v < VARIANTS; v++) { const m = new THREE.InstancedMesh(geo, mat(splatTexture(v + 1), 0.32), SPLATS); m.count = 0; m.frustumCulled = false; m.receiveShadow = true; m.name = 'bloodSplats'; scene.add(m); this.splatMesh.push(m); this.splatList.push([]); }
    this.poolMesh = new THREE.InstancedMesh(geo, mat(poolTexture(), 0.16), POOLS); this.poolMesh.count = 0; this.poolMesh.frustumCulled = false; this.poolMesh.receiveShadow = true; this.poolMesh.name = 'bloodPools'; scene.add(this.poolMesh); this.pools = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._y = new THREE.Vector3(0, 1, 0);
    this.visible = true; this.n = 0;
  }
  get on() { return Settings.get('blood') !== false; }
  ground(x, z, y = 0) { return this.col ? this.col.groundAt(x, z, y + 0.3) : 0; }
  // ------------------------------------------------------------ impacts
  spray(point, dir, amount = 1) {
    if (!this.on) return false; this.stats.sprays++; const n = Math.round(14 * amount + 6); const dl = Math.hypot(dir.x, dir.z) || 1; const dx = dir.x / dl, dz = dir.z / dl;
    for (let k = 0; k < n; k++) { const back = k % 3 === 0 ? -0.6 : 1; const sp = rnd(1.2, 3.6) * back; const i = this.head; this.head = (this.head + 1) % MAXP;
      this.pos[i * 3] = point.x + rnd(-0.04, 0.04); this.pos[i * 3 + 1] = point.y + rnd(-0.05, 0.05); this.pos[i * 3 + 2] = point.z + rnd(-0.04, 0.04);
      this.vel[i * 3] = dx * sp + rnd(-0.9, 0.9); this.vel[i * 3 + 1] = rnd(-0.4, 1.6); this.vel[i * 3 + 2] = dz * sp + rnd(-0.9, 0.9); this.life[i] = 2.5; }
    this.alive = Math.min(MAXP, this.alive + n);
    // splatter on the ground behind the body
    if (point.y - this.ground(point.x, point.z, point.y) < 2.2) { const d = rnd(0.5, 1.4); this.splat(point.x + dx * d, point.z + dz * d, rnd(0.35, 0.6) * Math.min(1.3, 0.7 + amount * 0.3), point.y); }
    return true;
  }
  splat(x, z, size, yHint = 0) {
    if (!this.on) return; const v = this.n++ % VARIANTS; const L = this.splatList[v]; const y = this.ground(x, z, yHint) + 0.012 + (this.n % 7) * 0.0006;
    if (L.length >= SPLATS) L.shift(); L.push({ x, y, z, r: Math.random() * Math.PI * 2, s: size }); this.stats.splats++; this.dirty = this.dirty || new Set(); this.dirty.add(v);
  }
  pool(x, z, max = 1.0, yHint = 0, delay = 0) {
    if (!this.on) return null; if (this.pools.length >= POOLS) this.pools.shift(); const P = { x, z, y: this.ground(x, z, yHint) + 0.01, r: Math.random() * Math.PI * 2, max, t: -delay, k: 0 }; this.pools.push(P); this.stats.pools++; return P;
  }
  clear() { for (const L of this.splatList) L.length = 0; this.pools.length = 0; this.dirty = new Set([0, 1, 2, 3]); for (let i = 0; i < MAXP; i++) { this.life[i] = 0; this.pos[i * 3 + 1] = -1e4; } this.posAttr.needsUpdate = true; this.alive = 0; }
  // ------------------------------------------------------------ per frame
  update(dt) {
    const on = this.on; if (on !== this.visible) { this.visible = on; this.points.visible = on; this.poolMesh.visible = on; for (const m of this.splatMesh) m.visible = on; }
    if (!on) return;
    if (this.alive > 0) { let live = 0;
      for (let i = 0; i < MAXP; i++) { if (this.life[i] <= 0) continue; live++; this.life[i] -= dt; const j = i * 3; this.vel[j + 1] -= 9.81 * dt; this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
        if (this.vel[j + 1] < 0) { const gy = this.ground(this.pos[j], this.pos[j + 2], this.pos[j + 1]); if (this.pos[j + 1] <= gy + 0.01 || this.life[i] <= 0) { if (this.pos[j + 1] <= gy + 0.02 && Math.random() < 0.3) this.splat(this.pos[j], this.pos[j + 2], rnd(0.06, 0.16), gy); this.life[i] = 0; this.pos[j + 1] = -1e4; } } }
      this.alive = live; this.posAttr.needsUpdate = true; }
    if (this.dirty && this.dirty.size) { for (const v of this.dirty) { const m = this.splatMesh[v], L = this.splatList[v]; L.forEach((s, i) => { this._q.setFromAxisAngle(this._y, s.r); m.setMatrixAt(i, this._m.compose(this._p.set(s.x, s.y, s.z), this._q, this._s.set(s.s, 1, s.s))); }); m.count = L.length; m.instanceMatrix.needsUpdate = true; } this.dirty.clear(); }
    let grow = false; for (const P of this.pools) { if (P.k >= 0.999 && P.t > 0) continue; P.t += dt; if (P.t <= 0) continue; P.k = 1 - Math.exp(-P.t / 7); grow = true; }
    if (grow || this.pools.length !== this.poolMesh.count) { this.pools.forEach((P, i) => { const s = Math.max(0.001, P.max * Math.max(0, P.k)); this._q.setFromAxisAngle(this._y, P.r); this.poolMesh.setMatrixAt(i, this._m.compose(this._p.set(P.x, P.y, P.z), this._q, this._s.set(s, 1, s))); }); this.poolMesh.count = this.pools.length; this.poolMesh.instanceMatrix.needsUpdate = true; }
  }
}
