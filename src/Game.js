// Game: boot/loading, presentation flow (intro → montage → menu), the play loop, interactions, save/load.
import { predraw } from './gfx/AsyncCompile.js';
import { BUILDS } from './core/FrameBudget.js';
import { preloadRealModels } from './vehicles/RealModels.js';
import { FuelService } from './world/FuelStations.js';
import { StationLife, stationSpecs } from './world/StationLife.js';
import { underFortRoof } from './world/FortStationData.js';
import { gatherBodies, setBodiesCollision } from './actors/Bodies.js';
import { PoliceHQLife } from './police/PoliceHQLife.js';
import { PoliceResponse, crewSpec, CREW_LOOKS } from './police/PoliceResponse.js';
import { PoliceHelicopter } from './police/Helicopter.js';
import { setBloomView } from './gfx/BloomHot.js';
import { TrafficDuty } from './police/TrafficDuty.js';
import { Health } from './actors/Health.js';
import { StreetCricket } from './actors/StreetCricket.js';
import { Phone } from './ui/Phone.js';
import { GunShopUI } from './ui/GunShopUI.js';
import { CustomsUI } from './ui/CustomsUI.js';
import { CustomsService } from './customs/CustomsService.js';
import { Garage } from './customs/Garage.js';
import { updateCustoms, customsWarmMeshes } from './customs/CustomsApply.js';
import { wheelsWarmMesh } from './customs/CustomsWheels.js';
import { paintWarmMesh } from './customs/CustomsPaint.js';
import { DebugConsole, newDebugState } from './ui/DebugConsole.js';
import { SchoolLife } from './actors/SchoolLife.js';
import * as THREE from 'three';
import { gpuInfo, gpuAdvice } from './gfx/GpuInfo.js';
import { Settings } from './core/Settings.js';
import { Input } from './core/Input.js';
import { bus } from './core/Events.js';
import { SaveSystem } from './core/SaveSystem.js';
import { clamp, lerp } from './core/math.js';
import { buildTextures, setAniso } from './gfx/Textures.js';
import { buildMaterials } from './gfx/Materials.js';
import { startBankTextures } from './world/BankTex.js';
import { updateBankFX } from './world/BankFX.js';
import { Atmosphere } from './gfx/Atmosphere.js';
import { skyVisTex } from './gfx/SkyVis.js';
import { PowerGrid, GRID as POWER_GRID, signalBackup } from './world/PowerGrid.js';
import { PostFX } from './gfx/PostFX.js';
import { Benchmark } from './gfx/Benchmark.js';
import { setVehicleNight, createVehicleMesh, VTYPES } from './vehicles/VehicleModels.js';
import { captureToCanvas } from './gfx/LinearCapture.js';
import { updateLightSets, forceNightSet, lightLevel, LIGHT_LEVELS, maintainWarm, markWarm, maintainPoolWarm } from './gfx/LightSets.js';
import { refreshView, holdVehicles, updateSceneMatrices, withMatricesDone } from './gfx/ViewSkip.js';
import { assignDepthKinds } from './gfx/DepthKinds.js';
import { CATALOG, displayName } from './vehicles/VehicleCatalog.js';
import { updateDoorClosers } from './vehicles/DoorRig.js';
import { Bicycles } from './vehicles/BicycleRide.js';
import { VehicleFx } from './vehicles/VehicleFx.js';
import { Instruments } from './vehicles/Instruments.js';
import { updateVehicleLOD, setHeadPoolNight, Vehicle, HeadlightRig, setVehicleLOD, LIVE_VEHICLES, CHASSIS, TUNE_ENV, VEH_HOOKS } from './vehicles/Vehicle.js';
import { VehicleDamage } from './vehicles/VehicleDamage.js';
import { FlashlightRig } from './police/Firefight.js';
import { World } from './world/World.js';
import { skipInRefl, reflSkipProviders } from './world/Water.js';
import { LINES } from './story/Lines.js';
import { Interiors } from './world/Interiors.js';
import * as L from './world/Layout.js';
import { Crowd } from './actors/Crowd.js';
import { Player } from './actors/Player.js';
import { Character, HEROES, CAM } from './actors/Character.js';
import { applyLook } from './actors/Wardrobe.js';
import { StoreUI } from './ui/StoreUI.js';
import { ATMUI } from './ui/ATMUI.js'; // 67th: Ceylon Meridian Bank ATM screen
import { BankService } from './story/Bank.js'; // 67th: the bank account (one atomic transaction method)
import { settleDebt } from './story/HospitalBilling.js';
import { Hospital } from './world/Hospital.js';
import { PlaceAmbience } from './world/PlaceAmbience.js'; // 75th: park / hospital-garden ambience
import { PlaceSound } from './audio/PlaceAudio.js'; // 74th: the walk-in National Hospital (rooms, doors, lift, staff, recovery) // 74th: hospital bills (charged through BankService)
import { BankSound } from './audio/BankAudio.js';
import { makePoliceAppearance } from './actors/Appearance.js';
import { Traffic } from './vehicles/Traffic.js';
import { Trains } from './vehicles/Trains.js';
import { Audio } from './audio/Audio.js';
import { Voices } from './audio/Voices.js';
import { HUD } from './ui/HUD.js';
import { Satellite } from './ui/Satellite.js';
const HQ_SKY = new THREE.Color(0xfff3e4), HQ_GND = new THREE.Color(0x8a8478); // walk-in HQ indoor fill
import { Screens, wait } from './ui/Screens.js';
import { enterGameLoading } from './ui/LoadingScreen.js';
import { Director } from './story/Director.js';
import { Story, MISSIONS } from './story/Story.js';
import { playOpening } from './story/Opening.js';
import { Weapons } from './combat/Weapons.js';
import { Squad } from './actors/Squad.js';
import { Assassin } from './actors/Assassin.js';
import { Birds } from './world/Birds.js';
import { RagdollWorld } from './actors/Ragdoll.js';
import { LooseCaps } from './actors/LooseCaps.js';
import { Loot } from './world/Loot.js';
import { Blood } from './gfx/Blood.js';
import { Explosions } from './gfx/Explosions.js';
import { PropBreak } from './world/PropBreak.js';
import { Grenades } from './combat/Grenades.js';
import { Drunk } from './actors/Drunk.js';
import { VehicleSmoke } from './gfx/VehicleSmoke.js';
import { bootRuntime, bootTextures, preloadTextures, openTextureStudio } from './debug/boot.js';
import { DevLock } from './debug/DevLock.js';
import { HOOKS } from './core/Hooks.js'; // 68th: DoneShaun$123$ / the secret code
import { SoundBank } from './audio/SoundBank.js';
import { HERO_ROOMS } from './world/HeroRooms.js';
import { voiceTone } from './actors/Mind.js';
import { Skills, SKILLS } from './story/Skills.js';
import { StuntJumps } from './story/StuntJumps.js';
import { STUNTS, HUMPS } from './world/StreetRamps.js';
import { SQUAD_DEFS } from './actors/Squad.js';
import { Boats } from './boats/Boats.js';
import { MARINA } from './boats/Marina.js';
import { ClubSound } from './audio/ClubSound.js';
import { Footsteps } from './audio/Footsteps.js'; // 76th
import { ObjectAudio } from './audio/ObjectAudio.js'; // 76th
import { VehicleAudio } from './audio/VehicleAudio.js';
import { CarRadio } from './audio/CarRadio.js';
import { TrafficAudio } from './audio/TrafficAudio.js';
import { CULL, LOD, beginHide, endHide, seeHidden, hideObject } from './gfx/BatchCull.js';
import { OCC_CFG, OCC_STATS } from './gfx/Occlusion.js';
import { LIVE as BODIES } from './actors/Bodies.js';
import { TexLib } from './gfx/TexLib.js'; // 83rd: shared 2048² KTX2 atlases (balcony life, birds, vehicle detail)
import { ActivityManager } from './activities/ActivityManager.js'; // 92nd: underground fight nights + street-race meets
import { setWorkerOverride } from './core/WorkerPool.js'; // 93rd: the background compute thread budget (Settings → Graphics → CPU worker threads)
import { FrameMon, CpuPanel } from './ui/CpuPanel.js'; // 93rd: in-game CPU diagnostics
import { CityEvents } from './world/CityEvents.js'; // 81st: dynamic city events (manager, sites, people, phone app data)

const VNAMES = { tuktuk: 'Three-wheeler', car: 'Hatchback', sedan: 'Sedan', taxi: 'Taxi', van: 'Van', suv: 'SUV', bus: 'SLTB bus', pbus: 'Private bus', lorry: 'Lorry', tow: 'Tow truck', rsvan: 'Roadside service van', flatbed: 'Recovery flatbed', bike: 'Motorcycle', dbike: "Dineth's Bike", police: 'Police car', policejeep: 'Police jeep', policebike: 'Police motorcycle' };
for (const [id, T] of Object.entries(CATALOG)) VNAMES[id] = displayName(id, T); // fictional make + model, e.g. "HOSHIDA Kaizan"
const TEST = new URLSearchParams(location.search).has('test'); // headless testing: allow big timesteps so cinematics finish under software rendering
const tick = () => new Promise((r) => setTimeout(r, 0));

export class Game {
  constructor(root) {
    this.root = root; this.bus = bus; this.clock = 0; this.dt = 0; this.mode = 'boot'; this.paused = false; this.radio = 0; this.autosaveT = 0; this.fps = 60; this.indoor = false;
    this.ghost = { x: 1e7, z: 1e7, y: 0, yaw: 0, speed: 0, vehicle: null, crouching: false, sprinting: false, ch: null, isGhost: true }; // stand-in player for menu/intro simulation
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, reversedDepthBuffer: true }); // reversed-Z + float depth (PostFX target): uniform depth precision near and far, so windows, signs, glass and paving never z-fight (falls back to standard depth without EXT_clip_control)
    if (!Settings.hasSaved && !TEST) Settings.autoTune(gpuInfo(this.renderer)); // first boot on mid/low GPUs (e.g. GTX 1660 Super): balanced 60+ FPS defaults
    const preset = Settings.preset;
    TexLib.init(this.renderer); this.renderer.localClippingEnabled = true; // Street Customs roller door (a clip plane on that one material only; nothing else pays for it)
    this.dynK = 1; this.dynT = 0; this.dynHold = 0; this.dynUpAt = -1e9; this.renderer.setPixelRatio(this.basePR());
    this.renderer.setSize(innerWidth, innerHeight); this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    { // 91st: a lost WebGL context (driver reset / GPU removed). The game frees its geometry's CPU copies after upload (memory), so
      // three cannot rebuild the scene on a restore: save what can be saved and tell the player plainly instead of a black screen.
      const cv = this.renderer.domElement;
      cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ctxLost = true; this.ctxDead = true; try { if (this.mode === 'play') this.autosave(); } catch (err) { console.warn(err); } this.hud && this.hud.notify('Graphics device reset', 'The graphics driver reset WebGL. Your progress was autosaved — reload the page to keep playing.', 'warn', 30); });
      cv.addEventListener('webglcontextrestored', () => { this.ctxLost = false; this.hud && this.hud.notify('Graphics device back', 'Reload the page (F5) to redraw the city — it cannot be rebuilt without a reload.', 'warn', 30); });
    }
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
    this.cpuMon = new FrameMon(); setWorkerOverride(Settings.get('cpuWorkers')); if (Settings.get('cpuPanel')) this.applySettings('cpuPanel'); // 93rd: frame / main-thread timing for the CPU panel and benchmark
    this.canvas.addEventListener('click', () => { if (this.mode === 'play' && !this.paused && !this.editorHook && !this.customs?.uiOpen) Input.requestLock(this.canvas); });
    bus.on('pointerlock', (locked) => { if (!locked && this.mode === 'play' && !this.paused && !this.photo && !this.hud.bigMapOpen && !this.director.active && !this.ignoreUnlock && !this.gunShop?.open && !this.store?.open && !this.atm?.open && !this.customs?.active && !this.debugCon?.menuOpen && !this.debugCon?.open && !this.editorHook) this.openPause(); });
    bus.on('key', (code) => this.onKey(code));
  }
  // ================================================================= loading (genuine progress)
  async load(progress) {
    const q = Settings.get('quality'); const step = (a, b) => (p, label) => progress(a + (b - a) * p, label);
    progress(0, 'Loading fonts'); const realCars = (/[?&]noreal\b/.test(location.search) ? Promise.resolve([]) : preloadRealModels()).then((t) => console.info('[COLOMBO] real-car bodies:', t.join(', ') || 'none (procedural)')).catch((e) => console.warn('[vehicles] real bodies:', e)); // real-car bodies (RealModels.js) download / decode alongside the fonts and textures
    try { await Promise.race([Promise.all(['600 32px "Noto Sans Sinhala"', '600 32px "Noto Sans Tamil"', '700 32px "Barlow Condensed"', '600 32px "Cormorant Garamond"', '500 16px "Manrope"', '600 16px "Manrope"', '700 16px "Manrope"', '800 16px "Manrope"', '700 32px "Cormorant Garamond"'].map((f) => document.fonts.load(f, 'අආ தமி Aa'))), wait(6000)]); } catch (e) { console.warn('font load', e); }
    progress(0.04, 'Painting textures'); await tick();
    await buildTextures(q, step(0.04, 0.22));
    buildMaterials(); progress(0.23, 'Mixing materials'); await tick();
    progress(0.235, 'Vehicles of Colombo'); await realCars; // before anything builds a vehicle: a type with a real body never caches its procedural one
    await preloadTextures(); // 60th: parts given their own material in the Texture Studio are generated on it (src/debug/TexRuntime.js preload)
    this.world = new World(this.scene); this.world.setQuality(q);
    await this.world.build(step(0.24, 0.72), q); try { this.renderer.initTexture(skyVisTex); } catch (e) { console.warn('skyVis upload', e); } // 79th: the baked sky-visibility map into its shared GL texture (SkyVis.js)
    this.collision = this.world.collision;
    this.initPower();
    progress(0.73, 'Sky, sea and monsoon'); await tick();
    this.vfx = new VehicleFx(this.scene);
    this.instr = new Instruments(); // 84th: live instruments (Instruments.js)
    this.atmos = new Atmosphere(this.scene, this.renderer); this.atmos.drawDist = Settings.preset.drawDist; this.atmos.setShadowQuality(Settings.preset.shadows, Settings.preset.shadowRes); /* near + far sun shadow maps */
    this.atmos.listeners.thunder = () => Audio.thunder(Math.random() * 0.7);
    this.flashRig = new FlashlightRig(this.scene, { count: Settings.get('quality') === 'low' ? 1 : 3 }); // police hand torches at night (pool created once)
    this.headRig = new HeadlightRig(this.scene, { count: Settings.get('quality') === 'low' ? 2 : 4, shadows: Settings.preset.shadows, shadowRes: Settings.get('quality') === 'ultra' ? 2048 : 1024 }); // real headlight beams (pool created once at load)
    this.headRig.collision = this.collision; // headlight light-pool decals stop at trunks, poles and walls
    progress(0.76, 'People of Colombo'); await tick();
    this.crowd = new Crowd(this.scene, this.collision, bus); skipInRefl(this.crowd.group);
    this.ragdolls = new RagdollWorld(this.collision); this.crowd.ragdolls = this.ragdolls; this.caps = new LooseCaps(this.scene, this.collision); this.ragdolls.caps = this.caps; // police caps that come off (src/actors/LooseCaps.js)
    // dead NPCs go limp: verlet ragdolls (src/actors/Ragdoll.js)
    this.blood = new Blood(this.scene, this.collision); this.crowd.blood = this.blood; for (const m of this.blood.reflMeshes || []) skipInRefl(m); // impact spray, splats, pools (Settings → Blood effects)
    { const N = this.crowd.specTarget(); for (let i = 0; i < N; i += 8) { this.crowd.prepareSpecs(Math.min(8, N - i)); progress(0.76 + 0.1 * (i / N), 'People of Colombo'); await tick(); } }
    { // police / ambulance crews: their looks are a fixed set (PoliceResponse.crewSpec) — build the bodies now, not mid-chase
      const crews = []; for (let id = 0; id < CREW_LOOKS.police; id++) for (let k = 0; k < 2; k++) crews.push([id, k, false]); for (let id = 0; id < CREW_LOOKS.ems; id++) for (let k = 0; k < 2; k++) crews.push([id, k, true]); for (let id = 0; id < CREW_LOOKS.rs; id++) for (let k = 0; k < 2; k++) crews.push([id, k, 'rsvan']); // (80th: roadside mechanics)
      for (const sp of stationSpecs()) { try { new Character(sp).dispose(); } catch (e) { console.warn('station staff prewarm', e); } } // Fort station clerks, announcer, vendors (StationLife.js)
      for (let i = 0; i < crews.length; i++) { const [id, k, ems] = crews[i]; try { new Character(crewSpec(id, k, ems)).dispose(); } catch (e) { console.warn('crew prewarm', e); } if (i % 6 === 5) { progress(0.86, 'Police and ambulance crews'); await tick(); } } }
    progress(0.86, 'Tuk-tuks, buses and traffic'); await tick();
    this.traffic = new Traffic(this.scene, this.collision, bus); this.traffic.crowd = this.crowd; setBodiesCollision(this.collision); // nudged people never pushed into walls (Bodies.separate)
    this.trains = new Trains(this.scene); this.traffic.obstacles = this.trains.bodies; this.traffic.rail = this.trains; if (this.headRig) this.headRig.rail = this.trains; // running trains + level crossings (57th: their headlights take a pooled real beam)
    this.hqLife = new PoliceHQLife(this);
    this.trafficDuty = new TrafficDuty(this);
    this.schoolLife = new SchoolLife(this);
    this.cricket = new StreetCricket(this);
    { // 81st: dynamic city events — venue sites measured, shared event materials / chair geometry, staff + performer bodies built now (never mid-game)
      progress(0.865, 'City events'); await tick(); this.cityEvents = TEST && new URLSearchParams(location.search).has('noev') ? null : new CityEvents(this); /* &noev: tests only — the before/after baseline */ if (this.cityEvents) try { await this.cityEvents.prewarm(tick); const sp = this.cityEvents.specs(); for (let i = 0; i < sp.length; i++) { try { new Character(sp[i]).dispose(); } catch (e) { console.warn('event staff prewarm', e); } if (i % 8 === 7) await tick(); } } catch (e) { console.warn('city events prewarm', e); } }
    this.birds = new Birds(this); // house crows, rock pigeons, rose-ringed parakeets
    this.player = new Player(this.scene, this.camera, this.collision, bus); this.player.crowd = this.crowd;
    // 90th: the player and vehicles bend the GPU grass around them (GrassGPU: a few uniforms, trails recover over ~2.5 s)
    if (this.world.grassGPU) this.world.grassGPU.setMoverSource((add) => { const P = this.player; if (this.interiors && this.interiors.current) return;
      if (P.vehicle) add(P.vehicle, P.vehicle.x, P.vehicle.z, 2.0); else if (!P.boat) add(P, P.x, P.z, 0.55);
      for (const v of this.traffic.vehicles) if (v !== P.vehicle) add(v, v.x, v.z, 2.0);
      for (const v of this.traffic.parked) if (v !== P.vehicle) add(v, v.x, v.z, 1.8); });
    this.hud = new HUD(this.ui); this.hud.canSeeUnit = (u) => this.canSeeUnit(u); this.hud.mapExtras = () => this.miniExtras(); this.hud.satellite = new Satellite(this); this.director = new Director(this); this.story = new Story(this); this.interiors = new Interiors(this); this.weapons = new Weapons(this); this.player.weapons = this.weapons; this.squad = new Squad(this); this.orchid = new Assassin(this); /* Black Orchid contractor (Global browser) */ this.police = new PoliceResponse(this); this.heli = new PoliceHelicopter(this); setBloomView(this.camera); /* Air Wing helicopter on the HQ roof pad (police/Helicopter.js): built now, before the shader warm-up — its searchlight is a fixed light */
    this.crowd.onStrike = (p, m, M) => { if (this.weapons) this.weapons.struckBy(p, m, M); }; // street fighters' punches land on the player
    this.health = new Health(this); this.phone = new Phone(this, this.hud.root); this.gunShop = new GunShopUI(this, this.hud.root); this.store = new StoreUI(this, this.hud.root); this.bank = new BankService(this); this.bank.onDeposit = () => settleDebt(this); this.hospital = this.world.hospitalBuild ? new Hospital(this) : null; this.activities = new ActivityManager(this); try { await this.activities.prewarm(tick); } catch (e) { console.warn('activities prewarm', e); } /* 92nd: after the hospital (it chains the WalkIn light pool lender); race routes computed here, never in play */ this.atm = new ATMUI(this, this.hud.root); this.garage = new Garage(this); this.bicycles = new Bicycles(this); this.skills = new Skills(this); this.stunts = new StuntJumps(this); this.hud.pauseData = () => this.pauseData(); /* skills + stunt jumps + pause-map tabs (45th) */ /* Dineth's bike (vehicles/BicycleRide.js) */ /* Street Customs ownership records (story.state.garage) */ this.debug = newDebugState(); this.debugCon = new DebugConsole(this, this.hud.root);
    this.applyDensity();
    progress(0.9, 'Lighting'); await tick();
    this.post = new PostFX(this.renderer, this.scene, this.camera); this.post.setCine(Settings.get('lensFlare') !== false, Settings.get('lightShafts') !== false); this.post.build({ bloom: Settings.preset.bloom, ao: Settings.preset.ao, cine: Settings.preset.cine }); this.post.onUpscaleFail = () => this.upscaleFailed(); this.post.setUpscale(this.sgsrK(), this.sgsrOpts()); /* 91st: Snapdragon Game Super Resolution (Settings → Graphics) */ this.world.glintsOn = Settings.get('wetReflections') !== false; this.atmos.nightBoost = Settings.get('nightBrightness') ?? 1;
    this.explosions = new Explosions(this); this.vdamage = new VehicleDamage(this); this.propBreak = new PropBreak(this); /* breakaway lamp posts / signal poles */ /* glass, bullets through bodywork, tyres, dents, fire → explosion, flung debris */ this.blood.useFx(this.explosions.U); this.grenades = new Grenades(this); // throwables (key B) + cinematic blasts
    try { this.boats = new Boats(this); } catch (e) { console.error('boats', e); this.boats = null; } /* Fort Harbour Marina, the moored fleet, harbour police boats, your boats (boats/Boats.js) */
    this.drunk = new Drunk(this); // vodka in the hero rooms (HeroRooms.js)
    this.loot = new Loot(this); // 64th: cash / belongings / weapons dropped by defeated NPCs (world/Loot.js)
    this.vsmoke = new VehicleSmoke(this, Settings.get('quality')); // tyre smoke + exhaust (one draw call, fixed pool)
    this.atmos.update(0.016, new THREE.Vector3(-300, 0, -500), this.camera, 0);
    // 66th: the police units — squad cars, jeeps and their crews — are built now and kept off the map; wanted levels, patrols
    // and roadblocks take them from this pool and hand them back (PoliceResponse / UnitPool): nothing is built mid-chase
    try { await this.police.pool.prepare((k) => progress(0.9 + 0.03 * k, 'Police units'), tick); } catch (e) { console.warn('police pool', e); }
    progress(0.93, 'Compiling shaders'); await tick();
    await bootRuntime(this); // saved animation / NPC edits (src/debug, only loaded when some were saved)
    await bootTextures(this); // 59th: Texture Studio replacements (texture-pack/ or the Studio's saved manifest; nothing is loaded when there are none)
    SoundBank.load().catch((e) => console.warn('[sounds]', e)); // replacement recordings: the built-in pack + any saved with the `sounds` window (decoded once audio starts)
    this.world.warm(-500, -400); this.world.update(0.016, { x: -500, z: -400 }, this.camera, this.atmos);
    // WaterReflection fast-path: skip dynamic vehicles, seated occupants, protagonist/squad, and police on foot in the 384px water reflection pass
    if (this._reflProv) reflSkipProviders.delete(this._reflProv);
    this._reflProv = (mark) => {
      for (const v of LIVE_VEHICLES) if (v.mesh) mark(v.mesh);
      if (this.player?.ch?.root) mark(this.player.ch.root);
      if (this.squad?.members) for (const m of this.squad.members) if (m.ch?.root) mark(m.ch.root);
      if (this.police?.foot) for (const o of this.police.foot) if (o.ch?.root) mark(o.ch.root);
    };
    reflSkipProviders.add(this._reflProv);
    try { await this.compileForGame(this.scene, 15000); } catch (e) { console.warn('compile', e); } // the main pass's programs (see compileForGame)
    this.wireEvents();
    DevLock.install(() => { try { this.hud.notify('Developer tools activated', 'Console ( ` ) and Texture Studio are back', 'success', 4); } catch (e) { /* menu */ } }); // the secret code works anywhere in the game
    if (TEST) { window.__BankSound = BankSound; window.__STUNTS = STUNTS; window.__HUMPS = HUMPS; window.__Input = Input; window.__L = L; window.__Vehicle = Vehicle; window.__Character = Character; window.__makePoliceAppearance = makePoliceAppearance; window.__THREE = THREE; window.__lightSets = { forceNightSet, lightLevel, nightSetOn: () => lightLevel() > 0 }; this.stepSim = async (n, dt = 0.05, keys = []) => { for (const k of keys) Input.down.add(k); for (let i = 0; i < n; i++) { this.updatePlay(dt); if (i === 0) Input.pressed.clear(); for (let j = 0; j < 12; j++) await null; /* let story/director promise chains advance like real frames */ } for (const k of keys) Input.down.delete(k); return { x: this.player.x, z: this.player.z, y: this.player.y, v: this.player.vehicle && this.player.vehicle.type, speed: this.player.vehicle ? this.player.vehicle.speed : this.player.speed }; }; }
    progress(1, 'Colombo is ready');
    this.last = performance.now(); this.mode = 'intro'; this.loop();
  }
  // ================================================================= presentation flow
  async boot() {
    let next = null; try { next = JSON.parse(sessionStorage.getItem('colombo.next') || 'null'); sessionStorage.removeItem('colombo.next'); } catch (e) { next = null; } // a corrupt hand-off (or storage blocked) must not stop the game from booting
    if (next) { // returning from an in-game "load" or "quit to menu": short loading screen, no studio intro
      document.getElementById('gate')?.remove(); // the entry gate is only for a fresh start
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
      // &export=1 (tools/trailer-export, the MP4 export): the trailer's sound is rendered by an offline audio context that the
      // exporter advances frame by frame with the picture, so music, dialogue and effects land on the exact video frame
      if (quick === 'trailer2' && new URLSearchParams(location.search).get('export') && window.OfflineAudioContext) Audio.init(new OfflineAudioContext(2, 48000 * 150, 48000));
      await this.load((p, l) => { window.__progress = [p, l]; });
      if (quick === 'new') return this.newGame();
      if (quick === 'trailer') return this.playTrailer(1);
      if (quick === 'trailer2') return this.playTrailer(2);
      if (new URLSearchParams(location.search).get('warm')) await this.enterLoading([[-140, -891.8]]); // &warm=1: the real enter-game loading (streaming, vehicle warm, shader compile) like a player gets
      this.story.state = Story.freshState(); this.squad.reset(); this.mode = 'play'; this.atmos.hour = 17; this.setupRoomDoor(); this.world.warm(-140, -892); this.player.teleport(-140, -891.8, Math.PI / 2);
      this.player.cinematic = false; this.player.control = true; this.hud.show(true); this.hud.fade(0, 0.3); this.story.setupWorldActivities(); this.story.startMission('m0', 0); return;
    }
    await this.screens.studioIntro((p) => this.load(p));
    if (window.__sdsTrailer) return this.playTrailer(window.__sdsTrailer === 2 ? 2 : 1); // ORIGINAL TRAILER (1) / OFFICIAL CINEMATIC TRAILER (2) on the entry gate: plays, then reloads to the gate
    await this.montage();
    await this.menuLoop();
  }
  // the trailers: 1 = the original trailer (src/story/Trailer.js), 2 = the official cinematic trailer (src/story/CineTrailer.js);
  // each is its own lazily-loaded chunk, never loaded when the game is entered normally
  async playTrailer(which = 1) {
    if (which === 2) { const { runCineTrailer } = await import('./story/CineTrailer.js'); return runCineTrailer(this); }
    const { runTrailer } = await import('./story/Trailer.js'); return runTrailer(this);
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
  async enterLoading(points, pre = []) {
    Audio.setMusic('none'); Audio.riser(5);
    startBankTextures(this.renderer); // 77th: the bank's 2048² surfaces, built by workers while the rest loads (WalkIn.preloadAll waits for them)
    await enterGameLoading(this.ui, [...pre,
      { label: 'Streaming Colombo districts', run: (pr) => this.world.warmAsync(points, pr) },
      { label: 'Vehicles of Colombo', run: (pr) => this.traffic.warmModels(points, pr) },
      { label: 'Compiling shaders', run: async (pr) => { this.camera.position.set(points[0][0], 3, points[0][1] + 6); this.camera.lookAt(points[0][0], 1.5, points[0][1]); this.camera.updateMatrixWorld(); for (const v of LIVE_VEHICLES) setVehicleLOD(v.mesh.userData, true); /* near-LOD parts too (the next frame's LOD pass puts them back) */ const ws = this.shaderWarmSet(); this.scene.add(ws); try { const pw = this.police && this.police.pool && this.police.pool.ready ? this.police.pool.warmGroup(this.camera) : null; if (pw) { this.scene.add(pw); pw.updateMatrixWorld(true); this._polWarm = pw; } } catch (e) { console.warn('police warm', e); } /* 73rd: the pooled police units / crews / rifles / torches in view: compiled here (every light level), drawn once in 'Waking the city' */ const lv0 = lightLevel(); try { for (const lv of [lv0, ...LIGHT_LEVELS.filter((l) => l !== lv0)]) { forceNightSet(lv); await this.compileForGame(this.scene, 8000); } /* every light level (LightSets): dusk / dawn / a torch only rebinds */ } catch (e) { console.warn('compile', e); } finally { forceNightSet(null); markWarm(this.scene); this.scene.remove(ws); if (this._polWarm) { this._polWarm.userData.restore(); this._polWarm = null; } } pr(0.5); await this.warmLightSets((k) => pr(0.5 + k * 0.5)); try { captureToCanvas(this.renderer, this.scene, this.camera, 0, 0, 2, 2); /* the map / busted capture output program */ } catch (e) { console.warn('capture warm', e); } pr(1); } },
      { label: 'Furnishing shop interiors', run: async (pr) => { try { const W = this.interiors && this.interiors.walkIn; if (W) { this.interiors.setupWalkIns(); await W.preloadAll(pr, (root) => this.compileAndPredraw(root)); } if (this.hospital) await this.hospital.precompile((root) => this.compileAndPredraw(root)); if (this.interiors && this.interiors.preloadDoors) await this.interiors.preloadDoors((root) => this.compileAndPredraw(root)); /* 80th: the club + Police HQ too */ } catch (e) { console.warn('shop preload', e); } } }, // 54th: every walk-in room built, uploaded and compiled now — no hitch at the door
      { label: 'Waking the city', run: async (pr) => { await this.prebuildServices(); for (let i = 0; i < 4; i++) { this.camera.rotation.y += Math.PI / 2; this.camera.updateMatrixWorld(); let pw = null; if (i === 0) { try { pw = this.police && this.police.pool && this.police.pool.ready ? this.police.pool.warmGroup(this.camera) : null; if (pw) { this.scene.add(pw); pw.updateMatrixWorld(true); } } catch (e) { console.warn('police warm', e); } } /* 73rd: the police pool drawn once (shadow-depth programs, geometry / texture upload) */ try { this.warmLevelFrames(); /* through the real post chain, once per light level: the main-pass target's programs, shadow-depth programs and every post pass */ } finally { if (pw) pw.userData.restore(); } pr((i + 1) / 4); await new Promise((r) => requestAnimationFrame(r)); } } },
    ], { minMs: TEST ? 1500 : 6200, onFlash: () => Audio.boom() });
    this.hud.fade(1, 0); await new Promise((r) => requestAnimationFrame(r));
    const gpu = gpuInfo(this.renderer); console.info('[COLOMBO] GPU:', gpu.label, '·', gpu.api, '·', gpu.kind);
    if (!this.gpuWarned && (gpu.kind === 'software' || gpu.kind === 'integrated')) { this.gpuWarned = true; this.hud.notify(gpu.kind === 'software' ? 'Graphics card not in use' : 'Integrated graphics', gpuAdvice(gpu), 'warn', 9); }
  }
  // 86th: the filling stations' attendants and Street Customs' mechanics were built by the first free-play frame (FuelService /
  // CustomsService are created lazily in updatePlay): ~0.7 s measured on the test machine, a freeze right as play began. Built
  // here behind the loading screen instead (before the warm frames, so their programs compile there too).
  async prebuildServices() {
    try { if (this.world.fuel && !this.fuelSvc) this.fuelSvc = new FuelService(this.world.fuel, { crowd: this.crowd, traffic: this.traffic, scene: this.scene, player: this.player }); } catch (e) { console.warn('prebuild fuel', e); }
    try { if (this.world.customs && !this.customs) this.customs = new CustomsService(this, this.world.customs); } catch (e) { console.warn('prebuild customs', e); }
    // their people's bodies too (station attendants, workshop mechanics: their own uniform looks, 100-270 ms each the first time
    // one streamed in): built once here, the cached geometry serves every later spawn
    // and every traffic-police post's officer (64 posts, each its own look: 30-60 ms on the test machine the first time a post came on
    // duty while driving by)
    const looks = []; try { if (this.fuelSvc) looks.push(...this.fuelSvc.looks()); if (this.customs) for (const m of this.customs.mech) looks.push(m.appearance()); if (this.trafficDuty) looks.push(...this.trafficDuty.looks()); } catch (e) { console.warn('prebuild looks', e); }
    let t0 = performance.now(); for (const sp of looks) { try { new Character(sp).dispose(); } catch (e) { console.warn('prebuild look', e); } if (performance.now() - t0 > 30) { await new Promise((r) => setTimeout(r, 0)); t0 = performance.now(); } } // the loading screen keeps animating
  }
  async newGame() {
    if (this.atm) this.atm.reset(); BankSound.stopNow(); // 67th: no ATM screen / bank room tone carried into a new game
    this.story.state = Story.freshState(); this.loot?.clear(); this.cityEvents?.reset(1); /* 81st: a fresh event calendar */ this.activities?.reset(); this.clock = 0; this.mode = 'play'; this.paused = false; this.squad.reset(); this.orchid.load(null); this.grenades?.clear(); this.rebuildPlayer(); if (this.customs && this.customs.active) this.customs.abort(); this.garage.restore(); /* no owned vehicles in a new game */
    this.hud.clearBlips(''); this.focus = null; this.setupRoomDoor(); if (this.boats) this.boats.onLoad();
    try { this.weapons.prewarmOwned(); } catch (e) { console.warn('prewarm', e); } // 73rd
    await playOpening(this);
    Input.requestLock(this.canvas);
    this.story.setupWorldActivities(); this.story.startMission('m0', 0); this.autosave();
  }
  async startLoaded(slot) {
    const d = SaveSystem.read(slot); if (!d) return this.menuLoop();
    if (this.atm) this.atm.reset(); BankSound.stopNow(); // 67th: the ATM screen is never part of a save; the room tone restarts on entering
    if (this.vsmoke && this.vsmoke.skid) this.vsmoke.skid.clear(); /* a loaded game starts with clean roads */ this.story.restore(d.story); this.loot?.clear(); /* loot lying in the world is never saved: a reload cannot hand it out twice */ this.atmos.restore(d.atmos); try { this.cityEvents?.restore(d.events); this.activities?.restore(d.activities); } catch (e) { console.warn('events restore', e); this.cityEvents?.reset(1); } /* 81st */ if (this.power) { this.power.restoreAll(); this.power.settle(); this.power.restoreState(d.power); } this.crowd.minds.load(d.minds); /* NPC memories / relationships (Mind.js); an older save has none */ this.clock = d.clock || 0; this.squad.load(d.squad); this.rebuildPlayer(); this.weapons.load(d.weapons); this.squad.load(d.squad); this.orchid.load(d.orchid); this.pendingWanted = d.police ? d.police.level : d.weapons ? d.weapons.heat : 0;
    const p = d.player || { x: L.PLACES.meeting.x, z: L.PLACES.meeting.z, yaw: 0 }; if (this.customs && this.customs.active) this.customs.abort(); { const P = this.player, veh = P.vehicle; if (veh) { veh.speed = 0; veh.mesh.remove(P.ch.root); this.scene.add(P.ch.root); veh.player = false; P.vehicle = null; P.exiting = null; P.entry = null; P.ch.anim.standUp(); this.traffic.release(veh); P.respawnReset(); } } /* loading a save while driving: the save's player is on foot (as Health.js does on respawn) */ if (this.atm) this.atm.reset(); BankSound.stopNow(); this.world.warm(p.x, p.z); this.player.teleport(p.x, p.z, p.yaw); this.squad.regroup(); this.garage.restore(); // owned (customised) vehicles back where they were parked
    { const P = this.player; if (P.indoor && P.indoor.walkIn) { const r = P.indoor.room; P.indoor = null; if (r && r.onExit) r.onExit(); } } // 67th: a loaded game starts on the street (stale walk-in room state cleared)
    this.player.cinematic = false; this.player.control = true; this.mode = 'play'; this.paused = false; this.hud.show(true); this.director.active = false;
    if (this.pendingWanted) { this.police.restore(this.pendingWanted); this.pendingWanted = 0; }
    this.story.setupWorldActivities(); this.setupRoomDoor(); if (this.boats) this.boats.onLoad();
    const m = this.story.state.mission; if (m.id && m.stage > 0) this.story.startMission(m.id, m.stage); else if (m.id === 'm0') this.story.startMission('m0', 0); else this.story.offerNext();
    try { this.weapons.prewarmOwned(); } catch (e) { console.warn('prewarm', e); } // 73rd: the crew's guns built behind the black screen — no hitch on a first switch
    for (let i = 0; i < 30; i++) this.updatePlay(0.033, true);
    await this.hud.fade(0, 0.8); this.hud.notify('Game loaded', `${d.missionTitle || 'Free roam'} · ${d.timeString || ''}`, 'success', 3); Audio.setMusic('explore');
  }
  // Every material's shader is keyed by the scene's light counts. The walk-in Police HQ interior (6 point lights) appears without a
  // fade whenever the player comes within 150 m; the first time that count is seen every visible material recompiles: a long stall
  // in the middle of a drive. Compile that variant here instead, with dark stand-in lights (three caches programs per light set, so
  // later toggles only rebind). Shops / hero rooms are entered behind a fade with only the room on screen: not worth the memory.
  async warmLightSets(pr = () => {}) {
    const extra = [6]; const g = new THREE.Group(); g.name = 'lightWarm'; this.scene.add(g);
    try {
      const lv0 = lightLevel(); let n = 0; // in every light level (LightSets)
      for (const lv of [lv0, ...LIGHT_LEVELS.filter((l) => l !== lv0)]) { forceNightSet(lv); for (let i = 0; i < extra.length; i++) {
        while (g.children.length < extra[i]) { const l = new THREE.PointLight(0xffffff, 0, 1, 2); l.position.set(0, -800, 0); g.add(l); }
        await this.compileForGame(this.scene, 5000);
        pr(++n / (extra.length * LIGHT_LEVELS.length));
      } }
    } catch (e) { console.warn('light-set compile', e); }
    forceNightSet(null); this.scene.remove(g); for (const l of g.children) l.dispose?.();
  }
  // The headlight spots' shadow-depth programs (alpha-tested foliage, cut-outs…) are built by the shadow mapper the first time a
  // spot shadow pass draws such an object — normally the first lit beam at dusk, a visible hitch. Before a loading-screen frame:
  // the (dark) spots sit at the camera aimed the way it looks, so that frame's shadow passes build them. LightSets keeps them in
  // the shaders for a while after a warm-up (level 2 hold); HeadlightRig moves them onto real cars once beams are lit.
  // Shadow-depth programs are keyed by the scene's light counts too (three puts them in every program key) and are only built
  // when a shadow pass first draws a material — compile() cannot reach them. So each loading-screen warm frame is drawn once per
  // light level (LightSets), with the dark spots aimed from the camera: day, night and torch-lit depth variants all exist before play.
  warmLevelFrames() { for (const lv of [2, 1, 0]) { forceNightSet(lv); this.warmSpotShadows(); if (this.post) this.post.render(1 / 60); else this.renderer.render(this.scene, this.camera); } forceNightSet(null); }
  warmSpotShadows() { const hs = (this.headRig && this.headRig.spots) || []; const c = this.camera, d = c.getWorldDirection(new THREE.Vector3());
    for (const sp of hs) { if (!sp.castShadow) continue; sp.position.copy(c.position); sp.target.position.copy(c.position).addScaledVector(d, 20).setY(c.position.y - 4); sp.target.updateMatrixWorld(); sp.updateMatrixWorld(); sp.shadow.needsUpdate = true; } }
  // Compile shader programs the way the game draws: the main pass renders into the composer's half-float target (linear output,
  // tone mapping in the OutputPass), and a material's program depends on that. Compiling with no target bound — as the loading
  // screen did — built the to-canvas variants, which the game never draws with, so the real ones compiled during the first
  // seconds of play (and whenever something new came into view). KHR_parallel_shader_compile (compileAsync) keeps the page alive.
  // 85th: an interior is compiled AND drawn once while loading (its buffers uploaded) — no upload burst when its door opens
  async compileAndPredraw(root, ms = 4000) { await this.compileForGame(root, ms); predraw(this.renderer, this.scene, this.camera, root); }
  async compileForGame(root = this.scene, ms = 8000) {
    const R = this.renderer, rt = this.post && this.post.composer ? this.post.composer.renderTarget1 : null, prev = R.getRenderTarget(); let p = null;
    R.setRenderTarget(rt); try { if (R.compileAsync) p = R.compileAsync(root, this.camera, this.scene); else R.compile(root, this.camera, this.scene); } finally { R.setRenderTarget(prev); }
    if (p) await Promise.race([p, wait(ms)]);
  }
  // materials that otherwise first appear mid-play: every vehicle's own lamp / beacon materials and its near-LOD parts, one of
  // each body family, the police / ambulance units and every motorcycle (their parts differ: carbon, alloy, engine, livery)
  makeCustomsUI(svc) { return new CustomsUI(this, svc, this.hud.root); }
  vehicleName(t) { if (VNAMES[t]) return VNAMES[t]; const T = VTYPES[t]; if (T && T.make && T.model) return `${T.make[0].toUpperCase()}${T.make.slice(1)} ${T.model}`; return t; } // catalogue vehicles: fictional make + model
  shaderWarmSet() {
    const g = new THREE.Group(); g.name = 'shaderWarm'; g.visible = false; const seen = new Set();
    for (const [k, T] of Object.entries(VTYPES)) { const key = T.police ? 'police' : T.ambulance ? 'amb' : T.entry === 'bike' ? k : (T.base || k) + (T.family || ''); if (seen.has(key)) continue; seen.add(key);
      try { const m = createVehicleMesh(k, 1); if (m.userData.detail) setVehicleLOD(m.userData, true); g.add(m); } catch (e) { console.warn('warm set', k, e); } }
    if (this.vdamage) g.add(this.vdamage.warmGroup()); if (this.loot) g.add(this.loot.warmMesh()); // the loot batch (one note) // damaged glass, charred shell, bullet holes, shards / fragments
    for (const m of [...customsWarmMeshes(), wheelsWarmMesh(), paintWarmMesh()]) g.add(m);
    try { if (this.world && this.world.groundDetail) for (const m of this.world.groundDetail.warmMeshes()) g.add(m); } catch (e) { console.warn('warm set: ground detail', e); } try { if (this.world && this.world.grassGPU) for (const m of this.world.grassGPU.warmMeshes()) g.add(m); } catch (e) { console.warn('warm set: grass', e); } // 90th: GPU grass program // 85th: kerb stones / joint grass / leaves / litter // Street Customs: neon strip / glow pool, custom rim, custom paint programs
    return g;
  }
  setupRoomDoor() { const r = this.story.state.flags.room; this.interiors.setupDoors(r || null); }
  // ================================================================= services used by Story / Director
  autosave() { if (this.mode === 'play' && !this.director.active) this.saveTo('auto'); }
  saveTo(slot) {
    const P = this.player; let pos = { x: P.x, z: P.z, yaw: P.yaw };
    if (this.interiors.current) { const d = this.interiors.current.door; pos = { x: d.x, z: d.z, yaw: d.faceIn + Math.PI }; } else if (P.indoor && P.indoor.walkIn && P.indoor.site) { const d = P.indoor.site.door; pos = { x: d.x, z: d.z, yaw: d.faceIn + Math.PI }; } else if (P.indoor && P.indoor.hospital) { pos = this.hospital.outsidePos(); } /* 74th: saved in the forecourt, not inside the building */ /* 67th: in a walk-in shop / the bank (e.g. the ATM's autosave) → saved on the pavement outside its door, never inside the building shell */ else if (P.vehicle) { const e = P.vehicle.exitPoint(-1); pos = { x: e.x, z: e.z, yaw: P.vehicle.yaw }; } else if (P.boat) pos = { x: MARINA.gangTop.x, z: MARINA.gangTop.z, yaw: -Math.PI / 2 }; /* on a boat: the save puts you on the quay by the marina */
    const m = MISSIONS.find((q) => q.id === this.story.state.mission.id); if (this.garage) this.garage.snapshot(); // owned vehicles where they stand now (Street Customs)
    return SaveSystem.write(slot, { minds: this.crowd.minds.save(), story: this.story.serialize(), atmos: this.atmos.serialize(), power: this.power ? this.power.serialize() : null, player: pos, weapons: this.weapons.save(), squad: this.squad.save(), orchid: this.orchid.save(), police: this.police.save(), events: this.cityEvents ? this.cityEvents.serialize() : null, activities: this.activities ? this.activities.serialize() : null, clock: this.clock, missionTitle: m ? m.title : 'Free roam', timeString: `Day ${this.atmos.day} · ${this.atmos.timeString}` });
  }
  async restUntil(hour) {
    const P = this.player; P.control = false; await this.hud.fade(1, 0.8); let dh = hour - this.atmos.hour; if (dh < 0) dh += 24; this.atmos.advance(dh * 60); if (this.boats) this.boats.onRest(); /* slept: boats on order are delivered */
    this.hud.notify('Rested', `It is now ${this.atmos.timeString}`, 'info', 3); this.player.stamina = 1; this.atmos.update(0.016, new THREE.Vector3(P.x, 0, P.z), this.camera, 0); await wait(400);
    await this.hud.fade(0, 0.8); P.control = true; this.setupRoomDoor(); this.autosave();
  }
  async playEnding(kind, state) { this.player.control = false; await this.hud.fade(1, 1.2); this.hud.show(false); Input.releaseLock(); this.ignoreUnlock = true; await this.screens.ending(kind, state); this.ignoreUnlock = false; this.hud.show(true); await this.hud.fade(0, 1); this.player.control = true; Input.requestLock(this.canvas); this.autosave(); }
  rebuildPlayer(lookOverride) {
    if (this.crowd && lookOverride === undefined) this.crowd.viralUntil = 0; // fresh outfit clears ColomboLive street recognition
    const P = this.player; const id = this.squad ? this.squad.activeId : 'dineth'; const fits = this.story.state.outfits || {}; const spec = this.debug?.playerSpec || applyLook(HEROES[id], lookOverride !== undefined ? lookOverride : fits[id]); // wardrobe look (shops) or the tailor's jacket colour (older saves: a colour string)
    const old = P.ch; const parent = old.root.parent; const ch = new Character(spec); ch.root.position.copy(old.root.position); ch.root.rotation.copy(old.root.rotation);
    if (parent) { parent.add(ch.root); parent.remove(old.root); } if (this.grenades) this.grenades.end(); if (this.weapons) { this.weapons.forceHolster(); this.weapons.attach(ch); } old.dispose(); P.ch = ch; if (this.squad) this.squad.replaceChar(id, ch); if (P.vehicle) { const seat = P.vehicle.driverSeat(); ch.root.position.set(seat.x, seat.y, seat.z); ch.root.rotation.set(0, 0, 0); ch.anim.sitIn(seat, 1); ch.anim.update(0.001, 0); }
  }
  // protagonist skin / clothing layer: rain soaks skin and clothes outdoors (not inside vehicles or interiors) and dries
  // slowly; sweat builds with exertion, faster in the midday heat and humid monsoon air, and fades at rest
  heroSkin(dt) {
    const A = this.atmos; const chars = this.squad ? this.squad.members.map((m) => m.ch) : [this.player.ch];
    for (const ch of chars) { const U = ch && ch.heroU; if (!U) continue; const P = this.player; const inVeh = ch === P.ch ? !!P.vehicle : !!ch.inVehicle;
      const roof = this.indoor || (ch === P.ch && !!P.indoor); /* walk-in shop / HQ: under a roof */ const rain = roof || inVeh ? 0 : A.w.rain || 0; const wet = U.uWet.value; TUNE_ENV.wet = wet; /* Customs semi-slick tyres lose grip on wet roads */ U.uWet.value = clamp(wet + (rain > 0.2 ? dt * 0.06 * rain : -dt * (roof || inVeh ? 0.012 : 0.004)), 0, 1);
      const spd = ch.anim ? ch.anim.speed || 0 : 0; const heat = A.night ? 0.4 : 0.6 + 0.4 * Math.max(0, 1 - Math.abs(A.hour - 13) / 4); const humid = 0.8 + 0.4 * Math.min(1, A.w.rain + (A.weather === 'overcast' ? 0.3 : 0));
      const exert = spd > 4.5 ? 1 : spd > 2.2 ? 0.35 : 0; const sw = U.uSweat.value; U.uSweat.value = clamp(sw + (exert * heat * humid * 0.02 - (exert ? 0 : 0.006)) * dt * (this.indoor ? 0.6 : 1) * 1, 0, 1); }
  }
  // 79th: the city's electricity (src/world/PowerGrid.js) — signals go dark / flash amber in an outage, lamps, windows, signs
  // and shop fronts follow through the shader; the hospital and police HQ have backup generators. News of it on the HUD.
  initPower() {
    const G = this.power = new PowerGrid(this); POWER_GRID.cur = G; const NAMES = { port: 'the Port', gfgreen: 'Galle Face Green', gftowers: 'the Galle Face towers', beira: 'Beira Lake', slave: 'Slave Island', havelock: 'Havelock Town' };
    const nm = (z) => (L.DISTRICTS[z] && L.DISTRICTS[z].name) || NAMES[z] || z; const WHY = { transformer: 'a transformer blew', lightning: 'lightning struck the lines', storm: 'storm damage', substation: 'a substation tripped', loadshedding: 'scheduled load shedding', console: 'a test cut', test: 'a test cut' };
    const sync = () => { L.SIGNAL_POWER.dark = G.outages().length || G.dim ? (n) => (G.levelAt(n.x, n.z) > 0.5 ? 0 : signalBackup(n) ? 2 : 1) : null; }; // (no lookup at all while every district is on)
    G.onChange((ev) => { sync(); const H = this.hud; if (!H || !H.notify) return;
      if (ev.type === 'outage' && ev.cause !== 'substation') H.notify('Power cut', `${nm(ev.zone)} — ${WHY[ev.cause] || 'a fault'}. Signals are out: junctions are all-way stops.`, 'warn', 5);
      else if (ev.type === 'substation') H.notify('Power cut', `${ev.name} tripped — several districts are dark.`, 'warn', 5);
      else if (ev.type === 'restore') H.notify('Power restored', nm(ev.zone), 'info', 3);
      else if (ev.type === 'generator') H.notify('Backup generator', ev.site === 'hospital' ? 'The National Hospital is on generator power.' : 'Police headquarters is on generator power.', 'info', 3); });
    G.onSettled = sync;
  }

  setIndoor(v) { this.indoor = v; this.world.root.visible = !v; this.atmos.rain.visible = false; this.atmos.indoor = v; this.hud.mini.classList.toggle('dim', v); if (v) this.hideOutdoor(); else this.showOutdoor(); }
  // FPS: while inside an interior nothing of the street is visible, so street traffic, crowd, trains and other
  // outdoor objects are hidden (not drawn, not shadow-cast) and their simulation pauses; restored on exit.
  isOutdoorObj(c) { if (c.isLight || c.isCamera || c === this.player.ch.root || c.name === 'hq-interior' || c.userData.interior) return false; for (const r of this.interiors.built.values()) if (r.g === c) return false; return c.position.y > -15; }
  hideOutdoor() { if (!this._hiddenOut) this._hiddenOut = []; for (const c of this.scene.children) if (c.visible && this.isOutdoorObj(c)) { c.visible = false; this._hiddenOut.push(c); } }
  showOutdoor() { for (const c of this._hiddenOut || []) c.visible = true; this._hiddenOut = []; }
  // ================================================================= events → audio / HUD
  wireEvents() {
    VEH_HOOKS.objHit = (v, c, vn, vt) => ObjectAudio.vehicleHit(v, c, vn, vt); // 76th: vehicles striking bins / poles / railings / walls (ObjectAudio.js)
    VehicleAudio.init(this); CarRadio.init(this); // 76th: engine start / stop / cooling, indicators, gears, brakes, tyres (VehicleAudio.js) · the car radio (CarRadio.js)
    Footsteps.init(this); Audio.stepHook = (x, z, k) => { Footsteps.npc(x, z, k); return true; }; // 76th: surface / gait / wetness footsteps + foley (Footsteps.js)
    bus.on('footstep', (e) => Footsteps.playerStep(e));
    bus.on('horn', (v) => Audio.horn(v.type, v.x, v.z, v.tune ? v.tune.horn : null, v)); // emitters gate it first with Audio.hornFree (one 2 s horn per vehicle)
    bus.on('crash', (v) => Audio.crash(v));
    bus.on('land', () => Footsteps.land());
    bus.on('towed', (v) => this.hud.notify('Vehicle towed', `Your ${VNAMES[v.type] || 'vehicle'} was left unattended for 5 minutes and a CMC tow truck has taken it away.`, 'info', 5));
    bus.on('enterVehicle', ({ v, hadDriver }) => { if (v && v.T && v.T.pedal) return; /* the bicycle shows its own hint (BicycleRide.js) */ if (hadDriver) VehicleAudio.tookRunning(v); if (hadDriver) { this.hud.subtitle('Driver', 'Ado! What are you doing? That\'s my vehicle!', '', 2.8); Voices.say(null, 'carjack', v.x, v.z, null, 'driver'); } this.hud.notify(VNAMES[v.type] || 'Vehicle', `${this.hud.key('enter')} exit · ${this.hud.key('horn')} horn · ${this.hud.key('lights')} lights · ${this.hud.key('indL')} ${this.hud.key('indR')} indicators · ${this.hud.key('radio')} / ${this.hud.key('radioPrev')} radio`, 'info', 3.5); Audio.ui('door'); });
    bus.on('npcLineRaw', ({ who, text, voice }) => { const d = voice && voice.spec ? Voices.say(voice.spec, voice.sit, voice.x, voice.z, voice.who || null, voice.group) : 0; this.hud.subtitle(who, text, '', Math.max(2.4, d + 0.3)); }); // carjacked driver (console: dialogs → Car stolen)
    // (76th: the radio stays on in the vehicle you leave — heard muffled from outside — CarRadio.js)
    bus.on('doorOpen', () => Audio.doorOpen()); bus.on('doorSlam', ({ s }) => Audio.doorSlam(s));
    bus.on('npcLine', ({ ped, line, prio, cat, group }) => {
      // a recorded voice for this speaker / situation (console: dialogs) is heard out to ~40 m, subtitles or not; without one the
      // synthesised blip below stays as it was
      let voiced = 0; { const P = this.player; const d = Math.hypot(ped.x - P.x, ped.z - P.z); if (d < 40 && !this.director.active && !this.indoor) { voiced = Voices.line(ped.sp, cat, ped.x, ped.z, ped.voice || (ped.ch ? ped : null), group); if (voiced && ped.ch) ped.voiceDur = voiced; } }
      if (!Settings.get('subtitles') && prio < 1) return; const P = this.player; const d = Math.hypot(ped.x - P.x, ped.z - P.z); if (d > (prio ? 16 : 9) || this.director.active || this.indoor) return;
      if ((this.hud.subUntil || 0) > performance.now() && (!prio || this.story.running)) return; const lang = line.si ? 'si' : line.ta ? 'ta' : 'en'; const who = ped.sp?.profile === 'tourist' ? 'Tourist' : ped.sp?.sex === 'f' ? (ped.sp.age === 'elder' ? 'Aunty' : 'Woman') : (ped.sp?.age === 'elder' ? 'Uncle' : 'Man');
      this.hud.subtitle(who, line.si || line.ta || line.en, line.tr || '', Math.max(3, voiced + 0.4), lang); if (!voiced) Audio.talkBlip(lang, voiceTone(ped.mind), ped.sp?.sex === 'f'); // pitch / tempo / loudness follow the speaker's feelings
    });
    bus.on('pedHit', (p) => { if (p && p.knockedByCar) Audio.crash(4); });
    bus.on('pedReport', (e) => { if (this.police) this.police.report(e); });
    bus.on('socialPost', (ev) => {
      if (this.phone) this.phone.pushLivePost(ev);
      if (ev && ev.playerInvolved && this.mode === 'play' && !this.director.active) {
        this.hud.notify('ColomboLive · Clip Uploaded', `A witness uploaded footage of you! Open Phone (${this.hud.key('phone')}) → ColomboLive.`, 'warn', 5);
      }
    });
    bus.on('pedHit', (p) => { const P = this.player; if (!this.police || !p || this.mode !== 'play' || p.contractKill) return; const src = P.vehicle || P; if (Math.hypot(p.x - src.x, p.z - src.z) > 10) return; if (p.knockedByCar) { if (P.vehicle) this.police.crime(p.x, p.z, 'vehicle'); } else this.police.crime(p.x, p.z, 'assault'); }); // only incidents the player caused
  }
  // ================================================================= input
  onKey(code) {
    if (this.mode !== 'play' || this.paused || this.bench) return; // (91st: the benchmark owns Esc while it runs)
    if (code === 'Escape') { if (this.gunShop?.open || this.customs?.active || this.debugCon?.menuOpen || this.debugCon?.open || this.editorHook) return; if (this.phone?.open) this.phone.toggle(false); else if (this.photo) this.togglePhoto(false); else if (this.hud.bigMapOpen) this.toggleMap(false); else if (!this.director.active) this.openPause(); }
  }
  async runBenchmark(opts) { const why = opts && opts.scene ? null : Benchmark.canRun(this); if (why) { this.hud.notify('Benchmark', why, 'warn', 3); return null; } return new Benchmark(this, opts).run(); }
  async openPause() {
    if (this.paused || this.director.active) return; this.paused = true; Input.releaseLock(); Audio.ui('click');
    const r = await this.screens.pause(); this.paused = false; this.last = performance.now();
    if (r.action === 'map') { this.toggleMap(true); }
    else if (r.action === 'load') { sessionStorage.setItem('colombo.next', JSON.stringify({ action: 'load', slot: r.slot })); location.reload(); }
    else if (r.action === 'benchmark') { this.runBenchmark({ scene: Settings.get('benchScene') || 'city' }); } else if (r.action === 'benchmark-cpu') { this.runBenchmark({ scene: 'cpu' }); } // 93rd: CPU worker benchmark // 91st: Settings → Graphics → Run benchmark (src/gfx/Benchmark.js)
    else if (r.action === 'textures') { openTextureStudio(this).catch((e) => { console.error(e); this.hud.notify('Texture Studio failed to load', String((e && e.message) || e), 'warn'); }); } // dev builds only (src/debug/boot.js TEXTURE_STUDIO)
    else if (r.action === 'menu') { this.autosave(); sessionStorage.setItem('colombo.next', JSON.stringify({ action: 'menu' })); location.reload(); }
    else { this.ignoreUnlock = true; Input.requestLock(this.canvas); setTimeout(() => (this.ignoreUnlock = false), 300); }
  }
  toggleMap(v) { const open = this.hud.toggleBigMap(v, this.player.x, this.player.z); this.hud.bigMapOpen = open; if (open !== this.mapAudio) { this.mapAudio = open; Audio.mapScreen(open); if (!open) this.musicT = 0; } /* 57th: map music + ducked world */ this.ignoreUnlock = true; if (open) Input.releaseLock(); else Input.requestLock(this.canvas); setTimeout(() => (this.ignoreUnlock = false), 300); this.player.control = !open && !this.photo; }
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
    if (this.noRender) return; // headless tests (TEST mode): step the sim with stepSim() without paying for frames
    const now = performance.now(); const raw = (now - this.last) / 1000; this.last = now; this.rawDt = raw; /* 91st: the benchmark records the unclamped frame interval */ const dt = Math.min(TEST ? 0.5 : 0.05, Math.max(0.0005, raw));
    this.fps = lerp(this.fps, 1 / Math.max(raw, 1e-3), 0.05); this.dynRes(Math.min(raw, 0.25));
    Input.pollGamepad();
    const t0 = performance.now(); this.frameStep(dt); this.cpuMon.add(raw * 1000, performance.now() - t0); // 93rd: frame interval + main-thread time of this frame (sim + draw submission)
    Input.endFrame();
  }
  // one frame of simulation + drawing with a given timestep: the rAF loop above, and the trailer's MP4 export
  // (tools/trailer-export: fixed 1/fps steps, every frame captured) which drives it directly while the loop idles (noRender)
  // 65th — occlusion culling + LOD, once per frame before the matrix pass. The horizon (OcclusionCuller) is rebuilt from where the
  // camera will be, a little CPU time per frame (OCC_CFG.budgetMs); it is used only while the camera is inside its validity
  // sphere (otherwise nothing is occlusion-culled that frame). Indoors (rooms, interiors, the seam into them) it is off.
  cullStep(dt) {
    const cam = this.camera, W = this.world; CULL.camera = cam; CULL.eye.copy(cam.position); CULL.occOn = false; const st = CULL.stats; this.cullLast = { ...st }; st.drawn = st.occluded = st.lodCoarse = st.distCut = 0;
    if (this.atmos) { CULL.sunCamera = this.atmos.sun.shadow.camera; CULL.farCamera = this.atmos.sunFar.shadow.camera; }
    const occ = W && W.occ;
    if (occ) {
      const lp = this._cullLast || (this._cullLast = cam.position.clone()), v = this._cullVel || (this._cullVel = new THREE.Vector3()), t = this._cullTmp || (this._cullTmp = new THREE.Vector3());
      const jump = lp.distanceTo(cam.position); if (jump > 25 || !(dt > 0)) v.set(0, 0, 0); else { t.subVectors(cam.position, lp).divideScalar(Math.max(dt, 1 / 240)); v.lerp(t, 0.35); }
      lp.copy(cam.position);
      const inside = !!this.indoor || (this.seamKWalk || 0) > 0.01; // walk-ins only (the hospital's blend is in seamK, not here)
      if (OCC_CFG.enabled && !inside && this.occlusion !== false) { occ.update(cam, dt, v); CULL.occOn = occ.validAt(cam.position); } else occ.invalidate();
    }
    if (W && W.cullProps) W.cullProps(cam.position, this.atmos ? this.atmos.sun.target.position : cam.position, this.atmos ? this.atmos.sunDir.y : 0.7);
    // every shadow-casting light (and the water mirror, Water.js) still sees what is hidden from the main camera
    if (!this._shadowCams || (this._shadowCamT = (this._shadowCamT || 0) + dt) > 2) { this._shadowCamT = 0; const L = (this._shadowCams = []); const R = this.renderer; this.scene.traverse((o) => { if (o.isLight && o.shadow && o.shadow.camera) L.push(o.shadow.camera); else if (o.isMesh) assignDepthKinds(o, R); /* 98th FPS: a depth material per mesh kind (DepthKinds.js) */ }); }
    for (const c of this._shadowCams) seeHidden(c);
  }
  // A/B switch for measurements (tools/lod-census.mjs, perf-frame): 'on' (default) | 'off' (no occlusion, LOD, draw distances or
  // near-prop shadow prefix — the previous renderer behaviour) | 'occ' (occlusion only) | 'lod' (LOD / draw distances only)
  perfConfig(name) {
    const occ = name === 'on' || name === 'occ', lod = name === 'on' || name === 'lod'; OCC_CFG.enabled = occ; LOD.enabled = lod; CULL.propNear = lod;
    if (this.world) { this.world._propGen = -3; if (!occ && this.world.occ) this.world.occ.invalidate(); } return { occ, lod };
  }
  perfStats() { const W = this.world, P = W && W.propPools ? W.propPools : []; let pm = 0, pn = 0, pa = 0; for (const p of P) { pm += p.nMain; pn += p.nNear; pa += p.nAll; }
    return { occ: { ...OCC_STATS }, cull: this.cullLast || null, occOn: CULL.occOn, props: { main: pm, near: pn, all: pa } }; }
  // people, vehicles and landmark / site groups standing wholly behind buildings: off the main camera's layer for its render
  // only (BatchCull.beginHide / endHide) — shadows, the mirror, game logic and raycasts are unaffected
  hideOccluded() {
    if (!CULL.occOn || !this.world || !this.world.occ) return 0;
    const L = this._hideL || (this._hideL = []); let n = 0; const item = () => L[n] || (L[n] = { obj: null, box: [0, 0, 0, 0, 0] });
    const W = this.world, col = W.collision, me = this.player && this.player.ch, myCar = this.player && this.player.vehicle;
    const inBuilding = (x, z) => { for (const c of col.query(x, z, x, z)) if (c.kind === 'building' && x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return true; return false; };
    for (const ch of BODIES) { const r = ch.root; if (!r || !r.parent || ch === me || !r.visible) continue; const e = r.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
      if (inBuilding(x, z)) continue; // inside a shop / house: may be seen through its door or windows
      const it = item(); it.obj = r; const b = it.box; b[0] = x - 0.8; b[1] = x + 0.8; b[2] = z - 0.8; b[3] = z + 0.8; b[4] = y + 2.3; n++; }
    for (const v of LIVE_VEHICLES) { if (!v || !v.mesh || v === myCar || !v.mesh.parent) continue; const e = v.mesh.matrixWorld.elements, x = e[12], y = e[13], z = e[14], h = (v.half || 2.5) + 0.8;
      const it = item(); it.obj = v.mesh; const b = it.box; b[0] = x - h; b[1] = x + h; b[2] = z - h; b[3] = z + h; b[4] = y + 4.5; n++; }
    if (!this._siteBoxes) { // landmark / site groups (static): world boxes once
      const S = (this._siteBoxes = []); const bx = new THREE.Box3();
      for (const g of [W.landmarks && W.landmarks.group, W.fuel && W.fuel.group, W.customs && W.customs.group, W.hospitalBuild && W.hospitalBuild.root]) if (g) { g.updateMatrixWorld(true); for (const c of g.children) { if (c.isLight) continue; bx.setFromObject(c); if (bx.isEmpty() || bx.max.x - bx.min.x > 260 || bx.max.z - bx.min.z > 260) continue; S.push({ obj: c, box: [bx.min.x, bx.max.x, bx.min.z, bx.max.z, bx.max.y + 0.5] }); } } this._siteBase = S.length; }
    // 98th (FPS): the walk-in shop doors (5 meshes each, 22 of them) join the static sites — a door behind the block in front of
    // the camera was drawn anyway. Box: the closed door's, widened by its swing (the leaf opens ≤ 1.2 m out of the frame).
    const WI = this.interiors && this.interiors.walkIn;
    if (WI && WI.sites.length !== (this._siteDoorN || 0)) { const bx = new THREE.Box3();
      for (let i = this._siteDoorN || 0; i < WI.sites.length; i++) { const d = WI.sites[i].doorObj; if (!d || !d.group) continue; d.group.updateMatrixWorld(true); bx.setFromObject(d.group); if (bx.isEmpty()) continue;
        this._siteBoxes.push({ obj: d.group, box: [bx.min.x - 1.4, bx.max.x + 1.4, bx.min.z - 1.4, bx.max.z + 1.4, bx.max.y + 0.5] }); }
      this._siteDoorN = WI.sites.length; this._siteGen = -1; }
    // 98th (FPS): static sites are tested once per horizon (the answer cannot change until the next one), at any distance — a
    // site beyond the horizon's 700 m occluder range is still hidden only when it sits below the horizon of the nearer blocks
    // on every ray across it (conservative, as for everything else); they used to be re-tested every frame, and never past 700 m
    if (this.siteOpt === false) return beginHide(L, n) + beginHide(this._siteBoxes, this._siteBase); // (A/B: the previous per-frame test of the original sites)
    const occ = W.occ, H = this._siteHid || (this._siteHid = []);
    if (this._siteGen !== occ.gen) { this._siteGen = occ.gen; H.length = 0; for (const s of this._siteBoxes) { const b = s.box; if (occ.boxTest(occ.front, b[0], b[1], b[2], b[3], b[4], Infinity) === 1) H.push(s.obj); } }
    let m = 0; for (const o of H) if (o.visible) { hideObject(o); m++; }
    return beginHide(L, n) + m;
  }
  frameStep(dt) {
    try {
      this.renderer.deferCompile = this.mode === 'play'; // 85th: in play a draw whose shader is still compiling waits a frame instead of freezing it (tools/vite/threeAsyncCompile.mjs)
      const mapOpen = this.mode === 'play' && this.hud.bigMapOpen; // the pause map freezes the world (and the hidden 3D view is not drawn)
      if ((this.mode !== 'play' || this.paused) && ClubSound.live) ClubSound.halt(); // the club's PA stops with the game (pause, menu, trailer)
      if (mapOpen) { if (Input.wasPressed('map')) this.toggleMap(false); Audio.updateMusic(dt, {}); } // the map's music keeps playing while the world is frozen
      else if (this.mode === 'play' && this.benchHook) this.benchHook(dt); // 91st: the in-game benchmark (Benchmark.js) flies the camera through the living city
      else if (this.mode === 'play' && this.editorHook) this.editorHook(dt); // a debug editor (src/debug, loaded only when typed) has the frame: the world is frozen, still drawn
      else if (this.mode === 'play' && !this.paused) this.updatePlay(dt * (this.timeSlow || 1)); // weapon wheel / squad selector slow time
      else if (this.mode === 'menu' || this.mode === 'intro') this.updateAmbient(dt);
      else if (this.mode === 'trailer' && this.trailerHook) this.trailerHook(dt); // the trailer drives the world and camera itself
      updateLightSets(dt); if (this.post && this.mode === 'play') maintainWarm(this.renderer, this.camera, this.scene, this.post.composer ? this.post.composer.renderTarget1 : null, dt); maintainPoolWarm(this.renderer, this.camera, this.scene, this.post.composer ? this.post.composer.renderTarget1 : null, dt); /* 74th: the walk-in light pool's set, before it switches on */ /* FPS: night-only light pools leave the shaders while dark (identical image); the other state stays compiled */ CAM.copy(this.camera.position); updateVehicleLOD(this.camera); if (this.vfx) this.vfx.update(dt, this.camera, this.atmos); this.instr.update(dt, this.player && this.player.vehicle); /* 84th: live dials for the player's vehicle */ /* 83rd: wipers, AI indicators, rain-on-glass / grime uniforms */ if (this.headRig && this.atmos) this.headRig.update(this.camera, this.player && this.player.vehicle, this.atmos.night, this.indoor ? 1 : (this.seamK || 0));
      if (this.post && !mapOpen && !this.ctxDead) { /* 91st: after a lost WebGL context nothing can be drawn (see webglcontextlost) */
        /* FPS (src/gfx/ViewSkip.js): one matrix pass per frame, skipping unseen people/vehicles on their off-frames; the reflection and main renders reuse it */
        this.cullStep(dt); /* 65th: occlusion horizon, per-instance culling / LOD state, prop instance order (src/gfx/BatchCull.js, Occlusion.js) */
        refreshView(this.camera, this.atmos && this.atmos.sun, this.atmos ? this.atmos.night : 0); holdVehicles(LIVE_VEHICLES, this.player && this.player.vehicle); updateSceneMatrices(this.scene); if (HOOKS.preRender.size) for (const f of HOOKS.preRender) f(dt); /* 68th: replacement rigs follow the final pose */
        withMatricesDone(this.scene, () => { const GT = this.post.timer; if (GT) { GT.frameBegin(); GT.begin('scene'); } /* 91st benchmark: GPU time of the whole frame's drawing (mirror, shadows, scene, post; SGSR separately) */ if (this.world && this.world.waterRefl) { const q = Settings.get('quality'); this.world.waterRefl.scale = q === 'ultra' ? 0.6 : 0.45; this.world.waterRefl.halfRate = q !== 'ultra'; this.world.waterRefl.update(this.renderer, this.scene, this.camera, (q === 'high' || q === 'ultra') && !this.indoor); } this.post.indoor = !!this.indoor || (this.seamK || 0) > 0.01 || this.mode !== 'play'; this.post.inside = !!this.indoor || (this.seamK || 0) > 0.5; /* cinematic pass: neutral grade + no sun effects only inside a room */ this.post.update(this.atmos); this.hideOccluded(); try { this.post.render(dt); } finally { endHide(); } });
      }
    } catch (e) { if (!this._errN || this._errN < 5) console.error(e && e.stack || e); this._errN = (this._errN || 0) + 1; this.lastError = e; }
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
    const f = this.focus || { x: cam.position.x, z: cam.position.z }; const fv = (this._fv || (this._fv = new THREE.Vector3())).set(f.x, 0, f.z); // (79th: reused, no per-frame allocation)
    this.world.simTime = this.clock; this.world.update(dt, f, cam, A); A.update(dt, fv, cam, dt); setVehicleNight(A.night); setHeadPoolNight(A.night);
    const camDir = this._camDir || (this._camDir = new THREE.Vector3()); cam.getWorldDirection(camDir);
    this.traffic.night = A.night; this.traffic.weatherRain = A.w.rain; this.traffic.gameH = (A.day || 1) * 24 + A.hour; this.traffic.update(dt, f, camDir, this.clock, this.crowd.peds, this.ghost);
    this.trains.update(dt, { focus: f, night: A.night, vehicles: this.traffic.all(), listener: true });
    this.crowd.update(dt, f, camDir, { simTime: this.clock, vehicles: this.traffic.all(), rain: A.w.rain, night: A.night, player: this.ghost, hourFactor: this.hourFactor(), hour: A.hour, police: null });
    Audio.update(dt, { listener: { x: cam.position.x, z: cam.position.z, yaw: Math.atan2(camDir.x, camDir.z) }, night: A.night, rain: A.w.rain, wind: A.w.wind, traffic: this.traffic.vehicles.length, vehicles: [], indoor: false });
  }
  // everything the pause-map tabs show (ui/PauseTabs.js)
  pauseData() {
    const P = this.player, sk = this.skills, me = sk.who(), def = SQUAD_DEFS.find((d) => d.id === me) || SQUAD_DEFS[0], A = this.atmos, st = this.story.state; const d = L.districtAt(P.x, P.z);
    const v = P.vehicle; const hs = this.health.stats || {};
    return { name: def.name, full: def.full, role: def.role, accent: def.accent, money: st.money, dayTime: A ? `DAY ${A.day} · ${A.timeString}` : '', health: this.health.hp, stamina: P.stamina, wanted: this.police ? this.police.stars() : 0,
      where: (L.roadNameAt(P.x, P.z) ? L.roadNameAt(P.x, P.z) + ', ' : '') + (d ? d.name.split(' · ')[0] : ''), vehicle: v ? (VNAMES[v.type] || 'Vehicle') : '', skills: sk.summary(me), stats: sk.stats,
      squad: SQUAD_DEFS.map((q) => ({ full: q.full, role: q.role, accent: q.accent, active: q.id === me, skills: sk.summary(q.id) })), missions: (st.done || []).length, admissions: hs.admissions || 0, busted: (this.police && this.police.stats && this.police.stats.arrests) || 0,
      carTotal: STUNTS.filter((q) => q.kind === 'car').length, bikeTotal: STUNTS.filter((q) => q.kind !== 'car').length, skillDefs: SKILLS };
  }
  hourFactor() { const h = this.atmos.hour; if (h < 5) return 0.25; if (h < 7) return 0.55; if (h < 19) return 1; if (h < 22) return 0.8; return 0.45; }
  updatePlay(dt, warmOnly = false) { BUILDS.begin(); // 85th: one heavy object build per frame (core/FrameBudget.js)
    updateDoorClosers(dt); // doors people pulled shut behind them (DoorRig)
    this.dt = dt; this.clock += dt; const P = this.player, A = this.atmos, cam = this.camera, D = this.director;
    if (!D.active && !this.debug.freezeTime) A.advance(dt / Settings.get('timeScale'));
    if (!warmOnly) this.debugCon.update();
    if (this.phone.open && (D.active || this.health.busy)) this.phone.toggle(false); // cutscene / hospital: put the phone away
    if (this.gunShop.open && (D.active || this.health.busy || !(this.indoor || (this.player.indoor && this.player.indoor.walkIn)))) this.gunShop.toggle(false); // (walk-in gun shops never set Game.indoor)
    if (this.store && this.store.open && (D.active || this.health.busy)) this.store.close();
    if (this.atm && this.atm.open && (D.active || this.health.busy)) this.atm.close(true);
    const busy = D.active || this.photo || this.hud.bigMapOpen || this.paused || this.phone.open || this.health.busy || this.gunShop.open || !!(this.store && this.store.open) || !!(this.atm && this.atm.open) || !!(this.customs && this.customs.active) || this.debugCon.menuOpen || this.debugCon.open;
    if (this.gunShop.open && !warmOnly) this.gunShop.update();
    if (this.store && this.store.open && !warmOnly) this.store.update(this.dt);
    if (this.atm && this.atm.open && !warmOnly) this.atm.update(this.dt);
    if (!warmOnly) { const wr0 = this.interiors.walkIn && this.interiors.walkIn.room; const wa0 = this.interiors.walkIn && this.interiors.walkIn.active; BankSound.tick(this.dt, !!(wr0 && wr0.bank), wa0 && wa0.bank ? wa0.audio : null); } // 71st: + the room's positional loops (air conditioners, office) // bank room tone: fades on leaving, sources released
    // global actions
    if (!D.active && !warmOnly && !(this.customs && this.customs.active)) { // Street Customs has the keyboard while it runs (W/S/A/D, R, P, M, J …): the map / phone / pause / radio hot-keys would open over the shop and take the cursor
      if (Input.wasPressed('map') && !this.photo && !this.gunShop.open && !(this.store && this.store.open) && !(this.atm && this.atm.open)) { if (this.phone.open) this.phone.toggle(false); this.toggleMap(); }
      if (Input.wasPressed('phone') && !this.hud.bigMapOpen && !this.gunShop.open && !(this.store && this.store.open) && !(this.atm && this.atm.open)) { if (this.photo) this.togglePhoto(false); else this.phone.toggle(); }
      else this.phone.update();
      if (Input.wasPressed('journal') && !this.gunShop.open && !(this.store && this.store.open) && !(this.atm && this.atm.open)) this.openPause();
      if (P.vehicle && !P.vehicle.T.pedal) { if (Input.wasPressed('radio')) CarRadio.step(P.vehicle, 1); if (Input.wasPressed('radioPrev')) CarRadio.step(P.vehicle, -1); } // 76th: the vehicle's radio — next / previous station (CarRadio.js)
    }
    if (!D.active && !warmOnly && this.mode === 'play') this.health.update(dt);
    if (!warmOnly) { const can = !busy && P.control && !P.cinematic && !this.indoor && !this.clickClaim; this.clickClaim = false; /* a click a prompt uses (berth sign) is not a punch / shot */ this.weapons.update(dt, can && !this.grenades.lockWeapons); this.grenades.update(dt, can); this.drunk.update(dt); if (this.interiors.current?.tick) this.interiors.current.tick(dt, P); }
    CHASSIS.focus = P; this.vdamage.update(dt); if (this.propBreak) this.propBreak.update(dt, P); /* burning vehicles feed the explosion light + particles: before them */ this.explosions.update(dt);
    if (!warmOnly) this.heroSkin(dt);
    this.bodies = gatherBodies(this.scene); P.bodies = this.bodies;
    if (this.boats && !D.active) this.boats.update(dt, P); /* before the player: the boat he rides moves first, the camera follows it this frame */
    if (this.photo) this.updatePhoto(dt);
    else if (!D.active) P.update(dt, this.traffic);
    if (this.atm && this.atm.open && !warmOnly) this.atm.lateUpdate(); // 71st: the bank card in the player's hand, after his pose
    if (this.weapons && this.weapons.gear) this.weapons.gear.late(dt); // 82nd: holster / sling follow the pose (thigh push, two-anchor rifle hang)
    this.squad.update(dt, busy || warmOnly || !!this.photo);
    if (!warmOnly) { this.stunts.update(dt); this.skills.update(dt); } // stunt-jump cinematic (owns the camera while it plays) + skill growth
    D.update(dt);
    if (!warmOnly) this.orchid.update(dt); // hired bodyguard / contract cinematic (owns the camera while it plays)
    // interactions on foot / vehicle
    let localPrompt = null;
    if (!busy && !warmOnly && P.control) localPrompt = this.updateInteractions(dt);
    const inRoom = this.interiors.current; const focus = inRoom && inRoom.door ? { x: inRoom.door.x, z: inRoom.door.z } : { x: P.x, z: P.z }; const fv = (this._fv || (this._fv = new THREE.Vector3())).set(P.x, P.y, P.z); // inside a shop room (built away from the street) keep the city streamed around its street door, not around the hidden room
    this.world.simTime = this.clock; this.world.indoorK = this.indoor ? 1 : (this.seamK || 0); this.world.update(dt, focus, cam, A);
    A.update(dt, fv, cam, dt); if (this.power) this.power.update(dt, { night: A.night, hour: A.hour, day: A.day, storm: A.w ? A.w.rain : 0, strikes: A.strikes || 0 }); setVehicleNight(A.night); setHeadPoolNight(A.night); updateCustoms(A.night); // Street Customs lamps (underglow, aux lenses, cabin) follow each vehicle's lights
    // walk-in Police HQ: smooth outdoor → indoor light adaptation while the city keeps running outside
    { const I = this.interiors, cur = I.current; if (cur && this.player.indoor !== cur && !this.player.indoor) { cur.g.visible = false; I.current = null; this.setIndoor(false); } } // teleported out of a shop/flat: close it
    if (!warmOnly) { if (!this.places) this.places = new PlaceAmbience(this); this.places.update(dt); PlaceSound.update(dt, this.player.x, this.player.z, this.player.camYaw ?? 0); } // 75th: positional place loops (park, garden, hospital AC / lift / monitors, CPR)
    const hk = this.indoor || warmOnly || !this.hospital ? 0 : this.hospital.update(dt); // 74th: before the walk-ins (it may borrow their light pool this frame)
    const wk = this.indoor || warmOnly ? 0 : this.interiors.updateSeamless(dt); this.seamKWalk = wk; const sk = Math.max(wk, hk); this.seamK = sk;
    // (74th: occlusion keeps running inside the hospital — it stands at its real place in the city, the culler treats the building
    //  the camera is in as hollow, and the city behind the neighbouring blocks no longer costs ~200–300 draws seen from the wards)
    if (!this.indoor && A.envBase !== undefined) this.scene.environmentIntensity = A.envBase * (1 - 0.8 * sk); // indoors, reflections would show the room, not the sky
    if (sk > 0.002) { A.sun.intensity *= 1 - 0.92 * sk; A.hemi.intensity = lerp(A.hemi.intensity, 0.8, sk); A.hemi.color.lerp(HQ_SKY, sk); A.hemi.groundColor.lerp(HQ_GND, sk); A.ambient.intensity = lerp(A.ambient.intensity, 0.3, sk); this.renderer.toneMappingExposure = lerp(this.renderer.toneMappingExposure, 1.0, sk); if (sk > 0.5) A.rain.visible = false; }
    if (this.indoor) { A.sun.intensity = 0; A.hemi.intensity *= 0.25; A.ambient.intensity = 0.25; this.scene.environmentIntensity = 0.12; A.rain.visible = false; this.renderer.toneMappingExposure = 1; }
    if (!warmOnly) updateBankFX(this); // 78th: the bank hall's reflection probe / indirect light while the player is inside (BankFX.js)
    if (!this.indoor && (this.player.indoor || underFortRoof(cam.position.x, cam.position.z))) A.rain.visible = false; // (or under the Fort station's roofs: the halls and the train shed)
    if (!this.indoor && this.player.indoor) A.rain.visible = false; // in a walk-in shop / the HQ: no rain streaks in the room
    const camDir = this._camDir || (this._camDir = new THREE.Vector3()); cam.getWorldDirection(camDir);
    if (this.indoor) this.hideOutdoor(); // anything spawned since entering (police units etc.) stays hidden too
    if (!this.indoor) this.traffic.night = A.night; this.traffic.weatherRain = A.w.rain; this.traffic.gameH = (A.day || 1) * 24 + A.hour; if (!this.indoor) this.traffic.update(dt, focus, camDir, this.clock, this.police.foot.length || this.squad.proxies.length ? this.pedsNearList() : this.crowd.peds, P); this.hqLife.update(dt); if (!this.indoor) { this.trafficDuty.update(dt); this.schoolLife.update(dt); this.cricket.update(dt); } if (!warmOnly) { this.police.update(dt); if (this.heli) this.heli.update(dt); }
    if (!this.indoor) this.trains.update(dt, { focus, night: A.night, player: this.indoor ? null : P, playerVehicle: P.vehicle || null, vehicles: this.traffic.all(), listener: true });
    if (this.vsmoke && !warmOnly) this.vsmoke.update(dt); // after every vehicle moved this frame (player, mission cars, traffic, police)
    if (!this.indoor) this.crowd.update(dt, focus, camDir, { simTime: this.clock, vehicles: this.traffic.all(), rain: A.w.rain, night: A.night, player: P, armed: !!(this.weapons && this.weapons.drawn), aiming: !!(this.weapons && this.weapons.aiming), hourFactor: this.hourFactor(), hour: A.hour, bodies: this.bodies, police: this.police, hero: this.squad?.activeMember?.def?.id });
    if (!this.indoor && this.world.fuel) { if (!this.fuelSvc) this.fuelSvc = new FuelService(this.world.fuel, { crowd: this.crowd, traffic: this.traffic, scene: this.scene, player: P }); this.fuelSvc.update(dt, { focus, night: A.night }); } // filling stations: refuelling traffic + attendants (FuelStations.js)
    if (this.cityEvents && !warmOnly) { const t0e = performance.now(); this.cityEvents.update(dt); const me = performance.now() - t0e; this.cityEvents.stats.lastMs = me; if (me > (this.cityEvents.stats.maxMs || 0)) this.cityEvents.stats.maxMs = me; if (me > 25) { const sp = this.cityEvents.stats.spikes || (this.cityEvents.stats.spikes = []); if (sp.length < 12) sp.push({ ms: Math.round(me), what: this.cityEvents.marks.join(',') || 'update' }); } } // 81st: city events (schedule, sites, people, sound)
    if (this.activities && !warmOnly && !this.indoor) { try { this.activities.update(dt); } catch (e) { console.warn('[activities]', e); } } // 92nd: fight nights / race meets
    if (!this.indoor && this.trains && this.world.fortStation !== false) { if (!this.station) this.station = new StationLife(this); this.station.update(dt, { focus, night: A.night, hour: A.hour, player: P }); } { const fs = this.world.landmarks && this.world.landmarks.anim.fortStation; if (fs && fs.live && this.trains) { fs.live(this.trains, A.hour, 1 / Settings.get('timeScale'), focus.x, focus.z); } } // live departure / arrival screens // Colombo Fort station: passengers, train riders, clerks, vendors, announcer (StationLife.js)
    if (this.world.customs && !warmOnly) { if (!this.customs) this.customs = new CustomsService(this, this.world.customs); this.customs.update(dt, { night: A.night }); this.garage.update(dt); } // Street Customs (customs/CustomsService.js)
    if (P.vehicle && A.night > 0.5 && P.nightLights === undefined) { P.vehicle.lights = true; }
    if (!this.indoor && !warmOnly) this.bicycles.update(dt, Vehicle);
    if (!this.indoor) { this.ragdolls.update(dt, this.traffic.all()); this.caps.update(dt, this.traffic.all(), P.pos || null); } this.blood.update(dt); if (this.loot) this.loot.update(dt, P); // dropped loot: flight, expiry, hidden indoors
    if (this.birds) this.birds.update(dt);
    this.updateSight(dt);
    // story & prompts
    const storyPrompt = D.active ? null : this.story.update(dt);
    this.hud.prompt(D.active || this.photo || (this.customs && this.customs.active) ? '' : storyPrompt || this.police.prompt || localPrompt || (this.customs && this.customs.prompt) || this.bicycles.prompt || '');
    // music
    this.musicT = (this.musicT || 0) - dt;
    if (this.musicT <= 0) { this.musicT = 1; if (!(Audio.musicMode === 'chase' && this.story.pursuers.length) && !D.active) { let m = A.night > 0.5 ? 'night' : 'explore'; if (this.story.guards.length) m = 'tension'; if (this.story.pursuers.length) m = 'chase'; if (CarRadio.inCar) m = 'none'; /* the car radio plays instead (CarRadio.js) */ if (this.indoor) m = this.interiors.current?.musicMode || 'none'; if (m === 'club' && ClubSound.live) m = 'none'; /* the DJ's own songs play through the club speakers instead */ Audio.setMusic(m); } }
    // HUD
    const v = P.vehicle; const dist = L.districtAt(P.x, P.z);
    this.hud.update({ breath: this.player.swim ? this.player.swim.breath : (this.player.swimBreath ?? 1), underwater: !!this.player.camUnder, health: this.health.hp, healthBusy: this.health.busy, time: A.timeString, money: this.story.state.money, district: this.indoor ? this.interiors.current.D.name : this.seamK > 0.5 ? (P.indoor && P.indoor.hospital ? this.hospital.placeName() : this.interiors.hq.D.name) : dist ? dist.name.split(' · ')[0] : '', street: this.indoor ? '' : L.roadNameAt(P.x, P.z) || '', x: P.x, z: P.z, camYaw: this.photo ? this.photoYaw + Math.PI : P.camYaw, stamina: P.stamina, vehicle: v, vehicleName: v ? this.vehicleName(v.type) : '', radio: CarRadio.hudText(v), ind: v ? v.ind || 0 : 0, indOn: VehicleAudio.ind.on, camera: cam, police: this.police.hudInfo(), projector: (x, y, z) => this.project(x, y, z), fps: this.fps, draws: this.renderer.info.render.calls, extras: this.miniExtras(), indoor: !!this.indoor });
    // audio
    const near = v && !v.T.pedal ? [v] : []; if (this.boats) for (const b of this.boats.voices(P)) near.push(b); /* boat engines: outboard / inboard / jet */ for (const o of this.traffic.guests) { if (near.length >= 6) break; if (o !== v && !o.T.pedal && !o.parked && Math.hypot(o.x - P.x, o.z - P.z) < 70) near.push(o); } /* 92nd: race cars first (they are the loudest thing on the road) */ for (const o of this.traffic.vehicles) { if (near.length >= 6) break; if (!o.T.pedal && Math.hypot(o.x - P.x, o.z - P.z) < 45) near.push(o); } // engine voices (a bicycle has none)
    Footsteps.update(dt); ObjectAudio.update(dt); VehicleAudio.update(dt); CarRadio.update(dt); TrafficAudio.update(dt, this); ClubSound.update(dt, this); // the club DJ's songs through the PA (in the club) / muffled bass on the street outside
    Audio.update(dt, { listener: { x: P.x, z: P.z, yaw: P.camYaw + Math.PI }, night: A.night, rain: A.w.rain, wind: A.w.wind, traffic: this.traffic.vehicles.length, vehicles: near, indoor: this.indoor || this.seamK > 0.6 });
    // autosave every 4 minutes of play while free-roaming
    this.autosaveT += dt; if (this.autosaveT > 240 && !this.story.running && !D.active) { this.autosaveT = 0; this.autosave(); }
  }
  updateInteractions() {
    const P = this.player; const I = this.interiors; const key = (a) => this.hud.key(a);
    if (I.current && I.current.id === 'room' && !I.current.hero) { const b = I.current.bounds; if (Math.hypot(P.x - (b.x0 + 1.2), P.z - (b.z0 + 1.6)) < 1.8 && !this.story.running) { const h = this.atmos.hour; const to = h >= 6 && h < 17 ? 19.75 : 8; if (Input.wasPressed('interact')) this.restUntil(to); return `${key('interact')} Sleep until ${to === 8 ? '8:00 AM' : '7:45 PM'}`; } }
    { const gp = this.schoolLife.guard?.interact(P, key); if (gp) return gp; } // Johns school night watchman
    if (I.current && I.current.nearCounter && I.current.prompt && Input.wasPressed('interact')) { this.gunShop.toggle(true); return null; } // gun shop counter
    if (I.current) { const r = I.update(this.dt); if (r === 'exit' && !this.player.indoorBusy) { if (Input.wasPressed('enter')) I.exit(); return `${key('enter')} Leave ${I.current.D.name}` + (I.current.hero && I.current.prompt ? ` · ${I.current.prompt}` : ''); } return I.current.prompt || null; }
    { const wr = I.walkIn && I.walkIn.room; // standing in a walk-in shop (WalkIn.js): its counter / displays
      if (wr && wr.prompt) { if (Input.wasPressed('interact')) { if (wr.gun || wr.nearCounter) this.gunShop.toggle(true, wr.gun ? { name: wr.name, sub: 'Licensed firearms dealer · Kollupitiya, Colombo 03' } : null); else if (wr.interact) wr.interact(); else if (wr.near && this.store) this.store.openAt(wr, wr.near); } return wr.prompt; } }
    if (this.hospital && P.indoor === this.hospital.room) { const hp = this.hospital.interact(P, key); if (hp) return hp; } // 74th: the hospital's doors, lift, counter, seats, beds
    if (I.hq && P.indoor === I.hq && I.hq.prompt) { if (I.hq.oic?.near && Input.wasPressed('interact')) I.hq.oic.open = !I.hq.oic.open; return I.hq.prompt; } // seamless HQ: the OIC door
    if (P.entry || P.exiting) return null;
    if (this.boats && !I.current) { const bp = this.boats.interact(P, key); if (bp) return bp; if (P.boat) return null; } // boats: board / ride / get off, the marina office and your berth's pedestal
    if (P.swim || P.diveIn || P.climb) return P.edgeHint === 'climb' ? `${key('jump')} Climb out` : null; // swimming: no doors / vehicles
    if (P.edgeHint === 'jump') return `${key('jump')} Jump in`;
    if (this.activities && !I.current) { const ap = this.activities.interact(P, key); if (ap) return ap; } // 92nd: join a race (in a car) / predict, ringside views (on foot)
    if (P.vehicle) { if (Input.wasPressed('enter')) { if (!P.exitVehicle(this.traffic)) this.hud.notify('Slow down', 'Stop the vehicle to get out.', 'info', 1.5); } return null; }
    const door = I.nearDoor(P.x, P.z);
    const veh = this.traffic.nearest(P.x, P.z, 3.4);
    const lp = this.loot && !this.story.sidePrompt && !this.story.talkTarget ? this.loot.interact(P, key) : null; const plus = lp ? ` · ${lp}` : ''; // loot in reach (interact key) — shown alongside a door / vehicle prompt (enter key)
    if (door && (!veh || Math.hypot(door.x - P.x, door.z - P.z) < 1.6)) { const H = HERO_ROOMS[door.id]; const me = this.squad?.activeMember?.def?.id || 'dineth'; if (H && door.owner && door.owner !== me) return `${H.name} · locked (switch to ${H.name.split("'")[0]})`; const name = H ? 'your room' : this.interiorName(door.id); if (Input.wasPressed('enter')) I.enter(door); return `${key('enter')} Enter ${name}` + plus; }
    if (veh) { if (Input.wasPressed('enter')) P.enterVehicle(veh, this.traffic); return `${key('enter')} ${veh.driverChar ? 'Take' : 'Get in'} ${VNAMES[veh.type] || 'vehicle'}` + plus; }
    if (lp) return lp; // loot before small talk / helping up (and with a weapon drawn)
    const heroSay = (cat) => {
      const pool = LINES[cat]; if (!pool || !pool.length) return;
      const ln = pool[Math.floor(Math.random() * pool.length)];
      const nm = this.squad?.activeMember?.def?.name || 'Dineth';
      this.hud.subtitle(nm, ln.si || ln.ta || ln.en, ln.tr || '', 2.4, ln.si ? 'si' : ln.ta ? 'ta' : 'en');
    };
    if (this.weapons && this.weapons.drawn) {
      // Armed hold-up / witness intimidation (within 5.5 m when aiming, or 3.2 m in front)
      let tgt = this.weapons.aimW > 0.35 && this.weapons.pickPed ? this.weapons.pickPed(5.5)?.p : null;
      if (!tgt) {
        let bdA = 3.2; const fxA = Math.sin(P.yaw), fzA = Math.cos(P.yaw);
        for (const p of this.crowd.peds) { if (p.dead || p.state === 'down') continue; const dx = p.x - P.x, dz = p.z - P.z, d = Math.hypot(dx, dz); if (d < bdA && (dx * fxA + dz * fzA) / (d || 1) > 0.35) { bdA = d; tgt = p; } }
      }
      const spec = tgt && this.crowd.interactSpec ? this.crowd.interactSpec(tgt, true) : null;
      if (!spec) return null;
      if (Input.wasPressed('interact')) {
        const res = this.crowd.interact(tgt, spec.e, P);
        if (res?.playerLine) heroSay(res.playerLine);
        if (res?.cash > 0) { this.story.pay(res.cash, 'Street hold-up'); this.hud.notify('Hold-up', `Took Rs. ${res.cash.toLocaleString('en-LK')}`, 'warn', 3); }
      } else if (spec.n && Input.wasPressed('insult') && !P.cover && !P.coverLeft) {
        const res = this.crowd.interact(tgt, spec.n, P);
        if (res?.playerLine) heroSay(res.playerLine);
      }
      return `${key('interact')} ${spec.eLabel}` + (spec.n ? ` · ${key('insult')} ${spec.nLabel}` : '');
    }
    { const sp = this.station && this.station.interact(P, key, () => Input.wasPressed('interact')); if (sp) return sp; }
    if (this.cityEvents && !P.vehicle && !I.current) { for (const site of this.cityEvents.sites.values()) { const b = site.info; if (!b || site.shown < 3 || Math.hypot(P.x - b.x, P.z - b.z) > 1.6) continue; if (Input.wasPressed('interact')) { this.phone.toggle(true); this.phone.launch('events'); this.phone.evOpen = site.ev.id; this.phone.row = 0; this.phone.render(); } return `${key('interact')} Event info · ${site.ev.title || site.ev.T.title}`; } } // 81st: read the event's info board → its page in the City Events app // a Fort station shoulder vendor: buy from them
    // pedestrians: nearest in front within 2.8 m (or witness filming within 4.0 m)
    let best = null, bd = 2.8; const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    for (const p of this.crowd.peds) { if (p.dead) continue; const dx = p.x - P.x, dz = p.z - P.z; const d = Math.hypot(dx, dz); const lim = p.state === 'film' && p.filmPlayer ? 4.0 : bd; if (d < lim && (dx * fx + dz * fz) / (d || 1) > 0.2) { if (d < bd || p.state === 'film') { bd = Math.min(bd, d); best = p; } } }
    if (best && best.state === 'down') { // someone knocked down: help them up (they remember it — Mind.js)
      if (best.awaitMedic || best.helpedUp || (best.ch.rag && best.ch.rag.kin) || (best.koRag && best.koRag.ph)) return null;
      if (Input.wasPressed('interact')) { this.crowd.interact(best, 'help', P); P.ch.anim.play('interact', 1.4); } return `${key('interact')} Help up`; }
    if (best) {
      const spec = this.crowd.interactSpec ? this.crowd.interactSpec(best, false) : { e: 'talk', eLabel: 'Greet', n: 'insult', nLabel: 'Antagonize' };
      if (Input.wasPressed('interact')) {
        const res = this.crowd.interact(best, spec.e, P);
        P.ch.anim.play(spec.e === 'farewell' ? 'wave' : 'talk', 1.6);
        if (res?.playerLine) heroSay(res.playerLine);
      } else if (Input.wasPressed('more')) {
        this.crowd.interact(best, 'wave', P); P.ch.anim.play('wave', 1.5);
      } else if (Input.wasPressed('insult') && !P.cover && !P.coverLeft) {
        const res = this.crowd.interact(best, spec.n, P);
        P.ch.anim.play(spec.n === 'shove' ? 'shove' : 'point', spec.n === 'shove' ? 0.6 : 1.2);
        if (res?.playerLine) heroSay(res.playerLine);
      } else if (Input.wasPressed('shove')) {
        this.crowd.interact(best, 'shove', P); P.ch.anim.play('shove', 0.6);
      }
      return `${key('interact')} ${spec.eLabel} · ${key('more')} Wave · ${key('insult')} ${spec.nLabel} · ${key('shove')} Shove`;
    }
    const filmer = this.crowd.activeFilmerNear ? this.crowd.activeFilmerNear(P.x, P.z, 22) : null;
    if (filmer) return `● REC · Witness filming for ColomboLive (${Math.max(1, Math.ceil(5 - (filmer.filmProg || 0)))}s) — approach to warn off`;
    // emotes when nobody is around
    if (Input.wasPressed('more')) { const em = ['wave', 'stretch', 'clap', 'dance', 'look'][Math.floor(Math.random() * 5)]; P.ch.anim.play(em, em === 'dance' ? 5 : 2.2); P.emote = em; }
    return null;
  }
  interiorName(id) { return { kade: 'Lucky Tea Kade', fathima: 'Fathima Textiles', selvaraj: 'Selvaraj Electronics', bandara: 'Bandara Spice Stores', tailor: 'Ceylon Threads', garage: 'Lanka Auto Care', gunshop: 'Ceylon Arms Co.', club: 'The Velvet Monsoon', hq: 'Police Headquarters', gunshop2: 'Lanka Shooting Supplies', barber: 'Razor & Co. Barbers', tattoo: 'Black Lotus Tattoo', tattoo2: 'Serendib Ink', clothing: 'Marine Drive Clothing Co.', luxury: 'Maison Serendib', rob_mart: 'Lak Mini Mart', rob_pharmacy: 'Lanka Care Pharmacy', rob_jewel: 'Ratnapura Gems & Gold', rob_phone: 'CellCity Mobile', rob_liquor: 'Galle Road Wine Stores', rob_bakery: 'Golden Crust Bakery', rob_hardware: 'Sena Hardware', rob_books: 'Saraswathi Book Depot', bank: 'Ceylon Meridian Bank' }[id] || id; }
  // what the player can actually see: vehicles / people / police units within range and not hidden behind a building or wall.
  // Only these get (small) marks on the minimap and the full map — the map is not a tracker of every NPC and car in the city.
  lineOfSight(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 2.5);
    for (let k = 1; k < n; k++) { const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const c of this.collision.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05)) { if (c.kind === 'tree' || c.kind === 'pole' || c.kind === 'deck' || c.kind === 'platform' || (c.y0 || 0) + c.h < 2.4 || (c.y0 || 0) > 3) continue; if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return false; } }
    return true;
  }
  updateSight(dt) {
    this.sightT = (this.sightT || 0) - dt; if (this.sightT > 0 && this.sight) return; this.sightT = 0.3;
    const P = this.player, src = P.vehicle || P, R = 70; const S = { veh: [], peds: [], units: new Set() };
    if (!this.indoor && P.indoor == null) {
      const see = (o) => { const d = Math.hypot(o.x - src.x, o.z - src.z); return d < R && (d < 6 || this.lineOfSight(src.x, src.z, o.x, o.z)); };
      for (const v of this.traffic.all()) if (v !== P.vehicle && v.x !== undefined && see(v)) S.veh.push(v);
      for (const p of this.crowd.peds || []) if (see(p)) S.peds.push(p);
      for (const u of this.police?.units || []) { const q = u.v && !u.v.player ? u.v : u.officers && u.officers.find((o) => !o.dead && o.mode !== 'seated'); if (q && see(q)) S.units.add(u); } // (69th: tested the unit record itself, which has no position — so nobody was ever "seen")
    }
    this.sight = S;
  }
  canSeeUnit(u) { const S = this.sight; if (S && u.ref && S.units.has(u.ref)) return true; const P = this.player, src = P.vehicle || P; if (u.heli) return Math.hypot(u.x - src.x, u.z - src.z) < (this.indoor || P.indoor != null ? 160 : 450); /* up in the open sky: seen and heard from far (69th: only while it is up on the chase — Helicopter.hudMark) */ return !!u.lights && Math.hypot(u.x - src.x, u.z - src.z) < 150; } // responding units are heard (siren); 69th: hudInfo items carry their unit (ref) — they are fresh objects, so the old S.units.has(item) never matched
  // crowd + officers on foot + squad proxies for the traffic's pedestrian checks: one reused array (was a fresh concat every frame of a chase)
  pedsNearList() { const o = this._pedsNear || (this._pedsNear = []); o.length = 0; for (const L of [this.crowd.peds, this.police.foot, this.squad.proxies]) for (let i = 0; i < L.length; i++) o.push(L[i]); return o; }
  miniExtras() {
    const out = []; const S = this.sight || { veh: [], peds: [] };
    for (const v of S.veh) out.push({ x: v.x, z: v.z, color: 'rgba(255,255,255,0.6)', r: 1.3 });
    for (const p of S.peds) out.push({ x: p.x, z: p.z, color: 'rgba(255,226,160,0.65)', r: 0.8 });
    { const me = this.squad?.activeMember?.def?.id; const hd = (this.interiors.doors || []).find((d) => d.owner === me && HERO_ROOMS[d.id]); if (hd && !this.indoor) out.push({ x: hd.x, z: hd.z, color: '#7fd1ff', r: 2.6 }); } // your room
    for (const pv of this.story.pursuers) out.push({ x: pv.v ? pv.v.x : pv.x, z: pv.v ? pv.v.z : pv.z, color: '#ff4a3a', r: 3.5 });
    return out;
  }
  project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.camera); if (v.z > 1) return null; return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; }
  // ================================================================= settings
  applyDensity() { const pr = Settings.preset; this.crowd.max = Math.round(pr.crowd * 0.45 * Settings.get('crowdDensity')); this.traffic.max = Math.round(pr.traffic * Settings.get('trafficDensity')); }
  applySettings(k) {
    if (k === 'cpuWorkers' || k === '*') setWorkerOverride(Settings.get('cpuWorkers')); // 93rd: live (the geometry pool grows / shrinks; 0 = the main-thread paths)
    if (k === 'cpuPanel' || k === '*') { if (Settings.get('cpuPanel')) (this.cpuPanel || (this.cpuPanel = new CpuPanel(this))).show(true); else if (this.cpuPanel) this.cpuPanel.show(false); }
    const pr = Settings.preset; if (!this.post) return;
    if (k === 'quality' || k === 'resolutionScale' || k === '*') { this.renderer.setPixelRatio(this.outPR()); this.renderer.shadowMap.enabled = pr.shadows; this.atmos.setShadowQuality(pr.shadows, pr.shadowRes); /* the preset's sun shadow resolutions, near + far (was only applied at start-up) */ this.atmos.drawDist = pr.drawDist; this.world.setQuality(Settings.get('quality')); this.post.build({ bloom: pr.bloom, ao: pr.ao, cine: pr.cine }); this.resize(); this.scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined && (k === 'quality' || k === '*')) o.material.needsUpdate = true; }); }
    if (k === 'upscale' || k === 'sgsrSharpness' || k === 'sgsrEdgeDir' || k === '*') this.applyPR(); // 91st: live — the composer's targets resize, the SGSR pass is added / removed
    if (k === 'wetReflections' || k === '*') { if (this.world) this.world.glintsOn = Settings.get('wetReflections') !== false; }
    if (k === 'lensFlare' || k === 'lightShafts' || k === '*') this.post.setCine(Settings.get('lensFlare') !== false, Settings.get('lightShafts') !== false);
    if (k === 'nightBrightness' || k === '*') { if (this.atmos) this.atmos.nightBoost = Settings.get('nightBrightness') ?? 1; }
    if (k === 'fov' || k === '*') { this.camera.fov = Settings.get('fov'); this.camera.updateProjectionMatrix(); }
    if (['crowdDensity', 'trafficDensity', 'quality', '*'].includes(k)) this.applyDensity();
    if ((k === 'quality' || k === '*') && this.vsmoke) this.vsmoke.setQuality(Settings.get('quality'));
    if (['master', 'music', 'sfx', 'ambience', 'dialogue', '*'].includes(k)) Audio.applyVolumes();
    if (k === 'subtitleSize' || k === '*') document.documentElement.style.setProperty('--sub-scale', Settings.get('subtitleSize'));
  }
  /* FPS: render resolution. High-DPI screens (Windows 125-200 % scaling, laptops, 4K) used to render at up to 2x the pixels on every preset; now only Ultra
     renders above 1 pixel per screen point (the Resolution scale setting still goes to 150 %). On a normal 100 % desktop this changes nothing. */
  basePR() { const pr = Settings.preset; if (this.sgsrK() > 0) return this.outputPR(); return Math.min(devicePixelRatio, Settings.get('quality') === 'ultra' ? 2 : 1) * pr.pixelRatio * this.nativeScale(); }
  /* 91st — Settings → Graphics → SNAPDRAGON GAME SUPER RESOLUTION ('upscale'): off = native, exactly as before (the Resolution scale
     setting applies) · sgsr100 / sgsr90 / sgsr85 / sgsr80 = the world renders at that percentage of the output resolution in width
     AND height and SGSR upscales + sharpens it to the output · ss150 = the existing 150 % supersampling (native, the formula above
     with Resolution scale 150 %). Output resolution = canvas CSS size × devicePixelRatio (DPR, capped at 2; it is not a render
     scale). The benchmark (Benchmark.js) sets renderOverride for its runs without touching the saved setting. */
  upscaleMode() { const o = this.renderOverride; return o || Settings.get('upscale') || 'off'; }
  sgsrK() { if (this.post && this.post.sgsrFailed) return 0; const m = String(this.upscaleMode()); const k = /^sgsr(\d+)$/.exec(m); return k ? Math.min(1, Math.max(0.5, +k[1] / 100)) : 0; }
  nativeScale() { const m = this.upscaleMode(); return m === 'ss150' ? 1.5 : m === 'native100' ? 1 : (Settings.get('resolutionScale') || 1); }
  outputPR() { return Math.min(devicePixelRatio || 1, 2); }
  outPR() { return this.sgsrK() > 0 ? this.basePR() : this.basePR() * this.dynK; } // dynamic resolution scales the internal size under SGSR (applyPR), never the output
  sgsrOpts() { const s = +Settings.get('sgsrSharpness'); return { sharpness: Number.isFinite(s) ? s : 2, variant: Settings.get('sgsrEdgeDir') === false ? 'base' : 'edge' }; }
  upscaleFailed() { if (this._upFailT) return; this._upFailT = true; this.applyPR(); if (this.hud) this.hud.notify('Super resolution unavailable', 'The SGSR shader could not be built on this graphics card — rendering natively', 'warn', 4); }
  /* Dynamic resolution (Settings → Graphics, on by default): only when the frame rate falls under ~55 fps for a while the render scale steps down 5 % at a
     time (never below 80 %), and climbs back to 100 % once the frame rate holds at the display rate again. Nothing else changes (models, shadows,
     effects, draw distance stay as the preset sets them). A level that failed right after a step up is held for 20 s, so it does not pump. */
  dynRes(raw) {
    if (TEST || this.mode !== 'play' || Settings.get('dynamicRes') === false || this.bench) { if (this.dynK !== 1) { this.dynK = 1; this.applyPR(); } return; }
    this.dynF = this.dynF === undefined ? raw : this.dynF + (raw - this.dynF) * 0.08; this.dynT += raw; this.dynHold = Math.max(0, this.dynHold - raw);
    if (this.dynT < 1.5) return; this.dynT = 0; const fps = 1 / Math.max(1e-3, this.dynF);
    if (fps < 54 && this.dynK > 0.8) { if (this.clock - this.dynUpAt < 6) this.dynHold = 20; this.dynK = Math.max(0.8, +(this.dynK - 0.05).toFixed(2)); this.applyPR(); }
    else if (fps > 58.5 && this.dynK < 1 && this.dynHold <= 0) { this.dynK = Math.min(1, +(this.dynK + 0.05).toFixed(2)); this.dynUpAt = this.clock; this.applyPR(); }
  }
  applyPR() { const p = this.outPR(), k = this.sgsrK(); this.renderer.setPixelRatio(p); if (this.post && this.post.composer) { this.post.setUpscale(k > 0 ? k * this.dynK : 0, this.sgsrOpts()); this.post.composer.setPixelRatio(p); } this.resize(); }
  resize() { const w = innerWidth, h = innerHeight; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h); if (this.post) this.post.setSize(w, h); }
}
