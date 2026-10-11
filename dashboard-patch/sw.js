const CACHE_NAME = 'h2-dashboard-v6';
const ENHANCE_TAG = '<script src="/dashboard-enhance.js?v=2"></script>';
const ASSETS = [
  '/',
  '/index.html',
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
    event.respondWith(
      fetch(request).then(async (response) => {
        // add the dashboard add-on script (smarter chart scaling) to the page; any problem -> original page
        try {
          const type = response.headers.get('content-type') || '';
          if(!response.ok || !type.includes('text/html')) return response;
          const html = await response.clone().text();
          const at = html.lastIndexOf('</body>');
          if(at === -1 || html.includes('dashboard-enhance.js')) return response;
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.delete('content-encoding');
          return new Response(html.slice(0, at) + ENHANCE_TAG + '\n' + html.slice(at), {
            status: response.status, statusText: response.statusText, headers
          });
        } catch(err){
          return response;
        }
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
