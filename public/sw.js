const CACHE = 'mark-six-sim-v3';
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const CORE = [`${BASE}/`, `${BASE}/manifest.webmanifest`, `${BASE}/icon-192.png`, `${BASE}/apple-touch-icon.png`, `${BASE}/latest-result.json`];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mark-six-sim-') && key !== CACHE).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url);
  // Data errors must reach the application so it can show the saved-data notice.
  if (url.pathname.endsWith('/api/latest-result') || url.pathname.endsWith('/latest-result.json')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
      return response;
    }).catch(async () => (await caches.match(event.request)) || (await caches.match(`${BASE}/`)) || Response.error()));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
