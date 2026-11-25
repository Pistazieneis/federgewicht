// Electron-Hauptprozess: öffnet nur ein Fenster mit dem Spiel (index.html).
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
function createWindow () {
  const win = new BrowserWindow({
    width: 1000, height: 900, title: 'Federgewicht',
    backgroundColor: '#14121f',
    webPreferences: { contextIsolation: true }   // Spiel läuft isoliert, localStorage speichert den Spielstand
  });
  Menu.setApplicationMenu(null);                 // kein Menü, wirkt wie ein richtiges Spiel
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
