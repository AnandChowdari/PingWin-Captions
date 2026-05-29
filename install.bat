@echo off
title PingWin Captions Installer
color 0B

echo =========================================================
echo          P I N G W I N   C A P T I O N S
echo.
echo     Adobe After Effects and Premiere Pro CEP Extension
echo                Windows Installer
echo =========================================================
echo.

set "EXT_DIR=%APPDATA%\Adobe\CEP\extensions\com.pingwin.captions"
set "SOURCE_DIR=%~dp0"

echo [INFO] Target: "%EXT_DIR%"
echo [INFO] Source: "%SOURCE_DIR%"
echo.

echo [STEP 1/3] Creating directories...
if not exist "%EXT_DIR%" mkdir "%EXT_DIR%"
if not exist "%EXT_DIR%\CSXS" mkdir "%EXT_DIR%\CSXS"
if not exist "%EXT_DIR%\lib" mkdir "%EXT_DIR%\lib"
echo [OK] Directories ready.
echo.

echo [STEP 2/3] Copying files...
xcopy /y /q "%SOURCE_DIR%CSXS\*.*" "%EXT_DIR%\CSXS\" >nul
xcopy /y /q "%SOURCE_DIR%lib\*.*" "%EXT_DIR%\lib\" >nul
copy /y "%SOURCE_DIR%index.html" "%EXT_DIR%\index.html" >nul
copy /y "%SOURCE_DIR%style.css" "%EXT_DIR%\style.css" >nul
copy /y "%SOURCE_DIR%main.js" "%EXT_DIR%\main.js" >nul
copy /y "%SOURCE_DIR%host.jsx" "%EXT_DIR%\host.jsx" >nul
copy /y "%SOURCE_DIR%.debug" "%EXT_DIR%\.debug" >nul
if exist "%SOURCE_DIR%logo.png" copy /y "%SOURCE_DIR%logo.png" "%EXT_DIR%\logo.png" >nul
echo [OK] Files copied.
echo.

echo [STEP 3/3] Setting registry keys for CEP debug mode...
reg add "HKCU\Software\Adobe\CSXS.9" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
reg add "HKCU\Software\Adobe\CSXS.10" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
echo [OK] Registry updated.
echo.

color 0A
echo =========================================================
echo   INSTALLATION COMPLETED SUCCESSFULLY!
echo =========================================================
echo.
echo Launch After Effects or Premiere Pro.
echo Go to: Window -- Extensions -- PingWin Captions
echo.
pause