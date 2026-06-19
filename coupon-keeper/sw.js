const CACHE = 'ck-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  // Force pre-caching of all the new assets (including the new icons and HTML) immediately
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  self.clients.claim();
  // Delete the old 'ck-v1' cache that is clinging to the old generated icons
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => {
    if (r) return r;
    return fetch(e.request).then(res => {
      if (res.ok) {
        const c = res.clone();
        caches.open(CACHE).then(ca => ca.put(e.request, c));
      }
      return res;
    }).catch(() => caches.match(e.request) || new Response('Offline', { status: 503, statusText: 'Offline' }));
  }));
});