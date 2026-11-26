#!/usr/bin/env python3
"""Baut aus desktop/ eine einzelne HTML-Datei (CSS und JS eingebettet).
Aufruf: python3 tools/build-browser.py ausgabe.html [--artifact]
Mit --artifact wird das Ergebnis ohne <html>/<head>/<body>-Gerüst und ohne CSP-Meta
geschrieben (für das Veröffentlichen als Artifact-Seite)."""
import re, sys, pathlib
d = pathlib.Path(__file__).resolve().parent.parent / 'desktop'
html = (d / 'index.html').read_text()
css, core, ui = [(d / f).read_text() for f in ('style.css', 'core.js', 'ui.js')]
for js in (core, ui): assert '</script' not in js
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body)          # externe Skripte entfernen
page = f'<title>Federgewicht</title>\n<style>\n{css}\n</style>\n{body}\n<script>\n{core}\n</script>\n<script>\n{ui}\n</script>\n'
if '--artifact' not in sys.argv:
    page = '<!doctype html>\n<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">\n' + page + '</head></html>'
pathlib.Path(sys.argv[1]).write_text(page)
print('geschrieben:', sys.argv[1], len(page) // 1024, 'KB')
