#!/usr/bin/env pwsh
Write-Host "Starting LTIMindtree Assessment Platform Server..." -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green

# Check if Node.js is available
Write-Host "Checking if Node.js is available..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if server.js exists
Write-Host "Checking if server.js exists..." -ForegroundColor Yellow
if (-not (Test-Path "server.js")) {
    Write-Host "ERROR: server.js not found in current directory" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Starting server..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Green

# Start the server
node server.js
