const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('printApi', {
  onRender: (cb) => ipcRenderer.on('print:render', (_e, data) => cb(data)),
  ready: () => ipcRenderer.send('print:ready'),
  confirm: () => ipcRenderer.send('print:confirm'),
  cancel: () => ipcRenderer.send('print:cancel')
});
