#!/usr/bin/env python3
"""Fetch the Overworld region files that changed since the last map render, over SFTP.

Usage:  python3 tools/world/sync_world.py <folder> [--cache DIR] [--all]

It lists world/region/ on the server, writes <folder>/listing.json with every region's size and
modified time, and downloads into <folder>/region/ only the regions whose size or time differ from
what the last render used (the render cache's fingerprints.json). Then:

  python3 tools/world/render_world.py <folder> --listing <folder>/listing.json

renders the changed regions and takes the rest from the cache. A night that is skipped is caught up
the next time, because the comparison is with the last render, not with the clock. Without a cache
(the first run, or after it expired) every region is downloaded.

Uses the same settings as tools/sync_logs.py (SFTP_HOST, SFTP_USER, SFTP_PASSWORD or SFTP_KEY,
SFTP_PORT, SFTP_HOST_FINGERPRINT), plus SFTP_WORLD_DIR (default "world").
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
        remote_dir = (os.environ.get('SFTP_WORLD_DIR') or 'world').rstrip('/') + '/region'
        remote = {}
        for entry in sftp.listdir_attr(remote_dir):
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
