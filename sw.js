const CACHE_NAME = 'savi-shakthi-pos-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/db.js',
    './js/utils.js',
    './js/views.js',
    './lib/dexie.js',
    './lib/chart.js',
    './lib/papaparse.min.js',
    './lib/jsbarcode.all.min.js',
    './lib/tailwind.js',
    './lib/jspdf.umd.min.js',
    './lib/jspdf.plugin.autotable.min.js',
    './css/fontawesome/all.min.css',
    './css/webfonts/fa-solid-900.woff2',
    './css/webfonts/fa-brands-400.woff2',
    './css/webfonts/fa-regular-400.woff2'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Caching app shell and assets');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Activate Event
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
});

// Fetch Event - Cache First Strategy for Assets
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached response immediately
                return cachedResponse;
            }

            // If not in cache, fetch from network
            return fetch(event.request).then((networkResponse) => {
                // If successful, cache it for next time
                if (networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        }).catch(() => {
            // Fallback if both fail
            console.log('Fetch failed, and no cache available.');
        })
    );
});
