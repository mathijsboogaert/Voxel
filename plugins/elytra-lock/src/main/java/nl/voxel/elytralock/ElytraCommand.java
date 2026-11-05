package nl.voxel.elytralock;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabExecutor;
import org.bukkit.entity.Player;

/** /elytralock: your own status, or check, reset, list and reload for admins. */
final class ElytraCommand implements TabExecutor {

  private static final List<String> SUBCOMMANDS = List.of("check", "reset", "list", "reload");

  private final ElytraLockPlugin plugin;

  ElytraCommand(ElytraLockPlugin plugin) {
    this.plugin = plugin;
  }

  @Override
  public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (args.length == 0 || !sender.hasPermission("elytralock.admin")) {
      if (!(sender instanceof Player player)) {
        return false;
      }
      ClaimStore.Claim claim = plugin.claims().get(player.getUniqueId());
      sender.sendMessage(claim == null
          ? plugin.message("status-unclaimed")
          : plugin.message("status-claimed", Map.of("date", ElytraLockPlugin.date(claim.at()))));
      return true;
    }

    switch (args[0].toLowerCase()) {
      case "list" -> {
        sender.sendMessage(plugin.message("list-header", Map.of("count", String.valueOf(plugin.claims().count()))));
        for (ClaimStore.Claim claim : plugin.claims().all()) {
          sender.sendMessage(plugin.message("list-line",
              Map.of("player", claim.name(), "date", ElytraLockPlugin.date(claim.at()))));
        }
      }
      case "reload" -> {
        plugin.reloadConfig();
        sender.sendMessage(plugin.message("reloaded"));
      }
      case "check", "reset" -> {
        if (args.length < 2) {
          return false;
        }
        UUID id = plugin.claims().findByName(args[1]);
        if (id == null) {
          OfflinePlayer cached = Bukkit.getOfflinePlayerIfCached(args[1]);
          if (cached == null) {
            sender.sendMessage(plugin.message("unknown-player", Map.of("player", args[1])));
            return true;
          }
          id = cached.getUniqueId();
        }
        String name = args[1];
        if (args[0].equalsIgnoreCase("reset")) {
          boolean removed = plugin.claims().reset(id);
          sender.sendMessage(plugin.message(removed ? "reset-done" : "reset-none", Map.of("player", name)));
        } else {
          ClaimStore.Claim claim = plugin.claims().get(id);
          sender.sendMessage(claim == null
              ? plugin.message("check-unclaimed", Map.of("player", name))
              : plugin.message("check-claimed", Map.of("player", name, "date", ElytraLockPlugin.date(claim.at()))));
        }
      }
      default -> {
        return false;
      }
    }
    return true;
  }

  @Override
  public List<String> onTabComplete(CommandSender sender, Command command, String label, String[] args) {
    if (!sender.hasPermission("elytralock.admin")) {
      return List.of();
    }
    List<String> out = new ArrayList<>();
    if (args.length == 1) {
      SUBCOMMANDS.stream().filter(s -> s.startsWith(args[0].toLowerCase())).forEach(out::add);
    } else if (args.length == 2 && (args[0].equalsIgnoreCase("check") || args[0].equalsIgnoreCase("reset"))) {
      Bukkit.getOnlinePlayers().stream().map(Player::getName)
          .filter(n -> n.toLowerCase().startsWith(args[1].toLowerCase())).forEach(out::add);
      if (args[0].equalsIgnoreCase("reset")) {
        for (ClaimStore.Claim claim : plugin.claims().all()) {
          if (claim.name().toLowerCase().startsWith(args[1].toLowerCase()) && !out.contains(claim.name())) {
            out.add(claim.name());
          }
        }
      }
    }
    return out;
  }
}
