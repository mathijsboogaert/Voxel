# ElytraLock

A Paper plugin for Voxel: every item frame (normal or glow) that holds an elytra is locked. Each player can take
**one** elytra out of a frame, **once, ever**. After that every elytra frame stays shut for them. So whoever wants
wings flies to an End ship themselves, and nobody can farm ships to sell elytras.

## How it plays

- **Punch** a locked frame: if you never claimed one, the elytra goes straight into your inventory (or drops at your
  feet when it is full) and your claim is used up. If you already claimed, you get a message with the date and the
  frame stays shut.
- **Right click** (rotate) does nothing and shows a hint.
- Arrows, TNT, creepers, fire, breaking the block behind the frame, pistons: all cancelled while the frame holds an
  elytra. The frame floats if its wall is gone, like it does with other protection plugins.
- **Your own elytra on display:** if you hang your own elytra in a frame, you can always take it back without using
  your claim. Anyone else who takes it uses theirs.

## Commands

| Command                          | Who      | What                                        |
| -------------------------------- | -------- | ------------------------------------------- |
| `/elytralock` (or `/elytra`)     | everyone | Shows whether you claimed yours, and when   |
| `/elytralock check <player>`     | ops      | Same for someone else                       |
| `/elytralock reset <player>`     | ops      | Gives a player their claim back             |
| `/elytralock list`               | ops      | Everyone who claimed, with the date         |
| `/elytralock reload`             | ops      | Reloads the messages in `config.yml`        |

Permissions: `elytralock.admin` (ops by default) for the commands above. `elytralock.bypass` lets someone take
elytras and break frames freely without a claim; it is **not** given to ops by default, so ops play by the same rule.
Give it with LuckPerms (or similar) when you need to build or clean up.

## Files

- `plugins/ElytraLock/config.yml`: all messages (MiniMessage).
- `plugins/ElytraLock/claims.yml`: who claimed, by UUID, with name and time. Use `/elytralock reset` rather than
  editing it while the server runs.

## Build and install

GitHub builds it: the **Build ElytraLock** workflow runs on every change here (or by hand in the Actions tab) and
puts `ElytraLock-1.0.0.jar` under the run's **Artifacts**. Unzip, upload the jar to the server's `plugins/` folder,
restart.

Locally, with Java 21+ and Maven: `mvn package -Dpaper.version=<a 26.x paper-api version>`; the jar lands in `target/`.
