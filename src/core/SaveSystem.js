// Persistent save slots in localStorage: 3 manual slots + 1 autosave.
const PREFIX = 'colombo.save.';
export const SLOTS = ['auto', '1', '2', '3'];
export const SaveSystem = {
  write(slot, data) {
    const payload = { version: 1, savedAt: Date.now(), ...data };
    localStorage.setItem(PREFIX + slot, JSON.stringify(payload));
    return payload;
  },
  read(slot) {
    try { const r = localStorage.getItem(PREFIX + slot); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  },
  remove(slot) { localStorage.removeItem(PREFIX + slot); },
  list() { return SLOTS.map((s) => ({ slot: s, data: this.read(s) })); },
  latest() {
    let best = null;
    for (const { slot, data } of this.list()) if (data && (!best || data.savedAt > best.data.savedAt)) best = { slot, data };
    return best;
  },
};
