import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const ASSETS_MODERN_DIR = path.join(ROOT_DIR, 'assets', 'modern');

function prepareStatic() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error('dist directory does not exist! Run npm run build first.');
    process.exit(1);
  }

  // Ensure assets/modern exists and is clean
  if (fs.existsSync(ASSETS_MODERN_DIR)) {
    fs.rmSync(ASSETS_MODERN_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(ASSETS_MODERN_DIR, { recursive: true });

  // Copy modern JS and CSS bundles into assets/modern
  const distAssets = path.join(DIST_DIR, 'assets');
  let mainJsFile = '';
  let mainCssFile = '';

  if (fs.existsSync(distAssets)) {
    for (const file of fs.readdirSync(distAssets)) {
      if (file.startsWith('main-') && file.endsWith('.js')) {
        mainJsFile = file;
        fs.copyFileSync(path.join(distAssets, file), path.join(ASSETS_MODERN_DIR, file));
      } else if (file.startsWith('main-') && file.endsWith('.css')) {
        mainCssFile = file;
        fs.copyFileSync(path.join(distAssets, file), path.join(ASSETS_MODERN_DIR, file));
      }
    }
  }

  console.log(`✓ Copied modern bundles to assets/modern/ (${mainJsFile}, ${mainCssFile})`);

  // Read dist/modern.html and rewrite asset links to assets/modern/
  let html = fs.readFileSync(path.join(DIST_DIR, 'modern.html'), 'utf-8');
  html = html.replace(/\.\/assets\/(main-[^"]+\.js)/g, './assets/modern/$1');
  html = html.replace(/\.\/assets\/(main-[^"]+\.css)/g, './assets/modern/$1');
  html = html.replace(/src="\/src\/main\.js"/g, `src="./assets/modern/${mainJsFile}"`);

  // Write modern-preview.html (so modern.html can remain the Vite source file)
  const modernPreviewPath = path.join(ROOT_DIR, 'modern-preview.html');
  fs.writeFileSync(modernPreviewPath, html, 'utf-8');
  console.log('✓ Created root modern-preview.html for instant static branch hosting');
}

prepareStatic();
