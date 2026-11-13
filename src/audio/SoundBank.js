// Sound replacement bank (console command `sounds`, src/ui/SoundsWindow.js).
// Every sound in the game is procedural WebAudio (Audio.js and a few call sites). Each one has a stable id in SOUND_DEFS; when
// the player has given that id a recording (.mp3 / .wav / .ogg), the call site plays the decoded recording instead of the
// synthesised sound — one-shots through play(), continuous sounds (engines, sirens, rotor, ambience, music) through syncLoop().
// Where the recordings come from, lowest priority first:
//   1. the sound pack built into the game: `sounds/` in the project folder → `custom-sounds/` in the build (and so in the .exe),
//      written by tools/vite/customSounds.mjs (dev server: live from the folder; `vite build`: copied into dist)
//   2. recordings saved in the `sounds` window on this machine (IndexedDB of the browser / of the desktop app)
// Nothing is fetched or decoded unless a pack or a saved recording exists (one fetch of a small manifest at start-up).
import { savedFlags, setSavedFlag, storeGet, storeSet, storeDel } from '../debug/boot.js';

// id, label, category, kind ('shot' one-shot | 'loop' continuous), lvl = playback gain of a full-scale recording (matches the
// loudness of the synthesised sound it replaces)
const W = (id, name, lvl = 0.55) => ({ id: 'gun.' + id, name: name + ' — gunshot', cat: 'Weapons', lvl });
export const SOUND_DEFS = [
  W('compact', 'Compact Pistol', 0.45), W('service', 'Service Pistol', 0.5), W('heavy', 'Heavy Pistol', 0.6), W('carbine', 'Carbine Rifle'), W('assault', 'Assault Rifle'), W('battle', 'Battle Rifle', 0.62),
  W('bolt', 'Bolt-Action Sniper', 0.7), W('semi', 'Semi-Auto Sniper', 0.65), W('precision', 'Precision Sniper', 0.7), W('t56', 'Police T-56 rifle', 0.55),
  { id: 'reload.pistol', name: 'Reload — pistol', cat: 'Weapons', lvl: 0.35 }, { id: 'reload.rifle', name: 'Reload — rifle', cat: 'Weapons', lvl: 0.35 }, { id: 'reload.sniper', name: 'Reload — sniper rifle', cat: 'Weapons', lvl: 0.35 },
  { id: 'gun.cycle', name: 'Bolt / slide cycling', cat: 'Weapons', lvl: 0.3 }, { id: 'gun.dry', name: 'Dry fire (empty click)', cat: 'Weapons', lvl: 0.25 }, { id: 'gun.equip', name: 'Weapon drawn / holstered', cat: 'Weapons', lvl: 0.25 },
  { id: 'gun.scope', name: 'Scope / aim in', cat: 'Weapons', lvl: 0.2 }, { id: 'gun.shell', name: 'Shell casing on the ground', cat: 'Weapons', lvl: 0.2 }, { id: 'gun.hitmarker', name: 'Hit marker', cat: 'Weapons', lvl: 0.2 },
  { id: 'gun.ricochet', name: 'Bullet ricochet', cat: 'Weapons', lvl: 0.25 }, { id: 'impact.metal', name: 'Bullet hitting metal', cat: 'Weapons', lvl: 0.4 },
  { id: 'punch.swing', name: 'Punch — swing', cat: 'Fighting', lvl: 0.25 }, { id: 'punch.hit', name: 'Punch — landed', cat: 'Fighting', lvl: 0.5 }, { id: 'punch.taken', name: 'Punch — taken / blocked', cat: 'Fighting', lvl: 0.45 },
  { id: 'grenade.pin', name: 'Grenade — pin pulled', cat: 'Explosives', lvl: 0.3 }, { id: 'grenade.throw', name: 'Grenade — throw', cat: 'Explosives', lvl: 0.25 }, { id: 'grenade.bounce', name: 'Grenade — bounce', cat: 'Explosives', lvl: 0.3 },
  { id: 'explosion', name: 'Explosion', cat: 'Explosives', lvl: 1 },
  { id: 'engine.car', name: 'Engine — petrol car (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.5 }, { id: 'engine.diesel', name: 'Engine — diesel SUV / van / jeep (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.55 },
  { id: 'engine.heavy', name: 'Engine — bus / lorry (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.6 }, { id: 'engine.tuktuk', name: 'Engine — three-wheeler (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.55 },
  { id: 'engine.bike', name: 'Engine — small motorcycle / scooter (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.5 }, { id: 'engine.bike250', name: 'Engine — 250–750 cc motorcycle (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.55 },
  { id: 'engine.superbike', name: 'Engine — superbike (loop)', cat: 'Vehicles', kind: 'loop', lvl: 0.55 }, { id: 'turbo.bov', name: 'Turbo blow-off', cat: 'Vehicles', lvl: 0.35 },
  { id: 'horn.car', name: 'Horn — car', cat: 'Vehicles', lvl: 0.35 }, { id: 'horn.small', name: 'Horn — three-wheeler / motorcycle', cat: 'Vehicles', lvl: 0.3 }, { id: 'horn.heavy', name: 'Horn — bus / lorry', cat: 'Vehicles', lvl: 0.45 },
  { id: 'horn.dual', name: 'Horn — Customs dual tone', cat: 'Vehicles', lvl: 0.35 }, { id: 'horn.sport', name: 'Horn — Customs sport', cat: 'Vehicles', lvl: 0.35 }, { id: 'horn.air', name: 'Horn — Customs air horn', cat: 'Vehicles', lvl: 0.45 }, { id: 'horn.tune', name: 'Horn — Customs musical', cat: 'Vehicles', lvl: 0.35 },
  { id: 'veh.crash', name: 'Vehicle crash', cat: 'Vehicles', lvl: 0.7 }, { id: 'veh.glass', name: 'Window shattering', cat: 'Vehicles', lvl: 0.5 }, { id: 'veh.glassCrack', name: 'Window cracking', cat: 'Vehicles', lvl: 0.35 },
  { id: 'veh.tyreBurst', name: 'Tyre burst', cat: 'Vehicles', lvl: 0.6 }, { id: 'veh.doorOpen', name: 'Car door — open', cat: 'Vehicles', lvl: 0.3 }, { id: 'veh.doorSlam', name: 'Car door — slam', cat: 'Vehicles', lvl: 0.45 },
  { id: 'siren.police', name: 'Police siren (loop)', cat: 'Emergency', kind: 'loop', lvl: 0.45 }, { id: 'siren.ambulance', name: 'Ambulance siren (loop)', cat: 'Emergency', kind: 'loop', lvl: 0.45 },
  { id: 'heli.rotor', name: 'Police helicopter — rotor & turbines (loop)', cat: 'Emergency', kind: 'loop', lvl: 0.7 }, { id: 'police.radio', name: 'Police radio squelch', cat: 'Emergency', lvl: 0.3 },
  { id: 'train.horn', name: 'Train horn', cat: 'Trains', lvl: 0.5 }, { id: 'train.bell', name: 'Level-crossing bell', cat: 'Trains', lvl: 0.3 }, { id: 'train.clack', name: 'Wheels over rail joints', cat: 'Trains', lvl: 0.3 },
  { id: 'amb.city', name: 'City traffic hum (loop)', cat: 'Ambience', kind: 'loop', lvl: 0.6 }, { id: 'amb.rain', name: 'Rain (loop)', cat: 'Ambience', kind: 'loop', lvl: 0.6 }, { id: 'amb.sea', name: 'Sea waves (loop)', cat: 'Ambience', kind: 'loop', lvl: 0.6 },
  { id: 'amb.wind', name: 'Wind (loop)', cat: 'Ambience', kind: 'loop', lvl: 0.6 }, { id: 'thunder', name: 'Thunder', cat: 'Ambience', lvl: 0.8 }, { id: 'bird.crow', name: 'House crow', cat: 'Ambience', lvl: 0.25 },
  { id: 'bird.song', name: 'Songbird', cat: 'Ambience', lvl: 0.12 }, { id: 'cricket', name: 'Crickets (night)', cat: 'Ambience', lvl: 0.1 }, { id: 'fire', name: 'Fire crackling', cat: 'Ambience', lvl: 0.4 },
  { id: 'debris', name: 'Debris landing', cat: 'Ambience', lvl: 0.4 }, { id: 'bread.tuk', name: 'Bakery three-wheeler chime', cat: 'Ambience', lvl: 0.3 },
  { id: 'footstep', name: 'Footstep', cat: 'Player', lvl: 0.25 }, { id: 'phone.ring', name: 'Phone ringing', cat: 'Player', lvl: 0.3 },
  { id: 'ui.click', name: 'Menu click', cat: 'Interface', lvl: 0.25 }, { id: 'ui.hover', name: 'Menu hover', cat: 'Interface', lvl: 0.15 }, { id: 'ui.notify', name: 'Notification', cat: 'Interface', lvl: 0.3 },
  { id: 'ui.success', name: 'Success', cat: 'Interface', lvl: 0.3 }, { id: 'ui.fail', name: 'Failure', cat: 'Interface', lvl: 0.3 }, { id: 'ui.collect', name: 'Pick-up', cat: 'Interface', lvl: 0.3 }, { id: 'ui.door', name: 'Door (building)', cat: 'Interface', lvl: 0.3 }, { id: 'ui.camera', name: 'Camera shutter', cat: 'Interface', lvl: 0.3 },
  ...[['explore', 'Free roam (day)'], ['night', 'Free roam (night)'], ['tension', 'Wanted'], ['chase', 'Police chase'], ['menu', 'Main menu'], ['intro', 'Intro'], ['radio1', 'Car radio — station 1'], ['radio2', 'Car radio — station 2'], ['club', 'Night club PA']]
    .map(([m, n]) => ({ id: 'music.' + m, name: 'Music — ' + n + ' (loop)', cat: 'Music', kind: 'loop', lvl: 0.7 })),
];
for (const d of SOUND_DEFS) d.kind ||= 'shot';
export const SOUND_BY_ID = Object.fromEntries(SOUND_DEFS.map((d) => [d.id, d]));
export const SOUND_EXT = /\.(mp3|wav|ogg)$/i;
const MAX_VOICES = 8; // overlapping copies of one recording (an automatic rifle with a 2 s recording)

class Bank {
  constructor() { this.raw = new Map(); this.buf = new Map(); this.ctx = null; this.audio = null; this.bypass = false; this.voices = new Map(); this.listeners = new Set(); this.loaded = null; this.pack = new Map(); }
  has(id) { return !this.bypass && this.buf.has(id); }
  level(id) { const r = this.raw.get(id); return (SOUND_BY_ID[id] ? SOUND_BY_ID[id].lvl : 0.4) * (r && r.vol != null ? r.vol : 1); }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(id) { for (const fn of this.listeners) try { fn(id); } catch (e) { console.warn('[sounds]', e); } }
  // ---- start-up: the built-in pack, then this machine's saved recordings (they win)
  load() {
    if (this.loaded) return this.loaded;
    return (this.loaded = (async () => {
      try { if (typeof fetch === 'function' && typeof location !== 'undefined') { const r = await fetch('custom-sounds/manifest.json', { cache: 'no-cache' });
        if (r.ok && (r.headers.get('content-type') || '').includes('json')) { const m = await r.json(); for (const [id, e] of Object.entries((m && m.sounds) || {})) { if (!SOUND_BY_ID[id] || !e || !e.file) continue;
          try { const f = await fetch('custom-sounds/' + encodeURIComponent(e.file)); if (f.ok) { const P = { data: await f.arrayBuffer(), name: e.name || e.file, vol: e.vol ?? 1, src: 'pack' }; this.pack.set(id, P); this.raw.set(id, P); } } catch { /* missing file */ } } } } } catch { /* no pack */ }
      if (savedFlags().sounds) { const ids = (await storeGet('sound:index')) || []; for (const id of ids) { const e = await storeGet('sound:' + id); if (e && e.data && SOUND_BY_ID[id]) this.raw.set(id, { ...e, src: 'user' }); } }
      if (this.ctx) await this.decodeAll();
      return this.raw.size;
    })());
  }
  attach(ctx, audio) { this.ctx = ctx; this.audio = audio; if (this.raw.size) this.decodeAll(); }
  async decodeAll() { await Promise.all([...this.raw.keys()].map((id) => this.decode(id))); }
  async decode(id) {
    const r = this.raw.get(id); if (!r || !this.ctx) return null;
    try { const b = await this.ctx.decodeAudioData(r.data.slice(0)); if (this.raw.get(id) === r) { this.buf.set(id, b); this.emit(id); } return b; } catch (e) { console.warn('[sounds] could not decode', id, r.name, e); return null; }
  }
  // ---- playback
  // one-shot: returns true when a recording replaced the synthesised sound (the caller then skips its own synthesis)
  play(id, k = 1, pan = 0, when = 0, { out = 'sfx', rate = 1, verb = false, mono = false } = {}) {
    if (this.bypass) return false; const b = this.buf.get(id); if (!b) return false; const A = this.audio; if (!A || !A.live) return true;
    let V = this.voices.get(id); if (!V) this.voices.set(id, (V = []));
    const c = this.ctx, now = c.currentTime; for (let i = V.length - 1; i >= 0; i--) if (V[i].end <= now) V.splice(i, 1);
    if (mono && V.length) return true; // continuous texture (fire): let the playing copy finish
    if (V.length >= MAX_VOICES) { const o = V.shift(); try { o.g.gain.setTargetAtTime(0, now, 0.02); o.src.stop(now + 0.1); } catch { /* already stopped */ } }
    const t = now + Math.max(0, when); const src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = rate; const g = c.createGain(); g.gain.value = Math.max(0, k) * this.level(id);
    const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); src.connect(g); g.connect(p); p.connect(A.bus[out] || A.bus.sfx); if (verb && A.verb) p.connect(A.verb);
    src.start(t); V.push({ src, g, end: t + b.duration / rate }); src.onended = () => { try { p.disconnect(); } catch { /* gone */ } };
    return true;
  }
  // continuous: keeps holder.smp = a looping source of id's recording feeding dest (null when id has no recording). The caller
  // sets dest's gain (distance, state) and smp.src.playbackRate (engine revs, rotor speed) every frame.
  syncLoop(h, id, dest) {
    const b = this.bypass ? null : this.buf.get(id) || null;
    if (h.smp && (h.smp.b !== b || h.smp.id !== id || h.smp.dest !== dest)) { const s = h.smp; h.smp = null; try { s.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); s.src.stop(this.ctx.currentTime + 0.3); } catch { /* stopped */ } }
    if (!b || !dest || !this.ctx) return null;
    if (!h.smp) { const c = this.ctx; const src = c.createBufferSource(); src.buffer = b; src.loop = true; const g = c.createGain(); g.gain.value = this.level(id); src.connect(g); g.connect(dest); src.start(c.currentTime, Math.random() * b.duration); h.smp = { src, g, b, id, dest }; }
    else h.smp.g.gain.value = this.level(id);
    return h.smp;
  }
  stopLoop(h) { if (h && h.smp) { const s = h.smp; h.smp = null; try { s.src.stop(); } catch { /* stopped */ } } }
  // ---- editing (SoundsWindow): set / volume / remove, persisted per machine (and to the project folder on the dev server)
  async set(id, data, name, vol = 1) {
    if (!SOUND_BY_ID[id]) throw new Error('unknown sound ' + id);
    const e = { data, name, vol, type: (name.match(SOUND_EXT) || ['', 'mp3'])[1].toLowerCase(), t: Date.now() };
    this.raw.set(id, { ...e, src: 'user' }); this.buf.delete(id);
    if (this.ctx) { const b = await this.decode(id); if (!b) { this.raw.delete(id); throw new Error(`"${name}" could not be decoded as audio`); } }
    await storeSet('sound:' + id, e); await this.saveIndex(); return true;
  }
  async setVolume(id, vol) { const r = this.raw.get(id); if (!r) return; r.vol = vol; if (r.src === 'user') { const e = await storeGet('sound:' + id); if (e) { e.vol = vol; await storeSet('sound:' + id, e); } } }
  async remove(id) { const r = this.raw.get(id); this.raw.delete(id); this.buf.delete(id); if (r && r.src === 'user') { await storeDel('sound:' + id); await this.saveIndex(); }
    const P = this.pack.get(id); if (P && r !== P) { this.raw.set(id, P); await this.decode(id); } this.emit(id); } // a saved recording removed: the built-in pack's (if any) is used again
  async saveIndex() { const ids = [...this.raw.entries()].filter(([, r]) => r.src === 'user').map(([k]) => k); await storeSet('sound:index', ids); setSavedFlag('sounds', ids.length > 0); }
  info(id) { const r = this.raw.get(id); return r ? { name: r.name, vol: r.vol ?? 1, src: r.src, ok: this.buf.has(id), bytes: r.data ? r.data.byteLength : 0, pack: this.pack.has(id) } : null; }
}
export const SoundBank = new Bank();
if (typeof window !== 'undefined') window.__sounds = SoundBank;
