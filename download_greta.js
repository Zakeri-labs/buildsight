const fs = require('fs');
const path = require('path');
const https = require('https');

const fontsDir = path.join(__dirname, 'public', 'fonts');
if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

const files = [
  {
    name: 'GretaArabic-Regular.ttf',
    url: 'https://raw.githubusercontent.com/shamshadzaheer/pashtowebfonts/main/ttf-fonts/Bahij%20Greta%20Arabic-Regular.ttf'
  },
  {
    name: 'GretaArabic-Bold.ttf',
    url: 'https://raw.githubusercontent.com/shamshadzaheer/pashtowebfonts/main/ttf-fonts/Bahij%20Greta%20Arabic-Bold.ttf'
  }
];

function downloadFile(file) {
  return new Promise((resolve, reject) => {
    const dest = path.join(fontsDir, file.name);
    console.log(`Downloading ${file.name} from ${file.url}...`);
    https.get(file.url, (res) => {
      if (res.statusCode === 200) {
        const stream = fs.createWriteStream(dest);
        res.pipe(stream);
        stream.on('finish', () => {
          console.log(`Saved ${file.name} (${fs.statSync(dest).size} bytes)`);
          resolve();
        });
      } else {
        reject(new Error(`Failed to download ${file.name}, status: ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

async function main() {
  for (const f of files) {
    await downloadFile(f);
  }
  console.log('All Greta Arabic fonts downloaded successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
