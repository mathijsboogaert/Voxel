#!/usr/bin/env python3
"""Turn the VoxelBadges plugin's files into docs/data/badges.json for the Badges page.

Usage:  python3 tools/build_badges.py <folder-with-plugin-files> <data-folder>

tools/sync_logs.py downloads plugins/VoxelBadges/config.yml and badges.yml next to the logs as
voxelbadges-config.yml and voxelbadges-badges.yml. This writes into <data-folder>/badges.json:
  badges   every badge in config order: id, name and one requirement per tier (Bronze to Diamond)
  holders  every player with at least one badge: name and {badge id: tier 1-4}
A file that wasn't downloaded keeps its part of the existing badges.json, so a failed download never
empties the page.
"""

import json
import os
import sys

import yaml

TIERS = 4


def read_yaml(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        return yaml.safe_load(f) or {}


def catalog(config):
    out = []
    for badge_id, b in (config.get('badges') or {}).items():
        b = b or {}
        tiers = [str(t) for t in (b.get('tiers') or [])][:TIERS]
        out.append({'id': str(badge_id), 'name': str(b.get('name') or badge_id), 'tiers': tiers})
    return out


def holders(store, known, retired):
    out = []
    for entry in (store.get('players') or {}).values():
        entry = entry or {}
        name = str(entry.get('name') or '')
        if not name or name == '?' or name in retired:
            continue
        badges = {
            str(k): int(v)
            for k, v in (entry.get('badges') or {}).items()
            if str(k) in known and isinstance(v, int) and 1 <= v <= TIERS
        }
        if badges:
            out.append({'name': name, 'badges': badges})
    # Most tiers first, then by name.
    out.sort(key=lambda h: (-sum(h['badges'].values()), h['name'].lower()))
    return out


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    dest = os.path.join(out, 'badges.json')
    old = {}
    if os.path.exists(dest):
        with open(dest, encoding='utf-8') as f:
            old = json.load(f)

    config = read_yaml(os.path.join(src, 'voxelbadges-config.yml'))
    store = read_yaml(os.path.join(src, 'voxelbadges-badges.yml'))
    if config is None and store is None:
        print('no VoxelBadges files, keeping badges.json as it is')
        return

    badges = catalog(config) if config is not None else old.get('badges', [])
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'retired.json')) as f:
        retired = set(json.load(f)['players'])
    known = {b['id'] for b in badges}
    people = holders(store, known, retired) if store is not None else old.get('holders', [])

    os.makedirs(out, exist_ok=True)
    with open(dest, 'w', encoding='utf-8') as f:
        json.dump({'badges': badges, 'holders': people}, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'wrote {dest}: {len(badges)} badges, {len(people)} players with badges')


if __name__ == '__main__':
    main()
