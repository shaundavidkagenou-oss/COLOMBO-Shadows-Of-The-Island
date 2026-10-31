// Developer console + debug menu.
//   `  (Backquote)        open / close the console (typing never reaches the game while it is open)
//   debug.menu true       enable the debug menu; Numpad 2 then opens / closes it (debug.menu false disables it again)
// The menu (keyboard: ↑/↓ or Numpad 8/2 move · Enter / Numpad 5 select · Backspace / Numpad 4 back; mouse works too)
// holds the cheats: time, weather, spawning pedestrians and vehicles, re-dressing nearby pedestrians, player model,
// infinite ammo, never wanted, teleport, god mode, money and weapons. Every cheat is also a console command (type `help`).
// Pedestrians spawned or re-dressed here come from the crowd's own adult spec pool — no new spawn paths.
import * as THREE from 'three';
import { Input } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { WEAPONS } from '../combat/WeaponDefs.js';
import { WEATHER } from '../gfx/Atmosphere.js';
import { PLACES } from '../world/Layout.js';
import { HEROES, Character } from '../actors/Character.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { VTYPES } from '../vehicles/VehicleModels.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const VEH = ['tuktuk', 'car', 'sedan', 'taxi', 'van', 'suv', 'bike', 'bus', 'lorry'].filter((t) => VTYPES[t]);
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
      if (e.code === 'Backquote' && !this.open) { e.preventDefault(); this.toggle(true); }
      else if (e.code === 'Numpad2' && !this.open && this.g.debug.menuEnabled && !this.menuOpen) { this.toggleMenu(true); this.skipNav = true; }
    });
    this.print('COLOMBO developer console. Type help for commands.', 'sys');
  }
  get D() { return this.g.debug; }
  // ------------------------------------------------------------------ console
  toggle(v = !this.open) {
    this.open = v; this.con.classList.toggle('hidden', !v); Input.typing = v; Input.down.clear();
    if (v) { Input.releaseLock(); setTimeout(() => this.input.focus(), 0); } else this.input.blur();
  }
  print(s, cls = '') { this.log.push([s, cls]); if (this.log.length > 120) this.log.shift(); this.logEl.innerHTML = this.log.map(([t, c]) => `<div class="${c}">${esc(t)}</div>`).join(''); this.logEl.scrollTop = 1e9; }
  exec(line) {
    const [cmd, ...a] = line.split(/\s+/); const c = cmd.toLowerCase(); const on = (v, cur) => (v === undefined ? !cur : /^(1|true|on|yes)$/i.test(v));
    try {
      switch (c) {
        case 'help': ['debug.menu true|false — enable the debug menu (open it with Numpad 2)', 'time <0-24> · freeze [on|off]', `weather <${Object.keys(WEATHER).join('|')}>`, 'money <amount>', 'god [on|off] · ammo [on|off] (infinite) · nowanted [on|off]',
          `give <all|${WEAPONS.map((w) => w.id).join('|')}>`, 'tp <place> | tp <x> <z> | tp waypoint · places', `spawn ped [n] · spawn car [${VEH.join('|')}]`, `model <${MODELS.join('|')}|civilian|reset>`, 'dress [outfit] — re-dress pedestrians within 35 m · outfits', 'heal · clear · close'].forEach((s) => this.print('  ' + s)); break;
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
        case 'spawn': if (a[0] === 'ped') this.spawnPeds(+a[1] || 5); else if (a[0] === 'car' || a[0] === 'vehicle') this.spawnCar(a[1] || 'car'); else throw new Error('spawn ped [n] | spawn car [type]'); break;
        case 'model': this.model(a[0] || 'reset'); break;
        case 'dress': this.dress(a[0]); break;
        case 'outfits': this.print('  ' + this.outfits().join(', ')); break;
        case 'heal': this.g.health.hp = 100; this.print('healed', 'ok'); break;
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
  spawnPeds(n) {
    const C = this.g.crowd, P = this.g.player; let k = 0; C.max = Math.max(C.max, C.peds.length + n);
    for (let i = 0; i < n * 3 && k < n; i++) if (C.spawn({ x: P.x, z: P.z }, null, true)) k++;
    this.say(`${k} pedestrian${k === 1 ? '' : 's'} spawned nearby`);
  }
  spawnCar(type) {
    if (!VTYPES[type]) throw new Error('vehicle: ' + VEH.join(', ')); const g = this.g, P = g.player; if (P.vehicle || g.interiors.current) throw new Error('on foot, outdoors only');
    let best = null; for (const d of [5, 6.5, 8]) for (let k = 0; k < 8 && !best; k++) { const a = P.yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5; const x = P.x + Math.sin(a) * d, z = P.z + Math.cos(a) * d; if (!g.collision.blocked(x, z, 1.6)) best = [x, z]; }
    if (!best) throw new Error('no free space here'); const v = new Vehicle(type, Math.floor(Math.random() * 1e6), g.scene); v.place(best[0], best[1], P.yaw + Math.PI / 2); g.traffic.release(v, false);
    this.say(`${type} spawned`);
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
