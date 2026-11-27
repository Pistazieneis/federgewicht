#!/usr/bin/env python3
"""Baut aus desktop/ eine einzelne HTML-Datei (CSS und JS eingebettet).
Aufruf: python3 tools/build-browser.py ausgabe.html [--artifact]
Mit --artifact wird das Ergebnis ohne <html>/<head>/<body>-Gerüst und ohne CSP-Meta
geschrieben (für das Veröffentlichen als Artifact-Seite)."""
import re, sys, pathlib
d = pathlib.Path(__file__).resolve().parent.parent / 'desktop'
html = (d / 'index.html').read_text()
css, core, sfx, art, ui = [(d / f).read_text() for f in ('style.css', 'core.js', 'sfx.js', 'art.js', 'ui.js')]
for js in (core, sfx, art, ui): assert '</script' not in js
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body)          # externe Skripte entfernen
head = f'<title>Federgewicht</title>\n<style>\n{css}\n</style>\n'
tail = f'{body}\n<script>\n{core}\n</script>\n<script>\n{sfx}\n</script>\n<script>\n{art}\n</script>\n<script>\n{ui}\n</script>\n'
if '--artifact' in sys.argv:
    page = head + tail            # Artifact-Seiten bekommen das Gerüst (html/head/body) vom Server
else:
    page = ('<!doctype html>\n<html lang="de"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n' + head + '</head>\n<body>\n' + tail + '</body></html>\n')
pathlib.Path(sys.argv[1]).write_text(page)
print('geschrieben:', sys.argv[1], len(page) // 1024, 'KB')
