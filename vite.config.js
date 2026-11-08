import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  define: { __COLOMBO_BUILD__: JSON.stringify(String(Date.now())) }, // build id: caches of rendered imagery (pause-map tiles) are dropped when the game changes
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 0 },
});
