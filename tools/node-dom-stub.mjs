// Minimal DOM/canvas stub so procedural geometry modules can run under Node for unit tests (textures are blank).
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: () => ctx }), fonts: { load: async () => {} } };
globalThis.window = globalThis;
