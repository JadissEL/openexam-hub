@echo off
setlocal
set "OEH_ROOT=%~dp0"
set "OEH_TRACKER_PORT=5179"
set "URL=http://127.0.0.1:5179/tracker.html"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required to open the OpenExam Hub tracker.
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%OEH_ROOT%launch-tracker.ps1"
exit /b 0
