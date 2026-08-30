const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');

const { runPipeline } = require('./pipeline/run');

// Un seul traitement a la fois : le drapeau sert de signal d'arret cooperatif.
let running = false;
let cancelled = false;

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

ipcMain.handle('pipeline:run', async (event, options) => {
    if (running) {
        return { total: 0, processed: 0, converted: 0, skipped: 0, failed: 0, pruned: 0 };
    }

    running = true;
    cancelled = false;

    const send = (payload) => {
        if (!event.sender.isDestroyed()) {
            event.sender.send('pipeline:event', payload);
        }
    };

    try {
        return await runPipeline(options, { onEvent: send, shouldStop: () => cancelled });
    } catch (error) {
        send({ kind: 'log', level: 'error', message: `Erreur inattendue : ${error.message}` });
        send({ kind: 'done', summary: { total: 0, processed: 0, converted: 0, skipped: 0, failed: 1, pruned: 0 } });
        throw error;
    } finally {
        running = false;
    }
});

ipcMain.on('pipeline:cancel', () => {
    cancelled = true;
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
