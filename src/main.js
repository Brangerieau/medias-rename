const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');

const createWindow = () => {
    const window = new BrowserWindow({
        width: 1040,
        height: 760,
        minWidth: 860,
        minHeight: 620,
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        },
    });

    window.loadFile(path.join(__dirname, 'index.html'));
};

ipcMain.handle('directory:pick', async (_event, title) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title,
        properties: ['openDirectory', 'createDirectory'],
    });

    return canceled ? null : filePaths[0];
});

app.whenReady().then(() => {
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
