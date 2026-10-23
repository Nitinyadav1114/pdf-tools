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

  // Ensure icon, manifest, and vendor prefetch paths point to stable root assets
  html = html.replace(/href="\.\/assets\/icon-[^"]+\.ico"/g, 'href="assets/icon.ico"');
  html = html.replace(/href="\.\/assets\/icon-[^"]+\.png"/g, 'href="assets/icon.png"');
  html = html.replace(/href="\.\/assets\/manifest-[^"]+\.json"/g, 'href="manifest.json"');
  html = html.replace(/href="\.\/assets\/pdf-lib[^"]+\.js"/g, 'href="assets/vendor/pdf-lib.min.js"');
  html = html.replace(/href="\.\/assets\/pdf\.worker[^"]+\.js"/g, 'href="assets/vendor/pdf.worker.min.js"');
  html = html.replace(/href="\.\/assets\/pdf\.min[^"]+\.js"/g, 'href="assets/vendor/pdf.min.js"');

  // Promote modern Svelte 5 app to primary index.html
  const primaryIndexPath = path.join(ROOT_DIR, 'index.html');
  fs.writeFileSync(primaryIndexPath, html, 'utf-8');
  console.log('✓ Promoted modern Svelte 5 app to primary index.html');

  // Also preserve modern-preview.html
  const modernPreviewPath = path.join(ROOT_DIR, 'modern-preview.html');
  fs.writeFileSync(modernPreviewPath, html, 'utf-8');
  console.log('✓ Updated modern-preview.html');
}

prepareStatic();
