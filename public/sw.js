// Minimal Service Worker to satisfy PWA installation criteria
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // We can just perform network-first or pass-through for simplicity
  event.respondWith(fetch(event.request));
});
