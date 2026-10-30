// Studio intro + genuine loading screen, montage captions, title card, main menu, pause menu, settings, save/load, credits.
import { Settings, QUALITY_PRESETS, DEFAULT_BINDINGS } from '../core/Settings.js';
import { SaveSystem, SLOTS } from '../core/SaveSystem.js';
import { Input, keyLabel } from '../core/Input.js';
import { Audio } from '../audio/Audio.js';
import { MISSIONS } from '../story/Story.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const LOGO = `${import.meta.env.BASE_URL}assets/brand/sds-logo.jpg`;

export class Screens {
  constructor(root, game) { this.root = root; this.g = game; this.stack = []; }
  // ---------------------------------------------------------------- studio intro + loading
  async studioIntro(loadFn) {
    // 1) the ENTER GAME gate in index.html (static, on screen before this bundle loaded) — its click is the audio gesture
    const gate = document.getElementById('gate');
    if (gate) { if (!window.__sdsEntered) await new Promise((r) => addEventListener('sds-enter', r, { once: true })); }
    else { const b = el('button', 'click-start', this.root, 'Enter game'); await new Promise((r) => { b.onclick = r; }); b.remove(); }
    Audio.init();
    // 2) Shaun David Studios: everything below animates with transform / opacity only, so it stays smooth on the
    // compositor even while the world build blocks the main thread
    const s = el('div', 'screen studio2', this.root);
    s.innerHTML = `<div class="s2-bars"><i></i><i></i></div>
      <div class="s2-rays"></div><div class="s2-core"></div><div class="s2-seam"></div><div class="s2-shock"></div>
      <div class="s2-embers">${Array.from({ length: 46 }, (_, i) => `<i style="left:${(Math.random() * 100).toFixed(1)}%;--d:${(5 + Math.random() * 7).toFixed(2)}s;--dl:-${(Math.random() * 12).toFixed(2)}s;--x:${((Math.random() - 0.5) * 18).toFixed(1)}vw;--s:${(0.5 + Math.random() * 1.4).toFixed(2)}"></i>`).join('')}</div>
      <div class="s2-emblem"><div class="s2-glow"></div><img class="s2-logo" alt="Shaun David Studios logo" draggable="false"></div>
      <div class="s2-name"><span>SHAUN DAVID STUDIOS</span></div><div class="s2-pres">P R E S E N T S</div>
      <div class="s2-load"><div class="s2-row"><span class="s2-label">Initialising</span><span class="s2-pct">00</span></div><div class="s2-track"><i></i><b></b></div><div class="s2-tip"></div></div>
      <div class="s2-grain"></div><div class="s2-vig"></div><div class="s2-flash"></div>`;
    s.querySelector('.s2-logo').src = LOGO;
    if (gate) { gate.classList.add('gone'); setTimeout(() => gate.remove(), 900); }
    await wait(350); s.classList.add('ignite'); Audio.boom(); await wait(900);
    s.classList.add('reveal'); Audio.riser(2.6); await wait(900);
    // 3) genuine loading while the emblem burns
    const fill = s.querySelector('.s2-track i'), head = s.querySelector('.s2-track b'), lab = s.querySelector('.s2-label'), pct = s.querySelector('.s2-pct'), tip = s.querySelector('.s2-tip');
    const tips = ['Left-hand traffic — keep left on Colombo roads', 'Three operatives, one city: switch with Z (hold for the squad card)', 'Tuk-tuks fit through gaps that cars cannot', 'Night falls fast in the tropics — around 6:30 pm', 'The monsoon makes roads slick: brake early'];
    let ti = 0; tip.textContent = tips[0]; const tipT = setInterval(() => { ti = (ti + 1) % tips.length; tip.classList.remove('on'); void tip.offsetWidth; tip.textContent = tips[ti]; tip.classList.add('on'); }, 3800); tip.classList.add('on');
    s.classList.add('loading');
    await loadFn((p, label) => { const k = Math.max(0, Math.min(1, p)); fill.style.transform = `scaleX(${k})`; head.style.transform = `translateX(${(k * 100).toFixed(2)}%)`; pct.textContent = String(Math.round(k * 100)).padStart(2, '0'); if (label) lab.textContent = label; });
    clearInterval(tipT); lab.textContent = 'Ready'; pct.textContent = '100'; fill.style.transform = 'scaleX(1)';
    s.classList.add('named'); await wait(2400);
    // 4) out: flash and push into the emblem
    s.classList.add('out'); Audio.boom(); await wait(1300); s.remove();
  }
  caption(lines, dur = 3) { const c = el('div', 'montage-cap', this.root, lines); requestAnimationFrame(() => c.classList.add('show')); setTimeout(() => c.classList.remove('show'), dur * 1000 - 700); setTimeout(() => c.remove(), dur * 1000); }
  async gameTitle(dur = 4.5) {
    const t = el('div', 'game-title', this.root, '<div class="gt-main">COLOMBO</div><div class="gt-sub">SHADOWS OF THE ISLAND</div><div class="gt-by">A SHAUN DAVID STUDIOS PRODUCTION</div>');
    requestAnimationFrame(() => t.classList.add('show')); await wait(dur * 1000); t.classList.remove('show'); await wait(1000); t.remove();
  }
  // ---------------------------------------------------------------- main menu
  mainMenu() {
    return new Promise((resolve) => {
      const m = el('div', 'screen menu', this.root);
      el('div', 'menu-title', m, '<div class="gt-main small">COLOMBO</div><div class="gt-sub small">SHADOWS OF THE ISLAND</div>');
      const list = el('div', 'menu-list', m); const latest = SaveSystem.latest();
      const items = [['new', 'New Game'], ['continue', 'Continue', !latest], ['load', 'Load Game', !latest], ['settings', 'Settings'], ['credits', 'Credits'], ['quit', 'Quit']];
      for (const [id, label, dis] of items) { const b = el('button', 'menu-btn', list, label); if (dis) b.disabled = true; b.onmouseenter = () => Audio.ui('hover'); b.onclick = async () => { Audio.ui('click');
        if (id === 'new') { m.remove(); resolve({ action: 'new' }); }
        else if (id === 'continue') { m.remove(); resolve({ action: 'load', slot: latest.slot }); }
        else if (id === 'load') { const slot = await this.saveLoad('load'); if (slot) { m.remove(); resolve({ action: 'load', slot }); } }
        else if (id === 'settings') await this.settings();
        else if (id === 'credits') await this.credits();
        else if (id === 'quit') this.quit();
      }; }
      el('div', 'menu-foot', m, `<img src="${LOGO}" alt="Shaun David Studios"><span>A Shaun David Studios production · v1.0</span>`);
      if (latest) el('div', 'menu-last', m, `Last save: ${new Date(latest.data.savedAt).toLocaleString()} · ${latest.data.missionTitle || ''}`);
    });
  }
  quit() { const q = el('div', 'modal', this.root, `<div class="panel"><h2>Quit</h2><p>Browsers don't allow a page to close itself. Your progress is saved — you can close this tab safely.</p><button class="menu-btn">OK</button></div>`); q.querySelector('button').onclick = () => q.remove(); try { window.close(); } catch (e) {} }
  // ---------------------------------------------------------------- pause
  pause() {
    return new Promise((resolve) => {
      const p = el('div', 'screen pause', this.root); const st = this.g.story.state;
      const mission = MISSIONS.find((m) => m.id === st.mission.id);
      el('div', 'pause-head', p, `<h1>Paused</h1><div class="pause-sub">${mission ? `Current: <b>${mission.title}</b> — ${mission.desc}` : 'Story complete — Colombo is yours to explore.'}</div>`);
      const cols = el('div', 'pause-cols', p); const list = el('div', 'menu-list', cols); const info = el('div', 'pause-info', cols);
      info.innerHTML = this.journalHTML();
      const done = (r) => { p.remove(); resolve(r); };
      for (const [id, label] of [['resume', 'Resume'], ['map', 'Map'], ['save', 'Save Game'], ['load', 'Load Game'], ['settings', 'Settings'], ['controls', 'Controls'], ['menu', 'Quit to Main Menu']]) {
        const b = el('button', 'menu-btn', list, label); b.onmouseenter = () => Audio.ui('hover');
        b.onclick = async () => { Audio.ui('click');
          if (id === 'resume') done({ action: 'resume' }); else if (id === 'map') done({ action: 'map' });
          else if (id === 'save') { await this.saveLoad('save'); }
          else if (id === 'load') { const slot = await this.saveLoad('load'); if (slot) done({ action: 'load', slot }); }
          else if (id === 'settings') await this.settings(); else if (id === 'controls') await this.controls();
          else if (id === 'menu') done({ action: 'menu' });
        };
      }
      const esc = (code) => { if (code === 'Escape' && p.isConnected && !this.root.querySelector('.modal')) { off(); done({ action: 'resume' }); } }; const off = this.g.bus.on('key', esc);
    });
  }
  journalHTML() {
    const s = this.g.story.state; const rel = Object.entries(s.rel).map(([k, v]) => `<div class="rel"><span>${k[0].toUpperCase() + k.slice(1)}</span><i style="--v:${v}%"></i></div>`).join('');
    const done = MISSIONS.map((m) => `<li class="${s.done.includes(m.id) ? 'done' : s.mission.id === m.id ? 'cur' : ''}">${m.title}</li>`).join('');
    return `<h3>Story</h3><ol class="mlist">${done}</ol><h3>Relationships</h3>${rel}<h3>Progress</h3>
      <div class="stat">Money <b>Rs. ${s.money.toLocaleString('en-LK')}</b></div><div class="stat">Old Ceylon Stamps <b>${s.stamps.length}/20</b></div><div class="stat">Photo spots <b>${s.photos.length}/8</b></div>
      <div class="stat">Taxi fares <b>${s.stats.taxi}</b></div><div class="stat">Deliveries <b>${s.stats.deliveries}</b></div><div class="stat">Time trials <b>${Object.keys(s.trials).length}/3</b></div>`;
  }
  // ---------------------------------------------------------------- save / load
  saveLoad(mode) {
    return new Promise((resolve) => {
      const m = el('div', 'modal', this.root); const panel = el('div', 'panel wide', m, `<h2>${mode === 'save' ? 'Save Game' : 'Load Game'}</h2>`); const list = el('div', 'slots', panel);
      const render = () => { list.innerHTML = ''; for (const slot of SLOTS) { if (mode === 'save' && slot === 'auto') continue; const d = SaveSystem.read(slot); const b = el('button', 'slot', list, `<b>${slot === 'auto' ? 'Autosave' : 'Slot ' + slot}</b><span>${d ? `${d.missionTitle || 'Free roam'} · ${d.timeString || ''} · Rs. ${(d.story?.money ?? 0).toLocaleString('en-LK')}<br><small>${new Date(d.savedAt).toLocaleString()}</small>` : '<small>Empty</small>'}</span>`); if (mode === 'load' && !d) b.disabled = true;
        b.onclick = () => { Audio.ui('click'); if (mode === 'save') { this.g.saveTo(slot); render(); this.g.hud.notify('Game saved', slot === 'auto' ? '' : 'Slot ' + slot, 'success', 2); } else { m.remove(); resolve(slot); } }; } };
      render(); const c = el('button', 'menu-btn', panel, 'Back'); c.onclick = () => { m.remove(); resolve(null); };
    });
  }
  // ---------------------------------------------------------------- settings
  settings() {
    return new Promise((resolve) => {
      const m = el('div', 'modal', this.root); const panel = el('div', 'panel wide settings', m, '<h2>Settings</h2>'); const tabs = el('div', 'tabs', panel); const body = el('div', 'tab-body', panel);
      const S = Settings; const row = (label, input) => { const r = el('label', 'set-row', body, `<span>${label}</span>`); r.appendChild(input); return r; };
      const slider = (k, min, max, step) => { const i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = S.get(k); const v = el('em', '', null, (+S.get(k)).toFixed(2)); i.oninput = () => { S.set(k, +i.value); v.textContent = (+i.value).toFixed(2); }; const w = el('div', 'sl'); w.append(i, v); return w; };
      const check = (k) => { const i = el('input'); i.type = 'checkbox'; i.checked = !!S.get(k); i.onchange = () => S.set(k, i.checked); return i; };
      const select = (k, opts, onChange) => { const s = el('select'); for (const [v, l] of opts) { const o = el('option', '', s, l); o.value = v; if (String(S.get(k)) === String(v)) o.selected = true; } s.onchange = () => { S.set(k, isNaN(+s.value) ? s.value : +s.value); onChange && onChange(); }; return s; };
      const pages = {
        Graphics: () => {
          row('Quality preset', select('quality', Object.keys(QUALITY_PRESETS).map((q) => [q, q[0].toUpperCase() + q.slice(1)])));
          row('Resolution scale', select('resolutionScale', [[0.5, '50%'], [0.67, '67%'], [0.75, '75%'], [0.85, '85%'], [1, '100%'], [1.25, '125%'], [1.5, '150%']]));
          const fs = el('button', 'menu-btn small', null, document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'); fs.onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); setTimeout(() => (fs.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'), 300); }; row('Display mode', fs);
          row('Field of view', slider('fov', 50, 90, 1)); row('Crowd density', slider('crowdDensity', 0.2, 1.5, 0.05)); row('Traffic density', slider('trafficDensity', 0.2, 1.5, 0.05)); row('Show FPS counter', check('showFps'));
          el('p', 'hint', body, 'Shadows, bloom, ambient occlusion and draw distance follow the quality preset. Low is recommended for integrated graphics.');
        },
        Camera: () => { row('Mouse sensitivity', slider('mouseSens', 0.2, 3, 0.05)); row('Invert Y axis', check('invertY')); row('Camera distance', slider('cameraDistance', 0.7, 1.6, 0.05)); row('Camera shake', check('cameraShake')); row('Squad switch transition', select('switchStyle', [['auto', 'Auto (transit, cut when far)'], ['transit', 'Always camera transit'], ['cut', 'Always jump-cut']])); row('Day length (real seconds per game minute)', slider('timeScale', 0.5, 6, 0.25)); },
        Audio: () => { row('Master', slider('master', 0, 1, 0.05)); row('Music', slider('music', 0, 1, 0.05)); row('Effects', slider('sfx', 0, 1, 0.05)); row('Ambience', slider('ambience', 0, 1, 0.05)); row('Dialogue', slider('dialogue', 0, 1, 0.05)); row('Subtitles', check('subtitles')); row('Subtitle size', slider('subtitleSize', 0.8, 1.6, 0.05)); },
        Controls: () => {
          const names = { forward: 'Forward / accelerate', back: 'Back / brake', left: 'Left / steer left', right: 'Right / steer right', sprint: 'Sprint', jump: 'Jump · climb · handbrake', crouch: 'Crouch', enter: 'Enter / exit vehicle', interact: 'Interact / talk', insult: 'Insult', shove: 'Shove', more: 'Wave / activities', horn: 'Horn', lights: 'Headlights', camera: 'Camera view', radio: 'Radio', phone: 'Phone camera', map: 'Map', journal: 'Journal', reload: 'Reload (on foot)', holster: 'Holster / draw weapon', weaponWheel: 'Weapon wheel (hold)' };
          for (const [a, label] of Object.entries(names)) { const b = el('button', 'bind', null, keyLabel(S.get('bindings')[a])); b.onclick = () => { b.textContent = 'Press a key…'; Input.captureNextKey((code) => { if (code !== 'Escape') { const bd = { ...S.get('bindings'), [a]: code }; S.set('bindings', bd); } b.textContent = keyLabel(S.get('bindings')[a]); }); }; row(label, b); }
          const r = el('button', 'menu-btn small', body, 'Reset key bindings'); r.onclick = () => { S.set('bindings', { ...DEFAULT_BINDINGS }); show('Controls'); };
          el('p', 'hint', body, 'Gamepads (standard mapping) are supported: left stick move/steer, right stick camera, RT/LT throttle/brake, A jump, Y enter/exit, X interact, B insult, RB shove, Start pause.');
        },
      };
      const show = (name) => { body.innerHTML = ''; tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === name)); pages[name](); };
      for (const n of Object.keys(pages)) { const b = el('button', '', tabs, n); b.onclick = () => show(n); }
      show('Graphics'); const foot = el('div', 'panel-foot', panel); const back = el('button', 'menu-btn', foot, 'Back'); back.onclick = () => { m.remove(); resolve(); }; const rs = el('button', 'menu-btn', foot, 'Reset all'); rs.onclick = () => { Settings.reset(); show('Graphics'); };
    });
  }
  controls() { return new Promise((resolve) => { const k = (a) => `<kbd>${keyLabel(Settings.get('bindings')[a])}</kbd>`; const m = el('div', 'modal', this.root, `<div class="panel wide"><h2>Controls</h2><div class="ctrl-grid">
    <div><h3>On foot</h3><p>${k('forward')}${k('left')}${k('back')}${k('right')} Move · Mouse look</p><p>${k('sprint')} Sprint · ${k('crouch')} Crouch</p><p>${k('jump')} Jump / climb ledges</p><p>${k('interact')} Talk / interact · ${k('more')} Wave</p><p>${k('insult')} Insult · ${k('shove')} Shove</p><p>${k('phone')} Phone camera (click to shoot)</p></div>
    <div><h3>Vehicles</h3><p>${k('enter')} Enter / exit (or take over a taxi)</p><p>${k('forward')} Accelerate · ${k('back')} Brake / reverse</p><p>${k('left')}${k('right')} Steer · ${k('jump')} Handbrake</p><p>${k('horn')} Horn · ${k('lights')} Lights · ${k('radio')} Radio</p><p>${k('more')} Tuk-tuk taxi jobs / time trials</p></div>
    <div><h3>Weapons</h3><p>Hold ${k('weaponWheel')} Weapon wheel · <kbd>1</kbd>–<kbd>9</kbd> select · Mouse wheel cycle</p><p><kbd>RMB</kbd> Aim (snipers: scope, ${k('sprint')} steadies) · <kbd>LMB</kbd> Fire</p><p>${k('reload')} Reload · ${k('holster')} Holster / draw</p><p>Pad: LT aim · RT fire · D-pad ←/→ cycle · ↓ reload · ↑ holster</p></div>
    <div><h3>General</h3><p>${k('camera')} Change camera</p><p>${k('map')} Map · ${k('journal')} Journal</p><p><kbd>Esc</kbd> Pause menu</p><p>Cinematics: <kbd>Enter</kbd> skip</p></div></div><button class="menu-btn">Back</button></div>`); m.querySelector('button').onclick = () => { m.remove(); resolve(); }; }); }
  credits() { return new Promise((resolve) => { const m = el('div', 'modal credits', this.root, `<div class="panel"><img class="cred-logo" src="${LOGO}" alt="Shaun David Studios"><h2>COLOMBO: Shadows of the Island</h2><p>A Shaun David Studios production</p>
    <h3>Created with</h3><p>Three.js (MIT) · Vite (MIT) · Noto Sans Sinhala &amp; Noto Sans Tamil, Cormorant Garamond, Barlow Condensed, Manrope (SIL Open Font License via Fontsource)</p>
    <h3>World, characters, vehicles, textures, music &amp; sound</h3><p>Generated procedurally in code for this project. The bakery tuk-tuk chime quotes Beethoven's <i>Für Elise</i> (public domain).</p>
    <h3>Setting</h3><p>Colombo's geography is compressed and simplified. All characters, companies and events are fictional.</p><button class="menu-btn">Back</button></div>`); m.querySelector('button').onclick = () => { m.remove(); resolve(); }; }); }
  ending(kind, state) {
    return new Promise((resolve) => {
      const text = { press: ['The Sunday Edition', 'Anjali\'s story ran on every front page. Harbour Crest\'s accounts were frozen within a week, and Dilan\'s tower became a court case instead of a skyline.'], police: ['The Long Way', 'The evidence went to the Kollupitiya police. It was slow, and some days it felt hopeless — but the forged deeds were annulled, one hearing at a time.'], deal: ['A Quiet Bargain', 'The deeds came back to Main Street. Nobody went to prison, and nobody wrote about it. Ruwan never quite looked at you the same way.'] }[kind] || ['', ''];
      const r = state.rel; const lines = [r.fathima > 55 ? 'Mrs. Fathima reopened her shop with a new sign — and a framed copy of her father\'s first receipt.' : 'Mrs. Fathima kept the shop, but kept her distance from you.', r.bandara > 55 ? 'Uncle Bandara paid for his grandson\'s school fees himself, with the spice-store profits.' : 'Uncle Bandara still won\'t talk about the night he signed.', r.ruwan > 55 ? 'Ruwan still calls you "the worst timing in Colombo." You still meet at Galle Face on Thursdays.' : 'Ruwan moved to Kandy. He sends a message on your birthday.'];
      const m = el('div', 'screen ending', this.root, `<div class="end-in"><div class="mb-top">EPILOGUE</div><h1>${text[0]}</h1><p>${text[1]}</p>${lines.map((l) => `<p class="small">${l}</p>`).join('')}<p class="small">Colombo is still yours to explore — taxi fares, time trials, stamps and photo spots are waiting.</p><button class="menu-btn">Continue exploring</button></div>`);
      m.querySelector('button').onclick = () => { m.remove(); resolve(); };
    });
  }
}
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
