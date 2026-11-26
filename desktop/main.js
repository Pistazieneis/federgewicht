// Electron-Hauptprozess: öffnet ein Fenster mit dem Spiel (index.html).
// Läuft unter Windows und macOS. Der Spielstand liegt im localStorage von Electron.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow () {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    title: 'Federgewicht',
    backgroundColor: '#090b10',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true }   // Spiel läuft isoliert vom Rest des Systems
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    // macOS braucht ein Menü, sonst funktionieren Cmd+Q, Cmd+H und Vollbild nicht.
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { label: 'Ansicht', submenu: [{ role: 'togglefullscreen' }, { role: 'reload' }] }
    ]));
  } else {
    Menu.setApplicationMenu(null);               // Windows: kein Menü, wirkt wie ein Spiel
  }
  createWindow();
});
app.on('window-all-closed', () => app.quit());
