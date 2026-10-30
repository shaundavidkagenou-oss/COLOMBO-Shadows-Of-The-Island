// Persistent save slots in localStorage: 3 manual slots + 1 autosave.
// Versioned: v1 (pre-2.0) saves are migrated on read to v2 (health, bank ledger, phone messages); v2 (single
// protagonist) to v3 (squad of three: per-character position, health, loadout, outfit, hold orders).
const PREFIX = 'colombo.save.';
export const SAVE_VERSION = 3;
// weapon order in Weapons.js (compact, service, heavy, carbine, assault, battle, bolt, semi, precision): Dineth's loadout
const DINETH_OWNS = [1, 3];
export function migrate(d) {
  if (!d || typeof d !== 'object') return null;
  let v = d.version || 1; const out = structuredClone(d); out.story = out.story || {};
  if (v < 2) { if (typeof out.story.health !== 'number') out.story.health = 100; if (!Array.isArray(out.story.ledger)) out.story.ledger = []; if (!Array.isArray(out.story.msgs)) out.story.msgs = []; out.migratedFrom = v; v = 2; }
  if (v < 3) { // one protagonist carrying all nine weapons → the squad. Dineth keeps the ammo of his own loadout; Shashika and
    // David start with their standard kits. The squad counts as assembled once "The Meeting" was completed.
    const assembled = Array.isArray(out.story.done) && out.story.done.includes('m0'); out.story.flags = out.story.flags || {}; if (assembled) out.story.flags.squad = true;
    if (out.story.outfit && !out.story.outfits) out.story.outfits = { dineth: out.story.outfit };
    const inv = out.weapons && Array.isArray(out.weapons.inv) ? out.weapons.inv : null; const p = out.player || {};
    out.squad = { v: 1, unlocked: assembled, active: 'dineth', members: { dineth: { x: p.x, z: p.z, yaw: p.yaw || 0, hp: out.story.health ?? 100, ...(inv ? { inv: inv.map((q, i) => [q[0], q[1], DINETH_OWNS.includes(i) ? 1 : 0]), sel: DINETH_OWNS.includes(out.weapons.sel) ? out.weapons.sel : 1 } : {}) } } };
    out.migratedFrom = out.migratedFrom || v; v = 3; }
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
