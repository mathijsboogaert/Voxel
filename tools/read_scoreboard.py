#!/usr/bin/env python3
"""Read the playtime datapack's lifetime counters from the server's scoreboard and keep a history.

Usage:  python3 tools/read_scoreboard.py <folder-with-scoreboard.dat> <data-folder>

The playtime datapack counts, per player and never resetting, active seconds (pt.total) and AFK seconds
(pt.afktotal). tools/sync_logs.py downloads the world's scoreboard.dat next to the logs; this reads it and
writes into <data-folder>:
  afk.json          the latest numbers per player, in seconds
  afk-history.csv   one row (time_utc,player,active_s,afk_s) whenever a player's numbers change, so the site can
                    tell how much AFK time fell inside each session
Without a scoreboard.dat it does nothing.
"""

import contextlib
import csv
import gzip
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'world'))
import nbt  # noqa: E402


def read_counters(path):
    with open(path, 'rb') as f:
        raw = f.read()
    with contextlib.suppress(OSError):  # the file may or may not be gzipped
        raw = gzip.decompress(raw)
    data = nbt.parse(raw).get('data', {})
    players = {}
    for e in data.get('PlayerScores', []):
        obj = e.get('Objective')
        if obj in ('pt.total', 'pt.afktotal'):
            players.setdefault(e['Name'], {'active': 0, 'afk': 0})['active' if obj == 'pt.total' else 'afk'] = int(
                e.get('Score') or 0
            )
    return players


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    path = os.path.join(src, 'scoreboard.dat')
    if not os.path.exists(path):
        print('no scoreboard.dat, skipping AFK counters')
        return
    players = read_counters(path)
    if not players:
        print('no pt.total / pt.afktotal scores found yet')
        return
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    os.makedirs(out, exist_ok=True)
    hist = os.path.join(out, 'afk-history.csv')
    last = {}
    if os.path.exists(hist):
        with open(hist, newline='') as f:
            for r in csv.DictReader(f):
                last[r['player']] = (int(r['active_s']), int(r['afk_s']))
    new = not os.path.exists(hist)
    rows = [
        (now, n, v['active'], v['afk']) for n, v in sorted(players.items()) if last.get(n) != (v['active'], v['afk'])
    ]
    if rows or new:
        with open(hist, 'a', newline='') as f:
            w = csv.writer(f)
            if new:
                w.writerow(['time_utc', 'player', 'active_s', 'afk_s'])
            w.writerows(rows)
    with open(os.path.join(out, 'afk.json'), 'w') as f:
        json.dump({'generated_at': now, 'players': players}, f, indent=2, sort_keys=True)
        f.write('\n')
    print(f'{len(players)} players with AFK counters, {len(rows)} changed')


if __name__ == '__main__':
    main()
