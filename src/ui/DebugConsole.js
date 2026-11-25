// Developer console + debug menu.
//   `  (Backquote)        open / close the console (typing never reaches the game while it is open)
//   debug.menu true       enable the debug menu; Numpad 2 then opens / closes it (debug.menu false disables it again)
// The menu (keyboard: ↑/↓ or Numpad 8/2 move · Enter / Numpad 5 select · Backspace / Numpad 4 back; mouse works too)
// holds the cheats: time, weather, spawning pedestrians and vehicles (real-model cars, buses & lorries, police & emergency,
// SUVs, bikes), the vehicle you are in / next to (info, repair, upright, doors), re-dressing nearby pedestrians, player
// model, infinite ammo, never wanted, teleport, god mode, money and weapons, plus world & systems (drunk level, hero rooms,
// NPC minds, benchmark, editors, FPS counter). Every cheat is also a console command (type `help`).
// Pedestrians spawned or re-dressed here come from the crowd's own adult spec pool — no new spawn paths.
import * as THREE from 'three';
import { Input } from '../core/Input.js';
import { Settings } from '../core/Settings.js';
import { openEditor, openTextureStudio, openModelStudio, openBankEditor, openPaintEditor, TEXTURE_STUDIO } from '../debug/boot.js'; // tiny: the editors themselves load on demand
import { DevLock } from '../debug/DevLock.js'; // 68th: DoneShaun$123$ removes the console (secret code brings it back)
import { Audio } from '../audio/Audio.js';
import { WEAPONS } from '../combat/WeaponDefs.js';
import { WEATHER } from '../gfx/Atmosphere.js';
import { PLACES } from '../world/Layout.js';
import { BOATS, YACHT_IDS, BOAT_IDS, JETSKI_IDS, boatName } from '../boats/BoatCatalog.js';
import { MARINA } from '../boats/Marina.js';
import { HEROES, Character } from '../actors/Character.js';
import { Vehicle, LIVE_VEHICLES } from '../vehicles/Vehicle.js';
import { driveDoor, shutDoorLater } from '../vehicles/DoorRig.js';
import { REAL_TYPES, realAsset } from '../vehicles/RealModels.js';
import { VTYPES } from '../vehicles/VehicleModels.js';
import { SUV_IDS, OTHER_IDS, displayName } from '../vehicles/VehicleCatalog.js';
import { BIKE_IDS, SUPERBIKE_IDS, BIKES, bikeName } from '../vehicles/BikeCatalog.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const VEH = ['tuktuk', 'car', 'sedan', 'taxi', 'van', 'suv', 'bike', 'bus', 'lorry'].filter((t) => VTYPES[t]);
const vName = (v) => (BIKES[v] ? bikeName(v) : VTYPES[v] && VTYPES[v].catalog ? displayName(v, VTYPES[v]) : v); // cars use the car makes, bikes the bike makes
const CAT_VEH = [...SUV_IDS, ...OTHER_IDS, ...BIKE_IDS]; // the 40 catalogue models + 20 motorcycles / scooters (fictional makes)
const HEAVY = ['bus', 'pbus', 'lorry', 'tow'].filter((t) => VTYPES[t]), EMERG = ['police', 'policejeep', 'policebike', 'ambulance'].filter((t) => VTYPES[t]);
const realTag = (v) => (realAsset(v) ? ' · real model' : ''); // body converted from a real car model (badges removed); otherwise procedural
const MODELS = ['dineth', 'shashika', 'david', 'ruwan', 'fathima', 'selvaraj', 'bandara', 'anjali'].filter((k) => HEROES[k]);
const fmtH = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

export function newDebugState() { return { menuEnabled: false, god: false, infAmmo: false, noWanted: false, freezeTime: false, playerSpec: null }; }

export class DebugConsole {
  constructor(game, parent) {
    this.g = game; this.open = false; this.menuOpen = false; this.hist = []; this.hi = -1; this.log = []; this.stack = []; this.sel = 0;
    const host = parent || document.body;
    this.con = document.createElement('div'); this.con.className = 'dbg-con hidden';
    this.con.innerHTML = '<div class="dbg-log"></div><div class="dbg-line"><span>&gt;</span><input class="dbg-in" spellcheck="false" autocomplete="off" placeholder="type help — debug.menu true enables the debug menu (Numpad 2)"></div>';
    host.appendChild(this.con); this.logEl = this.con.querySelector('.dbg-log'); this.input = this.con.querySelector('.dbg-in');
    this.menu = document.createElement('div'); this.menu.className = 'dbg-menu hidden'; host.appendChild(this.menu);
    this.menu.addEventListener('click', (e) => { const r = e.target.closest('[data-i]'); if (!r) return; this.sel = +r.dataset.i; this.activate(); });
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Backquote' || e.code === 'Escape') { e.preventDefault(); this.toggle(false); return; }
      if (e.code === 'Enter') { const v = this.input.value.trim(); this.input.value = ''; if (v) { this.hist.unshift(v); this.hi = -1; this.print('> ' + v, 'cmd'); this.exec(v); } }
      else if (e.code === 'ArrowUp') { e.preventDefault(); this.hi = Math.min(this.hist.length - 1, this.hi + 1); if (this.hist[this.hi]) this.input.value = this.hist[this.hi]; }
      else if (e.code === 'ArrowDown') { e.preventDefault(); this.hi = Math.max(-1, this.hi - 1); this.input.value = this.hi >= 0 ? this.hist[this.hi] : ''; }
    });
    addEventListener('keydown', (e) => { // global hot keys (the game's own key bus ignores the console while typing)
      if (this.g.mode !== 'play') return;
      if (this.g.editorHook) return; // a debug editor has the keyboard
      if (DevLock.locked) return; // 68th: removed (DoneShaun$123$) — only the secret code typed in the game brings it back
      if (e.code === 'Backquote' && !this.open) { e.preventDefault(); this.toggle(true); }
      else if (e.code === 'Numpad2' && !this.open && this.g.debug.menuEnabled && !this.menuOpen) { this.toggleMenu(true); this.skipNav = true; }
    });
    this.print('COLOMBO developer console. Type help for commands.', 'sys');
    DevLock.on((locked) => { if (locked) { this.toggle(false); this.toggleMenu(false); this.D.menuEnabled = false; this.log = []; this.print(''); } });
  }
  get D() { return this.g.debug; }
  // ------------------------------------------------------------------ console
  // frame-rate benchmark of real play: every requestAnimationFrame interval for N seconds while the player plays/drives normally
  bench(secs) {
    if (this._bench) { this.print('a benchmark is already running', 'err'); return; }
    const g = this.g, R = g.renderer; const dts = []; let last = performance.now(); const t0 = last; this._bench = true;
    this.print(`benchmark: ${secs} s of normal play from now — the console closes; play or drive as usual`, 'sys'); setTimeout(() => this.toggle(false), 0);
    const tick = () => { const now = performance.now(); dts.push(now - last); last = now;
      if (now - t0 < secs * 1000) { requestAnimationFrame(tick); return; }
      this._bench = false; dts.shift(); const s = [...dts].sort((x, y) => y - x); const tot = dts.reduce((x, y) => x + y, 0); const low = (f) => { const k = Math.max(1, Math.floor(s.length * f)); return 1000 / (s.slice(0, k).reduce((x, y) => x + y, 0) / k); };
      let gpu = ''; try { const gl = R.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { /* not exposed */ }
      const q = Settings.get('quality'), sz = R.getSize(new THREE.Vector2()), pr = R.getPixelRatio();
      const lines = [`BENCHMARK ${secs} s · ${dts.length} frames · quality ${q} · ${Math.round(sz.x * pr)}×${Math.round(sz.y * pr)}${gpu ? ' · ' + gpu : ''}`,
        `  average ${(1000 * dts.length / tot).toFixed(1)} fps · 1 % low ${low(0.01).toFixed(1)} fps · 0.1 % low ${low(0.001).toFixed(1)} fps`,
        `  worst frame ${s[0].toFixed(1)} ms · frames over 33 ms (below 30 fps): ${dts.filter((d) => d > 33.4).length} · over 50 ms: ${dts.filter((d) => d > 50).length}`];
      if (dts.length < 60) lines.push('  (very few frames: run it longer for meaningful lows)');
      for (const l of lines) this.print(l, 'ok'); console.log(lines.join('\n')); this.toggle(true); };
    requestAnimationFrame(tick);
  }
  // 68th: DoneShaun$123$ — close every developer window, then hide the console for good (DevLock: dev-lock.json / this install)
  lockTools() { try { const E = globalThis.__editors || {}; for (const ed of Object.values(E)) { try { ed && ed.close && ed.close(); } catch (e) { /* already closed */ } } } catch (e) { /* none */ }
    DevLock.lock(); this.toggle(false); }
  toggle(v = !this.open) {
    if (v && DevLock.locked) v = false;
    this.open = v; this.con.classList.toggle('hidden', !v); Input.typing = v; Input.down.clear();
    if (v) { Input.releaseLock(); setTimeout(() => this.input.focus(), 0); } else this.input.blur();
  }
  print(s, cls = '') { this.log.push([s, cls]); if (this.log.length > 120) this.log.shift(); this.logEl.innerHTML = this.log.map(([t, c]) => `<div class="${c}">${esc(t)}</div>`).join(''); this.logEl.scrollTop = 1e9; }
  exec(line) {
    const [cmd, ...a] = line.split(/\s+/); const c = cmd.toLowerCase(); const on = (v, cur) => (v === undefined ? !cur : /^(1|true|on|yes)$/i.test(v));
    if (DevLock.locked) return; // nothing runs while the developer tools are removed
    if (c === 'doneshaun$123$') { this.print('developer console and Texture Studio removed.', 'ok'); this.lockTools(); return; }
    try {
      switch (c) {
        case 'help': ['bench [seconds] [warmup] [ACE] [city|fight|race|race-expert] — render benchmark: A native 150 %, B native 100 %, C/D/E SGSR 90/85/80 % (JSON / CSV); scenario F = fight night, R = street race HARD (rx = EXPERT)', 'sgsr [off|100|90|85|80|150] [sharpness] — Snapdragon Game Super Resolution', 'models-weapons · model-player · model-vehicles · model-npc — model tools: replace / edit models, textures, animations (dev builds)', 'roadside [status|force kind|call|clear|on|off] — breakdowns & Street Customs roadside recovery (80th)', 'grass [status|auto|off|low|medium|high|ultra|gpu|legacy|governor on|off] — GPU grass level / renderer (90th)', 'bank-edit — bank editor: move / turn / scale / hide / retexture any part of the bank hall (inside the bank, dev builds)', 'paint — environment editor: import glTF models + PBR textures, place props, paint grass / plants / rocks over the map, layers, export / import, COMPILE into the game (dev builds)', 'textures — Texture Studio · map — map editor (upload models: Map editor → Add → Model) · animations · npc', 'debug.menu true|false — enable the debug menu (open it with Numpad 2)', 'time <0-24> · freeze [on|off]', `weather <${Object.keys(WEATHER).join('|')}>`, 'money <amount>', 'god [on|off] · ammo [on|off] (infinite) · nowanted [on|off]', 'mind · mind stats · mind off|on — NPC personality / feelings / memories',
          `give <all|grenades|${WEAPONS.map((w) => w.id).join('|')}>`, 'power status | cut <district> [s] | restore [district|all] | trip <north|central|south> [s]', 'events [list|info <id>|go <id>|start <id> [leadMin]|cancel <id>|suspend <id>|pause <id> [min]|stats] — dynamic city events (81st)', 'tp <place> | tp <x> <z> | tp waypoint · places', 'roadcheck · roadcheck tp <n> — list buildings / landmarks / stalls / walls standing on a road (incl. map-editor edits)', 'drunk <0..1> · room <dineth|shashika|david>', 'vehicle info|repair|upright|open|close|dmg|shoot [n]|tyre|glass|dent|fire|explode — your vehicle, or the nearest within 10 m', 'bench [seconds] — frame-rate benchmark of real play (avg fps, 1 % / 0.1 % lows, worst frame); the console closes while it runs', `spawn ped [n] · spawn car [${VEH.join('|')}|<catalogue id>]`, 'cars — list the 40 catalogue vehicles (ids for spawn car)', `model <${MODELS.join('|')}|civilian|reset>`, 'dress [outfit] — re-dress pedestrians within 35 m · outfits', 'animations — animation editor (every animation in the game, keyframes, poses, speed …)', 'map — map editor (move / add / delete / repaint anything, save the map)', 'npc — NPC editor (remodel NPCs: every appearance parameter, proportions, paint on the model, fabric textures)', 'sounds — sound window: replace any sound (weapons, vehicles, sirens, ambience, music …) with your own .mp3 / .wav; built into the .exe', 'dialogs — NPC voices window: your own recordings for every kind of NPC talking, screaming, scared, running away, hurt, car stolen, police orders …', ...(TEXTURE_STUDIO ? ['textures — Texture Studio (dev builds): click any object, replace its textures / material settings, library, save + export'] : []), 'heli [call|land|info] — the police helicopter (also dispatched at 4★+)', 'heal · clear · close'].forEach((s) => this.print('  ' + s)); break;
        case 'debug.menu': this.D.menuEnabled = on(a[0], this.D.menuEnabled); if (!this.D.menuEnabled) this.toggleMenu(false); this.print(`debug menu ${this.D.menuEnabled ? 'ENABLED — press Numpad 2 to open it' : 'disabled'}`, 'ok'); break;
        case 'time': this.setTime(+a[0]); break;
        case 'freeze': this.D.freezeTime = on(a[0], this.D.freezeTime); this.print(`clock ${this.D.freezeTime ? 'frozen' : 'running'}`, 'ok'); break;
        case 'weather': this.setWeather(a[0]); break;
        case 'power': { const G = this.g.power; if (!G) throw new Error('no power grid'); const [cmd, z, s] = a; // 79th: power cut <district> [s] · power restore [district|all] · power trip <north|central|south> · power status
          if (cmd === 'cut') { if (!G.cut(z, +s || 120, 'console')) throw new Error('power cut <' + G.zones().join('|') + '> [seconds]'); this.say(`power cut ${z}`); }
          else if (cmd === 'restore') { if (!z || z === 'all') G.restoreAll(); else G.restore(z); this.say(`power restored ${z || 'all'}`); }
          else if (cmd === 'trip') { if (!G.tripSubstation(z, +s || 150)) throw new Error('power trip <north|central|south> [seconds]'); this.say(`substation ${z} tripped`); }
          else { const o = G.outages(); this.print(o.length ? o.map((q) => `${q.zone} (${q.cause}${q.left != null ? ', ' + Math.round(q.left) + ' s' : ''})`).join(' · ') : 'all districts powered', 'ok'); }
          break; }
        case 'events': { const M = this.g.cityEvents; if (!M) throw new Error('city events are off'); const [sub = 'list', id, n] = a; const ev = id ? M.find(id) : null; // 81st: dynamic city events
          if (sub === 'list') { for (const e of M.list) { const v = M.view(e); this.print(`${e.id.padEnd(22)} ${v.status.padEnd(14)} ${v.dateShort} ${v.start}–${v.end} · ${v.venueShort}`); } break; }
          if (sub === 'stats') { const st = M.stats; this.print(`sites ${M.sites.size} · builds ${st.builds} (max ${st.maxBuildMs.toFixed(1)} ms) · disposes ${st.disposes} · disturbances ${st.disturbances} · update max ${(st.maxMs || 0).toFixed(1)} ms`, 'ok'); for (const [k, s2] of M.sites) this.print(`  ${k}: tiers ${s2.shown} · visitors ${s2.visitors.length} (+${s2.incoming.length} coming) · staff ${s2.staff.length} · crew ${s2.crew.length} · performers ${s2.performers.length}`); break; }
          if (!ev) throw new Error('events ' + sub + ' <id> — see: events list');
          if (sub === 'info') { const v = M.view(ev); this.print(`${v.title} · ${v.cat} · ${v.status} · ${v.date} ${v.start}–${v.end} · ${v.venue}${v.crowd ? ' · ' + v.crowd : ''}`, 'ok'); for (const q of v.notes) this.print('  ' + q); }
          else if (sub === 'go') { const v = M.view(ev); this.teleport(v.at.x, v.at.z, v.title); }
          else if (sub === 'start') { M.startNow(ev, (+n || 0) / 60); this.say(`${ev.id} starts ${n ? 'in ' + n + ' min' : 'now'}`); }
          else if (sub === 'cancel') { M.cancel(ev, 'cancelled by the organisers'); this.say(`${ev.id} cancelled`); }
          else if (sub === 'suspend') { if (!M.suspend(ev, 'a safety check')) throw new Error('only an event that is on can be suspended'); this.say(`${ev.id} suspended`); }
          else if (sub === 'pause') { if (!M.pause(ev, 'a short break', +n || 8)) throw new Error('only an active event can be paused'); this.say(`${ev.id} paused`); }
          else throw new Error('events [list|info|go|start|cancel|suspend|pause|stats]');
          break; }
        case 'money': this.money(+a[0]); break;
        case 'god': this.D.god = on(a[0], this.D.god); this.print(`god mode ${this.D.god ? 'on' : 'off'}`, 'ok'); break;
        case 'ammo': this.D.infAmmo = on(a[0], this.D.infAmmo); this.print(`infinite ammo ${this.D.infAmmo ? 'on' : 'off'}`, 'ok'); break;
        case 'nowanted': this.D.noWanted = on(a[0], this.D.noWanted); this.print(`never wanted ${this.D.noWanted ? 'on' : 'off'}`, 'ok'); break;
        case 'give': this.give(a[0] || 'all'); break;
        case 'places': this.print('  ' + Object.keys(PLACES).join(', ')); break;
        case 'tp': if (a[0] === 'waypoint') this.tpWaypoint(); else if (a.length >= 2 && !isNaN(+a[0])) this.teleport(+a[0], +a[1], `${a[0]}, ${a[1]}`); else { const p = PLACES[a[0]]; if (!p) throw new Error('unknown place — type places'); this.teleport(p.x, p.z, p.name); } break;
        case 'cars': for (const [h, ids] of [['SUVs', SUV_IDS], ['cars, vans & trucks', OTHER_IDS], ['motorcycles & scooters', BIKE_IDS]]) { this.print(h + ':', 'ok'); for (let i = 0; i < ids.length; i += 4) this.print(ids.slice(i, i + 4).map((v) => `${v} (${vName(v)})`).join(' · ')); } break;
        case 'spawn': if (a[0] === 'ped') this.spawnPeds(+a[1] || 5); else if (a[0] === 'car' || a[0] === 'vehicle') this.spawnCar(a[1] || 'car'); else throw new Error('spawn ped [n] | spawn car [type]'); break;
        case 'model': this.model(a[0] || 'reset'); break;
        case 'dress': this.dress(a[0]); break;
        case 'outfits': this.print('  ' + this.outfits().join(', ')); break;
        case 'heal': this.g.health.hp = 100; this.print('healed', 'ok'); break;
        case 'drunk': { const D = this.g.drunk; if (!D) throw new Error('no drunk system'); const v = Math.max(0, Math.min(1.1, +(a[0] ?? 0.8))); D.level = v; D.eff = v; D.hold = 30; this.print(`drunk level ${v.toFixed(2)} (${D.label})`, 'ok'); break; }
        case 'room': this.room(a[0] || 'dineth'); break;
        case 'vehicle': case 'veh': { const op = (a[0] || 'info').toLowerCase(); if (op === 'info') this.vehInfo(); else if (op === 'repair') this.vehRepair(); else if (this.vehDamage(op, a.slice(1))) { /* damage tools */ } else if (op === 'upright') { const v = this.vehTarget(); v.speed = 0; v.lat = 0; if (v.sus) Object.assign(v.sus, { r: 0, rv: 0, h: 0, hv: 0 }); v.place(v.x, v.z, v.yaw); this.say(`${vName(v.type)} set upright`); } else if (op === 'open' || op === 'close') this.vehDoors(op === 'open'); else throw new Error('vehicle info|repair|upright|open|close|dmg|shoot [n]|tyre|glass|dent|fire|explode'); break; }
        case 'animations': case 'anim': case 'map': case 'npc': case 'npcs': { // the editors are separate modules, downloaded only now
          const kind = c.startsWith('anim') ? 'animations' : c.startsWith('npc') ? 'npc' : 'map'; this.print(`loading the ${kind} editor…`, 'sys'); this.toggle(false);
          openEditor(kind, this.g).catch((e) => { console.error(e); this.toggle(true); this.print('editor failed to load: ' + (e && e.message || e), 'err'); }); break; }
        case 'models-weapons': case 'model-weapons': case 'models-weapon': case 'model-weapon':
        case 'model-player': case 'models-player': case 'model-players': case 'model-vehicles': case 'models-vehicles': case 'model-vehicle':
        case 'model-npc': case 'models-npc': case 'model-npcs': case 'models-npcs': { // 68th: model tools (development builds only; separate module, downloaded only now)
          if (!TEXTURE_STUDIO) { this.print('the model tools are development tools and are not part of this build (run npm run dev, or build with npm run build:studio)', 'err'); break; }
          const mode = c.includes('weapon') ? 'weapons' : c.includes('player') ? 'player' : c.includes('vehicle') ? 'vehicles' : 'npc'; this.print(`opening the model tools (${mode})…`, 'sys'); this.toggle(false);
          openModelStudio(this.g, mode).catch((e) => { console.error(e); this.toggle(true); this.print('model tools failed to load: ' + ((e && e.message) || e), 'err'); }); break; }
        case 'paint': case 'paint-editor': case 'env-editor': // environment editor (development builds only; separate module, downloaded only now)
          if (!TEXTURE_STUDIO) { this.print('the environment editor is a development tool and is not part of this build (run npm run dev). Scenes it compiled are built into every build.', 'err'); break; }
          this.print('opening the environment editor…', 'sys'); this.toggle(false);
          openPaintEditor(this.g).catch((e) => { console.error(e); this.toggle(true); this.print('environment editor: ' + ((e && e.message) || e), 'err'); }); break;
        case 'bank-edit': case 'bankedit': case 'bank-editor': // 73rd: bank editor (development builds only; separate module, downloaded only now)
          if (!TEXTURE_STUDIO) { this.print('the bank editor is a development tool and is not part of this build (run npm run dev, or build with npm run build:studio)', 'err'); break; }
          this.print('opening the bank editor…', 'sys'); this.toggle(false);
          openBankEditor(this.g).catch((e) => { console.error(e); this.toggle(true); this.print('bank editor: ' + ((e && e.message) || e), 'err'); }); break;
        case 'textures': case 'texture': case 'texstudio': // 59th: Texture Studio (development builds only; separate module, downloaded only now)
          if (!TEXTURE_STUDIO) { this.print('the Texture Studio is a development tool and is not part of this build (run npm run dev, or build with npm run build:studio)', 'err'); break; }
          this.print('opening the Texture Studio…', 'sys'); this.toggle(false);
          openTextureStudio(this.g).catch((e) => { console.error(e); this.toggle(true); this.print('Texture Studio failed to load: ' + ((e && e.message) || e), 'err'); }); break;
        case 'dialogs': case 'dialog': case 'dialogues': case 'voices': this.print('opening the NPC voices window…', 'sys'); this.toggle(false); // separate module, downloaded only now
          import('./DialogsWindow.js').then((m) => m.open(this.g)).catch((e) => { console.error(e); this.toggle(true); this.print('dialogs window failed to load: ' + ((e && e.message) || e), 'err'); }); break;
        case 'bench': case 'benchmark': { // 91st: render benchmark (src/gfx/Benchmark.js) — bench [seconds] [warmup] [configs e.g. ACE]
          const scA = a.find((x) => /^(city|fight|race|race-expert|f|r|rx)$/i.test(x)); const b = a.filter((x) => x !== scA); const scene = scA ? ({ f: 'fight', r: 'race', rx: 'race-expert' }[scA.toLowerCase()] || scA.toLowerCase()) : undefined; // 92nd: scenario F / R
          const sec = +b[0] || undefined, warm = +b[1] || undefined, cf = b[2] ? b[2].toUpperCase().split('').filter((x) => 'ABCDE'.includes(x)) : undefined;
          this.print(`benchmark${scene ? ' ' + scene : ''}: ${cf ? cf.join(', ') : 'A–E'} · ${sec || Settings.get('benchSec')} s each (+${warm || Settings.get('benchWarm')} s warm-up) — Esc aborts`, 'sys'); this.toggle(false);
          this.g.runBenchmark({ seconds: sec, warmup: warm, configs: cf, scene }).catch((e) => { console.error(e); this.print('benchmark: ' + ((e && e.message) || e), 'err'); }); break; }
        case 'sgsr': { // 91st: sgsr [off|100|90|85|80|150] [sharpness 1–2] — the Graphics setting, live
          if (a[0]) { const v = a[0] === 'off' ? 'off' : a[0] === '150' ? 'ss150' : 'sgsr' + a[0]; if (!['off', 'ss150', 'sgsr100', 'sgsr90', 'sgsr85', 'sgsr80'].includes(v)) throw new Error('sgsr off|100|90|85|80|150'); Settings.set('upscale', v); }
          if (a[1]) Settings.set('sgsrSharpness', Math.min(2, Math.max(1, +a[1] || 2)));
          const r = this.g.post.resolution(); this.print(`upscale ${Settings.get('upscale')} · sharpness ${Settings.get('sgsrSharpness')} · ${r.internal.join('×')} → ${r.output.join('×')}${r.sgsr ? ' (SGSR)' : ''}${this.g.post.sgsrFailed ? ' · SGSR failed on this GPU (native)' : ''}`, 'sys'); break; }
        case 'sounds': case 'sound': this.print('opening the sounds window…', 'sys'); this.toggle(false); // separate module, downloaded only now
          import('./SoundsWindow.js').then((m) => m.open(this.g)).catch((e) => { console.error(e); this.toggle(true); this.print('sounds window failed to load: ' + ((e && e.message) || e), 'err'); }); break;
        case 'grass': { // 90th: GPU grass (world/GrassGPU.js) — status · auto|off|low|medium|high|ultra · gpu|legacy (compare) · governor on|off
          const W = this.g.world, G = W && W.grassGPU; if (!G) throw new Error('no GPU grass in this build'); const sub = a[0] || 'status';
          if (sub === 'status') { const s = G.stats || {}; this.print(`grass ${W.grassMode || 'gpu'} · level ${G.level || 'off'} (pref ${G.prefs.level || 'auto'}, governor ${G.prefs.governor === false ? 'off' : 'on'}${G.gov.drop ? ', dropped ' + G.gov.drop : ''}) · blades ${s.blades || 0} · draws ${s.draws || 0} · ${((s.gpuBytes || 0) / 1024).toFixed(0)} KB`, 'sys'); }
          else if (sub === 'gpu' || sub === 'legacy') { W.setGrassMode(sub); this.print(`grass renderer: ${sub}`, 'ok'); }
          else if (sub === 'governor') { G.prefs.governor = on(a[1], G.prefs.governor !== false); G.gov.drop = 0; G.setPreference(G.prefs.level || 'auto'); this.print(`grass governor ${G.prefs.governor ? 'on' : 'off'}`, 'ok'); }
          else if (['auto', 'off', 'low', 'medium', 'high', 'ultra'].includes(sub)) { if (W.grassMode !== 'gpu') W.setGrassMode('gpu'); G.setPreference(sub); this.print(`grass level ${sub}${sub === 'auto' ? ' (follows graphics quality + frame-rate governor)' : ''}`, 'ok'); }
          else throw new Error('grass [status|auto|off|low|medium|high|ultra|gpu|legacy|governor on|off]');
          break;
        }
        case 'roadside': case 'rs': { // 80th: roadside assistance (Roadside.js): status · force [kind] · call · clear · on|off
          const R = this.g.police && this.g.police.rs; if (!R) throw new Error('no roadside service in this build'); const sub = a[0] || 'status';
          if (sub === 'status') { const s = R.status(); this.print(`incidents ${s.incidents.length}: ` + (s.incidents.map((q) => `#${q.id} ${q.kind} ${q.ph} (${q.need}${q.unit !== null ? ' unit ' + q.unit : ''}) ${q.d} m`).join(' · ') || '—'), 'sys'); this.print(`units ${s.units.length}: ` + (s.units.map((u) => `${u.id} ${u.type} ${u.ph} crew ${u.crew}`).join(' · ') || '—'), 'sys'); this.print(Object.entries(s.stats).filter(([, v]) => typeof v === 'number' && v).map(([k, v]) => `${k} ${v}`).join(' · ') || 'no jobs yet', 'sys'); }
          else if (sub === 'force') { const inc = R.force(a[1] || null); this.print(inc ? `#${inc.id}: a ${inc.v.type} breaks down (${inc.kind}) ${Math.hypot(inc.v.x - this.g.player.x, inc.v.z - this.g.player.z).toFixed(0)} m away` : 'no eligible car nearby (lane traffic 20–200 m away, on a kerb lane clear of junctions)', inc ? 'ok' : 'err'); }
          else if (sub === 'call') { const r = R.call(); this.print(r.msg, r.ok ? 'ok' : 'err'); }
          else if (sub === 'clear') { R.clear(); this.print('roadside incidents and units cleared', 'ok'); }
          else if (sub === 'on' || sub === 'off') { import('../police/Roadside.js').then((m) => { m.RS.enabled = sub === 'on'; this.print(`spontaneous breakdowns ${sub}`, 'ok'); }); }
          else throw new Error('usage: roadside [status|force [battery|flat|overheat|nostart|engine|mechanical|immobilised]|call|clear|on|off]'); break; }
        case 'heli': { // police helicopter: call (launch / orbit you), land (back to the HQ pad), tp (teleport the camera beside the pad), info
          const H = this.g.heli; if (!H) throw new Error('no helicopter in this build'); const sub = a[0] || 'info';
          if (sub === 'call') { H.call(true); this.print('Air Wing launching from the Police HQ helipad (start-up ~13 s)', 'ok'); }
          else if (sub === 'land' || sub === 'home') { H.home(); this.print('helicopter returning to the Police HQ helipad', 'ok'); }
          else if (sub === 'info') this.print(H.info(), 'sys');
          else throw new Error('usage: heli [call|land|info]'); break; }
        case 'bench': this.bench(+a[0] || 20); break;
        case 'mind': { // NPC minds (Mind.js): 'mind' = the nearest person's personality / feelings / memories; 'mind stats'; 'mind off|on' (A/B)
          const C = this.g.crowd, M = C && C.minds; if (!M) throw new Error('no crowd minds');
          if (a[0] === 'stats') { const I = M.info(); this.print(Object.entries(I).map(([k, v]) => `${k} ${typeof v === 'number' ? +v.toFixed(2) : v}`).join(' · '), 'ok'); const R = this.g.traffic && this.g.traffic.rageStats; if (R) this.print(`road rage: crashes ${R.crashes} · horn ${R.honk} · got out ${R.out} · back in ${R.back}`); break; }
          if (a[0] === 'off' || a[0] === 'on') { M.enabled = a[0] === 'on'; this.print(`NPC minds ${M.enabled ? 'on' : 'off (stimuli ignored; personalities stay)'}`, 'ok'); break; }
          const P = this.g.player; let best = null, bd = 12; for (const q of C.peds) { const d = Math.hypot(q.x - P.x, q.z - P.z); if (q.mind && d < bd) { bd = d; best = q; } }
          if (!best) { this.print('nobody within 12 m', 'warn'); break; } const D = M.describe(best);
          this.print(`${D.id} (${D.home || '?'}) · ${D.state} · mood ${D.mood} · pace ×${D.pace} · ${bd.toFixed(1)} m`, 'ok');
          this.print('  traits   ' + Object.entries(D.traits).map(([k, v]) => `${k} ${v}`).join(' · '));
          this.print('  feelings ' + Object.entries(D.emotions).filter(([, v]) => v > 0.02).map(([k, v]) => `${k} ${v}`).join(' · '));
          if (D.memories.length) this.print('  memories ' + D.memories.map((e) => `${e.what}${e.who ? '(' + e.who + ')' : ''} ${e.imp} ${e.ago}s ago`).join(' · '));
          for (const [h, r] of Object.entries(D.player)) this.print(`  ${h}: like ${r.like} · fear ${r.fear} · met ${r.met} · harassed ${r.harassed} · helped ${r.helped} · crimes seen ${r.crimesSeen}`);
          if (D.ties.length) this.print('  knows    ' + D.ties.map((t) => `${t.who} ${t.aff}`).join(' · '));
          break; }
        case 'roadcheck': this.roadcheck(a); break;
        case 'undress': case 'undress.front': case 'undress.back': this.print('not available — the game has no nude or undressing content, debug or otherwise (characters stay clothed).', 'warn'); break;
        case 'clear': this.log = []; this.print(''); break;
        case 'lock': this.print('type DoneShaun$123$ to remove the developer console and the Texture Studio', 'sys'); break;
        case 'close': case 'exit': this.toggle(false); break;
        default: this.print(`unknown command: ${cmd} (type help)`, 'err');
      }
    } catch (e) { this.print(e.message || String(e), 'err'); }
  }
  // ------------------------------------------------------------------ cheats
  setTime(h) { if (!(h >= 0 && h <= 24)) throw new Error('time 0-24'); this.g.atmos.hour = h % 24; this.g.atmos.lastEnvHour = -99; this.say(`time ${fmtH(h)}`); }
  setWeather(w) { if (!WEATHER[w]) throw new Error('weather: ' + Object.keys(WEATHER).join(', ')); const A = this.g.atmos; A.forceWeather(w); A.setWeather(w, true); A.forced = null; A.lastEnvHour = -99; this.say(`weather ${w}`); }
  money(n) { if (!Number.isFinite(n) || n === 0) throw new Error('money <amount>'); this.g.story.pay(Math.round(n), 'Debug cheat'); this.say(`money ${n > 0 ? '+' : ''}${n.toLocaleString('en-LK')}`); }
  give(id) {
    if (id === 'grenades' || id === 'grenade') { const G = this.g.grenades; if (!G) throw new Error('no grenades'); G.count = 6; this.say(`6 grenades given to ${this.g.squad?.activeMember?.def?.name || 'player'} (throw: B)`); return; }
    const inv = this.g.weapons.inv; const list = id === 'all' ? WEAPONS : WEAPONS.filter((w) => w.id === id); if (!list.length) throw new Error('unknown weapon');
    for (const w of list) { const s = inv[WEAPONS.indexOf(w)]; s.owned = true; s.mag = w.mag; s.reserve = w.reserve; }
    const W = this.g.weapons; if (W.sel < 0 && !W.drawn) { W.sel = WEAPONS.indexOf(list[0]); W.showHolstered(); }
    this.say(`${list.length === 1 ? list[0].name : 'all weapons'} given to ${this.g.squad?.activeMember?.def?.name || 'player'}`);
  }
  // placement audit of the live city (PlacementCheck.js, loaded on demand): generated buildings, map-editor edits, stalls,
  // garden walls and the landmark / forecourt structures in the collision world
  roadcheck(a) {
    if (a[0] === 'tp') { const r = (this.roadHits || [])[(+a[1] || 1) - 1]; if (!r) throw new Error('run roadcheck first (then roadcheck tp <n>)'); this.teleport(r.x, r.z, `${r.kind} #${(+a[1] || 1)}`); return; }
    this.print('checking placement…', 'sys');
    import('../world/PlacementCheck.js').then(({ auditPlacement, roadName }) => {
      const W = this.g.world; const hits = auditPlacement(W.plan, W.collision.list || []); this.roadHits = hits;
      if (!hits.length) { this.print('roadcheck: nothing stands on a road — buildings, landmarks, stalls and walls are all clear', 'ok'); return; }
      this.print(`roadcheck: ${hits.length} object(s) on a road / pavement:`, 'err');
      hits.slice(0, 20).forEach((r, i) => this.print(`  ${i + 1}. ${r.kind}${r.ref && r.ref.style ? ' (' + r.ref.style + ')' : ''}${r.ref && r.ref.added ? ' [added in map editor]' : r.ref && r.ref.eid ? ' ' + r.ref.eid : ''} on ${roadName(r.x, r.z)} at ${r.x}, ${r.z} — ${r.road} road / ${r.pave} pavement samples`));
      if (hits.length > 20) this.print(`  … and ${hits.length - 20} more`); this.print('  roadcheck tp <n> teleports there', 'sys');
    }).catch((e) => this.print('roadcheck failed: ' + e.message, 'err'));
  }
  teleport(x, z, label) {
    const g = this.g, P = g.player; if (g.interiors.current) throw new Error('leave the interior first'); if (P.vehicle) throw new Error('leave the vehicle first');
    const [sx, sz] = g.story.safeSpot ? g.story.safeSpot(x, z) : [x, z]; P.teleport(sx, sz, P.yaw); if (g.world.trim) g.world.trim(sx, sz); this.say(`teleported to ${label}`);
  }
  // ---- boats (boats/Boats.js): spawning, the marina, your berth and fleet, damage, the police patrol, owners coming and going
  boatsB() { const B = this.g.boats; if (!B) throw new Error('boats are not loaded'); return B; }
  boatTarget() { const B = this.boatsB(), P = this.g.player; if (B.ride) return B.ride.b; let best = null, bd = 40; for (const b of B.all) { if (!b.root.visible || b.away || b.mode === 'sunk') continue; const d = Math.hypot(b.x - P.x, b.z - P.z); if (d < bd) { bd = d; best = b; } } if (!best) throw new Error('no boat within 40 m'); return best; }
  tpMarina(where = 'gang') { const g = this.g, P = g.player; if (g.interiors.current) throw new Error('leave the interior first'); if (P.vehicle) throw new Error('leave the vehicle first'); if (P.boat) throw new Error('get off the boat first');
    const p = where === 'berth' ? { x: MARINA.terminal.x + 1.5, z: MARINA.terminal.z, yaw: Math.PI } : where === 'office' ? { x: MARINA.office.counter.x, z: MARINA.office.counter.z - 0.6, yaw: 0 } : { x: MARINA.gangTop.x, z: MARINA.gangTop.z, yaw: -Math.PI / 2 };
    P.teleport(p.x, p.z, p.yaw); if (g.world.trim) g.world.trim(p.x, p.z); this.say(`teleported to ${MARINA.name}${where === 'berth' ? ' · ' + MARINA.slipName : where === 'office' ? ' · office' : ''}`); }
  spawnBoat(id) { const B = this.boatsB(), P = this.g.player; if (P.vehicle || P.boat) throw new Error('get out first'); let b = B.spawnNear(id, P, false);
    if (!b) { this.tpMarina('berth'); b = B.spawnNear(id, P, false); } if (!b) throw new Error('no open water near you for a ' + boatName(id)); this.toggleMenu(false); this.say(`${boatName(id)} in the water — walk to her and press Enter to board`); }
  boatsMenu() { const g = this.g; const B = this.boatsB(); const st = B.state(); const list = (ids) => ids.map((id) => ({ label: `${boatName(id)} · ${BOATS[id].kind}`, act: () => this.spawnBoat(id) }));
    return { title: 'Boats & marina', items: [
      { label: 'Status', val: () => B.info(), act: () => this.say(B.info()) },
      { label: `Spawn luxury yacht (${YACHT_IDS.length})`, sub: () => ({ title: 'Spawn yacht', items: list(YACHT_IDS) }) },
      { label: `Spawn boat (${BOAT_IDS.length})`, sub: () => ({ title: 'Spawn boat', items: list(BOAT_IDS) }) },
      { label: `Spawn jet ski (${JETSKI_IDS.length})`, sub: () => ({ title: 'Spawn jet ski', items: list(JETSKI_IDS) }) },
      { label: 'Spawn harbour police boat', act: () => this.spawnBoat('police36') },
      { label: 'Teleport: Fort Harbour Marina (gangway)', act: () => { this.toggleMenu(false); this.tpMarina('gang'); } },
      { label: 'Teleport: marina office counter', act: () => { this.toggleMenu(false); this.tpMarina('office'); } },
      { label: `Teleport: your berth (${MARINA.slipName} pedestal)`, act: () => { this.toggleMenu(false); this.tpMarina('berth'); } },
      { label: `Give ${MARINA.slipName} (free)`, val: () => (st.slip ? 'owned' : ''), act: () => { const r = B.buyBerth(true); this.say(r.msg); } },
      { label: 'Order a boat free (delivered after sleeping / next day)', sub: () => ({ title: 'Free order', items: [...YACHT_IDS, ...BOAT_IDS, ...JETSKI_IDS].map((id) => ({ label: boatName(id), val: () => (B.owns(id) ? 'owned' : ''), act: () => { if (!B.state().slip) B.buyBerth(true); const r = B.order(id, true); this.say(r.msg); } })) }) },
      { label: 'Deliver orders now', act: () => { const n = B.state().pending.length; B.deliver(true); this.say(n ? `${n} boat(s) delivered` : 'nothing on order'); } },
      { label: 'Give every boat (berth + all 19, delivered)', act: () => { if (!B.state().slip) B.buyBerth(true); for (const id of [...YACHT_IDS, ...BOAT_IDS, ...JETSKI_IDS]) if (!B.owns(id)) B.order(id, true); B.deliver(true); this.say(`${B.state().owned.length} boats owned`); } },
      { label: 'Switch the boat at your berth', act: () => { const n = B.switchNext(); if (!n) throw new Error('you own no boats'); this.say(`${boatName(n.id)} is alongside`); } },
      { label: 'Nearest boat: damage 25 %', act: () => { const b = this.boatTarget(); b.damage(b.maxHp * 0.25, 'hull', null, 'debug'); this.say(`${boatName(b.id)} hull ${Math.max(0, Math.round((b.hp / b.maxHp) * 100))} %`); } },
      { label: 'Nearest boat: wreck (fire, sinks)', act: () => { const b = this.boatTarget(); b.damage(b.maxHp * 2, 'engine', null, 'debug'); this.say(`${boatName(b.id)} wrecked`); } },
      { label: 'Nearest boat: shoot 12 holes in the sails', act: () => { const b = this.boatTarget(); if (!b.sails.length) throw new Error('no sails on a ' + boatName(b.id)); b.setSailsVisible(true); for (let i = 0; i < 12; i++) b.sailHit(i % b.sails.length, new THREE.Vector2(0.15 + Math.random() * 0.7, 0.1 + Math.random() * 0.75)); this.say('sails holed / torn'); } },
      { label: 'Nearest boat: sails up / down', act: () => { const b = this.boatTarget(); if (!b.sails.length) throw new Error('no sails'); b.setSailsVisible(!b.sailsUp); this.say(b.sailsUp ? 'sails up' : 'sails furled'); } },
      { label: 'Harbour police patrol: force on', val: () => (B.forcePatrol ? 'ON' : 'OFF (schedule)'), act: () => { B.forcePatrol = !B.forcePatrol; this.say(B.forcePatrol ? 'police patrol on (2 boats)' : 'police patrol back on its schedule (mornings / nights, no wanted level)'); } },
      { label: 'Marina: an owner takes a boat out now', act: () => { const c = B.berths.filter((q) => q.boat && !q.boat.away && !q.boat.owner && q.boat.mode === 'moored'); if (!c.length || !B.startDeparture(c[Math.floor(Math.random() * c.length)])) throw new Error('nobody free right now (try again)'); this.say('an owner is walking down to his boat'); } },
      { label: 'Marina: a boat comes back now', act: () => { const b = B.all.find((q) => q.away && q.home && !q.owner); if (!b) throw new Error('no boat is out'); if (!B.startArrival(b)) throw new Error('could not bring her in unseen (look away / try again)'); this.say(`${boatName(b.id)} is coming in`); } },
    ] }; }
  tpWaypoint() { const w = this.g.hud.waypoint; if (!w) throw new Error('no waypoint set (set one on the map)'); this.teleport(w.x, w.z, 'waypoint'); }
  room(who) { const id = { dineth: 'room', shashika: 'room_shashika', david: 'room_david' }[who || 'dineth']; if (!id) throw new Error('room <dineth|shashika|david>'); const I = this.g.interiors; const d = I.doors.find((x) => x.id === id) || (id === 'room' ? { id: 'room', x: this.g.player.x, z: this.g.player.z, rot: 0, faceIn: Math.PI } : null); if (!d) throw new Error('no such room door'); if (I.current) throw new Error('leave the current interior first'); I.enter(d); this.print('entering ' + id, 'ok'); }
  // the player's vehicle, else the nearest live vehicle within 10 m
  vehTarget() { const P = this.g.player; if (P.vehicle) return P.vehicle; let best = null, bd = 10; for (const v of LIVE_VEHICLES) { if (v.disposed || !v.mesh || !v.mesh.parent) continue; const d = Math.hypot(v.x - P.x, v.z - P.z); if (d < bd) { bd = d; best = v; } } if (!best) throw new Error('no vehicle within 10 m'); return best; }
  vehInfo() { const v = this.vehTarget(), T = v.T, ud = v.mesh.userData; const lvl = ud.real ? ['LOD0', 'LOD1', 'LOD2'][ud.real.level] || '?' : ud.lodNear ? 'near kit' : 'far';
    this.say(`${vName(v.type)} (${v.type}) · ${T.cls || T.fam || 'vehicle'} · ${realAsset(v.type) ? 'real model' : 'procedural'} · ${lvl} · damage ${Math.round((v.damage || 0) * 100)} % · ${Math.round(Math.abs(v.speed || 0) * 3.6)} km/h · ${(ud.doors || []).length} doors`); }
  vehRepair() { const v = this.vehTarget(); if (v.wrecked) throw new Error('burnt out — a wreck cannot be repaired'); if (this.g.vdamage) this.g.vdamage.repair(v); v.damage = 0; v.health = 100; this.say(`${vName(v.type)} repaired`); }
  // VehicleDamage tools on the target vehicle; returns false for an unknown op
  vehDamage(op, a = []) {
    const VD = this.g.vdamage; const ops = ['dmg', 'damage', 'shoot', 'tyre', 'glass', 'dent', 'fire', 'explode']; if (!ops.includes(op)) return false; if (!VD) throw new Error('no vehicle damage system'); const v = this.vehTarget(); const nm = vName(v.type);
    if (op === 'dmg' || op === 'damage') { const st = v.vd; const G = st && st.glass; this.say(`${nm}: health ${Math.round(v.health ?? 100)} · power ${Math.round((v.power ?? 1) * 100)} % · ${v.wrecked ? 'WRECKED' : v.burning ? 'ON FIRE' : 'running'} · panes broken ${G ? G.broken.reduce((s, b) => s + b, 0) + '/' + G.panes.length : 0} · cracks ${G ? Math.min(G.nCr, 8) : 0} · holes ${st ? st.nHole : 0} · flats ${st ? st.flats : 0} · lamps ${v.headOut ? 'front out ' : ''}${v.tailOut ? 'rear out' : ''}`); return true; }
    if (v.wrecked) throw new Error('already a burnt-out wreck');
    if (op === 'shoot') { const n = Math.max(1, Math.min(60, +a[0] || 6)); VD.shootDemo(v, n); this.say(`${nm}: ${n} rounds fired into it — health ${Math.round(v.health)}`); }
    else if (op === 'tyre') { const W = (v.mesh.userData.wheels || []).filter((w) => !w.userData.flat); if (!W.length) throw new Error('every tyre is already flat'); VD.burst(v, W[0]); this.say(`${nm}: tyre burst`); }
    else if (op === 'glass') { if (!VD.smashAll(v)) throw new Error('this vehicle has no glass'); this.say(`${nm}: glass smashed`); }
    else if (op === 'dent') { const [fx, fz] = v.forward(); VD.onImpact(v, 16, { nx: -fx, nz: -fz, t: v.T.len / 2 }); this.say(`${nm}: front crash at ~58 km/h — health ${Math.round(v.health)}`); }
    else if (op === 'fire') { VD.ignite(v, 7, 'debug', 'engine'); this.say(`${nm}: engine fire — it goes up in about 7 s`); }
    else if (op === 'explode') { VD.explode(v, 'debug'); this.say(`${nm}: exploded`); }
    return true;
  }
  vehDoors(open) { const v = this.vehTarget(), D = (v.mesh.userData.doors || []); if (!D.length) throw new Error('this vehicle has no opening doors'); for (const d of D) { if (open) driveDoor(v, d, d.leaf ? 1 : 0.85); else shutDoorLater(v, d, 0); } this.say(`${D.length} doors ${open ? 'opened' : 'closing'}`); }
  spawnPeds(n) {
    const C = this.g.crowd, P = this.g.player; let k = 0; C.max = Math.max(C.max, C.peds.length + n);
    for (let i = 0; i < n * 3 && k < n; i++) if (C.spawn({ x: P.x, z: P.z }, null, true)) k++;
    this.say(`${k} pedestrian${k === 1 ? '' : 's'} spawned nearby`);
  }
  spawnCar(type) {
    if (!VTYPES[type]) throw new Error('vehicle: ' + VEH.join(', ') + ' · catalogue: ' + CAT_VEH.join(', ')); const g = this.g, P = g.player; if (P.vehicle || g.interiors.current) throw new Error('on foot, outdoors only');
    let best = null; for (const d of [5, 6.5, 8]) for (let k = 0; k < 8 && !best; k++) { const a = P.yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5; const x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d; if (!g.collision.blocked(x, z, 1.6)) best = [x, z]; }
    if (!best) throw new Error('no free space here'); const v = new Vehicle(type, Math.floor(Math.random() * 1e6), g.scene); v.place(best[0], best[1], P.yaw + Math.PI / 2); g.traffic.release(v, false);
    this.say(`${vName(type)} spawned`);
  }
  model(id) {
    const g = this.g; if (id === 'reset') this.D.playerSpec = null; else if (id === 'civilian') { const sp = g.crowd.specs[Math.floor(Math.random() * g.crowd.specs.length)]; this.D.playerSpec = { ...sp }; }
    else if (HEROES[id]) this.D.playerSpec = { ...HEROES[id] }; else throw new Error('model: ' + MODELS.join(', ') + ', civilian, reset');
    g.rebuildPlayer(); this.say(`player model: ${id}`);
  }
  outfits() { return [...new Set(this.g.crowd.specs.map((s) => s.outfit))].sort(); }
  dress(outfit) {
    const C = this.g.crowd, P = this.g.player; const pool = outfit ? C.specs.filter((s) => s.outfit === outfit) : C.specs; if (!pool.length) throw new Error('outfits: ' + this.outfits().join(', '));
    let n = 0; for (const p of C.peds) { if (Math.hypot(p.x - P.x, p.z - P.z) > 35 || p.state === 'down' || p.vehicle) continue;
      const sp = pool[Math.floor(Math.random() * pool.length)]; const ch = new Character(sp); ch.root.position.copy(p.ch.root.position); ch.root.rotation.copy(p.ch.root.rotation);
      const parent = p.ch.root.parent || this.g.scene; parent.add(ch.root); parent.remove(p.ch.root); p.ch.crowdPed = null; p.ch.dispose(); ch.crowdPed = p; p.ch = ch; p.sp = sp; n++; }
    this.say(`${n} pedestrian${n === 1 ? '' : 's'} re-dressed${outfit ? ' (' + outfit + ')' : ''}`);
  }
  say(msg) { this.print(msg, 'ok'); this.g.hud.notify('Debug', msg, 'info', 1.8); }
  // per-frame: keep cheats applied, drive the menu
  update() {
    const g = this.g, D = this.D;
    if (D.noWanted && g.police && g.police.level > 0) g.police.standDown('Debug: never wanted');
    if (D.god && g.health && g.health.hp < 100) g.health.hp = 100;
    if (this.menuOpen) this.menuKeys();
  }
  // ------------------------------------------------------------------ menu
  toggleMenu(v = !this.menuOpen) {
    if (v && !this.D.menuEnabled) return; this.menuOpen = v; this.menu.classList.toggle('hidden', !v); const P = this.g.player;
    if (v) { this.stack = [this.root()]; this.sel = 0; this.prevControl = P.control; P.control = false; Input.releaseLock(); this.renderMenu(); Audio.ui('click'); }
    else { P.control = this.prevControl ?? true; }
  }
  root() {
    const D = this.D, g = this.g, t = (b) => (b ? 'ON' : 'OFF');
    return { title: 'Debug menu', items: [
      { label: 'Time', sub: () => this.timeMenu() }, { label: 'Weather', sub: () => this.weatherMenu() },
      { label: 'Player', sub: () => ({ title: 'Player', items: [
        { label: 'God mode', val: () => t(D.god), act: () => { D.god = !D.god; } },
        { label: 'Infinite ammo', val: () => t(D.infAmmo), act: () => { D.infAmmo = !D.infAmmo; } },
        { label: 'Never wanted', val: () => t(D.noWanted), act: () => { D.noWanted = !D.noWanted; } },
        { label: 'Clear wanted level now', act: () => { if (g.police?.level > 0) g.police.standDown('Debug'); this.say('wanted level cleared'); } },
        { label: 'Heal', act: () => { g.health.hp = 100; this.say('healed'); } },
        { label: 'Player model', sub: () => ({ title: 'Player model', items: [...MODELS.map((m) => ({ label: HEROES[m].name || m[0].toUpperCase() + m.slice(1), act: () => this.model(m) })), { label: 'Random civilian', act: () => this.model('civilian') }, { label: 'Reset to protagonist', act: () => this.model('reset') }] }) },
      ] }) },
      { label: 'Weapons & money', sub: () => ({ title: 'Weapons & money', items: [
        { label: 'Give all weapons', act: () => this.give('all') }, ...WEAPONS.map((w) => ({ label: 'Give ' + w.name, act: () => this.give(w.id) })),
        { label: 'Money +Rs. 10,000', act: () => this.money(10000) }, { label: 'Money +Rs. 100,000', act: () => this.money(100000) }, { label: 'Money +Rs. 1,000,000', act: () => this.money(1000000) },
      ] }) },
      { label: 'Spawn', sub: () => ({ title: 'Spawn', items: [
        { label: 'Spawn 5 pedestrians', act: () => this.spawnPeds(5) }, { label: 'Spawn 15 pedestrians', act: () => this.spawnPeds(15) },
        ...VEH.map((v) => ({ label: 'Spawn ' + v, act: () => this.spawnCar(v) })),
        { label: `Real-model cars (${REAL_TYPES.length})`, sub: () => ({ title: 'Spawn real-model car', items: REAL_TYPES.filter((v) => VTYPES[v]).map((v) => ({ label: `${vName(v)} · ${VTYPES[v].cls}${realAsset(v) ? '' : ' · (model not loaded: procedural)'}`, act: () => this.spawnCar(v) })) }) },
        { label: `Buses & lorries (${HEAVY.length})`, sub: () => ({ title: 'Spawn bus / lorry', items: HEAVY.map((v) => ({ label: { bus: 'CTB bus', pbus: 'Private bus', lorry: 'Lorry', tow: 'Tow truck' }[v] || v, act: () => this.spawnCar(v) })) }) },
        { label: `Police & emergency (${EMERG.length})`, sub: () => ({ title: 'Spawn police / emergency', items: EMERG.map((v) => ({ label: { police: 'Police car', policejeep: 'Police jeep', policebike: 'Police motorcycle', ambulance: '1990 Suwa Seriya ambulance' }[v] || v, act: () => this.spawnCar(v) })) }) },
        { label: `SUVs (${SUV_IDS.length})`, sub: () => ({ title: 'Spawn SUV', items: SUV_IDS.map((v) => ({ label: `${displayName(v, VTYPES[v])} · ${VTYPES[v].cls}`, act: () => this.spawnCar(v) })) }) },
        { label: `Superbikes (${SUPERBIKE_IDS.length})`, sub: () => ({ title: 'Spawn superbike', items: SUPERBIKE_IDS.map((v) => ({ label: `${bikeName(v)} · ${BIKES[v].cc} cc`, act: () => this.spawnCar(v) })) }) },
        { label: `Motorcycles & scooters (${BIKE_IDS.length})`, sub: () => ({ title: 'Spawn motorcycle', items: BIKE_IDS.map((v) => ({ label: `${bikeName(v)} · ${BIKES[v].cc} cc · ${BIKES[v].cls}`, act: () => this.spawnCar(v) })) }) },
        { label: `Cars, vans & trucks (${OTHER_IDS.length})`, sub: () => ({ title: 'Spawn vehicle', items: OTHER_IDS.map((v) => ({ label: `${displayName(v, VTYPES[v])} · ${VTYPES[v].cls}${realTag(v)}`, act: () => this.spawnCar(v) })) }) },
      ] }) },
      { label: 'Vehicle', sub: () => ({ title: 'Vehicle (yours, or the nearest within 10 m)', items: [
        { label: 'Info', act: () => this.vehInfo() },
        { label: 'Repair (dents, glass, tyres, engine)', act: () => this.vehRepair() },
        { label: 'Damage', sub: () => ({ title: 'Vehicle damage (GTA-style)', items: [
          { label: 'Damage status', act: () => this.vehDamage('dmg') },
          { label: 'Shoot it: 6 rifle rounds', act: () => this.vehDamage('shoot', ['6']) },
          { label: 'Burst a tyre', act: () => this.vehDamage('tyre') },
          { label: 'Smash all glass', act: () => this.vehDamage('glass') },
          { label: 'Hard crash (dent the front)', act: () => this.vehDamage('dent') },
          { label: 'Set the engine on fire', act: () => this.vehDamage('fire') },
          { label: 'Explode now', act: () => this.vehDamage('explode') },
        ] }) },
        { label: 'Set upright / stop', act: () => { const v = this.vehTarget(); v.speed = 0; v.lat = 0; if (v.sus) Object.assign(v.sus, { r: 0, rv: 0, h: 0, hv: 0 }); v.place(v.x, v.z, v.yaw); this.say(`${vName(v.type)} set upright`); } },
        { label: 'Open all doors', act: () => this.vehDoors(true) }, { label: 'Close all doors', act: () => this.vehDoors(false) },
      ] }) },
      { label: 'World & systems', sub: () => ({ title: 'World & systems', items: [
        { label: 'Drunk level', sub: () => ({ title: 'Drunk level', items: [[0, 'Sober'], [0.4, 'Tipsy'], [0.8, 'Drunk'], [1.1, 'Wasted']].map(([v, n]) => ({ label: `${n} (${v})`, act: () => { this.exec('drunk ' + v); this.say(`drunk level: ${n}`); } })) }) },
        { label: 'Hero rooms', sub: () => ({ title: 'Hero rooms', items: ['dineth', 'shashika', 'david'].map((h) => ({ label: `${h[0].toUpperCase() + h.slice(1)}'s room`, act: () => { this.toggleMenu(false); this.room(h); } })) }) },
        { label: 'NPC minds (personality / memory)', val: () => (g.crowd && g.crowd.minds ? (g.crowd.minds.enabled ? 'ON' : 'OFF') : '—'), act: () => { const M = g.crowd && g.crowd.minds; if (!M) throw new Error('no crowd minds'); M.enabled = !M.enabled; this.say(`NPC minds ${M.enabled ? 'on' : 'off'}`); } },
        { label: 'Inspect nearest person (console)', act: () => { this.toggleMenu(false); this.toggle(true); this.exec('mind'); } },
        { label: 'Benchmark 20 s (result in console)', act: () => { this.toggleMenu(false); this.bench(20); } },
        { label: 'Show FPS counter', val: () => t(Settings.get('showFps')), act: () => Settings.set('showFps', !Settings.get('showFps')) },
        { label: 'Editors', sub: () => ({ title: 'Editors (loaded on demand)', items: [['animations', 'Animation editor'], ['map', 'Map editor (+ upload models)'], ['npc', 'NPC editor'], ...(TEXTURE_STUDIO ? [['textures', 'Texture Studio'], ['models-weapons', 'Model tools — weapons'], ['model-player', 'Model tools — player (3 heroes)'], ['model-vehicles', 'Model tools — vehicles & trains'], ['model-npc', 'Model tools — NPCs'], ['bank-edit', 'Bank editor (inside the bank)'], ['paint', 'Environment editor (import, place, paint vegetation)']] : [])].map(([k, n]) => ({ label: n, act: () => { this.toggleMenu(false); this.exec(k); } })) }) },
      ] }) },
      { label: 'Boats & marina', sub: () => this.boatsMenu() },
      { label: 'Pedestrian clothing', sub: () => ({ title: 'Re-dress pedestrians (35 m)', items: [{ label: 'Random outfits', act: () => this.dress() }, ...this.outfits().map((o) => ({ label: o, act: () => this.dress(o) }))] }) },
      { label: 'Teleport', sub: () => ({ title: 'Teleport', items: [{ label: 'To map waypoint', act: () => this.tpWaypoint() }, ...Object.values(PLACES).map((p) => ({ label: p.name, act: () => this.teleport(p.x, p.z, p.name) }))] }) },
      { label: 'Disable debug menu', act: () => { D.menuEnabled = false; this.toggleMenu(false); this.print('debug menu disabled', 'ok'); } },
    ] };
  }
  timeMenu() { const D = this.D; return { title: 'Time', items: [[0, 'Midnight'], [6, 'Dawn'], [9, 'Morning'], [12, 'Noon'], [15.5, 'Afternoon'], [18.4, 'Sunset'], [21, 'Night']].map(([h, n]) => ({ label: `${fmtH(h)} · ${n}`, act: () => this.setTime(h) })).concat([{ label: 'Freeze clock', val: () => (D.freezeTime ? 'ON' : 'OFF'), act: () => { D.freezeTime = !D.freezeTime; } }]) }; }
  weatherMenu() { return { title: 'Weather', items: Object.keys(WEATHER).map((w) => ({ label: w[0].toUpperCase() + w.slice(1), val: () => (this.g.atmos.target === w ? '●' : ''), act: () => this.setWeather(w) })) }; }
  menuKeys() {
    if (this.skipNav) { this.skipNav = false; return; }
    if (!this.stack.length) { this.stack = [this.root()]; this.sel = 0; this.renderMenu(); } /* never navigate an empty stack (something closed / reopened the menu underneath us) */
    const k = (c) => Input.keyPressed(c); const m = this.stack[this.stack.length - 1]; const n = m.items.length;
    if (k('Numpad2') || k('ArrowDown')) { this.sel = (this.sel + 1) % n; this.renderMenu(); }
    if (k('Numpad8') || k('ArrowUp')) { this.sel = (this.sel + n - 1) % n; this.renderMenu(); }
    if (k('Enter') || k('NumpadEnter') || k('Numpad5') || k('Numpad6') || k('ArrowRight')) this.activate();
    if (k('Backspace') || k('Numpad4') || k('ArrowLeft') || k('Escape')) { if (this.stack.length > 1) { const prev = this.stack.pop(); this.sel = prev.from || 0; this.renderMenu(); Audio.ui('click'); } else this.toggleMenu(false); }
    if (k('Numpad0') || k('Delete')) this.toggleMenu(false);
  }
  activate() {
    const m = this.stack[this.stack.length - 1]; const it = m.items[this.sel]; if (!it) return; Audio.ui('click');
    try { if (it.sub) { const s = it.sub(); s.from = this.sel; this.stack.push(s); this.sel = 0; } else if (it.act) it.act(); } catch (e) { this.g.hud.notify('Debug', e.message || String(e), 'warn', 2.5); }
    this.renderMenu();
  }
  renderMenu() {
    if (!this.stack.length) this.stack = [this.root()];
    const m = this.stack[this.stack.length - 1]; const path = this.stack.map((s) => s.title).join(' › ');
    this.menu.innerHTML = `<div class="dbg-mh"><b>DEBUG</b><span>${esc(path)}</span></div><div class="dbg-items">${m.items.map((it, i) => `<div class="dbg-it${i === this.sel ? ' on' : ''}" data-i="${i}"><span>${esc(it.label)}</span><em>${it.sub ? '›' : it.val ? esc(it.val()) : ''}</em></div>`).join('')}</div><div class="dbg-mf">Num 8/2 move · Num 5 select · Num 4 back · Num 0 close</div>`;
    const on = this.menu.querySelector('.dbg-it.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
}
