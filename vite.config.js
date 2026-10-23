import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

function copyStaticAssets() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const copyDir = (src, dest) => {
        if (!fs.existsSync(src)) return;
        fs.mkdirSync(dest, { recursive: true });
        for (const item of fs.readdirSync(src)) {
          const s = path.join(src, item);
          const d = path.join(dest, item);
          if (fs.statSync(s).isDirectory()) {
            copyDir(s, d);
          } else {
            fs.copyFileSync(s, d);
          }
        }
      };

      // Copy assets/vendor to dist/assets/vendor
      copyDir('assets/vendor', 'dist/assets/vendor');
      
      // Copy assets/js/worker.js to dist/assets/js/worker.js
      fs.mkdirSync('dist/assets/js', { recursive: true });
      if (fs.existsSync('assets/js/worker.js')) {
        fs.copyFileSync('assets/js/worker.js', 'dist/assets/js/worker.js');
      }

      // Copy manifest and icons
      if (fs.existsSync('manifest.json')) {
        fs.copyFileSync('manifest.json', 'dist/manifest.json');
      }
      if (fs.existsSync('assets/icon.png')) {
        fs.copyFileSync('assets/icon.png', 'dist/assets/icon.png');
      }
      if (fs.existsSync('assets/icon.ico')) {
        fs.copyFileSync('assets/icon.ico', 'dist/assets/icon.ico');
      }
      if (fs.existsSync('assets/og-preview.png')) {
        fs.copyFileSync('assets/og-preview.png', 'dist/assets/og-preview.png');
      }
      console.log('✓ Copied static vendor engines, workers, and icons into dist/');
    }
  };
}

export default defineConfig({
  plugins: [
    svelte(),
    tailwindcss(),
    copyStaticAssets(),
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: './modern.html'
      }
    }
  },
  server: {
    port: 5173,
    open: false
  }
});
