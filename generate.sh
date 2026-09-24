#!/usr/bin/env bash
# Generate a surface-biome map + spawn viewer for one seed.
# Usage: ./generate.sh <seed> [radius_in_blocks]
set -euo pipefail

SEED="${1:?usage: ./generate.sh <seed> [radius]}"
RADIUS="${2:-3000}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

make -s

BASE="output/seed_${SEED}"
mkdir -p output

./bin/seedmap --seed "$SEED" --radius "$RADIUS" --out "$BASE"
python3 tools/ppm_to_png.py "$BASE.ppm" "$BASE.png"
rm -f "$BASE.ppm"
python3 tools/build_viewer.py "$BASE"

echo ""
echo "Open: $ROOT/$BASE.html"
