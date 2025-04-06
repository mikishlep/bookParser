const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const fetch = require('node-fetch').default;
const sharp = require('sharp');
const { spawn } = require('child_process');

const tempDir = './temp_images';

const SCROLL_CONFIG = {
  delay: 2000,
  scrollStep: 800,
  maxAttempts: 5,
  timeout: 120000
};

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

// Функция для запуска браузера с удалённой отладкой
async function launchChrome(browserPath) {
  // Создаём временную папку для пользовательских данных
  const userDataDir = path.join(__dirname, 'chrome-data');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

  const args = [
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run'
  ];
  console.log(`Запуск браузера: ${browserPath} ${args.join(' ')}`);
  const chromeProcess = spawn(browserPath, args, { stdio: 'ignore', detached: true });
  // Даем время браузеру открыться и запустить удалённую отладку
  await delay(3000);
  return chromeProcess;
}

async function smartScroll(page) {
  console.log('[1/5] Начало скроллинга...');
  let allImages = new Map();
  let attempts = 0;
  let lastImageCount = 0;

  while (attempts < SCROLL_CONFIG.maxAttempts) {
    const currentImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('#pole .img_page img'));
      return imgs.map(img => ({
        src: img.src.startsWith('//') ? `https:${img.src}` : img.src,
        width: img.naturalWidth,
        height: img.naturalHeight
      }));
    });

    currentImages.forEach(img => {
      if (!allImages.has(img.src)) {
        allImages.set(img.src, img);
      }
    });

    const currentCount = allImages.size;
    console.log(`[Прогресс] Собрано изображений: ${currentCount}`);

    if (currentCount === lastImageCount) {
      attempts++;
    } else {
      attempts = 0;
      lastImageCount = currentCount;
    }

    try {
      await page.evaluate(() => {
        const lastPage = document.querySelector('#pole .img_page:last-child');
        if (lastPage) {
          lastPage.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      });
    } catch (err) {
      console.log("Ошибка при скроллинге:", err);
    }

    try {
      await page.waitForFunction(
        (prevCount) => document.querySelectorAll('#pole .img_page img').length > prevCount,
        { timeout: 2000, polling: 1000 },
        lastImageCount
      );
    } catch (error) {
      console.log('Новые страницы не загрузились, продолжаем...');
    }

    await delay(SCROLL_CONFIG.delay);
  }

  console.log('[1/5] Скроллинг завершен');
  return Array.from(allImages.values());
}

async function parseBook(targetUrl, browserPath, outputFolder) {
  let browser;
  let chromeProcess;
  try {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
    fs.mkdirSync(tempDir, { recursive: true });

    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    chromeProcess = await launchChrome(browserPath);

    browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      ignoreHTTPSErrors: true,
      defaultViewport: null
    });

    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ru-RU,ru;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-site'
    });

    console.log('[2/5] Загрузка страницы...');
    await page.goto(targetUrl, {
      waitUntil: 'networkidle2',
      timeout: SCROLL_CONFIG.timeout,
      referer: 'https://www.litres.ru/'
    });
    await page.waitForSelector('#pole .img_page', { timeout: 20000, visible: true });
    console.log('[3/5] Поиск изображений...');
    const images = await smartScroll(page);
    console.log(`[3/5] Найдено: ${images.length} страниц`);

    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    await page.close();

    console.log('[4/5] Скачивание страниц...');
    const fetchOptions = {
      headers: {
        'cookie': cookieString,
        'referer': 'https://www.litres.ru/',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      }
    };

    const outputFile = path.join(outputFolder, `book_${Date.now()}.pdf`);
    const doc = new PDFDocument({ autoFirstPage: false });
    doc.pipe(fs.createWriteStream(outputFile));

    for (const item of images) {
      console.log(`Обработка изображения: ${item.src}`);
      const response = await fetch(item.src, {
        ...fetchOptions,
        redirect: 'follow',
        timeout: 15000
      });
      if (!response.ok) {
        console.error(`Ошибка загрузки: ${item.src} (HTTP ${response.status})`);
        continue;
      }
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.startsWith('image/')) {
        console.error(`Получен не изображение (${contentType}): ${item.src}`);
        continue;
      }
      const buffer = await response.buffer();
      const fileNum = item.src.replace(/[^0-9]/g, '').padStart(4, '0');
      const outputPath = path.join(tempDir, `page_${fileNum}.jpg`);

      try {
        await sharp(buffer)
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 100, mozjpeg: true, force: true })
          .toFile(outputPath);
      } catch (sharpError) {
        console.error(`Ошибка преобразования изображения ${item.src}:`, sharpError);
        continue;
      }

      try {
        doc.addPage({ size: 'A4' }).image(outputPath, 0, 0, {
          width: 595.28,
          height: 841.89,
          fit: [595.28, 841.89]
        });
      } catch (pdfError) {
        console.error(`Ошибка добавления изображения в PDF ${item.src}:`, pdfError);
      }
      await delay(1500);
    }

    doc.end();
    console.log('PDF создан:', outputFile);
    fs.rmSync(tempDir, { recursive: true });
    return outputFile;

  } catch (error) {
    console.error('Ошибка:', error);
    throw error;
  } finally {
    if (browser) {
      try {
        await browser.disconnect();
      } catch (error) {
        if (error.code !== 'ESRCH') {
          throw error;
        }
      }
    }
  }
}

module.exports = { parseBook };