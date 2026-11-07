// Wet-road light reflections: on wet asphalt every light source throws a long, broken, vertical streak toward the viewer
// (anisotropic reflection on a rough wet surface). A real planar/SSR reflection pass is too expensive for mid-range PCs, so
// each nearby light gets one additive streak quad at its geometrically correct mirror point on the road (where the camera →
// mirrored-light ray meets the ground: t = hCam / (hCam + hLight) along the ground line), stretched along the view direction
// and broken up by a ripple texture. One instanced draw call; nothing is drawn when the roads are dry or in daylight.
import * as THREE from 'three';

function streakTexture() {
  const W = 64, H = 256; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const img = g.createImageData(W, H);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const rows = []; for (let y = 0; y < H; y++) rows.push(0.55 + 0.45 * rnd());
  for (let y = 0; y < H; y++) { const v = y / (H - 1); const along = Math.pow(Math.sin(Math.PI * v), 0.7) * (0.35 + 0.65 * v); // strongest near the light end (v = 1)
    const band = rows[y] * (0.75 + 0.25 * rows[Math.min(H - 1, y + 1)]);
    for (let x = 0; x < W; x++) { const u = (x / (W - 1)) * 2 - 1; const across = Math.exp(-u * u * 7) + 0.25 * Math.exp(-u * u * 1.6); const a = Math.min(1, along * across * band);
      const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255); img.data[i + 3] = 255; } }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class WetGlints {
  static budget(q) { return q === 'low' ? 0 : q === 'medium' ? 24 : q === 'ultra' ? 64 : 40; } // streaks per quality preset (all allocated once)
  constructor(scene, count) {
    this.max = count; this.scene = scene; this.n = 0; this.mesh = null; if (!count) return;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // lies on the ground, long axis = local z (v runs −z → +z)
    const mat = new THREE.MeshBasicMaterial({ map: streakTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, count); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.name = 'wet-glints'; this.mesh.renderOrder = 3;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.setColorAt(0, new THREE.Color(0, 0, 0)); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color(); this._y = new THREE.Vector3(0, 1, 0);
  }
  // sources: [x, y, z, r, g, b, intensity]; onRoad(x, z) → bool; roadY = asphalt height
  update(camera, sources, wet, night, onRoad, roadY) {
    if (!this.mesh) return; const k = wet * THREE.MathUtils.smoothstep(night, 0.2, 0.7); if (k < 0.02 || !sources.length) { this.mesh.count = 0; return; }
    const cp = camera.position, hc = Math.max(0.4, cp.y - roadY); let n = 0; const M = this._m;
    for (const s of sources) { if (n >= this.max) break;
      const dx = s[0] - cp.x, dz = s[2] - cp.z, d = Math.hypot(dx, dz); if (d < 1.5 || d > 140) continue; const hs = Math.max(0.3, s[1] - roadY);
      const t = hc / (hc + hs); const rx = cp.x + dx * t, rz = cp.z + dz * t; const dr = d * t; // mirror point (distance from the camera along the ground)
      const len = Math.min(16, 1.8 + dr * 0.55), wid = Math.min(1.6, 0.45 + dr * 0.025); const ux = dx / d, uz = dz / d;
      const cx = rx - ux * len * 0.32, cz = rz - uz * len * 0.32; if (!onRoad(cx, cz) || !onRoad(rx, rz)) continue; // the streak runs from the mirror point toward the viewer
      this._q.setFromAxisAngle(this._y, Math.atan2(-ux, -uz)); /* texture v = 1 (bright end) is local −z: point it at the light */ M.compose(this._p.set(cx, roadY + 0.03, cz), this._q, this._s.set(wid, 1, len)); this.mesh.setMatrixAt(n, M);
      const f = k * s[6] / (1 + dr / 45); this.mesh.setColorAt(n, this._c.setRGB(s[3] * f, s[4] * f, s[5] * f)); n++; }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { if (!this.mesh) return; this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.map.dispose(); this.mesh.material.dispose(); this.mesh = null; }
}
