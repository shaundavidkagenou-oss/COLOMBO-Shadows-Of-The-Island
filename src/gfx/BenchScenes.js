// 92nd — benchmark scenarios beyond the Galle Road flythrough (Benchmark.js asks the scene for its hour, the streets to pin, the
// camera and the per-frame work). Both run the real activity code — nothing is a stand-in:
//   F  fight night: a forced fight night (ActivityManager → FightNight: venue dressing, spectators, fighters, referee, the
//      borrowed WalkIn lamp pool, effects, crowd reactions) at 22:30; the camera circles the ring at ringside height. The card is
//      restarted from its seeded first bout for every configuration.
//   R  street race: a forced race meet on the Marine Drive circuit with the HARD or EXPERT field (5–6 rivals on the player's own
//      vehicle physics, RaceDriver AI, traffic around them) at 22:30, spectated (no player car). The camera chases the leader.
//      The field goes back on the grid for every configuration.
// The player is moved to the venue for the run (its streaming / activity range is measured from there), hidden, and put back.
const lerp = (a, b, t) => a + (b - a) * t;

export class FightScene {
  constructor(g) { this.g = g; this.id = 'F'; this.hour = 22.5; this.label = 'Fight night (ringside orbit, 22:30)'; }
  canRun() { const g = this.g; if (!g.activities) return 'Activities are not available.'; if (g.player.vehicle || g.player.boat) return 'Get out of the vehicle first (scenario F).'; return null; }
  async setup(frame, overlay) {
    const g = this.g, M = g.activities, P = g.player; this.saveP = { x: P.x, z: P.z, yaw: P.yaw, vis: P.ch.root.visible }; this.roundT = M.roundT; M.roundT = 60;
    this.ev = M.force('fight', { venue: 'port', hours: 6 }); M.forced.unshift(M.forced.pop()); M.drop(); const s = M.siteOf(this.ev); this.site = s; P.teleport(s.x + 6, s.z, 0); P.ch.root.visible = false; g.focus = { x: s.x, z: s.z }; // (moved first in the list: it wins a tie with any other live night here)
    const t0 = performance.now(); while (performance.now() - t0 < 180000) { M.update(1 / 30); const I = M.inst; if (I && !I.ready && I.ev === this.ev) I.build(true); /* not measured: build the rest at once */ if (I && I.ready && I.ev === this.ev) break; overlay.set(`Fight night: dressing the venue… ${I ? I.stats.built : 0}`); await frame(); }
    if (!M.inst || !M.inst.ready) throw new Error('fight night did not get ready');
  }
  points() { return [[this.site.x, this.site.z]]; }
  reset() { const I = this.g.activities.inst; if (I && I.restart) I.restart(); }
  step(dt) { const g = this.g; g.activities.update(dt); }
  fly(t, cam) { const s = this.site, I = this.g.activities.inst; const gy = I && I.ground ? I.ground(s.x, s.z) : 0; const a = t * 0.12, r = 8.5 + Math.sin(t * 0.21) * 1.5;
    cam.position.set(s.x + Math.cos(a) * r, gy + 2.4 + Math.sin(t * 0.17) * 0.6, s.z + Math.sin(a) * r); cam.lookAt(s.x, gy + 1.2, s.z); cam.updateMatrixWorld(); this.g.focus = { x: s.x, z: s.z }; }
  info() { const I = this.g.activities.inst; return { scenario: 'F', label: this.label, venue: this.ev && this.ev.venue, site: this.site && [this.site.x, this.site.z], people: I ? I.people.length : 0, hour: this.hour }; }
  teardown() { const g = this.g, M = g.activities, P = g.player; M.drop(); M.forced = M.forced.filter((e) => e !== this.ev); M.roundT = this.roundT; if (this.saveP) { P.teleport(this.saveP.x, this.saveP.z, this.saveP.yaw); P.ch.root.visible = this.saveP.vis; } }
}

export class RaceScene {
  constructor(g, diff = 'hard') { this.g = g; this.diff = diff === 'expert' ? 'expert' : 'hard'; this.id = 'R'; this.hour = 22.5; this.label = `Street race (Marine Drive, ${this.diff.toUpperCase()} field, chase cam, 22:30)`; this._c = { x: 0, y: 0, z: 0, ok: false }; }
  canRun() { const g = this.g; if (!g.activities) return 'Activities are not available.'; if (g.player.vehicle || g.player.boat) return 'Get out of the vehicle first (scenario R).'; return null; }
  async setup(frame, overlay) {
    const g = this.g, M = g.activities, P = g.player; this.saveP = { x: P.x, z: P.z, yaw: P.yaw, vis: P.ch.root.visible }; M.instant = true;
    this.ev = M.force('race', { route: 'marine', diff: this.diff, hours: 6 }); M.forced.unshift(M.forced.pop()); M.drop(); const s = M.siteOf(this.ev); this.site = s; P.teleport(s.x, s.z, 0); P.ch.root.visible = false; g.focus = { x: s.x, z: s.z };
    const t0 = performance.now(); while (performance.now() - t0 < 180000) { M.update(1 / 30); const I = M.inst; if (I && !I.ready && I.ev === this.ev) I.build(true); if (I && I.ready && I.ev === this.ev) break; overlay.set(`Race meet: rivals arriving… ${I ? I.cars.length : 0}`); await frame(); }
    const I = M.inst; if (!I || !I.ready) throw new Error('race meet did not get ready'); this.R = I.R;
  }
  points() { const R = this.R, out = []; for (let i = 0; i < R.N; i += 20) out.push([R.cx[i], R.cz[i]]); return out; }
  async reset() { const I = this.g.activities.inst; if (!I) return; if (I.builtDiff === undefined) I.builtDiff = I.diff; I.state = 'meet'; I.diff = this.diff; await I.join({ spectate: true }); this._c.ok = false; }
  step(dt) { const g = this.g, I = g.activities.inst; if (I && I.cars.length) { let lead = I.cars[0]; for (const c of I.cars) if (c.d && lead.d && c.d.prog > lead.d.prog) lead = c; this.lead = lead.v; g.player.x = lead.v.x; g.player.z = lead.v.z; } g.activities.update(dt); } // the player rides with the leader (activity / streaming range)
  fly(t, cam, dt) { const v = this.lead || (this.g.activities.inst && this.g.activities.inst.cars[0] && this.g.activities.inst.cars[0].v); if (!v) return; const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw); const c = this._c;
    const tx = v.x - fx * 9.5, ty = 3.6, tz = v.z - fz * 9.5; const k = c.ok ? Math.min(1, (dt || 0.016) * 4) : 1; c.x = lerp(c.x, tx, k); c.y = lerp(c.y, ty, k); c.z = lerp(c.z, tz, k); c.ok = true;
    cam.position.set(c.x, c.y, c.z); cam.lookAt(v.x + fx * 6, 1.2, v.z + fz * 6); cam.updateMatrixWorld(); this.g.focus = { x: v.x + fx * 25, z: v.z + fz * 25 }; }
  info() { const I = this.g.activities.inst; return { scenario: 'R', label: this.label, route: 'marine', difficulty: this.diff, rivals: I ? I.cars.length : 0, hour: this.hour, rivalProgress: I ? I.cars.map((c) => (c.d ? +(c.d.prog / this.R.N).toFixed(2) : null)) : [] }; }
  teardown() { const g = this.g, M = g.activities, P = g.player; M.drop(); M.forced = M.forced.filter((e) => e !== this.ev); M.instant = false; if (this.saveP) { P.teleport(this.saveP.x, this.saveP.z, this.saveP.yaw); P.ch.root.visible = this.saveP.vis; } }
}

// 93rd — S: the CPU-worker benchmark's scenario. A street-level chase camera drives the Fort & Pettah circuit (the densest
// streets: Fort / Pettah chunks of 200+ buildings) at 30 m/s, so district detail and window joinery stream in continuously while
// traffic and pedestrians run around the camera. Before every configuration all streamed detail is dropped and the start area
// rebuilt on the main thread, so each configuration streams exactly the same streets in the same order. The render mode stays
// as set (the configurations differ only in the CPU worker count).
export class StreamScene {
  constructor(g) { this.g = g; this.id = 'S'; this.hour = 16.5; this.speed = 30; this.label = 'Streaming drive (Fort & Pettah circuit, 30 m/s, street level, 16:30)'; this._c = { x: 0, y: 0, z: 0, ok: false }; }
  canRun() { return null; }
  async setup() { const { buildRoute, STEP } = await import('../activities/RaceRoutes.js'); this.R = buildRoute('fort'); this.step_ = STEP; }
  points() { return []; } // nothing pinned: streaming is what is measured
  at(t) { const R = this.R; const f = (R.startI + (t * this.speed) / this.step_) % R.N; return Math.floor(f); }
  async reset() { const g = this.g, W = g.world, R = this.R; W.dropStreaming(); const i = this.at(0); W.warm(R.cx[i], R.cz[i]); this._c.ok = false; }
  step() {}
  fly(t, cam, dt) { const R = this.R, i = this.at(t), j = (i + 6) % R.N; const x = R.cx[i], z = R.cz[i], fx = R.cx[j] - x, fz = R.cz[j] - z, L = Math.hypot(fx, fz) || 1, ux = fx / L, uz = fz / L; const c = this._c;
    const tx = x - ux * 9.5, tz = z - uz * 9.5, k = c.ok ? Math.min(1, (dt || 0.016) * 5) : 1; c.x = lerp(c.x, tx, k); c.y = lerp(c.y, 3.6, k); c.z = lerp(c.z, tz, k); c.ok = true;
    cam.position.set(c.x, c.y, c.z); cam.lookAt(x + ux * 6, 1.2, z + uz * 6); cam.updateMatrixWorld(); this.g.focus = { x: x + ux * 25, z: z + uz * 25 }; }
  info() { return { scenario: 'S', label: this.label, route: 'fort', speed: this.speed, hour: this.hour }; }
  teardown() {}
}
