import { defineConfig } from 'vite';
import threeUnlitProgramKeys from './tools/vite/threeUnlitProgramKeys.mjs';
import threeAsyncCompile from './tools/vite/threeAsyncCompile.mjs';
import threeProgramVariants from './tools/vite/threeProgramVariants.mjs';
import customSounds from './tools/vite/customSounds.mjs';
import texturePack from './tools/vite/texturePack.mjs';
import modelPack from './tools/vite/modelPack.mjs';
import paintPack from './tools/vite/paintPack.mjs';
import { SOUND_DEFS } from './src/audio/SoundBank.js';
export default defineConfig({
  base: './',
  define: { __COLOMBO_BUILD__: JSON.stringify(String(Date.now())) }, // build id: caches of rendered imagery (pause-map tiles) are dropped when the game changes
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  plugins: [threeUnlitProgramKeys(), threeAsyncCompile() /* 85th: draws never wait for a shader compile (src/gfx/AsyncCompile.js) */, threeProgramVariants() /* 86th: per-material program variant memo (no parameter / key rebuild when a shared material flips batched ↔ plain ↔ instanced) */, customSounds({ dir: 'sounds', knownIds: new Set(SOUND_DEFS.map((d) => d.id)) }), texturePack({ dir: 'texture-pack' }), modelPack({ dir: 'model-pack' }), paintPack({ dir: 'paint-pack' }) /* environment editor (console `paint`): placed + painted scenery, compiled into the game */], // sounds/ = the player's replacement recordings (console: sounds), built into dist and the .exe
  optimizeDeps: { exclude: ['three'] }, // dev server: serve three through the plugin (pre-bundling would skip the patch)
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 0 },
});
