const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const createWindow = () => {
    const window = new BrowserWindow({
        width: 900,
        height: 600,
    });

    window.loadFile(path.join(__dirname, 'index.html'));
};

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
