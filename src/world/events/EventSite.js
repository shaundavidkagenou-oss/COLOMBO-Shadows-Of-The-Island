// 81st request — DYNAMIC CITY EVENTS: one event site while the player is near it. Owns
//   · the geometry, in three build tiers (ground / rig / dress — EventLayouts) shown and hidden as the event is set up and taken
//     down. A tier only changes while the site is out of view (or far away) and never on top of the player, so nothing pops
//     in front of the camera: the crew is seen working, the next look at the lawn shows the progress.
//   · the colliders of the shown tiers (marked event: true; added / removed as a list — no full collision rebuild)
//   · the in-site router: a 0.4 m occupancy grid of the layout (solids blocked, chair blocks expensive) with A* + string pulling,
//     so people walk the aisles, round the stalls and through the gates instead of into barriers
//   · the people: visitors (walking in over the city's pavements from out of view, or already there when the player arrives
//     from far away), staff at their posts, the set-up / take-down crew, performers on the deck
//   · the programme (songs / sets / overs, applause, MC), the positional sound loops and one-shots, the night lighting
import * as THREE from 'three';
import { toWorld, toLocal } from './EventSites.js';
import { buildLayout } from './EventLayouts.js';
import { evMaterial, chairGeometry } from './EventKit.js';
import { atlasJob } from './EventArt.js';
import { Attendee, Staff, Performer } from './EventPeople.js';
import { makeAppearance, lookVariant, LOOK_VARIANTS } from '../../actors/Appearance.js';
const useKey = (sp) => (sp._k ?? sp.preset) + '.' + (sp._vi | 0); // 96th: a person = look × variant (several variants of one look may attend)
import { mulberry32 } from '../../core/rng.js';
import * as L from '../Layout.js';

const CELL = 0.4, MARGIN = 4, AGENT_R = 0.32, SOFT_R = 0.08, SOFT_COST = 7;
const SCARED = new Set(['flee', 'cower', 'down', 'recover', 'report', 'shelter', 'confront', 'scene', 'toCar']); // on the way to an event: these end the trip
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// visitors: never the uniformed trades / on-shift workers; the staff looks are their own fixed set (prewarmed at load)
const NOT_VISITOR = new Set(['m_security', 'f_security', 'm_cmc_cleaner', 'f_cmc_cleaner', 'm_road_crew', 'f_road_flagger', 'm_parking', 'm_kottu_cook', 'm_vendor_sarong', 'm_vendor_young', 'f_vendor', 'f_food_stall', 'm_cart_puller', 'm_fitness', 'f_fitness', 'm_gym', 'f_gym', 'f_nurse', 'm_doctor', 'f_doctor', 'm_construction', 'm_labourer', 'm_mason', 'm_conductor', 'm_tuk_driver', 'm_courier', 'm_fish_seller', 'f_fish_vendor', 'm_baker', 'f_bakery', 'm_mechanic', 'f_garment', 'm_veg_seller', 'f_flower_seller']);
const TOURIST = new Set(['m_tourist_eu', 'm_tourist_ea', 'f_tourist_eu', 'f_tourist_ea', 'm_backpacker', 'f_backpacker', 'm_tourist_in']);
const FAMILY = new Set(['f_aunty', 'f_grandmother', 'f_grandmother_shawl', 'm_uncle_sarong', 'm_retiree', 'm_retiree_national', 'f_homemaker', 'm_elder_kurta', 'f_frock']);
export const STAFF_LOOKS = {
  security: [[56001, 'm_security'], [56002, 'm_security'], [56003, 'f_security'], [56004, 'm_security'], [56005, 'f_security'], [56006, 'm_security']],
  medic: [[56011, 'f_nurse'], [56012, 'm_doctor'], [56013, 'f_nurse']], cleaner: [[56021, 'm_cmc_cleaner'], [56022, 'f_cmc_cleaner']],
  vendor: [[56031, 'm_kottu_cook'], [56032, 'f_food_stall'], [56033, 'm_vendor_sarong'], [56034, 'f_vendor'], [56035, 'm_vendor_young'], [56036, 'f_bakery']],
  organiser: [[56041, 'm_creative'], [56042, 'f_professional'], [56043, 'm_office_young']], tech: [[56051, 'm_construction'], [56052, 'm_it_dev'], [56053, 'm_mechanic']],
  reg: [[56061, 'f_office_young'], [56062, 'm_student']], volunteer: [[56071, 'm_student'], [56072, 'f_student'], [56073, 'f_kurti'], [56074, 'm_polo']],
  crew: [[56081, 'm_construction'], [56082, 'm_labourer'], [56083, 'm_road_crew'], [56084, 'm_mason'], [56085, 'm_labourer']],
  performer: [[56091, 'm_creative'], [56092, 'f_frock'], [56093, 'm_professional_kurta'], [56094, 'f_salwar_dupatta'], [56095, 'm_hoodie'], [56096, 'f_kurti_dupatta']],
};
const specCache = new Map();
export const staffSpec = ([seed, preset]) => { const k = seed + preset; if (!specCache.has(k)) specCache.set(k, makeAppearance(seed, { preset })); return specCache.get(k); };
export function eventSpecs() { const out = []; for (const k in STAFF_LOOKS) for (const l of STAFF_LOOKS[k]) out.push(staffSpec(l)); return out; }
// on-site character caps per template (the rest of the attendance is simulated as a number); scaled by the crowd density setting
const NPC_CAP = { stage: 46, expo: 36, screen: 34, gather: 24 };
const VENDOR_CAP = { stage: 3, expo: 6, screen: 3, gather: 0 };
// music per event (sound slots; empty slots are silent)
function musicFor(T) {
  if (T.id === 'bailaNight') return ['ce.stage.baila']; if (T.id === 'acousticThursday') return ['ce.stage.acoustic']; if (T.cat === 'concert' || T.id === 'nye') return ['ce.stage.set1', 'ce.stage.set2', 'ce.stage.set3', 'ce.stage.set4'];
  if (T.id === 'carols') return ['ce.cult.carols']; if (T.id === 'folkEvening' || T.id === 'independence') return ['ce.cult.drums', 'ce.cult.folk']; if (T.dansal || T.id === 'vesak') return ['ce.cult.bhakti'];
  if (T.id === 'deepavali' || T.id === 'thaiPongal') return ['ce.cult.nadaswaram']; if (T.id === 'avurudu') return ['ce.cult.raban']; if (T.cat === 'sport') return ['ce.sport.commentary']; if (T.tpl === 'expo') return ['ce.stage.acoustic']; return [];
}
function ambFor(T, night) { if (T.cat === 'sport' || T.cat === 'concert' || T.id === 'nye') return night > 0.5 ? 'ce.amb.evening' : 'ce.amb.crowd'; if (T.stalls === 'food' || T.stalls === 'avurudu') return 'ce.amb.market'; if (T.tpl === 'expo') return 'ce.amb.festival'; if (T.tpl === 'gather') return 'ce.amb.community'; return night > 0.5 ? 'ce.amb.evening' : 'ce.amb.crowd'; }

export class EventSite {
  constructor(mgr, ev) {
    this.mgr = mgr; this.ev = ev; const g = mgr.g; this.g = g; this.crowd = g.crowd; this.scene = g.scene; this.col = g.collision; const s = ev.site; this.s = s; this.kind = ev.T.tpl;
    this.rng = mulberry32(hashStr(ev.id)); const rng = mulberry32(hashStr(ev.id) ^ 0x5bd1e995);
    const gy = (lx, lz) => { const w = toWorld(s, lx, lz); return this.col.groundAt(w.x, w.z, s.base + 2) - s.base; };
    const t0 = performance.now(); this.B = buildLayout(ev.tpl, ev.T, s, gy, rng); this.buildMs = performance.now() - t0;
    this.root = new THREE.Group(); this.root.name = 'cityEvent:' + ev.id; this.root.position.set(s.x, s.base, s.z); this.root.rotation.y = s.yaw; this.root.updateMatrix(); this.root.updateMatrixWorld(true); this.root.matrixAutoUpdate = false; this.scene.add(this.root);
    this.tex = null; this.printMat = null; this.printJob = null; this.tierObj = [null, null, null]; this.tierCols = [[], [], []]; this.shown = 0; this.chairs = null;
    this.cx = s.x; this.cz = s.z; this.R = Math.hypot(s.W, s.D) / 2;
    // world-space spots
    const W = (p) => toWorld(s, p.x, p.z); const yawW = (a) => a + s.yaw;
    this.stand = this.B.stand.map((p) => ({ ...W(p), yaw: yawW(p.yaw), used: null }));
    this.seats = this.B.seats.map((p) => { const a = W(p), b = toWorld(s, p.ax, p.az); return { x: a.x, z: a.z, yaw: yawW(p.yaw), y: s.base + p.y, ax: b.x, az: b.z, row: p.row, used: null }; });
    this.stalls = this.B.stalls.map((p) => { const v = toWorld(s, p.vx, p.vz), c = toWorld(s, p.cx, p.cz); return { vx: v.x, vz: v.z, vyaw: yawW(p.vyaw), cx: c.x, cz: c.z, cyaw: yawW(p.cyaw), used: null, vendor: null }; });
    this.info = this.B.info ? W(this.B.info) : null; // where you stand to read the info board (interact → the City Events app on this event)
    this.posts = this.B.posts.map((p) => ({ ...p, ...W(p), yaw: yawW(p.yaw || 0) }));
    const deep = this.kind === 'stage' ? 2.0 : 0.8; this.marks = this.B.stage.map((p) => { const a = W(p), o = toWorld(s, p.x * (this.kind === 'stage' ? 1.15 : 1), p.z + deep); return { x: a.x, z: a.z, ox: o.x, oz: o.z, y: s.base + p.y, yaw: yawW(p.yaw), mic: !!p.mic }; });
    this.watch = { ...W(this.B.watch), y: s.base + (this.B.watch.y || 1.6) };
    this.wanderPts = this.B.wander.map(W); this.workPts = [...this.wanderPts, ...this.stalls.map((q) => ({ x: q.cx, z: q.cz })), ...this.marks.map((m) => ({ x: m.x, z: m.z })).filter((m, i) => i < 3 && this.kind !== 'stage')];
    const P = (o) => (o ? W(o) : null); this.gateIn = P(this.B.gateIn); this.gateOut = P(this.B.gateOut); this.exitIn = P(this.B.exitIn); this.exitOut = P(this.B.exitOut);
    this.exitFar = toWorld(s, 1.4, -s.D / 2 - 4.5);
    this.gen = (this.B.cols.find((c) => c.kind === 'generator') || null); if (this.gen) { const w = toWorld(s, (this.gen.x0 + this.gen.x1) / 2, (this.gen.z0 + this.gen.z1) / 2); this.gen = w; }
    // the queue (gate lane or dansal counter): slots that are on free ground (never on a road / in the water / through a wall)
    const q = this.B.queue; this.queueDef = null; this.queue = [];
    if (q) { const slots = []; for (let i = 0; i < q.n; i++) { const lx = q.x + q.dx * q.sp * i, lz = q.z + q.dz * q.sp * i; const w = toWorld(s, lx, lz); if (L.roadAt(w.x, w.z) || L.isWater(w.x, w.z) || this.col.blocked(w.x, w.z, 0.28)) break; slots.push({ x: w.x, z: w.z, yaw: Math.atan2(-q.dx, -q.dz) + s.yaw }); } if (slots.length >= 3) this.queueDef = { slots, counter: !!q.counter }; }
    this.counterQueue = !!(this.queueDef && this.queueDef.counter); this.gateQueue = !!(this.queueDef && !this.queueDef.counter);
    this.buildGrid();
    // people
    this.visitors = []; this.staff = []; this.crew = []; this.performers = []; this.incoming = []; this.usedSpecs = new Set(); this.spawnCd = 0; this.recruitCd = 2; this.peopleOn = false; this.settled = false; this.nodeCand = null;
    this.stats = { arrived: 0, left: 0, unstuck: 0, interrupted: 0, bought: 0, spawned: 0, settled: 0, recruited: 0, routes: 0, routeMs: 0, maxRouteMs: 0, served: 0 };
    // programme
    this.playing = false; this.beat = false; this.dancey = ['concert', 'celebration'].includes(ev.T.cat) || ev.T.id === 'avurudu'; this.applause = 0; this.applauseT = 99; this.prog = { ph: 'gap', t: 0, len: 6, set: 0 }; this.music = musicFor(ev.T);
    this.closing = false; this.evacuating = false; this.counterBusy = false; this.t = 0; this.frame = 0; this.lastSeenT = 0;
    this.node = s.node;
  }
  // ------------------------------------------------------------------------------------------------ geometry tiers
  ensurePrint(staged = false) { this.mgr.mk('ensurePrint'); if (this.printMat) return true; if (!this.printJob) this.printJob = atlasJob(this.ev); if (staged) { if (!this.printJob.step()) return false; } else while (!this.printJob.step()); this.tex = this.printJob.tex; this.printJob = null; this.printMat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.82, metalness: 0, side: THREE.DoubleSide }); this.printMat.name = 'evPrint:' + this.ev.id; return true; }
  buildTier(i) { this.mgr.mk('buildTier');
    if (this.tierObj[i]) return; this.ensurePrint(); const grp = this.B.tiers[i].build({ evPrint: this.printMat }, { cast: i < 2 });
    if (i === 2 && this.B.chairs.length) { const geo = chairGeometry(); const m = new THREE.InstancedMesh(geo, evMaterial('evPlastic'), this.B.chairs.length); const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
      this.B.chairs.forEach((c, k) => { E.set(0, c.yaw || 0, 0); Q.setFromEuler(E); V.set(c.x, c.y, c.z); M.compose(V, Q, S); m.setMatrixAt(k, M); C.setRGB(c.col[0], c.col[1], c.col[2]); m.setColorAt(k, C); });
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.castShadow = false; m.receiveShadow = true; m.name = 'ev:chairs'; m.computeBoundingSphere(); grp.add(m); this.chairs = m; }
    grp.traverse((o) => { if (o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); } }); grp.matrixAutoUpdate = false; grp.updateMatrix();
    this.tierObj[i] = grp; grp.visible = false; this.root.add(grp); grp.updateMatrixWorld(true);
    // colliders of this tier, world space
    const s = this.s; this.tierCols[i] = this.B.cols.filter((c) => c.tier === i).map((c) => { const a = toWorld(s, c.x0, c.z0), b = toWorld(s, c.x1, c.z1); return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z), y0: s.base + (c.y0 || 0), h: c.h, kind: c.kind === 'stage' && c.h > 0.6 ? 'stageDeck' : c.kind, event: true, evId: this.ev.id }; });
  }
  playerInside(cols, pad = 0.6) { const P = this.g.player; const px = P.vehicle ? P.vehicle.x : P.x, pz = P.vehicle ? P.vehicle.z : P.z; const pr = P.vehicle ? 3 : pad; return cols.some((c) => px > c.x0 - pr && px < c.x1 + pr && pz > c.z0 - pr && pz < c.z1 + pr); }
  peopleInside(cols) { for (const a of this.allAgents()) { const p = a.p; if (!p) continue; for (const c of cols) if (p.x > c.x0 - 0.35 && p.x < c.x1 + 0.35 && p.z > c.z0 - 0.35 && p.z < c.z1 + 0.35) return p; } return null; }
  // show n tiers (0..3). Returns true when the site is in that state
  setTiers(n, force = false) {
    if (n === this.shown) return true;
    if (n > this.shown) { const i = this.shown; if (!this.tierObj[i] && !force) { if (!this.printMat) this.ensurePrint(true); else this.buildTier(i); return false; } /* staged: one piece per frame */ this.buildTier(i); if (!force && this.playerInside(this.tierCols[i])) return false; // never put a barrier on the player
      const inP = this.peopleInside(this.tierCols[i]); if (inP && !force) { const a = this.allAgents().find((q) => q.p === inP); if (a && !this.seen(inP.x, inP.z)) { const f = this.freeNear(inP.x, inP.z); if (f) { inP.x = f.x; inP.z = f.z; this.crowd.place(inP); } } }
      this.tierObj[i].visible = true; this.col.addAll(this.tierCols[i]); this.shown = i + 1; return this.setTiers(n, force); }
    const i = this.shown - 1; this.tierObj[i].visible = false; this.col.removeList(this.tierCols[i]); this.shown = i; if (i === 2 || n === 0) this.releaseSeats(); return this.setTiers(n, force);
  }
  releaseSeats() { for (const a of this.visitors) if (a.seat) { a.standUp(); } }
  freeNear(x, z) { for (let r = 0.6; r < 6; r += 0.6) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r; if (!this.col.blocked(qx, qz, 0.3) && !this.allCols().some((c) => qx > c.x0 - 0.35 && qx < c.x1 + 0.35 && qz > c.z0 - 0.35 && qz < c.z1 + 0.35)) return { x: qx, z: qz }; } return null; }
  allCols() { return [...this.tierCols[0], ...this.tierCols[1], ...this.tierCols[2]]; }
  // ------------------------------------------------------------------------------------------------ in-site router
  buildGrid() {
    const s = this.s; const x0 = -s.W / 2 - MARGIN, z0 = -s.D / 2 - MARGIN; const nx = Math.ceil((s.W + MARGIN * 2) / CELL), nz = Math.ceil((s.D + MARGIN * 2) / CELL);
    const cost = new Uint8Array(nx * nz).fill(1); // 0 = blocked, 1 = free, SOFT_COST = chair block
    const mark = (b, r, v) => { const i0 = Math.max(0, Math.floor((b.x0 - r - x0) / CELL)), i1 = Math.min(nx - 1, Math.floor((b.x1 + r - x0) / CELL)), j0 = Math.max(0, Math.floor((b.z0 - r - z0) / CELL)), j1 = Math.min(nz - 1, Math.floor((b.z1 + r - z0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const cxl = x0 + (i + 0.5) * CELL, czl = z0 + (j + 0.5) * CELL; if (cxl < b.x0 - r || cxl > b.x1 + r || czl < b.z0 - r || czl > b.z1 + r) continue; const k = j * nx + i; if (v === 0) cost[k] = 0; else if (cost[k] !== 0) cost[k] = Math.max(cost[k], v); } };
    for (const c of this.B.soft) mark(c, SOFT_R, SOFT_COST); for (const c of this.B.cols) { if (c.h <= 0.3) continue; mark(c, AGENT_R, 0); }
    // the world outside the site: water, roads and the city's own solids are blocked too
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const lx = x0 + (i + 0.5) * CELL, lz = z0 + (j + 0.5) * CELL; if (Math.abs(lx) < s.W / 2 - 0.5 && Math.abs(lz) < s.D / 2 - 0.5) continue; const w = toWorld(s, lx, lz); if (L.isWater(w.x, w.z) || this.col.blocked(w.x, w.z, 0.25)) cost[j * nx + i] = 0; }
    this.grid = { x0, z0, nx, nz, cost, g: new Float32Array(nx * nz), from: new Int32Array(nx * nz), stamp: new Uint32Array(nx * nz), closed: new Uint32Array(nx * nz), heap: new Int32Array(nx * nz * 2), hf: new Float32Array(nx * nz * 2), run: 0 };
  }
  cellOf(lx, lz) { const G = this.grid; const i = Math.floor((lx - G.x0) / CELL), j = Math.floor((lz - G.z0) / CELL); if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return -1; return j * G.nx + i; }
  nearestFree(k) { const G = this.grid; if (k >= 0 && G.cost[k] === 1) return k; if (k < 0) return -1; const i0 = k % G.nx, j0 = (k / G.nx) | 0; let best = -1, bc = 9; for (let r = 1; r <= 6; r++) { for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) continue; const c = G.cost[j * G.nx + i]; if (c && c < bc) { bc = c; best = j * G.nx + i; } } if (best >= 0 && bc === 1) return best; } return best; }
  // world → world path (no start point); null when no way exists
  routeTo(ax, az, bx, bz) {
    const t0 = performance.now(); const s = this.s, G = this.grid; const A = toLocal(s, ax, az), Bp = toLocal(s, bx, bz);
    let ks = this.nearestFree(this.cellOf(A.x, A.z)), kg = this.nearestFree(this.cellOf(Bp.x, Bp.z));
    if (ks < 0 || kg < 0) return [{ x: bx, z: bz }]; // outside the grid: straight on (the crowd's steering takes it from there)
    const run = ++G.run; const { nx, cost, g, from, stamp, closed, heap, hf } = G; let hn = 0;
    const gi = kg % nx, gj = (kg / nx) | 0; const h = (k) => { const di = Math.abs((k % nx) - gi), dj = Math.abs(((k / nx) | 0) - gj); return (Math.max(di, dj) + 0.414 * Math.min(di, dj)); };
    const push = (k, f) => { let i = hn++; heap[i] = k; hf[i] = f; while (i > 0) { const pi = (i - 1) >> 1; if (hf[pi] <= hf[i]) break; const tk = heap[pi], tf = hf[pi]; heap[pi] = heap[i]; hf[pi] = hf[i]; heap[i] = tk; hf[i] = tf; i = pi; } };
    const pop = () => { const top = heap[0]; hn--; if (hn > 0) { heap[0] = heap[hn]; hf[0] = hf[hn]; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < hn && hf[l] < hf[m]) m = l; if (r < hn && hf[r] < hf[m]) m = r; if (m === i) break; const tk = heap[m], tf = hf[m]; heap[m] = heap[i]; hf[m] = hf[i]; heap[i] = tk; hf[i] = tf; i = m; } } return top; };
    stamp[ks] = run; g[ks] = 0; from[ks] = -1; push(ks, h(ks)); let found = false, it = 0;
    while (hn > 0 && it++ < 60000) { const k = pop(); if (closed[k] === run) continue; closed[k] = run; if (k === kg) { found = true; break; } const i = k % nx, j = (k / nx) | 0;
      for (let d = 0; d < 8; d++) { const di = [1, -1, 0, 0, 1, 1, -1, -1][d], dj = [0, 0, 1, -1, 1, -1, 1, -1][d]; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= G.nz) continue; const nk = nj * nx + ni; const c = cost[nk]; if (!c || closed[nk] === run) continue;
        if (d >= 4 && (!cost[j * nx + ni] || !cost[nj * nx + i])) continue; // no corner cutting past a solid
        const ng = g[k] + (d >= 4 ? 1.414 : 1) * c; if (stamp[nk] !== run || ng < g[nk]) { stamp[nk] = run; g[nk] = ng; from[nk] = k; push(nk, ng + h(nk)); } } }
    let out; if (!found) out = null; else { const cells = []; for (let k = kg; k !== -1; k = from[k]) cells.push(k); cells.reverse(); out = this.pull(cells, Bp); }
    const ms = performance.now() - t0; this.stats.routes++; this.stats.routeMs += ms; if (ms > this.stats.maxRouteMs) this.stats.maxRouteMs = ms; this.mgr.stats.routeMs += ms;
    if (!out) return null; out.push({ x: bx, z: bz }); return out;
  }
  // string pulling: keep a corner only where the straight line would cross a solid (or a chair block, except on the last metre)
  pull(cells, goalL) {
    const G = this.grid, s = this.s; const pts = cells.map((k) => ({ x: G.x0 + ((k % G.nx) + 0.5) * CELL, z: G.z0 + (((k / G.nx) | 0) + 0.5) * CELL }));
    const out = []; let a = 0; while (a < pts.length - 1) { let b = pts.length - 1; while (b > a + 1 && !this.losL(pts[a], pts[b], Math.hypot(pts[b].x - goalL.x, pts[b].z - goalL.z) < 1.2)) b--; out.push(pts[b]); a = b; }
    if (out.length) out.pop(); // the last cell centre: the exact goal is appended by the caller
    return out.map((p) => toWorld(s, p.x, p.z));
  }
  losL(a, b, softOk) { const G = this.grid; const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / (CELL * 0.5))); for (let i = 1; i < n; i++) { const t = i / n; const k = this.cellOf(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t); if (k < 0) continue; const c = G.cost[k]; if (!c) return false; if (c > 1 && !softOk) return false; } return true; }
  routeIn(x, z) { return this.routeTo(x, z, this.gateIn.x, this.gateIn.z) || [{ ...this.gateIn }]; }
  routeOut(x, z) { if (!this.inside(x, z, 1.5)) return []; const r = this.routeTo(x, z, this.exitIn.x, this.exitIn.z) || [{ ...this.exitIn }]; r.push({ ...this.exitOut }, { ...this.exitFar }); return r; }
  exitPt() { return this.exitOut; }
  inside(x, z, m = 0) { const l = toLocal(this.s, x, z); return Math.abs(l.x) < this.s.W / 2 + m && Math.abs(l.z) < this.s.D / 2 + m; }
  lineOfSight(ax, az, bx, bz) { const A = toLocal(this.s, ax, az), Bp = toLocal(this.s, bx, bz); const d = Math.hypot(Bp.x - A.x, Bp.z - A.z), n = Math.max(1, Math.ceil(d / 1.0)); for (let i = 1; i < n; i++) { const t = i / n, x = A.x + (Bp.x - A.x) * t, z = A.z + (Bp.z - A.z) * t; for (const c of this.B.cols) if (c.h > 1.7 && x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) return false; } return true; }
  // ------------------------------------------------------------------------------------------------ spots / queue
  freeAt(x, z, r, except = null) { const P = this.g.player; if (Math.hypot(P.x - x, P.z - z) < r + 0.3) return false; for (const p of this.crowd.peds) { if (p === except || p.state === 'down' && false) continue; if (Math.abs(p.x - x) < r + 0.27 && Math.abs(p.z - z) < r + 0.27 && Math.hypot(p.x - x, p.z - z) < r + 0.27) return false; } return true; }
  pickFree(list, x, z, me, key = 'x', keyz = 'z') { let best = null, bd = 1e9; const n = list.length; if (!n) return null; const start = Math.floor(this.rng() * n);
    for (let k = 0; k < Math.min(n, 60); k++) { const s = list[(start + k * 7) % n]; if (s.used) continue; const d = Math.hypot(s[key] - x, s[keyz] - z) * (0.6 + this.rng() * 0.8); if (d < bd) { bd = d; best = s; } } return best; }
  freeStand(x, z, me) { // prefers the front half when early, any free place later; groups stand together
    if (me.group) { for (const o of me.group) if (o !== me && o.spot && this.stand.includes(o.spot)) { let best = null, bd = 2.2; for (const s of this.stand) { if (s.used) continue; const d = Math.hypot(s.x - o.spot.x, s.z - o.spot.z); if (d < bd) { bd = d; best = s; } } if (best) return best; } }
    return this.pickFree(this.stand, this.watch.x, this.watch.z, me); }
  freeSeat(x, z, me) { if (me.group) { for (const o of me.group) if (o !== me && o.spot && this.seats.includes(o.spot)) { const i = this.seats.indexOf(o.spot); for (const j of [i + 1, i - 1, i + 2, i - 2]) { const s = this.seats[j]; if (s && !s.used && s.row === o.spot.row) return s; } } }
    return this.shown >= 3 ? this.pickFree(this.seats, this.watch.x, this.watch.z, me, 'ax', 'az') : null; }
  freeStall(x, z, me) { const open = this.stalls.filter((s) => !s.used && s.vendor && s.vendor.alive() && s.vendor.phase === 'post'); if (!open.length) return null; return open[Math.floor(this.rng() * open.length)]; }
  joinQueue(a) { if (!this.queueDef || this.queue.length >= this.queueDef.slots.length || this.queue.includes(a)) return false; this.queue.push(a); return true; }
  leaveQueue(a) { const i = this.queue.indexOf(a); if (i >= 0) this.queue.splice(i, 1); }
  queueIndex(a) { return this.queue.indexOf(a); }
  queueSlot(i) { return this.queueDef.slots[Math.min(i, this.queueDef.slots.length - 1)]; }
  serveTime() { return this.counterQueue ? 4 + this.rng() * 4 : 1.6 + this.rng() * 2.4; }
  served(a) { this.leaveQueue(a); this.stats.served++; }
  stayFor(a) { const ev = this.ev; const left = Math.max(0.2, ev.tEnd - this.mgr.now) * 60 * this.mgr.secPerMin; const base = this.kind === 'expo' ? 180 : this.kind === 'gather' ? 240 : 420; return Math.min(left, base * (0.5 + this.rng())); }
  seen(x, z) { return this.crowd.visible({ x, z }); }
  // ------------------------------------------------------------------------------------------------ people
  allAgents() { return [...this.visitors, ...this.staff, ...this.crew]; }
  visitorSpec(role) {
    const U = this.usedSpecs, free = (sp) => { for (let v = 0; v < LOOK_VARIANTS; v++) if (!U.has((sp._k ?? sp.preset) + '.' + v)) return true; return false; };
    const pool = (this.crowd.specs || []).filter((sp) => !NOT_VISITOR.has(sp.preset) && free(sp));
    if (!pool.length) return null; const want = role === 'tourist' ? pool.filter((sp) => TOURIST.has(sp.preset)) : role === 'family' ? pool.filter((sp) => FAMILY.has(sp.preset)) : role === 'spectator' ? pool.filter((sp) => sp.preset && sp.preset.includes('cricket_fan')) : null;
    const from = want && want.length ? want : pool; const base = from[Math.floor(this.rng() * from.length)]; const v0 = Math.floor(this.rng() * LOOK_VARIANTS); let sp = base;
    for (let j = 0; j < LOOK_VARIANTS; j++) { const c = lookVariant(base, (v0 + j) % LOOK_VARIANTS); if (!U.has(useKey(c))) { sp = c; break; } } U.add(useKey(sp)); return sp; }
  roleFor(sp) { if (TOURIST.has(sp.preset)) return 'tourist'; if (FAMILY.has(sp.preset)) return 'family'; if (this.ev.T.cat === 'sport') return 'spectator'; return 'visitor'; }
  // walk-in visitors: start on a pavement node out of sight 45–120 m away and walk the city graph to the entrance node
  spawnNodes() {
    if (this.nodeCand) return this.nodeCand; const C = this.crowd, e = this.s.entry || this.gateOut; const out = [];
    for (const n of C.nodesNear(e.x, e.z, 125)) { const d = Math.hypot(n.x - e.x, n.z - e.z); if (d < 45 || d > 125) continue; /* the node grid is square cells: radius-filtered here */ if (C.comp && C.comp[n.id] !== C.mainComp) continue; out.push(n); }
    this.nodeCand = out; return out;
  }
  spawnWalker() { this.mgr.mk('spawnWalker');
    const C = this.crowd; const nodes = this.spawnNodes(); if (!nodes.length || C.comp && C.comp[this.node] !== C.mainComp) return false;
    const P = this.g.player; for (let k = 0; k < 6; k++) { const n = nodes[Math.floor(this.rng() * nodes.length)]; if (Math.hypot(n.x - P.x, n.z - P.z) > 150 || C.visible({ x: n.x, z: n.z })) continue; /* inside the crowd's live radius (165 m), never in view */ const route = C.route(n.id, this.node); if (!route) continue;
      const g = this.rng() < 0.35 ? (this.rng() < 0.5 ? 3 : 2) : 1; const group = g > 1 ? [] : null; const role0 = this.rng() < (this.ev.T.cat === 'sport' ? 0.1 : 0.16) ? 'tourist' : g > 1 && this.rng() < 0.5 ? 'family' : (this.ev.T.cat === 'sport' ? 'spectator' : 'visitor');
      for (let i = 0; i < g; i++) { const sp = this.visitorSpec(i === 0 ? role0 : null); if (!sp) break; const p = C.makePed(sp, n.x + (i ? (this.rng() - 0.5) * 1.6 : 0), n.z + (i ? (this.rng() - 0.5) * 1.6 : 0), n.id); const a = new Attendee(this, i === 0 ? role0 : this.roleFor(sp), group); if (group) group.push(a);
        p.route = route.slice(); p.goalPoi = null; p.evIncoming = this; p.keep = true; /* on the way: not despawned by the street crowd */ p.onArrive = (pp) => this.arrive(pp, a); p.pace = Math.min(p.pace, 1.35); C.pickNext(p); a.p = p; this.incoming.push(a); this.stats.spawned++; }
      return true; }
    return false;
  }
  // a person already walking the street decides to go to the event
  recruit() { this.mgr.mk('recruit');
    const C = this.crowd, e = this.s.entry || this.gateOut; for (let k = 0; k < 8; k++) { const p = C.peds[Math.floor(this.rng() * C.peds.length)]; if (!p || p.keep || p.job || p.clique || p.partner || p.state !== 'walk' || p.crossing || p.jog || p.evIncoming || p.homeCar || p.poi || NOT_VISITOR.has(p.sp && p.sp.preset)) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z); if (d < 25 || d > 140 || p.nextNode === undefined) continue; const from = p.nextNode ?? p.node; const route = C.route(from, this.node); if (!route) continue;
      p.goalPoi = null; p.route = route; p.evIncoming = this; p.keep = true; const a = new Attendee(this, this.roleFor(p.sp), null); a.p = p; p.onArrive = (pp) => this.arrive(pp, a); this.incoming.push(a); this.usedSpecs.add(useKey(p.sp)); this.stats.recruited++; return true; }
    return false;
  }
  arrive(p, a) { this.mgr.mk('arrive'); // at the entrance node: the event takes them over
    const e = this.s.entry || this.gateOut; if (Math.hypot(p.x - e.x, p.z - e.z) > 30) { // the plan broke on the way (a stop, a detour): plan again from here, a few times at most
      const r = (a.reroutes = (a.reroutes || 0) + 1) < 5 ? this.crowd.route(p.node, this.node) : null; if (r && r.length) { p.route = r; p.onArrive = (pp) => this.arrive(pp, a); return false; }
      const i = this.incoming.indexOf(a); if (i >= 0) this.incoming.splice(i, 1); p.evIncoming = null; p.keep = false; p.route = null; this.stats.lostWay = (this.stats.lostWay || 0) + 1; return false; }
    const i = this.incoming.indexOf(a); if (i >= 0) this.incoming.splice(i, 1); p.evIncoming = null; p.keep = false;
    if (!this.mgr.acceptsVisitors(this.ev) || this.closing || this.evacuating || !this.peopleOn) { p.route = null; return false; } // the event is over / cancelled: they walk on
    a.adoptPed(p); this.visitors.push(a); this.stats.arrived++; a.setPhase('toGate', this.routeTo(p.x, p.z, this.gateOut.x, this.gateOut.z) || [{ ...this.gateOut }]); return true;
  }
  // the player arrives from far away while the event is on: some people are already there (placed out of view only)
  settleOne(target) { this.mgr.mk('settleOne');
    const want = this.rng() < 0.4 && this.seats.length && this.shown >= 3 ? 'seat' : 'stand'; const list = want === 'seat' ? this.seats : this.stand; const s = this.pickFree(list, this.watch.x, this.watch.z, null, want === 'seat' ? 'ax' : 'x', want === 'seat' ? 'az' : 'z'); if (!s) return false;
    const x = want === 'seat' ? s.ax : s.x, z = want === 'seat' ? s.az : s.z; if (this.seen(x, z) || !this.freeAt(x, z, 0.35)) return false;
    const role = this.ev.T.cat === 'sport' ? 'spectator' : this.rng() < 0.15 ? 'tourist' : this.rng() < 0.3 ? 'family' : 'visitor'; const sp = this.visitorSpec(role); if (!sp) return false;
    const a = new Attendee(this, this.roleFor(sp)); const p = a.spawnAt(sp, x, z, s.yaw, this.node); if (!p) return false; a.spot = s; s.used = a; this.visitors.push(a); this.stats.settled++;
    if (want === 'seat') { a.sitDown(s, null); a.sitW = 0.99; a.setPhase('seated'); } else { a.setPhase('stand'); a.lookYaw = s.yaw; } a.stay = this.stayFor(a); a.stayT = this.rng() * a.stay * 0.6; a.served = true; a.actT = this.rng() * 8; return true;
  }
  spawnStaff(post, role) { this.mgr.mk('spawnStaff');
    const looks = STAFF_LOOKS[role] || STAFF_LOOKS.organiser; const used = new Set(this.staff.concat(this.crew).map((a) => a.p && a.p.sp)); let sp = null; for (const l of looks) { const s2 = staffSpec(l); if (!used.has(s2)) { sp = s2; break; } } if (!sp) sp = staffSpec(looks[Math.floor(this.rng() * looks.length)]);
    const a = new Staff(this, role, post); const at = post.roam ? (this.wanderPts[0] || post) : post;
    if (!this.seen(at.x, at.z) && this.freeAt(at.x, at.z, 0.35)) { a.spawnAt(sp, at.x, at.z, post.yaw || 0, this.node); a.setPhase('post'); }
    else { // arrives on foot: from an unseen street node along the city's footpath graph to the entrance, then in to the post
      const P = this.g.player, e = this.s.entry || this.gateOut; const ns = this.spawnNodes().filter((q) => Math.hypot(q.x - P.x, q.z - P.z) < 150 && !this.crowd.visible({ x: q.x, z: q.z })).sort((u, v) => Math.hypot(u.x - e.x, u.z - e.z) - Math.hypot(v.x - e.x, v.z - e.z));
      const n = ns[Math.floor(this.rng() * Math.min(4, ns.length))]; if (!n) return null; const C = this.crowd; const route = C.route(n.id, this.node); if (!route) return null;
      const p = C.makePed(sp, n.x, n.z, n.id); Object.assign(p, { route, goalPoi: null, keep: true, umbrella: false, jog: false, pace: 1.3, evRole: role, evIncoming: this }); a.p = p; a.phase = 'travel';
      p.onArrive = (pp) => this.staffArrive(pp, a, at); C.pickNext(p); }
    a.actT = 1 + this.rng() * 6; return a;
  }
  staffArrive(p, a, at) { this.mgr.mk('staffArrive'); // a member of staff reached the entrance node by the footpath graph: the event's own routing from here
    const e = this.s.entry || this.gateOut; if (Math.hypot(p.x - e.x, p.z - e.z) > 30) { const r = (a.reroutes = (a.reroutes || 0) + 1) < 5 ? this.crowd.route(p.node, this.node) : null; if (r && r.length) { p.route = r; p.onArrive = (pp) => this.staffArrive(pp, a, at); return false; } a.gone = true; a.p = null; p.keep = false; p.evIncoming = null; p.route = null; return false; }
    p.evIncoming = null; a.adoptPed(p); a.setPhase('toPost', [...(this.routeTo(p.x, p.z, this.gateOut.x, this.gateOut.z) || [{ ...this.gateOut }]), ...this.routeIn(this.gateOut.x, this.gateOut.z), ...(this.routeTo(this.gateIn.x, this.gateIn.z, at.x, at.z) || [{ x: at.x, z: at.z }])]); return true;
  }
  // which staff should be here now: the posts (vendors on the first stalls), or the crew while it is being set up / taken down
  staffWanted(phase) {
    if (phase === 'crew') return { crew: this.kind === 'gather' ? 3 : this.kind === 'stage' ? 6 : 5 };
    const vend = Math.min(this.stalls.length, VENDOR_CAP[this.kind] || 0); return { posts: this.posts.filter((p) => p.role !== 'vendor'), vend };
  }
  peopleUpdate(dt, state, frac) {
    const mgr = this.mgr, ev = this.ev; const crewTime = state === 'preparation' && mgr.now < ev.t0 - 0.6 || state === 'cleanup';
    const showTime = (state === 'preparation' && mgr.now >= ev.t0 - 0.75) || ['active', 'paused', 'suspended', 'ending'].includes(state) || (state === 'cleanup' && mgr.now < ev.tCleanStart + ev.clean * 0.2);
    const canBuild = mgr.buildToken();
    // clean the lists: gone / dead / taken by another system
    for (const list of [this.visitors, this.staff, this.crew]) for (let i = list.length - 1; i >= 0; i--) { const a = list[i]; if (a.gone || !a.p) { list.splice(i, 1); continue; } if (a.phase === 'travel' && SCARED.has(a.p.state)) { const p = a.p; p.onArrive = null; p.keep = false; p.evIncoming = null; a.p = null; a.gone = true; list.splice(i, 1); continue; } if (a.p.dead || a.p.ch.crowdPed !== a.p) { if (a.p.dead) { a.p.job = null; a.p.keep = false; } if (a.seat && a.seat.used === a) a.seat.used = null; a.freeSpot(); this.leaveQueue(a); a.p = null; a.gone = true; list.splice(i, 1); } }
    for (let i = this.incoming.length - 1; i >= 0; i--) { const a = this.incoming[i]; const p = a.p; if (!p || p.ch.crowdPed !== p || p.dead || p.recycle) { this.incoming.splice(i, 1); this.stats.lostWay = (this.stats.lostWay || 0) + 1; continue; } if (SCARED.has(p.state) && p.onArrive) { /* frightened on the way: they don't come */ p.onArrive = null; p.evIncoming = null; p.keep = false; this.stats.scaredOff = (this.stats.scaredOff || 0) + 1; this.incoming.splice(i, 1); } }
    // crew
    if (crewTime) { const W = this.staffWanted('crew').crew; if (this.crew.filter((a) => a.phase !== 'leave').length < W && canBuild) { const a = this.spawnStaff({ roam: true, x: this.cx, z: this.cz, yaw: 0 }, 'crew'); if (a) { this.crew.push(a); mgr.useToken(); return; } } }
    else for (const a of this.crew) if (a.phase !== 'leave' && !a.task) a.leave();
    // staff at posts
    if (showTime && !this.evacuating) { const w = this.staffWanted('show'); const have = new Set(this.staff.map((a) => a.post));
      if (canBuild) { const need = w.posts.find((p) => !have.has(p)); if (need) { const a = this.spawnStaff(need, need.role); if (a) { this.staff.push(a); mgr.useToken(); return; } }
        const st = this.stalls.filter((s, i) => i % Math.max(1, Math.floor(this.stalls.length / Math.max(1, w.vend))) === 0).slice(0, w.vend).find((s) => !s.vendor || s.vendor.gone);
        if (st) { const post = { role: 'vendor', x: st.vx, z: st.vz, yaw: st.vyaw }; const a = this.spawnStaff(post, 'vendor'); if (a) { st.vendor = a; this.staff.push(a); mgr.useToken(); return; } } } }
    else if (!showTime) for (const a of this.staff) if (a.phase !== 'leave' && !a.task) a.leave();
    // visitors: target count from the simulated attendance
    const dens = Math.max(0.35, Math.min(1.3, (this.crowd.max || 70) / 70)); const cap = Math.round((NPC_CAP[this.kind] || 30) * dens);
    const target = this.closing || this.evacuating || !mgr.acceptsVisitors(ev) ? 0 : Math.round(cap * frac);
    const present = this.visitors.filter((a) => a.phase !== 'leave').length, coming = this.incoming.length;
    if (!this.settled && mgr.acceptsVisitors(ev) && target >= 3) { if (present < target * 0.7 && canBuild && this.settleOne(target)) { mgr.useToken(); return; } if (present >= target * 0.7 || (this.settleTries = (this.settleTries || 0) + 1) > 240) this.settled = true; } // (pre-placing is for a player arriving at an event already under way; during the build-up people walk in)
    if (present + coming < target && (this.spawnCd -= dt) <= 0) { this.spawnCd = 1.2 + this.rng() * 2.8 / Math.max(0.3, frac);
      if ((this.recruitCd -= 1) <= 0 && this.recruit()) this.recruitCd = 3 + Math.floor(this.rng() * 4); else if (canBuild && this.spawnWalker()) mgr.useToken(); }
    // too many for the hour (late in the event): the ones who have been here longest go first, each in their own time
    if (present > target + 2 && (this.leaveCd = (this.leaveCd || 0) - dt) <= 0) { this.leaveCd = 2 + this.rng() * 5; const a = this.visitors.filter((q) => q.phase === 'stand' || q.phase === 'seated').sort((x, y) => (y.stayT || 0) - (x.stayT || 0))[0]; if (a) { a.stay = Math.min(a.stay, a.stayT); } }
    mgr.crowdExtra += Math.round((this.visitors.length + this.incoming.length) * 0.5);
  }
  performersUpdate(dt, state, dist) {
    const want = (state === 'active' || state === 'paused') && dist < 150 && this.marks.length ? Math.min(this.kind === 'stage' ? 4 : 1, this.marks.length) : 0;
    if (this.performers.length < want && this.mgr.buildToken()) { const i = this.performers.length; const m = this.marks[i]; if (!this.seen(m.ox, m.oz) || dist > 60) { const look = STAFF_LOOKS.performer[(i + (hashStr(this.ev.id) % 6)) % 6]; const style = this.ev.T.id === 'carols' ? 'choir' : ['folkEvening', 'independence', 'avurudu'].includes(this.ev.T.id) ? 'dance' : 'band'; this.mgr.mk('performer'); const pf = new Performer(this, staffSpec(look), m, i === 0 && m.mic ? 'band' : style); pf.state = 'walkOn'; this.performers.push(pf); this.mgr.useToken(); } }
    if (this.performers.length > want) { for (const pf of this.performers) pf.walkOff(); for (let i = this.performers.length - 1; i >= 0; i--) { const pf = this.performers[i]; if (pf.state === 'off' && (!this.seen(pf.x, pf.z) || dist > 60)) { pf.dispose(); this.performers.splice(i, 1); } } }
    const n = dist < 40 ? 1 : dist < 90 ? 2 : 4; this.frame++; this.performers.forEach((pf, k) => { if ((this.frame + k) % n === 0) pf.update(dt * n, 1); });
  }
  // ------------------------------------------------------------------------------------------------ programme (real seconds)
  programme(dt, state) {
    const P = this.prog; this.applauseT += dt; if (state !== 'active') { if (this.playing) { this.playing = false; } P.ph = 'gap'; P.t = 0; P.len = 8; this.beat = false; return; }
    P.t += dt; const sport = this.ev.T.cat === 'sport';
    if (P.ph === 'gap' && P.t > P.len) { P.ph = 'song'; P.t = 0; P.len = sport ? 200 + this.rng() * 120 : this.kind === 'gather' ? 150 + this.rng() * 120 : 110 + this.rng() * 70; P.set = (P.set + 1) % Math.max(1, this.music.length); this.playing = true; this.beat = this.dancey || this.ev.T.cat === 'cultural'; if (!sport && this.rng() < 0.6) this.mgr.shot(this, 'ce.crowd.cheer', this.watch.x, this.watch.z, 20, 0.8, 6); P.nextRoar = 25 + this.rng() * 60; }
    else if (P.ph === 'song') { if (sport && (P.nextRoar -= dt) <= 0) { P.nextRoar = 30 + this.rng() * 80; this.applause++; this.applauseT = 0; this.mgr.shot(this, 'ce.sport.roar', this.watch.x, this.watch.z, 26, 1, 10); }
      if (P.t > P.len) { P.ph = 'gap'; P.t = 0; P.len = sport ? 30 + this.rng() * 20 : 14 + this.rng() * 14; this.playing = false; this.applause++; this.applauseT = 0; if (!sport) this.mgr.shot(this, 'ce.crowd.applause', this.watch.x, this.watch.z, 22, 1, 5);
        if (!sport && this.rng() < 0.45) setTimeout(() => { if (this.disposed || this.ev.state !== 'active') return; this.mgr.announce(this, 'ce.stage.mcWelcome', 22); }, 4500); } }
  }
  // ------------------------------------------------------------------------------------------------ sound loops (PlaceSound: positioned, faded, released when not wanted)
  sounds(state, frac, night, dist) {
    const mgr = this.mgr, id = this.ev.id; if (dist > 220) return; const loop = (k, slot, x, z, ref, lvl) => mgr.loop(`${id}:${k}`, slot, x, z, ref, lvl);
    if (['active', 'paused', 'suspended', 'ending'].includes(state) || (state === 'preparation' && this.mgr.now >= this.ev.t0 - 0.5)) loop('amb', ambFor(this.ev.T, night), this.cx, this.cz, 16, 0.25 + 0.75 * frac);
    if (state === 'active' && this.playing && this.music.length) { const slot = this.music[this.prog.set % this.music.length]; loop('music', slot, this.watch.x, this.watch.z, 26, 1); if (this.beat && this.dancey) loop('clap', 'ce.crowd.clap', this.cx, this.cz, 14, 0.6 * frac); }
    if (state === 'active' && !this.playing && this.ev.T.cat === 'sport' && this.prog.t > 6) loop('papare', 'ce.sport.papare', this.cx, this.cz, 18, 0.8);
    if (state === 'active' && !this.playing) loop('pahum', 'ce.infra.paHum', this.watch.x, this.watch.z, 4, 0.6);
    if (this.gen && this.shown >= 1 && state !== 'scheduled') loop('gen', 'ce.infra.generator', this.gen.x, this.gen.z, 5, 1);
    if (state === 'preparation' && this.mgr.now < this.ev.t0 - 0.5 || state === 'cleanup') loop('setup', 'ce.infra.setup', this.cx, this.cz, 12, 1);
    if (state === 'ending' || this.evacuating) loop('leave', 'ce.crowd.leaving', this.exitOut.x, this.exitOut.z, 12, 0.9);
  }
  radioChatter(x, z) { this.mgr.shot(this, 'ce.infra.radio', x, z, 6, 1, 12); }
  workNoise(x, z) { this.mgr.shot(this, this.rng() < 0.5 ? 'ce.infra.caseRoll' : 'ce.infra.barrier', x, z, 10, 1, 4); }
  megaphone(x, z) { if (!this.mgr.shot(this, 'ce.safe.megaphone', x, z, 16, 1, 15, true)) this.mgr.shot(this, 'ce.safe.whistle', x, z, 16, 1, 8); }
  // night lighting: lamps (evLens emissive), beams over the crowd (evBeam), deco glow; shared materials, driven by the nearest site
  lights(state, night) { const lens = evMaterial('evLens'), beam = evMaterial('evBeam'); const on = ['active', 'paused', 'ending'].includes(state); const k = on ? Math.max(0.15, night) : (state === 'preparation' && this.mgr.now > this.ev.t0 - 0.4 ? 0.25 * night : 0);
    lens.emissiveIntensity = k * (this.playing ? 2.2 + 0.6 * Math.sin(this.t * 3.1) : 1.2); beam.opacity = on && this.playing && night > 0.3 ? 0.07 + 0.03 * Math.sin(this.t * 2.3) : 0; }
  // ------------------------------------------------------------------------------------------------ per frame
  update(dt, ctx) {
    this.t += dt; const { state, frac, night, dist, seen } = ctx;
    if (this.tierObj[2]) this.tierObj[2].visible = this.shown >= 3 && dist < 230; if (this.chairs) this.chairs.castShadow = dist < 70;
    const peopleR = this.peopleOn ? 210 : 170; const wantPeople = dist < peopleR && !this.g.indoor;
    if (wantPeople && !this.peopleOn) { this.peopleOn = true; this.settled = !(state === 'active' || state === 'paused' || (state === 'preparation' && this.mgr.now > this.ev.t0 - 0.5)) || dist < 60; }
    if (!wantPeople && this.peopleOn && !seen) this.clearPeople();
    this.closing = state === 'ending' || state === 'cleanup' || (this.ev.cancelled && state !== 'scheduled');
    if (this.peopleOn) { this.peopleUpdate(dt, state, frac); this.performersUpdate(dt, state, dist); this.downCheck(dt); }
    this.programme(dt, state); this.sounds(state, frac, night, dist); if (dist < 300) this.lights(state, night);
    this.counterBusy = this.queue.length > 0;
  }
  // someone down inside the site (knocked down, collapsed): first aid goes over, the ambulance is called through EMS
  downCheck(dt) {
    if ((this.downCd = (this.downCd || 0) - dt) > 0) return; this.downCd = 1.0; const pr = this.g.police;
    for (const p of this.crowd.peds) { if (p.state !== 'down' && !p.dead) continue; if (!this.inside(p.x, p.z, 4) || p.evAid) continue; p.evAid = true;
      const med = this.staff.filter((a) => a.role === 'medic' && a.alive() && !a.task).sort((a, b) => Math.hypot(a.p.x - p.x, a.p.z - p.z) - Math.hypot(b.p.x - p.x, b.p.z - p.z))[0];
      if (med) med.give({ kind: 'aid', x: p.x, z: p.z, p }); let amb = false; try { if (pr && pr.ems && !p.awaitMedic) amb = !!pr.ems.dispatch(p, { auto: true }); } catch (e) { /* no unit */ }
      this.mgr.note(this.ev, `Person down near the ${this.kind === 'stage' ? 'stage' : 'site'} — ${med ? 'first-aid team attending' : 'staff attending'}${amb ? ', ambulance called' : ''}.`); this.stats.aid = (this.stats.aid || 0) + 1; }
  }
  clearPeople() { this.mgr.mk('clearPeople'); // everyone here put away (only called out of view)
    for (const a of [...this.visitors, ...this.staff, ...this.crew]) { if (a.alive()) a.remove(); } for (const a of this.incoming) { if (a.p) { a.p.onArrive = null; a.p.evIncoming = null; a.p.keep = false; a.p.route = null; } } this.visitors = []; this.staff = []; this.crew = []; this.incoming = []; this.queue.length = 0;
    for (const s of this.stand) s.used = null; for (const s of this.seats) s.used = null; for (const s of this.stalls) { s.used = null; s.vendor = null; } for (const pf of this.performers) pf.dispose(); this.performers = []; this.usedSpecs.clear(); this.peopleOn = false; this.settled = false;
  }
  dispose() {
    this.disposed = true; this.clearPeople(); for (let i = 2; i >= 0; i--) if (this.shown > i) { this.col.removeList(this.tierCols[i]); } this.shown = 0;
    this.root.traverse((o) => { if (o.isMesh && o.geometry && o !== this.chairs) o.geometry.dispose(); if (o === this.chairs) o.dispose?.(); }); this.root.parent?.remove(this.root); if (this.tex) this.tex.dispose(); if (this.printMat) this.printMat.dispose(); this.tex = null; this.printMat = null;
    this.mgr.stopLoops(this.ev.id);
  }
}
