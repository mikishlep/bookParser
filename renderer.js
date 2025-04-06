const { ipcRenderer } = require('electron');

document.getElementById('chooseFolderButton').addEventListener('click', () => {
  ipcRenderer.invoke('select-folder').then(folderPath => {
    if (folderPath) {
      document.getElementById('folderPathInput').value = folderPath;
    }
  });
});

document.getElementById('startButton').addEventListener('click', () => {
  const url = document.getElementById('urlInput').value;
  const browserPath = document.getElementById('browserPathInput').value;
  const outputFolder = document.getElementById('folderPathInput').value;
  
  if (!url) {
    alert('Введите URL книги!');
    return;
  }
  if (!browserPath) {
    alert('Введите путь к браузеру!');
    return;
  }
  if (!outputFolder) {
    alert('Выберите папку для сохранения PDF!');
    return;
  }
  
  document.getElementById('status').innerText = 'Парсинг начался...';
  ipcRenderer.send('start-parsing', url, browserPath, outputFolder);
});