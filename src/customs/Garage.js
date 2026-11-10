// COLOMBO CUSTOMS — vehicle ownership. A vehicle becomes YOURS when you buy its first modification at Colombo Customs (the shop
// registers it). Records live in the story state (story.state.garage), so they go through every existing save path (manual slots,
// autosave, migration) untouched:
//   { next, list: [{ id, type, seed, mods, bought, spent, x, z, yaw, lost, plate }] }
// Per vehicle INSTANCE, not per model: two owned hatchbacks of the same type keep separate records and looks.
// Owned vehicles are never towed (Traffic.release reads v.ownerId) and come back parked where you left them after a reload. A
// vehicle wrecked (burnt out) or removed is marked lost; Colombo Customs recovers it (insurance excess) with all its mods.
import { Vehicle } from '../vehicles/Vehicle.js';
import { installMods } from './CustomsApply.js';
import { sanitize, profileOf, MAX_OWNED } from './CustomsCatalog.js';

export class Garage {
  constructor(game) { this.g = game; this.live = new Map(); this.t = 0; }
  get state() { const s = this.g.story.state; if (!s.garage || !Array.isArray(s.garage.list)) s.garage = { next: 1, list: [] }; return s.garage; }
  rec(id) { return id ? this.state.list.find((r) => r.id === id) || null : null; }
  recordOf(v) { return v && v.ownerId ? this.rec(v.ownerId) : null; }
  get count() { return this.state.list.filter((r) => !r.lost).length; }
  canOwnMore() { return this.count < MAX_OWNED; }
  // register a live vehicle (first purchase); returns the record
  own(v) {
    if (v.ownerId && this.rec(v.ownerId)) return this.rec(v.ownerId); if (!profileOf(v.type) || !this.canOwnMore()) return null;
    const S = this.state, A = this.g.atmos; const r = { id: 'v' + S.next++, type: v.type, seed: v.seed, mods: {}, bought: A ? `Day ${A.day} ${A.timeString}` : '', spent: 0, x: v.x, z: v.z, yaw: v.yaw, lost: false };
    S.list.push(r); v.ownerId = r.id; this.live.set(r.id, v); if (v.left) v.left = null; return r;
  }
  // the installed record after a purchase
  commit(v, mods, cost) { const r = this.recordOf(v); if (!r) return; r.mods = { ...mods }; r.spent = (r.spent || 0) + cost; r.x = v.x; r.z = v.z; r.yaw = v.yaw; }
  // positions of every live owned vehicle into the records (saveTo calls it before writing)
  snapshot() { for (const [id, v] of this.live) { const r = this.rec(id); if (!r) { this.live.delete(id); continue; } if (v.disposed || v.wrecked) { this.markLost(r, v); continue; } r.x = +v.x.toFixed(2); r.z = +v.z.toFixed(2); r.yaw = +v.yaw.toFixed(3); } }
  markLost(r, v) { if (!r.lost) { r.lost = true; if (this.g.hud && v && !v.disposed) this.g.hud.notify('Vehicle lost', `Your ${this.nameOf(r.type)} was destroyed. Colombo Customs can recover it.`, 'info', 4); } this.live.delete(r.id); }
  nameOf(type) { return this.g.vehicleName ? this.g.vehicleName(type) : type; }
  // after a save was loaded (story.state replaced): drop live owned vehicles of the previous session, spawn this save's ones
  restore() {
    const T = this.g.traffic; for (const [, v] of this.live) { if (v.player || v.disposed) continue; const i = T.parked.indexOf(v); if (i >= 0) T.parked.splice(i, 1); T.remove(v); } this.live.clear();
    for (const r of this.state.list) { if (r.lost || !profileOf(r.type)) continue; this.spawn(r, r.x, r.z, r.yaw); }
  }
  spawn(r, x, z, yaw) {
    const T = this.g.traffic; const v = new Vehicle(r.type, r.seed, this.g.scene); v.place(x, z, yaw); v.ownerId = r.id; T.release(v, false);
    r.mods = sanitize(r.type, r.mods); if (Object.keys(r.mods).length) installMods(v, r.mods); this.live.set(r.id, v); return v;
  }
  // the player took over an owned vehicle again (or one we already track) — keep the live map right
  attach(v) { if (v && v.ownerId && this.rec(v.ownerId)) this.live.set(v.ownerId, v); }
  update(dt) { this.t += dt; if (this.t < 1.5) return; this.t = 0; for (const [id, v] of this.live) { const r = this.rec(id); if (!r) { this.live.delete(id); continue; } if (v.wrecked || v.disposed) this.markLost(r, v); } }
  recoveryPrice(r) { const P = profileOf(r.type); return Math.round((2500 * (P ? P.f : 1)) / 50) * 50; }
}
