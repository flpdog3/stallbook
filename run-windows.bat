@echo off
REM ---------------------------------------------------------------
REM  Stallbook - run it on this Windows PC.
REM  Double-click this file. Keep the black window open while you
REM  use the app; closing it stops the server.
REM ---------------------------------------------------------------
setlocal
cd /d "%~dp0"
set PORT=8899

REM find a Python launcher
set PY=
where python >nul 2>nul && set PY=python
if not defined PY where py >nul 2>nul && set PY=py -3

if not defined PY (
  echo.
  echo  Python was not found on this PC.
  echo.
  echo  Either install it from https://www.python.org/downloads/
  echo  ^(tick "Add python.exe to PATH" during setup^), or if you have
  echo  Node installed run this instead:   npx serve -l %PORT%
  echo.
  pause
  exit /b 1
)

echo.
echo   Stallbook is running at:  http://localhost:%PORT%/index.html
echo   Opening your browser...
echo.
echo   Keep this window open. Close it to stop the server.
echo.

start "" /b cmd /c "timeout /t 2 /nobreak >nul & explorer http://localhost:%PORT%/index.html"
%PY% -m http.server %PORT%
