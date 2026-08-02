const fs = require('fs');
const path = require('path');
const https = require('https');

const fontsDir = path.join(__dirname, 'public', 'fonts');

if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true });
}

const fonts = [
  {
    name: 'Vazirmatn-Regular.ttf',
    url: 'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/ttf/Vazirmatn-Regular.ttf'
  },
  {
    name: 'calibri.ttf',
    url: 'https://github.com/googlefonts/carlito/raw/main/fonts/ttf/Carlito-Regular.ttf'
  }
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = https.get(url, (response) => {
      // Handle redirects (GitHub raw uses redirects)
      if (response.statusCode === 302 || response.statusCode === 301) {
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: Status Code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${path.basename(dest)}`);
        resolve();
      });
    });
    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  for (const font of fonts) {
    const dest = path.join(fontsDir, font.name);
    console.log(`Downloading ${font.name}...`);
    try {
      await download(font.url, dest);
    } catch (err) {
      console.error(`Error downloading ${font.name}:`, err.message);
      // Fallback for calibri
      if (font.name === 'calibri.ttf') {
        const fallbackUrl = 'https://raw.githubusercontent.com/aboutblank/font-subset/master/test/fixtures/calibri.ttf';
        console.log(`Trying fallback for ${font.name}...`);
        try {
          await download(fallbackUrl, dest);
        } catch (fbErr) {
          console.error(`Fallback failed:`, fbErr.message);
        }
      }
    }
  }
}

main();
