const CACHE_NAME = 'guia-johrei-v4-searchmodal-slim';

// Assets that MUST be cached immediately for the app to start
const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './assets/images/pwa-icon.svg',
    './style.css',
    './css/tag-browser.css',
    './js/main.js',
    './js/state.js',
    './js/mobile.js',
    './js/filters.js',
    './js/modal.js',
    './js/search-modal.js',
    './js/search-engine.js',
    './js/apostila.js',
    './js/utils.js',
    './js/core.js'
];

// Install Event: Cache Core Assets
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Install');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching Core Assets');
            return cache.addAll(CORE_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Activate');
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// Fetch Event: Strategies
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. IMAGES & DATA: Network First (Safe Mode)
    // We try to get from network to ensure we have the latest version.
    // If network fails (offline), we fall back to cache.
    if (url.pathname.includes('/assets/images/') || url.pathname.includes('/data/')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Update cache with new version
                    if (response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Fallback to cache
                    return caches.match(event.request);
                })
        );
        return;
    }

    // 2. CORE FILES: Stale-While-Revalidate
    // Serve from cache specifically for speed, but update in background.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const networkFetch = fetch(event.request).then((response) => {
                // Update cache
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
                return response;
            });

            // Return cached response if available, else wait for network
            return cachedResponse || networkFetch;
        })
    );
});
