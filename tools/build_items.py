#!/usr/bin/env python3
"""Build docs/data/items.json: every Minecraft item, its English name, and what it is made from.

Usage:  python3 tools/build_items.py [version] [out-file]
        python3 tools/build_items.py 26.3 docs/data/items.json      # the defaults

The data is the game's own: the item registry, the recipes, the item tags and the English names, as extracted
from the official jar by misode/mcmeta (https://github.com/misode/mcmeta, tags <version>-data, <version>-summary and
<version>-assets-json). Only git is needed; the script fetches just those files.

The site uses it for the item pickers in the editor and for item search: someone looking for oak planks also
finds the shop that sells oak logs, because the recipe for planks has logs in it.

Output shape (kept small, everything by index):
  version       the Minecraft version
  items         [[id, name], ...]                    id without "minecraft:"
  tags          {tag: [item index, ...]}             tags that recipes use, fully expanded
  recipes       {item index: [[kind, count, slots], ...]}
                kind: c craft, f furnace (also blast furnace, smoker, campfire), s stonecutter, m smithing, t transmute
                slots: one entry per distinct ingredient: an item index, or "#tag"
"""

import json
import os
import subprocess
import sys
import tarfile
import tempfile
import io

REPO = 'https://github.com/misode/mcmeta.git'
FURNACE = {'smelting', 'blasting', 'smoking', 'campfire_cooking'}


def archive(repo, tag, *paths):
    subprocess.run(['git', '-C', repo, 'fetch', '-q', '--depth', '1', 'origin', 'tag', tag], check=True)
    out = subprocess.run(['git', '-C', repo, 'archive', tag, *paths], check=True, capture_output=True).stdout
    return tarfile.open(fileobj=io.BytesIO(out))


def members(tar, prefix):
    for m in tar.getmembers():
        if m.isfile() and m.name.startswith(prefix) and m.name.endswith('.json'):
            yield m.name[len(prefix) : -5], json.load(tar.extractfile(m))


def strip(i):
    return i.split(':', 1)[1] if ':' in i else i


def main():
    version = sys.argv[1] if len(sys.argv) > 1 else '26.3'
    out = (
        sys.argv[2]
        if len(sys.argv) > 2
        else os.path.join(os.path.dirname(__file__), '..', 'docs', 'data', 'items.json')
    )

    with tempfile.TemporaryDirectory() as repo:
        subprocess.run(['git', 'init', '-q', repo], check=True)
        subprocess.run(['git', '-C', repo, 'remote', 'add', 'origin', REPO], check=True)
        summary = archive(repo, f'{version}-summary', 'registries/data.min.json')
        registry = json.load(summary.extractfile('registries/data.min.json'))['item']
        lang = json.load(
            archive(repo, f'{version}-assets-json', 'assets/minecraft/lang/en_us.json').extractfile(
                'assets/minecraft/lang/en_us.json'
            )
        )
        data = archive(repo, f'{version}-data', 'data/minecraft/recipe', 'data/minecraft/tags/item')
        recipes = dict(members(data, 'data/minecraft/recipe/'))
        raw_tags = dict(members(data, 'data/minecraft/tags/item/'))

    items = [i for i in registry if i != 'air']
    index = {i: n for n, i in enumerate(items)}

    def name(i):
        base = lang.get(f'item.minecraft.{i}') or lang.get(f'block.minecraft.{i}') or i.replace('_', ' ').title()
        # Some items share a name in game (every template is "Smithing Template"); add what the tooltip says.
        if i.endswith('_armor_trim_smithing_template'):
            extra = lang.get(f'trim_pattern.minecraft.{i[: -len("_armor_trim_smithing_template")]}')
        elif i.endswith('_upgrade_smithing_template'):
            extra = lang.get(f'upgrade.minecraft.{i[: -len("_smithing_template")]}')
        else:
            extra = lang.get(f'item.minecraft.{i}.desc')
        shared = i.endswith(('_smithing_template', '_banner_pattern')) or i.startswith('music_disc_')
        return f'{base} ({extra})' if extra and shared else base

    # Tags can contain other tags; expand them to plain items.
    cache = {}

    def expand(tag, seen=()):
        if tag in cache:
            return cache[tag]
        found = []
        for v in raw_tags.get(tag, {}).get('values', []):
            v = v['id'] if isinstance(v, dict) else v
            if v.startswith('#'):
                t = strip(v[1:])
                if t not in seen:
                    found += expand(t, seen + (tag,))
            elif strip(v) in index:
                found.append(index[strip(v)])
        cache[tag] = sorted(set(found))
        return cache[tag]

    used_tags = {}

    def slot(ing):
        """A recipe ingredient (item, #tag or a list of them) as one slot: an item index or '#tag'."""
        if isinstance(ing, list):
            alts = sorted({x for part in ing for x in alternatives(part)})
            if len(alts) == 1:
                return alts[0]
            key = 'any:' + ','.join(map(str, alts))  # an inline list: store it as an anonymous tag
            used_tags[key] = alts
            return '#' + key
        return slot_one(ing)

    def alternatives(ing):
        s = slot_one(ing)
        return used_tags[s[1:]] if isinstance(s, str) else [s]

    def slot_one(ing):
        if isinstance(ing, dict):
            ing = ing.get('item') or ('#' + ing['tag'])
        if ing.startswith('#'):
            t = strip(ing[1:])
            used_tags[t] = expand(t)
            return '#' + t
        return index.get(strip(ing))

    out_recipes = {}
    for _rid, r in sorted(recipes.items()):
        kind = strip(r['type'])
        res = r.get('result') or {}
        rid_item = strip(res['id']) if isinstance(res, dict) and 'id' in res else None
        if rid_item not in index:
            continue
        if kind == 'crafting_shaped':
            ings, k = list(r['key'].values()), 'c'
        elif kind == 'crafting_shapeless':
            ings, k = r['ingredients'], 'c'
        elif kind in FURNACE:
            ings, k = [r['ingredient']], 'f'
        elif kind == 'stonecutting':
            ings, k = [r['ingredient']], 's'
        elif kind == 'smithing_transform':
            ings, k = [r['template'], r['base'], r['addition']], 'm'
        elif kind == 'crafting_transmute':
            ings, k = [r['input'], r['material']], 't'
        elif kind == 'crafting_imbue':
            ings, k = [r['source'], r['material']], 'c'
        else:
            continue  # dyeing, trims, banner copies, repairs
        slots = []
        for ing in ings:
            s = slot(ing)
            if s is not None and s not in slots:
                slots.append(s)
        if not slots:
            continue
        res_i = index[rid_item]
        entry = [k, res.get('count', 1), slots]
        lst = out_recipes.setdefault(res_i, [])
        if entry not in lst:
            lst.append(entry)

    # Anonymous list tags get short names.
    anon = {}
    for t in list(used_tags):
        if t.startswith('any:'):
            anon[t] = f'any{len(anon)}'
    tags = {anon.get(t, t): v for t, v in used_tags.items()}
    for lst in out_recipes.values():
        for e in lst:
            e[2] = [('#' + anon.get(s[1:], s[1:])) if isinstance(s, str) else s for s in e[2]]

    doc = {
        'version': version,
        'source': f'{REPO} ({version}-data, {version}-summary, {version}-assets-json)',
        'items': [[i, name(i)] for i in items],
        'tags': tags,
        'recipes': {str(k): v for k, v in sorted(out_recipes.items())},
    }
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w') as f:
        json.dump(doc, f, separators=(',', ':'), ensure_ascii=False)
    print(
        f'{len(items)} items, {sum(map(len, out_recipes.values()))} recipes, {len(tags)} tags',
        f'-> {out} ({os.path.getsize(out) // 1024} KB)',
    )


if __name__ == '__main__':
    main()
