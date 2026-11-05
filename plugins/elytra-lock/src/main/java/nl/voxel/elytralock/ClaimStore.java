package nl.voxel.elytralock;

import java.io.File;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Level;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;

/** Who took their one elytra, and when. Kept in plugins/ElytraLock/claims.yml. */
final class ClaimStore {

  record Claim(UUID player, String name, long at) {}

  private final ElytraLockPlugin plugin;
  private final File file;
  private final Map<UUID, Claim> claims = new LinkedHashMap<>();

  ClaimStore(ElytraLockPlugin plugin) {
    this.plugin = plugin;
    this.file = new File(plugin.getDataFolder(), "claims.yml");
  }

  void load() {
    claims.clear();
    if (!file.exists()) {
      return;
    }
    YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);
    ConfigurationSection section = yaml.getConfigurationSection("claims");
    if (section == null) {
      return;
    }
    for (String key : section.getKeys(false)) {
      try {
        UUID id = UUID.fromString(key);
        claims.put(id, new Claim(id, section.getString(key + ".name", "?"), section.getLong(key + ".at")));
      } catch (IllegalArgumentException e) {
        plugin.getLogger().warning("Skipping bad entry in claims.yml: " + key);
      }
    }
  }

  private void save() {
    YamlConfiguration yaml = new YamlConfiguration();
    yaml.options().setHeader(List.of(
        "Players who took their one elytra. Remove a player with /elytralock reset <name>."));
    for (Claim claim : claims.values()) {
      String path = "claims." + claim.player();
      yaml.set(path + ".name", claim.name());
      yaml.set(path + ".at", claim.at());
    }
    try {
      plugin.getDataFolder().mkdirs();
      yaml.save(file);
    } catch (IOException e) {
      plugin.getLogger().log(Level.SEVERE, "Could not save claims.yml", e);
    }
  }

  Claim get(UUID player) {
    return claims.get(player);
  }

  /** A claimed player's id by name, ignoring case, or null. */
  UUID findByName(String name) {
    for (Claim claim : claims.values()) {
      if (claim.name().equalsIgnoreCase(name)) {
        return claim.player();
      }
    }
    return null;
  }

  boolean hasClaimed(UUID player) {
    return claims.containsKey(player);
  }

  void claim(UUID player, String name) {
    claims.put(player, new Claim(player, name, System.currentTimeMillis()));
    save();
  }

  boolean reset(UUID player) {
    boolean removed = claims.remove(player) != null;
    if (removed) {
      save();
    }
    return removed;
  }

  Iterable<Claim> all() {
    return claims.values();
  }

  int count() {
    return claims.size();
  }
}
