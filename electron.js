import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. Import your existing server so it starts automatically!
import './server.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
    },
  });

  // In dev mode, connect to Vite (localhost:5173)
  // In production (software), load the built index.html file
  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});