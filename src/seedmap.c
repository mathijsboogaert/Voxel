// Generates a surface-biome map and spawn point for a single Minecraft seed.
#include "generator.h"
#include "finders.h"
#include "util.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>

static uint64_t parseSeed(const char *s)
{
    // Accept a plain decimal/negative integer seed.
    return (uint64_t)strtoll(s, NULL, 10);
}

int main(int argc, char **argv)
{
    uint64_t seed = 0;
    int radius = 3000;   // blocks in each direction from spawn
    const char *outBase = "output/seedmap";
    int haveSeed = 0;

    for (int i = 1; i < argc; i++)
    {
        if (!strcmp(argv[i], "--seed") && i + 1 < argc)
        {
            seed = parseSeed(argv[++i]);
            haveSeed = 1;
        }
        else if (!strcmp(argv[i], "--radius") && i + 1 < argc)
        {
            radius = atoi(argv[++i]);
        }
        else if (!strcmp(argv[i], "--out") && i + 1 < argc)
        {
            outBase = argv[++i];
        }
    }

    if (!haveSeed)
    {
        fprintf(stderr, "usage: %s --seed <seed> [--radius <blocks>] [--out <path-without-extension>]\n", argv[0]);
        return 1;
    }
    if (radius < 64) radius = 64;

    int mc = MC_NEWEST;

    Generator g;
    setupGenerator(&g, mc, 0);
    applySeed(&g, DIM_OVERWORLD, seed);

    Pos spawn = getSpawn(&g);

    Range r;
    r.scale = 4;                    // native biome resolution (1 cell = 4x4 blocks)
    r.x = -radius / 4;
    r.z = -radius / 4;
    r.sx = (2 * radius) / 4;
    r.sz = (2 * radius) / 4;
    r.y = 15;                       // ~y=60, sea level: the "surface" biome plane
    r.sy = 1;

    // Recenter the range on spawn (Range coordinates are in scale units).
    r.x += spawn.x / 4;
    r.z += spawn.z / 4;

    int *biomeIds = allocCache(&g, r);
    if (!biomeIds)
    {
        fprintf(stderr, "failed to allocate biome cache\n");
        return 1;
    }
    if (genBiomes(&g, biomeIds, r) != 0)
    {
        fprintf(stderr, "genBiomes failed\n");
        return 1;
    }

    unsigned char biomeColors[256][3];
    initBiomeColors(biomeColors);

    unsigned int imgW = r.sx, imgH = r.sz;
    unsigned char *rgb = (unsigned char *)malloc(3 * (size_t)imgW * imgH);
    // flip must be non-zero here: biomeIds row 0 is the north-most row
    // (min Z), and we want that at the top of the image (north-up). A
    // flip of 0 would invert this and put south at the top.
    biomesToImage(rgb, biomeColors, biomeIds, r.sx, r.sz, 1, 1);

    char ppmPath[4096];
    snprintf(ppmPath, sizeof(ppmPath), "%s.ppm", outBase);
    if (savePPM(ppmPath, rgb, imgW, imgH) != 0)
    {
        fprintf(stderr, "failed to write %s\n", ppmPath);
        return 1;
    }

    // Tally biome frequency for the legend.
    long counts[256] = {0};
    long total = (long)r.sx * r.sz;
    for (long i = 0; i < total; i++)
    {
        int id = biomeIds[i];
        if (id >= 0 && id < 256) counts[id]++;
    }

    char jsonPath[4096];
    snprintf(jsonPath, sizeof(jsonPath), "%s.json", outBase);
    FILE *f = fopen(jsonPath, "w");
    if (!f)
    {
        fprintf(stderr, "failed to write %s\n", jsonPath);
        return 1;
    }

    fprintf(f, "{\n");
    fprintf(f, "  \"seed\": %" PRId64 ",\n", (int64_t)seed);
    fprintf(f, "  \"mcVersion\": \"%s\",\n", mc2str(mc));
    fprintf(f, "  \"spawn\": {\"x\": %d, \"z\": %d},\n", spawn.x, spawn.z);
    fprintf(f, "  \"region\": {\"x0\": %d, \"z0\": %d, \"x1\": %d, \"z1\": %d, \"scale\": %d},\n",
            r.x * 4, r.z * 4, (r.x + (int)r.sx) * 4, (r.z + (int)r.sz) * 4, r.scale);
    fprintf(f, "  \"image\": {\"width\": %u, \"height\": %u, \"blocksPerPixel\": %d},\n",
            imgW, imgH, r.scale);
    fprintf(f, "  \"legend\": [\n");
    int first = 1;
    for (int id = 0; id < 256; id++)
    {
        if (counts[id] <= 0) continue;
        const char *name = biome2str(mc, id);
        if (!name) continue;
        if (!first) fprintf(f, ",\n");
        first = 0;
        double pct = 100.0 * (double)counts[id] / (double)total;
        fprintf(f, "    {\"id\": %d, \"name\": \"%s\", \"color\": \"#%02x%02x%02x\", \"percent\": %.2f}",
                id, name, biomeColors[id][0], biomeColors[id][1], biomeColors[id][2], pct);
    }
    fprintf(f, "\n  ]\n");
    fprintf(f, "}\n");
    fclose(f);

    fprintf(stderr, "wrote %s and %s\n", ppmPath, jsonPath);
    fprintf(stderr, "spawn: x=%d z=%d, mc=%s\n", spawn.x, spawn.z, mc2str(mc));

    free(rgb);
    free(biomeIds);
    return 0;
}
