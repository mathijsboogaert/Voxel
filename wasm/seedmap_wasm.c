// WebAssembly bridge: exposes seed setup, spawn lookup, and on-demand
// biome tile rendering so the browser can pan/zoom an unbounded map,
// computing only the tiles actually visible instead of a fixed image.
#include "generator.h"
#include "finders.h"
#include "util.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>

static Generator g;
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
        haveGenerator = 1;
    }

    setupGenerator(&g, MC_NEWEST, 0);
    applySeed(&g, DIM_OVERWORLD, seed);

    Pos spawn = getSpawn(&g);
    spawnX = spawn.x;
    spawnZ = spawn.z;

    const char *v = mc2str(MC_NEWEST);
    strncpy(mcVersionBuf, v ? v : "?", sizeof(mcVersionBuf) - 1);
    mcVersionBuf[sizeof(mcVersionBuf) - 1] = '\0';

    memset(biomeSeenCount, 0, sizeof(biomeSeenCount));
}

EMSCRIPTEN_KEEPALIVE
int get_spawn_x(void) { return spawnX; }

EMSCRIPTEN_KEEPALIVE
int get_spawn_z(void) { return spawnZ; }

EMSCRIPTEN_KEEPALIVE
const char *get_mc_version(void) { return mcVersionBuf; }

// Accurate single-point lookup (native scale=4) for hover tooltips.
EMSCRIPTEN_KEEPALIVE
const char *get_biome_name_at(int worldX, int worldZ)
{
    if (!haveGenerator) return "";
    int id = getBiomeAt(&g, 4, worldX / 4, 15, worldZ / 4);
    const char *name = biome2str(MC_NEWEST, id);
    return name ? name : "";
}

// Renders one w x h tile of RGBA pixels for the world-space square whose
// north-west corner is (worldX0, worldZ0), sampled at blocksPerPixel
// resolution (Range.scale). Row 0 of the output is the north-most row.
static void paintPixel(unsigned char *outRGBA, int idx, int id)
{
    unsigned char cr = 0, cg = 0, cb = 0;
    if (id >= 0 && id < 256)
    {
        cr = biomeColors[id][0];
        cg = biomeColors[id][1];
        cb = biomeColors[id][2];
        biomeSeenCount[id]++;
    }
    int o = 4 * idx;
    outRGBA[o + 0] = cr;
    outRGBA[o + 1] = cg;
    outRGBA[o + 2] = cb;
    outRGBA[o + 3] = 255;
}

// Renders via a single contiguous genBiomes() call. Only correct/precise
// for blocksPerPixel == 1 (exact per-block Voronoi) or == 4 (native
// biome resolution, sampled exactly). Two separate cubiomes quirks rule
// out every other value:
//  - For scale in (1,4], cubiomes' generic sampler (genBiomeNoise3D)
//    hard-codes its coordinate step as (scale > 4 ? scale/4 : 1), i.e.
//    it treats r.x/r.z as already-quart coordinates for ANY scale <= 4,
//    not just scale==4. So scale=2 or 3 silently samples at the WRONG
//    world position (this bit us at a zoom level where blocksPerPixel
//    worked out to exactly 2 -- the tile rendered, just offset from its
//    true position).
//  - For scale > 4 (e.g. 8, 16, 32 at zoomed-out levels), the coordinate
//    math would work out, but cubiomes switches to a documented fast/
//    imprecise sampling flag for that regime (meant for structure
//    placement, not visualization) -- point sampling avoids that too.
static int canUseGenBiomes(int blocksPerPixel)
{
    return blocksPerPixel == 1 || blocksPerPixel == 4;
}

static void renderTileViaGenBiomes(int worldX0, int worldZ0, int w, int h, int blocksPerPixel, unsigned char *outRGBA)
{
    Range r;
    r.scale = blocksPerPixel;
    r.x = worldX0 / blocksPerPixel;
    r.z = worldZ0 / blocksPerPixel;
    r.sx = w;
    r.sz = h;
    r.y = (blocksPerPixel == 1) ? 63 : 15; // sea level, in this scale's own vertical units
    r.sy = 1;

    int *ids = allocCache(&g, r);
    if (!ids) return;
    if (genBiomes(&g, ids, r) != 0) { free(ids); return; }

    for (int j = 0; j < h; j++)
        for (int i = 0; i < w; i++)
            paintPixel(outRGBA, j * w + i, ids[j * w + i]);

    free(ids);
}

// Direct per-pixel point sampling at true scale=4 accuracy, bypassing
// genBiomes/Range entirely (and therefore immune to the coordinate bug
// above). Used whenever canUseGenBiomes() says no, and also for any
// zoomed-out tile where genBiomes' coarse-scale path would otherwise use
// its documented-imprecise fast approximation. Supersamples a small grid
// per pixel and paints the majority biome once blocksPerPixel is large
// enough that a lone sample would visibly alias against real (often
// narrow) biome regions; at near-native resolution a single sample is
// already as accurate as the data gets, so we skip the extra work.
static void renderTileViaPointSampling(int worldX0, int worldZ0, int w, int h, int blocksPerPixel, unsigned char *outRGBA)
{
    const int SS = blocksPerPixel > 4 ? 3 : 1; // samples per axis, per output pixel
    int64_t np[6];
    int ids[9];

    for (int j = 0; j < h; j++)
    {
        for (int i = 0; i < w; i++)
        {
            int n = 0;
            for (int sy = 0; sy < SS; sy++)
            {
                int z4 = (worldZ0 + (int)(((double)j + (sy + 0.5) / SS) * blocksPerPixel)) / 4;
                for (int sx = 0; sx < SS; sx++)
                {
                    int x4 = (worldX0 + (int)(((double)i + (sx + 0.5) / SS) * blocksPerPixel)) / 4;
                    ids[n++] = sampleBiomeNoise(&g.bn, np, x4, 15, z4, 0, 0);
                }
            }

            int bestId = ids[0], bestCount = 0;
            for (int a = 0; a < n; a++)
            {
                int count = 0;
                for (int b = 0; b < n; b++)
                    if (ids[b] == ids[a]) count++;
                if (count > bestCount) { bestCount = count; bestId = ids[a]; }
            }
            paintPixel(outRGBA, j * w + i, bestId);
        }
    }
}

EMSCRIPTEN_KEEPALIVE
void render_tile(int worldX0, int worldZ0, int w, int h, int blocksPerPixel, unsigned char *outRGBA)
{
    if (!haveGenerator || w <= 0 || h <= 0) return;
    if (blocksPerPixel < 1) blocksPerPixel = 1;

    if (canUseGenBiomes(blocksPerPixel))
        renderTileViaGenBiomes(worldX0, worldZ0, w, h, blocksPerPixel, outRGBA);
    else
        renderTileViaPointSampling(worldX0, worldZ0, w, h, blocksPerPixel, outRGBA);
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
