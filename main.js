const { app, BrowserWindow, Menu, dialog, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

const isDev = !app.isPackaged;

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const DICT_PATH = () => path.join(app.getPath('userData'), 'dictionary.json');

const DEFAULT_BOUNDS = { width: 1100, height: 750 };
const MAX_RECENT = 5;

let mainWindow = null;
let mirroredDirty = false;
let forceClose = false;

// ---------------------------------------------------------------------------
// small JSON config store (window bounds + recent files) in userData
// ---------------------------------------------------------------------------
function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      windowBounds: parsed.windowBounds || {},
      recentFiles: Array.isArray(parsed.recentFiles) ? parsed.recentFiles : []
    };
  } catch (e) {
    return { windowBounds: {}, recentFiles: [] };
  }
}

function saveConfig(config) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
    fs.writeFileSync(CONFIG_PATH(), JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

let appConfig = loadConfig();

function addRecentFile(filePath) {
  appConfig.recentFiles = appConfig.recentFiles.filter((p) => p !== filePath);
  appConfig.recentFiles.unshift(filePath);
  appConfig.recentFiles = appConfig.recentFiles.slice(0, MAX_RECENT);
  saveConfig(appConfig);
  rebuildMenu();
}

function removeRecentFile(filePath) {
  appConfig.recentFiles = appConfig.recentFiles.filter((p) => p !== filePath);
  saveConfig(appConfig);
  rebuildMenu();
}

// ---------------------------------------------------------------------------
// window
// ---------------------------------------------------------------------------
function createMainWindow() {
  const b = appConfig.windowBounds || {};
  const validBounds =
    typeof b.width === 'number' && b.width >= 500 &&
    typeof b.height === 'number' && b.height >= 400;

  mainWindow = new BrowserWindow({
    width: validBounds ? b.width : DEFAULT_BOUNDS.width,
    height: validBounds ? b.height : DEFAULT_BOUNDS.height,
    x: validBounds && typeof b.x === 'number' ? b.x : undefined,
    y: validBounds && typeof b.y === 'number' ? b.y : undefined,
    title: 'Hinglish Notepad — Legal',
    resizable: true,
    icon: path.join(__dirname, 'assets', 'icons', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (isDev) {
    mainWindow.webContents.on('console-message', (_e, _level, message) => {
      console.log('[renderer]', message);
    });
  }

  let saveBoundsTimer = null;
  const persistBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      appConfig.windowBounds = mainWindow.getBounds();
      saveConfig(appConfig);
    }, 400);
  };
  mainWindow.on('resize', persistBounds);
  mainWindow.on('move', persistBounds);

  mainWindow.on('close', (e) => {
    if (!forceClose && mirroredDirty) {
      e.preventDefault();
      mainWindow.webContents.send('app:request-close');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// ---------------------------------------------------------------------------
// menu
// ---------------------------------------------------------------------------
function send(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function buildMenuTemplate() {
  const recentSubmenu = appConfig.recentFiles.length
    ? appConfig.recentFiles.map((filePath) => ({
        label: filePath,
        click: () => send('menu:open-path', filePath)
      }))
    : [{ label: 'No recent files', enabled: false }];

  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => send('menu:new') },
        { label: 'Open...', accelerator: 'CmdOrCtrl+O', click: () => send('menu:open') },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('menu:save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu:save-as') },
        { type: 'separator' },
        { label: 'Export Output As...', click: () => send('menu:export-output') },
        { label: 'Export Output as PDF...', click: () => send('menu:export-pdf') },
        { type: 'separator' },
        { label: 'Recent Files', submenu: recentSubmenu },
        { type: 'separator' },
        { label: 'Import Dictionary...', click: () => send('menu:import-dict') },
        { label: 'Export Dictionary...', click: () => send('menu:export-dict') },
        { type: 'separator' },
        { label: 'Print...', accelerator: 'CmdOrCtrl+P', click: () => send('menu:print') },
        { type: 'separator' },
        { role: 'quit', label: 'Quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Copy Output', accelerator: 'CmdOrCtrl+Shift+C', click: () => send('menu:copy-output') }
      ]
    }
  ];

  if (isDev) {
    template.push({
      label: 'View',
      submenu: [{ role: 'toggleDevTools' }, { role: 'reload' }]
    });
  }

  return template;
}

function rebuildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate()));
}

// ---------------------------------------------------------------------------
// dictionary persistence
// ---------------------------------------------------------------------------
ipcMain.handle('dict:load', () => {
  try {
    const raw = fs.readFileSync(DICT_PATH(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
});

ipcMain.handle('dict:save', (_e, dict) => {
  try {
    fs.mkdirSync(path.dirname(DICT_PATH()), { recursive: true });
    fs.writeFileSync(DICT_PATH(), JSON.stringify(dict || {}, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to save dictionary:', e);
    return false;
  }
});

ipcMain.handle('dialog:import-dict', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Dictionary',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths[0]) return null;
  try {
    const raw = fs.readFileSync(filePaths[0], 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid dictionary file');
    return parsed;
  } catch (e) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Import Failed',
      message: 'Could not read that dictionary file.',
      detail: String(e.message || e)
    });
    return null;
  }
});

ipcMain.handle('dialog:export-dict', async (_e, { dict, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Dictionary',
    defaultPath: defaultName || 'hinglish-dictionary.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  try {
    fs.writeFileSync(filePath, JSON.stringify(dict || {}, null, 2), 'utf8');
    return filePath;
  } catch (e) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Export Failed',
      message: 'Could not write the dictionary file.',
      detail: String(e.message || e)
    });
    return null;
  }
});

// Test-only: import/export the dictionary via a fixed path, bypassing the
// native file dialogs. Only registered when SELFTEST is set.
if (process.env.SELFTEST) {
  ipcMain.handle('dialog:import-dict-test', (_e, sourcePath) => {
    const raw = fs.readFileSync(sourcePath, 'utf8');
    return JSON.parse(raw);
  });
  ipcMain.handle('dialog:export-dict-test', (_e, { dict, path: targetPath }) => {
    fs.writeFileSync(targetPath, JSON.stringify(dict || {}, null, 2), 'utf8');
    return targetPath;
  });
}

// ---------------------------------------------------------------------------
// document file I/O
// ---------------------------------------------------------------------------
function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeTextFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

ipcMain.handle('dialog:open-text', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Hinglish Text',
    filters: [{ name: 'Text Files', extensions: ['txt'] }, { name: 'All Files', extensions: ['*'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths[0]) return null;
  try {
    const content = readTextFile(filePaths[0]);
    addRecentFile(filePaths[0]);
    return { path: filePaths[0], content };
  } catch (e) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Open Failed',
      message: 'Could not read that file.',
      detail: String(e.message || e)
    });
    return null;
  }
});

ipcMain.handle('file:read-path', async (_e, filePath) => {
  try {
    const content = readTextFile(filePath);
    addRecentFile(filePath);
    return { path: filePath, content };
  } catch (e) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'File Not Found',
      message: 'That file could not be opened. It may have been moved or deleted.',
      detail: filePath
    });
    removeRecentFile(filePath);
    return null;
  }
});

ipcMain.handle('dialog:save-text', async (_e, { path: filePath, content }) => {
  let targetPath = filePath;
  if (!targetPath) {
    const { canceled, filePath: chosen } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save As',
      defaultPath: 'untitled.txt',
      filters: [{ name: 'Text Files', extensions: ['txt'] }]
    });
    if (canceled || !chosen) return null;
    targetPath = chosen;
  }
  try {
    writeTextFile(targetPath, content);
    addRecentFile(targetPath);
    return { path: targetPath };
  } catch (e) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Save Failed',
      message: 'Could not write that file.',
      detail: String(e.message || e)
    });
    return null;
  }
});

ipcMain.handle('dialog:export-output', async (_e, { content, defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Output As',
    defaultPath: defaultName || 'output.txt',
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });
  if (canceled || !filePath) return null;
  try {
    writeTextFile(filePath, content);
    return filePath;
  } catch (e) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Export Failed',
      message: 'Could not write the output file.',
      detail: String(e.message || e)
    });
    return null;
  }
});

// Test-only: writes export content straight to a given path, bypassing the
// native save dialog, so an automated test can inspect the real output file.
// Only registered when SELFTEST is set.
if (process.env.SELFTEST) {
  ipcMain.handle('dialog:export-output-test', (_e, { content, path: targetPath }) => {
    writeTextFile(targetPath, content);
    return targetPath;
  });
}

// ---------------------------------------------------------------------------
// clipboard
// ---------------------------------------------------------------------------
// The `clipboard` module is NOT among the renderer-process modules exposed to a
// sandboxed preload script (sandbox: true) — only contextBridge, crashReporter,
// ipcRenderer, nativeImage, webFrame and webUtils are. A preload-side
// `require('electron').clipboard` silently destructures to undefined, so it must
// be written from here in the main process instead, via IPC.
ipcMain.handle('clipboard:write-text', (_e, text) => {
  clipboard.writeText(typeof text === 'string' ? text : '');
  return true;
});

// ---------------------------------------------------------------------------
// generic dialogs
// ---------------------------------------------------------------------------
ipcMain.handle('dialog:confirm-unsaved', async (_e, { actionLabel }) => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved Changes',
    message: `You have unsaved changes. Save before ${actionLabel}?`
  });
  return response; // 0 = Save, 1 = Don't Save, 2 = Cancel
});

ipcMain.handle('dialog:message', async (_e, opts) => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: opts.type || 'info',
    title: opts.title || 'Hinglish Notepad',
    message: opts.message || '',
    detail: opts.detail,
    buttons: opts.buttons || ['OK']
  });
  return response;
});

// ---------------------------------------------------------------------------
// Kruti Dev per-user font install (no admin required)
// ---------------------------------------------------------------------------
function regAddFontEntry(valueName, fileName) {
  return new Promise((resolve, reject) => {
    execFile(
      'reg',
      [
        'add',
        'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts',
        '/v',
        valueName,
        '/t',
        'REG_SZ',
        '/d',
        fileName,
        '/f'
      ],
      (error, _stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve();
      }
    );
  });
}

const USER_FONTS_DIR = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts');
const USER_FONT_DEST = path.join(USER_FONTS_DIR, 'KrutiDev010.ttf');
const FONT_REG_VALUE = 'Kruti Dev 010 (TrueType)';

// Best-effort: tell the current Windows session to load the font right now
// (AddFontResourceW) and notify other running apps (WM_FONTCHANGE), so the
// install can take effect without waiting for a restart. Per-user, no admin
// required. If this fails for any reason, the registry entry we already wrote
// still makes the font available after the next app/Windows restart, so we
// swallow errors here rather than fail the whole install over it.
function broadcastFontChange(fontPath) {
  return new Promise((resolve) => {
    const script = `
$sig = @'
using System;
using System.Runtime.InteropServices;
public class HinglishNotepadFontHelper {
  [DllImport("gdi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern int AddFontResourceW(string lpFileName);
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern IntPtr SendMessageTimeoutW(IntPtr hWnd, uint Msg, UIntPtr wParam, IntPtr lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);
}
'@
Add-Type -TypeDefinition $sig -Language CSharp
$added = [HinglishNotepadFontHelper]::AddFontResourceW('${fontPath.replace(/'/g, "''")}')
$out = [UIntPtr]::Zero
[HinglishNotepadFontHelper]::SendMessageTimeoutW([IntPtr]0xffff, 0x001D, [UIntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$out) | Out-Null
Write-Output "added=$added"
`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true },
      (error, stdout) => {
        resolve(!error && /added=[1-9]/.test(stdout || ''));
      }
    );
  });
}

async function performFontInstallMechanics() {
  const sourcePath = path.join(__dirname, 'assets', 'fonts', 'KrutiDev010.ttf');
  fs.mkdirSync(USER_FONTS_DIR, { recursive: true });
  fs.copyFileSync(sourcePath, USER_FONT_DEST);
  await regAddFontEntry(FONT_REG_VALUE, 'KrutiDev010.ttf');
  const liveLoadOk = await broadcastFontChange(USER_FONT_DEST);
  return { liveLoadOk };
}

ipcMain.handle('font:install', async () => {
  if (process.platform !== 'win32') {
    return { success: false, message: 'Per-user font install is only supported on Windows.', needsRestart: false };
  }

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Install Kruti Dev Font',
    message: 'Install the Kruti Dev 010 font for your Windows user account?',
    detail:
      'This copies KrutiDev010.ttf into your personal Windows Fonts folder ' +
      '(%LOCALAPPDATA%\\Microsoft\\Windows\\Fonts) and registers it for your account only. ' +
      'No administrator rights are needed, and no other user account is affected.',
    buttons: ['Install', 'Cancel'],
    defaultId: 0,
    cancelId: 1
  });
  if (response !== 0) return { success: false, message: 'Installation cancelled.', needsRestart: false };

  try {
    await performFontInstallMechanics();
    return {
      success: true,
      message:
        'Font installed for your account. If the status indicator below does not update to ' +
        '"Installed" immediately, restart this app (and, rarely, Windows) so the change is fully recognized.',
      needsRestart: true
    };
  } catch (e) {
    return { success: false, message: `Install failed: ${e.message || e}`, needsRestart: false };
  }
});

// Test-only bypass of the confirmation dialog, and a matching cleanup/uninstall
// path, so the install mechanics can be verified end-to-end without a human
// clicking through a native dialog. Neither handler is registered unless
// SELFTEST is set, so neither exists in a normal run or a packaged build.
if (process.env.SELFTEST) {
  ipcMain.handle('font:install-test-noconfirm', async () => {
    try {
      await performFontInstallMechanics();
      return { success: true };
    } catch (e) {
      return { success: false, message: String(e.message || e) };
    }
  });

  ipcMain.handle('font:uninstall-test', async () => {
    try {
      if (fs.existsSync(USER_FONT_DEST)) fs.unlinkSync(USER_FONT_DEST);
      await new Promise((resolve) => {
        execFile(
          'reg',
          ['delete', 'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts', '/v', FONT_REG_VALUE, '/f'],
          () => resolve() // ignore errors: value may already be absent
        );
      });
      return { success: true };
    } catch (e) {
      return { success: false, message: String(e.message || e) };
    }
  });
}

// ---------------------------------------------------------------------------
// printing (output panel only) — always shown as an in-app preview first.
//
// webContents.print({silent:false}) on Windows opens the OS's native Win32
// print dialog (PrintDlgEx) — that dialog is printer/settings selection only,
// it does not render a preview of the page content (that's a Windows/Electron
// limitation, not something togglable via options here: Electron's print API
// doesn't route through Chromium's own web print-preview UI the way a normal
// Chrome tab's Ctrl+P does). So a visible preview is built in-app instead:
// print.html is shown as a real, visible, page-shaped window with its own
// "Print..."/"Export as PDF..." and "Cancel" buttons, using the exact same
// fonts/layout/sizing that will actually print or export. Only after the user
// confirms IN that preview does this code call the real print/printToPDF —
// the OS dialog still appears after that (for printer/settings choice, or the
// save-file dialog for PDF), but never as the first or only thing shown.
// ---------------------------------------------------------------------------
function createPreviewWindow(payload) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 820,
      height: 900,
      show: false,
      parent: mainWindow,
      modal: true,
      minimizable: false,
      maximizable: true,
      title: payload.purpose === 'pdf' ? 'Export Preview' : 'Print Preview',
      webPreferences: {
        preload: path.join(__dirname, 'renderer', 'print-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    const onReady = () => {
      ipcMain.removeListener('print:ready', onReady);
      win.show();
      resolve(win);
    };
    ipcMain.on('print:ready', onReady);

    win.webContents.once('did-fail-load', (_e, _code, desc) => {
      ipcMain.removeListener('print:ready', onReady);
      reject(new Error(desc));
    });

    win.webContents.once('did-finish-load', () => {
      win.webContents.send('print:render', payload);
    });

    win.loadFile(path.join(__dirname, 'renderer', 'print.html'));
  });
}

// Resolves 'confirm' or 'cancel' once the user acts on the specific preview
// window (its own confirm/cancel buttons, or the window's close button).
function waitForPreviewDecision(win) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (decision) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener('print:confirm', onConfirm);
      ipcMain.removeListener('print:cancel', onCancel);
      win.removeListener('closed', onClosed);
      resolve(decision);
    };
    const onConfirm = (e) => { if (e.sender === win.webContents) settle('confirm'); };
    const onCancel = (e) => { if (e.sender === win.webContents) settle('cancel'); };
    const onClosed = () => settle('cancel');
    ipcMain.on('print:confirm', onConfirm);
    ipcMain.on('print:cancel', onCancel);
    win.on('closed', onClosed);
  });
}

ipcMain.handle('print:output', async (_e, payload) => {
  let win;
  try {
    win = await createPreviewWindow({ ...payload, purpose: 'print' });
    const decision = await waitForPreviewDecision(win);
    if (decision !== 'confirm') {
      if (!win.isDestroyed()) win.destroy();
      return { success: false, reason: 'cancelled' };
    }
    return new Promise((resolve) => {
      win.webContents.print({ silent: false, printBackground: true }, (success, reason) => {
        if (!win.isDestroyed()) win.destroy();
        resolve({ success, reason });
      });
    });
  } catch (e) {
    if (win && !win.isDestroyed()) win.destroy();
    return { success: false, reason: String(e.message || e) };
  }
});

ipcMain.handle('print:export-pdf', async (_e, payload) => {
  let win;
  try {
    win = await createPreviewWindow({ ...payload, purpose: 'pdf' });
    const decision = await waitForPreviewDecision(win);
    if (decision !== 'confirm') {
      if (!win.isDestroyed()) win.destroy();
      return null;
    }
    const pdfBuffer = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
    if (!win.isDestroyed()) win.destroy();

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Output as PDF',
      defaultPath: payload.defaultName || 'output.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, pdfBuffer);
    return filePath;
  } catch (e) {
    if (win && !win.isDestroyed()) win.destroy();
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'PDF Export Failed',
      message: 'Could not export the output as PDF.',
      detail: String(e.message || e)
    });
    return null;
  }
});

// Test-only: same PDF export pipeline (preview -> confirm -> printToPDF) but
// writing straight to a fixed path instead of showing the native save dialog,
// so the real output bytes can be inspected by an automated test. Only
// registered when SELFTEST is set — absent from a normal run or packaged build.
if (process.env.SELFTEST) {
  ipcMain.handle('print:export-pdf-test', async (_e, payload) => {
    let win;
    try {
      win = await createPreviewWindow({ ...payload, purpose: 'pdf' });
      const decision = await waitForPreviewDecision(win);
      if (decision !== 'confirm') {
        if (!win.isDestroyed()) win.destroy();
        return null;
      }
      const pdfBuffer = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
      if (!win.isDestroyed()) win.destroy();
      const testPath = path.join(app.getPath('temp'), 'hinglish-notepad-selftest-output.pdf');
      fs.writeFileSync(testPath, pdfBuffer);
      return testPath;
    } catch (e) {
      if (win && !win.isDestroyed()) win.destroy();
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// dirty-state / close confirmation
// ---------------------------------------------------------------------------
ipcMain.on('app:dirty-changed', (_e, val) => {
  mirroredDirty = !!val;
});

ipcMain.on('app:respond-close', (_e, shouldClose) => {
  if (shouldClose) {
    forceClose = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  }
});

// ---------------------------------------------------------------------------
// app lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  rebuildMenu();
  createMainWindow();

  // 'hooks-only' registers the test-only IPC handlers above (needed so a
  // preload script spawned after this point can also see SELFTEST is set)
  // without running the one-shot renderer selftest below.
  if (process.env.SELFTEST === 'pdf-full') {
    // Orchestrated from the main process (not window.__selftest) because it
    // needs to drive the separate preview window directly — exercises the
    // exact real pipeline (preview render with bundled fonts -> printToPDF)
    // used against a packaged build, where CDP remote debugging is correctly
    // disabled by Electron's security fuses and unavailable for testing.
    try {
      const payload = {
        text: 'ueLrs odhy lkgc] dy vihy dh lquokbZ gSA', // trailing A = danda (।), per PUNCT_KD
        mode: 'kd',
        dateStr: new Date().toLocaleDateString(),
        purpose: 'pdf'
      };
      const win = await createPreviewWindow(payload);
      await new Promise((r) => setTimeout(r, 500));
      const pdfBuffer = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
      const testPath = path.join(app.getPath('temp'), 'hinglish-notepad-packaged-pdf-test.pdf');
      fs.writeFileSync(testPath, pdfBuffer);
      if (!win.isDestroyed()) win.destroy();
      console.log('SELFTEST_RESULT=' + JSON.stringify({ pdfPath: testPath, bytes: pdfBuffer.length }));
    } catch (e) {
      console.log('SELFTEST_ERROR=' + String(e.message || e));
    }
    app.quit();
    return;
  }

  if (process.env.SELFTEST && process.env.SELFTEST !== 'hooks-only') {
    const mode = process.env.SELFTEST;
    await new Promise((resolve) => mainWindow.webContents.once('did-finish-load', resolve));
    try {
      const resultJson = await mainWindow.webContents.executeJavaScript(
        `window.__selftest(${JSON.stringify(mode)})`
      );
      console.log('SELFTEST_RESULT=' + resultJson);
    } catch (e) {
      console.log('SELFTEST_ERROR=' + String(e.message || e));
    }
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
