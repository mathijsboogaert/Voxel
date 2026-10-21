#!/usr/bin/env python3
"""Render the explored part of the world into map tiles for the site.

Usage:
  python3 tools/world/render_world.py <archive.tar | folder-with-.mca-files> [options]

It reads the Overworld region files (straight from a .tar, no unpacking needed), looks at the top
block of every column (so builds show, not just terrain), colours it like Minecraft's own map with
biome tints and hill shading, and writes a tile pyramid to docs/tiles/ for the Leaflet map.

Everything that has been explored is drawn, but at two levels of detail to keep the tile set small:
  * zoom 12 and 11 (one and two blocks per pixel, where builds are readable) only around the places
    where people are: a neighbourhood around every border, every shop and the spawn (from
    docs/borders.json and docs/shops.json), --margin blocks beyond each one;
  * zoom 10 and below (four blocks per pixel and up) for every region in the archive, so the whole
    explored world can be seen when zoomed out.
The map falls back to the coarser tiles where the detailed ones don't exist. Tiles are lossless WebP.

Options:
  --out DIR       tile folder (default docs/tiles)
  --margin N      extra blocks of full detail around each border/shop (default 768)
  --detail near|all  full detail only near people (default), or everywhere (about six times the size)
  --bounds a,b,c,d  render only this block box (x0,z0,x1,z1), at full detail
  --cache DIR     intermediate results (default ~/.cache/voxel-world); only changed regions are redone
  --workers N     processes (default: all cores)
  --force         ignore the cache
  --only rx,rz[;rx,rz]   render just these regions (for testing)

Standard library plus Pillow. Reading the format: Anvil .mca files, chunks written by Minecraft 26.x.
"""

import argparse
import array
import collections
import gzip
import json
import math
import os
import pickle
import re
import struct
import sys
import tarfile
import time
import zlib
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import biomes as biome_tints  # noqa: E402
import nbt  # noqa: E402

REGION, TILE, NATIVE_ZOOM, MIN_ZOOM, DETAIL_MIN_ZOOM = 512, 256, 12, 6, 11
SPAWN = (32, -4)
PIXELS = REGION * REGION
FLUID_WATER, FLUID_LAVA = 1, 2
LAVA_COLOR = 0xE0540A
BLUR = 3  # biome tint blend radius, in blocks


# ------------------------------------------------------------------------------------------------
# Where the region files come from
# ------------------------------------------------------------------------------------------------
class Source:
    """A .tar of region files, or a folder of them. Reads one region at a time, no unpacking."""

    def __init__(self, path):
        self.path = os.path.abspath(path)
        self.entries = {}  # (rx, rz) -> (offset, size, mtime) for a tar, (None, size, mtime) for files
        self._fd = None
        pat = re.compile(r'r\.(-?\d+)\.(-?\d+)\.mca$')
        if os.path.isdir(self.path):
            base = os.path.join(self.path, 'region') if os.path.isdir(os.path.join(self.path, 'region')) else self.path
            self.base = base
            for name in os.listdir(base):
                m = pat.search(name)
                if m:
                    st = os.stat(os.path.join(base, name))
                    self.entries[(int(m[1]), int(m[2]))] = (None, st.st_size, int(st.st_mtime))
        else:
            with tarfile.open(self.path) as tf:
                for mem in tf.getmembers():
                    m = pat.search(mem.name)
                    if m and mem.isfile():
                        self.entries[(int(m[1]), int(m[2]))] = (mem.offset_data, mem.size, int(mem.mtime))

    def fingerprint(self, key):
        _, size, mtime = self.entries[key]
        return f'{size}:{mtime}'

    def read(self, key):
        offset, size, _ = self.entries[key]
        if offset is None:
            with open(os.path.join(self.base, f'r.{key[0]}.{key[1]}.mca'), 'rb') as f:
                return f.read()
        if self._fd is None:
            self._fd = os.open(self.path, os.O_RDONLY)
        return os.pread(self._fd, size, offset)


_SOURCES = {}
_TABLES = None


def source_for(path):
    if path not in _SOURCES:
        _SOURCES[path] = Source(path)
    return _SOURCES[path]


def tables():
    """Colour tables, loaded once per process."""
    global _TABLES
    if _TABLES is None:
        with open(os.path.join(HERE, 'colors.json')) as f:
            c = json.load(f)
        fluids = set(c['water']) | {'minecraft:lava'}
        _TABLES = dict(
            color=c['blocks'],
            air=set(c['air']) | {'minecraft:air'},
            fluid=fluids,
            glass=set(c['glass']),
            flat=set(c['flat']),
            grass=set(c['grass']),
            foliage=set(c['foliage']),
            dry=set(c['dry_foliage']),
            overrides={
                'grass': c['biome_grass'],
                'foliage': c['biome_foliage'],
                'dry_foliage': c['biome_dry_foliage'],
            },
        )
    return _TABLES


# ------------------------------------------------------------------------------------------------
# Phase 1: read a region, find the visible block in every column
# ------------------------------------------------------------------------------------------------
def _name(entry):
    """A block-state palette entry as an id. 26.3 writes plain states as strings (wrapped as {"": id}
    inside a mixed list) and customised ones as compounds; older worlds use Name/Properties."""
    if isinstance(entry, str):
        return entry
    return entry.get('') or entry.get('Name') or entry.get('id') or 'minecraft:air'


def _packed(palette_len, min_bits):
    bits = max(min_bits, (palette_len - 1).bit_length())
    return bits, 64 // bits, (1 << bits) - 1


def _heightmap(longs):
    n = len(longs) // 8
    bits = next(b for b in range(4, 17) if -(-PIXELS_PER_CHUNK // (64 // b)) == n)
    per, mask = 64 // bits, (1 << bits) - 1
    out = []
    for i in range(n):
        v = struct.unpack_from('>Q', longs, i * 8)[0]
        for k in range(per):
            out.append((v >> (k * bits)) & mask)
    return out[:PIXELS_PER_CHUNK]


PIXELS_PER_CHUNK = 256
_unpack_q = struct.Struct('>Q').unpack_from


def scan_region(job):
    """Phase 1 for one region: returns a record with, per column, the visible block's colour and height."""
    key, src_path, cache_file, fingerprint = job
    t = tables()
    color, AIR, FLUID, GLASS, FLAT = t['color'], t['air'], t['fluid'], t['glass'], t['flat']
    GRASS, FOLIAGE, DRY = t['grass'], t['foliage'], t['dry']
    src = source_for(src_path)
    buf = src.read(key)

    present = bytearray(PIXELS)
    heights = array.array('h', bytes(2 * PIXELS))
    rgb = bytearray(3 * PIXELS)
    kind = bytearray(PIXELS)
    depth = bytearray(PIXELS)
    fluid = bytearray(PIXELS)
    bidx = bytearray(PIXELS)
    names = ['minecraft:plains']  # index 0 doubles as "no data" so blurs never mix in black
    name_ix = {'minecraft:plains': 0}
    glass_cols = {}
    unknown = collections.Counter()
    skipped = 0

    for ci in range(1024):
        off = int.from_bytes(buf[ci * 4 : ci * 4 + 3], 'big')
        if not off:
            continue
        pos = off * 4096
        length = struct.unpack_from('>I', buf, pos)[0]
        comp = buf[pos + 4]
        body = buf[pos + 5 : pos + 4 + length]
        try:
            raw = (
                zlib.decompress(body)
                if comp == 2
                else gzip.decompress(body)
                if comp == 1
                else body
                if comp == 3
                else None
            )
            if raw is None:
                skipped += 1
                continue
            chunk = nbt.parse(raw)
        except Exception:
            skipped += 1
            continue
        if chunk.get('Status') not in ('minecraft:full', 'full') or 'sections' not in chunk:
            continue

        min_y = chunk.get('yPos', -4) * 16
        secs = {}
        for s in chunk['sections']:
            bs = s.get('block_states')
            if not bs:
                continue
            pal = [_name(e) for e in bs['palette']]
            data = bs.get('data') if len(pal) > 1 else None
            bits, per, mask = _packed(len(pal), 4)
            bio = s.get('biomes') or {}
            bpal = [_name(e) for e in bio.get('palette', [])] or ['minecraft:plains']
            bdata = bio.get('data') if len(bpal) > 1 else None
            bbits, bper, bmask = _packed(len(bpal), 1)
            secs[s['Y']] = (pal, data, bits, per, mask, bpal, bdata, bbits, bper, bmask)
        if not secs:
            continue
        try:
            hm = _heightmap(chunk['Heightmaps']['WORLD_SURFACE'])
        except Exception:
            top = max(secs) * 16 + 16
            hm = [top - min_y] * PIXELS_PER_CHUNK

        cx, cz = ci & 31, ci >> 5
        for zi in range(16):
            for xi in range(16):
                y = hm[zi * 16 + xi] + min_y - 1  # the highest block; the heightmap stores the air above it
                fl_y = None
                fl_id = None
                gl = []
                bid = 'minecraft:air'
                col = 0
                found = False
                while y >= min_y:
                    s = secs.get(y >> 4)
                    if s is None:
                        y -= 1
                        continue
                    pal, data = s[0], s[1]
                    if data is None:
                        bid = pal[0]
                    else:
                        i = ((y & 15) << 8) | (zi << 4) | xi
                        v = _unpack_q(data, (i // s[3]) * 8)[0]
                        k = (v >> ((i % s[3]) * s[2])) & s[4]
                        bid = pal[k] if k < len(pal) else 'minecraft:air'
                    if bid in AIR:
                        y -= 1
                        continue
                    if bid in FLUID:
                        if fl_y is None:
                            fl_y, fl_id = y, bid
                        y -= 1
                        continue
                    if bid in GLASS:
                        gl.append(color.get(bid, 0xAAAAAA))
                        y -= 1
                        continue
                    col = color.get(bid)
                    if col is None:
                        unknown[bid] += 1
                        col = 0x808080
                    if col > 0:
                        found = True
                        break
                    y -= 1  # black means "invisible" (buttons, signs...)
                if not found and fl_y is None:
                    continue  # nothing here (void)
                pi = (cz * 16 + zi) * REGION + cx * 16 + xi
                present[pi] = 1
                if not found:  # fluid all the way down
                    y = min_y
                    col = 0x202020
                    bid = 'minecraft:stone'
                if bid in FLAT:
                    y -= 1
                heights[pi] = y
                rgb[pi * 3 : pi * 3 + 3] = col.to_bytes(3, 'big')
                kd = 1 if bid in GRASS else 2 if bid in FOLIAGE else 3 if bid in DRY else 0
                kind[pi] = kd
                if gl:
                    glass_cols[pi] = gl
                if fl_y is not None:
                    fluid[pi] = FLUID_LAVA if fl_id == 'minecraft:lava' else FLUID_WATER
                    depth[pi] = min(255, fl_y - y)
                if kd or fluid[pi] == FLUID_WATER:
                    by = fl_y if fl_y is not None else y
                    s = secs.get(by >> 4) or secs[min(secs, key=lambda q: abs(q - (by >> 4)))]
                    bpal, bdata = s[5], s[6]
                    if bdata is None:
                        bn = bpal[0]
                    else:
                        j = (((by & 15) >> 2) << 4) | ((zi >> 2) << 2) | (xi >> 2)
                        v = _unpack_q(bdata, (j // s[8]) * 8)[0]
                        kk = (v >> ((j % s[8]) * s[7])) & s[9]
                        bn = bpal[kk] if kk < len(bpal) else bpal[0]
                    ix = name_ix.get(bn)
                    if ix is None:
                        ix = name_ix[bn] = len(names)
                        names.append(bn)
                    bidx[pi] = ix if ix < 256 else 0

    rec = dict(
        fp=fingerprint,
        present=bytes(present),
        heights=heights.tobytes(),
        rgb=bytes(rgb),
        kind=bytes(kind),
        depth=bytes(depth),
        fluid=bytes(fluid),
        bidx=bytes(bidx),
        biomes=names,
        glass=glass_cols,
        unknown=dict(unknown),
        skipped=skipped,
    )
    with open(cache_file, 'wb') as f:
        f.write(zlib.compress(pickle.dumps(rec, protocol=4), 3))
    return key, sum(present), dict(unknown), skipped


def load_record(cache_file):
    with open(cache_file, 'rb') as f:
        return pickle.loads(zlib.decompress(f.read()))


# ------------------------------------------------------------------------------------------------
# Phase 2: tints, hill shading, water depth -> a 512x512 picture per region
# ------------------------------------------------------------------------------------------------
def _clamp(v, lo, hi):
    return lo if v < lo else hi if v > hi else v


def shade_region(job):
    key, cache_dir, png_file = job
    rx, rz = key
    t = tables()
    rec = load_record(os.path.join(cache_dir, f'r.{rx}.{rz}.rec'))
    present, rgb, kind, depth, fluid, bidx = (
        rec['present'],
        rec['rgb'],
        rec['kind'],
        rec['depth'],
        rec['fluid'],
        rec['bidx'],
    )
    heights = array.array('h')
    heights.frombytes(rec['heights'])
    glass = rec['glass']

    # Neighbour heights, so hills shade smoothly across region borders instead of showing a seam.
    north_row = west_col = None
    for (nx, nz), which in (((rx, rz - 1), 'n'), ((rx - 1, rz), 'w')):
        f = os.path.join(cache_dir, f'r.{nx}.{nz}.rec')
        if os.path.exists(f):
            nrec = load_record(f)
            nh = array.array('h')
            nh.frombytes(nrec['heights'])
            npres = nrec['present']
            if which == 'n':
                north_row = [
                    (nh[(REGION - 1) * REGION + x] if npres[(REGION - 1) * REGION + x] else None) for x in range(REGION)
                ]
            else:
                west_col = [
                    (nh[z * REGION + REGION - 1] if npres[z * REGION + REGION - 1] else None) for z in range(REGION)
                ]

    # Biome tints become four palette images; a small blur blends them across biome edges.
    names = rec['biomes']
    tint_rows = [biome_tints.tints(n, t['overrides']) for n in names]
    blurred = []
    for slot in range(4):
        img = Image.frombytes('P', (REGION, REGION), bytes(bidx))
        pal = []
        for tr in tint_rows:
            c = tr[slot]
            pal += [(c >> 16) & 255, (c >> 8) & 255, c & 255]
        pal += [0] * (768 - len(pal))
        img.putpalette(pal)
        blurred.append(img.convert('RGB').filter(ImageFilter.BoxBlur(BLUR)).tobytes())
    grass_t, foliage_t, dry_t, water_t = blurred

    out = bytearray(4 * PIXELS)
    for pi in range(PIXELS):
        if not present[pi]:
            continue
        r, g, b = rgb[pi * 3], rgb[pi * 3 + 1], rgb[pi * 3 + 2]
        kd = kind[pi]
        if kd:  # biome tint: the block's own colour averaged with the biome's
            tb = grass_t if kd == 1 else foliage_t if kd == 2 else dry_t
            r, g, b = (r + tb[pi * 3]) >> 1, (g + tb[pi * 3 + 1]) >> 1, (b + tb[pi * 3 + 2]) >> 1
        fl = fluid[pi]
        if fl == FLUID_LAVA:
            r, g, b = (LAVA_COLOR >> 16) & 255, (LAVA_COLOR >> 8) & 255, LAVA_COLOR & 255
        else:
            # Hill shade: lighter where the ground is higher than to the north and west (light from the north-west).
            z, x = divmod(pi, REGION)
            h = heights[pi]
            hn = (
                heights[pi - REGION]
                if z > 0 and present[pi - REGION]
                else (north_row[x] if z == 0 and north_row and north_row[x] is not None else h)
            )
            hw = (
                heights[pi - 1]
                if x > 0 and present[pi - 1]
                else (west_col[z] if x == 0 and west_col and west_col[z] is not None else h)
            )
            f = 1.0 + _clamp(((h - hn) + (h - hw)) * 0.06, -0.20, 0.20)
            if fl == FLUID_WATER:
                f = 1.0
            r, g, b = int(r * f), int(g * f), int(b * f)
            if fl == FLUID_WATER:  # water over whatever is on the floor, deeper = more opaque and darker
                d = depth[pi]
                wr, wg, wb = water_t[pi * 3], water_t[pi * 3 + 1], water_t[pi * 3 + 2]
                a = min(0.93, 0.42 + 0.035 * d)
                dark = 1.0 - min(0.38, d * 0.012)
                r = int((r + (wr - r) * a) * dark)
                g = int((g + (wg - g) * a) * dark)
                b = int((b + (wb - b) * a) * dark)
        gl = glass.get(pi)
        if gl:
            for gc in reversed(gl):  # deepest pane first, then the ones above it
                r += (((gc >> 16) & 255) - r) * 0.6
                g += (((gc >> 8) & 255) - g) * 0.6
                b += ((gc & 255) - b) * 0.6
            r, g, b = int(r), int(g), int(b)
        o = pi * 4
        out[o] = _clamp(int(r), 0, 255)
        out[o + 1] = _clamp(int(g), 0, 255)
        out[o + 2] = _clamp(int(b), 0, 255)
        out[o + 3] = 255
    Image.frombytes('RGBA', (REGION, REGION), bytes(out)).save(png_file, optimize=False, compress_level=1)
    return key


# ------------------------------------------------------------------------------------------------
# Where to render, and the tile pyramid
# ------------------------------------------------------------------------------------------------
def people_regions(docs, margin):
    """Every region within `margin` blocks of a border, a shop or the spawn."""
    boxes = [(SPAWN[0], SPAWN[1], SPAWN[0], SPAWN[1])]
    for name in ('borders.json', 'shops.json'):
        path = os.path.join(docs, name)
        if os.path.exists(path):
            with open(path) as f:
                items = json.load(f)
            for item in items:
                pts = item.get('points') or [item]
                xs = [p['x'] for p in pts if 'x' in p]
                zs = [p['z'] for p in pts if 'z' in p]
                if xs and zs:
                    boxes.append((min(xs), min(zs), max(xs), max(zs)))
    out = set()
    for x0, z0, x1, z1 in boxes:
        rx0, rz0, rx1, rz1 = region_range(x0 - margin, z0 - margin, x1 + margin, z1 + margin)
        out.update((rx, rz) for rx in range(rx0, rx1 + 1) for rz in range(rz0, rz1 + 1))
    return out


def region_range(x0, z0, x1, z1):
    return (
        math.floor(x0 / REGION),
        math.floor(z0 / REGION),
        math.floor((x1 - 1) / REGION),
        math.floor((z1 - 1) / REGION),
    )


def reduce_half(img):
    """Halve a picture without letting transparent pixels darken the edges (averages premultiplied colour)."""
    return img.convert('RGBa').reduce(2).convert('RGBA')


def quarter(img):
    """Shrink to a quarter of the width (a sixteenth of the pixels), premultiplied like reduce_half."""
    return img.convert('RGBa').reduce(4).convert('RGBA')


def build_tiles(region_pngs, detail, out_dir, box, source_label):
    """Tile pyramid. Zoom 12/11 come from the `detail` regions only; zoom 10 and below from all of them."""
    t0 = time.time()
    pyramid = {}
    # Zoom 12 (one pixel per block) and 11, for the detailed regions.
    level12 = {}
    for rx, rz in detail:
        if (rx, rz) not in region_pngs:
            continue
        img = Image.open(region_pngs[(rx, rz)]).convert('RGBA')
        for j in range(2):
            for i in range(2):
                tile = img.crop((i * TILE, j * TILE, (i + 1) * TILE, (j + 1) * TILE))
                if tile.getchannel('A').getbbox():
                    level12[(rx * 2 + i, rz * 2 + j)] = tile
    if level12:
        pyramid[12] = level12
        groups = collections.defaultdict(dict)
        for (x, y), tile in level12.items():
            groups[(x >> 1, y >> 1)][(x & 1, y & 1)] = tile
        level11 = {}
        for key, kids in groups.items():
            canvas = Image.new('RGBA', (TILE * 2, TILE * 2), (0, 0, 0, 0))
            for (i, j), tile in kids.items():
                canvas.paste(tile, (i * TILE, j * TILE))
            small = reduce_half(canvas)
            if small.getchannel('A').getbbox():
                level11[key] = small
        pyramid[11] = level11

    # Zoom 10 (a tile is 2x2 regions at four blocks per pixel), for every region.
    groups = collections.defaultdict(list)
    for (rx, rz), png in region_pngs.items():
        groups[(rx >> 1, rz >> 1)].append((rx & 1, rz & 1, png))
    level10 = {}
    for key, parts in groups.items():
        canvas = Image.new('RGBA', (TILE, TILE), (0, 0, 0, 0))
        for i, j, png in parts:
            canvas.paste(quarter(Image.open(png).convert('RGBA')), (i * REGION // 4, j * REGION // 4))
        if canvas.getchannel('A').getbbox():
            level10[key] = canvas
    pyramid[10] = level10
    for z in range(9, MIN_ZOOM - 1, -1):
        groups, parent = collections.defaultdict(dict), {}
        for (x, y), tile in pyramid[z + 1].items():
            groups[(x >> 1, y >> 1)][(x & 1, y & 1)] = tile
        for key, kids in groups.items():
            canvas = Image.new('RGBA', (TILE * 2, TILE * 2), (0, 0, 0, 0))
            for (i, j), tile in kids.items():
                canvas.paste(tile, (i * TILE, j * TILE))
            small = reduce_half(canvas)
            if small.getchannel('A').getbbox():
                parent[key] = small
        pyramid[z] = parent

    # Write the tiles (encoding releases the GIL, so threads do help), and drop any that no longer exist.
    os.makedirs(out_dir, exist_ok=True)
    jobs, keep = [], set()
    for z, tiles in pyramid.items():
        for (x, y), tile in tiles.items():
            path = os.path.join(out_dir, str(z), str(x), f'{y}.webp')
            os.makedirs(os.path.dirname(path), exist_ok=True)
            jobs.append((path, tile))
            keep.add(os.path.abspath(path))
    with ThreadPoolExecutor(os.cpu_count() or 4) as ex:
        list(ex.map(lambda pt: pt[1].save(pt[0], 'WEBP', lossless=True, quality=100, method=4), jobs))
    size = sum(os.path.getsize(p) for p in keep)
    for root, _, files in os.walk(out_dir):
        for fn in files:
            p = os.path.abspath(os.path.join(root, fn))
            if fn.endswith(('.png', '.webp')) and p not in keep:
                os.remove(p)
    for root, _dirs, _files in os.walk(out_dir, topdown=False):  # tidy empty folders
        if root != out_dir and not os.listdir(root):
            os.rmdir(root)

    x0, z0, x1, z1 = box
    manifest = dict(
        version=1,
        tileSize=TILE,
        minZoom=MIN_ZOOM,
        maxZoom=NATIVE_ZOOM,
        detailMinZoom=DETAIL_MIN_ZOOM,
        format='webp',
        bounds=dict(x0=x0, z0=z0, x1=x1, z1=z1),
        generated=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        source=source_label,
        tiles={str(z): sorted([x, y] for (x, y) in tiles) for z, tiles in pyramid.items()},
    )
    with open(os.path.join(out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    return sum(len(v) for v in pyramid.values()), size, time.time() - t0, pyramid


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source')
    ap.add_argument('--out', default=os.path.join(HERE, '..', '..', 'docs', 'tiles'))
    ap.add_argument('--margin', type=int, default=768)
    ap.add_argument('--detail', choices=('near', 'all'), default='near')
    ap.add_argument('--bounds')
    ap.add_argument('--cache', default=os.path.expanduser('~/.cache/voxel-world'))
    ap.add_argument('--workers', type=int, default=os.cpu_count() or 2)
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--only')
    ap.add_argument('--preview', help='also write one overview picture here')
    a = ap.parse_args()

    out_dir = os.path.abspath(a.out)
    docs = os.path.dirname(out_dir)
    os.makedirs(a.cache, exist_ok=True)
    src = Source(a.source)
    if not src.entries:
        sys.exit('No r.X.Z.mca region files found in ' + a.source)

    everything = set(src.entries)
    if a.only:
        detail = regions = {tuple(int(v) for v in p.split(',')) for p in a.only.split(';')} & everything
    elif a.bounds:
        bx = region_range(*(int(v) for v in a.bounds.split(',')))
        detail = regions = {(rx, rz) for rx in range(bx[0], bx[2] + 1) for rz in range(bx[1], bx[3] + 1)} & everything
    elif a.detail == 'all':
        detail = regions = everything
    else:
        regions, detail = everything, people_regions(docs, a.margin) & everything
    todo = sorted(regions)
    if not todo:
        sys.exit('None of the wanted regions are in the archive.')
    box = (
        min(k[0] for k in todo) * REGION,
        min(k[1] for k in todo) * REGION,
        (max(k[0] for k in todo) + 1) * REGION,
        (max(k[1] for k in todo) + 1) * REGION,
    )
    print(
        f'{len(todo)} regions in the map (blocks x {box[0]}..{box[2]}, z {box[1]}..{box[3]}); '
        f'full detail for {len(detail)} of them ({len(detail) * 100 // len(todo)}%), the rest from zoom 10 and out.'
    )

    t0 = time.time()

    def recfile(k):
        return os.path.join(a.cache, f'r.{k[0]}.{k[1]}.rec')

    stale = []
    for k in todo:
        fp = src.fingerprint(k)
        f = recfile(k)
        ok = False
        if not a.force and os.path.exists(f):
            try:
                ok = load_record(f)['fp'] == fp
            except Exception:
                ok = False
        if not ok:
            stale.append((k, src.path, f, fp))
    print(
        f'Phase 1: reading {len(stale)} changed regions ({len(todo) - len(stale)} unchanged, from cache)',
        f'with {a.workers} workers',
    )
    unknown = collections.Counter()
    done = 0
    with ProcessPoolExecutor(a.workers) as pool:
        for key, n, unk, skipped in pool.map(scan_region, stale, chunksize=1):
            done += 1
            unknown.update(unk)
            if done % 20 == 0 or done == len(stale) or skipped:
                print(
                    f'  [{done}/{len(stale)}] r.{key[0]}.{key[1]}: {n // 256} chunks'
                    + (f', {skipped} unreadable' if skipped else ''),
                    flush=True,
                )

        # Phase 2 redoes every region that changed or sits next to one that did (shading reads neighbours).
        changed = {j[0] for j in stale}
        redo = [
            k
            for k in todo
            if k in changed
            or (k[0] - 1, k[1]) in changed
            or (k[0], k[1] - 1) in changed
            or not os.path.exists(os.path.join(a.cache, f'r.{k[0]}.{k[1]}.png'))
        ]
        print(f'Phase 2: colouring and shading {len(redo)} regions')
        jobs = [(k, a.cache, os.path.join(a.cache, f'r.{k[0]}.{k[1]}.png')) for k in redo]
        for i, _ in enumerate(pool.map(shade_region, jobs, chunksize=1), 1):
            if i % 50 == 0 or i == len(jobs):
                print(f'  [{i}/{len(jobs)}]', flush=True)

    pngs = {
        k: os.path.join(a.cache, f'r.{k[0]}.{k[1]}.png')
        for k in todo
        if os.path.exists(os.path.join(a.cache, f'r.{k[0]}.{k[1]}.png'))
    }
    print(f'Phase 3: building tiles for {len(pngs)} regions')
    count, size, secs, pyramid = build_tiles(pngs, detail, out_dir, box, os.path.basename(a.source))
    per_zoom = ', '.join(f'z{z}: {len(t)}' for z, t in sorted(pyramid.items(), reverse=True))
    print(
        f'Wrote {count} tiles ({per_zoom}), {size / 1e6:.1f} MB, to {out_dir}',
        f'in {secs:.0f}s (whole run {time.time() - t0:.0f}s)',
    )
    if unknown:
        print(
            'Blocks with no colour in colors.json (drawn grey):',
            ', '.join(f'{k} x{v}' for k, v in unknown.most_common(15)),
        )
    if a.preview and 8 in pyramid:
        tiles = pyramid[8]
        xs, ys = [k[0] for k in tiles], [k[1] for k in tiles]
        canvas = Image.new('RGBA', ((max(xs) - min(xs) + 1) * TILE, (max(ys) - min(ys) + 1) * TILE), (20, 20, 20, 255))
        for (x, y), tile in tiles.items():
            canvas.paste(tile, ((x - min(xs)) * TILE, (y - min(ys)) * TILE), tile)
        canvas.convert('RGB').save(a.preview)
        print('Preview written to', a.preview)


if __name__ == '__main__':
    main()
