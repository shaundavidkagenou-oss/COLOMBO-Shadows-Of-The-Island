// 75th: prints every PC against its desk (desk-local monitor / keyboard positions) — node tools/pc-fit-check.mjs
import { FURNITURE } from '../src/world/HospitalPlan.js';
const toL = (it, u, v) => { const c = Math.cos(it[4] || 0), s = Math.sin(it[4] || 0); const du = u - it[2], dv = v - it[3]; return [du * c - dv * s, du * s + dv * c]; };
const pcs = FURNITURE.filter((f) => f[0] === 'pc'); let bad = 0;
for (const pc of pcs) { let desk = null, bd = 9; for (const it of FURNITURE) if (['desk', 'counter', 'nurseDesk'].includes(it[0]) && it[1] === pc[1]) { const d = Math.hypot(it[2] - pc[2], it[3] - pc[3]); if (d < bd) { bd = d; desk = it; } }
  const c = Math.cos(pc[4]), s = Math.sin(pc[4]); const kb = [pc[2] + 0.26 * s, pc[3] + 0.26 * c]; const m = toL(desk, pc[2], pc[3]), k = toL(desk, kb[0], kb[1]);
  const isDesk = desk[0] === 'desk'; const w = (desk[5] && desk[5].w) || (isDesk ? 1.4 : 4); const z0 = isDesk ? -0.35 : -0.48, z1 = isDesk ? 0.35 : 0.05;
  const ok = [m, k].every(([x, z]) => x > -w / 2 && x < w / 2 && z > z0 && z < z1); if (!ok) bad++;
  console.log(desk[0], pc[1], 'monitor', m.map((q) => q.toFixed(2)).join(','), 'kbd', k.map((q) => q.toFixed(2)).join(','), ok ? 'OK' : 'OFF THE WORKTOP'); }
console.log('pcs', pcs.length, 'bad', bad); process.exit(bad ? 1 : 0);
