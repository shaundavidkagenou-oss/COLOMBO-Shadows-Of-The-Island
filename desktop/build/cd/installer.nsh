; COLOMBO: Shadows of the Island - CD installer additions (desktop/cd-builder.json, build-cd.bat)
; The game logo fills the screen for a moment when the setup program starts; the installer pages then show it in their
; sidebar (welcome / finish) and header. Skipped for silent installs, and left out at compile time if the NSIS copy that
; electron-builder downloaded has no AdvSplash plugin (the sidebar / header / icons carry the logo either way).
!macro customInit
  !if /FileExists "${NSISDIR}\Plugins\x86-unicode\advsplash.dll"
    IfSilent colomboSplashDone
    InitPluginsDir
    File "/oname=$PLUGINSDIR\colombo-splash.bmp" "${BUILD_RESOURCES_DIR}\cd\splash.bmp"
    advsplash::show 2600 500 400 -1 "$PLUGINSDIR\colombo-splash"
    Pop $0
    colomboSplashDone:
  !endif
!macroend
