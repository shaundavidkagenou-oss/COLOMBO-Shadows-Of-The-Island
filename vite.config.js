import { defineConfig } from 'vite';
import threeUnlitProgramKeys from './tools/vite/threeUnlitProgramKeys.mjs';
import customSounds from './tools/vite/customSounds.mjs';
import { SOUND_DEFS } from './src/audio/SoundBank.js';
export default defineConfig({
  base: './',
  define: { __COLOMBO_BUILD__: JSON.stringify(String(Date.now())) }, // build id: caches of rendered imagery (pause-map tiles) are dropped when the game changes
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  plugins: [threeUnlitProgramKeys(), customSounds({ dir: 'sounds', knownIds: new Set(SOUND_DEFS.map((d) => d.id)) })], // sounds/ = the player's replacement recordings (console: sounds), built into dist and the .exe
  optimizeDeps: { exclude: ['three'] }, // dev server: serve three through the plugin (pre-bundling would skip the patch)
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 0 },
});
