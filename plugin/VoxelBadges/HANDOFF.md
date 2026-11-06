# Voxel Badges: handoff for Claude Code

Read this first. It sums up everything Mathijs and Claude (in chat) designed and decided for the Voxel
badge system, so you can continue without the chat history.

## Context

- Server: **Voxel**, Paper **26.3**, hosted at Logic Servers, ~25 whitelisted players (friends), DiscordSRV
  installed, one Bedrock player via Geyser. Owner/admin: Mathijs (username `Mathi_Craft`).
- Website: Voxel map at https://mathijsboogaert.github.io/Voxel/ (own build, has a shops feature).
- Goal: get players to do community work (roads, bridges, shops, mini games, Nether highways, public
  builds, cleanup) by awarding **badges**. Roads matter extra: the End only opens once all land-reachable
  bases are connected to spawn by road or bridge.
- Badges are **awarded manually by an admin** (no auto-detection).

## Parts of the project

1. **Server plugin (this repo, written, not yet compiled):** badge storage, `/badge` commands, icons
   under the player name, advancement tab. See `README.md`.
2. **Trophy heads (designed, not yet in the plugin):** a placeable player head per badge, see below.
3. **Website (later):** badges on player profiles, reading `plugins/VoxelBadges/badges.yml`.
4. **Discord (later):** earn announcements via webhook, maybe tier roles via DiscordSRV group sync.

## Badges and tiers (final)

Tiers: **Bronze → Silver → Gold → Diamond**. Each tier includes the one before it. Gold is reachable for
everyone who keeps at it; Diamond is the rare one (sometimes only one holder) and requires Gold.

| Badge (id) | Bronze | Silver | Gold | Diamond |
|---|---|---|---|---|
| Road Runner (`road_runner`) | 1 road | 3 roads | 5 roads | Gold + roads are non-basic, with streetlights |
| Bridge Builder (`bridge_builder`) | 1 bridge | 2 bridges | 5 bridges | Gold + a landmark bridge, 100+ blocks |
| Shopkeeper (`shopkeeper`) | Shop listed on the site | 2 shops | 3 shops | Gold + keeping your shops well stocked |
| Game Master (`game_master`) | 1 mini game | 2 mini games | 3 mini games | Gold + hosted a game event |
| Highway Builder (`highway_builder`) | Basic tunnel to a base | Horse-sized + fast lane | 3 silver-level links | Main hub connecting all bases |
| Public Service Agent (`public_service_agent`) | 1 public build | 2 public builds | 3 public builds | Helped significantly to reshape a public district |
| Cleanup Crew (`cleanup_crew`) | 5 chunks restored | 10 chunks | 20 chunks | Terraformed a full public zone |

Definitions (shown on page 2 of `docs/voxel_badges.pdf`):
- **Road:** connects two points along a clearly laid-out route, wide enough for a horse without
  obstructions, mob-proofed with lighting or other methods.
- **Bridge:** spans a gap end to end, connects to roads, fits a horse, properly lit, has some design features.
- **Shop:** whoever builds, maintains and stocks a shop is a keeper; several people can keep one shop;
  must be connected to the road network and in the shopping district.
- **Highway:** a road in the Nether, or a large straight tunnel in the Overworld.
- **Restored chunk:** looks better than when first loaded; no unusual holes, some lighting added.

Known open point: Highway Builder and Cleanup Crew diamonds don't start with "Gold +" like the others.

## In-game display (decided)

- **Below the player name:** one icon per badge the player has, **only the highest tier** (silver
  replaces bronze, never both). Implemented with a `below_name` scoreboard objective whose per-player
  number format is a fixed text component of glyphs from a resource-pack font (`voxel:badges`).
  Visible only within ~8 blocks (client limit).
- **Advancement tab "Voxel Badges":** each badge is a chain Bronze → Silver → Gold → Diamond under a root.
  Bronze/Silver `task` frame, Gold `goal`, Diamond `challenge` (spiky purple toast + sound).
  Toast + chat announcement on earning. Granted via `impossible` criteria by the plugin.
- Earlier ideas not built (yet): equipped badge as team suffix next to the name, `/badges` chest GUI,
  plaque item.

## Badge icon designs (final, 10×10 px)

Files: `design/badges/<tier>_<id>.png` (28 icons) and the overview `design/badges/all_tiers_sheet.png`.
The same PNGs are bundled in `src/main/resources/textures/`.

Style rules Mathijs set:
- Size **10×10**. Multicolour, with the **tier metal clearly dominant** (not just a small accent).
- The metal part is what changes per tier; other colours (grass, water, purple) stay the same.
- Dark outline `#2A1F1A`.

Per badge:
- **Road Runner:** grass tile, the road itself is gold (shaded light left → dark right), 1px white
  centre line, no dirt on the sides.
- **Bridge Builder:** simple curved gold bridge from green bank to green bank, water underneath.
- **Shopkeeper:** stall with gold/red striped awning, wooden posts and counter, gold coin.
- **Game Master:** gold die with five 2×2 black dots.
- **Highway Builder:** Nether portal (typical 4:5 shape) with a gold frame on a stone base; inside a
  smooth purple diagonal twirl with a light core (not spotty).
- **Public Service Agent:** fully gold temple: flat 2-row roof, 4 slim tall pillars, steps.
- **Cleanup Crew:** broom with gold bristles, wooden handle, white sparkle, small dust puff.

Tier palettes (highlight / base / shadow):
- Bronze `#F0B27A` / `#C47A3A` / `#7D4520`
- Silver `#F4F6F8` / `#B8C0C8` / `#6F7A85`
- Gold `#FFE27A` / `#E3A521` / `#A86A12`
- Diamond `#C9FBFF` / `#4FD8E0` / `#1F8A9A`

`design/scripts/badge_icons.py` holds every icon as a character grid plus the palette and regenerates
the PNGs (Python + Pillow). Note: silver road line and silver temple are low-contrast; bronze leans copper.

## Trophy heads (designed, gold done)

A placeable player head (8×8×8, with the second "hat" layer) per badge, as a physical trophy.
Files: `design/heads/skins/gold_<id>_skin.png` (64×64 skins, all 6 head faces + hat layer filled,
body black, hat layer transparent where unused), renders in `design/heads/renders/`.
Textures should look **vanilla-like, not grainy**.

- **Road Runner:** grass block diorama, wiggly 3-wide gold road across the top running over the edges,
  no road lines; grass overhang on the hat layer with gaps where the road exits.
- **Bridge Builder:** grass block with a river across the top and a gold bridge over it at the front edge.
  (Weakest one: reads more as river than bridge.)
- **Shopkeeper:** red/white awning roof, wooden counter with gold coin, oak-plank sides, awning edge on hat.
- **Game Master:** gold die, different pips per face.
- **Highway Builder:** netherrack block with gold portal on the front (no hat layer, it made the frame too wide).
- **Public Service Agent:** dark suit with white collar and a gold tie.
- **Cleanup Crew:** grass block with dirt, **one big branching crack per face filled with metal**
  (trunk from the bottom splitting into branches near the top, like Mathijs's reference image), smaller
  crack on the side, continuing onto the top; grass overhang with a gap where the crack crosses.

`design/scripts/trophy_heads.py` contains the face textures and an isometric preview renderer.
Still to do: bronze/silver/diamond skins; upload skins (e.g. via MineSkin) to get texture values; give
heads via the plugin (verify the 26.3 profile component format first).

## Plugin status (this repo)

- Written blind: the chat environment couldn't reach repo.papermc.io, so it was only compiled against
  stand-in stubs. Generated data pack / resource pack JSON was validated.
- **Verify on first real build:** `Score#numberFormat` + `io.papermc.paper.scoreboard.numbers.NumberFormat`,
  Adventure `ResourcePackInfo` / `ResourcePackRequest`, `Bukkit.getOfflinePlayerIfCached`.
- **Verify in game:** advancement tab background path (`config.yml` → `advancements.background`),
  data pack format 109 / resource pack format 97 (`packs:` in config; 109 came from a single source).
- Needs one restart after first start (data pack is written to `world/datapacks/voxel_badges/`).
- Resource pack is served by a built-in HTTP server on an extra port (`resource-pack.port`,
  `public-url` must be set to the server IP).

## Mathijs's preferences

Short, direct answers; execute his plan rather than redesign it; flag assumptions briefly; never use
em dashes; point out spelling errors in text he provides (he's dyslexic) and use the corrected version.
