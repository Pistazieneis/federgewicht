# Federgewicht

Realistisches Idle-/Incremental-Game: Ein Meteorit der Masse **M** rast auf die Erde zu.
Baue Bots und Upgrades, die ihn abbauen, bevor er einschlägt.

## Spielprinzip
1. Du startest mit **5 kg ΔM** (ΔM = zerstörte Masse, die Hauptwährung) und kaufst deinen ersten Bot.
2. Der Meteorit fliegt an. Deine Bots bauen ihn automatisch ab, du siehst ihn näher kommen und schrumpfen.
3. Ob zerstört oder eingeschlagen: Die abgebaute Masse wird zu ΔM. Im **Upgrade-Fenster** kaufst du neue Bots und Upgrades.
4. Nur **vollständig zerstörte** Objekte hinterlassen **Iridium** (Spezialwährung für Spezialausrüstung).
   Jeder zerstörte Meteorit bringt die nächste, schwerere Stufe. Schlägt einer ein, geht es wieder bei
   Stufe 1 (dem leichtesten Objekt) los. Bots und Upgrades bleiben, du kommst jedes Mal weiter.
5. Die Objekte sind in **Klassen** eingeteilt (Meteoroid, Meteorit, Asteroid, ...). Zwischen den Klassen
   liegen große Massensprünge, das sind die Wände.
6. **Prestige** (ab dem 5. Meteoriten): Forschungspunkte hängen vom insgesamt gewonnenen ΔM ab,
   geben einen dauerhaften Abbaubonus und schalten Forschungs-Upgrades frei.

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
| `desktop/ui.js` | Oberfläche, Shops, Canvas-Szene |
| `desktop/index.html`, `style.css` | Layout und Optik |
| `desktop/main.js` | Electron-Fenster |
| `tools/sim.js` | Balance-Simulation: `node tools/sim.js 40` |
| `tools/build-browser.py` | Baut die Einzeldatei für die Browser-Version |

## Lizenz
Proprietär, alle Rechte vorbehalten. Siehe `LICENSE`.
