const { contextBridge, ipcRenderer } = require('electron');

const MENU_CHANNELS = [
  'menu:new',
  'menu:open',
  'menu:save',
  'menu:save-as',
  'menu:export-output',
  'menu:export-pdf',
  'menu:import-dict',
  'menu:export-dict',
  'menu:print',
  'menu:copy-output'
];

const api = {
  // custom dictionary persistence (userData/dictionary.json)
  dictLoad: () => ipcRenderer.invoke('dict:load'),
  dictSave: (dict) => ipcRenderer.invoke('dict:save', dict),
  importDictionary: () => ipcRenderer.invoke('dialog:import-dict'),
  exportDictionary: (dict, defaultName) => ipcRenderer.invoke('dialog:export-dict', { dict, defaultName }),

  // document files
  openTextFile: () => ipcRenderer.invoke('dialog:open-text'),
  readTextFileAtPath: (filePath) => ipcRenderer.invoke('file:read-path', filePath),
  saveTextFile: (filePath, content) => ipcRenderer.invoke('dialog:save-text', { path: filePath, content }),
  exportOutput: (content, defaultName) => ipcRenderer.invoke('dialog:export-output', { content, defaultName }),

  // dialogs
  confirmUnsaved: (actionLabel) => ipcRenderer.invoke('dialog:confirm-unsaved', { actionLabel }),
  showMessage: (opts) => ipcRenderer.invoke('dialog:message', opts),

  // Kruti Dev font install (per-user, no admin)
  installKrutiDevFont: () => ipcRenderer.invoke('font:install'),

  // printing
  printOutput: (payload) => ipcRenderer.invoke('print:output', payload),
  exportOutputPdf: (payload) => ipcRenderer.invoke('print:export-pdf', payload),

  // clipboard (written from the main process — `clipboard` is not available
  // in a sandboxed preload script, see main.js's 'clipboard:write-text' handler)
  copyText: (text) => ipcRenderer.invoke('clipboard:write-text', text),

  // dirty-state / close confirmation handshake with main
  setDirty: (isDirty) => ipcRenderer.send('app:dirty-changed', !!isDirty),
  onRequestClose: (cb) => ipcRenderer.on('app:request-close', () => cb()),
  respondClose: (shouldClose) => ipcRenderer.send('app:respond-close', !!shouldClose),

  // menu action subscriptions (whitelisted channels only)
  onMenu: (channel, cb) => {
    if (!MENU_CHANNELS.includes(channel)) return;
    ipcRenderer.on(channel, () => cb());
  },
  onOpenRecentFile: (cb) => ipcRenderer.on('menu:open-path', (_e, filePath) => cb(filePath))
};

// Test-only hooks for automated verification (bypass the native confirmation
// dialog a human would otherwise have to click). Only added when SELFTEST is
// set; the corresponding main-process handlers likewise only exist then, so
// none of this is present in a normal run or a packaged build.
if (process.env.SELFTEST) {
  api.installFontTestNoConfirm = () => ipcRenderer.invoke('font:install-test-noconfirm');
  api.uninstallFontTest = () => ipcRenderer.invoke('font:uninstall-test');
  api.exportOutputPdfTest = (payload) => ipcRenderer.invoke('print:export-pdf-test', payload);
  api.exportOutputTest = (content, targetPath) => ipcRenderer.invoke('dialog:export-output-test', { content, path: targetPath });
  api.importDictionaryTest = (sourcePath) => ipcRenderer.invoke('dialog:import-dict-test', sourcePath);
  api.exportDictionaryTest = (dict, targetPath) => ipcRenderer.invoke('dialog:export-dict-test', { dict, path: targetPath });
}

contextBridge.exposeInMainWorld('api', api);
