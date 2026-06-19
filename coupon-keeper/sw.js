const CACHE = 'ck-v1';
const CDN = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(CDN.map(u => c.add(u)))));
});

self.addEventListener('activate', e => {
  self.clients.claim();
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