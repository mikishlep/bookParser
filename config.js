// config.js
const path = require('path');

module.exports = {
  // Настройки для запуска Chrome
  chrome: {
    debugPort: 9222,
    startupTimeout: 3000,
    userDataDir: path.join(__dirname, 'chrome-data')
  },
  
  pdf: {
    tempDir: path.join(__dirname, 'temp_images'),
    format: 'A4',
    quality: 100
  },
  
  scroll: {
    delay: 2000,
    scrollStep: 800,
    maxAttempts: 5,
    timeout: 120000
  },
  
  network: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    referer: 'https://www.litres.ru/',
    timeout: 15000
  },
  
  isPackaging: process.env.ELECTRON_PACKAGER === 'true'
};