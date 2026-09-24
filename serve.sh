#!/usr/bin/env bash
# Serves the live seed map viewer locally (it needs http:// to fetch the
# .wasm file -- opening docs/map.html directly via file:// will not work).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${1:-8000}"

cd "$ROOT/docs"
echo "Serving http://localhost:$PORT/map.html"
python3 -m http.server "$PORT"
