// The three protagonists' own rooms — Dineth (Slave Island), Shashika (Maradana, near Lanka Auto Care) and David (Pettah,
// near his repair stall). Entered through a door like the other interiors (Interiors.enter → fade); each door only opens
// for its owner. Everything inside is modelled (RoomProps) and lit; working devices:
//   TV      five original channels drawn live on the screen (news with headlines from the game world, cricket, a
//           teledrama, a music show, the weather), sound from the set, the screen lights the room
//   radio   the game's own stations (Radio Lanka Breeze 98.4 / Island Pulse 104.2) through a small speaker
//   vodka   pour a shot and drink it (full arm-IK animation), each shot makes you drunker (Drunk.js)
//   bed     sleep; the light switch by the door; clocks show the game time
import * as THREE from 'three';
import { Kit, aoBlob, plasterTex, floorTex, fabricTex, canvasTex, woodTex, rnd } from './RoomKit.js';
import * as RP from './RoomProps.js';
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { solveArmIK } from '../actors/Character.js';
import * as L from './Layout.js';

const Y = -40;
const RADIO = [null, { mode: 'radio1', name: 'Radio Lanka Breeze 98.4', f: 0.32 }, { mode: 'radio2', name: 'Island Pulse 104.2', f: 0.78 }];
export const HERO_ROOMS = {
  room: { owner: 'dineth', name: "Dineth's room", area: 'Slave Island', W: 4.2, D: 5.0, H: 3.0, doorX: 1.3 },
  room_shashika: { owner: 'shashika', name: "Shashika's room", area: 'Maradana', W: 4.6, D: 5.2, H: 3.0, doorX: -1.4, near: () => L.PLACES.garage, off: [-26, 18] },
  room_david: { owner: 'david', name: "David's room", area: 'Pettah', W: 4.8, D: 5.4, H: 3.05, doorX: 1.5, near: () => ({ x: -70, z: -900 }), off: [22, -30] },
};
export const isHeroRoom = (id) => !!HERO_ROOMS[id];

// ---------------------------------------------------------------------------------------------- door spots
// on walkable pavement next to a real building wall near each man's workplace; the door faces that wall
export function heroDoorSpots(game) {
  if (game._heroDoors) return game._heroDoors; const col = game.collision; const out = [];
  const ok = (x, z) => !col.blocked(x, z, 0.5) && !L.roadAt(x, z) && !L.isWater(x, z);
  for (const id of ['room_shashika', 'room_david']) {
    const R = HERO_ROOMS[id]; const n = R.near(); const sx = n.x + R.off[0], sz = n.z + R.off[1]; let best = null;
    for (let r = 0; r < 60 && !best; r += 1.5) for (let a = 0; a < 16 && !best; a++) { const x = sx + Math.cos(a * 0.3927) * r, z = sz + Math.sin(a * 0.3927) * r; if (!ok(x, z)) continue;
      for (let k = 0; k < 8; k++) { const yaw = k * Math.PI / 4; const f = col.raycast(x, 1.0, z, x + Math.sin(yaw) * 1.6, 1.0, z + Math.cos(yaw) * 1.6, 0.1); if (f < 1 && f > 0.25) { const near = (game.interiors?.doors || []).some((d) => Math.hypot(d.x - x, d.z - z) < 6); if (!near) { best = { x, z, faceIn: yaw }; break; } } } }
    if (!best) best = { x: sx, z: sz, faceIn: 0 };
    out.push({ id, owner: R.owner, x: best.x, z: best.z, rot: 0, faceIn: best.faceIn });
  }
  return (game._heroDoors = out);
}

// ---------------------------------------------------------------------------------------------- TV
const CHANNELS = [
  { id: 'news', name: 'Island 1 · News at Nine', light: [0.45, 0.55, 1.0] },
  { id: 'cricket', name: 'Island 2 · Sports Live', light: [0.45, 0.9, 0.45] },
  { id: 'drama', name: 'Island 3 · Teledrama', light: [1.0, 0.72, 0.45] },
  { id: 'music', name: 'Island 4 · Music Hour', light: [0.9, 0.4, 1.0] },
  { id: 'weather', name: 'Island 5 · Weather', light: [0.5, 0.8, 1.0] },
];
const ISLAND = [[38, 2], [46, 6], [44, 14], [52, 22], [62, 34], [70, 46], [80, 60], [88, 76], [91, 92], [86, 110], [76, 126], [62, 140], [48, 147], [34, 142], [24, 132], [17, 116], [14, 100], [13, 84], [12, 66], [8, 52], [4, 38], [12, 30], [22, 22], [30, 12]]; // rough outline of Sri Lanka (original sketch)
class TV {
  constructor(room, screenMesh, led, light, crt) {
    this.room = room; this.on = false; this.ch = 0; this.t = 0; this.drawT = 0; this.osd = 0; this.staticT = 0; this.crt = crt; this.audioT = 0; this.score = { r: 187, w: 4, b: 195 }; this.cyc = -1; this.four = false;
    this.cv = document.createElement('canvas'); this.cv.width = 320; this.cv.height = 240; this.a = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = screenMesh; this.offMat = screenMesh.material; this.onMat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, color: 0xd8d8d8 }); this.led = led; this.light = light;
    this.static = new Uint8ClampedArray(80 * 60 * 4); this.simg = new ImageData(80, 60); this.scv = document.createElement('canvas'); this.scv.width = 80; this.scv.height = 60;
  }
  power(v = !this.on) { this.on = v; this.mesh.material = v ? this.onMat : this.offMat; this.led.material.emissive.setHex(v ? 0x10ff30 : 0xff1a10); this.staticT = v ? 0.45 : 0; this.osd = v ? 2.2 : 0; if (v) this.draw(); if (Audio.ready) Audio.tone(v ? 15600 : 300, v ? 0.4 : 0.15, { type: 'sine', vol: v ? 0.004 : 0.03 }); this.room.syncMusic(); }
  next() { this.ch = (this.ch + 1) % CHANNELS.length; this.staticT = 0.35; this.osd = 2.2; this.room.syncMusic(); if (Audio.ready) Audio.noise(0.3, { f: 3000, q: 0.3, vol: 0.03 }); }
  headlines() {
    const g = this.room.game; const list = []; const ex = g.explosions?.stats; const A = g.atmos;
    if (ex && ex.blasts) list.push(`Explosion in Colombo: police investigating ${ex.blasts > 1 ? ex.blasts + ' blasts' : 'a blast'} today`);
    if ((g.police?.wanted || g.wanted || 0) > 0) list.push('Police hunt suspect after city chase');
    if (A && A.rain > 0.2) list.push('Heavy monsoon showers: motorists urged to drive carefully');
    list.push('Lotus Tower draws record weekend crowds', 'Port City reclamation works continue on schedule', 'Fuel prices unchanged for the month', 'Three-wheeler fares: meters to be inspected', 'Tea exports rise for third straight quarter', 'Fishing fleet warned of rough seas off the west coast', 'New bus lanes to ease Galle Road traffic');
    return list;
  }
  update(dt, P) {
    if (!this.on) { this.light.intensity = 0; return; }
    this.t += dt; this.osd = Math.max(0, this.osd - dt); this.staticT = Math.max(0, this.staticT - dt); this.drawT -= dt;
    if (this.drawT <= 0) { this.drawT = 1 / 15; this.draw(); }
    const c = CHANNELS[this.ch].light; const fl = this.staticT > 0 ? 0.9 + Math.random() * 0.3 : 0.75 + Math.sin(this.t * 7.3) * 0.08 + Math.sin(this.t * 2.1) * 0.12 + (CHANNELS[this.ch].id === 'music' ? Math.max(0, Math.sin(this.t * 8)) * 0.4 : 0);
    this.light.color.setRGB(c[0], c[1], c[2]); this.light.intensity = 2.6 * fl * (this.room.lightsOn ? 0.6 : 1.4);
    this.sound(dt, P);
  }
  sound(dt, P) {
    if (!Audio.ready || this.staticT > 0) return; this.audioT -= dt; if (this.audioT > 0) return; const wp = this.mesh.getWorldPosition(new THREE.Vector3()); const d = Math.hypot(wp.x - P.x, wp.z - P.z); const v = Math.max(0.15, 1 - d / 6) * (this.room.radio?.st ? 0.45 : 1);
    const id = CHANNELS[this.ch].id; const r = Math.random(); const talk = (vol = 0.016) => { this.audioT = 0.08 + r * 0.14; if ((this.t % 5) > 4.3) { this.audioT = 0.5; return; } Audio.noise(0.07 + r * 0.1, { f: 280 + r * 520, q: 5, vol: vol * v }); if (r > 0.6) Audio.noise(0.05, { f: 1800 + r * 900, q: 3, vol: vol * 0.25 * v, when: 0.04 }); };
    if (id === 'news') talk(0.018);
    else if (id === 'cricket') { this.audioT = 0.3; Audio.noise(0.6, { f: 650, q: 0.35, vol: 0.006 * v }); if (this.four && this.cheer !== this.cyc) { this.cheer = this.cyc; Audio.noise(1.8, { f: 1100, q: 0.5, vol: 0.03 * v }); } if (this.hitAt === this.cyc && !this.hitDone) { this.hitDone = true; Audio.tone(820, 0.035, { type: 'triangle', vol: 0.06 * v }); Audio.noise(0.04, { f: 2500, q: 2, vol: 0.04 * v }); } if (r > 0.75) { Audio.noise(0.1, { f: 380 + r * 300, q: 5, vol: 0.012 * v }); } }
    else if (id === 'drama') { if (r > 0.82) { const n = [262, 294, 330, 392, 440][Math.floor(Math.random() * 5)]; Audio.tone(n, 0.9, { type: 'sine', vol: 0.012 * v }); } talk(0.014); }
    else if (id === 'weather') { if (r > 0.9) Audio.tone([220, 277, 330][Math.floor(Math.random() * 3)], 1.4, { type: 'sine', vol: 0.008 * v }); talk(0.016); }
    else this.audioT = 1; // music: the room's music channel plays (syncMusic)
  }
  draw() {
    const a = this.a, w = 320, h = 240; const t = this.t; const g = this.room.game; const A = g.atmos;
    if (this.staticT > 0) { const d = this.simg.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } this.scv.getContext('2d').putImageData(this.simg, 0, 0); a.imageSmoothingEnabled = false; a.drawImage(this.scv, 0, 0, w, h); a.imageSmoothingEnabled = true; this.tex.needsUpdate = true; return; }
    const id = CHANNELS[this.ch].id; const clock = A ? A.timeString : '';
    if (id === 'news') {
      const bg = a.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#0b1d4a'); bg.addColorStop(1, '#1f4f9a'); a.fillStyle = bg; a.fillRect(0, 0, w, h);
      a.strokeStyle = 'rgba(120,170,255,0.18)'; for (let i = 0; i < 12; i++) { a.beginPath(); a.moveTo(i * 30 + (t * 4) % 30, 0); a.lineTo(i * 30 + (t * 4) % 30 - 40, h); a.stroke(); }
      a.fillStyle = 'rgba(90,150,255,0.25)'; a.beginPath(); a.arc(250, 70, 48, 0, 7); a.fill(); a.strokeStyle = 'rgba(170,210,255,0.45)'; a.beginPath(); a.ellipse(250, 70, 48, 18, 0, 0, 7); a.stroke(); a.beginPath(); a.ellipse(250, 70, 20, 48, 0, 0, 7); a.stroke();
      const hx = 110 + Math.sin(t * 0.7) * 2, hy = 92 + Math.sin(t * 1.3) * 1; // the anchor
      a.fillStyle = '#1c2230'; a.beginPath(); a.ellipse(110, 190, 62, 60, 0, Math.PI, 0); a.fill(); a.fillStyle = '#f4f2ec'; a.beginPath(); a.moveTo(96, 132); a.lineTo(110, 168); a.lineTo(124, 132); a.fill(); a.fillStyle = '#8a1c24'; a.beginPath(); a.moveTo(106, 136); a.lineTo(114, 136); a.lineTo(112, 168); a.lineTo(108, 168); a.fill();
      a.fillStyle = '#8a5a3c'; a.fillRect(102, 112, 16, 22); a.beginPath(); a.ellipse(hx, hy, 19, 24, 0, 0, 7); a.fill(); a.fillStyle = '#16110e'; a.beginPath(); a.ellipse(hx, hy - 12, 20, 14, 0, Math.PI, 0); a.fill();
      a.fillStyle = '#16110e'; a.fillRect(hx - 10, hy - 3, 5, 2.5); a.fillRect(hx + 5, hy - 3, 5, 2.5); const mo = (Math.sin(t * 11) > 0.2 && (t % 5) < 4.3) ? 3.5 : 1; a.fillStyle = '#4a2a20'; a.beginPath(); a.ellipse(hx, hy + 12, 6, mo, 0, 0, 7); a.fill();
      a.fillStyle = '#d7dde8'; a.fillRect(0, 168, 220, 14); a.fillStyle = '#2d3a55'; a.fillRect(0, 182, 220, 14); // desk
      const hl = this.headlines(); const k = Math.floor(t / 7) % hl.length;
      a.fillStyle = '#c4161c'; a.fillRect(0, 196, w, 22); a.fillStyle = '#fff'; a.font = 'bold 12px sans-serif'; a.textAlign = 'left'; a.fillText(hl[k], 8, 211);
      a.fillStyle = '#05070c'; a.fillRect(0, 218, w, 22); a.fillStyle = '#f2c230'; a.font = '11px sans-serif'; const tick = hl.join('   •   '); const tw = a.measureText(tick).width; const off = (t * 40) % (tw + w); a.fillText(tick, w - off, 233);
      a.fillStyle = 'rgba(0,0,0,0.5)'; a.fillRect(6, 6, 108, 20); a.fillStyle = '#fff'; a.font = 'bold 12px sans-serif'; a.fillText('ISLAND 1 NEWS', 12, 21); a.textAlign = 'right'; a.fillText(clock, w - 8, 21);
    } else if (id === 'cricket') {
      const cyc = Math.floor(t / 7), ct = t % 7; if (cyc !== this.cyc) { this.cyc = cyc; const rr = rnd(cyc * 31 + 7)(); this.four = rr > 0.62; this.hitDone = false; this.hitAt = cyc; this.score.b++; if (this.four) this.score.r += 4; else if (rr > 0.3) this.score.r += 1; if (rr < 0.04) this.score.w = Math.min(9, this.score.w + 1); }
      const sky = a.createLinearGradient(0, 0, 0, 60); sky.addColorStop(0, '#7fb3e6'); sky.addColorStop(1, '#cfe3f2'); a.fillStyle = sky; a.fillRect(0, 0, w, 60);
      a.fillStyle = '#5d6b78'; a.fillRect(0, 44, w, 18); for (let i = 0; i < 80; i++) { a.fillStyle = ['#e33', '#fff', '#36c', '#fc3', '#2a2'][i % 5]; a.fillRect((i * 37) % w, 46 + (i * 13) % 12, 2, 2); } // stands with the crowd
      const gr = a.createLinearGradient(0, 60, 0, h); gr.addColorStop(0, '#3f8a3a'); gr.addColorStop(1, '#2d6e2b'); a.fillStyle = gr; a.fillRect(0, 60, w, h - 60); for (let i = 0; i < 8; i++) { a.fillStyle = i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'; a.fillRect(0, 60 + i * 22, w, 22); }
      a.fillStyle = '#c9b07a'; a.beginPath(); a.moveTo(146, 78); a.lineTo(174, 78); a.lineTo(204, 230); a.lineTo(116, 230); a.fill(); a.strokeStyle = '#fff'; a.lineWidth = 1.5; a.beginPath(); a.moveTo(140, 88); a.lineTo(180, 88); a.moveTo(124, 205); a.lineTo(196, 205); a.stroke();
      a.fillStyle = '#f2e6c0'; for (const x of [156, 160, 164]) a.fillRect(x, 70, 1.5, 12); for (const x of [150, 160, 170]) a.fillRect(x, 200, 2.5, 22);
      const bx = 162, swing = ct > 3.25 && ct < 3.6; a.fillStyle = '#f5f5f0'; a.fillRect(bx - 3, 66, 6, 14); a.fillStyle = '#1f3f8a'; a.beginPath(); a.arc(bx, 64, 3, 0, 7); a.fill(); a.strokeStyle = '#d9c08a'; a.lineWidth = 2; a.beginPath(); a.moveTo(bx + 2, 74); a.lineTo(bx + (swing ? 12 : 5), swing ? 70 : 82); a.stroke(); // batsman
      const run = Math.min(1, ct / 2.6); const by = 250 - run * 50; a.fillStyle = '#f5f5f0'; a.fillRect(150 + Math.sin(ct * 14) * 1.5, by - 26, 10, 26); a.fillStyle = '#3a2a1e'; a.beginPath(); a.arc(155, by - 30, 5, 0, 7); a.fill(); // bowler
      if (ct > 2.6 && ct < 3.4) { const k = (ct - 2.6) / 0.8; const x = 158 + k * 4, y = 196 - k * 120 + (k > 0.6 ? 0 : Math.sin(k / 0.6 * Math.PI) * -20); a.fillStyle = '#b11'; a.beginPath(); a.arc(x, y, 2.4 - k, 0, 7); a.fill(); }
      if (ct > 3.4 && ct < 5 && this.four) { const k = (ct - 3.4) / 1.6; a.fillStyle = '#b11'; a.beginPath(); a.arc(162 + k * 150, 76 - k * 10, 1.4, 0, 7); a.fill(); }
      if (this.four && ct > 4.2 && ct < 6.6) { a.fillStyle = 'rgba(196,22,28,0.92)'; a.fillRect(90, 100, 140, 40); a.fillStyle = '#fff'; a.font = 'bold 30px sans-serif'; a.textAlign = 'center'; a.fillText('FOUR!', 160, 131); }
      const S = this.score; const ov = `${Math.floor(S.b / 6)}.${S.b % 6}`; a.fillStyle = 'rgba(8,20,48,0.92)'; a.fillRect(0, 214, w, 26); a.fillStyle = '#f2c230'; a.fillRect(0, 214, 70, 26); a.fillStyle = '#081430'; a.font = 'bold 12px sans-serif'; a.textAlign = 'left'; a.fillText('SRI LANKA', 6, 231); a.fillStyle = '#fff'; a.fillText(`${S.r}/${S.w}   ${ov} ov   Target 268   v VISITORS XI`, 78, 231);
      a.fillStyle = 'rgba(0,0,0,0.45)'; a.fillRect(w - 66, 6, 60, 18); a.fillStyle = '#fff'; a.font = 'bold 11px sans-serif'; a.textAlign = 'right'; a.fillText('LIVE', w - 12, 19); a.fillStyle = '#e22'; a.beginPath(); a.arc(w - 56, 15, 4, 0, 7); a.fill();
    } else if (id === 'drama') {
      a.fillStyle = '#7a5a3c'; a.fillRect(0, 0, w, h); a.fillStyle = '#c99a6a'; a.fillRect(0, 0, w, 150); a.fillStyle = '#e9c98f'; a.fillRect(210, 20, 80, 70); a.strokeStyle = '#5a3a22'; a.lineWidth = 4; a.strokeRect(210, 20, 80, 70); a.beginPath(); a.moveTo(250, 20); a.lineTo(250, 90); a.stroke(); // window, evening light
      const gl = a.createRadialGradient(250, 55, 5, 250, 55, 150); gl.addColorStop(0, 'rgba(255,210,140,0.35)'); gl.addColorStop(1, 'rgba(255,210,140,0)'); a.fillStyle = gl; a.fillRect(0, 0, w, h);
      a.fillStyle = '#6b2a2a'; a.fillRect(40, 130, 200, 50); a.fillRect(40, 110, 200, 24); // sofa
      const fig = (x, col, hair, bob, talkOn) => { a.fillStyle = col; a.beginPath(); a.ellipse(x, 150 + bob, 24, 34, 0, 0, 7); a.fill(); a.fillStyle = '#8a5a3c'; a.beginPath(); a.ellipse(x, 104 + bob, 13, 16, 0, 0, 7); a.fill(); a.fillStyle = '#120d0a'; a.beginPath(); a.ellipse(x, 96 + bob, 14, hair, 0, Math.PI, 0); a.fill(); a.fillStyle = '#3a1f18'; a.fillRect(x - 3, 111 + bob, 6, talkOn ? 3 : 1.2); };
      const line = Math.floor(t / 4) % 6; fig(105, '#e6d6b8', 10, Math.sin(t * 1.1) * 1.5, line % 2 === 0 && Math.sin(t * 12) > 0); fig(180, '#b0233a', 16, Math.sin(t * 0.9 + 1) * 1.5, line % 2 === 1 && Math.sin(t * 12) > 0);
      const subs = ['Amma phoned. She is coming on Poya day.', 'Then we must clean the whole house before she arrives.', 'And what about your brother? Is he coming too?', 'He says the bus from Kandy is always late.', 'Always some excuse with that one.', 'Let him come. It has been two years.'];
      a.fillStyle = 'rgba(0,0,0,0.55)'; a.fillRect(0, 204, w, 26); a.fillStyle = '#fff'; a.font = '12px sans-serif'; a.textAlign = 'center'; a.fillText(subs[line], w / 2, 221);
      a.fillStyle = 'rgba(255,255,255,0.75)'; a.font = 'italic 11px Georgia, serif'; a.textAlign = 'left'; a.fillText('Evening Rain · Ep. 112', 8, 18);
    } else if (id === 'music') {
      a.fillStyle = '#07040f'; a.fillRect(0, 0, w, h);
      for (let i = 0; i < 6; i++) { const an = Math.sin(t * (0.6 + i * 0.13) + i) * 0.6; const col = ['rgba(255,60,200,', 'rgba(60,160,255,', 'rgba(255,200,60,'][i % 3]; a.fillStyle = col + '0.18)'; a.beginPath(); a.moveTo(40 + i * 48, 0); a.lineTo(40 + i * 48 + Math.sin(an) * 260 - 30, h); a.lineTo(40 + i * 48 + Math.sin(an) * 260 + 30, h); a.fill(); }
      a.fillStyle = '#1a1424'; a.fillRect(0, 150, w, 30); for (const [x, s] of [[90, 1], [160, 1.2], [230, 1]]) { const b = Math.abs(Math.sin(t * 4 + x)) * 3; a.fillStyle = '#000'; a.beginPath(); a.ellipse(x, 125 - b, 12 * s, 26 * s, 0, 0, 7); a.fill(); a.beginPath(); a.arc(x, 92 - b - 4 * s, 9 * s, 0, 7); a.fill(); }
      for (let i = 0; i < 24; i++) { const v = Math.abs(Math.sin(t * 6 + i * 0.7) * Math.sin(t * 2.3 + i)) * 40; a.fillStyle = `hsl(${(i * 15 + t * 40) % 360},90%,60%)`; a.fillRect(16 + i * 12, 150 - v, 8, v); }
      a.fillStyle = '#000'; for (let i = 0; i < 26; i++) { a.beginPath(); a.arc(i * 13, 200 + Math.abs(Math.sin(t * 5 + i)) * -5, 9, 0, 7); a.fill(); a.fillRect(i * 13 - 8, 200, 16, 40); }
      a.fillStyle = '#fff'; a.font = 'bold 13px sans-serif'; a.textAlign = 'left'; a.fillText('MUSIC HOUR', 10, 20); a.font = '11px sans-serif'; a.fillText('Now playing: "Monsoon Heart" · The Harbour Lights', 10, 232);
    } else { // weather
      const bg = a.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#0f3a6a'); bg.addColorStop(1, '#1f6aa0'); a.fillStyle = bg; a.fillRect(0, 0, w, h);
      a.save(); a.translate(120, 30); a.scale(1.2, 1.2); a.fillStyle = '#4f9a4a'; a.strokeStyle = '#d8f0d0'; a.lineWidth = 1.2; a.beginPath(); ISLAND.forEach(([x, y], i) => (i ? a.lineTo(x, y) : a.moveTo(x, y))); a.closePath(); a.fill(); a.stroke(); a.restore();
      const rain = A ? A.rain > 0.2 : false; const icon = (x, y, kind, temp, name) => { if (kind === 'sun') { a.fillStyle = '#ffd23a'; a.beginPath(); a.arc(x, y, 8, 0, 7); a.fill(); } else { a.fillStyle = '#e8eef4'; a.beginPath(); a.arc(x - 5, y, 7, 0, 7); a.arc(x + 4, y - 3, 8, 0, 7); a.arc(x + 10, y + 1, 6, 0, 7); a.fill(); if (kind === 'rain') { a.strokeStyle = '#7fc8ff'; a.lineWidth = 1.5; for (let i = 0; i < 3; i++) { const o = (t * 30 + i * 5) % 10; a.beginPath(); a.moveTo(x - 4 + i * 5, y + 8 + o); a.lineTo(x - 6 + i * 5, y + 12 + o); a.stroke(); } } } a.fillStyle = '#fff'; a.font = 'bold 11px sans-serif'; a.textAlign = 'left'; a.fillText(`${name} ${temp}°`, x + 14, y + 4); };
      icon(132, 150, rain ? 'rain' : 'cloud', rain ? 27 : 31, 'Colombo'); icon(175, 140, 'cloud', 24, 'Kandy'); icon(170, 40, 'sun', 32, 'Jaffna'); icon(150, 196, rain ? 'rain' : 'sun', 30, 'Galle'); icon(205, 95, 'sun', 32, 'Trinco');
      a.fillStyle = 'rgba(0,0,0,0.4)'; a.fillRect(0, 214, w, 26); a.fillStyle = '#fff'; a.font = 'bold 12px sans-serif'; a.textAlign = 'left'; a.fillText(rain ? 'Showers over the west and south-west this evening' : 'Mostly fair; isolated showers after 2 pm', 8, 231);
      a.font = 'bold 13px sans-serif'; a.fillText('ISLAND WEATHER', 8, 20); a.textAlign = 'right'; a.fillText(clock, w - 8, 20);
    }
    if (this.osd > 0) { a.fillStyle = '#3cff5a'; a.font = 'bold 20px monospace'; a.textAlign = 'right'; a.fillText(`CH ${this.ch + 1}`, w - 10, 50); }
    if (this.crt) { a.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < h; y += 2) a.fillRect(0, y, w, 1); const vg = a.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); a.fillStyle = vg; a.fillRect(0, 0, w, h); }
    this.tex.needsUpdate = true;
  }
}
// ---------------------------------------------------------------------------------------------- radio
class Radio {
  constructor(room, { dial, needle, glow, needleRange }) { this.room = room; this.st = 0; this.dial = dial; this.needle = needle; this.glow = glow; this.range = needleRange; this.target = 0.5; this.pos = 0.5; }
  next() { this.st = (this.st + 1) % RADIO.length; if (Audio.ready) { Audio.noise(0.45, { f: 2600, q: 0.4, vol: 0.035, sweep: 0.5 }); Audio.tone(this.st ? 900 : 200, 0.05, { type: 'square', vol: 0.02 }); } this.room.syncMusic(); this.room.game.hud.notify('Radio', RADIO[this.st] ? RADIO[this.st].name : 'Off', 'info', 1.6); }
  off() { if (this.st) { this.st = 0; this.room.syncMusic(); } }
  update(dt) { this.target = RADIO[this.st] ? RADIO[this.st].f : this.target; this.pos += (this.target - this.pos) * (1 - Math.exp(-dt * 4)); if (this.needle) { const [a, b] = this.range; this.needle.position.x = a + (b - a) * this.pos; } if (this.glow) this.glow.emissiveIntensity += ((this.st ? 1.3 : 0) - this.glow.emissiveIntensity) * (1 - Math.exp(-dt * 6)); }
}

// ---------------------------------------------------------------------------------------------- drinking
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const Q_BASE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); // hand: thumb up, fingers forward (chest space)
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const Q_WIPE = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, 1), V(-1, 0, 0), V(0, -1, 0)));
export const DRINK_T = { reach: 0.8, lift: 1.35, pourEnd: 2.95, bottleDown: 3.75, raise: 4.45, drinkEnd: 5.15, lower: 5.65, glassDown: 6.45, wipe: 7.15, end: 7.7 };
class Drink {
  constructor(room, bottle, glass, spot) { this.room = room; this.bottle = bottle; this.glass = glass; this.spot = spot; this.active = false; this.shots = 14; this.stream = null; this.qYaw = new THREE.Quaternion(); this.qYawI = new THREE.Quaternion(); this.root = new THREE.Vector3(); }
  get fill() { return this.shots / 14; }
  start(P) {
    const g = this.room.game; this.P = P; this.ch = P.ch; this.t = -0.45; this.active = true; this.drank = false; this.poured = 0; this.grabbed = this.bDown = this.gDown = false; P.control = false; P.indoorBusy = true; if (g.weapons?.drawn) g.weapons.holster();
    this.from = { x: P.x, z: P.z, yaw: P.yaw }; this.homeB = { p: this.bottle.position.clone(), q: this.bottle.quaternion.clone() }; this.homeG = { p: this.glass.position.clone(), q: this.glass.quaternion.clone() };
    if (!this.stream) { this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0042, 1, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0xeef8fa, transparent: true, opacity: 0.55, roughness: 0.02, depthWrite: false })); this.stream.visible = false; this.room.g.add(this.stream); }
    this.ch.anim.postPose = (b, dt, seated) => this.pose(b, dt, seated);
  }
  // body frame: player's feet, rotated by his yaw (forward +z, left +x — same handedness as the chest frame)
  body(v) { return v.clone().applyQuaternion(this.qYaw).add(this.root); }
  unbody(w) { return w.clone().sub(this.root).applyQuaternion(this.qYawI); }
  place(obj, home, gripBody, qTilt, grip) { // object held: its grip point at gripBody, tilted by qTilt (body frame) from its resting orientation
    const wq = this.qYaw.clone().multiply(qTilt).multiply(this.qYawI); const origin = this.body(gripBody.clone().sub(V(0, grip, 0).applyQuaternion(qTilt)));
    obj.position.copy(origin).sub(this.room.g.position); obj.quaternion.copy(wq).multiply(home.q);
  }
  update(dt) {
    if (!this.active) return; const P = this.P; this.t += dt; const t = this.t; const T = DRINK_T;
    if (t < 0) { const k = sm((t + 0.45) / 0.45); P.x = this.from.x + (this.spot.x + this.room.g.position.x - this.from.x) * k; P.z = this.from.z + (this.spot.z + this.room.g.position.z - this.from.z) * k; let dy = this.spot.yaw - this.from.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); P.yaw = this.from.yaw + dy * k; P.sync?.(); return; }
    if (t >= T.reach && !this.grabbed) { this.grabbed = true; if (Audio.ready) Audio.noise(0.05, { f: 1800, q: 3, vol: 0.03 }); }
    if (t > T.lift && t < T.pourEnd) { const tip = sm(seg(t, T.lift, T.lift + 0.5)) * (1 - sm(seg(t, T.pourEnd - 0.35, T.pourEnd))); const flowing = tip > 0.7; this.stream.visible = flowing;
      if (flowing) { const k = dt / (T.pourEnd - T.lift - 0.85); this.poured = Math.min(1, this.poured + k); this.glass.userData.setFill(this.poured * 0.85); this.bottle.userData.setFill(Math.max(0, (this.shots - this.poured) / 14));
        this.bottle.updateMatrixWorld(); this.glass.updateMatrixWorld(); const m = this.bottle.userData.mouth.clone().applyMatrix4(this.bottle.matrixWorld), r = V(0, 0.02 + 0.03 * this.poured, 0).applyMatrix4(this.glass.matrixWorld); const d = r.clone().sub(m); const len = Math.max(0.01, d.length()); this.stream.position.copy(m).addScaledVector(d, 0.5).sub(this.room.g.position); this.stream.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); this.stream.scale.set(1, len, 1);
        this.pourSnd = (this.pourSnd || 0) - dt; if (this.pourSnd <= 0 && Audio.ready) { this.pourSnd = 0.07 + Math.random() * 0.05; Audio.noise(0.08, { f: 900 + this.poured * 900 + Math.random() * 300, q: 6, vol: 0.03 }); } } }
    else if (this.stream) this.stream.visible = false;
    if (t >= T.bottleDown - 0.05 && !this.bDown) { this.bDown = true; this.shots = Math.max(0, this.shots - 1); this.bottle.userData.setFill(this.fill); if (Audio.ready) Audio.tone(1500, 0.04, { type: 'triangle', vol: 0.03 }); }
    if (t > T.raise && t < T.drinkEnd) { const k = seg(t, T.raise + 0.1, T.drinkEnd - 0.1); this.glass.userData.setFill(0.85 * (1 - sm(k))); this.gulpT = (this.gulpT || 0) - dt; if (k > 0.1 && k < 0.95 && this.gulpT <= 0 && Audio.ready) { this.gulpT = 0.32; Audio.tone(120, 0.09, { type: 'sine', vol: 0.06 }); Audio.noise(0.06, { f: 500, q: 2, vol: 0.02, when: 0.03 }); } }
    if (t >= T.drinkEnd && !this.drank) { this.drank = true; const r = this.room.game.drunk?.drink(); this.ch.face?.set('wince', 1.8); if (Audio.ready) Audio.noise(0.55, { f: 1300, q: 0.7, vol: 0.035, when: 0.35 }); if (r === 'blackout') this.blackout = true; }
    if (t >= T.glassDown - 0.05 && !this.gDown) { this.gDown = true; this.glass.userData.setFill(0); if (Audio.ready) Audio.tone(1900, 0.035, { type: 'triangle', vol: 0.03 }); }
    if (t >= T.end) this.finish();
  }
  finish() {
    const P = this.P; this.active = false; if (this.ch.anim.postPose) this.ch.anim.postPose = null; P.control = true; P.indoorBusy = false; this.stream.visible = false;
    this.bottle.position.copy(this.homeB.p); this.bottle.quaternion.copy(this.homeB.q); this.glass.position.copy(this.homeG.p); this.glass.quaternion.copy(this.homeG.q); this.glass.userData.setFill(0); this.bottle.userData.setFill(this.fill);
    const d = this.room.game.drunk; if (d && !this.blackout) this.room.game.hud.notify(d.label, this.shots ? `${this.shots} shot${this.shots > 1 ? 's' : ''} left in the bottle.` : 'That was the last of the bottle.', 'info', 2.2); this.blackout = false;
  }
  abort() { if (this.active) { this.t = DRINK_T.end; this.finish(); } }
  pose(b, dt, seated) {
    if (seated || this.t < 0 || !this.active) return; const ch = this.ch, s = ch.anim.s || 1, rig = ch.rig, t = this.t, T = DRINK_T, P = this.P;
    this.qYaw.setFromAxisAngle(V(0, 1, 0), P.yaw); this.qYawI.copy(this.qYaw).invert(); this.root.set(P.x, P.y, P.z);
    const w = sm(seg(t, 0, 0.3)) * (1 - sm(seg(t, T.wipe + 0.05, T.end)));
    // torso: lean over the table to reach / set down; head tips back while drinking, then a shake
    const reachK = Math.max(1 - sm(seg(t, T.reach, T.lift)), sm(seg(t, T.pourEnd, T.pourEnd + 0.4)) * (1 - sm(seg(t, T.bottleDown, T.bottleDown + 0.4))), sm(seg(t, T.lower, T.lower + 0.4)) * (1 - sm(seg(t, T.glassDown, T.glassDown + 0.45))));
    const lean = 0.34 * reachK * w; b.spine.rotation.x += lean * 0.55; b.chest.rotation.x += lean * 0.45; b.neck.rotation.x += lean * 0.25;
    const tipK = sm(seg(t, T.raise - 0.15, T.raise + 0.3)) * (1 - sm(seg(t, T.drinkEnd, T.lower)));
    const back = (0.2 * tipK + 0.32 * sm(seg(t, T.raise + 0.2, T.drinkEnd - 0.15)) * (1 - sm(seg(t, T.drinkEnd, T.lower)))) * w; b.neck.rotation.x -= back * 0.6; b.head.rotation.x -= back * 0.7; b.chest.rotation.x -= back * 0.12;
    if (t > T.drinkEnd + 0.1 && t < T.lower + 0.55) { const k = seg(t, T.drinkEnd + 0.1, T.lower + 0.55); b.head.rotation.y += Math.sin(k * Math.PI * 4) * 0.13 * (1 - k); b.head.rotation.x += Math.sin(k * Math.PI) * 0.1; }
    b.chest.updateWorldMatrix(true, false); b.head.updateWorldMatrix(true, false);
    const cb = this.unbody(V(0, 0, 0).applyMatrix4(b.chest.matrixWorld)); const hw = V(0, 0, 0).applyMatrix4(b.head.matrixWorld); const mouth = this.unbody(hw).add(V(0, 0.035 * s, 0.105 * s));
    const par = this.room.g.position; const gripB = 0.11, gripG = 0.032;
    const homeB = this.unbody(this.homeB.p.clone().add(par)).add(V(0, gripB, 0)), homeG = this.unbody(this.homeG.p.clone().add(par)).add(V(0, gripG, 0));
    const restL = cb.clone().add(V(0.19, -0.42, 0.05).multiplyScalar(s)), restR = cb.clone().add(V(-0.19, -0.42, 0.05).multiplyScalar(s));
    const glassHold = cb.clone().add(V(-0.06, -0.2, 0.3).multiplyScalar(s));
    const wrist = (side, grip, q, r) => grip.clone().sub(V(side === 'R' ? r : -r, 0, 0.085).applyQuaternion(q));
    const I = new THREE.Quaternion();
    let Lw, Rw, qL = I.clone(), qR = I.clone(), qHandR = null;
    // ---- right hand: the glass
    let gGrip = homeG.clone(), gTilt = I.clone();
    if (t < T.reach) Rw = restR.clone().lerp(wrist('R', homeG, I, 0.03), sm(t / T.reach));
    else {
      if (t < T.lift) gGrip = homeG.clone().lerp(glassHold, sm(seg(t, T.reach, T.lift)));
      else if (t < T.raise - 0.25) gGrip = glassHold.clone();
      else if (t < T.lower) { const up = sm(seg(t, T.raise - 0.25, T.raise + 0.15)) * (1 - sm(seg(t, T.drinkEnd, T.lower))); const a = (0.45 + 1.3 * sm(seg(t, T.raise, T.drinkEnd - 0.1))) * up; gTilt = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -a); const lip = mouth.clone().add(V(0, -0.012 * s, 0.004)); const atMouth = lip.sub(V(0, 0.062 - gripG, -0.024).applyQuaternion(gTilt)); gGrip = glassHold.clone().lerp(atMouth, up); }
      else if (t < T.glassDown) gGrip = glassHold.clone().lerp(homeG, sm(seg(t, T.lower, T.glassDown - 0.05)));
      if (t < T.glassDown) { this.place(this.glass, this.homeG, gGrip, gTilt, gripG); Rw = wrist('R', gGrip, gTilt, 0.03); qR = gTilt; }
      else { this.glass.position.copy(this.homeG.p); this.glass.quaternion.copy(this.homeG.q);
        const wipeA = mouth.clone().add(V(-0.13, -0.045, 0.05).multiplyScalar(s)), wipeB = mouth.clone().add(V(-0.03, -0.04, 0.045).multiplyScalar(s)); qHandR = Q_WIPE; /* back of the hand across the lips, fingers to the left */
        if (t < T.wipe) Rw = wrist('R', homeG, I, 0.03).lerp(wipeA, sm(seg(t, T.glassDown, T.glassDown + 0.35))).lerp(wipeB, sm(seg(t, T.glassDown + 0.3, T.wipe)));
        else Rw = wipeB.lerp(restR, sm(seg(t, T.wipe, T.end))); }
    }
    // ---- left hand: the bottle (pours into the glass held by the right hand)
    if (t < T.reach) Lw = restL.clone().lerp(wrist('L', homeB, I, 0.042), sm(t / T.reach));
    else if (t < T.bottleDown) {
      const pour = sm(seg(t, T.lift, T.lift + 0.5)) * (1 - sm(seg(t, T.pourEnd - 0.35, T.pourEnd))); const bTilt = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 1.9 * pour);
      const above = gGrip.clone().add(V(0.13 * s, 0.16, 0.0)); let pt;
      if (t < T.lift) pt = homeB.clone().lerp(above, sm(seg(t, T.reach, T.lift))); else if (t < T.pourEnd) pt = above.clone(); else pt = above.clone().lerp(homeB, sm(seg(t, T.pourEnd, T.bottleDown - 0.05)));
      if (pour > 0) { const rim = gGrip.clone().add(V(0.004, 0.062 - gripG + 0.045, 0)); const target = rim.sub(V(0, 0.2, 0).applyQuaternion(bTilt)); pt.lerp(target, pour); }
      this.place(this.bottle, this.homeB, pt, bTilt, gripB); Lw = wrist('L', pt, bTilt, 0.042); qL = bTilt;
    } else { this.bottle.position.copy(this.homeB.p); this.bottle.quaternion.copy(this.homeB.q); Lw = wrist('L', homeB, I, 0.042).lerp(restL, sm(seg(t, T.bottleDown, T.bottleDown + 0.45))); }
    // ---- IK (targets to chest space)
    const chestQ = b.chest.getWorldQuaternion(new THREE.Quaternion()).invert();
    const toChest = (bp) => b.chest.worldToLocal(this.body(bp)).divideScalar(s);
    const handQ = (qt, custom) => chestQ.clone().multiply(this.qYaw).multiply(custom || qt.clone().multiply(Q_BASE));
    solveArmIK(b, 'L', toChest(Lw).multiplyScalar(s), handQ(qL), w, V(0.6, -0.8, -0.3));
    solveArmIK(b, 'R', toChest(Rw).multiplyScalar(s), handQ(qR, qHandR), w, V(-0.6, -0.8, -0.3));
    if (rig) { rig.hand('L', t > T.reach - 0.12 && t < T.bottleDown ? 'grip' : 'relax', 1); rig.hand('R', t > T.reach - 0.12 && t < T.glassDown ? 'grip' : 'relax', 1); }
    void dt; void _q1; void _q2; void _v1; void _v2; void _m4;
  }
}

// ---------------------------------------------------------------------------------------------- outside view (through the window)
function viewTex(seed) {
  return canvasTex('view' + seed, 512, 256, (a, w, h) => {
    const r = rnd(seed); const sky = a.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#8fbde6'); sky.addColorStop(1, '#e6eef2'); a.fillStyle = sky; a.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { const x = i * 60 + r() * 20 - 20, bw = 50 + r() * 50, bh = 80 + r() * 140; const c = 150 + r() * 70; a.fillStyle = `rgb(${c},${c - 10 - r() * 20},${c - 30})`; a.fillRect(x, h - bh, bw, bh); for (let yy = h - bh + 12; yy < h - 10; yy += 22) for (let xx = x + 6; xx < x + bw - 10; xx += 16) { a.fillStyle = r() < 0.3 ? '#4a5a66' : '#2c3a44'; a.fillRect(xx, yy, 9, 12); } if (r() < 0.5) { a.fillStyle = ['#c33', '#36c', '#fc3', '#fff'][Math.floor(r() * 4)]; a.fillRect(x + 4, h - bh + 30, bw - 8, 3); } }
    a.strokeStyle = '#222'; a.lineWidth = 1; for (let i = 0; i < 3; i++) { a.beginPath(); a.moveTo(0, 40 + i * 9); a.quadraticCurveTo(w / 2, 70 + i * 9, w, 36 + i * 9); a.stroke(); } // overhead cables
    a.fillStyle = '#3a2a1a'; a.fillRect(400, 60, 6, h); a.fillStyle = '#2f5a2a'; for (let i = 0; i < 9; i++) { a.save(); a.translate(403, 62); a.rotate(i / 9 * Math.PI * 2); a.beginPath(); a.ellipse(34, 0, 36, 7, 0.3, 0, 7); a.fill(); a.restore(); } // coconut palm
  });
}
function viewNightTex(seed) {
  return canvasTex('viewN' + seed, 512, 256, (a, w, h) => { a.fillStyle = '#000'; a.fillRect(0, 0, w, h); const r = rnd(seed); for (let i = 0; i < 9; i++) { const x = i * 60 + r() * 20 - 20, bw = 50 + r() * 50, bh = 80 + r() * 140; for (let yy = h - bh + 12; yy < h - 10; yy += 22) for (let xx = x + 6; xx < x + bw - 10; xx += 16) if (r() < 0.35) { a.fillStyle = r() < 0.5 ? '#ffd890' : '#d8e8ff'; a.fillRect(xx, yy, 9, 12); } } a.fillStyle = '#ffcf80'; a.beginPath(); a.arc(250, 120, 3, 0, 7); a.fill(); });
}

// ---------------------------------------------------------------------------------------------- the room builder
export function buildHeroRoom(game, id, door) {
  const R = HERO_ROOMS[id]; const { W, D, H } = R; const k = new Kit(); RP.baseMats(k);
  const ox = door.x - R.doorX, oz = door.z - 200 - D / 2; // room centre (local origin); the door sits at (doorX, +D/2)
  const g = new THREE.Group(); g.position.set(ox, Y, oz); g.visible = false; game.scene.add(g);
  const room = { id, D: { name: R.name }, R, g, game, hero: true, owner: R.owner, y: Y, door, lightsOn: true, items: [], prompt: null, musicMode: null };
  const theme = THEMES[id]; theme.mats(k);
  // ---- shell: walls (window opening cut out), skirting, cornice, floor, ceiling
  k.def('wall', new THREE.MeshStandardMaterial({ map: plasterTex(id, theme.wall, theme.plaster), roughness: 0.92 }));
  const ftex = floorTex(theme.floor).clone(); ftex.needsUpdate = true; ftex.repeat.set(W / theme.floorTile, D / theme.floorTile); k.def('floor', new THREE.MeshStandardMaterial({ map: ftex, roughness: theme.floorRough, metalness: 0 }));
  k.def('ceil', new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.95 })); k.def('skirt', new THREE.MeshStandardMaterial({ color: theme.skirt, roughness: 0.6 }));
  const walls = [{ name: 'back', o: [-W / 2, -D / 2, 0], len: W }, { name: 'right', o: [W / 2, -D / 2, -Math.PI / 2], len: D }, { name: 'front', o: [W / 2, D / 2, Math.PI], len: W }, { name: 'left', o: [-W / 2, D / 2, Math.PI / 2], len: D }];
  const win = theme.window; // { wall, u, w, h, sill }
  for (const wl of walls) {
    k.push(wl.o[0], 0, wl.o[1], wl.o[2]); const rect = (u0, u1, v0, v1) => { if (u1 - u0 < 1e-3 || v1 - v0 < 1e-3) return; const gq = new THREE.PlaneGeometry(u1 - u0, v1 - v0); const uv = gq.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (u0 + uv.getX(i) * (u1 - u0)) / wl.len, (v0 + uv.getY(i) * (v1 - v0)) / H); k.geo('wall', gq, (u0 + u1) / 2, (v0 + v1) / 2, 0); };
    if (win && win.wall === wl.name) { const u0 = win.u - win.w / 2 - 0.06, u1 = win.u + win.w / 2 + 0.06, v0 = win.sill - 0.02, v1 = win.sill + win.h + 0.06; rect(0, u0, 0, H); rect(u1, wl.len, 0, H); rect(u0, u1, 0, v0); rect(u0, u1, v1, H); for (const [a, bq, c, d] of [[u0, v0, u0, v1], [u1, v0, u1, v1]]) k.box('wall', 0.012, d - bq, 0.22, a, (bq + d) / 2, -0.11); void 0; k.box('wall', u1 - u0, 0.012, 0.22, (u0 + u1) / 2, v1, -0.11); k.box('wall', u1 - u0, 0.012, 0.22, (u0 + u1) / 2, v0, -0.11); }
    else rect(0, wl.len, 0, H);
    k.box('skirt', wl.len, 0.1, 0.014, wl.len / 2, 0.05, 0.007, { uv: 0 }); k.box('ceil', wl.len, 0.06, 0.05, wl.len / 2, H - 0.03, 0.025); k.box('ceil', wl.len, 0.03, 0.08, wl.len / 2, H - 0.075, 0.04);
    k.pop();
  }
  k.plane('floor', W, D, 0, 0, 0, { rx: -Math.PI / 2 }); k.plane('ceil', W, D, 0, H, 0, { rx: Math.PI / 2 });
  // window: frame + grille + curtains, and the view outside (day / night planes)
  let viewDay = null, viewNight = null;
  if (win) { const wl = walls.find((x) => x.name === win.wall); k.push(wl.o[0], 0, wl.o[1], wl.o[2]); k.push(win.u, win.sill, -0.14); RP.windowUnit(k, { w: win.w, h: win.h, curtain: theme.curtain }); k.pop();
    const c = k.local(win.u, win.sill + win.h / 2, -1.6); const vg = new THREE.PlaneGeometry(win.w * 3.2, win.h * 2.6); viewDay = new THREE.Mesh(vg, new THREE.MeshBasicMaterial({ map: viewTex(theme.seed), toneMapped: true })); viewNight = new THREE.Mesh(vg, new THREE.MeshBasicMaterial({ map: viewNightTex(theme.seed), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    for (const m of [viewDay, viewNight]) { m.position.copy(c); m.rotation.y = wl.o[2]; g.add(m); } viewNight.position.addScaledVector(new THREE.Vector3(Math.sin(wl.o[2]), 0, Math.cos(wl.o[2])), 0.01); k.pop(); }
  // door, light switch + conduit, tube light, fan
  k.at(R.doorX, 0, D / 2 - 0.03, Math.PI, () => RP.door(k, { w: 0.9, h: 2.1 }));
  const swX = R.doorX + (R.doorX > 0 ? -0.75 : 0.75); k.at(swX, 1.3, D / 2 - 0.016, Math.PI, () => RP.switchboard(k, 4, true)); RP.conduit(k, [[swX, 1.37, D / 2 - 0.016], [swX, H - 0.12, D / 2 - 0.016], [0, H - 0.12, D / 2 - 0.016]]);
  const tl = theme.tube; k.at(tl[0], tl[1], tl[2], tl[3], () => RP.tubeLight(k)); RP.conduit(k, [[tl[0] + Math.cos(tl[3]) * 0.62, tl[1], tl[2] - Math.sin(tl[3]) * 0.62 + (Math.abs(tl[2]) > 0 ? Math.sign(tl[2]) * -0.016 : 0)], [tl[0] + Math.cos(tl[3]) * 0.62, H - 0.12, tl[2] + (Math.abs(tl[2]) > 0 ? Math.sign(tl[2]) * -0.016 : 0)]]);
  const tubeM = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1.18, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 1.5 })); tubeM.rotation.z = Math.PI / 2; const tubeG = new THREE.Group(); tubeG.position.set(tl[0], tl[1], tl[2]); tubeG.rotation.y = tl[3]; tubeM.position.set(0, -0.045, 0.025); tubeG.add(tubeM); g.add(tubeG);
  const fanK = new Kit(); RP.baseMats(fanK); const blades = RP.ceilingFan(fanK); const fanG = new THREE.Group(); fanG.position.set(theme.fan[0], H, theme.fan[1]); fanK.build(fanG, { cast: false }); const fan = new THREE.Group(); const bk = new Kit(); RP.baseMats(bk); blades(bk); bk.build(fan, { cast: false }); fanG.add(fan); g.add(fanG);
  // ---- furniture + objects (per room)
  const dev = theme.build(k, g, room);
  // ---- lights: tube (main), window fill, TV glow, small warm source
  const main = new THREE.PointLight(0xfff4e6, 16, 10, 1.2); main.position.set(tl[0] + Math.sin(tl[3]) * 0.4, tl[1] - 0.25, tl[2] + Math.cos(tl[3]) * 0.4); g.add(main);
  const fill = new THREE.PointLight(0xbfd8ff, 3, 7, 1.4); if (win) { const wl = walls.find((x) => x.name === win.wall); k.push(wl.o[0], 0, wl.o[1], wl.o[2]); fill.position.copy(k.local(win.u, win.sill + win.h * 0.6, 0.9)); k.pop(); } g.add(fill);
  const tvL = new THREE.PointLight(0x8090ff, 0, 5, 1.6); g.add(tvL);
  const warm = new THREE.PointLight(0xffb060, dev.warm ? dev.warm[3] : 0, 3, 1.8); if (dev.warm) warm.position.set(dev.warm[0], dev.warm[1], dev.warm[2]); g.add(warm);
  k.build(g); // merged furniture
  // ---- devices
  const tvScreen = dev.tv; tvL.position.copy(tvScreen.mesh.position).add(new THREE.Vector3(Math.sin(tvScreen.yaw) * 0.6, 0, Math.cos(tvScreen.yaw) * 0.6));
  room.tv = new TV(room, tvScreen.mesh, tvScreen.led, tvL, tvScreen.crt);
  room.radio = new Radio(room, dev.radio);
  room.drink = new Drink(room, dev.bottle, dev.glass, dev.drinkSpot); dev.bottle.userData.setFill(1);
  room.clocks = dev.clocks || []; room.flame = dev.flame || null; room.lamp = dev.lamp || null;
  room.lights = { main, fill, tubeM, warm, base: { main: 16, fill: 3 } }; room.view = { viewDay, viewNight };
  // ---- interactions (room-local points)
  const key = (a) => game.hud.key(a);
  const items = [
    { at: dev.tvAt, r: 1.6, look: tvScreen.mesh.position, label: () => (room.tv.on ? `${key('interact')} Change channel (${CHANNELS[(room.tv.ch + 1) % CHANNELS.length].name.split(' · ')[1]}) · ${key('more')} Turn the TV off` : `${key('interact')} Turn the TV on`), act: () => (room.tv.on ? room.tv.next() : room.tv.power(true)), alt: () => room.tv.on && room.tv.power(false) },
    { at: dev.radioAt, r: 1.25, look: dev.radio.pos, label: () => (room.radio.st ? `${key('interact')} Next station · ${key('more')} Radio off` : `${key('interact')} Turn the radio on`), act: () => room.radio.next(), alt: () => room.radio.off() },
    { at: [dev.drinkSpot.x, dev.drinkSpot.z], r: 1.15, look: dev.bottle.position, label: () => (room.drink.shots ? `${key('interact')} Pour a shot of vodka (${room.drink.shots} left)` : 'The bottle is empty (a new one turns up tomorrow)'), act: () => room.drink.shots && room.drink.start(game.player) },
    { at: dev.bedAt, r: 1.3, look: dev.bedLook, label: () => { const h = game.atmos.hour; return `${key('interact')} Sleep until ${h >= 6 && h < 17 ? '7:45 PM' : '8:00 AM'}`; }, act: () => { const h = game.atmos.hour; if (!game.story.running) game.restUntil(h >= 6 && h < 17 ? 19.75 : 8); } },
    { at: [swX, D / 2 - 0.55], r: 0.9, look: new THREE.Vector3(swX, 1.3, D / 2), label: () => `${key('interact')} Lights ${room.lightsOn ? 'off' : 'on'}`, act: () => { room.lightsOn = !room.lightsOn; if (Audio.ready) Audio.tone(2400, 0.02, { type: 'square', vol: 0.05 }); } },
  ];
  room.items = items; room.bed = { wake: dev.wake.map((v, i) => (i === 0 ? v + ox : i === 1 ? v + oz : v)) };
  // ---- obstacles (world space) + bounds + spawn
  room.obstacles = k.obs.map((o) => ({ x0: o.x0 + ox, x1: o.x1 + ox, z0: o.z0 + oz, z1: o.z1 + oz }));
  room.bounds = { x0: ox - W / 2 + 0.05, x1: ox + W / 2 - 0.05, z0: oz - D / 2 + 0.05, z1: oz + D / 2 - 0.05 };
  room.spawn = [ox + R.doorX, oz + D / 2 - 0.85]; room.fan = fan;
  // ---- per-frame
  room.syncMusic = () => { const st = room.radio?.st ? RADIO[room.radio.st].mode : room.tv?.on && CHANNELS[room.tv.ch].id === 'music' ? 'radio2' : null; room.musicMode = st; Audio.speaker(!!st); };
  room.onExit = () => { room.drink.abort(); Audio.speaker(false); room.musicMode = null; game.player.indoorBusy = false; };
  room.onEnter = () => { const day = game.atmos.day; if (!room.drink.shots && room.drink.emptyDay !== undefined && day > room.drink.emptyDay) { room.drink.shots = 14; dev.bottle.userData.setFill(1); } if (!room.drink.shots && room.drink.emptyDay === undefined) room.drink.emptyDay = day; room.syncMusic(); };
  room.tick = (dt, P) => tickRoom(room, dt, P); // every frame (Game) — devices keep running while the player is busy
  room.update = (dt, P) => updateRoom(room, dt, P, ox, oz); // prompts (Interiors.update via Game.updateInteractions)
  return room;
}
function tickRoom(room, dt, P) {
  const g = room.game, A = g.atmos; room.fan.rotation.y += dt * 9; const day = A ? A.daylight ?? (A.night !== undefined ? 1 - A.night : 1) : 1;
  room.tv.update(dt, P); room.radio.update(dt); room.drink.update(dt);
  if (!room.drink.shots && room.drink.emptyDay === undefined) room.drink.emptyDay = A.day;
  const Lt = room.lights; const on = room.lightsOn; Lt.main.intensity += ((on ? Lt.base.main : 0) - Lt.main.intensity) * Math.min(1, dt * 30); Lt.tubeM.material.emissiveIntensity = on ? 1.5 : 0.02; Lt.fill.intensity = Lt.base.fill * day + 0.15;
  if (room.view.viewDay) { const c = 0.12 + 0.88 * day; room.view.viewDay.material.color.setRGB(c * 0.95, c * 0.97, c); room.view.viewNight.material.opacity = 1 - day; }
  if (room.flame) { const f = 0.85 + Math.sin(performance.now() / 70) * 0.08 + Math.random() * 0.1; room.flame.scale.set(1, f, 1); Lt.warm.intensity = 0.55 * f; }
  for (const c of room.clocks) c.update(A);
}
function updateRoom(room, dt, P, ox, oz) {
  // prompt: nearest item the player is facing
  room.prompt = null; if (room.drink.active || P.indoorBusy) return;
  let best = null, bd = 9; const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  for (const it of room.items) { const dx = it.at[0] + ox - P.x, dz = it.at[1] + oz - P.z; const d = Math.hypot(dx, dz); if (d > it.r) continue; const lx = it.look.x + ox - P.x, lz = it.look.z + oz - P.z; const ll = Math.hypot(lx, lz) || 1; const face = (lx * fx + lz * fz) / ll; if (face < 0.2) continue; const sc = d * (2 - face); if (sc < bd) { bd = sc; best = it; } }
  if (best) { room.prompt = best.label(); if (Input.wasPressed('interact')) best.act(); else if (best.alt && Input.wasPressed('more')) best.alt(); }
}

// ---------------------------------------------------------------------------------------------- devices built inside the themes
function screenMesh(spec, crt) { const gq = new THREE.PlaneGeometry(spec.w, spec.h, crt ? 12 : 1, crt ? 10 : 1); if (crt) { const p = gq.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (spec.w / 2), y = p.getY(i) / (spec.h / 2); p.setZ(i, spec.curve * (1 - 0.5 * (x * x + y * y))); } gq.computeVertexNormals(); } return new THREE.Mesh(gq, new THREE.MeshStandardMaterial({ color: 0x0b0d0e, roughness: 0.12, metalness: 0.3 })); }
function placeTV(g, k, kind, x, y, z, yaw, opts = {}) { let spec; k.push(x, y, z, yaw); spec = kind === 'crt' ? RP.crtTV(k, opts) : RP.flatTV(k, opts); const sc = screenMesh(spec.screen, kind === 'crt'); sc.position.copy(k.local(spec.screen.x, spec.screen.y, spec.screen.z)); sc.rotation.y = yaw; g.add(sc); const led = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a10, emissiveIntensity: 1.5 })); led.position.copy(k.local(...spec.led)); g.add(led); k.pop(); return { mesh: sc, led, yaw, crt: kind === 'crt' }; }
function placeBottleGlass(g, bx, by, bz, gx, gz) { const b = RP.bottle(); b.position.set(bx, by, bz); b.rotation.y = 0.6; g.add(b); const gl = RP.shotGlass(); gl.position.set(gx, by, gz); g.add(gl); return { bottle: b, glass: gl }; }
function dialRadio(g, at, yaw, { w, y, z, color = 0xffd890, scale = null }) { // a lit dial strip + needle (separate meshes so they can move/glow)
  const grp = new THREE.Group(); grp.position.set(at[0], at[1], at[2]); grp.rotation.y = yaw; g.add(grp);
  const tex = scale || canvasTex('dialscale', 256, 32, (a, W_, H_) => { a.fillStyle = '#f3e3b8'; a.fillRect(0, 0, W_, H_); a.fillStyle = '#3a2a1a'; a.font = '10px sans-serif'; a.textAlign = 'center'; for (let i = 0; i <= 10; i++) { const x = 12 + i * 23.2; a.fillRect(x - 0.5, 18, 1, i % 2 ? 5 : 9); if (i % 2 === 0) a.fillText(String(88 + i * 2), x, 13); } a.fillText('FM  MHz', W_ - 28, 30); });
  const glowM = new THREE.MeshStandardMaterial({ map: tex, emissive: color, emissiveMap: tex, emissiveIntensity: 0, roughness: 0.4 });
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), glowM); dial.position.set(0, y, z); grp.add(dial);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.0025, w / 8 * 0.9, 0.002), new THREE.MeshStandardMaterial({ color: 0xc81818 })); needle.position.set(0, y, z + 0.002); grp.add(needle);
  return { dial, needle, glow: glowM, needleRange: [-w * 0.45, w * 0.45], pos: grp.position.clone().add(new THREE.Vector3(0, y, 0)) };
}
class WallClock { constructor(g, x, y, z, yaw, k) { k.at(x, y, z, yaw, () => RP.wallClockBody(k)); const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = yaw; g.add(grp); const hm = new THREE.MeshStandardMaterial({ color: 0x151515 }); const mk = (len, wid, zz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(wid, len, 0.003), hm); m.geometry.translate(0, len / 2 - 0.015, 0); m.position.z = zz; grp.add(m); return m; }; this.h = mk(0.075, 0.009, 0.016); this.m = mk(0.11, 0.006, 0.019); this.s = mk(0.12, 0.002, 0.022); this.s.material = new THREE.MeshStandardMaterial({ color: 0xb81818 }); }
  update(A) { const hr = A.hour; this.h.rotation.z = -(hr % 12) / 12 * Math.PI * 2; this.m.rotation.z = -(hr % 1) * Math.PI * 2; this.s.rotation.z = -((hr * 60) % 1) * Math.PI * 2; } }
class DigitalClock { constructor(g, x, y, z, yaw, k) { k.at(x, y, z, yaw, () => { k.box('blackP', 0.13, 0.065, 0.06, 0, 0.0325, 0, { r: 0.012, rx: -0.12 }); }); this.cv = document.createElement('canvas'); this.cv.width = 128; this.cv.height = 48; this.tex = new THREE.CanvasTexture(this.cv); const m = new THREE.Mesh(new THREE.PlaneGeometry(0.105, 0.04), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false })); const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = yaw; m.position.set(0, 0.034, 0.0305); m.rotation.x = -0.12; grp.add(m); g.add(grp); this.last = ''; }
  update(A) { const s = A.timeString; if (s === this.last) return; this.last = s; const a = this.cv.getContext('2d'); a.fillStyle = '#060606'; a.fillRect(0, 0, 128, 48); a.fillStyle = '#ff3a22'; a.font = 'bold 34px monospace'; a.textAlign = 'center'; a.fillText(s.replace(/\s?[AP]M/i, ''), 64, 37); this.tex.needsUpdate = true; } }

// ---------------------------------------------------------------------------------------------- the three rooms
const std = (o) => new THREE.MeshStandardMaterial(o);
const THEMES = {
  // ------------------------------------------------ Dineth: old Slave Island flat — red cement floor, faded mint walls
  room: {
    seed: 3, wall: '#a9c4b0', plaster: { damp: 0.4, peel: 5, seed: 14 }, floor: 'redoxide', floorTile: 1.0, floorRough: 0.5, skirt: 0x3d5a48,
    window: { wall: 'left', u: 3.25, w: 1.05, h: 1.15, sill: 1.0 }, curtain: fabricTex('check', '#7a1f2a', '#c45a3a', '#e8d8a0'), tube: [0.0, 2.62, -2.48, 0], fan: [0.1, -0.2],
    mats(k) { k.def('padura', std({ map: canvasTex('padura', 256, 256, (a, w, h) => { a.fillStyle = '#d9b77a'; a.fillRect(0, 0, w, h); for (let i = 0; i < 64; i++) { a.fillStyle = i % 8 < 2 ? '#8a2a1a' : i % 8 < 3 ? '#1f4a6a' : 'rgba(120,80,30,0.25)'; a.fillRect(0, i * 4, w, 2); } for (let i = 0; i < w; i += 3) { a.fillStyle = 'rgba(0,0,0,0.06)'; a.fillRect(i, 0, 1, h); } }), roughness: 0.95 })); },
    build(k, g, room) {
      const { W, D } = room.R; const out = {};
      // bed under the window, mosquito net tied up above it
      k.at(-W / 2 + 0.55, 0, -0.98 - 0.47, 0, () => RP.bed(k, { w: 0.95, l: 1.95, frame: 'wood', sheet: fabricTex('batik', '#e7d3a6', '#9a3a1f', '#3b2a5a'), blanket: fabricTex('check', '#2c4f7a', '#d8d0c0', '#8a1f1f'), seed: 2 }));
      aoBlob(g, -W / 2 + 0.55, 0, -1.45, 1.3, 2.3, 0.6);
      k.def('net', std({ color: 0xf2f2ee, transparent: true, opacity: 0.55, roughness: 1, side: THREE.DoubleSide, depthWrite: false }));
      k.lathe('net', [[0.0, 0], [0.09, -0.08], [0.13, -0.35], [0.11, -0.7], [0.06, -0.92], [0.0, -0.98]], -W / 2 + 0.55, room.R.H - 0.05, -1.45, { seg: 14 }); k.torus('steel', 0.05, 0.004, -W / 2 + 0.55, room.R.H - 0.05, -1.45, { rx: Math.PI / 2 }); k.torus('net', 0.11, 0.01, -W / 2 + 0.55, room.R.H - 0.55, -1.45, { rx: Math.PI / 2 });
      k.geo('padura', new THREE.PlaneGeometry(0.62, 1.25), -0.75, 0.005, -1.35, -Math.PI / 2); // woven reed mat beside the bed
      // steel almirah in the back-right corner
      k.at(W / 2 - 0.27, 0, -D / 2 + 0.5, -Math.PI / 2, () => RP.almirah(k, { color: '#71847a' })); aoBlob(g, W / 2 - 0.27, 0, -D / 2 + 0.5, 0.8, 1.2, 0.6);
      // TV cabinet + CRT with lace doily, shrine shelf above
      k.at(0.15, 0, -D / 2 + 0.23, 0, () => { k.box('teak', 0.92, 0.6, 0.42, 0, 0.32, 0, { r: 0.008 }); k.box('teak', 0.96, 0.03, 0.46, 0, 0.635, 0, { r: 0.006 }); for (const sx of [-1, 1]) { k.box('teak', 0.43, 0.42, 0.012, sx * 0.225, 0.3, 0.212, { r: 0.004 }); k.cyl('brass', 0.008, 0.008, 0.012, sx * 0.03, 0.34, 0.222, { rx: Math.PI / 2, seg: 10 }); } k.box('teak', 0.9, 0.03, 0.4, 0, 0.03, 0); for (const sx of [-1, 1]) k.box('teak', 0.04, 0.03, 0.04, sx * 0.42, 0.015, 0.18); k.block(0, 0, 0.96, 0.46); });
      out.tv = placeTV(g, k, 'crt', 0.15, 0.65, -D / 2 + 0.27, 0, { doily: true }); out.tvAt = [0.15, -D / 2 + 1.5];
      k.def('vase', std({ color: 0x2a5a8a, roughness: 0.2 })); k.def('leaf', std({ color: 0x2f6a2a, roughness: 0.6, side: THREE.DoubleSide })); k.def('flowerR', std({ color: 0xd8304a, roughness: 0.6 })); k.lathe('vase', [[0, 0], [0.04, 0], [0.05, 0.05], [0.03, 0.14], [0.035, 0.18], [0, 0.18]], 0.52, 0.65, -D / 2 + 0.2, { seg: 16 }); for (let i = 0; i < 5; i++) { const a = i * 1.3; k.tube('leaf', [[0.52, 0.8, -D / 2 + 0.2], [0.52 + Math.cos(a) * 0.04, 0.92, -D / 2 + 0.2 + Math.sin(a) * 0.04], [0.52 + Math.cos(a) * 0.08, 1.0, -D / 2 + 0.2 + Math.sin(a) * 0.08]], 0.003, { n: 8 }); k.sph('flowerR', 0.025, 0.52 + Math.cos(a) * 0.08, 1.01, -D / 2 + 0.2 + Math.sin(a) * 0.08, { sy: 0.6 }); }
      k.at(0.15, 1.88, -D / 2 + 0.11, 0, () => { const s = RP.shrineShelf(k); out.flameAt = k.local(...s.flame); });
      // table with a plastic flowered cloth by the right wall: radio, vodka, keys, newspaper
      const cloth = canvasTex('tcloth', 256, 256, (a, w, h) => { a.fillStyle = '#f4f0e4'; a.fillRect(0, 0, w, h); const r = rnd(5); for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h; for (let p = 0; p < 5; p++) { a.fillStyle = ['#d8304a', '#e07b1a', '#2c6fb0'][i % 3]; a.beginPath(); a.ellipse(x + Math.cos(p * 1.256) * 7, y + Math.sin(p * 1.256) * 7, 6, 3.5, p * 1.256, 0, 7); a.fill(); } a.fillStyle = '#f2c230'; a.beginPath(); a.arc(x, y, 3, 0, 7); a.fill(); a.fillStyle = '#3f8a3a'; a.beginPath(); a.ellipse(x + 12, y + 6, 7, 3, 0.6, 0, 7); a.fill(); } });
      const tx = W / 2 - 0.32, tz = 0.35; k.at(tx, 0, tz, Math.PI / 2, () => RP.table(k, { w: 0.9, d: 0.6, cloth: fabricLike(cloth) })); aoBlob(g, tx, 0, tz, 0.9, 1.2, 0.5);
      k.at(tx + 0.1, 0.752, tz + 0.3, -Math.PI / 2 + 0.2, () => transistorRadio(k)); out.radio = dialRadio(g, [tx + 0.1, 0.752, tz + 0.3], -Math.PI / 2 + 0.2, { w: 0.1, y: 0.085, z: 0.033 }); out.radioAt = [tx - 0.8, tz + 0.3];
      Object.assign(out, placeBottleGlass(g, tx - 0.2, 0.754, tz - 0.1, tx - 0.22, tz + 0.06)); out.drinkSpot = { x: tx - 0.62, z: tz - 0.02, yaw: Math.PI / 2 };
      k.at(tx + 0.12, 0.754, tz - 0.25, 0.6, () => RP.keys(k)); k.at(tx + 0.08, 0.754, tz + 0.05, 0.3, () => RP.newspaper(k));
      k.at(W / 2 - 0.05, 1.62, tz, -Math.PI / 2, () => RP.frame(k, 'photo1', RP.photoTex(11, 3), 0.24, 0.18));
      // plastic chair pulled away from the table
      k.at(0.95, 0, -0.75, 2.3, () => RP.plasticChair(k, '#b3261e')); aoBlob(g, 0.95, 0, -0.75, 0.6, 0.6, 0.45);
      // shirts on hooks, calendar, mirror shelf with comb + talc, slippers and umbrella by the door
      for (const [z, tex] of [[-1.05, fabricTex('check', '#e8e2d2', '#4a6a9a', '#9a3a3a')], [-0.72, fabricTex('plain', '#3f6f8f', '#fff', '#fff')]]) { k.at(W / 2 - 0.03, 1.8, z, -Math.PI / 2, () => { k.cyl('steel', 0.006, 0.006, 0.05, 0, 0.05, 0.02, { rx: Math.PI / 2 }); k.push(0, -0.02, 0.06); RP.hangingShirt(k, 'shirt' + z, tex); k.pop(); }); }
      k.at(-0.75, 1.42, -D / 2 + 0.005, 0, () => RP.calendar(k));
      k.at(-0.75, 1.5, D / 2 - 0.01, Math.PI, () => { k.box('teak', 0.34, 0.44, 0.02, 0, 0, 0, { r: 0.01 }); k.box('mirror', 0.3, 0.4, 0.004, 0, 0, 0.012); k.box('teak', 0.4, 0.02, 0.12, 0, -0.3, 0.05); k.box('blackP', 0.13, 0.006, 0.02, -0.08, -0.287, 0.05, { ry: 0.2 }); k.def('talc', std({ color: 0xe8e0f0, roughness: 0.4 })); k.cyl('talc', 0.025, 0.025, 0.1, 0.1, -0.24, 0.05, { seg: 16 }); k.cyl('chrome', 0.02, 0.025, 0.015, 0.1, -0.183, 0.05, { seg: 16 }); });
      k.at(room.R.doorX - 0.65, 0, D / 2 - 0.35, 0.3, () => RP.slippers(k, '#2952a3'));
      k.at(-W / 2 + 0.12, 0, D / 2 - 0.15, 0, () => { k.push(0, 0, 0, 0, 0.12, -0.05); RP.umbrella(k); k.pop(); });
      out.bedAt = [-W / 2 + 1.35, -1.3]; out.bedLook = new THREE.Vector3(-W / 2 + 0.55, 0.5, -1.45); out.wake = [-W / 2 + 1.25, -1.0, -Math.PI / 2];
      out.flame = flameMesh(g, out.flameAt); out.warm = [out.flameAt.x, out.flameAt.y + 0.1, out.flameAt.z + 0.1, 0.55];
      return out;
    },
  },
  // ------------------------------------------------ Shashika: tiled room near the garage — steel bed, wall TV, mini fridge, tools, cricket bat
  room_shashika: {
    seed: 8, wall: '#a8c6dc', plaster: { damp: 0.2, peel: 0, seed: 21 }, floor: 'tiles', floorTile: 1.0, floorRough: 0.22, skirt: 0x5a6a78,
    window: { wall: 'back', u: 2.0, w: 1.2, h: 1.1, sill: 1.05 }, curtain: fabricTex('check', '#2c3f5a', '#6a7f9a', '#c7a23a'), tube: [-2.28, 2.6, -1.2, Math.PI / 2], fan: [0.0, -0.3],
    mats() {},
    build(k, g, room) {
      const { W, D } = room.R; const out = {};
      k.at(W / 2 - 0.65, 0, -D / 2 + 1.04, 0, () => RP.bed(k, { w: 1.2, l: 1.95, frame: 'steel', sheet: fabricTex('plain', '#c8d4e2', '#fff', '#fff'), blanket: fabricTex('plain', '#3a4250', '#fff', '#fff'), rumpled: true, headH: 1.0, seed: 7 })); aoBlob(g, W / 2 - 0.65, 0, -D / 2 + 1.04, 1.5, 2.3, 0.55);
      // wall-mounted TV over a low unit (set-top box, boombox radio), plastic chair facing it
      const tvz = -0.55; k.at(-W / 2 + 0.24, 0, tvz, Math.PI / 2, () => { k.box('blackP', 1.2, 0.42, 0.42, 0, 0.23, 0, { r: 0.01 }); k.box('ply', 1.22, 0.025, 0.44, 0, 0.452, 0); for (const sx of [-1, 1]) k.box('greyP', 0.56, 0.3, 0.01, sx * 0.29, 0.22, 0.211); k.box('blackP', 0.22, 0.04, 0.16, -0.38, 0.485, 0, { r: 0.006 }); k.block(0, 0, 1.22, 0.44); });
      const stb = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 4), new THREE.MeshBasicMaterial({ color: 0x30ff60 })); stb.position.set(-W / 2 + 0.24 + 0.081, 0.49, tvz - 0.38); g.add(stb);
      k.at(-W / 2 + 0.02, 1.08, tvz, Math.PI / 2, () => { k.box('steel', 0.3, 0.2, 0.03, 0, 0.22, 0); k.box('steel', 0.04, 0.04, 0.05, 0, 0.22, 0.03); });
      out.tv = placeTV(g, k, 'flat', -W / 2 + 0.08, 1.08, tvz, Math.PI / 2, { w: 0.82, h: 0.48, stand: false }); out.tvAt = [-W / 2 + 1.5, tvz];
      RP.conduit(k, [[-W / 2 + 0.03, 1.08, tvz + 0.2], [-W / 2 + 0.03, 0.46, tvz + 0.2]]);
      k.at(-W / 2 + 0.24, 0.465, tvz + 0.3, Math.PI / 2, () => boombox(k)); out.radio = dialRadio(g, [-W / 2 + 0.24, 0.465, tvz + 0.3], Math.PI / 2, { w: 0.1, y: 0.15, z: 0.066, color: 0x60e0ff, scale: canvasTex('bbscale', 256, 32, (a, W_, H_) => { a.fillStyle = '#0a1a24'; a.fillRect(0, 0, W_, H_); a.fillStyle = '#7fe8ff'; a.font = '10px monospace'; a.textAlign = 'center'; for (let i = 0; i <= 10; i++) { const x = 12 + i * 23.2; a.fillRect(x - 0.5, 20, 1, i % 2 ? 5 : 9); if (i % 2 === 0) a.fillText(String(88 + i * 2), x, 14); } }) }); out.radioAt = [-W / 2 + 1.0, tvz + 0.35];
      k.at(0.25, 0, 0.35, -Math.PI / 2 - 0.25, () => RP.plasticChair(k, '#1f5fa8', 'chairB')); aoBlob(g, 0.25, 0, 0.35, 0.6, 0.6, 0.45);
      // mini fridge in the back-left corner with the bottle on top
      k.at(-W / 2 + 0.3, 0, -D / 2 + 0.32, 0, () => RP.miniFridge(k)); aoBlob(g, -W / 2 + 0.3, 0, -D / 2 + 0.32, 0.7, 0.7, 0.55);
      Object.assign(out, placeBottleGlass(g, -W / 2 + 0.22, 0.862, -D / 2 + 0.44, -W / 2 + 0.38, -D / 2 + 0.47)); out.drinkSpot = { x: -W / 2 + 0.33, z: -D / 2 + 0.9, yaw: Math.PI };
      // cricket bat + ball, dumbbells, laundry basket
      k.at(0.55, 0, -D / 2 + 0.08, 0, () => { k.push(0, 0, 0, 0.3, -0.12, 0); RP.cricketBat(k); k.pop(); }); k.at(0.8, 0, -D / 2 + 0.3, 0, () => RP.cricketBall(k));
      k.at(0.55, 0, -0.55, 0.4, () => RP.dumbbell(k)); k.at(0.62, 0, -0.25, 0.1, () => RP.dumbbell(k));
      k.def('basket', std({ color: 0x3a8a5a, roughness: 0.7, side: THREE.DoubleSide })); k.cyl('basket', 0.22, 0.18, 0.45, -0.4, 0.225, -D / 2 + 0.28, { open: true, seg: 18 }); k.cyl('basket', 0.18, 0.18, 0.01, -0.4, 0.005, -D / 2 + 0.28, { seg: 18 }); k.def('clothes', std({ map: fabricTex('plain', '#c84a3a', '#fff', '#fff'), roughness: 0.95 })); k.sph('clothes', 0.2, -0.4, 0.42, -D / 2 + 0.28, { sy: 0.35 }); k.block(-0.4, -D / 2 + 0.28, 0.46, 0.46);
      // work corner by the door: small table with the toolbox, piston and plugs on newspaper; helmet on a wall shelf
      const sx = W / 2 - 0.3, sz = 1.4; k.at(sx, 0, sz, -Math.PI / 2, () => RP.table(k, { w: 0.75, d: 0.45, h: 0.72, wood: 'pine' })); aoBlob(g, sx, 0, sz, 0.6, 0.9, 0.5);
      k.at(sx, 0.722, sz - 0.12, -Math.PI / 2, () => RP.toolbox(k)); k.at(sx + 0.02, 0.724, sz + 0.2, 0.2, () => { RP.newspaper(k, 'news2'); k.cyl('steel', 0.04, 0.04, 0.06, 0, 0.035, 0, { seg: 20 }); for (let i = 0; i < 3; i++) k.torus('steel', 0.04, 0.0025, 0, 0.055 - i * 0.008, 0, { rx: Math.PI / 2, ts: 20 }); k.cyl('steel', 0.008, 0.008, 0.07, 0, 0.09, 0, { seg: 8 }); for (let i = 0; i < 3; i++) { k.cyl('whiteP', 0.006, 0.006, 0.03, 0.08, 0.008, -0.06 + i * 0.03, { rz: Math.PI / 2, seg: 8 }); k.cyl('steel', 0.004, 0.004, 0.02, 0.105, 0.008, -0.06 + i * 0.03, { rz: Math.PI / 2, seg: 6 }); } });
      k.at(W / 2 - 0.12, 1.55, sz, -Math.PI / 2, () => { k.box('pine', 0.6, 0.025, 0.2, 0, 0, 0.0); k.push(0, 0.012, 0, 0.4); RP.helmet(k, '#c8202a'); k.pop(); });
      // posters + overalls by the door, boots
      k.at(W / 2 - 0.006, 1.6, -D / 2 + 1.04, -Math.PI / 2, () => RP.frame(k, 'poster1', posterTex('race'), 0.5, 0.36, { wood: 'blackP' }));
      k.at(-W / 2 + 0.006, 1.55, 1.5, Math.PI / 2, () => RP.label(k, 'poster2', posterTex('bike'), 0.42, 0.56, 0, 0, 0));
      k.at(room.R.doorX + 0.9, 1.8, D / 2 - 0.02, Math.PI, () => { k.cyl('steel', 0.006, 0.006, 0.05, 0, 0.05, 0.02, { rx: Math.PI / 2 }); k.push(0, -0.02, 0.06); RP.hangingShirt(k, 'overall', fabricTex('plain', '#24406a', '#fff', '#fff')); k.pop(); });
      k.at(room.R.doorX + 0.85, 0, D / 2 - 0.35, 0.1, () => { k.def('boot', std({ color: 0x3a2a1e, roughness: 0.6 })); for (const s of [-1, 1]) { k.box('boot', 0.11, 0.08, 0.28, s * 0.07, 0.045, 0, { r: 0.035 }); k.box('boot', 0.1, 0.14, 0.12, s * 0.07, 0.12, -0.07, { r: 0.03 }); k.box('rubber', 0.115, 0.02, 0.29, s * 0.07, 0.01, 0, { r: 0.008 }); } });
      out.clocks = [new WallClock(g, 0.9, 2.2, -D / 2 + 0.01, 0, k)];
      out.bedAt = [W / 2 - 1.55, -D / 2 + 1.1]; out.bedLook = new THREE.Vector3(W / 2 - 0.65, 0.5, -D / 2 + 1.04); out.wake = [W / 2 - 1.5, -D / 2 + 1.3, Math.PI / 2];
      return out;
    },
  },
  // ------------------------------------------------ David: tidy terrazzo room near Pettah — workbench, bookshelf, restored valve radio
  room_david: {
    seed: 13, wall: '#e6dcc6', plaster: { damp: 0.15, peel: 0, seed: 31 }, floor: 'terrazzo', floorTile: 1.2, floorRough: 0.28, skirt: 0x5a4030,
    window: { wall: 'left', u: 3.6, w: 1.1, h: 1.15, sill: 1.0 }, curtain: fabricTex('plain', '#c9b98a', '#fff', '#fff'), tube: [0.3, 2.65, -2.68, 0], fan: [0.0, -0.2],
    mats(k) { k.def('wains', std({ map: woodTex('wains', '#6a4528', '#3a2414', { planks: 6, seed: 23 }), roughness: 0.55 })); k.def('sofa', std({ map: fabricTex('plain', '#5a6a4a', '#fff', '#fff'), roughness: 0.95 })); },
    build(k, g, room) {
      const { W, D } = room.R; const out = {};
      // wainscot panelling round the walls
      for (const [x, z, ry, len] of [[0, -D / 2 + 0.01, 0, W], [W / 2 - 0.01, 0, -Math.PI / 2, D], [-W / 2 + 0.01, 0, Math.PI / 2, D]]) k.at(x, 0, z, ry, () => { k.box('wains', len, 0.9, 0.012, 0, 0.45, 0, { uv: 1 }); k.box('wains', len, 0.035, 0.03, 0, 0.91, 0.01); });
      k.at(-W / 2 + 0.58, 0, -D / 2 + 1.05, 0, () => RP.bed(k, { w: 1.0, l: 1.95, frame: 'wood', sheet: fabricTex('plain', '#f2efe6', '#fff', '#fff'), blanket: fabricTex('check', '#6a2a2a', '#c9a227', '#2a2a2a'), headH: 1.0, seed: 5 })); aoBlob(g, -W / 2 + 0.58, 0, -D / 2 + 1.05, 1.35, 2.3, 0.55);
      // bedside table: lamp, digital clock, spectacles, a book
      const bx = -W / 2 + 0.3, bz = -D / 2 + 2.38; k.at(bx, 0, bz, Math.PI / 2, () => { k.box('teak', 0.42, 0.55, 0.38, 0, 0.295, 0, { r: 0.006 }); k.box('teak', 0.44, 0.025, 0.4, 0, 0.58, 0); k.box('teak', 0.38, 0.14, 0.01, 0, 0.45, 0.19); k.cyl('brass', 0.008, 0.008, 0.015, 0, 0.45, 0.2, { rx: Math.PI / 2 }); k.block(0, 0, 0.44, 0.4); });
      k.at(bx - 0.06, 0.593, bz - 0.1, Math.PI / 2, () => RP.deskLamp(k)); out.lamp = true; out.clocks = [new DigitalClock(g, bx + 0.02, 0.593, bz + 0.1, Math.PI / 2 - 0.3, k)];
      k.at(bx + 0.08, 0.593, bz, 0.4, () => { k.torus('blackP', 0.022, 0.0025, -0.025, 0.004, 0, { rx: Math.PI / 2 }); k.torus('blackP', 0.022, 0.0025, 0.025, 0.004, 0, { rx: Math.PI / 2 }); k.box('blackP', 0.012, 0.003, 0.003, 0, 0.004, 0); k.box('blackP', 0.004, 0.003, 0.12, -0.047, 0.004, -0.06); k.box('blackP', 0.004, 0.003, 0.12, 0.047, 0.004, -0.06); });
      // bookshelf + sideboard (restored valve radio, tray with the vodka) on the back wall, wall clock over them
      const shx = -0.25; k.at(shx, 0, -D / 2 + 0.17, 0, () => { k.box('teak', 0.9, 1.8, 0.02, 0, 0.9, -0.14); for (const s of [-1, 1]) k.box('teak', 0.025, 1.8, 0.3, s * 0.44, 0.9, 0); for (let i = 0; i < 5; i++) k.box('teak', 0.86, 0.022, 0.29, 0, 0.05 + i * 0.43, 0); k.box('teak', 0.92, 0.03, 0.32, 0, 1.81, 0); for (let i = 0; i < 4; i++) { k.push(-0.42, 0.061 + i * 0.43, 0.02); const used = RP.books(k, 12 + i * 2, { seed: 30 + i, h0: 0.24, lean: i % 2 === 1 }); k.pop(); void used; } k.block(0, 0, 0.92, 0.32); });
      const sbx = 0.95; k.at(sbx, 0, -D / 2 + 0.23, 0, () => { k.box('teak', 1.05, 0.68, 0.42, 0, 0.38, 0, { r: 0.006 }); k.box('teak', 1.08, 0.03, 0.45, 0, 0.73, 0, { r: 0.006 }); for (const s of [-1, 0, 1]) { k.box('teak', 0.33, 0.55, 0.012, s * 0.34, 0.38, 0.212, { r: 0.004 }); k.cyl('brass', 0.007, 0.007, 0.03, s * 0.34 + 0.12, 0.38, 0.222, { seg: 8 }); } for (const s of [-1, 1]) for (const z of [-1, 1]) k.cyl('teak', 0.02, 0.014, 0.05, s * 0.48, 0.025, z * 0.17, { seg: 8 }); k.block(0, 0, 1.08, 0.45); });
      k.at(sbx - 0.25, 0.745, -D / 2 + 0.22, 0, () => valveRadio(k)); out.radio = dialRadio(g, [sbx - 0.25, 0.745, -D / 2 + 0.22], 0, { w: 0.2, y: 0.205, z: 0.112 }); out.radioAt = [sbx - 0.35, -D / 2 + 1.1];
      k.at(sbx + 0.22, 0.745, -D / 2 + 0.33, 0, () => { k.box('chrome', 0.34, 0.012, 0.24, 0, 0.006, 0, { r: 0.004 }); }); Object.assign(out, placeBottleGlass(g, sbx + 0.12, 0.758, -D / 2 + 0.36, sbx + 0.28, -D / 2 + 0.4)); const g2 = RP.shotGlass(); g2.position.set(sbx + 0.33, 0.758, -D / 2 + 0.27); g.add(g2);
      out.drinkSpot = { x: sbx + 0.2, z: -D / 2 + 0.82, yaw: Math.PI };
      out.clocks.push(new WallClock(g, sbx, 2.1, -D / 2 + 0.01, 0, k));
      k.at(-W / 2 + 0.008, 1.72, 0.5, Math.PI / 2, () => RP.frame(k, 'cert', certTex(), 0.36, 0.27));
      // workbench on the right wall: laptop, soldering station, multimeter, board, parts drawers; pegboard with tools
      const wx = W / 2 - 0.34, wz = -0.95; k.at(wx, 0, wz, -Math.PI / 2, () => { k.box('ply', 1.6, 0.035, 0.66, 0, 0.76, 0, { r: 0.005 }); for (const s of [-1, 1]) { k.box('steel', 0.04, 0.74, 0.04, s * 0.76, 0.37, 0.28); k.box('steel', 0.04, 0.74, 0.04, s * 0.76, 0.37, -0.28); k.box('steel', 0.04, 0.04, 0.6, s * 0.76, 0.15, 0); } k.box('steel', 1.5, 0.04, 0.04, 0, 0.15, -0.28); k.def('mat', std({ color: 0x2a6a5a, roughness: 0.9 })); k.box('mat', 0.7, 0.004, 0.4, 0.1, 0.78, 0.05);
        k.push(-0.45, 0.778, 0.02, 0.25); RP.laptop(k, schematicTex()); k.pop(); k.push(0.45, 0.778, -0.15); RP.solderStation(k); k.pop(); k.push(0.2, 0.782, 0.12, -0.3); RP.multimeter(k); k.pop(); k.push(0.05, 0.782, -0.02, 0.4); RP.pcb(k); k.pop(); k.push(0.62, 0.778, 0.12); k.pop(); k.push(-0.05, 0.778, -0.22); RP.partsDrawers(k); k.pop(); k.block(0, 0, 1.6, 0.66); });
      k.at(W / 2 - 0.012, 1.45, wz, -Math.PI / 2, () => { k.def('peg', std({ map: canvasTex('peg', 256, 128, (a, w, h) => { a.fillStyle = '#c9a77a'; a.fillRect(0, 0, w, h); a.fillStyle = '#5a4630'; for (let x = 6; x < w; x += 12) for (let y = 6; y < h; y += 12) { a.beginPath(); a.arc(x, y, 2, 0, 7); a.fill(); } }), roughness: 0.8 })); k.plane('peg', 1.2, 0.6, 0, 0, 0.004); const tools = [['#c81818', 0.18], ['#e8b51a', 0.2], ['#1f5fa8', 0.16], ['#111', 0.22], ['#c81818', 0.15]]; tools.forEach(([c, len], i) => { k.def('tool' + i, std({ color: c, roughness: 0.4 })); const x = -0.45 + i * 0.2; k.cyl('tool' + i, 0.012, 0.012, 0.09, x, 0.08, 0.03, { seg: 10 }); k.cyl('chrome', 0.003, 0.003, len - 0.09, x, 0.08 - len / 2, 0.03, { seg: 6 }); }); k.box('steel', 0.22, 0.02, 0.01, 0.4, -0.15, 0.02); k.tube('steel', [[0.3, -0.1, 0.03], [0.33, -0.18, 0.03], [0.36, -0.22, 0.03]], 0.006); k.tube('steel', [[0.42, -0.1, 0.03], [0.39, -0.18, 0.03], [0.36, -0.22, 0.03]], 0.006); });
      // office chair at the bench
      k.at(W / 2 - 0.95, 0, wz + 0.05, Math.PI / 2 + 0.3, () => officeChair(k)); aoBlob(g, W / 2 - 0.95, 0, wz, 0.6, 0.6, 0.45);
      // TV on a low stand + armchair facing it; floor rug
      const tz = 1.3; k.at(-W / 2 + 0.25, 0, tz, Math.PI / 2, () => { k.box('teak', 1.1, 0.42, 0.42, 0, 0.23, 0, { r: 0.008 }); k.box('blackP', 0.3, 0.05, 0.2, 0.3, 0.465, 0.0, { r: 0.006 }); k.box('blackP', 0.05, 0.012, 0.16, -0.35, 0.446, 0.12, { r: 0.006 }); k.block(0, 0, 1.1, 0.42); }); aoBlob(g, -W / 2 + 0.25, 0, tz, 0.6, 1.3, 0.5);
      out.tv = placeTV(g, k, 'flat', -W / 2 + 0.25, 0.44, tz, Math.PI / 2, { w: 0.8, h: 0.47, stand: true }); out.tvAt = [-W / 2 + 1.6, tz];
      k.at(-0.55, 0, tz + 0.1, -Math.PI / 2, () => armchair(k)); aoBlob(g, -0.55, 0, tz + 0.1, 0.95, 0.95, 0.5);
      k.def('rug', std({ map: fabricTex('stripe', '#8a2a2a', '#c9a227', '#1f3a5a'), roughness: 0.95 })); k.box('rug', 1.3, 0.008, 1.9, 0.4, 0.004, 0.1, { uv: 0.8 });
      k.at(room.R.doorX - 0.7, 0, D / 2 - 0.35, -0.2, () => RP.slippers(k, '#3a2a1e'));
      out.bedAt = [-W / 2 + 1.4, -D / 2 + 1.2]; out.bedLook = new THREE.Vector3(-W / 2 + 0.58, 0.5, -D / 2 + 1.05); out.wake = [-W / 2 + 1.35, -D / 2 + 1.4, -Math.PI / 2];
      out.warm = [bx - 0.06 + 0.13, 0.85, bz - 0.04, 0.9];
      return out;
    },
  },
};

function fabricLike(tex) { return tex; }
function flameMesh(g, at) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.026, 8), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); m.geometry.translate(0, 0.013, 0); m.position.copy(at).add(new THREE.Vector3(0, 0.008, 0)); g.add(m); return m; }
function posterTex(kind) { return canvasTex('poster' + kind, 256, kind === 'race' ? 184 : 340, (a, w, h) => { if (kind === 'race') { const bg = a.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#101820'); bg.addColorStop(1, '#3a4a5a'); a.fillStyle = bg; a.fillRect(0, 0, w, h); a.fillStyle = '#d8202a'; a.beginPath(); a.moveTo(30, 120); a.lineTo(70, 92); a.lineTo(170, 88); a.lineTo(220, 110); a.lineTo(226, 128); a.lineTo(24, 132); a.fill(); a.fillStyle = '#111'; for (const x of [62, 190]) { a.beginPath(); a.arc(x, 132, 15, 0, 7); a.fill(); a.fillStyle = '#888'; a.beginPath(); a.arc(x, 132, 6, 0, 7); a.fill(); a.fillStyle = '#111'; } a.fillStyle = '#9cc8f0'; a.fillRect(95, 94, 60, 14); a.fillStyle = '#fff'; a.font = 'bold 22px sans-serif'; a.textAlign = 'center'; a.fillText('SPEED WEEK', w / 2, 40); a.font = '12px sans-serif'; a.fillText('Hill Climb · Kandy Road', w / 2, 60); for (let i = 0; i < 10; i++) { a.fillStyle = 'rgba(255,255,255,0.3)'; a.fillRect(0, 150 + i * 3, w * (0.3 + i * 0.05), 1); } } else { a.fillStyle = '#f2c230'; a.fillRect(0, 0, w, h); a.fillStyle = '#111'; a.beginPath(); a.arc(70, 230, 40, 0, 7); a.arc(190, 230, 40, 0, 7); a.fill(); a.fillStyle = '#f2c230'; a.beginPath(); a.arc(70, 230, 28, 0, 7); a.arc(190, 230, 28, 0, 7); a.fill(); a.strokeStyle = '#111'; a.lineWidth = 10; a.beginPath(); a.moveTo(70, 230); a.lineTo(120, 160); a.lineTo(190, 230); a.moveTo(120, 160); a.lineTo(170, 150); a.stroke(); a.fillStyle = '#111'; a.font = 'bold 34px sans-serif'; a.textAlign = 'center'; a.fillText('RIDE', w / 2, 70); a.font = 'bold 18px sans-serif'; a.fillText('SAFE · RIDE FAR', w / 2, 100); a.font = '12px sans-serif'; a.fillText('Colombo Riders Club', w / 2, 320); } speckle2(a, w, h); }); }
function speckle2(a, w, h) { const img = a.getImageData(0, 0, w, h), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; } a.putImageData(img, 0, 0); }
function certTex() { return canvasTex('cert', 288, 216, (a, w, h) => { a.fillStyle = '#fbf6e8'; a.fillRect(0, 0, w, h); a.strokeStyle = '#a8862a'; a.lineWidth = 6; a.strokeRect(8, 8, w - 16, h - 16); a.lineWidth = 1.5; a.strokeRect(16, 16, w - 32, h - 32); a.fillStyle = '#2a2a2a'; a.textAlign = 'center'; a.font = 'bold 18px Georgia, serif'; a.fillText('Certificate of Completion', w / 2, 56); a.font = '12px Georgia, serif'; a.fillText('This is to certify that', w / 2, 84); a.font = 'italic bold 20px Georgia, serif'; a.fillText('David Perera', w / 2, 112); a.font = '12px Georgia, serif'; a.fillText('has completed the course in', w / 2, 136); a.font = 'bold 13px Georgia, serif'; a.fillText('Electronics & Appliance Repair', w / 2, 156); a.fillStyle = '#b8141c'; a.beginPath(); a.arc(60, 178, 16, 0, 7); a.fill(); a.fillStyle = '#2a2a2a'; a.fillRect(180, 182, 80, 1); a.font = '9px sans-serif'; a.fillText('Course Director', 220, 194); }); }
function schematicTex() { return canvasTex('schem', 256, 160, (a, w, h) => { a.fillStyle = '#0c1a2a'; a.fillRect(0, 0, w, h); a.strokeStyle = '#5fd0ff'; a.lineWidth = 1.2; const r = rnd(91); for (let i = 0; i < 26; i++) { const x = r() * w, y = 20 + r() * (h - 30); a.beginPath(); a.moveTo(x, y); a.lineTo(x + (r() - 0.5) * 80, y); a.lineTo(x + (r() - 0.5) * 80, y + (r() - 0.5) * 40); a.stroke(); } a.fillStyle = '#ffd25a'; for (let i = 0; i < 12; i++) a.fillRect(r() * w, 20 + r() * (h - 30), 10, 6); a.fillStyle = '#1e3a5a'; a.fillRect(0, 0, w, 14); a.fillStyle = '#cfe8ff'; a.font = '9px monospace'; a.fillText('amp_board_rev3.sch', 6, 10); }); }
// radio bodies (the lit dial + needle are added by dialRadio)
function transistorRadio(k) { k.def('leather', std({ map: canvasTex('leather', 128, 128, (a, w, h) => { a.fillStyle = '#5a3420'; a.fillRect(0, 0, w, h); speckleLocal(a, w, h, 22); }), roughness: 0.7 })); k.box('leather', 0.24, 0.15, 0.065, 0, 0.075, 0, { r: 0.018 }); k.def('grilleT', std({ map: canvasTex('grilleT', 128, 128, (a, w, h) => { a.fillStyle = '#c8c8c0'; a.fillRect(0, 0, w, h); a.fillStyle = '#2a2a2a'; for (let x = 4; x < w; x += 7) for (let y = 4; y < h; y += 7) { a.beginPath(); a.arc(x, y, 2.2, 0, 7); a.fill(); } }), metalness: 0.6, roughness: 0.4 })); k.box('grilleT', 0.11, 0.1, 0.004, -0.055, 0.07, 0.033); k.box('chrome', 0.12, 0.03, 0.004, 0.055, 0.085, 0.032); for (const x of [0.03, 0.08]) k.cyl('greyP', 0.011, 0.011, 0.012, x, 0.035, 0.035, { rx: Math.PI / 2, seg: 16 }); k.cyl('chrome', 0.003, 0.002, 0.34, 0.1, 0.3, -0.02, { rz: -0.35, seg: 6 }); k.sph('chrome', 0.005, 0.158, 0.46, -0.02); k.tube('leather', [[-0.11, 0.12, 0], [-0.08, 0.2, 0], [0.08, 0.2, 0], [0.11, 0.12, 0]], 0.006, { n: 12 }); }
function boombox(k) { k.box('blackP', 0.42, 0.22, 0.13, 0, 0.11, 0, { r: 0.02 }); for (const sx of [-1, 1]) { k.torus('greyP', 0.065, 0.008, sx * 0.13, 0.1, 0.066, { ts: 28 }); k.cyl('rubber', 0.06, 0.03, 0.03, sx * 0.13, 0.1, 0.058, { rx: Math.PI / 2, seg: 24 }); k.sph('greyP', 0.018, sx * 0.13, 0.1, 0.062, { sz: 0.5 }); } k.box('greyP', 0.1, 0.07, 0.006, 0, 0.08, 0.066, { r: 0.004 }); k.tube('chrome', [[-0.17, 0.2, 0], [-0.15, 0.27, 0], [0.15, 0.27, 0], [0.17, 0.2, 0]], 0.008, { n: 14 }); for (let i = 0; i < 4; i++) k.box('greyP', 0.018, 0.008, 0.02, -0.03 + i * 0.02, 0.222, 0.02); }
function valveRadio(k) { k.def('walnut', std({ map: woodTex('walnut', '#5a3a22', '#2a180c', { seed: 29 }), roughness: 0.35 })); k.def('grilleC', std({ map: fabricTex('check', '#b89a6a', '#8a6a3a', '#c9b080'), roughness: 0.95 })); k.box('walnut', 0.44, 0.22, 0.22, 0, 0.11, 0, { r: 0.02 }); k.cyl('walnut', 0.11, 0.11, 0.44, 0, 0.22, 0, { rz: Math.PI / 2, t0: 0, tl: Math.PI, seg: 24, sz: 1 }); k.box('grilleC', 0.36, 0.1, 0.004, 0, 0.1, 0.111); for (let i = 0; i < 5; i++) k.box('walnut', 0.006, 0.1, 0.01, -0.12 + i * 0.06, 0.1, 0.114); for (const x of [-0.15, 0.15]) k.cyl('brass', 0.016, 0.016, 0.02, x, 0.03, 0.116, { rx: Math.PI / 2, seg: 18 }); k.box('brass', 0.23, 0.035, 0.004, 0, 0.205, 0.11); for (const s of [-1, 1]) k.box('rubber', 0.04, 0.012, 0.04, s * 0.17, -0.004, 0.06); }
function officeChair(k) { k.def('chairF', std({ color: 0x1e2226, roughness: 0.85 })); k.box('chairF', 0.48, 0.08, 0.46, 0, 0.48, 0, { r: 0.03 }); k.box('chairF', 0.44, 0.5, 0.06, 0, 0.82, -0.23, { r: 0.03, rx: 0.1 }); k.cyl('chrome', 0.025, 0.025, 0.3, 0, 0.3, 0, { seg: 12 }); k.cyl('blackP', 0.04, 0.04, 0.08, 0, 0.42, 0, { seg: 12 }); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; k.box('blackP', 0.3, 0.03, 0.04, Math.sin(a) * 0.15, 0.1, Math.cos(a) * 0.15, { ry: a + Math.PI / 2 }); k.sph('rubber', 0.028, Math.sin(a) * 0.3, 0.03, Math.cos(a) * 0.3); } for (const s of [-1, 1]) { k.box('blackP', 0.04, 0.02, 0.26, s * 0.26, 0.66, 0.0, { r: 0.008 }); k.box('blackP', 0.03, 0.16, 0.03, s * 0.26, 0.57, -0.06); } k.block(0, 0, 0.6, 0.6); }
function armchair(k) { k.box('teak', 0.8, 0.1, 0.78, 0, 0.18, 0, { r: 0.02 }); for (const s of [-1, 1]) for (const z of [-1, 1]) k.cyl('teak', 0.022, 0.016, 0.14, s * 0.36, 0.07, z * 0.34, { seg: 8 }); k.box('sofa', 0.62, 0.14, 0.62, 0, 0.3, 0.06, { r: 0.05, seg: 3 }); k.box('sofa', 0.66, 0.5, 0.16, 0, 0.52, -0.31, { r: 0.06, seg: 3, rx: 0.12 }); for (const s of [-1, 1]) k.box('sofa', 0.12, 0.26, 0.74, s * 0.36, 0.36, 0, { r: 0.05, seg: 3 }); k.block(0, 0, 0.82, 0.8); }
function speckleLocal(a, w, h, amt) { const img = a.getImageData(0, 0, w, h), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; } a.putImageData(img, 0, 0); }
void woodTex;
