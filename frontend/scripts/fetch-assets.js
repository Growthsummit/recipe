/* Downloads the original Figma photographs into public/images/recipes.
 * Usage: npm run fetch-assets
 * The Figma asset URLs are temporary (about 7 days). If they have expired,
 * export the images from Figma (see README) using the same file names. */
const fs = require('fs');
const path = require('path');
const https = require('https');
const manifest = require('./assets-manifest.json');

const outDir = path.join(__dirname, '..', 'public', 'images', 'recipes');
fs.mkdirSync(outDir, { recursive: true });

function download(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(download(res.headers.location, dest, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

(async () => {
  let failed = 0;
  for (const [name, url] of Object.entries(manifest)) {
    const dest = path.join(outDir, name + '.png');
    try {
      await download(url, dest);
      console.log('ok     ' + name);
    } catch (e) {
      failed += 1;
      console.log('FAILED ' + name + ' (' + e.message + ')');
    }
  }
  if (failed) {
    console.log('\n' + failed + ' image(s) failed. The Figma links expire after about 7 days - export them manually from Figma.');
    process.exitCode = 1;
  }
})();
