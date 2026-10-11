const CACHE_NAME = 'h2-dashboard-v8';
const ASSETS = [
  '/manifest.json',
  '/icon.svg',
  '/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if(request.method !== 'GET' || url.pathname.startsWith('/api/')){
    return;
  }

  if(request.mode === 'navigate'){
    return;      // pages always come straight from the server (login page or dashboard); never cached
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
