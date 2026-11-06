package nl.voxel.badges;

import java.util.Locale;

/** Badge tiers. Level 0 means "no badge". */
public enum Tier {
    BRONZE(1, "Bronze", "#C47A3A", "task"),
    SILVER(2, "Silver", "#B8C0C8", "task"),
    GOLD(3, "Gold", "#E3A521", "goal"),
    DIAMOND(4, "Diamond", "#4FD8E0", "challenge");

    public final int level;
    public final String display;
    public final String color;
    public final String frame;

    Tier(int level, String display, String color, String frame) {
        this.level = level;
        this.display = display;
        this.color = color;
        this.frame = frame;
    }

    public String id() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static Tier ofLevel(int level) {
        for (Tier t : values()) if (t.level == level) return t;
        return null;
    }

    /** Accepts "bronze".."diamond" or "1".."4". Returns 0 for "none"/"0", -1 if invalid. */
    public static int parseLevel(String input) {
        String s = input.toLowerCase(Locale.ROOT);
        if (s.equals("none") || s.equals("0")) return 0;
        for (Tier t : values()) {
            if (t.id().equals(s) || String.valueOf(t.level).equals(s)) return t.level;
        }
        return -1;
    }
}
