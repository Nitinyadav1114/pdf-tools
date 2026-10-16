const CACHE_NAME = 'pdf-tools-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/styles.css',
  './assets/js/app.js',
  './assets/js/worker.js',
  './assets/vendor/pdf-lib.min.js',
  './assets/vendor/pdf.min.js',
  './assets/vendor/pdf.worker.min.js',
  './assets/vendor/sortable.min.js',
  './assets/icon.png',
  './assets/icon.ico',
  './assets/og-preview.png'
];

// Install: Pre-cache all core production assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Use Promise.allSettled to ensure that individual non-fatal failures don't abort install
      await Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[ServiceWorker] Failed to pre-cache asset ${url}:`, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: Purge obsolete caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log(`[ServiceWorker] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-First strategy with Network Fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Only handle http / https schemes
  if (!url.protocol.startsWith('http')) return;

  // Bypass third-party analytics beacons so they always go straight to the network
  if (url.hostname.includes('cloudflareinsights.com') || url.hostname.includes('cloudflare.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        // Cache hit: serve from cache immediately, then revalidate in background if online
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
          })
          .catch(() => {
            // App is offline, cachedResponse is already successfully served
          });
        return cachedResponse;
      }

      // Cache miss: fetch from network with automatic cache storage
      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) {
            return networkResponse;
          }
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return networkResponse;
        })
        .catch(async () => {
          // If offline and request is page navigation, serve cached index.html or root
          if (event.request.mode === 'navigate') {
            const cachedIndex = await caches.match('./index.html');
            if (cachedIndex) return cachedIndex;
            const cachedRoot = await caches.match('./');
            if (cachedRoot) return cachedRoot;
            return caches.match('index.html');
          }
        });
    })
  );
});
