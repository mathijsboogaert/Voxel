// WebAssembly bridge: exposes seed setup, spawn lookup, and on-demand
// biome tile rendering so the browser can pan/zoom an unbounded map,
// computing only the tiles actually visible instead of a fixed image.
#include "biomes.h"
#include "generator.h"
#include "finders.h"
#include "terrainnoise.h"
#include "util.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

static Generator g;
static TerrainNoise terrain;
static unsigned char biomeColors[256][3];
static int haveGenerator = 0;
static int spawnX = 0, spawnZ = 0;
static char mcVersionBuf[32] = "";

// Cumulative legend: which biomes have been seen across all rendered
// tiles this session, and how many pixels of each (for a rough "share of
// explored area" indicator in the UI).
static long biomeSeenCount[256];

EMSCRIPTEN_KEEPALIVE
void seed_init(const char *seedStr)
{
    uint64_t seed = (uint64_t)strtoll(seedStr, NULL, 10);

    if (!haveGenerator)
    {
        initBiomeColors(biomeColors);
        setupTerrainNoise(&terrain, MC_NEWEST, 0);
        haveGenerator = 1;
    }

    setupGenerator(&g, MC_NEWEST, 0);
    applySeed(&g, DIM_OVERWORLD, seed);
    initTerrainNoise(&terrain, seed, DIM_OVERWORLD);

    Pos spawn = getSpawn(&g);
    spawnX = spawn.x;
    spawnZ = spawn.z;

    const char *v = mc2str(MC_NEWEST);
    strncpy(mcVersionBuf, v ? v : "?", sizeof(mcVersionBuf) - 1);
    mcVersionBuf[sizeof(mcVersionBuf) - 1] = '\0';

    memset(biomeSeenCount, 0, sizeof(biomeSeenCount));
}

// Fast approximate terrain height (a spline fit over climate noise --
// the same quick estimate vanilla generation itself uses for an initial
// guess, not a fixed sea-level slice). Cheap, but "preliminary" is in the
// name: it can be off by a few blocks right at a boundary, which is
// exactly where a narrow strait between two islands would get smoothed
// over into one connected landmass.
static int surfaceHeightAt(int worldX, int worldZ)
{
    return samplePreliminarySurfaceLevel(&terrain, worldX, worldZ);
}

// The overworld's 1.18+ noise column, in 4-block (XZ) x 8-block (Y)
// cells, spanning the full world height (-64..320).
#define OW_CELL_Y_MIN 0
#define OW_CELL_Y_MAX 48
#define OW_CELL_HEIGHT 8
#define OW_WORLD_MIN_Y (-64)
#define OW_COLUMN_LEN (OW_CELL_Y_MAX - OW_CELL_Y_MIN + 1)

// Exact terrain height: evaluates the actual generated column (the same
// density-function math real chunk generation uses to place blocks) via
// this fork's generateColumn/sampleNoiseColumn, instead of the spline
// approximation above. Four noise columns (one per corner of the 4-block
// cell worldX/worldZ falls in) get bilinearly interpolated, then
// generateColumn walks down from the top and returns the first air
// block above solid ground -- exactly what vanilla would generate there.
// Meaningfully more expensive (four 49-entry noise columns instead of a
// handful of spline samples), so this is only used for the "Detail"
// (native resolution) zoom tier; render_tile keeps the fast estimate
// above for zoomed-out tiles where per-tile pixel count is much higher
// and this precision isn't visually distinguishable anyway.
static int exactSurfaceHeightAt(int worldX, int worldZ)
{
    int cellX = worldX >> 2;
    int cellZ = worldZ >> 2;
    double percentX = (worldX - (cellX << 2)) / 4.0;
    double percentZ = (worldZ - (cellZ << 2)) / 4.0;

    double ds00[OW_COLUMN_LEN], ds01[OW_COLUMN_LEN];
    double ds10[OW_COLUMN_LEN], ds11[OW_COLUMN_LEN];
    sampleNoiseColumn(&terrain, cellX,     cellZ,     OW_CELL_Y_MIN, OW_CELL_Y_MAX, ds00);
    sampleNoiseColumn(&terrain, cellX,     cellZ + 1, OW_CELL_Y_MIN, OW_CELL_Y_MAX, ds01);
    sampleNoiseColumn(&terrain, cellX + 1, cellZ,     OW_CELL_Y_MIN, OW_CELL_Y_MAX, ds10);
    sampleNoiseColumn(&terrain, cellX + 1, cellZ + 1, OW_CELL_Y_MIN, OW_CELL_Y_MAX, ds11);

    return generateColumn(NULL, ds00, ds01, ds10, ds11,
        OW_CELL_Y_MIN, OW_CELL_Y_MAX, OW_CELL_HEIGHT,
        percentX, percentZ, INTERP_1_18, OW_WORLD_MIN_Y, 1);
}

// The biome AT that real height -- this is what makes mountain-only
// biomes (jagged peaks, snowy slopes, grove) show up only where the
// terrain is actually high, and keeps cave biomes (dripstone caves, lush
// caves, deep dark) from bleeding into the visible surface: both were
// artifacts of sampling at a fixed y instead of the column's real height.
static int biomeAtHeight(int worldX, int worldZ, int height)
{
    int64_t np[6];
    return sampleBiomeNoise(&g.bn, np, worldX >> 2, height >> 2, worldZ >> 2, 0, 0);
}

// Vanilla Java Edition sea level.
#define SEA_LEVEL 63

// Biome classification is climate-based (continentalness/erosion/etc.),
// which only roughly correlates with height -- small-scale terrain noise
// can still push a column above sea level even where the broader area's
// climate reads as "ocean". That's a real island in-game (a little rocky
// outcrop poking out of the water), but coloring strictly by biome ID
// paints it the same flat ocean blue as the water around it, so it never
// reads as land. Once real height clears sea level, show rock instead of
// the ocean biome's color -- cheaper and more robust than trying to
// classify what the emergent biome "should" be.
static int resolveVisibleBiome(int id, int height)
{
    if (height >= SEA_LEVEL && isOceanic(id))
        return stony_shore;
    return id;
}

EMSCRIPTEN_KEEPALIVE
int get_spawn_x(void) { return spawnX; }

EMSCRIPTEN_KEEPALIVE
int get_spawn_z(void) { return spawnZ; }

EMSCRIPTEN_KEEPALIVE
const char *get_mc_version(void) { return mcVersionBuf; }

// Accurate single-point lookup for hover tooltips. Always uses the exact
// (not the fast-approximate) height -- it's one point, so the extra cost
// is negligible, and hover is exactly the kind of "look closely at this
// one spot" query where the precision is worth it even when the
// currently-rendered zoom tier is using the fast estimate for its tiles.
EMSCRIPTEN_KEEPALIVE
const char *get_biome_name_at(int worldX, int worldZ)
{
    if (!haveGenerator) return "";
    int height = exactSurfaceHeightAt(worldX, worldZ);
    int id = resolveVisibleBiome(biomeAtHeight(worldX, worldZ, height), height);
    const char *name = biome2str(MC_NEWEST, id);
    return name ? name : "";
}

// Renders one w x h tile of RGBA pixels for the world-space square whose
// north-west corner is (worldX0, worldZ0), sampled at blocksPerPixel
// resolution. Row 0 of the output is the north-most row.
//
// Each pixel samples the real terrain height (surfaceHeightAt) and the
// biome AT that height (biomeAtHeight), then shades the biome color by
// the local height gradient (a simple hillshade: higher than your
// neighbors = lit, lower = shadowed). This is what gives the result
// visible relief/texture instead of flat biome-colored regions, and
// doubles as the fix for mountain/cave biomes: sampling at the real
// height instead of a fixed y is what makes jagged_peaks only show up on
// actual peaks, and keeps dripstone_caves/lush_caves/deep_dark from
// bleeding into the visible surface.
//
// This also sidesteps a cubiomes quirk the old Range/genBiomes-based
// renderer had to work around at specific zoom levels: its generic
// sampler hard-codes assumptions about Range.scale that silently
// misplace samples for some scale values. Direct point sampling (what
// this does) never goes through that path at all.
static void paintPixelShaded(unsigned char *outRGBA, int idx, int id, double shade)
{
    unsigned char cr = 0, cg = 0, cb = 0;
    if (id >= 0 && id < 256)
    {
        cr = biomeColors[id][0];
        cg = biomeColors[id][1];
        cb = biomeColors[id][2];
        biomeSeenCount[id]++;
    }
    int r = (int)(cr * shade + 0.5);
    int gr = (int)(cg * shade + 0.5);
    int b = (int)(cb * shade + 0.5);
    if (r > 255) r = 255; else if (r < 0) r = 0;
    if (gr > 255) gr = 255; else if (gr < 0) gr = 0;
    if (b > 255) b = 255; else if (b < 0) b = 0;

    int o = 4 * idx;
    outRGBA[o + 0] = (unsigned char)r;
    outRGBA[o + 1] = (unsigned char)gr;
    outRGBA[o + 2] = (unsigned char)b;
    outRGBA[o + 3] = 255;
}

EMSCRIPTEN_KEEPALIVE
void render_tile(int worldX0, int worldZ0, int w, int h, int blocksPerPixel, unsigned char *outRGBA)
{
    if (!haveGenerator || w <= 0 || h <= 0) return;
    if (blocksPerPixel < 1) blocksPerPixel = 1;

    // Tried using exactSurfaceHeightAt() here for native-resolution
    // tiles -- it resolves narrow straits/channels correctly (that's the
    // whole reason it exists), but at ~0.7ms per point it costs ~47s for
    // a single 256x256 tile (257x257 height samples). Nowhere close to
    // viable even restricted to one zoom tier. A properly batched/cached
    // version (this fork's generateRegion() memoises shared corner
    // columns across a whole chunk grid, rather than recomputing all
    // four per point the way this does) could get there, but that's a
    // meaningfully bigger rewrite than swapping the height function --
    // left for later if the fast approximation's inaccuracy at narrow
    // features keeps being a real problem. get_biome_name_at() below
    // still uses the exact height, since a single hover query is cheap
    // regardless.

    // One extra row/column of heights so every output pixel can look at
    // its east and south neighbor for the hillshade gradient, without
    // recomputing any height more than once.
    int gw = w + 1, gh = h + 1;
    int *heights = (int *)malloc(sizeof(int) * (size_t)gw * gh);
    if (!heights) return;

    for (int j = 0; j < gh; j++)
    {
        int z = worldZ0 + j * blocksPerPixel;
        for (int i = 0; i < gw; i++)
        {
            int x = worldX0 + i * blocksPerPixel;
            heights[j * gw + i] = surfaceHeightAt(x, z);
        }
    }

    for (int j = 0; j < h; j++)
    {
        int z = worldZ0 + j * blocksPerPixel;
        for (int i = 0; i < w; i++)
        {
            int x = worldX0 + i * blocksPerPixel;
            int hc = heights[j * gw + i];
            int hEast = heights[j * gw + (i + 1)];
            int hSouth = heights[(j + 1) * gw + i];

            int id = resolveVisibleBiome(biomeAtHeight(x, z, hc), hc);

            double slope = (double)((hc - hEast) + (hc - hSouth));
            double shade = 1.0 + slope * 0.012;
            if (shade < 0.55) shade = 0.55;
            else if (shade > 1.35) shade = 1.35;

            paintPixelShaded(outRGBA, j * w + i, id, shade);
        }
    }

    free(heights);
}

// Writes a JSON array of {id,name,color,count} for every biome seen so
// far into a growable static buffer and returns a pointer to it.
EMSCRIPTEN_KEEPALIVE
const char *get_legend_json(void)
{
    static char *buf = NULL;
    static size_t cap = 0;
    if (!cap) { cap = 8192; buf = (char *)malloc(cap); }

    size_t used = 0;
    buf[0] = '\0';
    used += (size_t)snprintf(buf + used, cap - used, "[");

    int first = 1;
    for (int id = 0; id < 256; id++)
    {
        if (biomeSeenCount[id] <= 0) continue;
        const char *name = biome2str(MC_NEWEST, id);
        if (!name) continue;

        char entry[256];
        int n = snprintf(entry, sizeof(entry),
            "%s{\"id\":%d,\"name\":\"%s\",\"color\":\"#%02x%02x%02x\",\"count\":%ld}",
            first ? "" : ",", id, name,
            biomeColors[id][0], biomeColors[id][1], biomeColors[id][2],
            biomeSeenCount[id]);
        first = 0;

        if (used + (size_t)n + 2 > cap)
        {
            cap *= 2;
            buf = (char *)realloc(buf, cap);
        }
        used += (size_t)snprintf(buf + used, cap - used, "%s", entry);
    }
    snprintf(buf + used, cap - used, "]");
    return buf;
}
