"""Per-biome tints for grass, foliage, dry foliage and water.

Minecraft colours grass and leaves from a colour map indexed by a biome's temperature and downfall.
That map is (very nearly) a straight blend between three corner colours, which is all this needs:
hot and dry, cold, and hot and wet. A few biomes override the map outright. Biomes this table does not
know (new ones in a new version) fall back to plains, so they are tinted plausibly rather than missing.
"""

# (temperature, downfall) for the overworld biomes.
CLIMATE = {
    'plains': (0.8, 0.4),
    'sunflower_plains': (0.8, 0.4),
    'snowy_plains': (0.0, 0.5),
    'ice_spikes': (0.0, 0.5),
    'desert': (2.0, 0.0),
    'swamp': (0.8, 0.9),
    'mangrove_swamp': (0.8, 0.9),
    'forest': (0.7, 0.8),
    'flower_forest': (0.7, 0.8),
    'birch_forest': (0.6, 0.6),
    'old_growth_birch_forest': (0.6, 0.6),
    'dark_forest': (0.7, 0.8),
    'pale_garden': (0.7, 0.8),
    'dappled_forest': (0.7, 0.8),
    'taiga': (0.25, 0.8),
    'old_growth_pine_taiga': (0.3, 0.8),
    'old_growth_spruce_taiga': (0.25, 0.8),
    'snowy_taiga': (-0.5, 0.4),
    'savanna': (2.0, 0.0),
    'savanna_plateau': (2.0, 0.0),
    'windswept_savanna': (2.0, 0.0),
    'jungle': (0.95, 0.9),
    'sparse_jungle': (0.95, 0.8),
    'bamboo_jungle': (0.95, 0.9),
    'badlands': (2.0, 0.0),
    'eroded_badlands': (2.0, 0.0),
    'wooded_badlands': (2.0, 0.0),
    'meadow': (0.5, 0.8),
    'cherry_grove': (0.5, 0.8),
    'grove': (-0.2, 0.8),
    'snowy_slopes': (-0.3, 0.9),
    'frozen_peaks': (-0.7, 0.9),
    'jagged_peaks': (-0.7, 0.9),
    'stony_peaks': (1.0, 0.3),
    'windswept_hills': (0.2, 0.3),
    'windswept_gravelly_hills': (0.2, 0.3),
    'windswept_forest': (0.2, 0.3),
    'river': (0.5, 0.5),
    'frozen_river': (0.0, 0.5),
    'beach': (0.8, 0.4),
    'snowy_beach': (0.05, 0.3),
    'stony_shore': (0.2, 0.3),
    'warm_ocean': (0.5, 0.5),
    'lukewarm_ocean': (0.5, 0.5),
    'deep_lukewarm_ocean': (0.5, 0.5),
    'ocean': (0.5, 0.5),
    'deep_ocean': (0.5, 0.5),
    'cold_ocean': (0.5, 0.5),
    'deep_cold_ocean': (0.5, 0.5),
    'frozen_ocean': (0.0, 0.5),
    'deep_frozen_ocean': (0.0, 0.5),
    'mushroom_fields': (0.9, 1.0),
    'lush_caves': (0.5, 0.5),
    'dripstone_caves': (0.8, 0.4),
    'deep_dark': (0.8, 0.4),
}

WATER = {
    'swamp': 0x617B64,
    'mangrove_swamp': 0x3A7A6A,
    'cherry_grove': 0x5DB7EF,
    'meadow': 0x0E4ECF,
    'warm_ocean': 0x43D5EE,
    'lukewarm_ocean': 0x45ADF2,
    'deep_lukewarm_ocean': 0x45ADF2,
    'cold_ocean': 0x3D57D6,
    'deep_cold_ocean': 0x3D57D6,
    'frozen_ocean': 0x3938C9,
    'deep_frozen_ocean': 0x3938C9,
    'frozen_river': 0x3938C9,
    'snowy_beach': 0x3D57D6,
    'snowy_taiga': 0x3D57D6,
    'pale_garden': 0x6E8B8F,
}
DEFAULT_WATER = 0x3F76E4

# Fixed colours that ignore the colour map (grass, foliage).
GRASS = {
    'swamp': 0x5B733A,
    'cherry_grove': 0xB6DB61,
    'pale_garden': 0x778272,
    'badlands': 0x90814D,
    'eroded_badlands': 0x90814D,
    'wooded_badlands': 0x90814D,
}
FOLIAGE = {
    'swamp': 0x6A7039,
    'mangrove_swamp': 0x8DB127,
    'cherry_grove': 0xB6DB61,
    'pale_garden': 0x878D76,
    'badlands': 0x9E814D,
    'eroded_badlands': 0x9E814D,
    'wooded_badlands': 0x9E814D,
}
DRY_FOLIAGE = 0x9E814D

# Colour-map corners: (hot and dry, cold, hot and wet)
_G = (0xBFB755, 0x80B497, 0x59C93C)
_F = (0xAEA42A, 0x60A17B, 0x30BB0B)


def _blend(corners, temp, down):
    t = min(1.0, max(0.0, temp))
    d = min(t, max(0.0, down) * t)  # the map is a triangle: wetness can't exceed warmth
    wp, wq, wr = t - d, 1.0 - t, d
    out = 0
    for shift in (16, 8, 0):
        v = sum(((c >> shift) & 255) * w for c, w in zip(corners, (wp, wq, wr), strict=True))
        out |= int(v + 0.5) << shift
    return out


def tints(biome, overrides=None):
    """(grass, foliage, dry_foliage, water) as 0xRRGGBB for a biome id like 'minecraft:plains'."""
    name = biome.split(':', 1)[-1]
    o = overrides or {}
    t, d = CLIMATE.get(name, CLIMATE['plains'])
    grass = o.get('grass', {}).get(biome) or GRASS.get(name) or _blend(_G, t, d)
    foliage = o.get('foliage', {}).get(biome) or FOLIAGE.get(name) or _blend(_F, t, d)
    dry = o.get('dry_foliage', {}).get(biome) or DRY_FOLIAGE
    if name == 'dark_forest' and name not in GRASS:
        grass = ((grass & 0xFEFEFE) + 0x28340A) >> 1  # the game's dark forest grass modifier
    return grass, foliage, dry, WATER.get(name, DEFAULT_WATER)
