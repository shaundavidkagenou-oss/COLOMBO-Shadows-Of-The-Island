globalThis.addEventListener = () => {}; globalThis.window = globalThis;
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ getContext: () => ctx2d, style: {}, width: 1, height: 1 }), addEventListener() {} };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; globalThis.matchMedia = () => ({ matches: false, addEventListener() {} }); globalThis.requestAnimationFrame = () => 0;
