const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mediasRename', {
    pickDirectory: (title) => ipcRenderer.invoke('directory:pick', title),
});
