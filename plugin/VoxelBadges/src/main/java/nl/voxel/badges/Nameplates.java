package nl.voxel.badges;

import io.papermc.paper.scoreboard.numbers.NumberFormat;
import net.kyori.adventure.key.Key;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.scoreboard.Criteria;
import org.bukkit.scoreboard.DisplaySlot;
import org.bukkit.scoreboard.Objective;
import org.bukkit.scoreboard.Score;
import org.bukkit.scoreboard.Scoreboard;

import java.util.List;

/**
 * Shows badge icons on the line below each player's name.
 *
 * Uses a below_name scoreboard objective. Each player's score is replaced with a fixed
 * text component made of badge glyphs from the resource pack font, so every player gets
 * their own icons. The objective's own title is empty, so only the icons show.
 */
public final class Nameplates {

    private static final String OBJECTIVE = "voxel_badges";
    private static final Key FONT = Key.key("voxel", "badges");

    private final VoxelBadges plugin;
    private Objective objective;

    public Nameplates(VoxelBadges plugin) {
        this.plugin = plugin;
    }

    public void enable() {
        Scoreboard board = Bukkit.getScoreboardManager().getMainScoreboard();
        objective = board.getObjective(OBJECTIVE);
        if (objective == null) {
            objective = board.registerNewObjective(OBJECTIVE, Criteria.DUMMY, Component.empty());
        }
        objective.displayName(Component.empty());
        objective.setDisplaySlot(DisplaySlot.BELOW_NAME);
        for (Player p : Bukkit.getOnlinePlayers()) update(p);
    }

    public void disable() {
        if (objective != null) {
            try {
                objective.unregister();
            } catch (IllegalStateException ignored) {
                // already gone
            }
            objective = null;
        }
    }

    public void update(Player player) {
        if (objective == null) return;
        List<Badge> badges = plugin.badges();
        StringBuilder glyphs = new StringBuilder();
        int count = 0;
        for (Badge b : badges) {
            Tier t = Tier.ofLevel(plugin.store().get(player.getUniqueId(), b.id()));
            if (t == null) continue;
            glyphs.append(b.glyph(t));
            count++;
        }
        Score score = objective.getScore(player.getName());
        score.setScore(count);
        if (count == 0) {
            score.numberFormat(NumberFormat.blank());
        } else {
            score.numberFormat(NumberFormat.fixed(Component.text(glyphs.toString()).font(FONT)));
        }
    }
}
