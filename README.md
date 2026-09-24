# Seed Viewer

A surface-biome map + spawn point viewer, built on top of
[xpple/cubiomes](https://github.com/xpple/cubiomes) (vendored in
`vendor/cubiomes`) — an actively maintained fork of
[Cubitect/cubiomes](https://github.com/Cubitect/cubiomes) that tracks current
Minecraft releases, including 26.3 "Wilderness Bound".

There are three pages/viewers:

- **`docs/index.html`** — the public, read-only map: same view as below,
  minus every scrap of drawing UI and logic. This is what other people
  should see — GitHub Pages serves a repo's `index.html` at its root by
  default, so uploading everything as-is means this is the front door.
- **`docs/map.html`** — your live, infinitely pannable/zoomable *editing*
  copy, with the border-drawing tools. Keep using this one yourself.
- **`generate.sh`** — the original approach: renders one fixed-size PNG for
  a seed. Simpler, but bounded to whatever region/radius you generate.
  Kept around since it needs no build step beyond the native CLI tool.

## Live map (`docs/map.html` for editing, `docs/index.html` for everyone else)

```bash
./serve.sh
```

Then open http://localhost:8000/map.html (it needs to be served over
`http://`, not opened as a `file://` — the browser can't `fetch()` the
`.wasm` file otherwise). The seed is fixed to `2344567094` (edit the `SEED`
constant near the top of the `<script>` in `map.html` to change it). Drag to
pan; hover to see the biome name in the footer.

`docs/index.html` is a straight copy of the same page with the entire
"Border label/color editor" and "Border drawing layer" sections of the
`<script>` deleted, and the draw-tools/border-editor `<div>`s and their CSS
removed — there's no `drawToggle`, no `saveBorders`, nothing to open dev
tools and call even if someone tried. It reads `docs/borders.json` the same
way `map.html` does, so whatever you've exported there is what it shows.
If you add a feature to `map.html`, remember it won't appear on the public
page unless you port it over deliberately — that separation is the point,
not an oversight to "fix" by unifying the two files.

Since there's no backend, someone who finds `map.html` on a hosted deploy
could still open it and draw locally in their own browser — but they have
no way to write back to the repo's `docs/borders.json`, so it can't affect
what anyone else sees. If that residual exposure still bothers you, don't
upload `map.html` (and the draw-tools bits of `borders.json` tooling) to
the public repo at all; keep it as a separate local-only file.

The page is a fixed header (logo + "VOXEL / World map" wordmark, zoom
buttons) / map / footer (seed + Minecraft version + spawn on the left,
live hover biome+coords on the right) layout. The logo is
`docs/assets/logo.png`, pre-processed (white background keyed to
transparent, cropped) from the source art — accent colors in `map.html`'s
`:root` (`--brand-teal`, `--brand-orange`, etc.) were sampled directly from
it, so re-theming means re-sampling if the logo changes.

**Zoom is intentionally limited to three fixed levels** — "Overview" (z=9),
"Normal" (z=10, the default), and "Detail" (z=12, native resolution) — via
labeled buttons in the header, not a free +/- or scroll/pinch zoom. That's a
deliberate constraint, not a missing feature: z=11 (`blocksPerPixel=2`)
tickles a cubiomes coordinate bug that silently misaligns tiles from their
real position (see `canUseGenBiomes()` in `wasm/seedmap_wasm.c` for the
fix that made z=11 itself safe again) — rather than trust every possible
in-between/fractional zoom level is equally safe, scroll/pinch/double-
click/keyboard zoom are all disabled outright and only these three
pre-verified levels are reachable at all. `ALLOWED_ZOOMS` near the top of
`map.html`'s `<script>` is the single place to add more levels later, each
worth spot-checking against the same class of bug first.

**Drawing borders**: the "Draw border" tool (top-right) lets you click to
place points for a custom border line, snapped to the same 4-block grid the
biome tiles are rendered at. Double-click, Enter, or the "Finish line"
button ends the current line; Escape or "Undo point" discards/steps back;
"Clear all" needs two clicks within 3 seconds to confirm. Finishing a line
opens a small editor to name it and pick a color from the palette — the
name is shown as a permanent label at the line's midpoint, and clicking
either the line or its label reopens the editor (with a "Delete" option).
While drawing, borders autosave to the browser's `localStorage` (keyed by
seed) as a convenience/backup — but that's local to your browser only and
won't ship with the site. **`docs/borders.json`** is the real, checked-in
source of truth: `map.html` fetches it on load and shows whatever's in
there to every visitor, no login needed. To publish your drawn borders,
click **"Export borders.json"** in the toolbar (downloads a file), then
replace `docs/borders.json` with it and commit. There's currently no
backend — editing means redrawing locally and re-exporting/committing;
see "Notes / limitations" below for what a real shared-editing backend
would need.

If you change `wasm/seedmap_wasm.c` (or re-vendor cubiomes), rebuild with:

```bash
./build_wasm.sh
```

This needs [emsdk](https://emscripten.org/docs/getting_started/downloads.html)
(the Emscripten SDK) at `~/emsdk` — Homebrew's own `emscripten` formula was
version-skewed against Homebrew's `llvm` on this machine when this was set
up (needed LLVM 24, only 23.x was available), so the build script uses a
self-contained emsdk checkout instead:

```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest
```

## Static image (`generate.sh`)

```bash
./generate.sh <seed> [radius_in_blocks]
```

Builds the `seedmap` C tool (first run only), generates a biome map centered
on the world spawn, converts it to PNG, and writes a self-contained HTML
viewer to `output/seed_<seed>.html`. Open that file directly in a browser —
drag to pan, scroll to zoom *within the generated image*, and the
legend/spawn marker are baked in from the generation run. Re-running for a
different seed or radius doesn't touch any other seed's output.

## Notes / limitations

- **Minecraft version**: generates with `MC_NEWEST`, which this vendored
  fork defines as `MC_26_3` (Java Edition 26.3, "Wilderness Bound", released
  2026-09-15) — includes the new Dappled Forest biome. If a future Minecraft
  version changes biome generation again, re-vendor a newer `xpple/cubiomes`
  checkout the same way (see below) to stay current.
- **Surface only**: biomes are sampled at sea level (y≈60, matching
  cubiomes' own "image of the world" example), not the real per-column
  terrain height. No structures, caves-as-dimension, or nether/end are
  computed. Note that a handful of "cave" biomes (dripstone caves, lush
  caves, deep dark) can still show up scattered across the surface sample —
  that's not a bug here, it's how Minecraft's 1.18+ climate-based biome
  field actually behaves at fixed height, and other seed-map tools (e.g.
  Chunkbase) show the same texture.
- **Spawn point**: computed with cubiomes' `getSpawn()`, which follows the
  same grass-block heuristic the game itself uses.
- **Tile rendering only ever calls `genBiomes()`/`Range` for `blocksPerPixel`
  == 1 or == 4** (`canUseGenBiomes()` in `wasm/seedmap_wasm.c`); every other
  value goes through direct per-pixel `sampleBiomeNoise()` calls instead,
  supersampled 3×3 with a majority vote once zoomed out far enough that a
  lone sample would alias. Two separate cubiomes quirks make this
  necessary: its generic sampler treats `Range.x/z` as already-in-quart
  coordinates for *any* `scale` in `(1,4]`, not just `scale==4`, so e.g.
  `scale=2` silently samples the wrong world position (this actually
  shipped once — borders/terrain rendered fine at every zoom level except
  the one where `blocksPerPixel` worked out to exactly 2, where everything
  was quietly offset); and for `scale>4` it switches to a documented
  fast/imprecise sampling mode meant for structure placement, which reads
  as visible speckling if used for a biome map image.
- **Tile rendering runs in a pool of Web Workers** (`docs/wasm/tile-worker.js`,
  sized to `navigator.hardwareConcurrency`, capped 2–6), not the main
  thread. A single tile call into `render_tile()` genuinely costs
  something — profiled at ~150ms for a native-resolution tile and over 1s
  for a supersampled zoomed-out one — so doing it synchronously on the
  main thread would freeze panning/hover/drawing for as long as visible
  tiles take to compute. Each worker loads its own cubiomes module
  instance and calls `seed_init()` independently; `map.html`'s
  `requestTile()` round-robins render requests across the pool and
  resolves a promise when a worker posts the pixel buffer back
  (transferred, not copied). Leaflet's `GridLayer` already only requests
  tiles for what's in the viewport — it was never rendering the whole map
  at once — the slowness was purely per-tile compute cost blocking the
  main thread.
- The live map has no legend — hover a spot to see that biome's name. The
  static image still shows a legend with exact percentages for its fixed
  region.
- **Borders have no real backend yet**: `docs/borders.json` is a static file
  that ships with the site, so anyone who opens it can *see* the borders,
  but nobody (including you, once hosted) can edit them live — publishing a
  change means re-exporting and committing. Making it "everyone can see,
  only I can edit" *live* needs a real backend that holds a secret
  server-side (a password or token checked before accepting writes) —
  putting that secret in this page's JavaScript wouldn't work, since a
  static site's source is fully visible to anyone who opens dev tools.
  [Supabase](https://supabase.com) (free Postgres + auth + row-level
  security) is a good fit if/when that's wanted: the page would read
  borders directly from it (public, no login) and only accept writes from
  a logged-in admin session, enforced by Supabase itself, not by client
  trust.

## Updating the vendored cubiomes

```bash
git clone --depth 1 https://github.com/xpple/cubiomes.git /tmp/cubiomes-xpple
rm -rf vendor/cubiomes
mkdir -p vendor/cubiomes
cd /tmp/cubiomes-xpple
cp -r *.c *.h tables features loot ~/path/to/seed-viewer/vendor/cubiomes/
rm -f ~/path/to/seed-viewer/vendor/cubiomes/tests.c
cd ~/path/to/seed-viewer
make clean && make   # native CLI tool
./build_wasm.sh       # live map
```

Both build scripts pick up every `.c` file under `vendor/cubiomes`
automatically (they build the fork's structure/loot code too, since that's
how its source tree is wired together, even though this tool only calls the
biome/spawn functions).
