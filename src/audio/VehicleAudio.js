// 76th: the player's vehicle — mechanical sounds tied to its real state (sounds window → "Vehicle mechanical"):
//   engine   startup when you sit down as the driver of a vehicle whose engine is off (parked / your own car); a car taken from a
//            driver is already running. The engine voice (Audio.updateEngines) is held silent until the starter catches
//            (v.engineK ramps 0 → 1), then idles from the class's idle loop at a standstill. Getting out shuts it down (shutdown
//            sound at the car) and leaves it ticking as it cools — longer the harder / longer it was driven; the ticks stop
//            if you drive off again or the car is towed / unloaded (disposed).
//   indicators  , and . (Settings → Controls). Both the click and the lamp follow one flasher (0.37 s on / off): a click on every
//            relay change, the lamps on that side only (VehicleModels.sideLamps); same key again cancels, and they cancel
//            themselves once a turn of more than ~55° has been made and the wheel is straight again.
//   gears    the engine voice's own gear model (a shift every 9 m/s): a clunk on each shift, softer on the way down.
//   brakes   a squeal when braking from speed down to a crawl (not every time); air brakes hissing as a bus / lorry stops.
//   tyres    a rolling loop (level / pitch from speed, colour from the surface under the car — Surface.js, sampled 4× a second)
//            and a screech loop from wheelspin / lock-up (Vehicle.slipK) and sideways sliding.
// Per-vehicle configuration: every type maps to a class (car / diesel / heavy / bike / tuk-tuk — Audio.mechClass) with its own
// start / idle / stop slots and the settings in CFG below. All of it goes to the Vehicles bus (Settings → Audio → Vehicles).
import { Audio, mechClass } from './Audio.js';
import { SoundBank as SB } from './SoundBank.js';
import { surfaceAt, wetSurface } from './Surface.js';
import { IND } from '../vehicles/VehicleModels.js';

const CFG = { // per class: the fallback recording for start / stop, ticks after a drive, air brakes, indicator click level
  car: { alt: null, ticks: 1, air: false, click: 1 }, diesel: { alt: 'car', ticks: 1.2, air: false, click: 1 }, heavy: { alt: 'car', ticks: 1.5, air: true, click: 1.2 },
  bike: { alt: null, ticks: 0.6, air: false, click: 0.7 }, tuktuk: { alt: null, ticks: 0.7, air: false, click: 0.8 },
};
const FLASH = 0.37; // s per indicator half-cycle (~81 flashes a minute)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const TYRE = { asphalt: [450, 1], concrete: [600, 0.9], wet: [2400, 1.15], gravel: [1700, 1.35], mud: [320, 1.1], grass: [300, 0.6], grate: [900, 1], tile: [600, 0.9], wood: [380, 0.9], metalStair: [900, 1] };

class VehicleSounds {
  constructor() { this.g = null; this.cur = null; this.cool = []; this.taken = new WeakSet(); this.ind = { t: 0, on: false, yaw: 0, py: 0, side: 0 }; this.roll = { h: {} }; this.scr = { h: {} }; this.gear = 0; this.gearT = 0; this.brk = { hi: false, t: -9, air: -9 }; this.surfT = 0; this.surf = 'asphalt'; this.stats = { starts: 0, stops: 0, ticks: 0, clicks: 0, gears: 0, brakes: 0 }; }
  init(g) { this.g = g; }
  // a vehicle taken from its driver (carjack / the driver got out): its engine is running when you sit down
  tookRunning(v) { if (v) this.taken.add(v); }
  update(dt) {
    const g = this.g, P = g && g.player; if (!P || !Audio.ready) return;
    const v = P.vehicle && P.vehicle.player && !P.exiting && !P.vehicle.T.pedal && mechClass(P.vehicle.type) ? P.vehicle : null; // (getting out: the engine goes off as the exit starts)
    if (v !== this.cur) { if (this.cur) this.leave(this.cur); if (v) this.enter(v); this.cur = v; }
    if (v) this.drive(v, dt);
    this.loops(v, dt); this.cooling(dt);
  }
  cls(v) { return mechClass(v.type) || 'car'; }
  // id of a start / stop recording for v's class (its own, else the class's fallback), or null
  rec(kind, c) { const id = `mech.${kind}.${c}`; if (SB.has(id)) return id; const a = CFG[c] && CFG[c].alt; return a && SB.has(`mech.${kind}.${a}`) ? `mech.${kind}.${a}` : null; }
  enter(v) {
    const c = this.cls(v); this.cool = this.cool.filter((k) => k.v !== v); this.gear = Math.floor(Math.abs(v.speed) / 9); this.ind.t = 0; this.ind.on = false;
    if (v.engineOn || this.taken.has(v) || Math.abs(v.speed || 0) > 1) { this.taken.delete(v); v.engineOn = true; v.engineK = 1; return; }
    v.engineOn = true; v.engineK = 0; this.stats.starts++;
    const id = this.rec('start', c); let dur = 0;
    if (id && SB.play(id, 1, 0, 0, { out: 'veh', key: 'mech' })) dur = SB.lastDur || 1;
    else { dur = c === 'heavy' ? 1.3 : c === 'bike' || c === 'tuktuk' ? 0.6 : 0.9; this.synthStart(c, dur); }
    v._catch = Math.max(0.3, dur * 0.65); // the engine voice comes in as the starter catches
  }
  leave(v) {
    this.lamp(v, 0); v.ind = 0; if (!v.engineOn) return; const P = this.g.player; if ((P.vehicle && !P.exiting) || Math.hypot(v.x - P.x, v.z - P.z) > 8) return; // switched to another squad member: it runs on under its driver
    v.engineOn = false; v.engineK = 0; v._catch = 0;
    if (v.wrecked || v.disposed) return; this.stats.stops++;
    const c = this.cls(v); const A = Audio.at(v.x, v.z, 8); const id = this.rec('stop', c);
    if (!(id && SB.play(id, A.g, A.pan, 0, { out: 'veh', key: 'mech', lp: A.lp }))) this.synthStop(c, A.g, A.pan);
    const heat = Math.min(60, v._heat || 0); v._heat = 0; if (heat > 4) this.cool.push({ v, t: 2 + Math.random(), age: 0, end: (10 + heat) * CFG[c].ticks });
  }
  drive(v, dt) {
    const sp = Math.abs(v.speed || 0), c = this.cls(v);
    if (v.wrecked || v.health <= 0) { v.engineK = 0; v.engineOn = false; if (v.ind) { v.ind = 0; this.lamp(v, 0); } return; }
    if (v._catch > 0) { v._catch -= dt; if (v._catch <= 0) v.engineK = 1; else v.engineK = 0; }
    v._heat = (v._heat || 0) + dt * (0.25 + (v.throttle || 0)) * (sp > 1 ? 1 : 0.3);
    // indicators
    const I = this.ind;
    if (v.ind) { if (I.side !== v.ind) { I.side = v.ind; I.t = 0; I.on = true; I.yaw = 0; I.py = v.yaw; this.click(v, true); this.lamp(v, v.ind); }
      else { I.t += dt; if (I.t >= FLASH) { I.t -= FLASH; I.on = !I.on; this.click(v, I.on); this.lamp(v, I.on ? v.ind : 0); } }
      I.yaw += wrap(v.yaw - I.py); I.py = v.yaw; if (Math.abs(I.yaw) > 0.95 && Math.abs(v.steer || 0) < 0.06) v.ind = 0; } // self-cancel after the turn
    else if (I.side) { I.side = 0; I.on = false; this.lamp(v, 0); }
    // gears (the engine voice's model: a shift every 9 m/s)
    this.gearT -= dt; const gr = Math.floor(sp / 9); if (gr !== this.gear && v.engineK > 0.5) { const up = gr > this.gear; this.gear = gr; if (this.gearT <= 0 && (up ? (v.throttle || 0) > 0.2 : true)) { this.gearT = 0.45; this.stats.gears++; const k = up ? 0.9 : 0.55;
      if (!SB.play('mech.gear', k, 0, 0, { rate: (up ? 1 : 0.92) * (0.96 + Math.random() * 0.08), out: 'veh', key: 'mech' })) { Audio.noise(0.05, { f: 420, q: 1, vol: 0.05 * k, out: 'veh' }); Audio.tone(95, 0.06, { type: 'triangle', vol: 0.04 * k, out: 'veh' }); } } } else if (gr !== this.gear) this.gear = gr;
    // brakes
    const B = this.brk, t = Audio.ctx.currentTime; if (v.brake && sp > 8) B.hi = true; if (!v.brake && sp > 3) B.hi = false;
    if (B.hi && v.brake && sp < 3 && sp > 0.3) { B.hi = false; if (t - B.t > 5 && Math.random() < 0.65) { B.t = t; this.stats.brakes++; if (!SB.play('mech.brake', 0.8, 0, 0, { rate: 0.95 + Math.random() * 0.1, out: 'veh', key: 'mech' })) Audio.tone(2900 + Math.random() * 300, 0.45, { type: 'triangle', vol: 0.008, attack: 0.05, glide: 2650, out: 'veh' }); }
      if (CFG[c].air && t - B.air > 5) { B.air = t; B.airPending = true; } }
    if (B.airPending && sp < 0.35) { B.airPending = false; if (!SB.play('mech.brake.air', 1, 0, 0.1, { out: 'veh', key: 'mech' })) Audio.noise(0.55, { f: 4200, q: 0.7, type: 'highpass', vol: 0.06, attack: 0.01, when: 0.1, out: 'veh' }); }
  }
  click(v, on) { this.stats.clicks++; const id = v.ind < 0 ? 'mech.indL' : 'mech.indR'; const k = CFG[this.cls(v)].click * (on ? 1 : 0.75);
    if (!SB.play(id, k, 0, 0, { rate: on ? 1 : 0.88, out: 'veh', key: 'ind' })) { Audio.tone(on ? 2300 : 1600, 0.012, { type: 'square', vol: 0.012 * k, out: 'veh', attack: 0.001 }); Audio.noise(0.012, { f: on ? 3200 : 2200, q: 2, vol: 0.03 * k, out: 'veh', attack: 0.001 }); } }
  // the indicator lamps of v: side −1 left / +1 right / 0 off (vehicle-local +x is the left side)
  lamp(v, side) { const m = v && v.mesh && v.mesh.userData && v.mesh.userData.indMat; if (!m) return; if (m.userData.base == null) m.userData.base = m.emissiveIntensity;
    if (m.userData.side) m.userData.side.value = side ? -side : 0; m.emissiveIntensity = side ? IND.peak : m.userData.base; }
  synthStart(c, dur) { const n = Math.max(2, Math.round(dur / 0.16)); const f = c === 'heavy' ? 70 : c === 'bike' || c === 'tuktuk' ? 140 : 105;
    for (let i = 0; i < n; i++) Audio.noise(0.11, { f: f * 4, q: 1.2, vol: 0.05, when: i * 0.14, out: 'veh' }); Audio.tone(f * 0.6, 0.5, { type: 'sawtooth', vol: 0.03, when: dur * 0.6, glide: f * 0.35, out: 'veh' }); Audio.noise(0.25, { f: 300, q: 0.8, type: 'lowpass', vol: 0.08, when: dur * 0.6, out: 'veh' }); }
  synthStop(c, g, pan) { const f = c === 'heavy' ? 30 : c === 'bike' || c === 'tuktuk' ? 60 : 42; Audio.tone(f, 0.6, { type: 'sawtooth', vol: 0.04 * g, pan, glide: f * 0.45, out: 'veh' }); Audio.noise(0.3, { f: 220, q: 0.8, type: 'lowpass', vol: 0.05 * g, pan, out: 'veh' }); }
  // cooling ticks: a metal tick now and then, sparser as it cools; heard only near the car
  cooling(dt) { if (!this.cool.length) return; const P = this.g.player;
    for (let i = this.cool.length - 1; i >= 0; i--) { const C = this.cool[i], v = C.v; C.age += dt; C.t -= dt;
      if (v.disposed || v === this.cur || v.wrecked || C.age > C.end) { this.cool.splice(i, 1); continue; } // (v.player stays set through the exit animation: only a real re-entry cancels)
      if (C.t > 0) continue; const f = C.age / C.end; C.t = (0.5 + f * 2.8) * (0.5 + Math.random());
      if (Math.hypot(v.x - P.x, v.z - P.z) > 25) continue; const A = Audio.at(v.x, v.z, 5); if (A.g < 0.02) continue; this.stats.ticks++; const k = (1 - f * 0.6) * A.g;
      if (!SB.play('mech.tick', k, A.pan, 0, { rate: 0.9 + Math.random() * 0.25, out: 'veh', key: 'tick', lp: A.lp })) { Audio.tone(3200 + Math.random() * 1400, 0.018, { type: 'sine', vol: 0.03 * k, pan: A.pan, out: 'veh', attack: 0.001 }); Audio.noise(0.01, { f: 5200, q: 3, vol: 0.02 * k, pan: A.pan, out: 'veh', attack: 0.001 }); } } }
  // tyre rolling + screech loops of the player's vehicle (recordings, else filtered noise); silent and released when stopped
  loops(v, dt) { const c = Audio.ctx, t = c.currentTime; const sp = v ? Math.abs(v.speed || 0) : 0; const ground = v && !v.air;
    if (v && (this.surfT -= dt) <= 0) { this.surfT = 0.25; const at = this.g.atmos; this.surf = wetSurface(surfaceAt(v.x, v.z, v.y, null, null), at ? at.wet || 0 : 0); }
    const ts = TYRE[this.surf] || TYRE.asphalt; const roll = ground ? Math.min(1, sp / 26) * ts[1] : 0;
    const slide = v && ground && sp > 3 ? Math.min(1, Math.max(v.slipK || 0, (Math.abs(v.lat || 0) - 2) / 6, 0)) : 0;
    this.loop(this.roll, 'mech.tyreRoll', roll, 0.7 + Math.min(0.7, sp / 40), t, ts[0], 'roll');
    this.loop(this.scr, 'mech.screech', slide * (this.surf === 'asphalt' || this.surf === 'concrete' || this.surf === 'tile' ? 1 : 0.35), 0.9 + Math.min(0.25, sp / 120), t, 2300, 'screech'); }
  loop(H, id, lvl, rate, t, f, kind) { const c = Audio.ctx;
    if (!H.g) { H.g = c.createGain(); H.g.gain.value = 0; H.g.connect(Audio.bus.veh); }
    const smp = lvl > 0.01 && SB.has(id) ? SB.syncLoop(H, id, H.g) : null; if (smp) smp.src.playbackRate.setTargetAtTime(rate, t, 0.1); else if (H.smp && H.g.gain.value < 0.003) SB.stopLoop(H);
    if (!smp && lvl > 0.01 && !H.n) { const s = c.createBufferSource(); s.buffer = kind === 'roll' ? Audio.brownBuf : Audio.noiseBuf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = kind === 'roll' ? 0.7 : 5; fl.frequency.value = f; const ng = c.createGain(); ng.gain.value = 0;
      s.connect(fl); fl.connect(ng); ng.connect(H.g); let o = null; if (kind === 'screech') { o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 1750; const og = c.createGain(); og.gain.value = 0.08; o.connect(og); og.connect(ng); o.start(); } s.start(); H.n = { s, fl, ng, o }; }
    if (H.n) { H.n.ng.gain.setTargetAtTime(smp ? 0 : 1, t, 0.1); H.n.fl.frequency.setTargetAtTime(f * (kind === 'roll' ? rate : 1), t, 0.2); if (H.n.o) H.n.o.frequency.setTargetAtTime(1650 + rate * 200 + Math.random() * 60, t, 0.05); }
    H.g.gain.setTargetAtTime(lvl * (smp ? 1 : kind === 'roll' ? 0.1 : 0.05), t, kind === 'screech' ? 0.05 : 0.15);
    if (H.n && lvl <= 0.01 && H.g.gain.value < 0.002) { try { H.n.s.stop(); if (H.n.o) H.n.o.stop(); } catch { /* stopped */ } H.n = null; } }
}
export const VehicleAudio = new VehicleSounds();
if (typeof window !== 'undefined') window.__vehAudio = VehicleAudio;
