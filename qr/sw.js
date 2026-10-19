/* QR Generator PWA: offline assets + local-only Web Share Target. */
'use strict';

const CACHE_PREFIX = 'qr-generator-';
const CACHE_NAME = 'qr-generator-v1';
const CORE_ASSETS = [
  './', './index.html', './app.js', './vendor/qrcode.js',
  './manifest.webmanifest', './icons/icon.svg',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './ios-shortcut.html'
];
const HOME = new URL('./', self.registration.scope);
const SHARE_PATH = new URL('./share', self.registration.scope).pathname;
const MAX_SHARE_LENGTH = 12000; // Allow input, but the editor enforces QR capacity.

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

function getString(data, key) {
  const value = data.get(key);
  return typeof value === 'string' ? value.slice(0, MAX_SHARE_LENGTH) : '';
}

function sharePayload(form) {
  const url = getString(form, 'url').trim();
  const text = getString(form, 'text');
  const title = getString(form, 'title');
  if (url) return {type: 'link', data: url};
  const trimmed = text.trim();
  // Some Android apps put the whole link in the text field.
  if (/^(https?:\/\/|mailto:|tel:)\S+$/i.test(trimmed)) {
    return {type: 'link', data: trimmed};
  }
  return {type: 'text', data: text || title};
}

function shareRedirect(payload) {
  const fragment = new URLSearchParams({
    type: payload.type,
    data: payload.data
  });
  const target = new URL(HOME.href);
  target.hash = fragment.toString();
  // A redirect with #... keeps data out of the subsequent HTTP request.
  return Response.redirect(target.href, 303);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== HOME.origin || !url.pathname.startsWith(HOME.pathname)) return;

  if (url.pathname === SHARE_PATH && request.method === 'POST') {
    event.respondWith((async () => {
      try {
        return shareRedirect(sharePayload(await request.formData()));
      } catch (_) {
        // On malformed shares, open an empty text field instead.
        return shareRedirect({type: 'text', data: ''});
      }
    })());
    return;
  }

  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      // GET /share is not a normal page. Redirect to the generator.
      if (url.pathname === SHARE_PATH) return Response.redirect(HOME.href, 302);
      try {
        const fresh = await fetch(request);
        if (fresh.ok) return fresh;
      } catch (_) { /* offline; use the installed shell */ }
      return await caches.match('./index.html') || Response.error();
    })());
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
