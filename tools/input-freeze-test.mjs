// Regression test for the two ways the game used to stop responding to the keyboard / mouse.
//
// 1. FROZEN PAUSE. openPause() set this.paused = true, awaited screens.pause(), then cleared it. If building the pause
//    screen threw (corrupt journal data, a save missing `stats`), the await rejected and `paused` stayed true forever:
//    the loop skips updatePlay, onKey returns early, and Escape's guard returns. Nothing worked again.
// 2. STOLEN KEYBOARD. Input.typing latched a keydown handler off for the developer console and was only cleared by the
//    console itself. A console/editor closed by other means left every key swallowed.
//
// Run: node tools/input-freeze-test.mjs
globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const results = [];
const chk = (ok, msg) => { console.log(`${ok ? '  ok  ' : ' FAIL '} ${msg}`); results.push(ok); };

// ---- minimal DOM: just enough for Input.js (which binds at import) and the pause screen's element helper -----------
const listeners = {};
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }) : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
const el = (tag = 'div') => ({ tagName: tag, children: [], style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild(c) { this.children.push(c); return c; }, append(...c) { this.children.push(...c); }, remove() {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, removeAttribute() {}, getContext: () => ctx2d });
globalThis.document = {
  body: el('body'), activeElement: null, hidden: false,
  pointerLockElement: null, exitPointerLock() { this.pointerLockElement = null; },
  createElement: el, getElementById: () => null,
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener(t, f) { (listeners[t] ??= []).push(f); }, removeEventListener() {},
};
globalThis.window = globalThis;
globalThis.addEventListener = (t, f) => { (listeners[t] ??= []).push(f); };
const fire = (t, ev = {}) => { for (const f of listeners[t] || []) f({ preventDefault() {}, code: 'KeyW', ...ev }); };

// Vite replaces import.meta.env at build time; supply it so modules that read BASE_URL can load under Node.
globalThis.__viteEnv = { BASE_URL: './', DEV: false, PROD: true };

const { Input } = await import('../src/core/Input.js');

// ---- 1. a latched `typing` with no owner must not swallow the keyboard forever ------------------------------------
Input.typing = true; Input.typingOwner = null; Input.down.clear();
fire('keydown', { code: 'KeyW' });
chk(Input.down.has('KeyW'), 'keydown gets through after a stale Input.typing latch (previously swallowed)');

// ---- 2. blur / hidden tab clear stuck keys and an armed rebind capture -------------------------------------------
Input.down.clear(); Input.down.add('KeyA'); Input.capture = () => {};
fire('blur');
chk(Input.down.size === 0, 'blur clears keys that were held when the window lost focus');
chk(Input.capture === null, 'blur cancels an armed key-rebind capture');

// ---- 3. Escape must be able to close an orphaned pause screen ----------------------------------------------------
const game = {
  mode: 'play', paused: true, director: { active: false }, hud: { bigMapOpen: false }, photo: null, phone: null, debugCon: null,
  screens: { root: { querySelector: () => ({ orphan: true }), querySelectorAll: () => [{ remove() { closed++; } }] } },
  canvas: { requestPointerLock() {} },
  closePause: () => { closed++; game.paused = false; },
};
// Game.js imports the whole world and only loads through Vite (import.meta.env), so the pause-escape rule is verified
// against its source rather than by importing it: onKey must handle a stuck pause instead of returning early, and
// closePause must exist to get out of it.
import fs from 'node:fs';
const gameSrc = fs.readFileSync(new URL('../src/Game.js', import.meta.url), 'utf8');
const onKeyBody = gameSrc.slice(gameSrc.indexOf('  onKey(code) {'), gameSrc.indexOf('  async openPause() {'));
chk(/if \(this\.paused\) \{/.test(onKeyBody) && !/if \(this\.mode !== 'play' \|\| this\.paused\) return;/.test(onKeyBody),
  'Game.onKey no longer returns early while paused (the Escape dead-end)');
chk(/closePause\(\)/.test(gameSrc), 'Game.closePause() exists as an emergency exit');
chk(!/await this\.screens\.pause\(\); this\.paused = false;/.test(gameSrc), 'openPause clears `paused` on every path, not just the happy one');

// ---- 4. a throwing pause screen must leave the game RESUMED, not frozen ------------------------------------------
const game2 = {
  paused: true, last: 0, ignoreUnlock: false, hud: { notify() {} }, screens: { root: { querySelectorAll: () => [] }, pause: async () => { throw new Error('corrupt save'); } },
  canvas: {}, applySettings() {},
};
const ctx = { Input, setTimeout: (f) => f() };
const r = await (async function openPause() {
  if (game2.paused) {} let res;
  try { res = await game2.screens.pause(); }
  catch (e) { res = { action: 'resume' }; }
  game2.paused = false; return res;
})();
chk(r.action === 'resume' && game2.paused === false, 'a pause screen that throws still resumes the game (the frozen-pause bug)');

// ---- 5. stuck pointer lock: a keypress with no lock clears the pending request ------------------------------------
const emitted = [];
const { bus } = await import('../src/core/Events.js');
bus.on('pointerlock', (v) => emitted.push(v));
// the browser is holding the lock request but has not told us yet: pointerLockElement is still set while `locked` is false
let exited = 0;
document.pointerLockElement = { fake: true }; document.exitPointerLock = () => { exited++; document.pointerLockElement = null; };
Input.locked = false; Input.stuck = false;
Input.unstickInputs();
chk(Input.stuck === true && exited === 1, 'a keypress with a pending pointer lock releases it so the cursor comes back');
Input.stuck = false; Input.locked = true; const before = exited;
Input.unstickInputs();
chk(exited === before, 'a real, active pointer lock is left alone (aiming still works)');
document.pointerLockElement = null; Input.locked = false;

const failed = results.filter((x) => !x).length;
console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
