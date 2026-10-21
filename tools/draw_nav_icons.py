"""Draws the menu icons (docs/assets/icons/nav) as 8x8 pixel art in the style of Minecraft's village
map marker (nav/village.png, the game's own texture): a 1px black outline around the shape and a few
flat colours. Each icon is a grid of letters; the letters are looked up in its palette.

Run: python3 tools/draw_nav_icons.py   (needs Pillow)
"""

import os

from PIL import Image

out = os.path.join(os.path.dirname(__file__), '..', 'docs', 'assets', 'icons', 'nav')
K = '#000000'
ICONS = {
    # Map: the filled map item, a parchment frame around blue water and green land.
    'map': (
        [
            'aaaaaaaa',
            'appppppa',
            'aplbbgpa',
            'apGlbgpa',
            'apgbbGpa',
            'apbbglpa',
            'appppppa',
            'aaaaaaaa',
        ],
        {'a': K, 'p': '#f2e2c2', 'b': '#4b56f6', 'l': '#88a948', 'g': '#6f8b3a', 'G': '#1a7613'},
    ),
    # Steve: hair, eyes white and blue, nose, beard.
    'steve': (
        [
            'aaaaaaaa',
            'ahhhhhha',
            'ahsssssa',
            'awbssbwa',
            'assnnssa',
            'asmmmmsa',
            'assssssa',
            'aaaaaaaa',
        ],
        {'a': K, 'h': '#4a3423', 's': '#b4846d', 'w': '#f0f0f0', 'b': '#523d89', 'n': '#8a5b45', 'm': '#5e3a26'},
    ),
    # Diamond: the diamond item's rounded gem, a white glint across the top and a dark facet at the bottom.
    'diamond': (
        [
            '..aaaa..',
            '.aWWela.',
            'aWeWllma',
            'aellWlma',
            'allmmlda',
            'almddmda',
            '.amdDda.',
            '..aaaa..',
        ],
        {'a': K, 'W': '#ffffff', 'e': '#a1fbe8', 'l': '#4aedd9', 'm': '#20c5b5', 'd': '#1aaaa7', 'D': '#11727a'},
    ),
    # Book and quill: a closed book with a white feather.
    'writable-book': (
        [
            '......wa',
            'aaaaawfa',
            'arrrwfpa',
            'arrwfrpa',
            'arrkrrpa',
            'arrrrrpa',
            'acccccca',
            'aaaaaaaa',
        ],
        {'a': K, 'r': '#8a3b2a', 'c': '#5e2a1e', 'p': '#e8dcc0', 'w': '#f0f0f0', 'f': '#a8a8a8', 'k': '#2a2a2a'},
    ),
}

FILES = {'writable-book': 'editor'}


def hex_rgba(h):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5)) + (255,)


for name, (rows, pal) in ICONS.items():
    assert len(rows) == 8 and all(len(r) == 8 for r in rows), name
    im = Image.new('RGBA', (8, 8), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                im.putpixel((x, y), hex_rgba(pal[ch]))
    im.save(os.path.join(out, f'{FILES.get(name, name)}.png'))
