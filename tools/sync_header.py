#!/usr/bin/env python3
"""Writes the site header (skip link, logo, menu) into every page, so it is written in one place: here.

Usage:  python3 tools/sync_header.py

Each page gets the same header with links relative to where the page sits and its own menu entry marked as the
current page. Run it after changing the menu, then format and stamp versions as usual:

  python3 tools/sync_header.py
  npx prettier --write docs && python3 tools/stamp_versions.py   (twice: versions make some lines long enough
  npx prettier --write docs && python3 tools/stamp_versions.py    for prettier to wrap them)
"""

import re
import textwrap
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / 'docs'

# The menu: (key, link from the site root, icon, name).
MENU = [
    ('home', '', 'village', 'Home'),
    ('map', 'map/', 'map', 'Map'),
    ('players', 'players/', 'steve', 'Players'),
    ('shops', 'shops/', 'diamond', 'Shops'),
]
# The editor isn't linked from the site, but on its own page the menu shows it as the current page.
EDITOR = ('editor', 'editor.html', 'editor', 'Editor')

# Every page and the menu entry it belongs to (a player page belongs to Players).
PAGES = {
    'index.html': 'home',
    'map/index.html': 'map',
    'players/index.html': 'players',
    'player/index.html': 'players',
    'shops/index.html': 'shops',
    'editor.html': 'editor',
}

OLD_HEADER = re.compile(r'( *)(?:<a class="skip"[^>]*>[^<]*</a>\s*)?<header class="site-header">.*?</header>', re.S)
MAIN = re.compile(r'<main(?![^>]*\bid=)')


def link(key, href, icon, name, root, current):
    here = ' aria-current="page"' if key == current else ''
    return f"""<a href="{root + href or './'}"{here}>
  <img class="nav__icon" src="{root}assets/icons/nav/{icon}.png" alt="" width="32" height="32" />
  <span class="nav__label">{name}</span>
</a>"""


def header(root, current):
    menu = MENU + ([EDITOR] if current == 'editor' else [])
    links = textwrap.indent('\n'.join(link(*item, root, current) for item in menu), ' ' * 6)
    return f"""<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="{root or './'}" aria-label="Voxel, home">
      <picture>
        <source srcset="{root}assets/logo-mark-reversed-small.png" media="(prefers-color-scheme: dark)" />
        <img class="brand__mark" src="{root}assets/logo-mark-small.png" alt="" width="36" height="36" />
      </picture>
      <span class="brand__name">Voxel</span>
    </a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path class="nav-toggle__open" d="M3 6h18M3 12h18M3 18h18" />
        <path class="nav-toggle__close" d="M5 5l14 14M19 5L5 19" />
      </svg>
    </button>
    <nav class="nav" id="site-nav" aria-label="Main">
{links}
    </nav>
  </div>
</header>"""


def main():
    for page, current in PAGES.items():
        path = DOCS / page
        root = '../' * page.count('/')
        text = path.read_text()
        m = OLD_HEADER.search(text)
        if not m:
            raise SystemExit(f'No <header class="site-header"> in {page}')
        indent = m[1]
        block = '\n'.join(indent + line if line else line for line in header(root, current).splitlines())
        text = text[: m.start()] + block + text[m.end() :]
        text = MAIN.sub('<main id="main"', text, count=1)
        path.write_text(text)


if __name__ == '__main__':
    main()
