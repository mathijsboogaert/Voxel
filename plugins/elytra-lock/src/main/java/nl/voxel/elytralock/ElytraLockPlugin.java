package nl.voxel.elytralock;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Objects;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;
import net.kyori.adventure.text.minimessage.tag.resolver.Placeholder;
import net.kyori.adventure.text.minimessage.tag.resolver.TagResolver;
import org.bukkit.NamespacedKey;
import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

public final class ElytraLockPlugin extends JavaPlugin {

  private static final DateTimeFormatter DATE =
      DateTimeFormatter.ofPattern("d MMM yyyy").withZone(ZoneId.systemDefault());

  private ClaimStore claims;
  private NamespacedKey placedByKey;

  @Override
  public void onEnable() {
    saveDefaultConfig();
    placedByKey = new NamespacedKey(this, "placed_by");
    claims = new ClaimStore(this);
    claims.load();

    getServer().getPluginManager().registerEvents(new FrameListener(this), this);

    ElytraCommand command = new ElytraCommand(this);
    PluginCommand pluginCommand = Objects.requireNonNull(getCommand("elytralock"));
    pluginCommand.setExecutor(command);
    pluginCommand.setTabCompleter(command);

    getLogger().info(claims.count() + " elytra claim(s) on record.");
  }

  ClaimStore claims() {
    return claims;
  }

  /** Marks a frame whose elytra a player put there themselves, so they can take it back. */
  NamespacedKey placedByKey() {
    return placedByKey;
  }

  /** A message from config.yml, with <player>, <date> and other placeholders filled in. */
  Component message(String key, Map<String, String> placeholders) {
    String raw = getConfig().getString("messages." + key, key);
    TagResolver.Builder resolvers = TagResolver.builder();
    placeholders.forEach((name, value) -> resolvers.resolver(Placeholder.unparsed(name, value)));
    return MiniMessage.miniMessage().deserialize(raw, resolvers.build());
  }

  Component message(String key) {
    return message(key, Map.of());
  }

  static String date(long epochMillis) {
    return DATE.format(Instant.ofEpochMilli(epochMillis));
  }
}
