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
import { openEditor } from '../debug/boot.js'; // tiny: the editors themselves load on demand
import { Audio } from '../audio/Audio.js';
import { WEAPONS } from '../combat/WeaponDefs.js';
import { WEATHER } from '../gfx/Atmosphere.js';
import { PLACES } from '../world/Layout.js';
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
      if (e.code === 'Backquote' && !this.open) { e.preventDefault(); this.toggle(true); }
      else if (e.code === 'Numpad2' && !this.open && this.g.debug.menuEnabled && !this.menuOpen) { this.toggleMenu(true); this.skipNav = true; }
    });
    this.print('COLOMBO developer console. Type help for commands.', 'sys');
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
  toggle(v = !this.open) {
    this.open = v; this.con.classList.toggle('hidden', !v); Input.typing = v; Input.down.clear();
    if (v) { Input.releaseLock(); setTimeout(() => this.input.focus(), 0); } else this.input.blur();
  }
  print(s, cls = '') { this.log.push([s, cls]); if (this.log.length > 120) this.log.shift(); this.logEl.innerHTML = this.log.map(([t, c]) => `<div class="${c}">${esc(t)}</div>`).join(''); this.logEl.scrollTop = 1e9; }
  exec(line) {
    const [cmd, ...a] = line.split(/\s+/); const c = cmd.toLowerCase(); const on = (v, cur) => (v === undefined ? !cur : /^(1|true|on|yes)$/i.test(v));
    try {
      switch (c) {
        case 'help': ['debug.menu true|false — enable the debug menu (open it with Numpad 2)', 'time <0-24> · freeze [on|off]', `weather <${Object.keys(WEATHER).join('|')}>`, 'money <amount>', 'god [on|off] · ammo [on|off] (infinite) · nowanted [on|off]', 'mind · mind stats · mind off|on — NPC personality / feelings / memories',
          `give <all|grenades|${WEAPONS.map((w) => w.id).join('|')}>`, 'tp <place> | tp <x> <z> | tp waypoint · places', 'drunk <0..1> · room <dineth|shashika|david>', 'vehicle info|repair|upright|open|close|dmg|shoot [n]|tyre|glass|dent|fire|explode — your vehicle, or the nearest within 10 m', 'bench [seconds] — frame-rate benchmark of real play (avg fps, 1 % / 0.1 % lows, worst frame); the console closes while it runs', `spawn ped [n] · spawn car [${VEH.join('|')}|<catalogue id>]`, 'cars — list the 40 catalogue vehicles (ids for spawn car)', `model <${MODELS.join('|')}|civilian|reset>`, 'dress [outfit] — re-dress pedestrians within 35 m · outfits', 'animations — animation editor (every animation in the game, keyframes, poses, speed …)', 'map — map editor (move / add / delete / repaint anything, save the map)', 'npc — NPC editor (remodel NPCs: every appearance parameter, proportions, paint on the model, fabric textures)', 'heal · clear · close'].forEach((s) => this.print('  ' + s)); break;
        case 'debug.menu': this.D.menuEnabled = on(a[0], this.D.menuEnabled); if (!this.D.menuEnabled) this.toggleMenu(false); this.print(`debug menu ${this.D.menuEnabled ? 'ENABLED — press Numpad 2 to open it' : 'disabled'}`, 'ok'); break;
        case 'time': this.setTime(+a[0]); break;
        case 'freeze': this.D.freezeTime = on(a[0], this.D.freezeTime); this.print(`clock ${this.D.freezeTime ? 'frozen' : 'running'}`, 'ok'); break;
        case 'weather': this.setWeather(a[0]); break;
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
        case 'clear': this.log = []; this.print(''); break;
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
  teleport(x, z, label) {
    const g = this.g, P = g.player; if (g.interiors.current) throw new Error('leave the interior first'); if (P.vehicle) throw new Error('leave the vehicle first');
    const [sx, sz] = g.story.safeSpot ? g.story.safeSpot(x, z) : [x, z]; P.teleport(sx, sz, P.yaw); if (g.world.trim) g.world.trim(sx, sz); this.say(`teleported to ${label}`);
  }
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
        { label: 'Editors', sub: () => ({ title: 'Editors (loaded on demand)', items: [['animations', 'Animation editor'], ['map', 'Map editor'], ['npc', 'NPC editor']].map(([k, n]) => ({ label: n, act: () => { this.toggleMenu(false); this.exec(k); } })) }) },
      ] }) },
      { label: 'Pedestrian clothing', sub: () => ({ title: 'Re-dress pedestrians (35 m)', items: [{ label: 'Random outfits', act: () => this.dress() }, ...this.outfits().map((o) => ({ label: o, act: () => this.dress(o) }))] }) },
      { label: 'Teleport', sub: () => ({ title: 'Teleport', items: [{ label: 'To map waypoint', act: () => this.tpWaypoint() }, ...Object.values(PLACES).map((p) => ({ label: p.name, act: () => this.teleport(p.x, p.z, p.name) }))] }) },
      { label: 'Disable debug menu', act: () => { D.menuEnabled = false; this.toggleMenu(false); this.print('debug menu disabled', 'ok'); } },
    ] };
  }
  timeMenu() { const D = this.D; return { title: 'Time', items: [[0, 'Midnight'], [6, 'Dawn'], [9, 'Morning'], [12, 'Noon'], [15.5, 'Afternoon'], [18.4, 'Sunset'], [21, 'Night']].map(([h, n]) => ({ label: `${fmtH(h)} · ${n}`, act: () => this.setTime(h) })).concat([{ label: 'Freeze clock', val: () => (D.freezeTime ? 'ON' : 'OFF'), act: () => { D.freezeTime = !D.freezeTime; } }]) }; }
  weatherMenu() { return { title: 'Weather', items: Object.keys(WEATHER).map((w) => ({ label: w[0].toUpperCase() + w.slice(1), val: () => (this.g.atmos.target === w ? '●' : ''), act: () => this.setWeather(w) })) }; }
  menuKeys() {
    if (this.skipNav) { this.skipNav = false; return; }
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
    const m = this.stack[this.stack.length - 1]; const path = this.stack.map((s) => s.title).join(' › ');
    this.menu.innerHTML = `<div class="dbg-mh"><b>DEBUG</b><span>${esc(path)}</span></div><div class="dbg-items">${m.items.map((it, i) => `<div class="dbg-it${i === this.sel ? ' on' : ''}" data-i="${i}"><span>${esc(it.label)}</span><em>${it.sub ? '›' : it.val ? esc(it.val()) : ''}</em></div>`).join('')}</div><div class="dbg-mf">Num 8/2 move · Num 5 select · Num 4 back · Num 0 close</div>`;
    const on = this.menu.querySelector('.dbg-it.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
}
