package nl.voxel.badges;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabExecutor;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * /badge give <player> <badge> [tier]   upgrade one tier, or set a tier
 * /badge set <player> <badge> <tier|none>
 * /badge take <player> <badge>
 * /badge info [player]
 * /badge list
 * /badge reload
 */
public final class BadgeCommand implements TabExecutor {

    private static final String ADMIN = "voxelbadges.admin";
    private static final List<String> TIERS = List.of("bronze", "silver", "gold", "diamond");

    private final VoxelBadges plugin;

    public BadgeCommand(VoxelBadges plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender s, Command cmd, String label, String[] a) {
        if (a.length == 0) return help(s);
        String sub = a[0].toLowerCase(Locale.ROOT);
        switch (sub) {
            case "give" -> {
                if (!admin(s)) return true;
                if (a.length < 3) return usage(s, "/badge give <player> <badge> [tier]");
                give(s, a[1], a[2], a.length > 3 ? a[3] : null);
            }
            case "set" -> {
                if (!admin(s)) return true;
                if (a.length < 4) return usage(s, "/badge set <player> <badge> <tier|none>");
                set(s, a[1], a[2], a[3]);
            }
            case "take", "remove" -> {
                if (!admin(s)) return true;
                if (a.length < 3) return usage(s, "/badge take <player> <badge>");
                set(s, a[1], a[2], "none");
            }
            case "info" -> {
                if (a.length < 2 && !(s instanceof Player)) return usage(s, "/badge info <player>");
                info(s, a.length > 1 ? a[1] : s.getName());
            }
            case "list" -> list(s);
            case "reload" -> {
                if (!admin(s)) return true;
                plugin.reloadConfig();
                plugin.loadBadges();
                boolean restart = plugin.rebuildPacks();
                plugin.refreshAll();
                msg(s, Component.text("Badges reloaded.", NamedTextColor.GREEN));
                if (restart) {
                    msg(s, Component.text("Advancements changed: restart the server once to load them.", NamedTextColor.YELLOW));
                }
            }
            default -> help(s);
        }
        return true;
    }

    // ---------------------------------------------------------------- actions

    private void give(CommandSender s, String playerName, String badgeId, String tierArg) {
        Target t = target(s, playerName);
        Badge b = badge(s, badgeId);
        if (t == null || b == null) return;
        int current = plugin.store().get(t.uuid, b.id());
        int level;
        if (tierArg == null) {
            level = current + 1;
            if (level > Tier.DIAMOND.level) {
                msg(s, Component.text(t.name + " already has " + b.name() + " at Diamond.", NamedTextColor.YELLOW));
                return;
            }
        } else {
            level = Tier.parseLevel(tierArg);
            if (level <= 0) {
                msg(s, Component.text("Unknown tier: " + tierArg + " (bronze, silver, gold, diamond)", NamedTextColor.RED));
                return;
            }
        }
        apply(s, t, b, level);
    }

    private void set(CommandSender s, String playerName, String badgeId, String tierArg) {
        Target t = target(s, playerName);
        Badge b = badge(s, badgeId);
        if (t == null || b == null) return;
        int level = Tier.parseLevel(tierArg);
        if (level < 0) {
            msg(s, Component.text("Unknown tier: " + tierArg + " (bronze, silver, gold, diamond, none)", NamedTextColor.RED));
            return;
        }
        apply(s, t, b, level);
    }

    private void apply(CommandSender s, Target t, Badge b, int level) {
        plugin.setTier(t.uuid, t.name, b, level);
        Tier tier = Tier.ofLevel(level);
        if (tier == null) {
            msg(s, Component.text("Removed " + b.name() + " from " + t.name + ".", NamedTextColor.GREEN));
        } else {
            msg(s, Component.text("Set " + b.name() + " to ", NamedTextColor.GREEN)
                    .append(Component.text(tier.display, TextColor.fromHexString(tier.color)))
                    .append(Component.text(" for " + t.name + ".", NamedTextColor.GREEN)));
        }
        if (!t.online) {
            msg(s, Component.text(t.name + " is offline; it syncs when they join.", NamedTextColor.GRAY));
        }
        if (!plugin.advancementsLoaded()) {
            msg(s, Component.text("Advancement tab isn't loaded yet: restart the server once.", NamedTextColor.YELLOW));
        }
    }

    private void info(CommandSender s, String playerName) {
        Target t = target(s, playerName);
        if (t == null) return;
        Map<String, Integer> all = plugin.store().all(t.uuid);
        msg(s, Component.text("Badges of " + t.name + ":", NamedTextColor.GOLD));
        boolean any = false;
        for (Badge b : plugin.badges()) {
            Tier tier = Tier.ofLevel(all.getOrDefault(b.id(), 0));
            if (tier == null) continue;
            any = true;
            msg(s, Component.text(" • " + b.name() + " ", NamedTextColor.WHITE)
                    .append(Component.text(tier.display, TextColor.fromHexString(tier.color))));
        }
        if (!any) msg(s, Component.text(" none yet", NamedTextColor.GRAY));
    }

    private void list(CommandSender s) {
        msg(s, Component.text("Voxel badges:", NamedTextColor.GOLD));
        for (Badge b : plugin.badges()) {
            msg(s, Component.text(" " + b.name() + " ", NamedTextColor.WHITE)
                    .append(Component.text("(" + b.id() + ")", NamedTextColor.DARK_GRAY)));
            for (Tier tier : Tier.values()) {
                msg(s, Component.text("   " + tier.display + ": ", TextColor.fromHexString(tier.color))
                        .append(Component.text(b.requirement(tier), NamedTextColor.GRAY)));
            }
        }
    }

    // ---------------------------------------------------------------- helpers

    private record Target(java.util.UUID uuid, String name, boolean online) {}

    private Target target(CommandSender s, String name) {
        Player online = Bukkit.getPlayerExact(name);
        if (online != null) return new Target(online.getUniqueId(), online.getName(), true);
        OfflinePlayer off = Bukkit.getOfflinePlayerIfCached(name);
        if (off != null && off.getName() != null) return new Target(off.getUniqueId(), off.getName(), false);
        msg(s, Component.text("Player not found: " + name + " (they need to have joined once)", NamedTextColor.RED));
        return null;
    }

    private Badge badge(CommandSender s, String id) {
        Badge b = plugin.badge(id);
        if (b == null) msg(s, Component.text("Unknown badge: " + id + ". See /badge list", NamedTextColor.RED));
        return b;
    }

    private boolean admin(CommandSender s) {
        if (s.hasPermission(ADMIN)) return true;
        msg(s, Component.text("You don't have permission to do that.", NamedTextColor.RED));
        return false;
    }

    private boolean usage(CommandSender s, String u) {
        msg(s, Component.text("Usage: " + u, NamedTextColor.RED));
        return true;
    }

    private boolean help(CommandSender s) {
        msg(s, Component.text("Voxel Badges", NamedTextColor.GOLD));
        if (s.hasPermission(ADMIN)) {
            msg(s, Component.text(" /badge give <player> <badge> [tier]", NamedTextColor.YELLOW)
                    .append(Component.text("  next tier, or a set tier", NamedTextColor.GRAY)));
            msg(s, Component.text(" /badge set <player> <badge> <tier|none>", NamedTextColor.YELLOW));
            msg(s, Component.text(" /badge take <player> <badge>", NamedTextColor.YELLOW));
            msg(s, Component.text(" /badge reload", NamedTextColor.YELLOW));
        }
        msg(s, Component.text(" /badge info [player]", NamedTextColor.YELLOW));
        msg(s, Component.text(" /badge list", NamedTextColor.YELLOW));
        return true;
    }

    private static void msg(CommandSender s, Component c) {
        s.sendMessage(c);
    }

    // ------------------------------------------------------------ tab complete

    @Override
    public List<String> onTabComplete(CommandSender s, Command cmd, String alias, String[] a) {
        boolean admin = s.hasPermission(ADMIN);
        List<String> out = new ArrayList<>();
        if (a.length == 1) {
            out.addAll(admin ? List.of("give", "set", "take", "info", "list", "reload") : List.of("info", "list"));
        } else if (a.length == 2 && (admin || a[0].equalsIgnoreCase("info"))) {
            for (Player p : Bukkit.getOnlinePlayers()) out.add(p.getName());
        } else if (a.length == 3 && admin && !a[0].equalsIgnoreCase("info")) {
            for (Badge b : plugin.badges()) out.add(b.id());
        } else if (a.length == 4 && admin) {
            if (a[0].equalsIgnoreCase("give")) out.addAll(TIERS);
            if (a[0].equalsIgnoreCase("set")) {
                out.addAll(TIERS);
                out.add("none");
            }
        }
        String last = a[a.length - 1].toLowerCase(Locale.ROOT);
        out.removeIf(x -> !x.toLowerCase(Locale.ROOT).startsWith(last));
        return out;
    }
}
