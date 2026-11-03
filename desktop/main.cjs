// COLOMBO: Shadows of the Island — desktop shell (Electron).
// The game is the same Vite build that runs in the browser (copied into ./app by build-exe.bat). It is served through a
// private app:// scheme rather than file:// or a random localhost port, so the page has one fixed origin: save games
// (localStorage) survive between launches, and ES modules / fonts / workers load exactly as they do on a web server.
const { app, BrowserWindow, protocol, net, Menu, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, 'app');
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }]);

// Run everything that can run on the graphics card on it:
//  · ignore-gpu-blocklist — keep hardware WebGL 2 even on drivers Chromium blocklists (never fall back to CPU SwiftShader)
//  · force_high_performance_gpu — on dual-GPU machines pick the dedicated card instead of the integrated one
//  · enable-gpu-rasterization / enable-zero-copy — the HUD, menus and text are rasterised on the GPU and uploaded without
//    a CPU copy
//  · disable-renderer-backgrounding — the game is not throttled when the window loses focus for a moment
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
// Windows decides which adapter an app uses from its per-app graphics preference (Settings › System › Display › Graphics).
// Writing "GpuPreference=2" (High performance) for this exe into the current user's key is exactly what that settings page
// does — no admin rights needed. It takes effect from the next launch (the GPU process of this run has already started).
if (process.platform === 'win32' && app.isPackaged) {
  try {
    const { execFile } = require('child_process');
    execFile('reg', ['add', 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences', '/v', process.execPath, '/t', 'REG_SZ', '/d', 'GpuPreference=2;', '/f'], { windowsHide: true }, () => {});
  } catch { /* preference is a bonus; the switches above still apply */ }
}
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 600, backgroundColor: '#000000', show: false,
    title: 'COLOMBO: Shadows of the Island', icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // F11 toggles fullscreen, Ctrl+Shift+I opens DevTools (bug reports); no other browser chrome
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (input.control && input.shift && input.key.toLowerCase() === 'i') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL('app://colombo/index.html');
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle('app', (req) => {
    const u = new URL(req.url); let rel = decodeURIComponent(u.pathname); if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response('forbidden', { status: 403 }); // no escaping the game folder
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
