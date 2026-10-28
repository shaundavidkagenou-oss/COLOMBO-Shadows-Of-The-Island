// Entry point. Fonts are bundled locally via Fontsource (SIL OFL) so Sinhala/Tamil text renders correctly offline.
import '@fontsource/noto-sans-sinhala/400.css';
import '@fontsource/noto-sans-sinhala/600.css';
import '@fontsource/noto-sans-tamil/400.css';
import '@fontsource/noto-sans-tamil/600.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/700.css';
import './styles.css';
import { Game } from './Game.js';

function webglOK() { try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; } }
const app = document.getElementById('app');
if (!webglOK()) {
  app.innerHTML = '<div class="fatal"><h1>WebGL 2 is required</h1><p>Please use a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p></div>';
} else {
  const game = new Game(app); window.__game = game;
  game.boot().catch((e) => { console.error(e); app.insertAdjacentHTML('beforeend', `<div class="fatal"><h1>Something went wrong</h1><pre>${String(e && e.stack || e).replace(/</g, '&lt;')}</pre></div>`); });
}
