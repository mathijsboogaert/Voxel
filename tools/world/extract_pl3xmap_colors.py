#!/usr/bin/env python3
"""Rebuild colors.json from a checkout of Pl3xMap (MIT licence, see NOTICE.md).

Usage:  python3 extract_pl3xmap_colors.py path/to/Pl3xMap
Reads the block colours (Mojang's map colours, plus Pl3xMap's own tweaks) and the lists of blocks that
are air, foliage, grass, water, glass or "flat", from Pl3xMap's Java source. Only needed when a new
Minecraft version adds blocks; the result is committed so rendering needs no checkout.
"""

import json
import os
import re
import sys

root = sys.argv[1]
core = os.path.join(root, 'core/src/main/java/net/pl3x/map/core')
with open(os.path.join(core, 'world/Blocks.java')) as f:
    blocks_java = f.read()
with open(os.path.join(core, 'configuration/ColorsConfig.java')) as f:
    cfg = f.read()

vanilla = {m[0]: int(m[1], 16) for m in re.findall(r'new Block\(\d+, "([^"]+)", 0x([0-9A-Fa-f]{1,8})\)', blocks_java)}


def section(name, kind):
    """The body of `public static <kind> NAME = new ...{{ ... }};` in ColorsConfig."""
    m = re.search(
        rf'public static (?:Map<String, Integer>|List<String>) {name} = new [A-Za-z<>, ]+\(\) \{{\{{(.*?)\}}\}};',
        cfg,
        re.S,
    )
    body = m.group(1)
    if kind == 'map':
        return {k: int(v, 16) for k, v in re.findall(r'put\("([^"]+)",\s*0x([0-9A-Fa-f]+)\)', body)}
    return re.findall(r'^\s*add\("([^"]+)"\)', body, re.M)


overrides = section('BLOCK_COLORS', 'map')
blocks = {**vanilla, **overrides}  # Pl3xMap's own value wins when it has one
out = {
    'source': 'Pl3xMap (MIT) block colours and block lists',
    'blocks': {k: blocks[k] for k in sorted(blocks)},
    'air': section('BLOCKS_AIR', 'list'),
    'foliage': section('BLOCKS_FOLIAGE', 'list'),
    'dry_foliage': section('BLOCKS_DRY_FOLIAGE', 'list'),
    'grass': section('BLOCKS_GRASS', 'list'),
    'water': section('BLOCKS_WATER', 'list'),
    'glass': section('BLOCKS_GLASS', 'list'),
    'flat': section('BLOCKS_FLAT', 'list'),
    'biome_grass': section('BIOME_GRASS', 'map'),
    'biome_foliage': section('BIOME_FOLIAGE', 'map'),
    'biome_dry_foliage': section('BIOME_DRY_FOLIAGE', 'map'),
}
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, 'colors.json'), 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print({k: (len(v) if hasattr(v, '__len__') else v) for k, v in out.items()})
