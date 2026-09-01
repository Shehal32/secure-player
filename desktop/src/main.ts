import { app, BrowserWindow, session, globalShortcut, Menu } from 'electron';
import * as path from 'path';

// Enforce single-instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

function applyNativeHardwareProtection(win: BrowserWindow) {
  // 1. Electron built-in content protection
  try {
    win.setContentProtection(true);
  } catch (e) {
    console.warn('[FONIX-SECURITY] Electron setContentProtection warning:', e);
  }

  // 2. Direct Windows user32.dll kernel-level display affinity (WDA_EXCLUDEFROMCAPTURE / WDA_MONITOR)
  if (process.platform === 'win32') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const koffi = require('koffi');
      const user32 = koffi.load('user32.dll');
      const kernel32 = koffi.load('kernel32.dll');
      const SetWindowDisplayAffinity = user32.func(
        'int __stdcall SetWindowDisplayAffinity(uintptr_t hWnd, uint32_t dwAffinity)',
      );
      const GetLastError = kernel32.func('uint32_t __stdcall GetLastError()');

      const hwndBuf = win.getNativeWindowHandle();
      const hwnd =
        process.arch === 'x64' || process.arch === 'arm64'
          ? hwndBuf.readBigUInt64LE(0)
          : BigInt(hwndBuf.readUInt32LE(0));

      // 0x00000001 = WDA_MONITOR (Renders solid black to all screen capture software)
      // 0x00000011 = WDA_EXCLUDEFROMCAPTURE (Excludes window from capture in Win 10 2004+ / Win 11)
      const resMonitor = SetWindowDisplayAffinity(hwnd, 0x00000001);
      const errMonitor = resMonitor ? 0 : GetLastError();

      console.log(
        `[FONIX-SECURITY] Native SetWindowDisplayAffinity WDA_MONITOR (HWND=${hwnd}, success=${Boolean(resMonitor)}, lastError=${errMonitor})`,
      );
    } catch (e) {
      console.warn('[FONIX-SECURITY] Native user32 display affinity hook fallback:', e);
    }
  }
}

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'EduOne Secure Player — Desktop Enterprise Client',
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      devTools: isDev,
    },
  });

  // Set custom desktop identifier in User-Agent
  const currentUA = mainWindow.webContents.userAgent;
  mainWindow.webContents.userAgent = `${currentUA} EduOneDesktop/1.0.0 FonixEduDesktop/1.0.0`;

  // 1. 🛡️ HARDWARE SCREEN BLACKOUT
  applyNativeHardwareProtection(mainWindow);

  // 2. Remove default application menu
  Menu.setApplicationMenu(null);

  // 3. Load Application (Point to Local Frontend http://localhost:3000 or bundled dist/index.html)
  const localFrontendUrl = 'http://localhost:3000';
  const targetUrl = process.env.FONIX_LIVE_URL || process.env.EDUONE_LIVE_URL || localFrontendUrl;

  mainWindow.loadURL(targetUrl).catch(() => {
    mainWindow?.loadFile(path.join(__dirname, '../../frontend/dist/index.html')).catch((err) => {
      console.error('[EDUONE-ERROR] Failed to load local frontend application:', err);
    });
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      applyNativeHardwareProtection(mainWindow);
      mainWindow.show();
    }
  });

  mainWindow.on('focus', () => {
    if (mainWindow) {
      applyNativeHardwareProtection(mainWindow);
    }
  });

  // 4. Lockdown DevTools & Remote Debugging
  if (!isDev) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow?.webContents.closeDevTools();
    });
  }

  // 5. Block external window popups & navigation leaks
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (
      parsedUrl.hostname !== 'localhost' &&
      parsedUrl.hostname !== '127.0.0.1' &&
      !parsedUrl.hostname.includes('ngrok') &&
      !parsedUrl.protocol.startsWith('file')
    ) {
      event.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register custom OS protocol for one-click deep linking (eduone://play?videoId=... or fonixedu://play?videoId=...)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('eduone', process.execPath, [path.resolve(process.argv[1])]);
    app.setAsDefaultProtocolClient('fonixedu', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('eduone', process.execPath);
  app.setAsDefaultProtocolClient('fonixedu', process.execPath);
}

app.on('second-instance', (_event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();

    const deepLink = commandLine.find((arg) => arg.startsWith('eduone://') || arg.startsWith('fonixedu://'));
    if (deepLink) {
      mainWindow.webContents.send('open-deep-link', deepLink);
    }
  }
});

// macOS Deep Linking handler
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('open-deep-link', url);
  }
});

app.whenReady().then(() => {
  // Clear any existing global shortcuts that might conflict
  globalShortcut.unregisterAll();

  // Deny intrusive permissions (microphone, camera, screen share)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || permission === 'display-capture') {
      return callback(false);
    }
    return callback(true);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
