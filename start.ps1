# Start the Everest game on Windows.
# Usage: .\start.ps1 [port]   (default port 8000)
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$port = if ($args.Count -ge 1) { $args[0] } else { "8000" }
$url  = "http://localhost:$port"

if (-not (Test-Path node_modules)) {
    Write-Host "node_modules not found - installing dependencies..."
    npm install
}

Write-Host "Starting game at $url"
Start-Process $url   # open default browser
npm start -- $port
