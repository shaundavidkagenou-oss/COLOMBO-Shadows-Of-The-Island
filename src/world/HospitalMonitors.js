// 75th request — patient monitors that behave like the real thing. Every bedside monitor is OFF (dark glass, amber standby
// LED: HospitalKit K.monitor) unless a patient is in the bed it serves; then a live screen is laid over its glass:
//   ECG lead II (green), SpO2 plethysmograph (cyan) and respiration (yellow) traces drawn by a moving sweep with the
//   erase bar in front of it, numerics on the right (HR, SpO2, NIBP, RR, temperature) that drift like a real patient's,
//   the heart symbol flashing on each QRS, the clock, the bed label. The beep (sounds board: Hospitals → BPM machine)
//   follows the same heart rate.
// Cost: one 256 × 192 canvas texture shared by the live screens (≤ 2 at a time: the ward patient + the player's
// recovery bed), redrawn incrementally ~20× a second only while one is in a drawn room; one quad mesh per live monitor
// (in that room's group, so the room's visibility culls it). Off monitors cost nothing extra.
import * as THREE from 'three';
import { FURNITURE, FLOOR_Y, roomAt } from './HospitalPlan.js';
import { itemFrame, MON_SCR, monitorY } from './HospitalKit.js';
import { PlaceSound, SYNTH, TICK } from '../audio/PlaceAudio.js';

const W = 256, H = 192, TW = 176; // canvas; trace area width (numerics to its right)
const ROWS = [{ y: 46, amp: 30, col: '#3cf06a' }, { y: 104, amp: 18, col: '#3cd2ff' }, { y: 152, amp: 12, col: '#ffd84a' }];
// one heartbeat (phase 0…1): P, QRS, T on a flat baseline (lead II shape)
function ecg(p) { if (p < 0.08) return 0.12 * Math.sin(p / 0.08 * Math.PI); if (p < 0.13) return 0; if (p < 0.15) return -0.15 * ((p - 0.13) / 0.02);
  if (p < 0.18) return -0.15 + 1.25 * ((p - 0.15) / 0.03); if (p < 0.21) return 1.1 - 1.45 * ((p - 0.18) / 0.03); if (p < 0.23) return -0.35 + 0.35 * ((p - 0.21) / 0.02);
  if (p < 0.36) return 0; if (p < 0.52) return 0.28 * Math.sin((p - 0.36) / 0.16 * Math.PI); return 0; }
function pleth(p) { const q = (p + 0.82) % 1; return q < 0.22 ? Math.sin(q / 0.22 * Math.PI / 2) : q < 0.36 ? 1 - (q - 0.22) / 0.14 * 0.45 + 0.1 * Math.sin((q - 0.22) / 0.14 * Math.PI) : 0.55 * (1 - (q - 0.36) / 0.64); }

export class HospitalMonitors {
  constructor(hosp) {
    this.h = hosp; this.live = new Map(); this.t = 0; this.acc = 0; this.x = 0; this.prev = [0, 0, 0]; this.beatP = 0; this.respP = 0; this.flash = 0; this.stats = { live: 0, draws: 0 };
    this.vit = { hr: 76, spo2: 98, sys: 118, dia: 76, rr: 16, temp: 36.8, nextNum: 0 };
    // pair every bed with the monitor nearest to it (same floor, within 2.6 m)
    const mons = FURNITURE.filter((f) => f[0] === 'monitor'); this.byBed = new Map();
    for (const b of FURNITURE) { if (b[0] !== 'bed') continue; let best = null, bd = 2.6; for (const m of mons) { if (m[1] !== b[1]) continue; const d = Math.hypot(m[2] - b[2], m[3] - b[3]); if (d < bd) { bd = d; best = m; } } if (best) this.byBed.set(b, best); }
    if (typeof document === 'undefined') return;
    this.cv = document.createElement('canvas'); this.cv.width = W; this.cv.height = H; this.a = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.generateMipmaps = false; this.tex.minFilter = THREE.LinearFilter;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }); this.mat.name = 'Hospital · Live patient monitor';
    this.geo = new THREE.PlaneGeometry(MON_SCR.w, MON_SCR.h); this.clear();
  }
  clear() { const a = this.a; if (!a) return; a.fillStyle = '#020507'; a.fillRect(0, 0, W, H); a.fillStyle = '#0d2128'; a.fillRect(0, 0, W, 14); a.fillRect(TW + 2, 14, 1, H - 14);
    a.font = '600 10px Arial, sans-serif'; a.fillStyle = '#9fc4cf'; a.textBaseline = 'middle'; a.fillText('ADULT', 4, 7); for (let i = 0; i < 3; i++) { a.fillStyle = ROWS[i].col; a.fillText(['II  x1', 'Pleth', 'Resp'][i], 4, ROWS[i].y - ROWS[i].amp - 2 < 16 ? 20 : ROWS[i].y - ROWS[i].amp - 2); }
    this.numbers(true); this.x = 4; }
  // the screen quad for monitor item m (world placement from the same item frame the kit drew it with)
  mesh(m) { let e = this.live.get(m); if (e) return e; if (!this.mat) return null; const [, fl, u, v, yaw = 0, x = {}] = m; const F = itemFrame(u, v, yaw, FLOOR_Y[fl]); const [wx, wz] = F.P(0, MON_SCR.dz);
    const me = new THREE.Mesh(this.geo, this.mat); me.position.set(wx, F.y + monitorY(x) + MON_SCR.dy, wz); me.rotation.y = Math.PI - yaw; me.matrixAutoUpdate = false; me.updateMatrix(); me.castShadow = false; me.receiveShadow = false; me.name = 'hosp-live-monitor';
    const room = roomAt(u, v, fl); const R = room && this.h.rooms.get(room.id); if (R) R.group.add(me); e = { me, room: R, x: wx, z: wz, spec: { id: 'hosp.monitor', x: wx, z: wz, ref: 2.2, lvl: 0.9, fadeIn: 0.3, fadeOut: 0.3, synth: SYNTH.quiet, tick: TICK.monitor, bpm: 76 } }; this.live.set(m, e); return e; }
  // beds: the occupied beds this frame (array, reused by the caller)
  update(dt, beds) {
    for (const e of this.live.values()) e.on = false; let shown = false; this.stats.live = 0;
    for (const b of beds) { const m = this.byBed.get(b); if (!m) continue; const e = this.mesh(m); if (!e) continue; e.on = true; this.stats.live++; if (e.room && e.room.group.visible) { shown = true; e.spec.bpm = this.vit.hr; PlaceSound.want('mon@' + m[2] + ',' + m[3], e.spec); } }
    for (const e of this.live.values()) if (e.me.visible !== e.on) e.me.visible = e.on;
    this.t += dt; this.beatP += dt * this.vit.hr / 60; this.respP += dt * this.vit.rr / 60; if (this.beatP >= 1) { this.beatP -= 1; this.flash = 0.15; } if (this.respP >= 1) this.respP -= 1; this.flash -= dt;
    if (!shown || !this.a) return; this.acc += dt; if (this.acc < 0.05) return; this.draw(this.acc); this.acc = 0;
  }
  draw(dt) { const a = this.a; const V = this.vit; this.stats.draws++;
    // sweep at ~50 px/s (25 mm/s on a 12" screen ≈ 3.4 s across the trace area): erase ahead, draw the new segment
    const n = Math.max(1, Math.round(dt * 50)); const x0 = this.x; a.fillStyle = '#020507'; a.fillRect(x0 + 1, 15, Math.min(10, TW - x0), H - 15);
    const vals = [ecg(this.beatP), pleth(this.beatP), Math.sin(this.respP * Math.PI * 2) * 0.8 + Math.sin(this.respP * Math.PI * 4) * 0.08];
    a.lineWidth = 1.6; a.lineJoin = 'round';
    for (let i = 0; i < 3; i++) { const R = ROWS[i]; const y1 = R.y - vals[i] * R.amp; a.strokeStyle = R.col; a.beginPath(); a.moveTo(x0, this.prev[i]); a.lineTo(Math.min(TW, x0 + n), y1); a.stroke(); this.prev[i] = y1; }
    this.x += n; if (this.x >= TW) { this.x = 4; }
    // the numerics: every ~2 s (and the heart symbol on each beat)
    if ((V.nextNum -= dt) <= 0) { V.nextNum = 1.6 + Math.random() * 0.8; V.hr = Math.round(Math.min(96, Math.max(62, V.hr + (Math.random() - 0.5) * 3 + (74 - V.hr) * 0.08))); V.spo2 = Math.random() < 0.15 ? (V.spo2 === 98 ? 97 : 98) : V.spo2; V.rr = Math.random() < 0.1 ? 15 + ((Math.random() * 3) | 0) : V.rr; this.numbers(false); }
    a.fillStyle = this.flash > 0 ? '#3cf06a' : '#020507'; a.fillRect(TW + 8, 22, 6, 6);
    this.tex.needsUpdate = true; }
  numbers(full) { const a = this.a; const V = this.vit; a.fillStyle = '#020507'; a.fillRect(TW + 3, 15, W - TW - 3, H - 15); a.textBaseline = 'alphabetic'; a.textAlign = 'right';
    const f = (px, w = 700) => `${w} ${px}px Arial, sans-serif`; const R = W - 4;
    a.font = f(9, 600); a.fillStyle = '#3cf06a'; a.fillText('HR  bpm', R, 26); a.font = f(32); a.fillText(String(V.hr), R, 58);
    a.font = f(9, 600); a.fillStyle = '#3cd2ff'; a.fillText('SpO2 %', R, 76); a.font = f(28); a.fillText(String(V.spo2), R, 104);
    a.font = f(9, 600); a.fillStyle = '#f2f2f2'; a.fillText('NIBP mmHg', R, 120); a.font = f(15); a.fillText(`${V.sys}/${V.dia}`, R, 137); a.font = f(9, 600); a.fillText(`(${Math.round((V.sys + 2 * V.dia) / 3)})`, R, 148);
    a.fillStyle = '#ffd84a'; a.font = f(9, 600); a.fillText('RR', R - 34, 164); a.font = f(15); a.fillText(String(V.rr), R - 30, 180); a.fillStyle = '#ff9a6a'; a.font = f(9, 600); a.fillText('TEMP', R, 164); a.font = f(13); a.fillText(V.temp.toFixed(1), R, 180);
    a.textAlign = 'left'; a.fillStyle = '#0d2128'; a.fillRect(TW + 3, 0, W - TW - 3, 14); const A = this.h.g && this.h.g.atmos; const hr = A && isFinite(A.hour) ? A.hour : 12; const hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
    a.fillStyle = '#9fc4cf'; a.font = f(10, 600); a.textBaseline = 'middle'; a.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, TW + 10, 7); a.textBaseline = 'alphabetic'; if (full) this.x = 4; }
}
