// Minimal service worker (v9). It keeps the app installable but never serves or caches anything itself,
// so it cannot get in the way of loading the dashboard. It also removes the offline copies left by older versions.
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
// no-op: every request goes straight to the network
self.addEventListener('fetch', () => {});
