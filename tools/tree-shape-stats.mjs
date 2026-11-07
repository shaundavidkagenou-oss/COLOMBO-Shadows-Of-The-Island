// Per-shape triangle counts (hi / lo LOD) of every tree and plant: node tools/tree-shape-stats.mjs
import './node-dom-stub.mjs';
const TS = await import('../src/world/TreeShapes.js');
const t0 = performance.now(); const S = TS.treeShapes(); const P = TS.plantShapes(); console.log('build ms', (performance.now()-t0).toFixed(0));
const tri = (g) => g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0;
for (const [k, d] of Object.entries({ ...S, ...P })) console.log(k.padEnd(11), d.parts.map((p) => `${p.mat}:${tri(p.hi)}/${tri(p.lo)}`).join('  '), d.crown ? 'pts ' + TS.crownPoints(k).length / 3 : '');
