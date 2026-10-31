// BUSTED — cinematic arrest sequence (original design). Plays whenever the police take the player into custody:
//   'grab'   — officers caught up with a suspect who stood still: kneel, hands on the head, cuffed from behind
//   'tackle' — an officer brought a running suspect down: face-down, hands pulled behind the back, cuffed on the ground
//   'shot'   — the suspect was brought down by police gunfire (non-graphic): collapses, officers close in with rifles up, cuffed
// Three camera set-ups with real cuts: a low-angle slow-motion impact shot, an orbit around the cuffing, and a crane up and
// away over the scene. Letterbox bars, a desaturating grade, red/blue light-bar wash from the edges, the BUSTED title
// slamming in letter by letter, a trilingual custody line, the officer's words and the radio call as subtitles in the
// bottom bar, then a custody record card with a mugshot captured from the game camera. Skippable after 3 s.
// The penalties themselves are applied by PoliceResponse.arrest() after the sequence (fade to black).
import * as THREE from 'three';
import { Audio } from '../audio/Audio.js';
import { clamp, lerp } from '../core/math.js';

const sm = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const LINES = {
  grab: { who: 'Police officer', si: 'බිම දණ ගහන්න! අත් දෙක ඔළුව උඩ තියන්න!', tr: 'Down on your knees! Both hands on your head!' },
  tackle: { who: 'Police officer', si: 'හොල්ලන්න එපා!', tr: "Don't move!" },
  shot: { who: 'Police officer', en: 'Suspect down! Call 1990 — get an ambulance here!' },
};
const RADIO = { grab: 'Control, Unit {u}. One in custody, no injuries. Bringing him in.', tackle: 'Control, Unit {u}. Suspect tackled and detained. Bringing him in.', shot: 'Control, Unit {u}. Suspect wounded and detained. Ambulance requested to the scene.' };

export class BustedCinematic {
  constructor(g, police, { kind = 'grab', officer, info }) {
    this.g = g; this.p = police; this.kind = kind; this.o = officer; this.info = info; this.rT = 0; this.sT = 0; this.ev = new Set(); this.done = false;
    this.c = kind === 'shot' ? 1.2 : 0; this.fadeAt = 7.9 + this.c; this.end = this.fadeAt + 0.95;
    this.promise = new Promise((res) => (this._res = res));
  }
  // ---------------------------------------------------------------- setup
  start() {
    const g = this.g, P = g.player, cam = g.camera; this.cam0 = { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
    this.py = P.yaw; this.prevSlow = g.timeSlow || 1; P.control = false; P.camOverride = true; this.hudWas = !g.hud.root.classList.contains('hidden'); g.hud.show(false);
    if (Audio.ctx && Audio.bus) { this.ambWas = Audio.bus.amb.gain.value; Audio.bus.amb.gain.setTargetAtTime(this.ambWas * 0.35, Audio.ctx.currentTime, 0.2); }
    this.mug = this.captureMugshot(); this.buildOverlay();
    if (typeof window !== 'undefined' && window.addEventListener) { this.onKey = (e) => { if (e.code === 'Enter' || e.code === 'Space' || e.code === 'Escape' || e.code === 'NumpadEnter') { this.skipReq = true; e.stopPropagation?.(); } }; window.addEventListener('keydown', this.onKey, true); }
    const A = P.ch.anim; if (this.kind === 'grab') A.set('handsup'); else if (this.kind === 'tackle') A.set('tackled'); else A.set('collapse');
    if (this.kind !== 'grab') { this.sfxImpact(); this.flash(0.12); }
    const o = this.o; if (o) { o.cuffing = true; if (this.kind === 'grab') o.ch.anim.set('point'); else if (this.kind === 'tackle' && o.ch.anim.action !== 'tackle') o.ch.anim.set('tackle'); }
    this.craneA = this.pickCrane();
    for (const q of this.p.foot) if (q !== o && q.mode === 'foot') { q.cineAim = true; q.sees = true; }
    this.say(LINES[this.kind]);
  }
  captureMugshot() {
    const g = this.g, R = g.renderer; if (!R || !R.domElement || typeof document === 'undefined') return null;
    try {
      const P = g.player, h = P.ch.bones.head; P.ch.root.updateMatrixWorld(true); const hp = h.getWorldPosition(new THREE.Vector3()); hp.y += 0.03; const f = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
      const W = R.domElement.width, H = R.domElement.height; const c = new THREE.PerspectiveCamera(17, W / H, 0.05, 60); c.position.copy(hp).addScaledVector(f, 1.35); c.position.y += 0.02; c.lookAt(hp); c.updateMatrixWorld();
      // booking photo: shoot at the normal exposure, measure the face area, and re-shoot brighter only if it came out
      // genuinely dark (night, deep shade). Exposure is a uniform, so the re-shoot costs no shader rebuild.
      const exp0 = R.toneMappingExposure; const out = document.createElement('canvas'); out.width = 240; out.height = 300; const x = out.getContext('2d'); const ch = H * 0.62, cw = ch * 0.8;
      const shoot = (e) => { R.toneMappingExposure = exp0 * e; R.setRenderTarget(null); R.render(g.scene, c); x.drawImage(R.domElement, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, 240, 300); };
      const meter = () => { const im = x.getImageData(60, 60, 120, 150); let sum = 0; for (let i = 0; i < im.data.length; i += 16) sum += im.data[i] * 0.3 + im.data[i + 1] * 0.59 + im.data[i + 2] * 0.11; return sum / (im.data.length / 16) / 255; };
      try { shoot(1); const mean = meter(); this.mugMean = mean; if (mean < 0.2) shoot(clamp(0.3 / Math.max(0.02, mean), 1, 5)); } finally { R.toneMappingExposure = exp0; }
      return out.toDataURL('image/jpeg', 0.85);
    } catch (e) { return null; }
  }
  buildOverlay() {
    if (typeof document === 'undefined' || !document.createElement) return; const root = document.createElement('div'); root.className = 'busted'; const I = this.info;
    const word = 'BUSTED'.split('').map((ch, i) => `<span style="--i:${i}">${ch}</span>`).join('');
    const stars = '★'.repeat(I.lv) + '<i>' + '★'.repeat(5 - I.lv) + '</i>';
    root.innerHTML = `<div class="bz-grade"></div><div class="bz-strobe l"></div><div class="bz-strobe r"></div><div class="bz-bar top"></div><div class="bz-bar bot"><div class="bz-sub"></div></div>
      <div class="bz-title"><div class="bz-word">${word}</div><div class="bz-rule"></div><div class="bz-line"><span class="si">අත්අඩංගුවට</span><b>·</b><span class="ta">கைது</span><b>·</b><span class="en">IN POLICE CUSTODY</span></div><div class="bz-stars">${stars}</div></div>
      <div class="bz-card"><div class="bz-mug">${this.mug ? `<img src="${this.mug}" alt="">` : '<div class="bz-nomug"></div>'}<div class="bz-chart">${[190, 180, 170, 160, 150].map((v) => `<span>${v}</span>`).join('')}</div><div class="bz-plate">${esc(I.name)}<br>${esc(I.caseNo)}</div></div>
        <div class="bz-rec"><div class="bz-head">CUSTODY RECORD · COLOMBO DIVISION</div><div class="bz-rows"></div></div></div>
      <div class="bz-flash"></div><div class="bz-black"></div><div class="bz-skip">Press <kbd>Enter</kbd> / <kbd>Space</kbd> to skip</div>`;
    if (typeof root.querySelector !== 'function') return; // headless (tests): no overlay
    (this.g.ui || document.body).appendChild(root); this.el = root; this.rows = root.querySelector('.bz-rows'); (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(() => root.classList.add('on'));
    this.rowData = I.rows; this.canvas = this.g.renderer && this.g.renderer.domElement;
  }
  // ---------------------------------------------------------------- per frame (dt = scaled game dt)
  update(dt) {
    if (this.done) return; const g = this.g; const slow = g.timeSlow || 1; const real = dt / slow; this.rT += real; this.sT += dt; const rT = this.rT;
    // slow motion through the impact, easing back to real time
    g.timeSlow = rT < 0.12 ? 1 : rT < 1.7 ? lerp(g.timeSlow || 1, 0.33, 0.25) : rT < 2.3 ? lerp(0.33, 1, sm((rT - 1.7) / 0.6)) : 1;
    if (rT > 3 && rT < this.fadeAt - 0.2 && this.skipReq) { this.rT = this.fadeAt - 0.01; this.skipped = true; }
    this.script(dt); this.actors(dt); this.camera(real); this.overlay(real);
    if (this.rT >= this.end) { this.done = true; this._res(); }
  }
  at(name, t) { if (this.rT >= t && !this.ev.has(name)) { this.ev.add(name); return true; } return false; }
  script() {
    const P = this.g.player, A = P.ch.anim, o = this.o, c = this.c;
    if (this.kind === 'grab') { if (this.at('kneel', 0.55)) A.set('kneel'); if (this.at('cuffed', 2.7)) A.set('kneelCuffed'); if (this.at('oc', 2.45) && o) o.ch.anim.set('cuffStand'); }
    if (this.kind === 'tackle') { if (this.at('oc', 0.95) && o) o.ch.anim.set('cuffKneel'); if (this.at('prone', 2.4)) A.set('prone'); }
    if (this.kind === 'shot') { if (this.at('prone', 2.9)) A.set('prone'); if (o && this.rT > 3.2 && this.arrived && this.at('oc', 0)) { o.ch.anim.set('cuffKneel'); this.cuffAt = this.rT; } }
    const cuff0 = this.kind === 'grab' ? 2.85 : this.kind === 'tackle' ? 1.8 : (this.cuffAt ?? 99) + 0.4; if (this.at('cuff1', cuff0)) this.sfxCuff(); if (this.at('cuff2', cuff0 + 0.42)) this.sfxCuff();
    if (this.at('slam', 0.95)) { this.sfxSlam(); this.flash(0.16); this.shakeT = 0; }
    if (this.at('radio', 3.9 + c)) { Audio.radioBlip?.(); const u = (o && o.unit && o.unit.id) || 1; this.say({ who: `Police radio · Unit ${u}`, en: RADIO[this.kind].replace('{u}', u) }); }
    if (this.rT < 2.2 && this.kind !== 'grab') { const k = Math.floor(this.rT / 0.78); if (this.at('beat' + k, k * 0.78 + 0.25)) this.sfxBeat(); }
  }
  // officers during the sequence: the arresting officer is choreographed; the others hold their positions, rifles on the suspect
  actors(dt) {
    const P = this.g.player, o = this.o, py = this.py; const f = { x: Math.sin(py), z: Math.cos(py) }, r = { x: Math.cos(py), z: -Math.sin(py) };
    const hips = P.ch.bones.hips.getWorldPosition(new THREE.Vector3());
    if (o) { let tx = o.x, tz = o.z, ty = null, sp = 0;
      if (this.kind === 'grab') { if (this.rT > 1.2) { tx = P.x - f.x * 0.62 - r.x * 0.06; tz = P.z - f.z * 0.62 - r.z * 0.06; ty = py; } else ty = Math.atan2(P.x - o.x, P.z - o.z); }
      else if (this.kind === 'tackle') { tx = hips.x - r.x * 0.4; tz = hips.z - r.z * 0.4; ty = Math.atan2(hips.x - tx, hips.z - tz); }
      else { if (this.rT > 1.2) { tx = hips.x - r.x * 0.4; tz = hips.z - r.z * 0.4; } ty = Math.atan2(hips.x - o.x, hips.z - o.z); }
      const d = Math.hypot(tx - o.x, tz - o.z); if (this.kind === 'shot' && this.rT > 1.2 && this.walkV === undefined) this.walkV = clamp(d / 1.8, 1.4, 3.4); // reach him by ~3 s (a rifle-up jog from far)
      const maxV = this.kind === 'tackle' ? (this.rT < 0.9 ? 2.6 : 0.8) : this.kind === 'shot' ? this.walkV || 1.5 : 1.5; this.arrived = d < 0.12;
      if (d > 0.03) { const st = Math.min(d, maxV * dt); o.x += (tx - o.x) / d * st; o.z += (tz - o.z) / d * st; sp = this.kind === 'tackle' ? 0 : st / Math.max(dt, 1e-4); if (sp > 0.2 && this.kind !== 'tackle') ty = Math.atan2(tx - o.x, tz - o.z) || ty; }
      if (ty !== null) o.yaw += angDiff(ty, o.yaw) * Math.min(1, dt * 6); if (d < 0.05 && this.kind === 'grab' && this.rT > 1.2) o.yaw += angDiff(py, o.yaw) * Math.min(1, dt * 6);
      o.y = this.g.collision.groundAt ? this.g.collision.groundAt(o.x, o.z, o.y + 0.4) : o.y; this.p.ff?.pose(o, dt); o.ch.anim.update(dt, sp > 0.2 ? Math.min(3.4, sp) : 0); this.p.placeOfficer(o);
    }
    const night = !!(this.p.ff && this.p.ff.night() > 0.45);
    for (const q of this.p.foot) { if (q === o || q.mode !== 'foot') continue; const want = Math.atan2(hips.x - q.x, hips.z - q.z); q.yaw += angDiff(want, q.yaw) * Math.min(1, dt * 4); let sp = 0;
      const d = Math.hypot(hips.x - q.x, hips.z - q.z); if (d > 6 && this.rT > 0.8) sp = this.p.moveTo(q, hips.x, hips.z, 1.6, dt); else if (!q.rifle || q.rp.draw < 0.5) { if (q.ch.anim.action !== 'point') q.ch.anim.set('point'); }
      q.cb = q.cb || {}; this.p.ff?.pose(q, dt); if (night && !q.rifle?.userData.torch.visible && !(q.rp && q.rp.draw > 0.5)) { if (q.ch.anim.action !== 'torch') q.ch.anim.set('torch'); q.ch.anim.torchSweep = 0; } q.ch.anim.update(dt, sp); this.p.placeOfficer(q); if (night) this.lightSuspect(q, hips); }
  }
  // night: a covering officer keeps his torch on the suspect (rifle-mounted when the rifle is up, else the hand torch)
  lightSuspect(q, hips) {
    const ff = this.p.ff; if (!ff) return; const rifleUp = q.rifle && q.rp && q.rp.draw > 0.5; let pos;
    if (rifleUp) { q.rifle.userData.torch.visible = true; q.rifle.updateWorldMatrix(true, false); pos = q.rifle.userData.torchPos.clone().applyMatrix4(q.rifle.matrixWorld); }
    else { q.torchOn = true; q.sweep = 0; ff.placeTorch(q); const last = ff.sources && ff.sources[ff.sources.length - 1]; if (last && last.o === q) { last.dir = hips.clone().sub(last.pos).normalize(); return; } pos = new THREE.Vector3(q.x, (q.y || 0) + 1.2, q.z); }
    (ff.sources || (ff.sources = [])).push({ pos, dir: hips.clone().sub(pos).normalize(), o: q }); this.lit = true;
  }
  // ---------------------------------------------------------------- camera
  camera(real) {
    const g = this.g, cam = g.camera, P = g.player, col = g.collision; const py = this.py, rT = this.rT, c = this.c;
    const hips = P.ch.bones.hips.getWorldPosition(new THREE.Vector3()); const gy = col.groundAt ? col.groundAt(P.x, P.z, P.y + 0.5) : P.y;
    const fx = this.focus || (this.focus = hips.clone()); fx.lerp(hips, Math.min(1, real * 5)); const o = this.o;
    const mid = o ? new THREE.Vector3((fx.x + o.x) / 2, fx.y, (fx.z + o.z) / 2) : fx.clone();
    let pos, look, fov; const T2 = 2.1, T3 = 5.4 + c;
    if (rT < T2) { const k = sm(rT / T2); const a = py + 0.85; const rad = lerp(3.1, 2.25, k); pos = new THREE.Vector3(fx.x + Math.sin(a) * rad, gy + 0.42 + 0.1 * k, fx.z + Math.cos(a) * rad); look = fx.clone(); look.y += 0.22; fov = lerp(50, 40, k); }
    else if (rT < T3) { const k = sm((rT - T2) / (T3 - T2)); const a = py + 2.25 + 1.25 * k; const rad = 2.3; pos = new THREE.Vector3(mid.x + Math.sin(a) * rad, gy + lerp(1.25, 0.78, k), mid.z + Math.cos(a) * rad); look = mid.clone(); look.y = gy + (this.kind === 'grab' ? 0.85 : 0.45); fov = 38; }
    else { const k = sm((rT - T3) / 3.0); const a = (this.craneA ?? py - 0.6) - 0.5 * k; const rad = lerp(3.4, 4.4, k); pos = new THREE.Vector3(fx.x + Math.sin(a) * rad, gy + lerp(2.1, 8.5, k), fx.z + Math.cos(a) * rad); look = fx.clone(); fov = lerp(44, 48, k);
      const dx = look.x - pos.x, dz = look.z - pos.z, dl = Math.hypot(dx, dz) || 1; const kc = sm((rT - T3 - 0.1) / 1.4) * 2.2; look.x += (-dz / dl) * kc; look.z += (dx / dl) * kc; } // screen-right shift of the aim point → suspect in the left third, clear of the card
    // gameplay camera → first shot: a quick whip
    if (rT < 0.45) { const k = sm(rT / 0.45); pos.lerp(this.cam0.pos, 1 - k); }
    // keep the lens out of walls: pull in towards the subject
    const t = col.raycast(look.x, look.y, look.z, pos.x, pos.y, pos.z, 0.25, false, 1.0); if (t < 1) pos.lerpVectors(look, pos, Math.max(0.15, t * 0.9)); pos.y = Math.max(pos.y, (col.groundAt ? col.groundAt(pos.x, pos.z, pos.y) : 0) + 0.2);
    if (this.shakeT !== undefined) { this.shakeT += real; const s = 0.07 * Math.exp(-this.shakeT * 5); pos.x += Math.sin(rT * 71) * s; pos.y += Math.sin(rT * 53 + 1) * s; pos.z += Math.sin(rT * 61 + 2) * s; }
    cam.position.copy(pos); cam.lookAt(look); if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    this.camPos = pos; this.camLook = look;
  }
  // crane direction: the first of eight bearings whose whole rise (low → 8.5 m up) has a clear view of the suspect through
  // the real scene geometry (shop canopies, balconies and trees are not colliders, so the collision ray alone cannot tell)
  pickCrane() {
    const g = this.g, root = g.world && g.world.root, P = g.player; const def = this.py - 0.6; if (!root || !P.ch.bones.hips) return def;
    try { P.ch.root.updateMatrixWorld(true); const f = P.ch.bones.hips.getWorldPosition(new THREE.Vector3()); f.y += 0.3; const gy = g.collision.groundAt ? g.collision.groundAt(P.x, P.z, P.y + 0.5) : P.y;
      const R = new THREE.Raycaster(); let best = def, bs = -1;
      for (let k = 0; k < 8; k++) { const a = def + k * Math.PI / 4; let clear = 0;
        for (const [h, rad, da] of [[2.1, 3.4, 0], [5.2, 4.0, -0.25], [8.5, 4.4, -0.5]]) { const p = new THREE.Vector3(f.x + Math.sin(a + da) * rad, gy + h, f.z + Math.cos(a + da) * rad); const d = p.sub(f); const L = d.length(); R.set(f, d.normalize()); R.far = L; if (!R.intersectObject(root, true).some((h2) => h2.object.visible !== false)) clear++; }
        if (clear > bs) { bs = clear; best = a; } if (bs === 3) break; }
      this.craneClear = bs; return best; } catch (e) { return def; }
  }
  // ---------------------------------------------------------------- overlay timing / grade
  overlay() {
    const rT = this.rT, el = this.el; const c = this.c;
    if (this.canvas) { const k = sm(rT / 0.9) * (1 - sm((rT - this.fadeAt - 0.6) / 0.3)); this.canvas.style.filter = k > 0.001 ? `saturate(${(1 - 0.62 * k).toFixed(3)}) contrast(${(1 + 0.16 * k).toFixed(3)}) brightness(${(1 - 0.06 * k).toFixed(3)})` : ''; }
    if (!el) return;
    if (this.at('t-title', 0.95)) el.classList.add('title');
    if (this.at('t-line', 1.55)) el.classList.add('line');
    if (this.at('t-small', 4.7 + c)) el.classList.add('small');
    if (this.at('t-card', 5.6 + c)) el.classList.add('card');
    if (this.at('t-skip', 3.0)) el.classList.add('skip');
    if (rT > 5.9 + c && this.rows && this.rowData) { const n = Math.min(this.rowData.length, Math.floor((rT - 5.9 - c) / 0.22) + 1); if (n !== this.rowsShown) { this.rowsShown = n; this.rows.innerHTML = this.rowData.slice(0, n).map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join(''); Audio.ctx && Audio.noise(0.02, { f: 3000, q: 4, vol: 0.05 }); } }
    if (this.at('t-black', this.fadeAt)) el.classList.add('black');
  }
  flash(d) { if (!this.el) return; const f = this.el.querySelector('.bz-flash'); f.style.transition = 'none'; f.style.opacity = '0.85'; requestAnimationFrame(() => { f.style.transition = `opacity ${d * 3}s ease-out`; f.style.opacity = '0'; }); }
  say(l) { if (!l) return; if (this.el) { const s = this.el.querySelector('.bz-sub'); s.innerHTML = `<em>${esc(l.who)}</em>${l.si ? `<span class="si">${esc(l.si)}</span><span class="tr">${esc(l.tr)}</span>` : `<span>${esc(l.en)}</span>`}`; s.classList.remove('show'); void s.offsetWidth; s.classList.add('show'); } Audio.talkBlip?.(l.si ? 'si' : 'en'); this.lastLine = l; }
  // ---------------------------------------------------------------- sound design (synthesised)
  sfxImpact() { if (!Audio.ctx) return; Audio.noise(0.35, { f: 320, q: 0.7, type: 'lowpass', vol: 0.5, attack: 0.002 }); Audio.tone(52, 1.0, { type: 'sine', vol: 0.45, attack: 0.003, glide: 30 }); Audio.noise(0.12, { f: 1400, q: 1, vol: 0.18, attack: 0.001 }); }
  sfxSlam() { if (!Audio.ctx) return; Audio.tone(40, 1.3, { type: 'sine', vol: 0.6, attack: 0.002, glide: 27 }); Audio.noise(0.55, { f: 850, q: 0.6, type: 'lowpass', vol: 0.5, attack: 0.001 }); Audio.tone(2150, 0.7, { type: 'triangle', vol: 0.05, attack: 0.002, verb: true }); Audio.tone(3240, 0.45, { type: 'triangle', vol: 0.035, attack: 0.002, verb: true }); Audio.noise(1.2, { f: 220, q: 0.5, type: 'lowpass', vol: 0.18, when: 0.05, buf: Audio.brownBuf }); }
  sfxCuff() { if (!Audio.ctx) return; for (let i = 0; i < 6; i++) Audio.noise(0.012, { f: 4200 + i * 120, q: 8, vol: 0.13, when: i * 0.024, attack: 0.001 }); Audio.tone(2650, 0.09, { type: 'triangle', vol: 0.05, when: 0.15 }); }
  sfxBeat() { if (!Audio.ctx) return; Audio.tone(58, 0.14, { type: 'sine', vol: 0.4, attack: 0.004 }); Audio.tone(50, 0.16, { type: 'sine', vol: 0.3, attack: 0.004, when: 0.2 }); }
  // ---------------------------------------------------------------- teardown
  dispose() {
    const g = this.g, P = g.player, cam = g.camera; g.timeSlow = this.prevSlow === undefined ? 1 : 1; P.camOverride = false; cam.fov = this.cam0 ? this.cam0.fov : cam.fov; cam.updateProjectionMatrix();
    if (this.canvas) this.canvas.style.filter = ''; if (this.el) { const el = this.el; el.classList.add('out'); setTimeout(() => el.remove(), 900); }
    if (this.hudWas) g.hud.show(true); if (Audio.ctx && this.ambWas !== undefined) Audio.applyVolumes?.();
    for (const q of this.p.foot) { q.cineAim = false; if (this.lit) { q.torchOn = false; if (q.rifle) q.rifle.userData.torch.visible = false; if (q.torchM) q.torchM.visible = false; if (q.ch.anim.action === 'torch') q.ch.anim.set(null); } } if (this.o) this.o.cuffing = false;
    if (this.onKey) window.removeEventListener('keydown', this.onKey, true);
  }
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
