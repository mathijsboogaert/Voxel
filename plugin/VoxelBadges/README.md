# VoxelBadges

Community badges for the Voxel server (Paper 26.3).

- Badge icons on the line **below each player's name**
- A **Voxel Badges advancement tab** with every badge as a Bronze → Silver → Gold → Diamond chain
- Earning a tier pops a toast and announces it in chat (Diamond gets the challenge frame and sound)
- A small built-in web server hands out the icon resource pack

## Build

Push this folder to a GitHub repo. The included workflow builds the jar on every push:
**Actions → latest run → Artifacts → VoxelBadges**.

Or locally with Java 25 and Gradle: `gradle build` → `build/libs/VoxelBadges-1.0.0.jar`.

## Install

1. Put the jar in `plugins/` and start the server once.
2. Ask your host for an extra port (allocation) and open `plugins/VoxelBadges/config.yml`:
   - `resource-pack.port`: that port
   - `resource-pack.public-url`: `http://<your server IP>:<port>/voxel-badges.zip`
3. **Restart the server.** The plugin writes the advancement data pack into `world/datapacks/voxel_badges/`
   on the first start; Minecraft only loads it on the next start. You'll see a warning in the console
   until then.

## Commands

| Command | What it does |
|---|---|
| `/badge give <player> <badge>` | Upgrades the badge one tier (none → Bronze → … → Diamond) |
| `/badge give <player> <badge> <tier>` | Sets a specific tier: `bronze`, `silver`, `gold`, `diamond` |
| `/badge set <player> <badge> <tier\|none>` | Sets any tier, also downwards, or removes it |
| `/badge take <player> <badge>` | Removes the badge |
| `/badge info [player]` | Shows someone's badges (everyone can use this) |
| `/badge list` | All badges and what each tier needs (everyone) |
| `/badge reload` | Reloads config and textures, rebuilds the packs |

Everything tab-completes. Badge ids: `road_runner`, `bridge_builder`, `shopkeeper`, `game_master`,
`highway_builder`, `public_service_agent`, `cleanup_crew`.
Admin permission: `voxelbadges.admin` (ops by default).

Players need to have joined once to receive a badge. Offline players get their changes when they join.

## Changing icons or badges

- **Icons:** drop a PNG named like `gold_road_runner.png` into `plugins/VoxelBadges/textures/`, then `/badge reload`.
  It overrides the built-in one in both the nameplate and the advancement tab.
- **Badge text:** edit `config.yml`, then `/badge reload`. Changed advancement text needs a server restart.
- **New badge:** add it at the bottom of `badges:` in the config, add its 4 textures, `/badge reload`, restart.
  Don't reorder existing badges: the order decides which icon character each badge uses.

## Data

Badges are stored in `plugins/VoxelBadges/badges.yml` (per player UUID). The website and Discord parts
will read from here.

## If something looks off

- **Tab background is a purple/black checkerboard:** set `advancements.background` to
  `minecraft:textures/block/gold_block.png` and restart.
- **Data pack or resource pack "incompatible":** the pack version numbers are in `packs:` in the config.
- **Icons show as boxes under names:** the player didn't accept/download the resource pack, or
  `public-url` is wrong. Check the URL in a browser, it should download a zip.
- **Bedrock players (Geyser)** will see the advancement messages but not the custom icons.
