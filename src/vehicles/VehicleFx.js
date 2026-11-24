// 83rd request — per-frame vehicle visual state that is not physics: animated wipers, AI turn indicators / hazards, and the global
// weather uniforms of the vehicle glass + paint shaders (VehicleWeather.js). Runs once per frame from Game (no second loop), touches
// only vehicles already in LIVE_VEHICLES, allocates nothing per frame.
//   wipers — every model records its wiper arms at build time (pivot on the scuttle, rest along the bottom of the screen, sweep in the
//            screen plane, so the blade follows the glass). All visible wipers within WIPER_R are drawn by ONE instanced arm mesh +
//            ONE instanced pivot-cap mesh (2 draw calls in total). Each vehicle runs its own wiper motor: intermittent in drizzle,
//            normal in rain, fast in a downpour; eased sweeps with a dwell at the park position; a delayed last wipe a few seconds
//            after the rain stops; never on a dry screen; parked / unoccupied vehicles keep them parked. The sweep also goes to the
//            vehicle's own glass uniforms so its swept sectors stay clear of drops.
//   indicators — AI vehicles signal from their route (Traffic sets v.ind before curves / when pulling in or out); v.hazard = both
//            sides. Flashing is the existing indicator lamp material (emissive + its side mask) — no lights; an incandescent-style
//            rise / fall instead of a hard switch. The player's vehicle stays with VehicleAudio (clicks + lamp), Roadside
//            breakdowns keep their own hazards.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LIVE_VEHICLES } from './Vehicle.js';
import { RAIN_U, GRIME_U } from './VehicleWeather.js';
import { IND } from './VehicleModels.js';

const MAXW = 128, WIPER_R = 75, FLASH = 0.37, IND_R = 170;
export const VFX_STATS = { wipers: 0, running: 0, flashing: 0, glassU: 0 };
const ease = (x) => x * x * (3 - 2 * x);
const _M = new THREE.Matrix4(), _L = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _x2 = new THREE.Vector3();

export class VehicleFx {
  constructor(scene) {
    const box = (sx, sy, sz, x, y) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, 0);
    // unit wiper along +x (scaled to the arm length): raised arm, blade spine + rubber lying on the glass (y = screen normal)
    const arm = mergeGeometries([box(1, 0.011, 0.015, 0.5, 0.024), box(0.05, 0.022, 0.014, 0.02, 0.012), box(0.84, 0.011, 0.02, 0.56, 0.011), box(0.86, 0.007, 0.007, 0.56, 0.0035)]);
    const cap = new THREE.CylinderGeometry(0.02, 0.024, 0.03, 10).translate(0, 0.012, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.5, metalness: 0.35 });
    this.arms = new THREE.InstancedMesh(arm, mat, MAXW); this.caps = new THREE.InstancedMesh(cap, mat, MAXW);
    for (const m of [this.arms, this.caps]) { m.name = 'wipers'; m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
    this.t = 0; this.rainOn = false;
  }
  update(dt, cam, A) {
    this.t += dt; const rain = A && A.w ? A.w.rain || 0 : 0, wet = A ? A.wet || 0 : 0;
    RAIN_U.uGrRain.value = rain; RAIN_U.uGrWet.value = wet; RAIN_U.uGrT.value = this.t % 1000; GRIME_U.uGmWet.value = wet;
    const cx = cam.position.x, cz = cam.position.z; let n = 0, run = 0, fl = 0, gu = 0;
    for (const v of LIVE_VEHICLES) {
      const m = v.mesh; if (!m) continue; const ud = m.userData; const d2 = (m.position.x - cx) ** 2 + (m.position.z - cz) ** 2;
      // ---- indicators / hazards (AI)
      const im = ud.indMat;
      if (im && !v.player && !v.rsInc) { const s = v.hazard ? 2 : v.ind | 0;
        if (s !== (v._fxS | 0)) { if (im.userData.base == null) im.userData.base = im.emissiveIntensity; v._fxS = s; v._fxT = (v.id || 0) * 0.137 % FLASH * 0.3; if (!s) { im.emissiveIntensity = im.userData.base; if (im.userData.side) im.userData.side.value = 0; } }
        if (s) { v._fxT += dt; if (d2 < IND_R * IND_R) { const ph = v._fxT % (2 * FLASH); const on = ph < FLASH; const e = on ? 1 - Math.exp(-ph / 0.03) : Math.exp(-(ph - FLASH) / 0.055); const b = im.userData.base;
          im.emissiveIntensity = b + (IND.peak - b) * e; if (im.userData.side) im.userData.side.value = s === 2 ? 0 : -s; fl++; } } }
      // ---- wipers
      const arms = ud.wipers; if (!arms) continue;
      const W = v._wip || (v._wip = { ph: -1, wait: Math.random() * 1.2, lastT: 0, k: 0.9 + Math.random() * 0.2, act: 0, rain: false });
      const occ = (!v.parked || v.player) && !v.wrecked && !v.burning && v.engineOn !== false && v.health !== 0;
      let cyc = 0, gap = 0; if (occ && rain > 0.03) { if (rain < 0.3) { cyc = 1.55; gap = Math.max(1.2, 7 - rain * 18); } else if (rain < 0.85) { cyc = 1.2; gap = 0.15; } else { cyc = 0.82; gap = 0; } }
      if (cyc && !W.rain) { W.rain = true; W.wait = Math.min(W.wait, 0.4 * W.k); } else if (!cyc && W.rain) { W.rain = false; if (occ) W.lastT = 2.5 + Math.random() * 2; } // rain stopped: one delayed last wipe
      if (W.ph >= 0) { W.ph += dt / ((cyc || 1.25) * W.k); if (W.ph >= 1) { W.ph = -1; W.wait = cyc ? gap * W.k : 0; } }
      else if (occ && cyc) { W.wait -= dt; if (W.wait <= 0) W.ph = 0; }
      else if (occ && W.lastT > 0) { W.lastT -= dt; if (W.lastT <= 0 && wet > 0.05) W.ph = 0; } // never on a dry screen
      W.act += ((cyc ? 1 : 0) - W.act) * Math.min(1, dt / (cyc ? 0.6 : 9));
      // eased up-and-back sweep, a short dwell at the top (blade reversal)
      const f = W.ph < 0 ? 0 : W.ph < 0.46 ? ease(W.ph / 0.46) : W.ph < 0.54 ? 1 : ease((1 - W.ph) / 0.46);
      const U = ud.wipeU; if (U) { for (let i = 0; i < arms.length && i < 2; i++) U.uWd.value[i].w = f * arms[i].sweep; U.uWs.value.set(W.act, Math.abs(v.speed || 0), 0, 0); gu++; }
      if (W.ph >= 0) run++;
      if (d2 > WIPER_R * WIPER_R || !m.visible || !m.parent || n + arms.length > MAXW) continue;
      m.updateMatrix(); _M.copy(m.matrix); if (m.parent.matrixWorld && !m.parent.isScene) _M.premultiply(m.parent.matrixWorld);
      for (const a of arms) { const th = f * a.sweep, c = Math.cos(th), s = Math.sin(th); const k = a.big ? 1.6 : 1;
        _x.set(a.r[0] * c + a.w[0] * s, a.r[1] * c + a.w[1] * s, a.r[2] * c + a.w[2] * s); _y.set(a.n[0], a.n[1], a.n[2]); _z.crossVectors(_x, _y);
        _L.makeBasis(_x2.copy(_x).multiplyScalar(a.L), _y.multiplyScalar(k), _z.multiplyScalar(k)); _L.setPosition(a.p[0], a.p[1], a.p[2]);
        this.arms.setMatrixAt(n, _L.premultiply(_M));
        _L.makeBasis(_x.multiplyScalar(k), _y, _z); _L.setPosition(a.p[0], a.p[1], a.p[2]); this.caps.setMatrixAt(n, _L.premultiply(_M)); n++; }
    }
    this.arms.count = this.caps.count = n; if (n) { this.arms.instanceMatrix.needsUpdate = true; this.caps.instanceMatrix.needsUpdate = true; }
    VFX_STATS.wipers = n; VFX_STATS.running = run; VFX_STATS.flashing = fl; VFX_STATS.glassU = gu;
  }
}
