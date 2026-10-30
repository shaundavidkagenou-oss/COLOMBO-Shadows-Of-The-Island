// Night watchman at Johns Private Girls' School (fictional school, adults only).
//
// 7 pm → 6 am the iron gates and the pedestrian wicket are locked. A watchman takes over from the day guard:
//   • patrols a fixed loop inside the compound (gate → inner drive → spine path → main-block corridor and back) with a
//     working flashlight: a real SpotLight held in his right hand (arm posed by two-bone IK), a visible lens and a faint
//     additive beam; at the corners he stops and sweeps the torch;
//   • some nights he dozes off on the plastic chair by the gate hut (seeded per night, so it is consistent on reloads):
//     seated pose from the seat solver, chin on chest, torch off, the odd snore;
//   • challenges anyone at the gate or wicket: a dialogue with choices. A credible reason gets you in (the wicket opens and
//     stays open until you leave the grounds); a weak or false reason, or a bribe, gets you refused. Two refusals and he
//     stops listening for the night. If he's asleep you can wake him (he denies he was sleeping);
//   • finds intruders inside on his rounds (torch cone + line of sight): explain yourself or be told to leave — ignore that
//     and he calls 119 (one wanted star).
// Leaving is always possible: the wicket opens from the inside.
import * as THREE from 'three';
import { Character } from './Character.js';
import { makeAppearance } from './Appearance.js';
import { Input } from '../core/Input.js';
import { clamp } from '../core/math.js';
import { SCHOOL } from '../world/JohnsSchool.js';
import { Settings } from '../core/Settings.js';

const NAME = 'Watchman';
const W = SCHOOL.wall, G = SCHOOL.gate, WK = SCHOOL.wicket;
const GATE_POST = { x: 271.0, z: 331.5 }, WICKET_POST = { x: 278.2, z: 331.5 };
export const CHAIR = { x: 261.5, z: 335.2, yaw: Math.PI }; // blue plastic chair beside the hut, facing the road
const ROUTE = [[261.6, 333.4], [268.9, 333.2], [300, 333.2], [321, 334.2], [300, 333.2], [268.9, 333.2], [268.9, 352], [268.9, 371.4], [296, 371.4], [321, 371.4], [296, 371.4], [268.9, 371.4], [268.9, 352], [268.9, 333.2]];
const SWEEP_AT = new Set([0, 3, 7, 9]);
const TORCH_IK = new THREE.Vector3(-0.17, -0.1, 0.36); // chest space: right hand forward at chest height
export const isNight = (h) => h >= 19 || h < 6;
export const inCompound = (x, z) => x > W[0] + 0.2 && x < W[1] - 0.2 && z > W[2] + 0.2 && z < W[3] - 0.2;
const atEntrance = (x, z) => z < W[2] - 0.1 && z > W[2] - 4.2 && x > G.x0 - 1.5 && x < WK.x1 + 1.5;
function hash01(n) { let t = (n * 2654435761) >>> 0; t ^= t >>> 15; t = Math.imul(t, 0x2c1b3c6d) >>> 0; t ^= t >>> 12; return (t >>> 0) / 4294967296; }
// per-night sleep plan (night key = the date the night started on)
export function sleepPlan(nk) { const a = hash01(nk * 31 + 7), b = hash01(nk * 31 + 11), c = hash01(nk * 31 + 13), d = hash01(nk * 31 + 17);
  const out = []; if (c < 0.75) { const s = 24 + 0.5 + a * 1.5; out.push([s, s + 1.2 + b * 1.8]); } if (d < 0.3) out.push([21.5 + a * 0.6, 22.3 + a * 0.6]); return out; }

export class SchoolGuard {
  constructor(life) {
    this.life = life; this.g = life.g; this.ch = null; this.mode = 'off'; this.night = null; this.strikes = 0; this.permit = false; this.wasInside = false;
    this.calledOut = false; this.leaveT = -1; this.snoreT = 0; this.awakeNight = null; this.t = 0; this.wp = 0; this.pause = 0; this.aim = new THREE.Vector3(0, 0, 1); this.log = [];
    // the torch: created once at load (adding a light later would recompile every material) and kept dark by day
    const L = (this.light = new THREE.SpotLight(0xfff0d6, 0, 26, 0.3, 0.55, 1.5)); L.castShadow = !!Settings.preset.shadows; if (L.castShadow) { L.shadow.mapSize.set(512, 512); L.shadow.camera.near = 0.2; L.shadow.camera.far = 26; L.shadow.bias = -0.0006; L.shadow.normalBias = 0.03; L.shadow.autoUpdate = false; } // the beam stops at walls (it used to light the classrooms through them)
    this.g.scene.add(L); this.g.scene.add(L.target);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.019, 0.2, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.45, metalness: 0.6 }));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02, 14), new THREE.MeshBasicMaterial({ color: 0xfff4dc })); lens.position.z = 0.101; body.add(lens); this.lens = lens;
    // faint volumetric beam: additive cone, bright at the lens, fading along its length and towards its silhouette
    const cone = new THREE.ConeGeometry(0.9, 7, 24, 1, true).translate(0, -3.5, 0).rotateX(-Math.PI / 2); // tip at the lens, opening along +z
    this.beam = new THREE.Mesh(cone, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color(0xffe9c4) }, uK: { value: 0.16 } },
      vertexShader: 'varying float vL; varying vec3 vN; varying vec3 vV; void main(){ vL = position.z / 7.0; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uK; varying float vL; varying vec3 vN; varying vec3 vV; void main(){ float along = pow(clamp(1.0 - vL, 0.0, 1.0), 2.2); float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); gl_FragColor = vec4(uCol * uK * along * edge, 1.0); }' }));
    this.beam.renderOrder = 5; this.torch = new THREE.Group(); this.torch.add(body); this.torch.add(this.beam); this.torch.visible = false; this.g.scene.add(this.torch);
  }
  note(s) { this.log.push(`${this.g.atmos.timeString || ''} ${s}`); if (this.log.length > 40) this.log.shift(); }
  nightKey(h) { const d = this.g.atmos.day; return h >= 19 ? d : d - 1; }
  asleepTime(h) { const nk = this.nightKey(h); if (this.awakeNight === nk) return false; const hh = h < 12 ? h + 24 : h; return sleepPlan(nk).some(([a, b]) => hh >= a && hh < b); }
  get present() { return !!this.ch; }
  // ---------------------------------------------------------------- wicket / gate requests (SchoolLife drives the leaves)
  wicketOpen(P, h) {
    if (!isNight(h)) return h >= 6 && h < 19; // daytime: visitors walk in and report to the hut
    if (P && inCompound(P.x, P.z) && Math.hypot(P.x - (WK.x0 + WK.x1) / 2, P.z - W[2]) < 3.2) return true; // always let people out
    return this.permit && P && !inCompound(P.x, P.z) ? Math.hypot(P.x - (WK.x0 + WK.x1) / 2, P.z - W[2]) < 6 : false;
  }
  // ---------------------------------------------------------------- cast
  spawn(h) {
    const L = this.life; const sleeping = this.asleepTime(h);
    const pos = sleeping ? CHAIR : { x: ROUTE[0][0], z: ROUTE[0][1] }; if (L.inView(pos.x, pos.z)) return;
    const ch = (this.ch = new Character(makeAppearance(619, { preset: 'm_security' }))); this.g.scene.add(ch.root); this.x = pos.x; this.z = pos.z; this.yaw = sleeping ? CHAIR.yaw : Math.PI / 2; this.wp = 0; this.pause = 2;
    this.mode = sleeping ? 'sleep' : 'patrol'; this.applyMode(); this.place(); for (let k = 0; k < 12; k++) this.animate(0.1, 0); this.note(`on duty (${this.mode})`);
  }
  despawn() { if (!this.ch) return; this.ch.root.parent?.remove(this.ch.root); this.ch.dispose?.(); this.ch = null; this.mode = 'off'; this.torch.visible = false; this.light.intensity = 0; }
  place() { const ch = this.ch; if (this.mode === 'sleep') { ch.root.position.set(CHAIR.x, this.life.groundAt(CHAIR.x, CHAIR.z) + 0.44, CHAIR.z); ch.root.rotation.y = CHAIR.yaw; } else { ch.root.position.set(this.x, this.life.groundAt(this.x, this.z), this.z); ch.root.rotation.y = this.yaw; } }
  applyMode() { const A = this.ch.anim;
    if (this.mode === 'sleep') { A.ik = null; A.set(null); A.sitIn({ x: 0, y: 0, z: 0, floor: -0.44, fz: 0.4, fx: 0.12, lean: 0.32, hands: 'lap', kind: 'sit' }, 1); }
    else { A.standUp(); A.ik = { R: TORCH_IK.clone(), qR: null, wR: 1, L: null }; } }
  animate(dt, speed) { const ch = this.ch; ch.anim.update(dt, speed); if (this.mode === 'sleep') { const b = ch.bones; b.neck.rotation.x += 0.32; b.head.rotation.x += 0.42; b.head.rotation.z += 0.12; } }
  // ---------------------------------------------------------------- per frame
  update(dt, h, P) {
    this.t += dt; const night = isNight(h); const g = this.g;
    if (night && this.night !== this.nightKey(h)) { this.night = this.nightKey(h); this.strikes = 0; this.permit = false; this.awakeNight = null; this.calledOut = false; }
    if (!night) { this.permit = false; if (this.ch && !this.life.inView(this.x, this.z)) this.despawn(); }
    else if (!this.ch && this.life.active) this.spawn(h);
    if (!this.ch) { this.light.intensity = 0; this.torch.visible = false; return; }
    if (g.director.active && this.mode !== 'talk') { this.torchUpdate(P); return; }
    const inside = inCompound(P.x, P.z) && !P.vehicle;
    // permit ends when you walk back out of the grounds
    if (this.permit && this.wasInside && !inside && !inCompound(P.x, P.z)) { this.permit = false; this.note('visitor left; wicket locked'); }
    this.wasInside = inside;
    let speed = 0; const want = this.asleepTime(h); if (this.mode === 'talk') this.yaw = this.ch.root.rotation.y;
    switch (this.mode) {
      case 'sleep': {
        if (!want) { this.wake(false); break; }
        if ((this.snoreT -= dt) <= 0) { this.snoreT = 7 + Math.random() * 6; if (Math.hypot(P.x - CHAIR.x, P.z - CHAIR.z) < 7 && !g.director.active) g.hud.subtitle(NAME, '(snoring)', '', 2); }
        break; }
      case 'patrol': case 'toChair': case 'toPost': case 'escort': {
        if (this.mode === 'patrol' && want && !this.permit) { this.mode = 'toChair'; this.path = this.pathTo(CHAIR.x, CHAIR.z - 0.6); }
        // someone at the gate: walk over to the inner post and challenge (only if nobody has been let in)
        if (this.mode === 'patrol' && !this.permit && atEntrance(P.x, P.z) && !P.vehicle && Math.hypot(P.x - 272, P.z - 330) < 9) { this.mode = 'toPost'; const post = P.x > 276.5 ? WICKET_POST : GATE_POST; this.path = this.pathTo(post.x, post.z); this.post = post; }
        // intruder seen on the rounds
        if ((this.mode === 'patrol' || this.mode === 'toChair') && inside && !this.permit && this.sees(P)) { this.mode = 'confront'; this.note('intruder seen'); g.hud.subtitle(NAME, 'Hey! You there — stop! How did you get in here?', '', 3); break; }
        if (this.mode === 'escort') { const d = Math.hypot(P.x - this.x, P.z - this.z); if (inside) this.escortIn = true; if ((!inside && this.escortIn) || d > 30) { this.mode = 'patrol'; this.escortIn = false; this.path = null; this.wp = this.nearestWp(); break; } if (!inside) { this.faceTo(P.x, P.z, dt); this.path = null; break; } if (d > 2.6) this.path = [[P.x - (P.x - this.x) / d * 2, P.z - (P.z - this.z) / d * 2]]; else this.path = null; }
        if (!this.path && this.mode === 'patrol') { if ((this.pause -= dt) > 0) break; this.wp = (this.wp + 1) % ROUTE.length; this.path = [ROUTE[this.wp]]; }
        if (this.path) { speed = this.walk(dt, this.mode === 'escort' ? 1.5 : 1.15); if (!this.path) this.arrive(); }
        break; }
      case 'post': {
        this.faceTo(P.x, P.z, dt);
        if (!atEntrance(P.x, P.z) || P.vehicle) { if ((this.pause -= dt) <= 0) { this.mode = 'patrol'; this.calledOut = false; this.wp = 1; this.path = [ROUTE[1]]; } } else this.pause = 6;
        break; }
      case 'confront': { this.faceTo(P.x, P.z, dt); const d = Math.hypot(P.x - this.x, P.z - this.z); if (!inside) { this.mode = 'patrol'; break; } if (d > 2.4) { this.path = [[P.x, P.z]]; speed = this.walk(dt, 1.7); } break; }
      case 'talk': break;
    }
    // told to leave: 30 s to get out of the grounds, then he calls 119
    if (this.leaveT >= 0) { if (!inside) { this.leaveT = -1; this.note('intruder left'); } else if ((this.leaveT -= dt) <= 0) { this.leaveT = -1; this.callPolice(); } }
    this.place();
    const d = Math.hypot(P.x - this.x, P.z - this.z); this.acc = (this.acc || 0) + dt; const rate = d < 45 ? 0 : d < 120 ? 0.15 : 0.5; if (this.acc >= rate) { this.animate(Math.min(this.acc, 0.25), speed); this.acc = 0; }
    this.torchUpdate(P);
  }
  nearestWp() { let b = 0, bd = 1e9; ROUTE.forEach(([x, z], i) => { const d = Math.hypot(x - this.x, z - this.z); if (d < bd) { bd = d; b = i; } }); return b; }
  pathTo(x, z) { // via the gate-side corner of the spine so he never cuts through the wing or the hut
    const pts = []; if (this.z > 335) pts.push([268.9, this.z], [268.9, 333.2]); pts.push([x, z]); return pts; }
  walk(dt, sp) { const [tx, tz] = this.path[0]; const dx = tx - this.x, dz = tz - this.z, dd = Math.hypot(dx, dz);
    if (dd < 0.12) { this.path.shift(); if (!this.path.length) this.path = null; return 0; }
    const st = Math.min(dd, sp * dt); this.x += (dx / dd) * st; this.z += (dz / dd) * st; this.faceTo(tx, tz, dt); return sp; }
  faceTo(x, z, dt) { const want = Math.atan2(x - this.x, z - this.z); let a = want - this.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); this.yaw += a * Math.min(1, dt * 7); }
  arrive() {
    if (this.mode === 'patrol') { this.pause = SWEEP_AT.has(this.wp) ? 4 + Math.random() * 2 : 0.2; if (SWEEP_AT.has(this.wp)) this.sweepT = 0; }
    else if (this.mode === 'toChair') { this.mode = 'sleep'; this.applyMode(); this.note('dozed off'); }
    else if (this.mode === 'toPost') { this.mode = 'post'; this.pause = 6; if (!this.calledOut) { this.calledOut = true; this.g.hud.subtitle(NAME, "Who's there? School's closed.", '', 2.6); } }
  }
  sees(P) { const dx = P.x - this.x, dz = P.z - this.z, d = Math.hypot(dx, dz); if (d > 16) return false; if (d > 3.2) { const f = this.aim; const c = (dx * f.x + dz * f.z) / (d * Math.hypot(f.x, f.z) || 1); if (c < Math.cos(0.5)) return false; }
    const col = this.g.collision; return !col?.raycast || col.raycast(this.x, 1.5, this.z, P.x, 1.5, P.z, 0.1) >= 0.98; }
  torchUpdate(P) {
    const on = !!this.ch && this.mode !== 'sleep' && this.g.atmos.night > 0.25 && !this.g.indoor; this.torch.visible = on; this.light.intensity = on ? 60 : 0; this.light.shadow.autoUpdate = on && this.light.castShadow; if (!on) return;
    const b = this.ch.bones; const hp = b.handR.getWorldPosition(new THREE.Vector3()); const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    let tgt; const facing = this.mode === 'post' || this.mode === 'confront' || this.mode === 'talk';
    if (facing) tgt = new THREE.Vector3(P.x, (P.y || 0) + (this.mode === 'talk' ? 0.45 : 1.05), P.z);
    else { const sweep = this.mode === 'patrol' && !this.path ? Math.sin(this.t * 1.1) * 0.85 : Math.sin(this.t * 0.7) * 0.25; const a = this.yaw + sweep; tgt = new THREE.Vector3(this.x + Math.sin(a) * 7, 0.15, this.z + Math.cos(a) * 7); }
    this.aim.copy(tgt).sub(hp).normalize(); const tip = hp.clone().addScaledVector(this.aim, 0.05).addScaledVector(fwd, 0.02);
    this.torch.position.copy(tip); this.torch.lookAt(tgt); this.light.position.copy(tip).addScaledVector(this.aim, 0.1); this.light.target.position.copy(tgt); this.light.target.updateMatrixWorld();
  }
  wake(byPlayer) { if (this.mode === 'sleep') { this.x = CHAIR.x; this.z = CHAIR.z - 0.5; this.yaw = CHAIR.yaw; } this.mode = 'patrol'; this.applyMode(); this.wp = 0; this.path = null; this.pause = byPlayer ? 0 : 3; if (byPlayer) this.awakeNight = this.night; this.note(byPlayer ? 'woken by the player' : 'woke up'); }
  callPolice() { const g = this.g, P = g.player, pol = g.police; this.note('called 119'); g.hud.subtitle(NAME, "That's it — I'm calling the police.", '', 3); if (!pol) return;
    pol.reason = 'trespassing on school grounds at night'; pol.incident = { x: P.x, z: P.z, t: pol.t }; pol.addHeat(1, pol.reason, 'The night watchman called 119.'); }
  // ---------------------------------------------------------------- interaction (called from Game.updateInteractions)
  interact(P, key) {
    const g = this.g; if (!this.ch || this.busy || g.story.running || P.vehicle || g.director.active) return null;
    const dChair = Math.hypot(P.x - CHAIR.x, P.z - CHAIR.z), d = Math.hypot(P.x - this.x, P.z - this.z);
    if (this.mode === 'sleep' && (dChair < 2.6 || (P.z < W[2] - 0.1 && P.z > W[2] - 4.2 && dChair < 8.5))) { if (Input.wasPressed('interact')) this.talk('wake'); return `${key('interact')} Wake the watchman`; }
    if (this.mode === 'post' && d < 4.2 && atEntrance(P.x, P.z)) { if (this.strikes >= 2) { if (Input.wasPressed('interact')) g.hud.subtitle(NAME, 'I said no. Come back in the morning and report to the office.', '', 3); return `${key('interact')} Talk to the watchman`; }
      if (Input.wasPressed('interact')) this.talk('gate'); return `${key('interact')} Talk to the watchman`; }
    if (this.mode === 'confront' && d < 3) { if (Input.wasPressed('interact')) this.talk('inside'); return `${key('interact')} Explain yourself to the watchman`; }
    return null;
  }
  async talk(kind) {
    const g = this.g; this.busy = true; const prev = this.mode; this.mode = 'talk'; const ch = this.ch; ch.yaw = this.yaw; const h = g.atmos.hour;
    let result = 'none'; const L = [];
    const pass = (msg, escort = false) => { L.push([NAME, msg]); result = escort ? 'escort' : 'pass'; };
    const refuse = (msg, n = 1) => { L.push([NAME, msg]); this.strikes += n; result = this.strikes >= 2 ? 'refuse2' : 'refuse'; };
    const staffRoom = (good, bad) => { L.push([NAME, "Then you know your way. Where's the staff room?"]); L.push({ choice: ['"Ground floor of the side wing — on the right as you come in. Maroon sign over the door."', '"Top floor of the main block, next to the principal\'s office."', '"I was hoping you\'d show me."'],
      onChoice: async (i) => { if (i === 0) good(); else bad(); } }); };
    if (kind === 'wake') { this.wake(true); this.applyMode(); this.mode = 'talk'; L.push([NAME, "Huh—! Who's that? …I wasn't sleeping. I was resting my eyes."]); }
    if (kind === 'gate' || kind === 'wake') {
      L.push([NAME, h < 5 ? "It's the middle of the night. The school is locked. What do you want?" : "Hold it there. School's closed after seven. What's your business?"]);
      L.push({ choice: ['"On-call electrician. The office reported the staff-room lights tripping."', '"A teacher never came home and isn\'t answering her phone. Her family asked me to check."', '"I left my bag in one of the school vans this afternoon."', '"Here — two thousand rupees. You never saw me."', '"Nothing. Sorry to bother you."'],
        onChoice: async (i) => {
          if (i === 0) staffRoom(() => pass("…That's right. Go on, the wicket's open. Fix your lights and don't touch anything else — I'll be watching."), () => refuse("You've never set foot in this school. Go home."));
          else if (i === 1) { L.push([NAME, "Still inside? I locked up at seven and the rooms were dark… are you sure?"]); L.push({ choice: ['"If she\'s fainted in the staff room, every minute counts. Let\'s check together."', '"Forget it. She\'s probably fine."'], onChoice: async (j) => { if (j === 0) pass("…You're right. Come — quickly. I'll walk with you.", true); else L.push([NAME, 'Then go home. Good night.']); } }); }
          else if (i === 2) refuse("The vans? They all leave after school. Not one stays overnight. Nice try.");
          else if (i === 3) refuse('Put that away. Twenty-two years I have guarded this gate and nobody has ever bought me. Go.', 2);
          else L.push([NAME, 'Good night.']);
        } });
    } else if (kind === 'inside') {
      L.push([NAME, "This is a school, and it's locked for the night. What are you doing in here?"]);
      L.push({ choice: ['"I came in for a meeting this afternoon and lost track of time."', '"I\'m the electrician — the staff-room lights."', '"Just having a look around."'],
        onChoice: async (i) => {
          if (i === 0) { L.push([NAME, "Lost track of time… the office should have checked the rooms. Come, I'll see you out the wicket."]); result = 'escortOut'; }
          else if (i === 1) staffRoom(() => pass('Fine. Finish your work and leave by the wicket.'), () => { L.push([NAME, "Electrician my foot. Out — now. Thirty seconds, or I call 119."]); result = 'leave'; });
          else { L.push([NAME, "A look around? At this hour? Out — now. Thirty seconds, or I call 119."]); result = 'leave'; }
        } });
    }
    try { await g.story.conversation(ch, L); } finally { this.busy = false; this.yaw = ch.root.rotation.y; }
    this.note(`talk ${kind} → ${result}`);
    if (result === 'pass' || result === 'escort') { this.permit = true; this.escortIn = false; this.mode = result === 'escort' ? 'escort' : 'post'; this.pause = 4; g.hud.notify('Johns school', result === 'escort' ? 'The watchman opened the wicket and is walking in with you.' : 'The watchman let you in. The wicket stays open until you leave the grounds.', 'success', 4); }
    else if (result === 'escortOut') { this.mode = 'escort'; this.escortIn = true; g.hud.notify('Johns school', 'Head for the wicket beside the main gate — it opens from the inside.', 'info', 4); }
    else if (result === 'leave') { this.leaveT = 30; this.mode = 'confront'; g.hud.notify('Johns school', 'Leave the grounds through the wicket within 30 seconds or the watchman calls the police.', 'warn', 5); }
    else if (result === 'refuse' || result === 'refuse2') { this.mode = 'post'; this.pause = 6; if (result === 'refuse2') g.hud.notify('Johns school', "The watchman won't listen to you again tonight.", 'info', 4); }
    else this.mode = prev === 'confront' ? 'confront' : 'post';
  }
}
