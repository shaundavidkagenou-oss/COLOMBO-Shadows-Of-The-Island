// Coat / jacket fit (node, no browser): every wardrobe coat on every protagonist must sit OUTSIDE the shirt and trousers
// under it (same body vertex, same skin weights → the gap holds in every pose) and nothing may stray from the body.
// Usage: node tools/coat-fit-test.mjs
import { buildBodyGeometry, HEROES } from '../src/actors/Character.js';
import { applyLook, CATALOGUE } from '../src/actors/Wardrobe.js';
let D = null; globalThis.__coatFitProbe = (d) => { D = d; };
let fails = 0; const lines = [];
for (const hero of ['dineth', 'shashika', 'david']) for (const it of CATALOGUE.coats) {
  const sp = applyLook(HEROES[hero], { coat: it.id }); D = null; const g = buildBodyGeometry(sp);
  if (!D) { fails++; lines.push(`FAIL ${hero} ${it.id}: no coat shell`); continue; }
  const { cc, sh, tr, P, N, NU } = D; let worst = 1, far = 0;
  const off = (G, u) => (G.Q[u * 3] - P[u * 3]) * N[u * 3] + (G.Q[u * 3 + 1] - P[u * 3 + 1]) * N[u * 3 + 1] + (G.Q[u * 3 + 2] - P[u * 3 + 2]) * N[u * 3 + 2];
  for (let u = 0; u < NU; u++) { if (!cc.used[u]) continue; const d = Math.hypot(cc.Q[u * 3] - P[u * 3], cc.Q[u * 3 + 1] - P[u * 3 + 1], cc.Q[u * 3 + 2] - P[u * 3 + 2]); if (d > 0.12 && P[u * 3 + 1] < 1.455) far++; // (neck vertices above the cut are flattened onto it: they move further by design)
    if (P[u * 3 + 1] > 1.455) continue; // above the level neck cut (flattened under the collar band)
    for (const G of [sh, tr]) if (G.used[u]) worst = Math.min(worst, off(cc, u) - off(G, u)); }
  const ok = worst >= 0.004 && far === 0 && g.attributes.position.count > 0; if (!ok) fails++;
  lines.push(`${ok ? 'ok  ' : 'FAIL'} ${hero} ${it.id}: min gap over shirt/trousers ${(worst * 1000).toFixed(1)} mm, stray vertices ${far}`);
}
console.log(lines.join('\n')); console.log(fails ? `FAILED ${fails}` : `ALL OK (${lines.length})`); process.exit(fails ? 1 : 0);
