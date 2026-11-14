// NPC body cost: builds every crowd look (hi + lo body, head) like Crowd.prepareSpecs and reports vertex memory + build ms.
// Run: node --expose-gc tools/npc-body-cost.mjs
import './node-dom-stub.mjs';
globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const { Character, randomSpec } = await import('../src/actors/Character.js');
const { PRESETS } = await import('../src/actors/Appearance.js');
const bytes = (g) => { let b = 0; for (const k in g.attributes) b += g.attributes[k].array.byteLength; if (g.index) b += g.index.array.byteLength; for (const k in g.morphAttributes) for (const a of g.morphAttributes[k]) b += a.array.byteLength; return b; };
let tot = 0, n = 0; const t0 = performance.now();
for (let k = 0; k < PRESETS.length + 8; k++) { const sp = randomSpec(9000 + k * 17, k < PRESETS.length ? { preset: PRESETS[k].id } : {}); const c = new Character(sp); const h = bytes(c.mesh.geometry), l = c.geoLo ? bytes(c.geoLo) : 0; tot += h + l; n++; if (k < 3) console.log(sp.preset, 'hi', (h / 1e6).toFixed(2), 'MB', c.mesh.geometry.attributes.position.count, 'v; lo', (l / 1e6).toFixed(2), 'MB', Object.keys(c.mesh.geometry.attributes).map((a) => a + ':' + c.mesh.geometry.attributes[a].itemSize + (c.mesh.geometry.attributes[a].array.constructor.name[0])).join(' ')); c.dispose(); }
console.log('looks', n, 'total', (tot / 1e6).toFixed(1), 'MB', 'build ms/look', ((performance.now() - t0) / n).toFixed(1));
const mu = () => { const m = process.memoryUsage(); return `rss ${(m.rss / 1e6).toFixed(0)} heap ${(m.heapUsed / 1e6).toFixed(0)} ab ${(m.arrayBuffers / 1e6).toFixed(0)}`; };
console.log('after build', mu()); if (global.gc) { global.gc(); console.log('after gc', mu()); }
