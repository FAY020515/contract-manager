const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
});
