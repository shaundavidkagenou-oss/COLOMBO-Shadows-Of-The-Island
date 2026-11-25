// COLOMBO: Shadows of the Island - builds the CD installer (called by build-cd.bat in the project folder).
// It is the same Electron game as build-exe.bat makes (package.json "build"), packaged as one NSIS setup program that is
// branded with the game logo: the logo as the program / shortcut / installer / uninstaller icon, on the welcome and finish
// pages (sidebar), on every other page (header) and as a splash when setup starts (build/cd/: generated from logo.png).
// Usage: node cd-installer.cjs            (from the desktop folder; electron-builder must be installed there)
const path = require('path');
const fs = require('fs');
const builder = require('electron-builder');

const dir = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
const base = pkg.build || {};
const res = (f) => 'build/cd/' + f;
for (const f of ['icon.ico', 'installerHeader.bmp', 'installerSidebar.bmp', 'splash.bmp', 'installer.nsh']) {
  if (!fs.existsSync(path.join(dir, res(f)))) { console.error(`[ERROR] desktop/${res(f)} is missing.`); process.exit(1); }
}
const config = {
  ...base,
  // the logo also becomes the game window / taskbar icon (main.cjs reads "colomboIcon")
  files: [...(base.files || ['main.cjs', 'app/**/*']), res('icon.png')],
  extraMetadata: { colomboIcon: res('icon.png') },
  publish: null,
  directories: { ...(base.directories || {}), output: 'release/cd-build', buildResources: 'build' },
  win: { ...(base.win || {}), icon: res('icon.ico'), target: [{ target: 'nsis', arch: ['x64'] }] },
  nsis: {
    ...(base.nsis || {}),
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    artifactName: 'COLOMBO-Shadows-of-the-Island-${version}-cd-setup.exe',
    shortcutName: 'COLOMBO Shadows of the Island',
    uninstallDisplayName: 'COLOMBO: Shadows of the Island',
    installerIcon: res('icon.ico'),
    uninstallerIcon: res('icon.ico'),
    installerHeader: res('installerHeader.bmp'),
    installerSidebar: res('installerSidebar.bmp'),
    uninstallerSidebar: res('installerSidebar.bmp'),
    include: res('installer.nsh'),
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    menuCategory: 'Shaun David Studios',
    runAfterFinish: true,
    differentialPackage: false,
  },
};
delete config.portable;
// the Electron runtime npm already installed (no second download); build-cd.bat sets COLOMBO_NO_EXE_EDIT=1 only for the
// last-resort retry without the icon/version editing step
const dist = path.join(dir, 'node_modules', 'electron', 'dist');
if (fs.existsSync(path.join(dist, 'electron.exe'))) config.electronDist = dist;
if (process.env.COLOMBO_NO_EXE_EDIT) config.win.signAndEditExecutable = false;

builder.build({ projectDir: dir, targets: builder.Platform.WINDOWS.createTarget(['nsis'], builder.Arch.x64), config })
  .then((files) => { for (const f of files) console.log('  built: ' + f); })
  .catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
