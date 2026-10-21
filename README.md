# Voxel

The website for the Voxel Minecraft server (Paper 26.3, seed `2344567094`): a homepage with news, a map
preview and live stats, the full world map, and a page for every player. It is a static site served by
GitHub Pages from `docs/`, with no backend. The map is drawn in the browser from the world seed using
[xpple/cubiomes](https://github.com/xpple/cubiomes) (vendored in `vendor/cubiomes`, compiled to WebAssembly), and
the stats come from the server's own logs.

## The pages

| Page | File | What it is |
| --- | --- | --- |
| Home | `docs/index.html` | News (a big achievement, a new shop, or a countdown to an event), a small map preview, the stats overview (with the advancement race graph), and who is around |
| Map | `docs/map/index.html` | The full pannable, zoomable world map with borders, shops and search. Read-only |
| Players | `docs/players/index.html` | Everyone, with face, playtime and when they were last on |
| Player | `docs/player/index.html?name=Name` | One player: stats, when they play, who they play with, their base and shop, latest achievements |
| Editor | `docs/editor.html` | Your private tool for drawing borders, placing shops and assigning owners. Not linked from the site |

`generate.sh` (further down) is the original one-off PNG renderer, kept for reference.

## Run it locally

```bash
./serve.sh
```

Open http://localhost:8000/ for the site and http://localhost:8000/editor.html for the editor. It has to be served
over `http://`: the pages `fetch()` the data files and the `.wasm`, which a `file://` page cannot do.

## Look and feel

The design follows the Voxel brand guide: an autumn palette on warm paper, Fraunces for headlines and Figtree for
everything else, square corners with one leaf corner on buttons and feature cards, bold outlines instead of shadows,
and a pattern built from the logo's grid. It is mobile first (the base CSS is the phone layout; wider screens add to it)
and follows the visitor's light or dark setting.

- `docs/assets/brand.css`: the brand tokens (copied from the guide's `tokens.json`) and the base components: button, card, tag, face.
- `docs/assets/site.css`: header, hero, news, stats and the players pages.
- `docs/assets/map.css`: the map's controls and labels in the same terms.
- `docs/assets/editor.css`: the editor's panels and buttons.
- **All styling lives in these four files; pages and scripts carry no inline `style`.** Fonts, sizes, colours, spacing and line weights are CSS, and
  the scripts only pick class names. Data-driven sizes are classes too: bar widths and heights are `w-0` to `w-100` and `h-0` to `h-100`
  (`widthClass()` / `heightClass()` in `docs/js/ui.js`), spacing is `mt-1` to `mt-4`, and chart lines and pattern fills are named classes
  (`race-line--0`, `pat-fill--teal`, and so on). To change how something looks, change its class in the CSS and it changes everywhere.
- `docs/assets/logo-mark.png` and `logo-mark-reversed.png`: the mark cropped to its outline. The page swaps them for dark mode. The guide says never to put the mark on a brand fill, so it only ever sits on paper.
- `docs/js/pattern.js` draws the hero frieze from the four building blocks (square, quarter disc, leaf, corner cut).
- Player heads are shown square (to keep the pixel grid) with `image-rendering: pixelated`. The guide lists round corners for avatars, but square heads suit Minecraft's grid; change `.face` in `brand.css` if you prefer round.

## How the code is laid out

Plain HTML, CSS and ES modules. There is no build step and no framework; Leaflet is the only library (from a CDN).

| File | Job |
| --- | --- |
| `docs/js/ui.js` | Site paths (works from any base URL), DOM helpers, player faces, number and time formatting |
| `docs/js/data.js` | Loads the CSVs and computes every number the site shows (a port of the original stats dashboard, so the numbers match) |
| `docs/js/map-core.js` | The world map: Leaflet over the WASM tile renderer, plus borders, shops and the spawn marker. Shared by the home preview and the Map page |
| `docs/js/home.js`, `map-page.js`, `players.js`, `player.js` | One per page |

## Data files

| File | Written by | Holds |
| --- | --- | --- |
| `docs/data/voxel-sessions.csv`, `voxel-hourly.csv`, `voxel-events.csv` | `tools/build_stats.py` | Play sessions, minutes per hour, and deaths, advancements and chat counts (never message text) |
| `docs/data/meta.json` | `tools/build_stats.py` | When the data was last built, shown as "Updated X ago" |
| `docs/data/players.json` and `docs/faces/*.png` | `tools/fetch_faces.py` | The roster (name and UUID) and each player's head |
| `docs/data/adjust.json` | by hand | Minutes taken off a player's played time: `afkMinutes` (light teal) and `adminMinutes` (yellow). Only the player's own page shows the split; elsewhere the time is active time |
| `docs/borders.json` | the editor | Borders: `points`, `label`, `color`, `hideLabel`, and `owners` (Minecraft names) |
| `docs/shops.json` | the editor | Shops: `x`, `z`, `label`, `owner`, and `added` (when it was placed) |
| `docs/news.json` | by hand | Extra news items, mainly events with a countdown (below) |

## Advancement points

Advancements are scored the way the server's advancement datapack scores them, by kind: a task is worth 1 point, a goal 3, a challenge 5,
and "How Did We Get Here?" 10. Each advancement counts once per player. The log says which kind each one is, and the site adds the
points up for the homepage leaderboard (the Advancements tab) and the Advancements card on each player page. The numbers live in one place,
`ADV_POINTS` and `POINTS_BY_NAME` at the top of `docs/js/data.js`; add a name to `POINTS_BY_NAME` to give any single advancement its own value.

With the Advancements tab open, the homepage also draws the **advancement race**: each of the top five players' running point total, one step per advancement, from launch to the latest data. The five lines differ in colour and pattern, with a legend underneath. Each player page has the same graph in its Advancements card: that player's line is the bold rust one, drawn against the four leaders (the chart code is `docs/js/race.js`).

## News

The homepage news section needs no upkeep. It builds itself from the data:

- **Achievements.** The latest challenges and goals (the advancements the game itself calls big), from the last 30 days.
- **New shops.** Any shop in `shops.json` with an `added` date from the last 21 days. The editor stamps `added` when you place a shop.
- **Your own items,** in `docs/news.json`:

```json
{
  "items": [
    {
      "type": "event",
      "title": "Harvest hunt",
      "body": "Find the hidden pumpkins before sunset.",
      "at": "2026-11-01T19:00:00+01:00",
      "pin": true
    },
    { "type": "note", "title": "Server back up", "body": "We moved to a faster host.", "date": "2026-10-20" }
  ]
}
```

An `event` shows a live countdown to `at` (write it with a UTC offset, or `Z`). The featured card is the first item with `"pin": true`, otherwise the
nearest upcoming event, otherwise the newest item. An event disappears a day after it starts. Other `type` values: `note`, `achievement`, `shop`.

## Live stats

`.github/workflows/stats.yml` keeps the stats current without a server of your own. Every 15 minutes or so it downloads the server's
`logs/` folder over SFTP, runs `tools/build_stats.py` and `tools/fetch_faces.py`, and commits the new `docs/data` and
`docs/faces`; GitHub Pages then republishes. GitHub starts scheduled jobs a few minutes late and sometimes skips one, so
"live" means within the hour. The page shows "Updated X min ago" and re-reads the data every five minutes while it is open.

Set it up once:

1. In the Logic Servers panel open your server, then **Settings, SFTP Details**. Note the address, port and username. For least privilege, create a **subuser** on the server who can only read files, and use that account's password.
2. In the GitHub repo open **Settings, Secrets and variables, Actions** and add these repository secrets: `SFTP_HOST`, `SFTP_USER`, `SFTP_PASSWORD`. Optional: `SFTP_PORT` (default 2022), `SFTP_LOG_DIR` (default `logs`), `SFTP_KEY` (a private key, instead of the password), and `SFTP_HOST_FINGERPRINT` (the first run prints the value to pin).
3. Open the **Actions** tab, choose **Update stats**, and press **Run workflow**. Until the secrets exist the job does nothing and says so.

Things worth knowing:

- Keep the server's old `logs/*.log.gz` files. The script rebuilds from the whole history every run, so deleted logs would drop out of the stats.
- Raw logs are never committed (they contain chat). Only the derived CSVs are.
- It makes roughly 24 small commits a day, because `meta.json` changes every run.
- Days before `2026-10-01` were testing and are ignored (`LAUNCH` in `docs/js/data.js`). Mathi_Craft's time counts in full, as it did on the original dashboard.
- You can always run it by hand: `python3 tools/build_stats.py path/to/logs docs/data && python3 tools/fetch_faces.py docs/data docs/faces`, then commit.

## AFK time

The playtime datapack keeps two lifetime counters per player (active and AFK seconds). Every run, `tools/sync_logs.py` downloads the world's
`scoreboard.dat` (`SFTP_SCOREBOARD` if it is not at `world/data/minecraft/scoreboard.dat`) and `tools/read_scoreboard.py` writes
`docs/data/afk.json` (latest numbers) and `docs/data/afk-history.csv` (a row whenever someone's numbers change). The site subtracts AFK time from
played time, shows it as the light-teal part of "Time online" on the player page, and leaves it out of a session's length for the Marathon label.
`docs/data/adjust.json` holds hand-entered AFK/admin minutes for the time before the datapack.

`tools/push_playtimeboard.py` writes the same AFK minutes into PlaytimeBoard's `adjust-minutes` list on the server (SFTP, `SFTP_PLAYTIMEBOARD` if the
config is elsewhere; only that block is touched, and the old file is kept as `config.yml.voxel-bak`). The plugin reads its config only on
`/playtimeboard reload`, so add a panel schedule (Schedules, new, every hour at minute 55, task "Send command": `playtimeboard reload`).

## Player labels

Labels like Night owl or Marathon are earned by clearing a bar, so any number of players can hold the same one. The bars and the cap on how many labels one player can show
(`MAX_LABELS`, currently 3, the ones they clear by the widest margin) are in `LABELS` near the top of the labels section of `docs/js/data.js`. Each label's icon is
`docs/assets/badges/<name>.svg`.

## Players, faces and places

A player page shows their base and shop when the map data says who owns them. In the editor, click a border and add its
**Owners** (the Minecraft names, picked from the roster; a couple can share one), or click a shop and set its **Owner**.
Export `borders.json` and `shops.json` and commit them as usual. A new player appears on the site automatically at the next stats
update, with a letter tile until their head has been fetched.

## The explored world (real map tiles)

The map shows the real, built world, drawn from the server's region files, not the seed. Everything
that has been explored is on the map; builds are readable close to where people live.

To update it, download a new world backup (the `.tar` from the panel) and run:

```
python3 tools/world/render_world.py ~/Downloads/archive-….tar
```

It reads the regions straight out of the tar (nothing is unpacked), draws a top-down view with shading,
biome tints and water depth, and writes `docs/tiles/` (WebP tiles plus `manifest.json`). Commit the
tiles and push. Only changed regions are redone; the cache lives in `~/.cache/voxel-world`.

- Full detail (1 and 2 blocks per pixel) is drawn around every border, shop and the spawn, `--margin`
  blocks beyond them (default 768). The rest of the explored world is drawn from 4 blocks per pixel and
  out, and the map scales those tiles up when you zoom in. `--detail all` renders everything at full
  detail (about six times the size, roughly 125 MB).
- Block colours are in `tools/world/colors.json` (see `tools/world/NOTICE.md` for where they come from).
  Blocks it doesn't know are drawn grey and listed at the end of the run.
- Each update rewrites the tiles that changed, which grows the repo history, so don't render every day.

## The map

Drag, scroll, pinch or double-tap to zoom smoothly (`zoomSnap: 0`). The Map page has search, a spawn button, zoom buttons and a readout of the
biome and position (under the cursor on a desktop, at the centre on a phone). Search finds borders, shops and players. Deep links:
`map/?find=Shopping%20District` jumps to a border or shop, and `map/?x=-700&z=38&zoom=12` centres on a point (the player pages use this).

Shop icons only appear once you have zoomed in past `SHOP_MAX_BPP = 3` blocks per pixel (`docs/js/map-core.js`); zoomed further out they would
only be fixed-size clutter on top of much larger biomes. A border with **Show label on map** turned off keeps its name (still searchable) but
drops both the label and the fill, leaving just the outline, so it can mark an area without covering what is inside it, like the Shopping
District around its shops. The seed is fixed in `docs/js/ui.js` (`SEED`, and `SPAWN`, which is what cubiomes reports for it).

### The editor

`docs/editor.html` is the one place to change borders and shops. The map under it is the real explored world, so you can trace borders around builds. **Draw border** places corners on whole blocks, with straight
horizontal and vertical lines only (each corner keeps the previous corner's x or z; the shape is closed with one extra corner if needed). Double-click,
Enter, clicking the first corner or **Finish shape** ends it; Escape or **Undo point** steps back). Finishing a border opens a small editor for its name, colour, label
visibility and owners; clicking a border later reopens it. **Draw shop outline** works the same way, over the shop's building: the outline (orange with a dark edge) leaves the build visible
underneath, and finishing it asks for a name and owner. Ticking **Spoiler wall** in a shop's editor fills its outline solid black (`"spoiler": true`), so what is behind it can't be seen. Shops in `shops.json` that are only a point (`x`, `z`) keep their small icon until you redraw
them; an outline is stored as `points`, with `x`, `z` set to its middle. The two drawing tools switch each other off, and each **Clear all** needs a
second click within three seconds to confirm.

While you work, the editor autosaves to your browser's `localStorage` as a backup; that never reaches the site. The real files are
`docs/borders.json` and `docs/shops.json`: press **Export borders.json** or **Export shops.json**, replace the file in `docs/` with the download,
and commit. There is no backend, so a visitor who finds `editor.html` can draw in their own browser but cannot change what anyone else sees.

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
  instance and calls `seed_init()` independently; `docs/js/map-core.js`'s
  `TilePool.request()` round-robins render requests across the pool and
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
