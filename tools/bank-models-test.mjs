// 77th: build every detailed bank model (src/world/BankModels.js) into plain MeshBuilders in Node and check them:
// triangle counts (budget), no NaN, seat-top heights unchanged, monitor housing behind the LCD quad, footprints.
import * as M from '../src/world/BankModels.js';
import { MeshBuilder } from '../src/gfx/MeshBuilder.js';
let fails = 0; const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fails++; };
const kit = () => { const B = new Map(); return { B, get(n) { if (!B.has(n)) B.set(n, new MeshBuilder()); return B.get(n); } }; };
const stats = (k) => { let tris = 0, nan = 0, y1 = -1e9, y0 = 1e9, z1 = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9; const per = {};
  for (const [n, b] of (k.B || new Map([['tb', k]]))) { const t = b.idx.length / 3; tris += t; per[n] = t; for (let i = 0; i < b.pos.length; i += 3) { const x = b.pos[i], y = b.pos[i + 1], z = b.pos[i + 2]; if (!Number.isFinite(x + y + z)) nan++; y1 = Math.max(y1, y); y0 = Math.min(y0, y); z1 = Math.max(z1, z); z0 = Math.min(z0, z); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } for (const v of b.nor) if (!Number.isFinite(v)) nan++; }
  return { tris, nan, y0, y1, x0, x1, z0, z1, per }; };
const T = {};
{ const k = kit(); M.officeChair(k, 0, 0, 0, 0.45); const s = stats(k); T.chair = s.tris; ok(s.nan === 0, `office chair: ${s.tris} tris, no NaN`);
  // seat top: the highest fabric vertex over the seat area (|x|<0.2, |z|<0.18) must be at `top`
  const fb = k.B.get('fabric'); let mx = -1; for (let i = 0; i < fb.pos.length; i += 3) if (Math.abs(fb.pos[i]) < 0.26 && fb.pos[i + 2] > -0.2 && fb.pos[i + 2] < 0.25 && fb.pos[i + 1] < 0.5) /* rounded boxes only have vertices at the edges */ mx = Math.max(mx, fb.pos[i + 1]); ok(Math.abs(mx - 0.45) < 0.002, `office chair seat top ${mx.toFixed(4)} = 0.45`);
  ok(s.y0 >= -0.001, `office chair stands on the floor (min y ${s.y0.toFixed(4)})`); ok(Math.max(-s.x0, s.x1, -s.z0, s.z1) < 0.36, `office chair footprint within 0.36 m (${Math.max(-s.x0, s.x1, -s.z0, s.z1).toFixed(3)})`); }
{ const k = kit(); M.officeChair(k, 0, 0, 0, 0.5, { high: true }); const s = stats(k); ok(s.nan === 0 && s.y1 > 1.2, `high-back chair: ${s.tris} tris, top ${s.y1.toFixed(2)} m`); }
{ const k = kit(); M.monitor(k, 0, 0.75, 0, 0, 0.52); const s = stats(k); T.monitor = s.tris; ok(s.nan === 0, `monitor: ${s.tris} tris`);
  const pl = k.B.get('plastic'); let zf = -1; for (let i = 0; i < pl.pos.length; i += 3) if (Math.abs(pl.pos[i]) < 0.3 && pl.pos[i + 1] > 0.75 + 0.17 && pl.pos[i + 1] < 0.75 + 0.5) /* above the chin (its buttons sit below the screen) */ zf = Math.max(zf, pl.pos[i + 2]); ok(zf <= 0.0121, `monitor housing behind the LCD quad (front ${zf.toFixed(4)} ≤ 0.012)`); }
{ const k = kit(); M.keyboard(k, 0, 0.75, 0, 0); const s = stats(k); T.keyboard = s.tris; ok(s.nan === 0, `keyboard + mouse: ${s.tris} tris`); const keys = (k.B.get('plastic').idx.length / 3 - 0); ok(keys > 1000, 'keyboard has its key caps (' + keys + ' plastic tris)'); ok(s.y0 >= 0.749, `keyboard sits on the desk (min y ${s.y0.toFixed(4)})`); }
{ const k = kit(); M.plant(k, 0, 0, 1.3); const s = stats(k); T.plant = s.tris; ok(s.nan === 0, `plant 1.3 m: ${s.tris} tris, top ${s.y1.toFixed(2)} m`); ok(s.y1 > 1.0 && s.y1 < 1.6, 'plant height plausible'); ok(Math.max(-s.x0, s.x1, -s.z0, s.z1) < 0.75, `plant spread ${Math.max(-s.x0, s.x1, -s.z0, s.z1).toFixed(2)} m`); }
{ const tb = new MeshBuilder(); M.waitingChairTop(tb); const s = stats(tb); T.waitTop = s.tris; let mx = -1; for (let i = 0; i < tb.pos.length; i += 3) if (Math.abs(tb.pos[i]) < 0.235 && tb.pos[i + 2] > -0.15 && tb.pos[i + 2] < 0.25 && tb.pos[i + 1] < 0.1) mx = Math.max(mx, tb.pos[i + 1]); ok(s.nan === 0 && Math.abs(mx) < 0.002, `waiting chair top: ${s.tris} tris, seat top ${mx.toFixed(4)} = 0`); }
{ const k = kit(); M.waitingChairBase(k.get('chrome'), k.get('plastic'), 0, 0); const s = stats(k); T.waitBase = s.tris; ok(s.nan === 0, `waiting chair base: ${s.tris} tris`); }
{ const k = kit(); M.waterDispenser(k, 0, 0); const s = stats(k); T.water = s.tris; ok(s.nan === 0 && s.y1 < 1.56, `water dispenser: ${s.tris} tris, top ${s.y1.toFixed(2)}`); ok(Math.max(-s.x0, s.x1, -s.z0, s.z1) < 0.24, `dispenser footprint ${Math.max(-s.x0, s.x1, -s.z0, s.z1).toFixed(3)}`); }
{ const k = kit(); M.ticketKiosk(k, 0, 0, [0.1, 0.2, 0.35]); const s = stats(k); T.kiosk = s.tris; ok(s.nan === 0 && Math.max(-s.x0, s.x1) <= 0.235, `kiosk: ${s.tris} tris, half-width ${Math.max(-s.x0, s.x1).toFixed(3)}`); }
{ const k = kit(); M.litterBin(k, 0, 0); const s = stats(k); T.bin = s.tris; ok(s.nan === 0 && Math.max(-s.x0, s.x1) < 0.18, `litter bin: ${s.tris} tris`); }
{ const k = kit(); M.vaultDoor(k, 0, 1.12, 0); const s = stats(k); T.vault = s.tris; ok(s.nan === 0 && s.z0 >= -0.001 && s.z1 < 0.42, `vault door: ${s.tris} tris, depth ${s.z1.toFixed(2)} m`); }
{ const b = new MeshBuilder(); M.frontShrub(b, 0, 0.62, 0, 0.22, 3); const s = stats(b); T.shrub = s.tris; ok(s.nan === 0 && s.y0 > 0.4, `facade shrub: ${s.tris} tris (bottom ${s.y0.toFixed(2)})`); }
{ const k = kit(); M.brochureRack(k, 0, 0); const s = stats(k); T.rack = s.tris; ok(s.nan === 0 && s.x1 <= 0.0001 && s.x0 > -0.22 && s.y0 > 0.79 && s.y1 < 1.71 && Math.max(-s.z0, s.z1) < 0.32, `brochure rack: ${s.tris} tris (x ${s.x0.toFixed(3)}..${s.x1.toFixed(3)}, y ${s.y0.toFixed(2)}..${s.y1.toFixed(2)})`); }
// whole-bank estimate (counts from BankInterior / BankFront): 10 office chairs, 8 monitors, 7 keyboards, 4 plants, 16 waiting tops + bases, 8 shrubs
const est = T.chair * 10 + T.monitor * 8 + T.keyboard * 7 + T.plant * 4 + (T.waitTop + T.waitBase) * 16 + T.water + T.kiosk + T.bin + T.vault + T.shrub * 8 + T.rack;
console.log('estimated added geometry for the whole bank ≈', est, 'triangles'); ok(est < 400000, 'within a 400 k triangle budget');
console.log(fails ? fails + ' FAILED' : 'ALL PASS'); process.exit(fails ? 1 : 0);
