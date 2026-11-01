@echo off
setlocal EnableExtensions
title COLOMBO: Shadows of the Island - build Windows .exe
rem ---------------------------------------------------------------------------------------------
rem  Turns the whole game into Windows programs (Electron):
rem    desktop\release\COLOMBO-Shadows-of-the-Island-1.0.0-portable.exe   single file, no install
rem    desktop\release\COLOMBO-Shadows-of-the-Island-1.0.0-setup.exe      installer (Start menu + desktop shortcut)
rem  Needs: Windows 10/11 x64, Node.js 18 or newer (https://nodejs.org), an internet connection the first time
rem  (npm downloads Vite, Electron and electron-builder - about 250 MB, cached afterwards).
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
pushd desktop
call npm install --no-audit --no-fund
if errorlevel 1 (
  popd
  goto :npmfail
)

echo [5/5] Packaging the .exe files (this can take a few minutes)...
call npx electron-builder --win portable nsis --x64
if errorlevel 1 (
  popd
  echo [ERROR] Packaging failed - see the messages above.
  goto :fail
)
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

:npmfail
echo [ERROR] npm could not install the packages. Check your internet connection and try again.
:fail
echo.
pause
exit /b 1
