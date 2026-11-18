// Developer lock (68th). The console command `DoneShaun$123$` removes the developer console (and with it the debug menu, the
// editors and every model / texture tool) and the pause menu's Texture Studio: nothing of them is shown or reachable any more.
// The only way back is the secret code typed during play, like a San Andreas cheat (no console, just type it):
//   SHAUNDEVACTIVATION123$123$
// Where the state lives:
//   • development (npm run dev): dev-lock.json in the project folder (written by tools/vite/modelPack.mjs). Builds made while it
//     says locked ship locked: __COLOMBO_DEVLOCK__ is true in them.
//   • a built game / the .exe: the build's own state, unless the code (or the command) was used on this install — that choice is
//     kept in localStorage for this install only.
// only a hash of the code is in the game (a built .exe does not contain the code as text)
const CODE_LEN = 26, CODE_HASH = 7225297535166785;
export const codeHash = (str, seed = 68) => { let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed; for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909); return 4294967296 * (2097151 & h2) + (h1 >>> 0); };
const LS = 'colombo.devlock';
const DEV = !!(import.meta.env && import.meta.env.DEV);
/* global __COLOMBO_DEVLOCK__ */
const BUILT = typeof __COLOMBO_DEVLOCK__ !== 'undefined' ? !!__COLOMBO_DEVLOCK__ : false;
const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };
function initial() { if (DEV) return BUILT; const v = ls()?.getItem(LS); return v === 'locked' ? true : v === 'unlocked' ? false : BUILT; }

export const DevLock = {
  locked: initial(), listeners: new Set(), buf: '',
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const f of this.listeners) { try { f(this.locked); } catch (e) { console.warn('[devlock]', e); } } },
  async set(locked, why = '') {
    this.locked = !!locked;
    if (DEV) { try { await fetch('/__colombo/devlock', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locked: this.locked }) }); } catch (e) { console.warn('[devlock] dev-lock.json not written', e); } }
    else ls()?.setItem(LS, this.locked ? 'locked' : 'unlocked');
    if (why) console.info('[devlock]', this.locked ? 'locked' : 'unlocked', '—', why);
    this.emit(); return this.locked;
  },
  lock() { return this.set(true, 'DoneShaun$123$'); },
  // dev server: the folder's dev-lock.json is the truth (it may have been changed since the page was built)
  async sync() { if (!DEV) return this.locked; try { const r = await fetch('/__colombo/devlock', { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); if (!!j.locked !== this.locked) { this.locked = !!j.locked; this.emit(); } } } catch { /* offline */ } return this.locked; },
  // the secret code: typed anywhere in the game (not into a text field), letters in any case
  feed(key) {
    if (!key || key.length !== 1) return false; this.buf = (this.buf + key.toUpperCase()).slice(-CODE_LEN);
    if (this.buf.length === CODE_LEN && codeHash(this.buf) === CODE_HASH) { this.buf = ''; if (this.locked) { this.set(false, 'secret code'); return true; } }
    return false;
  },
  install(onUnlock) {
    if (this._inst || typeof addEventListener !== 'function') return; this._inst = true;
    addEventListener('keydown', (e) => { const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return; if (this.feed(e.key) && onUnlock) onUnlock(); }, true);
    this.sync();
  },
};
export const isDevLocked = () => DevLock.locked;
