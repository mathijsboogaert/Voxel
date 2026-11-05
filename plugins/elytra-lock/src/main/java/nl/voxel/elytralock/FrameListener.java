package nl.voxel.elytralock;

import io.papermc.paper.event.player.PlayerItemFrameChangeEvent;
import java.util.Map;
import java.util.UUID;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.entity.Entity;
import org.bukkit.entity.ItemFrame;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.hanging.HangingBreakByEntityEvent;
import org.bukkit.event.hanging.HangingBreakEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

/**
 * Keeps elytras in item frames (normal and glow) locked.
 *
 * <p>Punching the frame is the only way out: a player who never claimed one gets the elytra straight
 * into their inventory, and that uses up their one claim. Everything else that would free the elytra
 * (arrows, explosions, breaking the block behind it, rotating, breaking the frame) is cancelled.
 */
final class FrameListener implements Listener {

  private final ElytraLockPlugin plugin;

  FrameListener(ElytraLockPlugin plugin) {
    this.plugin = plugin;
  }

  private static boolean holdsElytra(Entity entity) {
    return entity instanceof ItemFrame frame && frame.getItem().getType() == Material.ELYTRA;
  }

  private static boolean bypasses(Entity entity) {
    return entity instanceof Player player && player.hasPermission("elytralock.bypass");
  }

  /** Punches, arrows, explosions, fire: anything that would knock the elytra out. */
  @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
  public void onFrameDamage(EntityDamageEvent event) {
    if (!holdsElytra(event.getEntity())) {
      return;
    }
    ItemFrame frame = (ItemFrame) event.getEntity();

    // Only a direct punch counts. A player's arrow or TNT is not a claim.
    Player player = event instanceof EntityDamageByEntityEvent byEntity
        && byEntity.getDamager() instanceof Player p ? p : null;

    if (player != null && bypasses(player)) {
      return;
    }
    event.setCancelled(true);
    if (player != null) {
      tryTake(player, frame);
    }
  }

  private void tryTake(Player player, ItemFrame frame) {
    UUID id = player.getUniqueId();
    PersistentDataContainer data = frame.getPersistentDataContainer();
    String placedBy = data.get(plugin.placedByKey(), PersistentDataType.STRING);

    // Their own elytra that they hung up themselves: give it back, no claim used.
    if (id.toString().equals(placedBy)) {
      handOver(player, frame);
      player.sendMessage(plugin.message("own-returned"));
      return;
    }

    ClaimStore.Claim claim = plugin.claims().get(id);
    if (claim != null) {
      player.sendActionBar(plugin.message("already-claimed",
          Map.of("date", ElytraLockPlugin.date(claim.at()))));
      player.playSound(player.getLocation(), Sound.BLOCK_CHEST_LOCKED, 1f, 1f);
      return;
    }

    plugin.claims().claim(id, player.getName());
    handOver(player, frame);
    player.sendMessage(plugin.message("claimed"));
    player.playSound(player.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 1f, 1.2f);
    plugin.getLogger().info(player.getName() + " claimed their elytra at "
        + frame.getWorld().getName() + " " + frame.getLocation().toVector().toBlockVector());
  }

  /** Empties the frame into the player's inventory (or at their feet when it is full). */
  private void handOver(Player player, ItemFrame frame) {
    ItemStack elytra = frame.getItem().clone();
    frame.setItem(null, false);
    frame.getPersistentDataContainer().remove(plugin.placedByKey());
    frame.getWorld().playSound(frame.getLocation(), Sound.ENTITY_ITEM_FRAME_REMOVE_ITEM, 1f, 1f);
    player.getInventory().addItem(elytra).values()
        .forEach(left -> player.getWorld().dropItemNaturally(player.getLocation(), left));
  }

  /** The frame itself breaking: block behind it gone, explosion, piston. */
  @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
  public void onFrameBreak(HangingBreakEvent event) {
    if (!holdsElytra(event.getEntity())) {
      return;
    }
    if (event instanceof HangingBreakByEntityEvent byEntity && bypasses(byEntity.getRemover())) {
      return;
    }
    event.setCancelled(true);
  }

  /** Right click: no rotating a locked elytra, and remember who hangs up their own. */
  @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
  public void onFrameChange(PlayerItemFrameChangeEvent event) {
    Player player = event.getPlayer();
    ItemFrame frame = event.getItemFrame();
    switch (event.getAction()) {
      case ROTATE -> {
        if (holdsElytra(frame) && !bypasses(player)) {
          event.setCancelled(true);
          player.sendActionBar(plugin.claims().hasClaimed(player.getUniqueId())
              ? plugin.message("already-claimed", Map.of("date",
                  ElytraLockPlugin.date(plugin.claims().get(player.getUniqueId()).at())))
              : plugin.message("locked-hint"));
        }
      }
      case PLACE -> {
        if (event.getItemStack().getType() == Material.ELYTRA) {
          frame.getPersistentDataContainer().set(plugin.placedByKey(), PersistentDataType.STRING,
              player.getUniqueId().toString());
        }
      }
      default -> {
        // REMOVE never gets here for elytras: the punch is cancelled in onFrameDamage first.
      }
    }
  }
}
