#!/usr/bin/env bash
# Start the Everest game on Linux.
# Usage: ./start.sh [port]   (default port 8000)
set -euo pipefail
cd "$(dirname "$0")"

port="${1:-8000}"
url="http://localhost:$port"

if [ ! -d node_modules ]; then
    echo "node_modules not found - installing dependencies..."
    npm install
fi

echo "Starting game at $url"
if command -v xdg-open >/dev/null 2>&1; then
    (sleep 1 && xdg-open "$url") &   # open browser
fi
npm start -- "$port"
