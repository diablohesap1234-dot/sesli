const CACHE_NAME = 'sesli-sohbet-v1';
const STATIC_ASSETS = [
    '/',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/static/icon.svg'
];

// Install: Cache critical core assets for fast startup & PWA readiness
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('ServiceWorker pre-cache warning:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate: Clean up old cache versions
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Network-first for dynamic content, stale-while-revalidate for static files
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // WebSocket, API and upload requests should not be cached
    if (
        event.request.method !== 'GET' ||
        url.pathname.startsWith('/ws') ||
        url.pathname.startsWith('/api/') ||
        url.pathname.includes('/uploads/')
    ) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // If network is available and response is good, update the cache
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Network failed (offline or slow): serve from cache
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    if (event.request.mode === 'navigate') {
                        return caches.match('/');
                    }
                });
            })
    );
});
