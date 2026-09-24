#!/usr/bin/env python3
"""Fill docs/viewer_template.html with a seed's JSON metadata + PNG filename."""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <basename-without-extension>", file=sys.stderr)
        sys.exit(1)

    base = sys.argv[1]
    json_path = base + ".json"
    png_path = base + ".png"
    out_path = base + ".html"

    with open(json_path) as f:
        data = json.load(f)

    with open(os.path.join(ROOT, "docs", "viewer_template.html")) as f:
        template = f.read()

    html = template
    html = html.replace("__IMAGE_FILENAME__", os.path.basename(png_path))
    html = html.replace("__SEED__", str(data["seed"]))
    html = html.replace("__MC_VERSION__", data["mcVersion"])
    html = html.replace("__SPAWN_X__", str(data["spawn"]["x"]))
    html = html.replace("__SPAWN_Z__", str(data["spawn"]["z"]))
    html = html.replace("__BLOCKS_PER_PIXEL__", str(data["image"]["blocksPerPixel"]))
    html = html.replace("__DATA_JSON__", json.dumps(data))

    with open(out_path, "w") as f:
        f.write(html)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
