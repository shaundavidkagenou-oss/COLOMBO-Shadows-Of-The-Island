// Construction sites (feature 36, and the site half of 39/52). Colombo is never finished: there is always a hoarding round a
// plot with rebar going up behind it. Three to five sites are picked once, deterministically, on clear ground beside a
// commercial street (never on a pavement, never across a road, never inside a building), and each is a working site:
//
//   · a plywood hoarding on posts round the plot, with a gate and a site board; scaffolding against the half-built frame,
//     a concrete frame two floors up with rebar stubs, a cement store, sand and brick stacks, a mixer, a site hut, cones
//   · the crew are ordinary crowd people in the 'job' state (the pattern StationLife / FuelService use) with their own
//     appearances (Appearance presets m_construction / m_mason / m_labourer / m_road_crew): labourers carry crates from the
//     tipper to the work face, masons lay at the frame and mix at the mixer, a supervisor walks the fence with a clipboard.
//     They keep site hours (7:00–17:30), take breaks, and a night watchman sits by the gate with a torch after dark.
//   · a tipper lorry stands in the plot (a real vehicle body, solids the traffic and the player collide with, never driven
//     here); crates come off its bed. The site makes its own noise (the city-event set-up loop, positional) while work is on.
//   · everything exists only while the player is near: built within BUILD_R, dropped beyond DROP_R, crew released back to
//     the street. Site work is a few dozen arithmetic operations a frame — no per-frame allocation.
import * as THREE from 'three';
import * as L from './Layout.js';
import { MultiBuilder } from '../gfx/MeshBuilder.js';
import { MAT } from '../gfx/Materials.js';
import { plan } from './CityPlan.js';
import { makeAppearance } from '../actors/Appearance.js';
import { Character } from '../actors/Character.js';
import { RNG } from '../core/rng.js';
import { Vehicle } from '../vehicles/Vehicle.js';
import { parkOnStand } from '../vehicles/Kickstand.js';
import { PlaceSound } from '../audio/PlaceAudio.js';
import { SoundBank } from '../audio/SoundBank.js';

const BUILD_R = 210, DROP_R = 280, ACTIVE_R = 120;
const W = 9, D = 7; // plot (local x × z), local +z faces the pavement / gate
const GATE = 2.0;
const CRATE = new THREE.BoxGeometry(0.34, 0.26, 0.26);
const HOLD = new THREE.Vector3(-0.30, 0.30, 0.02); // chest space: the right hand under the crate
const ELBOW = new THREE.Vector3(-1, -0.7, 0.25).normalize();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const dampA = (a, b, k, dt) => a + wrapA(b - a) * Math.min(1, k * dt);

// ------------------------------------------------------------------------------------------------ picking the plots
// Deterministic: the same save always has the same sites. A plot needs W×D of clear, flat ground (no building, no wall, no
// road, no water) close enough to a pavement to be a Colombo street site, and far enough from it that the hoarding never
// narrows the walkway (people keep walking past outside the fence).
function pickSites(collision, seed) {
  const rng = new RNG(seed);
  const out = []; const nodes = L.pedNodes;
  if (!nodes || !nodes.length) return out;
  const clear = (x, z) => { if (L.roadAt(x, z) || (L.isWater && L.isWater(x, z))) return false; return !collision.blocked(x, z, 0.5); };
  // a plot must not swallow an errand: shop doors, bus stops, benches and the like are not colliders, and neither are the
  // marked parking bays, so both are checked here against a coarse grid (built once, at load)
  const G = 24, cell = (x, z) => Math.floor(x / G) * 1000 + Math.floor(z / G), poiGrid = new Map();
  if (plan && plan.poi) for (const q of plan.poi) { const k = cell(q.x, q.z); const a = poiGrid.get(k); if (a) a.push(q); else poiGrid.set(k, [q]); }
  const keepOut = (x, z) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of poiGrid.get(cell(x, z) + i * 1000 + j) || []) if (Math.abs(q.x - x) < W / 2 + 2.5 && Math.abs(q.z - z) < D / 2 + 2.5) return false;
    if (plan && plan.parking) for (const q of plan.parking) if (Math.abs(q.x - x) < W / 2 + 1 && Math.abs(q.z - z) < D / 2 + 1) return false;
    return true;
  };
  const lotOk = (x, z) => {
    for (let a = -W / 2; a <= W / 2 + 0.01; a += 1.4) for (let b = -D / 2; b <= D / 2 + 0.01; b += 1.4) if (!clear(x + a, z + b)) return false;
    return true;
  };
  for (let k = 0; k < 900 && out.length < 5; k++) {
    const n = nodes[rng.int(0, nodes.length - 1)]; if (!n || (n.walkW || 2) < 2.4) continue;
    const a = rng.range(0, Math.PI * 2), d = rng.range(9.5, 24);
    const x = n.x + Math.sin(a) * d, z = n.z + Math.cos(a) * d;
    // keep the fence clear of the walkway: the gate side needs room to stand a lorry beside it
    let nd = Infinity; for (const o of nodes) { const q = (o.x - x) ** 2 + (o.z - z) ** 2; if (q < nd) nd = q; }
    if (Math.sqrt(nd) < (n.walkW || 2) + D / 2 + 1.6) continue;
    if (!lotOk(x, z) || !keepOut(x, z)) continue;
    if (out.some((s) => Math.hypot(s.x - x, s.z - z) < 190)) continue;
    // measurement is relative to the nearest pavement so the gate faces it
    let bn = n, bd = Infinity; for (const o of nodes) { const q = (o.x - x) ** 2 + (o.z - z) ** 2; if (q < bd) { bd = q; bn = o; } }
    const yaw = Math.atan2(bn.x - x, bn.z - z);
    out.push({ id: out.length, x, z, yaw, node: bn.id, seed: Math.floor(rng.next() * 1e6), name: SITE_NAMES[out.length % SITE_NAMES.length], ground: collision.groundAt(x, z, 0.3) });
  }
  return out;
}
const SITE_NAMES = ['Ceylon Homes — Kollupitiya Residences', 'Lanka Build — Commercial Tower', 'Sathosa Developers — Mixed Use', 'Greenfield — Apartments', 'Metro Constructions — Office Block'];

// ------------------------------------------------------------------------------------------------ one worker
class Worker {
  constructor(site, role, seed) {
    this.site = site; this.role = role; this.seed = seed; this.p = null; this.phase = 'idle'; this.t = 0; this.target = null; this.crate = null;
    this.job = { step: (p, dt, ctx, lod) => this.step(p, dt, ctx, lod), post: (p) => this.post(p), interrupt: (p, s) => this.interrupt(p, s), resume: () => this.resume() };
    this.lastX = 0; this.lastZ = 0; this.stallT = 0; this.best = undefined;
  }
  get alive() { const p = this.p; return !!(p && !p.dead && p.ch.crowdPed === p); }
  // site-local point → world
  wp(lx, lz) { const s = this.site, c = Math.cos(s.yaw), n = Math.sin(s.yaw); return { x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c }; }
  spawn() {
    const S = this.site, C = S.crowd; if (!C) return null;
    const sp = makeAppearance(this.seed, { preset: ROLES[this.role].preset });
    const loc = this.wp(ROLES[this.role].post[0], ROLES[this.role].post[1]);
    const p = C.makePed(sp, loc.x, loc.z, S.node); if (!p) return null;
    Object.assign(p, { x: loc.x, z: loc.z, state: 'job', job: this.job, keep: true, umbrella: false, jog: false, pace: ROLES[this.role].speed, siteRole: this.role, target: null, edge: null, route: null });
    C.place(p); this.p = p; this.lastX = loc.x; this.lastZ = loc.z; this.setPhase('work'); return p;
  }
  release() {
    const p = this.p; this.p = null; this.hold(false); if (!p) return;
    p.job = null; p.keep = false; p.siteRole = null;
    if (p.ch.crowdPed === p && !p.dead) { p.state = 'walk'; this.site.crowd.returnToGraph(p); }
  }
  setPhase(ph) { this.phase = ph; this.t = 0; this.stallT = 0; this.best = undefined; this.target = null; }
  spotOf(name) { const S = this.site.spots && this.site.spots[this.role]; return (S && S[name]) || this.wp(...ROLES[this.role][name]); }
  moveToSpot(name, final = true, speed = 1.15) { const q = this.spotOf(name); return this.moveToPoint(q.x, q.z, final, speed); }
  moveToPoint(x, z, final = true, speed = 1.15) {
    const p = this.p; const d = Math.hypot(x - p.x, z - p.z);
    this.target = { x, z }; if (d < (final ? 0.22 : 0.55)) return null;
    return { desired: final ? Math.min(speed, 0.32 + d * 1.2) : speed, tx: x, tz: z, avoid: d > 1.2, accel: 3 };
  }
  moveTo(lx, lz, final = true, speed = 1.15) {
    const p = this.p, q = this.wp(lx, lz); const d = Math.hypot(q.x - p.x, q.z - p.z);
    this.target = q; if (d < (final ? 0.22 : 0.55)) return null;
    return { desired: final ? Math.min(speed, 0.32 + d * 1.2) : speed, tx: q.x, tz: q.z, avoid: d > 1.2, accel: 3 };
  }
  // a small crate in the hands (a mesh on the chest bone, like the station vendors' loads)
  hold(on) {
    if (on === !!this.crate) return;
    if (!on) { if (this.crate) { this.crate.parent && this.crate.parent.remove(this.crate); this.crate = null; } const A = this.p && this.p.ch.anim; if (A) A.ik = null; return; }
    const p = this.p; if (!p || !p.ch.bones || !p.ch.bones.chest) return;
    const m = new THREE.Mesh(CRATE, MAT.paint); m.castShadow = true; m.name = 'siteCrate'; p.ch.bones.chest.add(m); this.crate = m;
    const A = p.ch.anim; A.ik = { R: HOLD, qR: null, wR: 1, poleR: ELBOW, L: null }; A.set('carry');
  }
  interrupt(p, state) { if (this.crate) this.hold(false); this.setPhase('work'); } // frightened / shoved / shot at: back to work when they recover
  resume() { this.setPhase('work'); }
  post(p) { if (this.crate && !p.ch.anim.ik) { const A = p.ch.anim; A.ik = { R: HOLD, qR: null, wR: 1, poleR: ELBOW, L: null }; } }
  step(p, dt) {
    const S = this.site, R = ROLES[this.role]; this.t += dt;
    const h = S.hour; const workTime = this.role === 'watchman' ? (h >= 18.5 || h < 6) : h >= R.from && h < R.to;
    // off shift: the crew goes home, the watchman only comes on at night
    if (!workTime) {
      if (this.phase !== 'leave') { this.hold(false); this.setPhase('leave'); }
      if (!this.leaving) { this.leaving = true; }
      const gate = this.wp(0, D / 2 + 3);
      const r = this.moveTo(0, D / 2 + 3, true, 1.3);
      if (r) return r;
      this.site.wantRelease(this); return { desired: 0, tx: null, tz: null, avoid: false };
    }
    this.leaving = false;
    const A = p.ch.anim;
    switch (this.phase) {
      case 'work': {
        this.hold(false);
        // where this trade stands
        const r = this.moveToSpot('post', true, R.speed);
        if (r) { this.walkAnim(); return r; }
        if (!p.faceYaw) p.faceYaw = S.yaw + (R.face ?? 0);
        p.faceYaw = null;
        if (A.action !== R.act) A.set(R.act);
        if (this.t > R.dwell + (this.seed % 7) || this.t > 24) this.nextTask(); // (a post they cannot quite reach never holds them all day)
        return { desired: 0, tx: null, tz: null, avoid: false };
      }
      case 'toPickup': { // fetch a crate from the material stack
        if (this.t > 26) { this.setPhase('work'); return { desired: 0, tx: null, tz: null, avoid: false }; }
        const r = this.moveToSpot('pickup', true, R.speed * 1.05);
        if (r) { this.walkAnim(); return r; }
        this.hold(true); this.setPhase('carry'); S.mgr.stats.fetches++; return { desired: 0, tx: null, tz: null, avoid: false };
      }
      case 'carry': { // take it to the face and set it down
        if (this.t > 30) { this.hold(false); this.setPhase('work'); return { desired: 0, tx: null, tz: null, avoid: false }; }
        const r = this.moveToSpot('drop', true, R.speed * 0.95);
        if (r) { if (A.action !== 'carry') A.set('carry'); return r; }
        this.hold(false); if (A.action !== 'interact') A.set('interact'); this.setPhase('place'); return { desired: 0, tx: null, tz: null, avoid: false };
      }
      case 'place': { if (this.t > 1.2) this.setPhase('work'); return { desired: 0, tx: null, tz: null, avoid: false }; }
      case 'walkabout': { // the supervisor's round / a labourer fetching a tool
        const r = this.moveToSpot('walk', true, R.speed);
        if (r) { this.walkAnim(); return r; }
        this.setPhase('work'); return { desired: 0, tx: null, tz: null, avoid: false };
      }
      case 'break': {
        const r = this.moveToSpot('rest', true, R.speed * 0.8);
        if (r) { this.walkAnim(); return r; }
        const a = this.role === 'supervisor' ? 'phone' : this.role === 'watchman' ? 'smoke' : 'stretch';
        if (A.action !== a) A.set(a);
        if (this.t > 9 + (this.seed % 6)) this.setPhase('work');
        return { desired: 0, tx: null, tz: null, avoid: false };
      }
      case 'leave': { const S2 = this.site; const through = Math.hypot(p.x - S2.gateIn.x, p.z - S2.gateIn.z) > 1.4 && (p.z - S2.z) * Math.cos(S2.yaw) + (p.x - S2.x) * Math.sin(S2.yaw) < D / 2;
        const r = through ? this.moveToPoint(S2.gateIn.x, S2.gateIn.z, true, 1.25) : this.moveToPoint(S2.leaveTo.x, S2.leaveTo.z, true, 1.25);
        if (r) { this.walkAnim(); return r; } if (!through) this.site.wantRelease(this); return { desired: 0, tx: null, tz: null, avoid: false }; }
      default: this.setPhase('work'); return { desired: 0, tx: null, tz: null, avoid: false };
    }
  }
  walkAnim() { const A = this.p.ch.anim; if (A.action === 'carry' || this.crate) return; if (A.action) A.set(null); }
  nextTask() {
    const R = ROLES[this.role], n = (this.seed + Math.floor(this.site.t / 30)) % 100;
    if (this.role === 'labourer' && n < 78) this.setPhase('toPickup');
    else if (n < 34) this.setPhase('walkabout');
    else if (n < 46) this.setPhase('break');
    else this.setPhase('work');
  }
}
const ROLES = {
  labourer: { preset: 'm_construction', speed: 1.15, post: [-0.6, 1.7], act: 'interact', dwell: 5, pickup: [-3.6, -0.9], drop: [-0.6, 1.9], walk: [1.0, 1.6], rest: [0.4, 2.7], from: 7, to: 17.5, face: 0 },
  mason: { preset: 'm_mason', speed: 1.05, post: [-2.0, -0.4], act: 'interact', dwell: 11, pickup: [1.6, -2.0], drop: [-2.0, -0.4], walk: [1.9, -2.2], rest: [0.6, 2.7], from: 7, to: 17.5, face: Math.PI / 2 },
  supervisor: { preset: 'm_road_crew', speed: 1.2, post: [0.4, 2.4], act: 'paper', dwell: 7, pickup: [0, 0], drop: [0, 0], walk: [-3.4, 2.4], rest: [-0.6, 2.7], from: 7, to: 17.5, face: 0 },
  watchman: { preset: 'm_road_crew', speed: 0.95, post: [0.9, 2.8], act: 'crossarms', dwell: 14, pickup: [0, 0], drop: [0, 0], walk: [0.9, 2.9], rest: [2.9, 2.6], from: 0, to: 24, face: 0 },
};

// ------------------------------------------------------------------------------------------------ the manager
export class Construction {
  constructor(game) {
    this.g = game; this.collision = game.collision; this.scene = game.scene; this.crowd = game.crowd; this.traffic = game.traffic;
    this.sites = []; this.ready = false; this.t = 0; this.frame = 0; this.seed = 1; this.hour = 12; this.stats = { builds: 0, buildMs: 0, maxBuildMs: 0, disposes: 0, workers: 0, fetches: 0, crates: 0, released: 0 };
    this.loopKeys = new Set(); this.marks = [];
  }
  // during loading: pick the plots (a few thousand collision queries, once)
  // every works is built here, behind the loading screen (a hoarding is ~30 ms of geometry+colliders: doing it when the
  // player first walks into range would drop a frame in the middle of the street). The meshes are frustum-culled and
  // cell-batched like the rest of the city, so five sites standing empty cost a handful of draw calls when seen.
  async prewarm(tick = null) {
    const t0 = performance.now(); this.pick();
    for (const s of this.sites) { if (!s.built) this.build(s); if (tick) await tick(); }
    // the crew's bodies are built and cached now, the way the station staff and the event performers are: the first
    // labourer to walk onto a site costs a clone, not a Character build (60–80 ms in the middle of the street)
    try { for (const [role, R] of Object.entries(ROLES)) { const sp = makeAppearance(6000 + role.length * 97, { preset: R.look || 'm_labourer' }); new Character(sp).dispose(); } } catch (e) { console.warn('[works] crew prewarm', e); }
    this.ready = true; this.prewarmMs = performance.now() - t0; return this.prewarmMs;
  }
  pick(seed = 1) {
    this.seed = seed; const found = pickSites(this.collision, 0x51ee + seed * 7919);
    this.sites = found.map((s) => ({ ...s, built: null, crew: [], state: 'idle', t: 0, crowd: this.crowd, mgr: this, hour: 12, wantRelease: (w) => this.releaseWorker(w) }));
    return this.sites;
  }
  reset(seed = 1) { for (const s of this.sites) this.dispose(s); this.pick(seed); }
  // ------------------------------------------------------------------ geometry
  build(site) {
    const t0 = performance.now(); const mb = new MultiBuilder('Construction ' + site.id);
    const conc = mb.get('concrete'), metal = mb.get('metal'), paint = mb.get('paint'), roadM = mb.get('road');
    const c = Math.cos(site.yaw), s = Math.sin(site.yaw);
    const P = (lx, lz) => [site.x + lx * c + lz * s, site.z - lx * s + lz * c];
    const box = (b, lx, ly, lz, sx, sy, sz, col, rot = 0) => { const [x, z] = P(lx, lz); b.box(x, site.ground + ly, z, sx, sy, sz, { rotY: site.yaw + rot, col }); };
    const C = (h, k = 1) => { const q = new THREE.Color(h); return [q.r * k, q.g * k, q.b * k]; };
    // ---- ground: levelled hardcore inside the plot
    const [gx, gz] = P(0, 0); roadM.hrect(gx - W / 2, gz - D / 2, gx + W / 2, gz + D / 2, site.ground + 0.02, 1, C('#6b6459'));
    // ---- hoarding: panels on posts round the plot, a gate in the middle of the street side
    const HOARD = C('#8d9a6a'), POST = C('#6e6250');
    const side = (x0, z0, x1, z1, gap) => {
      const [ax, az] = P(x0, z0), [bx, bz] = P(x1, z1); const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len; const n = Math.max(1, Math.round(len / 2.4));
      for (let i = 0; i < n; i++) {
        const t0p = i / n, t1p = (i + 1) / n; const mx = ax + dx * (t0p + t1p) / 2, mz = az + dz * (t0p + t1p) / 2;
        if (gap && Math.abs((t0p + t1p) / 2 - 0.5) * len < gap / 2) continue; // the gate opening
        paint.box(mx, site.ground + 1.05, mz, len / n + 0.02, 2.0, 0.06, { rotY: Math.atan2(dx, dz) + Math.PI / 2, col: HOARD.map((q) => q * (0.94 + (i % 3) * 0.05)) });
        paint.box(mx, site.ground + 2.1, mz, len / n + 0.02, 0.09, 0.12, { rotY: Math.atan2(dx, dz) + Math.PI / 2, col: C('#5d6647') }); // top rail
      }
      for (let i = 0; i <= n; i++) { const t0p = i / n; if (gap && Math.abs(t0p - 0.5) * len < gap / 2) continue; const px = ax + dx * t0p, pz = az + dz * t0p; metal.box(px, site.ground + 1.0, pz, 0.08, 2.1, 0.08, { col: POST }); } // posts
      void ux; void uz;
    };
    side(-W / 2, -D / 2, W / 2, -D / 2, 0); // back
    side(-W / 2, -D / 2, -W / 2, D / 2, 0); // left
    side(W / 2, -D / 2, W / 2, D / 2, 0); // right
    side(-W / 2, D / 2, W / 2, D / 2, GATE); // street side with the gate
    // gate leaves (open, swung back against the hoarding)
    for (const sd of [-1, 1]) { const [hx, hz] = P(sd * (GATE / 2 + 0.1), D / 2); paint.box(hx, site.ground + 1.0, hz, 0.06, 1.95, GATE * 0.95, { rotY: site.yaw + sd * 1.25, col: C('#7f8c60') }); }
    // ---- site board by the gate
    { const [bx, bz] = P(-W / 2 + 0.2, D / 2 + 0.5); metal.box(bx, site.ground + 1.3, bz, 0.07, 1.3, 0.07, { col: C('#5a5f66') }); paint.box(bx, site.ground + 1.65, bz, 1.5, 0.85, 0.05, { rotY: site.yaw + 0.1, col: C('#efe9c8') }); paint.box(bx, site.ground + 1.65, bz + 0.03, 1.34, 0.7, 0.02, { rotY: site.yaw + 0.1, col: C('#f4b63f') }); }
    // ---- the frame under construction: two floors of columns, slabs between them, rebar stubs above, a block wall going up
    const FR = C('#b9b4a8');
    const cols4 = [[-3.2, -2.4], [0.4, -2.4], [-3.2, 0.6], [0.4, 0.6]];
    for (const [cx, cz] of cols4) box(conc, cx, 1.6, cz, 0.36, 3.2, 0.36, FR);
    box(conc, -1.4, 3.28, -0.9, 4.7, 0.18, 3.8, FR); // first-floor slab
    box(conc, 2.9, 3.4, -0.9, 0.9, 0.06, 3.8, FR.map((q) => q * 0.98)); // slab lip on the open side
    for (const [cx, cz] of cols4) box(conc, cx, 3.4 + 1.6, cz, 0.34, 3.2, 0.34, FR.map((q) => q * 1.03)); // second storey
    for (const [cx, cz] of cols4) for (let k = 0; k < 4; k++) box(metal, cx + (k % 2 ? 0.09 : -0.09), 6.9, cz + (k < 2 ? 0.09 : -0.09), 0.022, 0.55, 0.022, C('#8a6a45')); // rebar stubs
    { // a block wall going up along the left of the plot (each course is laid, so it reads as work in progress)
      for (let r = 0; r < 11; r++) for (let k = 0; k < 10; k++) box(conc, -4.0 + k * 0.30 + (r % 2) * 0.05, 0.09 + r * 0.195, 1.15, 0.29, 0.19, 0.2, C('#c4bda9', 0.96 + ((r + k) % 3) * 0.02));
      box(conc, -2.65, 1.15, 1.15, 3.05, 0.05, 0.26, C('#b9b2a0')); // the mortar line
    }
    // ---- scaffolding against the frame: uprights, ledgers, plank decks on three lifts
    for (const [lx, lz] of [[-3.9, -3.0], [-3.9, 2.4], [1.2, -3.0], [1.2, 2.4]]) box(metal, lx, 3.4, lz, 0.06, 6.8, 0.06, C('#9aa0a4'));
    for (const y of [2.0, 4.2, 6.4]) {
      for (const lz of [-3.0, 2.4]) box(metal, -1.35, y, lz, 5.2, 0.055, 0.055, C('#9aa0a4'));
      for (const lx of [-3.9, 1.2]) box(metal, lx, y, -0.3, 0.055, 0.055, 5.5, C('#9aa0a4'));
      box(paint, -1.35, y + 0.05, -3.0, 5.1, 0.035, 0.9, C('#a98a5c')); // planks
    }
    for (let k = 0; k < 8; k++) { const lx = -3.9 + k * 0.72; box(metal, lx, 3.25, 2.4, 0.05, 0.05, 0.05, C('#8b9195')); } // joints along the street side
    // ---- materials: cement store + bags, sand, bricks, steel, mixer, site hut, cones
    box(paint, 3.0, 0.55, -2.2, 1.6, 1.1, 1.1, C('#c9c2ae')); box(paint, 3.0, 1.12, -2.2, 1.66, 0.06, 1.16, C('#8f8a7a'));
    for (let k = 0; k < 9; k++) box(paint, 3.0 + (k % 3 - 1) * 0.22, 0.12 + Math.floor(k / 3) * 0.22, -0.9 + ((k % 2) - 0.5) * 0.1, 0.5, 0.2, 0.28, C('#9d9a90', 0.9 + (k % 4) * 0.05), (k % 2) * 0.08);
    { const [x, z] = P(3.2, 1.2); conc.hpoly([[x - 1.0, z - 1.0], [x + 0.9, z - 1.1], [x + 0.7, z + 0.9], [x - 0.8, z + 1.0]], site.ground + 0.22, 1, C('#a89372')); conc.hpoly([[x - 0.7, z - 0.7], [x + 0.5, z - 0.7], [x + 0.3, z + 0.5]], site.ground + 0.42, 1, C('#b09b7a')); }
    for (let k = 0; k < 12; k++) box(paint, 1.6, 0.2 + Math.floor(k / 4) * 0.18, -2.0, 0.36, 0.16, 0.36, C('#8f5b45', 0.92 + (k % 3) * 0.06));
    for (let k = 0; k < 10; k++) box(metal, -3.75, 0.14 + Math.floor(k / 5) * 0.1, -1.4 + (k % 5) * 0.06 - 0.12, 3.0, 0.02, 0.03, C('#8a6a45'), 1.5708 + 0.02 * k);
    box(metal, 1.6, 0.5, 1.1, 0.9, 0.5, 0.6, C('#4c5a63')); box(conc, 1.6, 0.95, 1.1, 0.8, 0.5, 0.55, C('#b4b0a6'), 0.5); box(metal, 1.6, 0.18, 1.4, 0.12, 0.36, 0.12, C('#3d464d'));
    box(paint, 2.9, 1.2, 2.1, 2.4, 2.3, 1.6, C('#9aa7ad')); box(paint, 2.9, 2.38, 2.1, 2.5, 0.1, 1.7, C('#7d8a90'));
    box(paint, 2.9, 0.95, 2.93, 0.8, 1.9, 0.05, C('#5f6b70')); box(paint, 2.1, 1.55, 2.93, 0.7, 0.5, 0.05, C('#c9d3d6'));
    for (let k = 0; k < 5; k++) { box(paint, -W / 2 - 0.7 + k * 0.9, 0.16, D / 2 + 1.1, 0.28, 0.32, 0.28, C('#e4652a')); box(paint, -W / 2 - 0.7 + k * 0.9, 0.34, D / 2 + 1.1, 0.12, 0.06, 0.12, C('#f2f2f2')); }
    // ---- meshes
    const meshes = mb.toMeshes(MAT, { cast: true, receive: true });
    const group = new THREE.Group(); group.name = 'construction-' + site.id;
    for (const m of meshes) group.add(m);
    // ---- solids. The collision grid is made of axis-aligned boxes, so a long rotated box becomes a huge AABB: every wall
    // is written as a row of 1 m pieces (its true footprint) and every store as a grid of small cells, the way the city's
    // benches and stalls already do it. Otherwise the hoarding's own collider would fill the plot.
    const cols = [];
    const piece = (mx, mz, ex, ez, h) => cols.push({ x0: mx - ex, x1: mx + ex, z0: mz - ez, z1: mz + ez, h: site.ground + h, kind: 'wall' });
    const addWall = (lx0, lz0, lx1, lz1, th, h) => {
      const a = P(lx0, lz0), b = P(lx1, lz1), dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz) || 1; const n = Math.max(1, Math.ceil(len / 1.0));
      const ux = dx / len, uz = dz / len; const sl = len / n;
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; piece(a[0] + dx * t, a[1] + dz * t, Math.abs(ux) * sl / 2 + Math.abs(uz) * th / 2, Math.abs(uz) * sl / 2 + Math.abs(ux) * th / 2, h); }
    };
    const addSlab = (lx, lz, sx, sz, h) => { const nx = Math.max(1, Math.ceil(sx / 1.0)), nz = Math.max(1, Math.ceil(sz / 1.0));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const [x, z] = P(lx - sx / 2 + (i + 0.5) * sx / nx, lz - sz / 2 + (j + 0.5) * sz / nz); const ex = sx / nx / 2 * (Math.abs(c) + Math.abs(s)), ez = sz / nz / 2 * (Math.abs(c) + Math.abs(s)); piece(x, z, Math.min(ex, sx / nx / 2 * 1.42), Math.min(ez, sz / nz / 2 * 1.42), h); } };
    addWall(-W / 2, -D / 2, W / 2, -D / 2, 0.16, 2.2); addWall(-W / 2, -D / 2, -W / 2, D / 2, 0.16, 2.2); addWall(W / 2, -D / 2, W / 2, D / 2, 0.16, 2.2);
    addWall(-W / 2, D / 2, -GATE / 2, D / 2, 0.16, 2.2); addWall(GATE / 2, D / 2, W / 2, D / 2, 0.16, 2.2); // street side, gate in the middle
    addSlab(3.0, -2.2, 1.7, 1.2, 1.2); addSlab(3.0, -0.9, 1.2, 0.9, 0.8); addSlab(3.2, 1.2, 1.6, 1.6, 0.6);
    addSlab(2.9, 2.1, 2.5, 1.7, 2.5); addSlab(1.6, 1.1, 0.95, 0.7, 1.3);
    for (const [cx, cz] of [[-3.2, -2.4], [0.4, -2.4], [-3.2, 0.6], [0.4, 0.6]]) addSlab(cx, cz, 0.42, 0.42, 3.4); // frame columns (the slab is overhead: people walk under it)
    addWall(-4.15, 1.15, -1.2, 1.15, 0.26, 2.2); // the half-built block wall
    for (const cc of cols) this.collision.add(cc);
    site.cols = cols; site.group = group; site.built = true; site.t = 0;
    // where each trade stands / fetches / rests: nudged out of anything solid, so a worker never walks into a wall all day
    site.spots = {};
    const freeLocal = (lx, lz) => {
      for (let r = 0; r < 12; r++) for (let k = 0; k < (r ? 8 : 1); k++) { const a = (k / 8) * Math.PI * 2; const [x, z] = P(lx + (r ? Math.cos(a) * r * 0.35 : 0), lz + (r ? Math.sin(a) * r * 0.35 : 0)); if (!this.collision.blocked(x, z, 0.3)) return { x, z }; }
      const [x, z] = P(lx, lz); return { x, z };
    };
    site.gateIn = freeLocal(0, D / 2 - 0.4); site.leaveTo = freeLocal(0, D / 2 + 3.0);
    for (const [role, R] of Object.entries(ROLES)) site.spots[role] = { post: freeLocal(R.post[0], R.post[1]), pickup: freeLocal(R.pickup[0], R.pickup[1]), drop: freeLocal(R.drop[0], R.drop[1]), rest: freeLocal(R.rest[0], R.rest[1]), walk: freeLocal(R.walk[0], R.walk[1]) };
    this.scene.add(group);
    // ---- the tipper standing in the plot, backed in against the material store
    try {
      if (!site.truck && this.traffic) {
        const [tx, tz] = P(0.4, -1.6);
        const v = new Vehicle('lorry', 7000 + site.seed, this.scene); v.place(tx, tz, site.yaw - 0.12); parkOnStand(v); v.parked = true; v.keep = true; v.siteTruck = true;
        this.traffic.guests.push(v); site.truck = v;
      }
    } catch (e) { console.warn('[construction] truck', e); }
    this.stats.builds++; const ms = performance.now() - t0; this.stats.buildMs += ms; this.stats.maxBuildMs = Math.max(this.stats.maxBuildMs, ms);
    return this.stats.maxBuildMs;
  }
  dispose(site) {
    if (site.group) { this.scene.remove(site.group); site.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); site.group = null; }
    if (site.cols) { this.collision.removeList(site.cols); site.cols = null; }
    if (site.truck) { const T = this.traffic && this.traffic.guests; if (T) { const i = T.indexOf(site.truck); if (i >= 0) T.splice(i, 1); } site.truck.dispose(); site.truck = null; }
    let alive = 0; for (const w of site.crew) { if (this.crowd && w.p) { this.crowd.remove(w.p); alive++; } w.p = null; }
    site.crew.length = 0; site.built = false;
    if (this.crowd) this.crowd.extra = Math.max(0, (this.crowd.extra || 0) - alive);
    for (const k of [...this.loopKeys]) if (k.startsWith('site' + site.id + ':')) { this.loopKeys.delete(k); }
    this.stats.disposes++;
  }
  // ------------------------------------------------------------------ crew
  releaseWorker(w) {
    const p = w.p; if (!p) return; w.release(); this.stats.released++;
    const s = w.site; if (s && s.crew.includes(w)) { if (this.crowd) this.crowd.extra = Math.max(0, (this.crowd.extra || 0) - 1); }
  }
  staff(site) {
    if (site.crew.length || !this.crowd) return;
    const n = 1 + (site.seed % 2) + (site.seed % 3); // 3–5 on site
    for (let i = 0; i < n; i++) { const role = i === 0 ? 'supervisor' : i % 3 === 0 ? 'mason' : 'labourer'; const w = new Worker(site, role, 8000 + site.seed + i * 37); site.crew.push(w); }
    const watch = new Worker(site, 'watchman', 9000 + site.seed); site.crew.push(watch);
    if (this.crowd) this.crowd.extra = (this.crowd.extra || 0) + site.crew.length; // the street crowd makes room for them (same total people)
  }
  // ------------------------------------------------------------------ per frame
  update(dt, focus, ctx) {
    this.t += dt; this.frame++; this.hour = ctx && ctx.hour !== undefined ? ctx.hour : this.hour; this._budget = 1; // one Character build a frame, never a burst
    const near = []; for (const s of this.sites) { const d = Math.hypot(s.x - focus.x, s.z - focus.z); near.push([d, s]); }
    near.sort((a, b) => a[0] - b[0]);
    for (const [d, s] of near) {
      s.hour = this.hour;
      if (!s.built) { if (d < BUILD_R) this.build(s); else continue; } // (only reachable after a restore; prewarm builds them all)
      s.t += dt;
      // crew appears within ACTIVE_R and goes home beyond it
      if (d < ACTIVE_R) { if (!s.crew.length) this.staff(s); for (const w of s.crew) { if (!w.p && d < ACTIVE_R - 15 && !w.dead && this._budget > 0) { if (!this.crowd || this.crowd.peds.length < this.crowd.max + (this.crowd.extra || 0)) { this._budget--; w.spawn(); } } else if (w.p && (w.p.dead || w.p.ch.crowdPed !== w.p)) { w.p = null; } } }
      else if (s.crew.some((w) => w.p)) { for (const w of s.crew) if (w.p) this.releaseWorker(w); }
      // site noise while somebody is working
      const working = this.hour >= 7 && this.hour < 17.5 && s.crew.some((w) => w.p);
      const key = 'site' + s.id + ':work';
      if (working && d < 90 && SoundBank.has && SoundBank.has('ce.infra.setup')) { this.loopKeys.add(key); PlaceSound.want(key, { id: 'ce.infra.setup', x: s.x, z: s.z, ref: 11, lvl: 0.4, fadeIn: 1.5, fadeOut: 2, out: 'amb' }); }
      else if (this.loopKeys.has(key)) { const Lp = PlaceSound.loops.get(key); if (Lp) PlaceSound.release(Lp); this.loopKeys.delete(key); }
    }
    this.stats.workers = 0; for (const s of this.sites) for (const w of s.crew) if (w.p) this.stats.workers++;
  }
  // for the pause map / debug console: where the works are and what is going on
  info() { return this.sites.map((s) => ({ name: s.name, x: s.x, z: s.z, built: !!s.built, crew: s.crew.filter((w) => w.p).length, working: this.hour >= 7 && this.hour < 17.5, truck: !!s.truck })); }
  serialize() { return { v: 1, seed: this.seed }; }
  restore(d) { if (!d) return; if (d.seed !== this.seed) { for (const s of this.sites) this.dispose(s); this.pick(d.seed); } }
}
