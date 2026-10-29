// Game: boot/loading, presentation flow (intro → montage → menu), the play loop, interactions, save/load.
import { gatherBodies } from './actors/Bodies.js';
import { PoliceHQLife } from './police/PoliceHQLife.js';
import { PoliceResponse } from './police/PoliceResponse.js';
import { TrafficDuty } from './police/TrafficDuty.js';
import { Health } from './actors/Health.js';
import { StreetCricket } from './actors/StreetCricket.js';
import { Phone } from './ui/Phone.js';
import { SchoolLife } from './actors/SchoolLife.js';
import * as THREE from 'three';
import { Settings } from './core/Settings.js';
import { Input } from './core/Input.js';
import { bus } from './core/Events.js';
import { SaveSystem } from './core/SaveSystem.js';
import { clamp, lerp } from './core/math.js';
import { buildTextures, setAniso } from './gfx/Textures.js';
import { buildMaterials } from './gfx/Materials.js';
import { Atmosphere } from './gfx/Atmosphere.js';
import { PostFX } from './gfx/PostFX.js';
import { setVehicleNight } from './vehicles/VehicleModels.js';
import { updateVehicleLOD, setHeadPoolNight } from './vehicles/Vehicle.js';
import { World } from './world/World.js';
import { Interiors } from './world/Interiors.js';
import * as L from './world/Layout.js';
import { Crowd } from './actors/Crowd.js';
import { Player } from './actors/Player.js';
import { Character, HEROES, CAM } from './actors/Character.js';
import { Traffic } from './vehicles/Traffic.js';
import { Trains } from './vehicles/Trains.js';
import { Audio } from './audio/Audio.js';
import { HUD } from './ui/HUD.js';
import { Satellite } from './ui/Satellite.js';
const HQ_SKY = new THREE.Color(0xfff3e4), HQ_GND = new THREE.Color(0x8a8478); // walk-in HQ indoor fill
import { Screens, wait } from './ui/Screens.js';
import { enterGameLoading } from './ui/LoadingScreen.js';
import { Director } from './story/Director.js';
import { Story, MISSIONS } from './story/Story.js';
import { playOpening } from './story/Opening.js';
import { Weapons } from './combat/Weapons.js';

const VNAMES = { tuktuk: 'Three-wheeler', car: 'Hatchback', sedan: 'Sedan', taxi: 'Taxi', van: 'Van', suv: 'SUV', bus: 'SLTB bus', pbus: 'Private bus', lorry: 'Lorry', bike: 'Motorcycle', police: 'Police car', policejeep: 'Police jeep', policebike: 'Police motorcycle' };
const RADIO = [null, { mode: 'radio1', name: 'Radio Lanka Breeze 98.4' }, { mode: 'radio2', name: 'Island Pulse 104.2' }];
const TEST = new URLSearchParams(location.search).has('test'); // headless testing: allow big timesteps so cinematics finish under software rendering
const tick = () => new Promise((r) => setTimeout(r, 0));

export class Game {
  constructor(root) {
    this.root = root; this.bus = bus; this.clock = 0; this.dt = 0; this.mode = 'boot'; this.paused = false; this.radio = 0; this.autosaveT = 0; this.fps = 60; this.indoor = false;
    this.ghost = { x: 1e7, z: 1e7, y: 0, yaw: 0, speed: 0, vehicle: null, crouching: false, sprinting: false, ch: null, isGhost: true }; // stand-in player for menu/intro simulation
    const preset = Settings.preset;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * preset.pixelRatio * Settings.get('resolutionScale'));
    this.renderer.setSize(innerWidth, innerHeight); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = preset.shadows; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement; this.canvas.className = 'game-canvas'; root.appendChild(this.canvas);
    setAniso(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(Settings.get('fov'), innerWidth / innerHeight, 0.25, 16000);
    this.camera.position.set(-650, 60, -400); this.camera.lookAt(-350, 30, -350);
    this.ui = document.createElement('div'); this.ui.className = 'ui-root'; root.appendChild(this.ui);
    this.screens = new Screens(this.ui, this);
    addEventListener('resize', () => this.resize());
    bus.on('settings', (k) => this.applySettings(k));
    this.canvas.addEventListener('click', () => { if (this.mode === 'play' && !this.paused) Input.requestLock(this.canvas); });
    bus.on('pointerlock', (locked) => { if (!locked && this.mode === 'play' && !this.paused && !this.photo && !this.hud.bigMapOpen && !this.director.active && !this.ignoreUnlock) this.openPause(); });
    bus.on('key', (code) => this.onKey(code));
  }
  // ================================================================= loading (genuine progress)
  async load(progress) {
    const q = Settings.get('quality'); const step = (a, b) => (p, label) => progress(a + (b - a) * p, label);
    progress(0, 'Loading fonts');
    try { await Promise.race([Promise.all(['600 32px "Noto Sans Sinhala"', '600 32px "Noto Sans Tamil"', '700 32px "Barlow Condensed"', '600 32px "Cormorant Garamond"', '500 16px "Manrope"'].map((f) => document.fonts.load(f, 'අආ தமி Aa'))), wait(6000)]); } catch (e) { console.warn('font load', e); }
    progress(0.04, 'Painting textures'); await tick();
    await buildTextures(q, step(0.04, 0.22));
    buildMaterials(); progress(0.23, 'Mixing materials'); await tick();
    this.world = new World(this.scene); this.world.setQuality(q);
    await this.world.build(step(0.24, 0.72), q);
    this.collision = this.world.collision;
    progress(0.73, 'Sky, sea and monsoon'); await tick();
    this.atmos = new Atmosphere(this.scene, this.renderer); this.atmos.drawDist = Settings.preset.drawDist; this.atmos.sun.castShadow = Settings.preset.shadows; this.atmos.sun.shadow.mapSize.set(Settings.preset.shadowRes, Settings.preset.shadowRes);
    this.atmos.listeners.thunder = () => Audio.thunder(Math.random() * 0.7);
    progress(0.76, 'People of Colombo'); await tick();
    this.crowd = new Crowd(this.scene, this.collision, bus);
    for (let i = 0; i < 64; i += 8) { this.crowd.prepareSpecs(8); progress(0.76 + 0.1 * (i / 64), 'People of Colombo'); await tick(); }
    progress(0.86, 'Tuk-tuks, buses and traffic'); await tick();
    this.traffic = new Traffic(this.scene, this.collision, bus); this.traffic.crowd = this.crowd;
    this.trains = new Trains(this.scene); this.traffic.obstacles = this.trains.bodies; this.traffic.rail = this.trains; // running trains + level crossings
    this.hqLife = new PoliceHQLife(this);
    this.trafficDuty = new TrafficDuty(this);
    this.schoolLife = new SchoolLife(this);
    this.cricket = new StreetCricket(this);
    this.player = new Player(this.scene, this.camera, this.collision, bus); this.player.crowd = this.crowd;
    this.hud = new HUD(this.ui); this.hud.satellite = new Satellite(this); this.director = new Director(this); this.story = new Story(this); this.interiors = new Interiors(this); this.weapons = new Weapons(this); this.player.weapons = this.weapons; this.police = new PoliceResponse(this);
    this.health = new Health(this); this.phone = new Phone(this, this.hud.root);
    this.applyDensity();
    progress(0.9, 'Lighting'); await tick();
    this.post = new PostFX(this.renderer, this.scene, this.camera); this.post.build({ bloom: Settings.preset.bloom, ao: Settings.preset.ao });
    this.atmos.update(0.016, new THREE.Vector3(-300, 0, -500), this.camera, 0);
    progress(0.93, 'Compiling shaders'); await tick();
    this.world.warm(-500, -400); this.world.update(0.016, { x: -500, z: -400 }, this.camera, this.atmos);
    try { if (this.renderer.compileAsync) await Promise.race([this.renderer.compileAsync(this.scene, this.camera), wait(15000)]); else this.renderer.compile(this.scene, this.camera); } catch (e) { console.warn('compile', e); }
    this.wireEvents();
    if (TEST) { window.__Input = Input; window.__L = L; this.stepSim = async (n, dt = 0.05, keys = []) => { for (const k of keys) Input.down.add(k); for (let i = 0; i < n; i++) { this.updatePlay(dt); if (i === 0) Input.pressed.clear(); for (let j = 0; j < 12; j++) await null; /* let story/director promise chains advance like real frames */ } for (const k of keys) Input.down.delete(k); return { x: this.player.x, z: this.player.z, y: this.player.y, v: this.player.vehicle && this.player.vehicle.type, speed: this.player.vehicle ? this.player.vehicle.speed : this.player.speed }; }; }
    progress(1, 'Colombo is ready');
    this.last = performance.now(); this.mode = 'intro'; this.loop();
  }
  // ================================================================= presentation flow
  async boot() {
    const next = JSON.parse(sessionStorage.getItem('colombo.next') || 'null'); sessionStorage.removeItem('colombo.next');
    if (next) { // returning from an in-game "load" or "quit to menu": short loading screen, no studio intro
      const s = document.createElement('div'); s.className = 'screen quickload'; s.innerHTML = '<div class="gt-main small">COLOMBO</div><div class="load show"><div class="load-bar"><i></i></div><div class="load-text"></div></div>'; this.ui.appendChild(s);
      const fill = s.querySelector('i'), txt = s.querySelector('.load-text');
      await this.load((p, l) => { fill.style.width = `${Math.round(p * 100)}%`; txt.textContent = `${l} · ${Math.round(p * 100)}%`; });
      s.remove(); const click = document.createElement('button'); click.className = 'click-start'; click.textContent = 'Click to continue'; this.ui.appendChild(click);
      await new Promise((r) => (click.onclick = r)); click.remove(); Audio.init();
      if (next.action === 'load') return this.startLoaded(next.slot);
      return this.menuLoop();
    }
    const quick = TEST && new URLSearchParams(location.search).get('quick');
    if (quick) { // test shortcuts: ?test&quick=new (opening cinematic) | ?test&quick=play (skip opening, free play at Main Street)
      await this.load((p, l) => { window.__progress = [p, l]; });
      if (quick === 'new') return this.newGame();
      this.story.state = Story.freshState(); this.mode = 'play'; this.atmos.hour = 17; this.setupRoomDoor(); this.world.warm(-140, -892); this.player.teleport(-140, -891.8, Math.PI / 2);
      this.player.cinematic = false; this.player.control = true; this.hud.show(true); this.hud.fade(0, 0.3); this.story.setupWorldActivities(); this.story.startMission('m0', 0); return;
    }
    await this.screens.studioIntro((p) => this.load(p));
    await this.montage();
    await this.menuLoop();
  }
  async montage() {
    this.mode = 'intro'; const d = this.director; let skip = false; const off = bus.on('key', () => (skip = true)); const clk = () => (skip = true); addEventListener('mousedown', clk);
    const A = this.atmos; Audio.setMusic('intro');
    const scenes = [
      { hour: 17.9, weather: 'cloudy', from: { pos: [115, 4, -452], look: [305, 120, -480] }, to: { pos: [165, 6, -466], look: [305, 165, -480] } },
      { hour: 15.6, weather: 'rain', from: { pos: [-150, 0.8, -906.5], look: [-200, 1.0, -903.6] }, to: { pos: [-152, 0.9, -906.8], look: [-140, 1.0, -903.6] }, drive: ['tuktuk', [[-230, -903.6], [-60, -903.6]], 9] },
      { hour: 19.7, weather: 'rain', from: { pos: [-397.5, 0.45, -540], look: [-404, 0.6, -600] }, to: { pos: [-397.5, 0.5, -548], look: [-404, 0.6, -610] }, drive: ['car', [[-404.5, -460], [-404.5, -700]], 12] },
      { hour: 10.3, weather: 'clear', from: { pos: [-215, 3.6, -896], look: [-160, 2.5, -900] }, to: { pos: [-185, 3.4, -896], look: [-130, 2.2, -900] }, crowd: true },
      { hour: 18.1, weather: 'clear', from: { pos: [-505, 2.6, -470], look: [-700, 15, -440] }, to: { pos: [-512, 2.8, -455], look: [-700, 12, -430] }, crowd: true },
      { hour: 18.55, weather: 'clear', from: { pos: [70, 22, -400], look: [-200, 50, -640] }, to: { pos: [55, 24, -420], look: [-200, 55, -650] }, toHour: 19.05 },
    ];
    try {
      d.active = true; this.player.cinematic = true;
      for (const sc of scenes) {
        if (skip) break;
        await this.hud.fade(1, 0.35);
        A.hour = sc.hour; A.setWeather(sc.weather, true); A.forceWeather(sc.weather); if (sc.weather !== 'rain') A.wet = 0;
        this.focus = { x: (sc.from.pos[0] + sc.from.look[0]) / 2, z: (sc.from.pos[2] + sc.from.look[2]) / 2 }; this.world.warm(this.focus.x, this.focus.z);
        d.clearVehicles(); if (sc.drive) { d.driveBy(sc.drive[0], sc.drive[1], sc.drive[2], 7); if (sc.hour > 19) for (let k = 1; k < 4; k++) d.driveBy(k % 2 ? 'tuktuk' : 'sedan', sc.drive[1].map(([x, z]) => [x, z + (sc.drive[1][1][1] > sc.drive[1][0][1] ? -k * 18 : k * 18)]), sc.drive[2], 7 + k); }
        d.hold(sc.from.pos, sc.from.look); for (let i = 0; i < 20; i++) this.updateAmbient(0.05); // let crowds/traffic settle
        this.hud.fade(0, 0.35); this.montageHour = sc.toHour ? { from: sc.hour, to: sc.toHour, t0: d.time, dur: 4 } : null;
        const p = d.shot(sc.from, sc.to, 4.2); await Promise.race([p, new Promise((r) => { const iv = setInterval(() => { if (skip) { clearInterval(iv); r(); } }, 50); p.then(() => clearInterval(iv)); })]);
      }
      if (!skip) { const t = this.screens.gameTitle(5); await Promise.race([t, new Promise((r) => { const iv = setInterval(() => { if (skip) { clearInterval(iv); r(); } }, 50); t.then(() => clearInterval(iv)); })]); }
    } finally { off(); removeEventListener('mousedown', clk); d.clearVehicles(); d.active = false; this.montageHour = null; this.ui.querySelectorAll('.game-title').forEach((e) => e.remove()); A.forceWeather(null); await this.hud.fade(1, 0.3); }
  }
  async menuLoop() {
    for (;;) {
      this.mode = 'menu'; this.player.cinematic = true; this.hud.show(false); this.atmos.hour = 17.4; this.atmos.setWeather('cloudy', true); this.atmos.wet = 0; this.menuT = 0;
      Audio.setMusic('menu'); this.hud.fade(0, 1.2);
      const r = await this.screens.mainMenu();
      if (r.action === 'new') { await this.enterLoading([[-128, -891.8], [-560, -330]]); return this.newGame(); }
      if (r.action === 'load') { const d = SaveSystem.read(r.slot); const p = d && d.player; await this.enterLoading(p ? [[p.x, p.z]] : [[L.PLACES.meeting.x, L.PLACES.meeting.z]]); return this.startLoaded(r.slot); }
    }
  }
  // Enter-game loading screen: real streaming / shader / GPU-upload work around the spawn point(s), studio branding on top
  async enterLoading(points) {
    Audio.setMusic('none'); Audio.riser(5);
    await enterGameLoading(this.ui, [
      { label: 'Streaming Colombo districts', run: (pr) => this.world.warmAsync(points, pr) },
      { label: 'Compiling shaders', run: async (pr) => { this.camera.position.set(points[0][0], 3, points[0][1] + 6); this.camera.lookAt(points[0][0], 1.5, points[0][1]); this.camera.updateMatrixWorld(); try { if (this.renderer.compileAsync) await Promise.race([this.renderer.compileAsync(this.scene, this.camera), wait(8000)]); else this.renderer.compile(this.scene, this.camera); } catch (e) { console.warn('compile', e); } pr(1); } },
      { label: 'Waking the city', run: async (pr) => { for (let i = 0; i < 4; i++) { this.camera.rotation.y += Math.PI / 2; this.camera.updateMatrixWorld(); this.renderer.render(this.scene, this.camera); pr((i + 1) / 4); await new Promise((r) => requestAnimationFrame(r)); } } },
    ], { minMs: TEST ? 1500 : 6200, onFlash: () => Audio.boom() });
    this.hud.fade(1, 0); await new Promise((r) => requestAnimationFrame(r));
  }
  async newGame() {
    this.story.state = Story.freshState(); this.clock = 0; this.mode = 'play'; this.paused = false; this.rebuildPlayer();
    this.hud.clearBlips(''); this.focus = null; this.setupRoomDoor();
    await playOpening(this);
    Input.requestLock(this.canvas);
    this.story.setupWorldActivities(); this.story.startMission('m0', 0); this.autosave();
  }
  async startLoaded(slot) {
    const d = SaveSystem.read(slot); if (!d) return this.menuLoop();
    this.story.restore(d.story); this.atmos.restore(d.atmos); this.clock = d.clock || 0; this.rebuildPlayer(); this.weapons.load(d.weapons); this.pendingWanted = d.police ? d.police.level : d.weapons ? d.weapons.heat : 0;
    const p = d.player || { x: L.PLACES.meeting.x, z: L.PLACES.meeting.z, yaw: 0 }; this.world.warm(p.x, p.z); this.player.teleport(p.x, p.z, p.yaw);
    this.player.cinematic = false; this.player.control = true; this.mode = 'play'; this.paused = false; this.hud.show(true); this.director.active = false;
    if (this.pendingWanted) { this.police.restore(this.pendingWanted); this.pendingWanted = 0; }
    this.story.setupWorldActivities(); this.setupRoomDoor();
    const m = this.story.state.mission; if (m.id && m.stage > 0) this.story.startMission(m.id, m.stage); else if (m.id === 'm0') this.story.startMission('m0', 0); else this.story.offerNext();
    for (let i = 0; i < 30; i++) this.updatePlay(0.033, true);
    await this.hud.fade(0, 0.8); this.hud.notify('Game loaded', `${d.missionTitle || 'Free roam'} · ${d.timeString || ''}`, 'success', 3); Audio.setMusic('explore');
  }
  setupRoomDoor() { const r = this.story.state.flags.room; this.interiors.setupDoors(r || null); }
  // ================================================================= services used by Story / Director
  autosave() { if (this.mode === 'play' && !this.director.active) this.saveTo('auto'); }
  saveTo(slot) {
    const P = this.player; let pos = { x: P.x, z: P.z, yaw: P.yaw };
    if (this.interiors.current) { const d = this.interiors.current.door; pos = { x: d.x, z: d.z, yaw: d.faceIn + Math.PI }; } else if (P.vehicle) { const e = P.vehicle.exitPoint(-1); pos = { x: e.x, z: e.z, yaw: P.vehicle.yaw }; }
    const m = MISSIONS.find((q) => q.id === this.story.state.mission.id);
    SaveSystem.write(slot, { story: this.story.serialize(), atmos: this.atmos.serialize(), player: pos, weapons: this.weapons.save(), police: this.police.save(), clock: this.clock, missionTitle: m ? m.title : 'Free roam', timeString: `Day ${this.atmos.day} · ${this.atmos.timeString}` });
  }
  async restUntil(hour) {
    const P = this.player; P.control = false; await this.hud.fade(1, 0.8); let dh = hour - this.atmos.hour; if (dh < 0) dh += 24; this.atmos.advance(dh * 60);
    this.hud.notify('Rested', `It is now ${this.atmos.timeString}`, 'info', 3); this.player.stamina = 1; this.atmos.update(0.016, new THREE.Vector3(P.x, 0, P.z), this.camera, 0); await wait(400);
    await this.hud.fade(0, 0.8); P.control = true; this.setupRoomDoor(); this.autosave();
  }
  async playEnding(kind, state) { this.player.control = false; await this.hud.fade(1, 1.2); this.hud.show(false); Input.releaseLock(); this.ignoreUnlock = true; await this.screens.ending(kind, state); this.ignoreUnlock = false; this.hud.show(true); await this.hud.fade(0, 1); this.player.control = true; Input.requestLock(this.canvas); this.autosave(); }
  rebuildPlayer() {
    const P = this.player; const spec = { ...HEROES.kavindu, top: this.story.state.outfit || HEROES.kavindu.top };
    const old = P.ch; const parent = old.root.parent; const ch = new Character(spec); ch.root.position.copy(old.root.position); ch.root.rotation.copy(old.root.rotation);
    if (parent) { parent.add(ch.root); parent.remove(old.root); } if (this.weapons) { this.weapons.forceHolster(); this.weapons.attach(ch); } old.dispose(); P.ch = ch; if (P.vehicle) { const seat = P.vehicle.driverSeat(); ch.root.position.set(seat.x, seat.y, seat.z); ch.root.rotation.set(0, 0, 0); ch.anim.sitIn(seat, 1); ch.anim.update(0.001, 0); }
  }
  setIndoor(v) { this.indoor = v; this.world.root.visible = !v; this.atmos.rain.visible = false; this.atmos.indoor = v; this.hud.mini.classList.toggle('dim', v); if (v) this.hideOutdoor(); else this.showOutdoor(); }
  // FPS: while inside an interior nothing of the street is visible, so street traffic, crowd, trains and other
  // outdoor objects are hidden (not drawn, not shadow-cast) and their simulation pauses; restored on exit.
  isOutdoorObj(c) { if (c.isLight || c.isCamera || c === this.player.ch.root || c.name === 'hq-interior' || c.userData.interior) return false; for (const r of this.interiors.built.values()) if (r.g === c) return false; return c.position.y > -15; }
  hideOutdoor() { if (!this._hiddenOut) this._hiddenOut = []; for (const c of this.scene.children) if (c.visible && this.isOutdoorObj(c)) { c.visible = false; this._hiddenOut.push(c); } }
  showOutdoor() { for (const c of this._hiddenOut || []) c.visible = true; this._hiddenOut = []; }
  // ================================================================= events → audio / HUD
  wireEvents() {
    bus.on('footstep', (e) => Audio.footstep(e.sprint, this.atmos.wet > 0.3 && !this.indoor));
    bus.on('horn', (v) => Audio.horn(v.type, v.x, v.z));
    bus.on('crash', (v) => Audio.crash(v));
    bus.on('land', () => Audio.footstep(true, false));
    bus.on('enterVehicle', ({ v, hadDriver }) => { if (hadDriver) this.hud.subtitle('Driver', 'Ado! What are you doing? That\'s my vehicle!', '', 2.8); this.hud.notify(VNAMES[v.type] || 'Vehicle', `${this.hud.key('enter')} exit · ${this.hud.key('horn')} horn · ${this.hud.key('lights')} lights · ${this.hud.key('radio')} radio`, 'info', 3.5); Audio.ui('door'); });
    bus.on('npcLineRaw', ({ who, text }) => this.hud.subtitle(who, text, '', 2.4));
    bus.on('exitVehicle', () => { Audio.ui('door'); if (this.radio) { this.radio = 0; } });
    bus.on('npcLine', ({ ped, line, prio }) => {
      if (!Settings.get('subtitles') && prio < 1) return; const P = this.player; const d = Math.hypot(ped.x - P.x, ped.z - P.z); if (d > (prio ? 16 : 9) || this.director.active || this.indoor) return;
      if ((this.hud.subUntil || 0) > performance.now() && (!prio || this.story.running)) return; const lang = line.si ? 'si' : line.ta ? 'ta' : 'en'; const who = ped.sp?.profile === 'tourist' ? 'Tourist' : ped.sp?.sex === 'f' ? (ped.sp.age === 'elder' ? 'Aunty' : 'Woman') : (ped.sp?.age === 'elder' ? 'Uncle' : 'Man');
      this.hud.subtitle(who, line.si || line.ta || line.en, line.tr || '', 3, lang); Audio.talkBlip(lang);
    });
    bus.on('pedHit', (p) => { if (p && p.knockedByCar) Audio.crash(4); });
    bus.on('pedReport', (e) => { if (this.police) this.police.report(e); });
    bus.on('pedHit', (p) => { const P = this.player; if (!this.police || !p || this.mode !== 'play') return; const src = P.vehicle || P; if (Math.hypot(p.x - src.x, p.z - src.z) > 10) return; if (p.knockedByCar) { if (P.vehicle) this.police.crime(p.x, p.z, 'vehicle'); } else this.police.crime(p.x, p.z, 'assault'); }); // only incidents the player caused
  }
  // ================================================================= input
  onKey(code) {
    if (this.mode !== 'play' || this.paused) return;
    if (code === 'Escape') { if (this.phone?.open) this.phone.toggle(false); else if (this.photo) this.togglePhoto(false); else if (this.hud.bigMapOpen) this.toggleMap(false); else if (!this.director.active) this.openPause(); }
  }
  async openPause() {
    if (this.paused || this.director.active) return; this.paused = true; Input.releaseLock(); Audio.ui('click');
    const r = await this.screens.pause(); this.paused = false; this.last = performance.now();
    if (r.action === 'map') { this.toggleMap(true); }
    else if (r.action === 'load') { sessionStorage.setItem('colombo.next', JSON.stringify({ action: 'load', slot: r.slot })); location.reload(); }
    else if (r.action === 'menu') { this.autosave(); sessionStorage.setItem('colombo.next', JSON.stringify({ action: 'menu' })); location.reload(); }
    else { this.ignoreUnlock = true; Input.requestLock(this.canvas); setTimeout(() => (this.ignoreUnlock = false), 300); }
  }
  toggleMap(v) { const open = this.hud.toggleBigMap(v, this.player.x, this.player.z); this.hud.bigMapOpen = open; this.ignoreUnlock = true; if (open) Input.releaseLock(); else Input.requestLock(this.canvas); setTimeout(() => (this.ignoreUnlock = false), 300); this.player.control = !open && !this.photo; }
  togglePhoto(v) {
    const P = this.player; this.photo = v ?? !this.photo; this.hud.photoUI.classList.toggle('hidden', !this.photo); this.hud.root.classList.toggle('hidden', this.photo);
    if (this.photo) { if (P.vehicle) { this.photo = false; this.hud.photoUI.classList.add('hidden'); this.hud.root.classList.remove('hidden'); this.hud.notify('Phone camera', 'Step out of the vehicle first.'); return; } P.control = false; P.ch.anim.set('photo'); this.photoYaw = P.camYaw + Math.PI; this.photoPitch = 0; P.cinematic = true; Input.requestLock(this.canvas); }
    else { P.control = true; P.cinematic = false; P.ch.anim.set(null); P.ch.mesh.visible = true; this.camera.zoom = 1; this.camera.updateProjectionMatrix(); }
  }
  updatePhoto(dt) {
    const P = this.player, cam = this.camera; const sens = 0.0022 * Settings.get('mouseSens');
    this.photoYaw -= Input.mouseDX * sens + Input.pad.rx * dt * 2; this.photoPitch = clamp(this.photoPitch - (Input.mouseDY * sens + Input.pad.ry * dt * 2) * (Settings.get('invertY') ? -1 : 1), -1.2, 1.3);
    if (Input.wheel) { cam.zoom = clamp(cam.zoom - Input.wheel * 0.15, 1, 4); cam.updateProjectionMatrix(); }
    P.yaw = this.photoYaw; P.sync(); P.ch.mesh.visible = false; const hx = P.x + Math.sin(P.yaw) * 0.25, hz = P.z + Math.cos(P.yaw) * 0.25;
    cam.position.set(hx, P.y + 1.62, hz); cam.lookAt(hx + Math.sin(this.photoYaw) * Math.cos(this.photoPitch), P.y + 1.62 + Math.sin(this.photoPitch), hz + Math.cos(this.photoYaw) * Math.cos(this.photoPitch));
    if (Input.mousePressed.has(0) || Input.padPressed('jump')) {
      Audio.ui('camera'); this.hud.photoUI.classList.add('flash'); setTimeout(() => this.hud.photoUI.classList.remove('flash'), 180);
      cam.updateMatrixWorld(); this.story.onPhoto(cam);
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      for (const p of this.crowd.peds) if (Math.hypot(p.x - P.x, p.z - P.z) < 15 && fr.containsPoint(new THREE.Vector3(p.x, 1.2, p.z))) this.crowd.interact(p, 'photo', P);
    }
  }
  // ================================================================= per-frame
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now(); const raw = (now - this.last) / 1000; this.last = now; const dt = Math.min(TEST ? 0.5 : 0.05, Math.max(0.0005, raw));
    this.fps = lerp(this.fps, 1 / Math.max(raw, 1e-3), 0.05);
    Input.pollGamepad();
    try {
      const mapOpen = this.mode === 'play' && this.hud.bigMapOpen; // the pause map freezes the world (and the hidden 3D view is not drawn)
      if (mapOpen) { if (Input.wasPressed('map')) this.toggleMap(false); }
      else if (this.mode === 'play' && !this.paused) this.updatePlay(dt);
      else if (this.mode === 'menu' || this.mode === 'intro') this.updateAmbient(dt);
      CAM.copy(this.camera.position); updateVehicleLOD(this.camera);
      if (this.post && !mapOpen) { if (this.world && this.world.waterRefl) { const q = Settings.get('quality'); this.world.waterRefl.scale = q === 'ultra' ? 0.6 : 0.45; this.world.waterRefl.update(this.renderer, this.scene, this.camera, (q === 'high' || q === 'ultra') && !this.indoor); } this.post.update(this.atmos); this.post.render(dt); }
    } catch (e) { if (!this._errN || this._errN < 5) console.error(e && e.stack || e); this._errN = (this._errN || 0) + 1; this.lastError = e; }
    Input.endFrame();
  }
  // menu / intro background: the living city without the player
  updateAmbient(dt) {
    this.clock += dt; const A = this.atmos, cam = this.camera;
    if (this.mode === 'menu') {
      this.menuT += dt; const t = this.menuT * 0.018; const cx = -250, cz = -470;
      cam.position.set(cx + Math.cos(t) * 300, 85 + Math.sin(t * 1.7) * 15, cz + Math.sin(t) * 300); cam.lookAt(cx + 40, 18, cz - 30); A.advance(dt * 0.25);
      this.focus = { x: cx + Math.cos(t) * 150, z: cz + Math.sin(t) * 150 };
    }
    if (this.montageHour) { const m = this.montageHour; A.hour = lerp(m.from, m.to, clamp((this.director.time - m.t0) / m.dur, 0, 1)); }
    this.director.update(dt);
    const f = this.focus || { x: cam.position.x, z: cam.position.z }; const fv = new THREE.Vector3(f.x, 0, f.z);
    this.world.simTime = this.clock; this.world.update(dt, f, cam, A); A.update(dt, fv, cam, dt); setVehicleNight(A.night); setHeadPoolNight(A.night);
    const camDir = new THREE.Vector3(); cam.getWorldDirection(camDir);
    this.traffic.night = A.night; this.traffic.weatherRain = A.w.rain; this.traffic.update(dt, f, camDir, this.clock, this.crowd.peds, this.ghost);
    this.trains.update(dt, { focus: f, night: A.night, vehicles: this.traffic.all(), listener: true });
    this.crowd.update(dt, f, camDir, { simTime: this.clock, vehicles: this.traffic.all(), rain: A.w.rain, night: A.night, player: this.ghost, hourFactor: this.hourFactor(), hour: A.hour });
    Audio.update(dt, { listener: { x: cam.position.x, z: cam.position.z, yaw: Math.atan2(camDir.x, camDir.z) }, night: A.night, rain: A.w.rain, wind: A.w.wind, traffic: this.traffic.vehicles.length, vehicles: [], indoor: false });
  }
  hourFactor() { const h = this.atmos.hour; if (h < 5) return 0.25; if (h < 7) return 0.55; if (h < 19) return 1; if (h < 22) return 0.8; return 0.45; }
  updatePlay(dt, warmOnly = false) {
    this.dt = dt; this.clock += dt; const P = this.player, A = this.atmos, cam = this.camera, D = this.director;
    if (!D.active) A.advance(dt / Settings.get('timeScale'));
    if (this.phone.open && (D.active || this.health.busy)) this.phone.toggle(false); // cutscene / hospital: put the phone away
    const busy = D.active || this.photo || this.hud.bigMapOpen || this.paused || this.phone.open || this.health.busy;
    // global actions
    if (!D.active && !warmOnly) {
      if (Input.wasPressed('map') && !this.photo) { if (this.phone.open) this.phone.toggle(false); this.toggleMap(); }
      if (Input.wasPressed('phone') && !this.hud.bigMapOpen) { if (this.photo) this.togglePhoto(false); else this.phone.toggle(); }
      else this.phone.update();
      if (this.mode === 'play') this.health.update(dt);
      if (Input.wasPressed('journal')) this.openPause();
      if (P.vehicle && Input.wasPressed('radio')) { this.radio = (this.radio + 1) % RADIO.length; this.hud.notify('Radio', RADIO[this.radio] ? RADIO[this.radio].name : 'Off', 'info', 1.6); }
    }
    if (!warmOnly) this.weapons.update(dt, !busy && P.control && !P.cinematic && !this.indoor);
    this.bodies = gatherBodies(this.scene); P.bodies = this.bodies;
    if (this.photo) this.updatePhoto(dt);
    else if (!D.active) P.update(dt, this.traffic);
    D.update(dt);
    // interactions on foot / vehicle
    let localPrompt = null;
    if (!busy && !warmOnly && P.control) localPrompt = this.updateInteractions(dt);
    const focus = { x: P.x, z: P.z }; const fv = new THREE.Vector3(P.x, P.y, P.z);
    this.world.simTime = this.clock; this.world.update(dt, focus, cam, A);
    A.update(dt, fv, cam, dt); setVehicleNight(A.night); setHeadPoolNight(A.night);
    // walk-in Police HQ: smooth outdoor → indoor light adaptation while the city keeps running outside
    const sk = this.indoor || warmOnly ? 0 : this.interiors.updateSeamless(dt); this.seamK = sk;
    if (!this.indoor && A.envBase !== undefined) this.scene.environmentIntensity = A.envBase * (1 - 0.55 * sk);
    if (sk > 0.002) { A.sun.intensity *= 1 - 0.92 * sk; A.hemi.intensity = lerp(A.hemi.intensity, 0.8, sk); A.hemi.color.lerp(HQ_SKY, sk); A.hemi.groundColor.lerp(HQ_GND, sk); A.ambient.intensity = lerp(A.ambient.intensity, 0.3, sk); this.renderer.toneMappingExposure = lerp(this.renderer.toneMappingExposure, 1.0, sk); if (sk > 0.5) A.rain.visible = false; }
    if (this.indoor) { A.sun.intensity = 0; A.hemi.intensity *= 0.25; A.ambient.intensity = 0.25; this.scene.environmentIntensity = 0.25; A.rain.visible = false; this.renderer.toneMappingExposure = 1; }
    const camDir = new THREE.Vector3(); cam.getWorldDirection(camDir);
    if (this.indoor) this.hideOutdoor(); // anything spawned since entering (police units etc.) stays hidden too
    if (!this.indoor) this.traffic.night = A.night; this.traffic.weatherRain = A.w.rain; if (!this.indoor) this.traffic.update(dt, focus, camDir, this.clock, this.police.foot.length ? this.crowd.peds.concat(this.police.foot) : this.crowd.peds, P); this.hqLife.update(dt); if (!this.indoor) { this.trafficDuty.update(dt); this.schoolLife.update(dt); this.cricket.update(dt); } if (!warmOnly) this.police.update(dt);
    if (!this.indoor) this.trains.update(dt, { focus, night: A.night, player: this.indoor ? null : P, playerVehicle: P.vehicle || null, vehicles: this.traffic.all(), listener: true });
    if (!this.indoor) this.crowd.update(dt, focus, camDir, { simTime: this.clock, vehicles: this.traffic.all(), rain: A.w.rain, night: A.night, player: P, hourFactor: this.hourFactor(), hour: A.hour, bodies: this.bodies });
    if (P.vehicle && A.night > 0.5 && P.nightLights === undefined) { P.vehicle.lights = true; }
    // story & prompts
    const storyPrompt = D.active ? null : this.story.update(dt);
    this.hud.prompt(D.active || this.photo ? '' : storyPrompt || this.police.prompt || localPrompt || '');
    // music
    this.musicT = (this.musicT || 0) - dt;
    if (this.musicT <= 0) { this.musicT = 1; if (!(Audio.musicMode === 'chase' && this.story.pursuers.length) && !D.active) { let m = A.night > 0.5 ? 'night' : 'explore'; if (this.story.guards.length) m = 'tension'; if (this.story.pursuers.length) m = 'chase'; if (P.vehicle && this.radio) m = RADIO[this.radio].mode; if (this.indoor) m = 'none'; Audio.setMusic(m); } }
    // HUD
    const v = P.vehicle; const dist = L.districtAt(P.x, P.z);
    this.hud.update({ health: this.health.hp, healthBusy: this.health.busy, time: A.timeString, money: this.story.state.money, district: this.indoor ? this.interiors.current.D.name : this.seamK > 0.5 ? this.interiors.hq.D.name : dist ? dist.name.split(' · ')[0] : '', street: this.indoor ? '' : L.roadNameAt(P.x, P.z) || '', x: P.x, z: P.z, camYaw: this.photo ? this.photoYaw + Math.PI : P.camYaw, stamina: P.stamina, vehicle: v, vehicleName: v ? VNAMES[v.type] || v.type : '', radio: v && this.radio ? `♪ ${RADIO[this.radio].name}` : '', camera: cam, police: this.police.hudInfo(), projector: (x, y, z) => this.project(x, y, z), fps: this.fps, draws: this.renderer.info.render.calls, extras: this.miniExtras(), indoor: !!this.indoor });
    // audio
    const near = v ? [v] : []; for (const o of this.traffic.vehicles) { if (near.length >= 6) break; if (Math.hypot(o.x - P.x, o.z - P.z) < 45) near.push(o); }
    Audio.update(dt, { listener: { x: P.x, z: P.z, yaw: P.camYaw + Math.PI }, night: A.night, rain: A.w.rain, wind: A.w.wind, traffic: this.traffic.vehicles.length, vehicles: near, indoor: this.indoor || this.seamK > 0.6 });
    // autosave every 4 minutes of play while free-roaming
    this.autosaveT += dt; if (this.autosaveT > 240 && !this.story.running && !D.active) { this.autosaveT = 0; this.autosave(); }
  }
  updateInteractions() {
    const P = this.player; const I = this.interiors; const key = (a) => this.hud.key(a);
    if (I.current && I.current.id === 'room') { const b = I.current.bounds; if (Math.hypot(P.x - (b.x0 + 1.2), P.z - (b.z0 + 1.6)) < 1.8 && !this.story.running) { const h = this.atmos.hour; const to = h >= 6 && h < 17 ? 19.75 : 8; if (Input.wasPressed('interact')) this.restUntil(to); return `${key('interact')} Sleep until ${to === 8 ? '8:00 AM' : '7:45 PM'}`; } }
    if (I.current) { const r = I.update(this.dt); if (r === 'exit') { if (Input.wasPressed('enter')) I.exit(); return `${key('enter')} Leave ${I.current.D.name}`; } return null; }
    if (P.entry || P.exiting) return null;
    if (P.vehicle) { if (Input.wasPressed('enter')) { if (!P.exitVehicle(this.traffic)) this.hud.notify('Slow down', 'Stop the vehicle to get out.', 'info', 1.5); } return null; }
    const door = I.nearDoor(P.x, P.z);
    const veh = this.traffic.nearest(P.x, P.z, 3.4);
    if (door && (!veh || Math.hypot(door.x - P.x, door.z - P.z) < 1.6)) { const name = door.id === 'room' ? 'your room' : this.interiorName(door.id); if (Input.wasPressed('enter')) I.enter(door); return `${key('enter')} Enter ${name}`; }
    if (veh) { if (Input.wasPressed('enter')) P.enterVehicle(veh, this.traffic); return `${key('enter')} ${veh.driverChar ? 'Take' : 'Get in'} ${VNAMES[veh.type] || 'vehicle'}`; }
    if (this.weapons && this.weapons.drawn) return null; // armed: no small talk (holster with X)
    // pedestrians: nearest in front within 2.6 m
    let best = null, bd = 2.6; const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    for (const p of this.crowd.peds) { const dx = p.x - P.x, dz = p.z - P.z; const d = Math.hypot(dx, dz); if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.2) { bd = d; best = p; } }
    if (best) {
      if (Input.wasPressed('interact')) { this.crowd.interact(best, 'talk', P); P.ch.anim.play('talk', 1.8); }
      else if (Input.wasPressed('more')) { this.crowd.interact(best, 'wave', P); P.ch.anim.play('wave', 1.5); }
      else if (Input.wasPressed('insult')) { this.crowd.interact(best, 'insult', P); P.ch.anim.play('point', 1.2); this.hud.subtitle('Kavindu', ['Move, machan!', 'Watch where you\'re going!', 'Nice shirt. Did your grandmother pick it?'][Math.floor(Math.random() * 3)], '', 2); }
      else if (Input.wasPressed('shove')) { this.crowd.interact(best, 'shove', P); P.ch.anim.play('shove', 0.6); }
      return `${key('interact')} Talk · ${key('more')} Wave · ${key('insult')} Insult · ${key('shove')} Shove`;
    }
    // emotes when nobody is around
    if (Input.wasPressed('more')) { const em = ['wave', 'stretch', 'clap', 'dance', 'look'][Math.floor(Math.random() * 5)]; P.ch.anim.play(em, em === 'dance' ? 5 : 2.2); P.emote = em; }
    return null;
  }
  interiorName(id) { return { kade: 'Lucky Tea Kade', fathima: 'Fathima Textiles', selvaraj: 'Selvaraj Electronics', bandara: 'Bandara Spice Stores', tailor: 'Ceylon Threads', garage: 'Lanka Auto Care', hq: 'Police Headquarters' }[id] || id; }
  miniExtras() {
    const out = []; for (const v of this.traffic.vehicles) out.push({ x: v.x, z: v.z, color: 'rgba(255,255,255,0.55)', r: 1.6 });
    for (const pv of this.story.pursuers) out.push({ x: pv.v ? pv.v.x : pv.x, z: pv.v ? pv.v.z : pv.z, color: '#ff4a3a', r: 3.5 });
    return out;
  }
  project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.camera); if (v.z > 1) return null; return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }
  // ================================================================= settings
  applyDensity() { const pr = Settings.preset; this.crowd.max = Math.round(pr.crowd * 0.45 * Settings.get('crowdDensity')); this.traffic.max = Math.round(pr.traffic * Settings.get('trafficDensity')); }
  applySettings(k) {
    const pr = Settings.preset; if (!this.post) return;
    if (k === 'quality' || k === 'resolutionScale' || k === '*') { this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * pr.pixelRatio * Settings.get('resolutionScale')); this.renderer.shadowMap.enabled = pr.shadows; this.atmos.sun.castShadow = pr.shadows; this.atmos.drawDist = pr.drawDist; this.world.setQuality(Settings.get('quality')); this.post.build({ bloom: pr.bloom, ao: pr.ao }); this.resize(); this.scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined && k === 'quality') o.material.needsUpdate = true; }); }
    if (k === 'fov' || k === '*') { this.camera.fov = Settings.get('fov'); this.camera.updateProjectionMatrix(); }
    if (['crowdDensity', 'trafficDensity', 'quality', '*'].includes(k)) this.applyDensity();
    if (['master', 'music', 'sfx', 'ambience', 'dialogue', '*'].includes(k)) Audio.applyVolumes();
    if (k === 'subtitleSize' || k === '*') document.documentElement.style.setProperty('--sub-scale', Settings.get('subtitleSize'));
  }
  resize() { const w = innerWidth, h = innerHeight; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h); if (this.post) this.post.setSize(w, h); }
}
