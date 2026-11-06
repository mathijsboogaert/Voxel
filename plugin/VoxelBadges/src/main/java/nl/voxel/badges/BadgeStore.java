package nl.voxel.badges;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Logger;

/** Stores which tier each player has per badge, in plugins/VoxelBadges/badges.yml. */
public final class BadgeStore {

    private final File file;
    private final Logger log;
    private final Map<UUID, Map<String, Integer>> tiers = new HashMap<>();
    private final Map<UUID, String> names = new HashMap<>();

    public BadgeStore(File file, Logger log) {
        this.file = file;
        this.log = log;
    }

    public void load() {
        tiers.clear();
        names.clear();
        if (!file.exists()) return;
        YamlConfiguration yml = YamlConfiguration.loadConfiguration(file);
        ConfigurationSection players = yml.getConfigurationSection("players");
        if (players == null) return;
        for (String key : players.getKeys(false)) {
            UUID uuid;
            try {
                uuid = UUID.fromString(key);
            } catch (IllegalArgumentException e) {
                continue;
            }
            names.put(uuid, players.getString(key + ".name", "?"));
            ConfigurationSection b = players.getConfigurationSection(key + ".badges");
            Map<String, Integer> map = new LinkedHashMap<>();
            if (b != null) for (String id : b.getKeys(false)) map.put(id, b.getInt(id));
            tiers.put(uuid, map);
        }
    }

    public void save() {
        YamlConfiguration yml = new YamlConfiguration();
        for (Map.Entry<UUID, Map<String, Integer>> e : tiers.entrySet()) {
            String base = "players." + e.getKey();
            yml.set(base + ".name", names.getOrDefault(e.getKey(), "?"));
            for (Map.Entry<String, Integer> b : e.getValue().entrySet()) {
                yml.set(base + ".badges." + b.getKey(), b.getValue());
            }
        }
        try {
            yml.save(file);
        } catch (IOException ex) {
            log.severe("Could not save badges.yml: " + ex.getMessage());
        }
    }

    public int get(UUID player, String badge) {
        return tiers.getOrDefault(player, Map.of()).getOrDefault(badge, 0);
    }

    public Map<String, Integer> all(UUID player) {
        return tiers.getOrDefault(player, Map.of());
    }

    public void set(UUID player, String name, String badge, int level) {
        names.put(player, name);
        Map<String, Integer> map = tiers.computeIfAbsent(player, k -> new LinkedHashMap<>());
        if (level <= 0) map.remove(badge);
        else map.put(badge, level);
        save();
    }

    public void rememberName(UUID player, String name) {
        if (tiers.containsKey(player) && !name.equals(names.get(player))) {
            names.put(player, name);
            save();
        }
    }
}
