// 76th: traffic audio (sounds window → "Traffic") — the traffic simulation's own vehicles, never a fake bed:
//   • every frame, for the AI vehicles within 70 m (Traffic.vehicles — despawned / unloaded ones simply aren't in it, so
//     nothing of theirs keeps playing): relative position and velocity to the listener → the Doppler factor their engine voice
//     uses (Audio.updateEngines reads v._dop: pitch up approaching, down going away), and pass-by events:
//       approach — a fast vehicle (> 9 m/s) closing in crosses 35 m                → traffic.approach (once per vehicle per 6 s)
//       pass-by  — the closing speed turns into an opening one within 9 m, > 7 m/s → traffic.whoosh (pitched by the speed)
//                  followed by traffic.away a moment later, pitched down by the receding Doppler factor
//   • tyre roar: ONE shared loop for all nearby traffic, its level the sum of each vehicle's speed × distance gain and its
//     pan the weighted direction (one source however busy the road is)
//   • hard braking (the AI's own deceleration, Traffic.step v.acc) above 8 m/s → traffic.screech, at the car
//   • NPC engines per class (traffic.motorcycle / bus / tuk-tuk) and NPC horns (traffic.horn) are chosen in Audio.js
// Everything is stereo-panned, distance-attenuated and low-passed with distance; event one-shots share the 'traffic' voice key.
import { Audio } from './Audio.js';
import { SoundBank as SB } from './SoundBank.js';

const C_SND = 343, R = 70;
class TrafficSounds {
  constructor() { this.st = new WeakMap(); this.lv = { x: 0, z: 0, px: null, pz: null }; this.tyre = { h: {}, g: null, p: null, n: null }; this.appT = 0; this.passT = 0; this.stats = { near: 0, passes: 0, approaches: 0, screeches: 0 }; }
  update(dt, g) {
    if (!Audio.ready || !g || !g.traffic) return; const c = Audio.ctx, t = c.currentTime; const L = Audio.listener; if (!L) return;
    // listener velocity (on foot or driving) from its own motion
    const V = this.lv; if (V.px != null && dt > 0) { const k = Math.min(1, dt * 6); V.x += (((L.x - V.px) / dt) - V.x) * k; V.z += (((L.z - V.pz) / dt) - V.z) * k; if (Math.abs(V.x) > 80 || Math.abs(V.z) > 80) { V.x = 0; V.z = 0; } } V.px = L.x; V.pz = L.z;
    const indoor = !!(g.indoor || g.seamK > 0.6); let sum = 0, panW = 0, near = 0;
    for (const v of g.traffic.vehicles) {
      if (v.player || (v.T && v.T.pedal)) continue; const dx = v.x - L.x, dz = v.z - L.z; const d2 = dx * dx + dz * dz; if (d2 > R * R) { v._dop = 1; continue; }
      near++; const d = Math.sqrt(d2) || 0.01; const fw = v.forward(); const sp = v.free ? Math.hypot(v.free.vx, v.free.vz) : Math.abs(v.speed || 0);
      const vx = v.free ? v.free.vx : fw[0] * (v.speed || 0), vz = v.free ? v.free.vz : fw[1] * (v.speed || 0);
      const rvx = vx - V.x, rvz = vz - V.z; const vr = (dx * rvx + dz * rvz) / d; // + opening, − closing (m/s)
      v._dop = Math.max(0.82, Math.min(1.2, C_SND / (C_SND + vr))); // moving source / listener: f' = f · c / (c + v_r)
      let S = this.st.get(v); if (!S) { S = { vr, d, appT: -9, passT: -9, scrT: -9 }; this.st.set(v, S); }
      const rel = Math.hypot(rvx, rvz);
      if (!indoor) {
        if (sp > 9 && vr < -6 && S.d > 35 && d <= 35 && t - S.appT > 6 && t - this.appT > 1.5) { S.appT = this.appT = t; this.oneShot('traffic.approach', v, 0.8, v._dop); this.stats.approaches++; }
        if (S.vr < -2 && vr >= -2 && d < 9 && rel > 7 && t - S.passT > 3 && t - this.passT > 0.35) { S.passT = this.passT = t; this.pass(v, rel); }
        const acc = v.acc || 0; if (acc < -6 && sp > 8 && t - S.scrT > 3 && d < 55) { S.scrT = t; this.screech(v, sp); }
      }
      // tyre roar contribution
      const [gg, pan] = Audio.spatial(v.x, v.z, 12); const w = Math.min(1, sp / 22) * gg; sum += w; panW += w * pan;
      S.vr = vr; S.d = d;
    }
    this.stats.near = near; this.tyres(t, sum, sum > 1e-4 ? panW / sum : 0, indoor);
  }
  oneShot(id, v, k, rate) { const A = Audio.at(v.x, v.z, 18); if (A.g < 0.02) return false; return SB.play(id, k * A.g, A.pan, A.delay, { rate: Math.max(0.6, Math.min(1.6, rate)), lp: A.lp, out: 'veh', key: 'traffic' }); }
  pass(v, rel) { this.stats.passes++; const A = Audio.at(v.x, v.z, 14); if (A.g < 0.03) return; const k = Math.min(1.2, 0.35 + rel / 25) * A.g; const r0 = 0.9 + Math.min(0.3, rel / 80);
    const heavy = v.T && v.T.mass > 4000;
    if (!SB.play('traffic.whoosh', k, A.pan, 0, { rate: r0 * (heavy ? 0.85 : 1), lp: A.lp, out: 'veh', key: 'traffic' })) Audio.noise(0.55, { f: heavy ? 1100 : 1700, q: 0.7, vol: 0.07 * k, pan: A.pan, attack: 0.12, sweep: heavy ? 380 : 520, out: 'veh' });
    const dopAway = C_SND / (C_SND + rel); // the receding pitch
    if (!SB.play('traffic.away', k * 0.8, -A.pan * 0.6, 0.28, { rate: r0 * dopAway * (heavy ? 0.85 : 1), lp: A.lp || 9000, out: 'veh', key: 'traffic' })) Audio.noise(0.9, { f: 700, q: 0.6, vol: 0.03 * k, pan: -A.pan * 0.6, when: 0.3, attack: 0.1, sweep: 300, out: 'veh' }); }
  screech(v, sp) { this.stats.screeches++; const A = Audio.at(v.x, v.z, 20); if (A.g < 0.02) return; const k = Math.min(1, sp / 18) * A.g;
    if (SB.play('traffic.screech', k, A.pan, A.delay, { rate: 0.94 + Math.random() * 0.12, lp: A.lp, out: 'veh', key: 'traffic', dur: Math.min(1.6, 0.4 + sp / 20) })) return;
    Audio.tone(1900 + Math.random() * 500, 0.5 + sp / 40, { type: 'sawtooth', vol: 0.012 * k, pan: A.pan, attack: 0.03, glide: 1500, out: 'veh' }); Audio.noise(0.5, { f: 2600, q: 3, vol: 0.04 * k, pan: A.pan, out: 'veh' }); }
  // the shared tyre-roar loop (recording, else a band of noise) — one source for the whole street
  tyres(t, sum, pan, indoor) { const T = this.tyre, c = Audio.ctx; if (!T.g) { T.g = c.createGain(); T.g.gain.value = 0; T.p = c.createStereoPanner(); T.g.connect(T.p); T.p.connect(Audio.bus.veh); }
    const lvl = Math.min(1, sum) * (indoor ? 0.15 : 1); const rec = lvl > 0.01 && SB.has('traffic.tyres') ? SB.syncLoop(T.h, 'traffic.tyres', T.g) : null; if (!rec && T.h.smp && T.g.gain.value < 0.004) SB.stopLoop(T.h);
    if (!rec && lvl > 0.01 && !T.n) { const s = c.createBufferSource(); s.buffer = Audio.brownBuf; s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.8; const ng = c.createGain(); ng.gain.value = 0; s.connect(f); f.connect(ng); ng.connect(T.g); s.start(); T.n = { s, ng }; }
    if (T.n) T.n.ng.gain.setTargetAtTime(rec ? 0 : 0.5, t, 0.3);
    T.g.gain.setTargetAtTime(lvl * (rec ? 0.9 : 0.12), t, 0.25); T.p.pan.setTargetAtTime(pan, t, 0.25);
    if (T.n && lvl < 0.005 && T.g.gain.value < 0.002) { try { T.n.s.stop(); } catch { /* stopped */ } T.n = null; } }
}
export const TrafficAudio = new TrafficSounds();
if (typeof window !== 'undefined') window.__trafficAudio = TrafficAudio;
