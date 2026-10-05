@echo off
rem Start the Everest game on Windows.
rem This .bat wrapper avoids PowerShell execution-policy restrictions.
rem Usage: start.bat [port]   (default port 8000)
setlocal
cd /d "%~dp0"

set "port=8000"
if not "%~1"=="" set "port=%~1"
set "url=http://localhost:%port%"

if not exist node_modules (
    echo node_modules not found - installing dependencies...
    call npm install
)

echo Starting game at %url%
start "" "%url%"
call npm start -- %port%
endlocal
