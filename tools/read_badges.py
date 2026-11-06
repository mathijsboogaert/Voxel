#!/usr/bin/env python3
"""Copies who holds which community badge from the VoxelBadges plugin into docs/badges.json.

Usage:  python3 tools/read_badges.py <folder> docs/badges.json

<folder> is where tools/sync_logs.py put the plugin's files:
  voxelbadges-badges.yml   per player UUID: their name and the tier of each badge (1 bronze ... 4 diamond)
  voxelbadges-config.yml   the badges themselves: id, name and what each tier needs

badges.json gets `players` (by Minecraft name) from the first and `badges` from the second; `points` is
left as it is. A file that is missing or can't be read leaves its part of badges.json unchanged, so a
failed download never empties the page. Needs PyYAML.
"""

import json
import os
import sys

import yaml


def load(path):
    if not os.path.isfile(path):
        print(f'note: no {os.path.basename(path)}, keeping what badges.json has')
        return None
    try:
        with open(path, encoding='utf-8') as f:
            return yaml.safe_load(f) or {}
    except (OSError, yaml.YAMLError) as e:
        print(f'note: could not read {path} ({e}), keeping what badges.json has')
        return None


def players_from(store):
    out = {}
    for entry in ((store or {}).get('players') or {}).values():
        if not isinstance(entry, dict) or not entry.get('name') or entry['name'] == '?':
            continue
        held = {
            str(badge): int(level)
            for badge, level in (entry.get('badges') or {}).items()
            if isinstance(level, int) and 1 <= level <= 4
        }
        if held:
            out[str(entry['name'])] = held
    return dict(sorted(out.items(), key=lambda kv: kv[0].lower()))


def badges_from(config):
    out = []
    for badge_id, b in ((config or {}).get('badges') or {}).items():
        tiers = [str(t) for t in (b or {}).get('tiers') or []]
        if len(tiers) == 4:
            out.append({'id': str(badge_id), 'name': str(b.get('name') or badge_id), 'tiers': tiers})
    return out


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    folder, target = sys.argv[1], sys.argv[2]
    with open(target, encoding='utf-8') as f:
        data = json.load(f)

    store = load(os.path.join(folder, 'voxelbadges-badges.yml'))
    if store is not None:
        data['players'] = players_from(store)
    config = load(os.path.join(folder, 'voxelbadges-config.yml'))
    if config is not None:
        badges = badges_from(config)
        if badges:
            data['badges'] = badges

    with open(target, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'{len(data.get("players", {}))} players hold a badge, {len(data.get("badges", []))} badges')


if __name__ == '__main__':
    main()
