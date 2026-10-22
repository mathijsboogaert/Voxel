"""Gives every link to a site file a version: `site.css?v=1a2b3c4d`, where the version is the start
of a hash of the file's contents. When a file changes, its links change, so browsers fetch the new
file right away instead of mixing it with a copy they kept from before (GitHub Pages lets browsers
keep files for 10 minutes).

It stamps the stylesheets, scripts and images that the pages (docs/**/*.html) link to, the imports
between scripts (docs/js), and the fixed image paths inside scripts (url('assets/...')).
A script's version also covers the scripts it imports, so a change deep down reaches the pages.

Run before committing a change to the site: python3 tools/stamp_versions.py
Running it again without changes changes nothing.
"""

import hashlib
import pathlib
import re

DOCS = pathlib.Path(__file__).resolve().parent.parent / 'docs'

# A link in a page: href="...", src="..." or srcset="..." to a local .css, .js, .png or .svg.
HTML_LINK = re.compile(
    r'''((?:href|src|srcset)=")((?!https?:|//|#)[^"?]+\.(?:css|js|png|svg))(?:\?v=[0-9a-f]{8})?(")'''
)
# An import between scripts: from './x.js' or import('./x.js').
JS_IMPORT = re.compile(r'''((?:from\s+|import\()\s*')(\./[\w-]+\.js)(?:\?v=[0-9a-f]{8})?(')''')
# A fixed image path in a script: url('assets/....png').
JS_ASSET = re.compile(r'''(url\(')(assets/[^'?]+\.(?:png|svg))(?:\?v=[0-9a-f]{8})?('\))''')


def version(path):
    """The first 8 hex digits of the file's hash. For a script this includes the versions of what it
    imports (stamped before it), so a change in an imported script gives the importer a new version too."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def stamp(text, pattern, resolve):
    """Puts ?v=... after every link the pattern finds; resolve(link) gives the file it points to."""

    def replace(m):
        target = resolve(m.group(2))
        if not target.is_file():
            return m.group(0)
        return f'{m.group(1)}{m.group(2)}?v={version(target)}{m.group(3)}'

    return pattern.sub(replace, text)


def write_if_changed(path, text):
    if path.read_text() != text:
        path.write_text(text)
        print('stamped', path.relative_to(DOCS.parent))


def main():
    # Scripts first, leaves before the scripts that import them, so each version covers its imports.
    scripts = {p.name: p for p in (DOCS / 'js').glob('*.js')}
    imports = {
        n: set(re.findall(r"""(?:from\s+|import\()\s*'\./([\w-]+\.js)""", p.read_text())) for n, p in scripts.items()
    }
    done = []
    while len(done) < len(scripts):
        ready = [n for n in sorted(scripts) if n not in done and imports[n] <= set(done)]
        if not ready:
            raise SystemExit(f'Scripts import each other in a circle: {sorted(set(scripts) - set(done))}')
        for name in ready:
            path = scripts[name]
            text = stamp(path.read_text(), JS_IMPORT, lambda link: DOCS / 'js' / link[2:])
            text = stamp(text, JS_ASSET, lambda link: DOCS / link)
            write_if_changed(path, text)
            done.append(name)

    for page in DOCS.rglob('*.html'):
        text = stamp(page.read_text(), HTML_LINK, lambda link, page=page: (page.parent / link).resolve())
        write_if_changed(page, text)


if __name__ == '__main__':
    main()
