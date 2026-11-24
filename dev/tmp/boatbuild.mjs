import { boatModel, sailGeometry } from '../../src/boats/BoatModels.js';
import { BOATS } from '../../src/boats/BoatCatalog.js';
let bad = 0;
for (const id of Object.keys(BOATS)) {
  try { const m = boatModel(id); const p = m.geo.attributes.position.array; let nan = 0; for (const v of p) if (!Number.isFinite(v)) nan++;
    const bb = m.geo.boundingBox; const k = {}; for (const l of m.lights) k[l.kind] = (k[l.kind] || 0) + 1;
    console.log(id.padEnd(12), 'tris', String(Math.round(m.tris)).padStart(6), 'nan', nan, 'bb', [bb.min.x, bb.max.x, bb.min.y, bb.max.y, bb.min.z, bb.max.z].map((v) => v.toFixed(2)).join(' '), 'sails', m.sails.length, JSON.stringify(k));
    for (const s of m.sails) { const g = sailGeometry(s); if (g.attributes.position.array.some((v) => !Number.isFinite(v))) { console.log('  sail NaN', s.id); bad++; } }
    if (nan) bad++;
  } catch (e) { bad++; console.log(id, 'ERR', e.stack.split('\n').slice(0, 3).join(' | ')); }
}
console.log('bad', bad);
