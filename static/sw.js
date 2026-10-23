const CACHE_NAME = 'sesli-sohbet-v5';
const STATIC_ASSETS = [
    '/',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    '/static/icon.svg'
];

// Install: Activate new service worker immediately
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS).catch((err) => {
                console.warn('ServiceWorker pre-cache warning:', err);
            });
        })
    );
});

// Activate: Clean up old cache versions immediately
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

// Fetch: Always network-first (no-cache) for HTML, JS, CSS so updates apply immediately
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // WebSocket, API and upload requests should never be intercepted
    if (
        event.request.method !== 'GET' ||
        url.pathname.startsWith('/ws') ||
        url.pathname.startsWith('/api/') ||
        url.pathname.includes('/uploads/')
    ) {
        return;
    }

    const isCoreCode = (
        url.pathname === '/' ||
        url.pathname.endsWith('.html') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css')
    );

    event.respondWith(
        fetch(event.request, isCoreCode ? { cache: 'no-cache' } : {})
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
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
