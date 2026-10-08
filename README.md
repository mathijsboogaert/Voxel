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

The page is a fixed header (logo + "VOXEL / World map" wordmark, "Return
to spawn" button) / map / footer (seed + Minecraft version + spawn on the
left, live hover biome+coords on the right) layout. The logo is
`docs/assets/logo.png`, pre-processed (white background keyed to
transparent, cropped) from the source art — accent colors in `map.html`'s
`:root` (`--brand-teal`, `--brand-orange`, etc.) were sampled directly from
it, so re-theming means re-sampling if the logo changes.

**Zoom is free and continuous** — scroll, pinch (touch/mobile), double-
click, and keyboard all zoom smoothly (`zoomSnap: 0`), with
`zoomAnimation: true` for an eased transition rather than an instant
snap. The header's "Return to spawn" button is a quick-jump shortcut back
to the spawn point at the default zoom (z=10); it doesn't restrict zoom in
any way — every level, including fractional ones, is freely reachable.
That wasn't always true: z=11 (`blocksPerPixel=2`) once hit a cubiomes
coordinate bug that silently misaligned tiles from their real position,
and the renderer at the time went through cubiomes' `Range`/`genBiomes`
for every zoom level, so every in-between/fractional level was an unknown
risk worth avoiding outright (zoom used to be locked to three preset
buttons — Overview/Normal/Detail — for this reason). Both of those are
gone now: the renderer was rewritten (see "Real terrain height" below)
to sample real terrain height directly and no longer calls
`Range`/`genBiomes` at all, so there's no scale-dependent path left for
that class of bug to live in, and tile rendering moved off the main
thread into a worker pool, which is what made it safe to re-enable the
animation (see `docs/map.html` for the fuller history in comments).
Verified z=11 and fractional zooms (e.g. 10.5) render correctly aligned
before re-enabling free zoom.

**Drawing borders**: the "Draw border" tool (top-right) lets you click to
place points for a custom border line, snapped to the same 4-block grid the
biome tiles are rendered at. Double-click, Enter, or the "Finish line"
button ends the current line; Escape or "Undo point" discards/steps back;
"Clear all" needs two clicks within 3 seconds to confirm. Finishing a line
opens a small editor to name it and pick a color from the palette — the
name is shown as a permanent label at the line's midpoint by default, and
clicking either the line or its label reopens the editor (with a "Delete"
option). Unchecking **"Show label on map"** in that editor keeps the name
(still matched by search) but stops it from rendering, and also drops the
fill down to fully transparent, leaving just the outline — for a border
where the label and tinted fill would otherwise sit on top of content you
want visible. E.g. "Shopping District" has this off so its outline marks
the area without covering the shop icons placed inside it.
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

**Placing shops**: the "Place shop" tool drops a small pixel-art icon
(`docs/assets/shop-icon.png`) at a single click (no multi-point line like
borders), snapped to the same grid, and immediately opens an editor to
name it. Unlike a border's permanent label, a shop's name is hidden until
someone taps the icon — the editor on `map.html` (tap = edit), a plain
popup with just the name on `docs/index.html` (tap = view, no editing).
Clicking "Place shop" and "Draw border" are mutually exclusive — turning
one on turns the other off. Shops autosave to `localStorage` the same way
borders do, and **`docs/shops.json`** is their checked-in source of truth;
export it with **"Export shops.json"** and commit it the same way as
`borders.json`. The icon is rendered with `image-rendering: pixelated`
(plus the `crisp-edges` fallback) so its edges stay hard at any zoom
instead of being smoothed/blurred like a photo. Shop icons only render
once you've zoomed in past `SHOP_VISIBLE_MAX_BPP = 3` blocks/px — at the
default zoom (4 blocks/px) and wider they'd just be fixed-size clutter
sitting on top of biomes much larger than they are, so they stay hidden
until zoomed in close enough to mean something.

**Search**: the header search box (both pages) matches labeled borders
and shops by substring as you type, and zooms to whichever result you
pick — `fitBounds()` on the border's shape for a border, or `setView()`
at a fixed close-up zoom (`DETAIL_ZOOM = 13`) for a shop. The dropdown
supports arrow-key navigation and Enter to select, and closes on Escape
or a click outside it. It's rebuilt from the live `borders`/`shops`
arrays on every keystroke rather than cached, since both can change at
any time while editing on `map.html`.

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
- **Real terrain height, not a fixed sea-level slice**: `render_tile` in
  `wasm/seedmap_wasm.c` calls `samplePreliminarySurfaceLevel()` — the same
  density-function surface estimate vanilla terrain generation itself uses
  internally (added to this fork's `terrainnoise.c`) — per pixel, then
  samples the biome *at that real height* (`biomeAtHeight()`) rather than
  at a fixed y. Earlier versions of this tool sampled at a fixed sea-level
  plane (y≈60), which is simpler but means mountain-only biomes (jagged
  peaks, snowy slopes) never showed up, and cave biomes (dripstone caves,
  lush caves, deep dark) bled into the visible surface wherever the
  climate parameters happened to match underground — both were artifacts
  of ignoring real elevation, not something cubiomes gets "wrong".
- **Hillshading**: each pixel samples all four neighbors (not just
  east/south) at a one-cell border around the tile, two cells apart, and
  combines two cues: a directional component (classic NW-lit hillshade,
  from the width-2 west/east and north/south differences) and a
  curvature component (how far this point sits above/below the *average*
  of its four neighbors). The directional term alone went flat on broad,
  gently-domed hills — their apex has ~zero local slope in any one
  direction despite clearly being a raised point, which rendered as a
  flat, uniformly-lit patch with a shading ring only at the steep edges
  (reported: looked like an unexplained blob in the middle of an
  island). Curvature catches exactly that case, since the apex of a dome
  is still measurably convex relative to its surroundings even where its
  slope is zero. `(tileWidth+2)×(tileHeight+2)` heights get computed per
  tile for this (one border cell on every side, not just east/south).
- **Small islands now actually show as islands**: biome classification is
  climate-based (continentalness/erosion/etc.), which only roughly
  correlates with height — small-scale terrain noise can push a column
  above sea level even where the surrounding area's climate reads as
  "ocean" (a real little rocky island in-game). Coloring strictly by
  biome ID painted those the same flat ocean blue as the water around
  them, so they never read as land. `resolveVisibleBiome()` in
  `wasm/seedmap_wasm.c` checks real height against sea level (63) via
  cubiomes' own `isOceanic()` helper and substitutes `stony_shore`'s
  color whenever an "oceanic" column has actually emerged, rather than
  trying to guess what land biome it "should" be.
- **Known limitation: narrow straits/channels can render as one
  landmass instead of two separate islands.** `surfaceHeightAt()`
  (`samplePreliminarySurfaceLevel`) is a fast spline-fit approximation —
  it's literally what vanilla generation uses for an initial guess, not
  the final word — and it can be off by a few blocks exactly at a
  boundary, which is exactly where a 1-2 block-wide channel between two
  bits of land lives. This fork's `generateColumn`/`sampleNoiseColumn`
  compute the *exact* generated height (`exactSurfaceHeightAt()`,
  used by `get_biome_name_at()` for hover, where a single point is
  cheap) and would fix this, but profiled at ~0.7ms per point, a full
  256x256 tile (257×257 height samples for hillshading) would cost
  ~47 seconds — nowhere near viable, even restricted to the native-
  resolution zoom tier alone (tried; reverted). A properly batched
  version using this fork's `generateRegion()` (which memoizes shared
  corner noise columns across a whole chunk grid instead of recomputing
  all four per point, the way `exactSurfaceHeightAt` does) could likely
  get there, but that's a meaningfully bigger rewrite than swapping the
  height function, and hasn't been attempted yet.
- **Spawn point**: computed with cubiomes' `getSpawn()`, which follows the
  same grass-block heuristic the game itself uses.
- **Performance**: direct per-pixel sampling (what both of the above use)
  sidesteps a cubiomes quirk the previous fixed-height, `Range`/
  `genBiomes()`-based renderer had to special-case around: its generic
  sampler hard-codes assumptions about `Range.scale` that silently
  misplace samples for some scale values, and uses a documented fast/
  imprecise mode for others. Direct sampling is also meaningfully faster
  at zoomed-out levels where that renderer had to supersample 3×3 per
  pixel to avoid visible aliasing (profiled: ~1.1s/tile before, ~280ms/
  tile now) — real height varies more smoothly across neighboring pixels
  than the old fixed-height biome field did, so a single sample per pixel
  holds up without supersampling. Native-resolution tiles are somewhat
  slower than before (~230ms vs ~150ms) since real height estimation
  costs more than the old flat sample, which is a reasonable trade given
  it all runs off the main thread in the worker pool regardless.
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
- **Borders and shops have no real backend yet**: `docs/borders.json` and
  `docs/shops.json` are static files that ship with the site, so anyone who
  opens it can *see* them, but nobody (including you, once hosted) can edit
  them live — publishing a change means re-exporting and committing. Making
  it "everyone can see, only I can edit" *live* needs a real backend that holds a secret
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
