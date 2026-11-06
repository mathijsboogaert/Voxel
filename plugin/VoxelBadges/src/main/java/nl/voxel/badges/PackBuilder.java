package nl.voxel.badges;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Generates the two packs this plugin needs:
 *  - a data pack with the advancement tab (written into the world's datapacks folder)
 *  - a resource pack with the badge font (below-name icons) and item models (advancement icons)
 */
public final class PackBuilder {

    public static final String NS = "voxel";
    public static final String FONT = NS + ":badges";

    private final VoxelBadges plugin;

    public PackBuilder(VoxelBadges plugin) {
        this.plugin = plugin;
    }

    // ---------------------------------------------------------------- data pack

    /**
     * Writes the advancement data pack. Returns true if anything changed on disk,
     * which means the server needs a restart before the new advancements exist.
     */
    public boolean writeDatapack(File worldFolder, List<Badge> badges) throws IOException {
        Path root = worldFolder.toPath().resolve("datapacks").resolve("voxel_badges");
        Map<String, String> files = new LinkedHashMap<>();

        int format = plugin.getConfig().getInt("packs.datapack-format", 109);
        files.put("pack.mcmeta", mcmeta("Voxel Badges advancements", format));

        String bg = plugin.getConfig().getString("advancements.background", "minecraft:block/terracotta");
        if (bg.equals("minecraft:block/gold_block")) {
            // Old default: move existing installs over to the new terracotta background.
            bg = "minecraft:block/terracotta";
            plugin.getConfig().set("advancements.background", bg);
            plugin.saveConfig();
        }
        files.put(advPath("badges/root"), """
                {
                  "display": {
                    "icon": {"id": "minecraft:paper", "components": {"minecraft:item_model": "%s:badge/logo"}},
                    "title": {"text": "Voxel Badges", "color": "#E3A521"},
                    "description": {"text": "Build for the community, earn badges"},
                    "background": "%s",
                    "show_toast": false,
                    "announce_to_chat": false
                  },
                  "criteria": {"joined": {"trigger": "minecraft:tick"}}
                }
                """.formatted(NS, esc(bg)));

        // Layout: root -> one label node per badge (auto-earned) -> its 4 tiers stacked below each other.
        // Every tier hangs directly under the label, so all of them are visible before they're earned
        // (Minecraft hides unearned advancements more than two steps below an earned one).
        for (Badge b : badges) {
            String header = "badges/" + b.id() + "/header";
            files.put(advPath(header), """
                    {
                      "parent": "%s:badges/root",
                      "display": {
                        "icon": {"id": "minecraft:paper", "components": {"minecraft:item_model": "%s:badge/%s"}},
                        "title": {"text": "%s", "color": "#E3A521"},
                        "description": {"text": "Bronze, Silver, Gold, Diamond"},
                        "frame": "task",
                        "show_toast": false,
                        "announce_to_chat": false,
                        "hidden": false
                      },
                      "criteria": {"joined": {"trigger": "minecraft:tick"}}
                    }
                    """.formatted(NS, NS, b.texture(Tier.GOLD), esc(b.name())));
            String parent = NS + ":" + header;
            for (Tier t : Tier.values()) {
                String key = "badges/" + b.id() + "/" + t.id();
                files.put(advPath(key), """
                        {
                          "parent": "%s",
                          "display": {
                            "icon": {"id": "minecraft:paper", "components": {"minecraft:item_model": "%s:badge/%s"}},
                            "title": {"text": "%s · %s", "color": "%s"},
                            "description": {"text": "%s"},
                            "frame": "%s",
                            "show_toast": true,
                            "announce_to_chat": true,
                            "hidden": false
                          },
                          "criteria": {"awarded": {"trigger": "minecraft:impossible"}}
                        }
                        """.formatted(parent, NS, b.texture(t), esc(b.name()), t.display, t.color,
                        esc(b.requirement(t)), t.frame));
            }
        }

        boolean changed = false;
        // Older builds wrote the root to voxel:root by mistake; remove that stray tab.
        if (Files.deleteIfExists(root.resolve(advPath("root")))) changed = true;
        for (Map.Entry<String, String> f : files.entrySet()) {
            Path p = root.resolve(f.getKey());
            byte[] data = f.getValue().getBytes(StandardCharsets.UTF_8);
            if (Files.exists(p) && java.util.Arrays.equals(Files.readAllBytes(p), data)) continue;
            Files.createDirectories(p.getParent());
            Files.write(p, data);
            changed = true;
        }
        return changed;
    }

    private static String advPath(String key) {
        return "data/" + NS + "/advancement/" + key + ".json";
    }

    // ------------------------------------------------------------ resource pack

    public record Pack(byte[] zip, String sha1) {}

    public Pack buildResourcePack(List<Badge> badges) throws IOException {
        int height = plugin.getConfig().getInt("nameplate.glyph-height", 9);
        int ascent = Math.min(height, plugin.getConfig().getInt("nameplate.glyph-ascent", 8));
        int format = plugin.getConfig().getInt("packs.resourcepack-format", 97);

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            put(zip, "pack.mcmeta", mcmeta("Voxel Badges icons", format).getBytes(StandardCharsets.UTF_8));

            StringBuilder font = new StringBuilder("{\n  \"providers\": [\n");
            boolean first = true;
            for (Badge b : badges) {
                for (Tier t : Tier.values()) {
                    String tex = b.texture(t);
                    byte[] png = texture(tex);
                    if (png == null) {
                        plugin.getLogger().warning("Missing texture textures/" + tex + ".png, skipped");
                        continue;
                    }
                    // font glyph (below-name icons)
                    put(zip, "assets/" + NS + "/textures/font/badges/" + tex + ".png", png);
                    if (!first) font.append(",\n");
                    first = false;
                    font.append("    {\"type\": \"bitmap\", \"file\": \"").append(NS).append(":font/badges/").append(tex)
                            .append(".png\", \"height\": ").append(height).append(", \"ascent\": ").append(ascent)
                            .append(", \"chars\": [\"").append(String.format("\\u%04X", (int) b.glyph(t))).append("\"]}");

                    // item model (advancement icons)
                    put(zip, "assets/" + NS + "/textures/item/badge/" + tex + ".png", png);
                    put(zip, "assets/" + NS + "/models/item/badge/" + tex + ".json", """
                            {"parent": "minecraft:item/generated", "textures": {"layer0": "%s:item/badge/%s"}}
                            """.formatted(NS, tex).getBytes(StandardCharsets.UTF_8));
                    put(zip, "assets/" + NS + "/items/badge/" + tex + ".json", """
                            {"model": {"type": "minecraft:model", "model": "%s:item/badge/%s"}}
                            """.formatted(NS, tex).getBytes(StandardCharsets.UTF_8));
                }
            }
            byte[] logo = texture("logo");
            if (logo != null) {
                put(zip, "assets/" + NS + "/textures/item/badge/logo.png", logo);
                put(zip, "assets/" + NS + "/models/item/badge/logo.json", """
                        {"parent": "minecraft:item/generated", "textures": {"layer0": "%s:item/badge/logo"}}
                        """.formatted(NS).getBytes(StandardCharsets.UTF_8));
                put(zip, "assets/" + NS + "/items/badge/logo.json", """
                        {"model": {"type": "minecraft:model", "model": "%s:item/badge/logo"}}
                        """.formatted(NS).getBytes(StandardCharsets.UTF_8));
            }
            font.append("\n  ]\n}\n");
            put(zip, "assets/" + NS + "/font/badges.json", font.toString().getBytes(StandardCharsets.UTF_8));
        }
        byte[] data = bytes.toByteArray();
        return new Pack(data, sha1(data));
    }

    private byte[] texture(String name) throws IOException {
        // A file in plugins/VoxelBadges/textures/ overrides the built-in one,
        // so you can swap in your own pixel art without rebuilding the plugin.
        File override = new File(plugin.getDataFolder(), "textures/" + name + ".png");
        if (override.isFile()) return Files.readAllBytes(override.toPath());
        try (InputStream in = plugin.getResource("textures/" + name + ".png")) {
            return in == null ? null : in.readAllBytes();
        }
    }

    private static void put(ZipOutputStream zip, String path, byte[] data) throws IOException {
        ZipEntry e = new ZipEntry(path);
        e.setTime(0); // stable zip, so the hash only changes when content changes
        zip.putNextEntry(e);
        zip.write(data);
        zip.closeEntry();
    }

    // ------------------------------------------------------------------- shared

    /** pack.mcmeta that declares both the old and the 1.21.9+ style version fields. */
    private static String mcmeta(String description, int format) {
        return """
                {
                  "pack": {
                    "description": "%s",
                    "pack_format": %d,
                    "min_format": %d,
                    "max_format": 999
                  }
                }
                """.formatted(description, format, format);
    }

    static String esc(String s) {
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String sha1(byte[] data) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-1").digest(data);
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
