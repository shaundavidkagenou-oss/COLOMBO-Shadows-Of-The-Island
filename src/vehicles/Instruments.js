// 84th request ("instrument upgrades"): working instruments for the vehicle the player is in.
// Before: the car binnacle was two blank black discs with needles baked into the merged cabin geometry at fixed angles, and the
// motorcycle atlas (VehicleModels.dashMaterial) had its speedo needle, "N", "0 km/h" and both indicator tell-tales painted in —
// nothing on any dashboard ever moved. Now:
//   • the shared dash atlas carries marked car gauge faces (tacho 0–8 ×1000 rpm with red line, speedo 0–220 km/h) in its spare
//     quarter; VehicleDetail / BikeModels record each dial (dm.dials: centre, up, normal, needle length, scale) instead of baking a needle
//   • for the player's vehicle only, live needles (one shared geometry + material, two meshes at most) sweep with road speed and an
//     engine-speed model (idle, gears, throttle, shift drops, engine off = 0), with needle inertia
//   • a TFT bike gets its own copy of the atlas while ridden: rev bar, gear, speed and blinking indicator tell-tales are redrawn
//     at ≤ 10 Hz and only when a shown value changed (one 512×256 upload), and the shared material is restored on leaving
// Every other vehicle keeps the shared static atlas (needles at rest are not drawn: a parked car's needle sits under the bezel).
import * as THREE from 'three';

const D2R = Math.PI / 180;
export const DIAL = { a0: -135, a1: 135 }; // needle sweep, degrees clockwise from 12 o'clock as the driver sees it
// --- canvas drawing (shared by the static atlas and the player's live copy) -------------------------------------------------
function gauge(g, cx, cy, r, max, step, label, red, unit) {
  g.save(); g.translate(cx, cy); g.fillStyle = '#060607'; g.beginPath(); g.arc(0, 0, r + 4, 0, Math.PI * 2); g.fill();
  const ang = (v) => (-90 + DIAL.a0 + (v / max) * (DIAL.a1 - DIAL.a0)) * D2R;
  if (red) { g.strokeStyle = '#d0281c'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, r - 4, ang(red), ang(max)); g.stroke(); }
  g.strokeStyle = '#e9e7e0'; g.fillStyle = '#e9e7e0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 13px sans-serif';
  for (let v = 0; v <= max + 1e-6; v += step / 2) { const a = ang(v), major = Math.abs(v / step - Math.round(v / step)) < 1e-6; g.lineWidth = major ? 2.4 : 1.2; const r0 = major ? r - 11 : r - 6;
    g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke();
    if (major) g.fillText(label(v), Math.cos(a) * (r - 21), Math.sin(a) * (r - 21)); }
  g.font = '8px sans-serif'; g.fillStyle = '#a9a7a0'; g.fillText(unit, 0, 40); g.restore(); // below the 0 / max labels (they sit at ±23, +23)
}
// bottom-right quarter of the 512×256 dash atlas: tacho (256–384) and speedo (384–512), 128 px each
export function drawCarGauges(g) {
  g.fillStyle = '#050506'; g.fillRect(256, 128, 256, 128);
  gauge(g, 320, 192, 54, 8, 1, (v) => String(v), 6.5, '×1000 r/min');
  gauge(g, 448, 192, 54, 220, 40, (v) => String(v), 0, 'km/h');
}
export const CAR_UV = { rpm: [0.5, 0, 0.75, 0.5], speed: [0.75, 0, 1, 0.5] };
// bike TFT (top-right quarter) — kmh, gear label, rev 0..1
export function drawTFT(g, kmh, gear, rev) {
  const X = 256; const grd = g.createLinearGradient(X + 16, 0, X + 240, 0); grd.addColorStop(0, '#e8f4ff'); grd.addColorStop(0.7, '#ffb000'); grd.addColorStop(1, '#ff2010');
  g.fillStyle = '#0b0d12'; g.fillRect(X + 6, 6, 244, 116); g.fillStyle = grd; const lit = Math.round(rev * 26);
  for (let i = 0; i < 26; i++) { const h = 6 + i * 1.3; g.globalAlpha = i < lit ? 1 : 0.22; g.fillRect(X + 16 + i * 8.6, 44 - h, 6, h); } g.globalAlpha = 1;
  g.fillStyle = '#f2f2f2'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(gear, X + 52, 86); g.font = 'bold 40px sans-serif'; g.fillText(String(kmh), X + 150, 82);
  g.font = '12px sans-serif'; g.fillText('km/h', X + 150, 108); g.fillStyle = '#ff3030'; g.font = 'bold 13px sans-serif'; g.fillText('RACE', X + 220, 64); g.fillStyle = '#9ad'; g.font = '11px sans-serif'; g.fillText('LAP 0:00.0', X + 214, 100);
  g.fillStyle = '#2a8'; g.fillRect(X + 196, 112, 44, 4);
}
// indicator tell-tales on the analogue bike face (left half): unlit = dark green outline, lit = bright
export function drawTellTales(g, left, right) {
  for (const [on, x0, x1] of [[left, 26, 42], [right, 230, 214]]) { g.fillStyle = '#050506'; g.fillRect(Math.min(x0, x1) - 2, 28, 20, 24); g.fillStyle = on ? '#3cff6a' : '#0f2a16';
    g.beginPath(); g.moveTo(x0, 40); g.lineTo(x1, 30); g.lineTo(x1, 50); g.fill(); }
}
// --- engine speed model (gauges only; the engine voice in Audio.js uses the same 9 m/s gear bands) ----------------------------
const GEAR_V = 9; // m/s per gear band
export function engineRpm(v, sp) {
  if ((v.engineK ?? 1) < 0.15 || v.wrecked) return 0;
  const thr = Math.max(0, v.throttle || 0);
  if (sp < 0.6) return 850 + thr * 2600 + (v.rev ? Math.min(1, v.rev) * 4800 : 0); // idle / revving in neutral
  const top = Math.max(1, Math.round((v.T.maxSpeed || 38) / GEAR_V)), gear = Math.min(top - 1, Math.floor(sp / GEAR_V));
  const f = gear >= top - 1 ? sp / GEAR_V - gear : (sp % GEAR_V) / GEAR_V; // top gear keeps pulling
  return Math.min(7600, 1500 + f * 3900 + thr * 500 + (gear === 0 ? 300 : 0));
}
export const gearLabel = (v, sp) => (sp < 0.6 ? 'N' : String(1 + Math.min(5, Math.floor(sp / GEAR_V))));

// --- live instruments for the player's vehicle -----------------------------------------------------------------------------
let NG = null, NM = null;
function needleRes() {
  if (!NG) { NG = new THREE.BoxGeometry(1, 1, 1); NG.translate(0, 0.5, 0); // pivot at the base, length along +y (scaled per dial)
    NM = new THREE.MeshStandardMaterial({ color: 0xff4a1a, emissive: 0xff3a10, emissiveIntensity: 0.9, roughness: 0.4 }); }
  return [NG, NM];
}
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export class Instruments {
  constructor() { this.v = null; this.n = []; this.val = []; this.tft = null; this.tftT = 0; this.shown = ''; this.stats = { attach: 0, uploads: 0 }; }
  update(dt, v) {
    if (v !== this.v) { this.detach(); if (v && v.mesh && !v.disposed) this.attach(v); }
    if (!this.v) return;
    const sp = Math.abs(this.v.speed), kmh = sp * 3.6, rpm = engineRpm(this.v, sp);
    for (let i = 0; i < this.n.length; i++) { const N = this.n[i], d = N.userData.dial; const tgt = Math.min(1, (d.kind === 'rpm' ? rpm : kmh) / d.max);
      this.val[i] = damp(this.val[i], tgt, tgt < this.val[i] - 0.15 ? 14 : 7, dt); // needle inertia; a gear-change drop snaps faster
      N.rotation.z = -(DIAL.a0 + this.val[i] * (DIAL.a1 - DIAL.a0)) * D2R; }
    if (this.tft) { this.tftT -= dt; if (this.tftT <= 0) { this.tftT = 0.1; const T = this.tft; const blink = Math.floor(performance.now() / 380) % 2 === 0; const ind = this.v.ind || 0;
      const key = `${Math.round(kmh)}|${gearLabel(this.v, sp)}|${Math.round(rpm / 7600 * 26)}|${ind < 0 && blink}|${ind > 0 && blink}`;
      if (key !== this.shown) { this.shown = key; drawTFT(T.g, Math.round(kmh), gearLabel(this.v, sp), rpm / 7600); drawTellTales(T.g, ind < 0 && blink, ind > 0 && blink); T.tex.needsUpdate = true; this.stats.uploads++; } } }
  }
  attach(v) {
    const ud = v.mesh.userData, dials = ud.dials; this.v = v; this.stats.attach++; if (!dials || !dials.length) return;
    const [G, M] = needleRes();
    for (const d of dials) {
      if (d.kind === 'tft') continue;
      _y.fromArray(d.up).normalize(); _z.fromArray(d.n).normalize(); _x.crossVectors(_y, _z).normalize(); // x = screen-right as the driver sees it
      const piv = new THREE.Group(); piv.name = 'dialPivot'; _m.makeBasis(_x, _y, _z); piv.quaternion.setFromRotationMatrix(_m);
      piv.position.set(d.c[0] + _z.x * 0.003, d.c[1] + _z.y * 0.003, d.c[2] + _z.z * 0.003);
      const n = new THREE.Mesh(G, M); n.scale.set(d.len * 0.09, d.len, 0.0015); n.castShadow = n.receiveShadow = false; n.userData.dial = d; n.name = 'dialNeedle';
      const hub = new THREE.Mesh(G, M); hub.scale.set(0.006, 0.006, 0.002); hub.position.y = -0.003; piv.add(n, hub); v.mesh.add(piv); this.n.push(n); this.val.push(0);
    }
    if (dials.some((d) => d.kind === 'tft' || d.tell)) { // own copy of the dash atlas while ridden
      const dm = []; v.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.dashAtlas) dm.push(o); });
      if (dm.length) { const src = dm[0].material; const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'); g.drawImage(src.map.image, 0, 0);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; const mat = src.clone(); mat.map = tex; mat.emissiveMap = tex; mat.userData = { dashLive: true };
        for (const o of dm) o.material = mat; this.tft = { g, tex, mat, src, meshes: dm }; this.tftT = 0; this.shown = ''; }
    }
  }
  detach() {
    for (const n of this.n) { const p = n.parent; if (p) p.removeFromParent(); } this.n.length = 0; this.val.length = 0;
    if (this.tft) { for (const o of this.tft.meshes) o.material = this.tft.src; this.tft.tex.dispose(); this.tft.mat.dispose(); this.tft = null; }
    this.v = null;
  }
}
