@echo off
setlocal EnableExtensions
title COLOMBO: Shadows of the Island - build Windows .exe
rem ---------------------------------------------------------------------------------------------
rem  Turns the whole game into Windows programs (Electron):
rem    desktop\release\COLOMBO-Shadows-of-the-Island-1.0.0-portable.exe   single file, no install
rem    desktop\release\COLOMBO-Shadows-of-the-Island-1.0.0-setup.exe      installer (Start menu + desktop shortcut)
rem  Needs: Windows 10/11 x64, Node.js 18 or newer (https://nodejs.org), an internet connection the first time
rem  (npm downloads Vite, Electron and electron-builder - about 250 MB, cached afterwards).
rem  If github.com is blocked or cannot be resolved on this network, Electron and NSIS come from the npmmirror.com mirror.
rem  Usage: double-click this file, or run it from a terminal in the project folder.
rem ---------------------------------------------------------------------------------------------
cd /d "%~dp0"

echo.
echo  ==============================================================
echo    COLOMBO: SHADOWS OF THE ISLAND  -  Windows build
echo    Shaun David Studios
echo  ==============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install the LTS version from https://nodejs.org and run this again.
  goto :fail
)
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
  echo [ERROR] Node.js 18 or newer is required - found version %NODE_MAJOR%. Update from https://nodejs.org
  goto :fail
)

echo [1/5] Installing the game's packages...
if exist package-lock.json (call npm ci --no-audit --no-fund) else (call npm install --no-audit --no-fund)
if errorlevel 1 goto :npmfail

echo [2/5] Building the game (Vite production build)...
rem  Custom sounds: recordings in the sounds\ folder (saved there by the in-game `sounds` window when the game runs with
rem  npm run dev, or unzipped from its "Export pack (.zip)") are built into the game - and so into the .exe - by this step.
set NSND=0
if exist sounds\ for %%f in (sounds\*.mp3 sounds\*.wav sounds\*.ogg) do set /a NSND+=1
if %NSND% GTR 0 (echo       Including %NSND% custom sound file^(s^) from sounds\) else (echo       No custom sounds in sounds\ - the game's own sounds are used.)
call npm run build
if errorlevel 1 (
  echo [ERROR] The game build failed - see the messages above.
  goto :fail
)

echo [3/5] Copying the build into the desktop shell...
if exist desktop\app rmdir /s /q desktop\app
xcopy /e /i /q /y dist desktop\app >nul
if errorlevel 1 (
  echo [ERROR] Could not copy dist to desktop\app.
  goto :fail
)

echo [4/5] Installing Electron and electron-builder...
rem  Electron and the NSIS packager come from GitHub. If github.com cannot be reached from this PC (DNS or network
rem  filter: "getaddrinfo ENOTFOUND github.com"), everything is fetched through the npmmirror.com mirror instead.
call :netcheck
pushd desktop
call npm install --no-audit --no-fund
if not errorlevel 1 goto :haveElectron
if defined ELECTRON_MIRROR goto :npmfailPop
echo [!] Electron could not be downloaded from GitHub - retrying through the mirror...
call :usemirror
call npm install --no-audit --no-fund
if errorlevel 1 goto :npmfailPop
:haveElectron
rem  npm skips Electron's own download when the package is already there (e.g. after an earlier failed run): make sure
rem  the Electron program itself is present
if exist "node_modules\electron\dist\electron.exe" goto :electronReady
echo Downloading the Electron runtime...
call node node_modules\electron\install.js
if exist "node_modules\electron\dist\electron.exe" goto :electronReady
if defined ELECTRON_MIRROR goto :electronReady
call :usemirror
call node node_modules\electron\install.js
:electronReady

echo [5/5] Packaging the .exe files (this can take a few minutes)...
rem  Use the Electron that npm just installed (desktop\node_modules\electron\dist), so packaging does not download it again
set "EB_DIST="
if exist "node_modules\electron\dist\electron.exe" set "EB_DIST=-c.electronDist node_modules/electron/dist"
call npx electron-builder --win portable nsis --x64 %EB_DIST%
if not errorlevel 1 goto :built
if defined ELECTRON_MIRROR goto :fallback
echo [!] Packaging needs a download from GitHub that failed - retrying through the mirror...
call :usemirror
call npx electron-builder --win portable nsis --x64 %EB_DIST%
if not errorlevel 1 goto :built
:fallback
rem  Last resort, no download at all: the unpacked game folder (default Electron icon on the .exe)
if not defined EB_DIST goto :noElectron
echo [!] The single-file / installer packager could not be downloaded. Building the unpacked game folder instead...
call npx electron-builder --win dir --x64 %EB_DIST% -c.win.signAndEditExecutable false
if errorlevel 1 goto :packfailPop
popd
echo Zipping the game folder for sharing...
powershell -NoProfile -Command "Compress-Archive -Path 'desktop\release\win-unpacked\*' -DestinationPath 'desktop\release\COLOMBO-Shadows-of-the-Island-1.0.0-win64.zip' -Force" >nul 2>nul
echo.
echo  Done (unpacked version). Your game:
echo    %CD%\desktop\release\win-unpacked\COLOMBO Shadows of the Island.exe
echo  Keep the whole win-unpacked folder together (copy or zip the folder, not just the .exe).
if exist "desktop\release\COLOMBO-Shadows-of-the-Island-1.0.0-win64.zip" echo  Zipped copy to share: %CD%\desktop\release\COLOMBO-Shadows-of-the-Island-1.0.0-win64.zip
echo  For the single-file and installer versions, run this again on a connection that can reach github.com.
echo.
if exist desktop\release\win-unpacked start "" explorer "desktop\release\win-unpacked"
pause
exit /b 0

:built
popd
echo.
echo  Done. Your game:
echo    %CD%\desktop\release\COLOMBO-Shadows-of-the-Island-1.0.0-portable.exe   (run directly)
echo    %CD%\desktop\release\COLOMBO-Shadows-of-the-Island-1.0.0-setup.exe      (installer)
echo  F11 = fullscreen.  Saves are kept between launches.
echo.
if exist desktop\release start "" explorer "desktop\release"
pause
exit /b 0

rem ---- can Node resolve github.com? If not, use the mirror from the start
:netcheck
node -e "require('dns').lookup('github.com',function(e){process.exit(e?1:0)})"
if errorlevel 1 (
  echo [!] github.com cannot be reached from this PC - downloading Electron through the npmmirror.com mirror.
  call :usemirror
)
exit /b 0

:usemirror
set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_CUSTOM_DIR={{ version }}"
set "ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/"
exit /b 0

:noElectron
popd
echo [ERROR] Packaging failed and Electron is not installed in desktop\node_modules - see the messages above.
goto :fail
:packfailPop
popd
echo [ERROR] Packaging failed - see the messages above.
goto :fail
:npmfailPop
popd
:npmfail
echo [ERROR] npm could not install the packages. Check your internet connection and try again.
:fail
echo.
pause
exit /b 1
