@echo off
setlocal EnableExtensions
title COLOMBO: Shadows of the Island - build installation CD
rem ---------------------------------------------------------------------------------------------
rem  Turns the whole game into an installation CD, branded with the COLOMBO: Shadows of the Island logo:
rem    desktop\release\CD\                       the files to put on the disc:
rem        setup.exe     the game installer (logo as icon, on the installer pages, splash, shortcuts, uninstaller)
rem        autorun.inf   Windows shows "Install COLOMBO: Shadows of the Island" + the logo icon for the disc
rem        Start.hta     disc menu with the logo (Install / Read me / Browse / Exit)
rem        autorun.ico, logo.png, README.txt
rem    desktop\release\COLOMBO-Shadows-of-the-Island-CD.iso   the same files as a disc image - burn it with
rem                                                          Windows (right-click the .iso, Burn disc image)
rem  Whoever puts the disc in a Windows PC can install the game: Start menu + desktop shortcut, the disc is not needed
rem  to play afterwards.
rem  Needs: Windows 10/11 x64, Node.js 18 or newer (https://nodejs.org), an internet connection the first time
rem  (npm downloads Vite, Electron and electron-builder - about 250 MB, cached afterwards).
rem  If github.com is blocked or cannot be resolved on this network, Electron and NSIS come from the npmmirror.com mirror.
rem  Usage: double-click this file, or run it from a terminal in the project folder.
rem ---------------------------------------------------------------------------------------------
cd /d "%~dp0"
set "CDDIR=desktop\release\CD"
set "ISO=desktop\release\COLOMBO-Shadows-of-the-Island-CD.iso"
set "BRAND=desktop\build\cd"

echo.
echo  ==============================================================
echo    COLOMBO: SHADOWS OF THE ISLAND  -  installation CD
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
for %%f in (icon.ico icon.png logo.png installerHeader.bmp installerSidebar.bmp splash.bmp installer.nsh make-iso.ps1 disc\autorun.inf disc\Start.hta disc\README.txt) do (
  if not exist "%BRAND%\%%f" (
    echo [ERROR] %BRAND%\%%f is missing - the CD logo files must be in desktop\build\cd.
    goto :fail
  )
)

echo [1/7] Installing the game's packages...
if exist package-lock.json (call npm ci --no-audit --no-fund) else (call npm install --no-audit --no-fund)
if errorlevel 1 goto :npmfail

echo [2/7] Building the game (Vite production build)...
rem  Custom sounds (sounds\), Texture Studio replacements (texture-pack\) and the environment editor scene (paint-pack\)
rem  are built into the game by this step - exactly as build-exe.bat does.
set NSND=0
if exist sounds\ for %%f in (sounds\*.mp3 sounds\*.wav sounds\*.ogg) do set /a NSND+=1
if %NSND% GTR 0 (echo       Including %NSND% custom sound file^(s^) from sounds\) else (echo       No custom sounds in sounds\ - the game's own sounds are used.)
call node tools\texture-pack-prep.mjs
call node tools\paint-pack-prep.mjs
if errorlevel 1 (
  echo [ERROR] The environment editor scene has errors - see the report above. Fix them in the editor ^(console: paint^), then run this again.
  goto :fail
)
call npm run build
if errorlevel 1 (
  echo [ERROR] The game build failed - see the messages above.
  goto :fail
)

echo [3/7] Copying the build into the desktop shell...
if exist desktop\app rmdir /s /q desktop\app
xcopy /e /i /q /y dist desktop\app >nul
if errorlevel 1 (
  echo [ERROR] Could not copy dist to desktop\app.
  goto :fail
)

echo [4/7] Installing Electron and electron-builder...
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
if exist "node_modules\electron\dist\electron.exe" goto :electronReady
echo Downloading the Electron runtime...
call node node_modules\electron\install.js
if exist "node_modules\electron\dist\electron.exe" goto :electronReady
if defined ELECTRON_MIRROR goto :electronReady
call :usemirror
call node node_modules\electron\install.js
:electronReady

echo [5/7] Building the installer with the COLOMBO logo (this can take a few minutes)...
if exist release\cd-build rmdir /s /q release\cd-build
call node cd-installer.cjs
if not errorlevel 1 goto :installerBuilt
if defined ELECTRON_MIRROR goto :retryNoEdit
echo [!] The installer builder needs a download from GitHub that failed - retrying through the mirror...
call :usemirror
call node cd-installer.cjs
if not errorlevel 1 goto :installerBuilt
:retryNoEdit
rem  Last try: skip the step that writes the icon / version into the game's .exe (it needs one more download). The
rem  installer, its pages, the shortcuts and the disc still carry the logo.
echo [!] Retrying without editing the game .exe's embedded icon...
set "COLOMBO_NO_EXE_EDIT=1"
call node cd-installer.cjs
if errorlevel 1 goto :packfailPop
:installerBuilt
popd
set "SETUP="
for %%f in (desktop\release\cd-build\*-cd-setup.exe) do set "SETUP=%%f"
if not defined SETUP (
  echo [ERROR] The installer was not created - see the messages above.
  goto :fail
)

echo [6/7] Putting the CD together...
if exist "%CDDIR%" rmdir /s /q "%CDDIR%"
mkdir "%CDDIR%"
copy /y "%SETUP%" "%CDDIR%\setup.exe" >nul || goto :copyfail
copy /y "%BRAND%\icon.ico" "%CDDIR%\autorun.ico" >nul || goto :copyfail
copy /y "%BRAND%\logo.png" "%CDDIR%\logo.png" >nul || goto :copyfail
copy /y "%BRAND%\disc\autorun.inf" "%CDDIR%\autorun.inf" >nul || goto :copyfail
copy /y "%BRAND%\disc\Start.hta" "%CDDIR%\Start.hta" >nul || goto :copyfail
copy /y "%BRAND%\disc\README.txt" "%CDDIR%\README.txt" >nul || goto :copyfail

echo [7/7] Making the disc image (.iso)...
set "ISOOK="
powershell -NoProfile -ExecutionPolicy Bypass -File "%BRAND%\make-iso.ps1" -Source "%CDDIR%" -Iso "%ISO%" -Label "COLOMBO"
if not errorlevel 1 if exist "%ISO%" set "ISOOK=1"
if not defined ISOOK echo [!] The .iso image could not be made on this PC - burn the files in %CDDIR% instead ^(see below^).

echo.
echo  ==============================================================
echo   Done. Your installation CD:
echo  ==============================================================
if defined ISOOK echo   Disc image : %CD%\%ISO%
if defined ISOOK echo                Right-click it ^> "Burn disc image", or use any burning program.
echo   CD files   : %CD%\%CDDIR%\
echo                Or burn these files straight onto the disc ^(File Explorer: select them all ^>
echo                right-click ^> Send to ^> DVD RW Drive, "With a CD/DVD player" - then "Finish burning"^).
echo                Copying them to a USB stick works the same way.
echo.
echo   On the other PC: insert the disc ^> "Install COLOMBO: Shadows of the Island" ^(or open the disc and
echo   double-click Start.hta or setup.exe^). The game installs with Start menu + desktop shortcuts.
echo.
start "" explorer "%CD%\desktop\release"
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

:copyfail
echo [ERROR] Could not copy the files into %CDDIR%.
goto :fail
:packfailPop
popd
echo [ERROR] The installer could not be built - see the messages above. It needs the NSIS installer tools, which
echo         electron-builder downloads from github.com ^(or the npmmirror.com mirror^) the first time.
goto :fail
:npmfailPop
popd
:npmfail
echo [ERROR] npm could not install the packages. Check your internet connection and try again.
:fail
echo.
pause
exit /b 1
