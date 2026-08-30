const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mediasRename', {
    pickDirectory: (title) => ipcRenderer.invoke('directory:pick', title),
    run: (options) => ipcRenderer.invoke('pipeline:run', options),
    cancel: () => ipcRenderer.send('pipeline:cancel'),
    // On ne transmet que la charge utile : exposer l'objet event donnerait au
    // renderer une reference vers l'IPC.
    onEvent: (callback) => ipcRenderer.on('pipeline:event', (_event, payload) => callback(payload)),
});
