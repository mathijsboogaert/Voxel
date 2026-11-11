#!/usr/bin/env python3
"""Fetch player heads and write the roster.

Usage:  python3 tools/fetch_faces.py [data-folder] [faces-folder]
        python3 tools/fetch_faces.py --refresh      # re-download every head (skin changes)

Reads the player names from <data-folder>/voxel-sessions.csv, looks each one up on Mojang's
profile API, downloads the head as a PNG into <faces-folder>/<name>.png and writes
<data-folder>/players.json (name + uuid). Heads already on disk are kept unless --refresh is given,
and re-checked once a day (UTC date in players.json `face_checked`), so skin changes and heads that
came back as Steve show up within a day. The file is only rewritten when the image changed, and a
real head is never replaced by Minotar's Steve fallback (it serves Steve when it can't reach the skin).
A player Mojang does not know (offline-mode account, renamed) gets no face file; the site shows
a plain letter tile for them instead.
"""

import csv
import datetime
import pathlib
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

PROFILE = 'https://api.mojang.com/users/profiles/minecraft/{}'
HEAD = 'https://minotar.net/helm/{}/128.png'  # face plus hat layer, 128px (shown pixelated)
# sha256 of Minotar's Steve head (/helm/<x>/128.png): what it returns when it can't get the skin.
STEVE = {'8266c20bee5826023265f2348690aff50e048ad7e8136d18605b41e4a21f2c08'}
UA = {'User-Agent': 'voxel-site/1.0 (github.com/mathijsboogaert/Voxel)'}


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (204, 404):
                return None
            if e.code == 429:
                time.sleep(5 * (i + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            time.sleep(2 * (i + 1))
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    refresh = '--refresh' in sys.argv
    data = args[0] if args else 'docs/data'
    faces = args[1] if len(args) > 1 else 'docs/faces'
    os.makedirs(faces, exist_ok=True)

    with open(os.path.join(data, 'voxel-sessions.csv'), newline='') as f:
        names = sorted({r['player'] for r in csv.DictReader(f)}, key=str.lower)

    path = os.path.join(data, 'players.json')
    old = {}
    if os.path.exists(path):
        with open(path) as f:
            old = {p['name']: p for p in json.load(f)}

    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    roster, fetched, missing = [], 0, []
    for name in names:
        prev = old.get(name, {})
        uuid = prev.get('uuid')
        checked = prev.get('face_checked')
        face = os.path.join(faces, name + '.png')
        have_face = os.path.exists(face)
        if refresh or not have_face or not uuid or checked != today:
            if not uuid or refresh:
                body = get(PROFILE.format(name))
                if body:
                    uuid = json.loads(body).get('id')
                time.sleep(0.3)
            png = get(HEAD.format(uuid or name)) if uuid else None
            if png and png[:4] == b'\x89PNG':
                checked = today
                old_png = pathlib.Path(face).read_bytes() if have_face else None
                is_steve = hashlib.sha256(png).hexdigest() in STEVE
                had_real = old_png is not None and hashlib.sha256(old_png).hexdigest() not in STEVE
                if png != old_png and not (is_steve and had_real):
                    with open(face, 'wb') as f:
                        f.write(png)
                    fetched += 1
                have_face = True
            elif not have_face:
                missing.append(name)
            time.sleep(0.3)
        entry = {'name': name, 'uuid': uuid}
        if checked:
            entry['face_checked'] = checked
        # keep any hand-added fields (display name, etc.)
        entry.update({k: v for k, v in prev.items() if k not in entry})
        roster.append(entry)

    with open(path, 'w') as f:
        json.dump(roster, f, indent=2)
        f.write('\n')
    print(
        f'{len(roster)} players, {fetched} heads updated' + (f', no face for: {", ".join(missing)}' if missing else '')
    )


if __name__ == '__main__':
    main()
