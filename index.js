const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { parseBook } = require('./parser');

let mainWindow;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  mainWindow.loadFile('index.html');
});

// выбор папки
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// парсинг
ipcMain.on('start-parsing', async (event, url, browserPath, outputFolder) => {
  try {
    const pdfPath = await parseBook(url, browserPath, outputFolder);
    dialog.showMessageBox({ message: `Парсинг завершён!\nФайл сохранён: ${pdfPath}` });
  } catch (error) {
    dialog.showErrorBox('Ошибка', error.message);
  }
});