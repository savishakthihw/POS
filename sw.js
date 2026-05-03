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
    // External CDNs that we want to cache
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Noto+Sans+Sinhala:wght@400;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
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

// Fetch Event - Network First Strategy
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Use a Network First strategy for all assets
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // If successful, clone and store in cache
                if (networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // If network fails, try cache
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    
                    // Fallback for offline if both fail
                    console.log('Fetch failed, and no cache available.');
                });
            })
    );
});
