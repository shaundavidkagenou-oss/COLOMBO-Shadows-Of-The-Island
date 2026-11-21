// Minimal DOM/canvas stub so procedural geometry modules can run under Node for unit tests (textures are blank).
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctx }), fonts: { load: async () => {} } };
globalThis.window = globalThis;
// real-car bodies (src/vehicles/RealModels.js) read from public/assets/vehicles like the game loads them (NO_REAL_CARS=1: procedural only)
if (!process.env.NO_REAL_CARS) {
  const fs = await import('fs'); const path = await import('path'); const { fileURLToPath } = await import('url'); const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { preloadRealModels } = await import('../src/vehicles/RealModels.js');
  await preloadRealModels((t) => { const b = fs.readFileSync(path.join(root, 'public/assets/vehicles', t + '.glb')); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); });
}
