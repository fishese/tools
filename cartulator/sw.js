/* Service worker: cache the app shell so it runs fully offline once installed.
   Bump CACHE when you change any cached file to force an update. */
const CACHE = 'sdc-v4';
const CACHE_PREFIX = 'sdc-';
const ASSETS = [
  './index.html',
  './calc.js',
  './manifest.webmanifest',
  './icons/favicon.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k.startsWith(CACHE_PREFIX) && k !== CACHE; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});
function offlineShell(){
  return caches.match('./index.html').then(function(r){
    return r || caches.match('index.html').then(function(r2){
      return r2 || new Response('<!DOCTYPE html><title>Offline</title><p>Cartulator unavailable offline.</p>', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    });
  });
}

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(function(cached){
      if(cached) return cached;
      return fetch(e.request).then(function(resp){
        // Only cache successful same-origin basic responses
        if(resp && resp.ok && resp.type === 'basic'){
          var copy = resp.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        }
        return resp;
      }).catch(function(){
        if(e.request.mode === 'navigate' || (e.request.headers.get('accept') || '').indexOf('text/html') !== -1){
          return offlineShell();
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
