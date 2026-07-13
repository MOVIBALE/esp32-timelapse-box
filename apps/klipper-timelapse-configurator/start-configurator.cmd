@echo off
setlocal
cd /d "%~dp0"
set "URL=http://127.0.0.1:8776/"

where py >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON_CMD=py -3"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set "PYTHON_CMD=python"
  ) else (
    set "POWERSHELL_SERVER=%~dp0scripts\serve-static.ps1"
    if exist "%POWERSHELL_SERVER%" (
      echo Python was not found. Falling back to the bundled PowerShell localhost server.
      echo Opening %URL%
      start "" "%URL%"
      echo Serving ESP32 Timelapse Box configurator at %URL%
      echo Close this window to stop the local web server.
      powershell -NoProfile -ExecutionPolicy Bypass -File "%POWERSHELL_SERVER%" -Port 8776
      exit /b %errorlevel%
    ) else (
      echo Python was not found. Install Python 3, then run this launcher again.
      pause
      exit /b 1
    )
  )
)

echo Opening %URL%
start "" "%URL%"
echo Serving ESP32 Timelapse Box configurator at %URL%
echo Close this window to stop the local web server.
%PYTHON_CMD% -m http.server 8776 --bind 127.0.0.1
