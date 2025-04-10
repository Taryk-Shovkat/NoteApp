const { app, BrowserWindow } = require('electron');
const path = require('path');
const { connectDB, closeDB } = require('./db'); // Import DB functions
const { registerIpcHandlers } = require('./ipcHandlers'); // Import IPC handlers

// Function to create the main application window
function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            enableRemoteModule: false // Keep false for security
        }
    });

    // Remove the menu bar
    mainWindow.setMenu(null);

    // Disable spellchecking
    mainWindow.webContents.session.setSpellCheckerEnabled(false);

    mainWindow.loadFile('index.html');

    // Optional: Open DevTools for debugging
    // mainWindow.webContents.openDevTools();
}

// Application Lifecycle

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
    try {
        await connectDB(); // Connect to the database
        registerIpcHandlers(); // Register IPC handlers after DB connection
        createWindow(); // Create the main window

        app.on('activate', function () {
            // On macOS it's common to re-create a window in the app when the
            // dock icon is clicked and there are no other windows open.
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    } catch (err) {
        console.error('Application startup error:', err);
        // If DB connection fails, quit the app
        app.quit();
    }
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Ensure DB connection is closed when the app quits.
app.on('will-quit', async () => {
    await closeDB();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here. 