import { BoatBuilder, Hull } from '../../src/boats/BoatGeo.js';
const bb = new BoatBuilder(); const H = new Hull({ L: 8, B: 2.6, T: 0.48, Ft: 0.92, Fm: 1.0, Fb: 1.32, dr0: 0.4, dr1: 0.95, tw: 0.86, fine: 1.8, rake: 0.75, flare: 0.1, keelRise: 0.62 }); H.build(bb, { col: '#fff' });
const g = bb.build(); const p = g.attributes.position.array; let st = { pz: -1e9, nz: -1e9, pzmin: 1e9, nzmin: 1e9 };
for (let i = 0; i < p.length; i += 3) { const x = p[i], z = p[i + 2]; if (x > 1e-4) { st.pz = Math.max(st.pz, z); st.pzmin = Math.min(st.pzmin, z); } if (x < -1e-4) { st.nz = Math.max(st.nz, z); st.nzmin = Math.min(st.nzmin, z); } }
console.log(st, g.attributes.position.count, g.index.count);
for (const [k, m] of bb.parts) console.log('part', k, m.vcount);
const I = g.index.array; let cp = 0, cn = 0, ap = 0, an = 0;
for (let t = 0; t < I.length; t += 3) { let cx = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += p[I[t + k] * 3]; cz += p[I[t + k] * 3 + 2]; } cx /= 3; cz /= 3; if (cz > 2.5) { if (cx > 0.02) cp++; if (cx < -0.02) cn++; } if (cz < -2.5) { if (cx > 0.02) ap++; if (cx < -0.02) an++; } }
console.log('bow tris +x', cp, '-x', cn, 'stern +x', ap, '-x', an);
import { boatModel } from '../../src/boats/BoatModels.js';
const M = boatModel('dondra26'); const G = M.geo; const P = G.attributes.position.array, A = G.attributes.aMat.array, J = G.index.array; let c1 = 0, c2 = 0;
for (let t = 0; t < J.length; t += 3) { if (A[J[t]] !== 1) continue; let cx = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += P[J[t + k] * 3]; cz += P[J[t + k] * 3 + 2]; } cx /= 3; cz /= 3; if (cz > 2.5) { if (cx > 0.02) c1++; if (cx < -0.02) c2++; } }
console.log('model hull bow tris +x', c1, '-x', c2, 'hull verts', [...A].filter((a) => a === 1).length);
