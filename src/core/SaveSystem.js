// Persistent save slots in localStorage: 3 manual slots + 1 autosave.
// Versioned: v1 (pre-2.0) saves are migrated on read to v2 (health, bank ledger, phone messages).
const PREFIX = 'colombo.save.';
export const SAVE_VERSION = 2;
export function migrate(d) {
  if (!d || typeof d !== 'object') return null;
  let v = d.version || 1; const out = structuredClone(d); out.story = out.story || {};
  if (v < 2) { if (typeof out.story.health !== 'number') out.story.health = 100; if (!Array.isArray(out.story.ledger)) out.story.ledger = []; if (!Array.isArray(out.story.msgs)) out.story.msgs = []; out.migratedFrom = v; v = 2; }
  if (v > SAVE_VERSION) out.newerThanGame = v; // written by a newer build: load what we understand
  out.version = Math.max(v, SAVE_VERSION); return out;
}
export const SLOTS = ['auto', '1', '2', '3'];
export const SaveSystem = {
  write(slot, data) {
    const payload = { version: SAVE_VERSION, savedAt: Date.now(), ...data };
    localStorage.setItem(PREFIX + slot, JSON.stringify(payload));
    return payload;
  },
  read(slot) {
    try { const r = localStorage.getItem(PREFIX + slot); return r ? migrate(JSON.parse(r)) : null; } catch (e) { return null; }
  },
  remove(slot) { localStorage.removeItem(PREFIX + slot); },
  list() { return SLOTS.map((s) => ({ slot: s, data: this.read(s) })); },
  latest() {
    let best = null;
    for (const { slot, data } of this.list()) if (data && (!best || data.savedAt > best.data.savedAt)) best = { slot, data };
    return best;
  },
};
