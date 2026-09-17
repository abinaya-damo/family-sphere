@echo off
setlocal
cd /d "%~dp0"
title Family Sphere v244

echo ==============================================
echo Family Sphere v244 - local server launcher
echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not in PATH.
  echo Install Node.js 22 LTS or newer, then run this file again.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo ERROR: .env.local is missing.
  echo Copy your working .env.local from the previous Family Sphere project
  echo into this folder, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\next.cmd" (
  echo Installing dependencies for this fresh folder...
  call npm.cmd ci
  if errorlevel 1 (
    echo.
    echo INSTALL FAILED.
    echo Close any old Family Sphere terminal/browser dev server and run
    echo this project from a NEW extracted folder. Do not copy node_modules.
    pause
    exit /b 1
  )
)

echo Starting Family Sphere...
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"
call npm.cmd run dev
endlocal
