import { bus } from './Events.js';
const KEY = 'colombo.settings.v1';
export const DEFAULT_BINDINGS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  sprint: 'ShiftLeft', jump: 'Space', crouch: 'KeyC', enter: 'KeyF',
  interact: 'KeyE', insult: 'KeyQ', shove: 'KeyG', more: 'KeyT',
  horn: 'KeyH', lights: 'KeyL', camera: 'KeyV', radio: 'KeyR',
  phone: 'KeyP', map: 'KeyM', journal: 'KeyJ',
};
export const QUALITY_PRESETS = {
  low:    { pixelRatio: 0.75, shadows: false, shadowRes: 1024, bloom: false, ao: false, drawDist: 650,  crowd: 60,  traffic: 22, detailRadius: 1 },
  medium: { pixelRatio: 1.0,  shadows: true,  shadowRes: 1024, bloom: true,  ao: false, drawDist: 950,  crowd: 110, traffic: 34, detailRadius: 2 },
  high:   { pixelRatio: 1.0,  shadows: true,  shadowRes: 2048, bloom: true,  ao: false, drawDist: 1400, crowd: 170, traffic: 46, detailRadius: 2 },
  ultra:  { pixelRatio: 1.5,  shadows: true,  shadowRes: 4096, bloom: true,  ao: true,  drawDist: 1900, crowd: 240, traffic: 60, detailRadius: 3 },
};
const DEFAULTS = {
  quality: 'high', resolutionScale: 1.0, fullscreen: false, fov: 62,
  mouseSens: 1.0, invertY: false, cameraDistance: 1.0, cameraShake: true,
  master: 0.85, music: 0.6, sfx: 0.85, ambience: 0.75, dialogue: 1.0, voiceTTS: false,
  subtitles: true, subtitleSize: 1.0, crowdDensity: 1.0, trafficDensity: 1.0,
  timeScale: 2.0, // real seconds per game minute
  showFps: false, bindings: { ...DEFAULT_BINDINGS },
};
class SettingsStore {
  constructor() {
    this.v = structuredClone(DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const p = JSON.parse(raw); Object.assign(this.v, p); this.v.bindings = { ...DEFAULT_BINDINGS, ...(p.bindings || {}) }; }
    } catch (e) { console.warn('settings load failed', e); }
  }
  get(k) { return this.v[k]; }
  set(k, val) { this.v[k] = val; this.save(); bus.emit('settings', k, val); }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.v)); } catch (e) {} }
  reset() { this.v = structuredClone(DEFAULTS); this.save(); bus.emit('settings', '*'); }
  get preset() { return QUALITY_PRESETS[this.v.quality] || QUALITY_PRESETS.high; }
}
export const Settings = new SettingsStore();
