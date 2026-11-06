package nl.voxel.badges;

import java.util.List;

/**
 * A badge definition from config.yml.
 *
 * @param id           config key, e.g. "road_runner" (also the texture name)
 * @param name         display name, e.g. "Road Runner"
 * @param index        position in the config list, used for glyph code points
 * @param requirements one line per tier, bronze to diamond
 */
public record Badge(String id, String name, int index, List<String> requirements) {

    public String requirement(Tier tier) {
        int i = tier.level - 1;
        return i < requirements.size() ? requirements.get(i) : "";
    }

    /** Private-use code point for this badge at a tier, used in the badge font. */
    public char glyph(Tier tier) {
        return (char) (0xE100 + (tier.level - 1) * 0x20 + index);
    }

    public String texture(Tier tier) {
        return tier.id() + "_" + id;
    }
}
