@echo off
echo Starting LTIMindtree Assessment Platform Server...
echo ================================================

echo Checking if Node.js is available...
node --version
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    pause
    exit /b 1
)

echo Checking if server.js exists...
if not exist server.js (
    echo ERROR: server.js not found in current directory
    pause
    exit /b 1
)

echo Starting server...
echo Press Ctrl+C to stop the server
echo ================================================
node server.js
