#!/usr/bin/env python3
"""Fetch the Overworld region files that changed since the last map render, over SFTP.

Usage:  python3 tools/world/sync_world.py <folder> [--cache DIR] [--all]

It finds the Overworld's region folder on the server (world/region in older versions; it also looks
under world/dimensions/ and a few levels deeper, skipping the Nether and the End), writes
<folder>/listing.json with every region's size and modified time, and downloads into <folder>/region/
only the regions whose size or time differ from what the last render used (the render cache's
fingerprints.json). Then:

  python3 tools/world/render_world.py <folder> --listing <folder>/listing.json

renders the changed regions and takes the rest from the cache. A night that is skipped is caught up
the next time, because the comparison is with the last render, not with the clock. Without a cache
(the first run, or after it expired) every region is downloaded.

Uses the same settings as tools/sync_logs.py (SFTP_HOST, SFTP_USER, SFTP_PASSWORD or SFTP_KEY,
SFTP_PORT, SFTP_HOST_FINGERPRINT), plus SFTP_WORLD_DIR (default "world"), or SFTP_REGION_DIR to name
the region folder exactly.
"""

import argparse
import json
import os
import re
import stat
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from sync_logs import connect  # noqa: E402

REGION_NAME = re.compile(r'^r\.(-?\d+)\.(-?\d+)\.mca$')


NOT_OVERWORLD = re.compile(r'nether|the_end|DIM-?1', re.I)


def find_region_dir(sftp, world):
    """The Overworld's region folder: the known places first, then a search a few levels down."""

    def is_dir(path):
        try:
            return stat.S_ISDIR(sftp.stat(path).st_mode)
        except OSError:
            return False

    for path in (f'{world}/region', f'{world}/dimensions/minecraft/overworld/region'):
        if is_dir(path):
            return path
    queue = [(world, 0)]
    while queue:
        path, depth = queue.pop(0)
        try:
            entries = sftp.listdir_attr(path)
        except OSError:
            continue
        for e in entries:
            child = f'{path}/{e.filename}'
            if not stat.S_ISDIR(e.st_mode) or NOT_OVERWORLD.search(child[len(world) :]):
                continue
            if e.filename == 'region':
                return child
            if depth < 4:
                queue.append((child, depth + 1))
    try:
        found = ', '.join(sorted(e.filename for e in sftp.listdir_attr(world)))
    except OSError as err:
        found = f'(could not list it: {err})'
    sys.exit(f'No region folder found under {world}/. It holds: {found}. Set SFTP_REGION_DIR to the right folder.')


def plan(remote, cached, everything=False):
    """The regions to download: those whose size:mtime differs from the cache (or all of them)."""
    return sorted(k for k, (size, mtime) in remote.items() if everything or cached.get(k) != f'{size}:{mtime}')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('folder')
    ap.add_argument('--cache', default=os.path.expanduser('~/.cache/voxel-world'))
    ap.add_argument('--all', action='store_true', help='download every region, whatever the cache says')
    a = ap.parse_args()

    region_dir = os.path.join(a.folder, 'region')
    os.makedirs(region_dir, exist_ok=True)
    try:
        with open(os.path.join(a.cache, 'fingerprints.json')) as f:
            cached = json.load(f)
    except (OSError, ValueError):
        cached = {}
        print('No render cache yet: every region will be downloaded.')

    transport, sftp = connect()
    try:
        world = (os.environ.get('SFTP_WORLD_DIR') or 'world').strip('/')
        remote_dir = (os.environ.get('SFTP_REGION_DIR') or '').strip('/') or find_region_dir(sftp, world)
        print(f'Region files: {remote_dir}/')
        remote = {}
        try:
            entries = sftp.listdir_attr(remote_dir)
        except OSError as err:
            sys.exit(f'Could not list {remote_dir} on the server ({err}). Set SFTP_REGION_DIR to the right folder.')
        for entry in entries:
            m = REGION_NAME.match(entry.filename)
            if m and stat.S_ISREG(entry.st_mode) and entry.st_size:
                remote[f'{m[1]},{m[2]}'] = (entry.st_size, int(entry.st_mtime))
        if not remote:
            sys.exit(f'No region files found in {remote_dir} on the server.')
        with open(os.path.join(a.folder, 'listing.json'), 'w') as f:
            json.dump(remote, f)

        todo = plan(remote, cached, a.all)
        total = sum(remote[k][0] for k in todo)
        print(f'{len(remote)} regions on the server; {len(todo)} changed since the last render ({total / 1e6:.0f} MB).')
        t0 = time.time()
        for i, key in enumerate(todo, 1):
            x, z = key.split(',')
            name = f'r.{x}.{z}.mca'
            local = os.path.join(region_dir, name)
            sftp.get(f'{remote_dir}/{name}', local)
            # Keep the server's time, so the renderer's fingerprint matches the listing.
            os.utime(local, (remote[key][1], remote[key][1]))
            if i % 25 == 0 or i == len(todo):
                print(f'  [{i}/{len(todo)}] {time.time() - t0:.0f}s', flush=True)
    finally:
        sftp.close()
        transport.close()


if __name__ == '__main__':
    main()
