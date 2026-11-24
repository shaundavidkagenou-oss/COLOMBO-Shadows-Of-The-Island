// Environment editor scene in the game (dev server and the built game / .exe): paint-pack/scene.json (COMPILE output — in
// dev the saved project compiled on the fly by tools/vite/paintPack.mjs) → a PaintField in the world. Loaded only when a
// scene exists (src/debug/boot.js bootPaint); without one the game never downloads this module.
import { PaintField } from './PaintField.js';
import { SCENE_FORMAT, cleanAsset, cleanLayers, unpackInstances } from './PaintFormat.js';

export async function build(world, scene) {
  if (!scene || scene.format !== SCENE_FORMAT) return null;
  const layers = cleanLayers(scene.layers); const assets = {}; for (const [id, a] of Object.entries(scene.assets || {})) { const c = cleanAsset({ ...a, id }, layers); if (c) assets[id] = c; }
  const { list, bad } = unpackInstances(scene.instances, new Set(Object.keys(assets)), new Set(layers.map((l) => l.id))); if (bad) console.warn('[paint] ' + bad + ' instance(s) skipped (invalid)');
  const F = attach(world); await Promise.all(Object.values(assets).map((a) => F.setAsset(a)));
  F.addMany(list); F.flushColliders(); return F;
}
// the world's field (one per world: the editor reuses it)
export function attach(world) {
  if (world.paint) return world.paint;
  const F = new PaintField({ collision: world.collision, quality: world.quality || 'high' }); world.root.add(F.group); world.paint = F; return F;
}
