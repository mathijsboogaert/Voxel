#!/usr/bin/env python3
"""Print how long players have spent around an area, from each chunk's InhabitedTime.

Usage:  python3 tools/world/inhabited.py "<shop label>"     (an area from docs/shops.json)
        python3 tools/world/inhabited.py x0 z0 x1 z1         (a block box)

InhabitedTime counts the ticks a chunk was within simulation distance of any player, all players
together, so it says how much the area was used, not by whom. Downloads only the regions the box
touches, over SFTP, with the same settings as tools/sync_logs.py. Read-only.
"""

import gzip
import json
import os
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
import nbt  # noqa: E402
from sync_logs import connect  # noqa: E402


def box_from_args(args):
    if len(args) == 4:
        x0, z0, x1, z1 = map(int, args)
        return min(x0, x1), min(z0, z1), max(x0, x1), max(z0, z1), f'{x0},{z0} to {x1},{z1}'
    label = ' '.join(args)
    with open(os.path.join(HERE, '..', '..', 'docs', 'shops.json')) as f:
        shops = json.load(f)
    for s in shops:
        if s.get('label', '').lower() == label.lower() and s.get('points'):
            xs = [p['x'] for p in s['points']]
            zs = [p['z'] for p in s['points']]
            return min(xs), min(zs), max(xs), max(zs), s['label']
    sys.exit(f'No area called {label!r} in docs/shops.json')


def hms(ticks):
    s = ticks // 20
    return f'{s // 3600}h {s % 3600 // 60:02d}m'


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    x0, z0, x1, z1, name = box_from_args(sys.argv[1:])
    cx0, cz0, cx1, cz1 = x0 >> 4, z0 >> 4, x1 >> 4, z1 >> 4
    remote = (os.environ.get('SFTP_REGION_DIR') or 'world/dimensions/minecraft/overworld/region').strip('/')
    regions = {(cx >> 5, cz >> 5) for cx in range(cx0, cx1 + 1) for cz in range(cz0, cz1 + 1)}

    transport, sftp = connect()
    bufs = {}
    try:
        for rx, rz in sorted(regions):
            with sftp.open(f'{remote}/r.{rx}.{rz}.mca', 'rb') as f:
                f.prefetch()
                bufs[(rx, rz)] = f.read()
    finally:
        transport.close()

    rows = []
    for cx in range(cx0, cx1 + 1):
        for cz in range(cz0, cz1 + 1):
            buf = bufs[(cx >> 5, cz >> 5)]
            ci = (cx & 31) + (cz & 31) * 32
            off = int.from_bytes(buf[ci * 4 : ci * 4 + 3], 'big')
            if not off:
                rows.append((cx, cz, None))
                continue
            pos = off * 4096
            length = int.from_bytes(buf[pos : pos + 4], 'big')
            comp, body = buf[pos + 4], buf[pos + 5 : pos + 4 + length]
            raw = zlib.decompress(body) if comp == 2 else gzip.decompress(body) if comp == 1 else body
            chunk = nbt.parse(raw)
            chunk = chunk.get('Level', chunk)
            rows.append((cx, cz, int(chunk.get('InhabitedTime', 0))))

    print(f'Area: {name}  (blocks x {x0}..{x1}, z {z0}..{z1}; chunks x {cx0}..{cx1}, z {cz0}..{cz1})')
    print(f'{"chunk":>10}  {"blocks x,z":>14}  time')
    for cx, cz, t in rows:
        print(f'{cx:>4},{cz:<5}  {cx * 16:>6},{cz * 16:<7}  {"not generated" if t is None else hms(t)}')
    known = [t for _, _, t in rows if t is not None]
    if known:
        print(
            f'\nMost-used chunk: {hms(max(known))}   Average: {hms(sum(known) // len(known))}'
            f'   Least: {hms(min(known))}'
        )
        print('Each chunk counts while ANY player is near it, so these overlap. The max is the best guess.')


if __name__ == '__main__':
    main()
