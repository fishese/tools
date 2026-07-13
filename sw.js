const CACHE = 'sushi-split-v2';
const CACHE_PREFIX = 'sushi-split-';
const ASSETS = [
  './sushi-split.html',
  './manifest.json',
  './icon.svg'
];

// Cache all assets on install
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

// Remove only our own old cache versions — never wipe other apps (e.g. cartulator)
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Cache-first: serve from cache, fall back to network
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
