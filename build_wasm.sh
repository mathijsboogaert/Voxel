#!/usr/bin/env bash
# Compiles cubiomes + the seedmap bridge to WebAssembly for the live map viewer.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Homebrew's `emscripten` bottle is version-skewed against Homebrew's
# `llvm` on this machine (needs LLVM 24, only 23.x available), so we use
# a self-contained emsdk checkout instead, which bundles a matched
# clang/llvm and doesn't depend on system packages.
EMSDK_DIR="${EMSDK_DIR:-$HOME/emsdk}"
if [ ! -f "$EMSDK_DIR/emsdk_env.sh" ]; then
    echo "emsdk not found at $EMSDK_DIR -- see README.md for setup instructions" >&2
    exit 1
fi
source "$EMSDK_DIR/emsdk_env.sh" >/dev/null

mkdir -p docs/wasm

CUBIOMES_SRC=$(find vendor/cubiomes -name '*.c')

emcc -O3 \
  -I vendor/cubiomes -I vendor/cubiomes/loot/cjson \
  -Wno-unused-function -Wno-unused-parameter \
  wasm/seedmap_wasm.c $CUBIOMES_SRC \
  -o docs/wasm/cubiomes.js \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=createCubiomesModule \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s ENVIRONMENT=web,worker \
  -s EXPORTED_FUNCTIONS=_seed_init,_get_spawn_x,_get_spawn_z,_get_mc_version,_render_tile,_get_legend_json,_get_biome_name_at,_malloc,_free \
  -s EXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,stringToUTF8,lengthBytesUTF8,HEAPU8

echo "wrote docs/wasm/cubiomes.js + docs/wasm/cubiomes.wasm"
