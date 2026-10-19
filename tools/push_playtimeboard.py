#!/usr/bin/env python3
"""Keep PlaytimeBoard's manual AFK list in step with the datapack's AFK counters.

Usage:  python3 tools/push_playtimeboard.py <data-folder>

PlaytimeBoard counts Minecraft's own play-time statistic, which includes AFK time, and its config has a
manual list (adjust-minutes) of minutes to take off each player. This writes that list from
  - afkMinutes in <data-folder>/adjust.json (hand-entered AFK time from before the datapack), plus
  - the AFK seconds in <data-folder>/afk.json (the datapack's counters, from tools/read_scoreboard.py),
over SFTP, touching nothing else in the config. Admin time is left alone: PlaytimeBoard skips creative and
spectator itself (ignore-gamemodes). The plugin only reads the file when told to, so the server needs
`playtimeboard reload` after a change; a Pterodactyl schedule can run that command (see README).

Same SFTP settings as tools/sync_logs.py, plus
  SFTP_PLAYTIMEBOARD   optional   default "plugins/PlaytimeBoard/config.yml"
A copy of the old file is kept next to it as config.yml.voxel-bak before the first change of a run.
"""
import json, os, re, sys

# The key and the indented lines under it; blank lines and comments at the left edge belong to the next setting.
BLOCK = re.compile(r'(?m)^adjust-minutes:[ \t]*(?:\{\})?[ \t]*\n(?:[ \t]+\S.*\n)*')


def wanted_minutes(data_dir):
    """{player: minutes to take off}, from the hand-entered list plus the datapack counters."""
    out = {}
    try:
        with open(os.path.join(data_dir, 'adjust.json')) as f:
            for name, v in json.load(f).items():
                if isinstance(v, dict) and v.get('afkMinutes'):
                    out[name] = out.get(name, 0) + float(v['afkMinutes'])
    except FileNotFoundError:
        pass
    try:
        with open(os.path.join(data_dir, 'afk.json')) as f:
            for name, v in json.load(f).get('players', {}).items():
                if v.get('afk'):
                    out[name] = out.get(name, 0) + v['afk'] / 60
    except FileNotFoundError:
        pass
    return {n: round(m) for n, m in sorted(out.items(), key=lambda kv: kv[0].lower()) if round(m) > 0}


def with_adjustments(text, minutes):
    """The config text with only the adjust-minutes block replaced (added at the end if it is missing)."""
    block = 'adjust-minutes:\n' + ''.join(f'  "{n}": -{m}\n' for n, m in minutes.items()) if minutes else 'adjust-minutes: {}\n'
    if BLOCK.search(text):
        return BLOCK.sub(lambda _: block, text, count=1)
    return text.rstrip('\n') + '\n\n' + block


def current(text):
    m = BLOCK.search(text)
    return m.group(0) if m else ''


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    minutes = wanted_minutes(sys.argv[1])
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import sync_logs
    path = (os.environ.get('SFTP_PLAYTIMEBOARD') or 'plugins/PlaytimeBoard/config.yml').strip('/')
    transport, sftp = sync_logs.connect()
    try:
        try:
            old = sftp.open(path).read().decode('utf-8')
        except OSError as e:
            print(f'note: could not read {path} ({e}); PlaytimeBoard left alone')
            return
        new = with_adjustments(old, minutes)
        if new == old:
            print('PlaytimeBoard list already up to date')
            return
        sftp.open(path + '.voxel-bak', 'w').write(old.encode('utf-8'))
        sftp.open(path, 'w').write(new.encode('utf-8'))
        print('PlaytimeBoard adjust-minutes updated:')
        print(with_adjustments('', minutes).rstrip())
    finally:
        sftp.close()
        transport.close()


if __name__ == '__main__':
    main()
