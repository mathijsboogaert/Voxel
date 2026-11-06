package nl.voxel.badges;

import net.kyori.adventure.resource.ResourcePackInfo;
import net.kyori.adventure.resource.ResourcePackRequest;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.NamespacedKey;
import org.bukkit.advancement.Advancement;
import org.bukkit.advancement.AdvancementProgress;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerResourcePackStatusEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

public final class VoxelBadges extends JavaPlugin implements Listener {

    private static final UUID PACK_ID = UUID.nameUUIDFromBytes("voxel-badges-pack".getBytes());

    private final List<Badge> badges = new ArrayList<>();
    private BadgeStore store;
    private PackBuilder packs;
    private PackServer packServer;
    private PackBuilder.Pack pack;
    private Nameplates nameplates;
    /** Pack info for an externally hosted pack (port 0); its hash is computed from the download. */
    private CompletableFuture<ResourcePackInfo> externalPack;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        store = new BadgeStore(new File(getDataFolder(), "badges.yml"), getLogger());
        store.load();
        packs = new PackBuilder(this);
        nameplates = new Nameplates(this);

        loadBadges();
        rebuildPacks();
        startPackServer();
        nameplates.enable();

        getServer().getPluginManager().registerEvents(this, this);
        BadgeCommand cmd = new BadgeCommand(this);
        var command = getCommand("badge");
        if (command != null) {
            command.setExecutor(cmd);
            command.setTabCompleter(cmd);
        }
        for (Player p : Bukkit.getOnlinePlayers()) syncAdvancements(p);
    }

    @Override
    public void onDisable() {
        if (nameplates != null) nameplates.disable();
        if (packServer != null) packServer.stop();
    }

    // ------------------------------------------------------------------ setup

    void loadBadges() {
        badges.clear();
        ConfigurationSection sec = getConfig().getConfigurationSection("badges");
        if (sec == null) return;
        int i = 0;
        for (String id : sec.getKeys(false)) {
            String name = sec.getString(id + ".name", id);
            List<String> req = sec.getStringList(id + ".tiers");
            badges.add(new Badge(id, name, i++, req));
        }
    }

    /** Regenerates the data pack and resource pack. Returns true if a restart is needed. */
    boolean rebuildPacks() {
        boolean restart = false;
        try {
            restart = packs.writeDatapack(worldFolder(), badges);
            if (restart) {
                getLogger().warning("Badge advancements were (re)generated. Restart the server once to load them.");
            }
        } catch (IOException e) {
            getLogger().severe("Could not write the advancement data pack: " + e.getMessage());
        }
        try {
            pack = packs.buildResourcePack(badges);
            File out = new File(getDataFolder(), "voxel-badges-pack.zip");
            java.nio.file.Files.write(out.toPath(), pack.zip());
            if (packServer != null) packServer.update(pack.zip());
            externalPack = null; // recompute the hash of an external pack on next use
        } catch (IOException e) {
            getLogger().severe("Could not build the resource pack: " + e.getMessage());
        }
        return restart;
    }

    /** The save folder of the main world, read from server.properties (default "world"). */
    private File worldFolder() {
        String level = "world";
        File props = new File("server.properties");
        if (props.isFile()) {
            Properties p = new Properties();
            try (FileInputStream in = new FileInputStream(props)) {
                p.load(in);
                level = p.getProperty("level-name", "world");
            } catch (IOException ignored) {
                // fall back to "world"
            }
        }
        return new File(Bukkit.getWorldContainer(), level);
    }

    private void startPackServer() {
        if (!getConfig().getBoolean("resource-pack.enabled", true)) return;
        if (packUrl() == null) {
            getLogger().warning("resource-pack.public-url is not set, so nobody gets the badge icons. "
                    + "Set it in config.yml and run /badge reload.");
        }
        int port = getConfig().getInt("resource-pack.port", 25590);
        if (port <= 0) {
            getLogger().info("Built-in pack server off; players get the pack from " + packUrl());
            return;
        }
        try {
            packServer = new PackServer();
            packServer.start(port);
            if (pack != null) packServer.update(pack.zip());
            getLogger().info("Serving badge resource pack on port " + port + PackServer.PATH);
        } catch (IOException e) {
            getLogger().severe("Could not start the resource pack server on port " + port + ": " + e.getMessage());
            packServer = null;
        }
    }

    // ----------------------------------------------------------------- events

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        Player p = event.getPlayer();
        store.rememberName(p.getUniqueId(), p.getName());
        sendPack(p);
        // one tick later, so the player is fully loaded before advancements change
        Bukkit.getScheduler().runTask(this, () -> {
            syncAdvancements(p);
            nameplates.update(p);
        });
    }

    /** The configured download URL, or null while it's still the placeholder. */
    private String packUrl() {
        String url = getConfig().getString("resource-pack.public-url", "");
        return url.isBlank() || url.contains("YOUR.SERVER.IP") ? null : url;
    }

    void sendPack(Player p) {
        if (!getConfig().getBoolean("resource-pack.enabled", true) || pack == null) return;
        String url = packUrl();
        if (url == null) return;
        if (packServer != null) {
            send(p, ResourcePackInfo.resourcePackInfo().id(PACK_ID).uri(URI.create(url)).hash(pack.sha1()).build());
            return;
        }
        // Hosted elsewhere: download it once to get the hash, then send it to everyone.
        if (externalPack == null) {
            externalPack = ResourcePackInfo.resourcePackInfo().id(PACK_ID).uri(URI.create(url)).computeHashAndBuild();
            externalPack.exceptionally(e -> {
                getLogger().severe("Could not download the badge resource pack from " + url + ": " + e.getMessage());
                externalPack = null;
                return null;
            });
        }
        externalPack.thenAccept(info -> {
            if (info != null) Bukkit.getScheduler().runTask(this, () -> { if (p.isOnline()) send(p, info); });
        });
    }

    private void send(Player p, ResourcePackInfo info) {
        p.sendResourcePacks(ResourcePackRequest.resourcePackRequest()
                .packs(info)
                .replace(false)
                .required(getConfig().getBoolean("resource-pack.required", false))
                .prompt(Component.text(getConfig().getString("resource-pack.prompt", "Voxel badge icons")))
                .build());
    }

    @EventHandler
    public void onPackStatus(PlayerResourcePackStatusEvent event) {
        if (!PACK_ID.equals(event.getID())) return;
        switch (event.getStatus()) {
            case SUCCESSFULLY_LOADED -> getLogger().info(event.getPlayer().getName() + " loaded the badge icons.");
            case ACCEPTED, DOWNLOADED -> { }
            default -> getLogger().warning(event.getPlayer().getName() + " did not load the badge icons: "
                    + event.getStatus() + (event.getStatus() == PlayerResourcePackStatusEvent.Status.DECLINED
                    ? " (they declined the pack prompt; they can enable it under Multiplayer > Edit > Server Resource Packs)"
                    : " (check that resource-pack.public-url opens in a browser)"));
        }
    }

    // ----------------------------------------------------------- badge logic

    /** Makes a player's advancements match their stored tiers (grants up to, revokes above). */
    void syncAdvancements(Player p) {
        for (Badge b : badges) {
            int level = store.get(p.getUniqueId(), b.id());
            for (Tier t : Tier.values()) {
                Advancement adv = Bukkit.getAdvancement(new NamespacedKey(PackBuilder.NS, "badges/" + b.id() + "/" + t.id()));
                if (adv == null) continue; // data pack not loaded yet (restart pending)
                AdvancementProgress progress = adv.getCriteria().isEmpty() ? null : p.getAdvancementProgress(adv);
                if (progress == null) continue;
                boolean should = t.level <= level;
                if (should && !progress.isDone()) {
                    for (String c : progress.getRemainingCriteria()) progress.awardCriteria(c);
                } else if (!should && progress.isDone()) {
                    for (String c : progress.getAwardedCriteria()) progress.revokeCriteria(c);
                }
            }
        }
    }

    /** Sets a badge tier for a player (0 removes it) and refreshes everything that shows it. */
    void setTier(UUID uuid, String name, Badge badge, int level) {
        store.set(uuid, name, badge.id(), level);
        Player online = Bukkit.getPlayer(uuid);
        if (online != null) {
            syncAdvancements(online);
            nameplates.update(online);
        }
    }

    boolean advancementsLoaded() {
        return badges.isEmpty() || Bukkit.getAdvancement(new NamespacedKey(PackBuilder.NS, "badges/root")) != null;
    }

    // ---------------------------------------------------------------- access

    public List<Badge> badges() {
        return Collections.unmodifiableList(badges);
    }

    public Badge badge(String id) {
        for (Badge b : badges) if (b.id().equalsIgnoreCase(id)) return b;
        return null;
    }

    public BadgeStore store() {
        return store;
    }

    void refreshAll() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            syncAdvancements(p);
            nameplates.update(p);
            sendPack(p);
        }
    }
}
