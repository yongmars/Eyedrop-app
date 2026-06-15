const CACHE_NAME = 'eyedrop-app-v1';
const base = self.location.pathname.substring(0, self.location.pathname.lastIndexOf('/'));

const ASSETS_TO_CACHE = [
  base + '/',
  base + '/manifest.webmanifest',
  base + '/Daily_eyedrops192.png',
  base + '/Daily_eyedrops512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log('Precache error:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // GETリクエスト以外、API、外部ドメインはキャッシュ対象外にして即時fetch
  if (
    event.request.method !== 'GET' || 
    url.pathname.startsWith(base + '/api') || 
    !url.origin.startsWith(self.location.origin)
  ) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return caches.match(base + '/');
        });
      })
  );
});
