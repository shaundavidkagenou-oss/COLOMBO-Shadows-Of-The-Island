import { bus } from './Events.js';
const KEY = 'colombo.settings.v1';
export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', jump: 'Space', crouch: 'KeyC', enter: 'KeyF',
  interact: 'KeyE', insult: 'KeyN', cover: 'KeyQ', shove: 'KeyG', more: 'KeyT',
  horn: 'KeyH', lights: 'KeyL', camera: 'KeyV', radio: 'KeyR',
  phone: 'KeyP', map: 'KeyM', journal: 'KeyJ',
  reload: 'KeyR', holster: 'KeyX', weaponWheel: 'Tab', grenade: 'KeyB',
  indL: 'Comma', indR: 'Period', radioPrev: 'BracketLeft', // 76th: turn indicators (VehicleAudio.js) · previous radio station (CarRadio.js)
};
// bankTex / bankFX (78th): the Ceylon Meridian Bank's texture size and its lighting pass level (BankTex.js, BankFX.js)
export const QUALITY_PRESETS = {
  low:    { pixelRatio: 0.75, shadows: false, shadowRes: 1024, bloom: false, ao: false, cine: 0, drawDist: 650,  crowd: 60,  traffic: 22, detailRadius: 1, bankTex: 1024, bankFX: 0 },
  medium: { pixelRatio: 1.0,  shadows: true,  shadowRes: 1024, bloom: true,  ao: false, cine: 1, drawDist: 950,  crowd: 110, traffic: 34, detailRadius: 2, bankTex: 2048, bankFX: 1 },
  high:   { pixelRatio: 1.0,  shadows: true,  shadowRes: 2048, bloom: true,  ao: false, cine: 2, drawDist: 1400, crowd: 170, traffic: 46, detailRadius: 2, bankTex: 2048, bankFX: 2 },
  ultra:  { pixelRatio: 1.5,  shadows: true,  shadowRes: 4096, bloom: true,  ao: true,  cine: 3, drawDist: 1900, crowd: 240, traffic: 60, detailRadius: 3, bankTex: 2048, bankFX: 3 },
};
const DEFAULTS = {
  quality: 'high', resolutionScale: 1.0, fullscreen: false, fov: 62,
  mouseSens: 1.0, invertY: false, cameraDistance: 1.0, cameraShake: true,
  master: 0.85, music: 0.6, sfx: 0.85, ambience: 0.75, dialogue: 1.0, vehicle: 1.0, /* 76th: engines, tyres, indicators, traffic (× Effects) */ voiceTTS: false,
  subtitles: true, subtitleSize: 1.0, crowdDensity: 1.0, trafficDensity: 1.0,
  timeScale: 2.0, // real seconds per game minute
  showFps: false, blood: true, /* blood effects (impact spray, splats, pools under bodies) */ wetReflections: true, /* wet-road light streaks (WetGlints) */ nightBrightness: 1.15, /* night exposure multiplier (Settings → Night brightness) */ lensFlare: true, lightShafts: true, dynamicRes: true, /* hold the frame rate by lowering the render scale (min 80 %) only while it drops */ /* cinematic sun effects, where the preset includes them (cine level: Medium flare, High/Ultra shafts) */
  clubOrder: 'order', // 58th: the club DJ's songs (sounds window → Music): order (1 → 7, again) | shuffle
  mapMusic: 'track1', // 57th: music while the pause map is open: track1 | track2 | alternate (each time the map opens) | off
  upscale: 'off', // 91st: SNAPDRAGON GAME SUPER RESOLUTION — off (native) | sgsr100 | sgsr90 | sgsr85 | sgsr80 | ss150 (the existing 150 % supersampling). Game.basePR / sgsrK
  sgsrSharpness: 2.0, sgsrEdgeDir: true, // SGSR EdgeSharpness (Qualcomm's range 1.0–2.0, default 2.0) · its edge-direction variant
  cpuWorkers: 'auto', cpuPanel: false, // 93rd: background compute threads (core/WorkerPool.js: auto = hardware threads − 3, at most 4; 0 = main thread only) · the in-game CPU diagnostics panel (ui/CpuPanel.js)
  benchSec: 30, benchWarm: 5, benchScene: 'city', // in-game benchmark: measured seconds and warm-up seconds per configuration (Benchmark.js)
  leafMesh: true, // 95th: trees / shrubs / hedges from real leaf geometry (world/LeafMesh.js) — false: the 88th leaf cards (takes effect on reload)
  switchStyle: 'auto', // squad switch camera: auto (transit, or jump-cut when far / blocked) | transit | cut
  bindings: { ...DEFAULT_BINDINGS },
};
class SettingsStore {
  constructor() {
    this.v = structuredClone(DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const p = JSON.parse(raw); Object.assign(this.v, p); const b = { ...(p.bindings || {}) }; if (!b.cover && b.insult === 'KeyQ') delete b.insult; /* 73rd: Q is cover now (insult moved to N) — saved settings from before keep their other keys */ this.v.bindings = { ...DEFAULT_BINDINGS, ...b }; }
    } catch (e) { console.warn('settings load failed', e); }
  }
  get(k) { return this.v[k]; }
  set(k, val) { this.v[k] = val; this.save(); bus.emit('settings', k, val); }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch (e) {} }
  reset() { this.v = structuredClone(DEFAULTS); this.save(); bus.emit('settings', '*'); }
  get preset() { return QUALITY_PRESETS[this.v.quality] || QUALITY_PRESETS.high; }
}
export const Settings = new SettingsStore();
