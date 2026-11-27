# Federgewicht

Realistisches Idle-/Incremental-Game: Ein Meteorit der Masse **M** rast auf die Erde zu.
Baue Bots und Upgrades, die ihn abbauen, bevor er einschlägt.

## Spielprinzip
1. Du startest mit **5 kg ΔM** (ΔM = zerstörte Masse, die Hauptwährung) und kaufst deinen ersten Bot.
2. Ein **Lauf** beginnt: Die Objekte fallen **nacheinander** auf die Erde, vom Fahrrad über Kleinwagen,
   Elefant und Eiffelturm bis zu echten Asteroiden. Deine Bots bauen jedes Objekt automatisch ab.
   Zwischen den Objekten gibt es keinen Shop.
3. Schafft ein Objekt es durch, **explodiert die Erde** (egal wie leicht es war), der Lauf endet und der
   **Upgrade-Shop** öffnet sich. Der nächste Lauf beginnt wieder beim Fahrrad. Bots und Upgrades bleiben.
4. Jedes zerstörte Objekt bringt ΔM in Höhe seiner Masse und **Iridium** (Spezialwährung für
   Spezialausrüstung, bleibt auch nach Prestige).
5. Die Objekte sind in **Klassen** eingeteilt (Alltag, Kleiner Asteroid, Asteroid, ...). Zwischen den Klassen
   liegen große Massensprünge, das sind die Wände.
6. **Prestige** (ab dem 5. Objekt): Forschungspunkte hängen vom insgesamt gewonnenen ΔM ab,
   geben einen dauerhaften Abbaubonus und schalten Forschungs-Upgrades frei.

Alle Töne werden live synthetisiert (Schalter „Ton“ oben rechts).

Bedienung: `Enter` = Abbau starten, `Shift+Klick` im Shop = bis zu 10 Käufe. Gekämpft wird komplett automatisch.

## Spielen
Unter **Releases** gibt es zwei Dateien:
- `Federgewicht-Windows.zip`: entpacken, `Federgewicht.exe` starten.
- `Federgewicht-Browser.html`: herunterladen und per Doppelklick im Browser öffnen (Windows, Mac, Linux).

Direkt aus dem Repo: `desktop/index.html` im Browser öffnen.

## Selbst bauen (Node.js 20)
```
cd desktop
npm install
npm start               # Spiel direkt starten
npm run package:win     # -> dist/Federgewicht-win32-x64
```

## Release veröffentlichen
Tag setzen (`git tag v0.1.0 && git push --tags`) oder auf GitHub **Actions -> Build & Release -> Run workflow**
mit Version eintragen. Der Workflow baut die Windows-Version und die Browser-Datei und hängt beides an ein Release.

## Aufbau
| Datei | Inhalt |
|---|---|
| `desktop/core.js` | Spielregeln und Balance (ohne Oberfläche) |
| `desktop/ui.js` | Oberfläche, Shops, Canvas-Szene, Explosion |
| `desktop/sfx.js` | Sound (Web Audio, ohne Audiodateien) |
| `desktop/art.js` | Gezeichnete Illustrationen der Alltagsobjekte |
| `desktop/index.html`, `style.css` | Layout und Optik |
| `desktop/main.js` | Electron-Fenster |
| `tools/sim.js` | Balance-Simulation: `node tools/sim.js 40` |
| `tools/build-browser.py` | Baut die Einzeldatei für die Browser-Version |

## Lizenz
Proprietär, alle Rechte vorbehalten. Siehe `LICENSE`.
