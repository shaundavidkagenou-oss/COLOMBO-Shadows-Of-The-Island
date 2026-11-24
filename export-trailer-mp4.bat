@echo off
setlocal EnableExtensions
title COLOMBO: Shadows of the Island - export the cinematic trailer to MP4
rem ---------------------------------------------------------------------------------------------
rem  Exports the OFFICIAL CINEMATIC TRAILER (the real in-engine trailer, 146 s) to a high-quality MP4:
rem    COLOMBO-Official-Cinematic-Trailer-1080p60.mp4   (in this folder)
rem  The trailer is rendered frame by frame by the game itself in Chrome or Edge (already on Windows 10/11), so the video is
rem  perfectly smooth whatever the PC's speed; the score, dialogue and effects are rendered in sync and added as AAC sound.
rem  Default: 1920x1080, 60 fps, Ultra graphics, H.264 CRF 16. Takes roughly 15-40 minutes on a GTX 1660 class PC.
rem  Needs: Node.js 18 or newer (https://nodejs.org), Chrome or Edge, an internet connection the first time
rem  (npm downloads Vite, puppeteer-core and a static ffmpeg build - about 90 MB, cached afterwards).
rem  Options (added after the file name in a terminal), for example:
rem    export-trailer-mp4.bat --fps 30
rem    export-trailer-mp4.bat --width 2560 --height 1440 --quality ultra
rem    export-trailer-mp4.bat --lossless --crf 12          (PNG frames, larger file)
rem    export-trailer-mp4.bat --nobuild                    (reuse the last build in dist\)
rem    export-trailer-mp4.bat --show                       (a visible browser window, if the GPU is not used headless)
rem    export-trailer-mp4.bat --browser "C:\Program Files\Google\Chrome\Application\chrome.exe"
rem ---------------------------------------------------------------------------------------------
cd /d "%~dp0"

echo.
echo  ==============================================================
echo    COLOMBO: SHADOWS OF THE ISLAND  -  trailer export (MP4)
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

set NOBUILD=0
set ARGS=
:args
if "%~1"=="" goto :argsdone
if /i "%~1"=="--nobuild" (set NOBUILD=1) else (set ARGS=%ARGS% %1)
shift
goto :args
:argsdone

if not exist node_modules\vite (
  echo [1/4] Installing the game's packages...
  if exist package-lock.json (call npm ci --no-audit --no-fund) else (call npm install --no-audit --no-fund)
  if errorlevel 1 goto :npmfail
) else (
  echo [1/4] The game's packages are installed.
)

if "%NOBUILD%"=="1" if exist dist\index.html (
  echo [2/4] Using the existing build in dist\
  goto :built
)
echo [2/4] Building the game (Vite production build)...
call npm run build
if errorlevel 1 (
  echo [ERROR] The game build failed - see the messages above.
  goto :fail
)
:built

echo [3/4] Installing the exporter (puppeteer-core, ffmpeg)...
call npm install --prefix tools\trailer-export --no-audit --no-fund
if errorlevel 1 goto :npmfail

echo [4/4] Exporting the trailer - the progress is shown below. Close this window or press Ctrl+C to cancel.
echo.
node tools\trailer-export\export.mjs %ARGS%
if errorlevel 1 (
  echo.
  echo [ERROR] The export did not finish - see the messages above.
  goto :fail
)
echo.
for %%f in (COLOMBO-Official-Cinematic-Trailer-*.mp4) do set LAST=%%f
if defined LAST explorer /select,"%~dp0%LAST%"
pause
exit /b 0

:npmfail
echo [ERROR] npm could not install the packages. Check the internet connection and run this again.
goto :fail

:fail
echo.
pause
exit /b 1
