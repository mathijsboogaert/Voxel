#!/usr/bin/env python3
"""Builds Villager News from its editions: every docs/news/editions/<slug>.json gets its own page at
docs/news/<slug>/index.html (so each edition has a link of its own, with a title and summary for Discord
previews), and docs/news/editions.json lists them all for the archive page (docs/news/).

Usage:  python3 tools/build_news.py

Write an edition in the news editor (docs/news/editor/), download it and put the file in docs/news/editions/.
Then stamp versions as for any page change (python3 tools/stamp_versions.py).
The "Build news" workflow does both on every push that changes an edition, so uploading on GitHub is enough.
Running it again without changes changes nothing. Pages of editions that were removed are removed too
(only pages this script wrote, recognised by the marker below).
"""

import html
import json
import re
import shutil
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / 'docs'
NEWS = DOCS / 'news'
EDITIONS = NEWS / 'editions'
SITE = 'https://mathijsboogaert.github.io/Voxel/'
MARKER = '<!-- built by tools/build_news.py -->'
SLUG = re.compile(r'^[a-z0-9][a-z0-9-]{0,63}$')
VERSION = re.compile(r'\?v=[0-9a-f]{8}')
RESERVED = {'assets', 'editions', 'editor'}

PAGE = """<!doctype html>
{marker}
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title} · Villager News</title>
    <meta name="description" content="{summary}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Voxel" />
    <meta property="og:title" content="{title} · Villager News" />
    <meta property="og:description" content="{summary}" />
    <meta property="og:url" content="{url}" />
    <meta property="og:image" content="{site}assets/logo-mark.png" />
    <meta name="theme-color" content="#16213e" />
    <link rel="icon" href="../../assets/favicon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@400..700&display=swap" rel="stylesheet" />
    <link rel="preload" href="../assets/Minecraft.ttf" as="font" type="font/ttf" crossorigin />
    <link rel="stylesheet" href="../assets/news.css" />
    <link rel="stylesheet" href="../assets/viewer.css" />
  </head>
  <body data-slug="{slug}">
    <main class="vn-stage" id="stage" aria-label="{title}"></main>
    <audio id="intro" src="../assets/intro.mp3" preload="auto"></audio>
    <div id="tune"><button type="button">&#9654; Tune in</button></div>
    <div id="hint">Use the arrow keys, click, or swipe to go through the news</div>
    <div id="ui">
      <a href="../" aria-label="All editions">All news</a>
      <button id="prev" type="button" aria-label="Previous slide">&#8249;</button>
      <span id="count"></span>
      <button id="next" type="button" aria-label="Next slide">&#8250;</button>
      <button id="fs" type="button" aria-label="Full screen">&#x26F6;</button>
    </div>
    <script type="module" src="../assets/player.js"></script>
  </body>
</html>
"""


def problems(ed, slug):
    """What is wrong with an edition, as a list of sentences (empty when it's fine)."""
    out = []
    if not SLUG.match(slug) or slug in RESERVED:
        names = ', '.join(sorted(RESERVED))
        out.append(f'the file name "{slug}" should be lowercase letters, digits and dashes (and not {names})')
    if ed.get('slug') not in (None, slug):
        out.append(f'its slug "{ed.get("slug")}" differs from the file name; the file name wins')
    if not isinstance(ed.get('pages'), list) or not ed['pages']:
        out.append('it has no pages')
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', str(ed.get('date', ''))):
        out.append('its date should look like 2026-11-14')
    return out


def main():
    EDITIONS.mkdir(parents=True, exist_ok=True)
    listing = []
    built = set()
    failed = False
    for path in sorted(EDITIONS.glob('*.json')):
        slug = path.stem
        try:
            ed = json.loads(path.read_text(encoding='utf-8'))
        except json.JSONDecodeError as e:
            print(f'{path.name}: not valid JSON ({e})', file=sys.stderr)
            failed = True
            continue
        issues = problems(ed, slug)
        fatal = [i for i in issues if 'differs' not in i]
        for i in issues:
            print(f'{path.name}: {i}', file=sys.stderr)
        if fatal:
            failed = True
            continue
        if ed.get('draft'):
            continue
        title = ed.get('title') or 'Villager News'
        summary = ed.get('summary') or f'{title}, the latest from Voxel.'
        page = PAGE.format(
            marker=MARKER,
            slug=html.escape(slug),
            title=html.escape(title),
            summary=html.escape(summary),
            url=f'{SITE}news/{slug}/',
            site=SITE,
        )
        out = NEWS / slug / 'index.html'
        out.parent.mkdir(exist_ok=True)
        # Compare without the ?v= versions tools/stamp_versions.py adds afterwards.
        if not out.exists() or VERSION.sub('', out.read_text(encoding='utf-8')) != page:
            out.write_text(page, encoding='utf-8')
            print(f'wrote news/{slug}/')
        built.add(slug)
        listing.append(
            {
                'slug': slug,
                'title': title,
                'edition': ed.get('edition', ''),
                'date': ed.get('date', ''),
                'summary': summary,
                'pages': len(ed['pages']),
            }
        )

    # Remove pages this script wrote for editions that are gone.
    for d in NEWS.iterdir():
        page = d / 'index.html'
        stale = d.is_dir() and d.name not in built and d.name not in RESERVED and page.exists()
        if stale and MARKER in page.read_text(encoding='utf-8'):
            shutil.rmtree(d)
            print(f'removed news/{d.name}/')

    listing.sort(key=lambda e: (e['date'], e['slug']), reverse=True)
    text = json.dumps(listing, ensure_ascii=False, indent=2) + '\n'
    index = NEWS / 'editions.json'
    if not index.exists() or index.read_text(encoding='utf-8') != text:
        index.write_text(text, encoding='utf-8')
        print('wrote news/editions.json')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
